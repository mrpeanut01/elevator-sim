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

import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';

import type { BrowserResources } from '../dev/data.js';
import { initialState, resolvedBuildingOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import type { CalendarPeriod } from '../shift/calendar.js';
import { CALENDAR_PERIODS, periodOnDays, scheduledEventFor } from '../shift/calendar.js';
import type { ShiftEvent } from '../shift/types.js';
import { carsToDerate } from '../shift/incidents.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import type { GoalReading, WeekState } from '../shift/types.js';
import { ladderRowFor, ladderTowerConfig, rungFor } from '../shift/ladder.js';
import { openWeek } from '../shift/week.js';

import { EM_DASH, groupThousands } from './figures.js';
import { todayOf } from './today.js';

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
    // The overlap and the run's own horizon that § D417 binds every publisher of
    // `abandoned` to carry, and `goals.ts#gaveUpBesideOf` reads (GitHub issue #456).
    abandonedCarried: 0,
    horizonS: 900,
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
    crowdIsToday: true,
    firstSession: false,
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
    /*
     * A day whose wrinkle holds no car has no strip to draw. The day is **found rather than
     * pinned** — GitHub issue #159: this named day 2, which was `ordinary` under the `day % 5`
     * rota, and § 17's rotation draw over `data/wrinkles.json` decides which day is which now.
     */
    const quiet = weekdayWhere((event) => holdOf(event) === 0);
    const ordinary = recordFor(midtown, quiet.day, quiet.dayIdx);
    expect(ordinary.outOfService).toBeUndefined();
  });
});

/** Cars a wrinkle takes off the group, whole-shift holds and timed derates alike. */
function holdOf(event: ShiftEvent): number {
  return event.effect.carsOutOfService + (event.effect.derate?.cars ?? 0);
}

/**
 * The first weekday inside a month whose own wrinkle satisfies `wanted`.
 *
 * Days are **found rather than named** since GitHub issue #159. These cases used to say *day 2 is
 * ordinary* and *day 3 is the move-in*, which were facts about the `day % 5` rota; § 17's rotation
 * draw decides now, and a fixture that names a day goes stale on every library edit. Throws rather
 * than skipping if no such day exists, because a suite that quietly stopped checking the strip is
 * worse than one that fails.
 */
function weekdayWhere(wanted: (event: ShiftEvent) => boolean): { day: number; dayIdx: number } {
  for (let day = 1; day <= 40; day += 1) {
    const dayIdx = (day - 1) % 7;
    if (dayIdx >= 5) continue;
    if (wanted(scheduledEventFor(NO_CALENDAR, day, dayIdx))) return { day, dayIdx };
  }
  throw new Error('no weekday inside 40 days draws a wrinkle matching the fixture’s need');
}

describe('the badge names the car the run actually holds', () => {
  it('is `carsToDerate`’s own choice, so the brief and the kernel cannot disagree', () => {
    // A day whose wrinkle holds a car — found, not pinned, for the reason above.
    const busy = weekdayWhere((event) => holdOf(event) > 0);
    const held = holdOf(scheduledEventFor(NO_CALENDAR, busy.day, busy.dayIdx));
    const record = recordFor(midtown, busy.day, busy.dayIdx);
    const choice = carsToDerate(midtown, held);
    expect(record.outOfService?.badge).toBe(choice.held.map((car) => car.carId).join(' · '));
  });

  it('defers to the event’s own note for *when*, rather than restating a duration', () => {
    const busy = weekdayWhere((event) => holdOf(event) > 0);
    const record = recordFor(midtown, busy.day, busy.dayIdx);
    expect(record.outOfService?.sentence).toContain(
      scheduledEventFor(NO_CALENDAR, busy.day, busy.dayIdx).note,
    );
  });
});

/**
 * One more building beside the three {@link resources300} loads, resolved the way `dev/data.ts`
 * resolves them. Named by the caller rather than listed, so a case that needs a fourth tower does
 * not widen the fixture every other case runs against.
 */
function resourcesWith(id: string): BrowserResources {
  const config = parseBuilding(read(`buildings/${id}.json`));
  const resolved = resolveBuilding(config, RESOURCES_300.elevatorSpecs);
  return {
    ...RESOURCES_300,
    buildings: [...RESOURCES_300.buildings, resolved],
    entries: [...RESOURCES_300.entries, { file: `${id}.json`, config, resolved }],
  };
}

describe('the tower’s own booked absence reaches the strip — issue #576, § D871', () => {
  /**
   * The run's building rather than the authored one, which is the whole of what makes the strip
   * true: `resolvedBuildingOf` is `shiftRunConfigOf(...).building`, so a rung that books a car out
   * is already on the document this record reads. A fixture built from `buildings/crown-hotel.json`
   * would have described a tower the player is not running.
   */
  function crownDayOne(): ReturnType<typeof todayOf> {
    const resources = resourcesWith('crown-hotel');
    const state: ViewerState = {
      ...initialState(resources, 424_242n),
      buildingId: 'crown-hotel',
      dispatcherId: 'collective',
      shiftLengthS: 1800,
      campaignEventId: 'ordinary',
      week: { ...openWeek('c7'), day: 1, dayIdx: 0 },
    };
    const building = resolvedBuildingOf(resources, state);
    if (building === undefined) throw new Error('crown-hotel did not resolve');
    return todayOf({
      week: state.week,
      calendar: NO_CALENDAR,
      building,
      buildingId: 'crown-hotel',
      dispatcherName: 'Steady hand',
      goals: pendingGoals(1),
      seed: state.seed,
      crowdIsToday: true,
      firstSession: false,
      units: 'metric',
    });
  }

  it('names the car the rung books out, on a day whose wrinkle holds none', () => {
    const record = crownDayOne();
    const declared = ladderRowFor('c7')?.fabric.incidents[0];
    expect(declared, 'c7 declares the absence this case is about').toBeDefined();
    expect(record.outOfService?.badge).toBe(declared?.carId);
    expect(record.outOfService?.sentence).toContain(`Car ${declared?.carId ?? ''} is booked out`);
  });

  it('says it comes back, because this one does — and publishes no figure for when', () => {
    const record = crownDayOne();
    const sentence = record.outOfService?.sentence ?? '';
    expect(sentence).toContain('comes back before the end');
    expect(sentence).not.toContain('does not come back');
    /*
     * No digit anywhere in it. The strip is drawn before the run, so an instant printed here would
     * be a figure whose only source is a schedule the reader cannot see — `landingView.test.ts`'s
     * rule, applied to the one sentence on this screen that describes something the run has not
     * done yet.
     */
    expect(/\d/u.test(sentence), sentence).toBe(false);
  });

  it('is silent on a tower whose rung books nothing', () => {
    // The negative control: the same code path, a contract with no declared absence, no strip.
    const quiet = weekdayWhere((event) => holdOf(event) === 0);
    expect(recordFor(midtown, quiet.day, quiet.dayIdx).outOfService).toBeUndefined();
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
    // A day with every car working, found rather than named — issue #159, as above.
    const whole = weekdayWhere((event) => holdOf(event) === 0);
    const record = recordFor(garden, whole.day, whole.dayIdx);
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
      crowdIsToday: true,
      firstSession: false,
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
  it('divides the population by the cars still working, and grades nothing — docs/35 PM-TT1, § D514', () => {
    const record = recordFor(midtown, 3, 2);
    const cars = midtown.banks.reduce((total, bank) => total + bank.cars.length, 0);
    const event = scheduledEventFor(NO_CALENDAR, 3, 2);
    const held = event.effect.carsOutOfService + (event.effect.derate?.cars ?? 0);
    const perCar = Math.round(midtown.totalPopulation / (cars - held));
    expect(record.load?.word).toBe(`${String(perCar).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} per working car`);
    expect(record.load?.note).toContain(`${String(cars - held)} working cars today, as the building is configured`);
    /* The verdict words are gone: a plate at t = 0 has no day to grade. */
    for (const text of [record.load?.word ?? '', record.load?.note ?? '']) {
      expect(text).not.toMatch(/comfortable is around|\bBusy\b/u);
    }
  });

  it('reads busier when a car goes out, on the same building and the same population', () => {
    /*
     * One day with every car, one with a car out — both found rather than named, issue #159. This
     * read `(2, 1)` against `(3, 2)`, which were `ordinary` and `move-in` under the `day % 5` rota.
     * § 17's draw put a derate on day 2 and a demand-only wrinkle on day 3, so the pair inverted
     * and the case failed for a reason that had nothing to do with the load reading.
     */
    const wholeDay = weekdayWhere((event) => holdOf(event) === 0);
    const shortDay = weekdayWhere((event) => holdOf(event) > 0);
    const quiet = recordFor(midtown, wholeDay.day, wholeDay.dayIdx);
    const derated = recordFor(midtown, shortDay.day, shortDay.dayIdx);
    const perCarOf = (word: string): number =>
      Number((word.match(/^([\d,]+)/)?.[1] ?? '0').replace(/,/g, ''));
    expect(perCarOf(derated.load?.word ?? '')).toBeGreaterThan(perCarOf(quiet.load?.word ?? ''));
  });
});

describe('the rest of the record', () => {
  it('names the day and prints the seed line two players can compare', () => {
    const record = recordFor(midtown, 2, 1);
    expect(record.dayLabel).toBe('TUESDAY · DAY 2');
    expect(record.weekday).toBe('Tuesday');
    expect(record.seedLine).toBe(
      'tower midtown-office · crowd 424242 · today’s date, so everyone playing today meets this crowd',
    );
  });

  it('refuses the shared-crowd claim on a run whose crowd is not the day’s', () => {
    /*
     * § D730. The arm a `?seed=` deep link draws, and the arm a session left open across UTC
     * midnight draws. A line that said *everyone playing today meets this crowd* over either would
     * be § D729's defect surviving inside its own repair — so the claim is conditional, and the
     * refusing arm is a fact the player wants rather than a hedge: nothing is comparing this run.
     */
    const own = todayOf({
      week: weekOn(2, 1),
      calendar: NO_CALENDAR,
      building: midtown,
      buildingId: midtown.id,
      dispatcherName: 'Steady hand',
      goals: pendingGoals(2),
      seed: 424_242n,
      crowdIsToday: false,
      firstSession: false,
      units: 'metric',
    });
    expect(own.seedLine).toBe('tower midtown-office · crowd 424242 · a crowd of this run’s own, not the day’s');
    expect(own.seedLine).not.toContain('everyone');
    expect(own.crowdIsToday).toBe(false);
    expect(recordFor(midtown, 2, 1).crowdIsToday).toBe(true);
  });

  it('keeps the lede off the question of who else is playing', () => {
    /*
     * The lede read *“Everyone runs the same building on the same crowd”* and **neither half was
     * true** — the crowd was `crypto.getRandomValues` and the building is still the one this
     * player's own week was opened on (§ D730). The claim lives on the seed line, which can
     * condition it; what is left here is the half that holds on every day and every tower.
     */
    const lede = recordFor(midtown, 2, 1).lede;
    expect(lede).toContain('The only thing you choose is who drives.');
    expect(lede).not.toContain('Everyone');
    expect(lede).not.toContain('same crowd');
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
    priceSchedule: shippedPriceSchedule(),
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
    crowdIsToday: true,
    firstSession: false,
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
      const entry = RESOURCES_300.entries.find((candidate) => candidate.config.id === buildingId);
      const shipped = entry?.resolved;
      expect(shipped, buildingId).toBeDefined();
      /*
       * **The tower the scenario hands over, which on all but one building is the shipped one** —
       * GitHub issue #382. `shift/ladder.ts` lets a contract's own building at a declared occupancy,
       * so the brief for the contract you are on owes you *that* tower and not `data/`'s: a card
       * reading 120 people over a run with 235 is the caption defect this file exists to catch, one
       * mechanism along. The clause #36 pinned is unchanged and is what the `rungFor` guard below
       * keeps: a building the state's contract does not run is the shipped fabric exactly.
       */
      const rung = rungFor(state.week.contractId, buildingId);
      const expected =
        rung === undefined
          ? shipped
          : resolveBuilding(
              parseBuilding(
                ladderTowerConfig(
                  entry?.config as never,
                  rung.contractId,
                  RESOURCES_300.elevatorSpecs,
                ) as unknown,
              ),
              RESOURCES_300.elevatorSpecs,
            );
      expect(factOn(state, 'People'), buildingId).toBe(
        groupThousands(expected?.totalPopulation ?? -1),
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
