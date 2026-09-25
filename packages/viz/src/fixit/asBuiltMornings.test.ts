/**
 * **The shipped as-built mornings match the inputs this tree ships, on every run** —
 * [§ D1120](../../../../DECISIONS.md) clause 4.
 *
 * The always-on half of `asBuiltMornings.sweep.test.ts`. It does not re-run the forty-nine mornings
 * of every case (the deep tier does, in about two minutes); it recomputes each row's **input digest**
 * from the shipped case file and data, which fails the moment a building, a profile, the demand, a
 * case or a switch moves under a row, and it re-runs two mornings to the bit, which fails when `core`
 * moves under the cheapest case. A stale row is not a wrong verdict — the judge refuses a row whose
 * digest does not match and runs the mornings itself — but it is a cold press, and the ruling's
 * target is that no press is cold.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import {
  asBuiltMorningsDocumentOf,
  morningFromStored,
  SHIPPED_AS_BUILT_MORNINGS,
  shippedAsBuiltMorningsOf,
} from './asBuiltMornings.js';
import { emptyFixitState } from './engine.js';
import { DERIVED_MORNINGS, morningConfigsOf, replicationSeedsOf } from './judge.js';
import { morningsInputHashOf, morningsInputOf } from './morningsInput.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import { FIXIT_RUN_SWITCHES, fixitRunPlanOf, morningReadingOf, type FixitResources } from './run.js';
import type { FixitCases } from './types.js';

let resources: FixitResources;
let cases: FixitCases;

beforeAll(async () => {
  resources = await fixitResourcesFromDisk();
  cases = await shippedFixitCases(resources);
}, 120_000);

describe('the shipped as-built mornings — § D1120 clause 4', () => {
  it('carry one row per shipped case, each of forty-nine mornings, and name the run that made them', () => {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, 'fixit-cases.json'), 'utf8')) as { cases: { id: string }[] };
    expect(SHIPPED_AS_BUILT_MORNINGS.cases.map((row) => row.caseId)).toEqual(raw.cases.map((entry) => entry.id));
    for (const row of SHIPPED_AS_BUILT_MORNINGS.cases) expect(row.readings, row.caseId).toHaveLength(DERIVED_MORNINGS);
    expect(SHIPPED_AS_BUILT_MORNINGS.provenance.kind).toBe('measured');
    expect(SHIPPED_AS_BUILT_MORNINGS.provenance.command).toContain('asBuiltMornings.sweep.test.ts');
    expect(SHIPPED_AS_BUILT_MORNINGS.generatedBy).toBe('packages/viz/src/fixit/asBuiltMornings.sweep.test.ts');
  });

  it('match the inputs this tree ships, case by case — a stale row fails here, not in the deep tier', () => {
    const stale: string[] = [];
    for (const entry of cases.cases) {
      const asBuilt = fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt;
      const row = SHIPPED_AS_BUILT_MORNINGS.cases.find((candidate) => candidate.caseId === entry.id)!;
      if (morningsInputHashOf(entry, asBuilt) !== row.inputHash) stale.push(entry.id);
      else expect(shippedAsBuiltMorningsOf(entry, asBuilt), entry.id).toHaveLength(DERIVED_MORNINGS);
    }
    expect(
      stale,
      'these rows no longer match the case and data they were derived from. Re-derive them — ' +
        'ELEVATOR_SIM_FIXIT_MORNINGS=deep ELEVATOR_SIM_REGENERATE_FIXIT_MORNINGS=1 npx vitest run --project viz ' +
        'src/fixit/asBuiltMornings.sweep.test.ts — and read the diff: a moved reading is a finding.',
    ).toEqual([]);
  });

  it('refuses a row whose inputs moved, so a stale file costs a cold press and never a wrong verdict', () => {
    const entry = cases.cases[0]!;
    const asBuilt = fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt;
    expect(shippedAsBuiltMorningsOf(entry, asBuilt)).toBeDefined();
    /* One second more of morning is a different run. */
    expect(shippedAsBuiltMorningsOf(entry, { ...asBuilt, durationS: (asBuilt.durationS ?? 0) + 1 })).toBeUndefined();
    /* A different complaint measure reads the same run differently. */
    const measured = { ...entry, complaint: { ...entry.complaint, measure: { ...entry.complaint.measure, label: 'other' } } };
    expect(morningsInputHashOf(measured, asBuilt)).not.toBe(morningsInputHashOf(entry, asBuilt));
    /* The letter's own seed is not an input — the derived seeds are. */
    expect(morningsInputOf(entry, { ...asBuilt, seed: 1n })).toBe(morningsInputOf(entry, asBuilt));
    expect(shippedAsBuiltMorningsOf({ ...entry, id: 'no-such-case' }, asBuilt)).toBeUndefined();
  });

  it('re-runs two mornings of the cheapest case to the bit', () => {
    const entry = cases.cases.find((candidate) => candidate.id === 'three-cars-one-cars-work')!;
    const asBuilt = fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt;
    const shipped = shippedAsBuiltMorningsOf(entry, asBuilt)!;
    const configs = morningConfigsOf(asBuilt, replicationSeedsOf(entry));
    for (const index of [0, DERIVED_MORNINGS - 1]) {
      const reading = morningReadingOf(recordRun(configs[index]!, FIXIT_RUN_SWITCHES).recording, entry.complaint.measure);
      expect(reading, `morning ${String(index + 1)}`).toEqual(shipped[index]);
    }
  });

  it('round-trips a reading through the stored form, and refuses a malformed file', () => {
    expect(morningFromStored([null, 97.5, 12])).toEqual({ complaint: null, restAwayPct: 97.5, restBoarded: 12 });
    expect(() => asBuiltMorningsDocumentOf({ cases: [{ caseId: 'x', inputHash: 'nope', readings: [] }] })).toThrow(/digest/);
    expect(() => asBuiltMorningsDocumentOf({ cases: [{ caseId: 'x', inputHash: '0'.repeat(32), readings: [] }] })).toThrow(/49/);
  });
});
