/**
 * **An ordinary day's calls, on legs a reader can check by hand** — [§ D1138](../../../../DECISIONS.md).
 *
 * The candidate rule on both horizons, the cap on a whole day's size, the count the three answers
 * are compared on, the admission threshold at its edges, and the row's grammar: § D982's two ban
 * lists and § D1029's mechanism and cross-crowd lists, copied from `callRow.test.ts`, on every arm.
 */

import type { DispatcherProfile } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import type { VizLeg } from '../contract/types.js';

import type { BookedOutCar } from './bookedOut.js';
import {
  DAY_CALL_ANSWERS,
  DAY_CALL_DRIVER_ANSWERS,
  DAY_CALL_DRIVER_OFFER,
  DAY_CALL_FINAL_GOAL_IDS,
  DAY_CALL_LONG_WAIT_S,
  DAY_CALL_MAX,
  DAY_CALL_MAX_TRIES,
  DAY_ENDED_EARLY_ROW_ID,
  dayCallChangeOf,
  dayCallDriversOf,
  dayCallLostGoalOf,
  dayEndedEarlyRowOf,
  DAY_CALL_ROW_NOTE,
  DAY_CALL_SPACING_S,
  DAY_CALL_WHOLE_DAY_MAX_LEGS,
  DAY_CALL_WINDOW_S,
  dayCallAdmits,
  dayCallRowOf,
  dayCallsQuietSentenceOf,
  dayCallSearchFrom,
  DAY_CALL_MIN_SPREAD,
  dayCallsOffered,
  dayCallWindowEndOf,
  longWaitRidersIn,
  nextDayCallOf,
  type DayCallInput,
  type DayCallRecord,
} from './dayCalls.js';
import { contractBuildings } from './contractDay.test-helper.js';
import { goalsForDay } from './goals.js';
import { clockOf } from './report.js';
import type { Observations } from './types.js';

function leg(id: string, arrivedAt: number, boardedAt?: number, refusedAt?: number): VizLeg {
  return {
    passengerId: id,
    arrivedAt,
    ...(boardedAt === undefined ? {} : { boardedAt }),
    ...(refusedAt === undefined ? {} : { refusedAt }),
  } as unknown as VizLeg;
}

function input(legs: readonly VizLeg[], over: Partial<DayCallInput> = {}): DayCallInput {
  return {
    legs: [...legs].sort((a, b) => a.arrivedAt - b.arrivedAt),
    bookedOut: [],
    horizon: 'period',
    acts: [],
    startedAt: 0,
    endedAt: 1800,
    ...over,
  };
}

describe('the candidate instant', () => {
  it('is the pinned call’s threshold: 60 s, the third wait band', () => {
    expect(DAY_CALL_LONG_WAIT_S).toBe(60);
  });

  it('on a slice, is the first minute-long wait at or after the search point, with no car line when none is out', () => {
    const legs = [leg('a', 100, 150), leg('b', 200, 400), leg('c', 700, 900)];
    const first = nextDayCallOf(input(legs), 0);
    expect(first?.atS).toBe(260);
    expect(first?.rule).toBe('first-minute-wait');
    expect(first?.carAway).toBe(false);
    const second = nextDayCallOf(input(legs), dayCallSearchFrom(first!));
    expect(second?.atS).toBe(760);
  });

  it('on a slice, names no instant inside the last five minutes, and has no second rule', () => {
    expect(nextDayCallOf(input([leg('a', 1500)]), 0)).toBeUndefined();
    expect(nextDayCallOf(input([leg('a', 10, 20)]), 0)).toBeUndefined();
  });

  it('names a booked-out car only when it is away at the instant', () => {
    const car: BookedOutCar = { carId: 'D', awayAtS: 500, backAtS: 900 };
    const away = nextDayCallOf(input([leg('a', 600)], { bookedOut: [car] }), 0);
    expect(away?.carAway).toBe(true);
    expect(away?.carId).toBe('D');
    expect(away?.backAtS).toBe(900);
    const back = nextDayCallOf(input([leg('a', 1000)], { bookedOut: [car] }), 0);
    expect(back?.carAway).toBe(false);
  });

  it('on a whole day, asks again inside the same peak five minutes after a raised call — § D1166', () => {
    const acts = [{ startS: 1000, endS: 3000 }];
    const day = input([leg('a', 1500, 1700), leg('b', 1900, 2100)], { horizon: 'whole-day', acts, endedAt: 36_000 });
    const first = nextDayCallOf(day, 0)!;
    expect(first.atS).toBe(1560);
    /* § D1138 jumped to the peak's end (3 000 s) once a call was raised; the spacing is all that is left. */
    expect(dayCallSearchFrom(first)).toBe(first.atS + DAY_CALL_SPACING_S);
    const second = nextDayCallOf(day, dayCallSearchFrom(first));
    expect([second?.atS, second?.rule, second?.act?.startS]).toEqual([1960, 'first-minute-wait', 1000]);
  });

  it('caps a day at six calls and twelve candidates — § D1166', () => {
    expect(DAY_CALL_MAX).toBe(6);
    expect(DAY_CALL_MAX_TRIES).toBe(12);
  });

  it('on a whole day, finds candidates inside the peaks: the first minute-long wait, else the peak’s start', () => {
    const acts = [
      { startS: 1000, endS: 3000 },
      { startS: 10_000, endS: 12_000 },
    ];
    const day = input([leg('a', 1500, 1700), leg('b', 5000, 5100)], { horizon: 'whole-day', acts, endedAt: 36_000 });
    const first = nextDayCallOf(day, 0);
    expect([first?.atS, first?.rule]).toEqual([1560, 'first-minute-wait']);
    /* The wait at 5 060 s is between peaks, so the second call is the second peak's start. */
    const second = nextDayCallOf(day, dayCallSearchFrom(first!));
    expect([second?.atS, second?.rule]).toEqual([10_000, 'act-start']);
    expect(nextDayCallOf(day, dayCallSearchFrom(second!))).toBeUndefined();
  });

  it('moves on by the spacing inside the same stretch when a candidate is refused', () => {
    const acts = [{ startS: 1000, endS: 3000 }];
    const day = input([leg('a', 1500, 1600), leg('b', 1900)], { horizon: 'whole-day', acts, endedAt: 36_000 });
    const first = nextDayCallOf(day, 0)!;
    expect(dayCallSearchFrom(first)).toBe(first.atS + DAY_CALL_SPACING_S);
    expect(nextDayCallOf(day, dayCallSearchFrom(first))?.atS).toBe(1960);
  });
});

describe('the cost gate — § D1138 clause 5', () => {
  it('offers a slice whatever its size, and a whole day only up to the measured leg count', () => {
    expect(dayCallsOffered('period', 70_000)).toBe(true);
    expect(dayCallsOffered('whole-day', DAY_CALL_WHOLE_DAY_MAX_LEGS)).toBe(true);
    expect(dayCallsOffered('whole-day', DAY_CALL_WHOLE_DAY_MAX_LEGS + 1)).toBe(false);
  });

  it('sits between every legible whole day S3 measured and Mixed-Use’s', () => {
    /* `decide-ak/daycost.json`: the largest legible whole day, and the smallest one over 3 s. */
    expect(4155).toBeLessThanOrEqual(DAY_CALL_WHOLE_DAY_MAX_LEGS);
    expect(9933).toBeGreaterThan(DAY_CALL_WHOLE_DAY_MAX_LEGS);
  });
});

describe('the count the answers are compared on', () => {
  it('counts riders who arrived in the window and were still standing a minute later, once each', () => {
    const legs = [
      leg('a', 100, 170), // waited 70 s
      leg('a', 400), // the same rider again: counted once
      leg('b', 120, 150), // 30 s
      leg('c', 130, 200, 180), // turned away at 180 s — never waiting past the refusal
      leg('d', 90, 400), // arrived before the window
      leg('e', 699, 800), // inside, waited 101 s
      leg('f', 700, 900), // at the window's far edge: outside
    ];
    expect(longWaitRidersIn(legs, 100, 700)).toBe(2);
  });

  it('is ten minutes long and clipped at the run’s end', () => {
    expect(DAY_CALL_WINDOW_S).toBe(600);
    expect(dayCallWindowEndOf(100, 1800)).toBe(700);
    expect(dayCallWindowEndOf(1500, 1800)).toBe(1800);
  });
});

describe('the admission — at least three riders, and a tenth of the largest count', () => {
  const triple = (park: number, spread: number, leave: number) => ({
    'park-cars-lobby': park,
    'spread-cars': spread,
    leave,
  });
  it('raises a call at a spread of three on small counts and refuses two', () => {
    expect(dayCallAdmits(triple(5, 8, 6))).toBe(true);
    expect(dayCallAdmits(triple(5, 7, 6))).toBe(false);
  });
  it('asks a tenth of the largest on large counts', () => {
    expect(dayCallAdmits(triple(64, 61, 67))).toBe(false);
    expect(dayCallAdmits(triple(60, 67, 70))).toBe(true);
  });
  it('refuses a call whose three answers read the same — the negative control', () => {
    expect(dayCallAdmits(triple(12, 12, 12))).toBe(false);
  });
});

/* § D900's causal list and § D982's estimation list, and § D1029's mechanism and cross-crowd lists. */
const CAUSAL = ['moved', 'because', 'caused', 'thanks to', 'led to', 'resulted in', 'made the', 'improved', 'fixed', 'due to', 'so the'];
const ESTIMATE = ['better', 'worse', 'worth', 'saves', 'saved', 'saving', 'improves', 'gain', 'costs you', 'would have', 'on average', 'typically', 'usually', 'faster', 'slower', 'thanks'];
const MECHANISM = ['since', 'so that', 'before lunch', 'lunch queue', 'near floor', 'huddle', 'in time', 'too late', 'early'];
const GENERAL = ['always', 'on this tower', 'days like', 'next time', 'the trick', 'the answer', 'rule', 'right', 'wrong', 'best'];

function says(text: string, phrase: string): boolean {
  return new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'iu').test(text);
}

describe('the report’s row for a call', () => {
  const obs = (worstWaitS: number) => ({ worstWaitS }) as unknown as Observations;
  const grade = (observations: Observations): string =>
    observations.worstWaitS > 200 ? 'Shift missed' : 'Shift cleared';
  const clock = (simTimeS: number): string => clockOf(simTimeS, 8 * 3600);
  const record = (answer: DayCallRecord['answer'], worst: [number, number, number]): DayCallRecord => ({
    atS: 2400,
    windowEndS: 3000,
    answer,
    counts: { 'park-cars-lobby': 12, 'spread-cars': 7, leave: 15 },
    observations: {
      'park-cars-lobby': obs(worst[0]),
      'spread-cars': obs(worst[1]),
      leave: obs(worst[2]),
    },
  });
  const ARMS = [
    ['park, verdicts split', dayCallRowOf(record('park-cars-lobby', [150, 250, 250]), 1, grade, clock)],
    ['spread, verdicts level', dayCallRowOf(record('spread-cars', [150, 150, 150]), 2, grade, clock)],
    ['leave', dayCallRowOf(record('leave', [250, 150, 250]), 3, grade, clock)],
    ['skipped', dayCallRowOf(record('skipped', [250, 250, 150]), 1, grade, clock)],
  ] as const;

  it('draws its own id, at the call’s clock, and plain', () => {
    expect(ARMS.map(([, row]) => row.id)).toEqual(['day-call-1', 'day-call-2', 'day-call-3', 'day-call-1']);
    for (const [arm, row] of ARMS) {
      expect(row.when, arm).toBe('08:40');
      expect(row.tone, arm).toBe('plain');
    }
  });

  it('prints the three window counts on this crowd, with the window’s clocks', () => {
    for (const [arm, row] of ARMS) {
      expect(row.why, arm).toContain('On this crowd');
      expect(row.why, arm).toContain('from 08:40 to 08:50');
      expect(row.why, arm).toContain(
        '12 with park the cars in the lobby, 7 with spread the cars across the tower and 15 with leave them',
      );
      expect(row.why.endsWith(DAY_CALL_ROW_NOTE), arm).toBe(true);
    }
  });

  it('names the day’s verdict only where the three runs split', () => {
    const [split, level] = [ARMS[0][1], ARMS[1][1]];
    expect(split.why).toContain(
      'The day read Shift cleared with park the cars in the lobby and Shift missed with spread the cars across the tower and leave them.',
    );
    expect(level.why).not.toContain('The day read');
  });

  it('says what the player did, and nothing about which answer to have chosen', () => {
    expect(ARMS.map(([, row]) => row.what)).toEqual([
      'The stage called the day, and you parked the cars in the lobby',
      'The stage called the day, and you spread the cars across the tower',
      'The stage called the day, and you left the cars as they were',
      'The stage called the day, and the day was skipped to its end',
    ]);
  });

  it('holds § D982’s ban lists and § D1029’s mechanism and cross-crowd lists on every arm', () => {
    for (const [arm, row] of ARMS) {
      const text = `${row.what}. ${row.why}`;
      for (const phrase of [...CAUSAL, ...ESTIMATE, ...MECHANISM, ...GENERAL]) {
        expect(says(text, phrase), `${arm}: ${phrase}`).toBe(false);
      }
    }
  });

  it('lists the answers in the stage’s fixed order, never ranked by their counts', () => {
    expect(DAY_CALL_ANSWERS).toEqual(['park-cars-lobby', 'spread-cars', 'leave']);
  });
});

/**
 * **A day with no call says so at its close** — [§ D1152](../../../../DECISIONS.md), the post-AJ
 * panel's seat B (U1): two quiet days and no word about them, even afterwards. One sentence per
 * way asking can end, each true of what the session saw and nothing past it.
 */
describe('the quiet day’s sentence', () => {
  const ARMS = [
    ['turned down', dayCallsQuietSentenceOf({ kind: 'asked', refused: 4, ending: 'finished' })],
    ['turned down once', dayCallsQuietSentenceOf({ kind: 'asked', refused: 1, ending: 'finished' })],
    ['no moment', dayCallsQuietSentenceOf({ kind: 'asked', refused: 0, ending: 'finished' })],
    ['failed', dayCallsQuietSentenceOf({ kind: 'asked', refused: 2, ending: 'failed' })],
    ['skipped', dayCallsQuietSentenceOf({ kind: 'asked', refused: 0, ending: 'skipped' })],
    ['closed early', dayCallsQuietSentenceOf({ kind: 'asked', refused: 1, ending: 'asking' })],
    ['not offered', dayCallsQuietSentenceOf({ kind: 'not-offered' })],
  ] as const;

  it('says the stage raised no call, on every arm', () => {
    for (const [arm, text] of ARMS) expect(text, arm).toMatch(/^The stage raised no call/u);
  });

  it('quotes the session’s own count and the admission rule it turned them down on', () => {
    expect(ARMS[0][1]).toContain('from 4 moments');
    expect(ARMS[1][1]).toContain('from one moment');
    expect(ARMS[0][1]).toContain(`at least ${String(DAY_CALL_MIN_SPREAD)} riders apart, and a tenth of the largest`);
    expect(ARMS[2][1]).toContain('found no moment to ask');
  });

  it('claims nothing it did not see: no count where it did not finish, nothing about another day', () => {
    for (const arm of ['failed', 'skipped', 'closed early', 'not offered']) {
      const text = ARMS.find(([name]) => name === arm)?.[1] ?? '';
      expect(/\d/u.test(text), `${arm}: ${text}`).toBe(false);
    }
    for (const [arm, text] of ARMS) {
      for (const phrase of [...CAUSAL, ...ESTIMATE, ...MECHANISM, ...GENERAL, 'tomorrow', 'next day']) {
        expect(says(text, phrase), `${arm}: ${phrase}`).toBe(false);
      }
    }
  });
});

/**
 * **The driver question** — [§ D1167](../../../../DECISIONS.md). The pair is fixed from the
 * dispatcher the day opens with, never the one driving, and never one a handover cannot reach; its
 * answers are pressed through `adopt-dispatcher`; its row carries the placement row's ban lists.
 */
describe('the driver question', () => {
  const profiles = contractBuildings().dispatcherProfiles.profiles;
  const byId = (id: string): DispatcherProfile => {
    const profile = profiles.find((entry) => entry.id === id);
    if (profile === undefined) throw new Error(`no shipped profile ${id}`);
    return profile;
  };

  it('offers the first two of collective, Minimum estimated wait and Fairness first that are not driving', () => {
    expect(DAY_CALL_DRIVER_OFFER).toEqual(['collective', 'eta', 'fairness-first']);
    expect(dayCallDriversOf(profiles, byId('collective'))?.map((profile) => profile.id)).toEqual(['eta', 'fairness-first']);
    expect(dayCallDriversOf(profiles, byId('eta'))?.map((profile) => profile.id)).toEqual(['collective', 'fairness-first']);
    expect(dayCallDriversOf(profiles, byId('nearest-car'))?.map((profile) => profile.id)).toEqual(['collective', 'eta']);
  });

  it('offers no pair where a handover cannot reach them — a day opened on a landing panel', () => {
    expect(dayCallDriversOf(profiles, byId('destination-panel'))).toBeUndefined();
  });

  it('presses a driver answer as a handover to that dispatcher, and nothing for keeping who drives', () => {
    const pair = dayCallDriversOf(profiles, byId('collective'))!;
    expect(dayCallChangeOf('driver-a', pair)).toEqual({ kind: 'adopt-dispatcher', profile: pair[0] });
    expect(dayCallChangeOf('driver-b', pair)).toEqual({ kind: 'adopt-dispatcher', profile: pair[1] });
    expect(dayCallChangeOf('leave', pair)).toBeUndefined();
    expect(DAY_CALL_DRIVER_ANSWERS).toEqual(['driver-a', 'driver-b', 'leave']);
  });

  it('is admitted by the placement question’s rule, unchanged', () => {
    expect(dayCallAdmits({ 'driver-a': 5, 'driver-b': 8, leave: 6 })).toBe(true);
    expect(dayCallAdmits({ 'driver-a': 5, 'driver-b': 7, leave: 6 })).toBe(false);
    expect(dayCallAdmits({ 'driver-a': 64, 'driver-b': 61, leave: 67 })).toBe(false);
  });

  const obs = (worstWaitS: number) => ({ worstWaitS }) as unknown as Observations;
  const grade = (observations: Observations): string =>
    observations.worstWaitS > 200 ? 'Shift missed' : 'Shift cleared';
  const clock = (simTimeS: number): string => clockOf(simTimeS, 8 * 3600);
  const names = { 'driver-a': 'Minimum estimated wait', 'driver-b': 'Fairness first', leave: 'Conventional collective' };
  const record = (answer: DayCallRecord['answer'], worst: [number, number, number]): DayCallRecord => ({
    atS: 2400,
    windowEndS: 3000,
    question: 'driver',
    drivers: names,
    answer,
    counts: { 'driver-a': 21, 'driver-b': 30, leave: 38 },
    observations: { 'driver-a': obs(worst[0]), 'driver-b': obs(worst[1]), leave: obs(worst[2]) },
  });
  const ARMS = [
    ['hand to a, verdicts split', dayCallRowOf(record('driver-a', [150, 250, 250]), 1, grade, clock)],
    ['hand to b, verdicts level', dayCallRowOf(record('driver-b', [250, 250, 250]), 2, grade, clock)],
    ['keep', dayCallRowOf(record('leave', [250, 150, 250]), 3, grade, clock)],
    ['skipped', dayCallRowOf(record('skipped', [250, 250, 150]), 4, grade, clock)],
  ] as const;

  it('prints each count by who drove from the call, in the card’s fixed order', () => {
    for (const [arm, row] of ARMS) {
      expect(row.why, arm).toContain(
        '21 with Minimum estimated wait driving, 30 with Fairness first driving and 38 with Conventional collective still driving',
      );
      expect(row.why, arm).toContain('On this crowd');
      expect(row.why.endsWith(DAY_CALL_ROW_NOTE), arm).toBe(true);
    }
    expect(ARMS[0][1].why).toContain(
      'The day read Shift cleared with Minimum estimated wait driving and Shift missed with Fairness first driving and Conventional collective still driving.',
    );
    expect(ARMS[1][1].why).not.toContain('The day read');
  });

  it('says what the player did, and nothing about which answer to have given', () => {
    expect(ARMS.map(([, row]) => row.what)).toEqual([
      'The stage asked who drives, and you switched to Minimum estimated wait',
      'The stage asked who drives, and you switched to Fairness first',
      'The stage asked who drives, and you kept Conventional collective driving',
      'The stage called the day, and the day was skipped to its end',
    ]);
  });

  it('holds § D982’s ban lists and § D1029’s mechanism and cross-crowd lists on every arm, and ranks no dispatcher', () => {
    for (const [arm, row] of ARMS) {
      const text = `${row.what}. ${row.why}`;
      for (const phrase of [...CAUSAL, ...ESTIMATE, ...MECHANISM, ...GENERAL, ...RANKING]) {
        expect(says(text, phrase), `${arm}: ${phrase}`).toBe(false);
      }
    }
  });
});

/** A two-dispatcher row reads like the n = 1 comparison CLAUDE.md's 50 to 200 rule forbids; these keep it a count. */
const RANKING = ['outperformed', 'beat', 'beats', 'won', 'wins', 'stronger', 'weaker', 'the better', 'superior', 'in general', 'dispatchers like', 'recommend'];

/**
 * **No call once the day is already lost** — [§ D1168](../../../../DECISIONS.md). The queue and the
 * worst-wait goals grade a maximum, so a miss on either at the playhead is final.
 */
describe('a day already lost', () => {
  const goals = goalsForDay(1, 'whole-day');
  const reading = (id: string, state: 'met' | 'missed' | 'pending') => {
    const goal = goals.find((entry) => entry.id === id)!;
    return { goal, state } as unknown as Parameters<typeof dayCallLostGoalOf>[0][number];
  };

  it('reads lost where the queue or the worst-wait goal reads missed', () => {
    expect(DAY_CALL_FINAL_GOAL_IDS).toEqual(['queue', 'worst-wait']);
    expect(dayCallLostGoalOf([reading('carry', 'met'), reading('worst-wait', 'missed')])?.goal.id).toBe('worst-wait');
    expect(dayCallLostGoalOf([reading('queue', 'missed')])?.goal.id).toBe('queue');
  });

  it('does not read lost on a goal a later press could still meet — the negative control', () => {
    expect(
      dayCallLostGoalOf([reading('carry', 'missed'), reading('minute', 'missed'), reading('energy', 'missed')]),
    ).toBeUndefined();
    expect(dayCallLostGoalOf([reading('worst-wait', 'pending'), reading('queue', 'met')])).toBeUndefined();
  });

  it('says in the quiet row when the asking stopped and why, claiming only that the day could not clear', () => {
    const text = dayCallsQuietSentenceOf(
      { kind: 'asked', refused: 2, ending: 'lost', lostAtS: 3 * 3600, lostGoal: 'the worst-wait goal' },
      (simTimeS) => clockOf(simTimeS, 8 * 3600),
    );
    expect(text).toBe(
      'The stage raised no call today. By 11:00 the worst-wait goal already read missed, and that goal ' +
        'cannot be met again once missed, so from there no answer could change whether the day cleared ' +
        'and the stage asked nothing more.',
    );
    for (const phrase of [...CAUSAL, ...ESTIMATE, ...MECHANISM, ...GENERAL]) expect(says(text, phrase), phrase).toBe(false);
  });

  it('files a day ended early with a row that says when, and that the figures are the whole day’s', () => {
    const row = dayEndedEarlyRowOf(3 * 3600, (simTimeS) => clockOf(simTimeS, 8 * 3600));
    expect(row.id).toBe(DAY_ENDED_EARLY_ROW_ID);
    expect(row.when).toBe('11:00');
    expect(row.what).toBe('You ended the day early, at 11:00');
    expect(row.why).toContain('the figures on this sheet are the whole day’s');
    const text = `${row.what}. ${row.why}`;
    /* *Early* is the ruling's own word for the fact (the player stopped before the clock did), not a mechanism. */
    const lists = [...CAUSAL, ...ESTIMATE, ...MECHANISM.filter((phrase) => phrase !== 'early'), ...GENERAL];
    for (const phrase of lists) expect(says(text, phrase), phrase).toBe(false);
  });
});
