/**
 * Random search — the honest baseline, and on this objective a genuinely competitive method.
 *
 * ## Why it is the baseline
 *
 * docs/06-parameterization-and-tuning.md: *"The honest baseline. Beats grid search in higher
 * dimensions and is embarrassingly parallel. Always run it for comparison."* The reason it beats
 * a grid is Bergstra & Bengio's: with `d` parameters of which only `k` matter, a grid of `m`
 * points per axis spends `m^d` evaluations to give each important axis `m` distinct values, while
 * `n` random draws give **every** axis `n` distinct values. The elevator space has eleven weights
 * and a dozen stage knobs, and Phase 5 measured that most of them are worth nothing at the
 * operating points that matter — which is precisely the low-effective-dimension regime.
 *
 * ## Why it is a real contender here and not a formality
 *
 * Random search is the only method in this directory that **cannot stall on a plateau**, because
 * it never asks a plateau for a direction. Every draw is independent of every score. On an
 * objective that is exactly constant over finite regions — where finite differences are undefined
 * and a small-step method learns nothing from an entire generation — that immunity is not a
 * consolation prize. {@link SearchResult.plateau} reports `escapes: 0` for this method for that
 * reason: there is nothing to escape from.
 *
 * Reporting it losing would be a result. Reporting it winning is also a result, and the one this
 * project should expect to have to publish.
 *
 * ## What it still gets right
 *
 * Common random numbers. Every candidate is evaluated in a round under one trace seed, so the
 * comparison between two draws is paired even though the draws are independent — the 324× Phase 3
 * measured between near-neighbours applies to a random pair that happens to land close together
 * exactly as it does to a deliberate perturbation.
 */

import { normalizeSearchSeed, runRound, searchRng, traceSeedFor } from './round.js';
import { SearchRecorder } from './result.js';
import {
  SEARCH_DEFAULTS,
  SearchError,
  type Candidate,
  type CandidateSampler,
  type Objective,
  type SearchResult,
  type SeedPolicy,
} from './types.js';

export interface RandomSearchOptions<C> {
  readonly space: CandidateSampler<C>;
  readonly objective: Objective<C>;
  /** Reproduces the whole trajectory. A decimal string keeps 64 bits through JSON. */
  readonly seed: number | string | bigint;
  /** Draws. Defaults to {@link SEARCH_DEFAULTS.randomCandidates}. */
  readonly candidates?: number | undefined;
  /** Replications per draw. Defaults to {@link SEARCH_DEFAULTS.replications}. */
  readonly replications?: number | undefined;
  /**
   * Candidates per round. Defaults to all of them in one round.
   *
   * Batching costs **nothing statistically** under the default `'fixed'` seed policy, because
   * every round then runs on the same trace seed and candidates stay paired across batches. It is
   * a memory and scheduling knob: a round of 100 candidates × 300 replications is 30 000
   * simulations held open at once.
   */
  readonly batchSize?: number | undefined;
  /**
   * A configuration to evaluate alongside the draws — the hand-authored profile the search must
   * beat.
   *
   * Included as candidate `incumbent` in the first round, so the winner is compared against it on
   * identical traces at identical fidelity rather than against a number from another study.
   *
   * **It adds a candidate rather than occupying one**, so an incumbent costs one extra
   * `replications` and the total is `(candidates + 1) × replications`. That is the opposite of
   * `successiveHalving`, where the incumbent takes one of rung 1's declared slots and the budget
   * stays exactly the documented 3 990 — and the difference is deliberate, because the two options
   * mean different things: {@link candidates} here is *how many draws to take*, while a rung's
   * `candidates` is *how wide the rung is*. Honouring the incumbent by taking one draw fewer would
   * make a random search of `n` candidates not a random search of `n` candidates.
   *
   * Both arithmetics are asserted in their own test rather than left to be inferred, because an
   * unstated budget difference between two methods is exactly what an equal-budget comparison
   * cannot survive.
   */
  readonly incumbent?: C | undefined;
  readonly seedPolicy?: SeedPolicy | undefined;
  /** Prefix for generated candidate ids. Becomes the dispatcher arm id in a real run. */
  readonly idPrefix?: string | undefined;
}

/**
 * Draw candidates, evaluate them under common random numbers, keep the best.
 *
 * @throws SearchError for a non-positive budget, or when the objective breaks the round contract.
 */
export async function randomSearch<C>(options: RandomSearchOptions<C>): Promise<SearchResult<C>> {
  const candidateCount = options.candidates ?? SEARCH_DEFAULTS.randomCandidates;
  const replications = options.replications ?? SEARCH_DEFAULTS.replications;
  const seedPolicy: SeedPolicy = options.seedPolicy ?? SEARCH_DEFAULTS.seedPolicy;
  const prefix = options.idPrefix ?? 'random';

  if (!Number.isSafeInteger(candidateCount) || candidateCount < 1) {
    throw new SearchError(
      `randomSearch: candidates must be a positive integer; received ${candidateCount}.`,
      'candidates',
    );
  }
  const batchSize = options.batchSize ?? candidateCount;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new SearchError(`randomSearch: batchSize must be a positive integer; received ${batchSize}.`, 'batchSize');
  }

  const random = searchRng(options.seed);
  const recorder = new SearchRecorder<C>();

  // Every draw is taken up front, in one pass, so the candidate set is a function of the seed
  // alone and not of how the budget happened to be batched.
  const pool: Candidate<C>[] = [];
  if (options.incumbent !== undefined) {
    pool.push({ id: 'incumbent', value: options.incumbent, origin: 'incumbent' });
  }
  const width = String(candidateCount - 1).length;
  for (let i = 0; i < candidateCount; i += 1) {
    pool.push({
      id: `${prefix}-${String(i).padStart(width, '0')}`,
      value: options.space.sample(random),
      origin: 'random',
    });
  }

  let round = 0;
  for (let start = 0; start < pool.length; start += batchSize) {
    const batch = pool.slice(start, start + batchSize);
    const executed = await runRound(options.objective, {
      candidates: batch,
      replications,
      seed: traceSeedFor(seedPolicy, options.seed, round),
      round,
      label: `random draw ${start + 1}–${start + batch.length} (${batch.length} × ${replications})`,
    });
    recorder.add(executed);
    round += 1;
  }

  if (recorder.plateau.report().roundsWithTies > 0) {
    recorder.note(
      'At least two draws produced bit-identical runs. On a piecewise-constant objective that means they landed in the same cell of the decision partition, not that the search resampled a point.',
    );
  }

  return recorder.finish(
    'random',
    normalizeSearchSeed(options.seed),
    traceSeedFor(seedPolicy, options.seed, 0),
  );
}
