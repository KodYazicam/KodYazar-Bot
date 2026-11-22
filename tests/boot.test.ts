import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ENTRY = fileURLToPath(new URL('../src/index.js', import.meta.url));
const ENV_FLAG = '--env-file-if-exists=.env';

function withTempDir(run: (dir: string) => void, dotenv?: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'kodyazar-boot-'));
  try {
    if (dotenv !== undefined) writeFileSync(join(dir, '.env'), dotenv);
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function boot(dir: string, env: NodeJS.ProcessEnv, args: readonly string[] = []) {
  return spawnSync(process.execPath, [...args, ENTRY], {
    cwd: dir,
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
    timeout: 5000,
  });
}

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

test('npm start loads .env so the documented source deploy reaches config validation', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  assert.match(
    pkg.scripts?.start ?? '',
    /^node --env-file-if-exists=\.env dist\/src\/index\.js$/,
    'npm start must read .env; the README and runbook both tell operators to create one',
  );
});

test('the .env flag feeds TOKEN and CLIENT_ID to the boot path', () => {
  withTempDir((dir) => {
    const result = boot(dir, {}, [ENV_FLAG]);
    assert.equal(result.status, 1);
    // The file supplied TOKEN, so the failure has moved on to the bad CLIENT_ID.
    assert.match(result.stderr, /CLIENT_ID/);
    assert.equal(result.stderr.includes('dotenv-secret-value'), false);
  }, 'TOKEN=dotenv-secret-value\nCLIENT_ID=not-a-snowflake\n');
});

test('a missing .env is ignored instead of failing the boot', () => {
  withTempDir((dir) => {
    const result = boot(dir, { TOKEN: 'super-secret-value', CLIENT_ID: 'bad' }, [ENV_FLAG]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CLIENT_ID/);
    assert.equal(result.stderr.includes('super-secret-value'), false);
  });
});
