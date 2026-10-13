/**
 * **An attempt's ordinary calls, on real runs** — [§ D1138](../../../../DECISIONS.md).
 *
 * One Crown Hotel slice at an unpinned crowd (`20 260 824`, `n` 0), run the way the Scenario press
 * runs it, with the session's two runs made synchronously by the shipped `recordRun`. The day
 * raises one call since § D1205's ten-minute rule (two before it); the cases below hold what each
 * is:
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
import { queueAt } from '../frame/overlay.js';
import { recordRun } from '../record/recordRun.js';
import { todaysScenarioDayState } from '../shift/contractDay.test-helper.js';
import {
  DAY_CALL_MAX,
  DAY_CALL_MAX_TRIES,
  DAY_CALL_PER_PEAK,
  DAY_CALL_PER_WRINKLE,
  DAY_CALL_REPEAT_S,
  DAY_CALL_SPACING_S,
  dayCallAdmits,
  dayCallDriversOf,
  dayCallRowOf,
  longWaitRidersIn,
  type DayCallAnswer,
  type DayCallWrinkle,
} from '../shift/dayCalls.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import type { PressCall } from '../shift/pressCall.js';
import type { Observations, ShiftGoal } from '../shift/types.js';
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
    /* Two calls under § D1166's five-minute spacing; one since § D1205's ten-minute rule on this slice. */
    expect(records.length).toBeGreaterThanOrEqual(1);
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

  it('says it is still asking while a candidate’s runs are in flight — § D1152 — and a run that could not be made costs that moment alone — § D1335', () => {
    const facts = dayCallFactsOf(PRESS_DAY_RESOURCES, state)!;
    let fail: ((message: string) => void) | undefined;
    let asks = 0;
    const session = openDayCallSession(
      {
        planWith: (extra) => planOf([extra]),
        simulate: (_runs, _done, failed) => {
          asks += 1;
          fail = failed;
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: built, bookedOut: facts.bookedOut, horizon: facts.horizon },
    );
    expect(session.quiet()).toEqual({ kind: 'asked', refused: 0, ending: 'asking' });
    const first = session.onStage()!.call.atS;
    fail?.('worker gone');
    expect(session.failures()).toEqual([{ atS: first, question: 'placement' }]);
    /* Red before § D1335: the session ended `failed` here and asked no second moment. */
    expect(asks).toBe(2);
    expect(session.onStage()?.call.atS ?? -1).toBeGreaterThanOrEqual(first + DAY_CALL_SPACING_S);
    /* Not refused: its answers were never compared, so § D1152's refusal sentence must not count it. */
    expect(session.quiet()).toEqual({ kind: 'asked', refused: 0, failed: 1, ending: 'asking' });
    /* And a resumed attempt still says where. */
    expect(JSON.parse(JSON.stringify(session.snapshot())).failures).toEqual([{ atS: first, question: 'placement' }]);
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

/** A plan that carries only the press it was planned with, so the fake simulator can read it. */
function fakePlan(extra: RunInterventionConfig): OffThreadRun {
  return { config: { interventions: [extra] } } as unknown as OffThreadRun;
}
const pressOf = (run: OffThreadRun): RunInterventionConfig =>
  (run.config.interventions ?? [])[0] as RunInterventionConfig;

describe('wave AK: a day that keeps asking', () => {
  const collectiveProfile = (): DispatcherProfile =>
    PRESS_DAY_RESOURCES.dispatcherProfiles.profiles.find((profile) => profile.id === 'collective')!;
  const pair = (): readonly [DispatcherProfile, DispatcherProfile] =>
    dayCallDriversOf(PRESS_DAY_RESOURCES.dispatcherProfiles.profiles, collectiveProfile())!;

  it('asks again inside one peak after a raised call rather than jumping to its end — § D1166, as § D1205 spaces it', () => {
    /*
     * § D1166's claim, on the three-peak day below: the first peak asks a second time. Since
     * § D1205 the second placement call waits ten minutes rather than five, and the peak stops at two.
     */
    const session = placementSessionOn(threePeakDay());
    while (session.onStage()?.raised === true) session.answer('leave', () => {});
    const clocks = session.records().map((record) => record.atS);
    const first = clocks.filter((atS) => peakIndexOf(atS) === 0);
    expect(first.length, 'a second call in the same peak').toBe(2);
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
        drivers: { profiles: PRESS_DAY_RESOURCES.dispatcherProfiles.profiles, driving: collectiveProfile() },
      },
    );
    const call = session.onStage();
    expect(call?.raised).toBe(true);
    expect(call?.question).toBe('driver');
    expect(call?.drivers).toEqual({
      'driver-a': drivers[0].name,
      'driver-b': drivers[1].name,
      leave: collectiveProfile().name,
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
    /*
     * § D1205 lifted § D1167 clause 5: a handover no longer ends the driver question. The day goes
     * on asking the placement question, and the driver question comes back no sooner than ten
     * minutes after the last one, with the pair re-derived from the dispatcher now driving.
     */
    const after = asked.slice(2);
    expect(after.length, 'the day went on asking the placement question').toBeGreaterThan(0);
    const next = session.onStage();
    if (next?.raised === true) {
      expect(next.question).toBe('driver');
      expect(next.call.atS - call!.call.atS).toBeGreaterThanOrEqual(DAY_CALL_REPEAT_S);
      expect(next.drivers?.leave).toBe(drivers[0].name);
      expect([next.drivers?.['driver-a'], next.drivers?.['driver-b']]).not.toContain(drivers[0].name);
    }
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
      {
        recording: built,
        bookedOut: [],
        horizon: 'period',
        drivers: { profiles: PRESS_DAY_RESOURCES.dispatcherProfiles.profiles, driving: collectiveProfile() },
      },
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

/*
 * ---- Wave AL, lane AL-C: § D1204 (a pinned day asks after its call) and § D1205 (the whole day) ----
 *
 * A synthetic two-hour whole day with three peaks, so every rule can be held without a simulator:
 * somebody arrives every twenty seconds all day and boards ninety seconds later, so a candidate
 * stands wherever the search looks, and each answer's run is built from that day by hand.
 */

const PEAKS: readonly (readonly [number, number])[] = [
  [600, 1800],
  [3000, 4200],
  [5400, 6600],
];

/** The three-peak day: one rider every 20 s from 0 to 7 200 s, each boarding 90 s after arriving. */
function threePeakDay(): VizRecording {
  const template = built.legs[0]!;
  const legs: VizRecording['legs'][number][] = [];
  for (let k = 0; k * 20 < 7200; k += 1) {
    const arrivedAt = k * 20;
    legs.push({
      ...template,
      passengerId: `p${String(k).padStart(4, '0')}`,
      legIndex: 0,
      arrivedAt,
      boardedAt: arrivedAt + 90,
      alightedAt: arrivedAt + 120,
      refusedAt: undefined,
    });
  }
  const phase = (startS: number, endS: number, intensity: number) => ({
    id: `phase-${String(startS)}`,
    kind: 'hold',
    label: intensity === 1 ? 'peak' : 'lull',
    startS,
    endS,
    startIntensity: intensity,
    endIntensity: intensity,
  });
  const edges = [0, ...PEAKS.flat(), 7200];
  const phases = edges.slice(1).map((endS, index) => phase(edges[index]!, endS, index % 2 === 1 ? 1 : 0.2));
  return { ...built, startedAt: 0, endedAt: 7200, legs, demandPhases: phases } as unknown as VizRecording;
}

/** Every rider arriving in `[fromS, toS)` boards a second later; everybody else as they were. */
function calmBetween(recording: VizRecording, fromS: number, toS: number): VizRecording {
  return {
    ...recording,
    legs: recording.legs.map((leg) =>
      leg.arrivedAt < fromS || leg.arrivedAt >= toS ? leg : { ...leg, boardedAt: leg.arrivedAt + 1, refusedAt: undefined },
    ),
  } as VizRecording;
}

const peakIndexOf = (atS: number): number => PEAKS.findIndex(([from, to]) => from <= atS && atS < to);

/** Park empties the landings; spread and every handover leave the day as it was. */
function placementSessionOn(day: VizRecording, pinnedCall?: PressCall, wrinkle?: DayCallWrinkle) {
  return openDayCallSession(
    {
      planWith: fakePlan,
      simulate: (runs, done) => {
        done(runs.map((run) => (pressOf(run).change.kind === 'park-cars-lobby' ? calmAfter(day, pressOf(run).atS) : day)));
      },
      cancel: () => {},
      changed: () => {},
    },
    { recording: day, bookedOut: [], horizon: 'whole-day', pinnedCall, wrinkle },
  );
}

describe('a refused run costs one question, never the rest of the day — § D1335', () => {
  const profiles = (): readonly DispatcherProfile[] => PRESS_DAY_RESOURCES.dispatcherProfiles.profiles;
  const byId = (id: string): DispatcherProfile => profiles().find((profile) => profile.id === id)!;
  /** The post-AM panel's worker: every handover run refused, every parking run made. */
  const DOES_NOT_DECLARE =
    'interventions[0] carries change kind "adopt-dispatcher", which this build does not declare';

  /** Parking empties the landings from the second peak on and changes nothing before it. */
  function staleWorkerSession(day: VizRecording) {
    return openDayCallSession(
      {
        planWith: fakePlan,
        simulate: (runs, done, failed) => {
          if (runs.some((ask) => pressOf(ask).change.kind === 'adopt-dispatcher')) {
            failed(DOES_NOT_DECLARE);
            return;
          }
          done(
            runs.map((ask) => {
              const press = pressOf(ask);
              return press.change.kind === 'park-cars-lobby' && press.atS >= PEAKS[1]![0] ? calmAfter(day, press.atS) : day;
            }),
          );
        },
        cancel: () => {},
        changed: () => {},
      },
      {
        recording: day,
        bookedOut: [],
        horizon: 'whole-day',
        drivers: { profiles: profiles(), driving: byId('collective') },
      },
    );
  }

  it('goes on asking after a handover run is refused, and raises the placement calls after it', () => {
    const session = staleWorkerSession(threePeakDay());
    const raised: { atS: number; question: string | undefined }[] = [];
    for (let call = session.onStage(); call?.raised === true; call = session.onStage()) {
      raised.push({ atS: call.call.atS, question: call.question });
      session.answer('leave', () => {});
    }
    /* Red before § D1335: the day ended at the first refusal, so nothing after it was ever raised. */
    expect(raised.length).toBeGreaterThan(0);
    expect(raised.every((call) => call.question === 'placement')).toBe(true);
    expect(raised.some((call) => peakIndexOf(call.atS) === 2), 'the evening is still asked').toBe(true);
    const failures = session.failures();
    expect(failures.length, 'the first peak’s who-drives runs were refused').toBeGreaterThan(0);
    expect(failures.every((failure) => failure.question === 'driver')).toBe(true);
    expect(failures[0]!.atS).toBe(PEAKS[0]![0]);
    expect(session.quiet()).toEqual({ kind: 'asked', refused: 0, failed: failures.length, ending: 'finished' });
  });

  it('asks every moment of the day the same way with a worker that refuses nothing — the negative control', () => {
    const day = threePeakDay();
    const session = openDayCallSession(
      {
        planWith: fakePlan,
        simulate: (runs, done) => {
          done(
            runs.map((ask) => {
              const press = pressOf(ask);
              return press.change.kind === 'park-cars-lobby' && press.atS >= PEAKS[1]![0] ? calmAfter(day, press.atS) : day;
            }),
          );
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: day, bookedOut: [], horizon: 'whole-day', drivers: { profiles: profiles(), driving: byId('collective') } },
    );
    while (session.onStage()?.raised === true) session.answer('leave', () => {});
    expect(session.failures()).toEqual([]);
    expect(session.quiet()).not.toHaveProperty('failed');
  });
});

describe('wave AM: the day’s wrinkle asks once, outside the day’s cap — § D1265', () => {
  /* Between the first two peaks, where no peak rule reaches. */
  const wrinkle: DayCallWrinkle = { startS: 2000, endS: 2800, name: 'Move-in day' };
  const inWrinkle = (atS: number): boolean => atS >= wrinkle.startS && atS < wrinkle.endS;

  it('raises one call in the wrinkle and still two in every peak, so the evening keeps its calls', () => {
    const session = placementSessionOn(threePeakDay(), undefined, wrinkle);
    const raised: { atS: number; wrinkle: string | undefined }[] = [];
    for (let call = session.onStage(); call?.raised === true; call = session.onStage()) {
      raised.push({ atS: call.call.atS, wrinkle: call.call.wrinkle?.name });
      session.answer('leave', () => {});
    }
    const clocks = session.records().map((record) => record.atS);
    expect(clocks.filter(inWrinkle).length).toBe(DAY_CALL_PER_WRINKLE);
    expect(PEAKS.map((_, index) => clocks.filter((atS) => peakIndexOf(atS) === index).length)).toEqual([
      DAY_CALL_PER_PEAK,
      DAY_CALL_PER_PEAK,
      DAY_CALL_PER_PEAK,
    ]);
    /* Six in the peaks is the day's cap, and the wrinkle's one is on top of it. */
    expect(clocks.length).toBe(DAY_CALL_MAX + DAY_CALL_PER_WRINKLE);
    /* The card is told the call is the wrinkle's, and only that one. */
    expect(raised.filter((call) => call.wrinkle !== undefined).map((call) => call.atS)).toEqual(clocks.filter(inWrinkle));
  });

  it('asks nothing between the peaks without it — the negative control', () => {
    const session = placementSessionOn(threePeakDay());
    while (session.onStage()?.raised === true) session.answer('leave', () => {});
    expect(session.records().filter((record) => inWrinkle(record.atS))).toEqual([]);
  });

  it('a resumed session counts the wrinkle’s call as an unbroken one does', () => {
    const unbroken = placementSessionOn(threePeakDay(), undefined, wrinkle);
    while (unbroken.onStage()?.raised === true) unbroken.answer('leave', () => {});
    const first = placementSessionOn(threePeakDay(), undefined, wrinkle);
    /* Answer up to and including the wrinkle's call, then resume from the snapshot. */
    for (let call = first.onStage(); call?.raised === true; call = first.onStage()) {
      const at = call.call.atS;
      first.answer('leave', () => {});
      if (inWrinkle(at)) break;
    }
    const resumed = openDayCallSession(
      {
        planWith: fakePlan,
        simulate: (runs, done) => {
          const day = threePeakDay();
          done(runs.map((run) => (pressOf(run).change.kind === 'park-cars-lobby' ? calmAfter(day, pressOf(run).atS) : day)));
        },
        cancel: () => {},
        changed: () => {},
      },
      { recording: threePeakDay(), bookedOut: [], horizon: 'whole-day', wrinkle, resume: first.snapshot() },
    );
    while (resumed.onStage()?.raised === true) resumed.answer('leave', () => {});
    expect(resumed.records().map((record) => record.atS)).toEqual(unbroken.records().map((record) => record.atS));
  });
});

/*
 * Wave AN, lane DQ-1, § D1336: a wrinkle asks who drives at its start, even inside a peak, and a
 * second admission ground holds there only: the three runs' day verdicts differ. The day below has a
 * late finish inside its third peak; handing the day to Fairness first leaves one rider, who arrives
 * after the call's ten minutes, waiting 400 s, so that run misses a 300 s worst-wait bar the others
 * clear while every ten-minute count stays the same.
 */
describe('a wrinkle asks who drives at its start, admitted where the day’s verdict differs — § D1336', () => {
  const profiles = (): readonly DispatcherProfile[] => PRESS_DAY_RESOURCES.dispatcherProfiles.profiles;
  const byId = (id: string): DispatcherProfile => profiles().find((profile) => profile.id === id)!;
  const lateFinish: DayCallWrinkle = { startS: 5460, endS: 6000, name: 'A late finish' };
  const worstWaitOnly = (): readonly ShiftGoal[] =>
    goalsForDay(1)
      .filter((goal) => goal.id === 'worst-wait')
      .map((goal) => ({ ...goal, bar: 300 }));

  /** The day with the rider arriving at 6 500 s waiting 400 s: after the call's window, inside the day. */
  function lateWait(day: VizRecording): VizRecording {
    return {
      ...day,
      legs: day.legs.map((leg) => (leg.arrivedAt === 6500 ? { ...leg, boardedAt: 6900, alightedAt: 6930 } : leg)),
    } as VizRecording;
  }

  function lateFinishSession(
    goals: readonly ShiftGoal[] | undefined,
    asked: string[] = [],
    inFlight?: (() => void)[],
    split = true,
    shape: (day: VizRecording) => VizRecording = (day) => day,
  ) {
    const day = shape(threePeakDay());
    return openDayCallSession(
      {
        planWith: fakePlan,
        simulate: (runs, done) => {
          asked.push(`${String(pressOf(runs[0]).atS)}:${runs.map((ask) => pressOf(ask).change.kind).join('+')}`);
          const land = (): void =>
            done(
              runs.map((ask) => {
                const press = pressOf(ask);
                return split && press.change.kind === 'adopt-dispatcher' && press.change.profile.id === 'fairness-first'
                  ? lateWait(day)
                  : day;
              }),
            );
          if (inFlight === undefined) land();
          else inFlight.push(land);
        },
        cancel: () => {},
        changed: () => {},
      },
      {
        recording: day,
        bookedOut: [],
        horizon: 'whole-day',
        goals,
        drivers: { profiles: profiles(), driving: byId('collective') },
        wrinkle: lateFinish,
      },
    );
  }

  it('raises who drives at the start of a wrinkle inside a peak, on the verdict alone, and nowhere else', () => {
    const asked: string[] = [];
    const session = lateFinishSession(worstWaitOnly(), asked);
    const raised: { atS: number; question: string | undefined; wrinkle: string | undefined }[] = [];
    for (let call = session.onStage(); call?.raised === true; call = session.onStage()) {
      raised.push({ atS: call.call.atS, question: call.question, wrinkle: call.call.wrinkle?.name });
      session.answer('leave', () => {});
    }
    /* Red before § D1336: the late finish was no stretch and the counts never differ, so nothing was raised. */
    expect(raised).toEqual([{ atS: lateFinish.startS, question: 'driver', wrinkle: 'A late finish' }]);
    /* Who drives was asked first there, and the placement runs were never needed. */
    expect(asked.filter((entry) => entry.startsWith(`${String(lateFinish.startS)}:`))).toEqual([
      `${String(lateFinish.startS)}:adopt-dispatcher+adopt-dispatcher`,
    ]);
    const [record] = session.records();
    expect(record?.wrinkle).toBe(true);
    expect(dayCallAdmits(record!.counts), 'the counts alone would not raise it').toBe(false);
    /* The report row prints the split this call was raised on, graded as the sheet grades. */
    const grade = (observations: Observations): string =>
      readGoals(worstWaitOnly(), observations).every((reading) => reading.state === 'met') ? 'Shift cleared' : 'Shift missed';
    expect(dayCallRowOf(record!, 1, grade, String).why).toContain('The day read');
  });

  /*
   * Wave AO, lane DR-1, § D1434: a call admitted on the verdict alone, with nobody standing at its
   * second, put *Nobody is standing at the landings* over a row of zeros. It is turned down; the
   * same start with somebody standing (the case above) is still raised.
   */
  it('turns down a start admitted on the verdict alone where nobody is standing at its second — § D1434', () => {
    /* Everybody who arrived in the 100 s up to the start boards as they arrive, so nobody stands at 5 460 s. */
    const empty = (day: VizRecording): VizRecording =>
      ({
        ...day,
        legs: day.legs.map((leg) =>
          leg.arrivedAt < lateFinish.startS - 100 || leg.arrivedAt > lateFinish.startS
            ? leg
            : { ...leg, boardedAt: leg.arrivedAt, alightedAt: leg.arrivedAt + 30 },
        ),
      }) as VizRecording;
    expect(queueAt(empty(threePeakDay()), lateFinish.startS).every((queue) => queue.total === 0)).toBe(true);
    expect(queueAt(threePeakDay(), lateFinish.startS).some((queue) => queue.total > 0)).toBe(true);
    const session = lateFinishSession(worstWaitOnly(), [], undefined, true, empty);
    const raised: number[] = [];
    for (let call = session.onStage(); call?.raised === true; call = session.onStage()) {
      raised.push(call.call.atS);
      session.answer('leave', () => {});
    }
    /* Red before § D1434: the start was raised here, on the verdict, over nobody. */
    expect(raised).toEqual([]);
    expect(session.records()).toEqual([]);
  });

  it('raises nothing on the verdict elsewhere, and nothing at the start without the day’s goals — the negative controls', () => {
    /* Every peak's candidate had the same split runs and was turned down: the ground is the start's alone. */
    const asked: string[] = [];
    const session = lateFinishSession(worstWaitOnly(), asked);
    expect(asked.some((entry) => !entry.startsWith(`${String(lateFinish.startS)}:`) && entry.includes('adopt-dispatcher'))).toBe(true);
    expect(session.records().every((record) => record.atS === lateFinish.startS)).toBe(true);
    /* No goals, no verdict: the start is asked and turned down on its counts. */
    const ungraded = lateFinishSession(undefined);
    expect(ungraded.onStage()).toBeUndefined();
    expect(ungraded.records()).toEqual([]);
  });

  it('counts the start’s call against neither the peak’s two nor the day’s six', () => {
    const session = lateFinishSession(worstWaitOnly());
    while (session.onStage()?.raised === true) session.answer('leave', () => {});
    const snapshot = session.snapshot();
    expect(snapshot.raisedInWrinkle).toBe(1);
    expect(snapshot.raisedInPeak).toEqual([]);
  });

  it('says once, after its window, that a wrinkle which raised nothing was asked and did not stop', () => {
    const queue: (() => void)[] = [];
    const session = lateFinishSession(worstWaitOnly(), [], queue, false);
    /* Before the start's runs land, nothing: the wrinkle could still raise its call. */
    while (queue.length > 0 && (session.onStage()?.call.atS ?? Infinity) <= lateFinish.startS) {
      expect(session.wrinkleQuiet()).toBeUndefined();
      queue.shift()!();
    }
    while (queue.length > 0) queue.shift()!();
    expect(session.records()).toEqual([]);
    const quiet = session.wrinkleQuiet();
    expect(quiet?.wrinkle).toEqual(lateFinish);
    expect(quiet?.refused.map((record) => [record.atS, record.question])).toEqual([[lateFinish.startS, 'driver']]);
    /* Its counts are the runs already made, and it carries nothing graded. */
    expect(quiet?.refused[0]?.observations).toEqual({});
    /* A wrinkle that raised its call says nothing of the kind. */
    const raisedIt = lateFinishSession(worstWaitOnly());
    while (raisedIt.onStage()?.raised === true) raisedIt.answer('leave', () => {});
    expect(raisedIt.wrinkleQuiet()).toBeUndefined();
  });
});

describe('wave AL: calls across the whole day — § D1205', () => {
  const profiles = (): readonly DispatcherProfile[] => PRESS_DAY_RESOURCES.dispatcherProfiles.profiles;
  const byId = (id: string): DispatcherProfile => profiles().find((profile) => profile.id === id)!;

  /**
   * Parking changes nothing; a handover to a dispatcher in `calm` empties the landings for the ten
   * minutes after it, and the day is as it was from then on — so the run a handover leaves still
   * has candidates in it, as a real one does.
   */
  function driverSession(day: VizRecording, calm: readonly string[], asked: string[] = []) {
    return openDayCallSession(
      {
        planWith: fakePlan,
        simulate: (runs, done) => {
          asked.push(runs.map((run) => pressOf(run).change.kind).join('+'));
          done(
            runs.map((run) => {
              const press = pressOf(run);
              return press.change.kind === 'adopt-dispatcher' && calm.includes(press.change.profile.id)
                ? calmBetween(day, press.atS, press.atS + DAY_CALL_REPEAT_S)
                : day;
            }),
          );
        },
        cancel: () => {},
        changed: () => {},
      },
      {
        recording: day,
        bookedOut: [],
        horizon: 'whole-day',
        drivers: { profiles: profiles(), driving: byId('collective') },
      },
    );
  }

  it('raises at most two calls in a peak, so every peak of the day is asked', () => {
    const session = placementSessionOn(threePeakDay());
    while (session.onStage()?.raised === true) session.answer('leave', () => {});
    const clocks = session.records().map((record) => record.atS);
    const perPeak = PEAKS.map((_, index) => clocks.filter((atS) => peakIndexOf(atS) === index).length);
    expect(perPeak).toEqual([DAY_CALL_PER_PEAK, DAY_CALL_PER_PEAK, DAY_CALL_PER_PEAK]);
    expect(clocks.length).toBeLessThanOrEqual(DAY_CALL_MAX);
  });

  it('never raises the same question twice inside ten minutes', () => {
    const session = placementSessionOn(threePeakDay());
    while (session.onStage()?.raised === true) session.answer('leave', () => {});
    const clocks = session.records().map((record) => record.atS);
    expect(clocks.length).toBeGreaterThan(1);
    for (let k = 1; k < clocks.length; k += 1) {
      expect(clocks[k]! - clocks[k - 1]!, `calls ${String(k)} and ${String(k + 1)}`).toBeGreaterThanOrEqual(
        DAY_CALL_REPEAT_S,
      );
    }
  });

  it('asks nothing more of who drives in a peak once the player kept the driver, and asks again in the next', () => {
    const session = driverSession(threePeakDay(), ['eta', 'fairness-first']);
    const first = session.onStage();
    expect(first?.question).toBe('driver');
    session.answer('leave', () => {});
    const later: { atS: number; question: string | undefined }[] = [];
    for (let call = session.onStage(); call?.raised === true; call = session.onStage()) {
      later.push({ atS: call.call.atS, question: call.question });
      session.answer('leave', () => {});
    }
    expect(
      later.filter((call) => call.question === 'driver' && peakIndexOf(call.atS) === peakIndexOf(first!.call.atS)),
    ).toEqual([]);
    /* *Keep* holds one peak, not the day. */
    expect(later.some((call) => call.question === 'driver' && peakIndexOf(call.atS) === 1)).toBe(true);
  });

  it('asks who drives again after a handover, with the pair re-derived from the new driver', () => {
    const session = driverSession(threePeakDay(), ['predictive-balanced', 'fairness-first']);
    const first = session.onStage();
    /* § D1337: a player on the house is offered two contenders. */
    expect(first?.drivers).toEqual({
      'driver-a': byId('fairness-first').name,
      'driver-b': byId('predictive-balanced').name,
      leave: byId('collective').name,
    });
    const handedTo: RunInterventionConfig[] = [];
    session.answer('driver-a', (adoption) => {
      handedTo.push(adoption.entry);
    });
    expect(handedTo).toEqual([
      { atS: first!.call.atS, change: { kind: 'adopt-dispatcher', profile: byId('fairness-first') } },
    ]);
    const second = session.onStage();
    expect(second?.raised).toBe(true);
    expect(second?.question).toBe('driver');
    expect(second!.call.atS - first!.call.atS).toBeGreaterThanOrEqual(DAY_CALL_REPEAT_S);
    /*
     * The pair never offers the dispatcher driving, and *keep* names it. Since § D1337 it never
     * offers the house either: § D1167's list put Conventional collective first here.
     */
    /* The pair's second is the census's (§ D1442): the offer list is derived, not written here. */
    const fromFairness = dayCallDriversOf(profiles(), byId('fairness-first'))!;
    expect(fromFairness.map((profile) => profile.id)).not.toContain('collective');
    expect(second?.drivers).toEqual({
      'driver-a': byId('predictive-balanced').name,
      'driver-b': fromFairness[1].name,
      leave: byId('fairness-first').name,
    });
    /* And the second call's record carries the names it was asked with. */
    session.answer('leave', () => {});
    expect(session.records()[1]?.drivers).toEqual(second?.drivers);
  });

  it('re-derives the pair after the player’s own handover where the shell names the driver, and stops where it cannot', () => {
    const day = threePeakDay();
    const named = driverSession(day, ['predictive-balanced', 'energy-aware']);
    named.grew({ ...day } as VizRecording, 100, true, byId('fairness-first'));
    const call = named.onStage();
    expect(call?.question).toBe('driver');
    expect(call?.drivers?.leave).toBe(byId('fairness-first').name);
    const unnamed = driverSession(day, ['collective', 'eta', 'fairness-first']);
    unnamed.grew({ ...day } as VizRecording, 100, true);
    expect(unnamed.onStage()).toBeUndefined();
  });
});

/*
 * Wave AO, lane DR-2, § D1444: § D1205 clause 3 held who drives for the rest of a peak once *keep*
 * was answered, and swarm DR's honesty member found the census's lost days inside those very peaks
 * (crowd 14's Thursday: *keep* at 12:33, the day lost at 12:37, nothing more asked). Amended: a later
 * candidate in the kept peak asks who drives again, and raises it only where its three runs' day
 * verdicts differ; the counts alone still raise nothing there.
 */
describe('after *keep who drives*, its peak asks again only where the day hangs on who drives — § D1444', () => {
  const profiles = (): readonly DispatcherProfile[] => PRESS_DAY_RESOURCES.dispatcherProfiles.profiles;
  const collective = (): DispatcherProfile => profiles().find((profile) => profile.id === 'collective')!;
  const worstWaitOnly = (): readonly ShiftGoal[] =>
    goalsForDay(1)
      .filter((goal) => goal.id === 'worst-wait')
      .map((goal) => ({ ...goal, bar: 300 }));

  /** The run with one rider, arriving at 6 500 s, waiting 400 s: after any ten-minute window here, inside the day. */
  function lateWait(day: VizRecording): VizRecording {
    return {
      ...day,
      legs: day.legs.map((leg) => (leg.arrivedAt === 6500 ? { ...leg, boardedAt: 6900, alightedAt: 6930 } : leg)),
    } as VizRecording;
  }

  /**
   * Parking changes nothing, so every candidate asks who drives. Every handover empties the landings
   * for ten minutes, so the counts admit every driver question; where `split`, handing the day to
   * the pair's first after the first driver call also leaves a 400 s wait late in the day, so the
   * day's verdict differs there.
   */
  function keptPeakSession(split: boolean, graded = true) {
    const goals = graded ? worstWaitOnly() : undefined;
    const day = threePeakDay();
    const first = dayCallDriversOf(profiles(), collective())![0].id;
    let firstDriverAtS: number | undefined;
    return openDayCallSession(
      {
        planWith: fakePlan,
        simulate: (runs, done) => {
          done(
            runs.map((ask) => {
              const press = pressOf(ask);
              if (press.change.kind !== 'adopt-dispatcher') return day;
              firstDriverAtS ??= press.atS;
              const calm = calmBetween(day, press.atS, press.atS + DAY_CALL_REPEAT_S);
              return split && press.atS > firstDriverAtS && press.change.profile.id === first ? lateWait(calm) : calm;
            }),
          );
        },
        cancel: () => {},
        changed: () => {},
      },
      {
        recording: day,
        bookedOut: [],
        horizon: 'whole-day',
        goals,
        drivers: { profiles: profiles(), driving: collective() },
      },
    );
  }

  /** Keep the driver at every call; what was raised, by peak. */
  function keepEverything(
    session: ReturnType<typeof keptPeakSession>,
  ): { atS: number; peak: number; question: string | undefined }[] {
    const raised: { atS: number; peak: number; question: string | undefined }[] = [];
    for (let call = session.onStage(); call?.raised === true; call = session.onStage()) {
      raised.push({ atS: call.call.atS, peak: peakIndexOf(call.call.atS), question: call.question });
      session.answer('leave', () => {});
    }
    return raised;
  }

  it('raises who drives a second time in the kept peak where its runs split the day, ten minutes on', () => {
    const session = keptPeakSession(true);
    const raised = keepEverything(session);
    const kept = raised.filter((call) => call.peak === 0);
    /* Red before § D1444: *keep* held the driver question for the rest of the peak, so peak 0 raised one call. */
    expect(kept.map((call) => call.question)).toEqual(['driver', 'driver']);
    expect(kept[1]!.atS - kept[0]!.atS).toBeGreaterThanOrEqual(DAY_CALL_REPEAT_S);
    /* Its record carries the split it was raised on: the pair's first misses the day, *keep* clears it. */
    const record = session.records().find((entry) => entry.atS === kept[1]!.atS)!;
    const verdict = (observations: Observations | undefined): boolean =>
      readGoals(worstWaitOnly(), observations!).every((reading) => reading.state === 'met');
    expect([verdict(record.observations['driver-a']), verdict(record.observations.leave)]).toEqual([false, true]);
    /* The peak's two, and § D1205's other clauses, stand. */
    expect(kept).toHaveLength(DAY_CALL_PER_PEAK);
  });

  it('raises nothing more in the kept peak where the verdicts agree, though the counts differ — the negative control', () => {
    const raised = keepEverything(keptPeakSession(false));
    expect(raised.filter((call) => call.peak === 0).map((call) => call.question)).toEqual(['driver']);
    /* *Keep* still holds one peak, not the day: the next peak asks on its counts. */
    expect(raised.some((call) => call.peak === 1 && call.question === 'driver')).toBe(true);
  });

  it('runs nothing for who drives in the kept peak without the day’s goals, since no verdict can raise it there', () => {
    const raised = keepEverything(keptPeakSession(true, false));
    expect(raised.filter((call) => call.peak === 0).map((call) => call.question)).toEqual(['driver']);
  });
});

describe('wave AL: a pinned day asks after its call — § D1204', () => {
  it('searches from five minutes after the pinned call, and counts it as its peak’s first placement call', () => {
    const pinned: PressCall = { atS: 700, rule: 'first-minute-wait', carId: 'A', awayAtS: 650, backAtS: 900, act: undefined };
    const session = placementSessionOn(threePeakDay(), pinned);
    while (session.onStage()?.raised === true) session.answer('leave', () => {});
    const clocks = session.records().map((record) => record.atS);
    expect(clocks[0]).toBeGreaterThanOrEqual(pinned.atS + DAY_CALL_REPEAT_S);
    expect(clocks.filter((atS) => peakIndexOf(atS) === 0)).toHaveLength(DAY_CALL_PER_PEAK - 1);
    expect(clocks.filter((atS) => peakIndexOf(atS) === 2).length).toBeGreaterThan(0);
  });

  it('searches an ordinary day from its start — the negative control', () => {
    const session = placementSessionOn(threePeakDay());
    expect(session.onStage()?.call.atS).toBe(PEAKS[0]![0]);
  });
});

/*
 * Wave AL, lane AL-E, § D1218: a reload re-simulates the day's attempt from its log, and the
 * session opens on that run from where the attempt's session stood. The resumed session must hold
 * the calls already answered and raise the same next call the unbroken session raises, on the same
 * run: a resume that re-asked from the day's start would put an answered call back in front of a
 * player who has seen what followed it.
 */
describe('a resumed attempt’s calls — § D1218', () => {
  it('reopens where the attempt stood: the answered calls kept, the next call the same', () => {
    let log: RunInterventionConfig[] = [];
    const facts = dayCallFactsOf(PRESS_DAY_RESOURCES, state)!;
    const deps = (): Parameters<typeof openDayCallSession>[0] => ({
      planWith: (extra) => planOf([...log, extra]),
      simulate: (runs, done) => {
        done(runs.map(run));
      },
      cancel: () => {},
      changed: () => {},
    });
    const unbroken = openDayCallSession(deps(), { recording: built, bookedOut: facts.bookedOut, horizon: facts.horizon });
    const first = unbroken.onStage();
    expect(first?.raised).toBe(true);
    unbroken.answer('spread-cars', (adoption) => {
      log = [...log, adoption.entry];
    });
    const snapshot = JSON.parse(JSON.stringify(unbroken.snapshot())) as ReturnType<typeof unbroken.snapshot>;
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.searchFromS).toBeGreaterThan(first!.call.atS);
    const next = unbroken.onStage();

    /* The reload: the attempt's run re-simulated from its log, and a session opened on it from the snapshot. */
    const resumedRun = run(planOf(log));
    expect(resumedRun.legs.map(keyOf)).toEqual(unbroken.recording().legs.map(keyOf));
    const resumed = openDayCallSession(deps(), {
      recording: resumedRun,
      bookedOut: facts.bookedOut,
      horizon: facts.horizon,
      resume: snapshot,
    });
    expect(resumed.records().map((record) => [record.atS, record.answer])).toEqual([[first!.call.atS, 'spread-cars']]);
    expect(resumed.onStage()?.call.atS).toBe(next?.call.atS);
    expect(resumed.onStage()?.raised).toBe(next?.raised);
    /* Nothing before the snapshot's search point is asked again. */
    expect(resumed.onStage()?.call.atS ?? Number.POSITIVE_INFINITY).toBeGreaterThanOrEqual(snapshot.searchFromS);
  });
});

/*
 * Wave AL's integration, over lanes AL-C and AL-E: § D1218's snapshot was written before § D1205
 * gave the session a memory — two calls a peak, no question twice inside ten minutes, no driver
 * question after *keep* in that peak, and the pair re-derived after a handover — and a resume that
 * forgot any of it would raise a different call from the unbroken session. So the whole day is
 * played once unbroken, and again from a snapshot taken after every answer (with the next card up,
 * which the snapshot must leave out), each JSON round-tripped as the device stores it; the resumed
 * tail must be the unbroken tail call for call, question for question, pair for pair and leg for leg.
 */
describe('a resumed session raises what an unbroken one would — § D1205 under § D1218', () => {
  const profiles = (): readonly DispatcherProfile[] => PRESS_DAY_RESOURCES.dispatcherProfiles.profiles;
  const byId = (id: string): DispatcherProfile => profiles().find((profile) => profile.id === id)!;

  /** Park, and a handover to anybody but `collective`, empty the landings for ten minutes; spread changes nothing. */
  function resumableOn(
    day: VizRecording,
    recording: VizRecording,
    extra: Partial<Parameters<typeof openDayCallSession>[1]> = {},
    parkCalms = true,
    /* Where given, the runs land only when the test drains it, as the worker's do: a snapshot can fall while one is in flight. */
    inFlight?: (() => void)[],
  ) {
    return openDayCallSession(
      {
        planWith: fakePlan,
        simulate: (runs, done) => {
          const land = (): void => done(
            runs.map((ask) => {
              const press = pressOf(ask);
              const calms =
                (parkCalms && press.change.kind === 'park-cars-lobby') ||
                (press.change.kind === 'adopt-dispatcher' && press.change.profile.id !== 'collective');
              return calms ? calmBetween(day, press.atS, press.atS + DAY_CALL_REPEAT_S) : day;
            }),
          );
          if (inFlight === undefined) land();
          else inFlight.push(land);
        },
        cancel: () => {},
        changed: () => {},
      },
      {
        recording,
        bookedOut: [],
        horizon: 'whole-day',
        drivers: { profiles: profiles(), driving: byId('collective') },
        ...extra,
      },
    );
  }

  /* Keep the placement; *keep who drives* on the first driver call, then hand the day to the pair's second. */
  function answerFor(index: number, question: string | undefined): DayCallAnswer {
    if (question !== 'driver') return index === 2 ? 'spread-cars' : 'leave';
    return index === 1 ? 'leave' : 'driver-b';
  }

  interface Raised {
    readonly atS: number;
    readonly question: string | undefined;
    readonly drivers: unknown;
    readonly entry: RunInterventionConfig | undefined;
    readonly legs: readonly string[];
  }

  /** Answer every call from `from` on, returning what was raised and what each answer left standing. */
  function playOut(
    session: ReturnType<typeof resumableOn>,
    from: number,
    answer: (index: number, question: string | undefined) => DayCallAnswer = answerFor,
  ): Raised[] {
    const raised: Raised[] = [];
    for (let index = from, call = session.onStage(); call?.raised === true; index += 1, call = session.onStage()) {
      let entry: RunInterventionConfig | undefined;
      session.answer(answer(index, call.question), (adoption) => {
        entry = adoption.entry;
      });
      raised.push({
        atS: call.call.atS,
        question: call.question,
        drivers: call.question === 'driver' ? call.drivers : undefined,
        entry,
        legs: session.recording().legs.map(keyOf),
      });
    }
    return raised;
  }

  function checkEveryResume(
    calls: number,
    open: (
      resume?: ReturnType<ReturnType<typeof resumableOn>['snapshot']>,
      recording?: VizRecording,
    ) => ReturnType<typeof resumableOn>,
    answer: (index: number, question: string | undefined) => DayCallAnswer = answerFor,
  ) {
    const unbroken = playOut(open(), 0, answer);
    /* The day under test: every call it can raise, with a *keep* or a handover in it, across all three peaks. */
    expect(unbroken.length).toBe(calls);
    expect(new Set(unbroken.map((call) => peakIndexOf(call.atS)))).toEqual(new Set([0, 1, 2]));
    for (let k = 0; k < unbroken.length; k += 1) {
      const live = open();
      playOut({ ...live, onStage: () => (live.records().length < k ? live.onStage() : undefined) }, 0, answer);
      expect(live.records()).toHaveLength(k);
      expect(live.onStage()?.raised, `a card is up at snapshot ${String(k)}`).toBe(true);
      const stored = JSON.parse(JSON.stringify(live.snapshot())) as ReturnType<typeof live.snapshot>;
      const resumed = open(stored, live.recording());
      expect(resumed.records(), `the answered calls kept at snapshot ${String(k)}`).toEqual(live.records());
      expect(playOut(resumed, k, answer), `the tail resumed after ${String(k)} answers`).toEqual(unbroken.slice(k));
    }
    return unbroken;
  }

  it('across a peak boundary, after *keep who drives*, and after a handover', () => {
    const day = threePeakDay();
    const unbroken = checkEveryResume(DAY_CALL_MAX, (resume, recording) => resumableOn(day, recording ?? day, { resume }));
    /* The snapshot after the *keep* stands in a full peak with the driver question held; the next call is the next peak's. */
    expect(unbroken[1]).toMatchObject({ question: 'driver', entry: undefined });
    expect(peakIndexOf(unbroken[2]!.atS)).toBe(peakIndexOf(unbroken[1]!.atS) + 1);
    /* After the handover the pair is re-derived, and a resumed session re-derives it the same way. */
    const handed = unbroken.findIndex((call) => call.entry?.change.kind === 'adopt-dispatcher');
    const after = unbroken.slice(handed + 1).find((call) => call.question === 'driver');
    /* The pair's second for a player on the house, since § D1337. */
    expect(after?.drivers).toMatchObject({ leave: byId('predictive-balanced').name });
  });

  it('on a pinned day, whose call the snapshot already carries', () => {
    const day = threePeakDay();
    const pinned: PressCall = { atS: 700, rule: 'first-minute-wait', carId: 'A', awayAtS: 650, backAtS: 900, act: undefined };
    /* Five: the pinned call is one of its peak's two, and the cap of six counts the raised calls. */
    const unbroken = checkEveryResume(DAY_CALL_MAX - 1, (resume, recording) =>
      resumableOn(day, recording ?? day, resume === undefined ? { pinnedCall: pinned } : { resume }),
    );
    expect(unbroken[0]!.atS).toBeGreaterThanOrEqual(pinned.atS + DAY_CALL_SPACING_S);
  });

  it('where *keep who drives* is a peak’s first call, so only the kept peak holds the driver question', () => {
    const day = threePeakDay();
    /* Parking changes nothing here, so every call is who drives, and every answer keeps the driver. */
    const unbroken = checkEveryResume(
      3,
      (resume, recording) => resumableOn(day, recording ?? day, { resume }, false),
      () => 'leave',
    );
    expect(unbroken.map((call) => [peakIndexOf(call.atS), call.question])).toEqual([
      [0, 'driver'],
      [1, 'driver'],
      [2, 'driver'],
    ]);
  });

  it('while the next candidate’s runs are still in flight, inside the peak whose driver was kept', () => {
    const day = threePeakDay();
    const drain = (queue: (() => void)[]): void => {
      while (queue.length > 0) queue.shift()!();
    };
    const open = (queue: (() => void)[], resume?: ReturnType<ReturnType<typeof resumableOn>['snapshot']>, recording?: VizRecording) =>
      resumableOn(day, recording ?? day, { resume }, false, queue);
    const keepAll = (session: ReturnType<typeof resumableOn>, queue: (() => void)[]): [number, string | undefined][] => {
      const raised: [number, string | undefined][] = [];
      for (;;) {
        drain(queue);
        const call = session.onStage();
        if (call?.raised !== true) return raised;
        raised.push([call.call.atS, call.question]);
        session.answer('leave', () => {});
      }
    };
    const unbrokenQueue: (() => void)[] = [];
    const unbroken = keepAll(open(unbrokenQueue), unbrokenQueue);
    expect(unbroken.length).toBeGreaterThan(1);
    const queue: (() => void)[] = [];
    const live = open(queue);
    drain(queue);
    const first = live.onStage();
    expect(first?.question).toBe('driver');
    live.answer('leave', () => {});
    /* The snapshot falls here: the next candidate is in the kept peak, and its runs have not landed. */
    const asking = live.onStage();
    expect(asking?.raised).toBe(false);
    expect(peakIndexOf(asking!.call.atS)).toBe(peakIndexOf(first!.call.atS));
    const stored = JSON.parse(JSON.stringify(live.snapshot())) as ReturnType<typeof live.snapshot>;
    expect(stored.keptInPeakS).toBe(PEAKS[peakIndexOf(first!.call.atS)]![0]);
    const again: (() => void)[] = [];
    const resumed = open(again, stored, live.recording());
    expect([[first!.call.atS, first!.question], ...keepAll(resumed, again)]).toEqual(unbroken);
    expect(resumed.quiet()).toEqual(keepAllQuiet());

    function keepAllQuiet() {
      const control: (() => void)[] = [];
      const session = open(control);
      keepAll(session, control);
      return session.quiet();
    }
  });

  it('the snapshot is needed — a resume that forgot § D1205’s memory, or counted the card up, raises a different call', () => {
    const day = threePeakDay();
    const live = resumableOn(day, day);
    playOut({ ...live, onStage: () => (live.records().length < 1 ? live.onStage() : undefined) }, 0);
    /* One placement call answered at 600; the card up is who drives, at 900, held from placement by ten minutes. */
    const up = live.onStage();
    expect([up?.call.atS, up?.question]).toEqual([900, 'driver']);
    const snapshot = live.snapshot();
    expect(snapshot).toMatchObject({ raisedInPeak: [600], lastRaisedAtS: { placement: 600, driver: null } });
    const raisedFrom = (resume: typeof snapshot) => {
      const call = resumableOn(day, live.recording(), { resume }).onStage();
      return [call?.call.atS, call?.question];
    };
    expect(raisedFrom(snapshot)).toEqual([900, 'driver']);
    /* Lane AL-E's snapshot as written: no memory, so placement is asked again five minutes after itself. */
    expect(raisedFrom({ ...snapshot, raisedInPeak: [], lastRaisedAtS: { placement: null, driver: null } })).toEqual([
      900,
      'placement',
    ]);
    /* The card up counted in the snapshot: who drives is held by itself, and the call moves on. */
    expect(raisedFrom({ ...snapshot, raisedInPeak: [600, 600], lastRaisedAtS: { placement: 600, driver: 900 } })).not.toEqual([
      900,
      'driver',
    ]);
  });
});
