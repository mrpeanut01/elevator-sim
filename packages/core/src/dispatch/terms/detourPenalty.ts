/**
 * `detourPenalty` — the delay this call would impose on the people already **aboard**. Serves
 * fairness to the boarded.
 *
 * ```
 * raw = Σ over already-committed stops  alightingCount(stop) × secondsLater(stop)
 * ```
 *
 * Passenger-weighted, and that is the whole reason the term exists separately from
 * `existingCallDelay`. The two look similar and measure different things:
 *
 * | | counts | serves |
 * |---|---|---|
 * | `existingCallDelay` | seconds of delay, summed over **stops** | global optimality |
 * | `detourPenalty` | seconds of delay × **people aboard** who suffer it | fairness to the boarded |
 *
 * A detour that pushes back one stop where eight passengers get out is eight times the harm of
 * one that pushes back a stop where one does, and `marginalDelaySeconds` — which is a sum over
 * stops, by its own documentation — cannot say so. A car carrying nobody scores zero however
 * far it detours, which is correct: there is no one aboard to inconvenience.
 *
 * ## Who counts as "aboard"
 *
 * `CommittedStop.alightingCount`: passengers already in the car whose destination is that
 * floor. Not `boardingCount` — people still on a landing have not boarded, their delay is a
 * waiting-time cost, and it is priced by `existingCallDelay` and `starvation`. Keeping the two
 * populations apart is what stops the same second of delay being charged three times.
 *
 * ## The unit
 *
 * Passenger-seconds. It shares the `waitTimeS` reference with the passenger-time family, where
 * the half-cost point reads as *six people delayed ten seconds each* rather than as one person
 * delayed sixty — the same product, deliberately, because the term's claim is that those two
 * are equally bad.
 *
 * Pure. Reads the shared {@link routeComparison}; mutates nothing.
 */

import type { CostTermDefinition, TermContext } from '../types.js';

import { routeComparison } from './routeComparison.js';

/** Passenger-seconds of extra delay imposed on the people already aboard. Never negative. */
export function detourPassengerSeconds(context: TermContext): number {
  let total = 0;
  for (const { stop, addedSeconds } of routeComparison(context).delayed) {
    if (stop.alightingCount <= 0) continue;
    total += stop.alightingCount * addedSeconds;
  }
  return total;
}

/**
 * Saturating on `waitTimeS`, read as passenger-seconds. See the module docstring for why the
 * product rather than the mean, and `normalize.ts` § Reference scales for what 60 means here.
 */
export const detourPenaltyTerm: CostTermDefinition = Object.freeze({
  id: 'detourPenalty',
  unit: 'passenger·s',
  measures: 'Added delay imposed on already-onboard passengers',
  normalization: Object.freeze({ mode: 'saturating', scale: 'waitTimeS' } as const),
  evaluate: detourPassengerSeconds,
});
