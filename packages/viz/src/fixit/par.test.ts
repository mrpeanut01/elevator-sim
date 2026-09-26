/**
 * **A fixed case's par** — `fixit/par.ts`, [§ D1184](../../../../DECISIONS.md).
 *
 * Always on, simulating nothing but one case: every offered case has a par row, a par sits only
 * where the census found a clearing route, and the line says *we tried*, names the forty-nine
 * mornings, gives both prices and says it pays nothing. `routeCensus.sweep.test.ts` re-derives every
 * row in the deep tier; this re-derives the one whose census and par cost least (about a second on
 * the lane's container), so a moved price or judge reds on every pull request somewhere.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { isOffered } from './held.js';
import { PAR_MARK_COPY } from '../scenario/par.js';
import { FIXIT_PAR, FIXIT_PAR_COPY, fixitParLineOf, fixitParTagOf } from './par.js';
import { measureFixitPar } from './par.test-helper.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import { ROUTE_CENSUS } from './routeCensus.js';
import { measureRouteCensus } from './routeCensus.test-helper.js';
import type { FixitResources } from './run.js';
import type { FixitCases } from './types.js';

/** The row re-derived always-on: the cheapest to measure, 23 routes on a small building. */
const REDERIVED = 'three-cars-one-cars-work';

let resources: FixitResources;
let cases: FixitCases;

beforeAll(async () => {
  resources = await fixitResourcesFromDisk();
  cases = await shippedFixitCases(resources);
});

describe('every offered case has a par, and it sits where the census found a way through', () => {
  it('has one row per censused case and no other', () => {
    expect(Object.keys(FIXIT_PAR).sort()).toEqual(Object.keys(ROUTE_CENSUS).sort());
    for (const id of Object.keys(FIXIT_PAR)) expect(isOffered(id), id).toBe(true);
  });

  it('prices a par only where a clearing route exists, and judged at most the clearing routes', () => {
    for (const [id, row] of Object.entries(FIXIT_PAR)) {
      const census = ROUTE_CENSUS[id]!;
      if (row.units !== null) expect(census.clearing, id).toBeGreaterThan(0);
      expect(row.judged, id).toBeLessThanOrEqual(census.clearing);
    }
  });

  it(`re-derives ${REDERIVED}'s par through the forty-nine mornings`, () => {
    const entry = cases.cases.find((candidate) => candidate.id === REDERIVED)!;
    const census = measureRouteCensus(entry, resources);
    const par = measureFixitPar(entry, resources, census.clearingRoutes);
    expect({ units: par.units, judged: par.judged }, `par set by ${String(par.label)}`).toEqual(FIXIT_PAR[REDERIVED]);
  });
});

describe('the par line says what it is and pays nothing', () => {
  const priced = Object.entries(FIXIT_PAR).find(([, row]) => row.units !== null && row.units > 0);
  const free = Object.entries(FIXIT_PAR).find(([, row]) => row.units === 0);

  it('names the sample and the judge, and never claims the cheapest possible', () => {
    expect(priced, 'no case has a priced par, so the comparison arms are untested').toBeDefined();
    const [id, row] = priced!;
    for (const spent of [row.units! - 1, row.units!, row.units! + 3]) {
      const line = fixitParLineOf(id, spent)!;
      expect(line).toContain('The cheapest change we tried that fixes this letter');
      expect(line).toContain('the same forty-nine mornings');
      expect(line).toContain(FIXIT_PAR_COPY.pays);
      expect(line).not.toMatch(/the cheapest (possible|change that|fix\b)/iu);
    }
    expect(fixitParLineOf(id, row.units! - 1)).toContain(FIXIT_PAR_COPY.under);
    expect(fixitParLineOf(id, row.units!)).toContain(FIXIT_PAR_COPY.same);
    expect(fixitParLineOf(id, row.units! + 3)).toContain(`Yours cost ${String(row.units! + 3)} units.`);
  });

  /*
   * § D1234: a free fix beside a free par is not compared, because every fix that buys nothing
   * would match it. A dearer fix still reads the line, since a free way through is news to it.
   */
  it('draws no par where a free fix meets a free par, and says a free par to a dearer fix', () => {
    expect(free, 'no case has a free par').toBeDefined();
    expect(fixitParLineOf(free![0], 0)).toBeUndefined();
    expect(fixitParTagOf(free![0], 0)).toBeUndefined();
    const dearer = fixitParLineOf(free![0], 2)!;
    expect(dearer).toContain('cost 0 units. Yours cost 2 units.');
    expect(dearer).not.toMatch(/\b(?:At|Under) par\b/u);
    expect(fixitParTagOf(free![0], 2)).toBe('par 0 u · yours 2 u');
    expect(fixitParLineOf(free![0], undefined)).toContain('cost 0 units.');
  });

  it('marks a fix at par or under it, pays nothing for either, and marks nothing above it', () => {
    const [id, row] = priced!;
    const units = row.units!;
    expect(fixitParLineOf(id, units)!.startsWith(PAR_MARK_COPY.at)).toBe(true);
    expect(fixitParLineOf(id, units - 1)!.startsWith(PAR_MARK_COPY.under)).toBe(true);
    expect(fixitParLineOf(id, units + 1)).not.toMatch(/\b(?:At|Under) par\b/u);
    for (const spent of [units - 1, units]) expect(fixitParLineOf(id, spent)).toContain(FIXIT_PAR_COPY.pays);
    expect(fixitParTagOf(id, units)).toBe(`par ${String(units)} u · yours ${String(units)} u · at par`);
    expect(fixitParTagOf(id, units - 1)).toBe(`par ${String(units)} u · yours ${String(units - 1)} u · under par`);
    expect(fixitParTagOf(id, units + 1)).toBe(`par ${String(units)} u · yours ${String(units + 1)} u`);
  });

  it('draws nothing for a case with no par or no row', () => {
    expect(fixitParLineOf('no-such-case', 0)).toBeUndefined();
    const none = Object.entries(FIXIT_PAR).find(([, row]) => row.units === null);
    if (none !== undefined) expect(fixitParLineOf(none[0], 0)).toBeUndefined();
  });
});

describe('the par after a reload, and on the case list — lane AL-B, seat C D5', () => {
  it('draws the par with no comparison where the fix cost was not kept, and a short form for the list', () => {
    const [id, row] = Object.entries(FIXIT_PAR).find(([, candidate]) => candidate.units !== null && candidate.units > 0)!;
    const unrecorded = fixitParLineOf(id, undefined)!;
    expect(unrecorded).toContain(`cost ${String(row.units)} units.`);
    expect(unrecorded).toContain(FIXIT_PAR_COPY.unrecorded);
    expect(unrecorded).not.toMatch(/Yours cost/);
    expect(fixitParTagOf(id, row.units!)).toBe(`par ${String(row.units)} u · yours ${String(row.units)} u · at par`);
    expect(fixitParTagOf(id, undefined)).toBe(`par ${String(row.units)} u`);
    expect(fixitParTagOf('no-such-case', 0)).toBeUndefined();
  });
});
