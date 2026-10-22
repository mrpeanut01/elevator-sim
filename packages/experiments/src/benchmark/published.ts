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
 * **Since 2026-09-07 those suites are behind `ELEVATOR_SIM_BENCHMARK=1`**, so *already pay it* is
 * true of the benchmark tier and not of a pull request: Layer A is re-derived nightly and on
 * dispatch, in `.github/workflows/deep-tiers.yml`'s four `benchmark-*` jobs, and a moved pin is
 * filed by that workflow's `report` job rather than reddening the branch that moved it. Layer B is
 * a source scan and stays always-on. The measurement behind the move — 3 665 s of the `experiments`
 * leg's 4 000 s, on a leg that was the whole run's wall clock — is in that workflow's header.
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
import type { DeadbandSweep, RateSweep } from './deadbandSweep.js';
import type { PrepositioningStudy } from './prepositioning.js';
import type { Stage5Study } from './capacityReassignment.js';
import type { ForecastCausalityAudit } from './predictorLag.js';
import type { TailStudy } from './tailStudy.js';
import type { SelectionStudy } from './weightSetSelection.js';
import type { SelectionSweep } from './selectionSweep.js';
import type { LunchTwoWaySelectionStudy } from './lunchTwoWaySelection.js';
import {
  landingPanelPairKey,
  type LandingPanelDeploymentStudy,
} from './landingPanelDeployment.js';

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
  'landing-panel-deployment',
  'double-deck',
  'deadband-sweep',
  'rate-sweep',
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
 * `−0.0139 [−0.0317, +0.0038]` at 4 dp from either value. (That pair is the tree before § D1603.
 * The fixed release moves the run itself, to `-0.013891260712850448` on x64, which prints
 * `−0.0139 [−0.0317, +0.0039]`; that is a change of the run, not of the machine.)
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

/** The deadband sweep's figures, keyed `t<deadband>/awtS` — GitHub issue #178 item 6, § D513. */
export function deadbandSweepFigures(study: DeadbandSweep): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const row of study.rows) figures.set(`t${String(row.thresholdS)}/awtS`, estimateOf(row.awt.estimate));
  return figures;
}

/** The rate sweep's figures, keyed `r<rate>/awtS` — the same item, the same decision. */
export function rateSweepFigures(study: RateSweep): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const row of study.rows) figures.set(`r${String(row.ratePctPop5min)}/awtS`, estimateOf(row.awt.estimate));
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
 * lets a reader check § D139's rule that AWT, WT95 and the energy proxy are published *beside* the
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
 * The landing-panel deployment study's figures — GitHub issue #437 stage 2, § D619.
 *
 * Keyed `cell/candidate-baseline/metric` by {@link landingPanelPairKey}, which the study owns so the
 * key cannot drift between the pin and the thing pinned.
 *
 * **Every metric the study measures is pinned, including the ones `comparabilityBetween` refuses.**
 * A pin holds a number against drift; it makes no claim that the number may be read as a
 * comparison, and that claim lives on `LandingPanelPair.verdict`, which reads `NOT-COMPARABLE` for
 * all nine model-sensitive metrics here. Pinning only the comparable ones would leave the costs
 * § D27 requires to be shown as the only figures in this study nothing guards.
 */
export function landingPanelFigures(
  study: LandingPanelDeploymentStudy,
): ReadonlyMap<string, PinnedEstimate> {
  const figures = new Map<string, PinnedEstimate>();
  for (const cell of study.cells) {
    for (const pair of cell.pairs) {
      figures.set(landingPanelPairKey(cell.cellId, pair), estimateOf(pair.comparison.estimate));
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
/** Shared by the fifteen `descentCapHeight.ts` entries in {@link UNPINNED_INTERVALS}. */
const DESCENT_CAP_HEIGHT_REASON =
  'Kind 4, a dated record rather than a pin — GitHub issue #444\'s height sweep, measured ' +
  '2026-09-10 at n = 60, seed 20260910, by `main` in its own module. ' +
  '`runDescentCapHeightStudy` is classified `no-intervals` in STUDY_ENTRY_POINTS for ' +
  '`runCollectiveAdoptionStudy`\'s reason: it computes intervals, but the assertions its suite ' +
  'makes on it are structural and a full sweep is eight heights times three arms times sixty ' +
  'replications on two templates, which belongs in neither regeneratePins.ts nor ' +
  'livenessSuite.ts. The whole table is re-derivable with ' +
  '`node packages/experiments/dist/benchmark/descentCapHeight.js`, which is the difference ' +
  'between a figure a reader can reproduce and one nobody can.';

/** Shared by the four `destinationSecondBuilding.test.ts` entries in {@link UNPINNED_INTERVALS}. */
const DESTINATION_SECOND_BUILDING_REASON =
  'Kind 1, no entry point — GitHub issue #428, § D595. The comparison is performed by the test ' +
  'file itself at § D100\'s own apparatus (n = 200, common random numbers, TTD the gate), so the ' +
  'four figures are re-derived on every run and the verdicts drawn from them are asserted; what ' +
  'is missing is a `runDestinationSecondBuildingStudy` in STUDY_ENTRY_POINTS for ' +
  'regeneratePins.ts to render a pin from. Lifting the comparison out of the test into a study ' +
  'function would close it, and that is a refactor rather than a measurement.';

/** Shared by the eighteen `counterweightOptimum.ts` entries in {@link UNPINNED_INTERVALS}. */
const COUNTERWEIGHT_OPTIMUM_REASON =
  'Kind 4, a dated record rather than a pin — GitHub issue #431\'s fourth criterion, DECISIONS.md ' +
  '§ D539, measured 2026-09-11 at n = 50, seed 20260911, by `main` in its own module. ' +
  '`runCounterweightOptimumStudy` is classified `no-intervals` in STUDY_ENTRY_POINTS for ' +
  '`runDescentCapHeightStudy`\'s reason: it computes intervals, and the assertions its suite makes on ' +
  'it are structural — the minimiser equals a brute-force grid\'s, re-pricing a run equals ' +
  're-simulating it — plus the finding itself, that no published replication saturates and every ' +
  'optimum lies below the band. The digits are re-derivable with ' +
  '`node packages/experiments/dist/benchmark/counterweightOptimum.js`.';

export const UNPINNED_INTERVALS: readonly UnpinnedInterval[] = Object.freeze([
  /*
   * **GitHub issue #431's counterweight optimum — eighteen readings, one reason.** They are the two
   * tables in `counterweightOptimum.ts`'s header, declared here for the descent-cap study's reason.
   */
  Object.freeze({
    text: '+0.023 [+0.015, +0.030]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '+0.034 [+0.026, +0.042]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '+0.061 [+0.060, +0.062]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '+0.029 [+0.020, +0.038]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '+0.049 [+0.042, +0.056]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '+0.065 [+0.064, +0.066]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '−38.468 [−41.488, −35.447]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '−51.579 [−55.724, −47.434]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '−44.160 [−45.495, −42.825]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '−23.267 [−25.478, −21.057]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '−31.984 [−34.505, −29.463]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '−35.935 [−36.993, −34.877]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '−0.012 [−0.023, −0.000]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '−0.038 [−0.046, −0.031]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '−0.027 [−0.035, −0.019]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '−0.020 [−0.031, −0.010]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '−0.036 [−0.046, −0.027]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  Object.freeze({
    text: '−0.016 [−0.023, −0.009]',
    file: 'benchmark/counterweightOptimum.ts',
    count: 1,
    reason: COUNTERWEIGHT_OPTIMUM_REASON,
  }),
  /*
   * **GitHub issue #444's height sweep — fifteen readings, one reason.** They are the table in
   * `descentCapHeight.ts`'s header, and they are declared here rather than pinned because the
   * study is classified `'no-intervals'` above. Read that entry for why. The reason is a shared
   * constant rather than fifteen copies of one sentence, because fifteen copies is fifteen places
   * for it to drift.
   */
  Object.freeze({
    text: '−0.056 [−0.072, −0.041]',
    file: 'benchmark/descentCapHeight.ts',
    count: 2,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−0.852 [−1.122, −0.582]',
    file: 'benchmark/descentCapHeight.ts',
    count: 2,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−2.408 [−3.109, −1.707]',
    file: 'benchmark/descentCapHeight.ts',
    count: 2,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−3.466 [−4.626, −2.307]',
    file: 'benchmark/descentCapHeight.ts',
    count: 2,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−2.060 [−2.888, −1.232]',
    file: 'benchmark/descentCapHeight.ts',
    count: 1,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−3.096 [−4.282, −1.911]',
    file: 'benchmark/descentCapHeight.ts',
    count: 1,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−1.036 [−1.823, −0.250]',
    file: 'benchmark/descentCapHeight.ts',
    count: 1,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−3.951 [−5.391, −2.510]',
    file: 'benchmark/descentCapHeight.ts',
    count: 1,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−6.069 [−7.544, −4.593]',
    file: 'benchmark/descentCapHeight.ts',
    count: 1,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−2.118 [−2.599, −1.637]',
    file: 'benchmark/descentCapHeight.ts',
    count: 1,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−5.900 [−8.133, −3.667]',
    file: 'benchmark/descentCapHeight.ts',
    count: 1,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−9.252 [−11.339, −7.165]',
    file: 'benchmark/descentCapHeight.ts',
    count: 1,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−3.352 [−4.387, −2.317]',
    file: 'benchmark/descentCapHeight.ts',
    count: 1,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−0.637 [−3.037, +1.764]',
    file: 'benchmark/descentCapHeight.ts',
    count: 1,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
  Object.freeze({
    text: '−2.973 [−6.177, +0.231]',
    file: 'benchmark/descentCapHeight.ts',
    count: 1,
    reason:
      DESCENT_CAP_HEIGHT_REASON,
  }),
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
    text: '−2.729 [−3.550, −1.907]',
    file: 'benchmark/doubleDeck.ts',
    count: 1,
    reason:
      'Kind 3, superseded. ΔTTD for the `eta` pair at up-peak 1 % on the tree before § D332, when ' +
      'stage 6 still refused a call at a double-deck car’s own upper deck. The same cell now ' +
      'measures −1.493 [−2.304, −0.683], which IS pinned. Quoted in section 5’s third column ' +
      'because publishing only the after would hide that part of the decks’ credited advantage was ' +
      'the treatment arm being handicapped rather than the decks helping.',
  }),
  Object.freeze({
    text: '−6.262 [−7.210, −5.315]',
    file: 'benchmark/doubleDeck.ts',
    count: 1,
    reason:
      'Kind 3, superseded. ΔTTD for the `collective` pair at up-peak 1 % on the same pre-§ D332 ' +
      'tree, quoted beside its successor −4.710 [−5.548, −3.873] for the same reason as the entry ' +
      'above. The verdict did not change here either; the magnitude fell by about a quarter.',
  }),
  Object.freeze({
    text: '+0.634 [−0.045, +1.313]',
    file: 'benchmark/doubleDeck.ts',
    count: 1,
    reason:
      'Kind 3, superseded. ΔcarStarts for the `eta` pair at up-peak 1 % before § D332, when the ' +
      'interval still spanned zero. It now measures −1.523 [−2.258, −0.788] and is pinned. Quoted ' +
      'in section 5 because a start count crossing from INDISTINGUISHABLE to BETTER is the finding ' +
      'the assertion in doubleDeck.test.ts says must not pass silently, and it is only legible as a ' +
      'crossing with the value it crossed from beside it.',
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
    text: '−0.007 [−0.032, +0.018]',
    file: 'benchmark/index.ts',
    count: 2,
    reason:
      '§ 4 the predictor apparatus priced directly — the same profile with a forecast against ' +
      '`createPredictor: () => undefined`, n = 300. Built by hand from `new Simulation(...)`; no ' +
      'study function performs it.',
  }),
  /*
   * **Eleven entries came out on 2026-09-06, and the guard is what took them out.** The § 4 deadband
   * sweep's eight figures — `−0.006 [−0.031, +0.019]` through `−0.623 [−1.138, −0.108]` — plus the
   * 2 s row quoted at two places in § 0, and the rate sweep's `−0.014 [−0.035, +0.006]` at 8 % and
   * `−0.010 [−0.030, +0.010]` at 16 %, were declared here as *kind 1, no entry point* since c237d95.
   * `runDeadbandSweep()` and `runRateSweep()` ship now (GitHub issue #178 item 6, § D513), their
   * pins reproduce every one of them to the printed digit, and `published.test.ts`'s partition
   * refused the entries the moment a pin could derive them: *"If a pin now reproduces it, delete
   * the entry — the gap has closed."* It has. The rate sweep's 2 % row is the deadband sweep's 8 s
   * row — the same cell, pinned under both ids — and its 4 % row is `0.000 [0.000, 0.000]`, 300/300
   * exactly zero, which no entry ever declared because a zero interval is not a figure the guard
   * looks for.
   */
  /*
   * **The second-building result's four figures** — GitHub issue #428,
   * [§ D595](../../../../DECISIONS.md). They are the ΔTTD for each destination arm against `eta` on
   * `one-wtc-class-reference`, and the two costs reported beside them.
   *
   * **Declared rather than pinned, and the reason is a property of where the study lives.** The
   * measurement is performed by `destinationSecondBuilding.test.ts` itself — the same apparatus as
   * § D100, n = 200 under common random numbers — and that file asserts the *verdicts* it draws
   * from the run: that `destination-eta` is INDISTINGUISHABLE and `destination-panel` BETTER with
   * an upper bound below zero, that every arm is quotable with nothing saturated, and that the
   * negative control is an order of magnitude smaller than either destination arm. So the numbers
   * are re-derived on every run of the file and checked against the claims made from them; what
   * they are not is *pinned*, because there is no `runDestinationSecondBuildingStudy` entry point in
   * {@link STUDY_ENTRY_POINTS} for `regeneratePins.ts` to call.
   *
   * What would close the gap is exactly that: lift the comparison out of the test into a study
   * function, register it, and let the pin table render these four. It is a refactor rather than a
   * measurement, and doing it here would have meant regenerating the whole pin table on a
   * contended box in the same wave that authored the building. Left as a stated gap, which is what
   * this register is for.
   */
  Object.freeze({
    text: '−0.092 [−0.804, +0.619]',
    file: 'benchmark/destinationSecondBuilding.test.ts',
    count: 1,
    reason: DESTINATION_SECOND_BUILDING_REASON,
  }),
  Object.freeze({
    text: '−1.293 [−2.069, −0.517]',
    file: 'benchmark/destinationSecondBuilding.test.ts',
    count: 1,
    reason: DESTINATION_SECOND_BUILDING_REASON,
  }),
  Object.freeze({
    text: '+1.730 [+1.572, +1.888]',
    file: 'benchmark/destinationSecondBuilding.test.ts',
    count: 1,
    reason: DESTINATION_SECOND_BUILDING_REASON,
  }),
  Object.freeze({
    text: '+1.512 [+1.183, +1.841]',
    file: 'benchmark/destinationSecondBuilding.test.ts',
    count: 1,
    reason: DESTINATION_SECOND_BUILDING_REASON,
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
    // GitHub issue #437 stage 2's measurement, DECISIONS.md § D619: three per-landing panel
    // deployments of one building under one dispatcher, at two operating points, n = 200 under
    // common random numbers. Publishes a paired-t interval per cell per pair per metric, so
    // `regeneratePins.ts` is its non-test caller and `landingPanelDeployment.test.ts` compares the
    // pins against a fresh run.
    runLandingPanelDeploymentStudy: 'landing-panel-deployment',
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
    // Phase 5's two sweeps, shipped as entry points (GitHub issue #178 item 6, § D513): eight
    // paired-t intervals against `stay` over the deadband, and four over the arrival rate with a
    // count of exactly-zero differences beside each. Both publish intervals, so `regeneratePins.ts`
    // is the non-test caller of both and `deadbandSweep.test.ts` compares each set of pins
    // against a fresh run at the published budget.
    runDeadbandSweep: 'deadband-sweep',
    runRateSweep: 'rate-sweep',
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
    // GitHub issue #444's height sweep: what the next speed class buys with the air-pressure
    // descent cap in force and without it, over eight travels either side of the 300 m threshold.
    // Classified for `runCollectiveAdoptionStudy`'s reason rather than pinned — it computes
    // intervals, and the assertions `descentCapHeight.test.ts` makes on it are structural (the
    // three arms resolve to the configurations claimed, the cabin buys *exactly* zero below the
    // threshold replication by replication, a saturated row is refused rather than reported). Its
    // digits are published as a dated record in its own header, and a full sweep is eight heights
    // times three arms times sixty replications on two templates, which belongs in neither
    // `regeneratePins.ts` nor `livenessSuite.ts`. Its non-test caller is `main` in its own module.
    runDescentCapHeightStudy: 'no-intervals',
    // GitHub issue #431's fourth criterion (§ D539): whether the counterweight ratio that minimises a
    // run's out-of-balance work differs across `rise-and-fall`, `office-down-peak` and `lunch-two-way`.
    // Classified for `runDescentCapHeightStudy`'s reason. It computes intervals, and the assertions
    // `counterweightOptimum.test.ts` makes on it are structural — the minimiser equals a brute-force
    // grid's, re-pricing a run equals re-simulating it, no published replication saturates and every
    // optimum lies below the band — while its
    // digits are a dated record in its own header, re-derivable by `main` in its own module, which is
    // its non-test caller.
    runCounterweightOptimumStudy: 'no-intervals',
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
    "garden-residential/auction-multi-round/ttdMeanS": { n: 500, mean: -1.9726625497021173, standardError: 0.14401574622740687, lower: -2.255614519080126, upper: -1.6897105803241084 },
    "garden-residential/auction-multi-round/wt95S": { n: 500, mean: -4.168897834294782, standardError: 0.3700743295139978, lower: -4.8959937463409915, upper: -3.4418019222485725 },
    "garden-residential/auction-multi-round−auction/awtS": { n: 500, mean: 0.005413883685798925, standardError: 0.005413883685798894, lower: -0.005222932711078854, upper: 0.016050700082676703 },
    "garden-residential/auction-multi-round−auction/pctOverLongWait": { n: 500, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "garden-residential/auction-multi-round−auction/ttdMeanS": { n: 500, mean: -0.00794001241809717, standardError: 0.007940012418097171, lower: -0.023539988180739817, upper: 0.007659963344545476 },
    "garden-residential/auction-multi-round−auction/wt95S": { n: 500, mean: 0.02429958861946534, standardError: 0.024299588619465115, lower: -0.023442527330107436, upper: 0.07204170456903812 },
    "garden-residential/auction/awtS": { n: 500, mean: -1.258255236472466, standardError: 0.11029417071656501, lower: -1.4749534353339135, upper: -1.0415570376110184 },
    "garden-residential/auction/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/auction/ttdMeanS": { n: 500, mean: -1.9647225372840202, standardError: 0.14373826000435078, lower: -2.247129321323997, upper: -1.6823157532440438 },
    "garden-residential/auction/wt95S": { n: 500, mean: -4.193197422914248, standardError: 0.3687223219325319, lower: -4.917637005928314, upper: -3.468757839900183 },
    "garden-residential/capacity-aware/awtS": { n: 500, mean: -1.276814196167167, standardError: 0.10774240593666344, lower: -1.4884988677666549, upper: -1.0651295245676793 },
    "garden-residential/capacity-aware/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/capacity-aware/ttdMeanS": { n: 500, mean: -1.9260491647416007, standardError: 0.14013645390636723, lower: -2.20137937448023, upper: -1.6507189550029713 },
    "garden-residential/capacity-aware/wt95S": { n: 500, mean: -4.230216984028223, standardError: 0.3664894681291373, lower: -4.95026961354898, upper: -3.5101643545074657 },
    "garden-residential/collective-enroute/awtS": { n: 500, mean: -1.3571653207427472, standardError: 0.12286121444591125, lower: -1.5985543597770688, upper: -1.1157762817084256 },
    "garden-residential/collective-enroute/pctOverLongWait": { n: 500, mean: -0.4175200933573363, standardError: 0.11035874031439895, lower: -0.6343451540054125, upper: -0.20069503270926012 },
    "garden-residential/collective-enroute/ttdMeanS": { n: 500, mean: -3.6862330091755457, standardError: 0.2193547479054596, lower: -4.117205729438095, upper: -3.255260288912997 },
    "garden-residential/collective-enroute/wt95S": { n: 500, mean: -3.9654499090994433, standardError: 0.3656965370315812, lower: -4.683944643587804, upper: -3.2469551746110823 },
    "garden-residential/collective/awtS": { n: 500, mean: -1.2689351885150875, standardError: 0.11319591464669483, lower: -1.4913345289611812, upper: -1.0465358480689937 },
    "garden-residential/collective/pctOverLongWait": { n: 500, mean: -0.3800200933573363, standardError: 0.09945119433554514, lower: -0.575414777837209, upper: -0.1846254088774636 },
    "garden-residential/collective/ttdMeanS": { n: 500, mean: -3.680868462083656, standardError: 0.2187148183926376, lower: -4.110583894024203, upper: -3.251153030143109 },
    "garden-residential/collective/wt95S": { n: 500, mean: -3.844259549871771, standardError: 0.36006176277132784, lower: -4.551683477759431, upper: -3.1368356219841105 },
    "garden-residential/destination-eta/awtS": { n: 500, mean: -1.274923328413108, standardError: 0.10772512295373385, lower: -1.48657404362807, upper: -1.063272613198146 },
    "garden-residential/destination-eta/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/destination-eta/ttdMeanS": { n: 500, mean: -1.9040621129723299, standardError: 0.139158587845912, lower: -2.1774710805215336, upper: -1.6306531454231261 },
    "garden-residential/destination-eta/wt95S": { n: 500, mean: -4.228642322773873, standardError: 0.3664404632886258, lower: -4.948598671044177, upper: -3.5086859745035692 },
    "garden-residential/destination-panel/awtS": { n: 500, mean: -1.2330868361252645, standardError: 0.11180684052051379, lower: -1.45275702180939, upper: -1.013416650441139 },
    "garden-residential/destination-panel/pctOverLongWait": { n: 500, mean: -0.36098810027904643, standardError: 0.116687635479283, lower: -0.5902477272700501, upper: -0.13172847328804274 },
    "garden-residential/destination-panel/ttdMeanS": { n: 500, mean: -1.8719225274395874, standardError: 0.1461358783649373, lower: -2.15903998274098, upper: -1.584805072138195 },
    "garden-residential/destination-panel/wt95S": { n: 500, mean: -4.093684635092219, standardError: 0.39291087037813976, lower: -4.8656481701627, upper: -3.3217211000217386 },
    "garden-residential/energy-aware/awtS": { n: 500, mean: -1.2705623141208486, standardError: 0.10906519229330047, lower: -1.4848459029532188, upper: -1.0562787252884784 },
    "garden-residential/energy-aware/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/energy-aware/ttdMeanS": { n: 500, mean: -1.5138326203400023, standardError: 0.13590677032504084, lower: -1.7808526464318217, upper: -1.246812594248183 },
    "garden-residential/energy-aware/wt95S": { n: 500, mean: -4.174694790151036, standardError: 0.3665744508955841, lower: -4.894914387810759, upper: -3.454475192491313 },
    "garden-residential/eta/awtS": { n: 500, mean: -1.278168365659383, standardError: 0.10755681902029574, lower: -1.4894884091897003, upper: -1.0668483221290657 },
    "garden-residential/eta/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/eta/ttdMeanS": { n: 500, mean: -1.8582425474835709, standardError: 0.13854583002490287, lower: -2.1304476117322806, upper: -1.5860374832348614 },
    "garden-residential/eta/wt95S": { n: 500, mean: -4.228562437470145, standardError: 0.36619351351757484, lower: -4.948033596267167, upper: -3.5090912786731225 },
    "garden-residential/fairness-first/awtS": { n: 500, mean: -1.2889924433334565, standardError: 0.10802852551117208, lower: -1.5012392624703184, upper: -1.0767456241965947 },
    "garden-residential/fairness-first/pctOverLongWait": { n: 500, mean: -0.43764204457684847, standardError: 0.11226717559957262, lower: -0.6582166641205034, upper: -0.2170674250331936 },
    "garden-residential/fairness-first/ttdMeanS": { n: 500, mean: -1.8706477807906294, standardError: 0.1390339091701793, lower: -2.143811788481192, upper: -1.597483773100067 },
    "garden-residential/fairness-first/wt95S": { n: 500, mean: -4.247991155190158, standardError: 0.3665063462893385, lower: -4.9680769457283285, upper: -3.527905364651988 },
    "garden-residential/predictive-balanced/awtS": { n: 500, mean: -0.22562046122105206, standardError: 0.12376840778194198, lower: -0.46879188966598134, upper: 0.017550967223877223 },
    "garden-residential/predictive-balanced/pctOverLongWait": { n: 500, mean: -0.4425200933573363, standardError: 0.11296997779535825, lower: -0.6644755290311019, upper: -0.2205646576835707 },
    "garden-residential/predictive-balanced/ttdMeanS": { n: 500, mean: -2.0078937725909967, standardError: 0.21542493720836325, lower: -2.4311454782759427, upper: -1.5846420669060506 },
    "garden-residential/predictive-balanced/wt95S": { n: 500, mean: -2.7133151819166894, standardError: 0.37714350068187186, lower: -3.4543001023263438, upper: -1.972330261507035 },
    "garden-residential/predictive-balanced−eta/awtS": { n: 500, mean: 1.0525479044383306, standardError: 0.05906244397020625, lower: 0.9365061848665035, upper: 1.1685896240101576 },
    "garden-residential/predictive-balanced−eta/pctOverLongWait": { n: 500, mean: -0.004878048780487805, standardError: 0.004878048780487803, lower: -0.014462094590183786, upper: 0.004705997029208175 },
    "garden-residential/predictive-balanced−eta/ttdMeanS": { n: 500, mean: -0.149651225107424, standardError: 0.1660088160688749, lower: -0.47581362520100984, upper: 0.1765111749861618 },
    "garden-residential/predictive-balanced−eta/wt95S": { n: 500, mean: 1.5152472555534555, standardError: 0.1152402600479965, lower: 1.288831329612094, upper: 1.7416631814948171 },
    "garden-residential/zoned-uppeak/awtS": { n: 500, mean: -6.48848494221282, standardError: 0.2129155275693811, lower: -6.906806337026031, upper: -6.07016354739961 },
    "garden-residential/zoned-uppeak/pctOverLongWait": { n: 500, mean: -0.4387105695478125, standardError: 0.11261302832295046, lower: -0.6599646961020409, upper: -0.21745644299358408 },
    "garden-residential/zoned-uppeak/ttdMeanS": { n: 500, mean: -7.101843863619822, standardError: 0.2345306647080074, lower: -7.56263315365952, upper: -6.641054573580123 },
    "garden-residential/zoned-uppeak/wt95S": { n: 500, mean: -11.2350191744125, standardError: 0.4069291602013851, lower: -12.034524855510094, upper: -10.435513493314906 },
    "midtown-up-peak/auction-multi-round/awtS": { n: 250, mean: -4.626342976662218, standardError: 0.48956088883458115, lower: -5.5905511961767145, upper: -3.6621347571477214 },
    "midtown-up-peak/auction-multi-round/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/auction-multi-round/ttdMeanS": { n: 250, mean: -13.65111341555069, standardError: 0.7782866109769842, lower: -15.183977589460738, upper: -12.11824924164064 },
    "midtown-up-peak/auction-multi-round/wt95S": { n: 250, mean: -21.47515461359534, standardError: 1.436198875109514, lower: -24.303801247387156, upper: -18.646507979803523 },
    "midtown-up-peak/auction-multi-round−auction/awtS": { n: 250, mean: 1.4333773326641674, standardError: 0.16608303206704392, lower: 1.1062706779186267, upper: 1.7604839874097082 },
    "midtown-up-peak/auction-multi-round−auction/pctOverLongWait": { n: 250, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "midtown-up-peak/auction-multi-round−auction/ttdMeanS": { n: 250, mean: -2.590625004055401, standardError: 0.2403652197604406, lower: -3.0640331660720683, upper: -2.117216842038734 },
    "midtown-up-peak/auction-multi-round−auction/wt95S": { n: 250, mean: 1.4760053908658097, standardError: 0.18936076263245344, lower: 1.1030523875766955, upper: 1.848958394154924 },
    "midtown-up-peak/auction/awtS": { n: 250, mean: -6.059720309326382, standardError: 0.4734293533098122, lower: -6.992156874893196, upper: -5.127283743759568 },
    "midtown-up-peak/auction/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/auction/ttdMeanS": { n: 250, mean: -11.060488411495284, standardError: 0.754897338873998, lower: -12.54728655169123, upper: -9.573690271299338 },
    "midtown-up-peak/auction/wt95S": { n: 250, mean: -22.951160004461162, standardError: 1.429821310520442, lower: -25.767245789669044, upper: -20.13507421925328 },
    "midtown-up-peak/capacity-aware/awtS": { n: 250, mean: -6.752254239181907, standardError: 0.4555304509579535, lower: -7.64943825667644, upper: -5.855070221687374 },
    "midtown-up-peak/capacity-aware/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/capacity-aware/ttdMeanS": { n: 250, mean: -10.203607301377463, standardError: 0.7184482687409551, lower: -11.618617654155171, upper: -8.788596948599755 },
    "midtown-up-peak/capacity-aware/wt95S": { n: 250, mean: -23.405061175493486, standardError: 1.4214645528905496, lower: -26.204688018455357, upper: -20.605434332531615 },
    "midtown-up-peak/collective-enroute/awtS": { n: 250, mean: -6.750439654603309, standardError: 0.4640261013175008, lower: -7.664356168695553, upper: -5.836523140511066 },
    "midtown-up-peak/collective-enroute/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/collective-enroute/ttdMeanS": { n: 250, mean: -10.213940417947079, standardError: 0.7225620962217032, lower: -11.637053105615232, upper: -8.790827730278926 },
    "midtown-up-peak/collective-enroute/wt95S": { n: 250, mean: -23.347845527465, standardError: 1.424476991584939, lower: -26.15340547949698, upper: -20.542285575433024 },
    "midtown-up-peak/collective/awtS": { n: 250, mean: -6.814796943474348, standardError: 0.4601850378295681, lower: -7.721148341416161, upper: -5.908445545532535 },
    "midtown-up-peak/collective/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/collective/ttdMeanS": { n: 250, mean: -10.356236682593348, standardError: 0.7097713429914008, lower: -11.75415751020953, upper: -8.958315854977165 },
    "midtown-up-peak/collective/wt95S": { n: 250, mean: -23.370313169992823, standardError: 1.4241136950429996, lower: -26.175157596091566, upper: -20.56546874389408 },
    "midtown-up-peak/destination-eta/awtS": { n: 250, mean: -6.710757196838768, standardError: 0.454936632618685, lower: -7.60677166722143, upper: -5.814742726456105 },
    "midtown-up-peak/destination-eta/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/destination-eta/ttdMeanS": { n: 250, mean: -10.23022352397853, standardError: 0.7116260010897453, lower: -11.63179716909627, upper: -8.82864987886079 },
    "midtown-up-peak/destination-eta/wt95S": { n: 250, mean: -23.375562533839318, standardError: 1.4210759588571564, lower: -26.174424026525877, upper: -20.57670104115276 },
    "midtown-up-peak/destination-panel/awtS": { n: 250, mean: -6.3808123487227935, standardError: 0.4712944282388003, lower: -7.309044100652599, upper: -5.452580596792988 },
    "midtown-up-peak/destination-panel/pctOverLongWait": { n: 250, mean: -7.338139848917022, standardError: 0.6573874942865632, lower: -8.632888755240131, upper: -6.043390942593913 },
    "midtown-up-peak/destination-panel/ttdMeanS": { n: 250, mean: -10.440992075580088, standardError: 0.7324364008816536, lower: -11.883552570318326, upper: -8.99843158084185 },
    "midtown-up-peak/destination-panel/wt95S": { n: 250, mean: -23.257111926055696, standardError: 1.427716096702752, lower: -26.06905141503537, upper: -20.44517243707602 },
    "midtown-up-peak/energy-aware/awtS": { n: 250, mean: -6.757922236779572, standardError: 0.45264355697867326, lower: -7.649420410148943, upper: -5.8664240634102 },
    "midtown-up-peak/energy-aware/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/energy-aware/ttdMeanS": { n: 250, mean: -9.493603110542796, standardError: 0.715811342253399, lower: -10.903419939386005, upper: -8.083786281699588 },
    "midtown-up-peak/energy-aware/wt95S": { n: 250, mean: -23.34356281690242, standardError: 1.423748180406562, lower: -26.147687348449036, upper: -20.539438285355804 },
    "midtown-up-peak/eta/awtS": { n: 250, mean: -6.806684855697704, standardError: 0.4521595703425253, lower: -7.697229799543737, upper: -5.916139911851672 },
    "midtown-up-peak/eta/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/eta/ttdMeanS": { n: 250, mean: -10.312463457348635, standardError: 0.7062606596732538, lower: -11.703469864739116, upper: -8.921457049958153 },
    "midtown-up-peak/eta/wt95S": { n: 250, mean: -23.411667367886082, standardError: 1.4220624137272133, lower: -26.212471719807482, upper: -20.610863015964682 },
    "midtown-up-peak/fairness-first/awtS": { n: 250, mean: -6.806684855697704, standardError: 0.4521595703425253, lower: -7.697229799543737, upper: -5.916139911851672 },
    "midtown-up-peak/fairness-first/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/fairness-first/ttdMeanS": { n: 250, mean: -10.312463457348635, standardError: 0.7062606596732538, lower: -11.703469864739116, upper: -8.921457049958153 },
    "midtown-up-peak/fairness-first/wt95S": { n: 250, mean: -23.411667367886082, standardError: 1.4220624137272133, lower: -26.212471719807482, upper: -20.610863015964682 },
    "midtown-up-peak/predictive-balanced/awtS": { n: 250, mean: -3.8056357393859876, standardError: 0.5048274658984905, lower: -4.799912045270527, upper: -2.811359433501449 },
    "midtown-up-peak/predictive-balanced/pctOverLongWait": { n: 250, mean: -7.3548065155836895, standardError: 0.6564266605502094, lower: -8.647663024439378, upper: -6.061950006728002 },
    "midtown-up-peak/predictive-balanced/ttdMeanS": { n: 250, mean: -11.452004023515677, standardError: 0.7818807152290712, lower: -12.991946918256355, upper: -9.912061128775 },
    "midtown-up-peak/predictive-balanced/wt95S": { n: 250, mean: -20.125235317266423, standardError: 1.4400768383678793, lower: -22.961519742666944, upper: -17.288950891865902 },
    "midtown-up-peak/predictive-balanced−eta/awtS": { n: 250, mean: 3.0010491163117154, standardError: 0.2068181275245417, lower: 2.5937131892557828, upper: 3.408385043367648 },
    "midtown-up-peak/predictive-balanced−eta/pctOverLongWait": { n: 250, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "midtown-up-peak/predictive-balanced−eta/ttdMeanS": { n: 250, mean: -1.1395405661670406, standardError: 0.3330613680795271, lower: -1.795517209786409, upper: -0.48356392254767233 },
    "midtown-up-peak/predictive-balanced−eta/wt95S": { n: 250, mean: 3.286432050619658, standardError: 0.21620379418899854, lower: 2.8606107070406943, upper: 3.7122533941986213 },
    "midtown-up-peak/zoned-uppeak/awtS": { n: 250, mean: -8.157917663209602, standardError: 0.5698266821721247, lower: -9.280212321912794, upper: -7.0356230045064105 },
    "midtown-up-peak/zoned-uppeak/pctOverLongWait": { n: 250, mean: -7.222522133299306, standardError: 0.6642699457291984, lower: -8.530826281478431, upper: -5.914217985120182 },
    "midtown-up-peak/zoned-uppeak/ttdMeanS": { n: 250, mean: -12.13411029484067, standardError: 0.8836684615081873, lower: -13.874527908552091, upper: -10.39369268112925 },
    "midtown-up-peak/zoned-uppeak/wt95S": { n: 250, mean: -21.045815396831422, standardError: 1.5713396259416437, lower: -24.14062672170772, upper: -17.951004071955126 },
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
    "secure-up-peak/collective-enroute/awtS": { n: 150, mean: -5.576747973225097, standardError: 0.4031707777136825, lower: -6.3734187428465265, upper: -4.780077203603668 },
    "secure-up-peak/collective-enroute/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/collective-enroute/ttdMeanS": { n: 150, mean: -7.124762045142081, standardError: 0.5423843213034765, lower: -8.196520611409749, upper: -6.053003478874412 },
    "secure-up-peak/collective-enroute/wt95S": { n: 150, mean: -19.479899690414058, standardError: 1.4850329125481778, lower: -22.414344294911395, upper: -16.54545508591672 },
    "secure-up-peak/collective/awtS": { n: 150, mean: -5.7661346897783226, standardError: 0.39189227767384754, lower: -6.540518994696471, upper: -4.9917503848601745 },
    "secure-up-peak/collective/pctOverLongWait": { n: 150, mean: -4.429925122305146, standardError: 0.5119325885714427, lower: -5.441510663410848, upper: -3.4183395811994446 },
    "secure-up-peak/collective/ttdMeanS": { n: 150, mean: -7.18550512270792, standardError: 0.5406776492236365, lower: -8.253891282455832, upper: -6.117118962960009 },
    "secure-up-peak/collective/wt95S": { n: 150, mean: -19.52395099275389, standardError: 1.4781496981897648, lower: -22.444794274974143, upper: -16.603107710533635 },
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
    "secure-up-peak/predictive-balanced−eta/ttdMeanS": { n: 150, mean: 0.7885691774484079, standardError: 0.2799985794233963, lower: 0.23528829477352764, upper: 1.3418500601232881 },
    "secure-up-peak/predictive-balanced−eta/wt95S": { n: 150, mean: 1.6828817107600462, standardError: 0.11138381028212999, lower: 1.4627858338613262, upper: 1.9029775876587662 },
    "secure-up-peak/zoned-uppeak/awtS": { n: 150, mean: 1.852305568219164, standardError: 0.6437218505619589, lower: 0.5803027087422712, upper: 3.124308427696057 },
    "secure-up-peak/zoned-uppeak/pctOverLongWait": { n: 150, mean: 4.109486804548994, standardError: 0.8228375081500461, lower: 2.483549045347579, upper: 5.735424563750409 },
    "secure-up-peak/zoned-uppeak/ttdMeanS": { n: 150, mean: 2.7316098687237806, standardError: 0.7919633394127276, lower: 1.166679873797506, upper: 4.296539863650056 },
    "secure-up-peak/zoned-uppeak/wt95S": { n: 150, mean: 7.241597420562625, standardError: 1.925553991078216, lower: 3.4366773598400857, upper: 11.046517481285164 },
  }),
  "tail": Object.freeze({
    "1/capacity-aware/awtS": { n: 250, mean: 0.004431131218142788, standardError: 0.058796722100289134, lower: -0.11137118065478202, upper: 0.1202334430910676 },
    "1/capacity-aware/maxWaitS": { n: 250, mean: -0.08769692026976622, standardError: 0.10680432903800742, lower: -0.2980519839337148, upper: 0.12265814339418238 },
    "1/capacity-aware/pctOverLongWait": { n: 250, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "1/capacity-aware/wt95S": { n: 250, mean: -0.14223429387490957, standardError: 0.07479240224513849, lower: -0.28954068751609824, upper: 0.005072099766279092 },
    "1/capacity-aware/wt99S": { n: 250, mean: -0.09815018452129169, standardError: 0.09424812540944072, lower: -0.2837753422211784, upper: 0.087474973178595 },
    "1/fairness-first/awtS": { n: 250, mean: -0.011319662974904887, standardError: 0.017866112470447153, lower: -0.04650763016685993, upper: 0.023868304217050156 },
    "1/fairness-first/maxWaitS": { n: 250, mean: -0.026442662596972012, standardError: 0.031323582489438846, lower: -0.08813561313649615, upper: 0.03525028794255213 },
    "1/fairness-first/pctOverLongWait": { n: 250, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "1/fairness-first/wt95S": { n: 250, mean: -0.05427555238855315, standardError: 0.03824305100059018, lower: -0.12959665126526648, upper: 0.021045546488160163 },
    "1/fairness-first/wt99S": { n: 250, mean: -0.032009240555288275, standardError: 0.03079114066436744, lower: -0.09265352729046056, upper: 0.028635046179884008 },
    "1/zoned-uppeak/awtS": { n: 250, mean: 0.6060414443481407, standardError: 0.34595417375525983, lower: -0.07532805537690623, upper: 1.2874109440731876 },
    "1/zoned-uppeak/maxWaitS": { n: 250, mean: 13.74790521426316, standardError: 1.0019832457449043, lower: 11.77446227101061, upper: 15.72134815751571 },
    "1/zoned-uppeak/pctOverLongWait": { n: 250, mean: 1.9552698252799883, standardError: 0.3009951218777478, lower: 1.3624488357618574, upper: 2.548090814798119 },
    "1/zoned-uppeak/wt95S": { n: 250, mean: 9.854254277386437, standardError: 0.9256418534940091, lower: 8.031168520699019, upper: 11.677340034073854 },
    "1/zoned-uppeak/wt99S": { n: 250, mean: 12.972311437367596, standardError: 0.9717926348159364, lower: 11.058330015396233, upper: 14.886292859338958 },
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
    "2.5/capacity-aware/awtS": { n: 250, mean: -0.4339757217362571, standardError: 0.17845023021554177, lower: -0.7854400291846781, upper: -0.08251141428783598 },
    "2.5/capacity-aware/maxWaitS": { n: 250, mean: -2.1494546114220383, standardError: 0.9792407436836098, lower: -4.078105358402482, upper: -0.2208038644415946 },
    "2.5/capacity-aware/pctOverLongWait": { n: 250, mean: -0.5399557625960161, standardError: 0.20274153773937836, lower: -0.9392626957758232, upper: -0.14064882941620888 },
    "2.5/capacity-aware/wt95S": { n: 250, mean: -1.4673263959591907, standardError: 0.7953066718132978, lower: -3.0337122071758413, upper: 0.09905941525745998 },
    "2.5/capacity-aware/wt99S": { n: 250, mean: -2.032065503979393, standardError: 0.8932615505691242, lower: -3.7913770602708863, upper: -0.27275394768789996 },
    "2.5/fairness-first/awtS": { n: 250, mean: -0.656376527431679, standardError: 0.13940604379233987, lower: -0.9309418702525802, upper: -0.3818111846107776 },
    "2.5/fairness-first/maxWaitS": { n: 250, mean: -5.220283380119346, standardError: 0.8788181048838749, lower: -6.95114803763798, upper: -3.4894187226007123 },
    "2.5/fairness-first/pctOverLongWait": { n: 250, mean: -1.190689090116263, standardError: 0.22654416713451442, lower: -1.6368761794365712, upper: -0.7445020007959549 },
    "2.5/fairness-first/wt95S": { n: 250, mean: -3.315242170050398, standardError: 0.7526953135920564, lower: -4.797703340270083, upper: -1.8327809998307127 },
    "2.5/fairness-first/wt99S": { n: 250, mean: -4.747000589285462, standardError: 0.8164343169495866, lower: -6.354998076524456, upper: -3.139003102046468 },
    "2.5/zoned-uppeak/awtS": { n: 250, mean: 6.992429313609337, standardError: 0.5998243522303107, lower: 5.811053137783237, upper: 8.173805489435438 },
    "2.5/zoned-uppeak/maxWaitS": { n: 250, mean: 29.92480295302053, standardError: 2.146815680094189, lower: 25.69657032304659, upper: 34.15303558299447 },
    "2.5/zoned-uppeak/pctOverLongWait": { n: 250, mean: 9.090728254893333, standardError: 0.7319940515626159, lower: 7.649038983447316, upper: 10.532417526339351 },
    "2.5/zoned-uppeak/wt95S": { n: 250, mean: 24.610265702875452, standardError: 1.8878964581249453, lower: 20.8919840263107, upper: 28.328547379440206 },
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
    "2.75/zoned-uppeak/awtS": { n: 250, mean: 8.661837444915824, standardError: 0.6774750061894346, lower: 7.3275254433208445, upper: 9.996149446510803 },
    "2.75/zoned-uppeak/maxWaitS": { n: 250, mean: 33.55414846460838, standardError: 2.376709167097907, lower: 28.873132136350215, upper: 38.23516479286655 },
    "2.75/zoned-uppeak/pctOverLongWait": { n: 250, mean: 10.751071699247003, standardError: 0.7925655029988298, lower: 9.190084721070873, upper: 12.312058677423133 },
    "2.75/zoned-uppeak/wt95S": { n: 250, mean: 27.131819825749595, standardError: 2.022322559895878, lower: 23.14878098577381, upper: 31.11485866572538 },
    "2.75/zoned-uppeak/wt99S": { n: 250, mean: 32.378733001081805, standardError: 2.2642392111606715, lower: 27.919230397543913, upper: 36.8382356046197 },
    "2/capacity-aware/awtS": { n: 250, mean: -0.19155864940272158, standardError: 0.14568834830249244, lower: -0.47849722257011185, upper: 0.09537992376466867 },
    "2/capacity-aware/maxWaitS": { n: 250, mean: -0.5192866988687838, standardError: 0.6750658821308241, lower: -1.8488538418116107, upper: 0.8102804440740431 },
    "2/capacity-aware/pctOverLongWait": { n: 250, mean: -0.27935410255577775, standardError: 0.1790255205824887, lower: -0.6319514655914992, upper: 0.07324326047994367 },
    "2/capacity-aware/wt95S": { n: 250, mean: -0.9207004075501147, standardError: 0.5046759043144987, lower: -1.9146782073072637, upper: 0.07327739220703433 },
    "2/capacity-aware/wt99S": { n: 250, mean: -0.5398364227989437, standardError: 0.628310674480548, lower: -1.7773174605203708, upper: 0.6976446149224832 },
    "2/fairness-first/awtS": { n: 250, mean: -0.2625032735286283, standardError: 0.09271318621722517, lower: -0.4451053118998603, upper: -0.07990123515739628 },
    "2/fairness-first/maxWaitS": { n: 250, mean: -2.2108881206741295, standardError: 0.49126465540272407, lower: -3.1784519712584367, upper: -1.2433242700898224 },
    "2/fairness-first/pctOverLongWait": { n: 250, mean: -0.5431220169700723, standardError: 0.14063547894593809, lower: -0.8201087776523586, upper: -0.26613525628778617 },
    "2/fairness-first/wt95S": { n: 250, mean: -1.6547939976491204, standardError: 0.45627396185145397, lower: -2.553442387259895, upper: -0.7561456080383459 },
    "2/fairness-first/wt99S": { n: 250, mean: -2.0455170183992357, standardError: 0.4769953403268623, lower: -2.9849769268656567, upper: -1.106057109932815 },
    "2/zoned-uppeak/awtS": { n: 250, mean: 3.906512546906603, standardError: 0.42492228815447436, lower: 3.0696124345042604, upper: 4.743412659308945 },
    "2/zoned-uppeak/maxWaitS": { n: 250, mean: 27.429983276320826, standardError: 1.5609431049985627, lower: 24.35564828273712, upper: 30.50431826990453 },
    "2/zoned-uppeak/pctOverLongWait": { n: 250, mean: 5.939270474789502, standardError: 0.5044773411251526, lower: 4.945683752554327, upper: 6.932857197024678 },
    "2/zoned-uppeak/wt95S": { n: 250, mean: 19.17080261223189, standardError: 1.3874815141347343, lower: 16.438106616974046, upper: 21.90349860748973 },
    "2/zoned-uppeak/wt99S": { n: 250, mean: 25.912770188136417, standardError: 1.4869139570402519, lower: 22.98423833073661, upper: 28.841302045536224 },
    "3/capacity-aware/awtS": { n: 250, mean: -0.8852213896309016, standardError: 0.32568900574046544, lower: -1.5266778938218843, upper: -0.2437648854399187 },
    "3/capacity-aware/maxWaitS": { n: 250, mean: -5.33544614638074, standardError: 1.58737517796038, lower: -8.461840082150902, upper: -2.209052210610577 },
    "3/capacity-aware/pctOverLongWait": { n: 250, mean: -0.9866164476426619, standardError: 0.3746125244163386, lower: -1.724429625560469, upper: -0.24880326972485467 },
    "3/capacity-aware/wt95S": { n: 250, mean: -4.67050325210854, standardError: 1.2933210263397692, lower: -7.217746695179198, upper: -2.1232598090378825 },
    "3/capacity-aware/wt99S": { n: 250, mean: -5.361836505036051, standardError: 1.481767707943305, lower: -8.280232635109359, upper: -2.4434403749627425 },
    "3/fairness-first/awtS": { n: 250, mean: -1.0993882672352198, standardError: 0.24289713459081427, lower: -1.5777831288560336, upper: -0.620993405614406 },
    "3/fairness-first/maxWaitS": { n: 250, mean: -10.183587697583851, standardError: 1.3355248489480582, lower: -12.813953125236889, upper: -7.553222269930814 },
    "3/fairness-first/pctOverLongWait": { n: 250, mean: -1.713801388803997, standardError: 0.2900617154618154, lower: -2.2850886312970533, upper: -1.1425141463109405 },
    "3/fairness-first/wt95S": { n: 250, mean: -7.785562185947682, standardError: 1.1269098073600756, lower: -10.00505259804886, upper: -5.566071773846505 },
    "3/fairness-first/wt99S": { n: 250, mean: -9.651007606134616, standardError: 1.2803811942515744, lower: -12.1727655728465, upper: -7.129249639422733 },
    "3/zoned-uppeak/awtS": { n: 250, mean: 10.02529190528389, standardError: 0.7269769707458608, lower: 8.593483959474401, upper: 11.457099851093378 },
    "3/zoned-uppeak/maxWaitS": { n: 250, mean: 37.20594809853134, standardError: 2.580539960436416, lower: 32.123479508032595, upper: 42.28841668903008 },
    "3/zoned-uppeak/pctOverLongWait": { n: 250, mean: 11.909151694680668, standardError: 0.7946383350992369, lower: 10.344082197262358, upper: 13.474221192098979 },
    "3/zoned-uppeak/wt95S": { n: 250, mean: 31.52359619780462, standardError: 2.3508150344174337, lower: 26.893579318516217, upper: 36.15361307709302 },
    "3/zoned-uppeak/wt99S": { n: 250, mean: 35.79798806996592, standardError: 2.4945110251027884, lower: 30.884956639290603, upper: 40.711019500641235 },
  }),
  "prepositioning": Object.freeze({
    // fixed-floor at its default parkingFloorIndex 0 parks at this fixture's lobby, so these four
    // agree with park-lobby to the summation-order ulp — measured on the study's own run after the
    // strategy joined PARKING_STRATEGIES (slice 4c), not copied from the lobby rows.
    "park-fixed-floor/awtS": { n: 500, mean: 1.9751251824009144, standardError: 0.11607201169328751, lower: 1.7470750895560472, upper: 2.2031752752457816 },
    "park-fixed-floor/pctOverLongWait": { n: 500, mean: 0.014285714285714285, standardError: 0.01428571428571428, lower: -0.013781848442681084, upper: 0.04235327701410965 },
    "park-fixed-floor/ttdMeanS": { n: 500, mean: 1.846547458855998, standardError: 0.1355042775644605, lower: 1.5803182221205505, upper: 2.1127766955914455 },
    "park-fixed-floor/wt95S": { n: 500, mean: 1.6145853726173776, standardError: 0.1607328220695793, lower: 1.2987888730008823, upper: 1.9303818722338728 },
    "park-lobby/awtS": { n: 500, mean: 1.9751251824009144, standardError: 0.11607201169328751, lower: 1.7470750895560472, upper: 2.2031752752457816 },
    "park-lobby/pctOverLongWait": { n: 500, mean: 0.014285714285714285, standardError: 0.01428571428571428, lower: -0.013781848442681084, upper: 0.04235327701410965 },
    "park-lobby/ttdMeanS": { n: 500, mean: 1.846547458855998, standardError: 0.1355042775644605, lower: 1.5803182221205505, upper: 2.1127766955914455 },
    "park-lobby/wt95S": { n: 500, mean: 1.6145853726173776, standardError: 0.1607328220695793, lower: 1.2987888730008823, upper: 1.9303818722338728 },
    "park-predicted-demand-t3/awtS": { n: 500, mean: -0.976142205305244, standardError: 0.15322773231216208, lower: -1.277193234493341, upper: -0.675091176117147 },
    "park-predicted-demand-t3/pctOverLongWait": { n: 500, mean: 0.03125, standardError: 0.03125, lower: -0.030147793468364895, upper: 0.0926477934683649 },
    "park-predicted-demand-t3/ttdMeanS": { n: 500, mean: -0.5965505930067683, standardError: 0.1725242010632659, lower: -0.9355139614924342, upper: -0.2575872245211024 },
    "park-predicted-demand-t3/wt95S": { n: 500, mean: -1.0335699075688676, standardError: 0.2123080643066442, lower: -1.4506978014558332, upper: -0.616442013681902 },
    "park-predicted-demand/awtS": { n: 500, mean: -0.005801020408163272, standardError: 0.00796541789669584, lower: -0.02145091106130083, upper: 0.009848870244974287 },
    "park-predicted-demand/pctOverLongWait": { n: 500, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "park-predicted-demand/ttdMeanS": { n: 500, mean: -0.005801020408163225, standardError: 0.007965417896695826, lower: -0.021450911061300756, upper: 0.009848870244974304 },
    "park-predicted-demand/wt95S": { n: 500, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "park-zone-center/awtS": { n: 500, mean: -4.880504962777228, standardError: 0.197616637049655, lower: -5.268768177736829, upper: -4.492241747817626 },
    "park-zone-center/pctOverLongWait": { n: 500, mean: 0.017142857142857147, standardError: 0.02833428961153728, lower: -0.038526354429686945, upper: 0.07281206871540125 },
    "park-zone-center/ttdMeanS": { n: 500, mean: -4.443277121794808, standardError: 0.22854954917925924, lower: -4.892315138364282, upper: -3.994239105225334 },
    "park-zone-center/wt95S": { n: 500, mean: -6.022761112517068, standardError: 0.2999635465877302, lower: -6.612108308722883, upper: -5.4334139163112525 },
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
    "partialCorrelationWithFutureGivenPast": { n: 100, mean: -0.013891260712850448, standardError: 0.008979396226663706, lower: -0.03170833092080762, upper: 0.003925809495106718 },
  }),
  "destination-disclosure": Object.freeze({
    "control/garden-residential/ttdMeanS": { n: 30, mean: -0.010298960627877088, standardError: 0.01029896062787709, lower: -0.03136270018716893, upper: 0.010764778931414755 },
    "control/midtown-down-peak/ttdMeanS": { n: 30, mean: -0.483662150116074, standardError: 0.2880161280401028, lower: -1.0727212725959798, upper: 0.10539697236383178 },
    "control/midtown-up-peak/ttdMeanS": { n: 30, mean: 0.5271509995413051, standardError: 0.393391296022742, lower: -0.27742454004140715, upper: 1.3317265391240172 },
    "control/secure-up-peak/ttdMeanS": { n: 30, mean: -0.49274695393197304, standardError: 0.3533894917560226, lower: -1.2155096176896003, upper: 0.23001570982565428 },
    "destination-eta+ride0.3/awtS": { n: 150, mean: 0.18226796300990197, standardError: 0.06799631009138127, lower: 0.04790635823509312, upper: 0.31662956778471085 },
    "destination-eta+ride0.3/rideMeanS": { n: 150, mean: -1.1754399784738851, standardError: 0.1393919143098174, lower: -1.4508802380134047, upper: -0.8999997189343656 },
    "destination-eta+ride0.3/ttdMeanS": { n: 150, mean: -0.9931720154639853, standardError: 0.14677659835799672, lower: -1.2832045079957781, upper: -0.7031395229321924 },
    "destination-eta+ride0.3/wt95S": { n: 150, mean: 0.3687378780586765, standardError: 0.3441682577375623, lower: -0.31134313457307117, upper: 1.0488188906904243 },
    "destination-eta+ride0.5/awtS": { n: 150, mean: 0.2954662289981642, standardError: 0.07164588677091559, lower: 0.15389301261160845, upper: 0.43703944538471995 },
    "destination-eta+ride0.5/rideMeanS": { n: 150, mean: -1.512123042594034, standardError: 0.15242978070102545, lower: -1.8133262979315314, upper: -1.2109197872565365 },
    "destination-eta+ride0.5/ttdMeanS": { n: 150, mean: -1.2166568135958722, standardError: 0.1590003076077956, lower: -1.5308435166855088, upper: -0.9024701105062356 },
    "destination-eta+ride0.5/wt95S": { n: 150, mean: 0.3736184017573741, standardError: 0.34259154474858733, lower: -0.3033470052307253, upper: 1.0505838087454735 },
    "destination-eta+ride0.7/awtS": { n: 150, mean: 0.3924103725011227, standardError: 0.07761739392591853, lower: 0.23903737928561594, upper: 0.5457833657166294 },
    "destination-eta+ride0.7/rideMeanS": { n: 150, mean: -1.8254567016504128, standardError: 0.16837016573333427, lower: -2.158158367869192, upper: -1.492755035431634 },
    "destination-eta+ride0.7/ttdMeanS": { n: 150, mean: -1.4330463291492936, standardError: 0.1789991977949242, lower: -1.786751102787855, upper: -1.0793415555107322 },
    "destination-eta+ride0.7/wt95S": { n: 150, mean: 0.6201849104374862, standardError: 0.3306501737554106, lower: -0.033184190108420664, upper: 1.2735540109833932 },
    "destination-eta+ride1/awtS": { n: 150, mean: 0.5139006721684526, standardError: 0.08610589568971448, lower: 0.3437542876088472, upper: 0.684047056728058 },
    "destination-eta+ride1/rideMeanS": { n: 150, mean: -2.0758113863664462, standardError: 0.1670641262132753, lower: -2.4059323012830056, upper: -1.7456904714498866 },
    "destination-eta+ride1/ttdMeanS": { n: 150, mean: -1.5619107141979969, standardError: 0.17918132736647488, lower: -1.9159753782699893, upper: -1.2078460501260044 },
    "destination-eta+ride1/wt95S": { n: 150, mean: 1.010489055736519, standardError: 0.363758237132459, lower: 0.2916979856697961, upper: 1.7292801258032418 },
    "destination-eta+ride2/awtS": { n: 150, mean: 0.7477528863606464, standardError: 0.09502799144738844, lower: 0.5599763230112726, upper: 0.9355294497100202 },
    "destination-eta+ride2/rideMeanS": { n: 150, mean: -2.547262434421546, standardError: 0.17210130209890642, lower: -2.887336875266451, upper: -2.207187993576641 },
    "destination-eta+ride2/ttdMeanS": { n: 150, mean: -1.7995095480609014, standardError: 0.18423648039954615, lower: -2.163563261141478, upper: -1.4354558349803246 },
    "destination-eta+ride2/wt95S": { n: 150, mean: 1.3305439852735417, standardError: 0.3583115157742945, lower: 0.622515708385753, upper: 2.0385722621613303 },
    "destination-eta-unpriced/awtS": { n: 150, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "destination-eta-unpriced/rideMeanS": { n: 150, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "destination-eta-unpriced/ttdMeanS": { n: 150, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "destination-eta-unpriced/wt95S": { n: 150, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "destination-eta/awtS": { n: 150, mean: 0.2954662289981642, standardError: 0.07164588677091559, lower: 0.15389301261160845, upper: 0.43703944538471995 },
    "destination-eta/rideMeanS": { n: 150, mean: -1.512123042594034, standardError: 0.15242978070102545, lower: -1.8133262979315314, upper: -1.2109197872565365 },
    "destination-eta/ttdMeanS": { n: 150, mean: -1.2166568135958722, standardError: 0.1590003076077956, lower: -1.5308435166855088, upper: -0.9024701105062356 },
    "destination-eta/wt95S": { n: 150, mean: 0.3736184017573741, standardError: 0.34259154474858733, lower: -0.3033470052307253, upper: 1.0505838087454735 },
    "eta-deferred/awtS": { n: 150, mean: 1.0807425352842992, standardError: 0.06497113291441807, lower: 0.9523587204760142, upper: 1.2091263500925842 },
    "eta-deferred/rideMeanS": { n: 150, mean: 0.041789845769317775, standardError: 0.12958213651800538, lower: -0.21426616358337858, upper: 0.2978458551220141 },
    "eta-deferred/ttdMeanS": { n: 150, mean: 1.1225323810536159, standardError: 0.1388639415111969, lower: 0.8481354027216319, upper: 1.3969293593855998 },
    "eta-deferred/wt95S": { n: 150, mean: 1.8949586449919782, standardError: 0.22848055472523252, lower: 1.443478058009186, upper: 2.3464392319747702 },
  }),
  "destination-dispatch": Object.freeze({
    "midtown-interfloor-binding/awtS": { n: 150, mean: 6.48814110658395, standardError: 0.6230264694382402, lower: 5.257032592924825, upper: 7.719249620243075 },
    "midtown-interfloor-binding/rideMeanS": { n: 150, mean: -0.825285078538584, standardError: 0.29624572157359375, lower: -1.4106705282020435, upper: -0.2398996288751244 },
    "midtown-interfloor-binding/ttdMeanS": { n: 150, mean: 5.662856028045364, standardError: 0.6979652911673799, lower: 4.283667415128959, upper: 7.042044640961769 },
    "midtown-interfloor-binding/wt95S": { n: 150, mean: 29.939083606176265, standardError: 2.7650942664395814, lower: 24.47522089813887, upper: 35.402946314213665 },
    "midtown-interfloor-mix/awtS": { n: 150, mean: -0.010263039844002755, standardError: 0.04341996241191674, lower: -0.09606145774471891, upper: 0.0755353780567134 },
    "midtown-interfloor-mix/rideMeanS": { n: 150, mean: 0.11845433668652537, standardError: 0.06494104032138054, lower: -0.00987001476136666, upper: 0.2467786881344174 },
    "midtown-interfloor-mix/ttdMeanS": { n: 150, mean: 0.10819129684252374, standardError: 0.07411430606504643, lower: -0.0382595485972968, upper: 0.2546421422823443 },
    "midtown-interfloor-mix/wt95S": { n: 150, mean: 0.15228217757700277, standardError: 0.24485636056663007, lower: -0.3315572175436704, upper: 0.636121572697676 },
    "secure-interfloor-mix/awtS": { n: 150, mean: -0.05614971222074281, standardError: 0.028132573182453914, lower: -0.11174004755157685, upper: -0.000559376889908772 },
    "secure-interfloor-mix/rideMeanS": { n: 150, mean: 0.017415872076990482, standardError: 0.031610548431983146, lower: -0.04504698817859011, upper: 0.07987873233257108 },
    "secure-interfloor-mix/ttdMeanS": { n: 150, mean: -0.040611643090935366, standardError: 0.0488845704463449, lower: -0.1372081984785877, upper: 0.055984912296716975 },
    "secure-interfloor-mix/wt95S": { n: 150, mean: -0.221385448268202, standardError: 0.11615664791656581, lower: -0.45091251522753795, upper: 0.008141618691133945 },
  }),
  "access-control": Object.freeze({
    "difference-of-differences/absolute": { n: 150, mean: 1.0198874336002017, standardError: 0.20019156511627376, lower: 0.6253356773407206, upper: 1.4144391898596829 },
    "difference-of-differences/relative": { n: 150, mean: 0.017739613640075758, standardError: 0.0035577341279079693, lower: 0.010730844452831954, upper: 0.02474838282731956 },
    "midtown-office/absolute": { n: 150, mean: -1.5619107141979969, standardError: 0.17918132736647488, lower: -1.9159753782699893, upper: -1.2078460501260044 },
    "midtown-office/relative": { n: 150, mean: -0.02852577352735841, standardError: 0.003086751585385649, lower: -0.03462523533633341, upper: -0.022426311718383416 },
    "secure-tower/absolute": { n: 150, mean: -0.542023280597795, standardError: 0.08927885901427861, lower: -0.7184394824990636, upper: -0.3656070786965265 },
    "secure-tower/relative": { n: 150, mean: -0.010786159887282655, standardError: 0.0017690214173379205, lower: -0.014281769519556769, upper: -0.007290550255008542 },
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
    "up-peak-2pct/destination-eta+ride1−collective/awtS": { n: 238, mean: 0.6827179350230643, standardError: 0.05959890011214473, lower: 0.5653066708084973, upper: 0.8001291992376314 },
    "up-peak-2pct/destination-eta+ride1−collective/rideMeanS": { n: 238, mean: -0.7814334762839042, standardError: 0.2106127711590126, lower: -1.1963456923647842, upper: -0.3665212602030243 },
    "up-peak-2pct/destination-eta+ride1−collective/ttdMeanS": { n: 238, mean: -0.03960515156886264, standardError: 0.2610232485611048, lower: -0.5538272185077692, upper: 0.47461691537004386 },
    "up-peak-2pct/destination-eta+ride1−collective/wt95S": { n: 238, mean: 0.004611381474101686, standardError: 0.11563448201830338, lower: -0.22319132453253177, upper: 0.23241408748073517 },
    "up-peak-2pct/destination-eta+ride1−eta/awtS": { n: 238, mean: 0.6739522314544583, standardError: 0.05994238848540024, lower: 0.5558642868972834, upper: 0.7920401760116331 },
    "up-peak-2pct/destination-eta+ride1−eta/rideMeanS": { n: 238, mean: -0.771097224042806, standardError: 0.2087262736499293, lower: -1.1822929947352254, upper: -0.35990145335038665 },
    "up-peak-2pct/destination-eta+ride1−eta/ttdMeanS": { n: 238, mean: -0.10850733230403298, standardError: 0.2577855196306536, lower: -0.6163509955107723, upper: 0.39933633090270637 },
    "up-peak-2pct/destination-eta+ride1−eta/wt95S": { n: 238, mean: 0.17426403661850862, standardError: 0.05621981365184814, lower: 0.06350965386395535, upper: 0.2850184193730619 },
    "up-peak-2pct/destination-eta+ride1−nearest-car/awtS": { n: 238, mean: -4.301624403903193, standardError: 0.22609722446577474, lower: -4.747041364786367, upper: -3.8562074430200193 },
    "up-peak-2pct/destination-eta+ride1−nearest-car/rideMeanS": { n: 238, mean: -3.8587346760381904, standardError: 0.31299144619603203, lower: -4.4753353400953, upper: -3.242134011981081 },
    "up-peak-2pct/destination-eta+ride1−nearest-car/ttdMeanS": { n: 238, mean: -12.328414985504825, standardError: 0.5815212316420223, lower: -13.474025774399045, upper: -11.182804196610604 },
    "up-peak-2pct/destination-eta+ride1−nearest-car/wt95S": { n: 238, mean: -23.78912828784516, standardError: 0.9765326425467977, lower: -25.712921040605163, upper: -21.865335535085155 },
    "up-peak-2pct/destination-panel−collective/awtS": { n: 238, mean: 0.8032900110067013, standardError: 0.0806048546176872, lower: 0.6444965120547712, upper: 0.9620835099586313 },
    "up-peak-2pct/destination-panel−collective/rideMeanS": { n: 238, mean: -0.8339464886581823, standardError: 0.20624718970685688, lower: -1.240258404458943, upper: -0.42763457285742146 },
    "up-peak-2pct/destination-panel−collective/ttdMeanS": { n: 238, mean: -0.09282550082109009, standardError: 0.28787675860853074, lower: -0.6599496273170381, upper: 0.4742986256748579 },
    "up-peak-2pct/destination-panel−collective/wt95S": { n: 238, mean: -0.04216512509786713, standardError: 0.12172292283511937, lower: -0.281962205699549, upper: 0.19763195550381477 },
    "up-peak-2pct/destination-panel−eta/awtS": { n: 238, mean: 0.794524307438095, standardError: 0.08097511739834402, lower: 0.6350013819181122, upper: 0.9540472329580778 },
    "up-peak-2pct/destination-panel−eta/rideMeanS": { n: 238, mean: -0.8236102364170841, standardError: 0.20480688676818395, lower: -1.2270847208464044, upper: -0.42013575198776365 },
    "up-peak-2pct/destination-panel−eta/ttdMeanS": { n: 238, mean: -0.1617276815562604, standardError: 0.28431766652836576, lower: -0.7218403111990463, upper: 0.3983849480865256 },
    "up-peak-2pct/destination-panel−eta/wt95S": { n: 238, mean: 0.12748753004653973, standardError: 0.0683573811502125, lower: -0.00717815210768491, upper: 0.2621532122007644 },
    "up-peak-2pct/destination-panel−nearest-car/awtS": { n: 238, mean: -4.181052327919559, standardError: 0.2300232410621635, lower: -4.634203635762861, upper: -3.727901020076257 },
    "up-peak-2pct/destination-panel−nearest-car/rideMeanS": { n: 238, mean: -3.9112476884124665, standardError: 0.31172796707901906, lower: -4.525359268272417, upper: -3.2971361085525164 },
    "up-peak-2pct/destination-panel−nearest-car/ttdMeanS": { n: 238, mean: -12.381635334757055, standardError: 0.606026687452141, lower: -13.575522459983091, upper: -11.18774820953102 },
    "up-peak-2pct/destination-panel−nearest-car/wt95S": { n: 238, mean: -23.835904794417125, standardError: 0.9763553892840174, lower: -25.75934835399353, upper: -21.91246123484072 },
    "up-peak-4pct/destination-eta+ride1−collective/awtS": { n: 200, mean: 0.8746942954337072, standardError: 0.08829543539315919, lower: 0.7005795337826055, upper: 1.048809057084809 },
    "up-peak-4pct/destination-eta+ride1−collective/rideMeanS": { n: 200, mean: -2.4707351572476806, standardError: 0.3110451165101313, lower: -3.0841026103073954, upper: -1.8573677041879657 },
    "up-peak-4pct/destination-eta+ride1−collective/ttdMeanS": { n: 200, mean: -2.116358350671327, standardError: 0.40134963479253394, lower: -2.907802389533532, upper: -1.3249143118091224 },
    "up-peak-4pct/destination-eta+ride1−collective/wt95S": { n: 200, mean: 0.25336859159793673, standardError: 0.15168291209489007, lower: -0.04574351955875128, upper: 0.5524807027546248 },
    "up-peak-4pct/destination-eta+ride1−eta/awtS": { n: 200, mean: 0.8764178109008983, standardError: 0.08797316262305768, lower: 0.7029385571478325, upper: 1.0498970646539643 },
    "up-peak-4pct/destination-eta+ride1−eta/rideMeanS": { n: 200, mean: -2.451719588792003, standardError: 0.31250415643227464, lower: -3.067964205174513, upper: -1.8354749724094928 },
    "up-peak-4pct/destination-eta+ride1−eta/ttdMeanS": { n: 200, mean: -2.0722858950293706, standardError: 0.40333920921514566, lower: -2.8676532881945205, upper: -1.2769185018642208 },
    "up-peak-4pct/destination-eta+ride1−eta/wt95S": { n: 200, mean: 0.2725685915979369, standardError: 0.15143528350529975, lower: -0.02605520674096462, upper: 0.5711923899368384 },
    "up-peak-4pct/destination-eta+ride1−nearest-car/awtS": { n: 200, mean: -6.619792030614814, standardError: 0.38866040409459174, lower: -7.386213457960691, upper: -5.853370603268937 },
    "up-peak-4pct/destination-eta+ride1−nearest-car/rideMeanS": { n: 200, mean: -7.371891454287547, standardError: 0.4334778789142667, lower: -8.226690994400922, upper: -6.517091914174172 },
    "up-peak-4pct/destination-eta+ride1−nearest-car/ttdMeanS": { n: 200, mean: -21.239007590100304, standardError: 0.7880325851976934, lower: -22.792973603564555, upper: -19.685041576636053 },
    "up-peak-4pct/destination-eta+ride1−nearest-car/wt95S": { n: 200, mean: -30.923566047357046, standardError: 1.8520335598329785, lower: -34.57569574584363, upper: -27.27143634887046 },
    "up-peak-4pct/destination-panel−collective/awtS": { n: 200, mean: 2.1172710963362347, standardError: 0.1939737025658369, lower: 1.7347633841487817, upper: 2.4997788085236876 },
    "up-peak-4pct/destination-panel−collective/rideMeanS": { n: 200, mean: -3.411996857443268, standardError: 0.3343992782453216, lower: -4.071417702572207, upper: -2.75257601231433 },
    "up-peak-4pct/destination-panel−collective/ttdMeanS": { n: 200, mean: -1.6416977033487938, standardError: 0.4961306962037954, lower: -2.6200458765320667, upper: -0.6633495301655211 },
    "up-peak-4pct/destination-panel−collective/wt95S": { n: 200, mean: 3.2246067976657735, standardError: 1.2826451865416504, lower: 0.6952862281119034, upper: 5.753927367219644 },
    "up-peak-4pct/destination-panel−eta/awtS": { n: 200, mean: 2.1189946118034264, standardError: 0.19352234817611622, lower: 1.73737695085856, upper: 2.5006122727482927 },
    "up-peak-4pct/destination-panel−eta/rideMeanS": { n: 200, mean: -3.392981288987591, standardError: 0.333467222373154, lower: -4.0505641604398, upper: -2.735398417535382 },
    "up-peak-4pct/destination-panel−eta/ttdMeanS": { n: 200, mean: -1.5976252477068384, standardError: 0.49546622835973253, lower: -2.5746631191765665, upper: -0.6205873762371104 },
    "up-peak-4pct/destination-panel−eta/wt95S": { n: 200, mean: 3.2438067976657745, standardError: 1.2823537300312826, lower: 0.7150609676848894, upper: 5.772552627646659 },
    "up-peak-4pct/destination-panel−nearest-car/awtS": { n: 200, mean: -5.377215229712291, standardError: 0.4288096174747414, lower: -6.222809161129715, upper: -4.5316212982948665 },
    "up-peak-4pct/destination-panel−nearest-car/rideMeanS": { n: 200, mean: -8.313153154483135, standardError: 0.4604243835566386, lower: -9.221090030770746, upper: -7.405216278195524 },
    "up-peak-4pct/destination-panel−nearest-car/ttdMeanS": { n: 200, mean: -20.764346942777788, standardError: 0.8901979184907074, lower: -22.519778553824864, upper: -19.008915331730712 },
    "up-peak-4pct/destination-panel−nearest-car/wt95S": { n: 200, mean: -27.952327841289197, standardError: 2.32097779568783, lower: -32.529195194558916, upper: -23.375460488019478 },
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
    "garden-down-peak/energy-aware/ttdMeanS": { n: 51, mean: 0.4231751003049385, standardError: 0.16622631038878963, lower: 0.08929972990264484, upper: 0.7570504707072321 },
    "garden-down-peak/energy-aware/wt95S": { n: 51, mean: -0.06774100054975646, standardError: 0.09876288979154733, lower: -0.2661121027779726, upper: 0.13063010167845965 },
    "garden-down-peak/eta/awtS": { n: 51, mean: -0.030932932335564982, standardError: 0.024575578207489495, lower: -0.08029443387936303, upper: 0.018428569208233055 },
    "garden-down-peak/eta/energyKJ": { n: 51, mean: -5.232285855054819, standardError: 3.8646053692923408, lower: -12.994574184220497, upper: 2.5300024741108578 },
    "garden-down-peak/eta/ttdMeanS": { n: 51, mean: 0.18048163349076432, standardError: 0.1647334023853505, lower: -0.1503951429376935, upper: 0.5113584099192221 },
    "garden-down-peak/eta/wt95S": { n: 51, mean: -0.09766788828032605, standardError: 0.09766788828032605, lower: -0.2938396152454146, upper: 0.09850383868476245 },
    "garden-down-peak/fairness-first/awtS": { n: 51, mean: -0.030932932335564982, standardError: 0.024575578207489495, lower: -0.08029443387936303, upper: 0.018428569208233055 },
    "garden-down-peak/fairness-first/energyKJ": { n: 51, mean: -5.232285855054819, standardError: 3.8646053692923408, lower: -12.994574184220497, upper: 2.5300024741108578 },
    "garden-down-peak/fairness-first/ttdMeanS": { n: 51, mean: 0.18048163349076432, standardError: 0.1647334023853505, lower: -0.1503951429376935, upper: 0.5113584099192221 },
    "garden-down-peak/fairness-first/wt95S": { n: 51, mean: -0.09766788828032605, standardError: 0.09766788828032605, lower: -0.2938396152454146, upper: 0.09850383868476245 },
    "garden-down-peak/nearest-car/awtS": { n: 51, mean: 2.2203949732413983, standardError: 0.511962760440714, lower: 1.1920875057019407, upper: 3.248702440780856 },
    "garden-down-peak/nearest-car/energyKJ": { n: 51, mean: -24.83452337751044, standardError: 5.492090623422911, lower: -35.8657120436697, upper: -13.803334711351175 },
    "garden-down-peak/nearest-car/ttdMeanS": { n: 51, mean: 3.0616922716967108, standardError: 0.649159671436168, lower: 1.7578166984252561, upper: 4.365567844968165 },
    "garden-down-peak/nearest-car/wt95S": { n: 51, mean: 5.302681984526291, standardError: 1.0833525476834507, lower: 3.1267043532591168, upper: 7.478659615793466 },
    "garden-down-peak/predictive-balanced/awtS": { n: 51, mean: 1.5574508140075423, standardError: 0.041537366736688466, lower: 1.4740205575558953, upper: 1.6408810704591892 },
    "garden-down-peak/predictive-balanced/energyKJ": { n: 51, mean: 3.093608515869779, standardError: 3.034833547341043, lower: -3.0020340593511645, upper: 9.189251091090723 },
    "garden-down-peak/predictive-balanced/ttdMeanS": { n: 51, mean: 2.170981536444307, standardError: 0.16020137412781374, lower: 1.8492076066688228, upper: 2.492755466219791 },
    "garden-down-peak/predictive-balanced/wt95S": { n: 51, mean: 1.4200772097588892, standardError: 0.09311942758620478, lower: 1.2330413349670102, upper: 1.6071130845507682 },
    "garden-down-peak/zoned-uppeak/awtS": { n: 51, mean: -6.723511679516362, standardError: 0.4479112457301893, lower: -7.623167893540138, upper: -5.823855465492585 },
    "garden-down-peak/zoned-uppeak/energyKJ": { n: 51, mean: 72.17618494228057, standardError: 5.959266257712711, lower: 60.20664639891707, upper: 84.14572348564407 },
    "garden-down-peak/zoned-uppeak/ttdMeanS": { n: 51, mean: -6.517383947408244, standardError: 0.5302363536901893, lower: -7.582395007179758, upper: -5.45237288763673 },
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
    "garden-residential/energy-aware/awtS": { n: 65, mean: 0.07210071756303027, standardError: 0.22695565134288845, lower: -0.3812953173396437, upper: 0.5254967524657043 },
    "garden-residential/energy-aware/energyKJ": { n: 65, mean: -6.206486340663414, standardError: 3.829998302063239, lower: -13.857787524681536, upper: 1.444814843354708 },
    "garden-residential/energy-aware/ttdMeanS": { n: 65, mean: 2.4674834739308165, standardError: 0.4628511531544046, lower: 1.5428319997391249, upper: 3.392134948122508 },
    "garden-residential/energy-aware/wt95S": { n: 65, mean: -0.3451297797377836, standardError: 0.4857120675369779, lower: -1.3154511805163593, upper: 0.6251916210407922 },
    "garden-residential/eta/awtS": { n: 65, mean: -0.006435779918776473, standardError: 0.22222127885382, lower: -0.4503738185054526, upper: 0.43750225866789966 },
    "garden-residential/eta/energyKJ": { n: 65, mean: -2.894414945444284, standardError: 3.1625506681541404, lower: -9.212336198498026, upper: 3.4235063076094567 },
    "garden-residential/eta/ttdMeanS": { n: 65, mean: 2.003734459822433, standardError: 0.46217476697561927, lower: 1.0804342223578718, upper: 2.9270346972869943 },
    "garden-residential/eta/wt95S": { n: 65, mean: -0.5827344128218341, standardError: 0.4535553145924324, lower: -1.4888153146565237, upper: 0.32334648901285556 },
    "garden-residential/fairness-first/awtS": { n: 65, mean: -0.006435779918776473, standardError: 0.22222127885382, lower: -0.4503738185054526, upper: 0.43750225866789966 },
    "garden-residential/fairness-first/energyKJ": { n: 65, mean: -2.894414945444284, standardError: 3.1625506681541404, lower: -9.212336198498026, upper: 3.4235063076094567 },
    "garden-residential/fairness-first/ttdMeanS": { n: 65, mean: 2.003734459822433, standardError: 0.46217476697561927, lower: 1.0804342223578718, upper: 2.9270346972869943 },
    "garden-residential/fairness-first/wt95S": { n: 65, mean: -0.5827344128218341, standardError: 0.4535553145924324, lower: -1.4888153146565237, upper: 0.32334648901285556 },
    "garden-residential/nearest-car/awtS": { n: 65, mean: 1.4066196348274456, standardError: 0.3229266673614513, lower: 0.7614994552694908, upper: 2.0517398143854004 },
    "garden-residential/nearest-car/energyKJ": { n: 65, mean: -14.929892642310321, standardError: 5.294726491568262, lower: -25.507324766017682, upper: -4.352460518602959 },
    "garden-residential/nearest-car/ttdMeanS": { n: 65, mean: 3.8561082153787423, standardError: 0.620381503677798, lower: 2.616753688491408, upper: 5.0954627422660765 },
    "garden-residential/nearest-car/wt95S": { n: 65, mean: 3.1552270062092145, standardError: 0.9013881495659158, lower: 1.3544971697708381, upper: 4.955956842647591 },
    "garden-residential/predictive-balanced/awtS": { n: 65, mean: 0.8956972861522552, standardError: 0.21803399404747997, lower: 0.46012431059427844, upper: 1.3312702617102319 },
    "garden-residential/predictive-balanced/energyKJ": { n: 65, mean: 4.57694480537381, standardError: 2.946985288881187, lower: -1.3103350970621115, upper: 10.464224707809732 },
    "garden-residential/predictive-balanced/ttdMeanS": { n: 65, mean: 1.2423899361206046, standardError: 0.26022536159676635, lower: 0.7225300144532014, upper: 1.7622498577880077 },
    "garden-residential/predictive-balanced/wt95S": { n: 65, mean: 0.9434732228555546, standardError: 0.4609349756565999, lower: 0.022649753274163853, upper: 1.8642966924369453 },
    "garden-residential/zoned-uppeak/awtS": { n: 65, mean: -5.359970077243595, standardError: 0.5084227766499403, lower: -6.3756613350877185, upper: -4.344278819399472 },
    "garden-residential/zoned-uppeak/energyKJ": { n: 65, mean: 129.508332000993, standardError: 8.993521548399066, lower: 111.54170730701105, upper: 147.47495669497494 },
    "garden-residential/zoned-uppeak/ttdMeanS": { n: 65, mean: -3.3826738402802428, standardError: 0.7095559548414767, lower: -4.800174812664762, upper: -1.9651728678957232 },
    "garden-residential/zoned-uppeak/wt95S": { n: 65, mean: -6.511671228666091, standardError: 1.0208058820437795, lower: -8.550965410526873, upper: -4.47237704680531 },
    "midtown-down-peak/auction-multi-round/awtS": { n: 78, mean: -0.1290107369975595, standardError: 0.12717197981676104, lower: -0.38224250077792976, upper: 0.12422102678281077 },
    "midtown-down-peak/auction-multi-round/energyKJ": { n: 78, mean: -175.29782495169113, standardError: 51.65129851812402, lower: -278.14870015342393, upper: -72.44694974995832 },
    "midtown-down-peak/auction-multi-round/ttdMeanS": { n: 78, mean: 0.6215123188100785, standardError: 0.23470367050023214, lower: 0.15415760331270056, upper: 1.0888670343074565 },
    "midtown-down-peak/auction-multi-round/wt95S": { n: 78, mean: -0.37565410698858126, standardError: 0.3491864141841602, lower: -1.0709730890427045, upper: 0.319664875065542 },
    "midtown-down-peak/auction/awtS": { n: 78, mean: -0.12303665063341389, standardError: 0.13075329694184526, lower: -0.3833997278803879, upper: 0.1373264266135601 },
    "midtown-down-peak/auction/energyKJ": { n: 78, mean: -183.49942480961172, standardError: 51.96528601978596, lower: -286.97552900412586, upper: -80.02332061509757 },
    "midtown-down-peak/auction/ttdMeanS": { n: 78, mean: 0.6253294319953553, standardError: 0.228253587942309, lower: 0.17081847174205983, upper: 1.0798403922486508 },
    "midtown-down-peak/auction/wt95S": { n: 78, mean: -0.23215984546012372, standardError: 0.38785804271817437, lower: -1.0044838778094303, upper: 0.5401641868891828 },
    "midtown-down-peak/capacity-aware/awtS": { n: 78, mean: -0.3935208860383189, standardError: 0.09208789532568251, lower: -0.5768913123676511, upper: -0.21015045970898674 },
    "midtown-down-peak/capacity-aware/energyKJ": { n: 78, mean: -385.07333356826393, standardError: 52.61406351164481, lower: -489.84131879507106, upper: -280.3053483414568 },
    "midtown-down-peak/capacity-aware/ttdMeanS": { n: 78, mean: 0.9711515170099398, standardError: 0.28544128083821513, lower: 0.4027653119155493, upper: 1.5395377221043303 },
    "midtown-down-peak/capacity-aware/wt95S": { n: 78, mean: -0.6816381781613137, standardError: 0.42631951778434957, lower: -1.5305487917892628, upper: 0.1672724354666355 },
    "midtown-down-peak/destination-eta/awtS": { n: 78, mean: -0.481688673031057, standardError: 0.09265031870517046, lower: -0.6661790273868637, upper: -0.29719831867525026 },
    "midtown-down-peak/destination-eta/energyKJ": { n: 78, mean: -398.6701361036573, standardError: 53.14914072690641, lower: -504.5035961872263, upper: -292.83667602008825 },
    "midtown-down-peak/destination-eta/ttdMeanS": { n: 78, mean: 0.9167646155528297, standardError: 0.24569796475025063, lower: 0.427517463305909, upper: 1.4060117677997503 },
    "midtown-down-peak/destination-eta/wt95S": { n: 78, mean: -0.9368740767149214, standardError: 0.2737555000502486, lower: -1.4819909194517282, upper: -0.39175723397811446 },
    "midtown-down-peak/destination-panel/awtS": { n: 78, mean: -0.4899494567532495, standardError: 0.09208748896538375, lower: -0.6733190739158507, upper: -0.3065798395906484 },
    "midtown-down-peak/destination-panel/energyKJ": { n: 78, mean: -388.8285330840774, standardError: 51.893270799106965, lower: -492.16123665387966, upper: -285.4958295142751 },
    "midtown-down-peak/destination-panel/ttdMeanS": { n: 78, mean: 0.8455826199589237, standardError: 0.241526430823792, lower: 0.3646420529785756, upper: 1.3265231869392717 },
    "midtown-down-peak/destination-panel/wt95S": { n: 78, mean: -1.0353462588197966, standardError: 0.2501942812001051, lower: -1.5335467209605471, upper: -0.5371457966790459 },
    "midtown-down-peak/energy-aware/awtS": { n: 78, mean: 0.19982162713973034, standardError: 0.1386932670330532, lower: -0.07635195045061394, upper: 0.4759952047300746 },
    "midtown-down-peak/energy-aware/energyKJ": { n: 78, mean: -967.0441433191318, standardError: 78.9642501473601, lower: -1124.2820535036117, upper: -809.8062331346518 },
    "midtown-down-peak/energy-aware/ttdMeanS": { n: 78, mean: 4.889653899111381, standardError: 0.46714769937437295, lower: 3.959443989436582, upper: 5.81986380878618 },
    "midtown-down-peak/energy-aware/wt95S": { n: 78, mean: 1.3762281124442826, standardError: 0.6120804890151476, lower: 0.15742014836138885, upper: 2.595036076527176 },
    "midtown-down-peak/eta/awtS": { n: 78, mean: -0.4076683035912397, standardError: 0.08328521257029146, lower: -0.5735103491926897, upper: -0.2418262579897896 },
    "midtown-down-peak/eta/energyKJ": { n: 78, mean: -425.2800650317304, standardError: 55.50046774092359, lower: -535.7956153669566, upper: -314.7645146965042 },
    "midtown-down-peak/eta/ttdMeanS": { n: 78, mean: 1.2709317156837205, standardError: 0.29609708742096785, lower: 0.681327088895015, upper: 1.8605363424724262 },
    "midtown-down-peak/eta/wt95S": { n: 78, mean: -0.5641579364023855, standardError: 0.40247825617014554, lower: -1.3655945330494461, upper: 0.23727866024467514 },
    "midtown-down-peak/fairness-first/awtS": { n: 78, mean: -0.4381577522928058, standardError: 0.09789669239170587, lower: -0.6330949713117762, upper: -0.24322053327383536 },
    "midtown-down-peak/fairness-first/energyKJ": { n: 78, mean: -402.3170611587835, standardError: 52.92523517787761, lower: -507.70466833369704, upper: -296.9294539838699 },
    "midtown-down-peak/fairness-first/ttdMeanS": { n: 78, mean: 1.072669400328952, standardError: 0.2624537028924582, lower: 0.5500573108583835, upper: 1.5952814897995207 },
    "midtown-down-peak/fairness-first/wt95S": { n: 78, mean: -0.8514175383905015, standardError: 0.3489300476004139, lower: -1.5462260293579093, upper: -0.15660904742309367 },
    "midtown-down-peak/nearest-car/awtS": { n: 78, mean: 30.137878355441252, standardError: 1.790053130973401, lower: 26.5734271904117, upper: 33.702329520470805 },
    "midtown-down-peak/nearest-car/energyKJ": { n: 78, mean: -2854.074882322374, standardError: 133.160657576299, lower: -3119.231627013989, upper: -2588.918137630759 },
    "midtown-down-peak/nearest-car/ttdMeanS": { n: 78, mean: 63.225504653371225, standardError: 3.1464177336664125, lower: 56.960186511479975, upper: 69.49082279526247 },
    "midtown-down-peak/nearest-car/wt95S": { n: 78, mean: 72.85952356599803, standardError: 4.731101417190774, lower: 63.438697073988614, upper: 82.28035005800744 },
    "midtown-down-peak/predictive-balanced/awtS": { n: 78, mean: 1.778442533592091, standardError: 0.17628706169193215, lower: 1.427410147147925, upper: 2.129474920036257 },
    "midtown-down-peak/predictive-balanced/energyKJ": { n: 78, mean: 139.3207561437388, standardError: 62.53598763871449, lower: 14.795695888193933, upper: 263.84581639928365 },
    "midtown-down-peak/predictive-balanced/ttdMeanS": { n: 78, mean: 1.9443816190676313, standardError: 0.2469290917476306, lower: 1.4526829797758964, upper: 2.4360802583593664 },
    "midtown-down-peak/predictive-balanced/wt95S": { n: 78, mean: 1.3905661725478837, standardError: 0.37734581429520925, lower: 0.6391746612511334, upper: 2.141957683844634 },
    "midtown-down-peak/zoned-uppeak/awtS": { n: 78, mean: -6.0179212764311485, standardError: 0.4812705007333929, lower: -6.976253276387293, upper: -5.059589276475004 },
    "midtown-down-peak/zoned-uppeak/energyKJ": { n: 78, mean: -44.49262950618948, standardError: 92.88434296653438, lower: -229.44898570106466, upper: 140.4637266886857 },
    "midtown-down-peak/zoned-uppeak/ttdMeanS": { n: 78, mean: -5.346273020865269, standardError: 0.5068782082323178, lower: -6.355596480934468, upper: -4.33694956079607 },
    "midtown-down-peak/zoned-uppeak/wt95S": { n: 78, mean: -0.4743695251169247, standardError: 1.6431542309030218, lower: -3.7463076097036128, upper: 2.797568559469763 },
    "midtown-interfloor/auction-multi-round/awtS": { n: 200, mean: -0.5403279716165988, standardError: 0.11311224015236453, lower: -0.7633803938200345, upper: -0.31727554941316316 },
    "midtown-interfloor/auction-multi-round/energyKJ": { n: 200, mean: -574.0897065486724, standardError: 74.08165511867311, lower: -720.1755111689442, upper: -428.00390192840064 },
    "midtown-interfloor/auction-multi-round/ttdMeanS": { n: 200, mean: 0.4118347396303203, standardError: 0.16908257853951703, lower: 0.07841124236035185, upper: 0.7452582369002887 },
    "midtown-interfloor/auction-multi-round/wt95S": { n: 200, mean: -3.201510880786837, standardError: 0.4259085236376452, lower: -4.041383981226711, upper: -2.361637780346963 },
    "midtown-interfloor/auction/awtS": { n: 200, mean: -0.767020491787907, standardError: 0.10532429081669953, lower: -0.9747154163325766, upper: -0.5593255672432373 },
    "midtown-interfloor/auction/energyKJ": { n: 200, mean: -659.7502494543087, standardError: 72.05841846854106, lower: -801.8463193217825, upper: -517.6541795868349 },
    "midtown-interfloor/auction/ttdMeanS": { n: 200, mean: 0.49070208845793173, standardError: 0.168100005481382, lower: 0.15921618256015818, upper: 0.8221879943557053 },
    "midtown-interfloor/auction/wt95S": { n: 200, mean: -3.814338290379579, standardError: 0.4153292755157612, lower: -4.63334957325224, upper: -2.9953270075069174 },
    "midtown-interfloor/capacity-aware/awtS": { n: 200, mean: -1.2207840706316224, standardError: 0.11285422800192328, lower: -1.4433277040864991, upper: -0.9982404371767458 },
    "midtown-interfloor/capacity-aware/energyKJ": { n: 200, mean: -1092.9339338321993, standardError: 71.1616968066523, lower: -1233.2617075501391, upper: -952.6061601142593 },
    "midtown-interfloor/capacity-aware/ttdMeanS": { n: 200, mean: 1.2328249115647303, standardError: 0.18168016297379716, lower: 0.8745595252278187, upper: 1.591090297901642 },
    "midtown-interfloor/capacity-aware/wt95S": { n: 200, mean: -4.70256251239664, standardError: 0.46291440725706523, lower: -5.61540960721565, upper: -3.7897154175776304 },
    "midtown-interfloor/destination-eta/awtS": { n: 200, mean: -1.0324211571740471, standardError: 0.11299215148014365, lower: -1.2552367697344065, upper: -0.8096055446136879 },
    "midtown-interfloor/destination-eta/energyKJ": { n: 200, mean: -1163.4285281476023, standardError: 67.11152204220375, lower: -1295.7695332334245, upper: -1031.08752306178 },
    "midtown-interfloor/destination-eta/ttdMeanS": { n: 200, mean: 0.8704428200113405, standardError: 0.16524790516872684, lower: 0.5445811319899698, upper: 1.1963045080327113 },
    "midtown-interfloor/destination-eta/wt95S": { n: 200, mean: -4.369244668915881, standardError: 0.42456771356999345, lower: -5.206473750168251, upper: -3.5320155876635115 },
    "midtown-interfloor/destination-panel/awtS": { n: 200, mean: -0.7257146779153659, standardError: 0.11359033106119187, lower: -0.9497098746152111, upper: -0.5017194812155208 },
    "midtown-interfloor/destination-panel/energyKJ": { n: 200, mean: -964.864252847478, standardError: 67.01129394532923, lower: -1097.0076124817506, upper: -832.7208932132055 },
    "midtown-interfloor/destination-panel/ttdMeanS": { n: 200, mean: 0.6818376700052897, standardError: 0.16399510019586452, lower: 0.3584464589488261, upper: 1.0052288810617533 },
    "midtown-interfloor/destination-panel/wt95S": { n: 200, mean: -3.9141030515464927, standardError: 0.4377580227190958, lower: -4.777342849246139, upper: -3.0508632538468463 },
    "midtown-interfloor/energy-aware/awtS": { n: 200, mean: 0.1085585861249475, standardError: 0.1388791928650066, lower: -0.16530514710560923, upper: 0.38242231935550425 },
    "midtown-interfloor/energy-aware/energyKJ": { n: 200, mean: -2486.2351215821227, standardError: 79.03988264711035, lower: -2642.0983354249856, upper: -2330.3719077392598 },
    "midtown-interfloor/energy-aware/ttdMeanS": { n: 200, mean: 5.784008671386446, standardError: 0.2827294056491022, lower: 5.226478569664279, upper: 6.3415387731086135 },
    "midtown-interfloor/energy-aware/wt95S": { n: 200, mean: -0.14483133316910485, standardError: 0.5715517943998047, lower: -1.2719066345146555, upper: 0.9822439681764457 },
    "midtown-interfloor/eta/awtS": { n: 200, mean: -1.1907314493147885, standardError: 0.10763543010620548, lower: -1.4029838401060768, upper: -0.9784790585235 },
    "midtown-interfloor/eta/energyKJ": { n: 200, mean: -1369.1308713110516, standardError: 71.5949143081797, lower: -1510.312931116213, upper: -1227.9488115058903 },
    "midtown-interfloor/eta/ttdMeanS": { n: 200, mean: 2.218878278082715, standardError: 0.1896525568977058, lower: 1.8448916773741986, upper: 2.592864878791232 },
    "midtown-interfloor/eta/wt95S": { n: 200, mean: -4.471764456313826, standardError: 0.44124107177688465, lower: -5.341872675396929, upper: -3.6016562372307233 },
    "midtown-interfloor/fairness-first/awtS": { n: 200, mean: -1.2522054528899154, standardError: 0.1061792146458045, lower: -1.4615862500742254, upper: -1.0428246557056053 },
    "midtown-interfloor/fairness-first/energyKJ": { n: 200, mean: -1292.7222800485856, standardError: 71.41647956560034, lower: -1433.5524742953958, upper: -1151.8920858017755 },
    "midtown-interfloor/fairness-first/ttdMeanS": { n: 200, mean: 1.9378259703681675, standardError: 0.17993281505065645, lower: 1.5830062782033778, upper: 2.292645662532957 },
    "midtown-interfloor/fairness-first/wt95S": { n: 200, mean: -4.611293430562466, standardError: 0.46815016788900154, lower: -5.534465217823759, upper: -3.688121643301174 },
    "midtown-interfloor/nearest-car/awtS": { n: 200, mean: 16.312458302130086, standardError: 0.6646354496012302, lower: 15.001826077747207, upper: 17.623090526512964 },
    "midtown-interfloor/nearest-car/energyKJ": { n: 200, mean: -6438.1850519889, standardError: 144.62952106404362, lower: -6723.388182543144, upper: -6152.981921434657 },
    "midtown-interfloor/nearest-car/ttdMeanS": { n: 200, mean: 36.2102414278267, standardError: 1.2410549091614054, lower: 33.76293507793005, upper: 38.65754777772335 },
    "midtown-interfloor/nearest-car/wt95S": { n: 200, mean: 58.49647234866231, standardError: 2.349201694425694, lower: 53.86394869357216, upper: 63.128996003752455 },
    "midtown-interfloor/predictive-balanced/awtS": { n: 200, mean: 1.1275365381768987, standardError: 0.10280629151616115, lower: 0.9248069988313471, upper: 1.3302660775224502 },
    "midtown-interfloor/predictive-balanced/energyKJ": { n: 200, mean: 237.54168577353892, standardError: 64.94031722333429, lower: 109.48220223919742, upper: 365.6011693078804 },
    "midtown-interfloor/predictive-balanced/ttdMeanS": { n: 200, mean: 1.1294288942082575, standardError: 0.1458333316897574, lower: 0.841851901412598, upper: 1.417005887003917 },
    "midtown-interfloor/predictive-balanced/wt95S": { n: 200, mean: -0.27831350196548454, standardError: 0.43288221268706084, lower: -1.131938414163931, upper: 0.5753114102329618 },
    "midtown-interfloor/zoned-uppeak/awtS": { n: 200, mean: 0.6658286105829501, standardError: 0.14399469334344284, lower: 0.3818773327068178, upper: 0.9497798884590823 },
    "midtown-interfloor/zoned-uppeak/energyKJ": { n: 200, mean: 4524.744952036589, standardError: 103.5846862346447, lower: 4320.480452131913, upper: 4729.009451941265 },
    "midtown-interfloor/zoned-uppeak/ttdMeanS": { n: 200, mean: 5.133523866201067, standardError: 0.24438980810240707, lower: 4.651597784765086, upper: 5.615449947637048 },
    "midtown-interfloor/zoned-uppeak/wt95S": { n: 200, mean: 3.0355917366385454, standardError: 0.628296285278945, lower: 1.796618765153638, upper: 4.274564708123453 },
    "midtown-up-peak/auction-multi-round/awtS": { n: 81, mean: 1.2440973404136586, standardError: 0.3083625680942847, lower: 0.630436273165142, upper: 1.8577584076621751 },
    "midtown-up-peak/auction-multi-round/energyKJ": { n: 81, mean: 240.05443652128693, standardError: 45.73769649109552, lower: 149.03351976192027, upper: 331.0753532806536 },
    "midtown-up-peak/auction-multi-round/ttdMeanS": { n: 81, mean: -2.6670744210810304, standardError: 0.5425266641743872, lower: -3.746736890509669, upper: -1.5874119516523921 },
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
    "midtown-up-peak/energy-aware/awtS": { n: 81, mean: 0.09841185925340674, standardError: 0.16376023014289298, lower: -0.22748138461017298, upper: 0.42430510311698644 },
    "midtown-up-peak/energy-aware/energyKJ": { n: 81, mean: -61.09839781491172, standardError: 22.412933017188212, lower: -105.70155597544384, upper: -16.495239654379603 },
    "midtown-up-peak/energy-aware/ttdMeanS": { n: 81, mean: 1.1951884865732874, standardError: 0.429003195925793, lower: 0.34144491876011585, upper: 2.0489320543864586 },
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
    "midtown-up-peak/predictive-balanced/awtS": { n: 81, mean: 2.4428521209167644, standardError: 0.34084795562843456, lower: 1.7645430722112612, upper: 3.1211611696222676 },
    "midtown-up-peak/predictive-balanced/energyKJ": { n: 81, mean: 192.16176791304107, standardError: 44.35656365349276, lower: 103.88939309368102, upper: 280.43414273240114 },
    "midtown-up-peak/predictive-balanced/ttdMeanS": { n: 81, mean: 0.10635477557680206, standardError: 0.5741585235615811, lower: -1.0362571001645549, upper: 1.2489666513181588 },
    "midtown-up-peak/predictive-balanced/wt95S": { n: 81, mean: 2.5925435750033103, standardError: 0.3334885378798555, lower: 1.928880234360985, upper: 3.2562069156456355 },
    "midtown-up-peak/zoned-uppeak/awtS": { n: 81, mean: -0.8884871137749035, standardError: 0.5110896404409719, lower: -1.9055879121985646, upper: 0.12861368464875755 },
    "midtown-up-peak/zoned-uppeak/energyKJ": { n: 81, mean: 460.227635340405, standardError: 50.380924989530065, lower: 359.9663993897776, upper: 560.4888712910324 },
    "midtown-up-peak/zoned-uppeak/ttdMeanS": { n: 81, mean: -0.6227080921805443, standardError: 0.7930526779081805, lower: -2.2009332176134917, upper: 0.9555170332524028 },
    "midtown-up-peak/zoned-uppeak/wt95S": { n: 81, mean: 2.563144208665872, standardError: 1.163162576651035, lower: 0.24837691190058608, upper: 4.8779115054311575 },
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
    "mixed-use-up-peak/destination-panel/awtS": { n: 50, mean: 2.087340686247439, standardError: 0.3615708043311786, lower: 1.3607369513946044, upper: 2.813944421100274 },
    "mixed-use-up-peak/destination-panel/energyKJ": { n: 50, mean: 816.709938256749, standardError: 138.67682947503366, lower: 538.0284157801284, upper: 1095.3914607333695 },
    "mixed-use-up-peak/destination-panel/ttdMeanS": { n: 50, mean: -1.8060736107377169, standardError: 0.9390113295375229, lower: -3.693087525960118, upper: 0.08094030448468414 },
    "mixed-use-up-peak/destination-panel/wt95S": { n: 50, mean: 1.9089966800115965, standardError: 1.3222703248274346, lower: -0.7482050215524394, upper: 4.566198381575632 },
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
    "secure-up-peak/auction-multi-round/ttdMeanS": { n: 119, mean: -1.4169834080178287, standardError: 0.26306227107109714, lower: -1.937918323250639, upper: -0.8960484927850184 },
    "secure-up-peak/auction-multi-round/wt95S": { n: 119, mean: 0.42190158617552415, standardError: 0.15373287886424192, lower: 0.11746863235982685, upper: 0.7263345399912214 },
    "secure-up-peak/auction/awtS": { n: 119, mean: 0.26344143295580374, standardError: 0.08160040499977851, lower: 0.1018504154053092, upper: 0.4250324505062983 },
    "secure-up-peak/auction/energyKJ": { n: 119, mean: 77.76983232429383, standardError: 27.035929527618464, lower: 24.231331347452027, upper: 131.30833330113563 },
    "secure-up-peak/auction/ttdMeanS": { n: 119, mean: -0.3577845997360603, standardError: 0.19485659795964771, lower: -0.7436537132632854, upper: 0.02808451379116489 },
    "secure-up-peak/auction/wt95S": { n: 119, mean: 0.06321449977521507, standardError: 0.09135274596284128, lower: -0.11768880794988043, upper: 0.24411780750031056 },
    "secure-up-peak/capacity-aware/awtS": { n: 119, mean: 0.15328763707602364, standardError: 0.07449704779916491, lower: 0.005763200666577345, upper: 0.3008120734854699 },
    "secure-up-peak/capacity-aware/energyKJ": { n: 119, mean: 34.135568829002096, standardError: 23.691943410093007, lower: -12.780929237350072, upper: 81.05206689535427 },
    "secure-up-peak/capacity-aware/ttdMeanS": { n: 119, mean: 0.12937969815481737, standardError: 0.075091495441554, lower: -0.019321906424497742, upper: 0.27808130273413245 },
    "secure-up-peak/capacity-aware/wt95S": { n: 119, mean: 0.06321449977521507, standardError: 0.09135274596284128, lower: -0.11768880794988043, upper: 0.24411780750031056 },
    "secure-up-peak/destination-eta/awtS": { n: 119, mean: 0.10634118751200164, standardError: 0.050980441138234134, lower: 0.005386034670263828, upper: 0.20729634035373945 },
    "secure-up-peak/destination-eta/energyKJ": { n: 119, mean: 24.340343069793075, standardError: 14.927910901182683, lower: -5.22098462743805, upper: 53.9016707670242 },
    "secure-up-peak/destination-eta/ttdMeanS": { n: 119, mean: -0.05488792710884287, standardError: 0.08533943202203224, lower: -0.22388323611078814, upper: 0.11410738189310239 },
    "secure-up-peak/destination-eta/wt95S": { n: 119, mean: 0.029774656026017435, standardError: 0.02169874257014399, lower: -0.013194761729756178, upper: 0.07274407378179104 },
    "secure-up-peak/destination-panel/awtS": { n: 119, mean: 0.2372781229542703, standardError: 0.07012411114626688, lower: 0.09841329164638651, upper: 0.3761429542621541 },
    "secure-up-peak/destination-panel/energyKJ": { n: 119, mean: 119.390814588041, standardError: 29.45786731450988, lower: 61.056217422352596, upper: 177.7254117537294 },
    "secure-up-peak/destination-panel/ttdMeanS": { n: 119, mean: -0.6147743792957063, standardError: 0.1844722795521651, lower: -0.9800797152529795, upper: -0.24946904333843312 },
    "secure-up-peak/destination-panel/wt95S": { n: 119, mean: 0.11202362893861326, standardError: 0.07422709485751457, lower: -0.03496622715187325, upper: 0.25901348502909977 },
    "secure-up-peak/energy-aware/awtS": { n: 119, mean: -0.05830293519214359, standardError: 0.06302840100809483, lower: -0.1831163286245206, upper: 0.06651045824023341 },
    "secure-up-peak/energy-aware/energyKJ": { n: 119, mean: -99.36305259883017, standardError: 27.773439515842096, lower: -154.36202413891283, upper: -44.36408105874749 },
    "secure-up-peak/energy-aware/ttdMeanS": { n: 119, mean: 0.7926348406080271, standardError: 0.12706092794246476, lower: 0.541019611036695, upper: 1.0442500701793591 },
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
    "secure-up-peak/nearest-car/wt95S": { n: 119, mean: 18.65214313125348, standardError: 1.6549361902606852, lower: 15.37491891936276, upper: 21.929367343144204 },
    "secure-up-peak/predictive-balanced/awtS": { n: 119, mean: 1.7656648175262264, standardError: 0.14177248291007324, lower: 1.4849167039088857, upper: 2.0464129311435673 },
    "secure-up-peak/predictive-balanced/energyKJ": { n: 119, mean: 168.48586908044754, standardError: 52.37274529859218, lower: 64.77357494740544, upper: 272.19816321348964 },
    "secure-up-peak/predictive-balanced/ttdMeanS": { n: 119, mean: 0.7291451060234017, standardError: 0.2977999953811723, lower: 0.13942003933645541, upper: 1.3188701727103478 },
    "secure-up-peak/predictive-balanced/wt95S": { n: 119, mean: 1.7885271788329107, standardError: 0.1454998876339214, lower: 1.5003977890791247, upper: 2.0766565685866967 },
    "secure-up-peak/zoned-uppeak/awtS": { n: 119, mean: 6.9328452331211805, standardError: 0.5536610381800587, lower: 5.836445643709562, upper: 8.029244822532798 },
    "secure-up-peak/zoned-uppeak/energyKJ": { n: 119, mean: -189.9670565509377, standardError: 104.78988029754012, lower: -397.47954850879, upper: 17.545435406914578 },
    "secure-up-peak/zoned-uppeak/ttdMeanS": { n: 119, mean: 9.178842327744611, standardError: 0.6919008822353759, lower: 7.80869021140643, upper: 10.548994444082794 },
    "secure-up-peak/zoned-uppeak/wt95S": { n: 119, mean: 26.859935943816907, standardError: 1.5412112931592503, lower: 23.807917989707576, upper: 29.91195389792624 },
    "vertical-city-up-peak/auction-multi-round/awtS": { n: 50, mean: 2.9434575030349803, standardError: 0.2484054014352795, lower: 2.444268159541497, upper: 3.4426468465284636 },
    "vertical-city-up-peak/auction-multi-round/energyKJ": { n: 50, mean: -178.34138073745228, standardError: 722.1986505612235, lower: -1629.6539051934328, upper: 1272.9711437185283 },
    "vertical-city-up-peak/auction-multi-round/ttdMeanS": { n: 50, mean: 2.6578218355888383, standardError: 0.5790619956617076, lower: 1.4941531883444372, upper: 3.8214904828332394 },
    "vertical-city-up-peak/auction-multi-round/wt95S": { n: 50, mean: 3.8542446474278513, standardError: 0.5941314820535605, lower: 2.660292733494127, upper: 5.048196561361576 },
    "vertical-city-up-peak/auction/awtS": { n: 50, mean: 1.4752469831094082, standardError: 0.17571828788867563, lower: 1.1221278630575806, upper: 1.8283661031612357 },
    "vertical-city-up-peak/auction/energyKJ": { n: 50, mean: -3712.2172082120915, standardError: 592.2862167441893, lower: -4902.46092267417, upper: -2521.9734937500125 },
    "vertical-city-up-peak/auction/ttdMeanS": { n: 50, mean: 4.311877355379722, standardError: 0.44096852482795923, lower: 3.425717927532049, upper: 5.198036783227395 },
    "vertical-city-up-peak/auction/wt95S": { n: 50, mean: 1.8272493983986644, standardError: 0.49129164045454254, lower: 0.8399618835326187, upper: 2.81453691326471 },
    "vertical-city-up-peak/capacity-aware/awtS": { n: 50, mean: 1.4238249858424175, standardError: 0.1840700005200321, lower: 1.0539224708989965, upper: 1.7937275007858384 },
    "vertical-city-up-peak/capacity-aware/energyKJ": { n: 50, mean: -3853.8776149751184, standardError: 591.0788204278095, lower: -5041.6949756983995, upper: -2666.0602542518373 },
    "vertical-city-up-peak/capacity-aware/ttdMeanS": { n: 50, mean: 4.677013256171921, standardError: 0.40871009906922146, lower: 3.855679561917779, upper: 5.498346950426062 },
    "vertical-city-up-peak/capacity-aware/wt95S": { n: 50, mean: 1.739206106926016, standardError: 0.4813511528414607, lower: 0.7718947498122095, upper: 2.7065174640398224 },
    "vertical-city-up-peak/destination-eta/awtS": { n: 50, mean: 0.9489100459197006, standardError: 0.19455819443926722, lower: 0.5579307161939754, upper: 1.3398893756454258 },
    "vertical-city-up-peak/destination-eta/energyKJ": { n: 50, mean: -4031.442119240848, standardError: 592.4057106803748, lower: -5221.925965758072, upper: -2840.958272723624 },
    "vertical-city-up-peak/destination-eta/ttdMeanS": { n: 50, mean: 3.966242525977153, standardError: 0.36716877925926084, lower: 3.2283892393307743, upper: 4.704095812623532 },
    "vertical-city-up-peak/destination-eta/wt95S": { n: 50, mean: 0.9691448992131808, standardError: 0.42689958759931396, lower: 0.11125805923291898, upper: 1.8270317391934427 },
    "vertical-city-up-peak/destination-panel/awtS": { n: 50, mean: 2.381605998125347, standardError: 0.483598490584666, lower: 1.409778446733329, upper: 3.353433549517365 },
    "vertical-city-up-peak/destination-panel/energyKJ": { n: 50, mean: -4242.475579763424, standardError: 608.2026803617919, lower: -5464.7046253741055, upper: -3020.246534152743 },
    "vertical-city-up-peak/destination-panel/ttdMeanS": { n: 50, mean: 6.356129658568107, standardError: 0.9965843622743025, lower: 4.353418402431443, upper: 8.358840914704771 },
    "vertical-city-up-peak/destination-panel/wt95S": { n: 50, mean: 7.808709289764289, standardError: 3.1596844080158766, lower: 1.4590857462722537, upper: 14.158332833256324 },
    "vertical-city-up-peak/energy-aware/awtS": { n: 50, mean: 0.5577060579215707, standardError: 0.16227900508491824, lower: 0.23159418779695062, upper: 0.8838179280461907 },
    "vertical-city-up-peak/energy-aware/energyKJ": { n: 50, mean: -4543.331333911135, standardError: 533.8417166340084, lower: -5616.126428205397, upper: -3470.536239616872 },
    "vertical-city-up-peak/energy-aware/ttdMeanS": { n: 50, mean: 3.626282843456232, standardError: 0.43297376961265455, lower: 2.7561894777161453, upper: 4.496376209196319 },
    "vertical-city-up-peak/energy-aware/wt95S": { n: 50, mean: 0.9232967275686994, standardError: 0.5385540633504652, lower: -0.15896818199572205, upper: 2.0055616371331206 },
    "vertical-city-up-peak/eta/awtS": { n: 50, mean: 0.5813393961132709, standardError: 0.1494880782705788, lower: 0.2809318557746796, upper: 0.8817469364518622 },
    "vertical-city-up-peak/eta/energyKJ": { n: 50, mean: -4179.881407562138, standardError: 462.2337991649607, lower: -5108.775004128209, upper: -3250.987810996067 },
    "vertical-city-up-peak/eta/ttdMeanS": { n: 50, mean: 3.1918490409481457, standardError: 0.3569681118908805, lower: 2.4744947628474563, upper: 3.909203319048835 },
    "vertical-city-up-peak/eta/wt95S": { n: 50, mean: 0.7320199613977908, standardError: 0.39145432552283876, lower: -0.054636957640030626, upper: 1.518676880435612 },
    "vertical-city-up-peak/fairness-first/awtS": { n: 50, mean: 0.5813393961132709, standardError: 0.1494880782705788, lower: 0.2809318557746796, upper: 0.8817469364518622 },
    "vertical-city-up-peak/fairness-first/energyKJ": { n: 50, mean: -4179.881407562138, standardError: 462.2337991649607, lower: -5108.775004128209, upper: -3250.987810996067 },
    "vertical-city-up-peak/fairness-first/ttdMeanS": { n: 50, mean: 3.1918490409481457, standardError: 0.3569681118908805, lower: 2.4744947628474563, upper: 3.909203319048835 },
    "vertical-city-up-peak/fairness-first/wt95S": { n: 50, mean: 0.7320199613977908, standardError: 0.39145432552283876, lower: -0.054636957640030626, upper: 1.518676880435612 },
    "vertical-city-up-peak/nearest-car/awtS": { n: 50, mean: 2.3086178768487993, standardError: 0.2893632025798604, lower: 1.727120750407903, upper: 2.8901150032896954 },
    "vertical-city-up-peak/nearest-car/energyKJ": { n: 50, mean: -5738.135367672687, standardError: 496.450278195303, lower: -6735.789553199885, upper: -4740.481182145489 },
    "vertical-city-up-peak/nearest-car/ttdMeanS": { n: 50, mean: 6.948485290532745, standardError: 0.6043503224372074, lower: 5.733997848011867, upper: 8.162972733053623 },
    "vertical-city-up-peak/nearest-car/wt95S": { n: 50, mean: 8.237874002811303, standardError: 1.2990079954929814, lower: 5.627419702235729, upper: 10.848328303386877 },
    "vertical-city-up-peak/predictive-balanced/awtS": { n: 50, mean: 3.119555122999973, standardError: 0.2776447394316925, lower: 2.5616071299188463, upper: 3.6775031160810996 },
    "vertical-city-up-peak/predictive-balanced/energyKJ": { n: 50, mean: 3562.920618175939, standardError: 751.0749100928009, lower: 2053.579077624384, upper: 5072.262158727494 },
    "vertical-city-up-peak/predictive-balanced/ttdMeanS": { n: 50, mean: 2.2312702986124604, standardError: 0.6587419612936626, lower: 0.9074787655387744, upper: 3.5550618316861464 },
    "vertical-city-up-peak/predictive-balanced/wt95S": { n: 50, mean: 3.8361958512224783, standardError: 0.4990471327584581, lower: 2.8333230910707377, upper: 4.839068611374219 },
    "vertical-city-up-peak/zoned-uppeak/awtS": { n: 50, mean: 7.924645200319025, standardError: 0.4335375764645167, lower: 7.053418822290912, upper: 8.795871578347137 },
    "vertical-city-up-peak/zoned-uppeak/energyKJ": { n: 50, mean: 4384.797283023424, standardError: 811.8885506631655, lower: 2753.246156301986, upper: 6016.348409744862 },
    "vertical-city-up-peak/zoned-uppeak/ttdMeanS": { n: 50, mean: 14.726632844366193, standardError: 1.06822218182803, lower: 12.579960000012427, upper: 16.87330568871996 },
    "vertical-city-up-peak/zoned-uppeak/wt95S": { n: 50, mean: 27.63510288973194, standardError: 1.3934910839404033, lower: 24.834777714284936, upper: 30.435428065178943 },
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
    "tuning/c-deadband-2.582/wt95": { n: 150, mean: -1.2122331984079746, standardError: 0.47063941869670056, lower: -2.142222891692628, upper: -0.2822435051233211 },
    "tuning/c-deadband-2/awt": { n: 150, mean: -1.160948108361723, standardError: 0.3488492519745968, lower: -1.850278827290538, upper: -0.4716173894329081 },
    "tuning/c-deadband-2/energy": { n: 150, mean: 111.14840015294203, standardError: 6.959168931084213, lower: 97.39699063935453, upper: 124.89980966652953 },
    "tuning/c-deadband-2/wt95": { n: 150, mean: -1.937945625719168, standardError: 0.47428959481954364, lower: -2.875148115123446, upper: -1.0007431363148902 },
    "tuning/c-deadband-5/awt": { n: 150, mean: -0.20167198775332107, standardError: 0.11276274544656249, lower: -0.4244926587081386, upper: 0.021148683201496488 },
    "tuning/c-deadband-5/energy": { n: 150, mean: 22.147855295391878, standardError: 3.2378310119530407, lower: 15.749858548641992, upper: 28.545852042141764 },
    "tuning/c-deadband-5/wt95": { n: 150, mean: -0.031590586893587375, standardError: 0.13032286311845745, lower: -0.2891102817698419, upper: 0.22592910798266716 },
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
    "gate/stopCount@0.5/awtS": { n: 200, mean: 1.2668976208714908, standardError: 0.16602869782325808, lower: 0.9394962436653136, upper: 1.594298998077668 },
    "gate/stopCount@0.5/energyKJ": { n: 200, mean: -1.3818077281997079, standardError: 1.2033995801944743, lower: -3.7548594057140625, upper: 0.9912439493146468 },
    "gate/stopCount@0.5/ttdMeanS": { n: 200, mean: 1.3589284430076558, standardError: 0.17600465929324063, lower: 1.0118549032955428, upper: 1.7060019827197688 },
    "gate/stopCount@0.5/wt95S": { n: 200, mean: 3.9120822523378758, standardError: 0.5803615863330468, lower: 2.767634424136072, upper: 5.056530080539679 },
    "gate/stopCount@1/awtS": { n: 200, mean: 1.3204998781277697, standardError: 0.16854555354789108, lower: 0.9881353708044648, upper: 1.6528643854510747 },
    "gate/stopCount@1/energyKJ": { n: 200, mean: -1.5356908028975014, standardError: 1.1925248448108798, lower: -3.88729797480517, upper: 0.8159163690101676 },
    "gate/stopCount@1/ttdMeanS": { n: 200, mean: 1.418521346522438, standardError: 0.17815664250366378, lower: 1.067204189435411, upper: 1.769838503609465 },
    "gate/stopCount@1/wt95S": { n: 200, mean: 4.05957563541762, standardError: 0.5886815615502881, lower: 2.898721177638164, upper: 5.220430093197075 },
    "gate/stopCount@2/awtS": { n: 200, mean: 1.3204998781277697, standardError: 0.16854555354789108, lower: 0.9881353708044648, upper: 1.6528643854510747 },
    "gate/stopCount@2/energyKJ": { n: 200, mean: -1.5356908028975014, standardError: 1.1925248448108798, lower: -3.88729797480517, upper: 0.8159163690101676 },
    "gate/stopCount@2/ttdMeanS": { n: 200, mean: 1.418521346522438, standardError: 0.17815664250366378, lower: 1.067204189435411, upper: 1.769838503609465 },
    "gate/stopCount@2/wt95S": { n: 200, mean: 4.05957563541762, standardError: 0.5886815615502881, lower: 2.898721177638164, upper: 5.220430093197075 },
    "gate/stopCount@8/awtS": { n: 200, mean: 1.3204998781277697, standardError: 0.16854555354789108, lower: 0.9881353708044648, upper: 1.6528643854510747 },
    "gate/stopCount@8/energyKJ": { n: 200, mean: -1.5356908028975014, standardError: 1.1925248448108798, lower: -3.88729797480517, upper: 0.8159163690101676 },
    "gate/stopCount@8/ttdMeanS": { n: 200, mean: 1.418521346522438, standardError: 0.17815664250366378, lower: 1.067204189435411, upper: 1.769838503609465 },
    "gate/stopCount@8/wt95S": { n: 200, mean: 4.05957563541762, standardError: 0.5886815615502881, lower: 2.898721177638164, upper: 5.220430093197075 },
  }),
  "weight-set-selection": Object.freeze({
    "fuzzy/cost/awtS": { n: 200, mean: 0.1900441085435473, standardError: 0.07676382069184245, lower: 0.03866918996849733, upper: 0.3414190271185973 },
    "fuzzy/cost/energyKJ": { n: 200, mean: 230.43131020986922, standardError: 44.32688182786899, lower: 143.02062550312706, upper: 317.8419949166114 },
    "fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 2.6133783401268187, standardError: 0.4915906966308055, lower: 1.6439828488124038, upper: 3.5827738314412336 },
    "fuzzy/cost/wt95S": { n: 200, mean: 0.6783957225292356, standardError: 0.30317334716635613, lower: 0.08055105654181871, upper: 1.2762403885166527 },
    "fuzzy/gate/ttdMeanS": { n: 200, mean: -0.21046926425897497, standardError: 0.09819082575512827, lower: -0.40409730569228774, upper: -0.016841222825662222 },
    "learned/cost/awtS": { n: 200, mean: 0.43257801074926305, standardError: 0.08334430405903342, lower: 0.26822666493394076, upper: 0.5969293565645853 },
    "learned/cost/energyKJ": { n: 200, mean: 417.34201206164903, standardError: 51.338256261770255, lower: 316.10520165577555, upper: 518.5788224675225 },
    "learned/cost/energyPerServedLegKJ": { n: 200, mean: 4.80132562225493, standardError: 0.5924590230788237, lower: 3.633022174493619, upper: 5.96962907001624 },
    "learned/cost/wt95S": { n: 200, mean: 0.7753972654560795, standardError: 0.38188339567065677, lower: 0.022339804222230808, upper: 1.5284547266899282 },
    "learned/gate/ttdMeanS": { n: 200, mean: -0.22228901717063684, standardError: 0.11090546893136308, lower: -0.44098978242315223, upper: -0.0035882519181214545 },
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
    "midtown-down-peak-1pct/fuzzy/cost/awtS": { n: 200, mean: -1.5586333735833058, standardError: 0.2094644588600445, lower: -1.9716881840205311, upper: -1.1455785631460804 },
    "midtown-down-peak-1pct/fuzzy/cost/energyKJ": { n: 200, mean: 374.77448024334836, standardError: 40.805714605116385, lower: 294.3073842849181, upper: 455.2415762017786 },
    "midtown-down-peak-1pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 21.56374141385832, standardError: 2.4428901210727676, lower: 16.74646825272082, upper: 26.38101457499582 },
    "midtown-down-peak-1pct/fuzzy/cost/wt95S": { n: 200, mean: -7.120676728296931, standardError: 0.7380088956456583, lower: -8.575998199781425, upper: -5.665355256812436 },
    "midtown-down-peak-1pct/fuzzy/gate/ttdMeanS": { n: 200, mean: -2.120811960471578, standardError: 0.30447648003055033, lower: -2.7212263478385723, upper: -1.5203975731045838 },
    "midtown-down-peak-1pct/learned/cost/awtS": { n: 200, mean: -1.5779017218188292, standardError: 0.20866870779344115, lower: -1.9893873457326707, upper: -1.1664160979049876 },
    "midtown-down-peak-1pct/learned/cost/energyKJ": { n: 200, mean: 362.02634369513703, standardError: 40.917561495991635, lower: 281.3386905282911, upper: 442.71399686198293 },
    "midtown-down-peak-1pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 20.705172262125874, standardError: 2.4454526931463616, lower: 15.882845820217733, upper: 25.527498704034016 },
    "midtown-down-peak-1pct/learned/cost/wt95S": { n: 200, mean: -7.154337651542963, standardError: 0.7365690330502783, lower: -8.606819776559675, upper: -5.70185552652625 },
    "midtown-down-peak-1pct/learned/gate/ttdMeanS": { n: 200, mean: -2.129867346733331, standardError: 0.3045004712763231, lower: -2.7303290437944314, upper: -1.5294056496722304 },
    "midtown-hotel-1.5pct/fuzzy/cost/awtS": { n: 200, mean: 0.3511392691099698, standardError: 0.07699949583640311, lower: 0.19929960939128594, upper: 0.5029789288286537 },
    "midtown-hotel-1.5pct/fuzzy/cost/energyKJ": { n: 200, mean: 302.9531174110036, standardError: 38.29669461137712, lower: 227.43369984888608, upper: 378.47253497312107 },
    "midtown-hotel-1.5pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 3.3392787078081283, standardError: 0.44044170614590317, lower: 2.470746803012289, upper: 4.207810612603968 },
    "midtown-hotel-1.5pct/fuzzy/cost/wt95S": { n: 200, mean: 0.9587623969332979, standardError: 0.37736003111037986, lower: 0.214624814046124, upper: 1.7028999798204718 },
    "midtown-hotel-1.5pct/fuzzy/gate/ttdMeanS": { n: 200, mean: -0.09866137527878724, standardError: 0.0952052049787861, lower: -0.2864019022835379, upper: 0.08907915172596342 },
    "midtown-hotel-1.5pct/learned/cost/awtS": { n: 200, mean: 0.23532867662433624, standardError: 0.08229391446230168, lower: 0.07304865344830314, upper: 0.39760869980036934 },
    "midtown-hotel-1.5pct/learned/cost/energyKJ": { n: 200, mean: 282.2200418752843, standardError: 39.03474999929024, lower: 205.24521116095124, upper: 359.1948725896174 },
    "midtown-hotel-1.5pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 3.10119611520342, standardError: 0.44477250417202113, lower: 2.224124064898145, upper: 3.978268165508695 },
    "midtown-hotel-1.5pct/learned/cost/wt95S": { n: 200, mean: 0.3238450537912918, standardError: 0.404575643959105, lower: -0.4739605349587489, upper: 1.1216506425413324 },
    "midtown-hotel-1.5pct/learned/gate/ttdMeanS": { n: 200, mean: -0.1892404761237823, standardError: 0.10114989528548435, lower: -0.3887036740823768, upper: 0.010222721834812182 },
    "midtown-interfloor-1.0pct/fuzzy/cost/awtS": { n: 200, mean: 0.14669362108319287, standardError: 0.04474398588716328, lower: 0.05846042529709135, upper: 0.2349268168692944 },
    "midtown-interfloor-1.0pct/fuzzy/cost/energyKJ": { n: 200, mean: 146.1390499992873, standardError: 28.567929616224806, lower: 89.80433423684816, upper: 202.47376576172644 },
    "midtown-interfloor-1.0pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 2.404452193585284, standardError: 0.49220960718238965, lower: 1.433836237558366, upper: 3.3750681496122015 },
    "midtown-interfloor-1.0pct/fuzzy/cost/wt95S": { n: 200, mean: 0.29064000977304166, standardError: 0.21489745268829502, lower: -0.1331284283986819, upper: 0.7144084479447652 },
    "midtown-interfloor-1.0pct/fuzzy/gate/ttdMeanS": { n: 200, mean: -0.13719996643652682, standardError: 0.06646752120008882, lower: -0.26827102984723683, upper: -0.00612890302581684 },
    "midtown-interfloor-1.0pct/learned/cost/awtS": { n: 200, mean: 0.21125682482730876, standardError: 0.04906784959462375, lower: 0.11449715770682775, upper: 0.3080164919477898 },
    "midtown-interfloor-1.0pct/learned/cost/energyKJ": { n: 200, mean: 223.90401442016847, standardError: 32.50894154611285, lower: 159.79779439161223, upper: 288.0102344487247 },
    "midtown-interfloor-1.0pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 3.743808890886852, standardError: 0.5623983415789086, lower: 2.6347838007339677, upper: 4.852833981039736 },
    "midtown-interfloor-1.0pct/learned/cost/wt95S": { n: 200, mean: 0.2968718486460149, standardError: 0.24232617381514562, lower: -0.1809848356522591, upper: 0.7747285329442889 },
    "midtown-interfloor-1.0pct/learned/gate/ttdMeanS": { n: 200, mean: -0.2648280414795634, standardError: 0.08306130130823354, lower: -0.4286213181684046, upper: -0.10103476479072221 },
    "midtown-interfloor-2.0pct/fuzzy/cost/awtS": { n: 200, mean: 0.8132261191366148, standardError: 0.1374568185406351, lower: 0.5421672462633782, upper: 1.0842849920098514 },
    "midtown-interfloor-2.0pct/fuzzy/cost/energyKJ": { n: 200, mean: 384.5607525917075, standardError: 76.30977774337939, lower: 234.0811869802507, upper: 535.0403182031644 },
    "midtown-interfloor-2.0pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 3.2916744748466846, standardError: 0.6308479589891928, lower: 2.047669713690059, upper: 4.53567923600331 },
    "midtown-interfloor-2.0pct/fuzzy/cost/wt95S": { n: 200, mean: 2.899561119399926, standardError: 0.5892868090728832, lower: 1.7375131398073966, upper: 4.061609098992455 },
    "midtown-interfloor-2.0pct/fuzzy/gate/ttdMeanS": { n: 200, mean: 0.691883929145201, standardError: 0.20882053038759962, lower: 0.28009891767324346, upper: 1.1036689406171587 },
    "midtown-interfloor-2.0pct/learned/cost/awtS": { n: 200, mean: 1.5886335220301127, standardError: 0.14556237877570102, lower: 1.3015908366065108, upper: 1.8756762074537146 },
    "midtown-interfloor-2.0pct/learned/cost/energyKJ": { n: 200, mean: 1127.0498788409488, standardError: 76.4082860874855, lower: 976.3760590556685, upper: 1277.7236986262292 },
    "midtown-interfloor-2.0pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 9.453484961917024, standardError: 0.6478414198510809, lower: 8.175969834404311, upper: 10.731000089429736 },
    "midtown-interfloor-2.0pct/learned/cost/wt95S": { n: 200, mean: 4.468618788593956, standardError: 0.5516881331687422, lower: 3.3807137640057996, upper: 5.556523813182112 },
    "midtown-interfloor-2.0pct/learned/gate/ttdMeanS": { n: 200, mean: -0.17818308033427915, standardError: 0.22238893674845012, lower: -0.6167243995245835, upper: 0.2603582388560252 },
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
    "vertical-city-up-peak-1pct/fuzzy/cost/awtS": { n: 200, mean: 0.24940584604284247, standardError: 0.05170914170851809, lower: 0.14743766565308686, upper: 0.3513740264325981 },
    "vertical-city-up-peak-1pct/fuzzy/cost/energyKJ": { n: 200, mean: 906.525968277962, standardError: 212.73355147416342, lower: 487.02464926655966, upper: 1326.0272872893643 },
    "vertical-city-up-peak-1pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 12.96961225922361, standardError: 2.5733306089863643, lower: 7.895116124309495, upper: 18.044108394137723 },
    "vertical-city-up-peak-1pct/fuzzy/cost/wt95S": { n: 200, mean: 0.22554156104069342, standardError: 0.09440655124632798, lower: 0.039375944490254666, upper: 0.4117071775911322 },
    "vertical-city-up-peak-1pct/fuzzy/gate/ttdMeanS": { n: 200, mean: -0.0548098957953686, standardError: 0.18864995622525418, lower: -0.42681941154657294, upper: 0.31719961995583573 },
    "vertical-city-up-peak-1pct/learned/cost/awtS": { n: 200, mean: 0.003676429314489358, standardError: 0.0063942560591488925, lower: -0.008932765766970984, upper: 0.0162856243959497 },
    "vertical-city-up-peak-1pct/learned/cost/energyKJ": { n: 200, mean: 97.35257081588279, standardError: 41.67853071391758, lower: 15.164319419773634, upper: 179.54082221199195 },
    "vertical-city-up-peak-1pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 1.0674372467319266, standardError: 0.5057824906806931, lower: 0.07005615426616207, upper: 2.064818339197691 },
    "vertical-city-up-peak-1pct/learned/cost/wt95S": { n: 200, mean: -0.016422814414906207, standardError: 0.02443271050581564, lower: -0.0646030577906589, upper: 0.03175742896084649 },
    "vertical-city-up-peak-1pct/learned/gate/ttdMeanS": { n: 200, mean: -0.12820332829163725, standardError: 0.05274017292007448, lower: -0.23220465742634933, upper: -0.02420199915692517 },
  }),
  "lunch-two-way-selection": Object.freeze({
    "midtown-lunch-two-way-1.5pct-flat/fuzzy/cost/awtS": { n: 200, mean: 0.28799797405047284, standardError: 0.06765223016307716, lower: 0.15459071604716426, upper: 0.42140523205378144 },
    "midtown-lunch-two-way-1.5pct-flat/fuzzy/cost/energyKJ": { n: 200, mean: 428.0927690948133, standardError: 52.62105104230971, lower: 324.32634312652306, upper: 531.8591950631036 },
    "midtown-lunch-two-way-1.5pct-flat/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 4.791923005857866, standardError: 0.576089430832346, lower: 3.65589968265373, upper: 5.927946329062001 },
    "midtown-lunch-two-way-1.5pct-flat/fuzzy/cost/wt95S": { n: 200, mean: 1.3495784953416894, standardError: 0.269671282467747, lower: 0.8177984450826418, upper: 1.8813585456007371 },
    "midtown-lunch-two-way-1.5pct-flat/fuzzy/gate/ttdMeanS": { n: 200, mean: -0.05659692813671828, standardError: 0.11471158090657838, lower: -0.2828031808069146, upper: 0.16960932453347805 },
    "midtown-lunch-two-way-1.5pct-flat/learned/cost/awtS": { n: 200, mean: 0.34413921007097975, standardError: 0.07941972761997286, lower: 0.18752695844807934, upper: 0.5007514616938802 },
    "midtown-lunch-two-way-1.5pct-flat/learned/cost/energyKJ": { n: 200, mean: 764.9700650281864, standardError: 56.185357422897376, lower: 654.1749817669778, upper: 875.7651482893949 },
    "midtown-lunch-two-way-1.5pct-flat/learned/cost/energyPerServedLegKJ": { n: 200, mean: 8.672656145524003, standardError: 0.6340045878979484, lower: 7.422426649332983, upper: 9.922885641715023 },
    "midtown-lunch-two-way-1.5pct-flat/learned/cost/wt95S": { n: 200, mean: 1.4446243426398295, standardError: 0.30757832765844956, lower: 0.8380932465437275, upper: 2.0511554387359316 },
    "midtown-lunch-two-way-1.5pct-flat/learned/gate/ttdMeanS": { n: 200, mean: -0.592160806439453, standardError: 0.12964736247637704, lower: -0.8478197713197291, upper: -0.3365018415591769 },
    "midtown-lunch-two-way-1.5pct/fuzzy/cost/awtS": { n: 200, mean: 0.24388281730958228, standardError: 0.06514049350979931, lower: 0.11542859483714205, upper: 0.3723370397820225 },
    "midtown-lunch-two-way-1.5pct/fuzzy/cost/energyKJ": { n: 200, mean: 142.7951244488041, standardError: 47.413274908995426, lower: 49.29820670760121, upper: 236.292042190007 },
    "midtown-lunch-two-way-1.5pct/fuzzy/cost/energyPerServedLegKJ": { n: 200, mean: 1.3013852890522033, standardError: 0.5265064450974006, lower: 0.26313745905163644, upper: 2.3396331190527704 },
    "midtown-lunch-two-way-1.5pct/fuzzy/cost/wt95S": { n: 200, mean: 0.8383473507436631, standardError: 0.21079246202566304, lower: 0.4226737757732092, upper: 1.254020925714117 },
    "midtown-lunch-two-way-1.5pct/fuzzy/gate/ttdMeanS": { n: 200, mean: 0.17159980574704284, standardError: 0.10886171817061675, lower: -0.04307077181799923, upper: 0.3862703833120849 },
    "midtown-lunch-two-way-1.5pct/learned/cost/awtS": { n: 200, mean: 0.266079852167891, standardError: 0.0705237313219064, lower: 0.12701011866260248, upper: 0.4051495856731795 },
    "midtown-lunch-two-way-1.5pct/learned/cost/energyKJ": { n: 200, mean: 412.73133819477806, standardError: 51.659427994994736, lower: 310.8611910877439, upper: 514.6014853018122 },
    "midtown-lunch-two-way-1.5pct/learned/cost/energyPerServedLegKJ": { n: 200, mean: 4.411776475521444, standardError: 0.5811917470551315, lower: 3.2656916064509445, upper: 5.557861344591943 },
    "midtown-lunch-two-way-1.5pct/learned/cost/wt95S": { n: 200, mean: 0.8063907802573793, standardError: 0.23473197952703, lower: 0.3435095170838745, upper: 1.2692720434308842 },
    "midtown-lunch-two-way-1.5pct/learned/gate/ttdMeanS": { n: 200, mean: -0.16345723248481506, standardError: 0.11813944191524613, lower: -0.39642307810383925, upper: 0.06950861313420917 },
  }),
  "landing-panel-deployment": Object.freeze({
    "mixed-1.5pct/entrance-full/awtS": { n: 200, mean: -0.49753790416534727, standardError: 0.08307154404647096, lower: -0.6613513790888867, upper: -0.33372442924180773 },
    "mixed-1.5pct/entrance-full/energyPerServedLegKJ": { n: 200, mean: -4.003483148411619, standardError: 0.5069381496871915, lower: -5.003143150218172, upper: -3.0038231466050664 },
    "mixed-1.5pct/entrance-full/ttdMeanS": { n: 200, mean: 1.2940765800005307, standardError: 0.15235092375923212, lower: 0.9936471788707069, upper: 1.5945059811303546 },
    "mixed-1.5pct/entrance-full/wt95S": { n: 200, mean: -1.0654455813497803, standardError: 0.2992562423609647, lower: -1.6555658868816854, upper: -0.4753252758178752 },
    "mixed-1.5pct/entrance-none/awtS": { n: 200, mean: -0.03271618543063606, standardError: 0.06168115025990955, lower: -0.15434873334264293, upper: 0.08891636248137079 },
    "mixed-1.5pct/entrance-none/energyPerServedLegKJ": { n: 200, mean: 0.7860287016304625, standardError: 0.3892743152065617, lower: 0.018396668249747727, upper: 1.553660735011177 },
    "mixed-1.5pct/entrance-none/ttdMeanS": { n: 200, mean: -0.3179772593057198, standardError: 0.10479377730389977, lower: -0.52462603425701, upper: -0.11132848435442957 },
    "mixed-1.5pct/entrance-none/wt95S": { n: 200, mean: -0.08615850931650333, standardError: 0.2733279305523002, lower: -0.6251493106959115, upper: 0.4528322920629048 },
    "mixed-1.5pct/full-none/awtS": { n: 200, mean: 0.4648217187347112, standardError: 0.08159835161455566, lower: 0.3039133152682293, upper: 0.6257301222011931 },
    "mixed-1.5pct/full-none/energyPerServedLegKJ": { n: 200, mean: 4.789511850042078, standardError: 0.5249856722317819, lower: 3.754262918046188, upper: 5.824760782037967 },
    "mixed-1.5pct/full-none/ttdMeanS": { n: 200, mean: -1.6120538393062507, standardError: 0.14799319206204395, lower: -1.9038899828977107, upper: -1.3202176957147906 },
    "mixed-1.5pct/full-none/wt95S": { n: 200, mean: 0.9792870720332775, standardError: 0.31723749330790657, lower: 0.35370852102271655, upper: 1.6048656230438385 },
    "up-peak-1pct/entrance-full/awtS": { n: 200, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "up-peak-1pct/entrance-full/energyPerServedLegKJ": { n: 200, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "up-peak-1pct/entrance-full/ttdMeanS": { n: 200, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "up-peak-1pct/entrance-full/wt95S": { n: 200, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "up-peak-1pct/entrance-none/awtS": { n: 200, mean: 0.48992188790032853, standardError: 0.12160272460166999, lower: 0.25012659932321685, upper: 0.7297171764774402 },
    "up-peak-1pct/entrance-none/energyPerServedLegKJ": { n: 200, mean: 3.1593731676044037, standardError: 0.7734545622516775, lower: 1.634154381890802, upper: 4.684591953318005 },
    "up-peak-1pct/entrance-none/ttdMeanS": { n: 200, mean: -0.15161267388860775, standardError: 0.20725708155171424, lower: -0.5603146321970383, upper: 0.2570892844198228 },
    "up-peak-1pct/entrance-none/wt95S": { n: 200, mean: 0.14685739389811597, standardError: 0.12214966975705784, lower: -0.09401644675750961, upper: 0.3877312345537416 },
    "up-peak-1pct/full-none/awtS": { n: 200, mean: 0.48992188790032853, standardError: 0.12160272460166999, lower: 0.25012659932321685, upper: 0.7297171764774402 },
    "up-peak-1pct/full-none/energyPerServedLegKJ": { n: 200, mean: 3.1593731676044037, standardError: 0.7734545622516775, lower: 1.634154381890802, upper: 4.684591953318005 },
    "up-peak-1pct/full-none/ttdMeanS": { n: 200, mean: -0.15161267388860775, standardError: 0.20725708155171424, lower: -0.5603146321970383, upper: 0.2570892844198228 },
    "up-peak-1pct/full-none/wt95S": { n: 200, mean: 0.14685739389811597, standardError: 0.12214966975705784, lower: -0.09401644675750961, upper: 0.3877312345537416 },
  }),
  "deadband-sweep": Object.freeze({
    "t0/awtS": { n: 300, mean: -0.6230477193303771, standardError: 0.26148216826541404, lower: -1.1376262361914988, upper: -0.10846920246925529 },
    "t1/awtS": { n: 300, mean: -0.8811115740965481, standardError: 0.23722726069771669, lower: -1.3479581387347537, upper: -0.41426500945834255 },
    "t2/awtS": { n: 300, mean: -1.1098714218541692, standardError: 0.22369907061101338, lower: -1.5500954598519916, upper: -0.6696473838563468 },
    "t3/awtS": { n: 300, mean: -0.7923184414121527, standardError: 0.1981161724524759, lower: -1.1821971351031044, upper: -0.4024397477212009 },
    "t4/awtS": { n: 300, mean: -0.4302578912917206, standardError: 0.15084125614988633, lower: -0.7271028745882115, upper: -0.1334129079952296 },
    "t5/awtS": { n: 300, mean: -0.21650393403828683, standardError: 0.082220611163085, lower: -0.37830831415483124, upper: -0.054699553921742444 },
    "t6/awtS": { n: 300, mean: -0.021244946733199162, standardError: 0.03360128450199254, lower: -0.08736991142338571, upper: 0.04488001795698738 },
    "t8/awtS": { n: 300, mean: -0.0057001133786848315, standardError: 0.012679081340823132, lower: -0.03065165372578721, upper: 0.019251426968417543 },
  }),
  "rate-sweep": Object.freeze({
    "r2/awtS": { n: 300, mean: -0.0057001133786848315, standardError: 0.012679081340823132, lower: -0.03065165372578721, upper: 0.019251426968417543 },
    "r4/awtS": { n: 300, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "r8/awtS": { n: 300, mean: -0.014119948442288054, standardError: 0.010369221624176457, lower: -0.03452584732162189, upper: 0.00628595043704578 },
    "r16/awtS": { n: 300, mean: -0.01005904201305467, standardError: 0.010059042013054673, lower: -0.029854529232922703, upper: 0.009736445206813365 },
  }),
  "double-deck": Object.freeze({
    "up-peak-1.5pct/collective−collective@single-deck/awtS": { n: 200, mean: -0.02269964577428298, standardError: 0.11551671390513416, lower: -0.25049358572997443, upper: 0.20509429418140845 },
    "up-peak-1.5pct/collective−collective@single-deck/carDistanceM": { n: 200, mean: 1147.0845000000006, standardError: 52.74905079094293, lower: 1043.0656640897305, upper: 1251.1033359102707 },
    "up-peak-1.5pct/collective−collective@single-deck/carStarts": { n: 200, mean: 7.09, standardError: 0.5269705778786409, lower: 6.050836920324064, upper: 8.129163079675935 },
    "up-peak-1.5pct/collective−collective@single-deck/energyKJ": { n: 200, mean: 9047.63264092889, standardError: 425.7310706615228, lower: 8208.109470046578, upper: 9887.155811811203 },
    "up-peak-1.5pct/collective−collective@single-deck/energyPerServedLegKJ": { n: 200, mean: 75.60970536960558, standardError: 3.8198598197987033, lower: 68.07710779982905, upper: 83.1423029393821 },
    "up-peak-1.5pct/collective−collective@single-deck/rideMeanS": { n: 200, mean: -8.113878252597859, standardError: 0.3245541475671236, lower: -8.75388492785691, upper: -7.473871577338807 },
    "up-peak-1.5pct/collective−collective@single-deck/ttdMeanS": { n: 200, mean: -9.487538570667422, standardError: 0.5091236949991336, lower: -10.491508372854618, upper: -8.483568768480225 },
    "up-peak-1.5pct/collective−collective@single-deck/ttdP95S": { n: 200, mean: -24.816050501657372, standardError: 1.55716102559698, lower: -27.88670437653717, upper: -21.745396626777573 },
    "up-peak-1.5pct/collective−collective@single-deck/unservedFraction": { n: 200, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "up-peak-1.5pct/collective−collective@single-deck/wt95S": { n: 200, mean: 0.4796214933725304, standardError: 0.2734260471758217, lower: -0.05956278972473078, upper: 1.0188057764697915 },
    "up-peak-1.5pct/eta−eta@single-deck/awtS": { n: 200, mean: 0.7346057673228091, standardError: 0.11937811473856849, lower: 0.49919731272364753, upper: 0.9700142219219707 },
    "up-peak-1.5pct/eta−eta@single-deck/carDistanceM": { n: 200, mean: 241.32199999999983, standardError: 35.02721991185953, lower: 172.2498444678617, upper: 310.394155532138 },
    "up-peak-1.5pct/eta−eta@single-deck/carStarts": { n: 200, mean: 0.11, standardError: 0.440351047717762, lower: -0.7583531303151746, upper: 0.9783531303151746 },
    "up-peak-1.5pct/eta−eta@single-deck/energyKJ": { n: 200, mean: 1526.9313796454794, standardError: 273.0075948648743, lower: 988.5722663212482, upper: 2065.2904929697106 },
    "up-peak-1.5pct/eta−eta@single-deck/energyPerServedLegKJ": { n: 200, mean: 9.882720937254232, standardError: 2.59628864705236, lower: 4.762952548932696, upper: 15.00248932557577 },
    "up-peak-1.5pct/eta−eta@single-deck/rideMeanS": { n: 200, mean: -5.998819713480499, standardError: 0.3075229640155672, lower: -6.6052416348787055, upper: -5.392397792082292 },
    "up-peak-1.5pct/eta−eta@single-deck/ttdMeanS": { n: 200, mean: -4.979302045749813, standardError: 0.4830570568346879, lower: -5.931869570221987, upper: -4.02673452127764 },
    "up-peak-1.5pct/eta−eta@single-deck/ttdP95S": { n: 200, mean: -15.01793355240355, standardError: 1.4782070860278187, lower: -17.93289368945548, upper: -12.102973415351618 },
    "up-peak-1.5pct/eta−eta@single-deck/unservedFraction": { n: 200, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "up-peak-1.5pct/eta−eta@single-deck/wt95S": { n: 200, mean: 1.641833344681476, standardError: 0.33960575785008323, lower: 0.9721455480234144, upper: 2.3115211413395373 },
    "up-peak-1pct/collective−collective@single-deck/awtS": { n: 153, mean: -0.47205981649313883, standardError: 0.11779353047378784, lower: -0.7047837793861267, upper: -0.23933585360015092 },
    "up-peak-1pct/collective−collective@single-deck/carDistanceM": { n: 153, mean: 694.8379084967315, standardError: 48.314591807934896, lower: 599.3830628369202, upper: 790.2927541565429 },
    "up-peak-1pct/collective−collective@single-deck/carStarts": { n: 153, mean: 2.915032679738562, standardError: 0.4312911025883245, lower: 2.062933467234048, upper: 3.767131892243076 },
    "up-peak-1pct/collective−collective@single-deck/energyKJ": { n: 153, mean: 5847.797173450492, standardError: 404.99105114020017, lower: 5047.658812893267, upper: 6647.935534007716 },
    "up-peak-1pct/collective−collective@single-deck/energyPerServedLegKJ": { n: 153, mean: 73.30185669427438, standardError: 5.226500318884317, lower: 62.975891750529954, upper: 83.6278216380188 },
    "up-peak-1pct/collective−collective@single-deck/rideMeanS": { n: 153, mean: -5.06620248694166, standardError: 0.28771924437101587, lower: -5.63464765096108, upper: -4.49775732292224 },
    "up-peak-1pct/collective−collective@single-deck/ttdMeanS": { n: 153, mean: -4.710185955449735, standardError: 0.4238932802397371, lower: -5.547669335261089, upper: -3.8727025756383817 },
    "up-peak-1pct/collective−collective@single-deck/ttdP95S": { n: 153, mean: -14.360912301489186, standardError: 1.6808076861208703, lower: -17.681673840783457, upper: -11.040150762194916 },
    "up-peak-1pct/collective−collective@single-deck/unservedFraction": { n: 153, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "up-peak-1pct/collective−collective@single-deck/wt95S": { n: 153, mean: -0.6194709965959921, standardError: 0.2644095299970804, lower: -1.1418632994677185, upper: -0.0970786937242657 },
    "up-peak-1pct/eta−eta@single-deck/awtS": { n: 153, mean: 0.02864091883297262, standardError: 0.11891553013827327, lower: -0.20629977198414995, upper: 0.2635816096500952 },
    "up-peak-1pct/eta−eta@single-deck/carDistanceM": { n: 153, mean: 88.64183006535941, standardError: 32.48190819261528, lower: 24.4675212853557, upper: 152.81613884536313 },
    "up-peak-1pct/eta−eta@single-deck/carStarts": { n: 153, mean: -1.522875816993464, standardError: 0.37199489263690333, lower: -2.2578238675544946, upper: -0.7879277664324335 },
    "up-peak-1pct/eta−eta@single-deck/energyKJ": { n: 153, mean: 669.7703305491817, standardError: 263.3272169281885, lower: 149.51634703566015, upper: 1190.0243140627033 },
    "up-peak-1pct/eta−eta@single-deck/energyPerServedLegKJ": { n: 153, mean: 6.367086435693416, standardError: 3.5616396238101453, lower: -0.6696233421346207, upper: 13.403796213521453 },
    "up-peak-1pct/eta−eta@single-deck/rideMeanS": { n: 153, mean: -3.4880178661132972, standardError: 0.2841473233586, lower: -4.049406007477851, upper: -2.926629724748744 },
    "up-peak-1pct/eta−eta@single-deck/ttdMeanS": { n: 153, mean: -1.493352147100343, standardError: 0.41021577181080604, lower: -2.303812956561015, upper: -0.682891337639671 },
    "up-peak-1pct/eta−eta@single-deck/ttdP95S": { n: 153, mean: -7.421982907305471, standardError: 1.5988995366250915, lower: -10.580919013002344, upper: -4.263046801608597 },
    "up-peak-1pct/eta−eta@single-deck/unservedFraction": { n: 153, mean: 0, standardError: 0, lower: 0, upper: 0 },
    "up-peak-1pct/eta−eta@single-deck/wt95S": { n: 153, mean: 0.26569596652244526, standardError: 0.24321701871236412, lower: -0.2148264204889102, upper: 0.7462183535338007 },
  }),
});
