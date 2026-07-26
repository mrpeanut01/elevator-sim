/**
 * Assembling a {@link SearchResult}, identically for every method.
 *
 * Three optimizers produce one shape, and they produce it through one recorder rather than three
 * hand-rolled accumulations, because the numbers a reader compares between methods — budget
 * spent, best-so-far against budget, how much of the search was flat — are only comparable if
 * they are counted the same way. A method that counted its probe round's replications and one
 * that did not would look like a 7 % efficiency difference that was really a bookkeeping
 * difference.
 *
 * ## The runner-up is part of the result, not part of the report
 *
 * `best` on its own is a point estimate, and CLAUDE.md § Statistical discipline is explicit that
 * a point estimate is not a finding. So every result carries the runner-up at the *same fidelity*
 * and the **paired differences** between the two, which is what a paired-t interval is computed
 * from — and carries the `identical` flag separately, because docs/05-roadmap.md is equally
 * explicit that bit-identical arms are one dispatcher under two names rather than a narrow win.
 *
 * What this module deliberately does **not** do is classify. `benchmark/verdict.ts` owns the
 * vocabulary for what a paired interval may be called (`BETTER` / `INDISTINGUISHABLE` /
 * `IDENTICAL` / …) and `tuning/report` is its consumer here. A search that decided its own
 * verdict would be marking its own homework.
 */

import { compareEvaluations, rankEvaluations } from './round.js';
import { PlateauTally, sameOutcome } from './plateau.js';
import {
  SearchError,
  type Evaluation,
  type RunnerUpComparison,
  type SearchMethodId,
  type SearchResult,
  type SearchRound,
  type TrajectoryPoint,
} from './types.js';

/** How a round is folded in. */
export interface RecordRoundOptions {
  /**
   * Whether the round's evaluations may become {@link SearchRecorder.best}. Defaults to `true`.
   *
   * `false` marks a **diagnostic** round: one the search ran to learn something about the
   * objective rather than to find a winner in. `sepCmaEs`'s plateau probe is the only such round
   * today — its points are deliberate perturbations of the start point, used as a measuring stick
   * for the plateau width, and one of them being numerically the lowest thing the search saw says
   * nothing about where the optimum is.
   *
   * This is not a cosmetic distinction. Best-so-far is tracked at the **highest fidelity reached**
   * (see {@link SearchRecorder.add}), so a diagnostic round run at more replications than the
   * generations that follow it would pin `best` to a probe point for the rest of the search and
   * silently discard every generation. Measured before the fix, through the public API alone:
   * `sepCmaEs({ …, replications: 6, probePlateau: true, probeReplications: 12 })` on a 2-D plateau
   * evaluated the exact optimum at generation 9 — noiseless objective 0 — and returned
   * `probe-0-7`, noiseless objective 52. Nothing threw and no note was written. The default
   * `probeReplications` is a fifth of the round's, which is why it took a non-default call to see
   * it and why the fix is structural rather than a bound on the option.
   *
   * The round is still counted in every other way: its budget, its evaluations, its candidates and
   * its contribution to the plateau tally. It was run; it cost what it cost.
   */
  readonly eligibleForBest?: boolean | undefined;
}

/** Accumulates rounds into a result. One per search. */
export class SearchRecorder<C> {
  readonly plateau = new PlateauTally();

  readonly #rounds: SearchRound<C>[] = [];
  readonly #evaluations: Evaluation<C>[] = [];
  readonly #trajectory: TrajectoryPoint[] = [];
  readonly #notes: string[] = [];
  readonly #candidateIds = new Set<string>();
  #replicationsSpent = 0;
  #best: Evaluation<C> | undefined;
  #bestFidelity = 0;

  /**
   * Fold in a completed round: budget, plateau tally, best-so-far, trajectory point.
   *
   * ## The best is the best *at the highest fidelity reached*, never the lowest number seen
   *
   * This is not a detail. A mean over 10 replications and a mean over 300 are estimates of the
   * same quantity with wildly different precision — 1.14 s against 0.21 s of standard error on
   * this simulator's own numbers — and the *lowest* value seen across a fidelity ladder is almost
   * always a rung-1 estimate that got lucky. Selecting on it would make successive halving
   * strictly worse than not laddering at all: every rung of refinement would be discarded in
   * favour of the noisiest number in the run.
   *
   * So an evaluation at a higher replication count **supersedes** everything measured below it,
   * and candidates are only ever compared against each other at equal fidelity. Written out
   * because the naive version passes every test that does not have a ladder in it, and this
   * repository's own test suite caught it exactly once.
   *
   * ## The ceiling is monotone, so a round that is not a search round must say so
   *
   * The flip side of "higher fidelity supersedes" is that the ceiling only ever rises: once an
   * evaluation at `n` replications has been seen, nothing measured below `n` can win again. That
   * is right for a fidelity ladder, where every rung raises `n` on purpose, and **wrong** for a
   * round that was never a candidate for the answer. Pass
   * {@link RecordRoundOptions.eligibleForBest} `false` for those; the failure it prevents, and the
   * measurement of it, are documented there.
   */
  add(round: SearchRound<C>, options: RecordRoundOptions = {}): void {
    const eligible = options.eligibleForBest ?? true;
    this.#rounds.push(round);
    this.plateau.observe(round);
    for (const evaluation of round.evaluations) {
      this.#evaluations.push(evaluation);
      this.#candidateIds.add(evaluation.candidate.id);
      this.#replicationsSpent += evaluation.replications;
      if (!eligible) continue;
      if (evaluation.replications > this.#bestFidelity) {
        this.#bestFidelity = evaluation.replications;
        this.#best = evaluation;
      } else if (
        evaluation.replications === this.#bestFidelity &&
        (this.#best === undefined || compareEvaluations(evaluation, this.#best) < 0)
      ) {
        this.#best = evaluation;
      }
    }
    const best = this.#best;
    if (best !== undefined) {
      this.#trajectory.push({
        round: round.round,
        replicationsSpent: this.#replicationsSpent,
        bestScore: best.score,
        bestCandidateId: best.candidate.id,
      });
    }
  }

  /** A finding worth carrying next to the numbers. Free-form; a report renders them verbatim. */
  note(text: string): void {
    this.#notes.push(text);
  }

  /** Rounds folded in so far. */
  get rounds(): readonly SearchRound<C>[] {
    return this.#rounds;
  }

  /** Replications spent so far. */
  get replicationsSpent(): number {
    return this.#replicationsSpent;
  }

  /** Best evaluation so far, by {@link compareEvaluations}. */
  get best(): Evaluation<C> | undefined {
    return this.#best;
  }

  /**
   * Close the search.
   *
   * @throws SearchError when no round was ever run — a search with no evaluation has no best, and
   *   returning a fabricated one would be the shape of a result with none of the content.
   */
  finish(method: SearchMethodId, seed: bigint, traceSeed: bigint): SearchResult<C> {
    const best = this.#best;
    if (best === undefined) {
      throw new SearchError(
        this.#rounds.length === 0
          ? `${method}: no candidate was ever evaluated, so there is no result.`
          : `${method}: ${this.#rounds.length} round(s) ran but every one of them was diagnostic, so no candidate is eligible to be the answer.`,
      );
    }
    const runnerUp = runnerUpOf(this.#rounds, best);
    return {
      method,
      seed: seed.toString(),
      traceSeed: traceSeed.toString(),
      best,
      rounds: this.#rounds,
      evaluations: this.#evaluations,
      candidatesEvaluated: this.#candidateIds.size,
      replicationsSpent: this.#replicationsSpent,
      trajectory: this.#trajectory,
      plateau: this.plateau.report(),
      ...(runnerUp === undefined ? {} : { runnerUp }),
      notes: this.#notes,
    };
  }
}

/**
 * The best candidate's nearest rival **in the round the best was measured in**.
 *
 * Same round, so same fidelity and same traces, so the differences are paired and a paired-t
 * interval over them is legitimate. Comparing across rounds would compare a 300-replication mean
 * against a 10-replication one and call the gap an effect.
 */
export function runnerUpOf<C>(
  rounds: readonly SearchRound<C>[],
  best: Evaluation<C>,
): RunnerUpComparison<C> | undefined {
  const round = rounds.find((entry) => entry.evaluations.includes(best));
  if (round === undefined) return undefined;
  const ranked = rankEvaluations(round.evaluations.filter((entry) => entry !== best));
  const rival = ranked[0];
  if (rival === undefined) return undefined;

  const width = Math.min(best.samples.length, rival.samples.length);
  const pairedDifferences: number[] = [];
  for (let i = 0; i < width; i += 1) {
    pairedDifferences.push((best.samples[i] ?? Number.NaN) - (rival.samples[i] ?? Number.NaN));
  }
  return {
    candidateId: rival.candidate.id,
    candidate: rival.candidate.value,
    score: rival.score,
    difference: best.score - rival.score,
    identical: sameOutcome(best, rival),
    pairedDifferences,
  };
}
