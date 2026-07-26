/**
 * `starvation` — an escalating penalty on the longest-waiting call. Serves WT95 and % > 60 s.
 *
 * This is the fairness term, and it is the only one in the library that fixes the **tail**
 * rather than the mean. Every other term makes the average better; this one stops a particular
 * landing being sacrificed to the average.
 *
 * ```
 * a   = age of the OLDEST landing call this car already holds that this call would push back
 * raw = a² / STARVATION_HALF_COST_S                                          (seconds)
 * ```
 *
 * ## It is the age of the *oldest waiting call*, never the age of the call being scored
 *
 * This is the mistake the term is most often implemented as, so it is worth being blunt about
 * why the obvious version does not work. Charging a car for how long *this* call has waited
 * makes the call more expensive **for every car at once**, by the same amount, because the age
 * is a property of the call and not of any car. Adding the same constant to every candidate's
 * cost cannot change an `argmin`: it moves nobody, it merely inflates the reported cost. The
 * `waitTime` docstring already says this — *"a term that mixed the two would make an old call
 * cheap for every car at once, which moves nobody, whereas an escalating penalty on the
 * longest-waiting call moves exactly the right one"*.
 *
 * What *does* move the right car is charging a car for **deferring somebody who has already
 * waited too long**. The car that would push back a 90-second-old landing call in order to take
 * this new one pays; the car that reaches the new call without disturbing anybody does not. The
 * new call then goes to the car that is not already carrying the group's worst outstanding
 * wait, and the tail comes down. `starvation.test.ts` asserts the independence directly: moving
 * `call.registeredAt` across two minutes leaves the term bit-identical, while moving the
 * *committed* call's registration time changes it.
 *
 * ## Landing calls only
 *
 * `CommittedStop.registeredAt` is documented as existing to *"drive starvation terms"*, and it
 * is read only for stops that carry a **hall** call. A car call is a passenger already aboard:
 * their waiting time ended when they boarded, and the delay they suffer is `detourPenalty`'s to
 * price. Mixing the two would charge the same second of delay twice and would make an old car
 * call — someone who has been riding a while — look like a starving landing.
 *
 * ## Why "escalating" is quadratic, and why the escalation is in the raw value
 *
 * The raw value is convex in age everywhere: `d(raw)/da = 2a/H`, so each additional second of
 * age is worth more than the last. That is the operational content of "escalating" — a call
 * 20 seconds old is a mild preference, a call 100 seconds old is a near-veto, and the crossover
 * is smooth rather than a threshold that a call can sit just under.
 *
 * The escalation lives in the **raw** value rather than in the normalization because
 * `normalize.ts` offers exactly two maps and both are concave or linear: a saturating map
 * applied to a linear age would *decelerate* with age, which is precisely backwards for a tail
 * term. Composed with the saturating map the term becomes
 *
 * ```
 * normalized(a) = a² / (waitTimeS · H + a²)
 * ```
 *
 * a sigmoid in age: ~0.06 at 15 s, 0.20 at 30 s, **0.50 at 60 s**, 0.69 at 90 s, 0.80 at 120 s
 * with both references at their defaults. Half cost at sixty seconds is not a coincidence —
 * see {@link STARVATION_HALF_COST_S}.
 *
 * ## Delay-blind above zero, deliberately
 *
 * A stop either gets pushed back or it does not; how far is `existingCallDelay`'s business. The
 * split keeps the two terms non-degenerate: `existingCallDelay` is seconds of delay and
 * age-blind, `starvation` is age and delay-blind. A term that multiplied the two would be
 * neither, and a profile could not then buy fairness without also buying global optimality.
 *
 * Pure. Reads the shared {@link routeComparison}.
 */

import type { CostTermDefinition, TermContext } from '../types.js';

import { routeComparison } from './routeComparison.js';

/**
 * Seconds of age at which the escalation reaches the shared half-cost point, when
 * `normalization.waitTimeS` is also at its default.
 *
 * Sixty, and for the same reason `NORMALIZATION_DEFAULTS.waitTimeS` is sixty: it is the
 * threshold the **% > 60 s** metric reports against (docs/03-traffic-and-statistics.md). A call
 * that has waited exactly as long as the metric's own definition of "too long" costs half of
 * this term's range. That is a statement an engineer can argue with, which is the test of a good
 * reference.
 *
 * A constant of the term rather than a tunable, because a term cannot read configuration —
 * `TermContext` carries a car, a call, an estimate and an observation, and no config. The
 * curvature it controls is reachable from `normalization.waitTimeS`, which Phase 7 does tune:
 * the composed half-cost point is `sqrt(waitTimeS · H)`.
 */
export const STARVATION_HALF_COST_S = 60;

/**
 * Age of the oldest landing call this car holds that the new call would push back, seconds.
 *
 * `0` when the new call delays nothing, when the delayed stops are all car calls, or when the
 * car holds nothing at all. Exported because it is the quantity the term is *about*, and a test
 * that asserts on the escalation should be able to hold the age fixed and vary nothing else.
 */
export function oldestDelayedCallAgeS(context: TermContext): number {
  let oldest = 0;
  for (const { stop } of routeComparison(context).delayed) {
    if (!stop.hallCall) continue;
    const age = context.at - stop.registeredAt;
    if (age > oldest) oldest = age;
  }
  return oldest;
}

/**
 * The escalating penalty, in seconds.
 *
 * `age² / STARVATION_HALF_COST_S` — dimensionally s²/s = s, so it normalizes on the same
 * passenger-time reference as `waitTime` and the composed map is the sigmoid described in the
 * module docstring.
 */
export function starvationSeconds(context: TermContext): number {
  const age = oldestDelayedCallAgeS(context);
  if (age <= 0) return 0;
  return (age * age) / STARVATION_HALF_COST_S;
}

/**
 * Saturating on `waitTimeS`. The escalation is in the raw value, because both normalization
 * maps decelerate and a tail term must accelerate.
 */
export const starvationTerm: CostTermDefinition = Object.freeze({
  id: 'starvation',
  unit: 's',
  measures: 'Escalating penalty on the longest-waiting call',
  normalization: Object.freeze({ mode: 'saturating', scale: 'waitTimeS' } as const),
  evaluate: starvationSeconds,
});
