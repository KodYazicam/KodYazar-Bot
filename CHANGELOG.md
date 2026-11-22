# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/). There is no tagged release yet.

## [Unreleased]

### Added

- SQLite storage spine (#18): `src/db.ts` opens `DATA_DIR/kodyazar.sqlite`,
  applies forward-only migrations recorded in `schema_migrations` (v1 adds
  `guild_settings`), runs in WAL mode with a 5s busy timeout, and exposes a
  per-guild settings store with bound parameters and validated guild ids, keys,
  and values. `src/index.ts` opens it after config validation, logs only the
  schema version, and closes it on shutdown or gateway failure. `engines.node`
  is now `>=22.13` for unflagged `node:sqlite`.
- Operator runbook (#22): `docs/OPERATIONS.md` covers configuration, source and
  Docker deploys, `/healthz` liveness semantics, log redaction, shutdown,
  upgrade/rollback, token rotation, and troubleshooting, plus
  `tests/operations-docs.test.mjs` to fail CI when the runbook references a
  removed script, environment variable, or repository path.
- Self-hosting assets (#14): a multi-stage, non-root Docker image with `tini`
  and a `/healthz` health check, `.dockerignore`, a compose stack with a named
  data volume and a read-only root filesystem, a `docker` CI job that builds and
  smoke-tests the image, and `tests/docker-assets.test.mjs` to keep those
  invariants from regressing.
- Redacting JSON logger (#16): `src/logger.ts` is now the single JSON-lines sink
  for the process, with level filtering, child context, recursive redaction of
  credential-shaped keys, and registered secret values (the bot token) replaced
  in messages, context strings, and `Error` output. `src/index.ts` routes every
  line through it.
- Discord connection (#12): a dependency-free gateway adapter behind `src/client.ts`
  (IDENTIFY, heartbeat ACK tracking, capped reconnect), commands, and `/ping`.
- TypeScript runtime spine (#8): `package.json`/`tsconfig.json`, validated env
  config, a `GET /healthz` server, graceful shutdown, a `node --test` suite, and
  a `CI` workflow (Node 22) that runs `npm ci`, typecheck, and tests.
- `.env.example`, a `data/` ignore rule, and npm Dependabot updates now that
  `package.json` and `package-lock.json` exist.
- Repository governance: `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, `ROADMAP.md`, this changelog, issue and pull request
  templates, `CODEOWNERS`, and Dependabot configuration.
- A "Contributing and security" section in the README.
- A `repo-hygiene` workflow (Node 22) that runs
  `node --test "tests/**/*.test.mjs"` on every push and pull request to `main`.
- `tests/dependabot-config.test.mjs`, which fails when an active Dependabot
  ecosystem has no manifest.

### Fixed

- Source deploys: `npm start` now loads `.env` with Node's
  `--env-file-if-exists` flag, so the documented `cp .env.example .env` then
  `npm start` flow picks up `TOKEN` and `CLIENT_ID` instead of failing with
  `TOKEN is required`. Variables already set in the environment keep precedence,
  and a missing `.env` is not an error.
- Configuration: `PORT` is parsed as a decimal integer. An empty value now
  falls back to the documented default 3000 instead of silently selecting an
  ephemeral port, and hex/exponent forms such as `0x10` or `1e3` are rejected
  before they can bind a port the Docker healthcheck does not probe (#20).
- Gateway close codes are classified (#24): `4004` and `4010`–`4014` are terminal,
  so the client stops its timers, rejects a pending `start()`, closes the
  `/healthz` server, and exits non-zero instead of reconnecting forever. Transient
  codes (`1006`, `4003`, `4008`) keep the existing capped backoff.
- Scheduled Dependabot runs no longer fail on `main` with
  `dependency_file_not_found`: the `github-actions` ecosystem now has a workflow
  file, and the `npm` ecosystem is commented out until #1 adds `package.json`.
