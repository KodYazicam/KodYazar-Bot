import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Storage spine for the bot: a versioned SQLite database plus the per-guild
 * key/value settings every later feature area builds on.
 *
 * Node's built-in `node:sqlite` keeps the scaffold dependency-free and works in
 * the Alpine runtime image; see ROADMAP.md ("SQLite migrations").
 */

export const SCHEMA_VERSION = 1;
export const MAX_SETTING_VALUE_BYTES = 64 * 1024;

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'guild_settings',
    sql: `
      CREATE TABLE guild_settings (
        guild_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, key)
      );
      CREATE INDEX guild_settings_guild_idx ON guild_settings (guild_id);
    `,
  },
];

const GUILD_ID = /^\d{17,20}$/;
const SETTING_KEY = /^[a-z][a-z0-9_]{0,63}$/;

function assertGuildId(guildId: unknown): asserts guildId is string {
  if (typeof guildId !== 'string' || !GUILD_ID.test(guildId)) {
    throw new Error('guild id must be a Discord snowflake (17-20 digits)');
  }
}

function assertSettingKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || !SETTING_KEY.test(key)) {
    throw new Error('setting key must match ^[a-z][a-z0-9_]{0,63}$');
  }
}

function assertSettingValue(value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new Error('setting value must be a string');
  if (Buffer.byteLength(value, 'utf8') > MAX_SETTING_VALUE_BYTES) {
    throw new Error(`setting value must be at most ${MAX_SETTING_VALUE_BYTES} bytes`);
  }
}

/** Opens (and creates when needed) the database and brings the schema up to date. */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    migrate(db);
    return db;
  } catch (error) {
    // A database we refuse to open must not keep a WAL handle or a lock open.
    db.close();
    throw error;
  }
}

/**
 * Compares the recorded history with the migrations compiled into this build.
 * Refuses a database written by a newer build, an unknown version, or a
 * renamed applied migration, so an older binary never runs against a schema
 * it does not understand.
 */
function assertCompatibleHistory(db: DatabaseSync): Set<number> {
  const rows = db
    .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
    .all() as Array<{ version: number; name: string }>;
  const known = new Map(MIGRATIONS.map((migration) => [migration.version, migration.name]));

  for (const row of rows) {
    if (row.version > SCHEMA_VERSION) {
      throw new Error(
        `database schema version ${row.version} is newer than this build supports (${SCHEMA_VERSION}); upgrade the bot before opening this database`,
      );
    }
    const expected = known.get(row.version);
    if (expected === undefined) {
      throw new Error(
        `database schema history contains unknown migration version ${row.version}; restore a backup or use the build that wrote it`,
      );
    }
    if (expected !== row.name) {
      throw new Error(
        `database schema history was rewritten: migration ${row.version} is recorded under a different name than this build expects ("${expected}"); restore a backup or use a matching build`,
      );
    }
  }

  return new Set(rows.map((row) => row.version));
}

/** Applies pending migrations in order; each one commits or rolls back as a unit. */
export function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
  const applied = assertCompatibleHistory(db);
  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, Date.now());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export interface GuildSettingsStore {
  /** Returns the stored value, or null when the key is unset. */
  get(guildId: string, key: string): string | null;
  /** Inserts or overwrites one setting. */
  set(guildId: string, key: string, value: string): void;
  /** Returns true when a row was deleted. */
  remove(guildId: string, key: string): boolean;
  /** Returns every setting for one guild, keyed by name. */
  list(guildId: string): Record<string, string>;
  close(): void;
}

export interface GuildSettingsStoreOptions {
  /** Injectable clock keeps `updated_at` deterministic in tests. */
  now?: () => number;
}

export function openGuildSettingsStore(
  db: DatabaseSync,
  { now = Date.now }: GuildSettingsStoreOptions = {},
): GuildSettingsStore {
  const selectOne = db.prepare('SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?');
  const selectAll = db.prepare('SELECT key, value FROM guild_settings WHERE guild_id = ? ORDER BY key');
  const upsert = db.prepare(`
    INSERT INTO guild_settings (guild_id, key, value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const deleteOne = db.prepare('DELETE FROM guild_settings WHERE guild_id = ? AND key = ?');

  return {
    get(guildId, key) {
      assertGuildId(guildId);
      assertSettingKey(key);
      const row = selectOne.get(guildId, key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    set(guildId, key, value) {
      assertGuildId(guildId);
      assertSettingKey(key);
      assertSettingValue(value);
      upsert.run(guildId, key, value, now());
    },
    remove(guildId, key) {
      assertGuildId(guildId);
      assertSettingKey(key);
      const result = deleteOne.run(guildId, key);
      return Number(result.changes) > 0;
    },
    list(guildId) {
      assertGuildId(guildId);
      const rows = selectAll.all(guildId) as Array<{ key: string; value: string }>;
      const settings: Record<string, string> = {};
      for (const row of rows) settings[row.key] = row.value;
      return settings;
    },
    close() {
      db.close();
    },
  };
}
