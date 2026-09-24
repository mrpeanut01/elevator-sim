/**
 * **The guard on the pair** — GitHub issue #584, § D961.
 *
 * Three things, and the third is the one that stops the defect coming back in a file nobody has
 * written yet:
 *
 * 1. {@link assertContractPair} refuses a state whose week stands on a contract that does not name
 *    its building, accepts a matching pair, and accepts a week on no shipped contract — which
 *    `shift/ladder.ts#rungFor` has a deliberate branch for and which is therefore not a mismatch.
 * 2. Every state {@link contractDayState} builds **takes its own rung**, asserted over `CONTRACTS`
 *    rather than over a list. That is the property the three sweeps lost: a mismatched pair returns
 *    `undefined` from `rungFor` and the run is the tower as built.
 * 3. A source guard **derived from the directory**: a file in `shift/` that simulates over the
 *    contracts may not write a building id off a contract row into a state without going through
 *    the helper. The detector is asserted live against a synthetic line, because half the claim is
 *    that it is not simply off.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { assertContractPair, contractDayState } from './contractDay.test-helper.js';
import { CONTRACTS } from './contracts.js';
import { rungFor } from './ladder.js';
import { openWeek } from './week.js';

describe('the pair is refused when it disagrees', () => {
  it('throws on a building the week’s contract does not name', () => {
    expect(() =>
      assertContractPair({ buildingId: 'midtown-office', week: openWeek('c1') }),
    ).toThrow(/mismatched pair|c1/u);
  });

  it('accepts a matching pair, and a week on no shipped contract', () => {
    const first = CONTRACTS[0];
    if (first === undefined) throw new Error('no contracts');
    expect(() =>
      assertContractPair({ buildingId: first.buildingId, week: openWeek(first.id) }),
    ).not.toThrow();
    /* A sentinel week — a slot to park in — borrows the building's own rung by design. */
    expect(() =>
      assertContractPair({ buildingId: 'midtown-office', week: openWeek('replay') }),
    ).not.toThrow();
  });
});

describe('every state the sweeps build takes its own rung', () => {
  it('is the contract’s own ladder row, for every shipped contract', () => {
    for (const contract of CONTRACTS) {
      const state = contractDayState(contract.id, { seed: 20_260_824n });
      expect(state.buildingId).toBe(contract.buildingId);
      expect(state.week.contractId).toBe(contract.id);
      expect(state.playMode).toBe('shift-week');
      const rung = rungFor(state.week.contractId, state.buildingId);
      expect(rung?.contractId).toBe(contract.id);
    }
  });

  it('is exactly what the old shape did not do', () => {
    /*
     * The defect, reproduced: `baseState()`'s week stands on `c1`, so every contract but that one
     * took no rung at all. Asserted on more than one contract so this reads as the rule it was.
     */
    for (const contract of CONTRACTS) {
      if (contract.id === 'c1') continue;
      expect(rungFor('c1', contract.buildingId)).toBeUndefined();
    }
  });
});

/** Files in `shift/` that simulate over the contracts, read off disk rather than listed. */
function sweepFiles(): readonly { readonly name: string; readonly code: string }[] {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, source: readFileSync(join(dir, name), 'utf8') }))
    .filter((entry) => entry.source.includes('recordRun(') && entry.source.includes('CONTRACTS'))
    .map((entry) => ({
      name: entry.name,
      /* Comments stripped, so a docstring naming the old shape is not read as the old shape. */
      code: entry.source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, ''),
    }));
}

/** The shape of the defect: a building id taken off a contract row and written into a state. */
const BUILDING_OFF_A_ROW = /buildingId:\s*\w+\.buildingId/u;

describe('the source guard — issue #584’s shape cannot return unseen', () => {
  it('sees the files it is guarding', () => {
    const names = sweepFiles().map((file) => file.name);
    expect(names).toContain('legibility.test.ts');
    expect(names).toContain('legibility.sweep.test.ts');
    expect(names).toContain('firstSession.test.ts');
    expect(names.length).toBeGreaterThan(3);
  });

  it('detects the shape it is looking for', () => {
    /* Half the claim is that the detector is not simply off. */
    expect(BUILDING_OFF_A_ROW.test('buildingId: contract.buildingId,')).toBe(true);
    expect(BUILDING_OFF_A_ROW.test('buildingId: row.buildingId,')).toBe(true);
    expect(BUILDING_OFF_A_ROW.test('buildingId,')).toBe(false);
  });

  it('lets no sweep write a contract’s building into a state without the helper', () => {
    for (const file of sweepFiles()) {
      if (!BUILDING_OFF_A_ROW.test(file.code)) continue;
      expect(
        file.code.includes('contractDayState('),
        `${file.name} writes a contract's building into a state without contractDayState — ` +
          'the week would stand on c1 and the run would be the tower as built (issue #584)',
      ).toBe(true);
    }
  });
});
