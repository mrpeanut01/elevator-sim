/**
 * **One census cell: one day, one crowd, one configuration** — the run `docs/33` DC-10 is measured
 * on, [§ D1067](../../../../DECISIONS.md).
 *
 * Shared by the census (`weekWay.sweep.test.ts`), its weekly re-check (`weekWay.verify.test.ts`)
 * and the always-on file (`weekWay.test.ts`), so the three cannot measure three different days. A
 * test helper rather than a production module for `contractDay.test-helper.ts`'s reason: nothing the
 * player runs needs it.
 *
 * The day is the product's: `contractDayState` pairs the contract with its building so the rung
 * reaches the run, `dev/state.ts#shiftRunConfigOf` builds it (growth, fabric, incidents, the day's
 * event), and `goalsForDay(day, horizon)` grades it, where any goal not `met` is a miss —
 * `shift/week.ts#outcomeOf`'s rule, *unjudged is not passed*.
 */

import type { RunInterventionConfig } from '@elevator-sim/core';

import { buildingConfigOf, shiftRunConfigOf } from '../dev/state.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';

import { contractBuildings, contractDayState } from './contractDay.test-helper.js';
import { contractById } from './contracts.js';
import { runHorizonOf, wholeDayFor, wholeDayRun } from './dayLength.js';
import { goalsForDay, readGoals } from './goals.js';
import { shiftObservationsOf } from './observations.js';
import { openWeek } from './week.js';
import { dailySeedFor } from './dailySeed.js';
import { crowdDates, WEEK_WAY, type WeekWayConfig } from './weekWay.js';

/** Every building the contracts name, resolved once per process. */
export const WEEK_WAY_RESOURCES = contractBuildings();

export interface WeekWayVerdict {
  readonly cleared: boolean;
  /** Goal ids not `met`, in `goalsForDay`'s order. */
  readonly failing: readonly string[];
  readonly worstWaitS: number;
  readonly peakQueue: number;
}

/**
 * Day `day` of a fresh week on `contractId`, on `seed`, under `config`.
 *
 * `scheduled` runs the wrinkle the week draws for that day (`shift/calendar.ts#scheduledEventFor`);
 * without it the day is the unwrinkled one (`campaignEventId: 'ordinary'`), which is what the
 * shipped rows measure.
 */
export function weekWayCell(
  contractId: string,
  day: number,
  seed: bigint,
  config: WeekWayConfig,
  scheduled = false,
): WeekWayVerdict {
  const resources = WEEK_WAY_RESOURCES;
  const contract = contractById(contractId);
  if (contract === undefined) throw new Error(`no contract ${contractId}`);
  const authored = buildingConfigOf(resources, [], contract.buildingId);
  const whole = wholeDayFor(resources.trafficProfiles, authored);
  const horizonFields =
    WEEK_WAY.protocol.horizon === 'whole-day' && whole !== undefined ? wholeDayRun(whole) : {};
  const state = contractDayState(contractId, {
    seed,
    dispatcherId: config.dispatcherId,
    over: {
      ...horizonFields,
      week: { ...openWeek(contractId), day, dayIdx: (day - 1) % 7 },
      ...(scheduled ? { campaignEventId: undefined } : {}),
    },
  });
  const plan = shiftRunConfigOf(resources, state);
  const interventions: RunInterventionConfig[] =
    config.press === ''
      ? []
      : [
          {
            atS: state.shiftLengthS * config.atFraction,
            change: { kind: config.press } as RunInterventionConfig['change'],
          },
        ];
  const { recording } = recordRun(
    { ...plan.config, interventions },
    { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds },
  );
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const horizon = runHorizonOf(resources.trafficProfiles, authored, state);
  const failing = readGoals(goalsForDay(day, horizon), observations)
    .filter((reading) => reading.state !== 'met')
    .map((reading) => reading.goal.id);
  return {
    cleared: failing.length === 0,
    failing,
    worstWaitS: observations.worstWaitS,
    peakQueue: observations.peakQueue,
  };
}

/** A census row's standing order, as a configuration. */
export function standingConfig(): WeekWayConfig {
  return { dispatcherId: WEEK_WAY.protocol.standingOrder, press: '', atFraction: 0 };
}

/** The crowds' seeds, in order — `dailySeedFor` over `shift/weekWay.ts#crowdDates`. */
export function crowdSeeds(from: string, count: number): readonly bigint[] {
  return Object.freeze(crowdDates(from, count).map(dailySeedFor));
}
