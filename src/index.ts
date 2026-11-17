import { DiscordClient } from './client.js';
import { ping } from './commands/ping.js';
import { type Config, ConfigError, parseConfig, summariseConfig } from './config.js';
import { createHealthServer } from './health.js';

const VERSION = process.env.npm_package_version ?? '0.1.0';
const SHUTDOWN_GRACE_MS = 5000;
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
function log(config: Config, level: keyof typeof LEVELS, message: string, context: Record<string, unknown> = {}): void {
  if (LEVELS[level] < LEVELS[config.logLevel]) return;
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level, msg: message, ...context })}\n`);
}

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

  const server = createHealthServer({ version: VERSION });
  const client = new DiscordClient({
    token: config.token, clientId: config.clientId, guildId: config.guildId, commands: [ping],
    log: (level, message, context) => log(config, level, message, context),
  });

  const startDiscord = async (): Promise<void> => {
    try {
      await client.register();
      await client.start();
      log(config, 'info', 'discord gateway connected');
    } catch (error) {
      log(config, 'error', 'discord gateway failed to start', { error: error instanceof Error ? error.message : 'unknown' });
      client.stop();
      server.close();
      process.exitCode = 1;
    }
  };

  const shutdown = (signal: NodeJS.Signals): void => {
    log(config, 'info', 'shutting down', { signal });
    client.stop();
    server.close(() => {
      log(config, 'info', 'shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      log(config, 'error', 'shutdown timed out');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => shutdown(signal));

  server.listen(config.port, () => {
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : config.port;
    log(config, 'info', 'kodyazar-bot ready', { ...summariseConfig(config), port, version: VERSION });
    void startDiscord();
  });
}
main();
