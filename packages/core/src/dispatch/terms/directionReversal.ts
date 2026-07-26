/**
 * `directionReversal` — how many times the car must change direction on account of this call.
 * Serves conventional collective behaviour.
 *
 * The raw value is a count in `{0, 1, 2}`, and both of its components are real:
 *
 * ```
 * toReach       the call floor is behind the car's current run → it must turn round to get there
 * afterPickup   having arrived, the car faces the wrong way for where the passenger is going
 * raw = toReach + afterPickup
 * ```
 *
 * A car running up towards 10 with a **down** call at 5 turns once: it reverses at 10 and is
 * already going down when it collects. The same car with an **up** call at 5 turns twice:
 * down to 5, then up again. Two is genuinely worse than one, and a boolean penalty could not
 * say so — which is why the term counts rather than flags.
 *
 * ## "Behind" is measured from where the car is committed to be
 *
 * A car mid-move cannot stop short of its destination; `projectRoute` models exactly that, and
 * the reference index here is `motion.toFloorIndex` for a moving car and `floorIndex` for a
 * standing one. Eligibility and cost must agree about what the car can physically do — an
 * eligibility filter that admits a stop the ETA model then prices as a full reversal would
 * make the two disagree about the same car, and the cheaper of two inconsistent answers wins
 * every time.
 *
 * An **idle car has no direction**, so it reverses nothing and scores 0. That is not a
 * loophole: a car with nowhere to be is free to set off either way, and any other answer would
 * make every car ineligible under the `noDirectionReversal` hard constraint at t = 0.
 *
 * ## The soft term and the hard constraint are different things
 *
 * This term is the *weighted* version, for a profile that dislikes reversals but will accept
 * one when the wait saved is worth it (`predictive-balanced` weights it 0.8). The `collective`
 * profile instead declares `hardConstraints: ["noDirectionReversal"]`, and no weight vector
 * can buy its way past that — see `lifecycle.ts` § eligibility. Both read
 * {@link assessDirectionReversal}, so the filter and the cost can never disagree about what a
 * reversal is.
 *
 * Pure.
 */

import { oppositeDirection, type Direction } from '../../model/types.js';
import type { CarSnapshot } from '../../model/car/types.js';
import type { CostTermDefinition, DispatchCall, TermContext } from '../types.js';

/** The two direction changes a call can force on a car, and their total. */
export interface ReversalAssessment {
  /** The car's run direction, or `undefined` when it is idle and free to choose. */
  readonly direction: Direction | undefined;
  /** The call floor lies behind the car's current run: it must turn round to reach it. */
  readonly reversesToReach: boolean;
  /** Having arrived, the car faces away from where the passenger wants to go. */
  readonly opposesCallDirection: boolean;
  /** `reversesToReach + opposesCallDirection`, in `{0, 1, 2}`. */
  readonly reversals: number;
}

/**
 * Count the direction changes serving `call` would force on `car`.
 *
 * The single source of truth for what "reversal" means, shared by the weighted term, the
 * `noDirectionReversal` hard constraint and the `allowOppositeDirectionPickup` eligibility
 * filter.
 */
export function assessDirectionReversal(
  car: CarSnapshot,
  call: Pick<DispatchCall, 'floorId' | 'direction'>,
): ReversalAssessment {
  const direction = car.motion?.direction ?? car.direction;
  const fromIndex = car.motion === undefined ? car.floorIndex : car.motion.toFloorIndex;
  const target = car.shaft.floorsById.get(call.floorId);

  if (direction === undefined || target === undefined) {
    return Object.freeze({
      direction,
      reversesToReach: false,
      opposesCallDirection: false,
      reversals: 0,
    });
  }

  const sign = direction === 'up' ? 1 : -1;
  const reversesToReach = sign * (target.index - fromIndex) < 0;
  // Which way the car faces once it is standing at the call floor.
  const facingOnArrival = reversesToReach ? oppositeDirection(direction) : direction;
  const opposesCallDirection = facingOnArrival !== call.direction;

  return Object.freeze({
    direction,
    reversesToReach,
    opposesCallDirection,
    reversals: (reversesToReach ? 1 : 0) + (opposesCallDirection ? 1 : 0),
  });
}

/** The direction changes the call forces, `0`–`2`. */
export function directionReversals(context: TermContext): number {
  return assessDirectionReversal(context.car, context.call).reversals;
}

/**
 * Bounded, not saturating: a car makes at most two direction changes for one call, so the
 * full scale is a constant of the term rather than a tunable that would merely duplicate the
 * weight. See `normalize.ts`.
 */
export const directionReversalTerm: CostTermDefinition = Object.freeze({
  id: 'directionReversal',
  unit: '',
  measures: 'Penalty for reversing travel direction',
  normalization: Object.freeze({ mode: 'bounded', fullScale: 2 } as const),
  evaluate: directionReversals,
});
