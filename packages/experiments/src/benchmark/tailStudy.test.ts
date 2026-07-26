/**
 * **The tail terms are not inert — they are out of range at the only load the criterion can be argued
 * at.** The correction to the main table's headline, and the sharpest finding in Phase 5.
 *
 * `dispatcherBenchmark.test.ts` measures `fairness-first` as bit-identical to `eta` and reports it. It
 * would be easy, and wrong, to stop there and conclude the `starvation` weight is dead code. This
 * suite raises the load until the term has something to price and finds it worth **3.83 % of WT95 and
 * 4.24 % of WT99**, against 1.16 % of the mean — the shape a fairness term is supposed to have.
 *
 * The catch is what the suite exists to assert: at that load `nearest-car` has already diverged on 29
 * replications in 250 and has no mean at all, and one load step higher `eta` starts diverging too, so
 * the window closes entirely. So both statements are true at once —
 *
 * - at the operating point where the acceptance criterion is arguable, the tail terms do nothing;
 * - at the operating point where the tail terms work, the acceptance criterion is not arguable.
 *
 * — and the gate must say both. Everything below is measured **against `eta`**, and every assertion
 * that touches the acceptance baseline asserts only that it is *unquotable*.
 */

import { describe, expect, it } from 'vitest';

import { loadResources, withProfiles } from '../validation/harness.js';

import { TAIL_REFERENCE, formatTailStudy, runTailStudy, type TailStudy } from './tailStudy.js';

const TIMEOUT_MS = 900_000;

let cached: TailStudy | undefined;

async function study(): Promise<TailStudy> {
  cached ??= await runTailStudy({ resources: withProfiles(await loadResources(), []) });
  return cached;
}

describe('Phase 5 — where the tail terms earn their weights, and why it is not where the criterion lives', () => {
  it('prints the tail study', async () => {
    console.log(formatTailStudy(await study()));
  }, TIMEOUT_MS);

  it('finds the acceptance baseline unquotable at every load in this study', async () => {
    // The reason every comparison here is against `eta`. Asserted rather than explained, because a
    // future change that made `nearest-car` quotable at 3 % would mean this whole study belongs in
    // the acceptance table instead.
    const result = await study();
    for (const row of result.rows) {
      expect(row.baselineUnquotable, `nearest-car was quotable at ${row.loadPctPop5min} %`).toBe(
        true,
      );
      expect(row.saturatedByArm['nearest-car']).toBeGreaterThan(0);
    }
    console.log(
      'nearest-car saturated replications of ' +
        `${result.replications}: ` +
        result.rows
          .map((row) => `${row.loadPctPop5min} %: ${row.saturatedByArm['nearest-car'] ?? 0}`)
          .join(', '),
    );
    expect(result.referenceId).toBe(TAIL_REFERENCE);
  }, TIMEOUT_MS);

  it('finds fairness-first inert at 1 %, significantly better at 2 %, and unquotable at 3 %', async () => {
    const result = await study();
    // At the load the main table measures, the term has nothing to price: no car holds a committed
    // hall call that a new call would push back, so `starvation` is 0 for every candidate and a term
    // equal across candidates cannot move an `argmin`.
    const low = result.cell(1, 'fairness-first', 'awtS');
    expect(low.verdict === 'INDISTINGUISHABLE' || low.verdict === 'IDENTICAL').toBe(true);

    // One load step up, everything moves — mean, both percentiles, and the long-wait fraction.
    for (const metric of ['awtS', 'wt95S', 'wt99S', 'pctOverLongWait'] as const) {
      const cell = result.cell(2, 'fairness-first', metric);
      expect(cell.verdict, `fairness-first ${metric} at 2 %`).toBe('BETTER');
    }

    // And at 3 % nothing may be quoted at all, because `eta` itself saturates. The finding is that
    // the quotable window is one load step wide — see this module's docstring for the sweep.
    for (const metric of ['awtS', 'wt95S'] as const) {
      expect(result.cell(3, 'fairness-first', metric).verdict).toBe('UNQUOTABLE');
    }
  }, TIMEOUT_MS);

  it('finds the tail moves harder than the mean — which is what a fairness term is for', async () => {
    // The load-bearing claim of the whole module. If `starvation` merely made everything a bit
    // better it would be a worse `waitTime`; what makes it a fairness term is that the effect grows
    // as you move out of the distribution.
    const result = await study();
    const awt = result.cell(2, 'fairness-first', 'awtS');
    const wt95 = result.cell(2, 'fairness-first', 'wt95S');
    const wt99 = result.cell(2, 'fairness-first', 'wt99S');
    console.log(
      'fairness-first − eta at 2 %, as a fraction of eta: ' +
        `AWT ${(awt.relativeEffect * 100).toFixed(2)} %, ` +
        `WT95 ${(wt95.relativeEffect * 100).toFixed(2)} %, WT99 ${(wt99.relativeEffect * 100).toFixed(2)} %`,
    );
    // All three are improvements, and the tail improves by more of itself than the mean does.
    expect(awt.relativeEffect).toBeLessThan(0);
    expect(wt95.relativeEffect).toBeLessThan(awt.relativeEffect);
    expect(wt99.relativeEffect).toBeLessThan(wt95.relativeEffect);
  }, TIMEOUT_MS);

  it('finds fairness-first also more robust than eta — it saturates later', async () => {
    // Not an interval, and it is not reported as one. At 3 % `eta`'s queues diverge on some
    // replications and `fairness-first`'s do not, which is a statement about the design's limit
    // rather than about its mean — and is exactly why the 3 % row above is UNQUOTABLE.
    const result = await study();
    const heavy = result.rows.find((row) => row.loadPctPop5min === 3);
    expect(heavy).toBeDefined();
    console.log(
      `at 3 %: saturated replications — ${Object.entries(heavy?.saturatedByArm ?? {})
        .map(([armId, count]) => `${armId}:${count}`)
        .join(' ')}`,
    );
    expect(heavy?.saturatedByArm['fairness-first'] ?? 0).toBeLessThan(
      heavy?.saturatedByArm[TAIL_REFERENCE] ?? 0,
    );
  }, TIMEOUT_MS);

  it('finds capacity-aware indistinguishable from eta at every load where all arms are quotable', async () => {
    // The honest summary of a term that does not clear the bar in the one window where the bar can
    // be applied. Its `loadFactor` and `crowding` weights need cars near their bypass threshold to
    // price, and by the load at which that happens somebody's queues have diverged.
    const result = await study();
    const cell = result.cell(2, 'capacity-aware', 'awtS');
    expect(cell.verdict).toBe('INDISTINGUISHABLE');
    expect(result.cell(2, 'capacity-aware', 'wt95S').verdict).toBe('INDISTINGUISHABLE');
    expect(result.cell(3, 'capacity-aware', 'awtS').verdict).toBe('UNQUOTABLE');
    console.log(
      `capacity-aware − eta at 2 %: AWT ${cell.comparison.estimate.mean.toFixed(3)} s ` +
        `[${cell.comparison.estimate.lower.toFixed(3)}, ${cell.comparison.estimate.upper.toFixed(3)}] ` +
        `— indistinguishable; it would need n ≈ ` +
        `${Math.ceil(((1.96 * Math.sqrt(cell.comparison.varianceOfDifference)) / Math.abs(cell.comparison.estimate.mean)) ** 2)}, ` +
        'and at every higher load some arm has no quotable AWT.',
    );
  }, TIMEOUT_MS);
});
