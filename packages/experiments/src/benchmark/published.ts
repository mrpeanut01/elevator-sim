/**
 * **The publication guard.** Every confidence interval this package prints must be re-derivable
 * from a study that is still in the tree, at full precision, and must still round to the digits the
 * file actually shows.
 *
 * ## Why this module exists
 *
 * Three separate instances are now on record of *a published benchmark number that the code does
 * not produce*, and **nothing in the suite could fail on any of them**:
 *
 * | instance | shape | how it was found |
 * |---|---|---|
 * | review finding #4 | an `n = 300` interval published inside an `n = 500` table | code review |
 * | `tailStudy.ts` header, `docs/05-roadmap.md:380` | 11 intervals measured before `c237d95` wired stage 5 and stage 7 into the run loop, never regenerated | T6 recomputing the *old* bound during the T2 blast radius |
 * | `index.ts` § 7, two bounds | `+1.11` and `+0.27` where the estimate renders `+1.10` and `+0.26` — a **double rounding**, 3 dp then 2 dp | the same recomputation |
 *
 * The first two move the estimate; the third does not move it at all and lives entirely in the
 * printed text. **A guard that checked only one of those two layers would miss the other**, so this
 * one checks both:
 *
 * - **Layer A — the estimate.** {@link PINNED_ESTIMATES} records `n`, `mean`, `standardError`,
 *   `lower` and `upper` at full double precision for every figure the shipped study entry points
 *   produce. `assertPinned` compares a freshly-run study against it. Pinning `n` is what catches
 *   finding #4's shape; pinning the mean is what catches the `tailStudy.ts` shape; pinning the
 *   bounds is what catches a quantile change (T2 finding #14) without re-deriving the quantile
 *   here, which would only test this file against itself.
 * - **Layer B — the publication.** {@link publishedForm} renders a pinned estimate exactly the way
 *   this package's docstrings write one, and `published.test.ts` scans every `.ts` file under
 *   `benchmark/` for interval-shaped literals and requires each one to be either derivable from a
 *   pin or listed in {@link UNPINNED_INTERVALS} with a reason. The partition is asserted **exact in
 *   both directions**, so a literal cannot go unaccounted for and an allowlist entry cannot go
 *   stale.
 *
 * ## Cost, and why the guard is not one big suite
 *
 * The studies behind these numbers cost 60–140 s of simulation between them, and *the existing
 * suites already pay it* — `dispatcherBenchmark.test.ts`, `tailStudy.test.ts`,
 * `prepositioning.test.ts`, `capacityReassignment.test.ts` and `predictorLag.test.ts` each run
 * their study once and cache it. So Layer A is checked **inside those suites**, against the study
 * they already hold, and costs nothing measurable. Layer B is a source scan and costs
 * milliseconds. A guard that doubled the suite's runtime is a guard somebody eventually passes
 * `--exclude` to.
 *
 * `published.test.ts` holds what is left: the domain totality, the rendering, the scan, and a check
 * that every study id in the domain really is handed to `assertPinned` somewhere — because a pin
 * table nobody calls is the same defect one level up (`CLAUDE.md` § *the integration seam has an
 * owner*: **name the non-test caller** — here the callers are tests by construction, so the
 * enforcement is that they exist and are enumerated from the domain rather than by hand).
 *
 * ## Regenerating
 *
 * `PINNED_ESTIMATES` is generated, never typed. When a change legitimately moves a number, run
 *
 * ```
 * node packages/experiments/dist/benchmark/regeneratePins.js
 * ```
 *
 * and paste its output, then update the docstrings the scan will now reject. Regenerating without
 * looking at the diff defeats the entire point of the file: the question a moved pin asks is
 * *which of the two numbers is correct*, and only a human answers that.
 */

import type { MeanEstimate } from '../reports/types.js';

import type { ReplicationMetric } from '../runner/metrics.js';
import { comparePaired, samplesOf } from '../validation/harness.js';

import type { AccessControlStudy } from './accessControl.js';
import type { DisclosureStudy } from './destinationDisclosure.js';
import type { DispatchContrastStudy } from './destinationDispatchContrast.js';
import type { DoubleDeckStudy } from './doubleDeck.js';
import {
  DESTINATION_READING_TERMS,
  SHIPPED_DESTINATION_ARMS,
  type DownPeakDestinationStudy,
} from './downPeakDestination.js';
import type { MatrixCellResult } from './matrix.js';
import type { MixedUseStudy } from './mixedUseHighRise.js';
import type { Phase7AcceptanceStudy } from './phase7Acceptance.js';
import type { CaseResult } from './suite.js';
import type { PrepositioningStudy } from './prepositioning.js';
import type { Stage5Study } from './capacityReassignment.js';
import type { ForecastCausalityAudit } from './predictorLag.js';
import type { TailStudy } from './tailStudy.js';
import type { SelectionStudy } from './weightSetSelection.js';
import type { SelectionSweep } from './selectionSweep.js';
import type { LunchTwoWaySelectionStudy } from './lunchTwoWaySelection.js';

/* -------------------------------------------------------------------------- *
 * The domain
 * -------------------------------------------------------------------------- */

/**
 * Every shipped study entry point that publishes an interval.
 *
 * A categorical, iterated by its own domain rather than by a hand-written list, following
 * `core/src/sim/seam.test.ts`. {@link PINNED_ESTIMATES} is a `Record` over it, so a value added
 * here does not compile until it has a pin table, and `published.test.ts` cross-checks the domain
 * against the module's own exports so a study added to `benchmark/` cannot stay uncovered.
 */
export const PUBLISHED_STUDY_IDS = Object.freeze([
  'benchmark',
  'tail',
  'prepositioning',
  'capacity-reassignment',
  'forecast-causality',
  'destination-disclosure',
  'destination-dispatch',
  'access-control',
  'mixed-use-high-rise',
  'matrix',
  'phase7-acceptance',
  'down-peak-destination',
  'weight-set-selection',
  'selection-sweep',
  'lunch-two-way-selection',
  'double-deck',
] as const);

export type PublishedStudyId = (typeof PUBLISHED_STUDY_IDS)[number];

/**
 * Arm-to-arm comparisons the report publishes alongside the arm-versus-baseline table.
 *
 * `suite.ts` compares every arm against the baseline and nothing against anything else, but
 * `index.ts` § 3 and § 7 both quote a difference between two *arms* — which is sound under CRN
 * because both arms are cells of the same experiment. Declared here so the pin table covers them by
 * iteration rather than because somebody remembered.
 */
export const PUBLISHED_ARM_PAIRS: readonly (readonly [string, string])[] = Object.freeze([
  Object.freeze(['predictive-balanced', 'eta'] as const),
  Object.freeze(['auction-multi-round', 'auction'] as const),
]);

/* -------------------------------------------------------------------------- *
 * The pin
 * -------------------------------------------------------------------------- */

/**
 * One published figure, at the precision the estimate was computed at rather than printed at.
 *
 * Five numbers and not one: `mean` alone would miss a quantile change, the bounds alone would miss
 * a drift smaller than a printed digit, and `n` alone is what finding #4 turned on — an interval
 * computed at one budget and published in another budget's table.
 */
export interface PinnedEstimate {
  readonly n: number;
  readonly mean: number;
  readonly standardError: number;
  readonly lower: number;
  readonly upper: number;
}

/**
 * Relative tolerance for a pin match.
 *
 * ## The premise this used to rest on, and why it was only half true
 *
 * It read: *"The studies are deterministic from their seeds — same seed, same doubles, in the same
 * order — so the honest tolerance is zero"*, and set `1e-12` as a concession to a future refactor
 * reassociating a sum.
 *
 * That is true **on one machine** and false across two. CI's two-OS matrix measured
 * `forecast-causality`'s partial correlation at `-0.013946358230608948` on x64 and
 * `-0.01394223164765208` on arm64 — the same commit, the same seed, the same replication count
 * ([§ D201](../../../../DECISIONS.md)). `1e-12` cannot absorb that, so the pin was not a claim about
 * the study; it was a claim about the machine that last regenerated it, and it inverted every time
 * the machine changed (§ D196).
 *
 * ## Why the drift is larger than float noise, and still not a difference
 *
 * `4.1e-6` absolute is far above a last-bit difference, because a study is not a formula: a
 * one-ULP difference in an arrival instant can reorder a queue, change which car answers, and
 * propagate. The divergence is *chaotic*, not merely rounding.
 *
 * It is nonetheless not a difference in any sense this project reports. That absolute gap is
 * `3e-4` **relative**, and the smallest effect the apparatus can resolve at all is a `1.9 s`
 * limit on a `~30 s` statistic — `6e-2` relative, two hundred times larger. A drift this size
 * cannot move a verdict, and no published rendering changes: `docs/05` § Phase 5 prints
 * `−0.0139 [−0.0317, +0.0038]` at 4 dp from either value.
 *
 * ## The two bounds
 *
 * `1e-6` relative with a `1e-5` absolute floor. The floor is what makes it work on a quantity that
 * lives near zero — a correlation of `0.0139` has no useful relative scale, which is exactly the
 * case that broke the old constant. Both bounds sit far below the resolution limit above and far
 * above the measured divergence, and CI's matrix is what keeps that claim honest: if a study drifts
 * further than this across the two platforms, the run says so with the measured gap rather than
 * leaving a pin to be re-inverted.
 */
export const PIN_TOLERANCE = 1e-6;

/**
 * Absolute floor, for figures whose magnitude is near zero.
 *
 * Without it, a correlation of `0.0139` would need agreement to `1.4e-8` absolute while a `1 000 s`
 * mean got `1e-3` — the tightest demand on the noisiest quantity, which is backwards.
 */
export const PIN_ABSOLUTE_FLOOR = 1e-5;

/** `true` when `actual` matches `expected` to within {@link PIN_TOLERANCE}, relatively. */
export function pinMatches(expected: number, actual: number): boolean {
  if (Number.isNaN(expected) && Number.isNaN(actual)) return true;
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) return expected === actual;
  const scale = Math.max(1, Math.abs(expected));
  return Math.abs(expected - actual) <= Math.max(PIN_TOLERANCE * scale, PIN_ABSOLUTE_FLOOR);
}

/* -------------------------------------------------------------------------- *
 * Rendering — the published form
 * -------------------------------------------------------------------------- */

/**
 * A published interval, exactly as this package's docstrings write one.
 *
 * Two conventions, both taken from the files rather than chosen here: the sign is **always**
 * explicit, and the minus is U+2212 rather than a hyphen. `report.ts`'s {@link formatInterval}
 * prints the ASCII form the console wants; this prints the prose form, and the difference between
 * them is the reason a guard that compared rendered strings to `formatInterval` output would have
 * matched nothing.
 */
export function publishedForm(estimate: PinnedEstimate, places = 2): string {
  const one = (value: number): string => {
    if (!Number.isFinite(value)) return 'n/a';
    const text = value.toFixed(places);
    return text.startsWith('-') ? `−${text.slice(1)}` : `+${text}`;
  };
  return `${one(estimate.mean)} [${one(estimate.lower)}, ${one(estimate.upper)}]`;
}

/**
 * Every rendering of every pin, at every precision the package prints at.
 *
 * Both 2 dp and 3 dp, because `index.ts` uses both — § 1's tables are 2 dp and § 4's sweeps are
 * 3 dp — and a guard that assumed one would reject the other as undeclared. The set is the
 * *vocabulary* Layer B checks published literals against.
 */
export function derivedPublishedForms(): ReadonlySet<string> {
  const forms = new Set<string>();
  for (const studyId of PUBLISHED_STUDY_IDS) {
    for (const pin of Object.values(PINNED_ESTIMATES[studyId])) {
      forms.add(publishedForm(pin, 2));
      forms.add(publishedForm(pin, 3));
    }
  }
  return forms;
}

/* -------------------------------------------------------------------------- *
 * Extractors — a study's figures, keyed structurally
 * -------------------------------------------------------------------------- */

const estimateOf = (estimate: MeanEstimate): PinnedEstimate =>
  Object.freeze({
    n: estimate.n,
    mean: estimate.mean,
    standardError: estimate.standardError,
    lower: estimate.lower,
    upper: estimate.upper,
  });

/**
 * The main table's figures, keyed `case/arm/metric` — plus `case/a−b/metric` for the two arm-to-arm
 * comparisons § 3 and § 7 publish.
 *
 * Iterates the case's own arms and its own metrics. Nothing is named here, so an arm added to
 * `ARM_PROFILES` or a metric added to `BENCHMARK_METRICS` appears in the key set immediately and
 * the totality check fails until it has a pin.
 */
export function benchmarkFigures(
  cases: readonly CaseResult[],
): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const result of cases) {
    for (const arm of result.arms) {
      for (const cell of arm.cells) {
        figures.set(`${result.caseId}/${arm.armId}/${cell.metric}`, estimateOf(cell.estimate));
      }
    }
    const metrics: readonly ReplicationMetric[] =
      result.arms[0]?.cells.map((cell) => cell.metric) ?? [];
    for (const [candidate, reference] of PUBLISHED_ARM_PAIRS) {
      const present = new Set(result.arms.map((arm) => arm.armId));
      if (!present.has(candidate) || !present.has(reference)) continue;
      for (const metric of metrics) {
        const comparison = comparePaired(
          metric,
          samplesOf(result.experiment, candidate, metric),
          samplesOf(result.experiment, reference, metric),
        );
        figures.set(
          `${result.caseId}/${candidate}−${reference}/${metric}`,
          estimateOf(comparison.estimate),
        );
      }
    }
  }
  return figures;
}

/** The tail study's figures, keyed `load/arm/metric` — the study's own three nested domains. */
export function tailFigures(study: TailStudy): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const row of study.rows) {
    for (const cell of row.cells) {
      figures.set(
        `${row.loadPctPop5min}/${cell.armId}/${cell.metric}`,
        estimateOf(cell.comparison.estimate),
      );
    }
  }
  return figures;
}

/** The pre-positioning study's figures, keyed `arm/metric`. */
export function prepositioningFigures(
  study: PrepositioningStudy,
): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const arm of study.result.arms) {
    for (const cell of arm.cells) {
      figures.set(`${arm.armId}/${cell.metric}`, estimateOf(cell.estimate));
    }
  }
  return figures;
}

/** The stage-5 study's figures, keyed `load/metric`. */
export function capacityFigures(study: Stage5Study): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const row of study.rows) {
    for (const [metric, estimate] of Object.entries(row.differences)) {
      figures.set(`${row.arrivalRatePctPop5min}/${metric}`, estimateOf(estimate));
    }
  }
  return figures;
}

/**
 * The Phase 6a disclosure study's figures, keyed `arm/metric` and `control/<id>/metric`.
 *
 * Iterates the study's own arms and its own metrics, so an arm added to `RIDE_TIME_WEIGHTS` appears
 * in the key set immediately and the totality check fails until it has a pin. The negative controls
 * are pinned too: their verdict is *part of the result* — the claim is that the same two profiles
 * that separate at the primary point do **not** separate at the shipped up-peak points — and an
 * unpinned control could drift to a difference without anything failing.
 */
export function disclosureFigures(study: DisclosureStudy): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const arm of study.arms) {
    for (const cell of arm.cells) {
      figures.set(`${arm.armId}/${cell.metric}`, estimateOf(cell.estimate));
    }
  }
  for (const control of study.negativeControls) {
    figures.set(`control/${control.id}/${control.ttd.metric}`, estimateOf(control.ttd.estimate));
  }
  return figures;
}

/**
 * The C→D contrast's figures, keyed `point/metric` — the study's own two nested domains.
 *
 * Iterates the points and their cells, so an operating point added to `DISPATCH_POINTS` appears
 * in the key set immediately and the totality check fails until it has a pin.
 */
export function dispatchContrastFigures(
  study: DispatchContrastStudy,
): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const point of study.points) {
    for (const cell of point.cells) {
      figures.set(`${point.id}/${cell.metric}`, estimateOf(cell.estimate));
    }
  }
  return figures;
}

/**
 * The down-peak study's figures: the two destination-reading terms across the gate, and the two
 * shipped destination profiles against `eta`.
 *
 * **The other ten terms contribute nothing here, and that is the claim rather than an omission.**
 * Each of them is bit-identical across the disclosure gate at every replication — `differing = 0`,
 * `rho = 1`, an interval of exactly `[0, 0]` — and `docs/07` § 4 is explicit that no budget resolves
 * such a thing. Their result is a **count**, asserted in `downPeakDestination.test.ts`, and pinning
 * eighty zeroes would dress a categorical finding as a measured one. The same argument
 * `accessControlFigures` makes for leaving H-ACCESS-1 out.
 *
 * The `rideTime` rows *are* pinned even where they are zero, because there the zero is the finding:
 * it is what says the term the shipped destination profiles weight moves nothing at this point at
 * sixteen times its shipped weight.
 */
export function downPeakFigures(
  study: DownPeakDestinationStudy,
): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const contrast of study.contrasts) {
    if (!DESTINATION_READING_TERMS.includes(contrast.termId)) continue;
    for (const cell of contrast.cells) {
      figures.set(
        `gate/${contrast.termId}@${String(contrast.weight)}/${cell.metric}`,
        estimateOf(cell.estimate),
      );
    }
  }
  for (const arm of study.arms) {
    if (!SHIPPED_DESTINATION_ARMS.includes(arm.armId)) continue;
    for (const cell of arm.cells) {
      figures.set(`arm/${arm.armId}/${cell.metric}`, estimateOf(cell.estimate));
    }
  }
  return figures;
}

/**
 * Phase 6c's figures: the gate and every cost, for both selector arms.
 *
 * The gate and the costs are pinned **together and labelled apart**, which is the only shape that
 * lets a reader check § D126's rule that AWT, WT95 and the energy proxy are published *beside* the
 * verdict rather than folded into it. A pin table holding only the gate would make the costs
 * unfalsifiable prose.
 */
/**
 * The sweep's figures: every cell's gate interval and every cost beside it, on both arms.
 *
 * Keyed by `cell/arm/role/metric` so a reader tracing a quoted number lands on exactly one run.
 * The **verdict** is deliberately not pinned here — a pin holds an estimate, and whether that
 * estimate clears a Holm-corrected level is arithmetic `selectionSweep.test.ts` re-derives from the
 * estimate itself. Pinning the verdict would let a moved interval and a moved rule cancel.
 */
export function selectionSweepFigures(sweep: SelectionSweep): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const row of [...sweep.primary, ...sweep.secondary]) {
    for (const arm of row.study.arms) {
      figures.set(
        `${row.cell.id}/${arm.armId}/gate/${arm.gate.metric}`,
        estimateOf(arm.gate.estimate),
      );
      for (const cost of arm.costs) {
        figures.set(
          `${row.cell.id}/${arm.armId}/cost/${cost.metric}`,
          estimateOf(cost.estimate),
        );
      }
    }
  }
  return figures;
}

export function weightSetSelectionFigures(
  study: SelectionStudy,
): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const arm of study.arms) {
    figures.set(`${arm.armId}/gate/${arm.gate.metric}`, estimateOf(arm.gate.estimate));
    for (const cost of arm.costs) {
      figures.set(`${arm.armId}/cost/${cost.metric}`, estimateOf(cost.estimate));
    }
  }
  return figures;
}

/**
 * The lunch two-way measurement's figures: the gate interval and every cost beside it, on both
 * selector arms, on **both** cells — the treatment and § D162 condition 5's flat-mix control.
 *
 * Keyed `cell/arm/role/metric`, `selectionSweepFigures`'s convention. The verdict, the Holm
 * decision and the headline counts are deliberately not here: the verdict is arithmetic
 * `lunchTwoWaySelection.test.ts` re-derives from these estimates, and the counts are pinned as
 * counts in `PINNED_LUNCH_COUNTS` beside the study (§ D149's pattern).
 */
export function lunchTwoWaySelectionFigures(
  study: LunchTwoWaySelectionStudy,
): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const outcome of [study.treatment, study.control]) {
    for (const arm of outcome.study.arms) {
      figures.set(
        `${outcome.cell.id}/${arm.armId}/gate/${arm.gate.metric}`,
        estimateOf(arm.gate.estimate),
      );
      for (const cost of arm.costs) {
        figures.set(
          `${outcome.cell.id}/${arm.armId}/cost/${cost.metric}`,
          estimateOf(cost.estimate),
        );
      }
    }
  }
  return figures;
}

/**
 * The access-control study's figures: two within-building deltas and the difference-of-differences.
 *
 * H-ACCESS-1 contributes **nothing** here, because it is categorical, it has no standard error, and
 * there is nothing for a five-number pin to hold. **That is a statement about this table's shape and
 * it was read for years as a statement that the counts needed no guard at all** — which they did.
 * Between wave 5 and wave 6 the bare-kiosk row's two published figures stopped reproducing
 * (DECISIONS.md § T50-D1) and nothing went red, because `accessControl.test.ts` asserted
 * inequalities and the inequalities held *more* strongly afterwards, and because Layer B's scan
 * looks for interval-shaped literals and `51.7 %` is not one.
 *
 * The counts now get their own two layers, next to the study that publishes them:
 * `accessControl.ts`'s `PINNED_COVERAGE` and `derivedCoverageForms`, compared and scanned in
 * `accessControl.test.ts`. They are pinned *there* rather than here because a `PinnedEstimate` would
 * have to carry three `NaN`s to hold them, and a pin table whose entries are mostly holes is the
 * kind of thing a later reader deletes.
 */
export function accessControlFigures(
  study: AccessControlStudy,
): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const delta of [study.optimization.secure, study.optimization.midtown]) {
    figures.set(`${delta.building}/absolute`, estimateOf(delta.absolute.estimate));
    figures.set(`${delta.building}/relative`, estimateOf(delta.relative));
  }
  figures.set('difference-of-differences/absolute', estimateOf(study.optimization.absolute));
  figures.set('difference-of-differences/relative', estimateOf(study.optimization.relative));
  return figures;
}

/**
 * The Mixed-Use High-Rise study's figures, keyed `point/candidate−baseline/metric`.
 *
 * Iterates the study's own points, its own baselines — which are read out of `data/` by
 * {@link baselineProfileIds} — and its own metrics, so a fourth `role: 'baseline'` profile authored
 * in `data/dispatcher-profiles.json` appears in the key set immediately and the totality check fails
 * until it has a pin. **§ 1's coverage census contributes nothing**, and that is the point: it is
 * categorical, it has no standard error, and its assertions are counts in
 * `mixedUseHighRise.test.ts`.
 */
export function mixedUseFigures(study: MixedUseStudy): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const point of study.points) {
    for (const cell of point.cells) {
      figures.set(
        `${point.id}/${cell.armId}−${cell.baselineId}/${cell.metric}`,
        estimateOf(cell.estimate),
      );
    }
  }
  return figures;
}

/** The double-deck study's figures, keyed `point/arm−baseline/metric`. */
export function doubleDeckFigures(study: DoubleDeckStudy): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const point of study.points) {
    for (const cell of point.cells) {
      figures.set(
        `${point.id}/${cell.armId}−${cell.baselineId}/${cell.metric}`,
        estimateOf(cell.estimate),
      );
    }
  }
  return figures;
}

/**
 * The matrix's figures, keyed `cell/arm/metric` — the study's own three nested domains.
 *
 * Iterates the cells, their arms and their metrics, so a cell added to `MATRIX_CELLS`, an arm added
 * to `MATRIX_ARM_PROFILES` or a metric added to `MATRIX_METRICS` appears in the key set immediately
 * and the totality check fails until it has a pin. **`UNQUOTABLE` cells are pinned too**, and that
 * is deliberate: the arithmetic behind a suppressed interval is still computed, and a suppressed
 * cell whose underlying estimate silently moved is exactly the drift the layer exists to catch —
 * the suppression could later be lifted onto a number nobody had been checking.
 *
 * The Pareto front contributes **nothing** here, and that is the point: it is a set of ids with no
 * standard error. Its assertions are memberships in `matrix.test.ts`.
 */
export function matrixFigures(
  results: readonly MatrixCellResult[],
): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const result of results) {
    for (const arm of result.caseResult.arms) {
      for (const cell of arm.cells) {
        figures.set(
          `${result.cell.id}/${arm.armId}/${cell.metric}`,
          estimateOf(cell.estimate),
        );
      }
    }
  }
  return figures;
}

/**
 * Phase 7's acceptance figures, keyed `role/candidate/objective`.
 *
 * **Both** seed sets, because the criterion is a statement about the pair: an interval that
 * excludes zero on the holdout set means something quite different depending on whether the tuning
 * set agreed, and pinning only the holdout half would let the tuning half drift into agreement or
 * out of it without anything failing.
 */
export function phase7Figures(
  study: Phase7AcceptanceStudy,
): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const [role, source] of [
    ['tuning', study.tuning],
    ['holdout', study.holdout],
  ] as const) {
    for (const [key, interval] of source) {
      if (interval.estimate === undefined) continue;
      figures.set(`${role}/${key}`, estimateOf(interval.estimate));
    }
  }
  return figures;
}

/** The forecast-causality audit's one interval. */
export function causalityFigures(
  audit: ForecastCausalityAudit,
): ReadonlyMap<string, PinnedEstimate> {
  return new Map([['partialCorrelationWithFutureGivenPast', estimateOf(audit.partialEstimate)]]);
}

/* -------------------------------------------------------------------------- *
 * Checking
 * -------------------------------------------------------------------------- */

/** One disagreement between a freshly-run study and its pin. */
export interface PinMismatch {
  readonly key: string;
  readonly field: string;
  readonly pinned: number;
  readonly measured: number;
}

/**
 * Compare a freshly-run study against its pin, in both directions.
 *
 * *Both* directions on purpose: a figure the pin has and the study no longer produces is as much a
 * drift as one whose value moved, and it is the one a "check every pin" loop silently tolerates
 * when a study loses an arm.
 */
export function checkPinned(
  studyId: PublishedStudyId,
  measured: ReadonlyMap<string, PinnedEstimate>,
): readonly PinMismatch[] {
  const pins = PINNED_ESTIMATES[studyId];
  const mismatches: PinMismatch[] = [];
  for (const [key, pin] of Object.entries(pins)) {
    const found = measured.get(key);
    if (found === undefined) {
      mismatches.push({ key, field: 'present', pinned: 1, measured: 0 });
      continue;
    }
    for (const field of ['n', 'mean', 'standardError', 'lower', 'upper'] as const) {
      if (!pinMatches(pin[field], found[field])) {
        mismatches.push({ key, field, pinned: pin[field], measured: found[field] });
      }
    }
  }
  for (const key of measured.keys()) {
    if (!(key in pins)) {
      mismatches.push({ key, field: 'pinned', pinned: 0, measured: 1 });
    }
  }
  return mismatches;
}

/** A mismatch list as the message a failing assertion should carry. */
export function describeMismatches(
  studyId: PublishedStudyId,
  mismatches: readonly PinMismatch[],
): string {
  if (mismatches.length === 0) return '';
  const lines = mismatches
    .slice(0, 12)
    .map((mismatch) =>
      mismatch.field === 'present'
        ? `  ${mismatch.key}: pinned but the study no longer produces it`
        : mismatch.field === 'pinned'
          ? `  ${mismatch.key}: produced by the study but not pinned`
          : `  ${mismatch.key}.${mismatch.field}: pinned ${mismatch.pinned}, measured ${mismatch.measured}`,
    );
  const more = mismatches.length > 12 ? `\n  … and ${mismatches.length - 12} more` : '';
  return (
    `study "${studyId}" no longer reproduces its published figures — ${mismatches.length} mismatch(es):\n` +
    `${lines.join('\n')}${more}\n` +
    'Establish WHICH of the two numbers is correct before regenerating the pins ' +
    '(packages/experiments/src/benchmark/regeneratePins.ts).'
  );
}

/* -------------------------------------------------------------------------- *
 * Layer B — the published literals that no pin can reproduce
 * -------------------------------------------------------------------------- */

/** A printed interval this package publishes that no shipped study entry point re-derives. */
export interface UnpinnedInterval {
  /** The literal exactly as it appears, so the scan can subtract it. */
  readonly text: string;
  /** Path relative to `packages/experiments/src/`. */
  readonly file: string;
  /**
   * How many times it appears in that file.
   *
   * Counted, not merely allowed, and that is the difference between an allowlist and a hole:
   * review finding #4 published the n = 300 sweep's bound in an n = 500 table, so the *same text*
   * is correct in one place and wrong in another. A membership test would wave the second one
   * through; a multiset equality catches it the moment the count changes.
   */
  readonly count: number;
  /** Why it cannot be pinned, and what would have to exist for it to be. */
  readonly reason: string;
}

/**
 * **The stated gap.** Every interval in `benchmark/` that Layer B cannot re-derive, and why.
 *
 * This list is the honest half of the guard. It is asserted **exact**: a literal missing from both
 * the pins and this list fails, and an entry here that a pin *can* now reproduce also fails, so the
 * gap can only shrink deliberately. Two kinds of entry, and no third:
 *
 * 1. **Illustrations** — a docstring showing the *format* of an interval, with no `n` and no study
 *    behind it. T2 § 4e reached the same conclusion about `report.ts:25` independently.
 * 2. **Sweeps with no shipped entry point** — `index.ts` § 4's deadband and rate sweeps and its
 *    predictor-off comparison are `runBenchmarkCase` calls against derived profiles that live in
 *    the *commit message* of `c237d95` and nowhere in the tree. Pinning them means shipping the
 *    sweep as a function first; until then they are unguarded and are named here rather than
 *    quietly excluded from the regex.
 * 3. **Superseded figures, quoted as history.** A study whose configuration legitimately changed
 *    has a before and an after, and printing only the after hides the move. The *after* is pinned
 *    like any other figure; the *before* can never be re-derived, because the tree that produced
 *    it no longer exists. Declaring it here is what stops "unpinnable" and "quietly wrong" looking
 *    the same — the entry has to name the commit it was measured on and what moved it, so a reader
 *    can go and check.
 *
 *    This kind was added when `vertical-city` declared its ground-lobby escalator and the
 *    double-deck gate moved from `DISPATCHER-DEPENDENT` to `BETTER-EVERYWHERE`; the alternative
 *    considered and rejected was to reword the before/after so the scanner's regex stops matching
 *    it, which is evading a guard rather than answering it.
 */
export const UNPINNED_INTERVALS: readonly UnpinnedInterval[] = Object.freeze([
  Object.freeze({
    text: '+1.950 [+0.975, +2.925]',
    file: 'benchmark/doubleDeck.ts',
    count: 1,
    reason:
      'Kind 3, superseded. ΔTTD for the `eta` pair at up-peak 1 %, measured on baseline d7e8571 ' +
      'where `vertical-city` declared no transport mode and the `G -> 2` lobby hop was charged to ' +
      'a local lift bank. That building now declares a ground-lobby escalator and the same cell ' +
      'measures −2.729 [−3.550, −1.907], which IS pinned. The before cannot be re-derived from ' +
      'this tree by construction; it is quoted in section 5 because publishing only the after ' +
      'would hide a verdict that moved from WORSE to BETTER.',
  }),
  Object.freeze({
    text: '−1.408 [−2.400, −0.416]',
    file: 'benchmark/doubleDeck.ts',
    count: 1,
    reason:
      'Kind 3, superseded. ΔTTD for the `collective` pair at up-peak 1 % on baseline d7e8571, ' +
      'quoted beside its successor −6.262 [−7.210, −5.315] for the same reason as the entry ' +
      'above. The verdict did not change here; the magnitude did, by a factor of four.',
  }),
  Object.freeze({
    text: '−6.86 [−8.19, −5.53]',
    file: 'benchmark/report.ts',
    count: 1,
    reason:
      "formatInterval's docstring showing the shape of a rendered interval. No `n`, no study, " +
      'nothing to re-run — T2 § 4e-1 reached the same conclusion and left it alone rather than ' +
      'inventing an `n` to justify a bound.',
  }),
  Object.freeze({
    text: '−0.006 [−0.031, +0.019]',
    file: 'benchmark/index.ts',
    count: 2,
    reason:
      '§ 4 deadband sweep and rate sweep, both n = 300 — `runBenchmarkCase("garden-residential", ' +
      '{ baseline: "park-stay", arms: park-predicted-demand-t{8,6,5,4,3,2,1,0} })`. That call ' +
      'exists in c237d95\'s commit message and nowhere in the tree, so there is no entry point to ' +
      'pin it against. The SAME literal at n = 500 was review finding #4 and is now corrected to ' +
      '`−0.006 [−0.021, +0.010]`, which the `prepositioning` pins do derive — which is why this ' +
      'entry declares a count of exactly 2.',
  }),
  Object.freeze({
    text: '−0.021 [−0.087, +0.045]',
    file: 'benchmark/index.ts',
    count: 1,
    reason: '§ 4 deadband sweep, 6 s, n = 300. Same missing entry point.',
  }),
  Object.freeze({
    text: '−0.217 [−0.378, −0.055]',
    file: 'benchmark/index.ts',
    count: 1,
    reason: '§ 4 deadband sweep, 5 s, n = 300. Same missing entry point.',
  }),
  Object.freeze({
    text: '−0.430 [−0.727, −0.133]',
    file: 'benchmark/index.ts',
    count: 1,
    reason: '§ 4 deadband sweep, 4 s, n = 300. Same missing entry point.',
  }),
  Object.freeze({
    text: '−0.792 [−1.182, −0.402]',
    file: 'benchmark/index.ts',
    count: 1,
    reason: '§ 4 deadband sweep, 3 s, n = 300. Same missing entry point.',
  }),
  Object.freeze({
    text: '−1.110 [−1.550, −0.670]',
    file: 'benchmark/index.ts',
    count: 1,
    reason: '§ 4 deadband sweep, 2 s — the interior optimum, n = 300. Same missing entry point.',
  }),
  Object.freeze({
    text: '−0.881 [−1.348, −0.414]',
    file: 'benchmark/index.ts',
    count: 1,
    reason: '§ 4 deadband sweep, 1 s, n = 300. Same missing entry point.',
  }),
  Object.freeze({
    text: '−0.623 [−1.138, −0.108]',
    file: 'benchmark/index.ts',
    count: 1,
    reason: '§ 4 deadband sweep, 0 s, n = 300. Same missing entry point.',
  }),
  Object.freeze({
    text: '−1.11 [−1.55, −0.67]',
    file: 'benchmark/index.ts',
    count: 1,
    reason: '§ 4 deadband sweep, 2 s, quoted at 2 dp in the § 0 summary. n = 300, same sweep.',
  }),
  Object.freeze({
    text: '−0.014 [−0.035, +0.006]',
    file: 'benchmark/index.ts',
    count: 1,
    reason: '§ 4 rate sweep, 8 % of population per 5 min, n = 300. Same missing entry point.',
  }),
  Object.freeze({
    text: '−0.010 [−0.030, +0.010]',
    file: 'benchmark/index.ts',
    count: 1,
    reason: '§ 4 rate sweep, 16 % of population per 5 min, n = 300. Same missing entry point.',
  }),
  Object.freeze({
    text: '−0.007 [−0.032, +0.018]',
    file: 'benchmark/index.ts',
    count: 2,
    reason:
      '§ 4 the predictor apparatus priced directly — the same profile with a forecast against ' +
      '`createPredictor: () => undefined`, n = 300. Built by hand from `new Simulation(...)`; no ' +
      'study function performs it.',
  }),
]);

/**
 * Every exported study entry point in `benchmark/`, and which pin table covers it.
 *
 * The totality check `published.test.ts` runs is against the **directory**, not against this map:
 * it scans every non-test module for `export (async )?function (run|measure|audit)Xxx` and requires
 * each name to appear here. So a study added to this package fails the suite until somebody decides
 * whether it publishes an interval — which is the property `core/src/sim/seam.test.ts` gets from
 * partitioning `BUILDING_IDS` rather than listing buildings.
 */
export const STUDY_ENTRY_POINTS: Readonly<Record<string, PublishedStudyId | 'no-intervals'>> =
  Object.freeze({
    runBenchmark: 'benchmark',
    runBenchmarkCase: 'benchmark',
    runTailStudy: 'tail',
    runPrepositioningStudy: 'prepositioning',
    runCapacityReassignmentStudy: 'capacity-reassignment',
    auditForecastCausalityInRun: 'forecast-causality',
    // Counts and flips, not intervals: `measurePredictorLag` reports bucket lags and an argmax
    // flip, and the two auction measurements report allocation differences over a deterministic
    // sweep. Nothing in either has a standard error, so there is nothing for a pin to hold.
    measurePredictorLag: 'no-intervals',
    measureAuctionAggregation: 'no-intervals',
    measureMultiRoundReachability: 'no-intervals',
    runDestinationDisclosureStudy: 'destination-disclosure',
    runNegativeControls: 'destination-disclosure',
    runDestinationDispatchStudy: 'destination-dispatch',
    runAccessControlStudy: 'access-control',
    runMixedUseHighRiseStudy: 'mixed-use-high-rise',
    // Counts and nothing else: evaluations, non-zero evaluations, cross-car spread and eligibility
    // refusals by reason. No standard error anywhere in it, so there is nothing for a pin to hold —
    // and the assertions it feeds are inequalities against zero, not intervals.
    measureDestinationLiveness: 'no-intervals',
    runMatrix: 'matrix',
    runMatrixCell: 'matrix',
    runPhase7Acceptance: 'phase7-acceptance',
    runDownPeakDestinationStudy: 'down-peak-destination',
    // Phase 6c's gate and its costs, and Phase 7's fuzzy detector measured beside it. Publishes
    // intervals, so `regeneratePins.ts` is its non-test caller.
    runWeightSetSelectionStudy: 'weight-set-selection',
    // Phase 6c's **sweep**: the same gate at eight pre-registered operating points, Holm-corrected
    // within two families that are never pooled. Publishes a paired-t interval per cell per arm,
    // so `regeneratePins.ts` is its non-test caller and `selectionSweep.test.ts` compares the pins
    // against a fresh run. DECISIONS.md § D151.
    runSelectionSweep: 'selection-sweep',
    // Phase 6c's § D162 re-measurement on the mix-varying template: the same § D139 gate at the
    // shipped lunch two-way point, beside its flat-mix negative control, Holm within its own
    // declared family that is never pooled with § D151's. Publishes paired-t intervals on both
    // cells' arms, so `regeneratePins.ts` is its non-test caller and
    // `lunchTwoWaySelection.test.ts` compares the pins against a fresh run.
    runLunchTwoWaySelectionStudy: 'lunch-two-way-selection',
    // Counts and a trajectory divergence index: how many patterns the detector entered, whether
    // the shipped weight-set map and a permuted one produce different car trajectories, and
    // whether the selector switched off is bit-identical to the profile run without it. There is
    // no standard error anywhere in it — the claim is that two sequences differ, not by how much —
    // so `livenessSuite.ts` is its driver rather than the pin table.
    measureWeightSetSelectionLiveness: 'no-intervals',
    // Structural, not pinned. `measureDiversionAt` computes paired intervals and
    // `enRouteDiversion.test.ts` prints them, but every assertion it makes is about the
    // *apparatus* rather than the value: the arms were paired (identical trace digests), the
    // mechanism fired (a non-zero paired difference under CRN, which is what separates "small
    // effect" from "inert switch"), and the AWT interval is quotable at all. No figure from it is
    // asserted anywhere, so there is nothing for a pin to hold — and correspondingly nothing in
    // this repository claims a number it would have to regenerate. If `eligibility.enRouteDiversion`
    // is ever adopted on a shipped profile, that changes: the study becomes a published figure and
    // needs an id and a pin like any other. See `DECISIONS.md` § D205.
    measureDiversionAt: 'no-intervals',
    // Same classification and the same reason: the assertions are structural (paired, live, and
    // neither metric significantly worse), and no figure it produces is quoted anywhere.
    measureShippedAt: 'no-intervals',
    // § D209's adoption study, and the entry above is why it is classified this way rather than
    // pinned. `measureDiversionAt`'s note predicted that adopting `eligibility.enRouteDiversion` on
    // a shipped profile would move both to the pinned half — **and § D210 refused adoption**, so
    // the prediction stands unexercised and the classification does not move. The study computes
    // intervals and `collectiveAdoption.test.ts` asserts only the apparatus: the ladders are
    // derived from `data/buildings/`, and every clause of the criterion can be driven to a refusal.
    // Its non-test caller is `main` in its own module — the command § D210 was produced by, run at
    // n = 200 across five buildings and two seeds, which is minutes of simulation per cell and
    // belongs in neither `regeneratePins.ts` nor `livenessSuite.ts`.
    runCollectiveAdoptionStudy: 'no-intervals',
    // § D211's study, classified for the same reason as the two above: it computes intervals, and
    // the assertions on it are structural — the ladders are derived, the criterion can refuse, and
    // clause 5′ is an exact bit-identity rather than an interval. Its non-test caller is `main` in
    // its own module, the command § D211's numbers came from.
    runDiversionDetourStudy: 'no-intervals',
    // The per-cell primitive `runDiversionDetourStudy` is built from, classified alongside it for
    // the same reason `measureDiversionAt` and `measureShippedAt` are.
    measureDetourAt: 'no-intervals',
    // Double-deck operation against the single-deck arm the retired `doubleDeckNotSimulated`
    // disclaimer described, at two censused operating points on `vertical-city`. Publishes
    // paired-t intervals on ten metrics, so `regeneratePins.ts` is its non-test caller.
    runDoubleDeckStudy: 'double-deck',
    // The known-answer test: the same search, on `idle.repositionThresholdS`, whose optimum was
    // published before the machinery existed. Its output is a threshold in seconds, not an
    // interval.
    runDeadbandKnownAnswer: 'no-intervals',
    // Categorical by construction: sample counts against the fleet's own odometers, a count of
    // samples outside the emitted window, and a sign on a difference in mean energy. A liveness
    // proof that published a confidence interval would invite a resolution question to be read
    // into a wiring question, which is the one thing it must not do.
    measureEnergyLiveness: 'no-intervals',
    // Counts in a contingency table: how the three detector inputs' *ratios* move across the run
    // under the lunch two-way template, against the same table shape DECISIONS.md § D156 measured
    // the shipped templates flat over. A chi-square and a standardized residual have no standard
    // error and the claim is categorical — the mix varies, or it does not — so `livenessSuite.ts`
    // is its driver rather than the pin table. It constructs no `Simulation` and names no
    // dispatcher: § D162 condition 3 forbids the commit that adds the template from also adding a
    // selector result.
    measureLunchTwoWayMix: 'no-intervals',
    // The driver for the five above, and the reason the five are no longer dead. Every entry point
    // mapped to a `PublishedStudyId` had `regeneratePins.ts` as its non-test caller; the
    // `'no-intervals'` half had none at all, which is how `measureEnergyLiveness` shipped as the
    // ninth instance of the standing requirement's defect. `livenessSuite.ts` is the categorical
    // half's `regeneratePins.ts`. It publishes no interval either — it prints what the five
    // counted — so it classifies here rather than in the pin table.
    runLivenessSuite: 'no-intervals',
  });

/* -------------------------------------------------------------------------- *
 * The pins — GENERATED. See regeneratePins.ts.
 * -------------------------------------------------------------------------- */

export const PINNED_ESTIMATES: Readonly<
  Record<PublishedStudyId, Readonly<Record<string, PinnedEstimate>>>
> = Object.freeze({
  "benchmark": Object.freeze({
    "garden-residential/auction-multi-round/awtS": { n: 500, mean: -1.2528413527866666, standardError: 0.11043518470764019, lower: -1.4698166059809201, upper: -1.0358660995924132 },
    "garden-residential/auction-multi-round/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/auction-multi-round/ttdMeanS": { n: 500, mean: -1.9726625497021169, standardError: 0.14401574622740687, lower: -2.2556145190801256, upper: -1.689710580324108 },
    "garden-residential/auction-multi-round/wt95S": { n: 500, mean: -4.168897834294782, standardError: 0.3700743295139976, lower: -4.8959937463409915, upper: -3.4418019222485725 },
    "garden-residential/auction-multi-round−auction/awtS": { n: 500, mean: 0.005413883685798925, standardError: 0.005413883685798894, lower: -0.005222932711078854, upper: 0.016050700082676703 },
    "garden-residential/auction-multi-round−auction/pctOverLongWait": { n: 500, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "garden-residential/auction-multi-round−auction/ttdMeanS": { n: 500, mean: -0.00794001241809717, standardError: 0.007940012418097171, lower: -0.023539988180739817, upper: 0.007659963344545476 },
    "garden-residential/auction-multi-round−auction/wt95S": { n: 500, mean: 0.02429958861946534, standardError: 0.024299588619465115, lower: -0.023442527330107436, upper: 0.07204170456903812 },
    "garden-residential/auction/awtS": { n: 500, mean: -1.2582552364724655, standardError: 0.11029417071656501, lower: -1.474953435333913, upper: -1.041557037611018 },
    "garden-residential/auction/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/auction/ttdMeanS": { n: 500, mean: -1.9647225372840198, standardError: 0.14373826000435075, lower: -2.247129321323996, upper: -1.6823157532440434 },
    "garden-residential/auction/wt95S": { n: 500, mean: -4.193197422914247, standardError: 0.36872232193253174, lower: -4.917637005928312, upper: -3.4687578399001824 },
    "garden-residential/capacity-aware/awtS": { n: 500, mean: -1.2768141961671666, standardError: 0.10774240593666344, lower: -1.4884988677666544, upper: -1.0651295245676788 },
    "garden-residential/capacity-aware/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/capacity-aware/ttdMeanS": { n: 500, mean: -1.9260491647416003, standardError: 0.1401364539063672, lower: -2.2013793744802297, upper: -1.6507189550029708 },
    "garden-residential/capacity-aware/wt95S": { n: 500, mean: -4.230216984028221, standardError: 0.36648946812913724, lower: -4.950269613548978, upper: -3.510164354507464 },
    "garden-residential/collective/awtS": { n: 500, mean: -1.2689351885150875, standardError: 0.11319591464669483, lower: -1.4913345289611812, upper: -1.0465358480689937 },
    "garden-residential/collective/pctOverLongWait": { n: 500, mean: -0.3800200933573363, standardError: 0.09945119433554514, lower: -0.575414777837209, upper: -0.1846254088774636 },
    "garden-residential/collective/ttdMeanS": { n: 500, mean: -3.680868462083656, standardError: 0.2187148183926376, lower: -4.110583894024203, upper: -3.251153030143109 },
    "garden-residential/collective/wt95S": { n: 500, mean: -3.84425954987177, standardError: 0.36006176277132784, lower: -4.55168347775943, upper: -3.1368356219841096 },
    "garden-residential/collective-enroute/awtS": { n: 500, mean: -1.3571653207427472, standardError: 0.12286121444591125, lower: -1.5985543597770688, upper: -1.1157762817084256 },
    "garden-residential/collective-enroute/pctOverLongWait": { n: 500, mean: -0.4175200933573363, standardError: 0.11035874031439895, lower: -0.6343451540054125, upper: -0.20069503270926012 },
    "garden-residential/collective-enroute/ttdMeanS": { n: 500, mean: -3.6862330091755457, standardError: 0.2193547479054596, lower: -4.117205729438095, upper: -3.255260288912997 },
    "garden-residential/collective-enroute/wt95S": { n: 500, mean: -3.9654499090994415, standardError: 0.3656965370315812, lower: -4.683944643587802, upper: -3.2469551746110805 },
    "garden-residential/destination-eta/awtS": { n: 500, mean: -1.274923328413108, standardError: 0.10772512295373383, lower: -1.48657404362807, upper: -1.063272613198146 },
    "garden-residential/destination-eta/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/destination-eta/ttdMeanS": { n: 500, mean: -1.9040621129723294, standardError: 0.139158587845912, lower: -2.177471080521533, upper: -1.6306531454231257 },
    "garden-residential/destination-eta/wt95S": { n: 500, mean: -4.228642322773871, standardError: 0.3664404632886255, lower: -4.9485986710441745, upper: -3.5086859745035683 },
    "garden-residential/destination-panel/awtS": { n: 500, mean: -1.2332632056568171, standardError: 0.11206700777447282, lower: -1.4534445495913684, upper: -1.0130818617222659 },
    "garden-residential/destination-panel/pctOverLongWait": { n: 500, mean: -0.36098810027904643, standardError: 0.116687635479283, lower: -0.5902477272700501, upper: -0.13172847328804274 },
    "garden-residential/destination-panel/ttdMeanS": { n: 500, mean: -1.8687391408735783, standardError: 0.14657287268637695, lower: -2.156715171761998, upper: -1.5807631099851587 },
    "garden-residential/destination-panel/wt95S": { n: 500, mean: -4.093684635092217, standardError: 0.3929108703781397, lower: -4.8656481701626975, upper: -3.3217211000217364 },
    "garden-residential/energy-aware/awtS": { n: 500, mean: -1.2705623141208482, standardError: 0.10906519229330046, lower: -1.4848459029532182, upper: -1.0562787252884782 },
    "garden-residential/energy-aware/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/energy-aware/ttdMeanS": { n: 500, mean: -1.5138326203400023, standardError: 0.13590677032504084, lower: -1.7808526464318217, upper: -1.246812594248183 },
    "garden-residential/energy-aware/wt95S": { n: 500, mean: -4.174694790151034, standardError: 0.366574450895584, lower: -4.894914387810757, upper: -3.4544751924913113 },
    "garden-residential/eta/awtS": { n: 500, mean: -1.2781683656593825, standardError: 0.10755681902029572, lower: -1.4894884091896998, upper: -1.0668483221290652 },
    "garden-residential/eta/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/eta/ttdMeanS": { n: 500, mean: -1.8582425474835709, standardError: 0.13854583002490287, lower: -2.1304476117322806, upper: -1.5860374832348614 },
    "garden-residential/eta/wt95S": { n: 500, mean: -4.228562437470144, standardError: 0.3661935135175747, lower: -4.948033596267166, upper: -3.5090912786731216 },
    "garden-residential/fairness-first/awtS": { n: 500, mean: -1.2889924433334565, standardError: 0.10802852551117208, lower: -1.5012392624703184, upper: -1.0767456241965947 },
    "garden-residential/fairness-first/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/fairness-first/ttdMeanS": { n: 500, mean: -1.870647780790629, standardError: 0.1390339091701793, lower: -2.1438117884811914, upper: -1.5974837731000666 },
    "garden-residential/fairness-first/wt95S": { n: 500, mean: -4.247991155190158, standardError: 0.36650634628933826, lower: -4.9680769457283285, upper: -3.5279053646519882 },
    "garden-residential/predictive-balanced/awtS": { n: 500, mean: -0.22562046122105217, standardError: 0.12376840778194197, lower: -0.4687918896659814, upper: 0.017550967223877084 },
    "garden-residential/predictive-balanced/pctOverLongWait": { n: 500, mean: -0.4425200933573363, standardError: 0.11296997779535825, lower: -0.6644755290311019, upper: -0.2205646576835707 },
    "garden-residential/predictive-balanced/ttdMeanS": { n: 500, mean: -2.007893772590997, standardError: 0.21542493720836325, lower: -2.431145478275943, upper: -1.584642066906051 },
    "garden-residential/predictive-balanced/wt95S": { n: 500, mean: -2.7133151819166894, standardError: 0.3771435006818718, lower: -3.4543001023263438, upper: -1.972330261507035 },
    "garden-residential/predictive-balanced−eta/awtS": { n: 500, mean: 1.0525479044383304, standardError: 0.059062443970206234, lower: 0.9365061848665033, upper: 1.1685896240101574 },
    "garden-residential/predictive-balanced−eta/pctOverLongWait": { n: 500, mean: -0.004878048780487805, standardError: 0.004878048780487803, lower: -0.014462094590183786, upper: 0.004705997029208175 },
    "garden-residential/predictive-balanced−eta/ttdMeanS": { n: 500, mean: -0.14965122510742412, standardError: 0.1660088160688749, lower: -0.47581362520100995, upper: 0.1765111749861617 },
    "garden-residential/predictive-balanced−eta/wt95S": { n: 500, mean: 1.5152472555534546, standardError: 0.11524026004799613, lower: 1.2888313296120937, upper: 1.7416631814948156 },
    "garden-residential/zoned-uppeak/awtS": { n: 500, mean: -6.488484942212822, standardError: 0.2129155275693811, lower: -6.906806337026032, upper: -6.070163547399612 },
    "garden-residential/zoned-uppeak/pctOverLongWait": { n: 500, mean: -0.4387105695478125, standardError: 0.11261302832295046, lower: -0.6599646961020409, upper: -0.21745644299358408 },
    "garden-residential/zoned-uppeak/ttdMeanS": { n: 500, mean: -7.10184386361982, standardError: 0.2345306647080074, lower: -7.562633153659518, upper: -6.641054573580122 },
    "garden-residential/zoned-uppeak/wt95S": { n: 500, mean: -11.2350191744125, standardError: 0.406929160201385, lower: -12.034524855510094, upper: -10.435513493314906 },
    "midtown-up-peak/auction-multi-round/awtS": { n: 250, mean: -4.626342976662218, standardError: 0.4895608888345811, lower: -5.5905511961767145, upper: -3.6621347571477214 },
    "midtown-up-peak/auction-multi-round/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/auction-multi-round/ttdMeanS": { n: 250, mean: -13.65111341555069, standardError: 0.778286610976984, lower: -15.183977589460738, upper: -12.11824924164064 },
    "midtown-up-peak/auction-multi-round/wt95S": { n: 250, mean: -21.47515461359534, standardError: 1.4361988751095138, lower: -24.303801247387156, upper: -18.646507979803523 },
    "midtown-up-peak/auction-multi-round−auction/awtS": { n: 250, mean: 1.4333773326641674, standardError: 0.16608303206704392, lower: 1.1062706779186267, upper: 1.7604839874097082 },
    "midtown-up-peak/auction-multi-round−auction/pctOverLongWait": { n: 250, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "midtown-up-peak/auction-multi-round−auction/ttdMeanS": { n: 250, mean: -2.5906250040554, standardError: 0.24036521976044065, lower: -3.064033166072068, upper: -2.1172168420387325 },
    "midtown-up-peak/auction-multi-round−auction/wt95S": { n: 250, mean: 1.4760053908658097, standardError: 0.18936076263245344, lower: 1.1030523875766955, upper: 1.848958394154924 },
    "midtown-up-peak/auction/awtS": { n: 250, mean: -6.05972030932638, standardError: 0.4734293533098122, lower: -6.992156874893194, upper: -5.127283743759566 },
    "midtown-up-peak/auction/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/auction/ttdMeanS": { n: 250, mean: -11.060488411495284, standardError: 0.754897338873998, lower: -12.54728655169123, upper: -9.573690271299338 },
    "midtown-up-peak/auction/wt95S": { n: 250, mean: -22.951160004461155, standardError: 1.4298213105204403, lower: -25.767245789669033, upper: -20.135074219253276 },
    "midtown-up-peak/capacity-aware/awtS": { n: 250, mean: -6.752254239181906, standardError: 0.4555304509579535, lower: -7.649438256676439, upper: -5.855070221687373 },
    "midtown-up-peak/capacity-aware/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/capacity-aware/ttdMeanS": { n: 250, mean: -10.203607301377467, standardError: 0.7184482687409549, lower: -11.618617654155175, upper: -8.788596948599759 },
    "midtown-up-peak/capacity-aware/wt95S": { n: 250, mean: -23.405061175493486, standardError: 1.4214645528905494, lower: -26.204688018455357, upper: -20.605434332531615 },
    "midtown-up-peak/collective/awtS": { n: 250, mean: -6.814796943474347, standardError: 0.460185037829568, lower: -7.72114834141616, upper: -5.908445545532534 },
    "midtown-up-peak/collective/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/collective/ttdMeanS": { n: 250, mean: -10.356236682593348, standardError: 0.7097713429914008, lower: -11.75415751020953, upper: -8.958315854977165 },
    "midtown-up-peak/collective/wt95S": { n: 250, mean: -23.370313169992823, standardError: 1.4241136950429996, lower: -26.175157596091566, upper: -20.56546874389408 },
    "midtown-up-peak/collective-enroute/awtS": { n: 250, mean: -6.7504396546033085, standardError: 0.46402610131750077, lower: -7.664356168695552, upper: -5.836523140511065 },
    "midtown-up-peak/collective-enroute/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/collective-enroute/ttdMeanS": { n: 250, mean: -10.213940417947079, standardError: 0.7225620962217031, lower: -11.637053105615232, upper: -8.790827730278926 },
    "midtown-up-peak/collective-enroute/wt95S": { n: 250, mean: -23.347845527464994, standardError: 1.4244769915849387, lower: -26.15340547949697, upper: -20.542285575433016 },
    "midtown-up-peak/destination-eta/awtS": { n: 250, mean: -6.710757196838767, standardError: 0.45493663261868494, lower: -7.606771667221429, upper: -5.814742726456104 },
    "midtown-up-peak/destination-eta/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/destination-eta/ttdMeanS": { n: 250, mean: -10.23022352397853, standardError: 0.7116260010897452, lower: -11.63179716909627, upper: -8.82864987886079 },
    "midtown-up-peak/destination-eta/wt95S": { n: 250, mean: -23.37556253383931, standardError: 1.4210759588571562, lower: -26.17442402652587, upper: -20.576701041152752 },
    "midtown-up-peak/destination-panel/awtS": { n: 250, mean: -6.380812348722793, standardError: 0.4712944282388003, lower: -7.309044100652598, upper: -5.452580596792987 },
    "midtown-up-peak/destination-panel/pctOverLongWait": { n: 250, mean: -7.338139848917022, standardError: 0.6573874942865632, lower: -8.632888755240131, upper: -6.043390942593913 },
    "midtown-up-peak/destination-panel/ttdMeanS": { n: 250, mean: -10.440992075580082, standardError: 0.7324364008816538, lower: -11.883552570318322, upper: -8.998431580841842 },
    "midtown-up-peak/destination-panel/wt95S": { n: 250, mean: -23.257111926055696, standardError: 1.4277160967027518, lower: -26.06905141503537, upper: -20.44517243707602 },
    "midtown-up-peak/energy-aware/awtS": { n: 250, mean: -6.757922236779572, standardError: 0.4526435569786732, lower: -7.649420410148943, upper: -5.8664240634102 },
    "midtown-up-peak/energy-aware/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/energy-aware/ttdMeanS": { n: 250, mean: -9.493603110542796, standardError: 0.715811342253399, lower: -10.903419939386005, upper: -8.083786281699588 },
    "midtown-up-peak/energy-aware/wt95S": { n: 250, mean: -23.34356281690242, standardError: 1.423748180406562, lower: -26.147687348449036, upper: -20.539438285355804 },
    "midtown-up-peak/eta/awtS": { n: 250, mean: -6.8066848556977035, standardError: 0.45215957034252524, lower: -7.697229799543736, upper: -5.916139911851671 },
    "midtown-up-peak/eta/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/eta/ttdMeanS": { n: 250, mean: -10.312463457348638, standardError: 0.7062606596732539, lower: -11.70346986473912, upper: -8.921457049958157 },
    "midtown-up-peak/eta/wt95S": { n: 250, mean: -23.411667367886075, standardError: 1.4220624137272133, lower: -26.212471719807475, upper: -20.610863015964675 },
    "midtown-up-peak/fairness-first/awtS": { n: 250, mean: -6.8066848556977035, standardError: 0.45215957034252524, lower: -7.697229799543736, upper: -5.916139911851671 },
    "midtown-up-peak/fairness-first/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/fairness-first/ttdMeanS": { n: 250, mean: -10.312463457348638, standardError: 0.7062606596732539, lower: -11.70346986473912, upper: -8.921457049958157 },
    "midtown-up-peak/fairness-first/wt95S": { n: 250, mean: -23.411667367886075, standardError: 1.4220624137272133, lower: -26.212471719807475, upper: -20.610863015964675 },
    "midtown-up-peak/predictive-balanced/awtS": { n: 250, mean: -3.8056357393859868, standardError: 0.5048274658984904, lower: -4.799912045270525, upper: -2.811359433501448 },
    "midtown-up-peak/predictive-balanced/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/predictive-balanced/ttdMeanS": { n: 250, mean: -11.452004023515677, standardError: 0.7818807152290711, lower: -12.991946918256355, upper: -9.912061128775 },
    "midtown-up-peak/predictive-balanced/wt95S": { n: 250, mean: -20.125235317266423, standardError: 1.4400768383678793, lower: -22.961519742666944, upper: -17.288950891865902 },
    "midtown-up-peak/predictive-balanced−eta/awtS": { n: 250, mean: 3.0010491163117154, standardError: 0.20681812752454173, lower: 2.5937131892557828, upper: 3.408385043367648 },
    "midtown-up-peak/predictive-balanced−eta/pctOverLongWait": { n: 250, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "midtown-up-peak/predictive-balanced−eta/ttdMeanS": { n: 250, mean: -1.1395405661670406, standardError: 0.33306136807952713, lower: -1.795517209786409, upper: -0.4835639225476722 },
    "midtown-up-peak/predictive-balanced−eta/wt95S": { n: 250, mean: 3.286432050619658, standardError: 0.21620379418899854, lower: 2.8606107070406943, upper: 3.7122533941986213 },
    "midtown-up-peak/zoned-uppeak/awtS": { n: 250, mean: -8.157917663209602, standardError: 0.5698266821721246, lower: -9.280212321912794, upper: -7.0356230045064105 },
    "midtown-up-peak/zoned-uppeak/pctOverLongWait": { n: 250, mean: -7.222522133299306, standardError: 0.6642699457291984, lower: -8.530826281478431, upper: -5.914217985120182 },
    "midtown-up-peak/zoned-uppeak/ttdMeanS": { n: 250, mean: -12.13411029484067, standardError: 0.8836684615081873, lower: -13.874527908552091, upper: -10.39369268112925 },
    "midtown-up-peak/zoned-uppeak/wt95S": { n: 250, mean: -21.045815396831415, standardError: 1.5713396259416437, lower: -24.14062672170771, upper: -17.95100407195512 },
    "secure-up-peak/auction-multi-round/awtS": { n: 150, mean: -5.048858789690482, standardError: 0.3997055765976525, lower: -5.8386822762432935, upper: -4.25903530313767 },
    "secure-up-peak/auction-multi-round/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/auction-multi-round/ttdMeanS": { n: 150, mean: -8.55342265572904, standardError: 0.5962231500050522, lower: -9.731567456982374, upper: -7.375277854475707 },
    "secure-up-peak/auction-multi-round/wt95S": { n: 150, mean: -19.048118655072216, standardError: 1.4820230978898739, lower: -21.976615826142343, upper: -16.11962148400209 },
    "secure-up-peak/auction-multi-round−auction/awtS": { n: 150, mean: 0.4174508376961422, standardError: 0.07783251739344337, lower: 0.26365275767397617, upper: 0.5712489177183082 },
    "secure-up-peak/auction-multi-round−auction/pctOverLongWait": { n: 150, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "secure-up-peak/auction-multi-round−auction/ttdMeanS": { n: 150, mean: -0.8063861883787087, standardError: 0.1408081463445451, lower: -1.0846249410815156, upper: -0.5281474356759017 },
    "secure-up-peak/auction-multi-round−auction/wt95S": { n: 150, mean: 0.40095483343439564, standardError: 0.12253090788371375, lower: 0.1588321447819588, upper: 0.6430775220868324 },
    "secure-up-peak/auction/awtS": { n: 150, mean: -5.466309627386623, standardError: 0.4056602213270458, lower: -6.2678995703931735, upper: -4.664719684380073 },
    "secure-up-peak/auction/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/auction/ttdMeanS": { n: 150, mean: -7.747036467350334, standardError: 0.5783272307068373, lower: -8.889818696243532, upper: -6.604254238457136 },
    "secure-up-peak/auction/wt95S": { n: 150, mean: -19.449073488506603, standardError: 1.487311808001757, lower: -22.38802122045079, upper: -16.510125756562417 },
    "secure-up-peak/capacity-aware/awtS": { n: 150, mean: -5.566706409564928, standardError: 0.40426867173130643, lower: -6.365546632232888, upper: -4.767866186896967 },
    "secure-up-peak/capacity-aware/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/capacity-aware/ttdMeanS": { n: 150, mean: -7.122419955070114, standardError: 0.5438330913230868, lower: -8.197041309987975, upper: -6.047798600152254 },
    "secure-up-peak/capacity-aware/wt95S": { n: 150, mean: -19.478814712841668, standardError: 1.4851280258153639, lower: -22.413447262408337, upper: -16.544182163275 },
    "secure-up-peak/collective/awtS": { n: 150, mean: -5.7661346897783226, standardError: 0.39189227767384754, lower: -6.540518994696471, upper: -4.9917503848601745 },
    "secure-up-peak/collective/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/collective/ttdMeanS": { n: 150, mean: -7.18550512270792, standardError: 0.5406776492236365, lower: -8.253891282455832, upper: -6.117118962960009 },
    "secure-up-peak/collective/wt95S": { n: 150, mean: -19.52395099275389, standardError: 1.4781496981897648, lower: -22.444794274974143, upper: -16.603107710533635 },
    "secure-up-peak/collective-enroute/awtS": { n: 150, mean: -5.576747973225097, standardError: 0.4031707777136825, lower: -6.3734187428465265, upper: -4.780077203603668 },
    "secure-up-peak/collective-enroute/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/collective-enroute/ttdMeanS": { n: 150, mean: -7.124762045142081, standardError: 0.5423843213034765, lower: -8.196520611409749, upper: -6.053003478874412 },
    "secure-up-peak/collective-enroute/wt95S": { n: 150, mean: -19.479899690414058, standardError: 1.4850329125481778, lower: -22.414344294911395, upper: -16.54545508591672 },
    "secure-up-peak/destination-eta/awtS": { n: 150, mean: -5.637664867537945, standardError: 0.40080077717569446, lower: -6.42965248486518, upper: -4.845677250210709 },
    "secure-up-peak/destination-eta/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/destination-eta/ttdMeanS": { n: 150, mean: -7.219781850690365, standardError: 0.5438528486520514, lower: -8.294442246350615, upper: -6.1451214550301145 },
    "secure-up-peak/destination-eta/wt95S": { n: 150, mean: -19.535142429442832, standardError: 1.4864792269988398, lower: -22.47244497035376, upper: -16.597839888531905 },
    "secure-up-peak/destination-panel/awtS": { n: 150, mean: -5.517769884795915, standardError: 0.4004414603359033, lower: -6.309047487312757, upper: -4.726492282279073 },
    "secure-up-peak/destination-panel/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/destination-panel/ttdMeanS": { n: 150, mean: -8.034833619290676, standardError: 0.5799287096428716, lower: -9.18078039166527, upper: -6.888886846916082 },
    "secure-up-peak/destination-panel/wt95S": { n: 150, mean: -19.53254242944283, standardError: 1.4866342648697213, lower: -22.47015132722966, upper: -16.594933531656 },
    "secure-up-peak/energy-aware/awtS": { n: 150, mean: -5.715237539321243, standardError: 0.39827114486426696, lower: -6.502226569866389, upper: -4.928248508776097 },
    "secure-up-peak/energy-aware/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/energy-aware/ttdMeanS": { n: 150, mean: -6.577641981676558, standardError: 0.5532762960452231, lower: -7.6709232335649755, upper: -5.48436072978814 },
    "secure-up-peak/energy-aware/wt95S": { n: 150, mean: -19.507064231685174, standardError: 1.4801037418808545, lower: -22.4317687299888, upper: -16.582359733381548 },
    "secure-up-peak/eta/awtS": { n: 150, mean: -5.756382817981705, standardError: 0.3930865298508329, lower: -6.53312698093906, upper: -4.97963865502435 },
    "secure-up-peak/eta/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/eta/ttdMeanS": { n: 150, mean: -7.194652724499509, standardError: 0.5416545415210114, lower: -8.264969236300216, upper: -6.124336212698802 },
    "secure-up-peak/eta/wt95S": { n: 150, mean: -19.5228660151815, standardError: 1.4782454713303441, lower: -22.443898546389605, upper: -16.601833483973394 },
    "secure-up-peak/fairness-first/awtS": { n: 150, mean: -5.756382817981705, standardError: 0.3930865298508329, lower: -6.53312698093906, upper: -4.97963865502435 },
    "secure-up-peak/fairness-first/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/fairness-first/ttdMeanS": { n: 150, mean: -7.194652724499509, standardError: 0.5416545415210114, lower: -8.264969236300216, upper: -6.124336212698802 },
    "secure-up-peak/fairness-first/wt95S": { n: 150, mean: -19.5228660151815, standardError: 1.4782454713303441, lower: -22.443898546389605, upper: -16.601833483973394 },
    "secure-up-peak/predictive-balanced/awtS": { n: 150, mean: -3.9944006691258225, standardError: 0.40650215861440003, lower: -4.797654291306972, upper: -3.1911470469446725 },
    "secure-up-peak/predictive-balanced/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/predictive-balanced/ttdMeanS": { n: 150, mean: -6.4060835470511, standardError: 0.6007982695834228, lower: -7.5932688448807975, upper: -5.218898249221403 },
    "secure-up-peak/predictive-balanced/wt95S": { n: 150, mean: -17.839984304421467, standardError: 1.4951531246660004, lower: -20.79442658142463, upper: -14.885542027418303 },
    "secure-up-peak/predictive-balanced−eta/awtS": { n: 150, mean: 1.7619821488558778, standardError: 0.10992956139729047, lower: 1.5447598869172405, upper: 1.979204410794515 },
    "secure-up-peak/predictive-balanced−eta/pctOverLongWait": { n: 150, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "secure-up-peak/predictive-balanced−eta/ttdMeanS": { n: 150, mean: 0.7885691774484077, standardError: 0.2799985794233963, lower: 0.23528829477352742, upper: 1.3418500601232881 },
    "secure-up-peak/predictive-balanced−eta/wt95S": { n: 150, mean: 1.6828817107600462, standardError: 0.11138381028212999, lower: 1.4627858338613262, upper: 1.9029775876587662 },
    "secure-up-peak/zoned-uppeak/awtS": { n: 150, mean: 1.852305568219164, standardError: 0.6437218505619589, lower: 0.5803027087422712, upper: 3.124308427696057 },
    "secure-up-peak/zoned-uppeak/pctOverLongWait": { n: 150, mean: 4.109486804548994, standardError: 0.8228375081500461, lower: 2.483549045347579, upper: 5.735424563750409 },
    "secure-up-peak/zoned-uppeak/ttdMeanS": { n: 150, mean: 2.7316098687237806, standardError: 0.7919633394127276, lower: 1.166679873797506, upper: 4.296539863650056 },
    "secure-up-peak/zoned-uppeak/wt95S": { n: 150, mean: 7.241597420562625, standardError: 1.925553991078216, lower: 3.4366773598400857, upper: 11.046517481285164 },
  }),
  "tail": Object.freeze({
    "1/capacity-aware/awtS": { n: 250, mean: 0.0044311312181427595, standardError: 0.05879672210028914, lower: -0.11137118065478206, upper: 0.12023344309106758 },
    "1/capacity-aware/maxWaitS": { n: 250, mean: -0.08769692026976622, standardError: 0.10680432903800742, lower: -0.2980519839337148, upper: 0.12265814339418238 },
    "1/capacity-aware/pctOverLongWait": { n: 250, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "1/capacity-aware/wt95S": { n: 250, mean: -0.14223429387490957, standardError: 0.07479240224513849, lower: -0.28954068751609824, upper: 0.005072099766279092 },
    "1/capacity-aware/wt99S": { n: 250, mean: -0.09815018452129169, standardError: 0.09424812540944072, lower: -0.2837753422211784, upper: 0.087474973178595 },
    "1/fairness-first/awtS": { n: 250, mean: -0.011319662974904887, standardError: 0.017866112470447153, lower: -0.04650763016685993, upper: 0.023868304217050156 },
    "1/fairness-first/maxWaitS": { n: 250, mean: -0.026442662596972012, standardError: 0.031323582489438846, lower: -0.08813561313649615, upper: 0.03525028794255213 },
    "1/fairness-first/pctOverLongWait": { n: 250, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "1/fairness-first/wt95S": { n: 250, mean: -0.05427555238855315, standardError: 0.03824305100059018, lower: -0.12959665126526648, upper: 0.021045546488160163 },
    "1/fairness-first/wt99S": { n: 250, mean: -0.032009240555288275, standardError: 0.03079114066436744, lower: -0.09265352729046056, upper: 0.028635046179884008 },
    "1/zoned-uppeak/awtS": { n: 250, mean: 0.6060414443481409, standardError: 0.34595417375525983, lower: -0.07532805537690601, upper: 1.2874109440731878 },
    "1/zoned-uppeak/maxWaitS": { n: 250, mean: 13.74790521426316, standardError: 1.0019832457449043, lower: 11.77446227101061, upper: 15.72134815751571 },
    "1/zoned-uppeak/pctOverLongWait": { n: 250, mean: 1.9552698252799883, standardError: 0.3009951218777478, lower: 1.3624488357618574, upper: 2.548090814798119 },
    "1/zoned-uppeak/wt95S": { n: 250, mean: 9.854254277386437, standardError: 0.9256418534940091, lower: 8.031168520699019, upper: 11.677340034073854 },
    "1/zoned-uppeak/wt99S": { n: 250, mean: 12.9723114373676, standardError: 0.9717926348159365, lower: 11.058330015396237, upper: 14.886292859338962 },
    "2.25/capacity-aware/awtS": { n: 250, mean: -0.33908952910070667, standardError: 0.14992324366644783, lower: -0.6343688848180062, upper: -0.043810173383407036 },
    "2.25/capacity-aware/maxWaitS": { n: 250, mean: -2.438147879818839, standardError: 0.8267408807327832, lower: -4.066444524407526, upper: -0.8098512352301521 },
    "2.25/capacity-aware/pctOverLongWait": { n: 250, mean: -0.447288270279569, standardError: 0.19032086976823845, lower: -0.8221322399694962, upper: -0.0724443005896418 },
    "2.25/capacity-aware/wt95S": { n: 250, mean: -1.656144845139069, standardError: 0.6231446244490915, lower: -2.8834511568634675, upper: -0.4288385334146705 },
    "2.25/capacity-aware/wt99S": { n: 250, mean: -2.2099447355148594, standardError: 0.7764271730111959, lower: -3.739146677798198, upper: -0.6807427932315206 },
    "2.25/fairness-first/awtS": { n: 250, mean: -0.2335235816598034, standardError: 0.08942443373848943, lower: -0.40964830077562175, upper: -0.057398862543985046 },
    "2.25/fairness-first/maxWaitS": { n: 250, mean: -2.6669370201795455, standardError: 0.6406988924695155, lower: -3.9288171099546094, upper: -1.4050569304044813 },
    "2.25/fairness-first/pctOverLongWait": { n: 250, mean: -0.5038369559661752, standardError: 0.13310280681677072, lower: -0.765987841178219, upper: -0.24168607075413123 },
    "2.25/fairness-first/wt95S": { n: 250, mean: -1.3334279733842305, standardError: 0.4882587248429583, lower: -2.295071532909512, upper: -0.3717844138589489 },
    "2.25/fairness-first/wt99S": { n: 250, mean: -2.4437185453966928, standardError: 0.6067911568729571, lower: -3.6388160998161334, upper: -1.248620990977252 },
    "2.25/zoned-uppeak/awtS": { n: 250, mean: 5.719118586784921, standardError: 0.49837221598158665, lower: 4.737556133601557, upper: 6.700681039968285 },
    "2.25/zoned-uppeak/maxWaitS": { n: 250, mean: 31.144076514224874, standardError: 1.751032006218386, lower: 27.69535442155948, upper: 34.59279860689027 },
    "2.25/zoned-uppeak/pctOverLongWait": { n: 250, mean: 8.152433792409825, standardError: 0.615575636848255, lower: 6.940034880815987, upper: 9.364832704003664 },
    "2.25/zoned-uppeak/wt95S": { n: 250, mean: 24.31872786181391, standardError: 1.5329367354850865, lower: 21.299552445515758, upper: 27.337903278112066 },
    "2.25/zoned-uppeak/wt99S": { n: 250, mean: 29.624410212224536, standardError: 1.6520770466817092, lower: 26.370583560602487, upper: 32.87823686384658 },
    "2.5/capacity-aware/awtS": { n: 250, mean: -0.433975721736257, standardError: 0.17845023021554177, lower: -0.7854400291846781, upper: -0.08251141428783587 },
    "2.5/capacity-aware/maxWaitS": { n: 250, mean: -2.1494546114220383, standardError: 0.9792407436836098, lower: -4.078105358402482, upper: -0.2208038644415946 },
    "2.5/capacity-aware/pctOverLongWait": { n: 250, mean: -0.5399557625960161, standardError: 0.20274153773937836, lower: -0.9392626957758232, upper: -0.14064882941620888 },
    "2.5/capacity-aware/wt95S": { n: 250, mean: -1.4673263959591911, standardError: 0.7953066718132978, lower: -3.033712207175842, upper: 0.09905941525745954 },
    "2.5/capacity-aware/wt99S": { n: 250, mean: -2.032065503979393, standardError: 0.8932615505691242, lower: -3.7913770602708863, upper: -0.27275394768789996 },
    "2.5/fairness-first/awtS": { n: 250, mean: -0.656376527431679, standardError: 0.13940604379233987, lower: -0.9309418702525802, upper: -0.3818111846107776 },
    "2.5/fairness-first/maxWaitS": { n: 250, mean: -5.220283380119343, standardError: 0.8788181048838749, lower: -6.951148037637977, upper: -3.4894187226007096 },
    "2.5/fairness-first/pctOverLongWait": { n: 250, mean: -1.190689090116263, standardError: 0.22654416713451442, lower: -1.6368761794365712, upper: -0.7445020007959549 },
    "2.5/fairness-first/wt95S": { n: 250, mean: -3.315242170050398, standardError: 0.7526953135920564, lower: -4.797703340270083, upper: -1.8327809998307127 },
    "2.5/fairness-first/wt99S": { n: 250, mean: -4.74700058928546, standardError: 0.8164343169495866, lower: -6.3549980765244545, upper: -3.139003102046466 },
    "2.5/zoned-uppeak/awtS": { n: 250, mean: 6.992429313609337, standardError: 0.5998243522303107, lower: 5.811053137783237, upper: 8.173805489435438 },
    "2.5/zoned-uppeak/maxWaitS": { n: 250, mean: 29.92480295302053, standardError: 2.146815680094189, lower: 25.69657032304659, upper: 34.15303558299447 },
    "2.5/zoned-uppeak/pctOverLongWait": { n: 250, mean: 9.090728254893333, standardError: 0.7319940515626159, lower: 7.649038983447316, upper: 10.532417526339351 },
    "2.5/zoned-uppeak/wt95S": { n: 250, mean: 24.610265702875452, standardError: 1.8878964581249449, lower: 20.8919840263107, upper: 28.328547379440206 },
    "2.5/zoned-uppeak/wt99S": { n: 250, mean: 29.309989706542297, standardError: 2.0735431090997847, lower: 25.22607010652863, upper: 33.39390930655596 },
    "2.75/capacity-aware/awtS": { n: 250, mean: -0.8152146541119036, standardError: 0.2832834756738301, lower: -1.373151903444816, upper: -0.2572774047789912 },
    "2.75/capacity-aware/maxWaitS": { n: 250, mean: -4.105116573522699, standardError: 1.1134015940660502, lower: -6.298002061525343, upper: -1.9122310855200557 },
    "2.75/capacity-aware/pctOverLongWait": { n: 250, mean: -0.8272443896769403, standardError: 0.3138604310334318, lower: -1.445404079890782, upper: -0.2090846994630985 },
    "2.75/capacity-aware/wt95S": { n: 250, mean: -2.643885782930692, standardError: 0.9112693761613337, lower: -4.438664415632079, upper: -0.8491071502293042 },
    "2.75/capacity-aware/wt99S": { n: 250, mean: -3.934788368745192, standardError: 1.042437687788866, lower: -5.987907827063145, upper: -1.8816689104272384 },
    "2.75/fairness-first/awtS": { n: 250, mean: -0.7731753104297978, standardError: 0.1807154057773227, lower: -1.1291009646588246, upper: -0.41724965620077115 },
    "2.75/fairness-first/maxWaitS": { n: 250, mean: -6.137661621068925, standardError: 0.8608399377565917, lower: -7.833117615617774, upper: -4.442205626520075 },
    "2.75/fairness-first/pctOverLongWait": { n: 250, mean: -1.0635691611595552, standardError: 0.22087582195951094, lower: -1.4985922356791825, upper: -0.628546086639928 },
    "2.75/fairness-first/wt95S": { n: 250, mean: -3.4847098985525844, standardError: 0.7185388062428812, lower: -4.89989856827824, upper: -2.069521228826929 },
    "2.75/fairness-first/wt99S": { n: 250, mean: -5.696405323137892, standardError: 0.8129509057892786, lower: -7.29754210367151, upper: -4.095268542604274 },
    "2.75/zoned-uppeak/awtS": { n: 250, mean: 8.66528913499311, standardError: 0.6777858729699254, lower: 7.330364869813028, upper: 10.000213400173191 },
    "2.75/zoned-uppeak/maxWaitS": { n: 250, mean: 33.56374972470456, standardError: 2.376389747646805, lower: 28.883362504831577, upper: 38.244136944577534 },
    "2.75/zoned-uppeak/pctOverLongWait": { n: 250, mean: 10.751071699247003, standardError: 0.7925655029988298, lower: 9.190084721070873, upper: 12.312058677423133 },
    "2.75/zoned-uppeak/wt95S": { n: 250, mean: 27.187538545379876, standardError: 2.022017492034672, lower: 23.20510054780387, upper: 31.169976542955883 },
    "2.75/zoned-uppeak/wt99S": { n: 250, mean: 32.39580433313112, standardError: 2.263866459483191, lower: 27.937035877764497, upper: 36.854572788497734 },
    "2/capacity-aware/awtS": { n: 250, mean: -0.19155864940272146, standardError: 0.14568834830249244, lower: -0.47849722257011174, upper: 0.09537992376466878 },
    "2/capacity-aware/maxWaitS": { n: 250, mean: -0.519286698868784, standardError: 0.6750658821308241, lower: -1.8488538418116107, upper: 0.8102804440740429 },
    "2/capacity-aware/pctOverLongWait": { n: 250, mean: -0.27935410255577775, standardError: 0.1790255205824887, lower: -0.6319514655914992, upper: 0.07324326047994367 },
    "2/capacity-aware/wt95S": { n: 250, mean: -0.9207004075501145, standardError: 0.5046759043144987, lower: -1.9146782073072637, upper: 0.07327739220703455 },
    "2/capacity-aware/wt99S": { n: 250, mean: -0.539836422798944, standardError: 0.628310674480548, lower: -1.7773174605203708, upper: 0.697644614922483 },
    "2/fairness-first/awtS": { n: 250, mean: -0.26250327352862823, standardError: 0.09271318621722517, lower: -0.44510531189986025, upper: -0.07990123515739622 },
    "2/fairness-first/maxWaitS": { n: 250, mean: -2.2108881206741295, standardError: 0.491264655402724, lower: -3.1784519712584367, upper: -1.2433242700898224 },
    "2/fairness-first/pctOverLongWait": { n: 250, mean: -0.5431220169700723, standardError: 0.14063547894593809, lower: -0.8201087776523586, upper: -0.26613525628778617 },
    "2/fairness-first/wt95S": { n: 250, mean: -1.6547939976491208, standardError: 0.45627396185145397, lower: -2.5534423872598953, upper: -0.7561456080383463 },
    "2/fairness-first/wt99S": { n: 250, mean: -2.0455170183992357, standardError: 0.4769953403268623, lower: -2.9849769268656567, upper: -1.106057109932815 },
    "2/zoned-uppeak/awtS": { n: 250, mean: 3.906512546906603, standardError: 0.42492228815447436, lower: 3.0696124345042604, upper: 4.743412659308945 },
    "2/zoned-uppeak/maxWaitS": { n: 250, mean: 27.429983276320826, standardError: 1.5609431049985627, lower: 24.35564828273712, upper: 30.50431826990453 },
    "2/zoned-uppeak/pctOverLongWait": { n: 250, mean: 5.939270474789502, standardError: 0.5044773411251526, lower: 4.945683752554327, upper: 6.932857197024678 },
    "2/zoned-uppeak/wt95S": { n: 250, mean: 19.17080261223189, standardError: 1.3874815141347343, lower: 16.438106616974046, upper: 21.90349860748973 },
    "2/zoned-uppeak/wt99S": { n: 250, mean: 25.912770188136417, standardError: 1.486913957040252, lower: 22.98423833073661, upper: 28.841302045536224 },
    "3/capacity-aware/awtS": { n: 250, mean: -0.8852213896309014, standardError: 0.3256890057404654, lower: -1.5266778938218841, upper: -0.2437648854399186 },
    "3/capacity-aware/maxWaitS": { n: 250, mean: -5.335446146380738, standardError: 1.58737517796038, lower: -8.4618400821509, upper: -2.2090522106105754 },
    "3/capacity-aware/pctOverLongWait": { n: 250, mean: -0.9866164476426619, standardError: 0.3746125244163386, lower: -1.724429625560469, upper: -0.24880326972485467 },
    "3/capacity-aware/wt95S": { n: 250, mean: -4.670503252108537, standardError: 1.2933210263397692, lower: -7.217746695179194, upper: -2.123259809037879 },
    "3/capacity-aware/wt99S": { n: 250, mean: -5.361836505036051, standardError: 1.481767707943305, lower: -8.280232635109359, upper: -2.4434403749627425 },
    "3/fairness-first/awtS": { n: 250, mean: -1.0993882672352195, standardError: 0.24289713459081427, lower: -1.5777831288560333, upper: -0.6209934056144057 },
    "3/fairness-first/maxWaitS": { n: 250, mean: -10.183587697583851, standardError: 1.3355248489480578, lower: -12.813953125236887, upper: -7.553222269930815 },
    "3/fairness-first/pctOverLongWait": { n: 250, mean: -1.713801388803997, standardError: 0.2900617154618154, lower: -2.2850886312970533, upper: -1.1425141463109405 },
    "3/fairness-first/wt95S": { n: 250, mean: -7.78556218594768, standardError: 1.1269098073600754, lower: -10.005052598048856, upper: -5.566071773846504 },
    "3/fairness-first/wt99S": { n: 250, mean: -9.65100760613461, standardError: 1.2803811942515742, lower: -12.172765572846494, upper: -7.129249639422729 },
    "3/zoned-uppeak/awtS": { n: 250, mean: 9.996565271900467, standardError: 0.7268484036096369, lower: 8.56501054380574, upper: 11.428119999995195 },
    "3/zoned-uppeak/maxWaitS": { n: 250, mean: 37.21058404196069, standardError: 2.5812479778570996, lower: 32.12672098504898, upper: 42.2944470988724 },
    "3/zoned-uppeak/pctOverLongWait": { n: 250, mean: 11.910280221326435, standardError: 0.7978037560303748, lower: 10.338976310682648, upper: 13.481584131970221 },
    "3/zoned-uppeak/wt95S": { n: 250, mean: 31.38013591881389, standardError: 2.3521118045360265, lower: 26.747565002968066, upper: 36.01270683465972 },
    "3/zoned-uppeak/wt99S": { n: 250, mean: 35.82815899479287, standardError: 2.4939013169312543, lower: 30.916328406839895, upper: 40.73998958274585 },
  }),
  "prepositioning": Object.freeze({
    "park-lobby/awtS": { n: 500, mean: 1.9751251824009144, standardError: 0.11607201169328751, lower: 1.7470750895560472, upper: 2.2031752752457816 },
    "park-lobby/pctOverLongWait": { n: 500, mean: 0.014285714285714285, standardError: 0.01428571428571428, lower: -0.013781848442681084, upper: 0.04235327701410965 },
    "park-lobby/ttdMeanS": { n: 500, mean: 1.8465474588559985, standardError: 0.1355042775644605, lower: 1.580318222120551, upper: 2.112776695591446 },
    "park-lobby/wt95S": { n: 500, mean: 1.6145853726173784, standardError: 0.16073282206957928, lower: 1.2987888730008834, upper: 1.9303818722338735 },
    "park-predicted-demand-t3/awtS": { n: 500, mean: -0.976142205305244, standardError: 0.15322773231216208, lower: -1.277193234493341, upper: -0.675091176117147 },
    "park-predicted-demand-t3/pctOverLongWait": { n: 500, mean: 0.03125, standardError: 0.03125, lower: -0.030147793468364895, upper: 0.0926477934683649 },
    "park-predicted-demand-t3/ttdMeanS": { n: 500, mean: -0.5965505930067683, standardError: 0.1725242010632659, lower: -0.9355139614924342, upper: -0.2575872245211024 },
    "park-predicted-demand-t3/wt95S": { n: 500, mean: -1.0335699075688667, standardError: 0.2123080643066442, lower: -1.4506978014558323, upper: -0.6164420136819011 },
    "park-predicted-demand/awtS": { n: 500, mean: -0.005801020408163272, standardError: 0.00796541789669584, lower: -0.02145091106130083, upper: 0.009848870244974287 },
    "park-predicted-demand/pctOverLongWait": { n: 500, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "park-predicted-demand/ttdMeanS": { n: 500, mean: -0.005801020408163225, standardError: 0.007965417896695826, lower: -0.021450911061300756, upper: 0.009848870244974304 },
    "park-predicted-demand/wt95S": { n: 500, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "park-zone-center/awtS": { n: 500, mean: -4.880504962777228, standardError: 0.197616637049655, lower: -5.268768177736829, upper: -4.492241747817626 },
    "park-zone-center/pctOverLongWait": { n: 500, mean: 0.017142857142857147, standardError: 0.02833428961153728, lower: -0.038526354429686945, upper: 0.07281206871540125 },
    "park-zone-center/ttdMeanS": { n: 500, mean: -4.443277121794806, standardError: 0.22854954917925924, lower: -4.89231513836428, upper: -3.9942391052253323 },
    "park-zone-center/wt95S": { n: 500, mean: -6.022761112517066, standardError: 0.29996354658773017, lower: -6.61210830872288, upper: -5.433413916311252 },
  }),
  "capacity-reassignment": Object.freeze({
    "1/awtS": { n: 60, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "1/pctOverLongWait": { n: 60, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "1/ttdMeanS": { n: 60, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "1/wt95S": { n: 60, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "16/awtS": { n: 60, mean: -6.407829925219896, standardError: 0.739706181314329, lower: -7.8879785751731895, upper: -4.927681275266602 },
    "16/pctOverLongWait": { n: 60, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "16/ttdMeanS": { n: 60, mean: -6.448989906851944, standardError: 0.7544833761711705, lower: -7.958707655414887, upper: -4.9392721582890005 },
    "16/wt95S": { n: 60, mean: -6.122647788270346, standardError: 1.2422073178624597, lower: -8.60829888994055, upper: -3.636996686600141 },
    "2/awtS": { n: 60, mean: -0.1345987168756949, standardError: 0.14900269287501058, lower: -0.43275241664129666, upper: 0.16355498288990683 },
    "2/pctOverLongWait": { n: 60, mean: -0.25641025641025644, standardError: 0.25641025641025633, lower: -0.7694859943816068, upper: 0.25666548156109387 },
    "2/ttdMeanS": { n: 60, mean: 0.10320923392404993, standardError: 0.29393263045464213, lower: -0.4849486010850156, upper: 0.6913670689331154 },
    "2/wt95S": { n: 60, mean: -0.34400640042781255, standardError: 0.3440064004278122, lower: -1.0323616177166464, upper: 0.3443488168610213 },
    "3/awtS": { n: 60, mean: -0.5195825241702205, standardError: 0.25978788532417785, lower: -1.0394168819872251, upper: 0.00025183364678404985 },
    "3/pctOverLongWait": { n: 60, mean: -0.3154421993981022, standardError: 0.13151602728830428, lower: -0.5786051621465295, upper: -0.05227923664967493 },
    "3/ttdMeanS": { n: 60, mean: -0.584603523476159, standardError: 0.33381994521096187, lower: -1.2525756909569723, upper: 0.08336864400465427 },
    "3/wt95S": { n: 60, mean: -0.7641782067257286, standardError: 0.4755211805626644, lower: -1.7156938912146962, upper: 0.18733747776323917 },
    "4/awtS": { n: 60, mean: -3.6954733201727765, standardError: 0.612885090030863, lower: -4.921853552623745, upper: -2.4690930877218085 },
    "4/pctOverLongWait": { n: 60, mean: -3.3975234844268245, standardError: 0.7461625818525548, lower: -4.890591362016195, upper: -1.904455606837454 },
    "4/ttdMeanS": { n: 60, mean: -3.9152163551220798, standardError: 0.6545797964312763, lower: -5.225027502371022, upper: -2.6054052078731376 },
    "4/wt95S": { n: 60, mean: -4.954186698131963, standardError: 1.2582139142815012, lower: -7.471866925255593, upper: -2.436506471008332 },
    "8/awtS": { n: 60, mean: -10.35569770182857, standardError: 0.9459147368436419, lower: -12.248468718318277, upper: -8.462926685338862 },
    "8/pctOverLongWait": { n: 60, mean: -3.1352292047426715, standardError: 0.576173450349037, lower: -4.288149615868264, upper: -1.982308793617079 },
    "8/ttdMeanS": { n: 60, mean: -10.362099585852738, standardError: 0.9428891837355515, lower: -12.248816484556995, upper: -8.47538268714848 },
    "8/wt95S": { n: 60, mean: -9.468464251426326, standardError: 1.5691425049296572, lower: -12.608311151352416, upper: -6.328617351500236 },
  }),
  "forecast-causality": Object.freeze({
    "partialCorrelationWithFutureGivenPast": { n: 100, mean: -0.01394223164765208, standardError: 0.008955159208326503, lower: -0.03171121035296866, upper: 0.0038267470576644966 },
  }),
  "destination-disclosure": Object.freeze({
    "control/garden-residential/ttdMeanS": { n: 30, mean: -0.010298960627877088, standardError: 0.01029896062787709, lower: -0.03136270018716893, upper: 0.010764778931414755 },
    "control/midtown-down-peak/ttdMeanS": { n: 30, mean: -0.483662150116074, standardError: 0.2880161280401028, lower: -1.0727212725959798, upper: 0.10539697236383178 },
    "control/midtown-up-peak/ttdMeanS": { n: 30, mean: 0.5271509995413051, standardError: 0.393391296022742, lower: -0.27742454004140715, upper: 1.3317265391240172 },
    "control/secure-up-peak/ttdMeanS": { n: 30, mean: -0.49274695393197304, standardError: 0.3533894917560226, lower: -1.2155096176896003, upper: 0.23001570982565428 },
    "destination-eta+ride0.3/awtS": { n: 150, mean: 0.1822679630099019, standardError: 0.06799631009138127, lower: 0.04790635823509304, upper: 0.31662956778471074 },
    "destination-eta+ride0.3/rideMeanS": { n: 150, mean: -1.1754399784738851, standardError: 0.1393919143098174, lower: -1.4508802380134047, upper: -0.8999997189343656 },
    "destination-eta+ride0.3/ttdMeanS": { n: 150, mean: -0.9931720154639856, standardError: 0.14677659835799667, lower: -1.2832045079957783, upper: -0.7031395229321928 },
    "destination-eta+ride0.3/wt95S": { n: 150, mean: 0.3687378780586761, standardError: 0.34416825773756227, lower: -0.3113431345730715, upper: 1.0488188906904237 },
    "destination-eta+ride0.5/awtS": { n: 150, mean: 0.2954662289981642, standardError: 0.07164588677091559, lower: 0.15389301261160845, upper: 0.43703944538471995 },
    "destination-eta+ride0.5/rideMeanS": { n: 150, mean: -1.512123042594034, standardError: 0.15242978070102545, lower: -1.8133262979315314, upper: -1.2109197872565365 },
    "destination-eta+ride0.5/ttdMeanS": { n: 150, mean: -1.2166568135958724, standardError: 0.1590003076077956, lower: -1.530843516685509, upper: -0.9024701105062358 },
    "destination-eta+ride0.5/wt95S": { n: 150, mean: 0.37361840175737426, standardError: 0.34259154474858733, lower: -0.3033470052307251, upper: 1.0505838087454737 },
    "destination-eta+ride0.7/awtS": { n: 150, mean: 0.3924103725011229, standardError: 0.07761739392591853, lower: 0.2390373792856161, upper: 0.5457833657166297 },
    "destination-eta+ride0.7/rideMeanS": { n: 150, mean: -1.8254567016504128, standardError: 0.16837016573333427, lower: -2.158158367869192, upper: -1.492755035431634 },
    "destination-eta+ride0.7/ttdMeanS": { n: 150, mean: -1.4330463291492928, standardError: 0.1789991977949242, lower: -1.7867511027878542, upper: -1.0793415555107313 },
    "destination-eta+ride0.7/wt95S": { n: 150, mean: 0.6201849104374864, standardError: 0.3306501737554105, lower: -0.03318419010842033, upper: 1.2735540109833932 },
    "destination-eta+ride1/awtS": { n: 150, mean: 0.5139006721684526, standardError: 0.08610589568971445, lower: 0.3437542876088473, upper: 0.6840470567280579 },
    "destination-eta+ride1/rideMeanS": { n: 150, mean: -2.0758113863664462, standardError: 0.1670641262132753, lower: -2.4059323012830056, upper: -1.7456904714498866 },
    "destination-eta+ride1/ttdMeanS": { n: 150, mean: -1.561910714197996, standardError: 0.17918132736647488, lower: -1.9159753782699884, upper: -1.2078460501260035 },
    "destination-eta+ride1/wt95S": { n: 150, mean: 1.0104890557365185, standardError: 0.363758237132459, lower: 0.29169798566979566, upper: 1.7292801258032413 },
    "destination-eta+ride2/awtS": { n: 150, mean: 0.7477528863606464, standardError: 0.09502799144738838, lower: 0.5599763230112726, upper: 0.9355294497100202 },
    "destination-eta+ride2/rideMeanS": { n: 150, mean: -2.547262434421546, standardError: 0.17210130209890642, lower: -2.887336875266451, upper: -2.207187993576641 },
    "destination-eta+ride2/ttdMeanS": { n: 150, mean: -1.7995095480609007, standardError: 0.18423648039954615, lower: -2.1635632611414772, upper: -1.4354558349803241 },
    "destination-eta+ride2/wt95S": { n: 150, mean: 1.3305439852735406, standardError: 0.35831151577429454, lower: 0.6225157083857518, upper: 2.0385722621613294 },
    "destination-eta-unpriced/awtS": { n: 150, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "destination-eta-unpriced/rideMeanS": { n: 150, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "destination-eta-unpriced/ttdMeanS": { n: 150, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "destination-eta-unpriced/wt95S": { n: 150, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "destination-eta/awtS": { n: 150, mean: 0.2954662289981642, standardError: 0.07164588677091559, lower: 0.15389301261160845, upper: 0.43703944538471995 },
    "destination-eta/rideMeanS": { n: 150, mean: -1.512123042594034, standardError: 0.15242978070102545, lower: -1.8133262979315314, upper: -1.2109197872565365 },
    "destination-eta/ttdMeanS": { n: 150, mean: -1.2166568135958724, standardError: 0.1590003076077956, lower: -1.530843516685509, upper: -0.9024701105062358 },
    "destination-eta/wt95S": { n: 150, mean: 0.37361840175737426, standardError: 0.34259154474858733, lower: -0.3033470052307251, upper: 1.0505838087454737 },
    "eta-deferred/awtS": { n: 150, mean: 1.0807425352842992, standardError: 0.06497113291441807, lower: 0.9523587204760142, upper: 1.2091263500925842 },
    "eta-deferred/rideMeanS": { n: 150, mean: 0.04178984576931768, standardError: 0.12958213651800538, lower: -0.21426616358337866, upper: 0.297845855122014 },
    "eta-deferred/ttdMeanS": { n: 150, mean: 1.122532381053615, standardError: 0.13886394151119685, lower: 0.848135402721631, upper: 1.396929359385599 },
    "eta-deferred/wt95S": { n: 150, mean: 1.8949586449919775, standardError: 0.22848055472523252, lower: 1.4434780580091853, upper: 2.34643923197477 },
  }),
  "destination-dispatch": Object.freeze({
    "midtown-interfloor-binding/awtS": { n: 150, mean: 6.961670623532294, standardError: 0.7165009281274347, lower: 5.545855347725958, upper: 8.37748589933863 },
    "midtown-interfloor-binding/rideMeanS": { n: 150, mean: -1.0190148378359796, standardError: 0.30819603228853537, lower: -1.628014258949644, upper: -0.4100154167223151 },
    "midtown-interfloor-binding/ttdMeanS": { n: 150, mean: 5.942655785696314, standardError: 0.7696984084469723, lower: 4.421721587758711, upper: 7.463589983633916 },
    "midtown-interfloor-binding/wt95S": { n: 150, mean: 37.34334394706107, standardError: 4.035659767167156, lower: 29.368827066468743, upper: 45.317860827653405 },
    "midtown-interfloor-mix/awtS": { n: 150, mean: -0.010263039844002826, standardError: 0.04341996241191674, lower: -0.09606145774471898, upper: 0.07553537805671333 },
    "midtown-interfloor-mix/rideMeanS": { n: 150, mean: 0.11845433668652537, standardError: 0.06494104032138054, lower: -0.00987001476136666, upper: 0.2467786881344174 },
    "midtown-interfloor-mix/ttdMeanS": { n: 150, mean: 0.10819129684252356, standardError: 0.07411430606504646, lower: -0.03825954859729701, upper: 0.2546421422823441 },
    "midtown-interfloor-mix/wt95S": { n: 150, mean: 0.1522821775770023, standardError: 0.24485636056663015, lower: -0.33155721754367107, upper: 0.6361215726976757 },
    "secure-interfloor-mix/awtS": { n: 150, mean: -0.05614971222074281, standardError: 0.028132573182453907, lower: -0.11174004755157683, upper: -0.0005593768899087859 },
    "secure-interfloor-mix/rideMeanS": { n: 150, mean: 0.017415872076990527, standardError: 0.031610548431983146, lower: -0.04504698817859007, upper: 0.07987873233257112 },
    "secure-interfloor-mix/ttdMeanS": { n: 150, mean: -0.04061164309093518, standardError: 0.04888457044634489, lower: -0.1372081984785875, upper: 0.055984912296717135 },
    "secure-interfloor-mix/wt95S": { n: 150, mean: -0.22138544826820217, standardError: 0.11615664791656582, lower: -0.45091251522753817, upper: 0.008141618691133806 },
  }),
  "access-control": Object.freeze({
    "difference-of-differences/absolute": { n: 150, mean: 1.0198874336002008, standardError: 0.20019156511627376, lower: 0.625335677340711, upper: 1.4144391898596906 },
    "difference-of-differences/relative": { n: 150, mean: 0.01773961364007575, standardError: 0.0035577341279079693, lower: 0.010730844452832154, upper: 0.024748382827319348 },
    "midtown-office/absolute": { n: 150, mean: -1.561910714197996, standardError: 0.17918132736647488, lower: -1.9159753782699884, upper: -1.2078460501260035 },
    "midtown-office/relative": { n: 150, mean: -0.028525773527358408, standardError: 0.003086751585385648, lower: -0.0346252353363334, upper: -0.022426311718383413 },
    "secure-tower/absolute": { n: 150, mean: -0.542023280597795, standardError: 0.08927885901427864, lower: -0.7184394824990636, upper: -0.3656070786965264 },
    "secure-tower/relative": { n: 150, mean: -0.010786159887282657, standardError: 0.001769021417337921, lower: -0.01428176951955677, upper: -0.007290550255008544 },
  }),
  "mixed-use-high-rise": Object.freeze({
    "up-peak-1pct/destination-eta+ride1−collective/awtS": { n: 150, mean: 0.5722989475015055, standardError: 0.076666560359278, lower: 0.4208048139434696, upper: 0.7237930810595413 },
    "up-peak-1pct/destination-eta+ride1−collective/rideMeanS": { n: 150, mean: -0.7060268699225966, standardError: 0.1471633094200422, lower: -0.9968235086089494, upper: -0.41523023123624364 },
    "up-peak-1pct/destination-eta+ride1−collective/ttdMeanS": { n: 150, mean: -0.1706153819475601, standardError: 0.1702570569008219, lower: -0.50704556997816, upper: 0.16581480608303972 },
    "up-peak-1pct/destination-eta+ride1−collective/wt95S": { n: 150, mean: 0.08359263041224493, standardError: 0.060343406882192946, lower: -0.03564673677362801, upper: 0.20283199759811787 },
    "up-peak-1pct/destination-eta+ride1−eta/awtS": { n: 150, mean: 0.5778040112166882, standardError: 0.07568087559712015, lower: 0.4282576037377237, upper: 0.7273504186956528 },
    "up-peak-1pct/destination-eta+ride1−eta/rideMeanS": { n: 150, mean: -0.6991478023262565, standardError: 0.14726955152535937, lower: -0.9901543768127417, upper: -0.4081412278397714 },
    "up-peak-1pct/destination-eta+ride1−eta/ttdMeanS": { n: 150, mean: -0.16946724963458842, standardError: 0.16987352046314547, lower: -0.5051395646102157, upper: 0.1662050653410388 },
    "up-peak-1pct/destination-eta+ride1−eta/wt95S": { n: 150, mean: 0.10139818653428274, standardError: 0.052665926390099115, lower: -0.002670378027761211, upper: 0.2054667510963267 },
    "up-peak-1pct/destination-eta+ride1−nearest-car/awtS": { n: 150, mean: -1.7574925391552632, standardError: 0.22575178778966273, lower: -2.203581046714527, upper: -1.3114040315959994 },
    "up-peak-1pct/destination-eta+ride1−nearest-car/rideMeanS": { n: 150, mean: -1.1569413052658746, standardError: 0.18230250051238703, lower: -1.517173448604039, upper: -0.7967091619277102 },
    "up-peak-1pct/destination-eta+ride1−nearest-car/ttdMeanS": { n: 150, mean: -4.381996639002665, standardError: 0.40074016643782867, lower: -5.173864488713168, upper: -3.5901287892921623 },
    "up-peak-1pct/destination-eta+ride1−nearest-car/wt95S": { n: 150, mean: -11.266569890655031, standardError: 0.9204326131457056, lower: -13.085356863405828, upper: -9.447782917904235 },
    "up-peak-1pct/destination-panel−collective/awtS": { n: 150, mean: 0.5837174208128969, standardError: 0.07802284078670993, lower: 0.4295432592576136, upper: 0.7378915823681802 },
    "up-peak-1pct/destination-panel−collective/rideMeanS": { n: 150, mean: -0.6929238200896324, standardError: 0.16204855253405182, lower: -1.0131338953223754, upper: -0.37271374485688935 },
    "up-peak-1pct/destination-panel−collective/ttdMeanS": { n: 150, mean: -0.16274549943231922, standardError: 0.20971330898868323, lower: -0.5771417615307591, upper: 0.25165076266612063 },
    "up-peak-1pct/destination-panel−collective/wt95S": { n: 150, mean: 0.06987814231964465, standardError: 0.0504409494840884, lower: -0.029793838556068042, upper: 0.16955012319535734 },
    "up-peak-1pct/destination-panel−eta/awtS": { n: 150, mean: 0.5892224845280799, standardError: 0.07717141461080278, lower: 0.43673075231621866, upper: 0.7417142167399411 },
    "up-peak-1pct/destination-panel−eta/rideMeanS": { n: 150, mean: -0.6860447524932923, standardError: 0.162141322925931, lower: -1.006438143242888, upper: -0.36565136174369667 },
    "up-peak-1pct/destination-panel−eta/ttdMeanS": { n: 150, mean: -0.16159736711934755, standardError: 0.2095871131465746, lower: -0.5757442645708112, upper: 0.25254953033211613 },
    "up-peak-1pct/destination-panel−eta/wt95S": { n: 150, mean: 0.08768369844168247, standardError: 0.040987073647911154, lower: 0.006692700798493295, upper: 0.16867469608487165 },
    "up-peak-1pct/destination-panel−nearest-car/awtS": { n: 150, mean: -1.7460740658438718, standardError: 0.22885456888828717, lower: -2.1982937097415025, upper: -1.2938544219462411 },
    "up-peak-1pct/destination-panel−nearest-car/rideMeanS": { n: 150, mean: -1.14383825543291, standardError: 0.19450472031906882, lower: -1.5281821459061375, upper: -0.7594943649596826 },
    "up-peak-1pct/destination-panel−nearest-car/ttdMeanS": { n: 150, mean: -4.374126756487428, standardError: 0.4209550829209927, lower: -5.205939547554549, upper: -3.5423139654203064 },
    "up-peak-1pct/destination-panel−nearest-car/wt95S": { n: 150, mean: -11.280284378747632, standardError: 0.9241741130073476, lower: -13.106464604529357, upper: -9.454104152965908 },
    "up-peak-2pct/destination-eta+ride1−collective/awtS": { n: 238, mean: 0.6827179350230642, standardError: 0.059598900112144734, lower: 0.5653066708084972, upper: 0.8001291992376313 },
    "up-peak-2pct/destination-eta+ride1−collective/rideMeanS": { n: 238, mean: -0.7814334762839042, standardError: 0.2106127711590126, lower: -1.1963456923647842, upper: -0.3665212602030243 },
    "up-peak-2pct/destination-eta+ride1−collective/ttdMeanS": { n: 238, mean: -0.03960515156886264, standardError: 0.2610232485611048, lower: -0.5538272185077692, upper: 0.47461691537004386 },
    "up-peak-2pct/destination-eta+ride1−collective/wt95S": { n: 238, mean: 0.004611381474101925, standardError: 0.11563448201830342, lower: -0.22319132453253163, upper: 0.23241408748073547 },
    "up-peak-2pct/destination-eta+ride1−eta/awtS": { n: 238, mean: 0.6739522314544583, standardError: 0.05994238848540023, lower: 0.5558642868972834, upper: 0.7920401760116331 },
    "up-peak-2pct/destination-eta+ride1−eta/rideMeanS": { n: 238, mean: -0.771097224042806, standardError: 0.2087262736499293, lower: -1.1822929947352254, upper: -0.35990145335038665 },
    "up-peak-2pct/destination-eta+ride1−eta/ttdMeanS": { n: 238, mean: -0.10850733230403298, standardError: 0.2577855196306536, lower: -0.6163509955107723, upper: 0.39933633090270637 },
    "up-peak-2pct/destination-eta+ride1−eta/wt95S": { n: 238, mean: 0.17426403661850884, standardError: 0.05621981365184821, lower: 0.06350965386395543, upper: 0.28501841937306227 },
    "up-peak-2pct/destination-eta+ride1−nearest-car/awtS": { n: 238, mean: -4.301624403903193, standardError: 0.22609722446577474, lower: -4.747041364786367, upper: -3.8562074430200193 },
    "up-peak-2pct/destination-eta+ride1−nearest-car/rideMeanS": { n: 238, mean: -3.8587346760381904, standardError: 0.31299144619603203, lower: -4.4753353400953, upper: -3.242134011981081 },
    "up-peak-2pct/destination-eta+ride1−nearest-car/ttdMeanS": { n: 238, mean: -12.328414985504825, standardError: 0.5815212316420223, lower: -13.474025774399045, upper: -11.182804196610604 },
    "up-peak-2pct/destination-eta+ride1−nearest-car/wt95S": { n: 238, mean: -23.78912828784516, standardError: 0.9765326425467977, lower: -25.712921040605163, upper: -21.865335535085155 },
    "up-peak-2pct/destination-panel−collective/awtS": { n: 238, mean: 0.8526899878181485, standardError: 0.09681945191580711, lower: 0.661953342869898, upper: 1.043426632766399 },
    "up-peak-2pct/destination-panel−collective/rideMeanS": { n: 238, mean: -0.7901635121646926, standardError: 0.20461182020418645, lower: -1.193253710779311, upper: -0.3870733135500742 },
    "up-peak-2pct/destination-panel−collective/ttdMeanS": { n: 238, mean: 0.04149502732326189, standardError: 0.3026955285944627, lower: -0.5548224318496193, upper: 0.6378124864961432 },
    "up-peak-2pct/destination-panel−collective/wt95S": { n: 238, mean: 0.22056721499579146, standardError: 0.2911127036670399, lower: -0.35293180096176635, upper: 0.7940662309533493 },
    "up-peak-2pct/destination-panel−eta/awtS": { n: 238, mean: 0.8439242842495419, standardError: 0.09714673202476015, lower: 0.6525428896285264, upper: 1.0353056788705575 },
    "up-peak-2pct/destination-panel−eta/rideMeanS": { n: 238, mean: -0.7798272599235941, standardError: 0.20315052441401169, lower: -1.1800386707452666, upper: -0.3796158491019216 },
    "up-peak-2pct/destination-panel−eta/ttdMeanS": { n: 238, mean: -0.027407153411908435, standardError: 0.2994431356010343, lower: -0.6173173202964676, upper: 0.5625030134726506 },
    "up-peak-2pct/destination-panel−eta/wt95S": { n: 238, mean: 0.3902198701401983, standardError: 0.27244581548076496, lower: -0.14650492789087977, upper: 0.9269446681712764 },
    "up-peak-2pct/destination-panel−nearest-car/awtS": { n: 238, mean: -4.1316523511081105, standardError: 0.23930164037009974, lower: -4.603082328366159, upper: -3.660222373850062 },
    "up-peak-2pct/destination-panel−nearest-car/rideMeanS": { n: 238, mean: -3.8674647119189767, standardError: 0.3119260836100537, lower: -4.481966586101923, upper: -3.2529628377360305 },
    "up-peak-2pct/destination-panel−nearest-car/ttdMeanS": { n: 238, mean: -12.247314806612701, standardError: 0.620241585547689, lower: -13.469205622392407, upper: -11.025423990832996 },
    "up-peak-2pct/destination-panel−nearest-car/wt95S": { n: 238, mean: -23.57317245432347, standardError: 1.0333512081754137, lower: -25.608899145608536, upper: -21.537445763038402 },
    "up-peak-4pct/destination-eta+ride1−collective/awtS": { n: 200, mean: 0.8746942954337072, standardError: 0.08829543539315919, lower: 0.7005795337826055, upper: 1.048809057084809 },
    "up-peak-4pct/destination-eta+ride1−collective/rideMeanS": { n: 200, mean: -2.4707351572476806, standardError: 0.3110451165101312, lower: -3.0841026103073954, upper: -1.8573677041879657 },
    "up-peak-4pct/destination-eta+ride1−collective/ttdMeanS": { n: 200, mean: -2.1163583506713275, standardError: 0.40134963479253394, lower: -2.907802389533532, upper: -1.324914311809123 },
    "up-peak-4pct/destination-eta+ride1−collective/wt95S": { n: 200, mean: 0.25336859159793673, standardError: 0.15168291209489007, lower: -0.04574351955875128, upper: 0.5524807027546248 },
    "up-peak-4pct/destination-eta+ride1−eta/awtS": { n: 200, mean: 0.8764178109008983, standardError: 0.08797316262305768, lower: 0.7029385571478325, upper: 1.0498970646539643 },
    "up-peak-4pct/destination-eta+ride1−eta/rideMeanS": { n: 200, mean: -2.451719588792003, standardError: 0.31250415643227464, lower: -3.067964205174513, upper: -1.8354749724094928 },
    "up-peak-4pct/destination-eta+ride1−eta/ttdMeanS": { n: 200, mean: -2.0722858950293706, standardError: 0.40333920921514566, lower: -2.8676532881945205, upper: -1.2769185018642208 },
    "up-peak-4pct/destination-eta+ride1−eta/wt95S": { n: 200, mean: 0.2725685915979369, standardError: 0.15143528350529975, lower: -0.02605520674096462, upper: 0.5711923899368384 },
    "up-peak-4pct/destination-eta+ride1−nearest-car/awtS": { n: 200, mean: -6.619792030614814, standardError: 0.38866040409459174, lower: -7.386213457960691, upper: -5.853370603268937 },
    "up-peak-4pct/destination-eta+ride1−nearest-car/rideMeanS": { n: 200, mean: -7.371891454287547, standardError: 0.4334778789142667, lower: -8.226690994400922, upper: -6.517091914174172 },
    "up-peak-4pct/destination-eta+ride1−nearest-car/ttdMeanS": { n: 200, mean: -21.239007590100304, standardError: 0.7880325851976934, lower: -22.792973603564555, upper: -19.685041576636053 },
    "up-peak-4pct/destination-eta+ride1−nearest-car/wt95S": { n: 200, mean: -30.923566047357046, standardError: 1.8520335598329785, lower: -34.57569574584363, upper: -27.27143634887046 },
    "up-peak-4pct/destination-panel−collective/awtS": { n: 200, mean: 3.188042070868538, standardError: 0.3686307738050983, lower: 2.4611182040509716, upper: 3.9149659376861043 },
    "up-peak-4pct/destination-panel−collective/rideMeanS": { n: 200, mean: -3.1446115694017127, standardError: 0.33541525441594466, lower: -3.806035875389115, upper: -2.4831872634143104 },
    "up-peak-4pct/destination-panel−collective/ttdMeanS": { n: 200, mean: 0.4899579905450675, standardError: 0.7057089150084833, lower: -0.9016693227427439, upper: 1.881585303832879 },
    "up-peak-4pct/destination-panel−collective/wt95S": { n: 200, mean: 9.064080447740142, standardError: 1.7248459098801037, lower: 5.662759267926132, upper: 12.465401627554153 },
    "up-peak-4pct/destination-panel−eta/awtS": { n: 200, mean: 3.1897655863357297, standardError: 0.36836829628928636, lower: 2.463359313773188, upper: 3.9161718588982715 },
    "up-peak-4pct/destination-panel−eta/rideMeanS": { n: 200, mean: -3.125596000946036, standardError: 0.334409634530808, lower: -3.7850372682199134, upper: -2.4661547336721585 },
    "up-peak-4pct/destination-panel−eta/ttdMeanS": { n: 200, mean: 0.5340304461870233, standardError: 0.7045722067125382, lower: -0.8553553277376937, upper: 1.9234162201117404 },
    "up-peak-4pct/destination-panel−eta/wt95S": { n: 200, mean: 9.08328044774014, standardError: 1.7243024717812594, lower: 5.683030904241543, upper: 12.483529991238738 },
    "up-peak-4pct/destination-panel−nearest-car/awtS": { n: 200, mean: -4.306444255179986, standardError: 0.524964242527924, lower: -5.341650928731112, upper: -3.271237581628861 },
    "up-peak-4pct/destination-panel−nearest-car/rideMeanS": { n: 200, mean: -8.04576786644158, standardError: 0.4694257725578802, lower: -8.971455090677546, upper: -7.120080642205614 },
    "up-peak-4pct/destination-panel−nearest-car/ttdMeanS": { n: 200, mean: -18.632691248883926, standardError: 1.0494153407776206, lower: -20.70209269776858, upper: -16.56328979999927 },
    "up-peak-4pct/destination-panel−nearest-car/wt95S": { n: 200, mean: -22.112854191214836, standardError: 2.4547454653589926, lower: -26.953505576101918, upper: -17.272202806327755 },
  }),
  "matrix": Object.freeze({
    "garden-down-peak/auction-multi-round/awtS": { n: 51, mean: 0.006030685361151149, standardError: 0.033816113978172475, lower: -0.06189097850554525, upper: 0.07395234922784755 },
    "garden-down-peak/auction-multi-round/energyKJ": { n: 51, mean: -2.0280645542187385, standardError: 4.439215283317844, lower: -10.944490862103777, upper: 6.888361753666299 },
    "garden-down-peak/auction-multi-round/ttdMeanS": { n: 51, mean: 0.1464032277233116, standardError: 0.16792223642418086, lower: -0.190878510370816, upper: 0.4836849658174392 },
    "garden-down-peak/auction-multi-round/wt95S": { n: 51, mean: -0.09766788828032605, standardError: 0.09766788828032605, lower: -0.2938396152454146, upper: 0.09850383868476245 },
    "garden-down-peak/auction/awtS": { n: 51, mean: 0.006030685361151149, standardError: 0.033816113978172475, lower: -0.06189097850554525, upper: 0.07395234922784755 },
    "garden-down-peak/auction/energyKJ": { n: 51, mean: -2.0280645542187385, standardError: 4.439215283317844, lower: -10.944490862103777, upper: 6.888361753666299 },
    "garden-down-peak/auction/ttdMeanS": { n: 51, mean: 0.1464032277233116, standardError: 0.16792223642418086, lower: -0.190878510370816, upper: 0.4836849658174392 },
    "garden-down-peak/auction/wt95S": { n: 51, mean: -0.09766788828032605, standardError: 0.09766788828032605, lower: -0.2938396152454146, upper: 0.09850383868476245 },
    "garden-down-peak/capacity-aware/awtS": { n: 51, mean: -0.021314024915856253, standardError: 0.026615485430019806, lower: -0.07477280069930771, upper: 0.032144750867595204 },
    "garden-down-peak/capacity-aware/energyKJ": { n: 51, mean: -4.133609995395209, standardError: 4.046258364384743, lower: -12.260759103094124, upper: 3.993539112303707 },
    "garden-down-peak/capacity-aware/ttdMeanS": { n: 51, mean: 0.15851012696711786, standardError: 0.16666871060843474, lower: -0.17625383042753934, upper: 0.49327408436177506 },
    "garden-down-peak/capacity-aware/wt95S": { n: 51, mean: -0.09766788828032605, standardError: 0.09766788828032605, lower: -0.2938396152454146, upper: 0.09850383868476245 },
    "garden-down-peak/destination-eta/awtS": { n: 51, mean: -0.030932932335564982, standardError: 0.024575578207489495, lower: -0.08029443387936303, upper: 0.018428569208233055 },
    "garden-down-peak/destination-eta/energyKJ": { n: 51, mean: -5.232285855054819, standardError: 3.8646053692923408, lower: -12.994574184220497, upper: 2.5300024741108578 },
    "garden-down-peak/destination-eta/ttdMeanS": { n: 51, mean: 0.18048163349076432, standardError: 0.1647334023853505, lower: -0.1503951429376935, upper: 0.5113584099192221 },
    "garden-down-peak/destination-eta/wt95S": { n: 51, mean: -0.09766788828032605, standardError: 0.09766788828032605, lower: -0.2938396152454146, upper: 0.09850383868476245 },
    "garden-down-peak/destination-panel/awtS": { n: 51, mean: -0.030932932335564982, standardError: 0.024575578207489495, lower: -0.08029443387936303, upper: 0.018428569208233055 },
    "garden-down-peak/destination-panel/energyKJ": { n: 51, mean: -5.232285855054819, standardError: 3.8646053692923408, lower: -12.994574184220497, upper: 2.5300024741108578 },
    "garden-down-peak/destination-panel/ttdMeanS": { n: 51, mean: 0.18048163349076432, standardError: 0.1647334023853505, lower: -0.1503951429376935, upper: 0.5113584099192221 },
    "garden-down-peak/destination-panel/wt95S": { n: 51, mean: -0.09766788828032605, standardError: 0.09766788828032605, lower: -0.2938396152454146, upper: 0.09850383868476245 },
    "garden-down-peak/energy-aware/awtS": { n: 51, mean: -0.026969861605965956, standardError: 0.024450343235317865, lower: -0.07607982130525498, upper: 0.02214009809332307 },
    "garden-down-peak/energy-aware/energyKJ": { n: 51, mean: -5.699407734950722, standardError: 3.880156298765557, lower: -13.492931025211465, upper: 2.0941155553100197 },
    "garden-down-peak/energy-aware/ttdMeanS": { n: 51, mean: 0.42317510030493694, standardError: 0.16622631038878963, lower: 0.08929972990264329, upper: 0.7570504707072305 },
    "garden-down-peak/energy-aware/wt95S": { n: 51, mean: -0.06774100054975646, standardError: 0.09876288979154733, lower: -0.2661121027779726, upper: 0.13063010167845965 },
    "garden-down-peak/eta/awtS": { n: 51, mean: -0.030932932335564982, standardError: 0.024575578207489495, lower: -0.08029443387936303, upper: 0.018428569208233055 },
    "garden-down-peak/eta/energyKJ": { n: 51, mean: -5.232285855054819, standardError: 3.8646053692923408, lower: -12.994574184220497, upper: 2.5300024741108578 },
    "garden-down-peak/eta/ttdMeanS": { n: 51, mean: 0.18048163349076432, standardError: 0.1647334023853505, lower: -0.1503951429376935, upper: 0.5113584099192221 },
    "garden-down-peak/eta/wt95S": { n: 51, mean: -0.09766788828032605, standardError: 0.09766788828032605, lower: -0.2938396152454146, upper: 0.09850383868476245 },
    "garden-down-peak/fairness-first/awtS": { n: 51, mean: -0.030932932335564982, standardError: 0.024575578207489495, lower: -0.08029443387936303, upper: 0.018428569208233055 },
    "garden-down-peak/fairness-first/energyKJ": { n: 51, mean: -5.232285855054819, standardError: 3.8646053692923408, lower: -12.994574184220497, upper: 2.5300024741108578 },
    "garden-down-peak/fairness-first/ttdMeanS": { n: 51, mean: 0.18048163349076432, standardError: 0.1647334023853505, lower: -0.1503951429376935, upper: 0.5113584099192221 },
    "garden-down-peak/fairness-first/wt95S": { n: 51, mean: -0.09766788828032605, standardError: 0.09766788828032605, lower: -0.2938396152454146, upper: 0.09850383868476245 },
    "garden-down-peak/nearest-car/awtS": { n: 51, mean: 2.220394973241397, standardError: 0.5119627604407138, lower: 1.1920875057019398, upper: 3.2487024407808542 },
    "garden-down-peak/nearest-car/energyKJ": { n: 51, mean: -24.83452337751044, standardError: 5.492090623422911, lower: -35.8657120436697, upper: -13.803334711351175 },
    "garden-down-peak/nearest-car/ttdMeanS": { n: 51, mean: 3.06169227169671, standardError: 0.6491596714361678, lower: 1.7578166984252557, upper: 4.365567844968164 },
    "garden-down-peak/nearest-car/wt95S": { n: 51, mean: 5.302681984526287, standardError: 1.083352547683451, lower: 3.126704353259112, upper: 7.478659615793462 },
    "garden-down-peak/predictive-balanced/awtS": { n: 51, mean: 1.5574508140075423, standardError: 0.041537366736688466, lower: 1.4740205575558953, upper: 1.6408810704591892 },
    "garden-down-peak/predictive-balanced/energyKJ": { n: 51, mean: 3.093608515869779, standardError: 3.034833547341043, lower: -3.0020340593511645, upper: 9.189251091090723 },
    "garden-down-peak/predictive-balanced/ttdMeanS": { n: 51, mean: 2.1709815364443052, standardError: 0.16020137412781374, lower: 1.849207606668821, upper: 2.4927554662197893 },
    "garden-down-peak/predictive-balanced/wt95S": { n: 51, mean: 1.4200772097588892, standardError: 0.09311942758620478, lower: 1.2330413349670102, upper: 1.6071130845507682 },
    "garden-down-peak/zoned-uppeak/awtS": { n: 51, mean: -6.723511679516362, standardError: 0.4479112457301893, lower: -7.623167893540138, upper: -5.823855465492585 },
    "garden-down-peak/zoned-uppeak/energyKJ": { n: 51, mean: 72.17618494228057, standardError: 5.959266257712711, lower: 60.20664639891707, upper: 84.14572348564407 },
    "garden-down-peak/zoned-uppeak/ttdMeanS": { n: 51, mean: -6.517383947408244, standardError: 0.5302363536901895, lower: -7.582395007179759, upper: -5.452372887636729 },
    "garden-down-peak/zoned-uppeak/wt95S": { n: 51, mean: -6.617139354633087, standardError: 0.7002122229652483, lower: -8.02355699547427, upper: -5.210721713791904 },
    "garden-residential/auction-multi-round/awtS": { n: 65, mean: 0.029625086989604747, standardError: 0.22373570787966093, lower: -0.4173383713713532, upper: 0.4765885453505627 },
    "garden-residential/auction-multi-round/energyKJ": { n: 65, mean: -1.6497298710367598, standardError: 3.3179510418559954, lower: -8.278099058926745, upper: 4.978639316853227 },
    "garden-residential/auction-multi-round/ttdMeanS": { n: 65, mean: 1.781169171140372, standardError: 0.45625363668119806, lower: 0.8696977512520548, upper: 2.6926405910286895 },
    "garden-residential/auction-multi-round/wt95S": { n: 65, mean: -0.5827344128218341, standardError: 0.4535553145924324, lower: -1.4888153146565237, upper: 0.32334648901285556 },
    "garden-residential/auction/awtS": { n: 65, mean: 0.029625086989604747, standardError: 0.22373570787966093, lower: -0.4173383713713532, upper: 0.4765885453505627 },
    "garden-residential/auction/energyKJ": { n: 65, mean: -1.6497298710367598, standardError: 3.3179510418559954, lower: -8.278099058926745, upper: 4.978639316853227 },
    "garden-residential/auction/ttdMeanS": { n: 65, mean: 1.781169171140372, standardError: 0.45625363668119806, lower: 0.8696977512520548, upper: 2.6926405910286895 },
    "garden-residential/auction/wt95S": { n: 65, mean: -0.5827344128218341, standardError: 0.4535553145924324, lower: -1.4888153146565237, upper: 0.32334648901285556 },
    "garden-residential/capacity-aware/awtS": { n: 65, mean: -0.0052118788174338486, standardError: 0.22216874871033518, lower: -0.44904497637872476, upper: 0.43862121874385707 },
    "garden-residential/capacity-aware/energyKJ": { n: 65, mean: -2.6225669830748304, standardError: 3.1852395833893024, lower: -8.985814554918154, upper: 3.740680588768493 },
    "garden-residential/capacity-aware/ttdMeanS": { n: 65, mean: 1.8526188353699637, standardError: 0.4609207348671849, lower: 0.9318238150358883, upper: 2.7734138557040393 },
    "garden-residential/capacity-aware/wt95S": { n: 65, mean: -0.5827344128218341, standardError: 0.4535553145924324, lower: -1.4888153146565237, upper: 0.32334648901285556 },
    "garden-residential/destination-eta/awtS": { n: 65, mean: -0.0052118788174338486, standardError: 0.22216874871033518, lower: -0.44904497637872476, upper: 0.43862121874385707 },
    "garden-residential/destination-eta/energyKJ": { n: 65, mean: -2.6225669830748304, standardError: 3.1852395833893024, lower: -8.985814554918154, upper: 3.740680588768493 },
    "garden-residential/destination-eta/ttdMeanS": { n: 65, mean: 1.8526188353699637, standardError: 0.4609207348671849, lower: 0.9318238150358883, upper: 2.7734138557040393 },
    "garden-residential/destination-eta/wt95S": { n: 65, mean: -0.5827344128218341, standardError: 0.4535553145924324, lower: -1.4888153146565237, upper: 0.32334648901285556 },
    "garden-residential/destination-panel/awtS": { n: 65, mean: 0.09033317428671143, standardError: 0.2369709524505578, lower: -0.3830707246356744, upper: 0.5637370732090973 },
    "garden-residential/destination-panel/energyKJ": { n: 65, mean: -2.5400330812101544, standardError: 3.1851986707921545, lower: -8.90319892074492, upper: 3.823132758324612 },
    "garden-residential/destination-panel/ttdMeanS": { n: 65, mean: 1.940561411585918, standardError: 0.4561015673763355, lower: 1.0293937850574362, upper: 2.8517290381144 },
    "garden-residential/destination-panel/wt95S": { n: 65, mean: 0.08485795224439567, standardError: 0.8263195686947741, lower: -1.5659051540801554, upper: 1.7356210585689469 },
    "garden-residential/energy-aware/awtS": { n: 65, mean: 0.07210071756302959, standardError: 0.22695565134288848, lower: -0.38129531733964445, upper: 0.5254967524657036 },
    "garden-residential/energy-aware/energyKJ": { n: 65, mean: -6.206486340663414, standardError: 3.829998302063239, lower: -13.857787524681536, upper: 1.444814843354708 },
    "garden-residential/energy-aware/ttdMeanS": { n: 65, mean: 2.4674834739308165, standardError: 0.4628511531544046, lower: 1.5428319997391249, upper: 3.392134948122508 },
    "garden-residential/energy-aware/wt95S": { n: 65, mean: -0.3451297797377871, standardError: 0.4857120675369769, lower: -1.315451180516361, upper: 0.6251916210407866 },
    "garden-residential/eta/awtS": { n: 65, mean: -0.006435779918776473, standardError: 0.22222127885382, lower: -0.4503738185054526, upper: 0.43750225866789966 },
    "garden-residential/eta/energyKJ": { n: 65, mean: -2.894414945444284, standardError: 3.1625506681541404, lower: -9.212336198498026, upper: 3.4235063076094567 },
    "garden-residential/eta/ttdMeanS": { n: 65, mean: 2.003734459822433, standardError: 0.46217476697561927, lower: 1.0804342223578718, upper: 2.9270346972869943 },
    "garden-residential/eta/wt95S": { n: 65, mean: -0.5827344128218341, standardError: 0.4535553145924324, lower: -1.4888153146565237, upper: 0.32334648901285556 },
    "garden-residential/fairness-first/awtS": { n: 65, mean: -0.006435779918776473, standardError: 0.22222127885382, lower: -0.4503738185054526, upper: 0.43750225866789966 },
    "garden-residential/fairness-first/energyKJ": { n: 65, mean: -2.894414945444284, standardError: 3.1625506681541404, lower: -9.212336198498026, upper: 3.4235063076094567 },
    "garden-residential/fairness-first/ttdMeanS": { n: 65, mean: 2.003734459822433, standardError: 0.46217476697561927, lower: 1.0804342223578718, upper: 2.9270346972869943 },
    "garden-residential/fairness-first/wt95S": { n: 65, mean: -0.5827344128218341, standardError: 0.4535553145924324, lower: -1.4888153146565237, upper: 0.32334648901285556 },
    "garden-residential/nearest-car/awtS": { n: 65, mean: 1.406619634827444, standardError: 0.3229266673614514, lower: 0.761499455269489, upper: 2.051739814385399 },
    "garden-residential/nearest-car/energyKJ": { n: 65, mean: -14.929892642310321, standardError: 5.294726491568262, lower: -25.507324766017682, upper: -4.352460518602959 },
    "garden-residential/nearest-car/ttdMeanS": { n: 65, mean: 3.8561082153787405, standardError: 0.6203815036777981, lower: 2.616753688491406, upper: 5.095462742266075 },
    "garden-residential/nearest-car/wt95S": { n: 65, mean: 3.155227006209212, standardError: 0.9013881495659155, lower: 1.3544971697708361, upper: 4.955956842647588 },
    "garden-residential/predictive-balanced/awtS": { n: 65, mean: 0.8956972861522547, standardError: 0.21803399404747995, lower: 0.46012431059427805, upper: 1.3312702617102314 },
    "garden-residential/predictive-balanced/energyKJ": { n: 65, mean: 4.57694480537381, standardError: 2.946985288881187, lower: -1.3103350970621115, upper: 10.464224707809732 },
    "garden-residential/predictive-balanced/ttdMeanS": { n: 65, mean: 1.242389936120604, standardError: 0.26022536159676635, lower: 0.722530014453201, upper: 1.7622498577880072 },
    "garden-residential/predictive-balanced/wt95S": { n: 65, mean: 0.9434732228555546, standardError: 0.4609349756565999, lower: 0.022649753274163853, upper: 1.8642966924369453 },
    "garden-residential/zoned-uppeak/awtS": { n: 65, mean: -5.359970077243595, standardError: 0.5084227766499403, lower: -6.3756613350877185, upper: -4.344278819399472 },
    "garden-residential/zoned-uppeak/energyKJ": { n: 65, mean: 129.508332000993, standardError: 8.993521548399066, lower: 111.54170730701105, upper: 147.47495669497494 },
    "garden-residential/zoned-uppeak/ttdMeanS": { n: 65, mean: -3.3826738402802428, standardError: 0.7095559548414767, lower: -4.800174812664762, upper: -1.9651728678957232 },
    "garden-residential/zoned-uppeak/wt95S": { n: 65, mean: -6.511671228666095, standardError: 1.020805882043779, lower: -8.550965410526874, upper: -4.472377046805315 },
    "midtown-down-peak/auction-multi-round/awtS": { n: 78, mean: -0.12901073699755905, standardError: 0.12717197981676104, lower: -0.3822425007779293, upper: 0.12422102678281122 },
    "midtown-down-peak/auction-multi-round/energyKJ": { n: 78, mean: -175.29782495169113, standardError: 51.65129851812402, lower: -278.14870015342393, upper: -72.44694974995832 },
    "midtown-down-peak/auction-multi-round/ttdMeanS": { n: 78, mean: 0.621512318810079, standardError: 0.2347036705002321, lower: 0.15415760331270106, upper: 1.088867034307457 },
    "midtown-down-peak/auction-multi-round/wt95S": { n: 78, mean: -0.37565410698858054, standardError: 0.3491864141841601, lower: -1.0709730890427036, upper: 0.3196648750655425 },
    "midtown-down-peak/auction/awtS": { n: 78, mean: -0.12303665063341344, standardError: 0.13075329694184526, lower: -0.38339972788038745, upper: 0.13732642661356054 },
    "midtown-down-peak/auction/energyKJ": { n: 78, mean: -183.49942480961172, standardError: 51.96528601978596, lower: -286.97552900412586, upper: -80.02332061509757 },
    "midtown-down-peak/auction/ttdMeanS": { n: 78, mean: 0.6253294319953557, standardError: 0.22825358794230893, lower: 0.17081847174206038, upper: 1.079840392248651 },
    "midtown-down-peak/auction/wt95S": { n: 78, mean: -0.232159845460123, standardError: 0.3878580427181743, lower: -1.0044838778094294, upper: 0.5401641868891833 },
    "midtown-down-peak/capacity-aware/awtS": { n: 78, mean: -0.3935208860383186, standardError: 0.0920878953256824, lower: -0.5768913123676506, upper: -0.21015045970898663 },
    "midtown-down-peak/capacity-aware/energyKJ": { n: 78, mean: -385.07333356826393, standardError: 52.61406351164481, lower: -489.84131879507106, upper: -280.3053483414568 },
    "midtown-down-peak/capacity-aware/ttdMeanS": { n: 78, mean: 0.9711515170099398, standardError: 0.2854412808382151, lower: 0.40276531191554943, upper: 1.5395377221043303 },
    "midtown-down-peak/capacity-aware/wt95S": { n: 78, mean: -0.6816381781613134, standardError: 0.42631951778434957, lower: -1.5305487917892626, upper: 0.16727243546663573 },
    "midtown-down-peak/destination-eta/awtS": { n: 78, mean: -0.48168867303105645, standardError: 0.0926503187051704, lower: -0.6661790273868631, upper: -0.2971983186752498 },
    "midtown-down-peak/destination-eta/energyKJ": { n: 78, mean: -398.6701361036573, standardError: 53.14914072690641, lower: -504.5035961872263, upper: -292.83667602008825 },
    "midtown-down-peak/destination-eta/ttdMeanS": { n: 78, mean: 0.9167646155528297, standardError: 0.24569796475025057, lower: 0.4275174633059091, upper: 1.4060117677997503 },
    "midtown-down-peak/destination-eta/wt95S": { n: 78, mean: -0.9368740767149207, standardError: 0.2737555000502485, lower: -1.4819909194517273, upper: -0.391757233978114 },
    "midtown-down-peak/destination-panel/awtS": { n: 78, mean: -0.48994945675324897, standardError: 0.09208748896538373, lower: -0.6733190739158501, upper: -0.30657983959064783 },
    "midtown-down-peak/destination-panel/energyKJ": { n: 78, mean: -388.8285330840774, standardError: 51.893270799106965, lower: -492.16123665387966, upper: -285.4958295142751 },
    "midtown-down-peak/destination-panel/ttdMeanS": { n: 78, mean: 0.8455826199589237, standardError: 0.24152643082379194, lower: 0.3646420529785757, upper: 1.3265231869392717 },
    "midtown-down-peak/destination-panel/wt95S": { n: 78, mean: -1.035346258819796, standardError: 0.25019428120010495, lower: -1.5335467209605462, upper: -0.5371457966790456 },
    "midtown-down-peak/energy-aware/awtS": { n: 78, mean: 0.19982162713973062, standardError: 0.13869326703305326, lower: -0.07635195045061377, upper: 0.475995204730075 },
    "midtown-down-peak/energy-aware/energyKJ": { n: 78, mean: -967.0441433191318, standardError: 78.9642501473601, lower: -1124.2820535036117, upper: -809.8062331346518 },
    "midtown-down-peak/energy-aware/ttdMeanS": { n: 78, mean: 4.889653899111381, standardError: 0.46714769937437284, lower: 3.9594439894365823, upper: 5.81986380878618 },
    "midtown-down-peak/energy-aware/wt95S": { n: 78, mean: 1.3762281124442826, standardError: 0.6120804890151476, lower: 0.15742014836138885, upper: 2.595036076527176 },
    "midtown-down-peak/eta/awtS": { n: 78, mean: -0.40766830359123934, standardError: 0.08328521257029142, lower: -0.5735103491926894, upper: -0.24182625798978935 },
    "midtown-down-peak/eta/energyKJ": { n: 78, mean: -425.2800650317304, standardError: 55.50046774092359, lower: -535.7956153669566, upper: -314.7645146965042 },
    "midtown-down-peak/eta/ttdMeanS": { n: 78, mean: 1.270931715683721, standardError: 0.2960970874209678, lower: 0.6813270888950156, upper: 1.8605363424724264 },
    "midtown-down-peak/eta/wt95S": { n: 78, mean: -0.5641579364023848, standardError: 0.4024782561701455, lower: -1.3655945330494452, upper: 0.2372786602446758 },
    "midtown-down-peak/fairness-first/awtS": { n: 78, mean: -0.43815775229280546, standardError: 0.09789669239170584, lower: -0.6330949713117758, upper: -0.24322053327383508 },
    "midtown-down-peak/fairness-first/energyKJ": { n: 78, mean: -402.3170611587835, standardError: 52.92523517787761, lower: -507.70466833369704, upper: -296.9294539838699 },
    "midtown-down-peak/fairness-first/ttdMeanS": { n: 78, mean: 1.0726694003289525, standardError: 0.26245370289245806, lower: 0.5500573108583842, upper: 1.595281489799521 },
    "midtown-down-peak/fairness-first/wt95S": { n: 78, mean: -0.851417538390501, standardError: 0.34893004760041335, lower: -1.5462260293579078, upper: -0.15660904742309434 },
    "midtown-down-peak/nearest-car/awtS": { n: 78, mean: 30.137878355441252, standardError: 1.790053130973401, lower: 26.5734271904117, upper: 33.702329520470805 },
    "midtown-down-peak/nearest-car/energyKJ": { n: 78, mean: -2854.074882322374, standardError: 133.160657576299, lower: -3119.231627013989, upper: -2588.918137630759 },
    "midtown-down-peak/nearest-car/ttdMeanS": { n: 78, mean: 63.225504653371225, standardError: 3.1464177336664125, lower: 56.960186511479975, upper: 69.49082279526247 },
    "midtown-down-peak/nearest-car/wt95S": { n: 78, mean: 72.85952356599803, standardError: 4.731101417190775, lower: 63.438697073988614, upper: 82.28035005800746 },
    "midtown-down-peak/predictive-balanced/awtS": { n: 78, mean: 1.778442533592091, standardError: 0.17628706169193215, lower: 1.427410147147925, upper: 2.129474920036257 },
    "midtown-down-peak/predictive-balanced/energyKJ": { n: 78, mean: 139.3207561437388, standardError: 62.53598763871449, lower: 14.795695888193933, upper: 263.84581639928365 },
    "midtown-down-peak/predictive-balanced/ttdMeanS": { n: 78, mean: 1.9443816190676313, standardError: 0.24692909174763056, lower: 1.4526829797758964, upper: 2.436080258359366 },
    "midtown-down-peak/predictive-balanced/wt95S": { n: 78, mean: 1.3905661725478846, standardError: 0.3773458142952091, lower: 0.6391746612511346, upper: 2.141957683844635 },
    "midtown-down-peak/zoned-uppeak/awtS": { n: 78, mean: -6.0179212764311485, standardError: 0.4812705007333929, lower: -6.976253276387293, upper: -5.059589276475004 },
    "midtown-down-peak/zoned-uppeak/energyKJ": { n: 78, mean: -44.49262950618948, standardError: 92.88434296653438, lower: -229.44898570106466, upper: 140.4637266886857 },
    "midtown-down-peak/zoned-uppeak/ttdMeanS": { n: 78, mean: -5.34627302086527, standardError: 0.5068782082323178, lower: -6.355596480934469, upper: -4.33694956079607 },
    "midtown-down-peak/zoned-uppeak/wt95S": { n: 78, mean: -0.47436952511692326, standardError: 1.6431542309030218, lower: -3.746307609703611, upper: 2.797568559469765 },
    "midtown-interfloor/auction-multi-round/awtS": { n: 200, mean: -0.5531103511620967, standardError: 0.1140056190557338, lower: -0.777924477740528, upper: -0.3282962245836655 },
    "midtown-interfloor/auction-multi-round/energyKJ": { n: 200, mean: -567.8763601282183, standardError: 73.82120351009547, lower: -713.4485654944945, upper: -422.3041547619421 },
    "midtown-interfloor/auction-multi-round/ttdMeanS": { n: 200, mean: 0.3893097120072318, standardError: 0.16989353332459323, lower: 0.05428704714174004, upper: 0.7243323768727236 },
    "midtown-interfloor/auction-multi-round/wt95S": { n: 200, mean: -3.245990012436172, standardError: 0.4256748769110656, lower: -4.085402371684524, upper: -2.40657765318782 },
    "midtown-interfloor/auction/awtS": { n: 200, mean: -0.7798028713334051, standardError: 0.10613157428138109, lower: -0.9890897237893199, upper: -0.5705160188774903 },
    "midtown-interfloor/auction/energyKJ": { n: 200, mean: -653.5369030338546, standardError: 71.80947625166247, lower: -795.1420696676141, upper: -511.9317364000951 },
    "midtown-interfloor/auction/ttdMeanS": { n: 200, mean: 0.46817706083484323, standardError: 0.16896858499648013, lower: 0.13497835387806884, upper: 0.8013757677916176 },
    "midtown-interfloor/auction/wt95S": { n: 200, mean: -3.8588174220289124, standardError: 0.41475955367646505, lower: -4.676705238192171, upper: -3.0409296058656543 },
    "midtown-interfloor/capacity-aware/awtS": { n: 200, mean: -1.231253690667676, standardError: 0.11348647913963261, lower: -1.4550440958911692, upper: -1.007463285444183 },
    "midtown-interfloor/capacity-aware/energyKJ": { n: 200, mean: -1084.6811376013013, standardError: 71.01748909932125, lower: -1224.7245399870383, upper: -944.6377352155644 },
    "midtown-interfloor/capacity-aware/ttdMeanS": { n: 200, mean: 1.2097465930309184, standardError: 0.18278638498687633, lower: 0.8492997849559198, upper: 1.5701934011059169 },
    "midtown-interfloor/capacity-aware/wt95S": { n: 200, mean: -4.738480750951243, standardError: 0.4621095793544258, lower: -5.649740760120647, upper: -3.82722074178184 },
    "midtown-interfloor/destination-eta/awtS": { n: 200, mean: -1.0428907772101008, standardError: 0.1137429933628712, lower: -1.267187017334803, upper: -0.8185945370853986 },
    "midtown-interfloor/destination-eta/energyKJ": { n: 200, mean: -1155.1757319167048, standardError: 67.05189798435426, lower: -1287.3991609514558, upper: -1022.9523028819538 },
    "midtown-interfloor/destination-eta/ttdMeanS": { n: 200, mean: 0.847364501477528, standardError: 0.1666311931957268, lower: 0.5187750295787296, upper: 1.1759539733763265 },
    "midtown-interfloor/destination-eta/wt95S": { n: 200, mean: -4.4051629074704834, standardError: 0.42383202074260645, lower: -5.240941234437328, upper: -3.569384580503639 },
    "midtown-interfloor/destination-panel/awtS": { n: 200, mean: -0.7361842979514195, standardError: 0.11445893821136349, lower: -0.9618923502054294, upper: -0.5104762456974096 },
    "midtown-interfloor/destination-panel/energyKJ": { n: 200, mean: -956.6114566165804, standardError: 66.78373666838009, lower: -1088.306083189381, upper: -824.9168300437798 },
    "midtown-interfloor/destination-panel/ttdMeanS": { n: 200, mean: 0.6587593514714771, standardError: 0.16513657136153767, lower: 0.33311720887978963, upper: 0.9844014940631647 },
    "midtown-interfloor/destination-panel/wt95S": { n: 200, mean: -3.950021290101095, standardError: 0.43723246129410165, lower: -4.812224703509318, upper: -3.0878178766928723 },
    "midtown-interfloor/energy-aware/awtS": { n: 200, mean: 0.09808896608889414, standardError: 0.13989083149558004, lower: -0.17776967455963985, upper: 0.3739476067374281 },
    "midtown-interfloor/energy-aware/energyKJ": { n: 200, mean: -2477.982325351225, standardError: 79.11027844779323, lower: -2633.9843566539325, upper: -2321.9802940485174 },
    "midtown-interfloor/energy-aware/ttdMeanS": { n: 200, mean: 5.7609303528526326, standardError: 0.2831204220371076, lower: 5.202629183805229, upper: 6.319231521900036 },
    "midtown-interfloor/energy-aware/wt95S": { n: 200, mean: -0.18074957172370662, standardError: 0.5715205552054203, lower: -1.3077632707354536, upper: 0.9462641272880403 },
    "midtown-interfloor/eta/awtS": { n: 200, mean: -1.201201069350842, standardError: 0.10838566416118071, lower: -1.4149328890965593, upper: -0.9874692496051245 },
    "midtown-interfloor/eta/energyKJ": { n: 200, mean: -1360.8780750801536, standardError: 71.54208187401349, lower: -1501.9559516210122, upper: -1219.800198539295 },
    "midtown-interfloor/eta/ttdMeanS": { n: 200, mean: 2.195799959548903, standardError: 0.19095880592788686, lower: 1.8192374925168984, upper: 2.5723624265809075 },
    "midtown-interfloor/eta/wt95S": { n: 200, mean: -4.507682694868427, standardError: 0.44049121839147076, lower: -5.376312235660934, upper: -3.63905315407592 },
    "midtown-interfloor/fairness-first/awtS": { n: 200, mean: -1.2626750729259686, standardError: 0.1069094175811143, lower: -1.4734957985671946, upper: -1.0518543472847426 },
    "midtown-interfloor/fairness-first/energyKJ": { n: 200, mean: -1284.4694838176877, standardError: 71.31909803559945, lower: -1425.1076459191231, upper: -1143.8313217162522 },
    "midtown-interfloor/fairness-first/ttdMeanS": { n: 200, mean: 1.9147476518343547, standardError: 0.18112924410034745, lower: 1.557568653575294, upper: 2.271926650093415 },
    "midtown-interfloor/fairness-first/wt95S": { n: 200, mean: -4.647211669117067, standardError: 0.46738960360807286, lower: -5.568883656667258, upper: -3.725539681566876 },
    "midtown-interfloor/nearest-car/awtS": { n: 200, mean: 16.30198868209403, standardError: 0.6650231615710245, lower: 14.990591906555032, upper: 17.61338545763303 },
    "midtown-interfloor/nearest-car/energyKJ": { n: 200, mean: -6429.932255758002, standardError: 144.4134754647152, lower: -6714.709353778792, upper: -6145.155157737211 },
    "midtown-interfloor/nearest-car/ttdMeanS": { n: 200, mean: 36.18716310929289, standardError: 1.2414804105814212, lower: 33.73901768908645, upper: 38.635308529499326 },
    "midtown-interfloor/nearest-car/wt95S": { n: 200, mean: 58.46055411010772, standardError: 2.347458949160428, lower: 53.83146707294838, upper: 63.089641147267066 },
    "midtown-interfloor/predictive-balanced/awtS": { n: 200, mean: 1.1078718182534195, standardError: 0.10352356371236683, lower: 0.9037278493065503, upper: 1.3120157872002887 },
    "midtown-interfloor/predictive-balanced/energyKJ": { n: 200, mean: 229.04366148984002, standardError: 65.20906207750083, lower: 100.4542247815908, upper: 357.6330981980892 },
    "midtown-interfloor/predictive-balanced/ttdMeanS": { n: 200, mean: 1.1114344527131765, standardError: 0.1468130606982091, lower: 0.8219254768877073, upper: 1.4009434285386457 },
    "midtown-interfloor/predictive-balanced/wt95S": { n: 200, mean: -0.3166608127210823, standardError: 0.43389782792340564, lower: -1.1722884740312807, upper: 0.5389668485891159 },
    "midtown-interfloor/zoned-uppeak/awtS": { n: 200, mean: 0.6553589905468961, standardError: 0.14452457696569193, lower: 0.37036280519417786, upper: 0.9403551758996143 },
    "midtown-interfloor/zoned-uppeak/energyKJ": { n: 200, mean: 4532.997748267487, standardError: 103.49459865577334, lower: 4328.910897153522, upper: 4737.084599381452 },
    "midtown-interfloor/zoned-uppeak/ttdMeanS": { n: 200, mean: 5.110445547667255, standardError: 0.24537775473765103, lower: 4.626571278398533, upper: 5.594319816935977 },
    "midtown-interfloor/zoned-uppeak/wt95S": { n: 200, mean: 2.9996734980839452, standardError: 0.6271579167218734, lower: 1.7629453399249257, upper: 4.236401656242965 },
    "midtown-up-peak/auction-multi-round/awtS": { n: 81, mean: 1.244097340413659, standardError: 0.30836256809428475, lower: 0.6304362731651423, upper: 1.8577584076621758 },
    "midtown-up-peak/auction-multi-round/energyKJ": { n: 81, mean: 240.05443652128693, standardError: 45.73769649109552, lower: 149.03351976192027, upper: 331.0753532806536 },
    "midtown-up-peak/auction-multi-round/ttdMeanS": { n: 81, mean: -2.6670744210810295, standardError: 0.5425266641743873, lower: -3.746736890509668, upper: -1.587411951652391 },
    "midtown-up-peak/auction-multi-round/wt95S": { n: 81, mean: 0.8863347855737643, standardError: 0.2858397958705432, lower: 0.317495463472961, upper: 1.4551741076745677 },
    "midtown-up-peak/auction/awtS": { n: 81, mean: 0.5212716771518813, standardError: 0.21381101430403526, lower: 0.09577419852411134, upper: 0.9467691557796512 },
    "midtown-up-peak/auction/energyKJ": { n: 81, mean: 15.899566774480403, standardError: 21.972242694015794, lower: -27.826589693805488, upper: 59.6257232427663 },
    "midtown-up-peak/auction/ttdMeanS": { n: 81, mean: -0.31322192101588137, standardError: 0.3262899731548743, lower: -0.962559661313489, upper: 0.33611581928172635 },
    "midtown-up-peak/auction/wt95S": { n: 81, mean: 0.16295405409340893, standardError: 0.1941719752529153, lower: -0.2234604912901397, upper: 0.5493685994769576 },
    "midtown-up-peak/capacity-aware/awtS": { n: 81, mean: 0.11662170840889392, standardError: 0.157374449699715, lower: -0.19656342737855537, upper: 0.4298068441963432 },
    "midtown-up-peak/capacity-aware/energyKJ": { n: 81, mean: -38.19930670341897, standardError: 16.024737255626796, lower: -70.08955015105508, upper: -6.30906325578286 },
    "midtown-up-peak/capacity-aware/ttdMeanS": { n: 81, mean: 0.2550039298157147, standardError: 0.1646043857029399, lower: -0.07256923714976293, upper: 0.5825770967811923 },
    "midtown-up-peak/capacity-aware/wt95S": { n: 81, mean: -0.05762928633726839, standardError: 0.06929925759535137, lower: -0.1955392039978659, upper: 0.08028063132332913 },
    "midtown-up-peak/destination-eta/awtS": { n: 81, mean: 0.14505154924948313, standardError: 0.18309017924901247, lower: -0.21930951926489486, upper: 0.5094126177638612 },
    "midtown-up-peak/destination-eta/energyKJ": { n: 81, mean: -32.26159631480808, standardError: 16.95076989663289, lower: -65.99470344819807, upper: 1.4715108185819048 },
    "midtown-up-peak/destination-eta/ttdMeanS": { n: 81, mean: 0.43611207864024526, standardError: 0.24461607214385803, lower: -0.050689418784183204, upper: 0.9229135760646737 },
    "midtown-up-peak/destination-eta/wt95S": { n: 81, mean: -0.0346124278516693, standardError: 0.07324837203664834, lower: -0.18038133370823958, upper: 0.111156478004901 },
    "midtown-up-peak/destination-panel/awtS": { n: 81, mean: 0.2854174773864262, standardError: 0.17985425822077306, lower: -0.07250390305558452, upper: 0.6433388578284369 },
    "midtown-up-peak/destination-panel/energyKJ": { n: 81, mean: -13.189133285581246, standardError: 19.809623409823793, lower: -52.61154022229718, upper: 26.23327365113469 },
    "midtown-up-peak/destination-panel/ttdMeanS": { n: 81, mean: 0.18033424367463669, standardError: 0.25399529841579144, lower: -0.3251325088732351, upper: 0.6858009962225085 },
    "midtown-up-peak/destination-panel/wt95S": { n: 81, mean: -0.09778463681047198, standardError: 0.12566799634158415, lower: -0.3478719195521951, upper: 0.15230264593125112 },
    "midtown-up-peak/energy-aware/awtS": { n: 81, mean: 0.09841185925340676, standardError: 0.16376023014289298, lower: -0.22748138461017295, upper: 0.42430510311698644 },
    "midtown-up-peak/energy-aware/energyKJ": { n: 81, mean: -61.09839781491172, standardError: 22.412933017188212, lower: -105.70155597544384, upper: -16.495239654379603 },
    "midtown-up-peak/energy-aware/ttdMeanS": { n: 81, mean: 1.195188486573287, standardError: 0.429003195925793, lower: 0.3414449187601154, upper: 2.0489320543864586 },
    "midtown-up-peak/energy-aware/wt95S": { n: 81, mean: 0.026018600777678022, standardError: 0.10368887949431779, lower: -0.18032884549482314, upper: 0.23236604705017921 },
    "midtown-up-peak/eta/awtS": { n: 81, mean: 0.1999230202412955, standardError: 0.12532910353818325, lower: -0.04948984432865311, upper: 0.4493358848112441 },
    "midtown-up-peak/eta/energyKJ": { n: 81, mean: -22.279436966896302, standardError: 10.487786554461133, lower: -43.15079735885352, upper: -1.4080765749390878 },
    "midtown-up-peak/eta/ttdMeanS": { n: 81, mean: 0.39704861384368817, standardError: 0.19535236972221454, lower: 0.008285008604136057, upper: 0.7858122190832403 },
    "midtown-up-peak/eta/wt95S": { n: 81, mean: -0.06786978089113853, standardError: 0.08652219507617734, lower: -0.24005443643887986, upper: 0.10431487465660282 },
    "midtown-up-peak/fairness-first/awtS": { n: 81, mean: 0.1999230202412955, standardError: 0.12532910353818325, lower: -0.04948984432865311, upper: 0.4493358848112441 },
    "midtown-up-peak/fairness-first/energyKJ": { n: 81, mean: -22.279436966896302, standardError: 10.487786554461133, lower: -43.15079735885352, upper: -1.4080765749390878 },
    "midtown-up-peak/fairness-first/ttdMeanS": { n: 81, mean: 0.39704861384368817, standardError: 0.19535236972221454, lower: 0.008285008604136057, upper: 0.7858122190832403 },
    "midtown-up-peak/fairness-first/wt95S": { n: 81, mean: -0.06786978089113853, standardError: 0.08652219507617734, lower: -0.24005443643887986, upper: 0.10431487465660282 },
    "midtown-up-peak/nearest-car/awtS": { n: 81, mean: 7.507498946774379, standardError: 0.8614830567305122, lower: 5.793093027544525, upper: 9.221904866004232 },
    "midtown-up-peak/nearest-car/energyKJ": { n: 81, mean: -378.1489951134647, standardError: 39.144497576400155, lower: -456.04902788364166, upper: -300.24896234328776 },
    "midtown-up-peak/nearest-car/ttdMeanS": { n: 81, mean: 11.329703284420614, standardError: 1.2861396731052706, lower: 8.770203766349674, upper: 13.889202802491553 },
    "midtown-up-peak/nearest-car/wt95S": { n: 81, mean: 25.675939305835904, standardError: 2.7314509933584974, lower: 20.24017859700406, upper: 31.111700014667747 },
    "midtown-up-peak/predictive-balanced/awtS": { n: 81, mean: 2.4428521209167644, standardError: 0.3408479556284345, lower: 1.7645430722112612, upper: 3.1211611696222676 },
    "midtown-up-peak/predictive-balanced/energyKJ": { n: 81, mean: 192.16176791304107, standardError: 44.35656365349276, lower: 103.88939309368102, upper: 280.43414273240114 },
    "midtown-up-peak/predictive-balanced/ttdMeanS": { n: 81, mean: 0.10635477557680224, standardError: 0.5741585235615811, lower: -1.0362571001645546, upper: 1.248966651318159 },
    "midtown-up-peak/predictive-balanced/wt95S": { n: 81, mean: 2.5925435750033117, standardError: 0.3334885378798563, lower: 1.9288802343609848, upper: 3.2562069156456386 },
    "midtown-up-peak/zoned-uppeak/awtS": { n: 81, mean: -0.8884871137749039, standardError: 0.5110896404409719, lower: -1.9055879121985648, upper: 0.12861368464875722 },
    "midtown-up-peak/zoned-uppeak/energyKJ": { n: 81, mean: 460.227635340405, standardError: 50.380924989530065, lower: 359.9663993897776, upper: 560.4888712910324 },
    "midtown-up-peak/zoned-uppeak/ttdMeanS": { n: 81, mean: -0.6227080921805447, standardError: 0.7930526779081806, lower: -2.200933217613492, upper: 0.9555170332524027 },
    "midtown-up-peak/zoned-uppeak/wt95S": { n: 81, mean: 2.563144208665871, standardError: 1.1631625766510352, lower: 0.24837691190058475, upper: 4.8779115054311575 },
    "mixed-use-up-peak/auction-multi-round/awtS": { n: 50, mean: 4.05869316899601, standardError: 0.24374397988228239, lower: 3.56887130282525, upper: 4.54851503516677 },
    "mixed-use-up-peak/auction-multi-round/energyKJ": { n: 50, mean: 2775.1742342233442, standardError: 178.35917457338334, lower: 2416.748053685864, upper: 3133.6004147608246 },
    "mixed-use-up-peak/auction-multi-round/ttdMeanS": { n: 50, mean: -11.627003465247821, standardError: 0.7981075620849786, lower: -13.230860658579374, upper: -10.023146271916268 },
    "mixed-use-up-peak/auction-multi-round/wt95S": { n: 50, mean: 4.000201431881934, standardError: 0.578086429704164, lower: 2.838493257827999, upper: 5.16190960593587 },
    "mixed-use-up-peak/auction/awtS": { n: 50, mean: 2.2410466319933873, standardError: 0.2314014768529823, lower: 1.7760279542745014, upper: 2.7060653097122733 },
    "mixed-use-up-peak/auction/energyKJ": { n: 50, mean: 1419.7282087980636, standardError: 166.38330978303802, lower: 1085.368429586469, upper: 1754.0879880096584 },
    "mixed-use-up-peak/auction/ttdMeanS": { n: 50, mean: -8.106818937827747, standardError: 0.754326770743007, lower: -9.622695337016552, upper: -6.5909425386389415 },
    "mixed-use-up-peak/auction/wt95S": { n: 50, mean: 1.4443335490263065, standardError: 0.45944260805832515, lower: 0.5210490609902259, upper: 2.367618037062387 },
    "mixed-use-up-peak/capacity-aware/awtS": { n: 50, mean: -0.1861666821820694, standardError: 0.21759749644869283, lower: -0.623445222706678, upper: 0.2511118583425393 },
    "mixed-use-up-peak/capacity-aware/energyKJ": { n: 50, mean: 274.0396525790996, standardError: 171.02157984558895, lower: -69.64107929331533, upper: 617.7203844515145 },
    "mixed-use-up-peak/capacity-aware/ttdMeanS": { n: 50, mean: -2.6951406768398876, standardError: 1.0780848687241582, lower: -4.861633332551673, upper: -0.5286480211281028 },
    "mixed-use-up-peak/capacity-aware/wt95S": { n: 50, mean: -0.43834575042764656, standardError: 0.37446080723916797, lower: -1.1908529159309005, upper: 0.31416141507560724 },
    "mixed-use-up-peak/destination-eta/awtS": { n: 50, mean: 0.29775792686010205, standardError: 0.1307389618010611, lower: 0.0350281466967054, upper: 0.5604877070234987 },
    "mixed-use-up-peak/destination-eta/energyKJ": { n: 50, mean: 39.8179296796786, standardError: 108.35774254730929, lower: -177.9351064946185, upper: 257.57096585397574 },
    "mixed-use-up-peak/destination-eta/ttdMeanS": { n: 50, mean: 0.9531172298496486, standardError: 0.7535864351642512, lower: -0.5612714092929225, upper: 2.4675058689922196 },
    "mixed-use-up-peak/destination-eta/wt95S": { n: 50, mean: 0.0055295568008743605, standardError: 0.1297421082357541, lower: -0.2551969711226374, upper: 0.2662560847243861 },
    "mixed-use-up-peak/destination-panel/awtS": { n: 50, mean: 2.4946927704988138, standardError: 0.43845433015998136, lower: 1.6135858059972317, upper: 3.375799735000396 },
    "mixed-use-up-peak/destination-panel/energyKJ": { n: 50, mean: 638.786862067222, standardError: 151.04242560763169, lower: 335.2557438101915, upper: 942.3179803242526 },
    "mixed-use-up-peak/destination-panel/ttdMeanS": { n: 50, mean: -1.2368645854356026, standardError: 1.0046146955893527, lower: -3.2557134005480854, upper: 0.78198422967688 },
    "mixed-use-up-peak/destination-panel/wt95S": { n: 50, mean: 6.57180771850699, standardError: 3.1893349303172798, lower: 0.16259921963010626, upper: 12.981016217383873 },
    "mixed-use-up-peak/energy-aware/awtS": { n: 50, mean: -0.12352266884488557, standardError: 0.15035297102004597, lower: -0.4256682762355787, upper: 0.17862293854580757 },
    "mixed-use-up-peak/energy-aware/energyKJ": { n: 50, mean: -461.03690920394604, standardError: 172.21950867285616, lower: -807.1249691834805, upper: -114.94884922441162 },
    "mixed-use-up-peak/energy-aware/ttdMeanS": { n: 50, mean: 1.9834460861550618, standardError: 0.7824915426493508, lower: 0.4109704587838756, upper: 3.555921713526248 },
    "mixed-use-up-peak/energy-aware/wt95S": { n: 50, mean: -0.17511224338293488, standardError: 0.357879578944201, lower: -0.8942981831034366, upper: 0.5440736963375669 },
    "mixed-use-up-peak/eta/awtS": { n: 50, mean: 0.08944896038421564, standardError: 0.05026135738058824, lower: -0.011555018792316948, upper: 0.1904529395607482 },
    "mixed-use-up-peak/eta/energyKJ": { n: 50, mean: -0.6726143992556899, standardError: 8.090224234273363, lower: -16.930528683274225, upper: 15.585299884762847 },
    "mixed-use-up-peak/eta/ttdMeanS": { n: 50, mean: 0.15680228053820286, standardError: 0.12291773666668797, lower: -0.09021015927114484, upper: 0.40381472034755056 },
    "mixed-use-up-peak/eta/wt95S": { n: 50, mean: -0.05215878905764086, standardError: 0.052158789057640806, lower: -0.1569757999465229, upper: 0.05265822183124115 },
    "mixed-use-up-peak/fairness-first/awtS": { n: 50, mean: 0.08944896038421564, standardError: 0.05026135738058824, lower: -0.011555018792316948, upper: 0.1904529395607482 },
    "mixed-use-up-peak/fairness-first/energyKJ": { n: 50, mean: -0.6726143992556899, standardError: 8.090224234273363, lower: -16.930528683274225, upper: 15.585299884762847 },
    "mixed-use-up-peak/fairness-first/ttdMeanS": { n: 50, mean: 0.15680228053820286, standardError: 0.12291773666668797, lower: -0.09021015927114484, upper: 0.40381472034755056 },
    "mixed-use-up-peak/fairness-first/wt95S": { n: 50, mean: -0.05215878905764086, standardError: 0.052158789057640806, lower: -0.1569757999465229, upper: 0.05265822183124115 },
    "mixed-use-up-peak/nearest-car/awtS": { n: 50, mean: 9.343132318177075, standardError: 0.9704725159302428, lower: 7.392894781849157, upper: 11.293369854504993 },
    "mixed-use-up-peak/nearest-car/energyKJ": { n: 50, mean: -4076.0479543118945, standardError: 341.1262880926992, lower: -4761.566895596795, upper: -3390.5290130269946 },
    "mixed-use-up-peak/nearest-car/ttdMeanS": { n: 50, mean: 21.02805845775639, standardError: 1.6784273277275261, lower: 17.655132462634167, upper: 24.400984452878614 },
    "mixed-use-up-peak/nearest-car/wt95S": { n: 50, mean: 39.00384000718024, standardError: 4.49446914109327, lower: 29.97186611719772, upper: 48.035813897162754 },
    "mixed-use-up-peak/predictive-balanced/awtS": { n: 50, mean: 6.069065487315605, standardError: 0.2659124290942781, lower: 5.534694454562861, upper: 6.603436520068349 },
    "mixed-use-up-peak/predictive-balanced/energyKJ": { n: 50, mean: 7048.27579723893, standardError: 315.20637478950596, lower: 6414.844871876663, upper: 7681.706722601197 },
    "mixed-use-up-peak/predictive-balanced/ttdMeanS": { n: 50, mean: -16.279626996468256, standardError: 1.0884535660983192, lower: -18.46695632966444, upper: -14.09229766327207 },
    "mixed-use-up-peak/predictive-balanced/wt95S": { n: 50, mean: 6.099126136065786, standardError: 0.6861090761480527, lower: 4.720338326669046, upper: 7.477913945462526 },
    "mixed-use-up-peak/zoned-uppeak/awtS": { n: 50, mean: -0.764158702714737, standardError: 0.5279445578701488, lower: -1.8251030127877277, upper: 0.29678560735825377 },
    "mixed-use-up-peak/zoned-uppeak/energyKJ": { n: 50, mean: 5694.916888966844, standardError: 358.14840292935884, lower: 4975.1907272226235, upper: 6414.643050711065 },
    "mixed-use-up-peak/zoned-uppeak/ttdMeanS": { n: 50, mean: -6.970508299568987, standardError: 1.6973843752550206, lower: -10.381529907971546, upper: -3.559486691166429 },
    "mixed-use-up-peak/zoned-uppeak/wt95S": { n: 50, mean: 10.41346009675488, standardError: 2.4691926514214226, lower: 5.451431688756923, upper: 15.375488504752838 },
    "secure-up-peak/auction-multi-round/awtS": { n: 119, mean: 0.7600022300844793, standardError: 0.12462214110948873, lower: 0.5132164624003819, upper: 1.0067879977685767 },
    "secure-up-peak/auction-multi-round/energyKJ": { n: 119, mean: 246.31795608379173, standardError: 43.28986142013292, lower: 160.59224483863107, upper: 332.0436673289524 },
    "secure-up-peak/auction-multi-round/ttdMeanS": { n: 119, mean: -1.4169834080178283, standardError: 0.26306227107109703, lower: -1.9379183232506385, upper: -0.8960484927850182 },
    "secure-up-peak/auction-multi-round/wt95S": { n: 119, mean: 0.42190158617552426, standardError: 0.15373287886424192, lower: 0.11746863235982696, upper: 0.7263345399912216 },
    "secure-up-peak/auction/awtS": { n: 119, mean: 0.26344143295580374, standardError: 0.08160040499977851, lower: 0.1018504154053092, upper: 0.4250324505062983 },
    "secure-up-peak/auction/energyKJ": { n: 119, mean: 77.76983232429383, standardError: 27.035929527618464, lower: 24.231331347452027, upper: 131.30833330113563 },
    "secure-up-peak/auction/ttdMeanS": { n: 119, mean: -0.35778459973606014, standardError: 0.19485659795964763, lower: -0.7436537132632852, upper: 0.02808451379116489 },
    "secure-up-peak/auction/wt95S": { n: 119, mean: 0.06321449977521507, standardError: 0.09135274596284128, lower: -0.11768880794988043, upper: 0.24411780750031056 },
    "secure-up-peak/capacity-aware/awtS": { n: 119, mean: 0.15328763707602364, standardError: 0.07449704779916491, lower: 0.005763200666577345, upper: 0.3008120734854699 },
    "secure-up-peak/capacity-aware/energyKJ": { n: 119, mean: 34.135568829002096, standardError: 23.691943410093007, lower: -12.780929237350072, upper: 81.05206689535427 },
    "secure-up-peak/capacity-aware/ttdMeanS": { n: 119, mean: 0.12937969815481737, standardError: 0.075091495441554, lower: -0.019321906424497742, upper: 0.27808130273413245 },
    "secure-up-peak/capacity-aware/wt95S": { n: 119, mean: 0.06321449977521507, standardError: 0.09135274596284128, lower: -0.11768880794988043, upper: 0.24411780750031056 },
    "secure-up-peak/destination-eta/awtS": { n: 119, mean: 0.10634118751200164, standardError: 0.050980441138234134, lower: 0.005386034670263828, upper: 0.20729634035373945 },
    "secure-up-peak/destination-eta/energyKJ": { n: 119, mean: 24.340343069793075, standardError: 14.927910901182683, lower: -5.22098462743805, upper: 53.9016707670242 },
    "secure-up-peak/destination-eta/ttdMeanS": { n: 119, mean: -0.05488792710884287, standardError: 0.08533943202203224, lower: -0.22388323611078814, upper: 0.11410738189310239 },
    "secure-up-peak/destination-eta/wt95S": { n: 119, mean: 0.029774656026017435, standardError: 0.02169874257014399, lower: -0.013194761729756178, upper: 0.07274407378179104 },
    "secure-up-peak/destination-panel/awtS": { n: 119, mean: 0.23727812295427028, standardError: 0.07012411114626688, lower: 0.09841329164638649, upper: 0.37614295426215405 },
    "secure-up-peak/destination-panel/energyKJ": { n: 119, mean: 119.390814588041, standardError: 29.45786731450988, lower: 61.056217422352596, upper: 177.7254117537294 },
    "secure-up-peak/destination-panel/ttdMeanS": { n: 119, mean: -0.6147743792957063, standardError: 0.18447227955216508, lower: -0.9800797152529794, upper: -0.24946904333843317 },
    "secure-up-peak/destination-panel/wt95S": { n: 119, mean: 0.11202362893861326, standardError: 0.07422709485751457, lower: -0.03496622715187325, upper: 0.25901348502909977 },
    "secure-up-peak/energy-aware/awtS": { n: 119, mean: -0.05830293519214361, standardError: 0.06302840100809483, lower: -0.1831163286245206, upper: 0.0665104582402334 },
    "secure-up-peak/energy-aware/energyKJ": { n: 119, mean: -99.36305259883017, standardError: 27.773439515842096, lower: -154.36202413891283, upper: -44.36408105874749 },
    "secure-up-peak/energy-aware/ttdMeanS": { n: 119, mean: 0.7926348406080278, standardError: 0.12706092794246476, lower: 0.5410196110366957, upper: 1.04425007017936 },
    "secure-up-peak/energy-aware/wt95S": { n: 119, mean: -0.16009522955714756, standardError: 0.11413174819198114, lower: -0.38610716326273525, upper: 0.06591670414844014 },
    "secure-up-peak/eta/awtS": { n: 119, mean: 0.004119363756136925, standardError: 0.013959591873517021, lower: -0.02352442864216493, upper: 0.03176315615443878 },
    "secure-up-peak/eta/energyKJ": { n: 119, mean: -6.691943593876914, standardError: 5.065857569913447, lower: -16.723720758345785, upper: 3.3398335705919564 },
    "secure-up-peak/eta/ttdMeanS": { n: 119, mean: 0.008660463254942994, standardError: 0.010378606115520493, lower: -0.011892002421756698, upper: 0.029212928931642686 },
    "secure-up-peak/eta/wt95S": { n: 119, mean: 0.0036099508422296725, standardError: 0.0036099508422296734, lower: -0.0035387346318772393, upper: 0.010758636316336584 },
    "secure-up-peak/fairness-first/awtS": { n: 119, mean: 0.004119363756136925, standardError: 0.013959591873517021, lower: -0.02352442864216493, upper: 0.03176315615443878 },
    "secure-up-peak/fairness-first/energyKJ": { n: 119, mean: -6.691943593876914, standardError: 5.065857569913447, lower: -16.723720758345785, upper: 3.3398335705919564 },
    "secure-up-peak/fairness-first/ttdMeanS": { n: 119, mean: 0.008660463254942994, standardError: 0.010378606115520493, lower: -0.011892002421756698, upper: 0.029212928931642686 },
    "secure-up-peak/fairness-first/wt95S": { n: 119, mean: 0.0036099508422296725, standardError: 0.0036099508422296734, lower: -0.0035387346318772393, upper: 0.010758636316336584 },
    "secure-up-peak/nearest-car/awtS": { n: 119, mean: 5.572290611848841, standardError: 0.44613511385532933, lower: 4.6888216264549065, upper: 6.455759597242775 },
    "secure-up-peak/nearest-car/energyKJ": { n: 119, mean: -593.7433951847471, standardError: 60.08072739239471, lower: -712.7195923560391, upper: -474.7671980134551 },
    "secure-up-peak/nearest-car/ttdMeanS": { n: 119, mean: 7.339840943986787, standardError: 0.6334328518171413, lower: 6.0854714457554815, upper: 8.594210442218092 },
    "secure-up-peak/nearest-car/wt95S": { n: 119, mean: 18.652143131253485, standardError: 1.6549361902606854, lower: 15.374918919362763, upper: 21.929367343144207 },
    "secure-up-peak/predictive-balanced/awtS": { n: 119, mean: 1.7656648175262257, standardError: 0.14177248291007322, lower: 1.484916703908885, upper: 2.0464129311435664 },
    "secure-up-peak/predictive-balanced/energyKJ": { n: 119, mean: 168.48586908044754, standardError: 52.37274529859218, lower: 64.77357494740544, upper: 272.19816321348964 },
    "secure-up-peak/predictive-balanced/ttdMeanS": { n: 119, mean: 0.7291451060234017, standardError: 0.29779999538117224, lower: 0.13942003933645553, upper: 1.3188701727103478 },
    "secure-up-peak/predictive-balanced/wt95S": { n: 119, mean: 1.7885271788329107, standardError: 0.1454998876339214, lower: 1.5003977890791247, upper: 2.0766565685866967 },
    "secure-up-peak/zoned-uppeak/awtS": { n: 119, mean: 6.9328452331211805, standardError: 0.5536610381800587, lower: 5.836445643709562, upper: 8.029244822532798 },
    "secure-up-peak/zoned-uppeak/energyKJ": { n: 119, mean: -189.9670565509377, standardError: 104.78988029754012, lower: -397.47954850879, upper: 17.545435406914578 },
    "secure-up-peak/zoned-uppeak/ttdMeanS": { n: 119, mean: 9.178842327744611, standardError: 0.6919008822353758, lower: 7.80869021140643, upper: 10.548994444082792 },
    "secure-up-peak/zoned-uppeak/wt95S": { n: 119, mean: 26.859935943816907, standardError: 1.5412112931592503, lower: 23.807917989707576, upper: 29.91195389792624 },
    "vertical-city-up-peak/auction-multi-round/awtS": { n: 50, mean: 2.455852492653803, standardError: 0.2307190412631165, lower: 1.992205220597247, upper: 2.9194997647103587 },
    "vertical-city-up-peak/auction-multi-round/energyKJ": { n: 50, mean: -2794.369019727408, standardError: 618.7866044521679, lower: -4037.8672571017646, upper: -1550.8707823530517 },
    "vertical-city-up-peak/auction-multi-round/ttdMeanS": { n: 50, mean: 2.715427840545977, standardError: 0.49752367695547267, lower: 1.7156165794507765, upper: 3.715239101641177 },
    "vertical-city-up-peak/auction-multi-round/wt95S": { n: 50, mean: 3.192901819377875, standardError: 0.5651214069188882, lower: 2.057247834062046, upper: 4.328555804693703 },
    "vertical-city-up-peak/auction/awtS": { n: 50, mean: 1.5096589097888462, standardError: 0.22098800036672192, lower: 1.0655668965491767, upper: 1.9537509230285157 },
    "vertical-city-up-peak/auction/energyKJ": { n: 50, mean: -5172.264561973397, standardError: 636.8232744864478, lower: -6452.008844808913, upper: -3892.5202791378806 },
    "vertical-city-up-peak/auction/ttdMeanS": { n: 50, mean: 3.619700058554119, standardError: 0.44087762223191596, lower: 2.733723306312445, upper: 4.5056768107957925 },
    "vertical-city-up-peak/auction/wt95S": { n: 50, mean: 2.239623595797196, standardError: 0.5359433313358839, lower: 1.1626051486400577, upper: 3.316642042954334 },
    "vertical-city-up-peak/capacity-aware/awtS": { n: 50, mean: 1.4712432197606193, standardError: 0.22766408962773585, lower: 1.0137351028611519, upper: 1.9287513366600868 },
    "vertical-city-up-peak/capacity-aware/energyKJ": { n: 50, mean: -5223.458439605929, standardError: 637.2579809065398, lower: -6504.0762976986825, upper: -3942.840581513175 },
    "vertical-city-up-peak/capacity-aware/ttdMeanS": { n: 50, mean: 3.8448676990084465, standardError: 0.4016647845220874, lower: 3.0376920944060117, upper: 4.652043303610881 },
    "vertical-city-up-peak/capacity-aware/wt95S": { n: 50, mean: 2.246111847593341, standardError: 0.5346516138567998, lower: 1.1716892038955369, upper: 3.320534491291145 },
    "vertical-city-up-peak/destination-eta/awtS": { n: 50, mean: 1.0782403069441806, standardError: 0.20133166830932459, lower: 0.6736491718598462, upper: 1.4828314420285151 },
    "vertical-city-up-peak/destination-eta/energyKJ": { n: 50, mean: -5282.390142989868, standardError: 621.4255227607459, lower: -6531.191485249949, upper: -4033.5888007297863 },
    "vertical-city-up-peak/destination-eta/ttdMeanS": { n: 50, mean: 2.831482221034472, standardError: 0.4196449944900357, lower: 1.988174031722064, upper: 3.67479041034688 },
    "vertical-city-up-peak/destination-eta/wt95S": { n: 50, mean: 1.7063232554209855, standardError: 0.5661096719330837, lower: 0.5686832772049082, upper: 2.843963233637063 },
    "vertical-city-up-peak/destination-panel/awtS": { n: 50, mean: 2.913966722543325, standardError: 0.44808904430087293, lower: 2.013498075087388, upper: 3.814435369999262 },
    "vertical-city-up-peak/destination-panel/energyKJ": { n: 50, mean: -5315.404261479816, standardError: 640.0227590058408, lower: -6601.578149177083, upper: -4029.2303737825496 },
    "vertical-city-up-peak/destination-panel/ttdMeanS": { n: 50, mean: 5.776246884539021, standardError: 0.8417333765284766, lower: 4.0847203348022205, upper: 7.467773434275822 },
    "vertical-city-up-peak/destination-panel/wt95S": { n: 50, mean: 13.128732881552287, standardError: 3.3491411864186733, lower: 6.398381687675711, upper: 19.85908407542886 },
    "vertical-city-up-peak/energy-aware/awtS": { n: 50, mean: 0.9932436289889859, standardError: 0.19364206330846248, lower: 0.604105333697689, upper: 1.3823819242802826 },
    "vertical-city-up-peak/energy-aware/energyKJ": { n: 50, mean: -5283.327937866747, standardError: 516.3108677556496, lower: -6320.893472369205, upper: -4245.762403364289 },
    "vertical-city-up-peak/energy-aware/ttdMeanS": { n: 50, mean: 3.5214246434632703, standardError: 0.4259630379915655, lower: 2.665419870383083, upper: 4.377429416543458 },
    "vertical-city-up-peak/energy-aware/wt95S": { n: 50, mean: 1.558774147850795, standardError: 0.513993456996487, lower: 0.525865624624207, upper: 2.591682671077383 },
    "vertical-city-up-peak/eta/awtS": { n: 50, mean: 1.0660082150276453, standardError: 0.18211288730329095, lower: 0.7000386663408457, upper: 1.4319777637144449 },
    "vertical-city-up-peak/eta/energyKJ": { n: 50, mean: -5052.457722057181, standardError: 477.6356448791369, lower: -6012.302486376545, upper: -4092.612957737817 },
    "vertical-city-up-peak/eta/ttdMeanS": { n: 50, mean: 2.7945213667338504, standardError: 0.365399981668863, lower: 2.0602226119246287, upper: 3.528820121543072 },
    "vertical-city-up-peak/eta/wt95S": { n: 50, mean: 1.5806453165956083, standardError: 0.47752413263998794, lower: 0.6210246445106746, upper: 2.5402659886805417 },
    "vertical-city-up-peak/fairness-first/awtS": { n: 50, mean: 1.0660082150276453, standardError: 0.18211288730329095, lower: 0.7000386663408457, upper: 1.4319777637144449 },
    "vertical-city-up-peak/fairness-first/energyKJ": { n: 50, mean: -5052.457722057181, standardError: 477.6356448791369, lower: -6012.302486376545, upper: -4092.612957737817 },
    "vertical-city-up-peak/fairness-first/ttdMeanS": { n: 50, mean: 2.7945213667338504, standardError: 0.365399981668863, lower: 2.0602226119246287, upper: 3.528820121543072 },
    "vertical-city-up-peak/fairness-first/wt95S": { n: 50, mean: 1.5806453165956083, standardError: 0.47752413263998794, lower: 0.6210246445106746, upper: 2.5402659886805417 },
    "vertical-city-up-peak/nearest-car/awtS": { n: 50, mean: 3.2070765807342427, standardError: 0.3595073983931572, lower: 2.484619415358601, upper: 3.9295337461098843 },
    "vertical-city-up-peak/nearest-car/energyKJ": { n: 50, mean: -7513.771504602412, standardError: 619.6401237326196, lower: -8758.984953187177, upper: -6268.558056017648 },
    "vertical-city-up-peak/nearest-car/ttdMeanS": { n: 50, mean: 7.913006018503715, standardError: 0.722049588117029, lower: 6.461993046244373, upper: 9.364018990763057 },
    "vertical-city-up-peak/nearest-car/wt95S": { n: 50, mean: 12.889899619284629, standardError: 1.8095544179149539, lower: 9.25346387080494, upper: 16.526335367764318 },
    "vertical-city-up-peak/predictive-balanced/awtS": { n: 50, mean: 2.445210957441342, standardError: 0.20104737898582098, lower: 2.041191123141701, upper: 2.8492307917409834 },
    "vertical-city-up-peak/predictive-balanced/energyKJ": { n: 50, mean: 1452.2215410583544, standardError: 624.1902982728985, lower: 197.86417439282968, upper: 2706.578907723879 },
    "vertical-city-up-peak/predictive-balanced/ttdMeanS": { n: 50, mean: 2.549427190609286, standardError: 0.6032827972065926, lower: 1.3370850203568623, upper: 3.7617693608617095 },
    "vertical-city-up-peak/predictive-balanced/wt95S": { n: 50, mean: 3.6215557081107663, standardError: 0.4906939823849435, lower: 2.6354692321016575, upper: 4.607642184119875 },
    "vertical-city-up-peak/zoned-uppeak/awtS": { n: 50, mean: 8.380408738728606, standardError: 0.4586457003565025, lower: 7.458725696676386, upper: 9.302091780780827 },
    "vertical-city-up-peak/zoned-uppeak/energyKJ": { n: 50, mean: 1549.2564103330476, standardError: 828.3416691088453, lower: -115.35849579038222, upper: 3213.8713164564774 },
    "vertical-city-up-peak/zoned-uppeak/ttdMeanS": { n: 50, mean: 16.306674814221655, standardError: 1.0221975135188068, lower: 14.252492003599189, upper: 18.36085762484412 },
    "vertical-city-up-peak/zoned-uppeak/wt95S": { n: 50, mean: 29.52081371304, standardError: 1.366289886313994, lower: 26.775151390763284, upper: 32.266476035316714 },
  }),
  "phase7-acceptance": Object.freeze({
    "holdout/c-deadband-2.582/awt": { n: 150, mean: -1.105077728188622, standardError: 0.288153532938488, lower: -1.674472906472766, upper: -0.5356825499044778 },
    "holdout/c-deadband-2.582/energy": { n: 150, mean: 111.72153071144275, standardError: 6.6479140799226535, lower: 98.58516488537018, upper: 124.85789653751533 },
    "holdout/c-deadband-2.582/wt95": { n: 150, mean: -1.482922289305665, standardError: 0.34563128399451487, lower: -2.165894261100456, upper: -0.7999503175108739 },
    "holdout/c-deadband-2/awt": { n: 150, mean: -1.0877097991969753, standardError: 0.29989773963425864, lower: -1.6803116846734678, upper: -0.4951079137204829 },
    "holdout/c-deadband-2/energy": { n: 150, mean: 122.1519991411014, standardError: 6.833357231019595, lower: 108.64919520474906, upper: 135.65480307745372 },
    "holdout/c-deadband-2/wt95": { n: 150, mean: -1.2761807143235167, standardError: 0.38925166435925995, lower: -2.0453471325348582, upper: -0.5070142961121751 },
    "holdout/c-deadband-5/awt": { n: 150, mean: -0.22100229170160826, standardError: 0.12022884710417224, lower: -0.45857607791782967, upper: 0.01657149451461315 },
    "holdout/c-deadband-5/energy": { n: 150, mean: 28.716109279928865, standardError: 4.082022255758254, lower: 20.649979510930063, upper: 36.782239048927664 },
    "holdout/c-deadband-5/wt95": { n: 150, mean: -0.30983569352818924, standardError: 0.14939795673687417, lower: -0.6050480247600899, upper: -0.014623362296288578 },
    "tuning/c-deadband-2.582/awt": { n: 150, mean: -0.9038806405552902, standardError: 0.3347881220922914, lower: -1.5654263815434706, upper: -0.24233489956710974 },
    "tuning/c-deadband-2.582/energy": { n: 150, mean: 99.5912699056809, standardError: 6.3313473384358785, lower: 87.08044413240432, upper: 112.10209567895748 },
    "tuning/c-deadband-2.582/wt95": { n: 150, mean: -1.212233198407974, standardError: 0.47063941869670056, lower: -2.1422228916926276, upper: -0.2822435051233204 },
    "tuning/c-deadband-2/awt": { n: 150, mean: -1.160948108361723, standardError: 0.3488492519745968, lower: -1.850278827290538, upper: -0.4716173894329081 },
    "tuning/c-deadband-2/energy": { n: 150, mean: 111.14840015294203, standardError: 6.959168931084213, lower: 97.39699063935453, upper: 124.89980966652953 },
    "tuning/c-deadband-2/wt95": { n: 150, mean: -1.9379456257191672, standardError: 0.47428959481954364, lower: -2.8751481151234453, upper: -1.0007431363148893 },
    "tuning/c-deadband-5/awt": { n: 150, mean: -0.2016719877533211, standardError: 0.11276274544656247, lower: -0.42449265870813857, upper: 0.021148683201496404 },
    "tuning/c-deadband-5/energy": { n: 150, mean: 22.147855295391878, standardError: 3.2378310119530407, lower: 15.749858548641992, upper: 28.545852042141764 },
    "tuning/c-deadband-5/wt95": { n: 150, mean: -0.03159058689358661, standardError: 0.1303228631184574, lower: -0.28911028176984105, upper: 0.2259291079826678 },
  }),
  "down-peak-destination": Object.freeze({
    "arm/destination-eta/awtS": { n: 200, mean: -0.011870604227160495, standardError: 0.011870604227160504, lower: -0.03527891991713265, upper: 0.011537711462811663 },
    "arm/destination-eta/energyKJ": { n: 200, mean: 0.24981553577131252, standardError: 0.24981553577131274, lower: -0.24280984484869564, upper: 0.7424409163913207 },
    "arm/destination-eta/ttdMeanS": { n: 200, mean: -0.024147941087830808, standardError: 0.024147941087830825, lower: -0.07176663154618558, upper: 0.02347074937052396 },
    "arm/destination-eta/wt95S": { n: 200, mean: -0.07250000000000113, standardError: 0.07250000000000119, lower: -0.2154668494582585, upper: 0.07046684945825622 },
    "arm/destination-panel/awtS": { n: 200, mean: 0.03894352575480257, standardError: 0.02621984426903395, lower: -0.012760867740781813, upper: 0.09064791925038695 },
    "arm/destination-panel/energyKJ": { n: 200, mean: 0.6793468057713108, standardError: 0.4958089206913734, lower: -0.29836684008446146, upper: 1.657060451627083 },
    "arm/destination-panel/ttdMeanS": { n: 200, mean: 0.024166188894132218, standardError: 0.033095176178488825, lower: -0.04109606035420488, upper: 0.08942843814246931 },
    "arm/destination-panel/wt95S": { n: 200, mean: 0.08753771179572994, standardError: 0.13253556208989692, lower: -0.17381665721353218, upper: 0.34889208080499207 },
    "gate/rideTime@0.2/awtS": { n: 200, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "gate/rideTime@0.2/energyKJ": { n: 200, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "gate/rideTime@0.2/ttdMeanS": { n: 200, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "gate/rideTime@0.2/wt95S": { n: 200, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "gate/rideTime@0.5/awtS": { n: 200, mean: -0.011870604227160495, standardError: 0.011870604227160504, lower: -0.03527891991713265, upper: 0.011537711462811663 },
    "gate/rideTime@0.5/energyKJ": { n: 200, mean: 0.24981553577131252, standardError: 0.24981553577131274, lower: -0.24280984484869564, upper: 0.7424409163913207 },
    "gate/rideTime@0.5/ttdMeanS": { n: 200, mean: -0.024147941087830808, standardError: 0.024147941087830825, lower: -0.07176663154618558, upper: 0.02347074937052396 },
    "gate/rideTime@0.5/wt95S": { n: 200, mean: -0.07250000000000113, standardError: 0.07250000000000119, lower: -0.2154668494582585, upper: 0.07046684945825622 },
    "gate/rideTime@1/awtS": { n: 200, mean: -0.011870604227160495, standardError: 0.011870604227160504, lower: -0.03527891991713265, upper: 0.011537711462811663 },
    "gate/rideTime@1/energyKJ": { n: 200, mean: 0.24981553577131252, standardError: 0.24981553577131274, lower: -0.24280984484869564, upper: 0.7424409163913207 },
    "gate/rideTime@1/ttdMeanS": { n: 200, mean: -0.024147941087830808, standardError: 0.024147941087830825, lower: -0.07176663154618558, upper: 0.02347074937052396 },
    "gate/rideTime@1/wt95S": { n: 200, mean: -0.07250000000000113, standardError: 0.07250000000000119, lower: -0.2154668494582585, upper: 0.07046684945825622 },
    "gate/rideTime@2/awtS": { n: 200, mean: -0.011870604227160495, standardError: 0.011870604227160504, lower: -0.03527891991713265, upper: 0.011537711462811663 },
    "gate/rideTime@2/energyKJ": { n: 200, mean: 0.24981553577131252, standardError: 0.24981553577131274, lower: -0.24280984484869564, upper: 0.7424409163913207 },
    "gate/rideTime@2/ttdMeanS": { n: 200, mean: -0.024147941087830808, standardError: 0.024147941087830825, lower: -0.07176663154618558, upper: 0.02347074937052396 },
    "gate/rideTime@2/wt95S": { n: 200, mean: -0.07250000000000113, standardError: 0.07250000000000119, lower: -0.2154668494582585, upper: 0.07046684945825622 },
    "gate/rideTime@8/awtS": { n: 200, mean: -0.011870604227160495, standardError: 0.011870604227160504, lower: -0.03527891991713265, upper: 0.011537711462811663 },
    "gate/rideTime@8/energyKJ": { n: 200, mean: 0.24981553577131252, standardError: 0.24981553577131274, lower: -0.24280984484869564, upper: 0.7424409163913207 },
    "gate/rideTime@8/ttdMeanS": { n: 200, mean: -0.024147941087830808, standardError: 0.024147941087830825, lower: -0.07176663154618558, upper: 0.02347074937052396 },
    "gate/rideTime@8/wt95S": { n: 200, mean: -0.07250000000000113, standardError: 0.07250000000000119, lower: -0.2154668494582585, upper: 0.07046684945825622 },
    "gate/stopCount@0.2/awtS": { n: 200, mean: 0.12704286804079185, standardError: 0.03173016668138338, lower: 0.06447235820323768, upper: 0.189613377878346 },
    "gate/stopCount@0.2/energyKJ": { n: 200, mean: 0.6361274283895392, standardError: 1.0766551196168554, lower: -1.4869896806411167, upper: 2.759244537420195 },
    "gate/stopCount@0.2/ttdMeanS": { n: 200, mean: 0.048014584799885365, standardError: 0.06515849432979422, lower: -0.08047513450734571, upper: 0.17650430410711643 },
    "gate/stopCount@0.2/wt95S": { n: 200, mean: 0.39447700177064704, standardError: 0.13450275785449978, lower: 0.12924340819955188, upper: 0.6597105953417421 },
    "gate/stopCount@0.5/awtS": { n: 200, mean: 1.266897620871491, standardError: 0.1660286978232581, lower: 0.9394962436653138, upper: 1.5942989980776683 },
    "gate/stopCount@0.5/energyKJ": { n: 200, mean: -1.3818077281997079, standardError: 1.2033995801944743, lower: -3.7548594057140625, upper: 0.9912439493146468 },
    "gate/stopCount@0.5/ttdMeanS": { n: 200, mean: 1.3589284430076563, standardError: 0.17600465929324066, lower: 1.011854903295543, upper: 1.7060019827197694 },
    "gate/stopCount@0.5/wt95S": { n: 200, mean: 3.9120822523378758, standardError: 0.5803615863330468, lower: 2.767634424136072, upper: 5.056530080539679 },
    "gate/stopCount@1/awtS": { n: 200, mean: 1.3204998781277697, standardError: 0.1685455535478911, lower: 0.9881353708044647, upper: 1.6528643854510747 },
    "gate/stopCount@1/energyKJ": { n: 200, mean: -1.5356908028975014, standardError: 1.1925248448108798, lower: -3.88729797480517, upper: 0.8159163690101676 },
    "gate/stopCount@1/ttdMeanS": { n: 200, mean: 1.418521346522438, standardError: 0.1781566425036638, lower: 1.067204189435411, upper: 1.769838503609465 },
    "gate/stopCount@1/wt95S": { n: 200, mean: 4.059575635417621, standardError: 0.588681561550288, lower: 2.898721177638166, upper: 5.220430093197077 },
    "gate/stopCount@2/awtS": { n: 200, mean: 1.3204998781277697, standardError: 0.1685455535478911, lower: 0.9881353708044647, upper: 1.6528643854510747 },
    "gate/stopCount@2/energyKJ": { n: 200, mean: -1.5356908028975014, standardError: 1.1925248448108798, lower: -3.88729797480517, upper: 0.8159163690101676 },
    "gate/stopCount@2/ttdMeanS": { n: 200, mean: 1.418521346522438, standardError: 0.1781566425036638, lower: 1.067204189435411, upper: 1.769838503609465 },
    "gate/stopCount@2/wt95S": { n: 200, mean: 4.059575635417621, standardError: 0.588681561550288, lower: 2.898721177638166, upper: 5.220430093197077 },
    "gate/stopCount@8/awtS": { n: 200, mean: 1.3204998781277697, standardError: 0.1685455535478911, lower: 0.9881353708044647, upper: 1.6528643854510747 },
    "gate/stopCount@8/energyKJ": { n: 200, mean: -1.5356908028975014, standardError: 1.1925248448108798, lower: -3.88729797480517, upper: 0.8159163690101676 },
    "gate/stopCount@8/ttdMeanS": { n: 200, mean: 1.418521346522438, standardError: 0.1781566425036638, lower: 1.067204189435411, upper: 1.769838503609465 },
    "gate/stopCount@8/wt95S": { n: 200, mean: 4.059575635417621, standardError: 0.588681561550288, lower: 2.898721177638166, upper: 5.220430093197077 },
  }),
  "weight-set-selection": Object.freeze({
    "fuzzy/cost/awtS": { n: 200, mean: 0.18667070499178734, standardError: 0.07865704864617196, lower: 0.031562423162436876, upper: 0.34177898682113783 },
    "fuzzy/cost/energyKJ": { n: 200, mean: 238.89532961813023, standardError: 43.932239782849834, lower: 152.26286187470052, upper: 325.5277973615599 },
    "fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 2.7016977138557805, standardError: 0.48843006731413946, lower: 1.7385348462063193, upper: 3.6648605815052417 },
    "fuzzy/cost/wt95S": { n: 200, mean: 0.4958181695220356, standardError: 0.28774271112887445, lower: -0.0715979527493017, upper: 1.063234291793373 },
    "fuzzy/gate/ttdMeanS": { n: 200, mean: -0.21173272081199396, standardError: 0.1035801302921803, lower: -0.41598823659611234, upper: -0.0074772050278755775 },
    "learned/cost/awtS": { n: 200, mean: 0.42436946576747575, standardError: 0.08503496446391777, lower: 0.2566842111026344, upper: 0.5920547204323171 },
    "learned/cost/energyKJ": { n: 200, mean: 415.85940156296755, standardError: 52.004285749379555, lower: 313.30920995033824, upper: 518.4095931755968 },
    "learned/cost/energyPerServedLegKJ": { n: 200, mean: 4.807179602393214, standardError: 0.5966794619558817, lower: 3.630553632568674, upper: 5.983805572217754 },
    "learned/cost/wt95S": { n: 200, mean: 0.6746101110913333, standardError: 0.3762814730038012, lower: -0.06740060207921705, upper: 1.4166208242618836 },
    "learned/gate/ttdMeanS": { n: 200, mean: -0.2126738011766477, standardError: 0.11505015212659633, lower: -0.43954770157985373, upper: 0.01420009922655835 },
  }),
  "selection-sweep": Object.freeze({
    "garden-down-peak-2pct/fuzzy/cost/awtS": { n: 200, mean: -0.12281297604772816, standardError: 0.04118151148177824, lower: -0.20402112711640114, upper: -0.04160482497905518 },
    "garden-down-peak-2pct/fuzzy/cost/energyKJ": { n: 200, mean: 3.0206756739324936, standardError: 1.3713602338543005, lower: 0.31641288625683606, upper: 5.724938461608151 },
    "garden-down-peak-2pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 0.21391902980790192, standardError: 0.09047294988779082, lower: 0.035510304198908244, upper: 0.3923277554168956 },
    "garden-down-peak-2pct/fuzzy/cost/wt95S": { n: 200, mean: -0.35225452754548087, standardError: 0.12992794211414344, lower: -0.6084667832786342, upper: -0.0960422718123275 },
    "garden-down-peak-2pct/fuzzy/gate/ttdMeanS": { n: 200, mean: -0.1891113049553149, standardError: 0.06068428014887685, lower: -0.3087780683281018, upper: -0.069444541582528 },
    "garden-down-peak-2pct/learned/cost/awtS": { n: 200, mean: -0.12510868425085786, standardError: 0.04210769656954349, lower: -0.20814323206453794, upper: -0.04207413643717778 },
    "garden-down-peak-2pct/learned/cost/energyKJ": { n: 200, mean: 3.3428241264324936, standardError: 1.405214772448594, lower: 0.5718016598231941, upper: 6.113846593041793 },
    "garden-down-peak-2pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 0.24971330230790187, standardError: 0.09690009838515876, lower: 0.05863051915864542, upper: 0.4407960854571583 },
    "garden-down-peak-2pct/learned/cost/wt95S": { n: 200, mean: -0.3672573457446645, standardError: 0.1311064117007511, lower: -0.6257934922913306, upper: -0.10872119919799844 },
    "garden-down-peak-2pct/learned/gate/ttdMeanS": { n: 200, mean: -0.19140701315844463, standardError: 0.06230781476216987, lower: -0.314275316236734, upper: -0.06853871008015525 },
    "garden-residential-2pct/fuzzy/cost/awtS": { n: 200, mean: -0.04156718820292118, standardError: 0.06246553981949952, lower: -0.16474651824020425, upper: 0.08161214183436188 },
    "garden-residential-2pct/fuzzy/cost/energyKJ": { n: 200, mean: 3.881014567952195, standardError: 1.5445205581605093, lower: 0.8352871455561459, upper: 6.926741990348244 },
    "garden-residential-2pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 0.3763017721620814, standardError: 0.14769634790360703, lower: 0.08505099235147384, upper: 0.6675525519726889 },
    "garden-residential-2pct/fuzzy/cost/wt95S": { n: 200, mean: -0.198894545902648, standardError: 0.11045678174719653, lower: -0.4167105195260242, upper: 0.018921427720728246 },
    "garden-residential-2pct/fuzzy/gate/ttdMeanS": { n: 200, mean: -0.1389492146751261, standardError: 0.06486253680516461, lower: -0.2668553186048433, upper: -0.011043110745408924 },
    "garden-residential-2pct/learned/cost/awtS": { n: 200, mean: -0.0364300929870959, standardError: 0.06178059385870126, lower: -0.158258739354524, upper: 0.0853985533803322 },
    "garden-residential-2pct/learned/cost/energyKJ": { n: 200, mean: 5.067213221485638, standardError: 1.7024034413952387, lower: 1.710147614269522, upper: 8.424278828701754 },
    "garden-residential-2pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 0.43029597312212503, standardError: 0.15744664573582895, lower: 0.11981802969286343, upper: 0.7407739165513867 },
    "garden-residential-2pct/learned/cost/wt95S": { n: 200, mean: -0.1886006548113123, standardError: 0.10858951138089762, lower: -0.40273445241597794, upper: 0.025533142793353364 },
    "garden-residential-2pct/learned/gate/ttdMeanS": { n: 200, mean: -0.11053631822971845, standardError: 0.06950705173560612, lower: -0.24760120377139488, upper: 0.026528567311958004 },
    "midtown-down-peak-1pct/fuzzy/cost/awtS": { n: 200, mean: -1.5586333735833053, standardError: 0.2094644588600445, lower: -1.9716881840205307, upper: -1.14557856314608 },
    "midtown-down-peak-1pct/fuzzy/cost/energyKJ": { n: 200, mean: 374.77448024334836, standardError: 40.805714605116385, lower: 294.3073842849181, upper: 455.2415762017786 },
    "midtown-down-peak-1pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 21.56374141385832, standardError: 2.4428901210727676, lower: 16.74646825272082, upper: 26.38101457499582 },
    "midtown-down-peak-1pct/fuzzy/cost/wt95S": { n: 200, mean: -7.120676728296931, standardError: 0.7380088956456584, lower: -8.575998199781425, upper: -5.665355256812436 },
    "midtown-down-peak-1pct/fuzzy/gate/ttdMeanS": { n: 200, mean: -2.120811960471577, standardError: 0.3044764800305503, lower: -2.7212263478385714, upper: -1.520397573104583 },
    "midtown-down-peak-1pct/learned/cost/awtS": { n: 200, mean: -1.577901721818829, standardError: 0.20866870779344118, lower: -1.9893873457326705, upper: -1.1664160979049873 },
    "midtown-down-peak-1pct/learned/cost/energyKJ": { n: 200, mean: 362.02634369513703, standardError: 40.917561495991635, lower: 281.3386905282911, upper: 442.71399686198293 },
    "midtown-down-peak-1pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 20.705172262125874, standardError: 2.4454526931463616, lower: 15.882845820217733, upper: 25.527498704034016 },
    "midtown-down-peak-1pct/learned/cost/wt95S": { n: 200, mean: -7.154337651542963, standardError: 0.7365690330502783, lower: -8.606819776559675, upper: -5.70185552652625 },
    "midtown-down-peak-1pct/learned/gate/ttdMeanS": { n: 200, mean: -2.12986734673333, standardError: 0.30450047127632307, lower: -2.7303290437944305, upper: -1.5294056496722295 },
    "midtown-hotel-1.5pct/fuzzy/cost/awtS": { n: 200, mean: 0.3570138257262967, standardError: 0.07683543208647035, lower: 0.20549769259296724, upper: 0.5085299588596262 },
    "midtown-hotel-1.5pct/fuzzy/cost/energyKJ": { n: 200, mean: 303.71810890337946, standardError: 38.334860599806, lower: 228.12342967061178, upper: 379.3127881361471 },
    "midtown-hotel-1.5pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 3.3583082324313107, standardError: 0.4415595047963524, lower: 2.4875720772715626, upper: 4.229044387591059 },
    "midtown-hotel-1.5pct/fuzzy/cost/wt95S": { n: 200, mean: 0.9676482622620898, standardError: 0.3768432874447279, lower: 0.22452967542809887, upper: 1.7107668490960806 },
    "midtown-hotel-1.5pct/fuzzy/gate/ttdMeanS": { n: 200, mean: -0.08110255652011272, standardError: 0.09720989485265698, lower: -0.2727962448408384, upper: 0.11059113180061295 },
    "midtown-hotel-1.5pct/learned/cost/awtS": { n: 200, mean: 0.28835248808844144, standardError: 0.07230988729177808, lower: 0.14576053262931007, upper: 0.4309444435475728 },
    "midtown-hotel-1.5pct/learned/cost/energyKJ": { n: 200, mean: 262.2430547608433, standardError: 36.841624420497986, lower: 189.5929723839756, upper: 334.89313713771094 },
    "midtown-hotel-1.5pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 2.8601862828593907, standardError: 0.40659839733426684, lower: 2.0583919123537924, upper: 3.661980653364989 },
    "midtown-hotel-1.5pct/learned/cost/wt95S": { n: 200, mean: 0.7661669426295282, standardError: 0.3581221034040376, lower: 0.05996571718071875, upper: 1.4723681680783378 },
    "midtown-hotel-1.5pct/learned/gate/ttdMeanS": { n: 200, mean: -0.08512579780815735, standardError: 0.08974627776882896, lower: -0.2621015575766389, upper: 0.09184996196032416 },
    "midtown-interfloor-1.0pct/fuzzy/cost/awtS": { n: 200, mean: 0.14669362108319287, standardError: 0.04474398588716329, lower: 0.058460425297091334, upper: 0.2349268168692944 },
    "midtown-interfloor-1.0pct/fuzzy/cost/energyKJ": { n: 200, mean: 146.1390499992873, standardError: 28.567929616224806, lower: 89.80433423684816, upper: 202.47376576172644 },
    "midtown-interfloor-1.0pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 2.404452193585284, standardError: 0.49220960718238965, lower: 1.433836237558366, upper: 3.3750681496122015 },
    "midtown-interfloor-1.0pct/fuzzy/cost/wt95S": { n: 200, mean: 0.2906400097730424, standardError: 0.21489745268829535, lower: -0.13312842839868178, upper: 0.7144084479447665 },
    "midtown-interfloor-1.0pct/fuzzy/gate/ttdMeanS": { n: 200, mean: -0.13719996643652685, standardError: 0.06646752120008882, lower: -0.26827102984723683, upper: -0.0061289030258168675 },
    "midtown-interfloor-1.0pct/learned/cost/awtS": { n: 200, mean: 0.2112568248273087, standardError: 0.04906784959462372, lower: 0.11449715770682775, upper: 0.3080164919477897 },
    "midtown-interfloor-1.0pct/learned/cost/energyKJ": { n: 200, mean: 223.90401442016847, standardError: 32.50894154611285, lower: 159.79779439161223, upper: 288.0102344487247 },
    "midtown-interfloor-1.0pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 3.743808890886852, standardError: 0.5623983415789086, lower: 2.6347838007339677, upper: 4.852833981039736 },
    "midtown-interfloor-1.0pct/learned/cost/wt95S": { n: 200, mean: 0.29687184864601435, standardError: 0.24232617381514554, lower: -0.18098483565225948, upper: 0.7747285329442881 },
    "midtown-interfloor-1.0pct/learned/gate/ttdMeanS": { n: 200, mean: -0.2648280414795633, standardError: 0.08306130130823353, lower: -0.42862131816840443, upper: -0.10103476479072213 },
    "midtown-interfloor-2.0pct/fuzzy/cost/awtS": { n: 200, mean: 0.858504254741524, standardError: 0.13769685819679928, lower: 0.5869720340974345, upper: 1.1300364753856136 },
    "midtown-interfloor-2.0pct/fuzzy/cost/energyKJ": { n: 200, mean: 373.5036096986524, standardError: 76.29639044483329, lower: 223.05044325817337, upper: 523.9567761391314 },
    "midtown-interfloor-2.0pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 3.1961116588324194, standardError: 0.6297467179395249, lower: 1.9542784971704852, upper: 4.437944820494353 },
    "midtown-interfloor-2.0pct/fuzzy/cost/wt95S": { n: 200, mean: 2.9890201362613396, standardError: 0.5857229601515171, lower: 1.833999911872023, upper: 4.144040360650656 },
    "midtown-interfloor-2.0pct/fuzzy/gate/ttdMeanS": { n: 200, mean: 0.7700448420102868, standardError: 0.21021898807555744, lower: 0.35550213274870157, upper: 1.184587551271872 },
    "midtown-interfloor-2.0pct/learned/cost/awtS": { n: 200, mean: 1.6420719663566872, standardError: 0.14874934601897402, lower: 1.348744720021397, upper: 1.9353992126919775 },
    "midtown-interfloor-2.0pct/learned/cost/energyKJ": { n: 200, mean: 1121.4691901659128, standardError: 75.78017612607444, lower: 972.0339759295468, upper: 1270.9044044022787 },
    "midtown-interfloor-2.0pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 9.424999134181439, standardError: 0.6434984079473108, lower: 8.15604823741413, upper: 10.693950030948749 },
    "midtown-interfloor-2.0pct/learned/cost/wt95S": { n: 200, mean: 4.567713389385008, standardError: 0.5570679332355025, lower: 3.469199632848438, upper: 5.666227145921578 },
    "midtown-interfloor-2.0pct/learned/gate/ttdMeanS": { n: 200, mean: -0.1140968587627772, standardError: 0.22236112545674946, lower: -0.5525833352944084, upper: 0.324389617768854 },
    "secure-up-peak-2pct/fuzzy/cost/awtS": { n: 126, mean: -0.19938270102712635, standardError: 0.054104728792215055, lower: -0.30646267421363416, upper: -0.09230272784061852 },
    "secure-up-peak-2pct/fuzzy/cost/energyKJ": { n: 126, mean: -91.76116877488262, standardError: 28.300156452691894, lower: -147.77069071087016, upper: -35.7516468388951 },
    "secure-up-peak-2pct/fuzzy/cost/energyPerServedLegKJ": { n: 126, mean: -5.107515575701308, standardError: 1.6562049830894194, lower: -8.385350787881384, upper: -1.8296803635212324 },
    "secure-up-peak-2pct/fuzzy/cost/wt95S": { n: 126, mean: -0.08457804947473001, standardError: 0.04201084664285095, lower: -0.16772272892290147, upper: -0.0014333700265585642 },
    "secure-up-peak-2pct/fuzzy/gate/ttdMeanS": { n: 126, mean: -0.22515287150239127, standardError: 0.067098137926129, lower: -0.35794841396943533, upper: -0.09235732903534719 },
    "secure-up-peak-2pct/learned/cost/awtS": { n: 126, mean: -0.18863868709910442, standardError: 0.049729869011550715, lower: -0.28706026981835103, upper: -0.09021710437985782 },
    "secure-up-peak-2pct/learned/cost/energyKJ": { n: 126, mean: -75.74604634299139, standardError: 25.5262095842503, lower: -126.26558315338556, upper: -25.226509532597227 },
    "secure-up-peak-2pct/learned/cost/energyPerServedLegKJ": { n: 126, mean: -4.115737123301034, standardError: 1.5089054590924842, lower: -7.1020482962321285, upper: -1.129425950369939 },
    "secure-up-peak-2pct/learned/cost/wt95S": { n: 126, mean: -0.07265215714862193, standardError: 0.04045426302294784, lower: -0.15271616442630898, upper: 0.007411850129065117 },
    "secure-up-peak-2pct/learned/gate/ttdMeanS": { n: 126, mean: -0.21441487477441387, standardError: 0.06571061669157235, lower: -0.3444643405138095, upper: -0.08436540903501827 },
    "vertical-city-up-peak-1pct/fuzzy/cost/awtS": { n: 200, mean: 0.11275041387366398, standardError: 0.042003566979564005, lower: 0.029921205086394204, upper: 0.19557962266093376 },
    "vertical-city-up-peak-1pct/fuzzy/cost/energyKJ": { n: 200, mean: 434.3841011402187, standardError: 140.5132045938455, lower: 157.2981677875939, upper: 711.4700344928435 },
    "vertical-city-up-peak-1pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 5.948827113650339, standardError: 1.803225535568218, lower: 2.392944718024646, upper: 9.504709509276031 },
    "vertical-city-up-peak-1pct/fuzzy/cost/wt95S": { n: 200, mean: 0.049429137122255946, standardError: 0.07815598947443053, lower: -0.10469107779432163, upper: 0.2035493520388335 },
    "vertical-city-up-peak-1pct/fuzzy/gate/ttdMeanS": { n: 200, mean: -0.040286406922495244, standardError: 0.09221159025343797, lower: -0.22212365577862714, upper: 0.14155084193363665 },
    "vertical-city-up-peak-1pct/learned/cost/awtS": { n: 200, mean: 0.04283756256258224, standardError: 0.019073255684410748, lower: 0.0052259311955207485, upper: 0.08044919392964373 },
    "vertical-city-up-peak-1pct/learned/cost/energyKJ": { n: 200, mean: 88.33213772201054, standardError: 56.89005051222852, lower: -23.852569688393586, upper: 200.5168451324147 },
    "vertical-city-up-peak-1pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 1.4941670113191967, standardError: 0.8279227495211193, lower: -0.13846067273391305, upper: 3.1267946953723067 },
    "vertical-city-up-peak-1pct/learned/cost/wt95S": { n: 200, mean: 0.04918866111823037, standardError: 0.047370039177888595, lower: -0.04422299764007089, upper: 0.14260031987653163 },
    "vertical-city-up-peak-1pct/learned/gate/ttdMeanS": { n: 200, mean: 0.02642891794765916, standardError: 0.03624667923624022, lower: -0.045047958379640346, upper: 0.09790579427495866 },
  }),
  "lunch-two-way-selection": Object.freeze({
    "midtown-lunch-two-way-1.5pct-flat/fuzzy/cost/awtS": { n: 200, mean: 0.29473512218223963, standardError: 0.06707864992311303, lower: 0.1624589394867818, upper: 0.42701130487769745 },
    "midtown-lunch-two-way-1.5pct-flat/fuzzy/cost/energyKJ": { n: 200, mean: 423.7045020604479, standardError: 52.06417449362999, lower: 321.0362124466669, upper: 526.3727916742289 },
    "midtown-lunch-two-way-1.5pct-flat/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 4.740361611701387, standardError: 0.5689706642413653, lower: 3.618376186863337, upper: 5.862347036539438 },
    "midtown-lunch-two-way-1.5pct-flat/fuzzy/cost/wt95S": { n: 200, mean: 1.3957089675125303, standardError: 0.27248267992541564, lower: 0.8583849636383402, upper: 1.9330329713867203 },
    "midtown-lunch-two-way-1.5pct-flat/fuzzy/gate/ttdMeanS": { n: 200, mean: -0.04919050878216346, standardError: 0.11417119298419749, lower: -0.27433113995238617, upper: 0.17595012238805924 },
    "midtown-lunch-two-way-1.5pct-flat/learned/cost/awtS": { n: 200, mean: 0.3600864377565663, standardError: 0.08002469135896803, lower: 0.20228122392951933, upper: 0.5178916515836133 },
    "midtown-lunch-two-way-1.5pct-flat/learned/cost/energyKJ": { n: 200, mean: 764.8501305781607, standardError: 56.407038402013576, lower: 653.6179020594478, upper: 876.0823590968736 },
    "midtown-lunch-two-way-1.5pct-flat/learned/cost/energyPerServedLegKJ": { n: 200, mean: 8.674859937938496, standardError: 0.6381213806590205, lower: 7.416512305320952, upper: 9.933207570556041 },
    "midtown-lunch-two-way-1.5pct-flat/learned/cost/wt95S": { n: 200, mean: 1.5205644221075747, standardError: 0.3106783647823233, lower: 0.9079201875176264, upper: 2.133208656697523 },
    "midtown-lunch-two-way-1.5pct-flat/learned/gate/ttdMeanS": { n: 200, mean: -0.5759046378323341, standardError: 0.1304358596908561, lower: -0.8331184849548265, upper: -0.31869079070984174 },
    "midtown-lunch-two-way-1.5pct/fuzzy/cost/awtS": { n: 200, mean: 0.25392997610201073, standardError: 0.065417818627184, lower: 0.12492888054945836, upper: 0.3829310716545631 },
    "midtown-lunch-two-way-1.5pct/fuzzy/cost/energyKJ": { n: 200, mean: 145.28678389300057, standardError: 48.31927453515855, lower: 50.00327425989563, upper: 240.5702935261055 },
    "midtown-lunch-two-way-1.5pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 1.3183239152668562, standardError: 0.5354891988582492, lower: 0.26236248520218175, upper: 2.374285345331531 },
    "midtown-lunch-two-way-1.5pct/fuzzy/cost/wt95S": { n: 200, mean: 0.8755520103981754, standardError: 0.20992978465604142, lower: 0.4615795977123248, upper: 1.2895244230840262 },
    "midtown-lunch-two-way-1.5pct/fuzzy/gate/ttdMeanS": { n: 200, mean: 0.18645914443154543, standardError: 0.10778343359223243, lower: -0.026085102802585886, upper: 0.3990033916656768 },
    "midtown-lunch-two-way-1.5pct/learned/cost/awtS": { n: 200, mean: 0.2634305480263069, standardError: 0.07090128377726525, lower: 0.12361629748587516, upper: 0.4032447985667386 },
    "midtown-lunch-two-way-1.5pct/learned/cost/energyKJ": { n: 200, mean: 415.899133058157, standardError: 51.936241856497894, lower: 313.48312104539207, upper: 518.315145070922 },
    "midtown-lunch-two-way-1.5pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 4.443549783624212, standardError: 0.5830506682747879, lower: 3.293799202689362, upper: 5.593300364559061 },
    "midtown-lunch-two-way-1.5pct/learned/cost/wt95S": { n: 200, mean: 0.8087805158646946, standardError: 0.23605125713104458, lower: 0.3432976945862684, upper: 1.2742633371431207 },
    "midtown-lunch-two-way-1.5pct/learned/gate/ttdMeanS": { n: 200, mean: -0.1701872278619276, standardError: 0.11887551599771772, lower: -0.4046045795849358, upper: 0.0642301238610806 },
  }),
  "double-deck": Object.freeze({
    "up-peak-1.5pct/collective−collective@single-deck/awtS": { n: 200, mean: 0.3958203744435449, standardError: 0.1211146289491393, lower: 0.15698758928266196, upper: 0.6346531596044278 },
    "up-peak-1.5pct/collective−collective@single-deck/carDistanceM": { n: 200, mean: 1741.6060000000004, standardError: 57.5937411304999, lower: 1628.0336452697675, upper: 1855.1783547302334 },
    "up-peak-1.5pct/collective−collective@single-deck/carStarts": { n: 200, mean: 11.81, standardError: 0.531301142971303, lower: 10.762297234149282, upper: 12.85770276585072 },
    "up-peak-1.5pct/collective−collective@single-deck/energyKJ": { n: 200, mean: 14004.640856094386, standardError: 464.8091116705003, lower: 13088.05748650788, upper: 14921.224225680891 },
    "up-peak-1.5pct/collective−collective@single-deck/energyPerServedLegKJ": { n: 200, mean: 119.18109238198585, standardError: 4.014479464355479, lower: 111.26471333048563, upper: 127.09747143348606 },
    "up-peak-1.5pct/collective−collective@single-deck/rideMeanS": { n: 200, mean: -10.051134748552359, standardError: 0.3187697938093537, lower: -10.679734929564509, upper: -9.42253456754021 },
    "up-peak-1.5pct/collective−collective@single-deck/ttdMeanS": { n: 200, mean: -12.08964575773569, standardError: 0.516021937179756, lower: -13.107218593734798, upper: -11.072072921736583 },
    "up-peak-1.5pct/collective−collective@single-deck/ttdP95S": { n: 200, mean: -31.908928989983323, standardError: 1.5516079962517337, lower: -34.96863253230534, upper: -28.849225447661304 },
    "up-peak-1.5pct/collective−collective@single-deck/unservedFraction": { n: 200, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "up-peak-1.5pct/collective−collective@single-deck/wt95S": { n: 200, mean: 0.5634109534504419, standardError: 0.29079825081312366, lower: -0.010030560297471736, upper: 1.1368524671983555 },
    "up-peak-1.5pct/eta−eta@single-deck/awtS": { n: 200, mean: 1.6318710775658047, standardError: 0.12000127811375065, lower: 1.3952337718708145, upper: 1.868508383260795 },
    "up-peak-1.5pct/eta−eta@single-deck/carDistanceM": { n: 200, mean: 546.3445000000003, standardError: 36.334884595130596, lower: 474.6936865379988, upper: 617.9953134620017 },
    "up-peak-1.5pct/eta−eta@single-deck/carStarts": { n: 200, mean: 3.07, standardError: 0.42488603260582436, lower: 2.2321432074417635, upper: 3.907856792558236 },
    "up-peak-1.5pct/eta−eta@single-deck/energyKJ": { n: 200, mean: 3981.793803668221, standardError: 280.3446197827664, lower: 3428.966396041814, upper: 4534.621211294628 },
    "up-peak-1.5pct/eta−eta@single-deck/energyPerServedLegKJ": { n: 200, mean: 33.247733635770835, standardError: 2.5864978250042316, lower: 28.14727232306071, upper: 38.34819494848096 },
    "up-peak-1.5pct/eta−eta@single-deck/rideMeanS": { n: 200, mean: -7.827498450352788, standardError: 0.30168675376414933, lower: -8.422411618752083, upper: -7.232585281953495 },
    "up-peak-1.5pct/eta−eta@single-deck/ttdMeanS": { n: 200, mean: -6.427396276152678, standardError: 0.41674140568196927, lower: -7.249192218347929, upper: -5.605600333957428 },
    "up-peak-1.5pct/eta−eta@single-deck/ttdP95S": { n: 200, mean: -19.254872607299443, standardError: 1.3373564496408201, lower: -21.892081410166004, upper: -16.617663804432883 },
    "up-peak-1.5pct/eta−eta@single-deck/unservedFraction": { n: 200, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "up-peak-1.5pct/eta−eta@single-deck/wt95S": { n: 200, mean: 2.5920837269063988, standardError: 0.3046649402123605, lower: 1.991297704250553, upper: 3.1928697495622442 },
    "up-peak-1pct/collective−collective@single-deck/awtS": { n: 153, mean: 0.019467176825324044, standardError: 0.11657867651687248, lower: -0.21085660648180382, upper: 0.2497909601324519 },
    "up-peak-1pct/collective−collective@single-deck/carDistanceM": { n: 153, mean: 962.8385620915031, standardError: 51.98108924981932, lower: 860.1398396994105, upper: 1065.5372844835958 },
    "up-peak-1pct/collective−collective@single-deck/carStarts": { n: 153, mean: 4.980392156862745, standardError: 0.43024526691216225, lower: 4.130359195553118, upper: 5.830425118172372 },
    "up-peak-1pct/collective−collective@single-deck/energyKJ": { n: 153, mean: 8134.488710626324, standardError: 434.01879342466435, lower: 7277.000415899496, upper: 8991.977005353152 },
    "up-peak-1pct/collective−collective@single-deck/energyPerServedLegKJ": { n: 153, mean: 101.44029723035133, standardError: 5.4952040092116645, lower: 90.58345603724561, upper: 112.29713842345706 },
    "up-peak-1pct/collective−collective@single-deck/rideMeanS": { n: 153, mean: -6.290463590460582, standardError: 0.311254234867015, lower: -6.905406692294137, upper: -5.6755204886270265 },
    "up-peak-1pct/collective−collective@single-deck/ttdMeanS": { n: 153, mean: -6.262486756541246, standardError: 0.47974690492370176, lower: -7.210319803487183, upper: -5.314653709595309 },
    "up-peak-1pct/collective−collective@single-deck/ttdP95S": { n: 153, mean: -18.841813902281217, standardError: 1.7865166398508594, lower: -22.371423979575535, upper: -15.312203824986899 },
    "up-peak-1pct/collective−collective@single-deck/unservedFraction": { n: 153, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "up-peak-1pct/collective−collective@single-deck/wt95S": { n: 153, mean: -0.06629375359548093, standardError: 0.2703626858360339, lower: -0.6004476703095659, upper: 0.467860163118604 },
    "up-peak-1pct/eta−eta@single-deck/awtS": { n: 153, mean: 0.7849630986064627, standardError: 0.12160100296718883, lower: 0.5447167354279387, upper: 1.0252094617849867 },
    "up-peak-1pct/eta−eta@single-deck/carDistanceM": { n: 153, mean: 318.1477124183005, standardError: 32.99205696961752, lower: 252.96550579729106, upper: 383.32991903930997 },
    "up-peak-1pct/eta−eta@single-deck/carStarts": { n: 153, mean: 0.6339869281045751, standardError: 0.3435923399572628, lower: -0.044846371592835665, upper: 1.312820227801986 },
    "up-peak-1pct/eta−eta@single-deck/energyKJ": { n: 153, mean: 2622.5309611468087, standardError: 270.5324687539836, lower: 2088.0416053526837, upper: 3157.0203169409338 },
    "up-peak-1pct/eta−eta@single-deck/energyPerServedLegKJ": { n: 153, mean: 32.22970186039005, standardError: 3.522588138713578, lower: 25.270145864539472, upper: 39.18925785624063 },
    "up-peak-1pct/eta−eta@single-deck/rideMeanS": { n: 153, mean: -4.956125526235181, standardError: 0.2796968069570638, lower: -5.508720809369577, upper: -4.403530243100785 },
    "up-peak-1pct/eta−eta@single-deck/ttdMeanS": { n: 153, mean: -2.728893863990816, standardError: 0.4157997615440845, lower: -3.550386928060509, upper: -1.9074007999211229 },
    "up-peak-1pct/eta−eta@single-deck/ttdP95S": { n: 153, mean: -11.448214422622819, standardError: 1.5750258039555998, lower: -14.559983339650291, upper: -8.336445505595346 },
    "up-peak-1pct/eta−eta@single-deck/unservedFraction": { n: 153, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "up-peak-1pct/eta−eta@single-deck/wt95S": { n: 153, mean: 1.087600644681388, standardError: 0.25049612106434077, lower: 0.5926969793532862, upper: 1.5825043100094898 },
  }),
});
