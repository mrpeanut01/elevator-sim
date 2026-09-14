/**
 * The legibility instrument — GitHub issue #354, § D512. The arithmetic on hand-built legs, the
 * two parameters moving the answer, § D266's refused rider, and then a ten-seed slice of the
 * sweep pinned per contract so the table in `legibility.ts` cannot go stale in silence.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseBuilding, resolveBuilding } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import type { VizLeg } from '../contract/types.js';
import type { BrowserResources } from '../dev/data.js';
import { shiftLengthForContract, shiftRunConfigOf } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';

import { CONTRACTS } from './contracts.js';
import { LEGIBILITY_WINDOW_S, legibilityBandFromS, legibilityOf } from './legibility.js';

function leg(over: Partial<VizLeg> & Pick<VizLeg, 'passengerId' | 'arrivedAt'>): VizLeg {
  return {
    originFloorId: 'L',
    destinationFloorId: '5',
    direction: 'up',
    legIndex: 0,
    finalDestinationFloorId: '5',
    ...over,
  };
}

describe('the arithmetic', () => {
  it('reads the third band off WAIT_BANDS and the window off the constant', () => {
    expect(legibilityBandFromS()).toBe(60);
    expect(LEGIBILITY_WINDOW_S).toBe(120);
  });

  it('unions the legs on a landing and takes the longest contiguous stretch', () => {
    /* Three riders on L: waits of 200, 100 and 30 s, overlapping in two stretches. */
    const legs = [
      leg({ passengerId: 'a', arrivedAt: 0, boardedAt: 200 }),
      leg({ passengerId: 'b', arrivedAt: 150, boardedAt: 250 }),
      leg({ passengerId: 'c', arrivedAt: 400, boardedAt: 430 }),
      leg({ passengerId: 'd', arrivedAt: 500, originFloorId: '3' }),
    ];
    const day = legibilityOf({ legs, endedAt: 700 });
    /* a: [60, 200), b: [210, 250) — not contiguous; d never boarded: [560, 700) on floor 3. */
    /* Equal longest stretches sort by floor id, so `3` comes before `L`. */
    expect(day.landings.map((landing) => [landing.floorId, landing.longestS, landing.totalS])).toEqual([
      ['3', 140, 140],
      ['L', 140, 180],
    ]);
    expect(day.longestS).toBe(140);
    expect(day.legible).toBe(true);
    expect(legibilityOf({ legs, endedAt: 700 }, { windowS: 141 }).legible).toBe(false);
    expect(legibilityOf({ legs, endedAt: 700 }, { bandFromS: 120 }).longestS).toBe(80);
  });

  it('does not count a rider the building turned away — § D266', () => {
    const legs = [leg({ passengerId: 'r', arrivedAt: 0, refusedAt: 0 })];
    expect(legibilityOf({ legs, endedAt: 700 }).landings).toEqual([]);
  });
});

/** Every shipped building, resolved through the loader `probes.test-helper.ts` uses for its two. */
function allBuildings(): BrowserResources {
  const entries = CONTRACTS.map((contract) => {
    const config = parseBuilding(JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${contract.buildingId}.json`), 'utf8')));
    return { file: `${contract.buildingId}.json`, config, resolved: resolveBuilding(config, RESOURCES.elevatorSpecs) };
  });
  return { ...RESOURCES, buildings: entries.map((entry) => entry.resolved), entries };
}

describe('the sweep, pinned on its first ten seeds per contract', () => {
  it('reproduces the table’s slice: the same seeds, the same band, the same window', () => {
    const resources = allBuildings();
    const counts: Record<string, number> = {};
    const stretches: Record<string, number[]> = {};
    for (const contract of CONTRACTS) {
      let legible = 0;
      const longest: number[] = [];
      for (let n = 0; n < 10; n += 1) {
        const plan = shiftRunConfigOf(resources, {
          ...baseState(),
          buildingId: contract.buildingId,
          dispatcherId: 'collective',
          shiftLengthS: shiftLengthForContract(contract.id),
          seed: 20_260_824n + 7_919n * BigInt(n),
          campaignEventId: 'ordinary',
        });
        const day = legibilityOf(recordRun(plan.config, { recordDecisions: false }).recording);
        if (day.legible) legible += 1;
        longest.push(Math.round(day.longestS));
      }
      counts[contract.id] = legible;
      stretches[contract.id] = longest;
    }
    /*
     * The slice, measured 2026-09-06 by `legibility.sweep.test.ts` at LEGIBILITY_SEEDS=10, and
     * extended on 2026-09-14 by the two contracts GitHub issues #500 and #501 added. **The eight
     * original rows reproduced unchanged** at both budgets, so the two new keys are the whole of
     * the movement — which is what says the sweep's own extension did not disturb it.
     */
    expect(counts).toEqual({ c1: 0, c2: 10, c3: 2, c4: 6, c5: 8, c6: 0, c7: 8, c8: 0, c9: 10, c10: 2 });
    expect(stretches['c1']).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(stretches['c3']).toEqual([163, 72, 143, 65, 77, 90, 103, 106, 97, 51]);
    expect(stretches['c6']).toEqual([0, 0, 60, 0, 28, 69, 10, 3, 70, 19]);
    expect(stretches['c8']).toEqual([35, 8, 18, 38, 31, 35, 36, 91, 19, 42]);
    // Harbour Point holds a landing past the band for most of the day on every seed; Ashgate does
    // it on two of ten, which is the difference between a crowd that cannot be cleared and a
    // journey that takes two legs.
    expect(stretches['c9']).toEqual([1026, 1373, 1665, 1255, 1321, 1474, 1462, 1512, 1126, 1133]);
    expect(stretches['c10']).toEqual([121, 73, 68, 104, 57, 67, 95, 76, 276, 61]);
  }, 300_000);
});
