# KodYazar-Bot

All-in-one Discord server bot: announcements, backups, auto/reaction roles, temp voice, moderation, staff tracking, logging. Local-first, SQLite, TR/EN.

> **Status:** pre-release. The runnable scaffold is tracked in
> [#1](https://github.com/KodYazicam/KodYazar-Bot/issues/1); the runtime spine
> is [#8](https://github.com/KodYazicam/KodYazar-Bot/issues/8) and the Discord
> connection plus `/ping` is [#12](https://github.com/KodYazicam/KodYazar-Bot/issues/12).

## Quick start

Requires Node.js 22. Run `npm ci`, copy `.env.example` to `.env`, fill `TOKEN`
and `CLIENT_ID`, then `npm run build && npm start`. On startup the bot registers
`/ping`, opens the gateway with the `GUILDS` intent only (no privileged intents),
and replies with heartbeat latency and process uptime; set `GUILD_ID` while
developing so the command appears immediately. `/healthz` returns
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

## Contributing and security

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.
- Report vulnerabilities privately through [SECURITY.md](./SECURITY.md).
- See [ROADMAP.md](./ROADMAP.md) for planned work and [CHANGELOG.md](./CHANGELOG.md) for changes.
- Participation is covered by the [Code of Conduct](./CODE_OF_CONDUCT.md).
