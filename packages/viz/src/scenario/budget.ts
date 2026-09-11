/**
 * **The scenario budget — `docs/38` § 2.1's *"one shape, four sources"*, and the one field the
 * stage record did not carry.** GitHub issue **#365**, [§ D525](../../../../DECISIONS.md) clause 1
 * and [§ D528](../../../../DECISIONS.md).
 *
 * > *"A scenario is a building, a crowd, a seed set, a goal set, **a budget**, and **a price
 * > schedule**. `data/campaign.json`'s stage record already carries everything but the budget …
 * > That record, plus a budget, is the scenario schema."*
 *
 * So this module is the *plus a budget* half, and `campaign/types.ts#CampaignStage` is the record
 * it lands on. It is declared here rather than in `campaign/` because three more content sources
 * author to the same shape — the eighteen fix cases (#233), the six Engineer challenges (#227) and
 * today's scenario — and a budget type that lived inside the campaign would make the campaign the
 * schema rather than one of its four authors.
 *
 * ## What a budget is made of, and why the steps are records rather than a list of numbers
 *
 * A budget is a **base** and an ordered ladder of **bought-budget steps**: § 2.1's *"chimes buy a
 * scenario's budget up, in steps the scenario authors"*. Each step is a record with an id, because
 * GitHub issue **#367** publishes a pre-simulated survivor count **per budget step** and a count
 * has to be keyed to something stable. A step authored as a bare integer would leave #367 keying a
 * measurement by array position, which is the shape a re-ordered ladder silently corrupts. Nothing
 * here holds a survivor count and nothing here should: a count is a **measurement**, and this file
 * is where the **chosen** figures live. #367's table is keyed by `(scenarioId, stepId)` the way
 * `data/scenario-goals.json` is keyed by stage id, and it needs no change to this shape to land.
 *
 * ## Every rule below is derived from `data/price-schedule.json` rather than written down twice
 *
 * A budget means nothing except against a price ladder, so every bound this module enforces is
 * re-derived from the shipped schedule at load — {@link scheduleBoundsOf} — and none of them is a
 * constant in this file. The rules, and each is one #365 asks for:
 *
 * - **The base clears the cheapest tier's own typical.** Below it the scenario cannot afford even
 *   a typical change at the cheapest rung of the ladder, and `campaign/parse.ts`'s own sentence
 *   applies: *"lets the player move nothing, so there is no scenario here — only a run."*
 * - **A step adds at least the cheapest priced change that costs anything.** A step below that
 *   buys nothing at any price the schedule holds — #365's *"a scenario declaring a step no price
 *   schedule can reach fails to load with the reason attached"*, in its first form.
 * - **A rung at or below the dearest single change enlarges what is affordable.** Two rungs that
 *   afford the same set of changes are one rung wearing two prices. Its second form.
 * - **No rung exceeds what the whole schedule costs.** Above that total every change on the ladder
 *   is already bought and there is nothing left for chimes to reach. Its third form.
 * - **Every value sits inside its own declared schema, and the default is the shipped value** —
 *   `CLAUDE.md` invariant 8's range, and `pricing/parse.ts`'s own rule that *"the default is the
 *   shipped price, not a second opinion"*.
 * - **`activeWhen` is derived, never trusted.** Invariant 8 asks for it *"for conditional
 *   parameters"*, and a bought-budget step is the textbook one: step `n` can only be bought once
 *   step `n − 1` has been. So the first step's `activeWhen` is `null` and every other step's is its
 *   predecessor's id, checked against the array rather than read off the file.
 *
 * ### The one rule that is silent above a stated rung, said rather than implied
 *
 * *A rung enlarges what is affordable* is checked only at or below the dearest single change. Above
 * that rung every change on the ladder is individually affordable and what a further step buys is a
 * **combination** — two dear changes at once — and counting combinations is #367's whole subject,
 * which `docs/38` § 2.1 says is sampled at the building tier because the space is too large to
 * enumerate. Doing it badly at load time would be this file publishing a difficulty figure, which
 * is the one thing it must not do.
 *
 * ## What is deliberately not a field here, and it is the load-bearing absence
 *
 * **No goal, no threshold, no bar, no tier, no difficulty.** `charter` non-goal 6, restated in
 * `docs/38` § 2.1: *"two players who post the same run read the same verdict whatever their budget
 * was."* [§ D345](../../../../DECISIONS.md) is the same rule one level up — difficulty may raise
 * the stakes and may not move the mark — and `data/contract-ladder.json` took the same decision the
 * same way, in terms: *"a field that does not exist cannot be authored."* {@link decodeScenarioBudget}
 * refuses an unknown key on a budget or a step rather than ignoring it, so the absence is enforced
 * at load and not merely documented. `scenario/budget.test.ts` asserts the other direction too —
 * that no module which decides a verdict names a budget field at all.
 *
 * ## No ordering rule on chimes, and the refusal is the record
 *
 * A step costs chimes and a later step may cost fewer than an earlier one. That looks like an
 * incoherence and is not: the steps are **sequential** — `activeWhen` makes step `n` unbuyable
 * until step `n − 1` is bought — so a cheaper later step cannot be chosen instead of a dearer
 * earlier one, and pacing a ladder that way is a designer's decision rather than a defect. The only
 * rule is that a step costs at least one chime, because a step that costs nothing is not a spend
 * and `docs/38` § 2.4's *"spent on modifiers"* is what makes it a decision.
 *
 * The decision this module took is recorded in this docstring and cites
 * [§ D405](../../../../DECISIONS.md): it binds nothing outside `scenario/`, `campaign/` and the
 * data file those two read, so no `DECISIONS.md` number is owed for it.
 */

import type { PriceSchedule, PricedChange, WithheldChange } from '../pricing/types.js';

/* -------------------------------------------------------------------------- *
 * The shape
 * -------------------------------------------------------------------------- */

/**
 * `CLAUDE.md` invariant 8, in full — *type, range, default, and `activeWhen` for conditional
 * parameters* — so a generic consumer can read a budget without scenario-specific knowledge.
 *
 * `pricing/types.ts#PriceSchema` is the same four fields **without** `activeWhen`, and that
 * module's docstring says why: a price is unconditional. A bought-budget step is not, which is why
 * the field is here and is the reason invariant 8's conditional clause exists.
 */
export interface BudgetSchema {
  readonly type: 'integer';
  readonly unit: 'units';
  readonly min: number;
  readonly max: number;
  /** The shipped value, not a second opinion — checked equal to the field it describes. */
  readonly default: number;
  /**
   * The step this one becomes buyable after, or `null` for the base and the first step.
   *
   * **Derived from the ladder's order at load, never trusted.** A file that authored the wrong
   * predecessor would describe a ladder the player cannot climb.
   */
  readonly activeWhen: string | null;
}

/** One rung a player can buy with chimes — `docs/38` § 2.1 and § 2.4. */
export interface BoughtBudgetStep {
  /** Stable, and #367's key for the survivor count measured at this rung. */
  readonly id: string;
  /** What the screen calls it. */
  readonly name: string;
  /** Units this step adds to the rung below it. */
  readonly addsUnits: number;
  /** What it costs in chimes — `docs/38` § 2.4's one permitted sink, a limit on a configuration. */
  readonly chimes: number;
  /** Where the two figures above came from. Chosen or derived, and which. */
  readonly note: string;
  readonly schema: BudgetSchema;
}

/** A scenario's budget: what it opens with, and the ladder chimes can buy up. */
export interface ScenarioBudget {
  /** Units the scenario opens with, before any chime is spent. */
  readonly startingUnits: number;
  /** Where {@link startingUnits} came from. Chosen or derived, and which. */
  readonly note: string;
  readonly schema: BudgetSchema;
  /** In play order. The array's order **is** the ladder, as `Campaign.stages` already is. */
  readonly steps: readonly BoughtBudgetStep[];
}

/** Every key a budget may carry. An unknown one is refused — see the module docstring. */
export const BUDGET_KEYS: readonly string[] = ['startingUnits', 'note', 'schema', 'steps'];

/** Every key a step may carry. */
export const STEP_KEYS: readonly string[] = ['id', 'name', 'addsUnits', 'chimes', 'note', 'schema'];

/** Every key a schema may carry — invariant 8's four, with `unit` beside `type`. */
export const SCHEMA_KEYS: readonly string[] = [
  'type',
  'unit',
  'min',
  'max',
  'default',
  'activeWhen',
];

/* -------------------------------------------------------------------------- *
 * The ladder, as rungs
 * -------------------------------------------------------------------------- */

/** One rung of a scenario's budget: what the player has, and what it cost to get there. */
export interface BudgetRung {
  /** `null` on the base rung; a {@link BoughtBudgetStep.id} on every bought one. */
  readonly stepId: string | null;
  /** Units available at this rung — the base plus every step up to and including this one. */
  readonly units: number;
  /** Chimes spent to reach it, cumulative. Zero on the base. */
  readonly chimesSpent: number;
}

/**
 * The budget as rungs, base first.
 *
 * One derivation, so a screen, a validator and #367's survivor table cannot disagree about what a
 * player standing on step 2 actually has.
 */
export function rungsOf(budget: ScenarioBudget): readonly BudgetRung[] {
  const rungs: BudgetRung[] = [{ stepId: null, units: budget.startingUnits, chimesSpent: 0 }];
  for (const step of budget.steps) {
    const below = rungs[rungs.length - 1];
    rungs.push({
      stepId: step.id,
      units: (below?.units ?? 0) + step.addsUnits,
      chimesSpent: (below?.chimesSpent ?? 0) + step.chimes,
    });
  }
  return rungs;
}

/* -------------------------------------------------------------------------- *
 * What the shipped ladder bounds a budget to
 * -------------------------------------------------------------------------- */

/**
 * Every bound a budget is checked against, re-derived from the schedule.
 *
 * **Nothing here branches on a tier id.** `pricing/types.ts` makes `PriceTier.order` the ladder as
 * data precisely so that nothing downstream needs an `if` on a name, and
 * {@link ScheduleBounds.cheapestTierTypicalUnits} is read off the lowest `order` rather than off
 * the word *dispatcher*.
 */
export interface ScheduleBounds {
  /** The typical of the tier at the bottom of the ladder — the floor a base must clear. */
  readonly cheapestTierTypicalUnits: number;
  /** The cheapest change that costs anything at all. A step below this buys nothing. */
  readonly cheapestPositiveUnits: number;
  /** The dearest single change. Above this rung, what a step buys is a combination. */
  readonly dearestChangeUnits: number;
  /** Every change on the ladder, bought at once. No rung may exceed it. */
  readonly totalUnits: number;
}

/** {@link ScheduleBounds}, derived. A schedule pricing nothing yields zeroes and is its own bug. */
export function scheduleBoundsOf(schedule: PriceSchedule): ScheduleBounds {
  const prices = schedule.changes.map((change) => change.priceUnits);
  const positive = prices.filter((price) => price > 0);
  const byOrder = [...schedule.tiers].sort((a, b) => a.order - b.order);
  return {
    cheapestTierTypicalUnits: byOrder[0]?.typicalUnits ?? 0,
    cheapestPositiveUnits: positive.length === 0 ? 0 : Math.min(...positive),
    dearestChangeUnits: prices.length === 0 ? 0 : Math.max(...prices),
    totalUnits: prices.reduce((sum, price) => sum + price, 0),
  };
}

/** The changes a rung of `units` can afford one at a time. */
export function affordableChanges(schedule: PriceSchedule, units: number): readonly PricedChange[] {
  return schedule.changes.filter((change) => change.priceUnits <= units);
}

/* -------------------------------------------------------------------------- *
 * A dimension's price, and whether a rung permits moving it
 * -------------------------------------------------------------------------- */

/**
 * The dotted prefixes of `dispatcher.<id>`, longest first — the one matching rule by which a
 * dimension is priced **or withheld**, so the two answers cannot drift into two readings of a path.
 */
function coveringPathsOf(dimensionId: string): readonly string[] {
  const parts = `dispatcher.${dimensionId}`.split('.');
  const out: string[] = [];
  for (let length = parts.length; length > 0; length -= 1) out.push(parts.slice(0, length).join('.'));
  return out;
}

/**
 * The change that prices a **search-space dimension id**, or `undefined` where nothing does.
 *
 * `pricing/parse.ts#changeCovering` matches a `covers` path exactly, which is right for a fix-it
 * patch: `repairPrice.ts#pathsIn` emits the very paths the schedule lists. A dimension id is not
 * one of those paths — the schedule prices `dispatcher.weights` as a group and the search space
 * declares `weights.waitTime` — so the lookup here walks the dotted prefixes of `dispatcher.<id>`
 * from longest to shortest and takes the first the schedule prices. That is the schedule's own
 * grouping read as it is written, and it is why this function lives here rather than widening
 * #366's module with a second matching rule.
 */
export function changePricingDimension(
  schedule: PriceSchedule,
  dimensionId: string,
): PricedChange | undefined {
  for (const prefix of coveringPathsOf(dimensionId)) {
    const found = schedule.changes.find((change) => change.covers.includes(prefix));
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The `withheld` entry that takes a dimension off sale in **every** scenario, or `undefined` —
 * GitHub issue **#467**, [§ D535](../../../../DECISIONS.md).
 *
 * The product owner's ruling on that issue split the thirty-five dimensions it measured into the two
 * answers its register could not tell apart: the weight-set selector and the arrival predictor are
 * sold at no price, and the rest are priced. `data/price-schedule.json` declares the first answer
 * once, in its `withheld` block, and this is the lookup every reader of it goes through —
 * `campaign/parse.ts#editableIdsOf` to resolve the families out of a scenario's editable set, and
 * {@link admitPurchase} to refuse a move that touches one. Same walk as
 * {@link changePricingDimension}, so a withheld group reaches a knob declared tomorrow exactly as a
 * priced group does, and nothing anywhere names a withheld dimension in code.
 */
export function withholdingDimension(
  schedule: PriceSchedule,
  dimensionId: string,
): WithheldChange | undefined {
  for (const prefix of coveringPathsOf(dimensionId)) {
    const found = schedule.withheld.find((entry) => entry.covers.includes(prefix));
    if (found !== undefined) return found;
  }
  return undefined;
}

/** What a rung learns about a set of moved dimensions **before** anything is run. */
export interface PurchaseAdmission {
  readonly admitted: boolean;
  /** The distinct changes the move buys, summed. A move the schedule prices nothing for is free. */
  readonly units: number;
  /** The distinct change ids bought, in the order they were met. */
  readonly changeIds: readonly string[];
  /** Dimensions the schedule prices nothing for — reported, never silently charged. */
  readonly unpriced: readonly string[];
  /**
   * Dimensions the schedule **withholds** — sold in no scenario at any price (GitHub issue #467,
   * [§ D535](../../../../DECISIONS.md)). Unlike {@link PurchaseAdmission.unpriced}, one of these
   * refuses the whole move, whatever the budget holds.
   */
  readonly withheld: readonly string[];
  /** Why it is refused. Never `undefined` when {@link PurchaseAdmission.admitted} is `false`. */
  readonly reason: string | undefined;
}

/**
 * May a rung of `units` pay for moving these dimensions? — answered without running anything.
 *
 * Distinct changes, for `pricing/repairPrice.ts#changesBought`'s stated reason: a player who moves
 * two weights has re-tuned the dispatcher **once**, and charging twice would be this module
 * inventing a price the ladder does not hold.
 *
 * A dimension the schedule prices nothing for costs nothing and is reported in
 * {@link PurchaseAdmission.unpriced}. It is not charged a guessed price and it is not refused:
 * inventing a price here would be the second price list #366 exists to end, and refusing would
 * make a control the editor offers unusable for a reason no player could read. The shipped set of
 * such dimensions is registered and checked in `scenario/budget.test.ts`, and since GitHub issue
 * #467 priced the last of them it is empty.
 *
 * **A dimension the schedule withholds is the other answer, and it is refused** —
 * [§ D535](../../../../DECISIONS.md). Not for sale is not priced high: no budget reaches it, so the
 * move is refused whatever `units` holds, and the reason says so rather than quoting a price. The
 * priced dimensions beside it are still summed into {@link PurchaseAdmission.units}, so a reader can
 * see the refusal is about the withheld dial and not about the bill.
 */
export function admitPurchase(
  schedule: PriceSchedule,
  units: number,
  dimensionIds: readonly string[],
): PurchaseAdmission {
  const bought = new Map<string, PricedChange>();
  const unpriced: string[] = [];
  const withheld: string[] = [];
  const rulings = new Set<string>();
  for (const id of dimensionIds) {
    const withholding = withholdingDimension(schedule, id);
    if (withholding !== undefined) {
      withheld.push(id);
      rulings.add(withholding.id);
      continue;
    }
    const change = changePricingDimension(schedule, id);
    if (change === undefined) unpriced.push(id);
    else bought.set(change.id, change);
  }
  const cost = [...bought.values()].reduce((sum, change) => sum + change.priceUnits, 0);
  const changeIds = [...bought.keys()];
  if (withheld.length > 0) {
    return {
      admitted: false,
      units: cost,
      changeIds,
      unpriced,
      withheld,
      reason:
        `${withheld.join(', ')} ${withheld.length === 1 ? 'is' : 'are'} sold in no scenario at any ` +
        `price — data/price-schedule.json withholds ${[...rulings].join(', ')} (§ D535) — so no ` +
        'budget buys this move, and not for sale is a different answer from priced high.',
    };
  }
  if (cost <= units) {
    return { admitted: true, units: cost, changeIds, unpriced, withheld, reason: undefined };
  }
  return {
    admitted: false,
    units: cost,
    changeIds,
    unpriced,
    withheld,
    reason:
      `this change costs ${String(cost)} units (${changeIds.join(', ')}) and the budget holds ` +
      `${String(units)}. A wider budget is bought with chimes; the bar the run is judged against ` +
      'does not move with it.',
  };
}

/* -------------------------------------------------------------------------- *
 * Validation
 * -------------------------------------------------------------------------- */

/**
 * Every way a budget can be wrong, as sentences. Empty means it is sound.
 *
 * A list rather than a throw, for `campaign/parse.ts`'s stated reason: an author fixing a data file
 * wants the whole list, and the caller composing this with its own violations prints them together.
 */
export function budgetViolations(
  where: string,
  budget: ScenarioBudget,
  schedule: PriceSchedule,
): readonly string[] {
  const out: string[] = [];
  const bounds = scheduleBoundsOf(schedule);

  if (budget.note.trim() === '') {
    out.push(
      `${where}: its budget carries no note. Every figure in a governed data file says whether it ` +
        'was measured or chosen, and a budget is chosen.',
    );
  }

  if (budget.startingUnits < bounds.cheapestTierTypicalUnits) {
    out.push(
      `${where}: opens on ${String(budget.startingUnits)} units and the cheapest rung of ` +
        `data/price-schedule.json typically costs ${String(bounds.cheapestTierTypicalUnits)}. A ` +
        'budget that cannot afford a typical change at the bottom of the ladder lets the player ' +
        'move nothing, so there is no scenario here — only a run.',
    );
  }

  out.push(...schemaViolations(`${where}: its budget`, budget.schema, budget.startingUnits, bounds));

  const seen = new Set<string>();
  const rungs = rungsOf(budget);
  for (const [index, step] of budget.steps.entries()) {
    const at = `${where}: budget step "${step.id}"`;
    if (step.id.trim() === '') out.push(`${where}: a budget step has no id.`);
    if (seen.has(step.id)) out.push(`${at}: declared twice.`);
    seen.add(step.id);
    if (step.name.trim() === '') out.push(`${at}: has no name, so no screen can offer it.`);
    if (step.note.trim() === '') {
      out.push(`${at}: carries no note saying where its figures came from.`);
    }

    if (step.chimes < 1) {
      out.push(
        `${at}: costs ${String(step.chimes)} chimes. A step that costs nothing is not a spend, ` +
          'and docs/38 § 2.4 makes a widened budget a decision the player pays for.',
      );
    }
    if (step.addsUnits < bounds.cheapestPositiveUnits) {
      out.push(
        `${at}: adds ${String(step.addsUnits)} units and the cheapest change that costs anything ` +
          `on data/price-schedule.json is ${String(bounds.cheapestPositiveUnits)}. No price ` +
          'schedule can reach this step: it buys nothing at any price the ladder holds.',
      );
    }

    const rung = rungs[index + 1];
    const below = rungs[index];
    if (rung !== undefined && below !== undefined) {
      if (rung.units > bounds.totalUnits) {
        out.push(
          `${at}: reaches ${String(rung.units)} units and every change on the schedule together ` +
            `costs ${String(bounds.totalUnits)}. No price schedule can reach this step: there is ` +
            'nothing above it left to buy.',
        );
      } else if (rung.units <= bounds.dearestChangeUnits) {
        const now = affordableChanges(schedule, rung.units).length;
        const wasBefore = affordableChanges(schedule, below.units).length;
        if (now <= wasBefore) {
          out.push(
            `${at}: lifts the budget from ${String(below.units)} to ${String(rung.units)} units ` +
              `and the same ${String(now)} changes are affordable either side of it. No price ` +
              'schedule can reach this step: it is the rung below wearing a second price.',
          );
        }
      }
    }

    const expected = index === 0 ? null : (budget.steps[index - 1]?.id ?? null);
    if (step.schema.activeWhen !== expected) {
      out.push(
        `${at}: declares activeWhen ${JSON.stringify(step.schema.activeWhen)} and it is step ` +
          `${String(index + 1)} of the ladder, so invariant 8's condition is ` +
          `${JSON.stringify(expected)}. The condition is derived from the ladder, never trusted.`,
      );
    }
    out.push(...schemaViolations(at, step.schema, step.addsUnits, bounds));
  }
  return out;
}

/**
 * Invariant 8's range and default, checked against the value they describe and against the ladder.
 *
 * `activeWhen` is **not** checked here and its absence is deliberate: the condition is a property of
 * a step's position in the ladder rather than of its schema, so it is derived once by the caller
 * against the array. Checking it in both places would report one defect as two violations.
 */
function schemaViolations(
  at: string,
  schema: BudgetSchema,
  value: number,
  bounds: ScheduleBounds,
): readonly string[] {
  const out: string[] = [];
  if (schema.min !== 0) {
    out.push(`${at}: declares a floor of ${String(schema.min)} units; a budget floor is 0.`);
  }
  if (schema.max !== bounds.totalUnits) {
    out.push(
      `${at}: declares a ceiling of ${String(schema.max)} units and the whole of ` +
        `data/price-schedule.json costs ${String(bounds.totalUnits)}. The ceiling is selected ` +
        'from the ladder, not authored beside it.',
    );
  }
  if (value < schema.min || value > schema.max) {
    out.push(
      `${at}: is ${String(value)} units, outside its own declared ${String(schema.min)}–` +
        `${String(schema.max)} (CLAUDE.md invariant 8).`,
    );
  }
  if (schema.default !== value) {
    out.push(
      `${at}: is ${String(value)} units and defaults to ${String(schema.default)}. The default is ` +
        'the shipped value, not a second opinion.',
    );
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * Decoding
 * -------------------------------------------------------------------------- */

type Record_ = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownKeys(raw: Record_, allowed: readonly string[]): readonly string[] {
  return Object.keys(raw).filter((key) => !allowed.includes(key));
}

/**
 * Read a budget off an authored record, collecting every structural violation.
 *
 * **Absent is refused, never defaulted** — #365's fifth criterion. A scenario with no budget is not
 * a scenario with an unlimited one: `docs/38` § 2.1 makes the budget the thing that bounds the
 * reachable space, so a missing budget is a scenario whose difficulty is undefined rather than easy.
 *
 * An **unknown key** is refused too, and the message names what it is guarding against. A budget
 * that could carry a goal or a threshold would be a second place a bar is set, and `charter`
 * non-goal 6 makes the bar the same for two players whatever they paid.
 */
export function decodeScenarioBudget(
  raw: unknown,
  where: string,
  violations: string[],
): ScenarioBudget | undefined {
  if (raw === undefined || raw === null) {
    violations.push(
      `${where}: has no "budget". docs/38 § 2.1 makes a scenario the stage record plus a budget, ` +
        'and a missing budget is refused rather than read as an unlimited one — a scenario with ' +
        'no budget has no bounded space and therefore no difficulty (GitHub issue #367).',
    );
    return undefined;
  }
  if (!isRecord(raw)) {
    violations.push(`${where}: "budget" is not an object.`);
    return undefined;
  }
  for (const key of unknownKeys(raw, BUDGET_KEYS)) {
    violations.push(
      `${where}: its budget carries "${key}", which is not a budget field. A budget bounds the ` +
        'space and moves no bar: no goal, no threshold and no difficulty may be authored on it ' +
        '(charter non-goal 6, § D345). A field that does not exist cannot be authored.',
    );
  }
  const startingUnits = raw['startingUnits'];
  if (typeof startingUnits !== 'number' || !Number.isInteger(startingUnits)) {
    violations.push(`${where}: its budget has no whole-number "startingUnits".`);
    return undefined;
  }
  const schema = decodeSchema(raw['schema'], `${where}: its budget`, violations);
  if (schema === undefined) return undefined;

  const stepsRaw = raw['steps'];
  if (!Array.isArray(stepsRaw)) {
    violations.push(
      `${where}: its budget has no "steps" array. A scenario with no bought-budget steps declares ` +
        'an empty array, which is a statement; an absent one is a file nobody finished.',
    );
    return undefined;
  }
  const steps: BoughtBudgetStep[] = [];
  for (const [index, entry] of stepsRaw.entries()) {
    const step = decodeStep(entry, `${where}: budget step ${String(index + 1)}`, violations);
    if (step !== undefined) steps.push(step);
  }
  return {
    startingUnits,
    note: typeof raw['note'] === 'string' ? raw['note'] : '',
    schema,
    steps,
  };
}

function decodeStep(raw: unknown, at: string, violations: string[]): BoughtBudgetStep | undefined {
  if (!isRecord(raw)) {
    violations.push(`${at}: is not an object.`);
    return undefined;
  }
  for (const key of unknownKeys(raw, STEP_KEYS)) {
    violations.push(
      `${at}: carries "${key}", which is not a budget-step field. A bought rung buys units and ` +
        'nothing else — no goal, no threshold, no difficulty (charter non-goal 6, § D345).',
    );
  }
  const id = raw['id'];
  const addsUnits = raw['addsUnits'];
  const chimes = raw['chimes'];
  if (typeof id !== 'string' || typeof addsUnits !== 'number' || typeof chimes !== 'number') {
    violations.push(`${at}: needs an id, a whole-number "addsUnits" and a whole-number "chimes".`);
    return undefined;
  }
  if (!Number.isInteger(addsUnits) || !Number.isInteger(chimes)) {
    violations.push(`${at}: "addsUnits" and "chimes" are whole numbers.`);
    return undefined;
  }
  const schema = decodeSchema(raw['schema'], at, violations);
  if (schema === undefined) return undefined;
  return {
    id,
    name: typeof raw['name'] === 'string' ? raw['name'] : '',
    addsUnits,
    chimes,
    note: typeof raw['note'] === 'string' ? raw['note'] : '',
    schema,
  };
}

function decodeSchema(raw: unknown, at: string, violations: string[]): BudgetSchema | undefined {
  if (!isRecord(raw)) {
    violations.push(
      `${at}: declares no "schema". CLAUDE.md invariant 8: every tunable declares its type, ` +
        'range, default and activeWhen, so a generic consumer can read it without knowing what a ' +
        'scenario is.',
    );
    return undefined;
  }
  for (const key of unknownKeys(raw, SCHEMA_KEYS)) {
    violations.push(`${at}: its schema carries "${key}", which is not one of invariant 8's fields.`);
  }
  const type = raw['type'];
  const unit = raw['unit'];
  const min = raw['min'];
  const max = raw['max'];
  const fallback = raw['default'];
  if (type !== 'integer' || unit !== 'units') {
    violations.push(`${at}: a budget is declared in whole "units"; its schema says otherwise.`);
    return undefined;
  }
  if (typeof min !== 'number' || typeof max !== 'number' || typeof fallback !== 'number') {
    violations.push(`${at}: its schema needs a numeric min, max and default.`);
    return undefined;
  }
  const activeWhen = raw['activeWhen'];
  if (activeWhen !== null && typeof activeWhen !== 'string') {
    violations.push(
      `${at}: its schema needs an "activeWhen" — the step it becomes buyable after, or null. ` +
        'Invariant 8 asks for it on every conditional parameter and a bought rung is one.',
    );
    return undefined;
  }
  return { type: 'integer', unit: 'units', min, max, default: fallback, activeWhen };
}
