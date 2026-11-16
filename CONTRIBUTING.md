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

Until the scaffold from #1 lands there is no `package.json` and no `npm test`
command. The only automated check is the `repo-hygiene` workflow, which runs
`node --test "tests/**/*.test.mjs"` on every push and pull request to `main` and
asserts that every active Dependabot ecosystem has its manifest. Run the same
command locally with Node 22 or newer; a documentation change needs no install
step.

Once #1 is merged, run `npm ci` and `npm test`. Add `package.json` and the npm CI
pipeline only in a pull request that is about the scaffold.

Dependabot's `npm` ecosystem stays commented out in `.github/dependabot.yml`
until `package.json` exists; the `github-actions` ecosystem is active.

## Branches and commits

- Branch from `main` using `fix/<issue>-<slug>`, `feat/<issue>-<slug>`, or
  `docs/<issue>-<slug>`.
- Use Conventional Commits: `fix:`, `feat:`, `docs:`, `chore:`, `test:`, `ci:`.
- Keep one logical change per pull request and reference the issue with
  `Closes #N` in the body.
- Never commit tokens, `.env` files, database dumps, or real user data.

## Pull requests

- Explain the problem, the change, how you tested it, and the risk and rollback.
- Add or update tests when behaviour changes. `node --test "tests/**/*.test.mjs"`
  works today; #1 adds the full npm test runner.
- Update `README.md` and `CHANGELOG.md` for user-visible changes.
- A maintainer reviews every pull request. Do not force-push after review starts.

## Scope

KodYazar-Bot stays MIT-licensed, local-first, SQLite-backed, and TR/EN. It does
not phone home, does not keep message content beyond what a feature needs, and
does not request privileged Discord intents without a documented opt-in.
