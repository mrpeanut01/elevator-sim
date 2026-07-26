/**
 * `tuning/search` — the optimizers, and this module's written report.
 *
 * Three methods over one shared contract: {@link randomSearch}, {@link successiveHalving} and
 * {@link sepCmaEs}. Each takes a space to sample from, an {@link Objective} to evaluate through,
 * and a seed; each returns a {@link SearchResult} carrying every evaluation it made, the budget it
 * spent, what it met of the piecewise-constant objective, and the runner-up its winner should be
 * compared against. `tuning/report` consumes that shape; `tuning/space` supplies the first
 * argument; {@link runnerObjective} supplies the second, out of the Phase 3 replication runner.
 *
 * ```ts
 * const result = await successiveHalving({
 *   space,                                    // tuning/space, sampling DISPATCH_PARAMETERS
 *   objective: runnerObjective({              // the Phase 3 runner, one experiment per round
 *     resources: await loadConfig('data'),
 *     buildingId: 'garden-apartments',
 *     traffic: { id: 'sparse', durationS: 900, demand: { arrivalRatePctPop5min: 8 } },
 *     materialize,                            // tuning/space, writing a candidate into a profile
 *   }),
 *   seed: 20260726,
 *   incumbent: shippedProfileAsCandidate,
 * });
 * ```
 *
 * ---
 *
 * # The report
 *
 * ## 1. Which method wins, measured
 *
 * Twenty seeds per row, equal budget (≈ 3 990 replications, docs/06's ladder), scored on the
 * **noiseless** objective at each method's winner — the truth the search never sees, so a method
 * cannot win by mis-measuring. Lower is better; `0` is the optimum.
 *
 * | objective | random | successive halving | sep-CMA-ES |
 * |---|---|---|---|
 * | plateaued 4-D, cells 1.0 of a box 10 wide | 4.700 | 4.150 | **0.500** |
 * | plateaued 11-D, cells 1.0 of the `[0, 5]` weight box | 16.050 | 15.150 | **2.800** |
 * | plateaued 11-D, cells 0.15 (the measured 0.03-scale) | 11.179 | 10.017 | **2.574** |
 * | smooth 11-D, `[0, 5]` | 9.042 | 8.941 | **2.624** |
 *
 * Head to head, over the same twenty seeds: **sep-CMA-ES beat random search in 19, 20, 20 and 19
 * of 20**, losing once on two of the four rows. **Successive halving never lost to random search
 * and beat it in 3, 5, 9 and 2 of 20.**
 *
 * So the honest ranking on this problem family is **sep-CMA-ES ≫ successive halving ≥ random
 * search**, and the interesting half of that is the second inequality, not the first.
 *
 * ### Why the ladder's margin is so small, and what it is actually buying
 *
 * Successive halving and random search draw from the same seeded stream here, so the ladder's
 * 100-candidate pool is a **superset** of random search's 79. Its entire advantage in the table is
 * that it examined 21 more candidates for the same money and did not lose the good one on the way
 * up — and **it never did lose it: rung 1 eliminated its pool's true best in 0 of 20 runs**, at
 * both an interaction noise of 0.4 and of 2.0.
 *
 * That zero is a fact about common random numbers, not about ten replications. Ten replications is
 * emphatically not enough to *estimate* an AWT — docs/03 measures a 12 % error at fifteen — but
 * the ladder does not estimate, it **ranks**, and under CRN the ranking is driven by the paired
 * difference, whose variance Phase 3 measured at 0.31 % of the unpaired one between near
 * neighbours. Successive halving without CRN would be a different algorithm with a different and
 * much worse table, which is why `round.ts` refuses to run without it rather than warning.
 *
 * ### Why the continuous optimizer wins by so much
 *
 * Dimension. Eleven weights is a large enough box that 79 or 100 uniform draws cover it very
 * thinly — the expected distance from the optimum to the nearest of 100 draws in an 11-cube barely
 * improves on the distance to a *single* draw. A method that **moves** compounds; a method that
 * samples does not. This is the regime docs/06 assigns CMA-ES to, and the measurement agrees with
 * the doc.
 *
 * It is worth being precise about what that does **not** say. Random search is not a formality
 * here and would win at least three arguments: it is the only method that cannot stall on a
 * plateau, it parallelizes perfectly, and its result is unconditionally interpretable — the winner
 * is a draw from a stated distribution rather than the endpoint of an adaptive process that has to
 * be trusted. Run it every time, as docs/06 says.
 *
 * ## 2. Plateaus — the design decision, and the evidence it was necessary
 *
 * The measured fact (docs/05-roadmap.md § Phase 7, from the Phase 3 gate): a weight perturbation
 * below the decision-flip threshold — measured at ≤ 0.03 on `distanceTravelled` — produces a
 * **bit-identical run**, 100/100 exactly-zero paired differences, `rho = 1`. The objective is
 * piecewise constant, not merely noisy, and *finite differences are undefined on a plateau*.
 *
 * **Detection.** Exact, free, and already paid for: two candidates are on the same plateau iff
 * their per-replication sample vectors are elementwise equal. No tolerance — below the threshold
 * the difference is exactly zero, and above it the difference is a real effect that may be far
 * smaller than any epsilon a reader would pick. An epsilon here would quietly redefine "no effect"
 * as "an effect I decided not to look at". {@link SearchRound.distinctOutcomes} is this count, on
 * every round every method runs.
 *
 * **Escape, in three layers, in {@link sepCmaEs}:**
 *
 * | layer | trigger | effect |
 * |---|---|---|
 * | step floor | always | no coordinate samples below its plateau width |
 * | tie inflation | a generation with `distinctOutcomes === 1` | σ doubles, **and the generation's ranking is discarded** |
 * | IPOP restart | eight generations without a strict improvement | fresh mean, σ reset, population doubled |
 *
 * Discarding the update matters as much as inflating σ, and is the less obvious half. On a flat
 * generation every offspring scores identically, so the ordering that drives recombination is
 * arbitrary; applying it moves the mean for no reason, and *that random walk is what makes a
 * stalled CMA-ES look like it is still working*. Plain CSA makes this worse rather than better: it
 * is designed to hold σ constant under neutral selection, so a textbook CMA-ES on a plateau pins
 * its step size at exactly the value that cannot escape and then reports the point it started from.
 *
 * **The evidence.** `cmaes.test.ts` runs the same optimizer with `plateauInflation: 1` and restarts
 * off — textbook sep-CMA-ES — as a **control that must fail**, and it does: 35 of 40 generations
 * flat, the mean never leaves the starting cell, and a final objective of 72 against the escaped
 * run's 0. Without a failing control the passing test would be evidence of nothing.
 *
 * **The width is measured, not assumed.** docs/05-roadmap.md: *"Step size has a per-term,
 * per-building floor. Probe it; do not assume 0.03."* {@link probeStepFloor} probes it
 * geometrically, every coordinate and every doubling inside **one** CRN round, and reports a
 * dimension whose plateau it could not cross as a **lower bound** rather than as a width — because
 * "nothing I tried changed the run" and "this knob does nothing" are different findings and the
 * second one costs 50–200 replications an evaluation to act on.
 *
 * ### The plateau is not a fixture artefact
 *
 * `objective.test.ts` measures it through the real simulator: `idle.repositionThresholdS` at 5, 6,
 * 7 and 8 seconds on Garden Apartments produces **one** distinct outcome across four arms and six
 * replications. Two thirds of that parameter's box is a single point of the objective.
 *
 * ## 3. The known-answer test
 *
 * docs/06 leaves `predictive-balanced`'s `idle.repositionThresholdS: 8` as shipped on purpose, so
 * that this phase has ground truth: Phase 5's sweep at n = 300 found an **interior optimum at 2 s**,
 * worth −1.110 s [−1.548, −0.671], with the curve turning back up below it as repositioning churn
 * sets in.
 *
 * Handed a one-dimensional box on `[0, 10]`, a materializer, and 390 replications — and told
 * nothing about elevators, deadbands or the number 2 — random search through {@link runnerObjective}
 * returns **1.48 s**, with the ranking `1.48 < 2.72 ≈ 2.67 < 0.43 < 8.00`: the interior optimum,
 * *and* the turn back upward below it. Nine of thirteen arms, every one of them above 4 s, come
 * back bit-identical to the shipped 8 s.
 *
 * And it is **not reported as a win.** The paired difference at n = 30 is −0.598 s
 * [−1.991, +0.795] — an interval containing zero. The search located the region; it did not
 * resolve the effect, and `benchmark/verdict.ts` would call this INDISTINGUISHABLE. Phase 5 needed
 * n = 300 for an interval that excludes zero. That gap between "the optimizer found it" and "the
 * statistics may say so" is the whole of CLAUDE.md § Statistical discipline, and this module keeps
 * the two apart: it reports {@link SearchResult.runnerUp} with the paired differences and refuses
 * to classify them.
 *
 * ## 4. What this module deliberately does not do
 *
 * - **It does not classify a verdict.** `benchmark/verdict.ts` owns the vocabulary — `BETTER`,
 *   `INDISTINGUISHABLE`, `IDENTICAL`, `UNQUOTABLE` — and a search that marked its own homework
 *   would be the failure CLAUDE.md names. `SearchResult` carries the paired differences; something
 *   else decides what they are called.
 * - **It does not implement a second replication runner, seed derivation or stopping rule.** One
 *   round is one `ExperimentSpec` at one seed; `runner/crn.ts` derives the replication seeds; there
 *   is no stopping rule underneath a rung, because a sequential rule would give two candidates in
 *   the same rung different replication counts and *un-pair them*.
 * - **It does not know what a parameter is.** Sampling `DISPATCH_PARAMETERS`, honouring
 *   `activeWhen`, and writing a candidate back through a dotted `id` are `tuning/space`'s, injected
 *   as {@link CandidateSampler} and {@link RunnerObjectiveOptions.materialize}. That is the contract
 *   docs/06 § The parameter schema exists to create, and this module is the proof it holds: there
 *   is not one elevator-specific line in `randomSearch.ts`, `successiveHalving.ts` or `cmaes.ts`.
 * - **It does not hold out seeds.** Tuning on one seed set and validating on a disjoint one is the
 *   guardrail against overfitting a weight vector to particular passenger traces, and it is a
 *   property of how a study is *run* rather than of the search: give the validation run a different
 *   `seed`. The search maximizes pairing within itself on purpose ({@link SEED_POLICIES}), which
 *   makes the held-out set more necessary, not less.
 * - **It does not implement OCBA.** docs/06 lists it for final selection among finalists, and the
 *   ladder's top rung is where it would go — allocating rung 4's 900 replications unevenly toward
 *   the pair whose ranking is least certain, rather than 300 each. Uniform allocation is the
 *   conservative choice and is what ships; the extension point is {@link Rung}.
 *
 * ## 5. How this joins `tuning/space` and `tuning/report`
 *
 * Both neighbours are reached through **ports declared here in their minimal structural form**,
 * the way `runner/types.ts` declares `StoppingRule` — so neither module imports the other and each
 * stays testable alone. What that costs is three thin adapters, and they belong to whoever owns
 * the wiring, not to any of the three modules:
 *
 * | port | satisfied by | adapter |
 * |---|---|---|
 * | {@link CandidateSampler} | `space.sampleCandidate(space, rng, options)` | `{ sample: (rng) => sampleCandidate(space, rng, options) }` — one line; the candidate type `C` is `space`'s `Candidate` |
 * | {@link RunnerObjectiveOptions.materialize} | `space.candidateProfile(space, candidate, { id, base })` | one line; it already returns a `DispatcherProfile` validated by `core`'s own parser |
 * | {@link VectorSpace} — needed by {@link sepCmaEs} only | *nothing yet* | the one real gap: `space` exposes typed rows and a `Candidate ⇄ ProfilePatch` map, but no `Candidate ⇄ number[]` embedding. Filter `space.parameters` to the numeric rows, take their `range` as {@link SearchDimension}s, round the integers on the way back, and hold the categoricals at the incumbent |
 * | `report.CandidateEvaluation` | {@link RunnerObjectiveOptions.onExperiment} | a report needs whole `ReplicationObservation`s and their **seeds**, not the one scalar an {@link Evaluation} carries. They are already in the `ExperimentResult` the hook hands over: `cell.replications.map((r) => observationOf(r.summary))`, joined on `dispatcherArmId === candidate.id` |
 *
 * The randomness is *not* an adapter and must not become one: `searchRng` and `space`'s
 * `policyNoiseStream` are the same stream of the same `StreamSet`, and `round.test.ts` pins that
 * they agree. Two halves of one search drawing from different sequences while both claimed
 * reproducibility from one seed is precisely the kind of defect this repository keeps finding
 * after the fact.
 */

/* -------------------------------------------------------------------------- *
 * Vocabulary, ports and tunables (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

export {
  DOC_RUNGS,
  SEARCH_DEFAULTS,
  SEARCH_METHODS,
  SEARCH_PARAMETERS,
  SEED_POLICIES,
  SearchError,
} from './types.js';

export type {
  Candidate,
  CandidateOutcome,
  CandidateSampler,
  Evaluation,
  Objective,
  ObjectiveRequest,
  PlateauReport,
  Rung,
  RunnerUpComparison,
  SearchDimension,
  SearchMethodId,
  SearchParameterSpec,
  SearchParameterType,
  SearchResult,
  SearchRound,
  SeedPolicy,
  TrajectoryPoint,
  VectorSpace,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The round: seeds, common random numbers, ranking
 * -------------------------------------------------------------------------- */

export {
  SEARCH_STREAM,
  compareEvaluations,
  countDistinctOutcomes,
  normalizeSearchSeed,
  outcomeKey,
  rankEvaluations,
  roundSeed,
  runRound,
  searchRng,
  traceSeedFor,
} from './round.js';

/* -------------------------------------------------------------------------- *
 * Plateaus
 * -------------------------------------------------------------------------- */

export { PlateauTally, isFlat, plateauClasses, probeStepFloor, sameOutcome } from './plateau.js';

export type { DimensionStepFloor, StepFloorProbe, StepFloorProbeOptions } from './plateau.js';

/* -------------------------------------------------------------------------- *
 * Result assembly
 * -------------------------------------------------------------------------- */

export { SearchRecorder, runnerUpOf } from './result.js';

/* -------------------------------------------------------------------------- *
 * The optimizers
 * -------------------------------------------------------------------------- */

export { randomSearch } from './randomSearch.js';

export type { RandomSearchOptions } from './randomSearch.js';

export { assertLadder, plannedBudget, successiveHalving } from './successiveHalving.js';

export type { RungResult, SuccessiveHalvingOptions, SuccessiveHalvingResult } from './successiveHalving.js';

export { sepCmaEs } from './cmaes.js';

export type { SepCmaEsOptions } from './cmaes.js';

/* -------------------------------------------------------------------------- *
 * The seam to the Phase 3 replication runner
 * -------------------------------------------------------------------------- */

export { outcomeOf, roundExperimentSpec, runnerObjective } from './objective.js';

export type { RunnerObjectiveOptions } from './objective.js';
