// Governance docs were copied between KodYazicam repositories, and the Code of
// Conduct kept the source repository's advisory URL. A conduct report sent to
// another project is easy to miss, so keep the private contact in this repo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const REPO = 'KodYazicam/KodYazar-Bot';

/** Repository slugs behind GitHub's private advisory form. */
function advisoryRepos(text) {
  return [...text.matchAll(/https:\/\/github\.com\/([^/\s)]+\/[^/\s)#]+)\/security\/advisories\/new/g)]
    .map((match) => match[1]);
}

test('the Code of Conduct sends enforcement reports to this repository', () => {
  assert.deepEqual(
    advisoryRepos(read('CODE_OF_CONDUCT.md')),
    [REPO],
    'CODE_OF_CONDUCT.md must link this repository\'s private advisory form',
  );
});

test('the security and conduct contacts point at the same repository', () => {
  const security = advisoryRepos(read('SECURITY.md'));
  const conduct = advisoryRepos(read('CODE_OF_CONDUCT.md'));
  assert.deepEqual(conduct, security, 'SECURITY.md and CODE_OF_CONDUCT.md must share the same private contact');
  assert.ok(security.every((repo) => repo === REPO), `the private contact must be ${REPO}`);
});
