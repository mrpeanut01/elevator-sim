/**
 * **Phase 6a, unit A4 — destination *disclosure*, measured.**
 *
 * ```ts
 * console.log(formatDisclosureStudy(await runDestinationDisclosureStudy()));
 * ```
 *
 * docs/09-destination-dispatch-contract.md § 1.1 splits destination dispatch in two, and only the
 * second half changes the passenger model:
 *
 * - **Level 0 — disclosure.** `dispatch.callType` moves the destination into the `CostRequest` at
 *   call time. The landing is still one up/down button and any car that opens still takes whoever
 *   fits, so **both arms are strictly comparable on all twenty-three recorded metrics**. This module.
 * - **Level 1 — dispatch.** The passenger is told which car to walk to and must board it. Phase 6b.
 *
 * This module is the Level-0 measurement, and it needs no `core` change: the seam was already wired
 * end to end and nothing shipped used it.
 *
 * ---
 *
 * # The result
 *
 * **The gate metric is TTD, and AWT and WT95 are reported beside it with explicit verdicts**
 * (DECISIONS.md § D27). That is not a preference between metrics — it is forced by a measured
 * **sign flip**. At the primary operating point, from *the same runs*, moving the destination to
 * call time makes time-to-destination significantly **better** and mean wait significantly
 * **worse**. A study reporting AWT alone reports the wrong sign; a study reporting TTD alone hides
 * the honest cost. Both intervals are below, and both exclude zero.
 *
 * ## The table, at Midtown Office interfloor-mix, n = 150 under common random numbers
 *
 * `destination-eta` + `weights.rideTime` against `eta`. Every row is a paired-t at 95 %, every row
 * comes out of the same 150 replications, and every figure is pinned in `published.ts`.
 *
 * | `rideTime` | TTD | AWT | WT95 | in-car time |
 * |---|---|---|---|---|
 * | **none** (`destination-eta-unpriced`) | `+0.000 [+0.000, +0.000]` **IDENTICAL** | `+0.000 [+0.000, +0.000]` **IDENTICAL** | `+0.000 [+0.000, +0.000]` **IDENTICAL** | `+0.000 [+0.000, +0.000]` **IDENTICAL** |
 * | 0.3 | `−0.993 [−1.283, −0.703]` **BETTER** | `+0.182 [+0.048, +0.317]` WORSE | `+0.369 [−0.311, +1.049]` INDIST. | `−1.175 [−1.451, −0.900]` BETTER |
 * | **0.5 — the shipped profile** | `−1.217 [−1.531, −0.902]` **BETTER** | `+0.295 [+0.154, +0.437]` WORSE | `+0.374 [−0.303, +1.051]` INDIST. | `−1.512 [−1.813, −1.211]` BETTER |
 * | 0.7 | `−1.433 [−1.787, −1.079]` **BETTER** | `+0.392 [+0.239, +0.546]` WORSE | `+0.620 [−0.033, +1.274]` INDIST. | `−1.825 [−2.158, −1.493]` BETTER |
 * | **1.0** | **`−1.562 [−1.916, −1.208]` BETTER** | **`+0.514 [+0.344, +0.684]` WORSE** | **`+1.010 [+0.292, +1.729]` WORSE** | `−2.076 [−2.406, −1.746]` BETTER |
 * | 2.0 | `−1.800 [−2.164, −1.435]` **BETTER** | `+0.748 [+0.560, +0.936]` WORSE | `+1.331 [+0.623, +2.039]` WORSE | `−2.547 [−2.887, −2.207]` BETTER |
 * | *`eta` deferring 1.5 s* | `+1.123 [+0.848, +1.397]` WORSE | `+1.081 [+0.952, +1.209]` WORSE | `+1.895 [+1.443, +2.346]` WORSE | `+0.042 [−0.214, +0.298]` INDIST. |
 *
 * ## Why the shipped default is 0.5 — neither the headline 1.0 nor the bracket's own floor
 *
 * A shipped default is not a study arm. The bracket is monotone in **both** directions over its
 * whole width, so there is no interior optimum to discover: choosing a default is choosing a point
 * on a trade, and it has to be chosen against criteria stated before the numbers. Two were, and
 * they cut from opposite ends.
 *
 * **A default may not make a published metric significantly worse.** That is the tail, and it rules
 * out the top of the bracket. WT95 is `+0.369 [−0.311, +1.049]` at 0.3 and `+0.374 [−0.303,
 * +1.051]` at 0.5 — intervals containing zero — `+0.620 [−0.033, +1.274]` at 0.7, which only just
 * does, and `+1.010 [+0.292, +1.729]` at 1.0 and `+1.331 [+0.623, +2.039]` at 2.0, which do not.
 * WT95 is the metric this project's service-level machinery gates on, and a default that measurably
 * lengthens the tail is a trade an operator should opt into rather than inherit. AWT is WORSE at
 * every point — the honest cost of the mechanism, and D27 exists to make it public — but at 0.5 it
 * is `+0.295 [+0.154, +0.437]`, against the `+1.081 [+0.952, +1.209]` the deferral a destination
 * dispatcher may not use costs.
 *
 * **A default may not be observationally inert at a shipped operating point.** That is the whole
 * reason this weight exists, and it rules out the bottom. Counted at the matrix's own seed and
 * budget on Midtown up-peak, the shipped profile is bit-identical to `eta` on **0 of 81**
 * replications at 0.3, and differs on **5** at 0.5, **6** at 0.7 and **16** at 1.0. A default that
 * changes nothing at a shipped operating point is the defect being fixed, one notch smaller.
 *
 * 0.5 is the smallest bracket point that clears both, and what it costs against 0.3 is `+0.113 s`
 * of AWT for `−0.224 s` of TTD and `−0.337 s` in the car.
 *
 * **One cell stays identical at every weight, and that one is structural.** On Garden Apartments
 * down-peak the shipped profile is bit-identical to `eta` on 0 of 51 replications at 0.3, at 1.0
 * *and* at 2.0. Every down trip there ends at the lobby, so the destination carries nothing the
 * direction button did not — the same mechanism {@link NEGATIVE_CONTROLS} predicts in advance for
 * `midtown-down-peak`. That is an operating point being blind, not a weight being small, and the
 * way to tell is that raising the weight fourfold does not move it.
 *
 * CLAUDE.md § Tuning discipline says not to scalarize early; 1.0 and 2.0 remain arms here and the
 * operator reaches them by deriving one, which is what {@link disclosureProfiles} is for.
 *
 * Four things the table says that a headline cannot.
 *
 * **The mechanism is where the theory says it is.** The in-car column is *larger* than the TTD
 * column at every weight — the change buys 2.076 s aboard and gives 0.514 s of it back at the
 * landing. Destination grouping is supposed to reduce in-car time, and it does; the wait is what it
 * is spent on. Had the TTD gain exceeded the ride gain, the number would be coming from somewhere
 * the mechanism does not predict.
 *
 * **The call type alone is worth exactly zero here, and the study separates it out.** The
 * `destination-eta-unpriced` arm — the destination disclosed and authorized, nothing pricing it —
 * is bit-identical to `eta` on this building, 150 of 150 paired differences of precisely `0` on
 * every metric. Midtown Office declares no `accessZones`, so moving information earlier is worth
 * nothing until something reads it. The whole −1.562 s is the *weight*, and that is a decomposition
 * rather than an inference. That row was the shipped profile until T30 authored the weight, which
 * is precisely why the row had to be kept: a configuration nobody ships is still the only thing
 * that can attribute the effect.
 *
 * **The trade is monotone and is not scalarized away.** TTD improves and AWT degrades over the whole
 * bracket. 1.0 is an operating point on a curve, not a discovered optimum, and the curve is reported
 * because the wait-versus-ride trade is the operator's call.
 *
 * **The constraint destination dispatch cannot avoid turns out to pay (OQ-4).** A destination
 * dispatcher may not defer assignment — the passenger must be told which car to walk to, and
 * `dispatch/policy.ts` refuses the combination outright — and that is written up as a documented
 * cost. Measured, `eta` deferring 1.5 s is significantly WORSE on TTD, AWT and WT95 alike, on 150 of
 * 150 replications. At this operating point with this weight vector the constraint removes a
 * liability. It does not follow that deferral is useless in general: `predictive-balanced` is the
 * profile that defers and it carries ten weights rather than one, which is the half of OQ-4 this
 * study does not answer.
 *
 * See {@link DisclosureStudy.arms} for the table the suite prints, and `destinationDisclosure.test.ts`
 * for the verdicts asserted.
 *
 * ---
 *
 * # Three things this module refuses to do
 *
 * **1. It does not measure at the shipped operating points and call the answer zero.** Three of the
 * five are near-blind to destination information — see `arms.ts` § *Phase 6a — the
 * destination-disclosure operating points*. They are carried here as
 * {@link DisclosureStudy.negativeControls} with their **expected-zero result stated in advance**, so
 * that an exact zero is never confused with a wiring zero. docs/05-roadmap.md § Standing requirement
 * says a bit-identical arm is a defect report; these ones are not, and the way to tell is that the
 * *same code* moves at the fourth point.
 *
 * **2. It does not reuse Phase 5's saturation ceilings.** `arms.ts` records `nearest-car` first
 * losing its AWT at replication 287 on Midtown up-peak and 190 on Secure Tower up-peak. Neither
 * applies here (contract OQ-5). Re-censused at *this* point over 1000 replications by
 * `saturationCensus.test.ts`: **no arm loses its AWT at all**, including `nearest-car`, so there is
 * no ceiling and `n` is a choice rather than a limit. {@link DisclosureStudy.budget} then derives
 * `n` from the study's own measured spread rather than from the contract's.
 *
 * **3. It does not scalarize.** Every arm's AWT, WT95, TTD and ride time are reported with their own
 * verdict. The energy-versus-wait trade is the operator's call (CLAUDE.md § Tuning discipline), and
 * so is the wait-versus-ride one.
 */

import type { DispatcherProfile } from '@elevator-sim/core';

import type { MeanEstimate } from '../reports/types.js';
import type { ReplicationMetric } from '../runner/metrics.js';
import type { ExperimentResources, ExperimentResult, TrafficArmSpec } from '../runner/types.js';
import {
  cellOf,
  derivedProfile,
  digestsOf,
  loadResources,
  runGateExperiment,
  samplesOf,
  withProfiles,
} from '../validation/harness.js';

import {
  DESTINATION_CASES,
  GARDEN_RESIDENTIAL_2PCT,
  MIDTOWN_UP_PEAK_1PCT,
  SECURE_UP_PEAK_2PCT,
  destinationCase,
  type BenchmarkCase,
} from './arms.js';
import { BENCHMARK_SEED } from './suite.js';
import { compareCell, type CellComparison, type CellVerdict } from './verdict.js';

/* -------------------------------------------------------------------------- *
 * The arms — data, not code
 * -------------------------------------------------------------------------- */

/** The conventional reference arm. */
export const DISCLOSURE_BASELINE = 'eta';

/** The shipped destination profile, and the only profile in `data/` that authors a `callType`. */
export const DISCLOSURE_PROFILE = 'destination-eta';

/**
 * The shipped profile with its `rideTime` weight taken back off, and nothing else touched.
 *
 * **This arm is the decomposition, and it used to be the shipped profile itself.** Until T30 the
 * shipped `destination-eta` weighted nothing that read the destination, so *it* was the "call type
 * alone" row — and the matrix then measured what that was worth: bit-identical to `eta` at 8 of 8
 * cells, a shipped profile named for a mechanism that changed no decision. Authoring the weight
 * fixed that and would have deleted the decomposition with it, because the row that separates the
 * call type from the pricing has to be a configuration with the call type and no pricing.
 *
 * So it is derived instead of shipped. Same `callType`, same `waitTime`, `rideTime` at exactly 0 —
 * which the scoring engine treats identically to an absent weight, and the proof of that is this
 * arm landing in `eta`'s identity class with 150 of 150 paired differences of exactly zero, which is
 * what the shipped profile used to do. Nothing about Phase 6a's accepted result changes: the same
 * two rows, under two ids.
 */
export const DISCLOSURE_UNPRICED_ARM = 'destination-eta-unpriced';

/**
 * The `weights.rideTime` `data/dispatcher-profiles.json` ships `destination-eta` at.
 *
 * Held here so the study can assert the file against it rather than discovering it, and so a change
 * to the shipped default is a change somebody makes on purpose in two places rather than a silent
 * drift in one. {@link RIDE_TIME_WEIGHTS} brackets it and includes it, so the shipped arm and the
 * derived arm at the same weight must land in one identity class — which is the liveness statement
 * for the shipped profile: it *is* a measured point on the published curve, not a nearby one.
 */
export const SHIPPED_RIDE_TIME_WEIGHT = 0.5;

/**
 * The `weights.rideTime` values the study brackets the shipped profile with.
 *
 * Three points rather than one, because a single weight cannot distinguish "moving the information
 * earlier helps" from "this particular weight helps". The trade is monotone in both directions here
 * and reporting it is the honest form of an unscalarized result.
 */
export const RIDE_TIME_WEIGHTS: readonly number[] = Object.freeze([0.3, 0.5, 0.7, 1, 2]);

/** Arm id for the disclosure arm at one `rideTime` weight. */
export function rideArmId(weight: number): string {
  return `${DISCLOSURE_PROFILE}+ride${weight}`;
}

/** The deferred conventional arm — the thing a destination dispatcher may not do (contract § 2.3). */
export const DEFERRED_ARM = 'eta-deferred';

/**
 * Every derived profile this study registers, built by patching a loaded profile.
 *
 * Config only, never code (CLAUDE.md invariant 7): each of these is a `DispatcherProfile` of exactly
 * the shape `loadConfig` produces, and the simulator cannot tell one from a profile authored in
 * `data/dispatcher-profiles.json`. Nothing here branches on a profile id.
 *
 * **Which end of the bracket is derived, and which ships.** The shipped `destination-eta` now
 * authors `dispatch.callType` **and** `weights.rideTime: 0.3`, so the arm this study used to derive
 * at 0.3 is the shipped profile, and the arm it used to take from `data/` — the call type with
 * nothing pricing it — is the one derived here as {@link DISCLOSURE_UNPRICED_ARM}. That inversion
 * is the whole of T30's change to this study: the same five configurations are measured, and the
 * only difference is which of them `data/` carries.
 *
 * It happened because the previous arrangement made the shipped profile inert. The promotion had
 * been recorded as *blocked* — `core/src/dispatch/policies/policies.test.ts`'s
 * `contributionScenarios()` built their call from a fixture carrying no `destinationFloorId`, so
 * the one gated term in the library could not contribute in the only fixture guarding *"no weight
 * that contributes nothing"* — and T16 closed that gap without the profile following. The matrix
 * then measured the consequence: `destination-eta` bit-identical to `eta` at 8 of 8 cells.
 */
export function disclosureProfiles(
  baseline: DispatcherProfile,
  destination: DispatcherProfile,
): readonly DispatcherProfile[] {
  return Object.freeze([
    derivedProfile(destination, DISCLOSURE_UNPRICED_ARM, {
      name: 'Destination disclosure, ride unpriced',
      weights: { rideTime: 0 },
    }),
    ...RIDE_TIME_WEIGHTS.map((weight) =>
      derivedProfile(destination, rideArmId(weight), {
        name: `Destination disclosure, rideTime ${weight}`,
        weights: { rideTime: weight },
      }),
    ),
    derivedProfile(baseline, DEFERRED_ARM, {
      name: 'Minimum estimated wait, deferred 1.5 s',
      dispatch: { assignmentTiming: 'deferred', deferWindowS: 1.5 },
    }),
  ]);
}

/**
 * The metrics every arm is reported on, and what each is for.
 *
 * | metric | role |
 * |---|---|
 * | `ttdMeanS` | **the gate.** Journey start to alighting — the quantity the passenger experiences |
 * | `awtS` | the honest cost. Reported with a verdict whichever way it falls (D27) |
 * | `wt95S` | the tail, reported with a verdict for the same reason |
 * | `rideMeanS` | the **mechanism check**: is the TTD gain in-car time, as the theory says? |
 *
 * Every one is lower-is-better, which is what lets {@link compareCell} classify a signed difference
 * without a per-metric branch.
 */
export const DISCLOSURE_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'ttdMeanS',
  'awtS',
  'wt95S',
  'rideMeanS',
]);

/** Human labels, for the printed table only. Feeds no decision. */
export const DISCLOSURE_METRIC_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ttdMeanS: 'TTD (s)',
  awtS: 'AWT (s)',
  wt95S: 'WT95 (s)',
  rideMeanS: 'ride (s)',
});

/* -------------------------------------------------------------------------- *
 * The negative controls
 * -------------------------------------------------------------------------- */

/** Midtown Office with every trip ending at the lobby. Not a shipped case; a control. */
export const MIDTOWN_DOWN_PEAK_1PCT: TrafficArmSpec = Object.freeze({
  id: 'down-peak-1pct',
  durationS: 900,
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 0, outgoing: 1, interfloor: 0 }),
    entranceWeights: Object.freeze({ G: 1, P1: 0 }),
    arrivalRatePctPop5min: 1,
    peakWindowS: 300,
  }),
});

/** One operating point where the effect is predicted to be exactly zero, and why. */
export interface NegativeControlSpec {
  readonly id: string;
  readonly label: string;
  readonly building: string;
  readonly traffic: TrafficArmSpec;
  /** Stated **before** the run. A control that is only explained afterwards explains nothing. */
  readonly prediction: string;
}

/**
 * The three shipped points that are blind to destination information, with the reason each is.
 *
 * `CLAUDE.md`'s standing requirement says a bit-identical arm is *"a defect report, not a
 * measurement"*. These three are the documented exception, and what makes them one is that the same
 * two profiles are **not** identical at the primary point on the same commit. An expected zero and a
 * wiring zero look the same in a table; only a prediction made in advance tells them apart.
 */
export const NEGATIVE_CONTROLS: readonly NegativeControlSpec[] = Object.freeze([
  Object.freeze({
    id: 'garden-residential',
    label: 'Garden Apartments, residential 2 %',
    building: 'garden-apartments',
    traffic: GARDEN_RESIDENTIAL_2PCT,
    prediction:
      'Exactly zero. One bank, two cars, six floors: an argmin over two candidates almost never flips on a ride-time tiebreak. docs/09 § 2.2 measured 30 of 30 replications bit-identical, at rideTime 0.3.',
  }),
  Object.freeze({
    id: 'midtown-down-peak',
    label: 'Midtown Office, down-peak 1 %',
    building: 'midtown-office',
    traffic: MIDTOWN_DOWN_PEAK_1PCT,
    prediction:
      'Exactly zero, or nearly. Every down trip ends at the lobby, so the destination carries no information the direction button did not already carry. docs/09 § 2.2 measured 29 of 30 bit-identical.',
  }),
  Object.freeze({
    id: 'midtown-up-peak',
    label: 'Midtown Office, up-peak 1 %',
    building: 'midtown-office',
    traffic: MIDTOWN_UP_PEAK_1PCT,
    prediction:
      'Near zero, and of no determinate sign. Everything enters at one entrance and the lobby plateau dominates; whatever the destination buys is smaller than what queueing at the lobby costs.',
  }),
  Object.freeze({
    id: 'secure-up-peak',
    label: 'Secure Tower, up-peak 2 %',
    building: 'secure-tower',
    traffic: SECURE_UP_PEAK_2PCT,
    prediction:
      'Near zero. Three identical cars per bank serving one unrestricted lobby: destination information mostly permutes which of three interchangeable cars goes.',
  }),
]);

/** What a negative control measured. Counts and a maximum, never an interval. */
export interface NegativeControlResult {
  readonly id: string;
  readonly label: string;
  readonly prediction: string;
  readonly replications: number;
  /** Replications whose metric vector differed at all between the two arms. */
  readonly differing: number;
  /** Largest absolute paired difference on `ttdMeanS`, in seconds. */
  readonly maxAbsTtdDifference: number;
  /** Largest absolute paired difference on `awtS`, in seconds. */
  readonly maxAbsAwtDifference: number;
  /**
   * The paired-t on TTD at this control's own budget, with its verdict.
   *
   * A count of differing replications answers *"does anything change at all?"* and nothing else. On
   * Midtown up-peak a handful of replications differ by many seconds in **both** directions, and a
   * count cannot say whether that averages to something. So the interval is produced too, and the
   * verdict it carries is the claim: these points are `INDISTINGUISHABLE` (or `IDENTICAL`) at a
   * budget at which the primary point is emphatically not.
   */
  readonly ttd: CellComparison;
}

/* -------------------------------------------------------------------------- *
 * The budget, re-derived
 * -------------------------------------------------------------------------- */

/** One metric's answer to "what does this budget resolve, and what would it take to resolve less?" */
export interface BudgetRow {
  readonly metric: ReplicationMetric;
  /** Sample sd of the paired difference at the budget actually run. */
  readonly sdOfDifference: number;
  /** Half-width the study achieved, in the metric's units. */
  readonly halfWidth: number;
  /** The measured effect. */
  readonly effect: number;
  /** `n` the *observed* effect would need to clear zero, from the observed spread. */
  readonly requiredReplications: number | undefined;
  /** `n` for a ±0.5 s half-width from the observed spread — the contract's design target. */
  readonly replicationsForHalfWidth: number;
}

/**
 * The replication budget, derived from this study's own numbers rather than quoted.
 *
 * The contract derives n = 150 from an `sd(ΔTTD)` of 2.1–2.7 s measured on a different seed set. The
 * rows here re-derive it from the spread this run actually saw, so the budget is defensible against
 * the data it was spent on rather than against somebody else's pilot.
 */
export interface BudgetDerivation {
  readonly replications: number;
  /** `undefined` when no arm lost its AWT in the census — measured, not assumed. */
  readonly admissibleReplications: number | undefined;
  readonly rows: readonly BudgetRow[];
}

const Z_95 = 1.959_963_984_540_054;

/** `n` for a target half-width at 95 %, from an observed spread. */
export function replicationsForHalfWidth(sdOfDifference: number, halfWidth: number): number {
  if (!Number.isFinite(sdOfDifference) || halfWidth <= 0) return Number.NaN;
  if (sdOfDifference === 0) return 1;
  return Math.max(1, Math.ceil(((Z_95 * sdOfDifference) / halfWidth) ** 2));
}

/* -------------------------------------------------------------------------- *
 * The result
 * -------------------------------------------------------------------------- */

/** One arm's row of the disclosure table. */
export interface DisclosureArm {
  readonly armId: string;
  readonly profileId: string;
  /** What this arm is in the experiment, in one phrase. Prose, so a reader can argue with it. */
  readonly role: string;
  readonly quotable: boolean;
  readonly quotabilityReason: string | undefined;
  readonly saturatedCount: number;
  readonly means: Readonly<Record<string, number>>;
  readonly cells: readonly CellComparison[];
  readonly cell: (metric: ReplicationMetric) => CellComparison;
}

/** Everything unit A4 measured. */
export interface DisclosureStudy {
  readonly caseId: string;
  readonly label: string;
  readonly building: string;
  readonly seed: number | string;
  readonly replications: number;
  readonly baselineId: string;
  readonly baselineQuotable: boolean;
  readonly baselineSaturatedCount: number;
  readonly baselineMeans: Readonly<Record<string, number>>;
  readonly arms: readonly DisclosureArm[];
  /** Whether every arm's replication `i` really saw the baseline's replication `i` population. */
  readonly crnAligned: boolean;
  /** Arms whose per-replication metric vectors are exactly equal, as equivalence classes. */
  readonly identityClasses: readonly (readonly string[])[];
  readonly budget: BudgetDerivation;
  readonly negativeControls: readonly NegativeControlResult[];
  readonly experiment: ExperimentResult;
}

export interface DisclosureStudyOptions {
  readonly seed?: number | string | undefined;
  readonly replications?: number | undefined;
  readonly resources?: ExperimentResources | undefined;
  /** Replications per negative control. Their predicted result is exactly zero; 30 is conclusive. */
  readonly controlReplications?: number | undefined;
  /** Skip the controls when a caller only wants the primary table. Defaults to running them. */
  readonly includeNegativeControls?: boolean | undefined;
}

/** The metrics an identity class is decided on. Wider than the reported set, on purpose. */
const IDENTITY_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'awtS',
  'wt95S',
  'ttdMeanS',
  'rideMeanS',
  'intervalS',
  'meanLoadFactor',
  'meanQueueLength',
]);

const ROLES: Readonly<Record<string, string>> = Object.freeze({
  [DISCLOSURE_PROFILE]:
    `the shipped profile: the destination is disclosed, authorized and priced at ${SHIPPED_RIDE_TIME_WEIGHT}`,
  [DISCLOSURE_UNPRICED_ARM]:
    'the decomposition: the same call type with nothing pricing the destination at all',
  [DEFERRED_ARM]:
    'the constraint a destination dispatcher must accept — deferred assignment, which it may not use',
});

function roleOf(armId: string): string {
  return (
    ROLES[armId] ??
    (armId.startsWith(`${DISCLOSURE_PROFILE}+ride`)
      ? 'disclosure with the ride priced at the weight in the id'
      : 'arm')
  );
}

function meansOf(
  result: ExperimentResult,
  armId: string,
  metrics: readonly ReplicationMetric[],
): Readonly<Record<string, number>> {
  const cell = cellOf(result, armId);
  const out: Record<string, number> = {};
  for (const metric of metrics) out[metric] = cell.aggregate.metrics[metric].statistic?.mean ?? Number.NaN;
  return Object.freeze(out);
}

function identityClassesOf(
  result: ExperimentResult,
  armIds: readonly string[],
): readonly (readonly string[])[] {
  const classes = new Map<string, string[]>();
  for (const armId of armIds) {
    const key = IDENTITY_METRICS.map((metric) =>
      samplesOf(result, armId, metric)
        .map((value) => (Number.isNaN(value) ? 'NaN' : value.toPrecision(17)))
        .join(','),
    ).join('|');
    const bucket = classes.get(key);
    if (bucket === undefined) classes.set(key, [armId]);
    else bucket.push(armId);
  }
  return Object.freeze([...classes.values()].map((members) => Object.freeze(members)));
}

/**
 * Run the Level-0 study at the primary operating point.
 *
 * One `runExperiment` call with the baseline and every arm, which is the whole of the pairing:
 * replication `i` of every arm sees a byte-identical passenger population, and
 * {@link DisclosureStudy.crnAligned} audits that afterwards against the runner's own trace digests
 * rather than trusting the design. Level 0 changes nothing about who arrives — `StreamSet` derives
 * `arrivals`, `origins`, `destinations` and `passengerMass` from the master seed independently of
 * anything the dispatcher does — so CRN here is perfect and unqualified.
 */
export async function runDestinationDisclosureStudy(
  options: DisclosureStudyOptions = {},
): Promise<DisclosureStudy> {
  const spec = destinationCase('midtown-interfloor-mix');
  const config = await loadResources();
  const baseline = requireProfile(config.dispatcherProfilesById, DISCLOSURE_BASELINE);
  const destination = requireProfile(config.dispatcherProfilesById, DISCLOSURE_PROFILE);
  const derived = disclosureProfiles(baseline, destination);
  const resources = options.resources ?? withProfiles(config, derived);

  const armIds = [
    DISCLOSURE_PROFILE,
    DISCLOSURE_UNPRICED_ARM,
    ...RIDE_TIME_WEIGHTS.map((weight) => rideArmId(weight)),
    DEFERRED_ARM,
  ];
  const replications = options.replications ?? spec.replications;
  const seed = options.seed ?? BENCHMARK_SEED;

  const experiment = await runGateExperiment({
    id: `phase6a/disclosure/${spec.id}`,
    seed,
    building: spec.building,
    dispatchers: [DISCLOSURE_BASELINE, ...armIds],
    traffic: spec.traffic,
    replications,
    resources,
  });

  const baselineCell = cellOf(experiment, DISCLOSURE_BASELINE);
  const baselineDigests = digestsOf(experiment, DISCLOSURE_BASELINE);
  const baselineQuotable = baselineCell.aggregate.awtIsValid;

  let crnAligned = true;
  const arms: DisclosureArm[] = [];
  for (const armId of armIds) {
    const cell = cellOf(experiment, armId);
    const digests = digestsOf(experiment, armId);
    if (
      digests.length !== baselineDigests.length ||
      digests.some((digest, index) => digest !== baselineDigests[index])
    ) {
      crnAligned = false;
    }
    const quotable = baselineQuotable && cell.aggregate.awtIsValid;
    const cells = DISCLOSURE_METRICS.map((metric) =>
      compareCell({
        metric,
        armId,
        baselineId: DISCLOSURE_BASELINE,
        candidate: samplesOf(experiment, armId, metric),
        baseline: samplesOf(experiment, DISCLOSURE_BASELINE, metric),
        quotable,
        ...(spec.admissibleReplications === undefined
          ? {}
          : { admissibleReplications: spec.admissibleReplications }),
      }),
    );
    arms.push(
      Object.freeze({
        armId,
        profileId: cell.dispatcherProfileId,
        role: roleOf(armId),
        quotable: cell.aggregate.awtIsValid,
        quotabilityReason: cell.aggregate.awtInvalidReason,
        saturatedCount: cell.aggregate.saturatedCount,
        means: meansOf(experiment, armId, DISCLOSURE_METRICS),
        cells: Object.freeze(cells),
        cell: (metric: ReplicationMetric) => {
          const found = cells.find((entry) => entry.metric === metric);
          if (found === undefined) {
            throw new Error(`Metric "${metric}" was not measured for arm "${armId}".`);
          }
          return found;
        },
      }),
    );
  }

  const headline = arms.find((arm) => arm.armId === rideArmId(1)) as DisclosureArm;
  const budget: BudgetDerivation = Object.freeze({
    replications,
    admissibleReplications: spec.admissibleReplications,
    rows: Object.freeze(
      DISCLOSURE_METRICS.map((metric) => {
        const cell = headline.cell(metric);
        return Object.freeze({
          metric,
          sdOfDifference: cell.sdOfDifference,
          halfWidth: cell.estimate.halfWidth,
          effect: cell.estimate.mean,
          requiredReplications: cell.requiredReplications,
          replicationsForHalfWidth: replicationsForHalfWidth(cell.sdOfDifference, 0.5),
        });
      }),
    ),
  });

  const negativeControls =
    options.includeNegativeControls === false
      ? Object.freeze([])
      : await runNegativeControls({
          resources,
          seed,
          replications: options.controlReplications ?? 30,
        });

  return Object.freeze({
    caseId: spec.id,
    label: spec.label,
    building: spec.building,
    seed,
    replications,
    baselineId: DISCLOSURE_BASELINE,
    baselineQuotable,
    baselineSaturatedCount: baselineCell.aggregate.saturatedCount,
    baselineMeans: meansOf(experiment, DISCLOSURE_BASELINE, DISCLOSURE_METRICS),
    arms: Object.freeze(arms),
    crnAligned,
    identityClasses: identityClassesOf(experiment, [DISCLOSURE_BASELINE, ...armIds]),
    budget,
    negativeControls,
    experiment,
  });
}

/**
 * The blind operating points, measured as counts.
 *
 * No interval is produced and none is wanted: a categorical outcome does not get one, and an exactly
 * zero effect under CRN with a deterministic simulator has `rho = 1` and needs no budget
 * (docs/05-roadmap.md § Standing requirement: *"no budget changes it"*).
 */
export async function runNegativeControls(input: {
  readonly resources: ExperimentResources;
  readonly seed: number | string;
  readonly replications: number;
}): Promise<readonly NegativeControlResult[]> {
  const results: NegativeControlResult[] = [];
  for (const control of NEGATIVE_CONTROLS) {
    const experiment = await runGateExperiment({
      id: `phase6a/control/${control.id}`,
      seed: input.seed,
      building: control.building,
      dispatchers: [DISCLOSURE_BASELINE, rideArmId(1)],
      traffic: control.traffic,
      replications: input.replications,
      resources: input.resources,
    });
    let differing = 0;
    for (let index = 0; index < input.replications; index += 1) {
      const same = IDENTITY_METRICS.every((metric) => {
        const a = samplesOf(experiment, DISCLOSURE_BASELINE, metric)[index];
        const b = samplesOf(experiment, rideArmId(1), metric)[index];
        return a === b || (Number.isNaN(a as number) && Number.isNaN(b as number));
      });
      if (!same) differing += 1;
    }
    const quotable =
      cellOf(experiment, DISCLOSURE_BASELINE).aggregate.awtIsValid &&
      cellOf(experiment, rideArmId(1)).aggregate.awtIsValid;
    results.push(
      Object.freeze({
        id: control.id,
        label: control.label,
        prediction: control.prediction,
        replications: input.replications,
        differing,
        maxAbsTtdDifference: maxAbsDifference(experiment, 'ttdMeanS'),
        maxAbsAwtDifference: maxAbsDifference(experiment, 'awtS'),
        ttd: compareCell({
          metric: 'ttdMeanS',
          armId: rideArmId(1),
          baselineId: DISCLOSURE_BASELINE,
          candidate: samplesOf(experiment, rideArmId(1), 'ttdMeanS'),
          baseline: samplesOf(experiment, DISCLOSURE_BASELINE, 'ttdMeanS'),
          quotable,
        }),
      }),
    );
  }
  return Object.freeze(results);
}

function maxAbsDifference(experiment: ExperimentResult, metric: ReplicationMetric): number {
  const a = samplesOf(experiment, DISCLOSURE_BASELINE, metric);
  const b = samplesOf(experiment, rideArmId(1), metric);
  let worst = 0;
  for (const [index, value] of a.entries()) {
    const other = b[index] as number;
    if (!Number.isFinite(value) || !Number.isFinite(other)) continue;
    worst = Math.max(worst, Math.abs(value - other));
  }
  return worst;
}

function requireProfile(
  profiles: ReadonlyMap<string, DispatcherProfile>,
  id: string,
): DispatcherProfile {
  const found = profiles.get(id);
  if (found === undefined) {
    throw new Error(
      `data/dispatcher-profiles.json has no profile "${id}". Phase 6a's study cannot run without it.`,
    );
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * Reading the table
 * -------------------------------------------------------------------------- */

/** The arm row of this id. @throws Error when the study has none. */
export function disclosureArm(study: DisclosureStudy, armId: string): DisclosureArm {
  const found = study.arms.find((arm) => arm.armId === armId);
  if (found === undefined) {
    throw new Error(
      `Study "${study.caseId}" has no arm "${armId}". Arms: ${study.arms.map((arm) => arm.armId).join(', ')}.`,
    );
  }
  return found;
}

/**
 * An interval in the convention `published.ts` renders a pin in — the headline reads
 * `−1.562 [−1.916, −1.208]`.
 *
 * The example is this study's own pinned TTD figure rather than an invented one, deliberately:
 * `published.test.ts` scans every `.ts` in this directory for interval-shaped literals and requires
 * each to be re-derivable from a pin or declared unpinned with a reason, and a docstring showing the
 * *format* with made-up digits is a number nothing re-derives. `report.ts` carries the one
 * illustration that could not be made real, and it is declared in `UNPINNED_INTERVALS`.
 */
function interval(estimate: MeanEstimate, places = 3): string {
  const one = (value: number): string => {
    if (!Number.isFinite(value)) return 'n/a';
    const text = value.toFixed(places);
    return text.startsWith('-') ? `−${text.slice(1)}` : `+${text}`;
  };
  return `${one(estimate.mean)} [${one(estimate.lower)}, ${one(estimate.upper)}]`;
}

/** The study as the console table the suite prints. Feeds no decision. */
export function formatDisclosureStudy(study: DisclosureStudy): string {
  const lines: string[] = [];
  lines.push(
    `${study.label} — n = ${study.replications}, seed ${String(study.seed)}, ` +
      `baseline ${study.baselineId}, CRN ${study.crnAligned ? 'aligned' : 'BROKEN'}`,
  );
  lines.push(
    `  baseline means: ` +
      DISCLOSURE_METRICS.map(
        (metric) =>
          `${DISCLOSURE_METRIC_LABELS[metric] ?? metric} ${(study.baselineMeans[metric] ?? Number.NaN).toFixed(3)}`,
      ).join('  '),
  );
  for (const arm of study.arms) {
    lines.push(`  ${arm.armId} — ${arm.role}`);
    for (const cell of arm.cells) {
      lines.push(
        `    ${(DISCLOSURE_METRIC_LABELS[cell.metric] ?? cell.metric).padEnd(9)} ` +
          `${padVerdictWord(cell.verdict)} ${interval(cell.estimate)}  ` +
          `sd ${cell.sdOfDifference.toFixed(3)}  rho ${cell.comparison.correlation.toFixed(3)}  ` +
          `zeros ${cell.comparison.exactZeroCount}/${cell.comparison.n}` +
          (cell.verdict === 'INDISTINGUISHABLE' && cell.requiredReplications !== undefined
            ? `  would need n ≈ ${cell.requiredReplications}`
            : ''),
      );
    }
  }
  lines.push(
    `  identity classes: ` +
      (study.identityClasses
        .filter((members) => members.length > 1)
        .map((members) => members.join(' ≡ '))
        .join('; ') || 'none'),
  );
  lines.push(`  budget, re-derived at n = ${study.budget.replications}:`);
  for (const row of study.budget.rows) {
    lines.push(
      `    ${(DISCLOSURE_METRIC_LABELS[row.metric] ?? row.metric).padEnd(9)} ` +
        `sd ${row.sdOfDifference.toFixed(3)}  half-width ${row.halfWidth.toFixed(3)}  ` +
        `effect ${row.effect.toFixed(3)}  n for ±0.5 s ≈ ${row.replicationsForHalfWidth}` +
        (row.requiredReplications === undefined
          ? ''
          : `  n to resolve this effect ≈ ${row.requiredReplications}`),
    );
  }
  for (const control of study.negativeControls) {
    lines.push(
      `  control ${control.label}: ${control.differing} of ${control.replications} replications ` +
        `differ; max |ΔTTD| ${control.maxAbsTtdDifference.toFixed(4)} s, ` +
        `max |ΔAWT| ${control.maxAbsAwtDifference.toFixed(4)} s; ` +
        `ΔTTD ${padVerdictWord(control.ttd.verdict)} ${interval(control.ttd.estimate)}`,
    );
    lines.push(`    predicted in advance: ${control.prediction}`);
  }
  return lines.join('\n');
}

function padVerdictWord(verdict: CellVerdict): string {
  return verdict.padEnd('INDISTINGUISHABLE'.length);
}

/** The case this study runs at, for a caller that wants the operating point without the run. */
export function disclosureCase(): BenchmarkCase {
  return DESTINATION_CASES[0] as BenchmarkCase;
}
