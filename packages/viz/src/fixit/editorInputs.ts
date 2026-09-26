/**
 * **What both fix-it surfaces need to draw § D1000's five families**, computed once and in one
 * place, so the Everyday screen and the Engineer panel cannot disagree about which dials are live,
 * which values a select offers, or what a rezone may move.
 *
 * Everything here is a fact about the case and the order the player has built so far — never a
 * word. The words are `everyday/fixitScreenModel.ts`'s, where the honesty sweep reads them.
 *
 * ## The standing point the dials are drawn against
 *
 * A dial's *"as it stands"* is the profile the run carries **with every other edit applied but no
 * dial** — the case's as-built profile, any selected repair's dispatcher patch, and the parking
 * select. So selecting `fixed-floor` above is what makes the parking-floor dial appear below it, and
 * a door hold set above is what bounds the adaptive-dwell ceiling's options. That plan is built with
 * the dials emptied, which is why it can be built at all while a dial the player just moved is one
 * core would refuse: the refusal is reported by `fixit/run.ts#fixitPlanRefusalOf` on the full order,
 * not by the thing that draws the controls that could put it right.
 */

import type { BuildingConfig, DispatcherProfile, ResolvedBuilding } from '@elevator-sim/core/browser';

import { purchaseUnits } from '../pricing/parse.js';
import type { PriceSchedule } from '../pricing/types.js';
import { spendOf } from './engine.js';
import {
  dialGroupsOf,
  dialOptionsOf,
  dialValueText,
  doorDwellOptionsOf,
  feasibleDialOptionsOf,
  keyedBankIdOf,
  keyedBankNameOf,
  liveDialIdsOf,
  playerWordsOfDimension,
  pruneDials,
  rezoneFabricOf,
  rezonePathsOf,
  standingDialValuesOf,
  type DialOption,
  type RezoneBank,
  type RezoneCar,
} from './families.js';
import { fixitRunPlanOf, type FixitResources } from './run.js';
import { KEYED_BANK, type DialValue, type FixitCase, type FixitState, type TenancyCohort } from './types.js';

/** A schedule row's purchase state for this order. */
export interface RowPurchase {
  readonly changeId: string;
  readonly name: string;
  readonly units: number;
  /** Something in the order already buys this row, so a further setting in it costs nothing. */
  readonly bought: boolean;
  /** Buying the row fits the budget, or it is already bought. */
  readonly affordable: boolean;
}

/** One dial, as a surface draws it. */
export interface DialInput {
  readonly id: string;
  /** `core`'s words beside the row; `undefined` only on a content bug `playerWords.test.ts` catches. */
  readonly name: string;
  readonly effect: string;
  readonly standingText: string;
  readonly options: readonly DialOption[];
  /** The value the order holds, or `undefined` while the dial is left as it stands. */
  readonly selected: DialValue | undefined;
}

export interface DialGroupInput {
  readonly row: RowPurchase;
  readonly dials: readonly DialInput[];
}

export interface DoorInput {
  readonly row: RowPurchase;
  /** `EVERY_CAR` first, then each car, with the bank it runs in. */
  readonly targets: readonly { readonly key: string; readonly carId: string | undefined; readonly bankName: string | undefined }[];
  readonly hallOptions: readonly number[];
  readonly carOptions: readonly number[];
  /**
   * **What each target holds as it stands**, in seconds, per side — [§ D1020](../../../../DECISIONS.md)'s
   * UX item: *"as it stands" prints the as-built value*. A playtest read a diagnosis quoting eleven
   * seconds beside a select reading *as the car has it*, with no way to see the eleven. `undefined`
   * on the every-car target where the cars differ, because one figure would then be false of some.
   */
  readonly standing: Readonly<Record<string, { readonly hall: number | undefined; readonly car: number | undefined }>>;
}

/** A bank as the rezone control draws it — the as-built banks plus any keyed bank the order made. */
export interface RezoneBankInput extends RezoneBank {
  /** What it serves with nothing set: its as-built floors, or its car's source bank's for a keyed bank. */
  readonly standingFloors: readonly string[];
  /** What it serves in this order. */
  readonly floors: readonly string[];
  readonly keyed: boolean;
  readonly plated: boolean;
}

export interface RezoneInput {
  readonly row: RowPurchase;
  /**
   * **Which controls in the order buy the row** — lane AL-B, the post-AK panel's seat D H5. The
   * zoning step and the banks' own selects both resolve to `rezone-bank`, which the schedule
   * charges once however it is drawn; a surface that prices each at the row's figure shows two
   * prices for one charge. The two flags let the words say which control already pays.
   */
  readonly boughtByZoneStep: boolean;
  readonly boughtByBanks: boolean;
  readonly floorOrder: readonly string[];
  readonly cars: readonly (RezoneCar & { readonly target: string })[];
  readonly banks: readonly RezoneBankInput[];
}

/** The tenancy row — the cohorts the case authors, which on fifteen of the eighteen is none. */
export interface TenancyInput {
  readonly row: RowPurchase;
  readonly cohorts: readonly TenancyCohort[];
  readonly chosen: Readonly<Record<string, string>>;
}

export interface EditorInputs {
  readonly dialGroups: readonly DialGroupInput[];
  readonly door: DoorInput;
  readonly rezone: RezoneInput;
  readonly tenancy: TenancyInput;
}

function rowPurchase(
  entry: FixitCase,
  state: FixitState,
  schedule: PriceSchedule,
  changeId: string,
  bought: boolean,
): RowPurchase {
  const change = schedule.changes.find((candidate) => candidate.id === changeId);
  if (change === undefined) throw new Error(`fixit: the schedule prices no "${changeId}".`);
  const units = purchaseUnits(change);
  const spent = spendOf(entry, state, schedule).totalUnits;
  return {
    changeId,
    name: change.name,
    units,
    bought,
    affordable: bought || spent + units <= entry.budgetUnits,
  };
}

/** The shipped building a case is set in, as authored. */
function shippedOf(entry: FixitCase, resources: FixitResources): BuildingConfig {
  const found = resources.entries.find((candidate) => candidate.resolved.id === entry.buildingId);
  if (found === undefined) throw new Error(`fixit: case "${entry.id}" names a building this build does not ship.`);
  return found.config;
}

/**
 * The standing point: the order with its dials emptied, planned. Falls back to the as-built side
 * when even that cannot be planned — a rezone the loader refuses — so the controls that could put
 * the rezone right are still drawn.
 */
function standingPointOf(
  entry: FixitCase,
  state: FixitState,
  resources: FixitResources,
): { readonly profile: DispatcherProfile; readonly building: ResolvedBuilding } {
  try {
    const plan = fixitRunPlanOf(entry, { ...state, dispatcherDials: {} }, resources);
    return { profile: plan.asRepaired.dispatcherProfile, building: plan.asRepaired.building };
  } catch {
    const plan = fixitRunPlanOf(entry, { ...state, dispatcherDials: {}, carBanks: {}, bankFloors: {}, platedBankIds: [] }, resources);
    return { profile: plan.asRepaired.dispatcherProfile, building: plan.asRepaired.building };
  }
}

/**
 * Everything § D1000's five families draw for this case and this order — **remembered for the last
 * order asked about**, because a surface redraws the whole card on every press, including the ones
 * that change nothing here (a run starting, a run landing), and the answer plans the building twice.
 * Keyed on the case, its budget and the order, never on object identity: the Everyday screen hands a
 * fresh case object per read once a budget rung is bought.
 */
export function editorInputsOf(
  entry: FixitCase,
  state: FixitState,
  resources: FixitResources,
  schedule: PriceSchedule,
): EditorInputs {
  const key = `${entry.id}|${String(entry.budgetUnits)}|${JSON.stringify(state)}`;
  if (
    lastInputs !== undefined &&
    lastInputs.key === key &&
    lastInputs.resources === resources &&
    lastInputs.schedule === schedule
  ) {
    return lastInputs.inputs;
  }
  const inputs = computeEditorInputs(entry, state, resources, schedule);
  lastInputs = { key, resources, schedule, inputs };
  return inputs;
}

let lastInputs:
  | {
      readonly key: string;
      readonly resources: FixitResources;
      readonly schedule: PriceSchedule;
      readonly inputs: EditorInputs;
    }
  | undefined;

function computeEditorInputs(
  entry: FixitCase,
  state: FixitState,
  resources: FixitResources,
  schedule: PriceSchedule,
): EditorInputs {
  const standing = standingPointOf(entry, state, resources);
  const standingValues = standingDialValuesOf(standing.profile);
  const live = liveDialIdsOf(standing.profile, state.dispatcherDials);
  const target = { building: standing.building, elevatorSpecs: resources.elevatorSpecs };

  const dialGroups: DialGroupInput[] = [];
  for (const group of dialGroupsOf(schedule)) {
    const dials: DialInput[] = [];
    for (const parameter of group.parameters) {
      if (!live.has(parameter.id)) continue;
      const standingValue = standingValues.get(parameter.id);
      const words = playerWordsOfDimension(parameter.id);
      const others = Object.fromEntries(
        Object.entries(state.dispatcherDials).filter(([id]) => id !== parameter.id),
      );
      dials.push({
        id: parameter.id,
        name: words?.name ?? parameter.key,
        effect: words?.effect ?? '',
        standingText: standingValue === undefined ? '' : dialValueText(parameter, standingValue, standing.building),
        options: feasibleDialOptionsOf(
          parameter,
          dialOptionsOf(parameter, standingValue, standing.building),
          standing.profile,
          others,
          target,
        ),
        selected: state.dispatcherDials[parameter.id],
      });
    }
    if (dials.length === 0) continue;
    const bought =
      Object.keys(state.dispatcherDials).some((id) => group.parameters.some((parameter) => parameter.id === id)) ||
      (group.changeId === 'idle-parking' && state.parkingStrategy !== null);
    dialGroups.push({ row: rowPurchase(entry, state, schedule, group.changeId, bought), dials });
  }

  const asBuilt = fixitRunPlanOf(entry, { ...state, ...EMPTY_EDITOR_FABRIC }, resources).asBuilt.building;
  const fabric = rezoneFabricOf(asBuilt, shippedOf(entry, resources));
  const bankName = new Map(fabric.banks.map((bank) => [bank.id, bank.name]));

  const resolvedCars = asBuilt.banks.flatMap((bank) => bank.cars);
  const agreed = (values: readonly number[]): number | undefined =>
    values.length > 0 && values.every((value) => Math.abs(value - values[0]!) < 1e-9) ? values[0] : undefined;
  const doorStanding: Record<string, { hall: number | undefined; car: number | undefined }> = {
    '*': {
      hall: agreed(resolvedCars.map((car) => car.dwellHallCallS)),
      car: agreed(resolvedCars.map((car) => car.dwellCarCallS)),
    },
  };
  for (const car of resolvedCars) doorStanding[car.id] = { hall: car.dwellHallCallS, car: car.dwellCarCallS };
  const door: DoorInput = {
    row: rowPurchase(entry, state, schedule, 'door-dwell', Object.keys(state.doorDwell).length > 0),
    standing: doorStanding,
    targets: [
      { key: '*', carId: undefined, bankName: undefined },
      ...fabric.cars
        .filter((car) => car.standingBankId in Object.fromEntries(fabric.banks.map((bank) => [bank.id, true])))
        .map((car) => ({ key: car.id, carId: car.id, bankName: bankName.get(car.standingBankId) })),
    ],
    hallOptions: doorDwellOptionsOf('hall'),
    carOptions: doorDwellOptionsOf('car'),
  };

  const boughtByBanks = rezonePathsOf(state).length > 0;
  const boughtByZoneStep = state.zoneOverlapFloors > 0;
  const rezoneBought = boughtByBanks || boughtByZoneStep;
  const banks: RezoneBankInput[] = fabric.banks.map((bank) => ({
    ...bank,
    standingFloors: bank.servesFloors,
    floors: state.bankFloors[bank.id] ?? bank.servesFloors,
    keyed: false,
    plated: state.platedBankIds.includes(bank.id),
  }));
  for (const car of fabric.cars) {
    if (state.carBanks[car.id] !== KEYED_BANK) continue;
    const source = fabric.banks.find((bank) => bank.id === car.standingBankId);
    const standingFloors = car.homeFloors;
    const id = keyedBankIdOf(car.id);
    banks.push({
      id,
      name: keyedBankNameOf(car.id),
      servesFloors: standingFloors,
      paired: source?.paired ?? false,
      offPlate: false,
      standingFloors,
      floors: state.bankFloors[id] ?? standingFloors,
      keyed: true,
      plated: false,
    });
  }
  const rezone: RezoneInput = {
    row: rowPurchase(entry, state, schedule, 'rezone-bank', rezoneBought),
    boughtByZoneStep,
    boughtByBanks,
    floorOrder: fabric.floorOrder,
    cars: fabric.cars.map((car) => ({ ...car, target: state.carBanks[car.id] ?? car.standingBankId })),
    banks,
  };
  const tenancy: TenancyInput = {
    row: rowPurchase(entry, state, schedule, 'tenant-floors', Object.keys(state.tenancyPositions).length > 0),
    cohorts: entry.asBuilt.tenancy?.cohorts ?? [],
    chosen: state.tenancyPositions,
  };
  return { dialGroups, door, rezone, tenancy };
}

/**
 * The order with every dial its gate no longer admits taken out — `fixit/families.ts#pruneDials`
 * against the same standing point {@link editorInputsOf} draws the dials from. Both surfaces pass
 * every family press through this, so a dial is never charged for a gate the next press closed.
 */
export function withPrunedDials(entry: FixitCase, state: FixitState, resources: FixitResources): FixitState {
  if (Object.keys(state.dispatcherDials).length === 0) return state;
  const standing = standingPointOf(entry, state, resources);
  const dispatcherDials = pruneDials(standing.profile, state.dispatcherDials);
  return Object.keys(dispatcherDials).length === Object.keys(state.dispatcherDials).length
    ? state
    : { ...state, dispatcherDials };
}

/** The editor's families emptied — what the order looks like before any of them is touched. */
const EMPTY_EDITOR_FABRIC = Object.freeze({
  dispatcherDials: {},
  doorDwell: {},
  carBanks: {},
  bankFloors: {},
  platedBankIds: [] as readonly string[],
  selectedRepairIds: [] as readonly string[],
  tenancyPositions: {},
});
