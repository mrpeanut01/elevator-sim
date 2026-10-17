/**
 * **The stage finds the instant a day was lost, whatever a frame or a skip stepped over** — wave AP,
 * lane AP-D1, [§ D1446](../../../../DECISIONS.md), the post-AO panel's seat D (D1: at `600×` the
 * stage played a lost day on with no card).
 *
 * `stagePace.ts#firstLostInstantOf` and `#worstWaitLossBeginsOf` are pure, so they are driven here
 * with readers whose answer is known. The shipped path that calls them (`stageScreen.ts#drawLost`
 * once a frame, `#skipToEnd` once a press) is held on the bundle by `lostDay.browser.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { VizLeg } from '../contract/types.js';

import { firstLostInstantOf, LOST_INSTANT_RESOLUTION_S, LOST_SCAN_STEP_S, worstWaitLossBeginsOf } from './stagePace.js';

function leg(id: string, arrivedAt: number, ended?: { readonly boardedAt?: number; readonly refusedAt?: number }): VizLeg {
  return {
    passengerId: id,
    originFloorId: 'L',
    destinationFloorId: '5',
    direction: 'up',
    arrivedAt,
    ...ended,
  } as VizLeg;
}

describe('where the worst-wait goal can begin to read missed', () => {
  it('lists each wait past the bar at the instant it ended, once each, ascending, and no wait still running', () => {
    const legs = [
      leg('a', 0, { boardedAt: 500 }),
      leg('b', 100, { boardedAt: 200 }),
      leg('c', 50, { refusedAt: 400 }),
      leg('d', 250, { boardedAt: 500 }),
      leg('e', 0),
      leg('f', 10, { boardedAt: 240 }),
    ];
    /* Bar 230 s: a ends at 500 (waited 500), c at 400 (350), d at 500 (250), f at 240 (230, inside the second's margin). */
    expect(worstWaitLossBeginsOf(legs, 230)).toEqual([240, 400, 500]);
    expect(worstWaitLossBeginsOf(legs, 1000)).toEqual([]);
  });
});

describe('the first instant a stretch reads lost', () => {
  it('finds a growing maximum’s crossing to the resolution, from inside a stretch longer than the scan step', () => {
    const crossing = 3 * LOST_SCAN_STEP_S + 137.4;
    const reads: number[] = [];
    const atS = firstLostInstantOf(
      (at) => {
        reads.push(at);
        return at >= crossing;
      },
      0,
      10 * LOST_SCAN_STEP_S,
    );
    expect(atS).toBeDefined();
    expect(atS!).toBeGreaterThanOrEqual(crossing);
    expect(atS! - crossing).toBeLessThanOrEqual(LOST_INSTANT_RESOLUTION_S);
    /* Four steps to the crossing and a bisection of one step, not a read per second. */
    expect(reads.length).toBeLessThan(20);
  });

  it('answers nothing on a stretch that never reads lost, and reads the one instant of an empty stretch', () => {
    expect(firstLostInstantOf(() => false, 0, 36_000)).toBeUndefined();
    expect(firstLostInstantOf((at) => at === 90, 90, 90)).toBe(90);
    expect(firstLostInstantOf((at) => at === 90, 120, 90)).toBe(90);
  });

  /*
   * The defect's shape: the worst wait reads missed from the instant the longest waiter boards until
   * somebody still standing has waited longer, a few seconds, and then reads pending again. A frame at
   * `600×` reads only its own playhead. Red before: the stage read `readsLost(toS)` alone.
   */
  it('finds a miss that reads for a few seconds and is gone again by the frame’s own instant', () => {
    const readsLost = (at: number): boolean => at >= 1000 && at < 1004;
    expect(readsLost(1010), 'the frame’s own playhead reads the day as still clearable').toBe(false);
    expect(firstLostInstantOf(readsLost, 990, 1010), 'stepped over with no list of where a wait ended').toBeUndefined();
    expect(firstLostInstantOf(readsLost, 990, 1010, [1000])).toBe(1000);
    expect(firstLostInstantOf(readsLost, 1000, 1010, [1000]), 'an instant already read is not read again').toBeUndefined();
  });

  it('takes the earlier of the two searches', () => {
    const queueLostFrom = 2000;
    const readsLost = (at: number): boolean => at >= queueLostFrom || (at >= 700 && at < 702);
    expect(firstLostInstantOf(readsLost, 0, 3000, [700, 2500])).toBe(700);
    const walked = firstLostInstantOf(readsLost, 0, 3000, [2500]);
    expect(walked! - queueLostFrom).toBeLessThanOrEqual(LOST_INSTANT_RESOLUTION_S);
  });
});
