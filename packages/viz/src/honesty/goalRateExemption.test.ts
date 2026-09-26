/**
 * **R12's rate rule exempts the goal kinds it never judges by kind, not by wording.**
 *
 * `checkGoalWithoutRate` skips `beat-the-baseline` and `everyone-can-get-there`, which carry no
 * per-run rate by construction (§ D160). It used to recognise them by finding the kind's id in the
 * drawn sentence; § D1154 named goals in words, the id left the sentence, and wave AK's deep tier
 * then reported every stage verdict's baseline goal as a goal without a rate, 22 cases in 60. The
 * exemption now reads the kind the producer supplies, and falls back to the id or the shown name.
 */

import { describe, expect, it } from 'vitest';

import { GOAL_NAMES } from '../scenario/goals.js';
import { PROPERTY_CHECKS } from './index.js';
import type { HonestyContext } from './surfaces.js';
import type { RenderedText } from './types.js';

const check = PROPERTY_CHECKS['goal-without-rate'];
const context = {} as HonestyContext;

function goalText(text: string, goal: RenderedText['goal']): RenderedText {
  return { surfaceId: 'campaign/judge.ts#judgeStage', field: 'judge.goals.x.sentence', text, role: 'goal', provenance: 'batch', goal };
}

describe('goal-without-rate reads the kind, not the words', () => {
  it('exempts a baseline goal named in words when the producer supplies its kind', () => {
    const text = goalText(`${GOAL_NAMES['beat-the-baseline']}: not measurably ahead.`, {
      kind: 'beat-the-baseline',
      rateShown: false,
      seeds: 50,
    });
    expect(check(context, [text])).toEqual([]);
  });

  it('exempts a baseline goal by its shown name when no kind is supplied', () => {
    const text = goalText(`${GOAL_NAMES['beat-the-baseline']}: not measurably ahead.`, { rateShown: false, seeds: 50 });
    expect(check(context, [text])).toEqual([]);
  });

  it('still refuses a rate-judged goal drawn with no rate, named or not', () => {
    const named = goalText(`${GOAL_NAMES['deliver-everyone']}: bar reached.`, {
      kind: 'deliver-everyone',
      rateShown: false,
      seeds: 50,
    });
    expect(check(context, [named]).map((v) => v.property)).toEqual(['goal-without-rate']);
  });
});
