/**
 * **A service event can move a bank's range and a car's rated load, and both change the run** —
 * GitHub issue #346, § D523.
 *
 * `serviceMode.test.ts` proved the first kind of service event; this file proves the second and
 * third, and it is built on the repository's standing shape: *move the control and require the run
 * to change, compared on the legs.* Every assertion below reads the passenger record — who boarded
 * which car when, who alighted where, who was stranded and at what instant — and none reads a
 * private field.
 *
 * ## The fixture
 *
 * Two banks over six floors. `local` serves G–4, `express` serves G and 4–6, and floors 5 and 6
 * are reachable by the express **alone**. Closing the express above 4 at 300 s therefore leaves
 * every G → 5 and G → 6 rider with no bank at all, which is the stranding case the issue names;
 * reopening it at 600 s is the widening case. No floor is a transfer floor, so every journey is
 * one leg and `conservation.stranded` (journeys) and `stageActivity.strandedLegs` (legs) must agree.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ConfigError, ISSUE_CODES } from '../config/schema.js';
import { parseBuilding, resolveBuilding } from '../config/parse.js';
import { isServiceDerateEvent, isServiceRangeEvent } from '../config/serviceEvent.js';
import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { parseRunRecord } from '../metrics/serialization.js';
import { summarizeWaiting } from '../metrics/summarize.js';
import type { PassengerRecord } from '../metrics/types.js';
import { Bank } from '../model/bank.js';
import { createBuilding } from '../model/building.js';
import { LoadSensor } from '../model/car/loadSensor.js';

import { DATA_DIR, fingerprint, load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

const SEED = 20_260_906;
const CLOSES_AT_S = 300;
const REOPENS_AT_S = 600;
const EXPRESS_ONLY = new Set(['5', '6']);

function tower(serviceEvents: readonly Record<string, unknown>[] = []): Record<string, unknown> {
  const car = (id: string): Record<string, unknown> => ({
    id,
    spec: 'hydraulic',
    ratedSpeedMps: 0.63,
    doorType: 'sideOpening',
    ratedLoadLb: 2100,
  });
  return {
    id: 'range-tower',
    name: 'Range tower',
    type: 'residential',
    trafficProfile: 'residential',
    floors: [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
      { id: '2', index: 2, heightM: 3, population: 60 },
      { id: '3', index: 3, heightM: 6, population: 60 },
      { id: '4', index: 4, heightM: 9, population: 60 },
      { id: '5', index: 5, heightM: 12, population: 60 },
      { id: '6', index: 6, heightM: 15, population: 60 },
    ],
    totalPopulation: 300,
    banks: [
      { id: 'local', servesFloors: ['G', '2', '3', '4'], cars: [car('L1'), car('L2')] },
      { id: 'express', servesFloors: ['G', '4', '5', '6'], cars: [car('E1'), car('E2')] },
    ],
    accessZones: [],
    ...(serviceEvents.length === 0 ? {} : { serviceEvents }),
  };
}

function resolve(
  config: LoadedConfig,
  serviceEvents: readonly Record<string, unknown>[] = [],
): ResolvedBuilding {
  return resolveBuilding(parseBuilding(tower(serviceEvents), 'range-tower.json'), config.elevatorSpecs, {
    file: 'range-tower.json',
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

function expectError(config: LoadedConfig, serviceEvents: readonly Record<string, unknown>[]): ConfigError {
  try {
    resolve(config, serviceEvents);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected resolveBuilding to refuse');
}

function run(
  config: LoadedConfig,
  building: ResolvedBuilding,
  extra: Partial<SimulationConfig> = {},
): SimulationResult {
  return runSimulation({
    building,
    dispatcherProfile: config.dispatcherProfilesById.get('collective') as never,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    durationS: 900,
    drainGraceS: 300,
    demand: { arrivalRatePctPop5min: 30 },
    onTimeout: 'report',
    ...extra,
  });
}

const CLOSE = { atS: CLOSES_AT_S, bankId: 'express', servesFloors: ['G', '4'] };
const REOPEN = { atS: REOPENS_AT_S, bankId: 'express', servesFloors: ['G', '4', '5', '6'] };
const DERATE = { atS: 1, carId: 'E1', bankId: 'express', ratedLoadLb: 700 };

/** The largest mass aboard one car at any instant from `fromS` on, summed from the legs. */
function peakMassAboardKg(legs: readonly PassengerRecord[], carId: string, fromS: number): number {
  const events: { at: number; deltaKg: number }[] = [];
  for (const leg of legs) {
    if (leg.carId !== carId || leg.boardedAt === undefined) continue;
    events.push({ at: leg.boardedAt, deltaKg: leg.massKg });
    if (leg.alightedAt !== undefined) events.push({ at: leg.alightedAt, deltaKg: -leg.massKg });
  }
  // Alightings before boardings at the same instant: the doors open, people step off, then on.
  events.sort((a, b) => a.at - b.at || a.deltaKg - b.deltaKg);
  let aboard = 0;
  let peak = 0;
  for (const event of events) {
    aboard += event.deltaKg;
    if (event.at >= fromS && aboard > peak) peak = aboard;
  }
  return peak;
}

/* -------------------------------------------------------------------------- *
 * 1. Resolving — the two new shapes, located and refused with a path
 * -------------------------------------------------------------------------- */

describe('resolveBuilding locates range and derate events', () => {
  it('resolves a range entry to its bank and floors, and a derate to kilograms the way the plate is', async () => {
    const config = await load();
    const resolved = resolve(config, [CLOSE, DERATE, { ...DERATE, atS: 2, ratedLoadLb: 2100 }]);
    const events = resolved.serviceEvents ?? [];
    expect(events).toHaveLength(3);
    const [close, derate, plate] = events;
    expect(close !== undefined && isServiceRangeEvent(close) && close.servesFloors).toEqual(['G', '4']);
    expect(derate !== undefined && isServiceDerateEvent(derate) && derate.ratedLoadKg).toBe(
      Math.round(700 * 0.45359237),
    );
    // A derate authored at the plate resolves to exactly the plate — the reference table's nominal
    // figure, which is not the pound conversion.
    const platedKg = resolved.banks[1]?.cars[0]?.ratedLoadKg;
    expect(plate !== undefined && isServiceDerateEvent(plate) && plate.ratedLoadKg).toBe(platedKg);
  });

  it('refuses a range entry naming a bank the building does not declare', async () => {
    const config = await load();
    const error = expectError(config, [{ ...CLOSE, bankId: 'sky' }]);
    expect(error.issues.map((issue) => issue.code)).toEqual([ISSUE_CODES.unknownServiceEventBank]);
    expect(error.issues[0]?.path).toBe('serviceEvents[0].bankId');
    expect(error.message).toContain('local, express');
  });

  it('refuses a range entry naming a floor the building does not declare, and a floor listed twice', async () => {
    const config = await load();
    const unknown = expectError(config, [{ ...CLOSE, servesFloors: ['G', '99'] }]);
    expect(unknown.issues.map((issue) => [issue.code, issue.path])).toEqual([
      [ISSUE_CODES.unknownFloor, 'serviceEvents[0].servesFloors[1]'],
    ]);
    const twice = expectError(config, [{ ...CLOSE, servesFloors: ['G', '4', 'G'] }]);
    expect(twice.issues.map((issue) => issue.code)).toEqual([ISSUE_CODES.duplicateId]);
  });

  it('refuses an empty range at the schema, since a bank serving nothing is a car out of service by another name', async () => {
    const config = await load();
    expect(() => resolve(config, [{ ...CLOSE, servesFloors: [] }])).toThrow(ConfigError);
  });

  it('refuses a derate above the plate, and says both figures', async () => {
    const config = await load();
    const error = expectError(config, [{ ...DERATE, ratedLoadLb: 2101 }]);
    expect(error.issues.map((issue) => issue.code)).toEqual([ISSUE_CODES.serviceLoadAboveRating]);
    expect(error.issues[0]?.path).toBe('serviceEvents[0].ratedLoadLb');
    expect(error.message).toContain('2101 lb, above its plated 2100 lb');
  });

  it('refuses to move a double-deck bank’s range, because its deck coupling was derived from it', async () => {
    const config = await load();
    const raw = JSON.parse(await readFile(join(DATA_DIR, 'buildings', 'vertical-city.json'), 'utf8')) as {
      banks: readonly { id: string; servesFloors: readonly string[] }[];
    };
    const shuttle = raw.banks.find((bank) => bank.id.includes('shuttle')) ?? raw.banks[0];
    if (shuttle === undefined) throw new Error('vertical-city declares no banks');
    const authored = { ...raw, serviceEvents: [{ atS: 10, bankId: shuttle.id, servesFloors: [shuttle.servesFloors[0]] }] };
    let caught: unknown;
    try {
      resolveBuilding(parseBuilding(authored, 'vertical-city.json'), config.elevatorSpecs, {
        file: 'vertical-city.json',
        trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    expect((caught as ConfigError).issues.map((issue) => issue.code)).toContain(
      ISSUE_CODES.unsupportedServiceRange,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * 2. The model — the range and the rating move, and reset puts both back
 * -------------------------------------------------------------------------- */

describe('the model carries a moved range and a derated rating, and reset restores both', () => {
  it('Building.setBankServesFloors rebuilds banksServing, and reset returns to the as-built range', async () => {
    const config = await load();
    const building = createBuilding(resolve(config));
    expect(building.banksServing('5').map((bank) => bank.id)).toEqual(['express']);
    building.setBankServesFloors('express', ['G', '4']);
    expect(building.banksServing('5')).toEqual([]);
    expect(building.banksServing('4').map((bank) => bank.id)).toEqual(['local', 'express']);
    expect(building.bankById('express')?.servesFloors).toEqual(['G', '4']);
    expect(building.bankById('express')?.declaredFloors).toEqual(['G', '4', '5', '6']);
    expect(building.bankById('express')?.rangeMoved).toBe(true);
    building.reset();
    expect(building.banksServing('5').map((bank) => bank.id)).toEqual(['express']);
    expect(building.bankById('express')?.rangeMoved).toBe(false);
  });

  it('refuses an empty range, and refuses a double-deck bank — the guard is on the cars, not the pairs', async () => {
    const config = await load();
    const paired = new Bank({
      id: 'dd',
      servesFloors: ['G', '2', '3'],
      servesFloorPairs: [['G', '2']],
      cars: [],
      carSpecs: [],
    });
    // No car is double-deck, so the bank is not: a pairing without a double-deck car is inert
    // config (`parse.ts` warns `unused-floor-pairs`), and the guard reads the cars.
    expect(paired.isDoubleDeck).toBe(false);
    expect(() => paired.setServesFloors([])).toThrow(/serve no floors/);

    /*
     * And the double-deck refusal itself, which the title above used to claim and this file did not
     * assert — GitHub issue #477. The throw is the last of four refusals now (config, scheduling,
     * the press, and this), so it is the one a shipped path should never reach; it is kept, and
     * kept asserted, because a guard nobody checks is a guard that can be softened to a no-op by
     * accident. `bank.test.ts` owns the flag; what is asserted here is that `setServesFloors`
     * refuses on it and says why.
     */
    const shuttleConfig = config.buildingsById
      .get('vertical-city')
      ?.banks.find((bank) => bank.id === 'shuttle');
    if (shuttleConfig === undefined) throw new Error('vertical-city declares no shuttle bank');
    const shuttle = Bank.fromConfig(shuttleConfig);
    expect(shuttle.isDoubleDeck).toBe(true);
    // A whole pair dropped — the one new range that disturbs no coupling — is refused with the
    // rest, which is the decision `config/serviceEvent.ts#bankRangeIsFixed` argues.
    expect(() => shuttle.setServesFloors(['G', '2', '26', '27', '51', '52'])).toThrow(/double-deck/);
    expect(shuttle.servesFloors).toEqual(shuttle.declaredFloors);
  });

  it('LoadSensor.derate moves the design load, the bypass and the alarm, and reset restores the plate', () => {
    const sensor = new LoadSensor({
      ratedLoadKg: 1000,
      capacityPersons: 13,
      bypassLoadThreshold: 0.8,
      overloadThreshold: 1.1,
      designLoadFactor: 0.8,
      nominalPassengerMassKg: 75,
    });
    sensor.add({ id: 'p1', massKg: 500 });
    expect(sensor.isBypassingHallCalls).toBe(false);
    sensor.derate(600);
    expect(sensor.ratedLoadKg).toBe(600);
    expect(sensor.isDerated).toBe(true);
    expect(sensor.designLoadKg).toBe(480);
    expect(sensor.remainingToDesignLoadKg).toBe(0);
    expect(sensor.isBypassingHallCalls).toBe(true);
    expect(sensor.isOverloaded).toBe(false);
    sensor.derate(400);
    expect(sensor.isOverloaded).toBe(true);
    expect(sensor.snapshot().ratedLoadKg).toBe(400);
    expect(() => sensor.derate(0)).toThrow(/positive rated load/);
    sensor.reset();
    expect(sensor.ratedLoadKg).toBe(1000);
    expect(sensor.isDerated).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * 3. The run — a derate fills a car to fewer people
 * -------------------------------------------------------------------------- */

describe('a derate changes the run, compared on the legs', () => {
  it('car E1 carries less at its peak after the derate than it did without one, and the run differs', async () => {
    const config = await load();
    const control = run(config, resolve(config));
    const derated = run(config, resolve(config, [DERATE]));
    expect(fingerprint(derated)).not.toBe(fingerprint(control));

    const carId = 'express-E1';
    const peakControl = peakMassAboardKg(control.record.passengers, carId, 0);
    const peakDerated = peakMassAboardKg(derated.record.passengers, carId, DERATE.atS);
    expect(peakControl).toBeGreaterThan(0);
    expect(peakDerated).toBeGreaterThan(0);
    expect(peakDerated).toBeLessThan(peakControl);
    // The boarding gate admits while the cell reads under the design load, so the peak can
    // overshoot it by at most one rider; the residential mass draw tops out well under 150 kg.
    const deratedDesignKg = Math.round(700 * 0.45359237) * 0.8;
    expect(peakDerated).toBeLessThanOrEqual(deratedDesignKg + 150);
    // The other car of the bank is untouched by a derate that names E1.
    expect(peakMassAboardKg(derated.record.passengers, 'express-E2', 0)).toBeGreaterThan(deratedDesignKg + 150);
    expect(derated.conservation.balanced).toBe(true);
    expect(derated.conservation.stranded).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * 4. The run — a range narrows, the leg is finished, the rest are stranded
 * -------------------------------------------------------------------------- */

describe('a range change strands the riders it leaves without a bank, and finishes the legs in flight', () => {
  async function closed(): Promise<{ control: SimulationResult; result: SimulationResult }> {
    const config = await load();
    return { control: run(config, resolve(config)), result: run(config, resolve(config, [CLOSE, REOPEN])) };
  }

  it('publishes the stranded count beside the mean, balanced, and only from the instant the lobby closed', async () => {
    const { control, result } = await closed();
    expect(control.conservation.stranded).toBeUndefined();
    expect(control.stageActivity.strandedLegs).toBeUndefined();
    expect(control.record.passengers.every((leg) => leg.strandedAt === undefined)).toBe(true);

    const stranded = result.record.passengers.filter((leg) => leg.strandedAt !== undefined);
    expect(stranded.length).toBeGreaterThan(0);
    expect(result.conservation.stranded).toBe(stranded.length);
    expect(result.stageActivity.strandedLegs).toBe(stranded.length);
    expect(result.conservation.balanced).toBe(true);
    expect(result.status).toBe('completed');
    for (const leg of stranded) {
      // Up to 5 or 6 from the lobby, or down from 5 or 6 to it: both ends of the closed range.
      expect(EXPRESS_ONLY.has(leg.destinationFloorId) || EXPRESS_ONLY.has(leg.originFloorId)).toBe(true);
      expect(leg.boardedAt).toBeUndefined();
      expect(leg.strandedAt).toBeGreaterThanOrEqual(CLOSES_AT_S);
      expect(leg.strandedAt).toBeLessThan(REOPENS_AT_S);
      expect(leg.strandedAt).toBeGreaterThanOrEqual(leg.arrivedAt);
      expect(leg.assignedCarId).toBeUndefined();
    }
    // Never served, so in the unserved count over the whole record (the summary's own window
    // trims the warm-up and the drain, so it is taken over fewer legs) — and never censored, so
    // not in the horizon test.
    expect(summarizeWaiting(result.record.passengers).unservedCount).toBeGreaterThanOrEqual(stranded.length);
    expect(result.summary.serviceLevel.verdict).not.toBe('starved');
    expect(result.warnings.some((line) => line.includes('stranded by a scheduled range change'))).toBe(true);
    // Somebody already standing there when the lobby closed was stranded after a real wait.
    expect(stranded.some((leg) => leg.strandedAt !== undefined && leg.strandedAt > leg.arrivedAt)).toBe(true);
  });

  it('a car carrying somebody to 5 or 6 when the range narrows still lets them off there', async () => {
    const { result } = await closed();
    const inFlight = result.record.passengers.filter(
      (leg) =>
        EXPRESS_ONLY.has(leg.destinationFloorId) &&
        leg.boardedAt !== undefined &&
        leg.boardedAt < CLOSES_AT_S &&
        (leg.alightedAt === undefined || leg.alightedAt >= CLOSES_AT_S),
    );
    expect(inFlight.length).toBeGreaterThan(0);
    for (const leg of inFlight) {
      expect(leg.alightedAt).toBeDefined();
      expect(leg.strandedAt).toBeUndefined();
    }
  });

  it('boards nobody for 5 or 6 while the lobby is closed, and boards them again once it reopens', async () => {
    const { result } = await closed();
    const boardedTo = (floors: ReadonlySet<string>, fromS: number, toS: number): number =>
      result.record.passengers.filter(
        (leg) =>
          floors.has(leg.destinationFloorId) &&
          leg.boardedAt !== undefined &&
          leg.boardedAt >= fromS &&
          leg.boardedAt < toS,
      ).length;
    expect(boardedTo(EXPRESS_ONLY, CLOSES_AT_S, REOPENS_AT_S)).toBe(0);
    expect(boardedTo(EXPRESS_ONLY, REOPENS_AT_S, Number.POSITIVE_INFINITY)).toBeGreaterThan(0);
    // The local bank's floors were never closed: riders to 2 and 3 keep boarding throughout.
    expect(boardedTo(new Set(['2', '3']), CLOSES_AT_S, REOPENS_AT_S)).toBeGreaterThan(0);
  });

  it('is deterministic and replays: two runs agree to the byte, and the record round-trips with strandedAt', async () => {
    const config = await load();
    const first = run(config, resolve(config, [CLOSE, REOPEN]));
    const second = run(config, resolve(config, [CLOSE, REOPEN]));
    expect(fingerprint(second)).toBe(fingerprint(first));
    const parsed = parseRunRecord(JSON.stringify(first.record));
    expect(parsed.passengers.filter((leg) => leg.strandedAt !== undefined).length).toBe(
      first.conservation.stranded,
    );
  });

  it('a widening alone strands nobody and changes nothing the trace did not already allow', async () => {
    const config = await load();
    const control = run(config, resolve(config));
    // Re-stating the as-built range at 300 s is a range event that moves nothing.
    const restated = run(config, resolve(config, [{ ...CLOSE, servesFloors: ['G', '4', '5', '6'] }]));
    expect(restated.conservation.stranded).toBeUndefined();
    expect(restated.record.passengers).toEqual(control.record.passengers);
  });
});
