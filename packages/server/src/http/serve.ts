/**
 * The socket. Everything above this file is a pure function; this is the part that binds a port.
 *
 * It is deliberately thin and deliberately dull, because it is the one piece the tests do not
 * drive through the API: `api.test.ts` calls `handle()` directly with no port bound, which is only
 * a fair test if this file contains no decisions. So it contains five — a body-size cap, a JSON
 * parse, a bearer-token read, a CORS answer and **who the caller is** — and each is stated here
 * rather than left implicit.
 */

import { createServer, type IncomingMessage, type Server as NodeServer, type ServerResponse } from 'node:http';

import type { Api, ApiRequest } from './api.js';
import { assetFor, cacheControlFor, type StaticBundle } from './static.js';

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
  /**
   * The built viewer, served from this same origin. Omitted, the server is the JSON API alone.
   *
   * Optional because the API is useful without it — the tests drive `handle()` directly and never
   * bind a port — and because a missing bundle must be a deployment's decision rather than a
   * startup crash for anyone running the API on its own.
   */
  readonly static?: StaticBundle | undefined;
  /**
   * Whether `x-forwarded-for` may be believed. **Default `false`.**
   *
   * § D242's per-caller budget is only a budget if the key cannot be chosen by the caller, and
   * `x-forwarded-for` is a request header — anyone can send one, with anything in it. Trusting it
   * unconditionally does not merely weaken the limit, it *removes* it, because a sender who varies
   * the header gets a fresh budget per request while looking like a hundred different people.
   *
   * So it is believed only when an operator says there is a proxy in front, and even then only its
   * **left-most** entry, which is the address the first trusted hop saw. Behind Azure Container
   * Apps' ingress that is the real client; with no proxy the socket address is, and the default
   * being the socket address means an operator who has not thought about it gets the answer that
   * cannot be forged rather than the one that is convenient.
   */
  readonly trustProxy?: boolean | undefined;
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

  // The viewer, before the API and only outside `/api/`. The prefix is the whole routing rule:
  // every route `api.ts` answers begins with it, so nothing here can shadow an endpoint, and a
  // future endpoint cannot be shadowed by someone adding a file to the bundle.
  //
  // A non-API path with no matching asset falls through to the API's own 404 rather than being
  // rewritten to `index.html` — see `assetFor` on why there is deliberately no catch-all.
  if (options.static !== undefined && !url.pathname.startsWith('/api/')) {
    if (incoming.method === 'GET' || incoming.method === 'HEAD') {
      const asset = assetFor(options.static, url.pathname);
      if (asset !== undefined) {
        response.writeHead(200, {
          'content-type': asset.contentType,
          'cache-control': cacheControlFor(asset),
          // Same reason as the API's: the browser must not re-decide what it was handed.
          'x-content-type-options': 'nosniff',
        });
        // A HEAD carries the headers and no body, which is what makes it a HEAD.
        response.end(incoming.method === 'HEAD' ? undefined : asset.body);
        return;
      }
    }
  }

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
    clientIp: clientIpOf(incoming, options.trustProxy ?? false),
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

/**
 * Who is calling, for § D242's per-caller budget.
 *
 * The socket address unless {@link ServeOptions.trustProxy} says otherwise, and then the
 * **left-most** `x-forwarded-for` entry — the address the first trusted hop saw. Right-most would be
 * the proxy itself, which is one bucket for the whole internet; taking an arbitrary middle entry is
 * taking whatever the caller wrote there.
 *
 * `undefined` rather than a placeholder when there is nothing to say, so the decision about what an
 * unattributable caller costs is made once, in the route that charges, and not twice.
 */
export function clientIpOf(incoming: IncomingMessage, trustProxy: boolean): string | undefined {
  if (trustProxy) {
    const header = incoming.headers['x-forwarded-for'];
    const raw = Array.isArray(header) ? header[0] : header;
    const first = raw?.split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  return incoming.socket.remoteAddress ?? undefined;
}
