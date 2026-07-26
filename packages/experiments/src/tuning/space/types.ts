/**
 * The vocabulary of the search space: what a tunable dimension is, what a candidate is, and
 * what a candidate turns back into.
 *
 * ## What this module is for
 *
 * docs/06-parameterization-and-tuning.md § *The parameter schema* states the contract Phase 7
 * turns on:
 *
 * > *"For an optimizer to search this space **without knowing anything about elevators**, the
 * > parameters must be self-describing."*
 *
 * `core` already holds up its half. Every tunable declares `type`, `range`/`values`, `default`,
 * `description` and — for a conditional one — `activeWhen`, in a `DispatchParameterSpec`. What
 * `core` does **not** hold is the other half an optimizer needs: one list containing *every*
 * declared dimension, a way to draw a valid point from it, and a way to write a point back as a
 * dispatcher profile. That is this module.
 *
 * The whole of `tuning/space/` is written so that nothing downstream of it — `search`, `report` —
 * contains the word *floor*, *car* or *call*. A search algorithm sees four parameter kinds, two
 * scales, a conjunction of gates, and an `Rng`.
 *
 * ## Three shapes, and why they are different
 *
 * | shape | what it is | who reads it |
 * |---|---|---|
 * | {@link SearchParameter} | one dimension, **validated**: bounds are finite, a default is in range, a categorical has values | the sampler, the neighbourhood generator, a report |
 * | {@link Candidate} | one point: parameter id → value, carrying **only the dimensions that are live** | the optimizer, the runner |
 * | {@link ProfilePatch} | the same point as JSON a `data/dispatcher-profiles.json` profile could hold verbatim | `loadConfig`, `createPolicyFor` |
 *
 * A {@link SearchParameter} is deliberately *not* a `DispatchParameterSpec`. The spec is a
 * declaration and may in principle be malformed — a `continuous` row with no `range`, a
 * `categorical` whose default is not among its values. `collectSearchSpace` checks all of that
 * once, at collection, and hands the sampler a discriminated union where `min`, `max`, `scale`
 * and `values` are **present and total**. An optimizer that has to write `spec.range?.[0] ?? 0`
 * is an optimizer one typo away from searching `[0, 0]` and reporting that the dimension does
 * nothing.
 *
 * ## Why a `Candidate` is a `Map` and not an object
 *
 * Three reasons, all of them invariants:
 *
 * - **Deterministic ordering (CLAUDE.md invariant 4).** A `Map` iterates in insertion order, and
 *   the space inserts in one fixed order, so two candidates from the same space enumerate their
 *   dimensions identically. An object literal built from dotted keys does too in practice, but
 *   only by V8's integer-key rules, which is not a contract.
 * - **A dotted id is a key, not a path.** `weights.waitTime` names one dimension. Storing it in
 *   a nested object would require the reader to know which prefixes are sections, which is
 *   elevator knowledge.
 * - **Absence means inactive.** A candidate omits every dimension whose `activeWhen` is unmet, so
 *   `candidate.has(id)` is the question "did this configuration search that knob", and a `Map`
 *   answers it without confusing it with "the value is `undefined`".
 */

import type { DispatchParameterSpec } from '@elevator-sim/core';

/* -------------------------------------------------------------------------- *
 * Errors
 * -------------------------------------------------------------------------- */

/**
 * A search space that cannot be built, or a candidate that cannot be drawn from one.
 *
 * Thrown rather than returned, and thrown at collection time rather than at sampling time,
 * because every case is a claim about the schema that is false: a `continuous` row with no
 * bounds, a `log` scale over a range that reaches zero, an `activeWhen` cycle. A space that
 * silently dropped such a row would leave an optimizer reporting a winner that is only optimal
 * at whatever the dropped dimension happened to be — which is the exact defect
 * `dispatch/parameters.ts` names as *"nothing hidden"*.
 */
export class SearchSpaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchSpaceError';
  }
}

/* -------------------------------------------------------------------------- *
 * Values
 * -------------------------------------------------------------------------- */

/** Everything a declared tunable can hold. The same union `dispatchParameterValue` returns. */
export type ParameterValue = number | string | boolean;

/**
 * How a numeric range is traversed.
 *
 * `linear` is uniform over `[min, max]`; `log` is uniform over `[ln min, ln max]`, which is what
 * a dimension spanning orders of magnitude needs — `idle.predictorHorizonS` runs 30 s to 3 600 s
 * and a linear draw would put 99 % of its mass above a minute.
 */
export type ParameterScale = 'linear' | 'log';

/**
 * One `activeWhen` condition, taken from `core`'s own spec type rather than restated.
 *
 * Structural indexing rather than a named import because `ActiveWhenCondition` and
 * `ActiveWhenRange` are declared in `core/dispatch/types.ts` and **not re-exported from
 * `@elevator-sim/core`'s barrel**, which is the only specifier this package may import
 * (`experiments` depends on `core` and nothing else). Derived this way the two cannot drift: a
 * third `activeWhen` form landing in `core` changes this type without an edit here.
 */
export type ActiveWhenConditions = NonNullable<DispatchParameterSpec['activeWhen']>;

/** The condition on one gate. Either the values that make a knob live, or a numeric interval. */
export type ActiveWhenCondition = Exclude<ActiveWhenConditions[string], undefined>;

/** Reads whatever a gate id currently holds. `undefined` when the id is not set anywhere. */
export type GateReader = (id: string) => ParameterValue | undefined;

/* -------------------------------------------------------------------------- *
 * activeWhen — one evaluation rule, for both forms
 *
 * Declared here, beside the condition type, so `collect.ts` and `encode.ts` share one
 * implementation without either importing the other. There is exactly one rule in this module
 * and every gate in every schema evaluates through it, which is the property docs/06 turns on.
 * -------------------------------------------------------------------------- */

/**
 * Whether one `activeWhen` condition is satisfied by the gate's current value.
 *
 * **This is a restatement of `activeWhenSatisfied` in `core/dispatch/parameters.ts`, and it is
 * one only because that function is not on `@elevator-sim/core`'s barrel.** docs/06 is explicit
 * that there is one rule and that *"an optimizer implements it once"*; `core` implements it and
 * exports `DISPATCH_PARAMETERS`, `dispatchParameter` and `dispatchParameterValue` beside it, but
 * not `activeWhenSatisfied`, `isParameterActive` or `isActiveWhenRange`. `experiments` may import
 * `@elevator-sim/core` and nothing else — reaching into a subpath is a dependency in everything
 * but the manifest — so the rule is restated here, once, and `collect.test.ts` pins it against
 * `core`'s own table of cases from `dispatch/parameters.test.ts`. **If those three names reach the
 * barrel, delete this and import them.**
 *
 * The rule, unchanged:
 *
 * - **value list** — the gate's current value is in the list; a boolean gate compares as
 *   `"true"` / `"false"`.
 * - **interval** — the gate's current value is a finite number inside the inclusive `[min, max]`,
 *   either bound optional.
 * - **either** — a gate that cannot be read, absent or of the wrong runtime type, is **not**
 *   satisfied. Guessing would activate a knob whose condition nobody evaluated.
 */
export function activeWhenSatisfied(
  condition: ActiveWhenCondition,
  value: ParameterValue | undefined,
): boolean {
  if (isActiveWhenRange(condition)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (condition.min !== undefined && value < condition.min) return false;
    if (condition.max !== undefined && value > condition.max) return false;
    return true;
  }
  if (value === undefined) return false;
  return condition.includes(typeof value === 'string' ? value : String(value));
}

/** Whether a condition is the numeric form rather than the value-list form. */
export function isActiveWhenRange(
  condition: ActiveWhenCondition,
): condition is Exclude<ActiveWhenCondition, readonly string[]> {
  return !Array.isArray(condition);
}

/**
 * Whether a dimension is live, given a way to read any other dimension.
 *
 * `activeWhen` is a **conjunction**: every condition must hold. That is what lets
 * `auction.reserveMarginalDelayS` require both a `contract-net` aggregation *and* two or more
 * rounds, which is the gate the numeric form landed for.
 */
export function isActive(parameter: SearchParameter, read: GateReader): boolean {
  const conditions = parameter.activeWhen;
  if (conditions === undefined) return true;
  for (const [id, condition] of Object.entries(conditions)) {
    if (condition === undefined) continue;
    if (!activeWhenSatisfied(condition, read(id))) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- *
 * Parameters
 * -------------------------------------------------------------------------- */

/** What every kind of dimension carries. */
export interface SearchParameterCommon {
  /** The dotted path of the value in `data/dispatcher-profiles.json`. Unique in a space. */
  readonly id: string;
  /** `id` up to the first dot: `weights`, `dispatch`, `idle`, `auction`, … */
  readonly section: string;
  /** `id` after the first dot. */
  readonly key: string;
  /** The value the resolver applies when a profile says nothing. */
  readonly default: ParameterValue;
  /**
   * The declaring schema's prose.
   *
   * Machine-readable in the sense docs/06 means: it is what a search reads to decide where to
   * spend budget, and the one part of the schema nothing type-checks. Carried through verbatim.
   */
  readonly description: string;
  /** SI unit, or absent for a dimensionless quantity. */
  readonly unit?: string | undefined;
  /**
   * Gate id to the condition on it that makes this dimension live. A conjunction: all must hold.
   *
   * A dimension whose gate is unmet is **omitted from the candidate entirely**, so no replication
   * budget — 50 to 200 an evaluation — is spent on a knob that cannot move the objective.
   */
  readonly activeWhen?: ActiveWhenConditions | undefined;
  /**
   * Every `*_PARAMETERS` export that declared this id, in discovery order.
   *
   * Usually one. `answer.bypassLoadThreshold` has two — `CAR_PARAMETERS` re-exports
   * `LOAD_SENSOR_PARAMETERS` wholesale — and the collector requires the declarations to be
   * identical before merging them, so provenance is a fact rather than a guess.
   */
  readonly declaredBy: readonly string[];
}

/** A real-valued dimension with finite inclusive bounds. */
export interface ContinuousParameter extends SearchParameterCommon {
  readonly type: 'continuous';
  readonly min: number;
  readonly max: number;
  readonly scale: ParameterScale;
  readonly default: number;
}

/** An integer-valued dimension with finite inclusive integer bounds. */
export interface IntegerParameter extends SearchParameterCommon {
  readonly type: 'integer';
  readonly min: number;
  readonly max: number;
  readonly scale: ParameterScale;
  readonly default: number;
}

/** A dimension over a finite named set. */
export interface CategoricalParameter extends SearchParameterCommon {
  readonly type: 'categorical';
  /** Non-empty, and contains {@link default}. */
  readonly values: readonly string[];
  readonly default: string;
}

/** A two-valued dimension. */
export interface BooleanParameter extends SearchParameterCommon {
  readonly type: 'boolean';
  readonly default: boolean;
}

/** One searchable dimension. Discriminated on `type`, exactly as docs/06 names the four kinds. */
export type SearchParameter =
  | ContinuousParameter
  | IntegerParameter
  | CategoricalParameter
  | BooleanParameter;

/** The two kinds that carry `min`, `max` and `scale`. */
export type NumericParameter = ContinuousParameter | IntegerParameter;

/* -------------------------------------------------------------------------- *
 * Candidates
 * -------------------------------------------------------------------------- */

/**
 * One point in the space: parameter id to value, carrying only the dimensions that are live.
 *
 * Iterates in the space's own order, so two candidates from one space enumerate identically and
 * a fingerprint of one is stable (CLAUDE.md invariant 4).
 */
export type Candidate = ReadonlyMap<string, ParameterValue>;

/* -------------------------------------------------------------------------- *
 * The profile patch
 * -------------------------------------------------------------------------- */

/**
 * A candidate as JSON a dispatcher profile could hold verbatim.
 *
 * The output of `decodeCandidate` and the input of `encodeCandidate`. Every section here is one
 * `dispatcherProfileSchema` declares, and the field names are the schema's, so
 * `{ id, name, weights: {}, ...patch }` parses through the real profile parser without
 * translation — which is docs/06's other half of the contract: *"every declared `id` must be
 * authorable into `data/dispatcher-profiles.json` and survive a `loadConfig` round trip."*
 *
 * Values are typed loosely on purpose. A patch is **data** flowing towards a validator; narrowing
 * `dispatch.callType` to `CallType` here would mean this module knew what a call type is, and the
 * narrowing that matters happens where it can be checked, in `parseDispatcherProfiles`.
 *
 * The stage sections are typed {@link ProfileSection} — that is, `object` — rather than
 * `Record<string, ParameterValue>`, and the reason is a TypeScript rule rather than a design
 * choice: `core` declares `DispatchStageConfig` and its siblings as **interfaces**, and an
 * interface has no implicit index signature, so a real `DispatcherProfile` would not be assignable
 * to the narrower shape. Since reading a *tuned winner* back out of a loaded profile is the main
 * thing this type is for, the type has to admit one.
 */
export type ProfileSection = object;

export interface ProfilePatch {
  readonly weights?: Readonly<Record<string, number>> | undefined;
  /**
   * The one declared id whose authored form is not its dotted path.
   *
   * `constraints.noDirectionReversal` is declared as a **boolean**, because a set-valued
   * parameter is not something a generic optimizer can sample and a boolean per member is. It is
   * authored as membership in this array. The translation is one function
   * (`decodeCandidate`/`encodeCandidate`) and it is asserted rather than assumed.
   */
  readonly hardConstraints?: readonly string[] | undefined;
  readonly normalization?: ProfileSection | undefined;
  readonly dispatch?: ProfileSection | undefined;
  readonly eligibility?: ProfileSection | undefined;
  readonly answer?: ProfileSection | undefined;
  readonly idle?: ProfileSection | undefined;
  readonly auction?: ProfileSection | undefined;
}

/**
 * What `decodeCandidate` needs to know about the profile a candidate patches.
 *
 * Structural, so a real `DispatcherProfile` from `loadConfig` satisfies it without a cast and a
 * hand-built fixture does too.
 */
export interface ProfileSource extends ProfilePatch {
  readonly id: string;
  readonly name: string;
  readonly weights: Readonly<Record<string, number>>;
}

/* -------------------------------------------------------------------------- *
 * The space
 * -------------------------------------------------------------------------- */

/**
 * Every searchable dimension, collected from every schema `core` declares.
 *
 * `parameters` is in **gate order**: a stable topological sort of the discovery order by
 * `activeWhen`, so a gate is always drawn before anything it gates. That is what lets the
 * sampler decide, in one pass and without backtracking, whether a dimension is live —
 * `weights.rideTime` is declared before `dispatch.callType` and gated on it, so declaration
 * order alone would have the sampler asking a question nothing had answered yet.
 */
export interface SearchSpace {
  /** Searchable dimensions, in gate order. */
  readonly parameters: readonly SearchParameter[];
  readonly byId: ReadonlyMap<string, SearchParameter>;
  /** `parameters.map(p => p.id)`, for a quick membership test and for reporting. */
  readonly ids: readonly string[];
  /**
   * Every dimension the *full* collection found, by id — kept whole through `subspace` exactly as
   * {@link defaults} is, and for the same reason.
   *
   * `byId` is what a space **searches**. `allById` is what a candidate can **mean**. The two
   * differ only after `subspace`, and the difference is load-bearing: a subspace search draws over
   * `byId` and is judged over `allById`, because `sampleCandidate` merges the base — the
   * incumbent, as a candidate — into the point it hands the oracle, and *half a dispatcher cannot
   * be judged*.
   *
   * Decoding that merged point against the **narrowed** index drops every base dimension it
   * carries, which leaves {@link validate} inert for exactly the subspace-plus-incumbent search
   * this module documents as its main use. Measured, before the fix: over
   * `subspace(space, ['dispatch.assignmentTiming', 'dispatch.deferWindowS'])` against a
   * `{ dispatch.callType: 'destination-entry' }` base, **24 of 50** validated draws came back
   * `deferred` — the one combination `createPolicyFor` refuses, and the one this module's own
   * docstrings claim it rejects one draw in eight.
   */
  readonly allById: ReadonlyMap<string, SearchParameter>;
  /**
   * The default of every dimension the *full* collection found, including ones this space has
   * been narrowed away from.
   *
   * Kept whole through `subspace` on purpose: narrowing the search to `idle.*` must not make
   * `idle.repositionThresholdS`'s gate unreadable and silently deactivate it. A gate outside the
   * searched set still has a value — whatever the base profile or the resolver gives it — and
   * this is the last fallback for reading one.
   */
  readonly defaults: ReadonlyMap<string, ParameterValue>;
  /**
   * Why a fully-resolved set of values cannot be run, or `undefined` when it can.
   *
   * The space's own feasibility oracle, and it is deliberately **not** a list of rules this
   * module maintains. It decodes the values into a profile, parses that profile through
   * `parseDispatcherProfiles`, and builds a policy from it with `createPolicyFor`. Whatever
   * `core` refuses, this refuses, with `core`'s own message.
   *
   * Decoding goes through {@link allById}, **not** {@link byId}, so a merged subspace point is
   * decoded whole. See {@link allById} for what breaks when it is not.
   *
   * It is building-independent: it asks whether a group controller can be built. Two declared
   * `answer.*` rows are only decidable against a *car* — see `buildingFeasibility`, which a
   * search wires in beside this one.
   *
   * It exists because the declared box is **not** the feasible set, and an optimizer sampling
   * each row independently will leave the box. There is exactly one such constraint today and
   * `core` states it: a `destination-entry` dispatcher may not defer, *"that constraint is a
   * documented cost of the approach and this simulator measures it; it must not be configured
   * away."* One in eight uniform draws over the full space violates it.
   */
  readonly validate: (values: Candidate) => string | undefined;
}
