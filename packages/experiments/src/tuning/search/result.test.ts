/**
 * `SearchRecorder`, directly.
 *
 * The recorder had no test of its own: every assertion about it came through one of the three
 * optimizers, which is enough to catch a wrong number and not enough to catch a wrong *rule*. The
 * rule that went wrong is the fidelity ceiling — documented, deliberate, and monotone — meeting a
 * round that was never a candidate for the answer.
 */

import { describe, expect, it } from 'vitest';

import { SearchRecorder, runnerUpOf } from './result.js';
import { SearchError, type Evaluation, type SearchRound } from './types.js';

type Point = readonly number[];

function evaluation(
  id: string,
  samples: readonly number[],
  round = 0,
): Evaluation<Point> {
  const finite = samples.filter((value) => Number.isFinite(value));
  return {
    candidate: { id, value: [samples[0] ?? 0], origin: 'test' },
    round,
    replications: samples.length,
    samples,
    traceDigests: samples.map((_, index) => `t${index}`),
    score: finite.length === 0 ? Number.POSITIVE_INFINITY : finite.reduce((a, b) => a + b, 0) / finite.length,
    finiteCount: finite.length,
    nonFiniteCount: samples.length - finite.length,
    saturated: false,
    quotable: true,
  };
}

function round(
  index: number,
  label: string,
  evaluations: readonly Evaluation<Point>[],
): SearchRound<Point> {
  return {
    round: index,
    label,
    seed: '1',
    replications: evaluations[0]?.samples.length ?? 0,
    evaluations,
    distinctOutcomes: new Set(evaluations.map((entry) => entry.samples.join('|'))).size,
    traceDigests: evaluations[0]?.traceDigests ?? [],
  };
}

describe('the fidelity ceiling', () => {
  it('prefers the higher replication count over the lower number', () => {
    const recorder = new SearchRecorder<Point>();
    recorder.add(round(0, 'rung 1', [evaluation('lucky', [1, 1]), evaluation('steady', [9, 9])]));
    expect(recorder.best?.candidate.id).toBe('lucky');

    /* Rung 2 re-measures `steady` at three times the fidelity. A mean over 6 replications
       supersedes a mean over 2, whatever the numbers say — that is the whole reason a ladder is
       worth running. */
    recorder.add(round(1, 'rung 2', [evaluation('steady', [9, 9, 9, 9, 9, 9], 1)]));
    expect(recorder.best?.candidate.id).toBe('steady');
    expect(recorder.best?.replications).toBe(6);
  });
});

/**
 * The defect this file exists for.
 *
 * The ceiling only ever rises, so an evaluation recorded at a *high* replication count pins `best`
 * for the rest of the search. That is correct for a rung and catastrophic for a diagnostic round.
 * `sepCmaEs`'s plateau probe is such a round and `probeReplications` is a public option with no
 * documented relationship to `replications`, so the two met.
 */
describe('a diagnostic round', () => {
  const probeRound = round(0, 'plateau probe', [
    evaluation('probe-base', [40, 40, 40, 40]),
    evaluation('probe-0-3', [1, 1, 1, 1]), // numerically the best thing the search will ever see
  ]);
  const generation = round(1, 'generation 1', [
    evaluation('g-00', [5, 5], 1),
    evaluation('g-01', [7, 7], 1),
  ]);

  it('cannot become the answer, however good and however high its fidelity', () => {
    const recorder = new SearchRecorder<Point>();
    recorder.add(probeRound, { eligibleForBest: false });
    expect(recorder.best).toBeUndefined();

    recorder.add(generation);
    expect(recorder.best?.candidate.id).toBe('g-00');
    /* Four replications against the generation's two: under the plain ceiling rule the probe wins
       and never gives the title back. */
    expect(recorder.best?.replications).toBe(2);
  });

  it('does not displace an incumbent best when it is recorded afterwards either', () => {
    const recorder = new SearchRecorder<Point>();
    recorder.add(generation);
    recorder.add(probeRound, { eligibleForBest: false });
    expect(recorder.best?.candidate.id).toBe('g-00');
  });

  it('is still counted in every other way: it was run and it cost what it cost', () => {
    const recorder = new SearchRecorder<Point>();
    recorder.add(probeRound, { eligibleForBest: false });
    recorder.add(generation);
    const result = recorder.finish('sep-cmaes', 7n, 9n);

    expect(result.replicationsSpent).toBe(4 + 4 + 2 + 2);
    expect(result.candidatesEvaluated).toBe(4);
    expect(result.rounds).toHaveLength(2);
    expect(result.evaluations.map((entry) => entry.candidate.id)).toEqual([
      'probe-base',
      'probe-0-3',
      'g-00',
      'g-01',
    ]);
    /* And the trajectory starts at the first *eligible* round, not at the probe's number. */
    expect(result.trajectory.map((point) => point.bestCandidateId)).toEqual(['g-00']);
  });

  it('defaults to eligible, so an ordinary round needs no ceremony', () => {
    const recorder = new SearchRecorder<Point>();
    recorder.add(probeRound);
    expect(recorder.best?.candidate.id).toBe('probe-0-3');
  });

  it('leaves a search with nothing but diagnostics without a result, and says which case it is', () => {
    const empty = new SearchRecorder<Point>();
    expect(() => empty.finish('random', 1n, 1n)).toThrow(/no candidate was ever evaluated/);

    const diagnosticOnly = new SearchRecorder<Point>();
    diagnosticOnly.add(probeRound, { eligibleForBest: false });
    expect(() => diagnosticOnly.finish('sep-cmaes', 1n, 1n)).toThrow(SearchError);
    expect(() => diagnosticOnly.finish('sep-cmaes', 1n, 1n)).toThrow(/every one of them was diagnostic/);
  });
});

describe('the runner-up', () => {
  it('comes from the best candidate’s own round, so the differences are paired', () => {
    const best = evaluation('winner', [4, 4, 4]);
    const rival = evaluation('rival', [6, 5, 7]);
    const rounds = [round(0, 'only', [best, rival])];

    const comparison = runnerUpOf(rounds, best);
    expect(comparison?.candidateId).toBe('rival');
    expect(comparison?.pairedDifferences).toEqual([-2, -1, -3]);
    expect(comparison?.identical).toBe(false);
  });

  it('flags bit-identical arms rather than reporting a difference of zero as a narrow win', () => {
    const best = evaluation('a', [4, 4, 4]);
    const twin = evaluation('b', [4, 4, 4]);
    const comparison = runnerUpOf([round(0, 'only', [best, twin])], best);
    expect(comparison?.identical).toBe(true);
    expect(comparison?.pairedDifferences).toEqual([0, 0, 0]);
  });
});
