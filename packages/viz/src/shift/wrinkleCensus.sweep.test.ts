/**
 * **The whole-day wrinkle census** — [§ D1057](../../../../DECISIONS.md) clause 5.
 *
 * Every wrinkle that is spliced as an episode on a whole day, run on whole-day towers over a small
 * crowd set, beside the same tower's **unwrinkled** day (`ordinary`) on the **same crowds** — common
 * random numbers: the seed is the crowd, and nothing but the wrinkle differs between the two arms.
 * Per tower, wrinkle and crowd it writes one row:
 *
 * - `clearsDefault` — the day clears under the default standing order,
 *   `wrinkleCensus.test-helper.ts#DEFAULT_DISPATCHER`, with no press;
 * - `clearsAny` — **some** shipped standing order clears it with no press (the best standing order
 *   for that crowd), searched in file order and stopped at the first that clears, which is why no
 *   single best dispatcher is named;
 * - `delivered` and `abandoned` under the default order — `CLAUDE.md` § Statistical discipline: an
 *   episode that improves a wait by driving riders away has not improved anything, so the two sit
 *   beside the verdicts.
 *
 * A day **clears** when every `goalsForDay(1, 'whole-day')` reading is `met` — `shift/week.ts`'s own
 * rule. Day 1, so the week's growth is out of the comparison (lane AJ-C is rebalancing it in the
 * same wave); the rung's fabric and booked car are in, because they are the tower the player is
 * handed. The wrinkle is forced with `campaignEventId` at its template's first axis values, which is
 * how `eventById` resolves an id.
 *
 * Env-gated (`WRINKLE_CENSUS=1`, `WRINKLE_CENSUS_OUT`, optional `WRINKLE_CENSUS_ONLY` naming
 * contracts and `WRINKLE_CENSUS_CROWDS`); it writes JSON because vitest intercepts `console.log`,
 * and resumes a partial file. `wrinkleCensus.test.ts` re-derives a sample of what
 * `data/wrinkle-census.json` holds on every run.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CENSUS_CONTRACTS,
  CENSUS_DISPATCHERS,
  CENSUS_WRINKLES,
  DEFAULT_DISPATCHER,
  censusDayOf,
  censusSeedAt,
  type CensusRow,
} from './wrinkleCensus.test-helper.js';

describe.runIf(process.env['WRINKLE_CENSUS'] === '1')('the whole-day wrinkle census', () => {
  it('writes clears per spliced wrinkle, tower and crowd, beside the unwrinkled day', () => {
    const out = process.env['WRINKLE_CENSUS_OUT'];
    expect(out, 'WRINKLE_CENSUS_OUT names the file the census is written to').toBeTypeOf('string');
    const crowds = Number(process.env['WRINKLE_CENSUS_CROWDS'] ?? '4');
    const only = process.env['WRINKLE_CENSUS_ONLY']?.split(',');
    const contracts =
      only === undefined ? CENSUS_CONTRACTS : CENSUS_CONTRACTS.filter((id) => only.includes(id));
    const previous = existsSync(String(out))
      ? (JSON.parse(readFileSync(String(out), 'utf8')) as { cells: Record<string, CensusRow[]> })
      : { cells: {} };
    const cells: Record<string, CensusRow[]> = { ...previous.cells };
    for (const contractId of contracts) {
      for (const wrinkleId of CENSUS_WRINKLES) {
        const key = `${contractId}/${wrinkleId}`;
        if (cells[key]?.length === crowds) continue;
        const rows: CensusRow[] = [];
        for (let n = 0; n < crowds; n += 1) {
          const seed = censusSeedAt(n);
          const standing = censusDayOf(contractId, wrinkleId, DEFAULT_DISPATCHER, seed);
          let clearsAny = standing.clears;
          for (const dispatcherId of CENSUS_DISPATCHERS) {
            if (clearsAny) break;
            if (dispatcherId === DEFAULT_DISPATCHER) continue;
            clearsAny = censusDayOf(contractId, wrinkleId, dispatcherId, seed).clears;
          }
          rows.push({
            n,
            clearsDefault: standing.clears,
            clearsAny,
            delivered: standing.delivered,
            abandoned: standing.abandoned,
            failing: standing.failing,
          });
        }
        cells[key] = rows;
        writeFileSync(
          String(out),
          `${JSON.stringify({ crowds, defaultDispatcher: DEFAULT_DISPATCHER, cells }, null, 2)}\n`,
        );
      }
    }
  }, 21_600_000);
});
