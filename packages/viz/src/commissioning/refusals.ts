/**
 * What the commissioning screen refuses, and why — in words beside the control rather than in a
 * console.
 *
 * ## The gates are read from `core`, not re-implemented here
 *
 * `data/elevator-specs.json` declares five envelopes per class — the rated-speed band, the rated
 * load range, `maxRiseM`, `maxFloors` and (on the double-deck classes) `doubleDeckPersonsPerDeck` —
 * and `core/src/config/parse.ts` already checks every one of them, with a dedicated warning code
 * each. So this module does not check them. It **builds the edited building, hands it to the
 * loader, and reads the loader's verdict**, keeping any warning the as-built building did not
 * already raise.
 *
 * That is `shift/growth.ts`'s rule turned around. Growth asserts it introduces *no warning the
 * shipped building did not already have*; commissioning **refuses on exactly those warnings**. One
 * implementation of each gate, in the package that owns it, and a sixth envelope added to `core`
 * becomes a refusal here on the day it lands rather than on the day somebody remembers.
 *
 * ## They are refusals here and advisories there, and that is deliberate
 *
 * `parse.ts` says so in its own message: *"the reference envelope is application guidance, not a
 * hard limit"*, and it is right — a building authored elsewhere, describing hardware that really
 * was installed outside its class, must still load and still run. But commissioning is the moment a
 * player **specifies** a machine, and a design phase that shrugged at a class rated for 18 m in a
 * 60 m shaft would be offering a choice whose figures describe a machine nobody can commission.
 * The loader keeps its advisory; this screen does not offer the choice.
 *
 * ## Three refusals `core` knows nothing about
 *
 * - **Out of scope** — the dimension moved and the constraint does not open it. This is
 *   `campaign/dimensions.ts`'s refusal, and the whole of *retrofit*: with an empty editable set,
 *   every fabric dimension refuses here and dispatch — which is not a dimension of this module at
 *   all — is left to the shift week's own controls.
 * - **Over budget** — the configuration commits more capital than the constraint allows. A limit on
 *   what may be chosen; see `types.ts` for the three things it may never become.
 * - **A mixed fleet** — the bank's shipped cars are not all the same machine, so one class and one
 *   speed cannot describe it without deleting the difference. Two shipped buildings raise this.
 */

import {
  WARNING_CODES,
  parseBuilding,
  resolveBuilding,
  type BuildingConfig,
  type ConfigWarning,
  type ElevatorSpecs,
} from '@elevator-sim/core/browser';

import {
  asBuiltChoices,
  budgetFor,
  capitalOf,
  choiceForBank,
  mixedFleetBanks,
  movedChoiceText,
  movedChoices,
  type MovedChoice,
} from './choices.js';
import { commissionedBuilding } from './building.js';
import {
  DIMENSION_LABELS,
  classById,
  isDoubleDeckClass,
  type CapitalConstraint,
  type CommissionableClass,
  type CommissioningChoices,
  type CommissioningDimension,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The shape of a refusal
 * -------------------------------------------------------------------------- */

/**
 * Which control a refusal belongs beside.
 *
 * `'constraint'` is the one that belongs to no single control — the budget and the scope of the
 * constraint itself. Everything else names one of the three dimensions, so a screen can put the
 * sentence under the control that caused it. A refusal a player has to go hunting for is a console
 * message with better typography.
 */
export type RefusalSite = CommissioningDimension | 'constraint';

export interface CommissioningRefusal {
  readonly site: RefusalSite;
  /** The bank the refusal is about, or `null` for one about the whole configuration. */
  readonly bankId: string | null;
  /** Stable machine-readable kind. `core`'s own warning code where the gate is `core`'s. */
  readonly code: string;
  /** What is wrong and what to do about it, in one sentence a player can act on. */
  readonly message: string;
}

export interface CommissioningReview {
  /** False when anything refused. A screen may still draw the choices; a run may not use them. */
  readonly admissible: boolean;
  /** Every dimension this choice set moves, in bank then dimension order. */
  readonly moved: readonly MovedChoice[];
  /** The moves the constraint opens. Possibly empty. */
  readonly withinScope: readonly MovedChoice[];
  /** The moves it does not. Non-empty exactly when a scope refusal is present. */
  readonly outOfScope: readonly MovedChoice[];
  readonly refusals: readonly CommissioningRefusal[];
  /** What this configuration commits. A limit, never a metric — see `types.ts`. */
  readonly capitalUnits: number;
  /** What the constraint allows on this building. */
  readonly budgetUnits: number;
  /** The one sentence the constraint says about this configuration. */
  readonly sentence: string;
}

export interface CommissioningReviewInput {
  readonly base: BuildingConfig;
  readonly choices: CommissioningChoices;
  readonly classes: readonly CommissionableClass[];
  /**
   * The specs the building will resolve against — **already widened** by any class the reader
   * saved, exactly as `dev/state.ts` widens them before the run. A review run against the shipped
   * six while the run uses seven would refuse a choice the week then honours.
   */
  readonly specs: ElevatorSpecs;
  readonly constraint: CapitalConstraint;
}

/* -------------------------------------------------------------------------- *
 * The review
 * -------------------------------------------------------------------------- */

/**
 * Is this a configuration the week may open on?
 *
 * Pure, and it simulates nothing: it loads the edited building and reads diagnostics. Nothing about
 * being admissible says a configuration is **good** — this function never orders two admissible
 * choices, and there is no surface in this product that may.
 */
export function reviewCommissioning(input: CommissioningReviewInput): CommissioningReview {
  const { base, choices, classes, constraint } = input;
  const asBuilt = asBuiltChoices(base, classes);
  const moved = movedChoices(asBuilt, choices);
  const editable = new Set<CommissioningDimension>(constraint.editable);
  const withinScope = moved.filter((entry) => editable.has(entry.dimension));
  const outOfScope = moved.filter((entry) => !editable.has(entry.dimension));

  const refusals: CommissioningRefusal[] = [
    ...outOfScope.map((entry) => scopeRefusal(entry, constraint)),
    ...mixedFleetRefusals(base, moved),
    ...structuralRefusals(choices, classes, moved),
    ...deckRefusals(base, choices, classes, moved),
  ];

  /*
   * Every bank, not just the chosen ones. A choice set that names one bank of Vertical City's
   * seven is a legal value — absence means *not decided* — so a capital figure summed over the
   * choices alone would report a seven-bank tower as costing one bank, and the budget would gate
   * nothing on exactly the buildings where it matters most.
   */
  const effective = asBuilt.map((built) => choiceForBank(choices, built.bankId) ?? built);
  const capitalUnits = capitalOf(effective, classes);
  const budgetUnits = budgetFor(constraint, base, classes);
  if (capitalUnits > budgetUnits) {
    refusals.push({
      site: 'constraint',
      bankId: null,
      code: 'over-budget',
      message:
        `${constraint.label} allows ${String(budgetUnits)} capital units on this building and this ` +
        `configuration commits ${String(capitalUnits)}. Take ${String(capitalUnits - budgetUnits)} ` +
        'units back out — a shaft, a slower machine, or a class rated for less rise than this one.',
    });
  }

  refusals.push(...loaderRefusals(input, moved));
  const distinct = deduplicated(refusals);

  return {
    admissible: distinct.length === 0,
    moved,
    withinScope,
    outOfScope,
    refusals: distinct,
    capitalUnits,
    budgetUnits,
    sentence: sentenceFor(constraint, moved, distinct, capitalUnits, budgetUnits),
  };
}

/**
 * One sentence per thing that is wrong, not one per car it is wrong on.
 *
 * `core` locates a speed-band or capacity diagnostic **per car**, correctly — it is validating a
 * document and the document has four cars. A commissioning screen has one speed control for the
 * bank, so the same four diagnostics arrive as four copies of one sentence beside one control, and
 * a player reading four identical paragraphs learns nothing the first one did not say. `parse.ts`
 * already draws this distinction for the rise and floor gates in its own words — *"envelope checks
 * belong to the shaft, so they are reported once per class in the bank rather than once per car"* —
 * and this is that rule applied to the two gates it does not cover.
 *
 * Keyed on the **message**, not on the code, so two banks refusing for the same reason still
 * produce two sentences. Order is preserved: the first occurrence stays where it was.
 */
function deduplicated(refusals: readonly CommissioningRefusal[]): readonly CommissioningRefusal[] {
  const seen = new Set<string>();
  const distinct: CommissioningRefusal[] = [];
  for (const refusal of refusals) {
    const key = `${refusal.site}|${refusal.bankId ?? ''}|${refusal.code}|${refusal.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(refusal);
  }
  return Object.freeze(distinct);
}

/* -------------------------------------------------------------------------- *
 * The refusals this module owns
 * -------------------------------------------------------------------------- */

function scopeRefusal(entry: MovedChoice, constraint: CapitalConstraint): CommissioningRefusal {
  const label = DIMENSION_LABELS[entry.dimension];
  return {
    site: entry.dimension,
    bankId: entry.bankId,
    code: 'out-of-scope',
    message:
      `${constraint.label} does not open the ${label} of the ${entry.bankId} bank, and this ` +
      `configuration moves it (${movedChoiceText(entry)}). ${constraint.note}`,
  };
}

/**
 * A bank whose shipped cars are not all the same machine.
 *
 * Raised once per moved dimension on such a bank, so the sentence lands beside whichever control
 * the player touched. Both shipped instances are deliberate authoring — a hotel's slower service
 * car, a hospital's bed car — so the refusal names what would be overwritten rather than telling
 * the player the building is wrong.
 */
function mixedFleetRefusals(
  base: BuildingConfig,
  moved: readonly MovedChoice[],
): readonly CommissioningRefusal[] {
  const mixed = new Set(mixedFleetBanks(base));
  return moved
    .filter((entry) => mixed.has(entry.bankId))
    .map((entry) => ({
      site: entry.dimension,
      bankId: entry.bankId,
      code: 'mixed-fleet',
      message:
        `The ${entry.bankId} bank was built with more than one machine in it, and this screen ` +
        `describes a bank with one. Moving its ${DIMENSION_LABELS[entry.dimension]} would rebuild ` +
        'every car in the bank to match, so the choice is not offered here; the building editor is ' +
        'where a car is specified on its own.',
    }));
}

/** The two things a choice can say that no loader is ever handed: no shafts, and no such class. */
function structuralRefusals(
  choices: CommissioningChoices,
  classes: readonly CommissionableClass[],
  moved: readonly MovedChoice[],
): readonly CommissioningRefusal[] {
  const touched = new Set(moved.map((entry) => entry.bankId));
  const refusals: CommissioningRefusal[] = [];
  for (const choice of choices) {
    if (!touched.has(choice.bankId)) continue;
    if (!Number.isFinite(choice.shafts) || choice.shafts < 1) {
      refusals.push({
        site: 'shafts',
        bankId: choice.bankId,
        code: 'no-shafts',
        message:
          `The ${choice.bankId} bank needs at least one shaft. With none, the floors it serves ` +
          'are floors nobody can reach, which is a different building rather than a smaller one.',
      });
    }
    if (classById(classes, choice.machineClassId) === undefined) {
      refusals.push({
        site: 'machineClass',
        bankId: choice.bankId,
        code: 'unknown-class',
        message:
          `There is no machine class "${choice.machineClassId}". Pick one of the classes ` +
          'data/elevator-specs.json ships, or one you saved in the machine editor.',
      });
    }
  }
  return refusals;
}

/**
 * The third gate: a double-deck class in a bank with no floor pairs.
 *
 * **Raised here rather than read from the loader, and the reason is worth stating**, because every
 * other envelope in this file is read from `core` on principle. `core` has two answers to this
 * configuration and a player is handed neither. Mark the car `doubleDeck` with no `deckSeparationM`
 * and the answer is the issue `deck-configuration`, which makes the building **unloadable** — so
 * `building.ts` cannot emit that config without breaking its own contract. Commission it as a
 * single deck instead, which is what `missing-floor-pairs` says the runtime does anyway, and the
 * building loads with no diagnostic at all: `core` is not wrong to be quiet, because at that point
 * nothing in the document says anybody wanted two decks. The **choice** said so, and the choice is
 * the thing only this module can see.
 *
 * What makes a class double-deck is still read from data — `doubleDeckPersonsPerDeck` in
 * `data/elevator-specs.json`, through {@link isDoubleDeckClass}. No class id appears here.
 */
function deckRefusals(
  base: BuildingConfig,
  choices: CommissioningChoices,
  classes: readonly CommissionableClass[],
  moved: readonly MovedChoice[],
): readonly CommissioningRefusal[] {
  const touched = new Set(moved.map((entry) => entry.bankId));
  const refusals: CommissioningRefusal[] = [];
  for (const choice of choices) {
    if (!touched.has(choice.bankId)) continue;
    const machineClass = classById(classes, choice.machineClassId);
    if (machineClass === undefined || !isDoubleDeckClass(machineClass)) continue;
    const bank = base.banks.find((entry) => entry.id === choice.bankId);
    if (bank === undefined || (bank.servesFloorPairs?.length ?? 0) > 0) continue;
    refusals.push({
      site: 'machineClass',
      bankId: choice.bankId,
      code: WARNING_CODES.missingFloorPairs,
      message:
        `${machineClass.name} is a double-deck class and the ${choice.bankId} bank declares no ` +
        'paired floors, so the second deck has nothing to open onto: the car would run as a single ' +
        'deck of the same whole-car capacity and make up to twice the stops the hardware would, and ' +
        'every round-trip figure the bank reported would describe a machine nobody configured. Pick ' +
        'a single-deck class, or a bank whose floors are paired.',
    });
  }
  return refusals;
}

/* -------------------------------------------------------------------------- *
 * The refusals `core` owns
 * -------------------------------------------------------------------------- */

/**
 * Every gate the loader raises on the edited building that it does not raise on the as-built one.
 *
 * A throw is a refusal too: `parseBuilding` and `resolveBuilding` throw a `ConfigError` listing
 * every problem, and a configuration the loader will not load is exactly a configuration the week
 * may not open on. Swallowing it into a generic *"try again"* would hide the only description of
 * the problem anybody has written.
 */
function loaderRefusals(
  input: CommissioningReviewInput,
  moved: readonly MovedChoice[],
): readonly CommissioningRefusal[] {
  const { base, choices, classes, specs } = input;
  if (moved.length === 0) return [];

  const edited = commissionedBuilding(base, choices, classes);
  if (edited === base) return [];

  let after: readonly ConfigWarning[];
  try {
    after = resolveBuilding(parseBuilding(edited as unknown), specs).warnings;
  } catch (error) {
    return [
      {
        site: 'constraint',
        bankId: null,
        code: 'loader-refused',
        message: `The loader will not build this configuration: ${messageOf(error)}`,
      },
    ];
  }

  const before = new Set(warningKeysOf(safeWarnings(base, specs)));
  return after
    .filter((warning) => !before.has(warningKey(warning)))
    .map((warning) => refusalFromWarning(warning, input));
}

function safeWarnings(base: BuildingConfig, specs: ElevatorSpecs): readonly ConfigWarning[] {
  try {
    return resolveBuilding(base, specs).warnings;
  } catch {
    return [];
  }
}

/**
 * What makes two diagnostics the same diagnostic.
 *
 * Code, path **and message** — and the message is load-bearing rather than belt-and-braces.
 * `midtown-office` ships with `rise-exceeds-class` on `banks[0].servesFloors` already: its main
 * bank spans 76.9 m from the garage to floor 20 and `geared-traction` is rated for 76. Keyed on
 * code and path alone, commissioning that bank as `hydraulic` — rated for **18 m** — raises the
 * same code at the same path and is therefore silently forgiven as pre-existing. The message names
 * the class and the limit, so it separates *the warning the building already had* from *a far worse
 * one the player just caused*, which is the whole distinction this filter exists to draw.
 */
const warningKey = (warning: ConfigWarning): string =>
  `${warning.code}|${warning.path}|${warning.message}`;

const warningKeysOf = (warnings: readonly ConfigWarning[]): readonly string[] =>
  warnings.map(warningKey);

/**
 * The bank a warning is about, read from the path the loader located it at.
 *
 * `banks[2].cars[0].ratedSpeedMps` names bank index 2. Positional rather than by id because that
 * is what `parse.ts` writes, and re-deriving it from the message would be parsing prose.
 */
function bankOf(warning: ConfigWarning, base: BuildingConfig): string | null {
  const match = /^banks\[(\d+)\]/.exec(warning.path);
  if (match === null) return null;
  const index = Number(match[1]);
  return base.banks[index]?.id ?? null;
}

/** Which control a `core` gate belongs beside. */
const SITE_BY_CODE: Readonly<Record<string, RefusalSite>> = Object.freeze({
  [WARNING_CODES.speedOutsideClassRange]: 'ratedSpeed',
  [WARNING_CODES.loadOutsideClassRange]: 'machineClass',
  [WARNING_CODES.riseExceedsClass]: 'machineClass',
  [WARNING_CODES.floorsExceedClass]: 'machineClass',
  [WARNING_CODES.missingFloorPairs]: 'machineClass',
  [WARNING_CODES.unusedFloorPairs]: 'machineClass',
  [WARNING_CODES.deckLoadMismatch]: 'machineClass',
  [WARNING_CODES.deckPersonsOutsideClassRange]: 'machineClass',
});

/**
 * The loader's diagnostic, said again in a sentence the player can act on.
 *
 * The loader's own message is precise and is written for whoever authored the file — it names a
 * path, a code and an envelope. What it does not say is *what to do instead*, because at load time
 * there is nothing to do. Here there is: pick a different class, pick a speed inside the band, pair
 * the floors. So the numbers are re-derived from the class the player chose rather than scraped out
 * of the loader's prose, and the sentence ends with the move.
 *
 * A code with no entry falls back to the loader's own words. That is a gate `core` grew and this
 * module has not been taught to phrase — worse prose, never a silent pass.
 */
function refusalFromWarning(
  warning: ConfigWarning,
  input: CommissioningReviewInput,
): CommissioningRefusal {
  const bankId = bankOf(warning, input.base);
  const site = SITE_BY_CODE[warning.code] ?? 'machineClass';
  const bank = bankId ?? 'this';
  const choice = input.choices.find((entry) => entry.bankId === bankId);
  const machineClass =
    choice === undefined ? undefined : classById(input.classes, choice.machineClassId);
  const name = machineClass?.name ?? choice?.machineClassId ?? 'that class';

  if (machineClass !== undefined && choice !== undefined) {
    switch (warning.code) {
      case WARNING_CODES.speedOutsideClassRange:
        return {
          site,
          bankId,
          code: warning.code,
          message:
            `${name} is built between ${String(machineClass.speedMinMps)} and ` +
            `${String(machineClass.speedMaxMps)} m/s, and the ${bank} bank asks for ` +
            `${String(choice.ratedSpeedMps)} m/s. Move the speed inside the band, or pick the class ` +
            'that is built for this speed.',
        };
      case WARNING_CODES.riseExceedsClass:
        return {
          site,
          bankId,
          code: warning.code,
          message:
            `${name} is rated to climb ${String(machineClass.maxRiseM)} m and the ${bank} bank ` +
            'spans further than that. Pick a class rated for the rise this bank has to serve.',
        };
      case WARNING_CODES.floorsExceedClass:
        return {
          site,
          bankId,
          code: warning.code,
          message:
            `${name} is rated for ${String(machineClass.maxFloors)} floors and the ${bank} bank ` +
            'serves more. Pick a class rated for the floors this bank has to serve.',
        };
      case WARNING_CODES.missingFloorPairs:
        return {
          site,
          bankId,
          code: warning.code,
          message:
            `${name} is a double-deck class and the ${bank} bank declares no paired floors, so the ` +
            'upper deck would open onto nothing and every figure the bank reported would describe ' +
            'hardware nobody configured. Pick a single-deck class, or a bank whose floors are paired.',
        };
      case WARNING_CODES.unusedFloorPairs:
        return {
          site,
          bankId,
          code: warning.code,
          message:
            `The ${bank} bank's floors are paired for a double-deck machine and ${name} runs one ` +
            'deck, so the pairing would do nothing. Pick a double-deck class for this bank.',
        };
      case WARNING_CODES.loadOutsideClassRange:
      case WARNING_CODES.deckPersonsOutsideClassRange:
        return {
          site,
          bankId,
          code: warning.code,
          message:
            `${name} is built in cars from ${String(machineClass.loadMinLb)} to ` +
            `${String(machineClass.loadMaxLb)} lb, and the ${bank} bank's cars fall outside that. ` +
            'Pick a class built in the size this bank needs.',
        };
      default:
        break;
    }
  }
  return { site, bankId, code: warning.code, message: warning.message };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* -------------------------------------------------------------------------- *
 * What the screen says
 * -------------------------------------------------------------------------- */

/**
 * The constraint's one sentence about this configuration.
 *
 * A statement of a limit and of what was chosen against it — never a comparison with another
 * player, another configuration, or anything a run produced. There is no percentage of budget here
 * and there is no place to put one: `budget.test.ts` asserts that on the strings and on the report
 * shapes, for the reason `types.ts` gives at length.
 */
function sentenceFor(
  constraint: CapitalConstraint,
  moved: readonly MovedChoice[],
  refusals: readonly CommissioningRefusal[],
  capitalUnits: number,
  budgetUnits: number,
): string {
  if (refusals.length > 0) {
    return (
      `${String(refusals.length)} thing${refusals.length === 1 ? '' : 's'} in this configuration ` +
      `cannot be built as chosen. The week does not open until each is answered.`
    );
  }
  if (moved.length === 0) {
    return (
      `${constraint.label}: the building opens the week exactly as it stands, committing ` +
      `${String(capitalUnits)} of the ${String(budgetUnits)} capital units allowed. ${constraint.note}`
    );
  }
  return (
    `${constraint.label}: ${String(moved.length)} change${moved.length === 1 ? '' : 's'} to the ` +
    `fabric, committing ${String(capitalUnits)} of the ${String(budgetUnits)} capital units ` +
    'allowed. The week runs on this building for all seven days.'
  );
}

/**
 * The refusals that belong beside one control.
 *
 * The reason this exists rather than a screen filtering the list itself: *"beside the control
 * rather than in a console"* is a requirement, and a requirement nothing in the model expresses is
 * a requirement the first re-layout loses.
 */
export function refusalsBeside(
  review: CommissioningReview,
  bankId: string,
  site: RefusalSite,
): readonly CommissioningRefusal[] {
  return review.refusals.filter(
    (refusal) => refusal.site === site && (refusal.bankId === bankId || refusal.bankId === null),
  );
}
