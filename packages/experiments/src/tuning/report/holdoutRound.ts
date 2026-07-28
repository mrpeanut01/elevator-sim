/**
 * The driver: finalists in, a {@link TuningReport} out, with the **holdout set actually run**.
 *
 * ```ts
 * const round = await runHoldoutRound({
 *   resources, buildingId: 'garden-apartments', traffic,
 *   reference:  { candidateId: 'predictive-balanced', profile: shipped },
 *   candidates: [{ candidateId: 'c-t2', profile: deadbandTwo, parameters: { 'idle.repositionThresholdS': 2 } }],
 *   tuningSeed: '20260726', holdoutSeed: '981234567', replications: 60,
 * });
 * console.log(round.page);
 * ```
 *
 * ## Why this file exists at all
 *
 * docs/05-roadmap.md § *Standing requirement — the integration seam has an owner*: the most
 * expensive defect this project has produced is a behaviour that is configurable, unit-tested in
 * isolation and **called by nothing**, and it has shipped four times. `tuning/report` was the fifth:
 * every function in it was exercised by its own suite, `seedSetFromReplications` existed precisely
 * to be the seam, and the only caller it had was a test. Reachability is not use — a barrel
 * re-export and a `{@link}` tag look exactly like a caller and are not one.
 *
 * So this is the file the report has to be *called from*, and the one thing it does that nothing
 * else in the repository does: **it runs the holdout set.** A search cannot. Every round a search
 * runs is one experiment seed shared by every candidate, because that is what makes the comparison
 * paired (docs/03 § *Measured*: 99.69 % of the variance, 324× in replications, between
 * near-neighbours). The seeds a search optimizes against are therefore, by construction, the only
 * seeds it has ever seen — and CLAUDE.md § Tuning discipline's guard is a *second, disjoint* set
 * that nothing in the search was allowed to look at. Somebody has to run it. This is that somebody.
 *
 * ## Why the finalists are re-run rather than read out of the search
 *
 * `SearchResult`'s `Evaluation.samples` is one scalarized, lower-is-better number per replication:
 * no per-replication `(AWT, energy, WT95)` triple, no seed, no `awtIsValid`. That is exactly right
 * for a search — `plateau.ts` needs elementwise equality of a vector and nothing else — and it is
 * not enough for a report, which pairs on the **seed** and suppresses on `awtIsValid`. The shape
 * {@link CandidateEvaluation} needs is not recoverable from a finished search, so the finalists are
 * re-run through the Phase 3 runner, which produces all of it. A search hands over *which points to
 * measure*; this file measures them.
 *
 * There is no second replication runner here, no second CRN derivation and no second statistic:
 * `runExperiment` does the first two and `buildTuningReport` the third.
 *
 * ## What it refuses
 *
 * - **The same seed for both sets.** One experiment seed is one set of passenger traces
 *   (`runner/crn.ts` derives a replication's seed from `(experimentSeed, index)` and nothing else),
 *   so running the "holdout" at the tuning seed produces the tuning set under a second name, with
 *   every paired difference identical and every `generalizes` verdict vacuous. Refused before
 *   anything runs; `buildTuningReport` then re-checks the realized seeds, which is the check that
 *   holds even if the derivation changes.
 * - **Two arms declaring different profiles under one profile id**, which would silently run one
 *   candidate's configuration under the other's name.
 * - **An arm the runner returned no replications for.**
 */

import type { DispatcherProfile } from '@elevator-sim/core';

import { runExperiment } from '../../runner/index.js';
import type {
  CellResult,
  ExperimentResources,
  ExperimentResult,
  ExperimentRunOptions,
  ExperimentSpec,
  ParallelSpec,
  SimulationOverridesSpec,
  TrafficArmSpec,
} from '../../runner/types.js';

import { buildTuningReport, seedSetFromReplications, type ReplicationSource } from './build.js';
import { formatTuningReport } from './format.js';
import {
  TuningReportError,
  type CandidateEvaluation,
  type ObjectiveSpec,
  type SeedSetRole,
  type TuningReport,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Arms
 * -------------------------------------------------------------------------- */

/**
 * One finalist: an id, the configuration it stands for, and the point that produced it.
 *
 * `profile` is a whole {@link DispatcherProfile} rather than an options object because the one
 * dimension Phase 7 has a **known answer** on — `idle.repositionThresholdS`, whose sweep on Garden
 * Apartments has an interior optimum at 2 s against the profile's shipped 8 s (docs/06 § Worked
 * example) — lives in the profile's `idle` section, which `DispatcherArmSpec.options` cannot reach.
 * A driver that could only vary weights could not measure the case that validates the phase.
 *
 * `parameters` is printed on the page and never interpreted, exactly as
 * {@link CandidateEvaluation.parameters} is: the dotted ids of docs/06's schema, so a reader can see
 * which point in the space produced the arm without this module knowing what any of them mean.
 */
export interface TuningArm {
  readonly candidateId: string;
  readonly label?: string | undefined;
  readonly profile: DispatcherProfile;
  readonly parameters?: Readonly<Record<string, number | string | boolean>> | undefined;
}

/* -------------------------------------------------------------------------- *
 * Input and output
 * -------------------------------------------------------------------------- */

export interface HoldoutRoundInput {
  /** Structurally satisfied by core's `LoadedConfig`. Arm profiles are registered into a copy. */
  readonly resources: ExperimentResources;
  readonly buildingId: string;
  readonly traffic: TrafficArmSpec;
  /** The incumbent every claim is measured against. docs/06: not `nearest-car`. */
  readonly reference: TuningArm;
  /** The finalists, in the order the report should print them. Never reordered by result. */
  readonly candidates: readonly TuningArm[];
  /** The experiment seed the search optimized against. */
  readonly tuningSeed: number | string;
  /** A different experiment seed, and therefore different traffic. The guard. */
  readonly holdoutSeed: number | string;
  readonly replications: number;
  /** Holdout budget, when it differs from the tuning one. Defaults to {@link replications}. */
  readonly holdoutReplications?: number | undefined;
  readonly experimentId?: string | undefined;
  readonly title?: string | undefined;
  readonly confidence?: number | undefined;
  readonly objectives?: readonly ObjectiveSpec[] | undefined;
  /**
   * How to read an energy proxy off a replication.
   *
   * Omit and the energy axis stays unmeasured and is reported as unmeasured — which is still the
   * right answer for a stored record written before `core` recorded travel, since a record with no
   * `travelSamples` summarizes to `energy.measured: false` and `NaN` rather than to zero.
   *
   * Supply it and the third axis activates. `benchmark/phase7Acceptance.ts` passes
   * `(replication) => replication.summary.energy.workKJ` — out-of-balance mechanical work over the
   * reporting window — and that one lambda is the whole of the wiring on this side, exactly as this
   * parameter was designed to make it. No other signature changed. See `pareto.ts` § the objective
   * table for the formula's basis and for what the proxy deliberately omits.
   */
  readonly energyProxyOf?: ((replication: ReplicationSource) => number) | undefined;
  /** Defaults to serial: a fixed, reproducible budget is what a paired interval needs. */
  readonly parallel?: ParallelSpec | undefined;
  readonly simulation?: SimulationOverridesSpec | undefined;
  readonly maxInvalidFraction?: number | undefined;
  readonly targetHalfWidth?: number | undefined;
  readonly replicationCap?: number | undefined;
  /** The runner. Injected so a caller can instrument it. Defaults to `runExperiment`. */
  readonly run?:
    | ((
        spec: ExperimentSpec,
        resources: ExperimentResources,
        options: ExperimentRunOptions,
      ) => Promise<ExperimentResult>)
    | undefined;
}

/** A finished round: the two experiments, the evaluations they produced, and the page. */
export interface HoldoutRound {
  readonly report: TuningReport;
  /** `formatTuningReport(report)`, deterministic byte-for-byte from the report value alone. */
  readonly page: string;
  readonly tuningResult: ExperimentResult;
  readonly holdoutResult: ExperimentResult;
  /** Reference first, then the candidates in input order. */
  readonly evaluations: readonly CandidateEvaluation[];
}

/* -------------------------------------------------------------------------- *
 * The spec
 * -------------------------------------------------------------------------- */

/**
 * The `ExperimentSpec` one seed set becomes. Pure, and exported so it can be asserted directly.
 *
 * One experiment holding **every** arm, at **one** seed, with `min === max === n` and no stopping
 * rule. All three matter and none is incidental:
 *
 * - one experiment at one seed is what makes the arms CRN-paired, because a replication's seed
 *   derives from `(experimentSeed, index)` alone;
 * - a fixed budget is what makes every arm's `n` equal, and an unequal `n` un-pairs the comparison
 *   the whole apparatus exists to make;
 * - the two roles differ **only** in the seed, so the difference between the sets is the traffic and
 *   nothing else.
 */
export function holdoutRoundSpec(input: HoldoutRoundInput, role: SeedSetRole): ExperimentSpec {
  const arms = [input.reference, ...input.candidates];
  const replications =
    role === 'holdout' ? (input.holdoutReplications ?? input.replications) : input.replications;
  const experimentId = input.experimentId ?? 'tuning-round';
  return {
    id: `${experimentId}-${role}`,
    description: `${role} seed set: ${arms.length} arm${arms.length === 1 ? '' : 's'} on ${input.buildingId}`,
    seed: String(role === 'holdout' ? input.holdoutSeed : input.tuningSeed),
    buildings: [input.buildingId],
    dispatchers: arms.map((arm) => ({ id: arm.candidateId, profile: arm.profile.id })),
    traffic: [input.traffic],
    replication: {
      minReplications: replications,
      maxReplications: replications,
      checkEvery: replications,
      stopOnSaturation: false,
    },
    parallel: input.parallel ?? { mode: 'serial' },
    ...(input.simulation === undefined ? {} : { simulation: input.simulation }),
  };
}

/* -------------------------------------------------------------------------- *
 * The join
 * -------------------------------------------------------------------------- */

export interface CandidateEvaluationsInput {
  readonly arms: readonly TuningArm[];
  readonly tuningResult: ExperimentResult;
  readonly holdoutResult: ExperimentResult;
  readonly tuningSeedSetId: string;
  readonly holdoutSeedSetId: string;
  readonly energyProxyOf?: ((replication: ReplicationSource) => number) | undefined;
}

/**
 * Two `ExperimentResult`s and the arms that produced them, as {@link CandidateEvaluation}s.
 *
 * The whole search→report join, and pure: no simulator, no clock, no filesystem. The join key is
 * `dispatcherArmId === candidateId`, which is an identity rather than a lookup table because
 * {@link holdoutRoundSpec} sets the arm id from the candidate id.
 *
 * Nothing is recomputed here. `seedSetFromReplications` reuses `reports/reanalyze.ts`'s
 * `observationOf` for the field mapping, so "AWT" means one thing in this package rather than two.
 *
 * @throws TuningReportError when an arm has no replications on a set — an empty seed set would
 *   otherwise become a page of `UNQUOTABLE` cells that reads like a measurement of nothing rather
 *   than like the run that failed to happen.
 */
export function candidateEvaluationsOf(
  input: CandidateEvaluationsInput,
): readonly CandidateEvaluation[] {
  return Object.freeze(
    input.arms.map((arm) => {
      const tuningCell = cellFor(input.tuningResult, arm.candidateId, 'tuning');
      const holdoutCell = cellFor(input.holdoutResult, arm.candidateId, 'holdout');
      return Object.freeze({
        candidateId: arm.candidateId,
        ...(arm.label === undefined ? {} : { label: arm.label }),
        ...(arm.parameters === undefined ? {} : { parameters: arm.parameters }),
        tuning: seedSetFromReplications(tuningCell.replications, {
          seedSetId: input.tuningSeedSetId,
          role: 'tuning',
          ...(input.energyProxyOf === undefined ? {} : { energyProxyOf: input.energyProxyOf }),
        }),
        holdout: seedSetFromReplications(holdoutCell.replications, {
          seedSetId: input.holdoutSeedSetId,
          role: 'holdout',
          ...(input.energyProxyOf === undefined ? {} : { energyProxyOf: input.energyProxyOf }),
        }),
      });
    }),
  );
}

/* -------------------------------------------------------------------------- *
 * The round
 * -------------------------------------------------------------------------- */

/**
 * Run the finalists on both seed sets and report them.
 *
 * @throws TuningReportError when the two seeds are equal, when two arms declare different profiles
 *   under one id, when an arm produced no replications, or — from `buildTuningReport` — when the
 *   realized seed sets turn out not to be disjoint after all.
 */
export async function runHoldoutRound(input: HoldoutRoundInput): Promise<HoldoutRound> {
  const arms = [input.reference, ...input.candidates];
  if (String(input.tuningSeed) === String(input.holdoutSeed)) {
    throw new TuningReportError(
      `runHoldoutRound: the holdout experiment seed (${String(input.holdoutSeed)}) equals the tuning seed. A replication's seed derives from the experiment seed and its index alone, so both "sets" would be the same passenger traces under two names: every paired difference would be identical, every generalization verdict vacuous, and the page would print DISJOINT over one experiment counted twice.`,
    );
  }
  if (input.replications < 2) {
    throw new TuningReportError(
      `runHoldoutRound: ${input.replications} replications per arm. A paired interval needs at least two, and docs/03-traffic-and-statistics.md § Part 3 budgets 50–200 — ten produced a 12 % error against the converged mean in the reference study.`,
    );
  }

  const resources = withArmProfiles(input.resources, arms);
  const run = input.run ?? runExperiment;
  const runOptions: ExperimentRunOptions = { keepRecords: false };

  const tuningResult = await run(holdoutRoundSpec(input, 'tuning'), resources, runOptions);
  const holdoutResult = await run(holdoutRoundSpec(input, 'holdout'), resources, runOptions);

  const evaluations = candidateEvaluationsOf({
    arms,
    tuningResult,
    holdoutResult,
    tuningSeedSetId: `tune-${String(input.tuningSeed)}`,
    holdoutSeedSetId: `hold-${String(input.holdoutSeed)}`,
    ...(input.energyProxyOf === undefined ? {} : { energyProxyOf: input.energyProxyOf }),
  });

  const [reference, ...candidates] = evaluations as [CandidateEvaluation, ...CandidateEvaluation[]];
  const report = buildTuningReport({
    title:
      input.title ??
      `Tuning round on ${input.buildingId} (${input.traffic.id}) against "${input.reference.candidateId}"`,
    reference,
    candidates,
    ...(input.objectives === undefined ? {} : { objectives: input.objectives }),
    ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
    ...(input.maxInvalidFraction === undefined
      ? {}
      : { maxInvalidFraction: input.maxInvalidFraction }),
    ...(input.targetHalfWidth === undefined ? {} : { targetHalfWidth: input.targetHalfWidth }),
    ...(input.replicationCap === undefined ? {} : { replicationCap: input.replicationCap }),
  });

  return Object.freeze({
    report,
    page: formatTuningReport(report),
    tuningResult,
    holdoutResult,
    evaluations,
  });
}

/* -------------------------------------------------------------------------- *
 * Internals
 * -------------------------------------------------------------------------- */

/**
 * The arms' profiles registered alongside the shipped ones.
 *
 * @throws TuningReportError when two arms bind different profiles to one id. The runner resolves an
 *   arm's `profile` through this map, so a collision would run one candidate's configuration under
 *   the other's name and attribute the result to whichever arm asked second.
 */
function withArmProfiles(
  resources: ExperimentResources,
  arms: readonly TuningArm[],
): ExperimentResources {
  const dispatcherProfilesById = new Map(resources.dispatcherProfilesById);
  const declaredBy = new Map<string, string>();
  for (const arm of arms) {
    const existing = dispatcherProfilesById.get(arm.profile.id);
    const owner = declaredBy.get(arm.profile.id);
    if (existing !== undefined && existing !== arm.profile) {
      throw new TuningReportError(
        `Arm "${arm.candidateId}" declares a profile under id "${arm.profile.id}", which ${owner === undefined ? 'is already a different shipped profile' : `arm "${owner}" already bound to a different profile`}. Two arms cannot share a profile id and differ, or the runner runs one configuration under both names.`,
      );
    }
    dispatcherProfilesById.set(arm.profile.id, arm.profile);
    declaredBy.set(arm.profile.id, arm.candidateId);
  }
  return Object.freeze({
    buildingsById: resources.buildingsById,
    dispatcherProfilesById,
    trafficProfiles: resources.trafficProfiles,
    ...(resources.elevatorSpecs === undefined ? {} : { elevatorSpecs: resources.elevatorSpecs }),
  });
}

/** The one cell for an arm. @throws TuningReportError when there is not exactly one, non-empty. */
function cellFor(result: ExperimentResult, candidateId: string, role: SeedSetRole): CellResult {
  const matches = result.cells.filter((cell) => cell.dispatcherArmId === candidateId);
  const cell = matches[0];
  if (matches.length !== 1 || cell === undefined) {
    throw new TuningReportError(
      `The ${role} experiment returned ${matches.length} cells for arm "${candidateId}"; exactly one is required. Cells present: ${result.cells.map((entry) => entry.dispatcherArmId).join(', ')}.`,
    );
  }
  if (cell.replications.length === 0) {
    throw new TuningReportError(
      `Arm "${candidateId}" has no replications on the ${role} seed set (${cell.failures.length} failed). An empty seed set renders as a page of unquotable cells, which reads like a measurement of nothing rather than like a run that did not happen.`,
    );
  }
  return cell;
}
