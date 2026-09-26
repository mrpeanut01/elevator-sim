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

import { dayCallsOffered } from '../shift/dayCalls.js';
import { actsOf } from '../shift/dayLength.js';
import { admittedPressDayIds, pressDayFor } from '../shift/ladder.js';
import { pressAt, pressDayArmOf } from '../shift/pressDay.test-helper.js';
import { FIRST_DAY_CONTRACT_IDS } from '../shift/firstSession.js';

import { PINNED_DAY_LENGTHS, pinnedDayLengthLineOf, type PinnedDayLength } from './firstDayLength.js';
import { pacedDayRealS } from './sittingShape.js';
import { scoredDayPlayOf } from './stagePace.test-helper.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S } from './stageScreenModel.js';

const fixed = (value: number): number => Number(value.toFixed(3));

/** One row, measured. */
function measure(contractId: string): PinnedDayLength {
  const press = pressDayFor(contractId);
  if (press === undefined) throw new Error(`${contractId} pins no day`);
  const seed = BigInt(press.seedText);
  const asBuilt = pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, []);
  const call = asBuilt.call;
  if (call === undefined) throw new Error(`${contractId}'s pinned day draws no call`);
  const acts = actsOf(asBuilt.recording.demandPhases);
  /*
   * § D1169's pacing and § D1212's skip, read off the legs by the stage's own rule, with the stage
   * stopping at the call: nothing is skipped past it. The pinned call is the only stop passed in,
   * and that is exact rather than short under § D1204: the ordinary calls the day asks after it are
   * candidates `shift/dayCalls.ts#nextDayCallOf` draws **inside a peak** on a whole day, and the
   * skip cuts only **between** peaks, so a later stop cannot split a skip. Nothing is pressed after
   * the call on these three runs (§ D1204's *middle, with nothing pressed after*).
   */
  const played = (recording: typeof asBuilt.recording, untilS?: number) =>
    scoredDayPlayOf({
      legs: recording.legs,
      acts,
      startedAt: recording.startedAt,
      endedAt: recording.endedAt,
      stopsAtS: [call.atS],
      watchingSimPerRealS: DEFAULT_STAGE_SIM_PER_REAL_S,
      skip: true,
      untilS,
    });
  const arms = [
    asBuilt,
    pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, pressAt(call.atS, press.clearedBy)),
    pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, pressAt(call.atS, press.missedBy)),
  ].map((arm) => {
    const { recording } = arm;
    const play = played(recording);
    return {
      recordedS: fixed(recording.endedAt - recording.startedAt),
      slowS: fixed(play.slowS),
      skippedS: fixed(play.skippedS),
    };
  });
  /*
   * The middle arm as the stage would play it — `sittingShape.ts#pacedDayRealS` at the opening rung,
   * with § D1212's skip (§ D1204 picks the middle, § D1212 the pacing).
   */
  const realOf = (arm: { recordedS: number; slowS: number; skippedS: number }): number =>
    pacedDayRealS({ periodS: arm.recordedS, ...arm }, DEFAULT_STAGE_SIM_PER_REAL_S);
  const middle = [...arms].sort((a, b) => realOf(a) - realOf(b))[1]!;
  const toCall = played(asBuilt.recording, call.atS);
  return {
    contractId,
    callAtS: fixed(call.atS),
    toCallSlowS: fixed(toCall.slowS),
    toCallSkippedS: fixed(toCall.skippedS),
    peaks: acts.length,
    peaksBefore: acts.filter((act) => act.endS <= call.atS).length,
    inPeak: acts.some((act) => act.startS <= call.atS && call.atS < act.endS),
    middle,
    asksOn: dayCallsOffered('whole-day', asBuilt.recording.legs.length),
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

  it('reproduces every row from a run — the call, the pacing before it, the middle of the three arms, and whether it asks on', () => {
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
        /^A whole day: about \d+ min of watching at 4×, 30× wherever nobody on a landing has waited a minute, and the quiet between peaks skipped\. /u,
      );
      /*
       * § D1204: a day that asks on after its call says the stage stops there *first*, and promises
       * no count of later stops; *once* is said only where the day's ordinary calls are gated off.
       */
      if (row.asksOn) {
        expect(line).toMatch(/The stage stops first for its call .*, about \d+ min in, and may stop again later in the day\.$/u);
        expect(line).not.toMatch(/\bonce\b/u);
      } else {
        expect(line).toMatch(/The stage stops once for its call .*, about \d+ min in\.$/u);
      }
      expect(line).not.toMatch(/\bup to\b|\b\d+ (more )?(calls|stops|times)\b/u);
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
