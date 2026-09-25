/**
 * **Orders built by pressing, not by writing a `FixitState` literal** — [§ D1011](../../../../DECISIONS.md).
 *
 * Assessor D's claim 12 against [§ D1000](../../../../DECISIONS.md) was that `families.test.ts`'s
 * proof — *the editor writes all eighteen answers* — rested on **hand-built `FixitState` literals**
 * rather than on states the editor's own reducers produce. A literal can hold a value no select
 * offers and a combination no sequence of presses reaches, and a proof over it is a proof about a
 * state nobody can make. So every order here is a **sequence of presses**, each one the reducer a
 * surface calls for that control, run in order from `emptyFixitState()` and passed through
 * `withPrunedDials` exactly as both surfaces pass every family press; and every dial value is
 * checked against the options the dial's own select offers at that moment, so a press a player
 * cannot make fails here rather than proving something.
 *
 * The standing values a reducer needs — which bank a car runs in, which floors a bank serves — are
 * read from `fixit/editorInputs.ts#editorInputsOf`, the same object the surfaces draw the controls
 * from, never restated here.
 *
 * Shared by `families.test.ts` (the eighteen answers) and `verdictNamesTheOrder.test.ts` (the
 * reproduced false routes), so both suites build their orders the one way a player can.
 */

import type { PriceSchedule } from '../pricing/types.js';
import { encodeFamilyValue } from '../everyday/fixitScreenModel.js';
import {
  emptyFixitState,
  setCarBank,
  setDial,
  setDoorDwell,
  setParkingStrategy,
  setTenancyPosition,
  stepTopFloorRaise,
  toggleBankFloor,
  togglePlate,
} from './engine.js';
import { editorInputsOf, withPrunedDials } from './editorInputs.js';
import { fixitRunPlanOf, topFloorRaiseCeilingOf, type FixitResources } from './run.js';
import { EVERY_CAR, KEYED_BANK } from './types.js';
import type { DialValue, EditorParkingStrategy, FixitCase, FixitState } from './types.js';
import { keyedBankIdOf } from './families.js';

/** One press on one control. Given what a surface has in hand, it returns the next order. */
export type Press = (entry: FixitCase, state: FixitState, context: PressContext) => FixitState;

export interface PressContext {
  readonly resources: FixitResources;
  readonly schedule: PriceSchedule;
}

function inputsOf(entry: FixitCase, state: FixitState, context: PressContext) {
  return editorInputsOf(entry, state, context.resources, context.schedule);
}

/** Choose a parking strategy on the parking select. */
export const parking =
  (strategy: EditorParkingStrategy): Press =>
  (entry, state, context) =>
    setParkingStrategy(entry, state, strategy, context.schedule);

/** Pick a value on a dial's select — refused here unless the select offers it right now. */
export const dial =
  (id: string, value: DialValue): Press =>
  (entry, state, context) => {
    const drawn = inputsOf(entry, state, context)
      .dialGroups.flatMap((group) => group.dials)
      .find((candidate) => candidate.id === id);
    if (drawn === undefined) throw new Error(`${entry.id}: the dial "${id}" is not drawn on this order`);
    const offered = drawn.options.map((option) => encodeFamilyValue(option.value));
    if (!offered.includes(encodeFamilyValue(value))) {
      throw new Error(`${entry.id}: the select for "${id}" does not offer ${String(value)} (it offers ${offered.join(', ')})`);
    }
    return setDial(entry, state, id, value, context.schedule);
  };

/** Set one side of the door hold, for every car or for one. */
export const door =
  (target: string, side: 'hall' | 'car', seconds: number): Press =>
  (entry, state, context) =>
    setDoorDwell(entry, state, target, side, seconds, context.schedule);

/** Both sides of the door hold at once — two presses. */
export const doors = (target: string, hallS: number, carS: number): readonly Press[] => [
  door(target, 'hall', hallS),
  door(target, 'car', carS),
];

/** Move a car on its rezone select: an existing bank's id, {@link KEYED_BANK}, or out of service. */
export const carTo =
  (carId: string, target: string): Press =>
  (entry, state, context) => {
    const car = inputsOf(entry, state, context).rezone.cars.find((candidate) => candidate.id === carId);
    if (car === undefined) throw new Error(`${entry.id}: the rezone row draws no car "${carId}"`);
    return setCarBank(entry, state, carId, target, car.standingBankId, context.schedule);
  };

/** Key a car to a bank of its own. */
export const keyed = (carId: string): Press => carTo(carId, KEYED_BANK);

/**
 * Click floors on a bank's row until it stops at exactly `keep` — one press per floor that differs,
 * in the order the row draws them.
 */
export const stopsAt =
  (bankId: string, keep: readonly string[]): Press =>
  (entry, state, context) => {
    let next = state;
    const inputs = inputsOf(entry, next, context);
    const bank = inputs.rezone.banks.find((candidate) => candidate.id === bankId);
    if (bank === undefined) throw new Error(`${entry.id}: the rezone row draws no bank "${bankId}"`);
    for (const floorId of inputs.rezone.floorOrder) {
      const served = new Set(next.bankFloors[bankId] ?? bank.standingFloors);
      if (served.has(floorId) !== keep.includes(floorId)) {
        next = toggleBankFloor(entry, next, bankId, floorId, bank.standingFloors, context.schedule);
      }
    }
    return next;
  };

/** A keyed car's own bank, by the car — the id a player never types. */
export const keyedStopsAt = (carId: string, keep: readonly string[]): Press => stopsAt(keyedBankIdOf(carId), keep);

/** Re-plate a bank. */
export const plate =
  (bankId: string): Press =>
  (entry, state, context) =>
    togglePlate(entry, state, bankId, context.schedule);

/** Move a tenancy cohort to one of its authored positions. */
export const tenancy =
  (cohortId: string, positionId: string): Press =>
  (entry, state, context) =>
    setTenancyPosition(entry, state, cohortId, positionId, context.schedule);

/** Press *buy one more step* on the top floor `steps` times. */
export const raiseTopFloor =
  (steps: number): Press =>
  (entry, state, context) => {
    const ceiling = topFloorRaiseCeilingOf(fixitRunPlanOf(entry, emptyFixitState(), context.resources).asBuilt.building);
    let next = state;
    for (let step = 0; step < steps; step += 1) next = stepTopFloorRaise(entry, next, 1, ceiling, context.schedule);
    return next;
  };

/**
 * Run the presses in order from an empty order, each through `withPrunedDials` as both surfaces do,
 * and require that each one **took**: a reducer that hands the state back (a budget refusal, an id
 * the case does not author) would otherwise leave a proof standing on a press that did nothing.
 */
export function pressed(entry: FixitCase, presses: readonly Press[], context: PressContext): FixitState {
  let state = emptyFixitState();
  for (const [index, press] of presses.entries()) {
    const next = withPrunedDials(entry, press(entry, state, context), context.resources);
    if (next === state) throw new Error(`${entry.id}: press ${String(index + 1)} changed nothing — refused or inert`);
    state = next;
  }
  return state;
}

/**
 * **The presses that write each case's diagnosed answer** — [§ D1000](../../../../DECISIONS.md)'s
 * `EDITOR_ANSWERS`, rebuilt as presses (§ D1011). Every value here is one the control offers.
 */
export const ANSWER_PRESSES: Readonly<Record<string, readonly Press[]>> = Object.freeze({
  'sleeping-sky-lobby': [parking('predicted-demand'), dial('idle.repositionEnergyWeight', 0.1)],
  'zoning-starves-the-top': [carTo('C', 'high')],
  'three-cars-one-cars-work': [parking('zone-center'), dial('idle.repositionEnergyWeight', 0.1)],
  'doors-that-never-close': [
    ...doors(EVERY_CAR, 5, 3),
    dial('answer.dwellPolicy', 'adaptive'),
    dial('answer.dwellAdaptationGain', 0.3),
    dial('answer.maxDwellS', 11),
  ],
  'cars-that-always-go-home': [parking('stay')],
  'car-park-nobody-serves': [carTo('B', 'garage')],
  'express-that-stops-everywhere': [
    stopsAt('high', ['G', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30']),
  ],
  'deliveries-on-the-passenger-group': [...doors('D', 5, 3), ...doors('E', 5, 3)],
  'everyone-leaves-at-once': [keyed('A'), keyedStopsAt('A', ['G', '2'])],
  'bed-cars-locked-out': [stopsAt('beds', ['LG', 'G', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'])],
  'two-cars-out-wrong-month': [carTo('E', 'high')],
  'every-deck-calls-itself-full': [plate('shuttle')],
  'restaurant-above-the-ballroom': [keyed('S'), keyedStopsAt('S', ['G', '2', '3'])],
  'controller-sends-every-car': [dial('dispatch.assignmentMode', 'single-car')],
  'gym-on-the-top-floor': [parking('fixed-floor'), dial('idle.parkingFloorIndex', 6)],
  /* § D1001's three: a cohort the case authors, moved to the position its witness is. */
  'one-start-time': [tenancy('upper-tenancies', 'three-start-times')],
  'every-letter-says-nine': [tenancy('outpatient-letters', 'four-hundred-say-half-past')],
  'let-faster-than-the-lifts': [tenancy('new-lettings', 'invoke-for-all')],
});
