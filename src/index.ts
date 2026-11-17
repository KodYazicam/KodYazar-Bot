import { DiscordClient } from './client.js';
import { ping } from './commands/ping.js';
import { type Config, ConfigError, parseConfig, summariseConfig } from './config.js';
import { createHealthServer } from './health.js';
import { createLogger } from './logger.js';

const VERSION = process.env.npm_package_version ?? '0.1.0';
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

  const server = createHealthServer({ version: VERSION });
  const client = new DiscordClient({
    token: config.token, clientId: config.clientId, guildId: config.guildId, commands: [ping],
    log: (level, message, context) => logger.log(level, message, context),
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
      process.exitCode = 1;
    }
  };

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.log('info', 'shutting down', { signal });
    client.stop();
    server.close(() => {
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
