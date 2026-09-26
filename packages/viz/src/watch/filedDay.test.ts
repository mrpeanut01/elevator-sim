/**
 * **A banked Scenario day is watchable, leg for leg** — wave AK, [§ D1139](../../../../DECISIONS.md),
 * the post-AJ panel's seats A and D: *Watch it* refused every whole day either of them closed,
 * because the record re-simulated a different run. Seat A's Monday was filed at 2 539 people and
 * replayed at 7 197.
 *
 * The case files a real whole day the way `dev/main.ts#closeShift` files one: a Scenario week on its
 * contract, the building's whole authored day, a press, and a car the player held, simulated
 * through `shiftRunConfigOf` and `recordRun` exactly as the shift runner does, with the record and
 * the goal readings written from the same state. Then it asks the Watch gate — both halves, as both
 * shells call them — and compares the replay with the filed run **on the legs**.
 */

import { describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { buildingConfigOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { shiftGoalsOf } from '../dev/leftRail.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { wholeDayFor, wholeDayRun } from '../shift/dayLength.js';
import { readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import { closeDay, openWeek, outcomeOf } from '../shift/week.js';

import { checkedRunForTest } from './gate.test-helper.js';
import { filedDayRuns, watchGateBefore } from './library.js';
import { watchRecordOf } from './record.js';

function legsOf(recording: VizRecording): string {
  return JSON.stringify(
    recording.legs.map((leg) => [leg.passengerId, leg.originFloorId, leg.destinationFloorId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

/** Midtown Office's Wednesday on its own contract, run whole, with one press and one held car. */
function wednesdayAtMidtown(): ViewerState {
  const whole = wholeDayFor(RESOURCES.trafficProfiles, buildingConfigOf(RESOURCES, [], 'midtown-office'));
  if (whole === undefined) throw new Error('midtown-office has an authored whole day');
  return {
    ...baseState(),
    buildingId: 'midtown-office',
    playMode: 'shift-week',
    week: { ...openWeek('c2'), day: 3, dayIdx: 2 },
    seed: 20260925n,
    ...wholeDayRun(whole),
    outOfServiceCarIds: ['main-A'],
    interventions: [{ atS: 2_400, change: { kind: 'park-cars-lobby' } }],
  };
}

describe('a banked Scenario day replays leg for leg — § D1139', () => {
  it('files a whole Midtown day on its contract, and the Watch gate reproduces it', () => {
    const played = wednesdayAtMidtown();
    const plan = shiftRunConfigOf(RESOURCES, played);
    const filed = recordRun(plan.config, { outOfServiceCarIds: plan.outOfServiceCarIds }).recording;

    const record = watchRecordOf(played, RESOURCES);
    expect(record).toBeDefined();
    if (record === undefined) return;
    const observations = shiftObservationsOf(observationsAt(filed, filed.endedAt));
    const outcome = outcomeOf({
      day: played.week.day,
      dayIdx: played.week.dayIdx,
      eventId: plan.event.id,
      readings: readGoals(shiftGoalsOf(played, RESOURCES), observations),
      minutePct: observations.minutePct,
      carried: observations.carried,
      arrived: observations.arrived,
      record,
      recordRefusal: null,
    });
    const [row] = filedDayRuns([closeDay(played.week, outcome)], () => 'Midtown Office');
    if (row === undefined) throw new Error('the closed day is a row');
    expect(row.blocked).toBeNull();

    /* The held car travels beside the config, as `runShift` hands it to `recordRun`. */
    const gate = watchGateBefore(row, RESOURCES, baseState());
    expect(gate.kind === 'simulate' ? gate.outOfServiceCarIds : []).toEqual(['main-A']);

    const checked = checkedRunForTest(row, RESOURCES, baseState(), (config, outOfServiceCarIds) =>
      recordRun(config, { outOfServiceCarIds }).recording,
    );
    expect(checked.run.blocked).toBeNull();
    const replay = checked.recording;
    if (replay === undefined) throw new Error(checked.run.blocked?.reason ?? 'no replay');
    expect(replay.legs.length).toBe(filed.legs.length);
    expect(legsOf(replay)).toBe(legsOf(filed));
  });
});
