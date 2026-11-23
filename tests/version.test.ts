import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readPackageVersion, UNKNOWN_VERSION } from '../src/version.js';

const manifest = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

test('reads the version from the shipped package.json', () => {
  assert.equal(readPackageVersion(), manifest.version);
});

test('trims a version and falls back to unknown when the manifest is unusable', () => {
  assert.equal(readPackageVersion(() => JSON.stringify({ version: ' 2.3.4 ' })), '2.3.4');
  for (const body of ['{', '{}', '{"version":""}', '{"version":null}', '{"version":42}']) {
    assert.equal(readPackageVersion(() => body), UNKNOWN_VERSION, body);
  }
});

test('falls back instead of throwing when the manifest cannot be read', () => {
  assert.equal(
    readPackageVersion(() => {
      throw new Error('ENOENT');
    }),
    UNKNOWN_VERSION,
  );
});
