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

import { intensityAt, planDemand, splitAt, type SimulationConfig } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { shiftRunConfigOf } from '../dev/state.js';

import { CALENDAR_PERIOD_IDS, CALENDAR_PERIODS, scheduledEventFor } from './calendar.js';
import { contractBuildings, contractDayState } from './contractDay.test-helper.js';
import { CONTRACTS } from './contracts.js';
import { actsOf, wholeDayFor, wholeDayRun } from './dayLength.js';
import { demandTemplateVariesMix, eventAsRun, eventFor, mixKeptSentenceOf } from './events.js';
import { EPISODE_RAMP_MIN } from './episode.js';
import { plannedDayOf } from '../dev/state.js';
import { todayOf } from '../everyday/today.js';
import { rungFor, rungIncidents } from './ladder.js';
import { WRINKLE_LIBRARY } from '../wrinkles/library.js';

const WRINKLE_LIBRARY_TEMPLATES = WRINKLE_LIBRARY.templates;

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

/** `core`'s arrival plan for a config — the schedule the trace is generated from. */
function planOf(config: SimulationConfig) {
  const demand = config.demand ?? {};
  return planDemand({
    building: config.building,
    profiles: config.trafficProfiles,
    ...(config.demandTemplate === undefined ? {} : { template: config.demandTemplate }),
    ...(config.windowStartS === undefined ? {} : { windowStartS: config.windowStartS }),
    ...(config.windowEndS === undefined ? {} : { windowEndS: config.windowEndS }),
    ...(demand.arrivalRatePctPop5min === undefined
      ? {}
      : { arrivalRatePctPop5min: demand.arrivalRatePctPop5min }),
  });
}

/** `"from 10:00 to 10:20"` in a sentence, as seconds after a day that opens at `dayStartS`. */
function windowNamedIn(text: string, dayStartS: number): { startS: number; endS: number } | undefined {
  const match = /from (\d\d):(\d\d) to (\d\d):(\d\d)/u.exec(text);
  if (match === null) return undefined;
  const at = (h: string | undefined, m: string | undefined): number =>
    Number(h) * 3600 + Number(m) * 60 - dayStartS;
  return { startS: at(match[1], match[2]), endS: at(match[3], match[4]) };
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
    for (let dayIdx = 0; dayIdx < 7; dayIdx += 1) {
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
      wholeDayRun: planned.wholeDayRun,
      dayCars: planned.dayCars,
      crowdIsToday: false,
      daySeed: 20_260_925n,
      firstSession: false,
      units: 'metric',
    }),
  };
}

describe('a mix-setting wrinkle is an episode inside a whole day, and says when — § D1057', () => {
  /*
   * § D1040 said, truthfully, that on a whole day the fire drill moved only the level (1.6 times the
   * whole day) and the conference moved nothing. § D1057 makes the mix real instead: the wrinkle is
   * spliced into the run's own copy of the day at its placement, no run-wide multiplier is applied,
   * and the note names the window. These cases hold the run first and the words against it second.
   */
  it('splices the fire drill: no run-wide split or rate, the drill in the day, and the brief names its window', () => {
    const contract = WHOLE_DAY_CONTRACTS[0];
    if (contract === undefined) throw new Error('no whole-day contract');
    const drill = briefOf(contract.id, firstDayOf('fire-drill'));
    const run = shiftRunConfigOf(RESOURCES, drill.state);
    const ordinary = shiftRunConfigOf(RESOURCES, { ...drill.state, campaignEventId: 'ordinary' });
    expect(run.wholeDayRun).toBe(true);
    expect(run.episode).toBeDefined();
    /* No split beside the template, and the rate is the ordinary day's: the drill is not 1.6 days. */
    expect(run.config.demand?.directionalSplit).toBeUndefined();
    expect(run.config.demand?.arrivalRatePctPop5min).toBe(ordinary.config.demand?.arrivalRatePctPop5min);
    /* Nothing withheld about the mix, and the brief says when and what. */
    expect(run.withheld.join(' ')).not.toContain('keeps its own mix of trips');
    expect(drill.planned.wholeDayRun).toBe(true);
    expect(drill.today.wrinkle.note).toBe(eventAsRun(run.event, true, true).note);
    expect(drill.today.wrinkleNote).toContain('Twenty minutes');
    expect(drill.today.wrinkleNote).toContain('from 10:00 to 10:20');
    expect(drill.today.wrinkleNote).not.toContain('changes how many people travel');
    /* The run's own schedule carries the drill as a fourth act, so the stage plays it at speed. */
    const acts = actsOf(
      planOf(run.config).template.phases.map((phase) => ({
        startS: phase.startS,
        endS: phase.endS,
        startIntensity: phase.startIntensity,
        endIntensity: phase.endIntensity,
      })),
    );
    const episode = run.episode;
    if (episode === undefined) throw new Error('no episode');
    expect(acts.some((act) => act.startS <= episode.startS && act.endS >= episode.endS)).toBe(true);

    const conference = briefOf(contract.id, firstDayOf('conference'));
    const afternoon = shiftRunConfigOf(RESOURCES, conference.state);
    expect(afternoon.config.demand?.directionalSplit).toBeUndefined();
    expect(conference.today.wrinkleNote).toContain('from 13:15 to 16:15');
    expect(conference.today.wrinkleNote).toMatch(/^(?:Half the trips|Four trips in ten) go floor to floor/u);
    expect(conference.today.wrinkleNote).not.toContain('ordinary day');
  });

  it('keeps § D1040’s sentence where the run does not splice: a template that varies its own mix, not run whole', () => {
    const drill = eventFor(firstDayOf('fire-drill').day, firstDayOf('fire-drill').dayIdx);
    /* The run is not a whole day, so nothing is spliced and the mix is withheld as before. */
    expect(eventAsRun(drill, true, false).note).toBe(mixKeptSentenceOf(drill));
    /* A whole day splices it, and the note is the placement's. */
    expect(eventAsRun(drill, true, true).note).toContain('from 10:00 to 10:20');
  });

  it('on a tower whose template has no mix of its own, keeps the wrinkle’s words, which the run obeys', () => {
    const slice = CONTRACTS.find((contract) => !WHOLE_DAY_CONTRACTS.includes(contract));
    if (slice === undefined) throw new Error('every contract has a whole day');
    const drill = briefOf(slice.id, firstDayOf('fire-drill'));
    const run = shiftRunConfigOf(RESOURCES, drill.state);
    expect(drill.planned.templateVariesMix).toBe(false);
    expect(run.wholeDayRun).toBe(false);
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

  it('every placed wrinkle’s sentence names the window the run’s own phase list carries — the caption test', () => {
    /*
     * For each template with an episode, on the first whole-day tower, on the first day the week
     * draws it: the window is read **out of the sentence the brief draws**, and the run's own
     * schedule (`planDemand` over the config the product builds) must carry the wrinkle's mix across
     * exactly that window, and the ordinary day's schedule outside it and its two ramps.
     */
    const contract = WHOLE_DAY_CONTRACTS[0];
    if (contract === undefined) throw new Error('no whole-day contract');
    const placed = [
      ...new Set(
        WRINKLE_LIBRARY_TEMPLATES.filter((t) => t.effect.wholeDay?.kind === 'episode' && t.days !== 'campaign').map(
          (t) => t.id,
        ),
      ),
    ];
    expect(placed.length).toBe(15);
    const failures: string[] = [];
    for (const templateId of placed) {
      const found = firstDayOf(templateId);
      const brief = briefOf(contract.id, found);
      const run = shiftRunConfigOf(RESOURCES, brief.state);
      const ordinary = shiftRunConfigOf(RESOURCES, { ...brief.state, campaignEventId: 'ordinary' });
      const dayStartS = brief.planned.startOfDayS ?? 0;
      const named = windowNamedIn(brief.today.wrinkleNote, dayStartS);
      const split = run.event.effect.directionalSplit;
      if (named === undefined || split === null) {
        failures.push(`${templateId}: the brief names no window — ${brief.today.wrinkleNote}`);
        continue;
      }
      expect(run.episode, templateId).toEqual(named);
      const spliced = planOf(run.config).template;
      const base = planOf(ordinary.config).template;
      const ramp = EPISODE_RAMP_MIN * 60;
      for (let t = 0; t <= base.durationS; t += 60) {
        const got = splitAt(spliced, t);
        if (t >= named.startS && t <= named.endS) {
          const near =
            got !== undefined &&
            Math.abs(got.incoming - split.incoming) < 1e-9 &&
            Math.abs(got.outgoing - split.outgoing) < 1e-9;
          if (!near) failures.push(`${templateId} at ${String(t)} s: not the wrinkle's mix inside its window`);
        } else if (t < named.startS - ramp || t > named.endS + ramp) {
          const want = splitAt(base, t);
          if (
            got === undefined ||
            want === undefined ||
            Math.abs(got.outgoing - want.outgoing) > 1e-9 ||
            Math.abs(intensityAt(spliced, t) - intensityAt(base, t)) > 1e-9
          ) {
            failures.push(`${templateId} at ${String(t)} s: the day moved outside the window`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('a wrinkle that cannot be spliced honestly is not drawn on a whole day — S2’s condition, § D1057', () => {
  it('on the shipped library the two horizons draw the same wrinkle every day, so every caller agrees', () => {
    /*
     * Only a refused **drawable** template can make the draws differ, and the one shipped refusal
     * (`coach-party`) is a career's, drawn by no week. While that holds, a caller of
     * `scheduledEventFor` that does not pass the horizon names the run's wrinkle anyway. The day a
     * weekday or weekend template is refused, this fails: every caller of `scheduledEventFor` that
     * describes a whole day must then pass `'whole-day'` (the run and the brief already do).
     */
    const differ: string[] = [];
    for (let day = 1; day <= 60; day += 1) {
      for (let dayIdx = 0; dayIdx < 7; dayIdx += 1) {
        const a = scheduledEventFor(null, day, dayIdx, 'period').id;
        const b = scheduledEventFor(null, day, dayIdx, 'whole-day').id;
        if (a !== b) differ.push(`day ${String(day)} dayIdx ${String(dayIdx)}: ${a} / ${b}`);
      }
    }
    expect(differ).toEqual([]);
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
    let spliced = 0;
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
          if (run.episode !== undefined) spliced += 1;
        }
      }
    }
    expect(refused).toEqual([]);
    /*
     * § D1057: on a whole-day tower every drawn wrinkle that sets a mix has a placement, so it is
     * spliced and **no** mix is withheld. (§ D1040's sentence stays for runs that are not a whole
     * day and for a booked wrinkle with no placement; the week's draw makes neither here.)
     */
    expect(mixWithheld).toBe(0);
    expect(spliced).toBeGreaterThan(0);
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

  it('the fire drill on a whole-day tower is spliced, not withheld, and writes no run-wide rate', () => {
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
    expect(run.episode).toBeDefined();
    expect(run.withheld.join(' ')).not.toContain('keeps its own mix of trips');
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
