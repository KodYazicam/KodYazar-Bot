import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

function run(
  args: readonly string[],
  env: NodeJS.ProcessEnv = {},
  input?: string,
): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    input,
    // Deliberately no TOKEN: settings commands must not need the bot token.
    env: { PATH: process.env.PATH ?? '', ...env },
  });
}

function document(guilds: Record<string, Record<string, string>>) {
  return {
    format: 'kodyazar-bot/settings',
    version: 1,
    exported_at: '2026-11-23T00:00:00.000Z',
    guilds,
  };
}

function values(file: string): Record<string, Record<string, string>> {
  const store = openGuildSettingsStore(openDatabase(file));
  try {
    return { [GUILD_A]: store.list(GUILD_A), [GUILD_B]: store.list(GUILD_B) };
  } finally {
    store.close();
  }
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

test('import merges a document, overwrites present keys, and keeps other rows', () => {
  withTempDir((dir) => {
    const database = join(dir, 'kodyazar.sqlite');
    seed(database);
    const store = openGuildSettingsStore(openDatabase(database));
    try {
      store.set(GUILD_A, 'other', 'keep');
      store.set(GUILD_B, 'keep_me', 'yes');
    } finally {
      store.close();
    }
    const file = join(dir, 'import.json');
    writeFileSync(file, JSON.stringify(document({
      [GUILD_A]: { prefix: '$', log_channel: '222222222222222222' },
      [GUILD_B]: { prefix: '?' },
    })));

    const result = run(['import', '--database', database, '--in', file]);
    assert.equal(result.status, 0, String(result.stderr));
    assert.deepEqual(JSON.parse(String(result.stdout)), {
      status: 'ok',
      guilds: 2,
      settings: 3,
      dry_run: false,
    });
    assert.deepEqual(values(database), {
      [GUILD_A]: {
        log_channel: '222222222222222222',
        other: 'keep',
        prefix: '$',
        welcome_channel: '111111111111111111',
      },
      [GUILD_B]: { keep_me: 'yes', prefix: '?' },
    });
  });
});

test('import --dry-run validates and counts without writing and uses a read-only database', () => {
  withTempDir((dir) => {
    const database = join(dir, 'kodyazar.sqlite');
    seed(database);
    const before = values(database);
    const file = join(dir, 'import.json');
    writeFileSync(file, JSON.stringify(document({
      [GUILD_A]: { prefix: '$', log_channel: '222222222222222222' },
    })));

    const result = run(['import', '--database', database, '--in', file, '--dry-run']);
    assert.equal(result.status, 0, String(result.stderr));
    assert.deepEqual(JSON.parse(String(result.stdout)), {
      status: 'ok',
      guilds: 1,
      settings: 2,
      dry_run: true,
    });
    assert.deepEqual(values(database), before);
  });
});

test('import reads a valid document from stdin when --in is omitted', () => {
  withTempDir((dir) => {
    const database = join(dir, 'kodyazar.sqlite');
    seed(database);
    const result = run(
      ['import', '--database', database],
      {},
      JSON.stringify(document({ [GUILD_A]: { prefix: 'stdin' } })),
    );
    assert.equal(result.status, 0, String(result.stderr));
    assert.equal(JSON.parse(String(result.stdout)).dry_run, false);
    assert.equal(values(database)[GUILD_A]?.prefix, 'stdin');
    assert.equal(values(database)[GUILD_A]?.welcome_channel, '111111111111111111');
  });
});

test('import rejects an invalid document before writing and never echoes a value', () => {
  withTempDir((dir) => {
    const database = join(dir, 'kodyazar.sqlite');
    seed(database);
    const before = values(database);
    const secret = 'super-secret-value';
    const file = join(dir, 'bad.json');
    writeFileSync(file, JSON.stringify(document({
      [GUILD_A]: { prefix: 'changed' },
      [GUILD_B]: { Bad: secret },
    })));

    const result = run(['import', '--database', database, '--in', file]);
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /key is invalid/);
    assert.equal(String(result.stderr).includes(secret), false);
    assert.deepEqual(values(database), before);
  });
});

test('import rejects malformed JSON, NUL, and oversized values without echoing them', () => {
  withTempDir((dir) => {
    const database = join(dir, 'kodyazar.sqlite');
    seed(database);
    const before = values(database);
    const secret = 'super-secret-value';
    const cases = [
      [`{"format":"kodyazar-bot/settings","version":1,"guilds":{"${GUILD_A}":{"prefix":"${secret}"`, /not valid JSON/],
      [JSON.stringify(document({ [GUILD_A]: { prefix: `${secret}\u0000` } })), /NUL/],
      [JSON.stringify(document({ [GUILD_A]: { prefix: secret.repeat(5000) } })), /65536/],
      [JSON.stringify({ ...document({}), version: 2 }), /version must be 1/],
    ] as const;

    for (const [input, expected] of cases) {
      const result = run(['import', '--database', database, '--dry-run'], {}, input);
      assert.equal(result.status, 1);
      assert.match(String(result.stderr), expected);
      assert.equal(String(result.stderr).includes(secret), false);
    }
    assert.deepEqual(values(database), before);
  });
});

test('import reports a missing database instead of creating one', () => {
  withTempDir((dir) => {
    const result = run(
      ['import', '--database', join(dir, 'missing.sqlite')],
      {},
      JSON.stringify(document({})),
    );
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /database not found/);
    assert.equal(existsSync(join(dir, 'missing.sqlite')), false);
  });
});


