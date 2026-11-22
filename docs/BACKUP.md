# Backups and restore

The bot keeps all persistent state in one SQLite database at
`DATA_DIR/kodyazar.sqlite` (default `./data/kodyazar.sqlite`). SQLite runs in WAL
mode, so the database file is not complete on its own while the bot is running:
the `-wal` and `-shm` sidecars are part of the same store.

Do **not** copy a live database with `cp`. Copying the main file without its WAL
can lose the most recent writes, and copying the three files one by one is not a
consistent snapshot.

## Take a snapshot

`src/backup.ts` uses SQLite's `VACUUM INTO`, which writes a transactionally
consistent copy, including committed WAL frames. It can run while the bot is
live. The command refuses to overwrite an existing file, creates the destination
directory, and sets the snapshot mode to `0600`.

From a source deploy, after `npm run build`:

```bash
mkdir -p backups
node dist/src/backup-cli.js \
  ./data/kodyazar.sqlite \
  "./backups/kodyazar-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
```

The command prints one JSON line and exits non-zero on failure:

```json
{"status":"ok","destination":"./backups/kodyazar-20261122T200000Z.sqlite","bytes":8192}
```

For the compose stack, write the snapshot inside the writable `bot-data` volume,
then copy it out:

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T bot \
  node dist/src/backup-cli.js \
  /app/data/kodyazar.sqlite \
  "/app/data/backups/kodyazar-$STAMP.sqlite"
docker compose cp \
  "bot:/app/data/backups/kodyazar-$STAMP.sqlite" \
  ./backups/
```

An existing destination is an error, never an overwrite:

```text
backup failed: backup destination already exists: ./backups/kodyazar.sqlite
```

## Verify a snapshot

`VACUUM INTO` writes a normal SQLite database. Check it before relying on it:

```bash
node --input-type=module -e "
  import { DatabaseSync } from 'node:sqlite';
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  console.log(db.prepare('PRAGMA integrity_check').get());
  console.log(db.prepare('SELECT MAX(version) AS schema_version FROM schema_migrations').get());
  db.close();
" ./backups/kodyazar-20261122T200000Z.sqlite
```

Expect `{ integrity_check: 'ok' }` (Node prints the object) and the schema
version reported in the bot's `storage ready` log line.

## Restore

A snapshot is a complete database, so restore is a file replacement while the
bot is stopped:

1. Stop the bot (`docker compose stop bot` or `sudo systemctl stop kodyazar-bot`).
2. Move the current `kodyazar.sqlite`, `kodyazar.sqlite-wal`, and
   `kodyazar.sqlite-shm` out of `DATA_DIR`; do not leave stale sidecars next to
   the restored file.
3. Copy the snapshot to `DATA_DIR/kodyazar.sqlite` and keep it owned by the bot
   user with mode `0600`.
4. Start the bot and confirm the `storage ready` line shows the expected
   `schema_version`, then confirm a known guild setting is still present.
5. If startup refuses the schema, restore a snapshot written by the currently
   deployed build instead of forcing a newer database onto an older binary.

## What is in a backup

The current schema stores per-guild key/value settings. A snapshot can therefore
contain guild IDs and configuration values such as channel IDs or messages.
Discord tokens are not stored in SQLite; they live in the environment, so a
snapshot does not contain the bot token. Treat backup files as sensitive
configuration anyway, keep the `0600` mode, and do not attach them to issues.

Scheduled backups, retention, offsite storage, encryption, and a portable
per-guild export/import format are not implemented. See
[ROADMAP.md](../ROADMAP.md).
