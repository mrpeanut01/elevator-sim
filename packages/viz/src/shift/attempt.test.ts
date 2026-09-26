/**
 * `shift/attempt.ts` — one attempt per scored day, wave AL, lane AL-E, § D1218.
 */

import { describe, expect, it } from 'vitest';

import {
  attemptResumeAtS,
  attemptShownTo,
  attemptStandingAmong,
  attemptStandsOn,
  DAY_ATTEMPT_COPY,
  dayFiledElsewhere,
  resumeLabelOf,
  RESUME_PRIMARY_CELL,
  type DayAttempt,
} from './attempt.js';
import type { DayOutcome } from './types.js';
import { closeDay, nextDay, openWeek, outcomeOf } from './week.js';

const ATTEMPT: DayAttempt = Object.freeze({
  contractId: 'c2',
  day: 3,
  dayIdx: 2,
  seed: '20260925',
  daySeed: '20260925',
  dispatcherId: 'nearest-car',
  interventions: [],
  record: null,
  shownToS: 0,
  pinnedCallDone: false,
  pressCallSkipped: false,
  calls: null,
});

function outcome(day: number): DayOutcome {
  return outcomeOf({
    day,
    dayIdx: day - 1,
    eventId: 'ordinary',
    readings: [],
    minutePct: 80,
    carried: 10,
    arrived: 10,
    record: null,
    recordRefusal: 'no record',
  });
}

describe('the attempt standing on a scored day — § D1218', () => {
  it('stands on its own week day until the week closes that day, and nowhere else', () => {
    const week = { ...openWeek('c2'), day: 3, dayIdx: 2, history: [outcome(1), outcome(2)] };
    expect(attemptStandsOn(ATTEMPT, week)).toBe(true);
    expect(attemptStandsOn(undefined, week)).toBe(false);
    expect(attemptStandsOn(ATTEMPT, { ...week, contractId: 'c3' })).toBe(false);
    expect(attemptStandsOn(ATTEMPT, { ...week, day: 4, dayIdx: 3 })).toBe(false);
    expect(attemptStandsOn(ATTEMPT, { ...week, dayIdx: 4 })).toBe(false);
    /* Seat D's hole was a day that closed on a second try; once the day closes, nothing stands on it. */
    const closed = closeDay(week, outcome(3));
    expect(closed.closedDay).toBe(3);
    expect(attemptStandsOn(ATTEMPT, closed)).toBe(false);
    /* A history holding the day with no `closedDay` (a week rolled on past it) holds it too. */
    expect(attemptStandsOn(ATTEMPT, { ...week, history: [...week.history, outcome(3)] })).toBe(false);
  });

  it('keeps the furthest instant it has shown and never moves it back', () => {
    const moved = attemptShownTo(ATTEMPT, 900);
    expect(moved.shownToS).toBe(900);
    expect(attemptShownTo(moved, 600)).toBe(moved);
    expect(attemptShownTo(moved, Number.NaN)).toBe(moved);
    expect(ATTEMPT.shownToS).toBe(0);
  });

  it('resumes where it had reached, inside the run, and opens a day never started at its start', () => {
    expect(attemptResumeAtS(ATTEMPT, 0, 3600)).toBeUndefined();
    expect(attemptResumeAtS({ ...ATTEMPT, shownToS: 1200 }, 0, 3600)).toBe(1200);
    expect(attemptResumeAtS({ ...ATTEMPT, shownToS: 5000 }, 0, 3600)).toBe(3600);
    expect(attemptResumeAtS({ ...ATTEMPT, shownToS: 7200 }, 7200, 10_800)).toBeUndefined();
  });

  it('names the resume by its weekday, from the cell the action bar table writes', () => {
    expect(resumeLabelOf('Thursday')).toBe('Resume Thursday');
    expect(RESUME_PRIMARY_CELL.replace('⟨day⟩', 'Thursday')).toBe(resumeLabelOf('Thursday'));
  });

  it('says what the attempt keeps with no figure and no advice', () => {
    for (const sentence of Object.values(DAY_ATTEMPT_COPY)) {
      expect(sentence).not.toMatch(/\d/u);
      expect(sentence).not.toMatch(/\b(better|should|best)\b/iu);
    }
    expect(DAY_ATTEMPT_COPY.leaveConsequence).not.toMatch(/not be scored/u);
  });
});

/*
 * Wave AM, lane AM-B, § D1239 — the post-AL panel's seat D (D2): two tabs could each close one
 * counted day, and the second close banked over the first. The close now reads the week this device
 * has stored, so a day another tab has filed is practice here.
 */
describe('a day filed in another tab — § D1239', () => {
  const held = { ...openWeek('c2'), day: 3, dayIdx: 2, closedDay: 2, history: [outcome(1), outcome(2)] };

  it('reads the stored week as having filed the day this tab holds open', () => {
    expect(dayFiledElsewhere(held, held)).toBe(false);
    expect(dayFiledElsewhere(held, undefined)).toBe(false);
    const filed = closeDay(held, outcome(3));
    expect(dayFiledElsewhere(held, filed)).toBe(true);
    /* The other tab has gone on and opened tomorrow. */
    expect(dayFiledElsewhere(held, nextDay(filed))).toBe(true);
    /* A stored week of another tower says nothing about this one. */
    expect(dayFiledElsewhere(held, { ...filed, contractId: 'c3' })).toBe(false);
  });

  it('reads a stored week that rolled over past this tab’s day as having filed it', () => {
    const sunday = { ...openWeek('c2'), day: 7, dayIdx: 6, closedDay: 6, history: [1, 2, 3, 4, 5, 6].map(outcome) };
    const rolled = { ...openWeek('c2'), day: 1, dayIdx: 0 };
    expect(dayFiledElsewhere(sunday, rolled)).toBe(true);
    /* A stored week behind this tab's, with days filed, is a stale write rather than a filing. */
    expect(dayFiledElsewhere(sunday, { ...sunday, day: 5, dayIdx: 4, closedDay: 4, history: [1, 2, 3, 4].map(outcome) })).toBe(false);
  });

  it('says nothing where this tab has filed the day itself', () => {
    const filedHere = closeDay(held, outcome(3));
    expect(dayFiledElsewhere(filedHere, filedHere)).toBe(false);
    expect(dayFiledElsewhere(filedHere, nextDay(filedHere))).toBe(false);
  });
});

/*
 * § D1239 — seat D's building change mid-attempt: the attempt standing on any of this device's weeks,
 * the live one or a parked one, so the Engineer surface can bank nothing while it stands.
 */
describe('an attempt standing on any week — § D1239', () => {
  const week = { ...openWeek('c2'), day: 3, dayIdx: 2, history: [outcome(1), outcome(2)] };

  it('finds the attempt on a parked week as well as on the live one, and none on a closed day', () => {
    const attempts = new Map([['c2', ATTEMPT]]);
    const other = openWeek('c5');
    expect(attemptStandingAmong(attempts, [week])).toBe(ATTEMPT);
    expect(attemptStandingAmong(attempts, [other, week])).toBe(ATTEMPT);
    expect(attemptStandingAmong(attempts, [other])).toBeUndefined();
    expect(attemptStandingAmong(attempts, [closeDay(week, outcome(3))])).toBeUndefined();
    expect(attemptStandingAmong(new Map(), [week])).toBeUndefined();
  });
});
