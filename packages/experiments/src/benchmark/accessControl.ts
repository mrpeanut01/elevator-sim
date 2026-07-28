/**
 * **Phase 6a, unit C2a — the access-control hypothesis, made falsifiable and then tested.**
 *
 * ```ts
 * console.log(formatAccessControlStudy(await runAccessControlStudy()));
 * ```
 *
 * `docs/05-roadmap.md` asserts that destination dispatch does better under access control
 * *"because authorization and optimization happen in the same step"*, and
 * `packages/core/src/dispatch/lifecycle.ts` repeats it in a docstring as fact. **This module's prior,
 * stated here before the result so it cannot be adopted afterwards, is that the sentence is false as
 * a claim about optimization and true as a claim about the credential.** The contract's pilot
 * measured the destination-information benefit as *smaller* on the access-controlled building once
 * the credential is present, and every replication this module runs is an attempt to make that
 * refutation fail.
 *
 * The hypothesis is therefore split into two claims with two different statistical shapes, because
 * they are two different claims and one of them cannot have an interval at all.
 *
 * ---
 *
 * # H-ACCESS-1 — coverage. Categorical, and it has no confidence interval on purpose.
 *
 * > Under conventional dispatch an access-controlled building with down and interfloor traffic is
 * > **not servable at all**; under credential-aware dispatch it is. On a building with no access
 * > zones the two are **identical**.
 *
 * An outcome that is categorical does not get an interval. `CLAUDE.md` § Statistical discipline
 * forbids quoting a mean for a system whose queues grow without bound, and `arms.ts`'s rule — a cell
 * has no interval unless *every* arm in it returns a valid one — is what forces the shape: the
 * conventional arm is absent from Secure Tower's interval table rather than present with a
 * suppressed mean. So H-ACCESS-1 is reported as **counts**: replications with no quotable AWT,
 * undelivered journeys per run, and unserved fraction, per arm per building, plus a bit-identity
 * check of the credential arm against the conventional arm on the building with no access zones.
 *
 * The mechanism is in `simulation.ts`'s own words: an access-restricted pickup carries no credential
 * under `up-down-buttons`, so every car returns `accessDenied` and the call is permanently
 * unassignable. The failure is **structural rather than load-driven**, which is why lowering the
 * arrival rate does not rescue it and why no operating point exists at which the two arms could be
 * compared with an interval.
 *
 * This module also settles the premise of DECISIONS.md § D30 by measurement rather than by citation:
 * a `destination-entry` arm that discloses the destination **without** the credential is run
 * alongside, and it is *worse than conventional*, not better.
 *
 * ---
 *
 * # H-ACCESS-2 — optimization. A difference-of-differences, and nothing less will do.
 *
 * > *Given* the credential, does moving the **destination** into the cost function help **more** on
 * > an access-controlled building than on one without access zones?
 *
 * Formally, with `Δ = TTD(credential + destination priced) − TTD(credential alone)` per building
 * under common random numbers:
 *
 * > `Δ_secure − Δ_midtown < 0`, with a 95 % interval on the difference-of-differences excluding zero.
 *
 * **A single-building interval cannot answer this and must not be quoted as if it could.** Secure
 * Tower alone shows a real gain that excludes zero, and read alone it looks exactly like
 * confirmation. It is only against Midtown's *larger* gain that it reads as refutation. The
 * roadmap's sentence is a claim about a specific mechanism — authorization and optimization in the
 * same step — and a single-building interval cannot distinguish that mechanism from *"moving any
 * information earlier helps everywhere"*. docs/09 § 8 names this as the most likely way Phase 6
 * publishes a wrong conclusion, **because the wrong answer is the comfortable one.**
 *
 * ## How the two buildings are combined, and why it is not a paired-t
 *
 * Within a building the two arms share passenger populations, so `Δ` is a paired difference and its
 * interval is the ordinary paired-t. **Across buildings there is no pairing**: replication `i` on
 * Midtown and replication `i` on Secure Tower are different buildings, different populations,
 * different everything, and pairing them by index would be pairing on nothing. So the two `Δ`
 * series are treated as what they are — two independent samples — and combined with a **Welch**
 * two-sample interval, which does not assume equal variances and does not assume equal `n`.
 * {@link differenceOfDifferences} is the whole of that arithmetic and it is eleven lines.
 *
 * ## Reported in both absolute and baseline-relative form
 *
 * The two buildings' baseline TTDs differ, so an absolute difference-of-differences is partly a
 * statement about the baselines. The relative form divides each replication's `Δ` by that
 * replication's own credential-arm TTD before combining, so it is a difference of *fractions*. The
 * verdict is taken only where the two agree; if they ever disagree, **that disagreement is the
 * result** and neither form may be quoted alone.
 */

import type { DispatcherProfile } from '@elevator-sim/core';

import { estimateMean, studentTQuantile } from '../reports/statistics.js';
import type { MeanEstimate } from '../reports/types.js';
import type { ReplicationMetric } from '../runner/metrics.js';
import type { ExperimentResources, ExperimentResult } from '../runner/types.js';
import {
  cellOf,
  comparePaired,
  derivedProfile,
  intervalExcludesZero,
  loadResources,
  runGateExperiment,
  samplesOf,
  withProfiles,
  type PairedComparison,
} from '../validation/harness.js';

import { MIDTOWN_INTERFLOOR_MIX, SECURE_INTERFLOOR_MIX, destinationCase } from './arms.js';
import {
  DISCLOSURE_BASELINE,
  DISCLOSURE_PROFILE,
  DISCLOSURE_UNPRICED_ARM,
  rideArmId,
} from './destinationDisclosure.js';
import { BENCHMARK_SEED } from './suite.js';

/* -------------------------------------------------------------------------- *
 * The arms
 * -------------------------------------------------------------------------- */

/**
 * The bare-kiosk arm: the destination is disclosed and the credential is **not**.
 *
 * Not a candidate dispatcher. It exists to measure the premise of DECISIONS.md § D30 rather than
 * cite it — `costRequestFor` forwards the destination and drops the credential under
 * `destination-entry`, so `estimateCost` asks *"may an unbadged passenger reach floor 27?"* and
 * answers `destinationAccessDenied` for every zoned floor.
 */
export const BARE_KIOSK_ARM = 'destination-entry-bare';

/**
 * The credential arm (E) and the credential-plus-priced-destination arm (F) of § H-ACCESS-2.
 *
 * **E is `destination-eta-unpriced`, a derived arm, and it must be.** `Δ` is defined above as
 * *`TTD(credential + destination priced) − TTD(credential alone)`*, so E has to be the credential
 * with the destination **not** priced — one variable between the two arms and nothing else. It used
 * to be the shipped `destination-eta` because the shipped profile *was* that configuration: it
 * authored a `callType` and weighted no term that read the destination, which is exactly the inert
 * shipped behaviour T30 removed by authoring `weights.rideTime: 0.5`.
 *
 * Leaving E pointed at the shipped profile after that change would have silently redefined the
 * study: `Δ` would have become the *marginal* effect from 0.5 to 1.0 rather than the effect of
 * pricing the destination at all. Measured, that is exactly what happens: the published
 * difference-of-differences `+0.982 [+0.584, +1.380]` falls to a mean of `+0.208` with an interval
 * still excluding zero on the positive side — the same sign, the same REFUTED verdict, and a fifth
 * of the magnitude, with nothing but a pin regeneration to mark the change of meaning. So E is
 * bound to the *configuration* rather than to whatever `data/` currently ships, and the pins are
 * unchanged.
 *
 * H-ACCESS-1 gains from the same binding for a second reason: its claim is about the **`callType`**,
 * and an arm that differed from the conventional baseline in a weight as well as a call type would
 * confound it. {@link CoverageResult.midtownNullIsIdentical} — the null half, bit-identity where
 * there are no access zones — is only a null at all for a configuration that prices nothing.
 */
export const CREDENTIAL_ARM = DISCLOSURE_UNPRICED_ARM;
export const CREDENTIAL_PLUS_DESTINATION_ARM = rideArmId(1);

/** Every derived profile this study registers. Config only, never code (invariant 7). */
export function accessControlProfiles(
  baseline: DispatcherProfile,
  destination: DispatcherProfile,
): readonly DispatcherProfile[] {
  return Object.freeze([
    derivedProfile(baseline, BARE_KIOSK_ARM, {
      name: 'Destination entry with no credential',
      dispatch: { callType: 'destination-entry' },
    }),
    derivedProfile(destination, CREDENTIAL_ARM, {
      name: 'Destination disclosure, ride unpriced',
      weights: { rideTime: 0 },
    }),
    derivedProfile(destination, CREDENTIAL_PLUS_DESTINATION_ARM, {
      name: 'Destination disclosure, rideTime 1',
      weights: { rideTime: 1 },
    }),
  ]);
}

/* -------------------------------------------------------------------------- *
 * H-ACCESS-1 — counts
 * -------------------------------------------------------------------------- */

/** What one arm did on one building. Counts and means of counts; never an interval. */
export interface CoverageRow {
  readonly armId: string;
  readonly building: string;
  readonly replications: number;
  /** Replications whose run did not reach the end of the demand horizon. */
  readonly notCompleted: number;
  /** Replications with no quotable AWT — saturated, censored or an empty window. */
  readonly withoutQuotableAwt: number;
  /** Mean undelivered journeys per replication. */
  readonly meanUndelivered: number;
  /** Mean fraction of legs that arrived in the window and never boarded. */
  readonly meanUnservedFraction: number;
  /** `true` when the whole cell has a quotable AWT. */
  readonly quotable: boolean;
}

/** H-ACCESS-1's whole result. */
export interface CoverageResult {
  readonly rows: readonly CoverageRow[];
  /**
   * Whether the credential arm is **bit-identical** to the conventional arm on the building with no
   * access zones. The null half of the claim, and it is an equality rather than an interval.
   */
  readonly midtownNullIsIdentical: boolean;
  readonly midtownDifferingReplications: number;
  /** The verdict, in one word, derived from the rows rather than written by hand. */
  readonly verdict: 'CONFIRMED' | 'REFUTED';
  readonly verdictReason: string;
}

/* -------------------------------------------------------------------------- *
 * H-ACCESS-2 — the difference-of-differences
 * -------------------------------------------------------------------------- */

/** One building's within-building paired difference, absolute and baseline-relative. */
export interface BuildingDelta {
  readonly building: string;
  readonly label: string;
  readonly n: number;
  /** `TTD(credential + destination) − TTD(credential)`, paired-t. */
  readonly absolute: PairedComparison;
  /** The same difference divided by each replication's own credential-arm TTD, as a fraction. */
  readonly relative: MeanEstimate;
  /** Mean TTD of the credential arm — the baseline the relative form is a fraction of. */
  readonly baselineTtd: number;
}

/**
 * A Welch two-sample interval on `mean(a) − mean(b)` for two **independent** samples.
 *
 * Independent, not paired: `a` is one building's per-replication differences and `b` is another's,
 * and there is no sense in which replication `i` of one corresponds to replication `i` of the other.
 * Welch rather than pooled because the two buildings' variances are not assumed equal — measured,
 * they are not.
 */
export function differenceOfDifferences(
  a: readonly number[],
  b: readonly number[],
  confidence = 0.95,
): MeanEstimate {
  const estA = estimateMean(a, { confidence });
  const estB = estimateMean(b, { confidence });
  const mean = estA.mean - estB.mean;
  const standardError = Math.hypot(estA.standardError, estB.standardError);
  const varA = estA.standardError ** 2;
  const varB = estB.standardError ** 2;
  const df =
    varA + varB === 0
      ? Number.NaN
      : (varA + varB) ** 2 / (varA ** 2 / (a.length - 1) + varB ** 2 / (b.length - 1));
  const quantile = Number.isFinite(df) ? studentTQuantile(1 - (1 - confidence) / 2, df) : Number.NaN;
  const halfWidth = quantile * standardError;
  return Object.freeze({
    n: Math.min(a.length, b.length),
    mean,
    stdDev: Number.NaN,
    standardError,
    confidence,
    method: 't' as const,
    degreesOfFreedom: df,
    halfWidth,
    lower: mean - halfWidth,
    upper: mean + halfWidth,
    min: Number.NaN,
    max: Number.NaN,
  });
}

/** H-ACCESS-2's result, in both forms, with the verdict the two agree on. */
export interface OptimizationResult {
  readonly secure: BuildingDelta;
  readonly midtown: BuildingDelta;
  /** `Δ_secure − Δ_midtown`, seconds. Negative would confirm the roadmap's mechanism claim. */
  readonly absolute: MeanEstimate;
  /** The same in baseline-relative form, as a fraction. */
  readonly relative: MeanEstimate;
  /**
   * `CONFIRMED` — both forms exclude zero on the negative side, i.e. the destination really does
   * help more where access is controlled. `REFUTED` — both exclude zero on the **positive** side:
   * it helps *less*, which is the pilot's direction. `INDISTINGUISHABLE` — at least one form
   * contains zero, i.e. the interaction is below the resolution limit of this budget on this
   * building set, which is itself informative. `DISAGREEMENT` — the two forms exclude zero in
   * opposite directions, in which case the disagreement is the result and neither may be quoted.
   */
  readonly verdict: 'CONFIRMED' | 'REFUTED' | 'INDISTINGUISHABLE' | 'DISAGREEMENT';
  readonly verdictReason: string;
}

/* -------------------------------------------------------------------------- *
 * The study
 * -------------------------------------------------------------------------- */

export interface AccessControlStudy {
  readonly seed: number | string;
  readonly replications: number;
  readonly coverageReplications: number;
  readonly coverage: CoverageResult;
  readonly optimization: OptimizationResult;
  readonly secureExperiment: ExperimentResult;
  readonly midtownExperiment: ExperimentResult;
}

export interface AccessControlOptions {
  readonly seed?: number | string | undefined;
  /** Budget for H-ACCESS-2's intervals. */
  readonly replications?: number | undefined;
  /** Budget for H-ACCESS-1's counts. A categorical outcome needs far fewer. */
  readonly coverageReplications?: number | undefined;
  readonly resources?: ExperimentResources | undefined;
}

const COVERAGE_ARMS = [DISCLOSURE_BASELINE, BARE_KIOSK_ARM, CREDENTIAL_ARM] as const;

/** Run both halves of the access-control hypothesis. */
export async function runAccessControlStudy(
  options: AccessControlOptions = {},
): Promise<AccessControlStudy> {
  const config = await loadResources();
  const baseline = config.dispatcherProfilesById.get(DISCLOSURE_BASELINE);
  const destination = config.dispatcherProfilesById.get(DISCLOSURE_PROFILE);
  if (baseline === undefined || destination === undefined) {
    throw new Error(
      `data/dispatcher-profiles.json must ship "${DISCLOSURE_BASELINE}" and "${DISCLOSURE_PROFILE}".`,
    );
  }
  const resources =
    options.resources ?? withProfiles(config, accessControlProfiles(baseline, destination));

  const replications = options.replications ?? destinationCase('secure-interfloor-mix').replications;
  const coverageReplications = options.coverageReplications ?? 30;
  const seed = options.seed ?? BENCHMARK_SEED;

  /* Every arm of both halves in one experiment per building, so H-ACCESS-1's counts and
     H-ACCESS-2's intervals are read off the same runs rather than off two budgets that might
     disagree. The coverage rows are taken over the first `coverageReplications` of them. */
  const arms = [...COVERAGE_ARMS, CREDENTIAL_PLUS_DESTINATION_ARM];
  const secureExperiment = await runGateExperiment({
    id: 'phase6a/access/secure-interfloor-mix',
    seed,
    building: 'secure-tower',
    dispatchers: arms,
    traffic: SECURE_INTERFLOOR_MIX,
    replications,
    resources,
  });
  const midtownExperiment = await runGateExperiment({
    id: 'phase6a/access/midtown-interfloor-mix',
    seed,
    building: 'midtown-office',
    dispatchers: arms,
    traffic: MIDTOWN_INTERFLOOR_MIX,
    replications,
    resources,
  });

  return Object.freeze({
    seed,
    replications,
    coverageReplications,
    coverage: coverageOf(secureExperiment, midtownExperiment, coverageReplications),
    optimization: optimizationOf(secureExperiment, midtownExperiment),
    secureExperiment,
    midtownExperiment,
  });
}

/* -------------------------------------------------------------------------- *
 * H-ACCESS-1
 * -------------------------------------------------------------------------- */

const IDENTITY_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'awtS',
  'wt95S',
  'ttdMeanS',
  'rideMeanS',
  'intervalS',
  'meanLoadFactor',
  'meanQueueLength',
]);

function coverageRow(
  experiment: ExperimentResult,
  armId: string,
  building: string,
  replications: number,
): CoverageRow {
  const cell = cellOf(experiment, armId);
  const records = cell.replications.slice(0, replications);
  const undelivered = records.map((record) => record.undeliveredCount);
  const unserved = samplesOf(experiment, armId, 'unservedFraction').slice(0, replications);
  const finite = unserved.filter((value) => Number.isFinite(value));
  return Object.freeze({
    armId,
    building,
    replications: records.length,
    notCompleted: records.filter((record) => record.status !== 'completed').length,
    withoutQuotableAwt: records.filter((record) => !record.awtIsValid).length,
    meanUndelivered:
      undelivered.length === 0
        ? Number.NaN
        : undelivered.reduce((total, value) => total + value, 0) / undelivered.length,
    meanUnservedFraction:
      finite.length === 0 ? Number.NaN : finite.reduce((total, value) => total + value, 0) / finite.length,
    quotable: cell.aggregate.awtIsValid,
  });
}

function coverageOf(
  secure: ExperimentResult,
  midtown: ExperimentResult,
  replications: number,
): CoverageResult {
  const rows = [
    ...COVERAGE_ARMS.map((armId) => coverageRow(secure, armId, 'secure-tower', replications)),
    ...COVERAGE_ARMS.map((armId) => coverageRow(midtown, armId, 'midtown-office', replications)),
  ];

  let differing = 0;
  for (let index = 0; index < replications; index += 1) {
    const same = IDENTITY_METRICS.every((metric) => {
      const a = samplesOf(midtown, DISCLOSURE_BASELINE, metric)[index];
      const b = samplesOf(midtown, CREDENTIAL_ARM, metric)[index];
      return a === b || (Number.isNaN(a as number) && Number.isNaN(b as number));
    });
    if (!same) differing += 1;
  }

  const conventionalOnSecure = rows.find(
    (row) => row.building === 'secure-tower' && row.armId === DISCLOSURE_BASELINE,
  ) as CoverageRow;
  const credentialOnSecure = rows.find(
    (row) => row.building === 'secure-tower' && row.armId === CREDENTIAL_ARM,
  ) as CoverageRow;

  const conventionalFails = !conventionalOnSecure.quotable && conventionalOnSecure.meanUndelivered > 0;
  const credentialServes = credentialOnSecure.quotable && credentialOnSecure.meanUndelivered === 0;
  const confirmed = conventionalFails && credentialServes && differing === 0;

  return Object.freeze({
    rows: Object.freeze(rows),
    midtownNullIsIdentical: differing === 0,
    midtownDifferingReplications: differing,
    verdict: confirmed ? 'CONFIRMED' : 'REFUTED',
    verdictReason: confirmed
      ? `conventional dispatch leaves ${conventionalOnSecure.meanUndelivered.toFixed(1)} journeys per run undelivered on the access-controlled building and has no quotable AWT on ${conventionalOnSecure.withoutQuotableAwt} of ${conventionalOnSecure.replications} replications, while the credential arm completes every one with none undelivered — and the two are bit-identical on the building with no access zones`
      : `at least one leg of the claim failed: conventional unquotable=${String(!conventionalOnSecure.quotable)}, credential serves=${String(credentialServes)}, Midtown differing replications=${differing}`,
  });
}

/* -------------------------------------------------------------------------- *
 * H-ACCESS-2
 * -------------------------------------------------------------------------- */

function buildingDeltaOf(
  experiment: ExperimentResult,
  building: string,
  label: string,
): BuildingDelta {
  const credential = samplesOf(experiment, CREDENTIAL_ARM, 'ttdMeanS');
  const both = samplesOf(experiment, CREDENTIAL_PLUS_DESTINATION_ARM, 'ttdMeanS');
  const absolute = comparePaired('ttdMeanS', both, credential);
  const relativeSamples = both.map((value, index) => {
    const base = credential[index] as number;
    return base === 0 ? Number.NaN : (value - base) / base;
  });
  return Object.freeze({
    building,
    label,
    n: absolute.n,
    absolute,
    relative: estimateMean(relativeSamples.filter((value) => Number.isFinite(value))),
    baselineTtd: absolute.baselineMean,
  });
}

function optimizationOf(
  secureExperiment: ExperimentResult,
  midtownExperiment: ExperimentResult,
): OptimizationResult {
  const secure = buildingDeltaOf(secureExperiment, 'secure-tower', 'Secure Tower');
  const midtown = buildingDeltaOf(midtownExperiment, 'midtown-office', 'Midtown Office');

  const absolute = differenceOfDifferences(
    secure.absolute.differences,
    midtown.absolute.differences,
  );
  const relative = differenceOfDifferences(
    relativeDifferencesOf(secureExperiment),
    relativeDifferencesOf(midtownExperiment),
  );

  const sign = (estimate: MeanEstimate): -1 | 0 | 1 =>
    !intervalExcludesZero(estimate) ? 0 : estimate.mean < 0 ? -1 : 1;
  const signs = [sign(absolute), sign(relative)];
  const verdict =
    signs[0] === 0 || signs[1] === 0
      ? 'INDISTINGUISHABLE'
      : signs[0] !== signs[1]
        ? 'DISAGREEMENT'
        : signs[0] === -1
          ? 'CONFIRMED'
          : 'REFUTED';

  const reasons: Readonly<Record<typeof verdict, string>> = {
    CONFIRMED:
      'both the absolute and the baseline-relative difference-of-differences exclude zero on the negative side: pricing the destination really does buy more where access is controlled',
    REFUTED:
      'both the absolute and the baseline-relative difference-of-differences exclude zero on the POSITIVE side: given the credential, pricing the destination buys LESS on the access-controlled building, not more — the saving the roadmap attributes to the same-step mechanism is entirely in the credential (H-ACCESS-1)',
    INDISTINGUISHABLE:
      'at least one form of the difference-of-differences contains zero, so the interaction is below the resolution limit of this budget on this building set — which is itself a result about the roadmap’s mechanism claim rather than a failure to measure',
    DISAGREEMENT:
      'the absolute and baseline-relative forms exclude zero in OPPOSITE directions. Neither may be quoted alone; the disagreement is the result',
  };

  return Object.freeze({
    secure,
    midtown,
    absolute,
    relative,
    verdict,
    verdictReason: reasons[verdict],
  });
}

function relativeDifferencesOf(experiment: ExperimentResult): readonly number[] {
  const credential = samplesOf(experiment, CREDENTIAL_ARM, 'ttdMeanS');
  const both = samplesOf(experiment, CREDENTIAL_PLUS_DESTINATION_ARM, 'ttdMeanS');
  return both
    .map((value, index) => {
      const base = credential[index] as number;
      return base === 0 ? Number.NaN : (value - base) / base;
    })
    .filter((value) => Number.isFinite(value));
}

/* -------------------------------------------------------------------------- *
 * Formatting
 * -------------------------------------------------------------------------- */

function interval(estimate: MeanEstimate, places = 3): string {
  const one = (value: number): string => {
    if (!Number.isFinite(value)) return 'n/a';
    const text = value.toFixed(places);
    return text.startsWith('-') ? `−${text.slice(1)}` : `+${text}`;
  };
  return `${one(estimate.mean)} [${one(estimate.lower)}, ${one(estimate.upper)}]`;
}

/** The study as the console report the suite prints. Feeds no decision. */
export function formatAccessControlStudy(study: AccessControlStudy): string {
  const lines: string[] = [];
  lines.push(
    `H-ACCESS-1 — coverage, counts only, n = ${study.coverageReplications}, seed ${String(study.seed)}`,
  );
  for (const row of study.coverage.rows) {
    lines.push(
      `  ${row.building.padEnd(14)} ${row.armId.padEnd(24)} ` +
        `no-quotable-AWT ${String(row.withoutQuotableAwt).padStart(3)}/${row.replications}  ` +
        `not-completed ${String(row.notCompleted).padStart(3)}/${row.replications}  ` +
        `undelivered/run ${row.meanUndelivered.toFixed(1).padStart(6)}  ` +
        `unserved ${(row.meanUnservedFraction * 100).toFixed(2)} %`,
    );
  }
  lines.push(
    `  Midtown null: credential arm differs from conventional on ` +
      `${study.coverage.midtownDifferingReplications} of ${study.coverageReplications} replications`,
  );
  lines.push(`  VERDICT ${study.coverage.verdict} — ${study.coverage.verdictReason}`);

  lines.push('');
  lines.push(
    `H-ACCESS-2 — optimization, difference-of-differences, n = ${study.replications} per building`,
  );
  for (const delta of [study.optimization.secure, study.optimization.midtown]) {
    lines.push(
      `  Δ ${delta.label.padEnd(14)} absolute ${interval(delta.absolute.estimate)} s  ` +
        `relative ${interval(delta.relative, 5)}  baseline TTD ${delta.baselineTtd.toFixed(3)} s  ` +
        `rho ${delta.absolute.correlation.toFixed(3)}  zeros ${delta.absolute.exactZeroCount}/${delta.absolute.n}`,
    );
  }
  lines.push(`  Δ_secure − Δ_midtown, absolute: ${interval(study.optimization.absolute)} s`);
  lines.push(`  Δ_secure − Δ_midtown, relative: ${interval(study.optimization.relative, 5)}`);
  lines.push(`  VERDICT ${study.optimization.verdict} — ${study.optimization.verdictReason}`);
  return lines.join('\n');
}
