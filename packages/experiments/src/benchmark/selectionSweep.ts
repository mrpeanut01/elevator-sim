/**
 * **Phase 6c's sweep — eight pre-registered operating points, one criterion, one correction.**
 *
 * `DECISIONS.md` § D151 is this module's specification and it was committed **before any ΔTTD
 * existed**, for the reason § D139 gives about itself: a criterion written after a result is
 * indistinguishable from a criterion fitted to it. Nothing here is a choice this module made. The
 * cell set, the arms, the metric, the correction and what counts as accepted are all fixed there,
 * and the one thing this module may not do is add, drop, reweight or reorder a cell.
 *
 * ## The failure mode it exists to prevent
 *
 * § D145 measured Phase 6c at one operating point and refused it. A sweep is the obvious follow-up
 * and is also, run carelessly, **§ D139's fourth bad-criterion clause wearing a disguise** —
 * *widening the budget until the interval excludes zero*. Eight cells judged at α = 0.05 each carry
 * a family-wise error rate near 34 %, so a sweep that reports its best cell finds a winner about
 * one time in three when nothing is real. Hence:
 *
 * - **Holm–Bonferroni across the five PRIMARY cells**, and the three SECONDARY cells corrected as a
 *   **separate family** that may never be pooled with the primary one to enlarge either. An arm
 *   admitted only by excluding other arms is weaker evidence, and merging would launder that.
 * - **The resolution limit is measured on TTD at the cell**, not inherited from `docs/07` § 4's
 *   AWT-measured pair. TTD scale varies 2.5× across these cells, so one absolute figure cannot mean
 *   the same thing at each. § D140's raise stands: an interval that excludes zero at an effect
 *   below the cell's own limit is `NOT ACCEPTED`, never accepted-with-a-caveat.
 * - **The regime screen runs before any ΔTTD** and is a moderator for interpretation, never a
 *   filter for inclusion. All five primary cells run whatever it returns.
 *
 * ## What the screen is actually asking
 *
 * A selector choosing among shipped weight vectors can only pay for itself where there is something
 * to switch on, and *which pattern am I in* lives in the three detector inputs' **ratios** rather
 * than their level. `traffic/types.ts`'s `DemandPhase` carries `startIntensity` and `endIntensity`
 * — a scalar — and `generator.ts` applies one `intensity(t)` to every demand source, while
 * `splitOf(profile)` is read once per floor at plan time. So the directional split is fixed for the
 * whole run **by construction**, and a sweep that refuses everywhere may be refusing for a reason
 * that is not about selection at all. That is a materially different finding from *learned control
 * does not help*, and {@link screenRegimes} measures it rather than asserting it — including
 * {@link SplitDrift}, which reads the split off the generated trace in time bins and compares its
 * movement against the binomial noise floor.
 *
 * ## What is unchanged from § D145
 *
 * The gate is `ttdMeanS` and only `ttdMeanS`; costs are published beside it and never folded in;
 * every arm sees the same passenger traces; the policy is tuned on one seed set and validated on a
 * disjoint one; and the 2 s deadband known-answer check runs on the same search that fitted every
 * cell's policy. `runWeightSetSelectionStudy()` with no arguments is still § D145's exact run.
 */

import {
  armMembership,
  type MembershipRamp,
  type SelectorInput,
  type TrafficObservation,
  type WeightSetArm,
  WeightedCostDispatchPolicy,
  resolveDispatchConfig,
  runSimulation,
} from '@elevator-sim/core';

import type {
  DispatcherProfile,
  LoadedConfig,
  ResolvedBuilding,
  SelectionStageConfig,
  WeightSetSource,
} from '@elevator-sim/core';

import { studentTCdf, studentTQuantile } from '../reports/statistics.js';
import type { ReplicationMetric } from '../runner/metrics.js';
import type {
  DispatcherArmSpec,
  ExperimentResources,
  TrafficArmSpec,
} from '../runner/types.js';
import { replicationSeed } from '../runner/crn.js';
import {
  comparePaired,
  derivedProfile,
  loadResources,
  runGateExperiment,
  samplesOf,
} from '../validation/harness.js';

import { MATRIX_CELLS } from './matrix.js';
import { BENCHMARK_SEED } from './suite.js';
import {
  CENSUS_REPLICATIONS,
  SEARCH_CANDIDATES,
  SEARCH_REPLICATIONS,
  SELECTION_GATE,
  SELECTION_POINT,
  type ResolutionLimits,
  type SelectionCell,
  type SelectionCensus,
  type SelectionStudy,
  runDeadbandKnownAnswer,
  runWeightSetSelectionStudy,
  toResources,
  weightSetLibrary,
  type DeadbandKnownAnswer,
} from './weightSetSelection.js';

/* -------------------------------------------------------------------------- *
 * The cell set — § D151 § 1, and not one line of it is this module's choice
 * -------------------------------------------------------------------------- */

/** A cell of the sweep, with everything § D151 § 1 pre-registered about it. */
export interface SweepCell extends SelectionCell {
  readonly label: string;
  /** PRIMARY cells can accept the phase. SECONDARY cells are reported and cannot. */
  readonly family: 'primary' | 'secondary';
  /** § D151's pre-registered reference arm. The census re-derives it and any mismatch is reported. */
  readonly preRegisteredReference: string;
  /**
   * Arms excluded from reference-arm candidacy by their **ceiling**, never by their answer.
   * § D147's `CEILING_EXCLUDED_ARMS` device, and what admits the three secondary cells at all.
   */
  readonly ceilingExcludedArms: readonly string[];
  /** § D151's pre-registered `n`. Clamped further only by the declared arm set's own ceiling. */
  readonly replications: number;
  /** Present when the cell is a **derived** building rather than a shipped one. § D151 cell 5. */
  readonly derivedFrom?: { readonly building: string; readonly trafficProfile: string } | undefined;
}

/** § D145's own point shape, at another rate. Cells 1, 2 and 5 are this family. */
function interfloorMixAt(ratePctPop5min: number): TrafficArmSpec {
  return Object.freeze({
    ...SELECTION_POINT,
    id: `interfloor-mix-${ratePctPop5min.toFixed(1)}pct`,
    demand: Object.freeze({ ...SELECTION_POINT.demand, arrivalRatePctPop5min: ratePctPop5min }),
  });
}

/**
 * A shipped matrix cell's traffic arm, by id.
 *
 * Cells 3, 4, 6, 7 and 8 are operating points `matrix.ts` already ships and already censused, and
 * taking the spec from there rather than re-typing it is what stops the sweep silently measuring a
 * neighbouring point. A missing id throws rather than falling back.
 */
function matrixPoint(cellId: string): TrafficArmSpec {
  const cell = MATRIX_CELLS.find((candidate) => candidate.id === cellId);
  if (cell === undefined) {
    throw new Error(
      `matrix.ts declares no cell "${cellId}", so this sweep cell has no operating point. DECISIONS.md § D151 § 1 fixed the cell set; a cell that cannot be built must be reported, never substituted.`,
    );
  }
  return cell.traffic;
}

/**
 * **The five PRIMARY cells, and the sweep runs all five whatever the screen returns.**
 *
 * § D151 § 8 names dropping a primary cell that refused as one of the things that would make its
 * criterion a bad one, so the list is a frozen constant and no code path filters it.
 */
export const PRIMARY_CELLS: readonly SweepCell[] = Object.freeze([
  Object.freeze({
    id: 'midtown-interfloor-1.0pct',
    label: 'Midtown Office, interfloor-mix 1.0 %, 1800 s',
    family: 'primary' as const,
    building: 'midtown-office',
    point: interfloorMixAt(1),
    preRegisteredReference: 'collective',
    ceilingExcludedArms: Object.freeze([]),
    replications: 200,
  }),
  Object.freeze({
    id: 'midtown-interfloor-2.0pct',
    label: 'Midtown Office, interfloor-mix 2.0 %, 1800 s',
    family: 'primary' as const,
    building: 'midtown-office',
    point: interfloorMixAt(2),
    preRegisteredReference: 'auction-multi-round',
    ceilingExcludedArms: Object.freeze([]),
    replications: 200,
  }),
  Object.freeze({
    id: 'garden-residential-2pct',
    label: 'Garden Apartments, residential 2 %, 3600 s',
    family: 'primary' as const,
    building: 'garden-apartments',
    point: matrixPoint('garden-residential'),
    preRegisteredReference: 'zoned-uppeak',
    ceilingExcludedArms: Object.freeze([]),
    replications: 200,
  }),
  Object.freeze({
    id: 'garden-down-peak-2pct',
    label: 'Garden Apartments, down-peak 2 %, 3600 s',
    family: 'primary' as const,
    building: 'garden-apartments',
    point: matrixPoint('garden-down-peak'),
    preRegisteredReference: 'zoned-uppeak',
    ceilingExcludedArms: Object.freeze([]),
    replications: 200,
  }),
  Object.freeze({
    id: 'midtown-hotel-1.5pct',
    label: 'Midtown Office @ hotel profile, 1.5 %, 1800 s',
    family: 'primary' as const,
    building: 'midtown-office@hotel',
    // **The traffic-pattern axis, and the one place this module had to read § D151 rather than
    // copy it.** `SimulationDemandOptions` carries no traffic-profile id, so a profile can only be
    // swept by deriving a building — which is why § D151 declares the cell in advance rather than
    // letting it be a later convenience. The `directionalSplit` override the other midtown cells
    // carry is **dropped here**: § D151 says the cell "moves `batchSize` (2.0 vs 1.4), not only the
    // split", and an override would pin the split at 0.4/0.3/0.3 and leave `batchSize` as the only
    // thing that moved. Without it the `hotel` profile's own 0.40/0.40/0.20 stands against
    // `office-standard`'s 0.85/0.05/0.10, which is what a traffic-pattern axis is for.
    point: Object.freeze({
      id: 'hotel-1.5pct',
      durationS: 1800,
      reportWindow: 'full-run' as const,
      demand: Object.freeze({
        entranceWeights: Object.freeze({ G: 1 }),
        arrivalRatePctPop5min: 1.5,
        peakWindowS: 300,
      }),
    }),
    preRegisteredReference: 'collective',
    ceilingExcludedArms: Object.freeze([]),
    replications: 200,
    derivedFrom: Object.freeze({ building: 'midtown-office', trafficProfile: 'hotel' }),
  }),
]);

/**
 * **The three SECONDARY cells.** Reported with their exclusions named, corrected as their own
 * family, and a win at one of them does **not** accept the phase (§ D151 § 6).
 */
export const SECONDARY_CELLS: readonly SweepCell[] = Object.freeze([
  Object.freeze({
    id: 'secure-up-peak-2pct',
    label: 'Secure Tower, up-peak 2 %',
    family: 'secondary' as const,
    building: 'secure-tower',
    point: matrixPoint('secure-up-peak'),
    preRegisteredReference: 'auction-multi-round',
    ceilingExcludedArms: Object.freeze(['nearest-car']),
    replications: 126,
  }),
  Object.freeze({
    id: 'midtown-down-peak-1pct',
    label: 'Midtown Office, down-peak 1 %',
    family: 'secondary' as const,
    building: 'midtown-office',
    point: matrixPoint('midtown-down-peak'),
    preRegisteredReference: 'zoned-uppeak',
    ceilingExcludedArms: Object.freeze(['nearest-car']),
    replications: 200,
  }),
  Object.freeze({
    id: 'vertical-city-up-peak-1pct',
    label: 'Vertical City, up-peak 1 %',
    family: 'secondary' as const,
    building: 'vertical-city',
    point: matrixPoint('vertical-city-up-peak'),
    preRegisteredReference: 'collective',
    ceilingExcludedArms: Object.freeze(['destination-panel', 'predictive-balanced', 'nearest-car']),
    replications: 200,
  }),
]);

export const SWEEP_CELLS: readonly SweepCell[] = Object.freeze([
  ...PRIMARY_CELLS,
  ...SECONDARY_CELLS,
]);

/** The tuning seed, and the disjoint holdout the verdict is measured at. § D145's pair. */
export const SWEEP_TUNING_SEED = BENCHMARK_SEED;
export const SWEEP_HOLDOUT_SEED = BENCHMARK_SEED + 811;

/* -------------------------------------------------------------------------- *
 * Derived buildings — data, not code
 * -------------------------------------------------------------------------- */

/**
 * `midtown-office` re-pointed at another traffic profile, as a building the runner cannot tell
 * from an authored one.
 *
 * No floor of `midtown-office` declares its own `trafficProfile`, so the building-level id is the
 * whole of what governs every floor's rate, split and batch size — which is what makes this a
 * one-field derivation rather than a rewrite. Both the resolved view and the `config` it carries
 * are re-pointed, because `parse.ts` and the generator read different ones.
 */
export function derivedBuilding(
  base: ResolvedBuilding,
  id: string,
  trafficProfile: string,
): ResolvedBuilding {
  return Object.freeze({
    ...base,
    id,
    name: `${base.name} (${trafficProfile})`,
    trafficProfile,
    config: Object.freeze({ ...base.config, id, trafficProfile }),
  }) as ResolvedBuilding;
}

/** The sweep's resources: every shipped building, plus the derived ones its cells name. */
export function sweepResources(config: LoadedConfig): ExperimentResources {
  const buildingsById = new Map(config.buildingsById);
  for (const cell of SWEEP_CELLS) {
    if (cell.derivedFrom === undefined) continue;
    const base = buildingsById.get(cell.derivedFrom.building);
    if (base === undefined) {
      throw new Error(
        `Sweep cell "${cell.id}" derives from building "${cell.derivedFrom.building}", which data/buildings/ does not declare.`,
      );
    }
    buildingsById.set(cell.building, derivedBuilding(base, cell.building, cell.derivedFrom.trafficProfile));
  }
  return Object.freeze({ ...toResources(config), buildingsById });
}

/* -------------------------------------------------------------------------- *
 * § D151 § 5 — the regime screen, run before any ΔTTD
 * -------------------------------------------------------------------------- */

/**
 * A pattern is counted as a **regime** of the cell when it is preferred on at least this share of
 * post-warm-up observations.
 *
 * Declared here, before the screen runs, because a single transient sample is not a regime and a
 * threshold chosen after seeing the distribution would be a threshold chosen to produce a number.
 * The raw distinct count is reported beside it, so the floor cannot hide anything.
 */
export const REGIME_SHARE_FLOOR = 0.05;

/** The detector's own trailing window, and the warm-up this screen discards. `DISPATCH_DEFAULTS`. */
export const OBSERVATION_WINDOW_S = 300;

/** How the three directional shares moved within the run, against the noise they would move by. */
export interface SplitDrift {
  /** Passengers in the trace, summed over the screened seeds. */
  readonly passengers: number;
  readonly bins: number;
  /** Overall share of each direction category across the whole run. */
  readonly overall: Readonly<Record<string, number>>;
  /** Largest absolute deviation of any time-bin's share from the overall share, per category. */
  readonly maxBinDeviation: Readonly<Record<string, number>>;
  /**
   * Pearson's homogeneity statistic over the *bin × category* table, `sum (O-E)^2 / E` with
   * `E = n_bin * p_category`.
   *
   * The right statistic and not the first one this module used. The first divided each category's
   * largest bin deviation by the **average** binomial sd across bins, which understates the noise
   * in exactly the bins the largest deviation comes from — the sparse ones in a rise-and-fall
   * tail — and reported a 4.2 σ excursion where the table is homogeneous. Pearson weights every
   * cell by its own expectation, which is the whole difference.
   */
  readonly chiSquare: number;
  /** `(bins - 1) * (categories - 1)`. Zero when the cell has one direction category and cannot vary. */
  readonly degreesOfFreedom: number;
  /**
   * `(chiSquare - df) / sqrt(2 df)`, which is asymptotically standard normal under a **fixed**
   * split. This is the number the question *does the directional split vary within a run?* reduces
   * to: near zero means the composition is the same in every time bin up to sampling noise.
   */
  readonly standardizedDeviation: number;
}

/** One cell's regime screen. Reported for every cell, and it filters none of them. */
export interface RegimeScreen {
  readonly cellId: string;
  readonly seeds: readonly number[];
  readonly observations: number;
  readonly postWarmupObservations: number;
  /** Share of post-warm-up observations on which each pattern was the detector's preference. */
  readonly patternShares: Readonly<Record<string, number>>;
  /** Patterns preferred at all, however briefly. */
  readonly distinctPatternsPreferred: number;
  /** **The regime count**: patterns preferred on at least {@link REGIME_SHARE_FLOOR} of samples. */
  readonly regimeCount: number;
  /** Times the preference changed between consecutive post-warm-up observations. */
  readonly preferenceChanges: number;
  /** Median of each detector input over post-warm-up observations, passengers/s/car. */
  readonly medianRates: Readonly<Record<SelectorInput, number>>;
  /** Median directional **share** of each input, and the 5th/95th percentiles of it. */
  readonly medianShares: Readonly<Record<SelectorInput, number>>;
  readonly shareSpread: Readonly<Record<SelectorInput, number>>;
  /** 5th and 95th percentiles of the **level** — the summed rate. Moves where the mix does not. */
  readonly levelP05: number;
  readonly levelP95: number;
  /**
   * Median passengers counted inside the detector's whole 300 s trailing window.
   *
   * The interpretive number the mix statistics need, and the reason they are reported beside it:
   * the three rates are *counts* divided by `windowS * cars`, so at a handful of arrivals per
   * window the observed ratios move by counting noise alone. A screen that reported a moving ratio
   * without this figure would let sampling noise read as traffic variety.
   */
  readonly medianWindowArrivals: number;
  readonly cars: number;
  /** The trace-level answer to *does the directional split vary within a run?* */
  readonly splitDrift: SplitDrift;
}

/** The authored membership map as arms, without needing a weight vector for any of them. */
function screenArms(library: WeightSetSource): readonly WeightSetArm[] {
  const detector = library.patternSwitching.patternDetector;
  const membershipByPattern = detector.membership ?? {};
  const empty: ReadonlyMap<string, number> = new Map();
  return detector.patterns.map((patternId) => {
    const clauses = membershipByPattern[patternId] ?? {};
    const membership = new Map<SelectorInput, MembershipRamp>();
    for (const input of ['lobbyArrivalRate', 'interfloorRate', 'downPeakRate'] as const) {
      const ramp = clauses[input];
      if (ramp === undefined) continue;
      membership.set(input, [ramp[0] as number, ramp[1] as number]);
    }
    return Object.freeze({
      patternId,
      weightSetId: library.patternSwitching.weightSetsByPattern[patternId] ?? patternId,
      weights: empty,
      membership: membership as ReadonlyMap<SelectorInput, MembershipRamp>,
    });
  });
}

function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[index] as number;
}

/**
 * **The screen.** Measure, at one cell and before any ΔTTD, what the detector has to work with.
 *
 * Instrumented through `SimulationConfig.createPolicy` on a real run — the hook `sim/types.ts`
 * documents for *"instrumenting a real run, which is the only honest way to check a term is not
 * inert through the shipped path"* — rather than by re-deriving the observation outside the
 * simulator, which would answer a different question. `WeightedCostDispatchPolicy.observedTraffic`
 * is the detector's own reading, so what is screened is what the selector sees.
 *
 * Warm-up is discarded. The `ArrivalWindow` divides by the whole trailing window rather than by
 * elapsed time, so a run *begins* with every rate at zero and climbs into its pattern; counting
 * that ramp as a regime change would report a cold start as traffic variety at every cell.
 */
export async function screenRegimes(input: {
  readonly cell: SweepCell;
  readonly config: LoadedConfig;
  readonly resources: ExperimentResources;
  readonly profileId?: string | undefined;
  readonly seeds?: readonly number[] | undefined;
}): Promise<RegimeScreen> {
  const { cell, config } = input;
  const seeds = input.seeds ?? [SWEEP_TUNING_SEED, SWEEP_TUNING_SEED + 1, SWEEP_TUNING_SEED + 2];
  const profileId = input.profileId ?? cell.preRegisteredReference;
  const profile = config.dispatcherProfilesById.get(profileId);
  const building = input.resources.buildingsById.get(cell.building);
  if (profile === undefined || building === undefined) {
    throw new Error(`Regime screen: no profile "${profileId}" or building "${cell.building}".`);
  }
  const library = weightSetLibrary(config);
  const arms = screenArms(library);
  const cars = building.banks.reduce((total, bank) => total + bank.cars.length, 0);

  const samples: { at: number; traffic: TrafficObservation }[] = [];
  for (const seed of seeds) {
    class Screened extends WeightedCostDispatchPolicy {
      override dispatch(
        callId: string,
        cars: Parameters<WeightedCostDispatchPolicy['dispatch']>[1],
        at: number,
        context?: Parameters<WeightedCostDispatchPolicy['dispatch']>[3],
      ): ReturnType<WeightedCostDispatchPolicy['dispatch']> {
        const decision = super.dispatch(callId, cars, at, context);
        const traffic = this.observedTraffic;
        if (traffic !== undefined) samples.push({ at, traffic });
        return decision;
      }
    }
    runSimulation({
      building,
      dispatcherProfile: profile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed,
      durationS: cell.point.durationS as number,
      reportWindow: cell.point.reportWindow ?? 'full-run',
      demand: cell.point.demand,
      onTimeout: 'report',
      createPolicy: (candidate, options) =>
        new Screened(
          resolveDispatchConfig(candidate, {
            ...options,
            selection: { policy: 'fuzzy' },
            weightSets: library,
          }),
        ),
    });
  }

  const live = samples.filter((sample) => sample.at >= OBSERVATION_WINDOW_S);
  const preferredOf = (traffic: TrafficObservation): string => {
    let best = 0;
    let winner = 'none';
    for (const arm of arms) {
      const membership = armMembership(arm, traffic);
      if (membership > best) {
        best = membership;
        winner = arm.patternId;
      }
    }
    return winner;
  };

  const counts = new Map<string, number>();
  let preferenceChanges = 0;
  let previous: string | undefined;
  for (const sample of live) {
    const pattern = preferredOf(sample.traffic);
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
    if (previous !== undefined && previous !== pattern) preferenceChanges += 1;
    previous = pattern;
  }

  const inputs = ['lobbyArrivalRate', 'interfloorRate', 'downPeakRate'] as const;
  const rateSeries: Record<SelectorInput, number[]> = {
    lobbyArrivalRate: [],
    interfloorRate: [],
    downPeakRate: [],
  };
  const shareSeries: Record<SelectorInput, number[]> = {
    lobbyArrivalRate: [],
    interfloorRate: [],
    downPeakRate: [],
  };
  const levels: number[] = [];
  for (const sample of live) {
    const total = inputs.reduce((sum, id) => sum + sample.traffic[id], 0);
    if (!(total > 0)) continue;
    levels.push(total);
    for (const id of inputs) {
      rateSeries[id].push(sample.traffic[id]);
      shareSeries[id].push(sample.traffic[id] / total);
    }
  }
  for (const id of inputs) {
    rateSeries[id].sort((a, b) => a - b);
    shareSeries[id].sort((a, b) => a - b);
  }
  levels.sort((a, b) => a - b);

  const patternShares: Record<string, number> = {};
  for (const [pattern, count] of counts) patternShares[pattern] = count / Math.max(1, live.length);
  const named = Object.entries(patternShares).filter(([pattern]) => pattern !== 'none');

  return Object.freeze({
    cellId: cell.id,
    seeds: Object.freeze([...seeds]),
    observations: samples.length,
    postWarmupObservations: live.length,
    patternShares: Object.freeze(patternShares),
    distinctPatternsPreferred: named.length,
    regimeCount: named.filter(([, share]) => share >= REGIME_SHARE_FLOOR).length,
    preferenceChanges,
    medianRates: Object.freeze({
      lobbyArrivalRate: quantile(rateSeries.lobbyArrivalRate, 0.5),
      interfloorRate: quantile(rateSeries.interfloorRate, 0.5),
      downPeakRate: quantile(rateSeries.downPeakRate, 0.5),
    }),
    medianShares: Object.freeze({
      lobbyArrivalRate: quantile(shareSeries.lobbyArrivalRate, 0.5),
      interfloorRate: quantile(shareSeries.interfloorRate, 0.5),
      downPeakRate: quantile(shareSeries.downPeakRate, 0.5),
    }),
    shareSpread: Object.freeze({
      lobbyArrivalRate:
        quantile(shareSeries.lobbyArrivalRate, 0.95) - quantile(shareSeries.lobbyArrivalRate, 0.05),
      interfloorRate:
        quantile(shareSeries.interfloorRate, 0.95) - quantile(shareSeries.interfloorRate, 0.05),
      downPeakRate:
        quantile(shareSeries.downPeakRate, 0.95) - quantile(shareSeries.downPeakRate, 0.05),
    }),
    levelP05: quantile(levels, 0.05),
    levelP95: quantile(levels, 0.95),
    medianWindowArrivals: quantile(levels, 0.5) * OBSERVATION_WINDOW_S * cars,
    cars,
    splitDrift: splitDriftOf({ cell, config, building, profile, seeds }),
  });
}

/**
 * **Does the directional split vary within a run?** Read off the trace, not off the docstring.
 *
 * The generated trace carries every passenger's `category` — `incoming`, `outgoing` or
 * `interfloor` — and its `arrivalTimeS`. Binning by arrival time and comparing each bin's
 * category shares against the run's overall shares is a direct test: under a **fixed** split every
 * deviation is multinomial sampling noise around the same `p`, and `sqrt(p(1-p)/n_bin)` is the size
 * it should have. A split that really moved with the phase would put the early and late bins many
 * standard deviations apart.
 */
export function splitDriftOf(input: {
  readonly cell: SweepCell;
  readonly config: LoadedConfig;
  readonly building: ResolvedBuilding;
  readonly profile: DispatcherProfile;
  readonly seeds: readonly number[];
  readonly bins?: number | undefined;
}): SplitDrift {
  const bins = input.bins ?? 6;
  const durationS = input.cell.point.durationS as number;
  const totals = new Map<string, number>();
  const perBin: Map<string, number>[] = Array.from({ length: bins }, () => new Map<string, number>());
  const binCounts = new Array<number>(bins).fill(0);
  let passengers = 0;

  for (const seed of input.seeds) {
    const result = runSimulation({
      building: input.building,
      dispatcherProfile: input.profile,
      trafficProfiles: input.config.trafficProfiles,
      elevatorSpecs: input.config.elevatorSpecs,
      seed,
      durationS,
      reportWindow: input.cell.point.reportWindow ?? 'full-run',
      demand: input.cell.point.demand,
      onTimeout: 'report',
    });
    for (const passenger of result.trace.passengers) {
      const bin = Math.min(bins - 1, Math.floor((passenger.arrivalTimeS / durationS) * bins));
      if (bin < 0) continue;
      passengers += 1;
      binCounts[bin] = (binCounts[bin] ?? 0) + 1;
      totals.set(passenger.category, (totals.get(passenger.category) ?? 0) + 1);
      const bucket = perBin[bin] as Map<string, number>;
      bucket.set(passenger.category, (bucket.get(passenger.category) ?? 0) + 1);
    }
  }

  const overall: Record<string, number> = {};
  const maxBinDeviation: Record<string, number> = {};
  let chiSquare = 0;
  const liveBins = binCounts.filter((count) => count > 0).length;
  for (const [category, count] of totals) {
    const p = count / Math.max(1, passengers);
    overall[category] = p;
    let deviation = 0;
    for (let bin = 0; bin < bins; bin += 1) {
      const n = binCounts[bin] ?? 0;
      if (n === 0) continue;
      const observed = perBin[bin]?.get(category) ?? 0;
      deviation = Math.max(deviation, Math.abs(observed / n - p));
      const expected = n * p;
      if (expected > 0) chiSquare += (observed - expected) ** 2 / expected;
    }
    maxBinDeviation[category] = deviation;
  }

  const degreesOfFreedom = Math.max(0, (liveBins - 1) * (totals.size - 1));
  return Object.freeze({
    passengers,
    bins,
    overall: Object.freeze(overall),
    maxBinDeviation: Object.freeze(maxBinDeviation),
    chiSquare,
    degreesOfFreedom,
    standardizedDeviation:
      degreesOfFreedom === 0 ? 0 : (chiSquare - degreesOfFreedom) / Math.sqrt(2 * degreesOfFreedom),
  });
}

/**
 * What the **learned** arm's detector actually did, as opposed to what the shipped one would have.
 *
 * The § 5 screen is measured on the shipped detector at its authored gains, which is what § D151
 * § 5 asks for — *the selector's own switching margin*. But `selection.policy: 'contextual'`
 * multiplies each input by a **learned gain** before the memberships are evaluated, so the learned
 * policy partitions the same traffic differently, and the screen's regime count is therefore a
 * property of the cell rather than of the arm. Reported beside it so the two cannot be confused:
 * a cell the screen calls one-regime at which the learned arm visits two weight sets has not
 * contradicted the screen, it has reparameterized it.
 */
export interface LearnedRegimeTrace {
  /** Share of decisions on which each pattern's weight set was in force. `none` is abstention. */
  readonly weightSetShares: Readonly<Record<string, number>>;
  /** Distinct weight sets actually in force at some point, excluding abstention. */
  readonly distinctWeightSets: number;
  /** Times the pattern in force changed between consecutive decisions. */
  readonly patternChanges: number;
  readonly decisions: number;
  /** The replication seeds traced, as decimal strings — they are 64-bit and not `number`s. */
  readonly seeds: readonly string[];
}

/**
 * Instrument the fitted policy on the holdout traffic and record which weight set it held.
 *
 * Through `SimulationConfig.createPolicy` on real runs, reading `activePattern` — the policy's own
 * provenance accessor — rather than re-deriving the selection outside the simulator.
 */
export function traceLearnedRegimes(input: {
  readonly cell: SweepCell;
  readonly config: LoadedConfig;
  readonly resources: ExperimentResources;
  readonly referenceProfileId: string;
  readonly selection: SelectionStageConfig;
  readonly seeds: readonly bigint[];
}): LearnedRegimeTrace {
  const profile = input.config.dispatcherProfilesById.get(input.referenceProfileId);
  const building = input.resources.buildingsById.get(input.cell.building);
  if (profile === undefined || building === undefined) {
    throw new Error(`Cannot trace the learned arm at "${input.cell.id}".`);
  }
  const library = weightSetLibrary(input.config);
  const visits = new Map<string, number>();
  let patternChanges = 0;
  let previous: string | undefined;

  for (const seed of input.seeds) {
    class Traced extends WeightedCostDispatchPolicy {
      override dispatch(
        callId: string,
        cars: Parameters<WeightedCostDispatchPolicy['dispatch']>[1],
        at: number,
        context?: Parameters<WeightedCostDispatchPolicy['dispatch']>[3],
      ): ReturnType<WeightedCostDispatchPolicy['dispatch']> {
        const decision = super.dispatch(callId, cars, at, context);
        const pattern = this.activePattern ?? 'none';
        visits.set(pattern, (visits.get(pattern) ?? 0) + 1);
        if (previous !== undefined && previous !== pattern) patternChanges += 1;
        previous = pattern;
        return decision;
      }
    }
    runSimulation({
      building,
      dispatcherProfile: profile,
      trafficProfiles: input.config.trafficProfiles,
      elevatorSpecs: input.config.elevatorSpecs,
      seed,
      durationS: input.cell.point.durationS as number,
      reportWindow: input.cell.point.reportWindow ?? 'full-run',
      demand: input.cell.point.demand,
      onTimeout: 'report',
      createPolicy: (candidate, options) =>
        new Traced(
          resolveDispatchConfig(candidate, {
            ...options,
            selection: input.selection,
            weightSets: library,
          }),
        ),
    });
  }

  const decisions = [...visits.values()].reduce((total, count) => total + count, 0);
  const weightSetShares: Record<string, number> = {};
  for (const [pattern, count] of visits) weightSetShares[pattern] = count / Math.max(1, decisions);
  return Object.freeze({
    weightSetShares: Object.freeze(weightSetShares),
    distinctWeightSets: [...visits.keys()].filter((pattern) => pattern !== 'none').length,
    patternChanges,
    decisions,
    seeds: Object.freeze(input.seeds.map((seed) => seed.toString())),
  });
}

/* -------------------------------------------------------------------------- *
 * § D151 § 3 — the resolution limit, measured on TTD at the cell
 * -------------------------------------------------------------------------- */

/**
 * **The smallest detectable effect, and the formula is calibrated rather than asserted.**
 *
 * `docs/07` § 4 publishes its near-neighbour limit as *0.20 s at 80 % power*, and
 * `validation/crippledVariant.test.ts` is where that number comes from: a power curve over a ladder
 * of `distanceTravelled` weights, ten disjoint seed sets of n = 100 each, and the rung detected on
 * 8 of 10 is `+0.4` at a measured effect of 0.2002 s. The analytic equivalent of *"detected at 80 %
 * power against a two-sided 95 % paired-t"* is
 *
 * ```
 *   MDE = (t[1-alpha/2, n-1] + t[power, n-1]) * s_D / sqrt(n)
 * ```
 *
 * and on that same rung it returns **0.2165 s** against the empirical 0.2002 s — agreement to 8 %,
 * against a power estimate that only has ten seed sets behind it. So the formula reproduces § 4's
 * near-neighbour figure, and this module uses it to put the same definition on TTD at each cell
 * without paying for a ten-seed-set power curve per cell.
 *
 * **§ 4's two numbers were not computed the same way, and that is worth saying rather than
 * smoothing.** The structural pair (`eta` vs `nearest-car`) measured here has `s_D = 7.97 s` on AWT
 * at Midtown up-peak, which this formula prices at 2.23 s while § 4 publishes 1.9 s; 1.9 s is what
 * `1.96 * s_D / sqrt(n)` returns at § 4's own quoted `s_D`, which is a *just-significant* figure
 * rather than an 80 %-power one. This module uses the 80 %-power definition at both regimes because
 * that is the definition § 4's own label states, and because it is the **larger** of the two — a
 * raise rather than a weakening, which is the only direction `CLAUDE.md` § Working agreements
 * permits.
 *
 * Student-t rather than normal quantiles, because `docs/03` § Part 3 and the C19 correction fixed
 * `t[n-1]` at every `n` for this project after the deleted normal quantile understated a budget
 * table at every rung.
 */
export const RESOLUTION_POWER = 0.8;

export function smallestDetectableEffect(sdOfDifference: number, n: number): number {
  if (!Number.isFinite(sdOfDifference) || n < 2) return Number.NaN;
  const df = n - 1;
  return ((studentTQuantile(0.975, df) + studentTQuantile(RESOLUTION_POWER, df)) * sdOfDifference) /
    Math.sqrt(n);
}

/** What the probe measured, beside what § 4 would have said. */
export interface CellResolution extends ResolutionLimits {
  readonly cellId: string;
  readonly n: number;
  /** `s_D` of the near-neighbour probe: the reference arm against itself + 0.4·distanceTravelled. */
  readonly nearNeighbourSdS: number;
  /** Median `s_D` over the reference arm against each shipped weight set the selector may adopt. */
  readonly structuralSdS: number;
  /** Every structural probe pair, so a median is not taken on the reader's word. */
  readonly structuralPairs: readonly { readonly armId: string; readonly sdS: number }[];
  /** The cell's own TTD scale, so an absolute limit can be read relatively too. */
  readonly referenceTtdMeanS: number;
}

/**
 * Measure this cell's two TTD resolution limits, at the **tuning** seed.
 *
 * Two probe pairs, both pre-declared and neither of them an arm under test:
 *
 * - **Near-neighbour** — the reference profile against itself with `distanceTravelled` at `0.4`.
 *   `docs/07` § 4's own perturbation, and specifically the rung its published 0.20 s comes from.
 * - **Structural** — the reference profile against each shipped weight vector `weightSetsByPattern`
 *   names, because *the structural regime here* is precisely "the reference against one of the
 *   weight sets the selector may adopt". The library defines the set, so it is pre-registerable and
 *   cannot be fitted to a result. The median over the quotable ones is the limit; every pair is
 *   published.
 *
 * At the tuning seed and never the holdout seed, so the limit is not a function of the data it
 * grades. A limit measured on the arm's own paired spread at the verdict seed would make
 * *below the resolution limit* arithmetically identical to *the interval contains zero*, which
 * would quietly delete § D140's raise.
 */
export async function probeCellResolution(input: {
  readonly cell: SweepCell;
  readonly census: SelectionCensus;
  readonly resources: ExperimentResources;
  readonly config: LoadedConfig;
  readonly seed: number;
  readonly replications: number;
}): Promise<CellResolution> {
  const { cell, census } = input;
  const reference = input.resources.dispatcherProfilesById.get(census.referenceProfileId);
  if (reference === undefined) {
    throw new Error(`No profile "${census.referenceProfileId}" to probe the resolution limit with.`);
  }
  const library = weightSetLibrary(input.config);
  const weightSetIds = [
    ...new Set(Object.values(library.patternSwitching.weightSetsByPattern)),
  ].filter((id) => id !== census.referenceProfileId);

  const perturbed = derivedProfile(reference, `${reference.id}-nn`, {
    weights: { ...reference.weights, distanceTravelled: 0.4 },
  });
  const resources: ExperimentResources = Object.freeze({
    ...input.resources,
    dispatcherProfilesById: new Map([
      ...input.resources.dispatcherProfilesById,
      [perturbed.id, perturbed],
    ]),
  });

  const arms: (string | DispatcherArmSpec)[] = [
    census.referenceProfileId,
    perturbed.id,
    ...weightSetIds,
  ];
  const experiment = await runGateExperiment({
    id: `phase6c/resolution/${cell.id}`,
    seed: input.seed,
    building: cell.building,
    dispatchers: arms,
    traffic: cell.point,
    replications: input.replications,
    resources,
  });

  const base = samplesOf(experiment, census.referenceProfileId, SELECTION_GATE);
  const sdOf = (armId: string): number =>
    Math.sqrt(comparePaired(SELECTION_GATE, samplesOf(experiment, armId, SELECTION_GATE), base)
      .varianceOfDifference);

  const nearNeighbourSdS = sdOf(perturbed.id);
  const structuralPairs = weightSetIds
    .map((armId) => Object.freeze({ armId, sdS: sdOf(armId) }))
    .filter((pair) => Number.isFinite(pair.sdS));
  const sorted = [...structuralPairs].map((pair) => pair.sdS).sort((a, b) => a - b);
  const structuralSdS =
    sorted.length === 0
      ? Number.NaN
      : sorted.length % 2 === 1
        ? (sorted[(sorted.length - 1) / 2] as number)
        : (((sorted[sorted.length / 2 - 1] as number) + (sorted[sorted.length / 2] as number)) / 2);

  const referenceTtdMeanS = base.reduce((sum, value) => sum + value, 0) / Math.max(1, base.length);

  return Object.freeze({
    cellId: cell.id,
    n: input.replications,
    nearNeighbourSdS,
    structuralSdS,
    structuralPairs: Object.freeze(structuralPairs),
    referenceTtdMeanS,
    nearNeighbourS: smallestDetectableEffect(nearNeighbourSdS, input.replications),
    structuralS: smallestDetectableEffect(structuralSdS, input.replications),
    provenance: `measured on ttdMeanS at ${cell.id}, seed ${String(input.seed)}, n = ${String(input.replications)}, 80 % power against a two-sided 95 % paired-t`,
  });
}

/* -------------------------------------------------------------------------- *
 * § D151 § 3 — Holm–Bonferroni, per family
 * -------------------------------------------------------------------------- */

/** The two-sided paired-t p-value behind an interval, from the estimate the study already holds. */
export function pairedPValue(mean: number, standardError: number, n: number): number {
  if (!Number.isFinite(mean) || !Number.isFinite(standardError) || n < 2) return Number.NaN;
  if (standardError === 0) return mean === 0 ? 1 : 0;
  const t = Math.abs(mean / standardError);
  return 2 * (1 - studentTCdf(t, n - 1));
}

/** One member of a Holm family, after the correction. */
export interface HolmDecision {
  readonly key: string;
  readonly pValue: number;
  /** 1-based rank in ascending p order. */
  readonly rank: number;
  /** `alpha / (m - rank + 1)`, the level this member is actually judged at. */
  readonly alpha: number;
  /** Holm-adjusted p: `max` of `(m - j + 1) * p_(j)` over `j <= rank`, capped at 1. */
  readonly adjustedP: number;
  readonly rejected: boolean;
}

/**
 * **Holm–Bonferroni over one family.** Uniformly more powerful than plain Bonferroni at the same
 * family-wise error rate, which is why § D151 § 3 names it: the correction costs no sensitivity it
 * does not have to.
 *
 * Step-down, and the step-down is the whole of it — once a hypothesis fails to clear its own level,
 * every larger p-value in the family is retained regardless of what it would have cleared alone.
 * Ties break by key so the result is a function of the family and of nothing else (invariant 4).
 */
export function holmDecisions(
  family: readonly { readonly key: string; readonly pValue: number }[],
  alpha = 0.05,
): readonly HolmDecision[] {
  const m = family.length;
  const ordered = [...family].sort((a, b) =>
    a.pValue === b.pValue ? a.key.localeCompare(b.key) : a.pValue - b.pValue,
  );
  const decisions: HolmDecision[] = [];
  let stillRejecting = true;
  let runningMax = 0;
  ordered.forEach((member, index) => {
    const rank = index + 1;
    const level = alpha / (m - rank + 1);
    const clears = Number.isFinite(member.pValue) && member.pValue <= level;
    if (!clears) stillRejecting = false;
    runningMax = Math.max(runningMax, Math.min(1, (m - rank + 1) * member.pValue));
    decisions.push(
      Object.freeze({
        key: member.key,
        pValue: member.pValue,
        rank,
        alpha: level,
        adjustedP: runningMax,
        rejected: stillRejecting && clears,
      }),
    );
  });
  return Object.freeze(decisions);
}

/* -------------------------------------------------------------------------- *
 * The sweep
 * -------------------------------------------------------------------------- */

/** One cell's whole result: the screen, the limit, the study, and the corrected verdict. */
export interface SweepCellResult {
  readonly cell: SweepCell;
  readonly screen: RegimeScreen;
  readonly resolution: CellResolution;
  readonly study: SelectionStudy;
  /** The census's own answer, against § D151's pre-registration. A mismatch is reported, not fixed. */
  readonly referenceMatchesPreRegistration: boolean;
  /** The learned arm's uncorrected two-sided paired-t p-value on the gate metric. */
  readonly pValue: number;
  readonly holm: HolmDecision;
  /**
   * **The cell's verdict under § D151 § 6.** `ACCEPTED` requires all four: an interval excluding
   * zero on the better side, at the Holm-corrected level, at or above the cell's own TTD-measured
   * resolution limit, generalizing to the disjoint seed set.
   */
  readonly verdict: 'ACCEPTED' | 'NOT ACCEPTED';
  readonly verdictReason: string;
  /** § D151 § 5: a significant effect at a one-regime cell is a bug report, not a result. */
  readonly significantAtOneRegimeCell: boolean;
  /**
   * **Weight sets the selector may adopt whose vector is byte-identical to the reference's.**
   *
   * § D151 § 4 requires a high bit-identical count at a primary cell to be treated as a wiring bug
   * *until proven otherwise*, so the proof is measured rather than argued. The selector switches
   * **weights and nothing else** — deliberately, because `dispatch.callType` and
   * `dispatch.passengerAssignment` decide the passenger model and `comparabilityOf` lists nine
   * metrics that stop being comparable across it — and `data/dispatcher-profiles.json` authors
   * `eta` and `collective` with the *same* vector, `{ waitTime: 1.0 }`. So at a cell whose
   * reference is either of them, the `interfloor` regime selects a weight vector the run already
   * had, and every replication spent in that regime is bit-identical **by construction**. Named
   * here so the count can be read against the regime shares rather than against a prior.
   */
  readonly noOpWeightSets: readonly string[];
  /**
   * What the fitted policy actually held, measured on the holdout traffic.
   *
   * § D151 § 5's bug-report clause is about the **cell**'s regime count, and this is the arm's. The
   * two come apart, and when they do it is the learned gains that separated them: a contextual
   * policy scales each detector input before the memberships are read, so it can partition traffic
   * the shipped detector reads as one regime. A significant effect at a screen-one-regime cell is
   * investigated against this rather than dismissed against a prior.
   */
  readonly learnedRegimes: LearnedRegimeTrace;
}

export interface SelectionSweep {
  readonly tuningSeed: number;
  readonly holdoutSeed: number;
  readonly gateMetric: ReplicationMetric;
  readonly primary: readonly SweepCellResult[];
  readonly secondary: readonly SweepCellResult[];
  /** The known-answer check the policy cannot see. `docs/07` § 5's 2 s deadband, shipped at 8 s. */
  readonly deadband: DeadbandKnownAnswer;
  /** Cells at which the phase is accepted. Empty is an outcome § D151 § 9 explicitly permits. */
  readonly acceptedPrimaryCells: readonly string[];
  readonly refusedPrimaryCells: readonly string[];
  readonly verdict: 'ACCEPTED' | 'NOT ACCEPTED';
  readonly verdictReason: string;
}

export interface SelectionSweepOptions {
  readonly config?: LoadedConfig | undefined;
  readonly tuningSeed?: number | undefined;
  readonly holdoutSeed?: number | undefined;
  readonly cells?: readonly SweepCell[] | undefined;
  readonly censusReplications?: number | undefined;
  readonly searchCandidates?: number | undefined;
  readonly searchReplications?: number | undefined;
  readonly screenSeeds?: readonly number[] | undefined;
}

/**
 * **Run the sweep, in the order § D151 requires.**
 *
 * 1. **Every cell's regime screen, before any ΔTTD exists.** It moderates interpretation and
 *    filters nothing — all five primary cells run whatever it returns.
 * 2. Per cell: the census (which fixes the reference arm and the budget before a selector exists),
 *    then the TTD resolution limit at the **tuning** seed, then the search on the tuning seed, then
 *    the verdict on the **disjoint** holdout seed.
 * 3. Holm–Bonferroni across the five primary cells, and separately across the three secondary ones.
 *    The two families are never pooled.
 * 4. The 2 s deadband known-answer check, on the same search that fitted every cell's policy.
 */
export async function runSelectionSweep(
  options: SelectionSweepOptions = {},
): Promise<SelectionSweep> {
  const config = options.config ?? (await loadResources());
  const resources = sweepResources(config);
  const tuningSeed = options.tuningSeed ?? SWEEP_TUNING_SEED;
  const holdoutSeed = options.holdoutSeed ?? SWEEP_HOLDOUT_SEED;
  const cells = options.cells ?? SWEEP_CELLS;

  /* ---- 1. the screen, for every cell, before any ΔTTD --------------------- */
  const screens = new Map<string, RegimeScreen>();
  for (const cell of cells) {
    screens.set(
      cell.id,
      await screenRegimes({
        cell,
        config,
        resources,
        ...(options.screenSeeds === undefined ? {} : { seeds: options.screenSeeds }),
      }),
    );
  }

  /* ---- 2. per-cell census, limit, search, verdict ------------------------- */
  const partial: {
    cell: SweepCell;
    screen: RegimeScreen;
    resolution: CellResolution;
    study: SelectionStudy;
  }[] = [];
  for (const cell of cells) {
    let resolution: CellResolution | undefined;
    const study = await runWeightSetSelectionStudy({
      seed: tuningSeed,
      holdoutSeed,
      config,
      resources,
      cell,
      ceilingExcludedArms: cell.ceilingExcludedArms,
      replications: cell.replications,
      censusReplications: options.censusReplications ?? CENSUS_REPLICATIONS,
      searchCandidates: options.searchCandidates ?? SEARCH_CANDIDATES,
      searchReplications: options.searchReplications ?? SEARCH_REPLICATIONS,
      resolutionProbe: async (probe) => {
        resolution = await probeCellResolution({
          cell,
          census: probe.census,
          resources: probe.resources,
          config,
          seed: probe.seed,
          replications: probe.replications,
        });
        return resolution;
      },
    });
    if (resolution === undefined) throw new Error('unreachable: the resolution probe did not run');
    partial.push({ cell, screen: screens.get(cell.id) as RegimeScreen, resolution, study });
  }

  /* ---- 3. Holm, per family, never pooled ---------------------------------- */
  const library = weightSetLibrary(config);
  const sameVectorAs = (referenceId: string): readonly string[] => {
    const reference = library.weightsByProfileId.get(referenceId);
    if (reference === undefined) return Object.freeze([]);
    const equal = (other: ReadonlyMap<string, number>): boolean =>
      other.size === reference.size &&
      [...reference].every(([term, weight]) => other.get(term) === weight);
    return Object.freeze(
      [...new Set(Object.values(library.patternSwitching.weightSetsByPattern))].filter((id) => {
        const weights = library.weightsByProfileId.get(id);
        return weights !== undefined && equal(weights);
      }),
    );
  };

  const traceSeeds = [
    replicationSeed(holdoutSeed, 0),
    replicationSeed(holdoutSeed, 1),
    replicationSeed(holdoutSeed, 2),
  ];

  const gateOf = (study: SelectionStudy) =>
    study.arms.find((arm) => arm.armId === 'learned') as SelectionStudy['arms'][number];

  const familyOf = (family: 'primary' | 'secondary'): readonly SweepCellResult[] => {
    const members = partial.filter((row) => row.cell.family === family);
    const pValues = members.map((row) => {
      const gate = gateOf(row.study);
      return {
        key: row.cell.id,
        pValue: pairedPValue(gate.gate.estimate.mean, gate.gate.estimate.standardError, gate.gate.estimate.n),
      };
    });
    const decisions = new Map(holmDecisions(pValues).map((decision) => [decision.key, decision]));
    return Object.freeze(
      members.map((row) => {
        const gate = gateOf(row.study);
        const holm = decisions.get(row.cell.id) as HolmDecision;
        const better = gate.gate.estimate.mean < 0 && gate.gate.verdict === 'BETTER';
        const generalizes = row.study.holdoutVerdict === 'GENERALIZES';
        const accepted =
          better && holm.rejected && !gate.belowResolutionLimit && generalizes;
        const reasons: string[] = [];
        if (!better) reasons.push(`the interval does not exclude zero on the better side (${gate.gate.verdict})`);
        if (!holm.rejected) {
          reasons.push(
            `Holm retains it in the ${family} family (p = ${holm.pValue.toFixed(4)} against alpha ${holm.alpha.toFixed(5)}, adjusted p = ${holm.adjustedP.toFixed(4)})`,
          );
        }
        if (gate.belowResolutionLimit) {
          reasons.push(
            `the effect is below this cell's own TTD-measured ${gate.regime} resolution limit of ${gate.resolutionLimitS.toFixed(3)} s`,
          );
        }
        if (!generalizes) reasons.push('it does not generalize to the disjoint seed set');
        return Object.freeze({
          cell: row.cell,
          screen: row.screen,
          resolution: row.resolution,
          study: row.study,
          referenceMatchesPreRegistration:
            row.study.census.referenceProfileId === row.cell.preRegisteredReference,
          pValue: holm.pValue,
          holm,
          verdict: accepted ? ('ACCEPTED' as const) : ('NOT ACCEPTED' as const),
          verdictReason: accepted
            ? `ΔTTD excludes zero on the better side at the Holm-corrected level, at or above this cell's own TTD resolution limit, and generalizes.`
            : reasons.join('; '),
          significantAtOneRegimeCell: better && holm.rejected && row.screen.regimeCount <= 1,
          noOpWeightSets: sameVectorAs(row.study.census.referenceProfileId),
          learnedRegimes: traceLearnedRegimes({
            cell: row.cell,
            config,
            resources,
            referenceProfileId: row.study.census.referenceProfileId,
            selection: row.study.learned.winner.selection,
            seeds: traceSeeds,
          }),
        });
      }),
    );
  };

  const primary = familyOf('primary');
  const secondary = familyOf('secondary');

  /* ---- 4. the known answer the policy cannot see -------------------------- */
  const deadband = await runDeadbandKnownAnswer({
    seed: tuningSeed,
    candidates: options.searchCandidates ?? SEARCH_CANDIDATES,
    replications: options.searchReplications ?? SEARCH_REPLICATIONS,
    resources,
  });

  const accepted = primary.filter((row) => row.verdict === 'ACCEPTED').map((row) => row.cell.id);
  const refused = primary.filter((row) => row.verdict !== 'ACCEPTED').map((row) => row.cell.id);

  return Object.freeze({
    tuningSeed,
    holdoutSeed,
    gateMetric: SELECTION_GATE,
    primary,
    secondary,
    deadband,
    acceptedPrimaryCells: Object.freeze(accepted),
    refusedPrimaryCells: Object.freeze(refused),
    verdict: accepted.length > 0 ? ('ACCEPTED' as const) : ('NOT ACCEPTED' as const),
    verdictReason:
      accepted.length > 0
        ? `Phase 6c is ACCEPTED at ${accepted.join(', ')} and NOT ACCEPTED at ${refused.join(', ')}. There is no aggregate claim of the form "learned control works" — the status names the cells where it did and did not.`
        : `Phase 6c is NOT ACCEPTED at any of the ${String(primary.length)} PRIMARY cells. A secondary cell cannot accept the phase (§ D151 § 6), so Phase 6 remains partial.`,
  });
}

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

function signed(value: number, places = 3): string {
  if (!Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(places)}`;
}

function interval(estimate: { mean: number; lower: number; upper: number }, places = 3): string {
  return `${signed(estimate.mean, places)} [${signed(estimate.lower, places)}, ${signed(estimate.upper, places)}]`;
}

/** The whole sweep as a report, in the order § D151 requires it to be read. */
export function formatSelectionSweep(sweep: SelectionSweep): string {
  const lines: string[] = [
    'Phase 6c — the sweep, measured against DECISIONS.md § D151',
    '',
    `gate            ${sweep.gateMetric} (and only ${sweep.gateMetric})`,
    `tuning seed     ${String(sweep.tuningSeed)}`,
    `holdout seed    ${String(sweep.holdoutSeed)}  DISJOINT`,
    '',
    '§ 5 — THE REGIME SCREEN, reported before any ΔTTD',
    'cell                          regimes  distinct  changes  median mix (lobby/inter/down)  mix spread  level p05..p95  split drift',
  ];
  for (const row of [...sweep.primary, ...sweep.secondary]) {
    const s = row.screen;
    const mix = (['lobbyArrivalRate', 'interfloorRate', 'downPeakRate'] as const)
      .map((id) => (s.medianShares[id] * 100).toFixed(1))
      .join('/');
    const spread = Math.max(
      ...(['lobbyArrivalRate', 'interfloorRate', 'downPeakRate'] as const).map(
        (id) => s.shareSpread[id],
      ),
    );
    lines.push(
      `  ${row.cell.id.padEnd(28)}${String(s.regimeCount).padStart(4)}  ${String(s.distinctPatternsPreferred).padStart(8)}  ${String(s.preferenceChanges).padStart(7)}  ${mix.padStart(28)}  ${(spread * 100).toFixed(1).padStart(9)}%  ${s.levelP05.toFixed(4)}..${s.levelP95.toFixed(4)}  ${s.splitDrift.standardizedDeviation.toFixed(2)} sd (X2 ${s.splitDrift.chiSquare.toFixed(1)} on ${String(s.splitDrift.degreesOfFreedom)} df)`,
    );
  }

  lines.push(
    '',
    '§ 3 — THE RESOLUTION LIMIT, measured on TTD at the cell (docs/07 § 4 measured 0.20 / 1.9 s on AWT)',
    'cell                          n    TTD scale  near-neighbour s_D  limit    structural s_D  limit',
  );
  for (const row of [...sweep.primary, ...sweep.secondary]) {
    const r = row.resolution;
    lines.push(
      `  ${row.cell.id.padEnd(28)}${String(r.n).padStart(4)}  ${r.referenceTtdMeanS.toFixed(2).padStart(9)}  ${r.nearNeighbourSdS.toFixed(3).padStart(18)}  ${r.nearNeighbourS.toFixed(3).padStart(7)}  ${r.structuralSdS.toFixed(3).padStart(14)}  ${r.structuralS.toFixed(3).padStart(6)}`,
    );
  }

  for (const [family, rows] of [
    ['PRIMARY (Holm across five)', sweep.primary],
    ['SECONDARY (Holm across three, never pooled with the primary family)', sweep.secondary],
  ] as const) {
    lines.push('', `§ 6 — ${family}`);
    for (const row of rows) {
      const gate = row.study.arms.find((arm) => arm.armId === 'learned');
      const fuzzy = row.study.arms.find((arm) => arm.armId === 'fuzzy');
      if (gate === undefined || fuzzy === undefined) continue;
      lines.push(`  ${row.cell.label}  (${row.cell.id})`);
      lines.push(
        `    reference     ${row.study.census.referenceProfileId}` +
          (row.referenceMatchesPreRegistration
            ? ' (as pre-registered)'
            : ` — § D151 pre-registered "${row.cell.preRegisteredReference}"; REPORTED, NOT SUBSTITUTED`) +
          (row.cell.ceilingExcludedArms.length === 0
            ? ''
            : `  ceiling-excluded: ${row.cell.ceilingExcludedArms.join(', ')}`),
      );
      lines.push(
        `    budget        n = ${String(row.study.replications)}  (reference-arm ceiling ${row.study.census.ceiling === undefined ? 'none' : String(row.study.census.ceiling)}, all-arm ceiling ${row.study.census.allArmCeiling === undefined ? 'none' : String(row.study.census.allArmCeiling)})  CRN ${String(row.study.crnAligned)}  quotable ${String(row.study.quotable)}`,
      );
      lines.push(
        `    ΔTTD learned  ${interval(gate.gate.estimate)} ${gate.gate.verdict}  p = ${row.pValue.toFixed(5)}  Holm alpha ${row.holm.alpha.toFixed(5)} adj-p ${row.holm.adjustedP.toFixed(4)} → ${row.holm.rejected ? 'REJECT H0' : 'RETAIN H0'}`,
      );
      lines.push(
        `    ΔTTD fuzzy    ${interval(fuzzy.gate.estimate)} ${fuzzy.gate.verdict}`,
      );
      if (row.noOpWeightSets.length > 0) {
        lines.push(
          `    no-op sets    ${row.noOpWeightSets.join(', ')} carry the reference's own weight vector, so every replication spent in their regimes is bit-identical by construction`,
        );
      }
      const learned = row.learnedRegimes;
      lines.push(
        `    learned arm   held ${String(learned.distinctWeightSets)} weight set(s) over ${String(learned.decisions)} decisions, ${String(learned.patternChanges)} changes — ` +
          Object.entries(learned.weightSetShares)
            .sort((a, b) => b[1] - a[1])
            .map(([pattern, share]) => `${pattern} ${(share * 100).toFixed(1)}%`)
            .join(', '),
      );
      lines.push(
        `    limit         ${gate.regime} ${gate.resolutionLimitS.toFixed(3)} s  belowResolutionLimit=${String(gate.belowResolutionLimit)}  identical ${String(gate.identicalReplications)}/${String(row.study.replications)}`,
      );
      for (const cost of gate.costs) {
        lines.push(`    ${cost.metric.padEnd(21)} ${interval(cost.estimate)} ${cost.verdict}`);
      }
      lines.push(
        `    holdout       ${signed(row.study.holdoutMeanDeltaTtdS)} s on the disjoint seed — ${row.study.holdoutVerdict}`,
      );
      lines.push(`    VERDICT       ${row.verdict} — ${row.verdictReason}`);
      if (row.significantAtOneRegimeCell) {
        lines.push(
          '    ** § D151 § 5: significant at a cell the screen calls one-regime. This is a BUG REPORT, not a result. **',
        );
      }
    }
  }

  lines.push(
    '',
    `§ D139 known answer — the 2 s deadband, shipped at ${String(sweep.deadband.shippedThresholdS)} s`,
    `  the same search returned ${sweep.deadband.winnerThresholdS.toFixed(3)} s at ΔAWT ${signed(sweep.deadband.winnerMeanDeltaAwtS)} s — rediscovered=${String(sweep.deadband.rediscovered)}`,
    '',
    `PHASE 6c: ${sweep.verdict}`,
    `  ${sweep.verdictReason}`,
  );
  return lines.join('\n');
}

/* c8 ignore start -- the command shell. */
if (process.argv[1]?.endsWith('selectionSweep.js') === true) {
  process.stdout.write(`${formatSelectionSweep(await runSelectionSweep())}\n`);
}
/* c8 ignore stop */
