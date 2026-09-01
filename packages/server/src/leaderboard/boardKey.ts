/**
 * **Which board a run goes on** — `ENGINE_CONTRACT.md` § 12.1, as a decision rather than a digest.
 *
 * ## The two jobs that were one value, and why separating them was the whole fix
 *
 * `submission.ts#configHashOf` used to answer both of these questions with one 32-character hex
 * string:
 *
 * 1. *Does this stored entry still describe the run it names?* — a **verification** question, whose
 *    honest answer digests every resolved input the result depended on, so that a `data/` change is
 *    visible rather than silent (§ D205, § D213, § D214 § 4).
 * 2. *Which leaderboard does this row sit on?* — a **board** question, whose honest answer is the
 *    contract's, and the contract is explicit that it is not the first one:
 *
 * > **No player-settable parameter may enter a board key.** A key of building × dispatcher ×
 * > traffic template × arrival rate × run length fragments into thousands of one-entry boards where
 * > everyone is permanently first. Arbitrary configurations post to a personal-record log instead.
 *
 * The digest was *exactly* that forbidden key, plus a window. Every axis in it is one a player
 * picks, so every distinct selection minted its own board and every player was first on their own.
 *
 * **The server's reasoning was sound and its conclusion was misapplied.** Digesting the fully
 * resolved inputs is right — for a verification hash. It is the wrong thing to key a board by. So
 * the value is split rather than deleted: {@link runDataHashOf} keeps job 1 **bit for bit**, and
 * this module answers job 2 from the contract's own three keys.
 *
 * ## How the verification property survives the split
 *
 * {@link runDataHashOf} digests the same canonical string `configHashOf` did, over the same fields,
 * in the same sorted order — and the two fields this wave added to `SubmittedRun` are spread with
 * `?? undefined` and dropped by `canonicalJson` when they are empty, exactly as `windowStartS` is.
 * So a run with no rules and no interventions digests to **the identical hex string it digested
 * before either field existed**, which `submission.test.ts` pins against a literal. A `data/` change
 * still moves the hash, an old row still carries the hash it was set on, and a row whose hash no
 * longer matches the server's own digest of today's `data/` is still tellable from one that does.
 * What changed is only what the value is *used for*: it identifies the data a row was measured
 * against, and it no longer decides who a player is ranked beside.
 *
 * ## The three keys, and the one that has no route yet
 *
 * {@link BOARD_KEYS} is the contract's table, transcribed with a fourth column the contract does not
 * have: **which route reaches this key**. Two of the three are reachable from a single-run
 * submission and this module returns them. The ladder's is not, and saying so in a table a test
 * reads is the difference between a declared gap and a dead union arm — this repository's
 * signature defect is a behaviour that is configured, validated and reached by nothing, and an
 * unreachable `'ladder'` branch of {@link BoardPlacement} would be exactly that with a contract
 * quotation over it.
 *
 * A ladder rating is *"a mean over the fixed 40 cases"* (§ 12.3). One `SubmittedRun` is one case, so
 * a ladder entry is not a submission this endpoint can receive at all: it needs a forty-case
 * submission route, a fold to a rating, and a board whose rows are dispatchers rather than players.
 * The rating itself already exists client-side in `packages/viz/src/gauntlet/rating.ts` and posts
 * nowhere — `gauntlet/ladder.ts#LADDER_WORLD_ABSENCE` is the labelled unavailable state § 12.2 asks
 * for in the meantime, and it stays correct until that route is built.
 */

import { digestOf, type ResolvedDataFacts, type SubmittedRun } from './submission.js';

/* -------------------------------------------------------------------------- *
 * The contract's table
 * -------------------------------------------------------------------------- */

/** One row of § 12.1's table, plus the route that reaches it — `null` where none does yet. */
export interface BoardKeyRow {
  /** The key, in the contract's own words. */
  readonly key: string;
  /** What the board is, in one sentence. */
  readonly board: string;
  /**
   * The non-test caller that produces a placement with this key, or `null` for a key the product
   * declares and cannot yet reach. The roadmap's standing requirement, applied to a table.
   */
  readonly route: string | null;
}

/**
 * § 12.1's three keys, transcribed.
 *
 * ```
 * daily board key  = date                      // one board a day, everybody on it
 * ladder key       = dispatcher id             // scored as a mean over the fixed 40 cases
 * personal log     = anything else
 * ```
 *
 * `boardKey.test.ts` asserts both directions: every row with a `route` is produced by
 * {@link placeSubmission} on some submission, and the row with no `route` is produced by none.
 */
export const BOARD_KEYS: readonly BoardKeyRow[] = Object.freeze([
  Object.freeze({
    key: 'date',
    board: 'the daily board — one board a day, everybody on it, on the fixture the server issues',
    route: 'placeSubmission, when the run is dailyFixtureAt(now)’s own axes at its own seed',
  }),
  Object.freeze({
    key: 'dispatcher id',
    board: 'the ladder — gauntlet ratings, a mean over the fixed 40 proof cases',
    route: null,
  }),
  Object.freeze({
    key: 'anything else',
    board: 'a personal-record log, one per player',
    route: 'placeSubmission, for every run that is not the day’s fixture',
  }),
]);

/* -------------------------------------------------------------------------- *
 * The day's fixture
 * -------------------------------------------------------------------------- */

/**
 * The axes the daily board fixes — everything about the run except the dispatcher and what the
 * player does with it.
 *
 * The omission is the design, and it is `challenge/schedule.ts#ChallengeConfig`'s argument one
 * period shorter: a board that also fixed the dispatcher would be a board on which every player ran
 * the identical simulation and the only remaining difference was who posted first. What is left
 * free is the dispatcher, the Everyday rules written onto it, and the intervention log — which is
 * to say, everything § 11 and § 7.6 let a player actually do.
 */
export interface DailyFixtureConfig {
  readonly buildingId: string;
  readonly demandTemplateId: string;
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
  readonly windowStartS: number | null;
}

/**
 * Chancery House, run as a whole authored day — § 2's fixture, in the ids this server ships.
 *
 * Four of the five fields are the contract's outright. The fifth is the pair
 * `durationS`/`windowStartS`, and it is `36 000` **with a window at 0** rather than `durationS`
 * alone, for a reason that is measured rather than stylistic: `office-day` is an authored phase
 * list, so `core` refuses `templateOverrides.durationS` on it by name (§ D275) and a submission of
 * `{ durationS: 36000, windowStartS: null }` throws inside the replay instead of running. The
 * viewer reaches the same pair through `shift/dayLength.ts#wholeDayRun`, which returns
 * `{ shiftLengthS: day.periodS, windowStartS: 0 }` for exactly this reason — so the fixture is a
 * run the product's own whole-day control produces, not a shape only this file knows how to write.
 *
 * **§ 2's own numbers are the prototype's and this is the shipped building.** The contract's fixture
 * is 14 floors, 3 shafts, 06:00–19:00 and a population of 1 180; `data/buildings/chancery-house.json`
 * is the tower this repository ships under that name and `office-day` is 08:00–18:00. Naming the
 * shipped ids rather than transcribing the prototype's geometry is the same choice `submission.ts`
 * makes about buildings generally — *ids rather than inline objects* — and it is what lets the
 * replay resolve against the server's own `data/` at all.
 */
export const DAILY_FIXTURE_CONFIG: DailyFixtureConfig = Object.freeze({
  buildingId: 'chancery-house',
  demandTemplateId: 'office-day',
  arrivalRatePctPop5min: null,
  durationS: 36_000,
  windowStartS: 0,
});

/** The day's fixture: what everybody on today's board ran, and the date that keys it. */
export interface DailyFixture {
  /** `YYYY-MM-DD`, UTC. The daily board's key, and the only thing in it. */
  readonly date: string;
  /** The day's crowd, as a decimal-digit string — {@link dailySeedFor}. */
  readonly seed: string;
  readonly config: DailyFixtureConfig;
}

/**
 * The date, UTC, as `YYYY-MM-DD`.
 *
 * UTC and not a local zone, because *which day is it* has to have one answer for every player on
 * one board — a board keyed by a date that depends on where the reader is standing is two boards
 * wearing one name. It is the server's clock for `challenge/schedule.ts`'s reason: `core` may not
 * read one (invariant 3) and a client's is not trustworthy in a competition.
 */
export function dailyDateOf(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * The day's crowd seed: the date's own digits.
 *
 * § 1 requires a seed per day — *"A replay of a past day | that day's seed"* — and § 12.1 requires
 * that everybody on one board *"met the identical crowd, or the sort is a ranking of luck"*. Both
 * are satisfied by any derivation that is fixed by the date and known to every client; this one is
 * chosen because it is the derivation a reader can perform in their head, and because it is already
 * this repository's seed convention (`seed 20260804`, `seed 20 260 726`).
 *
 * § 1's table prints `424242` for *today's crowd*. That is the **prototype's** constant, and it is
 * a constant — one crowd, forever — which is the one thing a per-date board key cannot use.
 */
export function dailySeedFor(date: string): string {
  return date.replaceAll('-', '');
}

/** The fixture for the day `nowMs` falls in. Issued by the server, never computed by a client. */
export function dailyFixtureAt(nowMs: number): DailyFixture {
  const date = dailyDateOf(nowMs);
  return Object.freeze({ date, seed: dailySeedFor(date), config: DAILY_FIXTURE_CONFIG });
}

/* -------------------------------------------------------------------------- *
 * The placement
 * -------------------------------------------------------------------------- */

/** Where a submission lands, and the key that says so. */
export type BoardPlacement =
  | {
      readonly kind: 'daily';
      /** `daily:YYYY-MM-DD`. The date and nothing else — § 12.1. */
      readonly key: string;
      readonly date: string;
    }
  | {
      readonly kind: 'personal';
      /** `personal:<user id>`. One log per player, whatever they ran. */
      readonly key: string;
      readonly userId: string;
    };

/**
 * Whether a run **is** the day's fixture — every axis the fixture names, plus its seed.
 *
 * The seed is in it, unlike a config board's identity, and the reversal is § 12.1's second
 * sentence: *"Rows within a board must have met the identical crowd, or the sort is a ranking of
 * luck."* On a board across seeds the seed is the competitive axis; on a board across dispatchers
 * it has to be pinned, or the sort measures who drew the kindest morning.
 *
 * `ruleRows` and `interventions` are deliberately **not** consulted. They are what a player brings
 * to the fixture — the dispatcher they wrote and the calls they made during the day — and a board
 * that put them in the key would fragment exactly as the old digest did, one board per rule list.
 */
export function isDailyFixtureRun(run: SubmittedRun, fixture: DailyFixture): boolean {
  return (
    run.seed === fixture.seed &&
    run.buildingId === fixture.config.buildingId &&
    run.demandTemplateId === fixture.config.demandTemplateId &&
    run.arrivalRatePctPop5min === fixture.config.arrivalRatePctPop5min &&
    run.durationS === fixture.config.durationS &&
    run.windowStartS === fixture.config.windowStartS
  );
}

/**
 * The board this submission belongs on.
 *
 * Two outcomes, and no third: a run that is the day's fixture goes on the day's board, and every
 * other run goes to the player's own log. That second clause is the contract's *"Arbitrary
 * configurations post to a personal-record log instead"*, and it is what stops a selection minting a
 * board — a player who invents a configuration nobody else will ever run now gets a row in their own
 * log rather than a leaderboard of one with themselves at the top of it.
 *
 * The dispatcher is in neither key. On the daily board that is the point: it is the axis being
 * compared. In the personal log it is unnecessary: the log is one player's, and
 * {@link runDataHashOf} already tells one configuration's rows from another's inside it.
 */
export function placeSubmission(
  run: SubmittedRun,
  userId: string,
  fixture: DailyFixture,
): BoardPlacement {
  if (isDailyFixtureRun(run, fixture)) {
    return Object.freeze({ kind: 'daily', key: `daily:${fixture.date}`, date: fixture.date });
  }
  return Object.freeze({ kind: 'personal', key: `personal:${userId}`, userId });
}

/* -------------------------------------------------------------------------- *
 * The verification hash — job 1, unchanged
 * -------------------------------------------------------------------------- */

/**
 * The facts a stored entry was measured against, as one digest.
 *
 * **This is `configHashOf`'s digest under a name that says what it is for.** The canonical string is
 * the same one, over the same fields, in the same sorted order, so an entry stored before the split
 * carries the same hex string an entry stored after it does. What is gone is the claim that it names
 * a board: a board is {@link placeSubmission}'s answer, and this is the answer to *what data was
 * this row measured against* — the question § D205 and § D213 are about, where a recorded case lost
 * its subject because a profile was added and nothing said so.
 *
 * `challenge/submission.ts#challengeDataHashOf` is the same value on the challenge side and has
 * carried the honest name since it was written; this is that name applied to the run route.
 *
 * ## What is spread and what is dropped, and why the distinction is load-bearing
 *
 * `canonicalJson` drops `undefined` entries. So `windowStartS ?? undefined` keeps a whole-period run
 * digesting to the string it digested before that field existed, and the two fields this wave added
 * do the same through {@link emptyToUndefined}: a run with no rules and no interventions produces
 * **the identical hex string** it produced before either could be submitted. `0` is a window and
 * `[]` is not a rule list, which is why the test is emptiness rather than falsiness.
 *
 * A run that *does* carry rules or a log digests differently, and that is correct — those inputs
 * moved the result, and a hash that ignored them would say two different runs were measured against
 * the same thing.
 */
export function runDataHashOf(run: SubmittedRun, facts: ResolvedDataFacts): string {
  return digestOf({
    buildingId: run.buildingId,
    dispatcherProfileId: run.dispatcherProfileId,
    demandTemplateId: run.demandTemplateId,
    arrivalRatePctPop5min: run.arrivalRatePctPop5min,
    durationS: run.durationS,
    windowStartS: run.windowStartS ?? undefined,
    ruleRows: emptyToUndefined(run.ruleRows),
    interventions: emptyToUndefined(run.interventions),
    buildingDigest: facts.buildingDigest,
    dispatcherDigest: facts.dispatcherDigest,
    templateDigest: facts.templateDigest,
    trafficModel: facts.trafficModel,
  });
}

/**
 * An absent or empty list as `undefined`, so `canonicalJson` drops the key entirely.
 *
 * The same move `windowStartS ?? undefined` makes and for the same stated reason: a field that adds
 * a key to the canonical string when the run did not use it would fork every hash that already
 * exists. `[]` and *absent* are the same run — `core` pins a run with no `interventions` key
 * byte-identical to one built before the field existed — so they must be the same string here.
 */
function emptyToUndefined<T>(list: readonly T[] | undefined): readonly T[] | undefined {
  return list === undefined || list.length === 0 ? undefined : list;
}
