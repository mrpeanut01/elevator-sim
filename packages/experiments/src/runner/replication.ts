/**
 * One replication, run once. The single implementation both executors call.
 *
 * ## Why this module exists separately
 *
 * The whole safety argument for running replications in parallel is that parallelism cannot move
 * a number. That argument is worthless if the serial path and the worker path contain two
 * transcriptions of "build a config, run it, shape the result" — the two would eventually
 * disagree, and the disagreement would appear only under load. So there is exactly one
 * {@link runOneReplication}, `parallel.ts` calls it directly on the parent thread, and `worker.ts`
 * imports *this file* and calls the same function.
 *
 * ## The import rule this file obeys, and why it is not negotiable
 *
 * A worker entry is loaded by **Node**, not by the test runner's module pipeline. Node 26 strips
 * types from a `.ts` file natively, so a TypeScript worker entry runs unbuilt — but Node does
 * *not* rewrite TypeScript's `./sibling.js` specifiers back to `./sibling.ts`, so a runtime import
 * of a sibling module fails outright when this file is loaded from `src/`. Therefore:
 *
 * - runtime imports here are limited to `@elevator-sim/core` and `node:*`;
 * - every sibling import is `import type`, which both `tsc` and Node's type stripper erase;
 * - anything this file needs that is *not* a type — defaults, metric projection, aggregation —
 *   is the parent's job and is passed in or applied afterwards.
 *
 * `parallel.test.ts` asserts the observable consequence: identical output from both executors.
 */

import { SimulationError, runSimulation } from '@elevator-sim/core';

import type { GeneratedPassenger, PassengerTrace, SimulationConfig } from '@elevator-sim/core';

import type { ExperimentCell, RawReplicationOutcome, SerializedError } from './types.js';

/* -------------------------------------------------------------------------- *
 * Identity
 * -------------------------------------------------------------------------- */

/**
 * The run id for one replication.
 *
 * A function of the cell and the index only, so it is the same string whichever executor
 * produced it and can be used as a stable key when the records are persisted. Core would
 * otherwise default to `<buildingId>-<dispatcherId>-<seed>`, which collides for two arms sharing a
 * profile — exactly the case a crippled-variant control creates.
 */
export function runIdFor(experimentId: string, cellId: string, replication: number): string {
  return `${experimentId}/${cellId}#r${replication}`;
}

/**
 * The full `SimulationConfig` for one replication: the cell's payload plus the seed and index.
 *
 * The seed is the *only* thing that varies between replications of a cell, and the cell payload is
 * the only thing that varies between cells at a replication. Keeping the two strictly separate is
 * what makes {@link ExperimentCell.traceKey} a sound statement about which cells share a trace.
 */
export function simulationConfigFor(
  experimentId: string,
  cell: ExperimentCell,
  replication: number,
  seed: bigint,
): SimulationConfig {
  return {
    ...cell.simulation,
    seed,
    replication,
    runId: runIdFor(experimentId, cell.cellId, replication),
  };
}

/* -------------------------------------------------------------------------- *
 * The trace digest — the CRN audit trail
 * -------------------------------------------------------------------------- */

const FNV_OFFSET_BASIS = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME = 0x0000_0100_0000_01b3n;
const MASK_64 = 0xffff_ffff_ffff_ffffn;

function hashBytes(hash: bigint, text: string): bigint {
  let next = hash;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    next = ((next ^ BigInt(unit & 0xff)) * FNV_PRIME) & MASK_64;
    next = ((next ^ BigInt(unit >>> 8)) * FNV_PRIME) & MASK_64;
  }
  return next;
}

/**
 * A 64-bit fingerprint of a run's passenger population.
 *
 * Every field of every generated journey that the simulation can *read* goes in — arrival time,
 * origin, every leg, mass, credential, category — plus the trace's own seed and horizon. What does
 * not go in is anything the elevators produce, because the point of the digest is to be
 * insensitive to dispatching and sensitive to demand.
 *
 * Two cells of one CRN cohort must report the same digest at the same replication index. A hash
 * rather than the population itself so that a result can carry the check without carrying a
 * hundred kilobytes per replication; `crn.test.ts` additionally compares two dispatchers' traces
 * field-for-field, so the hash is a cheap continuous audit rather than the primary evidence.
 *
 * FNV-1a over UTF-16 code units, matching the mixing core's `deriveStreamSeed` uses, so the
 * repository has one string-hashing convention rather than two.
 */
export function traceDigest(trace: PassengerTrace): string {
  let hash = FNV_OFFSET_BASIS;
  hash = hashBytes(hash, trace.seed);
  hash = hashBytes(hash, trace.buildingId);
  hash = hashBytes(hash, `${trace.durationS}|${trace.reportWindowStartS}|${trace.reportWindowEndS}`);
  hash = hashBytes(hash, `${trace.passengerCount}|${trace.arrivals.length}`);
  for (const passenger of trace.passengers) hash = hashBytes(hash, passengerLine(passenger));
  return hash.toString(16).padStart(16, '0');
}

function passengerLine(passenger: GeneratedPassenger): string {
  let line = `${passenger.id};${passenger.journeyId};${passenger.batchId};${passenger.arrivalTimeS};${passenger.originFloorId};${passenger.finalDestinationFloorId};${passenger.massKg};${passenger.category};${passenger.demandFloorId};${passenger.profileId};${passenger.credentialGroup ?? '-'}`;
  for (const leg of passenger.legs) {
    line += `;${leg.legIndex}>${leg.originFloorId}->${leg.destinationFloorId}`;
  }
  return line;
}

/* -------------------------------------------------------------------------- *
 * Running one
 * -------------------------------------------------------------------------- */

/** Flatten an exception so it survives a `postMessage` and reads the same from either executor. */
export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
      fromSimulation: error instanceof SimulationError,
    };
  }
  return { name: 'unknown', message: String(error), fromSimulation: false };
}

/**
 * Run one replication and shape the outcome.
 *
 * Does **not** decide what a failure means: an exception is caught, flattened and returned as
 * `ok: false`, and the parent applies the plan's `onReplicationError` policy. That split is what
 * lets a worker report a crash as data — a thrown exception cannot cross a thread boundary — while
 * keeping the serial path's behaviour identical.
 *
 * A *timed-out* run is not a failure here. The plan sets core's `onTimeout` to `'report'` by
 * default precisely so a configuration that cannot clear its demand is measured and flagged
 * rather than crashing the batch; saturation is then detected from the queue trend by `metrics/`.
 */
export function runOneReplication(
  experimentId: string,
  cell: ExperimentCell,
  replication: number,
  seed: bigint,
  keepRecords: boolean,
): RawReplicationOutcome {
  const config = simulationConfigFor(experimentId, cell, replication, seed);
  try {
    const result = runSimulation(config);
    return {
      ok: true,
      cellIndex: cell.index,
      replication,
      seed: seed.toString(),
      runId: result.runId,
      status: result.status,
      summary: result.summary,
      ...(keepRecords ? { record: result.record } : {}),
      conservation: result.conservation,
      traceDigest: traceDigest(result.trace),
      tracePassengers: result.trace.passengerCount,
      undeliveredCount: result.undelivered.length,
      kioskRefusedLegs: result.stageActivity.kioskRefusedLegs,
      warnings: result.warnings,
    };
  } catch (error) {
    return {
      ok: false,
      cellIndex: cell.index,
      replication,
      seed: seed.toString(),
      error: serializeError(error),
    };
  }
}
