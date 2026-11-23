import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_LOCALE, pingMessage, resolveLocale } from '../src/i18n.js';

test('resolves Turkish and English from Discord locale tags', () => {
  assert.equal(resolveLocale('tr'), 'tr');
  assert.equal(resolveLocale('tr-TR'), 'tr');
  assert.equal(resolveLocale(' TR '), 'tr');
  assert.equal(resolveLocale('en-US'), 'en');
  assert.equal(resolveLocale('en_GB'), 'en');
});

test('skips unsupported candidates and finally falls back to English', () => {
  // The user's locale wins only when it is translated; otherwise the guild is tried.
  assert.equal(resolveLocale('de-DE', 'tr'), 'tr');
  assert.equal(resolveLocale('fr', 'es-ES'), DEFAULT_LOCALE);
  assert.equal(resolveLocale(undefined, null, ''), DEFAULT_LOCALE);
});

test('formats ping in the resolved language without changing the values', () => {
  assert.equal(
    pingMessage('en', { latencyMs: 25, uptimeSeconds: 42.9 }),
    'Pong · 25ms · uptime 42s',
  );
  assert.equal(
    pingMessage('tr', { latencyMs: 25, uptimeSeconds: 42.9 }),
    'Pong · 25ms · çalışma süresi 42s',
  );
});
