/**
 * **The call card says what is on the stage and nothing else** — [§ D1029](../../../../DECISIONS.md).
 *
 * The reconciliation's four refusals, held on every arm the card draws: no countdown, no *now*, no
 * word that the moment is decisive, no hint which press. And the one threshold: the call's minute
 * is the stage's own held beat.
 */

import { loadConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import { overlayAt } from '../frame/overlay.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';

import { WAIT_BANDS } from '../live/bands.js';
import { PARK_CARS_LOBBY_LABEL, SPREAD_CARS_LABEL } from '../live/interventions.js';
import type { PressCall } from '../shift/pressCall.js';

import { goalsForDay, readGoals } from '../shift/goals.js';
import type { GoalObservations, GoalReading } from '../shift/types.js';

import {
  STAGE_CALL_ANSWER_LINES,
  STAGE_CALL_COPY,
  STAGE_END_DAY_COPY,
  stageCallCardOf,
  stageCallDriverLineOf,
  stageCallNearestBarLineOf,
  stageCallPhaseOf,
  stageCallPresentOf,
  stageCallStandingOrderOf,
  stageEndDayOf,
  stageLostCardOf,
  STAGE_LOST_COPY,
  type StageCallPresent,
} from './stageCall.js';
import { PACE_HOLD_WAIT_S } from './stagePace.js';

const DAY_START_S = 8 * 3600;

const CALLS: readonly PressCall[] = [
  { atS: 9614, rule: 'first-minute-wait', carId: 'D', awayAtS: 9000, backAtS: 18000, act: { startS: 15300, endS: 17100 } },
  { atS: 15300, rule: 'act-start', carId: 'C', awayAtS: 9000, backAtS: 18000, act: { startS: 15300, endS: 17100 } },
  { atS: 450, rule: 'act-start', carId: 'D', awayAtS: 450, backAtS: 900, act: { startS: 0, endS: 1800 } },
  { atS: 635, rule: 'first-minute-wait', carId: 'D', awayAtS: 450, backAtS: null, act: { startS: 0, endS: 1800 } },
];

/** Every string a card draws. */
function wordsOf(call: PressCall): readonly string[] {
  const card = stageCallCardOf(call, DAY_START_S, []);
  return [card.heading, ...card.facts, card.question, ...card.options.map((option) => option.label)];
}

const BANNED: readonly (readonly [string, RegExp])[] = [
  ['a countdown', /\b(seconds?|minutes?) (left|remaining)\b|\buntil it\b|\bcountdown\b|\bruns out\b|\bhurry\b/iu],
  ['now', /\bnow\b|\bright away\b|\bimmediately\b/iu],
  ['a decisive word', /\bdecid|\bdecisive\b|\bcrucial\b|\bkey moment\b|\blast chance\b|\bmatters\b|\bcritical\b/iu],
  ['a hint which press', /\bbest\b|\bright (one|press|answer)\b|\bshould\b|\btry\b|\brecommend|\bclears?\b|\bmiss(es)?\b/iu],
];

describe('the card', () => {
  it('draws no countdown, no now, no decisive word and no hint, on every arm', () => {
    for (const call of CALLS) {
      for (const text of wordsOf(call)) {
        for (const [what, pattern] of BANNED) expect(pattern.test(text), `${what}: ${text}`).toBe(false);
      }
    }
    for (const text of Object.values(STAGE_CALL_COPY)) {
      for (const [what, pattern] of BANNED) expect(pattern.test(text), `${what}: ${text}`).toBe(false);
    }
  });

  it('offers the two parking presses and leave them, in the stage’s fixed order whatever the pin', () => {
    for (const call of CALLS) {
      const options = stageCallCardOf(call, DAY_START_S, []).options;
      expect(options.map((option) => option.label)).toEqual([
        PARK_CARS_LOBBY_LABEL,
        SPREAD_CARS_LABEL,
        STAGE_CALL_COPY.leave,
      ]);
      expect(options.map((option) => option.change?.kind)).toEqual(['park-cars-lobby', 'spread-cars', undefined]);
    }
  });

  it('says only the ruling’s three facts — the car, a minute’s wait, the peak — each where it is true', () => {
    const [minute, act, slice, noReturn] = CALLS.map((call) => stageCallCardOf(call, DAY_START_S, []).facts);
    expect(minute).toEqual(['Car D is out of passenger service until 13:00.', STAGE_CALL_COPY.minute]);
    expect(act).toEqual(['Car C is out of passenger service until 13:00.', 'The peak opened at 12:15.']);
    /* A slice's act-start is the car leaving, which the first line already says. */
    expect(slice).toEqual(['Car D is out of passenger service until 08:15.']);
    expect(noReturn?.[0]).toBe('Car D is out of passenger service for the rest of the day.');
  });

  /**
   * The post-AI panel's seat B, defect 5: on St Jude's pinned day cars D and E are both out
   * 08:37–08:46 and the card named only car D. Every booked-out car away at the call is named; a car
   * back before the call, or not yet gone, is not.
   */
  it('names every booked-out car that is away at the call, one line per return time', () => {
    const [minute] = CALLS;
    if (minute === undefined) throw new Error('fixture');
    const bookedOut = [
      { carId: 'E', awayAtS: 9000, backAtS: 18000 },
      { carId: 'D', awayAtS: 9000, backAtS: 18000 },
      { carId: 'F', awayAtS: 9300, backAtS: null },
      { carId: 'B', awayAtS: 7000, backAtS: 9500 },
      { carId: 'C', awayAtS: 9700, backAtS: 12000 },
    ];
    const facts = stageCallCardOf(minute, DAY_START_S, bookedOut).facts;
    expect(facts).toEqual([
      'Cars D and E are out of passenger service until 13:00.',
      'Car F is out of passenger service for the rest of the day.',
      STAGE_CALL_COPY.minute,
    ]);
    /* The call's own car is named even when the list handed in omits it. */
    expect(stageCallCardOf(minute, DAY_START_S, [{ carId: 'E', awayAtS: 9000, backAtS: 18000 }]).facts[0]).toBe(
      'Cars D and E are out of passenger service until 13:00.',
    );
  });

  /*
   * § D1138: an ordinary day's call is not gated on a booked-out car, so the card names a car only
   * where one is out at the instant, and a peak's start is its own fact. The card is the same card:
   * the same heading, question and three answers in the same order, and it carries nothing a call
   * that turns the day would draw differently from one that does not — there is no field for that.
   */
  it('draws an ordinary call with no car line where no car is out, and the peak’s start as its fact', () => {
    const minute: PressCall = { atS: 900, rule: 'first-minute-wait', carId: '', awayAtS: 900, backAtS: null, act: undefined, carAway: false };
    const peak: PressCall = {
      atS: 15300,
      rule: 'act-start',
      carId: '',
      awayAtS: 15300,
      backAtS: null,
      act: { startS: 15300, endS: 17100 },
      carAway: false,
    };
    expect(stageCallCardOf(minute, DAY_START_S, []).facts).toEqual([STAGE_CALL_COPY.minute]);
    expect(stageCallCardOf(peak, DAY_START_S, []).facts).toEqual(['The peak opened at 12:15.']);
    for (const call of [minute, peak]) {
      const card = stageCallCardOf(call, DAY_START_S, []);
      const pinned = stageCallCardOf(CALLS[0]!, DAY_START_S, []);
      expect([card.heading, card.options.map((option) => option.label)]).toEqual([
        pinned.heading,
        pinned.options.map((option) => option.label),
      ]);
      /* § D1150: with no car out the question is about the cars, not the ones that are left. */
      expect(card.question).toBe(STAGE_CALL_COPY.questionAllCars);
      for (const text of wordsOf(call)) {
        for (const [what, pattern] of BANNED) expect(pattern.test(text), `${what}: ${text}`).toBe(false);
      }
    }
  });

  /*
   * § D1265, wave AM lane AM-F: a call drawn inside the day's wrinkle says which wrinkle and since
   * when, from the schedule, and nothing else new: the same heading, question and answers, and the
   * car line where the wrinkle took a car. A peak call draws no such line.
   */
  it('names the day’s wrinkle and when it began on a call drawn inside it, and nowhere else', () => {
    const car = [{ carId: 'C', awayAtS: 19_800, backAtS: 28_800 }];
    const start: PressCall = {
      atS: 19_800,
      rule: 'wrinkle-start',
      carId: 'C',
      awayAtS: 19_800,
      backAtS: 28_800,
      act: { startS: 19_800, endS: 28_800 },
      carAway: true,
      wrinkle: { name: 'Move-in day', startS: 19_800 },
    };
    const inside: PressCall = { ...start, atS: 21_000, rule: 'first-minute-wait' };
    const startCard = stageCallCardOf(start, DAY_START_S, car);
    expect(startCard.facts.at(-1)).toBe('Move-in day: under way since 13:30.');
    /* The car line comes first, as on every call with a car out; no peak line on a wrinkle's start. */
    expect(startCard.facts[0]).toMatch(/^Car C\b/u);
    expect(startCard.facts.some((fact) => /peak/iu.test(fact))).toBe(false);
    expect(stageCallCardOf(inside, DAY_START_S, car).facts).toContain('Move-in day: under way since 13:30.');
    expect(stageCallCardOf(inside, DAY_START_S, car).facts).toContain(STAGE_CALL_COPY.minute);
    const { wrinkle: _dropped, ...peakCall } = inside;
    expect(stageCallCardOf(peakCall, DAY_START_S, car).facts.some((fact) => fact.includes('under way'))).toBe(false);
    for (const call of [start, inside]) {
      const card = stageCallCardOf(call, DAY_START_S, car);
      expect([card.heading, card.question]).toEqual([STAGE_CALL_COPY.heading, STAGE_CALL_COPY.question]);
      for (const text of [card.heading, ...card.facts, card.question, ...card.options.map((option) => option.label)]) {
        for (const [what, pattern] of BANNED) expect(pattern.test(text), `${what}: ${text}`).toBe(false);
      }
    }
  });

  /*
   * § D1150, the post-AJ panel's seats A (D4) and D (H6): *What do the cars that are left do?* at
   * 08:36 on Midtown's Monday, with car D out only from 10:30. The question names a car being away,
   * so it is asked exactly where the card's own facts name one — on either kind of call.
   */
  it('asks about the cars that are left only where the card names a car that is out', () => {
    const noneOut: PressCall = { atS: 2160, rule: 'first-minute-wait', carId: '', awayAtS: 2160, backAtS: null, act: undefined, carAway: false };
    const later = [{ carId: 'D', awayAtS: 9000, backAtS: 18000 }];
    expect(stageCallCardOf(noneOut, DAY_START_S, later).question).toBe('What do the cars do?');
    expect(stageCallCardOf(noneOut, DAY_START_S, later).facts.join(' ')).not.toContain('Car D');
    const pinned = stageCallCardOf(CALLS[0]!, DAY_START_S, []);
    expect(pinned.facts.some((fact) => /out of passenger service/u.test(fact))).toBe(true);
    expect(pinned.question).toBe('What do the cars that are left do?');
    for (const call of [noneOut, CALLS[0]!]) {
      const card = stageCallCardOf(call, DAY_START_S, later);
      const named = card.facts.some((fact) => /out of passenger service/u.test(fact));
      expect(card.question.includes('that are left'), card.facts.join(' ')).toBe(named);
    }
  });

  it('the call’s minute is the stage’s held beat — one threshold', () => {
    expect(WAIT_BANDS[2]?.fromS).toBe(PACE_HOLD_WAIT_S);
    expect(STAGE_CALL_COPY.minute).toContain('a minute');
    expect(PACE_HOLD_WAIT_S).toBe(60);
  });
});

describe('the phase', () => {
  it('is coming before the call, called from it, and answered once answered whatever the playhead', () => {
    const [call] = CALLS;
    if (call === undefined) throw new Error('no call');
    expect(stageCallPhaseOf(call, call.atS - 1, false)).toBe('coming');
    expect(stageCallPhaseOf(call, call.atS, false)).toBe('called');
    expect(stageCallPhaseOf(call, call.atS + 600, false)).toBe('called');
    expect(stageCallPhaseOf(call, call.atS - 1, true)).toBe('answered');
    expect(stageCallPhaseOf(call, call.atS + 1, true)).toBe('answered');
  });
});

/**
 * **The driver question's card** — [§ D1167](../../../../DECISIONS.md). The placement card's heading
 * and facts, its own question and three answers in a fixed order, and the same four refusals.
 */
describe('the driver question’s card', () => {
  const drivers = { 'driver-a': 'Minimum estimated wait', 'driver-b': 'Fairness first', leave: 'Conventional collective' };

  it('keeps the placement card’s heading and facts, and asks who drives, in a fixed order', () => {
    for (const call of CALLS) {
      const placement = stageCallCardOf(call, DAY_START_S, []);
      const driver = stageCallCardOf(call, DAY_START_S, [], drivers);
      expect(driver.heading).toBe(placement.heading);
      expect(driver.facts).toEqual(placement.facts);
      expect(driver.question).toBe('Who drives the rest of the day?');
      expect(driver.options.map((option) => [option.label, option.answer])).toEqual([
        ['Switch to Minimum estimated wait', 'driver-a'],
        ['Switch to Fairness first', 'driver-b'],
        ['Keep Conventional collective driving', 'leave'],
      ]);
    }
  });

  it('draws no countdown, no now, no decisive word and no hint', () => {
    for (const call of CALLS) {
      const card = stageCallCardOf(call, DAY_START_S, [], drivers);
      for (const text of [card.question, ...card.options.map((option) => option.label)]) {
        for (const [what, pattern] of BANNED) expect(pattern.test(text), `${what}: ${text}`).toBe(false);
      }
    }
  });
});

/**
 * ***End the day*** — [§ D1168](../../../../DECISIONS.md). Offered only where a goal whose miss is
 * final reads missed on the readings at the playhead; its note names the goal and carries no figure.
 */
describe('End the day', () => {
  const goals = goalsForDay(1);
  const readingsWith = (id: string, state: 'met' | 'missed' | 'pending'): GoalReading[] =>
    goals.map((goal) => ({ goal, state: goal.id === id ? state : 'pending' }) as unknown as GoalReading);

  it('is offered where the landing-queue or worst-wait goal reads missed, and names it', () => {
    expect(stageEndDayOf(readingsWith('queue', 'missed'))).toEqual({
      label: 'End the day',
      note:
        'The landing-queue goal is already past its bar, and it cannot come back under it today. Ending now ' +
        'files the whole day as it runs from here, with nothing more pressed.',
    });
    expect(stageEndDayOf(readingsWith('worst-wait', 'missed'))?.note).toMatch(/^The worst-wait goal is already past its bar/u);
  });

  it('is not offered while the day can still clear — the negative control', () => {
    expect(stageEndDayOf(readingsWith('minute', 'missed'))).toBeUndefined();
    expect(stageEndDayOf(readingsWith('queue', 'met'))).toBeUndefined();
    expect(stageEndDayOf(readingsWith('worst-wait', 'pending'))).toBeUndefined();
  });

  it('carries no figure, so it grades nothing the strip beside it does not already draw', () => {
    const view = stageEndDayOf(readingsWith('queue', 'missed'))!;
    expect(/\d/u.test(`${view.label} ${view.note}`)).toBe(false);
    expect(STAGE_END_DAY_COPY.label).toBe('End the day');
  });
});

/**
 * **The card's present-tense line** — wave AL, lane AL-C, [§ D1206](../../../../DECISIONS.md), the
 * decide-an ruling's Q1(d) first half: how many stand, where the most stand, the longest wait — read
 * off the run at the call second and never ahead of it, and held to the card's ban lists.
 */
describe('the present-tense line — § D1206', () => {
  let recording: VizRecording;
  beforeAll(async () => {
    const config = await loadConfig(DATA_DIR);
    const base = fixtureConfig(config, { buildingId: 'midtown-office', durationS: 900, onTimeout: 'report' });
    recording = recordRun({ ...base, demand: { arrivalRatePctPop5min: 14 } }, { recordDecisions: false }).recording;
  });

  /** An instant somebody has waited a minute, which is where a first-minute call stands. */
  function busyInstant(): number {
    for (let atS = recording.startedAt + 60; atS < recording.endedAt; atS += 5) {
      if (observationsAt(recording, atS).waitingNow >= 3 && (overlayAt(recording, atS).longestCurrentWaitS ?? 0) >= 60) return atS;
    }
    throw new Error('the fixture never has three standing with a minute waited');
  }

  it('counts what the header counts: everybody standing, and the longest wait among them', () => {
    const atS = busyInstant();
    const present = stageCallPresentOf(recording, atS);
    expect(present.standing).toBe(observationsAt(recording, atS).waitingNow);
    expect(present.floors.reduce((sum, floor) => sum + floor.standing, 0)).toBe(present.standing);
    expect(present.longestS).toBeCloseTo(overlayAt(recording, atS).longestCurrentWaitS ?? Number.NaN, 6);
  });

  it('reads nothing after the call: the same line off a run that differs only after it', () => {
    const atS = busyInstant();
    const after = {
      ...recording,
      legs: recording.legs.map((leg) =>
        leg.arrivedAt <= atS ? leg : { ...leg, boardedAt: leg.arrivedAt + 1, refusedAt: undefined },
      ),
    } as VizRecording;
    expect(stageCallPresentOf(after, atS)).toEqual(stageCallPresentOf(recording, atS));
    const [call] = CALLS;
    const line = (run: VizRecording) => stageCallCardOf({ ...call!, atS }, DAY_START_S, [], undefined, stageCallPresentOf(run, atS)).facts.at(-1);
    expect(line(after)).toBe(line(recording));
  });

  it('is the card’s last fact on either question, with nothing but counts of the frame in it', () => {
    const atS = busyInstant();
    const present = stageCallPresentOf(recording, atS);
    const [call] = CALLS;
    const placement = stageCallCardOf({ ...call!, atS }, DAY_START_S, [], undefined, present);
    const driver = stageCallCardOf({ ...call!, atS }, DAY_START_S, [], { 'driver-a': 'A', 'driver-b': 'B', leave: 'C' }, present);
    const line = placement.facts.at(-1)!;
    expect(driver.facts.at(-1)).toBe(line);
    expect(placement.facts.length).toBe(stageCallCardOf({ ...call!, atS }, DAY_START_S, []).facts.length + 1);
    /* Every figure in it is one of the frame's counts: the standing, the floors, the most, the longest. */
    const most = Math.max(...present.floors.map((floor) => floor.standing));
    const allowed = new Set(
      [present.standing, present.floors.length, most, Math.round(present.longestS ?? 0)].map(String),
    );
    for (const figure of line.match(/(?<!floor )\b\d+/gu) ?? []) expect(allowed.has(figure), `${figure} in “${line}”`).toBe(true);
  });

  it('holds the card’s ban lists on every arm it can draw', () => {
    const arms: StageCallPresent[] = [
      { standing: 0, floors: [], longestS: undefined },
      { standing: 1, floors: [{ label: 'Lobby', standing: 1 }], longestS: 64.4 },
      { standing: 5, floors: [{ label: 'Lobby', standing: 5 }], longestS: 71 },
      { standing: 9, floors: [{ label: 'Lobby', standing: 6 }, { label: 'floor 4', standing: 2 }, { label: 'floor 7', standing: 1 }], longestS: 88.2 },
      { standing: 8, floors: [{ label: 'Lobby', standing: 4 }, { label: 'floor 4', standing: 4 }], longestS: 120 },
    ];
    const lines = arms.map((present) => stageCallCardOf(CALLS[0]!, DAY_START_S, [], undefined, present).facts.at(-1)!);
    expect(lines).toEqual([
      'Nobody is standing at the landings.',
      'One person is standing, at Lobby, and has waited 64 s.',
      '5 people are standing, all at Lobby. The longest of them has waited 71 s.',
      '9 people are standing on 3 floors, the most at Lobby (6). The longest of them has waited 88 s.',
      '8 people are standing on 2 floors, 4 each at Lobby and floor 4. The longest of them has waited 120 s.',
    ]);
    for (const text of lines) {
      for (const [what, pattern] of BANNED) expect(pattern.test(text), `${what}: ${text}`).toBe(false);
      /* No forward figure: nothing about what follows, what an answer does, or a count ahead. */
      expect(text).not.toMatch(/\b(will|would|next|ahead|expect\w*|forecast|if you|after)\b/iu);
    }
  });
});

/*
 * Wave AO, lane DR-1, § D1432: before the answer the card states present facts only: the goal
 * graded on a maximum nearest its bar, with its reading and bar, and one line per answer saying what
 * that answer is. No cleared or missed, no effect, no cause, nothing about what follows.
 */
describe('the card teaches what it may before the answer — § D1432', () => {
  const GOALS = goalsForDay(1).map((goal) =>
    goal.id === 'queue' ? { ...goal, bar: 24 } : goal.id === 'worst-wait' ? { ...goal, bar: 380 } : goal,
  );
  const readingsOf = (peakQueue: number, worstWaitS: number, censored = false): readonly GoalReading[] => {
    const observations: GoalObservations = {
      arrived: 400, carryPct: 100, minutePct: 100, peakQueue, abandoned: 0, abandonedCarried: 0,
      horizonS: 900, worstWaitS, worstWaitIsCensored: censored,
    };
    return readGoals(GOALS, observations);
  };
  const FORWARD = /\b(will|would|next|ahead|expect\w*|forecast|if you|after|cleared?|miss(ed|es)?|better|worse|because|faster|slower|helps?)\b/iu;

  it('names the goal nearest its bar, with its reading and bar, and neither a share goal nor a pending one', () => {
    expect(stageCallNearestBarLineOf(readingsOf(13, 252))).toBe(
      'Nearest its bar: the longest wait so far is 252 s, against a bar of 380 s.',
    );
    expect(stageCallNearestBarLineOf(readingsOf(22, 252))).toBe(
      'Nearest its bar: the deepest landing so far is 22, against a bar of 24.',
    );
    /* A wait still under way reads pending on the rail, so the landing is named whatever its share. */
    expect(stageCallNearestBarLineOf(readingsOf(5, 370, true))).toBe(
      'Nearest its bar: the deepest landing so far is 5, against a bar of 24.',
    );
    expect(stageCallNearestBarLineOf(readGoals(GOALS, { ...({} as GoalObservations), arrived: 3 }))).toBeUndefined();
    const card = stageCallCardOf(CALLS[0]!, DAY_START_S, [], undefined, undefined, { readings: readingsOf(13, 252) });
    expect(card.facts.at(-1)).toBe('Nearest its bar: the longest wait so far is 252 s, against a bar of 380 s.');
  });

  /*
   * Wave AP, lane DT-2: seat A's W1 Thursday at 12:36. The card read *the longest of them has waited
   * 473 s* and named the landing at 19 of 26 as nearest its bar, against a worst-wait bar of 400 s:
   * the rail read the wait as pending because its longest was a rider still standing, and the pick
   * skipped it. A goal already past its bar ranks first, on the rail's own reading or on the standing
   * rider the card's own line counts.
   */
  it('ranks a goal already past its bar first: a rider still standing past the wait’s bar, or a reading past its bar', () => {
    const SEAT_A = goalsForDay(1).map((goal) =>
      goal.id === 'queue' ? { ...goal, bar: 26 } : goal.id === 'worst-wait' ? { ...goal, bar: 400 } : goal,
    );
    const pending = readGoals(SEAT_A, {
      arrived: 400, carryPct: 100, minutePct: 100, peakQueue: 19, abandoned: 0, abandonedCarried: 0,
      horizonS: 900, worstWaitS: 473, worstWaitIsCensored: true,
    });
    const present = { standing: 30, floors: [{ label: 'Garage', standing: 30 }], longestS: 473.4 };
    expect(stageCallNearestBarLineOf(pending, present.longestS)).toBe(
      'Past its bar: the longest wait so far is a rider still standing at 473 s, against a bar of 400 s.',
    );
    const card = stageCallCardOf(CALLS[0]!, DAY_START_S, [], undefined, present, { readings: pending });
    expect(card.facts.at(-1)).toBe('Past its bar: the longest wait so far is a rider still standing at 473 s, against a bar of 400 s.');
    expect(card.facts.join(' ')).not.toMatch(/deepest landing so far is 19/u);
    /* A rider standing under the bar is still not named: the rail reads the wait as pending. */
    expect(stageCallNearestBarLineOf(pending, 390)).toBe('Nearest its bar: the deepest landing so far is 19, against a bar of 26.');
    /* A reading the rail already reads past its bar ranks before one nearer in share. */
    expect(stageCallNearestBarLineOf(readingsOf(27, 370))).toBe('Past its bar: the deepest landing so far is 27, against a bar of 24.');
    for (const line of [stageCallNearestBarLineOf(pending, 473), stageCallNearestBarLineOf(readingsOf(27, 370))]) {
      expect(line ?? '').not.toMatch(FORWARD);
    }
  });

  it('writes each driver’s line from its own weights, heaviest first, so a moved weight moves it', async () => {
    const config = await loadConfig(DATA_DIR);
    const profiles = config.dispatcherProfiles.profiles;
    expect(profiles.length).toBeGreaterThan(5);
    for (const profile of profiles) {
      const line = stageCallDriverLineOf(profile);
      expect(line.startsWith(`${profile.name} weighs `), line).toBe(true);
      /* Player names only: no engine id survives into the line. */
      expect(line, line).not.toMatch(/[a-z][A-Z]/u);
      for (const [what, pattern] of BANNED) expect(pattern.test(line), `${what}: ${line}`).toBe(false);
      expect(line).not.toMatch(FORWARD);
    }
    const fairness = profiles.find((profile) => profile.id === 'fairness-first');
    if (fairness === undefined) throw new Error('the library carries Fairness first');
    expect(stageCallDriverLineOf(fairness)).toBe('Fairness first weighs wait time and starvation.');
    /* Move a weight and the line moves with it: the data is the source. */
    expect(stageCallDriverLineOf({ name: fairness.name, weights: { waitTime: 0.2, starvation: 0.8 } })).toBe(
      'Fairness first weighs starvation and wait time.',
    );
    const predictive = profiles.find((profile) => profile.id === 'predictive-balanced');
    expect(stageCallDriverLineOf(predictive!)).toBe(
      'Predictive balanced weighs 10 things, most of all wait time, direction reversal and starvation.',
    );
  });

  it('puts one line under each answer, a car order’s in its own words, and nothing about the crowd', () => {
    const placement = stageCallCardOf(CALLS[0]!, DAY_START_S, [], undefined, undefined, { readings: readingsOf(13, 252) });
    expect(placement.options.map((option) => option.line)).toEqual([
      STAGE_CALL_ANSWER_LINES['park-cars-lobby'],
      STAGE_CALL_ANSWER_LINES['spread-cars'],
      STAGE_CALL_ANSWER_LINES.leave,
    ]);
    const profiles = new Map([
      ['Energy aware', { name: 'Energy aware', weights: { waitTime: 0.6, stopCount: 0.3, distanceTravelled: 0.1 } }],
      ['Fairness first', { name: 'Fairness first', weights: { waitTime: 0.5, starvation: 0.5 } }],
      ['Predictive balanced', { name: 'Predictive balanced', weights: { waitTime: 1 } }],
    ]);
    const driver = stageCallCardOf(
      CALLS[0]!,
      DAY_START_S,
      [],
      { 'driver-a': 'Energy aware', 'driver-b': 'Predictive balanced', leave: 'Fairness first' },
      undefined,
      { readings: readingsOf(13, 252), driverOf: (name) => profiles.get(name) },
    );
    expect(driver.options.map((option) => option.line)).toEqual([
      'Energy aware weighs wait time, stop count and distance travelled.',
      'Predictive balanced weighs only wait time.',
      'Fairness first weighs wait time and starvation.',
    ]);
    for (const card of [placement, driver]) {
      for (const text of [...card.facts, ...card.options.map((option) => option.line ?? '')]) {
        for (const [what, pattern] of BANNED) expect(pattern.test(text), `${what}: ${text}`).toBe(false);
        expect(text, text).not.toMatch(FORWARD);
      }
    }
    /* Without the teaching the card is drawn as it was: no line, no bar. */
    expect(stageCallCardOf(CALLS[0]!, DAY_START_S, []).options.every((option) => option.line === undefined)).toBe(true);
  });
});

/* Wave AO, lane DR-1, § D1435: the lost day's card, only once a maximum reads past its bar. */
describe('the lost day’s card — § D1435', () => {
  const GOALS = goalsForDay(1).map((goal) =>
    goal.id === 'queue' ? { ...goal, bar: 28 } : goal.id === 'worst-wait' ? { ...goal, bar: 380 } : goal,
  );
  const at = (peakQueue: number, worstWaitS: number): readonly GoalReading[] =>
    readGoals(GOALS, {
      arrived: 400, carryPct: 100, minutePct: 100, peakQueue, abandoned: 0, abandonedCarried: 0,
      horizonS: 900, worstWaitS, worstWaitIsCensored: false,
    });

  it('names the goal past its bar with its figure and clock, and is absent while the day can still clear', () => {
    expect(stageLostCardOf(at(28, 380), '08:49')).toBeUndefined();
    const card = stageLostCardOf(at(29, 200), '08:49');
    expect(card?.heading).toBe(STAGE_LOST_COPY.heading);
    expect(card?.fact).toBe(
      'The deepest landing reached 29 by 08:49, past its bar of 28. A maximum past its bar stays past it, and the ' +
        'stage asks nothing more today.',
    );
    expect(stageLostCardOf(at(10, 412), '12:37')?.fact).toMatch(/^The longest wait reached 412 s by 12:37, past its bar of 380 s\./u);
    /* It offers ending and watching and promises nothing about the rest of the day. */
    for (const text of [card?.fact ?? '', STAGE_LOST_COPY.choices]) {
      expect(text).not.toMatch(/\b(would|could have|if you|better|worse|because|should)\b/iu);
    }
    expect([STAGE_LOST_COPY.end, STAGE_LOST_COPY.watch]).toEqual(['End the day', 'Watch the rest']);
  });
});

/*
 * Wave AR, lane AR-2, § D1528: on Midtown's Monday the 12:20 and 17:20 calls asked *What do the cars
 * do?* after the player had parked them at 10:40, as if nothing had been answered. The calls are not
 * moved or dropped (they feed the call census and its bands); the card says what is in force.
 */
describe('a placement call asked again names the order in force — § D1528', () => {
  const later: PressCall = { atS: 15_600, rule: 'first-minute-wait', carId: '', awayAtS: 15_600, backAtS: null, act: { startS: 15_300, endS: 17_100 }, carAway: false };
  const parkAt = (atS: number) => ({ atS, change: { kind: 'park-cars-lobby' } });

  it('finds the last park or spread press before the call, and nothing else', () => {
    expect(stageCallStandingOrderOf([], 15_600)).toBeUndefined();
    expect(stageCallStandingOrderOf([parkAt(9600)], 15_600)).toEqual({ kind: 'park-cars-lobby', atS: 9600 });
    expect(
      stageCallStandingOrderOf([parkAt(9600), { atS: 12_000, change: { kind: 'spread-cars' } }], 15_600),
    ).toEqual({ kind: 'spread-cars', atS: 12_000 });
    /* A driver handover is not a car order, and a press at or after the call is not before it. */
    expect(stageCallStandingOrderOf([{ atS: 9600, change: { kind: 'adopt-dispatcher' } }], 15_600)).toBeUndefined();
    expect(stageCallStandingOrderOf([parkAt(15_600), parkAt(16_000)], 15_600)).toBeUndefined();
  });

  it('asks whether to keep it, with the clock it was pressed at, and draws the same three answers', () => {
    const plain = stageCallCardOf(later, DAY_START_S, []);
    expect(plain.question).toBe(STAGE_CALL_COPY.questionAllCars);
    const again = stageCallCardOf(later, DAY_START_S, [], undefined, undefined, undefined, { kind: 'park-cars-lobby', atS: 9600 });
    expect(again.question).toBe('You parked the cars at 10:40. Keep that, or change it?');
    expect(again.options.map((option) => option.answer)).toEqual(plain.options.map((option) => option.answer));
    expect(again.facts).toEqual(plain.facts);
    expect(stageCallCardOf(later, DAY_START_S, [], undefined, undefined, undefined, { kind: 'spread-cars', atS: 12_000 }).question).toBe(
      'You spread the cars at 11:20. Keep that, or change it?',
    );
    for (const [what, pattern] of BANNED) expect(again.question, what).not.toMatch(pattern);
    /* The driver question is its own and keeps its words. */
    const drivers = { 'driver-a': 'A', 'driver-b': 'B', leave: 'C' };
    expect(stageCallCardOf(later, DAY_START_S, [], drivers, undefined, undefined, { kind: 'park-cars-lobby', atS: 9600 }).question).not.toContain(
      'parked',
    );
  });
});
