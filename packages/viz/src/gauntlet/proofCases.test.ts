/**
 * **One list, and every reader derives from it** — `ENGINE_CONTRACT.md` § 12.3, held both ways.
 *
 * The headline case is {@link https://example.invalid | the negative one}: no module that reads the
 * forty may contain a tower name, a tower id or a crowd label **as a value**. § 12.3's rule is *one
 * list, three readers*, and the failure it guards against is not a missing list — it is a second
 * one, written by a builder who assumed *"the eight buildings"* and produced a set that disagrees
 * with `data/`. `benchmark/matrixCells.ts`' docstring records exactly that happening before.
 *
 * The scan strips comments first, deliberately: a docstring may **discuss** Garden Apartments — the
 * gauntlet's own cost argument cites § 1.4's measured 181 ms on it — and a `.ts` file may not
 * **hold** the name. Prose about the data is not a copy of the data.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';

import { whatAreTheFortyOf } from './ladder.js';
import {
  parseProofCases,
  proofCaseRequestOf,
  proofCasesOf,
  proofSeedOf,
  ProofCaseError,
  type ProofCaseSet,
} from './proofCases.js';

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

const BUILDINGS = readdirSync(join(DATA_DIR, 'buildings'))
  .filter((name) => name.endsWith('.json'))
  .map((name) => read(join(DATA_DIR, 'buildings', name)) as { id: string; name: string });

const BUILDING_IDS = new Set(BUILDINGS.map((building) => building.id));

const RAW = read(join(DATA_DIR, 'proof-cases.json'));
const SET: ProofCaseSet = parseProofCases(RAW, { buildingIds: BUILDING_IDS });

describe('the forty, as data', () => {
  it('is eight towers × five crowd shapes, and the forty are derived from the two', () => {
    /*
     * The count is asserted here rather than in the parser, for the reason the parser's docstring
     * gives: a `40` written into the code would be the second copy of the list, disagreeing with
     * `data/` the day somebody authors a ninth building. This is the one place the contract's own
     * arithmetic is checked against the file.
     */
    expect(SET.towers).toHaveLength(8);
    expect(SET.crowds).toHaveLength(5);
    expect(proofCasesOf(SET)).toHaveLength(40);
  });

  it('names only buildings this build ships — a case that cannot run is not a case', () => {
    for (const tower of SET.towers) expect(BUILDING_IDS.has(tower.id)).toBe(true);
  });

  it('gives every case a distinct id and a distinct seed within its tower', () => {
    const cases = proofCasesOf(SET);
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);
    expect(new Set(cases.map((entry) => entry.seed)).size).toBe(cases.length);
  });

  it('runs each tower with all five crowds together, in file order', () => {
    const cases = proofCasesOf(SET);
    expect(cases.slice(0, 5).map((entry) => entry.tower.id)).toEqual(
      Array.from({ length: 5 }, () => SET.towers[0]?.id),
    );
    expect(cases.slice(0, 5).map((entry) => entry.crowd.id)).toEqual(
      SET.crowds.map((crowd) => crowd.id),
    );
  });
});

describe('the seed rule — § 1, fixed forever', () => {
  /*
   * Written out rather than computed, and the values are the point: changing `proofSeedOf` changes
   * every case's crowd and silently invalidates every rating ever published. A test that recomputed
   * the hash would agree with any hash.
   */
  it('is hash(towerId, crowdIndex), pinned', () => {
    expect(proofSeedOf('chancery-house', 0)).toBe('2416592418');
    expect(proofSeedOf('chancery-house', 1)).toBe('2433370037');
    expect(proofSeedOf('vertical-city', 0)).toBe('2602296246');
  });

  it('separates neighbouring towers rather than stepping one generator through them', () => {
    const first = Number(proofSeedOf('midtown-office', 0));
    const second = Number(proofSeedOf('midtown-office', 1));
    expect(Math.abs(first - second)).toBeGreaterThan(1000);
  });

  it('is what every case carries — invariant 5, so a case replays exactly', () => {
    for (const entry of proofCasesOf(SET)) {
      expect(entry.seed).toBe(proofSeedOf(entry.tower.id, entry.crowdIndex));
    }
  });
});

describe('a case as a batch request', () => {
  const [first] = proofCasesOf(SET);

  it('carries the tower’s building and level and the crowd’s horizon and shape', () => {
    if (first === undefined) throw new Error('no proof cases');
    const request = proofCaseRequestOf(first, [{ armId: 'a', dispatcherProfileId: 'eta' }], 1);
    expect(request.buildingId).toBe(first.tower.id);
    expect(request.durationS).toBe(first.crowd.durationS);
    expect(request.seed).toBe(first.seed);
    expect(request.demand?.arrivalRatePctPop5min).toBe(first.tower.arrivalRatePctPop5min);
    expect(request.demand?.directionalSplit).toEqual(first.crowd.demand.directionalSplit);
  });

  it('never sets the level twice — `runBatch` refuses the combination by name', () => {
    if (first === undefined) throw new Error('no proof cases');
    const request = proofCaseRequestOf(first, [{ armId: 'a', dispatcherProfileId: 'eta' }], 1);
    expect(request.arrivalRatePctPop5min).toBeNull();
    expect(request.demandLevel).toBeUndefined();
  });

  it('reports every case over the whole run, so forty figures share one label', () => {
    for (const entry of proofCasesOf(SET)) {
      expect(
        proofCaseRequestOf(entry, [{ armId: 'a', dispatcherProfileId: 'eta' }], 1).reportWindow,
      ).toBe('full-run');
    }
  });

  it('makes each crowd a different population — the shapes are not a label on one run', () => {
    const splits = SET.crowds.map((crowd) => JSON.stringify(crowd.demand.directionalSplit));
    expect(new Set(splits).size).toBe(SET.crowds.length);
  });
});

describe('the parse refuses rather than repairs', () => {
  const good = RAW as Record<string, unknown>;

  it('refuses a tower this build does not ship — a rating over thirty-nine is not a rating', () => {
    expect(() =>
      parseProofCases(
        { ...good, towers: [{ id: 'harbour-point', arrivalRatePctPop5min: 2, why: 'x' }] },
        { buildingIds: BUILDING_IDS },
      ),
    ).toThrow(ProofCaseError);
  });

  it('refuses a duplicated tower — the cross product would run one case under two names', () => {
    const tower = (good['towers'] as readonly unknown[])[0];
    expect(() =>
      parseProofCases({ ...good, towers: [tower, tower] }, { buildingIds: BUILDING_IDS }),
    ).toThrow(/appears twice/);
  });

  it('refuses an empty side — every rating would be a mean of nothing', () => {
    expect(() => parseProofCases({ ...good, crowds: [] }, { buildingIds: BUILDING_IDS })).toThrow(
      /at least one tower and one crowd/,
    );
  });

  it('refuses a version it does not read', () => {
    expect(() => parseProofCases({ ...good, version: 2 }, { buildingIds: BUILDING_IDS })).toThrow(
      /version 2/,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The headline: one list, and no second copy of it
 * -------------------------------------------------------------------------- */

/** Comments stripped, so prose about the data is not mistaken for a copy of it. */
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * Every module that reads the forty, and therefore every module that could hold a second copy.
 *
 * The list is the readers § 12.3 names — the gauntlet, the ladder's panel and the screen that draws
 * both — plus the sweep that renders them, which is inside the scope for the reason its own
 * placeholder labels are `⟨…⟩`: a corpus adapter that seeded a shipped crowd label would be the
 * second copy in the file that checks for one.
 */
const READERS: readonly string[] = [
  'gauntlet/proofCases.ts',
  'gauntlet/ladder.ts',
  'gauntlet/rating.ts',
  'gauntlet/run.ts',
  'everyday/boardScreen.ts',
  'batch/suite.ts',
];

describe('one list, three readers — no reader holds a name of its own', () => {
  const names = SET.towers.map(
    (tower) => BUILDINGS.find((building) => building.id === tower.id)?.name ?? tower.id,
  );
  const labels = SET.crowds.map((crowd) => crowd.label);

  for (const reader of READERS) {
    it(`${reader} holds no tower name, tower id or crowd label as a value`, () => {
      const code = codeOf(join(import.meta.dirname, '..', reader));
      for (const name of [...names, ...labels]) expect(code).not.toContain(name);
      for (const tower of SET.towers) expect(code).not.toContain(`'${tower.id}'`);
      for (const crowd of SET.crowds) expect(code).not.toContain(`'${crowd.id}'`);
    });
  }

  it('the disclosure names every tower and every shape — generated, in both directions', () => {
    const view = whatAreTheFortyOf(SET, (towerId) => ({
      name: BUILDINGS.find((building) => building.id === towerId)?.name ?? towerId,
      spec: '⟨spec⟩',
    }));
    expect(view.towers.map((tower) => tower.name)).toEqual(names);
    expect(view.towers.map((tower) => tower.why)).toEqual(SET.towers.map((tower) => tower.why));
    expect(view.crowds.map((crowd) => crowd.label)).toEqual(labels);
    expect(view.crowds.map((crowd) => crowd.tests)).toEqual(SET.crowds.map((crowd) => crowd.tests));
  });

  it('closes with the arithmetic it actually has, not with the words eight and five', () => {
    expect(view4x3().arithmetic).toContain('4 buildings × 3 crowd shapes = 12 runs');
    expect(view4x3().arithmetic).toContain('the mean of all 12');
  });
});

/** A set that is deliberately not eight by five, so the arithmetic cannot be a coincidence. */
function view4x3(): ReturnType<typeof whatAreTheFortyOf> {
  const towers = SET.towers.slice(0, 4);
  const crowds = SET.crowds.slice(0, 3);
  return whatAreTheFortyOf({ version: 1, towers, crowds }, () => ({
    name: '⟨tower⟩',
    spec: '⟨spec⟩',
  }));
}
