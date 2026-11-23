# Roadmap

This roadmap is a direction, not a promise. Priorities change when users report
real problems. Open an issue before starting a large change.

## Now

- Land the governance baseline: contribution, security, roadmap, changelog,
  issue/PR templates, CODEOWNERS, and Dependabot.
- Build the runnable scaffold: configuration, logging, health check, one slash
  command, tests, and CI ([#1](https://github.com/KodYazicam/KodYazar-Bot/issues/1)).

## Next

- One issue per feature area, each with tests and documented permissions:
  announcements, backups, auto/reaction roles, temp voice, moderation, staff
  tracking, and logging.
- TR/EN strings from the first command, with English fallback (`/ping` in
  [#48](https://github.com/KodYazicam/KodYazar-Bot/issues/48)); later commands
  extend the same catalog.
- SQLite migrations and per-guild settings (storage spine, #18), plus an
  export/import path for per-guild configuration and a documented backup format
  that never stores tokens.

## Later

- Retention limits and redaction controls for logs and backups.
- Packaging guidance for self-hosting next to the other KodYazicam bots.
- Localization beyond TR/EN once the string catalog exists.

## Not planned

- A hosted bot service or a paid tier.
- Telemetry or analytics that send data off the host.
- Storing message content beyond what a feature explicitly needs.
- Requesting privileged intents without a documented opt-in.
