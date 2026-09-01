/**
 * **One day record, and the four screens that narrate it** — GAMEPLAY § 16 rule 14.
 *
 * > One day record narrates everything. The wrinkle, the occupancy, the works, the cars out of
 * > service and the calendar's marks come from one object, and the brief, the stage, the report
 * > and the calendar all read it. A sim strip saying *vacation week · 70 of 120 people in* while
 * > the report says *nothing booked* is the same defect class as two disagreeing numbers.
 *
 * So the door and the brief do not each ask `shift/events.ts` what today is. They ask this module
 * once, and it asks `shift/` once: {@link todayOf} is a pure function of the week, the resolved
 * building, the goal readings and the seed, and everything either screen says about *today* comes
 * out of the {@link TodayRecord} it returns.
 *
 * ## Where each field comes from, since none of them is authored here
 *
 * - the **wrinkle** is `shift/calendar.ts#scheduledEventFor(period, day, dayIdx)`'s own `name` and
 *   `note`, quoted. **Through the calendar, never `events.ts#eventFor` directly** — that is issue
 *   #135's whole finding: `eventFor` is the *ordinary schedule*, a calendar period may overrule it
 *   (`moving-week` books a move-in on six of its seven days), and four surfaces that asked the
 *   ordinary schedule told players something the run then contradicted. `eventSeam.test.ts` derives
 *   every caller from disk and refuses a sixth, which is how this module found out on its first
 *   run rather than on a `moving-week` Tuesday;
 * - the **car out of service** is `shift/incidents.ts#carsToDerate`, the same total order the
 *   run itself uses, so the badge on the brief names the car the kernel actually holds — a second
 *   rule for *which car* would be two surfaces disagreeing about today, which is the whole of
 *   rule 14;
 * - the **facts** are `ResolvedBuilding`'s, which is what `resolveBuilding` counted arrivals
 *   against, never `BuildingConfig`'s declared totals;
 * - **what today asks** is `shift/goals.ts`'s bars for this day, read through the host — the same
 *   four the left rail grades and the report prints;
 * - the **seed line** is `ViewerState.seed`, printed so two players can confirm they had the same
 *   morning (§ 6's own reason for the line existing).
 *
 * ## The one derivation this module owns, and its citation
 *
 * The load reading — § 6.2's *Busy · 590 people per working car this morning. Comfortable is
 * around 400.* The **figure** is arithmetic over facts (`totalPopulation ÷ working cars`). The
 * **comparison** is the prototype's authored sentence (`docs/design/elevator-sim-casual.dc.html`,
 * `loadNote`), and it is the only number in this file that is neither measured nor derived. It is
 * carried as {@link COMFORTABLE_PER_CAR} with that citation rather than inlined, and it buys
 * exactly **two** words — at or under it reads *Comfortable*, above it reads *Busy* — because a
 * third band would need a second boundary this repository has not measured, and inventing one
 * would be a claim wearing a threshold. The prototype's own example lands on *Busy* at 590, which
 * is the check that the two-band rule reproduces the design rather than replacing it.
 */

import type { ResolvedBuilding } from '@elevator-sim/core/browser';

import type { CalendarPeriod } from '../shift/calendar.js';
import { scheduledEventFor } from '../shift/calendar.js';
import { carsToDerate } from '../shift/incidents.js';
import type { GoalReading, ShiftEvent, WeekState, Weekday } from '../shift/types.js';
import { weekdayOf } from '../shift/types.js';

import { countFigure, EM_DASH, groupThousands } from './figures.js';
import { speedFigure, type EverydayUnits } from './units.js';

/**
 * People per working car at which § 6.2's tinted panel stops saying *Busy* — the prototype's
 * *"Comfortable is around 400"*, and the module docstring's argument for why it is a citation
 * rather than a measurement.
 */
export const COMFORTABLE_PER_CAR = 400;

/** § 6.2's out-of-service strip: the lettered badge, and the sentence beside it. */
export interface OutOfServiceStrip {
  /** The car the run actually holds — `carsToDerate`'s choice, not a guess. */
  readonly badge: string;
  readonly sentence: string;
}

/** One row of § 6.2's five facts. */
export interface TodayFact {
  readonly label: string;
  readonly value: string;
}

/** § 6.2's tinted load panel. */
export interface TodayLoad {
  /** *Comfortable* or *Busy* — see the module docstring for why there is no third word. */
  readonly word: string;
  /** *590 people per working car this morning. Comfortable is around 400.* */
  readonly note: string;
}

/**
 * Today, as one value. Everything the door and the brief say about the day comes from here.
 *
 * Nothing on it is optional-because-unknown: a field that cannot be stated is stated as
 * {@link EM_DASH} or as `undefined` with a named meaning, never as a stand-in.
 */
export interface TodayRecord {
  /** 1-based, `WeekState.day`. */
  readonly day: number;
  readonly weekday: Weekday;
  /** `TUESDAY · DAY 2` — the eyebrow both screens carry. */
  readonly dayLabel: string;
  /** The building's own name, or its id when this build does not know the document. */
  readonly towerName: string;
  /** § 6.1's lede: the building in words a stranger understands. */
  readonly lede: string;
  /** The day's event, quoted — total, because `scheduledEventFor` falls through to the schedule. */
  readonly wrinkle: ShiftEvent;
  /** § 6.2's strip, or `undefined` on a day that holds no car. */
  readonly outOfService: OutOfServiceStrip | undefined;
  /** § 6.2's five rows. Shorter when the building document could not be resolved. */
  readonly facts: readonly TodayFact[];
  /** § 6.2's tinted panel, or `undefined` with no building to divide. */
  readonly load: TodayLoad | undefined;
  /** *What today asks* — the goal labels, in the order the rail and the report read them. */
  readonly asks: readonly string[];
  /** `tower chancery-house · crowd 424242 · everyone identical`. */
  readonly seedLine: string;
  /** Who drives, by name — or the em dash when the standing selection resolves to nothing. */
  readonly driver: string;
}

/** What {@link todayOf} needs. Every field is somebody else's fact, read rather than recomputed. */
export interface TodayInput {
  readonly week: WeekState;
  /**
   * The calendar period the week is under, or `null` for none — `ViewerState.calendar`.
   *
   * Required rather than optional, and that is issue #135's lesson written into a signature: an
   * optional period would default to `null`, every caller that forgot it would silently get the
   * *ordinary* schedule, and the surface would describe a day the run is not running. The one
   * thing that cost was four surfaces disagreeing with the simulation for a whole release.
   */
  readonly calendar: CalendarPeriod | null;
  /** `dev/state.ts#resolvedBuildingOf` — `undefined` when the id names no document this build has. */
  readonly building: ResolvedBuilding | undefined;
  /** The standing selection's id, so the seed line can name a building the document lookup missed. */
  readonly buildingId: string;
  /** The standing dispatcher's display name, or `undefined`. */
  readonly dispatcherName: string | undefined;
  /** `host.goalsToday()` — pending before a run, which is what *what today asks* wants. */
  readonly goals: readonly GoalReading[];
  readonly seed: bigint;
  /**
   * How machine specifications read — § 15.1's `Units` row, GitHub issue #170,
   * [§ D448](../../../../DECISIONS.md).
   *
   * **Required rather than optional, and for the same reason `calendar` is.** An optional
   * preference would default to metres, every caller that forgot it would silently draw metres,
   * and the *Rated speed* fact would go on reading `m/s` for a player who had asked for feet —
   * which is § D227's stale claim arriving through a default instead of through a sentence.
   *
   * **Presentation only.** This record is a description of the day; nothing derived from this
   * field reaches the run, and everything it touches below is a string.
   */
  readonly units: EverydayUnits;
}

/** How many cars the building has, across every bank. A double-deck car is one car. */
function carCountOf(building: ResolvedBuilding): number {
  return building.banks.reduce((total, bank) => total + bank.cars.length, 0);
}

/**
 * How many cars stand out today — the event's own two mechanisms, added.
 *
 * `carsOutOfService` is *not in the building today* and `derate.cars` is *away for part of it*;
 * § 6.2's strip is about a car a player will not have at the start of the morning, which is both.
 * Their sum is what the brief warns about, and `shift/events.ts` keeps them apart for the run.
 */
function carsHeldBy(event: ShiftEvent): number {
  return event.effect.carsOutOfService + (event.effect.derate?.cars ?? 0);
}

/**
 * The strip, or nothing. The badge is the held car's own id — `carsToDerate`'s first choice, which
 * is the same car the run holds, because it is the same call.
 */
function outOfServiceOf(
  building: ResolvedBuilding | undefined,
  event: ShiftEvent,
): OutOfServiceStrip | undefined {
  const held = carsHeldBy(event);
  if (held === 0 || building === undefined) return undefined;
  const choice = carsToDerate(building, held);
  const first = choice.held[0];
  if (first === undefined) return undefined;
  const names = choice.held.map((car) => car.carId);
  const badge = names.join(' · ');
  /*
   * The event's note says *when* — *"for the first two thirds of the shift"*, *"for the whole
   * shift"* — and it says it in the design's words. This sentence names the car and defers to that
   * note rather than restating a duration it would then own a second copy of.
   */
  const which = names.length === 1 ? `Car ${first.carId} is` : `Cars ${badge} are`;
  return { badge, sentence: `${which} out of service today. ${event.note}` };
}

/** § 6.2's five rows, from the resolved building. Empty when there is no document to read. */
function factsOf(
  building: ResolvedBuilding | undefined,
  held: number,
  units: EverydayUnits,
): readonly TodayFact[] {
  if (building === undefined) return [];
  const cars = carCountOf(building);
  const working = Math.max(0, cars - held);
  const speeds = building.banks.flatMap((bank) => bank.cars.map((car) => car.ratedSpeedMps));
  const capacities = building.banks.flatMap((bank) =>
    bank.cars.map((car) => car.designCapacityPersons),
  );
  const smallest = capacities.length === 0 ? undefined : Math.min(...capacities);
  return [
    { label: 'Floors', value: `${String(building.floors.length)} above ground` },
    { label: 'People', value: groupThousands(building.totalPopulation) },
    {
      label: 'Lifts',
      value:
        held === 0
          ? String(cars)
          : `${String(cars)} · ${String(held)} out today`,
    },
    {
      /*
       * § 6.2: *"Capacity is always paired with the crowd it must clear; the bare number means
       * nothing."* So the pair is the car's own design load and what the **working** group can
       * lift in one trip — which is the figure that moves when a car goes out, and the reason the
       * row is next to the one above it.
       *
       * Design load rather than rated: CLAUDE.md's modelling rule is that cars fill to 80 % of
       * rated capacity, and `designCapacityPersons` is `core`'s own application of it. Quoting the
       * rated figure here would make the brief promise a car a simulated crowd never fills.
       */
      label: 'Each car holds',
      value:
        smallest === undefined
          ? EM_DASH
          : `${String(smallest)} · ${String(smallest * working)} a trip with ${String(working)} working`,
    },
    {
      /*
       * The one machine specification on the daily loop, so it is the one row § 13's `Units`
       * preference reaches here (GitHub issue #170, § D448). The **fastest** car, which is what a
       * spec sheet leads with and what `shift/contracts.ts#statLineOf` quotes for the same reason.
       */
      label: 'Rated speed',
      value: speeds.length === 0 ? EM_DASH : speedFigure(Math.max(...speeds), units),
    },
  ];
}

/** § 6.2's tinted panel. `undefined` with no building, or with no car left to divide by. */
function loadOf(building: ResolvedBuilding | undefined, held: number): TodayLoad | undefined {
  if (building === undefined) return undefined;
  const working = Math.max(0, carCountOf(building) - held);
  if (working === 0) return undefined;
  const perCar = Math.round(building.totalPopulation / working);
  return {
    word: perCar <= COMFORTABLE_PER_CAR ? 'Comfortable' : 'Busy',
    note:
      `${countFigure(perCar)} people per working car today. Comfortable is around ` +
      `${countFigure(COMFORTABLE_PER_CAR)}.`,
  };
}

/**
 * § 6.1's lede — the building in words a stranger understands, composed from its own facts.
 *
 * Composed rather than authored, because the prototype's lede is a sentence about Chancery House
 * specifically (*"Fourteen floors, eleven hundred people and three lifts…"*) and this build runs
 * eight buildings. What is kept from it is the shape: what is here, how many people, how many
 * lifts, and then the one sentence that is true of every day — the tower is the same for everyone
 * and the dispatcher is the only variable.
 */
function ledeOf(building: ResolvedBuilding | undefined, event: ShiftEvent, held: number): string {
  if (building === undefined) {
    return (
      'This build does not have the document for the building the run is set to, so nothing below ' +
      'describes it. Pick another building on the simulator’s own surface and the door fills in.'
    );
  }
  const cars = carCountOf(building);
  const working = Math.max(0, cars - held);
  const lifts =
    held === 0
      ? `${String(cars)} lifts`
      : `${String(cars)} lifts, ${String(cars - working)} of them out today`;
  return (
    `${String(building.floors.length)} floors, ` +
    `${groupThousands(building.totalPopulation)} people and ${lifts}. ` +
    `${event.name}: ${event.note} ` +
    'Everyone runs the same building on the same crowd. The only thing that differs is who you ' +
    'put in charge of the lifts.'
  );
}

/** Today, from the week and the building. Pure and total: every arm answers something drawable. */
export function todayOf(input: TodayInput): TodayRecord {
  const { week, building } = input;
  const weekday = weekdayOf(week.dayIdx);
  const event = scheduledEventFor(input.calendar, week.day, week.dayIdx);
  const held = carsHeldBy(event);
  return {
    day: week.day,
    weekday,
    dayLabel: `${weekday.toUpperCase()} · DAY ${String(week.day)}`,
    towerName: building?.name ?? input.buildingId,
    lede: ledeOf(building, event, held),
    wrinkle: event,
    outOfService: outOfServiceOf(building, event),
    facts: factsOf(building, held, input.units),
    load: loadOf(building, held),
    asks: input.goals.map((reading) => reading.goal.label),
    seedLine: `tower ${input.buildingId} · crowd ${input.seed.toString()} · everyone identical`,
    driver: input.dispatcherName ?? EM_DASH,
  };
}
