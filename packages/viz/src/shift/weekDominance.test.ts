/**
 * The one-profile screen — wave AN, lane DQ-2, [§ D1343](../../../../DECISIONS.md). See
 * `weekDominance.ts`.
 */

import { describe, expect, it } from 'vitest';

import dispatcherProfiles from '../../../../data/dispatcher-profiles.json' with { type: 'json' };

import { CONTRACT_LADDER, type ContractLadder, type ContractWeekOrder } from './ladder.js';
import {
  parseWeekDominance,
  WEEK_DOMINANCE,
  weekDominanceIssues,
  weekDominanceOf,
  type WeekDominance,
  type WeekDominanceRow,
} from './weekDominance.js';
import { dealtWeekOrdersOf, weekOrderAdmissionOf } from './weekOrders.js';
import { WEEK_WAY, weekWayRowFor } from './weekWay.js';
import { crowdSeeds, weekWayCell } from './weekWay.test-helper.js';

const SHIPPED_PROFILES: readonly string[] = (dispatcherProfiles as { profiles: { id: string }[] }).profiles.map(
  (profile) => profile.id,
);

const ordersOf = (contractId: string): readonly ContractWeekOrder[] | undefined =>
  CONTRACT_LADDER.rows.find((row) => row.contractId === contractId)?.weekOrders;

/** Midtown's first authored order: every one of its five days has a census row, and all five count. */
const MIDTOWN_ORDER = ordersOf('c2')?.find((order) => order.id === 'midtown-week-2') as ContractWeekOrder;

const N = WEEK_WAY.protocol.heldOutCount;

/** A profile's five strings that clear exactly `days` (1-based) on the first `crowds` crowds, and nothing else. */
function marks(crowds: number, days: readonly number[] = [1, 2, 3, 4, 5]): readonly string[] {
  return [1, 2, 3, 4, 5].map((day) =>
    Array.from({ length: N }, (_, crowd) => (crowd < crowds && days.includes(day) ? 'C' : 'm')).join(''),
  );
}

/** The house's own strings for the order, off the census rows — the cross-check `weekDominanceIssues` holds. */
function houseOf(order: ContractWeekOrder): readonly string[] {
  return order.days.map(
    (eventId, index) => weekWayRowFor('c2', index + 1, eventId, WEEK_WAY.protocol.horizon)?.standingVerdicts ?? '',
  );
}

/** A screen with one row over Midtown's order: every profile at `crowds` crowds held unless named in `over`. */
function screenWith(
  over: Readonly<Record<string, readonly string[]>> = {},
  drop: readonly string[] = [],
  share = 0.5,
): WeekDominance {
  const verdicts: Record<string, readonly string[]> = {};
  for (const id of SHIPPED_PROFILES) {
    if (drop.includes(id)) continue;
    verdicts[id] = over[id] ?? (id === WEEK_WAY.protocol.standingOrder ? houseOf(MIDTOWN_ORDER) : marks(3));
  }
  const row: WeekDominanceRow = { contractId: 'c2', orderId: MIDTOWN_ORDER.id, days: MIDTOWN_ORDER.days, verdicts };
  return {
    version: 1,
    protocol: { ...WEEK_DOMINANCE.protocol, oneProfileHoldsAtMost: share },
    rows: [row],
  };
}

describe('the shipped screen', () => {
  it('is well formed, measures on DC-10’s held-out crowds, names every shipped profile and agrees with the census on the house', () => {
    expect(weekDominanceIssues(WEEK_DOMINANCE, ordersOf, SHIPPED_PROFILES)).toEqual([]);
    expect(WEEK_DOMINANCE.protocol.heldOutFrom).toBe(WEEK_WAY.protocol.heldOutFrom);
    expect(WEEK_DOMINANCE.protocol.heldOutCount).toBe(WEEK_WAY.protocol.heldOutCount);
  });

  it('holds the owner-reversible threshold at the ruling’s half', () => {
    expect(WEEK_DOMINANCE.protocol.oneProfileHoldsAtMost).toBe(0.5);
  });

  it('re-runs one crowd of one profile on one day of the first shipped row, and reproduces its mark', () => {
    /*
     * A screen row is a claim about the product's chain on the day it was taken, as a census row is
     * (`weekWay.test.ts` re-runs one crowd of one row for the same reason). One whole day here; every
     * crowd of every row is the weekly re-check's.
     */
    const row = WEEK_DOMINANCE.rows[0];
    expect(row, 'the screen carries at least one row').toBeDefined();
    if (row === undefined) return;
    const profileId = Object.keys(row.verdicts).find((id) => id !== WEEK_WAY.protocol.standingOrder) ?? '';
    const day = 4;
    const seed = crowdSeeds(WEEK_WAY.protocol.heldOutFrom, 1)[0] ?? 0n;
    const cell = weekWayCell('c2', day, seed, { dispatcherId: profileId, press: '', atFraction: 0 }, false, row.days[day - 1]);
    expect(cell.cleared ? 'C' : 'm').toBe(row.verdicts[profileId]?.[day - 1]?.[0]);
  });
});

describe('a profile holds the week where it clears the target of the counted days', () => {
  it('reads the counted days and the target off DC-10’s rows for the order as dealt', () => {
    const reading = weekDominanceOf('c2', MIDTOWN_ORDER, WEEK_WAY, screenWith());
    expect(reading.counted).toEqual([1, 2, 3, 4, 5]);
    expect(reading.target).toBe(4);
  });

  it('counts a crowd held at four counted days clean and not at three', () => {
    const fourDays = weekDominanceOf('c2', MIDTOWN_ORDER, WEEK_WAY, screenWith({ 'fairness-first': marks(9, [1, 2, 3, 4]) }));
    expect(fourDays.holds.find((hold) => hold.profileId === 'fairness-first')?.held).toBe(9);
    const threeDays = weekDominanceOf('c2', MIDTOWN_ORDER, WEEK_WAY, screenWith({ 'fairness-first': marks(9, [1, 2, 3]) }));
    expect(threeDays.holds.find((hold) => hold.profileId === 'fairness-first')?.held).toBe(0);
  });
});

describe('the rule: no single profile holds it on more than half the crowds', () => {
  it('admits an order every profile holds on half the crowds or fewer', () => {
    const reading = weekDominanceOf('c2', MIDTOWN_ORDER, WEEK_WAY, screenWith({ 'predictive-balanced': marks(N / 2) }));
    expect(reading.atMost).toBe(N / 2);
    expect(reading.strongest).toEqual({ profileId: 'predictive-balanced', held: N / 2, n: N });
    expect(reading.verdict).toBe('admitted');
  });

  it('refuses it the moment one profile holds it on one crowd more, and names that profile', () => {
    const reading = weekDominanceOf('c2', MIDTOWN_ORDER, WEEK_WAY, screenWith({ 'predictive-balanced': marks(N / 2 + 1) }));
    expect(reading.verdict).toBe('refused');
    expect(reading.strongest).toEqual({ profileId: 'predictive-balanced', held: N / 2 + 1, n: N });
  });

  it('refuses on a row naming only some profiles, and admits only once every profile is measured', () => {
    const partialOver = screenWith({ 'fairness-first': marks(N) }, ['eta', 'nearest-car']);
    expect(weekDominanceOf('c2', MIDTOWN_ORDER, WEEK_WAY, partialOver).verdict).toBe('refused');
    const partialUnder = screenWith({}, ['eta', 'nearest-car']);
    const reading = weekDominanceOf('c2', MIDTOWN_ORDER, WEEK_WAY, partialUnder);
    expect(reading.verdict).toBe('unmeasured');
    expect(reading.missing).toEqual(['nearest-car', 'eta']);
  });

  it('is unmeasured with no row, or with a row over other days than the order deals', () => {
    expect(weekDominanceOf('c2', MIDTOWN_ORDER, WEEK_WAY, { ...WEEK_DOMINANCE, rows: [] }).verdict).toBe('unmeasured');
    const moved: ContractWeekOrder = { ...MIDTOWN_ORDER, days: [...MIDTOWN_ORDER.days.slice(0, 4), 'move-in:past-halfway'] };
    expect(weekDominanceOf('c2', moved, WEEK_WAY, screenWith()).verdict).toBe('unmeasured');
  });

  it('moves with its one threshold: the same row refused at a third and admitted at half', () => {
    /* Move the control and require the result to change — the threshold is data, and it reaches the verdict. */
    const over = { auction: marks(8) };
    expect(weekDominanceOf('c2', MIDTOWN_ORDER, WEEK_WAY, screenWith(over, [], 0.5)).verdict).toBe('admitted');
    expect(weekDominanceOf('c2', MIDTOWN_ORDER, WEEK_WAY, screenWith(over, [], 1 / 3)).verdict).toBe('refused');
  });
});

describe('only an order the screen admits is dealt', () => {
  /** The shipped ladder with only `order` authored on Midtown's rung. */
  const ladderWith = (order: ContractWeekOrder): ContractLadder => ({
    ...CONTRACT_LADDER,
    rows: CONTRACT_LADDER.rows.map((row) => (row.contractId === 'c2' ? { ...row, weekOrders: [order] } : row)),
  });

  it('deals an order DC-10 admits day by day only when the screen admits the week too', () => {
    const ladder = ladderWith(MIDTOWN_ORDER);
    const admitted = screenWith();
    expect(weekOrderAdmissionOf('c2', MIDTOWN_ORDER, WEEK_WAY, admitted).days.every((day) => day.reason === 'admitted')).toBe(true);
    expect(dealtWeekOrdersOf('c2', WEEK_WAY, ladder, admitted)).toEqual([undefined, MIDTOWN_ORDER]);
    const refused = screenWith({ 'fairness-first': marks(N) });
    expect(weekOrderAdmissionOf('c2', MIDTOWN_ORDER, WEEK_WAY, refused).admitted).toBe(false);
    expect(dealtWeekOrdersOf('c2', WEEK_WAY, ladder, refused)).toEqual([undefined]);
    expect(dealtWeekOrdersOf('c2', WEEK_WAY, ladder, { ...admitted, rows: [] })).toEqual([undefined]);
  });
});

describe('the screen’s own checks', () => {
  it('names a row whose house differs from the census, an unknown order or profile, and malformed marks', () => {
    const base = screenWith();
    const row = base.rows[0] as WeekDominanceRow;
    const broken: WeekDominance = {
      ...base,
      rows: [
        { ...row, verdicts: { ...row.verdicts, collective: marks(N) } },
        { ...row, orderId: 'no-such-order' },
        { ...row, orderId: 'midtown-week-3', verdicts: { 'not-a-profile': marks(1), eta: ['CC'] } },
      ],
    };
    const issues = weekDominanceIssues(broken, ordersOf, SHIPPED_PROFILES);
    expect(issues.some((issue) => issue.includes("standing order's marks differ"))).toBe(true);
    expect(issues.some((issue) => issue.includes('names no authored order'))).toBe(true);
    expect(issues.some((issue) => issue.includes('carries not-a-profile'))).toBe(true);
    expect(issues.some((issue) => issue.includes('eta is not five strings'))).toBe(true);
    expect(issues.some((issue) => issue.includes('was measured over'))).toBe(true);
  });

  it('refuses a protocol off DC-10’s crowds, with a profile list that is not the shipped one, or a threshold outside (0, 1)', () => {
    const p = WEEK_DOMINANCE.protocol;
    const issues = weekDominanceIssues(
      parseWeekDominance({ version: 1, protocol: { ...p, heldOutCount: 12, oneProfileHoldsAtMost: 1, profiles: p.profiles.slice(1) }, rows: [] }),
      ordersOf,
      SHIPPED_PROFILES,
    );
    expect(issues).toEqual([
      'protocol crowds are not DC-10’s held-out crowds',
      'protocol oneProfileHoldsAtMost is 1',
      'protocol profiles are not every shipped profile in file order; re-run the screen',
    ]);
  });
});

/*
 * The shipped screen, pinned — § D1345: the one order DC-10 and DC-11 both admit on Midtown, every
 * profile measured, and Predictive balanced holding it on exactly half the crowds, which DC-11 admits
 * (refused only above half).
 */
describe('Midtown’s admitted order, as the screen measured it', () => {
  it('holds midtown-early-lift under the line for every shipped profile', () => {
    const order = ordersOf('c2')?.find((entry) => entry.id === 'midtown-early-lift');
    expect(order).toBeDefined();
    if (order === undefined) return;
    const reading = weekDominanceOf('c2', order);
    expect(reading.verdict).toBe('admitted');
    expect(reading.missing).toEqual([]);
    expect(Object.fromEntries(reading.holds.map((hold) => [hold.profileId, hold.held]))).toEqual({
      'nearest-car': 0,
      eta: 2,
      collective: 0,
      'collective-enroute': 0,
      'energy-aware': 3,
      'fairness-first': 9,
      'capacity-aware': 6,
      'predictive-balanced': 10,
      auction: 8,
      'auction-multi-round': 7,
      'zoned-uppeak': 1,
      'destination-eta': 4,
      'destination-panel': 0,
    });
    expect(reading.strongest).toEqual({ profileId: 'predictive-balanced', held: 10, n: 20 });
  });
});
