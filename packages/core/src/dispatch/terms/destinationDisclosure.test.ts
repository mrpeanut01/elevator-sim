/**
 * Which terms read the destination, **measured**, and whether each declares it in the form that
 * is true of it.
 *
 * ## Why this file exists
 *
 * `activeWhen` is a gate: it tells a generic optimizer *"outside this condition the dimension is
 * dead — do not spend replications on it"* (CLAUDE.md invariant 8). `searchSpaceLiveness.test.ts`
 * § *finds no activeWhen gate that hides a live region* makes that a falsifiable claim by
 * asserting the contrapositive — outside the gate, flat.
 *
 * A term that reads `request.destinationFloorId` therefore comes in **two** shapes, and only one
 * of them is a gate:
 *
 * 1. **Wholly** destination-priced. `rideTime` returns 0 without a destination, for every car, so
 *    `weights.rideTime` is a dead dimension under `up-down-buttons` and `activeWhen` is exactly
 *    right.
 * 2. **Partly** destination-priced. `stopCount` counts the pickup with or without a destination
 *    and adds the destination stop only when it is disclosed. Its weight is live on **both** sides
 *    of the call type, so `activeWhen` would be a false claim — and the false claim is the
 *    expensive direction: a gate that hides a live region is a dimension a generic optimizer was
 *    told to skip. Measured, when the gate was tried:
 *
 *    > `weights.stopCount is gated on dispatch.callType ["destination-entry","mobile-credential"],
 *    > and at dispatch.callType=up-down-buttons — outside that gate — it still moves a run
 *    > (0 vs 5 on midtown-office)`
 *
 *    That is `searchSpaceLiveness.test.ts` refusing the obvious fix, and it is why `stopCount`
 *    declares {@link CostTermDefinition.partiallyActiveWhen} instead: not a gate, a statement that
 *    the term prices *more* inside the condition, so a weight tuned on one side of it does not
 *    transfer to the other.
 *
 * Nothing above is worth anything as prose. This file **derives** the classification from the
 * engine — score the same calls under every declared `dispatch.callType` and compare the terms'
 * raw values — and requires each term's declaration to match what it measured. A thirteenth term
 * that reads the destination and declares neither form fails here, and one that declares the
 * wrong form fails here too.
 *
 * ## Through `policy.score()`, for `liveness.test.ts`'s reason
 *
 * A hand-built `TermContext` can be handed a destination the engine would never have supplied;
 * that is exactly how three terms shipped inert and looked alive from the inside. So the request
 * is the one `costRequestFor` really builds under the profile's own `callType`, on a real
 * building, mid-run.
 */

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../config/loader.js';
import { CALL_TYPES, type CallType } from '../../config/types.js';
import type { CarSnapshot, ServedFloor } from '../../model/car/types.js';
import { hallCallId } from '../../model/types.js';
import { DATA_DIR } from '../../sim/fixtures.test-helper.js';
import { Simulation } from '../../sim/simulation.js';
import { DISPATCH_PARAMETERS } from '../parameters.js';
import { createDispatchPolicy } from '../policy.js';
import type { DispatchCall, DispatchContext, DispatcherProfileSource } from '../types.js';

import { COST_TERMS } from './index.js';

/** The gate every destination-reading term is declared against. */
const CALL_TYPE_ID = 'dispatch.callType';

/** The call type that discloses nothing — the schema's own default. */
const WITHHELD: CallType = 'up-down-buttons';

/**
 * Every call type the schema declares, taken from `DISPATCH_PARAMETERS` rather than restated.
 *
 * A fourth call type reaches this test with no edit, which is the point: the classification is a
 * function of the schema and the engine, and of nothing written here. Intersected with `core`'s
 * own `CALL_TYPES` tuple only to narrow the schema's `readonly string[]` to the union a profile
 * can hold — and the throw below is what stops that narrowing quietly dropping a value.
 */
const DECLARED_CALL_TYPES: readonly CallType[] = (() => {
  const spec = DISPATCH_PARAMETERS.find((parameter) => parameter.id === CALL_TYPE_ID);
  if (spec?.values === undefined) throw new Error(`${CALL_TYPE_ID} declares no values`);
  const declared = spec.values;
  const narrowed = CALL_TYPES.filter((callType) => declared.includes(callType));
  if (narrowed.length !== declared.length) {
    throw new Error(`${CALL_TYPE_ID} declares a value CallType does not admit`);
  }
  return narrowed;
})();

/** Every term weighted, so every term is evaluated and appears in the breakdown. */
function everyTermUnder(callType: CallType): DispatcherProfileSource {
  return {
    id: `disclosure-${callType}`,
    name: `Every term weighted under ${callType}`,
    weights: Object.fromEntries(COST_TERMS.map((term) => [term.id, 1])),
    dispatch: { callType },
  };
}

/** What the group controller owns, in the shape `groupContext` hands over. */
function groupFacts(snapshots: readonly CarSnapshot[]): DispatchContext {
  const floors = snapshots[0]?.shaft.floors ?? [];
  const width = Math.max(1, Math.ceil(floors.length / Math.max(1, snapshots.length)));
  const zoneFloorIdsByCarId = new Map<string, readonly string[]>();
  snapshots.forEach((snapshot, index) => {
    zoneFloorIdsByCarId.set(
      snapshot.carId,
      floors.slice(index * width, (index + 1) * width).map((floor) => floor.id),
    );
  });
  const demandForecast = new Map<string, number>();
  floors.forEach((floor, index) => demandForecast.set(floor.id, index === 0 ? 30 : 1));
  return { zoneFloorIdsByCarId, demandForecast };
}

function callAt(
  floor: ServedFloor,
  direction: 'up' | 'down',
  destinationFloorId: string,
  at: number,
): DispatchCall {
  return {
    id: hallCallId(floor.id, direction),
    floorId: floor.id,
    floorIndex: floor.index,
    direction,
    registeredAt: Math.max(0, at - 95),
    destinationFloorId,
  };
}

/** What one term did across the call types, per term id. */
interface Disclosure {
  /** Call types at which some (car, call) raw differs from the withheld value. */
  readonly differsAt: Set<string>;
  /** Largest spread between two candidate cars with the destination **withheld**. */
  spreadWithheld: number;
  /** Evaluations compared, for non-vacuity. */
  compared: number;
}

async function measureDisclosure(): Promise<{
  disclosure: ReadonlyMap<string, Disclosure>;
  scoredCars: number;
}> {
  const config = await loadConfig(DATA_DIR);
  const building = config.buildingsById.get('midtown-office');
  const shipped = config.dispatcherProfilesById.get('predictive-balanced');
  expect(building).toBeDefined();
  expect(shipped).toBeDefined();

  const policies = new Map(
    DECLARED_CALL_TYPES.map((callType) => [
      callType,
      createDispatchPolicy(everyTermUnder(callType)),
    ]),
  );

  const disclosure = new Map<string, Disclosure>(
    COST_TERMS.map((term) => [
      term.id,
      { differsAt: new Set<string>(), spreadWithheld: 0, compared: 0 },
    ]),
  );
  let scoredCars = 0;

  // Mid-run at three points, for `liveness.test.ts`'s reason: at the end of a replication every
  // car is idle and empty, which is the one state that exercises nothing.
  for (const maxEvents of [600, 1500, 2500]) {
    const simulation = new Simulation({
      building: building!,
      dispatcherProfile: shipped!,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: 20260726,
      maxEvents,
      onTimeout: 'report',
    });
    try {
      simulation.run();
    } catch {
      // A truncated run is the point; the cars are what this test is after, not the numbers.
    }

    const at = Math.max(...simulation.building.cars.map((car) => car.snapshot().at));
    const snapshots = simulation.building.cars.map((car) => car.snapshot(at));
    const context = groupFacts(snapshots);

    for (const floor of snapshots[0]?.shaft.floors ?? []) {
      for (const direction of ['up', 'down'] as const) {
        for (const destinationFloorId of ['G', '12', '20']) {
          if (destinationFloorId === floor.id) continue;
          for (const waitingPassengers of [0, 4, 25]) {
            const subject = callAt(floor, direction, destinationFloorId, at);

            // Raw value by (call type, car id, term id). Only cars every call type scored are
            // compared, so a difference is the disclosure and never one of eligibility.
            const rawsByCallType = new Map<string, Map<string, Map<string, number>>>();
            for (const [callType, policy] of policies) {
              const scores = policy.score(subject, snapshots, at, {
                ...context,
                waitingPassengers,
              });
              const byCar = new Map<string, Map<string, number>>();
              for (const score of scores) {
                byCar.set(
                  score.carId,
                  new Map(score.terms.map((breakdown) => [breakdown.termId, breakdown.raw])),
                );
              }
              rawsByCallType.set(callType, byCar);
            }

            const withheld = rawsByCallType.get(WITHHELD);
            if (withheld === undefined) continue;
            const carIds = [...withheld.keys()].filter((carId) =>
              DECLARED_CALL_TYPES.every((callType) => rawsByCallType.get(callType)?.has(carId) === true),
            );
            if (carIds.length < 2) continue;
            scoredCars += carIds.length;

            for (const term of COST_TERMS) {
              const entry = disclosure.get(term.id) as Disclosure;
              const withheldRaws = carIds.map((carId) => withheld.get(carId)?.get(term.id) ?? 0);
              entry.spreadWithheld = Math.max(
                entry.spreadWithheld,
                Math.max(...withheldRaws) - Math.min(...withheldRaws),
              );
              for (const callType of DECLARED_CALL_TYPES) {
                if (callType === WITHHELD) continue;
                const byCar = rawsByCallType.get(callType) as Map<string, Map<string, number>>;
                carIds.forEach((carId, index) => {
                  entry.compared += 1;
                  if ((byCar.get(carId)?.get(term.id) ?? 0) !== withheldRaws[index]) {
                    entry.differsAt.add(callType);
                  }
                });
              }
            }
          }
        }
      }
    }
  }

  return { disclosure, scoredCars };
}

/** The call types named by a term's `activeWhen`/`partiallyActiveWhen` entry for the gate. */
function declaredCallTypes(
  conditions: Readonly<Record<string, readonly string[]>> | undefined,
): readonly string[] | undefined {
  return conditions?.[CALL_TYPE_ID];
}

describe('every term that reads the destination declares it, in the form that is true of it', () => {
  it('classifies each term by measurement and requires the declaration to match', async () => {
    const { disclosure, scoredCars } = await measureDisclosure();

    // Non-vacuity: a sweep that scored nothing would pass every assertion below in silence.
    expect(scoredCars, 'no (car, call) pair was compared across the call types').toBeGreaterThan(
      500,
    );
    expect(DECLARED_CALL_TYPES.length, 'only one call type to compare').toBeGreaterThan(1);

    /*
     * Measured at the time of writing — 4 320 (car, call) pairs, 8 640 cross-call-type
     * comparisons per term, `midtown-office` at three truncation points:
     *
     * | term | prices differently at | spread between cars, destination withheld |
     * |---|---|---|
     * | `rideTime` | destination-entry, mobile-credential | **0** — flat, so `activeWhen` |
     * | `stopCount` | destination-entry, mobile-credential | **1** — live, so `partiallyActiveWhen` |
     * | the other ten | — | 0.72 to 59 212, and none of them reads the destination |
     *
     * Those two rows are the whole finding: the same measurement that says both terms read the
     * destination says the two need **opposite** declarations, and the column that separates
     * them is the one `activeWhen` alone could not ask about.
     */
    const undeclared: string[] = [];
    const wrongForm: string[] = [];
    const overDeclared: string[] = [];
    let gated = 0;
    let partial = 0;

    for (const term of COST_TERMS) {
      const entry = disclosure.get(term.id) as Disclosure;
      expect(entry.compared, `${term.id} was never compared`).toBeGreaterThan(0);

      const whole = declaredCallTypes(term.activeWhen);
      const part = declaredCallTypes(term.partiallyActiveWhen);
      const reads = entry.differsAt.size > 0;
      const measured = [...entry.differsAt].sort();

      if (whole !== undefined && part !== undefined) {
        wrongForm.push(
          `${term.id} declares ${CALL_TYPE_ID} in both activeWhen and partiallyActiveWhen; ` +
            'a dimension cannot be both dead and live outside one condition',
        );
        continue;
      }

      if (!reads) {
        // A term that prices the same number with the destination and without it must not claim
        // otherwise — that is the `destination-eta` defect (§ D112) as a declaration.
        if (whole !== undefined || part !== undefined) {
          overDeclared.push(
            `${term.id} declares ${CALL_TYPE_ID} but its raw value is identical at every ` +
              `call type over ${entry.compared} comparisons`,
          );
        }
        continue;
      }

      if (whole === undefined && part === undefined) {
        undeclared.push(
          `${term.id} prices the call differently at ${measured.join(', ')} than at ` +
            `${WITHHELD} and declares neither activeWhen nor partiallyActiveWhen on ` +
            `${CALL_TYPE_ID}`,
        );
        continue;
      }

      const declared = [...(whole ?? part ?? [])].sort();
      if (JSON.stringify(declared) !== JSON.stringify(measured)) {
        wrongForm.push(
          `${term.id} declares ${CALL_TYPE_ID} ∈ {${declared.join(', ')}} and measurably ` +
            `prices differently at {${measured.join(', ')}}`,
        );
        continue;
      }

      if (whole !== undefined) {
        gated += 1;
        // The gate's own claim, at the term level: with the destination withheld the term says
        // the same thing about every car, so its weight cannot move an argmin there.
        if (entry.spreadWithheld !== 0) {
          wrongForm.push(
            `${term.id} is gated with activeWhen, and at ${WITHHELD} — outside the gate — it ` +
              `still separates two candidate cars by ${entry.spreadWithheld}. A gate that hides ` +
              'a live region is a dimension a generic optimizer was told to skip; declare ' +
              'partiallyActiveWhen instead',
          );
        }
        continue;
      }

      partial += 1;
      // The mirror-image obligation, and the one this file was written for. `partiallyActiveWhen`
      // says the dimension survives outside the condition; if it does not, the honest declaration
      // is the gate.
      if (entry.spreadWithheld === 0) {
        wrongForm.push(
          `${term.id} declares partiallyActiveWhen, and at ${WITHHELD} it scores every ` +
            'candidate car identically — so the weight really is a dead dimension there and ' +
            'activeWhen is the true declaration',
        );
      }
    }

    expect(
      undeclared,
      'these terms read the destination and say so nowhere a schema consumer can see. Declare ' +
        'activeWhen when the weight is dead without a destination, or partiallyActiveWhen when ' +
        'only part of the raw value is',
    ).toEqual([]);
    expect(overDeclared, 'these declarations are not true of the term').toEqual([]);
    expect(wrongForm, 'these terms declare the wrong one of the two forms').toEqual([]);

    // Non-vacuity in both directions: the file is worthless if no term of either kind exists.
    expect(gated, 'no wholly destination-priced term was observed').toBeGreaterThan(0);
    expect(partial, 'no partly destination-priced term was observed').toBeGreaterThan(0);
  }, 120_000);
});
