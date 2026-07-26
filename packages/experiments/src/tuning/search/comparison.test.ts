/**
 * Which method actually wins, measured at equal budget rather than asserted from taste.
 *
 * docs/06 says to always run random search for comparison, and this file is what makes that
 * instruction executable: three methods, one budget, one candidate stream, several seeds, and the
 * **noiseless** objective value of each method's winner as the score — the truth the noisy search
 * never sees. A method that wins by luckily mis-measuring a bad candidate does not win here.
 *
 * Random search beating a clever method is a legitimate and publishable result, and this file is
 * written so that it *could* say so. The measured answer on this family of objectives is in
 * `index.ts`, with the numbers.
 *
 * One structural note about the comparison, because it changes how the numbers read: all three
 * methods draw candidates from the same seeded stream, so successive halving's 100-candidate pool
 * is a **superset** of random search's 79. That is deliberate — it makes the comparison paired,
 * which is this repository's own doctrine — but it means "successive halving beat random search"
 * here is the narrow claim that it examined more candidates for the same money and did not lose
 * the good one on the way up the ladder. It is not a claim that the ladder finds points a random
 * draw could not.
 */

import { describe, expect, it } from 'vitest';

import { sepCmaEs } from './cmaes.js';
import { plateauProblem, sphereProblem, syntheticObjective, type Point } from './fixtures.test-helper.js';
import { randomSearch } from './randomSearch.js';
import { successiveHalving } from './successiveHalving.js';
import { DOC_RUNGS, type Rung } from './types.js';

const SEEDS = Array.from({ length: 8 }, (_, index) => 20_260_726 + index * 977);
const BUDGET = DOC_RUNGS.reduce((total, rung: Rung) => total + rung.candidates * rung.replications, 0);

interface Outcome {
  readonly random: number;
  readonly successiveHalving: number;
  readonly cmaes: number;
  readonly budgets: readonly number[];
}

async function race(problem: { space: never; fn: (point: Point) => number }, seed: number): Promise<Outcome> {
  // One objective instance per method so the call counters do not interfere; the function, the
  // noise model and the seed are identical, so the three see the same problem.
  const objective = (): ReturnType<typeof syntheticObjective>['objective'] =>
    syntheticObjective({ fn: problem.fn, noiseSd: 2, interactionSd: 0.4 }).objective;

  // Equal budget, three shapes. Random search respects docs/03's fifty-replication floor for a
  // number that will be compared against another number, which is what caps it at 79 candidates.
  const random = await randomSearch({
    space: problem.space,
    objective: objective(),
    seed,
    candidates: 79,
    replications: 50,
  });
  const halving = await successiveHalving({ space: problem.space, objective: objective(), seed });
  const dimensions = (problem.space as unknown as { dimensions: readonly unknown[] }).dimensions.length;
  const lambda = 4 + Math.floor(3 * Math.log(dimensions));
  const cma = await sepCmaEs({
    space: problem.space,
    objective: objective(),
    seed,
    generations: Math.max(1, Math.floor(BUDGET / (lambda * 30))),
    replications: 30,
    stepFloorFraction: 0.01,
  });

  return {
    random: problem.fn(random.best.candidate.value),
    successiveHalving: problem.fn(halving.best.candidate.value),
    cmaes: problem.fn(cma.best.candidate.value),
    budgets: [random.replicationsSpent, halving.replicationsSpent, cma.replicationsSpent],
  };
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

describe('the three methods, at equal budget, on a piecewise-constant objective', () => {
  it('spends the same budget on each, so the comparison is about the method', async () => {
    const outcome = await race(plateauProblem(4, 1, 10, [7, 3, 5, 2]) as never, SEEDS[0] ?? 1);
    for (const budget of outcome.budgets) {
      expect(budget).toBeGreaterThan(BUDGET * 0.95);
      expect(budget).toBeLessThan(BUDGET * 1.05);
    }
  });

  it('has the continuous optimizer win decisively, and by more than the ladder does', async () => {
    const problem = plateauProblem(11, 0.15, 5) as never;
    const outcomes = await Promise.all(SEEDS.map(async (seed) => race(problem, seed)));

    const randomScores = outcomes.map((outcome) => outcome.random);
    const halvingScores = outcomes.map((outcome) => outcome.successiveHalving);
    const cmaScores = outcomes.map((outcome) => outcome.cmaes);

    // sep-CMA-ES wins on the mean and wins seed by seed. On an eleven-dimensional box, 79 or even
    // 100 uniform draws cover the space so thinly that a method which *moves* is worth several
    // times the budget — which is exactly the regime docs/06 gives CMA-ES for.
    expect(mean(cmaScores)).toBeLessThan(mean(randomScores) / 2);
    expect(cmaScores.filter((score, index) => score < (randomScores[index] ?? 0)).length).toBeGreaterThanOrEqual(
      SEEDS.length - 1,
    );

    // Successive halving never loses to random search on the pool it shares with it: with common
    // random numbers, ten replications is enough to eliminate on, and the ladder did not throw
    // away a candidate it should have kept in any of these runs.
    for (const [index, score] of halvingScores.entries()) {
      expect(score).toBeLessThanOrEqual(randomScores[index] ?? Number.POSITIVE_INFINITY);
    }
    expect(mean(halvingScores)).toBeLessThan(mean(randomScores));
  }, 60_000);

  it('holds on a smooth objective too, so the ranking is not an artefact of the plateau', async () => {
    const problem = sphereProblem(11, 5) as never;
    const outcomes = await Promise.all(SEEDS.map(async (seed) => race(problem, seed)));
    expect(mean(outcomes.map((outcome) => outcome.cmaes))).toBeLessThan(
      mean(outcomes.map((outcome) => outcome.random)) / 2,
    );
  }, 60_000);

  it('keeps random search honest: it is not beaten because it was starved', async () => {
    // The baseline's own budget buys 79 candidates at the documented fifty-replication floor, and
    // its winner is measured at that fidelity. Nothing here gives the other methods more work.
    const outcome = await race(plateauProblem(11, 0.15, 5) as never, SEEDS[0] ?? 1);
    expect(outcome.budgets[0]).toBe(79 * 50);
  });
});
