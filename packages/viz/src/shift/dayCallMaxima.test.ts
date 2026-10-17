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

/** A minute, for the whole-minute sweep: the grid wave AO kept, read here as a sample of instants. */
const MINUTE_S = 60;

describe('each answer’s final goals so far are the rail’s, read at the stage’s playhead — § D1433', () => {
  it('equals the rail’s fold at every whole minute from the call to the run’s end, on two shipped runs', () => {
    for (const id of runs.keys()) {
      const run = runOf(id);
      const callAtS = run.startedAt + 180.5;
      const maxima = dayCallMaximaOf(run, callAtS);
      /* A tight day, so both goals move through their bars inside the run on at least one building. */
      for (const goals of [goalsForDay(1), goalsForDay(20)]) {
        const instants = [callAtS];
        for (let t = Math.ceil(callAtS / MINUTE_S) * MINUTE_S; t < run.endedAt; t += MINUTE_S) {
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
      /* Kept only where something moved: never two samples alike in a row. */
      for (const [index, sample] of maxima.samples.entries()) {
        const before = maxima.samples[index - 1];
        if (before !== undefined) expect(sample.slice(1)).not.toEqual(before.slice(1));
      }
    }
  });

  it('reads at the playhead between minutes, at the run’s end past it, and nothing before the call', () => {
    const run = runOf('midtown-office');
    const maxima = dayCallMaximaOf(run, run.startedAt + 120);
    expect(dayCallMaximaInstantAt(maxima, run.startedAt + 119)).toBeUndefined();
    expect(dayCallMaximaReadingsAt(maxima, goalsForDay(1), run.startedAt + 119)).toBeUndefined();
    expect(dayCallMaximaInstantAt(maxima, run.startedAt + 300 + 59.9)).toBe(run.startedAt + 359.9);
    expect(dayCallMaximaInstantAt(maxima, run.endedAt + 500)).toBe(run.endedAt);
  });
});

/*
 * Wave AP, lane DT-2: seat D's D5. On week 1's Thursday at 08:48 the lost day's card read the
 * deepest landing at 27 and the call's row, on the same run, read 26: the card reads the rail at the
 * frame, and the row read the last whole minute. One source at one instant means the row reads the
 * run where the rail does, so the readings are kept wherever the fold moves rather than at minutes.
 */
describe('the row reads the rail’s own fold at the playhead itself, between minutes too — seat D’s D5', () => {
  /** Every instant from `fromS` at which a leg arrives or is resolved, and a point just after it. */
  function eventInstantsOf(run: VizRecording, fromS: number): readonly number[] {
    const out = new Set<number>([fromS, run.endedAt]);
    for (const leg of run.legs) {
      for (const at of [leg.arrivedAt, leg.boardedAt ?? leg.refusedAt]) {
        if (at === undefined || at < fromS || at > run.endedAt) continue;
        out.add(at);
        if (at + 0.25 <= run.endedAt) out.add(at + 0.25);
      }
    }
    return [...out].sort((a, b) => a - b);
  }

  it('a rise inside a minute is read at the frame it happened, as the lost card reads it', () => {
    const run = runOf('midtown-office');
    const callAtS = run.startedAt + 180.5;
    const maxima = dayCallMaximaOf(run, callAtS);
    const goals = goalsForDay(1);
    /* The first instant after the call at which the deepest landing reads higher than at its minute. */
    const rise = eventInstantsOf(run, callAtS).find((t) => {
      const minute = Math.floor(t / 60) * 60;
      return minute > callAtS && railAt(run, goals, t).queue?.observed !== railAt(run, goals, minute).queue?.observed;
    });
    expect(rise, 'a rise inside a minute on the shipped run').toBeDefined();
    const at = rise ?? 0;
    const row = dayCallMaximaReadingsAt(maxima, goals, at);
    expect(row?.atS).toBe(at);
    expect(row?.queue?.observed).toBe(railAt(run, goals, at).queue?.observed);
  });

  it('equals the rail’s fold at every instant a leg arrives or is resolved, and just after each, on two shipped runs', () => {
    for (const id of runs.keys()) {
      const run = runOf(id);
      const callAtS = run.startedAt + 180.5;
      const maxima = dayCallMaximaOf(run, callAtS);
      const goals = goalsForDay(20);
      const instants = eventInstantsOf(run, callAtS);
      /* Every third instant keeps the sweep inside a second on the larger run; the stride is not the claim. */
      for (const [index, t] of instants.entries()) {
        if (index % 3 !== 0 && t !== run.endedAt) continue;
        const row = dayCallMaximaReadingsAt(maxima, goals, t);
        const rail = railAt(run, goals, t);
        expect([row?.queue?.state, row?.queue?.observed], `${id} queue at ${String(t)}`).toEqual([rail.queue?.state, rail.queue?.observed]);
        expect([row?.worstWait?.state, row?.worstWait?.observed], `${id} wait at ${String(t)}`).toEqual([
          rail.worstWait?.state,
          rail.worstWait?.observed,
        ]);
      }
    }
  });
});

describe('past its bar only where the rail reads it missed — the honesty pair, § D1433', () => {
  it('names no crossing at any instant the rail reads the goal met, and the exact instant it first reads missed', () => {
    let crossings = 0;
    for (const id of runs.keys()) {
      const run = runOf(id);
      const maxima = dayCallMaximaOf(run, run.startedAt);
      /* A bar low enough to be crossed inside the run: the day's queue bar pulled down to two. */
      const goals = goalsForDay(1).map((goal) => (goal.id === 'queue' ? { ...goal, bar: 2 } : goal.id === 'worst-wait' ? { ...goal, bar: 45 } : goal));
      const railMissedAt = (t: number): boolean => {
        const rail = railAt(run, goals, t);
        return rail.queue?.state === 'missed' || rail.worstWait?.state === 'missed';
      };
      const crossing = dayCallMaximaReadingsAt(maxima, goals, run.endedAt)?.pastBarFromS;
      if (crossing !== undefined) {
        crossings += 1;
        /* The rail reads missed at the crossing, and not a millisecond before it. */
        expect(railMissedAt(crossing), `${id} at its crossing`).toBe(true);
        expect(railMissedAt(Math.max(run.startedAt, crossing - 0.001)), `${id} just before its crossing`).toBe(false);
        /* The crossing's own figures are the rail's there. */
        const at = dayCallMaximaReadingsAt(maxima, goals, crossing);
        expect(at?.pastBar.map((reading) => [reading.goal.id, reading.observed])).toEqual(
          [railAt(run, goals, crossing).queue, railAt(run, goals, crossing).worstWait]
            .filter((reading) => reading?.state === 'missed')
            .map((reading) => [reading?.goal.id, reading?.observed]),
        );
      }
      for (let t = run.startedAt; t <= run.endedAt; t += 30) {
        const row = dayCallMaximaReadingsAt(maxima, goals, t);
        /* Positive: said from the crossing on. Negative: never where the rail has not yet read it missed. */
        expect(row?.pastBarFromS !== undefined, `${id} at ${String(t)}`).toBe(crossing !== undefined && t >= crossing);
        if (railMissedAt(t)) expect(row?.pastBarFromS).toBe(crossing);
      }
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
