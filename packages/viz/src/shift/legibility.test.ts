/**
 * The legibility instrument — GitHub issue #354, § D512. The arithmetic on hand-built legs, the
 * two parameters moving the answer, § D266's refused rider, and then a ten-seed slice of the
 * sweep pinned per contract so the table in `legibility.ts` cannot go stale in silence.
 */

import { describe, expect, it } from 'vitest';

import type { VizLeg } from '../contract/types.js';
import { shiftRunConfigOf } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';

import { contractBuildings, contractDayState } from './contractDay.test-helper.js';
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

describe('the sweep, pinned on its first ten seeds per contract', () => {
  it('reproduces the table’s slice: the same seeds, the same band, the same window', () => {
    const resources = contractBuildings();
    const counts: Record<string, number> = {};
    const stretches: Record<string, number[]> = {};
    for (const contract of CONTRACTS) {
      let legible = 0;
      const longest: number[] = [];
      for (let n = 0; n < 10; n += 1) {
        /*
         * **The pair, built together** — GitHub issue #584, § D961. This read
         * `{ ...baseState(), buildingId: contract.buildingId, … }`, whose week stands on `c1`, so
         * `rungFor` returned nothing and every tower was measured as built rather than as its
         * contract hands it over. `contractDayState` refuses a mismatched pair, and it threads
         * `outOfServiceCarIds`, which this call also dropped.
         */
        const plan = shiftRunConfigOf(
          resources,
          contractDayState(contract.id, { seed: 20_260_824n + 7_919n * BigInt(n) }),
        );
        const day = legibilityOf(
          recordRun(plan.config, {
            recordDecisions: false,
            outOfServiceCarIds: plan.outOfServiceCarIds,
          }).recording,
        );
        if (day.legible) legible += 1;
        longest.push(Math.round(day.longestS));
      }
      counts[contract.id] = legible;
      stretches[contract.id] = longest;
    }
    /*
     * The slice, measured 2026-09-06 by `legibility.sweep.test.ts` at LEGIBILITY_SEEDS=10, extended
     * on 2026-09-14 by the two contracts GitHub issues #500 and #501 added, and again on 2026-09-15
     * by the three GitHub issues #424, #425 and #430 added — and a third time the same day by the
     * three GitHub issues #428, #427 and #426 added. **Every earlier row reproduced unchanged** at
     * every budget all three times, so the new keys are the whole of the movement on each wave —
     * which is what says the sweep's own extension did not disturb it.
     *
     * **The three added here do not agree with each other, and that is the finding rather than the
     * extension.** `c16` is ten of ten, `c15` eight, and `c14` **one** — on three towers of the same
     * class within a factor of two in population. Whatever makes a landing hold, it is not how many
     * people the building holds; {@link LEGIBILITY_WINDOW_S}'s docstring carries the fifty-seed
     * figures and declines to offer a mechanism for the spread.
     */
    /*
     * **Re-measured 2026-09-22 with the pair consistent** — GitHub issue #584, § D961. Six of the
     * sixteen keys moved, and they are exactly six of the seven contracts that declare a ladder
     * rung: `c2` 10 → **7**, `c6` 0 → **2**, `c7` 8 → **7**, `c8` 0 → **2**, `c9` 10 → **1** and
     * `c10` 2 → **7**. The seventh rung-bearing contract, `c3`, is unmoved at 2, because its rung
     * declares the rate its profile already runs — which is the control this re-measurement needed
     * and did not have to arrange. The nine contracts handed over as built are unmoved to the
     * second, counts and per-seed stretches alike.
     */
    expect(counts).toEqual({
      c1: 0, c2: 7, c3: 2, c4: 6, c5: 8, c6: 2, c7: 7, c8: 2, c9: 1, c10: 7,
      c11: 10, c12: 10, c13: 10, c14: 1, c15: 8, c16: 10,
    });
    expect(stretches['c1']).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(stretches['c3']).toEqual([163, 72, 143, 65, 77, 90, 103, 106, 97, 51]);
    expect(stretches['c6']).toEqual([57, 52, 130, 186, 112, 116, 47, 106, 91, 92]);
    expect(stretches['c8']).toEqual([52, 47, 20, 88, 39, 48, 134, 145, 40, 79]);
    // **These two changed places on 2026-09-22 and the pair is pinned for that reason.** As built,
    // Harbour Point held a landing past the band for most of the day on every seed and Ashgate did
    // it on two of ten. Let at the three fifths its own contract declares, Harbour Point holds one
    // on **one** seed of ten; Ashgate, at the rate its contract declares, holds one on **seven**.
    // The old reading — a crowd that cannot be cleared against a journey that takes two legs — was
    // taken on a tower nobody is handed.
    expect(stretches['c9']).toEqual([109, 54, 42, 98, 158, 102, 42, 30, 31, 68]);
    expect(stretches['c10']).toEqual([161, 106, 37, 693, 229, 310, 196, 101, 284, 122]);
    // Midtown Office at 0.395 occupancy, which is its own rung: seven of ten rather than ten, and
    // the three that miss are 96, 84 and 84 s — held landings that do not reach the window, not
    // quiet days. Pinned because this is the contract whose figure moved furthest.
    expect(stretches['c2']).toEqual([390, 96, 84, 385, 413, 495, 84, 207, 479, 153]);
    expect(stretches['c7']).toEqual([91, 243, 104, 208, 261, 68, 238, 180, 190, 123]);
    // One WTC is the first supertall this slice has found below the window on nine seeds of ten —
    // one landing reaches 128 s and the rest never hold anybody a full two minutes. Empire State is
    // above it on eight, and the two seeds it misses on (115 s and 99 s) are the ones worth pinning:
    // they are near misses rather than quiet days, so a change to the bands would move them first.
    //
    // **`c15` was re-measured on 2026-09-15** when GitHub issue #45's ladder moved two of its banks
    // from 6.1 m/s to 6.0 (§ D600): eight of its ten stretches moved and the count did not, which is
    // what a timing change looks like against a threshold nobody crossed. **`c14` is unmoved** —
    // One WTC's speeds were already on the ladder — and that contrast is why both are pinned here.
    expect(stretches['c14']).toEqual([11, 1, 14, 28, 16, 128, 76, 6, 91, 0]);
    expect(stretches['c15']).toEqual([644, 601, 199, 568, 115, 738, 647, 99, 219, 683]);
  /*
   * **Thirteen contracts × ten seeds, and three of the thirteen are supertalls** — GitHub issues
   * #425, #424 and #430. This slice cost well inside 300 000 ms while the ladder was ten mid-rise
   * towers; measured on this tree it is about 200 s alone and **629 s under a full
   * `--project viz` run** at load average 27, so it failed on the budget rather than on the slice
   * and named a case that says nothing about legibility.
   *
   * Annotated rather than sampled down. The ten seeds are the published sweep's own first ten, which
   * is what makes this a *slice* of the fifty-seed table rather than a second measurement; taking
   * five would leave the constant beside {@link LEGIBILITY_WINDOW_S} pinned by half of what it
   * claims. `vitest.config.ts`'s rule is that a site that knows it runs a simulation may say so.
   *
   * **900 000 → 1 800 000 on 2026-09-15** — GitHub issues #428, #427 and #426 take the ladder to
   * **sixteen** contracts, six of them supertalls, and this slice **timed out at 900 000 ms** on
   * the tree that added them. Raised on the commit that made the tree exceed it, which is what the
   * ratchet's own message asks for, and the ratchet's sum is re-derived on the same commit.
   *
   * **The raise was made on a contended box and the clean figure was taken afterwards**, which is
   * the order worth recording rather than hiding. The timeout that forced it happened at load
   * average 25–31 with three sibling suites running, so no per-case cost could honestly be quoted
   * from it. **Measured alone on a quiet box afterwards: 324 s** — a **5.6×** margin against
   * 1 800 000 ms, and only **2.8×** against the 900 000 ms it replaced, where `vitest.config.ts`'s
   * own table targets roughly 4.5×. So the raise is justified by the margin rather than by the
   * timeout: the slice is **not** slow in itself, it was slow in company, and 900 s never had the
   * headroom this suite is supposed to carry.
   */
  }, 1_800_000);
});
