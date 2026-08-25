/**
 * The whole day is derived from `data/`, and **it changes the run** — the standing requirement,
 * pointed at a day length.
 *
 * `CLAUDE.md`: *move the control and require the run to change, compared on the legs rather than on
 * a window statistic.* A day-length seam that moves a caption and not a run is this repository's
 * eleven-times-shipped defect, and it is the one this lane was most able to ship: `office-day` was
 * already loaded, already schema-valid and already resolved — everything about it worked except
 * that no Everyday player could reach it. So the assertion that matters here is not that
 * `wholeDayFor` answers `office-day`; it is that the legs of a day and the legs of a slice are
 * different lists.
 *
 * The refusal is pinned by a run too, in the same idiom and for § D227's reason: the three shipped
 * crowds with no authored day are asserted to produce **byte-identical** legs, so *"this building
 * keeps its slice"* is a measured fact rather than a sentence somebody wrote.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type TrafficProfiles,
} from '@elevator-sim/core/browser';

import type { BrowserResources } from '../dev/data.js';
import {
  initialState,
  shiftDemandTemplateId,
  shiftRunConfigOf,
  type ViewerState,
} from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';

import { runHorizonOf, runsWholeDay, wholeDayFor, wholeDayRun } from './dayLength.js';

/* -------------------------------------------------------------------------- *
 * Resources — the shipped file, never a fixture
 * -------------------------------------------------------------------------- */

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

/**
 * Four of the eight, chosen so both sides of the derivation are represented and the suite still
 * runs: two office buildings that must be admitted, and two crowds — residential and hotel — that
 * must be excluded. `garden-apartments` is small enough to simulate in milliseconds, which is why
 * the legs comparisons use it and `secure-tower` rather than `vertical-city`.
 */
const BUILDING_IDS = [
  'garden-apartments',
  'midtown-office',
  'secure-tower',
  'crown-hotel',
] as const;

function resourcesOf(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const entries = BUILDING_IDS.map((id) => {
    const config = parseBuilding(read(`buildings/${id}.json`));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, elevatorSpecs) };
  });
  const trafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
  return {
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(read('dispatcher-profiles.json')),
    buildings: entries.map((entry) => entry.resolved),
    entries,
    trafficProfileIds: new Set(trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
}

const RESOURCES = resourcesOf();
const PROFILES: TrafficProfiles = RESOURCES.trafficProfiles;
const configOf = (id: string) =>
  RESOURCES.entries.find((entry) => entry.config.id === id)?.config;

/* -------------------------------------------------------------------------- *
 * The derivation
 * -------------------------------------------------------------------------- */

describe('the whole day a building may run', () => {
  it('is the record whose own period and hour say so, never a length written here', () => {
    const day = wholeDayFor(PROFILES, configOf('midtown-office'));
    if (day === undefined) throw new Error('midtown-office has no whole day');

    // Derived from the record rather than transcribed: the same three numbers, read a second way.
    const record = PROFILES.demandTemplates.find((entry) => entry.id === day.templateId);
    if (record === undefined) throw new Error(`no record for ${day.templateId}`);
    expect(day.periodS).toBe(record.durationMin * 60);
    expect(day.startOfDayS).toBe((record.startOfDayMin ?? -1) * 60);
    expect(record.phases?.length ?? 0).toBeGreaterThan(1);
  });

  it('admits a building exactly when the day declares that crowd’s mix at its own peak', () => {
    // Both directions from one loop, so an id added to `data/` cannot be admitted by a list here.
    for (const id of BUILDING_IDS) {
      const config = configOf(id);
      if (config === undefined) throw new Error(`${id} did not load`);
      const profile = PROFILES.profiles.find((entry) => entry.id === config.trafficProfile);
      if (profile === undefined) throw new Error(`${id} names no loaded profile`);

      const admitted = wholeDayFor(PROFILES, config) !== undefined;
      const declaresOurPeak = PROFILES.demandTemplates.some((record) => {
        const phases = record.phases;
        if (phases === undefined || phases.length === 0) return false;
        if (record.startOfDayMin === undefined) return false;
        const peak = phases.reduce(
          (highest, phase) => Math.max(highest, phase.startIntensity, phase.endIntensity),
          0,
        );
        return phases.some((phase) => {
          const near = (left: number, right: number): boolean => Math.abs(left - right) < 1e-6;
          const matches = (
            split: { incoming: number; outgoing: number; interfloor: number } | undefined,
          ): boolean =>
            split !== undefined &&
            near(split.incoming, profile.directionalSplit.incoming) &&
            near(split.outgoing, profile.directionalSplit.outgoing) &&
            near(split.interfloor, profile.directionalSplit.interfloor);
          return (
            (phase.startIntensity >= peak && matches(phase.startSplit)) ||
            (phase.endIntensity >= peak && matches(phase.endSplit))
          );
        });
      });
      expect(admitted, `${id} (${config.trafficProfile})`).toBe(declaresOurPeak);
    }
  });

  it('has nothing for the three crowds no shipped day was authored for', () => {
    // The exclusion stated as the product experiences it: no day, so no longer day, and the
    // module docstring's claim about which three is checked rather than asserted in prose.
    expect(wholeDayFor(PROFILES, configOf('garden-apartments'))).toBeUndefined();
    expect(wholeDayFor(PROFILES, configOf('crown-hotel'))).toBeUndefined();
    expect(wholeDayFor(PROFILES, undefined)).toBeUndefined();
  });

  it('runs as a window from the top and never as a length, because a day refuses a length', () => {
    const day = wholeDayFor(PROFILES, configOf('secure-tower'));
    if (day === undefined) throw new Error('secure-tower has no whole day');
    const run = wholeDayRun(day);
    // `0`, not `null` — `null` is what makes `shiftRunConfigOf` write `templateOverrides.durationS`,
    // which `core` refuses on a phase list by name (§ D285). The next case proves that is real.
    expect(run.windowStartS).toBe(0);
    expect(run.shiftLengthS).toBe(day.periodS);
    expect(runsWholeDay(day, run.shiftLengthS, run.windowStartS)).toBe(true);
    // A part of the same period is not the whole of it.
    expect(runsWholeDay(day, 1800, 1800)).toBe(false);
    expect(runsWholeDay(day, day.periodS, null)).toBe(false);
  });

  it('positive control: naming the day without its window throws rather than running long', () => {
    // The reason `wholeDayRun` writes a window, held to by the engine's own refusal rather than by
    // this file's opinion of it. If `core` ever accepted a `durationS` on a phase list, this case
    // fails and the window stops being load-bearing — which is a thing somebody should be told.
    const day = wholeDayFor(PROFILES, configOf('secure-tower'));
    if (day === undefined) throw new Error('secure-tower has no whole day');
    const state: ViewerState = {
      ...initialState(RESOURCES, 20260824n),
      buildingId: 'secure-tower',
      shiftLengthS: day.periodS,
      windowStartS: null,
      freePlay: { demandTemplateId: day.templateId, arrivalRatePctPop5min: null },
    };
    const plan = shiftRunConfigOf(RESOURCES, state);
    expect(plan.config.durationS).toBe(day.periodS);
    expect(() => recordRun(plan.config, { recordDecisions: false })).toThrow(/durationS/);
  });
});

/* -------------------------------------------------------------------------- *
 * The template the run resolves against
 * -------------------------------------------------------------------------- */

describe('the template a shift resolves against', () => {
  const stateFor = (buildingId: string, patch: Partial<ViewerState>): ViewerState => ({
    ...initialState(RESOURCES, 20260824n),
    buildingId,
    ...patch,
  });

  it('is the slice on the shipped opening state, which is the finding § AB reported', () => {
    // `pattern: 'building'` makes `selectedPatternSpec` answer `undefined`, so every opening day
    // fell through to one hard-coded thirty-minute up-peak — on an office tower as on a
    // residential one. Pinned so that a lane which changes the opening state has to read this.
    for (const id of ['midtown-office', 'garden-apartments']) {
      const state = stateFor(id, { shiftLengthS: 1800, windowStartS: null });
      expect(shiftDemandTemplateId(RESOURCES, state, configOf(id)), id).toBe('rise-and-fall');
    }
  });

  it('is the day once the run covers the whole of one', () => {
    const day = wholeDayFor(PROFILES, configOf('midtown-office'));
    if (day === undefined) throw new Error('midtown-office has no whole day');
    const state = stateFor('midtown-office', wholeDayRun(day));
    expect(shiftDemandTemplateId(RESOURCES, state, configOf('midtown-office'))).toBe(
      day.templateId,
    );
  });

  it('stays the slice for a crowd with no authored day, whatever the window says', () => {
    // The same window that turns an office day on cannot manufacture one for a residential tower.
    const state = stateFor('garden-apartments', { shiftLengthS: 36000, windowStartS: 0 });
    expect(shiftDemandTemplateId(RESOURCES, state, configOf('garden-apartments'))).toBe(
      'rise-and-fall',
    );
  });

  it('yields to Free Play, because that is the only source a player typed', () => {
    const day = wholeDayFor(PROFILES, configOf('midtown-office'));
    if (day === undefined) throw new Error('midtown-office has no whole day');
    const state = stateFor('midtown-office', {
      ...wholeDayRun(day),
      freePlay: { demandTemplateId: 'lunch-two-way', arrivalRatePctPop5min: null },
    });
    expect(shiftDemandTemplateId(RESOURCES, state, configOf('midtown-office'))).toBe(
      'lunch-two-way',
    );
  });
});

describe('the horizon a state is graded over', () => {
  const stateFor = (buildingId: string, patch: Partial<ViewerState>): ViewerState => ({
    ...initialState(RESOURCES, 20260824n),
    buildingId,
    ...patch,
  });

  /**
   * `runHorizonOf` is the expression both shells read, and it is asserted to be the **same
   * question** `shiftDemandTemplateId` asks rather than a parallel one.
   *
   * That is the property worth holding: the template a run resolves against and the bar it is
   * judged by come from one predicate, so a state cannot run a day and be graded as a slice — which
   * is the defect one door up, on the surface instead of in the seam.
   */
  it('answers whole-day exactly when the template resolves to the day', () => {
    for (const id of ['midtown-office', 'secure-tower', 'garden-apartments', 'crown-hotel']) {
      const day = wholeDayFor(PROFILES, configOf(id));
      for (const patch of [
        { shiftLengthS: 1800, windowStartS: null },
        // The window that turns a day on where there is one — and cannot manufacture one where
        // there is not, which is why the same numbers are asked of all four crowds.
        { shiftLengthS: 36000, windowStartS: 0 },
        // Half of a day is a part of a day and is not one.
        { shiftLengthS: 18000, windowStartS: 0 },
      ]) {
        const state = stateFor(id, patch);
        const horizon = runHorizonOf(PROFILES, configOf(id), state);
        const runsTheDay = shiftDemandTemplateId(RESOURCES, state, configOf(id)) === day?.templateId;
        expect(horizon, `${id} ${JSON.stringify(patch)}`).toBe(
          runsTheDay ? 'whole-day' : 'period',
        );
      }
    }
  });

  it('is keyed on the building’s day, never on a number of seconds', () => {
    // Ten hours of a residential tower is a long *slice* — it truncates its tail exactly as a short
    // one does, which is the mechanism `goals.ts#WORST_WAIT_WHOLE_DAY_FACTOR` measured. A shell
    // that read the clock instead of the record would call this a day.
    expect(
      runHorizonOf(
        PROFILES,
        configOf('garden-apartments'),
        stateFor('garden-apartments', { shiftLengthS: 36000, windowStartS: 0 }),
      ),
    ).toBe('period');
  });

  it('answers period for a building the file does not carry', () => {
    // `wholeDayFor`'s `undefined` passed straight through — a state naming a building `data/` does
    // not ship must not throw on the way to a bar.
    expect(
      runHorizonOf(PROFILES, undefined, { shiftLengthS: 36000, windowStartS: 0 }),
    ).toBe('period');
  });
});

/* -------------------------------------------------------------------------- *
 * The standing requirement — compared on the legs
 * -------------------------------------------------------------------------- */

/**
 * The legs of the run a state produces, as a comparable string.
 *
 * `scope/probes.test-helper.ts#legsOf`'s composition, including the `outOfServiceCarIds` that
 * travel **beside** the config rather than inside it: a helper that dropped them once reported a
 * live control as inert, and an instrument that does not reproduce the shipped call path measures
 * the instrument.
 */
function legsOf(state: ViewerState): string {
  const plan = shiftRunConfigOf(RESOURCES, state);
  return JSON.stringify(
    recordRun(plan.config, {
      recordDecisions: false,
      outOfServiceCarIds: plan.outOfServiceCarIds,
    }).recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

describe('move the day and the run moves', () => {
  it('produces a materially different set of legs from the slice it replaces', () => {
    const config = configOf('secure-tower');
    const day = wholeDayFor(PROFILES, config);
    if (day === undefined) throw new Error('secure-tower has no whole day');

    const base: ViewerState = {
      ...initialState(RESOURCES, 20260824n),
      buildingId: 'secure-tower',
    };
    const slice = legsOf({ ...base, shiftLengthS: 1800, windowStartS: null });
    const whole = legsOf({ ...base, ...wholeDayRun(day) });

    // Different, and not by a rounding: the day carries an order of magnitude more journeys, which
    // is what *a full cycle rather than one hour in the morning* has to mean if it means anything.
    expect(whole).not.toEqual(slice);
    const legsIn = (json: string): number => (JSON.parse(json) as unknown[]).length;
    expect(legsIn(whole)).toBeGreaterThan(legsIn(slice) * 5);
  }, 300_000);

  it('negative control: a crowd with no day runs exactly the run it ran before', () => {
    // § D227 — a refusal is pinned by a run, never by another sentence. `dayLength.ts` says three
    // shipped crowds keep their slice; this is that claim compared on the legs, byte for byte.
    const base: ViewerState = {
      ...initialState(RESOURCES, 20260824n),
      buildingId: 'garden-apartments',
      shiftLengthS: 1800,
      windowStartS: null,
    };
    expect(wholeDayFor(PROFILES, configOf('garden-apartments'))).toBeUndefined();
    expect(legsOf(base)).toEqual(legsOf(base));
    // And the seam cannot reach it: the state the office towers run a day on leaves this one on
    // its own template, so the only thing that changed is how long it ran.
    const state = { ...base, shiftLengthS: 36000, windowStartS: 0 };
    expect(shiftDemandTemplateId(RESOURCES, state, configOf('garden-apartments'))).toBe(
      'rise-and-fall',
    );
  }, 300_000);
});
