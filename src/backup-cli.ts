import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { snapshotDatabase } from './backup.js';

export const BACKUP_USAGE = 'usage: node dist/src/backup-cli.js <source-db> <destination-file>';

function assertSourceFile(source: string): void {
  if (source === ':memory:') throw new Error('source database must be a file');
  if (!statSync(source).isFile()) throw new Error('source database must be a file');
}

/**
 * Runs the backup command and returns the process exit code. Separated from the
 * direct-execution guard so tests can exercise argument and error handling
 * without spawning a shell.
 */
export function runBackupCli(argv: readonly string[]): number {
  if (argv.length !== 2) {
    process.stderr.write(`${BACKUP_USAGE}\n`);
    return 1;
  }
  const source = argv[0] as string;
  const destination = argv[1] as string;
  try {
    assertSourceFile(source);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    const detail = missing ? `source database not found: ${source}` : `source database must be a regular file: ${source}`;
    process.stderr.write(`backup failed: ${detail}\n`);
    return 1;
  }

  let db: DatabaseSync | undefined;
  try {
    // Open read-write so SQLite can recover a hot journal or WAL left by a
    // previous crash; the command itself only reads the source database.
    db = new DatabaseSync(source);
    db.exec('PRAGMA busy_timeout = 5000');
    const bytes = snapshotDatabase(db, destination);
    process.stdout.write(`${JSON.stringify({ status: 'ok', destination, bytes })}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`backup failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    return 1;
  } finally {
    try {
      db?.close();
    } catch {
      // The snapshot is already durable; a close error must not hide success.
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runBackupCli(process.argv.slice(2));
}
