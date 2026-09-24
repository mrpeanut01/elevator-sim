/**
 * **Every Scenario day on every tower is a config `core` accepts** — GitHub issue #593.
 *
 * ## The defect
 *
 * Two assessors reached a Scenario week whose third day never finished simulating. The worker had
 * posted `Demand template "office-day" varies the directional mix within the run, and
 * directionalSplit fixes it for the whole run`, the Engineer transport caught it under the Everyday
 * cover, and the stage said *simulating today's day* for as long as anybody waited.
 *
 * `office-day` is the whole-day template thirteen of the sixteen contracts run in Scenario
 * (`shift/dayLength.ts#wholeDayFor`), and every one of its phases declares a mix, so `core`
 * resolves it with a `meanDirectionalSplit`. The event path in `dev/state.ts#shiftRunConfigOf`
 * asked `demandTemplate === 'lunch-two-way'` and the calendar's bias decision asked for the
 * record's `directionalSplitAtStart`; both said *no*, so every day that drew a wrinkle with a mix
 * of its own — the fire drill was the one assessors met — sent `core` a config it refuses.
 *
 * ## What this checks, and why against `core` rather than against the viewer's predicate
 *
 * Each case builds the run the product builds, through `shiftRunConfigOf`, and hands it to `core`'s
 * own `planDemand` — the function that throws. Asserting `shift/events.ts#demandTemplateVariesMix`
 * against itself would be circular; this asserts the only thing a player cares about, which is that
 * the engine accepts the day. `planDemand` builds the arrival plan and not the trace, so the sweep
 * is cheap enough to cover every weekday a week can start on.
 *
 * The second half is the other side of the same refusal: on the days where a wrinkle wanted a mix
 * the template owns, the run says so in `withheld` rather than dropping the ask silently.
 */

import { planDemand, type SimulationConfig } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { shiftRunConfigOf } from '../dev/state.js';

import { CALENDAR_PERIOD_IDS, CALENDAR_PERIODS, scheduledEventFor } from './calendar.js';
import { contractBuildings, contractDayState } from './contractDay.test-helper.js';
import { CONTRACTS } from './contracts.js';
import { wholeDayFor, wholeDayRun } from './dayLength.js';
import { demandTemplateVariesMix } from './events.js';

const RESOURCES = contractBuildings();

/** `core`'s refusal, or `undefined` when it accepts the demand this config asks for. */
function refusalOf(config: SimulationConfig): string | undefined {
  const demand = config.demand ?? {};
  try {
    planDemand({
      building: config.building,
      profiles: config.trafficProfiles,
      ...(config.demandTemplate === undefined ? {} : { template: config.demandTemplate }),
      ...(config.durationS === undefined ? {} : { templateOverrides: { durationS: config.durationS } }),
      ...(config.windowStartS === undefined ? {} : { windowStartS: config.windowStartS }),
      ...(config.windowEndS === undefined ? {} : { windowEndS: config.windowEndS }),
      ...(demand.arrivalRatePctPop5min === undefined
        ? {}
        : { arrivalRatePctPop5min: demand.arrivalRatePctPop5min }),
      ...(demand.directionalSplit === undefined ? {} : { directionalSplit: demand.directionalSplit }),
    });
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** The whole-day towers — the contracts whose building has an authored day. */
const WHOLE_DAY_CONTRACTS = CONTRACTS.filter((contract) => {
  const building = RESOURCES.entries.find((entry) => entry.resolved.id === contract.buildingId)?.config;
  return wholeDayFor(RESOURCES.trafficProfiles, building) !== undefined;
});

/** A Scenario day on `contractId`: its own tower, the whole day, the week's own event. */
function scenarioDay(contractId: string, day: number, dayIdx: number) {
  const building = RESOURCES.entries.find(
    (entry) => entry.resolved.id === CONTRACTS.find((c) => c.id === contractId)?.buildingId,
  )?.config;
  const whole = wholeDayFor(RESOURCES.trafficProfiles, building);
  const base = contractDayState(contractId, { seed: 424_242n });
  return {
    ...base,
    ...(whole === undefined ? {} : wholeDayRun(whole)),
    campaignEventId: undefined,
    week: { ...base.week, day, dayIdx },
  };
}

describe('GitHub issue #593 — a Scenario day on a whole-day tower is a run the engine accepts', () => {
  it('has whole-day towers to sweep, and office-day is one core resolves as varying the mix', () => {
    expect(WHOLE_DAY_CONTRACTS.length).toBeGreaterThan(0);
    expect(demandTemplateVariesMix('office-day', RESOURCES.trafficProfiles.demandTemplates)).toBe(true);
    expect(demandTemplateVariesMix('rise-and-fall', RESOURCES.trafficProfiles.demandTemplates)).toBe(false);
  });

  it('every contract × days 1–21 × every starting weekday builds a config core accepts', () => {
    const refused: string[] = [];
    let mixWithheld = 0;
    for (const contract of CONTRACTS) {
      for (let day = 1; day <= 21; day += 1) {
        for (let start = 0; start < 7; start += 1) {
          const dayIdx = (start + day - 1) % 7;
          const run = shiftRunConfigOf(RESOURCES, scenarioDay(contract.id, day, dayIdx));
          const refusal = refusalOf(run.config);
          if (refusal !== undefined) {
            refused.push(`${contract.id} day ${String(day)} dayIdx ${String(dayIdx)} (${run.event.id}): ${refusal}`);
          }
          if (run.withheld.some((line) => line.includes('the directional mix is set by this run'))) {
            mixWithheld += 1;
          }
        }
      }
    }
    expect(refused).toEqual([]);
    /* The ask is refused out loud rather than dropped: some day in the sweep has a wrinkle whose mix
       the template owns, and its run carries the sentence that says so. */
    expect(mixWithheld).toBeGreaterThan(0);
  }, 300_000);

  it('the fire drill on a whole-day tower withholds its mix and keeps its rate', () => {
    const contract = WHOLE_DAY_CONTRACTS[0];
    if (contract === undefined) throw new Error('no whole-day contract');
    /* The first (day, weekday) the week's own draw makes a fire drill — searched, not transcribed. */
    let found: { day: number; dayIdx: number } | undefined;
    for (let day = 1; day <= 200 && found === undefined; day += 1) {
      for (let dayIdx = 0; dayIdx < 7 && found === undefined; dayIdx += 1) {
        if (scheduledEventFor(null, day, dayIdx).id.split(':')[0] === 'fire-drill') found = { day, dayIdx };
      }
    }
    if (found === undefined) throw new Error('the week never draws a fire drill');
    const run = shiftRunConfigOf(RESOURCES, scenarioDay(contract.id, found.day, found.dayIdx));
    expect(run.event.id.split(':')[0]).toBe('fire-drill');
    expect(run.config.demand?.directionalSplit).toBeUndefined();
    expect(run.config.demand?.arrivalRatePctPop5min).toBeDefined();
    expect(run.withheld.join(' ')).toContain('the directional mix is set by this run');
    expect(refusalOf(run.config)).toBeUndefined();
  });

  it('every shipped calendar period over every whole-day tower builds a config core accepts', () => {
    const refused: string[] = [];
    for (const contract of WHOLE_DAY_CONTRACTS) {
      for (const periodId of CALENDAR_PERIOD_IDS) {
        for (let day = 1; day <= 7; day += 1) {
          const state = { ...scenarioDay(contract.id, day, (day - 1) % 7), calendar: CALENDAR_PERIODS[periodId] };
          const run = shiftRunConfigOf(RESOURCES, state);
          const refusal = refusalOf(run.config);
          if (refusal !== undefined) refused.push(`${contract.id} ${periodId} day ${String(day)}: ${refusal}`);
        }
      }
    }
    expect(refused).toEqual([]);
  }, 300_000);
});
