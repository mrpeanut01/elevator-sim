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
 * - **No change covers a path another change also covers.** Two rows claiming one field is the
 *   same defect as two prices, arrived at from the other side, and it is the check that would have
 *   caught the speed conflict this file was written to end.
 */

import {
  type PriceSchedule,
  type PriceSchema,
  type PricedChange,
  type PricedExtra,
  type PriceTier,
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

  const changes: PricedChange[] = list(doc['changes'], 'changes').map((entry, index) => {
    const where = `changes[${String(index)}]`;
    const change = record(entry, where);
    return {
      id: str(change['id'], `${where}.id`),
      tier: str(change['tier'], `${where}.tier`),
      name: str(change['name'], `${where}.name`),
      priceUnits: int(change['priceUnits'], `${where}.priceUnits`),
      nights: int(change['nights'], `${where}.nights`),
      note: str(change['note'], `${where}.note`),
      covers: list(change['covers'], `${where}.covers`).map((path, i) =>
        str(path, `${where}.covers[${String(i)}]`),
      ),
      schema: parseSchema(change['schema'], `${where}.schema`),
    };
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

  const violations = violationsIn({ version, tiers, changes, extras });
  if (violations.length > 0) {
    throw new PriceScheduleError(
      `data/price-schedule.json is not a usable schedule:\n  ${violations.join('\n  ')}`,
    );
  }
  return { version, tiers, changes, extras };
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

  const tierIds = new Set(schedule.tiers.map((tier) => tier.id));
  for (const change of schedule.changes) {
    if (!tierIds.has(change.tier)) {
      out.push(`change "${change.id}" names tier "${change.tier}", which is not in the ladder.`);
    }
    const { schema } = change;
    if (change.priceUnits < schema.min || change.priceUnits > schema.max) {
      out.push(
        `change "${change.id}" is priced ${String(change.priceUnits)} u, outside its own ` +
          `declared ${String(schema.min)}–${String(schema.max)} (CLAUDE.md invariant 8).`,
      );
    }
    if (schema.default !== change.priceUnits) {
      out.push(
        `change "${change.id}" prices at ${String(change.priceUnits)} u and defaults to ` +
          `${String(schema.default)}. The default is the shipped price, not a second opinion.`,
      );
    }
    if (change.nights < 0) out.push(`change "${change.id}" books negative nights.`);
  }

  /* Two rows claiming one field is two prices for one change, from the other side. */
  const claimed = new Map<string, string>();
  for (const change of schedule.changes) {
    for (const path of change.covers) {
      const already = claimed.get(path);
      if (already !== undefined) {
        out.push(
          `"${path}" is priced by both "${already}" and "${change.id}". One change, one price — ` +
            'that is the whole of GitHub issue #366.',
        );
      }
      claimed.set(path, change.id);
    }
  }

  /* The ladder: every typical is its own tier's median, and the typicals ascend with order. */
  for (const tier of schedule.tiers) {
    const prices = schedule.changes
      .filter((change) => change.tier === tier.id)
      .map((change) => change.priceUnits);
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
