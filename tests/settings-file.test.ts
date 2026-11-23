import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase, openGuildSettingsStore, type GuildSettingsStore } from '../src/db.js';
import { exportSettings, serialiseSettings, SETTINGS_FORMAT } from '../src/settings-file.js';

const GUILD_A = '123456789012345678';
const GUILD_B = '987654321098765432';
const NOW = new Date('2026-11-23T00:00:00.000Z');

function withStore(run: (store: GuildSettingsStore) => void): void {
  const store = openGuildSettingsStore(openDatabase(':memory:'));
  try {
    run(store);
  } finally {
    store.close();
  }
}

function seed(store: GuildSettingsStore): void {
  store.set(GUILD_B, 'prefix', '?');
  store.set(GUILD_A, 'prefix', '!');
  store.set(GUILD_A, 'welcome_channel', '111111111111111111');
}

test('exports every guild in a deterministic, reviewable document', () => {
  withStore((store) => {
    seed(store);
    assert.deepEqual(exportSettings(store, { now: () => NOW }), {
      format: SETTINGS_FORMAT,
      version: 1,
      exported_at: '2026-11-23T00:00:00.000Z',
      guilds: {
        [GUILD_A]: { prefix: '!', welcome_channel: '111111111111111111' },
        [GUILD_B]: { prefix: '?' },
      },
    });
  });
});

test('exports only the requested guilds and an empty database as an empty object', () => {
  withStore((store) => {
    seed(store);
    assert.deepEqual(exportSettings(store, { guildIds: [GUILD_B, GUILD_B], now: () => NOW }).guilds, {
      [GUILD_B]: { prefix: '?' },
    });

    store.remove(GUILD_A, 'prefix');
    store.remove(GUILD_A, 'welcome_channel');
    store.remove(GUILD_B, 'prefix');
    assert.deepEqual(exportSettings(store, { now: () => NOW }).guilds, {});
  });
});

test('serialises pretty JSON with a trailing newline', () => {
  withStore((store) => {
    seed(store);
    const text = serialiseSettings(exportSettings(store, { now: () => NOW }));
    assert.equal(text.endsWith('\n'), true);
    assert.deepEqual(JSON.parse(text), exportSettings(store, { now: () => NOW }));
  });
});
