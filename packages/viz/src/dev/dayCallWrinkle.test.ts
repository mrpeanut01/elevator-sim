/**
 * **Where the day's wrinkle is, read off the run's own plan** — wave AM, lane AM-F,
 * [§ D1265](../../../../DECISIONS.md), `dev/state.ts#dayCallWrinkleOf`.
 *
 * Midtown's week, days 1 to 5, each with the wrinkle the week deals it: the move-in's car, the
 * conference's episode and the shaft's car are stretches of their own to call in, each clear of the
 * day's peaks; the fire drill's episode is a peak of its own (`shift/dayLength.ts#actsOf`), so it is
 * already called in as one; an ordinary day has no wrinkle. The windows are the schedule the run is
 * built from, so the same numbers the stage's booked-out pill and the phase list carry.
 */

import { describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';
import { contractBuildings, todaysScenarioDayState } from '../shift/contractDay.test-helper.js';
import { actsOf } from '../shift/dayLength.js';
import { dayCallWrinkleWindowOf } from '../shift/dayCalls.js';
import { openWeek } from '../shift/week.js';

import { dayCallFactsOf, shiftRunConfigOf } from './state.js';

const RESOURCES = contractBuildings();

function dayOf(day: number) {
  const { state } = todaysScenarioDayState(RESOURCES, 'c2', {
    seed: 20_260_824n,
    over: { week: { ...openWeek('c2'), day, dayIdx: (day - 1) % 7 }, campaignEventId: undefined },
  });
  const plan = shiftRunConfigOf(RESOURCES, state);
  const facts = dayCallFactsOf(RESOURCES, state);
  /* The acts as the stage reads them: the recording's own phase list. */
  const recording = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording;
  const acts = actsOf(recording.demandPhases);
  return { plan, facts, acts };
}

describe('the day’s wrinkle as a call window, on Midtown’s week — § D1265', () => {
  it('is the move-in’s own car, 13:30 to 16:00, and never the tower’s booking of car D', () => {
    const { plan, facts } = dayOf(2);
    expect(plan.event.id).toBe('move-in:past-halfway');
    expect(facts?.wrinkle).toEqual({ startS: 19_800, endS: 28_800, name: plan.event.name });
    expect(plan.dayCars.windows).not.toContain('D');
  });

  it('is the conference’s episode on the day’s clock', () => {
    const { plan, facts } = dayOf(4);
    expect(plan.event.id).toBe('conference:full-floor');
    expect(plan.episode).toBeDefined();
    expect(facts?.wrinkle).toEqual({ startS: plan.episode!.startS, endS: plan.episode!.endS, name: plan.event.name });
  });

  it('is the shaft’s car on Friday', () => {
    const { plan, facts } = dayOf(5);
    expect(plan.event.id).toBe('shaft-out:before-halfway');
    expect(facts?.wrinkle?.name).toBe(plan.event.name);
    expect(facts?.wrinkle?.startS).toBe(3600);
    expect(facts?.wrinkle?.endS).toBe(14_400);
  });

  it('is no window on an ordinary day, and no stretch of its own where the wrinkle is a peak', () => {
    expect(dayOf(1).facts?.wrinkle).toBeUndefined();
    const drill = dayOf(3);
    expect(drill.plan.event.id).toBe('fire-drill:full');
    expect(drill.facts?.wrinkle).toBeDefined();
    expect(dayCallWrinkleWindowOf(drill.facts?.wrinkle, drill.acts)).toBeUndefined();
  });

  it('lies clear of every peak on the days it is a window', () => {
    for (const day of [2, 4, 5]) {
      const { facts, acts } = dayOf(day);
      expect(acts.length, String(day)).toBeGreaterThan(0);
      expect(dayCallWrinkleWindowOf(facts?.wrinkle, acts), String(day)).toEqual(facts?.wrinkle);
    }
  });
});
