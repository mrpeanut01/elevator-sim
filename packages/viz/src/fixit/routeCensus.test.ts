/**
 * **The route census covers every offered case, and the rows that open a case are measured on every
 * run** — [§ D1120](../../../../DECISIONS.md) clause 1.
 *
 * The rule the census feeds is a product decision a player sees: a case whose census shows fewer
 * than two routes clearing the letter's morning opens with its diagnosis shown, and its screen says
 * how many routes were tried and how many cleared. Those two figures are printed, so the rows that
 * produce them are re-derived here, always-on, rather than trusted until the nightly job runs.
 * `routeCensus.sweep.test.ts` re-derives the rest.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';

import { isOffered } from './held.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import { DIAGNOSIS_OPEN_BELOW, opensWithDiagnosis, ROUTE_CENSUS, routeCensusOf } from './routeCensus.js';
import { measureRouteCensus } from './routeCensus.test-helper.js';
import type { FixitResources } from './run.js';
import type { FixitCases } from './types.js';

const SUITE_TIMEOUT = 120_000;

let resources: FixitResources;
let cases: FixitCases;

beforeAll(async () => {
  resources = await fixitResourcesFromDisk();
  cases = await shippedFixitCases(resources);
}, SUITE_TIMEOUT);

describe('the route census — § D1120 clause 1', () => {
  it('has a row for exactly the offered cases, and none for a held one', () => {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, 'fixit-cases.json'), 'utf8')) as { cases: { id: string }[] };
    const offered = raw.cases.map((entry) => entry.id).filter((id) => isOffered(id));
    expect(Object.keys(ROUTE_CENSUS).sort()).toEqual([...offered].sort());
    for (const [id, row] of Object.entries(ROUTE_CENSUS)) {
      expect(row.clearing, id).toBeLessThanOrEqual(row.routes);
      expect(row.routes, id).toBeGreaterThan(0);
    }
  });

  it('opens a case with its diagnosis shown exactly where fewer than two routes clear, and at least one does', () => {
    expect(DIAGNOSIS_OPEN_BELOW).toBe(2);
    const opened = Object.keys(ROUTE_CENSUS).filter((id) => opensWithDiagnosis(id));
    for (const id of Object.keys(ROUTE_CENSUS)) {
      expect(opensWithDiagnosis(id), id).toBe(routeCensusOf(id)!.clearing < 2);
    }
    /*
     * Not a list of which — that is the census's to say — but a floor on the rule's reach: withholding
     * every diagnosis is only fair while every other offered case is a search.
     */
    expect(opened.length).toBeLessThan(Object.keys(ROUTE_CENSUS).length);
    expect(opensWithDiagnosis('no-such-case')).toBe(false);
  });

  it(
    'reproduces, on this tree, every row that opens a case with its diagnosis shown',
    () => {
      const opened = Object.keys(ROUTE_CENSUS).filter((id) => opensWithDiagnosis(id));
      for (const id of opened) {
        const entry = cases.cases.find((candidate) => candidate.id === id)!;
        const row = measureRouteCensus(entry, resources);
        expect({ routes: row.routes, clearing: row.clearing }, `${id}: cleared on ${row.clearingLabels.join(', ')}`).toEqual(
          ROUTE_CENSUS[id],
        );
      }
    },
  );
});
