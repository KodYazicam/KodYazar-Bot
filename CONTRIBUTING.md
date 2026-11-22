# Contributing to KodYazar-Bot

KodYazar-Bot is an all-in-one, local-first Discord server bot: announcements,
backups, auto/reaction roles, temp voice, moderation, staff tracking, and
logging. The runnable scaffold is tracked in
[#1](https://github.com/KodYazicam/KodYazar-Bot/issues/1) and delivered in
slices, starting with the runtime spine in
[#8](https://github.com/KodYazicam/KodYazar-Bot/issues/8).

## Before you start

- Search existing issues and pull requests, and open an issue before a large
  change so the scope can be agreed.
- Report vulnerabilities privately through [SECURITY.md](./SECURITY.md), never in
  a public issue.
- By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Setup

Run `npm ci`, `npm run typecheck`, `npm test`, and
`node --test "tests/**/*.test.mjs"` locally with Node 22 or newer; `npm test`
builds with `tsc` and runs the TypeScript suite, while the `.mjs` files hold the
static repository checks. The `CI` workflow runs the build and test commands on
every push and pull request to `main`, and the `repo-hygiene` workflow runs the
static checks and asserts that every active Dependabot ecosystem has its
manifest. Both the `npm` and `github-actions` ecosystems are active because both
manifests exist.

## Branches and commits

- Branch from `main` using `fix/<issue>-<slug>`, `feat/<issue>-<slug>`, or
  `docs/<issue>-<slug>`.
- Use Conventional Commits: `fix:`, `feat:`, `docs:`, `chore:`, `test:`, `ci:`.
- Keep one logical change per pull request and reference the issue with
  `Closes #N` in the body.
- Never commit tokens, `.env` files, database dumps, or real user data.

## Pull requests

- Explain the problem, the change, how you tested it, and the risk and rollback.
- Add or update tests when behaviour changes. Run `npm test` for the compiled
  TypeScript suite and `node --test "tests/**/*.test.mjs"` for the static
  repository checks.
- Update `README.md` and `CHANGELOG.md` for user-visible changes.
- A maintainer reviews every pull request. Do not force-push after review starts.

## Scope

KodYazar-Bot stays MIT-licensed, local-first, SQLite-backed, and TR/EN. It does
not phone home, does not keep message content beyond what a feature needs, and
does not request privileged Discord intents without a documented opt-in.
