import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openDatabase, openGuildSettingsStore } from '../src/db.js';

const CLI = fileURLToPath(new URL('../src/settings-cli.js', import.meta.url));
const GUILD_A = '123456789012345678';
const GUILD_B = '987654321098765432';

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'kodyazar-settings-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function seed(file: string): void {
  const store = openGuildSettingsStore(openDatabase(file));
  try {
    store.set(GUILD_A, 'prefix', '!');
    store.set(GUILD_A, 'welcome_channel', '111111111111111111');
    store.set(GUILD_B, 'prefix', '?');
  } finally {
    store.close();
  }
}

function run(args: readonly string[], env: NodeJS.ProcessEnv = {}): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    // Deliberately no TOKEN: exporting settings must not need the bot token.
    env: { PATH: process.env.PATH ?? '', ...env },
  });
}

test('exports all guilds to a private file and prints a summary', () => {
  withTempDir((dir) => {
    const database = join(dir, 'data', 'kodyazar.sqlite');
    seed(database);
    const out = join(dir, 'settings.json');

    const result = run(['export', '--database', database, '--out', out]);
    assert.equal(result.status, 0, String(result.stderr));
    const exported = JSON.parse(readFileSync(out, 'utf8')) as {
      format: string; version: number; guilds: Record<string, Record<string, string>>;
    };
    assert.equal(exported.format, 'kodyazar-bot/settings');
    assert.equal(exported.version, 1);
    assert.deepEqual(Object.keys(exported.guilds), [GUILD_A, GUILD_B]);
    assert.equal(statSync(out).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(String(result.stdout)), { status: 'ok', guilds: 2, settings: 3, out });
  });
});

test('refuses to overwrite an existing export file', () => {
  withTempDir((dir) => {
    const database = join(dir, 'kodyazar.sqlite');
    seed(database);
    const out = join(dir, 'settings.json');
    assert.equal(run(['export', '--database', database, '--out', out]).status, 0);
    const before = readFileSync(out, 'utf8');

    const second = run(['export', '--database', database, '--out', out]);
    assert.equal(second.status, 1);
    assert.match(String(second.stderr), /EEXIST|already exists/);
    assert.equal(readFileSync(out, 'utf8'), before);
  });
});

test('exports only the selected guild and uses DATA_DIR when --database is omitted', () => {
  withTempDir((dir) => {
    const dataDir = join(dir, 'envdata');
    seed(join(dataDir, 'kodyazar.sqlite'));
    const result = run(['export', '--guild', GUILD_B], { DATA_DIR: dataDir });
    assert.equal(result.status, 0, String(result.stderr));
    const exported = JSON.parse(String(result.stdout)) as { guilds: Record<string, unknown> };
    assert.deepEqual(Object.keys(exported.guilds), [GUILD_B]);
  });
});


