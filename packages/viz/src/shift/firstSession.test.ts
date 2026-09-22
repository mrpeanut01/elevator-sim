/**
 * The first session's draw — GitHub issue #208's code half, § D475, § D512, § D514.
 *
 * Three of the issue's four criteria are properties of the run and are held here; the fourth, ten
 * first-time testers, is not a property of code (§ D349). AC1 and AC2 — a building visibly failing
 * inside ninety seconds, legible on the stage before the report — are the legibility instrument's
 * own question asked of every member of the drawn set, on `legibility.test.ts`'s pinned seeds; AC3,
 * one change that measurably helped, is the report's lever path, which `campaign/works.test.ts` and
 * `dev/reportPanel` already pin on the legs and is not re-pinned here.
 */

import { describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';
import { RESOURCES } from '../scope/probes.test-helper.js';
import { initialState, shiftLengthForContract, shiftRunConfigOf, withFirstSession } from '../dev/state.js';

import { contractBuildings, contractDayState } from './contractDay.test-helper.js';

import { CONTRACTS, FIRST_CONTRACT_ID, contractById } from './contracts.js';
import {
  ELIGIBLE_FIRST_CONTRACT_IDS,
  FIRST_SESSION_LINE,
  FIRST_SESSION_STREAM,
  LEGIBILITY_SWEEP_N,
  firstSessionContractFor,
  isFirstDayOnALegibleTower,
} from './firstSession.js';
import { LEGIBILITY_SWEEP, legibilityOf } from './legibility.js';
import { openWeek } from './week.js';

describe('the eligible set — § D512’s table read by arithmetic', () => {
  it('is every contract legible on more than a third of fifty seeds, in contract order', () => {
    /*
     * **`c9` joined on 2026-09-14** — GitHub issue #500. Harbour Point is legible on 50 of 50 at a
     * median 1 343 s, the second-most legible tower in the catalogue, because the group cannot
     * clear its crowd. `c10` (Ashgate) did **not** join: 10 of 50, below the threshold, because its
     * problem is a second leg rather than a held landing. Both are the table's reading rather than
     * a choice, and this list is derived from it.
     *
     * **`c11`, `c12` and `c13` joined on 2026-09-15** — GitHub issues #425, #424 and #430 — all
     * three at 50 of 50, which takes the set from six to nine and moves
     * {@link FIRST_SESSION_LINE}'s own word with it. **That is not a compliment to those towers.**
     * Legible means *somebody stood past a minute on a landing for two contiguous minutes*, and on a
     * tower of four to eight thousand people that is the building rather than a problem a first
     * session can see and solve: their median stretches are 1 221 s, 729 s and 459 s, and the two
     * towers already at 50 of 50 are the two this table records as legible all day **because the
     * group cannot cope**. The threshold is § D512's reading of its own table and is not moved here;
     * whether a first session should open on a supertall at all is a design question this file
     * cannot answer and does not pretend to.
     */
    /*
     * **`c15` and `c16` joined on 2026-09-15 and `c14` did not** — GitHub issues #427, #426 and
     * #428 — which is the first wave where three towers of one class split across this threshold.
     * Empire-State-class is legible on 45 of 50 at a median 472 s and Willis-class on 50 of 50 at
     * 2 347 s, so both clear it; **One-WTC-class is legible on 1 of 50 at a median 13 s** and is the
     * first supertall this table has found ineligible. The paragraph above reads the three before
     * them as legible *because* they are towers of thousands, and that reading is now refuted as a
     * claim about size: these three span 4 810 to 9 200 occupants and span the whole range the
     * instrument reports. The threshold is still § D512's and is still not moved here.
     */
    /*
     * **`c9` left and `c10` joined on 2026-09-22** — GitHub issue #584,
     * [§ D961](../../../../DECISIONS.md). The sweep this set is derived from had been measuring
     * every tower **as built**: its states paired a contract's `buildingId` with `baseState()`'s
     * `c1` week, and `shift/ladder.ts#rungFor` keys a rung on both, so no rung reached any run.
     * Measured as the contracts hand their towers over, Harbour Point — let at the three fifths its
     * own rung declares — is legible on **11 of 50** rather than 50 and drops below the threshold,
     * and Ashgate, at the rate its rung declares, rises from 10 to **32** and clears it.
     *
     * **The set is the same size and not the same set**, which is the case worth stating out loud:
     * eleven members before and eleven after, so {@link FIRST_SESSION_LINE}'s own count does not
     * move and nothing downstream of the count does either. What moved is which tower a new player
     * can be handed, and Harbour Point — the second-most legible contract in the catalogue by the
     * old table — is now one a first session never opens on.
     */
    /*
     * **The set gains three members on the integrated tree, and its published count moves for the
     * first time since it was derived** — [§ D963](../../../../DECISIONS.md). GitHub issue #587's
     * lane booked a car out of seven contracts' day 1 and rebalanced six of their rungs
     * ([§ D914](../../../../DECISIONS.md)); the sweep above was pinned before that landed. Measured
     * on the merged tree at the same 800-day budget, `c6` goes 14 of 50 → **25**, `c8` **3 → 43**
     * and `c9` 11 → **20**, so all three cross § D512's threshold from below. `c10` stays in at 27.
     *
     * **The threshold is not moved and neither is any rung.** Eleven members → **fourteen**, and
     * only `c1` and `c14` of the sixteen are now out. That does move a player-facing sentence —
     * {@link FIRST_SESSION_LINE} reads *fourteen towers* — and it moves `shift/dailySeed.ts`'s two
     * published rotation figures with it, because those are functions of this set's **length**.
     *
     * **Two long-standing readings stop being true, and they are named rather than dropped.**
     * *Chancery House and St Jude's are legible rarely, which is the same verdict for a first
     * session as never* was measured on days with every car in service. Both now book cars out —
     * St Jude's books two — and both are eligible. A first session can now open on the hospital.
     */
    expect(ELIGIBLE_FIRST_CONTRACT_IDS).toEqual([
      'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'c15', 'c16',
    ]);
    for (const id of ELIGIBLE_FIRST_CONTRACT_IDS) {
      const row = LEGIBILITY_SWEEP.find((entry) => entry.contractId === id);
      expect(row?.legibleOf50 ?? 0).toBeGreaterThan(50 / 3);
    }
    /* The two the instrument still finds never or rarely legible are out, the campaign's opener
     * first. It was five until the rungs moved; `c6`, `c8` and `c9` are in now, and shrinking this
     * list is the measurement rather than a concession — every one of the three is above the
     * threshold § D512 set and nothing here moved that threshold. */
    for (const id of ['c1', 'c14']) expect(ELIGIBLE_FIRST_CONTRACT_IDS).not.toContain(id);
    expect(ELIGIBLE_FIRST_CONTRACT_IDS).not.toContain(FIRST_CONTRACT_ID);
  });

  it('names contracts the product ships, and only those', () => {
    const shipped = new Set(CONTRACTS.map((contract) => contract.id));
    for (const id of ELIGIBLE_FIRST_CONTRACT_IDS) expect(shipped.has(id)).toBe(true);
    expect(new Set(LEGIBILITY_SWEEP.map((row) => row.contractId))).toEqual(shipped);
  });
});

describe('the draw — a named stream off the session’s seed', () => {
  it('is a function of the seed, lands inside the set, and reaches every member', () => {
    expect(FIRST_SESSION_STREAM).toBe('first-session');
    const seen = new Map<string, number>();
    for (let n = 0; n < 2_000; n += 1) {
      const seed = 20_260_906n + 7_919n * BigInt(n);
      const drawn = firstSessionContractFor(seed);
      expect(firstSessionContractFor(seed)).toBe(drawn);
      expect(ELIGIBLE_FIRST_CONTRACT_IDS).toContain(drawn);
      seen.set(drawn, (seen.get(drawn) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual([...ELIGIBLE_FIRST_CONTRACT_IDS].sort());
    /*
     * No member is starved: each lands at least a fifth of its share. The bound is **derived from
     * the set's own size** rather than written as `2 000 / 25`, which was five squared and read as a
     * constant — the set is six now (GitHub issue #500) and a hard-coded denominator would have
     * gone from *a fifth of a share* to *a quarter* without anybody choosing that.
     */
    const share = 2_000 / ELIGIBLE_FIRST_CONTRACT_IDS.length;
    for (const id of ELIGIBLE_FIRST_CONTRACT_IDS) expect(seen.get(id) ?? 0).toBeGreaterThan(share / 5);
  });

  it('opens a fresh week on the drawn contract, and the building follows the week', () => {
    const seed = 424_242n;
    const drawn = withFirstSession(initialState(RESOURCES, seed), RESOURCES);
    const contract = contractById(firstSessionContractFor(seed));
    expect(contract).toBeDefined();
    expect(drawn.week).toEqual(openWeek(contract?.id));
    expect(drawn.buildingId).toBe(contract?.buildingId);
    expect(drawn.shiftLengthS).toBe(shiftLengthForContract(contract?.id ?? ''));
    expect(drawn.parkedWeeks).toEqual([]);
    expect(isFirstDayOnALegibleTower(drawn.week)).toBe(true);
  });
});

describe('the door’s line — derived from the week, never stored', () => {
  it('is true of a first day nobody has played on a legible tower, and of nothing else', () => {
    expect(isFirstDayOnALegibleTower(openWeek('c2'))).toBe(true);
    expect(isFirstDayOnALegibleTower(openWeek('c1'))).toBe(false);
    expect(isFirstDayOnALegibleTower({ ...openWeek('c2'), day: 2 })).toBe(false);
    expect(isFirstDayOnALegibleTower({ ...openWeek('c2'), attempt: 1 })).toBe(false);
    /* Worded to be true however the player arrived: it names the set, not the draw. */
    /*
     * **Both figures are checked against the table rather than against a literal** — GitHub issues
     * #500 and #501. This read `toContain('five towers')` and `toContain('400 days')`, which pinned
     * a sentence that was true of an eight-contract sweep; the sweep is ten now and both numbers
     * moved. A test that asserts the same literal the module authors cannot tell a correct sentence
     * from a stale one, so it asserts the *derivation*: the count is the eligible set's length and
     * the days are `rows × n`. `docs/37` § 6's rule, applied to the check as well as to the string.
     */
    /*
     * **Extended past `ten` on 2026-09-15** (GitHub issues #428, #427 and #426), on the same commit
     * as `firstSession.ts`'s own list and for the same reason: the eligible set reached **eleven**,
     * so `words[11]` was `undefined`, the `?? ''` arm made the assertion read `toContain(' towers')`
     * — which passes on any sentence containing the word — and the non-vacuity bound below caught
     * it. That bound is the whole reason this failed loudly rather than quietly, and it is why the
     * list here is a **second, independent copy** rather than an import: a check that read
     * `NUMBER_WORDS` from the module would agree with a wrong module.
     */
    const words = [
      'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
      'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    ];
    expect(FIRST_SESSION_LINE).toContain(
      `${words[ELIGIBLE_FIRST_CONTRACT_IDS.length] ?? ''} towers`,
    );
    expect(FIRST_SESSION_LINE).toContain(
      `${String(LEGIBILITY_SWEEP.length * LEGIBILITY_SWEEP_N)} days`,
    );
    // Non-vacuity: the set is neither empty nor past the word list, so neither `toContain` above
    // is asserting the presence of a bare ` towers`.
    expect(ELIGIBLE_FIRST_CONTRACT_IDS.length).toBeGreaterThan(1);
    expect(ELIGIBLE_FIRST_CONTRACT_IDS.length).toBeLessThan(words.length);
    expect(FIRST_SESSION_LINE).not.toMatch(/\b(you|your|yours)\b/iu);
  });
});

describe('AC1 and AC2, asked of every member of the set on the pinned seeds', () => {
  it('every eligible contract’s day 1 is legible on most of the first ten seeds, and says when', () => {
    const resources = contractBuildings();
    const legibleAt: Record<string, number[]> = {};
    for (const id of ELIGIBLE_FIRST_CONTRACT_IDS) {
      const contract = contractById(id);
      if (contract === undefined) throw new Error(id);
      const moments: number[] = [];
      for (let n = 0; n < 10; n += 1) {
        /* The pair, built together — GitHub issue #584, § D961; see `contractDay.test-helper.ts`. */
        const state = contractDayState(id, { seed: 20_260_824n + 7_919n * BigInt(n) });
        const plan = shiftRunConfigOf(resources, state);
        const day = legibilityOf(
          recordRun(plan.config, {
            recordDecisions: false,
            outOfServiceCarIds: plan.outOfServiceCarIds,
          }).recording,
        );
        if (day.legible) moments.push(day.legibleAtS ?? -1);
        expect(day.legible).toBe(day.legibleAtS !== undefined);
      }
      legibleAt[id] = moments;
    }
    /*
     * The slice `legibility.test.ts` pins, read for the set: c3 is the two-fifths member, and `c10`
     * replaced `c9` on 2026-09-22 (GitHub issue #584, § D961) when the sweep stopped measuring
     * every tower as built. Ashgate's day 1 holds a landing past the band on seven of the ten
     * pinned seeds at the rate its own rung declares; Harbour Point's, let at the three fifths its
     * rung declares, holds one on **one**, which is why it is no longer in this walk at all.
     *
     * **`c15` and `c16` joined on 2026-09-15** (GitHub issues #427 and #426) at eight and ten of
     * ten. `c14` is absent from this walk because it is absent from the set — One-WTC-class is
     * legible on 1 of 50 and did not clear the threshold — and its absence here is the same
     * measurement the row above records, arriving through the derivation rather than through a
     * second list.
     */
    /*
     * **Re-measured on the integrated tree** — § D963. The walk is three members longer, because
     * `c6`, `c8` and `c9` crossed the threshold when their rungs booked a car out; six of the
     * eleven earlier members moved with their own rungs and five are unmoved. `c9` at **5 of 10**
     * is below half and this case's own heading says *most* — the count is the measurement, and
     * neither it nor the heading is adjusted to flatter the other.
     */
    expect(Object.fromEntries(Object.entries(legibleAt).map(([id, list]) => [id, list.length]))).toEqual({
      c2: 8,
      c3: 7,
      c4: 6,
      c5: 8,
      c6: 6,
      c7: 7,
      c8: 8,
      c9: 5,
      c10: 6,
      c11: 10,
      c12: 10,
      c13: 10,
      c15: 8,
      c16: 10,
    });
    /* AC1's clock: on every legible day the moment is inside the day, and never before the window. */
    for (const [id, list] of Object.entries(legibleAt)) {
      for (const at of list) {
        expect(at).toBeGreaterThanOrEqual(120);
        expect(at).toBeLessThanOrEqual(shiftLengthForContract(id));
      }
    }
  /*
   * **Thirteen contracts × ten seeds, and three of the thirteen are supertalls** — GitHub issues
   * #425, #424 and #430. This slice cost well inside 300 000 ms while the ladder was ten mid-rise
   * towers; measured on this tree it is about 190 s alone and **393 s under a full
   * `--project viz` run** at load average 27, so it failed on the budget rather than on the slice
   * and named a case that says nothing about legibility.
   *
   * Annotated rather than sampled down. The set this walks is derived from the sweep's own table, so
   * dropping seeds or members would make AC1 and AC2 claims about a subset of the eligible set
   * rather than about it. `vitest.config.ts`'s rule is that a site that knows it runs a simulation
   * may say so.
   *
   * **900 000 → 1 800 000 on 2026-09-15** — GitHub issues #427 and #426 put `c15` and `c16` into
   * the eligible set, taking this walk from nine members to **eleven**, two of them supertalls, and
   * it **timed out at 900 000 ms** on the tree that added them. Raised on the commit that made the
   * tree exceed it, with the ratchet's sum re-derived on the same commit.
   *
   * **Measured at 685 s alone earlier the same day** on a box already at load 25, against the old
   * 900 s bound — so the margin was already thin before the two members landed, and a second file
   * running beside it was enough to cross. The figure is quoted as what it is, a loaded-box reading
   * rather than a per-case cost, because attributing seconds to members under that much contention
   * would be arithmetic dressed as a measurement.
   */
  }, 1_800_000);
});
