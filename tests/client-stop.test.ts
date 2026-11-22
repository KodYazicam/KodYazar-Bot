import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DiscordClient, type GatewaySocket } from '../src/client.js';

function idleSocket(): GatewaySocket {
  return { send() {}, close() {}, addEventListener() {} };
}

function idleClient(): DiscordClient {
  return new DiscordClient({
    token: 'test-token-123',
    clientId: '123456789012345678',
    commands: [],
    connect: idleSocket,
    schedule: () => () => {},
    log: () => {},
  });
}

test('stop() rejects a start() that never reached READY', async () => {
  const client = idleClient();
  const started = client.start();
  client.stop();
  await assert.rejects(started, /client stopped before it became ready/);
});

test('stop() before start() is a no-op', () => {
  const client = idleClient();
  assert.doesNotThrow(() => client.stop());
  assert.doesNotThrow(() => client.stop());
});
