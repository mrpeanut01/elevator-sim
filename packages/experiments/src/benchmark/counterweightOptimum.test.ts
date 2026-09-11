/**
 * **The counterweight study's structural claims, re-derived rather than transcribed** — GitHub issue
 * #431's fourth criterion, `DECISIONS.md` § D539.
 *
 * `counterweightOptimum.ts` publishes a dated table in its header and this file does not assert those
 * digits, for `descentCapHeight.test.ts`'s reason. What it asserts is what the study's method rests on:
 *
 * 1. **The minimiser is exact** — equal in cost to the best point of a fine brute-force grid, with and
 *    without a regenerative drive — and at no recovery it is the weighted median, on a hand example.
 * 2. **Re-pricing is re-simulation.** A run's work re-priced at 0.4 from its own samples is exactly
 *    the work of the same run simulated with the bank at 0.4, and the legs of the two runs are
 *    identical. That equality is what licenses measuring an optimum without sweeping a ratio.
 * 3. **The band can only save.** Clamped into 0.4–0.5, the optimum never costs more than 0.5 does, run
 *    by run, because 0.5 is inside the band and the objective is convex.
 * 4. **The published run is an operating point, and its finding holds.** On the whole published budget no
 *    replication saturates or has its AWT refused, and every replication's optimum, with or without a
 *    regenerative drive, lies below 0.4 — the null for the decision `DECISIONS.md` § D539 records. That
 *    clause is a finding rather than a structure, and it is asserted so that a change which moves an
 *    optimum into the band turns this file red instead of leaving the header's record wrong.
 */

import { parseBuilding, resolveBuilding, Simulation, type BuildingConfig } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import { loadResources } from '../validation/harness.js';

import {
  BAND,
  OPTIMUM_BUILDING,
  OPTIMUM_DISPATCHER,
  OPTIMUM_RATES_PCT_POP_5MIN,
  OPTIMUM_REPLICATIONS,
  OPTIMUM_TEMPLATES,
  balanceCost,
  formatCounterweightOptimumStudy,
  movesInWindow,
  optimalBalanceRatio,
  repricedWorkKJ,
  runCounterweightOptimumStudy,
  type WeightedMove,
} from './counterweightOptimum.js';

/** A small deterministic generator, so the synthetic moves are the same on every run. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

function syntheticMoves(seed: number, count: number): WeightedMove[] {
  const next = lcg(seed);
  return Array.from({ length: count }, () => ({
    share: next() * 1.1,
    weight: 100 + next() * 4000,
    direction: next() < 0.5 ? ('up' as const) : ('down' as const),
  }));
}

describe('the minimiser is exact', () => {
  it('is the weighted median when nothing is recovered, on a hand example', () => {
    const moves: WeightedMove[] = [
      { share: 0.1, weight: 1, direction: 'up' },
      { share: 0.3, weight: 1, direction: 'down' },
      { share: 0.9, weight: 3, direction: 'up' },
    ];
    // Total weight 5; the cumulative weight first reaches half at the move at 0.9.
    expect(optimalBalanceRatio(moves, 0)).toBe(0.9);
    expect(optimalBalanceRatio([], 0)).toBeNaN();
  });

  it('costs no more than the best point of a 0.001 grid, with and without regeneration', () => {
    for (const recovery of [0, 0.6]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const moves = syntheticMoves(seed, 200);
        const optimum = optimalBalanceRatio(moves, recovery);
        let best = Number.POSITIVE_INFINITY;
        for (let step = 0; step <= 1100; step += 1) {
          best = Math.min(best, balanceCost(moves, step / 1000, recovery));
        }
        expect(balanceCost(moves, optimum, recovery)).toBeLessThanOrEqual(best + 1e-6);
      }
    }
  });
});

describe('re-pricing is re-simulation', () => {
  it('re-prices a run at 0.4 to exactly the work of the run simulated at 0.4, on the same legs', async () => {
    const config = await loadResources();
    const shipped = config.buildingsById.get(OPTIMUM_BUILDING);
    const dispatcherProfile = config.dispatcherProfilesById.get(OPTIMUM_DISPATCHER);
    if (shipped === undefined || dispatcherProfile === undefined) throw new Error('missing fixture');
    const authored = structuredClone(shipped.config) as BuildingConfig;
    const document = {
      ...authored,
      banks: authored.banks.map((bank) => ({ ...bank, counterweightBalanceRatio: 0.4 })),
    };
    const atFour = resolveBuilding(parseBuilding(document, 'midtown.json'), config.elevatorSpecs);
    const run = (building: typeof shipped) =>
      new Simulation({
        building,
        dispatcherProfile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: 20_260_911n,
        demandTemplate: OPTIMUM_TEMPLATES[0],
        onTimeout: 'report',
      }).run();
    const base = run(shipped);
    const simulated = run(atFour);
    const samples = base.record.travelSamples ?? [];

    expect(JSON.stringify(simulated.record.passengers)).toBe(JSON.stringify(base.record.passengers));
    expect(repricedWorkKJ(samples, base.reportWindow, 0.5, 0)).toBe(base.summary.energy.workKJ);
    expect(repricedWorkKJ(samples, base.reportWindow, 0.4, 0)).toBe(simulated.summary.energy.workKJ);
    expect(movesInWindow(samples, base.reportWindow).length).toBe(base.summary.energy.starts);
  }, 300_000);
});

describe('the study, on its published budget', () => {
  it('measures every template at a light and a heavy operating point, and no replication saturates', async () => {
    // The whole published budget rather than a reduced one: the first heavy point chosen here passed
    // three replications and saturated 12 of the published 100 office-peak runs, which a reduced
    // budget could not see. The study is about ten seconds, so the claim is a test and not a sentence.
    const study = await runCounterweightOptimumStudy();
    const label = (rate: number, templateId: string): string => `${String(rate)} % ${templateId}`;
    expect(study.rows.map((row) => label(row.ratePctPop5min, row.templateId))).toEqual(
      OPTIMUM_RATES_PCT_POP_5MIN.flatMap((rate) =>
        OPTIMUM_TEMPLATES.map((templateId) => label(rate, templateId)),
      ),
    );
    for (const row of study.rows) {
      const at = label(row.ratePctPop5min, row.templateId);
      expect(row.optima, at).toHaveLength(OPTIMUM_REPLICATIONS);
      // An optimum read off overloaded cars is not an operating point. The templates' own default
      // rate saturates every replication on this building, which is the first design's defect and
      // the reason both rates are named; a refusal on any other ground is the same warning.
      expect(row.saturated, at).toBe(0);
      expect(row.awtRefused, at).toBe(0);
      for (const optimum of row.optima) {
        expect(optimum, at).toBeGreaterThanOrEqual(0);
        expect(optimum, at).toBeLessThanOrEqual(1.25);
      }
      expect(row.outsideBand, at).toBeLessThanOrEqual(OPTIMUM_REPLICATIONS);
      for (const saving of row.savingsKJ) expect(saving, at).toBeLessThanOrEqual(1e-9);
      // The finding the header publishes: every optimum, with or without a drive, lies below the band,
      // so the band's best is its floor on every run. A change that moves one into the band is red here.
      expect(row.optima.every((ratio) => ratio < BAND.min), at).toBe(true);
      expect(row.optimaRegenerative.every((ratio) => ratio < BAND.min), at).toBe(true);
      expect(row.clampedOptima.every((ratio) => ratio === BAND.min), at).toBe(true);
    }
    for (const rate of OPTIMUM_RATES_PCT_POP_5MIN) {
      const [up, down] = OPTIMUM_TEMPLATES.slice(0, 2).map((templateId) =>
        study.rows.find((row) => row.templateId === templateId && row.ratePctPop5min === rate),
      );
      // The defect the first run of this study shipped to its own log: `office-down-peak` draws
      // `rise-and-fall`'s passengers unless the demand names a direction, so without the splits the
      // two rows are the same run printed twice. Identical rows here mean that has come back.
      expect(down?.optima, `${String(rate)} %`).not.toEqual(up?.optima);
    }
    expect(study.differences).toHaveLength(OPTIMUM_RATES_PCT_POP_5MIN.length * 3);
    expect(study.differences.every((difference) => difference.pairs === OPTIMUM_REPLICATIONS)).toBe(true);
    expect(study.differences[0]?.optimumDifference.halfWidth).toBeGreaterThan(0);
    const text = formatCounterweightOptimumStudy(study);
    for (const templateId of OPTIMUM_TEMPLATES) expect(text).toContain(templateId);
  }, 600_000);
});
