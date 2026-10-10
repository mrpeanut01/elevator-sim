/**
 * **The driver run is the day with the driver swapped and nothing else** — wave AN, lane DQ-3, swarm
 * DQ's Q2 rule 3, [§ D1351](../../../../DECISIONS.md).
 *
 * The close says what decided a day no call decided from one more run, which `dev/main.ts` makes off
 * the thread that paints: the day's own record through `shift/weekStake.ts#driverRunRecordOf`, planned
 * by `watchRunPlanOf` as the house run is. CLAUDE.md's standing requirement: a control is moved and
 * the run is required to change, **compared on the legs**. So the case files a real whole Midtown
 * day the way `closeShift` files one (Fairness first driving, one press) and runs four days of the
 * same crowd through `recordRun`:
 *
 * 1. the day as played;
 * 2. the driver run, as the shell plans it;
 * 3. the same day as the player would have run it with the standing order picked on the brief and
 *    the same press, through `shiftRunConfigOf`, the shift runner's own plan;
 * 4. the house, as the shell plans it.
 *
 * It requires 2 to be 3 leg for leg (the run is what the close calls it), 2 to differ from 1 (the
 * swap writes something: a driver run that kept the day's driver would credit nothing, ever) and 2
 * to differ from 4 (the press is kept: a run that dropped it would be the house under another name).
 */

import { describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { buildingConfigOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { wholeDayFor, wholeDayRun } from '../shift/dayLength.js';
import { openWeek } from '../shift/week.js';
import { driverRunNeedOf, driverRunRecordOf, houseRecordOf, houseStandingOrder } from '../shift/weekStake.js';

import { watchRecordOf, watchRunPlanOf } from './record.js';
import type { WatchRecord } from './types.js';

function legsOf(recording: VizRecording): string {
  return JSON.stringify(
    recording.legs.map((leg) => [leg.passengerId, leg.originFloorId, leg.destinationFloorId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

/** Midtown Office's Monday on its own contract, run whole, Fairness first driving, one press. */
function mondayAtMidtown(): ViewerState {
  const whole = wholeDayFor(RESOURCES.trafficProfiles, buildingConfigOf(RESOURCES, [], 'midtown-office'));
  if (whole === undefined) throw new Error('midtown-office has an authored whole day');
  return {
    ...baseState(),
    buildingId: 'midtown-office',
    dispatcherId: 'fairness-first',
    playMode: 'shift-week',
    week: openWeek('c2'),
    seed: 20261010n,
    ...wholeDayRun(whole),
    outOfServiceCarIds: [],
    interventions: [{ atS: 2_400, change: { kind: 'park-cars-lobby' } }],
  };
}

function runOf(record: WatchRecord): VizRecording {
  const plan = watchRunPlanOf(baseState(), RESOURCES, record);
  return recordRun(plan.config, { outOfServiceCarIds: plan.outOfServiceCarIds }).recording;
}

describe('the driver run — § D1351', () => {
  it('is the day with the standing order picked in place of its driver, every press kept, compared on the legs', () => {
    const played = mondayAtMidtown();
    const record = watchRecordOf(played, RESOURCES);
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(driverRunNeedOf({ record })).toBe('run');

    const dayPlan = shiftRunConfigOf(RESOURCES, played);
    const day = recordRun(dayPlan.config, { outOfServiceCarIds: dayPlan.outOfServiceCarIds }).recording;
    const swapped = runOf(driverRunRecordOf(record));
    const picked = shiftRunConfigOf(RESOURCES, { ...played, dispatcherId: houseStandingOrder(), ruleRows: [] });
    const asPicked = recordRun(picked.config, { outOfServiceCarIds: picked.outOfServiceCarIds }).recording;
    const house = runOf(houseRecordOf(record));

    /* The same crowd in all four: common random numbers, by the seed the record carries. */
    expect(new Set([day, swapped, asPicked, house].map((run) => run.legs.length)).size).toBe(1);
    expect(legsOf(swapped), 'the driver run is the day the player would have had with the standing order picked').toBe(
      legsOf(asPicked),
    );
    expect(legsOf(swapped), 'swapping the driver moves the legs').not.toBe(legsOf(day));
    expect(legsOf(swapped), 'the press is kept, so it is not the house').not.toBe(legsOf(house));
  });
});
