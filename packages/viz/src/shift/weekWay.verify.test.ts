/**
 * **The week census, re-checked** — every shipped row of `data/week-way.json` re-run on its held-out
 * crowds, and required to reproduce its verdicts to the crowd. `docs/33` DC-10,
 * [§ D1067](../../../../DECISIONS.md).
 *
 * The census (`weekWay.sweep.test.ts`) is a compute job: it chooses and measures, and a person
 * copies what it wrote into the data. This file is the check on that copy and on everything the
 * copy rests on. A dispatcher profile, a demand template, a rung, a wrinkle or a bar that moves
 * under a row changes some crowd's verdict, and this goes red on the weekly schedule
 * (`.github/workflows/deep-tiers.yml`'s `week-census` job) rather than the brief quoting a figure
 * about a day the product no longer deals. `weekWay.test.ts` re-runs one crowd of one row on every
 * suite run; this is every crowd of every row.
 *
 * Gated on `WEEK_WAY_VERIFY` because it is hundreds of whole authored days. It chooses nothing and
 * writes nothing: a moved verdict is a finding to report, and the remedy is a census re-run, never
 * an edit to the string.
 */

import { describe, expect, it } from 'vitest';

import { WEEK_WAY } from './weekWay.js';
import { crowdSeeds, standingConfig, weekWayCell } from './weekWay.test-helper.js';

describe.runIf(process.env['WEEK_WAY_VERIFY'] === '1')('every census row, re-run on its held-out crowds', () => {
  const seeds = crowdSeeds(WEEK_WAY.protocol.heldOutFrom, WEEK_WAY.protocol.heldOutCount);
  /* `WEEK_WAY_VERIFY_ONLY=c2/4,c3/1` narrows the re-check to named (contract, day) cells, for a spot check by hand. */
  const only = process.env['WEEK_WAY_VERIFY_ONLY']?.split(',');
  const rows = WEEK_WAY.rows.filter(
    (row) => only === undefined || only.includes(`${row.contractId}/${String(row.day)}`),
  );
  for (const row of rows) {
    it(`${row.contractId} day ${String(row.day)} (${row.eventId}) reproduces both verdict strings`, () => {
      const scheduled = row.eventId !== 'ordinary';
      const mark = (cleared: boolean): string => (cleared ? 'C' : 'm');
      const chosen = seeds.map((seed) => mark(weekWayCell(row.contractId, row.day, seed, row.chosen, scheduled).cleared)).join('');
      const standing = seeds
        .map((seed) => mark(weekWayCell(row.contractId, row.day, seed, standingConfig(), scheduled).cleared))
        .join('');
      expect(chosen).toBe(row.chosenVerdicts);
      expect(standing).toBe(row.standingVerdicts);
    });
  }
});
