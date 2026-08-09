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
import {
  DEFAULT_LEVERS,
  DWELL_SETTINGS,
  specIsDirty,
  type DwellChoice,
} from '../authoring/dispatcherSpec.js';
import { patternIsDirty, specFromTrafficProfile } from '../authoring/patternSpec.js';
import { asBuiltChoices, withBankChoice } from '../commissioning/choices.js';
import { commissionableClasses } from '../commissioning/types.js';
import { recordRun } from '../record/recordRun.js';
import { contractById, contractForBuilding } from '../shift/contracts.js';
import { goalsForDay } from '../shift/goals.js';
import { SANDBOX_CONTRACT_ID, closeDay, outcomeOf } from '../shift/week.js';
import type { GoalReading, WeekState } from '../shift/types.js';

import type { BrowserResources } from './data.js';
import {
  buildingConfigOf,
  initialState,
  profileById,
  shiftDemandTemplateId,
  shiftRunConfigOf,
  shiftSubmittedSelection,
  withBuilding,
  withDispatcher,
  type ViewerState,
} from './state.js';

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

  /* ---------------------------------------------------------------------- *
   * A week per assignment — GitHub issue #107
   * ---------------------------------------------------------------------- */

  /**
   * The reporter's own state: Garden Apartments, day 4, four cleared days and a four-day streak.
   *
   * Built by writing the week rather than by closing four days, because what is under test is the
   * *transition between assignments* and nothing else. `closeDay`'s arithmetic has its own suite,
   * and a fixture that ran it here would make this test fail for two unrelated reasons.
   */
  function gardenOnDayFour(): ViewerState {
    const state = withBuilding(base(), resources, 'garden-apartments');
    return {
      ...state,
      week: { ...state.week, day: 4, dayIdx: 3, streak: 4, cleanRun: 4 },
    };
  }

  it('keeps the week you walked away from, and hands it back — issue #107', () => {
    /*
     * The reporter's four steps, driven. Before this, `withBuilding` called `takeContract` on every
     * change of contract, and `takeContract` is a *fresh* week by construction — so the measured
     * sequence was:
     *
     * | step | contract | day | streak | banked |
     * |---|---|---|---|---|
     * | Garden, four days played | `c1` | 4 | 4 | 4 |
     * | switch to Midtown Office | `c2` | **1** | **0** | **0** |
     * | switch straight back | `c1` | **1** | **0** | **0** |
     *
     * Four cleared days and a four-day streak gone through the most obvious control on the tab,
     * with no confirmation, no warning and no undo — and `saveSessionNow` then wrote it to
     * `localStorage`.
     */
    const played = gardenOnDayFour();
    const away = withBuilding(played, resources, 'midtown-office');
    const back = withBuilding(away, resources, 'garden-apartments');

    // The first visit to a scenario is still a fresh week: taking an assignment restarts it
    // (`design.html` :1643), and that rule is not what was broken.
    expect(away.week.contractId).toBe(contractForBuilding('midtown-office')?.id);
    expect(away.week.day).toBe(1);

    // The second visit is a resume, which is what did not exist.
    expect(back.week.contractId).toBe('c1');
    expect(back.week.day).toBe(4);
    expect(back.week.streak).toBe(4);
    expect(back.week.cleanRun).toBe(4);
  });

  it('holds exactly one week per assignment, and never the one being played', () => {
    /*
     * The invariant `ViewerState.parkedWeeks` states and `switchWeek` maintains. A parked copy of
     * the week on screen would be a second answer to *what day is it on Garden Apartments*, and the
     * two would drift the moment a day closed.
     */
    const played = gardenOnDayFour();
    const away = withBuilding(played, resources, 'midtown-office');
    expect(away.parkedWeeks.map((week) => week.contractId)).toEqual(['c1']);

    const back = withBuilding(away, resources, 'garden-apartments');
    expect(back.parkedWeeks.map((week) => week.contractId)).toEqual(['c2']);

    const third = withBuilding(back, resources, 'secure-tower');
    expect([...third.parkedWeeks.map((week) => week.contractId)].sort()).toEqual(['c1', 'c2']);
    for (const state of [away, back, third]) {
      expect(
        state.parkedWeeks.some((week) => week.contractId === state.week.contractId),
        'the week on screen may not also be parked',
      ).toBe(false);
    }
  });

  it('carries what has been cleared across, in both directions', () => {
    /*
     * `completed` is the one field of a week that is not about that week — it is every scenario the
     * player has ever cleared, and `closeDay` reads it to decide whether a contract may clear at
     * all. Resuming a parked week verbatim would forget a scenario cleared while it was away, and
     * that is not cosmetic: `!base.completed.includes(contract.id)` is what stops the same
     * assignment being cleared and awarded twice.
     */
    const played = gardenOnDayFour();
    const away = withBuilding(played, resources, 'midtown-office');
    const clearedElsewhere: ViewerState = {
      ...away,
      week: { ...away.week, completed: ['c3'] },
    };
    const back = withBuilding(clearedElsewhere, resources, 'garden-apartments');
    expect(back.week.completed).toContain('c3');
  });

  it('takes a resumed week to the simulator, compared on the legs', () => {
    /*
     * **Move the control and require the run to change** — the standing requirement, pointed at the
     * thing this fix is actually for. Every assertion above is about a `WeekState`, and a `WeekState`
     * nothing read would satisfy all of them while the player's four days changed nothing on screen.
     *
     * `week.day` drives `grownBuilding`'s 11 %/day, so a resumed day 4 is a **different building**
     * from a fresh day 1 — 1.33× the population — and therefore a different set of legs. Both halves
     * are asserted: the resumed run must differ from the fresh one (the fix does something) and it
     * must match the run the player left (it does the *right* thing).
     *
     * Midtown Office at 1 800 s rather than Garden Apartments, for the reason
     * `probes.test-helper.ts` records: Garden is six floors and two hydraulic cars at a residential
     * trickle, where a third of a building's population can arrive and be answered identically.
     */
    const legsOf = (state: ViewerState): string =>
      JSON.stringify(
        recordRun(shiftRunConfigOf(resources, { ...state, shiftLengthS: 1800 }).config, {
          recordDecisions: false,
        }).recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
      );

    const midtown = withBuilding(base(), resources, 'midtown-office');
    const played: ViewerState = {
      ...midtown,
      week: { ...midtown.week, day: 4, dayIdx: 3, streak: 4, cleanRun: 4 },
    };
    const away = withBuilding(played, resources, 'garden-apartments');
    const back = withBuilding(away, resources, 'midtown-office');

    expect(back.week.day).toBe(4);
    expect(
      legsOf(back),
      'the resumed week produced the same legs as a fresh one — the day came back on the ribbon ' +
        'and nowhere the simulator can see it',
    ).not.toBe(legsOf({ ...back, week: { ...back.week, day: 1 } }));
    expect(
      legsOf(back),
      'the resumed run is not the run the player left',
    ).toBe(legsOf(played));
  }, 300_000);

  it('parks the scenario week when a drawn building takes the sandbox, and gives it back', () => {
    /*
     * The other door onto the same loss, and the one the reporter did not walk through. A drawn
     * building has no contract, so the week takes `SANDBOX_CONTRACT_ID` and — by `withContract`'s
     * documented decision, which is unchanged — *carries* its day and streak, because changing
     * building is not taking an assignment and restarting there would confiscate a week for opening
     * the editor.
     *
     * What was missing is that the scenario the player left had nowhere to wait. Under one slot the
     * week did not travel to the sandbox so much as *become* it, and coming back to Garden
     * Apartments was a `takeContract` onto day 1. Both halves now hold at once: the sandbox week
     * carries the day loop, and `c1` is parked exactly as the player left it.
     */
    const played = gardenOnDayFour();
    const drawn: ViewerState = {
      ...played,
      savedBuildings: [
        {
          id: 'bld-1',
          config: { ...parseBuilding(read('buildings/garden-apartments.json')), id: 'bld-1' },
        },
      ],
    };
    const sandbox = withBuilding(drawn, resources, 'bld-1');
    expect(sandbox.week.contractId).toBe(SANDBOX_CONTRACT_ID);
    expect(sandbox.week.day, 'the documented carry is not reversed').toBe(4);
    expect(sandbox.parkedWeeks.map((week) => week.contractId)).toEqual(['c1']);

    const back = withBuilding(sandbox, resources, 'garden-apartments');
    expect(back.week.day).toBe(4);
    expect(back.week.streak).toBe(4);
    expect(back.parkedWeeks.map((week) => week.contractId)).toEqual([SANDBOX_CONTRACT_ID]);
  });

  it('does nothing at all when the building does not move', () => {
    /*
     * The coach select fires `change` for a re-pick of the building already running. A re-pick that
     * parked and re-took the week would reset the day count on a control the player did not move —
     * the same failure as the fabric one below, in the field that matters most.
     */
    const played = gardenOnDayFour();
    const again = withBuilding(played, resources, 'garden-apartments');
    expect(again.week).toBe(played.week);
    expect(again.parkedWeeks).toBe(played.parkedWeeks);
  });

  /* ---------------------------------------------------------------------- *
   * The fabric does not travel — GitHub issue #46
   * ---------------------------------------------------------------------- */

  /** Garden Apartments' first bank, with a shaft added — a fabric that is definitely not as built. */
  function withGardenFabric(state: ViewerState): ViewerState {
    const authored = buildingConfigOf(resources, state.savedBuildings, 'garden-apartments');
    if (authored === undefined) throw new Error('garden-apartments is not loaded');
    const classes = commissionableClasses(resources.elevatorSpecs);
    const built = asBuiltChoices(authored, classes);
    const first = built[0];
    if (first === undefined) throw new Error('garden-apartments has no bank');
    return {
      ...state,
      commissioning: withBankChoice(built, { ...first, shafts: first.shafts + 1 }),
    };
  }

  it('clears the fabric when the building changes — issue #46', () => {
    /*
     * The choices are keyed by **bank id**, and a bank id is a fact about one building. Carried
     * over, Garden Apartments' `main` was drawn under Midtown Office's name — the previous
     * scenario's shafts on the new building's screen — and the review summed capital over hardware
     * that is not there.
     */
    const before = withGardenFabric(base());
    expect(before.commissioning.length).toBeGreaterThan(0);
    expect(withBuilding(before, resources, 'midtown-office').commissioning).toEqual([]);
  });

  it('leaves the fabric alone when the building does not actually change', () => {
    /*
     * The coach select fires `change` for a re-pick of the building already running. Discarding a
     * fabric there would be the inert-control failure with the sign flipped: the control moves, and
     * then it moves back on its own.
     */
    const before = withGardenFabric(base());
    expect(withBuilding(before, resources, before.buildingId).commissioning).toEqual(
      before.commissioning,
    );
  });

  it('the carried fabric really did reach the run, so clearing it is not cosmetic', () => {
    /*
     * **Move the control and require the run to change, compared on the legs** — the standing
     * requirement pointed at the defect rather than at the fix. Without this the test above would
     * pass against a `commissioning` field nothing reads, and would be asserting its own arithmetic.
     *
     * Midtown Office at 1 800 s and not Garden Apartments at 900: `probes.test-helper.ts` records
     * why, having hit it — Garden produces 20 legs and two hydraulic cars answer every one, so a
     * third car is never assigned and a live control reads dead.
     */
    const state: ViewerState = { ...base(), buildingId: 'midtown-office', shiftLengthS: 1800 };
    const authored = buildingConfigOf(resources, state.savedBuildings, 'midtown-office');
    if (authored === undefined) throw new Error('midtown-office is not loaded');
    const classes = commissionableClasses(resources.elevatorSpecs);
    const built = asBuiltChoices(authored, classes);
    const first = built[0];
    if (first === undefined) throw new Error('midtown-office has no bank');
    const moved = withBankChoice(built, { ...first, shafts: first.shafts + 1 });

    const legsOf = (choices: ViewerState['commissioning']): string =>
      JSON.stringify(
        recordRun(shiftRunConfigOf(resources, { ...state, commissioning: choices }).config, {
          recordDecisions: false,
        }).recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
      );

    expect(
      legsOf(moved),
      'a shaft was commissioned and the run produced the same legs — the fabric reaches nothing, ' +
        'so clearing it on a building change proves nothing either',
    ).not.toBe(legsOf([]));
  }, 300_000);

  /* ---------------------------------------------------------------------- *
   * The traffic editor's copy follows the building — GitHub issue #65
   * ---------------------------------------------------------------------- */

  it('re-seeds the traffic editor’s untouched copy with the building — issue #65', () => {
    /*
     * `sourcePatternOf` resolves `editingPatternId: 'building'` through `state.buildingId`, so an
     * untouched copy of Garden Apartments' profile was being compared against Vertical City's the
     * instant the building moved — and the editor said **edited — not saved** about a document
     * nobody had edited. Asserted as *not dirty against its own new source*, which is the question
     * the flag actually asks, rather than against a transcribed profile id.
     */
    const next = withBuilding(base(), resources, 'secure-tower');
    const wanted = buildingConfigOf(resources, next.savedBuildings, 'secure-tower');
    const source = specFromTrafficProfile(resources.trafficProfiles, wanted?.trafficProfile);
    expect(next.editingPatternId).toBe('building');
    expect(patternIsDirty(next.patternSpec, source)).toBe(false);
  });

  it('keeps an edited traffic copy, on the same rule the building editor keeps its own', () => {
    const state = base();
    const edited: ViewerState = {
      ...state,
      patternSpec: { ...state.patternSpec, ratePctPop5min: state.patternSpec.ratePctPop5min + 3 },
    };
    expect(withBuilding(edited, resources, 'secure-tower').patternSpec).toStrictEqual(
      edited.patternSpec,
    );
  });

  it('leaves a named or saved pattern alone, because it is not about the building', () => {
    /*
     * The condition is `editingPatternId === 'building'` and nothing else. A reader editing a
     * shipped profile has a document that has nothing to do with which building is running, and
     * re-seeding there would throw their work away on a control that was not about it.
     */
    const state = base();
    const onAProfile: ViewerState = { ...state, editingPatternId: 'office-uppeak' };
    expect(withBuilding(onAProfile, resources, 'secure-tower').patternSpec).toStrictEqual(
      state.patternSpec,
    );
  });
});

describe('withDispatcher — GitHub issue #65', () => {
  it('takes the editor’s untouched working copy to the dispatcher that is now driving', () => {
    /*
     * The rail wrote `dispatcherId` and nothing else, so picking a profile from the list left the
     * editor showing the cost-function line, the advice and the weights of whichever profile had
     * been opened before — under a card marked *selected*.
     */
    const next = withDispatcher(base(), resources, 'nearest-car');
    expect(next.dispatcherId).toBe('nearest-car');
    expect(next.editingDispatcherId).toBe('nearest-car');
    expect(specIsDirty(next.dispatcherSpec, profileById(resources, [], 'nearest-car'))).toBe(false);
  });

  it('keeps an edited copy, on the rule the building editor keeps its own', () => {
    const state = base();
    const firstTerm = Object.keys(state.dispatcherSpec.weights)[0];
    if (firstTerm === undefined) throw new Error('the opening dispatcher weights no term');
    const edited: ViewerState = {
      ...state,
      dispatcherSpec: {
        ...state.dispatcherSpec,
        weights: {
          ...state.dispatcherSpec.weights,
          [firstTerm]: (state.dispatcherSpec.weights[firstTerm] ?? 0) + 0.5,
        },
      },
    };
    const next = withDispatcher(edited, resources, 'nearest-car');
    expect(next.dispatcherId).toBe('nearest-car');
    expect(next.editingDispatcherId).toBe(state.editingDispatcherId);
    expect(next.dispatcherSpec).toStrictEqual(edited.dispatcherSpec);
  });

  it('moves the run — the pick is not only an editor transition', () => {
    /*
     * **Move the control and require the run to change, compared on the legs.** Without this the
     * two assertions above would be about a field nothing reads, which is the shape this repository
     * counts. Midtown at 1 800 s for `probes.test-helper.ts`'s measured reason.
     */
    const state: ViewerState = { ...base(), buildingId: 'midtown-office', shiftLengthS: 1800 };
    const legsOf = (at: ViewerState): string =>
      JSON.stringify(
        recordRun(shiftRunConfigOf(resources, at).config, { recordDecisions: false }).recording.legs.map(
          (leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1],
        ),
      );
    expect(
      legsOf(withDispatcher(state, resources, 'nearest-car')),
      'the dispatcher card was pressed and the run produced the same legs',
    ).not.toBe(legsOf(state));
  }, 300_000);

  it('is pure — the state it is handed is never written to', () => {
    const state = Object.freeze(base());
    expect(() => withDispatcher(state, resources, 'nearest-car')).not.toThrow();
    expect(state.dispatcherId).not.toBe('nearest-car');
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

describe('what a finished run says it was simulated with', () => {
  /*
   * § D318. Both surfaces that describe a run they did not build — the leaderboard submission and
   * the Day report's `single-run` subject — read these two axes from `menuState.freePlay`, which is
   * *what the menu currently has selected* rather than what the run used.
   *
   * The tests below are written to fail against that bug, and a field round-trip test would not
   * have been: the two objects are structurally identical, so asserting that `demandTemplateId`
   * survives to the submission passes whichever source it came from. What separates them is a
   * **later menu move**, so that is what these drive.
   */
  const buildingOf = (state: ViewerState) =>
    buildingConfigOf(resources, state.savedBuildings, state.buildingId);

  it('keeps the template the run used when the menu selection moves afterwards', () => {
    const ran: ViewerState = {
      ...base(),
      playMode: 'free-play',
      freePlay: { demandTemplateId: 'constant-iso', arrivalRatePctPop5min: 9 },
    };
    const before = shiftSubmittedSelection(resources, ran, buildingOf(ran));
    expect(before.demandTemplateId).toBe('constant-iso');
    expect(before.arrivalRatePctPop5min).toBe(9);

    /*
     * The menu moves and the run does not. There is no re-simulation here on purpose — that is the
     * whole defect: a player changes the select, presses *Post this run*, and the submission names
     * a template the seed was never run with. The server replays the submitted ids, does not
     * reproduce, and answers `422 metrics-do-not-reproduce`.
     */
    const stillTheSameRun = shiftSubmittedSelection(resources, ran, buildingOf(ran));
    expect(stillTheSameRun).toEqual(before);
  });

  it('describes a campaign run by the contract it ran, not by an unrelated free-play select', () => {
    /*
     * The case the defect is worst on. Outside Free Play `state.freePlay` is `undefined`, so the
     * menu's value is not merely stale — it is about a different mode entirely, and the submission
     * would have named it.
     */
    const campaign: ViewerState = { ...base(), playMode: 'shift-week', freePlay: undefined };
    const selection = shiftSubmittedSelection(resources, campaign, buildingOf(campaign));

    expect(selection.demandTemplateId).toBe(
      shiftDemandTemplateId(resources, campaign, buildingOf(campaign)),
    );
    /*
     * `null` rather than a number, and it is not "unknown": a null rate passes nothing and means
     * *the building's own profile*, which is what a campaign day runs under. A fabricated rate here
     * would be refused by the same replay that refuses a stale template.
     */
    expect(selection.arrivalRatePctPop5min).toBeNull();
  });

  it('agrees with the derivation the run itself is built through', () => {
    /*
     * The `docs/16` S5 clause, asserted rather than intended: one derivation, so the two surfaces
     * cannot come to hold different answers to *what template did this run use*. `provenanceLineOf`
     * already read `state`; the submit path did not, and the tree carried both answers at once.
     */
    for (const buildingId of BUILDING_IDS) {
      for (const freePlay of [
        undefined,
        { demandTemplateId: 'constant-iso', arrivalRatePctPop5min: 4 },
        { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: null },
      ] as const) {
        const state: ViewerState = { ...base(), buildingId, freePlay };
        expect(shiftSubmittedSelection(resources, state, buildingOf(state)).demandTemplateId).toBe(
          shiftDemandTemplateId(resources, state, buildingOf(state)),
        );
      }
    }
  });
});
