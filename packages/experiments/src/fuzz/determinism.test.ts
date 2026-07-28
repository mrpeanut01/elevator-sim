/**
 * Determinism and common random numbers, on buildings nobody authored.
 *
 * `core/src/sim/determinism.test.ts` establishes both claims on the **five shipped buildings**.
 * They are properties of the machinery rather than of those five configurations, and a
 * randomized building is exactly where a hash-iteration-order leak or a stream shared between
 * two sources would show up first: a two-floor shaft with one car, a bank of six, a floor served
 * by three banks, a shuttle whose `servesFloors` is a two-element list. So the same two claims
 * are re-established here over the generated corpus.
 *
 * The second claim is the one that carries the statistics. `CLAUDE.md` invariant 2 exists so
 * that **the passenger trace is a function of the seed alone** — feed two dispatchers the same
 * seed and they must see the identical population, or every paired comparison in this repository
 * silently loses its pairing. That is checked here by running each case under two different
 * shipped dispatchers and comparing the traces byte for byte.
 */

import { loadConfig, runSimulation, type LoadedConfig, type SimulationResult } from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { STANDARD_CORPUS } from './campaign.js';
import { caseFromSeed } from './generate.js';
import { generateOptionsFrom, fuzzSimulationConfigFor, withCallType } from './run.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

/** Enough cases to span every topology; few enough to stay inside a second. */
const SAMPLE = STANDARD_CORPUS.slice(0, 16);

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

/**
 * Everything a caller could act on, and nothing that is merely an object identity.
 *
 * `JSON.stringify` rather than a deep-equal because it also pins **key order**, which catches a
 * record assembled by iterating a differently-ordered map — the failure invariant 4 exists for.
 * The same fingerprint `sim/fixtures.test-helper.ts` uses.
 */
function fingerprint(result: SimulationResult): string {
  return JSON.stringify({
    status: result.status,
    seed: result.seed,
    endedAt: result.endedAt,
    events: result.events,
    record: result.record,
    summary: result.summary,
    conservation: result.conservation,
    undelivered: result.undelivered,
    warnings: result.warnings,
  });
}

describe('a generated case replays exactly from its seed', () => {
  it('produces a structurally identical run twice', () => {
    const options = generateOptionsFrom(config);
    for (const seed of SAMPLE) {
      const fuzzCase = caseFromSeed(seed, options);
      const simConfig = fuzzSimulationConfigFor(fuzzCase, { config });
      const first = runSimulation(simConfig);
      const second = runSimulation(fuzzSimulationConfigFor(fuzzCase, { config }));
      expect(fingerprint(second), `${fuzzCase.caseId} did not replay`).toBe(fingerprint(first));
      expect(second.seed).toBe(String(fuzzCase.simSeed));
      expect(second.record.seed).toBe(String(fuzzCase.simSeed));
    }
  }, 120_000);
});

describe('the passenger trace is a function of the seed alone', () => {
  it('is byte-identical under two different dispatchers', () => {
    const options = generateOptionsFrom(config);
    const profiles = config.dispatcherProfiles.profiles;
    const first = profiles[0];
    const last = profiles[profiles.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first === undefined || last === undefined) return;

    let compared = 0;
    for (const seed of SAMPLE) {
      const fuzzCase = caseFromSeed(seed, options);
      const base = fuzzSimulationConfigFor(fuzzCase, { config });
      const a = runSimulation({
        ...base,
        dispatcherProfile: withCallType(first, fuzzCase.callType),
      });
      const b = runSimulation({
        ...base,
        dispatcherProfile: withCallType(last, fuzzCase.callType),
      });
      expect(JSON.stringify(b.trace.passengers), `${fuzzCase.caseId} trace moved with the dispatcher`).toBe(
        JSON.stringify(a.trace.passengers),
      );
      // The elevators must be able to move the *outcome*, or the comparison is vacuous. Not
      // asserted per case — two dispatchers legitimately agree on a one-car building, which is a
      // known plateau (docs/07-handoff.md § 4) — but asserted over the sample.
      if (fingerprint(a) !== fingerprint(b)) compared += 1;
    }
    expect(compared, 'no generated case distinguished two dispatchers at all').toBeGreaterThan(0);
  }, 180_000);
});
