/**
 * The fault record's shape and its redaction — GitHub issue **#242**, AC2.
 *
 * ## The defect, quoted from the code it was found in
 *
 * `http/serve.ts` handled every failure of every route with this:
 *
 * ```ts
 * } catch {
 *   response.writeHead(500, headers);
 *   response.end(JSON.stringify({ error: 'internal-error', detail: '…' }));
 * ```
 *
 * A `catch` with **no binding**. The error object was not captured, not logged and not counted, so
 * a route that threw produced a 500 for the caller and complete silence in the container's log
 * stream. Across the whole of `packages/server/src` there were three `console` calls, all in
 * `main.ts`, and exactly one of them an error — on the boot path. Nothing anywhere reported a
 * failure of a request, and the deployment runs at `minReplicas: 0`, so there is not even a process
 * sitting there for somebody to attach to afterwards.
 *
 * ## Two things this file does on purpose, because both look like omissions
 *
 * **It drives only what ships.** `faults.ts` exports two functions and its types, and the
 * classifier and the route reducer are module-private — so the cases below reach them through
 * `serverFaultOf`, which is what `serve.ts` actually calls. `everyday/support.ts` states the rule
 * this follows: *a ceiling exported for a test to import is an export with no caller.*
 *
 * **The marker and the bound are written out as literals here rather than imported.** A test that
 * compared the output against the constant that produced it cannot fail when the constant changes,
 * and a change to that constant silently breaks every alert rule keyed on it. The literal in this
 * file is the pin — an alert rule keys on the text, so the text is what a test must hold.
 *
 * ## Every case below is a positive control
 *
 * The redaction ones especially: each hands the classifier something a request can really carry —
 * an address, a token, an identifier — and requires it to be absent from the line that is written.
 * A redactor degrades in one direction, by stopping redacting, and it looks fine from the inside
 * either way.
 */
import { describe, expect, it } from 'vitest';

import { faultLineOf, serverFaultOf } from './faults.js';

/** The one form `serve.ts` builds: a request that threw. */
const onRequest = (path: string, error: unknown, method = 'GET'): string =>
  faultLineOf(serverFaultOf({ at: 'request', method, path, error }));

const kindOf = (error: unknown): string => serverFaultOf({ at: 'boot', error }).kind;
const routeOf = (path: string): string | undefined =>
  serverFaultOf({ at: 'request', method: 'GET', path, error: new Error('x') }).route;

describe('the kind — an error class, and never its message', () => {
  it('names the class of a built-in error', () => {
    expect(kindOf(new TypeError('x'))).toBe('TypeError');
    expect(kindOf(new RangeError('x'))).toBe('RangeError');
    expect(kindOf(new Error('x'))).toBe('Error');
  });

  /*
   * The case that failed the first draft of the classifier, which read `error.name`. A subclass
   * that does not assign `this.name` inherits `Error.prototype.name`, so every error class this
   * codebase would write reads `'Error'` through the conventional field — the one distinction this
   * record exists to draw, lost on exactly the classes it is for.
   */
  it('names a class this codebase might define', () => {
    class StoreError extends Error {}
    expect(kindOf(new StoreError('x'))).toBe('StoreError');
  });

  it('still names the class when a subclass does assign its own name', () => {
    class MailError extends Error {
      public override readonly name = 'MailError';
    }
    expect(kindOf(new MailError('x'))).toBe('MailError');
  });

  it('refuses a thing that is not an error at all', () => {
    expect(kindOf('a string was thrown')).toBe('non-error');
    expect(kindOf(undefined)).toBe('non-error');
    expect(kindOf({ name: 'Pretend' })).toBe('non-error');
  });

  /*
   * `name` is a writable property on a thrown object. A caller cannot set it, but the throwing code
   * can set it to a sentence, and a sentence is an unbounded string where a vocabulary belongs.
   */
  it('does not carry a name that is a sentence', () => {
    const shaped = new Error('x');
    shaped.name = 'not a class name, and it is 4 words long';
    expect(kindOf(shaped)).toBe('Error');

    /*
     * The last resort, reached only when neither route yields a class: an anonymous subclass — a
     * `class extends Error {}` assigned to nothing, which some transpiled output produces — whose
     * instance also carries a sentence in `name`.
     */
    const Anonymous = class extends Error {};
    Object.defineProperty(Anonymous, 'name', { value: '' });
    const thrown = new Anonymous('x');
    thrown.name = 'a whole sentence where a class belongs';
    expect(kindOf(thrown)).toBe('error');
    expect(faultLineOf(serverFaultOf({ at: 'boot', error: thrown }))).not.toContain('sentence');
  });

  /*
   * The whole of `docs/26` P-4's hazard in one assertion: a thrown message can contain anything,
   * including somebody else's personal data, because it is often built by interpolating whatever
   * the request carried. Nothing from an error's message may appear in what is written.
   */
  it('carries no part of the message, and a message is where the personal data is', () => {
    const line = onRequest(
      '/api/auth/request-link',
      new Error('could not send the link to someone@example.test — token abc123'),
      'POST',
    );
    expect(line).not.toContain('someone@example.test');
    expect(line).not.toContain('abc123');
    expect(line).not.toContain('could not send');
  });

  it('carries no stack, and a stack names this machine', () => {
    const line = onRequest('/api/me', new Error('x'));
    expect(line).not.toContain('at ');
    expect(line).not.toContain('.ts:');
  });
});

describe('the route — the shape of a path, never the path', () => {
  it('leaves a shipped route alone, because every one of them is fixed', () => {
    for (const route of [
      '/api/wake',
      '/api/auth/request-link',
      '/api/me/display-name',
      '/api/board-distribution',
      '/api/telemetry/forget',
    ]) {
      expect(routeOf(route), route).toBe(route);
    }
  });

  it('reduces a segment that is not vocabulary-shaped', () => {
    expect(routeOf('/api/board/8f14e45f-ea4d-4c8a-9b1f-000000000000')).toBe('/api/board/:v');
    expect(routeOf('/api/me/AbC123XyZ')).toBe('/api/me/:v');
  });

  /*
   * A path is caller-supplied and unbounded — `/`, then anything. Without a bound this field is a
   * log line whose size and cardinality are chosen by whoever is probing the server, which is the
   * shape a log flood costs money in. 64 is written out rather than imported: see the header.
   */
  it('is bounded in depth and in length', () => {
    const deep = `/${Array.from({ length: 40 }, (_u, i) => `s${String(i)}`).join('/')}`;
    const shaped = routeOf(deep) ?? '';
    expect(shaped.length).toBeLessThanOrEqual(64);
    expect(shaped.endsWith('/…')).toBe(true);
  });

  it('reduces a path that is an attempt rather than a route', () => {
    expect(routeOf('/wp-admin/setup-config.php')).toBe('/wp-admin/:v');
    expect(routeOf('/.env')).toBe('/:v');
    expect(routeOf('/../../etc/passwd')).toBe('/:v/:v/etc/passwd');
  });

  it('carries no query and no fragment, because a path never has one here', () => {
    expect(routeOf('/api/board?board=midtown&token=secret')).toBe('/api/board');
    expect(routeOf('/api/board#x')).toBe('/api/board');
  });

  it('answers something for a path that is empty or strange', () => {
    expect(routeOf('')).toBe('/');
    expect(routeOf('/')).toBe('/');
    expect(routeOf('//')).toBe('/');
  });
});

describe('the method', () => {
  it('carries one this server answers', () => {
    for (const method of ['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PUT', 'PATCH']) {
      expect(
        serverFaultOf({ at: 'request', method, path: '/api/me', error: new Error('x') }).method,
      ).toBe(method);
    }
  });

  /* The method is read off the socket and is whatever the caller wrote on the first line. */
  it('reduces one it does not', () => {
    expect(
      serverFaultOf({
        at: 'request',
        method: 'PROPFIND-or-whatever-was-sent',
        path: '/api/me',
        error: new Error('x'),
      }).method,
    ).toBe('other');
  });
});

describe('the line — the thing an alert rule keys on', () => {
  /*
   * The literal, and it is the pin. An alert rule keys on this text; a test that read it back out
   * of the constant that wrote it could not fail when the constant moved, and the first anyone
   * would know is an alert that stopped firing.
   */
  it('starts with the marker and is one line', () => {
    const line = onRequest('/api/me', new TypeError('x'));
    expect(line.startsWith('elevator-sim-fault')).toBe(true);
    expect(line).not.toContain('\n');
  });

  /*
   * The startup line this server writes begins `elevator-sim listening`, so a rule keyed on
   * `elevator-sim` alone would fire on every cold start — and this deployment cold-starts
   * constantly, at `minReplicas: 0`. The marker has to be distinguishable from it.
   */
  it('is distinguishable from the one ordinary line this server writes', () => {
    expect('elevator-sim listening on 8080 — serving its own page').not.toContain(
      'elevator-sim-fault',
    );
  });

  it('names where, what and which route, in a form a person can read', () => {
    const line = onRequest('/api/board', new TypeError('x'));
    expect(line).toBe('elevator-sim-fault at=request kind=TypeError method=GET route=/api/board');
  });

  it('carries the three faults that are not a request', () => {
    for (const at of ['boot', 'unhandled-rejection', 'uncaught-exception'] as const) {
      const line = faultLineOf(serverFaultOf({ at, error: new Error('x') }));
      expect(line, at).toBe(`elevator-sim-fault at=${at} kind=Error`);
      /* No request, so no route and no method — a placeholder would invent one. */
      expect(line, at).not.toContain('route=');
      expect(line, at).not.toContain('method=');
    }
  });

  /*
   * Every field is one this module produced from a closed vocabulary. Asserting the whole line's
   * shape rather than its values is what makes a later field that carried caller text fail here.
   */
  it('is entirely made of the vocabulary, so no caller text can reach a log', () => {
    const line = onRequest('/api/scores/../../secret', new Error('someone@example.test'), 'POST');
    expect(line).toMatch(/^elevator-sim-fault(?: [a-z]+=[A-Za-z0-9/:._…-]+)+$/u);
  });
});
