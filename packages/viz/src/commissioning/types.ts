/**
 * **Commissioning — the pre-week design phase — and the one decision it has to make out loud.**
 *
 * `docs/17-play-experience-audit.md` § 4.4 is the design. Before the week opens the player chooses
 * shafts, machine classes and rated speeds under a declared constraint; then they live with those
 * for seven days. Its inverse is **retrofit**: the fabric is frozen and only dispatch may move,
 * which is what makes *geometry beats dispatch at scale* land as a lesson — it takes the geometry
 * away. Retrofit is not a second module here. It is {@link CONSTRAINTS}' first member, whose
 * editable set is empty; see the note on that entry.
 *
 * ## The capital constraint is a limit on the configuration, and never a metric
 *
 * This is the decision § 4.4 asks to be made out loud, and it is made here.
 *
 * `docs/10-experience-layer-contract.md` § 5.5 bans a grade letter derived from AWT, an
 * *"efficiency"* or *"energy"* score, and a leaderboard ranking dispatchers from single runs. It
 * does **not** ban a budget you build against — a limit on what may be *chosen* is not a verdict on
 * what happened. The failure mode is a currency that quietly becomes a score, so the rule is
 * stated as three prohibitions rather than one permission:
 *
 * 1. the budget may gate what can be **chosen**;
 * 2. it may **never** appear on a results page, be compared between players, or be folded into any
 *    verdict;
 * 3. nothing may print *"you spent 82 % of budget"* beside a wait figure.
 *
 * **This is § D106's argument about a different quantity.** Energy is an axis, never a score:
 * measured across the full experiment matrix, `nearest-car` — the weakest shipped dispatcher — sits
 * on the Pareto front at six of eight cells *because* it is best on energy and worst on wait, so an
 * eco score ranks it first. A capital score would do the same thing one step earlier: the cheapest
 * building is the one with the fewest shafts, and a configuration that spends less by carrying
 * fewer people has not saved anything. `workPerServedLegKJ` goes beside the raw energy figure for
 * exactly this reason, and the equivalent move here is that **capital has no beside**. It is spent
 * before the week and never displayed as an outcome.
 *
 * All three prohibitions are asserted rather than promised — `budget.test.ts`:
 *
 * - no capital figure reaches any report shape, checked on a real `ShapedDayReport` built from a
 *   real run of a commissioned building;
 * - no runtime file in this directory can even reach a reporting surface, checked on the imports;
 * - every player-facing string this module produces is scanned for comparative and scoring
 *   vocabulary, and for the name of any run metric it must never stand beside.
 *
 * A promise with no test is how this repository's ten dead seams shipped.
 *
 * ## What a choice is
 *
 * Three dimensions, per bank: how many shafts, which machine class, what rated speed. They are
 * three because `data/elevator-specs.json` is already an upgrade tree with real gates —
 * `maxRiseM`, `maxFloors`, `capacityLbRange`, `ratedSpeedMps`, `doubleDeckPersonsPerDeck` — and a
 * fourth dimension the specs file does not declare would be a control with nothing behind it.
 *
 * CLAUDE.md invariant 7 is why there is no `if (classId === 'gearless-traction')` anywhere below:
 * the tree is data, this module reads it, and a class added to `data/elevator-specs.json` is
 * offered by {@link CommissionableClass} without a line changing here.
 */

import type { ElevatorSpecs } from '@elevator-sim/core/browser';

/* -------------------------------------------------------------------------- *
 * The three dimensions
 * -------------------------------------------------------------------------- */

/**
 * The dimensions a commissioning choice moves.
 *
 * **Named, not derived** — the split `mode/types.ts` states and `docs/16` S4 requires: the
 * categories are named by the criterion itself, and the members of the sets they range over are
 * derived. A fourth dimension is a compile error at every exhaustive site, which is what stops one
 * arriving as a caption.
 */
export const COMMISSIONING_DIMENSIONS = ['shafts', 'machineClass', 'ratedSpeed'] as const;

export type CommissioningDimension = (typeof COMMISSIONING_DIMENSIONS)[number];

/** What each dimension is called beside its control. */
export const DIMENSION_LABELS: Readonly<Record<CommissioningDimension, string>> = Object.freeze({
  shafts: 'shafts',
  machineClass: 'machine class',
  ratedSpeed: 'rated speed',
});

/* -------------------------------------------------------------------------- *
 * The class tree, as commissioning needs to read it
 * -------------------------------------------------------------------------- */

/**
 * One entry of `data/elevator-specs.json`'s `classes`, as this module reads it.
 *
 * Structurally a superset of nothing and a subset of `authoring/machineSpec.ts`'s `MachineClass`
 * plus one field, so a `MachineClass` the reader saved in the machine editor **is** a
 * `CommissionableClass` and needs no adapter. That is deliberate: a class the reader authored and
 * a class the file ships are the same kind of thing to a commissioning screen, and a screen that
 * offered only the shipped six would be a second, smaller class list for a reader to be confused
 * by.
 *
 * {@link doubleDeckPersonsPerDeck} is the field `MachineClass` does not carry, and it is optional
 * for that reason. Its presence is what makes a class a **double-deck** class — see
 * `refusals.ts`'s third gate.
 */
export interface CommissionableClass {
  readonly id: string;
  readonly name: string;
  readonly speedMinMps: number;
  readonly speedMaxMps: number;
  readonly speedTypicalMps: number;
  readonly maxRiseM: number;
  readonly maxFloors: number;
  readonly loadMinLb: number;
  readonly loadMaxLb: number;
  /** Persons per deck `[low, high]`. Present only on classes built as double-deck. */
  readonly doubleDeckPersonsPerDeck?: readonly [number, number] | undefined;
}

/** Read the shipped class tree. The whole tree — commissioning gates nothing out of the list. */
export function commissionableClasses(specs: ElevatorSpecs): readonly CommissionableClass[] {
  return specs.classes.map((entry) => ({
    id: entry.id,
    name: entry.name,
    speedMinMps: entry.ratedSpeedMps.min,
    speedMaxMps: entry.ratedSpeedMps.max,
    speedTypicalMps: entry.ratedSpeedMps.typical,
    maxRiseM: entry.maxRiseM,
    maxFloors: entry.maxFloors,
    loadMinLb: entry.capacityLbRange[0],
    loadMaxLb: entry.capacityLbRange[1],
    ...(entry.doubleDeckPersonsPerDeck === undefined
      ? {}
      : { doubleDeckPersonsPerDeck: entry.doubleDeckPersonsPerDeck }),
  }));
}

export function classById(
  classes: readonly CommissionableClass[],
  id: string,
): CommissionableClass | undefined {
  return classes.find((entry) => entry.id === id);
}

/** True for a class `data/elevator-specs.json` declares a per-deck person range for. */
export function isDoubleDeckClass(machineClass: CommissionableClass): boolean {
  return machineClass.doubleDeckPersonsPerDeck !== undefined;
}

/* -------------------------------------------------------------------------- *
 * The choice
 * -------------------------------------------------------------------------- */

/**
 * What one bank is commissioned as.
 *
 * A bank, not a car: shafts are a property of the group, and a bank whose cars are individually
 * specified is a building the *building editor* authors. Commissioning is the coarser instrument
 * on purpose — see {@link CommissioningChoices} for what that costs on two shipped buildings.
 */
export interface BankChoice {
  readonly bankId: string;
  /** How many shafts the bank has. At least one; a bank with none is floors nobody can reach. */
  readonly shafts: number;
  /** A class id in `data/elevator-specs.json`, or one the reader saved. */
  readonly machineClassId: string;
  /** Rated top speed, m/s. Must sit inside the class's declared band. */
  readonly ratedSpeedMps: number;
}

/**
 * The whole building's choices, one entry per bank.
 *
 * A bank with no entry is **left exactly as authored**, which is what makes a partial choice set a
 * legal value rather than a bug: a screen that has only drawn one bank's controls has not decided
 * anything about the others.
 *
 * ## The narrowing this shape imposes, stated rather than discovered
 *
 * One class and one speed per bank means a bank whose shipped cars differ from each other cannot
 * be described by a choice without rewriting it. **Two shipped buildings are in exactly that
 * state** — `crown-hotel`'s `main` (a geared 1.75 m/s car beside gearless 3.0 m/s ones) and
 * `st-jude-hospital`'s `main` (1.75 and 2.5 m/s, 4 000 and 3 500 lb) — and `refusals.ts` refuses
 * every dimension on such a bank rather than flattening it silently.
 */
export type CommissioningChoices = readonly BankChoice[];

/* -------------------------------------------------------------------------- *
 * The constraint
 * -------------------------------------------------------------------------- */

/**
 * What the player is allowed to change, and how far.
 *
 * Two halves, and both are limits on the *configuration*:
 *
 * - {@link editable} — which of the three dimensions may move at all. This is
 *   `campaign/dimensions.ts`'s editable set, pointed at a building instead of a dispatcher: the
 *   stage-campaign already refuses a profile that moves a dimension the stage does not open, names
 *   the dimension in the refusal, and does it before a single replication runs. The same machinery,
 *   the same refusal shape, and — see below — the same reason it is worth having.
 * - {@link headroom} — how much capital the constraint allows above what the building already
 *   stands as. Relative rather than absolute, because an absolute figure would mean something
 *   different on Garden Apartments and on Vertical City and would therefore mean nothing.
 *
 * ## Frozen in code rather than in `data/`
 *
 * `shift/contracts.ts` already argued this for its five scenarios and the argument transfers: a
 * `data/` file needs a schema, a parser and a loader, and these are not parameters an optimizer
 * could search. They are game-design limits. Invariant 7 is about *tunables* — a dispatch weight,
 * a cost term, a demand rate — and it makes strategy data; it does not make every constant data.
 * The thing invariant 7 would object to is a class list written here, and there is none: the class
 * tree is read from `data/elevator-specs.json` by {@link commissionableClasses}.
 */
export interface CapitalConstraint {
  readonly id: string;
  /** The constraint's name, as the screen prints it. */
  readonly label: string;
  /** One sentence saying what the constraint is. Never a comparison, never a target. */
  readonly note: string;
  /** Which dimensions may move. Empty means the fabric is frozen — that is retrofit. */
  readonly editable: readonly CommissioningDimension[];
  /** Capital allowed above the as-built configuration, as a fraction of it. */
  readonly headroom: number;
}

/**
 * The three constraints, and the first of them is the whole of retrofit.
 *
 * **`retrofit` is a constraint, not a mode.** § 4.4 asks for *"the same model with the fabric
 * frozen, which should fall out as a constraint rather than as a second module"*, and it does:
 * an empty {@link CapitalConstraint.editable} refuses all three dimensions by the same code path
 * that refuses one, so a retrofit screen is the commissioning screen with every fabric control
 * showing its own refusal and dispatch — which is not a commissioning dimension at all — left
 * alone. Nothing here knows the word *dispatch*, which is the point: `scope/permits.ts` already
 * forbids `within-day` for `commissioning`, so what a retrofit player may move lives in the shift
 * week's own controls and is governed there.
 *
 * The headroom of `0` on `retrofit` is not what makes it retrofit — the empty editable set is. It
 * is `0` so that a caller which somehow got past the scope refusal still cannot buy anything.
 */
export const CONSTRAINTS: readonly CapitalConstraint[] = Object.freeze([
  Object.freeze({
    id: 'retrofit',
    label: 'Retrofit',
    note: 'The shafts, the machines and their speeds are what the building already has. Nothing about the fabric moves this week.',
    editable: Object.freeze([]) as readonly CommissioningDimension[],
    headroom: 0,
  }),
  Object.freeze({
    id: 'refurbishment',
    label: 'Refurbishment',
    note: 'The shafts are cut and stay cut. New machines may go into them, at whatever speed the class is built for.',
    editable: Object.freeze(['machineClass', 'ratedSpeed']) as readonly CommissioningDimension[],
    headroom: 0.35,
  }),
  Object.freeze({
    id: 'new-build',
    label: 'New build',
    note: 'Nothing is poured yet. Choose the shafts, the machines and the speeds, and then live with them for the week.',
    editable: Object.freeze([
      'shafts',
      'machineClass',
      'ratedSpeed',
    ]) as readonly CommissioningDimension[],
    headroom: 1,
  }),
]);

export const RETROFIT_CONSTRAINT_ID = 'retrofit';

export function constraintById(id: string): CapitalConstraint | undefined {
  return CONSTRAINTS.find((entry) => entry.id === id);
}
