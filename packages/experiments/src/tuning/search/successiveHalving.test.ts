import { describe, expect, it } from 'vitest';

import { distance, plateauProblem, sphereProblem, syntheticObjective } from './fixtures.test-helper.js';
import {
  assertLadder,
  plannedBudget,
  successiveHalving,
  type SuccessiveHalvingResult,
} from './successiveHalving.js';
import { DOC_RUNGS, SearchError, type Rung } from './types.js';

const SEED = 20_260_726;

function trajectoryOf<C>(result: SuccessiveHalvingResult<C>): readonly string[] {
  return result.evaluations.map(
    (evaluation) => `${evaluation.round}/${evaluation.candidate.id}/${evaluation.score}`,
  );
}

describe("docs/06's ladder", () => {
  it('is 100 x 10 -> 33 x 30 -> 11 x 100 -> 3 x 300, and costs 3 990 replications', () => {
    expect(DOC_RUNGS.map((rung) => rung.candidates)).toEqual([100, 33, 11, 3]);
    expect(DOC_RUNGS.map((rung) => rung.replications)).toEqual([10, 30, 100, 300]);
    expect(plannedBudget(DOC_RUNGS)).toBe(3_990);
  });

  it('rejects a ladder that does not narrow, or does not raise fidelity', () => {
    expect(() => assertLadder([])).toThrow(SearchError);
    expect(() =>
      assertLadder([
        { candidates: 10, replications: 10 },
        { candidates: 10, replications: 30 },
      ]),
    ).toThrow(/does not narrow/);
    expect(() =>
      assertLadder([
        { candidates: 10, replications: 30 },
        { candidates: 3, replications: 30 },
      ]),
    ).toThrow(/fidelity dimension/);
  });
});

describe('successiveHalving', () => {
  it('allocates budget exactly as documented, and evaluates each rung at its declared width', async () => {
    const problem = sphereProblem(2);
    const synthetic = syntheticObjective({ fn: problem.fn, noiseSd: 3, interactionSd: 0.5 });
    const result = await successiveHalving({
      space: problem.space,
      objective: synthetic.objective,
      seed: SEED,
    });

    expect(result.rungs.map((rung) => rung.evaluated.length)).toEqual([100, 33, 11, 3]);
    expect(result.rungs.map((rung) => rung.declared.replications)).toEqual([10, 30, 100, 300]);
    expect(result.rungs.map((rung) => rung.replicationsSpent)).toEqual([1_000, 990, 1_100, 900]);
    expect(result.rungs.map((rung) => rung.promoted.length)).toEqual([33, 11, 3, 0]);
    expect(result.replicationsSpent).toBe(plannedBudget(DOC_RUNGS));
    expect(synthetic.replications()).toBe(plannedBudget(DOC_RUNGS));
    expect(result.candidatesEvaluated).toBe(100);
  });

  it('never ranks a candidate on fewer replications than the rung declared', async () => {
    const problem = sphereProblem(2);
    const short = syntheticObjective({ fn: problem.fn, shortReplications: 5 });
    await expect(
      successiveHalving({ space: problem.space, objective: short.objective, seed: SEED }),
    ).rejects.toThrow(/came back with 5 replications/);

    // And the guard is on the evaluation, not merely on the request: every promoted candidate
    // carries a replication count at least its rung's.
    const honest = syntheticObjective({ fn: problem.fn, noiseSd: 2 });
    const result = await successiveHalving({ space: problem.space, objective: honest.objective, seed: SEED });
    for (const round of result.rounds) {
      for (const evaluation of round.evaluations) {
        expect(evaluation.replications).toBeGreaterThanOrEqual(round.replications);
      }
    }
  });

  it("makes each rung a refinement of the last: a survivor's samples are extended, not replaced", async () => {
    const problem = sphereProblem(2);
    const result = await successiveHalving({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 2, interactionSd: 0.4 }).objective,
      seed: SEED,
    });
    expect(result.prefixVerified).toBe(true);

    const winner = result.best.candidate.id;
    const perRung = result.rounds
      .map((round) => round.evaluations.find((evaluation) => evaluation.candidate.id === winner))
      .filter((evaluation) => evaluation !== undefined);
    expect(perRung).toHaveLength(4);
    for (let index = 1; index < perRung.length; index += 1) {
      const earlier = perRung[index - 1]?.samples ?? [];
      const later = perRung[index]?.samples ?? [];
      expect(later.slice(0, earlier.length)).toEqual([...earlier]);
    }
  });

  it("gives that property up under 'per-round', and says so rather than claiming it", async () => {
    const problem = sphereProblem(2);
    const result = await successiveHalving({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 2 }).objective,
      seed: SEED,
      seedPolicy: 'per-round',
      rungs: [
        { candidates: 9, replications: 4 },
        { candidates: 3, replications: 12 },
      ],
    });
    expect(result.prefixVerified).toBeUndefined();
  });

  it('finds the optimum of a synthetic objective with a known answer', async () => {
    const problem = sphereProblem(2, 10, [7, 3]);
    const result = await successiveHalving({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 3, interactionSd: 0.5 }).objective,
      seed: SEED,
    });
    expect(distance(result.best.candidate.value, problem.optimum)).toBeLessThan(1);
    expect(result.best.replications).toBe(300);
  });

  it('reports a cut that fell inside a plateau instead of presenting it as a decision', async () => {
    const problem = plateauProblem(2, 3, 10, [6, 6]);
    const result = await successiveHalving({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 1 }).objective,
      seed: SEED,
    });
    // A 3-wide cell on a 10-wide box gives four distinct scores per axis, so 100 draws cannot help
    // colliding: at least one rung's cut must land inside a class of bit-identical runs.
    expect(result.rungs.some((rung) => rung.tiedAtCut)).toBe(true);
    expect(result.notes.some((note) => note.includes('decided by candidate id'))).toBe(true);
  });

  it('lets the incumbent occupy a declared slot rather than inflating the budget', async () => {
    const problem = sphereProblem(2, 10, [7, 3]);
    const rungs: readonly Rung[] = [
      { candidates: 9, replications: 4 },
      { candidates: 3, replications: 12 },
    ];
    const result = await successiveHalving({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 1 }).objective,
      seed: SEED,
      rungs,
      incumbent: [7.2, 3.1],
    });
    expect(result.rungs[0]?.evaluated).toContain('incumbent');
    expect(result.rungs[0]?.evaluated).toHaveLength(9);
    expect(result.replicationsSpent).toBe(plannedBudget(rungs));
    // A near-optimal incumbent survives to the top rung; the search's job is to know that.
    expect(result.rungs[1]?.evaluated).toContain('incumbent');
  });

  it('accepts an externally supplied pool, so another method can feed it', async () => {
    const problem = sphereProblem(2, 10, [7, 3]);
    const pool = Array.from({ length: 9 }, (_, index) => [index, index] as readonly number[]);
    const result = await successiveHalving({
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 0.5 }).objective,
      seed: SEED,
      candidates: pool,
      rungs: [
        { candidates: 9, replications: 4 },
        { candidates: 3, replications: 12 },
      ],
    });
    expect(result.best.candidate.value).toEqual([5, 5]);
  });

  it('refuses a pool too small for rung 1, and a call with neither pool nor space', async () => {
    const problem = sphereProblem(2);
    const objective = syntheticObjective({ fn: problem.fn }).objective;
    await expect(
      successiveHalving({
        objective,
        seed: SEED,
        candidates: [[1, 1]],
        rungs: [
          { candidates: 4, replications: 2 },
          { candidates: 2, replications: 4 },
        ],
      }),
    ).rejects.toThrow(/only 1 were available/);
    await expect(successiveHalving({ objective, seed: SEED })).rejects.toThrow(/either a space/);
  });

  it('reproduces its whole trajectory from the seed', async () => {
    const problem = sphereProblem(3);
    const run = async (): Promise<SuccessiveHalvingResult<readonly number[]>> =>
      successiveHalving({
        space: problem.space,
        objective: syntheticObjective({ fn: problem.fn, noiseSd: 2, interactionSd: 0.5 }).objective,
        seed: '20260726',
        rungs: [
          { candidates: 27, replications: 5 },
          { candidates: 9, replications: 15 },
          { candidates: 3, replications: 45 },
        ],
      });
    const first = await run();
    const second = await run();
    expect(trajectoryOf(second)).toEqual(trajectoryOf(first));
    expect(second.rungs).toEqual(first.rungs);
  });
});
