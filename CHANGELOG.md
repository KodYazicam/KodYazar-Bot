# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/). There is no tagged release yet.

## [Unreleased]

### Added

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

- Scheduled Dependabot runs no longer fail on `main` with
  `dependency_file_not_found`: the `github-actions` ecosystem now has a workflow
  file, and the `npm` ecosystem is commented out until #1 adds `package.json`.
