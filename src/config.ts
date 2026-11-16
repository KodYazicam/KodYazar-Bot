export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Context = Record<string, unknown>;

export interface Config {
  token: string;
  clientId: string;
  guildId?: string;
  logLevel: LogLevel;
  port: number;
  dataDir: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];
const SNOWFLAKE = /^\d{17,20}$/;

/** Error messages name the bad variable but never echo its value. */
export function parseConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = (env.TOKEN ?? '').trim();
  if (!token) throw new ConfigError('TOKEN is required');
  const clientId = (env.CLIENT_ID ?? '').trim();
  if (!SNOWFLAKE.test(clientId)) throw new ConfigError('CLIENT_ID must be a Discord snowflake (17-20 digits)');
  const guildId = (env.GUILD_ID ?? '').trim() || undefined;
  if (guildId !== undefined && !SNOWFLAKE.test(guildId)) {
    throw new ConfigError('GUILD_ID must be a Discord snowflake (17-20 digits)');
  }
  const logLevel = (env.LOG_LEVEL ?? 'info').trim().toLowerCase();
  if (!LOG_LEVELS.includes(logLevel as LogLevel)) {
    throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}`);
  }
  const port = Number((env.PORT ?? '3000').trim());
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError('PORT must be an integer between 0 and 65535');
  }
  const dataDir = (env.DATA_DIR ?? './data').trim() || './data';
  return { token, clientId, guildId, logLevel: logLevel as LogLevel, port, dataDir };
}

/** Safe startup summary: the token is always masked. */
export function summariseConfig(config: Config): Context {
  return { ...config, token: '<redacted>' };
}
