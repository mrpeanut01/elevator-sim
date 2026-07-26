import { describe, expect, it } from 'vitest';

import { StreamSet } from '../random/streams.js';
import { PassengerFactory } from '../model/passenger.js';
import type { FloorTopology } from '../model/types.js';
import type { PassengerMassConfig } from '../config/types.js';

import { MetricsRecorder, type RecordablePassenger } from './recorder.js';
import { METRICS_SCHEMA_VERSION, MetricsError, waitSecondsOf } from './types.js';

const SEED = 20260726;

/** A minimal two-floor topology so `PassengerFactory` can be used against real `Passenger`s. */
const topology: FloorTopology = {
  floorIndexOf: (floorId) => ({ G: 0, '10': 10, '31': 31, '45': 45 })[floorId],
  isTransferFloor: (floorId) => floorId === '31',
};

const massConfig: PassengerMassConfig = {
  distribution: 'normal',
  meanKg: 75,
  stdDevKg: 15,
  minKg: 35,
};

function leg(overrides: Partial<RecordablePassenger> = {}): RecordablePassenger {
  return {
    id: 'p1',
    journeyId: 'j1',
    legIndex: 0,
    isFinalLeg: true,
    originFloorId: 'G',
    destinationFloorId: '10',
    finalDestinationFloorId: '10',
    direction: 'up',
    massKg: 75,
    arrivedAt: 0,
    journeyStartedAt: 0,
    ...overrides,
  };
}

describe('MetricsRecorder — the seed (CLAUDE.md invariant 5)', () => {
  it('takes the seed from the run StreamSet, so the record cannot disagree with the generator', () => {
    const streams = new StreamSet(SEED);
    const recorder = new MetricsRecorder({ seed: streams, runId: 'r1' });

    expect(recorder.seed).toBe('20260726');
    expect(recorder.finish(100).seed).toBe(streams.masterSeed.toString());
  });

  it('accepts a bigint, a safe integer or a decimal string', () => {
    expect(new MetricsRecorder({ seed: 42n }).seed).toBe('42');
    expect(new MetricsRecorder({ seed: 42 }).seed).toBe('42');
    expect(new MetricsRecorder({ seed: '42' }).seed).toBe('42');
  });

  it('preserves a 64-bit seed exactly, which a number could not', () => {
    const streams = new StreamSet(0xffff_ffff_ffff_ffffn);
    const recorder = new MetricsRecorder({ seed: streams });
    expect(recorder.seed).toBe('18446744073709551615');
    expect(BigInt(recorder.seed)).toBe(streams.masterSeed);
  });

  it('rejects a seed it cannot store as a decimal integer', () => {
    expect(() => new MetricsRecorder({ seed: -1 })).toThrow(MetricsError);
    expect(() => new MetricsRecorder({ seed: 1.5 })).toThrow(MetricsError);
    expect(() => new MetricsRecorder({ seed: 'undefined' })).toThrow(MetricsError);
    expect(() => new MetricsRecorder({ seed: -5n })).toThrow(MetricsError);
  });
});

describe('MetricsRecorder — passenger lifecycle', () => {
  it('records arrival, boarding and alighting as raw timestamps', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.recordArrival(leg({ arrivedAt: 10 }));
    recorder.recordBoarding('p1', 35, { carId: 'car-1', bankId: 'main' });
    recorder.recordAlighting('p1', 95);

    const record = recorder.finish(200);
    expect(record.passengers).toHaveLength(1);
    const [entry] = record.passengers;
    expect(entry).toMatchObject({
      passengerId: 'p1',
      journeyId: 'j1',
      arrivedAt: 10,
      boardedAt: 35,
      alightedAt: 95,
      carId: 'car-1',
      bankId: 'main',
    });
    expect(waitSecondsOf(entry!)).toBe(25);
  });

  it('accepts the passenger object as well as its id', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    const passenger = leg({ arrivedAt: 5 });
    recorder.recordArrival(passenger);
    recorder.recordBoarding(passenger, 20);
    recorder.recordAlighting(passenger, 40);
    expect(recorder.finish(50).passengers[0]?.boardedAt).toBe(20);
  });

  it('keeps a leg that never boarded, because an unserved backlog is the saturation signal', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.recordArrival(leg({ id: 'p1', arrivedAt: 0 }));
    recorder.recordArrival(leg({ id: 'p2', journeyId: 'j2', arrivedAt: 5 }));
    recorder.recordBoarding('p1', 10);

    const record = recorder.finish(100);
    expect(record.passengers).toHaveLength(2);
    expect(record.passengers[1]?.boardedAt).toBeUndefined();
    expect(waitSecondsOf(record.passengers[1]!)).toBeUndefined();
  });

  it('emits legs in arrival order, deterministically', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    for (const id of ['p3', 'p1', 'p2']) {
      recorder.recordArrival(leg({ id, journeyId: `j-${id}` }));
    }
    expect(recorder.finish(10).passengers.map((entry) => entry.passengerId)).toEqual([
      'p3',
      'p1',
      'p2',
    ]);
  });
});

describe('MetricsRecorder — refuses impossible sequences', () => {
  it('rejects a duplicate arrival for the same leg', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.recordArrival(leg());
    expect(() => recorder.recordArrival(leg())).toThrow(/already been recorded/);
  });

  it('rejects boarding a leg that never arrived', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    expect(() => recorder.recordBoarding('ghost', 10)).toThrow(/never recorded as arriving/);
  });

  it('rejects boarding twice', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.recordArrival(leg());
    recorder.recordBoarding('p1', 10);
    expect(() => recorder.recordBoarding('p1', 20)).toThrow(/cannot board again/);
  });

  it('rejects a boarding before the arrival, which would be a negative waiting time', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.recordArrival(leg({ arrivedAt: 50 }));
    expect(() => recorder.recordBoarding('p1', 49)).toThrow(MetricsError);
  });

  it('rejects alighting without boarding, and alighting twice', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.recordArrival(leg());
    expect(() => recorder.recordAlighting('p1', 10)).toThrow(/never boarded/);
    recorder.recordBoarding('p1', 10);
    recorder.recordAlighting('p1', 20);
    expect(() => recorder.recordAlighting('p1', 30)).toThrow(/cannot alight again/);
  });

  it('rejects an alighting before the boarding', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.recordArrival(leg());
    recorder.recordBoarding('p1', 30);
    expect(() => recorder.recordAlighting('p1', 29)).toThrow(MetricsError);
  });

  it('rejects a journey that claims to have begun after this leg arrived', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    expect(() =>
      recorder.recordArrival(leg({ arrivedAt: 10, journeyStartedAt: 20 })),
    ).toThrow(MetricsError);
  });
});

describe('MetricsRecorder — samples', () => {
  it('stores load samples verbatim, accepting a CarLoadSnapshot-shaped reading', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.sampleLoad(12, 'car-1', { loadFactor: 0.42, occupants: 5, massKg: 380 });
    const [sample] = recorder.finish(100).loadSamples;
    expect(sample).toEqual({ at: 12, carId: 'car-1', loadFactor: 0.42, occupants: 5, massKg: 380 });
  });

  it('stores queue samples with an optional per-floor breakdown', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.sampleQueue(30, 7, { G: 5, '10': 2 });
    const [sample] = recorder.finish(100).queueSamples;
    expect(sample?.waiting).toBe(7);
    expect(sample?.byFloorId).toEqual({ G: 5, '10': 2 });
  });

  it('rejects a negative or non-finite queue length', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    expect(() => recorder.sampleQueue(1, -1)).toThrow(MetricsError);
    expect(() => recorder.sampleQueue(Number.NaN, 1)).toThrow(MetricsError);
  });

  it('carries the fleet roster, which is the only trace an idle car leaves', () => {
    // sampleLoad fires on load *changes*, so a car that carries nobody is never sampled and
    // cannot be inferred from the record. Recording the roster is what lets the load-factor
    // distribution weight its idle car-seconds instead of pretending it does not exist.
    const recorder = new MetricsRecorder({ seed: SEED, carIds: ['car-1', 'car-2', 'car-3'] });
    recorder.sampleLoad(12, 'car-1', { loadFactor: 0.42, occupants: 5, massKg: 380 });
    const record = recorder.finish(100);

    expect(record.carIds).toEqual(['car-1', 'car-2', 'car-3']);
    expect(record.loadSamples.map((sample) => sample.carId)).toEqual(['car-1']);
    expect(new MetricsRecorder({ seed: SEED }).finish(10).carIds).toBeUndefined();
  });

  it('copies the roster it was given, so a later mutation cannot rewrite the record', () => {
    const roster = ['car-1'];
    const recorder = new MetricsRecorder({ seed: SEED, carIds: roster });
    roster.push('car-2');
    expect(recorder.finish(10).carIds).toEqual(['car-1']);
  });
});

describe('MetricsRecorder — finishing', () => {
  it('stamps the schema version and the run identity', () => {
    const record = new MetricsRecorder({
      seed: SEED,
      runId: 'midtown-uppeak-07',
      buildingId: 'midtown-office',
      dispatcherProfileId: 'nearest-car',
      trafficProfileId: 'office-standard',
      demandTemplateId: 'rise-and-fall',
      replication: 7,
      population: 1200,
      metadata: { sweep: 'speed-3.5', crn: true },
    }).finish(1800);

    expect(record.schemaVersion).toBe(METRICS_SCHEMA_VERSION);
    expect(record).toMatchObject({
      runId: 'midtown-uppeak-07',
      buildingId: 'midtown-office',
      dispatcherProfileId: 'nearest-car',
      replication: 7,
      population: 1200,
      startedAt: 0,
      endedAt: 1800,
      metadata: { sweep: 'speed-3.5', crn: true },
    });
  });

  it('omits absent optional fields rather than writing undefined into them', () => {
    const record = new MetricsRecorder({ seed: SEED }).finish(10);
    expect(Object.keys(record)).not.toContain('buildingId');
    expect(Object.keys(record)).not.toContain('metadata');
  });

  it('refuses to end before an event it recorded', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.recordArrival(leg({ arrivedAt: 500 }));
    expect(() => recorder.finish(499)).toThrow(/recorded an event/);
  });

  it('refuses to end before it started', () => {
    const recorder = new MetricsRecorder({ seed: SEED, startedAt: 100 });
    expect(() => recorder.finish(50)).toThrow(MetricsError);
  });

  it('refuses to record after finishing, because a summary may already exist', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.finish(100);
    expect(recorder.isFinished).toBe(true);
    expect(() => recorder.recordArrival(leg())).toThrow(/came too late/);
    expect(() => recorder.sampleQueue(10, 1)).toThrow(/came too late/);
  });

  it('emits an equal record when finished twice', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.recordArrival(leg());
    expect(recorder.finish(100)).toEqual(recorder.finish(100));
  });

  it('tracks counts as the run proceeds', () => {
    const recorder = new MetricsRecorder({ seed: SEED });
    recorder.recordArrival(leg({ id: 'p1' }));
    recorder.recordArrival(leg({ id: 'p2', journeyId: 'j2' }));
    recorder.recordBoarding('p1', 10);
    recorder.recordAlighting('p1', 40);

    expect(recorder.arrivalCount).toBe(2);
    expect(recorder.boardedCount).toBe(1);
    expect(recorder.alightedCount).toBe(1);
    expect(recorder.lastEventAt).toBe(40);
  });
});

describe('MetricsRecorder — accepts the real Passenger', () => {
  it('records a Passenger from PassengerFactory without a cast', () => {
    const streams = new StreamSet(SEED);
    const factory = new PassengerFactory({ streams, massConfig, topology });
    const recorder = new MetricsRecorder({ seed: streams });

    const first = factory.arrive({
      originFloorId: 'G',
      destinationFloorId: '31',
      finalDestinationFloorId: '45',
      arrivedAt: 0,
    });
    recorder.recordArrival(first);
    recorder.recordBoarding(first, 20);
    recorder.recordAlighting(first, 60);
    first.board(20);
    first.alight(60);

    const second = factory.transfer(first, { destinationFloorId: '45', arrivedAt: 70 });
    recorder.recordArrival(second);
    recorder.recordBoarding(second, 100);
    recorder.recordAlighting(second, 140);

    const record = recorder.finish(300);
    expect(record.passengers.map((entry) => entry.journeyId)).toEqual(['j1', 'j1']);
    expect(record.passengers.map((entry) => entry.legIndex)).toEqual([0, 1]);
    expect(record.passengers[1]?.journeyStartedAt).toBe(0);
    // Mass came from the passengerMass stream, so it is a real distribution, not a constant.
    expect(record.passengers[0]?.massKg).toBeGreaterThan(0);
    expect(record.passengers[0]?.massKg).toBe(record.passengers[1]?.massKg);
  });
});
