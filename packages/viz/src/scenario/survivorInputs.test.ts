/**
 * **The survivor census was taken over the inputs that ship** — always on, simulating nothing.
 * The swarm's Q3 ruling, clause 5 (S2), [§ D1129](../../../../DECISIONS.md).
 *
 * `survivorSweep.test.ts` re-runs the census and is gated, because it simulates for a quarter of an
 * hour or more. This file is the cheap half: it hashes the documents the census reads and compares
 * the hash with the one the census stored when it was measured. A moved stage, price, profile, bar,
 * traffic profile, elevator spec or stage building reds here on the pull request that moves it,
 * rather than leaving the Scenario hub publishing a count of a game that no longer ships.
 * `survivorInputs.test-helper.ts` names what is hashed and the bound on it (code is not).
 */

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { SCENARIO_SURVIVORS_PATH } from './regenerateSurvivors.test-helper.js';
import { censusInputHashOf } from './survivorInputs.test-helper.js';
import type { PublishedSurvivors } from './survivors.js';

describe('the survivor census is pinned to its inputs — § D1129 clause 5', () => {
  it('stores the hash of the inputs it was measured over, and they have not moved since', async () => {
    const table = JSON.parse(await readFile(SCENARIO_SURVIVORS_PATH, 'utf8')) as PublishedSurvivors;
    const current = await censusInputHashOf(DATA_DIR);
    /* Non-vacuity: the hash covers the stage file, the price list and at least one building. */
    expect(current.files).toContain('campaign.json');
    expect(current.files).toContain('price-schedule.json');
    expect(current.files.some((file) => file.startsWith('buildings/'))).toBe(true);
    expect(
      table.provenance.inputHash,
      'data/scenario-survivors.json was measured over inputs that have since moved: one of ' +
        `${current.files.join(', ')} changed. Regenerate it with ${table.provenance.command} and ` +
        'report what moved, rather than editing the hash.',
    ).toBe(current.hash);
  });

  it('moves when any one input moves', async () => {
    /*
     * The control: a hash that ignored its inputs would pass the case above forever. Each document
     * is perturbed in a copy of `data/` in memory by hashing a changed canonical form, which is the
     * helper's own serialisation; so this proves every listed file reaches the digest.
     */
    const { createHash } = await import('node:crypto');
    const { join } = await import('node:path');
    const current = await censusInputHashOf(DATA_DIR);
    const digestWith = async (changed: string): Promise<string> => {
      const hash = createHash('sha256');
      for (const file of current.files) {
        const canonical = JSON.stringify(JSON.parse(await readFile(join(DATA_DIR, file), 'utf8')));
        hash.update(`${file}\n${file === changed ? `${canonical} ` : canonical}\n`);
      }
      return hash.digest('hex');
    };
    const unchanged = await digestWith('');
    expect(unchanged, 'the recomputation is the helper’s own').toBe(current.hash);
    for (const file of current.files) {
      expect(await digestWith(file), file).not.toBe(current.hash);
    }
  });
});
