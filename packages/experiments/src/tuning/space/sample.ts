/**
 * Drawing a point from the space.
 *
 * ## Every draw comes from an injected stream (CLAUDE.md invariant 2)
 *
 * There is no `Math.random()` in this file and there must never be one. Every function here
 * takes an `Rng` and draws from it. The stream a tuning run should hand in is **`policyNoise`**
 * — it is the one `StreamSet` names for *"stochastic dispatcher exploration"*, and it exists
 * precisely so that a search's own randomness is separated from the passenger trace's.
 *
 * That separation is not tidiness, it is the whole of common random numbers. Phase 3 measured
 * what CRN is worth in exactly the regime Phase 7 searches — **99.69 % variance reduction, 324×,
 * at `rho = 0.997` between near-neighbour weight vectors** — and it buys that only if two
 * candidates see the *same* passenger trace. A search that drew its candidates from `arrivals`
 * would advance that stream by a different amount for every candidate and the traces would stop
 * matching, silently, with nothing to see but a comparison that needs 300× the replications.
 * {@link policyNoiseStream} exists so the right stream is the easy one to reach for.
 *
 * ## The declared box is not the feasible set
 *
 * Sampling each row independently is what a generic optimizer does and what docs/06 promises it
 * can do. It is also, today, wrong about one combination in eight: `dispatch.callType:
 * destination-entry` with `dispatch.assignmentTiming: deferred` is rejected by
 * `resolveDispatchConfig`, because a destination dispatcher must name the car at the landing.
 * `core` is right to reject it — *"that constraint is a documented cost of the approach and this
 * simulator measures it; it must not be configured away"* — so the sampler **rejection-samples**:
 * draw, ask {@link SearchSpace.validate}, redraw if it says no. Uniform over the feasible
 * region, deterministic in the seed, and it holds no rule of its own.
 *
 * ## Plateaus: what the step defaults buy, and — precisely — what they do not
 *
 * The objective is **piecewise constant**, not merely noisy. Phase 3 measured it: a weight
 * perturbation at or below **0.03** on `distanceTravelled` produced 100 of 100 exactly-zero
 * paired differences at `rho = 1` — a *bit-identical* run, because dispatch is an `argmin` over a
 * handful of cars and the simulator is deterministic. A neighbourhood generator whose steps land
 * inside that width returns a candidate that is not merely similar to its parent but **is** its
 * parent, and a search built on it stalls with a perfectly clean-looking zero gradient.
 *
 * So {@link perturbCandidate} works in **fractions of a dimension's declared range**, and its
 * default step of 0.15 sits well clear of that measured floor **on the dimension family it was
 * measured on**: `weights.*` ranges over `[0, 5]`, so 0.15 is a 0.75-wide standard deviation
 * against a plateau of 0.03 — 25×. The measured 0.03 is *per-term and per-building* and docs/05
 * says so explicitly (*"Step size has a per-term, per-building floor. Probe it; do not assume
 * 0.03"*), which is also why the step is relative to the range rather than absolute: a step in a
 * term's own units would have to be re-derived for every term.
 *
 * ## The guarantee is **value**-distinctness. It is not objective-distinctness.
 *
 * That 25× does not generalize, and on the dimension Phase 7 is scored on it fails. Measured on
 * garden-apartments, `predictive-balanced`, seed 4242, 1800 s, comparing `summary.waiting.meanS`
 * exactly: twelve default-step neighbours of the shipped 8 s deadband over
 * `subspace(space, ['idle.repositionThresholdS'])` produced **8 bit-identical runs**. The
 * objective is a step function there — the plateau runs roughly `[4, 60]`, some 93 % of the
 * declared `[0, 60]` range, and a 9 s sigma cannot clear it. Only neighbours that landed below
 * about 4 s moved the number at all.
 *
 * So state the guarantee exactly, because the difference is 50–200 replications an evaluation:
 *
 * - **This module guarantees a neighbour is a different *point*.** `candidatesEqual` compares
 *   encoded values, and {@link perturbCandidate} redraws until they differ. That is a property of
 *   the space, checkable without running anything.
 * - **It cannot guarantee a different *reading*.** Whether two points fall in the same cell of the
 *   objective's partition is only knowable by running the simulator, which this module does not
 *   do and must not do. That question belongs to `tuning/search/plateau.ts`, which owns it
 *   properly: `sameOutcome`/`isFlat` detect a bit-identical round *exactly and for free* from
 *   samples a round was going to produce anyway, `probeStepFloor` measures the per-dimension width
 *   geometrically in one CRN-paired round, and `PlateauTally` records the escape the search makes
 *   in response. A caller that wants to escape a plateau grows `step` — that is what the option is
 *   for — on evidence only a search has.
 *
 * Two consequences of the weaker, honest guarantee are still implemented here rather than left to
 * the caller, because both are decidable on values alone:
 *
 * - **An integer dimension never perturbs by zero.** Rounding a small step to 0 is the plateau in
 *   miniature and produces a "neighbour" that is the same point.
 * - **A perturbation that lands on the parent is redrawn, not returned.** So a caller that asked
 *   for a neighbour gets a distinct point, even when the draw happened to reproduce the parent.
 */

import { StreamSet } from '@elevator-sim/core';
import type { DispatcherProfile, Rng } from '@elevator-sim/core';

import { readerFor } from './collect.js';
import {
  candidateProfile,
  candidatesEqual,
  fromVector,
  reflectInto,
  toVector,
  vectorDimensions,
} from './encode.js';
import type { VectorDimension } from './encode.js';
import { isActive } from './types.js';
import type {
  Candidate,
  CategoricalParameter,
  GateReader,
  NumericParameter,
  ParameterValue,
  ProfileSource,
  SearchParameter,
  SearchSpace,
} from './types.js';
import { SearchSpaceError } from './types.js';

/* -------------------------------------------------------------------------- *
 * The stream
 * -------------------------------------------------------------------------- */

/**
 * The `policyNoise` stream of a fresh `StreamSet`, which is the stream a search draws from.
 *
 * A one-line convenience with a real job: it makes the correct stream the shortest thing to
 * write. Nothing stops a caller passing any `Rng`; the reason to pass this one is above.
 */
export function policyNoiseStream(seed: number | bigint): Rng {
  return new StreamSet(seed).policyNoise;
}

/* -------------------------------------------------------------------------- *
 * One dimension
 * -------------------------------------------------------------------------- */

/**
 * Draw one value for one dimension, honouring its type, its bounds and its scale.
 *
 * - **continuous, linear** — uniform on `[min, max]`.
 * - **continuous, log** — uniform on `[ln min, ln max]`, exponentiated. The right draw for a
 *   dimension spanning orders of magnitude: `idle.predictorCycleS` runs 600 s to 86 400 s, and a
 *   linear draw would put 99.3 % of its mass above ten minutes.
 * - **integer, linear** — uniform on the inclusive integer range, from `nextIntInclusive`, which
 *   is rejection-sampled and therefore unbiased at every range.
 * - **integer, log** — log-uniform, rounded, clamped. Rounding makes the endpoints slightly less
 *   likely than the interior; that is a property of any integer log draw and not worth a
 *   correction that would make the mapping harder to reproduce.
 * - **categorical** — uniform over the declared values.
 * - **boolean** — a fair coin.
 */
export function sampleValue(parameter: SearchParameter, rng: Rng): ParameterValue {
  switch (parameter.type) {
    case 'continuous':
      return numericDraw(parameter, rng);
    case 'integer': {
      if (parameter.scale === 'linear') return rng.nextIntInclusive(parameter.min, parameter.max);
      return clampInteger(Math.round(numericDraw(parameter, rng)), parameter);
    }
    case 'categorical':
      return pick(parameter, rng.nextInt(0, parameter.values.length));
    case 'boolean':
      return rng.bernoulli(0.5);
  }
}

function numericDraw(parameter: NumericParameter, rng: Rng): number {
  const u = rng.nextFloat();
  if (parameter.scale === 'log') {
    const low = Math.log(parameter.min);
    // Clamped because the exponential is not exact at the ends: `exp(log(1800))` is
    // `1800.0000000000005`, and the profile schema enforces the declared bound.
    return clampNumber(Math.exp(low + u * (Math.log(parameter.max) - low)), parameter);
  }
  return clampNumber(parameter.min + u * (parameter.max - parameter.min), parameter);
}

function clampNumber(value: number, parameter: NumericParameter): number {
  return Math.min(parameter.max, Math.max(parameter.min, value));
}

function clampInteger(value: number, parameter: NumericParameter): number {
  return clampNumber(value, parameter);
}

function pick(parameter: CategoricalParameter, index: number): string {
  const value = parameter.values[index];
  if (value === undefined) {
    // Unreachable: `collectSearchSpace` rejects an empty value set, and `nextInt` is exclusive of
    // its upper bound. Stated rather than asserted away, because `noUncheckedIndexedAccess` is on
    // for a reason and a silent `?? ''` would put an inadmissible string into a candidate.
    throw new SearchSpaceError(
      `"${parameter.id}" drew index ${index} from ${parameter.values.length} values.`,
    );
  }
  return value;
}

/* -------------------------------------------------------------------------- *
 * One candidate
 * -------------------------------------------------------------------------- */

/** How a candidate is drawn. */
export interface SampleOptions {
  /**
   * Values for dimensions this draw is not searching — the incumbent profile, as a candidate.
   *
   * Read when a gate lies outside the space being sampled, and merged with the draw before
   * feasibility is checked. A subspace search must supply it: a candidate over `idle.*` alone is
   * feasible or not *as part of a whole dispatcher*, and half a dispatcher cannot be judged.
   */
  readonly base?: Candidate | undefined;
  /**
   * Whether to reject infeasible draws. Default `true`.
   *
   * Set `false` only when the point of the draw is the encoding rather than the run — it is
   * about 30× cheaper, because a feasibility check builds a real policy.
   */
  readonly validate?: boolean | undefined;
  /**
   * An extra feasibility test, checked after {@link SearchSpace.validate} and rejected the same
   * way.
   *
   * The space's own oracle is building-independent — it asks whether a group controller builds.
   * Two of the declared `answer.*` rows are only decidable against a *car*, so a search should
   * pass `buildingFeasibility(space, building, specs)` here. Ignored when `validate` is `false`.
   */
  readonly feasible?: ((values: Candidate) => string | undefined) | undefined;
  /**
   * How many draws to make before giving up. Default 64.
   *
   * The one infeasible combination in the shipped schema is rejected about one draw in eight, so
   * 64 fails with probability ~1e-58. A space that exhausts this has a constraint the sampler
   * cannot satisfy by redrawing, and the error says which one, from `core`'s own message.
   */
  readonly maxAttempts?: number | undefined;
}

/**
 * Draw one feasible candidate.
 *
 * Dimensions are drawn in the space's gate order, and a dimension whose `activeWhen` is unmet by
 * what has been drawn so far — falling back to `base` and then to the declared defaults — is
 * **omitted entirely**. No value, no key, no replication budget.
 *
 * @throws SearchSpaceError if no feasible candidate was drawn within `maxAttempts`.
 */
export function sampleCandidate(
  space: SearchSpace,
  rng: Rng,
  options: SampleOptions = {},
): Candidate {
  const validate = options.validate ?? true;
  const maxAttempts = options.maxAttempts ?? 64;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new SearchSpaceError(`maxAttempts must be a positive integer; received ${maxAttempts}.`);
  }

  let lastReason = 'the space rejected every draw without saying why';
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const values = new Map<string, ParameterValue>();
    const read = readerFor(space, values, options.base);
    for (const parameter of space.parameters) {
      if (!isActive(parameter, read)) continue;
      values.set(parameter.id, sampleValue(parameter, rng));
    }
    if (!validate) return values;

    const reason = rejection(space, options, mergedWith(options.base, values));
    if (reason === undefined) return values;
    lastReason = reason;
  }

  throw new SearchSpaceError(
    `no feasible candidate in ${maxAttempts} draws. Last rejection: ${lastReason}`,
  );
}

/**
 * `count` independent candidates from one stream, in draw order.
 *
 * A random-search round, which docs/06 calls *"the honest baseline… always run it for
 * comparison"*. Independent rather than stratified on purpose: a stratified design would make
 * the baseline better than the baseline the literature reports, which is not what a baseline is
 * for.
 */
export function sampleCandidates(
  space: SearchSpace,
  rng: Rng,
  count: number,
  options: SampleOptions = {},
): readonly Candidate[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new SearchSpaceError(`count must be a non-negative integer; received ${count}.`);
  }
  const drawn: Candidate[] = [];
  for (let index = 0; index < count; index += 1) drawn.push(sampleCandidate(space, rng, options));
  return Object.freeze(drawn);
}

/* -------------------------------------------------------------------------- *
 * A neighbour
 * -------------------------------------------------------------------------- */

/** How a neighbour is drawn. */
export interface PerturbOptions extends SampleOptions {
  /**
   * Step size as a fraction of each dimension's declared range. Default 0.15.
   *
   * The standard deviation of a Gaussian step for a numeric dimension, and the probability of a
   * resample for a categorical or boolean one. **Do not shrink it towards zero to refine.** The
   * objective is piecewise constant, and below the decision-flip threshold — measured at 0.03 on
   * `distanceTravelled`, whose range is `[0, 5]`, so 0.006 of the range — a step produces a
   * bit-identical run rather than a small improvement. Refining by shrinking the step is the
   * failure mode docs/05 § Phase 7 names: *"Anything gradient-ish or small-perturbation will
   * stall."*
   *
   * **Growing it is the escape ladder, and it is the caller's to climb.** The default clears the
   * measured plateau on `weights.*` by 25× and does *not* clear it on
   * `idle.repositionThresholdS`, where 8 of 12 default-step neighbours come back bit-identical
   * (see the plateau section on this module). Only a search knows that has happened —
   * `tuning/search/plateau.ts`'s `isFlat` says so exactly, from samples the round already
   * produced — so a flat round is answered by calling this function again with a larger `step`
   * and recording the escape on `PlateauTally`. This module cannot detect the condition without
   * running the simulator, and it does not run the simulator.
   */
  readonly step?: number | undefined;
  /**
   * Probability that any one dimension is perturbed at all. Default 1.
   *
   * Below 1 this is a coordinate-subset move, which is what a search wants when the space is
   * wide and most dimensions are irrelevant to a given region.
   */
  readonly probability?: number | undefined;
}

/**
 * Draw a feasible neighbour of a candidate.
 *
 * Gates are re-evaluated against the perturbed values, so a move that changes
 * `idle.parkingStrategy` from `stay` to `lobby` **acquires** `idle.repositionThresholdS` and
 * `idle.repositionEnergyWeight` — drawn fresh, since the parent never held them — and a move the
 * other way drops both. A neighbourhood that kept a stale value for a dimension that has just
 * gone inactive would carry it into the profile, where the resolver would read it and the search
 * would be crediting a knob it believes is off.
 *
 * The result is never equal to its parent **as a point**: a draw that reproduces the parent's
 * values is redrawn, because a candidate identical to its parent costs a whole evaluation to
 * learn nothing. `candidatesEqual` compares encoded values, which is the only kind of
 * distinctness a space can check — it is *not* a promise that the run comes back different. On
 * `idle.repositionThresholdS` two-thirds of default-step neighbours are value-distinct and
 * objective-identical; see the plateau section on this module, and
 * `tuning/search/plateau.ts` for the side that can tell.
 *
 * @throws SearchSpaceError if no feasible, distinct neighbour was drawn within `maxAttempts`.
 */
export function perturbCandidate(
  space: SearchSpace,
  candidate: Candidate,
  rng: Rng,
  options: PerturbOptions = {},
): Candidate {
  const step = options.step ?? 0.15;
  const probability = options.probability ?? 1;
  const validate = options.validate ?? true;
  const maxAttempts = options.maxAttempts ?? 64;
  if (!(step > 0) || !Number.isFinite(step)) {
    throw new SearchSpaceError(
      `step must be a finite positive fraction of the declared range; received ${step}. A step of zero is a neighbourhood of one point, and the objective is piecewise constant.`,
    );
  }

  let lastReason = 'every neighbour drawn was its own parent';
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const values = new Map<string, ParameterValue>();
    const read = readerFor(space, values, options.base);
    for (const parameter of space.parameters) {
      if (!isActive(parameter, read)) continue;
      const held = candidate.get(parameter.id);
      if (held === undefined) {
        // Newly live: the parent never searched it, so there is nothing to perturb.
        values.set(parameter.id, sampleValue(parameter, rng));
        continue;
      }
      values.set(
        parameter.id,
        rng.bernoulli(probability) ? perturbValue(parameter, held, rng, step) : held,
      );
    }

    if (candidatesEqual(values, candidate)) continue;
    if (!validate) return values;

    const reason = rejection(space, options, mergedWith(options.base, values));
    if (reason === undefined) return values;
    lastReason = reason;
  }

  throw new SearchSpaceError(
    `no feasible distinct neighbour in ${maxAttempts} draws at step ${step}. Last rejection: ${lastReason}`,
  );
}

/** Perturb one value, in the dimension's own geometry. */
export function perturbValue(
  parameter: SearchParameter,
  value: ParameterValue,
  rng: Rng,
  step: number,
): ParameterValue {
  switch (parameter.type) {
    case 'categorical':
      return rng.bernoulli(step) ? pick(parameter, rng.nextInt(0, parameter.values.length)) : value;
    case 'boolean':
      return rng.bernoulli(step) ? !(value === true) : value;
    case 'continuous':
      return typeof value === 'number' ? numericStep(parameter, value, rng, step) : parameter.default;
    case 'integer': {
      if (typeof value !== 'number') return parameter.default;
      const moved = numericStep(parameter, value, rng, step);
      const rounded = Math.round(moved);
      if (rounded !== value) return clampInteger(rounded, parameter);
      // Rounding to the parent is the plateau in miniature: a "neighbour" that is the same
      // point. Move one, in the direction the step was already going, and stay inside the range.
      const direction = moved >= value ? 1 : -1;
      const nudged = value + direction;
      return nudged > parameter.max || nudged < parameter.min
        ? clampInteger(value - direction, parameter)
        : nudged;
    }
  }
}

/**
 * A Gaussian step of `step × (max − min)`, taken in the dimension's own scale and reflected back
 * into range.
 *
 * Reflected rather than clamped, because clamping piles probability mass onto the two endpoints
 * — and an endpoint of a weight range is `0`, which removes a term from the sum entirely. A
 * search whose neighbourhood quietly favours "term off" is a search with an opinion.
 */
function numericStep(parameter: NumericParameter, value: number, rng: Rng, step: number): number {
  if (parameter.scale === 'log') {
    const low = Math.log(parameter.min);
    const high = Math.log(parameter.max);
    const moved = reflectInto(Math.log(value) + rng.normal(0, step * (high - low)), low, high);
    return clampNumber(Math.exp(moved), parameter);
  }
  return reflectInto(
    value + rng.normal(0, step * (parameter.max - parameter.min)),
    parameter.min,
    parameter.max,
  );
}

/* -------------------------------------------------------------------------- *
 * The ports `tuning/search` draws through
 * -------------------------------------------------------------------------- */

/**
 * A space as the thing an optimizer draws from: one method, `sample(rng)`.
 *
 * `tuning/search` declares this as a **port** and says so: *"Sampling `DISPATCH_PARAMETERS`,
 * honouring `activeWhen`, and writing a candidate back through a dotted `id` are
 * `tuning/space`'s"*. This is that half of the seam, and it lives here rather than in `search` for
 * the reason docs/05-roadmap.md § *Standing requirement* gives: **the seam has an owner**. A
 * search that had to build its own adapter would be a search that knew what a parameter is.
 *
 * The shape is structural — nothing here imports a type from `tuning/search`, which would be the
 * dependency the wrong way round.
 */
export function candidateSampler(
  space: SearchSpace,
  options: SampleOptions = {},
): { sample(random: Rng): Candidate } {
  return { sample: (random) => sampleCandidate(space, random, options) };
}

/**
 * A space as the real box a continuous optimizer moves in — CMA-ES's port.
 *
 * `dimensions`, `encode` and `decode` are `vectorDimensions`, `toVector` and `fromVector`; the
 * embedding of the two non-numeric kinds and of a log scale is described on
 * {@link vectorDimensions}, and no part of it is visible to the optimizer.
 *
 * **Note the axis, because two modules use these words differently.** Here `encode` is candidate →
 * real vector and `decode` is real vector → candidate, which is `tuning/search`'s convention.
 * `encode.ts`'s `encodeCandidate`/`decodeCandidate` run on the *other* axis, candidate ⇄ profile
 * JSON. Neither pair is the inverse of the other and the names are not interchangeable; the
 * functions this adapter is built from are called {@link toVector} and {@link fromVector} for
 * exactly that reason.
 *
 * `encode(decode(v))` is a **projection**, not the identity: decoding rounds an integer, floors a
 * categorical and drops a gated dimension, and encoding puts the result back at the centre of the
 * cell it landed in. It is idempotent — one further round trip moves nothing — which is what a
 * search needs when it updates its distribution from what was evaluated rather than from what was
 * proposed.
 *
 * ## `decode` returns a point; `reasonFor` says whether it is a runnable one
 *
 * The declared box is **not** the feasible set, and CMA-ES leaves the box constantly. Over 500
 * proposals shaped like a real generation — mean at the box centre, sigma half the box width —
 * **63 decoded to points `SearchSpace.validate` refuses** (destination entry with deferred
 * assignment, an out-of-range dwell ceiling) and a further tranche to points a *car* refuses. That
 * is about one proposal in eight, and `decode` returns every one of them looking exactly like a
 * runnable point.
 *
 * It has to. A decoder that threw would hand CMA-ES an exception where it expects a score, which
 * is the failure docs/06 names. So the feasibility answer is a **separate call the optimizer makes
 * on the point it decoded**, and it is `reasonFor`:
 *
 * ```ts
 * const port = vectorSpace(space, { base, feasible: buildingFeasibility(space, building, specs) });
 * const candidate = port.decode(proposal);
 * const reason = port.reasonFor(candidate);
 * if (reason !== undefined) return infeasible(reason);   // rank it last; do not run it
 * ```
 *
 * `reasonFor` asks {@link SearchSpace.validate} and then `options.feasible`, in that order, on the
 * merged point — the same two oracles, in the same order, on the same merge that
 * {@link sampleCandidate} rejection-samples against. Before it existed, `vectorSpace` accepted the
 * whole of {@link SampleOptions} — `feasible` included — and threaded it only into `sample`;
 * `decode` read `base` and nothing else, so a caller who wired a building oracle into the port got
 * it silently ignored on the one path CMA-ES actually uses. That is the repository's signature
 * *"configurable, tested in isolation, inert on the shipped path"* shape, and this is the seam it
 * was hiding in.
 */
export function vectorSpace(
  space: SearchSpace,
  options: SampleOptions = {},
): {
  readonly dimensions: readonly VectorDimension[];
  sample(random: Rng): Candidate;
  encode(candidate: Candidate): readonly number[];
  decode(vector: readonly number[]): Candidate;
  reasonFor(candidate: Candidate): string | undefined;
} {
  const base = options.base;
  return {
    dimensions: vectorDimensions(space),
    sample: (random) => sampleCandidate(space, random, options),
    encode: (candidate) => toVector(space, candidate),
    decode: (vector) => fromVector(space, vector, base === undefined ? {} : { base }),
    reasonFor: (candidate) => rejection(space, options, mergedWith(base, candidate)),
  };
}

/**
 * A candidate as a `DispatcherProfile` under a given id — `tuning/search`'s `materialize`.
 *
 * The other half of the seam. The search names each candidate (`cand-3`, `generation-2-4`) and
 * needs a profile carrying that exact id, because the runner attributes a run to an arm by it;
 * this closes over the incumbent so a narrowed search patches the profile it is tuning rather
 * than a bare one.
 */
export function materializer(
  space: SearchSpace,
  base?: ProfileSource | undefined,
): (candidate: Candidate, profileId: string) => DispatcherProfile {
  return (candidate, profileId) =>
    candidateProfile(space, candidate, {
      id: profileId,
      ...(base === undefined ? {} : { base }),
    });
}

/* -------------------------------------------------------------------------- *
 * Helpers
 * -------------------------------------------------------------------------- */

/**
 * A base point with a draw laid over it.
 *
 * The point feasibility is judged at: a candidate over a subspace describes only part of a
 * dispatcher, and `createPolicyFor` has an opinion about the whole one.
 */
function mergedWith(base: Candidate | undefined, values: Candidate): Candidate {
  if (base === undefined) return values;
  const merged = new Map<string, ParameterValue>(base);
  for (const [id, value] of values) merged.set(id, value);
  return merged;
}

/** The space's own oracle, then the caller's. First refusal wins, and it carries its message. */
function rejection(
  space: SearchSpace,
  options: SampleOptions,
  values: Candidate,
): string | undefined {
  return space.validate(values) ?? options.feasible?.(values);
}

/** Re-exported so a caller building its own reader does not have to reach into `collect`. */
export type { GateReader };
