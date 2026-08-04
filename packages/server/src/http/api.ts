/**
 * The API, as a **pure function from a request to a response**.
 *
 * There is no `node:http` in this file. `handle()` takes a method, a path, headers and a parsed
 * body, and returns a status, headers and a JSON value; `serve.ts` is the fifteen lines that turn a
 * socket into that call. The split is the same one `menu/` makes against the DOM and
 * `dev/state.ts` makes against a click handler, and it is made here for the same reason: a decision
 * that needs a listening socket to reach is a decision no test will drive.
 *
 * So every route below is exercised over an in-memory store with no port bound — register, receive
 * the mail, confirm, log in, submit a forged score and watch it refused.
 *
 * ## What is deliberately uniform
 *
 * **Nothing in a response distinguishes "no such account" from "wrong password".** A login endpoint
 * that says which one is an account-enumeration oracle, and the address is the thing an attacker
 * does not have. The same applies to registration, where the refusal is a *fact about the form*
 * (`this address cannot be registered`) rather than about the database.
 *
 * **No response ever carries a password, a digest, a salt, or a confirmation token.** The token
 * goes into the mail and nowhere else — a registration response that echoed it would make the
 * mailbox round trip decorative and confirm any address anyone typed.
 */

import {
  hashPassword,
  newSessionToken,
  passwordIssues,
  passwordMatches,
  signConfirmation,
  verifyConfirmation,
} from '../accounts/credentials.js';
import { confirmationMessage, type Mailer } from '../mail/mailer.js';
import { configHashOf, submissionIssues, type ResolvedDataFacts, type Submission } from '../leaderboard/submission.js';
import { verifySubmission, type VerificationResources } from '../leaderboard/verify.js';
import { BOARD_METRICS, type BoardMetric, type EntryRow, type Store, type UserRow } from '../store/store.js';

/* -------------------------------------------------------------------------- *
 * The transport-shaped types
 * -------------------------------------------------------------------------- */

export interface ApiRequest {
  readonly method: string;
  /** Path only, no query string. */
  readonly path: string;
  readonly query: ReadonlyMap<string, string>;
  /** Already parsed. A body that did not parse never reaches here — `serve.ts` refuses it. */
  readonly body: unknown;
  /** The bearer token, if the caller sent one. */
  readonly token: string | undefined;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Everything the API is wired to. Assembled once at boot by {@link createApi}'s caller. */
export interface ApiDeps {
  readonly store: Store;
  readonly mailer: Mailer;
  readonly resources: VerificationResources;
  /** How to digest the server's own `data/` for a run. Built once at boot; see `bootstrap.ts`. */
  readonly factsFor: (run: Submission['run']) => ResolvedDataFacts | undefined;
  /** The signing secret. Read from the environment by `requireSecret`; never defaulted. */
  readonly secret: string;
  readonly now: () => number;
  /** Where a confirmation link points. The mail contains this and nothing else clickable. */
  readonly confirmUrl: (token: string) => string;
}

export type Api = (request: ApiRequest) => Promise<ApiResponse>;

/* -------------------------------------------------------------------------- *
 * The routes
 * -------------------------------------------------------------------------- */

const MAX_DISPLAY_NAME = 32;

export function createApi(deps: ApiDeps): Api {
  return async function handle(request: ApiRequest): Promise<ApiResponse> {
    const route = `${request.method} ${request.path}`;
    switch (route) {
      case 'POST /api/register':
        return register(deps, request);
      case 'GET /api/confirm':
        return confirm(deps, request);
      case 'POST /api/login':
        return login(deps, request);
      case 'POST /api/logout':
        return logout(deps, request);
      case 'GET /api/me':
        return me(deps, request);
      case 'POST /api/scores':
        return submit(deps, request);
      case 'GET /api/boards':
        return { status: 200, body: { boards: deps.store.boards() } };
      case 'GET /api/board':
        return board(deps, request);
      default:
        return { status: 404, body: { error: 'no-such-route', detail: `Nothing is served at ${route}.` } };
    }
  };
}

/* ------------------------------------------------------------------ accounts */

async function register(deps: ApiDeps, request: ApiRequest): Promise<ApiResponse> {
  const body = request.body as Partial<Record<'email' | 'displayName' | 'password', unknown>>;
  const email = typeof body?.email === 'string' ? body.email : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  const issues = [...emailIssues(email), ...displayNameIssues(displayName), ...passwordIssues(password)];
  if (issues.length > 0) return { status: 400, body: { error: 'invalid-registration', issues } };

  const created = deps.store.createUser({ email, displayName, password: hashPassword(password) });
  if (!created.ok) {
    // Uniform on purpose for the address, specific for the name. A taken *display name* is public
    // — it is printed on every board — so saying so leaks nothing. A taken *address* is not, and
    // saying so would turn this endpoint into an account-existence oracle.
    return created.reason === 'name-taken'
      ? { status: 409, body: { error: 'name-taken', detail: 'That display name is already in use on a board.' } }
      : {
          status: 409,
          body: {
            error: 'cannot-register',
            detail: 'That address cannot be registered. If it is yours, try signing in or resetting it.',
          },
        };
  }

  const token = signConfirmation({
    userId: created.user.id,
    email: created.user.email,
    secret: deps.secret,
    nowMs: deps.now(),
  });
  // Awaited, and a failure fails the request: an account whose confirmation mail was silently
  // dropped is an account the player can never finish and will never be told why.
  await deps.mailer.send(confirmationMessage(created.user.email, deps.confirmUrl(token)));

  const session = deps.store.createSession(newSessionToken(), created.user.id);
  // The session is issued **unconfirmed**: § D214 § 5 lets an unconfirmed account log in and play,
  // and gates only the one privilege that needs gating — posting a score.
  return { status: 201, body: { token: session.token, user: publicUser(created.user) } };
}

function confirm(deps: ApiDeps, request: ApiRequest): ApiResponse {
  const token = request.query.get('token') ?? '';
  const claims = verifyConfirmation(token, deps.secret, deps.now());
  if (typeof claims === 'string') {
    return {
      status: 400,
      body: {
        error: claims,
        detail:
          claims === 'expired'
            ? 'That confirmation link has expired. Sign in and ask for a new one.'
            : 'That confirmation link is not valid.',
      },
    };
  }
  // Both halves, and the store checks both: a token carries the address it was mailed to, so it
  // cannot confirm whatever address the account happens to hold now.
  const done = deps.store.confirmUser(claims.userId, claims.email);
  return done
    ? { status: 200, body: { confirmed: true } }
    : { status: 400, body: { error: 'bad-signature', detail: 'That confirmation link is not valid.' } };
}

function login(deps: ApiDeps, request: ApiRequest): ApiResponse {
  const body = request.body as Partial<Record<'email' | 'password', unknown>>;
  const email = typeof body?.email === 'string' ? body.email : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  const user = deps.store.userByEmail(email);
  // One refusal, one wording, for both arms. Telling the caller which of the two was wrong hands
  // them the half they did not have.
  const refused: ApiResponse = {
    status: 401,
    body: { error: 'bad-credentials', detail: 'That address and password do not match an account.' },
  };
  if (user === undefined) {
    // Hashed anyway, against a throwaway record, so a missing account costs the same ~100 ms a
    // present one does. Without this the response time is an account-existence oracle regardless
    // of how carefully the wording is matched.
    passwordMatches(password, hashPassword('a placeholder of adequate length'));
    return refused;
  }
  if (!passwordMatches(password, user.password)) return refused;

  const session = deps.store.createSession(newSessionToken(), user.id);
  return { status: 200, body: { token: session.token, user: publicUser(user) } };
}

function logout(deps: ApiDeps, request: ApiRequest): ApiResponse {
  if (request.token !== undefined) deps.store.deleteSession(request.token);
  // 200 whether or not the token was real. A logout that reported "no such session" would say
  // whether a token existed.
  return { status: 200, body: { ok: true } };
}

function me(deps: ApiDeps, request: ApiRequest): ApiResponse {
  const user = authenticate(deps, request);
  return user === undefined
    ? { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to see your account.' } }
    : { status: 200, body: { user: publicUser(user) } };
}

/* --------------------------------------------------------------- leaderboard */

function submit(deps: ApiDeps, request: ApiRequest): ApiResponse {
  const user = authenticate(deps, request);
  if (user === undefined) {
    return { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to post a score.' } };
  }
  if (!user.confirmed) {
    // § D214 § 5's one gated privilege, and the reason it is gated: an unconfirmed address makes a
    // board farmable with throwaway accounts.
    return {
      status: 403,
      body: {
        error: 'not-confirmed',
        detail: 'Confirm your email address before posting a score. You can keep playing meanwhile.',
      },
    };
  }

  const submission = request.body as Submission;
  if (typeof submission?.run !== 'object' || typeof submission?.claimed !== 'object') {
    return { status: 400, body: { error: 'invalid-submission', issues: ['a submission needs a run and its claimed metrics'] } };
  }
  // The cheap gate first. Verification costs a whole simulation, and a shape error must not be
  // able to command one.
  const issues = submissionIssues(submission);
  if (issues.length > 0) return { status: 400, body: { error: 'invalid-submission', issues } };

  const facts = deps.factsFor(submission.run);
  if (facts === undefined) {
    return {
      status: 404,
      body: { error: 'unknown-configuration', detail: 'This server does not ship one of the ids in that run.' },
    };
  }

  const verification = verifySubmission(submission, deps.resources);
  if (!verification.ok) {
    // 422 and not 403: the request was well-formed and the *content* did not check out. A
    // rejection is not an accusation — a player on an older build submits in good faith and does
    // not reproduce — so the code travels out for the client to word appropriately.
    return { status: 422, body: { error: verification.code, detail: verification.detail } };
  }

  const configHash = configHashOf(submission.run, facts);
  const entry = deps.store.recordEntry({
    configHash,
    userId: user.id,
    run: submission.run,
    // The **server's** figures. The claim is compared and then discarded; it is never what ranks.
    measured: verification.measured,
  });
  return { status: 201, body: { configHash, entry: publicEntry(entry) } };
}

function board(deps: ApiDeps, request: ApiRequest): ApiResponse {
  const configHash = request.query.get('configHash') ?? '';
  if (configHash.length === 0) {
    return { status: 400, body: { error: 'no-board', detail: 'Name a board with ?configHash=…' } };
  }
  const asked = request.query.get('metric') ?? 'awtS';
  if (!BOARD_METRICS.includes(asked as BoardMetric)) {
    return {
      status: 400,
      body: { error: 'no-such-metric', detail: `A board ranks on one of ${BOARD_METRICS.join(', ')}.` },
    };
  }
  const limit = Math.min(Math.max(Number(request.query.get('limit') ?? '25') || 25, 1), 100);
  const entries = deps.store.board(configHash, asked as BoardMetric, limit);
  return {
    status: 200,
    body: {
      configHash,
      metric: asked,
      // Said on the wire, not only in a docstring. A client that ranked on one column and drew the
      // others would otherwise have no way to say which one the order came from.
      note: 'Ranked on the named metric alone. The others are shown beside it and never combined.',
      entries: entries.map((entry) => publicEntry(entry)),
    },
  };
}

/* -------------------------------------------------------------------------- *
 * Shared
 * -------------------------------------------------------------------------- */

function authenticate(deps: ApiDeps, request: ApiRequest): UserRow | undefined {
  return request.token === undefined ? undefined : deps.store.userForSession(request.token);
}

/**
 * A user, as anything outside this process may see them.
 *
 * The digest and salt are not here, and `credentials.test.ts` asserts the record never contains the
 * password. `api.test.ts` asserts this **projection** never contains either, over every route, so
 * a field added to `UserRow` later cannot leak by being forgotten about.
 */
function publicUser(user: UserRow): Record<string, unknown> {
  return { id: user.id, email: user.email, displayName: user.displayName, confirmed: user.confirmed };
}

function publicEntry(entry: EntryRow): Record<string, unknown> {
  return {
    id: entry.id,
    displayName: entry.displayName,
    run: entry.run,
    measured: entry.measured,
    submittedAtMs: entry.submittedAtMs,
  };
}

/**
 * Whether an address is shaped like one.
 *
 * Deliberately minimal — one `@`, something either side, no spaces. A regex claiming to implement
 * RFC 5321 rejects addresses that work; the confirmation mail is the real check, and it either
 * arrives or it does not.
 */
function emailIssues(email: string): readonly string[] {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return ['an email address is required'];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed)) return ['that does not look like an email address'];
  return [];
}

function displayNameIssues(displayName: string): readonly string[] {
  if (displayName.length < 2) return ['a display name must be at least 2 characters'];
  if (displayName.length > MAX_DISPLAY_NAME) {
    return [`a display name must be at most ${String(MAX_DISPLAY_NAME)} characters`];
  }
  // Printable, no control characters: this string is rendered on every board, and a name carrying
  // a newline or a bidi override is a name that rearranges someone else's row.
  if (/[\p{Cc}\p{Cf}]/u.test(displayName)) return ['a display name may not contain control characters'];
  return [];
}
