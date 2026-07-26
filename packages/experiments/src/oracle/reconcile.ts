/**
 * The arithmetic of the Phase 2 acceptance gate: replication statistics, and the term-by-term
 * reconciliation of a measured up-peak round trip against the closed form.
 *
 * Pure functions over plain numbers. No RNG (CLAUDE.md invariant 2), no wall clock
 * (invariant 3), no mutation of any argument, no I/O, and no import of `@elevator-sim/core` —
 * see the note at the top of `./types.ts` for why.
 */

import type {
  ClosedFormRoundTrip,
  CompletedRoundTrip,
  MeasuredRoundTrip,
  ReconciliationTerm,
  ReplicationStatistic,
  RoundTripReconciliation,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Replication statistics
 * -------------------------------------------------------------------------- */

/**
 * Summarise a per-replication series.
 *
 * One value per replication, never one per event: `docs/03-traffic-and-statistics.md` § Part 3
 * is explicit that observations *within* a run are correlated, so a standard deviation taken
 * over individual round trips would understate the spread that matters and a standard error
 * derived from it would be nonsense. The unit of independence is the replication.
 *
 * @throws RangeError on an empty series, or on any non-finite value. A `NaN` that silently
 *   propagates into a mean is the single easiest way to publish a confident wrong number.
 */
export function summariseReplications(values: readonly number[]): ReplicationStatistic {
  if (values.length === 0) {
    throw new RangeError('summariseReplications: at least one replication is required');
  }
  for (const [index, value] of values.entries()) {
    if (!Number.isFinite(value)) {
      throw new RangeError(
        `summariseReplications: replication ${index} produced ${value}; every value must be finite`,
      );
    }
  }

  let total = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    total += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const count = values.length;
  const mean = total / count;

  if (count === 1) {
    return { count, mean, stdDev: Number.NaN, standardError: Number.NaN, min, max };
  }
  let sumSquares = 0;
  for (const value of values) sumSquares += (value - mean) ** 2;
  const stdDev = Math.sqrt(sumSquares / (count - 1));
  return { count, mean, stdDev, standardError: stdDev / Math.sqrt(count), min, max };
}

/** `(measured − reference) / reference`. @throws RangeError on a zero or non-finite reference. */
export function relativeDivergence(measured: number, reference: number): number {
  if (!Number.isFinite(reference) || reference === 0) {
    throw new RangeError(
      `relativeDivergence: reference must be finite and non-zero; received ${reference}`,
    );
  }
  if (!Number.isFinite(measured)) {
    throw new RangeError(`relativeDivergence: measured must be finite; received ${measured}`);
  }
  return (measured - reference) / reference;
}

/* -------------------------------------------------------------------------- *
 * Departure clustering
 * -------------------------------------------------------------------------- */

/**
 * The window in which a departure-clustering threshold is safe, derived from a building's own
 * timings rather than chosen.
 *
 * A run record stores boardings, not departures, so a departure is reconstructed by splitting
 * a car's terminal boardings wherever they are far enough apart. "Far enough" has to sit
 * between two real quantities:
 *
 * - **above** the longest pause *inside* one loading. That is a door reopen, and a reopen costs
 *   `openS + dwell + closeS` — the doors must finish closing before they can start opening
 *   again. It is not "a few seconds": on a centre-opening door with a 5 s hall dwell it is
 *   9.8 s bare, and around 20 s when a full load's transfer sets the dwell.
 * - **below** the shortest genuine round trip, which is out to the nearest served floor and
 *   back: two flights plus two stops' worth of fixed overhead.
 *
 * A threshold under the first counts one loading as two departures and reports an interval that
 * is too short — flatteringly. A threshold over the second merges two round trips and reports
 * one that is too long. Between them the answer is insensitive to the exact value, which is
 * what makes {@link DepartureGapBracket.midpointS} a defensible default.
 *
 * @throws RangeError if the bracket is empty, which means no threshold can separate the two and
 *   the reconstruction needs a different signal (a car-position series rather than boardings).
 */
export interface DepartureGapBracket {
  /** `openS + max(policy dwell, full-load transfer) + closeS`, seconds. */
  readonly maxReopenS: number;
  /** Terminal to the nearest served floor and back, seconds. */
  readonly minRoundTripS: number;
  /** The midpoint. Safe anywhere in `(maxReopenS, minRoundTripS)`. */
  readonly midpointS: number;
}

export function departureGapBracket(input: {
  readonly doorOpenS: number;
  readonly doorCloseS: number;
  readonly dwellHallCallS: number;
  readonly dwellCarCallS: number;
  /** `P · tp` for a full load — the transfer that can set the dwell above its policy value. */
  readonly fullLoadTransferS: number;
  /** Flight time terminal to nearest served floor, seconds. Jerk-limited, not `d/v`. */
  readonly nearestFloorFlightS: number;
  readonly motorStartDelayS: number;
  readonly levelingSettleS: number;
}): DepartureGapBracket {
  const maxReopenS =
    input.doorOpenS +
    Math.max(input.dwellHallCallS, input.dwellCarCallS, input.fullLoadTransferS) +
    input.doorCloseS;

  const legS =
    input.doorCloseS +
    input.motorStartDelayS +
    input.nearestFloorFlightS +
    input.levelingSettleS +
    input.doorOpenS;
  const minRoundTripS = 2 * legS + input.dwellHallCallS + input.dwellCarCallS;

  if (!(maxReopenS < minRoundTripS)) {
    throw new RangeError(
      `departureGapBracket: the longest door reopen (${maxReopenS.toFixed(2)} s) is not shorter ` +
        `than the shortest round trip (${minRoundTripS.toFixed(2)} s), so no clustering threshold ` +
        'can separate a reopen from a return. Reconstruct departures from car motion instead.',
    );
  }
  return { maxReopenS, minRoundTripS, midpointS: (maxReopenS + minRoundTripS) / 2 };
}

/* -------------------------------------------------------------------------- *
 * Reconciliation
 * -------------------------------------------------------------------------- */

/**
 * Default residual band for calling a divergence explained.
 *
 * `docs/05-roadmap.md` asks for agreement "within a few percent". 4 % is that, and it is a
 * *residual* band — the raw disagreement it is applied after can be 30 % and still pass,
 * provided every one of those 30 points is charged to a named simplification with a number
 * computed from reference data. Widening this to make a case pass is the failure mode CLAUDE.md
 * § Working agreements forbids; the honest move is to add the term that is missing.
 */
export const DEFAULT_RESIDUAL_TOLERANCE = 0.04;

/** How closely the completed breakdown's stop count must track the closed form's `S`. */
const STOP_AGREEMENT_TOLERANCE = 0.03;

/**
 * How closely the closed form's own terms must sum to its own total, relative to that total.
 *
 * Not float epsilon: a caller transcribing published figures to three decimals is legitimate,
 * and `1e-4` of a 150 s round trip is 15 ms. A caller whose terms miss by more than that has
 * mixed two evaluations — different `P`, or different `tp` — and the reconciliation below would
 * silently attribute the difference to physics.
 */
const PARTITION_TOLERANCE = 1e-4;

/** Seconds below which a correction is treated as absent rather than reported as a term. */
const NEGLIGIBLE_TERM_S = 1e-6;

/**
 * Charge the closed form for what it documents as missing, and report what is left.
 *
 * ```text
 * corrected = completed.flightS + completed.dwellS + completed.fixedS
 *           = closedForm.roundTripTimeS
 *           + (completed.flightS − closedForm.travelTimeS)      constant-transit-speed,
 *                                                               stop-time-excludes-acceleration
 *           + (completed.dwellS  − closedForm.transferTimeS)    no-minimum-dwell
 *           + (completed.fixedS  − closedForm.stopTimeS)        should be ~0
 * residual  = (measured − corrected) / corrected
 * ```
 *
 * The two forms are the same expression whenever the closed form's three terms sum to its own
 * round trip, which they must; that identity is checked rather than assumed, because a caller
 * who assembled `closedForm` from two different evaluations — one `P` for the travel term and
 * another for the transfer term — would otherwise have the discrepancy quietly attributed to
 * physics.
 *
 * The third correction should vanish: both sides charge `(S+1)·(open + close + start + level)`.
 * It is carried anyway, and reported as an uncited term when non-zero, because the usual cause
 * is that the two sides disagree about how many stops the trip makes — which invalidates the
 * other two corrections rather than merely adding to them.
 *
 * **Both `closedForm` and `measured` must be at the same load.** The closed form is one-sided
 * in its travel and stop terms but not in `P`: a car that leaves the terminal part-full has a
 * legitimately shorter round trip, so a comparison made at `0.8 × capacity` against a simulator
 * that carried less reports a defect that is not there. Evaluate the closed form at the load
 * the simulator actually carried — `measured.passengersPerTrip.mean` — before calling this.
 * (`core/analytical`'s `CLOSED_FORM_COMPARISON_RULE` states the same precondition.)
 *
 * Pure: neither argument is mutated.
 */
export function reconcileRoundTrip(input: {
  readonly closedForm: ClosedFormRoundTrip;
  readonly completed: CompletedRoundTrip;
  readonly measured: MeasuredRoundTrip;
  readonly tolerance?: number | undefined;
}): RoundTripReconciliation {
  const { closedForm, completed, measured } = input;
  const tolerance = input.tolerance ?? DEFAULT_RESIDUAL_TOLERANCE;
  const warnings: string[] = [];

  const correctedRoundTripS = completed.flightS + completed.dwellS + completed.fixedS;
  const accelerationS = completed.flightS - closedForm.travelTimeS;
  const dwellS = completed.dwellS - closedForm.transferTimeS;
  const stopBookkeepingS = completed.fixedS - closedForm.stopTimeS;

  const closedFormPartsS = closedForm.travelTimeS + closedForm.stopTimeS + closedForm.transferTimeS;
  if (
    Math.abs(closedFormPartsS - closedForm.roundTripTimeS) >
    PARTITION_TOLERANCE * Math.abs(closedForm.roundTripTimeS)
  ) {
    warnings.push(
      `the closed form's terms sum to ${closedFormPartsS.toFixed(3)} s but its round trip is ` +
        `${closedForm.roundTripTimeS.toFixed(3)} s. travel + stop + transfer must partition RTT; ` +
        'a mismatch means the terms came from two different evaluations, and the corrections ' +
        'below would absorb the difference as if it were physics.',
    );
  }
  if (accelerationS < 0) {
    warnings.push(
      `the acceleration correction is negative (${accelerationS.toFixed(3)} s). A jerk-limited ` +
        'flight cannot beat the same distance at rated speed, so either the completed model is ' +
        'not flying the same itinerary or the closed form was evaluated at a different H.',
    );
  }
  if (dwellS < 0) {
    warnings.push(
      `the dwell correction is negative (${dwellS.toFixed(3)} s). max(policy dwell, transfer) ` +
        'cannot be under the transfer alone, so the two sides disagree about tp or about P.',
    );
  }

  const stopDivergence = relativeDivergence(measured.stopsPerTrip.mean, closedForm.expectedStops);
  if (Math.abs(stopDivergence) > STOP_AGREEMENT_TOLERANCE) {
    warnings.push(
      `measured stops per trip (${measured.stopsPerTrip.mean.toFixed(3)}) differ from the closed ` +
        `form's S (${closedForm.expectedStops.toFixed(3)}) by ` +
        `${(stopDivergence * 100).toFixed(1)} %. The two sides are not describing the same trip, ` +
        'so the timing corrections below explain nothing. Check the load and the destination ' +
        'distribution before reading any further.',
    );
  }
  if (Math.abs(relativeDivergence(completed.stops, closedForm.expectedStops)) > STOP_AGREEMENT_TOLERANCE) {
    warnings.push(
      `the completed model's stop count (${completed.stops.toFixed(3)}) differs from the closed ` +
        `form's S (${closedForm.expectedStops.toFixed(3)}); it is meant to be the same population ` +
        'model with different physics, so a difference here is a bug in the completed model.',
    );
  }

  const term = (assumptionIds: readonly string[], secondsS: number): ReconciliationTerm => ({
    assumptionIds,
    secondsS,
    fractionOfClosedForm: secondsS / closedForm.roundTripTimeS,
  });
  const terms = [
    term(['constant-transit-speed', 'stop-time-excludes-acceleration'], accelerationS),
    term(['no-minimum-dwell'], dwellS),
    term([], stopBookkeepingS),
  ]
    .filter((entry) => Math.abs(entry.secondsS) > NEGLIGIBLE_TERM_S)
    .sort((a, b) => Math.abs(b.secondsS) - Math.abs(a.secondsS));

  const residual = relativeDivergence(measured.roundTripS.mean, correctedRoundTripS);
  return {
    rawDivergence: relativeDivergence(measured.roundTripS.mean, closedForm.roundTripTimeS),
    correctedRoundTripS,
    residual,
    terms,
    explained: Math.abs(residual) <= tolerance && warnings.length === 0,
    tolerance,
    stopDivergence,
    warnings,
  };
}

/**
 * How badly the closed form's constant-speed simplification bites a given machine, as a
 * dimensionless number that can be compared across buildings.
 *
 * Two quantities, and the second is the one that surprises:
 *
 * - `accelerationDistanceM = v²/a` — how far the car travels getting to rated speed. When this
 *   exceeds the interfloor rise the car **never reaches rated speed on a one-floor hop**, and
 *   `tv = df/v` is not an approximation of the flight time so much as a fiction.
 * - `lossPerFlightS = v/a + a/j` — the seconds a jerk-limited flight costs over `d/v`, once it
 *   does reach rated speed. It is a property of the machine and **does not shrink with the
 *   distance flown**, so its weight relative to `tv` is what decides how wrong the closed form
 *   is per stop.
 *
 * The intuition that short buildings are worse for the closed form is therefore incomplete: a
 * 0.63 m/s hydraulic reaches rated speed in 0.66 m and loses 1.8 s against a `tv` of 4.76 s
 * (38 %), while a 2.5 m/s geared traction needs 6.25 m — more than its 3.8 m interfloor rise —
 * and loses 3.2 s against a `tv` of 1.52 s (211 %). The *fast* machine in the *taller* building
 * is five times worse served by the simplification.
 */
export function constantSpeedPenalty(input: {
  readonly ratedSpeedMps: number;
  readonly accelerationMps2: number;
  readonly jerkMps3: number;
  readonly interfloorDistanceM: number;
}): {
  readonly accelerationDistanceM: number;
  readonly reachesRatedSpeedInOneFloor: boolean;
  readonly lossPerFlightS: number;
  /** `tv = df / v`, the seconds the closed form charges for one floor. */
  readonly ratedSpeedTransitS: number;
  /** `lossPerFlightS / ratedSpeedTransitS`. Bigger is worse for the closed form. */
  readonly lossRelativeToTransit: number;
} {
  const { ratedSpeedMps: v, accelerationMps2: a, jerkMps3: j, interfloorDistanceM: df } = input;
  for (const [name, value] of [
    ['ratedSpeedMps', v],
    ['accelerationMps2', a],
    ['jerkMps3', j],
    ['interfloorDistanceM', df],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`constantSpeedPenalty: ${name} must be finite and positive; received ${value}`);
    }
  }
  const accelerationDistanceM = (v * v) / a;
  const lossPerFlightS = v / a + a / j;
  const ratedSpeedTransitS = df / v;
  return {
    accelerationDistanceM,
    reachesRatedSpeedInOneFloor: accelerationDistanceM <= df,
    lossPerFlightS,
    ratedSpeedTransitS,
    lossRelativeToTransit: lossPerFlightS / ratedSpeedTransitS,
  };
}
