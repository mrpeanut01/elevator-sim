import { describe, expect, it } from 'vitest';

import { boxSpace, plateauProblem, syntheticObjective, uniformDimensions } from './fixtures.test-helper.js';
import { PlateauTally, isFlat, plateauClasses, probeStepFloor, sameOutcome } from './plateau.js';
import { runRound } from './round.js';
import { SearchError, type Evaluation, type Objective, type SearchRound } from './types.js';

const SEED = 4_242n;

describe('detecting a plateau', () => {
  const evaluation = (id: string, samples: readonly number[]): Evaluation<readonly number[]> => ({
    candidate: { id, value: [], origin: 'test' },
    round: 0,
    replications: samples.length,
    samples,
    traceDigests: samples.map((_, index) => `t${index}`),
    score: samples.reduce((total, value) => total + value, 0) / samples.length,
    finiteCount: samples.length,
    nonFiniteCount: 0,
    saturated: false,
    quotable: true,
  });

  const round = (evaluations: readonly Evaluation<readonly number[]>[]): SearchRound<readonly number[]> => ({
    round: 0,
    label: 'test',
    seed: '1',
    replications: evaluations[0]?.samples.length ?? 0,
    evaluations,
    distinctOutcomes: new Set(evaluations.map((entry) => entry.samples.join(''))).size,
    traceDigests: evaluations[0]?.traceDigests ?? [],
  });

  it('calls two runs the same point iff every replication matches exactly', () => {
    expect(sameOutcome(evaluation('a', [1, 2, 3]), evaluation('b', [1, 2, 3]))).toBe(true);
    // A difference of 1e-12 is a difference. On this objective there is no intermediate regime for
    // a tolerance to live in: below the decision-flip threshold the difference is exactly zero.
    expect(sameOutcome(evaluation('a', [1, 2, 3]), evaluation('b', [1, 2, 3 + 1e-12]))).toBe(false);
    // Equal means, different runs.
    expect(sameOutcome(evaluation('a', [1, 3]), evaluation('b', [2, 2]))).toBe(false);
  });

  it('calls a round flat only when every candidate produced the same run', () => {
    expect(isFlat(round([evaluation('a', [1, 2]), evaluation('b', [1, 2])]))).toBe(true);
    expect(isFlat(round([evaluation('a', [1, 2]), evaluation('b', [1, 3])]))).toBe(false);
    expect(isFlat(round([]))).toBe(false);
  });

  it('groups a round into plateau classes in first-appearance order', () => {
    const classes = plateauClasses([
      evaluation('a', [1, 1]),
      evaluation('b', [2, 2]),
      evaluation('c', [1, 1]),
    ]);
    expect(classes.map((group) => group.map((entry) => entry.candidate.id))).toEqual([['a', 'c'], ['b']]);
  });

  it('tallies flat rounds, ties, and candidates bit-identical to the best', () => {
    const tally = new PlateauTally();
    tally.observe(round([evaluation('a', [5, 5]), evaluation('b', [5, 5]), evaluation('c', [9, 9])]));
    tally.observe(round([evaluation('d', [1, 1]), evaluation('e', [1, 1])]));
    tally.inflated();
    const report = tally.report();
    expect(report.flatRounds).toBe(1);
    expect(report.roundsWithTies).toBe(2);
    expect(report.tiedWithBest).toBe(2);
    expect(report.escapes).toBe(1);
    expect(report.stepFloor).toBeUndefined();

    tally.measured([0.2, 0.4]);
    expect(tally.report().stepFloor).toEqual([0.2, 0.4]);
  });

  /**
   * Regression: `escapes` used to be a single counter incremented by one `escaped()` method, so a
   * report could say that *something* escaped and nothing could say **what**. `cmaes.ts` has two
   * independent escapes, either of which reaches the optimum on its own, so a test asserting only
   * `escapes > 0` passes with either mechanism deleted — which is how a load-bearing behaviour
   * goes inert against a green suite.
   */
  it('counts the two escape mechanisms apart, and totals them into escapes', () => {
    const tally = new PlateauTally();
    expect(tally.report()).toMatchObject({ inflations: 0, restarts: 0, escapes: 0 });

    tally.inflated();
    tally.inflated();
    tally.inflated();
    tally.restarted();

    const report = tally.report();
    expect(report.inflations).toBe(3);
    expect(report.restarts).toBe(1);
    expect(report.escapes).toBe(4);
    /* The whole point: the total alone cannot distinguish these two tallies, and the split can. */
    const onlyRestarts = new PlateauTally();
    for (let i = 0; i < 4; i += 1) onlyRestarts.restarted();
    expect(onlyRestarts.report().escapes).toBe(report.escapes);
    expect(onlyRestarts.report().inflations).not.toBe(report.inflations);
  });
});

describe('probeStepFloor', () => {
  it('measures the width rather than assuming 0.03, to within the geometric resolution', async () => {
    const problem = plateauProblem(3, 2, 10, [8, 8, 8]);
    const probe = await probeStepFloor({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 0.5 }).objective,
      base: [1, 1, 1],
      seed: SEED,
      replications: 4,
      startFraction: 0.002,
      doublings: 10,
    });

    // Cells are 2 wide; a geometric probe brackets that to within a factor of two.
    for (const dimension of probe.dimensions) {
      expect(dimension.measured).toBe(true);
      expect(dimension.width).toBeGreaterThanOrEqual(2);
      expect(dimension.width).toBeLessThan(4);
    }
    expect(probe.widths).toHaveLength(3);
    // One round, so every probe point is paired against the base on identical traces. Three of
    // the thirty probe points are skipped rather than clamped: at k = 9 the step is 10.24 on a
    // box 10 wide, so neither direction fits, and a clamped point would be a duplicate of the
    // base reported as a measurement.
    expect(probe.round.evaluations).toHaveLength(1 + 3 * 9);
    expect(probe.replicationsSpent).toBe((1 + 3 * 9) * 4);
    const reference = probe.round.traceDigests;
    for (const evaluation of probe.round.evaluations) expect(evaluation.traceDigests).toEqual(reference);
  });

  it('reports a lower bound rather than a width when nothing it probed changed the run', async () => {
    const problem = plateauProblem(2, 2, 10, [8, 8]);
    const probe = await probeStepFloor({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn }).objective,
      base: [1, 1],
      seed: SEED,
      replications: 2,
      startFraction: 0.002,
      doublings: 4, // largest step 0.16, far inside a cell of width 2
    });
    for (const dimension of probe.dimensions) {
      expect(dimension.measured).toBe(false);
      expect(dimension.width).toBeCloseTo(0.16, 10);
    }
  });

  it('steps downward for a parameter sitting on its upper bound', async () => {
    const problem = plateauProblem(1, 2, 10, [0]);
    const probe = await probeStepFloor({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn }).objective,
      base: [10],
      seed: SEED,
      replications: 2,
      startFraction: 0.05,
      doublings: 6,
    });
    expect(probe.dimensions[0]?.measured).toBe(true);
  });

  it('refuses a base that is not a point of the space', async () => {
    const space = boxSpace(uniformDimensions(3, [0, 10]));
    const objective: Objective<readonly number[]> = (request) =>
      request.candidates.map((candidate) => ({ candidateId: candidate.id, samples: [0], traceDigests: ['t'] }));
    await expect(
      probeStepFloor({ space, objective, base: [1, 1], seed: SEED, replications: 1 }),
    ).rejects.toThrow(SearchError);
  });
});

describe('the round contract holds for a probe too', () => {
  it('fails a probe whose objective breaks common random numbers', async () => {
    const problem = plateauProblem(2, 2, 10, [8, 8]);
    await expect(
      probeStepFloor({
        space: problem.space,
        objective: syntheticObjective({ fn: problem.fn, noiseSd: 1, breakCrn: true }).objective,
        base: [1, 1],
        seed: SEED,
        replications: 3,
      }),
    ).rejects.toThrow(/Common random numbers are broken/);
  });

  it('runs a hand-built round through the same guard', async () => {
    const problem = plateauProblem(1, 2, 10, [8]);
    const round = await runRound(syntheticObjective({ fn: problem.fn }).objective, {
      candidates: [
        { id: 'a', value: [1], origin: 'test' },
        { id: 'b', value: [1.5], origin: 'test' },
      ],
      replications: 2,
      seed: SEED,
      round: 0,
      label: 'hand-built',
    });
    expect(round.distinctOutcomes).toBe(1);
    expect(isFlat(round)).toBe(true);
  });
});
