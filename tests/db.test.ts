import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openDatabase, openGuildSettingsStore, SCHEMA_VERSION } from '../src/db.js';

const GUILD_A = '123456789012345678';
const GUILD_B = '987654321098765432';

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'kodyazar-db-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function migrationRows(db: ReturnType<typeof openDatabase>): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number };
  return row.n;
}

test('creates the parent directory and applies the v1 migration exactly once', () => {
  withTempDir((dir) => {
    const file = join(dir, 'nested', 'kodyazar.sqlite');
    const first = openDatabase(file);
    assert.equal(existsSync(file), true);
    assert.equal(migrationRows(first), 1);
    first.close();

    const second = openDatabase(file);
    assert.equal(migrationRows(second), 1);
    const version = second.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number };
    assert.equal(version.v, SCHEMA_VERSION);
    second.close();
  });
});

test('enables WAL for file-backed databases', () => {
  withTempDir((dir) => {
    const db = openDatabase(join(dir, 'wal.sqlite'));
    const mode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    assert.equal(mode.journal_mode, 'wal');
    db.close();
  });
});

test('stores, lists, overwrites, and removes settings per guild', () => {
  const db = openDatabase(':memory:');
  let clock = 1_000;
  const store = openGuildSettingsStore(db, { now: () => clock });
  try {
    store.set(GUILD_A, 'prefix', '!');
    store.set(GUILD_A, 'welcome_channel', '111111111111111111');
    store.set(GUILD_B, 'prefix', '?');

    assert.equal(store.get(GUILD_A, 'prefix'), '!');
    assert.equal(store.get(GUILD_B, 'prefix'), '?');
    assert.deepEqual(store.list(GUILD_A), { prefix: '!', welcome_channel: '111111111111111111' });
    assert.deepEqual(store.list(GUILD_B), { prefix: '?' });

    clock = 2_000;
    store.set(GUILD_A, 'prefix', '$');
    assert.equal(store.get(GUILD_A, 'prefix'), '$');
    const row = db.prepare('SELECT updated_at FROM guild_settings WHERE guild_id = ? AND key = ?').get(GUILD_A, 'prefix') as { updated_at: number };
    assert.equal(row.updated_at, 2_000);

    assert.equal(store.remove(GUILD_A, 'prefix'), true);
    assert.equal(store.get(GUILD_A, 'prefix'), null);
    assert.equal(store.remove(GUILD_A, 'prefix'), false);

    assert.equal(store.get(GUILD_A, 'missing'), null);
    assert.deepEqual(store.list('111111111111111111'), {});
  } finally {
    store.close();
  }
});

test('persists settings across close and reopen', () => {
  withTempDir((dir) => {
    const file = join(dir, 'persist.sqlite');
    const first = openGuildSettingsStore(openDatabase(file));
    first.set(GUILD_A, 'log_channel', '222222222222222222');
    first.close();

    const second = openGuildSettingsStore(openDatabase(file));
    try {
      assert.equal(second.get(GUILD_A, 'log_channel'), '222222222222222222');
    } finally {
      second.close();
    }
  });
});

test('rejects invalid guild ids, keys, and values without echoing them', () => {
  const db = openDatabase(':memory:');
  const store = openGuildSettingsStore(db);
  try {
    for (const guildId of ['not-a-guild', '123', '1'.repeat(21)]) {
      assert.throws(() => store.get(guildId, 'prefix'), /guild id/i);
    }
    for (const key of ['Prefix', '__proto__', 'a'.repeat(65), '']) {
      assert.throws(() => store.set(GUILD_A, key, 'x'), /setting key/i);
    }
    assert.throws(() => store.set(GUILD_A, 'prefix', undefined as unknown as string), /string/i);

    const huge = 'x'.repeat(64 * 1024 + 1);
    assert.throws(
      () => store.set(GUILD_A, 'prefix', huge),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /65536/);
        assert.equal(error.message.includes('xxxx'), false);
        return true;
      },
    );
  } finally {
    store.close();
  }
});

test('lists the guilds that have settings, sorted by id', () => {
  const db = openDatabase(':memory:');
  const store = openGuildSettingsStore(db);
  try {
    assert.deepEqual(store.guildIds(), []);
    store.set(GUILD_B, 'prefix', '?');
    store.set(GUILD_A, 'prefix', '!');
    assert.deepEqual(store.guildIds(), [GUILD_A, GUILD_B]);
    store.remove(GUILD_A, 'prefix');
    assert.deepEqual(store.guildIds(), [GUILD_B]);
  } finally {
    store.close();
  }
});

test('SCHEMA_VERSION matches the highest applied migration', () => {
  const db = openDatabase(':memory:');
  try {
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number };
    assert.equal(row.v, SCHEMA_VERSION);
  } finally {
    db.close();
  }
});
