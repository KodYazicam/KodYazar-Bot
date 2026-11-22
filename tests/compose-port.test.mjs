// Keeps the compose port mapping tied to the same PORT the container receives.
// A fixed non-default PORT in .env must be reachable from the host; the old
// hardcoded "3000:3000" silently published the wrong port.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const compose = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');

test('compose publishes the same configurable PORT it passes to the container', () => {
  assert.doesNotMatch(
    compose,
    /^\s*-\s*["']?3000:3000["']?\s*$/m,
    'compose must not hardcode the default port: a fixed PORT in .env would be unreachable',
  );
  assert.match(
    compose,
    /^\s*-\s*["']?\$\{PORT:-3000\}:\$\{PORT:-3000\}["']?\s*$/m,
    'compose must publish ${PORT:-3000} on both sides of the mapping',
  );
  assert.match(
    compose,
    /^\s*PORT:\s*\$\{PORT:-3000\}\s*$/m,
    'compose must pass the same interpolated PORT to the container',
  );
});
