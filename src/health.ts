import { createServer, type OutgoingHttpHeaders, type Server, type ServerResponse } from 'node:http';

export interface HealthOptions {
  version: string;
  /** Injectable clock keeps `uptime` deterministic in tests. */
  now?: () => number;
  startedAt?: number;
}

const ALLOWED_METHODS = 'GET, HEAD';

function send(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  { includeBody = true, headers = {} }: { includeBody?: boolean; headers?: OutgoingHttpHeaders } = {},
): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...headers,
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(includeBody ? body : undefined);
}

export function createHealthServer({ version, now = Date.now, startedAt = now() }: HealthOptions): Server {
  return createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0];
    const includeBody = request.method !== 'HEAD';
    if (path !== '/healthz') return send(response, 404, { error: 'not found' }, { includeBody });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return send(response, 405, { error: 'method not allowed' }, { headers: { allow: ALLOWED_METHODS } });
    }
    send(
      response,
      200,
      { status: 'ok', uptime: Math.max(0, (now() - startedAt) / 1000), version },
      { includeBody },
    );
  });
}
