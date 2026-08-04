/**
 * The socket. Everything above this file is a pure function; this is the part that binds a port.
 *
 * It is deliberately thin and deliberately dull, because it is the one piece the tests do not
 * drive through the API: `api.test.ts` calls `handle()` directly with no port bound, which is only
 * a fair test if this file contains no decisions. So it contains four — a body-size cap, a JSON
 * parse, a bearer-token read and a CORS answer — and each is stated here rather than left implicit.
 */

import { createServer, type IncomingMessage, type Server as NodeServer, type ServerResponse } from 'node:http';

import type { Api, ApiRequest } from './api.js';

/**
 * The largest request body the server will read.
 *
 * A submission is a handful of ids, four numbers and a seed — under a kilobyte. 64 KB is generous
 * by two orders of magnitude and still bounded, which is the point: an unauthenticated endpoint
 * that will buffer whatever it is sent is a memory-exhaustion invitation.
 */
export const MAX_BODY_BYTES = 64 * 1024;

export interface ServeOptions {
  readonly api: Api;
  readonly port: number;
  /**
   * Origins allowed to call this API from a browser, or `'*'`.
   *
   * Explicit and required. A default of `'*'` is how a CORS policy becomes "no policy" without
   * anybody deciding it should be.
   */
  readonly allowOrigin: string;
}

export function serve(options: ServeOptions): NodeServer {
  const server = createServer((incoming, response) => {
    void respond(options, incoming, response);
  });
  server.listen(options.port);
  return server;
}

async function respond(options: ServeOptions, incoming: IncomingMessage, response: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': options.allowOrigin,
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    // The API answers with JSON that is never a document; sniffing it as one is the XSS this
    // header exists to close.
    'x-content-type-options': 'nosniff',
  };

  if (incoming.method === 'OPTIONS') {
    response.writeHead(204, headers);
    response.end();
    return;
  }

  const url = new URL(incoming.url ?? '/', 'http://localhost');
  let body: unknown;
  try {
    body = await readJson(incoming);
  } catch (error) {
    response.writeHead(400, headers);
    response.end(
      JSON.stringify({
        error: 'bad-request',
        detail: error instanceof Error ? error.message : 'the request body could not be read',
      }),
    );
    return;
  }

  const request: ApiRequest = {
    method: incoming.method ?? 'GET',
    path: url.pathname,
    query: new Map(url.searchParams),
    body,
    token: bearerOf(incoming.headers.authorization),
  };

  let result;
  try {
    result = await options.api(request);
  } catch {
    // The message is not forwarded. An unhandled error's text is the server's internals, and a
    // stack trace in a response body is a gift to whoever provoked it.
    response.writeHead(500, headers);
    response.end(JSON.stringify({ error: 'internal-error', detail: 'The server failed to handle that request.' }));
    return;
  }

  response.writeHead(result.status, headers);
  response.end(JSON.stringify(result.body));
}

/** Read and parse the body, refusing anything over {@link MAX_BODY_BYTES}. */
async function readJson(incoming: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of incoming) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    // Checked per chunk, not after the fact: a limit enforced once the whole body is in memory is
    // not a limit.
    if (size > MAX_BODY_BYTES) throw new Error(`a request body may not exceed ${String(MAX_BODY_BYTES)} bytes`);
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim().length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('the request body is not valid JSON');
  }
}

/** `Authorization: Bearer <token>` → the token. Anything else is no token at all. */
export function bearerOf(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer\s+(\S+)$/u.exec(header.trim());
  return match?.[1];
}
