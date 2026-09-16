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

import { loadConfig, shaftPlanAreaM2 } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import {
  PriceScheduleError,
  ceilingUnitsOf,
  parsePriceSchedule,
  priceOf,
  purchaseUnits,
  shaftAreaBandOf,
  smallestPurchaseUnitsOf,
  steppedPurchaseUnits,
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

  /**
   * **Every level of a rated row, not only the top of its rate.** The review of GitHub PR #527 found
   * `rate.quantity.bands`, `rate.quantity.exponent` and a row-level `fixedUnits` beside a rate all
   * parsing with no violation, so a banded draft would have loaded clean and been charged linearly.
   * The first three values below are the reviewer's.
   */
  it('refuses a band, a curve or a fixed part inside the rate’s quantity', () => {
    const base = ratedRow(rawShipped());
    const rate = base['rate'] as RawRow;
    const quantity = rate['quantity'] as RawRow;
    const extras: RawRow = { bands: [[1, 9], [6, 5]], exponent: 2, fixedUnits: 5, curve: 'quadratic' };
    for (const [key, value] of Object.entries(extras)) {
      const row = { ...base, rate: { ...rate, quantity: { ...quantity, [key]: value } } };
      expect(() => parsePriceSchedule(rawWith(row)), key).toThrow(/linear only, no curves/i);
      expect(() => parsePriceSchedule(rawWith(row)), key).toThrow(`"${key}" in its rate's quantity`);
    }
  });

  it('refuses a fixed part, a band or any key a flat row does not define, beside a rate', () => {
    const base = ratedRow(rawShipped());
    const extras: RawRow = { fixedUnits: 5, bands: [[1, 9], [6, 5]], exponent: 2, unitsPer: 4, quantity: 3 };
    for (const [key, value] of Object.entries(extras)) {
      const row = { ...base, [key]: value };
      expect(() => parsePriceSchedule(rawWith(row)), key).toThrow(/linear only, no curves/i);
      expect(() => parsePriceSchedule(rawWith(row)), key).toThrow(`carries "${key}" beside its rate`);
    }
  });

  it('refuses a band or a curve inside the schema its rate is checked against', () => {
    const base = ratedRow(rawShipped());
    const schema = base['schema'] as RawRow;
    const extras: RawRow = { bands: [[1, 9], [6, 5]], exponent: 2 };
    for (const [key, value] of Object.entries(extras)) {
      const row = { ...base, schema: { ...schema, [key]: value } };
      expect(() => parsePriceSchedule(rawWith(row)), key).toThrow(/linear only, no curves/i);
      expect(() => parsePriceSchedule(rawWith(row)), key).toThrow(`"${key}" in the schema of its rate`);
    }
  });

  it('and parses the same row without the extra key, so the refusal is not vacuous', () => {
    expect(() => scheduleWithRate()).not.toThrow();
  });

  /**
   * **Scoped to rated rows, deliberately.** The flat parser has never refused a key it does not read,
   * and this guard does not start: it exists so a rate cannot be bent, and every shipped row is flat.
   * Whether flat rows should refuse unknown keys too is a separate change. This case records where the
   * refusal stops, so nobody reads the rule above as covering them.
   */
  it('leaves flat rows as they were: a key a flat row does not read is refused only beside a rate', () => {
    const raw = rawShipped();
    const first = raw.changes[0];
    if (first === undefined) throw new Error('the shipped schedule prices nothing');
    const flat = { ...raw, changes: [{ ...first, fixedUnits: 5 }, ...raw.changes.slice(1)] };
    expect(() => parsePriceSchedule(flat)).not.toThrow();
    expect(() => parsePriceSchedule(rawWith({ ...ratedRow(raw), fixedUnits: 5 }))).toThrow(/beside its rate/);
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

  it('prices every flat shipped row at exactly its flat figure through the one purchase function', () => {
    const schedule = shipped();
    const flat = schedule.changes.filter((change) => change.rate === undefined);
    // Every row but two. Both exceptions are asserted by id below rather than merely subtracted.
    expect(flat.length).toBe(schedule.changes.length - 2);
    for (const change of flat) {
      expect(purchaseUnits(change), change.id).toBe(change.priceUnits);
      expect(smallestPurchaseUnitsOf(change), change.id).toBe(change.priceUnits);
      expect(ceilingUnitsOf(change), change.id).toBe(change.priceUnits);
    }
  });

  /**
   * **The register that used to say *none* now names one row, and this is the case that replaced
   * it** — GitHub issue #437 stage 2, [§ D619](../../../../DECISIONS.md).
   *
   * The block this sits in used to assert that *no* shipped row carried a rate, and its docstring
   * said the commit adding the first one would replace that case with the row's own check. This is
   * that replacement. It is deliberately **by id**: a count would let a second rate row arrive
   * unexamined, and § D552's ruling — *"destination panels per floor is the first case"* — is about
   * a particular row rather than about a quantity of them.
   *
   * **A second rate row has since arrived, and it arrived through this case rather than past it** —
   * GitHub issue #429 stage 2, [§ D630](../../../../DECISIONS.md). `shaft-area` charges a new
   * hoistway for the plan area it permanently removes, in bands, and it is named here for the same
   * reason `landing-panels` is: the list is the register of every row that multiplies, and a row
   * that multiplies without appearing here is a price nobody looked at. Which is exactly what the
   * by-id discipline above bought — this row could not land quietly.
   */
  it('ships exactly two rate rows, and names both of them', () => {
    const raw = rawShipped();
    expect(raw.changes.filter((row) => 'rate' in row).map((row) => row['id'])).toEqual([
      'landing-panels',
      'shaft-area',
    ]);
  });

  it('prices that row per landing, and refuses to price it without a quantity', () => {
    const schedule = shipped();
    const panels = priceOf(schedule, 'landing-panels');
    if (panels.rate === undefined) throw new Error('landing-panels lost its rate');
    expect(panels.tier).toBe('equipment');
    expect(panels.rate.quantity.unit).toBe('landing');
    // The three readings § D552 distinguishes, on the first row that can tell them apart.
    expect(purchaseUnits(panels, 6)).toBe(panels.rate.unitsPer * 6);
    expect(smallestPurchaseUnitsOf(panels)).toBe(panels.rate.unitsPer);
    expect(ceilingUnitsOf(panels)).toBe(panels.rate.unitsPer * panels.rate.quantity.max);
    // And a quantity is never chosen for the player, which is the whole of the ruling.
    expect(() => purchaseUnits(panels)).toThrow(PriceScheduleError);
    expect(() => purchaseUnits(panels, panels.rate.quantity.max + 1)).toThrow(PriceScheduleError);
  });

  /**
   * **The ceiling is a ceiling on every building the game ships, derived rather than trusted.**
   *
   * `data/price-schedule.json`'s note says 165 is the landing count of the largest shipped
   * building. A transcribed figure goes stale the first time a taller tower lands, and then a
   * scenario's derived budget ceiling quietly stops being *above which there is nothing left to
   * buy*. So the claim is checked against `data/buildings/` through the loader, in the direction
   * that matters: the declared most is at least what the tallest building could take.
   */
  it('sells at least as many landings as the largest shipped building has', async () => {
    const schedule = shipped();
    const panels = priceOf(schedule, 'landing-panels');
    if (panels.rate === undefined) throw new Error('landing-panels lost its rate');
    const config = await loadConfig(fileURLToPath(new URL('../../../../data', import.meta.url)));
    const landings = [...config.buildingsById.values()].map((building) => building.floors.length);
    expect(landings.length).toBeGreaterThan(0);
    expect(panels.rate.quantity.max).toBeGreaterThanOrEqual(Math.max(...landings));
  });

  it('would see a second flat row turned into a rate row, so the case above is not vacuous', () => {
    const raw = rawShipped();
    const first = raw.changes[0];
    if (first === undefined) throw new Error('the shipped schedule prices nothing');
    const mutated = [{ ...first, rate: {} }, ...raw.changes.slice(1)];
    expect(mutated.filter((row) => 'rate' in row)).toHaveLength(3);
  });

  /**
   * **The area band is a quantity the building has, and its ceiling is derived from the shipped
   * set rather than trusted** — GitHub issue #429 stage 2, [§ D630](../../../../DECISIONS.md).
   *
   * `landing-panels`' own precedent one row up, and for the same reason: `data/price-schedule.json`
   * says `quantity.max` is the dearest band any shipped building reaches, and a transcribed figure
   * goes stale the first time a taller tower lands — at which point a scenario's derived budget
   * ceiling quietly stops being *above which there is nothing left to buy*, and, worse here, a
   * shaft in the new tower would be charged for a band the table does not have.
   *
   * So the claim is checked against `data/buildings/` **through the loader**, over every bank of
   * every shipped building, in both directions: the ceiling is reached by something that ships, and
   * nothing that ships reaches past it.
   */
  it('sells exactly the bands the shipped buildings reach, no more and no fewer', async () => {
    const schedule = shipped();
    const area = priceOf(schedule, 'shaft-area');
    if (area.rate === undefined) throw new Error('shaft-area lost its rate');
    const config = await loadConfig(fileURLToPath(new URL('../../../../data', import.meta.url)));
    const table = config.elevatorSpecs.shaftFootprint;
    if (table === undefined) throw new Error('the shipped specs declare no shaftFootprint');
    const bands = [...config.buildingsById.values()].flatMap((building) =>
      building.banks.flatMap((bank) => {
        const areaM2 = shaftPlanAreaM2(bank, building.floors, table);
        return areaM2 === undefined ? [] : [shaftAreaBandOf(schedule, areaM2)];
      }),
    );
    expect(bands.length).toBeGreaterThan(0);
    expect(Math.max(...bands)).toBe(area.rate.quantity.max);
    expect(Math.min(...bands)).toBe(area.rate.quantity.min);
  });

  /**
   * **Move the building and require the price to change** — `CLAUDE.md`'s standing requirement,
   * in the only form a price can take it, GitHub issue #429 stage 2 and [§ D630](../../../../DECISIONS.md).
   *
   * A price is not a leg, so this cannot be compared on one. What it *can* be compared on is the
   * thing the ruling is about: **the same purchase in two real buildings must not cost the same**,
   * and the difference must come out of the loader rather than out of a constant. So the cheapest
   * and the dearest shaft in the shipped set are both resolved end to end — real `data/buildings/`,
   * real footprint table, real band table, real rate — and the two prices are required to differ in
   * the direction the ruling names.
   *
   * § D601 § 9's shape: the quantity moves, and here the quantity moving is what moves the price.
   */
  it('charges a small building’s shaft less than a supertall’s, resolved from data/buildings/', async () => {
    const schedule = shipped();
    const config = await loadConfig(fileURLToPath(new URL('../../../../data', import.meta.url)));
    const table = config.elevatorSpecs.shaftFootprint;
    if (table === undefined) throw new Error('the shipped specs declare no shaftFootprint');
    const priceIn = (buildingId: string, bankId: string): number => {
      const building = config.buildingsById.get(buildingId);
      const bank = building?.banks.find((candidate) => candidate.id === bankId);
      if (building === undefined || bank === undefined) throw new Error(`${buildingId}/${bankId}`);
      const areaM2 = shaftPlanAreaM2(bank, building.floors, table);
      if (areaM2 === undefined) throw new Error(`${buildingId}/${bankId} resolves no area`);
      const band = shaftAreaBandOf(schedule, areaM2);
      return (
        purchaseUnits(priceOf(schedule, 'new-car')) +
        (band === 0 ? 0 : purchaseUnits(priceOf(schedule, 'shaft-area'), band))
      );
    };
    /* The two ends of the measured distribution: 24.0 m² against 1 178.0 m², a 49× spread. */
    const smallest = priceIn('ashgate', 'carpark');
    const dearest = priceIn('burj-class-reference', 'shuttle');
    expect(smallest).toBeLessThan(dearest);
    /* The cheapest band charges nothing, so a small building keeps the figure four lists agreed. */
    expect(smallest).toBe(purchaseUnits(priceOf(schedule, 'new-car')));
    /*
     * And the compression is the point: the 49× area spread is a single-figure price spread, well
     * short of the 280 u a flat rate per m² produced (§ D601 § 5). Stated as a bound rather than as
     * the figure itself, so moving the ladder does not have to move this test — what may not move
     * is that the dearest shaft stays inside the schedule's own dearest-row neighbourhood.
     */
    expect(dearest - smallest).toBeLessThan(
      purchaseUnits(priceOf(schedule, 'fifth-car')),
    );
    /* A middling tower sits strictly between the two, so the ladder is a ladder and not a switch. */
    expect(priceIn('midtown-office', 'main')).toBeGreaterThan(smallest);
    expect(priceIn('midtown-office', 'main')).toBeLessThan(dearest);
  });
});

/* -------------------------------------------------------------------------- *
 * A stepped control asks the schedule — GitHub issue #528, § D560
 * -------------------------------------------------------------------------- */

/**
 * **{@link steppedPurchaseUnits} is where a step count meets a price**, and it exists because the
 * fix-it editor was doing that arithmetic in `fixit/engine.ts#spendOf`, where the schedule could
 * neither see it nor change it (GitHub issue **#528**, [§ D560](../../../../DECISIONS.md)).
 *
 * The flat arm is § D552's own refusal kept deliberately: a multiplier on a row that declares no
 * rate. It is kept because withdrawing it moves a shipped price, and it is moved here because one
 * visible multiplier is worth more than an invisible one. The rated arm is the point — the day
 * either stepped row is given a `rate`, the data decides and no code changes.
 */
describe('a stepped control is priced here rather than by its screen — #528', () => {
  it('charges a flat row its own price once per step, and nothing for no steps', () => {
    const flat = priceOf(scheduleWithRate(), 'faster-machines');
    expect(flat.rate).toBeUndefined();
    expect(steppedPurchaseUnits(flat, 0)).toBe(0);
    expect(steppedPurchaseUnits(flat, 1)).toBe(flat.priceUnits);
    expect(steppedPurchaseUnits(flat, 4)).toBe(4 * (flat.priceUnits ?? 0));
  });

  it('charges a rated row through its rate, so the same control is priced by the data alone', () => {
    const row = rated(scheduleWithRate());
    const rate = row.rate?.unitsPer ?? Number.NaN;
    for (const steps of [0, 1, 5, QUANTITY_MAX]) {
      expect(steppedPurchaseUnits(row, steps), String(steps)).toBe(purchaseUnits(row, steps));
      expect(steppedPurchaseUnits(row, steps), String(steps)).toBe(steps * rate);
    }
  });

  it('refuses a step count that is not a whole number of steps, or is negative', () => {
    const flat = priceOf(scheduleWithRate(), 'faster-machines');
    for (const steps of [-1, 1.5, Number.NaN]) {
      expect(() => steppedPurchaseUnits(flat, steps), String(steps)).toThrow(PriceScheduleError);
      expect(() => steppedPurchaseUnits(flat, steps), String(steps)).toThrow(/#528/);
    }
  });

  /**
   * **The gap this seam leaves, pinned rather than left to be found.** A rated row declares a most;
   * a stepper has no ceiling but the budget. So a player who steps past the declared most makes this
   * throw, and the screen has nothing to refuse with. Nothing reaches it today — no shipped row is
   * rated — and the row that changes that is GitHub issue #437's per-landing panels, whose lane owes
   * the stepper a ceiling. Held here so the throw is a decision rather than a surprise.
   */
  it('throws past a rated row’s declared most, which is the ceiling a stepper still owes — #437', () => {
    const row = rated(scheduleWithRate());
    expect(steppedPurchaseUnits(row, QUANTITY_MAX)).toBeGreaterThan(0);
    expect(() => steppedPurchaseUnits(row, QUANTITY_MAX + 1)).toThrow(PriceScheduleError);
    expect(() => steppedPurchaseUnits(row, QUANTITY_MAX + 1)).toThrow(/sells 0–12 panel/);
  });
});
