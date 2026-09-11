/**
 * **A row may carry one rate, multiplied by a quantity the player chooses** — GitHub issue **#478**,
 * [§ D552](../../../../DECISIONS.md).
 *
 * The product owner's ruling of 2026-09-10, verbatim: *"Linear rate × quantity. A price-schedule row
 * may carry one data-declared per-unit rate, multiplied by a quantity the player chooses —
 * destination panels per floor is the first case. Linear only, no curves. Rows without a rate stay
 * flat, so every existing price is unchanged."*
 *
 * Each sentence of that ruling is a block below, and every refusal has its positive control beside
 * it — `schedule.test.ts`'s rule, pointed at the new shape: a validator nobody has watched refuse is
 * a validator nobody knows works.
 *
 * ## The fixture row is not a figure anybody is asked to approve
 *
 * {@link ratedRow} is a test row covering a path nothing reads. Its rate is **the shipped equipment
 * tier's own typical**, read off the file rather than chosen, for one arithmetic reason: adding a
 * value equal to a median leaves the upper-middle median where it was, so the fixture cannot trip
 * the typical-is-derived rule and a schedule that gains or loses a row on another branch cannot
 * make this file fail for a reason that has nothing to do with rates. The first rate row that
 * ships is GitHub issue #437's, and its figures are that change's to draft.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  PriceScheduleError,
  ceilingUnitsOf,
  parsePriceSchedule,
  priceOf,
  purchaseUnits,
  smallestPurchaseUnitsOf,
  violationsIn,
} from './parse.js';
import { changesAtPaths, repairPriceUnits } from './repairPrice.js';
import type { PriceSchedule, PricedChange } from './types.js';

const SCHEDULE_PATH = fileURLToPath(new URL('../../../../data/price-schedule.json', import.meta.url));

type RawRow = Record<string, unknown>;
interface RawSchedule extends Record<string, unknown> {
  readonly tiers: readonly RawRow[];
  readonly changes: readonly RawRow[];
}

function rawShipped(): RawSchedule {
  return JSON.parse(readFileSync(SCHEDULE_PATH, 'utf8')) as RawSchedule;
}

/** The typical the shipped file declares for a tier — read, never chosen. */
function typicalOf(raw: RawSchedule, tierId: string): number {
  const tier = raw.tiers.find((entry) => entry['id'] === tierId);
  if (tier === undefined) throw new Error(`the shipped ladder has no "${tierId}" tier`);
  return tier['typicalUnits'] as number;
}

const QUANTITY_MAX = 12;
const RATED_ID = 'metered-fitting-fixture';
const RATED_PATH = 'fixture.rated.path';

/** A rate row on the equipment tier, at that tier's own typical per unit. Ships nowhere. */
function ratedRow(raw: RawSchedule, overrides: RawRow = {}): RawRow {
  const rate = typicalOf(raw, 'equipment');
  return {
    id: RATED_ID,
    tier: 'equipment',
    name: 'A metered fitting',
    nights: 1,
    note: 'A fixture for GitHub issue #478. It covers a path nothing reads and ships nowhere.',
    covers: [RATED_PATH],
    rate: {
      unitsPer: rate,
      quantity: { type: 'integer', unit: 'panel', min: 0, max: QUANTITY_MAX, default: 0 },
    },
    schema: { type: 'integer', unit: 'units', min: 0, max: rate * 2, default: rate },
    ...overrides,
  };
}

/** The shipped document with one more row, still raw — for a case that must break the file. */
function rawWith(row: RawRow): RawSchedule {
  const raw = rawShipped();
  return { ...raw, changes: [...raw.changes, row] };
}

/** The shipped schedule plus the fixture rate row, parsed. */
function scheduleWithRate(overrides: RawRow = {}): PriceSchedule {
  const raw = rawShipped();
  return parsePriceSchedule(rawWith(ratedRow(raw, overrides)));
}

function rated(schedule: PriceSchedule): PricedChange {
  return priceOf(schedule, RATED_ID);
}

/* -------------------------------------------------------------------------- *
 * "A price-schedule row may carry one data-declared per-unit rate, multiplied by a quantity"
 * -------------------------------------------------------------------------- */

describe('a row may carry one rate, multiplied by a quantity the player chooses — #478', () => {
  it('parses a rate row, and prices a purchase at the rate times the quantity', () => {
    const schedule = scheduleWithRate();
    const row = rated(schedule);
    const rate = typicalOf(rawShipped(), 'equipment');
    expect(row.rate?.unitsPer).toBe(rate);
    expect(row.rate?.quantity.unit).toBe('panel');
    expect(purchaseUnits(row, 0)).toBe(0);
    expect(purchaseUnits(row, 1)).toBe(rate);
    expect(purchaseUnits(row, 5)).toBe(5 * rate);
    expect(purchaseUnits(row, QUANTITY_MAX)).toBe(QUANTITY_MAX * rate);
  });

  it('is linear: every further unit adds exactly the rate, from none to the declared most', () => {
    const row = rated(scheduleWithRate());
    const rate = row.rate?.unitsPer ?? Number.NaN;
    for (let quantity = 0; quantity < QUANTITY_MAX; quantity += 1) {
      expect(purchaseUnits(row, quantity + 1) - purchaseUnits(row, quantity), `step ${String(quantity)}`).toBe(
        rate,
      );
    }
  });

  it('refuses a quantity outside the declared range, or one that is not a whole number', () => {
    const row = rated(scheduleWithRate());
    for (const quantity of [-1, QUANTITY_MAX + 1, 1.5, Number.NaN]) {
      expect(() => purchaseUnits(row, quantity), String(quantity)).toThrow(PriceScheduleError);
    }
  });

  /**
   * **The refusal that makes the rate safe to add.** Every path that priced a change before this
   * issue summed a flat figure and had no quantity to give. A rate row reached through one of them
   * must fail loudly rather than be charged for one unit, because charging one unit is choosing a
   * quantity for the player — the private multiplier #478 exists to prevent, arrived at by default.
   */
  it('refuses a rate row bought without a quantity, rather than charging one unit', () => {
    const row = rated(scheduleWithRate());
    expect(() => purchaseUnits(row)).toThrow(PriceScheduleError);
    expect(() => purchaseUnits(row)).toThrow(/per panel/);
    expect(() => purchaseUnits(row)).toThrow(/#478/);
  });

  it('refuses the same thing through a repair patch, which has no quantity to give', () => {
    const schedule = scheduleWithRate({ covers: ['dispatcher.fixture.meter'] });
    const patch = { dispatcher: { fixture: { meter: 3 } } };
    expect(changesAtPaths(schedule, ['dispatcher.fixture.meter']).map((c) => c.id)).toEqual([RATED_ID]);
    expect(() => repairPriceUnits(schedule, patch)).toThrow(/#478/);
  });

  it('refuses a quantity on a flat row, rather than inventing a multiplier the row does not declare', () => {
    const schedule = scheduleWithRate();
    const flat = priceOf(schedule, 'new-car');
    expect(purchaseUnits(flat)).toBe(flat.priceUnits);
    expect(() => purchaseUnits(flat, 2)).toThrow(PriceScheduleError);
  });
});

/* -------------------------------------------------------------------------- *
 * "Linear only, no curves."
 * -------------------------------------------------------------------------- */

describe('linear only, no curves', () => {
  it('refuses a rate carrying anything but the one rate and its quantity', () => {
    const raw = rawShipped();
    const base = ratedRow(raw);
    for (const extra of ['bands', 'curve', 'fixedUnits', 'exponent']) {
      const row = { ...base, rate: { ...(base['rate'] as RawRow), [extra]: 1 } };
      expect(() => parsePriceSchedule(rawWith(row)), extra).toThrow(/linear only, no curves/i);
    }
  });

  it('and parses the same row without the extra key, so the refusal is not vacuous', () => {
    expect(() => scheduleWithRate()).not.toThrow();
  });

  it('refuses a row carrying both a flat price and a rate', () => {
    const raw = rawShipped();
    const row = { ...ratedRow(raw), priceUnits: 4 };
    expect(() => parsePriceSchedule(rawWith(row))).toThrow(/both a flat price and a rate/);
  });

  it('refuses a rate of zero, which is a free flat row wearing a multiplier', () => {
    const schedule = scheduleWithRate();
    const found = violationsIn({
      ...schedule,
      changes: schedule.changes.map((change) =>
        change.rate === undefined ? change : { ...change, rate: { ...change.rate, unitsPer: 0 } },
      ),
    });
    expect(found.join('\n')).toMatch(/rate of 0/);
  });
});

/* -------------------------------------------------------------------------- *
 * CLAUDE.md invariant 8 — the rate and the quantity each declare type, range and default
 * -------------------------------------------------------------------------- */

describe('the rate and its quantity each declare a schema — CLAUDE.md invariant 8', () => {
  const brokenRate = (mutate: (change: PricedChange) => PricedChange): readonly string[] => {
    const schedule = scheduleWithRate();
    return violationsIn({
      ...schedule,
      changes: schedule.changes.map((change) => (change.id === RATED_ID ? mutate(change) : change)),
    });
  };

  it('finds nothing wrong with a well-formed rate row', () => {
    expect(violationsIn(scheduleWithRate())).toEqual([]);
  });

  it('refuses a rate outside its own declared range, and a default that is not the rate', () => {
    const outside = brokenRate((change) => ({
      ...change,
      schema: { ...change.schema, max: (change.rate?.unitsPer ?? 0) - 1 },
    }));
    expect(outside.join('\n')).toMatch(/invariant 8/);
    const second = brokenRate((change) => ({
      ...change,
      schema: { ...change.schema, default: change.schema.default + 1 },
    }));
    expect(second.join('\n')).toMatch(/not a second opinion/);
  });

  it('refuses a quantity whose floor or default is not none, or whose ceiling buys nothing', () => {
    const quantity = (patch: Record<string, number>) =>
      brokenRate((change) =>
        change.rate === undefined
          ? change
          : { ...change, rate: { ...change.rate, quantity: { ...change.rate.quantity, ...patch } } },
      ).join('\n');
    expect(quantity({ min: 1 })).toMatch(/none bought/);
    expect(quantity({ default: 2 })).toMatch(/none bought/);
    expect(quantity({ max: 0 })).toMatch(/buys nothing/);
  });
});

/* -------------------------------------------------------------------------- *
 * "Rows without a rate stay flat, so every existing price is unchanged."
 * -------------------------------------------------------------------------- */

describe('rows without a rate stay flat, so every existing price is unchanged', () => {
  const shipped = (): PriceSchedule => parsePriceSchedule(rawShipped());

  it('prices every shipped row at exactly its flat figure through the one purchase function', () => {
    const schedule = shipped();
    expect(schedule.changes.length).toBeGreaterThan(0);
    for (const change of schedule.changes) {
      expect(change.rate, change.id).toBeUndefined();
      expect(purchaseUnits(change), change.id).toBe(change.priceUnits);
      expect(smallestPurchaseUnitsOf(change), change.id).toBe(change.priceUnits);
      expect(ceilingUnitsOf(change), change.id).toBe(change.priceUnits);
    }
  });

  /**
   * **A register with one entry — none — and the next change is the one that empties it.** The
   * ruling names destination panels per floor as the first case, and that is GitHub issue #437: a
   * core model change this seam does not make. So no shipped row carries a rate yet, and a rate row
   * that arrives without #437's quantity would be a price on a control nobody can size. The commit
   * that adds the first one replaces this case with that row's own *reaches the run* test.
   */
  it('ships no rate row yet — the first is GitHub issue #437’s', () => {
    const raw = rawShipped();
    expect(raw.changes.filter((row) => 'rate' in row).map((row) => row['id'])).toEqual([]);
  });

  it('would see a flat row turned into a rate row, so the case above is not vacuous', () => {
    const raw = rawShipped();
    const first = raw.changes[0];
    if (first === undefined) throw new Error('the shipped schedule prices nothing');
    const mutated = [{ ...first, rate: {} }, ...raw.changes.slice(1)];
    expect(mutated.filter((row) => 'rate' in row)).toHaveLength(1);
  });
});
