import { describe, expect, it } from 'vitest';

import { StreamSet } from '../random/streams.js';

import { MetricsRecorder, type RecordablePassenger } from './recorder.js';
import { parseRunRecord } from './serialization.js';
import { departureGapBracket, summarizeRun } from './summarize.js';
import {
  METRICS_SCHEMA_VERSION,
  MetricsError,
  type CarTimings,
  type RunRecord,
} from './types.js';

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
    carTimings: {
      doorOpenS: 1.8,
      doorCloseS: 3.0,
      dwellHallCallS: 5.0,
      dwellCarCallS: 3.0,
      fullLoadTransferS: 14.4,
      nearestFloorFlightS: 4.9,
      motorStartDelayS: 0.5,
      levelingSettleS: 0.4,
    },
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
    const restored = parseRunRecord(JSON.stringify(record));
    expect(restored).toEqual(record);
  });

  it('keeps the seed, as a decimal string, on the record itself', () => {
    expect(record.seed).toBe('20260726');
    const restored = parseRunRecord(JSON.stringify(record));
    expect(restored.seed).toBe(record.seed);
    expect(BigInt(restored.seed)).toBe(streams.masterSeed);
  });

  // Not "replays exactly", which is what this test was called until § D395 and is not what it
  // does: it redraws the *streams*, which is invariant 5's first clause and the only one a bare
  // record can carry. Replaying the run needs the configuration beside it — see
  // `experiments/reports/replay.test.ts`.
  it('redraws every stream identically from the restored seed (invariant 5, first clause)', () => {
    const restored = parseRunRecord(JSON.stringify(record));
    const replayed = new StreamSet(BigInt(restored.seed));
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
    const restored = parseRunRecord(JSON.stringify(bigRecord));

    expect(restored.seed).toBe('18446744073709551615');
    expect(BigInt(restored.seed)).toBe(big.masterSeed);
    // The same value carried as a JSON number would not have survived the trip.
    expect(BigInt(Number(restored.seed))).not.toBe(BigInt(restored.seed));
  });

  it('re-analyses without re-simulating: the restored record summarizes identically', () => {
    const restored = parseRunRecord(JSON.stringify(record));
    expect(summarizeRun(restored)).toEqual(summarizeRun(record));
    expect(summarizeRun(restored, { window: 'full-run' })).toEqual(
      summarizeRun(record, { window: 'full-run' }),
    );
  });

  it('carries the car timings the achieved interval derives its threshold from', () => {
    // Without these on the record, a re-analysis of a stored run falls back to a constant and the
    // achieved interval can read short by 15 % — see `interval.test.ts`. So they have to survive
    // the trip to disk, and the restored record has to derive the same threshold.
    const restored = parseRunRecord(JSON.stringify(record));
    expect(restored.carTimings).toEqual(record.carTimings);

    const interval = summarizeRun(restored).achievedInterval;
    expect(interval.departureGapBasis).toBe('derived');
    expect(interval.departureGapS).toBe(
      departureGapBracket(record.carTimings as CarTimings).gapS,
    );

    // And a record written without them still parses and still summarizes — saying so.
    const { carTimings: _dropped, ...withoutTimings } = record;
    const bare = parseRunRecord(JSON.stringify(withoutTimings as RunRecord));
    expect(summarizeRun(bare).achievedInterval.departureGapBasis).toBe('fallback');
  });

  it('keeps every sample and every leg', () => {
    const restored = parseRunRecord(JSON.stringify(record));
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
    const restored = parseRunRecord(JSON.stringify(record));
    expect(restored.carIds).toEqual(['car-0', 'car-1', 'car-2']);
    expect(record.loadSamples.some((sample) => sample.carId === 'car-2')).toBe(false);
    expect(summarizeRun(restored).loadFactor.carCount).toBe(3);
    expect(summarizeRun(restored).loadFactor.sampledCarCount).toBe(1);
  });

  it('leaves the unserved leg unserved rather than filling in a boarding time', () => {
    const restored = parseRunRecord(JSON.stringify(record));
    expect(restored.passengers[4]?.boardedAt).toBeUndefined();
    expect(Object.keys(restored.passengers[4]!)).not.toContain('boardedAt');
  });

  it('accepts an already-parsed object as well as text', () => {
    const asObject: unknown = JSON.parse(JSON.stringify(record));
    expect(parseRunRecord(asObject)).toEqual(record);
  });

  it('writes as one line, which is what makes a result set newline-delimited', () => {
    // `experiments/reports/persistence.ts` appends one record per line and says JSON escapes
    // every control character inside strings, so no field can introduce a newline. That is a
    // claim about *this* record's contents, so it is checked here on a populated one rather
    // than only over there on a fixture.
    expect(JSON.stringify(record)).not.toContain('\n');
  });
});

describe('parseRunRecord rejects what it cannot trust', () => {
  const streams = new StreamSet(SEED);
  const valid = JSON.parse(JSON.stringify(populatedRecord(streams))) as Record<string, unknown>;

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

/*
 * `runSeed()` was deleted in `DECISIONS.md` § D395 — a fourth guard on a value `parseRunRecord`,
 * `reports/schema.ts` and `parseStoredRun` already guard, with no caller outside its own tests.
 * These two assertions are the ones its tests were really making, moved onto the guard that
 * survives it. Deleting the block outright would have been the mutation that validates nothing:
 * it removes the case from scope instead of showing the case still holds.
 */
describe('a parsed record hands BigInt() a seed it can take', () => {
  it('refuses the seeds BigInt would have accepted as something else', () => {
    const streams = new StreamSet(SEED);
    const valid = JSON.parse(JSON.stringify(populatedRecord(streams))) as Record<string, unknown>;
    // None of these three throws in `BigInt`, and that is the whole point: a bad seed that threw
    // would announce itself. `BigInt('')` is `0n`, so an empty seed replays run zero in silence;
    // `BigInt('0x2a')` is `42n`, so a hex seed replays a different run; `BigInt('-1')` is `-1n`,
    // which is not a `StreamSet` seed at all. The parser is where they are stopped.
    expect(() => parseRunRecord({ ...valid, seed: '' })).toThrow(MetricsError);
    expect(() => parseRunRecord({ ...valid, seed: '0x2a' })).toThrow(MetricsError);
    expect(() => parseRunRecord({ ...valid, seed: '-1' })).toThrow(MetricsError);
  });

  it('round-trips through StreamSet', () => {
    const record = new MetricsRecorder({ seed: new StreamSet(12345) }).finish(1);
    const restored = parseRunRecord(JSON.stringify(record));
    expect(new StreamSet(BigInt(restored.seed)).masterSeed).toBe(12345n);
  });
});
