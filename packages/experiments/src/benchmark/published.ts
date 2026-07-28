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

import type { CaseResult } from './suite.js';
import type { PrepositioningStudy } from './prepositioning.js';
import type { Stage5Study } from './capacityReassignment.js';
import type { ForecastCausalityAudit } from './predictorLag.js';
import type { TailStudy } from './tailStudy.js';

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
 * The studies are deterministic from their seeds — same seed, same doubles, in the same order — so
 * the honest tolerance is zero. `1e-12` is the concession to nothing more than a future refactor
 * that reassociates a sum; it is nine orders of magnitude below the smallest drift any of the three
 * known instances produced (the smallest was `0.0288 s` on a `0.26 s` mean).
 */
export const PIN_TOLERANCE = 1e-12;

/** `true` when `actual` matches `expected` to within {@link PIN_TOLERANCE}, relatively. */
export function pinMatches(expected: number, actual: number): boolean {
  if (Number.isNaN(expected) && Number.isNaN(actual)) return true;
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) return expected === actual;
  const scale = Math.max(1, Math.abs(expected));
  return Math.abs(expected - actual) <= PIN_TOLERANCE * scale;
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
 */
export const UNPINNED_INTERVALS: readonly UnpinnedInterval[] = Object.freeze([
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
});
