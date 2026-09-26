/**
 * **How long a Midtown week's days take to watch, and how often they ask, with and without the skip
 * between peaks** — [§ D1212](../../../../DECISIONS.md), swarm DN's Q1 (c), which asked the lane to
 * measure *real minutes per Midtown day and decisions per minute, days 1 to 5, before and after*.
 *
 * ## What it runs
 *
 * `midtown-office` (`c2`, or `STAGE_SKIP_CONTRACTS`), the day Today's scenario plays
 * (`todaysScenarioDayState`, the whole authored day), week days `STAGE_SKIP_DAYS` (default 1 to 5,
 * each with the wrinkle the week deals it, `shift/calendar.ts#scheduledEventFor`) × the census crowds `20 260 824 + 7 919 n`, `n` below `STAGE_SKIP_SEEDS`
 * (default 8), under `collective`, through the shipped `recordRun`. Each day's ordinary calls are
 * asked by the shipped `dev/dayCallSession.ts#openDayCallSession`, opened as `dev/main.ts` opens it
 * and answered in `dayCalls.sweep.test.ts`'s rotation, so the day branches as a player's does. A
 * pinned press day asks its one call (`dev/state.ts#pressDayCallOf`), answered *leave them*.
 *
 * ## What it reports, per day
 *
 * Real seconds over the run the day ended on, from its legs, by
 * `stagePace.test-helper.ts#scoredDayPlayOf`: **before** is § D1169's pacing alone, **after** adds the skip. The
 * stops are every instant the stage stops at — each raised call and each candidate it waited at —
 * and the pause at a stop is the player's and is not counted. **Decisions** are § D1166's measure:
 * the brief's one choice of driver plus the day's calls, over the day's real minutes. The **longest
 * gap** is between two decisions in real seconds, with the day's start and end as edges.
 *
 * Gated on `STAGE_SKIP_SWEEP=1` and written to `STAGE_SKIP_OUT`, for `honesty/measure.corpus.test.ts`'
 * two reasons: the suite must not pay for it, and vitest intercepts `console.log`. Run it with
 * `--testTimeout=21600000`, passed on the command line so nothing is added to `testCost.test.ts`'s
 * census.
 */

import { writeFileSync } from 'node:fs';

import type { RunInterventionConfig } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { openDayCallSession } from '../dev/dayCallSession.js';
import { shiftGoalsOf } from '../dev/leftRail.js';
import { dayCallFactsOf, drivingProfileOf, pressDayCallOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';
import { contractBuildings, todaysScenarioDayState } from '../shift/contractDay.test-helper.js';
import { scheduledEventFor } from '../shift/calendar.js';
import { openWeek } from '../shift/week.js';
import { actsOf } from '../shift/dayLength.js';
import { dayCallDriversOf, dayCallsOffered, type DayCallAnswer } from '../shift/dayCalls.js';

import { scoredDayPlayOf } from './stagePace.test-helper.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S } from './stageScreenModel.js';

const SEEDS = Number(process.env['STAGE_SKIP_SEEDS'] ?? '8');
const CONTRACTS_RUN = (process.env['STAGE_SKIP_CONTRACTS'] ?? 'c2').split(',');
const DAYS = (process.env['STAGE_SKIP_DAYS'] ?? '1,2,3,4,5').split(',').map(Number);
const seedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);
const PLACEMENT_ROTATION: readonly DayCallAnswer[] = ['spread-cars', 'park-cars-lobby', 'leave'];
const DRIVER_ROTATION: readonly DayCallAnswer[] = ['driver-a', 'driver-b', 'leave'];

describe.runIf(process.env['STAGE_SKIP_SWEEP'] === '1')('§ D1212: a Midtown week’s days with and without the skip', () => {
  it('measures real minutes and decisions a real minute, before and after', () => {
    const resources = contractBuildings();
    const rows: string[] = [
      'contract\tday\twrinkle\tn\tstatus\tcalls\tstops\tskips\tbeforeRealS\tafterRealS\tbeforePerMin\tafterPerMin\tbeforeGapMaxS\tafterGapMaxS',
    ];
    const out = process.env['STAGE_SKIP_OUT'];
    const run = (plan: ReturnType<typeof shiftRunConfigOf>): VizRecording =>
      recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording;
    for (const contractId of CONTRACTS_RUN) {
      for (const day of DAYS) {
        for (let n = 0; n < SEEDS; n += 1) {
          /*
           * Day `day` of a fresh week with the wrinkle the week deals that day, as
           * `shift/weekWay.test-helper.ts#weekWayCell`'s `scheduled` arm builds it: the day and its
           * index set together, and no campaign event over the calendar.
           */
          const opened = todaysScenarioDayState(resources, contractId, {
            seed: seedAt(n),
            over: { week: { ...openWeek(contractId), day, dayIdx: (day - 1) % 7 }, campaignEventId: undefined },
          });
          const state: ViewerState = opened.state;
          const wrinkle = scheduledEventFor(state.calendar, state.week.day, state.week.dayIdx, opened.horizon).id;
          const built = run(shiftRunConfigOf(resources, state));
          const facts = dayCallFactsOf(resources, state);
          let status = 'called';
          if (facts === undefined) status = 'no-facts';
          else if (facts.pinned) status = 'pinned';
          else if (!dayCallsOffered(opened.horizon, built.legs.length)) status = 'gated';
          let log: RunInterventionConfig[] = [];
          let ended = built;
          const calls: number[] = [];
          const stops = new Set<number>();
          if (status === 'pinned') {
            const pinned = pressDayCallOf(resources, state, built);
            if (pinned !== undefined) {
              calls.push(pinned.call.atS);
              stops.add(pinned.call.atS);
            }
          } else if (status === 'called' && facts !== undefined) {
            const driving = drivingProfileOf(resources, state);
            const pair = dayCallDriversOf(resources.dispatcherProfiles.profiles, driving);
            const session = openDayCallSession(
              {
                planWith: (extra) => {
                  /* Every candidate the session asks is an instant the stage stops at. */
                  stops.add(extra.atS);
                  const p = shiftRunConfigOf(resources, { ...state, interventions: [...log, extra] });
                  return { config: p.config, outOfServiceCarIds: p.outOfServiceCarIds, recordDecisions: false };
                },
                simulate: (runs, done) => {
                  done(runs.map((r) => recordRun(r.config, { recordDecisions: false, outOfServiceCarIds: r.outOfServiceCarIds }).recording));
                },
                cancel: () => {},
                changed: () => {},
              },
              {
                recording: built,
                bookedOut: facts.bookedOut,
                horizon: facts.horizon,
                goals: shiftGoalsOf(state, resources),
                drivers: pair === undefined ? undefined : { profiles: resources.dispatcherProfiles.profiles, driving },
              },
            );
            let placements = 0;
            let drivers = 0;
            for (let raised = session.onStage(); raised?.raised === true; raised = session.onStage()) {
              calls.push(raised.call.atS);
              const answer =
                raised.question === 'driver'
                  ? DRIVER_ROTATION[drivers++ % DRIVER_ROTATION.length]!
                  : PLACEMENT_ROTATION[placements++ % PLACEMENT_ROTATION.length]!;
              session.answer(answer, (adoption) => {
                log = [...log, adoption.entry];
                ended = adoption.recording;
              });
            }
          }
          const acts = actsOf(ended.demandPhases);
          const playOf = (skip: boolean, untilS?: number) =>
            scoredDayPlayOf({
              legs: ended.legs,
              acts,
              startedAt: ended.startedAt,
              endedAt: ended.endedAt,
              stopsAtS: [...stops],
              watchingSimPerRealS: DEFAULT_STAGE_SIM_PER_REAL_S,
              skip,
              untilS,
            });
          const measure = (skip: boolean) => {
            const whole = playOf(skip);
            const marks = [0, ...calls.map((atS) => playOf(skip, atS).realS), whole.realS];
            const gaps = marks.slice(1).map((mark, i) => mark - (marks[i] ?? 0));
            return { whole, perMin: (1 + calls.length) / (whole.realS / 60), gapMax: Math.max(...gaps) };
          };
          const before = measure(false);
          const after = measure(true);
          rows.push(
            [
              contractId,
              String(day),
              wrinkle,
              String(n),
              status,
              String(calls.length),
              String(stops.size),
              String(after.whole.skips),
              before.whole.realS.toFixed(1),
              after.whole.realS.toFixed(1),
              before.perMin.toFixed(3),
              after.perMin.toFixed(3),
              before.gapMax.toFixed(1),
              after.gapMax.toFixed(1),
            ].join('\t'),
          );
          if (out !== undefined) writeFileSync(out, `${rows.join('\n')}\n`);
        }
      }
    }
    expect(rows.length).toBeGreaterThan(1);
  });
});
