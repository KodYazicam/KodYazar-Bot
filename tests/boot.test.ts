import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ENTRY = fileURLToPath(new URL('../src/index.js', import.meta.url));

test('exits 1 on invalid config without echoing the token', () => {
  const result = spawnSync(process.execPath, [ENTRY], {
    env: { PATH: process.env.PATH ?? '', TOKEN: 'super-secret-value', CLIENT_ID: 'bad' },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CLIENT_ID/);
  assert.equal(result.stderr.includes('super-secret-value'), false);
});
