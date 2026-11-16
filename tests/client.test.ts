import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DiscordClient, type DiscordClientOptions, type GatewayFrame, type GatewaySocket, nextBackoff } from '../src/client.js';
import { ping } from '../src/commands/ping.js';
class FakeSocket implements GatewaySocket {
  readonly sent: string[] = [];
  closed: { code?: number } | null = null;
  private readonly listeners = new Map<string, Array<(event: GatewayFrame) => void>>();
  send(data: string): void { this.sent.push(data); }
  close(code?: number): void { this.closed = { code }; this.emit('close', { code }); }
  addEventListener(type: string, listener: (event: GatewayFrame) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: GatewayFrame = {}): void { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  dispatch(payload: unknown): void { this.emit('message', { data: JSON.stringify(payload) }); }
}
interface Gate { fn: () => void; ms: number; cancelled: boolean }
function harness(overrides: Partial<DiscordClientOptions> = {}) {
  const sockets: FakeSocket[] = [];
  const fetchCalls: Array<{ url: string; init: RequestInit }> = []; const gates: Gate[] = []; const logs: string[] = [];
  let clock = 1000;
  const client = new DiscordClient({
    token: 'test-token-123', clientId: '123456789012345678', commands: [ping],
    connect: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} }); return new Response('{}');
    }) as typeof fetch,
    now: () => clock, uptime: () => 42.9, backoff: () => 0, log: (level, message) => logs.push(`${level}:${message}`),
    schedule: (fn, ms) => { const gate: Gate = { fn, ms, cancelled: false }; gates.push(gate); return () => { gate.cancelled = true; }; },
    ...overrides,
  });
  return { client, sockets, fetchCalls, gates, logs, setClock: (value: number) => { clock = value; } };
}
type Harness = ReturnType<typeof harness>;
const gateOf = (h: Harness, ms: number) => h.gates.find((gate) => gate.ms === ms && !gate.cancelled);
const lastSent = (socket: FakeSocket): Record<string, unknown> =>
  JSON.parse(socket.sent.at(-1) ?? '{}') as Record<string, unknown>;
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function ready(h: Harness): Promise<FakeSocket> {
  const started = h.client.start();
  const socket = h.sockets[0]!;
  socket.dispatch({ op: 10, d: { heartbeat_interval: 45000 } }); socket.dispatch({ op: 0, s: 1, t: 'READY', d: { user: { id: 'bot-user' } } });
  await started;
  return socket;
}
const interaction = (name: string) => ({ op: 0, s: 2, t: 'INTERACTION_CREATE', d: { id: 'interaction-1', token: 'interaction-token', type: 2, data: { name } } });
test('identifies after HELLO and resolves start() on READY', async () => {
  const h = harness();
  const started = h.client.start();
  const socket = h.sockets[0]!;
  socket.dispatch({ op: 10, d: { heartbeat_interval: 45000 } });
  assert.deepEqual(lastSent(socket), { op: 2, d: { token: 'test-token-123', intents: 1,
    properties: { os: process.platform, browser: 'kodyazar-bot', device: 'kodyazar-bot' } } });
  assert.equal(h.logs.join(' ').includes('test-token-123'), false);
  socket.dispatch({ op: 0, s: 1, t: 'READY', d: { user: { id: 'bot-user' } } });
  await started;
  h.client.stop();
});
test('answers ping with heartbeat latency and process uptime', async () => {
  const h = harness();
  const socket = await ready(h);
  gateOf(h, 45000)?.fn();
  assert.deepEqual(lastSent(socket), { op: 1, d: 1 });
  h.setClock(1025);
  socket.dispatch({ op: 11 });
  socket.dispatch(interaction('ping'));
  await tick();
  const call = h.fetchCalls[0]!;
  assert.equal(call.url, 'https://discord.com/api/v10/interactions/interaction-1/interaction-token/callback');
  assert.equal(call.init.method, 'POST');
  assert.deepEqual(JSON.parse(String(call.init.body)), { type: 4, data: { content: 'Pong · 25ms · uptime 42s' } });
  h.client.stop();
});
test('ignores interactions for commands it does not own', async () => {
  const h = harness();
  const socket = await ready(h);
  socket.dispatch(interaction('ban'));
  await tick();
  assert.equal(h.fetchCalls.length, 0);
  h.client.stop();
});
test('reconnects on an unacknowledged heartbeat', async () => {
  const h = harness();
  const socket = await ready(h);
  gateOf(h, 45000)?.fn();
  gateOf(h, 45000)?.fn();
  assert.deepEqual(socket.closed, { code: 4000 });
  const reconnect = gateOf(h, 0);
  assert.ok(reconnect);
  reconnect.fn();
  assert.equal(h.sockets.length, 2);
  h.client.stop();
});
test('stop() closes the socket and never reconnects', async () => {
  const h = harness();
  const socket = await ready(h);
  h.client.stop();
  assert.deepEqual(socket.closed, { code: 1000 });
  assert.equal(h.gates.filter((gate) => !gate.cancelled).length, 0);
  assert.equal(h.sockets.length, 1);
});
test('registration is guild-scoped when GUILD_ID is set and global otherwise', async () => {
  const guild = harness({ guildId: '987654321098765432' });
  await guild.client.register();
  const call = guild.fetchCalls[0]!;
  assert.equal(call.url, 'https://discord.com/api/v10/applications/123456789012345678/guilds/987654321098765432/commands');
  assert.equal(call.init.method, 'PUT');
  assert.deepEqual(call.init.headers, { authorization: 'Bot test-token-123', 'content-type': 'application/json' });
  assert.deepEqual(JSON.parse(String(call.init.body)), [{ name: 'ping', description: 'Pong with gateway latency and process uptime.', type: 1 }]);
  const global = harness();
  await global.client.register();
  assert.equal(global.fetchCalls[0]?.url, 'https://discord.com/api/v10/applications/123456789012345678/commands');
});
test('a reconnect resets the heartbeat acknowledgement state', async () => {
  const h = harness();
  const first = await ready(h);
  gateOf(h, 45000)?.fn();
  first.emit('close', { code: 1006 });
  gateOf(h, 0)?.fn();
  const second = h.sockets[1]!;
  second.dispatch({ op: 10, d: { heartbeat_interval: 45000 } });
  gateOf(h, 45000)?.fn();
  assert.equal(second.closed, null);
  h.client.stop();
});
test('nextBackoff starts at one second and caps at thirty', () => {
  assert.deepEqual([0, 1, 4, 5, 99].map(nextBackoff), [1000, 2000, 16000, 30000, 30000]);
});
