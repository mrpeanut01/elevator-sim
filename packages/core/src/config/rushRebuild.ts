/**
 * **The rush rebuild: the tiers a sitting may buy between its rounds, the record they fold into, and
 * the appliers that put that record into a run** — GitHub issue **#372**'s second criterion,
 * `docs/38` § 2.3 (*"Rebuilds the building between rounds, from the same price schedule as
 * Scenario"*), [§ D1295](../../../../DECISIONS.md).
 *
 * ## Why this is in `core`, and why it is not a shop
 *
 * `packages/server` replays a posted sitting and may not import the viewer, so the rule both ends
 * need lives in the package both already depend on. That is the ground `rushPurse.ts`,
 * `chimeLedger.ts` and `rushPrefit.ts` already sit here on. § D606 weighed moving the derivation
 * into `core` and declined it for one reason, which is still true and is still honoured: the shop
 * (`packages/viz/src/campaign/economy.ts#SHOP`) carries player-facing names, subtitles and effect
 * sentences, and moving those would put product copy outside the honesty corpus's reach.
 *
 * So what moved is the **copy-free half** and nothing else: for each tier a price row id, a category,
 * a level and the numbers it fits ({@link RUSH_REBUILD_TIERS}). No name, no sentence, no price in
 * units (the price is the schedule's, read through `priceSchedule.ts`), and no string a player meets.
 * `rushPrefit.ts`'s fixed kit was the first instance of this shape and is now one point of it: three
 * levels, {@link RUSH_PREFIT_LEVELS}, folded and applied by the same functions as any rebuild.
 *
 * ## The menu, and the two categories that are not on it
 *
 * Doors, Control and Car size at every tier, and Tenants at tier 1. **Shafts and Machines are off
 * the menu** because both need `packages/viz/src/commissioning/`, which owns the car-id scheme, the
 * bank's clamps and the double-deck rules; a second implementation here would be the answer that
 * drifts, and the ruling that scoped this lane leaves them off at first (swarm DP, lane AP-2).
 * **Tenants 2 and 3 are off it for a different reason, and it is a property of the board rather than
 * of the code.** Staggered starts keep two thirds of the start-time crowd and moving a tenant floor
 * moves people to other floors, so either one changes *who arrives*; a rush board ranks sittings that
 * met the identical crowd (§ D543), and a round played to a thinned or relocated crowd is a row that
 * met a different one. Tenants 1, the lobby marshal, changes how fast people board and nobody's
 * arrival, so it stays. Each refusal is a row of {@link RUSH_REBUILD_OFF_MENU}, owner-reversible one
 * row at a time.
 *
 * ## The fold is the campaign's, deliberately
 *
 * A category is fitted at one level and a tier's numbers are **absolute at that level**, which is
 * `campaign/fitOut.ts#fitOutOf`'s reading of the same table: level 3 is read whole rather than summed
 * on level 2, so buying Control 2 over Control 1 replaces zoning with a destination panel, exactly as
 * it does on a career tower. A tier **does not require the tier below** inside a sitting and a
 * rebuild is **instantaneous**, both the product owner's rulings of 2026-09-16 (§ D640, § D701), so a
 * sitting may go straight to any level and nothing here books a night.
 *
 * ## The appliers, and the one implementation each of them has
 *
 * {@link fitCarsOf} and {@link fitProfileOf} were `campaign/fitOut.ts`'s `carsFitted` and
 * `profileWithKit`, moved here unchanged when the server became their second caller: the viewer's
 * fold calls them for a career tower and a rush alike, and the server calls them for a replay, so a
 * door saving or a car size has one implementation and not two that agree today. The one place two
 * expressions remain is zoning: the viewer writes *zone the tower* as the `express` lever and lets
 * `authoring/dispatcherSpec.ts#profileFromSpec` decide what it means, and the server, which has no
 * levers, writes that lever's conclusion with {@link zonedProfileOf}. The two are held together by
 * runs: `packages/server/src/leaderboard/rushHoldAgreement.json` carries rebuilt cells each half plays
 * through its own path, and each is required to differ from the same cell unrebuilt.
 *
 * Recorded under [§ D1295](../../../../DECISIONS.md), which reaches past this module because it
 * moves § D606's boundary for numbers and amends what a rush board ranks.
 */

import { parseLoadDivisor } from './schema.js';
import { priceOf, purchaseUnits } from './priceSchedule.js';
import type { PriceSchedule } from './priceScheduleTypes.js';
import type { BuildingConfig, DispatchStageConfig, DispatcherProfile, ElevatorSpecs } from './types.js';

/* -------------------------------------------------------------------------- *
 * The record a rebuild folds into
 * -------------------------------------------------------------------------- */

/**
 * Everything a rush rebuild can do to a run, with every field resolved — the copy-free subset of the
 * viewer's `campaign/fitOut.ts#CampaignFitOut`, field for field and with the same identity values, so
 * a `CampaignFitOut` is one of these structurally and the appliers below take either.
 */
export interface RushFit {
  /** Seconds off each stop's door cycle. `0` is as shipped. */
  readonly doorSecondsSaved: number;
  /** Seconds off the hall-call dwell. `0` is as shipped. */
  readonly hallDwellSecondsSaved: number;
  /** Persons at rated load, or `undefined` for the car's own rating. */
  readonly carPersons: number | undefined;
  /** A ceiling on per-passenger transfer time, seconds, or `undefined` for none. */
  readonly transferCeilingS: number | undefined;
  /** Whether the group is worked as zones. */
  readonly zonesTheTower: boolean;
  /** The landing call's type, or `undefined` for the driving profile's own. */
  readonly callType: string | undefined;
  /** Whether the landing panel names the car, or `undefined` for the profile's own. */
  readonly passengerAssignment: string | undefined;
  /** The least the driving profile may weight `rideTime`. `0` is *whatever it already weights*. */
  readonly rideTimeWeightFloor: number;
}

/** What one tier fits — absolute at its level, and only the fields it names. */
export type RushFitDelta = Partial<RushFit>;

/** Nothing bought. Every applier returns its input by identity at this value. */
export const RUSH_AS_SHIPPED: RushFit = Object.freeze({
  doorSecondsSaved: 0,
  hallDwellSecondsSaved: 0,
  carPersons: undefined,
  transferCeilingS: undefined,
  zonesTheTower: false,
  callType: undefined,
  passengerAssignment: undefined,
  rideTimeWeightFloor: 0,
});

/** Whether `fit` is {@link RUSH_AS_SHIPPED} by value — a fit that crossed a structured clone is a fresh object. */
export function rushFitIsAsShipped(fit: RushFit | undefined): boolean {
  if (fit === undefined) return true;
  return (Object.keys(RUSH_AS_SHIPPED) as (keyof RushFit)[]).every((key) => fit[key] === RUSH_AS_SHIPPED[key]);
}

/* -------------------------------------------------------------------------- *
 * The menu
 * -------------------------------------------------------------------------- */

/** The categories a rush rebuild sells from, in the shop's order. */
export const RUSH_REBUILD_CATEGORY_IDS = ['doors', 'control', 'cars', 'tenants'] as const;

export type RushRebuildCategoryId = (typeof RUSH_REBUILD_CATEGORY_IDS)[number];

/** One tier a rebuild may buy. */
export interface RushRebuildTier {
  /** `data/price-schedule.json`'s row — the price, and the token a sitting's wire carries. */
  readonly priceId: string;
  readonly categoryId: RushRebuildCategoryId;
  /** 1-based, the shop's own level. */
  readonly level: number;
  /** What it fits, absolute at this level — the shop tier's `fits`, transcribed. */
  readonly fits: RushFitDelta;
}

/**
 * **Every tier a rush rebuild sells**, CHOSEN in scope by the ruling that scoped the lane (owner-
 * reversible as one constant) and transcribed in value from `campaign/economy.ts#SHOP`'s `fits`.
 *
 * A transcription rather than a read, because `core` may not import the viewer; and pinned rather
 * than trusted, because `packages/viz/src/everyday/rushRebuild.test.ts` asserts every row here has
 * the shop's own price id and the shop's own numbers, and that every shop tier is in exactly one of
 * this table and {@link RUSH_REBUILD_OFF_MENU}. A tier the shop gains goes red there until somebody
 * says which table it belongs in.
 */
export const RUSH_REBUILD_TIERS: readonly RushRebuildTier[] = Object.freeze([
  Object.freeze({ priceId: 'faster-doors', categoryId: 'doors' as const, level: 1, fits: Object.freeze({ doorSecondsSaved: 1 }) }),
  Object.freeze({
    priceId: 'door-sensors',
    categoryId: 'doors' as const,
    level: 2,
    fits: Object.freeze({ doorSecondsSaved: 1, hallDwellSecondsSaved: 1 }),
  }),
  Object.freeze({
    priceId: 'advance-opening',
    categoryId: 'doors' as const,
    level: 3,
    fits: Object.freeze({ doorSecondsSaved: 3, hallDwellSecondsSaved: 1 }),
  }),
  Object.freeze({ priceId: 'zone-the-tower', categoryId: 'control' as const, level: 1, fits: Object.freeze({ zonesTheTower: true }) }),
  Object.freeze({
    priceId: 'destination-panels',
    categoryId: 'control' as const,
    level: 2,
    fits: Object.freeze({ callType: 'mobile-credential', rideTimeWeightFloor: 0.5 }),
  }),
  Object.freeze({
    priceId: 'full-destination',
    categoryId: 'control' as const,
    level: 3,
    fits: Object.freeze({ callType: 'mobile-credential', passengerAssignment: 'panel', rideTimeWeightFloor: 1 }),
  }),
  Object.freeze({ priceId: 'larger-cars', categoryId: 'cars' as const, level: 1, fits: Object.freeze({ carPersons: 16 }) }),
  Object.freeze({ priceId: 'larger-cars-21', categoryId: 'cars' as const, level: 2, fits: Object.freeze({ carPersons: 21 }) }),
  Object.freeze({ priceId: 'queue-marshalling', categoryId: 'tenants' as const, level: 1, fits: Object.freeze({ transferCeilingS: 1.2 }) }),
]);

/** Why a shop tier is not on the rush menu — see the module docstring. */
export type RushOffMenuReason =
  /** It needs `commissioning/`, which the server may not import: Shafts and Machines. */
  | 'commissioning'
  /** It changes who arrives, and a rush board ranks sittings that met one crowd: Tenants 2 and 3. */
  | 'crowd';

/** One shop tier a rush rebuild refuses, and why. */
export interface RushOffMenuTier {
  readonly priceId: string;
  readonly categoryId: string;
  readonly level: number;
  readonly reason: RushOffMenuReason;
}

/**
 * **Every shop tier a rush rebuild refuses, by name.** Each row is owner-reversible on its own, and
 * moving one to {@link RUSH_REBUILD_TIERS} is the whole of lifting it (with, for the first reason, an
 * applier this module does not have).
 */
export const RUSH_REBUILD_OFF_MENU: readonly RushOffMenuTier[] = Object.freeze([
  Object.freeze({ priceId: 'machines-4mps', categoryId: 'machines', level: 1, reason: 'commissioning' as const }),
  Object.freeze({ priceId: 'machines-5mps', categoryId: 'machines', level: 2, reason: 'commissioning' as const }),
  Object.freeze({ priceId: 'machines-gearless', categoryId: 'machines', level: 3, reason: 'commissioning' as const }),
  Object.freeze({ priceId: 'new-car', categoryId: 'shafts', level: 1, reason: 'commissioning' as const }),
  Object.freeze({ priceId: 'fifth-car', categoryId: 'shafts', level: 2, reason: 'commissioning' as const }),
  Object.freeze({ priceId: 'staggered-starts', categoryId: 'tenants', level: 2, reason: 'crowd' as const }),
  Object.freeze({ priceId: 'move-a-tenant', categoryId: 'tenants', level: 3, reason: 'crowd' as const }),
]);

/** The tier a price id names, or `undefined` when it is not on the menu. */
export function rushRebuildTierOf(priceId: string): RushRebuildTier | undefined {
  return RUSH_REBUILD_TIERS.find((tier) => tier.priceId === priceId);
}

/** The off-menu row a price id names, or `undefined`. */
export function rushOffMenuTierOf(priceId: string): RushOffMenuTier | undefined {
  return RUSH_REBUILD_OFF_MENU.find((tier) => tier.priceId === priceId);
}

/* -------------------------------------------------------------------------- *
 * Levels, and what a rebuild may add to them
 * -------------------------------------------------------------------------- */

/** The level each category is fitted at. A category absent is as shipped. */
export type RushFitLevels = Readonly<Partial<Record<RushRebuildCategoryId, number>>>;

/** Nothing fitted. */
export const RUSH_NO_LEVELS: RushFitLevels = Object.freeze({});

/**
 * **`rush-prefit`'s kit as levels** — Doors 1, Control 1, Tenants 1 (§ D640). `rushPrefit.ts` keeps
 * the kit's three effects as named numbers because the viewer builds its own fit-out from them;
 * `rushPrefit.test.ts` holds those numbers equal to this fold.
 */
export const RUSH_PREFIT_LEVELS: RushFitLevels = Object.freeze({ doors: 1, control: 1, tenants: 1 });

/**
 * The record a set of levels folds to — one tier per category, absolute at its level, in the menu's
 * category order. A level the menu has no tier for is a caller's error and throws, because a fit
 * quietly read as *as shipped* would replay a different run from the one a player played.
 */
export function rushFitOf(levels: RushFitLevels): RushFit {
  let fit: RushFit = RUSH_AS_SHIPPED;
  for (const categoryId of RUSH_REBUILD_CATEGORY_IDS) {
    const level = levels[categoryId] ?? 0;
    if (level <= 0) continue;
    const tier = RUSH_REBUILD_TIERS.find((entry) => entry.categoryId === categoryId && entry.level === level);
    if (tier === undefined) throw new Error(`the rush menu has no ${categoryId} tier at level ${String(level)}`);
    fit = { ...fit, ...tier.fits };
  }
  return fit;
}

/** Why one tier of a rebuild cannot be bought. The server words each; the viewer never offers one. */
export type RushRebuildRefusal =
  | { readonly kind: 'unknown'; readonly priceId: string }
  | { readonly kind: 'off-menu'; readonly priceId: string; readonly tier: RushOffMenuTier }
  /** The category is already fitted at this level or above, so the purchase would change nothing. */
  | { readonly kind: 'already-fitted'; readonly priceId: string; readonly fittedLevel: number }
  /** Two tiers of one category in one rebuild: only the higher would be fitted, and the other paid for nothing. */
  | { readonly kind: 'same-category-twice'; readonly priceId: string; readonly categoryId: RushRebuildCategoryId };

/**
 * The levels after one rebuild, or every reason it cannot be bought.
 *
 * **A purchase that changes nothing is refused rather than charged**, which is `CLAUDE.md`'s
 * standing requirement pointed at a price: a tier at or below what the category already has would
 * take units and fit the same building, and a second tier of one category in one rebuild would pay
 * for a level the fold then discards.
 */
export function rushLevelsAfter(
  before: RushFitLevels,
  priceIds: readonly string[],
): { readonly ok: true; readonly levels: RushFitLevels } | { readonly ok: false; readonly refusals: readonly RushRebuildRefusal[] } {
  const refusals: RushRebuildRefusal[] = [];
  const seen = new Set<RushRebuildCategoryId>();
  const after: Partial<Record<RushRebuildCategoryId, number>> = { ...before };
  for (const priceId of priceIds) {
    const tier = rushRebuildTierOf(priceId);
    if (tier === undefined) {
      const off = rushOffMenuTierOf(priceId);
      refusals.push(off === undefined ? { kind: 'unknown', priceId } : { kind: 'off-menu', priceId, tier: off });
      continue;
    }
    if (seen.has(tier.categoryId)) {
      refusals.push({ kind: 'same-category-twice', priceId, categoryId: tier.categoryId });
      continue;
    }
    seen.add(tier.categoryId);
    const fitted = before[tier.categoryId] ?? 0;
    if (tier.level <= fitted) {
      refusals.push({ kind: 'already-fitted', priceId, fittedLevel: fitted });
      continue;
    }
    after[tier.categoryId] = tier.level;
  }
  return refusals.length > 0 ? { ok: false, refusals: Object.freeze(refusals) } : { ok: true, levels: Object.freeze(after) };
}

/**
 * What a rebuild costs, in units, from the schedule — the sum of each tier's own row.
 *
 * A sum and never a product: each tier is one flat purchase, and `priceSchedule.ts#purchaseUnits` is
 * where a row becomes a figure. Every id must already be on the menu ({@link rushLevelsAfter}).
 */
export function rushRebuildUnits(schedule: PriceSchedule, priceIds: readonly string[]): number {
  return priceIds.reduce((total, priceId) => total + purchaseUnits(priceOf(schedule, priceId)), 0);
}

/* -------------------------------------------------------------------------- *
 * The building
 * -------------------------------------------------------------------------- */

/** The floor a door cycle's two halves stop at, in seconds. Authored — see {@link doorCycleWithSaving}. */
export const MIN_DOOR_S = 0.8;

/**
 * A door cycle with `savedS` taken out of it — **close first, then open**.
 *
 * The order is the shop's door ladder read in reverse: L3 is *doors start opening as the car lands*,
 * which is the open half, and it is the tier that asks for more seconds than the close half can
 * give. Taking the close first therefore keeps L1 and L2 entirely inside the half a faster door
 * operator moves, and only the tier whose own sentence is about opening reaches the open figure.
 *
 * Both halves floor at {@link MIN_DOOR_S}, which is authored rather than cited: `data/` publishes no
 * minimum door time, the fastest shipped figure is `centerOpening`'s 1.8 s open, and a door given
 * zero seconds is not a fast door but an absent one.
 *
 * Each half is **clamped to the floor** rather than having a computed saving subtracted from it, so
 * a tier that asks for more than a door has lands on {@link MIN_DOOR_S} exactly rather than on
 * `0.7999999999999998`. A floor that is only approximately the floor is a floor a test cannot state.
 *
 * It moved here from `rushPrefit.ts` with the appliers that call it; that module re-exports it.
 */
export function doorCycleWithSaving(
  openS: number,
  closeS: number,
  savedS: number,
): { readonly openS: number; readonly closeS: number } {
  const nextClose = Math.max(MIN_DOOR_S, closeS - savedS);
  const takenFromClose = closeS - nextClose;
  const nextOpen = Math.max(MIN_DOOR_S, openS - (savedS - takenFromClose));
  return { openS: nextOpen, closeS: nextClose };
}

/** The four per-car fields of a fit — what {@link fitCarsOf} reads, and all a `CampaignFitOut` lends it. */
export type RushCarFit = Pick<RushFit, 'doorSecondsSaved' | 'hallDwellSecondsSaved' | 'carPersons' | 'transferCeilingS'>;

/**
 * Every car with the fit's door timings, hall dwell, rated load and transfer time on it.
 *
 * **Moved here unchanged from `campaign/fitOut.ts#carsFitted`**, which now calls it, when the server
 * became its second caller. Each field is resolved from the specs file **before** it is moved,
 * because a car that declares none is not a car with none: `doorOpenS` defaults to its `doorType`'s
 * figure and `dwellHallCallS` to the shared typical, so subtracting from an absent field would write
 * the saving as the whole value. `resolveCar` is where those defaults live and this reads the same
 * rows it does.
 *
 * Returns its input **by object identity** when the fit names no per-car field, which is what keeps
 * a building nothing was bought for byte-identical to one built before this existed.
 */
export function fitCarsOf(config: BuildingConfig, fit: RushCarFit, specs: ElevatorSpecs): BuildingConfig {
  const touchesCars =
    fit.doorSecondsSaved > 0 ||
    fit.hallDwellSecondsSaved > 0 ||
    fit.carPersons !== undefined ||
    fit.transferCeilingS !== undefined;
  if (!touchesCars) return config;

  const divisor = parseLoadDivisor(specs.conventions.personsPerRatedLoadUS, true);
  const transferDefault = transferDefaultOf(config, specs);

  return {
    ...config,
    banks: config.banks.map((bank) => ({
      ...bank,
      cars: bank.cars.map((car) => {
        const doorType = car.doorType ?? 'centerOpening';
        const timing = specs.doors[doorType];
        const openS = car.doorOpenS ?? timing?.openS ?? 0;
        const closeS = car.doorCloseS ?? timing?.closeS ?? 0;
        const cycle = doorCycleWithSaving(openS, closeS, fit.doorSecondsSaved);
        const hallS = car.dwellHallCallS ?? specs.doors.dwellHallCallS.typical;
        const wantedLb = fit.carPersons === undefined || divisor === undefined ? undefined : fit.carPersons * divisor;
        const spec = specs.classes.find((entry) => entry.id === car.spec);
        const transfer = car.passengerTransferS ?? transferDefault;
        return {
          ...car,
          ...(fit.doorSecondsSaved > 0 ? { doorOpenS: cycle.openS, doorCloseS: cycle.closeS } : {}),
          ...(fit.hallDwellSecondsSaved > 0
            ? { dwellHallCallS: Math.max(specs.doors.dwellHallCallS.min, hallS - fit.hallDwellSecondsSaved) }
            : {}),
          /*
           * **Never smaller than the car already is**, then clamped into the class's band.
           *
           * The `Math.max` is the ladder read honestly: *16-person cars* is a tier you buy, and a
           * building whose cars are already 16-person has bought nothing — it has not bought
           * 13-person ones. Without it the tier is a purchase that **shrinks** a car on any building
           * above its rung, which is a control moving the run in the direction opposite to its own
           * label. The clamp is second and is the viewer's `commissionedBuilding` rule verbatim: a
           * load outside the class's `capacityLbRange` is refused by the loader on a field the shop
           * has no control for, so choosing a class is choosing the sizes that class is built in.
           */
          ...(wantedLb === undefined || spec === undefined
            ? {}
            : loadOf(
                clamp(Math.max(wantedLb, car.ratedLoadLb ?? 0), spec.capacityLbRange[0], spec.capacityLbRange[1]),
                car.ratedLoadLbPerDeck,
              )),
          ...(fit.transferCeilingS === undefined || transfer === undefined
            ? {}
            : { passengerTransferS: Math.min(transfer, fit.transferCeilingS) }),
        };
      }),
    })),
  };
}

/**
 * A car's new rating, **with the per-deck half moved with it** where the car declares one.
 *
 * The loader states the coupling as an invariant of the document — it warns `deck-load-mismatch`
 * when the whole-car rating is not twice the per-deck one — so a bigger car whose per-deck figure
 * stayed behind would be a building describing hardware that does not exist. No shipped building
 * reaches this today (`vertical-city`'s double-deck shuttles are rated above both car-size tiers),
 * and `packages/viz/src/campaign/fitOut.test.ts` drives it directly for that reason.
 */
function loadOf(ratedLoadLb: number, perDeckLb: number | undefined): { readonly ratedLoadLb: number; readonly ratedLoadLbPerDeck?: number } {
  if (perDeckLb === undefined) return { ratedLoadLb };
  return { ratedLoadLb, ratedLoadLbPerDeck: ratedLoadLb / 2 };
}

/**
 * The per-passenger transfer time a car with none of its own would resolve to, or `undefined` for a
 * building type the table has no row for — `resolveCar`'s own answer. A ceiling over an unknown value
 * is not a ceiling, so such a car is left alone rather than given an invented office figure.
 */
function transferDefaultOf(config: BuildingConfig, specs: ElevatorSpecs): number | undefined {
  const value: unknown = specs.timing.passengerTransferS[config.type];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The building with a rush fit on it — a real edit to a real `BuildingConfig`, to be put back through
 * the caller's own `parseBuilding`/`resolveBuilding`. Identity at {@link RUSH_AS_SHIPPED}.
 *
 * Every menu tier is a per-car edit or a dispatch lever, so this is {@link fitCarsOf} and nothing
 * more: Shafts, Machines and the two tenant tiers that touch floors are off the menu (see the module
 * docstring), and that is what lets the server build a rebuilt tower without `commissioning/`.
 */
export function rushRebuiltBuilding(base: BuildingConfig, fit: RushFit, specs: ElevatorSpecs): BuildingConfig {
  if (rushFitIsAsShipped(fit)) return base;
  return fitCarsOf(base, fit, specs);
}

/**
 * **Whether buying `tier` over `before` would build the tower and the profile the sitting already
 * has** — so that a purchase which changes nothing is refused rather than charged, `CLAUDE.md`'s
 * standing requirement pointed at a price.
 *
 * Structural, and deliberately no more than that: it compares the fit's dispatch fields, and every
 * car's door, dwell, load and boarding figures as the run would read them in the building
 * {@link rushRebuiltBuilding} writes before and after — a pure function of the shipped document that
 * costs no simulation. **Measured on the shipped towers before it was written**
 * (wave AN lane AP-2's probe, `collective`, one rush seed): on `midtown-office` Car size 1 and Tenants 1
 * left every one of 3 584 legs where it was, because its cars are already rated for sixteen and its
 * lobby already boards at 1.2 s, and this answers `true` for both. **What it cannot see** is a tier
 * whose edit is real and whose run is not moved by it: on `garden-apartments` Control 1 and Control 2
 * each rewrite the profile and left all 3 466 legs where they were. That is a fact about one crowd
 * under one dispatcher, a switch later in the round could make either one count, and only a run can
 * tell; so those are sold, and the menu says that what a tier does to the next hold is not measured
 * before it is bought.
 */
export function rushTierChangesNothing(
  base: BuildingConfig,
  before: RushFitLevels,
  tier: RushRebuildTier,
  specs: ElevatorSpecs,
): boolean {
  const fitBefore = rushFitOf(before);
  const fitAfter = rushFitOf({ ...before, [tier.categoryId]: tier.level });
  const sameProfile =
    fitBefore.zonesTheTower === fitAfter.zonesTheTower &&
    fitBefore.callType === fitAfter.callType &&
    fitBefore.passengerAssignment === fitAfter.passengerAssignment &&
    fitBefore.rideTimeWeightFloor === fitAfter.rideTimeWeightFloor;
  if (!sameProfile) return false;
  return (
    JSON.stringify(effectiveCarsOf(rushRebuiltBuilding(base, fitAfter, specs), specs)) ===
    JSON.stringify(effectiveCarsOf(rushRebuiltBuilding(base, fitBefore, specs), specs))
  );
}

/**
 * Every car's five fields a rush fit can move, **as the run reads them**: the car's own value where it
 * declares one and the default `resolveCar` and {@link fitCarsOf} fall back to where it does not.
 *
 * Compared rather than the documents, because a fit can write a field a car left to its default with
 * the very value that default already was — Tenants 1 on an office tower writes `passengerTransferS:
 * 1.2` onto cars that inherit 1.2 from the building type — and two documents that differ in a field
 * the run reads the same are the same building to a passenger.
 */
function effectiveCarsOf(config: BuildingConfig, specs: ElevatorSpecs): readonly (readonly (number | undefined)[])[] {
  const transferDefault = transferDefaultOf(config, specs);
  return config.banks.flatMap((bank) =>
    bank.cars.map((car) => {
      const timing = specs.doors[car.doorType ?? 'centerOpening'];
      const spec = specs.classes.find((entry) => entry.id === car.spec);
      return [
        car.doorOpenS ?? timing?.openS,
        car.doorCloseS ?? timing?.closeS,
        car.dwellHallCallS ?? specs.doors.dwellHallCallS.typical,
        car.ratedLoadLb ?? spec?.capacityLbRange[0],
        car.ratedLoadLbPerDeck,
        car.passengerTransferS ?? transferDefault,
      ];
    }),
  );
}

/* -------------------------------------------------------------------------- *
 * The dispatcher
 * -------------------------------------------------------------------------- */

/** The split threshold a zoned group uses when the profile names none — `dispatcherSpec.ts`'s figure. */
const DEFAULT_SPLIT_THRESHOLD_PASSENGERS = 10;

/**
 * The profile with *the group is worked as zones* on it — Control 1, at `core`'s level.
 *
 * The viewer expresses this tier as the **`express` group lever** and lets
 * `authoring/dispatcherSpec.ts#profileFromSpec` decide what that lever means. The server has no
 * levers — it resolves a shipped profile by id — so what it needs is that lever's *conclusion*,
 * which is these three fields, each `profileFromSpec`'s own choice transcribed:
 *
 * - `dispatch.assignmentMode: 'split-demand'` — give each car a slice.
 * - `dispatch.splitThresholdPassengers` — **the profile's own if it declares one**, and
 *   {@link DEFAULT_SPLIT_THRESHOLD_PASSENGERS} otherwise, which is the `??` that module writes.
 * - `idle.parkingStrategy: 'zone-center'` — what zoning means to the idle stage, and it **overrides**
 *   whatever the profile parks on, because `parkingFor` puts express above the profile's own.
 *
 * Nothing else on the profile is touched. This was `rushPrefit.ts#prefittedRushProfile`'s body, which
 * now calls the general applier below.
 */
export function zonedProfileOf(profile: DispatcherProfile): DispatcherProfile {
  return {
    ...profile,
    dispatch: {
      ...(profile.dispatch ?? {}),
      assignmentMode: 'split-demand',
      splitThresholdPassengers: profile.dispatch?.splitThresholdPassengers ?? DEFAULT_SPLIT_THRESHOLD_PASSENGERS,
    },
    idle: { ...(profile.idle ?? {}), parkingStrategy: 'zone-center' },
  };
}

/** The three dispatch fields of a fit — what {@link fitProfileOf} reads, and all a `CampaignFitOut` lends it. */
export type RushProfileFit = Pick<RushFit, 'callType' | 'passengerAssignment' | 'rideTimeWeightFloor'>;

/**
 * The profile with the landing hardware on it — *how calls are gathered*, the shop's own subtitle
 * for Control.
 *
 * **Moved here unchanged from `campaign/fitOut.ts#profileWithKit`**, which re-exports it, when the
 * server became its second caller. Applied over whichever dispatcher is driving and never a fork of
 * one: the panel in the lobby is a fact about the building, and § 8.5's standing order still chooses
 * who drives. Returns its input **by object identity** when the fit names none of its fields.
 *
 * The ride-time weight is a **floor**, never an assignment — § D112's defect read forwards. A panel
 * that discloses a destination the cost function does not price changes no decision (measured:
 * bit-identical to `eta` at 8 of 8 matrix cells), so the tier both discloses and prices. A dispatcher
 * already pricing ride time higher keeps its own number.
 */
export function fitProfileOf(profile: DispatcherProfile, fit: RushProfileFit | undefined): DispatcherProfile {
  if (fit === undefined) return profile;
  if (fit.callType === undefined && fit.passengerAssignment === undefined && fit.rideTimeWeightFloor === 0) {
    return profile;
  }
  const dispatch: DispatchStageConfig = {
    ...(profile.dispatch ?? {}),
    ...(fit.callType === undefined ? {} : { callType: fit.callType as never }),
    ...(fit.passengerAssignment === undefined ? {} : { passengerAssignment: fit.passengerAssignment as never }),
  };
  const rideTime = Math.max(profile.weights['rideTime'] ?? 0, fit.rideTimeWeightFloor);
  const weights = rideTime === (profile.weights['rideTime'] ?? 0) ? profile.weights : { ...profile.weights, rideTime };
  return { ...profile, dispatch, weights };
}

/**
 * A round's base profile with a rush fit on it: zoning **in** at the bottom and the landing hardware
 * **on** at the top, the viewer's `dev/state.ts#drivingProfileOf` order. `rules` is the player's rule
 * list, applied between the two by the caller's own function, because a rule list is a preference and
 * a destination panel is hardware a preference may not un-install. Identity at
 * {@link RUSH_AS_SHIPPED} when `rules` is.
 *
 * **A switch target carries no fit**, in either half: the viewer writes the kit into the driving
 * profile only and hands the run a shipped profile as shipped on a handover, so a replay that fitted
 * one would be replaying a run no player can press. Whether a bought panel *should* survive a
 * handover is a product question and is not answered here.
 */
export function rushRebuiltProfile(
  profile: DispatcherProfile,
  fit: RushFit,
  rules: (profile: DispatcherProfile) => DispatcherProfile,
): DispatcherProfile {
  return fitProfileOf(rules(fit.zonesTheTower ? zonedProfileOf(profile) : profile), fit);
}
