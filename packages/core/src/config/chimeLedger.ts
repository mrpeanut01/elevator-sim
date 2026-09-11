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
 * only thing allowed to decide what an entry is worth, and the viewer, which draws a sink's price.
 * (This sentence used to add *"and keeps a device-only ledger when there is no account"*. **There is
 * no device ledger** — `everyday/profile.ts` owns `localStorage` and holds no chime — and that
 * clause was the same false mechanism the panel's own copy was corrected for. The module still
 * belongs here for the rest of the argument: the viewer really does draw prices.)
 * `packages/server` cannot import
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
 * One finished turn, as the play surface posts it — GitHub issue **#499**, the product owner's
 * ruling of 2026-09-10: *first time only*.
 *
 * A scenario pays once per account and a rush pays only the waves beyond the account's best, so the
 * earn verb has to be told **which** scenario and **how far** — and neither is a source or an
 * amount, which is the line [§ D526](../../../../DECISIONS.md) clause 5 draws. A scenario id says
 * what was cleared and the ledger still decides what that is worth; a wave count says how many turns
 * a rush finished and the ledger still pays each one the table's flat award. No member carries a
 * figure a run measured, and none can name a chime.
 *
 * - `scenarioId` is a week contract's id or a fix case's (`data/contract-ladder.json`,
 *   `data/fixit-cases.json`). The server refuses one those documents do not name.
 * - `waves` is how many whole waves the rush **outlasted** before its breaking point; the wave the
 *   line was crossed in was reached and not survived. The server refuses a count above the waves the
 *   stream generates.
 * - A contract day carries nothing. The ruling does not reach it, and each posted day still pays.
 *
 * **What the server cannot check, stated rather than hidden:** that the clear happened, or that the
 * run reached the waves it claims. Nothing replays a scenario clear or a rush result before paying
 * it — a rush result's replay is GitHub issue #372's — so these fields are believed within their
 * bounds, and first-time-only is what caps what believing them can cost.
 */
export type ChimeTurn =
  | { readonly completion: 'scenario-cleared'; readonly scenarioId: string }
  | { readonly completion: 'career-day-paid' }
  | { readonly completion: 'rush-wave-survived'; readonly waves: number };

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
 *
 * ## The one of the four that is **not** here, and the absence is the rule
 *
 * *A scenario's budget up* is missing on purpose. `docs/38` § 2.1 says a budget is bought up *"in
 * steps **the scenario authors**"*, and the scenario does author them: `data/campaign.json` carries
 * a `budget.steps` ladder per stage, each step with its own `addsUnits` and its own `chimes`, read
 * by `packages/viz/src/scenario/budget.ts`. `data/scenario-survivors.json` then pre-simulates a
 * survivor count against **those** rungs and records the `chimesSpent` of each.
 *
 * So a `budget-units` sink here would be a **second authority for a price that is already
 * authored**, which is the defect this module's own docstring spends a paragraph refusing: *a
 * player pays a different amount depending on which screen they are standing on … across a network
 * boundary that stops being a display defect and becomes an authority defect.* It shipped anyway —
 * a `scenario-budget-step` at 12 chimes for 8 units against the ladder's flat one chime per unit —
 * and was caught by a reader rather than by a run, so the refusal is now mechanical:
 * {@link REFUSED_MODIFIER_KINDS} names it and {@link parseChimeLedger} throws on it.
 *
 * **Why the ledger cannot simply price the rung instead, with the file and the line.** The rung is
 * per scenario and per step, and the only parser for it is
 * `packages/viz/src/scenario/budget.ts#decodeScenarioBudget` — in `packages/viz`, which
 * `packages/server` may not import (`CLAUDE.md` invariant 6, and `boundaries.test.ts` asserts it).
 * The server therefore has no way to resolve *(scenarioId, stepId) → chimes* without a second copy
 * of the ladder, which is the authority defect again. Moving that parser into `core` is what would
 * let a scenario rung be bought through the ledger; it is `#365`'s file and not this one's.
 */
export const CHIME_MODIFIER_KINDS = ['purse-units', 'prefit'] as const;

/** One member of {@link CHIME_MODIFIER_KINDS}. */
export type ChimeModifierKind = (typeof CHIME_MODIFIER_KINDS)[number];

/**
 * Kinds that are refused **by name**, with the document that owns the price named in the message.
 *
 * Kept apart from the unknown-kind refusal deliberately. *`unlock-building` is not something a
 * chime buys* and *a budget is priced by the scenario, not here* are different sentences, and an
 * author who reaches for the second one is not making a mistake about what chimes are for — they
 * are about to duplicate a price. Telling them which file already holds it is the whole value.
 */
export const REFUSED_MODIFIER_KINDS: Readonly<Record<string, string>> = Object.freeze({
  'budget-units':
    'a scenario budget is priced by the scenario itself. data/campaign.json authors a budget.steps ' +
    'ladder per stage, each step with its own addsUnits and its own chimes, and ' +
    'data/scenario-survivors.json pre-simulates a survivor count against those rungs. A price here ' +
    'as well is a second authority for one act, which is the defect chimeLedger.ts refuses at ' +
    'length: a player pays a different amount depending on which screen they are standing on.',
});

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
  readonly unit: ChimeSchemaUnit;
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

/**
 * What an invariant-8 schema on this table can be denominated in.
 *
 * **`chimes` is the only currency**, and the other three are counts rather than currencies: `units`
 * is budget or purse units inside one run, `steps` is how many times a sink may be bought, `hours`
 * is how long a gift waits. None of them is spendable outside the game, which is the line
 * [§ D526](../../../../DECISIONS.md) clause 6 draws — a money unit has no spelling here and adding
 * one is the change a reviewer refuses.
 */
export const CHIME_SCHEMA_UNITS = ['chimes', 'units', 'steps', 'hours'] as const;

/** One member of {@link CHIME_SCHEMA_UNITS}. */
export type ChimeSchemaUnit = (typeof CHIME_SCHEMA_UNITS)[number];

/**
 * **There is no band, and the withdrawal is the record** — the review of PR #485, medium 7.
 *
 * A `bands` array shipped on `earn-scenario-clear`, paying 4, 6 or 10 chimes by a scenario's
 * *survivor-count band*, and `chimes/ledger.ts` described that band as *"a property of the scenario
 * … known before anybody plays"*. It was not. The band arrived **verbatim in the request body**
 * (`http/api.ts`'s earn route), `data/scenario-survivors.json` carries survivor **counts** and no
 * band at all, nothing the earn route reads maps a count to one, and the server was not then told which
 * scenario was cleared (since GitHub issue #499 it is told a scenario id, which pays a scenario once
 * and maps to no band). A client could post `single` on the easiest scenario and be paid 10 instead
 * of 4. (A survivor band does exist since GitHub issue #234 — `data/scenario-survivor-bands.json`, a
 * **difficulty** band per ladder position, drafted for the owner's approval, whose only reader is a
 * viz acceptance check ([§ D537](../../../../DECISIONS.md)). It is on no scenario's pinned record, and
 * nothing that pays reads it.)
 *
 * [§ D256](../../../../DECISIONS.md) is the rule that decides what to do about that: a stated
 * mechanism is either measured or withdrawn, and offering a second plausible sentence in its place
 * is the same defect with new wording. So the band is **withdrawn** rather than re-described, the
 * award is flat, and {@link parseChimeLedger} refuses the key by name so it cannot return without
 * the mapping arriving with it. What would bring it back, in order: a band on each scenario's
 * pinned record (or a boundary table that turns `survivors` into one), a scenario id on the earn,
 * and the server resolving the band from the record rather than from the request.
 */

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
  readonly note: string;
  /** What the award may be tuned to — `CLAUDE.md` invariant 8. */
  readonly schema: ChimeSchema;
  /**
   * What {@link awayHours} may be tuned to. Present exactly when {@link awayHours} is.
   *
   * Invariant 8 asks a schema of *anything tunable*, and a gift's waiting time is as tunable as its
   * award: a generic optimiser could search it, and the review of PR #485 named it as one of three
   * that declared none.
   */
  readonly awaySchema: ChimeSchema | undefined;
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
  /**
   * How many times **one run** may buy this. At least one; a scenario cannot be bought down to free.
   *
   * Enforced in two places, and the second was missing until the review of PR #485: `chimeSpendPrice`
   * refuses a spend above it, and `chimes/ledger.ts#unbackedModifiers` refuses a **claim** above it.
   * Without the second, two spends at the cap let one run claim twice the cap.
   */
  readonly maxSteps: number;
  readonly note: string;
  /** What the price may be tuned to — `CLAUDE.md` invariant 8. */
  readonly schema: ChimeSchema;
  /** What {@link ChimeModifier.grantUnits} may be tuned to. Invariant 8 again, and see {@link stepSchema}. */
  readonly grantSchema: ChimeSchema;
  /**
   * What {@link maxSteps} may be tuned to.
   *
   * Three tunables on this table declared no schema — this, {@link grantSchema}'s field and a
   * gift's `awayHours` — while the awards and the prices beside them did. Invariant 8 does not say
   * *the figures somebody remembered*; it says *anything tunable*, and a cap a designer moves to
   * pace a ladder is exactly that.
   */
  readonly stepSchema: ChimeSchema;
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

/**
 * One invariant-8 schema, denominated in the unit its own field is measured in.
 *
 * `chimes` for an award and a price; `units` for what a step grants; `steps` for a cap; `hours` for
 * how long a gift waits. The unit is passed in rather than read and believed, so a schema cannot
 * quietly re-denominate the field it describes — and **`chimes` is still the only currency the
 * document may name**, which is the half [§ D530](../../../../DECISIONS.md) and
 * [§ D526](../../../../DECISIONS.md) clause 6 turn on: a ledger denominated in anything spendable
 * outside the game is the conversion clause 6 refuses. `units`, `steps` and `hours` are counts of
 * things inside one run, not currencies, and none of them is spendable anywhere.
 */
function parseSchema(raw: unknown, where: string, unit: ChimeSchemaUnit): ChimeSchema {
  const entry = record(raw, where);
  strict(entry, ['type', 'unit', 'min', 'max', 'default'], where);
  const type = str(entry['type'], `${where}.type`);
  const declared = str(entry['unit'], `${where}.unit`);
  if (type !== 'integer') throw new ChimeLedgerError(`${where}.type: only "integer" is a chime.`);
  if (declared !== unit) {
    throw new ChimeLedgerError(
      `${where}.unit: this schema describes a field measured in "${unit}" and declares ` +
        `"${declared}". Only "chimes" is a chime: units are money inside a mode and stay so ` +
        '(DECISIONS.md D530), and a ledger that could be denominated in anything else is the ' +
        'conversion D526 clause 6 refuses.',
    );
  }
  return {
    type: 'integer',
    unit,
    min: int(entry['min'], `${where}.min`),
    max: int(entry['max'], `${where}.max`),
    default: int(entry['default'], `${where}.default`),
  };
}

function parseSource(raw: unknown, where: string): ChimeSource {
  const entry = record(raw, where);
  /*
   * `bands` is refused **before** the strict check so that the message says why rather than saying
   * *unrecognised key* — see {@link ChimeSource}'s neighbours for the withdrawal and what would
   * have to exist before a band could come back.
   */
  if (entry['bands'] !== undefined) {
    throw new ChimeLedgerError(
      `${where}.bands: an award may not be banded. Nothing the earn route reads maps a survivor ` +
        'count to a band: data/scenario-survivors.json carries counts and no band, the one survivor ' +
        'band in the tree (data/scenario-survivor-bands.json) is a drafted difficulty band whose only ' +
        'reader is an acceptance check, and nothing maps the scenario id the earn route is told to one ' +
        '— so a band could only arrive from the client that is paid for it. ' +
        'DECISIONS.md D256: a stated mechanism is measured or withdrawn, never re-worded.',
    );
  }
  strict(
    entry,
    ['id', 'name', 'earnedBy', 'completion', 'awayHours', 'awardChimes', 'note', 'schema', 'awaySchema'],
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
  const awaySchemaRaw = entry['awaySchema'];
  return {
    id: str(entry['id'], `${where}.id`),
    name: str(entry['name'], `${where}.name`),
    earnedBy: earnedBy as ChimeEarnedBy,
    completion:
      completionRaw === undefined ? undefined : (str(completionRaw, `${where}.completion`) as ChimeCompletion),
    awayHours: awayRaw === undefined ? undefined : int(awayRaw, `${where}.awayHours`),
    awardChimes: int(entry['awardChimes'], `${where}.awardChimes`),
    note: str(entry['note'], `${where}.note`),
    schema: parseSchema(entry['schema'], `${where}.schema`, 'chimes'),
    awaySchema:
      awaySchemaRaw === undefined ? undefined : parseSchema(awaySchemaRaw, `${where}.awaySchema`, 'hours'),
  };
}

function parseSink(raw: unknown, where: string): ChimeSink {
  const entry = record(raw, where);
  strict(
    entry,
    ['id', 'name', 'priceChimes', 'modifier', 'maxSteps', 'note', 'schema', 'grantSchema', 'stepSchema'],
    where,
  );
  const modifierAt = `${where}.modifier`;
  const modifier = record(entry['modifier'], modifierAt);
  strict(modifier, ['kind', 'grantUnits'], modifierAt);
  const kind = str(modifier['kind'], `${modifierAt}.kind`);
  const refused = REFUSED_MODIFIER_KINDS[kind];
  if (refused !== undefined) {
    throw new ChimeLedgerError(`${modifierAt}.kind: "${kind}" may not be priced here — ${refused}`);
  }
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
    schema: parseSchema(entry['schema'], `${where}.schema`, 'chimes'),
    grantSchema: parseSchema(entry['grantSchema'], `${where}.grantSchema`, 'units'),
    stepSchema: parseSchema(entry['stepSchema'], `${where}.stepSchema`, 'steps'),
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
    }

    /*
     * Invariant 8 on the waiting time, both ways: a gift must declare one and a completion must
     * not, or a schema would be describing a field that is not there.
     */
    if (source.awayHours === undefined) {
      if (source.awaySchema !== undefined) {
        found.push(`source "${source.id}" declares an awaySchema and no awayHours to schedule.`);
      }
    } else if (source.awaySchema === undefined) {
      found.push(
        `source "${source.id}" waits ${String(source.awayHours)} hours and declares no schema for ` +
          'it. CLAUDE.md invariant 8: anything tunable declares its type, range and default.',
      );
    } else {
      inSchema(source.awayHours, source.awaySchema, `source "${source.id}"'s awayHours`);
      if (source.awaySchema.default !== source.awayHours) {
        found.push(
          `source "${source.id}"'s awaySchema defaults to ${String(source.awaySchema.default)} and ` +
            `the shipped value is ${String(source.awayHours)}. The default is the shipped figure, ` +
            'not a second opinion.',
        );
      }
    }
    if (source.schema.default !== source.awardChimes) {
      found.push(
        `source "${source.id}"'s schema defaults to ${String(source.schema.default)} and it awards ` +
          `${String(source.awardChimes)}. The default is the shipped figure, not a second opinion.`,
      );
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
    inSchema(sink.modifier.grantUnits, sink.grantSchema, `sink "${sink.id}"'s grantUnits`);
    inSchema(sink.maxSteps, sink.stepSchema, `sink "${sink.id}"'s maxSteps`);
    /*
     * The default is the shipped figure — `pricing/parse.ts`'s rule, applied to all three. A
     * schema whose default disagrees with the value beside it is two answers to *what does this
     * ship as*, and a generic optimiser reading the schema would search around the wrong one.
     */
    for (const [what, value, schema] of [
      ['price', sink.priceChimes, sink.schema],
      ['grantUnits', sink.modifier.grantUnits, sink.grantSchema],
      ['maxSteps', sink.maxSteps, sink.stepSchema],
    ] as const) {
      if (schema.default !== value) {
        found.push(
          `sink "${sink.id}"'s ${what} schema defaults to ${String(schema.default)} and the ` +
            `shipped value is ${String(value)}. The default is the shipped figure, not a second opinion.`,
        );
      }
    }
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
 *
 * **Flat, and there is no second argument.** It took a `bandId` and paid a scenario more for being
 * hard; the band was taken from the request body of the account being paid. See {@link ChimeSource}'s
 * neighbouring docstring for the withdrawal and what would have to exist before an award may vary
 * again — the shape to notice is that the argument is gone rather than validated, because a
 * validated band is still a band the client chose.
 */
export function chimeAwardFor(table: ChimeLedgerTable, completion: string): number | undefined {
  return table.sources.find(
    (candidate) => candidate.earnedBy === 'completion' && candidate.completion === completion,
  )?.awardChimes;
}

/**
 * The table **without its sources** — what a play-side module is allowed to hold.
 *
 * [§ D526](../../../../DECISIONS.md) clause 5 says the play surface never learns a source, and
 * `packages/viz/src/boundaries.test.ts` greps for source **ids**. The review of PR #485 showed that
 * grep being defeated by a property access: the panel imported the whole document, exported the
 * parsed table, and `CHIME_LEDGER.sources[i].name` would have drawn a source's name to a player
 * with nothing going red. A grep over names cannot catch a grep-free path to the same data, so the
 * data is removed instead — this is what a play-side module imports, and there is no `sources` on
 * it to reach.
 */
export interface ChimeSpendTable {
  readonly currency: ChimeCurrency;
  readonly sinks: readonly ChimeSink[];
}

/**
 * Project a parsed table down to {@link ChimeSpendTable}.
 *
 * Deliberately the only way across: a play-side module calls this on the parse expression itself,
 * so no binding on that side ever holds a table with sources on it.
 */
export function chimeSpendTableOf(table: ChimeLedgerTable): ChimeSpendTable {
  return Object.freeze({ currency: table.currency, sinks: table.sinks });
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
