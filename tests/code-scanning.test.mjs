// Keeps code scanning enabled. KodYazar-Bot is the only active repo in the
// ecosystem without it, and main accepts merges with no required status check,
// so these invariants must fail the repo-hygiene job instead of regressing
// silently. Static assertions only: no network, no CodeQL CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = join('.github', 'workflows', 'codeql.yml');
const workflowExists = existsSync(join(root, WORKFLOW));
const workflow = workflowExists ? readFileSync(join(root, WORKFLOW), 'utf8') : '';
const security = readFileSync(join(root, 'SECURITY.md'), 'utf8');

test('the CodeQL workflow exists', () => {
  assert.ok(workflowExists, `${WORKFLOW} is missing; code scanning must stay enabled`);
  assert.match(workflow, /^name:\s*CodeQL\s*$/m, 'the workflow must stay named CodeQL');
});

test('code scanning runs on push and pull_request to main and repeats weekly', () => {
  assert.match(workflow, /^\s{2}push:\s*$/m, 'push must stay a trigger');
  assert.match(workflow, /^\s{2}pull_request:\s*$/m, 'pull_request must stay a trigger');
  assert.match(workflow, /^\s{2}schedule:\s*$/m, 'a weekly schedule must stay configured');
  assert.match(workflow, /cron:\s*'[^']+'/, 'the schedule needs a cron expression');

  const branchFilters = workflow.match(/branches:\s*\[[^\]]*\]/g) ?? [];
  assert.ok(branchFilters.length >= 2, 'push and pull_request must each filter branches');
  for (const filter of branchFilters) {
    assert.match(filter, /\bmain\b/, 'every trigger must target main');
  }
});

test('the workflow keeps least-privilege permissions with only security-events: write', () => {
  assert.match(workflow, /security-events:\s*write/, 'SARIF upload needs security-events: write');
  assert.match(workflow, /contents:\s*read/, 'contents access must stay read-only');
  assert.match(workflow, /actions:\s*read/, 'actions access must stay read-only');
  assert.doesNotMatch(workflow, /permissions:\s*write-all/, 'never grant write-all');
  assert.doesNotMatch(workflow, /^\s{2}permissions:\s*$/m, 'the analyze job must scope its own permissions');
});

test('the analysis targets javascript-typescript under the ecosystem check name', () => {
  assert.match(workflow, /language:\s*\[javascript-typescript\]/, 'the matrix must scan javascript-typescript');
  assert.match(
    workflow,
    /name:\s*Analyze \(\$\{\{\s*matrix\.language\s*\}\}\)/,
    'the job name must render as Analyze (javascript-typescript)',
  );
  assert.match(
    workflow,
    /category:\s*\/language:\$\{\{\s*matrix\.language\s*\}\}/,
    'the category must group SARIF per language',
  );
});

test('the CodeQL action is pinned to the current major and never a moving ref', () => {
  assert.match(workflow, /github\/codeql-action\/init@v4\b/, 'init must stay pinned to v4');
  assert.match(workflow, /github\/codeql-action\/analyze@v4\b/, 'analyze must stay pinned to v4');
  assert.doesNotMatch(
    workflow,
    /github\/codeql-action\/(init|analyze)@(main|master|latest)\b/,
    'never track a moving branch for the code scanning action',
  );
});

test('the workflow uses the repository concurrency policy', () => {
  assert.match(workflow, /^concurrency:/m, 'a concurrency group must stay configured');
  assert.match(workflow, /cancel-in-progress:\s*true/, 'superseded scans must cancel');
});

test('SECURITY.md tells reporters that code scanning runs', () => {
  assert.match(security, /CodeQL/i, 'SECURITY.md must document the code scanning setup');
});
