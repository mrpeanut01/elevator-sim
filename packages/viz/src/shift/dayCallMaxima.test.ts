/**
 * `shift/dayCallMaxima.ts` — each answer's two final goals, so far, at the stage's playhead: wave AO,
 * lane DR-1, § D1433.
 *
 * Two claims, each against the rail's own fold rather than a restatement of it:
 *
 * 1. **The readings are the rail's.** At every whole minute from a call to a shipped run's end, and
 *    at its end, the row's queue and worst-wait readings equal `readGoal` over
 *    `shiftObservationsOf(observationsAt(run, t))`: the same state, the same figure.
 * 2. **The honesty pair.** *Past its bar* (the reading's `'missed'`) and the instant the run could no
 *    longer clear are said only where the rail already reads the goal missed: never at a minute
 *    before, and from the first minute on.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { breadthConfig, DATA_DIR } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';

import {
  DAY_CALL_MAXIMA_STEP_S,
  dayCallMaximaInstantAt,
  dayCallMaximaOf,
  dayCallMaximaReadingsAt,
} from './dayCallMaxima.js';
import { goalsForDay, readGoals } from './goals.js';
import { shiftObservationsOf } from './observations.js';
import type { ShiftGoal } from './types.js';

let config: LoadedConfig;
const runs = new Map<string, VizRecording>();

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  for (const id of ['midtown-office', 'crown-hotel']) runs.set(id, recordRun(breadthConfig(config, id)).recording);
});

function runOf(id: string): VizRecording {
  const run = runs.get(id);
  if (run === undefined) throw new Error(`no run for ${id}`);
  return run;
}

/** The rail's two final goals at `t`, as `host.goalsAt` folds them. */
function railAt(run: VizRecording, goals: readonly ShiftGoal[], t: number) {
  const readings = readGoals(goals, shiftObservationsOf(observationsAt(run, t)));
  return {
    queue: readings.find((reading) => reading.goal.id === 'queue'),
    worstWait: readings.find((reading) => reading.goal.id === 'worst-wait'),
  };
}

describe('each answer’s final goals so far are the rail’s, read at the minute the stage has reached — § D1433', () => {
  it('equals the rail’s fold at every whole minute from the call to the run’s end, on two shipped runs', () => {
    for (const id of runs.keys()) {
      const run = runOf(id);
      const callAtS = run.startedAt + 180.5;
      const maxima = dayCallMaximaOf(run, callAtS);
      /* A tight day, so both goals move through their bars inside the run on at least one building. */
      for (const goals of [goalsForDay(1), goalsForDay(20)]) {
        const instants = [callAtS];
        for (let t = Math.ceil(callAtS / DAY_CALL_MAXIMA_STEP_S) * DAY_CALL_MAXIMA_STEP_S; t < run.endedAt; t += DAY_CALL_MAXIMA_STEP_S) {
          instants.push(t);
        }
        instants.push(run.endedAt);
        for (const t of instants) {
          const row = dayCallMaximaReadingsAt(maxima, goals, t);
          const rail = railAt(run, goals, t);
          expect(row?.atS, `${id} at ${String(t)}`).toBe(t);
          expect([row?.queue?.state, row?.queue?.observed], `${id} queue at ${String(t)}`).toEqual([rail.queue?.state, rail.queue?.observed]);
          expect([row?.worstWait?.state, row?.worstWait?.observed], `${id} wait at ${String(t)}`).toEqual([
            rail.worstWait?.state,
            rail.worstWait?.observed,
          ]);
        }
      }
      /* Kept only where something moved: never more samples than minutes read. */
      expect(maxima.samples.length).toBeLessThanOrEqual(Math.ceil((run.endedAt - callAtS) / DAY_CALL_MAXIMA_STEP_S) + 2);
    }
  });

  it('reads at the last whole minute reached between minutes, at the run’s end past it, and nothing before the call', () => {
    const run = runOf('midtown-office');
    const maxima = dayCallMaximaOf(run, run.startedAt + 120);
    expect(dayCallMaximaInstantAt(maxima, run.startedAt + 119)).toBeUndefined();
    expect(dayCallMaximaReadingsAt(maxima, goalsForDay(1), run.startedAt + 119)).toBeUndefined();
    expect(dayCallMaximaInstantAt(maxima, run.startedAt + 300 + 59.9)).toBe(Math.floor((run.startedAt + 359.9) / 60) * 60);
    expect(dayCallMaximaInstantAt(maxima, run.endedAt + 500)).toBe(run.endedAt);
  });
});

describe('past its bar only where the rail reads it missed — the honesty pair, § D1433', () => {
  it('names no crossing at any minute the rail reads the goal met, and the first minute it reads missed after', () => {
    let crossings = 0;
    for (const id of runs.keys()) {
      const run = runOf(id);
      const maxima = dayCallMaximaOf(run, run.startedAt);
      /* A bar low enough to be crossed inside the run: the day's queue bar pulled down to two. */
      const goals = goalsForDay(1).map((goal) => (goal.id === 'queue' ? { ...goal, bar: 2 } : goal.id === 'worst-wait' ? { ...goal, bar: 45 } : goal));
      let firstMissed: number | undefined;
      for (let t = run.startedAt; t <= run.endedAt; t += 30) {
        const rail = railAt(run, goals, dayCallMaximaInstantAt(maxima, t) ?? t);
        const railMissed = rail.queue?.state === 'missed' || rail.worstWait?.state === 'missed';
        const row = dayCallMaximaReadingsAt(maxima, goals, t);
        if (railMissed) firstMissed ??= dayCallMaximaInstantAt(maxima, t);
        /* Positive: said where the rail reads missed. Negative: never where it does not. */
        expect(row?.pastBarFromS !== undefined, `${id} at ${String(t)}`).toBe(railMissed || firstMissed !== undefined);
        if (row?.pastBarFromS !== undefined) expect(row.pastBarFromS).toBe(firstMissed);
      }
      if (firstMissed !== undefined) crossings += 1;
    }
    /* The pair is only evidence if a crossing happened. */
    expect(crossings).toBeGreaterThan(0);
  });

  it('reads a longest wait that is a rider still standing as pending, as the rail does, never as past its bar', () => {
    const run = runOf('crown-hotel');
    const maxima = dayCallMaximaOf(run, run.startedAt);
    const censored = maxima.samples.filter((sample) => sample[3] === null);
    for (const sample of censored) {
      const row = dayCallMaximaReadingsAt(maxima, goalsForDay(1), sample[0]);
      expect(row?.worstWait?.state).toBe('pending');
      expect(observationsAt(run, sample[0]).worstWaitIsCensored).toBe(true);
    }
  });
});
