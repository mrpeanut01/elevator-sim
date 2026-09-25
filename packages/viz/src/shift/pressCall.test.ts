/**
 * **The call instant, on legs a reader can check by hand** — [§ D1029](../../../../DECISIONS.md).
 *
 * The runs are `pressLadder.test.ts`'s; this is the function's own contract on synthetic legs, so
 * each rule and each refusal is reached by a case that says which. Both rules, the precedence
 * between them, the threshold the stage's pace shares, and the two ways a day has nothing to call.
 */

import { describe, expect, it } from 'vitest';

import type { VizLeg } from '../contract/types.js';
import { isWaitingAt } from '../frame/overlay.js';
import { WAIT_BANDS } from '../live/bands.js';

import type { BookedOutCar } from './bookedOut.js';
import { pressCallOf, type PressCallInput } from './pressCall.js';

/** A leg as `pressCallOf` reads it: arrival, and when (if ever) the wait ended. */
function leg(id: string, arrivedAt: number, boardedAt?: number, refusedAt?: number): VizLeg {
  return {
    passengerId: id,
    arrivedAt,
    ...(boardedAt === undefined ? {} : { boardedAt }),
    ...(refusedAt === undefined ? {} : { refusedAt }),
  } as unknown as VizLeg;
}

/** The third wait band's floor — the band `everyday/stagePace.ts#PACE_HOLD_WAIT_S` reads too. */
const PACE_HOLD_WAIT_S = WAIT_BANDS[2]?.fromS ?? Number.NaN;

const CAR: BookedOutCar = { carId: 'D', awayAtS: 1000, backAtS: 2000 };
const ACT = { startS: 1500, endS: 1800 };

function input(legs: readonly VizLeg[], over: Partial<PressCallInput> = {}): PressCallInput {
  return {
    legs,
    bookedOut: [CAR],
    horizon: 'whole-day',
    acts: [{ startS: 100, endS: 400 }, ACT],
    startedAt: 0,
    endedAt: 3000,
    ...over,
  };
}

describe('rule 1 — the first minute-long wait while the car is away', () => {
  it('is the third wait band’s floor — the stage’s held threshold, asserted equal in `stageCall.test.ts`', () => {
    const call = pressCallOf(input([leg('a', 1100)]));
    expect(call?.atS).toBe(1100 + PACE_HOLD_WAIT_S);
    expect(call?.rule).toBe('first-minute-wait');
    expect(call?.carId).toBe('D');
  });

  it('is exact, and agrees with `isWaitingAt` at the instant it names', () => {
    const legs = [leg('a', 1010, 1065), leg('b', 1020, 1200), leg('c', 1030)];
    const call = pressCallOf(input(legs));
    /* a boards at 1065, five seconds short; b is the first to reach a minute, at 1080. */
    expect(call?.atS).toBe(1080);
    expect(legs.some((one) => isWaitingAt(one, 1080) && 1080 - one.arrivedAt >= PACE_HOLD_WAIT_S)).toBe(true);
    expect(legs.some((one) => isWaitingAt(one, 1079) && 1079 - one.arrivedAt >= PACE_HOLD_WAIT_S)).toBe(false);
  });

  it('counts a wait that began before the car left from the moment it leaves', () => {
    const call = pressCallOf(input([leg('early', 900)]));
    expect(call?.atS).toBe(1000);
    expect(call?.rule).toBe('first-minute-wait');
  });

  it('ignores a rider the building turned away, and one who boarded in time', () => {
    const call = pressCallOf(input([leg('refused', 1100, undefined, 1130), leg('boarded', 1100, 1159)]));
    expect(call?.rule).toBe('act-start');
  });

  it('never looks past the car’s return', () => {
    const call = pressCallOf(input([leg('late', 1990)]));
    expect(call?.rule).toBe('act-start');
  });
});

describe('rule 2 — act start, only where rule 1 has no instant', () => {
  it('is the later of the car leaving and the start of the act it is away during', () => {
    expect(pressCallOf(input([]))?.atS).toBe(ACT.startS);
    expect(pressCallOf(input([]))?.rule).toBe('act-start');
    /* An act already open when the car leaves: the car leaving is the later. */
    const opened = pressCallOf(input([], { acts: [{ startS: 800, endS: 1400 }] }));
    expect(opened?.atS).toBe(1000);
  });

  it('is never chosen over an instant rule 1 has, even a later one', () => {
    const call = pressCallOf(input([leg('a', 1700)]));
    expect(call?.rule).toBe('first-minute-wait');
    expect(call?.atS).toBe(1760);
  });

  it('on a slice the whole run is the act, so the call is the car leaving', () => {
    const call = pressCallOf(input([], { horizon: 'period', acts: [] }));
    expect(call?.atS).toBe(1000);
    expect(call?.rule).toBe('act-start');
    expect(call?.act).toEqual({ startS: 0, endS: 3000 });
  });
});

describe('a day with nothing to call is not called', () => {
  it('when the tower books no car out', () => {
    expect(pressCallOf(input([leg('a', 1100)], { bookedOut: [] }))).toBeUndefined();
  });

  it('when no act overlaps the absence and nobody waits a minute', () => {
    expect(pressCallOf(input([], { acts: [{ startS: 100, endS: 400 }] }))).toBeUndefined();
  });

  it('reads the first car to leave when two go', () => {
    const call = pressCallOf(
      input([], { bookedOut: [{ carId: 'E', awayAtS: 1200, backAtS: 2000 }, CAR] }),
    );
    expect(call?.carId).toBe('D');
  });
});
