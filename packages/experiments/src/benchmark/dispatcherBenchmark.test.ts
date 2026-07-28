/**
 * **The Phase 5 acceptance criterion, first sentence.** *"Each dispatcher beats
 * `NearestCarDispatcher` with a paired-t interval excluding zero on at least one building."*
 *
 * This suite is the gate for that sentence and it returns **MET, with a caveat that matters more than
 * the verdict**. Both halves are asserted here, because reporting the first without the second would
 * be true and misleading.
 *
 * ## The verdict: 9 of 9, and one arm that is also WORSE somewhere
 *
 * Every arm in `data/dispatcher-profiles.json` beats `nearest-car` with a 95 % paired-t interval
 * excluding zero on at least one building. Nine arms, because the aggregation is a profile field
 * now and the file ships `auction` and `auction-multi-round`. There are two cells in 108 that are
 * not `BETTER`, both named in the assertions below: `predictive-balanced`'s AWT on Garden Apartments
 * is `-0.23 s [-0.47, +0.02]` and therefore INDISTINGUISHABLE (it would need n ≈ 579; the budget was
 * 500), and `zoned-uppeak` on Secure Tower is **WORSE** on all four metrics.
 *
 * The margins are not marginal. On Midtown Office up-peak the spread is `nearest-car` 22.70 s against
 * `eta` 15.90 s and `zoned-uppeak` 14.54 s — a **30 % to 36 % improvement**, comfortably above the
 * 8–12 % Phase 3 measured as the resolution limit at n = 100, and above it at every budget these
 * buildings admit.
 *
 * ## The caveat: what the arms share, and what they no longer share
 *
 * This section used to read *"three arms are the same dispatcher"* — `eta ≡ fairness-first ≡
 * `zoned-uppeak` on the up-peak buildings, `rho = 1`, interval `[0, 0]`, every metric, every
 * replication — and gave the cause as `Simulation.#dispatchBank` passing
 * `{ waitingPassengers, waitingMassKg }` and no `zoneFloorIdsByCarId`, so that `zoneAffinity`
 * evaluated to 0 for every car. The runner resolves a group context now, and the test at the bottom
 * of this file refutes the old claim: `zoned-uppeak` is bit-identical to `eta` **nowhere**. Measured
 * through the shipped engine on Midtown Office, `zoneAffinity` went from 0 non-zero evaluations in
 * 437 to 355 in 472, with cross-car spread in 142 of the profile's 144 decisions.
 *
 * What survives is `eta ≡ fairness-first` on the two up-peak cases, and it is correct rather than a
 * gap: `starvation` is the age of the oldest *committed hall call this car would push back*, and at
 * an up-peak lobby no car holds one, so the term is 0 for every candidate and a term equal across
 * candidates cannot move an `argmin`. On Garden Apartments at n = 500 nothing is identical to
 * anything.
 *
 * ## `zoned-uppeak` is the best arm on two buildings and the worst on the third
 *
 * The live weight cuts both ways, which is the finding. `zoned-uppeak` beats the baseline by
 * **−35.9 % AWT on Midtown** and **−38.9 % on Garden** — the largest margins in the study — and is
 * **+8.9 % WORSE on Secure Tower**, on AWT, WT95, % > 60 s and TTD alike. The cause decomposes to
 * the cost term rather than the parking strategy, and the decomposition is in the assertion below.
 * The weight is left at the hand-authored `0.3` rather than tuned down to make a gate pass.
 *
 * ## And one arm is worse than the simplest arm
 *
 * `predictive-balanced` — ten weighted terms, deferred assignment, split demand, adaptive dwell,
 * reassignment on deceleration — beats the baseline and **loses to `eta`** on AWT everywhere:
 * `+3.00 s [+2.59, +3.41]` on Midtown, `+1.76 s [+1.54, +1.98]` on Secure Tower, `+1.05 s
 * [+0.94, +1.17]` on Garden. It buys that with TTD, where it is better than `eta` on Midtown
 * (`-1.14 s [-1.80, -0.48]` paired). That is a real Pareto trade and docs/06 § *Do not scalarize too
 * early* predicted it exactly: more terms is not more performance on the metric you happen to be
 * reading.
 *
 * It also has the study's most interesting single property, visible only in the saturation census and
 * not in any interval: **at 4 % of population per 5 minutes on Midtown Office, `predictive-balanced`
 * is the only profile in the library that does not saturate.** See `saturationCensus.test.ts` for
 * the census as it stands.
 */

import { describe, expect, it } from 'vitest';

import { comparePaired, loadResources, samplesOf, withProfiles } from '../validation/harness.js';

import { ARM_PROFILES, BASELINE_PROFILE, BENCHMARK_CASES } from './arms.js';
import { criterionOutcomes, formatBenchmark } from './report.js';
import { armOf, runBenchmark, type CaseResult } from './suite.js';
import { benchmarkFigures, checkPinned, describeMismatches } from './published.js';

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
    // Where an arm loses to the baseline, it is named rather than averaged away — a change that
    // makes an arm worse must not hide behind a win on some other metric. There is exactly one such
    // arm and its regression is a finding rather than a defect: `zoned-uppeak` is WORSE than
    // `nearest-car` on Secure Tower, on all four metrics, and BETTER on the other two buildings by
    // the largest margins in the study (−35.9 % AWT on Midtown, −38.9 % on Garden).
    //
    // The cause is decomposable and was measured: with `zoneAffinity` weighted at 0 and everything
    // else held (seed 20260726, 60 replications, Secure Tower up-peak 2 %), the same profile runs at
    // 14.29 s against `eta`'s 15.37 — better than the field. With the weight restored it runs at 23.78. So the
    // regression is the **cost term**, not the parking strategy, and it is a regression that could
    // not exist before this phase because the term evaluated to zero for every car in every run.
    // A static contiguous partition prices a car for being outside a band on a building whose
    // *access* zoning already partitions the population differently, and the two disagree.
    // `weights.zoneAffinity: 0.3` was hand-authored and never measurable; it is left as authored
    // rather than tuned down to make this assertion pass.
    const worse = outcomes.filter((outcome) => outcome.worseOn.length > 0);
    expect(worse.map((outcome) => outcome.armId)).toEqual(['zoned-uppeak']);
    expect(worse[0]?.worseOn.map((entry) => entry.caseId)).toEqual(['secure-up-peak']);
  }, TIMEOUT_MS);

  it('measures every arm as BETTER on AWT except two named cells', async () => {
    const results = await benchmark();
    const notBetter: string[] = [];
    for (const result of results) {
      for (const arm of result.arms) {
        const cell = arm.cell('awtS');
        if (cell.verdict !== 'BETTER') notBetter.push(`${result.caseId}/${arm.armId}`);
      }
    }
    // Two cells of 33, both named and both explained. `predictive-balanced` on Garden is below the
    // resolution limit at this budget — the building the pre-positioning criterion is about, which
    // is not a coincidence; see `prepositioning.test.ts`. `zoned-uppeak` on Secure Tower is WORSE,
    // and the assertion above decomposes why.
    expect(notBetter).toEqual([
      'garden-residential/predictive-balanced',
      'secure-up-peak/zoned-uppeak',
    ]);

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
    // One cell is exempt, by name, and it is the same cell the AWT assertion names: `zoned-uppeak`
    // on Secure Tower is worse on the tail as well as the mean. Exempting it by id rather than
    // loosening the assertion keeps every other cell held to `BETTER`.
    const EXEMPT = 'secure-up-peak/zoned-uppeak';
    for (const result of await benchmark()) {
      for (const arm of result.arms) {
        const cellId = `${result.caseId}/${arm.armId}`;
        if (cellId === EXEMPT) continue;
        expect(arm.cell('wt95S').verdict, `${cellId} WT95`).toBe('BETTER');
        expect(arm.cell('pctOverLongWait').verdict, `${cellId} %>60s`).toBe('BETTER');
      }
    }
    /*
     * And the statement that used to be the strongest single one in the study: on the up-peak
     * cases the baseline was the only dispatcher in the library that made anybody wait more than a
     * minute at all. It now has **two** company, and both are named per cell rather than by arm id,
     * so an arm that is exempt on one building is still held to exactly zero on the other:
     *
     * | cell | mean % > 60 s | why |
     * |---|---|---|
     * | `midtown-up-peak/zoned-uppeak` | 0.1323 | the live `zoneAffinity` weight; still −98.2 % against the baseline's 7.355 |
     * | `secure-up-peak/zoned-uppeak` | 8.539 | the same weight, and worse than the baseline's 4.430 — decomposed in the AWT assertion above |
     * | `midtown-up-peak/destination-panel` | 0.01667 | **Phase 6b.** The write-once promise (DECISIONS.md § D29): a passenger the panel promised a car that then filled waits for *that* car rather than the next one. −99.8 % against the baseline, and the same mechanism `destinationDispatchContrast.ts` measures at scale — at 4.5 % of population per 5 minutes it costs 37 s of WT95 |
     *
     * `secure-up-peak/destination-panel` is **exactly 0**, and the per-cell form is what keeps that
     * asserted: a blanket exemption by arm id would have stopped checking it.
     */
    const OVER_LONG_WAIT_EXEMPT: ReadonlySet<string> = new Set([
      'midtown-up-peak/zoned-uppeak',
      'secure-up-peak/zoned-uppeak',
      'midtown-up-peak/destination-panel',
    ]);
    for (const caseId of ['midtown-up-peak', 'secure-up-peak']) {
      const result = (await benchmark()).find((entry) => entry.caseId === caseId) as CaseResult;
      expect(result.baselineMeans.pctOverLongWait).toBeGreaterThan(0);
      for (const arm of result.arms) {
        const cellId = `${result.caseId}/${arm.armId}`;
        if (OVER_LONG_WAIT_EXEMPT.has(cellId)) {
          // Exempt from "exactly zero", not from being reported: a named cell must still be
          // non-zero, or the exemption has outlived the finding it was written for.
          expect(arm.means.pctOverLongWait, `${cellId} is exempt but no longer non-zero`).toBeGreaterThan(0);
          continue;
        }
        expect(arm.means.pctOverLongWait, cellId).toBe(0);
      }
    }
  }, TIMEOUT_MS);

  it('finds zoned-uppeak no longer bit-identical to eta, and fairness-first still correctly is', async () => {
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
    // This assertion used to run the other way, and it was the sharpest evidence in the whole gate
    // that something was disconnected: `zoned-uppeak` was `eta` on **every** case — `rho = 1`,
    // interval `[0, 0]`, every metric, every replication — because `zoneAffinity` was never given a
    // partition to price against and a single-term cost scaled by 0.7 has `eta`'s `argmin`. An arm
    // that is bit-identical to another arm is not indistinguishable at this budget; it is the same
    // dispatcher under two names, and no budget changes that.
    //
    // It is no longer identical anywhere. The runner resolves the partition and hands it to stage 3,
    // so the weight prices something, and the profile's `zone-center` parking moves cars as well.
    for (const result of results) {
      const withEta = result.identityClasses.find((members) => members.includes('eta')) ?? [];
      expect(withEta, `${result.caseId} still has zoned-uppeak ≡ eta`).not.toContain('zoned-uppeak');
    }
    // `fairness-first` remains identical to `eta` on the two up-peak cases, and that is correct
    // rather than a gap: `starvation` is zero for every candidate when no car holds a committed hall
    // call the new one would delay, which is what an up-peak lobby looks like. A term with no
    // information must contribute no cost.
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


/* -------------------------------------------------------------------------- *
 * Layer A of the publication guard — see published.ts
 * -------------------------------------------------------------------------- */

describe('the figures this study publishes still come out of it', () => {
  it('reproduces every pinned estimate, at full precision', async () => {
    // Free: the study above is already run and cached, so this is arithmetic on a result the suite
    // has paid for. What it catches is the defect nothing else in this repository can — a docstring
    // whose numbers the code stopped producing two commits ago.
    const mismatches = checkPinned('benchmark', benchmarkFigures(await benchmark()));
    expect(describeMismatches('benchmark', mismatches), describeMismatches('benchmark', mismatches)).toBe(
      '',
    );
  }, TIMEOUT_MS);
});
