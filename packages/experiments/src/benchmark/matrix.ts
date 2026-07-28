/**
 * **The full experiment matrix: every shipped dispatcher × every building × every traffic pattern
 * that admits a paired comparison, at a budget derived from that cell's own measured variance,
 * with a Pareto front over (AWT, energy, WT95).**
 *
 * This is Phase 8's eighth track. `suite.ts` is Phase 5's *gate* — three cases, argued against
 * `nearest-car`, and deliberately frozen so nobody can change what that criterion was argued on.
 * This module is the *survey*: it asks a different question (how do the twelve shipped profiles
 * compare across the whole shipped building set?) and it therefore gets its own cells, its own
 * baseline and its own budgets rather than widening Phase 5's.
 *
 * ```ts
 * const results = await runMatrix();            // 8 cells, 12 arms, CRN within each cell
 * results[0].front.front;                       // ids nothing significantly beats on every axis
 * results[0].front.indistinguishablePairs;      // ties, reported as ties and never ordered
 * ```
 *
 * ## Four decisions, each of which the project has already paid for getting wrong
 *
 * **1. The baseline is `collective`, not `nearest-car`.** `nearest-car` is the only shipped profile
 * that saturates anywhere, and a saturated *baseline* invalidates every cell in its table rather
 * than only its own row (`suite.ts` computes `quotable = baselineQuotable && arm.awtIsValid`).
 * Measured here at n = 200 per cell: `nearest-car` loses its AWT somewhere inside the 50–200 band on
 * **five of the eight cells** — first at replication 12 on Midtown down-peak, 24 on Mixed-Use
 * up-peak, 109 on Vertical City up-peak, 126 on Secure Tower up-peak and 174 on Midtown up-peak —
 * while `collective` is clean on all eight across the whole census. At the budgets this matrix
 * actually spends, two of those five bite: `nearest-car` is UNQUOTABLE on Midtown down-peak
 * (n = 78 against a ceiling of 12) and on Mixed-Use up-peak (n = 50 against 24). Had it been the
 * baseline, those two cells would have had **no quotable interval anywhere in their tables** — not
 * one bad row but two empty tables. It is still an *arm*, and where its own AWT is invalid its
 * cells read `UNQUOTABLE` with the ceiling printed, which is the distinction
 * `saturationCensus.test.ts` exists to keep visible.
 *
 * **2. Every cell's saturation is established from this module's own census.** No ceiling is
 * inherited from `arms.ts`. That mistake has been made and corrected twice here, and the census
 * below shows why once more: `arms.ts` records Midtown up-peak's `nearest-car` ceiling as 287 at
 * seed 20 260 726, and at this module's seed and operating point it is 174. Ceilings are a property
 * of (building, traffic, seed), not of a building.
 *
 * **3. The budget is derived per cell, from that cell's own spread, and it is not uniform.**
 * See {@link MatrixCell.budgetBasis}. docs/03 § *Measured: the replication budget* prices a
 * ±0.5 s interval at 143 replications and ±0.8 s at 57; this module targets a **1.0 s 95 % paired
 * half-width** on the worst-spread clean arm of each cell, floored at 50 and capped at 200 —
 * CLAUDE.md's band — and prints which arm bound it.
 *
 * **4. CRN's benefit is regime-dependent, so the budget is set by the hard regime.** docs/07 § 4:
 * ρ ≈ 0.997 between near-neighbour weight vectors and ρ ≈ 0.61 between structurally different
 * dispatchers, a 324× versus 1.8× difference in required runs. Every budget below is derived from
 * the *structurally different* pairs, because those are what bind; the near-neighbour pairs in the
 * same cell are then resolved far more finely than the budget was bought for, and
 * {@link MatrixCellResult.nearNeighbourPairs} reports which pairs those were rather than assuming
 * a constant.
 *
 * ## What the always-on tier covers, exactly
 *
 * **All eight cells, at their full derived budgets, with every verdict, every front and every pin
 * checked.** Measured at 72.7 s of simulation. Nothing is capped, sampled or shortened for the
 * always-on run, and there is no reduced-budget variant of this table anywhere.
 *
 * What is **opt-in** (`ELEVATOR_SIM_DEEP=1`) is the thing that cannot be afforded every run and is
 * not the deliverable: the **200-replication saturation census** that re-derives each cell's
 * ceiling and each arm's paired spread — i.e. re-derives the budgets in this file rather than
 * trusting them. That costs ~197 s and is `matrixCensus.test.ts`. So the always-on tier verifies
 * *the results*; the deep tier verifies *the design that produced them*.
 *
 * ## Cells that were censused and are not in the matrix
 *
 * {@link EXCLUDED_CELLS}. Each is excluded by a **measured mechanism**, never by a tolerance, and
 * each records the measurement. An operating point dropped without one is indistinguishable from an
 * operating point dropped because it gave the wrong answer.
 */

import { MODEL_SENSITIVE_METRIC_IDS } from '@elevator-sim/core';

import type { ReplicationMetric } from '../runner/metrics.js';
import type { ExperimentResources, TrafficArmSpec } from '../runner/types.js';
import { cellOf, comparePaired, loadResources } from '../validation/harness.js';
import { seedSetFromReplications } from '../tuning/report/build.js';
import { statisticalParetoFront } from '../tuning/report/pareto.js';
import type { CandidateEvaluation, ParetoFront } from '../tuning/report/types.js';

import type { BenchmarkCase } from './arms.js';
import { armOf, runBenchmarkCase, type CaseResult } from './suite.js';

/* -------------------------------------------------------------------------- *
 * Arms
 * -------------------------------------------------------------------------- */

/**
 * The matrix's reference arm.
 *
 * `collective` rather than `eta` among the two docs/07 § 4 permits, for a reason that is measured
 * rather than aesthetic: `eta` is bit-identical to at least one other shipped profile at most cells
 * — to `fairness-first` at five, and, when this matrix was first run, to `destination-eta` at
 * **all eight** (see {@link MatrixCellResult.identityClasses}) — and a baseline that is secretly the
 * same run as one of its own arms makes that arm's whole row a row of exact zeros with nothing to
 * say. It would also have hidden the matrix's largest structural finding behind a row of zeros in
 * the baseline column, where nobody reads it. `collective` is in no identity class at any cell.
 *
 * That finding is now closed rather than merely reported: `destination-eta` was inert because it
 * weighted no term that read the destination it disclosed, and `data/dispatcher-profiles.json`
 * weights `rideTime` at 0.5. It separates from `eta` at seven of the eight cells; the one where it
 * does not is named, with the measurement that shows the cell blind at every weight up to 2.0, in
 * `matrix.test.ts`. The choice of baseline is
 * unaffected — `fairness-first` is still identical to `eta` at five cells — and is left alone.
 */
export const MATRIX_BASELINE = 'collective';

/**
 * Every other profile in `data/dispatcher-profiles.json`, in file order.
 *
 * Twelve profiles ship; eleven are arms. Nothing is filtered and nothing is dropped for losing,
 * saturating or being identical to something else — each of those is a result about that profile,
 * and two of the three are results this matrix found.
 */
export const MATRIX_ARM_PROFILES: readonly string[] = Object.freeze([
  'nearest-car',
  'eta',
  'energy-aware',
  'fairness-first',
  'capacity-aware',
  'predictive-balanced',
  'auction',
  'auction-multi-round',
  'zoned-uppeak',
  'destination-eta',
  'destination-panel',
]);

/**
 * The four metrics every cell reports.
 *
 * The first three are the Pareto axes docs/06 § Guardrails names — and `energyKJ` is one of them
 * **for the first time in this project**: before the travel record landed in `core`, `RunSummary`
 * carried no energy, no metres and no stop count, and every front this repository produced silently
 * degenerated to two axes with the third reported `inactive`. `ttdMeanS` is here because it is the
 * one wait-shaped metric that survives a change of passenger model, and is therefore the only one
 * on which `destination-panel` can be compared with the rest of the table at all.
 */
export const MATRIX_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'awtS',
  'wt95S',
  'energyKJ',
  'ttdMeanS',
]);

/**
 * The master seed. Distinct from `BENCHMARK_SEED` and from `GATE_SEED`.
 *
 * A different seed from Phase 5's on purpose: a survey that agreed with the gate *because it was
 * measured on the gate's own passenger populations* would be a restatement rather than a check.
 */
export const MATRIX_SEED = 20_260_728;

/** Target 95 % paired half-width the per-cell budget is derived against, seconds. */
export const TARGET_HALF_WIDTH_S = 1;

/** CLAUDE.md § Statistical discipline's band. Neither end is ever silently crossed. */
export const MIN_REPLICATIONS = 50;
export const MAX_REPLICATIONS = 200;

/** The 97.5th percentile of the standard normal — the planning `z`, as in `verdict.ts`. */
const Z_95 = 1.959_963_984_540_054;

/**
 * The budget a paired spread of `sd` buys a half-width of {@link TARGET_HALF_WIDTH_S}, clamped to
 * the band.
 *
 * `n >= (z · sd / h)²`. A normal rather than a `t` quantile, for `verdict.ts`'s stated reason: this
 * is a planning figure in the tens-to-hundreds, where the two agree to under a percent, and `t`
 * would need the answer to know its own degrees of freedom. Pure, so `matrix.test.ts` re-derives
 * every declared budget from the census rather than reading it.
 */
export function budgetFor(sdOfDifference: number, targetHalfWidthS = TARGET_HALF_WIDTH_S): number {
  if (!Number.isFinite(sdOfDifference) || sdOfDifference <= 0) return MIN_REPLICATIONS;
  const raw = Math.ceil(((Z_95 * sdOfDifference) / targetHalfWidthS) ** 2);
  return Math.min(MAX_REPLICATIONS, Math.max(MIN_REPLICATIONS, raw));
}

/* -------------------------------------------------------------------------- *
 * Cells
 * -------------------------------------------------------------------------- */

/** How a cell's replication budget was arrived at. Data, so a reader can argue with it. */
export interface BudgetBasis {
  /**
   * The arm whose paired spread bound the budget — the largest `sd` among the arms with **zero**
   * invalid replications in the 200-replication census.
   *
   * Restricted to the clean arms deliberately, and the restriction is what makes the rule
   * non-circular: including an arm that saturates at some `n` inside the band makes the budget a
   * function of itself (a smaller `n` keeps the arm quotable, which raises the required `n`, which
   * makes it unquotable). The arms excluded here are not thereby hidden — they appear in
   * {@link MatrixCell.armCeilings} with the replication index at which they lost their AWT.
   */
  readonly bindingArmId: string;
  /** That arm's paired-difference `sd` against the baseline on AWT, at n = 200. */
  readonly sdOfDifference: number;
  /** `budgetFor(sdOfDifference)` before clamping, for a reader checking the clamp. */
  readonly unclampedReplications: number;
  /** Which end of the band bit, if either. */
  readonly clamped: 'floor' | 'ceiling' | 'none';
}

/** One (building, traffic pattern) the whole arm list is measured at. */
export interface MatrixCell {
  readonly id: string;
  readonly label: string;
  readonly building: string;
  /** Which of the four patterns this is. Reported, never branched on. */
  readonly pattern: 'up-peak' | 'down-peak' | 'interfloor-mix' | 'residential-mixed';
  readonly traffic: TrafficArmSpec;
  readonly replications: number;
  readonly budgetBasis: BudgetBasis;
  /**
   * The **baseline's** first invalid replication index in the 200-replication census, or
   * `undefined` when it had none.
   *
   * This is the ceiling that binds the whole cell, because a baseline with no quotable AWT leaves
   * no cell in the table with an interval. `undefined` on all eight is why every budget below is a
   * choice rather than a limit — which is itself the result of choosing `collective`.
   */
  readonly admissibleReplications: number | undefined;
  /**
   * Per-arm first-invalid replication index, for the arms that lost their AWT within 200.
   *
   * An arm absent from this map was clean across the whole census. An arm present with an index
   * **below** {@link replications} is reported `UNQUOTABLE` at this cell's budget, and the index is
   * the evidence for why — the distinction between *excluded by its ceiling* and *excluded by its
   * answer* that `saturationCensus.test.ts` exists to keep visible.
   */
  readonly armCeilings: Readonly<Record<string, number>>;
  readonly rationale: string;
}

const G_ONLY = Object.freeze({ G: 1, P1: 0 });

const upPeak = (
  id: string,
  ratePctPop5min: number,
  entranceWeights?: Readonly<Record<string, number>>,
): TrafficArmSpec =>
  Object.freeze({
    id,
    durationS: 900,
    demand: Object.freeze({
      directionalSplit: Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
      ...(entranceWeights === undefined ? {} : { entranceWeights }),
      arrivalRatePctPop5min: ratePctPop5min,
      peakWindowS: 300,
    }),
  });

/**
 * **The eight cells: five buildings, four traffic patterns.**
 *
 * Every shipped building appears. Every pattern a building admits a paired comparison at appears.
 * The rationale on each says what was censused and what bound the number.
 */
export const MATRIX_CELLS: readonly MatrixCell[] = Object.freeze([
  Object.freeze({
    id: 'midtown-up-peak',
    label: 'Midtown Office, up-peak 1 %',
    building: 'midtown-office',
    pattern: 'up-peak' as const,
    traffic: upPeak('up-peak-1pct', 1, G_ONLY),
    replications: 81,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 4.5766,
      unclampedReplications: 81,
      clamped: 'none' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({ 'nearest-car': 174 }),
    rationale:
      'The roadmap\'s own up-peak building at the rate arms.ts justified. Censused fresh: nearest-car first loses its AWT at replication 174 here, not the 287 arms.ts records at its own seed — the same building, a different ceiling, which is why no ceiling is inherited. 174 is above this budget, so nearest-car is quotable at this cell.',
  }),
  Object.freeze({
    id: 'midtown-down-peak',
    label: 'Midtown Office, down-peak 1 %',
    building: 'midtown-office',
    pattern: 'down-peak' as const,
    traffic: Object.freeze({
      id: 'down-peak-1pct',
      durationS: 900,
      demand: Object.freeze({
        directionalSplit: Object.freeze({ incoming: 0, outgoing: 1, interfloor: 0 }),
        entranceWeights: G_ONLY,
        arrivalRatePctPop5min: 1,
        peakWindowS: 300,
      }),
    }),
    replications: 78,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 4.4899,
      unclampedReplications: 78,
      clamped: 'none' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({ 'nearest-car': 12 }),
    rationale:
      'CLAUDE.md § Tuning discipline: "the optimum for up-peak is not the optimum for down-peak", and this is the cell that measures the sentence. It is also where the baseline choice earns itself: nearest-car loses its AWT at replication 12, so a nearest-car-baselined table here would have no quotable cell at any budget in the band.',
  }),
  Object.freeze({
    id: 'midtown-interfloor',
    label: 'Midtown Office, interfloor-mix 1.5 %, full run',
    building: 'midtown-office',
    pattern: 'interfloor-mix' as const,
    traffic: Object.freeze({
      id: 'interfloor-mix-1.5pct',
      durationS: 1800,
      reportWindow: 'full-run' as const,
      demand: Object.freeze({
        directionalSplit: Object.freeze({ incoming: 0.4, outgoing: 0.3, interfloor: 0.3 }),
        entranceWeights: G_ONLY,
        arrivalRatePctPop5min: 1.5,
        peakWindowS: 300,
      }),
    }),
    replications: 200,
    budgetBasis: Object.freeze({
      bindingArmId: 'nearest-car',
      sdOfDifference: 9.4048,
      unclampedReplications: 340,
      clamped: 'ceiling' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({}),
    rationale:
      'The only shipped configuration where destination information exists to be used (arms.ts § Phase 6a), and the one cell where every one of the twelve arms is clean across the whole 200-replication census — nothing saturates, so the budget is a choice throughout. It is also the only cell where the band ceiling bites: nearest-car spreads widely enough that a 1.0 s half-width would want 340 replications, and 200 buys 1.30 s instead. Declared rather than silently accepted; the effect it has to resolve is 16.3 s, so the shortfall changes no verdict.',
  }),
  Object.freeze({
    id: 'garden-residential',
    label: 'Garden Apartments, residential 2 %, full run',
    building: 'garden-apartments',
    pattern: 'residential-mixed' as const,
    traffic: Object.freeze({
      id: 'residential-2pct-fullrun',
      durationS: 3600,
      reportWindow: 'full-run' as const,
      demand: Object.freeze({ arrivalRatePctPop5min: 2, peakWindowS: 300 }),
    }),
    replications: 65,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 4.0834,
      unclampedReplications: 65,
      clamped: 'none' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({}),
    rationale:
      'The building the pre-positioning criterion names, at the operating point and window arms.ts justified — full-run rather than peak-5min because at this rate the peak window is empty often enough to invalidate the cell. Nothing saturates in 200 replications.',
  }),
  Object.freeze({
    id: 'garden-down-peak',
    label: 'Garden Apartments, down-peak 2 %, full run',
    building: 'garden-apartments',
    pattern: 'down-peak' as const,
    traffic: Object.freeze({
      id: 'down-peak-2pct-fullrun',
      durationS: 3600,
      reportWindow: 'full-run' as const,
      demand: Object.freeze({
        directionalSplit: Object.freeze({ incoming: 0, outgoing: 1, interfloor: 0 }),
        arrivalRatePctPop5min: 2,
        peakWindowS: 300,
      }),
    }),
    replications: 51,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 3.6148,
      unclampedReplications: 51,
      clamped: 'none' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({}),
    rationale:
      'Garden\'s second pattern, and the highest-correlation cell in the matrix: eight of the eleven arms pair against the baseline at rho above 0.99, which is the near-neighbour regime docs/07 § 4 prices at 324x. The budget is still derived from the structurally different arm, because that is the pair that binds.',
  }),
  Object.freeze({
    id: 'secure-up-peak',
    label: 'Secure Tower, up-peak 2 %',
    building: 'secure-tower',
    pattern: 'up-peak' as const,
    traffic: upPeak('up-peak-2pct', 2),
    replications: 119,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 5.5574,
      unclampedReplications: 119,
      clamped: 'none' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({ 'nearest-car': 126 }),
    rationale:
      'The access-control building, where the eligibility filter intersects service and access zoning on every call. nearest-car first loses its AWT at 126 — above this budget, so it stays quotable, and again not the 190 arms.ts records at its own seed.',
  }),
  Object.freeze({
    id: 'mixed-use-up-peak',
    label: 'Mixed-Use High-Rise, up-peak 4 %',
    building: 'mixed-use-high-rise',
    pattern: 'up-peak' as const,
    traffic: upPeak('up-peak-4pct', 4),
    replications: 50,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 3.0616,
      unclampedReplications: 36,
      clamped: 'floor' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({
      'nearest-car': 24,
      'predictive-balanced': 81,
      'destination-panel': 33,
    }),
    rationale:
      'The incoming-only regime DECISIONS.md § D100 established as the one comparable point on this building — its own mixed 40/30/30 scenario admits no paired comparison at all, and that refusal is structural rather than load-driven. Three arms saturate inside the band and two of them below this budget, so nearest-car and destination-panel are UNQUOTABLE here with their ceilings printed. The band floor binds the budget: the spread would buy a 1.0 s half-width at 36, and CLAUDE.md does not permit 36.',
  }),
  Object.freeze({
    id: 'vertical-city-up-peak',
    label: 'Vertical City, up-peak 1 %',
    building: 'vertical-city',
    pattern: 'up-peak' as const,
    traffic: upPeak('up-peak-1pct', 1),
    replications: 50,
    budgetBasis: Object.freeze({
      bindingArmId: 'zoned-uppeak',
      sdOfDifference: 2.9722,
      unclampedReplications: 34,
      clamped: 'floor' as const,
    }),
    admissibleReplications: undefined,
    armCeilings: Object.freeze({ 'nearest-car': 109 }),
    rationale:
      'The fifth building, at 1 % rather than 2 %: censused at 2 % the BASELINE loses its AWT at replication 46, below the 50-replication floor, so that point cannot carry an admissible budget at all and 1 % is the rate at which it can. Every run of this building carries the standing double-deck disclaimer — its eight shuttle cars are configured double-deck and simulated single-deck — so every figure in this row is for a machine nobody ordered, and that is a property of the building rather than of this matrix.',
  }),
]);

/** One (building, traffic) that was censused and is deliberately not a matrix cell. */
export interface ExcludedCell {
  readonly id: string;
  readonly building: string;
  /** The measurement that excludes it. Never a tolerance, never a preference. */
  readonly mechanism: string;
}

/**
 * Points censused at n = 200 and excluded, each by a measured mechanism.
 *
 * Recorded because an operating point dropped without one is indistinguishable from an operating
 * point dropped because it gave an inconvenient answer — and because two of the four are
 * *reproductions* of findings this project already had, which is how a survey checks its own
 * apparatus against the studies it is meant to generalize.
 */
export const EXCLUDED_CELLS: readonly ExcludedCell[] = Object.freeze([
  Object.freeze({
    id: 'secure-interfloor-mix',
    building: 'secure-tower',
    mechanism:
      'Every conventional arm is structurally unquotable, reproducing arms.ts § DESTINATION_CASES exactly: at 1.5 % over 1800 s the baseline saturates on 177 of 200 replications from index 0, and so do nine of the eleven arms. An access-restricted pickup carries no credential under up-down buttons, so the call is permanently unassignable and lowering the rate does not rescue it. Only destination-eta and destination-panel complete cleanly, which is the finding rather than a reason to lower a threshold — with an unquotable baseline the whole table is UNQUOTABLE and there is nothing for a matrix row to say.',
  }),
  Object.freeze({
    id: 'garden-up-peak',
    building: 'garden-apartments',
    mechanism:
      'At 2 % the peak-5min window is invalid on 57 of 200 replications for every one of the twelve arms simultaneously, and at 4 % the invalidity is worse; the paired difference cannot even be formed because both sides carry NaN at the same replication indices. This reproduces arms.ts § 2: a two-car six-floor shaft at a sparse residential rate has a handful of arrivals in any 300 s window. Garden is represented by two full-run cells instead.',
  }),
  Object.freeze({
    id: 'vertical-city-up-peak-2pct',
    building: 'vertical-city',
    mechanism:
      'The BASELINE loses its AWT at replication 46, below CLAUDE.md\'s 50-replication floor, so there is no admissible budget at this point — not an under-budgeted cell but an inadmissible one. destination-panel is worse still, first invalid at replication 3 with 39 of 200 saturated. The building appears at 1 % instead, where every arm but nearest-car is clean across the census.',
  }),
  Object.freeze({
    id: 'mixed-use-mixed-40-30-30',
    building: 'mixed-use-high-rise',
    mechanism:
      'DECISIONS.md § D100 established that this building\'s own mixed scenario admits no paired comparison: every role: "baseline" profile is 0/30 quotable and the unserved fraction RISES as the load falls, which is a structural refusal rather than overload. Re-checked rather than assumed; the incoming-only up-peak cell is the comparable regime and is in the matrix.',
  }),
]);

/** The cell of this id. @throws Error when there is none. */
export function matrixCell(id: string): MatrixCell {
  const found = MATRIX_CELLS.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(
      `No matrix cell "${id}". Known: ${MATRIX_CELLS.map((entry) => entry.id).join(', ')}.`,
    );
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * Results
 * -------------------------------------------------------------------------- */

/** Two arms whose paired correlation puts them in docs/07 § 4's near-neighbour regime. */
export interface NearNeighbourPair {
  readonly armId: string;
  readonly baselineId: string;
  readonly correlation: number;
  /** The half-width this pair actually achieved at this cell's budget, seconds. */
  readonly achievedHalfWidthS: number;
}

/** One cell's whole table: the verdicts, the front, and what the apparatus could not separate. */
export interface MatrixCellResult {
  readonly cell: MatrixCell;
  /** Every arm against the baseline on every metric, with an explicit verdict per cell. */
  readonly caseResult: CaseResult;
  /**
   * The Pareto front over (AWT, energy, WT95) — **three axes, all active**.
   *
   * Built over the conventional-model arms only. `destination-panel` is excluded and named in
   * {@link modelExcludedArms}, because two of the three axes are on core's own
   * `MODEL_SENSITIVE_METRIC_IDS` list: under a landing panel, "wait" contains the walk to a named
   * car and excludes the option of boarding whichever car arrives first, so a front that ranked it
   * against conventional arms on AWT would be ordering two different quantities. Its comparable
   * metrics — energy and TTD — are still reported in {@link caseResult}, with verdicts.
   */
  readonly front: ParetoFront;
  /** Arms held out of the front because their passenger model makes two of its axes incomparable. */
  readonly modelExcludedArms: readonly string[];
  /**
   * Every arm held out of the front, with the reason, in one place.
   *
   * Two reasons occur: the passenger-model exclusion above, and **an arm the table reports
   * `UNQUOTABLE`**. The second is a deliberate refusal to run a second quotability rule alongside
   * the first. `pareto.ts` decides on its own `maxInvalidFraction`, which tolerates a minority of
   * invalid replications and quotes the mean of the rest; `CellAggregate.awtIsValid` is
   * all-or-nothing. Left alone the two disagree, and the disagreement is not cosmetic — it put
   * `nearest-car` on the Midtown down-peak front while the same arm read `UNQUOTABLE` in every
   * cell of the same table, one page apart. One study, one rule: the table's.
   */
  readonly frontExclusions: readonly FrontExclusion[];
  /** Arms whose own AWT was invalid at this budget, with the census index that predicted it. */
  readonly unquotableArms: readonly string[];
  /** Arms that produced bit-identical runs to one another, as equivalence classes of size > 1. */
  readonly identityClasses: readonly (readonly string[])[];
  readonly nearNeighbourPairs: readonly NearNeighbourPair[];
  /** Whether every arm's replication `i` really saw the baseline's replication `i` population. */
  readonly crnAligned: boolean;
}

/** One arm kept out of the front, and why. */
export interface FrontExclusion {
  readonly armId: string;
  readonly reason: 'passenger-model' | 'unquotable';
  readonly detail: string;
}

/** ρ at or above which a pair counts as docs/07 § 4's near-neighbour regime. */
export const NEAR_NEIGHBOUR_CORRELATION = 0.95;

/**
 * Run one cell: baseline plus every arm, one experiment, CRN throughout, then the front.
 *
 * The front is computed from the **same** experiment the verdicts come from — never a second run —
 * so a candidate's position on the front and its verdict in the table are two readings of one set
 * of replications rather than two measurements that could disagree.
 */
export async function runMatrixCell(
  cell: MatrixCell,
  options: { readonly resources?: ExperimentResources | undefined } = {},
): Promise<MatrixCellResult> {
  const spec: BenchmarkCase = {
    id: cell.id,
    label: cell.label,
    building: cell.building,
    traffic: cell.traffic,
    replications: cell.replications,
    admissibleReplications: cell.admissibleReplications,
    rationale: cell.rationale,
  };

  const caseResult = await runBenchmarkCase(spec, {
    seed: MATRIX_SEED,
    baseline: MATRIX_BASELINE,
    arms: MATRIX_ARM_PROFILES,
    metrics: MATRIX_METRICS,
    ...(options.resources === undefined ? {} : { resources: options.resources }),
  });

  const sensitive = new Set(MODEL_SENSITIVE_METRIC_IDS);
  const frontAxesAreModelSensitive = ['awtS', 'wt95S'].some((id) => sensitive.has(id));
  const modelExcluded = frontAxesAreModelSensitive ? ['destination-panel'] : [];

  const exclusions: FrontExclusion[] = [];
  for (const armId of modelExcluded) {
    exclusions.push(
      Object.freeze({
        armId,
        reason: 'passenger-model' as const,
        detail:
          'the landing panel names a car per passenger, so awt and wt95 — two of the three axes — are on core\'s MODEL_SENSITIVE_METRIC_IDS list and measure a different construct here than they do for a conventional arm. Its comparable metrics (energy, TTD) are still in the table with verdicts.',
      }),
    );
  }
  for (const armId of caseResult.unquotableArms) {
    if (modelExcluded.includes(armId)) continue;
    const ceiling = cell.armCeilings[armId];
    exclusions.push(
      Object.freeze({
        armId,
        reason: 'unquotable' as const,
        detail:
          `the table reports every cell of this arm UNQUOTABLE (${armOf(caseResult, armId).quotabilityReason ?? 'AWT invalid'})` +
          (ceiling === undefined
            ? ', and the 200-replication census recorded no ceiling for it, so this is new'
            : `, as the census predicted: first invalid replication index ${String(ceiling)}, against a budget of ${String(cell.replications)}`),
      }),
    );
  }
  const excludedIds = new Set(exclusions.map((entry) => entry.armId));

  const frontArmIds = [MATRIX_BASELINE, ...MATRIX_ARM_PROFILES].filter(
    (armId) => !excludedIds.has(armId),
  );
  const candidates: readonly CandidateEvaluation[] = Object.freeze(
    frontArmIds.map((armId) =>
      Object.freeze({
        candidateId: armId,
        tuning: seedSetFromReplications(cellOf(caseResult.experiment, armId).replications, {
          seedSetId: `${cell.id}@${String(MATRIX_SEED)}`,
          role: 'tuning' as const,
          energyProxyOf: (replication) => replication.summary.energy.workKJ,
        }),
      }),
    ),
  );
  const front = statisticalParetoFront({ candidates, role: 'tuning' });

  const baselineAwt = samplesFor(caseResult, MATRIX_BASELINE, 'awtS');
  const nearNeighbourPairs: NearNeighbourPair[] = [];
  for (const armId of MATRIX_ARM_PROFILES) {
    const armAwt = samplesFor(caseResult, armId, 'awtS');
    if (armAwt.length !== baselineAwt.length) continue;
    if (armAwt.some((value) => !Number.isFinite(value))) continue;
    if (baselineAwt.some((value) => !Number.isFinite(value))) continue;
    const paired = comparePaired('awtS', armAwt, baselineAwt);
    if (!(paired.correlation >= NEAR_NEIGHBOUR_CORRELATION)) continue;
    nearNeighbourPairs.push(
      Object.freeze({
        armId,
        baselineId: MATRIX_BASELINE,
        correlation: paired.correlation,
        achievedHalfWidthS: (paired.estimate.upper - paired.estimate.lower) / 2,
      }),
    );
  }

  return Object.freeze({
    cell,
    caseResult,
    front,
    modelExcludedArms: Object.freeze(modelExcluded),
    frontExclusions: Object.freeze(exclusions),
    unquotableArms: caseResult.unquotableArms,
    identityClasses: Object.freeze(
      caseResult.identityClasses.filter((members) => members.length > 1),
    ),
    nearNeighbourPairs: Object.freeze(nearNeighbourPairs),
    crnAligned: caseResult.crnAligned,
  });
}

/** Every cell in {@link MATRIX_CELLS}, serially, sharing one loaded `data/` directory. */
export async function runMatrix(
  options: { readonly resources?: ExperimentResources | undefined } = {},
): Promise<readonly MatrixCellResult[]> {
  const resources = options.resources ?? (await loadResources());
  const results: MatrixCellResult[] = [];
  for (const cell of MATRIX_CELLS) results.push(await runMatrixCell(cell, { resources }));
  return Object.freeze(results);
}

/* -------------------------------------------------------------------------- *
 * Reading a matrix
 * -------------------------------------------------------------------------- */

function samplesFor(
  result: CaseResult,
  armId: string,
  metric: ReplicationMetric,
): readonly number[] {
  return cellOf(result.experiment, armId).replications.map(
    (replication) => replication.metrics[metric] ?? Number.NaN,
  );
}

/** The cell result of this id. @throws Error when the matrix has none. */
export function cellResult(
  results: readonly MatrixCellResult[],
  id: string,
): MatrixCellResult {
  const found = results.find((entry) => entry.cell.id === id);
  if (found === undefined) {
    throw new Error(
      `No matrix result for cell "${id}". Present: ${results.map((entry) => entry.cell.id).join(', ')}.`,
    );
  }
  return found;
}
