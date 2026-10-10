/**
 * **The careful day's cadence on a correct build, gated as floors** — wave AN, lane DQ-1,
 * [§ D1338](../../../../DECISIONS.md), with the trap check that gates [§ D1337](../../../../DECISIONS.md)'s
 * who-drives pair. Swarm DQ's ruling Q1 items 3 and 5.
 *
 * ## What it runs
 *
 * `midtown-office` (`c2`), week 1's five weekdays each with the wrinkle the week deals, over the
 * first `CALL_CADENCE_CROWDS` (default 4) of `data/week-way.json`'s held-out crowds, from
 * `CALL_CADENCE_FROM` (default 0), each played by
 * `sittingBot.test-helper.ts#playScoredDay` under the careful policy (`s1-fairness-keep-park`:
 * Fairness first at the brief, keep who drives, park the cars): the shipped call session, answered
 * by the policy, on this tree's `core`. That is the correct build by construction, since vitest runs
 * the workspace from source; the browser tier's `builtBundle.browser.test.ts` holds the shipped
 * bundle's worker to the same `core`.
 *
 * ## What it asserts
 *
 * `callCadence.test-helper.ts#cadenceMissesOf`, written before the run: a median of at least four
 * calls a day, no weekday without one, an evening call on at least three of each crowd's five
 * weekdays, and no who-drives answer lowest on under a tenth or over three fifths of the rows. The
 * longest silence is published and has no floor.
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

import { contractBuildings } from '../shift/contractDay.test-helper.js';
import { actsOf } from '../shift/dayLength.js';
import { openWeek } from '../shift/week.js';
import { WEEK_WAY } from '../shift/weekWay.js';
import { crowdSeeds } from '../shift/weekWay.test-helper.js';

import { cadenceMissesOf, cadenceOf, type CadenceDay } from './callCadence.test-helper.js';
import { playScoredDay, SITTING_POLICIES } from './sittingBot.test-helper.js';
import { scoredDayPlayOf } from './stagePace.test-helper.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S } from './stageScreenModel.js';

const CROWDS = Number(process.env['CALL_CADENCE_CROWDS'] ?? '4');
/* Where to start in the held-out list, so a run stopped part-way can be finished crowd by crowd. */
const FROM = Number(process.env['CALL_CADENCE_FROM'] ?? '0');
const CAREFUL = 's1-fairness-keep-park';
const CONTRACT = 'c2';

describe.runIf(process.env['CALL_CADENCE_SWEEP'] === '1')('§ D1338: the careful day’s cadence floors', () => {
  it('meets every floor on the census crowds, and no who-drives answer is a trap or a formula', () => {
    const resources = contractBuildings();
    const policy = SITTING_POLICIES.find((entry) => entry.id === CAREFUL);
    if (policy === undefined) throw new Error(`no policy ${CAREFUL}`);
    const seeds = crowdSeeds(WEEK_WAY.protocol.heldOutFrom, WEEK_WAY.protocol.heldOutCount).slice(FROM, FROM + CROWDS);
    const out = process.env['CALL_CADENCE_OUT'];
    const rows: string[] = [
      'kind\tcrowd\tday\twrinkle\tcleared\tcalls\tevening\trealS\tlongestGapRealS\tlongestWaitingGapRealS\tatS\tquestion\tanswer\tcounts',
    ];
    const days: CadenceDay[] = [];
    for (const [index, seed] of seeds.entries()) {
      const crowd = FROM + index;
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
          calls: played.calls.map((call) => ({ atS: call.atS, question: call.question, counts: call.counts })),
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
      `placement: ${String(summary.placement.rows)} rows; lowest ${shares(summary.placement)}`,
      `misses: ${misses.length === 0 ? 'none' : misses.join('; ')}`,
    ];
    if (out !== undefined) writeFileSync(out, `${rows.join('\n')}\n\n${lines.join('\n')}\n`);
    expect(days.length).toBe(CROWDS * 5);
    /* Non-vacuity: the trap check needs rows to read. */
    expect(summary.driver.rows, lines.join('\n')).toBeGreaterThanOrEqual(10);
    expect(misses, lines.join('\n')).toEqual([]);
  });
});
