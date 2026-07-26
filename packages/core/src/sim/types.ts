/**
 * The vocabulary of a run: what you hand `runSimulation`, and what it hands back.
 *
 * ## What a simulation *is*, here
 *
 * One replication. A seed, a building, a dispatcher profile and a demand template go in; a
 * seed-bearing {@link RunRecord}, its {@link RunSummary}, and a **conservation audit** come
 * out. Nothing in a result is derived from a wall clock, and nothing in it depends on the
 * order a `Map` happened to iterate — two runs from the same seed and the same config produce
 * structurally identical results (CLAUDE.md invariants 2, 3, 4 and 5).
 *
 * ## The audit is part of the contract, not a debugging aid
 *
 * A discrete-event elevator simulation has exactly one catastrophic failure mode that does not
 * announce itself: a passenger who quietly stops existing. A car that fills up and leaves
 * somebody behind, a hall call extinguished with people still on the landing, a sky-lobby
 * transfer that never re-injects — each of them *lowers* the average waiting time, because the
 * passengers it deletes are the ones who waited longest. The statistic gets better as the bug
 * gets worse.
 *
 * So every run ends by reconciling the generated trace against what the recorder saw
 * ({@link ConservationAudit}), and a run whose books do not balance throws
 * {@link SimulationError} rather than returning a plausible number. Passengers who were still
 * waiting or riding when the run ended are not lost — they are *named*, one entry per journey,
 * in {@link SimulationResult.undelivered}.
 *
 * ## Tunables are data (CLAUDE.md invariants 7 and 8)
 *
 * The runner introduces five numbers of its own — how long a sky-lobby transfer walk takes,
 * how often an unassignable call is retried, how long the drain tail may run, how many queue
 * samples to take, and how often a closing door is obstructed. All five are declared in
 * {@link SIM_PARAMETERS} with type, range, default and unit, so a Phase 7 optimizer can search
 * them without knowing what an elevator is. None of them selects behaviour by identity: there
 * is no `if (building.id === ...)` anywhere in this module.
 */

import type {
  DirectionalSplit,
  DispatcherProfile,
  ElevatorSpecs,
  ResolvedBuilding,
  TrafficProfiles,
} from '../config/types.js';
import type { DispatchPolicyOptions } from '../dispatch/types.js';
import type { SimTime } from '../kernel/types.js';
import type { SummarizeOptions, WindowSelection } from '../metrics/summarize.js';
import type { ReportWindow, RunRecord, RunSummary } from '../metrics/types.js';
import type {
  CredentialAssignment,
  DemandLevel,
  DemandTemplateId,
  InterfloorWeighting,
  PassengerTrace,
  ResolvedDemandTemplate,
} from '../traffic/types.js';

/* -------------------------------------------------------------------------- *
 * Errors
 * -------------------------------------------------------------------------- */

/**
 * A run that cannot be trusted.
 *
 * Three causes, and all are deliberately loud:
 *
 * - **The conservation audit failed.** Somebody was generated and is neither delivered nor
 *   accounted for as undelivered, or was delivered somewhere they never asked to go. That is a
 *   bug in the loop, and the only safe response is to refuse to report the run.
 * - **The event budget was exhausted** — status `aborted`. A handler was still scheduling work
 *   when the kernel's valve tripped, so the run never finished. Thrown regardless of
 *   `onTimeout`, which governs saturation and has nothing to say about a run that crashed.
 * - **The drain deadline fired** while passengers were still in the system, and
 *   `onTimeout` is `'throw'` (the default). Silently truncating a run turns a saturated
 *   configuration into a merely mediocre one.
 *
 * The partial {@link SimulationResult} is attached in every case, so a caller that wants to
 * inspect the wreckage does not have to re-run to get it.
 *
 * **Nothing else is wrapped.** An exception thrown by a handler — a `ModelError` from a car, a
 * routing failure, a plain `TypeError` from a bug — propagates out of `run()` unchanged rather
 * than being relabelled as one of the above. A bug reported as a timeout is a bug reported as a
 * measurement.
 */
export class SimulationError extends Error {
  /** The run as far as it got. Present for a timeout; present for a failed audit too. */
  readonly result: SimulationResult | undefined;

  constructor(message: string, result?: SimulationResult | undefined) {
    super(message);
    this.name = 'SimulationError';
    this.result = result;
  }
}

/* -------------------------------------------------------------------------- *
 * Defaults and the tunable schema (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

export const SIM_DEFAULTS = Object.freeze({
  /**
   * Seconds a transferring passenger spends crossing a sky lobby before re-joining a queue.
   *
   * A real transfer is a walk across a lobby floor, not teleportation, and pretending it is
   * free flatters every time-to-destination figure in a mixed-use tower — which is exactly the
   * building where TTD is the headline metric.
   */
  transferWalkS: 10,
  /**
   * Seconds before a call that no car could take is offered to the group again.
   *
   * The only path by which a temporarily unservable call — every car in the bank full — gets
   * looked at again without a car event happening to fire.
   */
  dispatchRetryS: 5,
  /**
   * Seconds past the end of demand the run may keep going, delivering whoever is left.
   *
   * The trace stops generating at `durationS`; the *system* is not empty then. This is the
   * drain tail, and it is a **hard timeout**: work scheduled past it is not scheduled at all —
   * not a departure, not a dispatch retry, not a sky-lobby transfer, and not a door transition
   * — so a saturated configuration terminates instead of running forever, and says so
   * ({@link SimulationResult.status}). Gating travel alone would not be enough: a stopped car
   * whose doors keep cycling advances the clock just as well as a moving one.
   */
  drainGraceS: 3600,
  /** Evenly spaced building-wide queue samples over the demand horizon. Feeds saturation detection. */
  queueSampleCount: 120,
  /**
   * Probability that a closing door is interrupted, per close attempt.
   *
   * Zero by default, and that is not laziness: a non-zero value draws from the
   * `doorObstruction` stream, and a default that drew would consume the stream in every run
   * whether or not the experiment wanted obstructions modelled. At zero the stream is never
   * touched, which the determinism tests assert.
   */
  doorObstructionProbability: 0,
  /** Safety valve on runaway handlers. An event count, never a wall-clock timeout (invariant 3). */
  maxEvents: 20_000_000,
} as const satisfies Record<string, number>);

/** Parameter kinds a generic optimizer understands. See docs/06-parameterization-and-tuning.md. */
export type SimParameterType = 'continuous' | 'integer' | 'categorical' | 'boolean';

/**
 * A self-describing tunable, in the same shape as `CarParameterSpec` and
 * `DispatchParameterSpec`.
 *
 * Repeated rather than imported for the reason those two give: this is the generic
 * parameter-schema shape from docs/06-parameterization-and-tuning.md, which has no home module
 * until Phase 7 lands `tuning/`. When it does, all of them move there.
 */
export interface SimParameterSpec {
  /** Dotted path of the value, e.g. `sim.transferWalkS`. */
  readonly id: string;
  readonly type: SimParameterType;
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
export const SIM_PARAMETERS: readonly SimParameterSpec[] = Object.freeze([
  {
    id: 'sim.transferWalkS',
    type: 'continuous',
    range: [0, 120],
    scale: 'linear',
    default: SIM_DEFAULTS.transferWalkS,
    unit: 's',
    description:
      'Walk across a sky lobby between two legs of one journey. Counted inside time-to-destination, never inside either leg’s waiting time.',
  },
  {
    id: 'sim.dispatchRetryS',
    type: 'continuous',
    range: [0.5, 60],
    scale: 'log',
    default: SIM_DEFAULTS.dispatchRetryS,
    unit: 's',
    description:
      'Re-offer interval for a call no car could take. Lower re-scores sooner at the cost of events; it cannot change which car wins, only when the question is asked.',
  },
  {
    id: 'sim.drainGraceS',
    type: 'continuous',
    range: [0, 86_400],
    scale: 'log',
    default: SIM_DEFAULTS.drainGraceS,
    unit: 's',
    description:
      'Hard timeout: simulated seconds past the end of demand in which the system may finish delivering. Exceeding it is reported as a failed run, never trimmed away.',
  },
  {
    id: 'sim.queueSampleCount',
    type: 'integer',
    range: [0, 10_000],
    scale: 'log',
    default: SIM_DEFAULTS.queueSampleCount,
    description:
      'Evenly spaced building-wide queue samples over the demand horizon. The direct input to saturation detection; zero falls back to the series metrics reconstructs from arrival and boarding times.',
  },
  {
    id: 'sim.doorObstructionProbability',
    type: 'continuous',
    range: [0, 1],
    scale: 'linear',
    default: SIM_DEFAULTS.doorObstructionProbability,
    description:
      'Probability that a door close is interrupted by the photo-eye, drawn per close attempt from the doorObstruction stream. Zero consumes no draws at all.',
  },
]);

/* -------------------------------------------------------------------------- *
 * Configuration
 * -------------------------------------------------------------------------- */

/**
 * Demand knobs passed straight through to `generateTrace`.
 *
 * Deliberately a subset: `building`, `profiles` and `streams` are the runner's to supply, and
 * letting a caller override them would make the trace disagree with the building being
 * simulated or with the seed in the run record.
 */
export interface SimulationDemandOptions {
  readonly demandLevel?: DemandLevel | undefined;
  /** Percent of population per 5 minutes, overriding every profile. For sweeping to saturation. */
  readonly arrivalRatePctPop5min?: number | undefined;
  /** `{ incoming: 1, outgoing: 0, interfloor: 0 }` is the pure up-peak the closed form assumes. */
  readonly directionalSplit?: DirectionalSplit | undefined;
  readonly batchSharesDestination?: boolean | undefined;
  /** Relative likelihood per entrance floor id. `{ G: 1, P1: 0 }` is the single-lobby condition. */
  readonly entranceWeights?: Readonly<Record<string, number>> | undefined;
  readonly interfloorWeighting?: InterfloorWeighting | undefined;
  readonly credentialAssignment?: CredentialAssignment | undefined;
  readonly maxLegs?: number | undefined;
  /** How long demand holds at peak, which is also the reported window. `rise-and-fall` only. */
  readonly peakWindowS?: number | undefined;
  /** Intensity at both ends as a fraction of peak. `rise-and-fall` only. */
  readonly baselineFraction?: number | undefined;
}

/** What to do when the drain deadline fires with passengers still in the system. */
export const TIMEOUT_POLICIES = ['throw', 'report'] as const;

export type TimeoutPolicy = (typeof TIMEOUT_POLICIES)[number];

/**
 * Everything one replication needs.
 *
 * Only `building`, `dispatcherProfile`, `trafficProfiles` and `seed` are required; the rest
 * default to the CIBSE rise-and-fall template over its own 30-minute horizon, reported over
 * its peak 5 minutes.
 */
export interface SimulationConfig {
  /** Floors expanded, cars resolved, cross-references checked. From `loadConfig`. */
  readonly building: ResolvedBuilding;
  /** A weight vector plus stage settings. There is no strategy argument (invariant 7). */
  readonly dispatcherProfile: DispatcherProfile;
  /** The whole of `data/traffic-profiles.json`: profiles, templates and the mass distribution. */
  readonly trafficProfiles: TrafficProfiles;
  /**
   * The whole of `data/elevator-specs.json`, for its `loadSensor` section.
   *
   * Omit it and the load cell falls back to `LOAD_SENSOR_DEFAULTS`, which is the same 0.8/1.1
   * pair; supply it so the run and the reference data cannot drift apart.
   */
  readonly elevatorSpecs?: ElevatorSpecs | undefined;
  /** Master seed. Persisted with the record, and the whole of invariant 5. */
  readonly seed: number | bigint;
  /** `rise-and-fall` (default), `constant-iso`, or an already-resolved template. */
  readonly demandTemplate?: DemandTemplateId | ResolvedDemandTemplate | undefined;
  /**
   * Length of the demand horizon, seconds. Defaults to the template's own duration.
   *
   * This is when the trace stops generating, **not** when the run stops: the run keeps going
   * until everyone generated has been delivered, or the drain deadline fires.
   */
  readonly durationS?: number | undefined;
  /**
   * Which window the summary is computed over.
   *
   * Defaults to the template's own measurement window — the peak 5 minutes for
   * `rise-and-fall`. `'full-run'` and `'peak-5min'` are the two derived selections; an explicit
   * {@link ReportWindow} overrides both.
   */
  readonly reportWindow?: WindowSelection | undefined;
  readonly demand?: SimulationDemandOptions | undefined;
  /** Weight/constraint overrides applied after the profile. For a fixture or an optimizer. */
  readonly dispatcherOptions?: DispatchPolicyOptions | undefined;
  /** Identity of this replication. Defaults to `<buildingId>-<dispatcherId>-<seed>`. */
  readonly runId?: string | undefined;
  /** Index of this replication within its batch, when it belongs to one. */
  readonly replication?: number | undefined;
  readonly metadata?: Readonly<Record<string, string | number | boolean>> | undefined;
  /** Extra options for the summary. The window comes from {@link reportWindow}. */
  readonly summarize?: Omit<SummarizeOptions, 'window'> | undefined;

  /* ---- the runner's own tunables; see SIM_PARAMETERS ---- */
  readonly transferWalkS?: number | undefined;
  readonly dispatchRetryS?: number | undefined;
  readonly drainGraceS?: number | undefined;
  readonly queueSampleCount?: number | undefined;
  readonly doorObstructionProbability?: number | undefined;
  readonly maxEvents?: number | undefined;
  /** `throw` (default) or `report`. See {@link SimulationError}. */
  readonly onTimeout?: TimeoutPolicy | undefined;
}

/* -------------------------------------------------------------------------- *
 * Results
 * -------------------------------------------------------------------------- */

/** Why a journey did not reach its final destination. */
export const UNDELIVERED_REASONS = [
  /** Standing at a landing when the run ended. */
  'waiting',
  /** Aboard a car when the run ended. */
  'riding',
  /** Alighted at a sky lobby; the next leg had not started when the run ended. */
  'transferring',
] as const;

export type UndeliveredReason = (typeof UNDELIVERED_REASONS)[number];

/**
 * One journey that did not finish, named rather than dropped.
 *
 * This is the "explicitly accounted for" half of "every passenger either reaches its
 * destination or is explicitly accounted for". A non-empty list is a legitimate outcome of a
 * saturated configuration; a *missing* passenger never is, and is an audit failure.
 */
export interface UndeliveredJourney {
  readonly journeyId: string;
  /** The leg they were on when the run ended. */
  readonly legId: string;
  readonly legIndex: number;
  readonly reason: UndeliveredReason;
  /** Where the leg they were on started. */
  readonly originFloorId: string;
  /** Where that leg was going — a sky lobby, on a journey that transfers. */
  readonly destinationFloorId: string;
  readonly finalDestinationFloorId: string;
  /** When the whole journey began. */
  readonly journeyStartedAt: SimTime;
  /** When the current leg's wait began. */
  readonly arrivedAt: SimTime;
  readonly boardedAt: SimTime | undefined;
  readonly carId: string | undefined;
}

/**
 * The books, balanced.
 *
 * `generated === delivered + undelivered` is checked at the end of every run and is the
 * property the whole module exists to protect. `legsCreated === legsRecorded` catches the
 * subtler cousin: a leg that was materialized but never handed to the recorder would be
 * invisible to every statistic while still looking delivered here.
 */
export interface ConservationAudit {
  /** Journeys the trace generated. */
  readonly generated: number;
  /** Journeys that reached their declared final destination. */
  readonly delivered: number;
  /** Journeys still in the system when the run ended. Named in {@link SimulationResult.undelivered}. */
  readonly undelivered: number;
  /** Passenger objects created, one per leg. `generated` plus one per completed transfer. */
  readonly legsCreated: number;
  /** Legs the recorder saw arrive. Must equal {@link legsCreated}. */
  readonly legsRecorded: number;
  /** Legs that boarded a car. */
  readonly legsBoarded: number;
  /** Legs that completed. */
  readonly legsAlighted: number;
  /** Sky-lobby transfers performed. */
  readonly transfers: number;
  /** `generated === delivered + undelivered && legsCreated === legsRecorded`. */
  readonly balanced: boolean;
}

/**
 * How a run ended. Three outcomes, and the third is not a variety of the second.
 *
 * - `completed` — the queue emptied and every generated journey reached its destination.
 * - `timed-out` — the run stopped with passengers still in the system. A statement about the
 *   **configuration**: demand the group could not clear inside its drain tail, or landings no
 *   car would answer. A legitimate measurement, and the thing a saturation sweep is looking
 *   for; {@link SimulationResult.undelivered} names everybody it did not deliver.
 * - `aborted` — the event budget was exhausted with the queue still non-empty. A statement
 *   about the **simulator**: a handler was still producing work, so the run never finished and
 *   its statistics describe a simulation that stopped in the middle. Distinct from `timed-out`
 *   precisely so that a batch which tolerates saturation does not fold a crashed replication's
 *   AWT into a mean. Always thrown, whatever `onTimeout` says.
 */
export const SIMULATION_STATUSES = ['completed', 'timed-out', 'aborted'] as const;

export type SimulationStatus = (typeof SIMULATION_STATUSES)[number];

/**
 * One replication, complete.
 *
 * {@link record} is the persistable, seed-bearing dataset; {@link summary} is a pure function
 * of it and can be recomputed over a different window without re-simulating. Both come
 * straight from `metrics/`.
 */
export interface SimulationResult {
  readonly status: SimulationStatus;
  readonly runId: string;
  /** Master seed as a decimal string, matching `record.seed`. */
  readonly seed: string;
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  /** The trace this run was driven by. Replayable from {@link seed} alone. */
  readonly trace: PassengerTrace;
  readonly record: RunRecord;
  readonly summary: RunSummary;
  /** The window {@link summary} was computed over. */
  readonly reportWindow: ReportWindow;
  readonly conservation: ConservationAudit;
  /** One entry per journey still in the system at the end. Empty for a `completed` run. */
  readonly undelivered: readonly UndeliveredJourney[];
  /** When demand stopped being generated. */
  readonly demandEndedAt: SimTime;
  /** When the run stopped. Equal to `record.endedAt`. */
  readonly endedAt: SimTime;
  /** The hard deadline this run was given. */
  readonly deadlineS: SimTime;
  /** Kernel events fired. Diagnostic. */
  readonly events: number;
  /** Non-fatal diagnostics from the trace generator, plus any the run itself raised. */
  readonly warnings: readonly string[];
}
