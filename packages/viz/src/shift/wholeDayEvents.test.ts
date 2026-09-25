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
import { demandTemplateVariesMix, mixKeptSentenceOf } from './events.js';
import { plannedDayOf } from '../dev/state.js';
import { todayOf } from '../everyday/today.js';
import { rungFor, rungIncidents } from './ladder.js';

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

/** The first (day, weekday) the week's own draw makes `templateId` — searched, not transcribed. */
function firstDayOf(templateId: string): { readonly day: number; readonly dayIdx: number } {
  for (let day = 1; day <= 200; day += 1) {
    for (let dayIdx = 0; dayIdx < 5; dayIdx += 1) {
      if (scheduledEventFor(null, day, dayIdx).id.split(':')[0] === templateId) return { day, dayIdx };
    }
  }
  throw new Error(`the week never draws a ${templateId}`);
}

/** The brief for a Scenario day, through the product's own chain — `host.dayAhead()`'s. */
function briefOf(contractId: string, found: { readonly day: number; readonly dayIdx: number }) {
  const state = scenarioDay(contractId, found.day, found.dayIdx);
  const planned = plannedDayOf(RESOURCES, state);
  return {
    state,
    planned,
    today: todayOf({
      week: state.week,
      calendar: null,
      building: planned.building,
      buildingId: state.buildingId,
      dispatcherName: undefined,
      dispatcherNameOf: () => undefined,
      goals: [],
      seed: state.seed,
      horizon: undefined,
      dayStartS: planned.startOfDayS,
      templateVariesMix: planned.templateVariesMix,
      dayCars: planned.dayCars,
      crowdIsToday: false,
      firstSession: false,
      units: 'metric',
    }),
  };
}

describe('the fire drill and the conference say what the run does — post-AH panel A.md 5, § D1040', () => {
  /*
   * The fire drill's brief read *"Twenty minutes where the whole building wants to be in the lobby
   * at once"*, and on a whole-day tower the run was an all-day rise in demand on the day's own mix;
   * the only account of that was the previous day's report, in the engine's words. The conference
   * moves only the mix, so on the same towers it moved nothing and its brief said *interfloor
   * traffic all afternoon*. Behaviour is unchanged — which half wins is `core`'s — and the copy is
   * held against the run it describes, on both kinds of day.
   */
  it('on a whole-day tower, where the mix is kept, says the level moves and the mix does not', () => {
    const contract = WHOLE_DAY_CONTRACTS[0];
    if (contract === undefined) throw new Error('no whole-day contract');
    const drill = briefOf(contract.id, firstDayOf('fire-drill'));
    const run = shiftRunConfigOf(RESOURCES, drill.state);
    /* The run first: no mix, a higher rate. */
    expect(run.config.demand?.directionalSplit).toBeUndefined();
    expect(run.config.demand?.arrivalRatePctPop5min).toBeGreaterThan(
      shiftRunConfigOf(RESOURCES, { ...drill.state, campaignEventId: 'ordinary' }).config.demand
        ?.arrivalRatePctPop5min ?? 0,
    );
    /* Then the words, on the brief's card, its lede, and the withheld line the day before carries. */
    expect(drill.planned.templateVariesMix).toBe(true);
    expect(drill.today.wrinkle.note).toBe(mixKeptSentenceOf(run.event));
    for (const text of [drill.today.wrinkleNote, drill.today.lede]) {
      expect(text).not.toMatch(/Twenty minutes|wants the lobby|on their way down/u);
      expect(text).toContain('changes how many people travel and not where they go');
    }
    expect(run.withheld.join(' ')).toContain(mixKeptSentenceOf(run.event));
    expect(run.withheld.join(' ')).not.toMatch(/engine refuses|directional mix/u);

    const conference = briefOf(contract.id, firstDayOf('conference'));
    const quiet = shiftRunConfigOf(RESOURCES, conference.state);
    expect(quiet.config.demand?.directionalSplit).toBeUndefined();
    expect(conference.today.wrinkleNote).toContain('the run is an ordinary day');
    expect(conference.today.wrinkleNote).not.toMatch(/floor to floor|all afternoon/u);
  });

  it('on a tower whose template has no mix of its own, keeps the wrinkle’s words, which the run obeys', () => {
    const slice = CONTRACTS.find((contract) => !WHOLE_DAY_CONTRACTS.includes(contract));
    if (slice === undefined) throw new Error('every contract has a whole day');
    const drill = briefOf(slice.id, firstDayOf('fire-drill'));
    const run = shiftRunConfigOf(RESOURCES, drill.state);
    expect(drill.planned.templateVariesMix).toBe(false);
    /* The run takes the mix — most trips down — for the whole run, not twenty minutes of it. */
    expect(run.config.demand?.directionalSplit?.outgoing).toBeGreaterThan(0.5);
    expect(drill.today.wrinkle.note).toBe(run.event.note);
    expect(drill.today.wrinkleNote).toContain('all shift');
    expect(drill.today.wrinkleNote).not.toContain('Twenty minutes');
    const conference = briefOf(slice.id, firstDayOf('conference'));
    const split = shiftRunConfigOf(RESOURCES, conference.state).config.demand?.directionalSplit;
    expect(split?.interfloor).toBeGreaterThanOrEqual(0.4);
    expect(conference.today.wrinkleNote).toMatch(/^(?:Half the trips|Four trips in ten) go floor to floor/u);
    expect(conference.today.wrinkleNote).not.toContain('all afternoon');
  });
});

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
          if (run.withheld.some((line) => line.includes('keeps its own mix of trips'))) {
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

  it('no day’s window takes a car the tower books over the same stretch — § D1038', () => {
    /*
     * Midtown's Tuesday move-in took car D, which its rung books 10:30–13:00, and the run collapsed
     * into the rung's schedule. Swept over every contract × day × weekday the week can start on: a
     * day's windowed car is never a booked car whose window meets the day's, and where the building
     * could spare none the run says so in `withheld` rather than dropping the ask.
     */
    const collisions: string[] = [];
    let moved = 0;
    for (const contract of CONTRACTS) {
      const booked = rungIncidents(rungFor(contract.id, contract.buildingId));
      if (booked.length === 0) continue;
      for (let day = 1; day <= 21; day += 1) {
        for (let start = 0; start < 7; start += 1) {
          const dayIdx = (start + day - 1) % 7;
          const run = shiftRunConfigOf(RESOURCES, scenarioDay(contract.id, day, dayIdx));
          const derate = run.event.effect.derate;
          if (derate === null || run.event.effect.changesNothing) continue;
          const meets = booked.filter(
            (entry) => entry.fromFraction < derate.toFraction && derate.fromFraction < entry.toFraction,
          );
          for (const carId of run.dayCars.windows) {
            if (meets.some((entry) => entry.car.carId === carId)) {
              collisions.push(`${contract.id} day ${String(day)} dayIdx ${String(dayIdx)}: ${carId}`);
            }
          }
          if (meets.length > 0) {
            moved += 1;
            if (run.dayCars.windows.length < derate.cars) {
              expect(run.withheld.join(' '), `${contract.id} day ${String(day)}`).toContain('booked out over the same stretch');
            }
          }
        }
      }
    }
    expect(collisions).toEqual([]);
    expect(moved, 'no day met a booking, so this case tests nothing').toBeGreaterThan(0);
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
    expect(run.withheld.join(' ')).toContain('keeps its own mix of trips');
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
