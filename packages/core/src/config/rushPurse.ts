/**
 * **The rush purse: the per-wave figure a round pays, its schema, and the balance across a sitting**
 * — GitHub issue **#372**, `docs/38` § 2.3, and the owner's ruling of 2026-09-10 on that issue:
 * *a round is a sitting, posted whole … the server replays the chain and derives each round's purse
 * from the previous round's hold moment.*
 *
 * `data/rush-purse.json` is the rush's own data (the issue's first criterion) and this module is
 * its reader, beside `chimeLedger.ts` for the reason that module gives: `packages/server` has to
 * derive a posted sitting's purses and may not import the viewer, so the rule has to live in the
 * package both of them already depend on.
 *
 * ## What a purse is paid on, and what it is never paid on
 *
 * A round pays `unitsPerWaveOutlasted` for each wave it outlasted, and that count is read off the
 * server's own replay at the hold moment (`sim/rush.ts#rushWavesOutlasted`). {@link rushPurseRounds}
 * takes **whole wave counts and nothing else**: no wait, no carried count, no quotable mean and no
 * held seconds can reach it, because none of them is a parameter. That is `docs/38` § 2.3's
 * *"Nothing about the purse changes because time passed; it is earned inside the run"*, and it is
 * § D526 clause 2's refusal to scale anything by a quantity the run can suppress, applied to units.
 *
 * ## The balance, and the one reading the ruling did not settle
 *
 * The ruling says each round's purse is derived from the previous round's hold moment. It does not
 * say whether units a round did not spend are kept, and {@link rushPurseRounds} reads a purse as a
 * **balance within the sitting**: it opens at what a listed top-up sink bought, each round pays into
 * it, and the next round opens with the whole of it. That is the reading under which *"a player who
 * lasts longer has more to rebuild with"* holds across rounds rather than only within one. It was
 * drafted as a proposal, and the product owner approved it as drafted on 2026-09-11 (§ D542).
 * Changing it is this one function.
 *
 * ## What is not built
 *
 * **Nothing spends a purse.** A between-round rebuild is the fit-out kit (§ D427), and the code that
 * turns a kit into a building is `packages/viz/src/campaign/fitOut.ts` over
 * `packages/viz/src/commissioning/`, which the server may not import. So `purseAfterUnits` is always
 * `purseBeforeUnits + paidUnits`: the arithmetic has no spend term because no spend travels, and a
 * spend term nothing could fill would be a dead seam with a column of zeroes in it.
 *
 * Recorded under [§ D405](../../../../DECISIONS.md) where it binds only this module; the sitting it
 * serves is [§ D542](../../../../DECISIONS.md).
 */

import { chimeGrantUnits, chimeSinkById, type ChimeLedgerTable } from './chimeLedger.js';

/** Raised when `data/rush-purse.json` cannot be read as a purse. */
export class RushPurseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RushPurseError';
  }
}

/** The schema `CLAUDE.md` invariant 8 asks of the one tunable — type, range, default. */
export interface RushPurseSchema {
  readonly type: 'integer';
  /** Purse units, the money inside one mode — never chimes (§ D530). */
  readonly unit: 'units';
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

/** `data/rush-purse.json`, parsed. */
export interface RushPurseTable {
  /** Units a round pays into the purse for each wave it outlasted. */
  readonly unitsPerWaveOutlasted: number;
  readonly note: string;
  readonly schema: RushPurseSchema;
  /**
   * The chime sinks that widen this purse, by id — `data/chime-ledger.json`'s own sinks, which
   * {@link violationsInRushPurse} checks exist and sell purse units. Data rather than a prefix match
   * on a sink's id, so which purchases reach a rush is an authored fact (invariant 7).
   */
  readonly topUpSinkIds: readonly string[];
}

/** One round's purse: what it opened with, what its waves paid, and what the next round opens with. */
export interface RushPurseRound {
  readonly purseBeforeUnits: number;
  readonly paidUnits: number;
  readonly purseAfterUnits: number;
}

const KEYS = ['$comment', 'version', 'unitsPerWaveOutlasted', 'note', 'schema', 'topUpSinkIds'] as const;

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RushPurseError(`${where}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function strict(entry: Record<string, unknown>, allowed: readonly string[], where: string): void {
  const unknown = Object.keys(entry).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new RushPurseError(
      `${where}: unrecognised ${unknown.length === 1 ? 'key' : 'keys'} ${unknown.join(', ')}. Every ` +
        'object in this document is strict, on data/chime-ledger.json\'s ground: a field nothing ' +
        'validates is a field a price in money could be authored into.',
    );
  }
}

function whole(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new RushPurseError(`${where}: expected a whole number.`);
  }
  return value;
}

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RushPurseError(`${where}: expected a non-empty string.`);
  }
  return value;
}

function parseSchema(raw: unknown): RushPurseSchema {
  const where = 'rush-purse.schema';
  const entry = record(raw, where);
  strict(entry, ['type', 'unit', 'min', 'max', 'default'], where);
  if (entry['type'] !== 'integer') throw new RushPurseError(`${where}.type: a purse is paid in whole units, "integer".`);
  if (entry['unit'] !== 'units') {
    throw new RushPurseError(
      `${where}.unit: a purse is denominated in "units", the money inside one mode, and declares ` +
        `"${String(entry['unit'])}". Chimes buy a top-up and never are one (DECISIONS.md D530).`,
    );
  }
  const min = whole(entry['min'], `${where}.min`);
  const max = whole(entry['max'], `${where}.max`);
  const fallback = whole(entry['default'], `${where}.default`);
  if (!(min >= 1 && min <= fallback && fallback <= max)) {
    throw new RushPurseError(`${where}: expected 1 ≤ min ≤ default ≤ max, and read ${String(min)} ≤ ${String(fallback)} ≤ ${String(max)}.`);
  }
  return { type: 'integer', unit: 'units', min, max, default: fallback };
}

/**
 * Read `data/rush-purse.json`, refusing every shape it may not take.
 *
 * Throws rather than collecting, because the one reader that matters is a server at boot, and a
 * server whose purse will not parse would refuse every sitting at the moment a player posted one —
 * the moment with no words for it (`loadChimeLedger`'s ground).
 */
export function parseRushPurse(raw: unknown): RushPurseTable {
  const entry = record(raw, 'rush-purse');
  strict(entry, KEYS, 'rush-purse');
  if (entry['version'] !== 1) throw new RushPurseError('rush-purse.version: this reader knows version 1.');
  const schema = parseSchema(entry['schema']);
  const unitsPerWaveOutlasted = whole(entry['unitsPerWaveOutlasted'], 'rush-purse.unitsPerWaveOutlasted');
  if (unitsPerWaveOutlasted < schema.min || unitsPerWaveOutlasted > schema.max) {
    throw new RushPurseError(
      `rush-purse.unitsPerWaveOutlasted: ${String(unitsPerWaveOutlasted)} is outside its own schema, ` +
        `${String(schema.min)}–${String(schema.max)} units.`,
    );
  }
  const ids = entry['topUpSinkIds'];
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new RushPurseError('rush-purse.topUpSinkIds: name at least one chime sink that tops this purse up.');
  }
  const topUpSinkIds = ids.map((id, index) => text(id, `rush-purse.topUpSinkIds[${String(index)}]`));
  const repeated = topUpSinkIds.filter((id, index) => topUpSinkIds.indexOf(id) !== index);
  if (repeated.length > 0) throw new RushPurseError(`rush-purse.topUpSinkIds: names ${repeated.join(', ')} twice.`);
  return Object.freeze({
    unitsPerWaveOutlasted,
    note: text(entry['note'], 'rush-purse.note'),
    schema: Object.freeze(schema),
    topUpSinkIds: Object.freeze(topUpSinkIds),
  });
}

/**
 * Every way the purse disagrees with the chime ledger, as sentences. Empty means it agrees.
 *
 * A top-up sink has to exist and has to sell purse units: a sink the ledger does not sell would be a
 * top-up nobody can buy, and `rush-prefit` — which sells a fitted building — would open the purse at
 * zero units while carrying a modifier whose building the server cannot build.
 */
export function violationsInRushPurse(table: RushPurseTable, ledger: ChimeLedgerTable): readonly string[] {
  const issues: string[] = [];
  for (const id of table.topUpSinkIds) {
    const sink = chimeSinkById(ledger, id);
    if (sink === undefined) {
      issues.push(`rush-purse.topUpSinkIds names "${id}", which data/chime-ledger.json does not sell.`);
    } else if (sink.modifier.kind !== 'purse-units') {
      issues.push(`rush-purse.topUpSinkIds names "${id}", which sells a ${sink.modifier.kind} modifier and not purse units.`);
    }
  }
  return issues;
}

/**
 * What a sitting's purse opens at: the units the listed top-up sinks grant for the steps claimed.
 *
 * The claims arrive **already checked against the account's spends** (`packages/server`'s
 * `chimes/ledger.ts#unbackedModifiers`); this only sums them. A sink that is not one of this purse's
 * top-ups contributes nothing whatever it grants elsewhere, and a standard sitting opens at zero.
 */
export function rushPurseOpeningUnits(
  table: RushPurseTable,
  ledger: ChimeLedgerTable,
  claimed: readonly { readonly sinkId: string; readonly steps: number }[],
): number {
  let units = 0;
  for (const claim of claimed) {
    if (!table.topUpSinkIds.includes(claim.sinkId)) continue;
    const sink = chimeSinkById(ledger, claim.sinkId);
    if (sink !== undefined) units += chimeGrantUnits(sink, claim.steps);
  }
  return units;
}

/**
 * Each round's purse across a sitting, from the purse it opened at and each round's waves outlasted.
 *
 * Whole counts in, and nothing else: see the module docstring for why that signature is the guarantee
 * that no measurement moves a purse, and for the balance reading and the absent spend term.
 */
export function rushPurseRounds(
  table: RushPurseTable,
  openingUnits: number,
  wavesOutlasted: readonly number[],
): readonly RushPurseRound[] {
  if (!Number.isInteger(openingUnits) || openingUnits < 0) {
    throw new RushPurseError(`a purse opens at a whole number of units, and was asked to open at ${String(openingUnits)}.`);
  }
  const rounds: RushPurseRound[] = [];
  let balance = openingUnits;
  for (const [index, waves] of wavesOutlasted.entries()) {
    if (!Number.isInteger(waves) || waves < 0) {
      throw new RushPurseError(`round ${String(index + 1)} outlasted ${String(waves)} waves, which is not a whole number of waves.`);
    }
    const paidUnits = waves * table.unitsPerWaveOutlasted;
    rounds.push(Object.freeze({ purseBeforeUnits: balance, paidUnits, purseAfterUnits: balance + paidUnits }));
    balance += paidUnits;
  }
  return Object.freeze(rounds);
}
