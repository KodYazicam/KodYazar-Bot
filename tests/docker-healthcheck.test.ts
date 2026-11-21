import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createHealthServer } from '../src/health.js';
import { HealthcheckConfigError, probeHealth, probePort } from '../src/docker-healthcheck.js';

test('defaults an unset or empty PORT to 3000', () => {
  assert.equal(probePort(undefined), 3000);
  assert.equal(probePort(''), 3000);
  assert.equal(probePort('   '), 3000);
});

test('accepts fixed decimal ports', () => {
  assert.equal(probePort('3000'), 3000);
  assert.equal(probePort(' 8080 '), 8080);
  assert.equal(probePort('65535'), 65535);
});

test('rejects the documented ephemeral PORT=0 instead of probing port 0', () => {
  assert.throws(() => probePort('0'), (error: unknown) => {
    assert.ok(error instanceof HealthcheckConfigError);
    assert.match(error.message, /fixed integer between 1 and 65535/);
    assert.match(error.message, /PORT=0 \(ephemeral\) is not supported/);
    return true;
  });
});

test('rejects non-decimal and out-of-range ports', () => {
  for (const port of ['0x10', '1e3', '+3000', '-1', '65536', '30.5', 'abc']) {
    assert.throws(() => probePort(port), /fixed integer between 1 and 65535/);
  }
});

test('probeHealth succeeds against a listening /healthz server', async () => {
  const server = createHealthServer({ version: '0.1.0', startedAt: 0, now: () => 1000 });
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    assert.equal(await probeHealth(port), true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('probeHealth fails when nothing is listening', async () => {
  // Bind an ephemeral port, close it, then probe the now-free port.
  const server = createHealthServer({ version: '0.1.0' });
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  assert.equal(await probeHealth(port, 500), false);
});
