/**
 * **The editor's five new families reach the run, are priced by the schedule, and write the
 * answers** — [§ D1000](../../../../DECISIONS.md), under [§ D706](../../../../DECISIONS.md) § 6.
 *
 * `CLAUDE.md`'s standing requirement, pointed at every control this lane added: *move the control
 * and require the run to change, compared on the legs*. Four blocks:
 *
 * 1. **Priced through the schedule**, at the row a repair buying the same act already pays, and
 *    deduplicated the way #366 deduplicates a repair's patch.
 * 2. **Every dial the editor draws moves the legs** — each proved on a named case at a named value,
 *    and the set of proved dials is held against the set drawn, so a dimension added to one of the
 *    three rows fails here until somebody proves it. The one covered dimension that moves nothing
 *    anywhere is held in `families.ts#INERT_DIALS` **both ways**.
 * 3. **Every fabric control moves the legs** — door hold for every car and for one, a car moved,
 *    keyed, taken out and put back, a floor dropped from a bank, a bank re-plated.
 * 4. **The editor writes § D706's answers.** For fifteen of the eighteen cases a state built from
 *    the editor alone runs **leg for leg** as the diagnosed repair does, buys the same schedule rows
 *    at the same price, and clears both bars. The other three are the `tenant-floors` cases, and
 *    what they are waiting on is named rather than approximated.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { changesAtPaths, changesBought } from '../pricing/repairPrice.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { recordRun, type RecordedRun } from '../record/recordRun.js';
import {
  classifyOutcome,
  editorPathsOf,
  emptyFixitState,
  setCarBank,
  setDial,
  setDoorDwell,
  setParkingStrategy,
  setTenancyPosition,
  spendOf,
  toggleBankFloor,
  togglePlate,
  toggleRepair,
} from './engine.js';
import {
  INERT_DIALS,
  dialGroupsOf,
  dialOptionsOf,
  doorDwellOptionsOf,
  fixitDialSpace,
  keyedBankIdOf,
  liveDialIdsOf,
  pruneDials,
  rezoneFabricOf,
  standingDialValuesOf,
  tenancyWatchedOf,
} from './families.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import {
  FIXIT_RUN_SWITCHES,
  fixitPlanRefusalOf,
  fixitRunPlanOf,
  measuredOf,
  type FixitResources,
} from './run.js';
import { EVERY_CAR, KEYED_BANK, OUT_OF_SERVICE } from './types.js';
import type { DialValue, FixitCase, FixitCases, FixitState } from './types.js';

/**
 * The project's own ceiling, not above it. Measured at wave AH's integration on one worker at load
 * average 6.5: the slowest case here (*proves each drawn dial on its pinned case and value*) took
 * 14.0 s and no other took more than 5.6 s. The lane annotated 900 000 ms, about 64× the job, and
 * `testCost.test.ts`'s ratchet refuses a bound above the ceiling unless the job earns it; this one
 * does not, so the bound is lowered here rather than registered there (§ D405). 300 000 ms leaves
 * about 21× at the measured load, which covers the 4.5× amplification `vitest.config.ts` records.
 */
const SUITE_TIMEOUT = 300_000;

let resources: FixitResources;
let cases: FixitCases;

beforeAll(async () => {
  resources = await fixitResourcesFromDisk();
  cases = await shippedFixitCases(resources);
}, SUITE_TIMEOUT);

function caseOf(id: string): FixitCase {
  const entry = cases.cases.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`the shipped file has no case "${id}"`);
  return entry;
}

/** Boarding/alighting identity of a run — `cases.test.ts`'s own key. */
function legsKey(run: RecordedRun): string {
  return JSON.stringify(
    run.recording.legs.map((leg) => [leg.passengerId, leg.boardedAt ?? null, leg.alightedAt ?? null]),
  );
}

function repairedLegs(entry: FixitCase, state: FixitState): string {
  return legsKey(recordRun(fixitRunPlanOf(entry, state, resources).asRepaired, FIXIT_RUN_SWITCHES));
}

const empty = (): FixitState => emptyFixitState();

/* -------------------------------------------------------------------------- *
 * 1 — priced through the schedule
 * -------------------------------------------------------------------------- */

describe("the five families are priced at the rows a repair buying the same act pays", () => {
  it('charges each row once, at the schedule figure, however many of its settings move', () => {
    const schedule = shippedPriceSchedule();
    const entry = caseOf('zoning-starves-the-top');
    const price = (id: string): number => {
      const change = schedule.changes.find((candidate) => candidate.id === id);
      if (change === undefined || change.priceUnits === undefined) throw new Error(`no flat row ${id}`);
      return change.priceUnits;
    };
    const units = (state: FixitState): number => spendOf(entry, state, schedule).totalUnits;

    expect(units({ ...empty(), dispatcherDials: { 'dispatch.assignmentMode': 'split-demand' } })).toBe(price('dispatch-rules'));
    expect(
      units({ ...empty(), dispatcherDials: { 'dispatch.assignmentMode': 'split-demand', 'weights.waitTime': 2 } }),
      'two dials of one row are one purchase',
    ).toBe(price('dispatch-rules'));
    expect(units({ ...empty(), dispatcherDials: { 'answer.dwellPolicy': 'adaptive' } })).toBe(price('dwell-policy'));
    expect(
      units({ ...empty(), parkingStrategy: 'zone-center', dispatcherDials: { 'idle.repositionEnergyWeight': 0.1 } }),
    ).toBe(price('idle-parking'));

    expect(units({ ...empty(), doorDwell: { [EVERY_CAR]: { hallCallS: 5 } } })).toBe(price('door-dwell'));
    expect(
      units({ ...empty(), doorDwell: { [EVERY_CAR]: { hallCallS: 5, carCallS: 3 }, A: { carCallS: 2 } } }),
      'both sides of the door, on two targets, is the doors re-set once',
    ).toBe(price('door-dwell'));

    const rezone = price('rezone-bank');
    expect(units({ ...empty(), carBanks: { C: 'high' } })).toBe(rezone);
    expect(units({ ...empty(), bankFloors: { high: ['P1', 'G', '12'] } })).toBe(rezone);
    expect(units({ ...empty(), platedBankIds: ['low'] })).toBe(rezone);
    expect(
      units({ ...empty(), carBanks: { C: 'high' }, zoneOverlapFloors: 1 }),
      'a moved car and a zoning step both redraw the banks, and pay for that once',
    ).toBe(rezone);

    /* None of it is machinery: a setting is not steel, and `budgetNoteOf` must not say otherwise. */
    const all: FixitState = {
      ...empty(),
      dispatcherDials: { 'answer.dwellPolicy': 'adaptive' },
      doorDwell: { [EVERY_CAR]: { hallCallS: 5 } },
      carBanks: { C: 'high' },
    };
    expect(spendOf(entry, all, schedule).machineryUnits).toBe(0);
  });

  it('refuses a press the budget cannot take and never refuses one that gives something back', () => {
    const schedule = shippedPriceSchedule();
    const entry = caseOf('zoning-starves-the-top');
    /* Two speed steps leave 12 − 20 < 0 … so spend the budget with one step first. */
    const nearlySpent: FixitState = { ...empty(), speedSteps: 1 };
    expect(spendOf(entry, nearlySpent, schedule).totalUnits).toBe(10);
    const refused = setCarBank(entry, nearlySpent, 'C', 'high', 'low', schedule);
    expect(refused, 'a 6 u rezone on 2 u of headroom').toBe(nearlySpent);
    const dwell = setDoorDwell(entry, nearlySpent, EVERY_CAR, 'hall', 5, schedule);
    expect(dwell.doorDwell, 'a 2 u door re-set on 2 u of headroom fits').toEqual({ [EVERY_CAR]: { hallCallS: 5 } });

    const moved = setCarBank(entry, empty(), 'C', 'high', 'low', schedule);
    expect(moved.carBanks).toEqual({ C: 'high' });
    expect(setCarBank(entry, moved, 'C', 'low', 'low', schedule).carBanks, 'writing the standing bank back is handing it back').toEqual({});
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — every dial moves the legs
 * -------------------------------------------------------------------------- */

/**
 * The state that opens a dimension's gate, built only from controls the editor draws: the parking
 * select for an idle dimension, another dial for the rest. A gate the editor cannot open — a
 * dimension gated on `dispatch.callType`, which is equipment and not sold here — leaves the dial
 * undrawn, which is correct and is asserted below rather than worked around.
 */
function gateOpenedFor(dimensionId: string, schedule = shippedPriceSchedule()): FixitState | undefined {
  const space = fixitDialSpace();
  const parameter = space.byId.get(dimensionId);
  if (parameter === undefined) return undefined;
  const condition = parameter.activeWhen as Readonly<Record<string, readonly unknown[]>> | undefined;
  if (condition === undefined) return empty();
  const offered = new Map(dialGroupsOf(schedule).flatMap((group) => group.parameters.map((p) => [p.id, p] as const)));
  let state = empty();
  for (const [gate, values] of Object.entries(condition)) {
    if (!Array.isArray(values)) return undefined;
    if (gate === 'idle.parkingStrategy') {
      const pick = dimensionId === 'idle.parkingFloorIndex' ? 'fixed-floor' : values.find((value) => value !== 'stay');
      state = { ...state, parkingStrategy: pick as FixitState['parkingStrategy'] };
      continue;
    }
    const gateParameter = offered.get(gate);
    if (gateParameter === undefined) return undefined;
    const raw = values[0] as string;
    const value: DialValue = gateParameter.type === 'boolean' ? raw === 'true' : raw;
    state = { ...state, dispatcherDials: { ...state.dispatcherDials, [gate]: value } };
  }
  return state;
}

/**
 * **The proof of every dial**, measured on this tree by moving each dial through every value it
 * offers on every case until the legs changed: the case, and the value that moved them. Pinned, so a
 * dial that stops binding turns this red, and the set is held against what the editor draws.
 */
const DIAL_PROOFS: Readonly<Record<string, readonly [string, DialValue]>> = Object.freeze({
  'idle.parkingFloorIndex': ['sleeping-sky-lobby', 100],
  'idle.repositionThresholdS': ['sleeping-sky-lobby', 60],
  'idle.repositionEnergyWeight': ['sleeping-sky-lobby', 2],
  'weights.waitTime': ['sleeping-sky-lobby', 0],
  'weights.detourPenalty': ['sleeping-sky-lobby', 5],
  'weights.existingCallDelay': ['sleeping-sky-lobby', 5],
  'weights.directionReversal': ['three-cars-one-cars-work', 5],
  'weights.loadFactor': ['sleeping-sky-lobby', 5],
  'weights.stopCount': ['sleeping-sky-lobby', 5],
  'weights.distanceTravelled': ['sleeping-sky-lobby', 5],
  'weights.starvation': ['sleeping-sky-lobby', 5],
  'weights.zoneAffinity': ['sleeping-sky-lobby', 5],
  'weights.predictedDemand': ['sleeping-sky-lobby', 5],
  'weights.crowding': ['express-that-stops-everywhere', 5],
  'constraints.noDirectionReversal': ['sleeping-sky-lobby', false],
  'dispatch.assignmentMode': ['controller-sends-every-car', 'single-car'],
  'dispatch.splitThresholdPassengers': ['sleeping-sky-lobby', 7],
  'eligibility.allowOppositeDirectionPickup': ['sleeping-sky-lobby', false],
  'eligibility.enRouteDiversion': ['sleeping-sky-lobby', true],
  'weights.diversionDetour': ['sleeping-sky-lobby', 5],
  'eligibility.maxLoadFactorForAssignment': ['sleeping-sky-lobby', 0.65],
  'answer.allowBypassIfSoleEligibleCar': ['zoning-starves-the-top', true],
  'answer.dwellPolicy': ['sleeping-sky-lobby', 'adaptive'],
  'answer.dwellAdaptationGain': ['sleeping-sky-lobby', 2],
  'answer.maxDwellS': ['sleeping-sky-lobby', 6],
});

/** The covered dimension no editor gate can open on any shipped case, named rather than skipped. */
const NEVER_DRAWN: readonly string[] = Object.freeze(['weights.rideTime']);

describe('every dial the editor draws moves the legs', () => {
  it('proves each drawn dial on its pinned case and value', () => {
    const schedule = shippedPriceSchedule();
    const drawn = dialGroupsOf(schedule).flatMap((group) => group.parameters.map((p) => p.id));
    expect(
      [...drawn].sort(),
      'the set of dials drawn is the set proved, plus the ones no editor gate can open',
    ).toEqual([...Object.keys(DIAL_PROOFS), ...NEVER_DRAWN].sort());
    expect(drawn.length).toBeGreaterThan(20);

    for (const [dimensionId, [caseId, value]] of Object.entries(DIAL_PROOFS)) {
      const entry = caseOf(caseId);
      const gate = gateOpenedFor(dimensionId);
      expect(gate, `${dimensionId}: no editor control opens its gate`).toBeDefined();
      const plan = fixitRunPlanOf(entry, gate!, resources);
      const live = liveDialIdsOf(plan.asRepaired.dispatcherProfile, gate!.dispatcherDials);
      expect(live.has(dimensionId), `${dimensionId} is not live on ${caseId}`).toBe(true);
      /* The value is one the dial's own select offers — a proof by a value nobody can pick is none. */
      const parameter = fixitDialSpace().byId.get(dimensionId)!;
      const standing = standingDialValuesOf(plan.asRepaired.dispatcherProfile).get(dimensionId);
      const offered = dialOptionsOf(parameter, standing, plan.asRepaired.building).map((option) => option.value);
      expect(offered, `${dimensionId}'s select does not offer ${String(value)}`).toContain(value);

      const before = legsKey(recordRun(plan.asRepaired, FIXIT_RUN_SWITCHES));
      const after = repairedLegs(entry, { ...gate!, dispatcherDials: { ...gate!.dispatcherDials, [dimensionId]: value } });
      expect(after, `${dimensionId} = ${String(value)} moved no leg on ${caseId}`).not.toBe(before);
    }
  }, SUITE_TIMEOUT);

  it('keeps the one it never draws off the screen for a measured reason, and would notice it binding', () => {
    expect(Object.keys(INERT_DIALS)).toEqual(['weights.dutyMismatch']);
    const parameter = fixitDialSpace().byId.get('weights.dutyMismatch')!;
    expect(parameter.type).toBe('continuous');
    if (parameter.type !== 'continuous') return;
    const moved: string[] = [];
    for (const entry of cases.cases) {
      const base = repairedLegs(entry, empty());
      for (const value of [parameter.min, parameter.max]) {
        const after = repairedLegs(entry, { ...empty(), dispatcherDials: { 'weights.dutyMismatch': value } });
        if (after !== base) moved.push(`${entry.id}=${String(value)}`);
      }
    }
    expect(moved, 'weights.dutyMismatch now binds somewhere — take it out of INERT_DIALS and prove it').toEqual([]);
  }, SUITE_TIMEOUT);

  it('offers the whole parking-floor select from floors the building serves, by their own names', () => {
    const entry = caseOf('gym-on-the-top-floor');
    const plan = fixitRunPlanOf(entry, { ...empty(), parkingStrategy: 'fixed-floor' }, resources);
    const parameter = fixitDialSpace().byId.get('idle.parkingFloorIndex')!;
    const options = dialOptionsOf(parameter, undefined, plan.asRepaired.building);
    expect(options.map((option) => option.text)).toEqual(['G', '2', '3', '4', '5', '6']);
  });

  it('drops a dial whose gate a later press closes, so it is never charged and not applied', () => {
    const schedule = shippedPriceSchedule();
    const entry = caseOf('three-cars-one-cars-work');
    let state = setParkingStrategy(entry, empty(), 'zone-center', schedule);
    state = setDial(entry, state, 'idle.repositionEnergyWeight', 0.1, schedule);
    state = setDial(entry, state, 'weights.waitTime', 2, schedule);
    state = setParkingStrategy(entry, state, 'stay', schedule);
    const profile = fixitRunPlanOf(entry, empty(), resources).asBuilt.dispatcherProfile;
    const pruned = pruneDials(
      { ...profile, idle: { ...profile.idle, parkingStrategy: 'stay' } } as typeof profile,
      state.dispatcherDials,
    );
    expect(pruned).toEqual({ 'weights.waitTime': 2 });
    /* And an unpruned dead dial is refused loudly by the run rather than silently skipped. */
    expect(fixitPlanRefusalOf(entry, state, resources)).toMatch(/is not live/);
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — every fabric control moves the legs
 * -------------------------------------------------------------------------- */

describe('every fabric control the editor draws moves the legs', () => {
  it('door hold, for every car and for one car, on each side of the door', () => {
    const [hall, car] = [doorDwellOptionsOf('hall'), doorDwellOptionsOf('car')];
    expect(hall).toEqual([4, 4.5, 5, 5.5, 6, 6.5, 7]);
    expect(car).toEqual([2, 2.5, 3, 3.5, 4]);
    const doors = caseOf('doors-that-never-close');
    const base = repairedLegs(doors, empty());
    expect(repairedLegs(doors, { ...empty(), doorDwell: { [EVERY_CAR]: { hallCallS: 5 } } })).not.toBe(base);
    expect(repairedLegs(doors, { ...empty(), doorDwell: { [EVERY_CAR]: { carCallS: 3 } } })).not.toBe(base);
    const deliveries = caseOf('deliveries-on-the-passenger-group');
    expect(repairedLegs(deliveries, { ...empty(), doorDwell: { D: { hallCallS: 5 } } })).not.toBe(
      repairedLegs(deliveries, empty()),
    );
  }, SUITE_TIMEOUT);

  it('a car moved, keyed, taken out and put back, a floor dropped and a bank re-plated', () => {
    const zoning = caseOf('zoning-starves-the-top');
    expect(repairedLegs(zoning, { ...empty(), carBanks: { C: 'high' } })).not.toBe(repairedLegs(zoning, empty()));

    const hotel = caseOf('everyone-leaves-at-once');
    const hotelBase = repairedLegs(hotel, empty());
    expect(repairedLegs(hotel, { ...empty(), carBanks: { A: KEYED_BANK } }), 'a keyed car on its source floors').not.toBe(
      hotelBase,
    );

    const works = caseOf('two-cars-out-wrong-month');
    const worksBase = repairedLegs(works, empty());
    expect(repairedLegs(works, { ...empty(), carBanks: { E: 'high' } }), 'a car back from the works').not.toBe(worksBase);
    expect(repairedLegs(works, { ...empty(), carBanks: { A: OUT_OF_SERVICE } }), 'a car taken out').not.toBe(worksBase);

    const express = caseOf('express-that-stops-everywhere');
    const plan = fixitRunPlanOf(express, empty(), resources);
    const fabric = rezoneFabricOf(plan.asBuilt.building, resources.entries.find((e) => e.resolved.id === express.buildingId)!.config);
    const high = fabric.banks.find((bank) => bank.id === 'high')!;
    const dropped = toggleBankFloor(express, empty(), 'high', '2', high.servesFloors, shippedPriceSchedule());
    expect(dropped.bankFloors['high']).not.toContain('2');
    expect(repairedLegs(express, dropped)).not.toBe(repairedLegs(express, empty()));

    const decks = caseOf('every-deck-calls-itself-full');
    const replated = togglePlate(decks, empty(), 'shuttle', shippedPriceSchedule());
    expect(repairedLegs(decks, replated)).not.toBe(repairedLegs(decks, empty()));
  }, SUITE_TIMEOUT);

  it('offers a plate only where a bank weighs against something other than its plate, and lists a car out for works', () => {
    const shippedOf = (entry: FixitCase) => resources.entries.find((e) => e.resolved.id === entry.buildingId)!.config;
    const offPlate: string[] = [];
    const outForWorks: string[] = [];
    for (const entry of cases.cases) {
      const fabric = rezoneFabricOf(fixitRunPlanOf(entry, empty(), resources).asBuilt.building, shippedOf(entry));
      for (const bank of fabric.banks) if (bank.offPlate) offPlate.push(`${entry.id}/${bank.id}`);
      for (const car of fabric.cars) if (car.standingBankId === OUT_OF_SERVICE) outForWorks.push(`${entry.id}/${car.id}`);
    }
    expect(offPlate).toEqual(['every-deck-calls-itself-full/shuttle']);
    expect(outForWorks).toEqual(['two-cars-out-wrong-month/D', 'two-cars-out-wrong-month/E']);
  });

  it('holds the Run press with the loader’s own words when a rezone leaves a building that cannot load', () => {
    const entry = caseOf('car-park-nobody-serves');
    const refusal = fixitPlanRefusalOf(entry, { ...empty(), carBanks: { A: 'main' } }, resources);
    expect(refusal, 'a bank with no car left in it').toBeDefined();
    expect(fixitPlanRefusalOf(entry, empty(), resources)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * 4 — the editor writes § D706's answers
 * -------------------------------------------------------------------------- */

/**
 * **The editor state that writes each case's diagnosed answer**, built by hand from the controls a
 * player has — which is the claim: these are presses, not patches. `keyedBankIdOf` is the one id a
 * player never types, because keying a car is what creates its bank.
 */
const EDITOR_ANSWERS: Readonly<Record<string, FixitState>> = {
  'sleeping-sky-lobby': { ...empty(), parkingStrategy: 'predicted-demand', dispatcherDials: { 'idle.repositionEnergyWeight': 0.1 } },
  'zoning-starves-the-top': { ...empty(), carBanks: { C: 'high' } },
  'three-cars-one-cars-work': { ...empty(), parkingStrategy: 'zone-center', dispatcherDials: { 'idle.repositionEnergyWeight': 0.1 } },
  'doors-that-never-close': {
    ...empty(),
    doorDwell: { [EVERY_CAR]: { carCallS: 3, hallCallS: 5 } },
    dispatcherDials: { 'answer.dwellPolicy': 'adaptive', 'answer.dwellAdaptationGain': 0.3, 'answer.maxDwellS': 11 },
  },
  'cars-that-always-go-home': { ...empty(), parkingStrategy: 'stay' },
  'car-park-nobody-serves': { ...empty(), carBanks: { B: 'garage' } },
  'express-that-stops-everywhere': {
    ...empty(),
    bankFloors: { high: ['G', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30'] },
  },
  'deliveries-on-the-passenger-group': {
    ...empty(),
    doorDwell: { D: { carCallS: 3, hallCallS: 5 }, E: { carCallS: 3, hallCallS: 5 } },
  },
  'everyone-leaves-at-once': { ...empty(), carBanks: { A: KEYED_BANK }, bankFloors: { [keyedBankIdOf('A')]: ['G', '2'] } },
  'bed-cars-locked-out': { ...empty(), bankFloors: { beds: ['LG', 'G', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'] } },
  'two-cars-out-wrong-month': { ...empty(), carBanks: { E: 'high' } },
  'every-deck-calls-itself-full': { ...empty(), platedBankIds: ['shuttle'] },
  'restaurant-above-the-ballroom': { ...empty(), carBanks: { S: KEYED_BANK }, bankFloors: { [keyedBankIdOf('S')]: ['G', '2', '3'] } },
  'controller-sends-every-car': { ...empty(), dispatcherDials: { 'dispatch.assignmentMode': 'single-car' } },
  'gym-on-the-top-floor': { ...empty(), parkingStrategy: 'fixed-floor', dispatcherDials: { 'idle.parkingFloorIndex': 6 } },
  /* § D1001's three: a cohort the case authors, moved to the position its witness is. */
  'one-start-time': { ...empty(), tenancyPositions: { 'upper-tenancies': 'three-start-times' } },
  'every-letter-says-nine': { ...empty(), tenancyPositions: { 'outpatient-letters': 'four-hundred-say-half-past' } },
  'let-faster-than-the-lifts': { ...empty(), tenancyPositions: { 'new-lettings': 'invoke-for-all' } },
};

/** The three cases whose crowd has a start time the owner can move — § D1001. */
const TENANCY_CASES: readonly string[] = Object.freeze([
  'one-start-time',
  'every-letter-says-nine',
  'let-faster-than-the-lifts',
]);

describe('the editor writes the answer § D706 conditions the retirement on', () => {
  it(
    'runs leg for leg as the diagnosed repair on fifteen cases, at its price, and clears both bars',
    () => {
      const schedule = shippedPriceSchedule();
      const reached: string[] = [];
      for (const entry of cases.cases) {
        const state = EDITOR_ANSWERS[entry.id];
        if (state === undefined) continue;
        const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed')!;
        const repairState = toggleRepair(entry, empty(), diagnosed.id, schedule);

        /* The same rows, at the same price. */
        /* The tenancy is charged per cohort rather than through the path dedupe — § D1001. */
        const editorRows = [
          ...changesAtPaths(schedule, editorPathsOf(state)).map((change) => change.id),
          ...(Object.keys(state.tenancyPositions).length > 0 ? ['tenant-floors'] : []),
        ];
        expect(editorRows.sort(), `${entry.id}: the editor buys different rows from the repair`).toEqual(
          changesBought(schedule, diagnosed.patch).map((change) => change.id).sort(),
        );
        expect(spendOf(entry, state, schedule).totalUnits, entry.id).toBe(diagnosed.costUnits);

        /* The same run. */
        const plan = fixitRunPlanOf(entry, state, resources);
        const after = recordRun(plan.asRepaired, FIXIT_RUN_SWITCHES);
        expect(legsKey(after), `${entry.id}: not leg for leg the diagnosed repair`).toBe(
          repairedLegs(entry, repairState),
        );

        /* And it clears. */
        const before = recordRun(plan.asBuilt, FIXIT_RUN_SWITCHES);
        const outcome = classifyOutcome(
          entry,
          measuredOf(entry, before.recording, after.recording),
          spendOf(entry, state, schedule),
        );
        expect(outcome.kind, entry.id).toBe('fixed');
        reached.push(entry.id);
      }
      expect(reached, 'every case is written by the editor alone').toHaveLength(18);
    },
    SUITE_TIMEOUT,
  );
});

/* -------------------------------------------------------------------------- *
 * 5 — the tenancy, as § D1001 rules it is offered
 * -------------------------------------------------------------------------- */

describe('the tenancy row moves only the crowds a case authors', () => {
  it('authors a tenancy on exactly the three cases whose answer moves people', () => {
    const authoring = cases.cases.filter((entry) => (entry.asBuilt.tenancy?.cohorts.length ?? 0) > 0).map((e) => e.id);
    expect(authoring).toEqual([...TENANCY_CASES]);
    const moving = cases.cases
      .filter((entry) => (entry.repairs.find((r) => r.role === 'diagnosed')!.patch.building?.floorPopulations ?? []).length > 0)
      .map((entry) => entry.id);
    expect(moving).toEqual([...TENANCY_CASES]);
  });

  it(
    'moves the legs at every authored position',
    () => {
      const moved: string[] = [];
      for (const id of TENANCY_CASES) {
        const entry = caseOf(id);
        const base = repairedLegs(entry, empty());
        for (const cohort of entry.asBuilt.tenancy!.cohorts) {
          for (const position of cohort.positions) {
            const state = setTenancyPosition(entry, empty(), cohort.id, position.id, shippedPriceSchedule());
            expect(state.tenancyPositions[cohort.id], `${id}/${position.id} was refused`).toBe(position.id);
            expect(repairedLegs(entry, state), `${id}/${position.id} moved no leg`).not.toBe(base);
            moved.push(`${id}/${cohort.id}/${position.id}`);
          }
        }
      }
      expect(moved).toEqual([
        'one-start-time/upper-tenancies/two-start-times',
        'one-start-time/upper-tenancies/three-start-times',
        'every-letter-says-nine/outpatient-letters/half-say-half-past',
        'every-letter-says-nine/outpatient-letters/four-hundred-say-half-past',
        'let-faster-than-the-lifts/new-lettings/invoke-for-half',
        'let-faster-than-the-lifts/new-lettings/invoke-for-all',
      ]);
    },
    SUITE_TIMEOUT,
  );

  it(
    'leaves the run byte-identical on every case that authors no cohort, whatever is pressed',
    () => {
      const schedule = shippedPriceSchedule();
      for (const entry of cases.cases) {
        if (TENANCY_CASES.includes(entry.id)) continue;
        /* A press can only name ids; none of them is this case's, so the reducer hands the state back. */
        for (const [cohortId, positionId] of [
          ['upper-tenancies', 'three-start-times'],
          ['new-lettings', 'invoke-for-all'],
          ['any', 'thing'],
        ] as const) {
          expect(setTenancyPosition(entry, empty(), cohortId, positionId, schedule)).toEqual(empty());
        }
        /* And a state carrying one anyway — a stale id, a hand-built fixture — writes nobody. */
        const forced: FixitState = { ...empty(), tenancyPositions: { 'upper-tenancies': 'three-start-times' } };
        expect(repairedLegs(entry, forced), entry.id).toBe(repairedLegs(entry, empty()));
        expect(spendOf(entry, forced, schedule).totalUnits, `${entry.id} charged for nobody`).toBe(0);
      }
    },
    SUITE_TIMEOUT,
  );

  it('lets no case without a cohort write a population from the editor, and every case with one can', () => {
    const everything = (entry: FixitCase): FixitState => ({
      ...empty(),
      parkingStrategy: 'lobby',
      dispatcherDials: { 'answer.dwellPolicy': 'adaptive' },
      doorDwell: { [EVERY_CAR]: { hallCallS: 5 } },
      carBanks: { C: 'high' },
      bankFloors: { low: ['G'] },
      platedBankIds: ['low'],
      zoneOverlapFloors: 1,
      topFloorRaiseM: 1,
      speedSteps: 1,
      tenancyPositions: Object.fromEntries(
        [...(entry.asBuilt.tenancy?.cohorts ?? []).map((c) => [c.id, c.positions[0]!.id]), ['upper-tenancies', 'three-start-times']],
      ),
    });
    for (const entry of cases.cases) {
      /* The editor's generic paths never carry the row, on any case … */
      expect(editorPathsOf(everything(entry))).not.toContain('building.floorPopulations[]');
      /* … and the one route that does is the authored tenancy, present exactly where it is authored. */
      const written = tenancyWatchedOf(entry.asBuilt.tenancy, everything(entry).tenancyPositions);
      expect(written.length > 0, entry.id).toBe(TENANCY_CASES.includes(entry.id));
    }
  });

  it(
    'clears each case at its witness position, and a one-person placebo on the same floors does not',
    () => {
      const schedule = shippedPriceSchedule();
      const verdicts: string[] = [];
      for (const id of TENANCY_CASES) {
        const entry = caseOf(id);
        const witness = EDITOR_ANSWERS[id]!;
        const plan = fixitRunPlanOf(entry, witness, resources);
        const before = recordRun(plan.asBuilt, FIXIT_RUN_SWITCHES);
        const judge = (state: FixitState, runs: ReturnType<typeof fixitRunPlanOf>) =>
          classifyOutcome(
            entry,
            measuredOf(entry, before.recording, recordRun(runs.asRepaired, FIXIT_RUN_SWITCHES).recording),
            spendOf(entry, state, schedule),
          ).kind;
        verdicts.push(`${id}: witness ${judge(witness, plan)}`);
        /*
         * The placebo — the coordinator's condition for any family that changes the crowd: one
         * person off one of the cohort's floors, as a repair would carry it, so the pair loses its
         * common random numbers exactly as the witness's does and moves nobody who matters.
         */
        const cohort = entry.asBuilt.tenancy!.cohorts[0]!;
        const floorId = cohort.floorIds[0]!;
        const asBuiltPopulation =
          plan.asBuilt.building.floors.find((floor) => floor.id === floorId)?.population ?? 0;
        const placebo: FixitCase = {
          ...entry,
          repairs: [
            ...entry.repairs,
            {
              id: 'placebo',
              role: 'cheap-fix',
              name: 'placebo',
              costUnits: 0,
              effect: 'one person fewer',
              patch: { building: { floorPopulations: [{ floorIds: [floorId], population: asBuiltPopulation - 1 }] } },
            },
          ],
        };
        const placeboState: FixitState = { ...empty(), selectedRepairIds: ['placebo'] };
        verdicts.push(`${id}: placebo ${judge(placeboState, fixitRunPlanOf(placebo, placeboState, resources))}`);
      }
      expect(verdicts).toEqual([
        'one-start-time: witness fixed',
        'one-start-time: placebo not-enough',
        'every-letter-says-nine: witness fixed',
        'every-letter-says-nine: placebo not-enough',
        'let-faster-than-the-lifts: witness fixed',
        'let-faster-than-the-lifts: placebo not-enough',
      ]);
    },
    SUITE_TIMEOUT,
  );
});
