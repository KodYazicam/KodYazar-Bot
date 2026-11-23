import { type Locale, resolveLocale } from './i18n.js';

/** The single seam between this bot and a Discord library: replace this file
 * with `sparkcord` once its package is installable, without touching commands. */
export const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
export const API_BASE = 'https://discord.com/api/v10';
/** Guilds is the only intent interactions need; no privileged intents. */
export const GUILDS_INTENT = 1;
const RECONNECT_CAP_MS = 30000;
const MAX_INITIAL_ATTEMPTS = 5;
/**
 * Close codes Discord documents as terminal: the same IDENTIFY can never succeed,
 * so retrying only burns the daily identify budget and hides the misconfiguration.
 * https://discord.com/developers/docs/topics/opcodes-and-status-codes#gateway-gateway-close-event-codes
 */
export const FATAL_CLOSE_CODES: ReadonlyMap<number, string> = new Map([
  [4004, 'authentication failed; check TOKEN'],
  [4010, 'invalid shard'],
  [4011, 'sharding is required'],
  [4012, 'invalid API version'],
  [4013, 'invalid intent(s)'],
  [4014, 'disallowed intent(s)'],
]);
export interface GatewayFatalEvent { code: number; reason: string }
export interface GatewayFrame { data?: string; code?: number }
export interface GatewaySocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: GatewayFrame) => void): void;
}
export interface CommandContext { latencyMs: number; uptimeSeconds: number; locale: Locale; reply(content: string): void }
export interface Command { name: string; description: string; run(context: CommandContext): void | Promise<void> }
export interface DiscordClientOptions {
  token: string; clientId: string; guildId?: string; commands: readonly Command[];
  connect?: (url: string) => GatewaySocket;
  fetchImpl?: typeof fetch;
  now?: () => number; uptime?: () => number;
  backoff?: (attempt: number) => number;
  /** Injected scheduler keeps heartbeat and reconnect deterministic in tests. */
  schedule?: (run: () => void, ms: number) => () => void;
  log?: (level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) => void;
  /** Called once when the gateway closes with a terminal code; the client stops itself. */
  onFatal?: (event: GatewayFatalEvent) => void;
}
interface Payload { op?: number; s?: number | null; t?: string; d?: unknown }
interface Interaction { id?: string; token?: string; type?: number; data?: { name?: string }; locale?: string; guild_locale?: string }
function defaultConnect(url: string): GatewaySocket {
  const Ctor = (globalThis as { WebSocket?: new (url: string) => GatewaySocket }).WebSocket;
  if (!Ctor) throw new Error('WebSocket is unavailable; Node.js 22 or newer is required');
  return new Ctor(url);
}
function defaultSchedule(run: () => void, ms: number): () => void {
  const timer = setTimeout(run, ms);
  timer.unref();
  return () => clearTimeout(timer);
}
export function nextBackoff(attempt: number): number {
  return Math.min(RECONNECT_CAP_MS, 1000 * 2 ** attempt);
}
export class DiscordClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly schedule: (run: () => void, ms: number) => () => void;
  private socket: GatewaySocket | null = null;
  private hb: (() => void) | null = null;
  private rc: (() => void) | null = null;
  private seq: number | null = null;
  private acked = true;
  private sentAt: number | null = null;
  private ackAt: number | null = null;
  private ready = false;
  private stopped = false;
  private attempt = 0;
  private pending: Promise<void> | null = null;
  private resolve: (() => void) | null = null;
  private reject: ((error: Error) => void) | null = null;
  constructor(private readonly options: DiscordClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? defaultSchedule;
  }
  get latencyMs(): number {
    if (this.sentAt === null || this.ackAt === null) return 0;
    return Math.max(0, this.ackAt - this.sentAt);
  }
  /** Registers the command catalogue; guild-scoped commands appear instantly. */
  async register(): Promise<void> {
    const { clientId, guildId, token, commands } = this.options;
    const path = guildId
      ? `/applications/${clientId}/guilds/${guildId}/commands`
      : `/applications/${clientId}/commands`;
    const response = await this.fetchImpl(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(commands.map(({ name, description }) => ({ name, description, type: 1 }))),
    });
    if (!response.ok) throw new Error(`command registration failed: HTTP ${response.status}`);
  }
  start(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.pending) return this.pending;
    this.stopped = false;
    this.attempt = 0;
    this.pending = new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.open();
    });
    return this.pending;
  }
  stop(): void {
    this.stopped = true;
    this.hb?.(); this.rc?.();
    this.hb = this.rc = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'client stopped');
    this.ready = false; this.pending = this.resolve = this.reject = null;
  }
  private open(): void {
    let socket: GatewaySocket;
    try {
      socket = (this.options.connect ?? defaultConnect)(GATEWAY_URL);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error('gateway connection failed'));
      return;
    }
    this.socket = socket;
    socket.addEventListener('message', (event) => this.onMessage(event));
    socket.addEventListener('close', (event) => this.onClose(event?.code));
  }
  private onMessage(event: GatewayFrame): void {
    if (typeof event.data !== 'string') return;
    let payload: Payload;
    try {
      payload = JSON.parse(event.data) as Payload;
    } catch { return this.log('warn', 'ignored malformed gateway frame'); }
    if (typeof payload.s === 'number') this.seq = payload.s;
    if (payload.op === 10) this.onHello(payload.d);
    else if (payload.op === 11) {
      this.acked = true;
      this.ackAt = this.now();
    } else if (payload.op === 1) this.sendHeartbeat();
    else if (payload.op === 7) this.socket?.close(4000, 'reconnect requested');
    else if (payload.op === 9) this.socket?.close(4001, 'invalid session');
    else if (payload.op === 0) this.onDispatch(payload.t, payload.d);
  }
  private onHello(data: unknown): void {
    const interval = (data as { heartbeat_interval?: number } | undefined)?.heartbeat_interval;
    if (typeof interval !== 'number' || !Number.isFinite(interval) || interval <= 0) {
      return void this.socket?.close(4002, 'invalid hello');
    }
    this.acked = true; this.seq = null; this.sentAt = this.ackAt = null;
    this.send({
      op: 2,
      d: {
        token: this.options.token,
        intents: GUILDS_INTENT,
        properties: { os: process.platform, browser: 'kodyazar-bot', device: 'kodyazar-bot' },
      },
    });
    this.scheduleHeartbeat(interval);
  }
  private scheduleHeartbeat(ms: number): void {
    this.hb?.();
    this.hb = this.schedule(() => {
      if (!this.acked) return void this.socket?.close(4000, 'heartbeat not acknowledged');
      this.sendHeartbeat();
      this.scheduleHeartbeat(ms);
    }, ms);
  }
  private sendHeartbeat(): void {
    this.acked = false; this.sentAt = this.now();
    this.send({ op: 1, d: this.seq });
  }
  private onDispatch(type: string | undefined, data: unknown): void {
    if (type === 'READY') {
      this.ready = true;
      this.attempt = 0;
      this.resolve?.(); this.resolve = this.reject = null;
    } else if (type === 'INTERACTION_CREATE') {
      void this.onInteraction(data as Interaction);
    }
  }
  private async onInteraction(interaction: Interaction): Promise<void> {
    if (interaction.type !== 2 || !interaction.id || !interaction.token) return;
    const command = this.options.commands.find((item) => item.name === interaction.data?.name);
    if (!command) return;
    let content: string | undefined;
    try {
      await command.run({
        latencyMs: this.latencyMs,
        uptimeSeconds: this.options.uptime?.() ?? process.uptime(),
        // The user's locale wins; the guild locale is the fallback before English.
        locale: resolveLocale(interaction.locale, interaction.guild_locale),
        reply: (value) => (content = value),
      });
    } catch (error) {
      this.log('error', 'command threw', { error: error instanceof Error ? error.message : 'unknown' });
      return;
    }
    if (content === undefined) return;
    try {
      const response = await this.fetchImpl(`${API_BASE}/interactions/${interaction.id}/${interaction.token}/callback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 4, data: { content } }),
      });
      if (!response.ok) this.log('error', 'interaction callback failed', { status: response.status });
    } catch { this.log('error', 'interaction callback failed'); }
  }
  private onClose(code?: number): void {
    this.hb?.();
    this.hb = null;
    this.socket = null;
    if (this.stopped) return;
    if (code !== undefined) {
      const reason = FATAL_CLOSE_CODES.get(code);
      if (reason !== undefined) return this.stopFatal(code, reason);
    }
    if (!this.ready && this.attempt + 1 >= MAX_INITIAL_ATTEMPTS) {
      return this.fail(new Error('gateway did not become ready'));
    }
    const delay = (this.options.backoff ?? nextBackoff)(this.attempt);
    this.attempt += 1;
    this.log('warn', 'gateway closed; reconnecting', { delay_ms: delay, attempt: this.attempt });
    this.rc = this.schedule(() => {
      this.rc = null;
      this.open();
    }, delay);
  }
  /** A terminal close: stop timers, settle a pending start(), and tell the runtime. */
  private stopFatal(code: number, reason: string): void {
    this.stopped = true;
    this.hb?.(); this.rc?.();
    this.hb = this.rc = null;
    this.ready = false;
    const error = new Error(`gateway closed permanently: ${code} (${reason})`);
    this.log('error', error.message);
    this.reject?.(error);
    this.resolve = this.reject = this.pending = null;
    this.options.onFatal?.({ code, reason });
  }
  private fail(error: Error): void {
    this.stopped = true;
    this.log('error', error.message);
    this.reject?.(error);
    this.reject = this.resolve = this.pending = null;
  }
  private send(payload: unknown): void {
    this.socket?.send(JSON.stringify(payload));
  }
  private log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
    this.options.log?.(level, message, context);
  }
}
