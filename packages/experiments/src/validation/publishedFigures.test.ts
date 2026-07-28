/**
 * **Phase 8, statistical self-validation as regression — the published figures, re-derived.**
 *
 * `docs/07-handoff.md` § 4 is titled *"Measured facts that bound what you may claim"*, and later
 * phases quote it without re-measuring: the replication budget a target precision needs, the
 * smallest effect that is detectable at all, the interval family every published estimate uses.
 *
 * `CLAUDE.md` says what happens to numbers in that position:
 *
 * > **A published number goes stale the same way.** Three figures in this repository did not
 * > reproduce from the code that was supposed to produce them — one measured before a seam was
 * > wired and never regenerated, two hand-transcribed through a double rounding — and no test
 * > noticed, because nothing in the suite re-derived a published interval.
 *
 * This file is the part of the regression track that costs nothing: **every published figure that
 * is arithmetic over a measured input**, re-derived from the stated inputs and checked. It runs in
 * milliseconds and needs no simulation.
 *
 * The figures that need a *run* are pinned where the run already happens, so the marginal cost is
 * also zero:
 *
 * | figure | where it is now asserted |
 * |---|---|
 * | CRN ρ = 0.997 / 0.903 / 0.608, reduction 99.69 / 89.77 / 43.75 %, factor 324× / 9.8× / 1.8× | `crnVarianceReduction.test.ts` |
 * | structural resolution limit, 1.9 s at 80 % power, n = 100 | `crnVarianceReduction.test.ts` |
 * | near-neighbour resolution limit, 0.20 s (1.3 % of AWT), 8/10 seed sets | `crippledVariant.test.ts` |
 * | closed-form residuals on all five buildings | `oracle/fiveBuildings.test.ts` |
 * | S-curve regime per building | `physics.test.ts` |
 *
 * Before this task, **none** of those five was asserted at its published magnitude. Each was
 * computed, printed to the console, and checked only for sign or ordering.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONFIDENCE,
  estimateMean,
  normalQuantile,
  studentTQuantile,
} from '../reports/statistics.js';

/* -------------------------------------------------------------------------- *
 * docs/07-handoff.md § 4 — "Replication budget by target precision"
 * -------------------------------------------------------------------------- */

/**
 * The doc's inputs, quoted: *"At 90 % confidence on Midtown up-peak AWT (s = 3.60 s, CoV 23 %)"*.
 *
 * Both are stated in the doc and neither is re-derived here — this file checks the **table**
 * against them, not them against a run. What it catches is a table that no longer follows from its
 * own stated inputs, which is what a hand-transcribed row looks like, and a change in the quantile
 * family, which `DECISIONS.md` § D7 records as having actually happened once.
 */
const SAMPLE_SD_S = 3.6;
const COEFFICIENT_OF_VARIATION = 0.23;
const BUDGET_CONFIDENCE = 0.9;

/** The published table: half-width target in seconds against the replication count it needs. */
const PUBLISHED_BUDGET: readonly (readonly [number, number])[] = [
  [2, 9],
  [1, 36],
  [0.8, 55],
  [0.5, 141],
  [0.4, 220],
  [0.25, 563],
];

/**
 * The same table re-derived with Student-t at `n − 1` — the family this project's published
 * intervals actually use.
 *
 * **This is a defect in `docs/07-handoff.md`, reported rather than fixed** (`docs/` is outside this
 * task's ownership). See the test below for the mechanism: the published row is the *normal*
 * quantile's answer at every rung, and the normal quantile is the one review finding #14 removed
 * from the published path — `DECISIONS.md` § D7. The error is 0–2 replications and always in the
 * optimistic direction.
 */
const CORRECTED_BUDGET: readonly (readonly [number, number])[] = [
  [2, 11],
  [1, 37],
  [0.8, 57],
  [0.5, 143],
  [0.4, 222],
  [0.25, 563],
];

/**
 * The smallest `n` whose Student-t half-width at `n − 1` degrees of freedom meets `target`.
 *
 * `n = ceil((t·s/h)²)` is the usual closed form and it is **not** what this does, because `t`
 * depends on `n`. Solving it by search is the honest version, and it is the version the doc's
 * table has to have come from: at `h = 2 s` the closed form with a normal quantile gives 9 and
 * with `t[n−1]` gives 9 too, but at `h = 0.25 s` the two differ.
 */
function replicationsFor(targetHalfWidthS: number): number {
  for (let n = 2; n <= 5000; n += 1) {
    const halfWidth = (studentTQuantile((1 + BUDGET_CONFIDENCE) / 2, n - 1) * SAMPLE_SD_S) / Math.sqrt(n);
    if (halfWidth <= targetHalfWidthS) return n;
  }
  throw new Error('no replication count inside the search bound meets that target');
}

describe('docs/07-handoff.md § 4 — the replication-budget table follows from its own inputs', () => {
  it('re-derives every row, and the doc’s 50–200 band corresponds to ±0.5–0.8 s', () => {
    const rows: string[] = [];
    for (const [target, corrected] of CORRECTED_BUDGET) {
      const derived = replicationsFor(target);
      const published = PUBLISHED_BUDGET.find(([value]) => value === target)?.[1];
      rows.push(
        `  ±${target.toFixed(2)} s -> n = ${derived} (published ${published}` +
          `${published === derived ? '' : `, short by ${derived - (published ?? 0)}`})`,
      );
      // Exact, not approximate. The table is arithmetic over two stated numbers, so a derived row
      // that moves at all is a change in `s`, in the confidence level, or in the quantile family.
      expect({ target, derived }).toEqual({ target, derived: corrected });
    }
    // eslint-disable-next-line no-console
    console.log(
      `\ndocs/07 § 4 replication budget, re-derived at s = ${SAMPLE_SD_S} s, ${BUDGET_CONFIDENCE * 100} % confidence, t[n-1]:\n${rows.join('\n')}\n`,
    );

    // The doc's own reading of its table: *"The doc's flat 50–200 corresponds to a ±0.5–0.8 s
    // target."* That conclusion survives the correction — 57 and 143 are both inside 50–200 —
    // which is why the defect below is a defect in the table and not in the guidance built on it.
    expect(replicationsFor(0.8)).toBeGreaterThanOrEqual(50);
    expect(replicationsFor(0.8)).toBeLessThanOrEqual(200);
    expect(replicationsFor(0.5)).toBeGreaterThanOrEqual(50);
    expect(replicationsFor(0.5)).toBeLessThanOrEqual(200);
    // And the rungs either side fall outside it, which is what makes 0.5–0.8 s the *correspondence*
    // rather than merely a pair of values inside the band.
    expect(replicationsFor(1)).toBeLessThan(50);
    expect(replicationsFor(0.4)).toBeGreaterThan(200);
  });

  it('**defect**: the published table is the normal quantile’s answer, not Student-t’s', () => {
    // Reported, not fixed: `docs/` is outside this task's ownership.
    //
    // `docs/07-handoff.md` § 4 publishes 9 / 36 / 55 / 141 / 220 / 563. Solving the same table
    // with `z(0.95) = 1.6449` reproduces **five of the six rows exactly** and the sixth to within
    // one; solving it with `t[n−1]`, the family every published interval in this project now
    // uses, gives 11 / 37 / 57 / 143 / 222 / 563.
    //
    // | target | published | z | t[n−1] |
    // |---|---|---|---|
    // | ±2 s    |   9 |   9 |  **11** |
    // | ±1 s    |  36 |  36 |  **37** |
    // | ±0.8 s  |  55 |  55 |  **57** |
    // | ±0.5 s  | 141 | 141 | **143** |
    // | ±0.4 s  | 220 | 220 | **222** |
    // | ±0.25 s | 563 | 562 |     563 |
    //
    // The magnitude is 0–2 replications, so no conclusion in the repository changes. The
    // *direction* is what matters: the table understates the budget, so a reader who plans from
    // it publishes a half-width slightly wider than they claimed. That is the optimistic
    // direction `CLAUDE.md` § Statistical discipline singles out, and it is the same normal
    // quantile review finding #14 removed from the published path (`DECISIONS.md` § D7) — the
    // table was derived before that change and never regenerated.
    const z = normalQuantile((1 + BUDGET_CONFIDENCE) / 2);
    const withNormal = (target: number): number => {
      for (let n = 2; n <= 5000; n += 1) {
        if ((z * SAMPLE_SD_S) / Math.sqrt(n) <= target) return n;
      }
      throw new Error('unreachable');
    };
    expect(z).toBeCloseTo(1.6448536269514737, 12);

    let matchesNormal = 0;
    for (const [target, published] of PUBLISHED_BUDGET) {
      if (withNormal(target) === published) matchesNormal += 1;
      // Every published row is at most the t answer, never more — the error has one sign.
      expect(published).toBeLessThanOrEqual(replicationsFor(target));
    }
    expect(matchesNormal).toBe(5);
    // And the t family matches only where the two agree, which is the tightest rung alone.
    const matchesT = PUBLISHED_BUDGET.filter(
      ([target, published]) => replicationsFor(target) === published,
    ).length;
    expect(matchesT).toBe(1);
  });

  it('is consistent with the stated coefficient of variation', () => {
    // `s = 3.60 s` and `CoV = 23 %` are two statements about the same distribution, so they imply
    // a base AWT of 3.60 / 0.23 = 15.65 s — which is the Midtown up-peak `eta` figure the gate
    // measures (15.72 s in `crippledVariant.test.ts`'s resolution ladder). If those ever stopped
    // agreeing, one of the two published numbers would describe a different operating point and
    // every budget derived from it would be wrong by that ratio.
    const impliedBaseAwtS = SAMPLE_SD_S / COEFFICIENT_OF_VARIATION;
    expect(impliedBaseAwtS).toBeCloseTo(15.65, 1);
    // The band is wide enough to cover the difference between the two arms the gate reports
    // (15.72 s on the resolution ladder, 16.20 s on the cripple baseline, which uses a different
    // seed set) and narrow enough to fail on a real shift in the operating point.
    expect(impliedBaseAwtS).toBeGreaterThan(14.5);
    expect(impliedBaseAwtS).toBeLessThan(17);
  });

  it('shows the two families diverging most where precision matters least — hence the miss', () => {
    // Why the defect above survived: the relative error is largest at the *loose* end (11 against
    // 9, +22 %) and vanishes at the tight end (563 against 562, +0.2 %), because `t[n−1]`
    // approaches `z` as `n` grows. A spot check on the row anybody actually plans from — 141 at
    // ±0.5 s, inside the doc's own 50–200 band — is off by 2 in 143 and reads as a rounding
    // difference rather than as a different distribution.
    const z = normalQuantile((1 + BUDGET_CONFIDENCE) / 2);
    const withNormal = (target: number): number => {
      for (let n = 2; n <= 5000; n += 1) {
        if ((z * SAMPLE_SD_S) / Math.sqrt(n) <= target) return n;
      }
      throw new Error('unreachable');
    };
    const relativeError = (target: number): number => withNormal(target) / replicationsFor(target) - 1;
    expect(Math.abs(relativeError(2))).toBeGreaterThan(0.15);
    expect(Math.abs(relativeError(0.25))).toBeLessThan(0.01);
    expect(Math.abs(relativeError(2))).toBeGreaterThan(Math.abs(relativeError(0.5)));
    // eslint-disable-next-line no-console
    console.log(
      `\nquantile family, same table: t[n-1] gives ${PUBLISHED_BUDGET.map(([target]) => replicationsFor(target)).join('/')}, ` +
        `the pre-fix normal gives ${PUBLISHED_BUDGET.map(([target]) => withNormal(target)).join('/')} ` +
        `(published: ${PUBLISHED_BUDGET.map(([, n]) => n).join('/')})\n`,
    );
  });

  it('publishes intervals at Student-t at every n, which is what the budget assumes', () => {
    // The budget above is only the project's budget if the estimator the reports use is the one
    // it was derived from. `estimateMean` is that estimator; its `method` says which family it
    // used, and there is no `n`-dependent crossover any more.
    for (const n of [2, 5, 25, 26, 100, 563]) {
      const samples = Array.from({ length: n }, (_, index) => 15 + Math.sin(index));
      const estimate = estimateMean(samples, { confidence: BUDGET_CONFIDENCE });
      expect(estimate.method).toBe('t');
      expect(estimate.n).toBe(n);
    }
    // And the default confidence a published interval is quoted at is 95 %, not the 90 % the
    // stopping rule uses. Two different decisions, two different levels — pinned so a change to
    // one cannot silently move the other.
    expect(DEFAULT_CONFIDENCE).toBeCloseTo(0.95, 9);
    expect(BUDGET_CONFIDENCE).toBeCloseTo(0.9, 9);
  });
});

/* -------------------------------------------------------------------------- *
 * The regression track's own scope
 * -------------------------------------------------------------------------- */

describe('what the Phase 8 regression track covers, stated so the gap is visible', () => {
  it('lists the published figures now asserted, and the ones still only printed', () => {
    // Not a measurement — a written scope, kept next to the tests rather than in a doc this task
    // may not edit, so a reader can tell what is guarded from what is merely reported.
    const asserted = [
      'docs/07 § 4 replication budget by target precision — this file',
      'docs/07 § 4 CRN reduction table (rho, reduction, factor) — crnVarianceReduction.test.ts',
      'docs/07 § 4 structural resolution limit 1.9 s at 80 % power — crnVarianceReduction.test.ts',
      'docs/07 § 4 near-neighbour resolution limit 0.20 s / 1.3 % — crippledVariant.test.ts',
      'docs/07 § 5 closed-form residuals, Midtown and Garden — oracle/fiveBuildings.test.ts',
      'docs/07 § 5 closed-form residuals, the three new buildings — oracle/fiveBuildings.test.ts',
      'docs/04 one-floor motion regime, all five buildings — physics.test.ts',
    ];
    const stillOnlyPrinted = [
      'docs/07 § 4 CRN pairing quality per building (Garden rho 0.90, Midtown 0.62) — no suite measures Garden',
      'docs/07 § 4 nearest-car saturation cap at n = 287 on Midtown — operatingPoint.test.ts measures the census, not the cap',
      'docs/07 § 5 the 2 s deadband sweep — a Phase 5 sweep at n = 300, too expensive for any always-on budget',
      'docs/07 § 5 determinism, 38/40 disjoint seed pairs — nullComparison.test.ts runs a smaller ladder',
      'docs/07 § 6 the headline pre-positioning result at n = 500 — benchmark/, opt-in',
    ];
    // eslint-disable-next-line no-console
    console.log(
      `\nPhase 8 regression track:\n  ASSERTED (${asserted.length}):\n    ${asserted.join('\n    ')}\n` +
        `  STILL ONLY PRINTED (${stillOnlyPrinted.length}):\n    ${stillOnlyPrinted.join('\n    ')}\n`,
    );
    // The list is the deliverable; the assertion is that it has not quietly shrunk.
    expect(asserted).toHaveLength(7);
    expect(stillOnlyPrinted).toHaveLength(5);
  });
});
