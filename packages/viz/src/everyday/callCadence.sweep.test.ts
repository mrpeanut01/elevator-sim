/**
 * **The careful day's cadence on a correct build, gated as floors** — wave AN, lane DQ-1,
 * [§ D1338](../../../../DECISIONS.md), with [§ D1337](../../../../DECISIONS.md)'s count check on the
 * who-drives pair beside it. Swarm DQ's ruling Q1 items 3 and 5; moved by wave AO, lane DR-2,
 * [§ D1440](../../../../DECISIONS.md), onto crowds 0, 5, 10 and 15, with the count check published
 * rather than gated, since the gate on who drives is now the day's verdict (`callBands.sweep.test.ts`).
 *
 * ## What it runs
 *
 * `midtown-office` (`c2`), week 1's five weekdays each with the wrinkle the week deals, over the
 * census crowds `data/call-bands.json` names (0, 5, 10 and 15 of `data/week-way.json`'s held-out
 * list; `CALL_CADENCE_CROWDS`, a comma list, narrows a hand run), each played by
 * `sittingBot.test-helper.ts#playScoredDay` under the careful policy (`s1-fairness-keep-park`:
 * Fairness first at the brief, keep who drives, park the cars): the shipped call session, answered
 * by the policy, on this tree's `core`. That is the correct build by construction, since vitest runs
 * the workspace from source; the browser tier's `builtBundle.browser.test.ts` holds the shipped
 * bundle's worker to the same `core`.
 *
 * ## What it asserts
 *
 * `callCadence.test-helper.ts#cadenceMissesOf`, written before the run: a median of at least four
 * calls a day, no weekday without one, and an evening call on at least three of each crowd's five
 * weekdays. The longest silence is published and has no floor; so are § D1337's count check
 * (`countTrapNotesOf`) and the who-drives rows on the day's verdict (`verdictReadingOf`).
 *
 * ## What it writes
 *
 * One `day` row a day and one `call` row a raised call, then the summary, to `CALL_CADENCE_OUT`
 * (vitest intercepts `console.log`). Gated on `CALL_CADENCE_SWEEP=1` and scheduled nightly
 * (`.github/workflows/deep-tiers.yml`'s `call-cadence`); a miss there is a finding for a ruling,
 * never a reason to change the instrument or a floor. Run it by hand with
 * `--testTimeout=21600000`.
 */

import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CALL_BANDS } from '../shift/callBands.js';
import { contractBuildings } from '../shift/contractDay.test-helper.js';
import { actsOf } from '../shift/dayLength.js';
import { openWeek } from '../shift/week.js';
import { WEEK_WAY } from '../shift/weekWay.js';
import { crowdSeeds } from '../shift/weekWay.test-helper.js';

import { cadenceMissesOf, cadenceOf, countTrapNotesOf, verdictReadingOf, type CadenceDay } from './callCadence.test-helper.js';
import { playScoredDay, SITTING_POLICIES } from './sittingBot.test-helper.js';
import { scoredDayPlayOf } from './stagePace.test-helper.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S } from './stageScreenModel.js';

/*
 * § D1440: the census crowds the gate reads, spread across the held-out list rather than its easy
 * first four (swarm DR's S3: the careful line cleared 20 of 20 days on crowds 0 to 3 against 82 of
 * 100 over all twenty). The call bands read the same four (`data/call-bands.json`). A comma list
 * narrows a hand run, so one stopped part-way can be finished crowd by crowd.
 */
const CROWDS: readonly number[] = (process.env['CALL_CADENCE_CROWDS'] ?? CALL_BANDS.protocol.crowds.join(','))
  .split(',')
  .map(Number);
const CAREFUL = 's1-fairness-keep-park';
const CONTRACT = 'c2';

describe.runIf(process.env['CALL_CADENCE_SWEEP'] === '1')('§ D1338: the careful day’s cadence floors', () => {
  it('meets every floor on the census crowds, and no who-drives answer is a trap or a formula', () => {
    const resources = contractBuildings();
    const policy = SITTING_POLICIES.find((entry) => entry.id === CAREFUL);
    if (policy === undefined) throw new Error(`no policy ${CAREFUL}`);
    const all = crowdSeeds(WEEK_WAY.protocol.heldOutFrom, WEEK_WAY.protocol.heldOutCount);
    const out = process.env['CALL_CADENCE_OUT'];
    const rows: string[] = [
      'kind\tcrowd\tday\twrinkle\tcleared\tcalls\tevening\trealS\tlongestGapRealS\tlongestWaitingGapRealS\tatS\tquestion\tanswer\tcounts',
    ];
    const days: CadenceDay[] = [];
    for (const crowd of CROWDS) {
      const seed = all[crowd];
      if (seed === undefined) throw new Error(`no census crowd ${String(crowd)}`);
      for (const day of [1, 2, 3, 4, 5]) {
        const played = playScoredDay({
          resources,
          contractId: CONTRACT,
          week: { ...openWeek(CONTRACT), day, dayIdx: day - 1 },
          seed,
          policy,
        });
        const recording = played.recording;
        const acts = actsOf(recording.demandPhases);
        const evening = acts.at(-1);
        /* Real time to an instant, at the default rung with the stage's own skip, as the day plays. */
        const at = (untilS: number) =>
          scoredDayPlayOf({
            legs: recording.legs,
            acts,
            startedAt: recording.startedAt,
            endedAt: recording.endedAt,
            stopsAtS: played.stopsAtS,
            watchingSimPerRealS: DEFAULT_STAGE_SIM_PER_REAL_S,
            skip: true,
            untilS,
          });
        const points = [recording.startedAt, ...played.calls.map((call) => call.atS), recording.endedAt];
        let longestGapRealS = 0;
        let longestWaitingGapRealS = 0;
        let previous = at(points[0]!);
        for (const point of points.slice(1)) {
          const current = at(point);
          longestGapRealS = Math.max(longestGapRealS, current.realS - previous.realS);
          longestWaitingGapRealS = Math.max(
            longestWaitingGapRealS,
            (current.slowS - previous.slowS) / DEFAULT_STAGE_SIM_PER_REAL_S,
          );
          previous = current;
        }
        const measured: CadenceDay = {
          crowd,
          day,
          calls: played.calls.map((call) => ({ atS: call.atS, question: call.question, counts: call.counts, clears: call.clears })),
          evening:
            evening !== undefined && played.calls.some((call) => call.atS >= evening.startS && call.atS < evening.endS),
          realS: played.realS,
          longestGapRealS,
          longestWaitingGapRealS,
        };
        days.push(measured);
        rows.push(
          [
            'day',
            String(crowd),
            String(day),
            played.wrinkle,
            played.cleared ? 'C' : 'm',
            String(played.calls.length),
            measured.evening ? '1' : '0',
            played.realS.toFixed(1),
            longestGapRealS.toFixed(1),
            longestWaitingGapRealS.toFixed(1),
            '',
            '',
            '',
            '',
          ].join('\t'),
        );
        for (const call of played.calls) {
          rows.push(
            [
              'call',
              String(crowd),
              String(day),
              played.wrinkle,
              '',
              '',
              '',
              '',
              '',
              '',
              String(Math.round(call.atS)),
              call.question,
              call.answer,
              Object.entries(call.counts)
                .map(([answer, count]) => `${answer}=${String(count)}`)
                .join(','),
            ].join('\t'),
          );
        }
        if (out !== undefined) writeFileSync(out, `${rows.join('\n')}\n`);
      }
    }
    const summary = cadenceOf(days);
    const misses = cadenceMissesOf(summary);
    const shares = (entry: typeof summary.driver): string =>
      Object.entries(entry.shares)
        .map(([answer, share]) => `${answer} ${(share * 100).toFixed(1)} %`)
        .join(', ');
    const lines = [
      `days ${String(summary.days)}; median calls a day ${String(summary.medianCalls)}; days with no call ${String(summary.silentDays)}`,
      `evening call by crowd: ${[...summary.eveningByCrowd].map(([crowd, e]) => `${String(crowd)}: ${String(e.evening)}/${String(e.days)}`).join(', ')}`,
      `median calls a real minute ${summary.medianCallsPerRealMinute.toFixed(2)}`,
      `longest silence, real minutes at the default rung: median ${summary.longestGapMinutes.median.toFixed(1)}, max ${summary.longestGapMinutes.max.toFixed(1)}`,
      `  of which played while somebody had waited a minute: median ${summary.longestWaitingGapMinutes.median.toFixed(1)}, max ${summary.longestWaitingGapMinutes.max.toFixed(1)}`,
      `who drives: ${String(summary.driver.rows)} rows; lowest ${shares(summary.driver)}`,
      `  published, not gated (§ D1440): ${countTrapNotesOf(summary).join('; ') || 'no answer lowest on under a tenth or over three fifths'}`,
      (() => {
        const verdict = verdictReadingOf(days.flatMap((day) => day.calls));
        return `  on the day's verdict: ${String(verdict.split)} of ${String(verdict.rows)} rows split it, keep lost ${String(verdict.keepLoses)}`;
      })(),
      `placement: ${String(summary.placement.rows)} rows; lowest ${shares(summary.placement)}`,
      `misses: ${misses.length === 0 ? 'none' : misses.join('; ')}`,
    ];
    if (out !== undefined) writeFileSync(out, `${rows.join('\n')}\n\n${lines.join('\n')}\n`);
    expect(days.length).toBe(CROWDS.length * 5);
    /* Non-vacuity: the published who-drives readings need rows to read. */
    expect(summary.driver.rows, lines.join('\n')).toBeGreaterThanOrEqual(10);
    expect(misses, lines.join('\n')).toEqual([]);
  });
});
