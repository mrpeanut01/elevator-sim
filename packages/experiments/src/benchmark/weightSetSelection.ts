/**
 * **Phase 6c's acceptance measurement, and Phase 7's fuzzy detector, over one mechanism.**
 *
 * `core`'s `dispatch/selector.ts` is the mechanism: a weight-set selector consulted at decision
 * time, off by default, with hysteresis and no random draw. This module is what measures it, and
 * it measures two different claims that must not be run together:
 *
 * | half | question | classification |
 * |---|---|---|
 * | {@link measureWeightSetSelectionLiveness} | does the selector change **car trajectories**? | `'no-intervals'` — driven by `livenessSuite.ts` |
 * | {@link runWeightSetSelectionStudy} | does the **learned** selector clear Phase 6c's gate? | publishes intervals — driven by `regeneratePins.ts` |
 *
 * ## Liveness is measured on trajectories, not on a mean
 *
 * `core/src/sim/seam.test.ts`'s docstring is the reason: a mean is precisely the statistic that
 * hides a structural difference, and two configurations that dispatch differently can agree on
 * AWT to four decimal places. So the liveness half compares the **`travelSamples` sequence** —
 * `RunRecord`'s per-move record of where the *cars* went, which `metrics/types.ts` introduces
 * with exactly this distinction: *"Passenger records say where passengers went; they cannot say
 * where the cars went."*
 *
 * The pair it compares is the one review finding #5 prescribed: two configurations differing
 * **only** in `weightSetsByPattern`, on one seed. Nothing else moves — same building, same
 * traffic, same profile, same detector, same hysteresis, same membership map.
 *
 * ## The acceptance half, and the criterion it is bound to
 *
 * `DECISIONS.md` § D126 fixed Phase 6c's criterion before this code existed, and the shape of
 * this function is that document read top to bottom:
 *
 * - **Gate on TTD, and only TTD.** `core`'s `comparabilityOf` lists AWT and WT95 among nine
 *   metrics that stop being comparable across the two passenger models. AWT, WT95 and the energy
 *   proxy are published **beside** the verdict and never folded into it — § D100 for the first
 *   two, [§ D106](../../../../DECISIONS.md) for energy, which is *"an axis, never a score"*.
 * - **The reference arm is the best shipped profile at the operating point**, established by a
 *   census here and not chosen after seeing the result. Not `nearest-car`: `docs/07` § 4 records
 *   it as the only profile that saturates and a poor reference arm.
 * - **The budget comes from this cell's own saturation census.** `docs/07` § 4: a ceiling belongs
 *   to a *(building, traffic, seed)*, and this repository has twice inherited one and twice
 *   corrected it.
 * - **Tuned on one seed set, validated on a disjoint one, both printed**, with a holdout verdict.
 * - **An effect below the point's resolution limit is reported below the resolution limit.**
 *   Two numbers, not one: ~0.20 s for near-neighbour weight vectors and ~1.9 s for structurally
 *   different dispatchers, and {@link SelectionArmResult.regime} says which applies.
 * - **A bit-identical result is a wiring bug until proven otherwise.** `compareCell` classifies
 *   an all-zero difference `IDENTICAL` rather than as a small effect, and this study reports the
 *   count rather than the interval.
 *
 * ## One cell by default, and eight when the sweep asks
 *
 * Every entry point here takes an optional {@link SelectionCell} and defaults to § D145's own
 * operating point, so `runWeightSetSelectionStudy()` with no arguments is still exactly the run
 * that produced § D145's figures and its pins reproduce byte-for-byte. `selectionSweep.ts` is what
 * supplies the other seven, together with the two things § D151 raises over § D145: a
 * **Holm-corrected** level per family, and a resolution limit **measured on TTD at the cell**
 * rather than inherited from `docs/07` § 4's AWT-measured pair. The seam for the second is
 * {@link SelectionStudyOptions.resolutionProbe}, which runs after the census fixes the reference arm
 * and before any ΔTTD is graded against it.
 *
 * ## The learning, and why it is a declarable tunable rather than a tensor
 *
 * § D28's second objection to 6c was that *a 400-parameter policy vector is not obviously a
 * declarable tunable*. The learned policy here is **four scalars** — three input gains and a
 * switch margin — and the search does not know their names: {@link learnSelectionPolicy} takes
 * them from `collectSearchSpace()`, which derives the space from `core`'s own `_PARAMETERS`
 * exports and admits a dimension only if a dispatcher profile can hold it. If the schema stopped
 * declaring them, the search would silently have nothing to search and
 * `weightSetSelection.test.ts` fails.
 */

import {
  WeightedCostDispatchPolicy,
  resolveDispatchConfig,
  runSimulation,
  weightSetSourceFrom,
} from '@elevator-sim/core';

import type {
  DispatcherProfile,
  LoadedConfig,
  ResolvedBuilding,
  SelectionStageConfig,
  WeightSetSource,
} from '@elevator-sim/core';

import type { ReplicationMetric } from '../runner/metrics.js';
import type {
  DispatcherArmSpec,
  ExperimentResources,
  ExperimentResult,
  ReplicationRecord,
  TrafficArmSpec,
} from '../runner/types.js';
import { policyNoiseStream, sampleCandidate } from '../tuning/space/sample.js';
import { searchSpace, subspace } from '../tuning/space/collect.js';
import type { Candidate, SearchSpace } from '../tuning/space/types.js';
import {
  cellOf,
  derivedProfile,
  digestsOf,
  loadResources,
  runGateExperiment,
  samplesOf,
} from '../validation/harness.js';

import { BENCHMARK_SEED } from './suite.js';
import { compareCell, type CellComparison } from './verdict.js';

/* -------------------------------------------------------------------------- *
 * The operating point
 * -------------------------------------------------------------------------- */

/**
 * Midtown Office, interfloor-mix 1.5 %, 1800 s, reported over the full run.
 *
 * The only shipped cell where all three detector inputs are non-zero at once, which is the
 * minimum condition for a *pattern* detector to have anything to detect: measured through the
 * shipped engine at seed 20260728, the median rates here are lobby 0.0108, interfloor 0.0025 and
 * down 0.0075 passengers per second per car, against pure up-peak's 0.0167 / 0 / 0 and pure
 * down-peak's 0 / 0 / 0.0117. A selector measured at a single-regime point would be measured
 * where it has nothing to choose.
 *
 * It is also `matrix.ts`'s only cell where **every** arm is clean across a 200-replication
 * census, which is what makes a budget here a choice rather than a ceiling — and this study
 * censuses it again rather than inheriting that, because `docs/07` § 4 is explicit that a ceiling
 * belongs to a *(building, traffic, seed)* and this repository has inherited one twice.
 */
export const SELECTION_BUILDING = 'midtown-office';

export const SELECTION_POINT: TrafficArmSpec = Object.freeze({
  id: 'interfloor-mix-1.5pct',
  durationS: 1800,
  reportWindow: 'full-run' as const,
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 0.4, outgoing: 0.3, interfloor: 0.3 }),
    entranceWeights: Object.freeze({ G: 1 }),
    arrivalRatePctPop5min: 1.5,
    peakWindowS: 300,
  }),
});

/**
 * **One operating point this study can be run at.**
 *
 * The study used to name `SELECTION_BUILDING` and `SELECTION_POINT` directly, in eight places. It
 * is parameterized because `DECISIONS.md` § D151 pre-registers a **sweep** over eight of them and
 * § D145's single-cell refusal is the first row of it. The default is § D145's own cell, so every
 * pinned figure this module publishes reproduces byte-for-byte from `runWeightSetSelectionStudy()`
 * with no arguments — the parameterization is a broadening, not a re-measurement.
 *
 * `building` is a key into `ExperimentResources.buildingsById`, which is what lets § D151's cell 5
 * be a **derived** building (`midtown-office` re-pointed at the `hotel` traffic profile) without a
 * line of code knowing that a traffic profile is a thing a cell can move.
 */
export interface SelectionCell {
  readonly id: string;
  readonly building: string;
  readonly point: TrafficArmSpec;
}

/** § D145's operating point, and this module's default. */
export const SELECTION_CELL: SelectionCell = Object.freeze({
  id: 'midtown-interfloor-1.5pct',
  building: SELECTION_BUILDING,
  point: SELECTION_POINT,
});

/** The gate metric, and only the gate metric. § D126. */
export const SELECTION_GATE: ReplicationMetric = 'ttdMeanS';

/**
 * Published beside the verdict, never folded into it.
 *
 * `awtS` and `wt95S` are § D100's costs; `energyPerServedLegKJ` is § D106's rule that the energy
 * proxy goes beside the raw figure, because *a configuration that spends less by serving fewer
 * people has not saved anything*.
 */
export const SELECTION_COSTS: readonly ReplicationMetric[] = Object.freeze([
  'awtS',
  'wt95S',
  'energyKJ',
  'energyPerServedLegKJ',
]);

export const SELECTION_METRICS: readonly ReplicationMetric[] = Object.freeze([
  SELECTION_GATE,
  ...SELECTION_COSTS,
]);

/**
 * `docs/07` § 4's two resolution limits, at n = 100 and 80 % power.
 *
 * Two numbers and not one. A selector that has switched is a structurally different dispatcher
 * for part of the run; one that has not is the reference arm exactly. Which applies is a fact
 * about the run, so {@link SelectionArmResult.regime} is derived from the measured switch count
 * rather than assumed.
 */
export const NEAR_NEIGHBOUR_RESOLUTION_S = 0.2;
export const STRUCTURAL_RESOLUTION_S = 1.9;

/**
 * **The budget, fixed here and not raised after a result was seen.**
 *
 * 200 is the top of `CLAUDE.md`'s 50–200 band and `matrix.ts`'s own budget at this cell, clamped
 * by {@link censusSelectionPoint}'s ceiling if any arm ever saturates here. § D126 names *widening
 * the budget until the interval excludes zero* as one of the four things that would make its
 * criterion a bad one, so these are defaults of the function rather than arguments a caller tunes,
 * and every published figure comes from `runWeightSetSelectionStudy()` with no arguments.
 */
export const CENSUS_REPLICATIONS = 200;
/**
 * **Calibrated on the known answer, not on Phase 6c's result.**
 *
 * {@link runDeadbandKnownAnswer} runs this same search on `idle.repositionThresholdS`, whose
 * optimum was published before this machinery existed. Measured at seed 20260726, 40 replications
 * per candidate: **32 draws return 4.855 s** — only 3 of 32 land below the shipped 8 s, and the
 * two that do reproduce the published sweep's direction (−0.574 s at 4.855, −0.202 s at 5.671
 * against the table's −0.430 at 4 s and −0.217 at 5 s) — while **64 returns 1.691 s, 128 returns
 * 1.490 s and 256 returns 1.874 s**, every one of them inside the sweep's own [1, 3] bracket. So a
 * uniform draw over a declared range needs about 64 samples per dimension before it has seen the
 * interior optimum at all, and 24 was under-sampled.
 *
 * That calibration is deliberately taken from a dimension whose answer is known and is
 * **independent of what the learned selector measured** — § D126 names *widening the budget until
 * the interval excludes zero* as a way to make its criterion a bad one, and a search budget set
 * from the 6c result would be exactly that with an extra step. Both 6c runs are reported.
 */
export const SEARCH_CANDIDATES = 64;
export const SEARCH_REPLICATIONS = 40;
export const VERDICT_REPLICATIONS = 200;

/* -------------------------------------------------------------------------- *
 * The library
 * -------------------------------------------------------------------------- */

/**
 * The shipped `patternSwitching` block, with every arm's weights resolved.
 *
 * **This is now core's `weightSetSourceFrom` with a refusal on the front, and the delegation is
 * the point.** This function used to build the library itself, and while it was the only builder
 * that was fine; T53 gave `SimulationConfig` the same derivation so `elevator-sim run` could reach
 * the selector, and two functions answering "what are this file's weight sets" would be two
 * sources of truth about one question — the failure `runner/metrics.ts`'s docstring names, and the
 * reason `resolveWeights` was extracted in the first place. So the arithmetic lives in `core`
 * beside the profile resolution it must agree with, and what stays here is this study's own
 * contract: a study that *asks* for the library cannot proceed without one, whereas a run that
 * merely carries the file may legitimately have no `patternSwitching` block.
 *
 * @throws Error when the file authors no `patternSwitching` block at all.
 */
export function weightSetLibrary(config: {
  readonly dispatcherProfiles: LoadedConfig['dispatcherProfiles'];
}): WeightSetSource {
  const library = weightSetSourceFrom(config.dispatcherProfiles);
  if (library === undefined) {
    throw new Error(
      'data/dispatcher-profiles.json authors no patternSwitching block, so there are no weight sets to select between.',
    );
  }
  return library;
}

/**
 * The same library with the pattern → weight-set map replaced.
 *
 * The liveness contrast's other half. **Only** `weightSetsByPattern` changes: same detector, same
 * inputs, same membership ramps, same hysteresis, same profile, same seed. Any difference in the
 * trajectories is therefore attributable to which weight vector each regime selects and to
 * nothing else, which is what makes it evidence rather than a coincidence.
 */
export function withWeightSets(
  library: WeightSetSource,
  weightSetsByPattern: Readonly<Record<string, string>>,
): WeightSetSource {
  return Object.freeze({
    ...library,
    patternSwitching: Object.freeze({
      ...library.patternSwitching,
      weightSetsByPattern,
    }),
  });
}

/** A dispatcher arm that runs `profileId`'s stage settings under a weight-set selector. */
export function selectorArm(
  armId: string,
  profileId: string,
  selection: SelectionStageConfig,
  library: WeightSetSource,
): DispatcherArmSpec {
  return Object.freeze({
    id: armId,
    profile: profileId,
    options: Object.freeze({ selection, weightSets: library }),
  });
}

/* -------------------------------------------------------------------------- *
 * Liveness — trajectories, not means
 * -------------------------------------------------------------------------- */

/** One run's car trajectory, as the sequence of completed moves. */
function trajectoryOf(
  building: ResolvedBuilding,
  profile: DispatcherProfile,
  config: LoadedConfig,
  seed: number,
  options: { readonly selection?: SelectionStageConfig; readonly weightSets?: WeightSetSource },
  point: TrafficArmSpec,
): {
  readonly moves: readonly string[];
  readonly ttdMeanS: number;
  readonly legs: number;
} {
  const result = runSimulation({
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed,
    durationS: point.durationS as number,
    reportWindow: point.reportWindow ?? 'full-run',
    demand: point.demand,
    // The point's template, or the liveness half measures different traffic from the verdict
    // half. A no-op for § D145's default cell and every § D151 cell; load-bearing for the lunch
    // two-way cells, whose mix arc lives in the template.
    ...(point.demandTemplate === undefined ? {} : { demandTemplate: point.demandTemplate }),
    onTimeout: 'report',
    ...(options.selection === undefined && options.weightSets === undefined
      ? {}
      : {
          dispatcherOptions: {
            ...(options.selection === undefined ? {} : { selection: options.selection }),
            ...(options.weightSets === undefined ? {} : { weightSets: options.weightSets }),
          },
        }),
  });
  const moves = (result.record.travelSamples ?? []).map(
    (sample) => `${sample.carId}@${sample.at.toFixed(6)}:${sample.direction}:${sample.distanceM.toFixed(6)}`,
  );
  return {
    moves: Object.freeze(moves),
    ttdMeanS: result.summary.timeToDestination.meanS,
    legs: result.record.passengers.length,
  };
}

/** How far two move sequences agree, and where they first stop agreeing. */
export interface TrajectoryContrast {
  readonly label: string;
  readonly movesA: number;
  readonly movesB: number;
  /** Index of the first move that differs, or `undefined` when the sequences are identical. */
  readonly firstDivergence: number | undefined;
  readonly identical: boolean;
  /** Both runs' mean TTD, published so a reader can see the mean **not** separating them. */
  readonly ttdA: number;
  readonly ttdB: number;
}

function contrast(
  label: string,
  a: { readonly moves: readonly string[]; readonly ttdMeanS: number },
  b: { readonly moves: readonly string[]; readonly ttdMeanS: number },
): TrajectoryContrast {
  let firstDivergence: number | undefined;
  const shorter = Math.min(a.moves.length, b.moves.length);
  for (let index = 0; index < shorter; index += 1) {
    if (a.moves[index] !== b.moves[index]) {
      firstDivergence = index;
      break;
    }
  }
  if (firstDivergence === undefined && a.moves.length !== b.moves.length) {
    firstDivergence = shorter;
  }
  return Object.freeze({
    label,
    movesA: a.moves.length,
    movesB: b.moves.length,
    firstDivergence,
    identical: firstDivergence === undefined,
    ttdA: a.ttdMeanS,
    ttdB: b.ttdMeanS,
  });
}

export interface WeightSetLivenessResult {
  readonly seed: number;
  readonly building: string;
  readonly profileId: string;
  /** Patterns the detector actually entered, in the order it entered them. */
  readonly patternsVisited: readonly string[];
  readonly switches: number;
  /** The shipped map against a permuted one — review finding #5's prescription. */
  readonly weightSetContrast: TrajectoryContrast;
  /** The selector on against the same profile with it off. */
  readonly selectorContrast: TrajectoryContrast;
  /** The profile with the selector off, against the same profile with no options at all. */
  readonly offIsIdentical: boolean;
  readonly shippedMap: Readonly<Record<string, string>>;
  readonly permutedMap: Readonly<Record<string, string>>;
}

/**
 * **Is the selector live?** Measured on trajectories, at one seed, on the shipped map.
 *
 * Three contrasts, and the middle one is the one that answers review finding #5:
 *
 * 1. `selection.policy: 'off'` against the profile run with **no options at all** — must be
 *    identical, because off is the shipped state of every profile and a mechanism that moved a
 *    number while switched off would have invalidated every published figure in the repository;
 * 2. the shipped `weightSetsByPattern` against a **permuted** one, everything else equal — must
 *    differ, or editing the map is still the *configured, validated, dead* defect this lane was
 *    opened to close;
 * 3. the selector on against the selector off — reported for scale.
 */
export async function measureWeightSetSelectionLiveness(
  options: {
    readonly seed?: number;
    readonly config?: LoadedConfig;
    readonly profileId?: string;
    readonly cell?: SelectionCell;
    readonly buildings?: ReadonlyMap<string, ResolvedBuilding>;
  } = {},
): Promise<WeightSetLivenessResult> {
  const seed = options.seed ?? BENCHMARK_SEED;
  const config = options.config ?? (await loadResources());
  const cell = options.cell ?? SELECTION_CELL;
  const profileId = options.profileId ?? 'eta';
  const profile = config.dispatcherProfilesById.get(profileId);
  const building = (options.buildings ?? config.buildingsById).get(cell.building);
  if (profile === undefined || building === undefined) {
    throw new Error(`No profile "${profileId}" or building "${cell.building}" in data/.`);
  }

  const library = weightSetLibrary(config);
  const shippedMap = library.patternSwitching.weightSetsByPattern;
  // Reversed against the declared pattern order: every pattern keeps a real, authored weight set
  // and no pattern keeps its own. A permutation rather than an arbitrary map, so the two arms
  // hold the same *set* of weight vectors and differ only in which regime gets which.
  const patterns = [...library.patternSwitching.patternDetector.patterns];
  const permutedMap: Record<string, string> = {};
  patterns.forEach((pattern, index) => {
    const donor = patterns[patterns.length - 1 - index] as string;
    permutedMap[pattern] = shippedMap[donor] as string;
  });

  const fuzzy: SelectionStageConfig = { policy: 'fuzzy' };
  const off: SelectionStageConfig = { policy: 'off' };

  const bare = trajectoryOf(building, profile, config, seed, {}, cell.point);
  const switchedOff = trajectoryOf(
    building,
    profile,
    config,
    seed,
    { selection: off, weightSets: library },
    cell.point,
  );
  const shipped = trajectoryOf(
    building,
    profile,
    config,
    seed,
    { selection: fuzzy, weightSets: library },
    cell.point,
  );
  const permuted = trajectoryOf(
    building,
    profile,
    config,
    seed,
    { selection: fuzzy, weightSets: withWeightSets(library, permutedMap) },
    cell.point,
  );

  const { patternsVisited, switches } = await tracePatterns(
    building,
    profile,
    config,
    seed,
    library,
    cell.point,
  );

  return Object.freeze({
    seed,
    building: cell.building,
    profileId,
    patternsVisited,
    switches,
    weightSetContrast: contrast('shipped map vs permuted map', shipped, permuted),
    selectorContrast: contrast('selector on vs off', shipped, switchedOff),
    offIsIdentical: contrast('off vs no options', switchedOff, bare).identical,
    shippedMap,
    permutedMap: Object.freeze(permutedMap),
  });
}

/**
 * Which patterns the detector entered, counted through a real run.
 *
 * Instrumented through `SimulationConfig.createPolicy` — the hook `sim/types.ts` documents for
 * *"instrumenting a real run, which is the only honest way to check a term is not inert through
 * the shipped path"* — rather than by re-deriving the observation outside the simulator, which
 * would answer a different question.
 */
async function tracePatterns(
  building: ResolvedBuilding,
  profile: DispatcherProfile,
  config: LoadedConfig,
  seed: number,
  library: WeightSetSource,
  point: TrafficArmSpec,
): Promise<{ readonly patternsVisited: readonly string[]; readonly switches: number }> {
  const visited: string[] = [];
  let switches = 0;

  type Policy = InstanceType<typeof WeightedCostDispatchPolicy>;
  class Traced extends WeightedCostDispatchPolicy {
    override dispatch(
      callId: string,
      cars: Parameters<Policy['dispatch']>[1],
      at: number,
      context?: Parameters<Policy['dispatch']>[3],
    ): ReturnType<Policy['dispatch']> {
      const decision = super.dispatch(callId, cars, at, context);
      const pattern = this.activePattern;
      if (pattern !== undefined && visited[visited.length - 1] !== pattern) visited.push(pattern);
      switches = Math.max(switches, this.weightSetSwitches);
      return decision;
    }
  }

  runSimulation({
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed,
    durationS: point.durationS as number,
    reportWindow: point.reportWindow ?? 'full-run',
    demand: point.demand,
    // Same wiring as trajectoryOf: the patterns traced must be the run's own.
    ...(point.demandTemplate === undefined ? {} : { demandTemplate: point.demandTemplate }),
    onTimeout: 'report',
    createPolicy: (candidate, policyOptions) =>
      new Traced(
        resolveDispatchConfig(candidate, {
          ...policyOptions,
          selection: { policy: 'fuzzy' },
          weightSets: library,
        }),
      ),
  });

  return { patternsVisited: Object.freeze(visited), switches };
}

/* -------------------------------------------------------------------------- *
 * The learning
 * -------------------------------------------------------------------------- */

/** The four learned dimensions, and they are looked up rather than listed. */
export const LEARNED_PARAMETER_IDS: readonly string[] = Object.freeze([
  'selection.lobbyArrivalRateGain',
  'selection.interfloorRateGain',
  'selection.downPeakRateGain',
  'selection.switchMargin',
]);

/**
 * The learned dimensions **as the generic optimizer sees them**.
 *
 * `collectSearchSpace()` derives the space from `core`'s `_PARAMETERS` exports and admits a
 * dimension only if a dispatcher profile can hold it, so this function is the standing answer to
 * § D28's second objection: the learned policy is four rows of a schema an optimizer already
 * reads, with a type, a range, a default and an `activeWhen`, and not a tensor.
 *
 * @throws Error if the schema stops declaring one of them, rather than searching a smaller space
 *   and reporting a winner that is only optimal at whatever the missing dimension happened to be.
 */
export function learnedSubspace(space: SearchSpace = searchSpace()): SearchSpace {
  const narrowed = subspace(space, LEARNED_PARAMETER_IDS);
  const missing = LEARNED_PARAMETER_IDS.filter((id) => !narrowed.ids.includes(id));
  if (missing.length > 0) {
    throw new Error(
      `The declared search space does not contain ${missing.join(', ')}. The learned selector's dimensions must be schema-declared and profile-authorable (CLAUDE.md invariant 8); a search over a silently smaller space reports a winner that is only optimal at whatever the missing dimension happened to be.`,
    );
  }
  return narrowed;
}

/** Turn a sampled candidate into the `selection` section a policy is built from. */
export function selectionFrom(candidate: Candidate): SelectionStageConfig {
  const read = (id: string): number => {
    const value = candidate.get(id);
    if (typeof value !== 'number') {
      throw new Error(`Candidate has no numeric value for "${id}".`);
    }
    return value;
  };
  return Object.freeze({
    policy: 'contextual' as const,
    lobbyArrivalRateGain: read('selection.lobbyArrivalRateGain'),
    interfloorRateGain: read('selection.interfloorRateGain'),
    downPeakRateGain: read('selection.downPeakRateGain'),
    switchMargin: read('selection.switchMargin'),
  });
}

export interface LearnedCandidate {
  readonly index: number;
  readonly selection: SelectionStageConfig;
  /** Mean paired ΔTTD against the reference arm on the tuning seed. Negative is better. */
  readonly meanDeltaTtdS: number;
  /** Replications on which the arm was bit-identical to the reference. */
  readonly identicalReplications: number;
}

export interface LearnedPolicy {
  readonly tuningSeed: number;
  readonly candidates: readonly LearnedCandidate[];
  readonly winner: LearnedCandidate;
  /** The dimensions searched, read off the declared schema. */
  readonly dimensions: readonly string[];
  readonly replications: number;
}

/**
 * Fit the four learned scalars on the tuning seed set.
 *
 * A random search over the declared subspace, evaluated against the reference arm under common
 * random numbers, ranked on the gate metric. Deliberately the *simplest* search that can be
 * defended, for two reasons stated rather than assumed: the space is four bounded dimensions with
 * a plateau structure (`docs/07` § 4 — *weight perturbations below the decision-flip threshold
 * produce bit-identical runs*, so a finite-difference method stalls), and the honest failure mode
 * of a small budget is *no significant gain*, which § D126 explicitly permits as an outcome.
 *
 * The tuning seed is **not** the seed the verdict is measured at. That separation is the whole of
 * the generalization clause, and {@link SelectionStudy.holdoutSeed} prints both.
 */
export async function learnSelectionPolicy(input: {
  readonly referenceProfileId: string;
  readonly resources: ExperimentResources;
  readonly library: WeightSetSource;
  readonly tuningSeed: number;
  readonly candidates: number;
  readonly replications: number;
  readonly cell?: SelectionCell | undefined;
}): Promise<LearnedPolicy> {
  const cell = input.cell ?? SELECTION_CELL;
  const space = learnedSubspace();
  // The gate the search is not moving still has to be readable, or every dimension it gates
  // deactivates and the narrowed search silently becomes narrower still — `subspace`'s own
  // docstring says exactly this. `selection.policy` defaults to `off`, under which all four
  // learned dimensions are correctly inactive, so the base point turns the selector on and the
  // draw is over the four gains at the configuration they are live in.
  const base: Candidate = new Map([['selection.policy', 'contextual']]);
  const sampled: SelectionStageConfig[] = [];
  for (let index = 0; index < input.candidates; index += 1) {
    sampled.push(
      selectionFrom(
        sampleCandidate(
          space,
          policyNoiseStream(BigInt(input.tuningSeed) + BigInt(index) * 1_000_003n),
          { base },
        ),
      ),
    );
  }

  const arms: DispatcherArmSpec[] = [
    Object.freeze({ id: 'reference', profile: input.referenceProfileId }),
    ...sampled.map((selection, index) =>
      selectorArm(`candidate-${String(index)}`, input.referenceProfileId, selection, input.library),
    ),
  ];

  const experiment = await runGateExperiment({
    id: `phase6c/learn/${cell.id}`,
    seed: input.tuningSeed,
    building: cell.building,
    dispatchers: arms,
    traffic: cell.point,
    replications: input.replications,
    resources: input.resources,
  });

  const reference = samplesOf(experiment, 'reference', SELECTION_GATE);
  const candidates: LearnedCandidate[] = sampled.map((selection, index) => {
    const values = samplesOf(experiment, `candidate-${String(index)}`, SELECTION_GATE);
    let sum = 0;
    let identical = 0;
    for (let i = 0; i < values.length; i += 1) {
      const delta = (values[i] as number) - (reference[i] as number);
      sum += delta;
      if (delta === 0) identical += 1;
    }
    return Object.freeze({
      index,
      selection,
      meanDeltaTtdS: values.length === 0 ? Number.NaN : sum / values.length,
      identicalReplications: identical,
    });
  });

  // Lowest mean ΔTTD wins; ties break by index, so the winner is a function of the seed and the
  // schema and of nothing else (CLAUDE.md invariant 4).
  let winner = candidates[0] as LearnedCandidate;
  for (const candidate of candidates) {
    if (candidate.meanDeltaTtdS < winner.meanDeltaTtdS) winner = candidate;
  }

  return Object.freeze({
    tuningSeed: input.tuningSeed,
    candidates: Object.freeze(candidates),
    winner,
    dimensions: space.ids,
    replications: input.replications,
  });
}

/* -------------------------------------------------------------------------- *
 * The known-answer test the policy cannot see
 * -------------------------------------------------------------------------- */

export interface DeadbandKnownAnswer {
  readonly seed: number;
  readonly shippedThresholdS: number;
  readonly knownOptimumS: number;
  readonly candidates: readonly { readonly thresholdS: number; readonly meanDeltaAwtS: number }[];
  readonly winnerThresholdS: number;
  readonly winnerMeanDeltaAwtS: number;
  /** `true` when the search rediscovered the interior optimum rather than agreeing with 8 s. */
  readonly rediscovered: boolean;
}

/**
 * **The 2 s deadband** — `docs/07` § 5, and the one test in this repository whose answer was known
 * before the machinery that answers it existed.
 *
 * `idle.repositionThresholdS` ships at **8 s** on `predictive-balanced` and the interior optimum
 * is **2 s**; the wrong value is left shipped on purpose so that an optimizer which rediscovers
 * ~2 s blind has validated itself. § D126 is explicit that *one that returns 8 s has failed, not
 * agreed*, and that it must not be hand-edited.
 *
 * This runs the **same search** {@link learnSelectionPolicy} uses — `sampleCandidate` over a
 * subspace of `collectSearchSpace()`, evaluated against the incumbent under common random numbers,
 * ranked by the mean paired difference — on a different dimension, on a different building, at a
 * different metric. Nothing in the procedure knows what a deadband is. If it comes back at 8 s,
 * the procedure that fitted the learned selector is the thing that failed, and Phase 6c's result
 * would have to be read as a fact about the search rather than about the policy.
 *
 * AWT rather than TTD here, because § 5's sweep is stated in AWT and the point is to reproduce a
 * published answer rather than to produce a new one.
 */
export async function runDeadbandKnownAnswer(
  options: {
    readonly seed?: number;
    readonly candidates?: number;
    readonly replications?: number;
    readonly resources?: ExperimentResources;
  } = {},
): Promise<DeadbandKnownAnswer> {
  const seed = options.seed ?? BENCHMARK_SEED;
  const resources = options.resources ?? toResources(await loadResources());
  // The same draw count the selector search uses, because a calibration taken at one budget and
  // spent at another calibrates nothing.
  const count = options.candidates ?? SEARCH_CANDIDATES;
  const replications = options.replications ?? SEARCH_REPLICATIONS;

  const space = subspace(searchSpace(), ['idle.repositionThresholdS']);
  // The gate `idle.parkingStrategy` is not searched and must stay readable, or the deadband
  // deactivates and the search draws nothing at all.
  const base: Candidate = new Map([['idle.parkingStrategy', 'predicted-demand']]);
  const thresholds: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const drawn = sampleCandidate(
      space,
      policyNoiseStream(BigInt(seed) + BigInt(index) * 7_919n),
      { base },
    ).get('idle.repositionThresholdS');
    thresholds.push(typeof drawn === 'number' ? drawn : Number.NaN);
  }

  // Derived **profiles** rather than option overrides: `DispatchPolicyOptions` carries no `idle`
  // section, and docs/06 § *`id` is a path a profile can actually hold* is the reason it does not
  // need to — a tuned winner is written back as a profile. So the search writes profiles, which
  // is also what the shipped tuner does.
  const incumbentProfile = resources.dispatcherProfilesById.get(DEADBAND_PROFILE);
  if (incumbentProfile === undefined) {
    throw new Error(`data/dispatcher-profiles.json has no profile "${DEADBAND_PROFILE}".`);
  }
  const derived = thresholds.map((thresholdS, index) =>
    derivedProfile(incumbentProfile, `deadband-${String(index)}`, {
      idle: { ...incumbentProfile.idle, repositionThresholdS: thresholdS },
    }),
  );
  const withDerived: ExperimentResources = Object.freeze({
    ...resources,
    dispatcherProfilesById: new Map([
      ...resources.dispatcherProfilesById,
      ...derived.map((profile) => [profile.id, profile] as const),
    ]),
  });

  const experiment = await runGateExperiment({
    id: 'phase6c/known-answer',
    seed,
    building: DEADBAND_BUILDING,
    dispatchers: [DEADBAND_PROFILE, ...derived.map((profile) => profile.id)],
    traffic: DEADBAND_POINT,
    replications,
    resources: withDerived,
  });

  const incumbent = samplesOf(experiment, DEADBAND_PROFILE, 'awtS');
  const candidates = thresholds.map((thresholdS, index) => {
    const values = samplesOf(experiment, `deadband-${String(index)}`, 'awtS');
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) sum += (values[i] as number) - (incumbent[i] as number);
    return Object.freeze({
      thresholdS,
      meanDeltaAwtS: values.length === 0 ? Number.NaN : sum / values.length,
    });
  });

  let winner = candidates[0] as { thresholdS: number; meanDeltaAwtS: number };
  for (const candidate of candidates) {
    if (candidate.meanDeltaAwtS < winner.meanDeltaAwtS) winner = candidate;
  }

  return Object.freeze({
    seed,
    shippedThresholdS: DEADBAND_SHIPPED_S,
    knownOptimumS: DEADBAND_OPTIMUM_S,
    candidates: Object.freeze(candidates),
    winnerThresholdS: winner.thresholdS,
    winnerMeanDeltaAwtS: winner.meanDeltaAwtS,
    // "~2 s" read as the interior of the sweep's own bracket: the published table's neighbours are
    // 1 s and 3 s, so anything inside [1, 3] has rediscovered it and 8 s has not.
    rediscovered: winner.thresholdS >= 1 && winner.thresholdS <= 3,
  });
}

/** `docs/07` § 5's sweep, verbatim: the building, the profile and the two numbers it is about. */
export const DEADBAND_BUILDING = 'garden-apartments';
export const DEADBAND_PROFILE = 'predictive-balanced';
export const DEADBAND_SHIPPED_S = 8;
export const DEADBAND_OPTIMUM_S = 2;
export const DEADBAND_POINT: TrafficArmSpec = Object.freeze({
  id: 'residential-2pct-fullrun',
  durationS: 3600,
  reportWindow: 'full-run' as const,
  demand: Object.freeze({ arrivalRatePctPop5min: 2, peakWindowS: 300 }),
});

/** A `LoadedConfig` as the runner's resource bundle. */
export function toResources(config: LoadedConfig): ExperimentResources {
  return Object.freeze({
    buildingsById: config.buildingsById,
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  });
}

/* -------------------------------------------------------------------------- *
 * The census, the reference arm, and the verdict
 * -------------------------------------------------------------------------- */

export interface CensusRow {
  readonly profileId: string;
  readonly quotable: boolean;
  /** Measured and published, but not a candidate for the reference arm. § D147's device. */
  readonly ceilingExcluded: boolean;
  readonly meanTtdS: number;
  readonly firstInvalidReplication: number | undefined;
}

export interface SelectionCensus {
  readonly seed: number;
  readonly replications: number;
  readonly rows: readonly CensusRow[];
  /** The best **quotable** shipped profile on the gate metric. The reference arm. */
  readonly referenceProfileId: string;
  /**
   * The **reference arm's own** ceiling — the declared arm set's, and the one the budget clamps to.
   * `undefined` when the reference arm keeps a quotable AWT across the whole census.
   */
  readonly ceiling: number | undefined;
  /** The conservative min-over-twelve. Reported beside the budget, and never the budget. */
  readonly allArmCeiling: number | undefined;
}

/**
 * Establish this cell's own reference arm and its own ceiling.
 *
 * Both halves are here rather than inherited, and for the reason `docs/07` § 4 gives twice over:
 * *"a saturation ceiling belongs to a (building, traffic, seed), not to a building"*, and
 * *"`nearest-car` is a poor reference arm"*. The reference is chosen **before** any selector arm
 * is built, on the shipped library alone, which is what stops it being chosen after seeing the
 * result — the failure § D126 names explicitly as making the criterion a bad one.
 */
export async function censusSelectionPoint(input: {
  readonly seed: number;
  /**
   * The demand seed the census is taken at (docs/14 § 1.1). Omitted by every study that produced a
   * pinned figure, and omitting it leaves the census the run it was. `teaching/` supplies its
   * **training** traffic seed here, so the reference arm is chosen on the traffic the policy will
   * be fitted against rather than on a crowd nothing in the round ever sees.
   */
  readonly trafficSeed?: number | string | undefined;
  readonly replications: number;
  readonly resources: ExperimentResources;
  readonly cell?: SelectionCell | undefined;
  /**
   * Arms excluded from the reference-arm choice by their **ceiling**, never by their answer.
   *
   * [§ D147](../../../../DECISIONS.md)'s `CEILING_EXCLUDED_ARMS` device, and § D151 § 1 admits its
   * three SECONDARY cells only with it. An excluded arm's census row is still measured and still
   * published — the exclusion is from *candidacy*, so a reader sees what was left out and why.
   */
  readonly ceilingExcludedArms?: readonly string[] | undefined;
}): Promise<SelectionCensus> {
  const cell = input.cell ?? SELECTION_CELL;
  const excluded = new Set(input.ceilingExcludedArms ?? []);
  const profileIds = [...input.resources.dispatcherProfilesById.keys()];
  const experiment = await runGateExperiment({
    id: `phase6c/census/${cell.id}`,
    seed: input.seed,
    ...(input.trafficSeed === undefined ? {} : { trafficSeed: input.trafficSeed }),
    building: cell.building,
    dispatchers: profileIds,
    traffic: cell.point,
    replications: input.replications,
    resources: input.resources,
  });

  const rows: CensusRow[] = profileIds.map((profileId) => {
    const armCell = cellOf(experiment, profileId);
    const samples = samplesOf(experiment, profileId, SELECTION_GATE);
    const mean =
      samples.length === 0 ? Number.NaN : samples.reduce((a, b) => a + b, 0) / samples.length;
    return Object.freeze({
      profileId,
      quotable: armCell.aggregate.awtIsValid,
      ceilingExcluded: excluded.has(profileId),
      meanTtdS: mean,
      firstInvalidReplication: firstInvalidOf(armCell.replications),
    });
  });

  const quotable = rows.filter(
    (row) => row.quotable && !row.ceilingExcluded && Number.isFinite(row.meanTtdS),
  );
  if (quotable.length === 0) {
    throw new Error(
      `No shipped profile has a quotable AWT at ${cell.building}/${cell.point.id} at seed ${String(input.seed)}; there is no reference arm and therefore no comparison.`,
    );
  }
  let best = quotable[0] as CensusRow;
  for (const row of quotable) if (row.meanTtdS < best.meanTtdS) best = row;

  // **Which ceiling — § D151 § 2, declared because it changes three cells.** A ceiling is an
  // *arm-set* property, not only a `(building, traffic, seed)` property, and the two diverge
  // sharply: at `vertical-city` up-peak the all-twelve ceiling is 10 and the reference arm's own
  // is above 200. The budget is clamped by the **declared arm set** — the reference arm, which is
  // the only member of it that exists before the selector is built — and the conservative
  // min-over-twelve is reported beside it and is **not** the budget.
  const allArmCeilings = rows
    .map((row) => row.firstInvalidReplication)
    .filter((value): value is number => value !== undefined);

  return Object.freeze({
    seed: input.seed,
    replications: input.replications,
    rows: Object.freeze(rows),
    referenceProfileId: best.profileId,
    ceiling: best.firstInvalidReplication,
    allArmCeiling: allArmCeilings.length === 0 ? undefined : Math.min(...allArmCeilings),
  });
}

/**
 * The replication index at which this arm first stops being quotable — **all four grounds**.
 *
 * This is what turns a census into a *budget*, so getting it wrong is not a reporting defect: the
 * number it returns clamps every downstream `n`. It used to read `summary.saturation.saturated`
 * alone, which is one of `awtIsValid`'s four grounds, and `CLAUDE.md` § Statistical discipline is
 * explicit that saturation is *one* of them and not the whole rule — the others are an empty
 * reporting window, censoring above the unserved limit, and a leg past the 900 s abandonment
 * horizon.
 *
 * **The under-report was measured rather than argued.** At `garden-apartments` under
 * `interfloor-mix` 1.5 % over 1800 s, reported full-run, *nothing saturates* at either censused
 * seed and yet no arm keeps a quotable AWT: every one of the twelve fails with *"No passenger was
 * served within the reporting window"*. The strict ceiling there is **32** at seed 20260726 and
 * **22** at 20260728; the saturation-only reading returned `none` at both — "no ceiling, budget
 * freely" — at a cell where no arm is quotable at all. `DECISIONS.md` § D151 § 2 records it and
 * forbids reusing this function unfixed.
 *
 * `ReplicationRecord.awtIsValid` is the flag the runner already computes from `RunSummary`, so the
 * fix consults the rule rather than re-deriving a second copy of it.
 */
export function firstInvalidOf(records: readonly ReplicationRecord[]): number | undefined {
  const index = records.findIndex((record) => !record.awtIsValid);
  return index < 0 ? undefined : index;
}

export interface SelectionArmResult {
  readonly armId: string;
  readonly label: string;
  readonly selection: SelectionStageConfig;
  readonly gate: CellComparison;
  readonly costs: readonly CellComparison[];
  /** Replications on which this arm was bit-identical to the reference on every metric. */
  readonly identicalReplications: number;
  /** Which of `docs/07` § 4's two resolution regimes this pair sits in. */
  readonly regime: 'near-neighbour' | 'structural';
  readonly resolutionLimitS: number;
  /** `true` when the measured effect is smaller than the regime's smallest detectable effect. */
  readonly belowResolutionLimit: boolean;
}

/**
 * The two smallest detectable effects that decide {@link SelectionArmResult.belowResolutionLimit}.
 *
 * `docs/07` § 4 published one pair, measured on **AWT** at Midtown up-peak, and § D145 applied it
 * to **TTD** as absolute seconds — which the open-debt register records as *unmeasured rather than
 * settled*. § D151 § 3 raises that: the sweep measures the limit on TTD **at each cell** and gates
 * on it. This type is the seam through which a measured pair replaces the inherited one; the
 * default is still § 4's, so `runWeightSetSelectionStudy()` with no arguments reproduces § D145.
 */
export interface ResolutionLimits {
  readonly nearNeighbourS: number;
  readonly structuralS: number;
  /** Where these two numbers came from, printed beside every verdict they decide. */
  readonly provenance: string;
}

export const INHERITED_RESOLUTION_LIMITS: ResolutionLimits = Object.freeze({
  nearNeighbourS: NEAR_NEIGHBOUR_RESOLUTION_S,
  structuralS: STRUCTURAL_RESOLUTION_S,
  provenance: 'docs/07 § 4, measured on AWT at Midtown up-peak and applied to TTD as absolute seconds',
});

export interface SelectionStudy {
  readonly seed: number;
  readonly holdoutSeed: number;
  readonly seedsDisjoint: boolean;
  readonly cellId: string;
  readonly building: string;
  readonly point: string;
  readonly resolutionLimits: ResolutionLimits;
  readonly gateMetric: ReplicationMetric;
  readonly census: SelectionCensus;
  readonly learned: LearnedPolicy;
  readonly replications: number;
  readonly quotable: boolean;
  readonly unquotableArms: readonly string[];
  readonly crnAligned: boolean;
  readonly arms: readonly SelectionArmResult[];
  readonly liveness: WeightSetLivenessResult;
  /** The verdict, in the vocabulary § D126 permits: it may be `NOT ACCEPTED`. */
  readonly verdict: 'ACCEPTED' | 'NOT ACCEPTED';
  readonly verdictReason: string;
  /** Did the winner generalize? Measured, not assumed. */
  readonly holdoutMeanDeltaTtdS: number;
  readonly holdoutVerdict: 'GENERALIZES' | 'DOES NOT GENERALIZE';
}

export interface SelectionStudyOptions {
  readonly seed?: number;
  readonly holdoutSeed?: number;
  readonly resources?: ExperimentResources & { readonly dispatcherProfiles?: unknown };
  readonly config?: LoadedConfig;
  readonly censusReplications?: number;
  readonly replications?: number;
  readonly searchCandidates?: number;
  readonly searchReplications?: number;
  /** The operating point. Defaults to {@link SELECTION_CELL}, which is § D145's. */
  readonly cell?: SelectionCell | undefined;
  /** Arms excluded from reference-arm candidacy by their ceiling. § D147's device. */
  readonly ceilingExcludedArms?: readonly string[] | undefined;
  /**
   * Measure this cell's own TTD resolution limits, **after** the census fixes the reference arm
   * and **before** any ΔTTD is graded against them. § D151 § 3. Omitted, § 4's inherited pair
   * stands and the study is § D145's exactly.
   */
  readonly resolutionProbe?:
    | ((input: {
        readonly cell: SelectionCell;
        readonly census: SelectionCensus;
        readonly resources: ExperimentResources;
        readonly seed: number;
        readonly replications: number;
      }) => Promise<ResolutionLimits>)
    | undefined;
}

/**
 * **Phase 6c, measured against § D126.**
 *
 * Order matters and is the criterion's: census first (so the reference arm and the budget are
 * fixed before any selector exists), then the learning on the tuning seed, then the verdict on a
 * **disjoint** holdout seed. Nothing is chosen after a result is seen.
 */
export async function runWeightSetSelectionStudy(
  options: SelectionStudyOptions = {},
): Promise<SelectionStudy> {
  const seed = options.seed ?? BENCHMARK_SEED;
  const holdoutSeed = options.holdoutSeed ?? seed + 811;
  const config = options.config ?? (await loadResources());
  const cell = options.cell ?? SELECTION_CELL;
  const resources = options.resources ?? toResources(config);
  const library = weightSetLibrary(config);

  const census = await censusSelectionPoint({
    seed,
    replications: options.censusReplications ?? CENSUS_REPLICATIONS,
    resources,
    cell,
    ...(options.ceilingExcludedArms === undefined
      ? {}
      : { ceilingExcludedArms: options.ceilingExcludedArms }),
  });

  // The budget: the criterion's 50–200 band, clamped by the **declared arm set's** own census
  // ceiling (§ D151 § 2), not by the conservative min over twelve.
  const requested = options.replications ?? VERDICT_REPLICATIONS;
  const replications =
    census.ceiling === undefined ? requested : Math.min(requested, census.ceiling);

  // Measured before the learning, so nothing about the limit can be a function of the result it
  // grades. § D151 § 3.
  const resolutionLimits =
    options.resolutionProbe === undefined
      ? INHERITED_RESOLUTION_LIMITS
      : await options.resolutionProbe({ cell, census, resources, seed, replications });

  const learned = await learnSelectionPolicy({
    referenceProfileId: census.referenceProfileId,
    resources,
    library,
    tuningSeed: seed,
    candidates: options.searchCandidates ?? SEARCH_CANDIDATES,
    replications: options.searchReplications ?? SEARCH_REPLICATIONS,
    cell,
  });

  const armSpecs: DispatcherArmSpec[] = [
    Object.freeze({ id: 'reference', profile: census.referenceProfileId }),
    selectorArm('fuzzy', census.referenceProfileId, { policy: 'fuzzy' }, library),
    selectorArm('learned', census.referenceProfileId, learned.winner.selection, library),
  ];

  const experiment = await runGateExperiment({
    id: `phase6c/verdict/${cell.id}`,
    seed: holdoutSeed,
    building: cell.building,
    dispatchers: armSpecs,
    traffic: cell.point,
    replications,
    resources,
  });

  const armIds = armSpecs.map((arm) => arm.id as string);
  const unquotableArms = armIds.filter((armId) => !cellOf(experiment, armId).aggregate.awtIsValid);
  const quotable = unquotableArms.length === 0;

  const reference = digestsOf(experiment, 'reference');
  const crnAligned = armIds.every((armId) => {
    const digests = digestsOf(experiment, armId);
    return (
      digests.length === reference.length &&
      digests.every((digest, index) => digest === reference[index])
    );
  });

  const arms: SelectionArmResult[] = [];
  for (const spec of armSpecs.slice(1)) {
    const armId = spec.id as string;
    const selection = (spec.options?.selection ?? {}) as SelectionStageConfig;
    const gate = compareCell({
      metric: SELECTION_GATE,
      armId,
      baselineId: 'reference',
      candidate: samplesOf(experiment, armId, SELECTION_GATE),
      baseline: samplesOf(experiment, 'reference', SELECTION_GATE),
      quotable,
      ...(census.ceiling === undefined ? {} : { admissibleReplications: census.ceiling }),
    });
    const costs = SELECTION_COSTS.map((metric) =>
      compareCell({
        metric,
        armId,
        baselineId: 'reference',
        candidate: samplesOf(experiment, armId, metric),
        baseline: samplesOf(experiment, 'reference', metric),
        quotable,
        ...(census.ceiling === undefined ? {} : { admissibleReplications: census.ceiling }),
      }),
    );

    let identical = 0;
    for (let index = 0; index < replications; index += 1) {
      const same = SELECTION_METRICS.every((metric) => {
        const a = samplesOf(experiment, armId, metric)[index];
        const b = samplesOf(experiment, 'reference', metric)[index];
        return a !== undefined && b !== undefined && a === b;
      });
      if (same) identical += 1;
    }

    // A selector that never left the reference's own weights is the reference arm, and the pair
    // is a near-neighbour pair. One that switched is structurally a different dispatcher for part
    // of the run, and `docs/07` § 4's coarser limit applies. Derived from the measurement, not
    // assumed from the configuration.
    const structural = identical < replications;
    const limit = structural ? resolutionLimits.structuralS : resolutionLimits.nearNeighbourS;
    arms.push(
      Object.freeze({
        armId,
        label: armId === 'fuzzy' ? 'fuzzy detector (Phase 7)' : 'learned selector (Phase 6c)',
        selection,
        gate,
        costs: Object.freeze(costs),
        identicalReplications: identical,
        regime: structural ? ('structural' as const) : ('near-neighbour' as const),
        resolutionLimitS: limit,
        belowResolutionLimit: Math.abs(gate.estimate.mean) < limit,
      }),
    );
  }

  const learnedArm = arms.find((arm) => arm.armId === 'learned') as SelectionArmResult;
  const holdoutMeanDeltaTtdS = learnedArm.gate.estimate.mean;
  const holdoutVerdict =
    learned.winner.meanDeltaTtdS < 0 && holdoutMeanDeltaTtdS < 0
      ? ('GENERALIZES' as const)
      : ('DOES NOT GENERALIZE' as const);

  const accepted = learnedArm.gate.verdict === 'BETTER' && !learnedArm.belowResolutionLimit;
  const verdictReason = accepted
    ? `ΔTTD ${formatCell(learnedArm.gate)} against "${census.referenceProfileId}", the best shipped profile at this point, over ${String(replications)} replications under common random numbers.`
    : learnedArm.gate.verdict === 'IDENTICAL'
      ? `the learned arm was bit-identical to the reference on ${String(learnedArm.identicalReplications)} of ${String(replications)} replications. § D126: a bit-identical result is a wiring bug until proven otherwise, never a small effect.`
      : `ΔTTD ${formatCell(learnedArm.gate)} — ${learnedArm.gate.verdict}${learnedArm.belowResolutionLimit ? `, and below this point's ${learnedArm.regime} resolution limit of ${learnedArm.resolutionLimitS.toFixed(2)} s` : ''}. The criterion requires an interval excluding zero on the better side.`;

  const liveness = await measureWeightSetSelectionLiveness({
    seed,
    config,
    profileId: census.referenceProfileId,
    cell,
    buildings: resources.buildingsById,
  });

  return Object.freeze({
    seed,
    holdoutSeed,
    seedsDisjoint: seed !== holdoutSeed,
    cellId: cell.id,
    building: cell.building,
    point: cell.point.id,
    resolutionLimits,
    gateMetric: SELECTION_GATE,
    census,
    learned,
    replications,
    quotable,
    unquotableArms: Object.freeze(unquotableArms),
    crnAligned,
    arms: Object.freeze(arms),
    liveness,
    verdict: accepted ? ('ACCEPTED' as const) : ('NOT ACCEPTED' as const),
    verdictReason,
    holdoutMeanDeltaTtdS,
    holdoutVerdict,
  });
}

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

function formatCell(cell: CellComparison): string {
  const { mean, lower, upper } = cell.estimate;
  const sign = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
  return `${sign(mean)} [${sign(lower)}, ${sign(upper)}] ${cell.verdict}`;
}

/** The whole study as a table, for a reader reproducing a quoted figure. */
export function formatWeightSetSelection(study: SelectionStudy): string {
  const lines: string[] = [
    'Phase 6c — learned weight selection, measured against DECISIONS.md § D126',
    '',
    `point            ${study.building} / ${study.point}`,
    `gate             ${study.gateMetric} (and only ${study.gateMetric})`,
    `tuning seed      ${String(study.seed)}`,
    `holdout seed     ${String(study.holdoutSeed)}  ${study.seedsDisjoint ? 'DISJOINT' : 'NOT DISJOINT'}`,
    `budget           ${String(study.replications)} replications` +
      (study.census.ceiling === undefined
        ? ' (the reference arm kept a quotable AWT across the census; the budget is a choice)'
        : ` (reference-arm ceiling ${String(study.census.ceiling)})`) +
      ` — all-arm ceiling ${study.census.allArmCeiling === undefined ? 'none' : String(study.census.allArmCeiling)}, reported beside the budget and never the budget`,
    `resolution       near-neighbour ${study.resolutionLimits.nearNeighbourS.toFixed(3)} s, structural ${study.resolutionLimits.structuralS.toFixed(3)} s — ${study.resolutionLimits.provenance}`,
    `CRN aligned      ${String(study.crnAligned)}`,
    `quotable         ${String(study.quotable)}${study.unquotableArms.length === 0 ? '' : ` — unquotable: ${study.unquotableArms.join(', ')}`}`,
    '',
    `census (${String(study.census.replications)} replications, seed ${String(study.census.seed)}) — reference arm chosen before any selector existed`,
  ];
  for (const row of [...study.census.rows].sort((a, b) => a.meanTtdS - b.meanTtdS)) {
    lines.push(
      `  ${row.profileId === study.census.referenceProfileId ? '*' : ' '} ${row.profileId.padEnd(22)} TTD ${row.meanTtdS.toFixed(3)} s  quotable=${String(row.quotable)}` +
        (row.firstInvalidReplication === undefined
          ? ''
          : `  first saturated replication ${String(row.firstInvalidReplication)}`),
    );
  }

  lines.push('', `learning (${String(study.learned.candidates.length)} candidates × ${String(study.learned.replications)} replications, tuning seed ${String(study.learned.tuningSeed)})`);
  lines.push(`  dimensions: ${study.learned.dimensions.join(', ')}`);
  for (const candidate of study.learned.candidates) {
    lines.push(
      `  ${candidate.index === study.learned.winner.index ? '*' : ' '} #${String(candidate.index)} ` +
        `gains ${[candidate.selection.lobbyArrivalRateGain, candidate.selection.interfloorRateGain, candidate.selection.downPeakRateGain].map((value) => (value ?? 1).toFixed(3)).join('/')} ` +
        `margin ${(candidate.selection.switchMargin ?? 0).toFixed(3)}  ` +
        `ΔTTD ${candidate.meanDeltaTtdS >= 0 ? '+' : ''}${candidate.meanDeltaTtdS.toFixed(3)} s  ` +
        `identical ${String(candidate.identicalReplications)}/${String(study.learned.replications)}`,
    );
  }

  lines.push('', 'verdict cells — the gate, then the costs beside it and never folded in');
  for (const arm of study.arms) {
    lines.push(`  ${arm.label} (${arm.armId})`);
    lines.push(`    TTD    ${formatCell(arm.gate)}`);
    for (const cost of arm.costs) lines.push(`    ${cost.metric.padEnd(6)} ${formatCell(cost)}`);
    lines.push(
      `    identical ${String(arm.identicalReplications)}/${String(study.replications)}  ` +
        `regime ${arm.regime} (limit ${arm.resolutionLimitS.toFixed(2)} s)  ` +
        `belowResolutionLimit=${String(arm.belowResolutionLimit)}`,
    );
  }

  lines.push('', 'liveness — trajectories, not means');
  const live = study.liveness;
  lines.push(
    `  patterns entered: ${live.patternsVisited.length === 0 ? 'none' : live.patternsVisited.join(' → ')}  switches=${String(live.switches)}`,
  );
  lines.push(
    `  shipped map vs permuted map: identical=${String(live.weightSetContrast.identical)} ` +
      `moves ${String(live.weightSetContrast.movesA)}/${String(live.weightSetContrast.movesB)} ` +
      `firstDivergence=${live.weightSetContrast.firstDivergence === undefined ? 'none' : String(live.weightSetContrast.firstDivergence)} ` +
      `TTD ${live.weightSetContrast.ttdA.toFixed(3)} vs ${live.weightSetContrast.ttdB.toFixed(3)}`,
  );
  lines.push(
    `  selector on vs off:          identical=${String(live.selectorContrast.identical)} ` +
      `firstDivergence=${live.selectorContrast.firstDivergence === undefined ? 'none' : String(live.selectorContrast.firstDivergence)}`,
  );
  lines.push(`  selector off vs no options:  identical=${String(live.offIsIdentical)}`);

  lines.push(
    '',
    `holdout   ΔTTD ${study.holdoutMeanDeltaTtdS >= 0 ? '+' : ''}${study.holdoutMeanDeltaTtdS.toFixed(3)} s on the disjoint seed — ${study.holdoutVerdict}`,
    '',
    `PHASE 6c: ${study.verdict}`,
    `  ${study.verdictReason}`,
  );
  return lines.join('\n');
}


/* c8 ignore start -- the command shell. */
if (process.argv[1]?.endsWith('weightSetSelection.js') === true) {
  process.stdout.write(`${formatWeightSetSelection(await runWeightSetSelectionStudy())}\n`);
}
/* c8 ignore stop */
