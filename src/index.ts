import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, GatewayIntentBits } from 'discord.js';
import { createSparkBot, type SparkClientLike } from 'sparkcord';
import { type Config, ConfigError, parseConfig, summariseConfig } from './config.js';
import { type GuildSettingsStore, openDatabase, openGuildSettingsStore, SCHEMA_VERSION } from './db.js';
import { createHealthServer } from './health.js';
import { createLogger } from './logger.js';

const VERSION = process.env.npm_package_version ?? '0.1.0';
const SHUTDOWN_GRACE_MS = 5000;
/** Compiled next to this file: dist/src/commands in the image and in tests. */
const COMMANDS_DIR = fileURLToPath(new URL('./commands', import.meta.url));

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
  // Guilds is the only intent interactions need; no privileged intents.
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  let closing = false;

  const stop = (code: number): void => {
    if (closing) return;
    closing = true;
    client.destroy();
    server.close(() => {
      store.close();
      logger.log('info', 'shutdown complete');
      process.exit(code);
    });
    setTimeout(() => {
      logger.log('error', 'shutdown timed out');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
  };

  // A rejected login or a terminal gateway error cannot be retried: stop serving
  // /healthz and exit non-zero so the platform restarts or alerts instead of the
  // container reporting healthy while the bot is offline.
  const fail = (message: string, error: unknown): void => {
    logger.log('error', message, { error: error instanceof Error ? error.message : 'unknown' });
    process.exitCode = 1;
    stop(1);
  };

  client.on('error', (error) => fail('discord gateway failed', error));

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.log('info', 'shutting down', { signal });
    stop(0);
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => shutdown(signal));

  const startDiscord = async (): Promise<void> => {
    try {
      // sparkcord's SparkClientLike is the subset of the discord.js client it
      // uses; the runtime contract is identical, so one cast at the boundary.
      const sparkClient = client as unknown as SparkClientLike;
      const bot = await createSparkBot({
        client: sparkClient,
        commandsDir: COMMANDS_DIR,
        devGuildId: config.guildId,
        autoRegister: true,
        denyReplies: true,
      });
      bot.attach(sparkClient);
      await client.login(config.token);
      logger.log('info', 'discord gateway connected');
    } catch (error) {
      fail('discord gateway failed to start', error);
    }
  };

  server.listen(config.port, () => {
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : config.port;
    logger.log('info', 'kodyazar-bot ready', { ...summariseConfig(config), port });
    void startDiscord();
  });
}
main();
