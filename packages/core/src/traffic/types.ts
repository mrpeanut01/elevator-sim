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
// A *value* import, and the narrow path rather than the barrel: `TRAFFIC_PARAMETERS` declares the
// mass families an optimizer may sample, and a declared list that could drift from the sampler's
// own is worse than no declaration. `model/` imports nothing from `traffic/`, so this is a leaf.
import { SUPPORTED_MASS_DISTRIBUTIONS } from '../model/passenger.js';
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
 *
 * **`evening-egress` and `office-down-peak` are two records for what was once one** (`DECISIONS.md`
 * § D263). `evening-egress` is the **venue** case — a ballroom emptying, a cinema turning out — and
 * its step is the point of it. `office-down-peak` is the **office end of day**, a design case in its
 * own right rather than an egress under another name, and its intensity geometry is
 * `rise-and-fall`'s. Splitting them is what let each one carry the hour that is true of it: a
 * building empties at 17:30 and a function turns out at 22:30, and § D244 gives a record exactly one
 * hour. Since the geometry is shared, an `office-down-peak` run draws the **same passengers** as a
 * `rise-and-fall` run at the same seed — declared in the record's own `$comment` and asserted by
 * `traffic/templateAdditionIdentity.test.ts`, because what that record adds is the hour and the
 * period's identity, not a shape.
 */
export const DEMAND_TEMPLATE_IDS = [
  'rise-and-fall',
  'constant-iso',
  'lunch-two-way',
  'shift-change',
  'evening-egress',
  'office-down-peak',
] as const;

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
 * Which part of a template's period a run covers — `DECISIONS.md` § D285, the field
 * [§ D275](DECISIONS.md) named and deliberately left unbuilt.
 *
 * **A new field, never a reinterpretation of {@link ResolvedDemandTemplate.durationS}.** That is the
 * whole of why it exists: `durationS` travels in every stored `RunConfig` and every leaderboard
 * submission, so giving it a second meaning would leave every board still verifying and every old
 * row a claim about a different run. `durationS` keeps meaning *how long the run was*; this says
 * *where in the day the run was cut from*.
 *
 * Both ends are seconds into the template's **own** period, `0` being the instant the record starts
 * — 08:00 for `office-day`. Half-open `[startS, endS)`, matching {@link inReportWindow} and the
 * arrival bound in `poissonBatch.ts`.
 */
export interface ResolvedDemandWindow {
  /** Seconds into the template's period at which this run's demand begins. */
  readonly startS: number;
  /** Seconds into the template's period at which this run's demand stops. Above {@link startS}. */
  readonly endS: number;
  /**
   * The period the window was cut from, seconds — the record's own `durationMin × 60`.
   *
   * Carried rather than left derivable so that a trace is self-describing: a reader holding one
   * knows it is half an hour *of a ten-hour day* without re-resolving the record it came from. It is
   * also what a presentation layer needs to draw the window in the day it belongs to.
   */
  readonly periodS: number;
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
  /**
   * Seconds after local midnight at which `t = 0` of this run falls — **absent when the template
   * has no hour**. `DECISIONS.md` § D244.
   *
   * The runtime view of `DemandTemplate.startOfDayMin`, converted at resolution the way
   * `durationMin` becomes {@link durationS}. `constant-iso` declares none, and absent means *"this
   * template has no hour"* rather than *"its hour is midnight"* — omitted, not `undefined`-valued,
   * for the reason {@link meanDirectionalSplit} is.
   *
   * ## Invisible to the simulation, and that is the load-bearing property
   *
   * `intensityAt`, `splitAt` and `integratedIntensityS` are the whole of this module's evaluation
   * surface, and **none of them reads this field**. A run's arrivals, batches, destinations, masses
   * and metrics are therefore exactly what they were before the field existed, at every seed and
   * every template — proved by a run in `traffic/dayStartIdentity.test.ts` rather than argued here,
   * and the same property is what keeps `sim/oracle.test.ts`'s closed-form comparison green by
   * construction.
   *
   * It travels with the template rather than beside it because a template *is* the period: the
   * hour and the shape go stale together or not at all. {@link shiftTemplatePeak} carries it
   * unchanged — a peak shift moves the busy part *within* the period, and a period that started at
   * 08:30 still started at 08:30 when its peak ran ten minutes late.
   *
   * **Not a tunable, deliberately.** It is absent from {@link TRAFFIC_PARAMETERS} and from
   * {@link DemandTemplateOverrides}: an optimizer sampling *what hour it is* would add a search
   * dimension that cannot move a cost, which is the `destination-eta` `rideTime: 0` defect
   * (`DECISIONS.md` § D112) with a different key name.
   */
  readonly startOfDayS?: number | undefined;
  /**
   * `true` when {@link phases} was **authored as data** rather than computed from a named shape —
   * `data/traffic-profiles.json → demandTemplates[].phases`. `DECISIONS.md` § D273.
   *
   * **Absent, never `false`, on all five templates that shipped before it.** The omitted-not-
   * `undefined` discipline {@link startOfDayS} keeps, for a sharper reason: this key is inside
   * every `PassengerTrace` and therefore inside every `SimulationResult`, so a `false` on the
   * shipped shapes would move `traffic/transportIdentity.test.ts`'s fifteen pinned digests to record
   * that a template is *not* something.
   *
   * ## It is a marker, and two refusals are what read it
   *
   * A shape builder's geometry can be refitted, because two numbers generate it. An authored list
   * cannot, and the two knobs that assume it can are refused by name rather than left to do
   * something plausible:
   *
   * - **`templateOverrides.durationS`** would rescale a sixteen-hour day into a fifteen-minute one
   *   and leave it with a five-minute lunch. Selecting *which part of a day to run* is a different
   *   question and needs a different field; reinterpreting `durationS` would change what a stored
   *   leaderboard score means, since `durationS` travels in every submission.
   * - **{@link DayVariationConfig.peakShiftS}** moves every interior knot by one amount, and
   *   {@link maxPeakShiftS} takes its limit from the **outermost** one. On a day the first boundary
   *   is minutes in, so the limit collapses to those minutes and almost every declared shift is
   *   refused with a message about a phase boundary the author never thought of as the peak.
   *
   * Both refusals are `traffic/demandTemplate.ts`'s, and both are stated in the same shape as the
   * existing `constant-iso` one: a template that cannot absorb a knob says so by name instead of
   * absorbing it into something that looks like it worked.
   *
   * **The first of the two is now answered rather than only refused.** {@link window} is the field
   * § D275 named, and the refusal message names it back: `durationS` still cannot rescale a
   * schedule, and `windowStartS`/`windowEndS` selects a part of one instead.
   */
  readonly authoredPhaseList?: true | undefined;
  /**
   * Which part of its own period this template was cut to — **absent when the run covers the whole
   * of it**, which is every run that predates `DECISIONS.md` § D285.
   *
   * Omitted rather than `{ startS: 0, endS: durationS }` on an unwindowed template, keeping the
   * discipline {@link startOfDayS} and {@link authoredPhaseList} set for the same reason each of
   * them gives: this key sits inside every `PassengerTrace` and therefore inside every
   * `SimulationResult`, and `traffic/transportIdentity.test.ts` hashes a key's *presence*. A window
   * spelled out on every unwindowed run would move fifteen pinned digests to record that a run is
   * not a slice.
   *
   * ## What the other fields mean once this is present
   *
   * The template is **re-based**: {@link durationS} is the window's own length, {@link phases} are
   * clipped and shifted so `t = 0` is the window's start, {@link startOfDayS} is the *window's*
   * hour rather than the record's, and {@link peakIntensity}, {@link intensityIntegralS} and
   * {@link meanDirectionalSplit} are derived over the window. So every downstream reader — the
   * kernel's deadline, the report window, the phase strip — sees a period that begins at zero, and
   * nothing had to learn what a window is. This field is what says which period it was.
   *
   * {@link reportWindowStartS} and {@link reportWindowEndS} become the whole of the window, for the
   * reason § D273 gives about a phase list reporting over the whole of itself: five minutes cut out
   * of a lunch peak reports one instant of it and calls it the period.
   */
  readonly window?: ResolvedDemandWindow | undefined;
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
  /**
   * Seconds after local midnight at which `arrivalTimeS === 0` falls — **present only when the
   * template declares an hour**. `DECISIONS.md` § D244.
   *
   * Copied from {@link ResolvedDemandTemplate.startOfDayS}, and beside {@link durationS} for the
   * reason {@link reportWindowStartS} is beside it: a reader with the trace in hand should not have
   * to reach into `template` to learn when the run is and how long it lasts. The template remains
   * the single authority — the copy is made in one place, at the same moment `durationS` is, so the
   * two cannot disagree.
   *
   * Spread-or-omit, never `?? 0`: a trace under `constant-iso`, which has no hour, must be the
   * object it was before templates could carry one, and `structuralDigestOfResult` hashes a key's
   * presence as well as its value.
   *
   * **Nothing downstream of the generator reads it to decide anything.** It is a label on the run,
   * like {@link buildingId}; adding it moved no arrival, no leg and no metric, which
   * `traffic/dayStartIdentity.test.ts` holds byte for byte.
   */
  readonly startOfDayS?: number;
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
  /**
   * The day this trace turned out to be — **present only when the run asked for one**
   * (docs/14 § 2.3).
   *
   * Absent, not `{ demandFactor: 1, peakShiftS: 0 }`, when the run declared no
   * {@link DayVariationConfig}: a run that did not ask for a particular day *is* the run that
   * predates the feature, and `identity.test-helper.ts`'s structural digest hashes a key's
   * presence. The same reasoning `SimulationResult.trafficModel` records for `v1`.
   *
   * Reported rather than re-derivable by eye: {@link peakPassengersPerSecond} above already has
   * the multiplier in it, so a reader comparing two traces needs this to know whether the
   * difference was the building or the day.
   */
  readonly dayVariation?: ResolvedDayVariation;
  /** Non-fatal diagnostics: a populated floor with no demand, an entrance with no weight. */
  readonly warnings: readonly string[];
}

/* -------------------------------------------------------------------------- *
 * Generator configuration
 * -------------------------------------------------------------------------- */

/**
 * Batch-size distributions `drawBatchSize` knows how to sample. docs/14 § 2.2.
 *
 * All three are distributions over the integers `{1, 2, 3, ...}` — a batch contains at least one
 * passenger — and **all three consume exactly one draw per call, for every parameter**. That is
 * not an implementation detail: `DECISIONS.md` § D203 records that a sampler whose draw count
 * depends on its parameters desynchronizes common random numbers between two configurations that
 * differ in it, and that the strong form of the cross-source coupling `trafficModel: 'v2'` exists
 * to remove *returns* the moment one appears. Keeping the property is what makes these families
 * usable under `v1` as well as `v2`; a rejection loop or a Knuth-style Poisson sampler would not
 * be, and would have had to be gated behind the flag instead.
 *
 * | Family | Shape | Reads as |
 * |---|---|---|
 * | `geometric` | mean | the curve every published figure was measured under, unchanged |
 * | `zeroTruncatedPoisson` | mean | tighter clustering around the mean |
 * | `explicit` | a weight vector over sizes 1..n | authored — "this hotel arrives in fours" |
 *
 * Lives here rather than in `poissonBatch.ts` so {@link TRAFFIC_PARAMETERS} can declare the same
 * list the sampler dispatches on: a schema whose `values` could drift from the code is worse than
 * no schema, and `poissonBatch.ts` already imports this module for `TrafficError`.
 */
export const SUPPORTED_BATCH_DISTRIBUTIONS = [
  'geometric',
  'zeroTruncatedPoisson',
  'explicit',
] as const;

/**
 * A group-size curve, as either reference data or a run-level override supplies it.
 *
 * `TrafficProfile.batchSize` (a `BatchSizeConfig`, which always carries a `mean`) is assignable
 * to this; so is a run override that names only a weight vector, because `explicit` **derives**
 * its mean rather than carrying one. `meanBatchSizeOf` is the single place that resolves the
 * difference, and it is the number `batchesPerSecond` divides by — see docs/14 § 2.2's rate-
 * coupling warning, which is the way this feature would otherwise change total demand silently.
 */
export interface BatchSizeCurve {
  /** One of {@link SUPPORTED_BATCH_DISTRIBUTIONS}. A string, so an unknown name fails at the draw. */
  readonly distribution: string;
  /** Mean group size, at least 1. Required by every family except `explicit`, which derives it. */
  readonly mean?: number | undefined;
  /** Relative likelihood of group sizes `1..n`. `explicit` only; normalized when sampled. */
  readonly weights?: readonly number[] | undefined;
}

/**
 * A body-mass distribution, as a run supplies it. docs/14 § 2.1.
 *
 * Mass was already a distribution (`drawMass`, `profiles.passengerMass`) — the modelling rule was
 * met. What this adds is **control**: the shape was fixed in reference data and could not be
 * varied per building or per run.
 *
 * **Both truncation bounds are required, and that is the one place this type is stricter than the
 * data it overrides.** `PassengerMassConfig.maxKg` is optional and every shipped profile omits it,
 * which `drawMass` reads as `+Infinity`; an untruncated normal eventually draws a negative mass,
 * and a load sensor reading a negative passenger surfaces three layers away as a strange capacity
 * result rather than as an error. A caller reaching for this knob is asking for a different
 * population, so it is exactly the moment to make them say where it stops.
 *
 * Assignable to `PassengerMassConfig`, so the resolved value can be handed straight to the
 * samplers in `traffic/generator.ts` and `model/passenger.ts` without a second shape.
 */
export interface PassengerMassOverride {
  /** `normal` or `lognormal`. A string, so an unknown name fails at the draw rather than silently. */
  readonly distribution: string;
  readonly meanKg: number;
  readonly stdDevKg: number;
  /** Lower truncation, kilograms. Required. */
  readonly minKg: number;
  /** Upper truncation, kilograms. Required — see the type docstring. */
  readonly maxKg: number;
}

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
 * A run's override of `data/traffic-profiles.json`'s `credentialGap` block.
 *
 * One field, and the block exists rather than a bare number so that the config surface and the
 * reference file have the same shape — the property that stops the two drifting into two
 * different names for one quantity. See {@link TrafficConfig.credentialGap}.
 */
export interface CredentialGapOverride {
  /** Share, `0..1`. See `config/types.ts` § `CredentialGapConfig`. */
  readonly wrongZoneShare: number;
}

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
  /**
   * How long demand holds at peak. `rise-and-fall` and `shift-change`.
   *
   * On `rise-and-fall` it is also the reported window; on `shift-change` it is the length of *each*
   * of the two holds and the report window is the whole run. Shared rather than duplicated under a
   * second name because it means the same thing on both shapes, and a second name for one quantity
   * is how a search space grows a dimension nobody meant to add.
   */
  readonly peakWindowS?: number | undefined;
  /**
   * Intensity at both ends as a fraction of peak. `rise-and-fall` and `evening-egress`.
   *
   * On `rise-and-fall` it is both ends of the ramp; on `evening-egress` it is the trickle before
   * the doors open and the level the decay returns to.
   */
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
  /**
   * Intensity between the two peaks as a fraction of peak, `(0, 1)`. `shift-change` only.
   *
   * The template's defining number. Zero is refused rather than clamped: it would make the shape
   * two separate rise-and-falls with a dead period between them, and the fact a shift change turns
   * on is that the building is still occupied and still being served while it happens.
   */
  readonly troughFraction?: number | undefined;
  /** Seconds from the baseline to full flow. `evening-egress` only — the step that makes it one. */
  readonly stepS?: number | undefined;
  /** Seconds of sustained full flow before the decay begins. `evening-egress` only. */
  readonly holdS?: number | undefined;
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
   * Demand shape. An **id** is looked up in `profiles.demandTemplates`; a
   * {@link ResolvedDemandTemplate} is used as given. Defaults to `rise-and-fall`.
   *
   * `string` rather than {@link DemandTemplateId} since § D274. The lookup was always against the
   * loaded catalogue first, so the union has always been the *fallback* list — the shapes this
   * module can build when no record answers — and since § D273 a record can author its own phases
   * and answer to an id no union could contain. Validate the string against the records you loaded;
   * `resolveDemandTemplate` throws by name for one that answers to neither.
   */
  readonly template?: string | ResolvedDemandTemplate | undefined;
  /**
   * Geometry overrides applied on top of the `demandTemplates` record — duration, peak hold,
   * baseline, ISO discards. Rejected when {@link template} is an already-resolved template,
   * which carries its geometry with it and would silently ignore them.
   */
  readonly templateOverrides?: DemandTemplateOverrides | undefined;
  /**
   * Run only `[windowStartS, windowEndS)` of the selected template's period. `DECISIONS.md` § D285.
   *
   * Declared as a pair of plain seconds rather than as a nested object because that is the shape
   * § D275 named it in, and because the two are validated against each other and against the
   * template's own length in one place. Both or neither: one alone is refused by name, the way a
   * phase declaring `startSplit` without `endSplit` is.
   *
   * **Not a {@link DemandTemplateOverrides} member, and the distinction is the point.** An override
   * *refits the template's geometry* — a 900 s `rise-and-fall` is a shorter ramp around the same
   * hold. A window leaves the geometry exactly as authored and selects part of it, which is why it
   * is the answer to the question `templateOverrides.durationS` is refused for on a phase list
   * (§ D275): rescaling a ten-hour day into fifteen minutes gives a fifteen-minute day with a
   * five-minute lunch, and running 12:15–12:45 of it gives the lunch.
   *
   * ## The day is drawn first and then cut, and that is what makes the window a *view*
   *
   * The trace is generated over the template's **whole** period exactly as it was before this field
   * existed — same streams, same draws, same order — and only then filtered to the window and
   * re-based. So the passengers of a 08:30–09:00 run are *the same records*, with the same ids,
   * masses, destinations and credentials, as the 08:30–09:00 passengers of the whole day at the
   * same seed. Two consequences that are the reason for the extra work:
   *
   * 1. Common random numbers survive a window change (CLAUDE.md invariant 2). Two windows of one
   *    seed are two parts of one day rather than two unrelated draws, so a morning-versus-evening
   *    comparison is paired on the day.
   * 2. The day a player *runs* today and the day a player would *look at* under a continuously
   *    simulated schedule contain the same demand, so moving the window from generation to
   *    presentation does not change which crowd the window names.
   *
   * Absent — never `0`/`durationS` — when the run covers the whole period; `traffic/windowIdentity.test.ts`
   * holds an unwindowed run byte-identical to the run before the field existed.
   */
  readonly windowStartS?: number | undefined;
  /** End of the run's part of the period, seconds, exclusive. See {@link windowStartS}. */
  readonly windowEndS?: number | undefined;
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
   * Override every profile's group-size curve with one curve. docs/14 § 2.2.
   *
   * Unset means each floor uses its own profile's `batchSize`, which is the normal case and the
   * one every published figure was measured under. The same kind of override as
   * {@link arrivalRatePctPop5min}, and for the same reason: a study of group *shape* wants to hold
   * the building fixed and move one curve, not to edit reference data per arm.
   *
   * **The mean is what `batchesPerSecond` divides by**, so a curve with a different mean is also a
   * different batch arrival process at the same passenger rate — bigger groups mean fewer, larger
   * batches. Two curves sharing a mean share the batch process exactly, which is what makes shape
   * separable from rate.
   */
  readonly batchSize?: BatchSizeCurve | undefined;
  /**
   * Override the reference data's body-mass distribution. docs/14 § 2.1.
   *
   * Unset means `profiles.passengerMass`, byte for byte. Set, it replaces the whole block — family,
   * mean, spread and **both** truncation bounds, which are required rather than optional; see
   * {@link PassengerMassOverride}.
   *
   * Mass is drawn from its own stream in final trace order, so moving this changes *what the cars
   * can do with the crowd* and not *which crowd turns up*: the arrival instants, the group sizes
   * and the planned legs are untouched, and `traffic/varianceControls.test.ts` asserts that
   * alongside the change it does make.
   */
  readonly passengerMass?: PassengerMassOverride | undefined;
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
   * Override `data/traffic-profiles.json`'s `credentialGap` block. docs/14 § 3.4.
   *
   * Unset means *the data decides*, which is the only honest default: the shipped share is a
   * declared, uncited assumption with its reasoning attached, and a second value invented here
   * would be a second source of truth for it. `{ wrongZoneShare: 0 }` is the control arm — every
   * rider holds a credential for wherever they are going, which is what the model did before the
   * gap existed and what every figure measured under `credentialAssignment: 'permitted-first'`
   * and no gap was measured under.
   *
   * Consumed only where a building declares `accessZones`; a building that declares none produces
   * a byte-identical trace at every value of it.
   */
  readonly credentialGap?: CredentialGapOverride | undefined;
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
  /**
   * Make this run a *particular day* rather than the average one. docs/14 § 2.3.
   *
   * Unset means what every published figure was measured under: a template is deterministic given
   * its seed, and Tuesday is a copy of Monday. See {@link DayVariationConfig}.
   */
  readonly dayVariation?: DayVariationConfig | undefined;
}

/* -------------------------------------------------------------------------- *
 * Inter-day variability (docs/14 § 2.3)
 * -------------------------------------------------------------------------- */

/**
 * How much one day may differ from the average one: a bounded multiplier on total demand and a
 * bounded shift on when the peak happens, both drawn once per run from the `dayVariation` stream.
 *
 * ## What this is for, and what it deliberately is not
 *
 * It answers one question: *is this dispatcher robust to a 15 % heavier Monday, or is its win an
 * artefact of one demand level?* — the question a learned dispatcher must not be allowed to
 * overfit. It is **not** a random walk across days and **not** a calendar; a richer model can come
 * later with a reason, and today there is none.
 *
 * ## Two knobs that do not overlap, and the arithmetic says so
 *
 * - {@link minDemandFactor}/{@link maxDemandFactor} change **how many people** arrive and not
 *   when: every source's rate is multiplied, the template's shape is untouched.
 * - {@link peakShiftS} changes **when** they arrive and not how many: the shift moves the interior
 *   phase boundaries, and the up-ramp lengthens by exactly as much as the down-ramp shortens, so
 *   `intensityIntegralS` is conserved *exactly*. See `shiftTemplatePeak`.
 *
 * ## Both bounds are required by the type, and that follows a precedent rather than a taste
 *
 * `PassengerMassOverride` requires both truncation bounds because an untruncated draw surfaces
 * three layers from its cause (docs/14 § 2.1). The same argument applies harder here: an
 * unbounded demand multiplier is a run whose saturation state nobody declared, reported beside a
 * mean that may or may not be valid.
 *
 * ## The statistical hazard, which is the whole reason § 5 criterion 3 exists
 *
 * Day variation adds a variance component *between* replications. Under common random numbers both
 * arms of a comparison must see the **same** Monday, or the paired standard error rises and the
 * 5–20× the CRN design buys is spent on nothing. That is delivered structurally rather than by
 * convention: the draws come from a stream of the injected {@link StreamSet}, before a car moves,
 * so two arms handed the same seed draw the same day — and this block is in
 * `runner/crn.ts`'s `traceKeyOf`, so two cells that *disagree* about it are never paired at all.
 */
export interface DayVariationConfig {
  /** Lower bound of the demand multiplier, drawn uniformly. Must be > 0 and <= the upper bound. */
  readonly minDemandFactor: number;
  /** Upper bound of the demand multiplier, drawn uniformly. */
  readonly maxDemandFactor: number;
  /**
   * Largest peak shift in either direction, seconds. Default 0 — the peak stays where the template
   * puts it. The shift itself is drawn uniformly from `[-peakShiftS, +peakShiftS]`.
   *
   * Refused above what the template can absorb, and refused outright for a template with no
   * interior phase boundary to move: `constant-iso` is flat, so "when the peak happens" is not a
   * question it can be asked. Shifting only its report window would move which passengers were
   * measured without moving any of them, which is noise dressed as a model.
   */
  readonly peakShiftS?: number | undefined;
}

/**
 * What a run actually drew for its day. Reported, never authored.
 *
 * Present on {@link PassengerTrace} **only** when the run declared a {@link DayVariationConfig} —
 * spread-or-omit, because `structuralDigestOfResult` hashes a key's presence as well as its value,
 * so a key on the default path moves 981 pins to say nothing.
 *
 * **On the trace and nowhere else.** A `SimulationResult` reaches it through `result.trace`, and
 * there is deliberately no second copy beside `trafficSeed` and `trafficModel`: those two are
 * *provenance carried from `RunRecord`* and this is a *drawn outcome of the trace*, so a copy on
 * the result would be two places one draw could be read from and one of them could go stale. This
 * docstring claimed the field was on `SimulationResult` until adversarial review read it.
 */
export interface ResolvedDayVariation {
  /** The multiplier applied to every source's rate. 1 means the average day. */
  readonly demandFactor: number;
  /** Seconds the peak was moved by. Positive is later. 0 means the template's own timing. */
  readonly peakShiftS: number;
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
  /**
   * The shift-change period's length, seconds. Inherited from {@link riseAndFallDurationS} for the
   * reason {@link lunchTwoWayDurationS} is: no table gives a shift-change *period* in minutes, so
   * the template borrows the shipped terminating run's horizon and adds no uncited duration.
   */
  shiftChangeDurationS: 1800,
  /**
   * Intensity in the trough between the two shift-change peaks, as a fraction of peak.
   *
   * **The defining number of the template, and an assumption rather than a citation.** A shift
   * change is two peaks with the building still occupied between them; a trough of 0 would be two
   * separate rise-and-falls with a dead period, which is a different building. 0.35 keeps the
   * trough clearly below the peaks and clearly above the zero baseline `rise-and-fall` uses.
   */
  shiftChangeTroughFraction: 0.35,
  /** Length of each of the two shift-change peak holds, seconds. The rise-and-fall hold, unchanged. */
  shiftChangePeakWindowS: 300,
  /** The event-egress run length, seconds. Shorter than the others: an egress is over sooner. */
  eveningEgressDurationS: 1200,
  /** How long the egress takes to reach full flow, seconds. The step, and what makes it an egress. */
  eveningEgressStepS: 60,
  /** How long full flow is sustained before it decays, seconds. */
  eveningEgressHoldS: 300,
  /** Intensity before the doors open, as a fraction of peak. Not zero: the venue is not empty. */
  eveningEgressBaselineFraction: 0.05,
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
  readonly shiftChangeDurationS: number;
  readonly shiftChangeTroughFraction: number;
  readonly shiftChangePeakWindowS: number;
  readonly eveningEgressDurationS: number;
  readonly eveningEgressStepS: number;
  readonly eveningEgressHoldS: number;
  readonly eveningEgressBaselineFraction: number;
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
 * **Fifteen entries carry `default: null`**, meaning "unset, and unset is meaningful" — the count is
 * asserted in `parameters.test.ts` rather than only stated here, because this sentence said "two"
 * while four were declared and would otherwise still say it now there are fifteen.
 *
 * `traffic.arrivalRatePctPop5min` unset means "use the profile's own number for the selected
 * `demandLevel`", which is not a number this schema can name — naming one would silently run
 * every building at it. Its range spans the union of the shipped profiles' ranges
 * (residential 3% to prestige office 17%) with headroom above, because pushing demand past
 * handling capacity to exercise saturation detection is a legitimate experiment. The three
 * `traffic.directionalSplit.*` entries are the same: unset means each floor keeps its own
 * profile's mix, and they are set together or not at all. The three `traffic.batchSize.*` and
 * five `traffic.passengerMass.*` entries (docs/14 §§ 2.1-2.2) are the same again: the curve and
 * the population live in `data/traffic-profiles.json`, and a number here would be a second source
 * of truth for one the reference file already states. The three `traffic.dayVariation.*` entries
 * (docs/14 § 2.3) are null for the neighbouring reason rather than that one — there is no
 * reference file to defer to, and *no day variation at all* is the only default that leaves every
 * published figure standing, so a number here would silently make every run a different Tuesday.
 *
 * **What `default: null` costs, said plainly rather than implied.** `collectSearchSpace` classifies
 * a null-default row as *unsearchable* — "a search needs a point it can start from" — so all
 * twelve are declared, typed, ranged and **excluded from the space a generic optimizer walks**.
 * These rows satisfy invariant 8's *declaration* requirement and not its *searchability* purpose,
 * and calling them "searchable tunables" would overstate what shipped. Making them searchable means
 * giving the collector a per-building origin to start from, which is a different piece of work.
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
    // **Narrower than the shipped catalogue since § D274, and named rather than left to be found.**
    // These are the shapes this module can build with *no record to read*; a record that authors its
    // own `phases` (§ D273) answers to an id no compiled-in list can contain, and `office-day` is
    // the first one that does. So a generic optimizer sampling this row will not offer a day
    // profile. That is the right answer rather than a gap to close: which traffic pattern a building
    // faces is a **scenario axis**, not a knob to search — CLAUDE.md § Tuning discipline says *tune
    // per traffic pattern*, which means holding this fixed and searching the weights inside it — and
    // a `values` list read from `data/` at module load would make this declaration a function of a
    // file the type system cannot see. A study that wants a day profile names it on the traffic arm.
    values: [...DEMAND_TEMPLATE_IDS],
    default: TRAFFIC_DEFAULTS.templateId,
    description:
      'Demand shape, as one of the shapes this build can construct without a data record. rise-and-fall is a 30 min terminating run reported over its peak 5 minutes and is the only one that supports confidence intervals across replications; constant-iso is a single 120 min run for cross-checking. A data record may also author its own phase list and be selected by id, which this list cannot enumerate — see DECISIONS.md § D274.',
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
    id: 'traffic.credentialGap.wrongZoneShare',
    type: 'continuous',
    // The whole unit interval, and the bound is the quantity's own rather than a taste: it is a
    // share of journeys. 0 is the control arm (everybody correctly badged, which is what every
    // figure published before this parameter existed was measured under) and 1 is the degenerate
    // arm (nobody inside the building may cross a zone boundary), and both are legitimate ends of
    // a sweep. The *shipped* value is not a search bound at all — it is an uncited assumption with
    // its reasoning in `data/traffic-profiles.json`, which is where a reader has to go for it.
    range: [0, 1],
    scale: 'linear',
    default: null,
    description:
      "Share of journeys that begin inside the building and end inside an access zone the traveller's own floor does not already reach, which are made by somebody not holding a credential for it. Unset means the credentialGap block in data/traffic-profiles.json, which is the only honest default: the number is an uncited assumption stated there with its reasoning, and a second value here would be a second source of truth for it. 0 is the control arm — every rider holds a credential for wherever they are going. It is consumed only where a building declares accessZones; a building that declares none is byte-identical at every value.",
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

  /* ---- docs/14 § 2.2 — the group-size curve ------------------------------- */

  {
    id: 'traffic.batchSize.distribution',
    type: 'categorical',
    values: [...SUPPORTED_BATCH_DISTRIBUTIONS],
    default: null,
    description:
      "Group-size family, overriding every profile's own curve. Unset (the default) means each floor keeps the curve data/traffic-profiles.json authors for it, which is what every published figure was measured under. geometric is that curve's family; zeroTruncatedPoisson clusters more tightly around the same mean; explicit takes an authored weight vector over sizes 1..n, which is the only one of the three that can say 'this hotel arrives in fours'.",
  },
  {
    id: 'traffic.batchSize.mean',
    type: 'continuous',
    // Lower bound is the model's own: a batch contains at least one passenger. Upper bound is a
    // **search bound, not a measurement** — the shipped profiles run 1.4 to 2.0 and no CIBSE or
    // ISO table gives a group-size ceiling, so 12 is headroom chosen to admit a tour party and
    // refuse a typo, and is labelled as such rather than presented as reference data.
    range: [1, 12],
    scale: 'linear',
    default: null,
    unit: 'passengers',
    description:
      "Mean group size, overriding every profile's own. Unset means the profile decides, which is the only honest default: 2.0 is a hotel number and would run an office at 1.4x its group size. Total passenger demand is held fixed, so raising the mean lowers the batch rate rather than adding people.",
    activeWhen: {
      'traffic.batchSize.distribution': ['geometric', 'zeroTruncatedPoisson'],
    },
  },
  {
    id: 'traffic.batchSize.weight',
    type: 'continuous',
    range: [0, 1],
    scale: 'linear',
    default: null,
    perMemberOf: 'traffic.batchSize.sizes',
    description:
      'Relative likelihood of one group size, supplied once per size from 1 upwards and normalized across them — so [0, 1] per size spans every distinct curve, and the vector length is the largest group the building produces. Declared once for however many sizes the curve names, the way traffic.entranceWeight is declared once for however many entrances a building has. The mean is DERIVED from this vector, never authored beside it, because the batch rate divides by it and a mean that drifted from its own weights would change total demand silently.',
    activeWhen: { 'traffic.batchSize.distribution': ['explicit'] },
  },

  /* ---- docs/14 § 2.1 — body mass ----------------------------------------- */

  {
    id: 'traffic.passengerMass.distribution',
    type: 'categorical',
    values: [...SUPPORTED_MASS_DISTRIBUTIONS],
    default: null,
    description:
      "Body-mass family, overriding data/traffic-profiles.json's passengerMass block. Unset means the reference block, which is normal. lognormal is right-skewed and strictly positive, which is the shape a measured population has; normal is what the shipped data declares and what every published figure was measured under. The five passengerMass parameters are set together or left together: a partial override is refused, because both truncation bounds are required.",
  },
  {
    id: 'traffic.passengerMass.meanKg',
    type: 'continuous',
    // The shipped block is 75 kg, which is also EN 81's nominal passenger mass (see
    // `LOAD_SENSOR_DEFAULTS.nominalPassengerMassKg`, cited in docs/02-elevator-reference.md).
    // The range around it is a **search bound, not a measurement**: no reference in this project
    // gives a population mean outside it, and nothing here claims one does.
    range: [40, 140],
    scale: 'linear',
    default: null,
    unit: 'kg',
    description:
      'Mean body mass. Unset means the reference block (75 kg, EN 81 nominal). A heavier population fills cars by weight sooner: boarding stops at design load in kilograms and there is no head-count clause, so the number of people a car takes falls as the population gets heavier.',
  },
  {
    id: 'traffic.passengerMass.stdDevKg',
    type: 'continuous',
    // 0 is admissible and is the degenerate case — every passenger identical — which the load
    // sensor exists to make impossible in *data* (schema.ts refuses it there) but which is a
    // legitimate control arm for an experiment measuring what the spread is worth.
    range: [0, 40],
    scale: 'linear',
    default: null,
    unit: 'kg',
    description:
      'Standard deviation of body mass. Unset means the reference block (15 kg). Zero makes every passenger identical, which is the control arm for measuring what the distribution buys — never a default, because a load sensor reading a constant has nothing to measure.',
  },
  {
    id: 'traffic.passengerMass.minKg',
    type: 'continuous',
    range: [1, 120],
    scale: 'linear',
    default: null,
    unit: 'kg',
    description:
      'Lower truncation. Required whenever the block is overridden at all: the normal distribution runs to minus infinity, and a load sensor reading a negative passenger surfaces three layers away as a strange capacity result rather than as an error. Draws below it are clamped, never re-drawn, so the draw count stays independent of the values drawn.',
  },
  {
    id: 'traffic.passengerMass.maxKg',
    type: 'continuous',
    range: [40, 400],
    scale: 'linear',
    default: null,
    unit: 'kg',
    description:
      'Upper truncation. Required whenever the block is overridden at all, for the symmetric reason: the tails of both families run to infinity and neither is a person. Draws above it are clamped, never re-drawn.',
  },

  /* ---- docs/14 § 2.3 — inter-day variability ------------------------------ */

  {
    id: 'traffic.dayVariation.minDemandFactor',
    type: 'continuous',
    // A **search bound, not a measurement**. No reference in this project gives a distribution of
    // day-to-day demand, and none is invented here: 0.25 is a quiet day rather than a public
    // holiday, and 4 is past every shipped building's handling capacity, so the interval admits
    // the question docs/14 § 2.3 asks and refuses a typo. Labelled as such rather than cited.
    range: [0.25, 4],
    scale: 'linear',
    default: null,
    description:
      "Lower bound of the per-run multiplier on total demand, drawn uniformly. Unset (the default) means Tuesday is a copy of Monday, which is what every published figure was measured under. Set together with maxDemandFactor or not at all: a one-sided bound is an unbounded demand multiplier, and that is a run whose saturation state nobody declared. It scales how many people arrive and not when — the peak keeps the shape and the position the template gives it.",
  },
  {
    id: 'traffic.dayVariation.maxDemandFactor',
    type: 'continuous',
    range: [0.25, 4],
    scale: 'linear',
    default: null,
    description:
      "Upper bound of the per-run demand multiplier. Required whenever the block is declared at all, for the reason both mass truncation bounds are. min == max is legal and is the useful degenerate case: a fixed multiplier, which is a demand level rather than a variability, and it is the control arm for measuring what the variability itself costs.",
  },
  {
    id: 'traffic.dayVariation.peakShiftS',
    type: 'continuous',
    // Bounded above by what the shipped template can absorb rather than by taste: the 30-minute
    // rise-and-fall's outermost interior knot is 750 s from an end, so 600 leaves headroom under
    // it. A shorter run absorbs less and the generator refuses the excess by name.
    range: [0, 600],
    scale: 'linear',
    default: null,
    unit: 's',
    description:
      "Largest shift of the peak in either direction, seconds; the shift itself is drawn uniformly from [-peakShiftS, +peakShiftS]. Unset means the peak stays where the template puts it, and unset is also what an author means by declaring the block without this field. It moves when people arrive and not how many: the up-ramp lengthens by exactly as much as the down-ramp shortens, so the intensity integral is conserved exactly. Refused outright on constant-iso, which is flat and therefore has no peak to move.",
  },
];
