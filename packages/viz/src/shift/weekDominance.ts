/**
 * **No week after the first is held by one dropdown** — wave AN, lane DQ-2, swarm DQ's Q2 rule 2
 * ([§ D1343](../../../../DECISIONS.md)).
 *
 * ## What was wrong
 *
 * Three members of swarm DQ measured Midtown Office's week with each shipped dispatcher left alone
 * and nothing pressed, and found the same thing: the house cleared about a quarter of the
 * day-crowds and held no week, while Fairness first, Predictive balanced and the auction each
 * cleared most days and held most weeks. The brief's picker decided the week, and the authored
 * later weeks (`data/contract-ladder.json`'s `weekOrders`, [§ D1252](../../../../DECISIONS.md))
 * were easier still: on four census crowds Fairness first and Predictive balanced each cleared 19
 * of week 2's 20 days. A second week a dropdown holds teaches nothing the first did not.
 *
 * ## The rule
 *
 * **From week 2, an authored week order is dealt only if no single shipped profile, with nothing
 * pressed, holds that week's target on more than half of its census crowds.** It is `docs/33`
 * DC-11, beside DC-10's day rule: DC-10 asks each day for a way through and a reason to decide, and
 * this asks the week whether one dropdown is the way through. It moves no bar and no target; it
 * chooses which measured weeks are dealt, as § D1252's admission already does. Week 1 is the
 * newcomer's week and is not an authored order, so the rule never reaches it (Midtown's week 1
 * stays as it is, which is the ruling's own exemption).
 *
 * *Holds the week's target* is read exactly as the week sheet reads a player's week: the days of
 * the order that count (`weekWay.ts#dayStakeReasonOf`, the rule `weekStake.ts` deals by), the
 * target derived from them (`weekWay.ts#weekTargetFor`), and on each census crowd the profile
 * holds the week when it cleared at least the target of the counted days. The census crowds are
 * DC-10's held-out crowds, so the standing order's verdicts here are the census rows' own
 * (`weekDominanceIssues` holds the two to the crowd).
 *
 * The threshold is {@link WeekDominanceProtocol.oneProfileHoldsAtMost}, one figure in
 * `data/week-dominance.json`, and it is **owner-reversible**: swarm DQ's S1 and S2 proposed half
 * and S3 a third, and the ruling took half.
 *
 * ## What a row is, and what admits an order
 *
 * A row of `data/week-dominance.json` is one authored order measured by the census command
 * `shift/weekWay.sweep.test.ts` documents (`WEEK_WAY_STAGE=profiles` with `WEEK_WAY_CELLS` naming
 * the order's five days): for each profile, one verdict string per weekday over the held-out
 * crowds. Holds are derived, never stored. An order is:
 *
 * - **refused** as soon as one measured profile holds it on more than the threshold's share of the
 *   crowds, which a row naming only some profiles can already show;
 * - **admitted** only when every profile the protocol names was measured and none holds it on more
 *   than that share;
 * - **unmeasured** otherwise: no row, a row measured over other days than the order deals, a
 *   weekend day that counts (the row measures the five authored days only), or some profile not
 *   yet measured with none over the line.
 *
 * Only an admitted order is dealt (`weekOrders.ts#dealtWeekOrdersOf`), and a refused one stays
 * authored, undealt, with this reading saying which profile held it and on how many crowds.
 */

import weekDominanceDocument from '../../../../data/week-dominance.json' with { type: 'json' };

import { drawWrinkle } from '../wrinkles/draw.js';
import { WRINKLE_LIBRARY } from '../wrinkles/library.js';

import { ladderRowFor, type ContractIncident, type ContractWeekBooking, type ContractWeekOrder } from './ladder.js';
import {
  bookingsKeyOf,
  crowdDates,
  dayStakeReasonOf,
  WEEK_WAY,
  weekTargetFor,
  weekWayRowFor,
  type WeekWay,
} from './weekWay.js';

/** The screen's fixed settings. */
export interface WeekDominanceProtocol {
  /** DC-10's held-out crowds, which this screen measures on: the first date and how many. */
  readonly heldOutFrom: string;
  readonly heldOutCount: number;
  /**
   * **The owner-reversible threshold**: an order is refused when one profile holds it on more than
   * this share of the crowds. `0.5` is the ruling's *more than half*.
   */
  readonly oneProfileHoldsAtMost: number;
  /** Every shipped profile, in `data/dispatcher-profiles.json`'s order: the profiles admission needs. */
  readonly profiles: readonly string[];
}

/** One authored order, measured: per profile, one `C`/`m` string per weekday, in crowd order. */
export interface WeekDominanceRow {
  readonly contractId: string;
  readonly orderId: string;
  /** The five drawn ids the row was measured under, Monday to Friday. */
  readonly days: readonly string[];
  /**
   * **The week level's bookings the row was measured with**, each on its weekday — wave AO, lane
   * DS-1, [§ D1400](../../../../DECISIONS.md). Empty for an order measured as an order, which is
   * every row before levels. A row is a level's only when the order and the bookings both match.
   */
  readonly bookings: readonly ContractWeekBooking[];
  readonly verdicts: Readonly<Record<string, readonly string[]>>;
}

export interface WeekDominance {
  readonly version: number;
  readonly protocol: WeekDominanceProtocol;
  readonly rows: readonly WeekDominanceRow[];
}

/* -------------------------------------------------------------------------- *
 * Parsing and the shipped screen
 * -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}
function asStrings(value: unknown): readonly string[] {
  return Object.freeze(Array.isArray(value) ? value.map(asString) : []);
}

/** Structure only; {@link weekDominanceIssues} is where a malformed field is named. */
export function parseWeekDominance(input: unknown): WeekDominance {
  const record = asRecord(input);
  const protocol = asRecord(record['protocol']);
  const rows = Array.isArray(record['rows']) ? (record['rows'] as unknown[]) : [];
  return Object.freeze({
    version: asNumber(record['version']),
    protocol: Object.freeze({
      heldOutFrom: asString(protocol['heldOutFrom']),
      heldOutCount: asNumber(protocol['heldOutCount']),
      oneProfileHoldsAtMost: asNumber(protocol['oneProfileHoldsAtMost']),
      profiles: asStrings(protocol['profiles']),
    }),
    rows: Object.freeze(
      rows.map((value) => {
        const row = asRecord(value);
        const verdicts = asRecord(row['verdicts']);
        return Object.freeze({
          contractId: asString(row['contractId']),
          orderId: asString(row['orderId']),
          days: asStrings(row['days']),
          bookings: Object.freeze(
            (Array.isArray(row['bookings']) ? (row['bookings'] as unknown[]) : []).map((raw) => {
              const entry = asRecord(raw);
              return Object.freeze({
                kind: asString(entry['kind']) as ContractWeekBooking['kind'],
                bankId: asString(entry['bankId']),
                carId: asString(entry['carId']),
                fromFraction: asNumber(entry['fromFraction']),
                toFraction: asNumber(entry['toFraction']),
                day: asNumber(entry['day']),
              });
            }),
          ),
          verdicts: Object.freeze(
            Object.fromEntries(Object.entries(verdicts).map(([id, strings]) => [id, asStrings(strings)])),
          ),
        });
      }),
    ),
  });
}

/** The shipped screen. */
export const WEEK_DOMINANCE: WeekDominance = parseWeekDominance(weekDominanceDocument);

/* -------------------------------------------------------------------------- *
 * The reading
 * -------------------------------------------------------------------------- */

/** How many weekdays an order authors, and the screen measures. */
const ORDER_DAYS = 5;

/** One profile's holds on one order. */
export interface ProfileHold {
  readonly profileId: string;
  /** Crowds on which the profile, left alone, cleared at least the target of the counted days. */
  readonly held: number;
  /** Crowds measured. */
  readonly n: number;
}

export type WeekDominanceVerdict = 'admitted' | 'refused' | 'unmeasured';

/** What the screen says about one authored order. Every field is arithmetic over the row. */
export interface WeekDominanceReading {
  readonly verdict: WeekDominanceVerdict;
  readonly row: WeekDominanceRow | undefined;
  /** The order's counted days, `1` to `7`, by DC-10's rows as dealt. */
  readonly counted: readonly number[];
  /** The week's target: counted days minus one, at least one, none for none. */
  readonly target: number;
  /** Every measured profile's holds, in the protocol's profile order. */
  readonly holds: readonly ProfileHold[];
  /** The measured profile holding it on the most crowds, the first in profile order on a tie. */
  readonly strongest: ProfileHold | undefined;
  /** The most crowds one profile may hold it on: the threshold's share of the crowds, rounded down. */
  readonly atMost: number;
  /** Profiles the protocol names and the row does not carry. */
  readonly missing: readonly string[];
  /** Why an unmeasured reading is unmeasured, in one clause; `undefined` otherwise. */
  readonly unmeasuredBecause: string | undefined;
}

/** The bookings of a level that fall on `day`, without the day: what that day's census row was measured with. */
export function bookingsOnDay(bookings: readonly ContractWeekBooking[], day: number): readonly ContractIncident[] {
  return bookings
    .filter((booking) => booking.day === day)
    .map(({ kind, bankId, carId, fromFraction, toFraction }) => ({ kind, bankId, carId, fromFraction, toFraction }));
}

/** One spelling of a level's bookings, each with its day, so a row and a level match on what was booked. */
export function levelBookingsKeyOf(bookings: readonly ContractWeekBooking[]): string {
  return [1, 2, 3, 4, 5, 6, 7]
    .map((day) => {
      const key = bookingsKeyOf(bookingsOnDay(bookings, day));
      return key === '' ? '' : `${String(day)}:${key}`;
    })
    .filter((key) => key !== '')
    .join(';');
}

/** The weekend day ids week 1 draws, which an authored order does not move. */
function weekendIdsOf(census: WeekWay): readonly string[] {
  return [6, 7].map((day) => drawWrinkle(WRINKLE_LIBRARY, day, day - 1, census.protocol.horizon).id);
}

/** Whether every verdict string a profile carries is one mark per crowd. */
function wellFormed(strings: readonly string[] | undefined, n: number): strings is readonly string[] {
  return (
    strings !== undefined &&
    strings.length === ORDER_DAYS &&
    strings.every((marks) => marks.length === n && /^[Cm]*$/.test(marks))
  );
}

/**
 * **The one-profile screen's reading of an authored order** — see the module docstring.
 *
 * The counted days are the order's own, read off DC-10's rows for each day as dealt; a day with no
 * current row is unmeasured and does not count, exactly as the week deals it.
 */
export function weekDominanceOf(
  contractId: string,
  order: ContractWeekOrder,
  census: WeekWay = WEEK_WAY,
  dominance: WeekDominance = WEEK_DOMINANCE,
  /*
   * A week level's bookings (wave AO lane DS-1, § D1400; `shift/weekLevels.ts`): each booked day is
   * read off its census row measured with that day's bookings, and the row read is the level's, the
   * order and the bookings both matching. Empty for an order read as an order.
   */
  bookings: readonly ContractWeekBooking[] = [],
): WeekDominanceReading {
  const p = dominance.protocol;
  const n = p.heldOutCount;
  const atMost = Math.floor(p.oneProfileHoldsAtMost * n + 1e-9);
  const horizon = census.protocol.horizon;
  const countedOf = (day: number, eventId: string): boolean => {
    const found = weekWayRowFor(contractId, day, eventId, horizon, census, bookingsOnDay(bookings, day));
    return dayStakeReasonOf(found?.eventId === eventId ? found : undefined, census) === 'contested';
  };
  const weekdays = order.days.map((eventId, index) => (countedOf(index + 1, eventId) ? index + 1 : 0)).filter((day) => day > 0);
  const weekend = weekendIdsOf(census)
    .map((eventId, index) => (countedOf(index + 6, eventId) ? index + 6 : 0))
    .filter((day) => day > 0);
  const counted = Object.freeze([...weekdays, ...weekend]);
  const target = weekTargetFor(counted.length);
  const row = dominance.rows.find(
    (entry) =>
      entry.contractId === contractId &&
      entry.orderId === order.id &&
      entry.days.length === order.days.length &&
      entry.days.every((id, index) => id === order.days[index]) &&
      levelBookingsKeyOf(entry.bookings) === levelBookingsKeyOf(bookings),
  );
  const empty = (because: string): WeekDominanceReading => ({
    verdict: 'unmeasured',
    row,
    counted,
    target,
    holds: [],
    strongest: undefined,
    atMost,
    missing: p.profiles,
    unmeasuredBecause: because,
  });
  if (row === undefined) return empty('the screen has not measured this order over the days it deals');
  if (weekend.length > 0) return empty('a weekend day counts, and the screen measures the five weekdays only');
  const holds: ProfileHold[] = [];
  const missing: string[] = [];
  for (const profileId of p.profiles) {
    const strings = row.verdicts[profileId];
    if (!wellFormed(strings, n)) {
      missing.push(profileId);
      continue;
    }
    let held = 0;
    for (let crowd = 0; crowd < n; crowd += 1) {
      const clears = weekdays.filter((day) => strings[day - 1]?.[crowd] === 'C').length;
      if (target > 0 && clears >= target) held += 1;
    }
    holds.push({ profileId, held, n });
  }
  const strongest = holds.reduce<ProfileHold | undefined>(
    (best, hold) => (best === undefined || hold.held > best.held ? hold : best),
    undefined,
  );
  const over = strongest !== undefined && strongest.held > atMost;
  const verdict: WeekDominanceVerdict = over ? 'refused' : missing.length === 0 ? 'admitted' : 'unmeasured';
  return {
    verdict,
    row,
    counted,
    target,
    holds: Object.freeze(holds),
    strongest,
    atMost,
    missing: Object.freeze(missing),
    unmeasuredBecause: verdict === 'unmeasured' ? 'some profiles have not been measured on it' : undefined,
  };
}

/**
 * **The two profiles the screen shows holding an order's week on the most crowds**, in that order,
 * the first in the protocol's profile order on a tie — wave AO, lane DR-2,
 * [§ D1441](../../../../DECISIONS.md), swarm DR's S1: the drivers a player who read the census would
 * pick, so the call bands (`callBands.ts`) are measured under them. Empty where the screen has not
 * measured the order; no name is written anywhere.
 */
export function bandedProfilesOf(
  contractId: string,
  order: ContractWeekOrder,
  census: WeekWay = WEEK_WAY,
  dominance: WeekDominance = WEEK_DOMINANCE,
): readonly string[] {
  const holds = weekDominanceOf(contractId, order, census, dominance).holds;
  return Object.freeze(
    holds
      .map((hold, index) => ({ hold, index }))
      .sort((a, b) => b.hold.held - a.hold.held || a.index - b.index)
      .slice(0, 2)
      .map(({ hold }) => hold.profileId),
  );
}

/* -------------------------------------------------------------------------- *
 * The shipped screen, checked
 * -------------------------------------------------------------------------- */

/**
 * **Every way the screen can be wrong or stale**, collected; the shipped file must answer `[]`
 * (`weekDominance.test.ts`).
 *
 * The protocol measures on DC-10's held-out crowds and names every shipped profile; each row names
 * an order authored on its rung, over exactly the days that order deals, with well-formed strings
 * for the profiles it carries; and **the standing order's strings are the census rows' own**: the
 * house left alone on a day is one run, so a row whose house string differs from DC-10's for that
 * day as dealt was measured on a different day, a different crowd or a different build.
 */
export function weekDominanceIssues(
  dominance: WeekDominance,
  orders: (contractId: string) => readonly ContractWeekOrder[] | undefined,
  shippedProfiles: readonly string[],
  census: WeekWay = WEEK_WAY,
  /* The rung's authored week bookings (§ D1400): a row's bookings must be a level's, the first k of them. */
  weekBookings: (contractId: string) => readonly ContractWeekBooking[] = (contractId) => ladderRowFor(contractId)?.weekBookings ?? [],
): readonly string[] {
  const issues: string[] = [];
  const p = dominance.protocol;
  if (p.heldOutFrom !== census.protocol.heldOutFrom || p.heldOutCount !== census.protocol.heldOutCount) {
    issues.push('protocol crowds are not DC-10’s held-out crowds');
  }
  if (!(p.oneProfileHoldsAtMost > 0 && p.oneProfileHoldsAtMost < 1)) {
    issues.push(`protocol oneProfileHoldsAtMost is ${String(p.oneProfileHoldsAtMost)}`);
  }
  if (p.profiles.join(',') !== shippedProfiles.join(',')) {
    issues.push('protocol profiles are not every shipped profile in file order; re-run the screen');
  }
  if (crowdDates(p.heldOutFrom, p.heldOutCount).length !== p.heldOutCount) issues.push('protocol crowds do not resolve');
  const seen = new Set<string>();
  for (const row of dominance.rows) {
    const levelKey = levelBookingsKeyOf(row.bookings);
    const key = `${row.contractId}/${row.orderId}${levelKey === '' ? '' : `+${levelKey}`}`;
    if (seen.has(key)) issues.push(`row ${key} is measured twice`);
    if (row.bookings.length > 0) {
      const authored = weekBookings(row.contractId);
      const prefix = authored.slice(0, row.bookings.length);
      if (prefix.length !== row.bookings.length || levelBookingsKeyOf(prefix) !== levelBookingsKeyOf(row.bookings)) {
        issues.push(`row ${key} carries bookings that are not the first ${String(row.bookings.length)} the rung authors`);
      }
    }
    seen.add(key);
    const order = orders(row.contractId)?.find((entry) => entry.id === row.orderId);
    if (order === undefined) {
      issues.push(`row ${key} names no authored order`);
      continue;
    }
    if (row.days.join('|') !== order.days.join('|')) {
      issues.push(`row ${key} was measured over ${row.days.join(', ')}, and the order deals ${order.days.join(', ')}`);
    }
    for (const [profileId, strings] of Object.entries(row.verdicts)) {
      if (!p.profiles.includes(profileId)) issues.push(`row ${key} carries ${profileId}, which the protocol does not name`);
      if (!wellFormed(strings, p.heldOutCount)) {
        issues.push(`row ${key} ${profileId} is not five strings of ${String(p.heldOutCount)} marks of C or m`);
      }
    }
    const house = row.verdicts[census.protocol.standingOrder];
    row.days.forEach((eventId, index) => {
      const found = weekWayRowFor(
        row.contractId,
        index + 1,
        eventId,
        census.protocol.horizon,
        census,
        bookingsOnDay(row.bookings, index + 1),
      );
      if (house === undefined || found?.eventId !== eventId) return;
      if (house[index] !== found.standingVerdicts) {
        issues.push(`row ${key} day ${String(index + 1)}: the standing order's marks differ from the census row's`);
      }
    });
  }
  return issues;
}
