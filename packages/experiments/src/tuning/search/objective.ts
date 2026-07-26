/**
 * The seam: an {@link Objective} backed by the **Phase 3 replication runner**.
 *
 * docs/05-roadmap.md's standing requirement is that a new behaviour's integration seam has a named
 * owner, because four Phase 5 mechanisms shipped configurable, unit-tested and called by nothing.
 * This file is the seam for the search: the file `randomSearch`, `successiveHalving` and `sepCmaEs`
 * have to be *called from* in order to touch a simulator. There is no second replication runner
 * here, no second CRN derivation, and no second stopping policy — `runExperiment` does all three,
 * and everything below is the translation between a round of candidates and one `ExperimentSpec`.
 *
 * ## How one round becomes one experiment
 *
 * ```
 * round of k candidates, n replications, seed s
 *   → ExperimentSpec { buildings: [one], traffic: [one], dispatchers: k arms, seed: s,
 *                      replication: { min: n, max: n } }
 *   → k cells, all sharing a traceKey (it is a function of building and traffic only)
 *   → replication i of every cell seeded from (s, i) alone
 *   → common random numbers, by construction rather than by convention
 * ```
 *
 * That last step is why the spec is built this way. `runner/crn.ts` derives a replication's seed
 * from `(experimentSeed, replicationIndex)` and *nothing else* — not the dispatcher, not the cell
 * index, not the plan size — so putting every candidate of a round into **one** experiment at
 * **one** seed is what makes them CRN-paired. Splitting a round into k separate experiments with k
 * seeds would produce the same means and throw away the 324× (`round.ts` would then catch it, but
 * the point is not to write it).
 *
 * ## Why a candidate becomes a profile rather than an options object
 *
 * `DispatcherArmSpec.options` can override weights, normalization and hard constraints, and
 * nothing else. The single dimension Phase 7 has a **known answer** on —
 * `idle.repositionThresholdS`, whose sweep on Garden Apartments has an interior optimum at 2 s
 * against the shipped 8 s — lives in the profile's `idle` section and is not reachable that way.
 * A search that could only move weights could not rediscover the one result that validates it.
 *
 * So a candidate is materialized into a whole {@link DispatcherProfile} and registered under its
 * own id, which `ExperimentResources` explicitly supports. The materialization itself — writing a
 * sampled value back through the dotted `id` of `DISPATCH_PARAMETERS` — belongs to `tuning/space`
 * and is injected as {@link RunnerObjectiveOptions.materialize}. This module never learns what a
 * parameter is, which is the contract docs/06 § The parameter schema describes.
 *
 * ## What is *not* decided here
 *
 * The stopping rule. A round declares a fixed `n` and gets exactly `n`, because successive halving
 * owns the fidelity schedule and a sequential rule underneath it would silently give two
 * candidates in the same rung different replication counts — which un-pairs them, and un-paired is
 * the one thing this whole apparatus exists to prevent.
 */

import type { DispatcherProfile } from '@elevator-sim/core';

import { runExperiment } from '../../runner/index.js';
import type {
  CellResult,
  ExperimentResources,
  ExperimentResult,
  ExperimentSpec,
  ParallelSpec,
  ReplicationMetric,
  SimulationOverridesSpec,
  TrafficArmSpec,
} from '../../runner/index.js';

import {
  SearchError,
  type CandidateOutcome,
  type Objective,
  type ObjectiveRequest,
} from './types.js';

export interface RunnerObjectiveOptions<C> {
  /** Structurally satisfied by core's `LoadedConfig`. Candidate profiles are added to a copy. */
  readonly resources: ExperimentResources;
  readonly buildingId: string;
  readonly traffic: TrafficArmSpec;
  /**
   * Turn a candidate into a dispatcher profile carrying the given id.
   *
   * Owned by `tuning/space`: it is the direction of the schema contract that writes a sampled
   * value back through a parameter's dotted `id`. The returned profile's `id` **must** equal the
   * `id` argument, or the arm and the profile disagree about which candidate ran.
   */
  readonly materialize: (candidate: C, profileId: string) => DispatcherProfile;
  /** The scalar being minimized. `awtS` unless a study says otherwise. */
  readonly metric?: ReplicationMetric | undefined;
  /**
   * `1` to minimize the metric, `-1` to maximize it.
   *
   * Every optimizer here minimizes; a metric where more is better (`personsPer5Min`) is negated
   * once, here, rather than in three search loops.
   */
  readonly direction?: 1 | -1 | undefined;
  readonly experimentId?: string | undefined;
  readonly parallel?: ParallelSpec | undefined;
  readonly simulation?: SimulationOverridesSpec | undefined;
  /**
   * The runner. Injected so the spec-building half can be tested without a simulator, and so a
   * caller can wrap it for instrumentation. Defaults to `runExperiment`.
   */
  readonly run?:
    | ((spec: ExperimentSpec, resources: ExperimentResources) => Promise<ExperimentResult>)
    | undefined;
  /**
   * Called with every experiment the search runs.
   *
   * **This is the path to `tuning/report`.** A {@link Evaluation} carries the scalar being
   * optimized and nothing else, which is right for a search and not enough for a report:
   * `CandidateEvaluation` wants whole `ReplicationObservation`s — every metric, and each
   * replication's **seed**, which is the pairing key a paired interval is computed on. All of it
   * is already in the `ExperimentResult` this hook hands over, and the join is exact because a
   * candidate's id *is* its dispatcher arm id:
   *
   * ```ts
   * const evaluations: ExperimentResult[] = [];
   * const objective = runnerObjective({ …, onExperiment: (r) => evaluations.push(r) });
   * // …run a search, then, for the cell whose dispatcherArmId is result.best.candidate.id:
   * const observations = cell.replications.map((rep) => observationOf(rep.summary));
   * ```
   *
   * `observationOf` is `reports/reanalyze.ts`'s. Nothing is recomputed and nothing is re-simulated.
   */
  readonly onExperiment?: ((result: ExperimentResult) => void) | undefined;
}

/**
 * The `ExperimentSpec` one round becomes. Pure, and exported so it can be asserted directly.
 *
 * `minReplications === maxReplications === n` with no stopping rule is a **fixed-budget**
 * experiment, which is what a rung of a fidelity ladder is.
 */
export function roundExperimentSpec<C>(
  options: RunnerObjectiveOptions<C>,
  request: ObjectiveRequest<C>,
): ExperimentSpec {
  const experimentId = options.experimentId ?? 'tuning';
  return {
    id: `${experimentId}-round-${request.round}`,
    description: request.label,
    seed: request.seed.toString(),
    buildings: [options.buildingId],
    dispatchers: request.candidates.map((candidate) => ({
      id: candidate.id,
      profile: candidate.id,
    })),
    traffic: [options.traffic],
    replication: {
      minReplications: request.replications,
      maxReplications: request.replications,
      checkEvery: request.replications,
      stopOnSaturation: false,
    },
    ...(options.parallel === undefined ? {} : { parallel: options.parallel }),
    ...(options.simulation === undefined ? {} : { simulation: options.simulation }),
  };
}

/**
 * Build the objective a search evaluates candidates through.
 *
 * @throws SearchError when {@link RunnerObjectiveOptions.materialize} returns a profile whose id
 *   is not the candidate's, or when the runner returns a cell the round did not ask for.
 */
export function runnerObjective<C>(options: RunnerObjectiveOptions<C>): Objective<C> {
  const metric: ReplicationMetric = options.metric ?? 'awtS';
  const direction = options.direction ?? 1;
  const run = options.run ?? ((spec, resources) => runExperiment(spec, resources, { keepRecords: false }));

  return async (request: ObjectiveRequest<C>): Promise<readonly CandidateOutcome[]> => {
    const profiles = new Map(options.resources.dispatcherProfilesById);
    for (const candidate of request.candidates) {
      const profile = options.materialize(candidate.value, candidate.id);
      if (profile.id !== candidate.id) {
        throw new SearchError(
          `materialize() returned a profile with id "${profile.id}" for candidate "${candidate.id}". The arm id and the profile id must agree, or the result attributes a run to the wrong candidate.`,
          'materialize',
        );
      }
      profiles.set(candidate.id, profile);
    }

    const result = await run(roundExperimentSpec(options, request), {
      ...options.resources,
      dispatcherProfilesById: profiles,
    });
    options.onExperiment?.(result);

    const byArm = new Map<string, CellResult>();
    for (const cell of result.cells) byArm.set(cell.dispatcherArmId, cell);

    return request.candidates.map((candidate) => {
      const cell = byArm.get(candidate.id);
      if (cell === undefined) {
        throw new SearchError(
          `The runner returned no cell for candidate "${candidate.id}" in round ${request.round}.`,
        );
      }
      return outcomeOf(cell, metric, direction);
    });
  };
}

/**
 * One cell, as an objective outcome.
 *
 * `awtIsValid` is the flag docs/03-traffic-and-statistics.md § Part 3 says a report must consult
 * before quoting a mean, and it is narrower than saturation — it also covers censoring and an
 * empty window. It is carried through to {@link CandidateOutcome.quotable} for the wait metrics,
 * which is what stops a candidate that cleared its queue by not serving anybody from winning.
 */
export function outcomeOf(
  cell: CellResult,
  metric: ReplicationMetric,
  direction: 1 | -1 = 1,
): CandidateOutcome {
  const aggregate = cell.aggregate.metrics[metric];
  const samples = aggregate.samples.map((value) => direction * value);
  const waitMetric = metric === 'awtS' || metric === 'wt95S' || metric === 'wt99S' || metric === 'maxWaitS';
  return {
    candidateId: cell.dispatcherArmId,
    samples,
    traceDigests: cell.replications.map((replication) => replication.traceDigest),
    saturated: cell.aggregate.saturated,
    quotable: waitMetric ? cell.aggregate.awtIsValid : !cell.aggregate.saturated,
  };
}
