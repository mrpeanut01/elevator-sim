/**
 * **The route census reproduces, every offered case** — [§ D1120](../../../../DECISIONS.md) clause 1.
 *
 * `routeCensus.test.ts` re-derives, always-on, the rows that **open** a case with its diagnosis shown
 * (the rows whose count binds what a player sees). This file re-derives every row, and it is what
 * produced `fixit/routeCensus.ts#ROUTE_CENSUS`. The player's decision member (S1) measured the first
 * census on `e00c0f6` in 721 s of one vitest process; most of that is `vertical-city`'s two cases at
 * about a second a pair over two hundred-odd routes each.
 *
 * **It also re-derives each case's par** ([§ D1184](../../../../DECISIONS.md), `fixit/par.ts#FIXIT_PAR`):
 * the clearing routes it has just found, cheapest first, through the forty-nine derived mornings until
 * one holds (`par.test-helper.ts`). The census already paid for the gate runs, so the par costs only
 * the judged routes' mornings, and one job keeps the two tables from drifting apart.
 *
 * Gated on `ELEVATOR_SIM_FIXIT_ROUTES=deep`, a nightly job of its own on `deep-tiers.yml`'s
 * argument for one job per tier. Set `FIXIT_ROUTES_OUT` to a path to have the measured table written
 * there as JSON as each case lands, which is how the tables are refreshed: paste them, never edit
 * them.
 */

import { writeFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isOffered } from './held.js';
import { FIXIT_PAR } from './par.js';
import { measureFixitPar, type MeasuredPar } from './par.test-helper.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import { ROUTE_CENSUS, type RouteCensusRow } from './routeCensus.js';
import { measureRouteCensus } from './routeCensus.test-helper.js';
import type { FixitResources } from './run.js';
import type { FixitCases } from './types.js';

const OPEN = process.env['ELEVATOR_SIM_FIXIT_ROUTES'] === 'deep';
const OUT = process.env['FIXIT_ROUTES_OUT'];

describe.skipIf(!OPEN)('the route census reproduces on every offered case — § D1120 clause 1', () => {
  let resources: FixitResources;
  let cases: FixitCases;
  const measured: Record<
    string,
    RouteCensusRow & { readonly clearingLabels: readonly string[]; par?: MeasuredPar }
  > = {};

  beforeAll(async () => {
    resources = await fixitResourcesFromDisk();
    cases = await shippedFixitCases(resources);
  });

  afterAll(() => {
    if (OUT !== undefined) writeFileSync(OUT, JSON.stringify(measured, null, 1));
  });

  it.each(Object.keys(ROUTE_CENSUS))('%s', (caseId) => {
    const entry = cases.cases.find((candidate) => candidate.id === caseId)!;
    expect(isOffered(caseId), `${caseId} is in the census and is not offered`).toBe(true);
    const t0 = Date.now();
    const row = measureRouteCensus(entry, resources);
    const par = measureFixitPar(entry, resources, row.clearingRoutes);
    measured[caseId] = { routes: row.routes, clearing: row.clearing, clearingLabels: row.clearingLabels, par };
    if (OUT !== undefined) writeFileSync(OUT, JSON.stringify(measured, null, 1));
    process.stderr.write(
      `${caseId}: ${String(row.clearing)}/${String(row.routes)} clear, par ${String(par.units)} (${String(par.label)}, ` +
        `${String(par.judged)} judged) in ${String(Math.round((Date.now() - t0) / 1000))} s\n`,
    );
    expect({ routes: row.routes, clearing: row.clearing }, `${caseId}: cleared on ${row.clearingLabels.join(', ')}`).toEqual(
      ROUTE_CENSUS[caseId],
    );
    expect({ units: par.units, judged: par.judged }, `${caseId}: par set by ${String(par.label)}`).toEqual(FIXIT_PAR[caseId]);
  });
});
