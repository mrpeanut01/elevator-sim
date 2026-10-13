/**
 * **From week 3, a held week deals the next level: the next order and one booking more** — wave
 * AO, lane DS-1, swarm DS's Q1 ruling ([§ D1400](../../../../DECISIONS.md), [§ D1401](../../../../DECISIONS.md)).
 *
 * ## What was wrong
 *
 * Wave AN's census found one later Midtown order the wrinkle library can build that DC-11 admits
 * (`midtown-early-lift`, [§ D1345](../../../../DECISIONS.md)), so Midtown dealt week 1 and then
 * that order every week, and the sheet said *the same wrinkles as this week* under every held week
 * after the second. Swarm DS measured that no new order is buildable today (S2: of 324 weeks from
 * the measured cells, 16 pass DC-11, all on the line, none harder than week 2; S3: every order DC-11
 * admits deals the same Wednesday). A held week bought nothing a player could see.
 *
 * ## The rule
 *
 * A **level** is the order the cycle deals that week (`weekOrders.ts#weekOrderIndexOf`) with the
 * first `n − 2` of the rung's **week bookings** (`data/contract-ladder.json`'s `weekBookings`,
 * `ladder.ts#ContractWeekBooking`): a car out of passenger service on a named weekday, in the rung's
 * own incident vocabulary. Week 3 adds the first booking, week 4 the second, and a booking once
 * added stays, so bookings accumulate and never shrink by construction.
 *
 * Week `n ≥ 3` is **dealt** only when every week from 3 to `n` is admitted, and a level is admitted
 * ({@link weekLevelAdmissionOf}) when all three hold:
 *
 * 1. **DC-10 admits every day as dealt**, each booked day read off a census row measured with exactly
 *    that day's bookings (`weekWay.ts#weekWayRowFor`);
 * 2. **DC-11 admits the week** (`weekDominance.ts`, [§ D1343](../../../../DECISIONS.md)): a
 *    `data/week-dominance.json` row for the order with these bookings, no profile over half;
 * 3. **the monotone clause**: no shipped profile, left alone, holds the level on more crowds than it
 *    held the week before ({@link WeekLevelAdmission.monotone}). Read per profile, which is the
 *    stricter of the two readings the ruling's sentence allows; owner-reversible.
 *
 * The highest week dealt is the tower's **top** ({@link weekTopOf}): `1` on a tower with no admitted
 * order, `2` on one whose first level is not admitted, and higher as levels are admitted in turn. A
 * week number above the top deals the top ({@link dealtWeekOf}), on every reader at once (the run's
 * bookings, the day's wrinkle, the week's deal, the house's census): a week is never dealt a level
 * the census has not admitted. The number itself counts on with each held week (`week.ts#rollWeek`,
 * as [§ D1394](../../../../DECISIONS.md) counts it on a week the census does not deal). The top is
 * where the sheet says the tower deals no further week (`nextWeek.ts`); other towers, whose ladders
 * stop at their first week, enter at their own week 1 and are never called harder than this one.
 *
 * ## Where the booking goes, and why it is checked here
 *
 * The ruling places each booking **on the day with the most room**: among the weekdays the level's
 * order deals that carry no booking yet, the one whose census row (with the bookings it inherits)
 * has the most held-out clears for the chosen play, the earlier day on a tie. Room is read off DC-10's
 * own rows, so it is a measurement; {@link weekLevelIssues} refuses a ladder whose authored booking
 * sits anywhere else. One car per morning keeps a booking what the ruling calls it, *a car out of
 * passenger service on a named morning*; a second car on a booked morning is a different booking and
 * is owner-reversible.
 *
 * ## What the run reads
 *
 * {@link weekBookingsOn}: the dealt level's bookings that fall on a day, handed by
 * `dev/state.ts#shiftRunConfigOf` to the run beside the rung's own absences, so the run, the brief's
 * strip, the tomorrow card, the stage's calls and the house's run all read one composition.
 */

import { dayKindOf } from '../wrinkles/draw.js';

import { CONTRACT_LADDER, type ContractIncident, type ContractLadder, type ContractWeekBooking, type ContractWeekOrder } from './ladder.js';
import type { WeekState } from './types.js';
import {
  bookingsOnDay,
  levelBookingsKeyOf,
  WEEK_DOMINANCE,
  weekDominanceOf,
  type WeekDominance,
  type WeekDominanceReading,
} from './weekDominance.js';
import { dealtWeekOrdersOf, orderedWrinkleIdFor, WEEK_ORDER_DAYS, weekOrderIndexOf, type WeekOrderDay } from './weekOrders.js';
import { dc10Of, WEEK_WAY, weekWayRowFor, type WeekWay } from './weekWay.js';

/** A week, as far as dealing a level needs. */
export type WeekLevelKey = Pick<WeekState, 'contractId' | 'week'>;

/** The first week a level can be: week 1 is the draw and week 2 the first order, with no booking. */
export const FIRST_LEVEL_WEEK = 3;

/** One authored level: the order week `week` is dealt and the bookings it carries. */
export interface WeekLevel {
  readonly contractId: string;
  readonly week: number;
  readonly order: ContractWeekOrder;
  /** The first `week − 2` authored bookings, in the order they were added. */
  readonly bookings: readonly ContractWeekBooking[];
  /** The one booking this level adds, the last of {@link bookings}. */
  readonly added: ContractWeekBooking;
}

/** The order week `week` of the cycle deals, or `undefined` where it deals week 1's draw. */
function cycleOrderOf(contractId: string, week: number, census: WeekWay, ladder: ContractLadder, dominance: WeekDominance): ContractWeekOrder | undefined {
  if (ladder === CONTRACT_LADDER && dominance === WEEK_DOMINANCE) {
    return dealtWeekOrdersOf(contractId, census)[weekOrderIndexOf({ contractId, week }, census)];
  }
  const dealt = dealtWeekOrdersOf(contractId, census, ladder, dominance);
  if (week === 1 || dealt.length <= 1) return undefined;
  return dealt[1 + ((week - 2) % (dealt.length - 1))];
}

/**
 * **The level week `week` would be, as authored**, or `undefined`: a week below 3, a tower with no
 * admitted order (it deals week 1's draw every week), or a week past the rung's last booking. Says
 * nothing about admission ({@link weekLevelAdmissionOf}).
 */
export function authoredLevelOf(
  contractId: string,
  week: number,
  census: WeekWay = WEEK_WAY,
  ladder: ContractLadder = CONTRACT_LADDER,
  dominance: WeekDominance = WEEK_DOMINANCE,
): WeekLevel | undefined {
  if (!Number.isInteger(week) || week < FIRST_LEVEL_WEEK) return undefined;
  const rung = ladder.rows.find((row) => row.contractId === contractId);
  const count = week - 2;
  if (rung === undefined || rung.weekBookings.length < count) return undefined;
  const order = cycleOrderOf(contractId, week, census, ladder, dominance);
  if (order === undefined) return undefined;
  const bookings = rung.weekBookings.slice(0, count);
  const added = bookings[count - 1];
  return added === undefined ? undefined : { contractId, week, order, bookings, added };
}

/** Whether a level is dealt, and why not. */
export type WeekLevelVerdict = 'admitted' | 'refused' | 'unmeasured';

/** One profile whose holds rose from the week before to the level. */
export interface RisingHold {
  readonly profileId: string;
  readonly before: number;
  readonly after: number;
}

/** What the census says about one authored level. Every field is arithmetic over the data files. */
export interface WeekLevelAdmission {
  readonly level: WeekLevel;
  /** Each weekday as the level deals it, read off the census row measured with that day's bookings. */
  readonly days: readonly WeekOrderDay[];
  /** DC-11 on the level: the order with these bookings. */
  readonly dominance: WeekDominanceReading;
  /** DC-11's reading of the week before, as it is dealt: the clause's other side. */
  readonly before: WeekDominanceReading;
  /** The monotone clause: no profile holds the level on more crowds than it held the week before. */
  readonly monotone: {
    readonly holds: boolean;
    readonly rising: readonly RisingHold[];
    /** Profiles the protocol names that either reading does not carry. */
    readonly missing: readonly string[];
  };
  readonly verdict: WeekLevelVerdict;
  /** Why a level is not dealt, in one clause; `undefined` for an admitted level. */
  readonly because: string | undefined;
}

/** DC-11's reading of the week before `week`: the order for week 2, the level before for a later week. */
function readingOfWeek(
  contractId: string,
  week: number,
  census: WeekWay,
  ladder: ContractLadder,
  dominance: WeekDominance,
): WeekDominanceReading | undefined {
  if (week < 2) return undefined;
  if (week === 2) {
    const order = cycleOrderOf(contractId, 2, census, ladder, dominance);
    return order === undefined ? undefined : weekDominanceOf(contractId, order, census, dominance);
  }
  const level = authoredLevelOf(contractId, week, census, ladder, dominance);
  return level === undefined ? undefined : weekDominanceOf(contractId, level.order, census, dominance, level.bookings);
}

/**
 * **Whether the census deals an authored level** — see the module docstring. `undefined` where week
 * `week` is no authored level ({@link authoredLevelOf}).
 */
export function weekLevelAdmissionOf(
  contractId: string,
  week: number,
  census: WeekWay = WEEK_WAY,
  dominance: WeekDominance = WEEK_DOMINANCE,
  ladder: ContractLadder = CONTRACT_LADDER,
): WeekLevelAdmission | undefined {
  const level = authoredLevelOf(contractId, week, census, ladder, dominance);
  if (level === undefined) return undefined;
  const horizon = census.protocol.horizon;
  const days = Array.from({ length: WEEK_ORDER_DAYS }, (_, index): WeekOrderDay => {
    const day = index + 1;
    const eventId = level.order.days[index] ?? '';
    const found = weekWayRowFor(contractId, day, eventId, horizon, census, bookingsOnDay(level.bookings, day));
    const row = found?.eventId === eventId ? found : undefined;
    const reason = row === undefined ? 'unmeasured' : dc10Of(row, census.protocol).admitted ? 'admitted' : 'refused';
    return { day, eventId, row, reason };
  });
  const reading = weekDominanceOf(contractId, level.order, census, dominance, level.bookings);
  const before = readingOfWeek(contractId, week - 1, census, ladder, dominance) ?? reading;
  const profiles = dominance.protocol.profiles;
  const rising: RisingHold[] = [];
  const missing: string[] = [];
  for (const profileId of profiles) {
    const after = reading.holds.find((hold) => hold.profileId === profileId);
    const was = before.holds.find((hold) => hold.profileId === profileId);
    if (after === undefined || was === undefined) {
      missing.push(profileId);
      continue;
    }
    if (after.held > was.held) rising.push({ profileId, before: was.held, after: after.held });
  }
  const monotone = { holds: rising.length === 0 && missing.length === 0, rising, missing };
  const refusedDay = days.find((entry) => entry.reason === 'refused');
  const unmeasuredDay = days.find((entry) => entry.reason === 'unmeasured');
  const dayName = (day: number): string => WEEKDAY_NAMES[day - 1] ?? `day ${String(day)}`;
  let verdict: WeekLevelVerdict = 'admitted';
  let because: string | undefined;
  if (refusedDay !== undefined) {
    verdict = 'refused';
    because = `DC-10 refuses ${dayName(refusedDay.day)} as this level deals it`;
  } else if (reading.verdict === 'refused') {
    verdict = 'refused';
    because = `${reading.strongest?.profileId ?? 'one profile'} holds it on ${String(reading.strongest?.held ?? 0)} of ${String(dominance.protocol.heldOutCount)} crowds, over DC-11’s ${String(reading.atMost)}`;
  } else if (rising.length > 0) {
    verdict = 'refused';
    const first = rising[0];
    because =
      first === undefined
        ? 'a profile holds it more often than the week before'
        : `${first.profileId} holds it on ${String(first.after)} crowds against ${String(first.before)} the week before`;
  } else if (unmeasuredDay !== undefined) {
    verdict = 'unmeasured';
    because = `${dayName(unmeasuredDay.day)} has not been measured as this level deals it`;
  } else if (reading.verdict === 'unmeasured' || missing.length > 0) {
    verdict = 'unmeasured';
    because = reading.unmeasuredBecause ?? 'some profiles have not been measured on it';
  }
  return { level, days: Object.freeze(days), dominance: reading, before, monotone, verdict, because };
}

/** Monday to Friday, the days a booking may fall on, as the sheet names them. */
export const WEEKDAY_NAMES: readonly string[] = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

const TOPS = new WeakMap<WeekWay, Map<string, number>>();

/**
 * **The highest week a tower deals**: `1` where no authored order is admitted, else `2` plus every
 * level admitted in turn from week 3. A refused or unmeasured level ends the ladder there, so a level
 * above it is never dealt even if it would pass. Unbounded on a tower that cycles admitted orders
 * and authors no booking, whose weeks are § D1343's cycle and have no top.
 */
export function weekTopOf(
  contractId: string,
  census: WeekWay = WEEK_WAY,
  dominance: WeekDominance = WEEK_DOMINANCE,
  ladder: ContractLadder = CONTRACT_LADDER,
): number {
  const shipped = ladder === CONTRACT_LADDER && dominance === WEEK_DOMINANCE;
  let cache = shipped ? TOPS.get(census) : undefined;
  const cached = cache?.get(contractId);
  if (cached !== undefined) return cached;
  const orders = dealtWeekOrdersOf(contractId, census, ladder, dominance).length;
  const authored = ladder.rows.find((row) => row.contractId === contractId)?.weekBookings.length ?? 0;
  /*
   * A tower that cycles admitted orders and authors no booking keeps § D1343's cycle, a week for
   * every number: it has no levels, so nothing here may stop it. Today every tower with an admitted
   * order authors bookings (Midtown), so this arm is the rule for the next one.
   */
  let top = orders > 1 && authored === 0 ? Number.POSITIVE_INFINITY : orders > 1 ? 2 : 1;
  if (top === 2) {
    for (let week = FIRST_LEVEL_WEEK; ; week += 1) {
      const admission = weekLevelAdmissionOf(contractId, week, census, dominance, ladder);
      if (admission?.verdict !== 'admitted') break;
      top = week;
    }
  }
  if (shipped) {
    if (cache === undefined) {
      cache = new Map();
      TOPS.set(census, cache);
    }
    cache.set(contractId, top);
  }
  return top;
}

/**
 * **The week of the tower's ladder a week is dealt**: its own number, at least 1, and never above the
 * top. A week numbered above the top (a week saved before a census re-run refused a level) deals
 * the top, so no run is built from a level the census does not admit.
 */
export function dealtWeekOf(key: WeekLevelKey, census: WeekWay = WEEK_WAY): number {
  const week = Math.max(1, Math.trunc(key.week));
  return Math.min(week, weekTopOf(key.contractId, census));
}

/** The level a week is dealt, or `undefined` for week 1, week 2 and a tower with no level dealt. */
export function dealtLevelOf(key: WeekLevelKey, census: WeekWay = WEEK_WAY): WeekLevel | undefined {
  return authoredLevelOf(key.contractId, dealtWeekOf(key, census), census);
}

/**
 * **The week bookings a day is dealt**: the dealt level's bookings on this weekday, without the day.
 * Empty on the weekend, on a day past the fifth, in weeks 1 and 2 and on a tower with no level
 * dealt. Read by `dev/state.ts#shiftRunConfigOf` for the run and by the census readers for the row.
 */
export function weekBookingsOn(
  key: WeekLevelKey,
  day: number,
  dayIdx: number,
  census: WeekWay = WEEK_WAY,
): readonly ContractIncident[] {
  if (day < 1 || day > WEEK_ORDER_DAYS || dayKindOf(dayIdx) !== 'weekday') return [];
  const level = dealtLevelOf(key, census);
  return level === undefined ? [] : bookingsOnDay(level.bookings, day);
}

/**
 * **The drawn id a week deals on a day**, on the week it is dealt ({@link dealtWeekOf}) — what
 * `calendar.ts#scheduledEventFor` reads, so a week above the top deals the top's wrinkles too.
 */
export function levelWrinkleIdFor(key: WeekLevelKey, day: number, dayIdx: number, census: WeekWay = WEEK_WAY): string | undefined {
  return orderedWrinkleIdFor({ contractId: key.contractId, week: dealtWeekOf(key, census) }, day, dayIdx, census);
}

/**
 * **One key per distinct week as dealt**: the order's place in the cycle and the bookings. Two week
 * numbers with one key are one week of runs (the house's readings, the week deal's cache); two keys
 * are different days somewhere in the week.
 */
export function weekLevelKeyOf(key: WeekLevelKey, census: WeekWay = WEEK_WAY): string {
  const week = dealtWeekOf(key, census);
  const level = authoredLevelOf(key.contractId, week, census);
  return `${String(weekOrderIndexOf({ contractId: key.contractId, week }, census))}|${level === undefined ? '' : levelBookingsKeyOf(level.bookings)}`;
}

/**
 * **The turn key a held week is paid under** — wave AO, lane DS-1 ([§ D1402](../../../../DECISIONS.md)):
 * the tower and the week as dealt, `c2/3`. A week numbered past the top is dealt the top, so it names
 * the top's level and a run of held weeks there pays once; a tower with no level dealt names week 1,
 * or week 2 where an order is dealt. The server bounds the key by the authored ladder
 * (`packages/server/src/chimes/ledger.ts#weekLevelKeysOf`), which is a superset of what is dealt.
 */
export function weekLevelAwardKeyOf(key: WeekLevelKey, census: WeekWay = WEEK_WAY): string {
  /*
   * Never past the levels the rung authors: a tower that cycles orders with no booking pays its
   * week 2 once, whichever order a later week deals, as the server's bound reads it.
   */
  const orders = dealtWeekOrdersOf(key.contractId, census).length;
  const authored = 2 + (CONTRACT_LADDER.rows.find((row) => row.contractId === key.contractId)?.weekBookings.length ?? 0);
  return `${key.contractId}/${String(Math.min(dealtWeekOf(key, census), orders > 1 ? authored : 1))}`;
}

/**
 * **Whether a tower deals a further week after `week`**: the next week is at or below the top. The
 * sheet's *no further week* and its onward press read this.
 */
export function hasFurtherWeek(key: WeekLevelKey, census: WeekWay = WEEK_WAY): boolean {
  return dealtWeekOf(key, census) < weekTopOf(key.contractId, census);
}

/* -------------------------------------------------------------------------- *
 * The authored bookings, checked
 * -------------------------------------------------------------------------- */

/** One weekday's room: the chosen play's held-out clears on the day as the level inherits it. */
export interface DayRoom {
  readonly day: number;
  readonly clears: number | undefined;
}

/**
 * **The day each booking must sit on**, by the ruling's placement rule (see the module docstring):
 * among the weekdays the level's order deals with no booking yet, the one with the most room, the
 * earlier on a tie. `undefined` where some candidate day is unmeasured, so no placement can be read.
 */
export function placementOf(
  contractId: string,
  week: number,
  census: WeekWay = WEEK_WAY,
  ladder: ContractLadder = CONTRACT_LADDER,
  dominance: WeekDominance = WEEK_DOMINANCE,
): { readonly day: number | undefined; readonly rooms: readonly DayRoom[] } | undefined {
  const level = authoredLevelOf(contractId, week, census, ladder, dominance);
  if (level === undefined) return undefined;
  const inherited = level.bookings.slice(0, -1);
  const rooms: DayRoom[] = [];
  for (let day = 1; day <= WEEK_ORDER_DAYS; day += 1) {
    if (inherited.some((booking) => booking.day === day)) continue;
    const eventId = level.order.days[day - 1] ?? '';
    const found = weekWayRowFor(contractId, day, eventId, census.protocol.horizon, census, bookingsOnDay(inherited, day));
    const row = found?.eventId === eventId ? found : undefined;
    rooms.push({ day, clears: row === undefined ? undefined : dc10Of(row, census.protocol).chosenClears });
  }
  if (rooms.some((room) => room.clears === undefined)) return { day: undefined, rooms };
  const best = rooms.reduce<DayRoom | undefined>(
    (top, room) => (top === undefined || (room.clears ?? -1) > (top.clears ?? -1) ? room : top),
    undefined,
  );
  return { day: best?.day, rooms };
}

/**
 * **Every way the authored bookings can be wrong against the census**, collected; the shipped
 * ladder answers `[]` (`weekLevels.test.ts`). The rung-level checks (a real car, a window, a weekday,
 * a bank never emptied) are `ladder.ts#contractLadderIssues`'; this holds the placement rule, which
 * needs the census, and refuses a booking on a tower whose weeks cycle no order.
 */
export function weekLevelIssues(
  ladder: ContractLadder = CONTRACT_LADDER,
  census: WeekWay = WEEK_WAY,
  dominance: WeekDominance = WEEK_DOMINANCE,
): readonly string[] {
  const issues: string[] = [];
  for (const rung of ladder.rows) {
    if (rung.weekBookings.length === 0) continue;
    if (dealtWeekOrdersOf(rung.contractId, census, ladder, dominance).length <= 1) {
      issues.push(`${rung.contractId} authors week bookings and deals no order to add them to`);
      continue;
    }
    rung.weekBookings.forEach((booking, index) => {
      const week = FIRST_LEVEL_WEEK + index;
      const placement = placementOf(rung.contractId, week, census, ladder, dominance);
      if (placement === undefined) return;
      if (placement.day === undefined) {
        /* An unmeasured candidate leaves the placement unreadable; a level that far up is not dealt either. */
        const admission = weekLevelAdmissionOf(rung.contractId, week, census, dominance, ladder);
        if (admission?.verdict === 'admitted') {
          issues.push(`${rung.contractId} week ${String(week)} is dealt and its booking's placement cannot be read: a candidate day is unmeasured`);
        }
        return;
      }
      if (placement.day !== booking.day) {
        issues.push(
          `${rung.contractId} week ${String(week)} books car ${booking.carId} on day ${String(booking.day)}, and the day with the most room is day ${String(placement.day)}`,
        );
      }
    });
  }
  return issues;
}

/* -------------------------------------------------------------------------- *
 * Words
 * -------------------------------------------------------------------------- */

/**
 * **One booking in the sheet's words**: *car C is out of passenger service on Monday from 08:00
 * until 12:00*, or in `'short'` form, after a clause that already says *out of passenger service*,
 * *car C on Monday from 08:00 until 12:00*. `clock` turns a fraction of the run into the run's clock
 * (the sheet's and the door's callers know the day's start and length, `dev/state.ts#plannedDayOf`);
 * without it the sentence names the day and no time, because a time with no source is a figure the
 * run did not produce.
 */
export function bookingPhraseOf(
  booking: ContractWeekBooking,
  clock?: (fraction: number) => string,
  form: 'sentence' | 'short' = 'sentence',
): string {
  const day = WEEKDAY_NAMES[booking.day - 1] ?? `day ${String(booking.day)}`;
  const head = form === 'short' ? `car ${booking.carId} on ${day}` : `car ${booking.carId} is out of passenger service on ${day}`;
  if (clock === undefined) return `${head} for part of the day`;
  const away = clock(Math.max(0, booking.fromFraction));
  const back = booking.toFraction >= 1 ? undefined : clock(booking.toFraction);
  return back === undefined ? `${head} from ${away} to the end of the day` : `${head} from ${away} until ${back}`;
}

/** The bookings week `b` deals that week `a` does not, in the order they were added. */
export function bookingsAddedBetween(contractId: string, a: number, b: number, census: WeekWay = WEEK_WAY): readonly ContractWeekBooking[] {
  const from = authoredLevelOf(contractId, dealtWeekOf({ contractId, week: a }, census), census)?.bookings ?? [];
  const to = authoredLevelOf(contractId, dealtWeekOf({ contractId, week: b }, census), census)?.bookings ?? [];
  return to.slice(from.length);
}
