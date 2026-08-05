/**
 * The run builder, and the three state transitions that had defects in them.
 *
 * `shiftRunConfigOf` is the single answer to *what is the simulator being asked for*, which is why
 * it is a function and not a click handler: everything below needs a `BrowserResources` and a
 * `ViewerState` and nothing below needs a document.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { specFromBuilding } from '../authoring/buildingSpec.js';
import { DEFAULT_LEVERS, DWELL_SETTINGS, type DwellChoice } from '../authoring/dispatcherSpec.js';
import { recordRun } from '../record/recordRun.js';
import { contractById, contractForBuilding } from '../shift/contracts.js';
import { goalsForDay } from '../shift/goals.js';
import { SANDBOX_CONTRACT_ID, closeDay, outcomeOf } from '../shift/week.js';
import type { GoalReading, WeekState } from '../shift/types.js';

import type { BrowserResources } from './data.js';
import { initialState, shiftRunConfigOf, withBuilding, type ViewerState } from './state.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const BUILDING_IDS = [
  'garden-apartments',
  'midtown-office',
  'secure-tower',
  'mixed-use-high-rise',
  'vertical-city',
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

const resources = resourcesOf();
const base = (): ViewerState => initialState(resources, 20260730n);

describe('the run builder', () => {
  it('builds a runnable configuration for every shipped building', () => {
    for (const buildingId of BUILDING_IDS) {
      const plan = shiftRunConfigOf(resources, { ...base(), buildingId, shiftLengthS: 300 });
      expect(() => recordRun(plan.config, { recordDecisions: false })).not.toThrow();
    }
  }, 300_000);

  it('grows the building with the day, and the growth reaches the simulation', () => {
    /*
     * The whole point of putting growth in `BuildingConfig` rather than in a caption. A day-20
     * shift must move more people than a day-1 shift on the same building and the same seed —
     * otherwise the tenants moved in on the header and nowhere else.
     */
    const day1 = shiftRunConfigOf(resources, { ...base(), shiftLengthS: 300 });
    const later = base();
    const day20 = shiftRunConfigOf(resources, {
      ...later,
      shiftLengthS: 300,
      week: { ...later.week, day: 20 },
    });
    const population = (plan: typeof day1): number =>
      plan.building.floors.reduce((total, floor) => total + floor.population, 0);
    expect(population(day20)).toBeGreaterThan(population(day1));
  });

  it('hands the run no demand override under the building’s own demand', () => {
    // The comparable case: every published figure was measured with the building's own profile,
    // so *the building's own demand* must be expressed by overriding nothing.
    const plan = shiftRunConfigOf(resources, { ...base(), pattern: 'building' });
    expect(plan.config.demand).toStrictEqual({});
  });

  it('carries the day’s event into the run and says what it withheld', () => {
    const state = base();
    const plan = shiftRunConfigOf(resources, state);
    expect(plan.event.id).toBeDefined();
    // `withheld` is a list, never a thrown error and never silence.
    expect(Array.isArray(plan.withheld)).toBe(true);
  });
});

describe('the dwell lever reaches the cars of the building being run', () => {
  /*
   * The seam the fifth audit found half-open (§ D192, candidate 3). A dwell choice is two
   * documents: `answer.dwellPolicy`/`maxDwellS` on the profile — which `profileFromSpec` already
   * wrote — and `dwellCarCallS`/`dwellHallCallS` on **every car**, which `doorTimingFor` computes
   * and, until this seam was wired, nothing in the shipped run builder applied. Snappy and normal
   * differ *only* in the car fields (both are `fixed`, gain 0, ceiling 20), so the shipped viewer
   * ran two of its three chips as the same building — `authoring.test.ts` proved the three-runs
   * property on a building it assembled itself, which is § D159's fixture shape. These tests are
   * § D177's rule pointed at the shipped builder: move the control, require the run to change,
   * compared on the legs.
   */
  const planWith = (dwell: DwellChoice | undefined): ReturnType<typeof shiftRunConfigOf> =>
    shiftRunConfigOf(resources, {
      ...base(),
      shiftLengthS: 300,
      levers: { ...DEFAULT_LEVERS, dwell },
    });

  it('writes the chosen dwell onto every resolved car, and inherit writes nothing', () => {
    /*
     * Asserted with `snappy`, not `normal`: normal's 3 s / 5 s are exactly the reference-data
     * typicals `resolveCar` defaults to, so asserting normal passes on a builder that writes
     * nothing at all. The control below pins that the two really differ on this building.
     */
    const inherit = planWith(undefined);
    const snappy = planWith('snappy');
    for (const bank of snappy.building.banks) {
      for (const car of bank.cars) {
        expect(car.dwellCarCallS).toBe(DWELL_SETTINGS.snappy.dwellCarCallS);
        expect(car.dwellHallCallS).toBe(DWELL_SETTINGS.snappy.dwellHallCallS);
      }
    }
    const inheritCar = inherit.building.banks[0]?.cars[0];
    expect(inheritCar?.dwellCarCallS).not.toBe(DWELL_SETTINGS.snappy.dwellCarCallS);
    // The fourth state is inherit, and it must stay a non-write: an unpressed chip that
    // overwrote every car's own dwell would be the defect GroupLevers.dwell's docstring records.
    expect(JSON.stringify(planWith(undefined).config.building)).toBe(
      JSON.stringify(shiftRunConfigOf(resources, { ...base(), shiftLengthS: 300 }).config.building),
    );
  });

  it('makes snappy, normal and patient three genuinely different runs — not two', () => {
    const legsOf = (dwell: DwellChoice): string =>
      JSON.stringify(recordRun(planWith(dwell).config, { recordDecisions: false }).recording.legs);
    expect(new Set([legsOf('snappy'), legsOf('normal'), legsOf('patient')]).size).toBe(3);
  }, 300_000);
});

describe('withBuilding', () => {
  it('takes the scenario the building belongs to', () => {
    /*
     * Picking Midtown Office while the week sat on Scenario 1 produced a sheet headed *Midtown
     * Office* and footed *Scenario 1 — Learn the ropes*, banking a Garden Apartments shift against
     * a run that never touched it.
     */
    const next = withBuilding(base(), resources, 'midtown-office');
    expect(next.week.contractId).toBe(contractForBuilding('midtown-office')?.id);
    expect(next.buildingId).toBe('midtown-office');
  });

  /**
   * A building the reader drew, with the week already deep in a scenario — the state the defect
   * below needed, and the one a player reaches by opening the editor mid-week.
   */
  function drawnBuildingOnScenarioTwo(): ViewerState {
    const state = withBuilding(base(), resources, 'midtown-office');
    return {
      ...state,
      week: { ...state.week, day: 4, dayIdx: 3, cleanRun: 1, streak: 2 },
      savedBuildings: [
        { id: 'bld-1', config: { ...parseBuilding(read('buildings/garden-apartments.json')), id: 'bld-1' } },
      ],
    };
  }

  it('takes the week *out* of a scenario for a building the reader drew', () => {
    /*
     * This assertion was the inverse — *leaves the week alone* — and it encoded a defect.
     *
     * Keeping the week meant keeping its `contractId`, and that id resolves: a tower drawn while on
     * Scenario 2 inherited `c2`, so the ribbon read *Scenario · day 4 · 1 clean shift banked* on a
     * building Scenario 2 has nothing to do with. The next test is the half that matters.
     */
    const next = withBuilding(drawnBuildingOnScenarioTwo(), resources, 'bld-1');
    expect(next.week.contractId).toBe(SANDBOX_CONTRACT_ID);
    expect(contractById(next.week.contractId)).toBeUndefined();
  });

  it('does not confiscate the week to do it', () => {
    // Changing building is not taking an assignment. The player is on day 4 with a streak of two
    // and still is; what changed is that there is nothing to bank toward.
    const before = drawnBuildingOnScenarioTwo();
    const next = withBuilding(before, resources, 'bld-1');
    expect(next.week.day).toBe(4);
    expect(next.week.streak).toBe(2);
    expect(next.week.cleanRun).toBe(before.week.cleanRun);
  });

  it('stops a drawn building from clearing somebody else’s scenario', () => {
    /*
     * The defect, driven. Before this, two clean days on an invented tower **cleared Scenario 2** —
     * `closeDay` reads `contractById(week.contractId)`, the inherited `c2` resolved, and the
     * arithmetic ran. That is the forgery the leaderboard's replay apparatus exists to refuse,
     * arriving through the campaign's front door: draw a two-floor tower with sixteen cars, run
     * clean days, clear the scenarios.
     *
     * The negative control is the same three days on the scenario's **own** building, which must
     * still clear — otherwise this test would pass against a `closeDay` that had stopped banking.
     */
    const readings = (day: number): readonly GoalReading[] =>
      goalsForDay(day).map((goal) => ({
        goal,
        state: 'met' as const,
        observed: goal.bar,
        display: String(goal.bar),
        progressPct: 100,
        glyph: '✓',
      }));
    const cleanDay = (week: WeekState, day: number): WeekState =>
      closeDay(
        { ...week, day, dayIdx: (day - 1) % 7 },
        outcomeOf({
          day,
          dayIdx: (day - 1) % 7,
          eventId: 'ordinary',
          arrived: 40,
          carried: 40,
          minutePct: 100,
          readings: readings(day),
        }),
      );

    let sandbox = withBuilding(drawnBuildingOnScenarioTwo(), resources, 'bld-1').week;
    for (let day = 1; day <= 3; day += 1) sandbox = cleanDay(sandbox, day);
    expect(sandbox.cleared).toBeNull();
    expect(sandbox.completed).toEqual([]);

    let real = withBuilding(base(), resources, 'midtown-office').week;
    const contractId = real.contractId;
    for (let day = 1; day <= 3; day += 1) real = cleanDay(real, day);
    expect(real.completed).toContain(contractId);
  });

  it('re-seeds the editor’s working copy while it is untouched', () => {
    const next = withBuilding(base(), resources, 'secure-tower');
    expect(next.editingBuildingId).toBe('secure-tower');
    expect(next.buildingSpec.name).toBe('Secure Tower');
  });

  it('keeps an edited working copy, because losing it is worse than showing the wrong one', () => {
    const state = base();
    const edited: ViewerState = {
      ...state,
      buildingSpec: { ...state.buildingSpec, floors: state.buildingSpec.floors + 7 },
    };
    const next = withBuilding(edited, resources, 'secure-tower');
    expect(next.buildingId).toBe('secure-tower');
    expect(next.editingBuildingId).toBe(state.editingBuildingId);
    expect(next.buildingSpec).toStrictEqual(edited.buildingSpec);
  });

  it('is pure — the state it is handed is never written to', () => {
    const state = Object.freeze(base());
    expect(() => withBuilding(state, resources, 'vertical-city')).not.toThrow();
    expect(state.buildingId).not.toBe('vertical-city');
  });
});

describe('the initial state', () => {
  it('opens on collective rather than nearest-car — § D134', () => {
    /*
     * Not cosmetic. `nearest-car` is on the Pareto front at six of eight matrix cells *because it
     * is best on energy and worst on wait*, so opening on it shows a reader the weakest shipped
     * dispatcher and calls it the default.
     */
    expect(base().dispatcherId).toBe('collective');
  });

  it('opens on the first scenario’s building, with its week open', () => {
    const state = base();
    expect(state.buildingId).toBe('garden-apartments');
    expect(state.week.contractId).toBe(contractForBuilding('garden-apartments')?.id);
  });

  it('seeds the building editor from the building it opens on', () => {
    const state = base();
    const config = resources.entries.find((entry) => entry.config.id === state.buildingId)?.config;
    expect(config).toBeDefined();
    if (config === undefined) return;
    expect(state.buildingSpec).toStrictEqual(specFromBuilding(config, state.buildingId));
  });
});
