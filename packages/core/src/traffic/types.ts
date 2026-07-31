/**
 * Vocabulary for passenger demand generation.
 *
 * The output of this module is a **trace**: a plain, immutable data structure describing
 * every passenger a replication will see, produced *before* the simulation runs and
 * unaffected by anything the elevators subsequently do. That property is not cosmetic — it
 * is the mechanism behind common random numbers (docs/03-traffic-and-statistics.md § Part 4,
 * and CLAUDE.md invariant 2). Two dispatchers handed `new StreamSet(sameSeed)` and the same
 * {@link TrafficConfig} see byte-identical passengers, so the paired difference between them
 * measures the dispatcher and nothing else.
 *
 * Three consequences shape the types below.
 *
 * 1. **Nothing here holds a simulated time the simulation decides.** A journey that crosses
 *    a sky lobby is planned as a chain of {@link TraceLeg}s, but only leg 0 carries an
 *    arrival time. Legs 1..n are re-injected when the passenger actually alights, which
 *    depends on the dispatcher — see {@link GeneratedPassenger.legs}.
 * 2. **Mass is part of the trace.** It is drawn from the `passengerMass` stream at
 *    generation time so that the whole passenger population is a pure function of
 *    `(seed, config)`. Drawing it later, during the run, would make it a function of
 *    arrival *order*, which the dispatcher can change.
 * 3. **Every tunable declares its schema** ({@link TRAFFIC_PARAMETERS}), per CLAUDE.md
 *    invariant 8, so a generic optimizer can sample demand configurations without knowing
 *    anything about elevators.
 *
 * Naming note: config's `DemandTemplate` is the record as authored in
 * `data/traffic-profiles.json`; {@link ResolvedDemandTemplate} is the runtime view of it,
 * following the `ResolvedCar` / `ResolvedBank` / `ResolvedBuilding` convention already used
 * by the config module.
 */

import type { DirectionalSplit, ResolvedBuilding, TrafficProfiles } from '../config/types.js';
import type { SimTime } from '../kernel/index.js';
import type { CredentialGroup } from '../model/index.js';
import type { StreamSet } from '../random/index.js';

/* -------------------------------------------------------------------------- *
 * Errors
 * -------------------------------------------------------------------------- */

/**
 * A demand specification that cannot produce a valid trace: an unsupported arrival process
 * or batch distribution, a floor naming a traffic profile that does not exist, a journey
 * whose destination no chain of banks can reach.
 *
 * Thrown rather than returned. Every one of these silently mis-scales or silently drops
 * demand if it is allowed through, and a simulation that quietly serves 8% fewer passengers
 * than it claims is exactly the "confident nonsense" CLAUDE.md names as this project's most
 * likely failure mode.
 */
export class TrafficError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrafficError';
  }
}

/* -------------------------------------------------------------------------- *
 * Demand templates
 * -------------------------------------------------------------------------- */

/**
 * The demand shapes this module knows how to build.
 *
 * `rise-and-fall` is the recommended one (CIBSE Guide D): each replication is an independent
 * 30-minute terminating simulation, which is what makes confidence intervals across
 * replications legitimate. `constant-iso` (draft ISO 8100-32) is one long run whose waiting
 * times are serially correlated, so it supports **no** confidence interval and exists here
 * for cross-checking only — see docs/03-traffic-and-statistics.md § The independence
 * condition.
 *
 * `lunch-two-way` is the third, and the only one whose **directional mix moves within the run**:
 * the lunch mixed peak, outgoing-dominant as occupants leave the building and incoming-dominant
 * as they return. Its intensity geometry is `rise-and-fall`'s, unchanged, so the only thing it
 * adds is the mix arc — see {@link DemandPhase.startSplit}.
 */
export const DEMAND_TEMPLATE_IDS = ['rise-and-fall', 'constant-iso', 'lunch-two-way'] as const;

export type DemandTemplateId = (typeof DEMAND_TEMPLATE_IDS)[number];

/**
 * One linear segment of a demand template's intensity multiplier.
 *
 * Intensity is dimensionless and normalized so that `1` is the profile's nominal arrival
 * rate. Segments are contiguous and cover `[0, durationS]` exactly.
 */
export interface DemandPhase {
  readonly startS: number;
  readonly endS: number;
  /** Multiplier at {@link startS}, 0..1. */
  readonly startIntensity: number;
  /** Multiplier at {@link endS}, 0..1. */
  readonly endIntensity: number;
  /**
   * Directional mix at {@link startS}, or absent when this phase declares none.
   *
   * **Absent — not a copy of the profile's split — on every phase of both templates that shipped
   * before it existed**, and that is what makes the field opt-in rather than a rewrite of the
   * traffic model. `DECISIONS.md` § D151 § 7 fixed the requirement in advance: *"It must be opt-in
   * and byte-identical when unused."* A phase with no split leaves every floor on its own traffic
   * profile's `directionalSplit`, read once at plan time, which is what every published figure in
   * this repository was measured under.
   *
   * A phase that declares one interpolates linearly between {@link startSplit} and
   * {@link endSplit}, exactly as {@link startIntensity} and {@link endIntensity} do — so the mix
   * is piecewise-linear over the same knots the intensity is, and a template may put a step at a
   * phase boundary by giving neighbouring phases different endpoint mixes.
   *
   * Declared with {@link endSplit} or not at all; the resolver rejects one alone.
   */
  readonly startSplit?: DirectionalSplit | undefined;
  /** Directional mix at {@link endS}. See {@link startSplit}. */
  readonly endSplit?: DirectionalSplit | undefined;
}

/**
 * A demand template resolved to seconds and to a piecewise-linear intensity function.
 *
 * The *shape* is code (a ramp is a ramp); every *number* comes from
 * `data/traffic-profiles.json → demandTemplates` or from an explicit override, per CLAUDE.md
 * invariant 7.
 */
export interface ResolvedDemandTemplate {
  readonly id: string;
  readonly name: string;
  /** Whether this template supports confidence intervals across replications. */
  readonly recommended: boolean;
  /** Length of one replication, seconds. */
  readonly durationS: number;
  /** Contiguous segments covering `[0, durationS]`, ascending. */
  readonly phases: readonly DemandPhase[];
  /** Start of the measurement window, seconds. Arrivals before this are warm-up. */
  readonly reportWindowStartS: number;
  /** End of the measurement window, seconds, exclusive. */
  readonly reportWindowEndS: number;
  /** The largest intensity the template reaches. `1` for both shipped templates. */
  readonly peakIntensity: number;
  /**
   * `∫ intensity dt` over the whole run, seconds. Multiply by the nominal passenger rate to
   * get the expected number of passengers — the analytic value the statistical tests check
   * the generator against.
   */
  readonly intensityIntegralS: number;
  /**
   * The period's own directional mix — the time-average of the phases' splits — or **absent** when
   * no phase declares one.
   *
   * Present exactly when the template varies the mix, so this field is the one thing the rest of
   * the module tests to decide which path it is on. Two consequences, both deliberate:
   *
   * 1. It is the split the *plan* is built at, so `planDemand` never divides by a zero share and
   *    the plan's headline rate is the rate of the period rather than of one instant. Which base
   *    is chosen cannot change a destination weight — the base cancels out of
   *    `weight · split(t)/base` — so this is a reporting and numerical-safety choice, not a
   *    modelling one.
   * 2. It is what the flat-mix negative control is flat *at*. `mixAmplitude: 0` leaves this value
   *    in place and every phase knot equal to it, so the control differs from the treatment in the
   *    variation of the mix and in nothing else — not in the mean mix, and not in total demand.
   */
  readonly meanDirectionalSplit?: DirectionalSplit | undefined;
}

/* -------------------------------------------------------------------------- *
 * Demand sources
 * -------------------------------------------------------------------------- */

/**
 * Where a batch physically appears.
 *
 * - `entrance` — the aggregate incoming stream. Its rate is the sum, over every populated
 *   floor, of that floor's arrival rate times *that floor's* `incoming` share, so a per-floor
 *   traffic-profile override changes how much incoming demand exists and where it is bound.
 *   Which entrance a given batch walks through is drawn from the `origins` stream.
 * - `resident` — demand generated by the population of one floor and leaving it: the
 *   `outgoing` and `interfloor` shares of that floor's profile.
 */
export const DEMAND_SOURCE_KINDS = ['entrance', 'resident'] as const;

export type DemandSourceKind = (typeof DEMAND_SOURCE_KINDS)[number];

/** Which leg of the directional split a generated trip belongs to. */
export const DIRECTION_CATEGORIES = ['incoming', 'outgoing', 'interfloor'] as const;

export type DirectionCategory = (typeof DIRECTION_CATEGORIES)[number];

/** One entry of a demand source's destination table. Weights need not be normalized. */
export interface DestinationWeight {
  readonly floorId: string;
  readonly floorIndex: number;
  /** Relative likelihood of this destination. */
  readonly weight: number;
  readonly category: DirectionCategory;
  /**
   * The floor whose population generated this demand, and therefore whose traffic profile
   * governs it. Equal to {@link floorId} for `incoming`, and to the source floor otherwise.
   */
  readonly demandFloorId: string;
  /** Id of the traffic profile that governs this demand. */
  readonly profileId: string;
}

/**
 * One independent Poisson batch process.
 *
 * Superposing several of these is still a Poisson process, which is what lets a per-floor
 * profile override change one floor's rate, batch size and directional split without
 * disturbing any other floor.
 */
export interface DemandSource {
  /** Stable identity, e.g. `entrance` or `resident:12`. */
  readonly id: string;
  readonly kind: DemandSourceKind;
  /**
   * Where batches appear. `undefined` for the `entrance` source, whose origin is drawn per
   * batch from the `origins` stream across every declared entrance.
   */
  readonly originFloorId: string | undefined;
  /**
   * Traffic profile this source is attributed to. For a `resident` source that is the floor's
   * own profile and it governs the batch-size distribution directly; for the `entrance`
   * source it is the building-level profile, and each batch's size actually comes from the
   * profile of whichever entrance the batch was drawn to arrive at. {@link meanBatchSize}
   * carries the entrance-weighted average, which is the figure {@link peakBatchesPerSecond}
   * is derived from.
   */
  readonly profileId: string;
  /** Passengers per second at full template intensity. */
  readonly peakPassengersPerSecond: number;
  /** Batches per second at full template intensity: passengers / mean batch size. */
  readonly peakBatchesPerSecond: number;
  readonly meanBatchSize: number;
  /**
   * Where this source's passengers go. Weights are absolute passengers per second and sum to
   * {@link peakPassengersPerSecond}; an empty table means the source generates nothing.
   */
  readonly destinations: readonly DestinationWeight[];
  /**
   * {@link peakPassengersPerSecond} broken out by direction category — **present only under a
   * template that varies the directional mix**, and omitted (not zero-filled) otherwise.
   *
   * Omitted rather than emptied for the same reason `GeneratedPassenger.transportHops` is: a trace
   * from a run that does not use the feature must be the object it was before the feature existed,
   * and `traffic/mixIdentity.test.ts` holds it to that byte for byte.
   *
   * It exists because a mix-varying run has to rescale a source's rate over time, and the scale is
   * `Σ_c categoryRates[c] · split_c(t) / meanSplit_c` — which needs the split of the source's own
   * rate, not just its total. Serializable, so a stored trace still replays.
   */
  readonly categoryRates?: Readonly<Record<DirectionCategory, number>> | undefined;
}

/* -------------------------------------------------------------------------- *
 * Trace records
 * -------------------------------------------------------------------------- */

/**
 * One elevator ride within a journey.
 *
 * Leg 0 begins at {@link GeneratedPassenger.arrivalTimeS}. Every later leg begins when the
 * passenger alights at a transfer floor, which is a *simulated* time the dispatcher
 * influences, so it is deliberately absent here: the trace plans the route, the run
 * timestamps it.
 */
export interface TraceLeg {
  /** 0 for the first ride, incrementing at each transfer. */
  readonly legIndex: number;
  readonly originFloorId: string;
  readonly originFloorIndex: number;
  readonly destinationFloorId: string;
  readonly destinationFloorIndex: number;
}

/**
 * One hop of a journey made on something that is not a lift — the building's declared escalator
 * or stair.
 *
 * **Not a {@link TraceLeg}, and that is the point.** A leg is a unit of elevator service: it
 * lights a landing button, joins a queue, occupies a car and contributes to every per-leg metric
 * this project publishes. A hop does none of those. Charging the ground-level hop of a two-level
 * lobby as a leg is exactly the defect `DECISIONS.md` § D147 § 6 named as the largest modelling
 * limit in the repository, so hops are counted, timed and reported separately.
 *
 * The time is still *charged*: {@link traversalTimeS} lands on the journey's time-to-destination
 * either as a delay before the next leg starts waiting or, on a hop that ends the journey, as
 * seconds added after the last alighting. Removing a leg and giving its seconds away for free
 * would flatter every arm that uses the escalator.
 */
export interface TraceTransportHop {
  /** `TransportModeConfig.id` of the edge ridden. */
  readonly modeId: string;
  readonly originFloorId: string;
  readonly originFloorIndex: number;
  readonly destinationFloorId: string;
  readonly destinationFloorIndex: number;
  /**
   * The elevator leg this hop comes immediately before: `0` when the hop starts the journey,
   * and `legs.length` when it ends it. At most one hop per index — two consecutive transport
   * edges would mean the router had chained escalators, which it can only do through a floor
   * flagged `isTransferFloor`, and which no shipped building declares.
   */
  readonly beforeLegIndex: number;
  /** Landing-to-landing seconds, deterministic, from the building's declaration. */
  readonly traversalTimeS: number;
}

/**
 * One journey, fully determined before the simulation starts.
 *
 * The `journeyId` is what makes time-to-destination span a sky-lobby transfer: every leg
 * materialized from this record carries it, so the final leg can subtract
 * {@link arrivalTimeS} and report the whole door-to-door time rather than the last hop.
 */
export interface GeneratedPassenger {
  /** Identity of the first leg, and of this record. Unique within a trace. */
  readonly id: string;
  /** Identity of the whole journey, preserved across transfers. */
  readonly journeyId: string;
  /** The batch this passenger arrived with. */
  readonly batchId: string;
  /** When the passenger appears at {@link originFloorId} and starts waiting. */
  readonly arrivalTimeS: SimTime;
  readonly originFloorId: string;
  readonly originFloorIndex: number;
  readonly finalDestinationFloorId: string;
  readonly finalDestinationFloorIndex: number;
  /** At least one. More than one exactly when the journey crosses a transfer floor. */
  readonly legs: readonly TraceLeg[];
  /**
   * Hops on a declared non-lift connection, ascending by `beforeLegIndex`.
   *
   * **Absent — not `[]` — on a journey that uses none**, which is every journey in every building
   * that declares no `transportModes`. The field is omitted rather than emptied so that a trace
   * from such a building is the same object it was before this existed, and
   * `traffic/transportIdentity.test.ts` can hold the whole run to a bit-identical result.
   */
  readonly transportHops?: readonly TraceTransportHop[] | undefined;
  /** Body mass, kilograms, drawn from the `passengerMass` stream. */
  readonly massKg: number;
  /** Access credential, or `undefined` for an unbadged visitor. */
  readonly credentialGroup: CredentialGroup | undefined;
  readonly category: DirectionCategory;
  /** Floor whose population generated this trip. */
  readonly demandFloorId: string;
  /** Traffic profile that governed the rate, batch size and split behind this trip. */
  readonly profileId: string;
  /** Whether {@link arrivalTimeS} falls inside the template's measurement window. */
  readonly inReportWindow: boolean;
}

/**
 * A batch: the group that arrives together at one floor at one instant.
 *
 * Passengers arrive in groups, not singly (CLAUDE.md § modelling rules). A batch of four is
 * one hall call and four transfer times, not four hall calls — which is precisely why
 * batching changes loading and stop patterns rather than just relabelling the same demand.
 */
export interface ArrivalEvent {
  readonly id: string;
  readonly timeS: SimTime;
  readonly originFloorId: string;
  readonly originFloorIndex: number;
  /** The demand source that produced it, for attribution and debugging. */
  readonly sourceId: string;
  /** Never empty. */
  readonly passengers: readonly GeneratedPassenger[];
}

/**
 * A complete, replayable passenger trace.
 *
 * Carries its seed (CLAUDE.md invariant 5), so a stored record replays exactly:
 * `generateTrace({ ...config, streams: new StreamSet(BigInt(trace.seed)) })` reproduces it
 * byte for byte.
 */
export interface PassengerTrace {
  /** Master seed as a decimal string — a `bigint` does not survive `JSON.stringify`. */
  readonly seed: string;
  readonly buildingId: string;
  readonly template: ResolvedDemandTemplate;
  readonly durationS: number;
  readonly reportWindowStartS: number;
  readonly reportWindowEndS: number;
  /** Batches in `(time, generation sequence)` order. */
  readonly arrivals: readonly ArrivalEvent[];
  /** Every passenger, flattened, in the same order. */
  readonly passengers: readonly GeneratedPassenger[];
  readonly passengerCount: number;
  /** Passengers whose arrival falls in the measurement window. */
  readonly passengersInReportWindow: number;
  /** The demand sources the trace was drawn from, for attribution and validation. */
  readonly sources: readonly DemandSource[];
  /** Building-wide passengers per second at full template intensity. */
  readonly peakPassengersPerSecond: number;
  /** Analytic expectation `peakPassengersPerSecond * template.intensityIntegralS`. */
  readonly expectedPassengers: number;
  /** Non-fatal diagnostics: a populated floor with no demand, an entrance with no weight. */
  readonly warnings: readonly string[];
}

/* -------------------------------------------------------------------------- *
 * Generator configuration
 * -------------------------------------------------------------------------- */

/** Which point of a profile's `arrivalRatePctPop5min` range to run at. */
export const DEMAND_LEVELS = ['min', 'typical', 'max'] as const;

export type DemandLevel = (typeof DEMAND_LEVELS)[number];

/** How an interfloor destination floor is chosen among the candidates. */
export const INTERFLOOR_WEIGHTINGS = ['population', 'uniform'] as const;

export type InterfloorWeighting = (typeof INTERFLOOR_WEIGHTINGS)[number];

/**
 * How generated passengers acquire an access credential.
 *
 * `permitted-first` gives each passenger the first credential group, in declared zone order,
 * that may reach its final destination — deterministic, and consuming no random draw. A
 * *stochastic* credential mix would need a seventh named stream on `StreamSet`; adding one is
 * a deliberate act (see `random/streams.ts`), not something this module should do implicitly.
 */
export const CREDENTIAL_ASSIGNMENTS = ['none', 'permitted-first'] as const;

export type CredentialAssignment = (typeof CREDENTIAL_ASSIGNMENTS)[number];

/**
 * Explicit overrides for the geometry of whichever demand template is selected.
 *
 * An optimizer sampling {@link TRAFFIC_PARAMETERS} needs a way to inject a candidate without
 * editing `data/traffic-profiles.json` — the same role `DoorConfigOverrides` plays for
 * `DOOR_PARAMETERS` — and it must not have to know *which shape reads which field*, because
 * that is exactly the elevator-specific knowledge invariant 8 exists to keep out of the
 * optimizer. So every geometric knob of every shape lives in this one flat record and the
 * resolver applies the ones the selected shape reads; `activeWhen` in
 * {@link TRAFFIC_PARAMETERS} declares which those are, so a sampler can skip the inert ones.
 *
 * Precedence is `templateOverrides` > the `demandTemplates` record > {@link TRAFFIC_DEFAULTS}.
 *
 * ## Pending config surface
 *
 * `durationS` also has a data path (`demandTemplates[].durationMin`), and the constant
 * template's two discards have theirs (`discardFirstMin`, `discardLastMin`). `peakWindowS`
 * and `baselineFraction` have none: the record's `reportWindow` is a descriptive string
 * (`"peak-5min"`), not a number, and there is no baseline field at all. The config layer owes
 * two fields:
 *
 * ```ts
 * // config/schema.ts, demandTemplateSchema
 * reportWindowMin: z.number().positive().optional(),
 * baselineFraction: z.number().min(0).max(1).optional(),
 * ```
 *
 * Until they land, those two numbers come from here or from {@link TRAFFIC_DEFAULTS}. This
 * module owns neither `config/` nor `data/`, so the gap is recorded rather than papered over
 * — but it is a gap in *where the number may be stored*, not in whether the declared tunable
 * is honoured, which `parameters.test.ts` proves for every id.
 */
export interface DemandTemplateOverrides {
  /** Length of one replication, seconds. Read by both shapes. */
  readonly durationS?: number | undefined;
  /** How long demand holds at peak, which is also the reported window. `rise-and-fall` only. */
  readonly peakWindowS?: number | undefined;
  /** Intensity at both ends as a fraction of peak. `rise-and-fall` only. */
  readonly baselineFraction?: number | undefined;
  /** Warm-up discarded before measurement, seconds. `constant-iso` only. */
  readonly discardFirstS?: number | undefined;
  /** Cool-down discarded at the end, seconds. `constant-iso` only. */
  readonly discardLastS?: number | undefined;
  /**
   * How much of the authored mix arc to keep, `[0, 1]`. `lunch-two-way` only, default 1.
   *
   * `split(t) = mean + amplitude · (authored(t) − mean)`, so **1 is the authored arc and 0 is a
   * flat run at the period's own mean mix with the total demand unchanged**. Zero is not a
   * curiosity: `DECISIONS.md` § D162 condition 5 requires a flat-mix negative control at equal
   * total demand to be measured in the same run as any mix-varying result, and this is that
   * control, declared as a tunable rather than assembled as a fixture.
   *
   * At 0 the phases still *carry* the mix — every knot equal to the mean — rather than dropping it,
   * which is the difference between a control and a different experiment: dropping it would return
   * each floor to its own profile's split (85/5/10 on a standard office) and the control would
   * differ from the treatment in the mean mix as well as in its variation.
   */
  readonly mixAmplitude?: number | undefined;
}

/**
 * Which draw ordering the generator uses. docs/14 § 1.3.
 *
 * Not a tunable and not a knob an optimizer may sample: it names *which simulator* produced a
 * number, the way a file-format version names which writer produced a file.
 *
 * - `v1` — the ordering every figure in this repository was measured under. `drawBatchSize` draws
 *   from `arrivals`, so group size and arrival instants share a sequence.
 * - `v2` — group size draws from its own `batchSize` stream. The two become independent, which is
 *   what makes a group-size study readable at all: under `v1`, any change to the group-size curve
 *   — even one that preserves the mean — consumes a different number of draws from `arrivals` and
 *   shifts every subsequent arrival instant, so the two effects can never be told apart.
 *
 * `v1` is the default and is deleted only when the last figure depending on it has been re-derived
 * under `v2` **and** the re-derivation has been published as a comparison — not before.
 */
export type TrafficModelVersion = (typeof TRAFFIC_MODEL_VERSIONS)[number];

/**
 * Every draw ordering this build can run, as data — see {@link TrafficModelVersion}.
 *
 * A runtime list rather than only a type, because the version has to survive a round trip through
 * disk: `metrics/serialization.ts` validates a stored `RunRecord` against it and
 * `experiments/reports/persistence.ts` validates the envelope beside it. A version a reader cannot
 * name is a version a reader will silently drop, and a dropped version replays as `v1` — a
 * different trace at the same seed, which is exactly what CLAUDE.md invariant 5 forbids.
 */
export const TRAFFIC_MODEL_VERSIONS = ['v1', 'v2'] as const;

/** Everything {@link generateTrace} needs. Only `building`, `profiles` and `streams` are required. */
export interface TrafficConfig {
  /** The building, floors expanded and cross-references checked. */
  readonly building: ResolvedBuilding;
  /** The whole of `data/traffic-profiles.json`: profiles, templates and the mass distribution. */
  readonly profiles: TrafficProfiles;
  /**
   * This replication's streams. Arrival times come from `arrivals`, origins from `origins`,
   * destinations from `destinations`, mass from `passengerMass`. Batch sizes come from `arrivals`
   * under {@link trafficModel} `v1` and from `batchSize` under `v2`. `doorObstruction` and
   * `policyNoise` are never touched here, and `generator.test.ts` asserts it.
   */
  readonly streams: StreamSet;
  /**
   * Which draw ordering to use. Default `v1`, which is every figure this repository publishes.
   *
   * See {@link TrafficModelVersion}. This is a version, not a tunable: it is `null` in
   * `parameters.test.ts`'s map for the same reason `building` is.
   */
  readonly trafficModel?: TrafficModelVersion | undefined;
  /**
   * Demand shape. A {@link DemandTemplateId} is looked up in `profiles.demandTemplates`; a
   * {@link ResolvedDemandTemplate} is used as given. Defaults to `rise-and-fall`.
   */
  readonly template?: DemandTemplateId | ResolvedDemandTemplate | undefined;
  /**
   * Geometry overrides applied on top of the `demandTemplates` record — duration, peak hold,
   * baseline, ISO discards. Rejected when {@link template} is an already-resolved template,
   * which carries its geometry with it and would silently ignore them.
   */
  readonly templateOverrides?: DemandTemplateOverrides | undefined;
  /** Which point of each profile's rate range to use. Default `typical`. */
  readonly demandLevel?: DemandLevel | undefined;
  /**
   * Override every profile's arrival rate with one value, percent of population per 5 minutes.
   * For sweeping demand up to and past saturation; leave unset for the profile's own numbers.
   */
  readonly arrivalRatePctPop5min?: number | undefined;
  /**
   * Override every profile's directional split with one mix. Unset means each floor uses its
   * own profile's split, which is the normal case.
   *
   * This exists because the project's primary correctness oracle needs a demand pattern no
   * profile in `data/traffic-profiles.json` declares. docs/05-roadmap.md § Phase 2:
   * "Midtown Office under **pure up-peak** produces interval and handling capacity matching
   * the closed-form Barney/CIBSE RTT calculation within a few percent." Pure up-peak is
   * `{ incoming: 1, outgoing: 0, interfloor: 0 }` through a single entrance — the assumption
   * the closed form is derived under — and the shipped office profiles top out at 0.85
   * incoming because they describe a *real* morning peak rather than the idealized one the
   * formula scores. Both are wanted, so the idealization is a knob rather than a new profile:
   * it is the same kind of override as {@link arrivalRatePctPop5min}, and it keeps the
   * reference data honest about what real buildings do.
   *
   * The three shares are relative and are normalized to sum to 1, so an optimizer may sample
   * them independently in `[0, 1]`. At least one must be positive.
   */
  readonly directionalSplit?: DirectionalSplit | undefined;
  /**
   * Whether everyone in a batch shares a destination. Default `false`.
   *
   * A batch models arrival-time clustering — a revolving door, a train, a lift from the car
   * park — so its members are colleagues only by coincidence and each draws a destination
   * independently. Setting this to `true` models affiliated groups (a tour party, a family)
   * and materially reduces stop count, which is why it is a declared parameter rather than a
   * hardcoded assumption.
   */
  readonly batchSharesDestination?: boolean | undefined;
  /**
   * Relative likelihood of each entrance floor, by floor id. Defaults to uniform over every
   * floor flagged `isEntrance`. Keys must be declared entrances.
   *
   * Declared as `traffic.entranceWeight` — one tunable supplied once per entrance, the way
   * `car.doorOpenS` is one tunable supplied once per car. `{ G: 1, P1: 0 }` on Midtown Office
   * is the single-lobby condition the closed-form RTT calculation assumes.
   */
  readonly entranceWeights?: Readonly<Record<string, number>> | undefined;
  /** How interfloor destinations are chosen. Default `population`. */
  readonly interfloorWeighting?: InterfloorWeighting | undefined;
  /** Default `permitted-first`. */
  readonly credentialAssignment?: CredentialAssignment | undefined;
  /**
   * Drop a journey needing more than this many elevator legs. Default 6.
   *
   * Three legs cover any trip from a street entrance, which is the bound
   * `config/buildingConnectivity.test.ts` holds the shipped buildings to. Interfloor trips in
   * a stacked-shuttle supertall need more: in Vertical City an occupant of floor 40 (zone 4,
   * anchored to the *upper* sky-lobby level 27) reaching floor 34 (zone 3, anchored to the
   * *lower* level 26) must come all the way down and go back up — five legs, and a genuine
   * property of that geometry rather than a bug. Six leaves headroom above the worst real
   * case without admitting nonsense.
   */
  readonly maxLegs?: number | undefined;
  /** Prefix for generated passenger ids. Default `p`. */
  readonly idPrefix?: string | undefined;
  /** Prefix for generated journey ids. Default `j`. */
  readonly journeyIdPrefix?: string | undefined;
  /** Prefix for generated batch ids. Default `b`. */
  readonly batchIdPrefix?: string | undefined;
}

/**
 * Runtime defaults, in one place so {@link TRAFFIC_PARAMETERS} can quote them rather than
 * repeat them — a declared schema that disagrees with the resolver is worse than none.
 */
export const TRAFFIC_DEFAULTS = Object.freeze({
  /**
   * The draw ordering every published figure was measured under. See {@link TrafficModelVersion}.
   *
   * A default that is not `'v1'` re-derives 981 pinned estimates and both identity digests in one
   * edit, which is precisely the failure docs/14 § 0 exists to prevent.
   */
  trafficModel: 'v1',
  templateId: 'rise-and-fall',
  demandLevel: 'typical',
  batchSharesDestination: false,
  interfloorWeighting: 'population',
  credentialAssignment: 'permitted-first',
  maxLegs: 6,
  /** CIBSE rise-and-fall: ramp up, hold the peak 5 minutes, ramp down. Seconds. */
  riseAndFallDurationS: 1800,
  /** The reported window, and the length of the hold at peak. Seconds. */
  peakWindowS: 300,
  /** Intensity at t=0 and t=duration, as a fraction of peak. 0 is the CIBSE shape. */
  baselineFraction: 0,
  /** ISO 8100-32 constant demand. Seconds. */
  constantDurationS: 7200,
  constantDiscardFirstS: 900,
  constantDiscardLastS: 300,
  /**
   * The lunch two-way period's length, seconds.
   *
   * **Inherited from {@link riseAndFallDurationS} rather than measured**, and that is stated
   * plainly rather than dressed up: no CIBSE Guide D or BCO page giving a lunch-*period* length in
   * minutes was available when this was written, so the template borrows the shipped terminating
   * run's own horizon and adds no uncited duration of its own. The cited part of `lunch-two-way`
   * is its **mix**, not its clock. See `data/traffic-profiles.json`.
   */
  lunchTwoWayDurationS: 1800,
  /** Full authored arc. See {@link DemandTemplateOverrides.mixAmplitude}. */
  mixAmplitude: 1,
} as const satisfies {
  readonly trafficModel: TrafficModelVersion;
  readonly templateId: DemandTemplateId;
  readonly demandLevel: DemandLevel;
  readonly batchSharesDestination: boolean;
  readonly interfloorWeighting: InterfloorWeighting;
  readonly credentialAssignment: CredentialAssignment;
  readonly maxLegs: number;
  readonly riseAndFallDurationS: number;
  readonly peakWindowS: number;
  readonly baselineFraction: number;
  readonly constantDurationS: number;
  readonly constantDiscardFirstS: number;
  readonly constantDiscardLastS: number;
  readonly lunchTwoWayDurationS: number;
  readonly mixAmplitude: number;
});

/* -------------------------------------------------------------------------- *
 * Parameter schema (CLAUDE.md invariant 8)
 * -------------------------------------------------------------------------- */

export type TrafficParameterType = 'continuous' | 'integer' | 'categorical' | 'boolean';

/**
 * A self-describing tunable, in the shape docs/06-parameterization-and-tuning.md § The
 * parameter schema defines and `physics/doors` already uses.
 *
 * The point is that a generic optimizer can sample a valid demand configuration knowing
 * nothing about elevators: `type` plus `range`/`values` bound the search, `default` gives a
 * starting point, and `activeWhen` keeps it from tuning a knob that is inert.
 */
export interface TrafficParameterSpec {
  /** Dotted path of the value, e.g. `traffic.demandLevel`. */
  readonly id: string;
  readonly type: TrafficParameterType;
  /** Inclusive `[min, max]`. Present for `continuous` and `integer`. */
  readonly range?: readonly [number, number] | undefined;
  readonly scale?: 'linear' | 'log' | undefined;
  /** Admissible values. Present for `categorical`. */
  readonly values?: readonly string[] | undefined;
  /**
   * The value the module runs at when this parameter is not sampled, and the natural starting
   * point for a search.
   *
   * `null` means the parameter has **no default value**: leaving it unset is meaningful, and
   * the effective value then comes from the data — a floor's traffic profile — rather than
   * from this schema. An optimizer must read `null` as "omit the key", never as `0`. This is
   * the one way this spec diverges from `DoorParameterSpec`, and it is the difference between
   * a declared default that is true and one that is a lie: `traffic.arrivalRatePctPop5min`
   * unset runs Garden Apartments at the residential profile's 5%/5 min, while any *number*
   * declared here would be imposed on every profile in every building.
   */
  readonly default: number | string | boolean | null;
  /** SI unit, or omitted for a dimensionless quantity. */
  readonly unit?: string | undefined;
  readonly description: string;
  /** Parameter id to the values that make this parameter live. */
  readonly activeWhen?: Readonly<Record<string, readonly string[]>> | undefined;
  /**
   * For a parameter that is declared once but set per member of a collection, the collection
   * its keys range over. `traffic.entranceWeight` is the only one: it is declared once and
   * supplied once per entrance floor, exactly as `DOOR_PARAMETERS` declares `car.doorOpenS`
   * once for however many cars a building has.
   */
  readonly perMemberOf?: string | undefined;
}

/**
 * Every demand tunable this module honours.
 *
 * Two entries carry `default: null`, meaning "unset, and unset is meaningful".
 * `traffic.arrivalRatePctPop5min` unset means "use the profile's own number for the selected
 * `demandLevel`", which is not a number this schema can name — naming one would silently run
 * every building at it. Its range spans the union of the shipped profiles' ranges
 * (residential 3% to prestige office 17%) with headroom above, because pushing demand past
 * handling capacity to exercise saturation detection is a legitimate experiment. The three
 * `traffic.directionalSplit.*` entries are the same: unset means each floor keeps its own
 * profile's mix, and they are set together or not at all.
 *
 * What is deliberately *not* here: `idPrefix`, `journeyIdPrefix` and `batchIdPrefix` (labels
 * on the output, which cannot move a metric) and `building`, `profiles` and `streams` (the
 * inputs a configuration is *of*, not knobs within one). `parameters.test.ts` holds that
 * boundary with a table the compiler checks against `keyof TrafficConfig`, so a knob added to
 * the config surface without a row here fails to compile.
 */
export const TRAFFIC_PARAMETERS: readonly TrafficParameterSpec[] = [
  {
    id: 'traffic.template',
    type: 'categorical',
    values: [...DEMAND_TEMPLATE_IDS],
    default: TRAFFIC_DEFAULTS.templateId,
    description:
      'Demand shape. rise-and-fall is a 30 min terminating run reported over its peak 5 minutes and is the only one that supports confidence intervals across replications; constant-iso is a single 120 min run for cross-checking.',
  },
  {
    id: 'traffic.demandLevel',
    type: 'categorical',
    values: [...DEMAND_LEVELS],
    default: TRAFFIC_DEFAULTS.demandLevel,
    description:
      "Which point of the profile's arrivalRatePctPop5min range to run at. Ignored when traffic.arrivalRatePctPop5min is set.",
  },
  {
    id: 'traffic.arrivalRatePctPop5min',
    type: 'continuous',
    range: [0, 25],
    scale: 'linear',
    default: null,
    unit: '%/5min',
    description:
      "Explicit arrival rate as a percentage of building population per 5 minutes, overriding every profile's own range. Unset (the default) means use the profile, which is the only honest default: 12 is an office number and would run a residential building at 2.4x its demand.",
  },
  {
    id: 'traffic.directionalSplit.incoming',
    type: 'continuous',
    range: [0, 1],
    scale: 'linear',
    default: null,
    description:
      "Share of every floor's demand travelling from an entrance to that floor, overriding every profile's own split. The three shares are relative and are normalized to sum to 1; set them together or leave all three unset to use each floor's profile. 1/0/0 is the pure up-peak the closed-form RTT oracle is defined under.",
  },
  {
    id: 'traffic.directionalSplit.outgoing',
    type: 'continuous',
    range: [0, 1],
    scale: 'linear',
    default: null,
    description:
      "Share of every floor's demand travelling from that floor to an entrance, overriding every profile's own split. Normalized with the other two shares.",
  },
  {
    id: 'traffic.directionalSplit.interfloor',
    type: 'continuous',
    range: [0, 1],
    scale: 'linear',
    default: null,
    description:
      "Share of every floor's demand travelling to another populated floor, overriding every profile's own split. Normalized with the other two shares.",
  },
  {
    id: 'traffic.entranceWeight',
    type: 'continuous',
    range: [0, 1],
    scale: 'linear',
    default: 1,
    perMemberOf: 'building.entranceFloors',
    description:
      'Relative likelihood of one entrance floor receiving an incoming batch, supplied once per floor flagged isEntrance and normalized across them. Declared once for however many entrances a building has, the way car.doorOpenS is declared once for however many cars it has. Because the weights are relative, [0, 1] per entrance spans every distinct mix; all-equal (the default) is uniform, and a single 1 with the rest 0 concentrates the whole up-peak on one lobby.',
  },
  {
    id: 'traffic.batchSharesDestination',
    type: 'boolean',
    default: TRAFFIC_DEFAULTS.batchSharesDestination,
    description:
      'Whether everyone in a batch travels to the same floor. False models arrival-time clustering (a revolving door); true models an affiliated group and materially reduces stop count.',
  },
  {
    id: 'traffic.interfloorWeighting',
    type: 'categorical',
    values: [...INTERFLOOR_WEIGHTINGS],
    default: TRAFFIC_DEFAULTS.interfloorWeighting,
    description:
      'How an interfloor destination is chosen: in proportion to the destination floor population, or uniformly across candidate floors.',
  },
  {
    id: 'traffic.credentialAssignment',
    type: 'categorical',
    values: [...CREDENTIAL_ASSIGNMENTS],
    default: TRAFFIC_DEFAULTS.credentialAssignment,
    description:
      'How a passenger bound for an access-restricted floor acquires a credential. permitted-first assigns the first group in declared zone order; none leaves every passenger unbadged.',
  },
  {
    id: 'traffic.maxLegs',
    type: 'integer',
    range: [1, 8],
    scale: 'linear',
    default: TRAFFIC_DEFAULTS.maxLegs,
    unit: 'legs',
    description:
      'Drop a journey needing more elevator legs than this, redistributing its demand within its directional share. Three covers any trip from a street entrance; a zone-to-zone interfloor trip in a stacked-shuttle supertall can legitimately need five.',
  },
  {
    id: 'traffic.riseAndFall.durationS',
    type: 'continuous',
    range: [600, 5400],
    scale: 'linear',
    default: TRAFFIC_DEFAULTS.riseAndFallDurationS,
    unit: 's',
    description: 'Length of one rise-and-fall replication. CIBSE uses 30 minutes.',
    activeWhen: { 'traffic.template': ['rise-and-fall'] },
  },
  {
    id: 'traffic.riseAndFall.peakWindowS',
    type: 'continuous',
    range: [60, 900],
    scale: 'linear',
    default: TRAFFIC_DEFAULTS.peakWindowS,
    unit: 's',
    description:
      'How long demand holds at the peak, which is also the reported window. CIBSE reports the peak 5 minutes.',
    activeWhen: { 'traffic.template': ['rise-and-fall'] },
  },
  {
    id: 'traffic.riseAndFall.baselineFraction',
    type: 'continuous',
    range: [0, 1],
    scale: 'linear',
    default: TRAFFIC_DEFAULTS.baselineFraction,
    description:
      'Intensity at the start and end of the run as a fraction of peak. 0 is the CIBSE shape: demand rises from nothing and returns to it.',
    activeWhen: { 'traffic.template': ['rise-and-fall'] },
  },
  {
    id: 'traffic.constant.durationS',
    type: 'continuous',
    range: [1800, 14400],
    scale: 'linear',
    default: TRAFFIC_DEFAULTS.constantDurationS,
    unit: 's',
    description: 'Length of one constant-demand run. ISO 8100-32 uses 120 minutes.',
    activeWhen: { 'traffic.template': ['constant-iso'] },
  },
  {
    id: 'traffic.constant.discardFirstS',
    type: 'continuous',
    range: [0, 3600],
    scale: 'linear',
    default: TRAFFIC_DEFAULTS.constantDiscardFirstS,
    unit: 's',
    description: 'Warm-up discarded before measurement begins. ISO 8100-32 discards 15 minutes.',
    activeWhen: { 'traffic.template': ['constant-iso'] },
  },
  {
    id: 'traffic.constant.discardLastS',
    type: 'continuous',
    range: [0, 1800],
    scale: 'linear',
    default: TRAFFIC_DEFAULTS.constantDiscardLastS,
    unit: 's',
    description: 'Cool-down discarded at the end of the run. ISO 8100-32 discards 5 minutes.',
    activeWhen: { 'traffic.template': ['constant-iso'] },
  },
  {
    id: 'traffic.lunchTwoWay.durationS',
    type: 'continuous',
    range: [600, 5400],
    scale: 'linear',
    default: TRAFFIC_DEFAULTS.lunchTwoWayDurationS,
    unit: 's',
    description:
      "Length of one lunch two-way period. Inherited from the CIBSE rise-and-fall run length rather than measured: the cited part of this template is its directional mix, not its clock.",
    activeWhen: { 'traffic.template': ['lunch-two-way'] },
  },
  {
    id: 'traffic.lunchTwoWay.mixAmplitude',
    type: 'continuous',
    range: [0, 1],
    scale: 'linear',
    default: TRAFFIC_DEFAULTS.mixAmplitude,
    description:
      "How much of the authored mix arc to keep. 1 is the arc as authored — outgoing-dominant early, incoming-dominant late; 0 collapses it to a flat run at the period's own mean mix with the total demand unchanged, which is the negative control any mix-varying result must be measured against.",
    activeWhen: { 'traffic.template': ['lunch-two-way'] },
  },
];
