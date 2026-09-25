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

import { bookedOutCarsOf, carAbsencesOf, wrinkleNameOf, wrinkleNoteOf } from '../shift/bookedOut.js';
import type { CalendarPeriod } from '../shift/calendar.js';
import { scheduledEventFor } from '../shift/calendar.js';
import { firstSessionLineFor } from '../shift/firstSession.js';
import { eventAsRun, eventCarChoice } from '../shift/events.js';
import { carsToDerate } from '../shift/incidents.js';
import { admittedPressDayIds, pressDayStanding } from '../shift/ladder.js';
import { wayThroughSentenceOf } from '../shift/weekWay.js';
import { clockOf, clockRange } from '../shift/report.js';
import type { GoalReading, RunHorizon, ShiftEvent, WeekState, Weekday } from '../shift/types.js';
import { weekdayOf } from '../shift/types.js';

import { pinnedDayLengthLineOf } from './firstDayLength.js';
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
   * The day's name **as the brief prints it** — `shift/bookedOut.ts#wrinkleNameOf`: the event's own,
   * except on an admitted pinned day, which the stage will call and which is not an ordinary day
   * (the post-AI panel's seat B, defect 4). The Day report's header and the Engineer rail print the
   * same name from the same function.
   */
  readonly wrinkleName: string;
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
   * The cars that are **out when the day opens** — the day's own holds and any window that starts at
   * the first instant ([§ D871](../../../../DECISIONS.md), [§ D1039](../../../../DECISIONS.md)).
   * It used to be every car the day's wrinkle takes, including one it takes at half past ten, which
   * greyed a lift on the opening frame that the run had running; the paragraph below already said
   * that was the wrong answer for a tower's booking, and it was the wrong answer for a day's too.
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
   * **Whether this run is a pinned day on the crowd it was measured on** — `shift/ladder.ts#pressDayStanding`
   * over the run about to be pressed, [§ D1047](../../../../DECISIONS.md).
   *
   * Echoed for {@link crowdIsToday}'s reason: the seed line and the door's closing sentence both say
   * whose crowd this is, and since § D1047 a newcomer's first day is always one of these. The ruling's
   * honesty member made *the day is labelled as a pinned crowd* a condition of dealing it, and *a
   * crowd of this run's own* — the other arm's words — is true and says less than the player is
   * owed: this crowd is shared with everybody who plays the same pinned day.
   */
  readonly crowdIsPinned: boolean;
  /**
   * `shift/firstSession.ts`'s line on a first day nobody has played on a legible tower, or
   * `undefined` on every other day — GitHub issue #208, § D514.
   */
  readonly firstSessionLine: string | undefined;
  /**
   * **How long this pinned whole day takes to watch, and when its call comes**, or `undefined` —
   * `firstDayLength.ts#pinnedDayLengthLineOf`, [§ D1047](../../../../DECISIONS.md). Drawn by the
   * brief only on a pinned day as measured, where both figures are true of the run the press makes;
   * a slice, and every day that is not its tower's pinned one, draw nothing.
   */
  readonly dayLength: string | undefined;
  /** Who drives, by name — or the em dash when the standing selection resolves to nothing. */
  readonly driver: string;
  /**
   * **Why the driver cannot be changed here**, or `undefined` when it can — wave AI,
   * [§ D1029](../../../../DECISIONS.md).
   *
   * On an admitted pinned day, set up exactly as it was measured and driven by its standing order,
   * the brief's cards and select are held: the day's press is made at the stage's call, and a
   * different driver would be a day nobody measured (8 to 10 of 12 other orders clear these days
   * with no press at all, which is what the census says). The hold is lifted on the stage once the
   * call is answered, and on every other day it is never drawn.
   */
  readonly driverHeld: string | undefined;
  /**
   * **What the week census found about a day it could not admit**, or `undefined` —
   * `docs/33` DC-10, [§ D1067](../../../../DECISIONS.md) clause 4.
   *
   * `shift/weekWay.ts#wayThroughSentenceOf`, gated there on the census having measured this
   * contract's day at the growth the tower runs at now, on the horizon the press will run and with
   * no calendar over it. An admitted day and an unmeasured one both draw nothing. It states how many
   * of the measured crowds cleared and gives no advice, because a measurement of a day with no way
   * through licenses none.
   */
  readonly wayThrough: string | undefined;
}

/** {@link TodayRecord.driverHeld}'s sentence — no digit, the strip's own rule. */
export const PRESS_DAY_DRIVER_HELD =
  'This day is the tower’s own: its standing order drives until the stage’s call is answered. ' +
  'Pick your own driver on any other day.';

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
  /**
   * The building the next run will be handed — `host.dayAhead().building`, which is
   * `dev/state.ts#resolvedBuildingOf` over the state after the press's own patch; `undefined` when
   * the id names no document this build has.
   */
  readonly building: ResolvedBuilding | undefined;
  /**
   * Where that run's clock will start, seconds since midnight — `host.dayAhead().startOfDayS` — or
   * `undefined` when it is not known, in which case the strip prints no clock at all
   * ([§ D1039](../../../../DECISIONS.md)).
   *
   * Required rather than optional, {@link TodayInput.calendar}'s reason: an optional start would
   * default to *no clock*, and every caller that forgot it would silently go back to the brief that
   * said *part-way through today* beside a stage and a report that gave the times.
   */
  readonly dayStartS: number | undefined;
  /**
   * Whether the next run's demand template keeps its own mix of trips — `host.dayAhead()`'s
   * `templateVariesMix`. On such a day a wrinkle that asks for a mix cannot have one, and the
   * record quotes `shift/events.ts#eventAsRun`'s note — what the run does — rather than the
   * wrinkle's own ([§ D1040](../../../../DECISIONS.md)). Required, {@link TodayInput.calendar}'s
   * reason: a default of `false` would print the fire drill's lobby rush over an all-day rise.
   */
  readonly templateVariesMix: boolean;
  /**
   * Whether the next run is the building's whole authored day — `host.dayAhead().wholeDayRun`. On
   * such a day a mix-setting wrinkle with a placement is spliced as an episode, the draw is the
   * whole day's, and the record quotes the placement's note, which names the window
   * ([§ D1057](../../../../DECISIONS.md)). Required, {@link TodayInput.calendar}'s reason.
   */
  readonly wholeDayRun: boolean;
  /**
   * The cars today's event takes, as the next run takes them — `host.dayAhead().dayCars`, which is
   * `dev/state.ts#ShiftRunConfig.dayCars` — or `undefined` for a caller with no run to ask, in
   * which case the record asks `events.ts#eventCarChoice` over `building` with nothing booked.
   *
   * The run's answer rather than a second call, [§ D1038](../../../../DECISIONS.md): the day's car
   * choice skips a car the tower books over the same stretch, and a record that re-derived it
   * without the booking would name the wrong car on exactly the days that matter.
   */
  readonly dayCars: { readonly holds: readonly string[]; readonly windows: readonly string[] } | undefined;
  /** The standing selection's id, so the seed line can name a building the document lookup missed. */
  readonly buildingId: string;
  /** The standing dispatcher's display name, or `undefined`. */
  readonly dispatcherName: string | undefined;
  /**
   * The standing dispatcher's id — for {@link TodayRecord.driverHeld}, which holds the driver only
   * when it **is** the pin's standing order. Optional: a caller that draws no driver control passes
   * nothing, and nothing is held.
   */
  readonly dispatcherId?: string | undefined;
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
   * **The day's own crowd** — `shift/dailySeed.ts#dailySeedAt(nowMs)`, asked by the caller for
   * {@link crowdIsToday}'s reason, [§ D1047](../../../../DECISIONS.md).
   *
   * The first-session line's pinned arm is true only where the draw **on this seed** deals the
   * week's tower, and on a pinned first day {@link seed} is the pin's rather than the one the draw
   * was taken from — so the chooser has to be handed the day's. Required: a default would have to be
   * {@link seed}, which is exactly the number that cannot answer the question.
   */
  readonly daySeed: bigint;
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
 * **One car, as today's run will have it** — the single reading the strip, the badge, the plate,
 * the lede and the elevation all draw from ([§ D1038](../../../../DECISIONS.md),
 * [§ D1039](../../../../DECISIONS.md)).
 *
 * ## Why one reading, and what it replaced
 *
 * The post-AH panel's D.md N5: Midtown's Tuesday brief said *"Car D is out of service today"*, the
 * plate *"Lifts 4 · 1 out today"* and *"3 working cars"*, the wrinkle *"one car is tied up through
 * the middle of the shift, then rejoins"*, and then *"the tower also books car D out … part-way
 * through the day"*. Three sources — `carsToDerate` for the badge's car, the event's hold count for
 * the plate, and the building's service windows for the tower's sentence — each true of one
 * schedule and none of them of the run, which (until § D1038 merged the two windows) handed the
 * movers' car back at the rung's return. Everything below now reads this list, built once per
 * record from the run's own spans and the day's own car choice.
 */
interface CarOutToday {
  readonly carId: string;
  /** Today's wrinkle takes this car itself — `events.ts#eventCarChoice`, the run's own choice. */
  readonly ofTheDay: boolean;
  /** Held for the whole run (`carsOutOfService`), which travels beside the building, not on it. */
  readonly wholeRun: boolean;
  /**
   * The run's own span for it, off the building's service events — or `undefined` when the
   * building carries none for this car, which is a document not built for today's run (the
   * corpus and the unit fixtures pass the authored tower).
   */
  readonly span: { readonly awayAtS: number; readonly backAtS: number | null } | undefined;
  /** Out at the first instant, so a picture of the opening frame greys it. */
  readonly atOpen: boolean;
  /** Out for the whole run, so no count of *working* cars includes it. */
  readonly allDay: boolean;
}

/** The day's cars first, in the run's own order, then the tower's by id. */
function carsOutTodayOf(
  building: ResolvedBuilding | undefined,
  event: ShiftEvent,
  dayCars: TodayInput['dayCars'],
): readonly CarOutToday[] {
  if (building === undefined) return [];
  const choice =
    dayCars === undefined
      ? (() => {
          const chosen = eventCarChoice(event.effect, building);
          return {
            holds: chosen.holdCars.map((car) => car.carId),
            windows: chosen.derateCars.map((car) => car.carId),
          };
        })()
      : dayCars;
  const holdIds = choice.holds;
  const derateIds = choice.windows;
  const spans = new Map(carAbsencesOf(building).map((entry) => [entry.carId, entry]));
  const { derate } = event.effect;
  const ids = [...new Set([...holdIds, ...derateIds, ...spans.keys()])];
  return ids.map((carId): CarOutToday => {
    const wholeRun = holdIds.includes(carId);
    const byDerate = derateIds.includes(carId);
    const entry = spans.get(carId);
    const span = entry === undefined ? undefined : { awayAtS: entry.awayAtS, backAtS: entry.backAtS };
    /*
     * A derate with no span on the building is described by its own fractions — the only other
     * account of it there is — so the fixtures that pass an authored tower still get a plate that
     * counts the car the day takes.
     */
    const fromStart =
      span !== undefined ? span.awayAtS === 0 : byDerate && derate !== null && derate.fromFraction <= 0;
    const toEnd =
      span !== undefined ? span.backAtS === null : byDerate && derate !== null && derate.toFraction >= 1;
    return {
      carId,
      ofTheDay: wholeRun || byDerate,
      wholeRun,
      span,
      atOpen: wholeRun || fromStart,
      allDay: wholeRun || (fromStart && toEnd),
    };
  });
}

/** `10:30–15:30`, `from the start of the day until 16:30`, `from 10:30 to the end of the day`, `all day`. */
function spanPhrase(
  span: { readonly awayAtS: number; readonly backAtS: number | null },
  dayStartS: number,
): string {
  if (span.awayAtS === 0) {
    return span.backAtS === null
      ? 'all day'
      : `from the start of the day until ${clockOf(span.backAtS, dayStartS)}`;
  }
  return span.backAtS === null
    ? `from ${clockOf(span.awayAtS, dayStartS)} to the end of the day`
    : clockRange(span.awayAtS, span.backAtS, dayStartS);
}

/**
 * The strip, or nothing — a badge of every car the run loses, and a sentence for each cause.
 *
 * **Two kinds of absence, one strip** — [§ D871](../../../../DECISIONS.md). The day's wrinkle may
 * take a car, and the *tower* may book one out part-way through every day it runs. They are
 * separate facts with separate causes, and a player meets them as one question — *which lifts will
 * I not have?* — so they share the badge. Since [§ D1038](../../../../DECISIONS.md) a car both take
 * is **one** car in one span, and it is described once: as the day's, with the run's span.
 *
 * **With the clock, since [§ D1039](../../../../DECISIONS.md).** The strip said *part-way through
 * today* and printed no time, on the ground that a time before the run is a figure whose only source
 * is a schedule the reader cannot see. The stage's pill and the report's header printed the times
 * from that very schedule, so the brief was the one surface keeping back a fact the other two gave;
 * printing it is how the reader gets to see the schedule. The times are the report's own expression
 * (`shift/report.ts#clockRange` over the run's spans), read off the run the next press produces
 * (`host.dayAhead()`); with no known start of day the strip says what it said before, and no clock.
 */
function outOfServiceOf(
  cars: readonly CarOutToday[],
  event: ShiftEvent,
  dayStartS: number | undefined,
  moot: string | undefined,
): OutOfServiceStrip | undefined {
  if (cars.length === 0) return undefined;
  const badge = cars.map((car) => car.carId).join(' · ');
  const sentences: string[] = [];
  const days = cars.filter((car) => car.ofTheDay);
  if (days.length > 0) {
    /*
     * The event's note says *when* in the design's words and stays first; the sentence after it
     * names the car and, where the run's span is known, the clock. It used to open *"Car D is out
     * of service today."* over a note that said the car rejoins, which is one of D.md's three.
     */
    sentences.push(event.note);
    for (const car of days) {
      if (car.wholeRun) {
        sentences.push(`Car ${car.carId} is the car it takes, out of service all day.`);
      } else if (car.span !== undefined && dayStartS !== undefined) {
        sentences.push(
          `Car ${car.carId} is the car it takes, out of passenger service ${spanPhrase(car.span, dayStartS)}.`,
        );
      } else {
        sentences.push(`Car ${car.carId} is the car it takes.`);
      }
    }
  }
  for (const car of cars) {
    if (car.ofTheDay || car.span === undefined) continue;
    sentences.push(
      dayStartS !== undefined
        ? `Car ${car.carId} is booked out of passenger service ${spanPhrase(car.span, dayStartS)}.`
        : car.span.backAtS !== null
          ? `Car ${car.carId} is booked out of passenger service part-way through today and comes back before the end.`
          : `Car ${car.carId} is booked out of passenger service part-way through today and does not come back.`,
    );
  }
  sentences.push(
    `What the cars that are left do while ${cars.length === 1 ? 'it is' : 'they are'} away is yours to change.`,
  );
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
  /*
   * **One derived sentence now, and the list is the report's** — wave AI, [§ D1029](../../../../DECISIONS.md).
   * The names used to be drawn here, one screen from the `<select>`, where they told a player the
   * day's question could be skipped before they had met it; the ruling moved them to the report's
   * call row, where they are a fact about the day just played. What stays is the count, in words,
   * and whose order the day runs under — the visibility the first-day swarm's honesty member made a
   * condition of the press-day default.
   *
   * **On *this* crowd, not *today's*** — [§ D1047](../../../../DECISIONS.md). The gate above admits
   * only the pin's seed, and a pin's seed is never the date's (`20276662` would be the sixty-second
   * day of the sixty-sixth month), so *today's crowd* was false on every day this sentence could be
   * drawn — and since § D1047 that is every newcomer's first brief, under a seed line saying the
   * crowd is not the day's.
   */
  const standing = nameOf(press.standingOrder) ?? press.standingOrder;
  const others = press.mootUnder.length;
  const count =
    others === 0
      ? 'No other standing order clears it'
      : `${countWord(others, true)} other standing ${others === 1 ? 'order clears' : 'orders clear'} it`;
  return (
    `This day runs under the tower’s standing order, ${standing}. Measured on this crowd, ` +
    `${count} with no press at all; the day’s report names ${others === 1 ? 'it' : 'them'}.`
  );
}

/** A small count in words, for a strip that may carry no digit. Past twenty it is the digits' job. */
function countWord(count: number, capital: boolean): string {
  const words = [
    'no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
    'nineteen', 'twenty',
  ];
  const word = words[count] ?? 'many';
  return capital ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/**
 * {@link TodayRecord.driverHeld} — the pinned day as measured, admitted, and under its standing
 * order. `pressDayStanding`'s five gates, and the two § D1029 adds for the brief: the pin is
 * admitted, and the selection **is** the standing order (a selection that is not would not be held
 * onto the wrong driver; the stage draws no call over it either).
 */
function driverHeldOf(input: TodayInput, event: ShiftEvent): string | undefined {
  const press = pressDayStanding({
    contractId: input.week.contractId,
    day: input.week.day,
    eventId: event.id,
    hasCalendar: input.calendar !== null,
    seed: input.seed,
    horizon: input.horizon,
  });
  if (press === undefined) return undefined;
  if (!admittedPressDayIds().includes(input.week.contractId)) return undefined;
  if (input.dispatcherId === undefined || input.dispatcherId !== press.standingOrder) return undefined;
  return PRESS_DAY_DRIVER_HELD;
}

/** § 6.2's five rows, from the resolved building. Empty when there is no document to read. */
function factsOf(
  building: ResolvedBuilding | undefined,
  out: readonly CarOutToday[],
  units: EverydayUnits,
): readonly TodayFact[] {
  if (building === undefined) return [];
  const cars = carCountOf(building);
  const working = Math.max(0, cars - out.length);
  const away = awayPhrasesOf(out);
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
      value: away.length === 0 ? String(cars) : [String(cars), ...away].join(' · '),
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
          : `${String(smallest)} · ${String(smallest * working)} a trip with ${String(working)} working` +
            (out.some((car) => !car.allDay) ? ' all day' : ''),
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
function loadOf(
  building: ResolvedBuilding | undefined,
  out: readonly CarOutToday[],
): TodayLoad | undefined {
  if (building === undefined) return undefined;
  const working = Math.max(0, carCountOf(building) - out.length);
  if (working === 0) return undefined;
  const perCar = Math.round(building.totalPopulation / working);
  const part = out.filter((car) => !car.allDay).length;
  /*
   * *Working all day* where a car is away for part of it — § D1039's one reading. The plate used to
   * count a car the day takes for a window as *out today*, and a car the tower books for a window as
   * working, so the same absence was a different number depending on which schedule it was on.
   */
  const cars =
    part === 0
      ? `${String(working)} working ${working === 1 ? 'car' : 'cars'} today`
      : `${String(working)} ${working === 1 ? 'car' : 'cars'} working all day and ${String(part)} ` +
        'more for part of it';
  return {
    word: `${countFigure(perCar)} per working car`,
    note:
      `${groupThousands(building.totalPopulation)} people and ${cars}, as the building is ` +
      'configured. The day shows whether that is comfortable; this plate does not grade it.',
  };
}

/** `1 out all day`, `1 away for part of the day` — the plate's and the lede's one wording. */
function awayPhrasesOf(out: readonly CarOutToday[]): readonly string[] {
  const allDay = out.filter((car) => car.allDay).length;
  const part = out.length - allDay;
  return [
    ...(allDay === 0 ? [] : [`${String(allDay)} out all day`]),
    ...(part === 0 ? [] : [`${String(part)} away for part of the day`]),
  ];
}

/**
 * **What a player chooses about today** — the lede's closing sentence.
 *
 * It read *"The only thing you choose is who drives"* (the post-AH panel's H13), over a stage that
 * offers two parking presses and a mid-day handover on every day and a list of days whose verdict
 * turns on one of those presses. The dispatcher is chosen before the day starts and the cars can be
 * moved while it plays, so the sentence says both halves and claims no *only*. Recorded here under
 * [§ D405](../../../../DECISIONS.md); `doorView.ts#DOOR_STEPS` carries the same correction.
 */
export const TODAY_CHOICE_LINE =
  'You choose who drives before the day starts, and what the cars do while it plays.';

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
 * the half that holds on every day and every tower — {@link TODAY_CHOICE_LINE}.
 */
function ledeOf(
  building: ResolvedBuilding | undefined,
  name: string,
  note: string,
  out: readonly CarOutToday[],
): string {
  if (building === undefined) {
    return (
      'This build does not have the document for the building the run is set to, so nothing below ' +
      'describes it. Pick another building on the simulator’s own surface and the door fills in.'
    );
  }
  const cars = carCountOf(building);
  const away = awayPhrasesOf(out);
  const lifts =
    away.length === 0 ? `${String(cars)} lifts` : `${String(cars)} lifts, ${away.join(' and ')}`;
  return (
    `${String(building.floors.length)} floors, ` +
    `${groupThousands(building.totalPopulation)} people and ${lifts}. ` +
    `${name}: ${note} ` +
    TODAY_CHOICE_LINE
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
function seedLineOf(input: TodayInput, crowdIsPinned: boolean): string {
  const crowd = `tower ${input.buildingId} · crowd ${input.seed.toString()}`;
  if (input.crowdIsToday) return `${crowd} · today’s date, so everyone playing today meets this crowd`;
  /*
   * **The third arm: a pinned crowd, labelled as one** — [§ D1047](../../../../DECISIONS.md). The
   * ruling's honesty member made it a condition of dealing a newcomer a pinned day, and the second
   * arm's *a crowd of this run's own* is true and says less than is so: everybody who plays this
   * tower's pinned first day meets this crowd, which is the one it was measured on.
   */
  if (crowdIsPinned) return `${crowd} · the pinned crowd this day was measured on, not the day’s`;
  return `${crowd} · a crowd of this run’s own, not the day’s`;
}

/**
 * {@link TodayRecord.dayLength} — the pinned day as measured and admitted, under its standing order,
 * which is `driverHeldOf`'s gate: the run the length and the call were measured on is that one, and
 * the sentence is not drawn over a run somebody else is driving.
 */
function dayLengthOf(input: TodayInput, event: ShiftEvent): string | undefined {
  if (driverHeldOf(input, event) === undefined) return undefined;
  return pinnedDayLengthLineOf(input.week.contractId);
}

/** Today, from the week and the building. Pure and total: every arm answers something drawable. */
export function todayOf(input: TodayInput): TodayRecord {
  const { week, building } = input;
  const weekday = weekdayOf(week.dayIdx);
  /*
   * The event as the run will have it — § D1040. Its note is the wrinkle's own on every day but one
   * whose template keeps its own mix, where the wrinkle's mix is withheld by `core` and the note says
   * so; the name, the id and the effect are the wrinkle's either way.
   */
  const event = eventAsRun(
    scheduledEventFor(
      input.calendar,
      week.day,
      week.dayIdx,
      input.wholeDayRun ? 'whole-day' : 'period',
    ),
    input.templateVariesMix,
    input.wholeDayRun,
  );
  const out = carsOutTodayOf(building, event, input.dayCars);
  /*
   * The one sentence about the day's wrinkle — the brief's card, this record's lede and the report's
   * header all print it. The lede quoted `event.note` and printed *"Nothing booked"* on every tower
   * that books a car out, all seven pinned press days included (the post-AH panel's N4), one screen
   * before the brief said the car was booked.
   */
  const wrinkleNote = wrinkleNoteOf(
    event,
    bookedOutCarsOf(
      building,
      out.filter((car) => car.ofTheDay).map((car) => car.carId),
    ),
  );
  const crowdIsPinned =
    pressDayStanding({
      contractId: week.contractId,
      day: week.day,
      eventId: event.id,
      hasCalendar: input.calendar !== null,
      seed: input.seed,
      horizon: input.horizon,
    }) !== undefined;
  /* The stage calls an admitted pinned day, and only that one — § D1029's own gate on the pin. */
  const wrinkleName = wrinkleNameOf(
    event,
    crowdIsPinned && admittedPressDayIds().includes(week.contractId),
  );
  return {
    day: week.day,
    weekday,
    dayLabel: `${weekday.toUpperCase()} · DAY ${String(week.day)}`,
    towerName: building?.name ?? input.buildingId,
    lede: ledeOf(building, wrinkleName, wrinkleNote, out),
    wrinkle: event,
    wrinkleName,
    wrinkleNote,
    outOfService: outOfServiceOf(
      out,
      event,
      input.dayStartS,
      mootSentenceOf(input, event, input.dispatcherNameOf),
    ),
    /*
     * The same call the run makes, and the same call the strip's own badge half makes — one
     * `carsToDerate` per day record rather than one per reader. See the field's docstring for the
     * defect that made it a field.
     */
    heldCarIds: out.filter((car) => car.atOpen).map((car) => car.carId),
    facts: factsOf(building, out, input.units),
    load: loadOf(building, out),
    asks: input.goals.map((reading) => reading.goal.label),
    seedLine: seedLineOf(input, crowdIsPinned),
    crowdIsToday: input.crowdIsToday,
    crowdIsPinned,
    /*
     * Which arm is the draw's own answer rather than a guess about how the player arrived — GitHub
     * issue #595: the picker and the pinned days both reach a legible first day the seed did not
     * choose, and the first arm's *the same number opens the same tower* is false of both. Since
     * § D1047 the draw is asked on the day's seed as well, because a first session's printed crowd is
     * the pin's and the draw was taken from the date.
     */
    firstSessionLine: input.firstSession
      ? firstSessionLineFor(week.contractId, input.seed, input.daySeed)
      : undefined,
    dayLength: dayLengthOf(input, event),
    driver: input.dispatcherName ?? EM_DASH,
    driverHeld: driverHeldOf(input, event),
    wayThrough: wayThroughSentenceOf({
      contractId: week.contractId,
      day: week.day,
      eventId: event.id,
      hasCalendar: input.calendar !== null,
      horizon: input.horizon,
    }),
  };
}
