import type { GuildSettingsStore } from './db.js';

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
