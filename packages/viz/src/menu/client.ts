/**
 * Talking to the account and leaderboard server, over an **injected** transport.
 *
 * `DECISIONS.md` § D214 § 6 makes the wire plain HTTP + JSON, and this is the client half of it.
 * The transport is a parameter rather than a global `fetch` for the same reason `menu/menu.ts` has
 * no `document` in it: a network call made through an ambient global is a call no test can drive,
 * and the interesting cases here are all failures — a server that is down, a body that is not JSON,
 * a 422 that means *"your score did not replay"* and must not read as an accusation.
 *
 * ## Nothing here throws
 *
 * Every method returns a discriminated result. A menu that had to wrap each call in a `try` would
 * grow one `catch` per screen, and the one that got forgotten would show a player a blank panel
 * with no words on it. `Failure.detail` is always something that can be put on screen as-is.
 *
 * ## What this client deliberately does not do
 *
 * It does not compute a score, and it does not decide whether a run is quotable. The server
 * re-simulates and measures for itself (§ D214 § 3); a client-side figure is a *claim*, and this
 * module's job is to carry the claim, not to believe it.
 *
 * ## Sign-in is a mailed link, and there is nothing here that takes a password
 *
 * § D241. `/api/register`, `/api/login` and `/api/confirm` are gone from the server and the two
 * methods that called them are gone from here; {@link LeaderboardClient.requestLink} and
 * {@link LeaderboardClient.redeem} replace them. The absence is asserted rather than described —
 * `client.test.ts` reads the server's own source and fails if a password rule ever returns while
 * this half is still an email-only form.
 *
 * ## Nothing here gives up early, and that is a decision rather than an omission
 *
 * The server runs at `minReplicas: 0` and a cold `GET /api/challenges` against the live app was
 * measured at **28.7 s** (§ D243 § 4). So this module sets **no timeout and no `AbortSignal`**: a
 * client that gave up at five or ten seconds would turn the first request after an idle period into
 * `unreachable`, which is the one failure sentence that is wrong here — the server is reachable and
 * is starting. Telling the player something is happening is the *caller's* job, and `dev/main.ts`
 * does it on a timer beside the request rather than by cutting it short. `client.test.ts` asserts
 * the absence lexically, because *"we do not time out"* is a claim about every future edit.
 */

import type {
  ChallengeBoardPage,
  ChallengeBoardRow,
  ChallengeEntryAccepted,
  ChallengeIndex,
  ChallengeSubmission,
} from './challenge.js';

/* -------------------------------------------------------------------------- *
 * The wire types
 * -------------------------------------------------------------------------- */

/**
 * A signed-in player, as the server describes them.
 *
 * **`confirmed` is gone, and its absence is the point.** § D241 § 5: it existed because a password
 * issues a session to somebody who has not proved they can read the address. A mailed link cannot —
 * the session in this client's hand was minted by redeeming a token that arrived at the address —
 * so the flag would have been `true` for everybody who could ever observe it, and a gate that
 * cannot fire is this repository's most-repeated defect.
 *
 * `displayNameChosen` replaces it and does the opposite job: it is `false` exactly once per
 * account, and it is on the wire so the viewer can ask for a name **once** rather than recognising
 * a generated one by its shape — which would be a second place deciding what one looks like.
 */
export interface AccountSummary {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  /** False until the player has named themselves. § D241 § 7 — prompt exactly once. */
  readonly displayNameChosen: boolean;
}

/**
 * What `POST /api/auth/request-link` answers — **identical bytes whether or not the account
 * exists**, which is the account-enumeration oracle the whole flow is shaped around.
 *
 * `detail` is the server's own sentence and is shown unrewritten. It is the one place the expiry is
 * put into words, and rewording it here would be a second answer to *how long have I got*.
 */
export interface LinkRequested {
  readonly detail: string;
  readonly expiresInMs: number;
}

/** The run half of a submission — the same fields Free Play selects, by construction. */
export interface RunSubmission {
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly demandTemplateId: string;
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
  /**
   * Which part of the day, or `null` for the whole period — § D285/§ D286.
   *
   * On the wire because the server **re-simulates the seed itself** rather than storing what a
   * client claims (§ D214 § 3), so a window it could not see is a window it would replay over the
   * whole day. § D288 refused a windowed submission in `scope/runIdentity.ts` for precisely that
   * reason, and named this field as the fix; the refusal is gone and this is what replaced it.
   *
   * A start and no end, matching {@link FreePlaySelection}: the far end is
   * `windowStartS + durationS`, and `durationS` is already here.
   */
  readonly windowStartS: number | null;
  readonly seed: string;
  /**
   * The Everyday rules the run's dispatcher was driven by — § 11.5, in first-match order.
   *
   * Absent for every run that wrote none, which is not a default standing in for a missing value:
   * `authoring/ruleSpec.ts#profileWithRules` returns the driving profile by object identity for an
   * empty list, so a run with no rules **is** the run the submitted dispatcher id already implies.
   * The server drops the key from its digest for the same reason, so every score posted before this
   * field re-verifies unchanged.
   *
   * `scope/runIdentity.ts` refused a written rule list until this field existed — *"no selection or
   * submission carries a rule list"* — and the whole of § 11's workshop therefore produced
   * dispatchers nobody could post. The refusal was correct; the fact it rested on is gone.
   *
   * The rows are structurally `core`'s own `RuleRowConfig`, restated rather than imported for
   * `menu/challenge.ts`'s reason applied to the other package: this is the wire, and two ends of a
   * wire are allowed to declare one shape twice. `runIdentity.test.ts` reads the server's source
   * text so the two cannot drift.
   */
  readonly ruleRows?: readonly SubmittedRuleRow[] | undefined;
  /**
   * The run record's intervention log — `ENGINE_CONTRACT.md` § 1.4's `{ seed, config,
   * interventions[] }`, in press order.
   *
   * § 1.4 clause 2 is *replay verification*: the server re-simulates the record, **log included**,
   * and refuses a submission whose metrics do not reproduce. Without this field it re-simulated the
   * seed without the log, got different legs, and refused an honest run as a forgery.
   *
   * Only `park-cars-lobby` travels. A `switch-dispatcher` carries a whole weight vector inline,
   * which is the cheat `RunSubmission`'s ids exist to prevent; an `answer-incident` answers a
   * campaign incident that is on no wire, so a replay would have the answer and not the thing
   * answered. `scope/runIdentity.ts` still refuses both, naming which.
   */
  readonly interventions?: readonly SubmittedIntervention[] | undefined;
}

/**
 * One when/then rule row on the wire — `core`'s `RuleRowConfig` without its `$comment`.
 *
 * Ids and values from `RULE_CONDITIONS` / `RULE_ACTIONS` and their declared `values` lists, which
 * both ends resolve out of `core`. The server refuses anything outside them before it will simulate,
 * so the space a submission can express is a finite product of shipped vocabulary — which is what
 * makes a rule list unlike a building, and why it may travel where a fabric may not.
 */
export interface SubmittedRuleRow {
  readonly when: string;
  readonly whenValue?: number | string | undefined;
  readonly then: string;
  readonly thenValue?: number | string | undefined;
}

/** One entry of the run record's log — `{ atS, change }`, contract § 1.4. */
export interface SubmittedIntervention {
  readonly atS: number;
  readonly change: { readonly kind: string };
}

export interface ClaimedMetrics {
  readonly awtS: number;
  readonly wt95S: number;
  readonly ttdMeanS: number;
  readonly pctOverLongWait: number;
  readonly awtIsValid: boolean;
}

/**
 * The claim a client makes about its own run, or the reason it cannot make one.
 *
 * ## The fallback this replaces, and why it was an accusation waiting to happen
 *
 * `dev/main.ts` built this literal inline and wrote `pctOverLongWait: summary.pctOverLongWait ?? 0`.
 * The figure is `null` when it was **never measured** — `core` produces `NaN` for a share with no
 * denominator and the recording stores `null` — so that `?? 0` turns *unmeasured* into *zero per
 * cent*, and the server, which measures the same run and gets `NaN`, compares `NaN` against `0` and
 * refuses the submission as `metrics-do-not-reproduce`.
 *
 * That is this product's **one accusation**, spent on a client fallback. Today the run in question
 * usually fails `awtIsValid` and the quotability refusal fires first, so the bug is masked rather
 * than harmless — a masked wrong accusation is exactly the kind that surfaces after the mask moves.
 *
 * ## Why the answer is a refusal rather than a better substitute
 *
 * There is no number that works. `NaN` is what the server will measure, and `JSON.stringify(NaN)`
 * is `null`, so it does not survive the wire as `NaN` either. The only honest submission of an
 * unmeasured figure is **not submitting**, with a sentence saying which figure and why — the same
 * argument `runIdentityIssues` makes for a run the server could not reproduce.
 */
export type ClaimedMetricsResult =
  | { readonly ok: true; readonly claimed: ClaimedMetrics }
  | { readonly ok: false; readonly detail: string };

/** What a summary claims, or why it cannot claim it. */
export function claimedMetricsOf(summary: {
  readonly meanWaitS: number;
  readonly wait95S: number;
  readonly meanTimeToDestinationS: number;
  readonly pctOverLongWait: number | null;
  readonly awtIsValid: boolean;
}): ClaimedMetricsResult {
  if (summary.pctOverLongWait === null) {
    return {
      ok: false,
      detail:
        'This run has no long-wait share to post — nothing waited long enough for the figure to ' +
        'have a denominator, so it was never measured. A score is a claim about every figure it ' +
        'carries, and there is no number that would be true here.',
    };
  }
  return {
    ok: true,
    claimed: {
      awtS: summary.meanWaitS,
      wt95S: summary.wait95S,
      ttdMeanS: summary.meanTimeToDestinationS,
      pctOverLongWait: summary.pctOverLongWait,
      awtIsValid: summary.awtIsValid,
    },
  };
}

export interface BoardEntry {
  readonly id: string;
  readonly displayName: string;
  readonly run: RunSubmission;
  /**
   * What data this row was measured against — the server's digest of the resolved building,
   * dispatcher and template plus the run's own axes.
   *
   * **Not a board key**, and the distinction is `ENGINE_CONTRACT.md` § 12.1's: a board is keyed by
   * the date or, for anything else, by the player, and this says which *measurement* a row is. Rows
   * on one board carry different ones — the daily board's differ by dispatcher, a personal log's by
   * configuration — so it is the only thing a reader can compare to know whether another row is the
   * same question as theirs.
   */
  readonly dataHash: string;
  readonly measured: ClaimedMetrics;
  /**
   * Served legs in the row's measurement window — the `n` behind `measured.awtS`.
   *
   * `undefined` from a server too old to send it, and that is the whole reason it is optional: a
   * board row that draws a mean with no count is R13 clause one, so a row that cannot say `n`
   * withholds the figure rather than printing it bare. The alternative would have been a default,
   * and a default here is a made-up denominator on the one screen where a number is a boast.
   *
   * Never sent by a client and never part of `ClaimedMetrics`, which is the *claim*. The server
   * reads it off its own replay — see `packages/server/src/store/store.ts#EntryRow.legs`.
   */
  readonly legs: number | undefined;
  readonly submittedAtMs: number;
}

export interface BoardPage {
  /** `daily:YYYY-MM-DD` or `personal:<user id>` — the key the page was asked for. */
  readonly boardKey: string;
  readonly metric: string;
  /** The server's own sentence about what the ranking means. Shown, never paraphrased. */
  readonly note: string;
  readonly entries: readonly BoardEntry[];
}

export interface BoardSummary {
  readonly boardKey: string;
  readonly entries: number;
  readonly latestMs: number;
}

/**
 * One row of the server's own board-key table — the contract's three keys, each with the route that
 * reaches it or `null` for a key the product declares and cannot yet produce.
 *
 * It is on the wire rather than transcribed here for the reason `/api/boards` states: a client
 * drawing a list has to tell *nothing has been posted yet* from *no route in this product could
 * produce one*, and only the server knows which. A second copy of this table on the client would be
 * a second answer to what a board is.
 */
export interface BoardKind {
  readonly key: string;
  readonly board: string;
  readonly route: string | null;
}

/** The axes the daily board fixes. The server's, used as given — never rebuilt from parts. */
export interface DailyFixtureAxes {
  readonly buildingId: string;
  readonly demandTemplateId: string;
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
  readonly windowStartS: number | null;
}

/**
 * Today's fixture, as the server computed it from its own clock.
 *
 * `date` is UTC and is the daily board's whole key, so a caller reads `daily:${today.date}` rather
 * than parsing a prefix off a key or asking its own clock what day it is. Both of those are the
 * same defect — a second place deciding what a board key looks like — and {@link submit} refuses
 * the first by name.
 */
export interface DailyFixture {
  readonly date: string;
  readonly seed: string;
  readonly config: DailyFixtureAxes;
}

/**
 * What `/api/boards` answers: the boards that have entries, the kinds this build has at all, and
 * today's fixture.
 *
 * **`today` is optional and its absence is a real case rather than a defensive one.** The API image
 * is deployed by hand and nothing rebuilds it on a push, so a running server can predate the field.
 * `undefined` means *the server did not say*, which a caller must not read as *there is no board
 * today*.
 */
export interface BoardsPage {
  readonly boards: readonly BoardSummary[];
  readonly kinds: readonly BoardKind[];
  readonly today: DailyFixture | undefined;
}

/* -------------------------------------------------------------------------- *
 * Results
 * -------------------------------------------------------------------------- */

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * A failure, as something a panel can render without interpreting.
 *
 * `code` is the server's machine-readable reason where it gave one, or one of this module's own
 * transport codes. `detail` is always a sentence. **A rejection is not an accusation** — the server
 * says so explicitly for `metrics-do-not-reproduce`, and the client must not dress it up as one.
 */
export interface Failure {
  readonly ok: false;
  readonly code: string;
  readonly detail: string;
  /** Field-level problems, when the server reported a list of them. */
  readonly issues: readonly string[];
  /**
   * The server's whole error body, verbatim, when there was one. Absent for transport failures.
   *
   * `code`, `detail` and `issues` are what almost every refusal is, and reducing a body to those
   * three is what keeps a panel from having to understand the server. One refusal carries more:
   * `challenge-not-open` (409) states the requested challenge's window, which state it is in, and
   * **which challenge is open now** — and a screen that could not reach that could only say
   * *"closed"*, which is a dead end rather than *"a reason a player can act on"* (§ D218 § 5).
   *
   * Deliberately `unknown` and deliberately not parsed here. `menu/challenge.ts#challengeNotOpenOf`
   * is where it is read and checked, so this module keeps its one job: carry, do not interpret.
   */
  readonly body?: unknown;
}

export type Result<T> = Success<T> | Failure;

/* -------------------------------------------------------------------------- *
 * The transport
 * -------------------------------------------------------------------------- */

/** One request, as this module makes them. */
export interface TransportRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly token: string | undefined;
  readonly body: unknown;
}

/** One response. Deliberately not a `Response`: nothing here should need a DOM to be tested. */
export interface TransportResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Anything that can carry a request. May reject; {@link createClient} catches. */
export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

/* -------------------------------------------------------------------------- *
 * The wordings this module owns
 * -------------------------------------------------------------------------- */

/**
 * The three sentences the client authors itself, in one table.
 *
 * Every other sentence a player sees from a failed request is the **server's**, carried through
 * untouched — a rejection is not an accusation and the server is the one place that decides how one
 * is worded. These three have no server to come from: the request never arrived, or the answer was
 * a shape this build cannot read.
 *
 * A table rather than three string literals inside `createClient`, so the honesty sweep can drive
 * them. A sentence buried in a `catch` is a sentence no property ever looks at.
 */
export const CLIENT_FAILURES: Readonly<Record<'unreachable' | 'unexpected-response' | 'refused', string>> =
  Object.freeze({
    // Says the run survives, because the reading people assume — "my score is gone" — is both
    // wrong and the one that makes them stop playing.
    unreachable:
      'The leaderboard server could not be reached. Your run is not lost — it can be posted when ' +
      'the connection is back.',
    'unexpected-response':
      'The server answered in a shape this build does not understand. It may be a newer version.',
    // The fallback when a 4xx carried no `detail` of its own. Deliberately says nothing about why:
    // inventing a reason here would be a second place deciding what a refusal means.
    refused: 'The server refused that request.',
  });

/**
 * A {@link Transport} over the platform `fetch`.
 *
 * Separate from {@link createClient} so the client's tests never touch the network and this
 * adapter's own shortcomings — a body that is not JSON, a server that is unreachable — are handled
 * in one place instead of at each call site.
 */
export function fetchTransport(fetchLike: typeof fetch): Transport {
  return async (request) => {
    const response = await fetchLike(request.url, {
      method: request.method,
      headers: {
        'content-type': 'application/json',
        ...(request.token === undefined ? {} : { authorization: `Bearer ${request.token}` }),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // A non-JSON body is a real outcome — a proxy's HTML error page is the usual one — and it
      // must not surface as "undefined is not an object" three layers up.
      body = undefined;
    }
    return { status: response.status, body };
  };
}

/* -------------------------------------------------------------------------- *
 * The client
 * -------------------------------------------------------------------------- */

export interface LeaderboardClient {
  /**
   * Start the container, and do not wait for it.
   *
   * The app runs at `minReplicas: 0`. A request to a sleeping container was measured at **32.2 s**
   * against **0.13 s** warm — a 240× gap, essentially all time-to-first-byte, so it is the process
   * starting rather than anything on the wire. That cost is not removed by asking for it sooner,
   * but the *player's* share of it is: a wake fired when somebody opens the Account screen is
   * usually finished by the time they have typed an address.
   *
   * ## Three things a caller must not do with it
   *
   * **Do not branch on the result.** The route answers from memory with no store call, precisely so
   * a 200 means *the process is running* and nothing else; a caller that treated a failure as
   * meaningful would have turned a courtesy into a dependency, and a database outage would read as
   * a server that is merely asleep.
   *
   * **Do not block a render on it.** Nothing on any screen is waiting for this, and a panel that
   * awaited it would have made the cold start visible in the one place it currently is not.
   *
   * **Do not fire it in a loop.** Once per screen entry — not per keystroke, not per render.
   *
   * It returns a `Result` like everything else here rather than `void`, so it is testable and so a
   * caller cannot be surprised by a rejection; the contract is that the value is ignored.
   */
  wake(): Promise<Result<null>>;
  /**
   * Ask for a sign-in link. **There is no second door** — no register, no login, no password.
   *
   * `/api/register`, `/api/login` and `/api/confirm` are gone (§ D241 § 5), and this method is not
   * a rename of any of them: it does not know or say whether the address is new, and the 202 it
   * returns is byte-identical either way. A client that offered *sign in* and *create an account*
   * as separate actions would rebuild that oracle in the interface, which is why there is one
   * method here and not two.
   *
   * Refusals worth handling by name: **400** `invalid-address` with `issues`, and **429**
   * `too-many-link-requests`, whose body carries `retryInMs` — read it with
   * `menu/account.ts#linkRetryInMsOf`, on the same footing `challengeNotOpenOf` reads the 409.
   */
  requestLink(email: string): Promise<Result<LinkRequested>>;
  /**
   * Spend a mailed link and take the session it mints.
   *
   * A **POST**, deliberately: § D241 § 4's second mechanism. Mail clients, corporate link-rewriters
   * and scanners fetch every URL in a message, and nothing that follows a link issues a POST — so
   * a prefetch cannot spend a player's link. The first mechanism is the caller's: the token arrives
   * in the URL **fragment**, which is never transmitted, and the caller clears it once redeemed.
   *
   * The three 400s — `link-expired`, `link-spent`, `link-invalid` — are distinguished *for the
   * person holding the link*, because whether asking again will help differs. Each arrives with the
   * server's own sentence.
   *
   * The link token is a credential. It is passed here and is never put in a notice, a log or a URL
   * this client builds.
   */
  redeem(linkToken: string): Promise<Result<{ token: string; user: AccountSummary }>>;
  logout(token: string): Promise<Result<null>>;
  me(token: string): Promise<Result<AccountSummary>>;
  /**
   * Choose the name that goes on every board.
   *
   * A second request rather than a field on the link request, and § D241 § 7 is why: a form that
   * asked for a name **only when the address was new** would tell the person filling it in whether
   * the address was new.
   *
   * **409 `name-taken` is reported as such and a taken address never is**, and the asymmetry is not
   * an oversight: a display name is printed on every board, so it is already public.
   */
  setDisplayName(token: string, displayName: string): Promise<Result<AccountSummary>>;
  submit(
    token: string,
    submission: { run: RunSubmission; claimed: ClaimedMetrics },
  ): Promise<Result<{ boardKey: string; placement: string; entry: BoardEntry }>>;
  /**
   * The board list, the kinds, and today's fixture — the whole of what `/api/boards` answers.
   *
   * This used to return `readonly BoardSummary[]` and discard `kinds` and `today`, which made the
   * daily board unfindable without parsing a `daily:` prefix off a key — the exact thing
   * {@link submit} refuses to do. The server has always sent both; the client was throwing them
   * away.
   */
  boards(): Promise<Result<BoardsPage>>;
  board(boardKey: string, metric: string): Promise<Result<BoardPage>>;
  /**
   * The challenge index — **the only answer** to *"which challenge is it today"*.
   *
   * § D218 § 3. There is no parameter, and that is the mechanical form of the guarantee: there is
   * nothing a caller could pass to move the answer, and nothing in this client reads a clock, so a
   * browser whose clock is a week out still renders the challenge the server says is open.
   */
  challenges(): Promise<Result<ChallengeIndex>>;
  /**
   * Post one dispatcher's figures for **every** seed of a challenge.
   *
   * Build the body with `menu/challenge.ts#challengeSubmissionOf`, which refuses a short or
   * duplicated set before it costs the player a round trip and the server one replay per seed.
   *
   * The refusal to word carefully is the 409: `challenge-not-open` carries the window, the state
   * and the challenge that *is* open, reachable through `challengeNotOpenOf`.
   */
  submitChallenge(token: string, submission: ChallengeSubmission): Promise<Result<ChallengeEntryAccepted>>;
  challengeBoard(challengeId: string, metric: string): Promise<Result<ChallengeBoardPage>>;
}

/**
 * Build a client against `origin`.
 *
 * `origin` is required and has no default. A client that fell back to the page's own origin would
 * silently work in development and silently fail in a build served from a CDN, which is the class
 * of bug that only reproduces where it cannot be debugged.
 */
/**
 * Whether a value is the server's daily fixture, checked field by field.
 *
 * Shape-checked rather than cast, because this is the one field on this page a caller will build a
 * run from: a partial fixture that type-asserted its way through would produce a run posted against
 * the wrong axes, and the server would then correctly refuse it with an accusation the client
 * earned. The other two fields on the page are read-only prose and a cast costs nothing.
 */
function isDailyFixture(value: unknown): value is DailyFixture {
  const fixture = value as Record<string, unknown> | null | undefined;
  if (typeof fixture?.['date'] !== 'string' || typeof fixture['seed'] !== 'string') return false;
  const config = fixture['config'] as Record<string, unknown> | null | undefined;
  return (
    typeof config?.['buildingId'] === 'string' &&
    typeof config['demandTemplateId'] === 'string' &&
    typeof config['durationS'] === 'number' &&
    (config['arrivalRatePctPop5min'] === null || typeof config['arrivalRatePctPop5min'] === 'number') &&
    (config['windowStartS'] === null || typeof config['windowStartS'] === 'number')
  );
}
/**
 * One board row with its `legs` reduced to a count or nothing.
 *
 * A finite number is a count; anything else — absent, `null`, a string, `NaN` — is *no count*, and
 * the row withholds its mean. See {@link BoardEntry.legs} for why there is no default.
 */
function withLegs(entry: unknown): BoardEntry {
  const record = entry as Record<string, unknown>;
  const legs = record['legs'];
  return {
    ...record,
    legs: typeof legs === 'number' && Number.isFinite(legs) ? legs : undefined,
  } as unknown as BoardEntry;
}


/**
 * The sentence a 4xx gets on screen — the server's `detail`, else its `issues`, else the fallback.
 *
 * **The middle arm is the one that had been missing**, and it was measured rather than reasoned
 * about (GitHub issue #267). `http/api.ts` answers a shape error with
 * `{ error: 'invalid-submission', issues: [...] }` and **no `detail`**, so a player who posted a run
 * the server would not take read *"The server refused that request."* while the response in hand
 * said `durationS must be one of 300, 900, 1800, 3600, 7200`. Not a silent failure — which is what
 * the issue feared — but a refusal a player cannot act on, which is the same defect one notch
 * quieter.
 *
 * This is **not** {@link CLIENT_FAILURES.refused}'s rule being broken. That fallback says nothing
 * about *why* because inventing a reason here would be a second place deciding what a rejection
 * means; `issues` is not an invention, it is the server's own wording in the same body as `detail`,
 * written for the same reader. Preferring `detail` keeps the ordering honest where a route sends
 * both.
 *
 * Recorded here rather than in `DECISIONS.md`, under § D405 — the arm order is local to this function
 * and `CLIENT_FAILURES.refused`'s rule is untouched: `issues` is the server's own wording, not an
 * invention of this client's.
 */
function refusalDetail(body: Record<string, unknown>): string {
  if (typeof body['detail'] === 'string') return body['detail'];
  const issues = Array.isArray(body['issues']) ? (body['issues'] as unknown[]) : [];
  const sentences = issues.filter((issue): issue is string => typeof issue === 'string' && issue.length > 0);
  // Joined rather than reduced to the first: a shape gate reports **all** of them on purpose, so a
  // caller fixing one at a time learns how many there are — and a screen showing one of four would
  // undo that at the last step.
  return sentences.length === 0 ? CLIENT_FAILURES.refused : `The server refused that request: ${sentences.join('; ')}.`;
}

export function createClient(origin: string, transport: Transport): LeaderboardClient {
  const base = origin.replace(/\/$/u, '');

  async function call<T>(request: TransportRequest, expect: (body: unknown) => T | undefined): Promise<Result<T>> {
    let response: TransportResponse;
    try {
      response = await transport(request);
    } catch {
      return { ok: false, code: 'unreachable', detail: CLIENT_FAILURES.unreachable, issues: [] };
    }
    const body = (response.body ?? {}) as Record<string, unknown>;
    if (response.status >= 400) {
      return {
        ok: false,
        code: typeof body['error'] === 'string' ? body['error'] : `http-${String(response.status)}`,
        // The server's own wording where there is one. It is written for a player and rewriting it
        // here would be a second place that decides what a rejection means.
        detail: refusalDetail(body),
        issues: Array.isArray(body['issues']) ? (body['issues'] as string[]) : [],
        // Whole and unread. The three fields above are what a panel usually needs; the body is what
        // the one refusal that carries a window needs, and dropping it here would mean adding a
        // field to this type every time the server had more to say.
        body: response.body,
      };
    }
    const value = expect(response.body);
    if (value === undefined) {
      // A 2xx whose shape is wrong is a server the client does not understand, and pretending
      // otherwise would put `undefined` on screen where a score should be.
      return {
        ok: false,
        code: 'unexpected-response',
        detail: CLIENT_FAILURES['unexpected-response'],
        issues: [],
      };
    }
    return { ok: true, value };
  }

  const session = (body: unknown): { token: string; user: AccountSummary } | undefined => {
    const record = body as Record<string, unknown> | null;
    const user = record?.['user'] as AccountSummary | undefined;
    return typeof record?.['token'] === 'string' && user !== undefined
      ? { token: record['token'], user }
      : undefined;
  };

  const user = (body: unknown): AccountSummary | undefined =>
    (body as Record<string, unknown> | null)?.['user'] as AccountSummary | undefined;

  return {
    // `() => null` rather than a shape check: there is nothing in the body a caller is allowed to
    // read, so a "wrong shape" refusal would be a distinction with nothing behind it.
    wake: () => call({ method: 'GET', url: `${base}/api/wake`, token: undefined, body: undefined }, () => null),
    requestLink: (email) =>
      call({ method: 'POST', url: `${base}/api/auth/request-link`, token: undefined, body: { email } }, (body) => {
        const record = body as Record<string, unknown> | null;
        // `detail` decides the shape, because it is the only field a screen has to show. A 202 with
        // no sentence in it is a build this client does not understand, and drawing "check your
        // email" over it would be inventing the one wording § D241 § 7 keeps on the server.
        return typeof record?.['detail'] === 'string'
          ? {
              detail: record['detail'],
              expiresInMs: typeof record['expiresInMs'] === 'number' ? record['expiresInMs'] : 0,
            }
          : undefined;
      }),
    // The link token travels in the **body** of a POST and never in the URL: a query string reaches
    // access logs, ingress traces and `Referer`, and this one is a credential.
    redeem: (linkToken) =>
      call({ method: 'POST', url: `${base}/api/auth/redeem`, token: undefined, body: { token: linkToken } }, session),
    logout: (token) => call({ method: 'POST', url: `${base}/api/logout`, token, body: {} }, () => null),
    me: (token) => call({ method: 'GET', url: `${base}/api/me`, token, body: undefined }, user),
    setDisplayName: (token, displayName) =>
      call({ method: 'POST', url: `${base}/api/me/display-name`, token, body: { displayName } }, user),
    submit: (token, submission) =>
      call({ method: 'POST', url: `${base}/api/scores`, token, body: submission }, (body) => {
        const record = body as Record<string, unknown> | null;
        return typeof record?.['boardKey'] === 'string'
          ? {
              boardKey: record['boardKey'],
              // Which *kind* of place, said by the server rather than parsed off the key's prefix —
              // a client that read `personal:` out of a string would be a second place deciding what
              // a board key looks like.
              placement: String(record['placement'] ?? ''),
              entry: record['entry'] as BoardEntry,
            }
          : undefined;
      }),
    boards: () =>
      call({ method: 'GET', url: `${base}/api/boards`, token: undefined, body: undefined }, (body) => {
        const record = body as Record<string, unknown> | null;
        const boards = record?.['boards'];
        if (!Array.isArray(boards)) return undefined;
        /*
         * `boards` decides whether the answer is readable; the other two are carried when present
         * and left `undefined`/empty when not. A server that predates them is a real case — the
         * image is hand-deployed — and it is not an `unexpected-response`, because the half this
         * client has always read is exactly as readable as it ever was.
         */
        const kinds = record?.['kinds'];
        const today = record?.['today'];
        return {
          boards: boards as readonly BoardSummary[],
          kinds: Array.isArray(kinds) ? (kinds as readonly BoardKind[]) : [],
          today: isDailyFixture(today) ? today : undefined,
        };
      }),
    board: (boardKey, metric) =>
      call(
        {
          method: 'GET',
          url: `${base}/api/board?board=${encodeURIComponent(boardKey)}&metric=${encodeURIComponent(metric)}`,
          token: undefined,
          body: undefined,
        },
        (body) => {
          const record = body as Record<string, unknown> | null;
          const entries = record?.['entries'];
          if (!Array.isArray(entries)) return undefined;
          /*
           * `legs` is normalised where every other field is taken on trust, and the asymmetry is
           * deliberate. It is the one field whose *absence* changes what a screen may print — a row
           * with no count withholds its mean rather than drawing it bare (R13 clause one) — so an
           * older server's missing key and a newer one's number have to be told apart here rather
           * than at each renderer. `null` and a string both mean *no count*, which is the safe
           * reading: a board row's denominator may not be inferred.
           */
          const page = { ...record, entries: entries.map(withLegs) };
          return page as unknown as BoardPage;
        },
      ),
    challenges: () =>
      call({ method: 'GET', url: `${base}/api/challenges`, token: undefined, body: undefined }, (body) => {
        const record = body as Record<string, unknown> | null;
        // Whatever the server said, unrecomputed. Nothing here compares a window to a local clock:
        // `state`, `opensInMs` and `closesInMs` are the server's arithmetic and are rendered as
        // given, because a second answer to "which one is current" is the § D218 § 3 defect.
        return typeof record?.['currentId'] === 'string' && Array.isArray(record['recent'])
          ? (record as unknown as ChallengeIndex)
          : undefined;
      }),
    submitChallenge: (token, submission) =>
      call({ method: 'POST', url: `${base}/api/challenge-scores`, token, body: submission }, (body) => {
        const record = body as Record<string, unknown> | null;
        return typeof record?.['challengeId'] === 'string' && typeof record['dataHash'] === 'string'
          ? {
              challengeId: record['challengeId'],
              dataHash: record['dataHash'],
              entry: record['entry'] as ChallengeBoardRow,
            }
          : undefined;
      }),
    challengeBoard: (challengeId, metric) =>
      call(
        {
          method: 'GET',
          url:
            `${base}/api/challenge-board?challengeId=${encodeURIComponent(challengeId)}` +
            `&metric=${encodeURIComponent(metric)}`,
          token: undefined,
          body: undefined,
        },
        (body) => {
          const record = body as Record<string, unknown> | null;
          return Array.isArray(record?.['entries']) ? (record as unknown as ChallengeBoardPage) : undefined;
        },
      ),
  };
}
