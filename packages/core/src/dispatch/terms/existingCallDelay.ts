/**
 * `existingCallDelay` — seconds of extra delay this call would impose on the calls the car has
 * already been given. Serves global optimality.
 *
 * ## It is `CostEstimate.marginalDelaySeconds`, not a second opinion
 *
 * **The raw value is read straight off `context.estimate.marginalDelaySeconds` rather than
 * recomputed.** That field is defined as exactly this quantity — *"the sum, over every stop the
 * car had already committed to, of how much later it would be reached"* — and it is already
 * computed once per (car, call) by the eligibility filter, from the same pair of route
 * projections. Recomputing it here would cost a second pair of projections to produce the same
 * number, and, worse, would create two definitions of "added delay" that could drift: the
 * dispatcher would then be able to reject a car on one and price it on the other, and the
 * cheaper of two inconsistent answers wins every time.
 *
 * `routeComparison.test.ts` pins the identity from the other side — the shared route
 * comparison's own delayed-stop sum equals `marginalDelaySeconds` — so if the car's estimator
 * ever changed its mind about what a delay is, a test says so rather than a term silently
 * disagreeing with it.
 *
 * ## Summed over stops, on purpose
 *
 * Five stops each two seconds later is ten, not two. `CostEstimate` is explicit that the sum is
 * the contract and that a passenger-weighted variant *"belongs in the dispatcher's term
 * normalization, not here"* — that variant is `detourPenalty`, which weights by the people
 * aboard. The two are complementary and are both in the library for that reason.
 *
 * Pure. Reads one number off the shared estimate; touches nothing.
 */

import type { CostTermDefinition, TermContext } from '../types.js';

/**
 * Seconds of added delay to the car's already-committed stops.
 *
 * Clamped at zero for the same reason `waitTimeSeconds` is: an infeasible estimate reports
 * `marginalDelaySeconds: 0`, and no route can be reached *sooner* by adding a stop to it, so a
 * negative value would mean the estimator was wrong rather than that the car had earned a
 * bonus.
 */
export function existingCallDelaySeconds(context: TermContext): number {
  return Math.max(0, context.estimate.marginalDelaySeconds);
}

/** Seconds, on the passenger-time reference: 60 s of total added delay is the half-cost point. */
export const existingCallDelayTerm: CostTermDefinition = Object.freeze({
  id: 'existingCallDelay',
  unit: 's',
  measures: 'Added delay to other already-assigned calls',
  // Everyday Mode's words for this term — engine contract §6.3, issue #147. Two readers,
  // two vocabularies: `measures` stays addressed to an optimizer, these to a player.
  player: Object.freeze({
    name: 'existing call delay',
    serves: 'the good of the whole group',
    atZero: 'answer this call',
    atFull: 'protect the calls already made',
  } as const),
  normalization: Object.freeze({ mode: 'saturating', scale: 'waitTimeS' } as const),
  evaluate: existingCallDelaySeconds,
});
