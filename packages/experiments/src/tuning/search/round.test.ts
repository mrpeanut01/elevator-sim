import { describe, expect, it } from 'vitest';

import { policyNoiseStream } from '../space/sample.js';

import { boxSpace, syntheticDigest, syntheticObjective, uniformDimensions } from './fixtures.test-helper.js';
import {
  compareEvaluations,
  normalizeSearchSeed,
  outcomeKey,
  rankEvaluations,
  roundSeed,
  runRound,
  searchRng,
  traceSeedFor,
} from './round.js';
import { SearchError, type Evaluation, type Objective, type ObjectiveRequest } from './types.js';

const SEED = 20_260_726;

function candidates(count: number): { id: string; value: readonly number[]; origin: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c${index}`,
    value: [index, index],
    origin: 'test',
  }));
}

describe('seeds', () => {
  it('accepts a decimal string so 64 bits survive JSON, and rejects anything else', () => {
    expect(normalizeSearchSeed('18446744073709551615')).toBe(18_446_744_073_709_551_615n);
    expect(normalizeSearchSeed(7)).toBe(7n);
    expect(() => normalizeSearchSeed('0x10')).toThrow(SearchError);
  });

  it('derives a distinct trace seed per round', () => {
    expect(roundSeed(SEED, 0)).not.toBe(roundSeed(SEED, 1));
    expect(roundSeed(SEED, 3)).toBe(roundSeed(SEED, 3));
  });

  it("holds one trace seed for the whole search under 'fixed', and rotates under 'per-round'", () => {
    expect(traceSeedFor('fixed', SEED, 0)).toBe(traceSeedFor('fixed', SEED, 9));
    expect(traceSeedFor('per-round', SEED, 0)).not.toBe(traceSeedFor('per-round', SEED, 9));
  });

  it('draws the search randomness from a named stream, reproducibly', () => {
    const first = [searchRng(SEED).nextFloat(), searchRng(SEED).nextFloat()];
    expect(first[0]).toBe(first[1]);
    expect(searchRng(SEED).nextFloat()).not.toBe(searchRng(SEED + 1).nextFloat());
  });

  it("agrees with tuning/space about which stream that is", () => {
    // Both modules name `policyNoise` as the search's stream, and both build it from a fresh
    // StreamSet. If they ever disagreed, two halves of one search would draw from different
    // sequences while both claiming to be reproducible from the same seed — the candidate pool
    // would silently depend on which module was asked for the generator. Pinned in one place
    // rather than assumed in two; either module may own the accessor, but they must agree.
    const mine = searchRng(SEED);
    const theirs = policyNoiseStream(SEED);
    expect([mine.nextFloat(), mine.nextFloat()]).toEqual([theirs.nextFloat(), theirs.nextFloat()]);
  });
});

describe('runRound', () => {
  const request = (overrides: Partial<ObjectiveRequest<readonly number[]>> = {}): ObjectiveRequest<readonly number[]> => ({
    candidates: candidates(4),
    replications: 5,
    seed: 99n,
    round: 0,
    label: 'test round',
    ...overrides,
  });

  it('gives every candidate in a round byte-identical trace digests', async () => {
    const problem = syntheticObjective({ fn: (point) => point[0] ?? 0, noiseSd: 2 });
    const round = await runRound(problem.objective, request());

    const reference = round.evaluations[0]?.traceDigests;
    expect(reference).toEqual([0, 1, 2, 3, 4].map((index) => syntheticDigest(99n, index)));
    for (const evaluation of round.evaluations) {
      expect(evaluation.traceDigests).toEqual(reference);
    }
    expect(round.traceDigests).toEqual(reference);
  });

  it('rejects an objective that reseeds per candidate, rather than silently costing 324x', async () => {
    const problem = syntheticObjective({ fn: (point) => point[0] ?? 0, noiseSd: 2, breakCrn: true });
    await expect(runRound(problem.objective, request())).rejects.toThrow(/Common random numbers are broken/);
  });

  it('refuses a candidate measured on fewer replications than the round declared', async () => {
    const problem = syntheticObjective({ fn: () => 1, shortReplications: 3 });
    await expect(runRound(problem.objective, request({ replications: 5 }))).rejects.toThrow(
      /came back with 3 replications .* which declared 5/,
    );
  });

  it('refuses a round that omits or duplicates a candidate', async () => {
    const dropOne: Objective<readonly number[]> = (input) =>
      input.candidates.slice(1).map((candidate) => ({
        candidateId: candidate.id,
        samples: [1, 1, 1, 1, 1],
        traceDigests: ['a', 'a', 'a', 'a', 'a'],
      }));
    await expect(runRound(dropOne, request())).rejects.toThrow(/no outcome for candidate "c0"/);

    await expect(
      runRound(syntheticObjective({ fn: () => 1 }).objective, request({ candidates: candidates(2).concat(candidates(1)) })),
    ).rejects.toThrow(/duplicate candidate ids/);
  });

  it('averages the finite samples and counts the rest rather than averaging them', async () => {
    const withHoles: Objective<readonly number[]> = (input) =>
      input.candidates.map((candidate) => ({
        candidateId: candidate.id,
        samples: [10, Number.NaN, 20, Number.POSITIVE_INFINITY, 30],
        traceDigests: ['a', 'b', 'c', 'd', 'e'],
      }));
    const round = await runRound(withHoles, request());
    const first = round.evaluations[0];
    expect(first?.score).toBe(20);
    expect(first?.finiteCount).toBe(3);
    expect(first?.nonFiniteCount).toBe(2);
  });

  it('scores a candidate with no finite sample as +Infinity so it sorts last instead of arbitrarily', async () => {
    const allNaN: Objective<readonly number[]> = (input) =>
      input.candidates.map((candidate) => ({
        candidateId: candidate.id,
        samples: [Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN],
        traceDigests: ['a', 'b', 'c', 'd', 'e'],
      }));
    const round = await runRound(allNaN, request());
    expect(round.evaluations[0]?.score).toBe(Number.POSITIVE_INFINITY);
  });

  it('counts plateau classes by exact sample equality', async () => {
    // Three candidates, two of which land in the same cell of a step function.
    const stepped: Objective<readonly number[]> = (input) =>
      input.candidates.map((candidate) => ({
        candidateId: candidate.id,
        samples: [Math.floor((candidate.value[0] ?? 0) / 2)],
        traceDigests: ['t0'],
      }));
    const round = await runRound(stepped, request({ candidates: candidates(4), replications: 1 }));
    expect(round.evaluations.map((evaluation) => evaluation.score)).toEqual([0, 0, 1, 1]);
    expect(round.distinctOutcomes).toBe(2);
  });
});

describe('ranking', () => {
  const evaluation = (id: string, score: number, quotable = true): Evaluation<Point> => ({
    candidate: { id, value: [], origin: 'test' },
    round: 0,
    replications: 1,
    samples: [score],
    traceDigests: ['t'],
    score,
    finiteCount: 1,
    nonFiniteCount: 0,
    saturated: !quotable,
    quotable,
  });
  type Point = readonly number[];

  it('ranks a saturated candidate last however good its mean looks', () => {
    const ranked = rankEvaluations([evaluation('slow', 40), evaluation('diverging', 1, false)]);
    expect(ranked.map((entry) => entry.candidate.id)).toEqual(['slow', 'diverging']);
  });

  it('breaks a tie by candidate id, deterministically', () => {
    expect(compareEvaluations(evaluation('b', 5), evaluation('a', 5))).toBeGreaterThan(0);
    expect(compareEvaluations(evaluation('a', 5), evaluation('a', 5))).toBe(0);
  });

  it('keys a plateau class on the whole sample vector, not on the mean', () => {
    expect(outcomeKey([1, 3])).not.toBe(outcomeKey([2, 2]));
    expect(outcomeKey([1, 3])).toBe(outcomeKey([1, 3]));
  });
});

describe('the box space fixture', () => {
  it('samples inside the box and round trips through the embedding', () => {
    const space = boxSpace(uniformDimensions(3, [0, 10]));
    const random = searchRng(SEED);
    for (let i = 0; i < 20; i += 1) {
      const point = space.sample(random);
      expect(point).toHaveLength(3);
      for (const value of point) expect(value).toBeGreaterThanOrEqual(0);
      for (const value of point) expect(value).toBeLessThanOrEqual(10);
      expect(space.decode(space.encode(point))).toEqual([...point]);
    }
  });
});
