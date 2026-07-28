/**
 * **Phase 6 on the building its criterion actually names — Mixed-Use High-Rise.**
 *
 * ```ts
 * console.log(formatMixedUseHighRise(await runMixedUseHighRiseStudy()));
 * ```
 *
 * `docs/05-roadmap.md` § Phase 6 states the gate as *"beat the baseline on **TTD** with a paired-t
 * interval excluding zero, **and** report AWT and WT95 with explicit verdicts"* — the metric clause
 * as `DECISIONS.md` § D27 raised it. The clause D27 dropped without arguing was the **building**:
 * the original read *"…on the Mixed-Use High-Rise"*, and until this module no Phase 6 result was
 * measured there (§ D99). This is that measurement. Nothing here lowers anything; the metric raise
 * stands and the building clause is put back.
 *
 * ---
 *
 * # 1. The building's own scenario admits no paired comparison, and that is a measurement
 *
 * `data/buildings/mixed-use-high-rise.json` says in its own `$comment` that the scenario it encodes
 * is the **morning overlap** — office demand up through the ground lobby while residents ride *down*
 * out of floors 32–60 through the same four shuttles. Run it, and every profile in
 * `data/dispatcher-profiles.json` whose `role` is `baseline` fails outright:
 *
 * | mixed 40/30/30, 1800 s, n = 30 | conventional (all three baselines) | credential-aware |
 * |---|---|---|
 * | 1.5 % of population per 5 min | 0/30 quotable, 39.2 undelivered per run, **24.4 % unserved** | 30/30 quotable, 0 undelivered |
 * | 0.75 % | 0/30 quotable, 22.7 undelivered, **31.7 % unserved** | 30/30, 0 undelivered |
 * | 0.2 % | 0/30 quotable, 6.4 undelivered, **36.6 % unserved** | 30/30, 0 undelivered |
 *
 * **The unserved fraction rises as the load falls.** That is the signature of a structural refusal
 * rather than an overload: this building declares `accessZones` over floors 6–30 and 32–60, an
 * access-restricted *pickup* carries no credential under `up-down-buttons`, every car answers
 * `accessDenied`, and the call is permanently unassignable. Lowering the rate removes the traffic
 * that *can* be served and leaves the share that cannot, so the fraction goes up. It is the same
 * mechanism `accessControl.ts` § H-ACCESS-1 measures on Secure Tower, on a second building.
 *
 * So on this building's designed operating point **there is no baseline with a quotable AWT**, and
 * therefore no paired-t interval, and therefore nothing the criterion as written can be evaluated
 * against. `CLAUDE.md` forbids quoting a mean for a system whose queues grow without bound; a
 * categorical outcome is reported as counts, never as an interval.
 *
 * That is *not* the end of the answer, because it is a fact about a **directional regime** and not
 * about the building. Which is why this module keeps going.
 *
 * # 2. The regime that is comparable, and it is exactly one
 *
 * Every pickup must originate somewhere unrestricted, and on this building that means the ground
 * lobby: `G` is the only entrance and the only floor outside both access zones from which a bank
 * runs. So **incoming-only up-peak** is the one regime in which a conventional baseline can be
 * measured here at all. It is not a convenient choice — it is the only one, and § 1 is the
 * measurement that says so.
 *
 * It is also a regime in which a destination carries real information, which the shipped up-peak
 * points mostly do not: a passenger entering at `G` may be going to retail (2–5), to an office floor
 * (6–30), to the sky lobby (31), or to a residence (32–60) **via a transfer at 31** — three banks and
 * a two-leg journey behind one up button. The building's own `$comment` says the same thing from the
 * other side: *"Time-to-destination, not average waiting time, is the metric that matters here: a
 * residential journey is two trips plus a transfer."* The gate metric D27 chose is the metric this
 * building was written for.
 *
 * # 3. The operating points, and which of them are blind
 *
 * `arms.ts` § *Phase 6a* records that three of the five shipped points are near-**blind** to
 * destination information, and that a study run at a blind point reports "no effect" and is wrong
 * about why. So the rate is swept and each point's blindness is measured rather than assumed, by the
 * count of replications on which the paired difference is exactly zero.
 *
 * Censused at seed 20260726 over **1000 replications per arm**, up-peak, 900 s, peak-5min window —
 * the ceiling is the first replication at which an arm loses its AWT:
 *
 * | rate | `nearest-car` | `eta` / `collective` | `destination-eta`+ride | `destination-panel` | usable ceiling |
 * |---|---|---|---|---|---|
 * | 1 % | none in 1000 | none | none | none | **unbounded** |
 * | 2 % | **395** | none | none | none | **395** |
 * | 3 % | **22** | none | none | 481 | **22 — unusable** |
 * | 4 % | 250 | 987 | none | **206** | **206** |
 *
 * **3 % is excluded by its ceiling and not by its answer**, which is the distinction
 * `saturationCensus.test.ts` exists to keep honest: `nearest-car` loses its AWT on replication 22
 * there, so no budget in the project's 50–200 band can be spent at that rate with the naive baseline
 * in the cell. The row is published rather than dropped.
 *
 * Three points survive, and each gets a budget derived from **this building's** measured spread at a
 * pilot seed disjoint from the study seed (see {@link MixedUsePoint.budgetBasis}), never from another
 * study's `n`:
 *
 * | point | n | why that n |
 * |---|---|---|
 * | up-peak 1 % | 150 | **the declared blind control.** The gate difference against `eta` needs n ≈ 579 and the pilot puts it near zero with the *opposite* sign, so no affordable budget resolves it. Carried with its bit-identity count so an INDISTINGUISHABLE here is read as blindness, not as absence |
 * | **up-peak 2 %** | **238** | variance-derived: `ceil((z·s/h)²)` at `s = 5.36 s` (pilot sd of ΔTTD, the binding pair) and `h = |d|/1.5`. Under the 395 ceiling |
 * | **up-peak 4 %** | **200** | **ceiling-bound.** The variance-derived requirement is 666, the ceiling is 206, and 200 leaves six replications of margin. The contrast that needs 666 is reported unresolved rather than quoted |
 *
 * # 4. The result
 *
 * `destination-eta` **+ `weights.rideTime: 1`** is Phase 6a's accepted arm (Level 0 — the destination
 * priced, the landing still a button); `destination-panel` is Phase 6b's shipped profile (Level 1 —
 * the passenger told which car). The baselines are **every profile in `data/dispatcher-profiles.json`
 * carrying `role: 'baseline'`**, read out of the data rather than named here (invariant 7): three of
 * them — `nearest-car`, `eta`, `collective`.
 *
 * **The gate, ΔTTD, at up-peak 4 %, n = 200, D − baseline:**
 *
 * | | vs `nearest-car` | vs `eta` | vs `collective` |
 * |---|---|---|---|
 * | **Level 0** (`+ride1`) | `−21.239 [−22.793, −19.685]` **BETTER** | `−2.072 [−2.868, −1.277]` **BETTER** | `−2.116 [−2.908, −1.325]` **BETTER** |
 * | Level 1 (`panel`) | `−18.633 [−20.702, −16.563]` **BETTER** | `+0.534 [−0.855, +1.923]` INDIST. | `+0.490 [−0.902, +1.882]` INDIST. |
 *
 * **AWT and WT95 beside it, with verdicts, because § D27 says a cost hidden is a cost claimed:**
 *
 * | | ΔAWT vs `eta` | ΔWT95 vs `eta` | Δride vs `eta` |
 * |---|---|---|---|
 * | **Level 0** | `+0.876 [+0.703, +1.050]` **WORSE** | `+0.273 [−0.026, +0.571]` INDIST. | `−2.452 [−3.068, −1.835]` BETTER |
 * | Level 1 | `+3.190 [+2.463, +3.916]` **WORSE** | `+9.083 [+5.683, +12.484]` **WORSE** | `−3.126 [−3.785, −2.466]` BETTER |
 *
 * Four readings, and none of them is the headline alone.
 *
 * **The criterion is met on this building, by the Level-0 arm, at up-peak 4 %.** It beats all three
 * baseline-role profiles on TTD with intervals excluding zero, and AWT and WT95 are reported with
 * verdicts — one WORSE and one INDISTINGUISHABLE. § D27 is explicit that a WORSE AWT does not fail
 * the phase and omitting it does.
 *
 * **It is not met by the Level-1 panel, at any measured point.** Against `eta` and `collective` the
 * panel's TTD interval contains zero at every rate, and at 4 % it is `+9.083 [+5.683, +12.484]` s
 * WORSE on WT95 — the write-once promise (§ D29) binding under load, the same mechanism
 * `destinationDispatchContrast.ts` measures on Midtown. Level 1 buys in-car time and pays for it at
 * the landing, and on this building at this load it pays more than it buys.
 *
 * **It is not met at the lighter points, and the required-`n` says why rather than the verdict.**
 * At 2 % the Level-0 gate against `eta` is `−0.109 [−0.616, +0.399]` — INDISTINGUISHABLE, needing
 * n ≈ 5161 against a ceiling of 395. That is *permanently* unresolvable at that operating point in
 * the sense `docs/07-handoff.md` § 4 means it, not a budget that was too small.
 *
 * **The call type on its own is worth exactly zero here, and the study separates it out.** The
 * `destination-eta-unpriced` arm — destination disclosed and authorized, nothing pricing it — is
 * **bit-identical** to `eta` on all three up-peak points, 150/150, 238/238 and 200/200 paired
 * differences of exactly zero. That arm was the shipped profile until T30 authored a `rideTime`
 * weight onto it; the configuration is unchanged and only its id moved, for the reason
 * {@link DECOMPOSITION_ARM} gives. Every pickup is at `G`, which is in no access zone, so moving
 * information earlier is worth nothing until something reads it. The whole of the −2.072 s is the
 * *weight*, and that is a decomposition rather than an inference — the same one Phase 6a made on
 * Midtown, reproduced on the building the criterion names.
 *
 * # 5. What this module refuses to do
 *
 * **It does not raise the rate until the effect appears and stop there.** The whole 1 %–4 % sweep is
 * reported with its verdicts, the 1000-replication ceiling census is published including the 3 % row
 * that excludes itself, and the 1 % point is declared blind **in advance** rather than explained
 * afterwards. 4 % is the highest rate at which every arm keeps a quotable AWT over a usable budget,
 * which is `arms.ts`'s rule and not this module's.
 *
 * **It does not quote an interval where the baseline has none.** § 1 is counts, and every cell of a
 * point whose arms are not both quotable renders `UNQUOTABLE`.
 *
 * **It does not scalarize.** TTD, AWT, WT95 and in-car time each carry their own verdict, and the
 * wait-versus-ride trade stays the operator's (CLAUDE.md § Tuning discipline).
 */

import type { DispatcherProfile } from '@elevator-sim/core';

import type { ReplicationMetric } from '../runner/metrics.js';
import type { ExperimentResources, ExperimentResult, TrafficArmSpec } from '../runner/types.js';
import {
  cellOf,
  comparePaired,
  derivedProfile,
  digestsOf,
  loadResources,
  runGateExperiment,
  samplesOf,
  withProfiles,
} from '../validation/harness.js';

import { DESTINATION_DISPATCH_PROFILE } from './arms.js';
import {
  DISCLOSURE_BASELINE,
  DISCLOSURE_PROFILE,
  DISCLOSURE_UNPRICED_ARM,
  rideArmId,
} from './destinationDisclosure.js';
import { BENCHMARK_SEED } from './suite.js';
import { compareCell, type CellComparison } from './verdict.js';

/* -------------------------------------------------------------------------- *
 * The building, the arms, the metrics
 * -------------------------------------------------------------------------- */

/** The building `docs/05-roadmap.md` § Phase 6's criterion names. */
export const MIXED_USE_BUILDING = 'mixed-use-high-rise';

/** Phase 6a's accepted arm: the destination disclosed **and priced**. */
export const LEVEL_0_ARM = rideArmId(1);

/** Phase 6b's shipped arm: the passenger told which car to walk to. */
export const LEVEL_1_ARM = DESTINATION_DISPATCH_PROFILE;

/** The two Phase 6 candidates, in level order. */
export const MIXED_USE_CANDIDATES: readonly string[] = Object.freeze([LEVEL_0_ARM, LEVEL_1_ARM]);

/**
 * The destination call type with no `rideTime` weight — the **decomposition** arm.
 *
 * Not a candidate. It is in the experiment so that "the call type alone" and "the weight" can be
 * told apart by measurement rather than by argument, exactly as `destinationDisclosure.ts` does on
 * Midtown. Its result is a bit-identity count, not an interval.
 *
 * **Derived, not shipped, since T30.** It used to be `DISCLOSURE_PROFILE` itself, because the
 * shipped `destination-eta` authored a `callType` and weighted nothing that read the destination —
 * which is precisely why T30 authored `weights.rideTime: 0.5` on it. Binding this arm to the
 * shipped id would have turned the decomposition into a comparison between two *priced*
 * configurations and quietly falsified the sentence it exists to support. It is bound to the
 * configuration instead, and the identity counts are unchanged.
 */
export const DECOMPOSITION_ARM = DISCLOSURE_UNPRICED_ARM;

/**
 * **The naive baselines, read out of `data/` rather than listed here.**
 *
 * The criterion says *"the naive baselines"*, plural, and this repository already answers which
 * ones: `data/dispatcher-profiles.json` gives exactly three profiles `role: 'baseline'` —
 * `nearest-car` (pure distance), `eta` (minimum estimated wait) and `collective` (`eta` plus the
 * `noDirectionReversal` hard constraint, i.e. conventional collective control). Deriving the set
 * from the data is invariant 7: a fourth baseline authored tomorrow joins the table without a code
 * change, and a set written out here would silently not include it.
 */
export function baselineProfileIds(
  profiles: ReadonlyMap<string, DispatcherProfile>,
): readonly string[] {
  const found = [...profiles.values()]
    .filter((profile) => profile.role === 'baseline')
    .map((profile) => profile.id);
  if (found.length === 0) {
    throw new Error(
      'data/dispatcher-profiles.json declares no profile with role "baseline", so the criterion’s ' +
        '"naive baselines" has no referent. Phase 6 cannot be gated without one.',
    );
  }
  return Object.freeze(found);
}

/**
 * The metrics, and what each is for.
 *
 * | metric | role |
 * |---|---|
 * | `ttdMeanS` | **the gate** (§ D27), and the metric this building's own notes say is the one that matters here |
 * | `awtS` | the cost, reported with a verdict. § D27: omitting it fails the phase |
 * | `wt95S` | the tail, same status |
 * | `rideMeanS` | the **mechanism check** — destination grouping is supposed to buy in-car time |
 */
export const MIXED_USE_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'ttdMeanS',
  'awtS',
  'wt95S',
  'rideMeanS',
]);

/** Human labels, for the printed table only. Feeds no decision. */
export const MIXED_USE_METRIC_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ttdMeanS: 'TTD (s)',
  awtS: 'AWT (s)',
  wt95S: 'WT95 (s)',
  rideMeanS: 'ride (s)',
});

/** The gate, named once so a reader does not infer it from the table. */
export const MIXED_USE_GATE: ReplicationMetric = 'ttdMeanS';

/** Every derived profile this study registers. Config only, never code (invariant 7). */
export function mixedUseProfiles(destination: DispatcherProfile): readonly DispatcherProfile[] {
  return Object.freeze([
    derivedProfile(destination, DECOMPOSITION_ARM, {
      name: 'Destination disclosure, ride unpriced',
      weights: { rideTime: 0 },
    }),
    derivedProfile(destination, LEVEL_0_ARM, {
      name: 'Destination disclosure, rideTime 1',
      weights: { rideTime: 1 },
    }),
  ]);
}

/* -------------------------------------------------------------------------- *
 * The operating points
 * -------------------------------------------------------------------------- */

/** Incoming-only up-peak at one rate. The one regime § 1 leaves comparable. */
function upPeak(rate: number): TrafficArmSpec {
  return Object.freeze({
    id: `up-peak-${String(rate)}pct`,
    durationS: 900,
    demand: Object.freeze({
      directionalSplit: Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
      arrivalRatePctPop5min: rate,
      peakWindowS: 300,
    }),
  });
}

/** One (operating point, budget) the whole arm list is measured at. */
export interface MixedUsePoint {
  readonly id: string;
  readonly label: string;
  readonly traffic: TrafficArmSpec;
  readonly replications: number;
  /**
   * First replication index at which **some** arm loses its AWT, censused over 1000 replications at
   * {@link BENCHMARK_SEED}. `undefined` when none of the 1000 was invalid.
   */
  readonly ceiling: number | undefined;
  /** Where `replications` came from. Never another study's `n` (§ D99). */
  readonly budgetBasis: string;
  /** Whether this point is declared **blind** before the run. */
  readonly blind: boolean;
  /** Stated before the run, so it cannot be adopted afterwards. */
  readonly prediction: string;
}

export const MIXED_USE_POINTS: readonly MixedUsePoint[] = Object.freeze([
  Object.freeze({
    id: 'up-peak-1pct',
    label: 'Mixed-Use High-Rise, up-peak 1 % — the blind control',
    traffic: upPeak(1),
    replications: 150,
    ceiling: undefined,
    budgetBasis:
      'Not variance-derived, because no affordable budget is: the pilot puts ΔTTD against eta at +0.046 s with 48 of 100 replications bit-identical, so the required n is in the tens of thousands. 150 is the control budget, and the bit-identity count is what the point is carried for.',
    blind: true,
    prediction:
      'INDISTINGUISHABLE on TTD against eta and collective, and BETTER against nearest-car. At 1 % of population per 5 minutes the lobby plateau dominates and there is slack everywhere, so a destination changes few argmins — a blind point in exactly the sense arms.ts § Phase 6a records. Reported with its exactly-zero count so the INDISTINGUISHABLE is read as blindness rather than as absence of an effect.',
  }),
  Object.freeze({
    id: 'up-peak-2pct',
    label: 'Mixed-Use High-Rise, up-peak 2 % — variance-derived budget',
    traffic: upPeak(2),
    replications: 238,
    ceiling: 395,
    budgetBasis:
      'ceil((z95 · s / h)²) with s = 5.359 s, the pilot sd of ΔTTD on the binding pair (Level 0 − eta) at a seed disjoint from the study seed, and h = |d|/1.5 = 0.681 s. That is 238, under the measured ceiling of 395 (nearest-car’s first invalid replication over 1000).',
    blind: false,
    prediction:
      'BETTER on TTD against nearest-car by a wide margin. Against eta and collective the pilot puts the effect near 1 s with an sd near 5.4, so the interval may or may not clear zero at 238 — stated in advance as genuinely uncertain rather than predicted, and the required-n is reported either way.',
  }),
  Object.freeze({
    id: 'up-peak-4pct',
    label: 'Mixed-Use High-Rise, up-peak 4 % — ceiling-bound budget',
    traffic: upPeak(4),
    replications: 200,
    ceiling: 206,
    budgetBasis:
      'Ceiling-bound, not variance-derived: the pilot’s requirement for the hardest pair (Level 1 − eta, s = 7.430 s) is 666, and the measured ceiling is 206 — destination-panel’s first invalid replication at this rate over 1000. 200 leaves six replications of margin, and the pair needing 666 is reported unresolved rather than quoted.',
    blind: false,
    prediction:
      'The Level-0 arm BETTER on TTD against all three baselines and WORSE on AWT — the sign split Phase 6a measured on Midtown, at the rate where this building’s three banks and its transfer actually contend. The Level-1 panel worse than Level 0, because at this load cars fill and the write-once promise binds (§ D29).',
  }),
]);

/* -------------------------------------------------------------------------- *
 * § 1 — the coverage census, counts only
 * -------------------------------------------------------------------------- */

/** Mixed 40/30/30 traffic at one rate — the building's own designed scenario. */
function mixedDirectional(rate: number): TrafficArmSpec {
  return Object.freeze({
    id: `interfloor-mix-${String(rate)}pct`,
    durationS: 1800,
    reportWindow: 'full-run',
    demand: Object.freeze({
      directionalSplit: Object.freeze({ incoming: 0.4, outgoing: 0.3, interfloor: 0.3 }),
      arrivalRatePctPop5min: rate,
      peakWindowS: 300,
    }),
  });
}

/**
 * The three rates § 1 is measured at, **descending**.
 *
 * Descending on purpose: the claim is that lowering the load does not rescue the conventional arm,
 * and the evidence is that the unserved *fraction* goes up rather than down. A single rate could not
 * distinguish a structural refusal from an overload.
 */
export const COVERAGE_RATES: readonly number[] = Object.freeze([1.5, 0.75, 0.2]);

/** Replications for a categorical outcome. It needs far fewer than an interval. */
export const COVERAGE_REPLICATIONS = 30;

/** What one arm did at one rate. Counts and means of counts; never an interval. */
export interface CoverageCount {
  readonly rate: number;
  readonly armId: string;
  readonly replications: number;
  readonly withoutQuotableAwt: number;
  readonly notCompleted: number;
  readonly meanUndelivered: number;
  readonly meanUnservedFraction: number;
  readonly quotable: boolean;
}

/** § 1's whole result. */
export interface CoverageResult {
  readonly rows: readonly CoverageCount[];
  /** `true` when no baseline has a quotable AWT at any rate — the categorical claim. */
  readonly noBaselineIsQuotable: boolean;
  /** `true` when the unserved fraction is monotonically higher at every lower rate. */
  readonly unservedRisesAsLoadFalls: boolean;
  readonly verdict: 'STRUCTURAL' | 'LOAD-DRIVEN' | 'SERVABLE';
  readonly verdictReason: string;
}

/* -------------------------------------------------------------------------- *
 * The study
 * -------------------------------------------------------------------------- */

/** One operating point's answer. */
export interface MixedUsePointResult {
  readonly id: string;
  readonly label: string;
  readonly replications: number;
  readonly ceiling: number | undefined;
  readonly blind: boolean;
  readonly prediction: string;
  readonly budgetBasis: string;
  /** `false` when any arm in the point lost its AWT. Every cell is then `UNQUOTABLE`. */
  readonly quotable: boolean;
  readonly unquotableArms: readonly string[];
  /** `candidate − baseline`, one cell per (candidate, baseline, metric). */
  readonly cells: readonly CellComparison[];
  /** Replications on which {@link DECOMPOSITION_ARM} and `eta` produced identical metrics. */
  readonly decompositionIdentical: number;
  /** Whether replication `i` of every arm saw the same passenger population. */
  readonly crnAligned: boolean;
  readonly experiment: ExperimentResult;
  /** One cell. @throws Error when it was not measured. */
  readonly cell: (candidate: string, baseline: string, metric: ReplicationMetric) => CellComparison;
}

export interface MixedUseStudy {
  readonly seed: number | string;
  readonly building: string;
  readonly gateMetric: ReplicationMetric;
  readonly baselines: readonly string[];
  readonly candidates: readonly string[];
  readonly coverage: CoverageResult;
  readonly points: readonly MixedUsePointResult[];
  /** The gate verdict per (candidate, baseline, point), derived rather than written. */
  readonly criterion: CriterionVerdict;
}

/**
 * Whether Phase 6's criterion, as § D27 raised it, is met on this building — and by what.
 *
 * Derived from the cells rather than asserted. `MET` requires *some* candidate to beat **every**
 * baseline on the gate metric at *some* non-blind point, with AWT and WT95 carrying verdicts (which
 * they always do here — the cells exist by construction, which is what makes "omitting it fails the
 * phase" unfailable rather than unchecked).
 */
export interface CriterionVerdict {
  readonly met: boolean;
  /** `candidate@point` for every pair that beats all baselines on the gate. */
  readonly metBy: readonly string[];
  readonly reason: string;
}

export interface MixedUseOptions {
  readonly seed?: number | string | undefined;
  /** Overrides every point's own budget. For a cheap smoke run only. */
  readonly replications?: number | undefined;
  readonly points?: readonly MixedUsePoint[] | undefined;
  readonly coverageRates?: readonly number[] | undefined;
  readonly coverageReplications?: number | undefined;
  readonly resources?: ExperimentResources | undefined;
}

/**
 * Run both halves on Mixed-Use High-Rise, under common random numbers.
 *
 * One `runGateExperiment` per point with **every** arm in it, which is the whole of the pairing: the
 * trace is a pure function of `(seed, building, traffic)` and identical across arms, so `crnAligned`
 * is verified against the runner's own digests rather than assumed.
 */
export async function runMixedUseHighRiseStudy(
  options: MixedUseOptions = {},
): Promise<MixedUseStudy> {
  const seed = options.seed ?? BENCHMARK_SEED;
  const base = options.resources ?? withProfiles(await loadResources(), []);
  const destination = base.dispatcherProfilesById.get(DISCLOSURE_PROFILE);
  if (destination === undefined) {
    throw new Error(`data/dispatcher-profiles.json has no profile "${DISCLOSURE_PROFILE}".`);
  }
  const dispatcherProfilesById = new Map(base.dispatcherProfilesById);
  for (const profile of mixedUseProfiles(destination)) {
    dispatcherProfilesById.set(profile.id, profile);
  }
  const resources: ExperimentResources = Object.freeze({ ...base, dispatcherProfilesById });

  const baselines = baselineProfileIds(base.dispatcherProfilesById);
  const candidates = MIXED_USE_CANDIDATES;
  const arms = [...baselines, DECOMPOSITION_ARM, ...candidates];

  const coverage = await measureCoverage({
    seed,
    arms: [...baselines, DECOMPOSITION_ARM, LEVEL_1_ARM],
    baselines,
    rates: options.coverageRates ?? COVERAGE_RATES,
    replications: options.coverageReplications ?? COVERAGE_REPLICATIONS,
    resources,
  });

  const points: MixedUsePointResult[] = [];
  for (const point of options.points ?? MIXED_USE_POINTS) {
    const replications = options.replications ?? point.replications;
    const experiment = await runGateExperiment({
      id: `phase6/mixed-use/${point.id}`,
      seed,
      building: MIXED_USE_BUILDING,
      dispatchers: arms,
      traffic: point.traffic,
      replications,
      resources,
    });

    const unquotableArms = arms.filter((arm) => !cellOf(experiment, arm).aggregate.awtIsValid);
    const quotable = unquotableArms.length === 0;

    const cells: CellComparison[] = [];
    for (const candidate of candidates) {
      for (const baseline of baselines) {
        for (const metric of MIXED_USE_METRICS) {
          cells.push(
            compareCell({
              metric,
              armId: candidate,
              baselineId: baseline,
              candidate: samplesOf(experiment, candidate, metric),
              baseline: samplesOf(experiment, baseline, metric),
              quotable,
              admissibleReplications: point.ceiling,
            }),
          );
        }
      }
    }

    // The decomposition: is the shipped call type worth anything before something prices it?
    let decompositionIdentical = 0;
    for (let index = 0; index < replications; index += 1) {
      const same = MIXED_USE_METRICS.every((metric) => {
        const a = samplesOf(experiment, DECOMPOSITION_ARM, metric)[index];
        const b = samplesOf(experiment, DISCLOSURE_BASELINE, metric)[index];
        return a !== undefined && b !== undefined && a === b;
      });
      if (same) decompositionIdentical += 1;
    }

    const reference = digestsOf(experiment, arms[0] as string);
    const crnAligned = arms.every((arm) => {
      const digests = digestsOf(experiment, arm);
      return (
        digests.length === reference.length &&
        digests.every((digest, index) => digest === reference[index])
      );
    });

    points.push(
      Object.freeze({
        id: point.id,
        label: point.label,
        replications,
        ceiling: point.ceiling,
        blind: point.blind,
        prediction: point.prediction,
        budgetBasis: point.budgetBasis,
        quotable,
        unquotableArms: Object.freeze(unquotableArms),
        cells: Object.freeze(cells),
        decompositionIdentical,
        crnAligned,
        experiment,
        cell: (candidate: string, baseline: string, metric: ReplicationMetric) => {
          const found = cells.find(
            (entry) =>
              entry.armId === candidate && entry.baselineId === baseline && entry.metric === metric,
          );
          if (found === undefined) {
            throw new Error(
              `No cell for ${candidate} − ${baseline} on "${metric}" at "${point.id}".`,
            );
          }
          return found;
        },
      }),
    );
  }

  return Object.freeze({
    seed,
    building: MIXED_USE_BUILDING,
    gateMetric: MIXED_USE_GATE,
    baselines,
    candidates,
    coverage,
    points: Object.freeze(points),
    criterion: criterionVerdictOf(points, baselines, candidates),
  });
}

/** The gate verdict, derived from the cells. */
export function criterionVerdictOf(
  points: readonly MixedUsePointResult[],
  baselines: readonly string[],
  candidates: readonly string[],
): CriterionVerdict {
  const metBy: string[] = [];
  for (const point of points) {
    if (!point.quotable) continue;
    for (const candidate of candidates) {
      const beatsAll = baselines.every(
        (baseline) => point.cell(candidate, baseline, MIXED_USE_GATE).verdict === 'BETTER',
      );
      if (beatsAll) metBy.push(`${candidate}@${point.id}`);
    }
  }
  const met = metBy.length > 0;
  return Object.freeze({
    met,
    metBy: Object.freeze(metBy),
    reason: met
      ? `${metBy.join(', ')} beats every role="baseline" profile on ${MIXED_USE_GATE} with a paired-t interval excluding zero, and AWT and WT95 carry explicit verdicts beside it (DECISIONS.md § D27)`
      : `no candidate beats every role="baseline" profile on ${MIXED_USE_GATE} at any quotable point on ${MIXED_USE_BUILDING}. Phase 6's criterion is NOT met on the building it names`,
  });
}

/* -------------------------------------------------------------------------- *
 * § 1's measurement
 * -------------------------------------------------------------------------- */

interface CoverageInput {
  readonly seed: number | string;
  readonly arms: readonly string[];
  readonly baselines: readonly string[];
  readonly rates: readonly number[];
  readonly replications: number;
  readonly resources: ExperimentResources;
}

async function measureCoverage(input: CoverageInput): Promise<CoverageResult> {
  const rows: CoverageCount[] = [];
  for (const rate of input.rates) {
    const experiment = await runGateExperiment({
      id: `phase6/mixed-use/coverage-${String(rate)}`,
      seed: input.seed,
      building: MIXED_USE_BUILDING,
      dispatchers: [...input.arms],
      traffic: mixedDirectional(rate),
      replications: input.replications,
      resources: input.resources,
    });
    for (const armId of input.arms) {
      const cell = cellOf(experiment, armId);
      const records = cell.replications;
      const unserved = samplesOf(experiment, armId, 'unservedFraction').filter((value) =>
        Number.isFinite(value),
      );
      rows.push(
        Object.freeze({
          rate,
          armId,
          replications: records.length,
          withoutQuotableAwt: records.filter((record) => !record.awtIsValid).length,
          notCompleted: records.filter((record) => record.status !== 'completed').length,
          meanUndelivered:
            records.length === 0
              ? Number.NaN
              : records.reduce((total, record) => total + record.undeliveredCount, 0) /
                records.length,
          meanUnservedFraction:
            unserved.length === 0
              ? Number.NaN
              : unserved.reduce((total, value) => total + value, 0) / unserved.length,
          quotable: cell.aggregate.awtIsValid,
        }),
      );
    }
  }

  const baselineRows = rows.filter((row) => input.baselines.includes(row.armId));
  const noBaselineIsQuotable = baselineRows.every((row) => !row.quotable);

  // Descending rates: the fraction must be higher at each *lower* rate for the refusal to be
  // structural. An overload behaves the other way round.
  const meanAt = (rate: number): number => {
    const at = baselineRows.filter((row) => row.rate === rate);
    return at.reduce((total, row) => total + row.meanUnservedFraction, 0) / Math.max(1, at.length);
  };
  const rates = [...input.rates];
  let unservedRisesAsLoadFalls = rates.length > 1;
  for (let index = 1; index < rates.length; index += 1) {
    if (!(meanAt(rates[index] as number) > meanAt(rates[index - 1] as number))) {
      unservedRisesAsLoadFalls = false;
    }
  }

  const verdict = !noBaselineIsQuotable
    ? 'SERVABLE'
    : unservedRisesAsLoadFalls
      ? 'STRUCTURAL'
      : 'LOAD-DRIVEN';

  const worst = rates[rates.length - 1] as number;
  return Object.freeze({
    rows: Object.freeze(rows),
    noBaselineIsQuotable,
    unservedRisesAsLoadFalls,
    verdict,
    verdictReason:
      verdict === 'STRUCTURAL'
        ? `no role="baseline" profile has a quotable AWT at any of ${String(rates.length)} rates, and the unserved fraction RISES as the load falls — ${(meanAt(worst) * 100).toFixed(1)} % at ${String(worst)} % of population per 5 minutes against ${(meanAt(rates[0] as number) * 100).toFixed(1)} % at ${String(rates[0])} %. Lowering the rate removes the traffic that can be served and leaves the share that cannot, so the refusal is structural and no operating point in this regime admits a paired-t interval`
        : verdict === 'LOAD-DRIVEN'
          ? 'the baselines lose their AWT, but the unserved fraction falls with the load, so a lower rate would rescue them and the regime is not structurally closed'
          : 'at least one baseline has a quotable AWT here, so the regime admits a paired comparison after all',
  });
}

/* -------------------------------------------------------------------------- *
 * Reading a study
 * -------------------------------------------------------------------------- */

/** One point's row, or `undefined`. */
export function mixedUsePoint(
  study: MixedUseStudy,
  id: string,
): MixedUsePointResult | undefined {
  return study.points.find((point) => point.id === id);
}

/**
 * `n` the observed spread says a cell would need to clear zero, for every gate cell.
 *
 * Reported rather than acted on: a required `n` above the point's ceiling is the
 * `docs/07-handoff.md` § 4 statement — *not measurable at that budget*, permanently — and the
 * difference between that and "we should run more" is the whole of this project's discipline.
 */
export interface ResolutionRow {
  readonly pointId: string;
  readonly candidate: string;
  readonly baseline: string;
  readonly sdOfDifference: number;
  readonly effect: number;
  readonly requiredReplications: number | undefined;
  readonly ceiling: number | undefined;
  readonly resolvable: boolean | undefined;
}

/** The gate metric's resolution table. */
export function resolutionTable(study: MixedUseStudy): readonly ResolutionRow[] {
  const rows: ResolutionRow[] = [];
  for (const point of study.points) {
    for (const candidate of study.candidates) {
      for (const baseline of study.baselines) {
        const cell = point.cell(candidate, baseline, study.gateMetric);
        rows.push(
          Object.freeze({
            pointId: point.id,
            candidate,
            baseline,
            sdOfDifference: cell.sdOfDifference,
            effect: cell.estimate.mean,
            requiredReplications: cell.requiredReplications,
            ceiling: point.ceiling,
            resolvable: cell.resolvableWithinCeiling,
          }),
        );
      }
    }
  }
  return Object.freeze(rows);
}

/** The study as the console report the suite prints. Feeds no decision. */
export function formatMixedUseHighRise(study: MixedUseStudy): string {
  const lines: string[] = [
    `Phase 6 on ${study.building}, seed ${String(study.seed)}, gate ${study.gateMetric}`,
    `  baselines (role="baseline" in data/): ${study.baselines.join(', ')}`,
    '',
    `§ 1 coverage — the building’s own scenario, counts only, n = ${String(COVERAGE_REPLICATIONS)}`,
  ];
  for (const row of study.coverage.rows) {
    lines.push(
      `    ${String(row.rate).padStart(5)} %  ${row.armId.padEnd(22)} ` +
        `no-quotable-AWT ${String(row.withoutQuotableAwt).padStart(3)}/${row.replications}  ` +
        `undelivered/run ${row.meanUndelivered.toFixed(1).padStart(6)}  ` +
        `unserved ${(row.meanUnservedFraction * 100).toFixed(2)} %`,
    );
  }
  lines.push(`  VERDICT ${study.coverage.verdict} — ${study.coverage.verdictReason}`);

  for (const point of study.points) {
    lines.push('');
    lines.push(
      `§ ${point.label}  n=${String(point.replications)}  ` +
        `ceiling ${point.ceiling === undefined ? 'none in 1000' : String(point.ceiling)}  ` +
        `CRN ${point.crnAligned ? 'aligned' : 'MISALIGNED'}  ` +
        `${point.blind ? 'DECLARED BLIND  ' : ''}` +
        `decomposition identical ${String(point.decompositionIdentical)}/${String(point.replications)}` +
        (point.quotable ? '' : `  UNQUOTABLE: ${point.unquotableArms.join(', ')}`),
    );
    for (const cell of point.cells) {
      const { estimate } = cell;
      lines.push(
        `    ${cell.armId} − ${cell.baselineId}  ` +
          `${(MIXED_USE_METRIC_LABELS[cell.metric] ?? cell.metric).padEnd(9)} ` +
          `${estimate.mean.toFixed(3)} [${estimate.lower.toFixed(3)}, ${estimate.upper.toFixed(3)}]  ` +
          `${cell.verdict}  sd=${cell.sdOfDifference.toFixed(3)}  ` +
          `req n=${cell.requiredReplications === undefined ? '—' : String(cell.requiredReplications)}`,
      );
    }
  }

  lines.push('');
  lines.push(`CRITERION ${study.criterion.met ? 'MET' : 'NOT MET'} — ${study.criterion.reason}`);
  return lines.join('\n');
}

/** Whether an interval excludes zero, for a caller that wants the raw predicate. */
export function gateCellsOf(study: MixedUseStudy): readonly CellComparison[] {
  return study.points.flatMap((point) =>
    point.cells.filter((cell) => cell.metric === study.gateMetric),
  );
}

/** Re-exported so a caller can pair two arms without importing the harness. */
export { comparePaired };
