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

import { goalsForDay } from '../shift/goals.js';
import type { GoalReading } from '../shift/types.js';

import {
  STAGE_CALL_COPY,
  STAGE_END_DAY_COPY,
  stageCallCardOf,
  stageCallPhaseOf,
  stageCallPresentOf,
  stageEndDayOf,
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
