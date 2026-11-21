import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

const dockerfile = read('Dockerfile');
const dockerignore = read('.dockerignore');
const compose = read('docker-compose.yml');
const ci = read(join('.github', 'workflows', 'ci.yml'));

/** Every build stage, in order, so assertions can target the final runtime stage. */
function stages(source) {
  return source.split(/^FROM\s+/m).slice(1);
}

test('the Dockerfile builds in stages and runs the final stage as a non-root user', () => {
  const parts = stages(dockerfile);
  assert.ok(parts.length >= 2, 'Dockerfile must keep a separate build and runtime stage');

  const runtime = parts.at(-1);
  assert.match(runtime, /^node:22-alpine/, 'runtime stage must stay on Node 22 Alpine');
  assert.match(runtime, /^USER\s+bot\s*$/m, 'runtime stage must switch to the unprivileged bot user');
  assert.doesNotMatch(runtime, /^USER\s+(root|0)\s*$/m, 'the runtime image must never run as root');
  assert.match(
    runtime,
    /HEALTHCHECK[\s\S]*dist\/src\/docker-healthcheck\.js/,
    'the runtime image must keep the validated /healthz health check',
  );
  assert.match(runtime, /ENTRYPOINT\s+\[[^\]]*tini/, 'tini must stay as PID 1 to forward SIGTERM');

  const build = parts[0];
  assert.match(build, /npm ci/, 'the build stage must install from the lockfile with npm ci');
  assert.ok(!/COPY\s+\.\s+\.\s*$/m.test(dockerfile), 'never copy the whole build context into the image');
});

test('the image health check validates PORT instead of probing port 0', () => {
  const runtime = stages(dockerfile).at(-1);
  assert.doesNotMatch(
    runtime,
    /process\.env\.PORT\s*\|\|/,
    'the health check must not turn the truthy string "0" into a probe target',
  );
  const probe = read(join('src', 'docker-healthcheck.ts'));
  assert.match(probe, /\/healthz/, 'the probe script must call /healthz');
  assert.match(probe, /PORT=0 \(ephemeral\) is not supported/, 'the probe must explain why PORT=0 is rejected');
});

test('.dockerignore keeps secrets, data, and build output out of the build context', () => {
  const entries = new Set(
    dockerignore
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')),
  );

  for (const required of ['.git', 'node_modules', 'dist', 'data', '.env', '.env.*']) {
    assert.ok(entries.has(required), `.dockerignore must exclude ${required}`);
  }
});

test('the compose stack hardens the runtime and persists data', () => {
  assert.match(compose, /^\s*env_file:\s*$/m, 'compose must read secrets from env_file');
  assert.match(compose, /^\s*-\s*\.env\s*$/m, 'compose must load .env as the env_file');
  assert.match(compose, /^\s*read_only:\s*true\s*$/m, 'compose must keep the root filesystem read-only');
  assert.match(compose, /no-new-privileges:true/, 'compose must keep no-new-privileges');
  assert.match(compose, /^\s*-\s*bot-data:\/app\/data\s*$/m, 'compose must persist /app/data in a named volume');
  assert.match(compose, /^\s*restart:\s*unless-stopped\s*$/m, 'compose must restart unless stopped');
  assert.doesNotMatch(compose, /privileged:\s*true/, 'compose must never run privileged');
});

test('CI builds the image and proves the container becomes healthy', () => {
  assert.match(ci, /^\s{2}docker:\s*$/m, 'ci.yml must keep a docker job');
  assert.match(ci, /docker build .*kodyazar-bot:ci/, 'the docker job must build the tagged image');
  assert.match(ci, /image inspect[^\n]*\.Config\.User/, 'the docker job must assert the runtime user');
  assert.match(ci, /\/healthz/, 'the docker job must probe /healthz');
  assert.match(ci, /State\.Health\.Status/, 'the docker job must wait for the image health check');
  assert.match(ci, /docker compose config/, 'the docker job must validate the compose file');
});
