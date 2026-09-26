/**
 * `shift/attempt.ts` — one attempt per scored day, wave AL, lane AL-E, § D1218.
 */

import { describe, expect, it } from 'vitest';

import {
  attemptResumeAtS,
  attemptShownTo,
  attemptStandsOn,
  DAY_ATTEMPT_COPY,
  resumeLabelOf,
  RESUME_PRIMARY_CELL,
  type DayAttempt,
} from './attempt.js';
import type { DayOutcome } from './types.js';
import { closeDay, openWeek, outcomeOf } from './week.js';

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
