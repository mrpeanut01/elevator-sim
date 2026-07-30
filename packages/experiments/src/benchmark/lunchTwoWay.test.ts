/**
 * The mix arc is measured, not asserted — and the three arms are what make the measurement mean
 * something.
 *
 * ## Why the thresholds are critical values and not the observed numbers
 *
 * Every bound below is a χ² or normal critical value fixed by the table's shape, chosen before the
 * study ran. Pinning the observed 383.4 instead would make this a change-detector: it would fail
 * when the arc got *stronger*, which is not a defect, and it would pass on any build that produced
 * some large number for some other reason.
 *
 * ## The mutant this file exists for
 *
 * The template can be authored, cited, resolved, serialized, schema-validated and covered by its
 * own parameter probe while the generator **never applies it** — and every one of those checks
 * still passes, because each of them reads the template rather than the trace. That mutant was run
 * (`multiplier` returning a constant 1) and the whole of `core`'s traffic suite stayed green. This
 * is the file that fails on it: it reads the *passengers*, classified by the detector's own rule,
 * and asks whether their mix moved.
 */

import { describe, expect, it } from 'vitest';

import { measureLunchTwoWayMix, MIX_TIME_BINS, type MixHomogeneity } from './lunchTwoWay.js';

/** Upper-tail critical values of χ² on 10 degrees of freedom. Fixed by the table, not by a result. */
const CHI2_10DF_P05 = 18.307;
const CHI2_10DF_P001 = 29.588;

let study: Awaited<ReturnType<typeof measureLunchTwoWayMix>>;

const armOf = (id: string): MixHomogeneity => {
  const found = study.arms.find((arm) => arm.id === id);
  if (found === undefined) throw new Error(`no arm "${id}"`);
  return found;
};

describe('the lunch two-way template moves the directional mix within the run', async () => {
  study = await measureLunchTwoWayMix();

  it('measures three arms over the table shape § D156 used', () => {
    expect(study.arms.map((arm) => arm.id)).toEqual([
      'lunch-two-way',
      'lunch-two-way-flat',
      'rise-and-fall',
    ]);
    expect(study.bins).toBe(MIX_TIME_BINS);
    // (6 − 1)(3 − 1) = 10, which is the df every § D156 row with more than one category reports.
    for (const arm of study.arms) {
      expect(arm.degreesOfFreedom, arm.id).toBe(10);
      // None of the four one-category cells § D156 found. A 0-df table cannot fail this suite by
      // being flat; it fails by having nothing to be flat about, and that is a different report.
      expect(arm.liveCategories, arm.id).toBe(3);
    }
  });

  it('rejects homogeneity for the arc, and by a margin no counting noise supplies', () => {
    const arc = armOf('lunch-two-way');
    expect(arc.chiSquare).toBeGreaterThan(CHI2_10DF_P001);
    // § D156's whole grid topped out at +1.83 σ. This is the comparison the entry invites.
    expect(Math.abs(arc.largestStandardizedDeviation)).toBeGreaterThan(
      study.shippedTemplateBaselineFromD156 * 2,
    );
  });

  it('moves the ratio, which is the quantity § D151 § 5 says the question is about', () => {
    const arc = armOf('lunch-two-way');
    // Down-dominant when the period opens, lobby-dominant when it closes — the mechanism the
    // template is authored from, read back off the passengers rather than off the template.
    expect(arc.lobbyToDownFirstBin).toBeLessThan(1);
    expect(arc.lobbyToDownLastBin).toBeGreaterThan(1);
    expect(arc.lobbyToDownSwing).toBeGreaterThan(10);
  });

  it('holds the flat control inside its own noise at the same total demand', () => {
    const arc = armOf('lunch-two-way');
    const flat = armOf('lunch-two-way-flat');
    expect(flat.chiSquare).toBeLessThan(CHI2_10DF_P05);
    expect(Math.abs(flat.largestStandardizedDeviation)).toBeLessThan(3);
    expect(flat.lobbyToDownSwing).toBeLessThan(2);
    // § D162 condition 5 is a control only if the demand is equal. The expectation is equal by
    // construction; the realized counts differ by the Poisson draw alone, so 5 % is generous
    // against a ±2·√n/n ≈ 1.5 % sampling band at these counts and still fails a real divergence.
    const relative =
      Math.abs(arc.arrivalsPerReplication - flat.arrivalsPerReplication) / flat.arrivalsPerReplication;
    expect(relative).toBeLessThan(0.05);
  });

  it('reproduces § D156 in kind on the shipped template, at counts an order of magnitude larger', () => {
    const shipped = armOf('rise-and-fall');
    // Not significant on its own table, which is § D156's finding — measured here in this
    // apparatus so the arc above is compared with something and not with a remembered number.
    expect(shipped.chiSquare).toBeLessThan(CHI2_10DF_P05);
    // A looser bound than the flat control gets, and the looseness is measured rather than
    // conceded: the first and last bins sit on the intensity ramp's tails, so this ratio is the
    // sparsest statistic in the table — at the driver's `--fast` budget of 8 replications the same
    // arm reads ×3.8 while its χ² is still 14.0. The arc reads ×135 at that budget, so the
    // separation this suite is about survives; the bound is set where noise cannot reach it and
    // an arc still cannot hide under it.
    expect(shipped.lobbyToDownSwing).toBeLessThan(5);
    // And its counts really are much larger than the 4–36 per window § D156 worked with, which is
    // why its own +1.83 is quoted rather than compared to directly.
    expect(shipped.arrivalsPerReplication).toBeGreaterThan(36);
    expect(shipped.windowArrivals).toBeGreaterThan(1000);
  });

  it('separates the arc from both flat arms by more than either is from the other', () => {
    const arc = armOf('lunch-two-way');
    const flat = armOf('lunch-two-way-flat');
    const shipped = armOf('rise-and-fall');
    // The ordering, not the values. A build where the arc merely edged past a threshold while the
    // two flat arms sat beside it would pass every assertion above and fail this one.
    expect(arc.chiSquare).toBeGreaterThan(10 * Math.max(flat.chiSquare, shipped.chiSquare));
  });
});
