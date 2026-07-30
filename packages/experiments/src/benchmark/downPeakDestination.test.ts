/**
 * **T49 — the answer to `docs/07` § 8's open question, asserted rather than narrated.**
 *
 * The question was *"whether **any** destination weight can carry information at such a point"*, and
 * the register's reason for leaving it open was that raising `rideTime` fourfold moved nothing. The
 * assertions here are the ones that would go red if the answer changed, and they are deliberately of
 * three different shapes, because the finding has three parts:
 *
 * 1. **Counts** for the structural facts — every generated leg ends at the entrance, ten of the
 *    twelve terms are bit-identical across the disclosure gate, the withheld side of `stopCount` is
 *    in `eta`'s identity class. An exactly-zero paired difference is categorical (`docs/07` § 4) and
 *    an interval on one would invite a resolution question to be read into a wiring question.
 * 2. **Cross-car spread** for the mechanism — `rideTime` separates the cars in 1 of 1727 contested
 *    decisions and `stopCount` in 139 once the destination is disclosed and **0** when it is not.
 *    That is the difference between *blind* and *under-weighted*, and it is what makes *"no weight
 *    can help"* a measurement rather than a hope.
 * 3. **Intervals** where something moves — `stopCount` under disclosure is WORSE on AWT, WT95 and
 *    TTD at every weight from 0.5 up, and INDISTINGUISHABLE on energy. The answer to the question is
 *    *yes, and it does not pay*, and both halves need saying.
 *
 * The study is run **once** and cached, as every other suite here does: it costs ~13 s, most of it
 * the instrumented census.
 */

import { describe, expect, it } from 'vitest';

import {
  DESTINATION_READING_TERMS,
  DOWN_PEAK_BASELINE,
  DOWN_PEAK_REPLICATIONS,
  GATE_SPECS,
  GATE_WEIGHTS,
  downPeakCell,
  gateArmId,
  gateContrast,
  runDownPeakDestinationStudy,
  type DownPeakDestinationStudy,
} from './downPeakDestination.js';
import { checkPinned, describeMismatches, downPeakFigures } from './published.js';

/** The study runs once and every assertion reads it. ~13 s, most of it the instrumented census. */
const TIMEOUT_MS = 300_000;

let cached: Promise<DownPeakDestinationStudy> | undefined;
const study = async (): Promise<DownPeakDestinationStudy> => {
  cached ??= runDownPeakDestinationStudy();
  return await cached;
};

const verdictsOf = (
  result: DownPeakDestinationStudy,
  termId: string,
  weight: number,
): Record<string, string> =>
  Object.fromEntries(
    gateContrast(result, termId, weight).cells.map((cell) => [cell.metric, cell.verdict]),
  );

describe('the down-peak destination question', () => {
  it('measures the operating point the question is about, at an admissible budget', async () => {
    const result = await study();
    expect(result.cell.id).toBe('garden-down-peak');
    expect(result.replications).toBe(DOWN_PEAK_REPLICATIONS);
    // The budget is admissible because this cell's own census says so, not because a neighbouring
    // module's ceiling was inherited. docs/07 § 4: a ceiling belongs to a (building, traffic, seed).
    expect(result.worstSaturatedCount).toBe(0);
    expect(result.baselineQuotable).toBe(true);
    // Common random numbers: every arm's replication i saw the baseline's replication i population.
    expect(result.crnAligned).toBe(true);
  }, TIMEOUT_MS);

  it('is a pure down-peak with one terminal floor, counted rather than read off the traffic block', async () => {
    const { census } = await study();
    expect(census.replications).toBe(DOWN_PEAK_REPLICATIONS);
    expect(census.legs).toBeGreaterThan(0);
    expect(census.destinations).toEqual(['G']);
    expect(census.legsToEntrance).toBe(census.legs);
    expect(census.origins.length).toBeGreaterThan(1);
  }, TIMEOUT_MS);

  it('moves nothing in the eligibility filter, so the call type is not smuggling access control in', async () => {
    const { census } = await study();
    // Garden Apartments declares no access zone, so none of the four reasons a credential can move
    // may appear. Counted rather than assumed: destinationLiveness.ts found hundreds on Secure Tower.
    for (const reason of [
      'accessDenied',
      'destinationAccessDenied',
      'serviceZone',
      'destinationServiceZone',
    ]) {
      expect(census.refusalsUnderDisclosure[reason]).toBeUndefined();
    }
  }, TIMEOUT_MS);

  it('disclosing the destination with nothing pricing it changes nothing', async () => {
    const result = await study();
    // The control § D112 had to derive as `destination-eta-unpriced`, here as the waitTime pair.
    const contrast = gateContrast(result, 'waitTime', 1);
    expect(contrast.replicationsDiffering).toBe(0);
    expect(contrast.withheld.decisionsWithSpread).toBe(contrast.disclosed.decisionsWithSpread);
  }, TIMEOUT_MS);

  it('leaves ten of the twelve terms bit-identical across the gate — the enumeration', async () => {
    const result = await study();
    const blind = GATE_SPECS.filter((spec) => !DESTINATION_READING_TERMS.includes(spec.termId));
    expect(blind.length).toBeGreaterThanOrEqual(10);
    for (const spec of blind) {
      const contrast = gateContrast(result, spec.termId, spec.weight);
      expect({ term: spec.termId, differing: contrast.replicationsDiffering }).toEqual({
        term: spec.termId,
        differing: 0,
      });
      // And each is live on both sides, so the zero is a blind gate rather than a dead term.
      expect(contrast.withheld.evaluations).toBeGreaterThan(0);
      expect(contrast.disclosed.evaluations).toBeGreaterThan(0);
    }
    expect(result.informativeTerms).toEqual([...DESTINATION_READING_TERMS].sort());
  }, TIMEOUT_MS);

  it('finds `rideTime` — the term the shipped destination profiles weight — flat at sixteen times its shipped weight', async () => {
    const result = await study();
    for (const weight of GATE_WEIGHTS) {
      const contrast = gateContrast(result, 'rideTime', weight);
      // Live: evaluated and non-zero for every candidate under disclosure, zero without it.
      expect(contrast.disclosed.nonZero).toBeGreaterThan(0);
      expect(contrast.withheld.nonZero).toBe(0);
      // And a constant across candidates in all but a handful of decisions, which is why no weight
      // rescues it: a term with the same value for every car cannot change an argmin.
      expect(contrast.disclosed.decisionsWithSpread).toBeLessThanOrEqual(
        contrast.disclosed.contestedDecisions / 100,
      );
      // Nothing it does resolves at this budget, on any metric, at any weight in the sweep.
      for (const cell of contrast.cells) {
        expect([cell.metric, cell.verdict]).toEqual([
          cell.metric,
          expect.stringMatching(/^(IDENTICAL|INDISTINGUISHABLE)$/),
        ]);
      }
    }
    // Raising the weight from 0.5 to 8 reproduces one class: past the first decision flip there is
    // no second one. This is docs/07 § 4's flat plateau, at a shipped operating point.
    const plateau = result.identityClasses.find((members) =>
      members.includes(gateArmId({ termId: 'rideTime', weight: 8 }, true)),
    );
    expect(plateau).toContain(gateArmId({ termId: 'rideTime', weight: 0.5 }, true));
    expect(plateau).toContain('destination-eta');
  }, TIMEOUT_MS);

  it('finds `stopCount` under disclosure informative — and the whole of it is the destination', async () => {
    const result = await study();
    for (const weight of GATE_WEIGHTS) {
      const contrast = gateContrast(result, 'stopCount', weight);
      // Withheld, the term separates no pair of cars at this cell at all, so its arm is in eta's
      // identity class; disclosed, it separates them in over a hundred decisions. The difference
      // between the two sides is the destination increment and nothing else.
      expect(contrast.withheld.decisionsWithSpread).toBe(0);
      expect(contrast.disclosed.decisionsWithSpread).toBeGreaterThan(100);
      expect(contrast.replicationsDiffering).toBeGreaterThan(0);
      expect(
        downPeakCell(result, gateArmId({ termId: 'stopCount', weight }, false), 'awtS').verdict,
      ).toBe('IDENTICAL');
    }
  }, TIMEOUT_MS);

  it('prices that information badly: worse wait, worse tail, worse TTD, no energy saving', async () => {
    const result = await study();
    for (const weight of [0.5, 1, 2, 8]) {
      expect({ weight, ...verdictsOf(result, 'stopCount', weight) }).toEqual({
        weight,
        awtS: 'WORSE',
        wt95S: 'WORSE',
        ttdMeanS: 'WORSE',
        energyKJ: 'INDISTINGUISHABLE',
      });
    }
    // The smallest weight in the sweep resolves on wait and on the tail and on neither of the other
    // two — reported as it falls rather than rounded to the headline.
    expect(verdictsOf(result, 'stopCount', 0.2)).toEqual({
      awtS: 'WORSE',
      wt95S: 'WORSE',
      ttdMeanS: 'INDISTINGUISHABLE',
      energyKJ: 'INDISTINGUISHABLE',
    });
  }, TIMEOUT_MS);

  it('reports the two shipped destination profiles against `eta` without a verdict either owns', async () => {
    const result = await study();
    for (const armId of ['destination-eta', 'destination-panel']) {
      for (const metric of ['awtS', 'wt95S', 'ttdMeanS', 'energyKJ'] as const) {
        expect([armId, metric, downPeakCell(result, armId, metric).verdict]).toEqual([
          armId,
          metric,
          expect.stringMatching(/^(IDENTICAL|INDISTINGUISHABLE)$/),
        ]);
      }
    }
    // The panel is on a different passenger model, so two of those four are not comparable with the
    // conventional table and the study says so rather than leaving a reader to notice.
    const panel = result.arms.find((arm) => arm.armId === 'destination-panel');
    expect(panel?.modelSensitive).toBe(true);
    expect(result.arms.find((arm) => arm.armId === 'destination-eta')?.modelSensitive).toBe(false);
    // And they are not in one class for one reason: at this seed the panel differs from the baseline
    // on strictly more replications than the disclosure-only arm at the same rideTime weight.
    const armDiffering = (armId: string): number =>
      result.arms.find((arm) => arm.armId === armId)?.replicationsDifferingFromBaseline ?? -1;
    expect(armDiffering('destination-panel')).toBeGreaterThan(
      armDiffering(gateArmId({ termId: 'rideTime', weight: 1 }, true)),
    );
  }, TIMEOUT_MS);

  it('still reproduces its published figures', async () => {
    const mismatches = checkPinned('down-peak-destination', downPeakFigures(await study()));
    expect(
      mismatches.length,
      describeMismatches('down-peak-destination', mismatches),
    ).toBe(0);
  }, TIMEOUT_MS);

  it('baselines on the arm docs/07 § 4 says to baseline on', async () => {
    expect(DOWN_PEAK_BASELINE).toBe('eta');
  }, TIMEOUT_MS);
});
