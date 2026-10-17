/**
 * **The ways through a pooled day: the brief's count before, the close's names after** — wave AP,
 * lane DT-1, swarm DT's ruling Q1 and Q2 item 5 ([§ D1463](../../../../DECISIONS.md)).
 *
 * Both lines read the pool's record of the crowd a counted day runs on (`weekPool.ts#poolCrowdFor`)
 * and nothing else: no run in the browser, so the brief can say before the press what the census
 * measured on this crowd, and the close can name it after.
 *
 * - **The brief** says how many of the shipped drivers clear this crowd left alone, and names none:
 *   naming one would be advice, and the count is what the player is choosing over. On a crowd no
 *   driver clears left alone it says that answering a call cleared it on the pool's run. A crowd
 *   whose count the census has not finished (a live crowd with a `-` mark) gets no line.
 * - **The close** names, in the past tense, every driver that cleared it left alone, and where none
 *   did, the answers at raised calls that did, with the driver whose run raised the call.
 *
 * Neither line says the player's own run would have gone the same way after a press: the pool
 * measured each driver left alone, and each answer with nothing pressed after it.
 */

import { PARK_CARS_LOBBY_LABEL, SPREAD_CARS_LABEL } from '../live/interventions.js';

import { DAY_CALL_LEAVE_LABEL } from './dayCalls.js';
import type { WeekState } from './types.js';
import { dealtWeekOf } from './weekLevels.js';
import { poolCrowdFor, WEEK_POOL, type PoolCall, type PoolCrowd, type WeekPool } from './weekPool.js';

/** A display name for a profile id, or `undefined` where the caller has none. */
export type PoolNameOf = (profileId: string) => string | undefined;

/** The pool's crowd for a day of a week, read at the week as dealt; `undefined` off the pool. */
export function pooledCrowdOf(
  week: Pick<WeekState, 'contractId' | 'week'>,
  day: number,
  seed: bigint,
  pool: WeekPool = WEEK_POOL,
): PoolCrowd | undefined {
  return pool === WEEK_POOL
    ? poolCrowdFor(week.contractId, dealtWeekOf(week), day, seed)?.crowd
    : poolCrowdFor(week.contractId, week.week, day, seed, pool)?.crowd;
}

/** The profiles a crowd's marks clear, in protocol order; `undefined` where a mark is missing. */
function clearedBy(crowd: PoolCrowd, pool: WeekPool): readonly string[] | undefined {
  if (crowd.alone.length !== pool.protocol.profiles.length || crowd.alone.includes('-')) return undefined;
  return pool.protocol.profiles.filter((_, i) => crowd.alone[i] === 'C');
}

/** Whether any answer at a raised call cleared the crowd. */
function answered(crowd: PoolCrowd): boolean {
  return crowd.calls.some((call) => call.clears.length > 0);
}

/**
 * **The brief's line**: how many of the shipped drivers clear this crowd left alone, naming none.
 * `undefined` where the crowd is not the pool's or its count is not finished.
 */
export function poolWaysLineOf(crowd: PoolCrowd | undefined, pool: WeekPool = WEEK_POOL): string | undefined {
  if (crowd === undefined || crowd.tag === 'dead') return undefined;
  const cleared = clearedBy(crowd, pool);
  if (cleared === undefined) return undefined;
  const of = pool.protocol.profiles.length;
  if (cleared.length > 0) {
    return (
      `Ways through, measured on this crowd: left alone, ${String(cleared.length)} of the ${String(of)} ` +
      `drivers clear the day.`
    );
  }
  if (!answered(crowd)) return undefined;
  return (
    `Ways through, measured on this crowd: none of the ${String(of)} drivers clears the day left alone; ` +
    'answering a call cleared it.'
  );
}

/** `a`, `a and b`, `a, b and c`. */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${String(parts[parts.length - 1])}`;
}

/** An answer at a pooled call, in the words the call's own row uses. */
function answerWordsOf(call: PoolCall, answer: string, nameOf: PoolNameOf): string {
  if (call.question === 'driver') return `handing the day to ${nameOf(answer) ?? answer}`;
  const label = answer === 'park-cars-lobby' ? PARK_CARS_LOBBY_LABEL : answer === 'spread-cars' ? SPREAD_CARS_LABEL : DAY_CALL_LEAVE_LABEL;
  return `answering ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/**
 * **The close's line**, in the past tense: the drivers that cleared this crowd left alone, by name,
 * and where none did, the answers at raised calls that did. `undefined` off the pool.
 */
export function poolCloseLineOf(crowd: PoolCrowd | undefined, nameOf: PoolNameOf, pool: WeekPool = WEEK_POOL): string | undefined {
  if (crowd === undefined) return undefined;
  const cleared = clearedBy(crowd, pool);
  const named = (id: string): string => nameOf(id) ?? id;
  if (cleared !== undefined && cleared.length > 0) {
    return `On this crowd, left alone, ${listOf(cleared.map(named))} cleared the day.`;
  }
  const answers = crowd.calls.flatMap((call) =>
    call.clears.map((answer) => `${answerWordsOf(call, answer, nameOf)} at the call raised under ${named(call.by)}`),
  );
  const unique = [...new Set(answers)];
  if (cleared === undefined) return undefined;
  if (unique.length === 0) return 'On this crowd, no driver left alone and no answer at a raised call cleared the day.';
  return `On this crowd, no driver left alone cleared the day; ${listOf(unique)} would have.`;
}
