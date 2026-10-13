/**
 * `shift/attempt.ts` — one attempt per scored day, wave AL, lane AL-E, § D1218; and one tab holding
 * it at a time, wave AO, lane AO-1, § D1361.
 */

import { describe, expect, it } from 'vitest';

import {
  attemptHoldOf,
  attemptResumeAtS,
  attemptShownTo,
  attemptShownToHeld,
  attemptSlotAfter,
  attemptStandingAmong,
  attemptStandsOn,
  continueHereLabelOf,
  CONTINUE_HERE_CELL,
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

  it('never moves the reach past a held call, and puts a reach already past it back on it — § D1364', () => {
    /* The built bundle's frame at 240×: 559.2 s drawn over a call at 549.2 s. */
    const held = attemptShownToHeld(ATTEMPT, 559.2, 549.2);
    expect(held.shownToS).toBe(549.2);
    expect(attemptShownToHeld(held, 600, 549.2)).toBe(held);
    /* Short of the call the reach moves as before, and with nothing held it is attemptShownTo. */
    expect(attemptShownToHeld(ATTEMPT, 300, 549.2).shownToS).toBe(300);
    expect(attemptShownToHeld(ATTEMPT, 559.2, undefined).shownToS).toBe(559.2);
    expect(attemptShownToHeld(ATTEMPT, 559.2, Number.NaN).shownToS).toBe(559.2);
    /* A call found after the frame that passed it: the reach goes back to it. */
    const past = attemptShownTo(ATTEMPT, 559.2);
    expect(attemptShownToHeld(past, 560, 549.2).shownToS).toBe(549.2);
    /* Answered, nothing holds it, and it moves on from the call. */
    expect(attemptShownToHeld(held, 600, undefined).shownToS).toBe(600);
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

/*
 * Wave AO, lane AO-1, § D1361 — the post-AN panel's seat D (D2): tab B resumed the scored attempt,
 * played it to 18:00 without closing, and tab A then banked with the answers B had shown; B's
 * progress also overwrote the saved attempt. The saved attempt belongs to one tab at a time.
 */
describe('one tab holds the attempt at a time — § D1361', () => {
  const slotOf = (attempt: DayAttempt): ReadonlyMap<string, DayAttempt> => new Map([[attempt.contractId, attempt]]);

  it('reads an attempt with no holder, a released one and one stored before the rule as free', () => {
    expect(attemptHoldOf(ATTEMPT, 'taba')).toBe('free');
    expect(attemptHoldOf({ ...ATTEMPT, holder: null }, 'taba')).toBe('free');
    expect(attemptHoldOf({ ...ATTEMPT, holder: 'taba' }, 'taba')).toBe('here');
    expect(attemptHoldOf({ ...ATTEMPT, holder: 'taba' }, 'tabb')).toBe('elsewhere');
  });

  it('lets a tab write and clear only an attempt it holds or nobody holds, and holds what it writes', () => {
    const free = slotOf(ATTEMPT);
    expect(attemptSlotAfter(free, 'c2', { kind: 'write', attempt: { ...ATTEMPT, shownToS: 60 } }, 'tabb')?.get('c2')).toEqual({
      ...ATTEMPT,
      shownToS: 60,
      holder: 'tabb',
    });
    const heldByA = slotOf({ ...ATTEMPT, holder: 'taba' });
    /* B can neither advance A's attempt nor wipe it: the refusal is how B learns it does not hold it. */
    expect(attemptSlotAfter(heldByA, 'c2', { kind: 'write', attempt: { ...ATTEMPT, shownToS: 1800 } }, 'tabb')).toBeUndefined();
    expect(attemptSlotAfter(heldByA, 'c2', { kind: 'clear' }, 'tabb')).toBeUndefined();
    expect(attemptSlotAfter(heldByA, 'c2', { kind: 'clear' }, 'taba')?.has('c2')).toBe(false);
  });

  it('claims another tab’s attempt only on the pressed takeover, and claims nothing that is not stored', () => {
    const heldByA = slotOf({ ...ATTEMPT, holder: 'taba', shownToS: 549 });
    expect(attemptSlotAfter(heldByA, 'c2', { kind: 'claim', takeOver: false }, 'tabb')).toBeUndefined();
    const taken = attemptSlotAfter(heldByA, 'c2', { kind: 'claim', takeOver: true }, 'tabb')?.get('c2');
    /* The takeover holds the attempt as stored: its presses and its reach, never anything further on. */
    expect(taken).toEqual({ ...ATTEMPT, holder: 'tabb', shownToS: 549 });
    expect(attemptSlotAfter(slotOf(ATTEMPT), 'c2', { kind: 'claim', takeOver: false }, 'tabb')?.get('c2')?.holder).toBe('tabb');
    expect(attemptSlotAfter(new Map(), 'c2', { kind: 'claim', takeOver: true }, 'tabb')).toBeUndefined();
  });

  it('lets go only of what the tab holds, so a closed tab’s attempt resumes in the next with no question', () => {
    const heldByA = slotOf({ ...ATTEMPT, holder: 'taba' });
    const released = attemptSlotAfter(heldByA, 'c2', { kind: 'release' }, 'taba');
    expect(released?.get('c2')?.holder).toBeNull();
    expect(attemptHoldOf(released?.get('c2') ?? ATTEMPT, 'tabb')).toBe('free');
    /* Another tab's release of A's attempt is no release at all, and is not refused either. */
    expect(attemptSlotAfter(heldByA, 'c2', { kind: 'release' }, 'tabb')).toBe(heldByA);
  });

  it('writes one contract’s attempt and keeps every other entry as stored', () => {
    const other: DayAttempt = { ...ATTEMPT, contractId: 'c7', holder: 'tabc' };
    const stored = new Map<string, DayAttempt>([
      ['c2', ATTEMPT],
      ['c7', other],
    ]);
    const after = attemptSlotAfter(stored, 'c2', { kind: 'write', attempt: { ...ATTEMPT, shownToS: 120 } }, 'tabb');
    expect(after?.get('c7')).toBe(other);
  });

  it('names the takeover by its weekday, and says what it does before it is pressed', () => {
    expect(continueHereLabelOf('Monday')).toBe('Continue Monday here');
    expect(CONTINUE_HERE_CELL.replace('⟨day⟩', 'Monday')).toBe(continueHereLabelOf('Monday'));
    expect(DAY_ATTEMPT_COPY.elsewhereNote).toMatch(/another tab/u);
    expect(DAY_ATTEMPT_COPY.elsewhereNote).toMatch(/stops where it is/u);
    expect(DAY_ATTEMPT_COPY.elsewhereStage).toMatch(/no further/u);
    expect(DAY_ATTEMPT_COPY.staleStage).toMatch(/no further/u);
  });
});
