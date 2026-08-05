/**
 * Configuration types for the JSON reference data in `data/`.
 *
 * These are hand-written so each field can carry documentation; `schema.ts` mirrors them
 * with zod and asserts at compile time that the inferred shapes conform. If you change a
 * type here, change the schema there — the assertions will fail the build otherwise.
 *
 * Conventions (see CLAUDE.md):
 * - Units are SI. A field carrying a non-SI value keeps the unit in its name
 *   (`ratedLoadLb`, `minSpeedFpm`, `riseFtRange`). Nothing is silently converted.
 * - Optional fields are declared `?: T | undefined` to match zod's inferred output under
 *   `exactOptionalPropertyTypes`.
 * - Arrays are `readonly`. Config is data the simulation reads, never mutates.
 */

/** Every human-authored object may carry a `$comment`; JSON has no comment syntax. */
export interface Commented {
  readonly $comment?: string | undefined;
}

/** A reference range with a recommended value. All three numbers share one unit. */
export interface ValueRange {
  readonly min: number;
  readonly max: number;
  readonly typical: number;
}

/** A reference value with a ceiling but no floor (`acceleration`, `jerk`). */
export interface TypicalMax {
  readonly typical: number;
  readonly max: number;
}

// ---------------------------------------------------------------------------
// data/elevator-specs.json
// ---------------------------------------------------------------------------

/**
 * The operating mode of a car. Car-owned state, per docs/01-architecture.md: degraded modes
 * are natural as a per-car state machine and miserable as central flags.
 *
 * - `in-service` — normal automatic operation; answers hall calls and car calls.
 * - `independent` — attendant/independent service. Removed from group control: it answers
 *   car calls pressed inside the car only, and the dispatcher must not allocate hall calls
 *   to it.
 * - `fire-recall` — Phase I emergency recall. The car returns to its designated level and
 *   parks with doors open; it provides no passenger service. (Phase II firefighter
 *   operation is a distinct mode and is out of scope for Phase 1 — it would be a new member
 *   of this union, not a reinterpretation of this one.)
 * - `out-of-service` — parked, maintenance, or failed. Provides nothing.
 *
 * **Declared here rather than in `model/types.ts`**, which is where it used to live and which
 * still re-exports it, because it is now an *authored* vocabulary: `CarConfig.mode` and
 * `ServiceEventConfig.mode` both hold one, so `config/schema.ts` needs the values at run time to
 * build its `z.enum`. Every other closed set that appears in `data/` is declared here for the
 * same reason — `DOOR_TYPES`, `CALL_TYPES`, `PARKING_STRATEGIES`, `AGGREGATIONS` — and every
 * runtime module reads them from here rather than the other way round. Moving it keeps `config/`
 * a closed module graph, which `config/parse.test.ts` pins.
 */
export const SERVICE_MODES = ['in-service', 'independent', 'fire-recall', 'out-of-service'] as const;

/** The operating mode of a car. See {@link SERVICE_MODES}. */
export type ServiceMode = (typeof SERVICE_MODES)[number];

/**
 * Door types are a closed set because this module resolves a car's `doorType` against
 * `elevator-specs.json → doors`. Adding a type means adding its timings to that file and
 * its name here.
 */
export const DOOR_TYPES = ['centerOpening', 'sideOpening'] as const;
export type DoorType = (typeof DOOR_TYPES)[number];

/** Open and close durations for one door type, seconds. */
export interface DoorTiming {
  readonly openS: number;
  readonly closeS: number;
}

/** Door timings plus the dwell reference values shared by every door type. */
export interface DoorTimings {
  readonly centerOpening: DoorTiming;
  readonly sideOpening: DoorTiming;
  /** Dwell after a car call is answered, seconds. */
  readonly dwellCarCallS: ValueRange;
  /** Dwell after a hall call is answered, seconds. Longer: passengers walk to the car. */
  readonly dwellHallCallS: ValueRange;
}

/** One elevator class: the hardware envelope a car is built from. */
export interface ElevatorSpec extends Commented {
  readonly id: string;
  readonly name: string;
  /** Rated (top) speed envelope, m/s. */
  readonly ratedSpeedMps: ValueRange;
  /** Maximum travel this class is applied to, metres. Advisory reference data. */
  readonly maxRiseM: number;
  /** Maximum floors served this class is applied to. Advisory reference data. */
  readonly maxFloors: number;
  /** m/s^2. */
  readonly acceleration: TypicalMax;
  /** m/s^3. */
  readonly jerk: TypicalMax;
  /** Inclusive `[lowLb, highLb]` rated-load envelope. Imperial: unit is in the name. */
  readonly capacityLbRange: readonly [number, number];
  readonly application: string;
  /** Persons per deck `[low, high]`, double-deck classes only. */
  readonly doubleDeckPersonsPerDeck?: readonly [number, number] | undefined;
}

/** Traffic-analysis conventions that turn rated load into persons. */
export interface ElevatorConventions extends Commented {
  /** Expression of the form `ratedLoadLb / <divisor>`; the divisor is the tunable. */
  readonly personsPerRatedLoadUS: string;
  /** Expression of the form `ratedLoadKg / <divisor>`. */
  readonly personsPerRatedLoadEN81: string;
  /**
   * Fraction of rated capacity a car actually fills to, 0..1. Universally 0.8 in traffic
   * analysis; 1.0 makes the simulator systematically optimistic.
   */
  readonly designLoadFactor: number;
}

/** Code-mandated minimum speed by building rise. Imperial units kept in the names. */
export interface CodeMinimumSpeed {
  /** `[fromFt, toFt]`; `toFt` is `null` for the open-ended top band. */
  readonly riseFtRange: readonly [number, number | null];
  readonly minSpeedFpm: number;
  readonly minSpeedMps: number;
}

/** A standard car size. `ratedLoadKg` is the nominal metric size, not a conversion. */
export interface CapacityEntry {
  readonly ratedLoadLb: number;
  readonly ratedLoadKg: number;
  readonly personsUS: number;
  readonly use: string;
}

/** Per-passenger transfer time by building type, seconds per passenger per direction. */
export interface PassengerTransferTimes extends Commented {
  readonly office: number;
  readonly residential: number;
  readonly hotel: number;
  /**
   * The longest of the four, and the only one whose population is not all ambulant.
   *
   * A hospital car carries visitors, staff and attended trolleys, and a trolley with a drip stand
   * is not a person stepping in. This is the **building-type default**; a building whose banks
   * carry different traffic overrides it per car, which `st-jude-hospital`'s bed bank does.
   */
  readonly hospital: number;
}

/** Fixed time costs that are not part of the motion profile. */
export interface ElevatorTiming extends Commented {
  /** Delay between the start command and motion, seconds. */
  readonly motorStartDelayS: number;
  /** Levelling and settling at the end of a run, seconds. */
  readonly levelingSettleS: ValueRange;
  readonly passengerTransferS: PassengerTransferTimes;
}

/** Load-sensor thresholds as fractions of rated load. */
export interface LoadSensorConfig extends Commented {
  /** At or above this the car stops answering new hall calls. */
  readonly hallCallBypassThreshold: number;
  /** At or above this the doors are held and the car will not start. */
  readonly overloadAlarmThreshold: number;
}

/** A real installation, kept for sanity-checking the speed envelope. */
export interface RealWorldAnchor extends Commented {
  readonly building: string;
  readonly speedMps: number;
  readonly note?: string | undefined;
}

/** The whole of `data/elevator-specs.json`. */
export interface ElevatorSpecs extends Commented {
  readonly version: number;
  /** Documentation of the unit each quantity is expressed in. */
  readonly units: Readonly<Record<string, string>>;
  readonly conventions: ElevatorConventions;
  readonly classes: readonly ElevatorSpec[];
  readonly codeMinimumSpeedByRise: readonly CodeMinimumSpeed[];
  readonly capacities: readonly CapacityEntry[];
  readonly doors: DoorTimings;
  readonly timing: ElevatorTiming;
  readonly loadSensor: LoadSensorConfig;
  readonly realWorldAnchors: readonly RealWorldAnchor[];
}

// ---------------------------------------------------------------------------
// data/traffic-profiles.json
// ---------------------------------------------------------------------------

/** How arrivals are generated. The sampler validates that it can honour `type`. */
export interface ArrivalProcessConfig extends Commented {
  readonly type: string;
}

/** Fractions of demand by direction. Must sum to 1. */
export interface DirectionalSplit {
  /** Entrance floor to upper floors. */
  readonly incoming: number;
  /** Upper floors to an entrance floor. */
  readonly outgoing: number;
  /** Upper floor to upper floor. */
  readonly interfloor: number;
}

/** One demand profile, keyed to a building type. */
export interface TrafficProfile extends Commented {
  readonly id: string;
  readonly name: string;
  /**
   * Player-facing copy for the pattern picker — the **only** authored prose in this file a
   * rendered surface may read.
   *
   * Required and bounded (`schema.ts` caps it at 160 characters), because the alternative was
   * already the defect: the picker used to fall back to `$comment`, the same route
   * `DECISIONS.md` § D186 closed for dispatcher cards, where one authored paragraph of
   * maintainer documentation — seeds, intervals, replication counts — rendered verbatim on a
   * driven surface. `$comment` stays maintainer documentation; this field is the copy.
   */
  readonly blurb: string;
  /** The peak this profile is sized against, e.g. `up-peak`, `down-peak-am`. */
  readonly governingPeak: string;
  /** Arrival rate as a percentage of building population per 5 minutes. */
  readonly arrivalRatePctPop5min: ValueRange;
  /** Design target: mean interval between car departures from the lobby, seconds. */
  readonly targetIntervalS: number;
  /** Design target: average waiting time, seconds. */
  readonly targetAvgWaitS: number;
  readonly batchSize: BatchSizeConfig;
  readonly directionalSplit: DirectionalSplit;
}

/**
 * A profile's group-size curve: passengers arrive in groups, and batch size materially changes
 * loading and stop patterns. docs/14 § 2.2.
 *
 * `mean` is present for every family. For `explicit` it is **derived from {@link weights} and
 * validated against them** rather than free — `schema.ts` refuses a profile whose stated mean
 * differs from the one its own vector implies — because the batch rate is `passengerRate / mean`
 * and a mean that drifted from its weights would change how many people the building generates
 * while changing no group.
 */
export interface BatchSizeConfig extends Commented {
  readonly distribution: string;
  readonly mean: number;
  /** Relative likelihood of group sizes `1..n`. `explicit` only; normalized when sampled. */
  readonly weights?: readonly number[] | undefined;
}

/** A demand shape over a run: how long, and which window is reported. */
export interface DemandTemplate extends Commented {
  readonly id: string;
  readonly name: string;
  /** Whether this template supports confidence intervals across replications. */
  readonly recommended: boolean;
  readonly durationMin: number;
  readonly reportWindow?: string | undefined;
  readonly shape?: string | undefined;
  /** Warm-up to discard, minutes. */
  readonly discardFirstMin?: number | undefined;
  /** Cool-down to discard, minutes. */
  readonly discardLastMin?: number | undefined;
  /**
   * Directional mix at the **start** of the period, for a template whose mix varies within a run.
   *
   * Absent on both of the templates that shipped before `lunch-two-way`, and absent is not the
   * same as flat: a record carrying neither endpoint declares no mix of its own and every floor
   * keeps its traffic profile's split, which is what every published figure in this repository was
   * measured under. Declared together with {@link directionalSplitAtEnd} or not at all.
   */
  readonly directionalSplitAtStart?: DirectionalSplit | undefined;
  /** Directional mix at the **end** of the period. See {@link directionalSplitAtStart}. */
  readonly directionalSplitAtEnd?: DirectionalSplit | undefined;
  /**
   * Minutes after local midnight at which this template's run **begins**, `[0, 1440)`.
   *
   * Human units with the unit in the identifier, matching {@link durationMin}; the runtime view
   * converts to `ResolvedDemandTemplate.startOfDayS`.
   *
   * **Absent means the template has no hour, and that is a statement rather than a gap.** ISO
   * 8100-32's constant demand is a steady rate held for two hours to cross-check an analytical
   * baseline — it is not a time of day, and giving it one would invent a clock no source supports.
   * Omitted rather than `null`, following the omitted-not-undefined discipline the mix endpoints
   * above already keep.
   *
   * **Nothing in the simulation reads it.** `intensityAt`, `splitAt` and `integratedIntensityS`
   * never see it, so a template's arrivals, batches, routes and metrics are exactly what they were
   * before the field existed — `traffic/dayStartIdentity.test.ts` holds every shipped template to
   * that byte for byte. It is carried so a *presentation* layer can put a clock on the run; see
   * `DECISIONS.md` § D244 for why it is deliberately not a tunable.
   *
   * The authored values are **derived by placing each template's hold**, not its start, and each
   * one's citation status is in that template's own `$comment` in `data/traffic-profiles.json`.
   */
  readonly startOfDayMin?: number | undefined;
}

/** Body-mass distribution. Must be a distribution: the load sensor measures it. */
export interface PassengerMassConfig extends Commented {
  readonly distribution: string;
  readonly meanKg: number;
  readonly stdDevKg: number;
  readonly minKg: number;
  readonly maxKg?: number | undefined;
}

/** The whole of `data/traffic-profiles.json`. */
export interface TrafficProfiles extends Commented {
  readonly version: number;
  readonly arrivalProcess: ArrivalProcessConfig;
  readonly profiles: readonly TrafficProfile[];
  readonly demandTemplates: readonly DemandTemplate[];
  readonly passengerMass: PassengerMassConfig;
}

// ---------------------------------------------------------------------------
// data/dispatcher-profiles.json
// ---------------------------------------------------------------------------

/**
 * One term in the weighted cost function. The library is data: a dispatcher is a weight
 * vector over these ids, never a class (CLAUDE.md invariant 7).
 */
export interface CostTerm extends Commented {
  readonly id: string;
  /** What the term measures. */
  readonly measures: string;
  /** The metric the term serves, e.g. `AWT`, `WT95`. */
  readonly serves: string;
}

export const ASSIGNMENT_TIMINGS = ['immediate', 'deferred'] as const;
export type AssignmentTiming = (typeof ASSIGNMENT_TIMINGS)[number];

export const ASSIGNMENT_MODES = ['single-car', 'split-demand'] as const;
export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number];

export const REASSIGNMENT_POLICIES = ['never', 'until-commitment', 'continuous'] as const;
export type ReassignmentPolicy = (typeof REASSIGNMENT_POLICIES)[number];

export const COMMITMENT_POINTS = ['on-assignment', 'on-deceleration', 'on-door-open'] as const;
export type CommitmentPoint = (typeof COMMITMENT_POINTS)[number];

export const CALL_TYPES = ['up-down-buttons', 'destination-entry', 'mobile-credential'] as const;
export type CallType = (typeof CALL_TYPES)[number];

/** Whether a destination call type also names the car (`CALL_TYPES` decides what is *known*). */
export const DESTINATION_CALL_TYPES: readonly CallType[] = Object.freeze([
  'destination-entry',
  'mobile-credential',
]);

/** Whether the destination call type is one that carries the destination at call time. */
export function isDestinationCallType(callType: CallType): boolean {
  return DESTINATION_CALL_TYPES.includes(callType);
}

/**
 * **The Level-0 / Level-1 switch** — whether the landing panel names a car for each passenger.
 *
 * `callType` decides what the *dispatcher* knows; this decides what the *passenger* is told,
 * and they are genuinely different systems (docs/09-destination-dispatch-contract.md § 1.1):
 *
 * | Value | The landing | The passenger |
 * |---|---|---|
 * | `none` | one up/down button per direction | boards any car that opens and can carry them |
 * | `panel` | one request per origin-destination pair | boards **only** the car the panel named |
 *
 * `none` is the default and reproduces the conventional passenger model bit for bit, so a
 * profile that merely discloses the destination (`callType: destination-entry`, the Phase 6a
 * arm) is untouched by this parameter existing. Turning it on is the passenger-model change,
 * which is why it is a declared categorical the search space can see rather than an implicit
 * consequence of `callType` — a run of the two is not comparable on nine of the twenty-three
 * replication metrics, and a switch nobody declared could not be told from a dispatcher gain.
 */
export const PASSENGER_ASSIGNMENT_MODES = ['none', 'panel'] as const;
export type PassengerAssignmentMode = (typeof PASSENGER_ASSIGNMENT_MODES)[number];

export const DWELL_POLICIES = ['fixed', 'adaptive'] as const;
export type DwellPolicy = (typeof DWELL_POLICIES)[number];

export const PARKING_STRATEGIES = ['stay', 'lobby', 'zone-center', 'predicted-demand'] as const;
export type ParkingStrategy = (typeof PARKING_STRATEGIES)[number];

/**
 * **Whether the weight vector may change during a run, and by what rule** (lifecycle stage 3).
 *
 * `off` is the default and the state of every profile in `data/dispatcher-profiles.json`: one
 * weight vector for the run, which is what every published number in this repository was
 * measured under. `fuzzy` is a trapezoidal traffic-pattern detector with hysteresis driving the
 * per-pattern weight sets `patternSwitching` authors; `contextual` is the same arms under a
 * small learned reparameterization. `dispatch/selector.ts` implements both and neither is a
 * class — the rule is a categorical value and the arms are data (CLAUDE.md invariant 7).
 *
 * Here rather than in `dispatch/` for the reason {@link SERVICE_MODES} gives: `config/` is a
 * closed module graph and every declared vocabulary a schema validates lives in it.
 */
export const WEIGHT_SET_POLICIES = ['off', 'fuzzy', 'contextual'] as const;
export type WeightSetPolicy = (typeof WEIGHT_SET_POLICIES)[number];

/**
 * **Who** aggregates the prices the one cost engine produces (lifecycle stage 4).
 *
 * Not *what* a car is worth — that is `engine`, there is one of them, and both values below
 * compute it identically through the same term library and the same `Car.estimateCost()`.
 * docs/01-architecture.md § *The resolution: auction dispatch is a policy, not an architecture*
 * is explicit that contract-net bidding differs from central control in the aggregation alone,
 * so this is the field that selects it and `engine` is left meaning the cost function.
 *
 * | Value | Aggregation |
 * |---|---|
 * | `central-argmin` | the group controller minimises over every eligible car's price |
 * | `contract-net` | each car bids and may take its bid back; see `auction.rounds` |
 *
 * A **declarative selector**, and it has to be: a policy chosen by `if (profile.id === …)`
 * would be CLAUDE.md invariant 7's exact failure. `dispatch/policies/registry.ts` is a frozen
 * record keyed by this value, so adding an aggregation is a row in a table and selecting one is
 * a lookup.
 */
export const AGGREGATIONS = ['central-argmin', 'contract-net'] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

/** Call registration, assignment and reassignment knobs (lifecycle stages 1, 4, 5). */
export interface DispatchStageConfig extends Commented {
  /** Determines whether the destination is known at call time. */
  readonly callType?: CallType | undefined;
  /**
   * Whether the landing panel names a car for each passenger (destination *dispatch*), or the
   * landing keeps its up/down button (destination *disclosure*). Only meaningful under a
   * destination `callType`. See {@link PASSENGER_ASSIGNMENT_MODES}.
   */
  readonly passengerAssignment?: PassengerAssignmentMode | undefined;
  /** Group near-simultaneous calls at one floor before scoring, seconds. */
  readonly batchWindowS?: number | undefined;
  readonly assignmentTiming?: AssignmentTiming | undefined;
  /** Only meaningful when `assignmentTiming` is `deferred`. */
  readonly deferWindowS?: number | undefined;
  readonly assignmentMode?: AssignmentMode | undefined;
  /** Waiting count above which demand at one floor is split across cars. */
  readonly splitThresholdPassengers?: number | undefined;
  readonly reassignmentPolicy?: ReassignmentPolicy | undefined;
  /** When an assignment becomes irrevocable. */
  readonly commitmentPoint?: CommitmentPoint | undefined;
  /** Minimum improvement required to switch cars; prevents thrashing, seconds. */
  readonly reassignmentHysteresisS?: number | undefined;
  /** Starvation guard. */
  readonly maxReassignmentsPerCall?: number | undefined;
}

/**
 * Hard constraints on which cars may serve a call at all (lifecycle stage 2).
 *
 * Not costs: a car either can serve the call or cannot. Service zoning, access zoning and
 * `carMode` are the other three stage-2 inputs and are deliberately **not** here — they are
 * building fabric and car state, not tunables.
 *
 * Named `Profile…` rather than `EligibilityStageConfig` because `dispatch/types.ts` already
 * exports that name for the same two fields as the *policy* reads them, and the package barrel
 * exports both modules. This is the authoring shape; that one is the resolver's input.
 */
export interface ProfileEligibilityConfig extends Commented {
  /** Whether a car may take a call it will arrive at facing the wrong way. */
  readonly allowOppositeDirectionPickup?: boolean | undefined;
  readonly enRouteDiversion?: boolean | undefined;
  /** Refuse assignment when the projected load on arrival would exceed this fraction. */
  readonly maxLoadFactorForAssignment?: number | undefined;
}

/**
 * The half-cost points of this dispatcher's normalization maps.
 *
 * Per-profile, and distinct from {@link DispatcherProfiles.normalization}, which only says
 * whether normalization is required at all. A single-term profile is invariant to its own
 * reference; these bite when two terms trade.
 */
export interface ProfileNormalizationConfig extends Commented {
  /** Wait, in seconds, that normalizes to 0.5. */
  readonly waitTimeS?: number | undefined;
  /** Added travel, in metres, that normalizes to 0.5. */
  readonly distanceM?: number | undefined;
}

/** The stop decision and what happens at the floor (lifecycle stage 6). */
export interface AnswerStageConfig extends Commented {
  /** Load fraction at which the car stops taking new hall calls. */
  readonly bypassLoadThreshold?: number | undefined;
  /** Load fraction at which doors are held and the car will not start. */
  readonly overloadThreshold?: number | undefined;
  /** Starvation guard: never bypass a floor no other car can serve. */
  readonly allowBypassIfSoleEligibleCar?: boolean | undefined;
  readonly dwellPolicy?: DwellPolicy | undefined;
  /** How strongly dwell extends with hall queue length. */
  readonly dwellAdaptationGain?: number | undefined;
  /** Models the door-hold button and photo-eye. */
  readonly reopenOnLateArrival?: boolean | undefined;
  /** Ceiling on adaptive dwell, seconds. */
  readonly maxDwellS?: number | undefined;
  /** Reopens honoured at one stop before the doors close regardless. Declared by `DOOR_PARAMETERS`. */
  readonly maxReopensPerStop?: number | undefined;
  /** Ceiling on the transfer-driven part of a stop, seconds. Declared by `DOOR_PARAMETERS`. */
  readonly maxTransferSeconds?: number | undefined;
}

/** Where cars go when idle (lifecycle stage 7). Dominates sparse-traffic buildings. */
export interface IdleStageConfig extends Commented {
  readonly parkingStrategy?: ParkingStrategy | undefined;
  /** Do not reposition for anticipated gains smaller than this, seconds. */
  readonly repositionThresholdS?: number | undefined;
  /** Trades anticipated wait saving against energy spent moving. */
  readonly repositionEnergyWeight?: number | undefined;
  /** How far ahead the demand forecast looks, seconds. */
  readonly predictorHorizonS?: number | undefined;
  /**
   * Adaptation speed of the per-floor arrival model, `(0, 1]`.
   *
   * Strictly positive: a learning rate of zero is a model that can never learn, and
   * `createArrivalModel` refuses one. The schema used to accept `0` and the model then threw at
   * construction — a value that loads clean and cannot run.
   */
  readonly predictorLearningRate?: number | undefined;
  /** Width of one time-of-day bucket in the arrival model, seconds. */
  readonly predictorBucketWidthS?: number | undefined;
  /** Period over which the arrival model's time-of-day pattern repeats, seconds. */
  readonly predictorCycleS?: number | undefined;
  /** Prior arrival rate per (floor, direction) before any arrival is seen, arrivals per second. */
  readonly predictorPriorRatePerS?: number | undefined;
  /** Strength of that prior, in pseudo-observations of a completed bucket. */
  readonly predictorPriorStrength?: number | undefined;
}

/**
 * Which aggregation runs stage 4, and the two knobs the decentralized one adds.
 *
 * Authored as `profiles[].auction` in `data/dispatcher-profiles.json`. Absent, a profile is the
 * centralized argmin — the control arm — so a run that configures nothing cannot silently get a
 * contract net.
 *
 * The resolved shape and every default live in `dispatch/policies/`; this is only what a profile
 * may write. See {@link Aggregation}.
 */
export interface AuctionStageConfig extends Commented {
  /** Who aggregates the bids. Defaults to `central-argmin`. */
  readonly aggregation?: Aggregation | undefined;
  /**
   * Maximum bidding rounds; one more than the number of withdrawals the auction may take.
   *
   * `1` is a sealed-bid single-round auction and is provably the centralized argmin. Inert under
   * `aggregation: central-argmin`, which holds no auction at all.
   */
  readonly rounds?: number | undefined;
  /** A bidder's own ceiling on the delay it will impose on its committed passengers, seconds. */
  readonly reserveMarginalDelayS?: number | undefined;
}

/** A dispatcher: a weight vector over the cost-term library plus stage settings. */
export interface DispatcherProfile extends Commented {
  readonly id: string;
  readonly name: string;
  /** e.g. `baseline`. Free-form; used for reporting, not behaviour. */
  readonly role?: string | undefined;
  readonly engine?: string | undefined;
  /** Term id to weight. Every key must be an id in the `terms` library. */
  readonly weights: Readonly<Record<string, number>>;
  /** Non-negotiable rules the scorer applies before weighting. */
  readonly hardConstraints?: readonly string[] | undefined;
  /** This dispatcher's normalization references. Absent uses `NORMALIZATION_DEFAULTS`. */
  readonly normalization?: ProfileNormalizationConfig | undefined;
  readonly dispatch?: DispatchStageConfig | undefined;
  /** Stage 2's hard filters. */
  readonly eligibility?: ProfileEligibilityConfig | undefined;
  readonly answer?: AnswerStageConfig | undefined;
  readonly idle?: IdleStageConfig | undefined;
  /** Stage 4's aggregation. Absent is the centralized argmin. */
  readonly auction?: AuctionStageConfig | undefined;
  /**
   * Stage 3's weight-set selection. Absent is `policy: 'off'` — one weight vector for the run,
   * which is what every profile in `data/dispatcher-profiles.json` ships.
   */
  readonly selection?: SelectionStageConfig | undefined;
}

/**
 * Stage 3's weight-set selection, as a profile authors it.
 *
 * Six scalars and no map: the arms are {@link PatternSwitchingConfig}, file-level, for the same
 * reason the cost-term library is. `dispatch/parameters.ts` declares every field here with a
 * type, a range, a default and an `activeWhen` (CLAUDE.md invariant 8).
 */
export interface SelectionStageConfig extends Commented {
  readonly policy?: WeightSetPolicy | undefined;
  readonly hysteresisS?: number | undefined;
  readonly observationWindowS?: number | undefined;
  readonly lobbyArrivalRateGain?: number | undefined;
  readonly interfloorRateGain?: number | undefined;
  readonly downPeakRateGain?: number | undefined;
  readonly switchMargin?: number | undefined;
}

/** Fuzzy traffic-pattern detector. Hysteresis prevents detector oscillation. */
export interface PatternDetectorConfig extends Commented {
  readonly type: string;
  readonly inputs: readonly string[];
  readonly patterns: readonly string[];
  readonly hysteresisS: number;
  /**
   * Pattern id to input id to the membership ramp `[zeroAt, oneAt]`, in the input's own raw
   * units — passengers per second per car.
   *
   * One form, both directions: `[0.05, 0.20]` rises and `[0.20, 0.05]` falls. A pattern's
   * membership is the **weakest** of its clauses (fuzzy AND), so two clauses express *"lobby
   * high and down low"* without a second shape in the schema.
   *
   * Optional here and required by `dispatch/selector.ts` for every declared pattern: this file
   * may legitimately be read for its profile library alone, but a *selector* built over a
   * pattern with no clause has a constant membership and can neither enter nor leave that
   * pattern on evidence.
   */
  readonly membership?:
    | Readonly<Record<string, Readonly<Record<string, readonly [number, number]>>>>
    | undefined;
}

/** Per-pattern weight sets: the up-peak optimum is not the down-peak optimum. */
export interface PatternSwitchingConfig extends Commented {
  readonly patternDetector: PatternDetectorConfig;
  /** Pattern name to dispatcher-profile id. */
  readonly weightSetsByPattern: Readonly<Record<string, string>>;
}

/** The whole of `data/dispatcher-profiles.json`. */
export interface DispatcherProfiles extends Commented {
  readonly version: number;
  readonly terms: readonly CostTerm[];
  readonly normalization: Commented & { readonly required: boolean };
  readonly profiles: readonly DispatcherProfile[];
  readonly patternSwitching?: PatternSwitchingConfig | undefined;
}

// ---------------------------------------------------------------------------
// data/buildings/*.json
// ---------------------------------------------------------------------------

export const BUILDING_TYPES = ['office', 'residential', 'hotel', 'hospital', 'mixed-use'] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

/** One floor. `id` is the display label and the key every reference uses. */
export interface FloorConfig extends Commented {
  /** Display label and reference key, e.g. `G`, `P1`, `12`. Unique within a building. */
  readonly id: string;
  /** Numeric ordering. Integer; negative for basements. Unique within a building. */
  readonly index: number;
  /** Height above datum, metres. May be negative. Drives travel time. */
  readonly heightM: number;
  /** Occupants. Drives arrival rate as a percentage of population per 5 minutes. */
  readonly population: number;
  /** Ground-level source of incoming traffic. A building may have several. */
  readonly isEntrance?: boolean | undefined;
  /**
   * Sky lobby. A passenger alighting here is re-injected as a new arrival on the next
   * leg while keeping its original journey identity, so time-to-destination spans both
   * trips. Parallels `isEntrance`.
   */
  readonly isTransferFloor?: boolean | undefined;
  /**
   * Overrides the building-level `trafficProfile` for arrivals originating here. A
   * mixed-use tower cannot express overlapping office and residential peaks with one
   * building-level profile.
   */
  readonly trafficProfile?: string | undefined;
  /** Optional human name, e.g. `Lobby`. */
  readonly label?: string | undefined;
}

/**
 * Compact floor declaration for tall buildings. Expanded to explicit `FloorConfig`s at
 * load time by `expandFloors`.
 */
export interface FloorRange extends Commented {
  /** First index in the range, inclusive. */
  readonly fromIndex: number;
  /** Last index in the range, inclusive. */
  readonly toIndex: number;
  /** Height of `fromIndex` above datum, metres. */
  readonly startHeightM: number;
  /** Constant floor-to-floor rise within the range, metres. Must be positive. */
  readonly floorToFloorM: number;
  readonly populationPerFloor: number;
  /** Pattern for the generated floor id. `{index}` is substituted. Default `{index}`. */
  readonly idPattern?: string | undefined;
  /** Label applied to every floor in the range. `{index}` is substituted if present. */
  readonly label?: string | undefined;
  /** Applied to every floor in the range. */
  readonly isEntrance?: boolean | undefined;
  /** Applied to every floor in the range. */
  readonly isTransferFloor?: boolean | undefined;
  /** Per-floor traffic profile override, applied to every floor in the range. */
  readonly trafficProfile?: string | undefined;
}

/**
 * A car as authored. Every field except `id` and `spec` is an override of the class
 * default in `elevator-specs.json`; omit to inherit.
 */
export interface CarConfig extends Commented {
  /** Unique within its bank, e.g. `A`. */
  readonly id: string;
  /** Elevator class id in `data/elevator-specs.json`. */
  readonly spec: string;
  /**
   * Service mode the car starts the run in. Defaults to `in-service`.
   *
   * The one field here that is not hardware: it is *operational state*, and it is authorable
   * because the alternative is that a whole class of scenario cannot be expressed at all. A
   * building with a car under maintenance, a bank in fire recall, an attendant-operated car —
   * all of them are `mode`, and without it `INELIGIBILITY_REASONS.serviceMode` is unreachable
   * from `data/` and "all cars out of service" is not an authorable configuration.
   *
   * Anything other than `in-service` makes the car ineligible for hall calls for the whole run
   * unless a {@link ServiceEventConfig} puts it back. See {@link BuildingConfig.serviceEvents}.
   */
  readonly mode?: ServiceMode | undefined;
  /** Top speed, m/s. Defaults to the class typical. */
  readonly ratedSpeedMps?: number | undefined;
  /** Rated load. Imperial: unit is in the name. Defaults to the class low end. */
  readonly ratedLoadLb?: number | undefined;
  /** Defaults to `centerOpening`. */
  readonly doorType?: DoorType | undefined;
  /** m/s^2. Defaults to the class typical. Dominates short-hop time. */
  readonly acceleration?: number | undefined;
  /** m/s^3. Defaults to the class typical. Dominates very short hops. */
  readonly jerk?: number | undefined;
  /** Seconds. Defaults to the door-type value. */
  readonly doorOpenS?: number | undefined;
  /** Seconds. Defaults to the door-type value. */
  readonly doorCloseS?: number | undefined;
  /** Seconds. Defaults to the typical car-call dwell. */
  readonly dwellCarCallS?: number | undefined;
  /** Seconds. Defaults to the typical hall-call dwell. */
  readonly dwellHallCallS?: number | undefined;
  /** Seconds. Defaults to the shared timing value. */
  readonly motorStartDelayS?: number | undefined;
  /** Seconds. Defaults to the typical levelling time. */
  readonly levelingSettleS?: number | undefined;
  /**
   * Seconds per passenger per direction through the doorway.
   *
   * Defaults to `timing.passengerTransferS[<building type>]` — office 1.2, residential 1.75,
   * hotel 1.5. Declare it on the car when the building type has no row in that table
   * (`mixed-use`), or when one bank of a mixed tower serves a different population than the
   * building as a whole. There is no code-side default: an unstated value on a type the table
   * does not cover is an error, not the office figure.
   */
  readonly passengerTransferS?: number | undefined;
  /** Two decks, one floor apart, that open simultaneously. Absent means single-deck. */
  readonly doubleDeck?: boolean | undefined;
  /** Vertical distance between the decks, metres. Required when `doubleDeck` is set. */
  readonly deckSeparationM?: number | undefined;
  /**
   * Per-deck rating. `ratedLoadLb` stays the whole-car rating and is twice this.
   * Imperial: unit is in the name.
   */
  readonly ratedLoadLbPerDeck?: number | undefined;
}

/**
 * A group of cars under one group controller. `servesFloors` is *service* zoning — a hard
 * physical feasibility filter, distinct from access zoning and from operational zoning.
 */
export interface BankConfig extends Commented {
  readonly id: string;
  readonly name?: string | undefined;
  /** Floor ids this bank's shafts open onto. Every id must exist in the building. */
  readonly servesFloors: readonly string[];
  /**
   * Double-deck only: the floor pairs served simultaneously, `[lower, upper]`.
   * `servesFloors` is the flattened union. Each pair must be exactly `deckSeparationM`
   * apart in `heightM`, or the car is physically impossible.
   */
  readonly servesFloorPairs?: readonly (readonly [string, string])[] | undefined;
  readonly cars: readonly CarConfig[];
}

/**
 * A **non-elevator** connection between two floors: an escalator, a stair, an inclined walk.
 *
 * ## Why this exists
 *
 * `traffic/route.ts` plans a journey as graph reachability over service zoning, and until this
 * type existed **every edge of that graph was an elevator bank**. A two-level lobby served in
 * reality by an escalator therefore had its ground-level hop routed onto a local lift, and the
 * journey was charged a whole extra leg — a hall call, a wait, a ride, and the fleet distance to
 * answer it — that the real building never pays. On `vertical-city` that cost the double-deck arm
 * roughly a tenth of its legs, which is why `DECISIONS.md` § D147 § 6 had to publish its
 * WORSE-under-`eta` row as an *upper bound on the cost of double-deck* rather than as the cost.
 * See `DECISIONS.md` for the entry that closes it.
 *
 * ## What it is, and what it deliberately is not
 *
 * It is **one edge with one number**: two floors, and the door-to-door seconds a passenger spends
 * getting between them on the machine. It has no capacity, no queue, no direction and no
 * breakdown, because none of those would be read by anything — the simulator measures lift
 * service, and this type exists to stop the lifts being charged for work they do not do.
 *
 * Two things are still deliberately **not** declared, each because nothing in the tree would
 * consult them and an unread field is the dead seam `CLAUDE.md` names eleven times over:
 *
 * - **No one-way direction.** A one-way escalator is a real configuration and this cannot express
 *   it. Note this is *not* the same as {@link traversalTimeS}'s asymmetry, which says climbing and
 *   descending take different lengths of time; a one-way machine is one you cannot use at all in
 *   the other direction. Named as a limitation rather than half-built.
 * - **No capacity or headway.** An escalator's handling capacity is enormous relative to a lift's
 *   and modelling it would put a queue on the one edge that exists to *remove* a queue.
 *
 * **A third was declared, and the reason it was refused is worth keeping.** *"No `kind` enum —
 * nothing branches on it"* was correct for as long as every mode behaved identically. docs/14
 * § 3.3 makes stairs behave differently in two ways that no amount of `$comment` can express: they
 * cost more to climb than to descend, and — unlike an escalator, which the router uses because the
 * geometry says those floors connect — they are **chosen**. {@link kind} is what those two branch
 * on, and it arrived with them rather than ahead of them.
 */
export interface TransportModeConfig extends Commented {
  /** Unique within the building, e.g. `lobby-escalator`. */
  readonly id: string;
  /** Optional human name, e.g. `Ground lobby escalator pair`. */
  readonly name?: string | undefined;
  /**
   * The two floor ids it joins, `[a, b]`. Both must exist in the building and must differ.
   * Order carries no meaning: the edge is traversed either way at the same cost.
   */
  readonly connects: readonly [string, string];
  /**
   * What the machine is, and therefore how it behaves. Defaults to `escalator` when absent, so
   * every building written before this field existed parses and routes unchanged.
   *
   * The two kinds differ in exactly two ways, and both are modelling content rather than labels:
   *
   * - **Cost.** An escalator carries you at one speed; {@link traversalTimeS} is one number.
   *   Stairs are not symmetric, so a stairs mode declares `{ upS, downS }` and a scalar is a
   *   **config error rather than a default** — silently symmetrising the asymmetry is the failure
   *   this whole section exists to avoid.
   * - **Use.** An escalator is *structural*: `traffic/route.ts` uses it because the geometry says
   *   those floors connect, and a passenger has no say. Stairs are *chosen*, so the router never
   *   sees them at all; they are offered to the rider at the landing and taken when the drawn
   *   propensity clears. See {@link StairsUseConfig}.
   */
  readonly kind?: TransportModeKind | undefined;
  /**
   * Landing-to-landing seconds, **including** stepping on and stepping off.
   *
   * A scalar for an escalator — it carries you at one speed in either direction — and
   * `{ upS, downS }` for stairs, where climbing costs more than descending. The two forms are not
   * interchangeable: a `stairs` mode declaring a scalar is refused, because a symmetric stair is
   * a stair with its modelling content deleted.
   *
   * A *deterministic* number, not a distribution, and deliberately so: a random draw would need a
   * new named stream on `StreamSet`, and adding a stream shifts every downstream draw, which
   * desynchronizes common random numbers against every run already stored (CLAUDE.md invariant 2,
   * and `random/streams.ts`). The gain — a few seconds of spread on a segment nobody queues for —
   * does not buy back the comparison power.
   *
   * **Reference value, so it must be cited** in the declaring building's `$comment`; see
   * `docs/02-elevator-reference.md` § *Non-lift transport*.
   */
  readonly traversalTimeS: number | DirectionalTraversalTime;
  /**
   * Who will actually use the stairs, by the **sign** of the floor delta. Required on a `stairs`
   * mode and refused on an escalator, which nobody chooses.
   */
  readonly use?: StairsUseConfig | undefined;
}

/** What a {@link TransportModeConfig} is. See {@link TransportModeConfig.kind}. */
export const TRANSPORT_MODE_KINDS = ['escalator', 'stairs'] as const;

export type TransportModeKind = (typeof TRANSPORT_MODE_KINDS)[number];

/**
 * Landing-to-landing seconds in each direction, for a machine that is not symmetric.
 *
 * `upS >= downS` is required rather than assumed: a stair you climb faster than you descend is a
 * transcription error, and accepting one would silently invert the asymmetry the model is here to
 * carry.
 */
export interface DirectionalTraversalTime {
  /** Seconds to climb, landing to landing. */
  readonly upS: number;
  /** Seconds to descend. */
  readonly downS: number;
}

/**
 * **The behavioural asymmetry: who chooses the stairs, by the sign of the floor delta.**
 *
 * ## Two numbers, and why it is not two curves
 *
 * The first version of this type declared `propensityUp` and `propensityDown` as **arrays**
 * indexed by flight count, with the array length doubling as a floor-count reach. Review measured
 * it and it was **dead data**: `connects` is a pair, so a mode's floor delta is fixed, only
 * `curve[flights - 1]` is ever read, and every earlier entry is schema-valid, authorable,
 * validated and never consulted. Zeroing index 0 of a two-flight stair produced a
 * **bit-identical `SimulationResult`**. That is `destination-eta`'s `weights.rideTime: 0` shape
 * (`DECISIONS.md` § D112) reproduced at the data layer, in a field the seam test's own fixture
 * populated deadly.
 *
 * So the shape is two numbers, both read, neither optional. The *magnitude* of the climb is
 * already declared — it is the span between the two floors in `connects` — and the **sign** is
 * what selects between these. A stair between floors 2 and 8 is a six-flight climb and
 * {@link up} is the probability for that climb, not for one flight of it.
 *
 * **The reach condition went with it, and that is a correction rather than a dropped
 * requirement.** docs/14 § 3.3 lists three conditions, of which the second is *"the journey is
 * within a declared floor-count reach"*. On a pair-connected mode that condition is not
 * independently expressible: the pair fixes the span, so conditions 1 and 2 collapse into one and
 * the array form that appeared to separate them was expressing it with dead entries. An author
 * who does not want a six-flight climb taken declares a low {@link up}, or does not declare the
 * stair.
 *
 * ## Why the sign, and not the distance
 *
 * A model symmetric in `|Δfloor|` would be **worse than no model at all**, because it would
 * quietly claim that up-traffic self-relieves at the same rate as down-traffic — and down-peak is
 * exactly where a real building's stairs take load off the lifts. Two separately declared numbers
 * make that mistake impossible to make by accident: symmetry has to be typed out twice.
 *
 * The two asymmetries are **independent and both are required**. Modelling only the cost
 * ({@link DirectionalTraversalTime}) gives people cheerfully climbing forty floors slowly;
 * modelling only the willingness gives the ones who do climb arriving as fast as those going
 * down. Neither is a building.
 *
 * ## Per building, and cited
 *
 * These are reference values under this repository's data rule, and they are **per building**: a
 * hotel's guests, an office tower's staff and a hospital's do not behave alike, so the pair is
 * authored on the mode with its source in the declaring building's `$comment`. There is no
 * default in code, deliberately — a default would put an uncited behavioural claim into every
 * study that declared a stair.
 */
export interface StairsUseConfig {
  /** Probability that a rider **climbing** this stair's span takes it rather than a lift. */
  readonly up: number;
  /** Probability that a rider **descending** it does. Normally the larger of the two. */
  readonly down: number;
}

/**
 * Credential-based zoning. Floors covered by no access zone are unrestricted. Distinct
 * from service zoning (`BankConfig.servesFloors`) and from operational zoning.
 */
export interface AccessZone extends Commented {
  readonly id: string;
  /** Floor ids the zone covers. Every id must exist in the building. */
  readonly floors: readonly string[];
  /** Credential groups permitted to reach those floors. */
  readonly credentialGroups: readonly string[];
}

/**
 * One scheduled service-mode change, at a simulated time.
 *
 * **Data, not a hook** (CLAUDE.md invariant 7, and the root DECISIONS.md, the T19 block). A schedule authored here is
 * part of the building, so it travels with `buildingId` through the persisted run envelope and a
 * stored run replays it exactly; a `SimulationConfig` callback would be a function, would not
 * serialize, and would be silently absent from every replay — which is Phase 4's acceptance
 * criterion failing quietly rather than loudly.
 *
 * `atS` is **simulated** seconds from the start of the run, from the kernel and never a wall
 * clock (invariant 3). Two events at the same `atS` fire in authored order, because the queue's
 * total order is `(time, sequence)` and the sequence follows the order the runner scheduled them
 * in, which is the order they appear in the array (invariant 4).
 */
export interface ServiceEventConfig extends Commented {
  /** Simulated seconds from the start of the run. */
  readonly atS: number;
  /** The car's id within its bank. */
  readonly carId: string;
  /**
   * Which bank the car is in. Required only when the same car id appears in more than one
   * bank; omitted, the id must be unique across the building.
   */
  readonly bankId?: string | undefined;
  /** The mode to switch to. Switching to the mode the car is already in is a no-op. */
  readonly mode: ServiceMode;
}

/** One file in `data/buildings/`. Floors come from `floors`, `floorRanges`, or both. */
export interface BuildingConfig extends Commented {
  readonly id: string;
  readonly name: string;
  readonly type: BuildingType;
  /** Traffic profile id in `data/traffic-profiles.json`. */
  readonly trafficProfile: string;
  readonly floors?: readonly FloorConfig[] | undefined;
  readonly floorRanges?: readonly FloorRange[] | undefined;
  /** Declared occupancy. Cross-checked against the sum of floor populations. */
  readonly totalPopulation?: number | undefined;
  readonly banks: readonly BankConfig[];
  /**
   * Non-lift connections between floors, in authored order. Absent means "this building is
   * served by lifts and nothing else", which is what every building in `data/buildings/` said
   * before `vertical-city` declared its lobby escalator.
   *
   * **Absent and empty mean the same thing here**, unlike {@link serviceEvents}: a transport mode
   * is a fact about the fabric, and a building that declares none has none. The resolved view
   * flattens both to `[]`.
   */
  readonly transportModes?: readonly TransportModeConfig[] | undefined;
  readonly accessZones?: readonly AccessZone[] | undefined;
  /**
   * Mid-run service-mode changes, in authored order. Absent means "nothing changes".
   *
   * A car's *initial* mode is `CarConfig.mode`; this is the schedule that moves it afterwards —
   * a recall at 600 s, a return to service at 900 s. See {@link ServiceEventConfig} for why this
   * is authored data rather than an injection seam.
   */
  readonly serviceEvents?: readonly ServiceEventConfig[] | undefined;
  readonly notes?: readonly string[] | undefined;
}

// ---------------------------------------------------------------------------
// Resolved (post-validation) views
// ---------------------------------------------------------------------------

/**
 * A car with every class default applied. This is what the physics and dispatch layers
 * consume; nothing downstream should have to know about class inheritance.
 */
export interface ResolvedCar {
  readonly id: string;
  /** The elevator class this car was resolved against. */
  readonly spec: string;
  /**
   * Service mode at t=0. `in-service` unless the car config said otherwise.
   *
   * Always present, unlike {@link passengerTransferS}: there is a safe default here and it is
   * the same one `Car` applies, so a resolved car can state it rather than leaving every
   * consumer to re-derive it.
   */
  readonly mode: ServiceMode;
  readonly ratedSpeedMps: number;
  /** m/s^2. */
  readonly acceleration: number;
  /** m/s^3. */
  readonly jerk: number;
  /** Rated load, imperial. Unit in the name; never silently converted. */
  readonly ratedLoadLb: number;
  /** Rated load in kilograms: the standard metric size when one matches, else converted. */
  readonly ratedLoadKg: number;
  /** Persons at rated load, per the `personsPerRatedLoadUS` convention. */
  readonly capacityPersons: number;
  /** Persons at design load: `floor(capacityPersons * designLoadFactor)`. */
  readonly designCapacityPersons: number;
  /** The fraction of rated capacity used for design, from the specs conventions. */
  readonly designLoadFactor: number;
  readonly doorType: DoorType;
  readonly doorOpenS: number;
  readonly doorCloseS: number;
  readonly dwellCarCallS: number;
  readonly dwellHallCallS: number;
  readonly motorStartDelayS: number;
  readonly levelingSettleS: number;
  /**
   * Seconds per passenger per direction through the doorway; the `2·P·tp` term of the
   * round-trip time, and the term that term is most sensitive to.
   *
   * Present when it could be resolved: either the car declared it, or the resolver was told
   * which building type the car is being resolved for
   * (`ResolveCarOptions.buildingType` → `timing.passengerTransferS[type]`). Absent otherwise —
   * `resolveCar` is reachable without a building (fixtures, a bare class lookup), and the one
   * thing it must never do is invent the office value for a residential car. A consumer that
   * finds it absent must resolve it itself, or say out loud that it is running on
   * `CAR_DEFAULTS`.
   */
  readonly passengerTransferS?: number | undefined;
  /** False unless the car config declares `doubleDeck`. */
  readonly doubleDeck: boolean;
  /** Metres between the decks. Present only on double-deck cars. */
  readonly deckSeparationM?: number | undefined;
  /** Per-deck rated load. Present only on double-deck cars. */
  readonly ratedLoadLbPerDeck?: number | undefined;
  /** Persons per deck at rated load. Present only on double-deck cars. */
  readonly capacityPersonsPerDeck?: number | undefined;
  /** Persons per deck at design load. Present only on double-deck cars. */
  readonly designCapacityPersonsPerDeck?: number | undefined;
}

/**
 * A {@link ServiceEventConfig} with its car located: `bankId` is no longer optional, and the
 * pair `(bankId, carId)` names exactly one car of this building.
 *
 * Resolved at config time and not at run time, so an event naming a car that does not exist is a
 * `ConfigError` with a path — the same treatment a bank serving an undeclared floor gets — rather
 * than a silently-skipped event that makes a run quietly not test what it says it tests.
 */
export interface ResolvedServiceEvent {
  readonly atS: number;
  readonly bankId: string;
  readonly carId: string;
  readonly mode: ServiceMode;
}

/** A bank with its cars resolved. */
export interface ResolvedBank {
  readonly id: string;
  readonly name?: string | undefined;
  readonly servesFloors: readonly string[];
  readonly servesFloorPairs?: readonly (readonly [string, string])[] | undefined;
  readonly cars: readonly ResolvedCar[];
}

/** A building with floors expanded, cars resolved, and cross-references checked. */
export interface ResolvedBuilding {
  readonly id: string;
  readonly name: string;
  readonly type: BuildingType;
  readonly trafficProfile: string;
  /** Absolute path of the file this was loaded from, or a caller-supplied label. */
  readonly source: string;
  /** The validated config exactly as authored. */
  readonly config: BuildingConfig;
  /** Explicit floors, ranges expanded, sorted ascending by `index`. */
  readonly floors: readonly FloorConfig[];
  readonly floorsById: ReadonlyMap<string, FloorConfig>;
  readonly floorsByIndex: ReadonlyMap<number, FloorConfig>;
  /** Floors flagged `isEntrance`, in floor order. */
  readonly entranceFloors: readonly FloorConfig[];
  /** Floors flagged `isTransferFloor` (sky lobbies), in floor order. */
  readonly transferFloors: readonly FloorConfig[];
  readonly banks: readonly ResolvedBank[];
  /**
   * Non-lift edges of the routing graph, in authored order. `[]` when the building declares none,
   * which is the shipped default and the case every figure published before
   * `DECISIONS.md` § D147 was measured under.
   *
   * **Required rather than optional**, unlike {@link serviceEvents}, and for the reason that
   * field's own docstring regrets: a hand-built `ResolvedBuilding` that silently lacked this
   * would route as if the escalator were not there and nothing would say so.
   */
  readonly transportModes: readonly TransportModeConfig[];
  readonly accessZones: readonly AccessZone[];
  /**
   * The building's service-mode schedule, every car located, in authored order.
   *
   * **Optional, and its absence is not the same as an empty schedule.** A `ResolvedBuilding`
   * assembled by hand rather than by {@link resolveBuilding} — fixtures, the fuzz generator,
   * `experiments/validation/syntheticBuilding.ts` — will not have it, and a run given one whose
   * `config.serviceEvents` is non-empty while this is absent says so in `result.warnings` rather
   * than dropping the schedule quietly. See `sim/simulation.ts`.
   */
  readonly serviceEvents?: readonly ResolvedServiceEvent[] | undefined;
  /** Sum of expanded floor populations. Authoritative over the declared value. */
  readonly totalPopulation: number;
  /** Non-fatal diagnostics raised while resolving this building. */
  readonly warnings: readonly ConfigWarning[];
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** A single validation failure, located precisely enough to act on. */
export interface ConfigIssue {
  /** The file the problem is in. Absolute when loaded from disk. */
  readonly file: string;
  /** Dotted/bracketed path to the offending value, e.g. `banks[0].cars[1].spec`. */
  readonly path: string;
  /** What was wrong and what was expected. */
  readonly message: string;
  /** Stable machine-readable kind, for tests and tooling. */
  readonly code?: string | undefined;
}

/** Something suspicious that does not make the config unusable. */
export interface ConfigWarning extends ConfigIssue {
  readonly code: string;
}

/** Everything under a data directory, validated and cross-referenced. */
export interface LoadedConfig {
  /** Absolute path of the directory that was loaded. */
  readonly dataDir: string;
  readonly elevatorSpecs: ElevatorSpecs;
  readonly trafficProfiles: TrafficProfiles;
  readonly dispatcherProfiles: DispatcherProfiles;
  /** Buildings in filename order. */
  readonly buildings: readonly ResolvedBuilding[];
  readonly buildingsById: ReadonlyMap<string, ResolvedBuilding>;
  readonly specsById: ReadonlyMap<string, ElevatorSpec>;
  readonly trafficProfilesById: ReadonlyMap<string, TrafficProfile>;
  readonly dispatcherProfilesById: ReadonlyMap<string, DispatcherProfile>;
  readonly costTermsById: ReadonlyMap<string, CostTerm>;
  /** Every non-fatal diagnostic found, across all files. */
  readonly warnings: readonly ConfigWarning[];
}
