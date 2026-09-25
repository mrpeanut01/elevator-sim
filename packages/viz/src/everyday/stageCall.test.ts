/**
 * **The call card says what is on the stage and nothing else** — [§ D1029](../../../../DECISIONS.md).
 *
 * The reconciliation's four refusals, held on every arm the card draws: no countdown, no *now*, no
 * word that the moment is decisive, no hint which press. And the one threshold: the call's minute
 * is the stage's own held beat.
 */

import { describe, expect, it } from 'vitest';

import { WAIT_BANDS } from '../live/bands.js';
import { PARK_CARS_LOBBY_LABEL, SPREAD_CARS_LABEL } from '../live/interventions.js';
import type { PressCall } from '../shift/pressCall.js';

import { STAGE_CALL_COPY, stageCallCardOf, stageCallPhaseOf } from './stageCall.js';
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
