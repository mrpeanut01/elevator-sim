/**
 * **The call row's grammar** — [§ D1029](../../../../DECISIONS.md).
 *
 * Three arms (the clearing press, the other one, nothing pressed), each read against the pinned data
 * it prints; § D982's two ban lists copied unchanged, and the ruling's honesty lens's two more — the
 * vocabulary of mechanism and of generalising across crowds. The row must name *this crowd* and a
 * tried count, and it must refuse to print over a log that is not the day as measured.
 */

import type { RunInterventionConfig } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { SPREAD_CARS_LABEL } from '../live/interventions.js';

import { clockOf } from './report.js';
import { PRESS_CALL_AGAIN, PRESS_CALL_ROW_ID, pressCallRowOf } from './callRow.js';
import type { ContractPressDay } from './ladder.js';
import type { PressCall } from './pressCall.js';

const PRESS: ContractPressDay = {
  seedText: '20276662',
  standingOrder: 'collective',
  clearedBy: 'spread-cars',
  missedBy: 'park-cars-lobby',
  horizon: 'whole-day',
  mootUnder: ['eta', 'auction'],
  call: { rule: 'first-minute-wait', windowS: 300, stepS: 10, searchedS: 300, tried: 36, holes: [] },
  refused: undefined,
};
const CALL: PressCall = {
  atS: 9614,
  rule: 'first-minute-wait',
  carId: 'D',
  awayAtS: 9000,
  backAtS: 18000,
  act: { startS: 15300, endS: 17100 },
};
const DAY_START_S = 8 * 3600;
const clock = (simTimeS: number): string => clockOf(simTimeS, DAY_START_S);
const names: Record<string, string> = { eta: 'ETA', auction: 'Auction' };

function rowOf(interventions: readonly RunInterventionConfig[], press: ContractPressDay = PRESS) {
  return pressCallRowOf(
    { press, call: CALL, interventions, nameOf: (id) => names[id] },
    clock,
  );
}
const at = (atS: number, kind: string): RunInterventionConfig[] => [
  { atS, change: { kind } as RunInterventionConfig['change'] },
];

/* § D900's causal list and § D982's estimation list, copied unchanged from `counterfactual.test.ts`. */
const CAUSAL = ['moved', 'because', 'caused', 'thanks to', 'led to', 'resulted in', 'made the', 'improved', 'fixed', 'due to', 'so the'];
const ESTIMATE = ['better', 'worse', 'worth', 'saves', 'saved', 'saving', 'improves', 'gain', 'costs you', 'would have', 'on average', 'typically', 'usually', 'faster', 'slower', 'thanks'];
/* The honesty lens's G5: mechanism, and generalisation across crowds. */
const MECHANISM = ['since', 'so that', 'before lunch', 'lunch queue', 'near floor', 'huddle', 'in time', 'too late', 'early'];
const GENERAL = ['always', 'on this tower', 'days like', 'next time', 'the trick', 'the answer', 'rule'];

function says(text: string, phrase: string): boolean {
  return new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'iu').test(text);
}

describe('the call row', () => {
  const ARMS = [
    ['the clearing press', rowOf(at(CALL.atS, 'spread-cars'))],
    ['the other press', rowOf(at(CALL.atS, 'park-cars-lobby'))],
    ['nothing pressed', rowOf([])],
  ] as const;

  it('draws on every arm, with its own id, at the call’s clock, and plain', () => {
    for (const [arm, row] of ARMS) {
      expect(row?.id, arm).toBe(PRESS_CALL_ROW_ID);
      expect(row?.when, arm).toBe('10:40');
      expect(row?.tone, arm).toBe('plain');
    }
  });

  it('prints the unchosen answer’s pinned verdict on this crowd, with the tried count and range', () => {
    const [cleared, missed, none] = ARMS.map(([, row]) => row);
    const range = 'at 36 moments from 10:40 to 10:45';
    const spread = SPREAD_CARS_LABEL.charAt(0).toLowerCase() + SPREAD_CARS_LABEL.slice(1);
    expect(cleared?.what).toBe(`The stage called the day, and you ${spread} at the call`);
    expect(cleared?.why).toContain(`park the cars in the lobby was tried ${range}, and the day read Shift missed at every one.`);
    expect(missed?.why).toContain(`${spread} was tried ${range}, and the day read Shift cleared at every one.`);
    expect(none?.what).toBe('The stage called the day, and nothing was pressed');
    expect(none?.why).toContain(`each parking press was tried ${range}`);
    for (const [arm, row] of ARMS) {
      expect(row?.why, arm).toContain('On this crowd');
      expect(row?.why, arm).toContain('With no press at all, ETA and Auction clear this crowd’s day.');
    }
  });

  /*
   * § D1151, the post-AJ panel's seat D (H1): a player who pressed *Skip to the end* with the card
   * up was told *nothing was pressed*, which is what *leave them* files too. The row says the day
   * was skipped, in the ordinary call row's own words, and the pinned verdicts are unchanged.
   */
  it('says the call was skipped when it was, and only then', () => {
    const skipped = pressCallRowOf(
      { press: PRESS, call: CALL, interventions: [], nameOf: (id) => names[id], skipped: true },
      clock,
    );
    expect(skipped?.what).toBe('The stage called the day, and the day was skipped to its end');
    expect(skipped?.what).not.toContain('nothing was pressed');
    expect(skipped?.why).toBe(rowOf([])?.why);
    /* A press at the call is an answer, whatever the flag says. */
    const pressed = pressCallRowOf(
      { press: PRESS, call: CALL, interventions: at(CALL.atS, 'spread-cars'), nameOf: (id) => names[id], skipped: true },
      clock,
    );
    expect(pressed?.what).toContain('you spread');
  });

  it('says none of § D982’s words, and no mechanism or cross-crowd word', () => {
    for (const [arm, row] of ARMS) {
      const text = `${row?.what ?? ''} ${row?.why ?? ''}`;
      for (const phrase of [...CAUSAL, ...ESTIMATE, ...MECHANISM, ...GENERAL]) {
        expect(says(text, phrase), `${arm}: ${phrase}`).toBe(false);
      }
    }
    for (const text of Object.values(PRESS_CALL_AGAIN)) {
      for (const phrase of [...CAUSAL, ...ESTIMATE, ...MECHANISM, ...GENERAL]) {
        expect(says(text, phrase), phrase).toBe(false);
      }
    }
  });

  it('reports the moments past the window that did not hold, as what they are', () => {
    const narrow: ContractPressDay = {
      ...PRESS,
      call: { rule: 'first-minute-wait', windowS: 180, stepS: 10, searchedS: 300, tried: 24, holes: [190, 200, 290] },
    };
    expect(rowOf([], narrow)?.why).toContain('Tried on to 10:45, 3 of the later moments did not read that way.');
  });

  it('refuses a log that is not the day as measured — two presses, another second, another kind', () => {
    expect(rowOf([...at(CALL.atS, 'spread-cars'), ...at(CALL.atS + 60, 'park-cars-lobby')])).toBeUndefined();
    expect(rowOf(at(CALL.atS + 1, 'spread-cars'))).toBeUndefined();
    expect(rowOf(at(CALL.atS, 'rezone-bank'))).toBeUndefined();
    expect(rowOf([], { ...PRESS, refused: 'not offered' })).toBeUndefined();
  });

  it('draws no census sentence where no other order clears the day', () => {
    expect(rowOf([], { ...PRESS, mootUnder: [] })?.why).not.toContain('With no press at all');
  });
});
