import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createHealthServer } from '../src/health.js';

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createHealthServer({ version: '0.1.0', startedAt: 0, now: () => 4000 });
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('serves the public liveness payload on GET /healthz', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', uptime: 4, version: '0.1.0' });
  });
});

test('HEAD /healthz returns the GET headers without a body', async () => {
  await withServer(async (baseUrl) => {
    const get = await fetch(`${baseUrl}/healthz`);
    const body = await get.text();
    const head = await fetch(`${baseUrl}/healthz`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(head.headers.get('content-length'), String(Buffer.byteLength(body)));
    assert.equal(await head.text(), '');
  });
});

test('unknown paths return 404 and unsupported methods 405 with Allow', async () => {
  await withServer(async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/nope`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('allow'), null);
    for (const method of ['POST', 'OPTIONS']) {
      const response = await fetch(`${baseUrl}/healthz`, { method });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
    }
  });
});
