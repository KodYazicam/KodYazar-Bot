# KodYazar-Bot

All-in-one Discord server bot: announcements, backups, auto/reaction roles, temp voice, moderation, staff tracking, logging. Local-first, SQLite, TR/EN.

> **Status:** pre-release. The runnable scaffold is tracked in
> [#1](https://github.com/KodYazicam/KodYazar-Bot/issues/1); the runtime spine
> is [#8](https://github.com/KodYazicam/KodYazar-Bot/issues/8), the Discord
> connection plus `/ping` is [#12](https://github.com/KodYazicam/KodYazar-Bot/issues/12),
> and the redacting logger is [#16](https://github.com/KodYazicam/KodYazar-Bot/issues/16).

## Quick start

Requires Node.js 22.13 or newer (the bot uses the built-in `node:sqlite`
module) and `git` (the pinned `sparkcord` dependency is installed from a
commit). Run `npm ci`, copy `.env.example` to `.env`, fill `TOKEN`
and `CLIENT_ID`, then `npm run build && npm start`. On startup the bot registers
`/ping`, opens the gateway with the `GUILDS` intent only (no privileged intents),
and replies with heartbeat latency and process uptime; set `GUILD_ID` while
developing so the command appears immediately. The health server listens on
`PORT` (default 3000 when unset or empty; `0` picks an ephemeral port) and
`/healthz` returns
`{"status":"ok","uptime":<seconds>,"version":"<version>"}`; other paths return
404 and unsupported methods 405. `npm test` builds and runs the `node --test`
suite without a token or network. The token is never printed: the startup summary
masks it and validation errors name the variable only.

## Run with Docker

The image is multi-stage and runs as the unprivileged `bot` user; `tini` is PID 1
so SIGTERM reaches the bot, and the image health check calls `/healthz`.

```bash
cp .env.example .env    # fill TOKEN and CLIENT_ID
docker build -t kodyazar-bot .
docker run --rm --publish 3000:3000 --env-file .env kodyazar-bot
curl --fail http://127.0.0.1:3000/healthz
```

Or use the compose stack, which keeps `/app/data` in the `bot-data` named volume
and mounts the root filesystem read-only:

```bash
cp .env.example .env
docker compose up --build --detach
docker compose ps          # the bot service should report healthy
docker compose logs --follow bot
docker compose down        # add --volumes to delete the persisted data
```

`.env` never enters the image (`.dockerignore` excludes it); pass secrets with
`--env-file` or your orchestrator's secret store. CI builds the image, proves it
runs as `bot`, and waits for the container health check to report `healthy`.

## Storage

Persistent state lives in one SQLite database at `DATA_DIR/kodyazar.sqlite`
(`DATA_DIR` defaults to `./data`). It is created on first boot and migrated
forward-only; the schema version is logged once as `schema_version` in the
`storage ready` line. The Docker image and compose stack already keep
`/app/data` on the `bot-data` volume.

SQLite runs in WAL mode, so while the bot is running you will also see
`kodyazar.sqlite-wal` and `kodyazar.sqlite-shm` next to the database; treat all
three files as one unit. Do not copy a live database with `cp`: take a
consistent snapshot with the SQLite backup API (or
`VACUUM INTO '<backup-file>'`). Never store Discord tokens in this database —
bot tokens belong in the environment.

`src/db.ts` exposes `openDatabase()` (open + migrate) and
`openGuildSettingsStore()` (per-guild key/value settings with bound
parameters). New tables arrive as numbered migrations in that file; a failed
migration rolls back instead of leaving a half-applied schema. Before applying
anything, `openDatabase()` also compares every row in `schema_migrations` with
the migrations compiled into this build: a database written by a newer build,
an unknown version, or a renamed applied migration is refused with an error
instead of being opened against the wrong schema. Backing up, restoring, and
exporting settings are tracked as follow-up work in
[ROADMAP.md](./ROADMAP.md).

## Logging

Logs are one JSON object per line on stdout, filtered by `LOG_LEVEL`
(`debug` | `info` | `warn` | `error`, default `info`):

```json
{"ts":"2026-11-17T00:00:00.000Z","level":"info","msg":"kodyazar-bot ready","token":"<redacted>","version":"0.1.0"}
```

`src/logger.ts` is a single redacting sink for the process. Keys that name a
credential (`token`, `secret`, `password`, `authorization`, `api_key`, `cookie`,
`session`, …) are replaced with `<redacted>` at any depth, and the bot token is
registered as a secret value so it is replaced even when it arrives inside an
error message or free text. Errors serialise to `{name, message, stack}` through
the same filter. Logging is best-effort: circular references become
`[Circular]`, deep nesting becomes `[Truncated]`, and the logger never throws on
the boot path.

## Operations

For self-hosting, see the [operator runbook](./docs/OPERATIONS.md): configuration
reference, source and Docker deploys, health semantics, log redaction, graceful
shutdown, upgrade/rollback, token rotation, and a troubleshooting table.
## Gateway close codes

Transient closes (`1006`, `4003`, `4008`, heartbeat ACK timeouts) are retried with
exponential backoff capped at 30 seconds. Discord's terminal close codes — `4004`
(authentication failed), `4010` (invalid shard), `4011` (sharding required),
`4012` (invalid API version), `4013` (invalid intent(s)) and `4014` (disallowed
intent(s)) — are not retried: the client logs one `gateway closed permanently`
line, stops the `/healthz` server, and exits non-zero so the supervisor restarts
or alerts instead of the container reporting healthy while the bot is offline.
When that happens, check `TOKEN`, the bot intents enabled for the application,
and that the gateway API version is still supported.

## Contributing and security

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.
- Report vulnerabilities privately through [SECURITY.md](./SECURITY.md).
- See [ROADMAP.md](./ROADMAP.md) for planned work and [CHANGELOG.md](./CHANGELOG.md) for changes.
- Participation is covered by the [Code of Conduct](./CODE_OF_CONDUCT.md).
