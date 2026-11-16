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

test('applies defaults and masks the token in the startup summary', () => {
  const config = parseConfig({ TOKEN: '  token  ', CLIENT_ID: '123456789012345678 ' });
  assert.deepEqual(config, { token: 'token', clientId: VALID.CLIENT_ID, guildId: undefined, logLevel: 'info', port: 3000, dataDir: './data' });
  const summary = summariseConfig(config);
  assert.equal(summary.token, '<redacted>');
  assert.equal(JSON.stringify(summary).includes(VALID.TOKEN), false);
});
