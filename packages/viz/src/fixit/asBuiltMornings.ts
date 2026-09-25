/**
 * **The shipped as-built mornings, so no press is ever cold** — [§ D1120](../../../../DECISIONS.md)
 * clause 4, the engineering member's (S3's) measure.
 *
 * A case's forty-nine as-built mornings depend on the case and nothing a player sets, so they are
 * run once, before the build ships, and read here: `data/fixit-as-built-mornings.json`. The judge
 * (`fixit/judge.ts#createFixitJudge`'s `shipped` option) takes them in place of asking a worker, and
 * a press then asks only for its own forty-nine after-runs. Measured by S3 before the ruling: a
 * press on `sleeping-sky-lobby` made at once, with the as-built mornings still running beside it,
 * was about 21 s on two workers; warm, about 7.
 *
 * ## What keeps it true
 *
 * - **Always-on**, `asBuiltMornings.test.ts`: every row's input digest (`fixit/morningsInput.ts`)
 *   equals the digest of the shipped case and data as they load today, every offered case has a
 *   row, and one morning of two cases is re-run and must match to the bit.
 * - **Deep tier**, `asBuiltMornings.sweep.test.ts` (`ELEVATOR_SIM_FIXIT_MORNINGS=deep`, a nightly
 *   job of its own): every morning of every case is re-run and must match to the bit.
 * - **At run time**: a row whose digest does not match the case in front of it is not used, and
 *   the judge asks for the mornings the old way. A stale file costs a cold press, never a wrong
 *   verdict.
 *
 * Nothing in the file is chosen: every reading is `fixit/run.ts#morningReadingOf` of a run. A
 * reading that does not reproduce is a finding to report rather than a number to edit.
 */

import type { SimulationConfig } from '@elevator-sim/core/browser';

import shippedDocument from '../../../../data/fixit-as-built-mornings.json' with { type: 'json' };

import { DERIVED_MORNINGS } from './judge.js';
import { morningsInputHashOf } from './morningsInput.js';
import type { MorningReading } from './run.js';
import type { FixitCase } from './types.js';

/** One morning as the file stores it: complaint, the rest's share away in points, the rest boarded. */
export type StoredMorning = readonly [number | null, number | null, number];

export interface AsBuiltMorningsRow {
  readonly caseId: string;
  readonly inputHash: string;
  readonly readings: readonly StoredMorning[];
}

export interface AsBuiltMorningsDocument {
  readonly generatedBy: string;
  readonly contract: string;
  readonly provenance: {
    readonly kind: 'measured';
    readonly command: string;
    readonly tree: string;
    readonly measuredAt: string;
  };
  readonly cases: readonly AsBuiltMorningsRow[];
}

function fail(why: string): never {
  throw new Error(`data/fixit-as-built-mornings.json: ${why}`);
}

function isStoredMorning(value: unknown): value is StoredMorning {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    (value[0] === null || typeof value[0] === 'number') &&
    (value[1] === null || typeof value[1] === 'number') &&
    typeof value[2] === 'number'
  );
}

/** The shipped document, checked for shape. Throws on a malformed file, which a test would catch first. */
export function asBuiltMorningsDocumentOf(value: unknown): AsBuiltMorningsDocument {
  if (typeof value !== 'object' || value === null) fail('is not an object');
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record['cases'])) fail('carries no case list');
  for (const row of record['cases'] as readonly unknown[]) {
    const r = row as Record<string, unknown>;
    if (typeof r['caseId'] !== 'string' || r['caseId'] === '') fail('a row has no case id');
    if (typeof r['inputHash'] !== 'string' || !/^[0-9a-f]{32}$/.test(r['inputHash'])) {
      fail(`row "${r['caseId']}" has no 32-character input digest`);
    }
    if (!Array.isArray(r['readings']) || r['readings'].length !== DERIVED_MORNINGS) {
      fail(`row "${r['caseId']}" does not carry ${String(DERIVED_MORNINGS)} mornings`);
    }
    if (!(r['readings'] as readonly unknown[]).every(isStoredMorning)) fail(`row "${r['caseId']}" has a malformed morning`);
  }
  return value as AsBuiltMorningsDocument;
}

/** The document this build ships. */
export const SHIPPED_AS_BUILT_MORNINGS: AsBuiltMorningsDocument = asBuiltMorningsDocumentOf(shippedDocument);

const ROWS = new Map(SHIPPED_AS_BUILT_MORNINGS.cases.map((row) => [row.caseId, row]));

/** A stored morning as the judge reads one. */
export function morningFromStored([complaint, restAwayPct, restBoarded]: StoredMorning): MorningReading {
  return { complaint, restAwayPct, restBoarded };
}

/**
 * The digest each case was last checked against, by config identity — the digest canonicalises a
 * config of a hundred-odd kilobytes, and a surface asks on every case open.
 */
const checked = new WeakMap<SimulationConfig, string>();

/**
 * **The forty-nine as-built mornings this build ships for the case in front of it**, or `undefined`
 * where it ships none or ships a row whose inputs no longer match — in which case the judge runs them.
 * The judge's `shipped` option, handed in by both surfaces.
 */
export function shippedAsBuiltMorningsOf(entry: FixitCase, asBuilt: SimulationConfig): readonly MorningReading[] | undefined {
  const row = ROWS.get(entry.id);
  if (row === undefined) return undefined;
  let hash = checked.get(asBuilt);
  if (hash === undefined) {
    hash = morningsInputHashOf(entry, asBuilt);
    checked.set(asBuilt, hash);
  }
  if (hash !== row.inputHash) return undefined;
  return row.readings.map(morningFromStored);
}
