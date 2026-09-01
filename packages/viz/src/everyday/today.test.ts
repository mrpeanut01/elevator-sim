/**
 * The one day record — GAMEPLAY § 16 rule 14, driven against the real shipped `data/`.
 *
 * The cases that matter are the two that would let two screens disagree about today: the car the
 * brief's badge names must be the car `shift/incidents.ts` actually holds, and the wrinkle must be
 * the event the **calendar seam** schedules for this `(day, dayIdx)` rather than one this module
 * chose — `shift/calendar.ts#scheduledEventFor`, which is issue #135's one composition.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type ResolvedBuilding,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import type { BrowserResources } from '../dev/data.js';
import { initialState, resolvedBuildingOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import type { CalendarPeriod } from '../shift/calendar.js';
import { CALENDAR_PERIODS, periodOnDays, scheduledEventFor } from '../shift/calendar.js';
import { carsToDerate } from '../shift/incidents.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import type { GoalReading, WeekState } from '../shift/types.js';
import { openWeek } from '../shift/week.js';

import { EM_DASH, groupThousands } from './figures.js';
import { COMFORTABLE_PER_CAR, todayOf } from './today.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const specs = parseElevatorSpecs(read('elevator-specs.json'));
const buildingOf = (id: string): ResolvedBuilding =>
  resolveBuilding(parseBuilding(read(`buildings/${id}.json`)), specs);

/**
 * No calendar period — the fall-through arm, where `scheduledEventFor` hands back the ordinary
 * schedule. The period arm is `calendar.test.ts`'s; what this file asserts is that the record goes
 * through the composition at all, which is what `eventSeam.test.ts` enforces from disk.
 */
const NO_CALENDAR = null;

const midtown = buildingOf('midtown-office');
const garden = buildingOf('garden-apartments');

/** Every reading `pending`, which is what a day looks like before anything has run. */
const pendingGoals = (day: number): readonly GoalReading[] =>
  readGoals(goalsForDay(day), {
    arrived: 0,
    carryPct: 100,
    minutePct: 100,
    peakQueue: 0,
    abandoned: 0,
    worstWaitS: 0,
    worstWaitIsCensored: false,
  });

const weekOn = (day: number, dayIdx: number): WeekState => ({ ...openWeek(), day, dayIdx });

const recordFor = (
  building: ResolvedBuilding,
  day: number,
  dayIdx: number,
): ReturnType<typeof todayOf> =>
  todayOf({
    week: weekOn(day, dayIdx),
    calendar: NO_CALENDAR,
    building,
    buildingId: building.id,
    dispatcherName: 'Steady hand',
    goals: pendingGoals(day),
    seed: 424_242n,
    units: 'metric',
  });

describe('the wrinkle is the day’s event, not this module’s choice', () => {
  it('quotes `scheduledEventFor(NO_CALENDAR, day, dayIdx)`’s own name and note, unedited', () => {
    for (const [day, dayIdx] of [
      [1, 0],
      [3, 2],
      [5, 4],
      [6, 5],
    ] as const) {
      const record = recordFor(midtown, day, dayIdx);
      const event = scheduledEventFor(NO_CALENDAR, day, dayIdx);
      expect(record.wrinkle.id, `day ${String(day)}`).toBe(event.id);
      expect(record.wrinkle.name).toBe(event.name);
      expect(record.wrinkle.note).toBe(event.note);
    }
  });

  it('says nothing about a car on a day that holds none', () => {
    // `ordinary` writes nothing: no cars out, no derate. There is no strip to draw.
    const ordinary = recordFor(midtown, 2, 1);
    expect(scheduledEventFor(NO_CALENDAR, 2, 1).id).toBe('ordinary');
    expect(ordinary.outOfService).toBeUndefined();
  });
});

describe('the badge names the car the run actually holds', () => {
  it('is `carsToDerate`’s own choice, so the brief and the kernel cannot disagree', () => {
    // Day 3 is the move-in, whose effect derates one car for the first two thirds of the shift.
    const moveIn = scheduledEventFor(NO_CALENDAR, 3, 2);
    const held = moveIn.effect.carsOutOfService + (moveIn.effect.derate?.cars ?? 0);
    expect(held).toBeGreaterThan(0);
    const record = recordFor(midtown, 3, 2);
    const choice = carsToDerate(midtown, held);
    expect(record.outOfService?.badge).toBe(choice.held.map((car) => car.carId).join(' · '));
  });

  it('defers to the event’s own note for *when*, rather than restating a duration', () => {
    const record = recordFor(midtown, 3, 2);
    expect(record.outOfService?.sentence).toContain(scheduledEventFor(NO_CALENDAR, 3, 2).note);
  });
});

describe('the facts come from the resolved building', () => {
  it('counts floors, people and cars as `resolveBuilding` counted them', () => {
    const record = recordFor(garden, 2, 1);
    const byLabel = new Map(record.facts.map((fact) => [fact.label, fact.value]));
    expect(byLabel.get('Floors')).toBe(`${String(garden.floors.length)} above ground`);
    // The floor sum, which is what the kernel counts arrivals against.
    expect(byLabel.get('People')?.replace(/,/g, '')).toBe(String(garden.totalPopulation));
  });

  it('pairs each car’s capacity with what the working group lifts in one trip', () => {
    const record = recordFor(garden, 2, 1);
    const cars = garden.banks.reduce((total, bank) => total + bank.cars.length, 0);
    const smallest = Math.min(
      ...garden.banks.flatMap((bank) => bank.cars.map((car) => car.designCapacityPersons)),
    );
    const holds = record.facts.find((fact) => fact.label === 'Each car holds')?.value ?? '';
    // Design load, not rated — CLAUDE.md's 80 % rule, applied by `core` and read here.
    expect(holds).toContain(`${String(smallest)} · ${String(smallest * cars)} a trip`);
    expect(holds).toContain(`${String(cars)} working`);
  });

  it('draws no facts and no load reading when the building document is missing', () => {
    const record = todayOf({
      week: weekOn(1, 0),
      calendar: NO_CALENDAR,
      building: undefined,
      buildingId: 'a-building-this-build-does-not-have',
      dispatcherName: undefined,
      goals: [],
      seed: 1n,
      units: 'metric',
    });
    expect(record.facts).toEqual([]);
    expect(record.load).toBeUndefined();
    expect(record.driver).toBe(EM_DASH);
    // The tower falls back to the id asked after rather than to another building's name.
    expect(record.towerName).toBe('a-building-this-build-does-not-have');
  });
});

describe('the load reading', () => {
  it('divides the population by the cars still working, and compares against the cited line', () => {
    const record = recordFor(midtown, 3, 2);
    const cars = midtown.banks.reduce((total, bank) => total + bank.cars.length, 0);
    const event = scheduledEventFor(NO_CALENDAR, 3, 2);
    const held = event.effect.carsOutOfService + (event.effect.derate?.cars ?? 0);
    const perCar = Math.round(midtown.totalPopulation / (cars - held));
    expect(record.load?.note).toContain(String(perCar).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    expect(record.load?.note).toContain(String(COMFORTABLE_PER_CAR));
    expect(record.load?.word).toBe(perCar <= COMFORTABLE_PER_CAR ? 'Comfortable' : 'Busy');
  });

  it('reads busier when a car goes out, on the same building and the same population', () => {
    const quiet = recordFor(midtown, 2, 1);
    const derated = recordFor(midtown, 3, 2);
    const perCarOf = (note: string): number =>
      Number((note.match(/^([\d,]+)/)?.[1] ?? '0').replace(/,/g, ''));
    expect(perCarOf(derated.load?.note ?? '')).toBeGreaterThan(perCarOf(quiet.load?.note ?? ''));
  });
});

describe('the rest of the record', () => {
  it('names the day and prints the seed line two players can compare', () => {
    const record = recordFor(midtown, 2, 1);
    expect(record.dayLabel).toBe('TUESDAY · DAY 2');
    expect(record.weekday).toBe('Tuesday');
    expect(record.seedLine).toBe('tower midtown-office · crowd 424242 · everyone identical');
  });

  it('asks what the day’s own goals ask, in `goalsForDay`’s order', () => {
    const record = recordFor(midtown, 5, 4);
    expect(record.asks).toEqual(goalsForDay(5).map((goal) => goal.label));
    expect(record.asks.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * The brief describes the building the run will use — GitHub issue #300
 * -------------------------------------------------------------------------- */

/**
 * The join, and it is the only thing in this file that builds a `ViewerState`.
 *
 * Everything above drives {@link todayOf} against a building handed straight in, which is the right
 * shape for asking whether the record composes correctly and the wrong shape for asking **which**
 * building it composed. Issue #300 was entirely the second question: every figure in the record was
 * a correct statement about `resolvedBuildingOf`'s answer, and `resolvedBuildingOf`'s answer was a
 * building the run was not going to use.
 *
 * So these cases go through the shipped chain on both sides — `resolvedBuildingOf` for the brief,
 * `shiftRunConfigOf` for the run — and require the two to agree. That is § D177's standing
 * requirement pointed at a caption instead of at a slider: not *"is the figure derived correctly"*
 * but *"is it derived from the thing the player is about to press"*.
 */

const IDS_300 = ['garden-apartments', 'midtown-office', 'chancery-house'] as const;

/**
 * Three buildings rather than `scope/probes.test-helper.ts`'s two, because the third is the one the
 * issue measured and a growth delta on Garden Apartments is fifteen people.
 */
function resources300(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const entries = IDS_300.map((id) => {
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

const RESOURCES_300 = resources300();

function stateOn(buildingId: string, day: number, calendar: CalendarPeriod | null = null): ViewerState {
  return {
    ...initialState(RESOURCES_300, 20_260_804n),
    buildingId,
    shiftLengthS: 900,
    calendar,
    week: { ...openWeek('c1'), day, dayIdx: day - 1 },
  };
}

/** The brief exactly as `briefScreen.ts` composes it: `todayOf` over `host.resolvedBuilding()`. */
function briefOn(state: ViewerState): ReturnType<typeof todayOf> {
  return todayOf({
    week: state.week,
    calendar: state.calendar,
    building: resolvedBuildingOf(RESOURCES_300, state),
    buildingId: state.buildingId,
    dispatcherName: 'Steady hand',
    goals: pendingGoals(state.week.day),
    seed: state.seed,
    units: 'metric',
  });
}

const factOn = (state: ViewerState, label: string): string | undefined =>
  briefOn(state).facts.find((fact) => fact.label === label)?.value;

describe('the brief describes the building the run will use — issue #300', () => {
  it('agrees with the run’s own building on every day of the week, on three buildings', () => {
    /*
     * The case the issue asked for, walking the whole week rather than the three days it measured.
     * Both figures the fabric can move are compared — `People`, which growth and the calendar
     * scale, and `Lifts`, which commissioning does — because a fix that closed one producer and
     * left another would pass a `People`-only walk and still put the wrong building on the screen.
     *
     * Compared against `groupThousands` of the run's own total rather than against a transcribed
     * number: a literal here would be a second copy of `data/`, stale the day a building is edited.
     */
    for (const buildingId of IDS_300) {
      for (const day of [1, 2, 3, 4, 5, 6, 7]) {
        const state = stateOn(buildingId, day);
        const run = shiftRunConfigOf(RESOURCES_300, state).building;
        const where = `${buildingId} day ${String(day)}`;
        expect(factOn(state, 'People'), where).toBe(groupThousands(run.totalPopulation));
        const cars = run.banks.reduce((total, bank) => total + bank.cars.length, 0);
        expect(factOn(state, 'Lifts'), where).toContain(String(cars));
      }
    }
  });

  it('and the week genuinely moves, so the walk above has teeth', () => {
    /*
     * The negative control. A `resolvedBuildingOf` that returned any *constant* building would pass
     * the walk if the run's own population never changed either — so this requires the thing being
     * tracked to be worth tracking. Seven distinct figures on `midtown-office`, which is the
     * building the issue's largest gap was measured on.
     */
    const seen = new Set(
      [1, 2, 3, 4, 5, 6, 7].map((day) => factOn(stateOn('midtown-office', day), 'People')),
    );
    expect(seen.size).toBe(7);
  });

  it('agrees under a calendar period too, where fixing growth alone would not', () => {
    /*
     * The second producer, and the larger one. `calendar.ts#calendarPatch` scales the same floors
     * through `growth.ts#scaledBuilding`, so before this fix `midtown-office` under
     * `public-holiday` read **1 710** on a run of **437** — a bigger gap than any growth day
     * produces. It is asserted here rather than left to the walk because the walk runs with no
     * period, and a fix that grew the building and stopped there would be green on it.
     */
    for (const period of Object.values(CALENDAR_PERIODS)) {
      for (const day of [1, 3, 5]) {
        const state = stateOn('midtown-office', day, periodOnDays(period, 1, 7));
        const run = shiftRunConfigOf(RESOURCES_300, state).building;
        expect(factOn(state, 'People'), `${period.id} day ${String(day)}`).toBe(
          groupThousands(run.totalPopulation),
        );
      }
    }
  });

  it('still reports the shipped population on a freshly switched building with no recording — issue #36', () => {
    /*
     * The clause the fix had to keep, and the reason *"always grow"* was the wrong answer. A player
     * who has just taken an assignment has moved `buildingId` and cleared the recording without
     * running anything; the week they land on is open at day 1, and what the brief owes them is the
     * building as `data/` ships it — not a population invented for a day that has not arrived.
     *
     * It holds **by construction rather than by a branch**: `growthFactor(1)` is exactly 1 and
     * `Math.round` is the identity on the integers `data/` declares, so day 1 with no calendar is
     * the shipped fabric. Pinned against `resources.entries`' own pre-resolved building — the exact
     * object the old implementation returned — so a future change that started growing day 1 fails
     * here rather than being noticed by a player.
     *
     * `towerName` is asserted beside it because that is #36's own defect: the new building's name
     * against the previous building's specs. Both must name the same building.
     */
    for (const buildingId of IDS_300) {
      const state = { ...stateOn(buildingId, 1), recording: undefined };
      const shipped = RESOURCES_300.entries.find((entry) => entry.config.id === buildingId)?.resolved;
      expect(shipped, buildingId).toBeDefined();
      expect(factOn(state, 'People'), buildingId).toBe(
        groupThousands(shipped?.totalPopulation ?? -1),
      );
      expect(briefOn(state).towerName, buildingId).toBe(shipped?.name);
    }
  });

  it('answers `undefined` for an id this build has no document for, as it always has', () => {
    // The totality clause. `shiftRunConfigOf` throws on this id rather than returning an answer, so
    // the lookup guard in front of it is load-bearing and not a shortcut.
    const state = stateOn('a-building-this-build-does-not-have', 3);
    expect(resolvedBuildingOf(RESOURCES_300, state)).toBeUndefined();
    expect(briefOn(state).facts).toEqual([]);
  });
});
