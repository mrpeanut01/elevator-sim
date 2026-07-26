/**
 * The search space, **discovered** rather than listed.
 *
 * ## Why discovery, and not a list
 *
 * A hand-listed search space is the same defect this repository has now shipped four times in
 * other forms: a thing that is configurable, unit-tested in isolation, and not actually wired to
 * the path that matters (docs/05-roadmap.md § *Standing requirement*). A list of 48 parameter
 * ids passes every check anyone runs, right up to the moment a 49th is declared — and then the
 * optimizer reports a tuned winner that is only optimal at whatever the 49th happened to be,
 * with nothing anywhere reading as wrong. `dispatch/parameters.ts` names the same failure from
 * the other side and calls it *"nothing hidden"*.
 *
 * So the space is derived, in two steps, from two facts that are already true:
 *
 * 1. **Discovery.** Every schema `core` declares is an export of `@elevator-sim/core` whose name
 *    ends in `_PARAMETERS` and whose value is an array of `DispatchParameterSpec`. That is a
 *    convention `core` already follows without exception — `DISPATCH_PARAMETERS`,
 *    `POLICY_PARAMETERS`, `PREDICTOR_PARAMETERS`, `DOOR_PARAMETERS`, `CAR_PARAMETERS`,
 *    `LOAD_SENSOR_PARAMETERS`, `TRAFFIC_PARAMETERS`, `METRICS_PARAMETERS`,
 *    `ANALYTICAL_PARAMETERS`, `SIM_PARAMETERS` — and {@link discoverParameterSchemas} reads it
 *    off the module namespace at run time. A new `parameters.ts` needs no edit here.
 * 2. **Membership.** A dimension belongs to *this* space when a dispatcher profile can hold it.
 *    Not "is it in `dispatch/`" — that is a directory, and a directory is a place rather than a
 *    contract. docs/06 § *`id` is a path a profile can actually hold* states the real rule:
 *    *"every declared `id` must be authorable into `data/dispatcher-profiles.json` and survive a
 *    `loadConfig` round trip."* {@link isProfileAuthorable} decides it by **trying** — it writes
 *    the parameter into a profile and runs `parseDispatcherProfiles` over it.
 *
 * The two together are why `collect.test.ts` can walk `packages/core/src` on disk, find every
 * file that declares a schema, and assert that each of their rows is either in the space or
 * fails the authorability probe — with no allowlist to keep in step.
 *
 * ## What that rule includes, and the one thing it might look like it should not
 *
 * It admits eight `answer.*` rows that `DOOR_PARAMETERS`, `CAR_PARAMETERS` and
 * `LOAD_SENSOR_PARAMETERS` declare — dwell policy and its gain, the dwell ceiling, the reopen
 * budget, the transfer ceiling, the bypass and overload thresholds. They are not declared in
 * `dispatch/`, and they belong in the space anyway: docs/06 § Layer 2 *Stage 6* lists every one
 * of them as a stage-6 tunable, they are authored under `profile.answer` in
 * `data/dispatcher-profiles.json`, and `predictive-balanced` authors four of them today. The
 * door machine owning the *implementation* is what stops them being declared twice; it is not a
 * reason for a dispatcher search to pretend the operator cannot retune a dwell.
 *
 * It excludes `car.*`, `traffic.*`, `metrics.*`, `analytical.*` and `sim.*`, all for the same
 * mechanical reason and none by name: no dispatcher profile has a section that can hold them.
 * They are building fabric, demand, measurement and harness — the things a dispatcher is
 * *measured against*, and a search that moved them would be tuning the ruler.
 *
 * ## Gate order
 *
 * `parameters` comes back in a stable topological sort by `activeWhen`, because a sampler has to
 * know `dispatch.callType` before it can decide whether `weights.rideTime` is live, and the
 * declared order has them the other way round. Stable, so the order is a function of the schema
 * and nothing else (CLAUDE.md invariant 4).
 */

import * as core from '@elevator-sim/core';
import type { DispatchParameterSpec } from '@elevator-sim/core';

import { decodeInto, encodeCandidate, validateValues } from './encode.js';
import type {
  Candidate,
  GateReader,
  ParameterScale,
  ParameterValue,
  ProfilePatch,
  SearchParameter,
  SearchSpace,
} from './types.js';
import { SearchSpaceError, isActive } from './types.js';

/**
 * The `activeWhen` rule, re-exported from `types.ts`.
 *
 * It lives there so `collect.ts` and `encode.ts` can share one implementation without importing
 * each other, and it is re-exported here because this is where a reader looks for it: the gate
 * rule is what makes a *collected space* narrower than a declared one.
 */
export { activeWhenSatisfied, isActive, isActiveWhenRange } from './types.js';

/* -------------------------------------------------------------------------- *
 * Discovery
 * -------------------------------------------------------------------------- */

/** The suffix every declared schema's export name carries. */
export const PARAMETER_SCHEMA_SUFFIX = '_PARAMETERS';

/** The module namespace discovery reads by default. */
const CORE_NAMESPACE = core as unknown as Readonly<Record<string, unknown>>;

/**
 * Every parameter schema a module namespace exports, by export name, in name order.
 *
 * Sorted by name rather than left in namespace order because a bundler is free to reorder a
 * namespace object's keys and the space's ordering must not depend on one (CLAUDE.md
 * invariant 4).
 */
export function discoverParameterSchemas(
  source: Readonly<Record<string, unknown>> = CORE_NAMESPACE,
): ReadonlyMap<string, readonly DispatchParameterSpec[]> {
  const found = new Map<string, readonly DispatchParameterSpec[]>();
  for (const name of Object.keys(source).sort()) {
    if (!name.endsWith(PARAMETER_SCHEMA_SUFFIX)) continue;
    const value = source[name];
    if (!isParameterSpecArray(value)) continue;
    found.set(name, value);
  }
  return found;
}

function isParameterSpecArray(value: unknown): value is readonly DispatchParameterSpec[] {
  return Array.isArray(value) && value.every(isParameterSpec);
}

function isParameterSpec(value: unknown): value is DispatchParameterSpec {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<DispatchParameterSpec>;
  return (
    typeof row.id === 'string' &&
    typeof row.type === 'string' &&
    typeof row.description === 'string' &&
    Object.hasOwn(row, 'default')
  );
}

/* -------------------------------------------------------------------------- *
 * Membership: can a dispatcher profile hold this id?
 * -------------------------------------------------------------------------- */

const authorable = new Map<DispatchParameterSpec, boolean>();

/**
 * Whether a declared parameter is one a `data/dispatcher-profiles.json` profile can hold.
 *
 * Decided by **doing it**: the parameter's own default is written into a profile at its declared
 * dotted path and the profile is run through `parseDispatcherProfiles`, which is the function
 * `loadConfig` calls. So this answers the question docs/06 actually asks — *"is this id a path a
 * profile can hold"* — rather than a proxy for it such as "is it declared in `dispatch/`".
 *
 * Uses the declared **default** as the probe value, because a default is by construction the
 * value the resolver applies and is therefore the one value guaranteed to be admissible if
 * anything is. A parameter whose default its own file schema rejects is a defect, and it shows up
 * here as an exclusion, which `collect.test.ts` then reports as a row that no space carries.
 *
 * Memoized per spec object; the specs are frozen module constants, so the memo is safe.
 */
export function isProfileAuthorable(spec: DispatchParameterSpec): boolean {
  const cached = authorable.get(spec);
  if (cached !== undefined) return cached;

  let verdict = false;
  const dot = spec.id.indexOf('.');
  const value = spec.default;
  const scalar = typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
  if (dot > 0 && dot < spec.id.length - 1 && scalar) {
    // A one-entry index is all `decodeInto` needs: it routes on `section` and `key` and never
    // reads `type`, so the placeholder shape below cannot change where the value is written. The
    // row is deliberately *not* validated first — a malformed row must be reported as malformed
    // by `toSearchParameter`, not silently excluded here as unauthorable.
    const probe: SearchParameter = {
      id: spec.id,
      section: spec.id.slice(0, dot),
      key: spec.id.slice(dot + 1),
      type: 'boolean',
      default: true,
      description: spec.description,
      declaredBy: [],
    };
    try {
      const patch = decodeInto(new Map([[spec.id, probe]]), new Map([[spec.id, value]]));
      verdict = parses({ id: 'probe', name: 'Probe', weights: {}, ...patch });
    } catch {
      verdict = false;
    }
  }

  authorable.set(spec, verdict);
  return verdict;
}

function parses(authored: Readonly<Record<string, unknown>>): boolean {
  try {
    core.parseDispatcherProfiles(
      {
        version: 1,
        terms: core.COST_TERMS.map((term) => ({
          id: term.id,
          measures: term.measures,
          serves: 'search-space probe',
        })),
        normalization: { required: true },
        profiles: [authored],
      },
      '<tuning search space probe>',
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * A reader over a candidate, falling back to a base point and then to the declared defaults.
 *
 * The three-layer fallback is what makes a **subspace** searchable: a gate the search is not
 * moving still has a value — the base profile's, or failing that the one the resolver would
 * apply — so narrowing the search to `idle.*` cannot silently deactivate
 * `idle.repositionThresholdS` by making `idle.parkingStrategy` unreadable. An id nothing knows
 * about reads as `undefined`, which per the rule above leaves its dependants inactive.
 */
export function readerFor(
  space: SearchSpace,
  values: Candidate,
  base?: Candidate | undefined,
): GateReader {
  return (id) => values.get(id) ?? base?.get(id) ?? space.defaults.get(id);
}

/** Every dimension of a space that is live at a point. In gate order. */
export function activeParameters(
  space: SearchSpace,
  values: Candidate,
  base?: Candidate | undefined,
): readonly SearchParameter[] {
  const read = readerFor(space, values, base);
  return space.parameters.filter((parameter) => isActive(parameter, read));
}

/* -------------------------------------------------------------------------- *
 * Collection
 * -------------------------------------------------------------------------- */

/** How a space is collected. Everything has a default that is the honest whole space. */
export interface CollectOptions {
  /**
   * The module namespace to discover schemas in. Defaults to `@elevator-sim/core`.
   *
   * Injectable so `collect.test.ts` can hand in a namespace with an extra schema and prove the
   * discovery really is discovery — a hand-listed collector passes every other test in this file.
   */
  readonly source?: Readonly<Record<string, unknown>> | undefined;
  /**
   * Which declared parameters belong to the space. Defaults to {@link isProfileAuthorable}.
   *
   * A predicate rather than a list, for the reason this whole file exists.
   */
  readonly include?: ((spec: DispatchParameterSpec) => boolean) | undefined;
}

/**
 * Collect every declared, profile-authorable tunable into one search space.
 *
 * @throws SearchSpaceError if two schemas declare the same id differently, if a row is malformed
 *   for its own declared type, or if `activeWhen` contains a cycle.
 */
export function collectSearchSpace(options: CollectOptions = {}): SearchSpace {
  const schemas = discoverParameterSchemas(options.source ?? CORE_NAMESPACE);
  const include = options.include ?? isProfileAuthorable;

  /* ---- flatten, deduplicating identical re-declarations ---- */
  const specs = new Map<string, { spec: DispatchParameterSpec; declaredBy: string[] }>();
  for (const [schema, rows] of schemas) {
    for (const spec of rows) {
      const existing = specs.get(spec.id);
      if (existing === undefined) {
        specs.set(spec.id, { spec, declaredBy: [schema] });
        continue;
      }
      // `CAR_PARAMETERS` spreads `LOAD_SENSOR_PARAMETERS`, so two schemas legitimately declare
      // `answer.bypassLoadThreshold`. Two schemas declaring it *differently* is a defect that
      // would otherwise resolve to whichever name sorts first — an optimizer searching one
      // range while the engine reads the other.
      if (!sameDeclaration(existing.spec, spec)) {
        throw new SearchSpaceError(
          `"${spec.id}" is declared by both ${existing.declaredBy.join(', ')} and ${schema}, with different declarations. Two declarations of one knob are two sources of truth, and a search would use one while the engine read the other.`,
        );
      }
      existing.declaredBy.push(schema);
    }
  }

  /* ---- narrow to what a profile can hold, then validate the shape ---- */
  const collected: SearchParameter[] = [];
  const defaults = new Map<string, ParameterValue>();
  for (const { spec, declaredBy } of specs.values()) {
    if (!include(spec)) continue;
    const parameter = toSearchParameter(spec, declaredBy);
    collected.push(parameter);
    defaults.set(parameter.id, parameter.default);
  }

  const parameters = gateOrder(collected);
  const byId = new Map(parameters.map((parameter) => [parameter.id, parameter]));

  return Object.freeze({
    parameters: Object.freeze(parameters),
    byId,
    ids: Object.freeze(parameters.map((parameter) => parameter.id)),
    defaults,
    validate: (values: Candidate) => validateValues(byId, values),
  });
}

let cached: SearchSpace | undefined;

/**
 * The whole space, collected once per process.
 *
 * Collection runs a zod parse per declared parameter to decide authorability, so it is cheap but
 * not free; every caller wants the same answer, and the schemas it reads are frozen constants.
 */
export function searchSpace(): SearchSpace {
  cached ??= collectSearchSpace();
  return cached;
}

/* -------------------------------------------------------------------------- *
 * Narrowing
 * -------------------------------------------------------------------------- */

/**
 * A space restricted to some of its dimensions, keeping gate order and the **whole** default map.
 *
 * Keeping `defaults` whole is the point: a gate outside the narrowed set must stay readable, or
 * every dimension it gates deactivates and the narrowed search silently becomes narrower still.
 *
 * The feasibility oracle is rebuilt against the narrowed index, so validating a subspace
 * candidate decodes only the dimensions the subspace carries — and a search over a subspace
 * should validate the *merged* point (base plus candidate) rather than the candidate alone,
 * which is what `sampleCandidate` does when it is given a base.
 */
export function subspace(
  space: SearchSpace,
  select: readonly string[] | ((parameter: SearchParameter) => boolean),
): SearchSpace {
  const keep =
    typeof select === 'function'
      ? select
      : ((ids) => (parameter: SearchParameter) => ids.has(parameter.id))(new Set(select));

  const parameters = space.parameters.filter((parameter) => keep(parameter));
  if (typeof select !== 'function') {
    for (const id of select) {
      if (!space.byId.has(id)) {
        throw new SearchSpaceError(
          `"${id}" is not a dimension of this space. Known dimensions: ${space.ids.length}; see space.ids.`,
        );
      }
    }
  }
  const byId = new Map(parameters.map((parameter) => [parameter.id, parameter]));

  return Object.freeze({
    parameters: Object.freeze(parameters),
    byId,
    ids: Object.freeze(parameters.map((parameter) => parameter.id)),
    defaults: space.defaults,
    validate: (values: Candidate) => validateValues(byId, values),
  });
}

/** A dimension by id, or `undefined` when the space does not carry it. */
export function parameterOf(space: SearchSpace, id: string): SearchParameter | undefined {
  return space.byId.get(id);
}

/**
 * The point every dimension's declared default describes, with inactive dimensions dropped.
 *
 * The honest origin of the space, and the thing a random-search baseline is compared against
 * before any tuning has happened.
 */
export function defaultCandidate(space: SearchSpace): Candidate {
  return candidateFromProfile(space, {});
}

/**
 * A profile read as a candidate, with every dimension the profile does not author filled from its
 * declared default and every inactive dimension dropped.
 *
 * The lenient counterpart of `encodeCandidate`, and the function a search uses to turn "the
 * incumbent" — `predictive-balanced`, say — into a starting point. Filling the default is not an
 * assumption: it is what `resolveDispatchConfig` will do with that profile at run time, so the
 * candidate describes the system the profile actually runs.
 *
 * Dimensions whose `activeWhen` is unmet **by the resulting values** are dropped, and in gate
 * order, so a decision made earlier in the list gates what comes after it. `predictive-balanced`
 * is `up-down-buttons`, so the candidate it yields carries no `weights.rideTime`: no landing call
 * carries a destination, the term returns 0 for every car, and a search told otherwise would
 * spend 50 to 200 replications an evaluation on a dimension that cannot move the objective.
 *
 * It lives here rather than beside `encodeCandidate` because it is the same operation as
 * {@link defaultCandidate} — walk the space in gate order, decide what is live, take a value —
 * and only the source of the value differs. Keeping them together is also what stops `encode.ts`
 * having to import the gate rule from this file, which would be a cycle.
 */
export function candidateFromProfile(space: SearchSpace, profile: ProfilePatch): Candidate {
  const authored = encodeCandidate(space, profile);
  const values = new Map<string, ParameterValue>();
  for (const parameter of space.parameters) {
    const read: GateReader = (id) => values.get(id) ?? space.defaults.get(id);
    if (!isActive(parameter, read)) continue;
    const value = authored.get(parameter.id) ?? parameter.default;
    values.set(parameter.id, value);
  }
  return values;
}

/* -------------------------------------------------------------------------- *
 * Validation of one declared row
 * -------------------------------------------------------------------------- */

function toSearchParameter(
  spec: DispatchParameterSpec,
  declaredBy: readonly string[],
): SearchParameter {
  const dot = spec.id.indexOf('.');
  if (dot <= 0 || dot >= spec.id.length - 1) {
    throw new SearchSpaceError(
      `"${spec.id}" is not a dotted profile path. Every declared id is "<section>.<key>", because it is the path of the value in data/dispatcher-profiles.json.`,
    );
  }

  const common = {
    id: spec.id,
    section: spec.id.slice(0, dot),
    key: spec.id.slice(dot + 1),
    description: spec.description,
    declaredBy: Object.freeze([...declaredBy]),
    ...(spec.unit === undefined ? {} : { unit: spec.unit }),
    ...(spec.activeWhen === undefined ? {} : { activeWhen: spec.activeWhen }),
  };

  switch (spec.type) {
    case 'continuous':
    case 'integer': {
      const [min, max] = boundsOf(spec);
      const scale = scaleOf(spec, min);
      const value = spec.default;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new SearchSpaceError(
          `"${spec.id}" is ${spec.type} and its default is ${describe(value)}. A search needs a point it can start from.`,
        );
      }
      if (value < min || value > max) {
        throw new SearchSpaceError(
          `"${spec.id}" has default ${value} outside its declared range [${min}, ${max}].`,
        );
      }
      if (spec.type === 'integer') {
        for (const [label, bound] of [
          ['min', min],
          ['max', max],
          ['default', value],
        ] as const) {
          if (!Number.isInteger(bound)) {
            throw new SearchSpaceError(
              `"${spec.id}" is an integer dimension whose ${label} is ${bound}. A sampler would have to round it, and a rounded bound is a range nobody declared.`,
            );
          }
        }
        return Object.freeze({ ...common, type: 'integer', min, max, scale, default: value });
      }
      return Object.freeze({ ...common, type: 'continuous', min, max, scale, default: value });
    }

    case 'categorical': {
      const values = spec.values;
      if (values === undefined || values.length === 0) {
        throw new SearchSpaceError(
          `"${spec.id}" is categorical and declares no values. There is nothing to draw from.`,
        );
      }
      if (typeof spec.default !== 'string' || !values.includes(spec.default)) {
        throw new SearchSpaceError(
          `"${spec.id}" is categorical with default ${describe(spec.default)}, which is not one of ${values.join(', ')}.`,
        );
      }
      return Object.freeze({
        ...common,
        type: 'categorical',
        values: Object.freeze([...values]),
        default: spec.default,
      });
    }

    case 'boolean': {
      if (typeof spec.default !== 'boolean') {
        throw new SearchSpaceError(
          `"${spec.id}" is boolean with default ${describe(spec.default)}.`,
        );
      }
      return Object.freeze({ ...common, type: 'boolean', default: spec.default });
    }

    default:
      throw new SearchSpaceError(
        `"${spec.id}" declares type "${String(spec.type)}", which is not one of continuous, integer, categorical, boolean. docs/06-parameterization-and-tuning.md § The parameter schema lists the four a generic optimizer understands.`,
      );
  }
}

function boundsOf(spec: DispatchParameterSpec): readonly [number, number] {
  const range = spec.range;
  const min = range?.[0];
  const max = range?.[1];
  if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new SearchSpaceError(
      `"${spec.id}" is ${spec.type} and declares no finite [min, max] range. A dimension with no bounds is one a search cannot draw from.`,
    );
  }
  if (max <= min) {
    throw new SearchSpaceError(
      `"${spec.id}" declares range [${min}, ${max}]. An empty or inverted range is a dimension that either cannot be sampled or is not a dimension.`,
    );
  }
  return [min, max];
}

function scaleOf(spec: DispatchParameterSpec, min: number): ParameterScale {
  const scale = spec.scale ?? 'linear';
  if (scale !== 'linear' && scale !== 'log') {
    throw new SearchSpaceError(`"${spec.id}" declares scale "${String(scale)}".`);
  }
  if (scale === 'log' && min <= 0) {
    throw new SearchSpaceError(
      `"${spec.id}" declares a log scale over a range starting at ${min}. A log-uniform draw is undefined at or below zero; the range must start above it or the scale must be linear.`,
    );
  }
  return scale;
}

/* -------------------------------------------------------------------------- *
 * Gate order
 * -------------------------------------------------------------------------- */

/**
 * A stable topological sort by `activeWhen`, so a gate always precedes what it gates.
 *
 * Stable in the sense that matters: among the parameters whose gates are all already placed, the
 * one earliest in discovery order is placed next. So the order is a pure function of the schemas
 * (CLAUDE.md invariant 4), and it is the order the sampler draws in — which is what makes "same
 * seed, same candidate" a property of the space rather than of the caller.
 *
 * A gate that is not itself in the space imposes no ordering: it will be read from the base or
 * the defaults, both of which are known before sampling starts.
 */
function gateOrder(parameters: readonly SearchParameter[]): SearchParameter[] {
  const present = new Set(parameters.map((parameter) => parameter.id));
  const remaining = [...parameters];
  const placed = new Set<string>();
  const ordered: SearchParameter[] = [];

  while (remaining.length > 0) {
    const index = remaining.findIndex((parameter) =>
      Object.keys(parameter.activeWhen ?? {}).every((gate) => !present.has(gate) || placed.has(gate)),
    );
    if (index < 0) {
      throw new SearchSpaceError(
        `activeWhen contains a cycle among ${remaining.map((parameter) => parameter.id).join(', ')}. A gate that depends on what it gates has no order a sampler can draw in.`,
      );
    }
    const next = remaining[index] as SearchParameter;
    ordered.push(next);
    placed.add(next.id);
    remaining.splice(index, 1);
  }

  return ordered;
}

/* -------------------------------------------------------------------------- *
 * Helpers
 * -------------------------------------------------------------------------- */

function sameDeclaration(a: DispatchParameterSpec, b: DispatchParameterSpec): boolean {
  return (
    a.type === b.type &&
    Object.is(a.default, b.default) &&
    (a.scale ?? 'linear') === (b.scale ?? 'linear') &&
    (a.unit ?? '') === (b.unit ?? '') &&
    JSON.stringify(a.range ?? null) === JSON.stringify(b.range ?? null) &&
    JSON.stringify(a.values ?? null) === JSON.stringify(b.values ?? null) &&
    JSON.stringify(a.activeWhen ?? null) === JSON.stringify(b.activeWhen ?? null)
  );
}

function describe(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}
