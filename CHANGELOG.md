# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/). There is no tagged release yet.

## [Unreleased]

### Added

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
