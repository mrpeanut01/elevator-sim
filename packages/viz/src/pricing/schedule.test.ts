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

  /**
   * **A group prices every path under it, so a leaf beneath another row's group is a second
   * price.** GitHub issue #467 added group covers — `dispatcher.eligibility` and
   * `dispatcher.constraints` on `dispatch-rules`, among others — and until the review of GitHub PR
   * #506 the check matched exact paths only, so a row pricing one eligibility filter under that
   * group passed it. Tried with the leaf on the row just before the group's and on the row just
   * after it, because the check walks rows in order.
   */
  it('catches a row covering a leaf under another row’s group cover, on either side of it', () => {
    const group = 'dispatcher.eligibility';
    const leaf = `${group}.enRouteDiversion`;
    const schedule = shipped();
    const at = schedule.changes.findIndex((change) => change.covers.includes(group));
    const sides = [at - 1, at + 1].filter((index) => index >= 0 && index < schedule.changes.length);
    expect(at, `no row covers ${group} as a group`).toBeGreaterThanOrEqual(0);
    expect(sides, 'the group row has a row on each side of it').toHaveLength(2);
    for (const index of sides) {
      const found = violationsIn({
        ...schedule,
        changes: schedule.changes.map((change, i) =>
          i === index ? { ...change, covers: [...change.covers, leaf] } : change,
        ),
      });
      expect(
        found.filter((line) => line.includes('is priced by both') && line.includes(leaf)),
        `${leaf} added to ${String(schedule.changes[index]?.id)}`,
      ).toHaveLength(1);
    }
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

/* -------------------------------------------------------------------------- *
 * What no scenario sells — GitHub issue #467, § D535
 * -------------------------------------------------------------------------- */

/**
 * **Not for sale is declared beside what is, and it is a different answer from priced high.**
 *
 * Issue #467's own sentence: *"not purchasable and priced high are different answers, and the
 * register does not currently distinguish them."* The product owner's ruling of 2026-09-10 gave two
 * families the first answer, and `data/price-schedule.json`'s `withheld` block is where it is
 * written — one place, read by every scenario's editable-set resolution rather than restated beside
 * each. So the rules below are the schedule's own rules pointed at that block: a path may not be
 * both withheld and priced, a withheld entry may not carry a price, and the block may not be
 * silently absent.
 */
describe('what no scenario sells is declared beside what one does — #467, § D535', () => {
  const rawShipped = (): Record<string, unknown> =>
    JSON.parse(readFileSync(SCHEDULE_PATH, 'utf8')) as Record<string, unknown>;
  const broken = (mutate: (schedule: PriceSchedule) => PriceSchedule): readonly string[] =>
    violationsIn(mutate(shipped()));

  it('ships a withheld block whose every entry covers something and names whose ruling it is', () => {
    const { withheld } = shipped();
    expect(withheld.length).toBeGreaterThan(0);
    for (const entry of withheld) {
      expect(entry.covers.length, `${entry.id} withholds nothing`).toBeGreaterThan(0);
      expect(entry.note, `${entry.id} names no ruling`).toMatch(/product owner/i);
    }
  });

  it('catches a path that is both withheld and priced', () => {
    const found = broken((schedule) => {
      const [first, ...rest] = schedule.withheld;
      const priced = schedule.changes[0]?.covers[0];
      if (first === undefined || priced === undefined) throw new Error('fixture');
      return { ...schedule, withheld: [{ ...first, covers: [...first.covers, priced] }, ...rest] };
    });
    expect(found.some((line) => line.includes('both withheld and priced'))).toBe(true);
  });

  it('catches a withheld group that swallows a priced path by its prefix', () => {
    const found = broken((schedule) => {
      const priced = schedule.changes.find((change) =>
        change.covers.some((path) => path.split('.').length > 2),
      );
      const path = priced?.covers.find((entry) => entry.split('.').length > 2);
      if (path === undefined) throw new Error('fixture');
      const group = path.split('.').slice(0, 2).join('.');
      return {
        ...schedule,
        withheld: [...schedule.withheld, { id: 'too-wide', note: 'x'.repeat(40), covers: [group] }],
      };
    });
    expect(found.some((line) => line.includes('both withheld and priced'))).toBe(true);
  });

  it('catches a withheld entry that says nothing about why', () => {
    const found = broken((schedule) => {
      const [first, ...rest] = schedule.withheld;
      if (first === undefined) throw new Error('fixture');
      return { ...schedule, withheld: [{ ...first, note: ' ' }, ...rest] };
    });
    expect(found.some((line) => line.includes('says nothing about why'))).toBe(true);
  });

  it('catches a withheld id that is also a priced change id', () => {
    const found = broken((schedule) => {
      const [first, ...rest] = schedule.withheld;
      const change = schedule.changes[0];
      if (first === undefined || change === undefined) throw new Error('fixture');
      return { ...schedule, withheld: [{ ...first, id: change.id }, ...rest] };
    });
    expect(found.some((line) => line.includes('is both a priced change and a withheld one'))).toBe(
      true,
    );
  });

  it('refuses a withheld entry that carries a price, because not for sale is not priced high', () => {
    const raw = rawShipped();
    const [first] = raw['withheld'] as Record<string, unknown>[];
    if (first === undefined) throw new Error('fixture');
    first['priceUnits'] = 99;
    expect(() => parsePriceSchedule(raw)).toThrow(/not for sale is a different answer from priced high/);
  });

  it('refuses a document with no withheld block, rather than reading it as nothing withheld', () => {
    const raw = rawShipped();
    delete raw['withheld'];
    expect(() => parsePriceSchedule(raw)).toThrow(/withheld/);
  });

  /**
   * **Every row #467 priced says it is a proposal, field by field.** The standing `data/` ruling of
   * 2026-09-08 asks that a governed figure say which half is measured and which is chosen, and the
   * rows this issue drafted have no shipped list to have been kept from — so each note must carry
   * both words, and the provenance label, rather than one sentence for the lot.
   */
  it('marks every row #467 priced as an agent’s proposal, with what was measured and what was chosen', () => {
    const drafted = shipped().changes.filter((change) => change.note.includes('#467'));
    expect(drafted.length, 'no row cites #467').toBeGreaterThan(0);
    for (const change of drafted) {
      expect(change.note, change.id).toContain("AGENT'S PROPOSAL");
      expect(change.note, change.id).toContain('MEASURED:');
      expect(change.note, change.id).toContain('CHOSEN:');
    }
  });
});
