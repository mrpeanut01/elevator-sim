/**
 * The round: the one place a search touches its objective, and the place CRN is *verified*.
 *
 * Every optimizer in this directory evaluates candidates through {@link runRound} and never calls
 * an {@link Objective} directly. That is not tidiness. Three properties the whole phase rests on
 * are enforced here, once, rather than in three optimizers that would each get one of them
 * slightly wrong:
 *
 * 1. **Common random numbers within a round.** Every candidate's {@link CandidateOutcome.traceDigests}
 *    must be byte-identical. Phase 3 measured 99.69 % variance reduction (324×) between
 *    near-neighbour weight vectors under CRN; an objective that reseeded per candidate would run,
 *    return plausible numbers, and cost the search a factor of a few hundred while looking
 *    entirely healthy. It fails loudly instead.
 * 2. **Nothing is promoted on fewer replications than the round declared.** A fidelity ladder
 *    whose rungs silently under-deliver is a ladder that selects on noise, and successive halving
 *    is exactly the algorithm that would then discard the winner at rung 1.
 * 3. **The mean is computed one way.** Non-finite samples are counted, not averaged: a `NaN` AWT
 *    means nobody was served, which is a fact about the configuration, not a wait of zero
 *    seconds. `reports/statistics.ts` refuses to interval a non-finite value for the same reason.
 */

import { StreamSet, deriveStreamSeed, normalizeSeed } from '@elevator-sim/core';
import type { Rng } from '@elevator-sim/core';

import {
  SearchError,
  type Candidate,
  type CandidateOutcome,
  type Evaluation,
  type Objective,
  type ObjectiveRequest,
  type SearchRound,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Seeds and randomness
 * -------------------------------------------------------------------------- */

/**
 * The stream a search draws its own randomness from.
 *
 * `policyNoise` is `STREAM_NAMES`' slot for "stochastic dispatcher exploration", which is what a
 * search over dispatchers is. Using a named stream on an injected {@link StreamSet} rather than a
 * generator of this module's own making is CLAUDE.md invariant 2, and it is why the same seed
 * reproduces the same trajectory.
 */
export const SEARCH_STREAM = 'policyNoise';

/** Accept a seed as a number, a decimal string (so 64 bits survive JSON) or a `bigint`. */
export function normalizeSearchSeed(seed: number | string | bigint): bigint {
  if (typeof seed === 'string') {
    const text = seed.trim();
    if (!/^-?\d+$/.test(text)) {
      throw new SearchError(
        `Search seed "${seed}" is not a decimal integer. A seed is written as a number or as a decimal string so that 64 bits survive JSON.`,
        'seed',
      );
    }
    return normalizeSeed(BigInt(text));
  }
  return normalizeSeed(seed);
}

/**
 * The search's own generator.
 *
 * Separate from the trace seeds by construction: the traces a round runs on come from
 * {@link roundSeed}, and what the optimizer *proposes* comes from here. Mixing the two would make
 * the candidates a function of the traces they are scored on, which is a subtle way to overfit
 * before the held-out set ever gets a look.
 */
export function searchRng(seed: number | string | bigint, stream: string = SEARCH_STREAM): Rng {
  return new StreamSet(normalizeSearchSeed(seed)).derive(stream);
}

/**
 * The trace seed for one round.
 *
 * Derived through core's `deriveStreamSeed`, which is compatibility-locked with golden vectors,
 * for the reason `runner/crn.ts` gives: reproducibility of a stored result is only as stable as
 * the weakest mapping between its seed and its numbers, and there is no reason to add a second
 * mapping of this module's own invention.
 */
export function roundSeed(searchSeed: number | string | bigint, round: number): bigint {
  if (!Number.isSafeInteger(round) || round < 0) {
    throw new SearchError(`Round index must be a non-negative safe integer; received ${round}.`);
  }
  return deriveStreamSeed(normalizeSearchSeed(searchSeed), `search:round:${round}`).initState;
}

/**
 * The trace seed a round runs under, given the policy.
 *
 * Under `'fixed'` — the default — round 0's seed is used for every round, which is what makes the
 * successive-halving ladder a **refinement** rather than four independent experiments: the runner
 * derives a replication's seed from `(experimentSeed, replicationIndex)` alone, so a survivor's
 * 30 samples at rung 2 *begin with* the 10 samples it was promoted on at rung 1, and every
 * candidate the search ever saw is paired against every other.
 */
export function traceSeedFor(
  policy: 'fixed' | 'per-round',
  searchSeed: number | string | bigint,
  round: number,
): bigint {
  return roundSeed(searchSeed, policy === 'fixed' ? 0 : round);
}

/* -------------------------------------------------------------------------- *
 * Running a round
 * -------------------------------------------------------------------------- */

/** Mean over the finite entries, `+Infinity` when there are none. */
function meanOfFinite(samples: readonly number[]): { mean: number; finite: number; nonFinite: number } {
  let total = 0;
  let finite = 0;
  for (const value of samples) {
    if (Number.isFinite(value)) {
      total += value;
      finite += 1;
    }
  }
  return {
    mean: finite === 0 ? Number.POSITIVE_INFINITY : total / finite,
    finite,
    nonFinite: samples.length - finite,
  };
}

function describe(candidateIds: readonly string[]): string {
  const shown = candidateIds.slice(0, 4).join(', ');
  return candidateIds.length > 4 ? `${shown}, …` : shown;
}

/**
 * Evaluate a round, verify the contract, and shape the result.
 *
 * @throws SearchError when the objective omits a candidate, answers one twice, returns fewer
 *   replications than the round declared, or breaks common random numbers.
 */
export async function runRound<C>(
  objective: Objective<C>,
  request: ObjectiveRequest<C>,
): Promise<SearchRound<C>> {
  if (request.candidates.length === 0) {
    throw new SearchError(`Round ${request.round} (${request.label}) has no candidates.`);
  }
  if (!Number.isSafeInteger(request.replications) || request.replications < 1) {
    throw new SearchError(
      `Round ${request.round} (${request.label}) asked for ${request.replications} replications; a round evaluates at least one.`,
    );
  }

  const ids = request.candidates.map((candidate) => candidate.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new SearchError(
      `Round ${request.round} (${request.label}) contains duplicate candidate ids: ${describe(duplicates)}. A candidate id is the dispatcher arm id in the underlying experiment and must be unique.`,
    );
  }

  const outcomes = await objective(request);
  const byId = new Map<string, CandidateOutcome>();
  for (const outcome of outcomes) {
    if (byId.has(outcome.candidateId)) {
      throw new SearchError(
        `Objective returned two outcomes for candidate "${outcome.candidateId}" in round ${request.round} (${request.label}).`,
      );
    }
    byId.set(outcome.candidateId, outcome);
  }

  let reference: readonly string[] | undefined;
  let referenceId = '';
  const evaluations: Evaluation<C>[] = [];

  for (const candidate of request.candidates) {
    const outcome = byId.get(candidate.id);
    if (outcome === undefined) {
      throw new SearchError(
        `Objective returned no outcome for candidate "${candidate.id}" in round ${request.round} (${request.label}). Every candidate a round declares must be evaluated, or the round's ranking is over a different set than the one the search believes it searched.`,
      );
    }

    if (outcome.samples.length < request.replications) {
      throw new SearchError(
        `Candidate "${candidate.id}" came back with ${outcome.samples.length} replications in round ${request.round} (${request.label}), which declared ${request.replications}. Promoting on fewer replications than declared is selecting on noise the ladder was built to remove.`,
      );
    }
    if (outcome.traceDigests.length !== outcome.samples.length) {
      throw new SearchError(
        `Candidate "${candidate.id}" reported ${outcome.samples.length} samples against ${outcome.traceDigests.length} trace digests in round ${request.round}. One digest per replication is what makes the CRN claim checkable.`,
      );
    }

    if (reference === undefined) {
      reference = outcome.traceDigests;
      referenceId = candidate.id;
    } else {
      const mismatch = firstDigestMismatch(reference, outcome.traceDigests);
      if (mismatch !== undefined) {
        throw new SearchError(
          `Common random numbers are broken in round ${request.round} (${request.label}): candidate "${candidate.id}" ran replication ${mismatch} on trace ${outcome.traceDigests[mismatch] ?? '<missing>'} while "${referenceId}" ran it on ${reference[mismatch] ?? '<missing>'}. Every candidate in a round must see the same passenger traces — Phase 3 measured 99.69 % variance reduction (324×) from exactly this pairing between near-neighbour candidates.`,
        );
      }
    }

    const { mean, finite, nonFinite } = meanOfFinite(outcome.samples);
    const saturated = outcome.saturated ?? false;
    evaluations.push({
      candidate,
      round: request.round,
      replications: outcome.samples.length,
      samples: outcome.samples,
      traceDigests: outcome.traceDigests,
      score: mean,
      finiteCount: finite,
      nonFiniteCount: nonFinite,
      saturated,
      quotable: outcome.quotable ?? !saturated,
    });
  }

  return {
    round: request.round,
    label: request.label,
    seed: request.seed.toString(),
    replications: request.replications,
    evaluations,
    distinctOutcomes: countDistinctOutcomes(evaluations),
    traceDigests: reference ?? [],
  };
}

function firstDigestMismatch(a: readonly string[], b: readonly string[]): number | undefined {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return undefined;
}

/* -------------------------------------------------------------------------- *
 * Ranking
 * -------------------------------------------------------------------------- */

/**
 * The one ordering every optimizer here ranks by. Total, deterministic, and quotable-first.
 *
 * - A candidate whose AWT may not be quoted sorts below every candidate whose may, whatever its
 *   mean. docs/03-traffic-and-statistics.md § Part 3: a saturated configuration is flagged, not
 *   averaged — and a search that promoted one would be optimizing the suppression rule.
 * - Then by score ascending.
 * - Then by candidate id, so that a tie — which on this objective usually means *the same run
 *   twice*, not a coincidence — resolves the same way on every machine and in every rerun.
 *   CLAUDE.md invariant 4's spirit: never break a tie by whatever order a hash produced.
 */
export function compareEvaluations<C>(a: Evaluation<C>, b: Evaluation<C>): number {
  if (a.quotable !== b.quotable) return a.quotable ? -1 : 1;
  if (a.score !== b.score) return a.score < b.score ? -1 : 1;
  return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0;
}

/** {@link compareEvaluations}, applied. Does not mutate its argument. */
export function rankEvaluations<C>(evaluations: readonly Evaluation<C>[]): readonly Evaluation<C>[] {
  return [...evaluations].sort(compareEvaluations);
}

/* -------------------------------------------------------------------------- *
 * Plateau classes
 * -------------------------------------------------------------------------- */

/**
 * The key two evaluations share iff their runs were bit-identical.
 *
 * Exact string equality of the sample vector, not a tolerance. On this objective that is the
 * right test and a tolerance would be the wrong one: below the decision-flip threshold the
 * difference is *exactly* zero over every replication, and above it the difference is a real
 * effect however small. There is no intermediate regime for an epsilon to live in.
 */
export function outcomeKey(samples: readonly number[]): string {
  return samples.join('');
}

/** Distinct plateau classes among a set of evaluations. `1` means the whole set was flat. */
export function countDistinctOutcomes<C>(evaluations: readonly Evaluation<C>[]): number {
  const keys = new Set<string>();
  for (const evaluation of evaluations) keys.add(outcomeKey(evaluation.samples));
  return keys.size;
}
