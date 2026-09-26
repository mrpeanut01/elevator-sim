/**
 * **An attempt's ordinary calls, on real runs** — [§ D1138](../../../../DECISIONS.md).
 *
 * One Crown Hotel slice at an unpinned crowd (`20 260 824`, `n` 0), run the way the Scenario press
 * runs it, with the session's two runs made synchronously by the shipped `recordRun`. The day
 * raises two calls; the cases below hold what each of them is:
 *
 * - a call is raised only where its three runs' ten-minute counts differ by the threshold, and the
 *   counts the report will print are recomputed here from the runs themselves;
 * - a press adopts a run **identical** to the re-simulation the log would have produced, and that
 *   run differs from *leave them* after the call and not before it — *move the control and require
 *   the run to change, compared on the legs*;
 * - a negative control whose presses change nothing raises no call and stops asking at the cap;
 * - a skip with the card up records the call as skipped and ends the day's calls;
 * - a run that lands after the record grew under it is dropped.
 */

import type { RunInterventionConfig } from '@elevator-sim/core/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { recordRun } from '../record/recordRun.js';
import { todaysScenarioDayState } from '../shift/contractDay.test-helper.js';
import {
  DAY_CALL_MAX_TRIES,
  DAY_CALL_SPACING_S,
  dayCallAdmits,
  longWaitRidersIn,
  type DayCallAnswer,
} from '../shift/dayCalls.js';
import { PRESS_DAY_RESOURCES } from '../shift/pressDay.test-helper.js';

import { openDayCallSession } from './dayCallSession.js';
import type { OffThreadRun } from './offThreadRuns.js';
import { dayCallFactsOf, shiftRunConfigOf, type ViewerState } from './state.js';

const CONTRACT = 'c7';
const SEED = 20_260_824n;

let state: ViewerState;
let built: VizRecording;

function planOf(log: readonly RunInterventionConfig[]): OffThreadRun {
  const plan = shiftRunConfigOf(PRESS_DAY_RESOURCES, { ...state, interventions: [...log] });
  return { config: plan.config, outOfServiceCarIds: plan.outOfServiceCarIds, recordDecisions: false };
}

function run(ask: OffThreadRun): VizRecording {
  return recordRun(ask.config, { recordDecisions: ask.recordDecisions, outOfServiceCarIds: ask.outOfServiceCarIds })
    .recording;
}

/** Leg identity: passenger, leg, when it boarded and on which car. */
const keyOf = (leg: VizRecording['legs'][number]): string =>
  `${leg.passengerId}|${String(leg.legIndex ?? 0)}|${String(leg.boardedAt ?? -1)}|${leg.carId ?? ''}`;

beforeAll(() => {
  state = todaysScenarioDayState(PRESS_DAY_RESOURCES, CONTRACT, { seed: SEED }).state;
  built = run(planOf([]));
});

describe('an ordinary day’s calls on a real crowd', () => {
  it('is an ordinary day: a slice, not the tower’s pinned day', () => {
    const facts = dayCallFactsOf(PRESS_DAY_RESOURCES, state);
    expect(facts?.pinned).toBe(false);
    expect(facts?.horizon).toBe('period');
  });

  it('raises calls only where the three runs differ by the threshold, and records what they counted', () => {
    let log: RunInterventionConfig[] = [];
    const facts = dayCallFactsOf(PRESS_DAY_RESOURCES, state)!;
    const made = new Map<number, Record<'park-cars-lobby' | 'spread-cars', VizRecording>>();
    const session = openDayCallSession(
      {
        planWith: (extra) => planOf([...log, extra]),
        simulate: (runs, done) => {
          const recordings = runs.map(run);
          const atS = runs[0].config.interventions?.at(-1)?.atS ?? -1;
          made.set(atS, { 'park-cars-lobby': recordings[0]!, 'spread-cars': recordings[1]! });
          done(recordings);
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: built, bookedOut: facts.bookedOut, horizon: facts.horizon },
    );
    const answers: DayCallAnswer[] = ['spread-cars', 'leave', 'park-cars-lobby'];
    const standing: VizRecording[] = [built];
    for (let k = 0; session.onStage()?.raised === true; k += 1) {
      const leave = session.recording();
      standing.push(leave);
      session.answer(answers[k % 3]!, (adoption) => {
        log = [...log, adoption.entry];
      });
    }
    const records = session.records();
    expect(records.length).toBeGreaterThanOrEqual(2);
    for (const [index, record] of records.entries()) {
      const runs = made.get(record.atS);
      expect(runs, `call ${String(index + 1)} was made from its own two runs`).toBeDefined();
      const leave = standing[index + 1]!;
      const counted = {
        'park-cars-lobby': longWaitRidersIn(runs!['park-cars-lobby'].legs, record.atS, record.windowEndS),
        'spread-cars': longWaitRidersIn(runs!['spread-cars'].legs, record.atS, record.windowEndS),
        leave: longWaitRidersIn(leave.legs, record.atS, record.windowEndS),
      };
      expect(record.counts).toEqual(counted);
      expect(dayCallAdmits(record.counts)).toBe(true);
      expect(record.windowEndS - record.atS).toBeCloseTo(600, 6);
    }
    expect(records.map((record) => record.answer)).toEqual(answers.slice(0, records.length));
  });

  it('adopts, for a press, the very run the log re-simulates, and it moves the legs after the call only', () => {
    let log: RunInterventionConfig[] = [];
    const facts = dayCallFactsOf(PRESS_DAY_RESOURCES, state)!;
    const session = openDayCallSession(
      {
        planWith: (extra) => planOf([...log, extra]),
        simulate: (runs, done) => {
          done(runs.map(run));
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: built, bookedOut: facts.bookedOut, horizon: facts.horizon },
    );
    const call = session.onStage();
    expect(call?.raised).toBe(true);
    let adopted: VizRecording | undefined;
    session.answer('park-cars-lobby', (adoption) => {
      log = [...log, adoption.entry];
      adopted = adoption.recording;
    });
    expect(log).toEqual([{ atS: call!.call.atS, change: { kind: 'park-cars-lobby' } }]);
    const again = run(planOf(log));
    expect(adopted!.legs.map(keyOf)).toEqual(again.legs.map(keyOf));
    const before = (legs: VizRecording['legs']) =>
      legs.filter((leg) => leg.boardedAt !== undefined && leg.boardedAt < call!.call.atS).map(keyOf).sort();
    expect(before(adopted!.legs)).toEqual(before(built.legs));
    expect(adopted!.legs.map(keyOf)).not.toEqual(built.legs.map(keyOf));
  });

  it('raises no call when the presses change nothing — the negative control — and stops at the cap', () => {
    let asks = 0;
    const facts = dayCallFactsOf(PRESS_DAY_RESOURCES, state)!;
    const session = openDayCallSession(
      {
        planWith: (extra) => planOf([extra]),
        simulate: (_runs, done) => {
          asks += 1;
          done([built, built]);
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: built, bookedOut: facts.bookedOut, horizon: facts.horizon },
    );
    expect(session.onStage()).toBeUndefined();
    expect(session.records()).toEqual([]);
    expect(asks).toBeGreaterThan(0);
    expect(asks).toBeLessThanOrEqual(DAY_CALL_MAX_TRIES);
    /* § D1152: the quiet day's account is the session's own count, and it finished asking. */
    expect(session.quiet()).toEqual({ kind: 'asked', refused: asks, ending: 'finished' });
  });

  it('says it is still asking while a candidate’s runs are in flight, and failed when one could not be made — § D1152', () => {
    const facts = dayCallFactsOf(PRESS_DAY_RESOURCES, state)!;
    let fail: ((message: string) => void) | undefined;
    const session = openDayCallSession(
      {
        planWith: (extra) => planOf([extra]),
        simulate: (_runs, _done, failed) => {
          fail = failed;
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: built, bookedOut: facts.bookedOut, horizon: facts.horizon },
    );
    expect(session.quiet()).toEqual({ kind: 'asked', refused: 0, ending: 'asking' });
    fail?.('worker gone');
    expect(session.quiet()).toEqual({ kind: 'asked', refused: 0, ending: 'failed' });
  });

  it('records a skip with the card up as skipped, and asks nothing after it', () => {
    const facts = dayCallFactsOf(PRESS_DAY_RESOURCES, state)!;
    let asks = 0;
    const session = openDayCallSession(
      {
        planWith: (extra) => planOf([extra]),
        simulate: (runs, done) => {
          asks += 1;
          done(runs.map(run));
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: built, bookedOut: facts.bookedOut, horizon: facts.horizon },
    );
    expect(session.onStage()?.raised).toBe(true);
    const before = asks;
    session.skip(true);
    expect(session.records().map((record) => record.answer)).toEqual(['skipped']);
    expect(session.onStage()).toBeUndefined();
    expect(asks).toBe(before);
  });

  it('drops runs that land after the record grew under them', () => {
    const facts = dayCallFactsOf(PRESS_DAY_RESOURCES, state)!;
    let landing: ((recordings: readonly VizRecording[]) => void) | undefined;
    let cancelled = 0;
    const session = openDayCallSession(
      {
        planWith: (extra) => planOf([extra]),
        simulate: (_runs, done) => {
          landing = done;
        },
        cancel: () => {
          cancelled += 1;
        },
        changed: () => {},
      },
      { recording: built, bookedOut: facts.bookedOut, horizon: facts.horizon },
    );
    const first = landing;
    expect(session.onStage()?.raised).toBe(false);
    const grown = { ...built } as VizRecording;
    const pressedAtS = session.onStage()!.call.atS - 1;
    session.grew(grown, pressedAtS);
    expect(cancelled).toBe(1);
    first?.([built, built]);
    expect(session.onStage()?.raised).toBe(false);
    expect(session.recording()).toBe(grown);
    /* And the next candidate is asked no sooner than the spacing after the player's own press. */
    expect(session.onStage()?.call.atS ?? Infinity).toBeGreaterThanOrEqual(pressedAtS + DAY_CALL_SPACING_S);
  });
});
