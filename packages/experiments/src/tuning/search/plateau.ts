/**
 * Plateaus: detecting them, measuring them, and reporting what a search did about them.
 *
 * ## The fact this module exists for
 *
 * > *A weight perturbation below the threshold that flips a dispatch decision produces a
 * > **bit-identical run**: measured at ≤ 0.03 on `distanceTravelled`, 100/100 exactly-zero paired
 * > differences, `rho = 1`.* — docs/05-roadmap.md § Phase 7
 *
 * The objective is constant on cells of a partition of weight space, and *exactly* constant, not
 * approximately. Two consequences, and they are the two halves of this file:
 *
 * - **Detection is free and exact.** Two candidates are on the same plateau iff their
 *   per-replication sample vectors are elementwise equal. No tolerance, no threshold, no extra
 *   replications — the information is already in a round that was going to be run anyway. That is
 *   {@link isFlat} and `round.ts`'s `outcomeKey`.
 * - **The width is a measurement, not a constant.** docs/05-roadmap.md: *"Step size has a
 *   per-term, per-building floor. Probe it; do not assume 0.03."* {@link probeStepFloor} probes
 *   it, in **one round**, geometrically, under the same common random numbers as everything else.
 *
 * ## Why a tolerance would be wrong
 *
 * The tempting version of this file compares means with an epsilon. It is wrong in both
 * directions on this objective. Below the flip threshold the difference is exactly zero, so any
 * epsilon is unnecessary; above it the difference is a genuine effect that may still be far
 * smaller than any epsilon a reader would pick, and suppressing it would discard the very signal
 * the search is chasing — Phase 3 resolves 0.20 s, 1.3 % of AWT, at n = 100. An epsilon would
 * quietly redefine "no effect" as "an effect I decided not to look at".
 */

import { runRound, outcomeKey } from './round.js';
import {
  SearchError,
  type Candidate,
  type Evaluation,
  type Objective,
  type PlateauReport,
  type SearchRound,
  type VectorSpace,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Detection
 * -------------------------------------------------------------------------- */

/** Two evaluations produced bit-identical runs: the same point of the objective, twice. */
export function sameOutcome<C>(a: Evaluation<C>, b: Evaluation<C>): boolean {
  if (a.samples.length !== b.samples.length) return false;
  for (let i = 0; i < a.samples.length; i += 1) {
    if (a.samples[i] !== b.samples[i]) return false;
  }
  return true;
}

/**
 * Every candidate in the round produced a bit-identical run.
 *
 * The round told the optimizer *nothing about direction*. Not "the direction was wrong" — there
 * was no direction. Anything gradient-ish stalls here, and a method that reads this as
 * convergence will report the point it started from as the optimum.
 */
export function isFlat<C>(round: SearchRound<C>): boolean {
  return round.evaluations.length > 0 && round.distinctOutcomes === 1;
}

/** Evaluations grouped by plateau class, groups in first-appearance order. */
export function plateauClasses<C>(
  evaluations: readonly Evaluation<C>[],
): readonly (readonly Evaluation<C>[])[] {
  const groups = new Map<string, Evaluation<C>[]>();
  for (const evaluation of evaluations) {
    const key = outcomeKey(evaluation.samples);
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, [evaluation]);
    else existing.push(evaluation);
  }
  return [...groups.values()];
}

/**
 * Running tally of what a search met, folded round by round.
 *
 * Mutable on purpose and confined to this file's `#push`: the optimizers each thread one of these
 * through their loop, and a shared accumulator is the only way three of them report the same
 * numbers for the same phenomenon.
 */
export class PlateauTally {
  #flatRounds = 0;
  #roundsWithTies = 0;
  #tiedWithBest = 0;
  #escapes = 0;
  #stepFloor: readonly number[] | undefined;

  /** Fold in a completed round. */
  observe<C>(round: SearchRound<C>): void {
    if (round.evaluations.length === 0) return;
    if (isFlat(round)) this.#flatRounds += 1;
    if (round.distinctOutcomes < round.evaluations.length) this.#roundsWithTies += 1;

    let best: Evaluation<C> | undefined;
    for (const evaluation of round.evaluations) {
      if (best === undefined || evaluation.score < best.score) best = evaluation;
    }
    if (best === undefined) return;
    for (const evaluation of round.evaluations) {
      if (evaluation !== best && sameOutcome(evaluation, best)) this.#tiedWithBest += 1;
    }
  }

  /** Record a deliberate escape: a step-size inflation or a restart. */
  escaped(): void {
    this.#escapes += 1;
  }

  /** Record a measured per-dimension plateau width. */
  measured(stepFloor: readonly number[]): void {
    this.#stepFloor = stepFloor;
  }

  report(): PlateauReport {
    return {
      flatRounds: this.#flatRounds,
      roundsWithTies: this.#roundsWithTies,
      tiedWithBest: this.#tiedWithBest,
      escapes: this.#escapes,
      ...(this.#stepFloor === undefined ? {} : { stepFloor: this.#stepFloor }),
    };
  }
}

/* -------------------------------------------------------------------------- *
 * Measuring the width
 * -------------------------------------------------------------------------- */

export interface StepFloorProbeOptions<C> {
  readonly space: VectorSpace<C>;
  readonly objective: Objective<C>;
  /** The point to probe around. Widths are a local property; this is not a global constant. */
  readonly base: readonly number[];
  /** The round's trace seed. The probe is one round, so every step is CRN-paired with the base. */
  readonly seed: bigint;
  /** Round index, for the trajectory record. */
  readonly round?: number | undefined;
  /** Replications per probe point. Ten is enough: the test is equality, not an interval. */
  readonly replications?: number | undefined;
  /** Smallest step tried, as a fraction of each dimension's range. */
  readonly startFraction?: number | undefined;
  /** Doublings tried above it. `startFraction * 2^(doublings-1)` is the largest step probed. */
  readonly doublings?: number | undefined;
}

/** One dimension's answer. */
export interface DimensionStepFloor {
  readonly id: string;
  readonly index: number;
  /** Smallest probed step that changed the run. */
  readonly width: number;
  /**
   * `false` when no probed step changed anything, in which case {@link width} is the largest step
   * tried and is a **lower bound**, not the width.
   *
   * A dimension that reads `false` is either genuinely inert at this point — which is a finding
   * worth having before spending 50–200 replications an evaluation on it — or has a plateau wider
   * than the probe. Widen `doublings` to tell the two apart.
   */
  readonly measured: boolean;
}

export interface StepFloorProbe<C> {
  readonly dimensions: readonly DimensionStepFloor[];
  /** {@link DimensionStepFloor.width} per dimension, ready for a step-size floor. */
  readonly widths: readonly number[];
  readonly round: SearchRound<C>;
  readonly replicationsSpent: number;
}

/**
 * Measure the plateau width along each coordinate, at one point, in one round.
 *
 * The probe is geometric — `δ, 2δ, 4δ, …` — because the width spans orders of magnitude between
 * terms and a linear sweep would either miss the small ones or spend its whole budget on them.
 * Every probe point of every dimension goes into a **single** round, so all of them are paired
 * against the base and against each other on identical traces; the answer costs
 * `(1 + dimensions × doublings) × replications` replications and no more.
 *
 * The direction is up where the box allows and down where it does not, so a parameter sitting on
 * its upper bound is still measured rather than silently reported inert.
 *
 * @throws SearchError when `base` is not a point of the space.
 */
export async function probeStepFloor<C>(options: StepFloorProbeOptions<C>): Promise<StepFloorProbe<C>> {
  const { space, objective, base, seed } = options;
  const round = options.round ?? 0;
  const replications = options.replications ?? 10;
  const startFraction = options.startFraction ?? 0.002;
  const doublings = options.doublings ?? 8;

  if (base.length !== space.dimensions.length) {
    throw new SearchError(
      `probeStepFloor: base has ${base.length} coordinates against a space of ${space.dimensions.length} dimensions.`,
      'base',
    );
  }
  if (doublings < 1) {
    throw new SearchError(`probeStepFloor: doublings must be at least 1; received ${doublings}.`, 'doublings');
  }

  const candidates: Candidate<C>[] = [
    { id: 'probe-base', value: space.decode(base), origin: 'probe' },
  ];
  /** `probeIds[dimension][step]`, or `undefined` where the box left no room to step. */
  const probeIds: (string | undefined)[][] = [];
  const stepSizes: number[][] = [];

  for (const [index, dimension] of space.dimensions.entries()) {
    const [min, max] = dimension.range;
    const span = max - min;
    const origin = base[index] ?? min;
    const ids: (string | undefined)[] = [];
    const sizes: number[] = [];
    for (let k = 0; k < doublings; k += 1) {
      const delta = span * startFraction * 2 ** k;
      sizes.push(delta);
      const up = origin + delta;
      const down = origin - delta;
      const target = up <= max ? up : down >= min ? down : undefined;
      if (target === undefined) {
        ids.push(undefined);
        continue;
      }
      const id = `probe-${index}-${k}`;
      const vector = [...base];
      vector[index] = target;
      candidates.push({ id, value: space.decode(vector), origin: `probe ${dimension.id}` });
      ids.push(id);
    }
    probeIds.push(ids);
    stepSizes.push(sizes);
  }

  const executed = await runRound(objective, {
    candidates,
    replications,
    seed,
    round,
    label: `plateau probe (${space.dimensions.length} dimensions × ${doublings} doublings)`,
  });

  const byId = new Map<string, Evaluation<C>>();
  for (const evaluation of executed.evaluations) byId.set(evaluation.candidate.id, evaluation);
  const baseEvaluation = byId.get('probe-base');
  if (baseEvaluation === undefined) {
    throw new SearchError('probeStepFloor: the base point was not evaluated.');
  }

  const dimensions: DimensionStepFloor[] = [];
  for (const [index, dimension] of space.dimensions.entries()) {
    const ids = probeIds[index] ?? [];
    const sizes = stepSizes[index] ?? [];
    let width = sizes[sizes.length - 1] ?? 0;
    let measured = false;
    for (let k = 0; k < ids.length; k += 1) {
      const id = ids[k];
      if (id === undefined) continue;
      const evaluation = byId.get(id);
      if (evaluation === undefined) continue;
      if (!sameOutcome(evaluation, baseEvaluation)) {
        width = sizes[k] ?? width;
        measured = true;
        break;
      }
    }
    dimensions.push({ id: dimension.id, index, width, measured });
  }

  return {
    dimensions,
    widths: dimensions.map((entry) => entry.width),
    round: executed,
    replicationsSpent: candidates.length * replications,
  };
}
