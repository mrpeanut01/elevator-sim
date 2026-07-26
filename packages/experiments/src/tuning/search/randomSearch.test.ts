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

  /**
   * The two methods treat an incumbent differently, on purpose, and the difference was documented
   * in neither place and asserted in neither: here `candidates` is *how many draws to take*, so an
   * incumbent **adds** a candidate; a rung's `candidates` is *how wide the rung is*, so there the
   * incumbent **occupies** a slot and `successiveHalving`'s budget stays exactly docs/06's 3 990.
   * Honouring an incumbent by taking one draw fewer would make a random search of `n` candidates
   * not a random search of `n` candidates.
   *
   * Both arithmetics are pinned, because an unstated budget difference between two methods is
   * precisely what an equal-budget comparison cannot survive. (`comparison.test.ts` runs neither
   * method with an incumbent, so the published table is unaffected either way — which is a reason
   * to state the rule, not a reason to leave it unstated.)
   */
  it('adds the incumbent to the draws rather than displacing one, and says so in the budget', async () => {
    const problem = sphereProblem(2, 10, [7, 3]);
    const objective = (): ReturnType<typeof syntheticObjective>['objective'] =>
      syntheticObjective({ fn: problem.fn, noiseSd: 0.5 }).objective;

    const without = await randomSearch({
      space: problem.space,
      objective: objective(),
      seed: SEED,
      candidates: 20,
      replications: 3,
    });
    const with_ = await randomSearch({
      space: problem.space,
      objective: objective(),
      seed: SEED,
      candidates: 20,
      replications: 3,
      incumbent: [0, 0],
    });

    expect(without.candidatesEvaluated).toBe(20);
    expect(without.replicationsSpent).toBe(20 * 3);
    expect(with_.candidatesEvaluated).toBe(21);
    expect(with_.replicationsSpent).toBe(21 * 3);

    /* And the twenty draws are the same twenty: the incumbent does not perturb the seeded stream. */
    const drawsOf = (result: SearchResult<readonly number[]>): readonly string[] =>
      result.evaluations
        .filter((evaluation) => evaluation.candidate.id !== 'incumbent')
        .map((evaluation) => JSON.stringify(evaluation.candidate.value));
    expect(drawsOf(with_)).toEqual(drawsOf(without));
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
