/**
 * Hand-built recordings, for the states a real run cannot be made to produce on demand.
 *
 * Not a `*.test.ts` file: vitest's `include` is `src/**\/*.test.ts`, so a helper named this way is
 * imported by tests and never collected as a suite.
 *
 * The breadth suites in this directory all run **real** replications of the shipped buildings,
 * because the claim under test is that the rail reads the runs this project produces. These
 * fixtures cover the cases those runs will not reliably show at a sampled instant — an empty
 * lobby, a rider parked in the fourth wait band, a recording carrying no demand schedule, a
 * decision naming a car the recording does not draw.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type {
  VizDecision,
  VizFloor,
  VizLanding,
  VizLeg,
  VizRecording,
  VizShaft,
} from '../contract/types.js';
import { FIXTURE_DOOR_CONFIG, fixtureSummary } from '../fixtures.test-helper.js';

/** A flat step series, for the fields a synthetic recording must carry but no assertion reads. */
const FLAT = { times: [] as number[], values: [] as number[], before: 0 };

export function syntheticFloor(id: string, index: number, label?: string): VizFloor {
  return {
    id,
    index,
    heightM: index * 3.5,
    label,
    isEntrance: index === 0,
    isTransferFloor: false,
    population: 40,
  };
}

export function syntheticShaft(carId: string, label: string): VizShaft {
  return {
    carId,
    bankId: 'main',
    label,
    startFloorId: 'L0',
    startHeightM: 0,
    servedFloorIds: ['L0', 'L1', 'L2'],
    capacityPersons: 13,
    doorConfig: FIXTURE_DOOR_CONFIG,
    motions: [],
    doorMarks: [],
    occupants: FLAT,
    loadFactor: FLAT,
  };
}

export interface SyntheticOptions {
  readonly legs?: readonly VizLeg[];
  readonly decisions?: readonly VizDecision[];
  readonly demandPhases?: VizRecording['demandPhases'];
  readonly summary?: Partial<ReturnType<typeof fixtureSummary>>;
  readonly startedAt?: number;
  readonly endedAt?: number;
  readonly floors?: readonly VizFloor[];
  readonly shafts?: readonly VizShaft[];
  /**
   * § 5's `trips`, as the instants the loaded moves ended — schema 10.
   *
   * Defaults to `[]` rather than to absent, on this helper's own rule that every field the contract
   * declares is present: a recording built here stands for one this build produced, and *the fleet
   * made no loaded trip* is the honest reading of a synthetic run with no motions. Pass `undefined`
   * explicitly to build the other case — a recording carrying no travel record at all, which is what
   * `shift/goals.ts` refuses to grade.
   */
  readonly loadedDepartures?: readonly SimTime[] | undefined;
}

/**
 * A minimal but **complete** recording. Every field the contract declares is present, so a suite
 * cannot pass because a code path found `undefined` where a real recording has a value.
 */
export function syntheticRecording(options: SyntheticOptions = {}): VizRecording {
  const floors =
    options.floors ??
    [syntheticFloor('L0', 0, 'Lobby'), syntheticFloor('L1', 1), syntheticFloor('L2', 2, 'Level 2')];
  const landings: VizLanding[] = floors.map((floor) => ({
    floorId: floor.id,
    direction: 'up',
    waiting: FLAT,
  }));
  return {
    schemaVersion: 7,
    runId: 'live-synthetic',
    seed: '20260730',
    buildingId: 'synthetic',
    buildingName: 'Synthetic',
    dispatcherProfileId: 'eta',
    trafficProfileId: undefined,
    passengerModel: 'conventional',
    status: 'completed',
    startedAt: options.startedAt ?? 0,
    endedAt: options.endedAt ?? 600,
    floors,
    shafts: options.shafts ?? [syntheticShaft('main-A', 'A'), syntheticShaft('main-B', 'B')],
    landings,
    legs: options.legs ?? [],
    progress: { waiting: FLAT, boardedLegs: FLAT, meanWaitS: FLAT },
    summary: fixtureSummary(options.summary ?? {}),
    demandPhases: options.demandPhases ?? [],
    decisions: options.decisions ?? [],
    outOfServiceCarIds: [],
    warnings: [],
    // Spread rather than assigned, so `loadedDepartures: undefined` builds the *absent* case under
    // `exactOptionalPropertyTypes` instead of a present `undefined`.
    ...('loadedDepartures' in options && options.loadedDepartures === undefined
      ? {}
      : { loadedDepartures: options.loadedDepartures ?? [] }),
  };
}

/** A leg that arrived and is still standing — the shape the wait bands count. */
export function waitingLeg(passengerId: string, arrivedAt: number, originFloorId = 'L0'): VizLeg {
  return {
    passengerId,
    originFloorId,
    destinationFloorId: 'L2',
    direction: 'up',
    arrivedAt,
  };
}

/**
 * A leg the building **turned away for want of a credential** — § D265's fourth outcome.
 *
 * `refusedAt` defaults to `arrivedAt` because that is what the simulator produces: measured, every
 * refused leg on every shipped run refuses at the instant it arrives — 4 of 4 on `secure-tower` and
 * 5 of 5 on `mixed-use-high-rise` over the breadth fixture, 72 of 72 on Secure Tower over its own
 * authored day. The parameter exists so a suite can build the *unmeasured* case on purpose rather
 * than by forgetting, since a fold that only ever meets a zero-second refusal cannot show whether
 * it resolves the wait at the refusal or at the arrival.
 *
 * No `carId` and no `bankId`: nothing carried this rider, which is the whole of what a refusal is.
 */
export function refusedLeg(
  passengerId: string,
  arrivedAt: number,
  refusedAt: number = arrivedAt,
  originFloorId = 'L0',
): VizLeg {
  return {
    passengerId,
    originFloorId,
    destinationFloorId: 'L2',
    direction: 'up',
    arrivedAt,
    refusedAt,
    credentialGroup: 'tenant-alpha-staff',
  };
}

/** A leg that arrived, boarded and alighted. */
export function servedLeg(
  passengerId: string,
  arrivedAt: number,
  boardedAt: number,
  alightedAt: number,
  originFloorId = 'L0',
): VizLeg {
  return {
    passengerId,
    originFloorId,
    destinationFloorId: 'L2',
    direction: 'up',
    arrivedAt,
    boardedAt,
    alightedAt,
    carId: 'main-A',
    bankId: 'main',
  };
}
