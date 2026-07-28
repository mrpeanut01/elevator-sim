import { describe, expect, it } from 'vitest';

import type { DispatcherProfile } from '@elevator-sim/core';

import { pairedDifferenceEstimate } from '../../reports/statistics.js';
import { intervalContainsZero } from '../../reports/types.js';
import { REPLICATION_METRICS } from '../../runner/index.js';
import type { CellResult, ExperimentResult, MetricAggregate, ReplicationMetric } from '../../runner/index.js';
import { loadResources } from '../../runner/fixtures.test-helper.js';

import { boxSpace } from './fixtures.test-helper.js';
import { outcomeOf, roundExperimentSpec, runnerObjective } from './objective.js';
import { randomSearch } from './randomSearch.js';
import { runRound } from './round.js';
import { SearchError, type ObjectiveRequest } from './types.js';

const SEED = 20_260_726;

/* -------------------------------------------------------------------------- *
 * The spec one round becomes — pure, so it is asserted directly
 * -------------------------------------------------------------------------- */

const request: ObjectiveRequest<number> = {
  candidates: [
    { id: 'cand-0', value: 1, origin: 'test' },
    { id: 'cand-1', value: 2, origin: 'test' },
  ],
  replications: 30,
  seed: 777n,
  round: 2,
  label: 'rung 2 (33 × 30)',
};

const profileOf = (value: number, id: string): DispatcherProfile => ({
  id,
  name: id,
  weights: { waitTime: value },
});

describe('roundExperimentSpec', () => {
  const spec = roundExperimentSpec(
    {
      resources: { buildingsById: new Map(), dispatcherProfilesById: new Map(), trafficProfiles: {} as never },
      buildingId: 'garden-apartments',
      traffic: { id: 'up-peak' },
      materialize: profileOf,
      experimentId: 'phase7',
    },
    request,
  );

  it('puts every candidate of a round into one experiment at one seed, which is what pairs them', () => {
    expect(spec.seed).toBe('777');
    expect(spec.buildings).toEqual(['garden-apartments']);
    expect(spec.traffic).toEqual([{ id: 'up-peak' }]);
    expect(spec.dispatchers).toEqual([
      { id: 'cand-0', profile: 'cand-0' },
      { id: 'cand-1', profile: 'cand-1' },
    ]);
  });

  it('is a fixed-budget experiment, because the ladder owns the fidelity schedule', () => {
    expect(spec.replication?.minReplications).toBe(30);
    expect(spec.replication?.maxReplications).toBe(30);
  });

  it('names the round in the experiment id, so a persisted result says which round it was', () => {
    expect(spec.id).toBe('phase7-round-2');
    expect(spec.description).toBe('rung 2 (33 × 30)');
  });
});

/* -------------------------------------------------------------------------- *
 * The mapping, against an injected runner
 * -------------------------------------------------------------------------- */

function metricAggregate(metric: ReplicationMetric, samples: readonly number[]): MetricAggregate {
  return { metric, samples, finiteCount: samples.length, nonFiniteCount: 0, statistic: undefined };
}

function fakeCell(armId: string, samples: readonly number[], overrides: Partial<CellResult> = {}): CellResult {
  const metrics = Object.fromEntries(
    REPLICATION_METRICS.map((metric) => [metric, metricAggregate(metric, samples)]),
  ) as Record<ReplicationMetric, MetricAggregate>;
  return {
    cellId: `c|t|${armId}`,
    buildingId: 'b',
    trafficArmId: 't',
    dispatcherArmId: armId,
    dispatcherProfileId: armId,
    traceKey: 'k',
    replications: samples.map((_, index) => ({ traceDigest: `d${index}` }) as never),
    failures: [],
    aggregate: {
      count: samples.length,
      metrics,
      saturatedCount: 0,
      saturated: false,
      awtValidCount: samples.length,
      awtInvalidCount: 0,
      awtIsValid: true,
    },
    stopping: {} as never,
    ...overrides,
  };
}

describe('runnerObjective', () => {
  const resources = {
    buildingsById: new Map(),
    dispatcherProfilesById: new Map<string, DispatcherProfile>([['base', profileOf(1, 'base')]]),
    trafficProfiles: {} as never,
  };

  it('registers each candidate as its own profile and maps the cells back by arm id', async () => {
    const seen: string[] = [];
    const objective = runnerObjective<number>({
      resources,
      buildingId: 'b',
      traffic: { id: 't' },
      materialize: profileOf,
      run: async (_spec, passed) => {
        seen.push(...[...passed.dispatcherProfilesById.keys()]);
        return {
          cells: [fakeCell('cand-1', [5, 6]), fakeCell('cand-0', [1, 2])],
        } as unknown as ExperimentResult;
      },
    });

    const outcomes = await objective({ ...request, replications: 2 });
    expect(seen).toEqual(['base', 'cand-0', 'cand-1']);
    // Returned in the round's order, not the runner's.
    expect(outcomes.map((outcome) => outcome.candidateId)).toEqual(['cand-0', 'cand-1']);
    expect(outcomes[0]?.samples).toEqual([1, 2]);
    expect(outcomes[0]?.traceDigests).toEqual(['d0', 'd1']);
  });

  it('negates a metric where more is better, once, rather than in three search loops', async () => {
    const objective = runnerObjective<number>({
      resources,
      buildingId: 'b',
      traffic: { id: 't' },
      materialize: profileOf,
      metric: 'personsPer5Min',
      direction: -1,
      run: async () => ({ cells: [fakeCell('cand-0', [40, 44]), fakeCell('cand-1', [10, 12])] }) as unknown as ExperimentResult,
    });
    const outcomes = await objective({ ...request, replications: 2 });
    expect(outcomes[0]?.samples).toEqual([-40, -44]);
  });

  it('refuses a materialization whose id does not match the candidate it ran', async () => {
    const objective = runnerObjective<number>({
      resources,
      buildingId: 'b',
      traffic: { id: 't' },
      materialize: (value) => profileOf(value, 'something-else'),
      run: async () => ({ cells: [] }) as unknown as ExperimentResult,
    });
    await expect(objective({ ...request, replications: 2 })).rejects.toThrow(SearchError);
  });

  it('refuses a runner that came back without a cell for a candidate', async () => {
    const objective = runnerObjective<number>({
      resources,
      buildingId: 'b',
      traffic: { id: 't' },
      materialize: profileOf,
      run: async () => ({ cells: [fakeCell('cand-0', [1, 2])] }) as unknown as ExperimentResult,
    });
    await expect(objective({ ...request, replications: 2 })).rejects.toThrow(/no cell for candidate "cand-1"/);
  });

  it('carries the suppression flag through, so an unquotable candidate cannot be promoted', () => {
    const saturated = fakeCell('x', [1, 2], {
      aggregate: {
        ...fakeCell('x', [1, 2]).aggregate,
        saturated: true,
        saturatedCount: 1,
        awtIsValid: false,
        awtInvalidReason: 'diverging queue',
      },
    });
    expect(outcomeOf(saturated, 'awtS').quotable).toBe(false);
    expect(outcomeOf(saturated, 'awtS').saturated).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * The seam itself, measured through the real simulator
 * -------------------------------------------------------------------------- */

const SPARSE = { id: 'sparse', durationS: 900, demand: { arrivalRatePctPop5min: 8, peakWindowS: 300 } } as const;

async function deadbandObjective() {
  const resources = await loadResources();
  const base = resources.dispatcherProfilesById.get('predictive-balanced');
  if (base === undefined) throw new Error('predictive-balanced is missing from data/');
  return runnerObjective<readonly number[]>({
    resources,
    buildingId: 'garden-apartments',
    traffic: SPARSE,
    materialize: (value, id) => ({
      ...base,
      id,
      name: id,
      idle: { ...(base.idle ?? {}), repositionThresholdS: value[0] ?? 8 },
    }),
    parallel: { mode: 'serial' },
  });
}

describe('the seam, through the real runner and the real data directory', () => {
  it('gives every arm byte-identical traces, and the same configuration twice the same run', async () => {
    const round = await runRound(await deadbandObjective(), {
      candidates: [
        { id: 'deadband-8', value: [8], origin: 'test' },
        { id: 'deadband-2', value: [2], origin: 'test' },
        { id: 'deadband-8-again', value: [8], origin: 'test' },
      ],
      replications: 6,
      seed: 20_260_726n,
      round: 0,
      label: 'seam',
    });

    const [shipped, moved, repeat] = round.evaluations;
    // Common random numbers, through the runner rather than through a fixture.
    for (const evaluation of round.evaluations) {
      expect(evaluation.traceDigests).toEqual(round.traceDigests);
    }
    expect(new Set(round.traceDigests).size).toBe(6);

    // One configuration under two names is one dispatcher under two names: bit-identical.
    expect(repeat?.samples).toEqual(shipped?.samples);

    // And the parameter genuinely reaches the simulator: docs/05-roadmap.md's standing
    // requirement is that a configurable-but-dead behaviour is the defect this project has
    // shipped four times, so this is measured rather than assumed.
    expect(moved?.samples).not.toEqual(shipped?.samples);
    expect(round.distinctOutcomes).toBe(2);
  }, 60_000);

  it('sees the piecewise-constant objective in the live system, not only in the fixtures', async () => {
    const round = await runRound(await deadbandObjective(), {
      candidates: [5, 6, 7, 8].map((value) => ({ id: `deadband-${value}`, value: [value], origin: 'test' })),
      replications: 6,
      seed: 20_260_726n,
      round: 0,
      label: 'plateau',
    });
    // Phase 5 measured that predictive-balanced's own 8 s deadband vetoes every reposition. Every
    // value at or above 5 is therefore the same dispatcher, and the runs are bit-identical.
    expect(round.distinctOutcomes).toBe(1);
  }, 60_000);

  /**
   * **The known-answer test.**
   *
   * docs/06 leaves `predictive-balanced`'s `idle.repositionThresholdS: 8` as shipped, on purpose,
   * so that Phase 7 has ground truth: Phase 5's sweep on Garden Apartments at n = 300 found an
   * **interior optimum at 2 s** worth −1.110 s [−1.550, −0.670] against `stay`, with the curve
   * turning back up below it as repositioning churn sets in.
   *
   * Nothing here is told about elevators, deadbands or the number 2. A one-dimensional box, a
   * materializer, and 390 replications of random search — and the answer comes back.
   */
  it('rediscovers the interior optimum on the one dimension with a known answer', async () => {
    const space = boxSpace([{ id: 'idle.repositionThresholdS', range: [0, 10] }]);
    const result = await randomSearch({
      space,
      objective: await deadbandObjective(),
      seed: SEED,
      candidates: 12,
      replications: 30,
      incumbent: [8],
    });

    const at = (evaluation: { candidate: { value: readonly number[] } }): number => evaluation.candidate.value[0] ?? 0;
    const best = at(result.best);
    expect(best).toBeGreaterThan(0.5);
    expect(best).toBeLessThan(4);

    const incumbent = result.evaluations.find((evaluation) => evaluation.candidate.id === 'incumbent');
    expect(incumbent).toBeDefined();
    expect(result.best.score).toBeLessThan(incumbent?.score ?? 0);

    // The curve turns back up below the optimum: the candidate at 0.43 s is worse than the best,
    // which is the interior-optimum shape Phase 5 measured and not a monotone "smaller is better".
    const churning = result.evaluations.filter((evaluation) => at(evaluation) < 0.5);
    expect(churning.length).toBeGreaterThan(0);
    for (const evaluation of churning) expect(evaluation.score).toBeGreaterThan(result.best.score);

    // The plateau above the shipped value is real and wide: every deadband from about 4 upwards is
    // bit-identical to 8, so two thirds of the box is one point of the objective.
    const identical = result.evaluations.filter(
      (evaluation) => evaluation.samples.join('|') === incumbent?.samples.join('|'),
    );
    expect(identical.length).toBeGreaterThanOrEqual(8);
    for (const evaluation of identical) expect(at(evaluation)).toBeGreaterThan(3.5);

    // And it is **not** declared a win. Measured: −0.598 s [−2.051, +0.856] at n = 30 — the
    // interval contains zero, so this budget locates the region and cannot resolve the effect.
    // Phase 5 needed n = 300 for [−1.550, −0.670]. The search reports the difference; classifying
    // it is `benchmark/verdict.ts`'s job and it would say INDISTINGUISHABLE here.
    const paired = pairedDifferenceEstimate(result.best.samples, incumbent?.samples ?? [], {
      confidence: 0.95,
    });
    expect(paired.mean).toBeLessThan(0);
    expect(intervalContainsZero(paired)).toBe(true);
  }, 120_000);
});
