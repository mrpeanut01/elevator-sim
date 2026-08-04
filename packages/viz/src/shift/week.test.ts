/**
 * The week is a pure state machine — asserted, not claimed.
 *
 * The purity suite deep-freezes the input before every transition. That is stronger than comparing
 * a snapshot afterwards: a mutation of a frozen object throws in strict mode (which every ES module
 * is), so the test fails at the write rather than at the comparison, and it fails even for a
 * mutation that happened to write the same value back.
 *
 * The behaviour suites pin the two rules `week.ts` copies from the design deliberately — the banked
 * count surviving a missed day, and taking an assignment restarting the week — because both look
 * like bugs and neither is.
 */

import { describe, expect, it } from 'vitest';

import { CONTRACTS } from './contracts.js';
import { readGoals } from './goals.js';
import { goalsForDay } from './goals.js';
import {
  HISTORY_DAYS,
  closeDay,
  nextDay,
  openWeek,
  outcomeOf,
  takeContract,
} from './week.js';
import type { DayOutcome, GoalReading, WeekState } from './types.js';

/** Readings that are all `met`, or all `missed`, or all `pending` — whatever the day asks. */
function readings(day: number, kind: 'met' | 'missed' | 'pending'): readonly GoalReading[] {
  const observations =
    kind === 'pending'
      ? { arrived: 3, carryPct: 100, minutePct: 100, peakQueue: 0, abandoned: 0 }
      : kind === 'met'
        ? { arrived: 400, carryPct: 100, minutePct: 100, peakQueue: 0, abandoned: 0 }
        : { arrived: 400, carryPct: 10, minutePct: 10, peakQueue: 99, abandoned: 9 };
  return readGoals(goalsForDay(day), observations);
}

function day(
  week: WeekState,
  kind: 'met' | 'missed' | 'pending',
  minutePct = kind === 'met' ? 90 : 40,
): DayOutcome {
  return outcomeOf({
    day: week.day,
    dayIdx: week.dayIdx,
    eventId: 'ordinary',
    arrived: 400,
    carried: 380,
    minutePct,
    readings: readings(week.day, kind),
  });
}

/** Freeze a week and everything reachable from it, so a mutation throws where it happens. */
function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner);
  return Object.freeze(value);
}

describe('opening a week', () => {
  it('starts at day 1 with nothing banked and nothing cleared', () => {
    const week = openWeek('c2');
    expect(week).toEqual({
      contractId: 'c2',
      day: 1,
      dayIdx: 0,
      streak: 0,
      bestMinutePct: 0,
      cleanRun: 0,
      completed: [],
      history: [],
      cleared: null,
    });
  });
});

describe('unjudged is not passed', () => {
  it('does not call a day clean when a goal never woke up', () => {
    const week = openWeek('c1');
    const outcome = day(week, 'pending');
    expect(outcome.readings.every((reading) => reading.state === 'pending')).toBe(true);
    expect(outcome.allMet).toBe(false);
    expect(closeDay(week, outcome).cleanRun).toBe(0);
  });

  it('does not call a day with no goals clean', () => {
    // `every` over an empty array is `true`, which would make a shift with nothing to prove
    // indistinguishable from one that proved everything.
    const outcome = outcomeOf({
      day: 1,
      dayIdx: 0,
      eventId: 'ordinary',
      arrived: 400,
      carried: 400,
      minutePct: 100,
      readings: [],
    });
    expect(outcome.allMet).toBe(false);
  });
});

describe('the streak and the banked count part company', () => {
  it('advances both on a clean day', () => {
    const after = closeDay(openWeek('c2'), day(openWeek('c2'), 'met'));
    expect(after.streak).toBe(1);
    expect(after.cleanRun).toBe(1);
  });

  it('resets the streak on a missed day and keeps the banked count', () => {
    // `design.html` :1955 and :1957, ported verbatim. The streak is the thing you can lose; the
    // assignment is the thing you cannot. Named in `week.ts` so nobody "fixes" it.
    let week = openWeek('c2');
    week = closeDay(week, day(week, 'met'));
    week = nextDay(week);
    week = closeDay(week, day(week, 'missed'));
    expect(week.streak).toBe(0);
    expect(week.cleanRun).toBe(1);
  });

  it('keeps the best day even after a bad one', () => {
    let week = openWeek('c1');
    week = closeDay(week, day(week, 'met', 91));
    week = nextDay(week);
    week = closeDay(week, day(week, 'missed', 12));
    expect(week.bestMinutePct).toBe(91);
  });
});

describe('banking a scenario', () => {
  it('clears the first contract on one clean shift and names the next', () => {
    const week = closeDay(openWeek('c1'), day(openWeek('c1'), 'met'));
    expect(week.completed).toEqual(['c1']);
    expect(week.cleared).not.toBeNull();
    expect(week.cleared?.nextContractId).toBe('c2');
    expect(week.cleared?.nextTitle).toBe('Scenario 2 — The morning rush');
    expect(week.cleared?.reward).toBe(
      'Minimum estimated wait · Energy aware · one spare shaft',
    );
  });

  it('does not clear a two-shift contract on one clean day', () => {
    const week = closeDay(openWeek('c2'), day(openWeek('c2'), 'met'));
    expect(week.completed).toEqual([]);
    expect(week.cleared).toBeNull();
  });

  it('awards a contract once, however many clean days follow', () => {
    let week = openWeek('c1');
    week = closeDay(week, day(week, 'met'));
    expect(week.cleared).not.toBeNull();
    week = nextDay(week);
    week = closeDay(week, day(week, 'met'));
    expect(week.completed).toEqual(['c1']);
    expect(week.cleared).toBeNull();
  });

  it('says so, rather than promising another scenario, at the end of the list', () => {
    // The LAST contract, derived — the campaign grew from five to eight and this had pinned `c5`,
    // which is now the middle of it.
    const last = CONTRACTS[CONTRACTS.length - 1]?.id ?? '';
    let week = { ...openWeek(last), cleanRun: 2 };
    week = closeDay(week, day(week, 'met'));
    expect(week.cleared?.nextContractId).toBeNull();
    expect(week.cleared?.nextTitle).toBe('any scenario you like — they are all open');
  });

  it('banks the day rather than throwing when the contract id names nothing', () => {
    // Restored state from an older build, or a scenario since renamed. Losing the day to an
    // exception would be worse than losing the banner.
    const week = closeDay(openWeek('nope'), day(openWeek('nope'), 'met'));
    expect(week.cleanRun).toBe(1);
    expect(week.cleared).toBeNull();
  });
});

describe('the day boundary', () => {
  it('advances the day and wraps the weekday', () => {
    let week = openWeek('c1');
    for (let i = 0; i < 7; i += 1) week = nextDay(week);
    expect(week.day).toBe(8);
    expect(week.dayIdx).toBe(0);
  });

  it('clears the award, so a banner belongs to one report', () => {
    const cleared = closeDay(openWeek('c1'), day(openWeek('c1'), 'met'));
    expect(cleared.cleared).not.toBeNull();
    expect(nextDay(cleared).cleared).toBeNull();
  });

  it('keeps seven days of history, oldest falling off', () => {
    let week = openWeek('c1');
    for (let i = 0; i < 10; i += 1) {
      week = closeDay(week, day(week, 'met'));
      week = nextDay(week);
    }
    expect(week.history).toHaveLength(HISTORY_DAYS);
    expect(week.history[0]?.day).toBe(4);
    expect(week.history.at(-1)?.day).toBe(10);
  });
});

describe('taking an assignment restarts the week and keeps what was cleared', () => {
  it('resets the streak, the banked count, the day and the history', () => {
    let week = openWeek('c1');
    week = closeDay(week, day(week, 'met'));
    week = nextDay(week);
    const taken = takeContract(week, 'c4');
    expect(taken.contractId).toBe('c4');
    expect(taken.day).toBe(1);
    expect(taken.dayIdx).toBe(0);
    expect(taken.streak).toBe(0);
    expect(taken.cleanRun).toBe(0);
    expect(taken.history).toEqual([]);
    // …and the scenario already cleared stays cleared.
    expect(taken.completed).toEqual(['c1']);
  });
});

describe('purity', () => {
  it('mutates nothing it is given', () => {
    const week = deepFreeze(openWeek('c1'));
    const outcome = deepFreeze(day(week, 'met'));
    expect(() => closeDay(week, outcome)).not.toThrow();
    expect(() => nextDay(week)).not.toThrow();
    expect(() => takeContract(week, 'c3')).not.toThrow();
  });

  it('returns the same value for the same inputs', () => {
    const week = openWeek('c2');
    const outcome = day(week, 'met');
    expect(closeDay(week, outcome)).toEqual(closeDay(week, outcome));
    expect(nextDay(week)).toEqual(nextDay(week));
  });

  it('leaves the input observably unchanged', () => {
    const week = openWeek('c1');
    const before = JSON.stringify(week);
    closeDay(week, day(week, 'met'));
    nextDay(week);
    takeContract(week, 'c5');
    expect(JSON.stringify(week)).toBe(before);
  });
});
