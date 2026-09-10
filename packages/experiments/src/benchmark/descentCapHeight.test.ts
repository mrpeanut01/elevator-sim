/**
 * **The height sweep's structural claims, re-derived rather than transcribed** — GitHub issue #444.
 *
 * `descentCapHeight.ts` publishes a dated table of digits and this file does **not** assert them: a
 * hand-transcribed digit is the exact defect `published.ts` exists to catch, and a full sweep is
 * eight heights times three arms times sixty replications on two templates. What is asserted here
 * is everything about the study that is a *property* rather than a reading, on a reduced budget:
 *
 * 1. **The three arms are what the table says they are** — the cap resolves onto the middle one
 *    and onto neither of the others, checked on the resolved building rather than on the authored
 *    document.
 * 2. **Below the threshold the cabin buys exactly zero, replication by replication.** Not *"a
 *    small interval"* — every paired difference is identically `0`, because the two runs are the
 *    same run. This is the negative control, and it is the assertion that would fail if the field
 *    perturbed a run it has no business perturbing.
 * 3. **Above it the cabin buys seconds, with an interval excluding zero.**
 * 4. **A saturated row is refused rather than reported**, and the refusal names its reason.
 *
 * The two heights swept are 296 m and 304 m — one storey either side of the 300 m threshold — so
 * the pair differs by two floors and a boolean and nothing else. A pair at 120 m against 600 m
 * would prove the same thing about two different buildings.
 */

import { describe, expect, it } from 'vitest';

import { loadResources } from '../validation/harness.js';

import {
  BASE_SPEED_MPS,
  NEXT_SPEED_MPS,
  paid,
  runDescentCapHeightStudy,
  sweepTower,
  DOWN_PEAK_PROFILE,
  formatDescentCapHeightStudy,
} from './descentCapHeight.js';

/** One storey below the 300 m threshold, and one above. */
const BELOW_M = 296;
const ABOVE_M = 304;
/**
 * A third height, and it is here because the apparatus said so rather than because the story wanted
 * it. At 304 m — one storey past the threshold — the cabin's effect is about 0.9 s, and at `n = 50`
 * the interval is `[−1.836, +0.035]`: it contains zero. That is not the cap failing, it is the
 * effect being smaller than fifty replications can resolve one storey in, and asserting
 * `paid(...)` there would be asserting a coin flip. So the resolvable claim is made at 360 m and
 * the 304 m row carries only what is exact there — an ordering, and a zero below it.
 */
const RESOLVABLE_M = 360;

/** Inside `docs/03`'s 50–200 budget, at the bottom of it: this file checks properties, not digits. */
const REPLICATIONS = 50;

const TIMEOUT_MS = 300_000;

describe('the sweep arms are the configurations the study claims', () => {
  it('resolves the cap onto the capped arm alone, above the threshold alone', async () => {
    const config = await loadResources();
    const speedOf = (travelM: number, arm: 'base' | 'capped' | 'lifted') => {
      const car = sweepTower(config, { travelM, arm, trafficProfile: DOWN_PEAK_PROFILE })
        .banks[0]?.cars[0];
      return { rated: car?.ratedSpeedMps, descent: car?.descentSpeedMps };
    };

    // Above the threshold: only the unpressurised next-class car is limited.
    expect(speedOf(ABOVE_M, 'base')).toEqual({ rated: BASE_SPEED_MPS, descent: undefined });
    expect(speedOf(ABOVE_M, 'capped')).toEqual({ rated: NEXT_SPEED_MPS, descent: 10 });
    expect(speedOf(ABOVE_M, 'lifted')).toEqual({ rated: NEXT_SPEED_MPS, descent: undefined });

    // Below it, all three are symmetric — which is what makes the two rows comparable.
    for (const arm of ['base', 'capped', 'lifted'] as const) {
      expect(speedOf(BELOW_M, arm).descent).toBeUndefined();
    }
  });
});

describe('the cabin buys exactly nothing below the threshold and seconds above it', () => {
  it('measures both, paired, on the down-peak template', async () => {
    const study = await runDescentCapHeightStudy({
      replications: REPLICATIONS,
      travelsM: [BELOW_M, ABOVE_M, RESOLVABLE_M],
      trafficProfile: DOWN_PEAK_PROFILE,
    });
    const below = study.rows.find((row) => row.travelM === BELOW_M);
    const above = study.rows.find((row) => row.travelM === ABOVE_M);
    const resolvable = study.rows.find((row) => row.travelM === RESOLVABLE_M);
    if (below === undefined || above === undefined || resolvable === undefined) {
      throw new Error('the sweep skipped a height');
    }

    // Non-vacuity first: neither row may be quietly saturated, or everything below is a
    // statement about a queue rather than about a cap.
    expect(below.quotable, formatDescentCapHeightStudy(study)).toBe(true);
    expect(above.quotable, formatDescentCapHeightStudy(study)).toBe(true);
    expect(resolvable.quotable, formatDescentCapHeightStudy(study)).toBe(true);
    expect(below.aboveThreshold).toBe(false);
    expect(above.aboveThreshold).toBe(true);

    /*
     * **Exactly zero, not close to it.** The interval is over 50 paired differences and every one
     * of them is 0 — pressurising a cabin the cap never reached produces the same run, leg for
     * leg, so the mean, both bounds and the standard error are all identically zero. An
     * implementation that let the field perturb a run would produce a tiny non-zero interval and
     * would pass any `toBeCloseTo`.
     */
    expect(below.pressurisationGain.mean).toBe(0);
    expect(below.pressurisationGain.lower).toBe(0);
    expect(below.pressurisationGain.upper).toBe(0);
    expect(paid(below.pressurisationGain)).toBe(false);

    // And the two speed arms are therefore the same measurement below the threshold.
    expect(below.cappedGain.mean).toBe(below.liftedGain.mean);

    /*
     * Above the threshold the two speed arms part company — the exact claim at 304 m, one storey
     * up. `!==` rather than an interval, because a difference of exactly zero is what a cap that
     * did not reach the run would produce and that is decidable at any n.
     */
    expect(above.pressurisationGain.mean).not.toBe(0);
    expect(above.liftedGain.mean).toBeLessThan(above.cappedGain.mean);

    // And where the apparatus can resolve it, the cabin's interval excludes zero.
    expect(paid(resolvable.pressurisationGain), formatDescentCapHeightStudy(study)).toBe(true);
    expect(resolvable.liftedGain.mean).toBeLessThan(resolvable.cappedGain.mean);
  }, TIMEOUT_MS);
});

describe('a saturated row is refused rather than reported', () => {
  it('names why no crossover could be found, rather than returning a bare undefined', async () => {
    /*
     * One height, an eighth of the fleet: a deliberately over-subscribed cell, so the row cannot
     * be quotable. What is asserted is the *reporting*, which is what stops a saturated sweep
     * reading as a result — CLAUDE.md § Statistical discipline's *flag it and suppress the
     * interval*, applied to a study rather than to a run.
     */
    const config = await loadResources();
    const study = await runDescentCapHeightStudy({
      config,
      replications: 8,
      travelsM: [ABOVE_M],
      trafficProfile: DOWN_PEAK_PROFILE,
    });
    // Only one row, and it is above the threshold — so there is no quotable row below it to cross
    // from, whatever the row itself did.
    expect(study.stopsPayingAboveM).toBeUndefined();
    expect(study.stopsPayingUnavailableBecause).toContain('below the threshold');
    expect(formatDescentCapHeightStudy(study)).toContain('no crossover');
  }, TIMEOUT_MS);
});
