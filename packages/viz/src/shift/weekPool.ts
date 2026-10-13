/**
 * **Days that can be won: the measured pool a counted day is dealt from** — wave AP, lane DT-1,
 * swarm DT's ruling Q1 and Q2 ([§ D1459](../../../../DECISIONS.md) to [§ D1462](../../../../DECISIONS.md)).
 */

import weekPoolDocument from '../../../../data/week-pool.json' with { type: 'json' };

import { drawWrinkle } from '../wrinkles/draw.js';
import { WRINKLE_LIBRARY } from '../wrinkles/library.js';

import { CONTRACT_LADDER, type ContractIncident, type ContractWeekBooking, type ContractWeekOrder } from './ladder.js';
import { bandedProfilesOf, bookingsOnDay } from './weekDominance.js';
import { WEEK_ORDER_DAYS, weekOrderFor } from './weekOrders.js';
import {
  bookingsKeyOf,
  crowdDates,
  dayStakeReasonOf,
  WEEK_WAY,
  weekTargetFor,
  weekWayRowFor,
  type WeekWay,
} from './weekWay.js';

/* -------------------------------------------------------------------------- *
 * The file
 * -------------------------------------------------------------------------- */

/** A crowd's measured tag. */
export type PoolTag = 'dead' | 'need' | 'live';

export interface WeekPoolProtocol {
  readonly contractId: string;
  /** The first of the dates the pool's crowds are spelled from, and how many crowds a cell holds. */
  readonly crowdsFrom: string;
  readonly crowdCount: number;
  /** The last week the pool measures: week 2 and each booking level up to it. */
  readonly throughWeek: number;
  /** The player's line: the answer given at every placement call; who drives is always kept. */
  readonly placement: 'leave';
  /** Every shipped profile, in `data/dispatcher-profiles.json`'s order: the order of a crowd's marks. */
  readonly profiles: readonly string[];
}

/** One raised call under a banded driver on the player's line, and the answers whose run cleared. */
export interface PoolCall {
  /** The banded driver the line was driven by. */
  readonly by: string;
  readonly atS: number;
  readonly question: 'placement' | 'driver';
  /** A who-drives call's pair, by profile id. */
  readonly offered?: readonly string[];
  /** The answers whose run from the call, nothing pressed after, cleared: a placement or a profile id. */
  readonly clears: readonly string[];
}

/** One measured crowd. */
export interface PoolCrowd {
  /** The crowd's seed as decimal digits ({@link poolCrowdSeedOf}), so anyone can replay it. */
  readonly seed: string;
  readonly tag: PoolTag;
  /** One mark per profile in protocol order: `C` cleared left alone, `m` missed, `-` not run. */
  readonly alone: string;
  /** Every raised call under each banded driver, on a crowd both banded drivers miss; else none. */
  readonly calls: readonly PoolCall[];
}

/** One measured cell: a weekday of the order as a level deals it. */
export interface WeekPoolCell {
  readonly key: string;
  readonly orderId: string;
  readonly day: number;
  readonly eventId: string;
  readonly bookings: readonly ContractIncident[];
  readonly banded: readonly string[];
  /** In crowd order; a cell the census has not finished holds fewer than the protocol's count. */
  readonly crowds: readonly PoolCrowd[];
}

export interface WeekPool {
  readonly version: number;
  readonly protocol: WeekPoolProtocol;
  readonly cells: readonly WeekPoolCell[];
}

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
function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
function asTag(value: unknown): PoolTag {
  return value === 'dead' || value === 'need' ? value : 'live';
}

/** Structure only; {@link weekPoolIssues} names a malformed field. */
export function parseWeekPool(input: unknown): WeekPool {
  const record = asRecord(input);
  const protocol = asRecord(record['protocol']);
  return Object.freeze({
    version: asNumber(record['version']),
    protocol: Object.freeze({
      contractId: asString(protocol['contractId']),
      crowdsFrom: asString(protocol['crowdsFrom']),
      crowdCount: asNumber(protocol['crowdCount']),
      throughWeek: asNumber(protocol['throughWeek']),
      placement: 'leave' as const,
      profiles: asStrings(protocol['profiles']),
    }),
    cells: Object.freeze(
      asArray(record['cells']).map((value) => {
        const cell = asRecord(value);
        return Object.freeze({
          key: asString(cell['key']),
          orderId: asString(cell['orderId']),
          day: asNumber(cell['day']),
          eventId: asString(cell['eventId']),
          bookings: Object.freeze(
            asArray(cell['bookings']).map((raw) => {
              const entry = asRecord(raw);
              return Object.freeze({
                kind: asString(entry['kind']) as ContractIncident['kind'],
                bankId: asString(entry['bankId']),
                carId: asString(entry['carId']),
                fromFraction: asNumber(entry['fromFraction']),
                toFraction: asNumber(entry['toFraction']),
              });
            }),
          ),
          banded: asStrings(cell['banded']),
          crowds: Object.freeze(
            asArray(cell['crowds']).map((raw) => {
              const crowd = asRecord(raw);
              return Object.freeze({
                seed: asString(crowd['seed']),
                tag: asTag(crowd['tag']),
                alone: asString(crowd['alone']),
                calls: Object.freeze(
                  asArray(crowd['calls']).map((entry) => {
                    const call = asRecord(entry);
                    const offered = call['offered'];
                    return Object.freeze({
                      by: asString(call['by']),
                      atS: asNumber(call['atS']),
                      question: call['question'] === 'driver' ? ('driver' as const) : ('placement' as const),
                      ...(offered === undefined ? {} : { offered: asStrings(offered) }),
                      clears: asStrings(call['clears']),
                    });
                  }),
                ),
              });
            }),
          ),
        });
      }),
    ),
  });
}

/** The shipped pool. */
export const WEEK_POOL: WeekPool = parseWeekPool(weekPoolDocument);

/* -------------------------------------------------------------------------- *
 * The cells a tower deals from week 2
 * -------------------------------------------------------------------------- */

/** One cell as the tower deals it: the census measures it at the first week that deals it. */
export interface PoolCell {
  readonly contractId: string;
  readonly key: string;
  readonly orderId: string;
  readonly day: number;
  readonly eventId: string;
  readonly bookings: readonly ContractIncident[];
  /** The first week that deals the cell, which the census plays it as. */
  readonly week: number;
  /** The two profiles DC-11 shows holding the order most (`weekDominance.ts#bandedProfilesOf`). */
  readonly banded: readonly string[];
}

/** One spelling of a cell: the order, the weekday, the day's drawn id and its week bookings. */
export function poolCellKeyOf(orderId: string, day: number, eventId: string, bookings: readonly ContractIncident[]): string {
  return `${orderId}|${String(day)}|${eventId}|${bookingsKeyOf(bookings)}`;
}

/**
 * **The order and bookings week `week` deals as authored**, from week 2 to the protocol's last: the
 * order the cycle deals week 2 and the first `week − 2` of the rung's week bookings
 * (`weekLevels.ts`' rule, read here without its admission so the pool can be the thing that admits).
 */
export function poolLevelOf(
  contractId: string,
  week: number,
): { readonly order: ContractWeekOrder; readonly booked: readonly ContractWeekBooking[] } | undefined {
  if (!Number.isInteger(week) || week < 2) return undefined;
  const order = weekOrderFor({ contractId, week });
  if (order === undefined) return undefined;
  const rung = CONTRACT_LADDER.rows.find((row) => row.contractId === contractId);
  const authored = rung?.weekBookings ?? [];
  if (week - 2 > authored.length) return undefined;
  return { order, booked: authored.slice(0, week - 2) };
}

/** **Every cell the tower deals from week 2 to the protocol's last week**, deduplicated, week 2 first. */
export function poolCellsOf(contractId: string, pool: WeekPool = WEEK_POOL): readonly PoolCell[] {
  const cells: PoolCell[] = [];
  for (let week = 2; week <= pool.protocol.throughWeek; week += 1) {
    const level = poolLevelOf(contractId, week);
    if (level === undefined) break;
    const booked = level.booked;
    const banded = bandedProfilesOf(contractId, level.order);
    for (let day = 1; day <= WEEK_ORDER_DAYS; day += 1) {
      const eventId = level.order.days[day - 1] ?? '';
      const bookings = bookingsOnDay(booked, day);
      const key = poolCellKeyOf(level.order.id, day, eventId, bookings);
      if (cells.some((cell) => cell.key === key)) continue;
      cells.push({ contractId, key, orderId: level.order.id, day, eventId, bookings, week, banded });
    }
  }
  return Object.freeze(cells);
}

/**
 * **The seed of a cell's crowd `index`**: the date `index` days from the protocol's first, its
 * digits, then the weekday, then `00`. Eleven digits, so it is never a date's crowd (eight) nor one
 * `weekRecord.ts#derivedCrowdOf` derives (the weeks-closed digits never begin with a zero), and it
 * begins with a year, so it is never a practice crowd (`scoredCrowd.ts#practiceCrowdOf`, a leading 9).
 */
export function poolCrowdSeedOf(cell: Pick<PoolCell, 'day'>, index: number, pool: WeekPool = WEEK_POOL): bigint {
  const date = crowdDates(pool.protocol.crowdsFrom, pool.protocol.crowdCount)[index];
  if (date === undefined) throw new Error(`no pool crowd ${String(index)}`);
  return BigInt(`${date.replaceAll('-', '')}${String(cell.day)}00`);
}

/** Whether `seed` is one of the shipped pool's crowds: the shell re-deals over one as over a date's. */
export function isPoolCrowdSeed(seed: bigint, pool: WeekPool = WEEK_POOL): boolean {
  const text = seed.toString();
  return pool.cells.some((cell) => cell.crowds.some((crowd) => crowd.seed === text));
}

/* -------------------------------------------------------------------------- *
 * A level over the pool as dealt
 * -------------------------------------------------------------------------- */

/** One counted weekday of a level, and the cell it is dealt from. */
export interface PoolDay {
  readonly day: number;
  readonly eventId: string;
  readonly cell: WeekPoolCell | undefined;
  /** Crowd indexes by tag, in crowd order. */
  readonly live: readonly number[];
  readonly need: readonly number[];
  readonly dead: readonly number[];
}

/** One profile's share of weeks held left alone over the pool as dealt, exact over the dealer's draw. */
export interface PoolHold {
  readonly profileId: string;
  /** `undefined` where some crowd the level can deal carries no mark for the profile. */
  readonly share: number | undefined;
}

/** A share an answer clears of a level's need days as dealt. */
export interface PoolAnswerShare {
  /** `pick:<profile>` a brief pick left alone; `<banded>:<answer>` an answer at a raised call on that line. */
  readonly answer: string;
  readonly share: number;
}

/** Each banded driver's keep band in days: the share of counted days as dealt *keep* loses and a raised call clears. */
export interface PoolKeepBand {
  readonly profileId: string;
  /** Need days in the pool, across the level's need weekdays, on which an answer at a raised call on this line cleared. */
  readonly saved: number;
  /** Need days in the pool, across the same weekdays. */
  readonly of: number;
  /** The share of counted days as dealt: need days a week over counted days, times the saved share. */
  readonly share: number;
}

export type PoolVerdict = 'admitted' | 'refused' | 'unmeasured';

/** What the gates say about one week over the pool as dealt. Every field is arithmetic over the file. */
export interface PoolLevelReading {
  readonly contractId: string;
  readonly week: number;
  /** The counted weekdays, each with its cell. */
  readonly days: readonly PoolDay[];
  readonly target: number;
  /** Counted weekdays whose cell holds a need crowd, in weekday order: where a need day can fall. */
  readonly needCapable: readonly number[];
  /** The least need days a week that holds DC-11, or `undefined` where none does or it cannot be read. */
  readonly needCount: number | undefined;
  /** Every profile's holds at {@link needCount} (at one need day where there is none). */
  readonly holds: readonly PoolHold[];
  readonly strongest: PoolHold | undefined;
  /** § D1337's trap check: every answer's share of need days, the largest first. */
  readonly answers: readonly PoolAnswerShare[];
  readonly keep: readonly PoolKeepBand[];
  readonly verdict: PoolVerdict;
  /** Why a week is not dealt, in one clause; `undefined` for an admitted one. */
  readonly because: string | undefined;
}

/** DC-11's half and § D1337's two thirds, the ruling's own; owner-reversible with it. */
export const POOL_HOLDS_AT_MOST = 0.5;
export const POOL_ANSWER_CLEARS_AT_MOST = 2 / 3;
/** DC-10's second half: the standing order misses at least this share of a counted day as dealt. */
const EPS = 1e-9;

/** The order and bookings a week deals as authored, by {@link poolLevelOf}, with its counted weekdays. */
function levelDaysOf(contractId: string, week: number, pool: WeekPool, census: WeekWay): { readonly days: readonly PoolDay[]; readonly weekend: boolean } | undefined {
  const level = poolLevelOf(contractId, week);
  if (level === undefined) return undefined;
  const horizon = census.protocol.horizon;
  const days: PoolDay[] = [];
  for (let day = 1; day <= WEEK_ORDER_DAYS; day += 1) {
    const eventId = level.order.days[day - 1] ?? '';
    const bookings = bookingsOnDay(level.booked, day);
    const found = weekWayRowFor(contractId, day, eventId, horizon, census, bookings);
    if (dayStakeReasonOf(found?.eventId === eventId ? found : undefined, census) !== 'contested') continue;
    const key = poolCellKeyOf(level.order.id, day, eventId, bookings);
    const cell = pool.cells.find((entry) => entry.key === key);
    const indexes = (tag: PoolTag): readonly number[] =>
      (cell?.crowds ?? []).flatMap((crowd, index) => (crowd.tag === tag ? [index] : []));
    days.push({ day, eventId, cell, live: indexes('live'), need: indexes('need'), dead: indexes('dead') });
  }
  /* A counted weekend is a day the pool does not measure (it holds weekdays), so the week cannot be read. */
  const weekend = [6, 7].some((day) => {
    const eventId = drawWrinkle(WRINKLE_LIBRARY, day, day - 1, horizon).id;
    const found = weekWayRowFor(contractId, day, eventId, horizon, census);
    return dayStakeReasonOf(found?.eventId === eventId ? found : undefined, census) === 'contested';
  });
  return { days, weekend };
}

/** The need weekdays a week deals: `n` consecutive need-capable weekdays from the weeks-closed index. */
export function needDaysAt(needCapable: readonly number[], n: number, weeksClosed: number): readonly number[] {
  if (needCapable.length === 0 || n <= 0) return [];
  const start = ((Math.trunc(weeksClosed) % needCapable.length) + needCapable.length) % needCapable.length;
  return Array.from({ length: Math.min(n, needCapable.length) }, (_, j) => needCapable[(start + j) % needCapable.length]!);
}

/** A crowd's mark for a profile: `C`, `m`, or `-` unmeasured. */
function markOf(crowd: PoolCrowd | undefined, profileIndex: number): string {
  return crowd?.alone[profileIndex] ?? '-';
}

/** The share of `indexes` a profile clears left alone, or `undefined` where one carries no mark. */
function clearShare(cell: WeekPoolCell | undefined, indexes: readonly number[], profileIndex: number): number | undefined {
  if (indexes.length === 0) return 0;
  let clears = 0;
  for (const index of indexes) {
    const mark = markOf(cell?.crowds[index], profileIndex);
    if (mark === '-') return undefined;
    if (mark === 'C') clears += 1;
  }
  return clears / indexes.length;
}

/** P(at least `target` of independent days clear), each day clearing with its own probability. */
function atLeast(probabilities: readonly number[], target: number): number {
  let dist = [1];
  for (const p of probabilities) {
    const next = new Array<number>(dist.length + 1).fill(0);
    dist.forEach((weight, clears) => {
      next[clears] = (next[clears] ?? 0) + weight * (1 - p);
      next[clears + 1] = (next[clears + 1] ?? 0) + weight * p;
    });
    dist = next;
  }
  return dist.slice(target).reduce((sum, weight) => sum + weight, 0);
}

/**
 * One profile's share of weeks held left alone, exact over the dealer: each need-day start equally
 * likely (the weeks-closed index runs through them in turn), each crowd within a cell equally likely
 * (the date index does).
 */
function holdShareOf(days: readonly PoolDay[], needCapable: readonly number[], n: number, target: number, profileIndex: number): number | undefined {
  const starts = Math.max(1, needCapable.length);
  let total = 0;
  for (let start = 0; start < starts; start += 1) {
    const needs = needDaysAt(needCapable, n, start);
    const probabilities: number[] = [];
    for (const entry of days) {
      const share = clearShare(entry.cell, needs.includes(entry.day) ? entry.need : entry.live, profileIndex);
      if (share === undefined) return undefined;
      probabilities.push(share);
    }
    total += target > 0 ? atLeast(probabilities, target) : 0;
  }
  return total / starts;
}

/** Every answer's share of need days as dealt: each need-capable weekday equally likely, each need crowd too. */
function answerSharesOf(days: readonly PoolDay[], needCapable: readonly number[], profiles: readonly string[]): readonly PoolAnswerShare[] {
  const capable = days.filter((entry) => needCapable.includes(entry.day));
  if (capable.length === 0) return [];
  const answers = new Map<string, number>();
  for (const entry of capable) {
    const per = new Map<string, number>();
    for (const index of entry.need) {
      const crowd = entry.cell?.crowds[index];
      if (crowd === undefined) continue;
      const cleared = new Set<string>();
      profiles.forEach((id, at) => {
        if (crowd.alone[at] === 'C') cleared.add(`pick:${id}`);
      });
      for (const call of crowd.calls) for (const answer of call.clears) cleared.add(`${call.by}:${answer}`);
      for (const answer of cleared) per.set(answer, (per.get(answer) ?? 0) + 1);
    }
    for (const [answer, count] of per) answers.set(answer, (answers.get(answer) ?? 0) + count / entry.need.length / capable.length);
  }
  return [...answers.entries()]
    .map(([answer, share]) => ({ answer, share }))
    .sort((a, b) => b.share - a.share || a.answer.localeCompare(b.answer));
}

/** Each banded driver's keep band in days at `n` need days a week. */
function keepBandsOf(days: readonly PoolDay[], needCapable: readonly number[], n: number, banded: readonly string[]): readonly PoolKeepBand[] {
  const capable = days.filter((entry) => needCapable.includes(entry.day));
  return banded.map((profileId) => {
    let saved = 0;
    let of = 0;
    let savedShare = 0;
    for (const entry of capable) {
      let here = 0;
      for (const index of entry.need) {
        const crowd = entry.cell?.crowds[index];
        if (crowd?.calls.some((call) => call.by === profileId && call.clears.length > 0) === true) here += 1;
      }
      saved += here;
      of += entry.need.length;
      savedShare += entry.need.length === 0 ? 0 : here / entry.need.length / capable.length;
    }
    const perWeek = Math.min(n, needCapable.length);
    const share = days.length === 0 ? 0 : (perWeek / days.length) * savedShare;
    return { profileId, saved, of, share };
  });
}

/**
 * **What DC-10, DC-11, the monotone clause and § D1337's trap check say about week `week` over the
 * pool as dealt** — see the module docstring. `undefined` where the tower deals no such week from the
 * pool (no pool for it, or a week past the protocol's last).
 */
export function poolLevelReadingOf(
  contractId: string,
  week: number,
  pool: WeekPool = WEEK_POOL,
  census: WeekWay = WEEK_WAY,
): PoolLevelReading | undefined {
  if (pool.protocol.contractId !== contractId || week < 2 || week > pool.protocol.throughWeek) return undefined;
  const read = levelDaysOf(contractId, week, pool, census);
  if (read === undefined) return undefined;
  const { days, weekend } = read;
  const profiles = pool.protocol.profiles;
  const target = weekTargetFor(days.length);
  const needCapable = days.filter((entry) => entry.need.length > 0).map((entry) => entry.day);
  const banded = days.find((entry) => entry.cell !== undefined)?.cell?.banded ?? [];
  const holdsAt = (n: number): readonly PoolHold[] =>
    profiles.map((profileId, index) => ({ profileId, share: holdShareOf(days, needCapable, n, target, index) }));
  const over = (holds: readonly PoolHold[]): boolean => holds.some((hold) => (hold.share ?? 0) > POOL_HOLDS_AT_MOST + EPS);
  const unread = (holds: readonly PoolHold[]): boolean => holds.some((hold) => hold.share === undefined);
  let needCount: number | undefined;
  for (let n = 1; n <= needCapable.length; n += 1) {
    const holds = holdsAt(n);
    if (unread(holds)) break;
    if (!over(holds)) {
      needCount = n;
      break;
    }
  }
  const holds = holdsAt(needCount ?? 1);
  const strongest = holds.reduce<PoolHold | undefined>(
    (best, hold) => (best === undefined || (hold.share ?? -1) > (best.share ?? -1) ? hold : best),
    undefined,
  );
  const answers = answerSharesOf(days, needCapable, profiles);
  const keep = keepBandsOf(days, needCapable, needCount ?? 1, banded);
  const dayName = (day: number): string => POOL_WEEKDAY_NAMES[day - 1] ?? `day ${String(day)}`;
  const standing = profiles.indexOf(census.protocol.standingOrder);

  let verdict: PoolVerdict = 'admitted';
  let because: string | undefined;
  const unmeasuredDay = days.find((entry) => entry.cell === undefined || entry.cell.crowds.length < pool.protocol.crowdCount);
  if (weekend) {
    verdict = 'unmeasured';
    because = 'a weekend day counts, and the pool measures weekdays only';
  } else if (days.length === 0) {
    verdict = 'refused';
    because = 'no day of it counts toward a target';
  } else if (unmeasuredDay !== undefined) {
    verdict = 'unmeasured';
    because = `${dayName(unmeasuredDay.day)} has not been measured on every crowd of the pool`;
  } else {
    const noLive = days.find((entry) => entry.live.length === 0);
    const nCount = needCount ?? 1;
    const reasonToDecide = days.find((entry) => {
      const p = needCapable.includes(entry.day) ? Math.min(nCount, needCapable.length) / needCapable.length : 0;
      const missNeed = clearShare(entry.cell, entry.need, standing);
      const missLive = clearShare(entry.cell, entry.live, standing);
      if (missNeed === undefined || missLive === undefined) return false;
      const misses = p * (1 - missNeed) + (1 - p) * (1 - missLive);
      return misses + EPS < census.protocol.standingMissAtLeast;
    });
    const before = week > 2 ? poolLevelReadingOf(contractId, week - 1, pool, census) : undefined;
    const rising = before === undefined
      ? undefined
      : holds.find((hold) => {
          const was = before.holds.find((entry) => entry.profileId === hold.profileId)?.share;
          return hold.share !== undefined && was !== undefined && hold.share > was + EPS;
        });
    const trap = answers.find((answer) => answer.share > POOL_ANSWER_CLEARS_AT_MOST + EPS);
    if (needCapable.length === 0) {
      verdict = 'refused';
      because = 'no crowd in its pool needs a choice: on every one, a driver the brief shows holding the week clears it left alone';
    } else if (noLive !== undefined) {
      verdict = 'refused';
      because = `no crowd in ${dayName(noLive.day)}’s pool is cleared by either driver the brief shows holding the week, left alone`;
    } else if (unread(holdsAt(1))) {
      verdict = 'unmeasured';
      because = 'some drivers have not been run left alone on every crowd it can deal';
    } else if (needCount === undefined) {
      verdict = 'refused';
      because = `${strongest?.profileId ?? 'one driver'} left alone holds it on ${percentOf(strongest?.share ?? 0)} of weeks however many days need a choice, over DC-11’s half`;
    } else if (reasonToDecide !== undefined) {
      verdict = 'refused';
      because = `the tower’s standing order, left alone, clears ${dayName(reasonToDecide.day)} too often as it is dealt`;
    } else if (rising !== undefined) {
      verdict = 'refused';
      const was = before?.holds.find((entry) => entry.profileId === rising.profileId)?.share ?? 0;
      because = `${rising.profileId} left alone holds it on ${percentOf(rising.share ?? 0)} of weeks against ${percentOf(was)} the week before`;
    } else if (before !== undefined && before.verdict !== 'admitted') {
      verdict = before.verdict;
      because = `week ${String(week - 1)} is not dealt`;
    } else if (trap !== undefined) {
      verdict = 'refused';
      because = `one answer, ${trap.answer}, clears ${percentOf(trap.share)} of its need days, over § D1337’s two thirds`;
    }
  }
  return {
    contractId,
    week,
    days: Object.freeze(days),
    target,
    needCapable: Object.freeze(needCapable),
    needCount,
    holds: Object.freeze(holds),
    strongest,
    answers: Object.freeze(answers),
    keep: Object.freeze(keep),
    verdict,
    because,
  };
}

function percentOf(share: number): string {
  return `${(100 * share).toFixed(0)} %`;
}

/** Monday to Friday, as a sentence names them. */
export const POOL_WEEKDAY_NAMES: readonly string[] = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

const TOPS = new WeakMap<WeekPool, Map<string, number>>();

/**
 * **The highest week the pool deals on a tower**: `Infinity` for a tower the pool does not cover,
 * `1` where week 2 is not admitted over it, else the last week admitted in turn from week 2.
 */
export function poolTopOf(contractId: string, pool: WeekPool = WEEK_POOL, census: WeekWay = WEEK_WAY): number {
  if (pool.protocol.contractId !== contractId) return Number.POSITIVE_INFINITY;
  const shipped = pool === WEEK_POOL && census === WEEK_WAY;
  const cached = shipped ? TOPS.get(pool)?.get(contractId) : undefined;
  if (cached !== undefined) return cached;
  let top = 1;
  for (let week = 2; week <= pool.protocol.throughWeek; week += 1) {
    if (poolLevelReadingOf(contractId, week, pool, census)?.verdict !== 'admitted') break;
    top = week;
  }
  if (shipped) {
    const cache = TOPS.get(pool) ?? new Map<string, number>();
    cache.set(contractId, top);
    TOPS.set(pool, cache);
  }
  return top;
}

/* -------------------------------------------------------------------------- *
 * The dealer
 * -------------------------------------------------------------------------- */

/** A counted day's crowd from the pool, and what the pool says about it. */
export interface PoolDeal {
  readonly seed: bigint;
  readonly cell: WeekPoolCell;
  readonly index: number;
  readonly crowd: PoolCrowd;
  /** Whether the day is one of the week's need days. */
  readonly needDay: boolean;
}

/**
 * **The pool's crowd for a counted day**, or `undefined` where the pool does not deal it: a week
 * below 2, a tower it does not cover, an uncounted day, or a level it does not admit. `week` is the
 * week as dealt (`weekLevels.ts#dealtWeekOf`), `weeksClosed` the tower's record, `dateSeed` the
 * date's crowd. Pure: the need weekdays by the weeks closed, the crowd by the date, the day and the
 * weeks closed, `(date + 7 × day + 31 × weeks closed) mod n` over the cell's crowds of the day's
 * kind in crowd order.
 */
export function poolDealOf(
  contractId: string,
  week: number,
  day: number,
  weeksClosed: number,
  dateSeed: bigint,
  pool: WeekPool = WEEK_POOL,
  census: WeekWay = WEEK_WAY,
): PoolDeal | undefined {
  if (week < 2 || week > poolTopOf(contractId, pool, census)) return undefined;
  const reading = poolLevelReadingOf(contractId, week, pool, census);
  if (reading?.verdict !== 'admitted' || reading.needCount === undefined) return undefined;
  const entry = reading.days.find((candidate) => candidate.day === day);
  if (entry?.cell === undefined) return undefined;
  const needDay = needDaysAt(reading.needCapable, reading.needCount, weeksClosed).includes(day);
  const eligible = needDay ? entry.need : entry.live;
  if (eligible.length === 0) return undefined;
  const at = (dateSeed + 7n * BigInt(day) + 31n * BigInt(Math.max(0, Math.trunc(weeksClosed)))) % BigInt(eligible.length);
  const index = eligible[Number(at)];
  const crowd = index === undefined ? undefined : entry.cell.crowds[index];
  if (index === undefined || crowd === undefined) return undefined;
  return { seed: BigInt(crowd.seed), cell: entry.cell, index, crowd, needDay };
}

/**
 * **The pool's record of the crowd a counted day runs on**, or `undefined` where the day is not dealt
 * from the pool or `seed` is not one of its crowds. A seed alone does not name a cell: a weekday's
 * crowds are one list with its booking and without it, so the week as dealt says which day it is.
 */
export function poolCrowdFor(
  contractId: string,
  week: number,
  day: number,
  seed: bigint,
  pool: WeekPool = WEEK_POOL,
  census: WeekWay = WEEK_WAY,
): { readonly cell: WeekPoolCell; readonly crowd: PoolCrowd } | undefined {
  if (week < 2 || week > poolTopOf(contractId, pool, census)) return undefined;
  const reading = poolLevelReadingOf(contractId, week, pool, census);
  const cell = reading?.days.find((entry) => entry.day === day)?.cell;
  const text = seed.toString();
  const crowd = cell?.crowds.find((entry) => entry.seed === text);
  return cell === undefined || crowd === undefined ? undefined : { cell, crowd };
}
