/**
 * That shrinking actually shrinks, and that what it hands back is still a counterexample.
 *
 * A shrinker has two ways to be useless and both look like success from the outside: it can
 * return the original unchanged, and it can return something smaller that no longer reproduces
 * the bug. Both are checked here, on a real failure produced by a real faulty controller rather
 * than on a synthetic outcome — the reducers edit a **building**, so they have to be exercised
 * against a case where removing a floor genuinely changes the run.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { STANDARD_CORPUS } from './campaign.js';
import { stallingAfter } from './faults.js';
import { caseFromSeed, resolveCase } from './generate.js';
import {
  CORPUS_DISPATCHER_PROFILE_IDS,
  CORPUS_TRAFFIC_PROFILE_IDS,
  evaluateCase,
  generateOptionsFrom,
  isFailure,
  type RunOptions,
} from './run.js';
import { formatFuzzCase, formatOutcome, shrinkCase } from './shrink.js';
import type { FuzzCase } from './types.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;
/** The first corpus case big enough that there is something to remove. */
let subject: FuzzCase;

function sizeOf(fuzzCase: FuzzCase): number {
  const floors = (fuzzCase.building.floors ?? []).length;
  const cars = fuzzCase.building.banks.reduce((sum, bank) => sum + bank.cars.length, 0);
  const population = (fuzzCase.building.floors ?? []).reduce((sum, floor) => sum + floor.population, 0);
  return floors + fuzzCase.building.banks.length + cars + population;
}

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
// The frozen axes: this suite shrinks a **recorded** counterexample, and a seed only means what it
// meant against the library it was found under. See `CORPUS_TRAFFIC_PROFILE_IDS`.
  const options = generateOptionsFrom(
    config,
    undefined,
    CORPUS_DISPATCHER_PROFILE_IDS,
    CORPUS_TRAFFIC_PROFILE_IDS,
  );
  for (const seed of STANDARD_CORPUS) {
    const candidate = caseFromSeed(seed, options);
    const floors = (candidate.building.floors ?? []).length;
    if (floors >= 8 && candidate.building.banks.length >= 2) {
      subject = candidate;
      break;
    }
  }
  if (subject === undefined) throw new Error('no multi-bank corpus case to shrink');
}, 60_000);

describe('shrinking a real counterexample', () => {
  it('reduces the building and keeps the failure', () => {
    // The fault: the group stops allocating from t=60. Everything else is the shipped run.
    const options: RunOptions = { config, createPolicy: stallingAfter(60) };
    const original = evaluateCase(subject, options);
    expect(isFailure(original)).toBe(true);

    const shrunk = shrinkCase(original, { ...options, budget: 80 });

    console.log(
      `\nshrink: ${subject.caseId} reduced in ${String(shrunk.steps)} steps over ${String(shrunk.evaluations)} evaluations\n  before: ${String(sizeOf(original.case))} units, ${String((original.case.building.floors ?? []).length)} floors, ${String(original.case.building.banks.length)} banks\n  after:  ${String(sizeOf(shrunk.minimal.case))} units, ${String((shrunk.minimal.case.building.floors ?? []).length)} floors, ${String(shrunk.minimal.case.building.banks.length)} banks\n`,
    );

    expect(shrunk.steps).toBeGreaterThan(0);
    expect(sizeOf(shrunk.minimal.case)).toBeLessThan(sizeOf(original.case));
    // The minimal case must still fail, and fail the *same* property. A shrinker allowed to
    // wander to a different property reports the wrong minimal case with total confidence.
    expect(
      shrunk.minimal.violations.some((violation) => violation.property === 'termination'),
    ).toBe(true);
  }, 120_000);

  it('hands back a case the real loader still accepts, and that replays', () => {
    const options: RunOptions = { config, createPolicy: stallingAfter(60) };
    const shrunk = shrinkCase(evaluateCase(subject, options), { ...options, budget: 60 });

    // Every reducer re-validates through `parseBuilding`; this asserts the *result* does too,
    // so a minimal counterexample can be pasted into `data/buildings/` and loaded.
    expect(() => resolveCase(shrunk.minimal.case, generateOptionsFrom(config, undefined, CORPUS_DISPATCHER_PROFILE_IDS, CORPUS_TRAFFIC_PROFILE_IDS))).not.toThrow();

    // Replay: the same case, run again, gives the same verdict. A finding nobody can reproduce
    // is a rumour, and a shrunk case is not seed-derivable — the printed config is the record.
    const again = evaluateCase(shrunk.minimal.case, options);
    expect(again.violations.map((violation) => violation.property)).toEqual(
      shrunk.minimal.violations.map((violation) => violation.property),
    );
    expect(again.status).toBe(shrunk.minimal.status);

    const printed = formatOutcome(shrunk.minimal);
    expect(printed).toContain('fuzzSeed');
    expect(printed).toContain('"banks"');
    expect(formatFuzzCase(shrunk.minimal.case)).toContain(shrunk.minimal.case.fuzzSeed);
  }, 120_000);

  it('does nothing to a case that passes', () => {
    const clean = evaluateCase(subject, { config });
    expect(isFailure(clean)).toBe(false);
    const shrunk = shrinkCase(clean, { config, budget: 20 });
    expect(shrunk.steps).toBe(0);
    expect(shrunk.evaluations).toBe(0);
    expect(shrunk.minimal).toBe(clean);
  }, 60_000);
});
