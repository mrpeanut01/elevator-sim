/**
 * Synthetic objectives with known answers, for the search tests.
 *
 * Not a `*.test.ts` file on purpose: vitest's `include` is `src/**\/*.test.ts`, so a helper named
 * this way is imported by tests but never collected as a suite — the same convention
 * `runner/fixtures.test-helper.ts` uses.
 *
 * ## Why these are synthetic and the runner's fixtures are not
 *
 * `runner/fixtures.test-helper.ts` loads the real `data/` directory, on the argument that a
 * fixture building would only prove things about a fixture building. That argument is right for
 * the runner and wrong here. What has to be tested about a search is that it **finds the
 * optimum**, and a real simulator has no known optimum to find — the whole reason Phase 7 exists.
 * These objectives have one, exactly, by construction.
 *
 * The seam to the real simulator is tested separately and directly, in `objective.test.ts`.
 *
 * ## The two properties that make these faithful rather than merely convenient
 *
 * 1. **Noise is a common random number.** `sample[i] = f(x) + noise(seed, i)`, and the noise term
 *    depends on the *replication index and the round seed only* — never on the candidate. So the
 *    paired difference between two candidates is exactly `f(x₁) − f(x₂)` at every index, with
 *    `rho = 1`. That is the limiting case of what Phase 3 measured between near-neighbour weight
 *    vectors (99.69 % variance reduction, `rho = 0.997`), and it means a test that breaks CRN
 *    fails loudly rather than merely becoming slower.
 * 2. **{@link plateauProblem} is exactly constant on cells, not approximately.** Coordinates are
 *    snapped to a grid before `f` sees them, so two candidates in the same cell produce
 *    **bit-identical** sample vectors — which is the measured behaviour of the real objective
 *    below the decision-flip threshold (docs/05-roadmap.md § Phase 7: 100/100 exactly-zero paired
 *    differences). An optimizer that stalls on the real thing stalls on this.
 */

import { Pcg32 } from '@elevator-sim/core';

import type {
  CandidateOutcome,
  Objective,
  ObjectiveRequest,
  SearchDimension,
  VectorSpace,
} from './types.js';

/** A candidate is its own coordinate vector: the space is the identity embedding. */
export type Point = readonly number[];

/** A box `[min, max]^n` with uniform sampling and an identity embedding. */
export function boxSpace(dimensions: readonly SearchDimension[]): VectorSpace<Point> {
  return {
    dimensions,
    sample(random) {
      return dimensions.map((dimension) => {
        const [min, max] = dimension.range;
        return min + random.nextFloat() * (max - min);
      });
    },
    encode(candidate) {
      return [...candidate];
    },
    decode(vector) {
      return dimensions.map((dimension, index) => {
        const [min, max] = dimension.range;
        const value = vector[index] ?? min;
        return value < min ? min : value > max ? max : value;
      });
    },
  };
}

/** `n` dimensions, all on the same range, named `x0 … x(n-1)`. */
export function uniformDimensions(n: number, range: readonly [number, number]): readonly SearchDimension[] {
  return Array.from({ length: n }, (_, index) => ({ id: `x${index}`, range }));
}

/**
 * The replication's common random number: a function of `(seed, index)` and nothing else.
 *
 * This is the synthetic stand-in for a passenger trace, and it is the reason a CRN violation is
 * detectable in a test at all.
 */
function commonNoise(seed: bigint, index: number, sd: number): number {
  if (sd === 0) return 0;
  return new Pcg32(seed, BigInt(index)).normal(0, sd);
}

/** The trace digest of replication `index` under `seed`. Equal for every candidate, by design. */
export function syntheticDigest(seed: bigint, index: number): string {
  return `${seed.toString(16)}:${index}`;
}

/** A stable 64-bit key for a scalar, so an interaction term can be seeded from an objective value. */
function keyOf(value: number): bigint {
  const text = value.toString();
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (let i = 0; i < text.length; i += 1) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(i))) * 0x1000_0000_01b3n);
  }
  return hash;
}

export interface SyntheticObjectiveOptions {
  /** The noiseless objective. Lower is better. */
  readonly fn: (point: Point) => number;
  /** Standard deviation of the per-replication common noise. `0` for a noiseless problem. */
  readonly noiseSd?: number | undefined;
  /**
   * Standard deviation of the **candidate × trace interaction** — the part of a replication that
   * CRN does not cancel.
   *
   * Without it the fixture is unrealistically kind: `f(x) + noise(seed, i)` gives every candidate
   * the same additive offset at every index, so the paired ranking is *exact* at any replication
   * count and successive halving could never make a mistake. Real CRN reaches `rho = 0.997`
   * between near-neighbours, not 1, and the residual is exactly this term.
   *
   * Seeded from the **objective value** rather than from the coordinates, so that two candidates
   * inside one plateau cell still produce bit-identical runs — which is the property the plateau
   * tests are about, and which a coordinate-seeded interaction would destroy.
   */
  readonly interactionSd?: number | undefined;
  /**
   * Break common random numbers deliberately, by seeding the noise from the candidate too.
   *
   * The negative control for the CRN assertions: `round.ts` must reject an objective that does
   * this, because in production it is a factor of 324 hiding behind numbers that look fine.
   */
  readonly breakCrn?: boolean | undefined;
  /** Return fewer replications than the round asked for. The negative control for the fidelity guard. */
  readonly shortReplications?: number | undefined;
}

/** A synthetic objective, plus a record of every request made of it. */
export interface SyntheticObjective {
  readonly objective: Objective<Point>;
  /** One entry per round, in call order. */
  readonly requests: readonly { round: number; candidates: number; replications: number; seed: bigint }[];
  /** Candidate evaluations made, counting a re-evaluation at a new fidelity as another one. */
  evaluations(): number;
  /** Replications consumed. The budget an equal-budget comparison holds fixed. */
  replications(): number;
}

/** Build a synthetic objective around a noiseless function. */
export function syntheticObjective(options: SyntheticObjectiveOptions): SyntheticObjective {
  const noiseSd = options.noiseSd ?? 0;
  const interactionSd = options.interactionSd ?? 0;
  const requests: { round: number; candidates: number; replications: number; seed: bigint }[] = [];
  let evaluations = 0;
  let replications = 0;

  const objective: Objective<Point> = (request: ObjectiveRequest<Point>) => {
    requests.push({
      round: request.round,
      candidates: request.candidates.length,
      replications: request.replications,
      seed: request.seed,
    });
    const count = options.shortReplications ?? request.replications;
    return request.candidates.map((candidate, candidateIndex): CandidateOutcome => {
      evaluations += 1;
      replications += count;
      const value = options.fn(candidate.value);
      const samples: number[] = [];
      const digests: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const noiseSeed = options.breakCrn === true ? request.seed + BigInt(candidateIndex + 1) : request.seed;
        const interaction =
          interactionSd === 0
            ? 0
            : commonNoise(BigInt.asUintN(64, noiseSeed ^ keyOf(value)), i, interactionSd);
        samples.push(value + commonNoise(noiseSeed, i, noiseSd) + interaction);
        digests.push(syntheticDigest(noiseSeed, i));
      }
      return { candidateId: candidate.id, samples, traceDigests: digests };
    });
  };

  return {
    objective,
    requests,
    evaluations: () => evaluations,
    replications: () => replications,
  };
}

/* -------------------------------------------------------------------------- *
 * Problems with known answers
 * -------------------------------------------------------------------------- */

/** Squared distance to `optimum`. Smooth, unimodal, minimum exactly `0` at the optimum. */
export function sphere(optimum: Point): (point: Point) => number {
  return (point) =>
    optimum.reduce((total, target, index) => total + ((point[index] ?? 0) - target) ** 2, 0);
}

/**
 * {@link sphere} with every coordinate snapped to a grid of width `cellWidth` first.
 *
 * The synthetic analogue of the real objective: exactly constant on each grid cell, so any two
 * candidates inside one cell produce bit-identical runs and any method that reads a difference of
 * differences learns nothing. The minimum is still exactly `0`, at `optimum`, provided `optimum`
 * is a grid point — which {@link plateauProblem} arranges.
 */
export function plateauSphere(optimum: Point, cellWidth: number): (point: Point) => number {
  const snap = (value: number): number => Math.round(value / cellWidth) * cellWidth;
  return (point) =>
    optimum.reduce((total, target, index) => total + (snap(point[index] ?? 0) - target) ** 2, 0);
}

export interface Problem {
  readonly space: VectorSpace<Point>;
  readonly optimum: Point;
  readonly fn: (point: Point) => number;
}

/** A smooth `n`-dimensional sphere on `[0, extent]^n`, with its optimum at a fixed interior point. */
export function sphereProblem(n: number, extent = 10, optimum?: Point): Problem {
  const dimensions = uniformDimensions(n, [0, extent]);
  const target = optimum ?? dimensions.map((_, index) => extent * (0.3 + 0.4 * ((index % 3) / 2)));
  return { space: boxSpace(dimensions), optimum: target, fn: sphere(target) };
}

/**
 * A plateaued sphere on `[0, extent]^n` with cells of width `cellWidth`.
 *
 * The optimum is snapped to a grid point so that the minimum really is `0` and "found the
 * optimum" is a statement about a cell rather than about a tolerance.
 */
export function plateauProblem(n: number, cellWidth: number, extent = 10, optimum?: Point): Problem {
  const dimensions = uniformDimensions(n, [0, extent]);
  const raw = optimum ?? dimensions.map(() => extent * 0.7);
  const target = raw.map((value) => Math.round(value / cellWidth) * cellWidth);
  return { space: boxSpace(dimensions), optimum: target, fn: plateauSphere(target, cellWidth) };
}

/** Euclidean distance, for asserting that an optimizer got where it claims. */
export function distance(a: Point, b: Point): number {
  return Math.sqrt(a.reduce((total, value, index) => total + (value - (b[index] ?? 0)) ** 2, 0));
}
