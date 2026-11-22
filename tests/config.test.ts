import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, parseConfig, summariseConfig } from '../src/config.js';

const VALID = { TOKEN: 'test-token', CLIENT_ID: '123456789012345678' };

test('rejects a missing TOKEN', () => {
  assert.throws(() => parseConfig({ ...VALID, TOKEN: '   ' }), /TOKEN is required/);
});

test('rejects a malformed CLIENT_ID without echoing it', () => {
  const clientId = 'not-a-snowflake';
  assert.throws(() => parseConfig({ ...VALID, CLIENT_ID: clientId }), (error: unknown) => {
    assert.ok(error instanceof ConfigError);
    assert.match(error.message, /CLIENT_ID/);
    assert.equal(error.message.includes(clientId), false);
    return true;
  });
});

test('rejects out-of-range and fractional ports', () => {
  for (const port of ['-1', '70000', '30.5', 'abc']) {
    assert.throws(() => parseConfig({ ...VALID, PORT: port }), /PORT must be an integer/);
  }
});

test('defaults an empty PORT instead of silently binding an ephemeral port', () => {
  for (const port of ['', '   ']) {
    assert.equal(parseConfig({ ...VALID, PORT: port }).port, 3000);
  }
});

test('accepts explicit decimal ports, including the documented ephemeral 0', () => {
  assert.equal(parseConfig({ ...VALID, PORT: '0' }).port, 0);
  assert.equal(parseConfig({ ...VALID, PORT: '8080' }).port, 8080);
  assert.equal(parseConfig({ ...VALID, PORT: ' 3000 ' }).port, 3000);
});

test('rejects non-decimal port syntax instead of coercing it', () => {
  for (const port of ['0x10', '1e3', '+3000']) {
    assert.throws(() => parseConfig({ ...VALID, PORT: port }), /PORT must be an integer/);
  }
});

test('defaults an empty LOG_LEVEL to info instead of failing the boot', () => {
  for (const level of ['', '   ']) {
    assert.equal(parseConfig({ ...VALID, LOG_LEVEL: level }).logLevel, 'info');
  }
  assert.equal(parseConfig({ ...VALID, LOG_LEVEL: ' INFO ' }).logLevel, 'info');
});

test('rejects an unknown LOG_LEVEL without echoing the value', () => {
  const level = 'verbose';
  assert.throws(() => parseConfig({ ...VALID, LOG_LEVEL: level }), (error: unknown) => {
    assert.ok(error instanceof ConfigError);
    assert.match(error.message, /LOG_LEVEL/);
    assert.equal(error.message.includes(level), false);
    return true;
  });
});

test('applies defaults and masks the token in the startup summary', () => {
  const config = parseConfig({ TOKEN: '  token  ', CLIENT_ID: '123456789012345678 ' });
  assert.deepEqual(config, { token: 'token', clientId: VALID.CLIENT_ID, guildId: undefined, logLevel: 'info', port: 3000, dataDir: './data' });
  const summary = summariseConfig(config);
  assert.equal(summary.token, '<redacted>');
  assert.equal(JSON.stringify(summary).includes(VALID.TOKEN), false);
});
