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

import { randomBytes, timingSafeEqual } from 'node:crypto';

import {
  CHIME_COMPLETIONS,
  RUSH_STREAM,
  type ChimeLedgerTable,
  type ChimeTurn,
  type RushPurseTable,
  chimeSinkById,
} from '@elevator-sim/core';

import {
  LOGIN_TTL_MS,
  constantTimeEquals,
  newSessionToken,
  signLoginToken,
  verifyLoginToken,
} from '../accounts/credentials.js';
import { FixedWindowLimiter } from '../accounts/rateLimit.js';
import {
  awardSignInGift,
  claimedModifierIssues,
  earnCompletion,
  spendOnModifier,
  unbackedModifiers,
  type ChimeTurnBounds,
} from '../chimes/ledger.js';
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
import { BOARD_KEYS, dailyFixtureAt, placeSubmission, runDataHashOf, rushPlacementOf } from '../leaderboard/boardKey.js';
import { boardDistributionOf, heldLadderOf, type AxisObservation } from '../leaderboard/distribution.js';
import { submissionIssues, type ResolvedDataFacts, type Submission } from '../leaderboard/submission.js';
import { seedDailyBoard } from '../leaderboard/seed.js';
import { verifySubmission, type VerificationResources } from '../leaderboard/verify.js';
import { rushSittingIssues, type SubmittedRushSitting } from '../leaderboard/rushSitting.js';
import type { RushReplayLease, RushReplays } from '../leaderboard/rushReplayPool.js';
import { ID_PATTERN, batchIssues, type TelemetryBatch } from '../telemetry/schema.js';
import {
  BOARD_METRICS,
  NoSuchUserError,
  normaliseEmail,
  type BoardMetric,
  type ChallengeEntryRow,
  type EntryRow,
  type RushEntryRow,
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
  /**
   * Headers a route adds to the ones `serve.ts` writes on every answer — so far only `Retry-After` on a
   * rush sitting refused for capacity, which a client can act on only if it arrives as a header.
   */
  readonly headers?: Readonly<Record<string, string>> | undefined;
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
  /**
   * The bearer token `POST /api/boards/seed` requires — GitHub issue #328, § D522. `undefined`
   * means seeding is not configured on this deployment and the route answers 503 to everyone;
   * `bootstrap.ts` reads it from `ELEVATOR_SIM_SEED_TOKEN` and refuses a short one. A separate
   * secret from the signing one on purpose: the scheduled workflow that holds it can seed a board
   * and can do nothing else.
   */
  readonly seedToken: string | undefined;
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
  /**
   * The chime ledger's table, read from `data/` at boot — GitHub issue **#368**.
   *
   * Injected rather than read here for the reason every other `data/` fact is: this file stays a
   * function of its arguments. It is also the only thing on this interface that decides what an
   * entry is **worth**, which is [§ D526](../../../../DECISIONS.md) clause 6's structural half —
   * no route below takes an amount from a request, because the amounts are all in here.
   */
  readonly chimeLedger: ChimeLedgerTable;
  /**
   * Which turns this build pays for — GitHub issue **#499**: the scenario ids a shipped path can
   * clear and how many waves the rush generates, read from `data/` at boot. Without it a scenario
   * could be paid once per invented id, which is every post paying again.
   */
  readonly chimeTurns: ChimeTurnBounds;
  /**
   * The rush purse — GitHub issue **#372**: `data/rush-purse.json`, read at boot and checked against
   * {@link chimeLedger}. The server derives every round's purse from it and its own replay of the round;
   * no route takes a purse or an amount from a request, which is {@link chimeLedger}'s rule one mode over.
   */
  readonly rushPurse: RushPurseTable;
  /**
   * Where a posted sitting is replayed: worker threads, one replay at a time on each, under one limit for
   * the whole process — PR #513's review, finding 2. Built by `bootstrap.ts` from
   * `ELEVATOR_SIM_RUSH_REPLAYS`; the argument is `leaderboard/rushSitting.ts`'s cost section.
   */
  readonly rushReplays: RushReplays;
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

/**
 * How many telemetry requests one **caller** may make in a quarter of an hour — GitHub issue #340.
 *
 * ## Why there is a number here at all
 *
 * The route is unauthenticated by design (`docs/26` § 8), so the only thing between it and an
 * unbounded write loop is this. A batch is capped at sixty-four events and the body at
 * {@link MAX_BODY_BYTES}, so this bounds the third dimension — how often.
 *
 * ## Why sixty
 *
 * `docs/26` § 8 requires the client to **batch per session and flush on `visibilitychange` and at a
 * declared interval, never per event**, because the container runs at `minReplicas: 0` and a cold
 * start on this deployment has been measured at 28.7 s and 32.2 s. An honest client therefore
 * sends single figures of requests per session. Sixty in fifteen minutes is far above that and far
 * below anything that looks like a loop — and it is *per caller*, so a shared office behind one
 * address has room for a dozen people playing at once.
 *
 * The window matches {@link LINKS_PER_EMAIL}'s and {@link LINKS_PER_CALLER}'s, which is not a
 * coincidence worth removing: three budgets on one window is one thing to reason about rather than
 * three, and nothing here needs a different one.
 *
 * **A refusal costs the player nothing**, which is what makes this safe to set at all. § 8: *"treat
 * total failure as normal"* — a dropped batch is a data point lost, § 9.2 already accounts for it,
 * and `docs/26 P-6` means no screen behaves differently because of it.
 */
const TELEMETRY_PER_CALLER = { maxRequests: 60, windowMs: LOGIN_TTL_MS } as const;

/**
 * How many chime writes one **account** may make in a quarter of an hour — GitHub issue #368.
 *
 * ## Why there is a number here at all, and it was measured rather than imagined
 *
 * There was none, and every other write on this surface has one. The review of PR #485 probed it:
 * **two hundred consecutive earns produced two thousand chimes and nothing was refused.** That is
 * worse than an unbounded row count, though it is that too — it makes the spend route's overdraft
 * check a guard on a number the caller can set to anything, so a ledger whose whole design is *no
 * route accepts an amount* hands out any amount asked for, one flat award at a time.
 *
 * ## Why it is keyed on the account and not on the caller's address
 *
 * The opposite of {@link TELEMETRY_PER_CALLER}, and for the opposite reason. Telemetry is
 * unauthenticated, so the address is the only key there is, and a per-player budget would be
 * bounded by a value the caller chooses. An earn is authenticated by a link this server mailed, so
 * the account **is** a key the caller cannot invent — and it is the thing being protected, because
 * a balance belongs to an account. Keying on the address instead would refuse a school, an office
 * or a household where the accounts are real, which is exactly the lockout `LINKS_PER_EMAIL`'s
 * docstring spends its length avoiding.
 *
 * ## Why twenty
 *
 * A turn has to be *played* before it can be banked. The shortest is a rush wave, which
 * `docs/38` § 2.3 measures in minutes; twenty in a quarter of an hour is far above anybody
 * finishing turns and far below anything that looks like a loop. **A refusal costs a player
 * nothing they earned**: the ledger is append-only and the turn can be banked on the next window.
 */
const CHIMES_PER_ACCOUNT = { maxRequests: 20, windowMs: LOGIN_TTL_MS } as const;

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
  /*
   * One budget across both telemetry routes, keyed on the caller — GitHub issue #340.
   *
   * Shared rather than one each, for {@link nextSubmitMs}'s reason: a caller alternating between
   * two routes must not be able to double the load by doing so. Keyed on `clientIp` and never on
   * the `playerId`, which is the whole point — a per-player budget would make an unauthenticated
   * route bounded by a value the caller chooses, and would additionally require the limiter to
   * remember which players exist, which is state § 3 does not want held.
   */
  const telemetryPerCaller = new FixedWindowLimiter(TELEMETRY_PER_CALLER);
  /*
   * One budget across both chime write verbs, keyed on the account — GitHub issue #368.
   *
   * Shared rather than one each, on {@link nextSubmitMs}'s rule: a caller alternating between two
   * routes must not be able to double the load by doing so. The read verb is deliberately outside
   * it — a `GET` writes nothing, and a screen that repaints on sign-in should not be able to spend
   * an earn's budget.
   */
  const chimesPerAccount = new FixedWindowLimiter(CHIMES_PER_ACCOUNT);
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
      case 'POST /api/boards/seed':
        return seedBoards(deps, request);
      case 'GET /api/board':
        return board(deps, request);
      case 'GET /api/board-distribution':
        return boardDistribution(deps, request);
      /*
       * A rush sitting, posted whole, and the board it lands on — GitHub issue #372, § D542 and
       * § D543. The post shares {@link nextSubmitMs} with the two other replaying routes, for that
       * budget's own reason, and is charged per round.
       */
      case 'POST /api/rush-sittings':
        return submitRushSitting(deps, request, nextSubmitMs);
      case 'GET /api/rush-board':
        return rushBoardOf(deps, request);
      case 'GET /api/challenges':
        return challenges(deps);
      case 'GET /api/challenge':
        return challenge(deps, request);
      case 'POST /api/challenge-scores':
        return submitChallenge(deps, request, nextSubmitMs);
      case 'GET /api/challenge-board':
        return challengeBoard(deps, request);
      /*
       * Telemetry — GitHub issue #340, `docs/26-telemetry-and-privacy.md` § 8.
       *
       * **Two routes, and both are outside the account API on purpose.** Neither reads
       * `request.token`, neither calls {@link authenticate}, and neither takes any argument that
       * could name an account. § 3.2: with no account id on the row and no bearer token on the
       * request, the join between a behavioural record and an address does not exist to be made.
       *
       * `POST /api/telemetry` is ingest. `POST /api/telemetry/forget` is § 3.3's **second
       * request** — the one a client sends beside `DELETE /api/me` while it holds both keys, so
       * that the server never has to.
       */
      case 'POST /api/telemetry':
        return ingestTelemetry(deps, request, telemetryPerCaller);
      case 'POST /api/telemetry/forget':
        return forgetTelemetry(deps, request, telemetryPerCaller);

      /*
       * The chime ledger's three verbs, and the shape of this block is the contract — GitHub issue
       * #368, § D526 clause 5. **One read and two posts, and there is no fourth.** No route returns
       * an entry, a source, or a history; no route accepts an amount. A route that did either would
       * be the first thing a purchase needed, which is why the absence is asserted in
       * `api.test.ts` rather than merely true today.
       */
      case 'GET /api/chimes':
        return chimeBalance(deps, request);
      case 'POST /api/chimes/earn':
        return chimeEarn(deps, request, chimesPerAccount);
      case 'POST /api/chimes/spend':
        return chimeSpend(deps, request, chimesPerAccount);
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
  /*
   * The sign-in gift — § D531, and it is deliberately the last thing and deliberately silent.
   *
   * Last, because a gift must not be able to cost anybody a session: the store refuses a second one
   * inside its own window and this awaits nothing the response depends on. Silent, because a gift
   * announced on the way in is a currency figure on a surface, and because § D526 clause 4's
   * *nothing resets on time* survives only while the player has nothing to keep up with.
   */
  await awardSignInGift({ store: deps.store, table: deps.chimeLedger, userId: user.id });
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
 * other store**.
 *
 * **That second request now exists, and it is {@link forgetTelemetry} — a second route rather than
 * a second branch of this one** (GitHub issue #340). This paragraph used to end *"there is no
 * telemetry in this tree yet (§ 0, fact 1), so the second request has no endpoint to reach
 * today"*, and that sentence is corrected rather than deleted, because it was the reason the
 * design looked incomplete and a reader who remembers it should be able to see what closed it.
 * What has **not** changed is anything this route says or does: it still takes no `playerId`, it
 * still answers with no mention of telemetry, and `api.test.ts` still asserts that its response
 * says nothing about the other store. A route that spoke for both would be asserting exactly the
 * join § 3.2 exists not to hold.
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

  /*
   * **A posted modified run is checked against a real spend** — GitHub issue #368, § D526 clause 3.
   *
   * Between the cheap gate and the expensive one, and the placement is the decision: the shape
   * check costs nothing and runs with the rest of them, and the *ledger* read runs before the
   * simulation, so a run claiming a modifier nobody paid for never commands a replay. A claim is
   * refused by sink and named, because *the ledger cannot support this claim* is a different
   * sentence from *something was wrong*.
   */
  const claimIssues = claimedModifierIssues(submission.modifiers);
  if (claimIssues.length > 0) {
    return { status: 400, body: { error: 'invalid-submission', issues: claimIssues } };
  }
  const claimed = submission.modifiers ?? [];
  if (claimed.length > 0) {
    const unbacked = unbackedModifiers(claimed, await deps.store.chimeSpends(user.id), deps.chimeLedger);
    if (unbacked.length > 0) {
      return {
        status: 422,
        body: {
          error: 'modifier-not-bought',
          detail:
            'That run says it was played with something this account has not bought: ' +
            `${unbacked.join(', ')}. Runs with a wider budget rank among runs with the same, so ` +
            'the claim has to be one the ledger can support.',
        },
      };
    }
  }

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
   *
   * **Both take `claimed`, and both take it *after* the ledger check above** — GitHub issue #371,
   * § D526 clause 3. The order is the whole guarantee: a modifier nobody paid for cannot reach a
   * board key, so a player cannot post themselves onto a rarer board by naming a purse they do not
   * have. `boardKey.ts#canonicalModifierSet` is applied inside both, so this route holds the raw
   * claim list and never a second normalisation of it.
   */
  const placement = placeSubmission(submission.run, user.id, dailyFixtureAt(deps.now()), claimed);
  const dataHash = runDataHashOf(submission.run, facts, claimed);
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
      // The canonical set the placement was computed from, so the row and its board key say the
      // same thing by construction rather than by two callers agreeing.
      modifiers: placement.modifiers,
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
    body: { boardKey: placement.key, placement: placement.kind, entry: publicEntry(deps, entry) },
  };
}

/* --------------------------------------------------------------- the ledger */

/**
 * The balance, and **nothing else on the wire** — GitHub issue **#368**,
 * [§ D526](../../../../DECISIONS.md) clause 5.
 *
 * One key. Not a list of entries, not a breakdown by source, not the last thing that was earned.
 * That is the whole of the play surface's read verb, and it is what makes an add from outside
 * invisible to play: a source the ledger gains changes this number and moves nothing else, because
 * there is nothing else here to move. `api.test.ts` asserts the key set rather than the value, so a
 * field added to this body fails a test instead of shipping.
 */
async function chimeBalance(deps: ApiDeps, request: ApiRequest): Promise<ApiResponse> {
  const user = await authenticate(deps, request);
  if (user === undefined) {
    return { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to see your balance.' } };
  }
  return { status: 200, body: { balanceChimes: await deps.store.chimeBalance(user.id) } };
}

/**
 * Bank a completed turn — **and the body carries a turn, never an amount**.
 *
 * A client says *I cleared this fix case*, *this contract day was paid* or *this rush outlasted this
 * many waves*, and the server prices it from `data/chime-ledger.json`. **No field here carries an
 * amount.** `waves` is a number, but it counts turns and the ledger prices each one; `scenarioId`
 * names a fix case. That is [§ D526](../../../../DECISIONS.md) clause 6 as a wire format rather than
 * as a rule: a purchase is a client naming an amount, and this route has nowhere to put one.
 *
 * It also has no way to name a **source**. The completions are the three in `core`'s
 * `CHIME_COMPLETIONS`; the sign-in gift is a source with no completion and is written by the
 * redemption route, so nothing a client can compose reaches it.
 *
 * **And it no longer has a way to name a `band`.** It read `body.band` and passed it to the pricing
 * function, so a client could post `single` on the easiest scenario and be paid ten instead of four
 * — against a docstring in `chimes/ledger.ts` calling the band *a property of the scenario known
 * before anybody plays*. It is withdrawn rather than validated ([§ D256](../../../../DECISIONS.md)),
 * because a validated band is still a band the payee chose; `chimes/ledger.ts#earnCompletion` holds
 * what would have to exist before an award may vary again.
 *
 * **Bounded, like every other write on this surface**, by {@link CHIMES_PER_ACCOUNT} — see there
 * for the measurement that says why, and for why the key is the account rather than the address.
 */
/*
 * ## First time only — GitHub issue #499
 *
 * The owner's ruling of 2026-09-10 is enforced here and not on the client: a `scenarioId` pays once
 * per account and a `waves` count pays only the waves beyond the account's best, and a post that
 * pays nothing is answered `200` with the balance, because re-posting a turn is not a fault.
 * `chimes/ledger.ts#earnCompletion` holds the rule and `store.ts` holds the record.
 *
 * **What it cannot check, stated rather than hidden:** that the scenario was cleared, or that the rush
 * reached the waves claimed — a contract day has been believed the same way since #368, and a rush
 * result is not replayed until #372. The bounds are the shipped fix-case ids and the stream's wave
 * count; within them a post is believed, once.
 *
 * **Its refusal details are drawn by no screen**, which is why they are not in `honesty/surfaces.ts`:
 * `packages/viz/src/dev/main.ts`'s earn binding posts and discards the answer, on § D526 clause 3's ground
 * that nothing about a chime reaches a results page.
 */
const EARN_REFUSAL_DETAIL: Readonly<Partial<Record<string, string>>> = Object.freeze({
  'unknown-scenario': 'This build has no scenario by that name to pay for.',
  'unknown-wave': 'A rush pays whole waves outlasted, from one up to the waves its stream generates.',
});

/**
 * The turn a request names, or `undefined` for a completion this build does not know.
 *
 * A missing or mistyped `scenarioId` becomes `''` and a missing or mistyped `waves` becomes `NaN`, so
 * the refusal is the ledger's and is made in one place, rather than by a second shape check here that
 * could come to disagree with it. Every other key on the body is ignored, which is what keeps an
 * amount — or any figure a run measured — from having anywhere to arrive.
 */
function turnOf(completion: string, body: Partial<Record<'scenarioId' | 'waves', unknown>> | null | undefined): ChimeTurn | undefined {
  switch (completion) {
    case 'scenario-cleared':
      return { completion: 'scenario-cleared', scenarioId: typeof body?.scenarioId === 'string' ? body.scenarioId : '' };
    case 'career-day-paid':
      return { completion: 'career-day-paid' };
    case 'rush-wave-survived':
      return { completion: 'rush-wave-survived', waves: typeof body?.waves === 'number' ? body.waves : Number.NaN };
    default:
      return undefined;
  }
}

async function chimeEarn(
  deps: ApiDeps,
  request: ApiRequest,
  perAccount: FixedWindowLimiter,
): Promise<ApiResponse> {
  const user = await authenticate(deps, request);
  if (user === undefined) {
    return { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to bank what you finished.' } };
  }
  const limited = chargeChimeWrite(deps, user.id, perAccount);
  if (limited !== undefined) return limited;
  const body = request.body as Partial<Record<'completion' | 'scenarioId' | 'waves', unknown>> | null | undefined;
  const completion = typeof body?.completion === 'string' ? body.completion : '';
  const turn = turnOf(completion, body);
  if (turn === undefined) {
    return {
      status: 400,
      body: {
        error: 'unknown-completion',
        detail: `A turn is one of ${CHIME_COMPLETIONS.join(', ')}.`,
      },
    };
  }
  const outcome = await earnCompletion({
    store: deps.store,
    table: deps.chimeLedger,
    bounds: deps.chimeTurns,
    userId: user.id,
    turn,
  }).catch((error: unknown) => {
    if (error instanceof NoSuchUserError) return undefined;
    throw error;
  });
  if (outcome === undefined) return accountVanished();
  if (!outcome.ok) {
    return {
      status: 400,
      body: { error: outcome.reason, detail: EARN_REFUSAL_DETAIL[outcome.reason] ?? 'This build does not pay that turn.' },
    };
  }
  return { status: 200, body: { balanceChimes: outcome.balanceChimes } };
}

/**
 * Spend on a modifier — **and the body carries a modifier and a number of steps, never a price**.
 *
 * `docs/38` § 2.4: chimes buy a scenario's budget up, a tower's purse up, a rush's purse up or a
 * pre-fitted start, and nothing else. What each costs is in `data/chime-ledger.json` and the store
 * refuses the write if the balance cannot cover it, inside one statement, so there is no moment at
 * which two requests can spend the same chimes.
 *
 * The answer is the new balance and what the spend granted. It is **not** a receipt id, and that is
 * deliberate: a run proves its modifier by naming the sink it claims, and the server sums what the
 * account bought (`chimes/ledger.ts#unbackedModifiers`). A receipt a client had to carry would be a
 * token that could be replayed, lost, or shared.
 */
async function chimeSpend(
  deps: ApiDeps,
  request: ApiRequest,
  perAccount: FixedWindowLimiter,
): Promise<ApiResponse> {
  const user = await authenticate(deps, request);
  if (user === undefined) {
    return { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to spend.' } };
  }
  const limited = chargeChimeWrite(deps, user.id, perAccount);
  if (limited !== undefined) return limited;
  const body = request.body as Partial<Record<'modifier' | 'steps', unknown>>;
  const sinkId = typeof body?.modifier === 'string' ? body.modifier : '';
  const steps = typeof body?.steps === 'number' ? body.steps : 1;
  if (sinkId === '' || !Number.isInteger(steps) || steps < 1) {
    return {
      status: 400,
      body: { error: 'unknown-modifier', detail: 'Name a modifier and a whole number of steps.' },
    };
  }
  const outcome = await spendOnModifier({
    store: deps.store,
    table: deps.chimeLedger,
    userId: user.id,
    sinkId,
    steps,
  }).catch((error: unknown) => {
    if (error instanceof NoSuchUserError) return undefined;
    throw error;
  });
  if (outcome === undefined) return accountVanished();
  if (!outcome.ok) {
    return outcome.reason === 'not-enough-chimes'
      ? {
          status: 409,
          body: {
            error: 'not-enough-chimes',
            detail: 'There are not enough chimes in the account for that yet.',
          },
        }
      : {
          status: 400,
          body: { error: outcome.reason, detail: 'This build does not sell that modifier.' },
        };
  }
  return {
    status: 200,
    body: { balanceChimes: outcome.balanceChimes, grantUnits: outcome.grantUnits ?? 0 },
  };
}

/**
 * Charge one chime write against the account's budget — GitHub issue #368.
 *
 * Keyed on the account rather than on `clientIp`, which is what makes it different from the
 * telemetry charge next door; {@link CHIMES_PER_ACCOUNT} carries the argument. The refusal names a
 * moment rather than a rule, because the caller is a screen that can try again.
 */
function chargeChimeWrite(
  deps: ApiDeps,
  userId: string,
  perAccount: FixedWindowLimiter,
): ApiResponse | undefined {
  const retryMs = perAccount.charge(userId, deps.now());
  if (retryMs === undefined) return undefined;
  return {
    status: 429,
    body: {
      error: 'too-many-chime-writes',
      retryAfterMs: retryMs,
      detail: 'That is more finished turns than anybody plays. Nothing is lost — try again shortly.',
    },
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
      entries: entries.map((entry) => publicEntry(deps, entry)),
    },
  };
}

/**
 * A board's quantile ladder per axis — GitHub issue #327, § D484's ruling as a route, § D506.
 *
 * What it publishes and refuses is `leaderboard/distribution.ts`'s; this is the wire. No interval
 * travels, for the reason that module's docstring gives, and a client that computed one from the
 * rungs would be doing what this route declined to.
 */
async function boardDistribution(deps: ApiDeps, request: ApiRequest): Promise<ApiResponse> {
  const boardKey = request.query.get('board') ?? '';
  if (boardKey.length === 0) {
    return { status: 400, body: { error: 'no-board', detail: 'Name a board with ?board=…' } };
  }
  const byAxis = new Map<BoardMetric, readonly AxisObservation[]>();
  for (const metric of BOARD_METRICS) {
    byAxis.set(metric, await deps.store.axisObservations(boardKey, metric));
  }
  return { status: 200, body: boardDistributionOf(boardKey, byAxis) };
}

/* ------------------------------------------------------------------- the rush */

/**
 * **Post a rush sitting, whole** — GitHub issue #372, under the owner's ruling of 2026-09-10, and
 * [§ D542](../../../../DECISIONS.md).
 *
 * `submit`'s order, for `submit`'s reasons, with a sitting in place of a run: the cheap gate first,
 * so a shape error — a purse a client named included — commands nothing; then the cooldown, **charged
 * per round** at the rush's ninety simulated minutes, so a twelve-round sitting costs what twelve
 * replays cost; then the ledger, so a top-up nobody paid for commands no replay either; then the
 * replay of every round (`leaderboard/rushSitting.ts#replayRushSitting`); then the board.
 *
 * What is stored is the server's: every round's held time, waves outlasted and purse from the replay,
 * beside the ids and the log that produced them. The held time the client claimed is compared and
 * discarded, as a single run's metrics are.
 */
async function submitRushSitting(
  deps: ApiDeps,
  request: ApiRequest,
  nextSubmitMs: Map<string, number>,
): Promise<ApiResponse> {
  const user = await authenticate(deps, request);
  if (user === undefined) {
    return { status: 401, body: { error: 'not-signed-in', detail: 'Sign in to post a rush.' } };
  }
  const issues = rushSittingIssues(request.body, deps.rushPurse);
  if (issues.length > 0) return { status: 400, body: { error: 'invalid-sitting', issues } };
  const sitting = request.body as SubmittedRushSitting;

  /*
   * **A slot first, and before anything is charged** — PR #513's review, finding 2. The replay runs on a
   * worker thread so this thread keeps answering everyone else, and the number of replays at once is one
   * limit for the whole process, because the per-account cooldown below bounds one account and nothing
   * else bounded how many replay together. No slot is `503` rather than a queue: a queued caller waits
   * behind replays of unknown length holding a socket open, and a refused one is told when to come back.
   * Taken before the cooldown so a refusal for the server's capacity costs the player nothing, and
   * released in `finally` so no way out of the route — a refusal, a replay that throws, a store fault —
   * can keep it.
   */
  const lease = deps.rushReplays.tryAcquire();
  if (lease === undefined) return replayBusy(deps.rushReplays.retryAfterS());
  try {
    return await replayAndPostRushSitting(deps, user, sitting, lease, nextSubmitMs);
  } finally {
    lease.release();
  }
}

/**
 * `503` with `Retry-After`, for a sitting that found every replay slot taken. **503 rather than 429**:
 * `429 too-many-submissions` is this API's answer to one account posting faster than its cooldown, a
 * fact about the caller, and a client that backs off on it tells the player they posted too soon. A full
 * pool is a fact about the server — the caller may not have posted anything for an hour — and `503` with
 * `Retry-After` is the status that says *not you, not now, try at this time* (RFC 9110 § 15.6.4).
 */
function replayBusy(retryAfterS: number): ApiResponse {
  return {
    status: 503,
    headers: { 'retry-after': String(retryAfterS) },
    body: {
      error: 'replay-busy',
      detail:
        'Every rush this server can replay at once is being replayed. Nothing was charged and nothing was ' +
        `posted — send the same sitting again in about ${String(retryAfterS)} s.`,
      retryAfterS,
    },
  };
}

/** The rest of {@link submitRushSitting}, on the replay slot it holds and gives back. */
async function replayAndPostRushSitting(
  deps: ApiDeps,
  user: UserRow,
  sitting: SubmittedRushSitting,
  lease: RushReplayLease,
  nextSubmitMs: Map<string, number>,
): Promise<ApiResponse> {
  const limited = chargeCooldown(deps, user.id, nextSubmitMs, sitting.rounds.length, RUSH_STREAM.lengthS);
  if (limited !== undefined) return limited;

  const claimed = sitting.modifiers ?? [];
  if (claimed.length > 0) {
    const unbacked = unbackedModifiers(claimed, await deps.store.chimeSpends(user.id), deps.chimeLedger);
    if (unbacked.length > 0) {
      return {
        status: 422,
        body: {
          error: 'modifier-not-bought',
          detail:
            'That sitting says it was played with something this account has not bought: ' +
            `${unbacked.join(', ')}. A rush with a wider purse ranks among rushes with the same, so the ` +
            'claim has to be one the ledger can support.',
        },
      };
    }
  }

  // `rushSitting.ts#replayRushSitting`, run on the slot's worker thread against the same `data/`.
  const verification = await lease.replay(sitting);
  if (!verification.ok) {
    // 422, on `submit`'s reading: well formed, and the content did not check out — which is not an
    // accusation, and the round a refusal is about travels so a client can say which one.
    return {
      status: 422,
      body: {
        error: verification.code,
        detail: verification.detail,
        ...(verification.round === undefined ? {} : { round: verification.round }),
      },
    };
  }

  const placement = rushPlacementOf(sitting.buildingId, deps.now(), claimed);
  let entry: RushEntryRow;
  try {
    entry = await deps.store.recordRushEntry({
      boardKey: placement.key,
      userId: user.id,
      buildingId: sitting.buildingId,
      seed: String(RUSH_STREAM.seed),
      heldS: verification.heldS,
      furthestWave: verification.furthestWave,
      rounds: sitting.rounds.map((round, index) => {
        const replayed = verification.rounds[index];
        if (replayed === undefined) throw new Error('the replay answers for every round it verified');
        return {
          dispatcherProfileId: round.dispatcherProfileId,
          ...(round.ruleRows === undefined ? {} : { ruleRows: round.ruleRows }),
          ...(round.interventions === undefined ? {} : { interventions: round.interventions }),
          heldS: replayed.heldS,
          wavesOutlasted: replayed.wavesOutlasted,
          purseBeforeUnits: replayed.purseBeforeUnits,
          paidUnits: replayed.paidUnits,
          purseAfterUnits: replayed.purseAfterUnits,
        };
      }),
      modifiers: placement.modifiers,
    });
  } catch (error) {
    if (error instanceof NoSuchUserError) return accountVanished();
    throw error;
  }
  return { status: 201, body: { boardKey: placement.key, entry: publicRushEntry(deps, entry, 'whole') } };
}

/** What a rush board says it ranks on, on the wire — `board`'s note, for a board with one figure. */
const RUSH_BOARD_NOTE =
  'Ranked on how long each player’s best sitting held before forty people had stood two minutes at once, ' +
  'on this tower, on this day, with this set of modifiers. Every figure is the server’s replay of every round.';

/**
 * One rush board and its ladder — GitHub issue #372, [§ D543](../../../../DECISIONS.md).
 *
 * One body rather than `board` and `board-distribution`'s two, because a rush board has one figure: the
 * rows rank on it and the ladder is over it, and splitting them would be two requests for one number.
 * The ladder is `leaderboard/distribution.ts#heldLadderOf`, so § D506's floor withholds it below twenty
 * players and publishes the count regardless.
 */
async function rushBoardOf(deps: ApiDeps, request: ApiRequest): Promise<ApiResponse> {
  const boardKey = request.query.get('board') ?? '';
  if (!boardKey.startsWith('rush:')) {
    return { status: 400, body: { error: 'no-board', detail: 'Name a rush board with ?board=rush:…' } };
  }
  const limit = Math.min(Math.max(Number(request.query.get('limit') ?? '25') || 25, 1), 100);
  const entries = await deps.store.rushBoard(boardKey, limit);
  const ladder = heldLadderOf(boardKey, await deps.store.rushHeldObservations(boardKey));
  return {
    status: 200,
    body: {
      boardKey,
      note: RUSH_BOARD_NOTE,
      entries: entries.map((entry) => publicRushEntry(deps, entry, 'row')),
      ladder,
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

/* ------------------------------------------------------------------ telemetry */

/**
 * Receive a batch of events — `POST /api/telemetry`, GitHub issue #340.
 *
 * ## What is *not* in this function, and each absence is the design
 *
 * **No {@link authenticate}.** It never reads `request.token`, and there is no branch on which it
 * could: `docs/26-telemetry-and-privacy.md` § 3.2 says a telemetry request never carries a session
 * token, because sending one would create the join the whole identity design exists to prevent.
 * That is a stronger statement than *we would not look* — there is nothing to look at.
 *
 * **No account, no address, and no IP in anything written.** `request.clientIp` reaches exactly one
 * consumer, the limiter's in-memory key, exactly as it does on the sign-in route. It is never
 * handed to `Store` (§ 0, fact 3, and telemetry does not change it).
 *
 * **No computation.** § 2.1: *"Ingest writes rows and computes nothing."* A run pointer is a seed
 * and a configuration, and re-deriving a figure from one is an analyst's offline operation, never
 * work done here — a route that replayed on ingest would put an unauthenticated caller in command
 * of this server's CPU, which is what `MIN_SUBMIT_INTERVAL_MS` exists to bound on the routes that
 * do simulate.
 *
 * ## The order is budget, then shape, then write — the opposite of {@link requestLink}'s
 *
 * There the shape check is first because it costs nothing and has no side effect, so a typo is
 * answered without spending anybody's budget. Here the shape check walks up to sixty-four events,
 * so it is the expensive part of the request, and a caller that could fail it repeatedly for free
 * would have found a way to spend this process's CPU without ever being counted.
 *
 * ## What a refusal says, and what it costs the player
 *
 * `400` with the issues, so a client that is one field out is told which field rather than being
 * told *no*. **Nothing a player sees depends on the answer** — `docs/26 P-6`, and § 8's *"treat
 * total failure as normal"* — which is what makes this route free to be strict.
 */
async function ingestTelemetry(
  deps: ApiDeps,
  request: ApiRequest,
  limiter: FixedWindowLimiter,
): Promise<ApiResponse> {
  const retryMs = limiter.charge(request.clientIp ?? 'unattributed', deps.now());
  if (retryMs !== undefined) return tooMuchTelemetry(retryMs);

  const issues = batchIssues(request.body);
  if (issues.length > 0) return { status: 400, body: { error: 'invalid-batch', issues } };

  const batch = request.body as TelemetryBatch;
  const receivedAtMs = deps.now();
  await deps.store.recordTelemetry(
    batch.events.map((event) => {
      const { name, atMs, ...fields } = event;
      return {
        playerId: batch.playerId,
        sessionId: batch.sessionId,
        buildId: batch.buildId,
        name,
        atMs,
        fields,
        receivedAtMs,
      };
    }),
  );
  /*
   * `202`, and the body says only that the batch was accepted. Not a count, not an id, not an echo
   * of what arrived: a response describing the batch would be a second copy of it travelling back
   * to a caller that already has it, and an id would be a handle to a row § 18 gives nobody a route
   * to read.
   */
  return { status: 202, body: { ok: true } };
}

/**
 * Delete every event for one `playerId` — `POST /api/telemetry/forget`, GitHub issue #340.
 *
 * ## This is the second of `docs/26` § 3.3's two requests
 *
 * A player pressing *delete my data* while signed in sends **two independent requests**: `DELETE
 * /api/me`, authenticated by the session token, which deletes the account; and this one, carrying
 * the `playerId`, which deletes the telemetry. The server sees two deletions and no relationship
 * between them, because the client holds both keys at that moment and the server never has to.
 * Signed out, only this one fires, and it is enough — § 3.2 means the telemetry never referenced
 * the account anyway.
 *
 * It is also § 4.3's withdrawal, which **deletes rather than stops**: turning the setting off sends
 * exactly this request and then clears the local slot.
 *
 * ## Unauthenticated, and what that does and does not expose
 *
 * The `playerId` is the only key and there is nothing else it could be: 128 bits from
 * `crypto.getRandomValues`, held in one `localStorage` slot on one device, derived from nothing
 * about the person. So the worst a caller who is not its owner can do is delete rows belonging to
 * an id they would first have to guess — 2^128 of them — and what they would achieve by guessing is
 * *less data collected*, which is the direction this posture already prefers. Requiring a
 * credential to be forgotten would mean minting one, and a credential for erasure is a second
 * identifier that outlives the first.
 *
 * **An unknown id and an id with no rows answer identically**, which is § 18.2's R-3 requirement
 * arriving one route early: an answer that differed would make this an oracle for whether an id
 * exists. The response therefore says nothing about how many rows there were.
 */
async function forgetTelemetry(
  deps: ApiDeps,
  request: ApiRequest,
  limiter: FixedWindowLimiter,
): Promise<ApiResponse> {
  const retryMs = limiter.charge(request.clientIp ?? 'unattributed', deps.now());
  if (retryMs !== undefined) return tooMuchTelemetry(retryMs);

  const body = request.body as Partial<Record<'playerId', unknown>> | null;
  const playerId = typeof body?.playerId === 'string' ? body.playerId : '';
  if (!ID_PATTERN.test(playerId)) {
    return {
      status: 400,
      body: {
        error: 'invalid-player-id',
        issues: ['playerId must be 32 lower-case hexadecimal characters'],
      },
    };
  }
  await deps.store.forgetTelemetry(playerId);
  return {
    status: 200,
    body: {
      ok: true,
      /*
       * What was removed, in the player's own words and **without claiming anything about the other
       * store** — the mirror of `DELETE /api/me`'s silence about this one (§ 3.3). It also does not
       * say how many rows there were, which is what keeps the two answers identical.
       */
      detail:
        'Anything recorded about how this browser was playing has been deleted. Nothing about an ' +
        'account is touched by this: that is a separate request.',
    },
  };
}

/** The refusal both telemetry routes share, carrying the wait a caller can act on. */
function tooMuchTelemetry(retryMs: number): ApiResponse {
  return {
    status: 429,
    body: {
      error: 'too-many-requests',
      retryAfterMs: retryMs,
      detail: 'That is more requests than this endpoint accepts. Nothing about the game is affected.',
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
/**
 * `POST /api/boards/seed` — seed today's daily board with the house's runs (GitHub issues #222 and
 * #328, § D521 and § D522).
 *
 * Three answers, in the order they are checked. **503** when the deployment holds no seed token:
 * seeding is a capability an operator turns on, and a route that could be reached with no
 * configuration would be a route anyone could reach. **401** when the bearer is not the token; the
 * comparison is the same constant-time one the session tokens use. **200** with the full
 * {@link SeedReport} otherwise, every row seeded and every one skipped with the verifier's reason,
 * so the workflow's log is a record rather than a count. An optional `date` in the body
 * (`YYYY-MM-DD`) names another day's board, which is how a missed night is made good by hand.
 *
 * Idempotent: a second call on the same date updates the same rows in place (`seed.ts`). Synchronous
 * on purpose: thirteen replays of the daily fixture were measured at about twenty seconds on one
 * worker, well inside any ingress timeout, and a job that answers when it is done is a job whose
 * failure is a non-200 the caller sees.
 */
async function seedBoards(deps: ApiDeps, request: ApiRequest): Promise<ApiResponse> {
  if (deps.seedToken === undefined) {
    return {
      status: 503,
      body: {
        error: 'seeding-not-configured',
        detail: 'This deployment holds no ELEVATOR_SIM_SEED_TOKEN, so nothing may seed its boards.',
      },
    };
  }
  if (request.token === undefined || !timingSafeEqualStrings(request.token, deps.seedToken)) {
    return { status: 401, body: { error: 'unauthorized', detail: 'The seed token did not match.' } };
  }
  const body = request.body as Partial<Record<'date', unknown>> | null | undefined;
  const date = typeof body?.date === 'string' ? body.date : undefined;
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    return { status: 400, body: { error: 'invalid-date', detail: 'date must be YYYY-MM-DD.' } };
  }
  const report = await seedDailyBoard(
    { store: deps.store, resources: deps.resources, factsFor: deps.factsFor, now: deps.now },
    date,
  );
  return { status: 200, body: { ...report } };
}

/** Constant-time equality over two strings of possibly different lengths. */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * A row's modifier set as it goes on the wire — **the sink, the steps, and the sink's own name.**
 *
 * GitHub issue #371, § D526 clause 3, `docs/38` § 2.3: *a run carries its modifiers onto the
 * board*. Three fields and a deliberate fourth absence.
 *
 * **The name travels rather than the client mapping the id**, on `baselineProfileId`'s argument one
 * field over: `data/chime-ledger.json` is loaded here and nowhere in `packages/viz`, so a client
 * that drew *"Start with a bigger purse"* would be a second authority for what a sink is called,
 * and the two would disagree on the day the table is edited. A sink this server does not ship falls
 * back to its id, which is what `dailyBoardViewOf` already does for a dispatcher.
 *
 * **`priceChimes` is not here and may not be.** It is on `ChimeSink` two fields from `name`, which
 * is exactly why this function names the fields it wants instead of spreading the sink: § D526
 * clause 3 forbids a currency figure in a comparison between players, and a board row is the
 * comparison. `api.test.ts` asserts the absence against a walk of the real body, with the spread
 * as its positive control.
 */
function publicModifiers(
  deps: ApiDeps,
  modifiers: EntryRow['modifiers'],
): readonly Record<string, unknown>[] {
  return modifiers.map((modifier) => ({
    sinkId: modifier.sinkId,
    steps: modifier.steps,
    name: chimeSinkById(deps.chimeLedger, modifier.sinkId)?.name ?? modifier.sinkId,
  }));
}

function publicEntry(deps: ApiDeps, entry: EntryRow): Record<string, unknown> {
  return {
    id: entry.id,
    displayName: entry.displayName,
    run: entry.run,
    dataHash: entry.dataHash,
    measured: entry.measured,
    // Absent on a standard run — every row this product wrote before the chime ledger — so a
    // standard board's body is byte-identical to the one it served before this field existed.
    ...(entry.modifiers.length === 0 ? {} : { modifiers: publicModifiers(deps, entry.modifiers) }),
    // The house's dispatcher on a baseline row, absent on a player's — GitHub issue #222, § D521.
    // On the wire so the client can draw the marker and the note rather than inferring either from
    // a display name, which a player could choose.
    ...(entry.baselineProfileId === undefined ? {} : { baselineProfileId: entry.baselineProfileId }),
    // The `n` behind `measured.awtS`, in the same object as the mean for `publicChallengeEntry`'s
    // stated reason: R13's clause one is that the count travels in the same unit as the figure, and
    // a board row that could not draw one had to draw a bare mean.
    legs: entry.legs,
    submittedAtMs: entry.submittedAtMs,
  };
}

/**
 * A rush entry on the wire — GitHub issue #372.
 *
 * **`whole`** is the poster's own answer, carrying every round with the purse the server derived for it,
 * because the player who played the sitting is the one reader for whom a purse is a fact about their
 * own record. **`row`** is a board row, which carries how long it held, the wave, how many rounds and the
 * modifiers — and no purse, because a purse is a mode's money and a board row is a comparison between
 * players. **Neither carries a price or a chime**: the modifier travels through {@link publicModifiers},
 * which names the fields it sends for exactly that reason (§ D526 clause 3).
 */
function publicRushEntry(deps: ApiDeps, entry: RushEntryRow, shape: 'whole' | 'row'): Record<string, unknown> {
  return {
    id: entry.id,
    displayName: entry.displayName,
    buildingId: entry.buildingId,
    seed: entry.seed,
    heldS: entry.heldS,
    furthestWave: entry.furthestWave,
    ...(shape === 'whole' ? { rounds: entry.rounds } : { roundCount: entry.rounds.length }),
    ...(entry.modifiers.length === 0 ? {} : { modifiers: publicModifiers(deps, entry.modifiers) }),
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
