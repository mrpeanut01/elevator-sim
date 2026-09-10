/**
 * **What the server says when something goes wrong** — GitHub issue **#242**, AC2.
 *
 * ## The defect this closes, quoted
 *
 * `http/serve.ts` handled every failure of every route with a `catch` that had **no binding**:
 *
 * ```ts
 * } catch {
 *   response.writeHead(500, headers);
 *   response.end(JSON.stringify({ error: 'internal-error', detail: '…' }));
 * ```
 *
 * The error was not captured, not logged and not counted. A route that threw produced a 500 for the
 * caller and complete silence in the container's log stream — and the deployment runs at
 * `minReplicas: 0`, so there is not even a process left sitting there for somebody to attach to.
 * The whole package held three `console` calls, all in `main.ts`, and the only `console.error`
 * among them is on the boot path.
 *
 * ## What a fault record is, and the one sentence that decides its whole shape
 *
 * **It is a record about the server, not about a person**, and every field below is chosen so that
 * remains true no matter what a caller sends. That is what lets this ship while
 * `docs/26-telemetry-and-privacy.md` § 14.2's lawful basis for error reports is still open: there
 * is nothing here to have a basis *for*. Specifically:
 *
 * - **No message and no stack.** {@link faultKindOf} takes the error's *class* and nothing else. A
 *   thrown message is very often built by interpolating what the request carried — an address, a
 *   token, an identifier — which is `docs/26 P-4`'s hazard exactly; a stack names paths on the
 *   machine. `faults.test.ts` throws an error whose message holds an address and a token and
 *   requires both to be absent from the line.
 * - **No caller, in any form.** No address, no rate-limit key, no bearer token, no session, no
 *   account. `docs/26` § 0 fact 3 records that the rate-limit key is never written, and a fault
 *   record is not the place that changes.
 * - **No body and no query.** Both are caller-authored in full.
 * - **A route shape rather than a path.** Every route this API answers is a fixed string
 *   (`http/api.ts` switches on `` `${method} ${path}` `` with no parameterised route among the
 *   eighteen), so a real route passes through {@link routeShapeOf} untouched — and anything that is
 *   not one, which is to say anything a prober sends, is reduced. The bound is there because a path
 *   is `/` followed by whatever the caller chose, and an unbounded field in a log line is a bill
 *   somebody else gets to write.
 *
 * **There is deliberately no build field.** The obvious one would be an environment variable naming
 * the image's commit, and nothing in `scripts/deploy-azure.sh` or `infra/azure/main.bicep` sets one
 * — the commit is the *image tag*, which the platform already shows against the revision that wrote
 * the line. Adding a field that only a future deploy script could fill would be a tunable with no
 * producer, which is the shape [`docs/05-roadmap.md`](../../../../docs/05-roadmap.md)'s standing
 * requirement counts instances of.
 *
 * ## Why a line rather than JSON
 *
 * {@link faultLineOf} writes one line beginning with {@link FAULT_MARKER}. An alert rule keys on
 * that literal, a person greps for it, and it survives a log pipeline that does not parse. JSON
 * would be better for a collector this deployment does not have; a marker is better for the one it
 * does, which is a container's stdout.
 *
 * ## Where the reporting is not done
 *
 * This module decides *what is said* and nothing about *when*. It touches no clock, no console and
 * no process — {@link FaultReporter} is a port, `http/serve.ts` calls it on a request that threw,
 * and `main.ts` is the one module that builds a real one. That split is what lets `serve.test.ts`
 * observe a fault over a real socket without capturing anybody's console.
 */

/**
 * The literal every fault line begins with.
 *
 * It is the alert key, so it is a constant here and quoted in the runbook rather than typed twice.
 * Deliberately not a word that occurs in ordinary output: the one startup line this server writes
 * begins `elevator-sim listening`, and a rule keying on `elevator-sim` alone would fire on every
 * cold start.
 */
const FAULT_MARKER = 'elevator-sim-fault';

/** How long a route shape may be. Beyond it the tail is dropped and the line says so. */
const MAX_ROUTE_CHARS = 64;

/** Where the fault happened. A closed set — a sixth kind of fault is a compile error. */
export type ServerFaultAt = 'request' | 'boot' | 'unhandled-rejection' | 'uncaught-exception';

/** Everything a fault line carries. Every field is this module's own vocabulary. */
export interface ServerFault {
  readonly at: ServerFaultAt;
  /** The request's method, or `undefined` where the fault is not a request's. */
  readonly method?: string | undefined;
  /** {@link routeShapeOf}'s answer, or `undefined` where the fault is not a request's. */
  readonly route?: string | undefined;
  /** The error's class, or `error` / `non-error` where it does not have a usable one. */
  readonly kind: string;
}

/** What a fault is handed to. A port: this module builds no reporter and calls none. */
export type FaultReporter = (fault: ServerFault) => void;

/** What {@link serverFaultOf} needs. A request's fields are optional because three faults have none. */
export interface ServerFaultInput {
  readonly at: ServerFaultAt;
  readonly error: unknown;
  readonly method?: string | undefined;
  readonly path?: string | undefined;
}

/** The methods this server answers, plus the two a browser sends on its own. */
const METHODS = new Set(['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PUT', 'PATCH']);

/**
 * A class name shaped like one this repository could have written.
 *
 * `name` is a writable property on a thrown object, so it is a caller-influenced string until this
 * predicate says otherwise. Identifier-shaped and short: anything else is not a class, it is a
 * sentence somebody put where a class name goes.
 */
const CLASS_NAME = /^[A-Za-z][A-Za-z0-9_$]{0,39}$/u;

/**
 * A path segment that is part of this API's own vocabulary.
 *
 * Lower-case letters, digits and hyphens — the shape every one of `http/api.ts`'s eighteen routes
 * is written in. A segment that is not this is not a route of this server, so it is reduced rather
 * than carried: an identifier, a token, a filename, a traversal attempt, all of them.
 *
 * Digits are permitted because a vocabulary segment may contain one and none of the shipped routes
 * is a bare number; the length bound is what stops a long digit string passing as vocabulary.
 */
const VOCABULARY_SEGMENT = /^[a-z][a-z0-9-]{0,23}$/u;

/**
 * The error's class, reduced to something this module is willing to write down.
 *
 * **The constructor's name is preferred over `error.name`, and the reason is measured rather than
 * stylistic.** A subclass that does not assign `this.name` inherits `Error.prototype.name`, so
 * `class StoreError extends Error {}` reads `'Error'` through the conventional field — which is the
 * whole distinction this record exists to draw, lost on exactly the classes this codebase would
 * write. `faults.test.ts` asserts that case; it failed on the first draft of this function, which
 * read `error.name`.
 *
 * `error.name` is the fallback rather than the primary because it is a **writable property on a
 * thrown object**: a caller cannot set it, but the throwing code can set it to a sentence, and a
 * sentence is an unbounded string where a vocabulary belongs. Both routes are gated on
 * {@link CLASS_NAME}, and a value that passes neither is `error`.
 */
function faultKindOf(error: unknown): string {
  if (!(error instanceof Error)) return 'non-error';
  const constructed: unknown = (error as { constructor?: { name?: unknown } }).constructor?.name;
  if (typeof constructed === 'string' && constructed !== 'Object' && CLASS_NAME.test(constructed)) {
    return constructed;
  }
  const name: unknown = error.name;
  if (typeof name === 'string' && CLASS_NAME.test(name)) return name;
  return 'error';
}

/**
 * The shape of a path — the path itself where it is one of this API's routes, and a reduction
 * everywhere else.
 *
 * A query or a fragment cannot reach here through `serve.ts`, which passes `url.pathname`. Both are
 * cut anyway, because this function's contract is *given anything, produce something bounded* and a
 * caller that later hands it a whole target must not be the way an authorization token reaches a
 * log line.
 */
function routeShapeOf(path: string): string {
  const bare = path.split('#')[0]?.split('?')[0] ?? '';
  const segments = bare.split('/').filter((segment) => segment !== '');
  if (segments.length === 0) return '/';

  const shaped: string[] = [];
  for (const segment of segments) {
    shaped.push(VOCABULARY_SEGMENT.test(segment) ? segment : ':v');
    /*
     * The bound is applied while building rather than by slicing the result, so the ellipsis lands
     * on a segment boundary and a reader is never shown half an identifier — which would be a
     * fragment of caller text, which is the one thing this module exists not to write.
     */
    if (`/${shaped.join('/')}`.length > MAX_ROUTE_CHARS) {
      shaped.pop();
      return `/${shaped.join('/')}/…`;
    }
  }
  return `/${shaped.join('/')}`;
}

/** A fault, from whatever the failing site had to hand. */
export function serverFaultOf(input: ServerFaultInput): ServerFault {
  const kind = faultKindOf(input.error);
  if (input.at !== 'request') return { at: input.at, kind };
  return {
    at: input.at,
    method:
      input.method !== undefined && METHODS.has(input.method) ? input.method : 'other',
    route: routeShapeOf(input.path ?? ''),
    kind,
  };
}

/**
 * One line, beginning with {@link FAULT_MARKER}.
 *
 * `key=value` pairs rather than prose, so a rule can key on `kind=` as readily as on the marker,
 * and so the whole line matches one expression the test pins. Absent fields are **omitted** rather
 * than written as a placeholder: a boot fault has no route, and `route=none` would be a value a
 * query could group by as though it were one.
 */
export function faultLineOf(fault: ServerFault): string {
  const parts = [FAULT_MARKER, `at=${fault.at}`, `kind=${fault.kind}`];
  if (fault.method !== undefined) parts.push(`method=${fault.method}`);
  if (fault.route !== undefined) parts.push(`route=${fault.route}`);
  return parts.join(' ');
}
