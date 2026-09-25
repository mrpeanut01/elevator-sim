/**
 * **The fix-it judge: the letter's morning is the gate, and fifty mornings decide** —
 * [§ D1020](../../../../DECISIONS.md), GitHub issue **#602**.
 *
 * ## What was wrong with one pair
 *
 * `classifyOutcome` judges one pair: the case seed, one run as the building stands and one with the
 * player's order, against § 9's two bars. Under common random numbers an unchanged building
 * compares identical, so the pair is not a lottery in the obvious sense. The defect is subtler and
 * worse: **the case seeds sit where almost any perturbation clears the complaint**. On the shipped
 * seeds a 3 cm/s speed placebo cleared three of eighteen cases, free zone-centre parking six, and a
 * three-metre roof raise cleared a clinic's appointment-letter complaint. And measured on fifty
 * mornings, several of the case's own diagnosed repairs remove nothing off the letter's morning —
 * they were taught from one crowd.
 *
 * ## The ruling, and where each clause lives
 *
 * 1. **The gate** is the existing single pair on the letter's morning with today's bars — 80 % of
 *    the complaint gone and the rest of the building down by no more than 2 points. A press that
 *    misses it is classified exactly as before and costs exactly one pair.
 * 2. **Replication** runs only when the gate clears: the same order on {@link FIXIT_MORNINGS} − 1
 *    further mornings, each paired with the building as it stands on that morning's crowd — common
 *    random numbers, so an unchanged building still compares identical.
 * 3. **The mornings are derived, never authored** — {@link replicationSeedsOf}: the case seed plus
 *    `i × 7919`, i = 1 … 49. No field of `data/fixit-cases.json` can name one, so no author can pick
 *    mornings the answer happens to clear, and `judge.test.ts` holds that both ways.
 * 4. **Fixed** requires all three: the gate; a two-sided 95 % paired-t interval on the per-morning
 *    complaint reduction whose lower bound is above zero (`CLAUDE.md`'s own rule, and the same
 *    arithmetic `experiments` publishes with); and the rest of the building **not shown worse than
 *    the 2-point floor** — the upper bound of the same interval on the rest's per-morning change is
 *    at or above −2.
 * 5. **k = 50 in total**, the gate's morning and forty-nine more. It is not a tuning choice: it is
 *    `CLAUDE.md`'s *"Budget 50–200 replications per configuration. Ten is not enough"*, and a fixed
 *    verdict is a better-than-as-built claim. Two decision agents argued for eight and ten; the
 *    repository's rule settled it, and § D1020 records the dissent.
 * 6. **A clear that does not hold** is `cleared-once`: no badge, no chimes, nothing banked, and a
 *    screen that says it cleared on this morning only.
 *
 * **Replication can only take a clear away, never grant one.** The letter's morning is what the
 * stage plays, the three rows print and the letter is written about; a verdict reading *fixed* over
 * a gate pair that did not clear would be two verdicts on one screen, which is the shape
 * `fixedBadgeAfter`'s docstring was written against. And there is no 80 % bar pooled over the
 * fifty: that bar was authored against the letter's morning's magnitude, and asking it of every
 * morning refuses repairs whose effect is real on every one (§ D1020 names the dissent that wanted
 * it).
 *
 * ## The cost, and where it is paid
 *
 * The forty-nine as-built mornings do not depend on the order, so a surface asks for them **once,
 * when the case opens** ({@link FixitJudge.prepare}), off the painting thread while the as-built day
 * plays. The forty-nine after-runs are asked **only on a press whose gate cleared**. The letter's
 * morning is drawn at once, in the {@link checkingOutcomeOf} state, and the verdict replaces it when
 * the mornings land. What the wait measured on the built bundle is recorded in § D1020 rather than
 * here, because it is a reading of one machine on one day.
 */

import type { SimulationConfig } from '@elevator-sim/core/browser';
import { pairedDifferenceEstimate } from '@elevator-sim/experiments/browser';

import type { VizRecording } from '../contract/types.js';
import {
  DEMAND_BASIS_LINE,
  REST_DROP_LIMIT_POINTS,
  type FixitOutcome,
  type FixitRow,
} from './engine.js';
import type { FixitRunPlan, MorningReading } from './run.js';
import type { ComplaintMeasure, FixitCase } from './types.js';

/** The gate's morning and forty-nine more — `CLAUDE.md`'s floor of fifty replications. */
export const FIXIT_MORNINGS = 50;

/**
 * The stride between derived mornings. A prime, so no two cases' mornings fall into step with each
 * other's case seeds, and the one three decision agents measured with — so the census in § D1020
 * and the shipped judge are the same mornings.
 */
export const MORNING_SEED_STEP = 7919n;

/** The two-sided confidence the interval is taken at — the repository's rule, never a dial. */
export const JUDGE_CONFIDENCE = 0.95;

/**
 * The forty-nine further mornings, derived from the case seed and nothing else.
 *
 * In code rather than in `data/`, beside the bars they serve, so that no author can pick mornings —
 * a case file that could name its replication seeds could name the ones its answer clears on.
 */
export function replicationSeedsOf(entry: Pick<FixitCase, 'run'>): readonly bigint[] {
  const seed = BigInt(entry.run.seed);
  return Array.from({ length: FIXIT_MORNINGS - 1 }, (_, index) => seed + BigInt(index + 1) * MORNING_SEED_STEP);
}

/** One config per derived morning — the same config with the morning's seed, and nothing else changed. */
export function morningConfigsOf(config: SimulationConfig, seeds: readonly bigint[]): SimulationConfig[] {
  return seeds.map((seed) => ({ ...config, seed }));
}

/* -------------------------------------------------------------------------- *
 * The verdict over fifty mornings
 * -------------------------------------------------------------------------- */

/** A paired interval, as the verdict states it. */
export interface PairedInterval {
  /** Mornings the interval is over. */
  readonly n: number;
  readonly mean: number;
  readonly lower: number;
  readonly upper: number;
}

export interface FixitReplication {
  /** Mornings run, the letter's included — always {@link FIXIT_MORNINGS}. */
  readonly mornings: number;
  /** Complaint totals over the mornings the complaint interval is taken over. */
  readonly complaintBeforeTotal: number;
  readonly complaintAfterTotal: number;
  /** Before minus after, per morning. Positive is better. */
  readonly reduction: PairedInterval;
  /** After minus before in points, per morning. Negative is worse. `null` when nobody else rode on two mornings. */
  readonly rest: PairedInterval | null;
  /** The reduction's lower bound is above zero. */
  readonly complaintHolds: boolean;
  /** The rest is not shown worse than the 2-point floor. */
  readonly restHolds: boolean;
  readonly holds: boolean;
}

function intervalOf(values: readonly number[]): PairedInterval {
  const zeros = values.map(() => 0);
  const estimate = pairedDifferenceEstimate(values, zeros, { confidence: JUDGE_CONFIDENCE });
  return { n: estimate.n, mean: estimate.mean, lower: estimate.lower, upper: estimate.upper };
}

/**
 * Judge the fifty mornings. `before[i]` and `after[i]` are one morning's pair, the letter's first.
 *
 * A morning whose complaint cannot be read on either side — a `mean-wait` scope that boarded nobody
 * — is left out of the complaint interval rather than read as zero, and the interval's `n` says how
 * many were kept. A morning on which nobody outside the scope rode is left out of the rest's interval
 * the same way. Fewer than two usable mornings is no interval at all, and no interval is not a hold.
 */
export function judgeReplication(
  before: readonly MorningReading[],
  after: readonly MorningReading[],
): FixitReplication {
  if (before.length !== after.length) {
    throw new Error(
      `fixit judge: ${String(before.length)} as-built mornings against ${String(after.length)} after-runs. A paired interval needs one pair a morning.`,
    );
  }
  const reductions: number[] = [];
  let beforeTotal = 0;
  let afterTotal = 0;
  const restChanges: number[] = [];
  for (const [index, b] of before.entries()) {
    const a = after[index]!;
    if (b.complaint !== null && a.complaint !== null) {
      reductions.push(b.complaint - a.complaint);
      beforeTotal += b.complaint;
      afterTotal += a.complaint;
    }
    if (b.restAwayPct !== null && a.restAwayPct !== null) restChanges.push(a.restAwayPct - b.restAwayPct);
  }
  const reduction =
    reductions.length >= 2 ? intervalOf(reductions) : { n: reductions.length, mean: Number.NaN, lower: Number.NaN, upper: Number.NaN };
  const rest = restChanges.length >= 2 ? intervalOf(restChanges) : null;
  const complaintHolds = Number.isFinite(reduction.lower) && reduction.lower > 0;
  const restHolds = rest === null || !(rest.upper < -REST_DROP_LIMIT_POINTS);
  return {
    mornings: before.length,
    complaintBeforeTotal: beforeTotal,
    complaintAfterTotal: afterTotal,
    reduction,
    rest,
    complaintHolds,
    restHolds,
    holds: complaintHolds && restHolds,
  };
}

/* -------------------------------------------------------------------------- *
 * The words
 * -------------------------------------------------------------------------- */

/**
 * The basis line under a verdict the fifty mornings decided — § D1020's true second form of
 * `BASIS_LINE`, whose *"one run before, one run after"* stops being the whole of what was run the
 * moment the gate clears.
 */
export const REPLICATED_BASIS_LINE =
  'one run before and one after on the letter’s morning, then the same order on forty-nine more mornings, each run beside the building as it stands on the same crowd — fifty pairs in all, and fixed only where the drop holds across them.';

/** The same, for an order that changes who arrives, so no morning's two runs share a crowd. */
export const REPLICATED_DEMAND_BASIS_LINE =
  'one run before and one after on the letter’s morning, then the same order on forty-nine more mornings, each run beside the building as it stands — and the change moves who arrives, so each morning’s second run meets a different crowd from its first. Fifty pairs in all, and fixed only where the drop holds across them.';

export const JUDGE_COPY = Object.freeze({
  checkingHead: 'It cleared on the letter’s morning. Now checking it on forty-nine more.',
  checkingBody:
    'One morning can be luck. The same order is running on forty-nine more mornings, each beside the building as it stands, and nothing is called fixed until all fifty are in.',
  clearedOnceHead: 'It cleared on the letter’s morning, and it did not hold on the others.',
  clearedOnceClosing:
    'It cleared on this morning only, which one lucky crowd can do: it is not fixed, and nothing is banked.',
  replicationLabel: 'The same order on fifty mornings',
});

function basisAfterReplication(gate: FixitOutcome): string {
  return gate.basis === DEMAND_BASIS_LINE ? REPLICATED_DEMAND_BASIS_LINE : REPLICATED_BASIS_LINE;
}

function signed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return (0).toFixed(digits);
  return `${value < 0 ? '−' : '+'}${text}`;
}

function unitOf(measure: ComplaintMeasure): string {
  return measure.kind === 'long-waits' ? 'waits' : 's';
}

/** *"fell by 2.3 waits a morning over 50 mornings (95 % interval +1.6 to +3.0)"*, and its refusal. */
function reductionClause(measure: ComplaintMeasure, replication: FixitReplication): string {
  const { reduction } = replication;
  if (!Number.isFinite(reduction.mean)) {
    return `the complaint could be read on only ${String(reduction.n)} of ${String(replication.mornings)} mornings, which is no interval at all`;
  }
  const digits = 1;
  const direction = reduction.mean >= 0 ? 'fell by' : 'rose by';
  const span = `95 % interval ${signed(reduction.lower, digits)} to ${signed(reduction.upper, digits)}`;
  const tail = replication.complaintHolds ? 'which is not no change' : 'which cannot be told from no change';
  return `the complaint ${direction} ${Math.abs(reduction.mean).toFixed(digits)} ${unitOf(measure)} a morning over ${String(reduction.n)} mornings (${span}), ${tail}`;
}

function restClause(replication: FixitReplication): string {
  const { rest } = replication;
  if (rest === null) return 'nobody else rode on enough mornings to protect a share';
  const span = `${signed(rest.lower, 1)} to ${signed(rest.upper, 1)}`;
  const tail = replication.restHolds
    ? `not shown worse than the ${String(REST_DROP_LIMIT_POINTS)}-point floor`
    : `worse than the ${String(REST_DROP_LIMIT_POINTS)}-point floor across them`;
  return `the rest of the building moved ${signed(rest.mean, 1)} points a morning over ${String(rest.n)} mornings (${span}), ${tail}`;
}

function complaintTotalText(measure: ComplaintMeasure, total: number, n: number): string {
  return measure.kind === 'long-waits'
    ? `${String(total)} waits over ${String(n)} mornings`
    : `${(n === 0 ? 0 : total / n).toFixed(1)} s a morning over ${String(n)} mornings`;
}

/** The fourth row — the fifty mornings, summed and judged. */
export function replicationRowOf(entry: FixitCase, replication: FixitReplication): FixitRow {
  const measure = entry.complaint.measure;
  return {
    label: `${JUDGE_COPY.replicationLabel} — ${measure.label}`,
    before: complaintTotalText(measure, replication.complaintBeforeTotal, replication.reduction.n),
    after: complaintTotalText(measure, replication.complaintAfterTotal, replication.reduction.n),
    verdict: `${reductionClause(measure, replication)}; ${restClause(replication)}`,
    passed: replication.holds,
  };
}

/**
 * What a surface draws the moment the letter's morning clears and the other mornings are still
 * running. The gate's three rows are true of the pair they print, so they stay; the head and body
 * say nothing is decided. `fixedBadgeAfter` reads `kind`, so no badge.
 */
export function checkingOutcomeOf(gate: FixitOutcome): FixitOutcome {
  if (gate.kind !== 'fixed') return gate;
  /*
   * Spread from the gate, so any field the classification carries beside the five below — whose
   * run the narration is about, say — travels with it rather than being dropped by this wrapper.
   */
  return {
    ...gate,
    kind: 'checking',
    head: JUDGE_COPY.checkingHead,
    body: JUDGE_COPY.checkingBody,
    rows: gate.rows,
    basis: gate.basis,
  };
}

/**
 * The verdict once the mornings are in.
 *
 * A gate that did not clear is returned unchanged — replication never ran. A gate that cleared and
 * held keeps its own head and body (the letter's morning's narration, whatever decides it) with the
 * fourth row and the replicated basis beside it. One that did not hold is `cleared-once`.
 */
export function judgedOutcomeOf(entry: FixitCase, gate: FixitOutcome, replication: FixitReplication): FixitOutcome {
  if (gate.kind !== 'fixed') return gate;
  const [complaintRow, restRow, spentRow] = gate.rows;
  const rows = [complaintRow, restRow, spentRow, replicationRowOf(entry, replication)] as const;
  const basis = basisAfterReplication(gate);
  if (replication.holds) return { ...gate, rows, basis };
  const measure = entry.complaint.measure;
  const why = replication.complaintHolds
    ? `Over fifty mornings ${restClause(replication)}.`
    : `Over fifty mornings ${reductionClause(measure, replication)}.`;
  return {
    ...gate,
    kind: 'cleared-once',
    head: JUDGE_COPY.clearedOnceHead,
    body: `${why} ${JUDGE_COPY.clearedOnceClosing}`,
    rows,
    basis,
  };
}

/* -------------------------------------------------------------------------- *
 * Running the mornings — the orchestration both surfaces share
 * -------------------------------------------------------------------------- */

/** One ask of the morning runner: configs in, one reading per config out, in order. */
export interface MorningAsk {
  readonly configs: readonly [SimulationConfig, ...SimulationConfig[]];
  readonly measure: ComplaintMeasure;
  readonly onDone: (readings: readonly MorningReading[]) => void;
  readonly onFailed: (message: string) => void;
}

/**
 * What `dev/offThreadMornings.ts` provides and a test fakes. Its protocol is `dev/offThreadRuns.ts`'s:
 * the latest ask wins, and a superseded ask is silent.
 */
export interface MorningRunner {
  start(ask: MorningAsk): void;
  cancel(): void;
  isRunning(): boolean;
}

export interface FixitJudge {
  /**
   * Start the case's forty-nine as-built mornings if they are neither held nor in flight. Called
   * when a case opens; never supersedes a press's replication.
   */
  prepare(entry: FixitCase, asBuilt: SimulationConfig): void;
  /** Whether the as-built mornings for this case are held. */
  prepared(entry: FixitCase): boolean;
  /**
   * Run the order's forty-nine after-mornings and judge all fifty with the letter's pair. Asks for
   * the as-built mornings in the same breath when they are not held yet, and waits on them when they
   * are already in flight.
   */
  replicate(
    entry: FixitCase,
    plan: FixitRunPlan,
    letters: { readonly before: MorningReading; readonly after: MorningReading },
    onJudged: (replication: FixitReplication) => void,
    onFailed: (message: string) => void,
  ): void;
  /** Whether a replication is in flight. */
  replicating(): boolean;
}

/** The as-built mornings depend on the case's run and nothing a player sets, so this is their key. */
function morningsKeyOf(entry: FixitCase): string {
  return `${entry.id}|${entry.run.seed}|${String(entry.run.durationS)}|${String(entry.run.arrivalRatePctPop5min)}`;
}

function nonEmpty(configs: SimulationConfig[]): readonly [SimulationConfig, ...SimulationConfig[]] {
  if (configs.length === 0) throw new Error('fixit judge: an empty morning ask is a caller bug.');
  return configs as unknown as readonly [SimulationConfig, ...SimulationConfig[]];
}

export function createFixitJudge(runner: MorningRunner): FixitJudge {
  const held = new Map<string, readonly MorningReading[]>();
  /** What the runner is doing now — at most one ask, by `MorningRunner`'s protocol. */
  let flight: { readonly kind: 'prepare' | 'replicate'; readonly key: string } | undefined;
  /** A replication waiting on the prepare already in flight for the same case. */
  let waiting: (() => void) | undefined;

  function startPrepare(entry: FixitCase, asBuilt: SimulationConfig): void {
    const key = morningsKeyOf(entry);
    flight = { kind: 'prepare', key };
    waiting = undefined;
    runner.start({
      configs: nonEmpty(morningConfigsOf(asBuilt, replicationSeedsOf(entry))),
      measure: entry.complaint.measure,
      onDone: (readings) => {
        flight = undefined;
        held.set(key, readings);
        const next = waiting;
        waiting = undefined;
        next?.();
      },
      onFailed: () => {
        flight = undefined;
        /* A prepare that failed is retried by the replication that needs it, which says why. */
        const next = waiting;
        waiting = undefined;
        next?.();
      },
    });
  }

  return {
    prepare(entry, asBuilt) {
      const key = morningsKeyOf(entry);
      if (held.has(key)) return;
      if (flight !== undefined && (flight.kind === 'replicate' || flight.key === key)) return;
      startPrepare(entry, asBuilt);
    },

    prepared(entry) {
      return held.has(morningsKeyOf(entry));
    },

    replicating() {
      return flight?.kind === 'replicate' || waiting !== undefined;
    },

    replicate(entry, plan, letters, onJudged, onFailed) {
      const key = morningsKeyOf(entry);
      const seeds = replicationSeedsOf(entry);
      const measure = entry.complaint.measure;
      const judge = (asBuilt: readonly MorningReading[], after: readonly MorningReading[]): void => {
        onJudged(judgeReplication([letters.before, ...asBuilt], [letters.after, ...after]));
      };
      const afterOnly = (asBuilt: readonly MorningReading[]): void => {
        flight = { kind: 'replicate', key };
        runner.start({
          configs: nonEmpty(morningConfigsOf(plan.asRepaired, seeds)),
          measure,
          onDone: (after) => {
            flight = undefined;
            judge(asBuilt, after);
          },
          onFailed: (message) => {
            flight = undefined;
            onFailed(message);
          },
        });
      };
      const both = (): void => {
        flight = { kind: 'replicate', key };
        waiting = undefined;
        runner.start({
          configs: nonEmpty([...morningConfigsOf(plan.asBuilt, seeds), ...morningConfigsOf(plan.asRepaired, seeds)]),
          measure,
          onDone: (readings) => {
            flight = undefined;
            const asBuilt = readings.slice(0, seeds.length);
            held.set(key, asBuilt);
            judge(asBuilt, readings.slice(seeds.length));
          },
          onFailed: (message) => {
            flight = undefined;
            onFailed(message);
          },
        });
      };

      const cached = held.get(key);
      if (cached !== undefined) {
        afterOnly(cached);
        return;
      }
      if (flight?.kind === 'prepare' && flight.key === key) {
        waiting = () => {
          const landed = held.get(key);
          if (landed !== undefined) afterOnly(landed);
          else both();
        };
        return;
      }
      both();
    },
  };
}

/* -------------------------------------------------------------------------- *
 * A press, through the gate and the judge — what both surfaces call
 * -------------------------------------------------------------------------- */

/** The structural half of `dev/offThreadRuns.ts#OffThreadRunnerHandle` a press uses. */
export interface PairRunner {
  start(ask: {
    readonly runs: readonly [
      { readonly config: SimulationConfig; readonly outOfServiceCarIds: readonly string[]; readonly recordDecisions: boolean },
      ...{ readonly config: SimulationConfig; readonly outOfServiceCarIds: readonly string[]; readonly recordDecisions: boolean }[],
    ];
    readonly onDone: (recordings: readonly VizRecording[]) => void;
    readonly onFailed: (message: string) => void;
  }): void;
}

export interface JudgedPress {
  readonly entry: FixitCase;
  readonly plan: FixitRunPlan;
  /** `fixit/run.ts#FIXIT_RUN_SWITCHES`, passed rather than imported so this module runs nothing. */
  readonly switches: { readonly outOfServiceCarIds: readonly string[]; readonly recordDecisions: boolean };
  readonly pairRunner: PairRunner;
  readonly judge: FixitJudge;
  /** `fixit/run.ts#morningReadingOf`, passed for the same reason. */
  readonly readingOf: (recording: VizRecording, measure: ComplaintMeasure) => MorningReading;
  /**
   * Classify the letter's pair into § 10.4's outcomes. A continuation rather than a return, so a
   * surface whose classification needs a further run (the diagnosed repair's own, to decide the
   * narration) can take it before answering.
   */
  readonly classify: (before: VizRecording, after: VizRecording, done: (gate: FixitOutcome) => void) => void;
  /**
   * The letter's morning has an answer: the gate's own outcome when it did not clear, or the
   * {@link checkingOutcomeOf} state when it did. Drawn at once.
   */
  readonly onGate: (outcome: FixitOutcome, before: VizRecording, after: VizRecording) => void;
  /** The fifty mornings are in. Only ever called after an `onGate` carrying `checking`. */
  readonly onVerdict: (outcome: FixitOutcome) => void;
  readonly onFailed: (message: string) => void;
}

/**
 * One press: the pair, the gate, and — only when the gate clears — the mornings.
 *
 * So a press whose gate fails asks for exactly one pair, and one whose gate clears asks for one pair
 * and forty-nine after-runs (plus the forty-nine as-built mornings when the case's own were not yet
 * held). `judge.test.ts` counts both with a fake runner, which is the structural guard on the cost
 * claim in the module docstring.
 */
export function pressThroughTheJudge(press: JudgedPress): void {
  const { entry, plan, switches } = press;
  press.pairRunner.start({
    runs: [
      { config: plan.asBuilt, ...switches },
      { config: plan.asRepaired, ...switches },
    ],
    onDone: ([before, after]) => {
      if (before === undefined || after === undefined) return;
      press.classify(before, after, (gate) => {
        if (gate.kind !== 'fixed') {
          press.onGate(gate, before, after);
          return;
        }
        press.onGate(checkingOutcomeOf(gate), before, after);
        const measure = entry.complaint.measure;
        press.judge.replicate(
          entry,
          plan,
          { before: press.readingOf(before, measure), after: press.readingOf(after, measure) },
          (replication) => press.onVerdict(judgedOutcomeOf(entry, gate, replication)),
          press.onFailed,
        );
      });
    },
    onFailed: press.onFailed,
  });
}
