import { describe, expect, it } from 'vitest';

import { sepCmaEs, type SepCmaEsOptions } from './cmaes.js';
import { distance, plateauProblem, sphereProblem, syntheticObjective } from './fixtures.test-helper.js';
import { SearchError, type SearchResult } from './types.js';

const SEED = 20_260_726;

function trajectoryOf<C>(result: SearchResult<C>): readonly string[] {
  return result.evaluations.map(
    (evaluation) => `${evaluation.round}/${evaluation.candidate.id}/${evaluation.score}`,
  );
}

describe('sepCmaEs on a smooth objective', () => {
  it('finds the optimum of a synthetic objective with a known answer', async () => {
    const problem = sphereProblem(4, 10, [7, 3, 5, 2]);
    const result = await sepCmaEs({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 1, interactionSd: 0.2 }).objective,
      seed: SEED,
      generations: 40,
      replications: 8,
      stepFloorFraction: 0,
    });

    expect(result.method).toBe('sep-cmaes');
    expect(distance(result.best.candidate.value, problem.optimum)).toBeLessThan(0.5);
    expect(result.rounds).toHaveLength(40);
    // λ = 4 + ⌊3 ln 4⌋ = 8 at the start, so at least 40 × 8 × 8 replications — and strictly more
    // here, because once the search has converged it stops improving, an IPOP restart fires, and
    // the population doubles. That is the mechanism working, not overspending: on this objective
    // "no improvement for eight generations" is indistinguishable from "sitting on a plateau".
    expect(result.replicationsSpent).toBeGreaterThanOrEqual(40 * 8 * 8);
    expect(result.replicationsSpent % 8).toBe(0);
  });

  it('reproduces its whole trajectory from the seed', async () => {
    const problem = sphereProblem(3, 10, [2, 8, 4]);
    const run = async (): Promise<SearchResult<readonly number[]>> =>
      sepCmaEs({
        space: problem.space,
        objective: syntheticObjective({ fn: problem.fn, noiseSd: 1.5, interactionSd: 0.3 }).objective,
        seed: '20260726',
        generations: 12,
        replications: 6,
      });
    const first = await run();
    const second = await run();
    expect(trajectoryOf(second)).toEqual(trajectoryOf(first));
    expect(second.best.candidate.value).toEqual(first.best.candidate.value);
    expect(second.plateau).toEqual(first.plateau);
  });

  it('evaluates the incumbent in generation 1, on the same traces as the offspring', async () => {
    const problem = sphereProblem(2, 10, [7, 3]);
    const result = await sepCmaEs({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 1 }).objective,
      seed: SEED,
      generations: 6,
      replications: 5,
      incumbent: [0, 10],
    });
    const first = result.rounds[0];
    expect(first?.evaluations.map((evaluation) => evaluation.candidate.id)).toContain('incumbent');
    const incumbent = first?.evaluations.find((evaluation) => evaluation.candidate.id === 'incumbent');
    expect(incumbent?.traceDigests).toEqual(first?.traceDigests);
  });

  it('refuses a space with no dimensions, a step inflation below 1, and a zero budget', async () => {
    const problem = sphereProblem(2);
    const objective = syntheticObjective({ fn: problem.fn }).objective;
    await expect(
      sepCmaEs({ space: { ...problem.space, dimensions: [] }, objective, seed: SEED }),
    ).rejects.toThrow(/no dimensions/);
    await expect(
      sepCmaEs({ space: problem.space, objective, seed: SEED, plateauInflation: 0.5 }),
    ).rejects.toThrow(/at least 1/);
    await expect(sepCmaEs({ space: problem.space, objective, seed: SEED, generations: 0 })).rejects.toThrow(
      SearchError,
    );
  });
});

/**
 * The test docs/05-roadmap.md § Phase 7 asks for, with its control.
 *
 * The objective is exactly constant on cells 2 wide, the search starts deep inside a cell at
 * `[1, 1]`, and its initial step is 0.02 of the range — 0.2 absolute, a tenth of a cell. Every
 * offspring of generation 1 therefore produces a **bit-identical** run, which is precisely the
 * regime measured on the real objective below the decision-flip threshold.
 *
 * The control is the same optimizer with `plateauInflation: 1` and restarts off — i.e. textbook
 * sep-CMA-ES. It must **fail**. Without a failing control the passing test would be evidence of
 * nothing: it would pass just as happily if the escape mechanism were deleted and the optimizer
 * were finding the optimum for some unrelated reason.
 */
describe('sepCmaEs on a plateau', () => {
  const problem = plateauProblem(2, 2, 10, [8, 8]);
  const base = (
    overrides: Partial<SepCmaEsOptions<readonly number[]>> = {},
  ): SepCmaEsOptions<readonly number[]> => ({
    space: problem.space,
    objective: syntheticObjective({ fn: problem.fn, noiseSd: 0.5 }).objective,
    seed: SEED,
    generations: 40,
    replications: 6,
    start: [1, 1],
    initialStepFraction: 0.02,
    stepFloorFraction: 0,
    ...overrides,
  });

  it('escapes a flat region rather than terminating inside it', async () => {
    const result = await sepCmaEs(base());

    expect(result.plateau.flatRounds).toBeGreaterThan(0);
    expect(result.plateau.escapes).toBeGreaterThan(0);
    // Landed in the optimum cell: the noiseless objective there is exactly 0.
    expect(problem.fn(result.best.candidate.value)).toBe(0);
    expect(distance(result.best.candidate.value, problem.optimum)).toBeLessThan(2);
    expect(result.notes.some((note) => note.includes('bit-identical'))).toBe(true);
  });

  it('CONTROL: textbook sep-CMA-ES with the escape disabled stays inside the flat region', async () => {
    const stalled = await sepCmaEs(base({ plateauInflation: 1, stagnationGenerations: 0 }));

    expect(stalled.plateau.escapes).toBe(0);
    // Most of the run is spent learning nothing, and the mean never leaves the starting cell.
    expect(stalled.plateau.flatRounds).toBeGreaterThan(30);
    expect(problem.fn(stalled.best.candidate.value)).toBeGreaterThan(50);
    for (const coordinate of stalled.best.candidate.value) {
      expect(Math.abs(coordinate - 1)).toBeLessThan(1);
    }

    // The escape is what makes the difference, and it is worth the whole objective here.
    const escaped = await sepCmaEs(base());
    expect(problem.fn(escaped.best.candidate.value)).toBeLessThan(problem.fn(stalled.best.candidate.value));
  });

  it('a step floor at the measured width keeps every generation informative', async () => {
    // Cells are 2 wide on a box 10 wide: a floor of 0.2 of the range is one cell per step.
    const floored = await sepCmaEs(base({ stepFloor: [0.2, 0.2], generations: 12 }));
    expect(floored.plateau.flatRounds).toBe(0);
    expect(problem.fn(floored.best.candidate.value)).toBe(0);
  });

  it('measures the width itself when asked, and records it rather than assuming 0.03', async () => {
    const probed = await sepCmaEs(
      base({ probePlateau: true, probeReplications: 3, generations: 12, stepFloorFraction: undefined }),
    );
    expect(probed.plateau.stepFloor).toHaveLength(2);
    for (const width of probed.plateau.stepFloor ?? []) {
      expect(width).toBeGreaterThanOrEqual(2);
      expect(width).toBeLessThan(4);
    }
    expect(probed.notes.some((note) => note.includes('Plateau widths probed'))).toBe(true);
    expect(probed.rounds[0]?.label).toContain('plateau probe');
  });

  it('says out loud when the floor was assumed rather than measured', async () => {
    const assumed = await sepCmaEs(base({ generations: 2, stepFloorFraction: 0.01 }));
    expect(assumed.notes.some((note) => note.includes('assumed'))).toBe(true);
  });
});
