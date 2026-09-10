/**
 * **How much of a recording a per-frame fold actually touches** — the instrument shared by
 * `frame/measure.perFrame.test.ts` and `frame/perFrameBudget.test.ts`, GitHub issue #410.
 *
 * ## Why a visit count and not a stopwatch
 *
 * The two surfaces this measures — `frame/overlay.ts#overlayAt` and
 * `live/observations.ts#observationsAt` — each carry a *Cost* heading claiming the work is
 * *"comfortably inside a 60 Hz frame budget"*. Issue #410's third acceptance clause is that a claim
 * about a cost is measured rather than restated, and its second is that a surface which stays on
 * the painting thread carries a budget that is **enforced**.
 *
 * A budget in milliseconds cannot be enforced here. `vitest.config.ts#SIMULATING_TIMEOUT_MS`
 * measured this repository's own amplification under load at about ninefold, and #410 names the
 * problem itself: *"a wall-clock budget on a shared runner measures the runner (#335)"*. A budget
 * that goes red because another worktree was compiling teaches people to raise the number.
 *
 * So the enforced budget is written in the unit the work is actually made of: **how many legs the
 * fold reads**. It is the same integer on every machine, it rises with exactly the thing that makes
 * a fold expensive, and — the reason it is worth having at all — it is the quantity that separates
 * *one pass over the legs that have arrived* from a fold that has quietly become quadratic. A
 * stopwatch cannot tell those apart on a small recording, and by the time it can, the page has
 * already stopped painting on the big one.
 *
 * The wall clock is still measured, in `frame/measure.perFrame.test.ts`, and published beside the
 * visit counts — because a bound written in legs means nothing until somebody has seen what a leg
 * costs.
 *
 * ## How the count is taken
 *
 * A `Proxy` over `recording.legs` that counts index reads. `for (const leg of recording.legs)` is
 * an array iterator, which performs one `[[Get]]` per index and one more for the index that ends
 * the traversal, so a scan that stops at the first leg past the playhead reads `arrived + 1` — the
 * `+ 1` is the leg it looked at in order to stop. Nothing is stubbed and no module is instrumented:
 * the shipped function runs unmodified against a recording whose leg array happens to be counting.
 *
 * Recorded under [§ D405](../../../../DECISIONS.md): this helper binds only the two cases that
 * import it, and this docstring is the record the working agreement asks for.
 */

import type { VizLeg, VizRecording } from '../contract/types.js';

/** A recording that counts how many of its legs were read, and the counter beside it. */
export interface CountingRecording {
  /** Pass this where the shipped function wants a `VizRecording`. */
  readonly recording: VizRecording;
  /** Index reads of `legs` since the last {@link reset}. */
  visits(): number;
  reset(): void;
}

const INDEX = /^(?:0|[1-9][0-9]*)$/;

export function countingRecording(recording: VizRecording): CountingRecording {
  let visits = 0;
  const legs = new Proxy(recording.legs as VizLeg[], {
    get(target, property, receiver): unknown {
      if (typeof property === 'string' && INDEX.test(property)) visits += 1;
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
  return {
    recording: { ...recording, legs },
    visits: () => visits,
    reset: () => {
      visits = 0;
    },
  };
}

/**
 * Legs that had arrived by `t` — the denominator every bound here is written against.
 *
 * `>` rather than `>=`, matching `frame/overlay.ts#isWaitingAt`'s right-continuity and the `break`
 * both folds use: a leg arriving at exactly `t` has arrived. Counted off the **unproxied** array so
 * that establishing the denominator does not move the numerator.
 */
export function arrivedBy(recording: VizRecording, t: number): number {
  let arrived = 0;
  for (const leg of recording.legs) {
    if (leg.arrivedAt > t) break;
    arrived += 1;
  }
  return arrived;
}

/**
 * The playheads a sweep samples, as fractions of the run.
 *
 * Both ends are included deliberately. `0` is the frame a reader meets first and the one where a
 * fold that scanned the whole array regardless of `t` would be caught; `1` is the whole run, which
 * is the most expensive frame there is and the one a bound has to hold at.
 */
export const PLAYHEAD_FRACTIONS: readonly number[] = Object.freeze([0, 0.25, 0.5, 0.75, 1]);
