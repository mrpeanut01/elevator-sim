/**
 * `tuning/space` — the self-describing search space.
 *
 * The contract that lets a generic optimizer search this simulator **without a line of
 * elevator-specific code**, which is CLAUDE.md invariant 8 and the mechanism
 * docs/06-parameterization-and-tuning.md § *The parameter schema* is built around.
 *
 * Four things, and nothing else:
 *
 * | | |
 * |---|---|
 * | {@link collectSearchSpace} / {@link searchSpace} | every declared tunable, **discovered** from `@elevator-sim/core`'s schemas and narrowed to what a dispatcher profile can hold |
 * | {@link sampleCandidate} / {@link perturbCandidate} | a valid point, and a valid neighbour, drawn from an injected `Rng` — never `Math.random` |
 * | {@link decodeCandidate} / {@link encodeCandidate} | a point ⇄ a profile patch, exactly in both directions |
 * | {@link candidateProfile} | a point as a real `DispatcherProfile`, validated by the parser `loadConfig` uses |
 *
 * ## What a search does with this
 *
 * ```ts
 * const space = searchSpace();
 * const rng = policyNoiseStream(seed);                   // invariant 2: the named stream
 * const incumbent = candidateFromProfile(space, profile);
 * const candidate = perturbCandidate(space, incumbent, rng);
 * const arm = candidateProfile(space, candidate, { id: 'cand-1', base: profile });
 * // …hand `arm` to the Phase 3 runner alongside the reference arm, under common random numbers.
 * ```
 *
 * Nothing in that sequence names a floor, a car or a call, which is the property the whole module
 * exists to have.
 *
 * ## Three facts from Phase 3 and Phase 5 that this module is shaped by
 *
 * - **The objective is piecewise constant.** A weight step at or below 0.03 on
 *   `distanceTravelled` produced 100/100 exactly-zero paired differences at `rho = 1` — a
 *   *bit-identical* run. {@link perturbCandidate} therefore steps in fractions of a declared
 *   range and defaults well clear of that width; see its docstring for the arithmetic.
 * - **CRN is worth 324× here.** Phase 7 searches the near-neighbour regime, where the measured
 *   variance reduction is 99.69 %. That is why {@link policyNoiseStream} exists: a search that
 *   drew from a trace stream would desynchronize the traces it is comparing.
 * - **The declared box is not the feasible set.** One combination in eight is rejected by
 *   `core`; {@link SearchSpace.validate} asks `core` rather than keeping a list.
 *
 * ## The known-answer case
 *
 * `idle.repositionThresholdS` is in this space, gated on `idle.parkingStrategy` being anything
 * other than `stay`, with a declared range of `[0, 60]`. The shipped `predictive-balanced`
 * profile authors `8`, which vetoes every reposition it might make; Phase 5's sweep on Garden
 * Apartments at n = 300 has an interior optimum at **2 s**. The 8 is left exactly where it is on
 * purpose — an optimizer that rediscovers ~2 s on that dimension has validated itself. Nothing in
 * this module knows any of that, which is the point of saying it here.
 */

export {
  PARAMETER_SCHEMA_SUFFIX,
  activeParameters,
  activeWhenSatisfied,
  candidateFromProfile,
  collectSearchSpace,
  defaultCandidate,
  discoverParameterSchemas,
  isActive,
  isActiveWhenRange,
  isProfileAuthorable,
  parameterOf,
  readerFor,
  searchSpace,
  subspace,
} from './collect.js';

export type { CollectOptions } from './collect.js';

export {
  PROFILE_OBJECT_SECTIONS,
  PROFILE_SECTIONS,
  applyPatch,
  buildingFeasibility,
  candidateProfile,
  candidatesEqual,
  decodeCandidate,
  decodeInto,
  encodeCandidate,
  fromVector,
  parseProfile,
  toVector,
  validateValues,
  vectorDimensions,
} from './encode.js';

export type { CandidateProfileOptions, VectorDimension } from './encode.js';

export {
  candidateSampler,
  materializer,
  perturbCandidate,
  perturbValue,
  policyNoiseStream,
  sampleCandidate,
  sampleCandidates,
  sampleValue,
  vectorSpace,
} from './sample.js';

export type { PerturbOptions, SampleOptions } from './sample.js';

export { SearchSpaceError } from './types.js';

export type {
  ActiveWhenCondition,
  ActiveWhenConditions,
  BooleanParameter,
  Candidate,
  CategoricalParameter,
  ContinuousParameter,
  GateReader,
  IntegerParameter,
  NumericParameter,
  ParameterScale,
  ParameterValue,
  ProfilePatch,
  ProfileSection,
  ProfileSource,
  SearchParameter,
  SearchParameterCommon,
  SearchSpace,
} from './types.js';
