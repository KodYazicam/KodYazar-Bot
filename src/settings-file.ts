import {
  GUILD_ID_PATTERN,
  MAX_SETTING_VALUE_BYTES,
  SETTING_KEY_PATTERN,
  type GuildSettingsStore,
} from './db.js';

/**
 * Portable per-guild settings format. It is deliberately separate from the
 * SQLite snapshot: a snapshot is a whole database, while this document can be
 * reviewed, diffed, and moved to another host one guild at a time.
 */
export const SETTINGS_FORMAT = 'kodyazar-bot/settings';
export const SETTINGS_FILE_VERSION = 1;

export interface SettingsDocument {
  format: typeof SETTINGS_FORMAT;
  version: typeof SETTINGS_FILE_VERSION;
  exported_at: string;
  guilds: Record<string, Record<string, string>>;
}

export interface ExportSettingsOptions {
  /** Omit to export every guild that has at least one setting. */
  guildIds?: readonly string[];
  /** Injectable clock keeps `exported_at` deterministic in tests. */
  now?: () => Date;
}

/** Builds a deterministic, reviewable document from the settings store. */
export function exportSettings(
  store: GuildSettingsStore,
  { guildIds, now = () => new Date() }: ExportSettingsOptions = {},
): SettingsDocument {
  const ids = guildIds === undefined ? store.guildIds() : [...new Set(guildIds)];
  ids.sort();
  const guilds: Record<string, Record<string, string>> = {};
  for (const guildId of ids) guilds[guildId] = store.list(guildId);
  return {
    format: SETTINGS_FORMAT,
    version: SETTINGS_FILE_VERSION,
    exported_at: now().toISOString(),
    guilds,
  };
}

/** Pretty JSON with a trailing newline so the file is diff-friendly. */
export function serialiseSettings(document: SettingsDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates an untrusted v1 document and returns a plain copy. Error messages
 * point at the bad position and never echo a setting value.
 */
export function validateSettingsDocument(value: unknown): SettingsDocument {
  if (!isRecord(value)) throw new Error('settings document must be a JSON object');
  if (value.format !== SETTINGS_FORMAT) {
    throw new Error(`settings document format must be "${SETTINGS_FORMAT}"`);
  }
  if (value.version !== SETTINGS_FILE_VERSION) {
    throw new Error(`settings document version must be ${SETTINGS_FILE_VERSION}`);
  }
  const exportedAt = value.exported_at;
  if (typeof exportedAt !== 'string' || !ISO_TIMESTAMP.test(exportedAt)) {
    throw new Error('settings document exported_at must be an ISO-8601 timestamp');
  }
  const exportedDate = new Date(exportedAt);
  if (Number.isNaN(exportedDate.getTime()) || exportedDate.toISOString() !== exportedAt) {
    throw new Error('settings document exported_at must be an ISO-8601 timestamp');
  }
  if (!isRecord(value.guilds)) throw new Error('settings document guilds must be an object');

  const guilds: Record<string, Record<string, string>> = {};
  const guildEntries = Object.entries(value.guilds);
  let guildIndex = 0;
  for (const [guildId, settings] of guildEntries) {
    if (!GUILD_ID_PATTERN.test(guildId)) {
      throw new Error(`settings document guilds[${guildIndex}] is not a valid guild id`);
    }
    if (!isRecord(settings)) {
      throw new Error(`settings document guilds[${guildIndex}] must be an object`);
    }
    const values: Record<string, string> = {};
    const settingEntries = Object.entries(settings);
    let settingIndex = 0;
    for (const [key, settingValue] of settingEntries) {
      if (!SETTING_KEY_PATTERN.test(key)) {
        throw new Error(`settings document guilds[${guildIndex}].settings[${settingIndex}] key is invalid`);
      }
      if (typeof settingValue !== 'string') {
        throw new Error(`settings document guilds[${guildIndex}].settings[${settingIndex}] value must be a string`);
      }
      if (settingValue.includes('\u0000')) {
        throw new Error(`settings document guilds[${guildIndex}].settings[${settingIndex}] value must not contain NUL`);
      }
      if (Buffer.byteLength(settingValue, 'utf8') > MAX_SETTING_VALUE_BYTES) {
        throw new Error(
          `settings document guilds[${guildIndex}].settings[${settingIndex}] value must be at most ${MAX_SETTING_VALUE_BYTES} bytes`,
        );
      }
      values[key] = settingValue;
      settingIndex += 1;
    }
    guilds[guildId] = values;
    guildIndex += 1;
  }

  return {
    format: SETTINGS_FORMAT,
    version: SETTINGS_FILE_VERSION,
    exported_at: exportedAt,
    guilds,
  };
}

/** Parses untrusted JSON and validates the whole document before any write. */
export function parseSettingsDocument(text: string): SettingsDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Do not include the parser error: it can quote part of the document.
    throw new Error('settings document is not valid JSON');
  }
  return validateSettingsDocument(parsed);
}

export interface ImportSettingsOptions {
  /** Validate and count without writing. */
  dryRun?: boolean;
}

export interface ImportSummary {
  guilds: number;
  settings: number;
  dryRun: boolean;
}

/**
 * Merges a validated document into the store. Keys present in the document
 * overwrite existing values; keys and guilds absent from it are left alone.
 */
export function importSettings(
  store: GuildSettingsStore,
  document: SettingsDocument,
  { dryRun = false }: ImportSettingsOptions = {},
): ImportSummary {
  // Validate again so a caller that built the object in code gets the same
  // guarantees as one that parsed JSON.
  const validated = validateSettingsDocument(document);
  const guildIds = Object.keys(validated.guilds).sort();
  let settings = 0;
  for (const guildId of guildIds) {
    const values = validated.guilds[guildId]!;
    settings += Object.keys(values).length;
    if (!dryRun) store.setMany(guildId, values);
  }
  return { guilds: guildIds.length, settings, dryRun };
}
