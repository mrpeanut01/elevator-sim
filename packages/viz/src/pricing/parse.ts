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
 */

import {
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

  const shape: string[] = [];
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
