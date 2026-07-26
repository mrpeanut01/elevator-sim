import { describe, expect, it } from 'vitest';

import { distance, plateauProblem, sphereProblem, syntheticObjective } from './fixtures.test-helper.js';
import { randomSearch } from './randomSearch.js';
import { SearchError, type SearchResult } from './types.js';

const SEED = 20_260_726;

/** The trajectory a determinism test compares: what was evaluated, in what order, scoring what. */
function trajectoryOf<C>(result: SearchResult<C>): readonly string[] {
  return result.evaluations.map(
    (evaluation) => `${evaluation.round}/${evaluation.candidate.id}/${evaluation.score}`,
  );
}

describe('randomSearch', () => {
  it('finds the optimum of a synthetic objective with a known answer', async () => {
    const problem = sphereProblem(2, 10, [7, 3]);
    const result = await randomSearch({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 0.5 }).objective,
      seed: SEED,
      candidates: 200,
      replications: 5,
    });

    expect(result.method).toBe('random');
    expect(result.candidatesEvaluated).toBe(200);
    expect(result.replicationsSpent).toBe(200 * 5);
    expect(distance(result.best.candidate.value, problem.optimum)).toBeLessThan(1);
  });

  it('is not defeated by a plateau, because it never asks one for a direction', async () => {
    const problem = plateauProblem(2, 2, 10, [7, 7]);
    const result = await randomSearch({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 0.5 }).objective,
      seed: SEED,
      candidates: 200,
      replications: 5,
    });

    // The optimum is a whole cell wide, so "found it" means landing in the right cell: score 0.
    expect(result.best.score).toBeLessThan(1);
    expect(result.plateau.escapes).toBe(0);
    // And it really did meet the plateau: many draws produced bit-identical runs.
    expect(result.plateau.roundsWithTies).toBeGreaterThan(0);
    expect(result.notes.some((note) => note.includes('bit-identical'))).toBe(true);
  });

  it('gives every candidate the same traces, and says so in the digests', async () => {
    const problem = sphereProblem(2);
    const result = await randomSearch({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 1 }).objective,
      seed: SEED,
      candidates: 12,
      replications: 4,
    });

    const reference = result.rounds[0]?.traceDigests;
    expect(reference).toHaveLength(4);
    for (const evaluation of result.evaluations) {
      expect(evaluation.traceDigests).toEqual(reference);
    }
  });

  it("keeps pairing across batches under the 'fixed' seed policy, so batching costs nothing", async () => {
    const problem = sphereProblem(2);
    const batched = await randomSearch({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 1 }).objective,
      seed: SEED,
      candidates: 12,
      replications: 4,
      batchSize: 5,
    });

    expect(batched.rounds).toHaveLength(3);
    expect(batched.replicationsSpent).toBe(12 * 4);
    const reference = batched.rounds[0]?.traceDigests;
    for (const round of batched.rounds) expect(round.traceDigests).toEqual(reference);

    // Same seed, same draws: batching changes the round structure and nothing else.
    const single = await randomSearch({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 1 }).objective,
      seed: SEED,
      candidates: 12,
      replications: 4,
    });
    expect(batched.best.candidate.id).toBe(single.best.candidate.id);
    expect(batched.best.score).toBe(single.best.score);
  });

  it("gives up cross-round pairing under 'per-round', which is the whole cost of that policy", async () => {
    const problem = sphereProblem(2);
    const result = await randomSearch({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 1 }).objective,
      seed: SEED,
      candidates: 12,
      replications: 4,
      batchSize: 6,
      seedPolicy: 'per-round',
    });
    expect(result.rounds[0]?.traceDigests).not.toEqual(result.rounds[1]?.traceDigests);
  });

  it('reproduces its whole trajectory from the seed', async () => {
    const problem = sphereProblem(3);
    const run = async (): Promise<SearchResult<readonly number[]>> =>
      randomSearch({
        space: problem.space,
        objective: syntheticObjective({ fn: problem.fn, noiseSd: 1.5 }).objective,
        seed: '20260726',
        candidates: 30,
        replications: 4,
      });

    const first = await run();
    const second = await run();
    expect(trajectoryOf(second)).toEqual(trajectoryOf(first));
    expect(second.best.candidate.value).toEqual(first.best.candidate.value);
    expect(second.trajectory).toEqual(first.trajectory);
  });

  it('evaluates the incumbent on the same traces as the draws, so the comparison is paired', async () => {
    const problem = sphereProblem(2, 10, [7, 3]);
    const result = await randomSearch({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 0.5 }).objective,
      seed: SEED,
      candidates: 40,
      replications: 6,
      incumbent: [0, 0],
    });

    const incumbent = result.evaluations.find((evaluation) => evaluation.candidate.id === 'incumbent');
    expect(incumbent).toBeDefined();
    expect(incumbent?.traceDigests).toEqual(result.best.traceDigests);
    expect(result.best.candidate.id).not.toBe('incumbent');
    expect(result.runnerUp).toBeDefined();
    expect(result.runnerUp?.pairedDifferences).toHaveLength(6);
  });

  it('refuses a budget that is not one', async () => {
    const problem = sphereProblem(2);
    const objective = syntheticObjective({ fn: problem.fn }).objective;
    await expect(randomSearch({ space: problem.space, objective, seed: SEED, candidates: 0 })).rejects.toThrow(
      SearchError,
    );
    await expect(
      randomSearch({ space: problem.space, objective, seed: SEED, candidates: 4, batchSize: 0 }),
    ).rejects.toThrow(SearchError);
  });
});
