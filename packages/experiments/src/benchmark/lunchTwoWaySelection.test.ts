/**
 * **The § D162 measurement, asserted against the protocol written before it.**
 *
 * `docs/13-phase-6c-handover.md` § 11 lists what would make this measurement bad, and most of this
 * file is that list turned into assertions a reviewer can run:
 *
 * | docs/13 § 11 says | asserted here |
 * |---|---|
 * | adjusting any split, duration or rate of the template | the two cells are the shipped `arms.ts` points, differing in `mixAmplitude` and id alone |
 * | running the control at different seeds or demand | both inner studies carry the same tuning and holdout seeds, and the demand objects differ only in `mixAmplitude` |
 * | pooling with § D151's families, or editing either frozen array | the declared family is the treatment cell alone, disjoint from both frozen arrays, whose membership is re-pinned here |
 * | inheriting docs/07 § 4's AWT limits | both cells' limits carry a provenance naming `ttdMeanS`, that cell, and the tuning seed |
 * | running below 50 replications because the clamp allowed it | the H1 check is by hand: `replications >= 50`, and the basis re-derives to the pre-registered 200 |
 * | skipping the deadband known-answer | it runs in the same study object and must land inside [1, 3] |
 *
 * The study runs **once** and every assertion reads it — two twelve-arm censuses, two budget
 * re-derivations, two regime screens, two resolution probes, two 64-candidate searches, two
 * 200-replication verdicts and the deadband, all serial. Several minutes; the cost is the
 * criterion's, not this file's.
 */

import { describe, expect, it } from 'vitest';

import { checkPinned, describeMismatches, lunchTwoWaySelectionFigures } from './published.js';
import {
  LUNCH_FLAT_CONTROL_CELL,
  LUNCH_HOLDOUT_SEED,
  LUNCH_HOLM_FAMILY,
  LUNCH_REPLICATIONS,
  LUNCH_TREATMENT_CELL,
  LUNCH_TUNING_SEED,
  PINNED_LUNCH_COUNTS,
  derivedLunchCounts,
  runLunchTwoWaySelectionStudy,
  type LunchTwoWaySelectionStudy,
} from './lunchTwoWaySelection.js';
import { PRIMARY_CELLS, SECONDARY_CELLS } from './selectionSweep.js';
import { budgetFor } from './matrix.js';
import { loadResources } from '../validation/harness.js';

const TIMEOUT_MS = 3_600_000;

let cached: Promise<LunchTwoWaySelectionStudy> | undefined;
const study = async (): Promise<LunchTwoWaySelectionStudy> => {
  cached ??= runLunchTwoWaySelectionStudy();
  return await cached;
};

/* -------------------------------------------------------------------------- *
 * The cells and the family — fixed before any ΔTTD, and never § D151's
 * -------------------------------------------------------------------------- */

describe('the two cells are the shipped operating points, differing in the mix arc alone', () => {
  it('holds the treatment and control identical except for id and mixAmplitude', () => {
    // § D162 condition 5: a control at a different total demand is not a control. The two shipped
    // points differ in `mixAmplitude: 0` and nothing else, and this asserts it field by field so
    // a drifted control fails here rather than in a verdict.
    expect(LUNCH_TREATMENT_CELL.building).toBe(LUNCH_FLAT_CONTROL_CELL.building);
    expect(LUNCH_TREATMENT_CELL.point.demandTemplate).toBe('lunch-two-way');
    expect(LUNCH_FLAT_CONTROL_CELL.point.demandTemplate).toBe('lunch-two-way');
    expect(LUNCH_TREATMENT_CELL.point.durationS).toBe(LUNCH_FLAT_CONTROL_CELL.point.durationS);
    expect(LUNCH_TREATMENT_CELL.point.reportWindow).toBe(LUNCH_FLAT_CONTROL_CELL.point.reportWindow);
    const { mixAmplitude, ...controlDemand } = LUNCH_FLAT_CONTROL_CELL.point.demand ?? {};
    expect(mixAmplitude).toBe(0);
    expect(LUNCH_TREATMENT_CELL.point.demand).toStrictEqual(controlDemand);
  });

  it('declares a Holm family of exactly the treatment cell, disjoint from § D151’s families', () => {
    expect([...LUNCH_HOLM_FAMILY]).toStrictEqual([LUNCH_TREATMENT_CELL.id]);
    const sweepIds = [...PRIMARY_CELLS, ...SECONDARY_CELLS].map((cell) => cell.id);
    for (const member of LUNCH_HOLM_FAMILY) expect(sweepIds).not.toContain(member);
    expect(sweepIds).not.toContain(LUNCH_FLAT_CONTROL_CELL.id);
    // And neither frozen array moved: § D151 § 8 forbids growing either, and docs/13 § 8 repeats
    // it for this measurement by name.
    expect(PRIMARY_CELLS.length).toBe(5);
    expect(SECONDARY_CELLS.length).toBe(3);
  });
});

/* -------------------------------------------------------------------------- *
 * The run — seeds, budget, gate, limits
 * -------------------------------------------------------------------------- */

describe('the § D162 measurement, run at the pre-registered budget', () => {
  it('measures both cells at the same tuning and holdout seeds, disjoint, under CRN', async () => {
    const result = await study();
    expect(result.tuningSeed).toBe(LUNCH_TUNING_SEED);
    expect(result.holdoutSeed).toBe(LUNCH_HOLDOUT_SEED);
    expect(result.tuningSeed).not.toBe(result.holdoutSeed);
    for (const outcome of [result.treatment, result.control]) {
      expect(outcome.study.seed, outcome.cell.id).toBe(LUNCH_TUNING_SEED);
      expect(outcome.study.holdoutSeed, outcome.cell.id).toBe(LUNCH_HOLDOUT_SEED);
      expect(outcome.study.seedsDisjoint, outcome.cell.id).toBe(true);
      expect(outcome.study.crnAligned, outcome.cell.id).toBe(true);
      expect(outcome.study.quotable, outcome.cell.id).toBe(true);
      expect(outcome.study.unquotableArms, outcome.cell.id).toStrictEqual([]);
    }
  }, TIMEOUT_MS);

  it('spends the pre-registered 200 on both cells, and H1’s floor check is by hand', async () => {
    const result = await study();
    expect(result.replications).toBe(LUNCH_REPLICATIONS);
    for (const outcome of [result.treatment, result.control]) {
      // H1: the study clamp has no lower bound, so the floor is compared explicitly rather than
      // trusted to the machinery.
      expect(outcome.study.replications, outcome.cell.id).toBeGreaterThanOrEqual(50);
      expect(outcome.study.replications, outcome.cell.id).toBe(LUNCH_REPLICATIONS);
      // The basis re-derives to the pre-registered number: matrix.ts's rule on the gate metric,
      // clamped at the band's ceiling. A moved census moves this rather than the spent budget.
      expect(budgetFor(outcome.budget.sdOfDifferenceS), outcome.cell.id).toBe(LUNCH_REPLICATIONS);
      expect(outcome.budget.clamped, outcome.cell.id).toBe('ceiling');
      expect(outcome.budget.replications, outcome.cell.id).toBe(LUNCH_REPLICATIONS);
    }
  }, TIMEOUT_MS);

  it('gates on TTD and publishes AWT, WT95 and the energy proxy beside it, on both cells', async () => {
    const result = await study();
    expect(result.gateMetric).toBe('ttdMeanS');
    for (const outcome of [result.treatment, result.control]) {
      for (const arm of outcome.study.arms) {
        expect(arm.gate.metric, `${outcome.cell.id}/${arm.armId}`).toBe('ttdMeanS');
        expect(
          arm.costs.map((cost) => cost.metric),
          `${outcome.cell.id}/${arm.armId}`,
        ).toStrictEqual(['awtS', 'wt95S', 'energyKJ', 'energyPerServedLegKJ']);
      }
    }
  }, TIMEOUT_MS);

  it('measures each cell’s resolution limit on TTD at that cell, at the tuning seed', async () => {
    const result = await study();
    for (const outcome of [result.treatment, result.control]) {
      expect(outcome.resolution.cellId, outcome.cell.id).toBe(outcome.cell.id);
      expect(outcome.resolution.provenance, outcome.cell.id).toContain('ttdMeanS');
      expect(outcome.resolution.provenance, outcome.cell.id).toContain(outcome.cell.id);
      expect(outcome.resolution.provenance, outcome.cell.id).toContain(String(LUNCH_TUNING_SEED));
      expect(outcome.resolution.nearNeighbourS, outcome.cell.id).toBeGreaterThan(0);
      expect(outcome.resolution.structuralS, outcome.cell.id).toBeGreaterThan(0);
      // The study is graded against the measured pair, not docs/07 § 4's inherited one.
      expect(outcome.study.resolutionLimits.structuralS, outcome.cell.id).toBe(
        outcome.resolution.structuralS,
      );
      expect(outcome.study.resolutionLimits.nearNeighbourS, outcome.cell.id).toBe(
        outcome.resolution.nearNeighbourS,
      );
    }
  }, TIMEOUT_MS);

  it('sees the mix move on the treatment and hold still on the control', async () => {
    // The trace-level fact § D162's whole design rests on, measured in this run rather than
    // inherited from § D169: the treatment's time-bin × direction table is far outside a fixed
    // split's noise, the flat control is inside it. The bound is the sweep test's own 4 σ.
    const result = await study();
    expect(result.treatment.screen.splitDrift.standardizedDeviation).toBeGreaterThan(4);
    expect(result.control.screen.splitDrift.standardizedDeviation).toBeLessThan(4);
    for (const outcome of [result.treatment, result.control]) {
      expect(outcome.screen.postWarmupObservations, outcome.cell.id).toBeGreaterThan(0);
      expect(outcome.screen.splitDrift.passengers, outcome.cell.id).toBeGreaterThan(0);
      expect(outcome.screen.regimeCount, outcome.cell.id).toBeLessThanOrEqual(
        outcome.screen.distinctPatternsPreferred,
      );
    }
  }, TIMEOUT_MS);

  it('judges the treatment at α = 0.05 in the declared family of one, and says so', async () => {
    const result = await study();
    expect(result.holm.rank).toBe(1);
    expect(result.holm.alpha).toBeCloseTo(0.05, 12);
    expect(result.holm.key).toBe(LUNCH_TREATMENT_CELL.id);
    expect(result.holm.pValue).toBeCloseTo(result.treatment.pValue, 12);
  }, TIMEOUT_MS);

  it('names the weight sets carrying the reference’s own vector, and none is a silent excuse', async () => {
    // H3's arithmetic, re-derived: at an `auction-multi-round` reference the no-op set is empty,
    // so a bit-identical replication would be a live G11 wiring question. Asserted on the weights
    // themselves rather than on the profile ids, like the sweep test.
    const result = await study();
    const config = await loadResources();
    for (const outcome of [result.treatment, result.control]) {
      const reference = config.dispatcherProfilesById.get(outcome.study.census.referenceProfileId);
      expect(reference, outcome.cell.id).toBeDefined();
      for (const id of outcome.noOpWeightSets) {
        const other = config.dispatcherProfilesById.get(id);
        expect(other?.weights, `${outcome.cell.id}/${id}`).toStrictEqual(reference?.weights);
      }
      for (const arm of outcome.study.arms) {
        expect(arm.gate.verdict, `${outcome.cell.id}/${arm.armId}`).not.toBe('IDENTICAL');
        expect(arm.identicalReplications, `${outcome.cell.id}/${arm.armId}`).toBeLessThan(
          outcome.study.replications,
        );
      }
    }
  }, TIMEOUT_MS);

  it('reports the verdict its own clauses produce, whichever way they go', async () => {
    // The § D162 conjunction, re-derived as a biconditional so a future run that clears every
    // clause turns this green rather than red — asserting `NOT ACCEPTED` by name would have to be
    // edited to let the phase pass, which is the wrong way round.
    const result = await study();
    const learned = result.treatment.study.arms.find((arm) => arm.armId === 'learned');
    expect(learned).toBeDefined();
    if (learned === undefined) return;
    const controlLearned = result.control.study.arms.find((arm) => arm.armId === 'learned');
    expect(result.controlShowsAdvantage).toBe(
      controlLearned?.gate.verdict === 'BETTER' && (controlLearned?.gate.estimate.mean ?? 0) < 0,
    );
    const shouldAccept =
      learned.gate.verdict === 'BETTER' &&
      learned.gate.estimate.mean < 0 &&
      result.holm.rejected &&
      !learned.belowResolutionLimit &&
      result.treatment.study.holdoutVerdict === 'GENERALIZES' &&
      result.deadband.rediscovered &&
      !result.controlShowsAdvantage &&
      !result.significantAtOneRegimeCell;
    expect(result.verdict, result.verdictReason).toBe(shouldAccept ? 'ACCEPTED' : 'NOT ACCEPTED');
    expect(result.verdictReason.length).toBeGreaterThan(40);
  }, TIMEOUT_MS);

  it('still rediscovers the 2 s deadband blind, from the shipped 8 s, in the same session', async () => {
    const result = await study();
    expect(result.deadband.shippedThresholdS).toBe(8);
    expect(result.deadband.winnerThresholdS).toBeLessThan(result.deadband.shippedThresholdS);
    expect(result.deadband.rediscovered, `winner ${result.deadband.winnerThresholdS} s`).toBe(true);
    expect(result.deadband.winnerMeanDeltaAwtS).toBeLessThan(0);
  }, TIMEOUT_MS);

  it('pins every headline count, in both directions', async () => {
    // § D149's pattern: a count that still supports its own sentence is the only kind nobody
    // re-checks. Strict object equality is the two-directional assertion — a derived key the pin
    // table lacks fails exactly like a pinned key the run no longer produces.
    const result = await study();
    expect(derivedLunchCounts(result)).toStrictEqual({ ...PINNED_LUNCH_COUNTS });
  }, TIMEOUT_MS);

  it('still reproduces its published figures', async () => {
    const mismatches = checkPinned(
      'lunch-two-way-selection',
      lunchTwoWaySelectionFigures(await study()),
    );
    expect(mismatches.length, describeMismatches('lunch-two-way-selection', mismatches)).toBe(0);
  }, TIMEOUT_MS);
});
