/**
 * **The shipped price schedule, and the rules it has to keep** — GitHub issue **#366**.
 *
 * Two jobs, and the second is the one that makes the first mean anything: assert the shipped
 * `data/price-schedule.json` is a usable schedule, and assert the validator would notice if it
 * were not. A parser nobody has watched refuse is a parser nobody knows works, which is why every
 * rule below has a positive control beside it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parsePriceSchedule, priceOf, violationsIn, PriceScheduleError } from './parse.js';
import type { PriceSchedule } from './types.js';

const SCHEDULE_PATH = fileURLToPath(new URL('../../../../data/price-schedule.json', import.meta.url));

function shipped(): PriceSchedule {
  return parsePriceSchedule(JSON.parse(readFileSync(SCHEDULE_PATH, 'utf8')));
}

describe('data/price-schedule.json — issue #366', () => {
  it('parses, and prices something in every tier', () => {
    const schedule = shipped();
    expect(schedule.tiers.length).toBe(3);
    expect(schedule.changes.length).toBeGreaterThan(10);
    for (const tier of schedule.tiers) {
      expect(
        schedule.changes.some((change) => change.tier === tier.id),
        `tier "${tier.id}" prices nothing`,
      ).toBe(true);
    }
  });

  /**
   * **The ladder, re-derived rather than read.** `docs/38` § 2.1 orders the three tiers cheap,
   * dearer, dearest, and #366's first criterion asks for that ordering *as data rather than as an
   * `if` on a tier name*. `PriceTier.typicalUnits` is the median of the tier's own prices, so the
   * ordering cannot be asserted independently of the prices it describes — a tier cannot claim to
   * be dear while pricing nothing dearly.
   */
  it('orders the three tiers by their own median price, ascending', () => {
    const schedule = shipped();
    const byOrder = [...schedule.tiers].sort((a, b) => a.order - b.order);
    expect(byOrder.map((tier) => tier.id)).toEqual(['dispatcher', 'equipment', 'building']);

    const typicals = byOrder.map((tier) => tier.typicalUnits);
    expect(typicals).toEqual([...typicals].sort((a, b) => a - b));
    expect(new Set(typicals).size).toBe(typicals.length);

    for (const tier of schedule.tiers) {
      const prices = schedule.changes
        .filter((change) => change.tier === tier.id)
        .map((change) => change.priceUnits)
        .sort((a, b) => a - b);
      expect(tier.typicalUnits, `tier ${tier.id}`).toBe(prices[Math.floor(prices.length / 2)]);
    }
  });

  /**
   * **The bands overlap, and that is asserted rather than tolerated.**
   *
   * It would be easy to read the ladder as *every building change outprices every dispatcher one*
   * and to write a test saying so. It is not true and must not become true by accident: a rezoned
   * bank is building-tier at 6 units and full destination dispatch is equipment-tier at 24. #366's
   * words are *cheap*, *dearer*, *dearest* — a claim about typical cost, not a total order over
   * changes. Asserting the overlap keeps the next reader from tightening the rule above into one
   * the design never asked for.
   */
  it('lets a dear change in a cheap tier outprice a cheap one in a dear tier', () => {
    const schedule = shipped();
    const priceIn = (tierId: string): readonly number[] =>
      schedule.changes.filter((change) => change.tier === tierId).map((change) => change.priceUnits);
    const equipment = priceIn('equipment');
    const building = priceIn('building');
    expect(Math.max(...equipment)).toBeGreaterThan(Math.min(...building));
  });

  /**
   * **The figure four shipped lists already agreed on**, kept rather than re-chosen.
   *
   * Every one of the eighteen fix cases' new-shaft repair, `fixit/parse.ts#NEW_SHAFT_UNITS`,
   * `fixit/engine.ts#EDITOR_PRICING.shaftUnits` and the campaign shop's first Shafts tier all said
   * 34 units, independently. That unanimity is the strongest evidence in the tree that the ladder
   * is discoverable rather than invented, and it is why this row's note says *moved*, not
   * *drafted*.
   */
  it('prices a new car at the 34 units four lists already agreed on', () => {
    expect(priceOf(shipped(), 'new-car').priceUnits).toBe(34);
  });

  /**
   * **Nights are on the schedule, not beside it** — #366's fourth criterion.
   *
   * *"A fourth car costs the same units in Scenario and in Career and a career day costs time as
   * well."* One row carries both, so the two products cannot drift: Scenario reads the units and
   * ignores the nights, Career reads both.
   */
  it('carries nights beside units, and books none for a change a controller can just be told', () => {
    const schedule = shipped();
    expect(priceOf(schedule, 'new-car').nights).toBeGreaterThan(0);
    for (const change of schedule.changes.filter((c) => c.tier === 'dispatcher')) {
      expect(change.nights, `${change.id} books nights for a setting`).toBe(0);
    }
  });

  /**
   * **Every figure says where it came from.** A price is game feel — seventeen fix repairs buy the
   * same door-dwell settings at 1, 2 or 3 units — so a schedule that published bare numbers would
   * read as measured when it is drafted. #366 says the ordering is the owner's; this is how the
   * file stays honest about which numbers are theirs to move.
   */
  it('gives every change a note saying whether its figure was kept or drafted', () => {
    for (const change of shipped().changes) {
      expect(change.note.trim().length, `${change.id} has no provenance`).toBeGreaterThan(30);
    }
  });

  it('refuses a change nothing prices, rather than defaulting to zero', () => {
    expect(() => priceOf(shipped(), 'a-change-nobody-priced')).toThrow(PriceScheduleError);
  });
});

/* -------------------------------------------------------------------------- *
 * The positive controls — a validator nobody has watched fail is not a validator
 * -------------------------------------------------------------------------- */

describe('the schedule validator refuses what it claims to refuse', () => {
  const broken = (mutate: (schedule: PriceSchedule) => PriceSchedule): readonly string[] =>
    violationsIn(mutate(shipped()));

  it('finds nothing wrong with the shipped schedule', () => {
    expect(violationsIn(shipped())).toEqual([]);
  });

  it('catches two changes pricing the same field', () => {
    const found = broken((schedule) => {
      const [first, second, ...rest] = schedule.changes;
      if (first === undefined || second === undefined) throw new Error('fixture');
      return {
        ...schedule,
        changes: [first, { ...second, covers: [...second.covers, ...first.covers] }, ...rest],
      };
    });
    expect(found.some((line) => line.includes('is priced by both'))).toBe(true);
  });

  it('catches a tier whose typical is not its own median', () => {
    const found = broken((schedule) => ({
      ...schedule,
      tiers: schedule.tiers.map((tier) =>
        tier.id === 'dispatcher' ? { ...tier, typicalUnits: tier.typicalUnits + 7 } : tier,
      ),
    }));
    expect(found.some((line) => line.includes('The typical is derived'))).toBe(true);
  });

  it('catches a ladder that stops ascending', () => {
    const found = broken((schedule) => ({
      ...schedule,
      /* Swap the orders, leaving the typicals where they are. */
      tiers: schedule.tiers.map((tier) =>
        tier.id === 'building' ? { ...tier, order: 0 } : tier,
      ),
    }));
    expect(found.some((line) => line.includes('does not ascend'))).toBe(true);
  });

  it('catches a price outside its own declared range', () => {
    const found = broken((schedule) => {
      const [first, ...rest] = schedule.changes;
      if (first === undefined) throw new Error('fixture');
      return {
        ...schedule,
        changes: [{ ...first, priceUnits: first.schema.max + 1 }, ...rest],
      };
    });
    expect(found.some((line) => line.includes('invariant 8'))).toBe(true);
  });

  it('catches a change naming a tier that is not on the ladder', () => {
    const found = broken((schedule) => {
      const [first, ...rest] = schedule.changes;
      if (first === undefined) throw new Error('fixture');
      return { ...schedule, changes: [{ ...first, tier: 'gold-plated' }, ...rest] };
    });
    expect(found.some((line) => line.includes('not in the ladder'))).toBe(true);
  });

  it('catches a duplicate change id', () => {
    const found = broken((schedule) => {
      const [first, ...rest] = schedule.changes;
      if (first === undefined) throw new Error('fixture');
      return { ...schedule, changes: [first, { ...first }, ...rest] };
    });
    expect(found.some((line) => line.includes('is declared twice'))).toBe(true);
  });
});
