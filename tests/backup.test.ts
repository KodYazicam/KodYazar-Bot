import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { snapshotDatabase } from '../src/backup.js';
import { openDatabase, openGuildSettingsStore, SCHEMA_VERSION } from '../src/db.js';

const GUILD = '123456789012345678';
const CLI = fileURLToPath(new URL('../src/backup-cli.js', import.meta.url));

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'kodyazar-backup-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('snapshots a live WAL database into a standalone, private file', () => {
  withTempDir((dir) => {
    const source = join(dir, 'kodyazar.sqlite');
    const destination = join(dir, 'nested', 'snapshot.sqlite');
    const db = openDatabase(source);
    const store = openGuildSettingsStore(db);
    try {
      store.set(GUILD, 'prefix', '!');
      const bytes = snapshotDatabase(db, destination);

      // The source stays open and writable: the snapshot is consistent at the
      // moment VACUUM INTO ran, not at close time.
      store.set(GUILD, 'prefix', '?');
      assert.ok(bytes > 0);
      assert.equal(existsSync(destination), true);
      assert.equal(statSync(destination).mode & 0o777, 0o600);

      const snapshot = new DatabaseSync(destination);
      try {
        const integrity = snapshot.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
        const version = snapshot.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number };
        const row = snapshot.prepare('SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?').get(GUILD, 'prefix') as { value: string };
        assert.equal(integrity.integrity_check, 'ok');
        assert.equal(version.v, SCHEMA_VERSION);
        assert.equal(row.value, '!');
      } finally {
        snapshot.close();
      }

      assert.equal(store.get(GUILD, 'prefix'), '?');
    } finally {
      store.close();
    }
  });
});

test('refuses to overwrite an existing file or a dangling symlink', () => {
  withTempDir((dir) => {
    const db = openDatabase(':memory:');
    try {
      const existing = join(dir, 'existing.sqlite');
      writeFileSync(existing, 'keep this');
      assert.throws(() => snapshotDatabase(db, existing), /already exists/);
      assert.equal(readFileSync(existing, 'utf8'), 'keep this');

      const target = join(dir, 'target.sqlite');
      const link = join(dir, 'dangling.sqlite');
      symlinkSync(target, link);
      assert.throws(() => snapshotDatabase(db, link), /already exists/);
      assert.equal(existsSync(target), false);
    } finally {
      db.close();
    }
  });
});

test('rejects empty, in-memory, and NUL destinations', () => {
  withTempDir((dir) => {
    const db = openDatabase(':memory:');
    try {
      for (const destination of ['', '   ', ':memory:']) {
        assert.throws(() => snapshotDatabase(db, destination), /destination/);
      }
      assert.throws(() => snapshotDatabase(db, join(dir, 'bad\u0000name')), /NUL/);
    } finally {
      db.close();
    }
  });
});

test('CLI writes a snapshot, reports its size, and exits 0', () => {
  withTempDir((dir) => {
    const source = join(dir, 'source.sqlite');
    const destination = join(dir, 'cli', 'snapshot.sqlite');
    const db = openDatabase(source);
    const store = openGuildSettingsStore(db);
    try {
      store.set(GUILD, 'prefix', '!');
    } finally {
      store.close();
    }

    const result = spawnSync(process.execPath, [CLI, source, destination], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim()) as { status: string; destination: string; bytes: number };
    assert.deepEqual({ status: output.status, destination: output.destination }, { status: 'ok', destination });
    assert.equal(output.bytes, statSync(destination).size);

    const reopened = openDatabase(destination);
    try {
      assert.equal(openGuildSettingsStore(reopened).get(GUILD, 'prefix'), '!');
    } finally {
      reopened.close();
    }
  });
});

test('CLI fails with a readable message for bad arguments, missing source, and existing destination', () => {
  withTempDir((dir) => {
    const missing = spawnSync(process.execPath, [CLI], { encoding: 'utf8', timeout: 5000 });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /usage:/);

    const source = join(dir, 'missing.sqlite');
    const destination = join(dir, 'snapshot.sqlite');
    const notFound = spawnSync(process.execPath, [CLI, source, destination], { encoding: 'utf8', timeout: 5000 });
    assert.equal(notFound.status, 1);
    assert.match(notFound.stderr, /source database not found/);
    assert.equal(existsSync(destination), false);

    const db = openDatabase(source);
    db.close();
    writeFileSync(destination, 'keep this');
    const existing = spawnSync(process.execPath, [CLI, source, destination], { encoding: 'utf8', timeout: 5000 });
    assert.equal(existing.status, 1);
    assert.match(existing.stderr, /already exists/);
    assert.equal(readFileSync(destination, 'utf8'), 'keep this');

    const inMemory = spawnSync(process.execPath, [CLI, ':memory:', destination], { encoding: 'utf8', timeout: 5000 });
    assert.equal(inMemory.status, 1);
    assert.match(inMemory.stderr, /regular file/);
  });
});
