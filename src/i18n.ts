/** Dependency-free TR/EN catalog for user-facing command replies. */
export type Locale = 'tr' | 'en';

/** English is the documented fallback for every unsupported or missing locale. */
export const DEFAULT_LOCALE: Locale = 'en';

const SUPPORTED_LOCALES: ReadonlySet<string> = new Set<Locale>(['tr', 'en']);

/**
 * Resolves a Discord locale (or any BCP-47 tag) to one of the catalog locales.
 * Candidates are tried in order, so a command can pass the invoking user's
 * locale first and the guild locale second. Only the primary subtag matters:
 * `tr-TR` resolves to `tr` and `de-DE` is skipped.
 */
export function resolveLocale(...candidates: Array<string | null | undefined>): Locale {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const primary = candidate.trim().toLowerCase().split(/[-_]/)[0];
    if (primary !== undefined && SUPPORTED_LOCALES.has(primary)) return primary as Locale;
  }
  return DEFAULT_LOCALE;
}

export interface PingMessageContext {
  latencyMs: number;
  uptimeSeconds: number;
}

type PingFormatter = (context: PingMessageContext) => string;

/**
 * One entry per supported language. The formatted values are identical across
 * languages; only the uptime label changes.
 */
const PING: Record<Locale, PingFormatter> = {
  en: ({ latencyMs, uptimeSeconds }) =>
    `Pong · ${latencyMs}ms · uptime ${Math.floor(uptimeSeconds)}s`,
  tr: ({ latencyMs, uptimeSeconds }) =>
    `Pong · ${latencyMs}ms · çalışma süresi ${Math.floor(uptimeSeconds)}s`,
};

/** Formats the `/ping` reply, falling back to English for an unknown locale. */
export function pingMessage(locale: Locale, context: PingMessageContext): string {
  return (PING[locale] ?? PING[DEFAULT_LOCALE])(context);
}
