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
 * *"Every front"* became true rather than aspirational when {@link PINNED_FRONTS} landed: until then
 * the always-on tier checked the front's **structure** — three active axes, nothing in two buckets,
 * every exclusion named — and not a single one of its **memberships**, which is the half a reader
 * quotes. See § *The categorical publication pin* at the foot of this file for the instance that
 * says why the distinction is not pedantry.
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
import { MATRIX_CELLS, type MatrixCell } from './matrixCells.js';
import { armOf, runBenchmarkCase, type CaseResult } from './suite.js';

/*
 * The cells live in `./matrixCells.ts` since Everyday Mode's slice 7 (a decision number is owed;
 * the argument is that module's docstring): the suite in `packages/viz` must import the fixture
 * list rather than retype it, and this module is not browser-safe — `validation/harness.ts`
 * reaches `node:url` — while the cells are pure data. Re-exported here so every existing consumer,
 * pin and document reference keeps its import path, byte-identical.
 */
export { EXCLUDED_CELLS, MATRIX_CELLS, matrixCell } from './matrixCells.js';
export type { BudgetBasis, ExcludedCell, MatrixCell } from './matrixCells.js';

/* -------------------------------------------------------------------------- *
 * Arms
 * -------------------------------------------------------------------------- */

/**
 * The matrix's reference arm.
 *
 * `collective` rather than `eta` among the two docs/07 § 4 permits, for a reason that is measured
 * rather than aesthetic: `eta` is bit-identical to at least one other shipped profile at most cells
 * — to `fairness-first` at six, and, when this matrix was first run, to `destination-eta` at
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
 * unaffected — `fairness-first` is still identical to `eta` at six cells — and is left alone.
 *
 * **Both counts read *five* until 2026-07-30, and the correction is measured rather than editorial.**
 * `PINNED_FRONTS` holds the class at `midtown-up-peak`, `garden-residential`, `garden-down-peak`,
 * `secure-up-peak`, `mixed-use-up-peak` **and** `vertical-city-up-peak`; `docs/05-roadmap.md`
 * § *What the matrix found* has said six since § D131 made the decks simulated, and named that cell
 * as the sixth. This file was the copy that did not move. It is the same shape as the front row the
 * same event moved and nothing re-derived — `matrixFront.test.ts` § *the drift register* — one level
 * down, in a source docstring instead of a document.
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

/* -------------------------------------------------------------------------- *
 * The categorical publication pin — what the interval pins structurally cannot see
 * -------------------------------------------------------------------------- */

/**
 * One cell's whole categorical result, keyed as a set rather than as a number.
 *
 * ## Why this exists, and why `PINNED_ESTIMATES` was never going to catch it
 *
 * `published.ts` pins every **interval** this matrix produces — 352 of them, five fields each, and
 * `matrix.test.ts` compares all of them against a fresh full-budget run on every always-on suite.
 * That guard is real and it is green. It is also **blind to the Pareto front by construction**, and
 * the blindness is not a matter of degree:
 *
 * - A pinned figure is an arm's paired difference against {@link MATRIX_BASELINE}. The front is
 *   decided by comparing arms **against each other**, over three axes, by
 *   `tuning/report/pareto.ts`'s dominance rule.
 * - The front's energy axis is the *raw* per-replication `summary.energy.workKJ` read through
 *   `seedSetFromReplications`, not the `energyKJ` paired estimate the pin holds.
 * - So a change in the dominance rule, in `pareto.ts`'s `maxInvalidFraction`, in the energy proxy's
 *   wiring, or in `MODEL_SENSITIVE_METRIC_IDS` moves the published front **with every one of
 *   the 352 pins unchanged**, and nothing turns red.
 *
 * **That is not hypothetical — it has already happened, in the other direction.** `7fac568` gave
 * `core` a non-elevator transport mode and stopped charging `vertical-city`'s lobby hop to the
 * lifts. It correctly regenerated that cell's 44 interval pins (`eta`'s AWT against the baseline
 * moved from `+0.811 s` to `+1.066 s`, an interval that no longer spans zero on the same side), and
 * the front at `vertical-city-up-peak` moved with them — `eta`, `fairness-first` and
 * `destination-eta` are on it now and were not before. `docs/05-roadmap.md` § *What the matrix
 * found* still prints the pre-`7fac568` row. Nothing was hidden and nothing was careless: **there
 * was simply no mechanism.** `matrixFront.test.ts` § *the drift register* is that mechanism, and
 * carries the row.
 *
 * This is § D149's shape one study over — a categorical figure with no standard error, guarded
 * field-for-field through a pin table and rendered into the vocabulary a published table row must
 * come from — with `accessControl.ts`'s `PinnedCoverage` as the precedent.
 *
 * ## What a pin is and is not
 *
 * A pin is **not** a criterion. `matrix.test.ts` § *what is asserted* is explicit that which arm
 * wins where is the output of this study rather than its precondition, and that stands: nothing here
 * asserts that `nearest-car` *ought* to be on any front. What is asserted is that the front the code
 * produces today is the front this repository publishes, so that a move is a **question** — which of
 * the two is right — rather than a silence.
 */
export interface PinnedFront {
  /** The cell's budget, so a front can never be read against the wrong `n` (finding #4's shape). */
  readonly replications: number;
  /** Ids nothing significantly beats on every active axis. */
  readonly front: readonly string[];
  readonly dominated: readonly string[];
  readonly indeterminate: readonly string[];
  /** Arms whose own AWT was invalid at this budget — held out of the front by the table's rule. */
  readonly unquotable: readonly string[];
  /** Arms held out because their passenger model makes two of the three axes incomparable. */
  readonly modelExcluded: readonly string[];
  /**
   * Bit-identity classes, as equivalence classes of size > 1.
   *
   * Pinned because they are published — `docs/05` § *What the matrix found* prints all four with
   * their cells — and because an identity class is the one finding this project has twice had to
   * treat as a wiring bug. `matrix.test.ts` asserts the `eta`/`destination-eta` pair specifically
   * and asserts *structural* properties of the rest; the classes themselves were unpinned.
   */
  readonly identityClasses: readonly (readonly string[])[];
  /**
   * How many (arm, metric) cells landed on each verdict.
   *
   * Layer A only — no published rendering quotes it. It is here because `verdict.ts` decides a
   * verdict from an interval **and a resolution limit**, so a change to the second moves every
   * verdict in the table while every pinned interval stays put. The counts are the cheapest thing
   * that sees it.
   */
  readonly verdicts: Readonly<Record<string, number>>;
}

/** Members in a canonical order, so a pin compares as the set it is. */
const canonicalMembers = (members: readonly string[]): readonly string[] =>
  Object.freeze([...members].sort());

/**
 * Two member lists, compared element by element and then by length.
 *
 * Element-wise rather than by a joined string, and the reason is a real trap rather than taste: any
 * separator character orders `['a', 'b']` against `['ab', 'x']` according to whether the separator
 * sorts before or after `b`, so the class order — and therefore the pin — would depend on which
 * delimiter happened to be chosen. No shipped profile id collides that way today, which is exactly
 * how such a thing survives to bite the commit that adds the id that does.
 */
const compareMembers = (a: readonly string[], b: readonly string[]): number => {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const left = a[index] ?? '';
    const right = b[index] ?? '';
    if (left !== right) return left < right ? -1 : 1;
  }
  return a.length - b.length;
};

/**
 * A measured cell as a pin.
 *
 * Every membership is **sorted**, deliberately: the order `pareto.ts` returns is an artefact of the
 * order candidates were built in, which is `[MATRIX_BASELINE, ...MATRIX_ARM_PROFILES]` and is
 * already asserted in `matrix.test.ts`. Comparing unsorted would make a reordering of that list —
 * a change with no effect on any result — read as eight simultaneous front changes.
 * {@link publishedFrontRow} puts the publication order back when it renders.
 */
export function frontPinOf(result: MatrixCellResult): PinnedFront {
  const verdicts: Record<string, number> = {};
  for (const arm of result.caseResult.arms) {
    for (const cell of arm.cells) verdicts[cell.verdict] = (verdicts[cell.verdict] ?? 0) + 1;
  }
  const classes = result.identityClasses
    .map((members) => canonicalMembers(members))
    .sort(compareMembers);
  return Object.freeze({
    replications: result.cell.replications,
    front: canonicalMembers(result.front.front),
    dominated: canonicalMembers(result.front.dominated),
    indeterminate: canonicalMembers(result.front.indeterminate),
    unquotable: canonicalMembers(result.unquotableArms),
    modelExcluded: canonicalMembers(result.modelExcludedArms),
    identityClasses: Object.freeze(classes),
    verdicts: Object.freeze({ ...verdicts }),
  });
}

/**
 * Every cell's categorical result, keyed by cell id.
 *
 * Produced by `runMatrix()` on 2026-07-30 at the shipped defaults — no reduced budget, no sampled
 * subset, seed {@link MATRIX_SEED} and each cell's own declared `n`. Regenerate with
 * `matrixFront.test.ts`'s printed block, and only after answering the question a moved membership
 * asks, which is *which* of the two is right. A front regenerated to make a suite green has
 * destroyed the only thing this table is for.
 */
export const PINNED_FRONTS: Readonly<Record<string, PinnedFront>> = Object.freeze({
  "midtown-up-peak": Object.freeze({
    replications: 81,
    front: Object.freeze(["capacity-aware", "destination-eta", "energy-aware", "nearest-car"]),
    dominated: Object.freeze(["auction", "auction-multi-round", "collective", "eta", "fairness-first", "predictive-balanced", "zoned-uppeak"]),
    indeterminate: Object.freeze([]),
    unquotable: Object.freeze([]),
    modelExcluded: Object.freeze(["destination-panel"]),
    identityClasses: Object.freeze([Object.freeze(["eta", "fairness-first"])]),
    verdicts: Object.freeze({ "BETTER": 6, "INDISTINGUISHABLE": 23, "WORSE": 15 }),
  }),
  "midtown-down-peak": Object.freeze({
    replications: 78,
    front: Object.freeze(["destination-eta", "energy-aware", "eta", "fairness-first", "zoned-uppeak"]),
    dominated: Object.freeze(["auction", "auction-multi-round", "capacity-aware", "collective", "predictive-balanced"]),
    indeterminate: Object.freeze([]),
    unquotable: Object.freeze(["nearest-car"]),
    modelExcluded: Object.freeze(["destination-panel"]),
    identityClasses: Object.freeze([]),
    verdicts: Object.freeze({ "BETTER": 18, "INDISTINGUISHABLE": 9, "UNQUOTABLE": 4, "WORSE": 13 }),
  }),
  "midtown-interfloor": Object.freeze({
    replications: 200,
    front: Object.freeze(["energy-aware", "eta", "nearest-car"]),
    dominated: Object.freeze(["auction", "auction-multi-round", "capacity-aware", "collective", "destination-eta", "fairness-first", "predictive-balanced", "zoned-uppeak"]),
    indeterminate: Object.freeze([]),
    unquotable: Object.freeze([]),
    modelExcluded: Object.freeze(["destination-panel"]),
    identityClasses: Object.freeze([]),
    verdicts: Object.freeze({ "BETTER": 23, "INDISTINGUISHABLE": 3, "WORSE": 18 }),
  }),
  "garden-residential": Object.freeze({
    replications: 65,
    front: Object.freeze(["collective", "energy-aware", "nearest-car", "zoned-uppeak"]),
    dominated: Object.freeze(["auction", "auction-multi-round", "capacity-aware", "destination-eta", "eta", "fairness-first", "predictive-balanced"]),
    indeterminate: Object.freeze([]),
    unquotable: Object.freeze([]),
    modelExcluded: Object.freeze(["destination-panel"]),
    identityClasses: Object.freeze([Object.freeze(["auction", "auction-multi-round"]), Object.freeze(["capacity-aware", "destination-eta"]), Object.freeze(["eta", "fairness-first"])]),
    verdicts: Object.freeze({ "BETTER": 4, "INDISTINGUISHABLE": 25, "WORSE": 15 }),
  }),
  "garden-down-peak": Object.freeze({
    replications: 51,
    front: Object.freeze(["auction", "auction-multi-round", "capacity-aware", "collective", "destination-eta", "energy-aware", "eta", "fairness-first", "nearest-car", "zoned-uppeak"]),
    dominated: Object.freeze(["predictive-balanced"]),
    indeterminate: Object.freeze([]),
    unquotable: Object.freeze([]),
    modelExcluded: Object.freeze(["destination-panel"]),
    identityClasses: Object.freeze([Object.freeze(["auction", "auction-multi-round"]), Object.freeze(["destination-eta", "destination-panel", "eta", "fairness-first"])]),
    verdicts: Object.freeze({ "BETTER": 4, "INDISTINGUISHABLE": 32, "WORSE": 8 }),
  }),
  "secure-up-peak": Object.freeze({
    replications: 119,
    front: Object.freeze(["energy-aware", "nearest-car"]),
    dominated: Object.freeze(["auction", "auction-multi-round", "capacity-aware", "collective", "destination-eta", "eta", "fairness-first", "predictive-balanced", "zoned-uppeak"]),
    indeterminate: Object.freeze([]),
    unquotable: Object.freeze([]),
    modelExcluded: Object.freeze(["destination-panel"]),
    identityClasses: Object.freeze([Object.freeze(["eta", "fairness-first"])]),
    verdicts: Object.freeze({ "BETTER": 4, "INDISTINGUISHABLE": 20, "WORSE": 20 }),
  }),
  "mixed-use-up-peak": Object.freeze({
    replications: 50,
    front: Object.freeze(["energy-aware"]),
    dominated: Object.freeze(["auction", "auction-multi-round", "capacity-aware", "collective", "destination-eta", "eta", "fairness-first", "predictive-balanced", "zoned-uppeak"]),
    indeterminate: Object.freeze([]),
    unquotable: Object.freeze(["nearest-car"]),
    modelExcluded: Object.freeze(["destination-panel"]),
    identityClasses: Object.freeze([Object.freeze(["eta", "fairness-first"])]),
    verdicts: Object.freeze({ "BETTER": 6, "INDISTINGUISHABLE": 19, "UNQUOTABLE": 4, "WORSE": 15 }),
  }),
  "vertical-city-up-peak": Object.freeze({
    replications: 50,
    front: Object.freeze(["collective", "energy-aware", "eta", "fairness-first", "nearest-car"]),
    dominated: Object.freeze(["auction", "auction-multi-round", "capacity-aware", "destination-eta", "predictive-balanced", "zoned-uppeak"]),
    indeterminate: Object.freeze([]),
    unquotable: Object.freeze([]),
    modelExcluded: Object.freeze(["destination-panel"]),
    identityClasses: Object.freeze([Object.freeze(["eta", "fairness-first"])]),
    verdicts: Object.freeze({ "BETTER": 8, "INDISTINGUISHABLE": 4, "WORSE": 32 }),
  }),
});

/**
 * Compare a freshly-run matrix against {@link PINNED_FRONTS}, in both directions.
 *
 * Returns one human-readable line per disagreement, empty when there is none. Both directions for
 * `checkPinned`'s stated reason: a cell the pin table has and the matrix no longer produces is as
 * much a change as a membership that moved, and it is the one a "check every pin" loop tolerates.
 */
export function checkFrontPins(results: readonly MatrixCellResult[]): readonly string[] {
  const failures: string[] = [];
  const measured = new Map(results.map((result) => [result.cell.id, frontPinOf(result)]));

  const sets = ['front', 'dominated', 'indeterminate', 'unquotable', 'modelExcluded'] as const;
  for (const [cellId, pin] of Object.entries(PINNED_FRONTS)) {
    const found = measured.get(cellId);
    if (found === undefined) {
      failures.push(`${cellId}: pinned, but the matrix no longer produces this cell`);
      continue;
    }
    if (found.replications !== pin.replications) {
      failures.push(
        `${cellId}.replications: pinned ${String(pin.replications)}, measured ${String(found.replications)}`,
      );
    }
    for (const field of sets) {
      const a = pin[field].join(', ');
      const b = found[field].join(', ');
      if (a !== b) failures.push(`${cellId}.${field}: pinned [${a}], measured [${b}]`);
    }
    const pinnedClasses = pin.identityClasses.map((members) => members.join('+')).join(' | ');
    const foundClasses = found.identityClasses.map((members) => members.join('+')).join(' | ');
    if (pinnedClasses !== foundClasses) {
      failures.push(
        `${cellId}.identityClasses: pinned {${pinnedClasses}}, measured {${foundClasses}}`,
      );
    }
    const verdictKeys = [...new Set([...Object.keys(pin.verdicts), ...Object.keys(found.verdicts)])].sort();
    for (const verdict of verdictKeys) {
      if ((pin.verdicts[verdict] ?? 0) !== (found.verdicts[verdict] ?? 0)) {
        failures.push(
          `${cellId}.verdicts.${verdict}: pinned ${String(pin.verdicts[verdict] ?? 0)}, measured ${String(found.verdicts[verdict] ?? 0)}`,
        );
      }
    }
  }
  for (const cellId of measured.keys()) {
    if (!(cellId in PINNED_FRONTS)) {
      failures.push(`${cellId}: produced by the matrix but not pinned`);
    }
  }
  return Object.freeze(failures);
}

/**
 * A cell's front exactly as `docs/05-roadmap.md` § *What the matrix found* prints one: the member
 * ids, comma-separated, in `[MATRIX_BASELINE, ...MATRIX_ARM_PROFILES]` order.
 *
 * The pin stores the front as a **set** and this restores the publication's **order**, which is the
 * arm order the table is read in. Doing it here rather than in the pin is what keeps a reordering
 * of `MATRIX_ARM_PROFILES` from reading as a result change: it would move every rendered row and no
 * pinned membership.
 */
export function publishedFrontRow(pin: PinnedFront): string {
  const members = new Set(pin.front);
  return [MATRIX_BASELINE, ...MATRIX_ARM_PROFILES].filter((armId) => members.has(armId)).join(', ');
}

/**
 * The vocabulary a published per-cell front row must be renderable from, keyed by cell id.
 *
 * `accessControl.ts`'s `derivedCoverageForms` for a different categorical. One rendering per
 * cell and no second precision: unlike a coverage percentage there is nothing here to round, so a
 * row either is the derived membership or it is a claim about a run this tree does not produce.
 */
export function derivedFrontRows(): ReadonlyMap<string, string> {
  const rows = new Map<string, string>();
  for (const [cellId, pin] of Object.entries(PINNED_FRONTS)) {
    rows.set(cellId, publishedFrontRow(pin));
  }
  return rows;
}

/**
 * The cells where `armId` is on the front, in {@link MATRIX_CELLS} order.
 *
 * This is what the sentence *"`nearest-car` is on the Pareto front at six of eight cells"* — which
 * this repository states as fact in more than twenty places, and which `DECISIONS.md` § D106 makes
 * the entire reason energy may be an axis and never a score — is a claim about. Derived from the
 * pin table so the count and the two exceptions are both re-derived rather than transcribed.
 */
export function frontMembershipCells(armId: string): readonly string[] {
  return Object.freeze(
    MATRIX_CELLS.filter((cell) => PINNED_FRONTS[cell.id]?.front.includes(armId) === true).map(
      (cell) => cell.id,
    ),
  );
}
