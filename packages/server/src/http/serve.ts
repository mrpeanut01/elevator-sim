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
   * How many trusted reverse proxies sit in front of this process. **Default `0`.**
   *
   * § D242's per-caller budget is only a budget if the key cannot be chosen by the caller, and
   * `x-forwarded-for` is a request header — anyone can send one, with anything in it. The chain is
   * read from the right, one entry skipped per hop, because a caller can only prepend to it; see
   * {@link clientIpOf} for why the left-most entry — which this used to take — is the caller's own
   * text rather than any hop's observation.
   *
   * `0` means *no proxy*: the socket peer, which cannot be forged. It is the default because an
   * operator who has not thought about their topology must get the answer that is safe rather than
   * the one that is convenient, and because **an over-count is exploitable**: two hops configured
   * behind one real proxy reads a caller-supplied address as the client.
   *
   * The cost of `0` behind a proxy is stated rather than hidden: every caller shares one bucket,
   * because the socket peer is the ingress. That is a denial-of-service surface on the shared
   * budget, not an escape from it, and it is the weaker of the two failures.
   */
  readonly trustedHops?: number | undefined;
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
    clientIp: clientIpOf(incoming, options.trustedHops ?? 0),
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
 * ## The left-most entry was the wrong end, and § D242 said so in good faith
 *
 * § D242 § 2 reads: *"only its left-most entry, the address the first trusted hop saw"*. The second
 * clause does not describe the first. `x-forwarded-for` grows by **appending** — each hop adds the
 * peer *it* saw — so the left-most entry is not what any hop observed, it is **whatever the original
 * caller typed**. A sender who varies one header therefore gets a fresh budget per request while
 * looking like a hundred people, which is the exact attack § D242 § 2 names in its own first
 * sentence and then leaves open in its second.
 *
 * It has never been exploitable, because `ELEVATOR_SIM_TRUST_PROXY` was set nowhere in `infra/`,
 * `scripts/`, `compose.yaml` or the `Dockerfile` and the flag therefore defaulted to `false`. That
 * is luck rather than a control: the first operator to reach for the obvious fix for the *other*
 * half of this problem — every caller sharing one bucket behind the ingress — would have turned the
 * budget off by turning it on.
 *
 * ## A count of trusted hops, not a boolean
 *
 * The chain is `[...x-forwarded-for, socketPeer]`, and the client is the entry `trustedHops` places
 * from its right end. `0` is the socket peer and the shipped default; `1` is correct behind exactly
 * one trusted reverse proxy. Because a caller can only prepend, an answer counted from the right is
 * one they cannot reach — provided the count is exact. It is not inferred, defaulted to a guess, or
 * derived from anything observable at run time, because every one of those is a way to be wrong
 * silently.
 *
 * **What is not yet established is the right value for this deployment.** Azure Container Apps
 * fronts the app with Envoy; whether it *appends* the peer to a caller-supplied header or
 * *replaces* the header outright decides whether `1` is correct, and it has not been measured. Until
 * it is, `infra/azure/main.bicep` sets nothing and the deployment keeps the shared-bucket behaviour
 * it has today — which is a real weakness (§ D242's per-caller budget is presently one bucket for
 * the whole internet) and is strictly better than a forgeable key.
 *
 * `undefined` rather than a placeholder when there is nothing to say, so the decision about what an
 * unattributable caller costs is made once, in the route that charges, and not twice.
 */
export function clientIpOf(incoming: IncomingMessage, trustedHops: number): string | undefined {
  const socket = incoming.socket.remoteAddress ?? undefined;
  if (trustedHops <= 0) return socket;

  // The forwarding chain as the app actually sees it: every `x-forwarded-for` entry in order, then
  // the socket peer — which is not in the header, because the hop that would have written it is the
  // one this process is talking to. Appending it is what makes the count below say the same thing
  // at zero hops as at three.
  const header = incoming.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(',') : header;
  const chain = [
    ...(raw ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
    ...(socket === undefined ? [] : [socket]),
  ];

  // Count from the **right**, skipping one entry per trusted hop. A caller can only ever *prepend*
  // to this chain — every hop appends what it saw — so counting from the right is what makes the
  // answer unforgeable, and counting from the left is what makes it forgeable. That is the whole
  // difference between this and the boolean it replaces.
  //
  // A chain shorter than the configured hop count means the request did not arrive through the
  // topology this is configured for. It falls back to the **socket address**, which is the one
  // value in here that no caller can write. Returning the left-most entry instead would hand the
  // attacker precisely the value this function exists to make unreachable, and returning
  // `undefined` would put them in the shared `'unattributed'` bucket, which is a bucket somebody
  // else is also in.
  //
  // **Over-counting is still exploitable and no code here can fix it**: configure two hops behind
  // one proxy and a caller who sends one address of their own is read as that address. The count
  // must equal the real number of trusted proxies, which is why it defaults to zero and why
  // `main.ts` refuses to guess it.
  const index = chain.length - 1 - trustedHops;
  return index >= 0 ? chain[index] : socket;
}
