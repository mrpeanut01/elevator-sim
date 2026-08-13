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
  parseElevatorSpecs,
  resolveBuilding,
  type ResolvedBuilding,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { scheduledEventFor } from '../shift/calendar.js';
import { carsToDerate } from '../shift/incidents.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import type { GoalReading, WeekState } from '../shift/types.js';
import { openWeek } from '../shift/week.js';

import { EM_DASH } from './figures.js';
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
