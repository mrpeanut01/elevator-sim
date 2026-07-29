/**
 * A candidate ⇄ a dispatcher profile, exactly and in both directions.
 *
 * This is the half of CLAUDE.md invariant 8 that is easy to skip and expensive to skip:
 *
 * > *"A parameter an optimizer can sample but not write back is a dimension it searched for
 * > nothing; one it can write but never sample is a knob the tuned result silently depends
 * > on."* — docs/06-parameterization-and-tuning.md § `id` is a path a profile can actually hold
 *
 * `core`'s `dispatch/parameters.test.ts` already asserts that every **declared id** survives the
 * trip through `dispatcherProfileSchema` and back out of the real resolver. What it cannot
 * assert, because it has no notion of a candidate, is that the *whole point* survives: that a
 * winner an optimizer holds as 48 numbers becomes one profile, and that reading that profile
 * back gives the same 48 numbers. That is {@link decodeCandidate} and {@link encodeCandidate},
 * and `encode(decode(x))` must be `x` for every `x` — asserted here over a thousand random
 * candidates rather than over a probe table, because a probe table is a list and a list goes
 * stale.
 *
 * ## Exactness is structural, not arithmetic
 *
 * Nothing in this file rounds, clamps, rescales or re-derives a value. A candidate's number is
 * written into a plain object and read back out of it; the round trip is exact because it is a
 * copy. The two places where it could stop being a copy are both handled by making absence
 * meaningful rather than by making a value up:
 *
 * - **`hardConstraints`.** `constraints.noDirectionReversal` is a boolean in the space and a
 *   membership in an array in the file. {@link decodeCandidate} emits the array **only** when
 *   the candidate carries the boolean, and {@link encodeCandidate} reads the boolean **only**
 *   when the patch carries the array. So a candidate that never searched the constraint does not
 *   acquire one, and a `false` does not vanish into an omitted key.
 * - **Weights.** A weight of `0` is a real decision — it removes the term from the sum — and is
 *   not the same as a term the profile never mentions, which has no weight at all. Membership is
 *   tested with `Object.hasOwn`, never with truthiness.
 *
 * ## Merging onto a base profile is a different operation, on purpose
 *
 * {@link decodeCandidate} produces a **patch**: only what the candidate carried.
 * {@link applyPatch} merges one onto a base profile, field by field within each section, so a
 * search narrowed to `idle.*` leaves the base's weights alone. {@link candidateFromProfile} goes
 * the other way and is deliberately *lenient* where {@link encodeCandidate} is strict: it fills
 * a dimension the profile does not author with that dimension's declared default, because that
 * is what the resolver will do at run time. Keeping the two apart is what keeps the round trip
 * exact — a lenient `encode` would hand back keys `decode` never wrote.
 */

import {
  COST_TERMS,
  DISPATCHER_PROFILE_OBJECT_SECTIONS,
  createPolicyFor,
  parseDispatcherProfiles,
  resolveDoorConfig,
  resolveLoadSensor,
  resolvePredictorConfig,
} from '@elevator-sim/core';
import type {
  AuctionProfileSource,
  DispatcherProfile,
  ElevatorSpecs,
  PredictorIdleSource,
  ResolvedBuilding,
} from '@elevator-sim/core';

import type {
  Candidate,
  GateReader,
  ParameterValue,
  ProfilePatch,
  ProfileSource,
  SearchParameter,
  SearchSpace,
} from './types.js';
import { SearchSpaceError, isActive } from './types.js';

/* -------------------------------------------------------------------------- *
 * Sections
 * -------------------------------------------------------------------------- */

/**
 * The `weights` pseudo-section: `id` is `weights.<termId>` and the value is authored under
 * `profile.weights`, not under a section object.
 */
const WEIGHTS_SECTION = 'weights';

/**
 * A one-arm weight-set library, for the feasibility oracle and for nothing else.
 *
 * `selection.policy` is a profile field; the **arms** are not — they are the file-level
 * `patternSwitching` block, the way the cost-term library is file-level. So a profile carrying
 * `selection.policy: 'fuzzy'` is buildable or not only *given* a library, exactly as a car is
 * feasible or not only given a building. This stands in for the real one so that turning the
 * knob on is not mistaken for an infeasible candidate.
 *
 * Synthetic rather than loaded: this module is reachable from the browser barrel and may not read
 * `data/`. It never reaches a run — `runnerObjective` builds arms from the real resources.
 */
const SEARCH_SPACE_WEIGHT_SETS = Object.freeze({
  patternSwitching: Object.freeze({
    patternDetector: Object.freeze({
      type: 'fuzzy',
      inputs: Object.freeze(['lobbyArrivalRate']),
      patterns: Object.freeze(['probe']),
      hysteresisS: 0,
      membership: Object.freeze({ probe: Object.freeze({ lobbyArrivalRate: [0, 1] }) }),
    }),
    weightSetsByPattern: Object.freeze({ probe: 'probe-arm' }),
  }),
  weightsByProfileId: new Map<string, ReadonlyMap<string, number>>([
    ['probe-arm', new Map([['waitTime', 1]])],
  ]),
});

/**
 * The `constraints` pseudo-section: the one family of ids whose authored form is not its dotted
 * path. See {@link ProfilePatch.hardConstraints}.
 */
const CONSTRAINTS_SECTION = 'constraints';

/**
 * Sections written as `profile.<section>.<key>`, which is every other one.
 *
 * **Derived from `dispatcherProfileSchema`'s own shape, not written down**, which is the whole of
 * the argument this module's sibling opens with applied to the one place `collect.ts` did not
 * reach. `collect.ts` derives the *parameters* from `core`'s `_PARAMETERS` exports so a new schema
 * needs no edit here; the *sections* were still enumerated, and the failure was exactly the one it
 * predicts. `selection` landed in `config/schema.ts` with seven declared, round-trip-tested rows,
 * this array did not gain it, and all seven were reported **unauthorable** by
 * `collectSearchSpace()` and silently dropped — nothing anywhere read as wrong
 * ([DECISIONS.md § D146](../../../../../DECISIONS.md)). Adding `selection` to the list fixed
 * that instance and left the mechanism; this closes the mechanism.
 *
 * The derivation lives in `core` — {@link DISPATCHER_PROFILE_OBJECT_SECTIONS} — because that is
 * where the schema is and because `experiments` does not depend on `zod`. An **eighth** section
 * added to `dispatcherProfileSchema` reaches the search space with no edit to this file, and
 * `config/schema.test.ts` proves it against a fictional schema the product does not ship, for the
 * reason § D134 gives about W4's control renderers: a list that looks derived only because the
 * shipped schema happens to fit it is not derived.
 */
export const PROFILE_OBJECT_SECTIONS: readonly string[] = DISPATCHER_PROFILE_OBJECT_SECTIONS;

/** Every section a {@link ProfilePatch} can carry, including the two pseudo-sections. */
export const PROFILE_SECTIONS: readonly string[] = Object.freeze([
  WEIGHTS_SECTION,
  CONSTRAINTS_SECTION,
  ...PROFILE_OBJECT_SECTIONS,
]);

/* -------------------------------------------------------------------------- *
 * Candidate → patch
 * -------------------------------------------------------------------------- */

/**
 * Turn a candidate into the JSON a dispatcher profile holds.
 *
 * Only the dimensions the candidate carries appear, so a candidate that omitted an inactive knob
 * produces a profile that omits it too and the resolver applies its default — which is exactly
 * what "inactive" means.
 *
 * Sections and keys are emitted in the space's own order, so two candidates of one space produce
 * byte-identical JSON for byte-identical values (CLAUDE.md invariant 4).
 */
export function decodeCandidate(space: SearchSpace, candidate: Candidate): ProfilePatch {
  return decodeInto(space.byId, candidate);
}

/**
 * {@link decodeCandidate} against a bare index rather than a whole space.
 *
 * Exists so `collectSearchSpace` can build its feasibility oracle *while* it is building the
 * space, before there is a `SearchSpace` object to pass. Not part of the module's public
 * vocabulary; callers want {@link decodeCandidate}.
 */
export function decodeInto(
  byId: ReadonlyMap<string, SearchParameter>,
  values: Candidate,
): ProfilePatch {
  const weights: Record<string, number> = {};
  let sawWeight = false;

  const constraintsOn: string[] = [];
  let sawConstraint = false;

  const sections = new Map<string, Record<string, ParameterValue>>();

  // Iterate the index, not the candidate: the index's order is the space's order, and a value
  // whose id is not a declared dimension is not something a profile can hold.
  for (const [id, parameter] of byId) {
    if (!values.has(id)) continue;
    const value = values.get(id) as ParameterValue;

    if (parameter.section === WEIGHTS_SECTION) {
      if (typeof value !== 'number') {
        throw new SearchSpaceError(`${id} must hold a number; received ${describe(value)}.`);
      }
      weights[parameter.key] = value;
      sawWeight = true;
      continue;
    }

    if (parameter.section === CONSTRAINTS_SECTION) {
      sawConstraint = true;
      if (value === true) constraintsOn.push(parameter.key);
      continue;
    }

    if (!PROFILE_OBJECT_SECTIONS.includes(parameter.section)) {
      // Refused rather than dropped. A dimension whose section no profile has is one an
      // optimizer could sample and never persist — docs/06's *"searched for nothing"* — and
      // silently omitting it here is how it would come to look authorable. `sim.drainGraceS`,
      // `metrics.longWaitThresholdS` and `car.passengerTransferS` are all real declared
      // tunables that this rejects, correctly: they are the harness, the ruler and the
      // building fabric, not the dispatcher.
      throw new SearchSpaceError(
        `"${id}" is in section "${parameter.section}", which a dispatcher profile has no place for. Authorable sections: ${PROFILE_SECTIONS.join(', ')}.`,
      );
    }

    let section = sections.get(parameter.section);
    if (section === undefined) {
      section = {};
      sections.set(parameter.section, section);
    }
    section[parameter.key] = value;
  }

  // Built by assignment rather than by a literal so `exactOptionalPropertyTypes` is honoured:
  // an absent section must be *absent*, not present and `undefined`, or `parseDispatcherProfiles`
  // sees a key it must reject.
  const patch: Record<string, unknown> = {};
  if (sawWeight) patch['weights'] = weights;
  if (sawConstraint) patch['hardConstraints'] = constraintsOn;
  for (const name of PROFILE_OBJECT_SECTIONS) {
    const section = sections.get(name);
    if (section !== undefined) patch[name] = section;
  }
  return patch as ProfilePatch;
}

/* -------------------------------------------------------------------------- *
 * Patch → candidate
 * -------------------------------------------------------------------------- */

/**
 * Read a patch back as a candidate. The exact inverse of {@link decodeCandidate}.
 *
 * **Strict**: a dimension the patch does not carry is not in the result. That is what makes
 * `encodeCandidate(space, decodeCandidate(space, x))` equal `x` for every `x`, and it is why
 * this is a different function from {@link candidateFromProfile}, which fills defaults.
 */
export function encodeCandidate(space: SearchSpace, patch: ProfilePatch): Candidate {
  const values = new Map<string, ParameterValue>();
  const record = patch as Readonly<Record<string, unknown>>;

  for (const parameter of space.parameters) {
    if (parameter.section === WEIGHTS_SECTION) {
      const weights = patch.weights;
      if (weights !== undefined && Object.hasOwn(weights, parameter.key)) {
        values.set(parameter.id, weights[parameter.key] as number);
      }
      continue;
    }

    if (parameter.section === CONSTRAINTS_SECTION) {
      const declared = patch.hardConstraints;
      if (declared !== undefined) values.set(parameter.id, declared.includes(parameter.key));
      continue;
    }

    const section = record[parameter.section];
    if (section === undefined || section === null || typeof section !== 'object') continue;
    if (!Object.hasOwn(section, parameter.key)) continue;
    values.set(parameter.id, (section as Record<string, ParameterValue>)[parameter.key] as ParameterValue);
  }

  return values;
}

/* -------------------------------------------------------------------------- *
 * Applying a patch to a base profile
 * -------------------------------------------------------------------------- */

/**
 * A base profile with a patch merged onto it, as plain JSON.
 *
 * Merged **per field within each section**, not per section: a search narrowed to `idle.*` that
 * replaced the whole `idle` object would silently drop the base's `predictorHorizonS`, and the
 * winner would be optimal at a horizon nobody chose. `derivedProfile` in `validation/harness.ts`
 * replaces sections wholesale because a hand-written variant states its whole section; a
 * candidate does not.
 *
 * `hardConstraints` is a set and merges as one: the base keeps any constraint the space does not
 * declare — none today, and the point is that a constraint added tomorrow is not silently
 * dropped by a search that never knew about it — and the patch decides every constraint the
 * space *does* declare.
 */
export function applyPatch(
  space: SearchSpace,
  base: ProfileSource,
  patch: ProfilePatch,
): Readonly<Record<string, unknown>> {
  const source = base as unknown as Readonly<Record<string, unknown>>;
  const merged: Record<string, unknown> = { ...source };

  if (patch.weights !== undefined) {
    merged['weights'] = { ...base.weights, ...patch.weights };
  }

  if (patch.hardConstraints !== undefined) {
    // Read off `allById`, not `parameters`: a merged subspace point decodes through the whole
    // index (see `buildingFeasibility`), so a constraint the narrowed space does not *search* can
    // still appear in the patch. Taking the declared set from the narrowed list would then keep
    // the base's copy **and** append the patch's, and the profile would carry it twice.
    const declared = new Set(
      [...space.allById.values()]
        .filter((parameter) => parameter.section === CONSTRAINTS_SECTION)
        .map((parameter) => parameter.key),
    );
    const kept = (base.hardConstraints ?? []).filter((id) => !declared.has(id));
    merged['hardConstraints'] = [...kept, ...patch.hardConstraints];
  }

  const record = patch as Readonly<Record<string, unknown>>;
  for (const name of PROFILE_OBJECT_SECTIONS) {
    const section = record[name];
    if (section === undefined) continue;
    const existing = source[name];
    merged[name] =
      existing !== undefined && existing !== null && typeof existing === 'object'
        ? { ...(existing as Record<string, unknown>), ...(section as Record<string, unknown>) }
        : { ...(section as Record<string, unknown>) };
  }

  return merged;
}

/* -------------------------------------------------------------------------- *
 * The profile a run is given
 * -------------------------------------------------------------------------- */

/** Where a candidate's profile gets its identity and what it is merged onto. */
export interface CandidateProfileOptions {
  /** Profile id. Must satisfy `config/schema.ts`'s identifier pattern. */
  readonly id: string;
  /** Display name. Defaults to `id`. */
  readonly name?: string | undefined;
  /**
   * The profile the candidate patches.
   *
   * Defaults to a bare profile with no weights and no stage settings, so a candidate carrying
   * the whole space describes the whole dispatcher. Supply the incumbent when the search is
   * narrowed to a subspace.
   */
  readonly base?: ProfileSource | undefined;
}

/** A bare profile: every stage at its declared default, no term weighted. */
const EMPTY_BASE: ProfileSource = Object.freeze({
  id: 'candidate-base',
  name: 'Candidate base',
  weights: Object.freeze({}),
});

/**
 * A candidate as a real `DispatcherProfile`, validated by the real profile parser.
 *
 * The end of the round trip docs/06 asks for: *"take the winner, write it into
 * `data/dispatcher-profiles.json`, load it."* The result is a value `loadConfig` could have
 * produced — `runSimulation` and `createPolicyFor` cannot tell it from one that was authored on
 * disk, which is the property that makes a tuned winner shippable rather than a runner-only
 * artefact.
 *
 * Validated rather than cast. The patch is loosely typed data (see {@link ProfilePatch}); this
 * is where it becomes a `DispatcherProfile`, and it becomes one by passing
 * `parseDispatcherProfiles` — `core`'s own strict parser, unrecognized keys and all — not by an
 * assertion this module makes about itself.
 *
 * @throws SearchSpaceError if the resulting profile is not one `loadConfig` would accept.
 */
export function candidateProfile(
  space: SearchSpace,
  candidate: Candidate,
  options: CandidateProfileOptions,
): DispatcherProfile {
  const base = options.base ?? EMPTY_BASE;
  const merged = applyPatch(space, base, decodeCandidate(space, candidate));
  const authored: Record<string, unknown> = {
    ...merged,
    id: options.id,
    name: options.name ?? options.id,
  };
  return parseProfile(authored);
}

/**
 * The cost-term library a probe document declares, derived from the implemented registry.
 *
 * `dispatcherProfilesSchema` rejects a weight whose term id is not in the file's `terms` array,
 * so a probe document has to carry one. Derived from `COST_TERMS` rather than written out, for
 * the same reason the space itself is discovered: a thirteenth term must not need an edit here.
 * `serves` is the one field a `CostTermDefinition` does not carry and the schema requires; it is
 * reporting prose and nothing reads it.
 */
const PROBE_TERMS: readonly { readonly id: string; readonly measures: string; readonly serves: string }[] =
  Object.freeze(
    COST_TERMS.map((term) =>
      Object.freeze({ id: term.id, measures: term.measures, serves: 'search-space probe' }),
    ),
  );

/**
 * Parse one authored profile through the real `data/dispatcher-profiles.json` parser.
 *
 * Wrapped in the smallest document the file schema accepts. `parseDispatcherProfiles` is the
 * function `loadConfig` itself calls, so "this parses" and "`loadConfig` would accept this" are
 * the same statement — which is the whole claim `id` makes.
 */
export function parseProfile(authored: Readonly<Record<string, unknown>>): DispatcherProfile {
  let parsed;
  try {
    parsed = parseDispatcherProfiles(
      {
        version: 1,
        terms: PROBE_TERMS,
        normalization: { required: true },
        profiles: [authored],
      },
      '<tuning search space>',
    );
  } catch (error) {
    throw new SearchSpaceError(
      `candidate profile "${String(authored['id'])}" is not authorable as a dispatcher profile: ${messageOf(error)}`,
    );
  }
  const profile = parsed.profiles[0];
  if (profile === undefined) {
    throw new SearchSpaceError('the profile parser returned no profile.');
  }
  return profile;
}

/* -------------------------------------------------------------------------- *
 * Feasibility
 * -------------------------------------------------------------------------- */

/**
 * Why a fully-resolved set of values cannot be run, or `undefined` when it can.
 *
 * The implementation behind {@link SearchSpace.validate}. It holds **no rules of its own** — it
 * decodes, parses and builds, and reports whatever `core` refuses, with `core`'s message. A list
 * of feasibility rules maintained here would be a second source of truth for what a dispatcher
 * may be, and it would go stale in the direction that matters: an optimizer would keep sampling
 * a combination the simulator has started rejecting, and every evaluation of it would throw
 * where a search cannot tell a throw from a bad score.
 */
export function validateValues(
  byId: ReadonlyMap<string, SearchParameter>,
  values: Candidate,
): string | undefined {
  // `byId` here is always the **whole** index — `SearchSpace.allById`, which `subspace` carries
  // through unnarrowed. A narrowed index would silently drop every dimension a merged
  // subspace point carries from its base, and the oracle would answer about a dispatcher nobody
  // proposed. See `SearchSpace.allById`.
  const patch = decodeInto(byId, values);
  const authored: Record<string, unknown> = {
    id: 'candidate',
    name: 'Candidate',
    weights: {},
    ...patch,
  };

  let profile: DispatcherProfile;
  try {
    profile = parseProfile(authored);
  } catch (error) {
    return messageOf(error);
  }

  try {
    // Builds whichever policy `auction.aggregation` names, and runs every build-time check the
    // shipped path runs — including the one constraint the declared box does not express, that a
    // destination-entry dispatcher may not defer.
    //
    // The weight-set library is supplied because it is a **run input, not a profile field**, in
    // the same way the building is: `patternSwitching` lives at the top of
    // `data/dispatcher-profiles.json` beside the profile list, and `core` refuses a profile that
    // asks for a selector with nothing to select between. Without a stand-in here the oracle
    // would answer "infeasible" for every draw that turned `selection.policy` on — which is not a
    // fact about the candidate, it is a fact about what the oracle was handed. {@link
    // SEARCH_SPACE_WEIGHT_SETS} is synthetic and minimal on purpose: this file is on the browser
    // barrel and may not read `data/`, and the question being asked is whether the *dispatcher*
    // builds, not whether one particular library resolves.
    createPolicyFor(profile satisfies AuctionProfileSource, {
      weightSets: SEARCH_SPACE_WEIGHT_SETS,
    });
  } catch (error) {
    return messageOf(error);
  }

  try {
    // The arrival model validates its own six, and rejects a learning rate of zero that the
    // profile schema's `gt(0)` already excludes — belt and braces, and free.
    resolvePredictorConfig(profile.idle satisfies PredictorIdleSource | undefined);
  } catch (error) {
    return messageOf(error);
  }

  return undefined;
}

/**
 * Why a candidate cannot be run **on a particular building**, or `undefined` when it can.
 *
 * {@link validateValues} is building-independent: it asks whether a group controller can be
 * built. Two of the eight `answer.*` rows the space carries are not answerable that way, because
 * they are checked against a *car's* timings, and cars differ between buildings:
 *
 * - `answer.maxDwellS` under `answer.dwellPolicy: adaptive` must be at least the larger of the
 *   car's own `dwellCarCallS` and `dwellHallCallS` — *"a lower ceiling would make adaptive dwell
 *   shorter than fixed dwell"*. Declared range `[4, 30]`; hall dwell across `elevator-specs.json`
 *   reaches 7. So a uniform draw is infeasible on some cars a few per cent of the time, and the
 *   failure lands at car construction, where a search sees a **throw** rather than a bad score —
 *   and docs/06 is explicit that *"an optimizer cannot tell a throw from a bad score"*.
 * - `answer.bypassLoadThreshold` must be strictly positive and no greater than
 *   `answer.overloadThreshold`. The declared range starts at `0`, which is one point the load
 *   cell refuses.
 *
 * Neither belongs in the schema as an `activeWhen`: the gate is a *car*, not another parameter.
 * So it belongs here, as a hook a search wires up once against the building it is tuning on:
 *
 * ```ts
 * const feasible = buildingFeasibility(space, building, config.elevatorSpecs, { base: incumbent });
 * const candidate = sampleCandidate(space, rng, { base: candidateFromProfile(space, incumbent), feasible });
 * ```
 *
 * ## The whole dispatcher, or the answer is about something else
 *
 * Both constraints are **conditional on a value the candidate may not carry**: the dwell ceiling
 * only binds under `answer.dwellPolicy: adaptive`, and the bypass threshold is checked against
 * `answer.overloadThreshold`. So this decodes through {@link SearchSpace.allById} — the whole
 * index, which `subspace` carries through unnarrowed — and merges onto `options.base`, the
 * incumbent profile.
 *
 * Neither was true before, and the hole was measured with this function wired exactly as the
 * block above prescribes: a `subspace(space, ['answer.maxDwellS'])` search over the
 * `predictive-balanced` incumbent (which authors `dwellPolicy: adaptive`) accepted **200 of 200**
 * draws on `midtown-office`, of which **4** materialize to profiles whose `resolveDoorConfig`
 * throws `dwellPolicy "adaptive" requires maxDwellS >= the larger base dwell`. Decoding against
 * the narrowed index dropped the `adaptive` the merge had just supplied, `resolveDoorConfig`
 * applied its own `fixed` default, and the constraint never fired — a search seeing a throw where
 * it expects a score, which is the exact failure this function exists to prevent.
 *
 * Like {@link validateValues} it holds no rule of its own — it calls `resolveDoorConfig` and
 * `resolveLoadSensor`, which are the same functions `Car` calls, and reports their messages.
 */
export function buildingFeasibility(
  space: SearchSpace,
  building: ResolvedBuilding,
  elevatorSpecs?: ElevatorSpecs | undefined,
  options: { readonly base?: ProfileSource | undefined } = {},
): (values: Candidate) => string | undefined {
  return (values) => {
    let profile: DispatcherProfile;
    try {
      const merged = applyPatch(
        space,
        options.base ?? EMPTY_BASE,
        decodeInto(space.allById, values),
      );
      profile = parseProfile({
        ...merged,
        id: 'feasibility-probe',
        name: 'Feasibility probe',
      });
    } catch (error) {
      return messageOf(error);
    }
    for (const bank of building.banks) {
      for (const car of bank.cars) {
        try {
          resolveDoorConfig(car, profile.answer);
          resolveLoadSensor(car, elevatorSpecs?.loadSensor, profile.answer);
        } catch (error) {
          return `${building.id}/${bank.id}/${car.id}: ${messageOf(error)}`;
        }
      }
    }
    return undefined;
  };
}

/* -------------------------------------------------------------------------- *
 * The real-vector embedding
 * -------------------------------------------------------------------------- */

/**
 * One coordinate of the real-vector embedding: a parameter id and the inclusive box it lives in.
 *
 * Structurally the `SearchDimension` `tuning/search` declares as its port, and deliberately not
 * imported from there: this module is the one that knows what a parameter *is*, and a search that
 * had to import a type from the thing it searches would be the wrong way round.
 */
export interface VectorDimension {
  readonly id: string;
  /** Inclusive `[min, max]` **in embedded coordinates**, which is not always the declared range. */
  readonly range: readonly [number, number];
}

/**
 * The box a continuous optimizer searches: one coordinate per dimension, in gate order.
 *
 * A continuous optimizer — CMA-ES — moves a real vector by a Gaussian and needs every dimension
 * to be a real interval. Four kinds are not, so each is embedded, and the embedding is the part
 * of this module that a search must not have to know about:
 *
 * | kind | coordinate | why |
 * |---|---|---|
 * | continuous, linear | the value | nothing to do |
 * | continuous, **log** | `ln(value)`, over `[ln min, ln max]` | a Gaussian step in log space is a *ratio* step in the value, which is what a dimension spanning two orders of magnitude needs. A linear step on `idle.predictorCycleS` would be a rounding error at the top of the range and a factor of ten at the bottom |
 * | integer | the value (in log coordinates when the scale is log), rounded on the way back | |
 * | categorical over `n` values | `[0, n)`, the index plus a half | a relaxation: the optimizer moves a real number, the space floors it. The half keeps the encoding of a decoded point at the centre of its cell, so a small step does not flip the value by rounding |
 * | boolean | `[0, 2)`, `0.5` or `1.5` | the same relaxation with `n = 2` |
 *
 * Every dimension is present at every point, because a vector has to be a fixed length; the
 * *gating* is applied on the way back out, by {@link fromVector}.
 */
export function vectorDimensions(space: SearchSpace): readonly VectorDimension[] {
  return Object.freeze(
    space.parameters.map((parameter) =>
      Object.freeze({ id: parameter.id, range: boxOf(parameter) }),
    ),
  );
}

function boxOf(parameter: SearchParameter): readonly [number, number] {
  switch (parameter.type) {
    case 'continuous':
    case 'integer':
      return parameter.scale === 'log'
        ? [Math.log(parameter.min), Math.log(parameter.max)]
        : [parameter.min, parameter.max];
    case 'categorical':
      return [0, parameter.values.length];
    case 'boolean':
      return [0, 2];
  }
}

/**
 * A candidate as a point in the box {@link vectorDimensions} describes.
 *
 * A dimension the candidate does not carry — one its gates switched off — contributes its
 * **declared default's** coordinate rather than a hole, because a vector has a fixed length and
 * the default is what the run will actually use for that knob. So the point describes the system
 * that was measured, which is the property `cmaes.ts` needs when it updates its distribution from
 * what was evaluated rather than from what was proposed.
 */
export function toVector(space: SearchSpace, candidate: Candidate): readonly number[] {
  return Object.freeze(
    space.parameters.map((parameter) =>
      coordinateOf(parameter, candidate.get(parameter.id) ?? parameter.default),
    ),
  );
}

function coordinateOf(parameter: SearchParameter, value: ParameterValue): number {
  switch (parameter.type) {
    case 'continuous':
    case 'integer': {
      const numeric = typeof value === 'number' ? value : parameter.default;
      return parameter.scale === 'log' ? Math.log(numeric) : numeric;
    }
    case 'categorical': {
      const index = parameter.values.indexOf(typeof value === 'string' ? value : parameter.default);
      return (index < 0 ? 0 : index) + 0.5;
    }
    case 'boolean':
      return value === true ? 1.5 : 0.5;
  }
}

/**
 * A point in the box, read back as a candidate.
 *
 * Coordinates outside the box are folded in rather than rejected — a continuous optimizer
 * proposes outside its bounds routinely, and a throw would be a score it cannot interpret.
 * Integers are rounded, categoricals floored, and **gates are re-applied**, so the result carries
 * exactly the dimensions that are live at it.
 *
 * That last step is why `toVector(fromVector(v))` is not `v` in general: a rounded integer and a
 * floored categorical both move the coordinate to the centre of the cell they landed in. It *is*
 * idempotent — one more round trip changes nothing — which is the property a search needs when it
 * re-encodes what it decoded.
 *
 * ## The fold **reflects**; it does not clamp — and it is still not a feasibility check
 *
 * Clamping piles every out-of-box proposal onto the two endpoints, and an endpoint of a declared
 * range is not always a value `core` will run. `answer.bypassLoadThreshold` declares `[0, 1]` and
 * `resolveLoadSensor` requires it strictly positive, so a clamping fold *manufactures* an
 * infeasible point out of a perfectly ordinary proposal: measured at **67 of 500** CMA-ES-shaped
 * proposals (mean at box centre, sigma half the box width) decoding to exactly `0`. Reflection —
 * the same fold {@link perturbValue} already uses at a bound, and for the same reason — puts them
 * back inside on a continuum instead, and the count goes to zero.
 *
 * Reflection is a repair, not an oracle. The declared box still contains points `core` refuses:
 * on the same 500 proposals, 63 were refused by `SearchSpace.validate` outright. **Nothing here
 * checks that**, because a decoder that threw would be a score CMA-ES cannot interpret. The
 * caller must ask — `vectorSpace(space, options).reasonFor(candidate)` is that question, and
 * `cmaes.ts` is where it has to be asked.
 */
export function fromVector(
  space: SearchSpace,
  vector: readonly number[],
  options: { readonly base?: Candidate | undefined } = {},
): Candidate {
  if (vector.length !== space.parameters.length) {
    throw new SearchSpaceError(
      `a point of this space has ${space.parameters.length} coordinates; received ${vector.length}.`,
    );
  }
  const values = new Map<string, ParameterValue>();
  for (const [index, parameter] of space.parameters.entries()) {
    const read: GateReader = (id) =>
      values.get(id) ?? options.base?.get(id) ?? space.defaults.get(id);
    if (!isActive(parameter, read)) continue;
    values.set(parameter.id, valueOf(parameter, vector[index] as number));
  }
  return values;
}

function valueOf(parameter: SearchParameter, coordinate: number): ParameterValue {
  const [low, high] = boxOf(parameter);
  // A non-finite coordinate is not a point of the box and there is no fold that means anything for
  // it. It decodes to the dimension's **declared default** — the value the resolver would apply
  // anyway — rather than to an endpoint, because an endpoint is a value somebody might then read
  // as a decision the optimizer made.
  const folded = Number.isFinite(coordinate)
    ? reflectInto(coordinate, low, high)
    : coordinateOf(parameter, parameter.default);
  switch (parameter.type) {
    case 'continuous': {
      if (parameter.scale !== 'log') {
        return Math.min(parameter.max, Math.max(parameter.min, folded));
      }
      // Clamped after the exponential, not only in box coordinates: `exp(log(1800))` is
      // `1800.0000000000005`, which is outside a declared range the profile schema will enforce.
      const once = Math.min(parameter.max, Math.max(parameter.min, Math.exp(folded)));
      // **And normalized to the fixed point of `exp ∘ log`, which is what makes the round trip
      // idempotent rather than nearly so.** `exp(log(y)) === y` fails by one ulp for some
      // doubles, so `decode(encode(decode(v)))` could move a log-scaled coordinate a second time
      // — `normalization.distanceM` at 5.873516484765638 came back 5.873516484765639 — which is
      // exactly what `sample.test.ts`'s idempotence claim forbids and what `cmaes.ts` relies on
      // when it updates its distribution from what was evaluated. Latent: it was reached only
      // when the dimension count changed and moved the draw sequence. One normalization suffices,
      // checked over three million draws across this dimension's declared range with zero
      // survivors, and it is a no-op for every value that was already a fixed point.
      return Math.min(parameter.max, Math.max(parameter.min, Math.exp(Math.log(once))));
    }
    case 'integer': {
      const natural = parameter.scale === 'log' ? Math.exp(folded) : folded;
      return Math.min(parameter.max, Math.max(parameter.min, Math.round(natural)));
    }
    case 'categorical': {
      const index = Math.min(parameter.values.length - 1, Math.max(0, Math.floor(folded)));
      return parameter.values[index] as string;
    }
    case 'boolean':
      return folded >= 1;
  }
}

/**
 * Fold a value back into `[low, high]` by reflection, however far outside it started.
 *
 * One implementation, used by both folds this module owns: {@link fromVector}'s, which reads a
 * coordinate a continuous optimizer proposed, and `perturbValue`'s, which reads a Gaussian step.
 * Reflection rather than clamping in both, for the reason `perturbValue` states and
 * {@link fromVector} measures: clamping concentrates probability on the two endpoints, and an
 * endpoint of a declared range is sometimes a value `core` refuses to run.
 */
export function reflectInto(value: number, low: number, high: number): number {
  const span = high - low;
  if (!(span > 0)) return low;
  const folded = Math.abs((value - low) % (2 * span));
  return low + (folded > span ? 2 * span - folded : folded);
}

/* -------------------------------------------------------------------------- *
 * Comparison
 * -------------------------------------------------------------------------- */

/**
 * Whether two candidates are the same point, keys, order and values.
 *
 * Order is compared as well as content, because the space fixes it and a difference in it means
 * one of the two did not come from this space. Values compare with `Object.is`, so `-0` and `0`
 * are distinguished — a distinction that costs nothing and that a rounding bug would show up in.
 */
export function candidatesEqual(a: Candidate, b: Candidate): boolean {
  if (a.size !== b.size) return false;
  const left = [...a];
  const right = [...b];
  for (let index = 0; index < left.length; index += 1) {
    const one = left[index];
    const other = right[index];
    if (one === undefined || other === undefined) return false;
    if (one[0] !== other[0]) return false;
    if (!Object.is(one[1], other[1])) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- *
 * Helpers
 * -------------------------------------------------------------------------- */

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describe(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}
