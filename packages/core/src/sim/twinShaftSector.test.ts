/**
 * **A sectored TWIN shaft is live under every shipped dispatcher** — `docs/11` § 3.2's regime R1.
 *
 * `sim/twinShaft.test.ts` is the seam guard for the *free* regime (R2), and it did not catch what
 * this file exists for. Its liveness property bounds the **longest separation deferral** by a
 * quarter of a 900 s run and reads riders left aboard at the horizon as the regime's *cost* —
 * its own comment says *"riders are still aboard at the horizon where the control has none"*. So
 * a pair that crossed late in the run, with both cars standing loaded until the kernel drained,
 * stayed inside the bound and passed. Measured on that file's own fixture at its own seed, a
 * 900 s two-way run under `eta` (the profile it uses) ends with riders aboard, and so does every
 * other shipped profile except `destination-panel`. The first test below pins that, so the reason
 * this regime exists is a run rather than a sentence.
 *
 * ## What R1 is here
 *
 * `ShaftConfig.sectorBoundaryFloorId` declares floor *k*. The lower car's sector is every shaft
 * floor up to and including *k*; the upper car's is every floor at least one required gap above
 * *k*. A car is offered, boards for, parks at and starts at floors of its own sector only, so the
 * two cars' commitments can always be discharged at once and the movement gate never has to defer
 * one — which is asserted below as **zero deferrals**, the opposite of the free regime's *"zero is
 * a wiring bug"*, and for the same reason: it is the number that says which regime ran.
 *
 * ## The properties
 *
 * | # | Property | Fails when |
 * |---|---|---|
 * | 1 | the free regime strands riders on this fixture | somebody makes R2 live, and this file's premise needs re-reading |
 * | 2 | **every journey is delivered**, under every shipped profile | a car boards a rider it cannot deliver, or a refused rider's call is offered to the same car forever |
 * | 3 | **no car ends the run with a rider aboard** | the pair deadlocks through car calls |
 * | 4 | each car stays in its sector, and the gate never defers | the sector is a label and not a constraint |
 * | 5 | both cars of the pair carry riders | the fix was to idle the pair |
 *
 * No performance figure is published. Each cell is one seed at one operating point, which
 * `CLAUDE.md` § Statistical discipline says is not a comparison, and nothing below compares the
 * regimes on anything but *did the run finish with everybody delivered*.
 */

import { describe, expect, it } from 'vitest';

import type {
  DispatcherProfile,
  ResolvedBank,
  ResolvedBuilding,
  ResolvedShaft,
} from '../config/types.js';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

const SEED = 20_260_916;
const BUILDING = 'midtown-office';
const BANK = 'main';
const SHAFT_ID = 'main-twin';
/** Mid-rise: ten landings below, ten above. The lower sector holds both entrances. */
const BOUNDARY_FLOOR_ID = '10';

/** Both cars wanted at both ends: where a crossed pair comes from. `twinShaft.test.ts`'s own. */
const TWO_WAY: SimulationConfig['demand'] = {
  directionalSplit: { incoming: 0.45, outgoing: 0.45, interfloor: 0.1 },
  arrivalRatePctPop5min: 4,
  peakWindowS: 300,
};

/** Interfloor-heavy: riders whose origin is in one sector and whose destination is in the other. */
const INTERFLOOR: SimulationConfig['demand'] = {
  directionalSplit: { incoming: 0.3, outgoing: 0.3, interfloor: 0.4 },
  arrivalRatePctPop5min: 4,
  peakWindowS: 300,
};

const DEMANDS = { 'two-way': TWO_WAY, interfloor: INTERFLOOR } as const;

interface Fixture {
  readonly building: ResolvedBuilding;
  readonly lowerCarId: string;
  readonly upperCarId: string;
  readonly boundaryHeightM: number;
  readonly gapM: number;
}

/**
 * `twinShaft.test.ts`'s fixture — `midtown-office` with its first two cars in one hoistway and the
 * other two left alone — with or without a declared sector boundary.
 */
function fixture(building: ResolvedBuilding, sectored: boolean): Fixture {
  const bank = building.banks.find((candidate) => candidate.id === BANK) as ResolvedBank;
  const [lower, upper, ...rest] = bank.cars;
  if (lower === undefined || upper === undefined) throw new Error('the bank needs two cars to pair');

  const heights = bank.servesFloors
    .map((floorId) => building.floorsById.get(floorId)?.heightM ?? Number.NaN)
    .sort((a, b) => a - b);
  let standingClearanceM = Number.POSITIVE_INFINITY;
  for (let i = 1; i < heights.length; i += 1) {
    standingClearanceM = Math.min(standingClearanceM, (heights[i] as number) - (heights[i - 1] as number));
  }

  const shafts: readonly ResolvedShaft[] = [
    {
      id: SHAFT_ID,
      carIds: [lower.id, upper.id],
      separation: {
        standingClearanceM,
        bufferM: 0,
        emergencyDecelerationMps2: 2 * Math.max(lower.acceleration, upper.acceleration),
      },
      ...(sectored ? { sectorBoundaryFloorId: BOUNDARY_FLOOR_ID } : {}),
    },
    ...rest.map((car) => ({ id: `${BANK}-${car.id}`, carIds: [car.id] })),
  ];

  return {
    building: {
      ...building,
      banks: building.banks.map((candidate) =>
        candidate.id === BANK ? { ...candidate, shafts } : candidate,
      ),
    },
    lowerCarId: `${BANK}-${lower.id}`,
    upperCarId: `${BANK}-${upper.id}`,
    boundaryHeightM: building.floorsById.get(BOUNDARY_FLOOR_ID)?.heightM ?? Number.NaN,
    gapM: standingClearanceM,
  };
}

interface Loaded {
  readonly run: (
    building: ResolvedBuilding,
    profile: DispatcherProfile,
    demand: SimulationConfig['demand'],
  ) => SimulationResult;
  readonly profiles: readonly DispatcherProfile[];
  readonly building: ResolvedBuilding;
}

async function loaded(): Promise<Loaded> {
  const cfg = await load();
  return {
    building: cfg.buildingsById.get(BUILDING) as ResolvedBuilding,
    profiles: [...cfg.dispatcherProfilesById.values()],
    run: (building, dispatcherProfile, demand) =>
      runSimulation({
        building,
        dispatcherProfile,
        trafficProfiles: cfg.trafficProfiles,
        elevatorSpecs: cfg.elevatorSpecs,
        seed: SEED,
        durationS: 900,
        onTimeout: 'report',
        recordCarMoves: true,
        demand,
      }),
  };
}

/** Legs that boarded and never alighted: a rider still in a car when the run ended. */
/** A profile that declares no call type runs on up/down buttons, the documented default. */
const callTypeOf = (profile: DispatcherProfile): string =>
  profile.dispatch?.callType ?? 'up-down-buttons';

const aboardAtEnd = (result: SimulationResult): number =>
  result.record.passengers.filter(
    (leg) => leg.boardedAt !== undefined && leg.alightedAt === undefined,
  ).length;

describe('a sectored TWIN shaft delivers everybody, under every shipped dispatcher', () => {
  it('is needed: the free regime ends this fixture with riders aboard under an up/down profile', async () => {
    const { run, profiles, building } = await loaded();
    const free = fixture(building, false);
    const eta = profiles.find((profile) => profile.id === 'eta') as DispatcherProfile;
    expect(callTypeOf(eta)).toBe('up-down-buttons');

    const result = run(free.building, eta, TWO_WAY);
    // The kernel drained long before its deadline, so these riders were not cut off by a timeout:
    // nothing was left that could move them.
    expect(result.record.endedAt).toBeLessThan(900 + 3600);
    expect(aboardAtEnd(result), 'the free regime delivered everybody; re-read this file').toBeGreaterThan(0);
    // And the run says why, beside the count — which the sectored run below must not.
    expect(result.warnings.filter((warning) => warning.includes('free regime'))).toHaveLength(1);
    const sectored = run(fixture(building, true).building, eta, TWO_WAY);
    expect(sectored.warnings.filter((warning) => warning.includes('free regime'))).toEqual([]);
  }, 300_000);

  it('delivers every journey and leaves nobody aboard, with each car in its own sector', async () => {
    const { run, profiles, building } = await loaded();
    const sectored = fixture(building, true);
    expect(profiles.length, 'no dispatcher profile was loaded').toBeGreaterThan(10);

    const callTypes = new Set<string>();
    for (const profile of profiles) {
      callTypes.add(callTypeOf(profile));
      for (const [demandName, demand] of Object.entries(DEMANDS)) {
        const cell = `${profile.id} / ${demandName}`;
        const result = run(sectored.building, profile, demand);
        const legs = result.record.passengers;
        expect(legs.length, `${cell}: the trace is empty`).toBeGreaterThan(50);

        // 2. Every journey is delivered.
        expect(result.undelivered.length, `${cell}: journeys were left undelivered`).toBe(0);
        expect(
          legs.filter((leg) => leg.boardedAt === undefined).length,
          `${cell}: riders were never collected`,
        ).toBe(0);

        // 3. Nobody is aboard at the end.
        expect(aboardAtEnd(result), `${cell}: a car ended the run with riders aboard`).toBe(0);

        // 4. The sector is a constraint: every commanded move of each car ends inside its own,
        //    so no pair of commitments can conflict and the movement gate never defers one.
        const moves = result.record.carMoves ?? [];
        const lowerMoves = moves.filter((move) => move.carId === sectored.lowerCarId);
        const upperMoves = moves.filter((move) => move.carId === sectored.upperCarId);
        expect(
          Math.max(...lowerMoves.map((move) => move.toHeightM)),
          `${cell}: the lower car left its sector`,
        ).toBeLessThanOrEqual(sectored.boundaryHeightM);
        expect(
          Math.min(...upperMoves.map((move) => move.toHeightM)),
          `${cell}: the upper car left its sector`,
        ).toBeGreaterThanOrEqual(sectored.boundaryHeightM + sectored.gapM);
        expect(result.stageActivity.separationDeferrals ?? 0, `${cell}: the gate deferred a move`).toBe(0);
        expect(result.stageActivity.separationBreaches ?? 0, `${cell}: the clearance was breached`).toBe(0);
        expect(result.stageActivity.separationChecks ?? 0, `${cell}: the gate never ran`).toBeGreaterThan(0);

        // 5. The pair carries riders; it is not parked out of the way. The upper car is asked
        //    only where the traffic can use it: its sector holds no entrance, so on a lobby-bound
        //    peak the only riders it can carry are the few travelling between two upper floors,
        //    and some dispatchers hand it none of them. That is R1's price (`docs/11` § 3.2: *"two
        //    cars that cannot both serve the lobby are close to two small lifts"*), stated here
        //    rather than hidden behind a weaker assertion for both cars.
        const carried = (carId: string): number => legs.filter((leg) => leg.carId === carId).length;
        expect(carried(sectored.lowerCarId), `${cell}: the lower car carried nobody`).toBeGreaterThan(0);
        if (demandName === 'interfloor') {
          expect(carried(sectored.upperCarId), `${cell}: the upper car carried nobody`).toBeGreaterThan(0);
        }
      }
    }
    // The claim is about hall-call dispatch, so say the corpus contains it — and the destination
    // call types beside it, which the same sector has to hold under.
    expect(callTypes.has('up-down-buttons')).toBe(true);
    expect(callTypes.size).toBeGreaterThan(1);
  }, 600_000);

  it('refuses nobody the bank can carry: a cross-sector rider goes by an ordinary shaft', async () => {
    const { run, profiles, building } = await loaded();
    const sectored = fixture(building, true);
    const nearest = profiles.find((profile) => profile.id === 'nearest-car') as DispatcherProfile;
    const result = run(sectored.building, nearest, INTERFLOOR);

    const index = (floorId: string): number => building.floorsById.get(floorId)?.index ?? Number.NaN;
    const boundaryIndex = index(BOUNDARY_FLOOR_ID);
    const crossing = result.record.passengers.filter(
      (leg) =>
        index(leg.originFloorId) <= boundaryIndex !== index(leg.destinationFloorId) <= boundaryIndex,
    );
    expect(crossing.length, 'the trace has no cross-sector rider, so this checks nothing').toBeGreaterThan(10);
    for (const leg of crossing) {
      expect(leg.alightedAt, `cross-sector leg ${leg.passengerId} was not delivered`).toBeDefined();
      expect([sectored.lowerCarId, sectored.upperCarId]).not.toContain(leg.carId);
    }

    // And the group stopped offering such a rider's call to a car that cannot take them. The
    // unfixed engine made thousands of these assignments in one run (`nearest-car`), so the bound
    // is an order of magnitude and not a pin.
    const refused = result.warnings.filter((warning) => warning.includes('refused'));
    expect(refused, 'a car and the group disagreed about a call all run').toEqual([]);
  }, 300_000);
});
