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
import { dc10Of, WEEK_WAY, weekWayRowFor, type WeekWay, type WeekWayRow } from './weekWay.js';
import { nextDay, openWeek } from './week.js';
import { weekDealOf } from './weekStake.js';
import { contractDayState } from './contractDay.test-helper.js';
import { WEEK_WAY_RESOURCES } from './weekWay.test-helper.js';
import { wholeDayFor, wholeDayRun } from './dayLength.js';
import { buildingConfigOf, shiftRunConfigOf } from '../dev/state.js';

/** The shipped ladder with `orders` authored on Midtown Office's rung. */
function ladderWith(orders: readonly ContractWeekOrder[]): ContractLadder {
  return {
    ...CONTRACT_LADDER,
    rows: CONTRACT_LADDER.rows.map((row) => (row.contractId === 'c2' ? { ...row, weekOrders: orders } : row)),
  };
}

/** The shipped census with one extra row per day of `order`, copied from week 1's row for that day. */
function censusAdmitting(order: ContractWeekOrder, over: Partial<WeekWayRow> = {}): WeekWay {
  const extra = order.days.map((eventId, index) => {
    const day = index + 1;
    const template = WEEK_WAY.rows.find((row) => row.contractId === 'c2' && row.day === day && row.eventId === 'ordinary');
    if (template === undefined) throw new Error(`no c2 day ${String(day)} row`);
    return { ...template, eventId, ...over };
  });
  return { ...WEEK_WAY, rows: [...WEEK_WAY.rows, ...extra] };
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
    expect(weekOrderAdmissionOf('c2', ORDER, census).admitted).toBe(true);
    expect(dealtWeekOrdersOf('c2', census, ladderWith([ORDER]))).toEqual([undefined, ORDER]);
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
    const issues = weekOrderIssues(ladderWith([repeat]), censusAdmitting(repeat));
    expect(issues).toEqual(['c2: week 1 and the week after it both deal fire-drill', 'c2: week 2 and the week after it both deal fire-drill']);
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

/** Midtown's week `week`, Monday to Friday, as the product deals it: the one composition every run reads. */
function dealtWeekdays(week: number): readonly string[] {
  return [1, 2, 3, 4, 5].map((day) => scheduledEventFor(null, day, day - 1, 'whole-day', { contractId: 'c2', week }).id);
}

describe('the next week is new — Midtown Office, swarm DO § 2', () => {
  it('authors at least three week orders, and the census admits every one it deals', () => {
    const authored = CONTRACT_LADDER.rows.find((row) => row.contractId === 'c2')?.weekOrders ?? [];
    expect(authored.length).toBeGreaterThanOrEqual(3);
    const dealt = dealtWeekOrdersOf('c2');
    expect(dealt.length, 'week 1 and at least two admitted orders').toBeGreaterThanOrEqual(3);
    for (const order of dealt) {
      if (order === undefined) continue;
      expect(weekOrderAdmissionOf('c2', order).admitted, order.id).toBe(true);
    }
  });

  it('deals weeks 1, 2 and 3 three different wrinkle orders, every day of them census-admitted', () => {
    const weeks = [1, 2, 3].map(dealtWeekdays);
    expect(new Set(weeks.map((ids) => ids.join('|'))).size).toBe(3);
    /* Different on every weekday, not only somewhere in the week. */
    for (let day = 0; day < 5; day += 1) {
      expect(new Set(weeks.map((ids) => ids[day])).size, `day ${String(day + 1)}`).toBe(3);
    }
    for (const [index, ids] of weeks.entries()) {
      ids.forEach((eventId, dayIndex) => {
        const day = dayIndex + 1;
        const row = weekWayRowFor('c2', day, eventId, 'whole-day');
        expect(row?.eventId, `week ${String(index + 1)} day ${String(day)} has its own census row`).toBe(eventId);
        expect(row === undefined ? false : dc10Of(row, WEEK_WAY.protocol).admitted).toBe(true);
      });
    }
  });

  it('reaches week 2 by playing through week 1: the roll deals the next order', () => {
    let week = openWeek('c2');
    const seen: string[][] = [[], []];
    for (let step = 0; step < 14; step += 1) {
      if (week.day <= 5) seen[week.week - 1]?.push(scheduledEventFor(null, week.day, week.dayIdx, 'whole-day', week).id);
      week = nextDay(week);
    }
    expect(seen).toEqual([dealtWeekdays(1), dealtWeekdays(2)]);
    expect(seen[0]).not.toEqual(seen[1]);
  });

  it('counts week 2’s days by week 2’s own census rows, and derives its target from them', () => {
    const deal = weekDealOf({ contractId: 'c2', week: 2 });
    expect(deal?.days.slice(0, 5).map((day) => day.eventId)).toEqual(dealtWeekdays(2));
    expect(deal?.days.slice(0, 5).every((day) => day.row?.eventId === day.eventId)).toBe(true);
    expect(deal?.target).toBe(Math.max(1, (deal?.counted ?? 0) - 1));
  });

  it('does not deal the two orders the census refused, and names the days each was refused on', () => {
    for (const [id, days] of [
      ['midtown-lift-service', [2, 5]],
      ['midtown-audit-friday', [5]],
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

  it('cycles back to week 1 after the last admitted order', () => {
    const cycle = dealtWeekOrdersOf('c2').length;
    expect(dealtWeekdays(cycle + 1)).toEqual(dealtWeekdays(1));
    expect(dealtWeekdays(cycle + 2)).toEqual(dealtWeekdays(2));
  });

  it('runs exactly the day the census measured: an order’s day built from the week is the census cell’s run', () => {
    const resources = WEEK_WAY_RESOURCES;
    const authoredBuilding = buildingConfigOf(resources, [], 'midtown-office');
    const whole = wholeDayFor(resources.trafficProfiles, authoredBuilding);
    const horizon = whole === undefined ? {} : wholeDayRun(whole);
    const text = (value: unknown): string => JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? String(v) : v));
    for (const [index, order] of dealtWeekOrdersOf('c2').entries()) {
      if (order === undefined) continue;
      order.days.forEach((eventId, dayIndex) => {
        const day = dayIndex + 1;
        const base = { ...horizon, week: { ...openWeek('c2'), day, dayIdx: dayIndex } };
        const dealt = contractDayState('c2', {
          seed: 20_261_001n,
          over: { ...base, week: { ...base.week, week: index + 1 }, campaignEventId: undefined },
        });
        const census = contractDayState('c2', { seed: 20_261_001n, over: { ...base, campaignEventId: eventId } });
        expect(text(shiftRunConfigOf(resources, dealt).config), `${order.id} day ${String(day)}`).toBe(
          text(shiftRunConfigOf(resources, census).config),
        );
      });
    }
  });
});
