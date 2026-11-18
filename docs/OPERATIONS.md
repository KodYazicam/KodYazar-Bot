# Operator runbook

How to deploy, observe, upgrade, and recover **KodYazar-Bot** on `main`. This
covers the runtime that exists today: config validation, JSON logs, `GET
/healthz`, one slash command (`/ping`), and the Docker image. The code lives in
`src/index.ts` (boot and lifecycle), `src/health.ts` (probe), `src/config.ts`
(environment validation), `src/db.ts` (SQLite storage and migrations), and
`src/commands/` (the slash catalogue `sparkcord` loads at boot).

For local development and the project overview, read [README.md](../README.md)
first. This page is about running the bot for other people.

## Prerequisites

- **Node.js 22.13 or newer.** `discord.js` uses the built-in `WebSocket` and
  storage uses the built-in `node:sqlite` module, which 22.13 made available
  without a flag; older runtimes fail at import or with `WebSocket is unavailable`.
- **A Discord application with a bot user.** Copy the bot token and the
  application (client) ID from the Developer Portal.
- **Only the `GUILDS` gateway intent.** The bot registers slash commands and
  receives interactions; it does not read message content and requests no
  privileged intents.
- **Docker 24+ and Compose v2** if you deploy the container instead of a bare
  Node process.

On the Discord side, invite the bot with the `bot` and `applications.commands`
scopes. Without `applications.commands` the commands are registered but never
appear in the picker.

## Configuration

All runtime configuration comes from environment variables. Start from
`.env.example`; never commit a filled `.env`.

| Variable | Default | Notes |
| --- | --- | --- |
| `TOKEN` | — | **Required.** Bot token. Registered as a redaction secret for the whole process. |
| `CLIENT_ID` | — | **Required.** Application ID, a 17-20 digit snowflake, not the token. |
| `GUILD_ID` | unset | Optional guild snowflake for instant command registration while developing. Unset means global commands. |
| `LOG_LEVEL` | `info` | One of `debug`, `info`, `warn`, `error`. |
| `PORT` | `3000` | Integer between 0 and 65535 for the health server. `0` picks an ephemeral port, which makes the container health check impractical. |
| `DATA_DIR` | `./data` | Directory for the SQLite database `kodyazar.sqlite` and its `-wal`/`-shm` sidecars. Created on first boot; see [Storage and backups](#storage-and-backups). |

Validation runs before anything else. A bad value stops the process with exit
code 1 and a message that names the variable but never echoes its value, for
example:

```json
{"level":"error","msg":"TOKEN is required"}
```

## First deploy from source

```bash
git clone https://github.com/KodYazicam/KodYazar-Bot.git
cd KodYazar-Bot
npm ci
cp .env.example .env    # fill TOKEN and CLIENT_ID; GUILD_ID is optional
npm run build
npm start
```

Startup order:

1. the SQLite database is opened and migrated, logging `storage ready` with only
   `schema_version`;
2. the health server listens on `PORT`;
3. the log line `kodyazar-bot ready` is written with the config summary (token
   masked);
4. the gateway connects and logs `discord gateway connected`;
5. `sparkcord` registers the loaded catalogue (guild-scoped when `GUILD_ID` is
   set, otherwise global) as soon as the client is ready.

Global commands can take up to an hour to appear. Set `GUILD_ID` during rollout
to make `/ping` available immediately in one guild.

## Deploy with Docker

The image built by `Dockerfile` is multi-stage, runs as the unprivileged `bot`
user, uses `tini` as PID 1, and ships a `HEALTHCHECK` that calls `/healthz`.

```bash
cp .env.example .env    # fill TOKEN and CLIENT_ID
docker build -t kodyazar-bot .
docker run --rm --publish 3000:3000 --env-file .env kodyazar-bot
curl --fail http://127.0.0.1:3000/healthz
```

Or use the `docker-compose.yml` stack, which keeps `/app/data` in the `bot-data`
named volume and mounts the root filesystem read-only with `no-new-privileges`:

```bash
cp .env.example .env
docker compose up --build --detach
docker compose ps
docker compose logs --follow bot
docker compose down          # --volumes also deletes persisted data
```

`.env` is excluded from the image by `.dockerignore`; pass secrets with
`--env-file` or your orchestrator's secret store rather than baking them in.

## Health and monitoring

`GET /healthz` returns the liveness of the HTTP process:

```json
{"status":"ok","uptime":12.5,"version":"0.1.0"}
```

Any other path returns `404`; any method other than `GET` returns `405`. The
payload contains no guild data and no secrets.

**This is a liveness signal, not a readiness signal.** It does not prove that
the Discord gateway is connected: if the gateway is reconnecting, the container
stays healthy. Treat `discord gateway connected` in the logs as the readiness
event, and alert on a sustained absence of that line plus repeated `gateway
closed; reconnecting` warnings. The Docker health check runs every 30 seconds
with a 5 second timeout, a 10 second start period, and 3 retries; it probes the
same `PORT` value the bot uses.

Keep `/healthz` on a private interface or a local probe. It has no
authentication and should not be the only thing exposed to the public internet.

## Logs

Every line on stdout is one JSON object:

```json
{"ts":"2026-11-17T00:00:00.000Z","level":"info","msg":"kodyazar-bot ready","token":"<redacted>","version":"0.1.0"}
```

- Filter with `LOG_LEVEL`. `debug` is for short-lived investigations; `info` is
  the production default.
- Credential-shaped keys and the registered bot token are replaced with
  `<redacted>` at any depth, including inside error messages and free text.
- Logging is best-effort: it never throws on the boot path, so a logging failure
  cannot take the bot down.
- With compose, read logs through `docker compose logs --follow bot`; run the
  container without a TTY driver that reorders or truncates lines.

It is safe to paste a log line into an issue only after checking that it contains
no environment-specific identifiers beyond what you are willing to share.

## Lifecycle and shutdown

`SIGTERM` and `SIGINT` start a graceful shutdown: the bot logs `shutting down`,
closes the gateway and the HTTP server, then exits 0 after `shutdown complete`.
If teardown takes longer than 5 seconds it exits 1 with `shutdown timed out`.

Compose already sends `SIGTERM`; its default 10 second stop timeout is longer
than the bot's 5 second grace period. For a bare-metal install, a minimal
systemd unit:

```ini
[Unit]
Description=KodYazar-Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=kodyazar
WorkingDirectory=/opt/kodyazar-bot
EnvironmentFile=/etc/kodyazar-bot.env
ExecStart=/usr/bin/node dist/src/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/opt/kodyazar-bot/data
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

`EnvironmentFile` keeps the token out of the unit file; set its permissions to
`0600` and make it readable only by the service user.

## Upgrade and rollback

Before upgrading, note the current commit (`git rev-parse HEAD`) or the image tag
you are running.

```bash
git fetch origin
git checkout <tag-or-commit>
npm ci
npm run build
sudo systemctl restart kodyazar-bot   # or: docker compose up --build --detach
curl --fail http://127.0.0.1:3000/healthz
```

Watch for `kodyazar-bot ready`, then `discord gateway connected`. A failed
health check after an upgrade means the HTTP process did not start; read the
first error line (it names the variable or module) before rolling back.

Rollback is the same procedure with the previous commit or image tag. Copy
`DATA_DIR` before an upgrade and restore it before starting the older build,
because schema migrations are forward-only and a newer database may use a
schema the old binary does not understand. See
[Storage and backups](#storage-and-backups).

## Token rotation

Rotate when a token leaks, when a maintainer leaves, or on your normal schedule:

1. In the Developer Portal, reset the bot token. Discord invalidates the old
   token immediately.
2. Update `TOKEN` in `/etc/kodyazar-bot.env`, the compose `.env`, or your secret
   store. Keep `CLIENT_ID` unchanged.
3. Restart the service (`sudo systemctl restart kodyazar-bot` or
   `docker compose up --detach --force-recreate bot`).
4. Confirm `discord gateway connected`; an invalid token closes the gateway with
   code `4004` and logs one `gateway closed permanently` line. The process exits
   non-zero and the supervisor reports the failure instead of retrying forever.

Never place a token in a command line argument, an issue, a screenshot, or a
committed `.env`.

## Troubleshooting

| Symptom | Cause and action |
| --- | --- |
| `TOKEN is required` at boot | The variable is missing or empty. Check `EnvironmentFile` / `--env-file`; quotes or trailing spaces are trimmed. |
| `CLIENT_ID must be a Discord snowflake (17-20 digits)` | You pasted the token or a bot user ID instead of the application ID. |
| `GUILD_ID must be a Discord snowflake (17-20 digits)` | Remove the variable for global commands or use the correct server ID. |
| `LOG_LEVEL must be one of debug, info, warn, error` | Fix the value; it is case-insensitive. |
| `PORT must be an integer between 0 and 65535` | Use a decimal port. Ranges, hex, and exponents are rejected. |
| `Error: listen EADDRINUSE` | Something else holds `PORT`. Stop it or choose another port; the container health check follows `PORT` automatically. |
| Container reports `unhealthy` | Read `docker logs` first. Common causes are a bad token and a `PORT` mismatch between the probe and the listener. |
| `/ping` missing in Discord | Global commands can take up to an hour. For instant rollout set `GUILD_ID` and restart; also confirm the `applications.commands` scope. |
| `WebSocket is unavailable` | The runtime is older than Node 22, or the image was built from an unsupported base. |
| Repeated `gateway closed; reconnecting` | Network/DNS blocked or a Discord incident. The client retries with capped backoff and gives up during initial connect after 5 attempts. Terminal codes are different: see the next row. |
| `gateway closed permanently: <code>` | A close code Discord will never accept on retry (`4004` auth, `4010`-`4012` shard/API version, `4013`/`4014` intents). The client stops instead of reconnecting and exits non-zero. Check `TOKEN`, the enabled intents, and the API version. |
| `storage failed to open` | `DATA_DIR` is not writable or the database is corrupt. Check ownership of the volume; the process exits 1 rather than running without settings. |
| `shutdown timed out` | Teardown exceeded 5 seconds. Check the last log line before exit; tune the service timeout only after finding the slow step. |

## Security notes

- Run as a non-root user. The shipped image uses `bot`; the compose file also
  sets `no-new-privileges` and a read-only root filesystem.
- Keep `.env` and any `EnvironmentFile` at `0600` and out of version control.
- Report vulnerabilities privately as described in [SECURITY.md](../SECURITY.md),
  never in a public issue.
- The health endpoint exposes uptime and version only; still keep it on a
  trusted network.

## Storage and backups

Persistent state lives in one SQLite database at `DATA_DIR/kodyazar.sqlite`
(`DATA_DIR` defaults to `./data`). It is created and migrated on boot; the
`schema_migrations` table records the applied versions, and migrations are
forward-only and transactional, so a failed migration rolls back instead of
leaving a half-applied schema.

WAL mode means the live database is three files (`kodyazar.sqlite`,
`-wal`, `-shm`); treat them as one unit. Stop the bot and copy all three, or take
a consistent snapshot while it runs with the SQLite backup API or
`VACUUM INTO '<backup-file>'`. Never copy a live database with `cp` and never
store a Discord token in it.

For the Docker deployment, `DATA_DIR` is `/app/data` on the `bot-data` volume;
the compose file and image already point there, so the volume is the backup
unit. Restore by placing the snapshot back before starting the older or newer
build.
