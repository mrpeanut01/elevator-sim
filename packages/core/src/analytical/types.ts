/**
 * Vocabulary for the closed-form (Barney / CIBSE Guide D) up-peak round-trip-time
 * calculation: the terms it consumes, the results it produces, the simplifications it
 * makes, and the schema for every tunable it exposes.
 *
 * ## Why this module exists at all
 *
 * This is the project's **primary correctness oracle**. Under pure up-peak the simulator's
 * interval and handling capacity must land within a few percent of these numbers, and when
 * they do not the presumption is that the *simulation* is wrong
 * (see `CLAUDE.md` § Correctness oracle, and `docs/05-roadmap.md` Phase 2 acceptance).
 *
 * That presumption carries a precondition, and the precondition is not decoration: the
 * closed form is one-sided in its *travel and stop* terms but **not** in its *load*, so
 * "the simulation came out low, therefore the simulation is wrong" is only sound when both
 * sides are evaluated at the same passengers-per-trip. {@link CLOSED_FORM_COMPARISON_RULE}
 * states the rule with its scope, machine-readably, so a validation report cannot quote the
 * unqualified version.
 *
 * An oracle is only worth having if it is derived independently of the thing it checks.
 * So nothing under `analytical/` imports the kernel, the model, the physics or the
 * dispatcher — not even to reuse a motion profile. The only imports are **types** from
 * `config/`, describing the building being analysed. Every function is pure: no RNG
 * (invariant 2), no wall clock (invariant 3), no mutation of any input.
 *
 * ## The formulas
 *
 * ```text
 * S    = N · (1 − ((N−1)/N)^P)              expected distinct stops among N floors
 * H    = N − Σ_{i=1..N−1} (i/N)^P           expected highest reversal floor
 * RTT  = 2·(H·tv + tx) + (S+1)·ts + 2·P·tp  round trip time, seconds
 * INT  = RTT / L                            interval between car departures, seconds
 * HC   = 300·P·L / RTT = 300·P / INT        persons handled per 5 minutes, whole group
 * %POP = HC / U × 100                       handling capacity as a % of population
 * ```
 *
 * `tx` (the one-way express run below the served zone) is an extension carried at default
 * zero; with `tx = 0` the expression is exactly the published one. See
 * {@link RoundTripTerms.expressJumpS}.
 *
 * ## Conventions (see CLAUDE.md)
 *
 * - Units are SI. Durations are seconds, distances metres. Imperial values never appear.
 * - Every value is `readonly`; results are plain frozen-by-convention data.
 * - Every tunable appears in {@link ANALYTICAL_PARAMETERS} with its type, range and
 *   default (invariant 8), and its runtime default comes from {@link ANALYTICAL_DEFAULTS}
 *   rather than a literal buried in the arithmetic (invariant 7).
 *
 * ## Sources
 *
 * - Barney, G. & Al-Sharif, L., *Elevator Traffic Handbook: Theory and Practice*, 2nd ed.
 * - CIBSE Guide D: *Transportation Systems in Buildings* (2020), § up-peak round trip time.
 * - Peters, R., *Traffic Analysis Based on the Up-Peak Round Trip Time Method*.
 * - `docs/03-traffic-and-statistics.md` Part 2, which is where this repository states the
 *   formulas it holds itself to.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A building (or a bank within it) that the closed form cannot be applied to.
 *
 * Distinct from `RangeError`, which the arithmetic throws for a term outside its domain
 * (a negative transit time, a fractional floor count). This one means the *model* does not
 * fit: an unknown bank id, a bank with no terminal floor, a bank whose destinations carry
 * no population.
 */
export class AnalyticalError extends Error {
  override readonly name = 'AnalyticalError';

  /** Stable machine-readable kind, for tests and tooling. */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Stable `code` values on {@link AnalyticalError}. */
export const ANALYTICAL_ERROR_CODES = {
  /** `options.bankId` names a bank the building does not declare. */
  unknownBank: 'unknownBank',
  /** The building declares no banks, or the chosen bank declares no cars. */
  emptyGroup: 'emptyGroup',
  /** `options.entranceFloorId` names a floor that is unknown or not served by the bank. */
  unknownTerminal: 'unknownTerminal',
  /** No served floor is flagged `isEntrance` or `isTransferFloor` with population above. */
  noTerminal: 'noTerminal',
  /** `options.upperFloorIds` names a floor that is unknown or not served by the bank. */
  unknownUpperFloor: 'unknownUpperFloor',
  /** The bank serves no populated floor above its terminal, so there is no up-peak. */
  noServedPopulation: 'noServedPopulation',
} as const;

export type AnalyticalErrorCode =
  (typeof ANALYTICAL_ERROR_CODES)[keyof typeof ANALYTICAL_ERROR_CODES];

// ---------------------------------------------------------------------------
// The closed form: inputs and outputs
// ---------------------------------------------------------------------------

/**
 * The seven scalars the round-trip-time expression consumes, plus the population it is
 * reported against.
 *
 * These are deliberately plain numbers rather than a building: the closed form is
 * arithmetic, and keeping it free of configuration is what lets it be checked against a
 * textbook worked example line by line.
 */
export interface RoundTripTerms {
  /**
   * `N` — floors served **above** the main terminal. A positive integer.
   *
   * Not the number of storeys in the building: floors below the terminal, and floors the
   * bank's shafts do not open onto, are not up-peak destinations and must not be counted.
   */
  readonly floorsAboveTerminal: number;

  /**
   * `P` — passengers carried per round trip.
   *
   * **Not required to be an integer, and deliberately not rounded.** The universal design
   * assumption is `P = 0.8 × rated capacity in persons` (CLAUDE.md § modeling rules: cars
   * fill to 80% of rated capacity, not 100%), which for a 16-person car is 12.8. `P` is an
   * expectation over many trips, so flooring it to 12 would bias handling capacity low by
   * 6% — a bigger error than the gap between two dispatch algorithms.
   */
  readonly passengersPerTrip: number;

  /**
   * `tv` — seconds to travel one floor **at rated speed**: `df / v`.
   *
   * This is the classic form's central simplification. It ignores acceleration,
   * deceleration and jerk entirely, so a real car — which on a one-floor hop never gets
   * anywhere near rated speed — always takes longer. See
   * {@link CLOSED_FORM_ASSUMPTIONS} entry `constant-transit-speed`.
   */
  readonly singleFloorTransitS: number;

  /**
   * `ts` — seconds lost per stop: the difference between stopping at a floor and flying
   * past it.
   *
   * What this project includes is stated exactly in {@link StopTimeBreakdown}.
   */
  readonly stopTimeLossS: number;

  /**
   * `tp` — passenger transfer time, seconds **per passenger per direction**.
   *
   * The round trip charges it twice (`2·P·tp`): once boarding at the terminal, once
   * alighting upstairs.
   */
  readonly passengerTransferS: number;

  /** `L` — cars in the group. A positive integer. */
  readonly carsInGroup: number;

  /**
   * `U` — the population this group lifts, used only for `%POP`. Must be positive.
   *
   * For a single-bank building this is the building population. For a zoned building it is
   * the population of the floors the bank serves above its terminal — a bank's handling
   * capacity is meaningless against a population it cannot reach.
   */
  readonly population: number;

  /**
   * `tx` — the **one-way** express run from the terminal up to the bottom of the served
   * zone, in seconds, over and above what `H·tv` already accounts for. Defaults to `0`.
   *
   * The published expression `2·H·tv` measures travel in floor units from a virtual origin
   * one interfloor distance below the lowest served floor. That is exactly right for a
   * bank whose zone begins immediately above the terminal, and badly wrong for a zoned
   * bank: Secure Tower's high bank runs 60 m from the lobby to floor 16 before its first
   * possible stop, worth ~14 s each way at 4 m/s and ~20% of its round trip.
   *
   * Leave it at zero to reproduce the textbook expression verbatim; `deriveUpPeakTerms`
   * computes it from the actual floor heights, which makes `H·tv + tx` the exact linear
   * interpolation of the real heights rather than an approximation of them.
   *
   * Normally non-negative. It comes out slightly **negative** when the gap from the
   * terminal to the lowest served floor is shorter than the zone's mean interfloor
   * distance — a real configuration, just an unusual one — and that is allowed: clamping it
   * would silently overstate travel. Only the resulting travel term is required to be
   * non-negative.
   */
  readonly expressJumpS?: number | undefined;
}

/** {@link RoundTripTerms} with every default applied. Echoed back on the result. */
export interface ResolvedRoundTripTerms {
  /** `N`. */
  readonly floorsAboveTerminal: number;
  /** `P`. */
  readonly passengersPerTrip: number;
  /** `tv`, seconds. */
  readonly singleFloorTransitS: number;
  /** `ts`, seconds. */
  readonly stopTimeLossS: number;
  /** `tp`, seconds. */
  readonly passengerTransferS: number;
  /** `L`. */
  readonly carsInGroup: number;
  /** `U`. */
  readonly population: number;
  /** `tx`, seconds, one way. */
  readonly expressJumpS: number;
}

/**
 * Everything the closed form yields, with every intermediate exposed.
 *
 * The intermediates are not diagnostics: Phase 2's validation compares them term by term
 * against the simulation, and a mismatch localised to (say) the stop term is worth far
 * more than a mismatch in the total.
 */
export interface RoundTripResult {
  /** The inputs, with defaults resolved. */
  readonly terms: ResolvedRoundTripTerms;

  /** `S` — expected number of distinct floors stopped at on the way up. */
  readonly expectedStops: number;

  /**
   * `H` — expected highest floor reached, as an ordinal in `[1, N]` over the served floors
   * (`1` is the lowest served floor above the terminal, `N` the highest).
   */
  readonly highestReversalFloor: number;

  /** `2·(H·tv + tx)` — seconds spent moving, up and back down. */
  readonly travelTimeS: number;

  /** `(S+1)·ts` — seconds lost stopping. The `+1` is the stop at the terminal itself. */
  readonly stopTimeS: number;

  /** `2·P·tp` — seconds spent transferring passengers, boarding plus alighting. */
  readonly transferTimeS: number;

  /** `RTT` — the round trip time, seconds. */
  readonly roundTripTimeS: number;

  /** `INT = RTT / L` — mean seconds between successive car departures from the terminal. */
  readonly intervalS: number;

  /**
   * `300·P / RTT` — persons per 5 minutes **for one car**.
   *
   * `docs/03-traffic-and-statistics.md` Part 2 states handling capacity as
   * `HC5 = 300·P·L / RTT = 300·P / INT`, the whole-group figure — which is
   * {@link handlingCapacity5Min}, the quantity CIBSE and Barney compare against population
   * and the one every `%POP` here is quoted in. The per-car figure is reported alongside it
   * because it is what a single simulated car's round trip yields directly, and because the
   * doc's line read *without* `L` (as it stood before it was corrected) is low by exactly
   * the factor `L`: 25.68 against 102.71 on Midtown Office, 1.50 % against 6.01 % of
   * population. Reporting both makes that factor visible rather than a silent choice.
   */
  readonly handlingCapacityPerCar5Min: number;

  /**
   * `HC = 300·P·L / RTT = 300·P / INT` — persons per 5 minutes for the whole group.
   *
   * This is the quantity CIBSE and Barney compare against building population, and the one
   * `docs/03-traffic-and-statistics.md` Part 1's "% pop / 5 min" demand targets are
   * expressed in.
   */
  readonly handlingCapacity5Min: number;

  /** `%POP = HC / U × 100` — handling capacity as a percentage of population per 5 min. */
  readonly percentPopulation5Min: number;
}

// ---------------------------------------------------------------------------
// Derivation from a building
// ---------------------------------------------------------------------------

/**
 * Exactly what this project counts as "time lost per stop", itemised.
 *
 * `ts` is the difference between stopping at a floor and flying past it. The four
 * components below are charged; two things that might be expected are **not**:
 *
 * - **Door dwell is not included.** Passenger transfer is charged separately and per
 *   passenger, as `2·P·tp`. Adding dwell as well would double-count the same seconds. The
 *   consequence is a known divergence: the simulator enforces a *minimum* hall-call dwell
 *   (5 s by default), which for a lightly loaded stop exceeds the transfer time the closed
 *   form charges. See {@link CLOSED_FORM_ASSUMPTIONS} entry `no-minimum-dwell`.
 * - **The kinematic cost of stopping is not included** — the extra seconds a jerk-limited
 *   accelerate/decelerate cycle takes over covering the same distance at rated speed.
 *   Barney's full definition of `ts` does carry it (`ts = T₁ + to + tc − tv`, where `T₁` is
 *   the true single-floor flight time). Omitting it is the same simplification as taking
 *   `tv = df/v`, and it is the largest single reason the closed form under-states RTT.
 *   {@link accelerationLossS} is the bridge: set it and the two definitions coincide.
 */
export interface StopTimeBreakdown {
  /** Fully closed to fully open, seconds. */
  readonly doorOpenS: number;
  /** Fully open to fully closed, seconds. */
  readonly doorCloseS: number;
  /** Start command to motion, seconds. */
  readonly motorStartDelayS: number;
  /** Levelling and settling at the end of the run, seconds. */
  readonly levelingSettleS: number;
  /**
   * Optional bridge to Barney's full `ts`: the seconds a real stop-to-stop flight costs
   * over travelling the same distance at rated speed. Zero by default, which is the
   * classic form. See {@link ANALYTICAL_PARAMETERS} `analytical.accelerationLossPerStopS`.
   */
  readonly accelerationLossS: number;
  /** The sum. This is `ts`. */
  readonly totalS: number;
}

/** Knobs on the derivation of closed-form terms from a building configuration. */
export interface UpPeakOptions {
  /** Which bank to analyse. Defaults to the building's only bank; required if it has several. */
  readonly bankId?: string | undefined;
  /**
   * Floor id to treat as the main terminal. Must be served by the bank.
   *
   * Omitted, the terminal is chosen as documented on `deriveUpPeakTerms`: the
   * highest-index served floor flagged `isEntrance` that still has populated served floors
   * above it, falling back to `isTransferFloor` for an upper local bank fed by a sky lobby.
   */
  readonly entranceFloorId?: string | undefined;
  /**
   * Explicit destination floors, overriding the default "populated served floors above the
   * terminal". The escape hatch for a shuttle bank, whose sky-lobby destinations carry no
   * resident population of their own and would otherwise be excluded.
   */
  readonly upperFloorIds?: readonly string[] | undefined;
  /**
   * `U`, the population `%POP` is measured against, overriding the sum over the
   * destination floors.
   *
   * **A shuttle bank requires this**, and requires it even when its sky-lobby destinations
   * do carry a population of their own. Mixed-Use High-Rise's sky lobby at floor 31 is
   * declared with `population: 260` — its amenity occupants — but the shuttle lifts
   * everybody bound above 31 as well, `260 + 29 × 26 = 1014`. Left to default, that bank
   * reports 102.8 % of population per five minutes instead of 26.3 %: a 3.9× error in a
   * headline figure, in the direction that looks like abundant capacity. The derivation
   * raises {@link UP_PEAK_WARNING_CODES.destinationsAreTransferFloors} rather than let it
   * pass silently, but the honest answer still has to be stated here.
   */
  readonly servedPopulation?: number | undefined;
  /**
   * `tp`, seconds per passenger per direction. Defaults to the building type's entry in
   * `elevator-specs.json → timing.passengerTransferS`; required for a `mixed-use`
   * building, which that table has no row for.
   */
  readonly passengerTransferS?: number | undefined;
  /** Fraction of rated capacity a car fills to. Defaults to the cars' resolved value (0.8). */
  readonly designLoadFactor?: number | undefined;
  /** `P` directly, bypassing `ratedCapacityPersons × designLoadFactor`. */
  readonly passengersPerTrip?: number | undefined;
  /** See {@link StopTimeBreakdown.accelerationLossS}. Defaults to 0. */
  readonly accelerationLossPerStopS?: number | undefined;
  /** `df`, metres. Defaults to the mean floor-to-floor rise across the served zone. */
  readonly interfloorDistanceM?: number | undefined;
  /** `v`, m/s. Defaults to the mean rated speed of the bank's cars. */
  readonly ratedSpeedMps?: number | undefined;
}

/** A non-fatal observation about how far the building strays from the closed form's model. */
export interface UpPeakWarning {
  /** Stable machine-readable kind. One of {@link UP_PEAK_WARNING_CODES}. */
  readonly code: string;
  /** What was observed, and which way it moves the comparison. */
  readonly message: string;
}

/** Stable `code` values on {@link UpPeakWarning}. */
export const UP_PEAK_WARNING_CODES = {
  /** More than one entrance floor is served; the closed form loads from exactly one. */
  multipleEntrances: 'multipleEntrances',
  /** Served floors above the terminal do not all carry the same population. */
  nonUniformFloorPopulations: 'nonUniformFloorPopulations',
  /** Served floors with zero population were excluded from `N`. */
  unpopulatedFloorsExcluded: 'unpopulatedFloorsExcluded',
  /** Floor-to-floor rise is not constant across the served zone; `df` is its mean. */
  nonUniformInterfloorDistance: 'nonUniformInterfloorDistance',
  /** The bank's cars are not identical; scalar terms are averaged across them. */
  heterogeneousGroup: 'heterogeneousGroup',
  /** A double-deck car is present. The single-deck closed form does not describe it. */
  doubleDeck: 'doubleDeck',
  /** The bank runs express below its served zone; `tx` is non-zero. */
  expressZone: 'expressZone',
  /** `P` exceeds `N`: every trip fills more than one passenger per served floor. */
  saturatedStops: 'saturatedStops',
  /**
   * One or more destination floors are transfer floors, or are served by another bank, so
   * this group is feeding a further leg rather than delivering passengers to their final
   * floor. The default `U` — those floors' own `population` — is then not the population
   * the group lifts, and `%POP` is meaningless until `options.servedPopulation` is supplied.
   */
  destinationsAreTransferFloors: 'destinationsAreTransferFloors',
  /**
   * `%POP` exceeds {@link IMPLAUSIBLE_PERCENT_POPULATION_5MIN}. No real group clears half
   * its served population every five minutes; the usual cause is a `U` that is too small,
   * which is the same defect `destinationsAreTransferFloors` describes seen from the
   * output side.
   */
  implausibleHandlingCapacity: 'implausibleHandlingCapacity',
} as const;

export type UpPeakWarningCode =
  (typeof UP_PEAK_WARNING_CODES)[keyof typeof UP_PEAK_WARNING_CODES];

/**
 * The closed-form terms for one bank under up-peak, with every input traced back to the
 * building it came from.
 *
 * Separated from {@link UpPeakAnalysis} so a caller can inspect (or amend) the terms before
 * evaluating them — which is how a sensitivity study over `tp` or `df` is written without
 * this module growing a knob for every question.
 */
export interface UpPeakTerms {
  readonly buildingId: string;
  readonly bankId: string;
  /** Floor id of the main terminal the round trip starts and ends at. */
  readonly terminalFloorId: string;
  /** Height of the terminal above datum, metres. */
  readonly terminalHeightM: number;
  /** Destination floor ids, ascending. Its length is `N`. */
  readonly upperFloorIds: readonly string[];
  /** `N`. */
  readonly floorsAboveTerminal: number;
  /** `df` — mean floor-to-floor rise across the served zone, metres. */
  readonly interfloorDistanceM: number;
  /**
   * Metres of express run below the served zone: the terminal to one `df` below the lowest
   * served floor. Zero for a bank whose zone starts immediately above its terminal.
   */
  readonly expressRiseM: number;
  /** `v` — rated speed, m/s. */
  readonly ratedSpeedMps: number;
  /** Itemised `ts`. */
  readonly stopTime: StopTimeBreakdown;
  /** Persons at rated load, before the design load factor. */
  readonly ratedCapacityPersons: number;
  /** The fraction applied to it. 0.8 unless overridden. */
  readonly designLoadFactor: number;
  /** Population on `upperFloorIds`. This is the `U` that `%POP` is measured against. */
  readonly servedPopulation: number;
  /** Population of the whole building, for context. */
  readonly buildingPopulation: number;
  /** The scalars, ready for {@link RoundTripTerms}. */
  readonly roundTripTerms: ResolvedRoundTripTerms;
  /** Where this building strays from the closed form's model. */
  readonly warnings: readonly UpPeakWarning[];
}

/** {@link UpPeakTerms} together with the evaluated closed form. */
export interface UpPeakAnalysis extends UpPeakTerms {
  readonly result: RoundTripResult;
}

// ---------------------------------------------------------------------------
// The simplifications, as data
// ---------------------------------------------------------------------------

/**
 * Which way a simplification pushes the closed form's `RTT` relative to a faithful
 * discrete-event simulation of the same building.
 *
 * - `under` — the closed form is optimistic: real round trips take longer.
 * - `over` — the closed form is pessimistic.
 * - `either` — the sign depends on the building.
 * - `none` — it does not move `RTT`; it bounds what may be compared at all.
 */
export type ClosedFormBias = 'under' | 'over' | 'either' | 'none';

/**
 * One documented simplification, and the divergence it produces.
 *
 * Phase 2 acceptance is agreement "within a few percent" — which is only meaningful if the
 * disagreements are enumerated in advance. A divergence that appears on this list is
 * evidence the model is understood; one that does not is a bug in the simulator.
 */
export interface ClosedFormAssumption {
  /** Stable id, for citation from a validation report. */
  readonly id: string;
  /** What the closed form assumes. */
  readonly assumption: string;
  /** How a faithful simulation of the same building will differ. */
  readonly divergence: string;
  /** The direction that divergence moves `RTT`. */
  readonly bias: ClosedFormBias;
}

/**
 * Every simplification the closed form makes, as data rather than prose.
 *
 * Ordered roughly by expected magnitude on a mid-rise office. Read the `bias` column before
 * drawing any conclusion from a comparison, because **this list is not one-sided**:
 *
 * - The **travel and stop** terms are. `constant-transit-speed`,
 *   `stop-time-excludes-acceleration` and `no-minimum-dwell` all bias `under`, and nothing
 *   here pushes back against them. That is why a simulated up-peak RTT should land *above*
 *   the closed form rather than scattered around it.
 * - The **load** is not. `full-car-every-trip` and `fractional-capacity` both bias `over`,
 *   and both act through `P`: a car that leaves the terminal part-full makes fewer stops
 *   and a shorter round trip, so its simulated RTT sits legitimately *below* a closed form
 *   evaluated at `0.8 × capacity`. Under the mandated rise-and-fall demand template
 *   (`docs/03-traffic-and-statistics.md` Part 1) that is not an edge case — it is what both
 *   shoulders of the peak look like by construction.
 *
 * So the decision rule needs its scope attached. It is stated once, machine-readably, in
 * {@link CLOSED_FORM_COMPARISON_RULE}, whose id lists are checked against the `bias` values
 * below by test: an unqualified "below means broken" cannot be reintroduced without one of
 * those checks failing.
 */
export const CLOSED_FORM_ASSUMPTIONS: readonly ClosedFormAssumption[] = [
  {
    id: 'constant-transit-speed',
    assumption:
      'Every floor jump is travelled at rated speed: tv = df/v, with no acceleration, deceleration or jerk.',
    divergence:
      'A jerk-limited car never reaches rated speed on a one- or two-floor hop, which is most hops on the way up. The 2·H·tv term understates real travel time, and understates it more the faster the car is rated.',
    bias: 'under',
  },
  {
    id: 'stop-time-excludes-acceleration',
    assumption:
      'ts counts door open, door close, motor start delay and levelling only.',
    divergence:
      "Barney's full ts is T₁ + to + tc − tv, where T₁ is the true single-floor flight time; the difference is the kinematic penalty of a stop over flying past, of order v/a seconds per stop. Charged (S+1) times per trip, this is the single largest omission. Set accelerationLossPerStopS to close it.",
    bias: 'under',
  },
  {
    id: 'no-minimum-dwell',
    assumption:
      'Doors begin closing the instant the last passenger has transferred; the only door time charged is open + close.',
    divergence:
      'A real controller holds a minimum dwell (5 s for a hall call by default) regardless of how few passengers transfer. On a stop where one or two people alight, 2·tp is well under that floor, so the closed form under-charges every lightly loaded stop.',
    bias: 'under',
  },
  {
    id: 'pure-up-peak',
    assumption:
      'All traffic is incoming: the car fills at the terminal, serves only up destinations, and returns express with nobody aboard.',
    divergence:
      'Every shipped traffic profile carries outgoing and interfloor components (office-standard is 85/5/10). Down-leg stops and interfloor pickups add both stops and transfers that the closed form does not charge.',
    bias: 'under',
  },
  {
    id: 'single-entrance',
    assumption: 'All P passengers board at one main terminal.',
    divergence:
      'Midtown Office declares two entrances (lobby and garage) and Vertical City several. Splitting boarding across entrances adds a stop and a door cycle per trip, and desynchronises the even departure spacing INT assumes.',
    bias: 'under',
  },
  {
    id: 'uniform-floor-populations',
    assumption:
      'Every served floor is an equally likely destination, so each of P passengers draws uniformly from N floors.',
    divergence:
      'S is maximised by the uniform distribution, so any skew in floor populations reduces the expected stop count and the closed form over-charges the stop term. H moves the other way when the skew is towards the top of the zone, so the net sign is building-specific. Secure Tower (44/34/36/26/12 per floor by tenant) is the case in point.',
    bias: 'either',
  },
  {
    id: 'full-car-every-trip',
    assumption: 'Every round trip carries exactly P = 0.8 × rated capacity passengers.',
    divergence:
      'Passengers arrive in Poisson batches, so real cars leave the terminal part-full whenever the queue is short. A part-full car makes fewer stops and a shorter round trip, but achieves less than the handling capacity the closed form advertises. RTT is over-stated and HC is over-stated at the same time.',
    bias: 'over',
  },
  {
    id: 'fractional-capacity',
    assumption:
      'P is left fractional (0.8 × 16 = 12.8 persons) because it is an expectation over many trips.',
    divergence:
      'The simulator cannot board 0.8 of a person; its design capacity is floor(0.8 × 16) = 12. For a 2500 lb car that is 6% less payload per trip, which shows up directly as ~6% lower simulated handling capacity even when everything else agrees.',
    bias: 'over',
  },
  {
    id: 'no-dispatcher',
    assumption:
      'Cars depart the terminal perfectly evenly spaced, exactly INT apart, with no allocation decision to make.',
    divergence:
      'Real groups bunch under up-peak. The mean interval may match while its variance does not, and mean waiting time exceeds INT/2 by a margin that is exactly what a dispatcher is judged on.',
    bias: 'none',
  },
  {
    id: 'deterministic-averages',
    assumption:
      'S and H are expectations, and RTT is evaluated once at those expectations.',
    divergence:
      'E[f(S,H)] is not f(E[S],E[H]) for a nonlinear f, and the closed form has no variance at all: it can predict a mean interval and a handling capacity, and cannot predict AWT, WT95 or % > 60 s. Those metrics have no analytical baseline and must be validated another way.',
    bias: 'none',
  },
  {
    id: 'no-door-interference',
    assumption: 'Doors open and close once per stop, uninterrupted.',
    divergence:
      'The simulator models photo-eye obstruction and late-arrival reopens, each of which adds a partial door cycle. Small per event, but it only ever adds time.',
    bias: 'under',
  },
  {
    id: 'single-deck',
    assumption: 'One car body serving one floor at a time.',
    divergence:
      'A double-deck car serves two floors per stop and has its own round-trip formulation. Applying this one to Vertical City’s shuttles treats a double-deck car as a single-deck car of the same total capacity, which understates stops and overstates capacity.',
    bias: 'either',
  },
] as const;

/**
 * The decision rule Phase 2's verdict is argued from, with the precondition it is only
 * sound under, and the partition of {@link CLOSED_FORM_ASSUMPTIONS} that makes it so.
 *
 * This exists as data rather than a sentence in a comment because it is the single
 * statement most likely to be quoted at a passing simulator to declare it broken. The id
 * lists are asserted against the `bias` field of every assumption by test, so the rule and
 * the table it rests on cannot drift apart.
 */
export interface ClosedFormComparisonRule {
  /** The rule itself, stated with its scope. */
  readonly statement: string;
  /** What must be true before the rule may be applied. */
  readonly precondition: string;
  /** How to satisfy the precondition, and what it is worth on the acceptance building. */
  readonly matchedLoadGuidance: string;
  /**
   * Assumptions that move `RTT` in one direction only, whatever the load: these are what
   * make the rule true at all. Every id here must have `bias: 'under'`.
   */
  readonly oneSidedUnderIds: readonly string[];
  /**
   * Assumptions that can legitimately put a *correct* simulation's `RTT` below the closed
   * form. Every id here must have `bias: 'over'` or `'either'`. The list being non-empty is
   * exactly why the rule needs {@link precondition}.
   */
  readonly canPushSimulationBelowIds: readonly string[];
}

/** @see ClosedFormComparisonRule */
export const CLOSED_FORM_COMPARISON_RULE: ClosedFormComparisonRule = {
  statement:
    'At matched load, a simulated up-peak RTT below the closed form is evidence of a bug in the simulation: the travel and stop terms the closed form omits only ever add seconds to a real round trip. Above it is expected, and by roughly the acceleration penalty per stop.',
  precondition:
    'Matched load. The closed form must be evaluated at the mean number of passengers the simulator actually carried per round trip over the reported window, not at the design figure 0.8 x rated capacity. Without that the comparison is unsound in the low direction: under the mandated rise-and-fall demand template (docs/03-traffic-and-statistics.md Part 1) cars leave the terminal part-full through both shoulders of the peak, so simulated P is below 0.8 x capacity by construction, and a correct simulator reads low. It is also unsound for handling capacity read the other way round: a part-full car has both a shorter RTT and a lower achieved HC.',
  matchedLoadGuidance:
    'Set UpPeakOptions.passengersPerTrip (or RoundTripTerms.passengersPerTrip) to the simulator observed mean car load; failing that, to floor(0.8 x rated capacity persons), the largest integer load the simulator can actually board. On Midtown Office that is P = 12 rather than 12.8, giving RTT = 144.85 s against 149.54 s — 3.1% low, and entirely correct. Judging that run against the 12.8 figure would report a defect that is not there.',
  oneSidedUnderIds: [
    'constant-transit-speed',
    'stop-time-excludes-acceleration',
    'no-minimum-dwell',
    'pure-up-peak',
    'single-entrance',
    'no-door-interference',
  ],
  canPushSimulationBelowIds: [
    'uniform-floor-populations',
    'full-car-every-trip',
    'fractional-capacity',
    'single-deck',
  ],
};

// ---------------------------------------------------------------------------
// Tunables (CLAUDE.md invariant 8)
// ---------------------------------------------------------------------------

export type AnalyticalParameterType = 'continuous' | 'integer' | 'categorical' | 'boolean';

/**
 * Schema for one tunable, so a generic optimizer can vary it without knowing anything
 * about elevators. Mirrors `CarParameterSpec` and `DoorParameterSpec`.
 */
export interface AnalyticalParameterSpec {
  /** Dotted path of the value in config, e.g. `analytical.designLoadFactor`. */
  readonly id: string;
  readonly type: AnalyticalParameterType;
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

/**
 * Runtime defaults for this module's tunables. Nothing in the arithmetic may hard-code a
 * value that appears here (invariant 7).
 */
export const ANALYTICAL_DEFAULTS = {
  /**
   * Fraction of rated capacity a car fills to. Only a fallback: the value normally comes
   * from `elevator-specs.json → conventions.designLoadFactor` by way of `ResolvedCar`.
   * 1.0 would make every result systematically optimistic.
   */
  designLoadFactor: 0.8,
  /** No kinematic penalty per stop — the classic closed form. */
  accelerationLossPerStopS: 0,
  /** No express run below the served zone. */
  expressJumpS: 0,
} as const;

/** Seconds in the reporting window handling capacity is quoted over. Five minutes. */
export const HANDLING_CAPACITY_WINDOW_S = 300;

/**
 * `%POP` above which the result is reported as implausible rather than merely generous.
 *
 * A sanity bound, not a design target and not a tunable: it does not enter any arithmetic
 * and an optimizer has nothing to gain by varying it, so it is a named constant here rather
 * than an entry in {@link ANALYTICAL_PARAMETERS} — the same standing as
 * {@link HANDLING_CAPACITY_WINDOW_S}.
 *
 * 50 % is deliberately far above every real figure. `docs/03-traffic-and-statistics.md`
 * Part 1 puts demand between 3 % (residential) and 17 % (prestige office) of population per
 * five minutes, and the most generously elevatored shipped bank — Garden Apartments, two
 * cars for 120 residents — reaches 35 %. Anything past 50 % is a broken `U`, not a good
 * building: Mixed-Use High-Rise's shuttle scored 102.8 % against its sky lobby's own 260
 * occupants while actually lifting 1014 people.
 */
export const IMPLAUSIBLE_PERCENT_POPULATION_5MIN = 50;

/**
 * Every tunable this module exposes, with type, range and default (invariant 8).
 *
 * Deliberately short. `N`, `H`, `S`, `df` and `v` are *facts about a building*, read from
 * its configuration; they are not knobs and do not appear here. What does appear is the
 * three places where the closed form embeds a modelling convention that a study might
 * legitimately want to vary.
 */
export const ANALYTICAL_PARAMETERS: readonly AnalyticalParameterSpec[] = [
  {
    id: 'analytical.designLoadFactor',
    type: 'continuous',
    range: [0.5, 1.0],
    scale: 'linear',
    default: ANALYTICAL_DEFAULTS.designLoadFactor,
    description:
      'Fraction of rated capacity used as P. 0.8 is the universal traffic-analysis assumption; 1.0 makes every result systematically optimistic.',
  },
  {
    id: 'analytical.passengerTransferS',
    type: 'continuous',
    range: [1.0, 2.0],
    scale: 'linear',
    default: 1.2,
    unit: 's',
    description:
      'tp, per passenger per direction. Default shown is the office value; residential is 1.75 and hotel 1.5, read from elevator-specs.json by building type.',
  },
  {
    id: 'analytical.accelerationLossPerStopS',
    type: 'continuous',
    range: [0, 10],
    scale: 'linear',
    default: ANALYTICAL_DEFAULTS.accelerationLossPerStopS,
    unit: 's',
    description:
      "Seconds a real stop-to-stop flight costs over covering the same distance at rated speed. 0 reproduces the classic closed form; setting it converges on Barney's full definition of ts.",
  },
] as const;
