/**
 * **The newcomer's Monday keeps asking after its call** — wave AL, lane AL-C,
 * [§ D1204](../../../../DECISIONS.md), the decide-an ruling's Q1(a).
 *
 * A fresh device is dealt Midtown Office's pinned press day (`c2` on crowd 20 276 662, whole day,
 * `collective`), and until § D1204 that day asked its one § D1029 call and then nothing for about
 * twenty-two real minutes, because § D1138's owner-reversible clause kept the ordinary session shut
 * on a pinned day (the missing-calls diagnosis, `scratchpad/diag-calls.md`). Two things are held
 * here, on the pinned day as `shift/contractDay.test-helper.ts#todaysScenarioDayState` builds it:
 *
 * - **the gate**, `dev/state.ts#dayCallsOpenOn`, the pure function `dev/main.ts#dayCallOnStage`
 *   asks: shut while the pinned call stands and after it was skipped, open once it is answered
 *   with the answer alone on the log, and shut again once anything else is pressed; and on an
 *   ordinary crowd, open only with nothing pressed, which is § D1138's rule unchanged;
 * - **the claim**, on real runs: opened as the shell opens it, the shipped session raises a call
 *   after the pinned one under each of the pinned call's three answers, no sooner than five minutes
 *   after it, and at least one of those is the driver question.
 */

import type { RunInterventionConfig } from '@elevator-sim/core/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { recordRun } from '../record/recordRun.js';
import { todaysScenarioDayState } from '../shift/contractDay.test-helper.js';
import { DAY_CALL_SPACING_S, dayCallDriversOf, type DayCallOnStage } from '../shift/dayCalls.js';
import { pressDayFor } from '../shift/ladder.js';
import type { PressCall } from '../shift/pressCall.js';
import { PRESS_DAY_RESOURCES } from '../shift/pressDay.test-helper.js';

import { openDayCallSession } from './dayCallSession.js';
import { shiftGoalsOf } from './leftRail.js';
import type { OffThreadRun } from './offThreadRuns.js';
import {
  dayCallFactsOf,
  dayCallsOpenOn,
  drivingProfileOf,
  pressDayCallOf,
  shiftRunConfigOf,
  type ViewerState,
} from './state.js';

const CONTRACT = 'c2';
const resources = PRESS_DAY_RESOURCES;

let pinnedDay: ViewerState;
let built: VizRecording;
let call: PressCall;

function planOf(state: ViewerState, log: readonly RunInterventionConfig[]): OffThreadRun {
  const plan = shiftRunConfigOf(resources, { ...state, interventions: [...log] });
  return { config: plan.config, outOfServiceCarIds: plan.outOfServiceCarIds, recordDecisions: false };
}

function run(ask: OffThreadRun): VizRecording {
  return recordRun(ask.config, { recordDecisions: false, outOfServiceCarIds: ask.outOfServiceCarIds }).recording;
}

beforeAll(() => {
  const press = pressDayFor(CONTRACT);
  if (press === undefined) throw new Error(`${CONTRACT} pins no day`);
  pinnedDay = todaysScenarioDayState(resources, CONTRACT, {
    seed: BigInt(press.seedText),
    dispatcherId: press.standingOrder,
  }).state;
  built = run(planOf(pinnedDay, []));
  const measured = pressDayCallOf(resources, pinnedDay, built);
  if (measured === undefined) throw new Error('the pinned day draws no call as built');
  call = measured.call;
});

describe('the gate a pinned day’s ordinary calls open by — § D1204', () => {
  it('is the pinned day: facts say so and the stage has a call to ask first', () => {
    expect(dayCallFactsOf(resources, pinnedDay)?.pinned).toBe(true);
    expect(call.atS).toBeGreaterThan(0);
  });

  it('stays shut while the pinned call stands, and after a skip with its card up', () => {
    const facts = dayCallFactsOf(resources, pinnedDay);
    const base = { facts, legs: built.legs.length, interventions: [], pinnedCallSkipped: false };
    expect(dayCallsOpenOn(base)).toBe('shut');
    expect(dayCallsOpenOn({ ...base, pinnedCall: call, pinnedCallSkipped: true })).toBe('shut');
  });

  it('opens once the pinned call is answered, with the answer alone on the log', () => {
    const facts = dayCallFactsOf(resources, pinnedDay);
    const base = { facts, legs: built.legs.length, pinnedCall: call, pinnedCallSkipped: false };
    expect(dayCallsOpenOn({ ...base, interventions: [] }), 'leave them').toBe('open');
    expect(dayCallsOpenOn({ ...base, interventions: [{ atS: call.atS }] }), 'a press at the call').toBe('open');
    expect(dayCallsOpenOn({ ...base, interventions: [{ atS: call.atS + 1 }] }), 'a press elsewhere').toBe('shut');
    expect(
      dayCallsOpenOn({ ...base, interventions: [{ atS: call.atS }, { atS: call.atS + 400 }] }),
      'a second press',
    ).toBe('shut');
  });

  it('keeps § D1138’s rule on an ordinary crowd: open with nothing pressed, shut after a press', () => {
    const ordinary = todaysScenarioDayState(resources, CONTRACT, { seed: 20_260_824n }).state;
    const facts = dayCallFactsOf(resources, ordinary);
    expect(facts?.pinned).toBe(false);
    const base = { facts, legs: built.legs.length, pinnedCallSkipped: false };
    expect(dayCallsOpenOn({ ...base, interventions: [] })).toBe('open');
    expect(dayCallsOpenOn({ ...base, interventions: [{ atS: 900 }] })).toBe('shut');
    expect(dayCallsOpenOn({ ...base, interventions: [], legs: 1_000_000 })).toBe('not-offered');
    expect(dayCallsOpenOn({ facts: undefined, legs: 1, interventions: [], pinnedCallSkipped: false })).toBe('shut');
  });
});

describe('the pinned day asks after its call, on real runs — § D1204', () => {
  it('raises a later call under each of the three answers, five minutes on at least, one of them who drives', () => {
    const answers = ['spread-cars', 'park-cars-lobby', 'leave'] as const;
    const firsts: DayCallOnStage[] = [];
    for (const answer of answers) {
      const log: RunInterventionConfig[] = answer === 'leave' ? [] : [{ atS: call.atS, change: { kind: answer } }];
      const standing = answer === 'leave' ? built : run(planOf(pinnedDay, log));
      const facts = dayCallFactsOf(resources, pinnedDay)!;
      expect(
        dayCallsOpenOn({ facts, legs: built.legs.length, interventions: log, pinnedCall: call, pinnedCallSkipped: false }),
        answer,
      ).toBe('open');
      const driving = drivingProfileOf(resources, pinnedDay);
      const pair = dayCallDriversOf(resources.dispatcherProfiles.profiles, driving);
      const session = openDayCallSession(
        {
          planWith: (extra) => planOf(pinnedDay, [...log, extra]),
          simulate: (runs, done) => {
            done(runs.map(run));
          },
          cancel: () => {},
          changed: () => {},
        },
        {
          recording: standing,
          bookedOut: facts.bookedOut,
          horizon: facts.horizon,
          goals: shiftGoalsOf(pinnedDay, resources),
          drivers: pair === undefined ? undefined : { profiles: resources.dispatcherProfiles.profiles, driving },
          pinnedCall: call,
        },
      );
      const first = session.onStage();
      expect(first?.raised, `a later call after “${answer}”`).toBe(true);
      expect(first!.call.atS).toBeGreaterThanOrEqual(call.atS + DAY_CALL_SPACING_S);
      firsts.push(first!);
      session.close();
    }
    expect(firsts.some((first) => first.question === 'driver'), 'a driver call on some branch').toBe(true);
  });
});
