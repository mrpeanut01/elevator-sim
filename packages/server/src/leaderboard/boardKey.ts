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
 *
 * ## The fourth axis, and why it is not the forbidden key coming back — GitHub issue #371
 *
 * [§ D526](../../../../DECISIONS.md) clause 3 and `docs/38` § 2.3: *a run played with a bought
 * modifier carries the modifier on its board row, keyed by modifier set*, and *the standard board
 * is the standard purse and the building as shipped, the same for everyone*. So the daily key is
 * the date **and the modifier set**, which reads at first like the digest this module exists to
 * have removed. Three things separate them, and each is asserted rather than argued:
 *
 * 1. **The space is enumerable and small, not combinatorial.** The forbidden key was building ×
 *    dispatcher × template × rate × length — five continuous or open axes whose product is
 *    unbounded, so every selection minted a board. A modifier set is a subset of
 *    `data/chime-ledger.json`'s sinks, each capped at its own `maxSteps`; the shipped table has
 *    three sinks at 3, 3 and 1 step, so the whole space is 4 × 4 × 2 = 32 keys a day and
 *    `boardKey.test.ts` computes that bound from the table rather than asserting the number.
 * 2. **Nothing a player *selects* enters it.** A modifier reaches a submission only by having been
 *    bought — `http/api.ts` refuses a claim `chimes/ledger.ts#unbackedModifiers` cannot back
 *    before anything simulates — so the axis is a fact about what the account paid for rather than
 *    a control on a screen. That is the exact distinction § 12.1's sentence draws.
 * 3. **A rare set shows no ladder rather than a leaderboard of one.** § D506's twenty-player floor
 *    is inherited by construction: a different key is a different population in
 *    `store.ts#axisObservations`, and `distribution.ts#MIN_LADDER_N` withholds. The floor is read
 *    from that one module and is not restated here — a second copy of twenty is how the two come
 *    to disagree.
 *
 * **The standard set is the empty set and produces no suffix at all**, so `daily:2026-09-01` is
 * still `daily:2026-09-01`: every row a database already holds stays on the board it was posted to,
 * and no migration backfills a key. {@link runDataHashOf} takes the same treatment — a run with no
 * modifiers digests to the identical hex string it digested before the field existed.
 *
 * **What the key never carries is the spend.** § D526 clause 3 forbids a currency figure in a
 * comparison between players, and a board key is the most durable such comparison there is. The
 * key names the sink and the steps; `chime-ledger.json`'s `priceChimes` is on the server and
 * reaches neither the key, the row, nor the wire.
 *
 * **On a single run, the modifier still reaches no replay, and that is a seam rather than an
 * omission.** `SubmittedRun` is what `verify.ts` re-simulates, and neither `purse-units` nor `prefit`
 * has a field on it. So a modified single run replays to the same figures a standard one would and is
 * separated **on the board** rather than in the simulation. **GitHub issue #372 gave a purse a replay
 * to reach and not a run**: a posted rush sitting's `rush-purse-top-up` opens the purse
 * `leaderboard/rushSitting.ts` derives, and the sitting's rows and board key carry the set — but no
 * between-round rebuild travels yet, so nothing spends that purse and the legs are unchanged by it.
 * `rush-prefit` is refused on a sitting, because its fitted building is one this server cannot build.
 * Until a rebuild travels the separation stays the honest one: the account paid for something, and
 * the board says which runs were played by accounts that did.
 */

import type { ClaimedModifier } from '../chimes/ledger.js';

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
 * daily board key  = date × modifier set       // one board a day per set; standard is the default
 * ladder key       = dispatcher id             // scored as a mean over the fixed 40 cases
 * personal log     = anything else
 * ```
 *
 * The first line is § 12.1's `date` **as amended by § D526 clause 3**; the next two are the
 * contract's unchanged. **A fourth row is not the contract's**: the rush board GitHub issue #372 built,
 * keyed `building × date × modifier set` and argued where it is declared ([§ D543](../../../../DECISIONS.md)).
 *
 * `boardKey.test.ts` asserts both directions: every row with a `route` is produced by
 * {@link placeSubmission} on some submission, and the row with no `route` is produced by none.
 */
export const BOARD_KEYS: readonly BoardKeyRow[] = Object.freeze([
  Object.freeze({
    /*
     * **§ 12.1 says `date`; § D526 clause 3 says `date × modifier set`, and this row is the second
     * one.** The transcription is amended rather than left standing beside a key that no longer
     * matches it — a table describing a key the code does not produce is § D227's stale refusal in
     * a data structure, and `boardKey.test.ts` reads this string. The standard set appends nothing,
     * so the amendment is invisible to every run that carries no modifier, which is what makes it an
     * axis on the daily key rather than a fourth key.
     */
    key: 'date × modifier set',
    board:
      'the daily board — one board a day for each modifier set, everybody with that set on it, on ' +
      'the fixture the server issues; the standard set is the board everyone starts on',
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
  Object.freeze({
    /*
     * **Not one of § 12.1's three, and said so here rather than slipped in** — GitHub issue #372,
     * [§ D543](../../../../DECISIONS.md). The contract predates a postable rush; the owner's ruling of
     * 2026-09-10 made one, and a posted sitting needs a board a client can label. The building is in
     * it because § 12.1's own last sentence requires it — *rows within a board must have met the
     * identical crowd* — and a rush is the same number of people on every tower, arriving at a
     * different tower's floors. It is the one player-chosen axis in any key, and it is admitted on
     * this module's own test for the modifier set: the space is the shipped buildings, enumerable and
     * small, not a combinatorial product. The date resets it (§ D509) and the set separates bought
     * starts (§ D526 clause 3). The dispatcher, the rules and the log are what a player brings, as on
     * the daily board, and are in no key.
     */
    key: 'building × date × modifier set',
    board:
      'the rush board — how long a posted sitting held, one board a day for each tower and modifier set, ' +
      'everybody who sat that tower with that set on it',
    route: 'rushPlacementOf, for a sitting the server replayed round by round',
  }),
]);

/* -------------------------------------------------------------------------- *
 * The modifier set — one derivation, three consumers
 * -------------------------------------------------------------------------- */

/**
 * A modifier set in the one form anything here may compare: summed by sink, sorted, nothing empty.
 *
 * The *set*, not the list of purchases that produced it. Two claims of one sink at one step and one
 * claim of it at two are the same run configuration, and `chimes/ledger.ts#unbackedModifiers`
 * already decides the account's entitlement that way in as many words — *"a budget bought in two
 * steps and a budget bought in one are the same budget"*. A key that told them apart would put two
 * players who played identically on two boards, which is the fragmentation this module exists to
 * refuse, arriving through the shape of a list instead of through an axis.
 */
export type ModifierSet = readonly ClaimedModifier[];

/** The standard set: the standard purse and the building as shipped, the same for everyone. */
export const STANDARD_MODIFIER_SET: ModifierSet = Object.freeze([]);

/**
 * The canonical form of a claim list — the **one derivation** {@link modifierSetKeyOf},
 * {@link placeSubmission} and {@link runDataHashOf} all read.
 *
 * Sums by sink, drops anything at or below zero steps, sorts by sink id. Three consumers with three
 * sorts is how a board key and a data hash come to disagree about whether two runs are the same
 * run, so there is one function and the test drives all three through it.
 *
 * A claim above a sink's `maxSteps` never arrives here: `http/api.ts` refuses it against the ledger
 * before the placement is computed. This function is deliberately not a second enforcement of that
 * bound — a cap checked in two places is a cap that can be raised in one.
 */
export function canonicalModifierSet(claimed: ModifierSet | undefined): ModifierSet {
  if (claimed === undefined || claimed.length === 0) return STANDARD_MODIFIER_SET;
  const steps = new Map<string, number>();
  for (const claim of claimed) {
    steps.set(claim.sinkId, (steps.get(claim.sinkId) ?? 0) + claim.steps);
  }
  return Object.freeze(
    [...steps.entries()]
      .filter(([, total]) => total > 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sinkId, total]) => Object.freeze({ sinkId, steps: total })),
  );
}

/**
 * The modifier set as the string a board key carries — `''` for the standard set.
 *
 * `sinkId=steps`, joined with `+`, in the canonical order. The empty string for the standard set is
 * load-bearing rather than a convenience: {@link placeSubmission} appends nothing for it, so the
 * standard board's key is the date alone, byte-identical to the key every row already in a
 * database was written under.
 */
export function modifierSetKeyOf(claimed: ModifierSet | undefined): string {
  return canonicalModifierSet(claimed)
    .map((entry) => `${entry.sinkId}=${String(entry.steps)}`)
    .join('+');
}

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
      /**
       * `daily:YYYY-MM-DD` on the standard board, `daily:YYYY-MM-DD/<set>` on a modifier set's —
       * § 12.1's date, and § D526 clause 3's axis. The standard set appends nothing.
       */
      readonly key: string;
      readonly date: string;
      /** The set this board is, canonical. Empty on the standard board. */
      readonly modifiers: ModifierSet;
    }
  | {
      readonly kind: 'personal';
      /** `personal:<user id>`. One log per player, whatever they ran. */
      readonly key: string;
      readonly userId: string;
      /** The set this run was played with, canonical. Empty on a standard run. */
      readonly modifiers: ModifierSet;
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
 *
 * ## The modifier set enters one of the two keys, and the asymmetry is the decision
 *
 * **The daily key takes it** (§ D526 clause 3): a board is a comparison between players, and a
 * player who bought a wider purse is not playing the same game as one who did not. **The personal
 * key does not**, and adding it there would be the fragmentation defect with the polarity
 * reversed — a personal log is *one player's own record*, and splitting it by what they had bought
 * that week would give one player several logs and a record in none of them. The separation the log
 * needs is between rows rather than between logs, and it has it: {@link runDataHashOf} carries the
 * set, so a purse run and a standard run of one configuration at one seed are two rows.
 *
 * Since the standard set appends nothing, every existing daily key is unchanged and the two-outcome
 * shape above is unchanged: a modified run that is the day's fixture goes on that day's board *for
 * its set*, and everything else is still the player's own log.
 */
export function placeSubmission(
  run: SubmittedRun,
  userId: string,
  fixture: DailyFixture,
  claimedModifiers: ModifierSet | undefined = undefined,
): BoardPlacement {
  const modifiers = canonicalModifierSet(claimedModifiers);
  if (isDailyFixtureRun(run, fixture)) {
    const setKey = modifierSetKeyOf(modifiers);
    return Object.freeze({
      kind: 'daily',
      key: setKey === '' ? `daily:${fixture.date}` : `daily:${fixture.date}/${setKey}`,
      date: fixture.date,
      modifiers,
    });
  }
  return Object.freeze({ kind: 'personal', key: `personal:${userId}`, userId, modifiers });
}

/** Where a posted rush sitting lands — GitHub issue #372, [§ D543](../../../../DECISIONS.md). */
export interface RushPlacement {
  readonly kind: 'rush';
  /** `rush:<building>:YYYY-MM-DD`, with `/<set>` on a modifier set's board. */
  readonly key: string;
  readonly date: string;
  readonly buildingId: string;
  /** The set this board is, canonical. Empty on the standard board. */
  readonly modifiers: ModifierSet;
}

/**
 * The board a posted rush sitting belongs on: **the tower, the day, and the modifier set** — the fourth
 * row of {@link BOARD_KEYS}, whose comment carries the argument.
 *
 * Decided against **this server's** clock, for {@link placeSubmission}'s reason: a client cannot choose
 * which day's board it lands on. The set goes through {@link canonicalModifierSet} and
 * {@link modifierSetKeyOf}, so a rush board's suffix is spelled exactly as a daily board's is and the
 * standard set appends nothing. The claim reaching here has already been checked against the account's
 * spends by `http/api.ts`, so a set nobody paid for reaches no key.
 */
export function rushPlacementOf(
  buildingId: string,
  nowMs: number,
  claimedModifiers: ModifierSet | undefined,
): RushPlacement {
  const modifiers = canonicalModifierSet(claimedModifiers);
  const date = dailyDateOf(nowMs);
  const setKey = modifierSetKeyOf(modifiers);
  const board = `rush:${buildingId}:${date}`;
  return Object.freeze({ kind: 'rush', key: setKey === '' ? board : `${board}/${setKey}`, date, buildingId, modifiers });
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
 * digesting to the string it digested before that field existed, and the three list fields do the
 * same through {@link emptyToUndefined}: a run with no rules, no interventions and no modifiers
 * produces **the identical hex string** it produced before any of them could be submitted. `0` is a
 * window and `[]` is not a rule list, which is why the test is emptiness rather than falsiness.
 *
 * A run that *does* carry rules, a log or a modifier set digests differently, and that is correct —
 * those inputs moved the result, and a hash that ignored them would say two different runs were
 * measured against the same thing.
 */
export function runDataHashOf(
  run: SubmittedRun,
  facts: ResolvedDataFacts,
  /**
   * The set this run was played with — GitHub issue #371. Canonicalised here, so a caller that
   * passes the raw claim list and one that passes a canonical set produce the same digest.
   *
   * It belongs in this value for the reason the docstring above gives about `ruleRows` and
   * `interventions`: a modifier is an input the result depends on, and a hash that ignored it would
   * say two runs measured against different things were measured against the same thing. The
   * *board* key answers a different question and takes it for a different reason.
   */
  claimedModifiers: ModifierSet | undefined = undefined,
): string {
  return digestOf({
    modifiers: emptyToUndefined(canonicalModifierSet(claimedModifiers)),
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
