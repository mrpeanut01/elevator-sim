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
 *
 * ## Two boards, and they answer different questions
 *
 * `/api/board` is the **configuration** board of § D214 § 4: one configuration — dispatcher
 * included — across seeds. It is a real thing and it is not the product's answer to *"who is best
 * at this"*, because the dispatcher is in its key, so choosing a different one moves a player to a
 * different board rather than up the one they are on.
 *
 * `/api/challenge-board` is § D218's answer instead: a **fixed seed set**, the dispatcher left
 * free, and a row that is a mean over the whole set with the count it was computed over. Everything
 * that keeps it on the legal side of `docs/10` § 5.5's prohibition — no interval, no composite, no
 * string ordering two dispatchers, and a pointer at Compare — travels **in the response body**,
 * because a client cannot be trusted to remember it and a reader cannot be expected to know it.
 */

import {
  hashPassword,
  newSessionToken,
  passwordIssues,
  passwordMatches,
  signConfirmation,
  verifyConfirmation,
} from '../accounts/credentials.js';
import {
  CHALLENGE_CLOCK_NOTE,
  challengeBoardNote,
  comparePointerFor,
  windowRefusalDetail,
} from '../challenge/board.js';
import {
  challengeStateAt,
  issuedChallengeAt,
  type ChallengeConfig,
  type IssuedChallenge,
} from '../challenge/schedule.js';
import {
  challengeDataHashOf,
  challengeSubmissionIssues,
  type ChallengeDataFacts,
  type ChallengeSubmission,
} from '../challenge/submission.js';
import { verifyChallengeSubmission } from '../challenge/verify.js';
import { confirmationMessage, type Mailer } from '../mail/mailer.js';
import { configHashOf, submissionIssues, type ResolvedDataFacts, type Submission } from '../leaderboard/submission.js';
import { verifySubmission, type VerificationResources } from '../leaderboard/verify.js';
import {
  BOARD_METRICS,
  type BoardMetric,
  type ChallengeEntryRow,
  type EntryRow,
  type Store,
  type UserRow,
} from '../store/store.js';

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
  /**
   * The same, for a challenge — which has no single dispatcher, so it cannot use `factsFor`.
   * `bootstrap.ts`'s `challengeFactsResolver` says what differs and why.
   */
  readonly challengeFactsFor: (config: ChallengeConfig) => ChallengeDataFacts | undefined;
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

/**
 * The shortest gap one account may command **one replay** in.
 *
 * `submissionIssues` already keeps an *unauthenticated* shape error from commanding a simulation.
 * This is the authenticated counterpart, and it is needed for the same reason at a larger size: a
 * verification is a **whole 7 200-second run** at the longest accepted length, so one confirmed
 * account submitting in a loop is a CPU denial of service wearing a valid session.
 *
 * Five seconds, which is far below any honest play rate — a player has to watch a run before they
 * can post it — and far above the cost of one replay. Since § D218 a submission can be worth more
 * than one replay, so this is the **unit** rather than the whole interval; {@link cooldownForSeeds}
 * is what a route actually charges.
 */
const MIN_SUBMIT_INTERVAL_MS = 5_000;

/**
 * The cooldown a submission costs, in milliseconds — **one replay's worth per seed**.
 *
 * A single-run submission is one simulation and a challenge submission is one *per seed*, so a flat
 * interval sized for the first would let the second command five times the CPU at the same rate.
 * Derived from the seed count rather than written down twice, so `MAX_CHALLENGE_SEEDS` cannot be
 * raised without the cooldown rising with it.
 *
 * Twenty-five seconds for a five-seed challenge. Still far below any honest play rate — a player
 * has to watch five runs before they can post them — and still far above the cost of the replays.
 */
function cooldownForSeeds(seedCount: number): number {
  return MIN_SUBMIT_INTERVAL_MS * Math.max(1, seedCount);
}

export function createApi(deps: ApiDeps): Api {
  /**
   * Per account, the earliest moment the next verification may start.
   *
   * A *next-allowed* moment rather than a *last-submitted* one, so the two submission routes can
   * charge different amounts into one budget. Sharing the budget is deliberate: a player alternating
   * between routes must not be able to double the load by doing so.
   */
  const nextSubmitMs = new Map<string, number>();
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
        return submit(deps, request, nextSubmitMs);
      case 'GET /api/boards':
        return { status: 200, body: { boards: deps.store.boards() } };
      case 'GET /api/board':
        return board(deps, request);
      case 'GET /api/challenges':
        return challenges(deps);
      case 'GET /api/challenge':
        return challenge(deps, request);
      case 'POST /api/challenge-scores':
        return submitChallenge(deps, request, nextSubmitMs);
      case 'GET /api/challenge-board':
        return challengeBoard(deps, request);
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

function submit(
  deps: ApiDeps,
  request: ApiRequest,
  nextSubmitMs: Map<string, number>,
): ApiResponse {
  const user = authenticate(deps, request);
  if (user === undefined) {
    return { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to post a score.' } };
  }
  const gate = postingGate(user);
  if (gate !== undefined) return gate;

  const submission = request.body as Submission;
  if (typeof submission?.run !== 'object' || typeof submission?.claimed !== 'object') {
    return { status: 400, body: { error: 'invalid-submission', issues: ['a submission needs a run and its claimed metrics'] } };
  }
  // The cheap gate first. Verification costs a whole simulation, and a shape error must not be
  // able to command one.
  const issues = submissionIssues(submission);
  if (issues.length > 0) return { status: 400, body: { error: 'invalid-submission', issues } };

  // After the cheap gate and before the expensive one. Checked here rather than at the top so a
  // player whose submission is malformed is told that, rather than being told to wait and then
  // told it was malformed anyway.
  const limited = chargeCooldown(deps, user.id, nextSubmitMs, 1);
  if (limited !== undefined) return limited;

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

/* ----------------------------------------------------------------- challenges */

/**
 * The challenge index — and the only place *"which challenge is it today"* is answered.
 *
 * § D218 § 3. The server issues the current challenge from its own clock and hands the client an
 * id; a client that worked it out for itself would be a second answer to a question already
 * answered, and the two would disagree at exactly the moment it mattered — the minute either side
 * of a window boundary. Nothing in this handler reads the request, which is the mechanical form of
 * that guarantee: there is no parameter a caller could pass to move the answer.
 */
function challenges(deps: ApiDeps): ApiResponse {
  const nowMs = deps.now();
  const current = deps.store.issueChallenge(issuedChallengeAt(nowMs));
  return {
    status: 200,
    body: {
      currentId: current.id,
      current: challengeView(deps, current, nowMs),
      clockNote: CHALLENGE_CLOCK_NOTE,
      recent: deps.store.recentChallenges(12).map((issued) => ({
        id: issued.id,
        name: issued.name,
        opensAtMs: issued.opensAtMs,
        closesAtMs: issued.closesAtMs,
        state: challengeStateAt(issued, nowMs),
      })),
    },
  };
}

/**
 * One challenge, in full. `?id=` is optional and omitting it means *the current one* — which is
 * the shortest correct way for a client to ask, because it never names a cycle at all.
 */
function challenge(deps: ApiDeps, request: ApiRequest): ApiResponse {
  const nowMs = deps.now();
  const resolved = resolveChallenge(deps, request.query.get('id') ?? '', nowMs);
  if (resolved === undefined) return noSuchChallenge(request.query.get('id') ?? '');
  return { status: 200, body: challengeView(deps, resolved, nowMs) };
}

/**
 * Post a challenge entry: one dispatcher, one claim per seed, verified by replaying all of them.
 *
 * The order of the gates is the same as `submit`'s and is deliberate in one further place. The
 * **window** is checked after the shape gate and *before* the cooldown, so a player who posts to a
 * challenge that closed while they were running it is told that — and is not also made to wait
 * before being told it again.
 */
function submitChallenge(
  deps: ApiDeps,
  request: ApiRequest,
  nextSubmitMs: Map<string, number>,
): ApiResponse {
  const user = authenticate(deps, request);
  if (user === undefined) {
    return { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to post a challenge entry.' } };
  }
  const gate = postingGate(user);
  if (gate !== undefined) return gate;

  const submission = request.body as ChallengeSubmission;
  if (typeof submission?.challengeId !== 'string' || typeof submission?.dispatcherProfileId !== 'string') {
    return {
      status: 400,
      body: {
        error: 'invalid-submission',
        issues: ['a challenge entry names a challengeId, a dispatcherProfileId and one set of figures per seed'],
      },
    };
  }

  const nowMs = deps.now();
  const target = resolveChallenge(deps, submission.challengeId, nowMs);
  if (target === undefined) return noSuchChallenge(submission.challengeId);

  // The cheap gate first, and it is worth more here than on the single-run route: a shape error
  // that reached the verifier would command one simulation per seed rather than one.
  const issues = challengeSubmissionIssues(submission, target);
  if (issues.length > 0) return { status: 400, body: { error: 'invalid-submission', issues } };

  const state = challengeStateAt(target, nowMs);
  if (state !== 'open') {
    const current = deps.store.issueChallenge(issuedChallengeAt(nowMs));
    // 409 and not 403: nothing is wrong with the request or the requester, the world has moved.
    // The detail names a date and names what to do instead — § D218 § 5's "a reason a player can
    // act on" is two things, and a refusal with only the first is a dead end.
    return {
      status: 409,
      body: {
        error: 'challenge-not-open',
        state,
        challengeId: target.id,
        opensAtMs: target.opensAtMs,
        closesAtMs: target.closesAtMs,
        currentChallengeId: current.id,
        detail: windowRefusalDetail(target, state, current, challengeStateAt(current, nowMs)),
      },
    };
  }

  const limited = chargeCooldown(deps, user.id, nextSubmitMs, target.seeds.length);
  if (limited !== undefined) return limited;

  const facts = deps.challengeFactsFor(target.config);
  if (facts === undefined) return unresolvableChallenge(target);

  const verification = verifyChallengeSubmission(submission, target, deps.resources);
  if (!verification.ok) {
    // 422, for `submit`'s reason: the request was well-formed and the content did not check out. A
    // rejection is not an accusation — a player on an older build lands here too.
    return { status: 422, body: { error: verification.code, detail: verification.detail } };
  }

  const dataHash = challengeDataHashOf(target, facts);
  const entry = deps.store.recordChallengeEntry({
    challengeId: target.id,
    dataHash,
    userId: user.id,
    dispatcherProfileId: submission.dispatcherProfileId,
    // The **server's** aggregate over the **server's** runs. The claim is compared and discarded.
    score: verification.score,
  });
  return { status: 201, body: { challengeId: target.id, dataHash, entry: publicChallengeEntry(entry) } };
}

/**
 * A challenge board: these players, on these seeds, in this order.
 *
 * Every honesty obligation this surface carries travels in the body rather than in a docstring,
 * because a client cannot be trusted to remember them and a reader cannot be expected to know them:
 * `seedCount` and each row's own `runs`/`legs` (R13), `note` (§ D106 and § D218 § 5 clause 2), and
 * `compare` (clause 5) — the pointer at the one surface allowed to answer *"is my dispatcher
 * better"*.
 */
function challengeBoard(deps: ApiDeps, request: ApiRequest): ApiResponse {
  const nowMs = deps.now();
  const asked = request.query.get('challengeId') ?? '';
  const target = resolveChallenge(deps, asked, nowMs);
  if (target === undefined) return noSuchChallenge(asked);

  const metric = request.query.get('metric') ?? 'awtS';
  if (!BOARD_METRICS.includes(metric as BoardMetric)) {
    return {
      status: 400,
      body: { error: 'no-such-metric', detail: `A board is ordered on one of ${BOARD_METRICS.join(', ')}.` },
    };
  }
  const limit = Math.min(Math.max(Number(request.query.get('limit') ?? '25') || 25, 1), 100);

  const facts = deps.challengeFactsFor(target.config);
  if (facts === undefined) return unresolvableChallenge(target);
  const dataHash = challengeDataHashOf(target, facts);

  const entries = deps.store.challengeBoard(target.id, dataHash, metric as BoardMetric, limit);
  const elsewhere = deps.store
    .challengeDataHashes(target.id)
    .filter((group) => group.dataHash !== dataHash)
    .reduce((total, group) => total + group.entries, 0);

  return {
    status: 200,
    body: {
      challengeId: target.id,
      challenge: target,
      state: challengeStateAt(target, nowMs),
      dataHash,
      metric,
      seedCount: target.seeds.length,
      note: challengeBoardNote(target.seeds.length, metric),
      compare: comparePointerFor(target),
      entries: entries.map((entry) => publicChallengeEntry(entry)),
      // Counted, never merged and never dropped. Entries set before a mid-challenge `data/` change
      // describe runs this server can no longer reproduce, so they are on their own board — and a
      // surface that silently omitted them would be losing rows without saying so.
      entriesOnOtherData: elsewhere,
      ...(elsewhere === 0
        ? {}
        : {
            otherDataNote:
              `${String(elsewhere)} entries on this challenge were set against different reference ` +
              'data and are on a separate board. They are not shown here, because a run this ' +
              'server can no longer reproduce cannot sit in the same order as one it can.',
          }),
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
 * § D214 § 5's one gated privilege, applied identically to both submission routes.
 *
 * Factored rather than repeated: two copies of an authorization check are two things that can
 * disagree, and the one that disagrees quietly is the one that lets a post through.
 */
function postingGate(user: UserRow): ApiResponse | undefined {
  if (user.confirmed) return undefined;
  return {
    status: 403,
    body: {
      error: 'not-confirmed',
      detail: 'Confirm your email address before posting a score. You can keep playing meanwhile.',
    },
  };
}

/**
 * Charge a submission's replays against the account's cooldown, or refuse.
 *
 * Returns the 429 when the account is inside its window, and otherwise records the next moment it
 * may submit and returns `undefined`. In memory rather than in the database: it bounds *this
 * process*, which is the thing being protected, and a restart resetting it costs one extra replay.
 */
function chargeCooldown(
  deps: ApiDeps,
  userId: string,
  nextSubmitMs: Map<string, number>,
  seedCount: number,
): ApiResponse | undefined {
  const nowMs = deps.now();
  if (nowMs < (nextSubmitMs.get(userId) ?? Number.NEGATIVE_INFINITY)) {
    return {
      status: 429,
      body: {
        error: 'too-many-submissions',
        detail: 'One entry at a time — verifying a run means re-simulating it. Try again in a moment.',
      },
    };
  }
  nextSubmitMs.set(userId, nowMs + cooldownForSeeds(seedCount));
  return undefined;
}

/**
 * The challenge a request means: the one it named, or — when it named none — the current one.
 *
 * The current one is **issued** on the way past, which is the only write a `GET` on this surface
 * performs and is worth stating. It is an insert-if-absent of a record the arithmetic already
 * determines, so it adds no information; what it buys is that a challenge is on the record from the
 * first moment anybody could have played it, rather than from the first moment somebody posted.
 */
function resolveChallenge(deps: ApiDeps, id: string, nowMs: number): IssuedChallenge | undefined {
  const current = deps.store.issueChallenge(issuedChallengeAt(nowMs));
  if (id.length === 0 || id === current.id) return current;
  return deps.store.challengeById(id);
}

function noSuchChallenge(id: string): ApiResponse {
  return {
    status: 404,
    body: {
      error: 'no-such-challenge',
      detail: `This server has not issued a challenge "${id}". Ask /api/challenges for the one that is open.`,
    },
  };
}

/** A challenge whose own configuration this server can no longer resolve against its `data/`. */
function unresolvableChallenge(target: IssuedChallenge): ApiResponse {
  return {
    status: 409,
    body: {
      error: 'unknown-configuration',
      detail:
        `This server can no longer resolve “${target.name}” against its own reference data, so its ` +
        'board cannot be read and nothing can be posted to it. Existing entries are kept.',
    },
  };
}

/**
 * A challenge, plus the two things only the server can say about it: which state it is in, and how
 * long is left.
 *
 * `closesInMs` is a **duration**, not a timestamp to subtract a client clock from. A countdown
 * built by differencing two clocks is the client computing currency one subtraction later, which is
 * the thing § D218 § 3 forbids.
 */
function challengeView(deps: ApiDeps, target: IssuedChallenge, nowMs: number): Record<string, unknown> {
  const state = challengeStateAt(target, nowMs);
  const facts = deps.challengeFactsFor(target.config);
  return {
    challenge: target,
    state,
    seedCount: target.seeds.length,
    opensInMs: state === 'upcoming' ? target.opensAtMs - nowMs : null,
    closesInMs: state === 'open' ? target.closesAtMs - nowMs : null,
    clockNote: CHALLENGE_CLOCK_NOTE,
    dataHash: facts === undefined ? null : challengeDataHashOf(target, facts),
    compare: comparePointerFor(target),
  };
}

function publicChallengeEntry(entry: ChallengeEntryRow): Record<string, unknown> {
  return {
    id: entry.id,
    displayName: entry.displayName,
    dispatcherProfileId: entry.dispatcherProfileId,
    // Whole: the four means, both counts, and every run behind them. R13's clause one is that the
    // count travels in the same unit as the figure — here it travels in the same object.
    score: entry.score,
    submittedAtMs: entry.submittedAtMs,
  };
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
