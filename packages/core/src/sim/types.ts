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
  ResolvedBank,
  ResolvedBuilding,
  TrafficProfiles,
} from '../config/types.js';
import type { AuctionPolicyOptions } from '../dispatch/policies/types.js';
import type { ArrivalModel } from '../dispatch/predictor/types.js';
import type { DispatchPolicy } from '../dispatch/types.js';
import type { SimTime } from '../kernel/types.js';
import type { RunComparability } from '../metrics/comparability.js';
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
  /**
   * Seconds a passenger spends walking from a destination-entry panel to the car it named.
   *
   * **Zero by default, and that is the whole reason it is a knob rather than a constant.** The
   * walk is real — a lobby panel is not next to the car it picks — but a non-zero default would
   * move every destination-dispatch number by an undeclared amount and make the passenger-model
   * change indistinguishable from the walk. A study sets it explicitly and reports the
   * sensitivity.
   *
   * Charged **between `arrivedAt` and `boardedAt`**, never by moving `arrivedAt` later:
   * `PassengerRecord.arrivedAt` is the window-membership key, dispatcher-independent by
   * contract, and moving it would change which passengers fall in the report window per arm —
   * at which point a paired-t is being taken over differently-populated windows and is not a
   * paired-t. Inert under every conventional run, where nobody is assigned a car at all.
   */
  assignedWalkS: 0,
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
    id: 'sim.assignedWalkS',
    type: 'continuous',
    range: [0, 30],
    scale: 'linear',
    default: SIM_DEFAULTS.assignedWalkS,
    unit: 's',
    description:
      'Walk from a destination-entry panel to the car it named, under dispatch.passengerAssignment "panel". Counted inside waiting time and inside time to destination, never by moving the arrival instant. Deliberately a property of the lobby and NOT authorable in a dispatcher profile: a dispatcher that could tune its own walk distance could tune away its own cost, and the Pareto front would be a lie.',
    activeWhen: { 'dispatch.passengerAssignment': ['panel'] },
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
  readonly dispatcherOptions?: AuctionPolicyOptions | undefined;
  /**
   * Build this run's group controllers, one per bank, instead of `createPolicyFor`.
   *
   * **Not how a dispatcher is chosen.** Which policy runs a profile is `auction.aggregation` and
   * a frozen lookup table (`dispatch/policies/registry.ts`), so a shipped run selects its
   * aggregation as data and nothing here compares a profile id (CLAUDE.md invariant 7). This hook
   * exists for the two jobs data cannot do: instrumenting a real run — wrapping the policy to
   * count what each cost term actually evaluated to, which is the only honest way to check a term
   * is not inert through the shipped path — and injecting a policy an optimizer has not yet
   * persisted as a profile.
   *
   * The policy it returns must be deterministic and must draw no random numbers outside the
   * injected `StreamSet`, exactly as a shipped one must; a hook that broke either would break
   * every comparison made with the run.
   */
  readonly createPolicy?:
    | ((profile: DispatcherProfile, options: AuctionPolicyOptions) => DispatchPolicy)
    | undefined;
  /**
   * Build this bank's arrival model, instead of one from the profile's `idle.predictor*` values.
   *
   * The same escape hatch, for the predictor. Returning `undefined` runs the bank **with no
   * forecast at all**, which is what `parkingStrategy: predicted-demand` answers `no-forecast` to
   * and what leaves `predictedDemand` inert — the control arm for any measurement of what the
   * forecast is worth.
   *
   * A model handed in here is fed by the run loop on real arrivals and by nothing else, exactly
   * as one the run built would be. It must not be given a prior derived from the trace: see
   * `dispatch/predictor/types.ts` for why that is the one form of clairvoyance no structural
   * property of that module can detect.
   */
  readonly createPredictor?:
    | ((bank: ResolvedBank, profile: DispatcherProfile) => ArrivalModel | undefined)
    | undefined;
  /** Identity of this replication. Defaults to `<buildingId>-<dispatcherId>-<seed>`. */
  readonly runId?: string | undefined;
  /** Index of this replication within its batch, when it belongs to one. */
  readonly replication?: number | undefined;
  readonly metadata?: Readonly<Record<string, string | number | boolean>> | undefined;
  /** Extra options for the summary. The window comes from {@link reportWindow}. */
  readonly summarize?: Omit<SummarizeOptions, 'window'> | undefined;

  /* ---- the runner's own tunables; see SIM_PARAMETERS ---- */
  readonly transferWalkS?: number | undefined;
  /** Walk from a destination-entry panel to the named car. See `SIM_DEFAULTS.assignedWalkS`. */
  readonly assignedWalkS?: number | undefined;
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

  /* ---- destination dispatch; all three are 0 under the conventional passenger model ---- */

  /**
   * Promises a landing panel made.
   *
   * An **event count**, not a leg count, because {@link promisesRevoked} makes a second promise on
   * the same leg possible. `legsAssigned - promisesRevoked` is the number in force at the end, and
   * *that* equals {@link legsCreated} on any `completed` destination-dispatch run: a run that
   * delivered everybody promised everybody. It can fall short on a `timed-out` run, where a leg
   * whose call no car could ever take is still standing at the landing unpromised — which is a
   * *diagnosis*, and one the undelivered list already names, rather than a book that does not
   * balance.
   */
  readonly legsAssigned: number;
  /**
   * Boardings onto a car other than the one the panel named. **Always 0, or the run threw.**
   *
   * Not a statistic: this is the whole of the passenger-model change stated as a number, and the
   * defect it catches — a destination profile that ships, is configured, is weighted, and boards
   * people exactly as the conventional model did — is the one the contract names as the most
   * likely way this phase produces a dead seam.
   */
  readonly wrongCarBoardings: number;
  /**
   * **Broken promises**: occasions on which a car left behind somebody it had been promised to.
   *
   * An **event count, not a headcount**: one passenger bumped from three successive trips of the
   * car they were promised counts three times, because three times is what it cost them.
   *
   * A *result*, not a failure (DECISIONS.md § D29). Those passengers keep their assignment and
   * wait for the car they were told about; the alternative — re-offering them to the group — is
   * the panel silently changing its mind, which would let this arm recover the deferral advantage
   * it is supposed to have surrendered and flatter the very thing being measured. A non-zero
   * count is the price of committing at call time, which is what this simulator exists to
   * quantify.
   */
  readonly brokenPromises: number;
  /**
   * **Promises revoked**: occasions on which the group took a promise back because the car it
   * named had left group control.
   *
   * The narrow exception to {@link brokenPromises}' argument, and the two are counted separately
   * so they can never be read as one number. A *full* car will empty and come back, so waiting for
   * it is the cost of committing at the panel and D29 keeps the passenger on it. A car put on
   * `independent`, `fire-recall` or `out-of-service` will not come back unless a later schedule
   * entry says so; holding a passenger to it strands them for the rest of the run while the rest
   * of the bank stands idle, which the Phase 8 P5 property reports as a deadlock — measured, and
   * `fuzz-1000384` is the counterexample.
   *
   * `0` on every conventional run, and `0` on every run with no mid-run service change in it,
   * which is every shipped building. A non-zero count is only ever produced by
   * `BuildingConfig.serviceEvents` or a `CarConfig.mode` that a schedule later changes. See
   * `the root DECISIONS.md` § T22-D1.
   */
  readonly promisesRevoked: number;

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

/** What stage 5's load-driven trigger and the predictor actually did, for a caller that asks. */
export interface StageActivity {
  /** Arrivals fed to the arrival models, summed over banks. Zero means no predictor was built. */
  readonly predictorObservations: number;
  /** Cars observed crossing their own hall-call bypass threshold, summed over banks. */
  readonly capacityCrossings: number;
  /** Calls stage 5 moved off a car that had just filled up. */
  readonly capacityMigrations: number;
  /** Calls it looked at and left where they were, with a gate that kept them. */
  readonly capacityHeld: number;
  /**
   * Courtesy holds the run *asked for*: the doors started closing on a landing that still held
   * a passenger this car could carry, and there was room for them.
   *
   * Counted separately from the two below for the same reason `capacityCrossings` is counted
   * separately from `capacityMigrations`. A granted count of zero means both "the profile
   * declined every hold" and "nothing ever calls `requestReopen('lateArrival')`" — which is the
   * state `answer.reopenOnLateArrival` was in for its whole life — and only a request count
   * separates them.
   */
  readonly lateArrivalHoldsRequested: number;
  /** Courtesy holds the door machine honoured, reversing a closing door. */
  readonly lateArrivalHoldsGranted: number;
  /**
   * Courtesy holds refused: `answer.reopenOnLateArrival` is off, or the stop's reopen budget
   * (`answer.maxReopensPerStop`) is spent. The first is `DOOR_REOPEN_REFUSALS.policyDisabled`,
   * which was an unreachable verdict until the request site existed.
   */
  readonly lateArrivalHoldsRefused: number;
  /**
   * Passengers the *requested* holds were sized for, summed — the numbers the revised
   * `DoorStopReason.transferSeconds` was computed from.
   *
   * Paired with {@link lateArrivalHoldsBoarded}, this is what makes the dwell falsifiable: the
   * door grants `boarders x tp` for a hold, so the two counts must agree over a run in which
   * every request was granted. They did not have to before, because the door re-granted the
   * whole stop's transfer whatever this number was, and nothing compared them.
   */
  readonly lateArrivalHoldsProjected: number;
  /**
   * Passengers who actually boarded on the replayed boarding half of a granted hold, summed.
   *
   * Zero while holds are being granted is the "delay with no boarding to pay for it" case:
   * a door reversed, time was spent, and nobody got in.
   */
  readonly lateArrivalHoldsBoarded: number;
  /**
   * Dwell seconds the door granted to the open periods courtesy holds produced, summed.
   *
   * Read off `DoorMachineState.grantedDwellS` when the reversed door reaches fully open, so it
   * is what the machine actually granted rather than what this class thinks it asked for. That
   * is what makes it a check on the door instead of a restatement of the request: bound it by
   * the hold's *own* cohort — `granted x baseHallDwell + projected x tp` — and a reopen that
   * re-grants the whole stop's transfer fails, which is the defect this counter exists for.
   *
   * An obstruction reopen landing inside a held-open period is also counted here, since it
   * extends the same open period. At the shipped `sim.doorObstructionProbability` of 0 no such
   * draw is ever taken.
   */
  readonly lateArrivalHoldDwellS: number;
  /**
   * The largest dwell any single granted hold was given, and the largest cohort any single hold
   * was sized for.
   *
   * The pair the bound is actually checkable on. Run totals are too blunt: a hold's dwell is
   * `max(base hall dwell, cohort x tp)`, the base term dominates on the shipped buildings, and
   * summing hides one 40 s re-grant among two hundred 5 s holds. These two are extrema, so a
   * **single** hold given the interrupted stop's transfer instead of its own pushes
   * `lateArrivalHoldMaxDwellS` above what `lateArrivalHoldMaxCohort` can justify — and the check
   * rebuilds that bound from the fleet's own resolved door configs rather than from anything
   * recorded here. Measured with the defect in place it reached exactly `maxTransferSeconds`.
   */
  readonly lateArrivalHoldMaxDwellS: number;
  /** See {@link lateArrivalHoldMaxDwellS}. Passengers, not seconds. */
  readonly lateArrivalHoldMaxCohort: number;
}

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
  /**
   * What the stages that are easy to wire up and leave unreachable actually did.
   *
   * On the *result*, not only on the `Simulation` instance, because `runSimulation()` returns
   * the result and discards the instance — so every one of these counters was invisible to the
   * function the CLI, `packages/experiments` and every doc example call. A diagnostic only its
   * own tests can read is the shape of defect the standing requirement in `docs/05-roadmap.md`
   * is about, one level down: reachable in principle, unreachable from the shipped entry point.
   */
  readonly stageActivity: StageActivity;
  /**
   * Which passenger model this run used, and which recorded metrics that makes uncomparable.
   *
   * Empty list under every conventional and disclosure-only run. See `metrics/comparability.ts`
   * for why nine of the twenty-three change construct, and DECISIONS.md § D27 for the gate that
   * follows from it: TTD with an interval excluding zero, **and** AWT and WT95 reported with
   * explicit verdicts rather than omitted.
   */
  readonly comparability: RunComparability;
}
