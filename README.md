# KodYazar-Bot

All-in-one Discord server bot: announcements, backups, auto/reaction roles, temp voice, moderation, staff tracking, logging. Local-first, SQLite, TR/EN.

> **Status:** pre-release. The runnable scaffold is tracked in
> [#1](https://github.com/KodYazicam/KodYazar-Bot/issues/1); the runtime spine
> is [#8](https://github.com/KodYazicam/KodYazar-Bot/issues/8), the Discord
> connection plus `/ping` is [#12](https://github.com/KodYazicam/KodYazar-Bot/issues/12),
> and the redacting logger is [#16](https://github.com/KodYazicam/KodYazar-Bot/issues/16).

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

## Contributing and security

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.
- Report vulnerabilities privately through [SECURITY.md](./SECURITY.md).
- See [ROADMAP.md](./ROADMAP.md) for planned work and [CHANGELOG.md](./CHANGELOG.md) for changes.
- Participation is covered by the [Code of Conduct](./CODE_OF_CONDUCT.md).
