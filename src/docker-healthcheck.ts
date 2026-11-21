import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Port the Docker image health check probes.
 *
 * `PORT=0` is rejected on purpose. The image publishes a fixed port and the
 * health check runs as a separate process, so it cannot learn the ephemeral
 * port the server actually bound; probing `http://127.0.0.1:0/healthz` always
 * fails and would report a working container as unhealthy. `parseConfig()`
 * still accepts `0` for bare-metal runs.
 */
export const DEFAULT_PORT = 3000;
const PROBE_TIMEOUT_MS = 4000;

export class HealthcheckConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HealthcheckConfigError';
  }
}

/** Parse `PORT` with the same decimal rules as `parseConfig`, minus the ephemeral `0`. */
export function probePort(raw: string | undefined): number {
  const value = (raw ?? '').trim();
  const port = value === '' ? DEFAULT_PORT : Number(value);
  if ((value !== '' && !/^\d+$/.test(value)) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new HealthcheckConfigError(
      'PORT must be a fixed integer between 1 and 65535 inside the Docker image; PORT=0 (ephemeral) is not supported',
    );
  }
  return port;
}

/** Resolve true only when `/healthz` answers 2xx within the timeout. */
export async function probeHealth(port: number, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  let port: number;
  try {
    port = probePort(process.env.PORT);
  } catch (error) {
    const message = error instanceof HealthcheckConfigError ? error.message : 'invalid PORT';
    process.stderr.write(`healthcheck: ${message}\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = (await probeHealth(port)) ? 0 : 1;
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) void main();
