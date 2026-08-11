/**
 * `loadFactor` — how full the car would be after serving this call. Serves capacity awareness.
 *
 * **The raw value is `CostEstimate.resultingLoadFactor`**, the car's own projection: everyone
 * bound for a floor it reaches first has alighted, everyone bound for the call floor alights
 * there, and the expected boarders are aboard, all measured against *rated* load. The car
 * computes it from real passenger masses rather than a head count times a nominal weight, which
 * is the whole point of drawing mass from a distribution — the load cell has something to
 * measure (CLAUDE.md § modeling rules). Re-deriving it here from occupancy would throw that
 * away and produce a second, coarser answer to a question the car has already answered
 * exactly.
 *
 * ## Bounded, not saturating — and the cap is not laziness
 *
 * ```
 * normalize(x) = clamp(x / 1.0, 0, 1)
 * ```
 *
 * Full scale is **1.0, rated load**, and it is a constant of the term rather than a tunable for
 * the reason `normalize.ts` gives: a linear map's scale is exactly a gain, so exposing it would
 * duplicate `weights.loadFactor` and hand a Phase 7 optimizer a degenerate direction.
 *
 * The cap at rated load costs nothing, because above it there is nothing left to discriminate:
 * `eligibility.maxLoadFactorForAssignment` refuses a car whose projected load exceeds its
 * ceiling and the load cell reports `overload` at 1.1, so a car arriving above rated has
 * already been filtered out at stage 2. Extra resolution there would be resolution on cars that
 * cannot be chosen. This is the case `normalize.ts` says a clamp is *right* for, as against
 * `waitTime`, where clamping would stop distinguishing two distant cars exactly when the choice
 * matters most.
 *
 * ## Why it is monotone rather than convex
 *
 * The penalty rises in a straight line with occupancy: 40% is twice 20%, and 80% is twice 40%.
 * A convex map biting hardest near capacity is a defensible alternative and it needs an
 * exponent, which would be a genuine tunable — and a term cannot read a tunable, because
 * `TermContext` carries a car, a call, an estimate and an observation, and no configuration.
 * Introducing one as a hidden constant would be exactly the thing CLAUDE.md invariant 8 exists
 * to prevent. The convexity that *is* available is already in the system: the bypass threshold
 * at 0.8 is a hard step the load cell owns, and `crowding` prices the passengers a nearly-full
 * car would leave on the landing.
 *
 * Pure. Reads one number off the shared estimate.
 */

import type { CostTermDefinition, TermContext } from '../types.js';

/**
 * The car's projected load after the call, as a fraction of rated load.
 *
 * Clamped below at zero: a negative load factor would mean the mass projection went below an
 * empty car, which is a bug in the estimator rather than a car owed a bonus.
 */
export function resultingLoadFactor(context: TermContext): number {
  const projected = context.estimate.resultingLoadFactor;
  /* c8 ignore next -- a non-finite load factor means the load cell produced nonsense. */
  if (!Number.isFinite(projected)) return 1;
  return Math.max(0, projected);
}

/** Bounded on rated load. See the module docstring for why the cap is free here. */
export const loadFactorTerm: CostTermDefinition = Object.freeze({
  id: 'loadFactor',
  unit: '',
  measures: 'Penalty rising as the car approaches capacity',
  // Everyday Mode's words for this term — engine contract §6.3, issue #147. Two readers,
  // two vocabularies: `measures` stays addressed to an optimizer, these to a player.
  player: Object.freeze({
    name: 'load factor',
    serves: 'leaving room in a car',
    atZero: 'cram them in',
    atFull: 'leave room to board',
  } as const),
  normalization: Object.freeze({ mode: 'bounded', fullScale: 1 } as const),
  evaluate: resultingLoadFactor,
});
