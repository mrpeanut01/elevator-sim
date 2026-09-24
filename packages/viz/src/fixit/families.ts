/**
 * **The fix-it editor's change families beyond § 10.3's five controls** —
 * [§ D706](../../../../DECISIONS.md) § 1's six, less one, built by [§ D1000](../../../../DECISIONS.md).
 *
 * § D706 measured that every one of the eighteen shipped cases' diagnosed answers buys a path
 * `data/price-schedule.json#changes[].covers` already prices, and that the gap between the menu and
 * the editor was a **drawn-control** gap and nothing else: six schedule rows the editor did not
 * draw. This module is five of them.
 *
 * | schedule row | what the editor now writes | how it reaches the run |
 * |---|---|---|
 * | `idle-parking` | every idle dimension — the strategy select gains its last two strategies, and the floor, deadband and energy weight are dials | the profile, through the declared search space |
 * | `dispatch-rules` | every dimension the row covers — assignment mode and split threshold, the cost-term weights, eligibility, the no-reversal constraint and the sole-car bypass | the same |
 * | `dwell-policy` | fixed or adaptive dwell, its gain and its ceiling | the same |
 * | `door-dwell` | the hall-call and car-call door hold, for every car or one car | a {@link CarPatch} |
 * | `rezone-bank` | which bank a car runs in (including a bank of its own, or none), which floors a bank serves, and whether a bank's cars weigh against their plate | the `banks` array the loader re-validates |
 *
 * **The sixth, `tenant-floors`, is not built here**, and not for want of a control. Offered as a
 * flat 2 u rewrite of `floorPopulations`, it is nearly a universal answer: a probe that keeps a
 * third of every floor's as-built headcount clears **14 of the 18** cases, including cases whose
 * fault is a door, a lockout or a zone boundary. How it may be offered is being ruled on by a
 * decision agent under delegated authority; § D1000 records the measurement and the question, and
 * rules on neither.
 *
 * ## The dials are the declared space, not a list written here
 *
 * The three dispatcher rows' dimensions are **derived**: `scenario/survivorSpace.ts#dimensionsCoveredBy`
 * walks each row's `covers` against `collectSearchSpace()`, so a dimension added to one of those rows
 * arrives here with no edit, and one that leaves goes. Every value a dial can hold is inside the
 * dimension's declared range; every edit goes through `controls/editedProfile.ts`'s four refusals
 * (declared id, declared bound, core's own constructor, and this building's cars), so a dial cannot
 * write a dispatcher core would refuse to build. `idle.parkingStrategy` is the one exception, and only
 * to the extent that it keeps the select it already had.
 *
 * ## What a dial's options are
 *
 * A select, always, and the standing value is **not** among them — the option that would write
 * what the run already carries is the inert press [§ D219](../../../../DECISIONS.md) names, and
 * *"leave it as the building has it"* is already the select's first entry. Categorical and boolean
 * dimensions offer their declared values. A numeric one offers a grid over its declared range at
 * {@link gridStepOf}'s step. `idle.parkingFloorIndex` is the one dimension whose declared range is
 * wider than any building — `[-5, 160]`, *"because the schema does not know the building"* — so it
 * offers the floors this building's banks serve, named by their own ids.
 *
 * **Everything here is pure.** `fixit/run.ts` applies it; the two surfaces draw it.
 */

import {
  DISPATCH_PARAMETERS,
  DOOR_PARAMETERS,
  type PlayerControlWords,
  type BuildingConfig,
  type DispatcherProfile,
  type ElevatorSpecs,
  type ResolvedBuilding,
} from '@elevator-sim/core/browser';
import {
  candidateProfile,
  collectSearchSpace,
  type ParameterValue,
  type SearchParameter,
  type SearchSpace,
} from '@elevator-sim/experiments/browser';

import { controlsFor } from '../controls/controls.js';
import { admitEditedVector, valuesFromProfile } from '../controls/editedProfile.js';
import type { PriceSchedule } from '../pricing/types.js';
import { dimensionsCoveredBy } from '../scenario/survivorSpace.js';
import type { CarPatch, DialValue, DoorDwellSetting, FixitState, FixitTenancy } from './types.js';
import { EVERY_CAR, KEYED_BANK, OUT_OF_SERVICE } from './types.js';

/* -------------------------------------------------------------------------- *
 * The dispatcher-tier dials
 * -------------------------------------------------------------------------- */

/** The schedule rows whose dimensions the editor draws as dials, in the order it draws them. */
export const DIAL_CHANGE_IDS: readonly string[] = Object.freeze([
  'idle-parking',
  'dispatch-rules',
  'dwell-policy',
]);

/** The one covered dimension with a control of its own — the parking select. */
const OWN_CONTROL = 'idle.parkingStrategy';

/**
 * **Covered dimensions the editor does not draw, because moving them moves no leg on any building a
 * fix case is set in** — [§ D219](../../../../DECISIONS.md)'s defect, found by running every dial
 * rather than by reading them, and held **both ways** by `families.test.ts`: every entry here must
 * still leave all eighteen cases' legs untouched at both ends of its range, so the day a fix case
 * is set in a building where it binds, the register entry fails and has to go.
 */
export const INERT_DIALS: Readonly<Record<string, string>> = Object.freeze({
  'weights.dutyMismatch':
    'the term prices a rider riding a car of the wrong duty, and no building a fix case is set in ' +
    'declares a duty on any car, so the term is zero on every call whatever it is weighted.',
});

/** The dimension whose options are this building's floors rather than its declared range. */
export const PARKING_FLOOR_DIMENSION = 'idle.parkingFloorIndex';

let cachedSpace: SearchSpace | undefined;

/**
 * The declared search space the dials are drawn from. `collectSearchSpace()` is pure and walks every
 * declared schema, so it is collected once per process rather than once per press.
 */
export function fixitDialSpace(): SearchSpace {
  cachedSpace ??= collectSearchSpace();
  return cachedSpace;
}

/** One dial group — a schedule row and the dimensions it prices. */
export interface DialGroup {
  readonly changeId: string;
  readonly name: string;
  readonly parameters: readonly SearchParameter[];
}

/**
 * The dials the editor offers, grouped by the schedule row that prices them. **Derived**, see the
 * module docstring; a row the schedule does not carry contributes nothing rather than throwing,
 * because an absent row is a price list that sells nothing there.
 */
export function dialGroupsOf(schedule: PriceSchedule, space: SearchSpace = fixitDialSpace()): readonly DialGroup[] {
  const groups: DialGroup[] = [];
  for (const changeId of DIAL_CHANGE_IDS) {
    const change = schedule.changes.find((candidate) => candidate.id === changeId);
    if (change === undefined) continue;
    const parameters = dimensionsCoveredBy(space, change)
      .filter((id) => id !== OWN_CONTROL && INERT_DIALS[id] === undefined)
      .map((id) => space.byId.get(id))
      .filter((parameter): parameter is SearchParameter => parameter !== undefined);
    if (parameters.length > 0) groups.push({ changeId, name: change.name, parameters });
  }
  return groups;
}

/**
 * The grid step for a numeric dimension: a power of ten, the largest that still leaves at least
 * twenty steps across the declared range. `[0, 2]` steps by 0.1, `[4, 30]` and `[0, 60]` by 1.
 * Integers never step by less than one.
 */
export function gridStepOf(parameter: SearchParameter): number {
  if (parameter.type !== 'continuous' && parameter.type !== 'integer') return 1;
  const span = parameter.max - parameter.min;
  const step = span <= 0 ? 1 : 10 ** Math.floor(Math.log10(span / 20));
  return parameter.type === 'integer' ? Math.max(1, Math.round(step)) : step;
}

/** A value rounded onto a step's decimals, so `0.1 * 3` reads `0.3` and compares equal to it. */
function onGrid(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number(value.toFixed(decimals));
}

/** One entry in a dial's select. */
export interface DialOption {
  readonly value: DialValue;
  /** The value as a player reads it — a floor's own id for the parking floor. */
  readonly text: string;
}

function sameValue(a: DialValue | undefined, b: DialValue | undefined): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return a === b;
}

/** A value as the select prints it. */
export function dialValueText(parameter: SearchParameter, value: DialValue, building?: ResolvedBuilding): string {
  if (parameter.id === PARKING_FLOOR_DIMENSION && typeof value === 'number' && building !== undefined) {
    const floor = building.floors.find((candidate) => candidate.index === value);
    if (floor !== undefined) return floor.id;
  }
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'string') return playerWordsOfDimension(parameter.id)?.values?.[value] ?? value;
  if (typeof value === 'number') {
    const text = String(onGrid(value, gridStepOf(parameter)));
    return parameter.unit === undefined ? text : `${text} ${parameter.unit}`;
  }
  return value;
}

/**
 * The options a dial offers on this building, **less its standing value** — see the module
 * docstring. `standing` is what the run carries without the dial; `undefined` offers everything.
 */
export function dialOptionsOf(
  parameter: SearchParameter,
  standing: DialValue | undefined,
  building: ResolvedBuilding,
): readonly DialOption[] {
  let values: DialValue[];
  if (parameter.id === PARKING_FLOOR_DIMENSION) {
    const served = new Set(building.banks.flatMap((bank) => [...bank.servesFloors]));
    values = building.floors.filter((floor) => served.has(floor.id)).map((floor) => floor.index);
  } else {
    switch (parameter.type) {
      case 'categorical':
        values = [...parameter.values];
        break;
      case 'boolean':
        values = [true, false];
        break;
      case 'continuous':
      case 'integer': {
        const step = gridStepOf(parameter);
        values = [];
        for (let k = 0; ; k += 1) {
          const value = onGrid(parameter.min + k * step, step);
          if (value > parameter.max + 1e-9) break;
          values.push(value);
        }
        break;
      }
    }
  }
  return values
    .filter((value) => !sameValue(value, standing))
    .map((value) => ({ value, text: dialValueText(parameter, value, building) }));
}

/**
 * **The options a player could actually run** — {@link dialOptionsOf} less every value core would
 * turn down on this building, for the dimensions whose bound is a car's rather than the schema's.
 *
 * `controls/editedProfile.ts` names two: `answer.maxDwellS` under adaptive dwell must be at least
 * the car's larger base dwell, and `answer.bypassLoadThreshold` may not exceed the overload
 * threshold. Both are `answer.*`, so only that section is checked value by value — the check builds
 * every car of the building, and doing it for a fifty-value weight grid on every render would be the
 * screen paying for a check no weight can fail. An option this drops is one a press could only
 * turn into a held Run button, which is the worse place to learn it.
 */
export function feasibleDialOptionsOf(
  parameter: SearchParameter,
  options: readonly DialOption[],
  profile: DispatcherProfile,
  dials: Readonly<Record<string, DialValue>>,
  target: { readonly building: ResolvedBuilding; readonly elevatorSpecs: ElevatorSpecs | undefined },
  space: SearchSpace = fixitDialSpace(),
): readonly DialOption[] {
  if (parameter.section !== 'answer') return options;
  const order = new Map(space.ids.map((id, index) => [id, index]));
  return options.filter((option) => {
    const edit = Object.fromEntries(
      Object.entries({ ...dials, [parameter.id]: option.value }).sort(
        ([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
      ),
    );
    return admitEditedVector(space, profile, edit, target).admissible;
  });
}

/** What a dial reads on the standing profile — the value the run carries with no dial set. */
export function standingDialValuesOf(
  profile: DispatcherProfile,
  space: SearchSpace = fixitDialSpace(),
): ReadonlyMap<string, ParameterValue> {
  return valuesFromProfile(space, profile);
}

/**
 * **The dials that are live at a point** — the dimension ids whose `activeWhen` the profile plus
 * the moved dials satisfy. `controls/controls.ts#controlsFor` answers it, which is `tuning/space`'s
 * own gate rule by import, so this cannot disagree with what the run's admission checks.
 */
export function liveDialIdsOf(
  profile: DispatcherProfile,
  dials: Readonly<Record<string, DialValue>>,
  space: SearchSpace = fixitDialSpace(),
): ReadonlySet<string> {
  const values = new Map(valuesFromProfile(space, profile));
  for (const [id, value] of Object.entries(dials)) values.set(id, value);
  return new Set(controlsFor(space, values).filter((control) => control.enabled).map((control) => control.id));
}

/**
 * The dials with every one its gate no longer admits taken out.
 *
 * A dial whose gate has closed — `idle.repositionEnergyWeight` once parking is back to `stay` —
 * would otherwise go on being **charged** and never applied, which is a price for nothing. The
 * surfaces call this after every press that can move a gate, and `fixit/run.ts` refuses an inactive
 * dial loudly rather than skipping it, so a surface that forgets fails on its first run.
 *
 * Iterated to a fixed point, because closing one gate can close the gate of a dial below it.
 */
export function pruneDials(
  profile: DispatcherProfile,
  dials: Readonly<Record<string, DialValue>>,
  space: SearchSpace = fixitDialSpace(),
): Readonly<Record<string, DialValue>> {
  let current: Record<string, DialValue> = { ...dials };
  for (;;) {
    const live = liveDialIdsOf(profile, current, space);
    const next = Object.fromEntries(Object.entries(current).filter(([id]) => live.has(id)));
    if (Object.keys(next).length === Object.keys(current).length) return current;
    current = next;
  }
}

/**
 * The profile a set of dials makes of a base profile, **on this building** — or a throw carrying
 * core's own refusal. Applied in the space's declaration order, which is gate order: a gate and its
 * dependant moved together land in one pass.
 *
 * The profile keeps the base's id and name. A dial is an edit to the building's standing order, not
 * a second dispatcher, and a report that named a new id would be naming something nobody chose.
 */
export function profileWithDials(
  base: DispatcherProfile,
  dials: Readonly<Record<string, DialValue>>,
  target: { readonly building: ResolvedBuilding; readonly elevatorSpecs: ElevatorSpecs | undefined },
  space: SearchSpace = fixitDialSpace(),
): DispatcherProfile {
  const entries = Object.entries(dials);
  if (entries.length === 0) return base;
  const order = new Map(space.ids.map((id, index) => [id, index]));
  const edit = Object.fromEntries(
    [...entries].sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
  );
  const admission = admitEditedVector(space, base, edit, target);
  if (!admission.admissible || admission.candidate === undefined) {
    throw new Error(`fixit: the dispatcher settings cannot run on this building — ${admission.reason ?? 'refused'}`);
  }
  return candidateProfile(space, admission.candidate, { id: base.id, name: base.name, base });
}

/**
 * **A dial's player-facing words**, read from beside the row that declares it — `core`'s
 * `DISPATCH_PARAMETERS` or `DOOR_PARAMETERS` — and never authored here: GitHub issue #147's rule
 * that an id-to-prose table on a screen is the defect. `core/src/dispatch/playerWords.test.ts`
 * pins which rows carry words, in both directions, and every dial this editor draws is among them.
 * `undefined` is a content bug that test catches, not a state a surface should render around.
 */
export function playerWordsOfDimension(dimensionId: string): PlayerControlWords | undefined {
  return (
    DISPATCH_PARAMETERS.find((row) => row.id === dimensionId)?.player ??
    DOOR_PARAMETERS.find((row) => row.id === dimensionId)?.player
  );
}

/** The `covers` paths the moved dials buy — `dispatcher.<dimension id>`, the same path a repair's patch names. */
export function dialPathsOf(dials: Readonly<Record<string, DialValue>>): readonly string[] {
  return Object.keys(dials).map((id) => `dispatcher.${id}`);
}

/* -------------------------------------------------------------------------- *
 * Door hold — the schedule's `door-dwell` row
 * -------------------------------------------------------------------------- */

/** Which side of the door hold. */
export type DoorSide = 'hall' | 'car';

const DOOR_DIMENSION: Readonly<Record<DoorSide, string>> = Object.freeze({
  hall: 'car.dwellHallCallS',
  car: 'car.dwellCarCallS',
});

/** The step door hold is offered at, in seconds. Half a second is the finest the shipped repairs ever buy. */
export const DOOR_DWELL_STEP_S = 0.5;

/**
 * The door holds a side offers — `core`'s declared range for that car tunable, at half-second
 * steps. `car.dwellHallCallS` is declared over `[4, 7]` and `car.dwellCarCallS` over `[2, 4]`.
 */
export function doorDwellOptionsOf(side: DoorSide): readonly number[] {
  const declared = DOOR_PARAMETERS.find((parameter) => parameter.id === DOOR_DIMENSION[side]);
  if (declared === undefined || declared.type !== 'continuous' || declared.range === undefined) {
    throw new Error(`fixit: core declares no range for ${DOOR_DIMENSION[side]}.`);
  }
  const [min, max] = declared.range;
  const out: number[] = [];
  for (let value = min; value <= max + 1e-9; value += DOOR_DWELL_STEP_S) out.push(Number(value.toFixed(1)));
  return out;
}

/** The car patches the door-hold settings become — every-car first, so one car's own setting wins. */
export function doorDwellPatchesOf(doorDwell: Readonly<Record<string, DoorDwellSetting>>): readonly CarPatch[] {
  const keys = Object.keys(doorDwell).sort((a, b) => (a === EVERY_CAR ? -1 : b === EVERY_CAR ? 1 : 0));
  const out: CarPatch[] = [];
  for (const key of keys) {
    const setting = doorDwell[key];
    if (setting === undefined) continue;
    const set = {
      ...(setting.hallCallS === undefined ? {} : { dwellHallCallS: setting.hallCallS }),
      ...(setting.carCallS === undefined ? {} : { dwellCarCallS: setting.carCallS }),
    };
    if (Object.keys(set).length === 0) continue;
    out.push({ carIds: [key], set });
  }
  return out;
}

/** The `covers` paths the door-hold settings buy. */
export function doorDwellPathsOf(doorDwell: Readonly<Record<string, DoorDwellSetting>>): readonly string[] {
  const settings = Object.values(doorDwell);
  return [
    ...(settings.some((setting) => setting.hallCallS !== undefined) ? ['building.cars[].set.dwellHallCallS'] : []),
    ...(settings.some((setting) => setting.carCallS !== undefined) ? ['building.cars[].set.dwellCarCallS'] : []),
  ];
}

/* -------------------------------------------------------------------------- *
 * Tenancy — the schedule's `tenant-floors` row, as § D1001 rules it is offered
 * -------------------------------------------------------------------------- */

/**
 * **The headcounts the chosen tenancy positions keep in the watched window** — the one way the
 * editor writes `building.floorPopulations`, and only ever from positions the **case** authors.
 *
 * A cohort or position id the case does not author contributes nothing, so on a case with no
 * tenancy this is empty whatever the state holds — the both-directions check in `families.test.ts`
 * holds exactly that. Nothing here is derived from the diagnosed repair: reading the answer's patch
 * at run time would put § D869's answer key back into the control.
 */
export function tenancyWatchedOf(
  tenancy: FixitTenancy | undefined,
  positions: Readonly<Record<string, string>>,
): readonly { readonly floorIds: readonly string[]; readonly population: number }[] {
  const out: { readonly floorIds: readonly string[]; readonly population: number }[] = [];
  for (const cohort of tenancy?.cohorts ?? []) {
    const positionId = positions[cohort.id];
    if (positionId === undefined) continue;
    const position = cohort.positions.find((candidate) => candidate.id === positionId);
    if (position === undefined) continue;
    out.push(...position.watched);
  }
  return out;
}

/** How many cohorts the order moves — what `tenant-floors` is charged for, once each. */
export function tenancyCohortsMovedOf(
  tenancy: FixitTenancy | undefined,
  positions: Readonly<Record<string, string>>,
): number {
  return (tenancy?.cohorts ?? []).filter((cohort) =>
    cohort.positions.some((position) => position.id === positions[cohort.id]),
  ).length;
}

/* -------------------------------------------------------------------------- *
 * Rezoning — the schedule's `rezone-bank` row
 * -------------------------------------------------------------------------- */

/** The id a car keyed to a bank of its own runs under. */
export function keyedBankIdOf(carId: string): string {
  return `keyed-${carId}`;
}

/** The name a keyed bank carries. Player-facing wherever a bank is named. */
export function keyedBankNameOf(carId: string): string {
  return `Car ${carId} on its own`;
}

interface DocCar {
  id: string;
  ratedLoadLb?: number;
  [key: string]: unknown;
}

interface DocBank {
  id: string;
  name?: string;
  servesFloors?: string[];
  servesFloorPairs?: unknown;
  cars: DocCar[];
  [key: string]: unknown;
}

/** One car as the rezone control sees it. */
export interface RezoneCar {
  readonly id: string;
  /** The bank the as-built building runs it in, or {@link OUT_OF_SERVICE} for a car out for works. */
  readonly standingBankId: string;
  /** Whether it is a double-deck car, which only a paired bank can take. */
  readonly doubleDeck: boolean;
  /**
   * The floors a bank of its own would start from: the bank it runs in, or — for a car out for
   * works — the bank the shipped building runs it in, which is where `applyRezone` takes it from.
   */
  readonly homeFloors: readonly string[];
}

/** One bank as the rezone control sees it. */
export interface RezoneBank {
  readonly id: string;
  readonly name: string;
  readonly servesFloors: readonly string[];
  /** A double-deck bank's floors are its pairs, which this control does not redraw. */
  readonly paired: boolean;
  /** Whether a car in it weighs against a load other than the shipped building's plate. */
  readonly offPlate: boolean;
}

/** Everything the rezone control draws for a case, derived from the as-built and shipped buildings. */
export interface RezoneFabric {
  /** Floor ids in the building's own order. */
  readonly floorOrder: readonly string[];
  readonly banks: readonly RezoneBank[];
  readonly cars: readonly RezoneCar[];
}

function banksOfConfig(config: BuildingConfig): readonly DocBank[] {
  return (config.banks as unknown as readonly DocBank[] | undefined) ?? [];
}

/**
 * The rezone control's view of a case: its as-built banks and cars, plus any car the shipped
 * building has that the as-built one does not — a car out for works, which the control can put back.
 */
export function rezoneFabricOf(asBuilt: ResolvedBuilding, shipped: BuildingConfig): RezoneFabric {
  const asBuiltBanks = banksOfConfig(asBuilt.config);
  const shippedBanks = banksOfConfig(shipped);
  const shippedLoad = new Map<string, number | undefined>();
  for (const bank of shippedBanks) for (const car of bank.cars) shippedLoad.set(car.id, car.ratedLoadLb);
  const present = new Set(asBuiltBanks.flatMap((bank) => bank.cars.map((car) => car.id)));
  const resolvedFloors = new Map(asBuilt.banks.map((bank) => [bank.id, bank.servesFloors]));
  const floorsOf = (bank: DocBank): readonly string[] => [...(resolvedFloors.get(bank.id) ?? bank.servesFloors ?? [])];
  const cars: RezoneCar[] = [];
  for (const bank of asBuiltBanks) {
    for (const car of bank.cars) {
      cars.push({ id: car.id, standingBankId: bank.id, doubleDeck: car['doubleDeck'] === true, homeFloors: floorsOf(bank) });
    }
  }
  for (const bank of shippedBanks) {
    for (const car of bank.cars) {
      if (!present.has(car.id)) {
        const home = asBuiltBanks.find((candidate) => candidate.id === bank.id) ?? bank;
        cars.push({ id: car.id, standingBankId: OUT_OF_SERVICE, doubleDeck: car['doubleDeck'] === true, homeFloors: floorsOf(home) });
      }
    }
  }
  return {
    floorOrder: asBuilt.floors.map((floor) => floor.id),
    banks: asBuiltBanks.map((bank) => ({
      id: bank.id,
      name: bank.name ?? bank.id,
      servesFloors: floorsOf(bank),
      paired: bank.servesFloorPairs !== undefined,
      offPlate: bank.cars.some((car) => {
        const plate = shippedLoad.get(car.id);
        return plate !== undefined && car.ratedLoadLb !== undefined && plate !== car.ratedLoadLb;
      }),
    })),
    cars,
  };
}

/** The `covers` path a rezone buys, when any part of one is set. */
export function rezonePathsOf(state: Pick<FixitState, 'carBanks' | 'bankFloors' | 'platedBankIds'>): readonly string[] {
  const any =
    Object.keys(state.carBanks).length > 0 ||
    Object.keys(state.bankFloors).length > 0 ||
    state.platedBankIds.length > 0;
  return any ? ['building.banks[]'] : [];
}

/**
 * **Apply the rezone to a patched building document**, in place. Three steps, in the order a
 * change of one feeds the next: cars move first (so a keyed bank exists before its floors are
 * drawn), then served floors, then plates.
 *
 * Nothing is checked here that the loader checks — a bank left with no car, a bank serving one
 * floor, a double-deck car in a single-deck bank are all refused by `parseBuilding` +
 * `resolveBuilding` when `fixit/run.ts` resolves the document, with the loader's own message. A
 * name nothing matches throws here, because that is a surface asking for a car or bank the building
 * does not have.
 */
export function applyRezone(
  doc: { banks?: unknown },
  state: Pick<FixitState, 'carBanks' | 'bankFloors' | 'platedBankIds'>,
  shipped: BuildingConfig,
  floorOrder: readonly string[],
): void {
  const banks = (doc.banks ?? []) as DocBank[];
  const shippedBanks = banksOfConfig(shipped);
  for (const [carId, target] of Object.entries(state.carBanks)) {
    let car: DocCar | undefined;
    let source: DocBank | undefined;
    for (const bank of banks) {
      const index = bank.cars.findIndex((candidate) => candidate.id === carId);
      if (index >= 0) {
        car = bank.cars[index];
        source = bank;
        bank.cars.splice(index, 1);
        break;
      }
    }
    if (car === undefined) {
      for (const bank of shippedBanks) {
        const found = bank.cars.find((candidate) => candidate.id === carId);
        if (found !== undefined) {
          car = structuredClone(found);
          source = banks.find((candidate) => candidate.id === bank.id) ?? (structuredClone(bank) as DocBank);
          break;
        }
      }
    }
    if (car === undefined || source === undefined) {
      throw new Error(`fixit: a rezone moves car "${carId}", which this building does not have.`);
    }
    if (target === OUT_OF_SERVICE) continue;
    if (target === KEYED_BANK) {
      const { cars: _cars, ...rest } = source;
      banks.push({
        ...(structuredClone(rest) as Omit<DocBank, 'cars'>),
        id: keyedBankIdOf(carId),
        name: keyedBankNameOf(carId),
        cars: [car],
      });
      continue;
    }
    const destination = banks.find((bank) => bank.id === target);
    if (destination === undefined) {
      throw new Error(`fixit: a rezone moves car "${carId}" to bank "${target}", which this building does not have.`);
    }
    destination.cars.push(car);
  }
  for (const [bankId, floorIds] of Object.entries(state.bankFloors)) {
    const bank = banks.find((candidate) => candidate.id === bankId);
    if (bank === undefined) {
      throw new Error(`fixit: a rezone redraws bank "${bankId}", which this building does not have.`);
    }
    const wanted = new Set(floorIds);
    bank.servesFloors = floorOrder.filter((id) => wanted.has(id));
  }
  const plates = new Map<string, DocCar>();
  for (const bank of shippedBanks) for (const car of bank.cars) plates.set(car.id, car);
  for (const bankId of state.platedBankIds) {
    const bank = banks.find((candidate) => candidate.id === bankId);
    if (bank === undefined) {
      throw new Error(`fixit: a rezone re-plates bank "${bankId}", which this building does not have.`);
    }
    for (const car of bank.cars) {
      const plate = plates.get(car.id);
      if (plate === undefined) continue;
      for (const field of ['ratedLoadLb', 'ratedLoadLbPerDeck']) {
        if (plate[field] !== undefined) car[field] = plate[field];
      }
    }
  }
  doc.banks = banks;
}
