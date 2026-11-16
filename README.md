# KodYazar-Bot

All-in-one Discord server bot: announcements, backups, auto/reaction roles, temp voice, moderation, staff tracking, logging. Local-first, SQLite, TR/EN.

> **Status:** pre-release. The runnable scaffold is tracked in
> [#1](https://github.com/KodYazicam/KodYazar-Bot/issues/1); the runtime spine
> (install, config, health check, tests, CI) is
> [#8](https://github.com/KodYazicam/KodYazar-Bot/issues/8).

## Quick start

Requires Node.js 22. Run `npm ci`, copy `.env.example` to `.env`, fill `TOKEN`
and `CLIENT_ID`, then `npm run build && npm start`. `GET /healthz` returns
`{"status":"ok","uptime":<seconds>,"version":"<version>"}`; unknown paths return
404 and unsupported methods 405. `npm test` builds and runs the `node --test`
suite without a token or network. The token is never printed: the startup summary
masks it and validation errors name the variable only.

## Contributing and security

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.
- Report vulnerabilities privately through [SECURITY.md](./SECURITY.md).
- See [ROADMAP.md](./ROADMAP.md) for planned work and [CHANGELOG.md](./CHANGELOG.md) for changes.
- Participation is covered by the [Code of Conduct](./CODE_OF_CONDUCT.md).
