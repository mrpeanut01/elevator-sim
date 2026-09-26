/**
 * **§ D512 legibility, re-measured on the day Today's scenario plays and in real seconds under
 * § D991's pacing** — GitHub issue #592, [§ D991](../../../../DECISIONS.md).
 *
 * `shift/legibility.sweep.test.ts` measures every contract's day 1 **at its own shift length** — the
 * slice. Today's scenario has run the whole authored day on every office contract since § D356, and
 * § D991 changes what a player can see of that day in real time, so the ruling made this
 * re-measurement a precondition: *"§ D512 legibility, measured on the whole-day run and in real
 * seconds under this transport. This decides the first-session eligible set."*
 *
 * ## What it measures, per contract × seed
 *
 * The run Today's scenario plays — `wholeDayRun` spread over the contract's state where
 * `wholeDayFor` answers, the slice otherwise — recorded through the shipped builder, then:
 *
 * - **legible (simulated)**: `legibilityOf`, unchanged — a landing held in the third band for 120
 *   contiguous simulated seconds.
 * - **legible (real)**: the same stretches converted to **real seconds under the pace rule** and held
 *   to the 30 real seconds that 120 simulated seconds is at the default rung. This is the half the
 *   ruling asked for, and it is computed rather than assumed: a stretch is converted by integrating
 *   `1 / pace(t)` over it.
 * - **first legible, real**: real seconds from the start of play to the moment the day first
 *   becomes legible — how long a first session waits for its problem.
 * - **day, real**: the whole recording's real watching under the rule.
 *
 * The pace is evaluated from the legs rather than frame by frame, and the two are the same rule:
 * the transport is at the watching rung exactly when the playhead is inside an act or somebody on
 * some landing has waited past `PACE_HOLD_WAIT_S` — which is the union of `[arrivedAt + 60, leftAt)`
 * over the legs, `legibilityOf`'s own interval, taken over every landing at once.
 * `stagePace.test.ts`' clock leg plays the frame-by-frame form through the real `Playback`.
 *
 * Gated on `STAGE_PACE_SWEEP=1` and written to `STAGE_PACE_OUT`, for `honesty/measure.corpus.test.ts`'
 * two reasons: the suite must not pay for it, and vitest intercepts `console.log`.
 * `STAGE_PACE_CONTRACTS` narrows the contracts so the heavy towers can run in parallel processes.
 */

import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { shiftRunConfigOf } from '../dev/state.js';
import { isWaitingAt } from '../frame/overlay.js';
import { recordRun } from '../record/recordRun.js';
import { contractBuildings, todaysScenarioDayState } from '../shift/contractDay.test-helper.js';
import { CONTRACTS } from '../shift/contracts.js';
import { actsOf, type DayAct } from '../shift/dayLength.js';
import { LEGIBILITY_SWEEP, LEGIBILITY_WINDOW_S, legibilityOf } from '../shift/legibility.js';

import { WHOLE_DAY_LONGEST, WHOLE_DAY_LONGEST_GAME_TOWER, type PacedDay } from './sittingShape.js';

import { BETWEEN_PEAKS_SIM_PER_REAL_S, PACE_HOLD_WAIT_S } from './stagePace.js';
import { scoredDayPlayOf } from './stagePace.test-helper.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S } from './stageScreenModel.js';

const SEEDS = Number(process.env['STAGE_PACE_SEEDS'] ?? '50');
const ONLY = process.env['STAGE_PACE_CONTRACTS']?.split(',');
/** The first seed index to run — a slice of the fifty, so one heavy tower can run in two processes. */
const FROM = Number(process.env['STAGE_PACE_FROM'] ?? '0');
const seedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);
const W = DEFAULT_STAGE_SIM_PER_REAL_S;

function unionOf(intervals: readonly (readonly [number, number])[]): [number, number][] {
  const sorted = [...intervals].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/** The intervals over which § D991 plays at the watching rung: the acts and every held stretch. */
function slowIntervalsOf(recording: VizRecording, acts: readonly DayAct[]): [number, number][] {
  const held: [number, number][] = [];
  for (const leg of recording.legs) {
    const left = leg.refusedAt ?? leg.boardedAt ?? recording.endedAt;
    const from = leg.arrivedAt + PACE_HOLD_WAIT_S;
    if (left <= from || !isWaitingAt(leg, from)) continue;
    held.push([from, left]);
  }
  return unionOf([...held, ...acts.map((act): [number, number] => [act.startS, act.endS])]);
}

/** Real seconds to play `[a, b)` under the rule, given its slow set. `paced === false` is one rung. */
function realBetween(slow: readonly (readonly [number, number])[], a: number, b: number, paced: boolean): number {
  if (!paced) return (b - a) / W;
  let slowS = 0;
  for (const [x, y] of slow) slowS += Math.max(0, Math.min(b, y) - Math.max(a, x));
  const fast = Math.max(W, BETWEEN_PEAKS_SIM_PER_REAL_S);
  return slowS / W + (b - a - slowS) / fast;
}

describe.runIf(process.env['STAGE_PACE_SWEEP'] === '1')('§ D512 on the whole day, in real seconds', () => {
  it('measures every contract’s Today’s-scenario day 1 under § D991’s pacing', () => {
    const resources = contractBuildings();
    /* The published figures this sweep is the source of, refused at budget the day they disagree. */
    const measured: Record<string, { legibleOf50: number; longest: number[] }> = {};
    let longestDay: PacedDay | undefined;
    let longestGameDay: PacedDay | undefined;
    let longestGameDayOf = '';
    const realOf = (day: PacedDay): number =>
      day.slowS / W + (day.recordedS - day.slowS - (day.skippedS ?? 0)) / Math.max(W, BETWEEN_PEAKS_SIM_PER_REAL_S);
    /*
     * § D1212: the game towers' longest day is measured as a scored day now plays — § D1169's slow
     * set (somebody past a minute, the acts no longer slow of themselves) and the quiet between
     * peaks skipped — with no call, since a call stops the stage and its pause is the player's.
     */
    const gameTowersRun = new Set<string>();
    const rows: string[] = ['contract\tbuilding\thorizon\tn\tlegibleSim\tlegibleReal\tlongestS\tlegibleAtS\tlegibleAtRealS\tdayRealS\tflatRealS\tslowS\tperiodS'];
    for (const contract of CONTRACTS) {
      if (ONLY !== undefined && !ONLY.includes(contract.id)) continue;
      if (!contract.buildingId.endsWith('-class-reference')) gameTowersRun.add(contract.id);
      for (let n = FROM; n < SEEDS; n += 1) {
        const { state, horizon } = todaysScenarioDayState(resources, contract.id, { seed: seedAt(n) });
        const plan = shiftRunConfigOf(resources, state);
        const recording = recordRun(plan.config, {
          recordDecisions: false,
          outOfServiceCarIds: plan.outOfServiceCarIds,
        }).recording;
        const paced = horizon === 'whole-day';
        const acts = paced ? actsOf(recording.demandPhases) : [];
        const slow = slowIntervalsOf(recording, acts);
        const day = legibilityOf(recording);
        /* Real-second legibility: every landing's stretches, converted under the rule. */
        let legibleReal = false;
        const byFloor = new Map<string, [number, number][]>();
        for (const leg of recording.legs) {
          const left = leg.refusedAt ?? leg.boardedAt ?? recording.endedAt;
          const from = leg.arrivedAt + PACE_HOLD_WAIT_S;
          if (left <= from || !isWaitingAt(leg, from)) continue;
          const list = byFloor.get(leg.originFloorId) ?? [];
          list.push([from, left]);
          byFloor.set(leg.originFloorId, list);
        }
        for (const intervals of byFloor.values()) {
          for (const [a, b] of unionOf(intervals)) {
            if (realBetween(slow, a, b, paced) >= LEGIBILITY_WINDOW_S / W) legibleReal = true;
          }
        }
        const legibleAtReal =
          day.legibleAtS === undefined ? '' : realBetween(slow, recording.startedAt, day.legibleAtS, paced).toFixed(1);
        rows.push(
          [
            contract.id,
            contract.buildingId,
            horizon,
            String(n),
            day.legible ? '1' : '0',
            legibleReal ? '1' : '0',
            day.longestS.toFixed(0),
            day.legibleAtS === undefined ? '' : day.legibleAtS.toFixed(0),
            legibleAtReal,
            realBetween(slow, recording.startedAt, recording.endedAt, paced).toFixed(1),
            ((recording.endedAt - recording.startedAt) / W).toFixed(1),
            /* The simulated seconds played at the watching rung, and the recording's length. */
            (paced
              ? slow.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, recording.endedAt) - Math.max(a, recording.startedAt)), 0)
              : recording.endedAt - recording.startedAt
            ).toFixed(3),
            (recording.endedAt - recording.startedAt).toFixed(3),
          ].join('\t'),
        );
        const out = process.env['STAGE_PACE_OUT'];
        if (out !== undefined) writeFileSync(out, `${rows.join('\n')}\n`);
        const cell = (measured[contract.id] ??= { legibleOf50: 0, longest: [] });
        if (day.legible) cell.legibleOf50 += 1;
        cell.longest.push(day.longestS);
        if (paced) {
          const slowS = slow.reduce(
            (sum, [a, b]) => sum + Math.max(0, Math.min(b, recording.endedAt) - Math.max(a, recording.startedAt)),
            0,
          );
          const pacedDay: PacedDay = {
            periodS: WHOLE_DAY_LONGEST.periodS,
            recordedS: Number((recording.endedAt - recording.startedAt).toFixed(3)),
            slowS: Number(slowS.toFixed(3)),
          };
          if (longestDay === undefined || realOf(pacedDay) > realOf(longestDay)) longestDay = pacedDay;
          if (!contract.buildingId.endsWith('-class-reference')) {
            const scored = scoredDayPlayOf({
              legs: recording.legs,
              acts,
              startedAt: recording.startedAt,
              endedAt: recording.endedAt,
              stopsAtS: [],
              watchingSimPerRealS: W,
              skip: true,
            });
            const scoredDay: PacedDay = {
              periodS: WHOLE_DAY_LONGEST.periodS,
              recordedS: pacedDay.recordedS,
              slowS: Number(scored.slowS.toFixed(3)),
              skippedS: Number(scored.skippedS.toFixed(3)),
            };
            if (longestGameDay === undefined || realOf(scoredDay) > realOf(longestGameDay)) {
              longestGameDay = scoredDay;
              longestGameDayOf = `${contract.id} n=${String(n)}`;
            }
          }
        }
      }
    }
    expect(rows.length).toBeGreaterThan(1);
    const longestOut = process.env['STAGE_PACE_LONGEST_OUT'];
    if (longestOut !== undefined) {
      writeFileSync(longestOut, `${JSON.stringify({ longestDay, longestGameDay, longestGameDayOf }, null, 2)}\n`);
    }
    /*
     * At the published budget over every contract, the constants this sweep produced must agree
     * with it: § D512's whole-day table in `shift/legibility.ts` and the two longest paced days in
     * `sittingShape.ts`. A fresh measurement that disagrees is red here, not quietly different.
     */
    if (SEEDS === 50 && FROM === 0 && ONLY === undefined) {
      for (const row of LEGIBILITY_SWEEP) {
        const cell = measured[row.contractId];
        const sorted = [...(cell?.longest ?? [])].sort((a, b) => a - b);
        expect({ legibleOf50: cell?.legibleOf50, medianStretchS: Math.round(sorted[Math.floor((sorted.length - 1) / 2)] ?? 0) }, row.contractId).toEqual({
          legibleOf50: row.legibleOf50,
          medianStretchS: row.medianStretchS,
        });
      }
      expect(longestDay).toEqual(WHOLE_DAY_LONGEST);
    }
    /* The game towers' constant needs only the game towers, so a run of those alone can refuse it. */
    const gameTowers = CONTRACTS.filter((contract) => !contract.buildingId.endsWith('-class-reference'));
    if (SEEDS === 50 && FROM === 0 && gameTowers.every((contract) => gameTowersRun.has(contract.id))) {
      expect(longestGameDay).toEqual(WHOLE_DAY_LONGEST_GAME_TOWER);
    }
  }, 21_600_000);
});
