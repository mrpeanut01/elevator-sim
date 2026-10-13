/**
 * **A sandbox day runs, and it cannot touch the week** — wave AO, lane AO-2,
 * [§ D1368](../../../../DECISIONS.md), the post-AN panel's seat D (D3).
 *
 * Three claims, each against the shipped derivation rather than a restatement of it:
 *
 * 1. **The run simulates.** On Midtown Office's whole authored day, any saved pattern used to be a
 *    config `core` refuses (its peak hold and off-peak level against a phase list), which is why
 *    *Tune the tower* could simulate no change at all. Asserted by building the run the way
 *    `dev/main.ts#runShift` builds it and handing it to `recordRun`.
 * 2. **Each control moves the run, compared on the legs**, and a control the day cannot take is
 *    not offered (`tunerModel.test.ts` holds the offer).
 * 3. **The week is the week.** The sandbox stands on a copy of the day on
 *    `SANDBOX_DAY_CONTRACT_ID` with the week parked; the save writes the parked week and never the
 *    copy; leaving puts every kept field back exactly; and a tower left alone keeps the rung its
 *    contract hands over.
 */

import { describe, expect, it } from 'vitest';

import { BLANK_SPEC, specFromBuilding, type BuildingSpec } from '../authoring/buildingSpec.js';
import { demandTheTemplateTakes, specFromTrafficProfile, type PatternSpec } from '../authoring/patternSpec.js';
import { buildingConfigOf, shiftRunConfigOf, weeksForSession, type ViewerState } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';
import { contractBuildings, todaysScenarioDayState } from '../shift/contractDay.test-helper.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import { ladderTowerConfig } from '../shift/ladder.js';
import { PRACTICE_DAY_SENTENCES, practiceCrowdOf, practiceGroundOf } from '../shift/scoredCrowd.js';
import {
  closeDay,
  MODE_WEEK_CONTRACT_IDS,
  outcomeOf,
  SANDBOX_CONTRACT_ID,
  SANDBOX_DAY_CONTRACT_ID,
} from '../shift/week.js';

import {
  sandboxBeforeOf,
  sandboxCarriedLineOf,
  sandboxMoves,
  sandboxPatchOf,
  sandboxRestorePatchOf,
  sandboxWeekLineOf,
  type SandboxPresses,
} from './sandbox.js';
import { tunePresses, tuneStateFrom, type TuneState } from './tunerModel.js';

const RESOURCES = contractBuildings();
/** Midtown Office's pinned Monday as Today's scenario plays it: the whole authored day, on c2's rung. */
const MIDTOWN: ViewerState = todaysScenarioDayState(RESOURCES, 'c2', { seed: 20276662n }).state;

/** The tower and pattern *Tune the tower* opens on — the host's `sandboxStanding`, for this state. */
function standingOf(state: ViewerState): { readonly building: BuildingSpec; readonly pattern: PatternSpec } {
  const config = buildingConfigOf(RESOURCES, state.savedBuildings, state.buildingId);
  if (config === undefined) throw new Error('the day stands on a building this build knows');
  return {
    building: specFromBuilding(ladderTowerConfig(config, state.week.contractId, RESOURCES.elevatorSpecs), state.buildingId),
    pattern: specFromTrafficProfile(RESOURCES.trafficProfiles, config.trafficProfile),
  };
}

/** The presses one moved control makes — `tunerModel.ts#tunePresses`, the primary's own call. */
function pressesFor(state: ViewerState, patch: Partial<TuneState>): SandboxPresses {
  const at = standingOf(state);
  const standing = tuneStateFrom(at.building, at.pattern, state.levers.dwell);
  return tunePresses(at.building, at.pattern, standing, { ...standing, ...patch });
}

/** The state a sandbox press leaves standing — `host.ts#runSandbox`'s patch, without the press. */
function sandboxed(state: ViewerState, presses: SandboxPresses): ViewerState {
  return { ...state, ...sandboxPatchOf(state, RESOURCES, presses) };
}

/** The legs of the run a state produces — `scope/probes.test-helper.ts#legsOf`, on this file's resources. */
function legsOf(state: ViewerState): string {
  const plan = shiftRunConfigOf(RESOURCES, state);
  return JSON.stringify(
    recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording.legs.map(
      (leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1],
    ),
  );
}

describe('a saved pattern on a whole authored day is a run core accepts — D3’s root cause', () => {
  it('simulates, and says which of the pattern’s fields the day could not take', () => {
    /*
     * The post-AN panel's seat D: *How busy* 12 → 11.5, *Run it and watch*, and the stage said
     * *"Today's day could not be simulated"*; the worker's refusal was `core`'s
     * `templateOverrides (peakWindowS, baselineFraction) cannot be applied to demand template
     * "office-day"`. Red before `demandTheTemplateTakes`: `recordRun` threw exactly that.
     */
    const tuned: PatternSpec = { ...standingOf(MIDTOWN).pattern, ratePctPop5min: 11.5 };
    const state: ViewerState = { ...MIDTOWN, savedPatterns: [{ id: 'pat-1', spec: tuned }], pattern: 'pat-1' };
    const plan = shiftRunConfigOf(RESOURCES, state);
    expect(plan.wholeDayRun).toBe(true);
    expect(() =>
      recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }),
    ).not.toThrow();
    expect(plan.config.demand?.arrivalRatePctPop5min).toBe(11.5);
    expect(plan.config.demand?.peakWindowS).toBeUndefined();
    expect(plan.config.demand?.baselineFraction).toBeUndefined();
    expect(plan.config.demand?.directionalSplit).toBeUndefined();
    expect(plan.withheld.join(' ')).toMatch(/not applied; its arrival rate and group size were\./u);
  });

  it('leaves alone every field a template can take, so a run that simulated is the same run', () => {
    const demand = { arrivalRatePctPop5min: 12, peakWindowS: 300, baselineFraction: 0 };
    const kept = demandTheTemplateTakes(demand, { authorsItsPhases: false, variesMix: false });
    expect(kept.demand).toBe(demand);
    expect(kept.withheld).toBeUndefined();
    const narrowed = demandTheTemplateTakes(
      { ...demand, directionalSplit: { incoming: 0.85, outgoing: 0.05, interfloor: 0.1 } },
      { authorsItsPhases: true, variesMix: true },
    );
    expect(Object.keys(narrowed.demand)).toEqual(['arrivalRatePctPop5min']);
    expect(narrowed.withheld).toBe(
      'This day sets its own hours and its own mix, so the selected pattern’s off-peak level, how long ' +
        'the peak holds and interfloor share were not applied; its arrival rate and group size were.',
    );
  });
});

describe('each control the tuner offers on the day moves the run — compared on the legs', () => {
  it('moves the legs for How busy, door dwell and the shafts, each against the untouched day', () => {
    const untouched = legsOf(MIDTOWN);
    for (const patch of [{ rate: 11.5 }, { dwell: 'patient' as const }, { cars: 5 }]) {
      const presses = pressesFor(MIDTOWN, patch);
      expect(sandboxMoves(presses), JSON.stringify(patch)).toBe(true);
      expect(legsOf(sandboxed(MIDTOWN, presses)), JSON.stringify(patch)).not.toBe(untouched);
    }
  });
});

describe('the sandbox stands over the week and never on it', () => {
  const presses = pressesFor(MIDTOWN, { rate: 11.5 });
  const during = sandboxed(MIDTOWN, presses);

  it('stands the run on a copy of the day, with the week parked unchanged behind it', () => {
    expect(during.week.contractId).toBe(SANDBOX_DAY_CONTRACT_ID);
    expect(MODE_WEEK_CONTRACT_IDS).toContain(SANDBOX_DAY_CONTRACT_ID);
    expect(during.week.day).toBe(MIDTOWN.week.day);
    expect(during.week.dayIdx).toBe(MIDTOWN.week.dayIdx);
    expect(during.parkedWeeks.at(-1)).toBe(MIDTOWN.week);
    /* An unmoved tower is the week's tower — not a copy, and not the player's own sandbox week. */
    expect(during.buildingId).toBe(MIDTOWN.buildingId);
    expect(during.week.contractId).not.toBe(SANDBOX_CONTRACT_ID);
  });

  it('is never what the save writes — the week is, from one instant', () => {
    /* `dev/main.ts#saveSessionNow` writes `weeksForSession`; a reload reads exactly this pair back. */
    const saved = weeksForSession(during, undefined);
    expect(saved.week).toBe(MIDTOWN.week);
    expect(saved.parkedWeeks.some((week) => week.contractId === SANDBOX_DAY_CONTRACT_ID)).toBe(false);
  });

  it('puts every kept field back exactly when it is left', () => {
    const before = sandboxBeforeOf(MIDTOWN);
    const dwelt = sandboxed(MIDTOWN, pressesFor(MIDTOWN, { dwell: 'patient', cars: 5 }));
    expect(dwelt.levers.dwell).toBe('patient');
    expect(dwelt.buildingId).not.toBe(MIDTOWN.buildingId);
    const after: ViewerState = { ...dwelt, ...sandboxRestorePatchOf(before) };
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      expect(after[key], key).toBe(MIDTOWN[key]);
    }
    expect(after.week.contractId).toBe('c2');
  });

  it('copies a changed tower to the library and clears the fabric a copy cannot carry', () => {
    const towered = sandboxed(MIDTOWN, pressesFor(MIDTOWN, { cars: 5 }));
    expect(towered.week.contractId).toBe(SANDBOX_DAY_CONTRACT_ID);
    expect(towered.savedBuildings.map((entry) => entry.id)).toContain(towered.buildingId);
    expect(towered.commissioning).toEqual([]);
    /* Copied from the tower as the day hands it over, so the crowd is the day's size. */
    const population = (state: ViewerState): number =>
      shiftRunConfigOf(RESOURCES, state).building.floors.reduce((sum, floor) => sum + floor.population, 0);
    expect(population(towered)).toBe(population(MIDTOWN));
  });

  it('keeps the rung its contract hands over while the tower is left alone', () => {
    /*
     * The tuner used to copy the tower on any press, and a copy loses the rung: Midtown's brief then
     * read *People 1,900* where the day is let at about a third, and car D's booking went. A sandbox
     * that moved only the crowd or the doors meets the tower the day hands over.
     */
    const doors = sandboxed(MIDTOWN, pressesFor(MIDTOWN, { dwell: 'patient' }));
    const scored = shiftRunConfigOf(RESOURCES, MIDTOWN).building;
    const sandbox = shiftRunConfigOf(RESOURCES, doors).building;
    expect(sandbox.floors.map((floor) => floor.population)).toEqual(scored.floors.map((floor) => floor.population));
    expect(sandbox.serviceEvents).toEqual(scored.serviceEvents);
    expect((scored.serviceEvents ?? []).length).toBeGreaterThan(0);
  });

  it('closes as practice that moves no scoreboard, and the stage says it is a sandbox day', () => {
    expect(practiceGroundOf(during.week, during.seed, MIDTOWN.seed)).toBe('sandbox');
    expect(PRACTICE_DAY_SENTENCES.sandbox).toMatch(/sandbox day/u);
    const clean = outcomeOf({
      record: null,
      recordRefusal: 'a test day carries no record',
      day: during.week.day,
      dayIdx: during.week.dayIdx,
      eventId: 'ordinary',
      arrived: 400,
      carried: 400,
      minutePct: 97,
      readings: readGoals(goalsForDay(during.week.day), {
        arrived: 400,
        carryPct: 100,
        minutePct: 97,
        peakQueue: 0,
        abandoned: 0,
        abandonedCarried: 0,
        horizonS: 900,
        worstWaitS: 40,
        worstWaitIsCensored: false,
        workPerServedLegKJ: 34.7,
      }),
    });
    const closed = closeDay(during.week, clean);
    expect(closed.streak).toBe(during.week.streak);
    expect(closed.cleanRun).toBe(during.week.cleanRun);
    expect(closed.bestMinutePct).toBe(during.week.bestMinutePct);
  });
});

/*
 * Wave AO, lane AO-1b, § D1363: the drawing board's *Run a day in it* went through
 * `applyBuildingSpec`, whose `withBuilding` stood the player's own week on `SANDBOX_CONTRACT_ID`,
 * so the save wrote that week and a reload opened on Garden Apartments. It is a sandbox day now.
 */
describe('a drawn tower runs as a sandbox day over the week — § D1363', () => {
  const drawn: readonly BuildingSpec[] = [
    { ...standingOf(MIDTOWN).building, floors: standingOf(MIDTOWN).building.floors + 4, cars: 6 },
    BLANK_SPEC,
  ];

  it('simulates the day in the drawn tower, and the save writes the week, never the sandbox', () => {
    for (const spec of drawn) {
      const during = sandboxed(MIDTOWN, { building: spec, pattern: undefined, dwell: undefined });
      expect(during.week.contractId, spec.name).toBe(SANDBOX_DAY_CONTRACT_ID);
      expect(during.buildingId, spec.name).not.toBe(MIDTOWN.buildingId);
      expect(during.savedBuildings.map((entry) => entry.id), spec.name).toContain(during.buildingId);
      const plan = shiftRunConfigOf(RESOURCES, during);
      expect(() => recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }), spec.name).not.toThrow();
      const saved = weeksForSession(during, undefined);
      expect(saved.week, spec.name).toBe(MIDTOWN.week);
      expect([saved.week, ...saved.parkedWeeks].map((week) => week.contractId), spec.name).not.toContain(SANDBOX_CONTRACT_ID);
    }
  });

  it('closes on the practice crowd’s ground when the day it stood over had not begun — § D1362', () => {
    const practice = practiceCrowdOf(MIDTOWN.seed);
    const during = { ...sandboxed(MIDTOWN, { building: drawn[0], pattern: undefined, dwell: undefined }), seed: practice };
    expect(practiceGroundOf(during.week, during.seed, MIDTOWN.seed, false, practice)).toBe('practiceCrowd');
    /* The practice crowd is a different day: the legs differ from the shared crowd's in the same tower. */
    const shared = { ...during, seed: MIDTOWN.seed };
    expect(legsOf(during)).not.toBe(legsOf(shared));
  });
});

/*
 * Wave AP lane AP-D2, [§ D1451](../../../../DECISIONS.md), the post-AO panel's seat B (D1): week 2's
 * Monday on Midtown Office (Shift change, car D booked out 10:30–13:00), *Open the sandbox*, 3000 lb,
 * *Run it and watch*, and the run had no car D out and an ordinary day, so its clear read as *bigger
 * cars fixed it*. Week 3's Monday is that day with the level's car C booked out too. Red before: the
 * changed tower's run was an ordinary day with no booking at all.
 */
describe('a sandbox day runs the day it copies, its wrinkle and its bookings — § D1451', () => {
  /* The week deals the day's wrinkle: the helper pins `campaignEventId: 'ordinary'`, which no Scenario day carries. */
  const WEEK3: ViewerState = { ...MIDTOWN, campaignEventId: undefined, week: { ...MIDTOWN.week, week: 3, day: 1, dayIdx: 0 } };
  const cars = (state: ViewerState): readonly string[] =>
    [...new Set((shiftRunConfigOf(RESOURCES, state).bookings ?? []).map((incident) => incident.car.carId))].sort();
  const bigger = pressesFor(WEEK3, { cap: standingOf(WEEK3).building.ratedLoadLb + 500 });

  it('keeps the day’s wrinkle and every booking on a changed tower, and the legs show it', () => {
    const day = shiftRunConfigOf(RESOURCES, WEEK3);
    expect(day.event.id).toBe('shift-change:tight');
    expect(cars(WEEK3)).toEqual(['C', 'D']);
    const during = sandboxed(WEEK3, bigger);
    expect(during.buildingId).not.toBe(WEEK3.buildingId);
    expect(shiftRunConfigOf(RESOURCES, during).event.id).toBe(day.event.id);
    expect(cars(during)).toEqual(['C', 'D']);
    /* Leaving the day out is the player's to do, and it reaches the run: compared on the legs. */
    const plain = sandboxed(WEEK3, { ...bigger, plainDay: true });
    expect(shiftRunConfigOf(RESOURCES, plain).event.effect.changesNothing).toBe(true);
    expect(cars(plain)).toEqual([]);
    expect(legsOf(plain)).not.toBe(legsOf(during));
    expect(sandboxCarriedLineOf(day, shiftRunConfigOf(RESOURCES, during), false)).toBe(
      'This sandbox day keeps the day’s wrinkle (Shift change) and cars C and D booked out of passenger service as the day had.',
    );
    expect(sandboxCarriedLineOf(day, shiftRunConfigOf(RESOURCES, plain), true)).toBe(
      'This sandbox day leaves out the day’s wrinkle (Shift change) and the booking of cars C and D, because you left the day’s wrinkle and bookings out.',
    );
  });

  it('runs the untouched day as the day, on the legs, and counts it for nothing', () => {
    const untouched = sandboxed(WEEK3, pressesFor(WEEK3, {}));
    expect(untouched.week.contractId).toBe(SANDBOX_DAY_CONTRACT_ID);
    expect(legsOf(untouched)).toBe(legsOf(WEEK3));
  });

  it('leaves out a booking on a car the changed tower lost, runs, and says why', () => {
    const fewer = sandboxed(WEEK3, pressesFor(WEEK3, { cars: 3 }));
    expect(cars(fewer)).toEqual(['C']);
    const plan = shiftRunConfigOf(RESOURCES, fewer);
    expect(() => recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds })).not.toThrow();
    expect(sandboxCarriedLineOf(shiftRunConfigOf(RESOURCES, WEEK3), plan, false)).toBe(
      'This sandbox day keeps the day’s wrinkle (Shift change) and car C booked out of passenger service as the day had. ' +
        'It leaves out the booking of car D, because the tower you changed has no car D.',
    );
  });

  it('says where the week it stood over is, closed day or not', () => {
    expect(sandboxWeekLineOf(WEEK3.week)).toBe('Your week is where you left it, on Monday, which you have not closed.');
    expect(sandboxWeekLineOf({ ...WEEK3.week, closedDay: 1 })).toBe(
      'Your week is where you left it: Monday is closed as you closed it, and Tuesday is next.',
    );
  });
});
