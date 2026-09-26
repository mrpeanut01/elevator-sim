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

import type { DispatcherProfile, RunInterventionConfig } from '@elevator-sim/core/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { recordRun } from '../record/recordRun.js';
import { todaysScenarioDayState } from '../shift/contractDay.test-helper.js';
import {
  DAY_CALL_MAX,
  DAY_CALL_MAX_TRIES,
  DAY_CALL_SPACING_S,
  dayCallAdmits,
  dayCallDriversOf,
  longWaitRidersIn,
  type DayCallAnswer,
} from '../shift/dayCalls.js';
import { goalsForDay } from '../shift/goals.js';
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

/*
 * ---- Wave AK: § D1166 (spacing and the cap), § D1167 (the driver question), § D1168 (no call once lost) ----
 *
 * The session only reads a recording's legs, its clock and its phase schedule, so these cases hand it
 * runs built from the real one by hand: `calmAfter` is the day with every rider who arrives after the
 * call boarded within a second, so its ten-minute count is zero and a call is admitted wherever the
 * real run's count is three or more. That separates the session's sequencing, which these cases hold,
 * from the simulator's answers, which the cases above hold on real runs.
 */

/** Every rider arriving at or after `atS` boards a second later: nobody waits a minute. */
function calmAfter(recording: VizRecording, atS: number): VizRecording {
  return {
    ...recording,
    legs: recording.legs.map((leg) =>
      leg.arrivedAt < atS ? leg : { ...leg, boardedAt: leg.arrivedAt + 1, refusedAt: undefined },
    ),
  } as VizRecording;
}

/** The same run, read as a whole day whose one peak is the whole run. */
function asOnePeakDay(recording: VizRecording): VizRecording {
  return {
    ...recording,
    demandPhases: [
      {
        id: '0-hold',
        kind: 'hold',
        label: 'peak',
        startS: recording.startedAt,
        endS: recording.endedAt,
        startIntensity: 1,
        endIntensity: 1,
      },
    ],
  } as unknown as VizRecording;
}

/** A plan that carries only the press it was planned with, so the fake simulator can read it. */
function fakePlan(extra: RunInterventionConfig): OffThreadRun {
  return { config: { interventions: [extra] } } as unknown as OffThreadRun;
}
const pressOf = (run: OffThreadRun): RunInterventionConfig =>
  (run.config.interventions ?? [])[0] as RunInterventionConfig;

describe('wave AK: a day that keeps asking', () => {
  const pair = (): readonly [DispatcherProfile, DispatcherProfile] => {
    const profiles = PRESS_DAY_RESOURCES.dispatcherProfiles.profiles;
    const collective = profiles.find((profile) => profile.id === 'collective')!;
    return dayCallDriversOf(profiles, collective)!;
  };

  it('asks again inside one peak, five minutes after a raised call, up to the cap — § D1166', () => {
    const day = asOnePeakDay(built);
    const session = openDayCallSession(
      {
        planWith: fakePlan,
        simulate: (runs, done) => {
          done(runs.map((run) => (pressOf(run).change.kind === 'park-cars-lobby' ? calmAfter(day, pressOf(run).atS) : day)));
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: day, bookedOut: [], horizon: 'whole-day' },
    );
    while (session.onStage()?.raised === true) session.answer('leave', () => {});
    const clocks = session.records().map((record) => record.atS);
    expect(clocks.length, 'a second call in the same peak').toBeGreaterThanOrEqual(2);
    expect(clocks.length).toBeLessThanOrEqual(DAY_CALL_MAX);
    for (let k = 1; k < clocks.length; k += 1) {
      expect(clocks[k]! - clocks[k - 1]!).toBeGreaterThanOrEqual(DAY_CALL_SPACING_S);
    }
  });

  it('asks who drives only where the placement question is refused, and hands the day over through adopt-dispatcher — § D1167', () => {
    const drivers = pair();
    const asked: string[] = [];
    let log: RunInterventionConfig[] = [];
    const session = openDayCallSession(
      {
        planWith: fakePlan,
        simulate: (runs, done) => {
          asked.push(runs.map((run) => pressOf(run).change.kind).join('+'));
          /* The parking answers change nothing here; the second of the pair empties the landings. */
          done(
            runs.map((run) => {
              const press = pressOf(run);
              return press.change.kind === 'adopt-dispatcher' && press.change.profile === drivers[1]
                ? calmAfter(built, press.atS)
                : { ...built };
            }),
          );
        },
        cancel: () => {},
        changed: () => {},
      },
      {
        recording: built,
        bookedOut: [],
        horizon: 'period',
        drivers: { pair: drivers, drivingName: 'Conventional collective' },
      },
    );
    const call = session.onStage();
    expect(call?.raised).toBe(true);
    expect(call?.question).toBe('driver');
    expect(call?.drivers).toEqual({
      'driver-a': drivers[0].name,
      'driver-b': drivers[1].name,
      leave: 'Conventional collective',
    });
    expect(asked.slice(0, 2)).toEqual(['park-cars-lobby+spread-cars', 'adopt-dispatcher+adopt-dispatcher']);
    /* An answer from the other question is refused. */
    expect(session.answer('park-cars-lobby', () => {})).toBe(false);
    expect(
      session.answer('driver-a', (adoption) => {
        log = [...log, adoption.entry];
      }),
    ).toBe(true);
    expect(log).toEqual([{ atS: call!.call.atS, change: { kind: 'adopt-dispatcher', profile: drivers[0] } }]);
    const [record] = session.records();
    expect(record?.question).toBe('driver');
    expect(Object.keys(record?.counts ?? {}).sort()).toEqual(['driver-a', 'driver-b', 'leave']);
    expect(record?.counts['driver-b']).toBe(0);
    /* Once handed over, the driver question is not asked again, so a refused placement raises nothing. */
    const after = asked.slice(2);
    expect(after.length, 'the day went on asking the placement question').toBeGreaterThan(0);
    expect(after.every((kinds) => kinds === 'park-cars-lobby+spread-cars')).toBe(true);
    expect(session.onStage()).toBeUndefined();
  });

  it('asks the placement question where it is admitted, and runs no handover for it', () => {
    const asked: string[] = [];
    const session = openDayCallSession(
      {
        planWith: fakePlan,
        simulate: (runs, done) => {
          asked.push(runs.map((run) => pressOf(run).change.kind).join('+'));
          done(runs.map((run) => (pressOf(run).change.kind === 'park-cars-lobby' ? calmAfter(built, pressOf(run).atS) : built)));
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: built, bookedOut: [], horizon: 'period', drivers: { pair: pair(), drivingName: 'Conventional collective' } },
    );
    expect(session.onStage()?.question).toBe('placement');
    expect(asked).toEqual(['park-cars-lobby+spread-cars']);
  });

  it('raises nothing once a goal whose miss is final reads missed, and says when — § D1168', () => {
    /* Somebody is standing at every candidate, so a landing-queue bar of zero already reads missed there. */
    const strict = goalsForDay(1).map((goal) => (goal.id === 'queue' ? { ...goal, bar: 0 } : goal));
    let asks = 0;
    const session = openDayCallSession(
      {
        planWith: fakePlan,
        simulate: (runs, done) => {
          asks += 1;
          done(runs.map((run) => calmAfter(built, pressOf(run).atS)));
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: built, bookedOut: [], horizon: 'period', goals: strict },
    );
    expect(session.onStage()).toBeUndefined();
    expect(asks).toBe(0);
    const quiet = session.quiet();
    expect(quiet.kind === 'asked' && quiet.ending).toBe('lost');
    expect(quiet.kind === 'asked' && quiet.ending === 'lost' && quiet.lostGoal).toBe('the landing-queue goal');
  });

  it('asks as before where the same goals still read met — the negative control', () => {
    const lenient = goalsForDay(1).map((goal) => (goal.id === 'worst-wait' || goal.id === 'queue' ? { ...goal, bar: 1e9 } : goal));
    const session = openDayCallSession(
      {
        planWith: fakePlan,
        simulate: (runs, done) => {
          done(runs.map((run) => calmAfter(built, pressOf(run).atS)));
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: built, bookedOut: [], horizon: 'period', goals: lenient },
    );
    expect(session.onStage()?.raised).toBe(true);
  });

  it('meets the same passengers under a handover, and differs from the standing order only after it — common random numbers', () => {
    const facts = dayCallFactsOf(PRESS_DAY_RESOURCES, state)!;
    const session = openDayCallSession(
      {
        planWith: (extra) => planOf([extra]),
        simulate: (runs, done) => {
          done(runs.map(run));
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: built, bookedOut: facts.bookedOut, horizon: facts.horizon },
    );
    const atS = session.onStage()!.call.atS;
    session.close();
    const [, fairness] = pair();
    const handOver = planOf([{ atS, change: { kind: 'adopt-dispatcher', profile: fairness } }]);
    const asBuilt = planOf([]);
    const handed = recordRun(handOver.config, { recordDecisions: false, outOfServiceCarIds: handOver.outOfServiceCarIds });
    const kept = recordRun(asBuilt.config, { recordDecisions: false, outOfServiceCarIds: asBuilt.outOfServiceCarIds });
    const person = (p: (typeof kept.result.trace.passengers)[number]): string =>
      `${p.id} ${String(p.arrivalTimeS)} ${p.originFloorId} ${p.finalDestinationFloorId} ${String(p.massKg)}`;
    expect(handed.result.trace.passengers.length).toBeGreaterThan(0);
    expect(handed.result.trace.passengers.map(person)).toEqual(kept.result.trace.passengers.map(person));
    const before = (legs: VizRecording['legs']) =>
      legs.filter((leg) => leg.boardedAt !== undefined && leg.boardedAt < atS).map(keyOf).sort();
    expect(before(handed.recording.legs)).toEqual(before(kept.recording.legs));
    /* Move the control and require the run to change: the handover is not inert on this crowd. */
    expect(handed.recording.legs.map(keyOf)).not.toEqual(kept.recording.legs.map(keyOf));
  });
});
