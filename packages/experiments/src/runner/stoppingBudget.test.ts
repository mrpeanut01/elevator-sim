/**
 * **What Student-t costs the sequential stopping rule, and what the normal quantile would cost.**
 *
 * `validation/harness.ts`'s `productionStoppingRule` injects `reports/statistics`'s `estimateMean`,
 * which is Student-t at `n - 1` at *every* `n` (DECISIONS.md § D7, § D14). Since `t[n-1] > z` for
 * every finite `n`, a sequentially-stopped experiment therefore runs at least as many replications
 * as one stopped on a normal-approximation half-width, and open item **C4** asked how many more.
 * This suite is the answer, and it is here rather than in a report because the answer is a property
 * of the loop control and has to stay true.
 *
 * Four things are pinned, in increasing order of how much they cost to check:
 *
 * 1. **Direction.** The shipped half-width is never below the normal-approximation one, at any `n`.
 *    That is the whole safety argument — `stopping.ts` states it as "one that stops too early
 *    publishes a number it did not earn" — and it is asserted at every `n` rather than, as
 *    `stopping.test.ts` does, past the doc's deleted crossover.
 * 2. **The inflation is bounded, and small where the runner actually operates.** `t[n-1]/z` at 90 %
 *    is 3.84 at n = 2, 1.0385 at n = 26, **1.019 at n = 50** — the runner's replication floor — and
 *    1.005 at n = 200, its cap. A fixed-`n` budget scales as the square of that, so across the whole
 *    50–200 band the t budget can exceed the z budget by at most **3.9 %**.
 * 3. **docs/07-handoff.md § 4's budget table is this rule's arithmetic.** 11 / 37 / 57 / 143 / 222 /
 *    563 at `t` against 9 / 36 / 55 / 141 / 220 / 562 at `z`, from the doc's own s = 3.60 s. Nothing
 *    in the suite re-derived that table before, which is exactly the failure C19 records: it was
 *    published as the t answer while carrying the deleted normal quantile's numbers.
 * 4. **The realized cost, and the realized benefit, on a shipped configuration.** Measured rather
 *    than projected, because the two disagree in both directions: the *sequential* overhead at the
 *    shipped policy is far smaller than the fixed-`n` table implies (chunking and the floor quantize
 *    most of it to zero) while a *single cell* can overshoot by far more than the table's two
 *    replications, because a sample half-width is not monotone in `n`. The benefit is coverage, and
 *    below the floor it is not marginal: see {@link COVERAGE_FLOOR}.
 */

import { describe, expect, it } from 'vitest';

import { estimateMean, normalQuantile } from '../reports/statistics.js';
import {
  GATE_BUILDING,
  GATE_SEED,
  MIDTOWN_UP_PEAK,
  loadResources,
  runGateExperiment,
  samplesOf,
  withProfiles,
} from '../validation/harness.js';

import { halfWidthStoppingRule } from './stopping.js';
import type { HalfWidthEstimator } from './stopping.js';
import type { StoppingVerdict } from './types.js';

/** The doc's worked confidence level, and the one the runner defaults to. */
const CONFIDENCE = 0.9;

/** `z[0.95]`, the quantile the deleted family would have used past n = 25. */
const Z = normalQuantile(1 - (1 - CONFIDENCE) / 2);

const meanOf = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

const sdOf = (values: readonly number[]): number => {
  const mean = meanOf(values);
  return Math.sqrt(
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1),
  );
};

/** What ships: Student-t at `n - 1`, at every `n`. */
const tEstimator: HalfWidthEstimator = (samples, { confidence }) =>
  estimateMean([...samples], { confidence });

/** The counterfactual: the same standard error against a normal quantile. */
const zEstimator: HalfWidthEstimator = (samples) => ({
  halfWidth: (Z * sdOf(samples)) / Math.sqrt(samples.length),
  n: samples.length,
  mean: meanOf(samples),
  stdDev: sdOf(samples),
  distribution: 'z',
});

/** `t[n-1]` at {@link CONFIDENCE}, read back out of the shipped estimator rather than tabulated. */
function tQuantileAt(n: number): number {
  const estimate = estimateMean(
    Array.from({ length: n }, (_, index) => index),
    { confidence: CONFIDENCE },
  );
  return estimate.halfWidth / estimate.standardError;
}

/* -------------------------------------------------------------------------- *
 * 1 and 2 — the arithmetic
 * -------------------------------------------------------------------------- */

describe('the shipped stopping rule never stops earlier than a normal approximation would', () => {
  it('is strictly wider than the normal-quantile half-width at every n, not only past 25', () => {
    /* A fixed, spread sample so the standard error is identical on both sides and only the
       quantile can differ. `stopping.test.ts` makes this claim at n = 26 against the doc's
       crossover double; the claim that matters for C4 is that it holds everywhere, because that
       is what makes the extra replications a *bound* rather than a region. */
    for (const n of [2, 3, 5, 10, 25, 26, 50, 100, 200, 563, 2000]) {
      const samples = Array.from({ length: n }, (_, index) => index * 1.3);
      const t = tEstimator(samples, { confidence: CONFIDENCE }).halfWidth;
      const z = zEstimator(samples, { confidence: CONFIDENCE }).halfWidth;
      expect(t, `n = ${n}`).toBeGreaterThan(z);
    }
  });

  it('bounds the budget inflation at 3.9 % across the runner’s whole 50–200 replication band', () => {
    /* The runner never consults the rule below 50 replications (RUNNER_DEFAULTS.minReplications)
       and never runs past 200 by default, so this band is where the choice of family can actually
       cost anything in a default sweep. A fixed-n budget goes as (quantile / target)^2. */
    const ratioAt = (n: number): number => tQuantileAt(n) / Z;
    expect(ratioAt(50)).toBeCloseTo(1.0193, 4);
    expect(ratioAt(200)).toBeCloseTo(1.0047, 4);
    for (let n = 50; n <= 200; n += 1) {
      expect(ratioAt(n) ** 2, `n = ${n}`).toBeLessThan(1.039);
    }
    /* And the inflation is monotone in n, so 50 is the worst case rather than an interior one. */
    for (let n = 3; n <= 400; n += 1) expect(ratioAt(n), `n = ${n}`).toBeLessThan(ratioAt(n - 1));
  });

  it('is 3.8× wider at n = 2, which is where the family choice stops being cosmetic', () => {
    /* t[1] = 6.3138 against z = 1.6449. A caller who lowers `minReplications` — the gate's own
       sequential-stopping suite lowers it to 2 — is relying on this and on nothing else. */
    expect(tQuantileAt(2) / Z).toBeCloseTo(3.8385, 4);
    expect(tQuantileAt(26) / Z).toBeCloseTo(1.0385, 4);
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — the published budget table
 * -------------------------------------------------------------------------- */

/** docs/07-handoff.md § 4's target precisions, in seconds of AWT. */
const PUBLISHED_TARGETS = [2, 1, 0.8, 0.5, 0.4, 0.25] as const;

/** Smallest `n` whose half-width reaches `target` at standard deviation `s`. */
function budgetFor(s: number, target: number, quantileAt: (n: number) => number): number {
  /* The normal-theory answer is a lower bound on the t answer, so start the scan just below it
     rather than at 2. A scan and not the recurrence `n = ceil((q(n) s / target)^2)`: that
     recurrence oscillates between 221 and 222 on the ±0.4 s rung and returns whichever iterate it
     ran out on. The half-width is monotone decreasing in n, so a scan has no such failure mode. */
  const normalTheory = Math.max(2, Math.ceil(((Z * s) / target) ** 2));
  for (let n = Math.max(2, normalTheory - 4); n <= 5_000_000; n += 1) {
    if ((quantileAt(n) * s) / Math.sqrt(n) <= target) return n;
  }
  throw new Error(`no budget found for s = ${s}, target = ${target}`);
}

describe('docs/07-handoff.md § 4’s replication-budget table', () => {
  it('is the Student-t answer, and the z answer it superseded differs by at most 2 replications', () => {
    /* s = 3.60 s at 90 % on Midtown up-peak AWT, as § 4 states it. C19 records that the table
       previously read the z row and was published as the t row, understating every rung. Both rows
       are derived here so neither can drift without this failing. */
    const s = 3.6;
    const t = PUBLISHED_TARGETS.map((target) => budgetFor(s, target, tQuantileAt));
    const z = PUBLISHED_TARGETS.map((target) => budgetFor(s, target, () => Z));
    expect(t).toEqual([11, 37, 57, 143, 222, 563]);
    expect(z).toEqual([9, 36, 55, 141, 220, 562]);
    for (const [index, budget] of t.entries()) {
      expect(budget - (z[index] as number), `target ±${PUBLISHED_TARGETS[index]} s`).toBeLessThanOrEqual(2);
      expect(budget - (z[index] as number)).toBeGreaterThanOrEqual(0);
    }
    /* C19's account of the superseded table: five of its six rows are the z row exactly, and the
       ±0.25 s rung — 563 — is the one that is not. Asserted so the account cannot be reworded into
       something the arithmetic does not support. */
    const superseded = [9, 36, 55, 141, 220, 563];
    expect(superseded.filter((value, index) => value === z[index])).toHaveLength(5);
    expect(superseded[5]).toBe(t[5]);
  });
});

/* -------------------------------------------------------------------------- *
 * 4 — the realized cost and the realized benefit, on a shipped configuration
 * -------------------------------------------------------------------------- */

/**
 * `replicationRunner.decide()`'s loop, replayed over a fixed sample.
 *
 * The runner's replication seeds are a function of `(experimentSeed, index)` alone, so a stopping
 * rule cannot change *which* numbers arrive — only how many of them the loop reads. That is what
 * makes a replay over one drawn sample equivalent to re-running the experiment under each family,
 * and `stoppingBudget` verifies it against the real runner below rather than assuming it.
 */
function replay(
  samples: readonly number[],
  options: {
    readonly minReplications: number;
    readonly checkEvery: number;
    readonly maxReplications: number;
    readonly target: number;
    readonly estimator: HalfWidthEstimator;
  },
): { readonly n: number; readonly verdict: StoppingVerdict | undefined } {
  const rule = halfWidthStoppingRule(options.estimator);
  const cap = Math.min(options.maxReplications, samples.length);
  let issued = 0;
  let last: StoppingVerdict | undefined;
  for (;;) {
    const chunk = issued === 0 ? options.minReplications : options.checkEvery;
    const take = Math.min(chunk, cap - issued);
    if (take <= 0) return { n: issued, verdict: last };
    issued += take;
    const answer = rule({
      samples: samples.slice(0, issued),
      acceptableRange: options.target,
      confidence: CONFIDENCE,
      metric: 'awtS',
      replications: issued,
    });
    last = typeof answer === 'boolean' ? { stop: answer } : answer;
    if (last.stop) return { n: issued, verdict: last };
    if (issued >= cap) return { n: issued, verdict: last };
  }
}

/**
 * Replications drawn for the measurement below.
 *
 * 3 000 rather than the 30 000 the C4 investigation used: enough that the grand mean's own standard
 * error (~0.07 s) is an order of magnitude below the half-widths under test and that fifty disjoint
 * blocks of 60 exist to measure coverage over, and small enough to belong in a test suite. Every
 * number below is deterministic in `GATE_SEED`, so nothing here can flake.
 */
const SAMPLE_BUDGET = 3_000;

/** Block size for the coverage study, and the replication cap inside each block. */
const COVERAGE_BLOCK = 60;

/**
 * **What the floor is worth.** Below `minReplications`, the normal quantile does not cost a
 * percentage point of coverage — it costs a sixth of the interval's credibility. Asserted as a
 * conservative bound rather than an equality; the measured figures are logged.
 */
const COVERAGE_FLOOR = { zBelow: 0.75, gapAtLeast: 0.05 } as const;

describe('the measured cost of Student-t on a shipped configuration', () => {
  it('measures the sequential overhead against the normal quantile, and what it buys', async () => {
    const resources = withProfiles(await loadResources(), []);
    const drawn = await runGateExperiment({
      id: 'c4/stopping-budget',
      seed: GATE_SEED,
      building: GATE_BUILDING,
      dispatchers: ['eta'],
      traffic: MIDTOWN_UP_PEAK,
      replications: SAMPLE_BUDGET,
      resources,
    });
    const samples = [...samplesOf(drawn, 'eta', 'awtS')].filter((value) => Number.isFinite(value));
    const s = sdOf(samples);
    const truth = meanOf(samples);
    console.log(
      `[c4] ${GATE_BUILDING}/eta/up-peak: n = ${samples.length}, mean ${truth.toFixed(4)} s, s = ${s.toFixed(4)} s`,
    );

    /* ---- the overhead, at the policy that ships and at one with the floor lowered ---- */
    const policies = [
      { id: 'shipped  (min 50, every 8, max 200)', minReplications: 50, checkEvery: 8, maxReplications: 200 },
      { id: 'floor down (min  2, every 1, max 200)', minReplications: 2, checkEvery: 1, maxReplications: 200 },
    ];
    /* Targets calibrated to this configuration's own spread, so each one has a real crossing. */
    const targetForN = (n: number): number => (Z * s) / Math.sqrt(n);
    const overheads: number[] = [];
    for (const policy of policies) {
      let tTotal = 0;
      let zTotal = 0;
      let worst = 0;
      for (const nStar of [10, 26, 40, 60, 100, 150]) {
        const target = targetForN(nStar);
        const t = replay(samples, { ...policy, target, estimator: tEstimator }).n;
        const z = replay(samples, { ...policy, target, estimator: zEstimator }).n;
        /* The direction property, on real data rather than on a constructed sample. */
        expect(t, `${policy.id} at n* = ${nStar}`).toBeGreaterThanOrEqual(z);
        tTotal += t;
        zTotal += z;
        worst = Math.max(worst, t - z);
        console.log(`[c4] ${policy.id}  n* ${String(nStar).padStart(3)}  ±${target.toFixed(4)} s  n(t) ${String(t).padStart(3)}  n(z) ${String(z).padStart(3)}  t-z ${t - z}`);
      }
      overheads.push((tTotal - zTotal) / zTotal);
      console.log(
        `[c4] ${policy.id}: t ${tTotal} replications, z ${zTotal}, overhead +${tTotal - zTotal} (+${(((tTotal - zTotal) / zTotal) * 100).toFixed(2)} %), worst single cell +${worst}`,
      );
    }
    /* At the shipped policy the overhead is a few percent at most: the 50-replication floor and the
       8-replication chunk quantize most of the fixed-n table's 1–2 replications away entirely. */
    expect(overheads[0] as number).toBeLessThan(0.05);

    /* ---- what it buys: coverage of the interval the rule stopped on ---- */
    const blocks: number[][] = [];
    for (let start = 0; start + COVERAGE_BLOCK <= samples.length; start += COVERAGE_BLOCK) {
      blocks.push(samples.slice(start, start + COVERAGE_BLOCK));
    }
    for (const nStar of [10, 30]) {
      const target = targetForN(nStar);
      const coverage: Record<string, { covered: number; n: number }> = {};
      for (const [family, estimator] of [
        ['t', tEstimator],
        ['z', zEstimator],
      ] as const) {
        let covered = 0;
        let nSum = 0;
        for (const block of blocks) {
          const { n, verdict } = replay(block, {
            minReplications: 2,
            checkEvery: 1,
            maxReplications: COVERAGE_BLOCK,
            target,
            estimator,
          });
          nSum += n;
          const mean = verdict?.mean ?? Number.NaN;
          const halfWidth = verdict?.halfWidth ?? Number.NaN;
          if (Math.abs(mean - truth) <= halfWidth) covered += 1;
        }
        coverage[family] = { covered: covered / blocks.length, n: nSum / blocks.length };
      }
      const t = coverage['t'] as { covered: number; n: number };
      const z = coverage['z'] as { covered: number; n: number };
      console.log(
        `[c4] coverage below the floor, ±${target.toFixed(4)} s over ${blocks.length} blocks of ${COVERAGE_BLOCK}:` +
          ` t ${(t.covered * 100).toFixed(1)} % at mean n ${t.n.toFixed(2)}` +
          ` | z ${(z.covered * 100).toFixed(1)} % at mean n ${z.n.toFixed(2)}` +
          ` | z saves ${(t.n - z.n).toFixed(2)} replications and gives up ${((t.covered - z.covered) * 100).toFixed(1)} pp`,
      );
      /* Nominal is 90 %. Both families under-cover, because a sequentially-stopped interval always
         does; the point is the size of the gap between them, which is what the extra replications
         are buying and why no argument from "z is cheaper" survives. */
      expect(z.covered, `z coverage at n* = ${nStar}`).toBeLessThan(COVERAGE_FLOOR.zBelow);
      expect(t.covered - z.covered, `coverage gap at n* = ${nStar}`).toBeGreaterThan(
        COVERAGE_FLOOR.gapAtLeast,
      );
      expect(z.n).toBeLessThan(t.n);
    }
  }, 600_000);

  it('replays the runner exactly, which is what makes the measurement above a measurement', async () => {
    /* The claim the replay rests on: injecting a stopping rule cannot change which numbers a
       replication produces, only how many are read. Checked against the real runner under both
       families rather than argued from the seeding scheme. */
    const resources = withProfiles(await loadResources(), []);
    const drawn = await runGateExperiment({
      id: 'c4/stopping-budget-replay-reference',
      seed: GATE_SEED,
      building: GATE_BUILDING,
      dispatchers: ['eta'],
      traffic: MIDTOWN_UP_PEAK,
      replications: 120,
      resources,
    });
    const samples = [...samplesOf(drawn, 'eta', 'awtS')].filter((value) => Number.isFinite(value));
    const target = (Z * sdOf(samples)) / Math.sqrt(60);
    const policy = { minReplications: 2, checkEvery: 1, maxReplications: 120 };

    for (const [family, estimator] of [
      ['t', tEstimator],
      ['z', zEstimator],
    ] as const) {
      const run = await runGateExperiment({
        id: `c4/stopping-budget-replay-${family}`,
        seed: GATE_SEED,
        building: GATE_BUILDING,
        dispatchers: ['eta'],
        traffic: MIDTOWN_UP_PEAK,
        replications: 120,
        resources,
        stoppingRule: halfWidthStoppingRule(estimator),
        replicationOverrides: {
          ...policy,
          confidence: CONFIDENCE,
          acceptableRange: target,
          stoppingMetric: 'awtS',
        },
      });
      const ran = run.cells[0]?.stopping.replicationsRun;
      const predicted = replay(samples, { ...policy, target, estimator }).n;
      console.log(`[c4] replay check, family ${family}: runner ${ran}, replay ${predicted}`);
      expect(ran, `family ${family}`).toBe(predicted);
    }
  }, 600_000);
});
