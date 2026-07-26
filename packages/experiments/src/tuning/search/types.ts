/**
 * The vocabulary of a search: what an optimizer is handed, and what it hands back.
 *
 * ## What this module is searching
 *
 * A **piecewise-constant, noisy objective**. Both halves matter and they pull in opposite
 * directions:
 *
 * - *Noisy*, because one replication's AWT is one draw from a distribution with a 23 %
 *   coefficient of variation (docs/03-traffic-and-statistics.md § Measured). The answer is
 *   replications, and the fidelity ladder in {@link Rung}.
 * - *Piecewise constant*, because dispatch is an `argmin` over a handful of cars and the
 *   simulator is deterministic. A weight perturbation too small to flip a decision produces a
 *   **bit-identical run** — measured at ≤ 0.03 on `distanceTravelled`, 100/100 exactly-zero
 *   paired differences, `rho = 1` (docs/05-roadmap.md § Phase 7). Below that threshold a change
 *   is not a small effect, it is *no* effect.
 *
 * So the objective a search sees is not a scalar. It is a **vector of per-replication samples**
 * under common random numbers, and the distinction between "these two candidates are close" and
 * "these two candidates are the same point" is elementwise equality of that vector, not a
 * comparison of two means. {@link Evaluation.samples} is therefore the load-bearing field, and
 * `plateau.ts` is built entirely on it.
 *
 * ## Ports, not imports
 *
 * {@link Objective} and {@link CandidateSampler} are **ports**, declared here in the minimal
 * structural shape a search actually needs, exactly as `runner/types.ts` declares `StoppingRule`
 * and for the same reason: `tuning/space` owns sampling a configuration out of
 * `DISPATCH_PARAMETERS`, and `runner/` owns turning a configuration into replications. A search
 * that imported either would be untestable apart from a simulator and a parameter schema, and it
 * is neither.
 *
 * The production wiring of both is real and lives in `objective.ts`: it builds an
 * `ExperimentSpec` per round and calls `runExperiment`. There is no second replication runner
 * anywhere in this directory.
 *
 * ## Common random numbers are a precondition, not an optimization
 *
 * Every candidate in a round is evaluated on **the same traces**. Phase 3 measured 99.69 %
 * variance reduction (324×) between near-neighbour weight vectors, which is the regime a search
 * lives in; the same measurement gives only 43.75 % (1.8×) between structurally different
 * dispatchers. Skipping CRN here would not be a small loss of efficiency, it would be a factor
 * of a few hundred.
 *
 * `round.ts` does not trust this — it **verifies** it, by requiring every candidate in a round to
 * report byte-identical {@link Evaluation.traceDigests}, and throwing {@link SearchError} when
 * they differ. An objective that quietly reseeded per candidate would otherwise look like a
 * working search that needed 300× the budget.
 */

import type { Rng } from '@elevator-sim/core';

/* -------------------------------------------------------------------------- *
 * Errors
 * -------------------------------------------------------------------------- */

/**
 * A search that cannot be trusted, or a configuration that cannot be run.
 *
 * Thrown for a malformed budget, for an objective that broke the CRN contract or returned fewer
 * replications than the round declared, and for a space whose encode/decode do not round trip.
 * **Not** thrown for a saturated candidate: that is a legitimate measurement, carried on
 * {@link Evaluation.saturated} and ranked last.
 */
export class SearchError extends Error {
  /** Dotted path into the options, when the fault is in the caller's configuration. */
  readonly path: string | undefined;

  constructor(message: string, path?: string | undefined, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined);
    this.name = 'SearchError';
    this.path = path;
  }
}

/* -------------------------------------------------------------------------- *
 * The space port
 * -------------------------------------------------------------------------- */

/** One continuous dimension of a search space. Mirrors `DispatchParameterSpec`'s `range`. */
export interface SearchDimension {
  /** The parameter id, e.g. `weights.waitTime`. Diagnostics and the plateau report. */
  readonly id: string;
  /** Inclusive `[min, max]`. */
  readonly range: readonly [number, number];
}

/**
 * Anything a search can draw a candidate from.
 *
 * The minimal port. `tuning/space` satisfies it by sampling `DISPATCH_PARAMETERS` — honouring
 * `type`, `range`/`values` and `activeWhen` — and this module never learns that any of that
 * happened, which is the entire point of the self-describing schema (CLAUDE.md invariant 8).
 *
 * The draw takes an injected {@link Rng} rather than reaching for a generator of its own:
 * CLAUDE.md invariant 2, and the reason a search trajectory is reproducible from a seed.
 */
export interface CandidateSampler<C> {
  sample(random: Rng): C;
}

/**
 * A space that also has a real-vector embedding, which is what a continuous optimizer needs.
 *
 * `encode ∘ decode` must be the identity on the box; `decode ∘ encode` need not be (a space may
 * legitimately clamp, round an integer parameter, or drop a knob whose `activeWhen` is not
 * satisfied). `cmaes.ts` therefore always re-encodes what it decoded before using a point in an
 * update, so the distribution tracks the configurations that were *actually evaluated* rather
 * than the ones that were proposed.
 */
export interface VectorSpace<C> extends CandidateSampler<C> {
  readonly dimensions: readonly SearchDimension[];
  encode(candidate: C): readonly number[];
  decode(vector: readonly number[]): C;
}

/* -------------------------------------------------------------------------- *
 * The objective port
 * -------------------------------------------------------------------------- */

/** A configuration under evaluation, with an id stable for the whole search. */
export interface Candidate<C> {
  /** Unique within a search. Becomes the dispatcher arm id, and the profile id, in a real run. */
  readonly id: string;
  readonly value: C;
  /** Where it came from — `'random'`, `'generation 3'`, `'incumbent'`. Diagnostics only. */
  readonly origin: string;
}

/**
 * One round of evaluation: a set of candidates, one fidelity, **one trace seed**.
 *
 * The seed is on the request rather than per candidate on purpose. It is the mechanism: the
 * runner derives a replication's seed from `(experimentSeed, replicationIndex)` and nothing else,
 * so one seed across the round means every arm sees byte-identical passenger populations at equal
 * index and the paired difference is a difference in dispatch.
 */
export interface ObjectiveRequest<C> {
  readonly candidates: readonly Candidate<C>[];
  /** Replications each candidate gets. The fidelity dimension of successive halving. */
  readonly replications: number;
  /** The round's CRN seed. Identical for every candidate in it. */
  readonly seed: bigint;
  /** 0-based round index within the search. */
  readonly round: number;
  /** Human-readable round label, e.g. `rung 2 (33 × 30)`. */
  readonly label: string;
}

/**
 * What an objective reports for one candidate.
 *
 * Deliberately raw: samples, digests, and the two flags that decide whether a mean may be quoted
 * at all. The mean is computed in `round.ts` so that every optimizer computes it the same way,
 * and so that an objective cannot quietly average away a non-finite replication.
 */
export interface CandidateOutcome {
  readonly candidateId: string;
  /**
   * The objective, one value per replication, **in replication-index order, lower is better**.
   *
   * Index order is not cosmetic: `samples[i]` of two candidates in the same round is the same
   * passenger population, and a paired difference is only meaningful because of it.
   */
  readonly samples: readonly number[];
  /**
   * 64-bit trace digest per replication. Byte-identical across every candidate in a round.
   *
   * The runner already produces exactly this (`ReplicationRecord.traceDigest`). It is required
   * rather than optional because an unverifiable CRN claim is the failure mode that costs 324×
   * and looks like nothing at all.
   */
  readonly traceDigests: readonly string[];
  /** Any replication's queue diverged. Such a candidate is ranked last, never promoted. */
  readonly saturated?: boolean | undefined;
  /** Whether an interval may be quoted at all. Defaults to `!saturated`. */
  readonly quotable?: boolean | undefined;
}

/**
 * The evaluation port.
 *
 * A pure function of its request in the sense that matters: `(candidates, replications, seed)`
 * must determine the outcome. A search calls it once per round and records the answer verbatim.
 */
export type Objective<C> = (
  request: ObjectiveRequest<C>,
) => Promise<readonly CandidateOutcome[]> | readonly CandidateOutcome[];

/* -------------------------------------------------------------------------- *
 * Results
 * -------------------------------------------------------------------------- */

/** One candidate's evaluation at one fidelity, with the mean the ranking uses. */
export interface Evaluation<C> {
  readonly candidate: Candidate<C>;
  readonly round: number;
  /** Replications behind {@link samples}. Never fewer than the round declared. */
  readonly replications: number;
  readonly samples: readonly number[];
  readonly traceDigests: readonly string[];
  /**
   * Mean over the finite samples, lower is better. `+Infinity` when none were finite.
   *
   * `+Infinity` rather than `NaN` so that a candidate nobody could measure sorts last instead of
   * sorting arbitrarily — a `NaN` in a comparator is how an unmeasurable configuration wins.
   */
  readonly score: number;
  readonly finiteCount: number;
  readonly nonFiniteCount: number;
  readonly saturated: boolean;
  /** `false` when no mean may be quoted. Ranked below every quotable candidate. */
  readonly quotable: boolean;
}

/** One round, as executed. */
export interface SearchRound<C> {
  readonly round: number;
  readonly label: string;
  /** Decimal string. Every candidate in the round ran on traces derived from this. */
  readonly seed: string;
  readonly replications: number;
  readonly evaluations: readonly Evaluation<C>[];
  /**
   * Distinct plateau classes among the round's evaluations — candidates grouped by *exact*
   * equality of their sample vectors.
   *
   * `1` means every candidate in the round produced a bit-identical run: the whole round landed
   * inside one cell of the piecewise-constant objective and told the optimizer nothing about
   * direction. That is the signal `cmaes.ts` escapes on.
   */
  readonly distinctOutcomes: number;
  /** The round's shared trace digests, verified equal across every candidate. */
  readonly traceDigests: readonly string[];
}

/** Best-so-far against budget spent. The curve a report plots. */
export interface TrajectoryPoint {
  readonly round: number;
  /** Cumulative replications spent by the end of this round. The honest x-axis. */
  readonly replicationsSpent: number;
  readonly bestScore: number;
  readonly bestCandidateId: string;
}

/** What the search met of the piecewise-constant objective, and what it did about it. */
export interface PlateauReport {
  /** Rounds in which every candidate produced a bit-identical run. */
  readonly flatRounds: number;
  /** Rounds in which at least two candidates were bit-identical to each other. */
  readonly roundsWithTies: number;
  /** Candidates that were bit-identical to the round's best. */
  readonly tiedWithBest: number;
  /**
   * Step-size inflations: generations whose whole offspring set was bit-identical, on which σ was
   * multiplied up and the uninformative ranking discarded.
   *
   * Counted **separately** from {@link restarts} because the two are separate mechanisms with
   * separate failure modes, and a single total cannot tell them apart. A test asserting only that
   * *something* escaped passes when either one is deleted, which is how a mechanism ends up inert
   * with a green suite — the defect shape docs/05-roadmap.md's standing requirement exists to
   * catch. `cmaes.test.ts` runs one arm with each mechanism alone and asserts the counter that
   * arm's mechanism increments *and* that the other stays at zero.
   */
  readonly inflations: number;
  /** IPOP restarts: fresh mean, σ reset, population doubled. */
  readonly restarts: number;
  /**
   * Deliberate escapes, `inflations + restarts`.
   *
   * Zero for a method that does not take local steps — random search cannot stall on a plateau
   * because it never asks a plateau for a direction. Kept as the headline count a report prints;
   * anything that has to know *which* mechanism fired reads the two counters above.
   */
  readonly escapes: number;
  /** Per-dimension plateau width, when it was measured rather than assumed. */
  readonly stepFloor?: readonly number[] | undefined;
}

export const SEARCH_METHODS = ['random', 'successive-halving', 'sep-cmaes'] as const;

export type SearchMethodId = (typeof SEARCH_METHODS)[number];

/** A finished search. `tuning/report` consumes this. */
export interface SearchResult<C> {
  readonly method: SearchMethodId;
  /** Decimal string. Re-running with it reproduces every number below. */
  readonly seed: string;
  /** The trace seed rounds were run under, when one was shared. See {@link SeedPolicy}. */
  readonly traceSeed: string;
  readonly best: Evaluation<C>;
  readonly rounds: readonly SearchRound<C>[];
  /** Every evaluation, in the order it was made. */
  readonly evaluations: readonly Evaluation<C>[];
  /** Distinct candidates evaluated at least once. */
  readonly candidatesEvaluated: number;
  /** Replications spent. The budget a comparison between two methods must hold equal. */
  readonly replicationsSpent: number;
  readonly trajectory: readonly TrajectoryPoint[];
  readonly plateau: PlateauReport;
  /**
   * The runner-up at the best candidate's own fidelity, and the paired difference between them.
   *
   * Present so that no consumer has to take `best` on trust. `undefined` when the final round
   * held one candidate, or when the two were bit-identical and there is no difference to
   * interval — which is `IDENTICAL`, not a narrow win.
   */
  readonly runnerUp?: RunnerUpComparison<C> | undefined;
  readonly notes: readonly string[];
}

/** `best - runnerUp`, paired, at the fidelity both were measured on. */
export interface RunnerUpComparison<C> {
  readonly candidateId: string;
  readonly candidate: C;
  readonly score: number;
  /** `best.score - runnerUp.score`. Negative means the best really is better. */
  readonly difference: number;
  /** Every paired difference was exactly zero: one candidate under two names. */
  readonly identical: boolean;
  /** Paired differences, index order. A report intervals these; this module does not classify. */
  readonly pairedDifferences: readonly number[];
}

/* -------------------------------------------------------------------------- *
 * Budgets and defaults
 * -------------------------------------------------------------------------- */

/** One step of the fidelity ladder: how many candidates survive, at what replication count. */
export interface Rung {
  readonly candidates: number;
  readonly replications: number;
}

/**
 * docs/06-parameterization-and-tuning.md § Successive halving on replication count, verbatim.
 *
 * | Round | Candidates | Replications each | Purpose |
 * |---|---|---|---|
 * | 1 | 100 | 10 | Eliminate obvious losers |
 * | 2 | 33 | 30 | Narrow |
 * | 3 | 11 | 100 | Refine |
 * | 4 | 3 | 300 | Final selection with paired-t |
 *
 * 3 990 replications in total. The shape is `η ≈ 3` on both axes, which is Hyperband's default
 * and the reason the table is the one the doc gives.
 *
 * **Rung 1's ten replications are below the fifty-replication floor** that
 * docs/03-traffic-and-statistics.md sets for a comparison, and that is not an oversight in either
 * document. Ten replications is what the doc calls "a loose absolute estimate", used here only to
 * *eliminate obvious losers* — a candidate whose mean is far outside the pack. Nothing is
 * declared better than anything at rung 1; the survivors are re-measured, and only rung 4 at
 * n = 300 is a budget a paired-t verdict may be quoted from. The rung a claim comes from is
 * carried on {@link Evaluation.replications} so a report cannot lose track of which is which.
 */
export const DOC_RUNGS: readonly Rung[] = Object.freeze([
  Object.freeze({ candidates: 100, replications: 10 }),
  Object.freeze({ candidates: 33, replications: 30 }),
  Object.freeze({ candidates: 11, replications: 100 }),
  Object.freeze({ candidates: 3, replications: 300 }),
]);

/**
 * How trace seeds move between rounds.
 *
 * - `'fixed'` — **the default.** One trace seed for the whole search. Every candidate ever
 *   evaluated is paired with every other, the successive-halving ladder becomes a genuine
 *   refinement (a survivor's 30 samples *begin with* the 10 it was promoted on, because the
 *   runner seeds a replication from its index), and the variance the optimizer fights is the
 *   99.69 %-reduced one. The overfitting this invites is real and is answered where the doc
 *   answers it: with a **disjoint held-out seed set** at validation time, not by shuffling seeds
 *   inside the search.
 * - `'per-round'` — a fresh seed per round, derived from the search seed. Keeps CRN *within* a
 *   round, gives it up between rounds, and with it the prefix property and any cross-round
 *   pairing. For a search that must not see one trace set more than once.
 */
export const SEED_POLICIES = ['fixed', 'per-round'] as const;

export type SeedPolicy = (typeof SEED_POLICIES)[number];

/**
 * The search's own tunables.
 *
 * **Every key here has a row in {@link SEARCH_PARAMETERS} and vice versa**, and `types.test.ts`
 * derives one set from the other rather than trusting a reader to keep two hand-written lists in
 * step. That test is the enforcement of CLAUDE.md invariant 8 at this level: an optimizer's own
 * knobs are as much a tunable as a dispatcher's, and a knob whose default lives only as a literal
 * in a function body has moved the hand-guessing one level up rather than removed it.
 *
 * A knob whose default is *derived* rather than constant is deliberately absent from both lists —
 * `population` (Hansen's `4 + ⌊3 ln n⌋`), `batchSize` (all candidates in one round) and
 * `probeReplications` (a fifth of the round's) have no constant to declare.
 */
export const SEARCH_DEFAULTS = Object.freeze({
  /**
   * Candidates a random search draws. 100, the width of docs/06's first rung.
   *
   * Random search is the honest baseline and it is only honest at an equal budget, so its default
   * is the number the ladder it is compared against starts with.
   */
  randomCandidates: 100,
  /**
   * Replications a fixed-fidelity search gives each candidate. 50, the doc's floor for anything
   * that will be compared against anything else.
   */
  replications: 50,
  /** Trace-seed policy. See {@link SEED_POLICIES}. */
  seedPolicy: 'fixed',
  /**
   * Initial step size for the continuous optimizer, as a fraction of each dimension's range.
   *
   * 0.3 of the box, not the textbook 0.2 — and deliberately far above any plausible plateau
   * width. The measured decision-flip threshold on `distanceTravelled` is 0.03 against a weight
   * range of `[0, 5]`, i.e. 0.6 % of the box, so an initial σ of 0.3 starts fifty times above the
   * plateau. Starting below it is the documented way to stall on generation one.
   */
  initialStepFraction: 0.3,
  /**
   * Factor σ is multiplied by when a whole generation comes back bit-identical.
   *
   * Two. A plateau has finite width and the step is doubled until it is crossed, which reaches
   * any width in a logarithmic number of generations; anything gentler spends generations
   * learning nothing, and anything harsher overshoots the basin the search had found.
   */
  plateauInflation: 2,
  /**
   * Generations without a strict improvement before the search restarts.
   *
   * Restart is the escape of last resort: it doubles the population and resets σ, which is
   * IPOP-CMA-ES. On this objective a run of identical generations is the *expected* symptom of a
   * wide plateau rather than of convergence, so the counter is deliberately short.
   */
  stagnationGenerations: 8,
  /** Cap on population doubling across restarts. */
  maxPopulation: 64,
  /**
   * Generations sep-CMA-ES runs. Budget is `generations × population × replications`.
   *
   * Twenty is a *shape*, not a measurement: at Hansen's λ for an eleven-weight space it lands the
   * total near docs/06's 3 990-replication ladder, which is what makes the three methods
   * comparable at equal budget in `comparison.test.ts`. It lives here rather than as a literal in
   * `sepCmaEs` because CLAUDE.md invariant 7 does not exempt the optimizer from its own rule.
   */
  generations: 20,
  /**
   * Smallest step the continuous optimizer will take in a coordinate, as a fraction of its range,
   * when no floor has been measured by `probeStepFloor`.
   *
   * 0.01 of `[0, 5]` is 0.05, above the 0.03 measured on `distanceTravelled`. It is a **fallback
   * and it is documented as a guess**: docs/05-roadmap.md says the floor is per-term and
   * per-building and "probe it; do not assume 0.03". Measure it and pass the result in.
   */
  stepFloorFraction: 0.01,
} as const);

/** Parameter kinds a generic optimizer understands. See docs/06-parameterization-and-tuning.md. */
export type SearchParameterType = 'continuous' | 'integer' | 'categorical' | 'boolean';

/**
 * A self-describing tunable, in the same shape as `RunnerParameterSpec` and core's
 * `DispatchParameterSpec`.
 *
 * Repeated rather than imported for the reason those two give, and with the same expiry: it is
 * the generic schema shape from docs/06, whose home is `tuning/` once that module owns it.
 */
export interface SearchParameterSpec {
  readonly id: string;
  readonly type: SearchParameterType;
  readonly range?: readonly [number, number] | undefined;
  readonly scale?: 'linear' | 'log' | undefined;
  readonly values?: readonly string[] | undefined;
  readonly default: number | string | boolean;
  readonly unit?: string | undefined;
  readonly description: string;
  readonly activeWhen?: Readonly<Record<string, readonly string[]>> | undefined;
}

/**
 * The id an `activeWhen` gate names when a knob belongs to one optimizer rather than to all three.
 *
 * It is deliberately **not** a row of {@link SEARCH_PARAMETERS} and has no entry in
 * {@link SEARCH_DEFAULTS}: choosing a method is choosing which of three exported functions to
 * call, not setting a value on one of them, and a default nobody reads is the dead-schema defect
 * this file has already shipped once. Its legal values are exactly {@link SEARCH_METHODS}, and
 * `types.test.ts` checks every gate against that list — an `activeWhen` referring to a knob or a
 * method that does not exist is a gate the optimizer silently reads as *not satisfied*
 * (docs/06 § `activeWhen`), which turns a live dimension into one nobody searches.
 */
export const SEARCH_METHOD_GATE = 'search.method';

/**
 * Every knob the search itself owns (CLAUDE.md invariant 8).
 *
 * A search is a tunable too, and a phase that tunes a dispatcher with an untunable, undeclared
 * optimizer has moved the hand-guessed constants one level up rather than removed them.
 *
 * **This list and {@link SEARCH_DEFAULTS} are one thing written twice**, and `types.test.ts` holds
 * them to it: the id set must be exactly `search.<key>` over `Object.keys(SEARCH_DEFAULTS)`, every
 * `default` must be the identical value, and every declared `range` must contain it. Before that
 * test the two lists were maintained by hand and had already drifted — `search.confidence` was
 * declared, exported, documented as *"the level the best-versus-runner-up paired difference is
 * reported at"*, and read by nothing anywhere in the repository, because `result.ts` deliberately
 * reports the paired differences and leaves the interval to `tuning/report`. It has been deleted
 * rather than wired: a knob that changes no behaviour is worse than a missing one, because an
 * optimizer will spend a dimension on it.
 */
export const SEARCH_PARAMETERS: readonly SearchParameterSpec[] = Object.freeze([
  {
    id: 'search.randomCandidates',
    type: 'integer',
    range: [1, 100_000],
    scale: 'log',
    default: SEARCH_DEFAULTS.randomCandidates,
    description:
      'Candidates a random search draws. Defaults to the width of the successive-halving ladder it is the baseline for, so the two are comparable at equal budget.',
    activeWhen: { [SEARCH_METHOD_GATE]: ['random'] },
  },
  {
    id: 'search.replications',
    type: 'integer',
    range: [1, 100_000],
    scale: 'log',
    default: SEARCH_DEFAULTS.replications,
    description:
      'Replications per candidate at a fixed fidelity. Fifty is the documented floor for a value that will be compared against another value. Inert under successive halving, which takes its fidelity from the rung table instead.',
    activeWhen: { [SEARCH_METHOD_GATE]: ['random', 'sep-cmaes'] },
  },
  {
    id: 'search.seedPolicy',
    type: 'categorical',
    values: [...SEED_POLICIES],
    default: SEARCH_DEFAULTS.seedPolicy,
    description:
      'fixed pairs every candidate in the search against every other and makes the fidelity ladder a refinement; per-round keeps CRN only within a round. Overfitting is answered by held-out seeds at validation, not by rotating seeds inside the search.',
  },
  {
    id: 'search.initialStepFraction',
    type: 'continuous',
    range: [0.001, 1],
    scale: 'log',
    default: SEARCH_DEFAULTS.initialStepFraction,
    description:
      'Initial sep-CMA-ES step size as a fraction of each range. Must start above the plateau width: the measured decision-flip threshold is 0.6 % of the weight box, and starting below it stalls on generation one.',
    activeWhen: { [SEARCH_METHOD_GATE]: ['sep-cmaes'] },
  },
  {
    id: 'search.plateauInflation',
    type: 'continuous',
    range: [1, 10],
    scale: 'linear',
    default: SEARCH_DEFAULTS.plateauInflation,
    description:
      'Factor sigma is multiplied by when a generation comes back bit-identical. 1 disables tie inflation, one of the two independent plateau escapes; measured on a 2-D plateau at cell width 2, tie inflation with restarts switched off still reaches the optimum (fn = 0), and switching both off leaves the search in its starting cell at fn = 72.',
    activeWhen: { [SEARCH_METHOD_GATE]: ['sep-cmaes'] },
  },
  {
    id: 'search.stagnationGenerations',
    type: 'integer',
    range: [0, 1_000],
    scale: 'linear',
    default: SEARCH_DEFAULTS.stagnationGenerations,
    description:
      'Generations without a strict improvement before an IPOP restart; 0 disables restarts, the other of the two independent plateau escapes. Short on purpose: on a piecewise-constant objective a run of identical generations means a wide plateau, not convergence.',
    activeWhen: { [SEARCH_METHOD_GATE]: ['sep-cmaes'] },
  },
  {
    id: 'search.maxPopulation',
    type: 'integer',
    range: [4, 4_096],
    scale: 'log',
    default: SEARCH_DEFAULTS.maxPopulation,
    description: 'Ceiling on the population doubling an IPOP restart applies.',
    activeWhen: { [SEARCH_METHOD_GATE]: ['sep-cmaes'] },
  },
  {
    id: 'search.generations',
    type: 'integer',
    range: [1, 100_000],
    scale: 'log',
    default: SEARCH_DEFAULTS.generations,
    description:
      'Generations sep-CMA-ES runs. Total budget is generations x population x replications, plus one round if the plateau width is probed.',
    activeWhen: { [SEARCH_METHOD_GATE]: ['sep-cmaes'] },
  },
  {
    id: 'search.stepFloorFraction',
    type: 'continuous',
    range: [0, 1],
    scale: 'log',
    default: SEARCH_DEFAULTS.stepFloorFraction,
    description:
      'Fallback smallest step per coordinate, as a fraction of its range, used when no plateau width has been measured. A guess, and documented as one: probeStepFloor measures the real per-term figure.',
    activeWhen: { [SEARCH_METHOD_GATE]: ['sep-cmaes'] },
  },
]);
