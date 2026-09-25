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
 * ## The plate is configuration, and it stopped grading the day on 2026-09-06
 *
 * § 6.2's tinted panel used to read *Busy · 590 people per working car this morning. Comfortable is
 * around 400*, with the 400 a citation to the prototype (`docs/design/elevator-sim-casual.dc.html`,
 * `loadNote`) rather than a measurement. `docs/35` `PM-TT1` names what that is: a whole-day verdict
 * drawn at `t = 0`, on a screen whose whole point is that the day has not run yet — and § D514 took
 * the row's second option, *reword it as configuration*. The **figure** is still arithmetic over
 * facts (`totalPopulation ÷ working cars`); the **comparison** is gone, and the plate says in its
 * own words that whether the crowd is comfortable is the day's to show. GitHub issue #208.
 */

import type { ResolvedBuilding } from '@elevator-sim/core/browser';

import { bookedOutCarsOf, wrinkleNoteOf } from '../shift/bookedOut.js';
import type { CalendarPeriod } from '../shift/calendar.js';
import { scheduledEventFor } from '../shift/calendar.js';
import { firstSessionLineFor } from '../shift/firstSession.js';
import { carsToDerate } from '../shift/incidents.js';
import { pressDayStanding } from '../shift/ladder.js';
import type { GoalReading, RunHorizon, ShiftEvent, WeekState, Weekday } from '../shift/types.js';
import { weekdayOf } from '../shift/types.js';

import { countFigure, EM_DASH, groupThousands } from './figures.js';
import { speedFigure, type EverydayUnits } from './units.js';

/** § 6.2's out-of-service strip: the lettered badge, and the sentence beside it. */
export interface OutOfServiceStrip {
  /**
   * The cars the run actually loses, joined — `carsToDerate`'s choice for the day's wrinkle and the
   * tower's own booked absences beside it ([§ D871](../../../../DECISIONS.md)), never a guess at
   * either.
   */
  readonly badge: string;
  /** One sentence per cause, joined. See {@link outOfServiceOf} for why they are not merged. */
  readonly sentence: string;
  /**
   * **Which standing orders make today's question go away** — GitHub issue #587,
   * [§ D914](../../../../DECISIONS.md). `undefined` on every day that is not a pinned one.
   *
   * A playability assessor swept § D871's day across all thirteen shipped dispatchers and found
   * **eight of them clear it as built, with no press at all**. Changing the standing order is a
   * control on the brief, one screen from this strip, so a player could answer the day by moving a
   * `<select>` and never learn that the day had a question in it — and the product said nothing.
   *
   * It is drawn **only on the day the census was measured on**: `ContractPressDay` pins a seed, and
   * {@link mootSentenceOf} refuses to draw unless the week's contract, its day, its crowd, its
   * wrinkle, its calendar and the horizon the press will run are all that day's (the last three since
   * GitHub issue #595, [§ D973](../../../../DECISIONS.md)). A sentence about *this* day's dispatchers, drawn over a different crowd, would
   * be a measurement quoted about a run it was not taken on — which is the class
   * [§ D227](../../../../DECISIONS.md) is about, arriving through a cache of a different kind.
   */
  readonly mootUnder: string | undefined;
}

/** One row of § 6.2's five facts. */
export interface TodayFact {
  readonly label: string;
  readonly value: string;
}

/** § 6.2's tinted load panel, as configuration rather than a verdict — see the module docstring. */
export interface TodayLoad {
  /** *60 per working car* — the figure, and no word beside it. */
  readonly word: string;
  /** *120 people and 2 working cars today, as the building is configured. …* */
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
  /**
   * The wrinkle's note **as the brief prints it** — `shift/bookedOut.ts#wrinkleNoteOf`, GitHub issue
   * #596 item 3, [§ D983](../../../../DECISIONS.md).
   *
   * `wrinkle.note` verbatim on a day the tower books nothing. On a day it does, the ordinary day's
   * *Nothing booked* is replaced rather than printed beside {@link outOfService}'s strip saying a car
   * is booked out — which is what all four assessors of the post-wave-AG panel saw — and any other
   * event's note is followed by one sentence naming the car. The Day report's header prints the same
   * sentence from the same function, so the brief and the sheet cannot disagree about the day.
   */
  readonly wrinkleNote: string;
  /** § 6.2's strip, or `undefined` on a day that holds no car. */
  readonly outOfService: OutOfServiceStrip | undefined;
  /**
   * The cars that are **not in the building at all today** — the day's wrinkle's holds, and only
   * those ([§ D871](../../../../DECISIONS.md)).
   *
   * A field rather than a count recovered from {@link OutOfServiceStrip.badge}, and the correction
   * is the reason it exists. `briefScreen.ts` drew the tower's elevation with
   * `carsToDerate(building, badge.split(' · ').length)` — which was right while the badge held
   * exactly the wrinkle's cars and became wrong the moment it could also hold one the *tower* books
   * out mid-shift: on Crown Hotel the strip names car `D` and `carsToDerate(building, 1)` answers
   * car `S`, so the picture would have greyed a lift the sentence beside it does not name.
   *
   * And the deeper half: a car booked out at half past eight **is running when the day opens**, so
   * an elevation drawn for the first frame must not grey it at all. This field is *whole-day*
   * holds by construction, which is the question that picture is asking.
   */
  readonly heldCarIds: readonly string[];
  /** § 6.2's five rows. Shorter when the building document could not be resolved. */
  readonly facts: readonly TodayFact[];
  /** § 6.2's tinted panel, or `undefined` with no building to divide. */
  readonly load: TodayLoad | undefined;
  /** *What today asks* — the goal labels, in the order the rail and the report read them. */
  readonly asks: readonly string[];
  /**
   * `tower chancery-house · crowd 20260919 · today’s date, so everyone’s crowd`, or the arm
   * beside it — {@link crowdIsToday} decides which, and both are true of the state they draw on.
   */
  readonly seedLine: string;
  /**
   * Whether this run’s crowd is the one every player has today —
   * `shift/dailySeed.ts#isDailySeed`, asked by the caller because only the caller has a clock.
   *
   * Echoed onto the record rather than re-derived, because three screens state the claim — this
   * module’s seed line, the door’s closing sentence and the brief’s LOCKED FOR SCORE card — and
   * two of them reading a different answer from the third is exactly the `surfaces-disagree` shape
   * the honesty corpus exists for. § 16 rule 14 in one field: one day record narrates everything.
   */
  readonly crowdIsToday: boolean;
  /**
   * `shift/firstSession.ts`'s line on a first day nobody has played on a legible tower, or
   * `undefined` on every other day — GitHub issue #208, § D514.
   */
  readonly firstSessionLine: string | undefined;
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
  /**
   * Whether this is a first day nobody has played on one of § D475's legible towers —
   * `shift/firstSession.ts#isFirstDayOnALegibleTower` over the week, asked by the caller because
   * it is a fact about the week rather than about today. Required, `calendar`'s own reason.
   */
  readonly firstSession: boolean;
  /** `dev/state.ts#resolvedBuildingOf` — `undefined` when the id names no document this build has. */
  readonly building: ResolvedBuilding | undefined;
  /** The standing selection's id, so the seed line can name a building the document lookup missed. */
  readonly buildingId: string;
  /** The standing dispatcher's display name, or `undefined`. */
  readonly dispatcherName: string | undefined;
  /**
   * Any shipped dispatcher's display name, by id — `host.dispatcherById(id)?.name`.
   *
   * Required rather than optional, {@link TodayInput.calendar}'s own reason one field over: an
   * optional lookup would default to *no names*, every caller that forgot it would silently draw no
   * moot sentence, and the one day whose question a standing order can erase would go back to
   * saying nothing. A caller with no profile shelf passes `() => undefined`, which draws the ids —
   * visibly wrong rather than invisibly absent.
   */
  readonly dispatcherNameOf: (id: string) => string | undefined;
  /** `host.goalsToday()` — pending before a run, which is what *what today asks* wants. */
  readonly goals: readonly GoalReading[];
  readonly seed: bigint;
  /**
   * **The horizon the next run press will run this tower on** — `host.scenarioHorizon()`, GitHub
   * issue #595, [§ D973](../../../../DECISIONS.md).
   *
   * Required, {@link TodayInput.calendar}'s reason: the moot sentence quotes a census taken on one
   * horizon, and the same seed run on the other is a different day. A caller that forgot this would
   * default to *whatever the pin says*, which is the defect — § D914's five office pins were taken
   * on a thirty-minute slice while the Scenario press runs those towers ten hours long, and the
   * sentence was drawn over the whole day on the seed alone.
   */
  readonly horizon: RunHorizon | undefined;
  /**
   * Whether {@link seed} is the day’s crowd — `shift/dailySeed.ts#isDailySeed(seed, nowMs)`,
   * asked by the caller and passed in.
   *
   * **Required rather than optional, `calendar`’s own reason**, and the default it would have taken
   * is the dangerous one: `true` would restore § D729’s defect inside its own fix, on every caller
   * that forgot the field. This module has no clock and may not have one — `shift/deviceDate.ts` is
   * the package’s single calendar seam — so the question cannot be answered here.
   *
   * Two ordinary states answer `false`: a `?seed=` deep link, which is the reader’s own choice and
   * wins over the opening state; and a session left open across UTC midnight, which is why the
   * caller asks at render time rather than latching it at boot.
   */
  readonly crowdIsToday: boolean;
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
 * Cars this **tower's own schedule** takes out of passenger service after the day has started —
 * `shift/ladder.ts#ContractFabric.incidents`, [§ D871](../../../../DECISIONS.md).
 *
 * The reading is `shift/bookedOut.ts#bookedOutCarsOf` since [§ D983](../../../../DECISIONS.md),
 * moved there so the wrinkle card, the Day report's header and the stage read one expression rather
 * than three. Read off `building.serviceEvents` of the run's own building, which is what makes the
 * strip name the car the kernel will actually stand down.
 */
function scheduledAwayOf(
  building: ResolvedBuilding | undefined,
): readonly { readonly carId: string; readonly returns: boolean }[] {
  return bookedOutCarsOf(building).map((car) => ({ carId: car.carId, returns: car.backAtS !== null }));
}

/**
 * The strip, or nothing. The badge is the held car's own id — `carsToDerate`'s first choice, which
 * is the same car the run holds, because it is the same call.
 *
 * **Two kinds of absence, one strip** — [§ D871](../../../../DECISIONS.md). The day's wrinkle may
 * hold a car for the whole morning, and the *tower* may book one out part-way through every day it
 * runs ({@link scheduledAwayOf}). They are separate facts with separate causes, and a player meets
 * them as one question — *which lifts will I not have?* — so they share the badge and get a
 * sentence each. A strip that drew only the first would have gone quiet on the one absence the
 * player can still do something about.
 */
function outOfServiceOf(
  building: ResolvedBuilding | undefined,
  event: ShiftEvent,
  moot: string | undefined,
): OutOfServiceStrip | undefined {
  if (building === undefined) return undefined;
  const held = carsHeldBy(event);
  const heldNames = held === 0 ? [] : carsToDerate(building, held).held.map((car) => car.carId);
  const scheduled = scheduledAwayOf(building);
  const names = [...new Set([...heldNames, ...scheduled.map((entry) => entry.carId)])];
  if (names.length === 0) return undefined;
  const badge = names.join(' · ');
  const sentences: string[] = [];
  if (heldNames.length > 0) {
    /*
     * The event's note says *when* — *"for the first two thirds of the shift"*, *"for the whole
     * shift"* — and it says it in the design's words. This sentence names the car and defers to that
     * note rather than restating a duration it would then own a second copy of.
     */
    const first = heldNames[0] ?? '';
    const which = heldNames.length === 1 ? `Car ${first} is` : `Cars ${heldNames.join(' · ')} are`;
    sentences.push(`${which} out of service today. ${event.note}`);
  }
  for (const entry of scheduled) {
    /*
     * No clock and no fraction. The strip is drawn before the run, and the instant is the run's to
     * show — a time printed here would be a figure whose only source is a schedule the reader
     * cannot see, and this file's neighbours already carry the rule that a figure needs a source a
     * reader can reach. What the sentence owes is the *decision*: the cars that are left are the
     * ones the stage's own arms move.
     */
    sentences.push(
      entry.returns
        ? `Car ${entry.carId} is booked out of passenger service part-way through today and comes ` +
          'back before the end. What the cars that are left do while it is away is yours to change.'
        : `Car ${entry.carId} is booked out of passenger service part-way through today and does ` +
          'not come back. What the cars that are left do after it goes is yours to change.',
    );
  }
  return { badge, sentence: sentences.join(' '), mootUnder: moot };
}

/**
 * The moot-dispatcher sentence for this exact day, or `undefined`.
 *
 * ## The gates, and each one is the difference between a measurement and a claim
 *
 * `ContractPressDay` is measured on **one contract, on day 1, at one seed, on one horizon** — so the
 * sentence is drawn when the week is on that contract, standing on day 1, with that crowd, about to
 * be run on that horizon, and at no other moment. The horizon is GitHub issue #595's addition: the
 * pin's seed run ten hours long is a different day from the same seed run for thirty minutes. A player on day 4 of Crown Hotel is playing a different day; a player with a `?seed=`
 * deep link is meeting a different crowd. Either would be this repository's oldest defect wearing
 * new words: a figure quoted about a run it was not taken on.
 *
 * ## No digit, and that is mechanical rather than a habit
 *
 * The census is *eight of thirteen* and this sentence says neither number — it names the standing
 * orders, which is the thing a player can act on, and `today.test.ts` fails on a digit anywhere in
 * this strip. The honesty search asks whether a figure is licensed, and *eight of thirteen* would
 * need a source a reader on this screen cannot reach.
 *
 * A pinned day whose census is **empty** draws no sentence at all rather than *"no dispatcher
 * clears it"*, because that second sentence is a claim about thirteen runs the strip would be
 * making on the census's behalf, and it is worth more said where the day is proved
 * (`shift/pressLadder.test.ts`) than implied here.
 */
function mootSentenceOf(
  input: TodayInput,
  event: ShiftEvent,
  nameOf: (id: string) => string | undefined,
): string | undefined {
  /*
   * **Five gates now, not three, and the fourth is GitHub issue #595.** Contract, day and seed were
   * checked here; the horizon was not, and on five of the seven pinned towers the Scenario press
   * runs a ten-hour day where the census was taken over a thirty-minute slice — so the sentence was
   * drawn, on the right seed, over a run it was not measured on. The wrinkle and the calendar are
   * the fifth for the same reason: the census ran on the ordinary day with no calendar period, and
   * either would make it a different day. All five are `shift/ladder.ts#pressDayStanding`'s, the
   * predicate the picker offers the day by, so the two cannot disagree about which run is the
   * pinned one ([§ D973](../../../../DECISIONS.md)).
   */
  const press = pressDayStanding({
    contractId: input.week.contractId,
    day: input.week.day,
    eventId: event.id,
    hasCalendar: input.calendar !== null,
    seed: input.seed,
    horizon: input.horizon,
  });
  if (press === undefined) return undefined;
  const names = press.mootUnder.map((id) => nameOf(id) ?? id);
  if (names.length === 0) return undefined;
  const last = names[names.length - 1] ?? '';
  const list = names.length === 1 ? last : `${names.slice(0, -1).join(', ')} and ${last}`;
  return (
    `Measured on today’s crowd: ${list} clear this day with no press at all. Change who is ` +
    'driving and the question this day is asking goes away with it.'
  );
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

/**
 * § 6.2's tinted panel, as configuration. `undefined` with no building, or with no car left to
 * divide by. The sentence says what the plate is not: a grade of a day that has not run.
 */
function loadOf(building: ResolvedBuilding | undefined, held: number): TodayLoad | undefined {
  if (building === undefined) return undefined;
  const working = Math.max(0, carCountOf(building) - held);
  if (working === 0) return undefined;
  const perCar = Math.round(building.totalPopulation / working);
  return {
    word: `${countFigure(perCar)} per working car`,
    note:
      `${groupThousands(building.totalPopulation)} people and ${String(working)} working ` +
      `${working === 1 ? 'car' : 'cars'} today, as the building is configured. The day shows ` +
      'whether that is comfortable; this plate does not grade it.',
  };
}

/**
 * § 6.1's lede — the building in words a stranger understands, composed from its own facts.
 *
 * Composed rather than authored, because the prototype's lede is a sentence about Chancery House
 * specifically (*"Fourteen floors, eleven hundred people and three lifts…"*) and this build runs
 * eight buildings. What is kept from it is the shape: what is here, how many people, how many
 * lifts, and then the one sentence that is true of every day.
 *
 * **That last sentence read *“Everyone runs the same building on the same crowd”* until
 * [§ D730](../../../../DECISIONS.md), and neither half of it was true.** The crowd was
 * `crypto.getRandomValues` at boot (§ D729 fixed that); the *building* still is not shared, and
 * no seed makes it so — `shift/week.ts` is a week over one `contractId`, so a returning player's
 * tower is the one their own week was opened on. The claim about the crowd now lives on the seed
 * line, where {@link TodayRecord.crowdIsToday} can condition it and where § 6 put it in the first
 * place (*“printed so two players can confirm they had the same morning”*). What is left here is
 * the half that holds on every day and every tower: the dispatcher is the only thing you choose.
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
    'The only thing you choose is who drives.'
  );
}

/**
 * § 6’s seed line — the tower, the crowd, and what the crowd number means.
 *
 * ## The claim it used to make, and why it was the worst string in the product
 *
 * It read *“tower `<id>` · crowd `<n>` · everyone identical”* while `dev/main.ts` opened the
 * session on `crypto.getRandomValues`, so the number beside the words was a number nobody else had.
 * Every other figure in this product is either measured or withheld; this one was asserted. Six
 * cold loads gave six different towers ([§ D729](../../../../DECISIONS.md)).
 *
 * ## What it says now, and why there are two arms rather than a fix
 *
 * The crowd is the UTC date’s own digits, so the number **is** the date — which makes the claim
 * the one thing on this screen a player can check without being told, against a calendar they
 * already have. That is the standard every withheld figure here is held to, pointed at an
 * assertion for once.
 *
 * It is conditional because two ordinary states reach this screen with a crowd nobody else has: a
 * `?seed=` deep link, and a session left open past UTC midnight. A single unconditional sentence
 * would have been § D729’s defect surviving inside its own repair, which is the shape
 * [§ D227](../../../../DECISIONS.md) exists to refuse — and the second arm is not a hedge: it is a
 * fact the player wants, because it says the run is theirs alone and nothing is comparing it.
 *
 * **Neither arm names the tower as shared**, and that is [§ D730](../../../../DECISIONS.md)
 * rather than an omission. The tower is the one this player’s week was opened on.
 */
function seedLineOf(input: TodayInput): string {
  const crowd = `tower ${input.buildingId} · crowd ${input.seed.toString()}`;
  return input.crowdIsToday
    ? `${crowd} · today’s date, so everyone playing today meets this crowd`
    : `${crowd} · a crowd of this run’s own, not the day’s`;
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
    wrinkleNote: wrinkleNoteOf(event, bookedOutCarsOf(building)),
    outOfService: outOfServiceOf(
      building,
      event,
      mootSentenceOf(input, event, input.dispatcherNameOf),
    ),
    /*
     * The same call the run makes, and the same call the strip's own badge half makes — one
     * `carsToDerate` per day record rather than one per reader. See the field's docstring for the
     * defect that made it a field.
     */
    heldCarIds:
      building === undefined || carsHeldBy(event) === 0
        ? []
        : carsToDerate(building, carsHeldBy(event)).held.map((car) => car.carId),
    facts: factsOf(building, held, input.units),
    load: loadOf(building, held),
    asks: input.goals.map((reading) => reading.goal.label),
    seedLine: seedLineOf(input),
    crowdIsToday: input.crowdIsToday,
    /*
     * Which arm is the draw's own answer rather than a guess about how the player arrived — GitHub
     * issue #595: the picker and the pinned days both reach a legible first day the seed did not
     * choose, and the first arm's *the same number opens the same tower* is false of both.
     */
    firstSessionLine: input.firstSession
      ? firstSessionLineFor(week.contractId, input.seed)
      : undefined,
    driver: input.dispatcherName ?? EM_DASH,
  };
}
