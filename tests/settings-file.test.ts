import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase, openGuildSettingsStore, type GuildSettingsStore } from '../src/db.js';
import {
  exportSettings,
  importSettings,
  parseSettingsDocument,
  serialiseSettings,
  SETTINGS_FILE_VERSION,
  SETTINGS_FORMAT,
  validateSettingsDocument,
  type SettingsDocument,
} from '../src/settings-file.js';

const GUILD_A = '123456789012345678';
const GUILD_B = '987654321098765432';
const GUILD_C = '111111111111111111';
const NOW = new Date('2026-11-23T00:00:00.000Z');
const VALID_DOCUMENT: SettingsDocument = {
  format: SETTINGS_FORMAT,
  version: SETTINGS_FILE_VERSION,
  exported_at: NOW.toISOString(),
  guilds: { [GUILD_A]: { prefix: '!' } },
};

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

test('parses an exported document and validates the v1 round trip', () => {
  withStore((store) => {
    seed(store);
    const document = exportSettings(store, { now: () => NOW });
    assert.deepEqual(parseSettingsDocument(serialiseSettings(document)), document);
  });
});

test('ignores unknown top-level metadata but keeps the known v1 fields', () => {
  assert.deepEqual(
    validateSettingsDocument({ ...VALID_DOCUMENT, note: 'future' }),
    VALID_DOCUMENT,
  );
});

test('rejects an invalid document without echoing a setting value', () => {
  const secret = 'super-secret-value';
  const cases = [
    `{"format":"${SETTINGS_FORMAT}","version":1,"exported_at":"${NOW.toISOString()}","guilds":{"${GUILD_A}":{"prefix":"${secret}"`,
    JSON.stringify({ ...VALID_DOCUMENT, format: 'other', note: secret }),
    JSON.stringify({ ...VALID_DOCUMENT, version: 2, note: secret }),
    JSON.stringify({ ...VALID_DOCUMENT, exported_at: 'yesterday', note: secret }),
    JSON.stringify({ ...VALID_DOCUMENT, exported_at: '2026-11-23', note: secret }),
    JSON.stringify({ ...VALID_DOCUMENT, guilds: [], note: secret }),
    JSON.stringify({ ...VALID_DOCUMENT, guilds: { nope: {} }, note: secret }),
    JSON.stringify({ ...VALID_DOCUMENT, guilds: { [GUILD_A]: [] }, note: secret }),
    JSON.stringify({ ...VALID_DOCUMENT, guilds: { [GUILD_A]: { Bad: secret } }, note: secret }),
    JSON.stringify({ ...VALID_DOCUMENT, guilds: { [GUILD_A]: { prefix: 42 } }, note: secret }),
    JSON.stringify({ ...VALID_DOCUMENT, guilds: { [GUILD_A]: { prefix: `${secret}\u0000` } }, note: secret }),
    JSON.stringify({ ...VALID_DOCUMENT, guilds: { [GUILD_A]: { prefix: secret.repeat(5000) } }, note: secret }),
  ];
  for (const text of cases) {
    assert.throws(() => parseSettingsDocument(text), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes(secret), false, 'an error must not echo a value');
      return true;
    });
  }
});

test('import merges values, overwrites present keys, and leaves other rows alone', () => {
  withStore((store) => {
    store.set(GUILD_A, 'prefix', '!');
    store.set(GUILD_A, 'welcome_channel', '111111111111111111');
    store.set(GUILD_B, 'prefix', '?');
    store.set(GUILD_B, 'keep_me', 'yes');
    store.set(GUILD_C, 'prefix', '#');
    const document: SettingsDocument = {
      format: SETTINGS_FORMAT,
      version: SETTINGS_FILE_VERSION,
      exported_at: NOW.toISOString(),
      guilds: {
        [GUILD_A]: { prefix: '$', log_channel: '222222222222222222' },
        [GUILD_B]: { prefix: '?' },
      },
    };

    assert.deepEqual(importSettings(store, document, { dryRun: true }), {
      guilds: 2,
      settings: 3,
      dryRun: true,
    });
    assert.equal(store.get(GUILD_A, 'prefix'), '!');
    assert.equal(store.get(GUILD_A, 'log_channel'), null);

    assert.deepEqual(importSettings(store, document), { guilds: 2, settings: 3, dryRun: false });
    assert.equal(store.get(GUILD_A, 'prefix'), '$');
    assert.equal(store.get(GUILD_A, 'welcome_channel'), '111111111111111111');
    assert.equal(store.get(GUILD_A, 'log_channel'), '222222222222222222');
    assert.equal(store.get(GUILD_B, 'prefix'), '?');
    assert.equal(store.get(GUILD_B, 'keep_me'), 'yes');
    assert.equal(store.get(GUILD_C, 'prefix'), '#');
  });
});

test('import rejects an invalid document before writing any guild', () => {
  withStore((store) => {
    store.set(GUILD_A, 'prefix', 'keep');
    const document = {
      ...VALID_DOCUMENT,
      guilds: {
        [GUILD_A]: { prefix: 'changed' },
        [GUILD_B]: { Bad: 'x' },
      },
    } as unknown as SettingsDocument;
    assert.throws(() => importSettings(store, document), /key is invalid/);
    assert.equal(store.get(GUILD_A, 'prefix'), 'keep');
    assert.deepEqual(store.list(GUILD_B), {});
  });
});
