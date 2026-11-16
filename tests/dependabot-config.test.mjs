import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function activeEcosystems(config) {
  const ecosystems = [];
  for (const rawLine of config.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^-\s*package-ecosystem:\s*["']?([a-z0-9_-]+)["']?$/i);
    if (match) ecosystems.push(match[1].toLowerCase());
  }
  return ecosystems;
}

function workflowFiles() {
  const dir = join(ROOT, '.github', 'workflows');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));
}

const MANIFESTS = {
  npm: () => existsSync(join(ROOT, 'package.json')),
  'github-actions': () =>
    workflowFiles().length > 0 || existsSync(join(ROOT, 'action.yml')) || existsSync(join(ROOT, 'action.yaml')),
};

test('every active Dependabot ecosystem has its manifest', () => {
  const config = readFileSync(join(ROOT, '.github', 'dependabot.yml'), 'utf8');

  assert.match(config, /^version:\s*2\s*$/m, 'dependabot.yml must declare version 2');

  const ecosystems = activeEcosystems(config);
  assert.ok(ecosystems.length > 0, 'dependabot.yml must keep at least one active ecosystem');

  for (const ecosystem of ecosystems) {
    const manifestExists = MANIFESTS[ecosystem];
    assert.ok(manifestExists, `no manifest rule for the Dependabot ecosystem "${ecosystem}"`);
    assert.ok(
      manifestExists(),
      `Dependabot ecosystem "${ecosystem}" is active but its manifest is missing; comment the entry out until the manifest lands`,
    );
  }
});
