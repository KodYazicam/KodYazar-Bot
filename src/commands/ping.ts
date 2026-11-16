import type { Command } from '../client.js';

/** Sparkcord-shaped definition: `data` metadata plus a `run(ctx)` handler. */
export const ping: Command = {
  name: 'ping',
  description: 'Pong with gateway latency and process uptime.',
  run(context) {
    context.reply(`Pong · ${context.latencyMs}ms · uptime ${Math.floor(context.uptimeSeconds)}s`);
  },
};
