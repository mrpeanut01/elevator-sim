/**
 * The continuous optimizer: **separable CMA-ES with explicit plateau escape**.
 *
 * ## Why sep-CMA-ES rather than full CMA-ES — a documented alternative, and the better fit
 *
 * docs/06-parameterization-and-tuning.md names CMA-ES for "continuous weight vectors with a
 * larger budget". This module implements the **separable** variant (Ros & Hansen 2008): the
 * covariance matrix is constrained to a diagonal, so it adapts one variance per coordinate rather
 * than a full rotation. Three reasons, in order of how much they matter here:
 *
 * 1. **What needs adapting on this problem is per-coordinate scale, and that is exactly what a
 *    diagonal adapts.** docs/05-roadmap.md § Phase 7: *"Step size has a per-term, per-building
 *    floor. Probe it; do not assume 0.03."* The plateau width differs term by term — that is a
 *    measured, documented fact — and it is a statement about coordinate scales, not about
 *    correlations between them. A diagonal model learns precisely the thing the objective is
 *    known to have.
 * 2. **A rotation cannot be learned from a piecewise-constant objective anyway.** Full CMA-ES
 *    learns correlations from the *ordering* of offspring within a generation. On a plateau the
 *    ordering carries no information — every offspring scores identically — so the rank-µ update
 *    that a full covariance depends on is being fed noise on exactly the generations this
 *    objective produces most often. Learning `n(n+1)/2` parameters from that is worse than
 *    learning `n`.
 * 3. It removes the eigendecomposition, which is `O(n³)` and the part of CMA-ES most likely to be
 *    subtly wrong in a from-scratch implementation. This project may not add a dependency, so
 *    "subtly wrong" is a real risk rather than a theoretical one.
 *
 * The step-size control (CSA), the evolution paths, the rank-1 and rank-µ updates and the
 * recombination weights are Hansen's, unchanged; only the covariance model is diagonal, with
 * Ros & Hansen's `(n + 2) / 3` learning-rate speed-up that the separable variant permits.
 *
 * ## Plateau handling — the part that is not textbook
 *
 * Plain CMA-ES **stalls** on this objective, and it does so quietly, which is the worst way. When
 * every offspring of a generation lands in the same cell of the decision partition they all score
 * identically; the ranking that drives recombination is then arbitrary; the mean random-walks;
 * and step-size control makes it worse rather than better — CSA is *designed* to hold σ constant
 * under neutral selection, so a search on a plateau keeps its step size at exactly the value that
 * cannot escape. It will report the point it started from and look converged doing it.
 *
 * Three mechanisms, layered, each with its own test:
 *
 * | mechanism | trigger | effect |
 * |---|---|---|
 * | **step floor** | always | no coordinate's sampling std falls below its plateau width, measured by `probeStepFloor` or supplied |
 * | **tie inflation** | a generation with `distinctOutcomes === 1` | σ × `plateauInflation`, and the generation's uninformative ranking is **discarded** rather than applied |
 * | **IPOP restart** | `stagnationGenerations` without a strict improvement, or σ at the box | fresh mean, σ reset, population doubled |
 *
 * The second is the load-bearing one and the least obvious. Discarding the update matters as much
 * as inflating σ: applying a recombination over an arbitrary ordering moves the mean for no
 * reason, and the resulting random walk is what makes a stalled CMA-ES look like it is still
 * working. `cmaes.test.ts` runs the same optimizer with `plateauInflation: 1` as a control and
 * asserts it does **not** escape, so the mechanism is shown to be load-bearing rather than
 * asserted to be.
 *
 * ## Coordinates
 *
 * Internally the search runs in the **unit box** `[0, 1]^n`, mapped to each dimension's declared
 * range on the way out. So σ is dimensionless and comparable across parameters whose ranges span
 * orders of magnitude — a weight in `[0, 5]` and a hysteresis in `[0, 30]` — and a step floor is
 * expressible as a fraction of a range without knowing what the range measures. Out-of-box
 * proposals are clamped, and the update uses the **clamped** point, so the distribution tracks
 * configurations that were actually evaluated rather than ones that were merely proposed.
 */

import type { Rng } from '@elevator-sim/core';

import { probeStepFloor } from './plateau.js';
import { SearchRecorder } from './result.js';
import { normalizeSearchSeed, rankEvaluations, runRound, searchRng, traceSeedFor } from './round.js';
import {
  SEARCH_DEFAULTS,
  SearchError,
  type Candidate,
  type Evaluation,
  type Objective,
  type SearchResult,
  type SeedPolicy,
  type VectorSpace,
} from './types.js';

export interface SepCmaEsOptions<C> {
  readonly space: VectorSpace<C>;
  readonly objective: Objective<C>;
  readonly seed: number | string | bigint;
  /** Generations to run. Budget is `generations × population × replications`, plus any probe. */
  readonly generations?: number | undefined;
  readonly replications?: number | undefined;
  /** Population λ. Defaults to Hansen's `4 + ⌊3 ln n⌋`. */
  readonly population?: number | undefined;
  /** Initial mean. Defaults to a draw from the space. */
  readonly start?: C | undefined;
  /** Initial σ as a fraction of each range. See {@link SEARCH_DEFAULTS.initialStepFraction}. */
  readonly initialStepFraction?: number | undefined;
  /** Factor σ is multiplied by on a bit-identical generation. `1` disables tie inflation. */
  readonly plateauInflation?: number | undefined;
  /** Generations without strict improvement before an IPOP restart. `0` disables restarts. */
  readonly stagnationGenerations?: number | undefined;
  readonly maxPopulation?: number | undefined;
  /**
   * Per-coordinate plateau width, **as a fraction of that dimension's range**.
   *
   * Supply what `probeStepFloor` measured. Absent, {@link probePlateau} can measure it, and
   * failing both {@link SEARCH_DEFAULTS.stepFloorFraction} is used as a documented guess.
   */
  readonly stepFloor?: readonly number[] | undefined;
  readonly stepFloorFraction?: number | undefined;
  /** Spend one round measuring the plateau width before generation 1. */
  readonly probePlateau?: boolean | undefined;
  readonly probeReplications?: number | undefined;
  /** Evaluated alongside generation 1 so the winner has something to be compared against. */
  readonly incumbent?: C | undefined;
  readonly seedPolicy?: SeedPolicy | undefined;
  readonly idPrefix?: string | undefined;
}

/** Strategy parameters for one population size. Hansen's defaults, sep-CMA's learning rates. */
interface Strategy {
  readonly lambda: number;
  readonly mu: number;
  readonly weights: readonly number[];
  readonly muEff: number;
  readonly cSigma: number;
  readonly dSigma: number;
  readonly cc: number;
  readonly c1: number;
  readonly cMu: number;
  readonly chiN: number;
}

function strategyFor(n: number, lambda: number): Strategy {
  const mu = Math.max(1, Math.floor(lambda / 2));
  const raw: number[] = [];
  for (let i = 1; i <= mu; i += 1) raw.push(Math.log(mu + 0.5) - Math.log(i));
  const total = raw.reduce((sum, value) => sum + value, 0);
  const weights = raw.map((value) => value / total);
  const muEff = 1 / weights.reduce((sum, value) => sum + value * value, 0);

  const cSigma = (muEff + 2) / (n + muEff + 3);
  const dSigma = 1 + 2 * Math.max(0, Math.sqrt((muEff - 1) / (n + 1)) - 1) + cSigma;
  const cc = 4 / (n + 4);
  // Ros & Hansen 2008: the separable model may learn (n + 2) / 3 times faster than the full one.
  const speedUp = (n + 2) / 3;
  const c1 = Math.min(1, (2 / ((n + 1.3) ** 2 + muEff)) * speedUp);
  const cMu = Math.min(
    1 - c1,
    (2 * (muEff - 2 + 1 / muEff)) / ((n + 2) ** 2 + muEff) * speedUp,
  );
  const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  return { lambda, mu, weights, muEff, cSigma, dSigma, cc, c1, cMu, chiN };
}

/** State that a restart replaces wholesale. */
interface Distribution {
  strategy: Strategy;
  mean: number[];
  sigma: number;
  variance: number[];
  pSigma: number[];
  pC: number[];
  generationsInRun: number;
}

/**
 * Run sep-CMA-ES with plateau escape.
 *
 * @throws SearchError for a space with no dimensions, a non-positive budget, or an objective that
 *   breaks the round contract.
 */
export async function sepCmaEs<C>(options: SepCmaEsOptions<C>): Promise<SearchResult<C>> {
  const { space, objective } = options;
  const n = space.dimensions.length;
  if (n === 0) throw new SearchError('sepCmaEs: the space has no dimensions to search.', 'space');

  const generations = options.generations ?? 20;
  const replications = options.replications ?? SEARCH_DEFAULTS.replications;
  const sigma0 = options.initialStepFraction ?? SEARCH_DEFAULTS.initialStepFraction;
  const inflation = options.plateauInflation ?? SEARCH_DEFAULTS.plateauInflation;
  const stagnation = options.stagnationGenerations ?? SEARCH_DEFAULTS.stagnationGenerations;
  const maxPopulation = options.maxPopulation ?? SEARCH_DEFAULTS.maxPopulation;
  const seedPolicy: SeedPolicy = options.seedPolicy ?? SEARCH_DEFAULTS.seedPolicy;
  const prefix = options.idPrefix ?? 'cma';

  if (!Number.isSafeInteger(generations) || generations < 1) {
    throw new SearchError(`sepCmaEs: generations must be a positive integer; received ${generations}.`, 'generations');
  }
  if (!(inflation >= 1)) {
    throw new SearchError(
      `sepCmaEs: plateauInflation must be at least 1; received ${inflation}. A value below 1 would shrink the step on the generations that prove it is already too small.`,
      'plateauInflation',
    );
  }

  const random = searchRng(options.seed);
  const recorder = new SearchRecorder<C>();
  const toUnit = (vector: readonly number[]): number[] =>
    space.dimensions.map((dimension, index) => {
      const [min, max] = dimension.range;
      const span = max - min;
      return span === 0 ? 0 : clamp(((vector[index] ?? min) - min) / span, 0, 1);
    });
  const fromUnit = (unit: readonly number[]): number[] =>
    space.dimensions.map((dimension, index) => {
      const [min, max] = dimension.range;
      return min + clamp(unit[index] ?? 0, 0, 1) * (max - min);
    });

  let round = 0;

  /* --- the step floor: measured, supplied, or a documented guess ------------ */
  let stepFloor: number[];
  let floorMeasured = false;
  const startUnit = toUnit(space.encode(options.start ?? space.sample(random)));
  if (options.stepFloor !== undefined) {
    stepFloor = space.dimensions.map((_, index) => Math.max(0, options.stepFloor?.[index] ?? 0));
  } else if (options.probePlateau === true) {
    const probe = await probeStepFloor({
      space,
      objective,
      base: fromUnit(startUnit),
      seed: traceSeedFor(seedPolicy, options.seed, round),
      round,
      replications: options.probeReplications ?? Math.max(2, Math.floor(replications / 5)),
    });
    recorder.add(probe.round);
    round += 1;
    stepFloor = probe.dimensions.map((entry, index) => {
      const dimension = space.dimensions[index];
      const span = dimension === undefined ? 1 : dimension.range[1] - dimension.range[0];
      return span === 0 ? 0 : entry.width / span;
    });
    floorMeasured = probe.dimensions.some((entry) => entry.measured);
    recorder.plateau.measured(probe.dimensions.map((entry) => entry.width));
    recorder.note(
      `Plateau widths probed at the start point: ${probe.dimensions
        .map((entry) => `${entry.id}=${entry.width.toPrecision(3)}${entry.measured ? '' : ' (lower bound; nothing changed the run)'}`)
        .join(', ')}.`,
    );
  } else {
    const fraction = options.stepFloorFraction ?? SEARCH_DEFAULTS.stepFloorFraction;
    stepFloor = space.dimensions.map(() => fraction);
    recorder.note(
      `Step floor assumed at ${fraction} of each range rather than measured. docs/05-roadmap.md § Phase 7: the plateau width is per-term and per-building — pass probePlateau to measure it.`,
    );
  }
  if (!floorMeasured && options.stepFloor === undefined && options.probePlateau === true) {
    recorder.note(
      'No probed step changed the run in any coordinate, so every step floor below is a lower bound rather than a width. Either the start point is inert on every dimension, or the probe was narrower than the plateau.',
    );
  }
  // The floor on σ itself exists only to stop a vanishing σ from driving a coordinate's variance
  // to infinity through `floor / σ`. It is the smallest *positive* plateau width, never the
  // initial step: flooring σ at σ₀ would forbid the search from ever refining below where it
  // started, which is convergence disabled rather than a plateau escaped.
  const positiveFloors = stepFloor.filter((value) => value > 0);
  const sigmaMin = positiveFloors.length > 0 ? Math.min(...positiveFloors) : 1e-9;

  /* --- the distribution ---------------------------------------------------- */
  const initialLambda = options.population ?? 4 + Math.floor(3 * Math.log(n));
  let dist: Distribution = {
    strategy: strategyFor(n, Math.max(2, initialLambda)),
    mean: [...startUnit],
    sigma: sigma0,
    variance: new Array<number>(n).fill(1),
    pSigma: new Array<number>(n).fill(0),
    pC: new Array<number>(n).fill(0),
    generationsInRun: 0,
  };
  applyStepFloor(dist, stepFloor, sigmaMin);

  let bestScore = Number.POSITIVE_INFINITY;
  let sinceImprovement = 0;
  let restarts = 0;

  for (let generation = 0; generation < generations; generation += 1) {
    const { strategy } = dist;
    const proposals: number[][] = [];
    const candidates: Candidate<C>[] = [];

    if (generation === 0 && options.incumbent !== undefined) {
      candidates.push({ id: 'incumbent', value: options.incumbent, origin: 'incumbent' });
    }
    for (let k = 0; k < strategy.lambda; k += 1) {
      const proposal: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const std = dist.sigma * Math.sqrt(dist.variance[i] ?? 1);
        proposal.push(clamp((dist.mean[i] ?? 0) + std * random.normal(0, 1), 0, 1));
      }
      proposals.push(proposal);
      candidates.push({
        id: `${prefix}-g${String(generation).padStart(2, '0')}-${String(k).padStart(2, '0')}`,
        value: space.decode(fromUnit(proposal)),
        origin: `generation ${generation + 1}`,
      });
    }

    const executed = await runRound(objective, {
      candidates,
      replications,
      seed: traceSeedFor(seedPolicy, options.seed, round),
      round,
      label: `generation ${generation + 1} (λ=${strategy.lambda} × ${replications})`,
    });
    recorder.add(executed);
    round += 1;

    const offspring = executed.evaluations.filter((evaluation) => evaluation.candidate.id !== 'incumbent');
    const distinct = countDistinct(offspring);
    const roundBest = rankEvaluations(offspring)[0];
    const improved = roundBest !== undefined && roundBest.score < bestScore;
    if (improved && roundBest !== undefined) bestScore = roundBest.score;

    /* --- plateau: the generation carried no direction --------------------- */
    if (distinct <= 1 && offspring.length > 1) {
      sinceImprovement += 1;
      if (inflation > 1) {
        dist.sigma = Math.min(dist.sigma * inflation, 1);
        recorder.plateau.escaped();
      }
      applyStepFloor(dist, stepFloor, sigmaMin);
      dist.generationsInRun += 1;
      if (stagnation > 0 && sinceImprovement >= stagnation) {
        dist = restart(dist, random, space, toUnit, sigma0, maxPopulation, n);
        applyStepFloor(dist, stepFloor, sigmaMin);
        recorder.plateau.escaped();
        sinceImprovement = 0;
        restarts += 1;
      }
      continue;
    }

    sinceImprovement = improved ? 0 : sinceImprovement + 1;
    updateDistribution(dist, offspring, proposals, n);
    applyStepFloor(dist, stepFloor, sigmaMin);

    if (stagnation > 0 && (sinceImprovement >= stagnation || dist.sigma >= 1)) {
      dist = restart(dist, random, space, toUnit, sigma0, maxPopulation, n);
      applyStepFloor(dist, stepFloor, sigmaMin);
      recorder.plateau.escaped();
      sinceImprovement = 0;
      restarts += 1;
    }
  }

  const report = recorder.plateau.report();
  if (report.flatRounds > 0) {
    recorder.note(
      `${report.flatRounds} of ${recorder.rounds.length} generations came back bit-identical across every offspring. Those generations carried no direction: their ranking was discarded rather than applied, and the step was ${inflation > 1 ? `inflated ×${inflation}` : 'left alone (tie inflation disabled)'}.`,
    );
  }
  if (restarts > 0) recorder.note(`${restarts} IPOP restart(s).`);

  return recorder.finish('sep-cmaes', normalizeSearchSeed(options.seed), traceSeedFor(seedPolicy, options.seed, 0));
}

/* -------------------------------------------------------------------------- *
 * Internals
 * -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function countDistinct<C>(evaluations: readonly Evaluation<C>[]): number {
  const keys = new Set<string>();
  for (const evaluation of evaluations) keys.add(evaluation.samples.join(''));
  return keys.size;
}

/**
 * No coordinate samples below its plateau width.
 *
 * Expressed on the covariance rather than on σ, which is the whole reason for a *separable*
 * model: a term whose decisions flip only at 0.05 gets its own floor without dragging every other
 * coordinate's step up with it.
 */
function applyStepFloor(dist: Distribution, stepFloor: readonly number[], sigmaMin: number): void {
  dist.sigma = clamp(dist.sigma, Math.max(sigmaMin, 1e-12), 1);
  for (let i = 0; i < dist.variance.length; i += 1) {
    const floor = stepFloor[i] ?? 0;
    const minimumVariance = floor > 0 ? (floor / dist.sigma) ** 2 : 0;
    dist.variance[i] = clamp(Math.max(dist.variance[i] ?? 1, minimumVariance), 1e-12, 1e12);
  }
}

/** One CSA + rank-1 + rank-µ update, on the **clamped** offspring that were actually evaluated. */
function updateDistribution<C>(
  dist: Distribution,
  offspring: readonly Evaluation<C>[],
  proposals: readonly number[][],
  n: number,
): void {
  const { strategy } = dist;
  const byId = new Map<string, number>();
  for (const [index, evaluation] of offspring.entries()) byId.set(evaluation.candidate.id, index);
  const ranked = rankEvaluations(offspring);

  // proposals[] is in generation order; offspring[] is too, because runRound preserves the
  // request's candidate order. Map a ranked evaluation back to the point that produced it.
  const indexOf = (evaluation: Evaluation<C>): number => byId.get(evaluation.candidate.id) ?? 0;

  const oldMean = [...dist.mean];
  const newMean = new Array<number>(n).fill(0);
  for (let j = 0; j < strategy.mu && j < ranked.length; j += 1) {
    const weight = strategy.weights[j] ?? 0;
    const point = proposals[indexOf(ranked[j] as Evaluation<C>)] ?? oldMean;
    for (let i = 0; i < n; i += 1) newMean[i] = (newMean[i] ?? 0) + weight * (point[i] ?? 0);
  }
  dist.mean = newMean;

  const yW = new Array<number>(n);
  for (let i = 0; i < n; i += 1) yW[i] = ((newMean[i] ?? 0) - (oldMean[i] ?? 0)) / dist.sigma;

  const cSigma = strategy.cSigma;
  const factor = Math.sqrt(cSigma * (2 - cSigma) * strategy.muEff);
  for (let i = 0; i < n; i += 1) {
    const invSqrtC = 1 / Math.sqrt(dist.variance[i] ?? 1);
    dist.pSigma[i] = (1 - cSigma) * (dist.pSigma[i] ?? 0) + factor * invSqrtC * (yW[i] ?? 0);
  }

  dist.generationsInRun += 1;
  const norm = Math.hypot(...dist.pSigma);
  const denominator = Math.sqrt(1 - (1 - cSigma) ** (2 * dist.generationsInRun));
  const hSigma = norm / denominator < (1.4 + 2 / (n + 1)) * strategy.chiN ? 1 : 0;

  const cc = strategy.cc;
  const pcFactor = hSigma * Math.sqrt(cc * (2 - cc) * strategy.muEff);
  for (let i = 0; i < n; i += 1) {
    dist.pC[i] = (1 - cc) * (dist.pC[i] ?? 0) + pcFactor * (yW[i] ?? 0);
  }

  const { c1, cMu } = strategy;
  const correction = (1 - hSigma) * cc * (2 - cc);
  for (let i = 0; i < n; i += 1) {
    let rankMu = 0;
    for (let j = 0; j < strategy.mu && j < ranked.length; j += 1) {
      const weight = strategy.weights[j] ?? 0;
      const point = proposals[indexOf(ranked[j] as Evaluation<C>)] ?? oldMean;
      const y = ((point[i] ?? 0) - (oldMean[i] ?? 0)) / dist.sigma;
      rankMu += weight * y * y;
    }
    const current = dist.variance[i] ?? 1;
    dist.variance[i] =
      (1 - c1 - cMu) * current + c1 * ((dist.pC[i] ?? 0) ** 2 + correction * current) + cMu * rankMu;
  }

  dist.sigma *= Math.exp((cSigma / strategy.dSigma) * (norm / strategy.chiN - 1));
  if (!Number.isFinite(dist.sigma) || dist.sigma <= 0) dist.sigma = 1e-12;
}

/** IPOP: a fresh mean, σ reset, population doubled. The escape of last resort. */
function restart<C>(
  dist: Distribution,
  random: Rng,
  space: VectorSpace<C>,
  toUnit: (vector: readonly number[]) => number[],
  sigma0: number,
  maxPopulation: number,
  n: number,
): Distribution {
  const lambda = Math.min(dist.strategy.lambda * 2, maxPopulation);
  return {
    strategy: strategyFor(n, lambda),
    mean: toUnit(space.encode(space.sample(random))),
    sigma: sigma0,
    variance: new Array<number>(n).fill(1),
    pSigma: new Array<number>(n).fill(0),
    pC: new Array<number>(n).fill(0),
    generationsInRun: 0,
  };
}
