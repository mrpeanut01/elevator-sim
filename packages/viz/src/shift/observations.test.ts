/**
 * **The projection's one un-defaulted field** — `shift/observations.ts`, and GitHub issue #169.
 *
 * Everything else this module writes has an empty case that is a number: `carryPct` is 100 when
 * nobody arrived, `minutePct` is 100 when nobody was served, `worstWaitS` is 0 before anybody
 * turned up. Each is unreadable under a gate, which is what makes the stand-in safe — the value is
 * never displayed and never compared.
 *
 * `loadedDepartures` has no gate to hide behind. Its bar is `at-most`, so a `?? 0` would grade a
 * trip budget **met** on a run nobody measured. The absence therefore has to survive the projection,
 * and this file is what says so: it is the assertion a *later* convenience default would trip over,
 * because the shape of the defect is one character of ergonomics away at all times.
 *
 * The rest of the projection is exercised through `live/observations.test.ts` and the report suites,
 * which drive it over real recordings; there is deliberately no second copy of that here.
 */

import { describe, expect, it } from 'vitest';

import type { LiveObservations } from '../live/types.js';

import { shiftObservationsOf } from './observations.js';

function live(overrides: Partial<LiveObservations> = {}): LiveObservations {
  return {
    atS: 600,
    waitingNow: 3,
    longestCurrentWaitS: 20,
    arrived: 120,
    boarded: 100,
    carried: 90,
    servedUnderThresholdCount: 80,
    servedCount: 100,
    servedUnderThresholdPct: 80,
    longWaitThresholdS: 60,
    peakQueue: { count: 9, floorId: 'L1', atS: 210 },
    deepestQueueNow: 2,
    deepestQueueFloorId: 'L1',
    abandoned: 0,
    abandonedCarried: 0,
    turnedAway: 0,
    horizonS: 900,
    worstWaitSoFarS: 42,
    worstWaitIsCensored: false,
    loadedDepartures: 265,
    ...overrides,
  };
}

describe('the trip count crosses the projection unchanged', () => {
  it('carries a measured count straight through, rounding nothing', () => {
    // Copied like `abandoned` and `turnedAway`, and derived nowhere else: `live/` folds it and this
    // projects, so one sheet cannot hold two answers to *how many trips did the machines make*.
    expect(shiftObservationsOf(live()).loadedDepartures).toBe(265);
    expect(shiftObservationsOf(live({ loadedDepartures: 0 })).loadedDepartures).toBe(0);
  });

  it('leaves the field off entirely when the fold had nothing to cut', () => {
    /*
     * **Absent, not `undefined`-valued.** Under `exactOptionalPropertyTypes` those are different
     * objects, and `goals.ts#readGoal` refuses on the value either way — but a present `undefined`
     * would survive a `{ ...observations, ...patch }` merge differently, and the register of things
     * this repository has got wrong by one key is long enough already.
     */
    const projected = shiftObservationsOf(live({ loadedDepartures: undefined }));
    expect('loadedDepartures' in projected).toBe(false);
    expect(projected.loadedDepartures).toBeUndefined();
  });

  it('does not default it the way the three ratios beside it are defaulted', () => {
    // The contrast, asserted rather than described: an empty run gets a number for each of the
    // three that has a gate, and nothing for the one that does not.
    const empty = shiftObservationsOf(
      live({
        arrived: 0,
        carried: 0,
        servedCount: 0,
        servedUnderThresholdPct: undefined,
        worstWaitSoFarS: undefined,
        loadedDepartures: undefined,
      }),
    );
    expect(empty.carryPct).toBe(100);
    expect(empty.minutePct).toBe(100);
    expect(empty.worstWaitS).toBe(0);
    expect(empty.loadedDepartures).toBeUndefined();
  });
});
