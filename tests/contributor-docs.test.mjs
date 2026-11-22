// Contributor docs drifted once the scaffold landed: CONTRIBUTING and the PR
// template still told people the npm test runner did not exist, and the
// changelog still claimed npm Dependabot was commented out. These static
// checks run in the repo-hygiene workflow, so the same drift fails CI.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('contributor docs describe the test runner that exists', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(typeof pkg.scripts?.test, 'string', 'package.json must keep a test script');

  const contributing = read('CONTRIBUTING.md');
  assert.match(contributing, /npm test/, 'CONTRIBUTING.md must name npm test');
  assert.doesNotMatch(
    contributing,
    /once the test runner exists|#1 adds the full npm test runner/i,
    'CONTRIBUTING.md must not describe the npm test runner as missing',
  );

  const template = read('.github/PULL_REQUEST_TEMPLATE.md');
  assert.match(template, /npm test/, 'the pull request template must name npm test');
  assert.doesNotMatch(
    template,
    /once the test runner exists/i,
    'the pull request template must not describe the npm test runner as missing',
  );
});

test('the changelog does not claim npm Dependabot is disabled while it is active', () => {
  const dependabot = read('.github/dependabot.yml');
  const npmActive = /^\s*-\s*package-ecosystem:\s*npm\s*$/m.test(dependabot);
  if (!npmActive) return;

  const changelog = read('CHANGELOG.md');
  assert.doesNotMatch(
    changelog,
    /npm`?\s+ecosystem is commented out/i,
    'CHANGELOG.md must not claim npm Dependabot is commented out while dependabot.yml enables it',
  );
});
