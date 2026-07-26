import { describe, expect, it } from 'vitest';

import { StreamSet } from '../random/streams.js';

import { MetricsRecorder, type RecordablePassenger } from './recorder.js';
import { parseRunRecord, serializeRunRecord } from './serialization.js';
import { summarizeRun } from './summarize.js';
import { METRICS_SCHEMA_VERSION, MetricsError, runSeed, type RunRecord } from './types.js';

const SEED = 20260726;

function passenger(id: string, arrivedAt: number): RecordablePassenger {
  return {
    id,
    journeyId: `j-${id}`,
    legIndex: 0,
    isFinalLeg: true,
    originFloorId: 'G',
    destinationFloorId: '10',
    finalDestinationFloorId: '10',
    direction: 'up',
    massKg: 78.25,
    arrivedAt,
    journeyStartedAt: arrivedAt,
    credentialGroup: 'tenant-alpha-staff',
  };
}

/** A record with at least one of everything, so the round trip exercises every field. */
function populatedRecord(streams: StreamSet): RunRecord {
  const recorder = new MetricsRecorder({
    seed: streams,
    runId: 'midtown-uppeak-07',
    buildingId: 'midtown-office',
    dispatcherProfileId: 'nearest-car',
    trafficProfileId: 'office-standard',
    demandTemplateId: 'rise-and-fall',
    replication: 7,
    population: 1200,
    carIds: ['car-0', 'car-1', 'car-2'],
    reportWindow: { id: 'peak-5min', startS: 600, endS: 900 },
    metadata: { sweep: 'speed-3.5', crn: true, round: 2 },
  });

  for (let i = 0; i < 5; i += 1) {
    const id = `p${i}`;
    recorder.recordArrival(passenger(id, 600 + i * 10));
    if (i < 4) {
      recorder.recordBoarding(id, 620 + i * 10, { carId: `car-${i % 2}`, bankId: 'main' });
      recorder.recordAlighting(id, 680 + i * 10);
    }
  }
  recorder.sampleLoad(600, 'car-0', { loadFactor: 0.35, occupants: 4, massKg: 300 });
  recorder.sampleLoad(660, 'car-0', { loadFactor: 0.8, occupants: 9, massKg: 690 });
  recorder.sampleQueue(600, 3, { G: 3 });
  recorder.sampleQueue(660, 1);

  return recorder.finish(1800);
}

describe('RunRecord round-trips through JSON with its seed intact', () => {
  const streams = new StreamSet(SEED);
  const record = populatedRecord(streams);

  it('survives serialize -> parse unchanged', () => {
    const restored = parseRunRecord(serializeRunRecord(record));
    expect(restored).toEqual(record);
  });

  it('keeps the seed, as a decimal string, on the record itself', () => {
    expect(record.seed).toBe('20260726');
    const restored = parseRunRecord(serializeRunRecord(record));
    expect(restored.seed).toBe(record.seed);
    expect(runSeed(restored)).toBe(streams.masterSeed);
  });

  it('replays exactly from the restored seed (CLAUDE.md invariant 5)', () => {
    const restored = parseRunRecord(serializeRunRecord(record));
    const replayed = new StreamSet(runSeed(restored));
    const original = new StreamSet(SEED);

    const draw = (set: StreamSet): number[] => [
      ...Array.from({ length: 50 }, () => set.arrivals.nextUint32()),
      ...Array.from({ length: 50 }, () => set.passengerMass.normal(75, 15)),
      ...Array.from({ length: 50 }, () => set.destinations.nextInt(0, 40)),
    ];
    expect(draw(replayed)).toEqual(draw(original));
  });

  it('preserves a full 64-bit seed that a JSON number would have truncated', () => {
    const big = new StreamSet(0xffff_ffff_ffff_ffffn);
    const bigRecord = new MetricsRecorder({ seed: big, runId: 'big-seed' }).finish(10);
    const restored = parseRunRecord(serializeRunRecord(bigRecord));

    expect(restored.seed).toBe('18446744073709551615');
    expect(runSeed(restored)).toBe(big.masterSeed);
    // The same value carried as a JSON number would not have survived the trip.
    expect(BigInt(Number(restored.seed))).not.toBe(runSeed(restored));
  });

  it('re-analyses without re-simulating: the restored record summarizes identically', () => {
    const restored = parseRunRecord(serializeRunRecord(record));
    expect(summarizeRun(restored)).toEqual(summarizeRun(record));
    expect(summarizeRun(restored, { window: 'full-run' })).toEqual(
      summarizeRun(record, { window: 'full-run' }),
    );
  });

  it('keeps every sample and every leg', () => {
    const restored = parseRunRecord(serializeRunRecord(record));
    expect(restored.passengers).toHaveLength(5);
    expect(restored.loadSamples).toHaveLength(2);
    expect(restored.queueSamples).toHaveLength(2);
    expect(restored.queueSamples[0]?.byFloorId).toEqual({ G: 3 });
    expect(restored.reportWindow).toEqual({ id: 'peak-5min', startS: 600, endS: 900 });
    expect(restored.metadata).toEqual({ sweep: 'speed-3.5', crn: true, round: 2 });
  });

  it('keeps the fleet roster, including the car that never carried anybody', () => {
    // `car-2` produced no load sample and no boarding, because it never carried a passenger.
    // If the roster did not survive the round trip, the re-analysed load-factor distribution
    // would silently omit its idle car-seconds and read high — see LoadFactorStatistics.
    const restored = parseRunRecord(serializeRunRecord(record));
    expect(restored.carIds).toEqual(['car-0', 'car-1', 'car-2']);
    expect(record.loadSamples.some((sample) => sample.carId === 'car-2')).toBe(false);
    expect(summarizeRun(restored).loadFactor.carCount).toBe(3);
    expect(summarizeRun(restored).loadFactor.sampledCarCount).toBe(1);
  });

  it('leaves the unserved leg unserved rather than filling in a boarding time', () => {
    const restored = parseRunRecord(serializeRunRecord(record));
    expect(restored.passengers[4]?.boardedAt).toBeUndefined();
    expect(Object.keys(restored.passengers[4]!)).not.toContain('boardedAt');
  });

  it('accepts an already-parsed object as well as text', () => {
    const asObject: unknown = JSON.parse(serializeRunRecord(record));
    expect(parseRunRecord(asObject)).toEqual(record);
  });

  it('writes compact JSON by default and pretty JSON on request', () => {
    expect(serializeRunRecord(record)).not.toContain('\n');
    expect(serializeRunRecord(record, { space: 2 })).toContain('\n');
  });
});

describe('parseRunRecord rejects what it cannot trust', () => {
  const streams = new StreamSet(SEED);
  const valid = JSON.parse(serializeRunRecord(populatedRecord(streams))) as Record<string, unknown>;

  const withoutKey = (key: string): Record<string, unknown> => {
    const copy = { ...valid };
    delete copy[key];
    return copy;
  };

  it('refuses a record with no seed — it could never be replayed', () => {
    expect(() => parseRunRecord(withoutKey('seed'))).toThrow(MetricsError);
    expect(() => parseRunRecord({ ...valid, seed: '' })).toThrow(/seed/);
    expect(() => parseRunRecord({ ...valid, seed: 'not-a-number' })).toThrow(/seed/);
    expect(() => parseRunRecord({ ...valid, seed: 20260726 })).toThrow(MetricsError);
  });

  it('refuses a schema version it does not know', () => {
    expect(() => parseRunRecord({ ...valid, schemaVersion: METRICS_SCHEMA_VERSION + 1 })).toThrow(
      /schemaVersion/,
    );
    expect(() => parseRunRecord(withoutKey('schemaVersion'))).toThrow(/schemaVersion/);
  });

  it('refuses an unrecognized key rather than silently dropping it', () => {
    expect(() => parseRunRecord({ ...valid, waitingTimeAverage: 12 })).toThrow(MetricsError);
  });

  it('refuses malformed JSON and non-objects', () => {
    expect(() => parseRunRecord('{not json')).toThrow(/not valid JSON/);
    expect(() => parseRunRecord([1, 2, 3])).toThrow(/must be a JSON object/);
    expect(() => parseRunRecord(null)).toThrow(/must be a JSON object/);
  });

  it('refuses a leg with a missing required field', () => {
    const broken = {
      ...valid,
      passengers: [{ ...(valid['passengers'] as unknown[])[0] as object, journeyId: undefined }],
    };
    expect(() => parseRunRecord(broken)).toThrow(MetricsError);
  });

  it('names the offending path in the error', () => {
    const broken = { ...valid, startedAt: 'soon' };
    expect(() => parseRunRecord(broken)).toThrow(/startedAt/);
  });
});

describe('runSeed', () => {
  it('rejects a seed that is not a decimal integer', () => {
    expect(() => runSeed({ runId: 'r', seed: '' })).toThrow(MetricsError);
    expect(() => runSeed({ runId: 'r', seed: '0x2a' })).toThrow(/invariant 5/);
  });

  it('round-trips through StreamSet', () => {
    const record = new MetricsRecorder({ seed: new StreamSet(12345) }).finish(1);
    expect(new StreamSet(runSeed(record)).masterSeed).toBe(12345n);
  });
});
