/// <reference types="node" />

/**
 * **A rush sitting, posted whole, and the server's replay of it** — GitHub issue **#372**, under the
 * owner's ruling of 2026-09-10, verbatim:
 *
 * > *"A round is a sitting, posted whole — reading (b) above. A sitting is consecutive runs from an
 * > as-shipped start. The posted result carries every round's intervention log, and the server
 * > replays the chain and derives each round's purse from the previous round's hold moment."*
 *
 * The decision this module carries is [§ D542](../../../../DECISIONS.md). `verify.ts` is the
 * single-run half of § D214 § 3 and this is the rush's: a submitted score is accepted only if
 * replaying it reproduces it, and the client is never trusted with a number.
 *
 * ## What a sitting is on the wire, and what it is not
 *
 * **A building id, the rounds in order, and the modifiers the account bought.** A round is the
 * dispatcher the player drove it with, the rules they wrote, the intervention log they pressed —
 * `submission.ts`'s own vocabulary, bounded by the same gates — what they rebuilt before it, as
 * price-schedule row ids (GitHub issue #372, § D1295), and the held time they saw.
 *
 * **Nothing else, and {@link rushSittingIssues} refuses the rest by name.** The seed, the stream,
 * the ninety minutes and the rate are not on the wire, because the rush is one seed and one climb for
 * everybody (§ D515) and `verify.ts#rushRoundConfigFor` derives all four from the building. And **no
 * purse and no amount is on the wire**: a purse, a paid figure, a wave count or a budget named by a
 * client is refused before a simulation starts, and if one is smuggled past the gate the replay reads
 * no field that could carry it (`rushSitting.test.ts` drives both).
 *
 * ## The chain
 *
 * Every round is re-simulated from its own configuration, the hold moment is read off the replay's
 * own legs with `@elevator-sim/core`'s `rushHoldAtLegs` — the reader the stage stops on — and the
 * held time the player claimed is compared to it within `verify.ts#METRIC_EPSILON`. A round that does
 * not reproduce is refused by number, which is the only honest thing to tell a player on an older
 * build: *round 2 did not replay*, rather than *your sitting is wrong*.
 *
 * Each round then pays its purse on the waves it outlasted, read at that hold moment
 * (`core`'s `rushWavesOutlasted`), into a balance the next round opens with (`core`'s
 * `config/rushPurse.ts`, which says why a balance and that the owner approved it). The sitting
 * opens at what the account's listed top-up bought, checked against its spends by `http/api.ts`
 * before any of this runs.
 *
 * **What posts is the last round**: how long it held before the line was crossed. A last round
 * whose replay never crosses the line has no breaking point to post, which is § D515's rule for a
 * run stopped by hand, arriving from the replay's side — a replay has no hand stop, and a run that
 * held to its horizon did not break.
 *
 * ## The rebuild between rounds, and what spends the purse — GitHub issue #372, [§ D1295](../../../../DECISIONS.md)
 *
 * `docs/38` § 2.3 rebuilds the building between rounds from the price schedule. **A round now
 * carries what was bought before it**, as `rebuild`: price-schedule row ids for tiers on `core`'s rush
 * menu (`config/rushRebuild.ts`, Doors, Control and Car size at every level and Tenants at the first).
 * The server prices them from its own copy of the schedule (`core`'s `config/priceSchedule.ts`, moved
 * out of the viewer for exactly this), takes them from the purse it derived from the rounds before,
 * and replays the round on the tower fitted with everything the sitting has bought so far: **a tier
 * bought between rounds stays fitted for the rest of the sitting** (the swarm's default on the
 * question § D701 left open, owner-reversible in `rushFitOf`'s one fold), and a new sitting starts as
 * built. The first round carries none, because a sitting is consecutive runs from an as-shipped start.
 *
 * What made it buildable is the shape § D606 § 2 named first, taken **for numbers only**: the price
 * reader and the copy-free half of the shop moved into `core`, and the shop's names and sentences did
 * not. Shafts and Machines stay off the menu because they need `packages/viz/src/commissioning/`, and
 * Tenants 2 and 3 because they change who arrives and a board ranks sittings that met one crowd;
 * {@link rushSittingIssues} refuses each by name. Nothing about the purse is ever on the wire: the
 * rebuild is a cause, its price is the server's, and an unaffordable one is refused by round number
 * (`rebuild-over-purse`) after the rounds before it have replayed and paid.
 *
 * **What also travels is one fixed start** — GitHub issue #372,
 * [§ D640](../../../../DECISIONS.md). `data/chime-ledger.json`'s `rush-prefit` had been refused by
 * name here for as long as *fitted* meant nothing; it means one kit of three plain fields now —
 * Doors L1, Control L1 and Tenants L1, held by `core`'s `config/rushPrefit.ts` — and a sitting that
 * claims it is replayed on the fitted tower from its first round. That needed **none** of § D606's
 * three shapes and moved no boundary: the kit names no shaft and no machine class, so
 * `commissioning/` is not wanted, and it carries no name, subtitle or effect sentence, so no product
 * copy goes into `core`. The general rebuild, which the section above describes, is now built in
 * the same shape, and the kit is three levels of its fold (`config/rushRebuild.ts#RUSH_PREFIT_LEVELS`).
 *
 * ## What a round costs to replay, measured before the refusal was lifted
 *
 * The owner's ruling put the order in so many words: *the replay cost per round is measured before
 * `leaderboard/verify.ts`'s refusal of `endless-rush` is lifted*. It was measured on this path —
 * {@link replayRushSitting}, the function `http/api.ts` calls — on the commit before the lift, with
 * `rushSitting.cost.test.ts`:
 *
 * ```
 * RUSH_SITTING_COST_OUT=/tmp/rush-sitting-cost.md \
 *   npx vitest run --project server packages/server/src/leaderboard/rushSitting.cost.test.ts
 * ```
 *
 * **Dated 2026-09-11, on an Apple M1 Max (10 cores) under a load average of 5.47 from five other
 * lanes' suites**, so the milliseconds are a claim about that machine and that afternoon. Median of
 * three timed replays of a one-round sitting under `collective`:
 *
 * | building | cars | simulations a round | ms a round | the replay |
 * |---|---|---|---|---|
 * | garden-apartments | 2 | 1 | 326 | held 1 178 s, outlasted 6 |
 * | st-jude-hospital | 5 | 1 | 471 | held 3 012 s, outlasted 16 |
 * | chancery-house | 6 | 1 | 681 | held 2 820 s, outlasted 15 |
 * | crown-hotel | 5 | 1 | 735 | held 2 096 s, outlasted 11 |
 * | vertical-city | 35 | 1 | 775 | **no breaking point** |
 * | mixed-use-high-rise | 16 | 1 | 781 | held 4 584 s, outlasted 25 |
 * | secure-tower | 6 | 1 | 787 | held 2 842 s, outlasted 15 |
 * | midtown-office | 4 | 1 | 933 | held 1 640 s, outlasted 9 |
 * | burj-class-reference | 57 | 1 | 1 541 | **no breaking point** |
 *
 * **And a round costs what a round costs**: on Garden Apartments a sitting of one, two and four
 * rounds took 348, 666 and 1 308 ms — 348, 333 and 327 ms a round, one simulation each. The chain
 * adds nothing per link, because a round's replay reads nothing from the one before it except its
 * purse, which is arithmetic.
 *
 * Three things follow and each is taken here. **The cooldown is charged per round** at the rush's
 * ninety simulated minutes, the unit `http/api.ts#cooldownForReplay` already charges a single run in.
 * **{@link MAX_SITTING_ROUNDS} is twelve**: at the dearest round in the table that is under nineteen
 * seconds of one core for a post, and the cooldown it charges is forty-five. (The table is `collective`;
 * PR #513's review measured a twelve-round Burj-class sitting under nearest-car at 21 537 ms, and the
 * next section is what that measurement changed.) And **two shipped towers do
 * not break under `collective`** — Vertical City and the Burj-class reference hold all thirty waves
 * under it and drain — so a sitting there under `collective` has no breaking point to post, which is
 * the refusal below rather than a board row claiming a figure the run did not produce. **They do break
 * under other dispatchers**, and this sentence first said they never did (PR #513's review, finding 4):
 * `data/rush-house-runs.json`, GitHub PR #514's table with its Burj-class rows re-measured by PR #512 on the corrected building, has the Burj-class
 * reference crossing the line at 5 170 s under `nearest-car` and 4 390 s under `destination-panel`, and Vertical City at 3 546 s under
 * `nearest-car` and 5 432 s under `destination-panel`; every other shipped dispatcher holds both to
 * the end. So a sitting on either tower can post, and `rushHoldAgreement.json` pins the two
 * `nearest-car` breaks on both ends.
 *
 * ## Where a replay runs, and what a full server answers — PR #513's review, finding 2
 *
 * **Not on the request thread.** Nineteen seconds of one core bounded *one post*, and was the wrong
 * frame for a server with one thread: the review posted that honest Burj-class sitting and every other
 * request — a sign-in, a board, `/api/wake` — waited the 21.5 s behind it, while the per-account
 * cooldown does nothing about two accounts posting at once. `http/replayOffThread.test.ts` measured the
 * same shape on this tree before the move: a `/api/wake` due 400 ms into a four-round Midtown Office
 * sitting answered **9 612 ms late**, after the sitting had settled. After it, the same test answered
 * **3 ms** after it was due, with the sitting settling 3 376 ms later on its thread.
 *
 * So a sitting is replayed on a worker thread (`rushReplayPool.ts`, `rushReplayWorker.ts`), and the
 * threads are **one limit for the whole process** — `ELEVATOR_SIM_RUSH_REPLAYS`, one unless an operator
 * sets it, because the container is given half a core and what two replays cost there is unmeasured. A
 * thread loads `data/` itself from the directory the server loaded and runs this module's own
 * {@link replayRushSitting}, so the answer is the same function over the same tables, and
 * `rushReplayPool.test.ts` holds the thread's answer equal to the request thread's.
 *
 * **When every slot is taken, the post is refused rather than queued**: `503 replay-busy`, with
 * `Retry-After` set to the rounds in flight at 1.8 s a round. `503` rather than `429`, because `429` is
 * already this API's word for *this account posted too soon* and a full pool says nothing about the
 * caller; no queue, because a queued post holds a socket open behind replays of unknown length. The
 * slot is taken before the cooldown is charged, so the refusal costs the player nothing, and it is
 * given back on every way out of the route.
 *
 * **Why a worker rather than the next-best bound.** A global single-flight queue would have bounded
 * the CPU and left the thread blocked, which is the finding. Nothing about the deployment ruled a worker
 * out: the image runs `node packages/server/dist/main.js` on Node 26 (`Dockerfile`), the worker's entry
 * is a `.js` beside this file in `dist/`, and `experiments`' replication pool already starts threads
 * the same way. Under the test runner the entry is `.ts`, and `rushReplayWorker.ts` says how it resolves
 * its imports there.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  RUSH_NO_LEVELS,
  RUSH_PREFIT_LEVELS,
  RUSH_PREFIT_SINK_ID,
  RUSH_REBUILD_TIERS,
  claimsRushPrefit,
  parsePriceSchedule,
  parseRushPurse,
  playerWaveAt,
  priceOf,
  rushFitOf,
  rushHoldAtLegs,
  rushLevelsAfter,
  rushPurseOpeningUnits,
  rushPurseRounds,
  rushRebuildTierOf,
  rushRebuildUnits,
  rushTierChangesNothing,
  rushWavesOutlasted,
  runSimulation,
  violationsInRushPrefit,
  violationsInRushPurse,
  type BuildingConfig,
  type ChimeLedgerTable,
  type ElevatorSpecs,
  type PriceSchedule,
  type RuleRowConfig,
  type RushFit,
  type RushFitLevels,
  type RushPurseTable,
  type RushRebuildRefusal,
  type SimulationConfig,
} from '@elevator-sim/core';

import { claimedModifierIssues, type ClaimedModifier } from '../chimes/ledger.js';
import { interventionIssues, ruleRowIssues, type SubmittedIntervention } from './submission.js';
import { METRIC_EPSILON, rushRoundConfigFor, type RejectionCode, type VerificationResources } from './verify.js';

/* -------------------------------------------------------------------------- *
 * The purse, at boot
 * -------------------------------------------------------------------------- */

/** What `data/` calls the purse. Private: {@link loadRushPurse} is the only thing that needs it. */
const RUSH_PURSE_FILE = 'rush-purse.json';

/**
 * Read `<dataDir>/rush-purse.json` and check it against the ledger the server also loaded.
 *
 * **Throws**, on `chimes/ledger.ts#loadChimeLedger`'s ground: a server whose purse will not parse, or
 * names a top-up the ledger does not sell, would refuse every sitting at the moment a player posted
 * one, and boot is where that is a configuration mistake with an obvious fix.
 *
 * **The pre-fit is checked here too, and for the same reason at the other end** — GitHub issue #372,
 * [§ D640](../../../../DECISIONS.md). `core`'s `claimsRushPrefit` recognises a claim **by sink id**,
 * because `packages/viz` has to ask the same question and deliberately never holds a parsed ledger;
 * so what holds the ledger to that id has to run somewhere, and boot is where a renamed or re-kinded
 * sink is a configuration mistake rather than a sitting quietly replayed on the tower as shipped.
 * {@link violationsInRushPrefit} also refuses a **second** `prefit` sink, which would be a fitted
 * building nothing defines — § D606 § 2's hole, re-opened.
 */
export async function loadRushPurse(dataDir: string, ledger: ChimeLedgerTable): Promise<RushPurseTable> {
  const table = parseRushPurse(JSON.parse(await readFile(join(dataDir, RUSH_PURSE_FILE), 'utf8')) as unknown);
  const violations = [...violationsInRushPurse(table, ledger), ...violationsInRushPrefit(ledger)];
  if (violations.length > 0) throw new Error(`rush purse: ${violations.join(' ')}`);
  return table;
}

/** What `data/` calls the price schedule. */
const PRICE_SCHEDULE_FILE = 'price-schedule.json';

/**
 * Read `<dataDir>/price-schedule.json` and check that it prices every tier the rush menu sells —
 * GitHub issue #372, [§ D1295](../../../../DECISIONS.md).
 *
 * **Throws**, on {@link loadRushPurse}'s ground: a replay that met a menu tier the schedule does not
 * price would fail at the moment a player posted the sitting that bought it, and boot is where a
 * missing row is a configuration mistake with an obvious fix. The schedule's own rules are
 * `parsePriceSchedule`'s, which collects every violation before it refuses.
 */
export async function loadRushPriceSchedule(dataDir: string): Promise<PriceSchedule> {
  const schedule = parsePriceSchedule(JSON.parse(await readFile(join(dataDir, PRICE_SCHEDULE_FILE), 'utf8')) as unknown);
  const unpriced = RUSH_REBUILD_TIERS.filter((tier) => !schedule.changes.some((change) => change.id === tier.priceId));
  if (unpriced.length > 0) {
    throw new Error(
      `price schedule: the rush menu sells ${unpriced.map((tier) => tier.priceId).join(', ')}, which ` +
        `${PRICE_SCHEDULE_FILE} does not price, so a sitting that bought one could not be replayed.`,
    );
  }
  /* Priced and also flat: `rushRebuildUnits` sums one purchase a tier, and a rated row has no flat price. */
  for (const tier of RUSH_REBUILD_TIERS) priceOf(schedule, tier.priceId);
  return schedule;
}

/* -------------------------------------------------------------------------- *
 * The wire
 * -------------------------------------------------------------------------- */

/** One round of a sitting as the wire carries it. */
export interface SubmittedRushRound {
  /** The shipped dispatcher the round started under, by id — never a profile. */
  readonly dispatcherProfileId: string;
  /** The player's rules over that dispatcher, in first-match order (`submission.ts#SubmittedRun.ruleRows`). */
  readonly ruleRows?: readonly RuleRowConfig[] | undefined;
  /** The round's intervention log, in press order, on `submission.ts`'s allow-list. */
  readonly interventions?: readonly SubmittedIntervention[] | undefined;
  /**
   * What the player bought **before** this round, as `data/price-schedule.json` row ids of tiers on
   * `core`'s rush menu — GitHub issue #372, [§ D1295](../../../../DECISIONS.md). Absent, or empty, on
   * a round nothing was bought for, and always absent on the first. A cause and never an amount: the
   * server prices each row itself and takes the sum from the purse it derived.
   */
  readonly rebuild?: readonly string[] | undefined;
  /**
   * How long the player saw the round hold, in simulated seconds from its start, or `null` when the
   * stage never reached the line. **A claim compared, never a figure stored** — `verify.ts`'s
   * `ClaimedMetrics` footing: it exists so a client on another build is told its round did not replay
   * rather than shown a number it never saw.
   */
  readonly claimedHeldS: number | null;
  /**
   * Where the player ended the round by hand, simulated seconds from its start, or absent when it was
   * not — [§ D1516](../../../../DECISIONS.md). **A cause, read and never compared**: the replay runs past
   * it and cannot see it, and the round is paid only for the waves it got through before it (`core`'s
   * `rushWavesOutlasted`). A stop can only lower a round's pay, so a client gains nothing by sending one.
   */
  readonly stoppedS?: number | undefined;
}

/** A sitting as the wire carries it. */
export interface SubmittedRushSitting {
  /** The tower every round of the sitting ran on. */
  readonly buildingId: string;
  /** Consecutive rounds from the as-shipped start, in order. */
  readonly rounds: readonly SubmittedRushRound[];
  /** What the account bought for this sitting — the modifier, never the spend (§ D526 clause 3). */
  readonly modifiers?: readonly ClaimedModifier[] | undefined;
}

/**
 * The most rounds one sitting may carry.
 *
 * Every round is one ninety-minute simulation, measured at 326–1 541 ms a round on the shipped
 * buildings (the module docstring's table), so twelve bounds one post at under nineteen seconds of one
 * core on the dearest tower. The cooldown `http/api.ts` charges is per round as well, so the bound is
 * about what a single request may command rather than about the rate. Recorded here under
 * [§ D405](../../../../DECISIONS.md) — it is local to this module and refuses by name.
 */
const MAX_SITTING_ROUNDS = 12;

/**
 * **The largest request body `POST /api/rush-sittings` reads** — PR #513's review, finding 3, and the
 * one route `http/serve.ts#bodyCapFor` does not give `MAX_BODY_BYTES`.
 *
 * **Sized from the gate, not chosen.** Every sitting {@link rushSittingIssues} accepts has to reach the
 * gate, and at 64 KiB a legal one did not: the review measured twelve rounds of twenty switches with
 * four rule rows each at about 110 KiB, answered `400 bad-request` by the transport. Worse, the gate had
 * no maximum to size a cap from — a `$comment` on a rule row, a switch id of any length and a key
 * nothing reads on an intervention or a modifier all passed it. So the gate was given one first (every
 * key below a round is refused unless something reads it, and a switch's id is bounded like every other
 * id), and the largest sitting it now accepts — built in `http/bodyCap.test.ts` from the gate's own
 * bounds, each probed from both sides: twelve rounds, sixteen rule rows, sixty-four switches of sixteen
 * rows, sixteen modifiers, 64-character ids and the longest number JSON writes — serialises to about
 * 1.3 MB. This is the round figure above it, and that test holds the cap to less than a quarter above
 * that body, so it cannot drift into padding or fall below a legal sitting unnoticed.
 *
 * **Why a cap sized to the gate rather than a gate cut to the cap.** The other way to make them agree
 * was to refuse sittings a player can play — a total of rule rows per round, say — and nothing about a
 * round supplies that figure: the per-round bounds are `submission.ts`'s, set for one run on their own
 * ground, and a sitting is up to twelve of those runs. What a body read before authentication owes is to
 * be bounded, which is the whole of `MAX_BODY_BYTES`'s own argument, and this one is. Recorded here under
 * [§ D405](../../../../DECISIONS.md), with § D542 naming it.
 */
export const MAX_RUSH_SITTING_BODY_BYTES = 1.5 * 1024 * 1024;

/** The keys a sitting may carry. Every other key is refused, by name. */
const SITTING_KEYS: readonly string[] = Object.freeze(['buildingId', 'rounds', 'modifiers']);
/** The keys a round may carry. */
const ROUND_KEYS: readonly string[] = Object.freeze(['dispatcherProfileId', 'ruleRows', 'interventions', 'rebuild', 'claimedHeldS', 'stoppedS']);
/**
 * The keys below a round, each refused by name when something else is sent — the strictness that gives
 * the gate a maximum ({@link MAX_RUSH_SITTING_BODY_BYTES}). `submission.ts`'s gates check what a row and
 * an entry *say* and leave what else they carry alone, which is right for a single run's lenient gate
 * and is the reason this one adds the rest rather than changing those.
 */
const RULE_ROW_KEYS: readonly string[] = Object.freeze(['when', 'whenValue', 'then', 'thenValue']);
const INTERVENTION_KEYS: readonly string[] = Object.freeze(['atS', 'change']);
const SWITCH_KEYS: readonly string[] = Object.freeze(['kind', 'toProfileId', 'ruleRows']);
const BARE_CHANGE_KEYS: readonly string[] = Object.freeze(['kind']);
const MODIFIER_KEYS: readonly string[] = Object.freeze(['sinkId', 'steps']);

/**
 * Why a key a client might think to send is refused — the two things a sitting may never carry, each
 * with its own ground, so a refusal names the right one.
 */
const PURSE_REFUSAL =
  'and the server derives every purse from its own replay of the rounds — a purse, a paid figure, a ' +
  'wave count or a budget named by a client is refused rather than believed';
const IDENTITY_REFUSAL =
  'which a round may not choose: a rush is one seed, one stream and one length for everybody, and the ' +
  'server derives all of them from the building';
const NEVER_ON_THE_WIRE: Readonly<Record<string, string>> = Object.freeze({
  purse: PURSE_REFUSAL,
  purseUnits: PURSE_REFUSAL,
  paidUnits: PURSE_REFUSAL,
  purseBeforeUnits: PURSE_REFUSAL,
  purseAfterUnits: PURSE_REFUSAL,
  // What a rebuild cost is the server's to price, from its own schedule — GitHub issue #372, § D1295.
  spentUnits: PURSE_REFUSAL,
  wavesOutlasted: PURSE_REFUSAL,
  budgetUnits: PURSE_REFUSAL,
  units: PURSE_REFUSAL,
  seed: IDENTITY_REFUSAL,
  demandTemplateId: IDENTITY_REFUSAL,
  arrivalRatePctPop5min: IDENTITY_REFUSAL,
  durationS: IDENTITY_REFUSAL,
  windowStartS: IDENTITY_REFUSAL,
});

function keyIssues(entry: Record<string, unknown>, allowed: readonly string[], where: string): string[] {
  return Object.keys(entry)
    .filter((key) => !allowed.includes(key))
    .map((key) => `${where} carries "${key}", ${NEVER_ON_THE_WIRE[key] ?? 'which nothing on a sitting reads'}`);
}

/** The object entries of `value` with their indices, when it is an array — the rest is the shape gates' to report. */
function objectsIn(value: unknown): readonly (readonly [number, Record<string, unknown>])[] {
  if (!Array.isArray(value)) return [];
  const out: (readonly [number, Record<string, unknown>])[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) out.push([index, entry as Record<string, unknown>]);
  }
  return out;
}

/** Keys nothing reads, below a round: on rule rows, on an intervention, on its change and on a switch's rows. */
function nestedKeyIssues(round: Record<string, unknown>, where: string): string[] {
  const rows = (value: unknown, at: string): string[] =>
    objectsIn(value).flatMap(([index, row]) => keyIssues(row, RULE_ROW_KEYS, `${at}[${String(index)}]`));
  const issues = rows(round['ruleRows'], `${where}.ruleRows`);
  for (const [index, entry] of objectsIn(round['interventions'])) {
    const at = `${where}.interventions[${String(index)}]`;
    issues.push(...keyIssues(entry, INTERVENTION_KEYS, at));
    const change = entry['change'];
    if (typeof change !== 'object' || change === null || Array.isArray(change)) continue;
    const fields = change as Record<string, unknown>;
    // Both handover kinds carry the same id and rows (§ D1048), so both are held to the same keys.
    const isSwitch = fields['kind'] === 'switch-dispatcher' || fields['kind'] === 'adopt-dispatcher';
    issues.push(...keyIssues(fields, isSwitch ? SWITCH_KEYS : BARE_CHANGE_KEYS, `${at}.change`));
    if (!isSwitch) continue;
    // A missing or empty id is `submission.ts#interventionIssues`' refusal already; the length is this gate's.
    const target = fields['toProfileId'];
    if (typeof target === 'string' && target.length > 64) {
      issues.push(`${at}.change.toProfileId must be a non-empty id under 64 characters`);
    }
    issues.push(...rows(fields['ruleRows'], `${at}.change.ruleRows`));
  }
  return issues;
}

function idIssue(value: unknown, where: string): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 64
    ? undefined
    : `${where} must be a non-empty id under 64 characters`;
}

/**
 * The sentence for one tier a rebuild cannot buy — `core`'s `rushLevelsAfter` decides, this words it.
 *
 * Each names the round and the row, because a client on another build that sent one has to be able
 * to find it; the two off-menu reasons are told apart because they are different facts — one is what
 * this server's replay cannot build, the other is what a board that ranks one crowd will not rank.
 */
function rebuildRefusalOf(refusal: RushRebuildRefusal, where: string): string {
  switch (refusal.kind) {
    case 'unknown':
      return (
        `${where} names "${refusal.priceId}", which is not a tier the rush rebuild sells ` +
        `(${RUSH_REBUILD_TIERS.map((tier) => tier.priceId).join(', ')})`
      );
    case 'off-menu':
      return refusal.tier.reason === 'commissioning'
        ? `${where} names "${refusal.priceId}", ${refusal.tier.categoryId} level ${String(refusal.tier.level)}, which a ` +
            'rush cannot rebuild: it needs the commissioning this server replays without, so it is left off the rush menu'
        : `${where} names "${refusal.priceId}", ${refusal.tier.categoryId} level ${String(refusal.tier.level)}, which a ` +
            'rush does not sell: it changes who arrives, and a rush board ranks sittings that met the same crowd';
    case 'already-fitted':
      return (
        `${where} buys "${refusal.priceId}", and this sitting already has that category at level ` +
        `${String(refusal.fittedLevel)}, so it would take units and change nothing`
      );
    case 'same-category-twice':
      return `${where} buys two ${refusal.categoryId} tiers at once; only the higher would be fitted, so the other would be paid for nothing`;
  }
}

/**
 * Every way a sitting's rebuilds cannot be bought, before a simulation starts — GitHub issue #372,
 * [§ D1295](../../../../DECISIONS.md).
 *
 * Walked in round order from the levels the sitting starts at — the pre-fit kit's when the modifiers
 * claim one, nothing otherwise — because whether a tier changes anything depends on what the rounds
 * before it bought. **Affordability is not asked here**: the purse a rebuild spends is paid by the
 * rounds before it, and that is a replay's figure, so {@link replayRushSitting} refuses an
 * unaffordable one after those rounds have played.
 */
function rebuildIssues(rounds: unknown, modifiers: unknown): readonly string[] {
  if (!Array.isArray(rounds) || rounds.length > MAX_SITTING_ROUNDS) return [];
  const claims = objectsIn(modifiers).map(([, claim]) => claim as { readonly sinkId: string; readonly steps: number });
  let levels: RushFitLevels = claimsRushPrefit(claims) ? RUSH_PREFIT_LEVELS : RUSH_NO_LEVELS;
  const issues: string[] = [];
  for (const [index, round] of objectsIn(rounds)) {
    const rebuild = round['rebuild'];
    if (rebuild === undefined) continue;
    const where = `rounds[${String(index)}].rebuild`;
    if (!Array.isArray(rebuild) || rebuild.some((id) => idIssue(id, where) !== undefined)) {
      issues.push(`${where} must be a list of price-schedule row ids, each a non-empty id under 64 characters`);
      continue;
    }
    if (rebuild.length > RUSH_REBUILD_TIERS.length) {
      issues.push(`${where} names ${String(rebuild.length)} tiers, and the rush menu has ${String(RUSH_REBUILD_TIERS.length)}`);
      continue;
    }
    if (index === 0 && rebuild.length > 0) {
      issues.push(`${where} buys something before the first round, and a sitting's first round is the building as shipped: a rebuild is bought between rounds`);
      continue;
    }
    const after = rushLevelsAfter(levels, rebuild as readonly string[]);
    if (!after.ok) {
      issues.push(...after.refusals.map((refusal) => rebuildRefusalOf(refusal, where)));
      continue;
    }
    levels = after.levels;
  }
  return issues;
}

/**
 * Everything structurally wrong with a posted sitting, or an empty array — the cheap gate, before a
 * simulation starts (`submission.ts#submissionIssues`'s job, for a sitting).
 *
 * **Strict**, where a single run's gate is not, and the strictness is the refusal the issue asks for:
 * a client-supplied purse or amount is refused by name here rather than silently dropped, so a client
 * that thinks it can name one is told it cannot. See {@link NEVER_ON_THE_WIRE}.
 *
 * **A modifier has to be one this sitting's replay can reach.** The shape is
 * `chimes/ledger.ts#claimedModifierIssues`'s; what is added is that the sink is one of two kinds —
 * a purse top-up `data/rush-purse.json` lists, or the pre-fit `core`'s `config/rushPrefit.ts` holds
 * the kit for. Anything else is a claim the replay cannot honour, and a sitting carrying one would
 * land on a board keyed as *bought* for a run of the building as shipped.
 *
 * **The pre-fit arm is new** — GitHub issue #372, [§ D640](../../../../DECISIONS.md). This read
 * *"the only modifier a sitting's replay can reach is units in its purse"*, and named a pre-fitted
 * building as *"a modifier whose building this server cannot build"*. That was true while *fitted*
 * meant nothing: `data/chime-ledger.json` sold the sink, § D606 § 2 recorded that the kit was
 * authored nowhere, and a claim the replay could not build had to be refused rather than guessed at.
 * It is authored now, as one fixed kit, and {@link replayRushSitting} fits every round with it.
 * **By id rather than by kind**, and that is `claimsRushPrefit`'s own argument: the id is what both
 * ends can ask, and {@link loadRushPurse} holds the ledger to it at boot — so a sink renamed out
 * from under this line is a server that will not start, not a gate that quietly narrows.
 */
export function rushSittingIssues(body: unknown, purse: RushPurseTable): readonly string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return ['a sitting must be an object'];
  const sitting = body as Record<string, unknown>;
  const issues: string[] = keyIssues(sitting, SITTING_KEYS, 'the sitting');

  const building = idIssue(sitting['buildingId'], 'buildingId');
  if (building !== undefined) issues.push(building);

  const rounds = sitting['rounds'];
  if (!Array.isArray(rounds)) {
    issues.push('rounds must be an array');
  } else if (rounds.length === 0) {
    issues.push('a sitting needs at least one round');
  } else if (rounds.length > MAX_SITTING_ROUNDS) {
    issues.push(`a sitting may carry at most ${String(MAX_SITTING_ROUNDS)} rounds, and this one carries ${String(rounds.length)}`);
  } else {
    for (const [index, raw] of rounds.entries()) {
      const where = `rounds[${String(index)}]`;
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        issues.push(`${where} must be an object`);
        continue;
      }
      const round = raw as Record<string, unknown>;
      issues.push(...keyIssues(round, ROUND_KEYS, where));
      const dispatcher = idIssue(round['dispatcherProfileId'], `${where}.dispatcherProfileId`);
      if (dispatcher !== undefined) issues.push(dispatcher);
      const held = round['claimedHeldS'];
      if (held !== null && !(typeof held === 'number' && Number.isFinite(held) && held >= 0)) {
        issues.push(`${where}.claimedHeldS must be the seconds the round held, or null when it never reached the line`);
      }
      const stopped = round['stoppedS'];
      if (stopped !== undefined && !(typeof stopped === 'number' && Number.isFinite(stopped) && stopped >= 0)) {
        issues.push(`${where}.stoppedS must be the seconds into the round it was ended by hand, or absent`);
      }
      issues.push(...ruleRowIssues(round['ruleRows'] as SubmittedRushRound['ruleRows']).map((issue) => `${where}.${issue}`));
      issues.push(
        ...interventionIssues(round['interventions'] as SubmittedRushRound['interventions']).map((issue) => `${where}.${issue}`),
      );
      issues.push(...nestedKeyIssues(round, where));
    }
  }

  const modifiers = sitting['modifiers'];
  issues.push(...rebuildIssues(rounds, modifiers));
  const shape = claimedModifierIssues(modifiers);
  issues.push(...shape);
  for (const [index, claim] of objectsIn(modifiers)) issues.push(...keyIssues(claim, MODIFIER_KEYS, `modifiers[${String(index)}]`));
  if (shape.length === 0 && Array.isArray(modifiers)) {
    for (const [index, claim] of (modifiers as readonly ClaimedModifier[]).entries()) {
      if (!purse.topUpSinkIds.includes(claim.sinkId) && claim.sinkId !== RUSH_PREFIT_SINK_ID) {
        issues.push(
          `modifiers[${String(index)}] names "${claim.sinkId}", which this sitting's replay cannot reach ` +
            `(${[...purse.topUpSinkIds, RUSH_PREFIT_SINK_ID].join(', ')}): a sitting may open with units in ` +
            'its purse or with the building fitted, and a modifier the replay cannot reach would put the ' +
            'sitting on a board for runs it does not describe',
        );
      }
    }
  }
  return Object.freeze(issues);
}

/* -------------------------------------------------------------------------- *
 * The replay
 * -------------------------------------------------------------------------- */

/** Why a sitting was refused, as something the caller can branch on. */
export type RushSittingRejectionCode =
  | RejectionCode
  | 'held-does-not-reproduce'
  | 'no-breaking-point'
  /** A round's rebuild is one the menu does not sell or that changes nothing — the gate's refusal, re-asked here. */
  | 'rebuild-refused'
  /** A round's rebuild costs more than the purse the rounds before it left — GitHub issue #372, § D1295. */
  | 'rebuild-over-purse';

/** One round as the server replayed it. Every figure here is the server's; none is the claim. */
export interface ReplayedRushRound {
  /** Seconds from the round's start to its hold moment, or `null` when its replay never crossed the line. */
  readonly heldS: number | null;
  /** The generated waves it outlasted — what its purse was paid on. */
  readonly wavesOutlasted: number;
  readonly purseBeforeUnits: number;
  /** What its rebuild took before it played, priced by this server from its own schedule. `0` when none. */
  readonly spentUnits: number;
  readonly paidUnits: number;
  readonly purseAfterUnits: number;
}

export type RushSittingVerification =
  | {
      readonly ok: true;
      readonly rounds: readonly ReplayedRushRound[];
      /** How long the last round held — the figure a sitting posts. */
      readonly heldS: number;
      /** The wave the last round's line was crossed in, one-based — the result's *furthest wave*. */
      readonly furthestWave: number;
      /** Simulations this verification ran: one a round. */
      readonly simulations: number;
    }
  | {
      readonly ok: false;
      readonly code: RushSittingRejectionCode;
      readonly detail: string;
      /** The round the refusal is about, one-based, or `undefined` when it is about the sitting. */
      readonly round: number | undefined;
      readonly simulations: number;
    };

/** What {@link replayRushSitting} reads from the server's own `data/`. */
export interface RushSittingResources {
  readonly resources: VerificationResources;
  readonly purse: RushPurseTable;
  readonly ledger: ChimeLedgerTable;
  /** `data/price-schedule.json`, which prices a rebuild — {@link loadRushPriceSchedule}. */
  readonly schedule: PriceSchedule;
}

function refused(
  code: RushSittingRejectionCode,
  detail: string,
  round: number | undefined,
  simulations: number,
): RushSittingVerification {
  return { ok: false, code, detail, round, simulations };
}

/** The first tier of `bought` that would change nothing over the levels before it, or `undefined`. */
function inertTierIn(
  base: BuildingConfig,
  before: RushFitLevels,
  bought: readonly string[],
  specs: ElevatorSpecs,
): string | undefined {
  let levels: RushFitLevels = before;
  for (const priceId of bought) {
    const tier = rushRebuildTierOf(priceId);
    if (tier === undefined) return undefined;
    if (rushTierChangesNothing(base, levels, tier, specs)) return priceId;
    levels = { ...levels, [tier.categoryId]: tier.level };
  }
  return undefined;
}

/**
 * Replay a sitting and decide — the chain the owner's ruling names, in the order the refusals should
 * reach a player.
 *
 * 0. **Read the sitting's modifiers once**, before any round resolves. A pre-fit is a fact about the
 *    *sitting*, so it is read here rather than per round, and it is where the fold starts.
 * 1. **Fold every round's fit and price every rebuild before simulating any** — GitHub issue #372,
 *    [§ D1295](../../../../DECISIONS.md). A round runs on everything the sitting has fitted by then:
 *    the kit, and every tier bought before it, which stays fitted for the rest of the sitting. A
 *    rebuild the menu refuses is refused here at no cost, as is an id this server does not ship.
 * 2. **Simulate each round and compare its hold moment**, stopping at the first that does not
 *    reproduce: nothing after it can be verified, and simulating it would spend a replay on a
 *    refusal. **Before** a round simulates, its rebuild is checked against the purse the rounds
 *    before it left, which is only known once they have replayed.
 * 3. **Require a breaking point on the last round**, which is what posts.
 * 4. **Derive every purse** from the waves each round outlasted and what each rebuild spent, opening
 *    at the listed top-up — `core`'s `rushPurseRounds`, the one derivation the viewer also reads.
 *
 * `sitting` must already have passed {@link rushSittingIssues}, and its modifiers `http/api.ts`'s
 * ledger check. Nothing here reads a key the gate refuses, so a purse smuggled onto the object reaches
 * no figure this returns.
 */
export function replayRushSitting(sitting: SubmittedRushSitting, from: RushSittingResources): RushSittingVerification {
  /* Once, for the whole sitting — see the numbered list above, step 0. */
  let levels: RushFitLevels = claimsRushPrefit(sitting.modifiers) ? RUSH_PREFIT_LEVELS : RUSH_NO_LEVELS;
  const configs: SimulationConfig[] = [];
  const spends: number[] = [];
  const asShipped = from.resources.buildingsById.get(sitting.buildingId);
  for (const [index, round] of sitting.rounds.entries()) {
    const bought = round.rebuild ?? [];
    if (bought.length > 0) {
      const after = index === 0 ? undefined : rushLevelsAfter(levels, bought);
      /*
       * A tier that would build the tower and the profile this sitting already has is refused rather
       * than charged — `core`'s `rushTierChangesNothing`, which the viewer's menu asks too. Asked tier
       * by tier over the levels so far, so a rebuild's second tier is judged on what its first fitted.
       */
      const inert =
        after?.ok === true && asShipped !== undefined && from.resources.elevatorSpecs !== undefined
          ? inertTierIn(asShipped.config, levels, bought, from.resources.elevatorSpecs)
          : undefined;
      if (inert !== undefined) {
        return refused(
          'rebuild-refused',
          `Round ${String(index + 1)} buys "${inert}", which would build the tower this sitting already has, so ` +
            'it would take units and change nothing. Nothing was ranked.',
          index + 1,
          0,
        );
      }
      if (after === undefined || !after.ok) {
        return refused(
          'rebuild-refused',
          index === 0
            ? 'Round 1 says something was bought before it, and a sitting starts from the building as shipped: ' +
                'a rebuild is bought between rounds.'
            : `Round ${String(index + 1)} buys something this server's rush menu does not sell, or something ` +
                'the sitting already had, so it cannot be replayed as posted.',
          index + 1,
          0,
        );
      }
      levels = after.levels;
    }
    const fit: RushFit = rushFitOf(levels);
    spends.push(bought.length === 0 ? 0 : rushRebuildUnits(from.schedule, bought));
    const config = rushRoundConfigFor(sitting.buildingId, round, from.resources, fit);
    if (typeof config === 'string') {
      return refused(
        config,
        config === 'unknown-building'
          ? `This server does not ship a building "${sitting.buildingId}".`
          : config === 'unknown-dispatcher'
            ? `Round ${String(index + 1)} names a dispatcher this server does not ship.`
            : config === 'cannot-fit'
              ? 'This sitting fits the building, by starting fitted or by rebuilding it between rounds, and this ' +
                'server cannot fit one: it was given no elevator specification to resolve the fit against. ' +
                'Nothing was ranked, and replaying the sitting on the building as shipped would compare it ' +
                'against a held time a different building produced.'
              : 'This server does not ship the rush stream, so no sitting can be replayed on it.',
        config === 'unknown-building' ? undefined : index + 1,
        0,
      );
    }
    configs.push(config);
  }

  const opening = rushPurseOpeningUnits(from.purse, from.ledger, sitting.modifiers ?? []);
  const held: (number | null)[] = [];
  /* Whether each round was ended by hand before its line — § D1516. */
  const stops: boolean[] = [];
  const waves: number[] = [];
  let simulations = 0;
  for (const [index, config] of configs.entries()) {
    const round = index + 1;
    /*
     * The purse this round's rebuild spends from is what the rounds before it left, and that is only
     * known now — so the check is here, before the round costs a simulation, rather than in the gate.
     */
    const spent = spends[index] ?? 0;
    if (spent > 0) {
      const before = rushPurseRounds(from.purse, opening, waves, spends.slice(0, waves.length)).at(-1)?.purseAfterUnits ?? opening;
      if (spent > before) {
        return refused(
          'rebuild-over-purse',
          `Round ${String(round)} was rebuilt for ${String(spent)} units, and on this server's replay the rounds ` +
            `before it left a purse of ${String(before)}. Nothing was ranked. That happens when the client is on ` +
            'a different build or the reference data has changed since the sitting was played.',
          round,
          simulations,
        );
      }
    }
    let record;
    try {
      ({ record } = runSimulation(config));
    } catch (error) {
      return refused(
        'simulation-failed',
        error instanceof Error ? error.message : `round ${String(round)}'s replay did not complete`,
        round,
        simulations + 1,
      );
    }
    simulations += 1;
    const holdAtS = rushHoldAtLegs(record.passengers, record.startedAt, record.endedAt);
    const heldS = holdAtS === undefined ? null : holdAtS - record.startedAt;
    const claim = sitting.rounds[index]?.claimedHeldS ?? null;
    const agrees = heldS === null || claim === null ? heldS === claim : Math.abs(heldS - claim) <= METRIC_EPSILON;
    if (!agrees) {
      return refused(
        'held-does-not-reproduce',
        `Replaying round ${String(round)} on this server did not reproduce the held time it was posted ` +
          'with. That happens when the client is on a different build or the reference data has changed ' +
          'since the round was played.',
        round,
        simulations,
      );
    }
    const stoppedS = sitting.rounds[index]?.stoppedS;
    held.push(heldS);
    stops.push(stoppedS !== undefined && (heldS === null || stoppedS < heldS));
    waves.push(rushWavesOutlasted(holdAtS, record.startedAt, stoppedS === undefined ? undefined : record.startedAt + stoppedS));
  }

  const last = held[held.length - 1];
  /* A last round ended by hand before its line has no breaking point either: § D515's rule, § D1516. */
  if (last === null || last === undefined || stops[stops.length - 1] === true) {
    return refused(
      'no-breaking-point',
      last === null || last === undefined
        ? 'The last round of this sitting held to the end of the stream without crossing the line, so it has ' +
            'no breaking point to post — a rush posts how long it lasted, and this one did not break.'
        : 'The last round of this sitting was ended by hand before it crossed the line, so it has no breaking ' +
            'point to post. Play a round out to the line and the whole sitting goes up with it.',
      held.length,
      simulations,
    );
  }

  const purses = rushPurseRounds(from.purse, opening, waves, spends);
  return {
    ok: true,
    rounds: Object.freeze(
      held.map((heldS, index) => {
        const purse = purses[index];
        if (purse === undefined) throw new Error('a purse is derived for every replayed round');
        return Object.freeze({ heldS, wavesOutlasted: waves[index] ?? 0, ...purse });
      }),
    ),
    heldS: last,
    furthestWave: playerWaveAt(last),
    simulations,
  };
}
