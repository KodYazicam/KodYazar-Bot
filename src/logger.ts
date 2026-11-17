import type { LogLevel } from './config.js';

export type LogContext = Record<string, unknown>;

/** Replacement for sensitive keys and registered secret values. */
export const REDACTED = '<redacted>';
const CIRCULAR = '[Circular]';
const TRUNCATED = '[Truncated]';
const MAX_DEPTH = 6;
/** Values shorter than this are too generic to replace safely. */
const MIN_SECRET_LENGTH = 6;
const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
/** Matched against the key with separators stripped, e.g. `access_token` → `accesstoken`. */
const SENSITIVE_SUFFIX = /(token|secret|password|passwd|apikey|privatekey|credential|authorization|cookie|session)$/;

function isSensitiveKey(key: string): boolean {
  const normalised = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalised === 'jwt' || normalised === 'bearer' || SENSITIVE_SUFFIX.test(normalised);
}

function redactText(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) result = result.split(secret).join(REDACTED);
  return result;
}

function serialise(value: unknown, secrets: readonly string[], seen: WeakSet<object>, depth: number): unknown {
  if (typeof value === 'string') return redactText(value, secrets);
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (depth > MAX_DEPTH) return TRUNCATED;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message, secrets),
      stack: value.stack === undefined ? undefined : redactText(value.stack, secrets),
    };
  }
  if (seen.has(value)) return CIRCULAR;
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => serialise(item, secrets, seen, depth + 1));
    // Null prototype: a `__proto__` key from untrusted JSON stays data instead of
    // replacing the result's prototype (which could hide fields or inject toJSON).
    const result = Object.create(null) as Record<string, unknown>;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? REDACTED : serialise(item, secrets, seen, depth + 1);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

export interface LoggerOptions {
  level: LogLevel;
  /** Base context merged into every line. */
  context?: LogContext;
  /** Secret values (for example the bot token) replaced wherever they appear. */
  secrets?: readonly string[];
  /** Injectable clock keeps `ts` deterministic in tests. */
  now?: () => number | Date;
  /** Injectable sink keeps stdout clean in tests. */
  sink?: (line: string) => void;
}

export interface Logger {
  readonly level: LogLevel;
  log(level: LogLevel, message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

class JsonLogger implements Logger {
  private readonly secrets: readonly string[];
  private readonly now: () => number | Date;
  private readonly sink: (line: string) => void;
  constructor(readonly level: LogLevel, private readonly context: LogContext, options: LoggerOptions) {
    this.secrets = (options.secrets ?? []).filter((secret) => secret.length >= MIN_SECRET_LENGTH);
    this.now = options.now ?? (() => new Date());
    this.sink = options.sink ?? ((line) => { process.stdout.write(`${line}\n`); });
  }

  log(level: LogLevel, message: string, context: LogContext = {}): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) return;
    const merged = serialise({ ...this.context, ...context }, this.secrets, new WeakSet(), 0) as LogContext;
    const line = {
      ...merged,
      ts: new Date(this.now()).toISOString(),
      level,
      msg: redactText(message, this.secrets),
    };
    this.sink(JSON.stringify(line));
  }

  child(context: LogContext): Logger {
    return new JsonLogger(this.level, { ...this.context, ...context }, {
      level: this.level, secrets: this.secrets, now: this.now, sink: this.sink,
    });
  }
}

/**
 * Dependency-free JSON-lines logger: one object per line, levels, child context,
 * and best-effort redaction. Logging must never throw on the boot path, so
 * circular or excessively deep values degrade to `[Circular]`/`[Truncated]`.
 */
export function createLogger(options: LoggerOptions): Logger {
  return new JsonLogger(options.level, options.context ?? {}, options);
}
