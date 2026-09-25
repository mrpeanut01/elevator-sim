/**
 * The brief's day record for a state, built the way `briefScreen.ts#factsNow` builds it but without
 * a host — the building, clock, mix and day cars from `dev/state.ts#plannedDayOf`, and the horizon
 * the next press runs from `shift/dayLength.ts#scenarioHorizonFor`.
 *
 * A test helper rather than a production export: the brief reaches the same inputs through its host,
 * and a second shipped path to them would be a seam with no player behind it.
 */

import type { BrowserResources } from '../dev/data.js';
import { buildingConfigOf, plannedDayOf, type ViewerState } from '../dev/state.js';
import { scenarioHorizonFor } from '../shift/dayLength.js';

import { todayOf, type TodayRecord } from './today.js';

export function briefTodayOf(resources: BrowserResources, state: ViewerState): TodayRecord {
  const planned = plannedDayOf(resources, state);
  return todayOf({
    week: state.week,
    calendar: state.calendar,
    building: planned.building,
    dayStartS: planned.startOfDayS,
    templateVariesMix: planned.templateVariesMix,
    wholeDayRun: planned.wholeDayRun,
    dayCars: planned.dayCars,
    buildingId: state.buildingId,
    dispatcherName: undefined,
    dispatcherId: state.dispatcherId,
    dispatcherNameOf: () => undefined,
    goals: [],
    seed: state.seed,
    horizon: scenarioHorizonFor(
      resources.trafficProfiles,
      buildingConfigOf(resources, state.savedBuildings, state.buildingId),
    ),
    crowdIsToday: false,
    daySeed: state.seed,
    firstSession: false,
    units: 'metric',
  });
}
