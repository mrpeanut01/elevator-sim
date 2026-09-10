/**
 * Reading `data/chime-ledger.json`: every source a chime can come from, every sink one can go to,
 * and the ways the document can be wrong — GitHub issue **#368**, [§ D526](../../../../DECISIONS.md),
 * [§ D530](../../../../DECISIONS.md), [§ D531](../../../../DECISIONS.md), `docs/38` § 2.4.
 *
 * `pricing/parse.ts`'s shape, kept deliberately: authored data is validated **at load time**, every
 * violation is collected rather than the first thrown, and the rules a test would otherwise hold in
 * prose are mechanical here.
 *
 * ## Why this lives in `core/config/` rather than beside a screen
 *
 * `data/price-schedule.json` is parsed in `packages/viz`, because only the viewer reads it. The
 * chime ledger has **two** readers that must agree: the server, which holds the balance and is the
 * only thing allowed to decide what an entry is worth, and the viewer, which draws a sink's price
 * and keeps a device-only ledger when there is no account. `packages/server` cannot import
 * `packages/viz`, so a table parsed on the play side would have to be transcribed on the server —
 * and `pricing/types.ts` documents at length what happens when one price lives in six places: a
 * player pays a different amount depending on which screen they are standing on. Across a network
 * boundary that stops being a display defect and becomes an authority defect.
 *
 * This module is the one place both packages can reach. It touches no kernel, no clock, no RNG and
 * no `node:` builtin — `config/index.ts` is the fs-free barrel and this belongs on it — so no
 * invariant is bent to put it here. It is `data/*.json` validation, which is what this module is.
 *
 * ## The two vocabularies, and the boundary is the whole design
 *
 * [§ D526](../../../../DECISIONS.md) clause 5: *the play surface reads one balance and posts two
 * verbs, earn and spend, and never knows a source.* So there are two words here that a careless
 * reader would collapse into one, and they are kept apart on purpose:
 *
 * - A **completion** is what the play surface names. A scenario cleared, a contract day paid, a
 *   rush wave survived. {@link CHIME_COMPLETIONS} is closed, and it is the whole of what a client
 *   may post.
 * - A **source** is what the ledger calls the entry it wrote. Every completion has one; the
 *   sign-in gift ([§ D531](../../../../DECISIONS.md)) is a source with **no** completion, which is
 *   the structural half of its being a gift — a client cannot post it, because there is no
 *   completion that names it. Any external add would be one more source with no completion, and
 *   nothing on the play surface would move, which is exactly what clause 5 was built for.
 *
 * `packages/viz/src/boundaries.test.ts` asserts that no module in the viewer names a source at all.
 *
 * ## What may not be authored, and the refusal is here rather than in a reviewer
 *
 * [§ D526](../../../../DECISIONS.md) clause 6 forbids a purchase, a price in money, a store, a
 * conversion event or supporting telemetry anywhere, until a decision citing a measured
 * `charter S4` adds one. Three mechanical consequences, all in {@link violationsInChimeLedger}:
 *
 * 1. {@link CHIME_EARNED_BY} has exactly two values. A source claiming a third — `purchase`,
 *    `gift-card`, anything — is refused by name, and the message says which decision refuses it.
 * 2. **Every object is strict.** An unrecognised key is a violation rather than a field silently
 *    dropped, which is `config/schema.ts`'s own rule for invariant 8 and is what stops
 *    `priceCents`, `currencyCode`, `sku` or `productId` from being authored into a file nothing
 *    would complain about.
 * 3. **No amount ever arrives from outside this table.** Everything a caller can ask for is
 *    `(completion) → award` or `(sink, steps) → price`; there is no function here that takes an
 *    amount, so nothing downstream can be handed one. A purchase is, mechanically, a client
 *    naming an amount, and there is no argument for it to name.
 *
 * ## What the figures are
 *
 * Drafted, and the file says so on its own face at far greater length than this docstring can. Not
 * one number in `data/chime-ledger.json` is measured; the product owner's 2026-09-09 ruling on this
 * issue is *draft the numbers, then tune them by simulation*, and the second half has not been
 * done. See the document's `$comment`.
 */

/* -------------------------------------------------------------------------- *
 * The vocabularies
 * -------------------------------------------------------------------------- */

/**
 * What the play surface may say it finished.
 *
 * Closed, and it is the whole of the earn verb's argument. `docs/38` § 2.4: *earned by completing a
 * turn, never by a run's figures* — every member here is a turn that either happened or did not,
 * and none of them is a quantity a run can suppress.
 */
export const CHIME_COMPLETIONS = ['scenario-cleared', 'career-day-paid', 'rush-wave-survived'] as const;

/** One member of {@link CHIME_COMPLETIONS}. */
export type ChimeCompletion = (typeof CHIME_COMPLETIONS)[number];

/**
 * How a source came to exist. **Two values, and there is no third.**
 *
 * `completion` is a turn the player finished. `gift` is the sign-in award
 * ([§ D531](../../../../DECISIONS.md)) and nothing else today. A purchase is not on this list and
 * may not be added to it by a lane — [§ D526](../../../../DECISIONS.md) clause 6 requires a
 * decision citing a measured `charter S4` first.
 */
export const CHIME_EARNED_BY = ['completion', 'gift'] as const;

/** One member of {@link CHIME_EARNED_BY}. */
export type ChimeEarnedBy = (typeof CHIME_EARNED_BY)[number];

/**
 * What a sink grants. Closed, for the same reason {@link CHIME_EARNED_BY} is.
 *
 * `docs/38` § 2.4: chimes buy *a scenario's budget up, a tower's purse up, a rush's between-round
 * purse up or a pre-fitted start*, and nothing else. Every one of those is a limit on a
 * **configuration**, which is `docs/32` GD13 clause 1's single permission. A kind that opened a
 * mode, a screen, a building, a dispatcher, a case or a figure would be GD9, and there is no
 * spelling of it here.
 */
export const CHIME_MODIFIER_KINDS = ['budget-units', 'purse-units', 'prefit'] as const;

/** One member of {@link CHIME_MODIFIER_KINDS}. */
export type ChimeModifierKind = (typeof CHIME_MODIFIER_KINDS)[number];

/* -------------------------------------------------------------------------- *
 * The shapes
 * -------------------------------------------------------------------------- */

/**
 * The schema `CLAUDE.md` invariant 8 asks of every tunable — type, range, default.
 *
 * No `activeWhen`, for `pricing/types.ts`'s reason one file along: an award is unconditional. A
 * source's award does not become inapplicable under another parameter's setting; a source either
 * exists or it does not.
 */
export interface ChimeSchema {
  readonly type: 'integer';
  readonly unit: 'chimes';
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

/**
 * A harder scenario paying more, by its **survivor-count band**.
 *
 * `docs/38` § 2.1 makes the survivor count a property of the scenario, pre-simulated and pinned
 * before it ships. That is why a band may move an award and a run's figures may not: the band is
 * known before anybody plays, so nothing the player does to the run can change what clearing it
 * pays. [§ D526](../../../../DECISIONS.md) clause 2 permits exactly this and nothing wider.
 */
export interface ChimeBand {
  readonly id: string;
  readonly awardChimes: number;
  readonly note: string;
}

/**
 * One place a chime can come from — **the ledger's own vocabulary, never the play surface's**.
 *
 * See this module's docstring for why a source and a completion are different words.
 */
export interface ChimeSource {
  readonly id: string;
  /** What a reader of the store sees. Never drawn to a player: a player reads a balance. */
  readonly name: string;
  readonly earnedBy: ChimeEarnedBy;
  /** Present exactly when {@link earnedBy} is `completion`. The verb a client may post. */
  readonly completion: ChimeCompletion | undefined;
  /** Present exactly when {@link earnedBy} is `gift` — § D531's `x`, in hours away. */
  readonly awayHours: number | undefined;
  readonly awardChimes: number;
  /** Empty on every source that has no bands. Never partial: a band set is all of them or none. */
  readonly bands: readonly ChimeBand[];
  readonly note: string;
  readonly schema: ChimeSchema;
}

/** What a sink grants, and it is always a limit on a configuration. */
export interface ChimeModifier {
  readonly kind: ChimeModifierKind;
  /** Units per step, or `0` for a kind that grants no units. */
  readonly grantUnits: number;
}

/** One thing chimes can be spent on. Play-visible: a player is shown the price before they pay it. */
export interface ChimeSink {
  readonly id: string;
  /** The words on the button — *widen this budget*. Player-facing, and swept as such. */
  readonly name: string;
  readonly priceChimes: number;
  readonly modifier: ChimeModifier;
  /** How many times one run may buy this. At least one; a scenario cannot be bought down to free. */
  readonly maxSteps: number;
  readonly note: string;
  readonly schema: ChimeSchema;
}

/** What the currency is called — [§ D530](../../../../DECISIONS.md). Data, so no screen spells it. */
export interface ChimeCurrency {
  readonly id: string;
  readonly one: string;
  readonly many: string;
}

/** `data/chime-ledger.json`, parsed. */
export interface ChimeLedgerTable {
  readonly version: number;
  readonly currency: ChimeCurrency;
  readonly sources: readonly ChimeSource[];
  readonly sinks: readonly ChimeSink[];
}

/** Raised when the document cannot be read as a ledger table at all. */
export class ChimeLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChimeLedgerError';
  }
}

/* -------------------------------------------------------------------------- *
 * Reading
 * -------------------------------------------------------------------------- */

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ChimeLedgerError(`${where}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Every object is strict, and the message says why.
 *
 * `config/schema.ts` states the rule for the simulation data — *an unrecognized key is an error,
 * not silently dropped* — and this is the same rule with a second reason on top of invariant 8's:
 * a field nobody validates is where a price in money would land. See this module's docstring.
 */
function strict(entry: Record<string, unknown>, allowed: readonly string[], where: string): void {
  const unknown = Object.keys(entry).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ChimeLedgerError(
      `${where}: unrecognised ${unknown.length === 1 ? 'key' : 'keys'} ${unknown.join(', ')}. ` +
        'Every object in this document is strict: a field nothing validates is a field a price in ' +
        'money could be authored into, and DECISIONS.md D526 clause 6 says no purchase ships.',
    );
  }
}

function str(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ChimeLedgerError(`${where}: expected a non-empty string.`);
  }
  return value;
}

function int(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ChimeLedgerError(`${where}: expected a whole number.`);
  }
  return value;
}

function list(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new ChimeLedgerError(`${where}: expected an array.`);
  return value;
}

function parseSchema(raw: unknown, where: string): ChimeSchema {
  const entry = record(raw, where);
  strict(entry, ['type', 'unit', 'min', 'max', 'default'], where);
  const type = str(entry['type'], `${where}.type`);
  const unit = str(entry['unit'], `${where}.unit`);
  if (type !== 'integer') throw new ChimeLedgerError(`${where}.type: only "integer" is a chime.`);
  if (unit !== 'chimes') {
    throw new ChimeLedgerError(
      `${where}.unit: only "chimes" is a chime. Units are money inside a mode and stay so ` +
        '(DECISIONS.md D530), and a ledger that could be denominated in anything else is the ' +
        'conversion D526 clause 6 refuses.',
    );
  }
  return {
    type: 'integer',
    unit: 'chimes',
    min: int(entry['min'], `${where}.min`),
    max: int(entry['max'], `${where}.max`),
    default: int(entry['default'], `${where}.default`),
  };
}

function parseSource(raw: unknown, where: string): ChimeSource {
  const entry = record(raw, where);
  strict(
    entry,
    ['id', 'name', 'earnedBy', 'completion', 'awayHours', 'awardChimes', 'bands', 'note', 'schema'],
    where,
  );
  const earnedBy = str(entry['earnedBy'], `${where}.earnedBy`);
  if (!(CHIME_EARNED_BY as readonly string[]).includes(earnedBy)) {
    throw new ChimeLedgerError(
      `${where}.earnedBy: "${earnedBy}" is not how a chime is earned. The two ways are ` +
        `${CHIME_EARNED_BY.join(' and ')}, and there is no third: DECISIONS.md D526 clause 6 says ` +
        'no purchase, price, store, conversion event or supporting telemetry ships anywhere, and ' +
        'such a source is added only by a decision citing a measured charter S4.',
    );
  }
  const completionRaw = entry['completion'];
  const awayRaw = entry['awayHours'];
  const bandsRaw = entry['bands'];
  return {
    id: str(entry['id'], `${where}.id`),
    name: str(entry['name'], `${where}.name`),
    earnedBy: earnedBy as ChimeEarnedBy,
    completion:
      completionRaw === undefined ? undefined : (str(completionRaw, `${where}.completion`) as ChimeCompletion),
    awayHours: awayRaw === undefined ? undefined : int(awayRaw, `${where}.awayHours`),
    awardChimes: int(entry['awardChimes'], `${where}.awardChimes`),
    bands:
      bandsRaw === undefined
        ? []
        : list(bandsRaw, `${where}.bands`).map((band, index) => {
            const at = `${where}.bands[${String(index)}]`;
            const one = record(band, at);
            strict(one, ['id', 'awardChimes', 'note'], at);
            return {
              id: str(one['id'], `${at}.id`),
              awardChimes: int(one['awardChimes'], `${at}.awardChimes`),
              note: str(one['note'], `${at}.note`),
            };
          }),
    note: str(entry['note'], `${where}.note`),
    schema: parseSchema(entry['schema'], `${where}.schema`),
  };
}

function parseSink(raw: unknown, where: string): ChimeSink {
  const entry = record(raw, where);
  strict(entry, ['id', 'name', 'priceChimes', 'modifier', 'maxSteps', 'note', 'schema'], where);
  const modifierAt = `${where}.modifier`;
  const modifier = record(entry['modifier'], modifierAt);
  strict(modifier, ['kind', 'grantUnits'], modifierAt);
  const kind = str(modifier['kind'], `${modifierAt}.kind`);
  if (!(CHIME_MODIFIER_KINDS as readonly string[]).includes(kind)) {
    throw new ChimeLedgerError(
      `${modifierAt}.kind: "${kind}" is not something a chime buys. The kinds are ` +
        `${CHIME_MODIFIER_KINDS.join(', ')} — every one a limit on a configuration, which is ` +
        'docs/32 GD13 clause 1. A kind that opened a mode, a screen, a building, a dispatcher, a ' +
        'case or a figure would be GD9, and there is no spelling of it here.',
    );
  }
  return {
    id: str(entry['id'], `${where}.id`),
    name: str(entry['name'], `${where}.name`),
    priceChimes: int(entry['priceChimes'], `${where}.priceChimes`),
    modifier: { kind: kind as ChimeModifierKind, grantUnits: int(modifier['grantUnits'], `${modifierAt}.grantUnits`) },
    maxSteps: int(entry['maxSteps'], `${where}.maxSteps`),
    note: str(entry['note'], `${where}.note`),
    schema: parseSchema(entry['schema'], `${where}.schema`),
  };
}

/**
 * Parse and validate the ledger table, collecting every violation before refusing.
 *
 * Collected rather than thrown one at a time because an author fixing an economy wants the whole
 * list — `campaign/parse.ts` established that, `fixit/parse.ts` kept it and `pricing/parse.ts`
 * carried it here.
 */
export function parseChimeLedger(raw: unknown): ChimeLedgerTable {
  const doc = record(raw, 'chime-ledger.json');
  strict(doc, ['$comment', 'version', 'currency', 'sources', 'sinks'], 'chime-ledger.json');
  const version = int(doc['version'], 'chime-ledger.json.version');
  const currencyAt = 'chime-ledger.json.currency';
  const currency = record(doc['currency'], currencyAt);
  strict(currency, ['id', 'one', 'many'], currencyAt);
  const table: ChimeLedgerTable = {
    version,
    currency: {
      id: str(currency['id'], `${currencyAt}.id`),
      one: str(currency['one'], `${currencyAt}.one`),
      many: str(currency['many'], `${currencyAt}.many`),
    },
    sources: list(doc['sources'], 'sources').map((entry, index) =>
      parseSource(entry, `sources[${String(index)}]`),
    ),
    sinks: list(doc['sinks'], 'sinks').map((entry, index) => parseSink(entry, `sinks[${String(index)}]`)),
  };

  const violations = violationsInChimeLedger(table);
  if (violations.length > 0) {
    throw new ChimeLedgerError(
      `data/chime-ledger.json is not a usable ledger:\n  ${violations.join('\n  ')}`,
    );
  }
  return table;
}

/**
 * Every rule the table must satisfy, as a list rather than a throw.
 *
 * Exported so a test can assert the **positive control** — that a deliberately broken table is
 * caught — without constructing a file on disk. `pricing/parse.ts#violationsIn` says why in one
 * line: *a validator nobody has watched fail is a validator nobody knows works.*
 */
export function violationsInChimeLedger(table: ChimeLedgerTable): readonly string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const source of table.sources) {
    if (seen.has(source.id)) found.push(`two sources share the id "${source.id}".`);
    seen.add(source.id);
  }
  for (const sink of table.sinks) {
    if (seen.has(sink.id)) {
      found.push(
        `"${sink.id}" is both a source and a sink. One name for two directions is how a spend ` +
          'gets recorded as an earn.',
      );
    }
    seen.add(sink.id);
  }

  const inSchema = (value: number, schema: ChimeSchema, what: string): void => {
    if (value < schema.min || value > schema.max) {
      found.push(`${what} is ${String(value)}, outside its own declared range ${String(schema.min)}–${String(schema.max)}.`);
    }
  };

  const claimed = new Map<string, string>();
  for (const source of table.sources) {
    if (source.awardChimes < 1) {
      found.push(`source "${source.id}" awards ${String(source.awardChimes)}. An award is at least one chime.`);
    }
    inSchema(source.awardChimes, source.schema, `source "${source.id}"'s award`);

    if (source.earnedBy === 'completion') {
      if (source.completion === undefined) {
        found.push(`source "${source.id}" is earned by a completion and names none.`);
      } else if (!(CHIME_COMPLETIONS as readonly string[]).includes(source.completion)) {
        found.push(
          `source "${source.id}" names the completion "${source.completion}", which the play ` +
            'surface cannot post. The completions are ' + CHIME_COMPLETIONS.join(', ') + '.',
        );
      } else {
        const already = claimed.get(source.completion);
        if (already !== undefined) {
          found.push(
            `"${source.completion}" is claimed by both "${already}" and "${source.id}". One ` +
              'completion pays one award, or a turn is worth whichever source is read first.',
          );
        }
        claimed.set(source.completion, source.id);
      }
      if (source.awayHours !== undefined) {
        found.push(`source "${source.id}" is a completion and declares awayHours. Only a gift waits.`);
      }
    } else {
      if (source.completion !== undefined) {
        found.push(
          `source "${source.id}" is a gift and names a completion. A gift with a completion is a ` +
            'gift the play surface can ask for, which is not a gift.',
        );
      }
      if (source.awayHours === undefined || source.awayHours < 1) {
        found.push(`source "${source.id}" is a gift and declares no whole hours away.`);
      }
      if (source.bands.length > 0) {
        found.push(`source "${source.id}" is a gift and carries bands. A gift is flat — D531.`);
      }
    }

    const bandIds = new Set<string>();
    for (const band of source.bands) {
      if (bandIds.has(band.id)) found.push(`source "${source.id}" has two "${band.id}" bands.`);
      bandIds.add(band.id);
      if (band.awardChimes < 1) {
        found.push(`band "${band.id}" of "${source.id}" awards ${String(band.awardChimes)}.`);
      }
      inSchema(band.awardChimes, source.schema, `band "${band.id}" of "${source.id}"`);
    }
  }

  for (const completion of CHIME_COMPLETIONS) {
    if (!claimed.has(completion)) {
      found.push(
        `nothing pays "${completion}". A completion the play surface can post and the ledger ` +
          'cannot price is a turn that silently earns nothing.',
      );
    }
  }

  const sinkIds = new Set<string>();
  for (const sink of table.sinks) {
    if (sinkIds.has(sink.id)) found.push(`two sinks share the id "${sink.id}".`);
    sinkIds.add(sink.id);
    if (sink.priceChimes < 1) {
      found.push(
        `sink "${sink.id}" costs ${String(sink.priceChimes)}. A modifier that costs nothing is a ` +
          'modifier the balance does not bound, which is a wider budget with no spend behind it.',
      );
    }
    inSchema(sink.priceChimes, sink.schema, `sink "${sink.id}"'s price`);
    if (sink.maxSteps < 1) found.push(`sink "${sink.id}" allows ${String(sink.maxSteps)} steps.`);
    if (sink.modifier.kind === 'prefit') {
      if (sink.modifier.grantUnits !== 0) {
        found.push(`sink "${sink.id}" pre-fits and grants units. A building is fitted or it is not.`);
      }
      if (sink.maxSteps !== 1) found.push(`sink "${sink.id}" pre-fits more than once.`);
    } else if (sink.modifier.grantUnits < 1) {
      found.push(`sink "${sink.id}" grants ${String(sink.modifier.grantUnits)} units and is not free.`);
    }
  }
  if (table.sinks.length === 0) {
    found.push('nothing can be spent on. A balance with no sink is a score.');
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * Asking
 * -------------------------------------------------------------------------- */

/**
 * What one completion pays, in whole chimes — **and there is no argument for an amount.**
 *
 * This is the whole of the earn verb, and its shape is the reason a purchase cannot be bolted on
 * without a new function: a caller names a turn it finished and a band the scenario declared, and
 * the table decides what that is worth. Nothing here accepts a number from a caller, so no caller
 * can be handed one to pass on. See this module's docstring, clause 3.
 *
 * `undefined` when the completion is not in {@link CHIME_COMPLETIONS} or nothing claims it — which
 * {@link violationsInChimeLedger} makes unreachable for a table that parsed, and which is still
 * returned rather than thrown so a caller that reaches it refuses rather than guesses.
 */
export function chimeAwardFor(
  table: ChimeLedgerTable,
  completion: string,
  bandId?: string | undefined,
): number | undefined {
  const source = table.sources.find(
    (candidate) => candidate.earnedBy === 'completion' && candidate.completion === completion,
  );
  if (source === undefined) return undefined;
  if (bandId === undefined) return source.awardChimes;
  return source.bands.find((band) => band.id === bandId)?.awardChimes;
}

/** The gift source, or `undefined` if this table ships none. Server-only: a gift has no completion. */
export function chimeGiftSource(table: ChimeLedgerTable): ChimeSource | undefined {
  return table.sources.find((source) => source.earnedBy === 'gift');
}

/** One sink by id, or `undefined` — the play surface asks this to draw a price. */
export function chimeSinkById(table: ChimeLedgerTable, id: string): ChimeSink | undefined {
  return table.sinks.find((sink) => sink.id === id);
}

/**
 * What `steps` of one sink cost, or `undefined` if that many may not be bought.
 *
 * A step is a whole purchase of the sink, so the price is linear and the cap is
 * {@link ChimeSink.maxSteps}. Refusing above the cap here rather than clamping is deliberate: a
 * clamp would let a client ask for ten steps, be given four, and be charged for four it did not
 * choose — which is the shape of a transaction nobody agreed to.
 */
export function chimeSpendPrice(sink: ChimeSink, steps: number): number | undefined {
  if (!Number.isInteger(steps) || steps < 1 || steps > sink.maxSteps) return undefined;
  return sink.priceChimes * steps;
}

/** What `steps` of one sink grant, in units. `0` for a kind that grants none. */
export function chimeGrantUnits(sink: ChimeSink, steps: number): number {
  if (!Number.isInteger(steps) || steps < 1 || steps > sink.maxSteps) return 0;
  return sink.modifier.grantUnits * steps;
}
