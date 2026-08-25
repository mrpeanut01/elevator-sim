/**
 * **The socket, over a real socket.** The one test in this package that binds a port.
 *
 * `serve.ts`'s own docstring says the tests do not drive it, and that was true and deliberate for
 * five of its six decisions: `api.test.ts` calls `handle()` directly, which is a fair test exactly
 * because the transport contains nothing. The sixth broke the arrangement. A **302 to another
 * origin** is not a value `handle()` can return — it is a status line and a `Location` header
 * written by the transport, and the only honest way to assert it is to ask a listening server for a
 * page and read what comes back.
 *
 * What it is protecting, stated plainly, because it is not a hypothesis: for five days the deployed
 * Container App answered `GET /` with a **complete, working, four-day-old viewer** while the CDN
 * served the current one. Two 200s, two different products, no failing status code anywhere. The
 * image was built on 2026-08-08; Everyday Mode landed on 2026-08-12; the bundle in the image knew
 * nothing about it and said nothing about not knowing. See § D257 for why the split exists and
 * `ServeOptions.siteOrigin` for why the fix is a redirect rather than a rebuild.
 */

import { readFileSync } from 'node:fs';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import type { IncomingMessage } from 'node:http';

import type { Api } from './api.js';
import { clientIpOf, serve, type ServeOptions } from './serve.js';
import type { StaticAsset, StaticBundle } from './static.js';

const SITE = 'https://yellow-glacier.example';

/** A page that is unmistakably *this* server's copy, so a 200 can never be read as a redirect. */
const OWN_PAGE = '<!doctype html><title>the copy in this image</title>';

const BUNDLE: StaticBundle = new Map<string, StaticAsset>([
  [
    '/index.html',
    { body: Buffer.from(OWN_PAGE), contentType: 'text/html; charset=utf-8', immutable: false },
  ],
]);

/** Answers anything, distinguishably. The API is the half a redirect must never touch. */
const API: Api = (incoming) =>
  Promise.resolve({ status: 200, body: { reached: 'the api', path: incoming.path } });

let running: Server | undefined;

afterEach(async () => {
  const server = running;
  running = undefined;
  if (server !== undefined) {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});

/**
 * Bind an ephemeral port and return it.
 *
 * Port 0 so concurrent test files never collide, and the `listening` event is awaited rather than
 * assumed: `listen()` binds asynchronously, so `address()` is null for a tick and a test that read
 * it straight away would be flaky in exactly the way that gets a suite mistrusted.
 */
async function listening(options: Omit<ServeOptions, 'api' | 'port'>): Promise<number> {
  const server = serve({ api: API, port: 0, ...options });
  running = server;
  if (!server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  }
  return (server.address() as AddressInfo).port;
}

interface Answer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

/**
 * One request, no redirect following, and `Host` under the caller's control.
 *
 * `node:http` rather than `fetch`, for two reasons that are both about this file's subject.
 * `fetch` follows redirects by default — a test that followed one would leave the suite asking the
 * real internet for a page — and `Host` is a forbidden header there, which is the one header the
 * loop guard reads.
 */
async function ask(
  port: number,
  path: string,
  options: { readonly method?: string; readonly host?: string } = {},
): Promise<Answer> {
  return new Promise<Answer>((resolve, reject) => {
    const call = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        ...(options.host === undefined ? {} : { headers: { host: options.host } }),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    call.on('error', reject);
    call.end();
  });
}

/**
 * One request written as bytes, and everything the server writes back before it closes.
 *
 * Below `node:http` on purpose: the case this exists for is a request *target* a client library
 * would be entitled to normalise away, and the failure it is checking for is a server that writes
 * nothing at all — so the test has to be able to see an empty answer rather than hang waiting for
 * a parsed one. The timeout is the assertion's other half: without it a regression here would
 * present as a test run that never finishes.
 */
async function rawRequest(port: number, bytes: string): Promise<string> {
  const { connect } = await import('node:net');
  return new Promise<string>((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(bytes));
    let received = '';
    const stop = setTimeout(() => {
      socket.destroy();
      resolve(received);
    }, 2_000);
    socket.on('data', (chunk: Buffer) => (received += chunk.toString('utf8')));
    socket.on('close', () => {
      clearTimeout(stop);
      resolve(received);
    });
    socket.on('error', (error) => {
      clearTimeout(stop);
      reject(error);
    });
  });
}

describe('a split deployment does not serve a second copy of the page', () => {
  const split = { allowOrigin: SITE, siteOrigin: SITE, static: BUNDLE } as const;

  it('redirects the front door to the site', async () => {
    const port = await listening(split);

    const answer = await ask(port, '/');

    expect(answer.status).toBe(302);
    expect(answer.headers['location']).toBe(`${SITE}/`);
    // Not cached, so this is revocable by redeploying rather than by reaching into browsers.
    expect(answer.headers['cache-control']).toBe('no-store');
    expect(answer.body).toBe('');
  });

  it('carries the path and the query across, which is the shape a real bookmark has', async () => {
    const port = await listening(split);

    // The exact URL the old viewer rewrites itself to on load, and therefore the exact URL that is
    // in somebody's history. Dropping the query would send a returning player to a different run.
    const answer = await ask(port, '/?building=secure-tower&seed=252119022713829');

    expect(answer.headers['location']).toBe(`${SITE}/?building=secure-tower&seed=252119022713829`);
  });

  it('never redirects the API, which is what this origin is for', async () => {
    const port = await listening(split);

    const answer = await ask(port, '/api/challenges');

    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toEqual({ reached: 'the api', path: '/api/challenges' });
  });

  it('serves no asset from its own bundle, not just no index', async () => {
    // The bundle is *present* — that is the whole defect. A redirect that covered `/` and left
    // `/index.html` reachable would leave the stale page one URL away.
    const port = await listening(split);

    const answer = await ask(port, '/index.html');

    expect(answer.status).toBe(302);
    expect(answer.headers['location']).toBe(`${SITE}/index.html`);
  });

  it('answers HEAD the same way, because that is what a link checker sends', async () => {
    const port = await listening(split);

    const answer = await ask(port, '/', { method: 'HEAD' });

    expect(answer.status).toBe(302);
    expect(answer.headers['location']).toBe(`${SITE}/`);
  });

  it.each([
    ['//evil.example/', `${SITE}/`],
    ['//evil.example/assets/x.js', `${SITE}/assets/x.js`],
    ['/\\evil.example/', `${SITE}/`],
    ['http://evil.example/steal', `${SITE}/steal`],
  ])('cannot be talked into redirecting to somebody else: %s', async (target, expected) => {
    // A redirector that will send a caller anywhere they name is a phishing primitive, and this is
    // the shape it would take: a protocol-relative or absolute-form request target, since
    // `new URL('//evil.example/', 'https://site')` genuinely does resolve to `https://evil.example/`.
    //
    // The four rows are the mechanism rather than a sample. `respond` parses the target against
    // `http://localhost` before this branch runs, which puts `evil.example` in `url.host` — and only
    // `pathname` and `search` are ever read. The authority is gone before the header is built.
    const port = await listening(split);

    const answer = await ask(port, target);

    const location = String(answer.headers['location']);
    expect(location).toBe(expected);
    // The claim under the string comparison, in the terms that actually matter.
    expect(new URL(location).host).toBe(new URL(SITE).host);
  });

  it('will not loop when the caller is already at the origin it would be sent to', async () => {
    // An operator setting both origin variables to this app's own hostname is redundant rather than
    // wrong — `main.bicep`'s `customDomainHint` invites exactly that shape — and without the `Host`
    // guard it is an infinite redirect served by a container that looks perfectly healthy.
    const port = await listening(split);

    const answer = await ask(port, '/', { host: 'yellow-glacier.example' });

    expect(answer.status).toBe(200);
    expect(answer.body).toBe(OWN_PAGE);
  });
});

describe('a request target that is not a URL is answered, not dropped', () => {
  // Found while adding the redirect above, and it predates it: `GET //` is a well-formed request
  // line whose target the WHATWG parser refuses — an authority with no host. `respond` is invoked
  // as `void respond(...)`, so the throw became an **unhandled rejection**, nothing was ever
  // written, and the socket sat open until it timed out. Unauthenticated, one line, repeatable.
  //
  // Raw `net` rather than `http`, because a client library is entitled to normalise the target and
  // this test is specifically about the byte sequence that reaches the server.
  it('answers 400 rather than leaving the socket open forever', async () => {
    const port = await listening({ allowOrigin: 'null', static: BUNDLE });

    const answer = await rawRequest(port, 'GET // HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');

    expect(answer).toMatch(/^HTTP\/1\.1 400 /u);
    expect(answer).toContain('bad-request');
  });
});

/* -------------------------------------------------------------------------- *
 * The preflight
 * -------------------------------------------------------------------------- */

/**
 * Every method `api.ts` actually routes, read out of its own `switch`.
 *
 * **Derived rather than listed, because a list here is the thing that goes stale.** The preflight
 * and the router are two places that have to agree about what this server answers, and nothing
 * made them agree until this test: `DELETE /api/me` shipped while `access-control-allow-methods`
 * still read `GET, POST, OPTIONS`, which is a route that works from `curl` and from nothing a
 * browser can do. `api.test.ts` cannot see it — that file calls `handle()` with no browser in
 * front of it — so this is the only place the disagreement is observable.
 *
 * Source-reading, in `viz/src/menu/client.test.ts`'s idiom. It is a weaker instrument than driving
 * the code and it is the right one here, because the question is *what does the router claim to
 * serve* rather than *what does it do*.
 */
const ROUTED_METHODS = new Set(
  [...readFileSync(new URL('./api.ts', import.meta.url), 'utf8').matchAll(/case '([A-Z]+) \/api\//gu)].map(
    (match) => match[1] ?? '',
  ),
);

describe('the preflight names every method the API routes', () => {
  it('finds the routes it is supposed to be reading, so a broken match cannot pass', () => {
    // The guard that stops a regex which quietly matched nothing from satisfying both directions
    // below by having nothing to compare.
    expect(ROUTED_METHODS.size).toBeGreaterThanOrEqual(3);
    expect([...ROUTED_METHODS]).toContain('DELETE');
  });

  it('allows exactly those methods, no more and no fewer', async () => {
    const port = await listening({ allowOrigin: SITE });
    const answer = await ask(port, '/api/me', { method: 'OPTIONS' });
    expect(answer.status).toBe(204);

    const allowed = String(answer.headers['access-control-allow-methods'] ?? '')
      .split(',')
      .map((method) => method.trim())
      .filter((method) => method.length > 0);

    // `OPTIONS` is the preflight itself and is answered by the transport rather than routed, so it
    // is the one method that may appear here without a `case` behind it.
    expect(allowed).toContain('OPTIONS');
    expect(
      [...allowed].filter((method) => method !== 'OPTIONS').sort(),
      'the preflight and the router disagree: a method the API answers but the preflight omits is ' +
        'unreachable from a browser, and one the preflight names but the API does not route is an ' +
        'advertisement for a 404',
    ).toEqual([...ROUTED_METHODS].sort());
  });
});

describe('who the caller is, when a proxy is in front', () => {
  /**
   * The two fields {@link clientIpOf} reads, and nothing else.
   *
   * `THE_INGRESS` is the socket peer in every case here, because that is what a process behind a
   * reverse proxy actually sees — and the reason § D242's per-caller budget is one shared bucket at
   * zero hops rather than a per-caller one.
   */
  const THE_INGRESS = '10.0.0.1';

  function arriving(forwardedFor?: string | string[]): IncomingMessage {
    return {
      headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
      socket: { remoteAddress: THE_INGRESS },
    } as unknown as IncomingMessage;
  }

  it('reads the socket peer at zero hops, whatever the caller claims', () => {
    // The shipped default, and the one answer no caller can write.
    expect(clientIpOf(arriving('1.2.3.4'), 0)).toBe(THE_INGRESS);
    expect(clientIpOf(arriving(), 0)).toBe(THE_INGRESS);
  });

  it('reads what the single trusted hop saw at one hop', () => {
    // One proxy, honest caller: the proxy appended the peer it saw, and that is the right-most.
    expect(clientIpOf(arriving('203.0.113.7'), 1)).toBe('203.0.113.7');
  });

  it('cannot be forged by a caller who sends their own header — the whole point', () => {
    // The attack § D242 § 2 names and its own next sentence left open. A caller prepends whatever
    // they like; the ingress appends what it saw. Counting from the right steps over every entry
    // the caller could write, however many they write.
    const forged = clientIpOf(arriving('9.9.9.9, 8.8.8.8, 7.7.7.7, 203.0.113.7'), 1);
    expect(forged).toBe('203.0.113.7');
    expect(forged).not.toBe('9.9.9.9');
  });

  it('gives a caller no fresh budget however much they prepend', () => {
    // The property under the case above, stated as the limiter sees it: vary the header all you
    // like and the key does not move. That is what makes it a budget.
    const keys = new Set(
      ['a', 'b', 'c', 'd'].map((noise) => clientIpOf(arriving(`${noise}, 203.0.113.7`), 1)),
    );
    expect(keys).toEqual(new Set(['203.0.113.7']));
  });

  it('counts one entry per hop, so two proxies read one further left', () => {
    expect(clientIpOf(arriving('9.9.9.9, 203.0.113.7, 10.0.0.9'), 2)).toBe('203.0.113.7');
  });

  it('falls back to the socket peer when the chain is shorter than the count', () => {
    // A request that did not arrive through the configured topology. The left-most entry is the one
    // answer that must never come out of here, because it is the caller's own text.
    expect(clientIpOf(arriving('9.9.9.9'), 3)).toBe(THE_INGRESS);
    expect(clientIpOf(arriving(), 1)).toBe(THE_INGRESS);
  });

  it('joins a repeated header rather than reading only the first of them', () => {
    // Node hands back `string[]` when the header appears more than once. Taking `header[0]` — which
    // the previous implementation did — would read one caller-supplied line and ignore the hop's.
    expect(clientIpOf(arriving(['9.9.9.9', '203.0.113.7']), 1)).toBe('203.0.113.7');
  });

  it('ignores blank entries rather than counting them as hops', () => {
    expect(clientIpOf(arriving('9.9.9.9, , 203.0.113.7'), 1)).toBe('203.0.113.7');
  });

  /**
   * The header values Azure Container Apps' ingress actually produced, byte for byte.
   *
   * Measured on 2026-08-14 against this deployment's own environment (`elevsim-env`) with a
   * throwaway echo app, deleted after — § D341. The caller was at `143.105.1.202` and forged the
   * left of the header; the ingress **appended** what it saw in every case.
   *
   * These are here rather than in prose because `ELEVATOR_SIM_TRUSTED_HOPS: '1'` in
   * `infra/azure/main.bicep` is only correct if this shape holds. If a future platform change makes
   * the ingress *replace* the header instead, the fourth case below starts returning the forged
   * address and this test goes red — which is the only warning anybody would get, since a forged
   * key looks exactly like an honest one from every other angle.
   */
  describe('against the header the real ingress produced', () => {
    const CALLER = '143.105.1.202';

    it.each([
      ['sent nothing', CALLER, CALLER],
      ['sent one address', `9.9.9.9,${CALLER}`, CALLER],
      ['sent three', `9.9.9.9, 8.8.8.8, 7.7.7.7,${CALLER}`, CALLER],
      ['sent the header twice', `9.9.9.9,8.8.8.8,${CALLER}`, CALLER],
      ['sent a trailing comma', `9.9.9.9,,${CALLER}`, CALLER],
    ])('reads the caller, not the forgery: %s', (_case, header, expected) => {
      expect(clientIpOf(arriving(header), 1)).toBe(expected);
    });

    it('would have read the forgery under the rule this replaced', () => {
      // Not a hypothetical: `ELEVATOR_SIM_TRUST_PROXY=true` plus the left-most read was one
      // environment variable away, and it is the obvious fix for the shared-bucket problem that
      // the hop count actually solves. This is what that combination would have keyed on.
      const leftMost = `9.9.9.9, 8.8.8.8, 7.7.7.7,${CALLER}`.split(',')[0]?.trim();
      expect(leftMost).toBe('9.9.9.9');
      expect(clientIpOf(arriving(`9.9.9.9, 8.8.8.8, 7.7.7.7,${CALLER}`), 1)).not.toBe(leftMost);
    });
  });
});

describe('a same-origin deployment is untouched', () => {
  const sameOrigin = { allowOrigin: 'null', static: BUNDLE } as const;

  it('serves its own page when no site origin is set, which is the shipped container', async () => {
    const port = await listening(sameOrigin);

    const answer = await ask(port, '/');

    expect(answer.status).toBe(200);
    expect(answer.body).toBe(OWN_PAGE);
  });

  it('still 404s an unknown path through the API rather than rewriting it to the page', async () => {
    // `assetFor` has deliberately no catch-all, and the redirect must not have become one.
    const port = await listening(sameOrigin);

    const answer = await ask(port, '/no-such-asset');

    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toEqual({ reached: 'the api', path: '/no-such-asset' });
  });
});
