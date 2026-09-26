/**
 * **The pinned whole day's length and its call, re-measured on every suite run** —
 * [§ D1047](../../../../DECISIONS.md), `firstDayLength.ts`.
 *
 * Every row of `PINNED_DAY_LENGTHS` is a run: the pinned crowd under the standing order, the call
 * asked of it by the stage's own function, and the same day with each of the two parking presses
 * stamped at that call. Twelve whole days at about two seconds each. The pacing is read off the legs
 * the way `stagePace.sweep.test.ts` reads it, which `stagePace.test.ts` holds against the real
 * `Playback` to within thirty real seconds on a whole day.
 *
 * `FIRST_DAY_LENGTH_OUT` names a file the measured table is written to, for vitest's `console.log`
 * reason (`honesty/measure.corpus.test.ts`).
 */

import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { isWaitingAt } from '../frame/overlay.js';
import { actsOf, type DayAct } from '../shift/dayLength.js';
import { admittedPressDayIds, pressDayFor } from '../shift/ladder.js';
import { pressAt, pressDayArmOf } from '../shift/pressDay.test-helper.js';
import { FIRST_DAY_CONTRACT_IDS } from '../shift/firstSession.js';

import { PINNED_DAY_LENGTHS, pinnedDayLengthLineOf, type PinnedDayLength } from './firstDayLength.js';
import { pacedDayRealS } from './sittingShape.js';
import { PACE_HOLD_WAIT_S } from './stagePace.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S } from './stageScreenModel.js';

/**
 * § D1169's slow set on a scored day — every stretch with somebody past a minute on a landing. The
 * acts are no longer slow of themselves: a pinned day is a week's day, paced by the tutorial's rule.
 */
function slowIntervalsOf(recording: VizRecording): [number, number][] {
  const raw: [number, number][] = [];
  for (const leg of recording.legs) {
    const left = leg.refusedAt ?? leg.boardedAt ?? recording.endedAt;
    const from = leg.arrivedAt + PACE_HOLD_WAIT_S;
    if (left <= from || !isWaitingAt(leg, from)) continue;
    raw.push([from, left]);
  }
  const sorted = raw.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

function slowWithin(slow: readonly (readonly [number, number])[], from: number, to: number): number {
  let total = 0;
  for (const [a, b] of slow) total += Math.max(0, Math.min(to, b) - Math.max(from, a));
  return Number(total.toFixed(3));
}

/** One row, measured. */
function measure(contractId: string): PinnedDayLength {
  const press = pressDayFor(contractId);
  if (press === undefined) throw new Error(`${contractId} pins no day`);
  const seed = BigInt(press.seedText);
  const asBuilt = pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, []);
  const call = asBuilt.call;
  if (call === undefined) throw new Error(`${contractId}'s pinned day draws no call`);
  const acts = actsOf(asBuilt.recording.demandPhases);
  const arms = [
    asBuilt,
    pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, pressAt(call.atS, press.clearedBy)),
    pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, pressAt(call.atS, press.missedBy)),
  ].map((arm) => {
    const { recording } = arm;
    const slow = slowIntervalsOf(recording);
    return {
      recordedS: Number((recording.endedAt - recording.startedAt).toFixed(3)),
      slowS: slowWithin(slow, recording.startedAt, recording.endedAt),
    };
  });
  /* Longest as the stage would play it — `sittingShape.ts#pacedDayRealS` at the opening rung. */
  const realOf = (arm: { recordedS: number; slowS: number }): number =>
    pacedDayRealS({ periodS: arm.recordedS, ...arm }, DEFAULT_STAGE_SIM_PER_REAL_S);
  const longest = arms.reduce((best, arm) => (realOf(arm) > realOf(best) ? arm : best));
  const slow = slowIntervalsOf(asBuilt.recording);
  return {
    contractId,
    callAtS: Number(call.atS.toFixed(3)),
    toCallSlowS: slowWithin(slow, asBuilt.recording.startedAt, call.atS),
    peaks: acts.length,
    peaksBefore: acts.filter((act) => act.endS <= call.atS).length,
    inPeak: acts.some((act) => act.startS <= call.atS && call.atS < act.endS),
    longest,
  };
}

describe('the pinned whole day’s length and its call — § D1047', () => {
  it('covers exactly the admitted whole-day pins, which are exactly the whole-day first days', () => {
    const wholeDayPins = admittedPressDayIds().filter((id) => pressDayFor(id)?.horizon === 'whole-day');
    expect(PINNED_DAY_LENGTHS.map((row) => row.contractId)).toEqual(wholeDayPins);
    /*
     * Every whole-day first day is an admitted whole-day pin, so the brief draws the line wherever
     * the draw can deal one. It read the other way until § D1178 filtered the first-day set by the
     * week census: the rows stay for every admitted pin, because the picker still reaches them.
     */
    for (const id of FIRST_DAY_CONTRACT_IDS) {
      if (pressDayFor(id)?.horizon === 'whole-day') expect(wholeDayPins, id).toContain(id);
    }
    expect(wholeDayPins.length, 'no whole day is left to describe, so this file asserts nothing').toBeGreaterThan(0);
  });

  it('reproduces every row from a run — the call, the pacing before it, and the longest of the three arms', () => {
    const wholeDayPins = admittedPressDayIds().filter((id) => pressDayFor(id)?.horizon === 'whole-day');
    const measured = wholeDayPins.map(measure);
    const out = process.env['FIRST_DAY_LENGTH_OUT'];
    if (out !== undefined) writeFileSync(out, `${JSON.stringify(measured, null, 2)}\n`);
    expect(measured).toEqual(PINNED_DAY_LENGTHS);
  });

  it('draws a sentence with no answer in it, for every row and for nothing else', () => {
    for (const row of PINNED_DAY_LENGTHS) {
      const line = pinnedDayLengthLineOf(row.contractId) ?? '';
      expect(line, row.contractId).toMatch(
        /^A whole day: up to \d+ min of watching at 4×, and 30× wherever nobody on a landing has waited a minute\. /u,
      );
      expect(line).toMatch(/about \d+ min in\.$/u);
      /* § D529 clause 4: no verb, no hint which answer, no word that the moment decides. */
      expect(line).not.toMatch(/\b(park|spread|lobby|clears?|miss(es)?|decid\w*|now)\b/iu);
      /* The tiebreak's *lunch act* is refused where the measurement contradicts it. */
      if (!row.inPeak) expect(line).not.toMatch(/lunch/iu);
    }
    expect(pinnedDayLengthLineOf('c1')).toBeUndefined();
    expect(pinnedDayLengthLineOf('c8'), 'a slice is not a whole day').toBeUndefined();
    expect(pinnedDayLengthLineOf('c9'), 'a refused pin draws no call').toBeUndefined();
  });
});
