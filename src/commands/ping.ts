import type { CommandDefinition } from 'sparkcord';

/** Sparkcord-shaped definition: slash metadata plus a `run(ctx)` handler. */
const ping: CommandDefinition = {
  name: 'ping',
  description: 'Pong with gateway latency and process uptime.',
  kind: 'slash',
  run(context) {
    const raw = context.raw as { client?: { ws?: { ping?: number } } } | undefined;
    const latency = Math.max(0, Math.round(raw?.client?.ws?.ping ?? 0));
    return context.reply(`Pong · ${latency}ms · uptime ${Math.floor(process.uptime())}s`);
  },
};

export default ping;
