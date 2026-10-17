/**
 * **A held week deals the next week, and calls it harder only where the house's census fell** —
 * wave AN, lane DQ-2, swarm DQ's Q3 primary ([§ D1344](../../../../DECISIONS.md)).
 *
 * ## What was wrong
 *
 * The post-AM panel held Midtown Office's week and found nothing on the other side of it: the
 * onward-tower offer sends a held Midtown week nowhere (no tower above it passes `nextTower.ts`'s
 * rules), and *Start next week* dealt the next authored order whether the week was held or missed,
 * so holding a week changed nothing a player could see. Seat C's line: a win opens nothing.
 *
 * ## The rule
 *
 * - **A held week deals the next week on the same tower**: the next order the census and the
 *   one-profile screen admit (`weekOrders.ts#weekOrderIndexOf`, `weekDominance.ts`).
 * - **A week that was not held deals its own order again**, on crowds this device has not filed,
 *   as the sheet's primary, and the next week stays one press away (*Go on to week N*), because
 *   nothing is locked (`docs/38` § 1). The ruling decided what a held week deals and was silent on
 *   a missed one; this reading is the lane's, owner-reversible, and the alternative (a missed week
 *   deals the next week too, S1's *a loss costs the run, not the progress*) is the dissent recorded
 *   in § D1344.
 * - **The next week is called harder only where the house's census results fell.** The house is
 *   the tower's standing order left alone, and DC-10's census already ran it on every weekday of
 *   every dealt week over the same held-out crowds (`data/week-way.json`'s `standingVerdicts`). For
 *   each crowd this counts the weekdays the house cleared in each week, and the next week is harder
 *   exactly when the paired-t interval on the difference, crowd by crowd, lies wholly below zero
 *   (`CLAUDE.md`: never a difference without a paired interval excluding zero). Where it does not,
 *   no sentence says harder, and none says easier, which the ruling does not license.
 *
 * The house's figures are the census's, never this player's: the sentence names the crowds and
 * says *left alone*, so it is a statement about the weeks and not a forecast about today.
 */

import { intervalContainsZero, pairedDifferenceEstimate, type MeanEstimate } from '@elevator-sim/experiments/browser';

import { scheduledEventFor } from './calendar.js';
import type { ContractIncident } from './ladder.js';
import type { WeekState } from './types.js';
import {
  bookingPhraseOf,
  bookingsAddedBetween,
  dealtLevelOf,
  dealtWeekOf,
  hasFurtherWeek,
  weekBookingsOn,
} from './weekLevels.js';
import { weekOrderIndexOf } from './weekOrders.js';
import { weekAsksOf, weekDealOf, weekTargetMetDayOf } from './weekStake.js';
import { WEEK_WAY, weekWayRowFor, type WeekWay } from './weekWay.js';
import { wrinkleOfDrawnId } from '../wrinkles/draw.js';
import { WRINKLE_LIBRARY } from '../wrinkles/library.js';
import { poolWithdrawnLineOf } from './poolWays.js';

/** The weekdays a week order authors, and the house's census is read over. */
const WEEKDAYS = 5;

/** A tower's week by number. */
export interface WeekNumberKey {
  readonly contractId: string;
  readonly week: number;
}

/** The house's census over one week's five weekdays as dealt. */
export interface HouseWeekCensus {
  /** Per held-out crowd, in date order: the weekdays the house cleared, 0 to 5. */
  readonly perCrowd: readonly number[];
  /** Every weekday the house cleared, over every crowd. */
  readonly cleared: number;
  /** Weekdays times crowds: what {@link cleared} is out of. */
  readonly of: number;
  readonly crowds: number;
}

/** The drawn ids week `key.week` deals Monday to Friday. */
function weekdayIdsOf(key: WeekNumberKey, census: WeekWay): readonly string[] {
  return Array.from({ length: WEEKDAYS }, (_, index) =>
    scheduledEventFor(null, index + 1, index, census.protocol.horizon, key).id,
  );
}

/**
 * **The house's census over a week's weekdays**, or `undefined` where any weekday has no current
 * census row measured under exactly the wrinkle it is dealt: the figure is a sum over five days,
 * and a sum with a day borrowed from another wrinkle is a different week's.
 */
export function houseWeekCensusOf(key: WeekNumberKey, census: WeekWay = WEEK_WAY): HouseWeekCensus | undefined {
  /*
   * Each weekday with the week level's bookings on it (wave AO lane DS-1, § D1400): a level's
   * booked day is read off the row measured with the car out, because the house ran that day.
   */
  const booked = Array.from({ length: WEEKDAYS }, (_, index) => weekBookingsOn(key, index + 1, index, census));
  return houseCensusOverDays(key.contractId, weekdayIdsOf(key, census), census, booked);
}

/** {@link houseWeekCensusOf} over named weekday wrinkles, Monday first, each with its week bookings. */
export function houseCensusOverDays(
  contractId: string,
  ids: readonly string[],
  census: WeekWay = WEEK_WAY,
  bookings: readonly (readonly ContractIncident[])[] = [],
): HouseWeekCensus | undefined {
  const crowds = census.protocol.heldOutCount;
  const perCrowd = Array.from({ length: crowds }, () => 0);
  if (ids.length !== WEEKDAYS) return undefined;
  for (const [index, eventId] of ids.entries()) {
    const row = weekWayRowFor(contractId, index + 1, eventId, census.protocol.horizon, census, bookings[index] ?? []);
    if (row?.eventId !== eventId || row.standingVerdicts.length !== crowds) return undefined;
    for (let crowd = 0; crowd < crowds; crowd += 1) {
      if (row.standingVerdicts[crowd] === 'C') perCrowd[crowd] = (perCrowd[crowd] ?? 0) + 1;
    }
  }
  const cleared = perCrowd.reduce((sum, value) => sum + value, 0);
  return { perCrowd: Object.freeze(perCrowd), cleared, of: crowds * WEEKDAYS, crowds };
}

/** Whether one week is harder than another by the house's census — see the module docstring. */
export interface WeekHarderReading {
  readonly harder: boolean;
  readonly from: HouseWeekCensus;
  readonly to: HouseWeekCensus;
  /** The paired interval on `to − from`, crowd by crowd. */
  readonly estimate: MeanEstimate;
}

/**
 * **Whether week `to` is harder than week `from` on a tower**, or `undefined` where either week's
 * house census is incomplete. Harder only when the paired-t interval on the per-crowd difference
 * excludes zero below it.
 */
export function weekHarderOf(
  contractId: string,
  from: number,
  to: number,
  census: WeekWay = WEEK_WAY,
): WeekHarderReading | undefined {
  const before = houseWeekCensusOf({ contractId, week: from }, census);
  const after = houseWeekCensusOf({ contractId, week: to }, census);
  if (before === undefined || after === undefined) return undefined;
  return harderReadingOf(before, after);
}

/**
 * **The comparison itself**: `to` is harder than `from` exactly when the paired-t interval on the
 * per-crowd difference in the house's clears, `to − from`, lies wholly below zero. `undefined`
 * where the two were not measured on the same number of crowds, or on fewer than two.
 */
export function harderReadingOf(from: HouseWeekCensus, to: HouseWeekCensus): WeekHarderReading | undefined {
  if (from.crowds !== to.crowds || from.crowds < 2) return undefined;
  const estimate = pairedDifferenceEstimate(to.perCrowd, from.perCrowd);
  const harder = !intervalContainsZero(estimate) && Number.isFinite(estimate.upper) && estimate.upper < 0;
  return { harder, from, to, estimate };
}

/** *Week 3 is harder than week 2 …*, or `undefined` where the house's census did not fall. */
export function weekHarderSentenceOf(
  contractId: string,
  from: number,
  to: number,
  census: WeekWay = WEEK_WAY,
): string | undefined {
  const reading = weekHarderOf(contractId, from, to, census);
  if (reading === undefined || !reading.harder) return undefined;
  return (
    `Week ${String(to)} is harder than week ${String(from)} by the house’s measure: left alone on ` +
    `the same ${String(reading.to.crowds)} crowds, the house cleared ${String(reading.to.cleared)} ` +
    `of week ${String(to)}’s ${String(reading.to.of)} weekdays, against ${String(reading.from.cleared)} ` +
    `of week ${String(from)}’s.`
  );
}

/** How many weekdays two weeks deal different wrinkle templates on. */
function weekdaysThatDiffer(contractId: string, a: number, b: number, census: WeekWay): number {
  const template = (id: string): string => wrinkleOfDrawnId(WRINKLE_LIBRARY, id)?.templateId ?? id;
  const left = weekdayIdsOf({ contractId, week: a }, census).map(template);
  const right = weekdayIdsOf({ contractId, week: b }, census).map(template);
  return left.filter((id, index) => id !== right[index]).length;
}

/* -------------------------------------------------------------------------- *
 * The sheet and the door
 * -------------------------------------------------------------------------- */

/** The press that goes on to the next week from a week that was not held. */
export interface OnwardWeekPress {
  readonly week: number;
  /** `Go on to week 3`. */
  readonly label: string;
}

/** What a closed week's sheet deals next, and how it says so. */
export interface NextWeekView {
  /** The week's target was met. */
  readonly held: boolean;
  /** The week number the sheet's primary deals. */
  readonly week: number;
  /** The primary's label: `Start next week`, or `Play week 2 again`. */
  readonly label: string;
  /** What the primary deals, in one or two sentences, harder only where measured. */
  readonly line: string;
  /** The second press on a week that was not held; `undefined` on a held week. */
  readonly onward: OnwardWeekPress | undefined;
  /**
   * The census deals this tower's week and no level is admitted above it: the ladder's top. Read by
   * the held top's sheet (wave AP, lane DT-2, swarm DT's Q4), whose primary stays *Start next week*.
   */
  readonly top: boolean;
}

/** The held week's primary — `everyday/weekView.ts#WEEK_START_NEXT_LABEL`'s text, the label it always had. */
export const NEXT_WEEK_LABEL = 'Start next week';

/** Whether a week was held: its target met, the sheet's reading (`nextTower.ts#weekWasHeld`). */
export function weekWasHeldBy(week: Pick<WeekState, 'contractId' | 'week' | 'history'>, census: WeekWay = WEEK_WAY): boolean {
  return weekTargetMetDayOf(week, census) !== undefined;
}

/** *a different wrinkle on each weekday* or the honest alternative, for weeks `a` and `b`. */
function wrinkleClause(contractId: string, a: number, b: number, census: WeekWay): string {
  /*
   * The order half of the week as dealt (wave AO lane DS-1): two weeks dealt one level, or one order
   * at two levels, deal the same wrinkles, whatever their numbers.
   */
  const orderOf = (week: number): number => weekOrderIndexOf({ contractId, week: dealtWeekOf({ contractId, week }, census) }, census);
  if (orderOf(a) === orderOf(b)) {
    return 'the same wrinkles as this week';
  }
  const differ = weekdaysThatDiffer(contractId, a, b, census);
  if (differ === WEEKDAYS) return 'a different wrinkle on every weekday';
  return `a different wrinkle on ${String(differ)} of the ${String(WEEKDAYS)} weekdays`;
}

/**
 * **What the next level adds, in words** — wave AO, lane DS-1 ([§ D1400](../../../../DECISIONS.md)):
 * *and one more car out of passenger service: car C on Monday from 08:00 until 12:00*, or `''` where
 * week `b` books no car week `a` does not. A booking is always said where it is new; whether the week
 * is harder is not this clause's to say (§ D1344 clause 3 is {@link weekHarderSentenceOf}'s).
 */
function bookingClause(contractId: string, a: number, b: number, census: WeekWay, clock: BookingClock | undefined): string {
  const added = bookingsAddedBetween(contractId, a, b, census);
  if (added.length === 0) return '';
  const cars = added.length === 1 ? 'one more car' : `${String(added.length)} more cars`;
  return ` and ${cars} out of passenger service: ${added.map((booking) => bookingPhraseOf(booking, clock, 'short')).join('; ')}`;
}

/**
 * A fraction of the run as the day's clock reads it (`08:00`), from the run's own start and length:
 * `everyday/weekScreen.ts` and `everyday/doorScreen.ts` build it from `dev/state.ts#plannedDayOf`.
 * A booking's window is authored in fractions of the run (`shift/ladder.ts#ContractIncident`).
 */
export type BookingClock = (fraction: number) => string;

/**
 * **What a closed week's sheet deals next**, or `undefined` for a week that is no Scenario's. See the
 * module docstring; a week the census does not deal is answered too since § D1394.
 *
 * **From week 3 the next week is a level** (wave AO lane DS-1, [§ D1400](../../../../DECISIONS.md),
 * `weekLevels.ts`): the line names the booking it adds, with `clock`'s times where the caller has the
 * run's clock. **Where the census deals the week and no level is left above it**, the line says the
 * tower has no further week, and a week that was not held offers no *Go on*: the next number would
 * deal this week again, and a press that promises *the next week* would promise one that does not
 * exist. A held week's sheet offers the next tower beside it (`nextTower.ts`, § D1259).
 */
export function nextWeekOf(week: WeekState, census: WeekWay = WEEK_WAY, clock?: BookingClock): NextWeekView | undefined {
  /*
   * Any Scenario week, since § D1394 (wave AO lane AO-5): a week the census does not deal closes on
   * Sunday too, and asks its `needClean` (`weekStake.ts#weekAsksOf`). Its next week deals the same
   * draw, which {@link wrinkleClause} says, and no house census calls it harder.
   */
  const target = weekAsksOf(week, census);
  if (target === undefined) return undefined;
  const contractId = week.contractId;
  const here = week.week;
  const next = here + 1;
  const harder = weekHarderSentenceOf(contractId, here, next, census);
  /* The ladder's end: the census deals this tower's week and no level is admitted above this one. */
  const atTop = weekDealOf(week, census) !== undefined && !hasFurtherWeek(week, census);
  /* Wave AP, lane DT-1 (§ D1461): where the pool withdrew the next week, the sheet says why. */
  const withdrawn = atTop && census === WEEK_WAY ? poolWithdrawnLineOf(contractId, next) : undefined;
  const why = withdrawn === undefined ? '' : ` ${withdrawn}`;
  const sameCars = dealtLevelOf(week, census) === undefined ? '' : ' and the same cars out';
  const whatComes = (): string =>
    `${wrinkleClause(contractId, here, next, census)}${bookingClause(contractId, here, next, census, clock)}`;
  if (weekWasHeldBy(week, census)) {
    const lead = atTop
      ? `You held week ${String(here)}. This tower deals no further week: ${NEXT_WEEK_LABEL} deals ` +
        `week ${String(next)} as this week was dealt, the same wrinkles${sameCars}, on new crowds.${why}`
      : `You held week ${String(here)}, so ${NEXT_WEEK_LABEL} deals week ${String(next)}, with ${whatComes()}.`;
    return {
      held: true,
      week: next,
      label: NEXT_WEEK_LABEL,
      line: harder === undefined ? lead : `${lead} ${harder}`,
      onward: undefined,
      top: atTop,
    };
  }
  const again = `Play week ${String(here)} again`;
  const onwardLabel = `Go on to week ${String(next)}`;
  const missed =
    /* A week that counts no day has no target to miss, and the sheet says *This week had no target*. */
    `${target === 0 ? 'This week had no target to meet' : 'This week’s target was not met'}, so ` +
    `${again} deals the same wrinkles${sameCars} on new crowds.`;
  if (atTop) {
    return { held: false, week: here, label: again, line: `${missed} This tower deals no further week.${why}`, onward: undefined, top: true };
  }
  const lead = `${missed} Nothing is locked: ${onwardLabel} deals the next week instead, with ${whatComes()}.`;
  return {
    held: false,
    week: here,
    label: again,
    line: harder === undefined ? lead : `${lead} ${harder}`,
    onward: { week: next, label: onwardLabel },
    top: false,
  };
}

/**
 * **The door's line about the cars the week under way books out** — wave AO, lane DS-1
 * ([§ D1400](../../../../DECISIONS.md)): *Booked this week: car C is out of passenger service on
 * Monday from 08:00 until 12:00, new this week.* `undefined` for a week dealt no level. It names
 * the bookings and nothing about difficulty, which is {@link weekUnderWayHarderLineOf}'s and only
 * where the house's census fell (§ D1344).
 */
export function weekBookingsLineOf(
  week: Pick<WeekState, 'contractId' | 'week'>,
  census: WeekWay = WEEK_WAY,
  clock?: BookingClock,
): string | undefined {
  const level = dealtLevelOf(week, census);
  if (level === undefined) return undefined;
  /* The booking this week adds is new only where the week is dealt its own level, not the top again. */
  const fresh = dealtWeekOf(week, census) === Math.trunc(week.week) ? level.added : undefined;
  const phrases = level.bookings.map(
    (booking) => `${bookingPhraseOf(booking, clock)}${booking === fresh ? ', new this week' : ''}`,
  );
  return `Booked this week: ${phrases.join('; ')}.`;
}

/**
 * **The door's line about the week under way**, or `undefined`: week 1, a tower the census does
 * not deal, or a week the house's census does not show harder than the week before it.
 */
export function weekUnderWayHarderLineOf(
  week: Pick<WeekState, 'contractId' | 'week'>,
  census: WeekWay = WEEK_WAY,
): string | undefined {
  if (week.week < 2 || weekDealOf(week, census) === undefined) return undefined;
  return weekHarderSentenceOf(week.contractId, week.week - 1, week.week, census);
}
