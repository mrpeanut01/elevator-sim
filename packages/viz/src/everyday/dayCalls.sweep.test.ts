/**
 * **How many ordinary calls a scored day raises, and what they do to a sitting's rhythm** — wave AJ,
 * [§ D1138](../../../../DECISIONS.md). The instrument behind the entry's published figures.
 *
 * ## What it runs, per contract × crowd
 *
 * The day Today's scenario plays (`todaysScenarioDayState`: the whole authored day where the tower
 * has one, the slice otherwise), day 1, under `collective`, through the shipped `recordRun`, and then
 * the shipped `dev/dayCallSession.ts#openDayCallSession` over it with its two runs made in-process.
 * The player is played by a fixed rotation — *spread*, *park*, *leave them* — so the day branches the
 * way a player's does and the next call is derived from the run the answer produced. A pinned press
 * day is reported as such and not called (§ D1029 keeps it), and a whole day over the cost gate is
 * reported as gated.
 *
 * ## What it reports
 *
 * - **calls**: the calls raised, and the histogram of calls per day — the ruling's *how many calls
 *   days actually get*, beside S1's 81 % of days with at least one.
 * - **real seconds**: the day's real length under § D991's pacing at the default rung, by
 *   `stagePace.sweep.test.ts`'s integration (the watching rung inside the acts and while anybody has
 *   waited a minute, the between-peaks rung elsewhere), taken over the run the day ended on; a call
 *   adds the time a player spends answering it, which no run can know, so none is added.
 * - **decisions per real minute**, before and after: *before* is the one decision an ordinary day
 *   asks today (who drives, on the brief); *after* adds the day's calls. And the **longest gap**
 *   between two decisions in real seconds, the day's start and end counted as edges.
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
import { dayCallFactsOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { isWaitingAt } from '../frame/overlay.js';
import { recordRun } from '../record/recordRun.js';
import { contractBuildings, todaysScenarioDayState } from '../shift/contractDay.test-helper.js';
import { CONTRACTS } from '../shift/contracts.js';
import { actsOf, type DayAct } from '../shift/dayLength.js';
import { dayCallsOffered, type DayCallAnswer } from '../shift/dayCalls.js';

import { BETWEEN_PEAKS_SIM_PER_REAL_S, PACE_HOLD_WAIT_S } from './stagePace.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S } from './stageScreenModel.js';

const SEEDS = Number(process.env['DAY_CALLS_SEEDS'] ?? '8');
const ONLY = process.env['DAY_CALLS_CONTRACTS']?.split(',');
const seedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);
const W = DEFAULT_STAGE_SIM_PER_REAL_S;
const ROTATION: readonly DayCallAnswer[] = ['spread-cars', 'park-cars-lobby', 'leave'];

/** The intervals played at the watching rung — `stagePace.sweep.test.ts`'s rule, restated for a sweep. */
function slowOf(recording: VizRecording, acts: readonly DayAct[]): [number, number][] {
  const spans: [number, number][] = acts.map((act) => [act.startS, act.endS]);
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

function realBetween(slow: readonly (readonly [number, number])[], a: number, b: number, paced: boolean): number {
  if (!paced) return (b - a) / W;
  let slowS = 0;
  for (const [x, y] of slow) slowS += Math.max(0, Math.min(b, y) - Math.max(a, x));
  return slowS / W + (b - a - slowS) / Math.max(W, BETWEEN_PEAKS_SIM_PER_REAL_S);
}

describe.runIf(process.env['DAY_CALLS_SWEEP'] === '1')('§ D1138: calls per scored day', () => {
  it('runs every contract’s Today’s-scenario day 1 with its calls answered in rotation', () => {
    const resources = contractBuildings();
    const rows: string[] = [
      'contract\tbuilding\thorizon\tn\tstatus\tbuiltLegs\tcalls\tcallClocksS\tdayRealS\tbeforePerMin\tafterPerMin\tgapBeforeRealS\tgapAfterRealS\tbuiltCpuMs\tcpuMs',
    ];
    const out = process.env['DAY_CALLS_OUT'];
    for (const contract of CONTRACTS) {
      if (ONLY !== undefined && !ONLY.includes(contract.id)) continue;
      for (let n = 0; n < SEEDS; n += 1) {
        const started = cpuUsage();
        const { state, horizon } = todaysScenarioDayState(resources, contract.id, { seed: seedAt(n) });
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
        if (status === 'called' && facts !== undefined) {
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
            { recording: built, bookedOut: facts.bookedOut, horizon: facts.horizon },
          );
          for (let k = 0; session.onStage()?.raised === true; k += 1) {
            clocks.push(session.onStage()!.call.atS);
            session.answer(ROTATION[k % ROTATION.length]!, (adoption) => {
              log = [...log, adoption.entry];
              ended = adoption.recording;
            });
          }
        }
        const paced = horizon === 'whole-day';
        const slow = slowOf(ended, paced ? actsOf(ended.demandPhases) : []);
        const dayReal = realBetween(slow, ended.startedAt, ended.endedAt, paced);
        const marks = [0, ...clocks.map((atS) => realBetween(slow, ended.startedAt, atS, paced)), dayReal];
        const gapAfter = Math.max(...marks.slice(1).map((mark, i) => mark - (marks[i] ?? 0)));
        const used = cpuUsage(started);
        rows.push(
          [
            contract.id,
            contract.buildingId,
            horizon,
            String(n),
            status,
            String(built.legs.length),
            String(clocks.length),
            clocks.map((atS) => atS.toFixed(0)).join(','),
            dayReal.toFixed(1),
            (1 / (dayReal / 60)).toFixed(3),
            ((1 + clocks.length) / (dayReal / 60)).toFixed(3),
            dayReal.toFixed(1),
            gapAfter.toFixed(1),
            ((builtUsed.user + builtUsed.system) / 1000).toFixed(0),
            ((used.user + used.system) / 1000).toFixed(0),
          ].join('\t'),
        );
        if (out !== undefined) writeFileSync(out, `${rows.join('\n')}\n`);
      }
    }
    expect(rows.length).toBeGreaterThan(1);
  });
});
