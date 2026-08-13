/**
 * **§ 8's formulas, held against the two figures the contract publishes.**
 *
 * `ENGINE_CONTRACT.md` § 8 states two totals in prose — *"A perfect standard month pays **98
 * units**. The shop is worth **324**"* — and every other line of § 8 is a formula with no published
 * answer. So the shape of this file is: the two totals are checked against **sums over the tables**
 * (a mistyped rate or tier cost fails here rather than moving a lede), and every formula is checked
 * against a worked case whose arithmetic is written out in the assertion rather than recomputed by
 * the code under test.
 *
 * The `98 ≈ a third of 324` relationship is checked too, because the contract screen's lede asserts
 * it in words (*"A perfect month buys about a third of the shop"*) and a lede that stopped being
 * true of the tables would be this repository's stale-sentence defect in the one place a player
 * reads a ratio.
 */

import { describe, expect, it } from 'vitest';

import {
  CALENDAR_SPAN,
  CONTRACT_DAYS,
  COMPLEXITY_MAX,
  DIFFICULTIES,
  DIFFICULTY_IDS,
  FRESH_ODDS_PCT,
  REFURBISHMENT,
  SHOP,
  SHOP_CATEGORY_IDS,
  SLOTS,
  type TowerEconomy,
  atRiskTowers,
  calendarColumns,
  calendarFrom,
  calendarRow,
  carriedIn,
  clearedDays,
  committedUnits,
  complexityOf,
  contractEndDay,
  contractIsLost,
  contractStartDay,
  dayIndexOf,
  daysOfBenefit,
  earnedSoFar,
  failureOddsPct,
  fittedLevel,
  legalStarts,
  nextSlot,
  oddsAfterWorksPct,
  perfectMonthUnits,
  purseOf,
  rateOnDay,
  renewalOffer,
  serviceDaysLeft,
  shopTierAt,
  shopTierState,
  shopTotalUnits,
  slotsOpen,
  standingOf,
  startIsLegal,
  wearHeadOf,
  wearOf,
  worksDayLine,
} from './economy.js';

/** A standard-difficulty tower with nothing bought and nothing worn, for a case to move one field of. */
function tower(patch: Partial<TowerEconomy> = {}): TowerEconomy {
  return {
    day: 1,
    missed: 0,
    months: 0,
    carry: undefined,
    difficultyId: 'standard',
    fitted: {},
    bookings: [],
    trips: 0,
    serviceAt: 45_000,
    refit: 0,
    rate: 3,
    ...patch,
  };
}

/* -------------------------------------------------------------------------- *
 * The two published totals
 * -------------------------------------------------------------------------- */

describe('the figures § 8 publishes, derived from the tables that produce them', () => {
  it('pays 98 units for a perfect standard month — 8 in the purse and four rates over five days each', () => {
    // The contract's own arithmetic, written out: 8 + (3 + 4 + 5 + 6) × 5.
    expect(perfectMonthUnits(DIFFICULTIES.standard)).toBe(8 + (3 + 4 + 5 + 6) * 5);
    expect(perfectMonthUnits(DIFFICULTIES.standard)).toBe(98);
  });

  it('prices the shop at 324, summed over six categories rather than stated', () => {
    expect(shopTotalUnits()).toBe(324);
    // And the sum is genuinely over the table: the six category subtotals add to it.
    const subtotals = SHOP.map((category) =>
      category.tiers.reduce((sum, tier) => sum + tier.units, 0),
    );
    expect(subtotals).toEqual([29, 43, 79, 50, 88, 35]);
    expect(subtotals.reduce((a, b) => a + b, 0)).toBe(shopTotalUnits());
  });

  it('leaves the contract screen’s lede true — a perfect month is about a third of the shop', () => {
    const share = perfectMonthUnits(DIFFICULTIES.standard) / shopTotalUnits();
    expect(share).toBeGreaterThan(0.28);
    expect(share).toBeLessThan(0.36);
  });

  it('pays 53 units over an impossible month, which is that tier’s own note', () => {
    // The note reads "the whole month pays 53 units": 3 + (2 + 2 + 3 + 3) × 5.
    expect(perfectMonthUnits(DIFFICULTIES.impossible)).toBe(53);
    expect(DIFFICULTIES.impossible.note).toContain('53 units');
  });
});

describe('§ 8.6’s difficulty table', () => {
  it('carries all four tiers, in the contract’s order, each with four weekly rates', () => {
    expect(DIFFICULTY_IDS).toEqual(['easy', 'standard', 'hard', 'impossible']);
    for (const id of DIFFICULTY_IDS) {
      expect(DIFFICULTIES[id].rates, id).toHaveLength(4);
      expect(DIFFICULTIES[id].id, id).toBe(id);
    }
  });

  it('transcribes the contract’s purse, allowance and four tests', () => {
    expect(DIFFICULTIES.easy.purse).toBe(16);
    expect(DIFFICULTIES.easy.miss).toBe(6);
    expect(DIFFICULTIES.easy.tests).toEqual({ away: 65, worstS: 240, queue: 40, trips: 620 });
    expect(DIFFICULTIES.standard.tests).toEqual({ away: 75, worstS: 180, queue: 25, trips: 520 });
    expect(DIFFICULTIES.hard.tests).toEqual({ away: 82, worstS: 150, queue: 18, trips: 470 });
    expect(DIFFICULTIES.impossible.tests).toEqual({ away: 88, worstS: 120, queue: 12, trips: 430 });
    expect(DIFFICULTIES.impossible.miss).toBe(0);
  });

  it('steps the rate every five days and clamps at week four', () => {
    const standard = DIFFICULTIES.standard;
    expect([0, 4].map((d) => rateOnDay(standard, d))).toEqual([3, 3]);
    expect([5, 9].map((d) => rateOnDay(standard, d))).toEqual([4, 4]);
    expect([10, 14].map((d) => rateOnDay(standard, d))).toEqual([5, 5]);
    expect([15, 19].map((d) => rateOnDay(standard, d))).toEqual([6, 6]);
    // Past the contract, week four's rate rather than a read off the end of the array.
    expect(rateOnDay(standard, 25)).toBe(6);
  });
});

/* -------------------------------------------------------------------------- *
 * § 8.1 — days and money
 * -------------------------------------------------------------------------- */

describe('§ 8.1’s day and money arithmetic', () => {
  it('derives cleared from the day and the missed count, and cannot exceed the days played', () => {
    expect(clearedDays(tower({ day: 5, missed: 0 }))).toBe(4);
    expect(clearedDays(tower({ day: 5, missed: 1 }))).toBe(3);
    expect(clearedDays(tower({ day: 1 }))).toBe(0);
    // § 8.7: a counter derives both halves, so `4 of 1` is not expressible.
    expect(clearedDays(tower({ day: 2, missed: 9 }))).toBe(0);
  });

  it('earns the rate of each past day, and pays nothing for the missed ones at the tail', () => {
    // Six days played, none missed: five at week one's rate (3) plus one at week two's (4).
    expect(earnedSoFar(tower({ day: 7 }))).toBe(3 * 5 + 4);
    // The same six with one missed: the last of them — a week-two day at 4 — is unpaid.
    expect(earnedSoFar(tower({ day: 7, missed: 1 }))).toBe(3 * 5);
    expect(earnedSoFar(tower({ day: 1 }))).toBe(0);
  });

  it('carries in the difficulty’s purse plus months held, unless a carry is set', () => {
    expect(carriedIn(tower())).toBe(8);
    expect(carriedIn(tower({ months: 3 }))).toBe(8 + Math.round(3 * 3.5));
    expect(carriedIn(tower({ months: 3, carry: 21 }))).toBe(21);
  });

  it('commits the money when a tier is booked, not when it goes live', () => {
    const booked = tower({
      day: 3,
      bookings: [{ categoryId: 'machines', level: 1, startIdx: 8, nights: 2, units: 14 }],
    });
    expect(committedUnits(booked)).toBe(14);
    // The works are eight days away, so nothing is fitted — and the money has still gone.
    expect(fittedLevel(booked, 'machines')).toBe(0);
    expect(purseOf(booked)).toBe(Math.max(0, 8 + 3 * 2 - 14));
  });

  it('never lets the purse go below zero', () => {
    const overspent = tower({
      bookings: [{ categoryId: 'shafts', level: 1, startIdx: 0, nights: 8, units: 34 }],
    });
    expect(purseOf(overspent)).toBe(0);
  });

  it('counts kit carried in from an earlier month as fitted and as costing nothing again', () => {
    const renewed = tower({ day: 2, months: 1, fitted: { doors: 2 } });
    expect(fittedLevel(renewed, 'doors')).toBe(2);
    expect(committedUnits(renewed)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * § 8.2 — the shop and its booking rules
 * -------------------------------------------------------------------------- */

describe('§ 8.2’s shop table', () => {
  it('has the contract’s six categories, in its order', () => {
    expect(SHOP.map((category) => category.id)).toEqual([...SHOP_CATEGORY_IDS]);
    expect(SHOP.map((category) => category.tiers.length)).toEqual([3, 3, 3, 2, 2, 3]);
  });

  it('prices the shaft at the contract’s signature figures — 34 units and eight nights', () => {
    const shaft = shopTierAt('shafts', 1);
    expect(shaft?.units).toBe(34);
    expect(shaft?.nights).toBe(8);
  });

  it('numbers every tier from one, with no gaps', () => {
    for (const category of SHOP) {
      expect(
        category.tiers.map((tier) => tier.level),
        category.id,
      ).toEqual(category.tiers.map((_unused, index) => index + 1));
    }
  });
});

describe('§ 8.2’s buying rules', () => {
  it('refuses a tier whose tier below is not owned, and says which', () => {
    const state = shopTierState(tower({ carry: 100 }), 'doors', SHOP[0]!.tiers[1]!);
    expect(state.id).toBe('needs-below');
    expect(state.needsLevel).toBe(1);
    expect(state.pressable).toBe(false);
  });

  it('names what an unaffordable tier is short by, and refuses the press', () => {
    // Standard opens with 8 units; the fourth car is 34.
    const state = shopTierState(tower(), 'shafts', SHOP[4]!.tiers[0]!);
    expect(state.id).toBe('short');
    expect(state.shortBy).toBe(34 - 8);
    expect(state.pressable).toBe(false);
  });

  it('refuses works that would run past the contract', () => {
    // Day 18 of twenty, and the fourth car needs eight nights.
    const late = tower({ day: 18, carry: 100 });
    expect(daysOfBenefit(late, 8)).toBeLessThanOrEqual(0);
    expect(shopTierState(late, 'shafts', SHOP[4]!.tiers[0]!).id).toBe('past-contract');
  });

  it('lets a zero-night tier be bought on any day, because it needs no nights at all', () => {
    const late = tower({ day: 20, carry: 100 });
    expect(shopTierState(late, 'tenants', SHOP[5]!.tiers[0]!).id).toBe('buyable');
  });

  it('legalises a start only from today, inside the contract, and clear of other works', () => {
    const busy = tower({
      day: 3,
      carry: 100,
      bookings: [{ categoryId: 'doors', level: 2, startIdx: 5, nights: 1, units: 9 }],
    });
    // Yesterday is not a legal start.
    expect(startIsLegal(busy, 0, 2)).toBe(false);
    // Today is.
    expect(startIsLegal(busy, 2, 2)).toBe(true);
    // Overlapping the booked night is not.
    expect(startIsLegal(busy, 4, 2)).toBe(false);
    expect(startIsLegal(busy, 5, 1)).toBe(false);
    // Running past day twenty is not.
    expect(startIsLegal(busy, 19, 2)).toBe(false);
    expect(legalStarts(busy, 1)).not.toContain(5);
    expect(legalStarts(busy, 1)[0]).toBe(2);
  });

  it('reads a booking back as the contract prints it — works day 12–13, live on day 14', () => {
    // The reconciliation the module docstring sets out: a 0-based start of 11 is day 12.
    expect(
      worksDayLine({ categoryId: 'machines', level: 1, startIdx: 11, nights: 2, units: 14 }),
    ).toBe('works day 12–13 · live on day 14');
    expect(
      worksDayLine({ categoryId: 'doors', level: 2, startIdx: 11, nights: 1, units: 9 }),
    ).toBe('works day 12 · live on day 13');
  });

  it('turns a booking live exactly when its nights are behind today', () => {
    const booking = { categoryId: 'doors' as const, level: 2, startIdx: 4, nights: 1, units: 9 };
    // Works on day 5 (index 4); live on day 6 (index 5).
    expect(fittedLevel(tower({ day: 5, bookings: [booking] }), 'doors')).toBe(0);
    expect(fittedLevel(tower({ day: 6, bookings: [booking] }), 'doors')).toBe(2);
    expect(shopTierState(tower({ day: 6, bookings: [booking] }), 'doors', SHOP[0]!.tiers[1]!).id).toBe(
      'fitted',
    );
    expect(shopTierState(tower({ day: 5, bookings: [booking] }), 'doors', SHOP[0]!.tiers[1]!).id).toBe(
      'under-works',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * § 8.3 — wear, service and failure odds
 * -------------------------------------------------------------------------- */

describe('§ 8.3’s wear clock and failure odds', () => {
  it('caps wear at 1.3 however far past the interval the trips go', () => {
    expect(wearOf(tower({ trips: 22_500 }))).toBeCloseTo(0.5, 10);
    expect(wearOf(tower({ trips: 45_000 }))).toBeCloseTo(1, 10);
    expect(wearOf(tower({ trips: 200_000 }))).toBe(1.3);
  });

  it('opens at the fresh odds and climbs with the square-and-a-bit of wear', () => {
    expect(failureOddsPct(tower())).toBeCloseTo(FRESH_ODDS_PCT, 10);
    // 0.4 + 7.5 × 1^2.4 = 7.9 at exactly the interval.
    expect(failureOddsPct(tower({ trips: 45_000 }))).toBeCloseTo(7.9, 10);
    // The refit term only bites above 0.6.
    expect(failureOddsPct(tower({ refit: 0.6 }))).toBeCloseTo(FRESH_ODDS_PCT, 10);
    expect(failureOddsPct(tower({ refit: 0.8 }))).toBeCloseTo(FRESH_ODDS_PCT + 3 * 0.2, 10);
  });

  it('heads the condition card by the contract’s three thresholds', () => {
    expect(wearHeadOf(tower({ trips: 0 }))).toBe('fresh');
    expect(wearHeadOf(tower({ trips: 27_000 }))).toBe('fresh'); // exactly 0.6 — not past it
    expect(wearHeadOf(tower({ trips: 30_000 }))).toBe('wearing');
    expect(wearHeadOf(tower({ trips: 38_250 }))).toBe('wearing'); // exactly 0.85
    expect(wearHeadOf(tower({ trips: 40_000 }))).toBe('due');
  });

  it('counts the working days left from the trips a day, and never below zero', () => {
    expect(serviceDaysLeft(tower({ trips: 31_000 }))).toBe(10);
    expect(serviceDaysLeft(tower({ trips: 60_000 }))).toBe(0);
  });

  it('pushes the odds down for booked works, hardest for machines and least for the rest', () => {
    const worn = tower({ trips: 45_000, carry: 200 });
    const base = failureOddsPct(worn);
    const withMachines = oddsAfterWorksPct({
      ...worn,
      bookings: [{ categoryId: 'machines', level: 1, startIdx: 5, nights: 2, units: 14 }],
    });
    const withTenants = oddsAfterWorksPct({
      ...worn,
      bookings: [{ categoryId: 'tenants', level: 1, startIdx: 5, nights: 0, units: 5 }],
    });
    expect(withMachines).toBeLessThan(withTenants);
    expect(withTenants).toBeLessThan(base);
    // And never below the odds on freshly serviced machines.
    const everything = oddsAfterWorksPct({
      ...worn,
      bookings: [{ categoryId: 'machines', level: 3, startIdx: 0, nights: 5, units: 40 }],
    });
    expect(everything).toBeGreaterThanOrEqual(FRESH_ODDS_PCT);
  });

  it('prices the refurbishment at § 8.7’s own figures', () => {
    expect(REFURBISHMENT).toEqual({ units: 46, nights: 10 });
  });
});

/* -------------------------------------------------------------------------- *
 * § 8.4 — standing, slots and risk
 * -------------------------------------------------------------------------- */

describe('§ 8.4’s standing and slots', () => {
  it('is two a cleared day, minus three a missed one, plus what finished contracts banked', () => {
    const towers = [tower({ day: 11, missed: 1 }), tower({ day: 6, missed: 0 })];
    // 9 cleared × 2 − 1 × 3, then 5 cleared × 2, on top of a carry of 4.
    expect(standingOf(4, towers)).toBe(4 + (9 * 2 - 3) + 5 * 2);
    expect(standingOf(0, [])).toBe(0);
  });

  it('opens the six slots at the contract’s thresholds', () => {
    expect(SLOTS.map((slot) => slot.standing)).toEqual([0, 14, 30, 60, 110, 180]);
    expect(slotsOpen(0)).toBe(1);
    expect(slotsOpen(13)).toBe(1);
    expect(slotsOpen(14)).toBe(2);
    expect(slotsOpen(179)).toBe(5);
    expect(slotsOpen(180)).toBe(SLOTS.length);
    expect(nextSlot(0)?.standing).toBe(14);
    expect(nextSlot(180)).toBeUndefined();
  });

  it('flags a tower at risk only while there is still a month left to lose', () => {
    // Standard allows three; a tower on its third miss is one more from ending.
    expect(atRiskTowers([tower({ day: 10, missed: 3 })])).toHaveLength(1);
    expect(atRiskTowers([tower({ day: 10, missed: 2 })])).toHaveLength(0);
    // Day 19 or later is out of the window: the contract is ending anyway.
    expect(atRiskTowers([tower({ day: 19, missed: 3 })])).toHaveLength(0);
  });

  it('ends a contract only once the allowance is exceeded', () => {
    expect(contractIsLost(tower({ missed: 3 }))).toBe(false);
    expect(contractIsLost(tower({ missed: 4 }))).toBe(true);
    // Impossible allows none, so the first miss ends it.
    expect(contractIsLost(tower({ difficultyId: 'impossible', missed: 1 }))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * § 8.5 — renewal pricing
 * -------------------------------------------------------------------------- */

describe('§ 8.5’s renewal pricing', () => {
  it('moves a perfect record up two, and the design’s own worked example holds', () => {
    // "Garden Apartments goes 3 → 5 u a day after a clean month."
    const clean = tower({ day: 20, missed: 0, rate: 3 });
    const offer = renewalOffer(clean);
    expect(offer.clearRate).toBe(1);
    expect(offer.bonus).toBe(2);
    expect(offer.offered).toBe(5);
  });

  it('steps the bonus at the contract’s three thresholds', () => {
    // 19 days played; 18 cleared is 94.7%, 15 is 78.9%, 13 is 68.4%.
    expect(renewalOffer(tower({ day: 20, missed: 1, rate: 4 })).bonus).toBe(1);
    expect(renewalOffer(tower({ day: 20, missed: 4, rate: 4 })).bonus).toBe(0);
    expect(renewalOffer(tower({ day: 20, missed: 6, rate: 4 })).bonus).toBe(-1);
  });

  it('floors the offer at two units a day', () => {
    expect(renewalOffer(tower({ day: 20, missed: 9, rate: 2 })).offered).toBe(2);
  });

  it('publishes a complexity only for the buildings § 8.5 names', () => {
    expect(complexityOf('garden-apartments')).toBe(1);
    expect(complexityOf('vertical-city')).toBe(COMPLEXITY_MAX);
    // § 8.5's table names no complexity for these two, and none is invented for them.
    expect(complexityOf('secure-tower')).toBeUndefined();
    expect(complexityOf('mixed-use-high-rise')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * § 8.6 / § 8.7 — the rolling calendar
 * -------------------------------------------------------------------------- */

describe('§ 8.6’s rolling calendar', () => {
  it('slides to keep today near the right edge, and never widens', () => {
    expect(calendarFrom(4)).toBe(1);
    expect(calendarFrom(96)).toBe(73);
    for (const today of [1, 4, 24, 96, 400]) {
      expect(calendarColumns(today), String(today)).toHaveLength(CALENDAR_SPAN);
      expect(calendarColumns(today).at(-1)).toBeGreaterThanOrEqual(today);
    }
  });

  it('emits the columns and the cells from one value — § 8.7’s instruction, held both ways', () => {
    const today = 24;
    const columns = calendarColumns(today);
    const row = calendarRow(today, tower({ day: 6 }));
    expect(row).toHaveLength(columns.length);
    expect(row.map((cell) => cell.careerDay)).toEqual([...columns]);
  });

  it('staggers a row from today minus its own contract day', () => {
    const today = 24;
    const entry = tower({ day: 6 });
    expect(contractStartDay(today, entry)).toBe(19);
    expect(contractEndDay(today, entry)).toBe(19 + CONTRACT_DAYS - 1);
    const row = calendarRow(today, entry);
    /*
     * The contract runs career days 19–38 and the window shows 1–30, so twelve of its days are on
     * screen. Derived from the two ends rather than written as `12`, which is the drift § 8.7 names.
     */
    const lastVisible = row.at(-1)!.careerDay;
    const inContract = row.filter((cell) => cell.towerDay !== undefined);
    expect(inContract).toHaveLength(lastVisible - contractStartDay(today, entry) + 1);
    expect(row.find((cell) => cell.careerDay === 19)?.towerDay).toBe(1);
    expect(row.find((cell) => cell.careerDay === today)?.mark).toBe('today');
    expect(row.find((cell) => cell.careerDay === 18)?.mark).toBe('blank');
  });

  it('places the missed days at the tail of the past, the same way the purse does', () => {
    const today = 10;
    const entry = tower({ day: 6, missed: 2 });
    const row = calendarRow(today, entry);
    const past = row.filter(
      (cell) => cell.towerDay !== undefined && cell.towerDay < entry.day,
    );
    expect(past.map((cell) => cell.mark)).toEqual(['cleared', 'cleared', 'cleared', 'missed', 'missed']);
    // And the two derivations agree about how many days were cleared.
    expect(past.filter((cell) => cell.mark === 'cleared')).toHaveLength(clearedDays(entry));
  });

  it('marks works, a due decision and a flagged event over the days ahead', () => {
    const today = 10;
    const entry = tower({
      day: 6,
      carry: 100,
      bookings: [{ categoryId: 'doors', level: 2, startIdx: 7, nights: 1, units: 9 }],
    });
    const row = calendarRow(today, entry, { dueDays: [9], flaggedDays: [12] });
    const markAt = (towerDay: number): string | undefined =>
      row.find((cell) => cell.towerDay === towerDay)?.mark;
    expect(markAt(8)).toBe('works');
    expect(markAt(9)).toBe('due');
    expect(markAt(12)).toBe('flagged');
    expect(markAt(13)).toBe('ahead');
  });

  it('holds dayIndexOf to the contract’s 0-based reading', () => {
    expect(dayIndexOf(tower({ day: 1 }))).toBe(0);
    expect(dayIndexOf(tower({ day: 20 }))).toBe(19);
  });
});
