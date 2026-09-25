/**
 * **A thinned crowd is the same people, fewer of them** — GitHub issue #601, `DECISIONS.md` § D1076.
 *
 * The claim `traffic/types.ts#CrowdThinning` makes, held on the trace and on the legs:
 *
 * 1. **Absent, or keeping everybody, is the trace generated before the field existed**, byte for byte.
 * 2. **Every kept passenger is the unthinned passenger** field for field — id, arrival, origin,
 *    destination, legs, mass, credential — which is the thing a population edit cannot give: it
 *    re-draws the whole trace, because a floor's population reaches every interfloor weight.
 * 3. **Only the named floors lose anybody**, and they lose about the share asked.
 * 4. **Two thinnings of one trace are nested**, because the draw is the person's rather than the floor's.
 * 5. **On the legs of a run**: every first leg the thinned run records is the unthinned run's leg
 *    for the same passenger, arriving at the same instant on the same floor for the same place.
 * 6. What it refuses: a floor the building does not have, and a share outside `[0, 1]`.
 *
 * The contrast is measured here too, so the file says why thinning exists rather than asserting it:
 * the same reduction written as a population edit keeps almost nobody's arrival where it was.
 */
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config/loader.js';
import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { StreamSet } from '../random/index.js';
import { runSimulation } from '../sim/simulation.js';

import { generateTrace } from './generator.js';
import type { CrowdThinning, GeneratedPassenger, PassengerTrace } from './types.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const SEED = 20_260_925n;

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 120_000);

function buildingOf(id: string): ResolvedBuilding {
  const building = config.buildingsById.get(id);
  if (building === undefined) throw new Error(`no building "${id}"`);
  return building;
}

function traceOf(building: ResolvedBuilding, thinning?: CrowdThinning): PassengerTrace {
  return generateTrace({
    building,
    profiles: config.trafficProfiles,
    streams: new StreamSet(SEED),
    ...(thinning === undefined ? {} : { crowdThinning: thinning }),
  });
}

const byId = (trace: PassengerTrace): ReadonlyMap<string, GeneratedPassenger> =>
  new Map(trace.passengers.map((passenger) => [passenger.id, passenger]));

/** Half of every populated floor above the lobby on Midtown Office, which is the shape a cohort takes. */
function halfOfTheUpperFloors(building: ResolvedBuilding, share: number): CrowdThinning {
  const floors = building.floors.filter((floor) => floor.population > 0 && floor.isEntrance !== true);
  const upper = floors.slice(Math.floor(floors.length / 2));
  return { keepShareByFloor: Object.fromEntries(upper.map((floor) => [floor.id, share])) };
}

describe('crowd thinning keeps the same people', () => {
  it('is the unthinned trace, byte for byte, when absent or when every share is 1', () => {
    const building = buildingOf('midtown-office');
    const whole = JSON.stringify(traceOf(building));
    const everybody = halfOfTheUpperFloors(building, 1);
    expect(Object.keys(everybody.keepShareByFloor).length).toBeGreaterThan(0);
    expect(JSON.stringify(traceOf(building, everybody))).toBe(whole);
    expect(JSON.stringify(traceOf(building, { keepShareByFloor: {} }))).toBe(whole);
  });

  it('keeps every kept passenger exactly, and removes only on the floors it names', () => {
    const building = buildingOf('midtown-office');
    const whole = traceOf(building);
    const thinning = halfOfTheUpperFloors(building, 0.5);
    const named = new Set(Object.keys(thinning.keepShareByFloor));
    const thinned = traceOf(building, thinning);
    const original = byId(whole);

    for (const passenger of thinned.passengers) {
      expect(passenger).toEqual(original.get(passenger.id));
    }
    const keptIds = new Set(thinned.passengers.map((passenger) => passenger.id));
    let onNamed = 0;
    let keptOnNamed = 0;
    for (const passenger of whole.passengers) {
      if (named.has(passenger.demandFloorId)) {
        onNamed += 1;
        if (keptIds.has(passenger.id)) keptOnNamed += 1;
      } else {
        expect(keptIds.has(passenger.id)).toBe(true);
      }
    }
    // A share of one half over a few hundred people: the kept fraction sits well inside [0.35, 0.65].
    expect(onNamed).toBeGreaterThan(100);
    expect(keptOnNamed / onNamed).toBeGreaterThan(0.35);
    expect(keptOnNamed / onNamed).toBeLessThan(0.65);
    expect(thinned.passengerCount).toBe(thinned.passengers.length);
    expect(thinned.passengers.length).toBe(whole.passengers.length - (onNamed - keptOnNamed));
    // Every batch still standing is a batch of the whole trace, and none is empty.
    const batchIds = new Set(whole.arrivals.map((batch) => batch.id));
    for (const batch of thinned.arrivals) {
      expect(batchIds.has(batch.id)).toBe(true);
      expect(batch.passengers.length).toBeGreaterThan(0);
    }
    expect(thinned.expectedPassengers).toBeLessThan(whole.expectedPassengers);
  });

  it('is nested: whoever a lower share keeps, a higher share keeps too', () => {
    const building = buildingOf('midtown-office');
    const low = new Set(traceOf(building, halfOfTheUpperFloors(building, 0.4)).passengers.map((p) => p.id));
    const high = new Set(traceOf(building, halfOfTheUpperFloors(building, 0.8)).passengers.map((p) => p.id));
    expect(low.size).toBeLessThan(high.size);
    for (const id of low) expect(high.has(id)).toBe(true);
  });

  it('is a crowd the population edit is not: the same reduction as a population re-draws nearly everybody', () => {
    const building = buildingOf('midtown-office');
    const thinning = halfOfTheUpperFloors(building, 0.5);
    const whole = traceOf(building);
    const thinned = traceOf(building, thinning);
    const repopulated: ResolvedBuilding = {
      ...building,
      floors: building.floors.map((floor) =>
        floor.id in thinning.keepShareByFloor ? { ...floor, population: Math.round(floor.population / 2) } : floor,
      ),
    } as ResolvedBuilding;
    const redrawn = generateTrace({
      building: { ...repopulated, floorsById: new Map(repopulated.floors.map((floor) => [floor.id, floor])) } as ResolvedBuilding,
      profiles: config.trafficProfiles,
      streams: new StreamSet(SEED),
    });
    const key = (passenger: GeneratedPassenger): string =>
      `${String(passenger.arrivalTimeS)} ${passenger.originFloorId} ${passenger.finalDestinationFloorId}`;
    const wholeKeys = new Set(whole.passengers.map(key));
    const survivingRedrawn = redrawn.passengers.filter((passenger) => wholeKeys.has(key(passenger))).length;
    const survivingThinned = thinned.passengers.filter((passenger) => wholeKeys.has(key(passenger))).length;
    expect(survivingThinned).toBe(thinned.passengers.length);
    // The re-drawn crowd keeps a small minority of the as-built journeys; measured, not argued.
    expect(survivingRedrawn / redrawn.passengers.length).toBeLessThan(0.2);
  });

  it('keeps each kept rider on the legs of a run: same passenger, same instant, same floors', () => {
    const building = buildingOf('midtown-office');
    const profile = config.dispatcherProfilesById.get('collective');
    if (profile === undefined) throw new Error('no profile "collective"');
    const run = (thinning?: CrowdThinning) =>
      runSimulation({
        building,
        dispatcherProfile: profile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
        ...(thinning === undefined ? {} : { crowdThinning: thinning }),
      });
    const whole = run();
    const thinned = run(halfOfTheUpperFloors(building, 0.5));
    const firstLegs = (legs: typeof whole.record.passengers) =>
      new Map(legs.filter((leg) => leg.legIndex === 0).map((leg) => [leg.passengerId, leg]));
    const before = firstLegs(whole.record.passengers);
    const after = firstLegs(thinned.record.passengers);
    expect(after.size).toBeLessThan(before.size);
    expect(after.size).toBeGreaterThan(0);
    for (const [id, leg] of after) {
      const partner = before.get(id);
      expect(partner).toBeDefined();
      expect([leg.arrivedAt, leg.originFloorId, leg.finalDestinationFloorId, leg.massKg]).toEqual([
        partner!.arrivedAt,
        partner!.originFloorId,
        partner!.finalDestinationFloorId,
        partner!.massKg,
      ]);
    }
  });

  it('keeps each kept rider’s stair choice, because the stairs are drawn before the thinning', () => {
    /*
     * The stairs and patience are drawn one per passenger in trace order. Drawn over the thinned
     * trace, every kept rider would take the draw of whoever stood before them: measured on the fix
     * case `every-letter-says-nine` at St Jude's, 54 riders who walked the stair as built rode the
     * lift once half of floor 1 was thinned. So a kept rider rides the lift in the thinned run
     * exactly when they rode it as built. Patience is drawn at the same point for the same reason;
     * who gives up also depends on the wait, which the dispatcher decides, so it is not compared here.
     */
    const building = buildingOf('st-jude-hospital');
    const profile = config.dispatcherProfilesById.get('collective');
    if (profile === undefined) throw new Error('no profile "collective"');
    const run = (thinning?: CrowdThinning) =>
      runSimulation({
        building,
        dispatcherProfile: profile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
        ...(thinning === undefined ? {} : { crowdThinning: thinning }),
      });
    const whole = run();
    const thinned = run({ keepShareByFloor: { '1': 0.5 } });
    const rode = (result: typeof whole) =>
      new Set(result.record.passengers.filter((leg) => leg.legIndex === 0).map((leg) => leg.passengerId));
    const kept = thinned.trace.passengers.map((passenger) => passenger.id);
    const walkedAsBuilt = whole.trace.passengers.filter((passenger) => !rode(whole).has(passenger.id)).length;
    expect(walkedAsBuilt, 'the stair must be taken by somebody, or this proves nothing').toBeGreaterThan(0);
    expect(kept.filter((id) => rode(thinned).has(id))).toEqual(kept.filter((id) => rode(whole).has(id)));
  });

  it('refuses a floor the building does not have, and a share outside [0, 1]', () => {
    const building = buildingOf('midtown-office');
    expect(() => traceOf(building, { keepShareByFloor: { 'no-such-floor': 0.5 } })).toThrow(/does not declare/);
    const floor = building.floors.find((candidate) => candidate.population > 0)!;
    expect(() => traceOf(building, { keepShareByFloor: { [floor.id]: 1.5 } })).toThrow(/cannot add/);
    expect(() => traceOf(building, { keepShareByFloor: { [floor.id]: -0.1 } })).toThrow(/\[0, 1\]/);
  });
});
