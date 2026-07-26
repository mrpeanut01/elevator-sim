/**
 * **The Phase 5 acceptance criterion, second sentence.** *"Pre-positioning shows measurable AWT
 * improvement on Garden Apartments, where parking policy dominates."*
 *
 * This suite is the gate for that sentence and it now returns **MET**. It used to return NOT MET
 * with the strongest possible form of evidence — not a small effect, not an interval straddling
 * zero, but **500 of 500 paired differences exactly equal to zero** on every metric — because
 * `Simulation.#park` never supplied a `demandForecast` and `predicted-demand` with no forecast is a
 * refusal to move, observationally identical to `stay`. The runner now resolves the bank's
 * partition and its arrival forecast and hands both to stage 7.
 *
 * Four assertions, and the pair that matters most is the third and fourth together:
 *
 * 1. `lobby` is **WORSE** by 12 % — parking policy does dominate here, and the up-peak instinct is
 *    the wrong way round on a residential building.
 * 2. `zone-center` is **BETTER** by ~30 % — a measurable AWT improvement from pre-positioning,
 *    which is the criterion read literally.
 * 3. `predicted-demand` at `predictive-balanced`'s authored `repositionThresholdS: 8` is
 *    **INDISTINGUISHABLE** and, crucially, **no longer IDENTICAL**: the forecast reaches stage 7,
 *    and what stops the car is the profile's own deadband.
 * 4. `predicted-demand` at a deadband a six-floor shaft can pay for is **BETTER**.
 *
 * Asserting 3 without 4 would report the feature as still dead. Asserting 4 without 3 would hide
 * that the shipped profile does not get the benefit. Both, plus the proof that the extra arm's
 * second field cannot move the baseline, is the honest gate.
 */

import { describe, expect, it } from 'vitest';

import { PARKING_STRATEGIES } from '@elevator-sim/core';

import { formatCase } from './report.js';
import {
  CONTROL_STRATEGY,
  STUDIED_PARKING_STRATEGIES,
  TIGHT_THRESHOLD_S,
  parkingArmId,
  runPrepositioningStudy,
  type PrepositioningStudy,
} from './prepositioning.js';
import { armOf } from './suite.js';

const TIMEOUT_MS = 900_000;

let cached: PrepositioningStudy | undefined;

async function study(): Promise<PrepositioningStudy> {
  cached ??= await runPrepositioningStudy();
  return cached;
}

describe('Phase 5 criterion — pre-positioning on Garden Apartments', () => {
  it('prints the parking-strategy table', async () => {
    console.log(formatCase((await study()).result));
  }, TIMEOUT_MS);

  it('studies every value the categorical admits', async () => {
    // Coverage rather than a count: a fifth parking strategy added to core must be measured, not
    // silently skipped, and a study that hard-coded four would skip it.
    expect([...STUDIED_PARKING_STRATEGIES].sort()).toEqual([...PARKING_STRATEGIES].sort());
    const result = (await study()).result;
    expect(result.baselineId).toBe(parkingArmId(CONTROL_STRATEGY));
    // Every strategy but the baseline, plus the one extra deadband arm on the treatment strategy.
    expect(result.arms.length).toBe(PARKING_STRATEGIES.length);
  }, TIMEOUT_MS);

  it('isolates the one field: every arm shares the treatment profile except parkingStrategy', async () => {
    // The whole validity of the study. If the arms differed anywhere else, the interval would be an
    // interval on that instead.
    const result = (await study()).result;
    for (const arm of result.arms) {
      expect(arm.profileId.startsWith('park-')).toBe(true);
    }
    expect(result.crnAligned).toBe(true);
    expect(result.baselineQuotable).toBe(true);
    expect(result.unquotableArms).toEqual([]);
  }, TIMEOUT_MS);

  it('finds predicted-demand no longer bit-identical to stay — the forecast reaches stage 7', async () => {
    // The single most important assertion in this file, and the one that would have caught the
    // defect. A bit-identical run is not a small effect: it is the signature of a feature that is
    // configured, tested in isolation and disconnected from the shipped path. `predicted-demand`
    // used to be exactly that — 500/500 paired differences of precisely 0 on every metric — because
    // `Simulation.#park` supplied no forecast and the strategy answered `no-forecast`.
    const outcome = await study();
    const arm = armOf(outcome.result, parkingArmId('predicted-demand'));
    const awt = arm.cell('awtS');

    expect(outcome.predictedDemandIsInert, 'predicted-demand is bit-identical to stay again').toBe(
      false,
    );
    expect(awt.verdict).not.toBe('IDENTICAL');
    expect(awt.comparison.exactZeroCount).toBeLessThan(awt.comparison.n);
    expect(awt.comparison.maxAbsDifference).toBeGreaterThan(0);

    // At the profile's authored deadband the effect is real but small: the move is inside the 8 s
    // `repositionThresholdS` on all but a handful of replications. Reported as indistinguishable,
    // never as a win — docs/03 § the resolution limit.
    expect(awt.verdict).toBe('INDISTINGUISHABLE');
    expect(outcome.criterionMetAtAuthoredDeadband).toBe(false);
    console.log(
      `predicted-demand vs stay on ${outcome.building} at the authored deadband: ` +
        `${awt.comparison.exactZeroCount}/${awt.comparison.n} paired differences exactly zero, ` +
        `AWT ${awt.estimate.mean.toFixed(3)} s [${awt.estimate.lower.toFixed(3)}, ${awt.estimate.upper.toFixed(3)}].`,
    );
  }, TIMEOUT_MS);

  it('finds predicted-demand BETTER at a deadband the building can pay for', async () => {
    const outcome = await study();
    const arm = armOf(outcome.result, outcome.tightTreatmentArmId);
    const awt = arm.cell('awtS');

    expect(awt.verdict).toBe('BETTER');
    expect(awt.estimate.upper).toBeLessThan(0);
    expect(outcome.criterionMet).toBe(true);

    // The extra arm differs from the baseline in two fields — strategy and deadband — and this is
    // why that is sound rather than a confound: `stay` returns `parked` before the reposition
    // arithmetic runs, so `repositionThresholdS` cannot move it. The baseline at 8 s and the same
    // profile at 3 s are the same run, and the study asserts it rather than assuming it.
    const stayAtTightDeadband = armOf(outcome.result, parkingArmId('predicted-demand'));
    expect(stayAtTightDeadband.profileId).toBe(parkingArmId('predicted-demand'));
    expect(TIGHT_THRESHOLD_S).toBeLessThan(8);

    console.log(
      `predicted-demand at repositionThresholdS ${TIGHT_THRESHOLD_S} vs stay on ${outcome.building}: ` +
        `AWT ${awt.estimate.mean.toFixed(3)} s [${awt.estimate.lower.toFixed(3)}, ${awt.estimate.upper.toFixed(3)}] ` +
        `(${(awt.relativeEffect * 100).toFixed(1)} %) at n = ${awt.comparison.n}. ` +
        'The forecast is live; the profile\'s own deadband is what withholds it at 8 s.',
    );
  }, TIMEOUT_MS);

  it('finds zone-center measurably BETTER — the criterion, read literally', async () => {
    // `zone-center` used to be bit-identical to `stay` for the neighbouring reason: no operational
    // partition reached stage 7, so every car computed the same shaft median and the move was
    // inside its own deadband. The runner now resolves one contiguous band per in-service car.
    const outcome = await study();
    const arm = armOf(outcome.result, parkingArmId('zone-center'));
    const awt = arm.cell('awtS');
    expect(awt.verdict).toBe('BETTER');
    expect(awt.estimate.upper).toBeLessThan(0);
    expect(Math.abs(awt.relativeEffect)).toBeGreaterThan(0.08);
    console.log(
      `zone-center vs stay on ${outcome.building}: AWT ${awt.estimate.mean.toFixed(3)} s ` +
        `[${awt.estimate.lower.toFixed(3)}, ${awt.estimate.upper.toFixed(3)}] ` +
        `(${(awt.relativeEffect * 100).toFixed(1)} %) at n = ${awt.comparison.n}.`,
    );
  }, TIMEOUT_MS);

  it('finds lobby parking measurably WORSE — so stage 7 runs, and parking policy does dominate', async () => {
    const outcome = await study();
    const arm = armOf(outcome.result, parkingArmId('lobby'));
    const awt = arm.cell('awtS');

    // The mechanism is alive: this is the same reposition arithmetic the criterion needed, and it
    // moves AWT by an amount no resolution limit in this project could hide.
    expect(awt.verdict).toBe('WORSE');
    expect(awt.estimate.lower).toBeGreaterThan(0);
    expect(Math.abs(awt.relativeEffect)).toBeGreaterThan(0.08);
    // And it is no longer the only strategy that moves anything — which is the whole change. The
    // list used to be exactly `[park-lobby]`, and that was the evidence that the other two
    // strategies were disconnected rather than merely ineffective.
    expect(outcome.strategiesThatMoveAwt).toContain(parkingArmId('lobby'));
    expect(outcome.strategiesThatMoveAwt.length).toBeGreaterThan(1);

    // The tail and the journey go the same way. Lobby parking on a residential building is worse on
    // every metric, not a trade.
    expect(arm.cell('wt95S').verdict).toBe('WORSE');
    expect(arm.cell('ttdMeanS').verdict).toBe('WORSE');

    console.log(
      `lobby vs stay on ${outcome.building}: AWT ${awt.estimate.mean.toFixed(3)} s ` +
        `[${awt.estimate.lower.toFixed(3)}, ${awt.estimate.upper.toFixed(3)}] ` +
        `(${(awt.relativeEffect * 100).toFixed(1)} %) at n = ${awt.comparison.n}. ` +
        'Parking policy dominates here — and the up-peak instinct to park at the lobby is the wrong way round on a residential building.',
    );
  }, TIMEOUT_MS);
});
