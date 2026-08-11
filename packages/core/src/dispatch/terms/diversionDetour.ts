/**
 * `diversionDetour` — the delay imposed on the people already **aboard**, charged *only* when
 * serving this call would cut the car's current run short. Serves fairness to the boarded, without
 * taxing traffic the diversion mechanism never touches.
 *
 * ```
 * raw = (this call would truncate the run) ? detourPassengerSeconds : 0
 * ```
 *
 * ## Why this is a separate term and not a weight on `detourPenalty`
 *
 * [`DECISIONS.md` § D210](../../../../../DECISIONS.md) measured the difference and it is the whole
 * reason this file exists. `collective-enroute` prices the detour with a **constant**
 * `detourPenalty: 0.2`, and under pure up-peak the diversion mechanism fires **zero** times while
 * that weight goes on re-ordering car choices anyway — costing AWT `+0.261 [+0.118, +0.404]` and
 * TTD `+0.199 [+0.041, +0.357]` at `secure-up-peak` for a mechanism that is not running. The
 * contrast that isolates the mechanism there is exactly `[0.000, 0.000]` on both metrics at two
 * seeds. The price tag, not the mechanism, is what refused adoption.
 *
 * No weight on `detourPenalty` can fix that, and *that* is what makes this a genuinely new cost
 * term rather than a tuning problem (CLAUDE.md invariant 7): the required function is zero at
 * up-peak and non-zero at down-peak, and `detourPenalty`'s raw value is non-zero at both. A scalar
 * cannot separate them.
 *
 * | | charges when | zero when |
 * |---|---|---|
 * | `detourPenalty` | the call delays anyone aboard, however the car gets there | the car is empty, or nothing is pushed back |
 * | `diversionDetour` | *and* the call truncates a committed run | additionally: car at rest, diversion disabled, or the stop was already on the route |
 *
 * ## What it deliberately does not do
 *
 * It does not replace `detourPenalty`, gate it, or deprecate it. `predictive-balanced` weights that
 * term at 0.4 with no diversion configured and legitimately wants general detour pricing, and
 * § D211 § 0 measured that the general pricing is worth having: with diversion switched **off**, the
 * constant weight still buys TTD `−0.930 [−1.263, −0.598]` at `vertical-city` down-peak 2 %. A
 * conditional term forfeits that third of the benefit by construction. It is bought back by being
 * free to weight this term harder — it costs exactly nothing wherever no diversion occurs, which is
 * the property the constant could never have.
 *
 * ## The condition, precisely
 *
 * The run is cut short at a floor it would **not** otherwise be cut short at. A car already
 * diverting to floor X for a stop it holds, given a call that is also at X, is making a stop it was
 * making anyway and is charged nothing. The comparison is against `runCutShortAt` with and without
 * the hypothetical stop, so it agrees with `projectRoute` by construction rather than by
 * inspection.
 *
 * Pure. Reads the shared {@link routeComparison} and the snapshot; mutates nothing.
 */

import { requestedStop, runCutShortAt } from '../../model/car/estimateCost.js';
import type { CostTermDefinition, TermContext } from '../types.js';

import { detourPassengerSeconds } from './detourPenalty.js';

/**
 * Whether serving this call would truncate the car's current run at a floor it would not
 * otherwise stop short at.
 *
 * Exported for `diversionDetour.test.ts`, which drives each of the four ways this returns `false`
 * separately — a single test that only ever saw a stationary car would pass on a term that was
 * inert for every other reason too.
 */
export function callCausesDiversion(context: TermContext): boolean {
  const extra = requestedStop(context.car, context.request);
  if (extra === undefined) return false;

  const withCall = runCutShortAt(context.car, extra);
  // No truncation with the call: the car is at rest, the profile forbids diversion, or nothing on
  // the route is reachable before where it is already going.
  if (withCall === undefined) return false;

  // The car was already going to be cut short here. The call is not causing the diversion, it is
  // joining a stop the run was making anyway, so there is nothing to charge it for.
  const without = runCutShortAt(context.car);
  return without === undefined || without.floorIndex !== withCall.floorIndex;
}

/** Passenger-seconds of extra onboard delay, charged only on a diverting assignment. */
export function diversionDetourPassengerSeconds(context: TermContext): number {
  return callCausesDiversion(context) ? detourPassengerSeconds(context) : 0;
}

/**
 * Saturating on `waitTimeS`, read as passenger-seconds — the same scale and reading as
 * `detourPenalty`, deliberately, so the two weights are directly comparable to a reader and to a
 * search.
 *
 * `activeWhen` is not decoration, and it is the reason this term does not fail `liveness.test.ts`
 * for the wrong reason. Under every profile that leaves `eligibility.enRouteDiversion` off — which
 * is every shipped profile as of § D210 — `Simulation.#snapshots` populates no
 * `divertFrontierIndex`, so `runCutShortAt` is `undefined` for every car and this term returns 0
 * for all of them. Declaring the condition is what lets a generic optimizer skip a dimension that
 * cannot move an `argmin` (CLAUDE.md invariant 8, docs/06 § The parameter schema) instead of
 * burning replications on it.
 */
export const diversionDetourTerm: CostTermDefinition = Object.freeze({
  id: 'diversionDetour',
  unit: 'passenger·s',
  measures: 'Added delay imposed on already-onboard passengers, when the call diverts the car',
  // Everyday Mode's words for this term — engine contract §6.3, issue #147. Two readers,
  // two vocabularies: `measures` stays addressed to an optimizer, these to a player.
  player: Object.freeze({
    name: 'diversion detour',
    serves: 'fairness to the boarded without taxing untouched traffic',
    atZero: 'divert freely',
    atFull: 'protect the people aboard',
  } as const),
  normalization: Object.freeze({ mode: 'saturating', scale: 'waitTimeS' } as const),
  activeWhen: Object.freeze({ 'eligibility.enRouteDiversion': Object.freeze(['true']) }),
  evaluate: diversionDetourPassengerSeconds,
});
