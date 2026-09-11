/**
 * Reading `data/price-schedule.json`, and refusing the ways it can be wrong.
 *
 * `fixit/parse.ts`'s precedent, and its shape: authored data is validated **at load time**, every
 * violation is collected rather than the first thrown, and the rules a test would otherwise hold in
 * prose are mechanical here. See `pricing/types.ts` for what this file is and why it exists.
 *
 * The rules, and each is one #366 asks for:
 *
 * - **Ids are unique**, in all three lists. A duplicate is two prices for one change wearing one
 *   name, which is the defect the schedule exists to end.
 * - **Every change names a tier that exists.** Nothing downstream may invent one, so nothing
 *   downstream needs an `if` on a tier name — #366's first criterion.
 * - **Every tier's `typicalUnits` is the median of its own prices**, re-derived here rather than
 *   trusted. A tier that claimed to be dear while pricing nothing dearly would make the ladder a
 *   caption instead of a fact.
 * - **The typicals ascend with `order`**, strictly. That is the ladder, checked.
 * - **Every price sits inside its own declared schema**, which is what invariant 8's range is for.
 * - **No change covers a path another change also covers** — exactly, or through a group. Two rows
 *   claiming one field is the same defect as two prices, arrived at from the other side, and it is
 *   the check that would have caught the speed conflict this file was written to end. A group
 *   prices every path under it, so the match is {@link pathsOverlap}, the one the `withheld` block
 *   uses: GitHub issue #467 added group covers, and until the review of GitHub PR #506 this matched
 *   exact paths only, so a row covering one leaf under another row's group passed it.
 *
 * And four for the `withheld` block GitHub issue **#467** added ([§ D535](../../../../DECISIONS.md)),
 * each the rule above pointed at what no scenario sells:
 *
 * - **A path is withheld or priced, never both** — exactly, or through a group that holds the
 *   other. A dial sold at one price and at none is two answers to one question.
 * - **A withheld entry carries no price, no tier and no nights.** Not for sale is a different answer
 *   from priced high, so a field for one does not exist to be authored; an unknown key is refused
 *   rather than ignored.
 * - **Every withheld entry says why**, and covers something.
 * - **The block is required.** An absent one is refused rather than read as *nothing withheld*,
 *   because a file nobody finished and a file that withholds nothing must not look alike.
 *
 * And three for a row priced per unit — GitHub issue **#478**, [§ D552](../../../../DECISIONS.md):
 *
 * - **A row is flat or rated, never both**, and a rate carries one per-unit figure and its quantity
 *   and nothing else. *Linear only, no curves* is the owner's ruling, so a key that would bend the
 *   line is refused rather than ignored.
 * - **The rate sits inside the row's own schema**, as a flat price does, and a rate of zero or less is
 *   refused: a row that charges nothing per unit is a free flat row wearing a multiplier.
 * - **The quantity declares its own schema, from none.** Its floor and default are 0 — an unset
 *   quantity is the building as it is — and its ceiling buys at least one.
 */

import {
  type PriceRate,
  type PriceSchedule,
  type PriceSchema,
  type PricedChange,
  type PricedExtra,
  type PriceTier,
  type WithheldChange,
} from './types.js';

/** Raised when the document cannot be read as a schedule at all. */
export class PriceScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PriceScheduleError';
  }
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PriceScheduleError(`${where}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PriceScheduleError(`${where}: expected a non-empty string.`);
  }
  return value;
}

function int(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new PriceScheduleError(`${where}: expected a whole number.`);
  }
  return value;
}

function list(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new PriceScheduleError(`${where}: expected an array.`);
  return value;
}

/** Every key a withheld entry may carry — and none of them is a price. */
const WITHHELD_KEYS: readonly string[] = ['id', 'note', 'covers'];

/** Every key a rate may carry — one per-unit figure and its quantity, and nothing that bends the line. */
const RATE_KEYS: readonly string[] = ['unitsPer', 'quantity'];

/** Whether two config paths name the same field, or one is a dotted group holding the other. */
function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

/** The median of a sorted-in-place copy — the upper of the two middles on an even count. */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function parseSchema(raw: unknown, where: string): PriceSchema {
  const entry = record(raw, where);
  const type = str(entry['type'], `${where}.type`);
  const unit = str(entry['unit'], `${where}.unit`);
  if (type !== 'integer') throw new PriceScheduleError(`${where}.type: only "integer" is priced.`);
  if (unit !== 'units') throw new PriceScheduleError(`${where}.unit: only "units" is priced.`);
  return {
    type: 'integer',
    unit: 'units',
    min: int(entry['min'], `${where}.min`),
    max: int(entry['max'], `${where}.max`),
    default: int(entry['default'], `${where}.default`),
  };
}

/** A row's rate, with any key beyond the two a line needs reported into `shape` (#478, § D552). */
function parseRate(raw: unknown, where: string, id: string, shape: string[]): PriceRate {
  const entry = record(raw, where);
  for (const key of Object.keys(entry)) {
    if (RATE_KEYS.includes(key)) continue;
    shape.push(
      `change "${id}" carries "${key}" in its rate. Linear only, no curves: a rate is one per-unit ` +
        'figure times a quantity, so there is no field for a band, a curve or a fixed part (GitHub ' +
        'issue #478, § D552).',
    );
  }
  const quantity = record(entry['quantity'], `${where}.quantity`);
  if (str(quantity['type'], `${where}.quantity.type`) !== 'integer') {
    throw new PriceScheduleError(`${where}.quantity.type: a quantity is a whole number of things.`);
  }
  return {
    unitsPer: int(entry['unitsPer'], `${where}.unitsPer`),
    quantity: {
      type: 'integer',
      unit: str(quantity['unit'], `${where}.quantity.unit`),
      min: int(quantity['min'], `${where}.quantity.min`),
      max: int(quantity['max'], `${where}.quantity.max`),
      default: int(quantity['default'], `${where}.quantity.default`),
    },
  };
}

/**
 * Parse and validate the schedule, collecting every violation before refusing.
 *
 * Collected rather than thrown one at a time because an author fixing a price file wants the whole
 * list — `campaign/parse.ts` established that and `fixit/parse.ts` kept it.
 */
export function parsePriceSchedule(raw: unknown): PriceSchedule {
  const doc = record(raw, 'price-schedule.json');
  const version = int(doc['version'], 'price-schedule.json.version');

  const tiers: PriceTier[] = list(doc['tiers'], 'tiers').map((entry, index) => {
    const where = `tiers[${String(index)}]`;
    const tier = record(entry, where);
    return {
      id: str(tier['id'], `${where}.id`),
      order: int(tier['order'], `${where}.order`),
      name: str(tier['name'], `${where}.name`),
      typicalUnits: int(tier['typicalUnits'], `${where}.typicalUnits`),
      note: str(tier['note'], `${where}.note`),
    };
  });

  const shape: string[] = [];
  const changes: PricedChange[] = list(doc['changes'], 'changes').map((entry, index) => {
    const where = `changes[${String(index)}]`;
    const change = record(entry, where);
    const id = str(change['id'], `${where}.id`);
    const tier = str(change['tier'], `${where}.tier`);
    const name = str(change['name'], `${where}.name`);
    const nights = int(change['nights'], `${where}.nights`);
    const note = str(change['note'], `${where}.note`);
    const covers = list(change['covers'], `${where}.covers`).map((path, i) =>
      str(path, `${where}.covers[${String(i)}]`),
    );
    const schema = parseSchema(change['schema'], `${where}.schema`);
    /* A row is flat or rated, never both — GitHub issue #478, § D552. */
    if (change['rate'] === undefined) {
      const priceUnits = int(change['priceUnits'], `${where}.priceUnits`);
      return { id, tier, name, priceUnits, nights, note, covers, schema };
    }
    if (change['priceUnits'] !== undefined) {
      shape.push(
        `change "${id}" carries both a flat price and a rate. A row is priced flat or per unit, ` +
          'never both, so a flat price cannot quietly become a fixed part under a rate (GitHub ' +
          'issue #478, § D552).',
      );
    }
    const rate = parseRate(change['rate'], `${where}.rate`, id, shape);
    return { id, tier, name, rate, nights, note, covers, schema };
  });

  const extras: PricedExtra[] = list(doc['extras'], 'extras').map((entry, index) => {
    const where = `extras[${String(index)}]`;
    const extra = record(entry, where);
    return {
      id: str(extra['id'], `${where}.id`),
      name: str(extra['name'], `${where}.name`),
      priceUnits: int(extra['priceUnits'], `${where}.priceUnits`),
    };
  });

  const withheld: WithheldChange[] = list(doc['withheld'], 'withheld').map((entry, index) => {
    const where = `withheld[${String(index)}]`;
    const item = record(entry, where);
    const id = str(item['id'], `${where}.id`);
    for (const key of Object.keys(item)) {
      if (WITHHELD_KEYS.includes(key)) continue;
      shape.push(
        `withheld "${id}" carries "${key}", and not for sale is a different answer from priced ` +
          'high: a withheld change has no price, no tier and no nights, so there is no field for ' +
          'one to be authored in (GitHub issue #467).',
      );
    }
    return {
      id,
      note: typeof item['note'] === 'string' ? item['note'] : '',
      covers: list(item['covers'], `${where}.covers`).map((path, i) =>
        str(path, `${where}.covers[${String(i)}]`),
      ),
    };
  });

  const violations = [...shape, ...violationsIn({ version, tiers, changes, extras, withheld })];
  if (violations.length > 0) {
    throw new PriceScheduleError(
      `data/price-schedule.json is not a usable schedule:\n  ${violations.join('\n  ')}`,
    );
  }
  return { version, tiers, changes, extras, withheld };
}

/**
 * Every rule the schedule must satisfy, as a list rather than a throw.
 *
 * Exported so `schedule.test.ts` can assert the **positive control** — that a deliberately broken
 * schedule is caught — without constructing a file on disk. A validator nobody has watched fail is
 * a validator nobody knows works.
 */
export function violationsIn(schedule: PriceSchedule): readonly string[] {
  const out: string[] = [];

  const duplicates = (ids: readonly string[], what: string): void => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) out.push(`${what} "${id}" is declared twice.`);
      seen.add(id);
    }
  };
  duplicates(schedule.tiers.map((tier) => tier.id), 'tier');
  duplicates(schedule.changes.map((change) => change.id), 'change');
  duplicates(schedule.extras.map((extra) => extra.id), 'extra');
  duplicates(schedule.withheld.map((entry) => entry.id), 'withheld change');

  /* What no scenario sells — GitHub issue #467. Withheld and priced may not meet, by path or group. */
  const pricedIds = new Set(schedule.changes.map((change) => change.id));
  for (const entry of schedule.withheld) {
    if (pricedIds.has(entry.id)) {
      out.push(
        `"${entry.id}" is both a priced change and a withheld one. Not for sale is a different ` +
          'answer from priced high, and one id cannot give both.',
      );
    }
    if (entry.note.trim() === '') {
      out.push(
        `withheld "${entry.id}" says nothing about why. Not for sale is a ruling, and a ruling ` +
          'says whose it is.',
      );
    }
    if (entry.covers.length === 0) {
      out.push(`withheld "${entry.id}" covers nothing, so it withholds nothing.`);
    }
    for (const path of entry.covers) {
      for (const change of schedule.changes) {
        const met = change.covers.find((covered) => pathsOverlap(path, covered));
        if (met === undefined) continue;
        out.push(
          `"${met}" is both withheld and priced — withheld by "${entry.id}" through "${path}" and ` +
            `priced by "${change.id}". A dial is sold at one price or at none (GitHub issue #467).`,
        );
      }
    }
  }

  const tierIds = new Set(schedule.tiers.map((tier) => tier.id));
  for (const change of schedule.changes) {
    if (!tierIds.has(change.tier)) {
      out.push(`change "${change.id}" names tier "${change.tier}", which is not in the ladder.`);
    }
    const { schema } = change;
    /* The figure the schema describes: a flat row's price, a rated row's rate (§ D552). */
    const figure = change.rate === undefined ? change.priceUnits : change.rate.unitsPer;
    const per = change.rate === undefined ? '' : ` per ${change.rate.quantity.unit}`;
    if (figure < schema.min || figure > schema.max) {
      out.push(
        `change "${change.id}" is priced ${String(figure)} u${per}, outside its own ` +
          `declared ${String(schema.min)}–${String(schema.max)} (CLAUDE.md invariant 8).`,
      );
    }
    if (schema.default !== figure) {
      out.push(
        `change "${change.id}" prices at ${String(figure)} u${per} and defaults to ` +
          `${String(schema.default)}. The default is the shipped price, not a second opinion.`,
      );
    }
    if (change.nights < 0) out.push(`change "${change.id}" books negative nights.`);
    if (change.rate !== undefined) out.push(...rateViolations(change.id, change.rate));
  }

  /* Two rows claiming one field, by path or through a group, is two prices for one change. */
  const claimed: { readonly path: string; readonly changeId: string }[] = [];
  for (const change of schedule.changes) {
    for (const path of change.covers) {
      for (const earlier of claimed) {
        if (!pathsOverlap(path, earlier.path)) continue;
        if (path === earlier.path) {
          out.push(
            `"${path}" is priced by both "${earlier.changeId}" and "${change.id}". ` +
              'One change, one price — that is the whole of GitHub issue #366.',
          );
          continue;
        }
        if (earlier.changeId === change.id) continue;
        const pathIsGroup = path.length < earlier.path.length;
        const [group, leaf] = pathIsGroup ? [path, earlier.path] : [earlier.path, path];
        const [groupOwner, leafOwner] = pathIsGroup
          ? [change.id, earlier.changeId]
          : [earlier.changeId, change.id];
        out.push(
          `"${leaf}" is priced by both "${leafOwner}" and "${groupOwner}", which covers it ` +
            `through the group "${group}". A group prices every path under it, so one change, ` +
            'one price — that is the whole of GitHub issue #366.',
        );
      }
      claimed.push({ path, changeId: change.id });
    }
  }

  /* The ladder: every typical is its own tier's median, and the typicals ascend with order. */
  for (const tier of schedule.tiers) {
    const prices = schedule.changes
      .filter((change) => change.tier === tier.id)
      .map((change) => smallestPurchaseUnitsOf(change));
    if (prices.length === 0) {
      out.push(`tier "${tier.id}" prices nothing, so its typical describes nothing.`);
      continue;
    }
    const median = medianOf(prices);
    if (tier.typicalUnits !== median) {
      out.push(
        `tier "${tier.id}" declares a typical of ${String(tier.typicalUnits)} u and its own ` +
          `prices median at ${String(median)} u. The typical is derived, not chosen.`,
      );
    }
  }
  const byOrder = [...schedule.tiers].sort((a, b) => a.order - b.order);
  for (let i = 1; i < byOrder.length; i += 1) {
    const lower = byOrder[i - 1];
    const upper = byOrder[i];
    if (lower === undefined || upper === undefined) continue;
    if (upper.typicalUnits <= lower.typicalUnits) {
      out.push(
        `the ladder does not ascend: "${upper.id}" (${String(upper.typicalUnits)} u) is not ` +
          `dearer than "${lower.id}" (${String(lower.typicalUnits)} u).`,
      );
    }
  }
  return out;
}

/** A rate's own rules — invariant 8 on the quantity, and a rate that charges something (§ D552). */
function rateViolations(id: string, rate: PriceRate): readonly string[] {
  const out: string[] = [];
  const { unitsPer, quantity } = rate;
  if (unitsPer <= 0) {
    out.push(
      `change "${id}" has a rate of ${String(unitsPer)} u per ${quantity.unit}. A row that charges ` +
        'nothing per unit is a free flat row wearing a multiplier — write "priceUnits": 0 — and a ' +
        'negative rate pays the player to buy (GitHub issue #478, § D552).',
    );
  }
  if (quantity.min !== 0 || quantity.default !== 0) {
    out.push(
      `change "${id}" sells ${quantity.unit} from ${String(quantity.min)}, defaulting to ` +
        `${String(quantity.default)}. A quantity's floor and default are 0, none bought, so an unset ` +
        'quantity is the building as it is (CLAUDE.md invariant 8, § D552).',
    );
  }
  if (quantity.max < 1) {
    out.push(
      `change "${id}" sells at most ${String(quantity.max)} ${quantity.unit}, which buys nothing.`,
    );
  }
  return out;
}

/** The price of one change, by id. Throws rather than defaulting: an unpriced change is a bug. */
export function priceOf(schedule: PriceSchedule, changeId: string): PricedChange {
  const found = schedule.changes.find((change) => change.id === changeId);
  if (found === undefined) {
    throw new PriceScheduleError(
      `nothing in data/price-schedule.json prices "${changeId}". A caller that priced it anyway ` +
        'would be the second price this file exists to prevent.',
    );
  }
  return found;
}

/** Which change prices a config path, or `undefined` where nothing does. */
export function changeCovering(
  schedule: PriceSchedule,
  path: string,
): PricedChange | undefined {
  return schedule.changes.find((change) => change.covers.includes(path));
}

/**
 * **What buying a change costs — the one place a price is multiplied.** GitHub issue **#478**,
 * [§ D552](../../../../DECISIONS.md).
 *
 * A flat row costs its price and takes no quantity. A rated row costs `unitsPer × quantity`, linear
 * and nothing else, for a whole-number quantity inside its declared range.
 *
 * **Both refusals are the point.** Every path that priced a change before #478 summed a flat figure
 * and has no quantity to give, so a rated row reached through one of them throws here rather than
 * being charged for one unit — one unit is a quantity chosen for the player, which is the private
 * multiplier the issue exists to prevent, arrived at by default. And a quantity on a flat row throws
 * rather than multiplying a figure that declared no rate.
 */
export function purchaseUnits(change: PricedChange, quantity?: number): number {
  if (change.rate === undefined) {
    if (quantity !== undefined) {
      throw new PriceScheduleError(
        `"${change.id}" is priced flat at ${String(change.priceUnits)} u and was bought with a ` +
          `quantity of ${String(quantity)}. A flat row declares no rate, so multiplying its price ` +
          'would be a multiplier nobody authored (GitHub issue #478, § D552).',
      );
    }
    return change.priceUnits;
  }
  const { unitsPer, quantity: sold } = change.rate;
  if (quantity === undefined) {
    throw new PriceScheduleError(
      `"${change.id}" is priced per ${sold.unit} at ${String(unitsPer)} u and was bought without a ` +
        `quantity. Charging for one ${sold.unit} would be choosing how many for the player (GitHub ` +
        'issue #478, § D552).',
    );
  }
  if (!Number.isInteger(quantity) || quantity < sold.min || quantity > sold.max) {
    throw new PriceScheduleError(
      `"${change.id}" sells ${String(sold.min)}–${String(sold.max)} ${sold.unit}, and ` +
        `${String(quantity)} was asked for.`,
    );
  }
  return unitsPer * quantity;
}

/**
 * The smallest purchase of a change that is still a purchase of it: a flat row's price, a rated row's
 * one unit. What its tier's median reads — the price on the row's face — and what a budget's cheapest
 * step is measured against (§ D552).
 */
export function smallestPurchaseUnitsOf(change: PricedChange): number {
  return change.rate === undefined ? change.priceUnits : change.rate.unitsPer;
}

/**
 * The most a change can cost: a flat row's price, a rated row at its declared most. What a scenario's
 * budget ceiling counts, because above the ceiling there must be nothing left to buy (§ D552).
 */
export function ceilingUnitsOf(change: PricedChange): number {
  return change.rate === undefined
    ? change.priceUnits
    : change.rate.unitsPer * change.rate.quantity.max;
}
