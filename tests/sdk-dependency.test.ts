import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };

test('the sparkcord SDK stays pinned to a reviewed commit', () => {
  assert.match(
    pkg.dependencies?.sparkcord ?? '',
    /^github:KodYazicam\/sparkcord#[0-9a-f]{40}$/,
    'sparkcord must be pinned to a full commit SHA, not a branch or range',
  );
});

test('discord.js is declared because sparkcord only lists it as a peer', () => {
  assert.ok(pkg.dependencies?.['discord.js'], 'discord.js must be a direct dependency');
});

test('the Docker build stage installs git for the git dependency', () => {
  const build = read('Dockerfile').split(/^FROM\s+/m)[1] ?? '';
  assert.match(build, /apk add --no-cache git/, 'npm ci cannot clone sparkcord without git');
});
