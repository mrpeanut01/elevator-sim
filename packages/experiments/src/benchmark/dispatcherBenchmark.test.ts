/**
 * **The Phase 5 acceptance criterion, first sentence.** *"Each dispatcher beats
 * `NearestCarDispatcher` with a paired-t interval excluding zero on at least one building."*
 *
 * This suite is the gate for that sentence and it returns **MET, with a caveat that matters more than
 * the verdict**. Both halves are asserted here, because reporting the first without the second would
 * be true and misleading.
 *
 * ## The verdict: 8 of 8, on all three buildings, on all four metrics
 *
 * Every arm in `data/dispatcher-profiles.json` beats `nearest-car` with a 95 % paired-t interval
 * excluding zero — not on one building but on all three, and not on AWT alone but on WT95, % > 60 s
 * and TTD too. There is exactly one exception in 96 cells: `predictive-balanced`'s AWT on Garden
 * Apartments, which is `-0.22 s [-0.46, +0.03]` and therefore INDISTINGUISHABLE (it would need
 * n ≈ 620; the budget was 500).
 *
 * The margins are not marginal. On Midtown Office up-peak the spread is `nearest-car` 22.70 s against
 * `eta` 15.90 s — a **30 % improvement**, comfortably above the 8–12 % Phase 3 measured as the
 * resolution limit at n = 100, and above it at every budget these buildings admit.
 *
 * ## The caveat: three arms are the same dispatcher
 *
 * `eta`, `fairness-first` and `zoned-uppeak` produce **bit-identical runs** on Midtown Office and
 * Secure Tower — every metric, every replication, `rho = 1`, paired interval `[0, 0]`. On Garden
 * Apartments at n = 500 `fairness-first` finally separates (by 0.01 s), leaving `eta ≡ zoned-uppeak`.
 * So a third of the arms that "beat the baseline" beat it with `eta`'s `waitTime` term and with
 * nothing of their own:
 *
 * | arm | its signature mechanism | why it contributes nothing |
 * |---|---|---|
 * | `zoned-uppeak` | `zoneAffinity: 0.3` | `Simulation.#dispatchBank` passes `{ waitingPassengers, waitingMassKg }` and no `zoneFloorIdsByCarId`, so `zoneAffinity` evaluates to 0 for every car. `waitTime: 0.7` alone has the same `argmin` as `waitTime: 1.0` — scaling a single-term cost cannot move an `argmin`. Its `split-demand` at 10 waiting does not trigger at 1 % of population |
 * | `fairness-first` | `starvation: 0.5` | `starvation` is the age of the oldest *committed hall call this car would push back*. At these loads a car rarely holds one, so the term is 0 for every candidate — and a term equal across candidates cannot move an `argmin` either. Its `until-commitment` reassignment never finds an improvement above its 2 s hysteresis |
 *
 * Both are correct code being handed a context that makes them inert, and neither is a defect in this
 * suite's arithmetic — `IDENTICAL` is exactly the verdict `verdict.ts` exists to be able to give. The
 * honest reading of the criterion is therefore: **it is met, and it is met too easily, because
 * `nearest-car` is a weak enough baseline that a single wait-time term clears it by 30 %.** A
 * criterion that separated the arms from each other would not have been met by three of them.
 *
 * ## And one arm is worse than the simplest arm
 *
 * `predictive-balanced` — eleven weighted terms, deferred assignment, split demand, adaptive dwell,
 * reassignment on deceleration — beats the baseline and **loses to `eta`** on AWT everywhere:
 * `+3.22 s [+2.81, +3.63]` on Midtown, `+1.97 s [+1.75, +2.18]` on Secure Tower, `+1.06 s
 * [+0.95, +1.18]` on Garden. It buys that with TTD, where it is the best arm on Midtown (`-11.76 s`
 * against the baseline against `eta`'s `-10.31 s`; the paired difference against `eta` is
 * `-1.44 s [-2.12, -0.77]`). That is a real Pareto trade and docs/06 § *Do not scalarize too early*
 * predicted it exactly: more terms is not more performance on the metric you happen to be reading.
 *
 * It also has the study's most interesting single property, visible only in the saturation census and
 * not in any interval: **at 4 % of population per 5 minutes on Midtown Office, `predictive-balanced`
 * is the only profile in the library that does not saturate.** The baseline diverges on 52
 * replications in 100, `eta` on 8, `auction` on 7, `zoned-uppeak` on 4, `capacity-aware` on 1, and
 * `predictive-balanced` on **0**. So the arm that loses to `eta` by 3 s at 1 % load is the arm still
 * standing at 4 ×, and no AWT interval can express that because every other arm's mean has been
 * suppressed. See `saturationCensus.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { comparePaired, loadResources, samplesOf, withProfiles } from '../validation/harness.js';

import { ARM_PROFILES, BASELINE_PROFILE, BENCHMARK_CASES } from './arms.js';
import { criterionOutcomes, formatBenchmark } from './report.js';
import { armOf, runBenchmark, type CaseResult } from './suite.js';

const TIMEOUT_MS = 900_000;

let cached: readonly CaseResult[] | undefined;

/** The whole benchmark, once per worker. Every test below reads the same measurement. */
async function benchmark(): Promise<readonly CaseResult[]> {
  cached ??= await runBenchmark({ resources: withProfiles(await loadResources(), []) });
  return cached;
}

describe('Phase 5 criterion — each dispatcher against nearest-car', () => {
  it('prints the full comparison table', async () => {
    console.log(formatBenchmark(await benchmark()));
  }, TIMEOUT_MS);

  it('runs every arm on the same passenger populations as the baseline', async () => {
    // Without this the paired intervals below are not paired and nothing else in the suite means
    // anything. Audited from the runner's own per-replication trace digests, not from the design.
    for (const result of await benchmark()) {
      expect(result.crnAligned, `${result.label} lost CRN alignment`).toBe(true);
    }
  }, TIMEOUT_MS);

  it('quotes an interval for every cell — nothing saturated at these operating points', async () => {
    for (const result of await benchmark()) {
      expect(result.baselineQuotable).toBe(true);
      expect(result.unquotableArms).toEqual([]);
      expect(result.baselineSaturatedCount).toBe(0);
    }
  }, TIMEOUT_MS);

  it('finds every arm beats the baseline on at least one building — the criterion is MET', async () => {
    const outcomes = criterionOutcomes(await benchmark());
    expect(outcomes.map((outcome) => outcome.armId)).toEqual([...ARM_PROFILES]);
    for (const outcome of outcomes) {
      expect(
        outcome.meetsCriterion,
        `${outcome.armId} never beat ${BASELINE_PROFILE} on any building`,
      ).toBe(true);
    }
    // And nothing loses to the baseline anywhere. Asserted so that a future change which makes an
    // arm worse cannot hide behind a win on some other metric.
    for (const outcome of outcomes) {
      expect(outcome.worseOn, `${outcome.armId} is WORSE than the baseline somewhere`).toEqual([]);
    }
  }, TIMEOUT_MS);

  it('measures every arm as BETTER on AWT except predictive-balanced on Garden', async () => {
    const results = await benchmark();
    const indistinguishable: string[] = [];
    for (const result of results) {
      for (const arm of result.arms) {
        const cell = arm.cell('awtS');
        if (cell.verdict !== 'BETTER') indistinguishable.push(`${result.caseId}/${arm.armId}`);
      }
    }
    // Exactly one cell of 24 fails to clear zero, and it is the pre-positioning profile on the
    // building the pre-positioning criterion is about. That is not a coincidence — see
    // `prepositioning.test.ts`.
    expect(indistinguishable).toEqual(['garden-residential/predictive-balanced']);

    const garden = results.find((result) => result.caseId === 'garden-residential') as CaseResult;
    const cell = armOf(garden, 'predictive-balanced').cell('awtS');
    expect(cell.verdict).toBe('INDISTINGUISHABLE');
    // The report must be "below resolution at this budget", with the budget it *would* need, and
    // never the point estimate dressed up as a win.
    expect(cell.requiredReplications).toBeGreaterThan(garden.replications);
    console.log(
      `predictive-balanced AWT on Garden: ${cell.estimate.mean.toFixed(3)} s ` +
        `[${cell.estimate.lower.toFixed(3)}, ${cell.estimate.upper.toFixed(3)}] at n = ${cell.comparison.n}; ` +
        `would need n ≈ ${cell.requiredReplications}`,
    );
  }, TIMEOUT_MS);

  it('improves the tail as well as the mean — WT95 and % > 60 s on every case', async () => {
    // The reason both are in `BENCHMARK_METRICS`. A dispatcher that pulled the mean down while
    // leaving the tail alone would pass an AWT-only gate, and the tail is what passengers call bad.
    for (const result of await benchmark()) {
      for (const arm of result.arms) {
        expect(arm.cell('wt95S').verdict, `${result.caseId}/${arm.armId} WT95`).toBe('BETTER');
        expect(arm.cell('pctOverLongWait').verdict, `${result.caseId}/${arm.armId} %>60s`).toBe(
          'BETTER',
        );
      }
    }
    // And the strongest single statement in the study: on the up-peak cases the baseline is the only
    // dispatcher in the library that makes anybody wait more than a minute at all.
    for (const caseId of ['midtown-up-peak', 'secure-up-peak']) {
      const result = (await benchmark()).find((entry) => entry.caseId === caseId) as CaseResult;
      expect(result.baselineMeans.pctOverLongWait).toBeGreaterThan(0);
      for (const arm of result.arms) expect(arm.means.pctOverLongWait).toBe(0);
    }
  }, TIMEOUT_MS);

  it('finds three arms bit-identical to eta — the criterion is met by a term that never fires', async () => {
    const results = await benchmark();
    const classes = new Map<string, readonly (readonly string[])[]>();
    for (const result of results) {
      classes.set(
        result.caseId,
        result.identityClasses.filter((members) => members.length > 1),
      );
      console.log(
        `${result.label}: bit-identical classes — ` +
          (result.identityClasses
            .filter((members) => members.length > 1)
            .map((members) => members.join(' ≡ '))
            .join('; ') || 'none'),
      );
    }
    // `zoned-uppeak` is `eta` on every case: `zoneAffinity` is never given a partition to price
    // against, and a single-term cost scaled by 0.7 has `eta`'s `argmin`.
    for (const result of results) {
      const withEta = result.identityClasses.find((members) => members.includes('eta'));
      expect(withEta, `${result.caseId} lost the eta identity class`).toContain('zoned-uppeak');
    }
    // On the two up-peak cases `fairness-first` joins them, because `starvation` is zero for every
    // candidate when no car holds a committed hall call the new one would delay.
    for (const caseId of ['midtown-up-peak', 'secure-up-peak']) {
      const found = classes.get(caseId) ?? [];
      expect(found.some((members) => members.includes('fairness-first'))).toBe(true);
    }
  }, TIMEOUT_MS);

  it('finds predictive-balanced loses to eta on AWT while winning on TTD — a real Pareto trade', async () => {
    const results = await benchmark();
    for (const result of results) {
      const awt = comparePaired(
        'awtS',
        samplesOf(result.experiment, 'predictive-balanced', 'awtS'),
        samplesOf(result.experiment, 'eta', 'awtS'),
      );
      const ttd = comparePaired(
        'ttdMeanS',
        samplesOf(result.experiment, 'predictive-balanced', 'ttdMeanS'),
        samplesOf(result.experiment, 'eta', 'ttdMeanS'),
      );
      console.log(
        `${result.label}: predictive-balanced − eta  AWT ${awt.estimate.mean.toFixed(3)} ` +
          `[${awt.estimate.lower.toFixed(3)}, ${awt.estimate.upper.toFixed(3)}]  ` +
          `TTD ${ttd.estimate.mean.toFixed(3)} [${ttd.estimate.lower.toFixed(3)}, ${ttd.estimate.upper.toFixed(3)}]`,
      );
      // Worse on the mean wait, significantly, on every case.
      expect(awt.significant, `${result.caseId}: AWT difference against eta not significant`).toBe(
        true,
      );
      expect(awt.estimate.mean).toBeGreaterThan(0);
    }
    // The compensation: on Midtown it is the *best* arm on time-to-destination, better than `eta`.
    const midtown = results.find((result) => result.caseId === 'midtown-up-peak') as CaseResult;
    const pbTtd = armOf(midtown, 'predictive-balanced').cell('ttdMeanS').estimate.mean;
    const etaTtd = armOf(midtown, 'eta').cell('ttdMeanS').estimate.mean;
    expect(pbTtd).toBeLessThan(etaTtd);
  }, TIMEOUT_MS);

  it('records the correlation CRN achieved, which is a per-building fact and not a constant', async () => {
    // Phase 3 measured ~0.61 between structurally different dispatchers and warned that the 5–20×
    // CRN benefit does not hold there. It holds much better on Garden, and the reason is structural:
    // two cars over six floors leaves little for two dispatchers to disagree about.
    const rows: string[] = [];
    for (const result of await benchmark()) {
      const rho = armOf(result, 'eta').cell('awtS').comparison.correlation;
      const halfWidth = armOf(result, 'eta').cell('awtS').estimate.halfWidth;
      rows.push(
        `${result.label}: rho(eta, nearest-car) = ${rho.toFixed(3)}, paired half-width ${halfWidth.toFixed(3)} s at n = ${result.replications}`,
      );
      expect(Number.isFinite(rho)).toBe(true);
    }
    for (const row of rows) console.log(row);
    const [midtown, garden] = await Promise.all([
      benchmark().then((r) => r.find((x) => x.caseId === 'midtown-up-peak') as CaseResult),
      benchmark().then((r) => r.find((x) => x.caseId === 'garden-residential') as CaseResult),
    ]);
    // The regime difference, asserted rather than narrated: Garden pairs far better than Midtown.
    expect(armOf(garden, 'eta').cell('awtS').comparison.correlation).toBeGreaterThan(
      armOf(midtown, 'eta').cell('awtS').comparison.correlation,
    );
  }, TIMEOUT_MS);

  it('covers every case and every arm declared in arms.ts', async () => {
    const results = await benchmark();
    expect(results.map((result) => result.caseId)).toEqual(BENCHMARK_CASES.map((spec) => spec.id));
    for (const result of results) {
      expect(result.arms.map((arm) => arm.armId)).toEqual([...ARM_PROFILES]);
      expect(result.baselineId).toBe(BASELINE_PROFILE);
    }
    // Every shipped profile is either the baseline or an arm. A profile added to `data/` and not to
    // `ARM_PROFILES` would silently escape the gate.
    const shipped = [...(await loadResources()).dispatcherProfilesById.keys()].sort();
    expect([BASELINE_PROFILE, ...ARM_PROFILES].sort()).toEqual(shipped);
  }, TIMEOUT_MS);
});
