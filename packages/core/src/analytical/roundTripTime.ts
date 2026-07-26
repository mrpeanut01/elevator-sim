/**
 * The closed-form up-peak round trip time (Barney / CIBSE Guide D).
 *
 * Pure arithmetic over plain numbers. No configuration, no kernel, no RNG, no wall clock,
 * and — by design — no knowledge that a simulator exists. This file is the oracle; if it
 * imported anything the simulation also uses, a shared bug would agree with itself.
 *
 * ```text
 * S    = N · (1 − ((N−1)/N)^P)
 * H    = N − Σ_{i=1..N−1} (i/N)^P
 * RTT  = 2·(H·tv + tx) + (S+1)·ts + 2·P·tp
 * INT  = RTT / L
 * HC   = 300·P·L / RTT
 * %POP = HC / U × 100
 * ```
 *
 * Every simplification baked into those five lines is enumerated in
 * {@link CLOSED_FORM_ASSUMPTIONS}; read it before comparing anything to a simulation.
 */

import {
  ANALYTICAL_DEFAULTS,
  HANDLING_CAPACITY_WINDOW_S,
  type ResolvedRoundTripTerms,
  type RoundTripResult,
  type RoundTripTerms,
} from './types.js';

// ---------------------------------------------------------------------------
// Domain guards
// ---------------------------------------------------------------------------

function requireFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number; received ${value}`);
  }
  return value;
}

function requireFiniteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number; received ${value}`);
  }
  return value;
}

function requireFinitePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite, positive number; received ${value}`);
  }
  return value;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be an integer of at least 1; received ${value}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// S — expected number of stops
// ---------------------------------------------------------------------------

/**
 * `S = N · (1 − ((N−1)/N)^P)` — the expected number of **distinct** floors at which a car
 * carrying `P` passengers stops, when each passenger's destination is drawn independently
 * and uniformly from `N` floors.
 *
 * ## Derivation
 *
 * Fix one floor `f`. A single passenger misses it with probability `(N−1)/N`; `P`
 * independent passengers all miss it with probability `((N−1)/N)^P`. So
 *
 * ```text
 * P(the car stops at f) = 1 − ((N−1)/N)^P
 * ```
 *
 * Let `Xf` be the indicator that the car stops at `f`. The number of stops is `Σf Xf`, and
 * expectation is linear **whether or not the `Xf` are independent** (they are not — a
 * passenger who chooses floor 7 cannot also choose floor 8). Hence
 *
 * ```text
 * S = E[Σf Xf] = Σf E[Xf] = N · (1 − ((N−1)/N)^P)
 * ```
 *
 * This is the classic coupon-collector-style occupancy result, and it is exact for the
 * uniform model — the approximation is in the *model* (uniform destinations, exactly `P`
 * passengers), never in this formula.
 *
 * ## Implementation note
 *
 * Evaluated as `−N · expm1(P · log1p(−1/N))` rather than literally. For a tall building
 * with a light load — `N = 60`, `P = 2` — the literal form computes `1 − 0.9672…` and
 * throws away most of the mantissa in the subtraction; `expm1`/`log1p` keep full relative
 * precision. The two agree to the last bit wherever the literal form is well conditioned.
 *
 * `P` need not be an integer: the standard `P = 0.8 × capacity` is normally fractional.
 *
 * @param floors `N`, floors served above the terminal. A positive integer.
 * @param passengers `P`, passengers per trip. Positive; need not be an integer.
 * @throws RangeError if either argument is outside its domain.
 */
export function expectedStops(floors: number, passengers: number): number {
  requirePositiveInteger(floors, 'floors (N)');
  requireFinitePositive(passengers, 'passengers (P)');

  // N = 1: log1p(-1) is -Infinity, P·(-Infinity) is -Infinity, expm1(-Infinity) is -1,
  // so S = 1. Correct: with one destination floor the car always makes exactly one stop.
  return -floors * Math.expm1(passengers * Math.log1p(-1 / floors));
}

// ---------------------------------------------------------------------------
// H — expected highest reversal floor
// ---------------------------------------------------------------------------

/**
 * `H = N − Σ_{i=1..N−1} (i/N)^P` — the expected highest floor reached by a car carrying
 * `P` passengers whose destinations are drawn independently and uniformly from `N` floors,
 * expressed as an ordinal in `[1, N]` over the served floors.
 *
 * ## Derivation
 *
 * Let `M = max(D₁ … D_P)` where each `Dₖ` is uniform on `{1 … N}`. All `P` destinations lie
 * at or below floor `i` exactly when the maximum does, so
 *
 * ```text
 * Pr(M ≤ i) = (i/N)^P
 * ```
 *
 * For a random variable on `{1 … N}`, the tail-sum identity gives
 *
 * ```text
 * E[M] = Σ_{i=0}^{N−1} Pr(M > i)
 *      = Σ_{i=0}^{N−1} (1 − (i/N)^P)
 *      = N − Σ_{i=0}^{N−1} (i/N)^P
 *      = N − Σ_{i=1}^{N−1} (i/N)^P
 * ```
 *
 * the last step because the `i = 0` term is `0^P = 0` for any `P > 0`. That is the
 * expression stated in `docs/03-traffic-and-statistics.md` Part 2, and it is exact for the
 * uniform model.
 *
 * ## Two sanity anchors, checkable by hand
 *
 * - `P = 1`: the highest floor *is* the single destination, so `H` must be the mean of a
 *   uniform draw, `(N+1)/2`. And indeed `N − Σ_{i=1}^{N−1} i/N = N − (N−1)/2 = (N+1)/2`.
 * - `N = 2, P = 2`: `H = 2 − (1/2)² = 1.75`, matching `1·¼ + 2·¾` directly.
 *
 * ## Why `H` is so close to `N` in practice
 *
 * With `P = 12.8` passengers over `N = 19` floors, `H ≈ 18.07`. That is not a bug: a fully
 * loaded up-peak car almost always contains somebody going near the top, which is precisely
 * why up-peak round trips are dominated by the full-height run and why express zoning pays.
 *
 * @param floors `N`, floors served above the terminal. A positive integer.
 * @param passengers `P`, passengers per trip. Positive; need not be an integer.
 * @throws RangeError if either argument is outside its domain.
 */
export function highestReversalFloor(floors: number, passengers: number): number {
  requirePositiveInteger(floors, 'floors (N)');
  requireFinitePositive(passengers, 'passengers (P)');

  let tail = 0;
  for (let i = 1; i <= floors - 1; i += 1) {
    tail += Math.pow(i / floors, passengers);
  }
  return floors - tail;
}

// ---------------------------------------------------------------------------
// The derived quantities
// ---------------------------------------------------------------------------

/**
 * `INT = RTT / L` — the mean interval between successive car departures from the terminal.
 *
 * The headline design number: `docs/03-traffic-and-statistics.md` Part 1 sets targets of
 * ≤ 25 s (prestige office) through 50–90 s (residential) against it.
 */
export function interval(roundTripTimeS: number, carsInGroup: number): number {
  requireFinitePositive(roundTripTimeS, 'roundTripTimeS (RTT)');
  requirePositiveInteger(carsInGroup, 'carsInGroup (L)');
  return roundTripTimeS / carsInGroup;
}

/**
 * `HC = 300·P·L / RTT` — persons the **whole group** handles per 5 minutes.
 *
 * Equivalently `300·P / INT`: each car completes `300/RTT` round trips in the window and
 * carries `P` people on each, and there are `L` of them.
 *
 * `docs/03-traffic-and-statistics.md` Part 2 states `HC5 = 300·P·L / RTT = 300·P / INT`,
 * which is this function. It previously omitted `L` — stating the **per-car** figure while
 * the `%POP` line immediately below divided it by the whole building population — and the
 * two were a factor of `L` apart: 25.68 rather than 102.71 persons per 5 minutes on Midtown
 * Office, and `%POP` of 1.50 % against a Part 1 office target of 11–15 %, which reads as a
 * building under-elevatored by 8× rather than by 2×. `L` is in the doc's term table and
 * CIBSE Guide D and Barney both carry it (`UPPHC = 300·P / INT`), so the group form is the
 * intended one. {@link RoundTripResult.handlingCapacityPerCar5Min} returns the per-car
 * figure alongside it so the factor is visible rather than silently chosen.
 */
export function handlingCapacity5Min(
  passengersPerTrip: number,
  roundTripTimeS: number,
  carsInGroup: number,
): number {
  requireFinitePositive(passengersPerTrip, 'passengersPerTrip (P)');
  requireFinitePositive(roundTripTimeS, 'roundTripTimeS (RTT)');
  requirePositiveInteger(carsInGroup, 'carsInGroup (L)');
  return (HANDLING_CAPACITY_WINDOW_S * passengersPerTrip * carsInGroup) / roundTripTimeS;
}

/**
 * `%POP = HC / U × 100` — handling capacity as a percentage of the population served, per
 * 5 minutes.
 *
 * This is the number the demand targets in `docs/03-traffic-and-statistics.md` Part 1 are
 * quoted in (11–15% for a standard office, 3–7% residential). A building whose `%POP` sits
 * below its target is under-elevatored: demand exceeds capacity, queues grow without bound,
 * and the simulator should flag it `SATURATED` rather than report a mean waiting time.
 */
export function percentPopulation(handlingCapacityPer5Min: number, population: number): number {
  requireFiniteNonNegative(handlingCapacityPer5Min, 'handlingCapacityPer5Min (HC)');
  requireFinitePositive(population, 'population (U)');
  return (handlingCapacityPer5Min / population) * 100;
}

// ---------------------------------------------------------------------------
// RTT
// ---------------------------------------------------------------------------

/**
 * Evaluate the closed form, returning every intermediate term.
 *
 * ```text
 * RTT = 2·(H·tv + tx) + (S+1)·ts + 2·P·tp
 * ```
 *
 * Term by term:
 *
 * - `2·H·tv` — the car climbs to its highest reversal floor and comes back down. Distance
 *   is measured in floor units from a virtual origin one interfloor distance below the
 *   lowest served floor, which is why a zoned bank needs `tx` as well.
 * - `2·tx` — the express run below the served zone, out and back. Zero unless supplied.
 * - `(S+1)·ts` — one stop per distinct destination floor, **plus one** for the stop at the
 *   terminal itself, where the car opens up and loads.
 * - `2·P·tp` — every passenger boards at the terminal and alights upstairs.
 *
 * With `expressJumpS` left at its default of `0` this is exactly the expression published
 * in CIBSE Guide D and in `docs/03-traffic-and-statistics.md` Part 2.
 *
 * Pure: the argument is not mutated and nothing is memoised.
 *
 * @throws RangeError if any term is outside its domain — a fractional floor count, a
 *   negative duration, a non-positive population. The closed form produces plausible
 *   nonsense from bad inputs rather than obvious nonsense, so it validates eagerly.
 */
export function roundTripTime(terms: RoundTripTerms): RoundTripResult {
  const resolved: ResolvedRoundTripTerms = {
    floorsAboveTerminal: requirePositiveInteger(terms.floorsAboveTerminal, 'floorsAboveTerminal (N)'),
    passengersPerTrip: requireFinitePositive(terms.passengersPerTrip, 'passengersPerTrip (P)'),
    singleFloorTransitS: requireFiniteNonNegative(terms.singleFloorTransitS, 'singleFloorTransitS (tv)'),
    stopTimeLossS: requireFiniteNonNegative(terms.stopTimeLossS, 'stopTimeLossS (ts)'),
    passengerTransferS: requireFiniteNonNegative(terms.passengerTransferS, 'passengerTransferS (tp)'),
    carsInGroup: requirePositiveInteger(terms.carsInGroup, 'carsInGroup (L)'),
    population: requireFinitePositive(terms.population, 'population (U)'),
    // May legitimately be slightly negative; see RoundTripTerms.expressJumpS. The travel
    // term it feeds is checked for sign below instead.
    expressJumpS: requireFinite(
      terms.expressJumpS ?? ANALYTICAL_DEFAULTS.expressJumpS,
      'expressJumpS (tx)',
    ),
  };

  const stops = expectedStops(resolved.floorsAboveTerminal, resolved.passengersPerTrip);
  const highest = highestReversalFloor(resolved.floorsAboveTerminal, resolved.passengersPerTrip);

  const travelTimeS = 2 * (highest * resolved.singleFloorTransitS + resolved.expressJumpS);
  const stopTimeS = (stops + 1) * resolved.stopTimeLossS;
  const transferTimeS = 2 * resolved.passengersPerTrip * resolved.passengerTransferS;
  const roundTripTimeS = travelTimeS + stopTimeS + transferTimeS;

  if (travelTimeS < 0) {
    throw new RangeError(
      `roundTripTime: travel time is negative (${travelTimeS} s). expressJumpS (${resolved.expressJumpS}) is more negative than H·tv, which describes a terminal above the served zone rather than below it.`,
    );
  }
  if (roundTripTimeS <= 0) {
    // Reachable only from an all-zero timing set, which is a caller error rather than a
    // building: it would make interval and handling capacity infinite.
    throw new RangeError(
      'roundTripTime: every timing term is zero, so RTT is zero and interval and handling capacity are undefined',
    );
  }

  const intervalS = interval(roundTripTimeS, resolved.carsInGroup);
  const groupCapacity = handlingCapacity5Min(
    resolved.passengersPerTrip,
    roundTripTimeS,
    resolved.carsInGroup,
  );

  return {
    terms: resolved,
    expectedStops: stops,
    highestReversalFloor: highest,
    travelTimeS,
    stopTimeS,
    transferTimeS,
    roundTripTimeS,
    intervalS,
    handlingCapacityPerCar5Min:
      (HANDLING_CAPACITY_WINDOW_S * resolved.passengersPerTrip) / roundTripTimeS,
    handlingCapacity5Min: groupCapacity,
    percentPopulation5Min: percentPopulation(groupCapacity, resolved.population),
  };
}
