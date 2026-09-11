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
 * `submission.ts`'s own vocabulary, bounded by the same gates — and the held time they saw.
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
 * `config/rushPurse.ts`, which says why a balance and that the reading is a proposal). The sitting
 * opens at what the account's listed top-up bought, checked against its spends by `http/api.ts`
 * before any of this runs.
 *
 * **What posts is the last round**: how long it held before the line was crossed. A last round
 * whose replay never crosses the line has no breaking point to post, which is § D515's rule for a
 * run stopped by hand, arriving from the replay's side — a replay has no hand stop, and a run that
 * held to its horizon did not break.
 *
 * ## What is not built, and where it would enter
 *
 * **No between-round rebuild travels, so nothing spends a purse.** `docs/38` § 2.3 rebuilds the
 * building between rounds from the price schedule, with the fit-out kit the career reaches the run
 * through (§ D427). The code that turns a kit into a building is `packages/viz/src/campaign/fitOut.ts`
 * over `packages/viz/src/commissioning/`, which this package may not import, and no module in `core`
 * or `experiments` applies a priced change's `covers` path to a building. A rebuild on this wire would
 * be a change the server could price and could not build — the entitlement without the change, which
 * is `core/src/sim/interventionWire.ts`'s refusal of the two bought kinds turned around. So every
 * round of a sitting runs the building as shipped, the purse is derived and published and bought
 * nothing, and a rebuild enters at {@link replayRushSitting}'s per-round configuration the day the
 * derivation of a fitted building reaches a package this one can read.
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
 * **{@link MAX_SITTING_ROUNDS} is twelve**: at the dearest measured round that is under nineteen
 * seconds of one core for a post, and the cooldown it charges is forty-five. And **two shipped towers
 * never break under the stream** — Vertical City and the Burj-class reference hold all thirty waves
 * and drain — so a sitting there has no breaking point to post, which is the refusal below rather
 * than a board row claiming a figure the run did not produce.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  parseRushPurse,
  playerWaveAt,
  rushHoldAtLegs,
  rushPurseOpeningUnits,
  rushPurseRounds,
  rushWavesOutlasted,
  runSimulation,
  violationsInRushPurse,
  type ChimeLedgerTable,
  type RuleRowConfig,
  type RushPurseTable,
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
 */
export async function loadRushPurse(dataDir: string, ledger: ChimeLedgerTable): Promise<RushPurseTable> {
  const table = parseRushPurse(JSON.parse(await readFile(join(dataDir, RUSH_PURSE_FILE), 'utf8')) as unknown);
  const violations = violationsInRushPurse(table, ledger);
  if (violations.length > 0) throw new Error(`rush purse: ${violations.join(' ')}`);
  return table;
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
   * How long the player saw the round hold, in simulated seconds from its start, or `null` when the
   * stage never reached the line. **A claim compared, never a figure stored** — `verify.ts`'s
   * `ClaimedMetrics` footing: it exists so a client on another build is told its round did not replay
   * rather than shown a number it never saw.
   */
  readonly claimedHeldS: number | null;
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

/** The keys a sitting may carry. Every other key is refused, by name. */
const SITTING_KEYS: readonly string[] = Object.freeze(['buildingId', 'rounds', 'modifiers']);
/** The keys a round may carry. */
const ROUND_KEYS: readonly string[] = Object.freeze(['dispatcherProfileId', 'ruleRows', 'interventions', 'claimedHeldS']);

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

function idIssue(value: unknown, where: string): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 64
    ? undefined
    : `${where} must be a non-empty id under 64 characters`;
}

/**
 * Everything structurally wrong with a posted sitting, or an empty array — the cheap gate, before a
 * simulation starts (`submission.ts#submissionIssues`'s job, for a sitting).
 *
 * **Strict**, where a single run's gate is not, and the strictness is the refusal the issue asks for:
 * a client-supplied purse or amount is refused by name here rather than silently dropped, so a client
 * that thinks it can name one is told it cannot. See {@link NEVER_ON_THE_WIRE}.
 *
 * **A modifier has to top up this purse.** The shape is `chimes/ledger.ts#claimedModifierIssues`'s;
 * what is added is that the sink is one `data/rush-purse.json` lists, because the only modifier a
 * sitting's replay can reach is units in its purse. A pre-fitted building is a modifier whose building
 * this server cannot build (the module docstring says why), and a claim of one would put a sitting on
 * a board that says *pre-fitted* for runs of the building as shipped.
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
      issues.push(...ruleRowIssues(round['ruleRows'] as SubmittedRushRound['ruleRows']).map((issue) => `${where}.${issue}`));
      issues.push(
        ...interventionIssues(round['interventions'] as SubmittedRushRound['interventions']).map((issue) => `${where}.${issue}`),
      );
    }
  }

  const modifiers = sitting['modifiers'];
  const shape = claimedModifierIssues(modifiers);
  issues.push(...shape);
  if (shape.length === 0 && Array.isArray(modifiers)) {
    for (const [index, claim] of (modifiers as readonly ClaimedModifier[]).entries()) {
      if (!purse.topUpSinkIds.includes(claim.sinkId)) {
        issues.push(
          `modifiers[${String(index)}] names "${claim.sinkId}", which does not top up the rush purse ` +
            `(${purse.topUpSinkIds.join(', ')}): the only modifier a sitting's replay can reach is units in ` +
            'its purse, and a modifier the replay cannot reach would put the sitting on a board for runs ' +
            'it does not describe',
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
export type RushSittingRejectionCode = RejectionCode | 'held-does-not-reproduce' | 'no-breaking-point';

/** One round as the server replayed it. Every figure here is the server's; none is the claim. */
export interface ReplayedRushRound {
  /** Seconds from the round's start to its hold moment, or `null` when its replay never crossed the line. */
  readonly heldS: number | null;
  /** The generated waves it outlasted — what its purse was paid on. */
  readonly wavesOutlasted: number;
  readonly purseBeforeUnits: number;
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
}

function refused(
  code: RushSittingRejectionCode,
  detail: string,
  round: number | undefined,
  simulations: number,
): RushSittingVerification {
  return { ok: false, code, detail, round, simulations };
}

/**
 * Replay a sitting and decide — the chain the owner's ruling names, in the order the refusals should
 * reach a player.
 *
 * 1. **Resolve every round before simulating any**, so an id this server does not ship is refused at
 *    no cost however far into the sitting it sits.
 * 2. **Simulate each round and compare its hold moment**, stopping at the first that does not
 *    reproduce: nothing after it can be verified, and simulating it would spend a replay on a refusal.
 * 3. **Require a breaking point on the last round**, which is what posts.
 * 4. **Derive every purse** from the waves each round outlasted, opening at the listed top-up.
 *
 * `sitting` must already have passed {@link rushSittingIssues}, and its modifiers `http/api.ts`'s
 * ledger check. Nothing here reads a key the gate refuses, so a purse smuggled onto the object reaches
 * no figure this returns.
 */
export function replayRushSitting(sitting: SubmittedRushSitting, from: RushSittingResources): RushSittingVerification {
  const configs: SimulationConfig[] = [];
  for (const [index, round] of sitting.rounds.entries()) {
    const config = rushRoundConfigFor(sitting.buildingId, round, from.resources);
    if (typeof config === 'string') {
      return refused(
        config,
        config === 'unknown-building'
          ? `This server does not ship a building "${sitting.buildingId}".`
          : config === 'unknown-dispatcher'
            ? `Round ${String(index + 1)} names a dispatcher this server does not ship.`
            : 'This server does not ship the rush stream, so no sitting can be replayed on it.',
        config === 'unknown-building' ? undefined : index + 1,
        0,
      );
    }
    configs.push(config);
  }

  const held: (number | null)[] = [];
  const waves: number[] = [];
  let simulations = 0;
  for (const [index, config] of configs.entries()) {
    const round = index + 1;
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
    held.push(heldS);
    waves.push(rushWavesOutlasted(holdAtS, record.startedAt));
  }

  const last = held[held.length - 1];
  if (last === null || last === undefined) {
    return refused(
      'no-breaking-point',
      'The last round of this sitting held to the end of the stream without crossing the line, so it has ' +
        'no breaking point to post — a rush posts how long it lasted, and this one did not break.',
      held.length,
      simulations,
    );
  }

  const purses = rushPurseRounds(from.purse, rushPurseOpeningUnits(from.purse, from.ledger, sitting.modifiers ?? []), waves);
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
