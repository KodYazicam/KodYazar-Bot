import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { type GuildSettingsStore, openGuildSettingsStore } from './db.js';
import { exportSettings, importSettings, parseSettingsDocument, serialiseSettings } from './settings-file.js';

export const SETTINGS_USAGE = `usage:
  node dist/src/settings-cli.js export [--database <path>] [--out <file>] [--guild <id> ...]
  node dist/src/settings-cli.js import [--database <path>] [--in <file>] [--dry-run]`;

export interface ExportArgs {
  database?: string;
  out?: string;
  guilds: string[];
}

function valueAfter(argv: readonly string[], index: number, option: string): string {
  const value = argv[index];
  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

/** Parses the small, deliberately explicit command line; no shell-style flags. */
export function parseExportArgs(argv: readonly string[]): ExportArgs {
  const [command, ...rest] = argv;
  if (command !== 'export') throw new Error('expected export');
  const args: ExportArgs = { guilds: [] };

  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index] as string;
    if (option === '--database') {
      args.database = valueAfter(rest, ++index, option);
    } else if (option === '--out') {
      args.out = valueAfter(rest, ++index, option);
    } else if (option === '--guild') {
      args.guilds.push(valueAfter(rest, ++index, option));
    } else {
      throw new Error(`unknown option: ${option}`);
    }
  }
  return args;
}

export interface ImportArgs {
  database?: string;
  /** Document file; stdin when omitted. */
  input?: string;
  dryRun: boolean;
}

/** Parses the import command line; validation happens before any database work. */
export function parseImportArgs(argv: readonly string[]): ImportArgs {
  const args: ImportArgs = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index] as string;
    if (option === '--database') {
      args.database = valueAfter(argv, ++index, option);
    } else if (option === '--in') {
      args.input = valueAfter(argv, ++index, option);
    } else if (option === '--dry-run') {
      args.dryRun = true;
    } else {
      throw new Error(`unknown option: ${option}`);
    }
  }
  return args;
}

function databasePath(database: string | undefined): string {
  if (database !== undefined) {
    if (database === ':memory:') throw new Error('database must be a file path');
    return database;
  }
  const dataDir = (process.env.DATA_DIR ?? '').trim() || './data';
  if (dataDir === ':memory:') throw new Error('DATA_DIR must be a directory');
  return join(dataDir, 'kodyazar.sqlite');
}

function assertDatabaseFile(database: string): void {
  try {
    if (!statSync(database).isFile()) throw new Error('database must be a regular file');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`database not found: ${database}`);
    }
    throw error;
  }
}

function writeOutput(path: string | undefined, text: string): void {
  if (path === undefined) {
    process.stdout.write(text);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  // `wx` refuses to overwrite atomically; settings exports are sensitive and a
  // stale file is worse than an explicit failure.
  writeFileSync(path, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  chmodSync(path, 0o600);
}

function openStore(database: string, readOnly: boolean): GuildSettingsStore {
  const db = new DatabaseSync(database, { readOnly });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    return openGuildSettingsStore(db);
  } catch (error) {
    db.close();
    throw error;
  }
}

function readInput(path: string | undefined): string {
  if (path !== undefined) return readFileSync(path, 'utf8');
  if (process.stdin.isTTY === true) throw new Error('--in is required when stdin is a terminal');
  // fd 0 keeps the document out of argv and shell history.
  return readFileSync(0, 'utf8');
}

function runImport(argv: readonly string[]): number {
  let args: ImportArgs;
  try {
    args = parseImportArgs(argv);
  } catch (error) {
    process.stderr.write(`settings failed: ${error instanceof Error ? error.message : 'invalid arguments'}\n`);
    process.stderr.write(`${SETTINGS_USAGE}\n`);
    return 1;
  }

  let store: GuildSettingsStore | undefined;
  try {
    const document = parseSettingsDocument(readInput(args.input));
    const database = databasePath(args.database);
    assertDatabaseFile(database);
    // A dry run opens read-only, so an accidental write fails instead of
    // touching the operator's database.
    store = openStore(database, args.dryRun);
    const summary = importSettings(store, document, { dryRun: args.dryRun });
    process.stdout.write(`${JSON.stringify({
      status: 'ok',
      guilds: summary.guilds,
      settings: summary.settings,
      dry_run: summary.dryRun,
    })}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`settings failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    return 1;
  } finally {
    try {
      store?.close();
    } catch {
      // The import result is already on stdout; a close error must not hide it.
    }
  }
}

/** Runs one export and returns its exit code. Separated from the direct-run guard. */
export function runSettingsCli(argv: readonly string[]): number {
  if (argv.length === 0) {
    process.stderr.write(`${SETTINGS_USAGE}\n`);
    return 1;
  }
  if (argv[0] === 'import') return runImport(argv.slice(1));

  let args: ExportArgs;
  try {
    args = parseExportArgs(argv);
  } catch (error) {
    process.stderr.write(`settings failed: ${error instanceof Error ? error.message : 'invalid arguments'}\n`);
    process.stderr.write(`${SETTINGS_USAGE}\n`);
    return 1;
  }

  let store: GuildSettingsStore | undefined;
  try {
    const database = databasePath(args.database);
    assertDatabaseFile(database);
    store = openStore(database, true);
    const document = exportSettings(store, { guildIds: args.guilds.length > 0 ? args.guilds : undefined });
    writeOutput(args.out, serialiseSettings(document));
    if (args.out !== undefined) {
      const settings = Object.values(document.guilds)
        .reduce((total, values) => total + Object.keys(values).length, 0);
      process.stdout.write(`${JSON.stringify({
        status: 'ok',
        guilds: Object.keys(document.guilds).length,
        settings,
        out: args.out,
      })}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`settings failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    return 1;
  } finally {
    try {
      store?.close();
    } catch {
      // The export is already on disk; a close error must not hide success.
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runSettingsCli(process.argv.slice(2));
}
