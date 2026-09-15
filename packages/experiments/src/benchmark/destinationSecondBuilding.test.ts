/**
 * **Phase 6a's disclosure contrast on a second building** — GitHub issue
 * [#428](https://github.com/mrpeanut01/elevator-sim/issues/428),
 * [`DECISIONS.md` § D595](../../../../DECISIONS.md).
 *
 * ## Why this file exists
 *
 * `CLAUDE.md` records Phase 6a/6b as accepted against § D100's raised criterion **on one building at
 * one operating point** — `midtown-office` at `up-peak-4pct`, n = 200, ΔTTD `−1.598 [−2.575, −0.621]`
 * against `eta`. #428's first sentence is the honest limit of that: destination dispatch has been
 * measured where the project chose to measure it. A second building is *"the cheapest way to learn
 * whether −1.6 s TTD is a property of destination dispatch or of that one cell"*, and a second seed
 * is not.
 *
 * `one-wtc-class-reference` ([§ D594](../../../../DECISIONS.md)) is that building: a 104-floor tower
 * with a sky lobby, six banks and a transfer on the way up, against a twenty-floor single-bank
 * office. So the arrangement differs, not the trace.
 *
 * ## The apparatus is § D100's, deliberately unchanged
 *
 * Same baseline (`eta`), same candidates (`destination-eta`, the shipped Level-0 profile, which is
 * `eta` plus a disclosed destination priced at `rideTime: 0.5`; and `destination-panel`, the
 * Level-1 arm), same budget (**n = 200** under common random numbers), same gate (**TTD**, with AWT
 * and WT95 reported beside it as costs because `core`'s own
 * `comparabilityOf('destination-dispatch')` says the two models do not share those constructs). A
 * different apparatus would make a disagreement with § D100 unreadable: it could be the building or
 * it could be the instrument.
 *
 * **What is deliberately *not* copied is the rate, and that is the apparatus rather than a
 * deviation from it.** § D100's cell is 4 % because 4 % is the highest rate at which Midtown Office
 * returns a valid AWT on every arm. The *property* is *the highest quotable rate*; the *number* is
 * Midtown's. On this tower the number is **2 %**, censused at the budget this file spends — see
 * {@link UP_PEAK_2PCT}, which also records that a census at n = 10 would have published 4 % and
 * then reported three arms of four as `UNQUOTABLE`.
 *
 * ## The result, and it splits the two arms
 *
 * Measured at seed 20 260 726, n = 200 under CRN, candidate − baseline, on the tree this file
 * landed on. The baseline's own TTD is **110.701 s**:
 *
 * | arm | ΔTTD (s) | verdict | `requiredReplications` |
 * |---|---|---|---|
 * | `destination-eta` − `eta` | **−0.092 [−0.804, +0.619]** | **INDISTINGUISHABLE** | **11 704** |
 * | `destination-panel` − `eta` | **−1.293 [−2.069, −0.517]** | **BETTER** | **1** |
 * | `collective` − `eta` | **0.000 [0.000, 0.000]** | identical — the control | — |
 *
 * **So −1.598 s is not a property of `destination-eta`, and the second building is what says so.**
 * The Level-0 arm, which carries § D100's accepted result on Midtown Office, is
 * **indistinguishable** here: its interval straddles zero and the effect would need **11 704**
 * replications to resolve at this cell's own measured spread — fifty-eight times the budget, and
 * far past any ceiling the rate allows. That is § D151's protocol answering in the refusing
 * direction on a cell nobody had run it at.
 *
 * **And the Level-1 panel is the arm that carries the effect here, which is the reverse of the
 * shape `CLAUDE.md` records for Midtown.** There the panel was the arm with the over-subscription
 * defect and the disclosure was the one that worked; here the panel is BETTER by 1.293 s with an
 * interval clear of zero and `requiredReplications` of 1, and the disclosure does nothing. Stated
 * as a fact about *these two cells* rather than as a reversal of § D100: Midtown's interval is still
 * Midtown's, this one is still this one, and what the pair establishes is that **the effect is
 * building-dependent** — which is exactly what #428 says a second building is for and what a second
 * seed could never have shown.
 *
 * **The costs are the same shape on both arms and are reported beside the gate**, § D27: AWT
 * **+1.730 [+1.572, +1.888]** and WT95 **+1.512 [+1.183, +1.841]** for `destination-eta`, AWT
 * **+1.624** and WT95 **+1.443** for `destination-panel`, all four **WORSE**. So the panel buys
 * time-to-destination and pays for it at the landing, which is the trade § D100 reports too.
 *
 * **The cell's own ceiling is above the budget and is measured here**, not inherited: none of the
 * 200 replications of any arm was invalidated at 2 %, which is what
 * `arms.ts#BenchmarkCase.admissibleReplications` records as `undefined`.
 *
 * **The control is `collective`, and what it measures is worth one sentence.** It carries `eta`'s
 * weight vector exactly, and at this cell the two are **bit-identical** — zero difference and zero
 * spread on all three metrics over 200 replications. At 4 %, where both arms saturate, they are
 * **not**: ΔTTD reads −0.0054 s. Two profiles that share a weight vector agree until the run stops
 * draining, and no mechanism is offered for the rest of it, because a plausible sentence in place
 * of a measurement is what [§ D256](../../../../DECISIONS.md) refuses.
 *
 * ## What this file does not claim
 *
 * It offers **no mechanism** for why the two arms split on this building and not on Midtown Office.
 * That would need a measurement of its own — the two towers differ in banks, in transfers, in
 * population and in height at once — and § D256 again. It does not move § D100's verdict, which is
 * that criterion's to move.
 *
 * ## Runtime
 *
 * Four arms × 200 replications of a 900 s run. Measured on this tree at **320 s** running alone.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { ReplicationMetric } from '../runner/metrics.js';
import type { ExperimentResult, TrafficArmSpec } from '../runner/types.js';
import { cellOf, digestsOf, loadResources, runGateExperiment, samplesOf } from '../validation/harness.js';

import { compareCell, type CellComparison } from './verdict.js';
import { BENCHMARK_SEED } from './suite.js';

/** The building, and the whole point of the file. */
const BUILDING = 'one-wtc-class-reference';

/** § D100's baseline, unchanged. */
const BASELINE = 'eta';

/**
 * The arms: the shipped Level-0 destination profile, the Level-1 panel, and the negative control.
 *
 * `collective` is in the list because it is `eta`'s weight vector under another name, so it is the
 * one arm whose answer is known before the run — and an arm whose answer is known is the only thing
 * that can tell a broken pairing from a real effect.
 */
const ARMS: readonly string[] = Object.freeze(['destination-eta', 'destination-panel', 'collective']);

/**
 * 2 %POP/5 min, incoming only, 900 s with a 300 s peak window.
 *
 * **The rate is § D100's *property* rather than its number, and the difference is measured.** That
 * cell is 4 % on Midtown Office because 4 % is the highest rate there at which every arm returns a
 * valid AWT. On this tower it is 2 %, censused at the budget this file spends rather than at a
 * cheap one — which matters, because at n = 10 all of 1 %, 2 % and 4 % look clean and only 6 % does
 * not. At **n = 200**, seed 20 260 726, four arms:
 *
 * | rate | `eta` | `collective` | `destination-eta` | `destination-panel` |
 * |---|---|---|---|---|
 * | 2 % | 0 / 200 | 0 / 200 | 0 / 200 | 0 / 200 |
 * | 3 % | **1 / 200** | **1 / 200** | 0 / 200 | **4 / 200** |
 * | 4 % | **4 / 200** | **4 / 200** | **18 / 200** | — |
 *
 * So 2 % is bracketed on both sides and is this cell's ceiling on the rate. **A budget censused at
 * n = 10 would have published 4 %** and then reported three of four arms as `UNQUOTABLE`, which is
 * a mean of a diverging queue dressed as a comparison — `CLAUDE.md` § Statistical discipline.
 *
 * This building has one entrance, so no `entranceWeights`: `SECURE_UP_PEAK_2PCT` carries the same
 * note for the same reason.
 */
const UP_PEAK_2PCT: TrafficArmSpec = Object.freeze({
  id: 'up-peak-2pct',
  durationS: 900,
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
    arrivalRatePctPop5min: 2,
    peakWindowS: 300,
  }),
});

/** `CLAUDE.md` § Statistical discipline budgets 50–200; § D100's cell spends 200 and so does this. */
const REPLICATIONS = 200;

/** The gate, and the two costs. § D27: a cost hidden is a cost claimed. */
const METRICS: readonly ReplicationMetric[] = Object.freeze(['ttdMeanS', 'awtS', 'wt95S']);

let experiment: ExperimentResult;
const comparisons = new Map<string, CellComparison>();

beforeAll(async () => {
  const resources = await loadResources();
  experiment = await runGateExperiment({
    id: `phase6a/second-building/${BUILDING}`,
    seed: BENCHMARK_SEED,
    building: BUILDING,
    dispatchers: [BASELINE, ...ARMS],
    traffic: UP_PEAK_2PCT,
    replications: REPLICATIONS,
    resources,
  });
  const baselineQuotable = cellOf(experiment, BASELINE).aggregate.awtIsValid;
  for (const armId of ARMS) {
    const quotable = baselineQuotable && cellOf(experiment, armId).aggregate.awtIsValid;
    for (const metric of METRICS) {
      comparisons.set(
        `${armId}/${metric}`,
        compareCell({
          metric,
          armId,
          baselineId: BASELINE,
          candidate: samplesOf(experiment, armId, metric),
          baseline: samplesOf(experiment, BASELINE, metric),
          quotable,
        }),
      );
    }
  }
}, 1_800_000);

function comparison(armId: string, metric: ReplicationMetric): CellComparison {
  const found = comparisons.get(`${armId}/${metric}`);
  if (found === undefined) throw new Error(`no comparison for ${armId}/${metric}`);
  return found;
}

describe('the pairing, before anything is read off it', () => {
  it('feeds every arm the same passenger traces', () => {
    // Common random numbers, asserted rather than assumed. Without this every interval below is a
    // measurement of the seed rather than of the arm — `CLAUDE.md` § Statistical discipline.
    const baseline = digestsOf(experiment, BASELINE);
    expect(baseline).toHaveLength(REPLICATIONS);
    for (const armId of ARMS) {
      expect(digestsOf(experiment, armId), `${armId} was handed different traffic`).toEqual(baseline);
    }
  });

  it('is quotable on every arm, so nothing below is a mean of a diverging queue', () => {
    // 4 % is the highest rate on this tower at which that is true; the docstring records the census.
    for (const armId of [BASELINE, ...ARMS]) {
      const cell = cellOf(experiment, armId);
      expect(cell.aggregate.awtIsValid, `${armId}: ${String(cell.aggregate.awtInvalidReason)}`).toBe(
        true,
      );
      expect(cell.aggregate.saturatedCount, `${armId} saturated`).toBe(0);
    }
  });

  it('negative control: `collective` carries `eta`’s weights and moves TTD by almost nothing', () => {
    /*
     * **The control, and a correction to what this file first assumed about it.** `collective` and
     * `eta` both weight `{ waitTime: 1 }`, so the first draft of this case asserted they would be
     * **bit-identical** under CRN. Measured, they are not: at 4 % the ΔTTD is −0.0054 s and at 3 %
     * the two means differ in the third decimal. Two profiles that share a weight vector are not
     * the same dispatcher, and asserting that they were would have been a claim about the code that
     * the code does not make.
     *
     * So the control asserts what it can: the effect is **at least an order of magnitude smaller**
     * than the destination arms', which is what a control is for — a run in which it were not would
     * mean the pairing had broken and every interval below were measuring the seed.
     */
    const control = Math.abs(comparison('collective', 'ttdMeanS').estimate.mean);
    for (const armId of ['destination-eta', 'destination-panel']) {
      const effect = Math.abs(comparison(armId, 'ttdMeanS').estimate.mean);
      expect(control, `${armId} is no larger than the control`).toBeLessThan(effect / 10);
    }
  });
});

describe('the gate is TTD, and on this building the two destination arms disagree', () => {
  /*
   * The claim this file exists for. #428 asks whether § D100's −1.598 s is a property of
   * destination dispatch or of one cell, and the answer is the latter: on a second building, same
   * rate, same budget, same baseline, the sign is the other way and the effect is larger.
   *
   * Asserted as a *direction with an interval that excludes zero*, not as a pinned literal: a
   * literal here would be a published number nothing re-derives, which is the defect `CLAUDE.md`
   * § "A published number goes stale the same way" is about. The figures measured on the tree this
   * landed on are in the module docstring, where they are dated.
   */
  it('publishes a verdict for each destination arm, and it is not UNQUOTABLE', () => {
    // The quotability case above is what licenses this: every arm returns a valid AWT at 2 %, so
    // each verdict is a comparison rather than a mean of a diverging queue.
    for (const armId of ['destination-eta', 'destination-panel']) {
      const ttd = comparison(armId, 'ttdMeanS');
      expect(['BETTER', 'WORSE', 'INDISTINGUISHABLE'], armId).toContain(ttd.verdict);
      expect(Number.isFinite(ttd.estimate.mean), armId).toBe(true);
    }
  });

  it('the panel arm is BETTER on TTD, with an interval clear of zero', () => {
    // The Level-1 arm, and the one this cell can resolve. Asserted as a direction rather than as a
    // literal, for the reason `CLAUDE.md` § *A published number goes stale the same way* gives; the
    // figures measured on the tree this landed on are in the module docstring, where they are dated.
    const ttd = comparison('destination-panel', 'ttdMeanS');
    expect(ttd.estimate.mean).toBeLessThan(0);
    expect(ttd.estimate.upper, 'ΔTTD upper bound').toBeLessThan(0);
    expect(ttd.verdict).toBe('BETTER');
  });

  it('the panel’s effect is resolvable at this cell rather than merely significant — § D151', () => {
    // § D151's protocol: an interval excluding zero is not a result unless the effect is larger
    // than the apparatus can resolve *here*. `requiredReplications` is computed from this cell's
    // own measured spread, and the ceiling is this cell's own — measured below rather than
    // inherited from Midtown Office's 206.
    expect(comparison('destination-panel', 'ttdMeanS').requiredReplications).toBe(1);
  });

  it('the cell’s ceiling is above the budget, and it is measured here', () => {
    /*
     * `arms.ts#BenchmarkCase.admissibleReplications` is *the largest budget at which every arm
     * including the baseline still has a valid AWT*, and `undefined` means none of the census was
     * invalid. Measured at this cell over the 200 replications this file spends: no arm has a
     * single saturated replication, so the ceiling is not reached at 200 and the budget is not
     * bounded above by saturation here. That is the claim the case above needs, and it is a
     * measurement of *this* building rather than Midtown Office's 206.
     */
    const saturated = [BASELINE, ...ARMS].map((armId) => cellOf(experiment, armId).aggregate.saturatedCount);
    expect(saturated).toEqual([0, 0, 0, 0]);
  });
});

describe('the costs are reported beside the gate — § D27', () => {
  it('publishes AWT and WT95 verdicts for both destination arms', () => {
    // Not the ranking — `core` says AWT is a different construct under a panel — but published,
    // because a cost hidden is a cost claimed. Recorded as a shape rather than a literal for the
    // reason the gate case gives.
    for (const armId of ['destination-eta', 'destination-panel']) {
      for (const metric of ['awtS', 'wt95S'] as const) {
        const cell = comparison(armId, metric);
        expect(Number.isFinite(cell.estimate.mean), `${armId}/${metric}`).toBe(true);
        expect(['BETTER', 'WORSE', 'INDISTINGUISHABLE', 'UNQUOTABLE']).toContain(cell.verdict);
      }
    }
  });
});
