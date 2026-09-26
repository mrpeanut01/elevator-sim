/**
 * **The next week is new: each week of a tower is dealt its own wrinkle order** — wave AM, lane
 * AM-D, swarm DO's § 2 ([§ D1252](../../../../DECISIONS.md)).
 *
 * ## What was wrong
 *
 * § D1177's roll reopened a closed week at day 1, and a day's wrinkle is `wrinkles/draw.ts`'s draw
 * over `(day, dayIdx)`, so week 2 re-dealt week 1's five weekday wrinkles to the day: day 12 was
 * day 5 with new passengers (swarm DO's S3). Of the eighteen weekday templates in
 * `data/wrinkles.json`, the week reached five, and `data/wrinkle-census.json` had already found
 * seven of the thirteen it never reached to be days some standing order clears and the default
 * misses.
 *
 * ## The rule
 *
 * A rung may author **week orders** (`data/contract-ladder.json`, `weekOrders`): five drawn ids,
 * Monday to Friday. Week 1 is always the draw it always was. Week `n` is dealt entry
 * `(n − 1) mod k` of the list *week 1's draw, then every authored order the census admits, in file
 * order*, so the orders cycle and a tower with none admitted deals week 1's draw every week, as
 * before. The weekend is not authored and keeps week 1's draw.
 *
 * **An order is dealt only once the census admits it** ({@link weekOrderAdmissionOf}): every one of
 * its five days has a current row in `data/week-way.json` under exactly the wrinkle it names (the
 * same day of the week, so the tower at that day's growth), and `docs/33` DC-10 admits each row: a
 * way through on held-out crowds, the standing order missing often enough, the queue gate met. So
 * an order is admitted by measurements taken by the command `shift/weekWay.sweep.test.ts`
 * documents, never by a flag, and an order the census refuses stays authored with its refusal
 * readable here and is not dealt.
 *
 * Whether a dealt day then **counts** toward the week is `weekStake.ts`'s rule, unchanged: the
 * census row for the day as dealt decides it, and the target is derived from the counted days of
 * the week being played.
 *
 * ## The rotation this keeps, and the half it does not
 *
 * `GAMEPLAY_AND_NAVIGATION.md` § 17 asks for no template twice in fourteen days. Within a week the
 * orders repeat no template, and {@link weekOrderIssues} refuses two neighbouring weeks in the cycle
 * (week 1's draw included, and the wrap from the last order back to week 1) that share a template,
 * so no template repeats inside seven days of itself across a roll. **Two weeks apart is not
 * kept**: with week 1's five templates and eleven usable others (`contractors` cannot be cleared on
 * Midtown's census and `flu-day` asks no decision), a cycle of four weeks cannot keep fourteen days
 * without repeating week 1 outright. That is stated here rather than guessed at, and before this
 * module the roll broke the rule at seven days on every weekday.
 */

import { dayKindOf, poolFor, drawWrinkle, wrinkleOfDrawnId } from '../wrinkles/draw.js';
import { WRINKLE_LIBRARY } from '../wrinkles/library.js';
import type { WrinkleLibrary } from '../wrinkles/types.js';

import { CONTRACT_LADDER, type ContractLadder, type ContractWeekOrder } from './ladder.js';
import type { WeekState } from './types.js';
import { dc10Of, WEEK_WAY, weekWayRowFor, type WeekWay, type WeekWayRow } from './weekWay.js';

/** How many days an order authors: Monday to Friday, day 1 to day 5. */
export const WEEK_ORDER_DAYS = 5;

/** A week, as far as dealing it needs: the tower and which week of it. */
export type WeekOrderKey = Pick<WeekState, 'contractId' | 'week'>;

/** Why one day of an order is or is not admitted. */
export type WeekOrderDayReason =
  /** A current census row under exactly this wrinkle, and DC-10 admits it. */
  | 'admitted'
  /** No current census row for this day under this wrinkle. */
  | 'unmeasured'
  /** Measured, and DC-10 refuses it. */
  | 'refused';

export interface WeekOrderDay {
  readonly day: number;
  readonly eventId: string;
  readonly row: WeekWayRow | undefined;
  readonly reason: WeekOrderDayReason;
}

export interface WeekOrderAdmission {
  readonly order: ContractWeekOrder;
  readonly days: readonly WeekOrderDay[];
  /** Every day admitted. */
  readonly admitted: boolean;
}

/**
 * **Whether the census admits an authored order, day by day** — see the module docstring.
 *
 * A row counts for a day only when it was measured under exactly the day's wrinkle: a row for the
 * ordinary day, or for the wrinkle week 1 draws there, describes a different day.
 */
export function weekOrderAdmissionOf(
  contractId: string,
  order: ContractWeekOrder,
  census: WeekWay = WEEK_WAY,
): WeekOrderAdmission {
  const days = Array.from({ length: WEEK_ORDER_DAYS }, (_, index): WeekOrderDay => {
    const day = index + 1;
    const eventId = order.days[index] ?? '';
    const found = weekWayRowFor(contractId, day, eventId, census.protocol.horizon, census);
    const row = found?.eventId === eventId ? found : undefined;
    const reason: WeekOrderDayReason =
      row === undefined ? 'unmeasured' : dc10Of(row, census.protocol).admitted ? 'admitted' : 'refused';
    return { day, eventId, row, reason };
  });
  const whole = order.days.length === WEEK_ORDER_DAYS && days.every((day) => day.reason === 'admitted');
  return { order, days: Object.freeze(days), admitted: whole };
}

const DEALT = new WeakMap<WeekWay, Map<string, readonly (ContractWeekOrder | undefined)[]>>();

/**
 * **The orders a tower's weeks are dealt, in order**: `undefined` first (week 1, the draw), then
 * every authored order the census admits. Never empty.
 */
export function dealtWeekOrdersOf(
  contractId: string,
  census: WeekWay = WEEK_WAY,
  ladder: ContractLadder = CONTRACT_LADDER,
): readonly (ContractWeekOrder | undefined)[] {
  const shipped = ladder === CONTRACT_LADDER;
  let cache = shipped ? DEALT.get(census) : undefined;
  const cached = cache?.get(contractId);
  if (cached !== undefined) return cached;
  const rung = ladder.rows.find((row) => row.contractId === contractId);
  const admitted = (rung?.weekOrders ?? []).filter(
    (order) =>
      order.days.every((id) => wrinkleOfDrawnId(WRINKLE_LIBRARY, id) !== undefined) &&
      weekOrderAdmissionOf(contractId, order, census).admitted,
  );
  const dealt = Object.freeze([undefined, ...admitted]);
  if (shipped) {
    if (cache === undefined) {
      cache = new Map();
      DEALT.set(census, cache);
    }
    cache.set(contractId, dealt);
  }
  return dealt;
}

/** Which entry of {@link dealtWeekOrdersOf} week `key.week` is dealt: `0` is week 1's draw. */
export function weekOrderIndexOf(key: WeekOrderKey, census: WeekWay = WEEK_WAY): number {
  const count = dealtWeekOrdersOf(key.contractId, census).length;
  const week = Math.max(1, Math.trunc(key.week));
  return (week - 1) % count;
}

/** The authored order a week is dealt, or `undefined` where it is dealt week 1's draw. */
export function weekOrderFor(key: WeekOrderKey, census: WeekWay = WEEK_WAY): ContractWeekOrder | undefined {
  return dealtWeekOrdersOf(key.contractId, census)[weekOrderIndexOf(key, census)];
}

/**
 * **The drawn id an authored order deals on this day**, or `undefined` where the day keeps the
 * draw: week 1, a tower with no admitted order, the weekend, or a day past the fifth. Read by
 * `calendar.ts#scheduledEventFor`, which every run and every sentence about the day is built from.
 */
export function orderedWrinkleIdFor(
  key: WeekOrderKey,
  day: number,
  dayIdx: number,
  census: WeekWay = WEEK_WAY,
): string | undefined {
  if (day < 1 || day > WEEK_ORDER_DAYS || dayKindOf(dayIdx) !== 'weekday') return undefined;
  return weekOrderFor(key, census)?.days[day - 1];
}

/* -------------------------------------------------------------------------- *
 * The authored orders, checked
 * -------------------------------------------------------------------------- */

/** The template ids of week 1's draw, Monday to Friday. */
function drawnTemplatesOfWeekOne(library: WrinkleLibrary, horizon: WeekWay['protocol']['horizon']): readonly string[] {
  return Array.from({ length: WEEK_ORDER_DAYS }, (_, index) => drawWrinkle(library, index + 1, index, horizon).templateId);
}

/**
 * **Every way the authored orders can be wrong**, collected — the shipped ladder must answer `[]`
 * (`weekOrders.test.ts`). Admission is not here: a refused order is a measurement, not a defect,
 * and {@link weekOrderAdmissionOf} reads it.
 *
 * Each order: a non-empty id unique on its rung, exactly five days, each a drawn id the library
 * reads back, each a weekday template whose whole-day placement is not refused, and no template
 * twice in the week. Across the cycle the tower is dealt (week 1's draw, then the admitted orders,
 * then back to week 1), neighbouring weeks share no template.
 */
export function weekOrderIssues(
  ladder: ContractLadder = CONTRACT_LADDER,
  census: WeekWay = WEEK_WAY,
  library: WrinkleLibrary = WRINKLE_LIBRARY,
): readonly string[] {
  const issues: string[] = [];
  const weekday = new Set(poolFor(library, 'weekday', census.protocol.horizon).map((template) => template.id));
  for (const rung of ladder.rows) {
    const ids = new Set<string>();
    for (const order of rung.weekOrders) {
      const at = `${rung.contractId} order ${order.id === '' ? '(no id)' : order.id}`;
      if (order.id === '' || ids.has(order.id)) issues.push(`${at}: its id is empty or repeated`);
      ids.add(order.id);
      if (order.days.length !== WEEK_ORDER_DAYS) {
        issues.push(`${at}: names ${String(order.days.length)} days, not ${String(WEEK_ORDER_DAYS)}`);
      }
      const templates: string[] = [];
      for (const id of order.days) {
        const drawn = wrinkleOfDrawnId(library, id);
        if (drawn === undefined) {
          issues.push(`${at}: ${id} is not a drawn id the wrinkle library reads back`);
          continue;
        }
        if (!weekday.has(drawn.templateId)) {
          issues.push(`${at}: ${id} is not a weekday wrinkle that can be dealt on this horizon`);
        }
        if (templates.includes(drawn.templateId)) issues.push(`${at}: deals ${drawn.templateId} twice in one week`);
        templates.push(drawn.templateId);
      }
    }
    const cycle = dealtWeekOrdersOf(rung.contractId, census, ladder);
    if (cycle.length < 2) continue;
    const templatesOf = (order: ContractWeekOrder | undefined): readonly string[] =>
      order === undefined
        ? drawnTemplatesOfWeekOne(library, census.protocol.horizon)
        : order.days.map((id) => wrinkleOfDrawnId(library, id)?.templateId ?? id);
    for (const [index, order] of cycle.entries()) {
      const next = cycle[(index + 1) % cycle.length];
      const shared = templatesOf(order).filter((id) => templatesOf(next).includes(id));
      if (shared.length > 0) {
        issues.push(
          `${rung.contractId}: week ${String(index + 1)} and the week after it both deal ${shared.join(', ')}`,
        );
      }
    }
  }
  return issues;
}
