import { join } from 'node:path';
import { DiscordClient } from './client.js';
import { ping } from './commands/ping.js';
import { type Config, ConfigError, parseConfig, summariseConfig } from './config.js';
import { type GuildSettingsStore, openDatabase, openGuildSettingsStore, SCHEMA_VERSION } from './db.js';
import { createHealthServer } from './health.js';
import { createLogger } from './logger.js';
import { readPackageVersion } from './version.js';

const VERSION = readPackageVersion();
const SHUTDOWN_GRACE_MS = 5000;

function main(): void {
  let config: Config;
  try {
    config = parseConfig();
  } catch (error) {
    const message = error instanceof ConfigError ? error.message : 'invalid configuration';
    process.stderr.write(`${JSON.stringify({ level: 'error', msg: message })}\n`);
    process.exitCode = 1;
    return;
  }

  // One redacting sink for the whole process: the token is registered as a secret
  // so it is replaced even when it reaches a log line through an error message.
  const logger = createLogger({
    level: config.logLevel,
    context: { version: VERSION },
    secrets: [config.token],
  });

  // Persistent state lives under DATA_DIR; a boot failure here is fatal so the
  // supervisor restarts us instead of silently running without settings.
  let store: GuildSettingsStore;
  try {
    store = openGuildSettingsStore(openDatabase(join(config.dataDir, 'kodyazar.sqlite')));
  } catch (error) {
    logger.log('error', 'storage failed to open', {
      error: error instanceof Error ? error.message : 'unknown',
      data_dir: config.dataDir,
    });
    process.exitCode = 1;
    return;
  }
  logger.log('info', 'storage ready', { schema_version: SCHEMA_VERSION });

  const server = createHealthServer({ version: VERSION });
  const client = new DiscordClient({
    token: config.token, clientId: config.clientId, guildId: config.guildId, commands: [ping],
    log: (level, message, context) => logger.log(level, message, context),
    // A terminal close (bad token, invalid intents, wrong API version) cannot be
    // retried: stop serving /healthz and exit non-zero so the platform restarts or
    // alerts instead of the container reporting healthy while the bot is offline.
    onFatal: ({ code, reason }) => {
      logger.log('error', 'discord gateway closed permanently', { code, reason });
      server.close();
      process.exitCode = 1;
    },
  });

  const startDiscord = async (): Promise<void> => {
    try {
      await client.register();
      await client.start();
      logger.log('info', 'discord gateway connected');
    } catch (error) {
      logger.log('error', 'discord gateway failed to start', { error: error instanceof Error ? error.message : 'unknown' });
      client.stop();
      server.close();
      store.close();
      process.exitCode = 1;
    }
  };

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.log('info', 'shutting down', { signal });
    client.stop();
    server.close(() => {
      store.close();
      logger.log('info', 'shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      logger.log('error', 'shutdown timed out');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => shutdown(signal));

  server.listen(config.port, () => {
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : config.port;
    logger.log('info', 'kodyazar-bot ready', { ...summariseConfig(config), port });
    void startDiscord();
  });
}
main();
