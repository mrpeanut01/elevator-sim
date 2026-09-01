/**
 * **What a tower has bought, as a thing a run can be built from — GitHub issue #181's first clause.**
 *
 * ## The defect this closes, named because it is this repository's most expensive shape
 *
 * § 8's shop was a display of an economy. A tier could be bought, it cost units, it booked nights,
 * the month grid filled in, `fittedLevel` reported it live — and `everyday/host.ts#runCampaignDay`
 * wrote a tower's `buildingId` and `dispatcherId`, pressed run, and read no booking at all. The
 * player moved a control, a stored number changed, and **the legs of the day were byte-identical**.
 * That is `patternSwitching`'s defect with a shop in front of it (CLAUDE.md's standing requirement),
 * and the rule it is measured against is the same one: *move the control and require the run to
 * change, compared on the legs* — never on a summary line, a label or a purse.
 *
 * ## Three layers, and this is the middle one
 *
 * `campaign/economy.ts` says what a tier **costs** and, since this lane, what it **does**
 * ({@link FitOutDelta}, a column of § 8.2's table rather than a map beside it). This module folds
 * the live tiers into one {@link CampaignFitOut} and holds the four functions that put it into a
 * run. `dev/state.ts#shiftRunConfigOf` and `dev/state.ts#drivingProfileOf` call them — those are the
 * non-test callers, and they are named here rather than implied, because a barrel re-export and a
 * `{@link}` tag look exactly like a caller and are not one.
 *
 * ## The negative control is the first thing to read
 *
 * At {@link AS_BUILT} every function here returns its input **by object identity**, and `undefined`
 * means the same thing as `AS_BUILT`. `shift/incidents.ts` established the reason and it is not
 * stylistic: a run's building document is digested into a leaderboard board, so a config layer that
 * returned a fresh object for a no-op would move every board. It is also the claim that makes the
 * positive ones readable — a tower with nothing bought runs the day it ran before this module
 * existed, and `fitOut.test.ts` asserts that on the legs rather than on the objects alone.
 *
 * ## What it deliberately does not do
 *
 * It books nothing, spends nothing and decides nothing about legality: {@link fitOutOf} reads the
 * record `campaign/career.ts` holds and `campaign/economy.ts#fittedLevel` has already ruled on. It
 * is `commissioning/building.ts`'s division of labour one directory over — the applier applies, and
 * something else decides whether the choice was allowed.
 *
 * It also does **not** take a car out of passenger service for the nights a booking occupies. That
 * is `docs/32` GD11's ordering, it is a separate half of the same design, and the sentence claiming
 * it was withdrawn from the `shafts` tier by GitHub issue #272 rather than reworded. Nothing here
 * reinstates it, and `economy.test.ts`'s prose sweep is what would catch an attempt to.
 */

import {
  parseLoadDivisor,
  type BuildingConfig,
  type DispatchStageConfig,
  type DispatcherProfile,
  type ElevatorSpecs,
  type FloorConfig,
} from '@elevator-sim/core/browser';

import type { GroupLevers } from '../authoring/dispatcherSpec.js';
import { commissionedBuilding } from '../commissioning/building.js';
import { asBuiltChoices, choiceForBank, withBankChoice } from '../commissioning/choices.js';
import { commissionableClasses, type CommissioningChoices } from '../commissioning/types.js';

import {
  SHOP,
  shopTierAt,
  fittedLevel,
  type FitOutDelta,
  type TowerEconomy,
} from './economy.js';

/* -------------------------------------------------------------------------- *
 * The folded record
 * -------------------------------------------------------------------------- */

/**
 * Everything a tower's live kit does to one day, with every field resolved.
 *
 * Total rather than partial — every key present, `undefined` and the identity values spelled out —
 * because this crosses into `ViewerState` and a partial record there is a state two readers can
 * disagree about. {@link AS_BUILT} is the identity and is what *nothing bought* looks like.
 */
export interface CampaignFitOut {
  /** Shafts added to every bank. `0` is as built. */
  readonly extraShafts: number;
  /** The class every car is rebuilt to, or `undefined` for the class it already is. */
  readonly machineClassId: string | undefined;
  /** Rated top speed, m/s, or `undefined`. Never set without {@link machineClassId}. */
  readonly ratedSpeedMps: number | undefined;
  /** Persons at rated load, or `undefined` for the car's own rating. */
  readonly carPersons: number | undefined;
  /** Seconds off each stop's door cycle. `0` is as built. */
  readonly doorSecondsSaved: number;
  /** Seconds off the hall-call dwell. `0` is as built. */
  readonly hallDwellSecondsSaved: number;
  /** A ceiling on per-passenger transfer time, seconds, or `undefined` for no ceiling. */
  readonly transferCeilingS: number | undefined;
  /** Multiplier on the crowd's arrival rate. `1` is as built. */
  readonly arrivalRateFactor: number;
  /** Whether the heaviest tenant floor has come down. */
  readonly movesHeaviestTenantDown: boolean;
  /** Whether the bank is worked as zones — the `express` group lever. */
  readonly zonesTheTower: boolean;
  /** The landing call's type, or `undefined` for the driving profile's own. */
  readonly callType: string | undefined;
  /** Whether the landing panel names the car, or `undefined` for the profile's own. */
  readonly passengerAssignment: string | undefined;
  /** The least the driving profile may weight `rideTime`. `0` is *whatever it already weights*. */
  readonly rideTimeWeightFloor: number;
}

/** Nothing bought. Every applier below returns its input by identity at this value. */
export const AS_BUILT: CampaignFitOut = Object.freeze({
  extraShafts: 0,
  machineClassId: undefined,
  ratedSpeedMps: undefined,
  carPersons: undefined,
  doorSecondsSaved: 0,
  hallDwellSecondsSaved: 0,
  transferCeilingS: undefined,
  arrivalRateFactor: 1,
  movesHeaviestTenantDown: false,
  zonesTheTower: false,
  callType: undefined,
  passengerAssignment: undefined,
  rideTimeWeightFloor: 0,
});

/**
 * The kit a tower is actually running today — § 8.2's fitted level per category, folded.
 *
 * One delta per category and never two: {@link fittedLevel} answers with the **highest** live level
 * and every {@link FitOutDelta} is absolute at its own level, so *level 3* is read whole rather than
 * summed on top of *level 2*. A category with nothing live contributes nothing, which is what makes
 * a fresh tower fold to {@link AS_BUILT} exactly.
 *
 * The fold is generic over the table: there is no `if (categoryId === 'doors')` anywhere in this
 * file, which is CLAUDE.md invariant 7 read forwards — a category or a tier added to
 * `economy.ts#SHOP` is applied by this function without a line changing here.
 */
export function fitOutOf(tower: TowerEconomy): CampaignFitOut {
  let fit: CampaignFitOut = AS_BUILT;
  for (const category of SHOP) {
    const level = fittedLevel(tower, category.id);
    if (level <= 0) continue;
    const tier = shopTierAt(category.id, level);
    if (tier === undefined) continue;
    fit = withDelta(fit, tier.fits);
  }
  return fit;
}

/** One delta merged onto the fold. Absent keys leave the field alone; that is what *absolute* means. */
function withDelta(fit: CampaignFitOut, delta: FitOutDelta): CampaignFitOut {
  return {
    extraShafts: delta.extraShafts ?? fit.extraShafts,
    machineClassId: delta.machineClassId ?? fit.machineClassId,
    ratedSpeedMps: delta.ratedSpeedMps ?? fit.ratedSpeedMps,
    carPersons: delta.carPersons ?? fit.carPersons,
    doorSecondsSaved: delta.doorSecondsSaved ?? fit.doorSecondsSaved,
    hallDwellSecondsSaved: delta.hallDwellSecondsSaved ?? fit.hallDwellSecondsSaved,
    transferCeilingS: delta.transferCeilingS ?? fit.transferCeilingS,
    arrivalRateFactor: delta.arrivalRateFactor ?? fit.arrivalRateFactor,
    movesHeaviestTenantDown: delta.movesHeaviestTenantDown ?? fit.movesHeaviestTenantDown,
    zonesTheTower: delta.zonesTheTower ?? fit.zonesTheTower,
    callType: delta.callType ?? fit.callType,
    passengerAssignment: delta.passengerAssignment ?? fit.passengerAssignment,
    rideTimeWeightFloor: delta.rideTimeWeightFloor ?? fit.rideTimeWeightFloor,
  };
}

/**
 * Whether this fit-out is the identity — *nothing bought*, and byte-identical to no fit-out at all.
 *
 * Compared field by field against {@link AS_BUILT} rather than by object identity, because a
 * fit-out that has travelled through a structured clone (the run is built on a worker) is a fresh
 * object with the same values and must still be recognised.
 */
export function fitOutIsAsBuilt(fit: CampaignFitOut | undefined): boolean {
  if (fit === undefined) return true;
  return (Object.keys(AS_BUILT) as (keyof CampaignFitOut)[]).every(
    (key) => fit[key] === AS_BUILT[key],
  );
}

/* -------------------------------------------------------------------------- *
 * The building
 * -------------------------------------------------------------------------- */

/**
 * The building the day is run in, once the kit is in it.
 *
 * A **real edit to a real `BuildingConfig`**, put back through the caller's own
 * `parseBuilding`/`resolveBuilding` exactly as `shift/growth.ts` and `commissioning/building.ts`
 * are — the pattern and its reason are stated in the second of those: a purchase that only reached a
 * caption would be a dead seam, and a *lying* one, because the player chose it.
 *
 * ## The order, which is forced rather than stylistic
 *
 * 1. **Shafts, class and speed**, through `commissionedBuilding` rather than through a second
 *    implementation of shaft growth. It owns the car-id scheme, the *a bank keeps at least one car*
 *    clamp, and the double-deck rules; a copy here would be the second answer that drifts, and it
 *    would not have the leg-level tests `commissioning.test.ts` already runs over it.
 * 2. **The rated load**, after the class, because `capacityLbRange` is a property of the class and
 *    `core` refuses a car outside its own class's band. Choosing a class is choosing the sizes it
 *    is built in — `commissionedBuilding`'s own sentence — so the persons a `cars` tier bought are
 *    clamped into whatever band a `machines` tier left behind rather than silently overriding it.
 * 3. **The doors and the transfer time**, which are per-car and independent of the two above.
 * 4. **The tenant floor**, which is the only edit that touches `floors` rather than `banks`.
 *
 * Returns its input **by object identity** at {@link AS_BUILT}. See the module docstring.
 */
export function fittedBuilding(
  base: BuildingConfig,
  fit: CampaignFitOut | undefined,
  specs: ElevatorSpecs,
): BuildingConfig {
  if (fit === undefined || fitOutIsAsBuilt(fit)) return base;
  const classes = commissionableClasses(specs);
  const commissioned = commissionedBuilding(base, choicesFor(base, fit, specs), classes);
  const withCars = carsFitted(commissioned, fit, specs);
  return fit.movesHeaviestTenantDown ? tenantMovedDown(withCars) : withCars;
}

/**
 * The commissioning choices a fit-out asks for, over what the building already stands as.
 *
 * `asBuiltChoices` is what makes this a *delta*: a bank with no purchase against it keeps its own
 * shafts, class and speed, and `commissionedBuilding` then returns that bank untouched.
 */
function choicesFor(
  base: BuildingConfig,
  fit: CampaignFitOut,
  specs: ElevatorSpecs,
): CommissioningChoices {
  const classes = commissionableClasses(specs);
  let choices = asBuiltChoices(base, classes);
  if (fit.extraShafts === 0 && fit.machineClassId === undefined) return choices;
  for (const bank of base.banks) {
    const built = choiceForBank(choices, bank.id);
    if (built === undefined) continue;
    choices = withBankChoice(choices, {
      ...built,
      shafts: built.shafts + fit.extraShafts,
      ...(fit.machineClassId === undefined
        ? {}
        : { machineClassId: fit.machineClassId, ratedSpeedMps: fit.ratedSpeedMps ?? built.ratedSpeedMps }),
    });
  }
  return choices;
}

/**
 * Every car with the kit's door timings, rated load and transfer time on it.
 *
 * Each field is resolved from the specs file **before** it is moved, because a car that declares
 * none is not a car with none: `doorOpenS` defaults to its `doorType`'s figure and `dwellHallCallS`
 * to the shared typical, so subtracting from an absent field would write the saving as the whole
 * value. `resolveCar` is where those defaults live and this reads the same rows it does.
 */
function carsFitted(
  config: BuildingConfig,
  fit: CampaignFitOut,
  specs: ElevatorSpecs,
): BuildingConfig {
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
        const cycle = doorCycle(openS, closeS, fit.doorSecondsSaved);
        const hallS = car.dwellHallCallS ?? specs.doors.dwellHallCallS.typical;
        const wantedLb =
          fit.carPersons === undefined || divisor === undefined
            ? undefined
            : fit.carPersons * divisor;
        const spec = specs.classes.find((entry) => entry.id === car.spec);
        const transfer = car.passengerTransferS ?? transferDefault;
        return {
          ...car,
          ...(fit.doorSecondsSaved > 0 ? { doorOpenS: cycle.openS, doorCloseS: cycle.closeS } : {}),
          ...(fit.hallDwellSecondsSaved > 0
            ? {
                dwellHallCallS: Math.max(
                  specs.doors.dwellHallCallS.min,
                  hallS - fit.hallDwellSecondsSaved,
                ),
              }
            : {}),
          /*
           * **Never smaller than the car already is**, then clamped into the class's band.
           *
           * The `Math.max` is the ladder read honestly: *16-person cars* is a tier you buy, and a
           * building whose cars are already 16-person has bought nothing — it has not bought
           * 13-person ones. Without it the tier is a purchase that **shrinks** a car on any
           * building above its rung, which is a control moving the run in the direction opposite to
           * its own label. The clamp is second and is `commissionedBuilding`'s rule verbatim: a
           * load outside the class's `capacityLbRange` is refused by `core` on a field the shop has
           * no control for, so choosing a class is choosing the sizes that class is built in.
           */
          ...(wantedLb === undefined || spec === undefined
            ? {}
            : {
                ratedLoadLb: clamp(
                  Math.max(wantedLb, car.ratedLoadLb ?? 0),
                  spec.capacityLbRange[0],
                  spec.capacityLbRange[1],
                ),
              }),
          ...(fit.transferCeilingS === undefined || transfer === undefined
            ? {}
            : { passengerTransferS: Math.min(transfer, fit.transferCeilingS) }),
        };
      }),
    })),
  };
}

/**
 * The door cycle with `saved` seconds taken out of it — **close first, then open**.
 *
 * The order is the tier ladder read in reverse: `doors` L3 is *doors start opening as the car
 * lands*, which is the open half, and it is the tier that asks for more seconds than the close half
 * can give. Taking the close first therefore keeps L1 and L2 entirely inside the half a faster door
 * operator moves, and only the tier whose own sentence is about opening reaches the open figure.
 *
 * Both halves floor at {@link MIN_DOOR_S}, which is authored here and said so: `data/` publishes no
 * minimum door time, the fastest shipped figure is `centerOpening`'s 1.8 s open, and a door given
 * zero seconds is not a fast door but an absent one.
 */
function doorCycle(
  openS: number,
  closeS: number,
  saved: number,
): { readonly openS: number; readonly closeS: number } {
  /*
   * Each half is clamped to the floor rather than having a computed saving subtracted from it, so a
   * tier that asks for more than a door has lands on {@link MIN_DOOR_S} **exactly** rather than on
   * 0.7999999999999998. A floor that is only approximately the floor is a floor a test cannot state.
   */
  const nextClose = Math.max(MIN_DOOR_S, closeS - saved);
  const takenFromClose = closeS - nextClose;
  const nextOpen = Math.max(MIN_DOOR_S, openS - (saved - takenFromClose));
  return { openS: nextOpen, closeS: nextClose };
}

/** The floor a door cycle's two halves stop at. Authored — see {@link doorCycle}. */
export const MIN_DOOR_S = 0.8;

/**
 * The per-passenger transfer time a car with none of its own would resolve to.
 *
 * `undefined` for a building type the table has no row for, which is `resolveCar`'s own answer and
 * an error there rather than the office figure. A ceiling over an unknown value is not a ceiling, so
 * this tier leaves such a car alone instead of inventing the number the loader refuses to.
 */
function transferDefaultOf(config: BuildingConfig, specs: ElevatorSpecs): number | undefined {
  const value: unknown = specs.timing.passengerTransferS[config.type];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * The heaviest tenant floor's population moved to the lowest floors above the entrance.
 *
 * **The total is preserved**, which is the whole difference between this tier and `tenants` L2: the
 * same crowd in a different place. `resolveBuilding` warns `population-mismatch` when a declared
 * `totalPopulation` disagrees with the floor sum, so a move that lost or gained a person would load
 * with a warning on a run nobody asked a question about.
 *
 * Two floors, because the tier's own sentence is *floors 3–4*, and the remainder goes to the lower
 * of them so an odd population is deterministic. The **source** is the highest-index floor among
 * those tied for the largest population — *comes down* is only meaningful from above, and a tie
 * broken by index is a total order rather than a draw (CLAUDE.md invariant 2's shape, one layer up).
 *
 * A building with fewer than two floors above its entrance, or one already at its own bottom, is
 * returned untouched: there is nowhere to come down to, and moving a floor onto itself would be a
 * fresh object for a no-op.
 */
function tenantMovedDown(config: BuildingConfig): BuildingConfig {
  const floors = config.floors;
  if (floors === undefined) return config;
  const above = floors.filter((floor) => floor.isEntrance !== true);
  if (above.length < 3) return config;
  const byIndex = [...above].sort((a, b) => a.index - b.index);
  const targets = byIndex.slice(0, 2);
  const heaviest = [...above]
    .sort((a, b) => (a.population === b.population ? a.index - b.index : a.population - b.population))
    .at(-1);
  if (heaviest === undefined) return config;
  if (targets.some((floor) => floor.id === heaviest.id)) return config;
  if (heaviest.population === 0) return config;

  const share = Math.floor(heaviest.population / targets.length);
  const moved = new Map<string, number>([[heaviest.id, 0]]);
  targets.forEach((floor, position) => {
    const extra = position === 0 ? heaviest.population - share * targets.length : 0;
    moved.set(floor.id, floor.population + share + extra);
  });

  const next: readonly FloorConfig[] = floors.map((floor) => {
    const population = moved.get(floor.id);
    return population === undefined ? floor : { ...floor, population };
  });
  return { ...config, floors: next };
}

/* -------------------------------------------------------------------------- *
 * The crowd
 * -------------------------------------------------------------------------- */

/**
 * The arrival rate the day runs at, once the tenants have been negotiated with.
 *
 * Takes the rate the run would otherwise have used — `dev/state.ts#baseOf`'s answer, which is the
 * pattern's if one was chosen and the building's own profile at its typical level if not — so the
 * factor is applied to a real number rather than to a reconstruction of one.
 */
export function fittedArrivalRate(baseRatePct: number, fit: CampaignFitOut | undefined): number {
  if (fit === undefined || fit.arrivalRateFactor === 1) return baseRatePct;
  return baseRatePct * fit.arrivalRateFactor;
}

/* -------------------------------------------------------------------------- *
 * The dispatcher
 * -------------------------------------------------------------------------- */

/**
 * The group levers the kit implies, over the levers the player has pulled.
 *
 * `zonesTheTower` is written as `express` rather than as a pair of dispatch fields because
 * `authoring/dispatcherSpec.ts#profileFromSpec` already owns what that lever means. The two are
 * OR-ed rather than overwritten: a player who pulled the express lever and a tower that bought
 * zoning are making the same request, and a kit that could switch a pulled lever *off* would be a
 * purchase undoing a control.
 */
export function leversWithKit(
  levers: GroupLevers,
  fit: CampaignFitOut | undefined,
): GroupLevers {
  if (fit === undefined || !fit.zonesTheTower || levers.express) return levers;
  return { ...levers, express: true };
}

/**
 * The driving profile with the landing hardware on it — *how calls are gathered*, § 8.2's own
 * subtitle for the `control` category.
 *
 * ## Applied over whichever dispatcher is driving, never a fork of one
 *
 * The same shape as `profileWithSelector` and `profileWithRules`, and for the same reason
 * `ViewerState.levers` sits outside `dispatcherSpec`: the panel in the lobby is a fact about the
 * **building**, and folding it into the dispatcher's working copy would mean that buying a panel
 * silently forked the profile named in the rail. § 8.5's standing order still chooses who drives.
 *
 * ## Written last, and that is a claim rather than a convenience
 *
 * `profileWithSelector` and `profileWithRules` write `selection`; this writes `dispatch`. The two
 * are disjoint, so the ordering cannot change a value — what it says is that a rule list is a
 * preference and a destination panel is hardware, and a preference may not un-install hardware.
 *
 * Returns its input **by object identity** when the kit names neither field.
 */
export function profileWithKit(
  profile: DispatcherProfile,
  fit: CampaignFitOut | undefined,
): DispatcherProfile {
  if (fit === undefined) return profile;
  if (
    fit.callType === undefined &&
    fit.passengerAssignment === undefined &&
    fit.rideTimeWeightFloor === 0
  ) {
    return profile;
  }
  const dispatch: DispatchStageConfig = {
    ...(profile.dispatch ?? {}),
    ...(fit.callType === undefined ? {} : { callType: fit.callType as never }),
    ...(fit.passengerAssignment === undefined
      ? {}
      : { passengerAssignment: fit.passengerAssignment as never }),
  };
  /*
   * The **floor**, never an assignment — § D112's defect read forwards. A panel that discloses a
   * destination the cost function does not price changes no decision (measured: bit-identical to
   * `eta` at 8 of 8 matrix cells), so the kit both discloses and prices. A dispatcher already
   * pricing ride time higher keeps its own number, which is what makes this a purchase raising a
   * floor rather than a purchase overruling the § 8.5 standing order.
   */
  const rideTime = Math.max(profile.weights['rideTime'] ?? 0, fit.rideTimeWeightFloor);
  const weights =
    rideTime === (profile.weights['rideTime'] ?? 0)
      ? profile.weights
      : { ...profile.weights, rideTime };
  return { ...profile, dispatch, weights };
}

/* -------------------------------------------------------------------------- *
 * Small shared arithmetic
 * -------------------------------------------------------------------------- */

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
