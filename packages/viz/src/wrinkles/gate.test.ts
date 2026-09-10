/**
 * § 17's gate that matters, driven against the shipped library — GitHub issue **#159**.
 *
 * The case that carries this file is the last one: **the gate keeps some days and discards others,
 * over the real library on a real building.** A gate that kept everything and a gate that kept
 * nothing would both pass a suite that only checked it runs, and both would be useless — the first
 * is no gate and the second discards the library. So the sweep asserts both outcomes occur and
 * names every verdict when it fails.
 *
 * The budget is `MIN_REPLICATION_BUDGET`, which the gate enforces rather than accepts. Fifty
 * replications × three arms × two days × thirty-eight wrinkles is a few seconds on Garden
 * Apartments, which is why the sweep is affordable here at all.
 *
 * ## The per-case timeouts this file used to carry, and why it carries none
 *
 * Five cases here were annotated `}, 120_000)`. They were **narrowings**: `vitest.config.ts` gives
 * `viz` `SIMULATING_TIMEOUT_MS`, which is **300 000 ms**, so each annotation cut this file's budget
 * to 40 % of what the project had already derived for exactly this question — *does not fit
 * vitest's default on a loaded machine*.
 *
 * They were also sized against a cost that no longer exists. Measured 2026-09-09 on `main` at load
 * average ~3, `--project viz src/wrinkles/gate.test.ts` costs **24.4 s** over 8 cases, worst case
 * **13.9 s** (twice, ±0.2 %), second worst **4.5–4.8 s**. The figure the annotations were written
 * against — about 200 s for the file — was measured before
 * [#446](https://github.com/mrpeanut01/elevator-sim/pull/446) stopped the sweep re-simulating an
 * identical control day thirty-seven times. The cause was removed; the ceiling was left.
 *
 * **Why the annotations are deleted rather than raised.** A per-case number here would be a second
 * answer to a question `SIMULATING_TIMEOUT_MS` already answers, and its docstring is explicit that
 * the seconds in it are *"a dated record of one machine on one day and deliberately not a budget"*
 * — § D483 measured a sibling leg moving 1.82× on identical work. Inheriting the project constant
 * keeps one answer; annotating keeps two, and the second goes stale exactly the way these did.
 *
 * **Why not make the cases cheaper instead.** The obvious lever is replications, and it is the one
 * lever that is not available: `MIN_REPLICATION_BUDGET` is `CLAUDE.md`'s statistical floor and the
 * gate **refuses** a budget below it — `gate.ts` throws rather than reporting a thin interval, and
 * a case above asserts that refusal. Cutting the sweep's wrinkles or its arms would weaken what it
 * checks rather than what it costs. Nothing here is slow by accident.
 *
 * At 13.9 s the worst case sits **21×** inside the project's 300 s. That clears the 4.5×
 * amplification `vitest.config.ts` measured for `viz` under sixteen spinners — 13.9 × 4.5 ≈ 63 s —
 * by arithmetic on that file's figure rather than on one taken here: fourteen spinners on this
 * machine moved the worst case from 13 908 ms to 13 989 ms, which is 0.6 % and not an
 * amplification, so nothing was learned by trying and the borrowed figure is the honest one to
 * reason from. What produced the original red was six concurrent vitest projects, not spinners.
 *
 * **What removing them costs, stated rather than glossed**, because `vitest.config.ts` states the
 * same trade for the constant these now inherit: a case here that genuinely hangs takes five
 * minutes to fail instead of two. That is worth paying for the same reason it was there — a hang
 * is a bug found once and fixed, and a ceiling that goes red under load is a false failure that
 * recurs forever and teaches people to re-run the suite instead of reading it. It taught exactly
 * that this week: two separate lanes stopped to prove these two files were not their doing.
 */

import { loadConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { MIN_REPLICATION_BUDGET } from '../batch/report.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { baseDemandOf } from '../shift/events.js';
import { everyWrinkle } from './draw.js';
import { WrinkleGateError, gateLibrary, gateWrinkle, type WrinkleGateInput } from './gate.js';
import { WRINKLE_LIBRARY } from './library.js';

/** Garden Apartments: the cheapest shipped building, so the whole library fits in one case. */
const BUILDING_ID = 'garden-apartments';

/** Three shipped dispatchers, which is the smallest set that can shuffle rather than merely swap. */
const DISPATCHERS = ['eta', 'collective', 'nearest-car'] as const;

const SEED = '20260908';

let config: Awaited<ReturnType<typeof loadConfig>>;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
});

function inputFor(wrinkleId: string, overrides: Partial<WrinkleGateInput> = {}): WrinkleGateInput {
  const building = requireBuilding(config, BUILDING_ID);
  const profile = config.trafficProfilesById.get(building.trafficProfile);
  if (profile === undefined) throw new Error(`no traffic profile "${building.trafficProfile}"`);
  const wrinkle = everyWrinkle(WRINKLE_LIBRARY).find((candidate) => candidate.id === wrinkleId);
  if (wrinkle === undefined) throw new Error(`the library has no wrinkle "${wrinkleId}"`);
  return {
    wrinkle,
    buildingId: BUILDING_ID,
    building,
    resources: {
      dispatcherProfiles: config.dispatcherProfiles,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
    },
    dispatcherProfileIds: [...DISPATCHERS],
    seed: SEED,
    durationS: 900,
    replications: MIN_REPLICATION_BUDGET,
    /*
     * `full-run` is what makes the sweep judgeable at all under the gate's complete-case rule.
     * Garden Apartments' residential rate leaves the default peak-5-minute window empty on 2 of 50
     * replications, so every arm reads 48/50 and every day is refused — measured, not assumed.
     * `benchmark/matrixCells.ts` declares the same window on the same building for the same reason.
     */
    reportWindow: 'full-run',
    base: baseDemandOf(profile),
    ...overrides,
  };
}

describe('the gate refuses to run on terms this project would not act on', () => {
  it('refuses a budget below the replication floor, rather than reporting a thin interval', () => {
    /*
     * CLAUDE.md § Statistical discipline: *"Budget 50–200 replications per configuration. Ten is
     * not enough."* A gate that accepted ten would keep days on noise, which is the one thing § 17
     * asks it to prevent — so the floor is a refusal here and not a caller's responsibility.
     */
    expect(() => gateWrinkle(inputFor('ordinary', { replications: 10 }))).toThrow(WrinkleGateError);
    expect(() => gateWrinkle(inputFor('ordinary', { replications: 10 }))).toThrow(
      /below the 50 this project will act on/,
    );
  });

  it('refuses a single dispatcher, because one arm cannot shuffle', () => {
    expect(() => gateWrinkle(inputFor('ordinary', { dispatcherProfileIds: ['eta'] }))).toThrow(
      /at least two/,
    );
  });
});

describe('the gate reads a day the way § 17 asks', () => {
  it('discards a day that leaves the ranking alone, and says it is cosmetic', () => {
    // `ordinary` declares `changesNothing`, so its run **is** the control's. It is the one wrinkle
    // whose verdict is knowable without measuring anything, which makes it the right fixture for
    // the cosmetic branch: if this were ever kept, the gate would be reading noise as a shuffle.
    const verdict = gateWrinkle(inputFor('ordinary'));
    expect(verdict.earnsItsPlace).toBe(false);
    expect(verdict.reason).toMatch(/cosmetic/);
    expect(verdict.swappedPair).toBeNull();
    expect(verdict.estimate).toBeNull();
  });

  it('ranks every arm it was given, and counts what stood behind each mean', () => {
    const verdict = gateWrinkle(inputFor('ordinary'));
    expect(verdict.candidateRanking.map((standing) => standing.armId).sort()).toEqual(
      [...DISPATCHERS].sort(),
    );
    for (const standing of verdict.candidateRanking) {
      // R9's rule, not re-derived here: a replication counts only if its own summary quoted a mean.
      expect(standing.quotable, standing.armId).toBeLessThanOrEqual(MIN_REPLICATION_BUDGET);
    }
    // Ordered by mean wait, ascending — *which dispatcher wins* is a wait question.
    const means = verdict.candidateRanking.map((standing) => standing.meanAwtS);
    expect(means).toEqual([...means].sort((a, b) => a - b));
  });
});

describe('a day the gate could not read is not a day it discarded', () => {
  it('says it was not judged, rather than calling an unmeasured day cosmetic', () => {
    /*
     * `midtown-office` at 900 s saturates under every shipped dispatcher: **no** arm quotes a mean
     * on **any** replication (§ D158 measured 0 of 50 there). Before this branch existed the gate
     * ranked three `NaN` means, `Array.prototype.sort` left them in declaration order on both days,
     * the orders matched, and the verdict read *"leaves the ranking exactly as the control day had
     * it (eta < collective < nearest-car), so it is cosmetic — § 17"*. § 17's instruction for a
     * cosmetic day is **discard it**, so that sentence would have had a content author delete days
     * on the strength of a ranking that was the order the arms were declared in.
     *
     * The case is here rather than as a note because it reaches the branch on a building where the
     * arms quote *nothing*, which is the extreme the sweep below cannot show: that sweep enters the
     * same branch too, but through demand thinned by the wrinkle rather than through a building
     * that saturates. Both routes matter and only one of them is content.
     *
     * No count is given for how many wrinkles take the second route. The previous wording said six
     * of thirty-eight, which was true when written and pinned by nothing — a library edit or a
     * moved weight vector changes it, and it would then be false in place, which is the defect this
     * very sentence replaced one revision earlier.
     */
    const building = requireBuilding(config, 'midtown-office');
    const profile = config.trafficProfilesById.get(building.trafficProfile);
    if (profile === undefined) throw new Error('no traffic profile');
    const verdict = gateWrinkle({
      ...inputFor('ordinary'),
      buildingId: 'midtown-office',
      building,
      base: baseDemandOf(profile),
    });
    expect(verdict.judged, verdict.reason).toBe(false);
    expect(verdict.earnsItsPlace).toBe(false);
    expect(verdict.reason).toMatch(/was not judged/);
    expect(verdict.reason).not.toMatch(/cosmetic/);
    // The counts are in the sentence — `batch/report.ts` R13, *no estimate without its `n`*.
    expect(verdict.reason).toMatch(/\d+\/\d+/);
  });
});

describe('the gate will not average the replications that survived', () => {
  it('refuses a cell where any arm drops even one replication — batch/report.ts R1', () => {
    /*
     * The default peak-5-minute window is empty on 2 of 50 replications at this building's
     * residential rate, so every arm reads 48/50 — and the first draft of this gate averaged those
     * 48 and kept nine days on them. `batch/report.ts` measured why that is wrong and rejected it:
     * *"the traces that fall out are exactly the ones where the dispatchers differ most"*, so the
     * surviving subset understates the difference. Two replications short of fifty is enough to
     * refuse, which is the whole of R1 and is what this case pins.
     *
     * It is the same input as the sweep with `reportWindow` dropped, so the two cases together say
     * that the window is what makes the sweep judgeable rather than anything about the wrinkles.
     */
    const { reportWindow: _dropped, ...withoutWindow } = inputFor('move-in:two-thirds');
    const verdict = gateWrinkle(withoutWindow);
    expect(verdict.judged, verdict.reason).toBe(false);
    expect(verdict.reason).toMatch(/fewer than every replication/);
    /*
     * **The day label is part of the assertion, and that is the point of pinning it.** This read
     * `/48\/50/`, which matched the string before the guard was corrected as well as after — so
     * reverting `shortArms` to compare against each arm's own recorded length, or to dedupe the two
     * days into one entry, left every case green. Review measured that (`revert-check` →
     * `still_passed`) rather than inferring it. Naming the day is the half of that fix a test can
     * reach: the other half — `quotable < requested`, which defends against an arm that recorded
     * nothing — is unreachable through this function's inputs, because `runBatch` cannot produce
     * that state and `gateWrinkle` takes no injectable result. That half is guarded by its own
     * docstring and by nothing else, and this comment is where that is admitted.
     */
    expect(verdict.reason).toMatch(/48\/50 on the candidate day/);
  });
});

describe('sharing one control run across a sweep changes no verdict', () => {
  it('gives a wrinkle the same answer through gateLibrary as through gateWrinkle alone', () => {
    /*
     * `gateLibrary` runs the control day **once** for the whole sweep rather than once per wrinkle,
     * because `dayOf(input, null)` never reads `input.wrinkle` — so every wrinkle was re-simulating
     * a byte-identical control. That is half the sweep's cost, and it was enough to push this file
     * past its own per-case timeouts on a loaded machine.
     *
     * The saving is only safe if it changes no answer, and that is a claim about behaviour rather
     * than about the code, so it is checked here rather than argued in the docstring. Both routes
     * are driven for the same wrinkle and the whole verdict is compared — ranking, swapped pair,
     * interval and reason, not merely the keep/discard bit.
     */
    const alone = gateWrinkle(inputFor('move-in:two-thirds'));
    const { wrinkle: _ignored, ...sweep } = inputFor('ordinary');
    const viaSweep = gateLibrary(WRINKLE_LIBRARY, sweep).find(
      (verdict) => verdict.wrinkleId === 'move-in:two-thirds',
    );
    expect(viaSweep, 'the sweep did not reach move-in:two-thirds').toBeDefined();
    expect(viaSweep).toEqual(alone);
  });
});

describe('the gate discriminates — the case this file exists for', () => {
  it('keeps some of the shipped library and discards the rest, over a real building', () => {
    /*
     * **A gate that kept everything and a gate that kept nothing both pass a test that only checks
     * it runs**, and both are useless: the first is not a gate and the second empties the library.
     * So both outcomes have to occur, and the message names every verdict when they do not.
     *
     * The verdicts themselves are deliberately **not** pinned. Which wrinkles shuffle Garden
     * Apartments' ranking is a measurement, it will move when the library or the dispatchers move,
     * and pinning it would turn a content edit into a test failure that says nothing about the
     * gate. What is pinned is that the instrument separates.
     */
    /*
     * Through `gateLibrary`, which is the sweep, rather than re-implementing its loop here. This
     * case mapped `everyWrinkle` over `gateWrinkle` in its first draft, which left `gateLibrary`
     * with no caller anywhere while two docstrings said this file drove it — the defect
     * `draw.ts` records catching on `pairIsRotated`, committed in the same directory. Review
     * caught it; `deadCode.test.ts` could not, because a `PUBLIC_API_ONLY` entry had already
     * excused it.
     */
    const { wrinkle: _ignored, ...sweep } = inputFor('ordinary');
    const verdicts = gateLibrary(WRINKLE_LIBRARY, sweep);
    const judged = verdicts.filter((verdict) => verdict.judged);
    const kept = judged.filter((verdict) => verdict.earnsItsPlace);
    const discarded = judged.filter((verdict) => !verdict.earnsItsPlace);
    const rows = verdicts
      .map(
        (verdict) =>
          `${verdict.judged ? (verdict.earnsItsPlace ? 'keep' : 'drop') : 'unjudged'} ` +
          `${verdict.wrinkleId}`,
      )
      .join('\n');

    expect(kept.length, `the gate kept nothing, which empties the library:\n${rows}`).toBeGreaterThan(
      0,
    );
    expect(
      discarded.length,
      `the gate kept every day, so it is not a gate:\n${rows}`,
    ).toBeGreaterThan(0);

    // Every kept day names the pair it moved and carries the interval that resolved it — § 17's
    // *"by more than noise"* is a claim, so the evidence for it is on the verdict.
    for (const verdict of kept) {
      expect(verdict.swappedPair, verdict.wrinkleId).not.toBeNull();
      expect(verdict.estimate, verdict.wrinkleId).not.toBeNull();
      expect(verdict.reason, verdict.wrinkleId).toMatch(/excludes zero/);
    }

    /*
     * **Some days are not judged even here, and that is the rule working rather than a gap.**
     * `weekend` and the other rate-thinning wrinkles cut demand far enough that an arm drops a
     * replication even over the full run, and the complete-case rule refuses those outright rather
     * than averaging what held. What the sweep asserts is that such a day is reported as *not
     * judged* — never as cosmetic, which § 17 says to discard on.
     */
    for (const verdict of verdicts.filter((candidate) => !candidate.judged)) {
      expect(verdict.reason, verdict.wrinkleId).toMatch(/was not judged/);
      expect(verdict.reason, verdict.wrinkleId).not.toMatch(/cosmetic/);
      expect(verdict.earnsItsPlace, verdict.wrinkleId).toBe(false);
    }
    expect(
      judged.length,
      `the gate could read none of the library at this operating point:\n${rows}`,
    ).toBeGreaterThan(0);
  });
});
