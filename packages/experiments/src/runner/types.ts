/**
 * The vocabulary of an experiment: what you declare, and what comes back.
 *
 * ## What an experiment *is*, here
 *
 * A cross product. `buildings × dispatchers × traffic` gives a set of **cells**; each cell is
 * run for as many **replications** as the replication policy asks for; each replication is one
 * `Simulation` driven by one seed. Nothing in this file is a strategy, a branch or a special
 * case — an {@link ExperimentSpec} is JSON (CLAUDE.md invariant 7) and every knob it can set is
 * declared in {@link RUNNER_PARAMETERS} with a type, a range and a default (invariant 8).
 *
 * ## The three properties the shapes here exist to protect
 *
 * **1. Common random numbers.** A replication's seed is a function of
 * `(experimentSeed, replicationIndex)` and *nothing else* — see `crn.ts`. It does not depend on
 * the dispatcher, on the cell's position in the plan, on how many cells there are, or on the
 * order the cells happen to be run in. So dispatcher A's replication 7 and dispatcher B's
 * replication 7 are driven by an identical passenger population, the paired difference is
 * meaningful, and the variance of that difference collapses
 * (docs/03-traffic-and-statistics.md § Part 4). {@link ExperimentCell.traceKey} names the
 * equivalence class this holds within, and {@link ReplicationRecord.traceDigest} lets a stored
 * result be audited for it after the fact.
 *
 * **2. Parallelism cannot move a number.** Every replication is independent and internally
 * deterministic, so the only way execution strategy could leak into a result is through
 * ordering. It cannot: outcomes are assembled by task index rather than completion order, the
 * stopping rule is always evaluated over the *prefix* of replications in index order, and
 * {@link ResolvedReplicationPolicy.checkEvery} — how many replications run between two
 * evaluations of the rule — is **policy data, not a function of core count**. Two runs of the
 * same spec on a 4-core and a 64-core machine therefore run the same replications and report
 * the same numbers. {@link ExecutionReport} is quarantined from
 * `fingerprintExperiment()` precisely because it is the one part of the result that legitimately
 * differs.
 *
 * **3. A saturated run is flagged, never averaged away.** docs/03-traffic-and-statistics.md
 * § Part 3: "If a configuration saturates, flag it and suppress the AWT interval." So
 * saturation is carried per replication ({@link ReplicationRecord.saturated}) *and* propagated
 * to the cell ({@link CellAggregate.saturated}), and {@link CellAggregate.awtIsValid} is the
 * single boolean a report reads before quoting a mean.
 *
 * ## What is deliberately *not* here
 *
 * The sequential-stopping arithmetic — Student-t at `n − 1`, at **every** `n` — and the paired-t
 * interval belong to `stats/`. This module declares
 * the **port** ({@link StoppingRule}) and consumes whatever satisfies it. That is not
 * squeamishness about a dependency: the runner's job is to decide *when to ask* and to keep the
 * answer reproducible, and a runner that also owned the statistics would make the stopping rule
 * untestable apart from a simulator.
 */

import type {
  ConservationAudit,
  DemandTemplateId,
  DispatchPolicyOptions,
  DispatcherProfile,
  DispatcherProfiles,
  ElevatorSpecs,
  ResolvedBuilding,
  RunRecord,
  RunSummary,
  SimulationConfig,
  SimulationDemandOptions,
  SimulationStatus,
  SummarizeOptions,
  TrafficProfiles,
  WindowSelection,
} from '@elevator-sim/core';

import type { ReplicationStatistic } from '../oracle/types.js';

import { REPLICATION_METRICS } from './metrics.js';
import type { ReplicationMetric } from './metrics.js';

/* -------------------------------------------------------------------------- *
 * Errors
 * -------------------------------------------------------------------------- */

/**
 * An experiment that cannot be trusted, or a spec that cannot be run.
 *
 * Thrown for a malformed {@link ExperimentSpec}, for an id the resources do not contain, for a
 * replication that threw while `onReplicationError` is `'throw'`, and for a worker that died.
 * Never thrown for a *saturated* configuration: that is a legitimate measurement and is
 * reported through {@link CellAggregate.saturated}.
 */
export class RunnerError extends Error {
  /** Dotted path into the spec, when the fault is in the spec. */
  readonly path: string | undefined;

  constructor(message: string, path?: string | undefined, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined);
    this.name = 'RunnerError';
    this.path = path;
  }
}

/* -------------------------------------------------------------------------- *
 * Defaults and the tunable schema (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

export const RUNNER_DEFAULTS = Object.freeze({
  /**
   * Replications every cell runs before the stopping rule is consulted at all.
   *
   * 50, from docs/03-traffic-and-statistics.md § Part 3: Peters & Abbi's 4-lift up-peak reported
   * 5.6 s after 15 runs against a converged 5.0 s, and CIBSE's recommended ~10 would have
   * published that 12 % error. "Budget 50–200 replications per configuration, not 10."
   */
  minReplications: 50,
  /** Upper bound on replications per cell. The other end of the 50–200 budget. */
  maxReplications: 200,
  /**
   * Replications between two evaluations of the stopping rule.
   *
   * **Deliberately not the core count.** It is what makes the number of replications a function
   * of the spec rather than of the machine: a batch of 8 may overshoot the exact half-width
   * crossing by up to 7 replications, and it must overshoot it by the *same* amount on every
   * machine or "same experimentSeed ⇒ same result" is false. 8 is large enough to keep a worker
   * pool busy across a handful of cells and small enough that the overshoot is cheap.
   */
  checkEvery: 8,
  /** Confidence level handed to the stopping rule. 0.9 is the doc's worked example. */
  confidence: 0.9,
  /**
   * Half-width the stopping rule is asked to reach, in the target metric's own units.
   *
   * ±2 s on AWT is the doc's worked example. Meaningless without a rule: with no
   * {@link ExperimentRunOptions.stoppingRule} injected, every cell runs
   * {@link maxReplications}.
   */
  acceptableRange: 2,
  /** Which per-replication scalar the stopping rule watches. AWT is the headline. */
  stoppingMetric: 'awtS',
  /**
   * Stop a saturated cell at {@link minReplications} instead of refining a mean that will be
   * suppressed anyway.
   *
   * The doc's position is that an accurate AWT for a failed configuration is unnecessary; what
   * matters is that it is flagged. Burning 200 replications to tighten an interval that is then
   * withheld is the one case where more replications buy nothing.
   */
  stopOnSaturation: true,
  /**
   * Retain each replication's {@link RunRecord}.
   *
   * On by default because the record is what makes re-analysis possible without re-simulating
   * (docs/03-traffic-and-statistics.md § Part 5), and silently discarding data is the worse
   * failure. It is not free: a 750-passenger record is on the order of 100 kB, so 200
   * replications across 20 cells is gigabytes. Turn it off and stream them out through
   * {@link ExperimentRunOptions.onReplication} for a large sweep — the {@link RunSummary} and
   * the seed are retained either way, so every run stays replayable.
   */
  keepRecords: true,
  /**
   * What a *timed-out* replication means. `'report'`, not core's `'throw'`.
   *
   * A run that could not clear its demand inside the drain tail is exactly what a saturation
   * sweep is looking for, and `'throw'` would turn the measurement into a crash. Detection then
   * happens where it belongs, in `metrics/`'s queue-trend test, and surfaces as
   * {@link ReplicationRecord.saturated}.
   */
  onTimeout: 'report',
  /**
   * What an *exception* from a replication means. `'throw'`.
   *
   * A conservation-audit failure or a `TypeError` is a bug, not a data point, and a batch that
   * quietly folds 199 good replications into a mean while swallowing the 200th is the failure
   * mode CLAUDE.md § Statistical discipline exists to prevent. `'record'` is for a sweep that
   * knowingly drives configurations past their limits.
   */
  onReplicationError: 'throw',
  /** `'auto'` picks between serial and a worker pool by planned work. See {@link ParallelSpec}. */
  parallelMode: 'auto',
  /**
   * Guaranteed replications below which `'auto'` stays serial.
   *
   * Measured on this simulator, 10 physical cores, Node 26: a pool costs ~85 ms to spawn 4
   * workers and ~145 ms for 8 (thread start plus each worker's own module graph). Serial ran a
   * light replication in ~3 ms and a heavy one in ~47 ms, so 100 light replications went
   * 388 ms serial → 275 ms on 4 workers (1.4×) while 400 went 1185 ms → 563 ms on 8 (2.1×), and
   * 200 heavy replications went 9515 ms → 2351 ms (4.1×). Below ~64 replications of light work
   * the spawn cost is the whole budget and the pool is a loss. Hence: serial by default, pool
   * when the *guaranteed* work — cells × {@link minReplications} — clears this.
   */
  minReplicationsForWorkers: 64,
  /**
   * Worker threads when `'auto'` or `'workers'` chooses a pool, or `0` to derive one.
   *
   * Derived as `availableParallelism() - 2`, clamped to `[1, 8]`. Leaving two cores is not
   * superstition: the parent thread does the cloning, the stopping arithmetic and the
   * aggregation, and on the measurement above k=10 on 10 cores was consistently *slower* than
   * k=8 — 407 ms against 295 ms on the 100-replication light batch.
   */
  workers: 0,
} as const);

/** Parameter kinds a generic optimizer understands. See docs/06-parameterization-and-tuning.md. */
export type RunnerParameterType = 'continuous' | 'integer' | 'categorical' | 'boolean';

/**
 * A self-describing tunable, in the same shape as core's `SimParameterSpec`.
 *
 * Repeated rather than imported for the reason those declarations give: this is the generic
 * parameter-schema shape from docs/06-parameterization-and-tuning.md, which has no home module
 * until Phase 7 lands `tuning/`. When it does, all of them move there.
 */
export interface RunnerParameterSpec {
  /** Dotted path of the value, e.g. `runner.minReplications`. */
  readonly id: string;
  readonly type: RunnerParameterType;
  /** Inclusive `[min, max]`. Present for `continuous` and `integer`. */
  readonly range?: readonly [number, number] | undefined;
  readonly scale?: 'linear' | 'log' | undefined;
  /** Admissible values. Present for `categorical`. */
  readonly values?: readonly string[] | undefined;
  readonly default: number | string | boolean;
  /** SI unit, or omitted for a dimensionless quantity. */
  readonly unit?: string | undefined;
  readonly description: string;
  /** Parameter id to the values that make this parameter live. */
  readonly activeWhen?: Readonly<Record<string, readonly string[]>> | undefined;
}

/** Every knob the runner itself owns (CLAUDE.md invariant 8). */
export const RUNNER_PARAMETERS: readonly RunnerParameterSpec[] = Object.freeze([
  {
    id: 'runner.minReplications',
    type: 'integer',
    range: [1, 100_000],
    scale: 'log',
    default: RUNNER_DEFAULTS.minReplications,
    description:
      'Replications every cell runs before the stopping rule is consulted. Ten is not enough; the reference study reported a 12 % error against the converged mean at fifteen.',
  },
  {
    id: 'runner.maxReplications',
    type: 'integer',
    range: [1, 1_000_000],
    scale: 'log',
    default: RUNNER_DEFAULTS.maxReplications,
    description: 'Hard cap on replications per cell. Reached when the stopping rule never fires.',
  },
  {
    id: 'runner.checkEvery',
    type: 'integer',
    range: [1, 10_000],
    scale: 'log',
    default: RUNNER_DEFAULTS.checkEvery,
    description:
      'Replications between evaluations of the stopping rule. Policy data, never the core count: it fixes the overshoot past the half-width crossing so the replication count is machine-independent.',
  },
  {
    id: 'runner.confidence',
    type: 'continuous',
    range: [0.5, 0.999],
    scale: 'linear',
    default: RUNNER_DEFAULTS.confidence,
    description: 'Confidence level passed to the stopping rule and to any interval derived from the result.',
  },
  {
    id: 'runner.acceptableRange',
    type: 'continuous',
    range: [0, 1_000_000],
    scale: 'log',
    default: RUNNER_DEFAULTS.acceptableRange,
    unit: 's',
    description:
      'Target confidence-interval half-width in the stopping metric’s own units. Seconds when the metric is a duration. INERT unless a stopping rule is injected: it is reported in every StoppingSummary but read for a decision only inside decide()’s rule branch, and no shipped study injects a rule. Not expressible as activeWhen — a rule is an injected function, not a parameter with an id to condition on. DECISIONS.md § D125.',
  },
  {
    id: 'runner.stoppingMetric',
    type: 'categorical',
    values: REPLICATION_METRICS,
    default: RUNNER_DEFAULTS.stoppingMetric,
    description:
      'Per-replication scalar the stopping rule watches. Percentile metrics need substantially more replications than means; see docs/03-traffic-and-statistics.md § Part 5.',
  },
  {
    id: 'runner.stopOnSaturation',
    type: 'boolean',
    default: RUNNER_DEFAULTS.stopOnSaturation,
    description:
      'Stop a saturated cell at minReplications rather than tightening an interval that is suppressed anyway.',
  },
  {
    id: 'runner.keepRecords',
    type: 'boolean',
    default: RUNNER_DEFAULTS.keepRecords,
    description:
      'Retain each replication’s RunRecord in the result. Off trades re-windowing for memory; the summary and the seed are kept regardless.',
  },
  {
    id: 'runner.onTimeout',
    type: 'categorical',
    values: ['throw', 'report'],
    default: RUNNER_DEFAULTS.onTimeout,
    description:
      'What a run that could not clear its demand inside the drain tail means. "report" measures and flags it; core’s own default of "throw" would turn a saturation sweep into a crash.',
  },
  {
    id: 'runner.onReplicationError',
    type: 'categorical',
    values: ['throw', 'record'],
    default: RUNNER_DEFAULTS.onReplicationError,
    description:
      'What an exception from a replication means. "throw" stops the experiment, because a conservation-audit failure is a bug rather than a data point; "record" collects it and continues.',
  },
  {
    id: 'runner.parallelMode',
    type: 'categorical',
    values: ['auto', 'serial', 'workers'],
    default: RUNNER_DEFAULTS.parallelMode,
    description:
      'Execution strategy. Cannot change any reported number — only how long it takes to get one.',
  },
  {
    id: 'runner.minReplicationsForWorkers',
    type: 'integer',
    range: [1, 1_000_000],
    scale: 'log',
    default: RUNNER_DEFAULTS.minReplicationsForWorkers,
    description:
      'Guaranteed replications (cells × minReplications) below which auto mode stays serial, because thread spawn would dominate.',
    activeWhen: { 'runner.parallelMode': ['auto'] },
  },
  {
    id: 'runner.workers',
    type: 'integer',
    range: [0, 256],
    scale: 'linear',
    default: RUNNER_DEFAULTS.workers,
    description:
      'Worker threads in the pool, or 0 to derive availableParallelism() - 2 clamped to [1, 8].',
    activeWhen: { 'runner.parallelMode': ['auto', 'workers'] },
  },
]);

/* -------------------------------------------------------------------------- *
 * The declarative experiment (CLAUDE.md invariant 7)
 * -------------------------------------------------------------------------- */

/**
 * One dispatcher under comparison.
 *
 * The string shorthand `'collective'` means "the profile with that id, unmodified". The object
 * form exists so that a *variant* of a profile — the deliberately crippled control the Phase 3
 * acceptance criterion asks for, or an optimizer's candidate weight vector — is expressible as
 * data rather than as a second dispatcher class (CLAUDE.md invariant 7).
 *
 * A variant is a distinct arm with its own {@link id} but the same {@link profile}, so
 * `dispatcherProfileId` stays honest about which profile it came from and `armId` distinguishes
 * the two in the result.
 */
export interface DispatcherArmSpec {
  /** Arm id, unique within the experiment. Defaults to {@link profile}. */
  readonly id?: string | undefined;
  /** Profile id, looked up in {@link ExperimentResources.dispatcherProfilesById}. */
  readonly profile: string;
  /** Weight, normalization and hard-constraint overrides applied on top of the profile. */
  readonly options?: DispatchPolicyOptions | undefined;
}

/**
 * One traffic condition under comparison.
 *
 * Everything here feeds the passenger trace and therefore the CRN equivalence class: two cells
 * that differ in their traffic arm see *different* passenger populations even at the same
 * replication index, and comparing them pairwise would be comparing two different buildings'
 * worth of demand. `crn.ts` computes {@link ExperimentCell.traceKey} from exactly these fields.
 */
export interface TrafficArmSpec {
  readonly id: string;
  /**
   * `'rise-and-fall'` (the doc's recommendation), `'constant-iso'`, or `'lunch-two-way'` — the
   * third shipped template, whose directional mix varies within the run (DECISIONS.md § D169).
   * `core`'s `DEMAND_TEMPLATE_IDS` is the authority; this sentence named two when three shipped,
   * corrected 2026-07-30.
   */
  readonly demandTemplate?: DemandTemplateId | undefined;
  /** Demand horizon, seconds. Defaults to the template's own. */
  readonly durationS?: number | undefined;
  /** Window the summary is computed over. Defaults to the template's measurement window. */
  readonly reportWindow?: WindowSelection | undefined;
  /** Passed straight through to the trace generator. */
  readonly demand?: SimulationDemandOptions | undefined;
}

/** How many replications a cell gets, and what decides. */
export interface ReplicationPolicySpec {
  readonly minReplications?: number | undefined;
  readonly maxReplications?: number | undefined;
  readonly checkEvery?: number | undefined;
  readonly confidence?: number | undefined;
  readonly acceptableRange?: number | undefined;
  readonly stoppingMetric?: ReplicationMetric | undefined;
  readonly stopOnSaturation?: boolean | undefined;
}

export const PARALLEL_MODES = ['auto', 'serial', 'workers'] as const;

export type ParallelMode = (typeof PARALLEL_MODES)[number];

/**
 * How to spend cores. **Nothing here can change a reported number** — that property is what
 * makes the whole design safe, and `parallel.test.ts` asserts it rather than assuming it.
 */
export interface ParallelSpec {
  readonly mode?: ParallelMode | undefined;
  /** Worker threads, or `0`/omitted to derive one from `availableParallelism()`. */
  readonly workers?: number | undefined;
  /** Guaranteed replications below which `'auto'` stays serial. */
  readonly minReplicationsForWorkers?: number | undefined;
}

/** Simulation knobs the spec may set, applied to every cell. */
export interface SimulationOverridesSpec {
  readonly onTimeout?: 'throw' | 'report' | undefined;
  readonly transferWalkS?: number | undefined;
  readonly dispatchRetryS?: number | undefined;
  readonly drainGraceS?: number | undefined;
  readonly queueSampleCount?: number | undefined;
  readonly doorObstructionProbability?: number | undefined;
  readonly maxEvents?: number | undefined;
  /** Extra summary options. The window comes from the traffic arm. */
  readonly summarize?: Omit<SummarizeOptions, 'window'> | undefined;
}

/**
 * An experiment, as data.
 *
 * JSON-serializable end to end, so it can live in a file, be diffed, be generated by a Phase 7
 * optimizer, and be shipped to a worker thread by structured clone. {@link parseExperimentSpec}
 * validates an unknown value into one of these.
 *
 * ```json
 * {
 *   "id": "collective-vs-nearest-car",
 *   "seed": 20260726,
 *   "buildings": ["midtown-office"],
 *   "dispatchers": ["collective", "nearest-car"],
 *   "traffic": [{ "id": "up-peak", "demand": { "arrivalRatePctPop5min": 12 } }],
 *   "replication": { "minReplications": 50, "maxReplications": 200, "acceptableRange": 2 }
 * }
 * ```
 */
export interface ExperimentSpec {
  readonly id: string;
  readonly description?: string | undefined;
  /**
   * Master seed for the whole experiment. A decimal string is accepted so a 64-bit seed
   * survives JSON.
   *
   * Every replication seed derives from this and the replication index **alone**. Re-running a
   * spec with the same value reproduces every number in the result.
   */
  readonly seed: number | string;
  /** Building ids, looked up in {@link ExperimentResources.buildingsById}. */
  readonly buildings: readonly string[];
  /** Dispatcher arms. A bare string is the unmodified profile of that id. */
  readonly dispatchers: readonly (string | DispatcherArmSpec)[];
  readonly traffic: readonly TrafficArmSpec[];
  readonly replication?: ReplicationPolicySpec | undefined;
  readonly parallel?: ParallelSpec | undefined;
  readonly simulation?: SimulationOverridesSpec | undefined;
}

/**
 * Where the ids in a spec resolve to objects.
 *
 * Structurally satisfied by core's `LoadedConfig`, so `runExperiment(spec, await loadConfig(dir))`
 * works with no adaptor. Declared as its own interface rather than taking a `LoadedConfig` so a
 * caller can register a *derived* building or profile — a one-car fixture, a profile with
 * `idle.parkingStrategy` overridden — under an id of its own and reference it from the spec.
 */
export interface ExperimentResources {
  readonly buildingsById: ReadonlyMap<string, ResolvedBuilding>;
  readonly dispatcherProfilesById: ReadonlyMap<string, DispatcherProfile>;
  readonly trafficProfiles: TrafficProfiles;
  readonly elevatorSpecs?: ElevatorSpecs | undefined;
  /**
   * The whole of `data/dispatcher-profiles.json`, for its file-level `patternSwitching` block.
   *
   * Copied onto every cell's `SimulationConfig.dispatcherProfiles`, which is what lets a profile
   * opt into a weight-set selector as data and have `compare` and `tune` honour it. Optional and
   * satisfied by `LoadedConfig` for free, so a caller that hands `loadConfig()` straight in gets
   * it; a caller that assembles derived resources by hand and omits it gets what it got before,
   * and a profile of its that then asks for a selector is refused by name rather than run without
   * one. `DispatcherArmSpec.options.weightSets` still overrides it, for a study switching among a
   * *derived* library rather than the shipped one.
   */
  readonly dispatcherProfiles?: DispatcherProfiles | undefined;
}

/* -------------------------------------------------------------------------- *
 * The resolved plan
 * -------------------------------------------------------------------------- */

/** A replication policy with every default applied. */
export interface ResolvedReplicationPolicy {
  readonly minReplications: number;
  readonly maxReplications: number;
  readonly checkEvery: number;
  readonly confidence: number;
  readonly acceptableRange: number;
  readonly stoppingMetric: ReplicationMetric;
  readonly stopOnSaturation: boolean;
}

/** A parallel policy with every default applied. `workers` is still `0` for "derive it". */
export interface ResolvedParallelPolicy {
  readonly mode: ParallelMode;
  readonly workers: number;
  readonly minReplicationsForWorkers: number;
}

/**
 * Everything one replication needs except its seed and its index.
 *
 * A plain-data subset of core's `SimulationConfig`, and **structured-cloneable**: it is what
 * gets shipped to a worker thread once at spawn, after which a task message is three numbers.
 * `parallel.test.ts` pins the round trip — a clone that lost a field would silently change
 * results in the pool only.
 */
export type CellSimulationConfig = Omit<SimulationConfig, 'seed' | 'runId' | 'replication'>;

/**
 * One point of the cross product: a building, a dispatcher arm and a traffic arm.
 *
 * Cells are the unit of replication and of aggregation. They are **not** the unit of seeding:
 * two cells at replication `i` share a seed by construction, which is the entire CRN mechanism.
 */
export interface ExperimentCell {
  /** `<buildingId>|<trafficArmId>|<dispatcherArmId>`. Stable, and the plan's ordering key. */
  readonly cellId: string;
  /** Position in {@link ExperimentPlan.cells}. The worker addresses cells by this. */
  readonly index: number;
  readonly buildingId: string;
  readonly trafficArmId: string;
  /** The arm's id, which for a variant differs from {@link dispatcherProfileId}. */
  readonly dispatcherArmId: string;
  readonly dispatcherProfileId: string;
  /**
   * The CRN equivalence class. Cells sharing it are driven by byte-identical passenger traces at
   * equal replication index; cells that differ in it are not comparable pairwise.
   */
  readonly traceKey: string;
  readonly simulation: CellSimulationConfig;
}

/** Cells that share a {@link ExperimentCell.traceKey}: one paired comparison's worth of arms. */
export interface CrnCohort {
  readonly traceKey: string;
  readonly buildingId: string;
  readonly trafficArmId: string;
  /** Cell ids in plan order. */
  readonly cellIds: readonly string[];
}

/** A spec, resolved against its resources and ready to run. Pure data; no I/O has happened. */
export interface ExperimentPlan {
  readonly experimentId: string;
  /** Normalized to 64 bits, as a `bigint`. */
  readonly experimentSeed: bigint;
  readonly cells: readonly ExperimentCell[];
  readonly cohorts: readonly CrnCohort[];
  readonly policy: ResolvedReplicationPolicy;
  readonly parallel: ResolvedParallelPolicy;
  readonly keepRecords: boolean;
  readonly onReplicationError: 'throw' | 'record';
  /** Guaranteed replications: `cells.length * policy.minReplications`. Drives the auto executor. */
  readonly guaranteedReplications: number;
  readonly warnings: readonly string[];
}

/* -------------------------------------------------------------------------- *
 * One replication
 * -------------------------------------------------------------------------- */

/** A unit of work. Three numbers, because the cell payload is already in the worker. */
export interface ReplicationTask {
  readonly cellIndex: number;
  /** 0-based index within the cell. The CRN pairing key. */
  readonly replication: number;
  /** Derived from `(experimentSeed, replication)` only. */
  readonly seed: bigint;
}

/** An exception, flattened so it survives a `postMessage`. */
export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string | undefined;
  /** `true` when core raised it, which distinguishes a modelling failure from a runner bug. */
  readonly fromSimulation: boolean;
}

/**
 * What one replication produced, before the parent adds the scalar projection.
 *
 * Deliberately the same shape whichever executor ran it: the serial path and the worker path
 * call the *same* function to produce it (`replication.ts`), so there is no second
 * implementation for the two to disagree about.
 */
export type RawReplicationOutcome =
  | {
      readonly ok: true;
      readonly cellIndex: number;
      readonly replication: number;
      /** Decimal string. Invariant 5: every persisted record carries its seed. */
      readonly seed: string;
      readonly runId: string;
      readonly status: SimulationStatus;
      readonly summary: RunSummary;
      /** Present iff the plan asked for records. */
      readonly record?: RunRecord | undefined;
      readonly conservation: ConservationAudit;
      /** 64-bit FNV-1a over the passenger population. The CRN audit trail. */
      readonly traceDigest: string;
      readonly tracePassengers: number;
      readonly undeliveredCount: number;
      /**
       * `StageActivity.kioskRefusedLegs` — see {@link ReplicationRecord.kioskRefusedLegs}.
       *
       * A plain number, so the worker path carries it through `postMessage` without a codec.
       */
      readonly kioskRefusedLegs: number;
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly cellIndex: number;
      readonly replication: number;
      readonly seed: string;
      readonly error: SerializedError;
    };

/**
 * One replication, as reported.
 *
 * Carries its own seed (CLAUDE.md invariant 5), so any row of any result replays exactly:
 * `runSimulation({ ...cell.simulation, seed: BigInt(record.seed) })`.
 */
export interface ReplicationRecord {
  /** 0-based index within the cell, and the pairing key across cells in the same cohort. */
  readonly replication: number;
  /** Decimal string, matching `summary.seed` and `record.seed`. */
  readonly seed: string;
  readonly runId: string;
  readonly status: SimulationStatus;
  readonly summary: RunSummary;
  /** Every scalar in {@link ReplicationMetric}, extracted from {@link summary}. */
  readonly metrics: Readonly<Record<ReplicationMetric, number>>;
  /** `saturation.saturated`: the queue diverged. Propagates to {@link CellAggregate.saturated}. */
  readonly saturated: boolean;
  /** `false` on saturation, censoring *or* emptiness. Narrower than {@link saturated}. */
  readonly awtIsValid: boolean;
  readonly awtInvalidReason?: string | undefined;
  /** 64-bit FNV-1a over the passenger population. Equal across a cohort at equal index. */
  readonly traceDigest: string;
  readonly tracePassengers: number;
  readonly conservation: ConservationAudit;
  readonly undeliveredCount: number;
  /**
   * `StageActivity.kioskRefusedLegs`: distinct legs the **bare kiosk** refused — a destination
   * disclosed with no credential beside it, on a floor an access zone covers.
   *
   * The **one** field of `StageActivity`'s twenty that this record carries, and it is here because
   * it has a reader in the same commit (`benchmark/accessControl.ts`'s coverage column). The other
   * nineteen are deliberately not copied: DECISIONS.md § D63 (`VizRecording.legs`) is the rule —
   * a field lands *with* its first consumer, and copying the rest "while we are in there" is how a
   * contract acquires twenty fields and one reader. `capacityReassignment.ts` still reaches its
   * three counters by driving `Simulation` directly, which is the honest cost of that rule rather
   * than an oversight.
   *
   * Zero for every profile `data/dispatcher-profiles.json` ships — all twelve run at
   * `up-down-buttons` or `mobile-credential` — so a non-zero value here names a *derived* arm.
   * It is the half an unserved fraction cannot express: an unserved leg says somebody was not
   * carried, and this says the interface refused them before any car was asked.
   */
  readonly kioskRefusedLegs: number;
  /** Present iff the plan asked for records. */
  readonly record?: RunRecord | undefined;
  readonly warnings: readonly string[];
}

/** A replication that threw, retained instead of being averaged over. */
export interface ReplicationFailure {
  readonly replication: number;
  readonly seed: string;
  readonly error: SerializedError;
}

/* -------------------------------------------------------------------------- *
 * The stopping-rule port
 * -------------------------------------------------------------------------- */

/** What the rule is asked. Samples are in replication-index order. */
export interface StoppingRuleInput {
  /**
   * The target metric, one value per completed replication, **in index order**.
   *
   * Non-finite values are filtered out before the rule sees them and counted in
   * {@link StoppingEvaluation.nonFiniteSamples}: a `NaN` AWT means "nobody was served in the
   * window", which is a fact about the configuration and not a wait of zero seconds.
   */
  readonly samples: readonly number[];
  /** Target half-width in the metric's units. */
  readonly acceptableRange: number;
  readonly confidence: number;
  readonly metric: ReplicationMetric;
  /** Replications completed, including any whose metric was non-finite. */
  readonly replications: number;
}

/**
 * What the rule answers.
 *
 * Structural and **minimal on purpose**: only `stop` is required, so whatever richer verdict
 * `stats/sequentialStopping` returns satisfies it without either module importing the other.
 * The runner records the verdict verbatim; it never recomputes it.
 */
export interface StoppingVerdict {
  readonly stop: boolean;
  /** Achieved half-width, when the rule computes one. Recorded for the report. */
  readonly halfWidth?: number | undefined;
  readonly targetHalfWidth?: number | undefined;
  readonly n?: number | undefined;
  readonly mean?: number | undefined;
  readonly stdDev?: number | undefined;
  /**
   * Whatever the estimator calls its own quantile family, recorded verbatim and never re-derived.
   *
   * `'t'` from the shipped estimator, at **every** `n` — `validation/harness.ts` composes
   * `productionStoppingRule` out of `reports/statistics`'s `estimateMean`, which is Student-t at
   * `n − 1` throughout. This field used to document the family as *`'t'` for `n ≤ 25`, `'z'` past
   * it*; that crossover was deleted from the code in `89bbf37` (DECISIONS.md § D14) and from
   * docs/03 § Part 3 on 2026-07-27, and the docstring outlived both.
   *
   * It is a `string` rather than a union because the port takes *any* estimator: the runner's own
   * `docHalfWidth` test double deliberately reports `'z'` past n = 25, which is how
   * `stopping.test.ts` proves the value is recorded rather than recomputed.
   */
  readonly distribution?: string | undefined;
}

/**
 * The sequential stopping rule, as a port.
 *
 * docs/03-traffic-and-statistics.md § Part 3 specifies the arithmetic — `t[n-1, conf]` at **every**
 * `n`, no crossover, stop when `halfWidth < acceptableRange` — and it lives in
 * `stats/sequentialStopping`, not here. (That section wrote a `t` ≤ 25 / `z` above split until
 * 2026-07-27; it now names that as literature rather than as this repository's rule, and no code
 * here has implemented it since `89bbf37` — DECISIONS.md § D14.) Wire it in with a one-line
 * adaptor:
 *
 * ```ts
 * await runExperiment(spec, config, {
 *   stoppingRule: ({ samples, acceptableRange, confidence }) =>
 *     sequentialStopping(samples, { acceptableRange, confidence }),
 * });
 * ```
 *
 * With no rule injected every cell runs `maxReplications`, which is a fixed-budget experiment
 * and a perfectly valid one.
 *
 * The rule must be a **pure function of its input**. It is called once per `checkEvery`
 * replications, in index order, in the parent thread; a rule that consulted a clock or a
 * counter of its own would make the replication count irreproducible and quietly break "same
 * experimentSeed ⇒ same result".
 */
export type StoppingRule = (input: StoppingRuleInput) => StoppingVerdict | boolean;

/** Why a cell stopped replicating. */
export const STOPPING_REASONS = [
  /** The injected rule returned `stop`. */
  'rule-satisfied',
  /** `maxReplications` reached. */
  'max-replications',
  /** The queue diverged and `stopOnSaturation` is on. */
  'saturated',
  /** No rule was injected, so the budget was fixed at `maxReplications`. */
  'fixed-budget',
  /** Every replication so far failed, so there is nothing to be precise about. */
  'no-samples',
] as const;

export type StoppingReason = (typeof STOPPING_REASONS)[number];

/** One consultation of the rule, kept so a replication count can be explained after the fact. */
export interface StoppingEvaluation {
  /** Replications completed when the rule was asked. */
  readonly replications: number;
  /** Of those, how many contributed a finite value of the target metric. */
  readonly finiteSamples: number;
  readonly nonFiniteSamples: number;
  readonly verdict: StoppingVerdict;
}

/** How a cell's replication count came about. */
export interface StoppingSummary {
  readonly metric: ReplicationMetric;
  readonly minReplications: number;
  readonly maxReplications: number;
  readonly checkEvery: number;
  readonly confidence: number;
  readonly acceptableRange: number;
  readonly replicationsRun: number;
  /** `true` when the cell stopped short of {@link maxReplications}. */
  readonly stoppedEarly: boolean;
  readonly reason: StoppingReason;
  readonly evaluations: readonly StoppingEvaluation[];
}

/* -------------------------------------------------------------------------- *
 * Aggregates
 * -------------------------------------------------------------------------- */

/**
 * One metric across a cell's replications.
 *
 * {@link samples} is the load-bearing field and is kept in **replication-index order**: a
 * paired-t interval over two cells of the same CRN cohort is `samples[i] - samples[i]`, and that
 * subtraction is only meaningful because index `i` means the same passenger population on both
 * sides. An aggregate that stored only the mean would have thrown away the entire variance
 * reduction CRN bought.
 */
export interface MetricAggregate {
  readonly metric: ReplicationMetric;
  /** Every replication's value, index order, non-finite values included. */
  readonly samples: readonly number[];
  readonly finiteCount: number;
  /**
   * Replications whose value was `NaN` or infinite — an empty window, or a capacity with no
   * population to divide by. Reported rather than hidden: the size of the hole decides whether
   * the mean means anything.
   */
  readonly nonFiniteCount: number;
  /** Over the finite samples only. `undefined` when there were none. */
  readonly statistic: ReplicationStatistic | undefined;
}

/** What a cell's replications say collectively. */
export interface CellAggregate {
  /** Replications that completed. Excludes failures. */
  readonly count: number;
  readonly metrics: Readonly<Record<ReplicationMetric, MetricAggregate>>;
  /** Replications whose queue diverged. */
  readonly saturatedCount: number;
  /**
   * `saturatedCount > 0`. **Any** saturated replication saturates the cell.
   *
   * Not a majority vote: a configuration that diverges on one passenger population in fifty is
   * a configuration operating at its limit, and averaging its AWT with the runs that happened
   * to cope is exactly how a failed design gets reported as a mediocre one.
   */
  readonly saturated: boolean;
  /** Replications whose AWT survived saturation, censoring and emptiness checks. */
  readonly awtValidCount: number;
  /** Replications whose AWT did not. */
  readonly awtInvalidCount: number;
  /**
   * Whether a confidence interval may be quoted on this cell's AWT at all.
   *
   * `false` if anything saturated, if any replication's AWT was invalid, or if fewer than two
   * replications produced a finite AWT. docs/03-traffic-and-statistics.md § Part 3: "flag it and
   * suppress the AWT confidence interval."
   */
  readonly awtIsValid: boolean;
  readonly awtInvalidReason?: string | undefined;
}

/** One cell's results. */
export interface CellResult {
  readonly cellId: string;
  readonly buildingId: string;
  readonly trafficArmId: string;
  readonly dispatcherArmId: string;
  readonly dispatcherProfileId: string;
  readonly traceKey: string;
  /** Index order, always, whatever ran them. */
  readonly replications: readonly ReplicationRecord[];
  readonly failures: readonly ReplicationFailure[];
  readonly aggregate: CellAggregate;
  readonly stopping: StoppingSummary;
}

export const EXECUTOR_KINDS = ['serial', 'workers'] as const;

export type ExecutorKind = (typeof EXECUTOR_KINDS)[number];

/**
 * How the experiment was executed, and the **only** part of a result that may differ between
 * two runs of the same spec.
 *
 * Quarantined into its own object so `fingerprintExperiment()` can exclude it by construction
 * rather than by an ever-growing list of field names. It is also the only place in this package
 * that a wall clock appears; `elapsedMs` is a diagnostic and feeds no decision — the auto
 * executor chooses on *planned replication count*, so the choice itself is reproducible.
 */
export interface ExecutionReport {
  readonly executor: ExecutorKind;
  readonly workers: number;
  /** Why that executor was chosen. Human-readable; feeds nothing. */
  readonly reason: string;
  /** Rounds of `executor.run()`. One per consultation of the stopping rule, plus the first. */
  readonly batches: number;
  readonly elapsedMs: number;
}

/** A finished experiment. */
export interface ExperimentResult {
  readonly experimentId: string;
  /** Decimal string. Re-running with this value reproduces every number below. */
  readonly experimentSeed: string;
  readonly plan: ExperimentPlan;
  readonly cells: readonly CellResult[];
  readonly cohorts: readonly CrnCohort[];
  readonly replicationsRun: number;
  readonly failedReplications: number;
  /** `true` when any cell saturated. */
  readonly saturated: boolean;
  readonly warnings: readonly string[];
  /** Excluded from the fingerprint. See {@link ExecutionReport}. */
  readonly execution: ExecutionReport;
}

/* -------------------------------------------------------------------------- *
 * Run options — the injected, non-serializable half
 * -------------------------------------------------------------------------- */

/**
 * The parts of a run that are code rather than data.
 *
 * Everything reproducible lives in the {@link ExperimentSpec}; what is left here is the
 * stopping rule, a streaming hook, and overrides a caller supplies at the call site. Kept apart
 * from the spec so the spec stays JSON.
 */
export interface ExperimentRunOptions {
  /** See {@link StoppingRule}. Absent means a fixed budget of `maxReplications`. */
  readonly stoppingRule?: StoppingRule | undefined;
  /**
   * Called once per completed replication, **in index order within each batch**, after the
   * batch is assembled and before the stopping rule is consulted.
   *
   * Ordered deliberately: a hook that fired on worker-completion order would make a streamed
   * output file depend on thread scheduling. Intended for streaming records to disk with
   * `keepRecords: false`.
   */
  readonly onReplication?: ((record: ReplicationRecord, cell: ExperimentCell) => void) | undefined;
  /** Overrides {@link ExperimentSpec.parallel}. For a caller that knows its machine. */
  readonly parallel?: ParallelSpec | undefined;
  /** Overrides {@link RUNNER_DEFAULTS.keepRecords}. */
  readonly keepRecords?: boolean | undefined;
  /** Overrides {@link RUNNER_DEFAULTS.onReplicationError}. */
  readonly onReplicationError?: 'throw' | 'record' | undefined;
}
