import { chmodSync, lstatSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/** Backups may contain guild configuration, so keep them private by default. */
export const BACKUP_FILE_MODE = 0o600;

function assertDestinationAbsent(destination: string): void {
  try {
    lstatSync(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`backup destination already exists: ${destination}`);
}

/**
 * Writes a consistent snapshot of `db` to `destination` with SQLite's
 * `VACUUM INTO`, which includes committed WAL frames and works while the bot is
 * running. The path is bound as a parameter, an existing file (or symlink) is
 * refused instead of overwritten, missing parent directories are created, and
 * the result is chmodded to 0600.
 *
 * Returns the snapshot size in bytes.
 */
export function snapshotDatabase(db: DatabaseSync, destination: string): number {
  if (typeof destination !== 'string' || destination.trim() === '') {
    throw new Error('backup destination must be a non-empty path');
  }
  if (destination.includes('\u0000')) {
    throw new Error('backup destination must not contain NUL');
  }
  if (destination === ':memory:') {
    throw new Error('backup destination must be a file path');
  }
  assertDestinationAbsent(destination);
  mkdirSync(dirname(destination), { recursive: true });
  db.prepare('VACUUM INTO ?').run(destination);
  chmodSync(destination, BACKUP_FILE_MODE);
  return statSync(destination).size;
}
