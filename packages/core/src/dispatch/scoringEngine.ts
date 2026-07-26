/**
 * The scoring engine — stage 3, and the whole of CLAUDE.md invariant 7.
 *
 * ```
 * cost(car, call) = Σᵢ wᵢ · normalize(termᵢ(car, call))
 * ```
 *
 * That line is the entire algorithm. Everything a dispatcher "is" — nearest car, minimum
 * wait, collective, energy-aware, fairness-first — is the vector `w` and a handful of stage
 * settings, read from `data/dispatcher-profiles.json`. This file contains no strategy name,
 * no profile id, and no `if`, and it must stay that way: the moment a strategy needs a code
 * path, the framework has stopped being expressive enough and the honest fix is a new *term*,
 * not a new branch.
 *
 * ## What the engine does not do
 *
 * - **It does not call `estimateCost`.** The estimate arrives on the {@link TermContext},
 *   computed once per (car, call) by the eligibility filter that already needed it. Twelve
 *   terms therefore cost one route projection, not twelve.
 * - **It does not filter.** An infeasible car never reaches here; feasibility is a hard
 *   filter and a large cost is not the same thing.
 * - **It does not renormalize the weights.** They are used as authored. Scaling every weight
 *   by a constant cannot change an `argmin`, so the ranking is unaffected — but the cost
 *   *number* is comparable only within a profile, and nothing downstream should compare a
 *   `nearest-car` cost against an `eta` cost as if they were the same quantity.
 *
 * ## Determinism
 *
 * Terms accumulate in registry order, so two profiles weighting the same terms produce
 * bit-identical sums. Ranking is by `(cost, carId)` — a total order that does not depend on
 * the order the caller supplied the cars in, so a decision cannot change because a bank
 * iterated its cars differently (CLAUDE.md invariant 4's spirit, applied to dispatch).
 *
 * Pure throughout: no clock, no RNG, no mutation of anything passed in.
 */

import { normalizeTerm } from './normalize.js';
import { COST_TERMS } from './terms/index.js';
import {
  DispatchError,
  type CarScore,
  type CostTermDefinition,
  type ResolvedNormalization,
  type ScoreBreakdown,
  type TermContext,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * One car
 * -------------------------------------------------------------------------- */

/**
 * The weighted cost of one car for one call, with every term's contribution.
 *
 * Terms with a zero weight are skipped rather than evaluated: a zero contribution is a zero
 * contribution, and skipping keeps a one-term profile as cheap as it looks. They are also
 * absent from `terms`, so a breakdown lists what actually decided the score.
 *
 * @throws DispatchError if a term returns a non-finite or negative raw value. A cost term is a
 *   cost: a negative one would let one car be rewarded for a property another is punished for,
 *   and the weighted sum would stop being monotonic in its own weights.
 */
export function scoreCar(
  context: TermContext,
  weights: ReadonlyMap<string, number>,
  normalization: ResolvedNormalization,
  terms: readonly CostTermDefinition[] = COST_TERMS,
): CarScore {
  const breakdowns: ScoreBreakdown[] = [];
  let cost = 0;

  for (const term of terms) {
    const weight = weights.get(term.id);
    if (weight === undefined || weight === 0) continue;

    const raw = term.evaluate(context);
    if (!Number.isFinite(raw) || raw < 0) {
      throw new DispatchError(
        `Cost term "${term.id}" returned ${raw} for car "${context.car.carId}" on call "${context.call.id}". A term must return a finite, non-negative value in ${term.unit === '' ? 'its own units' : term.unit}.`,
      );
    }

    const normalized = normalizeTerm(term, raw, normalization);
    const contribution = weight * normalized;
    cost += contribution;
    breakdowns.push(Object.freeze({ termId: term.id, weight, raw, normalized, contribution }));
  }

  return Object.freeze({
    carId: context.car.carId,
    cost,
    estimate: context.estimate,
    terms: Object.freeze(breakdowns),
  });
}

/* -------------------------------------------------------------------------- *
 * Ranking
 * -------------------------------------------------------------------------- */

/**
 * Total order on scores: cheapest first, ties broken by car id.
 *
 * The tie-break is what makes a decision reproducible. Two cars with identical costs are
 * common — a symmetric bank at t=0 has every car at the lobby — and leaving the winner to
 * `Array.prototype.sort`'s stability would make it depend on the order the caller happened to
 * iterate the bank in. That is the dispatch-layer form of the determinism rule the event queue
 * follows: never break a tie by insertion order into something that could be reordered.
 */
export function compareScores(a: CarScore, b: CarScore): number {
  if (a.cost !== b.cost) return a.cost - b.cost;
  return a.carId < b.carId ? -1 : a.carId > b.carId ? 1 : 0;
}

/** The scores, cheapest first. A new array; the input is not touched. */
export function rankScores(scores: readonly CarScore[]): readonly CarScore[] {
  return Object.freeze([...scores].sort(compareScores));
}

/** The cheapest score, or `undefined` for an empty set. */
export function bestScore(scores: readonly CarScore[]): CarScore | undefined {
  let best: CarScore | undefined;
  for (const score of scores) {
    if (best === undefined || compareScores(score, best) < 0) best = score;
  }
  return best;
}
