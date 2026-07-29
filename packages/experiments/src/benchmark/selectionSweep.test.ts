/**
 * **Phase 6c's sweep, asserted against the protocol that was written before it.**
 *
 * `DECISIONS.md` § D151 § 8 lists what would make its criterion a bad one, and most of this file is
 * that list turned into assertions a reviewer can run:
 *
 * | § D151 § 8 says | asserted here |
 * |---|---|
 * | adding a cell after seeing a result, or dropping one that refused | the cell set is pinned member by member — ids, families, references, budgets and ceiling exclusions |
 * | pooling the primary and secondary families | the two Holm families are sized 5 and 3 and each cell's own family size is checked |
 * | reporting an uncorrected per-cell interval as the verdict | every cell's verdict is re-derived as a biconditional over its own four conditions |
 * | using the § 5 screen to filter cells rather than interpret them | every primary cell appears in the result whatever its regime count |
 * | reading § 4's AWT limits as TTD limits | every cell's limit carries a provenance string naming `ttdMeanS` and that cell |
 *
 * The sweep runs **once** and every assertion reads it. It is the most expensive study in the
 * repository by a wide margin — eight operating points, each paying a twelve-arm census, a
 * resolution probe, a 64-candidate search and a three-arm verdict — and that cost is the criterion's
 * rather than this file's.
 */

import { describe, expect, it } from 'vitest';

import { checkPinned, describeMismatches, selectionSweepFigures } from './published.js';
import {
  PRIMARY_CELLS,
  REGIME_SHARE_FLOOR,
  SECONDARY_CELLS,
  SWEEP_CELLS,
  SWEEP_HOLDOUT_SEED,
  SWEEP_TUNING_SEED,
  derivedBuilding,
  holmDecisions,
  pairedPValue,
  runSelectionSweep,
  smallestDetectableEffect,
  type SelectionSweep,
} from './selectionSweep.js';
import { loadResources } from '../validation/harness.js';

const TIMEOUT_MS = 3_600_000;

let cached: Promise<SelectionSweep> | undefined;
const sweep = async (): Promise<SelectionSweep> => {
  cached ??= runSelectionSweep();
  return await cached;
};

/* -------------------------------------------------------------------------- *
 * The cell set — fixed before any ΔTTD existed
 * -------------------------------------------------------------------------- */

describe('the cell set is § D151 § 1’s, member by member', () => {
  it('holds five primary cells and three secondary ones, in the declared order', () => {
    expect(PRIMARY_CELLS.map((cell) => cell.id)).toStrictEqual([
      'midtown-interfloor-1.0pct',
      'midtown-interfloor-2.0pct',
      'garden-residential-2pct',
      'garden-down-peak-2pct',
      'midtown-hotel-1.5pct',
    ]);
    expect(SECONDARY_CELLS.map((cell) => cell.id)).toStrictEqual([
      'secure-up-peak-2pct',
      'midtown-down-peak-1pct',
      'vertical-city-up-peak-1pct',
    ]);
    expect(SWEEP_CELLS.length).toBe(8);
  });

  it('carries each cell’s pre-registered reference arm, budget and ceiling exclusions', () => {
    const table = Object.fromEntries(
      SWEEP_CELLS.map((cell) => [
        cell.id,
        [cell.preRegisteredReference, cell.replications, [...cell.ceilingExcludedArms].sort()],
      ]),
    );
    expect(table).toStrictEqual({
      'midtown-interfloor-1.0pct': ['collective', 200, []],
      'midtown-interfloor-2.0pct': ['auction-multi-round', 200, []],
      'garden-residential-2pct': ['zoned-uppeak', 200, []],
      'garden-down-peak-2pct': ['zoned-uppeak', 200, []],
      'midtown-hotel-1.5pct': ['collective', 200, []],
      'secure-up-peak-2pct': ['auction-multi-round', 126, ['nearest-car']],
      'midtown-down-peak-1pct': ['zoned-uppeak', 200, ['nearest-car']],
      'vertical-city-up-peak-1pct': [
        'collective',
        200,
        ['destination-panel', 'nearest-car', 'predictive-balanced'],
      ],
    });
    // Only the SECONDARY family may use § D147's device. A primary cell admitted by excluding an
    // arm would be a secondary cell wearing a primary label.
    for (const cell of PRIMARY_CELLS) expect(cell.ceilingExcludedArms, cell.id).toStrictEqual([]);
  });

  it('derives cell 5’s building by moving the traffic profile and nothing else', async () => {
    const config = await loadResources();
    const base = config.buildingsById.get('midtown-office');
    expect(base).toBeDefined();
    if (base === undefined) return;
    const derived = derivedBuilding(base, 'midtown-office@hotel', 'hotel');
    expect(derived.trafficProfile).toBe('hotel');
    expect(derived.config.trafficProfile).toBe('hotel');
    expect(derived.floors).toBe(base.floors);
    expect(derived.banks).toBe(base.banks);
    expect(derived.totalPopulation).toBe(base.totalPopulation);
    // The derivation is only honest because no floor overrides the building-level profile: if one
    // did, moving the building id would move some floors and not others.
    expect(base.floors.every((floor) => floor.trafficProfile === undefined)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * The correction, as arithmetic — no simulation involved
 * -------------------------------------------------------------------------- */

describe('Holm–Bonferroni, step-down and per family', () => {
  it('judges the smallest p against α/m and the largest against α', () => {
    const family = [
      { key: 'a', pValue: 0.001 },
      { key: 'b', pValue: 0.02 },
      { key: 'c', pValue: 0.021 },
      { key: 'd', pValue: 0.022 },
      { key: 'e', pValue: 0.023 },
    ];
    const decisions = holmDecisions(family);
    expect(decisions.map((d) => d.key)).toStrictEqual(['a', 'b', 'c', 'd', 'e']);
    expect(decisions.map((d) => d.alpha)).toStrictEqual([
      0.05 / 5,
      0.05 / 4,
      0.05 / 3,
      0.05 / 2,
      0.05 / 1,
    ]);
    expect(decisions[0]?.rejected).toBe(true);
    // 0.02 > 0.05/4 = 0.0125, so `b` is retained — and the step-down then retains `d` and `e` even
    // though 0.022 <= 0.05/2 and 0.023 <= 0.05. That propagation is the whole of Holm and the
    // easiest part to get wrong: without it, a family of near-identical p-values would reject its
    // *later* members while rejecting neither of the two stronger ones ahead of them.
    expect(decisions.map((d) => d.rejected)).toStrictEqual([true, false, false, false, false]);
    expect(decisions[3]?.pValue).toBeLessThan(decisions[3]?.alpha ?? 0);
    expect(decisions[4]?.pValue).toBeLessThan(decisions[4]?.alpha ?? 0);
  });

  it('is monotone in the adjusted p and caps it at 1', () => {
    const decisions = holmDecisions([
      { key: 'a', pValue: 0.4 },
      { key: 'b', pValue: 0.5 },
      { key: 'c', pValue: 0.9 },
    ]);
    expect(decisions.map((d) => d.adjustedP)).toStrictEqual([1, 1, 1]);
    expect(decisions.every((d) => !d.rejected)).toBe(true);
  });

  it('is strictly stricter than an uncorrected test, which is the point', () => {
    const alone = holmDecisions([{ key: 'a', pValue: 0.04 }]);
    expect(alone[0]?.rejected).toBe(true);
    const inFamily = holmDecisions([
      { key: 'a', pValue: 0.04 },
      { key: 'b', pValue: 0.5 },
      { key: 'c', pValue: 0.5 },
      { key: 'd', pValue: 0.5 },
      { key: 'e', pValue: 0.5 },
    ]);
    expect(inFamily.find((d) => d.key === 'a')?.rejected).toBe(false);
  });

  it('reads a two-sided paired-t p-value off the estimate the study already holds', () => {
    // An interval that just excludes zero is p just under 0.05, and one centred on zero is p = 1.
    expect(pairedPValue(0, 1, 200)).toBeCloseTo(1, 12);
    const p = pairedPValue(-0.213, 0.1157, 200);
    expect(p).toBeGreaterThan(0.05);
    expect(p).toBeLessThan(0.08);
    expect(pairedPValue(-1, 0.1, 200)).toBeLessThan(1e-10);
  });
});

/* -------------------------------------------------------------------------- *
 * The resolution formula, calibrated against the figure docs/07 § 4 publishes
 * -------------------------------------------------------------------------- */

describe('the smallest detectable effect reproduces docs/07 § 4’s own near-neighbour figure', () => {
  it('returns ~0.2 s from § 4’s own rung and its measured paired spread', () => {
    // `validation/crippledVariant.test.ts` is where § 4's 0.20 s comes from: the `+0.4`
    // `distanceTravelled` rung, detected on 8 of 10 disjoint seed sets of n = 100, at a measured
    // effect of 0.2002 s. The paired spread on that pair, measured over the same ten seed sets, is
    // s_D = 0.7728 s on AWT. The analytic 80 %-power figure must land on the published one, or the
    // sweep is measuring its cells with a ruler that disagrees with the ruler every other claim in
    // the repository is checked against.
    const analytic = smallestDetectableEffect(0.7728, 100);
    expect(analytic).toBeGreaterThan(0.19);
    expect(analytic).toBeLessThan(0.23);
    expect(Math.abs(analytic - 0.2002) / 0.2002).toBeLessThan(0.1);
  });

  it('scales as 1/sqrt(n) and refuses a degenerate n', () => {
    const at100 = smallestDetectableEffect(4, 100);
    const at400 = smallestDetectableEffect(4, 400);
    expect(at100 / at400).toBeGreaterThan(1.9);
    expect(at100 / at400).toBeLessThan(2.1);
    expect(smallestDetectableEffect(4, 1)).toBeNaN();
  });
});

/* -------------------------------------------------------------------------- *
 * The sweep
 * -------------------------------------------------------------------------- */

describe('the sweep, run at the pre-registered budget', () => {
  it('screens every cell and filters none of them', async () => {
    // § D151 § 5: the screen is a moderator for interpretation, never a filter for inclusion.
    // Asserted as a count rather than as a property of any one cell's regime count, because the
    // failure this guards against is a cell quietly not being run.
    const result = await sweep();
    expect(result.primary.length).toBe(PRIMARY_CELLS.length);
    expect(result.secondary.length).toBe(SECONDARY_CELLS.length);
    for (const row of [...result.primary, ...result.secondary]) {
      expect(row.screen.cellId, row.cell.id).toBe(row.cell.id);
      expect(row.screen.postWarmupObservations, row.cell.id).toBeGreaterThan(0);
      expect(row.screen.regimeCount, row.cell.id).toBeLessThanOrEqual(
        row.screen.distinctPatternsPreferred,
      );
    }
    expect(REGIME_SHARE_FLOOR).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it('measures the directional split against the noise a fixed split would produce', async () => {
    // **The claim § D151 § 5 asks to be checked rather than taken on trust.** `DemandPhase` carries
    // a scalar intensity and `generator.ts` applies one `intensity(t)` to every source, so the
    // directional split cannot move within a run. Measured on the trace with Pearson's homogeneity
    // statistic over the time-bin × direction-category table, standardized to `(X² − df)/√(2df)`,
    // which is ~N(0, 1) under a fixed split. Four standard deviations is the bound: it is loose
    // enough for a sparse table across eight cells and far tighter than a split that really moved
    // with the phase, which would be tens of σ out.
    const result = await sweep();
    for (const row of [...result.primary, ...result.secondary]) {
      const drift = row.screen.splitDrift;
      expect(drift.passengers, row.cell.id).toBeGreaterThan(0);
      expect(drift.standardizedDeviation, row.cell.id).toBeLessThan(4);
      // A cell whose traffic is one direction category by construction cannot vary, and says so
      // with zero degrees of freedom rather than with a suspiciously perfect statistic.
      if (Object.keys(drift.overall).length <= 1) {
        expect(drift.degreesOfFreedom, row.cell.id).toBe(0);
      } else {
        expect(drift.degreesOfFreedom, row.cell.id).toBeGreaterThan(0);
      }
    }
  }, TIMEOUT_MS);

  it('gates on TTD and publishes AWT, WT95 and the energy proxy beside it, at every cell', async () => {
    const result = await sweep();
    expect(result.gateMetric).toBe('ttdMeanS');
    for (const row of [...result.primary, ...result.secondary]) {
      for (const arm of row.study.arms) {
        expect(arm.gate.metric, row.cell.id).toBe('ttdMeanS');
        expect(arm.costs.map((cost) => cost.metric), row.cell.id).toStrictEqual([
          'awtS',
          'wt95S',
          'energyKJ',
          'energyPerServedLegKJ',
        ]);
      }
    }
  }, TIMEOUT_MS);

  it('measures every cell’s resolution limit on TTD at that cell, never inherited', async () => {
    const result = await sweep();
    for (const row of [...result.primary, ...result.secondary]) {
      expect(row.resolution.cellId, row.cell.id).toBe(row.cell.id);
      expect(row.resolution.provenance, row.cell.id).toContain('ttdMeanS');
      expect(row.resolution.provenance, row.cell.id).toContain(row.cell.id);
      expect(row.resolution.n, row.cell.id).toBe(row.study.replications);
      expect(row.resolution.nearNeighbourS, row.cell.id).toBeGreaterThan(0);
      expect(row.resolution.structuralS, row.cell.id).toBeGreaterThan(0);
      // The study must be graded against the measured pair, not against docs/07 § 4's.
      expect(row.study.resolutionLimits.structuralS, row.cell.id).toBe(row.resolution.structuralS);
      expect(row.study.resolutionLimits.nearNeighbourS, row.cell.id).toBe(
        row.resolution.nearNeighbourS,
      );
    }
  }, TIMEOUT_MS);

  it('pairs every arm against the same traces and validates on a disjoint seed', async () => {
    const result = await sweep();
    expect(result.tuningSeed).toBe(SWEEP_TUNING_SEED);
    expect(result.holdoutSeed).toBe(SWEEP_HOLDOUT_SEED);
    expect(result.tuningSeed).not.toBe(result.holdoutSeed);
    for (const row of [...result.primary, ...result.secondary]) {
      expect(row.study.crnAligned, row.cell.id).toBe(true);
      expect(row.study.seedsDisjoint, row.cell.id).toBe(true);
      expect(row.study.replications, row.cell.id).toBeLessThanOrEqual(row.cell.replications);
      expect(row.study.replications, row.cell.id).toBeGreaterThanOrEqual(50);
    }
  }, TIMEOUT_MS);

  it('corrects two families of five and three, and never pools them', async () => {
    // § D151 § 3: an arm admitted only by excluding other arms is weaker evidence, and merging the
    // families would launder that. Checked on the α each member was judged at, because that is the
    // number a pooled family would change: 0.05/5 at best in the primary family and 0.05/3 in the
    // secondary one, never 0.05/8.
    const result = await sweep();
    const alphas = (rows: SelectionSweep['primary']): number[] =>
      rows.map((row) => row.holm.alpha).sort((a, b) => a - b);
    expect(alphas(result.primary)[0]).toBeCloseTo(0.05 / 5, 12);
    expect(alphas(result.secondary)[0]).toBeCloseTo(0.05 / 3, 12);
    for (const row of [...result.primary, ...result.secondary]) {
      const size = row.cell.family === 'primary' ? 5 : 3;
      expect(row.holm.rank, row.cell.id).toBeLessThanOrEqual(size);
      expect(row.holm.alpha, row.cell.id).toBeGreaterThanOrEqual(0.05 / size);
      expect(row.holm.pValue, row.cell.id).toBeCloseTo(row.pValue, 12);
    }
  }, TIMEOUT_MS);

  it('reports the verdict its own four conditions produce, whichever way they go', async () => {
    // Deliberately a biconditional against the cell's own cells rather than a hard-coded string:
    // a future run that *does* clear the gate turns this green rather than red. A test asserting
    // `NOT ACCEPTED` would have to be edited to let the phase pass, which is the wrong way round.
    const result = await sweep();
    for (const row of [...result.primary, ...result.secondary]) {
      const gate = row.study.arms.find((arm) => arm.armId === 'learned');
      expect(gate, row.cell.id).toBeDefined();
      if (gate === undefined) continue;
      const shouldAccept =
        gate.gate.verdict === 'BETTER' &&
        gate.gate.estimate.mean < 0 &&
        row.holm.rejected &&
        !gate.belowResolutionLimit &&
        row.study.holdoutVerdict === 'GENERALIZES';
      expect(row.verdict, `${row.cell.id}: ${row.verdictReason}`).toBe(
        shouldAccept ? 'ACCEPTED' : 'NOT ACCEPTED',
      );
      expect(row.verdictReason.length, row.cell.id).toBeGreaterThan(20);
    }
    // A secondary cell cannot accept the phase. § D151 § 6.
    expect(result.acceptedPrimaryCells.every((id) => PRIMARY_CELLS.some((c) => c.id === id))).toBe(
      true,
    );
    expect(result.verdict).toBe(result.acceptedPrimaryCells.length > 0 ? 'ACCEPTED' : 'NOT ACCEPTED');
    expect(result.acceptedPrimaryCells.length + result.refusedPrimaryCells.length).toBe(
      PRIMARY_CELLS.length,
    );
  }, TIMEOUT_MS);

  it('records what the fitted policy actually held, beside what the shipped detector would have', async () => {
    // The screen is a property of the **cell** — the shipped detector at its authored gains — and
    // this is a property of the **arm**. They come apart, and § D151 § 5's bug-report clause is
    // adjudicated against both rather than against a prior: a contextual policy scales each input
    // before the memberships are read, so it can partition traffic the shipped detector reads as
    // one regime.
    const result = await sweep();
    for (const row of [...result.primary, ...result.secondary]) {
      const trace = row.learnedRegimes;
      expect(trace.decisions, row.cell.id).toBeGreaterThan(0);
      expect(trace.seeds.length, row.cell.id).toBeGreaterThan(0);
      const total = Object.values(trace.weightSetShares).reduce((sum, share) => sum + share, 0);
      expect(total, row.cell.id).toBeCloseTo(1, 9);
      expect(trace.distinctWeightSets, row.cell.id).toBeLessThanOrEqual(
        Object.keys(trace.weightSetShares).length,
      );
      expect(trace.patternChanges, row.cell.id).toBeGreaterThanOrEqual(0);
    }
  }, TIMEOUT_MS);

  it('flags a significant effect at a one-regime cell as a bug report rather than a result', async () => {
    // § D151 § 5, and the generalization of § D139's bit-identical clause: the expected direction
    // is stated in advance so that a surprise reads as a defect. Nothing here asserts the flag is
    // false — it asserts that if the condition holds, the study says so.
    const result = await sweep();
    for (const row of [...result.primary, ...result.secondary]) {
      const expected =
        row.holm.rejected &&
        (row.study.arms.find((arm) => arm.armId === 'learned')?.gate.estimate.mean ?? 0) < 0 &&
        row.study.arms.find((arm) => arm.armId === 'learned')?.gate.verdict === 'BETTER' &&
        row.screen.regimeCount <= 1;
      expect(row.significantAtOneRegimeCell, row.cell.id).toBe(expected);
    }
  }, TIMEOUT_MS);

  it('names the weight sets that are the reference’s own vector, so a plateau is not a prior', async () => {
    // § D151 § 4 requires a high bit-identical count at a primary cell to be read as a wiring bug
    // until proven otherwise. The proof is structural and it is measured here rather than asserted:
    // `data/dispatcher-profiles.json` authors `eta` and `collective` with the same weight vector,
    // and the selector switches weights and nothing else, so a cell referenced on either of them
    // has a regime that is a no-op by construction. This asserts the arithmetic, not the outcome.
    const result = await sweep();
    const config = await loadResources();
    for (const row of [...result.primary, ...result.secondary]) {
      const reference = config.dispatcherProfilesById.get(row.study.census.referenceProfileId);
      expect(reference, row.cell.id).toBeDefined();
      for (const id of row.noOpWeightSets) {
        const other = config.dispatcherProfilesById.get(id);
        expect(other?.weights, `${row.cell.id}/${id}`).toStrictEqual(reference?.weights);
      }
      // An arm bit-identical on every replication is `IDENTICAL`, which § D139 calls a wiring bug
      // and no budget resolves. None of these is that.
      for (const arm of row.study.arms) {
        expect(arm.gate.verdict, `${row.cell.id}/${arm.armId}`).not.toBe('IDENTICAL');
      }
    }
  }, TIMEOUT_MS);

  it('takes each cell’s reference arm from that cell’s own census, and reports any mismatch', async () => {
    // § D139 forbids choosing the reference arm after seeing the result, so the census picks it and
    // § D151's pre-registration is checked *against* the census rather than substituted for it.
    // `nearest-car` may never be it: `docs/07` § 4 records it as a poor reference arm.
    const result = await sweep();
    for (const row of [...result.primary, ...result.secondary]) {
      expect(row.study.census.referenceProfileId, row.cell.id).not.toBe('nearest-car');
      for (const excluded of row.cell.ceilingExcludedArms) {
        expect(row.study.census.referenceProfileId, row.cell.id).not.toBe(excluded);
      }
      const reference = row.study.census.rows.find(
        (candidate) => candidate.profileId === row.study.census.referenceProfileId,
      );
      for (const candidate of row.study.census.rows) {
        if (!candidate.quotable || candidate.ceilingExcluded) continue;
        expect(candidate.meanTtdS, `${row.cell.id}/${candidate.profileId}`).toBeGreaterThanOrEqual(
          reference?.meanTtdS ?? 0,
        );
      }
    }
  }, TIMEOUT_MS);

  it('still rediscovers the 2 s deadband blind, from the shipped 8 s', async () => {
    // § D139's known-answer check, run on the same search that fitted every cell's policy. If it
    // came back at 8 s, every ΔTTD above would have to be read as a fact about the search rather
    // than about the policy.
    const result = await sweep();
    expect(result.deadband.shippedThresholdS).toBe(8);
    expect(result.deadband.winnerThresholdS).toBeLessThan(result.deadband.shippedThresholdS);
    expect(result.deadband.rediscovered, `winner ${result.deadband.winnerThresholdS} s`).toBe(true);
    expect(result.deadband.winnerMeanDeltaAwtS).toBeLessThan(0);
  }, TIMEOUT_MS);

  it('still reproduces its published figures', async () => {
    const mismatches = checkPinned('selection-sweep', selectionSweepFigures(await sweep()));
    expect(mismatches.length, describeMismatches('selection-sweep', mismatches)).toBe(0);
  }, TIMEOUT_MS);
});
