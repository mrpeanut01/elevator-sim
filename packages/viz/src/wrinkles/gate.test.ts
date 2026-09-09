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
}, 120_000);

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
     * The case is here rather than as a note because the sweep above runs on the one building where
     * every arm quotes, so nothing else in this file enters the branch.
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
  }, 120_000);
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
    const kept = verdicts.filter((verdict) => verdict.earnsItsPlace);
    const discarded = verdicts.filter((verdict) => !verdict.earnsItsPlace);
    const rows = verdicts
      .map((verdict) => `${verdict.earnsItsPlace ? 'keep' : 'drop'} ${verdict.wrinkleId}`)
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

    // Garden Apartments quotes on every arm, so every verdict here is a finding about its day
    // rather than a day the gate could not read. The unjudged branch has its own case below.
    for (const verdict of verdicts) {
      expect(verdict.judged, `${verdict.wrinkleId}: ${verdict.reason}`).toBe(true);
    }
  }, 120_000);
});
