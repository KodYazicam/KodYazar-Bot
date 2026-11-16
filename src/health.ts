import { createServer, type Server, type ServerResponse } from 'node:http';

export interface HealthOptions {
  version: string;
  /** Injectable clock keeps `uptime` deterministic in tests. */
  now?: () => number;
  startedAt?: number;
}
function send(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

export function createHealthServer({ version, now = Date.now, startedAt = now() }: HealthOptions): Server {
  return createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0];
    if (path !== '/healthz') return send(response, 404, { error: 'not found' });
    if (request.method !== 'GET') return send(response, 405, { error: 'method not allowed' });
    send(response, 200, { status: 'ok', uptime: Math.max(0, (now() - startedAt) / 1000), version });
  });
}
