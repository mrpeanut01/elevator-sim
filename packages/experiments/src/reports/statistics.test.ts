/**
 * The interval arithmetic, checked against published values.
 *
 * These are the numbers everything else in the module rests on: if the t quantile is wrong then
 * every "indistinguishable" verdict and every convergence decision is wrong in the same direction
 * and nothing downstream can notice. So they are pinned against the tables in
 * docs/03-traffic-and-statistics.md and against standard published quantiles rather than against
 * this implementation's own output.
 */

import { Pcg32 } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import { publishedIntervalFamily } from './compare.js';
import * as statistics from './statistics.js';
import {
  DEFAULT_CONFIDENCE,
  estimateMean,
  meanOf,
  normalQuantile,
  pairedDifferenceEstimate,
  sampleStdDevOf,
  studentTCdf,
  studentTQuantile,
} from './statistics.js';
import { ReportsError, intervalContainsZero } from './types.js';

describe('normalQuantile', () => {
  it('reproduces the z table in docs/03-traffic-and-statistics.md', () => {
    // | Confidence | 70% | 80% | 90% | 95% | 99% |
    // | z          | 1.04| 1.28| 1.65| 1.96| 2.58|
    //
    // Tolerance 0.006 rather than half a unit in the last printed place, because the doc's 90%
    // entry rounds 1.64485 *up* to 1.65. The doc is the reference for which quantile to use, not
    // for its fifth digit.
    const twoSided = (confidence: number): number => normalQuantile(1 - (1 - confidence) / 2);
    const table: readonly [number, number][] = [
      [0.7, 1.04],
      [0.8, 1.28],
      [0.9, 1.65],
      [0.95, 1.96],
      [0.99, 2.58],
    ];
    for (const [confidence, published] of table) {
      expect(Math.abs(twoSided(confidence) - published)).toBeLessThan(0.006);
    }
  });

  it('matches published quantiles to ten decimal places', () => {
    // 1.959963984540054 is also the literal `benchmark/verdict.ts` hard-codes as `Z_95` for its
    // replication-planning arithmetic. That is the only `z` left in the repository — no interval is
    // normal-theory any more (DECISIONS.md § D7) — and this assertion is what stops the copy there
    // drifting from the function here. `Z_95` is module-private, so it is pinned by value.
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 10);
    expect(normalQuantile(0.95)).toBeCloseTo(1.6448536269514722, 10);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 12);
    expect(normalQuantile(0.025)).toBeCloseTo(-1.959963984540054, 10);
  });

  it('refuses a probability outside (0, 1)', () => {
    expect(() => normalQuantile(0)).toThrow(ReportsError);
    expect(() => normalQuantile(1)).toThrow(ReportsError);
  });
});

describe('studentTQuantile', () => {
  it('matches published two-sided 95% critical values', () => {
    // Standard t table, α = 0.05 two-sided.
    expect(studentTQuantile(0.975, 1)).toBeCloseTo(12.7062047, 6);
    expect(studentTQuantile(0.975, 2)).toBeCloseTo(4.30265273, 6);
    expect(studentTQuantile(0.975, 9)).toBeCloseTo(2.26215716, 6);
    expect(studentTQuantile(0.975, 11)).toBeCloseTo(2.20098516, 6);
    expect(studentTQuantile(0.975, 24)).toBeCloseTo(2.06389856, 6);
    expect(studentTQuantile(0.975, 199)).toBeCloseTo(1.9719565, 6);
  });

  it('matches published two-sided 90% critical values', () => {
    expect(studentTQuantile(0.95, 9)).toBeCloseTo(1.83311293, 6);
    expect(studentTQuantile(0.95, 24)).toBeCloseTo(1.71088208, 6);
  });

  it('is symmetric about zero and converges on the normal quantile', () => {
    expect(studentTQuantile(0.025, 9)).toBeCloseTo(-studentTQuantile(0.975, 9), 9);
    expect(studentTQuantile(0.5, 4)).toBe(0);
    expect(studentTQuantile(0.975, 1e6)).toBeCloseTo(normalQuantile(0.975), 4);
  });

  it('has a CDF that is a distribution', () => {
    expect(studentTCdf(0, 5)).toBeCloseTo(0.5, 12);
    expect(studentTCdf(-2.5, 7)).toBeCloseTo(1 - studentTCdf(2.5, 7), 12);
    expect(studentTCdf(2.26215716, 9)).toBeCloseTo(0.975, 7);
  });

  it('refuses a non-positive degrees of freedom', () => {
    expect(() => studentTQuantile(0.975, 0)).toThrow(ReportsError);
  });
});

describe('there is exactly one interval quantile in this module', () => {
  it('exports no n-dependent quantile chooser at all', () => {
    // The symbol this describe block used to be about. `halfWidthQuantile` implemented
    // docs/03-traffic-and-statistics.md § Part 3's `t` (n ≤ 25) / `z` (n > 25) crossover. Once
    // review finding #14 took it off the published path it had no non-test caller left — the
    // "callers" its own docstring named were an injection nothing performed and a fallback label
    // `formatConvergence` never prints — so it is deleted rather than kept exported behind a
    // caller list nothing satisfies (docs/05-roadmap.md § *Standing requirement*, DECISIONS.md
    // § D7). A test asserting its absence is what stops it coming back without an argument.
    expect(statistics).not.toHaveProperty('halfWidthQuantile');
    expect(statistics).not.toHaveProperty('T_DISTRIBUTION_MAX_N');
  });

  it('never widens to a normal quantile, which is what review finding #14 measured', () => {
    // `quantileUsedBy` reads the quantile back off an estimate as halfWidth / standardError, which
    // is the only external evidence of the family there is — and exactly what a reader re-deriving
    // the interval by hand would do. At n = 26 the two families differ by 0.0995.
    const n = 26;
    const published = quantileUsedBy(estimateMean(Array.from({ length: n }, (_, i) => i)));
    expect(published).toBeGreaterThan(normalQuantile(0.975));
    expect(published - normalQuantile(0.975)).toBeGreaterThan(0.09);
  });
});

/** The quantile an estimate actually used, recovered from the interval it published. */
const quantileUsedBy = (estimate: { halfWidth: number; standardError: number }): number =>
  estimate.halfWidth / estimate.standardError;

describe('the published interval is Student-t at n − 1, at every n', () => {
  it('is t(n − 1) on both sides of the stopping rule’s crossover', () => {
    // docs/03-traffic-and-statistics.md § Part 4 "Use a paired-t interval" states one formula,
    // D̄ ± t[n-1, conf] · s_D/√n, with no n in the choice of family. Published t values:
    // t(24, .975) = 2.063899, t(25, .975) = 2.059539, t(99, .975) = 1.984217.
    for (const [n, expected] of [
      [25, 2.063898561628025],
      [26, 2.0595385527532946],
      [100, 1.9842169515086827],
    ] as const) {
      const estimate = estimateMean(Array.from({ length: n }, (_, index) => index), {
        confidence: 0.95,
      });
      expect(estimate.method, `n = ${n}`).toBe('t');
      expect(estimate.degreesOfFreedom, `n = ${n}`).toBe(n - 1);
      expect(quantileUsedBy(estimate), `n = ${n}`).toBeCloseTo(expected, 9);
    }
  });

  it('converges on the normal quantile from above, so t everywhere costs almost nothing', () => {
    // The reason there is no efficiency case for the z crossover on a published interval.
    const large = quantileUsedBy(estimateMean(Array.from({ length: 2000 }, (_, i) => i)));
    const z = normalQuantile(0.975);
    expect(large).toBeGreaterThan(z);
    expect(large - z).toBeLessThan(0.003);
  });

  it('honours a non-default confidence with the t quantile, not a z one', () => {
    // The finding #19 operating point: 80 % at n = 30 is t(29, .9) = 1.3114336, not z = 1.2815516.
    const estimate = estimateMean(Array.from({ length: 30 }, (_, index) => index), {
      confidence: 0.8,
    });
    expect(estimate.method).toBe('t');
    expect(quantileUsedBy(estimate)).toBeCloseTo(1.3114336, 6);
  });
});

describe('estimateMean', () => {
  it('reports the mean, the spread across runs and the interval', () => {
    // Peters & Abbi's reported individual-run AWT range, as four replications.
    const estimate = estimateMean([4.1, 5.0, 5.6, 7.4]);
    expect(estimate.n).toBe(4);
    expect(estimate.mean).toBeCloseTo(5.525, 9);
    expect(estimate.stdDev).toBeCloseTo(1.3937356, 6);
    expect(estimate.standardError).toBeCloseTo(estimate.stdDev / 2, 12);
    expect(estimate.method).toBe('t');
    expect(estimate.degreesOfFreedom).toBe(3);
    expect(estimate.halfWidth).toBeCloseTo(3.18244631 * estimate.standardError, 6);
    expect(estimate.lower).toBeCloseTo(estimate.mean - estimate.halfWidth, 12);
    expect(estimate.upper).toBeCloseTo(estimate.mean + estimate.halfWidth, 12);
    expect(estimate.min).toBe(4.1);
    expect(estimate.max).toBe(7.4);
    expect(estimate.confidence).toBe(DEFAULT_CONFIDENCE);
  });

  it('gives one replication a mean but no interval, rather than a zero-width one', () => {
    // A zero-width interval would read as "perfectly reproducible", which is the opposite of
    // what one run of a lift peak tells you.
    const estimate = estimateMean([5]);
    expect(estimate.mean).toBe(5);
    expect(estimate.stdDev).toBeNaN();
    expect(estimate.halfWidth).toBeNaN();
    expect(estimate.lower).toBeNaN();
    expect(estimate.upper).toBeNaN();
  });

  it('reports a zero-width interval when every replication agrees exactly', () => {
    const estimate = estimateMean([7, 7, 7, 7]);
    expect(estimate.stdDev).toBe(0);
    expect(estimate.halfWidth).toBe(0);
    expect(estimate.lower).toBe(7);
    expect(estimate.upper).toBe(7);
  });

  it('refuses an empty sample or a non-finite value rather than propagating NaN', () => {
    expect(() => estimateMean([])).toThrow(/at least one replication/);
    expect(() => estimateMean([1, Number.NaN])).toThrow(/replication 1 contributed NaN/);
    expect(() => estimateMean([Number.POSITIVE_INFINITY])).toThrow(ReportsError);
  });

  it('has moment helpers that report NaN rather than 0 for an absent measurement', () => {
    expect(meanOf([])).toBeNaN();
    expect(sampleStdDevOf([3])).toBeNaN();
    expect(sampleStdDevOf([2, 4])).toBeCloseTo(Math.SQRT2, 12);
  });
});

describe('pairedDifferenceEstimate', () => {
  it('collapses to a zero-width interval containing zero when a candidate is compared to itself', () => {
    // The Phase 3 acceptance criterion in its purest form: identical runs differ by exactly
    // nothing, and the interval must say so rather than reporting a tie.
    const values = [4.1, 5.0, 5.6, 7.4, 6.2];
    const estimate = pairedDifferenceEstimate(values, values);
    expect(estimate.mean).toBe(0);
    expect(estimate.halfWidth).toBe(0);
    expect(intervalContainsZero(estimate)).toBe(true);
  });

  it('excludes zero when every pair moves the same way', () => {
    const baseline = [10, 11, 12, 13, 14, 15];
    const candidate = baseline.map((value) => value - 2);
    const estimate = pairedDifferenceEstimate(candidate, baseline);
    expect(estimate.mean).toBeCloseTo(-2, 12);
    expect(estimate.upper).toBeLessThan(0);
    expect(intervalContainsZero(estimate)).toBe(false);
  });

  it('contains zero when the differences are large but inconsistent', () => {
    // The documented failure mode: a difference that looks decisive run by run and is not.
    const baseline = [10, 10, 10, 10, 10, 10];
    const candidate = [4, 16, 5, 15, 6, 14];
    const estimate = pairedDifferenceEstimate(candidate, baseline);
    expect(Math.abs(estimate.mean)).toBeLessThan(1);
    expect(estimate.halfWidth).toBeGreaterThan(4);
    expect(intervalContainsZero(estimate)).toBe(true);
  });

  it('demonstrates the variance reduction common random numbers exist for', () => {
    // Same two candidates, once paired on shared traces and once against traces that happen to
    // be ordered differently. The paired differences are constant; the mismatched ones are not,
    // and the interval on the difference is correspondingly wider — which is the whole of
    // docs/03-traffic-and-statistics.md § Part 4 in four lines.
    const baseline = [4.1, 5.0, 5.6, 7.4, 6.2, 4.8];
    const paired = baseline.map((value) => value - 0.5);
    const shuffled = [...paired].reverse();
    const withCrn = pairedDifferenceEstimate(paired, baseline);
    const withoutCrn = pairedDifferenceEstimate(shuffled, baseline);
    expect(withCrn.mean).toBeCloseTo(withoutCrn.mean, 9);
    expect(withCrn.halfWidth).toBe(0);
    expect(withoutCrn.halfWidth).toBeGreaterThan(1);
    expect(intervalContainsZero(withoutCrn)).toBe(true);
  });

  it('refuses series of different lengths', () => {
    expect(() => pairedDifferenceEstimate([1, 2], [1])).toThrow(/one pair per replication/);
  });

  it('uses t(n − 1) past the stopping rule’s crossover, where it used to switch to z', () => {
    // Review finding #14, pinned at the exact n it names. At n = 26 the shipped code returned
    // z = 1.9599640 with `method: 'z'` and `degreesOfFreedom: NaN`; the doc's § Part 4 formula
    // wants t(25, .975) = 2.0595386.
    //
    // The differences are 0, 1, 2, … 25, whose sample standard deviation is exactly
    // sqrt(sum (i - 12.5)^2 / 25) = sqrt(1462.5 / 25) = sqrt(58.5) = 7.6485292.
    const n = 26;
    const candidate = Array.from({ length: n }, (_, index) => index);
    const baseline = candidate.map(() => 0);
    const estimate = pairedDifferenceEstimate(candidate, baseline, { confidence: 0.95 });

    expect(estimate.n).toBe(n);
    expect(estimate.method).toBe('t');
    expect(estimate.degreesOfFreedom).toBe(25);

    const sD = Math.sqrt(58.5);
    expect(estimate.stdDev).toBeCloseTo(sD, 9);
    const T_25 = 2.0595385527532946;
    expect(estimate.halfWidth).toBeCloseTo((T_25 * sD) / Math.sqrt(n), 9);

    // And the half-width the bug produced, so the two are never confused again: 4.83 % narrower.
    const Z_95 = 1.959963984540054;
    const buggyHalfWidth = (Z_95 * sD) / Math.sqrt(n);
    expect(buggyHalfWidth / estimate.halfWidth).toBeCloseTo(0.9517, 4);
  });

  it('never reports the normal approximation, at any replication count', () => {
    // The structural half of the fix: `estimateMean` names `publishedIntervalQuantile`, whose
    // return type cannot say 'z'. This asserts the behaviour that type is protecting, across the
    // crossover and well past the documented 50-200 budget.
    for (const n of [2, 25, 26, 50, 100, 200, 500]) {
      const estimate = pairedDifferenceEstimate(
        Array.from({ length: n }, (_, index) => Math.sin(index)),
        Array.from({ length: n }, () => 0),
        { confidence: 0.95 },
      );
      expect(estimate.method, `n = ${n}`).toBe('t');
      expect(estimate.degreesOfFreedom, `n = ${n}`).toBe(n - 1);
    }
  });

  /**
   * **Open item `C33`, first half — and the assertion that bites is the type annotation, not the
   * `expect`.**
   *
   * The `n < 2` branch read `method: 't' as IntervalMethod`, on an interval whose `halfWidth`,
   * `lower` and `upper` are all `NaN`. The *value* was right, so no runtime assertion anywhere
   * could have failed; what was wrong was that the compiler had been told to forget it. That is
   * review finding #14's shape one layer down, and it is exactly what § D117 fixed at
   * `compare.ts`'s assembly site and left standing here.
   *
   * `family` below is annotated with the literal type. Before the fix
   * `estimateMean(...).method` was `IntervalMethod`, so this declaration is a **compile** error and
   * `npx tsc -b` is what reports it — `include: ["src/**\/*.ts"]` puts this file in the build.
   */
  it('gives the n < 2 branch the narrow family type, not the stored-shape union', () => {
    const single = estimateMean([5]);
    const family: typeof statistics.PUBLISHED_INTERVAL_FAMILY = single.method;
    expect(family).toBe('t');
    /* The interval it labels does not exist, which is the whole reason the label had to be exact. */
    expect(single.halfWidth).toBeNaN();
    expect(single.lower).toBeNaN();
    expect(single.upper).toBeNaN();
    expect(single.degreesOfFreedom).toBeNaN();
    /* And the same at the other construction site, so the two cannot diverge. */
    const paired: typeof statistics.PUBLISHED_INTERVAL_FAMILY = pairedDifferenceEstimate(
      [1, 2],
      [0, 0],
    ).method;
    expect(paired).toBe('t');
  });

  it('has exactly one published-family constant, shared with the report assembly site', () => {
    // `compare.ts` used to declare its own `PUBLISHED_INTERVAL_FAMILY`. Two copies of one
    // convention that can drift apart is what § D114 measured the cost of in the dead-code
    // scanners, and nothing forces the duplication inside `reports/`. This pins that they are the
    // same binding rather than two literals that happen to agree today.
    expect(statistics.PUBLISHED_INTERVAL_FAMILY).toBe('t');
    expect(publishedIntervalFamily(estimateMean([1, 2, 3]))).toBe(
      statistics.PUBLISHED_INTERVAL_FAMILY,
    );
  });
});

describe('the published interval covers what it says it covers', () => {
  /**
   * A nominal 95 % interval must contain the true mean 95 % of the time. Under the shipped z
   * quantile it did not: at n = 26 the analytic coverage was 93.876 %, a 6.12 % false-positive
   * rate against a declared 5 %, which is the failure mode CLAUDE.md § Statistical discipline
   * names first — "reporting confident nonsense".
   *
   * The RNG is a named PCG32 stream at a fixed seed, per CLAUDE.md invariant 2. No global RNG,
   * so this test's verdict is a pure function of the source and reproduces exactly.
   */
  const COVERAGE_SEED = 20_260_727;
  /** PCG32 stream selector. Named and fixed, so this draw is one identified stream, not "the" RNG. */
  const COVERAGE_STREAM_ID = 1;
  const TRIALS = 100_000;
  const N = 26;
  const Z_95 = 1.959963984540054;

  it('covers 95 % of the time at n = 26, where the normal approximation covered 93.9 %', () => {
    const rng = new Pcg32(COVERAGE_SEED, COVERAGE_STREAM_ID);
    let coveredByShipped = 0;
    let coveredByNormalApproximation = 0;

    for (let trial = 0; trial < TRIALS; trial += 1) {
      /* i.i.d. N(0, 1) paired differences: the true mean is exactly zero, so "covered" is
         "the interval contains zero". */
      const differences = Array.from({ length: N }, () => rng.normal(0, 1));
      const zeros = differences.map(() => 0);
      const estimate = pairedDifferenceEstimate(differences, zeros, { confidence: 0.95 });

      if (estimate.lower <= 0 && estimate.upper >= 0) coveredByShipped += 1;

      /* The same sample, intervalled the way the bug did it. */
      const buggyHalfWidth = Z_95 * estimate.standardError;
      if (Math.abs(estimate.mean) <= buggyHalfWidth) coveredByNormalApproximation += 1;
    }

    const shipped = coveredByShipped / TRIALS;
    const buggy = coveredByNormalApproximation / TRIALS;

    /* The Monte-Carlo standard error at 100 000 trials is 0.069 %, so ±0.3 % is ±4.3 SE: wide
       enough never to flake, and nowhere near wide enough to admit 93.9 %. */
    expect(shipped).toBeGreaterThan(0.947);
    expect(shipped).toBeLessThan(0.953);

    /* And the bug, measured on the same 100 000 samples: materially under-covering. */
    expect(buggy).toBeLessThan(0.943);
    expect(shipped - buggy).toBeGreaterThan(0.008);

    console.log(
      `[coverage] n=${N}, ${TRIALS} trials: published t(25) interval covers ${(shipped * 100).toFixed(3)} %, the pre-fix z interval covers ${(buggy * 100).toFixed(3)} % of the same samples`,
    );
    /* 100 000 inversions of the t CDF is a few seconds; the default 5 s timeout is not the
       statement being made here. */
  }, 60_000);

  it('covers exactly 95 % analytically, which is the claim the Monte-Carlo estimates', () => {
    // Coverage of `mean ± q·s/√n` under normal differences is P(|T_{n-1}| ≤ q) = 2·F_{n-1}(q) − 1,
    // exactly, and needs no sampling. This is the figure review finding #14 reports as 93.876 %
    // for the shipped z interval; the same arithmetic on the shipped code now returns 95.000 %.
    for (const n of [26, 30, 40, 100, 200]) {
      const estimate = pairedDifferenceEstimate(
        Array.from({ length: n }, (_, index) => index),
        Array.from({ length: n }, () => 0),
        { confidence: 0.95 },
      );
      const q = estimate.halfWidth / estimate.standardError;
      expect(2 * studentTCdf(q, n - 1) - 1, `n = ${n}`).toBeCloseTo(0.95, 9);

      /* What the normal approximation covered at the same n, for the record. */
      const underCoverage = 2 * studentTCdf(Z_95, n - 1) - 1;
      expect(underCoverage, `n = ${n}`).toBeLessThan(0.95);
    }
    expect(2 * studentTCdf(Z_95, 25) - 1).toBeCloseTo(0.93876, 5);
  });
});

describe('intervalContainsZero', () => {
  it('is false for an interval that does not exist', () => {
    // n = 1: unknown, not "no difference". Treating an absent interval as containing zero would
    // report every single-replication comparison as indistinguishable.
    expect(intervalContainsZero(estimateMean([3]))).toBe(false);
  });
});
