# Contributing to KodYazar-Bot

KodYazar-Bot is an all-in-one, local-first Discord server bot: announcements,
backups, auto/reaction roles, temp voice, moderation, staff tracking, and
logging. The runnable scaffold is tracked in
[#1](https://github.com/KodYazicam/KodYazar-Bot/issues/1), so until it lands there
is no `package.json` or test command and documentation PRs are the useful work.

## Before you start

- Search existing issues and pull requests, and open an issue before a large
  change so the scope can be agreed.
- Report vulnerabilities privately through [SECURITY.md](./SECURITY.md), never in
  a public issue.
- By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Setup

Once the scaffold from #1 is merged, run `npm ci` and `npm test`. A
documentation change needs no install step; do not add `package.json` or CI in an
unrelated pull request.

## Branches and commits

- Branch from `main` using `fix/<issue>-<slug>`, `feat/<issue>-<slug>`, or
  `docs/<issue>-<slug>`.
- Use Conventional Commits: `fix:`, `feat:`, `docs:`, `chore:`, `test:`, `ci:`.
- Keep one logical change per pull request and reference the issue with
  `Closes #N` in the body.
- Never commit tokens, `.env` files, database dumps, or real user data.

## Pull requests

- Explain the problem, the change, how you tested it, and the risk and rollback.
- Add or update tests when behaviour changes (after the test runner exists).
- Update `README.md` and `CHANGELOG.md` for user-visible changes.
- A maintainer reviews every pull request. Do not force-push after review starts.

## Scope

KodYazar-Bot stays MIT-licensed, local-first, SQLite-backed, and TR/EN. It does
not phone home, does not keep message content beyond what a feature needs, and
does not request privileged Discord intents without a documented opt-in.
