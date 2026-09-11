/**
 * **Move the duty weight and require the run to change, compared on the legs.** GitHub issue #481,
 * `DECISIONS.md` § D549 — `CLAUDE.md`'s standing requirement pointed at the owner's ruling that
 * *"duty binds dispatch through a cost term"*.
 *
 * The chain this file walks end to end, through the shipped runner and nothing hand-built:
 * `ResolvedCar.duty` → `CarInit.duty` → `CarSnapshot.duty`, and the trace's `duty` →
 * `Passenger.duty` → the landing call's head (`Simulation#callValue`) → `DispatchCall.duty` →
 * `costRequestFor` → `CostRequest.duty` → `dutyMismatchTerm` → `scoreCar`. A link missing anywhere
 * makes the two runs below identical, which is the failure this file exists to see.
 *
 * `capacity-aware` is the profile `data/dispatcher-profiles.json` gives the shipped weight, and it
 * authors no `dispatch.callType`, so it runs at `up-down-buttons` — the disclosure the call makes
 * is the landing's own duty control, not a destination panel.
 */
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config/loader.js';
import {
  DEFAULT_CAR_DUTY,
  DUTIES,
  type Duty,
  type LoadedConfig,
  type ResolvedBuilding,
} from '../config/types.js';
import { resolveDispatchConfig } from '../dispatch/policy.js';
import type { PassengerRecord } from '../metrics/types.js';

import { withDuty } from './duty.test-helper.js';
import { runSimulation } from './simulation.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const SEED = 20_260_911;
const PROFILE_ID = 'capacity-aware';

/** One goods car in Midtown Office's four-car bank, and a demand that gives it goods to carry. */
const DECLARED: Readonly<Record<string, Duty>> = { 'main-A': 'goods' };
const SHARES = { goods: 0.2, bed: 0, service: 0 } as const;

let config: LoadedConfig;
let building: ResolvedBuilding;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const midtown = config.buildingsById.get('midtown-office');
  if (midtown === undefined) throw new Error('no midtown-office');
  building = withDuty(midtown, DECLARED);
}, 120_000);

function legsAt(weight: number | undefined, target: ResolvedBuilding = building) {
  const shipped = config.dispatcherProfilesById.get(PROFILE_ID);
  if (shipped === undefined) throw new Error(`no profile "${PROFILE_ID}"`);
  const profile =
    weight === undefined ? shipped : { ...shipped, weights: { ...shipped.weights, dutyMismatch: weight } };
  return runSimulation({
    building: target,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    onTimeout: 'report',
    demand: { duty: { shares: SHARES } },
  }).record.passengers;
}

/** Legs that boarded a car whose duty is not the rider's. */
function mismatched(legs: readonly PassengerRecord[]): { boarded: number; mismatched: number } {
  let boarded = 0;
  let count = 0;
  for (const leg of legs) {
    if (leg.carId === undefined) continue;
    boarded += 1;
    const carDuty = DECLARED[leg.carId] ?? DEFAULT_CAR_DUTY;
    if (leg.duty !== carDuty) count += 1;
  }
  return { boarded, mismatched: count };
}

describe('the duty weight binds dispatch', () => {
  it('runs the shipped weight under up-down buttons, so the landing call carries the duty', () => {
    const shipped = config.dispatcherProfilesById.get(PROFILE_ID);
    expect(shipped).toBeDefined();
    expect(resolveDispatchConfig(shipped!).dispatch.callType).toBe('up-down-buttons');
    expect(shipped!.weights['dutyMismatch'] ?? 0).toBeGreaterThan(0);
  });

  it('changes the legs when the weight moves, on a building that declares a duty', () => {
    const off = legsAt(0);
    const shipped = legsAt(undefined);
    const strong = legsAt(5);
    expect(JSON.stringify(shipped)).not.toBe(JSON.stringify(off));
    expect(JSON.stringify(strong)).not.toBe(JSON.stringify(off));

    // And in the direction the term prices: fewer riders put in a car that is not for their trip.
    const atOff = mismatched(off);
    const atStrong = mismatched(strong);
    expect(atOff.boarded).toBeGreaterThan(100);
    expect(atStrong.mismatched).toBeLessThan(atOff.mismatched);
    if (process.env['DUTY_SEAM_REPORT'] === '1') {
      process.stdout.write(
        `DUTY_SEAM off=${JSON.stringify(atOff)} shipped=${JSON.stringify(mismatched(shipped))} strong=${JSON.stringify(atStrong)}\n`,
      );
    }
  });

  it('leaves the legs alone at any weight when the same building declares nothing', () => {
    const undeclared = config.buildingsById.get('midtown-office') as ResolvedBuilding;
    expect(JSON.stringify(legsAt(5, undeclared))).toBe(JSON.stringify(legsAt(0, undeclared)));
  });

  it('puts a duty from the closed list on every leg, the same on every leg of a journey', () => {
    const legs = legsAt(undefined);
    const byJourney = new Map<string, Duty | undefined>();
    let goods = 0;
    for (const leg of legs) {
      expect(DUTIES).toContain(leg.duty);
      if (leg.duty === 'goods') goods += 1;
      const seen = byJourney.get(leg.journeyId);
      if (seen !== undefined) expect(leg.duty).toBe(seen);
      byJourney.set(leg.journeyId, leg.duty);
    }
    expect(goods).toBeGreaterThan(0);
  });
});
