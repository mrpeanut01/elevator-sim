/**
 * Successive halving on **replication count** — the default method, and the one docs/06 specifies.
 *
 * ```
 * | Round | Candidates | Replications each | Purpose                        |
 * | 1     | 100        | 10                | Eliminate obvious losers       |
 * | 2     |  33        | 30                | Narrow                         |
 * | 3     |  11        | 100               | Refine                         |
 * | 4     |   3        | 300               | Final selection with paired-t  |
 * ```
 *
 * ## Why replication count is the right fidelity dimension
 *
 * Multi-fidelity search needs a knob that trades accuracy for cost *monotonically and cheaply*,
 * and most problems have to invent one — a subsampled dataset, a truncated training run — with an
 * unclear relationship to the full-fidelity objective. Here it exists already and its relationship
 * to the objective is **exactly known**: the mean of `n` replications is an unbiased estimate of
 * the same quantity at every `n`, with a standard error that falls as `1/√n`. There is no
 * low-fidelity bias to correct for, only variance. That is a better multi-fidelity setup than most
 * of the hyperparameter literature works with.
 *
 * ## The ladder is a refinement, not four experiments
 *
 * Under the default `'fixed'` seed policy every rung runs on the same trace seed, and the runner
 * derives a replication's seed from `(experimentSeed, replicationIndex)` alone. So a survivor's
 * 30 samples at rung 2 **begin with** the 10 samples it was promoted on at rung 1: rung 2 adds
 * twenty replications rather than discarding ten. This module checks that rather than assuming
 * it — {@link SuccessiveHalvingResult.prefixVerified} — because a broken prefix means the rungs
 * are unpaired, and a ladder of unpaired rungs is a ladder that reshuffles its ranking at every
 * step for reasons that have nothing to do with the candidates.
 *
 * ## What rung 1 is and is not allowed to say
 *
 * Ten replications is below the fifty-replication floor docs/03 sets for a comparison, and the
 * reference study's 12 % error at fifteen runs is exactly the arithmetic that says so. Rung 1
 * therefore **eliminates**, and eliminates on a mean it does not defend; it never declares a
 * winner. A verdict comes from rung 4's 300 replications and its paired-t interval, and
 * {@link Evaluation.replications} travels with every number so a report cannot lose track of
 * which rung a claim came from.
 *
 * The honest cost of that: at n = 10 the standard error on a 15.8 s AWT with a 3.60 s sample sd
 * is 1.14 s, so a candidate genuinely 0.5 s better than another is eliminated at rung 1 with
 * probability well above a third. Successive halving buys throughput by accepting that risk. The
 * mitigation is CRN — the *paired* sd between near-neighbours is 99.69 % smaller than the
 * unpaired one, which is what makes ten replications informative at all — and it is why this
 * module refuses to run without it.
 */

import { normalizeSearchSeed, rankEvaluations, runRound, searchRng, traceSeedFor } from './round.js';
import { sameOutcome } from './plateau.js';
import { SearchRecorder } from './result.js';
import {
  DOC_RUNGS,
  SEARCH_DEFAULTS,
  SearchError,
  type Candidate,
  type CandidateSampler,
  type Evaluation,
  type Objective,
  type Rung,
  type SearchResult,
  type SeedPolicy,
} from './types.js';

/** What one rung did. */
export interface RungResult<C> {
  readonly rung: number;
  /** The rung as declared: `{ candidates, replications }`. */
  readonly declared: Rung;
  /** Candidate ids the rung evaluated, in the order it evaluated them. */
  readonly evaluated: readonly string[];
  /** Candidate ids promoted to the next rung, best first. Empty on the last rung. */
  readonly promoted: readonly string[];
  readonly eliminated: readonly string[];
  /**
   * The cut fell inside a plateau class: the last promoted candidate produced a **bit-identical
   * run** to the first eliminated one.
   *
   * The promotion was therefore arbitrary — resolved by candidate id, deterministically, but on
   * no evidence. Worth reporting rather than hiding: it means the rung's width is finer than the
   * objective's resolution at this point, and more replications will not change that.
   */
  readonly tiedAtCut: boolean;
  /** Replications the rung spent. `candidates × replications`. */
  readonly replicationsSpent: number;
}

export interface SuccessiveHalvingResult<C> extends SearchResult<C> {
  readonly rungs: readonly RungResult<C>[];
  /**
   * Whether every survivor's higher-fidelity samples extended its lower-fidelity ones.
   *
   * `undefined` under the `'per-round'` seed policy, where the property is deliberately given up.
   */
  readonly prefixVerified?: boolean | undefined;
}

export interface SuccessiveHalvingOptions<C> {
  readonly objective: Objective<C>;
  readonly seed: number | string | bigint;
  /**
   * Where rung 1's pool comes from. Either sample it from a space, or supply it — a CMA-ES
   * generation, a hand-written shortlist, the output of a previous search.
   */
  readonly space?: CandidateSampler<C> | undefined;
  readonly candidates?: readonly C[] | undefined;
  /** Defaults to {@link DOC_RUNGS}, docs/06's table verbatim. */
  readonly rungs?: readonly Rung[] | undefined;
  /**
   * A configuration that enters rung 1 whatever else is sampled — the hand-authored profile the
   * search exists to beat. It occupies one of rung 1's declared slots rather than adding to them,
   * so the budget stays exactly as documented.
   */
  readonly incumbent?: C | undefined;
  readonly seedPolicy?: SeedPolicy | undefined;
  readonly idPrefix?: string | undefined;
}

/** Replications the ladder will spend: `Σ candidates × replications`. {@link DOC_RUNGS} is 3 990. */
export function plannedBudget(rungs: readonly Rung[]): number {
  return rungs.reduce((total, rung) => total + rung.candidates * rung.replications, 0);
}

/**
 * @throws SearchError for a ladder that is not one: widths must strictly decrease and fidelity
 *   must strictly increase, or the rungs are not a fidelity ladder and the budget table in docs/06
 *   does not describe what will happen.
 */
export function assertLadder(rungs: readonly Rung[]): void {
  if (rungs.length === 0) throw new SearchError('successiveHalving: at least one rung is required.', 'rungs');
  for (const [index, rung] of rungs.entries()) {
    if (!Number.isSafeInteger(rung.candidates) || rung.candidates < 1) {
      throw new SearchError(
        `successiveHalving: rung ${index + 1} declares ${rung.candidates} candidates; a rung evaluates at least one.`,
        `rungs[${index}].candidates`,
      );
    }
    if (!Number.isSafeInteger(rung.replications) || rung.replications < 1) {
      throw new SearchError(
        `successiveHalving: rung ${index + 1} declares ${rung.replications} replications; a rung runs at least one.`,
        `rungs[${index}].replications`,
      );
    }
    const previous = rungs[index - 1];
    if (previous === undefined) continue;
    if (rung.candidates >= previous.candidates) {
      throw new SearchError(
        `successiveHalving: rung ${index + 1} keeps ${rung.candidates} of rung ${index}'s ${previous.candidates} candidates. A rung that does not narrow is not a rung.`,
        `rungs[${index}].candidates`,
      );
    }
    if (rung.replications <= previous.replications) {
      throw new SearchError(
        `successiveHalving: rung ${index + 1} runs ${rung.replications} replications against rung ${index}'s ${previous.replications}. Replication count is the fidelity dimension; a ladder that does not raise it spends more budget for no more precision.`,
        `rungs[${index}].replications`,
      );
    }
  }
}

/**
 * Run the ladder.
 *
 * @throws SearchError for a malformed ladder, a pool too small for rung 1, an objective that
 *   breaks common random numbers, or a rung that came back on fewer replications than it declared.
 */
export async function successiveHalving<C>(
  options: SuccessiveHalvingOptions<C>,
): Promise<SuccessiveHalvingResult<C>> {
  const rungs = options.rungs ?? DOC_RUNGS;
  assertLadder(rungs);
  const first = rungs[0] as Rung;
  const seedPolicy: SeedPolicy = options.seedPolicy ?? SEARCH_DEFAULTS.seedPolicy;
  const prefix = options.idPrefix ?? 'sh';

  const pool = buildPool(options, first.candidates, prefix);
  if (pool.length < first.candidates) {
    throw new SearchError(
      `successiveHalving: rung 1 declares ${first.candidates} candidates but only ${pool.length} were available. Supply a space to sample from, or a candidate list at least that long.`,
      'candidates',
    );
  }

  const recorder = new SearchRecorder<C>();
  const rungResults: RungResult<C>[] = [];
  let entrants = pool.slice(0, first.candidates);
  let previousByCandidate = new Map<string, Evaluation<C>>();
  let prefixVerified = seedPolicy === 'fixed' ? true : undefined;

  for (const [index, rung] of rungs.entries()) {
    if (entrants.length !== rung.candidates) {
      throw new SearchError(
        `successiveHalving: rung ${index + 1} declares ${rung.candidates} candidates but ${entrants.length} survived rung ${index}. Promotion must fill a rung exactly, or the budget is not the documented one.`,
      );
    }

    const executed = await runRound(options.objective, {
      candidates: entrants,
      replications: rung.replications,
      seed: traceSeedFor(seedPolicy, options.seed, index),
      round: index,
      label: `rung ${index + 1} (${rung.candidates} × ${rung.replications})`,
    });
    recorder.add(executed);

    for (const evaluation of executed.evaluations) {
      if (evaluation.replications < rung.replications) {
        throw new SearchError(
          `successiveHalving: candidate "${evaluation.candidate.id}" is being ranked on ${evaluation.replications} replications at a rung that declared ${rung.replications}.`,
        );
      }
      if (prefixVerified === true) {
        const earlier = previousByCandidate.get(evaluation.candidate.id);
        if (earlier !== undefined && !extendsSamples(earlier, evaluation)) prefixVerified = false;
      }
    }

    const ranked = rankEvaluations(executed.evaluations);
    const next = rungs[index + 1];
    const keep = next?.candidates ?? 0;
    const promoted = ranked.slice(0, keep);
    const eliminated = ranked.slice(keep);
    const lastPromoted = promoted[promoted.length - 1];
    const firstEliminated = eliminated[0];

    rungResults.push({
      rung: index + 1,
      declared: rung,
      evaluated: entrants.map((candidate) => candidate.id),
      promoted: promoted.map((evaluation) => evaluation.candidate.id),
      eliminated: eliminated.map((evaluation) => evaluation.candidate.id),
      tiedAtCut:
        lastPromoted !== undefined && firstEliminated !== undefined
          ? sameOutcome(lastPromoted, firstEliminated)
          : false,
      replicationsSpent: rung.candidates * rung.replications,
    });

    previousByCandidate = new Map(
      executed.evaluations.map((evaluation) => [evaluation.candidate.id, evaluation] as const),
    );
    entrants = promoted.map((evaluation) => evaluation.candidate);
    if (next === undefined) break;
  }

  if (prefixVerified === false) {
    recorder.note(
      "A survivor's higher-fidelity samples did not extend its lower-fidelity ones, so the rungs are not paired. Under the 'fixed' seed policy they must be; treat this as a wiring defect in the objective, not as a property of the search.",
    );
  }
  for (const rung of rungResults) {
    if (rung.tiedAtCut) {
      recorder.note(
        `Rung ${rung.rung}'s cut fell inside a plateau: the last promoted candidate produced a bit-identical run to the first eliminated one, so that promotion was decided by candidate id and by nothing else.`,
      );
    }
  }

  return {
    ...recorder.finish('successive-halving', normalizeSearchSeed(options.seed), traceSeedFor(seedPolicy, options.seed, 0)),
    rungs: rungResults,
    ...(prefixVerified === undefined ? {} : { prefixVerified }),
  };
}

/* -------------------------------------------------------------------------- *
 * Internals
 * -------------------------------------------------------------------------- */

function buildPool<C>(
  options: SuccessiveHalvingOptions<C>,
  width: number,
  prefix: string,
): readonly Candidate<C>[] {
  const pool: Candidate<C>[] = [];
  if (options.incumbent !== undefined) {
    pool.push({ id: 'incumbent', value: options.incumbent, origin: 'incumbent' });
  }
  const digits = String(Math.max(width - 1, 0)).length;
  const supplied = options.candidates;
  if (supplied !== undefined) {
    for (const [index, value] of supplied.entries()) {
      pool.push({ id: `${prefix}-${String(index).padStart(digits, '0')}`, value, origin: 'supplied' });
    }
    return pool;
  }
  const space = options.space;
  if (space === undefined) {
    throw new SearchError(
      'successiveHalving: give it either a space to sample rung 1 from or an explicit candidate list.',
      'space',
    );
  }
  const random = searchRng(options.seed);
  for (let index = pool.length; index < width; index += 1) {
    pool.push({
      id: `${prefix}-${String(index).padStart(digits, '0')}`,
      value: space.sample(random),
      origin: 'random',
    });
  }
  return pool;
}

/** `later.samples` begins with `earlier.samples`, elementwise and exactly. */
function extendsSamples<C>(earlier: Evaluation<C>, later: Evaluation<C>): boolean {
  if (later.samples.length < earlier.samples.length) return false;
  for (let i = 0; i < earlier.samples.length; i += 1) {
    if (earlier.samples[i] !== later.samples[i]) return false;
  }
  return true;
}
