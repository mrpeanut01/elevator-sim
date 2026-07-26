/**
 * **The Phase 5 acceptance criterion, second sentence.** *"Pre-positioning shows measurable AWT
 * improvement on Garden Apartments, where parking policy dominates."*
 *
 * This suite is the gate for that sentence and it returns **NOT MET**, with the strongest possible
 * form of evidence: not a small effect, not an interval straddling zero, but **500 of 500 paired
 * differences exactly equal to zero** on every metric. Turning `idle.parkingStrategy` from `stay` to
 * `predicted-demand` changes nothing a simulator can observe, because `Simulation.#park` never
 * supplies a `demandForecast` and `predicted-demand` with no forecast is a refusal to move.
 *
 * The suite also asserts the **second half** of the sentence, which is true: parking policy *does*
 * dominate on Garden Apartments. `lobby` parking moves AWT by `+1.97 s [+1.75, +2.20]`, 12 % of the
 * baseline, far above any resolution limit in this project. So stage 7 works; the forecast does not
 * reach it. See this module's implementation docstring for the full table and the reason `lobby` is
 * the *wrong* direction on a residential building.
 *
 * Reporting only the first half would say "pre-positioning does nothing here" and imply the building
 * was a bad choice. Reporting only the second would say "parking matters, criterion met". Both are
 * false. Asserting both is the only honest gate.
 */

import { describe, expect, it } from 'vitest';

import { PARKING_STRATEGIES } from '@elevator-sim/core';

import { formatCase } from './report.js';
import {
  CONTROL_STRATEGY,
  STUDIED_PARKING_STRATEGIES,
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
    expect(result.arms.length).toBe(PARKING_STRATEGIES.length - 1);
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

  it('finds predicted-demand BIT-IDENTICAL to stay — the criterion is NOT MET', async () => {
    const outcome = await study();
    const arm = armOf(outcome.result, parkingArmId('predicted-demand'));
    for (const cell of arm.cells) {
      expect(cell.verdict, `${cell.metric} was not IDENTICAL`).toBe('IDENTICAL');
      // Not "the interval contains zero". Every single paired difference is exactly zero.
      expect(cell.comparison.exactZeroCount).toBe(cell.comparison.n);
      expect(cell.comparison.maxAbsDifference).toBe(0);
      expect(cell.estimate.mean).toBe(0);
    }
    expect(outcome.predictedDemandIsInert).toBe(true);
    expect(outcome.criterionMet).toBe(false);
    console.log(
      `predicted-demand vs stay on ${outcome.building}: ${arm.cells[0]?.comparison.exactZeroCount}/${outcome.replications} ` +
        'paired differences exactly zero, on every metric. Pre-positioning has no effect in a full run.',
    );
  }, TIMEOUT_MS);

  it('finds zone-center bit-identical too, for the neighbouring reason', async () => {
    // `Simulation.#dispatchBank` supplies no operational-zone partition either, so `zone-center`
    // falls back to the shaft median — which on a six-floor building is inside its own
    // `repositionThresholdS` deadband. Two different missing context fields, one identical outcome.
    const arm = armOf((await study()).result, parkingArmId('zone-center'));
    expect(arm.cell('awtS').verdict).toBe('IDENTICAL');
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
    // And it is the only strategy that moves anything, which is what separates "the forecast never
    // arrives" from "repositioning cannot matter on this building".
    expect(outcome.strategiesThatMoveAwt).toEqual([parkingArmId('lobby')]);

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
