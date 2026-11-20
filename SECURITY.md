# Security Policy

KodYazar-Bot runs inside Discord servers with moderation, logging, and backup
access. A stolen bot token is a stolen server, so treat credentials with the same
care as the data they protect.

## Supported versions

There is no tagged release yet; the runnable scaffold is tracked in
[#1](https://github.com/KodYazicam/KodYazar-Bot/issues/1). Security fixes land on
`main`, and only the latest commit on `main` is supported.

## Reporting a vulnerability

Do not open a public issue. Use a private GitHub Security Advisory on
[KodYazicam/KodYazar-Bot](https://github.com/KodYazicam/KodYazar-Bot/security/advisories/new).

Include the affected commit, steps to reproduce, impact, and any suggested fix.
We will confirm receipt, investigate, and coordinate a fix and a disclosure date
with you before publishing details.

## Scope

- Bot token handling: tokens come from the environment, are never logged, and
  are never committed.
- Command permission checks for moderation, staff tracking, and temp voice.
- SQLite storage and backups, which may contain message content or user data.
- Privileged Discord intents: request only what a feature needs and document it.
- Dependency and CI supply chain, including CodeQL code scanning on every push
  and pull request to `main` plus a weekly scheduled scan. Findings appear in the
  repository's Security tab; `tests/code-scanning.test.mjs` keeps the workflow
  from being removed or weakened.

## Out of scope

Discord itself, third-party hosting, self-hosted misconfiguration (a
world-readable `.env` or a public unauthenticated panel), and abuse reports for
one server (contact that server's staff).

## Safe harbor and disclosure

Good-faith research on your own instance is welcome: do not access other users'
data, do not degrade a running service, and give us reasonable time before
publishing. We credit reporters unless they ask to stay anonymous and publish an
advisory once a fix is available.
