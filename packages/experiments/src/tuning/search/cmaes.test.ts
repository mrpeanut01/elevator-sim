import { describe, expect, it } from 'vitest';

import { sepCmaEs, type SepCmaEsOptions } from './cmaes.js';
import {
  boxSpace,
  distance,
  plateauProblem,
  sphereProblem,
  syntheticObjective,
  uniformDimensions,
  type Point,
} from './fixtures.test-helper.js';
import { outcomeKey } from './round.js';
import { SEARCH_DEFAULTS, SearchError, type Objective, type SearchResult } from './types.js';

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
 * The test docs/05-roadmap.md § Phase 7 asks for, with its controls — **plural**.
 *
 * The objective is exactly constant on cells 2 wide, the search starts deep inside a cell at
 * `[1, 1]`, and its initial step is 0.02 of the range — 0.2 absolute, a tenth of a cell. Every
 * offspring of generation 1 therefore produces a **bit-identical** run, which is precisely the
 * regime measured on the real objective below the decision-flip threshold.
 *
 * ## Why one control was not enough
 *
 * The original control switched `plateauInflation` to 1 **and** `stagnationGenerations` to 0, and
 * the module's docstring claimed from it that tie inflation was shown to be load-bearing. It was
 * not: varying two knobs at once proves only that the *pair* matters. Measured, the two escapes
 * are independent and either one alone still reaches the optimum —
 *
 * | `plateauInflation` | `stagnationGenerations` | flat generations | noiseless objective |
 * |---|---|---|---|
 * | 2 | 8 | 4 | 0 |
 * | 2 | 0 | 9 | 0 |
 * | 1 | 8 | 7 | 0 |
 * | 1 | 0 | 35 | 72 |
 *
 * — so with a single two-knob control, **either mechanism could be deleted outright and the whole
 * suite stayed green**, which is exactly the inert-behaviour failure docs/05-roadmap.md's standing
 * requirement exists to catch. There is one arm per row below, each asserting its own mechanism's
 * counter fired and the other's did not; `escapes` alone cannot tell them apart, which is why
 * `PlateauReport` counts `inflations` and `restarts` separately.
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
    // Both mechanisms fired on this arm, which is why it cannot isolate either.
    expect(result.plateau.inflations).toBeGreaterThan(0);
    expect(result.plateau.restarts).toBeGreaterThan(0);
    expect(result.plateau.escapes).toBe(result.plateau.inflations + result.plateau.restarts);
  });

  it('ISOLATES TIE INFLATION: with restarts off, doubling sigma alone still reaches the optimum', async () => {
    const inflationOnly = await sepCmaEs(base({ stagnationGenerations: 0 }));

    // The only escape available. Delete the tie-inflation branch and this run is the both-off
    // control below, which ends at 72 rather than 0.
    expect(inflationOnly.plateau.restarts).toBe(0);
    expect(inflationOnly.plateau.inflations).toBeGreaterThan(0);
    expect(inflationOnly.plateau.flatRounds).toBeGreaterThan(0);
    expect(problem.fn(inflationOnly.best.candidate.value)).toBe(0);
    expect(inflationOnly.notes.some((note) => note.includes('inflated'))).toBe(true);
  });

  it('ISOLATES THE IPOP RESTART: with tie inflation off, restarting alone still reaches the optimum', async () => {
    const restartOnly = await sepCmaEs(base({ plateauInflation: 1 }));

    // Likewise the only escape available: neuter `restart()` and this becomes the control.
    expect(restartOnly.plateau.inflations).toBe(0);
    expect(restartOnly.plateau.restarts).toBeGreaterThan(0);
    expect(restartOnly.plateau.flatRounds).toBeGreaterThan(0);
    expect(problem.fn(restartOnly.best.candidate.value)).toBe(0);
    expect(restartOnly.notes.some((note) => note.includes('IPOP restart'))).toBe(true);
    // And it says so honestly: the step was left alone on every flat generation.
    expect(restartOnly.notes.some((note) => note.includes('tie inflation disabled'))).toBe(true);
  });

  it('CONTROL: textbook sep-CMA-ES with both escapes disabled stays inside the flat region', async () => {
    const stalled = await sepCmaEs(base({ plateauInflation: 1, stagnationGenerations: 0 }));

    expect(stalled.plateau.escapes).toBe(0);
    expect(stalled.plateau.inflations).toBe(0);
    expect(stalled.plateau.restarts).toBe(0);
    // Most of the run is spent learning nothing, and the mean never leaves the starting cell.
    expect(stalled.plateau.flatRounds).toBeGreaterThan(30);
    expect(problem.fn(stalled.best.candidate.value)).toBeGreaterThan(50);
    for (const coordinate of stalled.best.candidate.value) {
      expect(Math.abs(coordinate - 1)).toBeLessThan(1);
    }

    // Each mechanism, on its own, is worth the whole objective against this control.
    for (const escaped of [
      await sepCmaEs(base({ stagnationGenerations: 0 })),
      await sepCmaEs(base({ plateauInflation: 1 })),
      await sepCmaEs(base()),
    ]) {
      expect(problem.fn(escaped.best.candidate.value)).toBeLessThan(
        problem.fn(stalled.best.candidate.value),
      );
    }
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

  /**
   * Regression. `SearchRecorder`'s fidelity ceiling is monotone — an evaluation at a higher
   * replication count supersedes everything below it — and the plateau probe was folded into the
   * same recorder as an ordinary round. `probeReplications` is a public option with no documented
   * relationship to `replications`, so a probe run at a higher fidelity than the generations that
   * followed it pinned `best` to a probe point for the whole search.
   *
   * Measured before the fix, through this exact call: 31 rounds, the optimum genuinely evaluated
   * at generation 9 (`cma-g08-00`, noiseless objective 0), and the returned answer `probe-0-7` at
   * `[3.56, 1]` with a noiseless objective of **52**. Nothing threw and no note was written. The
   * default `probeReplications` is a fifth of the round's, which is why the shipped configuration
   * hid it.
   */
  it('never answers with a plateau-probe point, whatever fidelity the probe ran at', async () => {
    const probed = await sepCmaEs(
      base({
        generations: 30,
        probePlateau: true,
        probeReplications: 12, // deliberately *above* the round's 6
        stepFloorFraction: undefined,
      }),
    );

    expect(probed.best.candidate.id).toMatch(/^cma-g/);
    expect(probed.best.candidate.id).not.toMatch(/^probe/);
    expect(probed.best.replications).toBe(6);
    expect(problem.fn(probed.best.candidate.value)).toBe(0);

    // The probe round is still run, still recorded, and still paid for.
    expect(probed.rounds[0]?.label).toContain('plateau probe');
    expect(probed.evaluations.some((entry) => entry.candidate.id.startsWith('probe-'))).toBe(true);
    expect(probed.replicationsSpent).toBeGreaterThan(30 * 6);
    // …and it contributes no point to the best-so-far curve, which is a curve over answers.
    expect(probed.trajectory).toHaveLength(30);
    for (const point of probed.trajectory) expect(point.bestCandidateId).toMatch(/^cma-g/);
  });

  /**
   * Regression. `cmaes.ts` carried its own copy of the plateau-class key that joined a sample
   * vector on the **empty string**, while `round.ts` joins on a separator no number can contain.
   * The two agreed on every vector any test had handed them and disagreed on the pair below, so
   * the optimizer read a generation carrying real direction as flat, discarded its ranking and
   * inflated the step — while `SearchRound.distinctOutcomes`, computed by the correct function,
   * said 2.
   */
  it('reads a generation as flat only when round.ts says it is, on one shared key', async () => {
    expect(outcomeKey([1, 23])).not.toBe(outcomeKey([12, 3]));

    const collide: Objective<Point> = (request) =>
      request.candidates.map((candidate, index) => ({
        candidateId: candidate.id,
        samples: index % 2 === 0 ? [1, 23] : [12, 3],
        traceDigests: ['t0', 't1'],
      }));

    const result = await sepCmaEs({
      space: boxSpace(uniformDimensions(1, [0, 10])),
      objective: collide,
      seed: SEED,
      generations: 1,
      replications: 2,
      start: [5],
      stagnationGenerations: 0,
      stepFloorFraction: 0,
    });

    expect(result.rounds[0]?.distinctOutcomes).toBe(2);
    expect(result.plateau.flatRounds).toBe(0);
    /* The discriminating assertion: the optimizer's own view of the generation must agree with the
       round's. With the duplicated key it did not — `flatRounds` stayed 0 while the escape fired. */
    expect(result.plateau.inflations).toBe(0);
    expect(result.plateau.escapes).toBe(0);
  });
});

describe('the search declares its own budget rather than hiding it in a function body', () => {
  it('takes its generation count from SEARCH_DEFAULTS', async () => {
    const problem = sphereProblem(2, 10, [7, 3]);
    const result = await sepCmaEs({
      space: problem.space,
      objective: syntheticObjective({ fn: problem.fn, noiseSd: 1 }).objective,
      seed: SEED,
      replications: 2,
      stepFloorFraction: 0,
    });
    /* λ = 4 + ⌊3 ln 2⌋ = 6, and no restart can fire inside `stagnationGenerations` = 8 without an
       improvement, so the round count is the declared default exactly. */
    expect(result.rounds).toHaveLength(SEARCH_DEFAULTS.generations);
  });
});
