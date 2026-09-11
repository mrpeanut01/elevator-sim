/**
 * **Does the best counterweight balance differ by traffic pattern, and by how much?** — GitHub issue
 * #431's fourth acceptance criterion, `DECISIONS.md` § D539.
 *
 * ```ts
 * console.log(formatCounterweightOptimumStudy(await runCounterweightOptimumStudy()));
 * ```
 *
 * ## Why no ratio is swept
 *
 * § D539 made the counterweight an energy-only equipment setting: it prices a bank's moves and reaches
 * nothing a dispatcher reads, so **a run's legs and moves are identical at every ratio**. A run's work
 * at any ratio is therefore a re-pricing of that run's own travel samples, and the ratio that minimises
 * it can be found exactly rather than by a grid of simulations.
 *
 * Under the non-regenerative convention each move costs `R·d·g·|x − r|`, with `x = loadKg / R`, so the
 * minimiser over a run is the **weighted median of `x`, weighted by `R·d`** — the derivation the issue's
 * own triage gave. Under a regenerative drive the objective stays convex and piecewise linear, with the
 * overhauling side of each move's kink flattened by the recovery fraction, so its minimiser is found by
 * the same scan with asymmetric slopes ({@link optimalBalanceRatio}). `counterweightOptimum.test.ts`
 * checks both against a brute-force grid, and checks a re-priced figure against a run re-simulated at
 * that ratio, which is what licenses the whole approach.
 *
 * ## The design
 *
 * `midtown-office` under `collective` — the building the three office templates are written for, and
 * the dispatcher § D468's goal measurement used — on each of the three templates the issue names, at
 * **two** arrival rates, so that pattern is not confounded with load and load is not left at one value:
 *
 * | rate, % pop / 5 min | basis | what it is here |
 * |---|---|---|
 * | 1.5 | published: `arms.ts#MIDTOWN_INTERFLOOR_MIX`, and the lunch two-way study's point | light — the cars run close to empty |
 * | 2.5 | measured: the census below | heavy — as loaded as all three templates get with no published replication saturated |
 *
 * **Why two rates, and why not the templates' own.** The first run of this study passed each template
 * at its default rate, 12 % on this building, and **every replication saturated under all three**: the
 * queue rose by 119.5 persons over the office peaks' 300 s window and by 371 over lunch's 1 800 s. An
 * optimum read off overloaded cars is not an operating point, so that run was withdrawn. The second run
 * named 1.5 %, where nothing saturates but only 1–2 % of the window's moves carry more than 0.4 of rated
 * load, so an optimum there is mostly a statement about empty cars; the heavy point is measured beside it
 * for that reason.
 *
 * **The heavy point was first 4.5 %, and it was wrong.** It came from a probe of five replications per
 * rate, where it saturated nothing; at the published fifty it saturated 3 `rise-and-fall` and 9
 * `office-down-peak` replications, and that run was withdrawn too. 2.5 % is what a census at the full
 * budget then found (`main --census`), over 1.5 % to 4.5 % in steps of 0.5, on this study's seed base
 * and on a disjoint one (20 260 912). Saturated replications of fifty:
 *
 * | rate | `office-down-peak`, study seeds | `office-down-peak`, disjoint seeds | `rise-and-fall`, study / disjoint | `lunch-two-way` |
 * |---|---|---|---|---|
 * | 1.5 and 2 | 0 | 0 | 0 / 0 | 0 |
 * | 2.5 | 0 | 1 | 0 / 0 | 0 |
 * | 3 | 1 | 1 | 0 / 0 | 0 |
 * | 3.5 | 2 | 5 | 0 / 2 | 0 |
 * | 4 | 3 | 6 | 1 / 1 | 0 |
 * | 4.5 | 9 | 11 | 3 / 6 | 0 |
 *
 * So 2.5 % is the heaviest rate at which no published replication saturates, and it is **the edge of the
 * unsaturated region rather than inside it**: one disjoint-seed run in fifty crosses there. The census
 * chose on saturation alone, but it printed each cell's largest optimum as well, so the choice was not
 * blind to them — and **in every cell, saturated or not, every replication's optimum sat below 0.4**:
 * the largest was 0.243, in a saturating 4.5 % cell, and 0.155 below 4.5 %. Each row reports its own saturated and
 * AWT-refused counts beside its figures, and `counterweightOptimum.test.ts` runs the published budget and
 * fails if either is ever non-zero.
 *
 * **Each office peak names its direction, and that is not decoration.** `office-down-peak` draws the
 * same passengers as `rise-and-fall` at the same seed — its record adds the hour and nothing else
 * (`core` `traffic/types.ts`, § D263). The first run of this study passed the template alone, produced
 * two identical rows and a paired difference of exactly zero, which is the other reason it was
 * withdrawn. So the up-peak names a pure incoming split and the down-peak its mirror image, exactly as
 * `enRouteDiversion.ts#midtownDownPeakAt` names down-peak's; lunch keeps its template's own mix arc; and
 * `counterweightOptimum.test.ts` fails if the two office rows are ever identical again. At every
 * replication the study records the run's unclamped optimum under both drives, the optimum clamped into
 * the settable band 0.4–0.5, and `workPerServedLegKJ` at 0.5 and at that clamped optimum.
 *
 * Per row it reports the mean optimum with its interval, how many replications' optima fall outside the
 * band, and the saving the band can actually buy, **paired against 0.5 within each run**. Between
 * templates at one rate it reports paired differences of the optimum. **Those pairs are by seed, not by
 * trace**: replication *i* uses the same seed under every template, but the templates generate different
 * passengers, so this is a paired-t on replication index with whatever correlation that leaves, stated
 * rather than dressed as common random numbers.
 *
 * **Under no regeneration, direction cannot move the optimum at all.** Each move's cost is
 * `R·d·|x − r|` whichever way it travels, so the minimiser depends on the distribution of loads and not
 * on which way they went: an up-peak and its exact mirror image have the same optimum. Whatever the two
 * office rows differ by is the traces differing, not the direction. Only a regenerative drive makes
 * direction matter, and then only on the overhauling side of each move's kink.
 *
 * ## What it does not claim
 *
 * It does not claim a best ratio *for a building*: the optimum is a property of a run's loads, and this
 * measures three templates on one office at two unsaturated arrival rates under one dispatcher.
 * Saturated rates are outside it by construction. And it does not treat an interval excluding zero
 * between two templates as a lever worth a decision: a difference whose clamped consequence is nothing,
 * because every optimum sits below the band and clamps to the same end of it, is reported as a null for
 * the decision whatever its interval says about the unclamped optimum.
 *
 * ## The record, 2026-09-11
 *
 * `n = 50` per row, seed 20 260 911, recovery fraction 0.6, taken by the command under {@link main} on the
 * tree that introduced this module. **None of the 300 replications saturated or had its AWT refused.**
 *
 * | rate | template | optimum, no regeneration | outside 0.4–0.5 | largest | saving at the band's best against 0.5, kJ/ride |
 * |---|---|---|---|---|---|
 * | 1.5 % | `rise-and-fall` | +0.023 [+0.015, +0.030] | 50 of 50 | 0.072 | −38.468 [−41.488, −35.447] |
 * | 1.5 % | `office-down-peak` | +0.034 [+0.026, +0.042] | 50 of 50 | 0.071 | −51.579 [−55.724, −47.434] |
 * | 1.5 % | `lunch-two-way` | +0.061 [+0.060, +0.062] | 50 of 50 | 0.068 | −44.160 [−45.495, −42.825] |
 * | 2.5 % | `rise-and-fall` | +0.029 [+0.020, +0.038] | 50 of 50 | 0.136 | −23.267 [−25.478, −21.057] |
 * | 2.5 % | `office-down-peak` | +0.049 [+0.042, +0.056] | 50 of 50 | 0.122 | −31.984 [−34.505, −29.463] |
 * | 2.5 % | `lunch-two-way` | +0.065 [+0.064, +0.066] | 50 of 50 | 0.075 | −35.935 [−36.993, −34.877] |
 *
 * Paired by seed, the first template's optimum minus the second's:
 *
 * | rate | `rise-and-fall` − `office-down-peak` | `rise-and-fall` − `lunch-two-way` | `office-down-peak` − `lunch-two-way` |
 * |---|---|---|---|
 * | 1.5 % | −0.012 [−0.023, −0.000] | −0.038 [−0.046, −0.031] | −0.027 [−0.035, −0.019] |
 * | 2.5 % | −0.020 [−0.031, −0.010] | −0.036 [−0.046, −0.027] | −0.016 [−0.023, −0.009] |
 *
 * **What it answers is a null for the decision.** The unclamped optimum does differ by pattern — all six
 * paired intervals exclude zero, one only just — but by hundredths, and **every one of the 300
 * replications' optima lies below 0.4**, the largest 0.136. The regenerative optima do too, their row
 * means within 0.005 of the non-regenerative ones. So clamped into the band a player can set, the best
 * ratio is 0.4 on every run, under every pattern, at both rates, with or without a drive. Within the cited
 * band the lever has one right answer and it does not depend on the traffic pattern. #431's fourth
 * criterion names that outcome — *published as a null and the lever reconsidered* — and `DECISIONS.md`
 * § D539 records it without reconsidering the lever, which is the owner's. What the setting buys is not
 * in doubt: 0.4 takes about 23 % off `workPerServedLegKJ` against 0.5 in every row (22.5–23.6 %).
 */

import {
  Simulation,
  outOfBalanceWorkJ,
  windowContains,
  type LoadedConfig,
  type ReportWindow,
  type TravelSample,
} from '@elevator-sim/core';

import { estimateMean, pairedDifferenceEstimate } from '../reports/statistics.js';
import type { PublishedMeanEstimate } from '../reports/statistics.js';
import { replicationSeed } from '../runner/crn.js';
import { loadResources } from '../validation/harness.js';

export const OPTIMUM_BUILDING = 'midtown-office';
export const OPTIMUM_DISPATCHER = 'collective';
export const OPTIMUM_TEMPLATES = Object.freeze([
  'rise-and-fall',
  'office-down-peak',
  'lunch-two-way',
] as const);
export const OPTIMUM_REPLICATIONS = 50;
export const OPTIMUM_SEED = 20_260_911;

/**
 * The two arrival rates, in % of population per five minutes. 1.5 is a published `midtown-office`
 * operating point, `arms.ts#MIDTOWN_INTERFLOOR_MIX`'s; 2.5 is measured — the heaviest rate at which none
 * of this study's published replications saturates under any template. The header carries the census,
 * and says why two.
 */
export const OPTIMUM_RATES_PCT_POP_5MIN = Object.freeze([1.5, 2.5] as const);

type OptimumTemplate = (typeof OPTIMUM_TEMPLATES)[number];

interface DirectionalSplit {
  readonly incoming: number;
  readonly outgoing: number;
  readonly interfloor: number;
}

interface TemplateDemand {
  readonly arrivalRatePctPop5min: number;
  readonly directionalSplit?: DirectionalSplit;
}

/** The split each office peak must name. See the header for why; lunch keeps its template's own arc. */
export const OPTIMUM_SPLITS: Readonly<Partial<Record<OptimumTemplate, DirectionalSplit>>> = Object.freeze({
  'rise-and-fall': Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
  'office-down-peak': Object.freeze({ incoming: 0, outgoing: 1, interfloor: 0 }),
});

/** The demand one (template, rate) cell runs. */
export function optimumDemandOf(templateId: OptimumTemplate, ratePctPop5min: number): TemplateDemand {
  const split = OPTIMUM_SPLITS[templateId];
  return Object.freeze({
    arrivalRatePctPop5min: ratePctPop5min,
    ...(split === undefined ? {} : { directionalSplit: split }),
  });
}

/** The settable band, `core`'s `BANK_ENERGY_TUNABLES.counterweightBalanceRatio`. */
export const BAND = Object.freeze({ min: 0.4, max: 0.5, default: 0.5 });

/* -------------------------------------------------------------------------- *
 * The objective, and its exact minimiser
 * -------------------------------------------------------------------------- */

/** One move as the objective reads it: its load as a share of rated load, and its weight `R·d`. */
export interface WeightedMove {
  readonly share: number;
  readonly weight: number;
  readonly direction: 'up' | 'down';
}

/** The moves a run's reporting window charges, in the form the objective reads. */
export function movesInWindow(
  samples: readonly TravelSample[],
  window: ReportWindow,
): WeightedMove[] {
  const moves: WeightedMove[] = [];
  for (const sample of samples) {
    if (!windowContains(window, sample.at)) continue;
    moves.push({
      share: sample.loadKg / sample.ratedLoadKg,
      weight: sample.ratedLoadKg * sample.distanceM,
      direction: sample.direction,
    });
  }
  return moves;
}

/**
 * The run's out-of-balance cost at `ratio`, in kilogram-metres (joules are this times `g`).
 *
 * The same branch `core`'s `outOfBalanceWorkJ` takes: a move motors when it climbs with the car side
 * heavier or descends with the counterweight side heavier, and otherwise overhauls and is charged
 * `1 − recoveryFraction` of its magnitude.
 */
export function balanceCost(
  moves: readonly WeightedMove[],
  ratio: number,
  recoveryFraction: number,
): number {
  let total = 0;
  for (const move of moves) {
    const signed = move.share - ratio;
    const motoring = move.direction === 'up' ? signed > 0 : signed < 0;
    total += move.weight * Math.abs(signed) * (motoring ? 1 : 1 - recoveryFraction);
  }
  return total;
}

/**
 * **The ratio minimising {@link balanceCost}, exactly.** `NaN` when the window charged no move.
 *
 * The cost is a sum of convex piecewise-linear terms with one kink each, at the move's own share, so
 * its minimiser is a kink at which the subgradient first reaches zero. Below a move's share the move
 * contributes slope `−w` if it climbs (it motors there) and `−(1 − f)·w` if it descends (it overhauls
 * there); above it, `+(1 − f)·w` and `+w`. So every kink raises the slope by `(2 − f)·w` whichever way
 * the move went, and the scan starts from the sum of the below-slopes. At `f = 0` that is the weighted
 * median.
 */
export function optimalBalanceRatio(moves: readonly WeightedMove[], recoveryFraction: number): number {
  const ordered = moves.filter((move) => move.weight > 0).sort((a, b) => a.share - b.share);
  if (ordered.length === 0) return Number.NaN;
  let slope = 0;
  for (const move of ordered) {
    slope -= move.direction === 'up' ? move.weight : (1 - recoveryFraction) * move.weight;
  }
  for (const move of ordered) {
    slope += (2 - recoveryFraction) * move.weight;
    if (slope >= 0) return move.share;
  }
  /* c8 ignore next -- the slope ends at the sum of the above-slopes, which is positive. */
  return ordered[ordered.length - 1]?.share ?? Number.NaN;
}

/** `ratio` clamped into the settable band. The objective is convex, so this is the band's optimum. */
export function clampToBand(ratio: number): number {
  return Math.min(BAND.max, Math.max(BAND.min, ratio));
}

/**
 * The run's work in kilojoules at a ratio and recovery, re-priced from its own window's samples with
 * `core`'s own function, summed in the order the recorder summed them.
 */
export function repricedWorkKJ(
  samples: readonly TravelSample[],
  window: ReportWindow,
  counterweightBalanceRatio: number,
  regenerativeRecoveryFraction: number,
): number {
  let workJ = 0;
  for (const sample of samples) {
    if (!windowContains(window, sample.at)) continue;
    workJ += outOfBalanceWorkJ(sample, { counterweightBalanceRatio, regenerativeRecoveryFraction });
  }
  return workJ / 1000;
}

/* -------------------------------------------------------------------------- *
 * Measurement
 * -------------------------------------------------------------------------- */

/** What one run contributes to its template's row. Every figure is the run's own window. */
export interface RunOptimum {
  /** The non-regenerative minimiser, unclamped. `NaN` when the window charged no move. */
  readonly optimum: number;
  /** The minimiser under the specs' regenerative recovery fraction, unclamped. */
  readonly optimumRegenerative: number;
  /** {@link optimum} clamped into the settable band. */
  readonly clamped: number;
  readonly perLegAtDefaultKJ: number;
  readonly perLegAtClampedKJ: number;
  readonly awtIsValid: boolean;
  readonly saturated: boolean;
}

/** One run's optimum and what the band can buy of it, read off the run's own samples. */
export function optimumOfRun(
  result: ReturnType<Simulation['run']>,
  recoveryFraction: number,
): RunOptimum {
  const samples = result.record.travelSamples ?? [];
  const moves = movesInWindow(samples, result.reportWindow);
  const optimum = optimalBalanceRatio(moves, 0);
  const optimumRegenerative = optimalBalanceRatio(moves, recoveryFraction);
  const clamped = clampToBand(optimum);
  const { workKJ, workPerServedLegKJ } = result.summary.energy;
  // The recorder divides the same sum by the served legs, so the count is recovered exactly by rounding.
  const legs = Math.round(workKJ / workPerServedLegKJ);
  const perLeg = (ratio: number): number =>
    legs > 0 ? repricedWorkKJ(samples, result.reportWindow, ratio, 0) / legs : Number.NaN;
  return {
    optimum,
    optimumRegenerative,
    clamped,
    perLegAtDefaultKJ: perLeg(BAND.default),
    perLegAtClampedKJ: Number.isFinite(clamped) ? perLeg(clamped) : Number.NaN,
    awtIsValid: result.summary.awtIsValid,
    saturated: result.summary.awtInvalidGround === 'saturated',
  };
}

/** One (rate, template) row. The arrays are indexed by replication, `NaN` where a run was unmeasured. */
export interface OptimumRow {
  readonly templateId: string;
  /** The arrival rate this row ran at, % of population per five minutes. */
  readonly ratePctPop5min: number;
  readonly optima: readonly number[];
  readonly optimaRegenerative: readonly number[];
  readonly clampedOptima: readonly number[];
  /** `workPerServedLegKJ` at the clamped optimum minus at 0.5, per replication. Never positive. */
  readonly savingsKJ: readonly number[];
  readonly optimum: PublishedMeanEstimate;
  readonly optimumRegenerative: PublishedMeanEstimate;
  readonly perLegAtDefault: PublishedMeanEstimate;
  readonly saving: PublishedMeanEstimate;
  /** Replications whose non-regenerative optimum lies outside 0.4–0.5. */
  readonly outsideBand: number;
  readonly unmeasured: number;
  /** Replications whose AWT the run refused. Reported beside, not excluded: this is not a wait statistic. */
  readonly awtRefused: number;
  /** Replications the run judged saturated. A row with any is not an operating point, and says so. */
  readonly saturated: number;
}

/** A paired difference of the optimum between two templates at one rate, by replication index. */
export interface TemplateDifference {
  readonly ratePctPop5min: number;
  readonly minuend: string;
  readonly subtrahend: string;
  readonly pairs: number;
  readonly optimumDifference: PublishedMeanEstimate;
}

export interface CounterweightOptimumStudy {
  readonly buildingId: string;
  readonly dispatcherId: string;
  readonly replications: number;
  readonly seed: number;
  readonly recoveryFraction: number;
  readonly rows: readonly OptimumRow[];
  readonly differences: readonly TemplateDifference[];
}

export interface CounterweightOptimumOptions {
  readonly replications?: number | undefined;
  readonly seed?: number | undefined;
  readonly config?: LoadedConfig | undefined;
}

const finite = (values: readonly number[]): number[] => values.filter(Number.isFinite);

/** The fixtures every cell runs against, resolved once. Throws if the data directory lacks one. */
function fixturesOf(config: LoadedConfig): {
  readonly building: NonNullable<ReturnType<LoadedConfig['buildingsById']['get']>>;
  readonly dispatcherProfile: NonNullable<ReturnType<LoadedConfig['dispatcherProfilesById']['get']>>;
  readonly recoveryFraction: number;
} {
  const cellBuilding = config.buildingsById.get(OPTIMUM_BUILDING);
  const cellDispatcher = config.dispatcherProfilesById.get(OPTIMUM_DISPATCHER);
  const cellRecovery = config.elevatorSpecs.regenerativeDrive?.recoveryFraction;
  if (cellBuilding === undefined || cellDispatcher === undefined || cellRecovery === undefined) {
    throw new Error(
      `counterweightOptimum: needs building "${OPTIMUM_BUILDING}", dispatcher "${OPTIMUM_DISPATCHER}" and elevator-specs.json's regenerativeDrive block.`,
    );
  }
  return { building: cellBuilding, dispatcherProfile: cellDispatcher, recoveryFraction: cellRecovery };
}

/** One replication of one (template, rate) cell, and what it contributes. */
function optimumOfCell(
  config: LoadedConfig,
  templateId: OptimumTemplate,
  ratePctPop5min: number,
  seed: ReturnType<typeof replicationSeed>,
): RunOptimum {
  const { building, dispatcherProfile, recoveryFraction } = fixturesOf(config);
  const result = new Simulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed,
    demandTemplate: templateId,
    demand: optimumDemandOf(templateId, ratePctPop5min),
    onTimeout: 'report',
  }).run();
  return optimumOfRun(result, recoveryFraction);
}

/** The study. One row per (rate, template), and a paired difference for every pair of templates at each rate. */
export async function runCounterweightOptimumStudy(
  options: CounterweightOptimumOptions = {},
): Promise<CounterweightOptimumStudy> {
  const config = options.config ?? (await loadResources());
  const replications = options.replications ?? OPTIMUM_REPLICATIONS;
  const seed = options.seed ?? OPTIMUM_SEED;
  const { recoveryFraction } = fixturesOf(config);

  const rows: OptimumRow[] = [];
  for (const ratePctPop5min of OPTIMUM_RATES_PCT_POP_5MIN) {
    for (const templateId of OPTIMUM_TEMPLATES) {
      const runs: RunOptimum[] = [];
      for (let replication = 0; replication < replications; replication += 1) {
        runs.push(optimumOfCell(config, templateId, ratePctPop5min, replicationSeed(seed, replication)));
      }
      const optima = runs.map((run) => run.optimum);
      const savingsKJ = runs.map((run) => run.perLegAtClampedKJ - run.perLegAtDefaultKJ);
      rows.push({
        templateId,
        ratePctPop5min,
        optima,
        optimaRegenerative: runs.map((run) => run.optimumRegenerative),
        clampedOptima: finite(runs.map((run) => run.clamped)),
        savingsKJ,
        optimum: estimateMean(finite(optima)),
        optimumRegenerative: estimateMean(finite(runs.map((run) => run.optimumRegenerative))),
        perLegAtDefault: estimateMean(finite(runs.map((run) => run.perLegAtDefaultKJ))),
        saving: estimateMean(finite(savingsKJ)),
        outsideBand: finite(optima).filter((ratio) => ratio < BAND.min || ratio > BAND.max).length,
        unmeasured: optima.filter((ratio) => !Number.isFinite(ratio)).length,
        awtRefused: runs.filter((run) => !run.awtIsValid).length,
        saturated: runs.filter((run) => run.saturated).length,
      });
    }
  }

  const differences: TemplateDifference[] = [];
  for (const ratePctPop5min of OPTIMUM_RATES_PCT_POP_5MIN) {
    const atRate = rows.filter((row) => row.ratePctPop5min === ratePctPop5min);
    for (let a = 0; a < atRate.length; a += 1) {
      for (let b = a + 1; b < atRate.length; b += 1) {
        const left = atRate[a];
        const right = atRate[b];
        if (left === undefined || right === undefined) continue;
        const indexes = left.optima
          .map((_, index) => index)
          .filter((index) => Number.isFinite(left.optima[index]) && Number.isFinite(right.optima[index]));
        differences.push({
          ratePctPop5min,
          minuend: left.templateId,
          subtrahend: right.templateId,
          pairs: indexes.length,
          optimumDifference: pairedDifferenceEstimate(
            indexes.map((index) => left.optima[index] ?? Number.NaN),
            indexes.map((index) => right.optima[index] ?? Number.NaN),
          ),
        });
      }
    }
  }

  return {
    buildingId: OPTIMUM_BUILDING,
    dispatcherId: OPTIMUM_DISPATCHER,
    replications,
    seed,
    recoveryFraction,
    rows,
    differences,
  };
}

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

/** Explicit sign and U+2212, `published.ts`'s convention, so a printed interval is one the guard can find. */
const signed = (value: number, digits = 3): string =>
  `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(digits)}`;
const cell = (estimate: PublishedMeanEstimate, digits = 3): string =>
  `${signed(estimate.mean, digits)} [${signed(estimate.lower, digits)}, ${signed(estimate.upper, digits)}]`;

/** The study as a table. The only renderer; nothing here re-derives a figure. */
export function formatCounterweightOptimumStudy(study: CounterweightOptimumStudy): string {
  const lines = [
    `counterweight optimum · ${study.buildingId} · ${study.dispatcherId} · % pop / 5 min as named per row · n = ${String(study.replications)} · seed ${String(study.seed)} · recovery ${String(study.recoveryFraction)}`,
    'rate    template          optimum (no regeneration)   optimum (regenerative)      outside 0.4-0.5  kJ/ride at 0.5            saving in the band (kJ/ride)  AWT refused  saturated',
  ];
  for (const row of study.rows) {
    lines.push(
      [
        `${String(row.ratePctPop5min)} %`.padEnd(6),
        row.templateId.padEnd(16),
        cell(row.optimum).padEnd(26),
        cell(row.optimumRegenerative).padEnd(26),
        `${String(row.outsideBand)} of ${String(row.optima.length - row.unmeasured)}`.padEnd(15),
        cell(row.perLegAtDefault, 2).padEnd(24),
        cell(row.saving).padEnd(28),
        String(row.awtRefused).padEnd(11),
        String(row.saturated),
      ].join('  '),
    );
  }
  for (const difference of study.differences) {
    lines.push(
      `optimum at ${String(difference.ratePctPop5min)} %, ${difference.minuend} − ${difference.subtrahend}: ${cell(difference.optimumDifference)} over ${String(difference.pairs)} seed-paired replications`,
    );
  }
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- *
 * The saturation census
 * -------------------------------------------------------------------------- */

/** The seed bases and rates of the census the header's saturation table came from. */
const CENSUS_SEED_BASES = Object.freeze([OPTIMUM_SEED, 20_260_912]);
const CENSUS_RATES_PCT_POP_5MIN = Object.freeze([1.5, 2, 2.5, 3, 3.5, 4, 4.5]);

/**
 * **How the heavy rate was chosen**, as the table the header quotes: for each seed base, rate and
 * template, how many of a published budget's replications saturated or had their AWT refused, and the
 * largest optimum any of them reached. Printed by `main --census`; nothing is published from it but the
 * header's table.
 */
function saturationCensus(config: LoadedConfig): string {
  const lines = ['seed base  rate    template          saturated  AWT refused  largest optimum'];
  for (const seedBase of CENSUS_SEED_BASES) {
    for (const ratePctPop5min of CENSUS_RATES_PCT_POP_5MIN) {
      for (const templateId of OPTIMUM_TEMPLATES) {
        let saturated = 0;
        let refused = 0;
        let largest = Number.NEGATIVE_INFINITY;
        for (let replication = 0; replication < OPTIMUM_REPLICATIONS; replication += 1) {
          const run = optimumOfCell(config, templateId, ratePctPop5min, replicationSeed(seedBase, replication));
          if (run.saturated) saturated += 1;
          if (!run.awtIsValid) refused += 1;
          if (Number.isFinite(run.optimum)) largest = Math.max(largest, run.optimum);
        }
        lines.push(
          [
            String(seedBase).padEnd(9),
            `${String(ratePctPop5min)} %`.padEnd(6),
            templateId.padEnd(16),
            `${String(saturated)} of ${String(OPTIMUM_REPLICATIONS)}`.padEnd(9),
            String(refused).padEnd(11),
            largest.toFixed(3),
          ].join('  '),
        );
      }
    }
  }
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- *
 * The non-test caller
 * -------------------------------------------------------------------------- */

/**
 * The non-test caller (docs/05-roadmap.md § Standing requirement), and the commands this module's
 * header tables came from — the record, and with `--census` the saturation census:
 *
 * ```
 * npx tsc -b && node packages/experiments/dist/benchmark/counterweightOptimum.js
 * node packages/experiments/dist/benchmark/counterweightOptimum.js --census
 * ```
 */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  if (argv.includes('--census')) {
    process.stdout.write(`${saturationCensus(await loadResources())}\n`);
    return;
  }
  const study = await runCounterweightOptimumStudy();
  process.stdout.write(`${formatCounterweightOptimumStudy(study)}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
