/**
 * Building and sampling {@link StepSeries}.
 *
 * Two rules, both of which exist to keep frame production pure:
 *
 * 1. **One entry per distinct time.** A builder handed two changes at the same simulated
 *    instant keeps the last one, so `times` is strictly increasing and the binary search below
 *    has a single answer. Two entries at the same `t` would make the sampled value depend on
 *    which one the search happened to land on — a tie broken by array layout, which is the same
 *    class of bug CLAUDE.md invariant 4 forbids in the event queue.
 * 2. **No cursor.** {@link stepValueAt} takes a time and returns a value. It does not remember
 *    the last time it was asked, so a playhead may scrub backwards, a test may sample the same
 *    instant twice, and both get the same answer.
 */

import type { SimTime } from '@elevator-sim/core';

import type { StepSeries } from './types.js';

/** An empty series that reads `before` everywhere. */
export function constantSeries(before: number): StepSeries {
  return { times: [], values: [], before };
}

/**
 * Accumulates `(time, value)` points into a {@link StepSeries}.
 *
 * `push` must be called with non-decreasing times; that is the caller's job and it is cheap to
 * satisfy, because every caller here sorts its events first. A decreasing time throws rather
 * than silently producing a series whose samples depend on insertion order.
 */
export class StepSeriesBuilder {
  readonly #times: number[] = [];
  readonly #values: number[] = [];
  readonly #before: number;

  constructor(before = 0) {
    this.#before = before;
  }

  push(at: SimTime, value: number): void {
    const lastIndex = this.#times.length - 1;
    const last = lastIndex >= 0 ? this.#times[lastIndex] : undefined;
    if (last !== undefined && at < last) {
      throw new Error(
        `StepSeriesBuilder received ${at} after ${last}; series must be built in time order.`,
      );
    }
    if (last !== undefined && at === last) {
      this.#values[lastIndex] = value;
      return;
    }
    this.#times.push(at);
    this.#values.push(value);
  }

  build(): StepSeries {
    return { times: this.#times, values: this.#values, before: this.#before };
  }
}

/**
 * The value of `series` at `t`.
 *
 * Right-continuous: a change recorded at exactly `t` is visible at `t`. That matches how the
 * rest of the project reads time — a passenger arriving at `arrivedAt` is waiting at
 * `arrivedAt` — and it is why a car whose doors are commanded open at `t` is drawn as opening
 * in the frame for `t` rather than one frame later.
 */
export function stepValueAt(series: StepSeries, t: SimTime): number {
  const index = stepIndexAt(series, t);
  return index < 0 ? series.before : (series.values[index] ?? series.before);
}

/** Index of the entry in effect at `t`, or `-1` when `t` precedes the first one. */
export function stepIndexAt(series: StepSeries, t: SimTime): number {
  const { times } = series;
  let low = 0;
  let high = times.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const at = times[mid];
    if (at === undefined) break;
    if (at <= t) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/**
 * The last element of `entries` whose `at` is `<= t`, or `undefined`.
 *
 * The same search as {@link stepIndexAt}, for the two sequences that are not numeric series —
 * the motions and the door marks. Shared so there is one implementation of "what was in effect
 * at `t`" rather than three that could drift at their boundaries.
 */
export function lastAtOrBefore<T extends { readonly at: SimTime }>(
  entries: readonly T[],
  t: SimTime,
): T | undefined {
  let low = 0;
  let high = entries.length - 1;
  let found: T | undefined;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = entries[mid];
    if (candidate === undefined) break;
    if (candidate.at <= t) {
      found = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
