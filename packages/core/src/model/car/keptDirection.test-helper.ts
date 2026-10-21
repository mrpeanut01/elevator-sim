/**
 * **A hand-back as it was before § D1591 and § D1603**, for a test that has to put the old one back.
 *
 * `Car.releaseHallCall`, `Car.withdrawHallCall` and `Car.releaseAllHallCalls` re-point a car that
 * is standing still through `#settleDirection`, and that method reads the car's stops through
 * `this.committedStops()`. So the old behaviour, in which the car kept its direction whatever it
 * had left, is the current method run with the instance's `committedStops` shadowed for the length
 * of the call by one stop infinitely far ahead in the car's direction, or by none for a car with
 * no direction: the re-settle then keeps whatever the car had. Nothing else inside those three
 * methods reads `committedStops`, so the call takes exactly the same hall calls off the car.
 *
 * Until § D1603 a test put the old withdrawal back by assigning `releaseHallCall` over it. That no
 * longer works, because the release re-settles too.
 *
 * **The control checks itself.** Every test that uses it requires the old figures to come back (the
 * deadlock in `sim/serviceRange.test.ts`, the stale releases in `sim/releaseDirection.test.ts`), so
 * a change to how `#settleDirection` reads the stops shows up there as a red, never as a silent
 * pass. `experiments/src/fuzz/releaseDirection.test.ts` carries its own copy, because a test
 * helper is not on `core`'s barrel.
 */

import type { Car } from './car.js';
import type { CommittedStop } from './types.js';

/** The three hand-backs a test can put the old behaviour back on. */
export type HandBack = 'releaseHallCall' | 'withdrawHallCall' | 'releaseAllHallCalls';

/** `method`, run with the car's direction held where it was. */
export function keepingDirection<A extends unknown[], R>(
  method: (this: Car, ...args: A) => R,
): (this: Car, ...args: A) => R {
  return function (this: Car, ...args: A): R {
    const direction = this.direction;
    const pinned: readonly CommittedStop[] =
      direction === undefined
        ? []
        : [{ floorIndex: direction === 'up' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY } as CommittedStop];
    Object.defineProperty(this, 'committedStops', {
      value: () => pinned,
      configurable: true,
      writable: true,
    });
    try {
      return method.apply(this, args);
    } finally {
      Reflect.deleteProperty(this, 'committedStops');
    }
  };
}

/**
 * Run `body` with the old behaviour on `methods` of every car (they share one prototype), and put
 * the current methods back afterwards whatever happens.
 */
export function withOldHandBack<T>(prototype: Car, methods: readonly HandBack[], body: () => T): T {
  const saved = methods.map((name) => [name, prototype[name]] as const);
  const writable = prototype as unknown as Record<HandBack, unknown>;
  for (const [name, method] of saved) {
    writable[name] = keepingDirection(method as (this: Car, ...args: unknown[]) => unknown);
  }
  try {
    return body();
  } finally {
    for (const [name, method] of saved) writable[name] = method;
  }
}
