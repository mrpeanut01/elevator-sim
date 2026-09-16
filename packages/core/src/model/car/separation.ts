/**
 * **TWIN separation arithmetic** — the predicate that keeps two independently driven cars
 * sharing one hoistway apart, and the static envelope that keeps them out of deadlock.
 *
 * `docs/11-twin-shaft-contract.md` § 2 is the specification and § 8 row 3 is the ownership
 * row: this module is *implemented here* and *called from* `model/car/estimateCost.ts`
 * (the feasibility filter, § 2.3 gate 1) and `sim/simulation.ts#depart` (the movement gate,
 * § 2.3 gate 2). Both callers are non-test and neither is a barrel re-export.
 *
 * Pure throughout. No mutation, no clock, no `Rng` — every function here is a total function
 * of plain numbers, which is what lets gate 1 sit inside `estimateCost` without touching
 * CLAUDE.md invariant 1.
 *
 * ## The two constraints, and they are two (docs/11 § 2.1)
 *
 * - **C-ORDER.** `height(lower, t) < height(upper, t)` at every instant. The cars never swap
 *   and never pass. Implied by C-CLEAR whenever the clearance is positive, and checked
 *   separately anyway because a crossing is a *modelling* failure where a clearance breach is
 *   a *control* failure, and the two want different bug reports.
 * - **C-CLEAR.** `height(upper, t) − height(lower, t) ≥ clearance(t)`, where `clearance` is the
 *   standing clearance when both cars are stationary, and the standing clearance plus the
 *   approaching car's stopping distance plus a buffer when either moves toward the other.
 *
 * ## The lemma that makes the check exact rather than sampled, and why it matters
 *
 * docs/11 § 2.2 warns that a **sampled** separation check is dishonest: `positionAt` is
 * analytic, so two cars can breach the clearance entirely between two kernel events with both
 * endpoints reading clean. This module does not sample. It checks a quantity whose extremum
 * over a whole run is known in closed form.
 *
 * Define a car's **protected position** at time `t` as where it would come to rest if its
 * emergency brake were applied at `t`:
 *
 * ```
 * p(t) = height(t) + sign(v(t)) · v(t)² / (2 · aEmergency)
 * ```
 *
 * For a car running *up* toward its target, `dp/dt = v · (1 + a_c(t)/aEmergency)`, where
 * `a_c` is the car's own (comfort) acceleration — positive while accelerating, and equal to
 * `−d` while decelerating at the comfort rate `d`. So `dp/dt = v · (1 − d/aEmergency) ≥ 0`
 * exactly when `aEmergency ≥ d`: **a safety brake at least as hard as the service brake makes
 * the protected position monotone in the direction of travel.** Its extremum over the run is
 * therefore the run's *target*, reached with `v = 0`.
 *
 * Two things follow, and they are the whole design:
 *
 * 1. The minimum of `gap(t) − clearance(t)` over a pair of commanded runs is attained at the
 *    runs' **endpoints**, so checking the endpoints is checking every instant. No sampling,
 *    no integration, no tolerance.
 * 2. The speed-dependent term is **dominated by the target** under a sane brake, and
 *    {@link protectedCeilingM} computes it anyway rather than assuming the domination. That
 *    is deliberate: the arithmetic stays the speed-dependent one docs/11 § 2.1 specifies, it
 *    stays sound if a building ever declares a brake that breaks the premise, and
 *    `separation.test.ts` asserts the domination across the shipped speed range rather than
 *    this comment claiming it — which is `docs/11` OQ-3's *"measured check"* in its narrow form.
 *
 * **What that does not settle, said here so the next reader does not inherit a bigger claim than
 * was earned.** `v²/2a` is the constant-deceleration figure and the jerk-limited stop is longer,
 * so it is the **optimistic** one (`docs/11` § 2.2) and {@link ShaftSeparation.bufferM} is where
 * the difference is supposed to go. The sweep above shows there is no difference to cover *along a
 * commanded run*, because the target dominates. It does **not** calibrate the buffer, and OQ-3 —
 * whether the buffer is fitted to that excess or the jerk-limited stop is integrated directly —
 * stays open with no number proposed.
 *
 * ## Two ranges, two different questions
 *
 * {@link reachableHeightRangeM} answers *where may this car stop **right now***, given where
 * its mate is and what its mate is committed to. It moves every time the mate moves, and a
 * call refused against it is refused **transiently** — INV-TWIN-3, and the reason
 * `'shaftBlocked'` must never join `STRUCTURAL_INELIGIBILITY`.
 *
 * {@link admissibleHeightRangeM} answers *where may this car **ever** stop*, given only the
 * shaft's own extent. It is a constant of the building: the lower car can never stand within
 * one clearance of the roof, because its mate would have to be above the roof to let it. A
 * commitment outside this range can be discharged by **no** sequence of legal moves, so it is
 * a deadlock created at the instant it is made — docs/11 § 3.1 INV-TWIN-2 — and refusing it
 * at commitment time is the deadlock *prevention* of § 3.2.
 *
 * The distinction is the one docs/11 § 3.2 draws in one line: **deadlock is prevented at
 * commitment, and only checked at movement.**
 */

import { ModelError } from '../types.js';

/* -------------------------------------------------------------------------- *
 * The declared separation
 * -------------------------------------------------------------------------- */

/**
 * What one TWIN shaft declares about keeping its two cars apart.
 *
 * Absent on a single-car shaft, and every helper in this module and in {@link CarShaft}
 * short-circuits on its absence. That is docs/11 § 1.1's structural trick, taken verbatim
 * from the deck geometry: a building with no TWIN shaft produces a bit-identical run because
 * of the *shape* of the value, not because of an assertion somewhere.
 *
 * ## `emergencyDecelerationMps2` sits here rather than on the car, and that is a deviation
 *
 * docs/11 § 2.2 proposes it as a per-car tunable, `motion.emergencyDecelerationMps2`. It is
 * declared per **shaft** instead, for a reason that is about the safety argument rather than
 * about convenience: the constraint is a fact about a *pair*, both cars run on one set of
 * guide rails with one safety-gear design, and a per-car value lets the two cars of one shaft
 * disagree about the arithmetic that keeps them apart. A shaft whose two halves compute
 * different clearances is a shaft with no separation contract. Recorded in `DECISIONS.md`
 * § D620 rather than left as a silent divergence from a locked document.
 *
 * It is hardware and not strategy, so it is **not** a dispatcher weight (CLAUDE.md invariant
 * 7 puts strategy in `data/dispatcher-profiles.json`; this is a brake). Its type, range and
 * default are declared in `config/schema.ts#BANK_SHAFT_TUNABLES` (invariant 8).
 */
export interface ShaftSeparation {
  /** Two cars levelled and standing, floor to floor, metres. Strictly positive. */
  readonly standingClearanceM: number;
  /**
   * Added to the computed braking distance while either car moves toward the other, metres.
   *
   * This is where the jerk-limited stop's excess over the constant-deceleration `v²/2a` would go,
   * and docs/11 OQ-3 is the open question of whether it is calibrated against that excess or the
   * jerk-limited stop is integrated directly. **No number is proposed here** and OQ-3 is **not
   * answered**; the value is a building's to declare.
   *
   * What `separation.test.ts` does establish is narrower and worth stating exactly, because it is
   * easy to read as more: under a brake at least as hard as the service brake, a car's
   * emergency-braked position never passes the target of the comfort profile it is already
   * running — swept over the shipped speed range, three accelerations, six travel distances and
   * forty phase points each. So along a *commanded* run there is no excess for this to cover, and
   * the figure OQ-3 asks about is the one a separation would need if the arithmetic ever had to
   * bound a car that is **not** running a comfort profile to a known target. It is left at zero
   * rather than given a value nobody has measured.
   */
  readonly bufferM: number;
  /**
   * The emergency deceleration the safety gear achieves, m/s². **Not the comfort
   * deceleration**: `MotionConstraints` describes the ride a passenger gets, and a safety stop
   * is not that ride.
   *
   * Must be at least the harshest comfort deceleration of either car, or the monotonicity
   * lemma this module's exactness rests on does not hold.
   * {@link assertBrakeDominatesComfort} is that check and `shaftsForBank` is its non-test
   * caller. `config/parse.ts` applies the same inequality separately, as a located
   * `ConfigError` rather than a throw — see that function's own note on why there are two.
   */
  readonly emergencyDecelerationMps2: number;
}

/**
 * Validate a declared separation, at the one place a shaft is built.
 *
 * @throws ModelError if any figure is non-finite, if the standing clearance is not strictly
 *   positive — a zero clearance is two cars occupying one point — or if the buffer is
 *   negative, which would *subtract* from the braking distance.
 */
export function validateSeparation(separation: ShaftSeparation, shaftId: string): void {
  const { standingClearanceM, bufferM, emergencyDecelerationMps2 } = separation;
  if (!Number.isFinite(standingClearanceM) || standingClearanceM <= 0) {
    throw new ModelError(
      `Shaft "${shaftId}" declares standingClearanceM ${standingClearanceM}. Two cars in one hoistway need a strictly positive clearance; zero is two cars at one point.`,
    );
  }
  if (!Number.isFinite(bufferM) || bufferM < 0) {
    throw new ModelError(
      `Shaft "${shaftId}" declares bufferM ${bufferM}. The buffer pads the braking distance and may not be negative, which would subtract from it.`,
    );
  }
  if (!Number.isFinite(emergencyDecelerationMps2) || emergencyDecelerationMps2 <= 0) {
    throw new ModelError(
      `Shaft "${shaftId}" declares emergencyDecelerationMps2 ${emergencyDecelerationMps2}. A safety brake decelerates at a strictly positive rate.`,
    );
  }
}

/**
 * The premise of the exactness lemma, checked rather than assumed.
 *
 * A safety brake weaker than the service brake makes the protected position non-monotone, and
 * every claim in this module's docstring about checking endpoints rather than sampling stops
 * being true.
 *
 * **Its non-test caller is `model/car/types.ts#shaftsForBank`**, which passes the harshest comfort
 * deceleration among the shaft's cars — this S-curve model decelerates at the rate it accelerates,
 * so that is the largest `acceleration` among them.
 *
 * **`config/parse.ts` checks the same inequality and does not call this**, which is a duplication
 * with a reason rather than an oversight. A `ModelError` aborts on the first bad shaft, and a
 * building being edited wants every fault located by JSON path and reported at once; and
 * `parse.test.ts` asserts that module's whole static import graph, because `resolveBuilding` must
 * stay reachable from a browser build — importing this file would pull `model/types.js` and the
 * kernel in behind it. This throw is what catches a `ResolvedBuilding` assembled by hand in a test,
 * which never passes through the loader at all.
 *
 * @throws ModelError naming both figures, because the fix is a data change and the reader
 *   needs to know which way round they are.
 */
export function assertBrakeDominatesComfort(
  separation: ShaftSeparation,
  comfortDecelerationMps2: number,
  shaftId: string,
): void {
  if (separation.emergencyDecelerationMps2 < comfortDecelerationMps2) {
    throw new ModelError(
      `Shaft "${shaftId}" declares an emergency deceleration of ${separation.emergencyDecelerationMps2} m/s² against a comfort deceleration of ${comfortDecelerationMps2} m/s². A safety brake that stops a car more gently than its own service brake is not a safety brake, and the separation check is only exact while the first is at least the second.`,
    );
  }
}

/* -------------------------------------------------------------------------- *
 * Occupant state
 * -------------------------------------------------------------------------- */

/**
 * One car of a shaft as the separation arithmetic sees it: a plain frozen value.
 *
 * Deliberately **not** a `Car` and deliberately not a `CarSnapshot`. This module is called
 * from inside `estimateCost`, and taking anything with a method would hand the estimator a
 * handle it must not have (CLAUDE.md invariant 1). It is four numbers and an id.
 */
export interface ShaftOccupantState {
  readonly carId: string;
  /** Height above datum now, metres — interpolated when the car is moving. */
  readonly heightM: number;
  /** Signed velocity now, m/s. Positive is up. Zero for a standing car. */
  readonly velocityMps: number;
  /**
   * Height this car is committed to come to rest at: the destination of the move in progress,
   * or the destination of the move being priced. `undefined` for a standing car with no move
   * under consideration, whose committed rest position is where it already is.
   */
  readonly targetHeightM: number | undefined;
}

/* -------------------------------------------------------------------------- *
 * The arithmetic
 * -------------------------------------------------------------------------- */

/**
 * Distance a car travelling at `speedMps` covers under an emergency stop at constant
 * `decelerationMps2`: the textbook `v²/2a`.
 *
 * The MERL patent expresses the dynamic half of the separation through a deceleration term of
 * exactly this form (docs/11 § Sources — reference data, not measured here). It is the
 * **optimistic** figure: the jerk-limited stop is longer, which is what
 * {@link ShaftSeparation.bufferM} exists to cover.
 *
 * Pure. `speedMps` is taken as a magnitude, so a sign here cannot flip a distance negative.
 */
export function stoppingDistanceM(speedMps: number, decelerationMps2: number): number {
  const speed = Math.abs(speedMps);
  return (speed * speed) / (2 * decelerationMps2);
}

/**
 * The highest point this car can still be carried to: the extremum of its protected position
 * over the whole of its current commitment.
 *
 * `max(where it is, where it is going, where its brake would leave it if applied now)`. The
 * third term is dominated by the second under {@link assertBrakeDominatesComfort}'s premise —
 * a car braking harder than it was going to stops short of its own target — and is computed
 * rather than assumed, so the arithmetic stays sound if that premise is ever broken and the
 * formula stays the speed-dependent one docs/11 § 2.1 specifies.
 *
 * A descending car's brake carries it further *down*, so it contributes nothing here and the
 * result is simply where the car is now.
 */
export function protectedCeilingM(
  state: ShaftOccupantState,
  separation: ShaftSeparation,
): number {
  const braked =
    state.velocityMps > 0
      ? state.heightM + stoppingDistanceM(state.velocityMps, separation.emergencyDecelerationMps2)
      : state.heightM;
  return Math.max(state.heightM, state.targetHeightM ?? state.heightM, braked);
}

/**
 * The lowest point this car can still be carried to. {@link protectedCeilingM} mirrored: an
 * ascending car's brake carries it further up, so only a descending one contributes.
 */
export function protectedFloorM(state: ShaftOccupantState, separation: ShaftSeparation): number {
  const braked =
    state.velocityMps < 0
      ? state.heightM - stoppingDistanceM(state.velocityMps, separation.emergencyDecelerationMps2)
      : state.heightM;
  return Math.min(state.heightM, state.targetHeightM ?? state.heightM, braked);
}

/** The gap two levelled, standing cars must hold: the clearance plus the buffer. */
export function requiredGapM(separation: ShaftSeparation): number {
  return separation.standingClearanceM + separation.bufferM;
}

/**
 * C-CLEAR over a pair of commitments, as a signed margin in metres.
 *
 * `protectedFloor(upper) − protectedCeiling(lower) − requiredGap`. Non-negative means the pair
 * of runs is legal **at every instant of both**, by the monotonicity lemma in this module's
 * docstring — not at every sampled instant.
 *
 * Both arguments are commitments, not positions: hand this the move a car is *about to be
 * commanded*, with `targetHeightM` set to where it would go, and the answer is whether
 * commanding it is legal. That is precisely how `sim/simulation.ts#depart` uses it.
 */
export function separationMarginM(
  lower: ShaftOccupantState,
  upper: ShaftOccupantState,
  separation: ShaftSeparation,
): number {
  return (
    protectedFloorM(upper, separation) -
    protectedCeilingM(lower, separation) -
    requiredGapM(separation)
  );
}

/** C-CLEAR: whether the two commitments hold the required gap at every instant of both. */
export function respectsClearance(
  lower: ShaftOccupantState,
  upper: ShaftOccupantState,
  separation: ShaftSeparation,
): boolean {
  return separationMarginM(lower, upper, separation) >= 0;
}

/**
 * C-ORDER at one instant: the cars have not swapped and have not passed.
 *
 * Stated over the two cars' *actual* heights rather than their protected ones, because this is
 * the cheap assertion docs/11 § 2.1 wants on every event — a crossing is a modelling failure
 * and wants to be caught where it happens, not inferred from a margin.
 */
export function respectsOrder(lower: ShaftOccupantState, upper: ShaftOccupantState): boolean {
  return lower.heightM < upper.heightM;
}

/* -------------------------------------------------------------------------- *
 * The two ranges
 * -------------------------------------------------------------------------- */

/** Which of a TWIN shaft's two cars this is. `carIds` is ordered lower-first. */
export type ShaftRole = 'lower' | 'upper';

/** The vertical extent a shaft's cars run in: its lowest and highest served floor heights. */
export interface ShaftSpanM {
  readonly lowestHeightM: number;
  readonly highestHeightM: number;
}

/**
 * Where this car may come to rest **right now**, given its mate's current commitment.
 *
 * The dynamic range, and the one gate 1 (`estimateCost`'s feasibility filter) prices against.
 * It moves every time the mate does, so a call refused against it is refused *transiently*:
 * the fleet reaches that passenger, the credential permits them, and the block is the control
 * system's own choice. INV-TWIN-3, and the reason `'shaftBlocked'` is absent from
 * `STRUCTURAL_INELIGIBILITY`.
 *
 * Returned as `[lowM, highM]`, and **the range can be empty** (`low > high`) when the mate is
 * already closer than the clearance allows — which is what a car standing immediately below
 * its mate looks like. A caller reads an empty range as *nothing is reachable this instant*,
 * never as *nothing is reachable*.
 *
 * Under docs/11 OQ-2's two readings of the deadlock zone this is the **conservative** one: it
 * is bounded by where the mate is committed to be, not by which of the mate's scheduled stops
 * lie in the way. § D620 records the choice and the reason — the tight reading is only safe
 * while the mate's route cannot change, and a re-assigning dispatcher makes that false.
 */
export function reachableHeightRangeM(
  role: ShaftRole,
  mate: ShaftOccupantState,
  separation: ShaftSeparation,
  span: ShaftSpanM,
): readonly [number, number] {
  const gap = requiredGapM(separation);
  return role === 'lower'
    ? [span.lowestHeightM, protectedFloorM(mate, separation) - gap]
    : [protectedCeilingM(mate, separation) + gap, span.highestHeightM];
}

/**
 * Where this car may **ever** come to rest, given only the shaft's own extent.
 *
 * A constant of the building, and the deadlock prevention of docs/11 § 3.2. The lower car
 * cannot stand within one gap of the top of the shaft, because its mate would have to be above
 * the top to allow it; the upper car cannot stand within one gap of the bottom. A commitment
 * outside this range is discharged by **no** sequence of legal moves — INV-TWIN-2's liveness
 * failing at the instant the commitment is made rather than at the instant the car stops
 * moving — so it is refused at commitment time and never entered into.
 *
 * This is the whole of why a TWIN shaft is not two lifts: two of its floors are served by
 * exactly one of its two cars, and which two is fixed by the hardware.
 */
export function admissibleHeightRangeM(
  role: ShaftRole,
  separation: ShaftSeparation,
  span: ShaftSpanM,
): readonly [number, number] {
  const gap = requiredGapM(separation);
  return role === 'lower'
    ? [span.lowestHeightM, span.highestHeightM - gap]
    : [span.lowestHeightM + gap, span.highestHeightM];
}

/** Whether `heightM` lies within a range returned by either function above. */
export function withinRange(heightM: number, range: readonly [number, number]): boolean {
  return heightM >= range[0] && heightM <= range[1];
}

/**
 * The deadlock MERL's patent defines, in this repository's vocabulary.
 *
 * *"The lower car is carrying a passenger whose destination is at or above the upper car, and
 * the upper car is carrying a passenger whose destination is at or below the lower car"* —
 * reference data, cited in docs/11 § Sources and not measured here.
 *
 * **Stated over commitments rather than over positions**, because that is where it is created:
 * once both cars hold such a stop the passengers are aboard, and `Car` has no operation that
 * un-boards them. `true` here is a bug report about the instant the *second* of the two
 * commitments was accepted, and the only place it can be prevented is
 * {@link admissibleHeightRangeM} at commitment time plus the clearing move that discharges the
 * pair in sequence.
 *
 * **It is not, by itself, unresolvable**, and saying so is the point: two crossing commitments
 * are discharged in sequence by one car clearing out of the other's way and coming back, which
 * is exactly what `sim/simulation.ts` does. What makes a crossing pair *fatal* is a car with
 * nowhere to clear to, which is what {@link admissibleHeightRangeM} excludes. So this
 * predicate names the hazard for a diagnosis and a property, and the liveness argument is the
 * clearing move's rather than this function's.
 */
export function isCrossedCommitment(
  lowerStopHeightsM: readonly number[],
  upperStopHeightsM: readonly number[],
  lower: ShaftOccupantState,
  upper: ShaftOccupantState,
): boolean {
  const lowerWantsAbove = lowerStopHeightsM.some((heightM) => heightM >= upper.heightM);
  const upperWantsBelow = upperStopHeightsM.some((heightM) => heightM <= lower.heightM);
  return lowerWantsAbove && upperWantsBelow;
}
