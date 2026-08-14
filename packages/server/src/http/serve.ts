/**
 * The socket. Everything above this file is a pure function; this is the part that binds a port.
 *
 * It is deliberately thin and deliberately dull, because it is the one piece the tests do not
 * drive through the API: `api.test.ts` calls `handle()` directly with no port bound, which is only
 * a fair test if this file contains no decisions. So it contains six — a body-size cap, a JSON
 * parse, a bearer-token read, a CORS answer, **who the caller is**, and **whether this origin
 * serves the page at all** — and each is stated here rather than left implicit.
 *
 * The sixth is the newest and it is the one with a port bound over it: `serve.test.ts` listens on a
 * real socket, because a redirect is the one behaviour in this file that cannot be observed by
 * calling `handle()`. It exists because the split deployment (§ D257) leaves **two** copies of the
 * page on the internet — the CDN's, which redeploys on every push to `main`, and this image's,
 * which redeploys when someone remembers — and the second one answered `/` for five days with a
 * viewer four days older than the one that had shipped.
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
   * The one origin allowed to call this API from a browser, or `'null'` for none.
   *
   * Explicit and required. A default of `'*'` is how a CORS policy becomes "no policy" without
   * anybody deciding it should be — and since § D257 `'*'` is not merely undefaulted but
   * unreachable: `main.ts`'s `allowOriginFrom` refuses it at boot, so no environment can produce
   * it. This field is still a plain string and this function still writes whatever it is handed
   * into the header, because the decision belongs at the place that reads the environment and the
   * tests hand it values directly.
   *
   * Singular on purpose. A list would need `Vary: Origin` and a per-request match against the
   * request's own `Origin` header, which is a second place deciding who may call — and the only
   * deployment this product has is one viewer, at one origin.
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
   * Where the page actually is, when it is not here. Absent, this origin serves its own bundle.
   *
   * Set, every `GET`/`HEAD` outside `/api/` is a **302** to this origin carrying the same path and
   * query, and {@link ServeOptions.static} is never consulted for them. The API is untouched, which
   * is the whole point: in a split deployment this process is the API, and the bundle baked into
   * its image is a *second* copy of the page whose only possible relationship to the first is being
   * older than it.
   *
   * That is not a hypothetical. The container answered `/` with a viewer built four days before the
   * one on the CDN, for as long as nobody rebuilt the image — the page loaded, drew, and was simply
   * the previous product, with no failing status code anywhere to say so. It is § D243's silent
   * misconfiguration with the polarity reversed: there, a page that could not find its API; here, an
   * API serving a page nobody asked it for.
   *
   * **This is derived, not configured.** `main.ts` reads it off the two origin variables that a
   * split deployment already sets, so there is no seventh value to keep in agreement with the other
   * three — see `siteOriginFrom`.
   *
   * Two things it deliberately is not:
   *
   * - **Not a 301.** A permanent redirect is cached by the browser and outlives the deployment that
   *   issued it, so undoing this would mean undoing it in strangers' browsers. 302 costs a request
   *   and is revocable by redeploying, which is the same property `gh variable delete
   *   AZURE_SWA_NAME` has for the other half of § D257.
   * - **Not unconditional.** A request whose `Host` is already this origin's target is served
   *   locally rather than redirected — see `redirectTargetFor`. An operator who sets both origin
   *   variables to this app's own hostname (which the template's `customDomainHint` invites, and
   *   which is redundant rather than wrong) would otherwise get an infinite redirect, and a
   *   configuration mistake must not be able to turn the server into a loop.
   */
  readonly siteOrigin?: string | undefined;
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

  // The request target. **This parse can fail**, which is not obvious and was not handled: `GET //`
  // is a well-formed request line, Node hands it over as `'//'`, and the WHATWG parser refuses it
  // outright — an authority with no host. Thrown from here the rejection was unhandled (`respond`
  // is called as `void respond(...)`), so the caller received **no bytes at all** and the socket
  // stayed open until it timed out. One line, unauthenticated, and repeatable: a connection leak
  // with a 400's worth of cause. Found while adding the redirect below, which reads `url` too.
  let url: URL;
  try {
    url = new URL(incoming.url ?? '/', 'http://localhost');
  } catch {
    response.writeHead(400, headers);
    response.end(
      JSON.stringify({ error: 'bad-request', detail: 'the request target is not a URL' }),
    );
    return;
  }

  // The page is somewhere else, so say so instead of answering with a copy of it. Ahead of the
  // static branch, because when both are set this one wins — an image's own bundle is exactly what
  // must stop being served. The `/api/` guard is inside `redirectTargetFor` rather than here, for
  // the reason the static branch states below: the prefix is the routing rule, and no deployment
  // parameter may be able to move an endpoint.
  if (incoming.method === 'GET' || incoming.method === 'HEAD') {
    const location = redirectTargetFor(options.siteOrigin, incoming.headers.host, url);
    if (location !== undefined) {
      response.writeHead(302, {
        location,
        // The redirect is a deployment's current opinion about where its page lives, not a fact
        // about the URL. Caching it would outlive the deployment, which is the property that makes
        // a 301 wrong here (see `ServeOptions.siteOrigin`) and would make a cached 302 wrong too.
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end();
      return;
    }
  }

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

/**
 * Where a non-API `GET` should be sent, or `undefined` to answer it here.
 *
 * Module-private on purpose: it is one branch of {@link respond} and has no caller outside this
 * file, so exporting it would put a function in the package's public surface whose only non-test
 * caller is twelve lines up. `serve.test.ts` drives it through a bound socket instead, which is
 * also the only way to observe the header it exists to produce.
 *
 * Three refusals, in order, and each one is a thing that has gone wrong somewhere:
 *
 * 1. **No site origin** — the same-origin deployment and every local run. Nothing to redirect to.
 * 2. **`/api/`** — never. The API is what this origin is *for* in a split deployment, and a
 *    deployment parameter that could move an endpoint would be a parameter that can break the
 *    product from outside the product.
 * 3. **The caller is already at the target** — the loop guard. Compared on `Host` rather than on
 *    configuration, because the server does not know its own public origin and cannot be told one
 *    without adding the seventh value this whole seam is written to avoid.
 *
 * **Why this cannot be turned into an open redirect**, stated as the mechanism that actually holds
 * rather than the one it is tempting to claim. The obvious worry is a protocol-relative target —
 * `GET //evil.example/` — because `new URL('//evil.example/', 'https://site')` really does resolve
 * to `https://evil.example/`. It cannot happen here, and *not* because of how the location is
 * concatenated: by the time this function runs, `respond` has already parsed the target against
 * `http://localhost`, and that parse puts `evil.example` in `url.host` — a field this function never
 * reads. Every hostile form collapses the same way, measured rather than assumed:
 *
 * | request target | `url.pathname` | location |
 * |---|---|---|
 * | `//evil.example/` | `/` | `<site>/` |
 * | `//evil.example/assets/x.js` | `/assets/x.js` | `<site>/assets/x.js` |
 * | `/\evil.example/` | `/` | `<site>/` |
 * | `http://evil.example/steal` | `/steal` | `<site>/steal` |
 *
 * So the property is **only `pathname` and `search` are read**, and the concatenation is what makes
 * that property visible at the point of use — `new URL(url.pathname, siteOrigin)` would be equally
 * safe today and would put the reader one refactor away from thinking an authority could survive.
 * `serve.test.ts` pins all four rows.
 */
function redirectTargetFor(
  siteOrigin: string | undefined,
  host: string | undefined,
  url: URL,
): string | undefined {
  if (siteOrigin === undefined) return undefined;
  if (url.pathname.startsWith('/api/')) return undefined;
  if (host !== undefined && host.trim().toLowerCase() === hostOf(siteOrigin)) return undefined;
  // `url` came from the WHATWG parser, which percent-encodes control characters — so neither half
  // can carry the CR/LF that would make this a header injection rather than a redirect.
  return `${siteOrigin}${url.pathname}${url.search}`;
}

/** The `host:port` of an origin, lowercased, for comparison against a request's `Host` header. */
function hostOf(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    // Unreachable from `main.ts`, which validates the origin at boot with `requireOrigin`. A test
    // or a future caller handing this a non-URL gets no loop guard rather than a crash in the one
    // branch whose job is to keep a misconfiguration from becoming an infinite redirect.
    return '';
  }
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
