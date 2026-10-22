/**
 * The authored week orders and their admission — wave AM, lane AM-D, [§ D1252](../../../../DECISIONS.md). See `weekOrders.ts`.
 */

import { describe, expect, it } from 'vitest';

import { everyWrinkle, wrinkleOfDrawnId } from '../wrinkles/draw.js';
import { WRINKLE_LIBRARY } from '../wrinkles/library.js';

import { scheduledEventFor } from './calendar.js';
import { eventOfDrawnId, SHIFT_EVENTS } from './events.js';
import { CONTRACT_LADDER, type ContractLadder, type ContractWeekOrder } from './ladder.js';
import { CONTRACTS } from './contracts.js';
import {
  dealtWeekOrdersOf,
  orderedWrinkleIdFor,
  weekOrderAdmissionOf,
  weekOrderFor,
  weekOrderIssues,
} from './weekOrders.js';
import { WEEK_DOMINANCE, type WeekDominance } from './weekDominance.js';
import { WEEK_WAY, type WeekWay, type WeekWayRow } from './weekWay.js';
import { closeDay, nextDay, openWeek, outcomeOf } from './week.js';
import type { WeekState } from './types.js';
import { weekDealOf } from './weekStake.js';

/** The shipped ladder with `orders` authored on Midtown Office's rung. */
function ladderWith(orders: readonly ContractWeekOrder[]): ContractLadder {
  return {
    ...CONTRACT_LADDER,
    rows: CONTRACT_LADDER.rows.map((row) => (row.contractId === 'c2' ? { ...row, weekOrders: orders } : row)),
  };
}

/** The shipped census with one extra row per day of `order`, copied from week 1's row for that day. */
function censusAdmitting(order: ContractWeekOrder, over: Partial<WeekWayRow> = {}, base: WeekWay = WEEK_WAY): WeekWay {
  const extra = order.days.map((eventId, index) => {
    const day = index + 1;
    const template = WEEK_WAY.rows.find((row) => row.contractId === 'c2' && row.day === day && row.eventId === 'ordinary');
    if (template === undefined) throw new Error(`no c2 day ${String(day)} row`);
    return { ...template, eventId, ...over };
  });
  const have = new Set(base.rows.map((row) => `${row.contractId}/${String(row.day)}/${row.eventId}`));
  return { ...base, rows: [...base.rows, ...extra.filter((row) => !have.has(`${row.contractId}/${String(row.day)}/${row.eventId}`))] };
}

/**
 * A one-profile screen admitting `order`: every profile left alone clears nothing, so none holds the
 * week on any crowd (wave AN, lane DQ-2, § D1343). The day half of admission is what these tests vary.
 */
function screenAdmitting(order: ContractWeekOrder, base: WeekDominance = WEEK_DOMINANCE): WeekDominance {
  const none = Array.from({ length: 5 }, () => 'm'.repeat(WEEK_WAY.protocol.heldOutCount));
  return {
    ...base,
    rows: [
      ...base.rows,
      {
        contractId: 'c2',
        orderId: order.id,
        days: order.days,
        bookings: [],
        verdicts: Object.fromEntries(WEEK_DOMINANCE.protocol.profiles.map((id) => [id, none])),
      },
    ],
  };
}

/** An order no census row measures: every day is a wrinkle, or an axis value, the shipped orders do not deal. */
const ORDER: ContractWeekOrder = {
  id: 'test',
  days: [
    'caterers:into-the-rush',
    'shift-change:staggered',
    'evacuation-drill:floor-by-floor',
    'open-day:quiet',
    'contractors:afternoon',
  ],
};

describe('a drawn id reads back as exactly the wrinkle it names', () => {
  it('round-trips every concrete wrinkle in the library', () => {
    const all = everyWrinkle(WRINKLE_LIBRARY);
    expect(all.length).toBeGreaterThan(30);
    for (const wrinkle of all) expect(wrinkleOfDrawnId(WRINKLE_LIBRARY, wrinkle.id)).toEqual(wrinkle);
  });

  it('refuses an id that leaves an axis out, names an unknown value or an unknown template', () => {
    expect(wrinkleOfDrawnId(WRINKLE_LIBRARY, 'move-in')).toBeUndefined();
    expect(wrinkleOfDrawnId(WRINKLE_LIBRARY, 'move-in:middle')).toBeUndefined();
    expect(wrinkleOfDrawnId(WRINKLE_LIBRARY, 'move-in:first-half:extra')).toBeUndefined();
    expect(wrinkleOfDrawnId(WRINKLE_LIBRARY, 'not-a-wrinkle')).toBeUndefined();
  });

  it('is the booked template’s own event wherever a template has no axes, so a campaign day is unchanged', () => {
    for (const template of WRINKLE_LIBRARY.templates.filter((entry) => entry.axes.length === 0)) {
      expect(eventOfDrawnId(template.id), template.id).toEqual(SHIFT_EVENTS[template.id as keyof typeof SHIFT_EVENTS]);
    }
  });

  it('keeps the axis value a template id alone would lose', () => {
    const late = eventOfDrawnId('move-in:past-halfway');
    expect(late?.effect.derate).toEqual({ cars: 1, fromFraction: 0.55, toFraction: 0.8 });
    expect(SHIFT_EVENTS['move-in'].effect.derate).not.toEqual(late?.effect.derate);
  });
});

describe('an order is dealt only where the census admits every one of its days', () => {
  it('refuses an order with no census rows, day by day', () => {
    const admission = weekOrderAdmissionOf('c2', ORDER);
    expect(admission.days.map((day) => day.reason)).toEqual(['unmeasured', 'unmeasured', 'unmeasured', 'unmeasured', 'unmeasured']);
    expect(admission.admitted).toBe(false);
    expect(dealtWeekOrdersOf('c2', WEEK_WAY, ladderWith([ORDER]))).toEqual([undefined]);
  });

  it('admits it once every day has a current row DC-10 admits, and deals it as week 2', () => {
    const census = censusAdmitting(ORDER);
    const screen = screenAdmitting(ORDER);
    expect(weekOrderAdmissionOf('c2', ORDER, census, screen).admitted).toBe(true);
    expect(dealtWeekOrdersOf('c2', census, ladderWith([ORDER]), screen)).toEqual([undefined, ORDER]);
    /* Wave AN, lane DQ-2 (§ D1343): with the days admitted and no screen row, the week is not dealt. */
    expect(weekOrderAdmissionOf('c2', ORDER, census).dominance.verdict).toBe('unmeasured');
    expect(dealtWeekOrdersOf('c2', census, ladderWith([ORDER]))).toEqual([undefined]);
  });

  it('refuses it when one day is measured and refused, and the refusal names the day', () => {
    const census = censusAdmitting(ORDER);
    const refused: WeekWay = {
      ...census,
      rows: census.rows.map((row) =>
        row.contractId === 'c2' && row.day === 3 && row.eventId === ORDER.days[2]
          ? { ...row, chosenVerdicts: 'm'.repeat(20) }
          : row,
      ),
    };
    const admission = weekOrderAdmissionOf('c2', ORDER, refused);
    expect(admission.days.map((day) => day.reason)).toEqual(['admitted', 'admitted', 'refused', 'admitted', 'admitted']);
    expect(dealtWeekOrdersOf('c2', refused, ladderWith([ORDER]))).toEqual([undefined]);
  });

  it('does not borrow a row measured under another wrinkle, or on the ordinary day', () => {
    const census = censusAdmitting({ ...ORDER, days: ORDER.days.map((id, index) => (index === 1 ? 'ordinary' : id)) });
    expect(weekOrderAdmissionOf('c2', ORDER, census).days[1]?.reason).toBe('unmeasured');
  });
});

describe('the authored orders are well formed', () => {
  it('the shipped ladder has no issue', () => {
    expect(weekOrderIssues()).toEqual([]);
  });

  it('names a malformed order', () => {
    const issues = weekOrderIssues(
      ladderWith([
        { id: 'short', days: ['goods-inward'] },
        { id: 'short', days: ['move-in', 'weekend', 'goods-inward', 'goods-inward', 'audit-day'] },
      ]),
    );
    expect(issues.some((issue) => issue.includes('names 1 days'))).toBe(true);
    expect(issues.some((issue) => issue.includes('empty or repeated'))).toBe(true);
    expect(issues.some((issue) => issue.includes('move-in is not a drawn id'))).toBe(true);
    expect(issues.some((issue) => issue.includes('weekend is not a weekday wrinkle'))).toBe(true);
    expect(issues.some((issue) => issue.includes('goods-inward twice'))).toBe(true);
  });

  it('refuses neighbouring weeks that deal one template, week 1’s draw included', () => {
    const repeat: ContractWeekOrder = { ...ORDER, days: ['caterers:before-the-rush', 'goods-inward', 'fire-drill:full', 'audit-day', 'late-finish'] };
    const issues = weekOrderIssues(ladderWith([repeat]), censusAdmitting(repeat), WRINKLE_LIBRARY, screenAdmitting(repeat));
    /*
     * Since wave AN's lane DQ-2 (§ D1343) the weeks after the first go round the admitted orders and
     * not back to week 1, so the wrap no longer compares the last order with week 1's draw. One
     * admitted order repeats from week 2, as week 1's draw repeats where none is admitted, and that
     * repetition is not refused (the cycle test below holds two orders to the wrap).
     */
    expect(issues).toEqual(['c2: week 1 and the week after it both deal fire-drill']);
    const second: ContractWeekOrder = { ...ORDER, id: 'second', days: ['shift-change:staggered', 'open-day:quiet', 'evacuation-drill:floor-by-floor', 'contractors:afternoon', 'late-finish'] };
    const both = weekOrderIssues(
      ladderWith([repeat, second]),
      censusAdmitting(second, {}, censusAdmitting(repeat)),
      WRINKLE_LIBRARY,
      screenAdmitting(second, screenAdmitting(repeat)),
    );
    expect(both).toEqual([
      'c2: week 1 and the week after it both deal fire-drill',
      'c2: week 2 and the week after it both deal late-finish',
      'c2: week 3 and the week after it both deal late-finish',
    ]);
  });
});

describe('week 1 is dealt exactly as before', () => {
  it('every weekday of every contract’s week 1 is the draw, with or without the week', () => {
    for (const contract of CONTRACTS) {
      for (let day = 1; day <= 7; day += 1) {
        const dayIdx = day - 1;
        const plain = scheduledEventFor(null, day, dayIdx, 'whole-day');
        const dealt = scheduledEventFor(null, day, dayIdx, 'whole-day', { contractId: contract.id, week: 1 });
        expect(dealt, `${contract.id} day ${String(day)}`).toEqual(plain);
        expect(orderedWrinkleIdFor({ contractId: contract.id, week: 1 }, day, dayIdx)).toBeUndefined();
      }
    }
  });

  it('a tower with no admitted order deals week 1’s draw every week', () => {
    for (const contract of CONTRACTS.filter((entry) => dealtWeekOrdersOf(entry.id).length === 1)) {
      expect(weekOrderFor({ contractId: contract.id, week: 5 })).toBeUndefined();
    }
  });
});

/** The one order DC-10 and DC-11 admitted on Midtown until § D1616 held it. */
const HELD_ORDER_ID = 'midtown-early-lift';

/** Midtown's week `week`, Monday to Friday, as the product deals it: the one composition every run reads. */
function dealtWeekdays(week: number): readonly string[] {
  return [1, 2, 3, 4, 5].map((day) => scheduledEventFor(null, day, day - 1, 'whole-day', { contractId: 'c2', week }).id);
}

/** Midtown's authored order by id. */
function authored(id: string): ContractWeekOrder | undefined {
  return CONTRACT_LADDER.rows.find((row) => row.contractId === 'c2')?.weekOrders.find((order) => order.id === id);
}

describe('the next week is new — Midtown Office, swarm DO § 2, and on the fixed engine it is not', () => {
  /*
   * Wave AN, lane DQ-2 (§ D1343, § D1345) admitted one authored order on Midtown, and every week from
   * the second dealt it. On the engine § D1603 fixed, the week census refuses its Thursday and Friday
   * (11 of 20 crowds each under the census's chosen play, under DC-10's lower bound of a third), the
   * re-author search § D1616 registers found no replacement, and the order is held: authored, not
   * dealt, its refusal readable here. So Midtown deals week 1's draw every week. The admission, the
   * deal and the run seam are tested on a real dealt order in `weekOrders.preD1603.test.ts`.
   */
  it('admits no authored order, because DC-10 refuses the held order’s Thursday and Friday', () => {
    const order = authored(HELD_ORDER_ID);
    expect(order).toBeDefined();
    if (order === undefined) return;
    expect(dealtWeekOrdersOf('c2')).toEqual([undefined]);
    const admission = weekOrderAdmissionOf('c2', order);
    expect(admission.days.map((day) => [day.day, day.reason])).toEqual([
      [1, 'admitted'],
      [2, 'admitted'],
      [3, 'admitted'],
      [4, 'refused'],
      [5, 'refused'],
    ]);
    expect(
      admission.days.filter((day) => day.reason === 'refused').map((day) => day.row?.chosenVerdicts.split('').filter((mark) => mark === 'C').length),
    ).toEqual([11, 11]);
    expect(admission.admitted).toBe(false);
  });

  it('deals week 1’s draw on every weekday of weeks 2 and 3', () => {
    expect(dealtWeekdays(2)).toEqual(dealtWeekdays(1));
    expect(dealtWeekdays(3)).toEqual(dealtWeekdays(1));
    expect(dealtWeekdays(2)).not.toEqual(authored(HELD_ORDER_ID)?.days);
  });

  it('reaches week 2 by holding week 1: the roll deals the next order, and a week not held deals itself again', () => {
    /*
     * Wave AN, lane DQ-2 (§ D1344): the roll advances on a held week only. Week 1 played through
     * clean on every day it deals is held; played through with nothing filed it is not, and its
     * order is dealt again.
     */
    const playThrough = (clean: boolean): { readonly seen: string[][]; readonly week: WeekState } => {
      let week = openWeek('c2');
      const seen: string[][] = [[], []];
      for (let step = 0; step < 14; step += 1) {
        const eventId = scheduledEventFor(null, week.day, week.dayIdx, 'whole-day', week).id;
        if (week.day <= 5) seen[seen[0]?.length === 5 ? 1 : 0]?.push(eventId);
        if (clean && step < 7) {
          week = closeDay(week, { ...outcomeOf({ record: null, recordRefusal: null, day: week.day, dayIdx: week.dayIdx, eventId, arrived: 1, carried: 1, minutePct: 100, readings: [] }), allMet: true });
        }
        week = nextDay(week);
      }
      return { seen, week };
    };
    const held = playThrough(true);
    expect(held.seen).toEqual([dealtWeekdays(1), dealtWeekdays(2)]);
    expect(held.week.week).toBe(2);
    const notHeld = playThrough(false);
    expect(notHeld.seen).toEqual([dealtWeekdays(1), dealtWeekdays(1)]);
    expect(notHeld.week.week).toBe(1);
  });

  it('counts week 2’s days by week 2’s own census rows, and derives its target from them', () => {
    const deal = weekDealOf({ contractId: 'c2', week: 2 });
    expect(deal?.days.slice(0, 5).map((day) => day.eventId)).toEqual(dealtWeekdays(2));
    expect(deal?.days.slice(0, 5).every((day) => day.row?.eventId === day.eventId)).toBe(true);
    expect(deal?.target).toBe(Math.max(1, (deal?.counted ?? 0) - 1));
  });

  it('does not deal the orders the census refuses day by day, and names the days each was refused on', () => {
    for (const [id, days] of [
      /* Re-derived on the fixed engine (§ D1616): each gains Thursday's goods-inward, 11 of 20. */
      ['midtown-lift-service', [2, 4, 5]],
      ['midtown-audit-friday', [4, 5]],
    ] as const) {
      const refused = CONTRACT_LADDER.rows.find((row) => row.contractId === 'c2')?.weekOrders.find(
        (order) => order.id === id,
      );
      expect(refused, id).toBeDefined();
      if (refused === undefined) continue;
      const admission = weekOrderAdmissionOf('c2', refused);
      expect(admission.admitted, id).toBe(false);
      expect(
        admission.days.filter((entry) => entry.reason !== 'admitted').map((entry) => [entry.day, entry.reason]),
        id,
      ).toEqual(days.map((day) => [day, 'refused']));
      expect(dealtWeekOrdersOf('c2')).not.toContain(refused);
    }
  });

  /*
   * Wave AN, lane DQ-2 (§ D1343, § D1345): the three orders § D1254 dealt as weeks 2 to 4 are
   * admitted by DC-10 on every day and refused by the one-profile screen, because Predictive
   * balanced left alone holds each on more than half the census crowds. They stay authored, undealt.
   */
  it('refuses two orders DC-10 admits day by day where one profile left alone holds the week, and the third on its Thursday', () => {
    for (const [id, held] of [
      ['midtown-week-2', 15],
      ['midtown-week-3', 16],
    ] as const) {
      const order = authored(id);
      expect(order, id).toBeDefined();
      if (order === undefined) continue;
      const admission = weekOrderAdmissionOf('c2', order);
      expect(admission.days.every((day) => day.reason === 'admitted'), id).toBe(true);
      expect(admission.dominance.verdict, id).toBe('refused');
      expect(admission.dominance.target, id).toBe(4);
      expect(admission.dominance.strongest, id).toEqual({ profileId: 'predictive-balanced', held, n: 20 });
      expect(admission.admitted, id).toBe(false);
      expect(dealtWeekOrdersOf('c2')).not.toContain(order);
    }
    /*
     * `midtown-week-4` was the third of these, Predictive balanced holding it on 17. On the fixed
     * engine DC-10 refuses its Thursday, `goods-inward`, at 11 of 20 (§ D1616), so the week counts
     * four days with a target of three, and Predictive balanced holds that on all twenty.
     */
    const four = authored('midtown-week-4');
    expect(four).toBeDefined();
    if (four === undefined) return;
    const admission = weekOrderAdmissionOf('c2', four);
    expect(admission.days.map((day) => day.reason)).toEqual(['admitted', 'admitted', 'admitted', 'refused', 'admitted']);
    expect(admission.dominance.target).toBe(3);
    expect(admission.dominance.strongest).toEqual({ profileId: 'predictive-balanced', held: 20, n: 20 });
    expect(admission.admitted).toBe(false);
  });

  it('from week 2 cycles round the admitted orders, and never back to week 1’s draw', () => {
    /* Wave AN, lane DQ-2 (§ D1343): no week after the first is dealt an order the screen did not admit. */
    const cycle = dealtWeekOrdersOf('c2').length;
    if (cycle === 1) {
      expect(dealtWeekdays(2)).toEqual(dealtWeekdays(1));
      return;
    }
    expect(dealtWeekdays(cycle + 1)).toEqual(dealtWeekdays(2));
    for (let week = 2; week <= 2 * cycle; week += 1) expect(dealtWeekdays(week)).not.toEqual(dealtWeekdays(1));
  });
});
