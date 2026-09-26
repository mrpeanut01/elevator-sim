/**
 * **How many ordinary calls a scored day raises, and what they do to a sitting's rhythm** — wave AJ,
 * [§ D1138](../../../../DECISIONS.md), re-pointed by wave AK at the rules that replaced its own:
 * [§ D1166](../../../../DECISIONS.md) (calls five minutes apart inside a peak, up to six),
 * [§ D1167](../../../../DECISIONS.md) (the driver question), [§ D1168](../../../../DECISIONS.md) (no
 * call once the day is lost) and [§ D1169](../../../../DECISIONS.md) (a scored day paced by the
 * tutorial's hold rule). The instrument behind those entries' published figures.
 *
 * ## What it runs, per contract × crowd
 *
 * The day Today's scenario plays (`todaysScenarioDayState`: the whole authored day where the tower
 * has one, the slice otherwise), day 1 unless `DAY_CALLS_DAYS` names others, under `collective`,
 * through the shipped `recordRun`, and then the shipped `dev/dayCallSession.ts#openDayCallSession`
 * over it with its runs made in-process and opened exactly as `dev/main.ts#dayCallOnStage` opens it:
 * the rail's goals and the driver pair of the dispatcher the day opened with. The player is played by
 * a fixed rotation on each question — *spread*, *park*, *leave them* on the placement question,
 * *the first of the pair*, *the second*, *keep* on the driver question — so the day branches the way
 * a player's does and the next call is derived from the run the answer produced. A pinned press day
 * is reported as such and not called (§ D1029 keeps it), and a whole day over the cost gate is
 * reported as gated.
 *
 * ## What it reports
 *
 * - **calls**: the calls raised, which question each asked, and how the session's asking ended
 *   (`lost` where § D1168 stopped it).
 * - **real seconds**: the day's real length under § D1169's pacing at the default rung — the
 *   watching rung while somebody on a landing has waited a minute, the fast rung otherwise, on
 *   either horizon — taken over the run the day ended on; a call adds the time a player spends
 *   answering it, which no run can know, so none is added.
 * - **decisions per real minute**: the one decision every day asks on the brief (who drives) plus
 *   the day's calls, over the day's real minutes; and the **longest gap** and **median gap** between
 *   two decisions in real seconds, the day's start and end counted as edges.
 *
 * Gated on `DAY_CALLS_SWEEP=1` and written to `DAY_CALLS_OUT`, for `honesty/measure.corpus.test.ts`'
 * two reasons: the suite must not pay for it, and vitest intercepts `console.log`. `DAY_CALLS_CONTRACTS`
 * narrows the contracts and `DAY_CALLS_SEEDS` sets the crowds (default 8). Each row carries the
 * as-built day's legs and the CPU time of that one run (`builtCpuMs`), which is the measurement the
 * whole-day gate (`shift/dayCalls.ts#DAY_CALL_WHOLE_DAY_MAX_LEGS`) is derived from, beside the CPU
 * time of the whole row with its calls (`cpuMs`).
 *
 * **Run it with `--testTimeout=21600000`.** A whole-day row takes seconds and a full run tens of
 * minutes; the timeout is passed on the command line rather than annotated on the case, so the
 * sweep adds nothing to `testCost.test.ts`'s above-ceiling census.
 */

import { writeFileSync } from 'node:fs';
import { cpuUsage } from 'node:process';

import type { RunInterventionConfig } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { openDayCallSession } from '../dev/dayCallSession.js';
import { shiftGoalsOf } from '../dev/leftRail.js';
import { dayCallFactsOf, drivingProfileOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { isWaitingAt } from '../frame/overlay.js';
import { recordRun } from '../record/recordRun.js';
import { contractBuildings, todaysScenarioDayState } from '../shift/contractDay.test-helper.js';
import { CONTRACTS } from '../shift/contracts.js';
import { dayCallDriversOf, dayCallsOffered, type DayCallAnswer } from '../shift/dayCalls.js';

import { BETWEEN_PEAKS_SIM_PER_REAL_S, PACE_HOLD_WAIT_S } from './stagePace.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S } from './stageScreenModel.js';

const SEEDS = Number(process.env['DAY_CALLS_SEEDS'] ?? '8');
const ONLY = process.env['DAY_CALLS_CONTRACTS']?.split(',');
const DAYS = (process.env['DAY_CALLS_DAYS'] ?? '1').split(',').map(Number);
const seedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);
const W = DEFAULT_STAGE_SIM_PER_REAL_S;
const PLACEMENT_ROTATION: readonly DayCallAnswer[] = ['spread-cars', 'park-cars-lobby', 'leave'];
const DRIVER_ROTATION: readonly DayCallAnswer[] = ['driver-a', 'driver-b', 'leave'];

/** § D1169's slow set: every stretch with somebody on a landing past a minute. */
function slowOf(recording: VizRecording): [number, number][] {
  const spans: [number, number][] = [];
  for (const leg of recording.legs) {
    const left = leg.refusedAt ?? leg.boardedAt ?? recording.endedAt;
    const from = leg.arrivedAt + PACE_HOLD_WAIT_S;
    if (left > from && isWaitingAt(leg, from)) spans.push([from, left]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of spans) {
    const last = merged[merged.length - 1];
    if (last !== undefined && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

function realBetween(slow: readonly (readonly [number, number])[], a: number, b: number): number {
  let slowS = 0;
  for (const [x, y] of slow) slowS += Math.max(0, Math.min(b, y) - Math.max(a, x));
  return slowS / W + (b - a - slowS) / Math.max(W, BETWEEN_PEAKS_SIM_PER_REAL_S);
}

describe.runIf(process.env['DAY_CALLS_SWEEP'] === '1')('§ D1166–§ D1169: calls per scored day', () => {
  it('runs every contract’s Today’s-scenario day with its calls answered in rotation', () => {
    const resources = contractBuildings();
    const rows: string[] = [
      'contract\tbuilding\thorizon\tday\tn\tstatus\tbuiltLegs\tcalls\tdriverCalls\tcallClocksS\tending\tdayRealS\tafterPerMin\tgapMaxRealS\tgapMedianRealS\tbuiltCpuMs\tcpuMs',
    ];
    const out = process.env['DAY_CALLS_OUT'];
    for (const contract of CONTRACTS) {
      if (ONLY !== undefined && !ONLY.includes(contract.id)) continue;
      for (const day of DAYS) {
        for (let n = 0; n < SEEDS; n += 1) {
          const started = cpuUsage();
          const opened = todaysScenarioDayState(resources, contract.id, { seed: seedAt(n) });
          const state: ViewerState = { ...opened.state, week: { ...opened.state.week, day } };
          const horizon = opened.horizon;
          const planOf = (s: ViewerState) => shiftRunConfigOf(resources, s);
          const plan = planOf(state);
          const builtStarted = cpuUsage();
          const built = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds })
            .recording;
          const builtUsed = cpuUsage(builtStarted);
          const facts = dayCallFactsOf(resources, state);
          let status = 'called';
          if (facts === undefined) status = 'no-facts';
          else if (facts.pinned) status = 'pinned';
          else if (!dayCallsOffered(horizon, built.legs.length)) status = 'gated';
          let log: RunInterventionConfig[] = [];
          let ended = built;
          const clocks: number[] = [];
          let driverCalls = 0;
          let ending = '';
          if (status === 'called' && facts !== undefined) {
            const driving = drivingProfileOf(resources, state);
            const pair = dayCallDriversOf(resources.dispatcherProfiles.profiles, driving);
            const session = openDayCallSession(
              {
                planWith: (extra) => {
                  const p = planOf({ ...state, interventions: [...log, extra] });
                  return { config: p.config, outOfServiceCarIds: p.outOfServiceCarIds, recordDecisions: false };
                },
                simulate: (runs, done) => {
                  done(
                    runs.map(
                      (run) =>
                        recordRun(run.config, { recordDecisions: false, outOfServiceCarIds: run.outOfServiceCarIds })
                          .recording,
                    ),
                  );
                },
                cancel: () => {},
                changed: () => {},
              },
              {
                recording: built,
                bookedOut: facts.bookedOut,
                horizon: facts.horizon,
                goals: shiftGoalsOf(state, resources),
                drivers: pair === undefined ? undefined : { pair, drivingName: driving.name },
              },
            );
            let placements = 0;
            let drivers = 0;
            for (let raised = session.onStage(); raised?.raised === true; raised = session.onStage()) {
              clocks.push(raised.call.atS);
              const answer =
                raised.question === 'driver'
                  ? DRIVER_ROTATION[drivers++ % DRIVER_ROTATION.length]!
                  : PLACEMENT_ROTATION[placements++ % PLACEMENT_ROTATION.length]!;
              if (raised.question === 'driver') driverCalls += 1;
              session.answer(answer, (adoption) => {
                log = [...log, adoption.entry];
                ended = adoption.recording;
              });
            }
            const quiet = session.quiet();
            ending = quiet.kind === 'asked' ? quiet.ending : quiet.kind;
          }
          const slow = slowOf(ended);
          const dayReal = realBetween(slow, ended.startedAt, ended.endedAt);
          const marks = [0, ...clocks.map((atS) => realBetween(slow, ended.startedAt, atS)), dayReal];
          const gaps = marks.slice(1).map((mark, i) => mark - (marks[i] ?? 0));
          const sorted = [...gaps].sort((a, b) => a - b);
          const used = cpuUsage(started);
          rows.push(
            [
              contract.id,
              contract.buildingId,
              horizon,
              String(day),
              String(n),
              status,
              String(built.legs.length),
              String(clocks.length),
              String(driverCalls),
              clocks.map((atS) => atS.toFixed(0)).join(','),
              ending,
              dayReal.toFixed(1),
              ((1 + clocks.length) / (dayReal / 60)).toFixed(3),
              Math.max(...gaps).toFixed(1),
              (sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(1),
              ((builtUsed.user + builtUsed.system) / 1000).toFixed(0),
              ((used.user + used.system) / 1000).toFixed(0),
            ].join('\t'),
          );
          if (out !== undefined) writeFileSync(out, `${rows.join('\n')}\n`);
        }
      }
    }
    expect(rows.length).toBeGreaterThan(1);
  });
});
