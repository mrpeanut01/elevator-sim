/**
 * **The C→D contrast, asserted — including the part that says the effect is zero.**
 *
 * `destinationDispatchContrast.ts` publishes the table; this file is what makes it a result rather
 * than a paragraph. Three claims, in the order they matter:
 *
 * 1. **The budget is justified.** The contract's `n = 150` was set for arms A–F with `sd(ΔTTD)`
 *    measured on the A→C contrast, and `packages/core`'s `the root DECISIONS.md` records that the C→D
 *    spread was **unmeasured**, so the number did not apply to arm D. It does now: measured
 *    `sd(ΔTTD) = 0.908 s` at the primary point, which needs `n = 13` for a ±0.5 s half-width.
 * 2. **Zero at the primary point is a measurement, not an absence.** 27 of 150 replications are
 *    bit-identical and 123 are not, so the arms are wired and the effect is genuinely small. A
 *    study that reported "no difference" from a run where nothing was exercised would be the
 *    ninth dead seam `docs/09` § 8 warns about.
 * 3. **Where the promise binds, the panel is expensive**, and the sign split — TTD/AWT/WT95 worse,
 *    in-car time better — is the mechanism the theory predicts, so the number is coming from
 *    where it should.
 *
 * Layer A of the publication guard runs here too: the study is run once, cached, and its figures
 * compared against `PINNED_ESTIMATES` at full precision.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  DISPATCH_POINTS,
  MIDTOWN_INTERFLOOR_BINDING,
  contrastProfiles,
  dispatchPoint,
  formatDispatchContrast,
  replicationsForHalfWidth,
  runDestinationDispatchStudy,
  type DispatchContrastStudy,
} from './destinationDispatchContrast.js';
import { DESTINATION_DISPATCH_PROFILE } from './arms.js';
import { checkPinned, describeMismatches, dispatchContrastFigures } from './published.js';
import { cellOf, loadResources, runGateExperiment, withProfiles } from '../validation/harness.js';
import { BENCHMARK_SEED } from './suite.js';

const TIMEOUT_MS = 600_000;

let study: DispatchContrastStudy;

beforeAll(async () => {
  study = await runDestinationDispatchStudy({});
}, TIMEOUT_MS);

describe('Phase 6b — the C→D contrast', () => {
  it('prints the table', () => {
    console.log(formatDispatchContrast(study));
  });

  it('reproduces every published figure at full precision', () => {
    const mismatches = checkPinned('destination-dispatch', dispatchContrastFigures(study));
    expect(mismatches, describeMismatches('destination-dispatch', mismatches)).toEqual([]);
  });

  it('pairs the two arms on the same passenger populations at every point', () => {
    for (const point of study.points) {
      expect(point.crnAligned, `${point.id} lost CRN alignment`).toBe(true);
      expect(point.replications).toBe(150);
    }
  });

  it('measures the C→D spread the contract left unmeasured, and n = 150 covers it', () => {
    /*
     * The claim the phase could not previously make. `docs/09` § 2.5 locked n = 150 with the
     * explicit caveat that *"the Level-1 (C→D) contrast has not been measured and its sd is
     * unknown; 150 leaves headroom for an sd up to ~3.4 s at ±0.5 s"*. Measured here, at the
     * primary point, the sd is 0.908 s — inside that headroom by a factor of about 3.7.
     */
    const primary = study.budget.find((row) => row.pointId === 'midtown-interfloor-mix');
    expect(primary, 'no budget row for the primary point').toBeDefined();
    expect(primary?.sdOfDifference).toBeGreaterThan(0);
    expect(primary?.sdOfDifference).toBeLessThan(3.4);
    // …and the half-width n = 150 actually achieved is better than the ±0.43 s the contract
    // designed the budget for.
    expect(primary?.halfWidth).toBeLessThan(0.43);
    expect(primary?.replicationsForHalfWidth).toBeLessThan(150);

    console.log(
      study.budget
        .map(
          (row) =>
            `${row.pointId}: sd(ΔTTD)=${row.sdOfDifference.toFixed(3)} s, achieved ±${row.halfWidth.toFixed(3)} s at n=150, n for ±0.5 s = ${String(row.replicationsForHalfWidth)}`,
        )
        .join('\n'),
    );
  });

  it('re-derives the required-n arithmetic rather than trusting the study', () => {
    // The one closed-form line in the module, checked against its own definition.
    expect(replicationsForHalfWidth(0.908, 0.5)).toBe(13);
    expect(replicationsForHalfWidth(9.427, 0.5)).toBe(1366);
    // A zero spread needs one replication, not zero and not infinity.
    expect(replicationsForHalfWidth(0, 0.5)).toBe(1);
  });

  it('is indistinguishable at the primary point, and is not identical there', () => {
    /*
     * Both halves. `INDISTINGUISHABLE` alone is compatible with an arm that was never wired;
     * what rules that out is that 123 of 150 replications *did* differ. `IDENTICAL` would be the
     * dead-seam reading, and the verdict machinery reports it as a separate word precisely so
     * this distinction cannot be blurred.
     */
    const point = dispatchPoint(study, 'midtown-interfloor-mix');
    expect(point).toBeDefined();
    expect(point?.quotable).toBe(true);
    expect(point?.cell('ttdMeanS').verdict).toBe('INDISTINGUISHABLE');
    expect(point?.bitIdentical).toBeGreaterThan(0);
    expect(point?.bitIdentical).toBeLessThan(point?.replications ?? 0);
  });

  it('is significantly worse on the journey where the promise binds, and better in the car', () => {
    const point = dispatchPoint(study, 'midtown-interfloor-binding');
    expect(point).toBeDefined();
    expect(point?.quotable, 'the binding point must not be saturated, or it has no interval').toBe(
      true,
    );
    expect(point?.bitIdentical).toBe(0);

    // The gate: worse, and the interval excludes zero.
    const ttd = point?.cell('ttdMeanS');
    expect(ttd?.verdict).toBe('WORSE');
    expect(ttd?.estimate.lower).toBeGreaterThan(0);

    // The cost, reported rather than hidden — D27.
    expect(point?.cell('awtS').verdict).toBe('WORSE');
    expect(point?.cell('wt95S').verdict).toBe('WORSE');

    // The mechanism check. Destination grouping buys in-car time; the landing is where it is
    // paid for. Had the journey improved while the ride worsened, the number would be coming
    // from somewhere the mechanism does not predict.
    const ride = point?.cell('rideMeanS');
    expect(ride?.verdict).toBe('BETTER');
    expect(ride?.estimate.upper).toBeLessThan(0);
  });

  it('censuses the binding point rather than asserting it is clean', async () => {
    /*
     * 4.5 % was chosen as *the highest rate at which both arms keep a quotable AWT*, and a
     * chosen-because-it-worked rate is exactly the "loosened tolerance" `arms.ts` opens by
     * warning against. So the neighbour above it is measured, and the census is what says where
     * the edge actually is rather than where the module would like it to be.
     *
     * **The edge moved, and this census is how that was found (§ D333).** It used to census 6 %,
     * because at 6 % an arm lost its AWT. It no longer does: with the panel's unbounded promise
     * fixed the runs drain, and 6 % comes back **clean on both arms — `saturated=0/60` each**.
     * Swept upward, the first rate that breaks is now **8 %** (`destination-panel-level0`
     * 11 of 60 saturated, the panel arm 51 of 60), so 8 % is the neighbour measured here.
     *
     * **The operating point is deliberately left at 4.5 % and that is a bounded choice, not an
     * oversight.** The honest reading of this module's own rule would move it to 6 %, which is now
     * the highest quotable rate — and doing so would re-publish the whole Phase 6b contrast table
     * a second time inside a change whose subject is a dispatch defect. 4.5 % remains a real point
     * at which the promise binds and every figure pinned against it is still a measurement of it;
     * what is no longer true is that it is *the* edge, and this comment says so rather than
     * leaving the old sentence standing. Moving the point is a re-measurement of its own and is
     * recorded as owed.
     */
    const base = withProfiles(await loadResources(), []);
    const panel = base.dispatcherProfilesById.get(DESTINATION_DISPATCH_PROFILE);
    expect(panel).toBeDefined();
    const dispatcherProfilesById = new Map(base.dispatcherProfilesById);
    for (const profile of contrastProfiles(panel!)) {
      dispatcherProfilesById.set(profile.id, profile);
    }
    const resources = { ...base, dispatcherProfilesById };

    const above = await runGateExperiment({
      id: 'phase6b/census-8pct',
      seed: BENCHMARK_SEED,
      building: 'midtown-office',
      dispatchers: ['destination-panel-level0', DESTINATION_DISPATCH_PROFILE],
      traffic: {
        ...MIDTOWN_INTERFLOOR_BINDING,
        id: 'interfloor-mix-8pct',
        demand: { ...MIDTOWN_INTERFLOOR_BINDING.demand, arrivalRatePctPop5min: 8 },
      },
      replications: 60,
      resources,
    });
    const armC = cellOf(above, 'destination-panel-level0');
    const armD = cellOf(above, DESTINATION_DISPATCH_PROFILE);
    const cleanAbove = armC.aggregate.awtIsValid && armD.aggregate.awtIsValid;
    console.log(
      `census at 8 %: C awtIsValid=${String(armC.aggregate.awtIsValid)} saturated=${String(armC.aggregate.saturatedCount)}/60, ` +
        `D awtIsValid=${String(armD.aggregate.awtIsValid)} saturated=${String(armD.aggregate.saturatedCount)}/60`,
    );
    expect(cleanAbove, '8 % is still clean — the census no longer bounds the edge from above').toBe(
      false,
    );
  }, TIMEOUT_MS);

  it('declares three points and measures three', () => {
    expect(study.points.map((point) => point.id)).toEqual(DISPATCH_POINTS.map((p) => p.id));
    expect(study.gateMetric).toBe('ttdMeanS');
  });
});
