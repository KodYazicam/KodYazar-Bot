# Roadmap

This roadmap is a direction, not a promise. Priorities change when users report
real problems. Open an issue before starting a large change.

## Now

- Finish the pinned `sparkcord` SDK migration
  ([#26](https://github.com/KodYazicam/KodYazar-Bot/issues/26)) so the runtime
  stops carrying a duplicate gateway adapter.

## Next

- TR/EN strings from the first command, with English fallback
  ([#48](https://github.com/KodYazicam/KodYazar-Bot/issues/48)).
- One issue per feature area, each with tests and documented permissions:
  announcements, backups, auto/reaction roles, temp voice, moderation, staff
  tracking, and logging.
- An export/import path for per-guild configuration and a documented backup
  format that never stores tokens; the storage spine (#18) is merged.

## Later

- Retention limits and redaction controls for logs and backups.
- Packaging guidance for self-hosting next to the other KodYazicam bots.
- Localization beyond TR/EN once the string catalog exists.

## Not planned

- A hosted bot service or a paid tier.
- Telemetry or analytics that send data off the host.
- Storing message content beyond what a feature explicitly needs.
- Requesting privileged intents without a documented opt-in.
