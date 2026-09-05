/**
 * The API, as a **pure function from a request to a response**.
 *
 * There is no `node:http` in this file. `handle()` takes a method, a path, headers and a parsed
 * body, and returns a status, headers and a JSON value; `serve.ts` is the fifteen lines that turn a
 * socket into that call. The split is the same one `menu/` makes against the DOM and
 * `dev/state.ts` makes against a click handler, and it is made here for the same reason: a decision
 * that needs a listening socket to reach is a decision no test will drive.
 *
 * So every route below is exercised over an in-memory store with no port bound — ask for a link,
 * receive the mail, redeem it, submit a forged score and watch it refused.
 *
 * ## Signing in is an emailed link, and there is no password anywhere
 *
 * § D241. Two routes: {@link requestLink} takes an address and mails a signed, expiring, single-use
 * token; {@link redeemLink} takes that token and issues a session. There is no password to be
 * checked, no digest to be stored and no *"that address and password do not match"* to word
 * carefully, because the whole class of question is gone.
 *
 * It also dissolves play-tester issue #30 rather than patching it. The complaint was a live email
 * and password form that only admitted there was no server *after* it was submitted; a form with no
 * password field cannot make that particular promise, and § D243 fixes the underlying reason the
 * client could not find the server at all.
 *
 * ## What is deliberately uniform
 *
 * **Nothing in a response says whether an address has an account.** {@link requestLink} answers
 * `202` with a byte-identical body whether it created an account, mailed an existing one, or was
 * handed an address that will never read the mail. A response that differed by a word, a code or a
 * status would be an account-enumeration oracle, and the address is the thing an attacker does not
 * have. `api.test.ts` compares the two bodies byte for byte rather than by inspection.
 *
 * **No response ever carries a sign-in token.** Not in a body, not in an error, not in the detail of
 * a `4xx`. The token exists in the mail and in the request that spends it; a response that echoed
 * one would make the mailbox round trip decorative and hand an account to anybody who could name an
 * address.
 *
 * ## An account can be deleted, and until this route landed it could not
 *
 * {@link deleteAccount} answers `DELETE /api/me`: the caller's own account, named by the session
 * token and by nothing else the request can carry, and the schema's cascade takes every table that
 * references it. It is the counterpart of {@link requestLink}, which is what *creates* an
 * account — asking for a sign-in link writes a `users` row whether or not the mail is ever read, so
 * every address this server has ever been handed is in that table, and before this route there was
 * no way out of it. `docs/26-telemetry-and-privacy.md` § 5.3 is where that gap was recorded.
 *
 * ## Two boards, and they answer different questions
 *
 * `/api/board` is `ENGINE_CONTRACT.md` § 12.1's pair: the **daily board**, keyed by the date and
 * carrying everybody who ran the day's fixture, and a **personal-record log** per player for
 * everything else. It used to be the configuration board of § D214 § 4 — one configuration,
 * dispatcher included, across seeds — and that key is the one § 12.1 forbids by name, because every
 * axis in it is a parameter a player sets. `leaderboard/boardKey.ts` is where the digest was split
 * from the key and where the argument lives.
 *
 * `/api/challenge-board` is § D218's answer instead: a **fixed seed set**, the dispatcher left
 * free, and a row that is a mean over the whole set with the count it was computed over. Everything
 * that keeps it on the legal side of `docs/10` § 5.5's prohibition — no interval, no composite, no
 * string ordering two dispatchers, and a pointer at Compare — travels **in the response body**,
 * because a client cannot be trusted to remember it and a reader cannot be expected to know it.
 */

import { randomBytes } from 'node:crypto';

import {
  LOGIN_TTL_MS,
  constantTimeEquals,
  newSessionToken,
  signLoginToken,
  verifyLoginToken,
} from '../accounts/credentials.js';
import { FixedWindowLimiter } from '../accounts/rateLimit.js';
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
import { signInMessage, type Mailer } from '../mail/mailer.js';
import { BOARD_KEYS, dailyFixtureAt, placeSubmission, runDataHashOf } from '../leaderboard/boardKey.js';
import { submissionIssues, type ResolvedDataFacts, type Submission } from '../leaderboard/submission.js';
import { verifySubmission, type VerificationResources } from '../leaderboard/verify.js';
import {
  BOARD_METRICS,
  NoSuchUserError,
  normaliseEmail,
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
  /**
   * Who is asking, for the per-caller half of § D242's rate limit.
   *
   * `undefined` when the transport could not say — and the limiter treats that as **one shared
   * bucket** rather than as no limit, so an unattributable caller cannot opt out of the budget by
   * being unattributable. Required rather than optional so that a new caller constructing an
   * `ApiRequest` has to decide, which is the compile error that stops this quietly becoming
   * `undefined` everywhere. `serve.ts` fills it, and says there why it does not trust
   * `x-forwarded-for` unless it is told to.
   */
  readonly clientIp: string | undefined;
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
  /**
   * Where a sign-in link points. The mail contains this and nothing else clickable.
   *
   * It points at the **viewer**, with the token in the URL fragment, and `bootstrap.ts` explains
   * both halves of why. What matters here is what it is not: it is not this API, so nothing a mail
   * client, a link scanner or a corporate security appliance does by *fetching* the link can spend
   * the token.
   */
  readonly signInUrl: (token: string) => string;
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
 * verification is a whole re-simulation, so one signed-in account submitting in a loop is a CPU
 * denial of service wearing a valid session.
 *
 * Five seconds, which is far below any honest play rate — a player has to watch a run before they
 * can post it — and far above the cost of one replay of {@link REFERENCE_REPLAY_S}. A submission can
 * be worth more than one such replay — more seeds since § D218, and more *seconds* since a whole
 * authored day became postable — so this is the **unit** rather than the whole interval;
 * {@link cooldownForReplay} is what a route actually charges.
 */
const MIN_SUBMIT_INTERVAL_MS = 5_000;

/**
 * The run length {@link MIN_SUBMIT_INTERVAL_MS} was sized against, in simulated seconds.
 *
 * This used to be spelled *"the longest accepted length"* in the sentence above, and that phrasing
 * is exactly what went stale: `ACCEPTED_DURATIONS_S` now also carries a whole authored day at
 * 36 000 s, five times this. The number keeps its value and loses its claim to be the maximum —
 * it is the **reference replay** the five seconds was measured against, and nothing more.
 */
const REFERENCE_REPLAY_S = 7_200;

/**
 * The cooldown a submission costs, in milliseconds — **one replay's worth per seed, per reference
 * replay's worth of simulated time**.
 *
 * A single-run submission is one simulation and a challenge submission is one *per seed*, so a flat
 * interval sized for the first would let the second command five times the CPU at the same rate.
 * Derived from the seed count rather than written down twice, so `MAX_CHALLENGE_SEEDS` cannot be
 * raised without the cooldown rising with it.
 *
 * **The length is charged for the same reason and it did not used to be**, because until a whole
 * authored day became postable every accepted length sat at or below {@link REFERENCE_REPLAY_S} and
 * the factor was always one. A 36 000-second day is five reference replays of CPU — `§ D356` measured
 * one at **9 200 ms** on `vertical-city` — so leaving the charge at five seconds would have let a
 * single account command more simulation per second than the box can run, which is the denial of
 * service this constant exists to prevent. Widening what is postable without widening what it costs
 * would have been the widening paying for itself out of the server's budget.
 *
 * Derived rather than written down twice, exactly as the seed count is: `ACCEPTED_DURATIONS_S`
 * cannot be raised without the cooldown rising with it.
 *
 * Twenty-five seconds for a five-seed challenge, and twenty-five for a whole day. Still far below
 * any honest play rate — a player has to watch the runs before they can post them — and still far
 * above the cost of the replays. Floored at one so every length at or under the reference charges
 * exactly what it charged before: nothing already shipping moves.
 */
function cooldownForReplay(seedCount: number, durationS: number): number {
  const replays = Math.max(1, seedCount) * Math.max(1, durationS / REFERENCE_REPLAY_S);
  return MIN_SUBMIT_INTERVAL_MS * replays;
}

/**
 * How many sign-in links one **address** may ask for in a {@link LOGIN_TTL_MS} window.
 *
 * This is the budget that decides whether the endpoint is a weapon. Without it, anyone who can type
 * an address can make this server mail a stranger as fast as it will go — an email-bombing gadget
 * aimed at somebody who has never used the product, and an Azure Communication Services quota spent
 * in an afternoon. That is why there is a number here at all, and it is not negotiable.
 *
 * ## Why the number moved from three, and what moved was the *reason* rather than the appetite
 *
 * It was three, and the sentence justifying three was: *"an address may have three unexpired links
 * outstanding, and asking for a fourth while three still work is not a thing an honest player needs
 * to do."* **That premise is false against this client**, which is GitHub issue #112 § 3. The viewer
 * holds its session token in memory and never writes it to storage — `menu/account.ts` and
 * `dev/main.ts` both document that as a deliberate security choice — so **a reload spends the
 * session, not the link**, and the link it would replay is already consumed (`consumeLoginToken` is
 * a `DELETE`). A player who reloads the page therefore *must* ask again, and on the third reload
 * inside a quarter of an hour the server locked them out of their own account.
 *
 * So the budget is a **reload** budget rather than an outstanding-link budget, and ten is that
 * number: more reloads than an honest session has, and still a bound.
 *
 * ## What the widening does and does not cost, stated rather than waved at
 *
 * {@link LINKS_PER_CALLER} is untouched at thirty, so **one sender's total output is unchanged** —
 * the widening redistributes it (three victims at ten rather than ten victims at three) and does not
 * increase it. What it does raise is what a *distributed* sender can concentrate on one victim: 12
 * messages an hour becomes 40. That is a real cost, it is bounded, and it is the price of not
 * locking a player out of their own account.
 *
 * **The better fix is one this lane could not reach, and it is not this number.** A link that has
 * been *redeemed* is not outstanding, so the redemption should hand its budget back — which cannot
 * be attacked without reading the victim's mail, and so would fix the lockout at zero cost to the
 * bound above. `FixedWindowLimiter` has no release, `accounts/rateLimit.ts` is outside this lane's
 * files, and inlining a second fixed-window counter here would be a second implementation of the
 * one next door. It is proposed in this lane's report instead.
 */
const LINKS_PER_EMAIL = { maxRequests: 10, windowMs: LOGIN_TTL_MS } as const;

/**
 * How many sign-in links one **caller** may ask for, for any addresses at all.
 *
 * The per-address budget does not touch the attack this stops: a hundred addresses asked for twice
 * each is a hundred people mailed and no address's budget exceeded. Thirty per quarter hour is far
 * above a shared office or campus NAT signing itself in and far below anything that looks like a
 * run through a list.
 */
const LINKS_PER_CALLER = { maxRequests: 30, windowMs: LOGIN_TTL_MS } as const;

export function createApi(deps: ApiDeps): Api {
  /**
   * Per account, the earliest moment the next verification may start.
   *
   * A *next-allowed* moment rather than a *last-submitted* one, so the two submission routes can
   * charge different amounts into one budget. Sharing the budget is deliberate: a player alternating
   * between routes must not be able to double the load by doing so.
   */
  const nextSubmitMs = new Map<string, number>();
  const linksPerEmail = new FixedWindowLimiter(LINKS_PER_EMAIL);
  const linksPerCaller = new FixedWindowLimiter(LINKS_PER_CALLER);
  return async function handle(request: ApiRequest): Promise<ApiResponse> {
    const route = `${request.method} ${request.path}`;
    switch (route) {
      /*
       * The wake call, and the cheapest thing this server can answer.
       *
       * The app runs at `minReplicas: 0`, which is what makes it free to leave running. The cost is
       * a cold start, and it is not small: measured against the deployment, a request to a sleeping
       * container took **32.2 s** against **0.13 s** warm — a 240× gap, all of it time-to-first-byte,
       * so it is the container starting rather than anything on the wire.
       *
       * A player does not have to *wait* for that if the wake begins when they show intent rather
       * than when they submit. Opening the account or leaderboard screen fires this; typing an
       * email takes longer than nothing, so the container is usually up by the time it matters.
       *
       * Deliberately **no store call**. A wake that touched PostgreSQL would make the pool's own
       * first connection part of the thing being waited on, and would let a database outage read as
       * a server that is merely asleep. This answers from memory, so a 200 means exactly *the
       * process is running* — which is the whole of what a caller is asking.
       *
       * It is not a health check and must not grow into one: nothing here may fail, or callers will
       * start branching on it and the wake will have become a dependency.
       */
      case 'GET /api/wake':
        return { status: 200, body: { awake: true } };
      case 'POST /api/auth/request-link':
        return requestLink(deps, request, { perEmail: linksPerEmail, perCaller: linksPerCaller });
      case 'POST /api/auth/redeem':
        return redeemLink(deps, request);
      case 'GET /api/auth/redeem':
        return redeemIsNotAGet();
      case 'POST /api/logout':
        return logout(deps, request);
      case 'GET /api/me':
        return me(deps, request);
      case 'DELETE /api/me':
        return deleteAccount(deps, request, nextSubmitMs);
      case 'POST /api/me/display-name':
        return setDisplayName(deps, request);
      case 'POST /api/scores':
        return submit(deps, request, nextSubmitMs);
      case 'GET /api/boards':
        /*
         * The boards that have entries, and **the kinds of board this build has at all**.
         *
         * The second half is § 12.2's requirement rather than a courtesy. A client drawing a board
         * list has to distinguish *"no scores have been posted yet"* from *"this product has no
         * route that could produce one"*, and only the server knows which — `BOARD_KEYS` is the
         * contract's own table with the route naming column, so the ladder arrives labelled as a
         * key with no route instead of arriving as an absence a client has to explain for itself.
         * `menu/client.ts#AccountSummary` makes the same argument about a generated display name:
         * a fact the server holds is put on the wire rather than inferred from a shape.
         */
        return {
          status: 200,
          body: { boards: await deps.store.boards(), kinds: BOARD_KEYS, today: dailyFixtureAt(deps.now()) },
        };
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

/**
 * Ask for a sign-in link.
 *
 * The whole route is four steps in an order that is itself a decision: **shape, budget, account,
 * mail**.
 *
 * The shape check is first because it costs nothing and has no side effect, so a typo is answered
 * without spending anybody's budget. The two budgets come next and, crucially, **before the account
 * is created** — a limiter that ran after the write would still let an unlimited number of rows and
 * an unlimited number of sends through, which is the whole thing it exists to stop. The account is
 * created if it does not exist, because asking for a display name only when the address is new is
 * precisely the oracle the uniform response is for. The mail is last and is **awaited**.
 *
 * ## The response says nothing about the account
 *
 * `202`, one body, every time: created, existing, or an address that will never read it. Not a
 * different status, not a different code, not a longer sentence. `api.test.ts` compares the two
 * bodies byte for byte, because a difference of a word is a difference an attacker can read.
 *
 * The one thing it will not claim is that the mail *arrived* — nothing here can know that — so the
 * wording is about what was done rather than about what will happen.
 */
async function requestLink(
  deps: ApiDeps,
  request: ApiRequest,
  limiters: { readonly perEmail: FixedWindowLimiter; readonly perCaller: FixedWindowLimiter },
): Promise<ApiResponse> {
  const body = request.body as Partial<Record<'email', unknown>>;
  const email = typeof body?.email === 'string' ? body.email : '';
  const issues = emailIssues(email);
  if (issues.length > 0) return { status: 400, body: { error: 'invalid-address', issues } };

  const nowMs = deps.now();
  // The caller's budget first: it is the one that bounds how many *different* people can be mailed,
  // and it must be charged even when the address has plenty of budget left.
  const perCaller = limiters.perCaller.charge(request.clientIp ?? 'unattributed', nowMs);
  if (perCaller !== undefined) return tooManyLinks(perCaller);
  const perEmail = limiters.perEmail.charge(normaliseEmail(email), nowMs);
  if (perEmail !== undefined) return tooManyLinks(perEmail);

  /*
   * Two attempts, because the account can stop existing between the read and the write (#266).
   *
   * `DELETE /api/me` can land after `userByEmail` returns a row and before `createLoginToken`
   * writes against it, and the token then breaks `login_tokens_user_id_fkey`. `Store` maps that to
   * `NoSuchUserError`; what this route does with it is **start the account again**, because per
   * § D241 asking for a link on an address with no account is exactly what creates one. So the
   * second pass finds nothing, makes a fresh account and mails a link to it — which is the answer
   * a request arriving one millisecond later would have got anyway.
   *
   * The link is signed **inside** the loop. Signing it once above and retrying only the write
   * would mail a token bearing the dead account's id, which is a link that redeems to nothing.
   *
   * Two rather than a loop with a cap: the second attempt races nothing, because the account it
   * creates is one whose id no client has yet seen.
   */
  let user: UserRow | undefined;
  let link: ReturnType<typeof signLoginToken> | undefined;
  for (let attempt = 0; attempt < 2 && link === undefined; attempt += 1) {
    user = (await deps.store.userByEmail(email)) ?? (await createPlayer(deps, email));
    if (user === undefined) {
      // Every generated name collided, which is a fifty-bit coincidence and therefore a bug. It is
      // reported as a server failure rather than as anything about the address.
      return { status: 500, body: { error: 'internal-error', detail: 'That could not be set up. Try again.' } };
    }
    const candidate = signLoginToken({ userId: user.id, email: user.email, secret: deps.secret, nowMs });
    try {
      // Recorded **before** it is mailed. The other order has a window in which a link is in
      // somebody's inbox and is not redeemable, which is indistinguishable from a broken server.
      await deps.store.createLoginToken({
        jti: candidate.jti,
        userId: user.id,
        expiresAtMs: candidate.expiresAtMs,
      });
      link = candidate;
    } catch (error) {
      if (!(error instanceof NoSuchUserError) || attempt > 0) throw error;
    }
  }
  if (user === undefined || link === undefined) {
    return { status: 500, body: { error: 'internal-error', detail: 'That could not be set up. Try again.' } };
  }
  // Awaited, and a failure fails the request. Since § D241 the mail is not a courtesy at the start
  // of an account's life, it is the only door: a send that was dropped silently would be a player
  // staring at "check your email" forever.
  try {
    await deps.mailer.send(
      signInMessage(user.email, deps.signInUrl(link.token), Math.round(LOGIN_TTL_MS / 60_000)),
    );
  } catch {
    return mailNotSent();
  }

  return {
    status: 202,
    body: {
      ok: true,
      // No token, no account id, no statement about whether this address was already known. The
      // only number here is a duration, which is a fact about the server and not about the player.
      detail: `If that address can receive mail, a sign-in link is on its way. It works once and expires in ${String(Math.round(LOGIN_TTL_MS / 60_000))} minutes.`,
      expiresInMs: LOGIN_TTL_MS,
    },
  };
}

/**
 * Redeem a sign-in link: verify it, **spend it**, hand back a session.
 *
 * ## Single use is the `DELETE`, not the signature
 *
 * `verifyLoginToken` proves the token was signed here and has not expired, and it will prove that
 * every time it is asked, for a token that was spent an hour ago — nothing about an HMAC changes
 * when it is used. So the second step is `consumeLoginToken`, one `DELETE` whose `rowCount` is the
 * answer, and a token whose row is gone is refused however perfect its signature.
 *
 * ## Why this is a POST, and why the mail does not point at it
 *
 * Mail clients prefetch. Scanners, corporate link-rewriting appliances and "safe links" services
 * fetch every URL in a message before a human sees it, and a `GET` that consumed a token would burn
 * it before the recipient clicked — a login that fails for exactly the people whose employer is
 * careful. Two independent things stop that here:
 *
 * 1. **The mailed link points at the viewer, not at this API**, with the token in the URL
 *    **fragment**. A fragment is never sent to any server, so fetching the link cannot transmit the
 *    token, let alone spend it. It also keeps the token out of access logs and out of `Referer`.
 * 2. **This route is `POST` with a JSON body.** Nothing that follows links issues one.
 *
 * Either alone would do. Both, because the first depends on the client behaving and the second does
 * not. {@link redeemIsNotAGet} answers the `GET` explicitly rather than through the generic 404, so
 * that "a fetch of this path does not consume anything" is a statement the surface makes out loud.
 */
async function redeemLink(deps: ApiDeps, request: ApiRequest): Promise<ApiResponse> {
  const body = request.body as Partial<Record<'token', unknown>>;
  const token = typeof body?.token === 'string' ? body.token : '';

  const claims = verifyLoginToken(token, deps.secret, deps.now());
  if (typeof claims === 'string') return badLink(claims === 'expired' ? 'expired' : 'invalid');

  // Spent here, and only here. Anything after this point that fails leaves the link used, which is
  // the safe direction: a player asks for another one, and a stolen link is not waiting to be
  // replayed against whatever the failure was.
  if (!(await deps.store.consumeLoginToken(claims.jti))) {
    /*
     * `false` has two causes and they are different sentences (#266). The row is gone because the
     * link was spent, or because `login_tokens` cascaded away with the account — and *"that link
     * has already been used"* is a true-sounding sentence about something that did not happen. It
     * also sends the player to ask for another link, which will work, so they learn nothing.
     *
     * Asked rather than guessed, and asked of the account rather than of the token: which of the
     * two happened is a fact about whether the owner is still there.
     */
    return badLink((await deps.store.userById(claims.userId)) === undefined ? 'invalid' : 'spent');
  }

  const user = await deps.store.userById(claims.userId);
  // The email is inside the signature and is checked against the account rather than trusted from
  // the payload, so a token cannot authenticate an address other than the one it was mailed to.
  // Compared in constant time for no reason stronger than that this file compares every value that
  // gates a session that way, and an exception is a thing that gets copied.
  if (user === undefined || !constantTimeEquals(normaliseEmail(user.email), normaliseEmail(claims.email))) {
    return badLink('invalid');
  }

  // The last gap, and the most expensive one: the link is already spent, so an unexplained failure
  // here costs the player the link as well as the session. A deletion landing between the read
  // above and this write is answered with the refusal the read itself would have produced a
  // millisecond earlier — the link no longer names an account, so it is not a valid link (#266).
  let session;
  try {
    session = await deps.store.createSession(newSessionToken(), user.id);
  } catch (error) {
    if (error instanceof NoSuchUserError) return badLink('invalid');
    throw error;
  }
  return { status: 200, body: { token: session.token, user: publicUser(user) } };
}

/**
 * The `GET` on the redeem path, answered on purpose.
 *
 * A `405` rather than the generic `no-such-route`, and it exists to make one guarantee legible: a
 * thing that merely *fetched* this URL has not spent anything. That matters because the population
 * fetching URLs out of mail is machines, and the sentence is here so the next person reading the
 * route table does not "helpfully" add a `GET` alias for it.
 */
function redeemIsNotAGet(): ApiResponse {
  return {
    status: 405,
    body: {
      error: 'method-not-allowed',
      detail:
        'Sign-in links are redeemed with a POST. A GET here does nothing and consumes nothing, ' +
        'which is deliberate: mail clients and link scanners fetch every URL in a message.',
    },
  };
}

/** One wording per reason, and none of them contains the token. */
function badLink(reason: 'expired' | 'spent' | 'invalid'): ApiResponse {
  const detail = {
    expired: 'That sign-in link has expired. Ask for a new one — they are good for a few minutes.',
    spent: 'That sign-in link has already been used. Each one works once; ask for a new one.',
    invalid: 'That sign-in link is not valid. Ask for a new one.',
  }[reason];
  // 400 for all three. The distinction is *for the person holding the link* — whether asking again
  // will help — and it leaks nothing, because learning "already used" requires presenting a token
  // this server signed, which only its recipient has.
  return { status: 400, body: { error: `link-${reason}`, detail } };
}

/**
 * The mail did not go — [§ D491](../../../../DECISIONS.md).
 *
 * ## Why this is a distinct refusal rather than the 500 it used to be
 *
 * The `await` above is deliberate and the comment on it says why. What was missing is the half a
 * client can act on: with nothing catching, a dropped send propagated and `http/serve.ts` answered
 * `internal-error` / *"The server failed to handle that request."* — **byte-identical to every
 * other unhandled fault**. The two want opposite things from a reader. A generic fault says *try
 * again in a moment*; this one says *nothing is on its way, and it is us*. A viewer cannot derive
 * the second from the first, so a surface that promised four labelled sign-in failures could ship
 * only three.
 *
 * ## It cannot be an account-enumeration oracle, which is the bound § D491 set on this change
 *
 * § D241 § 7's whole design is that a request-link response says nothing about whether the address
 * is known. This one cannot: by the time the send is attempted the account **exists either way** —
 * the loop above creates one when `userByEmail` finds nothing, because asking for a link on an
 * unknown address is exactly what creates an account. So the send is attempted for every accepted
 * request, and this refusal is a fact about the mailer rather than about the address. What it can
 * still reveal is *deliverability* — a driver that rejects a domain outright — and that is not a
 * fact about this product's accounts and is already disclaimed in the 202's own wording: *"If that
 * address **can receive mail**"*.
 *
 * ## 502 rather than 500
 *
 * The failure is a dependency this server called and did not get an answer from, which is what a
 * bad-gateway status is. A client that groups by status alone therefore stops grouping this with
 * the faults it is not.
 */
function mailNotSent(): ApiResponse {
  return {
    status: 502,
    body: {
      error: 'sign-in-mail-not-sent',
      // Worded around whether asking again will help, which is what every other sign-in refusal in
      // this file is worded around. It says the fault is here, because a player who reads
      // "something went wrong" checks their own spelling first.
      detail:
        'The sign-in link could not be sent — that is a fault on our side, not with the address. Nothing is on its way, so try again in a moment.',
    },
  };
}

function tooManyLinks(retryInMs: number): ApiResponse {
  return {
    status: 429,
    body: {
      error: 'too-many-link-requests',
      // A duration, so the refusal is one a player can act on rather than wait out blindly. It says
      // nothing about which of the two budgets was spent, because that would say whether anyone
      // else has been asking about this address.
      detail: 'Too many sign-in links have been asked for. Try again shortly, and check your inbox meanwhile.',
      retryInMs,
    },
  };
}

/**
 * Create the account behind an address nobody has signed in with yet.
 *
 * The display name is generated because this route cannot ask for one — see {@link UserRow}. Six
 * random bytes is a collision every few million accounts, so the retry is for correctness rather
 * than because it is expected to run; `undefined` after five attempts is a bug, not a name clash.
 */
async function createPlayer(deps: ApiDeps, email: string): Promise<UserRow | undefined> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const created = await deps.store.createUser({
      email,
      displayName: `player-${randomBytes(6).toString('hex')}`,
      displayNameChosen: false,
    });
    if (created.ok) return created.user;
    // Lost a race to another request for the same address: that account is the right answer.
    //
    // **This branch was unreachable under a race until #266** — the losing insert threw
    // PostgreSQL's own `23505` past it, so only the sequential path, which is the path that is not
    // a race, could ever produce `email-taken`.
    //
    // `continue` rather than `return` when the winner's account is *itself* already gone, which
    // needs a deletion between the two statements: returning `undefined` there answers `500` for a
    // condition that another attempt resolves, and the loop is already bounded at five.
    if (created.reason === 'email-taken') {
      const winner = await deps.store.userByEmail(email);
      if (winner !== undefined) return winner;
    }
  }
  return undefined;
}

/**
 * Choose a display name.
 *
 * It is a route rather than a field on the sign-in request for the reason {@link requestLink}
 * states: a form that asks for a name only when the address is new tells the person filling it in
 * whether the address is new. So every account starts with a placeholder and every player renames
 * themselves afterwards, signed in, over a session that already proves they own the address.
 *
 * A taken name is reported **as such**, unlike a taken address. A display name is printed on every
 * board, so it is already public and saying it is taken leaks nothing.
 */
async function setDisplayName(deps: ApiDeps, request: ApiRequest): Promise<ApiResponse> {
  const user = await authenticate(deps, request);
  if (user === undefined) {
    return { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to change your name.' } };
  }
  const body = request.body as Partial<Record<'displayName', unknown>>;
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const issues = displayNameIssues(displayName);
  if (issues.length > 0) return { status: 400, body: { error: 'invalid-display-name', issues } };

  const renamed = await deps.store.setDisplayName(user.id, displayName);
  if (!renamed.ok) {
    return renamed.reason === 'name-taken'
      ? { status: 409, body: { error: 'name-taken', detail: 'That display name is already in use on a board.' } }
      : { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to change your name.' } };
  }
  return { status: 200, body: { user: publicUser(renamed.user) } };
}

async function logout(deps: ApiDeps, request: ApiRequest): Promise<ApiResponse> {
  if (request.token !== undefined) await deps.store.deleteSession(request.token);
  // 200 whether or not the token was real. A logout that reported "no such session" would say
  // whether a token existed.
  return { status: 200, body: { ok: true } };
}

async function me(deps: ApiDeps, request: ApiRequest): Promise<ApiResponse> {
  const user = await authenticate(deps, request);
  return user === undefined
    ? { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to see your account.' } }
    : { status: 200, body: { user: publicUser(user) } };
}

/**
 * Erase the caller's own account, and everything attached to it.
 *
 * ## The authorization rule is that there is nothing to get wrong
 *
 * The account this deletes is the one the **session token** names, and the route reads no other
 * identity: no path segment, no query parameter, no body field. There is therefore no request a
 * caller can compose that names somebody else's account — which is a stronger property than
 * comparing a supplied id against the session's, because a comparison can be forgotten on a later
 * branch and an argument that does not exist cannot be. `api.test.ts` sends one anyway — in a body,
 * in a query string, and in the path — and requires the named account to survive all three, and the
 * *caller's* account to be gone, so that a route which quietly did nothing could not pass either.
 *
 * ## Erasure spans two stores, and this route is one of them
 *
 * `docs/26-telemetry-and-privacy.md` § 3.3: telemetry rows never carry `users.id` and telemetry
 * requests never carry a session token, so a player deleting their data sends **two independent
 * requests** — this one, authenticated to the account, and one naming the `playerId` — because the
 * client holds both keys at that moment and the server never has to hold the join. So this route
 * deletes the account and every table that cascades off it — four today, and read out of
 * `pg_constraint` by `store.test.ts` rather than counted anywhere — and **claims nothing about the
 * other store**. There is no telemetry in this tree yet (§ 0, fact 1), so the second request has no
 * endpoint to reach today; when it does, it is a second route rather than a second branch of this
 * one, or the join this design exists to avoid would be back.
 *
 * ## What is deliberately not cleared, which is the half worth arguing
 *
 * The account's entry in `nextSubmitMs` goes, because it is an identifier of a deleted account
 * sitting in this process's memory until a restart and there is no reason to keep it — a fresh id
 * is a fresh budget anyway, since ids are UUIDs and never reused.
 *
 * The **sign-in link limiters do not**, and must not. {@link LINKS_PER_EMAIL} is keyed by the
 * address, not the account, and its whole job is to bound how often an address can be mailed —
 * clearing it on deletion would make *delete the account* the way to reset the budget that decides
 * whether this endpoint is an email-bombing gadget, and a session costs exactly one mail. It
 * expires on its own fifteen-minute window, which is a bound rather than a retention decision.
 *
 * {@link LINKS_PER_CALLER} is untouched for a plainer reason still: its key is an **IP address**,
 * which was never the account's to erase and belongs to whoever is calling rather than to whoever
 * signed in. Nothing about deleting an account should move a budget keyed on something an account
 * does not own.
 *
 * ## 200, and the token is dead before the caller reads the answer
 *
 * The session that authorised this is a row in `sessions`, one of the four the cascade takes, so it
 * stops working in the same statement. A second call with the same token gets the 401 an unknown
 * token has always got, so trying it twice does not distinguish a deleted account from one that
 * never existed.
 *
 * **Recorded here rather than in `DECISIONS.md`, under § D405.** The route itself is § D358 —
 * *an account can be deleted, and a raced write against a deleted one is a domain error* — which
 * already rules that the id comes off the session and the route reads no other identity. What
 * this docstring adds is local to it: which budgets are cleared, which are not, and why a 200 is
 * returned over a token that is dead before the caller reads it.
 */
async function deleteAccount(
  deps: ApiDeps,
  request: ApiRequest,
  nextSubmitMs: Map<string, number>,
): Promise<ApiResponse> {
  const user = await authenticate(deps, request);
  if (user === undefined) {
    return { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to delete your account.' } };
  }
  await deps.store.deleteUser(user.id);
  nextSubmitMs.delete(user.id);
  return {
    status: 200,
    body: {
      ok: true,
      // What was actually removed, named rather than summarised as "your data" — a player deciding
      // whether to press this is entitled to know that their board entries go with the address.
      detail:
        'That account is gone: the address, the display name, every board and challenge entry ' +
        'posted from it, every session and every outstanding sign-in link. The token that made ' +
        'this request no longer works.',
    },
  };
}

/* --------------------------------------------------------------- leaderboard */

async function submit(
  deps: ApiDeps,
  request: ApiRequest,
  nextSubmitMs: Map<string, number>,
): Promise<ApiResponse> {
  const user = await authenticate(deps, request);
  if (user === undefined) {
    return { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to post a score.' } };
  }

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
  // The run's own length, not a constant: a whole authored day is five reference replays of CPU and
  // is charged as such. Read off the submission, which `submissionIssues` has already bounded to
  // `ACCEPTED_DURATIONS_S` two lines up — so this cannot be an arbitrary number a caller chose.
  const limited = chargeCooldown(deps, user.id, nextSubmitMs, 1, submission.run.durationS);
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

  /*
   * Two values, two jobs — `ENGINE_CONTRACT.md` § 12.1 and `leaderboard/boardKey.ts`. The placement
   * says which board; the data hash says what the row was measured against. The board is decided
   * against **this server's** fixture on **this server's** clock, so a client cannot choose which
   * leaderboard it lands on any more than it can choose which challenge is open (§ D218 § 3).
   */
  const placement = placeSubmission(submission.run, user.id, dailyFixtureAt(deps.now()));
  const dataHash = runDataHashOf(submission.run, facts);
  let entry: EntryRow;
  try {
    entry = await deps.store.recordEntry({
      boardKey: placement.key,
      dataHash,
      userId: user.id,
      run: submission.run,
      // The **server's** figures. The claim is compared and then discarded; it is never what ranks.
      measured: verification.measured,
      // And the count behind the mean, which no client ever sends — `EntryRow.legs`.
      legs: verification.legs,
    });
  } catch (error) {
    if (error instanceof NoSuchUserError) return accountVanished();
    throw error;
  }
  /*
   * The key names where it landed and `placement` says what kind of place that is, because *"your
   * run is in your own log"* and *"your run is on today's board"* are different outcomes and a
   * client that had to infer which from a key's prefix would be a second place deciding what a board
   * key looks like — `menu/client.ts#AccountSummary` makes the same argument about a generated
   * display name.
   */
  return {
    status: 201,
    body: { boardKey: placement.key, placement: placement.kind, entry: publicEntry(entry) },
  };
}

async function board(deps: ApiDeps, request: ApiRequest): Promise<ApiResponse> {
  const boardKey = request.query.get('board') ?? '';
  if (boardKey.length === 0) {
    return { status: 400, body: { error: 'no-board', detail: 'Name a board with ?board=…' } };
  }
  const asked = request.query.get('metric') ?? 'awtS';
  if (!BOARD_METRICS.includes(asked as BoardMetric)) {
    return {
      status: 400,
      body: { error: 'no-such-metric', detail: `A board ranks on one of ${BOARD_METRICS.join(', ')}.` },
    };
  }
  const limit = Math.min(Math.max(Number(request.query.get('limit') ?? '25') || 25, 1), 100);
  const entries = await deps.store.board(boardKey, asked as BoardMetric, limit);
  return {
    status: 200,
    body: {
      boardKey,
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
async function challenges(deps: ApiDeps): Promise<ApiResponse> {
  const nowMs = deps.now();
  const current = await deps.store.issueChallenge(issuedChallengeAt(nowMs));
  const recent = await deps.store.recentChallenges(12);
  return {
    status: 200,
    body: {
      currentId: current.id,
      current: challengeView(deps, current, nowMs),
      clockNote: CHALLENGE_CLOCK_NOTE,
      recent: recent.map((issued) => ({
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
async function challenge(deps: ApiDeps, request: ApiRequest): Promise<ApiResponse> {
  const nowMs = deps.now();
  const resolved = await resolveChallenge(deps, request.query.get('id') ?? '', nowMs);
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
async function submitChallenge(
  deps: ApiDeps,
  request: ApiRequest,
  nextSubmitMs: Map<string, number>,
): Promise<ApiResponse> {
  const user = await authenticate(deps, request);
  if (user === undefined) {
    return { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to post a challenge entry.' } };
  }

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
  const target = await resolveChallenge(deps, submission.challengeId, nowMs);
  if (target === undefined) return noSuchChallenge(submission.challengeId);

  // The cheap gate first, and it is worth more here than on the single-run route: a shape error
  // that reached the verifier would command one simulation per seed rather than one.
  const issues = challengeSubmissionIssues(submission, target);
  if (issues.length > 0) return { status: 400, body: { error: 'invalid-submission', issues } };

  const state = challengeStateAt(target, nowMs);
  if (state !== 'open') {
    const current = await deps.store.issueChallenge(issuedChallengeAt(nowMs));
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

  // The challenge's own length, from the issued definition rather than from the request — a
  // challenge fixes its run and `schedule.ts` has already checked it against `ACCEPTED_DURATIONS_S`.
  const limited = chargeCooldown(deps, user.id, nextSubmitMs, target.seeds.length, target.config.durationS);
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
  let entry: ChallengeEntryRow;
  try {
    entry = await deps.store.recordChallengeEntry({
      challengeId: target.id,
      dataHash,
      userId: user.id,
      dispatcherProfileId: submission.dispatcherProfileId,
      // The **server's** aggregate over the **server's** runs. The claim is compared and discarded.
      score: verification.score,
    });
  } catch (error) {
    if (error instanceof NoSuchUserError) return accountVanished();
    throw error;
  }
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
async function challengeBoard(deps: ApiDeps, request: ApiRequest): Promise<ApiResponse> {
  const nowMs = deps.now();
  const asked = request.query.get('challengeId') ?? '';
  const target = await resolveChallenge(deps, asked, nowMs);
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

  const entries = await deps.store.challengeBoard(target.id, dataHash, metric as BoardMetric, limit);
  const elsewhere = (await deps.store.challengeDataHashes(target.id))
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

/**
 * The account was there when the request authenticated and is not there now.
 *
 * **Reachable only since `DELETE /api/me` landed, and only by the account's own owner.** A
 * verification is a whole simulation, so the gap between {@link authenticate} and the write is
 * seconds rather than microseconds; a player who deletes their account while a submission is
 * verifying lands here. Nothing about it is cross-account — a session cannot delete anybody else —
 * so this is a robustness answer rather than a security one.
 *
 * **401 rather than 409 or 500.** A `500` is what this used to be, and it was a lie: nothing failed
 * on the server, the caller stopped existing. A `409` would invite a retry into a state that cannot
 * come back. `401` is exactly what the *next* request would get, since the session went with the
 * account, and `not-signed-in` is the code every client already handles by dropping its session —
 * which is the correct thing for it to do here.
 *
 * The detail says the run was not posted, because the alternative reading — that it was posted and
 * then erased — is the one a player would otherwise assume, and it is wrong: the insert never
 * landed.
 */
function accountVanished(): ApiResponse {
  return {
    status: 401,
    body: {
      error: 'not-signed-in',
      detail: 'That account was deleted while this run was being verified, so nothing was posted.',
    },
  };
}

async function authenticate(deps: ApiDeps, request: ApiRequest): Promise<UserRow | undefined> {
  return request.token === undefined ? undefined : deps.store.userForSession(request.token);
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
  /** The length of one replay, in simulated seconds — see {@link cooldownForReplay}. */
  durationS: number,
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
  nextSubmitMs.set(userId, nowMs + cooldownForReplay(seedCount, durationS));
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
async function resolveChallenge(
  deps: ApiDeps,
  id: string,
  nowMs: number,
): Promise<IssuedChallenge | undefined> {
  const current = await deps.store.issueChallenge(issuedChallengeAt(nowMs));
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
 * `confirmed` is gone with the password, and its absence is a claim rather than a tidy-up. It meant
 * *this account has proved it can read its address*, and it existed because a password let somebody
 * sign in **without** proving that. A magic link cannot: the session in the caller's hand was issued
 * by redeeming a token that was mailed to the address, so every signed-in account has proved it, and
 * a flag that is true for everybody who can ever read it is a gate that has stopped gating. § D241
 * deletes the flag and `postingGate` with it rather than leaving an authorization check that cannot
 * fire — which this repository has shipped enough times to have a rule about.
 *
 * `api.test.ts` asserts this **projection** never carries a sign-in token or a session token it was
 * not asked for, over every route, so a field added to `UserRow` later cannot leak by being
 * forgotten about.
 */
function publicUser(user: UserRow): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    displayNameChosen: user.displayNameChosen,
  };
}

/**
 * One row, as a reader may see it.
 *
 * `dataHash` is on the projection and `boardKey` is not, and the asymmetry is the § 12.1 split
 * restated: the board is a property of the *request* — a client asked for `?board=…` and got rows —
 * so repeating it on every row would be the answer telling the question back. What data a row was
 * measured against is a property of the **row**, differs between rows on one board (the daily
 * board's rows differ by dispatcher, the personal log's by configuration), and is the only thing a
 * reader can use to tell *"this is the same measurement as mine"* from *"this is a different one"*.
 */
function publicEntry(entry: EntryRow): Record<string, unknown> {
  return {
    id: entry.id,
    displayName: entry.displayName,
    run: entry.run,
    dataHash: entry.dataHash,
    measured: entry.measured,
    // The `n` behind `measured.awtS`, in the same object as the mean for `publicChallengeEntry`'s
    // stated reason: R13's clause one is that the count travels in the same unit as the figure, and
    // a board row that could not draw one had to draw a bare mean.
    legs: entry.legs,
    submittedAtMs: entry.submittedAtMs,
  };
}

/**
 * Whether an address is shaped like one.
 *
 * Deliberately minimal — one `@`, something either side, no spaces. A regex claiming to implement
 * RFC 5321 rejects addresses that work; the sign-in mail is the real check, and it either arrives
 * or it does not.
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
