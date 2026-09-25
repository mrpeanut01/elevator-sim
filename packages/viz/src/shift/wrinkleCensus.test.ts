/**
 * **`data/wrinkle-census.json` is the run's, not a table somebody typed** — [§ D1057](../../../../DECISIONS.md).
 *
 * The file is written by `wrinkleCensus.sweep.test.ts` (hours of whole days), so it cannot be
 * regenerated on every run. What is checked on every run instead: that it covers every census
 * tower × every spliced wrinkle (and the unwrinkled day) × every crowd it says it ran, so a
 * placement added to `data/wrinkles.json` without a census row reddens here; and that a sample of
 * its rows — the unwrinkled day and the fire drill on Midtown, first crowd, default standing order —
 * re-derives from the product's own run to the leg. A file that has gone stale under a moved
 * placement, rung or bar fails the second half.
 *
 * It claims nothing beyond the counts: no rate, no interval, no ranking of dispatchers.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';

import {
  CENSUS_CONTRACTS,
  CENSUS_WRINKLES,
  DEFAULT_DISPATCHER,
  censusDayOf,
  censusSeedAt,
  type CensusRow,
} from './wrinkleCensus.test-helper.js';

interface CensusFile {
  readonly crowds: number;
  readonly defaultDispatcher: string;
  readonly cells: Readonly<Record<string, readonly CensusRow[]>>;
}

const CENSUS = JSON.parse(readFileSync(join(DATA_DIR, 'wrinkle-census.json'), 'utf8')) as CensusFile;

describe('the whole-day wrinkle census — § D1057', () => {
  it('covers every census tower, every spliced wrinkle and the unwrinkled day, on every crowd', () => {
    expect(CENSUS.defaultDispatcher).toBe(DEFAULT_DISPATCHER);
    const missing: string[] = [];
    for (const contractId of CENSUS_CONTRACTS) {
      for (const wrinkleId of CENSUS_WRINKLES) {
        const rows = CENSUS.cells[`${contractId}/${wrinkleId}`];
        if (rows?.map((row) => row.n).join(',') !== [...Array(CENSUS.crowds).keys()].join(',')) {
          missing.push(`${contractId}/${wrinkleId}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(Object.keys(CENSUS.cells)).toHaveLength(CENSUS_CONTRACTS.length * CENSUS_WRINKLES.length);
    /* A row the default order clears is a row some order clears. */
    for (const rows of Object.values(CENSUS.cells)) {
      for (const row of rows) if (row.clearsDefault) expect(row.clearsAny).toBe(true);
    }
  });

  it.each([
    ['c2', 'ordinary'],
    ['c2', 'fire-drill'],
  ] as const)('re-derives %s/%s, first crowd, from the run', (contractId, wrinkleId) => {
    const row = CENSUS.cells[`${contractId}/${wrinkleId}`]?.[0];
    if (row === undefined) throw new Error('no row');
    const day = censusDayOf(contractId, wrinkleId, DEFAULT_DISPATCHER, censusSeedAt(0));
    expect({
      clearsDefault: day.clears,
      delivered: day.delivered,
      abandoned: day.abandoned,
      failing: day.failing,
    }).toEqual({
      clearsDefault: row.clearsDefault,
      delivered: row.delivered,
      abandoned: row.abandoned,
      failing: row.failing,
    });
  });
});
