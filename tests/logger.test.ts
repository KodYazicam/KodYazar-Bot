import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLogger, REDACTED, type LoggerOptions } from '../src/logger.js';

const SECRET = 'test-token-123';
const NOW = 1700000000000;

function capture(options: Partial<LoggerOptions> = {}) {
  const lines: string[] = [];
  const logger = createLogger({ level: 'debug', now: () => NOW, sink: (line) => lines.push(line), ...options });
  const parsed = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, lines, parsed };
}

test('emits one JSON line with timestamp, level, message, and context', () => {
  const { logger, lines, parsed } = capture();
  logger.log('info', 'started', { port: 3000 });
  assert.equal(lines.length, 1);
  assert.deepEqual(parsed()[0], { ts: '2023-11-14T22:13:20.000Z', level: 'info', msg: 'started', port: 3000 });
});

test('drops calls below the configured level', () => {
  const { logger, parsed } = capture({ level: 'warn' });
  logger.log('debug', 'noise');
  logger.log('info', 'still noise');
  logger.log('warn', 'kept');
  logger.log('error', 'also kept');
  assert.deepEqual(parsed().map((line) => line.msg), ['kept', 'also kept']);
});

test('redacts sensitive keys at any depth and inside arrays', () => {
  const { logger, lines, parsed } = capture();
  logger.log('error', 'request failed', {
    token: SECRET,
    headers: { authorization: `Bot ${SECRET}`, accept: 'application/json' },
    attempts: [{ password: 'hunter2' }],
  });
  const line = parsed()[0]!;
  assert.deepEqual(line.headers, { authorization: REDACTED, accept: 'application/json' });
  assert.deepEqual(line.attempts, [{ password: REDACTED }]);
  assert.equal(line.token, REDACTED);
  assert.equal(lines[0]!.includes(SECRET), false);
});

test('redacts registered secret values inside messages and free text', () => {
  const { logger, lines, parsed } = capture({ secrets: [SECRET] });
  logger.log('error', `gateway rejected ${SECRET}`, { detail: `header was Bot ${SECRET}` });
  assert.equal(parsed()[0]!.msg, `gateway rejected ${REDACTED}`);
  assert.equal(parsed()[0]!.detail, `header was Bot ${REDACTED}`);
  assert.equal(lines[0]!.includes(SECRET), false);
});

test('leaves non-secret identifiers and short values intact', () => {
  const { logger, parsed } = capture({ secrets: [SECRET, 'abc'] });
  logger.log('info', 'ready', { clientId: '123456789012345678', text: 'abc stays' });
  assert.equal(parsed()[0]!.clientId, '123456789012345678');
  assert.equal(parsed()[0]!.text, 'abc stays');
});

test('child loggers merge context without leaking into the parent', () => {
  const { logger, parsed } = capture({ context: { service: 'kodyazar-bot' } });
  const child = logger.child({ requestId: 'r1' });
  child.log('info', 'child');
  logger.log('info', 'parent');
  assert.deepEqual(parsed()[0], {
    ts: '2023-11-14T22:13:20.000Z', level: 'info', msg: 'child', service: 'kodyazar-bot', requestId: 'r1',
  });
  assert.equal('requestId' in parsed()[1]!, false);
});

test('serialises Error instances and redacts their messages', () => {
  const { logger, lines, parsed } = capture({ secrets: [SECRET] });
  const error = new Error(`fetch failed with ${SECRET}`);
  logger.log('error', 'discord gateway failed to start', { error });
  const serialised = parsed()[0]!.error as Record<string, unknown>;
  assert.equal(serialised.name, 'Error');
  assert.equal(serialised.message, `fetch failed with ${REDACTED}`);
  assert.equal(String(serialised.stack).includes(SECRET), false);
  assert.equal(lines[0]!.includes(SECRET), false);
});

test('never throws on circular context', () => {
  const { logger, parsed } = capture();
  const context: Record<string, unknown> = { name: 'loop' };
  context.self = context;
  logger.log('info', 'cycle', context);
  const line = parsed()[0]!;
  assert.equal(line.name, 'loop');
  assert.equal(JSON.stringify(line).includes('[Circular]'), true);
});

test('keeps a newline in the message on a single physical line', () => {
  const { logger, lines, parsed } = capture();
  logger.log('warn', 'first\nsecond');
  assert.equal(lines.length, 1);
  assert.equal(parsed()[0]!.msg, 'first\nsecond');
});

test('serialises a valid Date as an ISO-8601 string', () => {
  const { logger, parsed } = capture();
  logger.log('info', 'timestamp', { at: new Date(NOW) });
  assert.equal(parsed()[0]!.at, '2023-11-14T22:13:20.000Z');
});

test('serialises an invalid Date instead of throwing', () => {
  const { logger, lines, parsed } = capture();
  assert.doesNotThrow(() => logger.log('info', 'bad timestamp', { at: new Date(Number.NaN) }));
  assert.equal(parsed()[0]!.at, 'Invalid Date');
  assert.equal(lines.length, 1);
});

test('does not call a context toJSON that returns a registered secret', () => {
  const { logger, lines, parsed } = capture({ secrets: [SECRET] });
  logger.log('info', 'custom payload', { payload: { toJSON: () => ({ leaked: SECRET }) } });
  assert.equal(lines[0]!.includes(SECRET), false);
  assert.deepEqual(parsed()[0]!.payload, {});
});

test('does not call a throwing context toJSON', () => {
  const { logger, parsed } = capture();
  const payload = { toJSON: () => { throw new Error('boom'); } };
  assert.doesNotThrow(() => logger.log('info', 'custom payload', { payload }));
  assert.equal(parsed()[0]!.msg, 'custom payload');
});

test('keeps an invalid injected clock from throwing', () => {
  const { logger, parsed } = capture({ now: () => new Date(Number.NaN) });
  assert.doesNotThrow(() => logger.log('info', 'clock'));
  assert.equal(parsed()[0]!.ts, 'Invalid Date');
});

test('logs a __proto__ key as data without changing the output prototype', () => {
  const { logger, lines, parsed } = capture();
  const context = JSON.parse('{"__proto__":{"polluted":true},"ok":1}') as Record<string, unknown>;
  logger.log('info', 'untrusted payload', context);
  assert.equal(parsed()[0]!.ok, 1);
  assert.deepEqual(parsed()[0]!['__proto__'], { polluted: true });
  assert.equal(lines[0]!.includes('"__proto__"'), true);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
