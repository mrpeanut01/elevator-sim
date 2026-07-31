/**
 * Persisting a run, and reading one back.
 *
 * docs/03-traffic-and-statistics.md § Part 5 asks for per-run records on disk "so any run can
 * be replayed exactly and results re-analyzed without re-simulating". That makes the JSON form
 * a contract, not a debug dump, and it is validated on the way in:
 *
 * - **The seed is mandatory and is a decimal string** (CLAUDE.md invariant 5). A 64-bit seed
 *   does not survive `JSON.stringify` as a `bigint` and loses precision as a `number`, so it
 *   travels as text and `runSeed()` turns it back into the `bigint` `new StreamSet(...)` wants.
 *   A record without a parseable seed is rejected rather than loaded: a dataset nobody can
 *   reproduce is worse than no dataset, because it still produces numbers.
 * - **Objects are strict.** An unrecognized key is an error, matching `config/schema.ts`. A
 *   field that was silently dropped is a field somebody will later believe was recorded.
 * - **The schema version must match.** A record from a future writer is refused instead of
 *   being partially understood, because a mis-parsed run produces plausible statistics from
 *   the wrong data.
 */

import { z } from 'zod';

import { DIRECTIONS } from '../model/types.js';
import { TRAFFIC_MODEL_VERSIONS } from '../traffic/types.js';

import { PASSENGER_MODELS } from './comparability.js';

import {
  METRICS_SCHEMA_VERSION,
  MetricsError,
  type CarTimings,
  type LoadSample,
  type PassengerRecord,
  type QueueSample,
  type ReportWindow,
  type RunRecord,
  type TravelSample,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Schema
 * -------------------------------------------------------------------------- */

const simTime = z.number();
const identifier = z.string().min(1, 'must be a non-empty string');

/** A 64-bit unsigned seed, as text. The regex *is* CLAUDE.md invariant 5, enforced. */
const seedString = z
  .string()
  .regex(/^\d+$/, 'seed must be a non-negative decimal integer written as a string');

export const reportWindowSchema = z.strictObject({
  id: identifier,
  startS: simTime,
  endS: simTime,
});

export const passengerRecordSchema = z.strictObject({
  passengerId: identifier,
  journeyId: identifier,
  legIndex: z.number().int().min(0),
  isFinalLeg: z.boolean(),
  originFloorId: identifier,
  destinationFloorId: identifier,
  finalDestinationFloorId: identifier,
  direction: z.enum(DIRECTIONS),
  massKg: z.number().gt(0),
  credentialGroup: z.string().min(1).optional(),
  arrivedAt: simTime,
  journeyStartedAt: simTime,
  // Absent on every run of every building that declares no transport mode, so a stored record
  // written before transport modes existed parses unchanged.
  egressTransitSeconds: z.number().nonnegative().finite().optional(),
  boardedAt: simTime.optional(),
  alightedAt: simTime.optional(),
  carId: z.string().min(1).optional(),
  bankId: z.string().min(1).optional(),
  // Destination dispatch only, and optional in both directions: a record written before the
  // landing panel existed parses unchanged, and a record written by a panel run round-trips the
  // promise it made. `passengerModel` on the run record says which of the two a reader is holding.
  assignedCarId: z.string().min(1).optional(),
  assignedAt: simTime.optional(),
});

export const loadSampleSchema = z.strictObject({
  at: simTime,
  carId: identifier,
  loadFactor: z.number(),
  occupants: z.number().int().min(0),
  massKg: z.number().min(0),
});

/**
 * Door and motion timings of the cars at the terminal.
 *
 * Non-negative rather than positive: a zero door time is a legitimate knock-out configuration
 * (`analytical/`'s validation drives exactly that to isolate the closed form's omissions), and
 * rejecting it here would refuse to persist a run the simulator can run.
 */
export const carTimingsSchema = z.strictObject({
  doorOpenS: z.number().min(0),
  doorCloseS: z.number().min(0),
  dwellHallCallS: z.number().min(0),
  dwellCarCallS: z.number().min(0),
  fullLoadTransferS: z.number().min(0),
  nearestFloorFlightS: z.number().min(0).optional(),
  motorStartDelayS: z.number().min(0).optional(),
  levelingSettleS: z.number().min(0).optional(),
});

/**
 * One completed car move, with its energy proxy.
 *
 * `workJ` is stored rather than recomputed on read, for the reason every other derived-but-stored
 * field in this package is *not*: it is not derived from the rest of the record by this build's
 * arithmetic alone, it is derived by whichever build wrote it. `COUNTERWEIGHT_BALANCE_RATIO` is a
 * measurement convention; recomputing on read would silently restate an old dataset's energy under
 * a new convention and make two runs of the same building incomparable across a version boundary.
 * The four inputs travel with it, so a reader that disagrees with the convention can redo the sum
 * and see that it did.
 */
export const travelSampleSchema = z.strictObject({
  at: simTime,
  carId: identifier,
  distanceM: z.number().gt(0),
  direction: z.enum(DIRECTIONS),
  loadKg: z.number().min(0),
  ratedLoadKg: z.number().gt(0),
  workJ: z.number().min(0),
});

export const queueSampleSchema = z.strictObject({
  at: simTime,
  waiting: z.number().min(0),
  byFloorId: z.record(z.string(), z.number()).optional(),
});

/** The persisted form of a run. Strict, versioned, and seed-bearing. */
export const runRecordSchema = z.strictObject({
  schemaVersion: z.number().int().positive(),
  runId: identifier,
  seed: seedString,
  // Both optional in both directions: a record written before the two traffic knobs existed parses
  // unchanged, and a record written by a run that used one round-trips it. Validated rather than
  // waved through, because a traffic seed that does not survive `BigInt()` and a model version this
  // build cannot run are both records that replay to something other than what they stored.
  trafficSeed: seedString.optional(),
  trafficModel: z.enum(TRAFFIC_MODEL_VERSIONS).optional(),
  buildingId: z.string().min(1).optional(),
  dispatcherProfileId: z.string().min(1).optional(),
  trafficProfileId: z.string().min(1).optional(),
  demandTemplateId: z.string().min(1).optional(),
  replication: z.number().int().min(0).optional(),
  population: z.number().min(0).optional(),
  carIds: z.array(identifier).optional(),
  carTimings: carTimingsSchema.optional(),
  passengerModel: z.enum(PASSENGER_MODELS).optional(),
  startedAt: simTime,
  endedAt: simTime,
  reportWindow: reportWindowSchema.optional(),
  warnings: z.array(z.string().min(1)).optional(),
  passengers: z.array(passengerRecordSchema),
  loadSamples: z.array(loadSampleSchema),
  queueSamples: z.array(queueSampleSchema),
  // Optional in both directions: a record written before the energy axis existed parses
  // unchanged, and a record written by a run that sampled travel round-trips it. Absence means
  // *not measured*, which `summarizeRun` reports rather than zeroing.
  travelSamples: z.array(travelSampleSchema).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

/* -------------------------------------------------------------------------- *
 * Write
 * -------------------------------------------------------------------------- */

export interface SerializeOptions {
  /** Indentation for `JSON.stringify`. Omit for the compact form batch runs should store. */
  readonly space?: number | undefined;
}

/**
 * A run record as JSON text.
 *
 * Compact by default: a 30-minute peak generates thousands of leg records per replication and
 * hundreds of replications per configuration, and pretty-printing that is megabytes of
 * whitespace.
 */
export function serializeRunRecord(record: RunRecord, options: SerializeOptions = {}): string {
  return JSON.stringify(record, undefined, options.space);
}

/* -------------------------------------------------------------------------- *
 * Read
 * -------------------------------------------------------------------------- */

/**
 * Parse and validate a stored run record.
 *
 * Accepts JSON text or an already-parsed value, so a caller that read a file and a caller that
 * received a structured message use the same validation path.
 *
 * @throws MetricsError on malformed JSON, an unknown schema version, or any schema violation
 *   — including a missing or unparseable seed.
 */
export function parseRunRecord(input: string | unknown): RunRecord {
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new MetricsError(`Run record is not valid JSON: ${detail}`);
    }
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MetricsError('Run record must be a JSON object.');
  }

  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (version !== METRICS_SCHEMA_VERSION) {
    throw new MetricsError(
      `Run record declares schemaVersion ${String(version)}; this build reads version ${METRICS_SCHEMA_VERSION}. Refusing to guess at the difference — a mis-parsed record produces plausible statistics from the wrong data.`,
    );
  }

  const result = runRecordSchema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.length === 0 ? '(root)' : issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new MetricsError(`Run record failed validation: ${issues}`);
  }

  return Object.freeze(result.data) as RunRecord;
}

/* -------------------------------------------------------------------------- *
 * Compile-time conformance: schema output must satisfy the hand-written types.
 * Unused at runtime; they exist so `tsc` fails on drift. Same device as
 * `config/schema.ts`.
 * -------------------------------------------------------------------------- */

type Conforms<Expected, Actual extends Expected> = Actual;

type _ReportWindowConforms = Conforms<ReportWindow, z.infer<typeof reportWindowSchema>>;
type _PassengerRecordConforms = Conforms<PassengerRecord, z.infer<typeof passengerRecordSchema>>;
type _LoadSampleConforms = Conforms<LoadSample, z.infer<typeof loadSampleSchema>>;
type _CarTimingsConforms = Conforms<CarTimings, z.infer<typeof carTimingsSchema>>;
type _QueueSampleConforms = Conforms<QueueSample, z.infer<typeof queueSampleSchema>>;
type _TravelSampleConforms = Conforms<TravelSample, z.infer<typeof travelSampleSchema>>;
type _RunRecordConforms = Conforms<RunRecord, z.infer<typeof runRecordSchema>>;
