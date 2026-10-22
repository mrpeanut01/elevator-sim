/**
 * **Midtown's dealt order, on the week as the census measured it before § D1603** —
 * [§ D1616](../../../../DECISIONS.md), carrying `weekOrders.test.ts`'s Midtown cases from wave AN,
 * lane DQ-2 ([§ D1343](../../../../DECISIONS.md) to [§ D1345](../../../../DECISIONS.md)).
 *
 * On the fixed engine § D1616 holds `midtown-early-lift`, so the shipped files deal no order from
 * week 2 and these cases would read week 1's draw twice. Here `data/week-way.json`,
 * `week-dominance.json`, `week-pool.json` and `call-bands.json` are the files as they stood on
 * `4ee9557`, the engine before the fix, where the order is admitted and dealt, so the admission, the
 * deal, the roll and the run seam are each tested on a real order and fail if they break.
 * `weekOrders.test.ts` pins what the shipped census deals.
 */

import { describe, expect, it, vi } from 'vitest';

/*
 * The four week censuses as they were measured before § D1603's release fix, in place of the shipped
 * files: the order these cases read is dealt there, and on the fixed engine it is held.
 */
vi.mock('../../../../data/week-way.json', () => vi.importActual('./preD1603/week-way.json'));
vi.mock('../../../../data/week-dominance.json', () => vi.importActual('./preD1603/week-dominance.json'));
vi.mock('../../../../data/week-pool.json', () => vi.importActual('./preD1603/week-pool.json'));
vi.mock('../../../../data/call-bands.json', () => vi.importActual('./preD1603/call-bands.json'));

import { scheduledEventFor } from './calendar.js';
import { CONTRACT_LADDER } from './ladder.js';
import { dealtWeekOrdersOf, weekOrderAdmissionOf } from './weekOrders.js';
import { dc10Of, WEEK_WAY, weekWayRowFor } from './weekWay.js';
import { closeDay, nextDay, openWeek, outcomeOf } from './week.js';
import type { WeekState } from './types.js';
import { weekDealOf } from './weekStake.js';
import { contractDayState } from './contractDay.test-helper.js';
import { WEEK_WAY_RESOURCES } from './weekWay.test-helper.js';
import { wholeDayFor, wholeDayRun } from './dayLength.js';
import { buildingConfigOf, shiftRunConfigOf } from '../dev/state.js';

/** The one order DC-10 and DC-11 admit on Midtown — § D1345. */
const ADMITTED_ORDER_ID = 'midtown-early-lift';

/** Midtown's week `week`, Monday to Friday, as the product deals it: the one composition every run reads. */
function dealtWeekdays(week: number): readonly string[] {
  return [1, 2, 3, 4, 5].map((day) => scheduledEventFor(null, day, day - 1, 'whole-day', { contractId: 'c2', week }).id);
}

describe('the next week is new — Midtown Office, swarm DO § 2, on the census before § D1603', () => {
  /*
   * Wave AN, lane DQ-2 (§ D1343, § D1345): under DC-11 one authored order is admitted on Midtown,
   * the order the lane authored after the screen refused § D1254's three, and every week from the
   * second deals it. Before the screen, weeks 2 to 4 dealt § D1254's three orders, which one
   * profile left alone holds.
   */
  it('admits exactly one authored order, by both the day census and the one-profile screen, and deals it from week 2', () => {
    const authored = CONTRACT_LADDER.rows.find((row) => row.contractId === 'c2')?.weekOrders ?? [];
    expect(authored.length).toBeGreaterThanOrEqual(6);
    const dealt = dealtWeekOrdersOf('c2');
    expect(dealt.map((order) => order?.id)).toEqual([undefined, ADMITTED_ORDER_ID]);
    const order = dealt[1];
    if (order === undefined) return;
    const admission = weekOrderAdmissionOf('c2', order);
    expect(admission.days.every((day) => day.reason === 'admitted')).toBe(true);
    expect(admission.dominance.verdict).toBe('admitted');
    expect(admission.dominance.strongest?.held ?? 99).toBeLessThanOrEqual(admission.dominance.atMost);
    expect(admission.admitted).toBe(true);
  });

  it('deals week 2 a different wrinkle from week 1 on every weekday, each census-admitted, and week 3 the same as week 2', () => {
    const [one, two, three] = [1, 2, 3].map(dealtWeekdays);
    expect(two).toEqual(dealtWeekOrdersOf('c2')[1]?.days);
    expect(three).toEqual(two);
    for (let day = 0; day < 5; day += 1) expect(two?.[day], `day ${String(day + 1)}`).not.toBe(one?.[day]);
    (two ?? []).forEach((eventId, dayIndex) => {
      const day = dayIndex + 1;
      const row = weekWayRowFor('c2', day, eventId, 'whole-day');
      expect(row?.eventId, `week 2 day ${String(day)} has its own census row`).toBe(eventId);
      expect(row === undefined ? false : dc10Of(row, WEEK_WAY.protocol).admitted).toBe(true);
    });
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

  /*
   * Wave AN, lane DQ-2 (§ D1343, § D1345): the three orders § D1254 dealt as weeks 2 to 4 are
   * admitted by DC-10 on every day and refused by the one-profile screen, because Predictive
   * balanced left alone holds each on more than half the census crowds. They stay authored, undealt.
   */
  it('refuses the three orders DC-10 admits day by day where one profile left alone holds the week', () => {
    for (const [id, held] of [
      ['midtown-week-2', 15],
      ['midtown-week-3', 16],
      ['midtown-week-4', 17],
    ] as const) {
      const order = CONTRACT_LADDER.rows.find((row) => row.contractId === 'c2')?.weekOrders.find((entry) => entry.id === id);
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
