import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createSparkBot } from 'sparkcord';

/** Compiled next to this test: dist/src/commands in tests and in the image. */
const COMMANDS_DIR = fileURLToPath(new URL('../src/commands', import.meta.url));

function interaction(ping: number | undefined) {
  const replies: unknown[] = [];
  return {
    replies,
    raw: {
      isChatInputCommand: () => true,
      commandName: 'ping',
      user: { id: '123456789012345678' },
      guildId: '987654321098765432',
      member: { permissions: { toArray: () => [] } },
      client: { ws: { ping } },
      reply: (payload: unknown) => {
        replies.push(payload);
        return Promise.resolve();
      },
    },
  };
}

test('sparkcord loads the compiled ping command and answers a slash interaction', async () => {
  const bot = await createSparkBot({ commandsDir: COMMANDS_DIR });
  assert.deepEqual(bot.slashPayload(), [
    { name: 'ping', description: 'Pong with gateway latency and process uptime.', options: [] },
  ]);

  const { raw, replies } = interaction(25);
  const result = await bot.handleInteraction(raw);
  assert.equal(result.ok, true, `invoke failed: ${result.reason ?? 'unknown'}`);
  assert.match(String(replies[0]), /^Pong · 25ms · uptime \d+s$/);
});

test('ping falls back to zero latency when discord.js has no ping sample yet', async () => {
  const bot = await createSparkBot({ commandsDir: COMMANDS_DIR });
  const { raw, replies } = interaction(-1);
  const result = await bot.handleInteraction(raw);
  assert.equal(result.ok, true);
  assert.match(String(replies[0]), /^Pong · 0ms · uptime \d+s$/);
});
