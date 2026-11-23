import type { Command } from '../client.js';
import { pingMessage } from '../i18n.js';

/** Sparkcord-shaped definition: `data` metadata plus a `run(ctx)` handler. */
export const ping: Command = {
  name: 'ping',
  description: 'Pong with gateway latency and process uptime.',
  run(context) {
    context.reply(pingMessage(context.locale, {
      latencyMs: context.latencyMs,
      uptimeSeconds: context.uptimeSeconds,
    }));
  },
};
