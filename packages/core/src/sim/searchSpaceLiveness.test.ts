/**
 * **The search-space liveness sweep.** Every dimension a generic optimizer can search must be
 * able to change a run, or say in machine-readable form why it cannot.
 *
 * `seam.test.ts` guards the behaviours the *docs* say must differ, one hand-written case at a
 * time. This file guards the complementary and larger claim, and guards it **exhaustively**:
 * *nothing the optimizer can see is flat*. It is the test every one of findings #9, #10, #12,
 * #13 and #21 in `docs/08-review-findings.md` names as the one that would have caught them —
 * five separate knobs that were schema-validated, profile-authorable, unit-tested and unable to
 * move any decision in any shipped run.
 *
 * The cost of not having it is not "a slightly wasteful search". Phase 7 spends **50 to 200
 * replications per evaluation**; a dimension that is exactly flat consumes that budget, produces
 * a difference of exactly zero, and — because the objective around it is noisy — is reported
 * with whatever value the draw happened to hold, as part of a "tuned winner". An exactly-flat
 * axis is also worse than a merely unhelpful one for the search itself: it permanently inflates
 * the plateau classes `plateau.ts` and `cmaes.ts` count, and feeds their restart logic a
 * direction that can never produce a gradient.
 *
 * ## What is asserted
 *
 * For every dimension, two profiles differing in **exactly** that dimension — gates satisfied
 * transitively, both materialised through the real `parseDispatcherProfiles` — are run through
 * `runSimulation` at one seed, and their **passenger-record trajectories** must differ on at
 * least one shipped building. Trajectories rather than summary metrics, for the reason
 * `seam.test.ts` gives: two configurations can produce the same AWT from different journeys, and
 * a mean is exactly the statistic that hides a structural difference.
 *
 * A dimension that cannot pass must instead carry an entry in {@link DECLARED_INERT}, and an
 * entry is a **claim with a proof obligation**: it names the condition under which the dimension
 * *is* live, and that condition is executed. So the allowlist is asserted in both directions,
 * exactly as `dispatch/deadCode.test.ts`'s is — an entry whose dimension has since become live
 * under the sweep fails, and an entry whose stated live condition stops producing a difference
 * fails too. Without both halves the allowlist is where dead configuration goes to be forgotten,
 * which is the failure mode one step removed from the one this file exists to catch.
 *
 * The `activeWhen`-gated dimensions are not in the allowlist and must not be: a gate is the
 * *declared* form of "inert here", it is machine-readable to a generic optimizer without reading
 * this file, and the sweep satisfies it and then requires liveness inside it.
 *
 * **And, since a gate is a claim, it is checked in both directions too.** The sweep used to
 * satisfy a gate, confirm the dimension live inside it, and never probe outside — so a gate whose
 * condition was simply *wrong* passed silently, and a gate was the one unfalsifiable escape hatch
 * in a file built to have none. `idle.predictorHorizonS` is the worked example and it is a worked
 * example of the failure, not of the mechanism: gated on `predictorCycleS <= 1800`, it was still
 * live at cycle 3600 on `secure-tower`, which is a live dimension declared dead. It is ungated and
 * allowlisted now, and every remaining gate has to assert that its gated-**off** region is flat.
 *
 * ## Why the dimension list is derived and not written down
 *
 * The list comes from the same two facts `packages/experiments/src/tuning/space/collect.ts`
 * derives `collectSearchSpace()` from, and it is derived here rather than imported because
 * `core` may not depend on `experiments` — a test that reached across would invert the package
 * graph to check a property of `core`. The two facts:
 *
 * 1. **Discovery.** Every schema `core` declares is an export whose name ends `_PARAMETERS` and
 *    whose value is an array of parameter specs. Read off the barrel namespace at run time, so a
 *    new `parameters.ts` is covered with no edit here.
 * 2. **Membership.** A dimension belongs to the dispatcher's search space when a dispatcher
 *    profile can hold it — decided by **trying**: the value is written at its dotted path and run
 *    through `parseDispatcherProfiles`, which is the function `loadConfig` calls.
 *
 * A hand-written list would pass every assertion below right up to the moment a 49th dimension
 * is declared, which is the same defect in miniature.
 */

import { describe, expect, it } from 'vitest';

import * as barrel from '../index.js';
import { parseDispatcherProfiles } from '../config/parse.js';
import { DISPATCHER_PROFILE_OBJECT_SECTIONS } from '../config/schema.js';
import type { DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { COST_TERMS } from '../dispatch/index.js';
import { activeWhenSatisfied, isActiveWhenRange } from '../dispatch/parameters.js';
import type { ActiveWhenCondition, DispatchParameterSpec } from '../dispatch/types.js';

import { BUILDING_IDS, load, tinyBuilding } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

const SEED = 20_260_726;

/** The base every probe is built from: the profile that authors the most stages. */
const BASE_PROFILE_ID = 'predictive-balanced';

/**
 * Buildings in probe order — most sensitive first, because the sweep stops at the first building
 * that shows a difference and a live dimension should cost two runs, not ten.
 *
 * `vertical-city` is deliberately absent, for the reason the whole-system review gave when it
 * ran this sweep by hand: it saturates at this duration, so its journeys are dominated by queue
 * growth rather than by dispatch, and it is four times the cost of any other building. As
 * measured, every live dimension resolves on `midtown-office` or `secure-tower`; nothing needed
 * it, and paying a second of arithmetic per probe to confirm a *flat* verdict on a saturated
 * building buys less than it costs the rest of the suite.
 */
const PROBE_BUILDINGS = [
  'midtown-office',
  'garden-apartments',
  'secure-tower',
  'mixed-use-high-rise',
] as const;

type Value = number | string | boolean;

/* -------------------------------------------------------------------------- *
 * Discovery and membership — the two facts the space is derived from
 * -------------------------------------------------------------------------- */

const PARAMETER_SCHEMA_SUFFIX = '_PARAMETERS';

/**
 * `weights` and `constraints` are written specially; these are plain profile objects.
 *
 * **A hand-written list, and it is deliberately not the derived one — which is a claim, asserted
 * below rather than left to be discovered.** `config/schema.ts` now derives the true list from
 * `dispatcherProfileSchema`'s own shape (`objectSectionsOf`), and this file could import it. It
 * does not, because the sweep runs its probes through {@link runSimulation}, and `sim/` builds no
 * weight-set selector: a profile carrying `selection.policy` other than `off` cannot be *run* here
 * at all, so all seven `selection.*` rows come back **inadmissible** — the sweep's word for *"no
 * pair of values could be materialised and run"* — rather than live or flat. Measured: deriving
 * this list turns `finds no flat dimension without a declared reason` red with exactly those seven
 * ids and no others.
 *
 * That is the separately-tracked selector gap (`docs/07-handoff.md`, *the selector not reaching the
 * runner*), not a defect in this sweep, and the sweep's own instruction for an inadmissible
 * dimension is *"do not allowlist them"*. So the omission stands and is **stated**: the assertion
 * beside {@link SECTIONS_THIS_SWEEP_CANNOT_RUN} fails the day an eighth section lands, and fails
 * again the day `selection` becomes runnable — which is the difference between an exclusion and
 * the silent staleness this list had before, when it named six and the schema had seven.
 */
const PROFILE_OBJECT_SECTIONS = [
  'dispatch',
  'eligibility',
  'normalization',
  'answer',
  'idle',
  'auction',
] as const;

/**
 * The sections the schema declares that this sweep cannot probe, each with the reason.
 *
 * A claim with a proof obligation, in the same spirit as `DECLARED_INERT`: the entry names why the
 * section is absent, and the test below re-derives the difference against the schema so the entry
 * cannot outlive its reason.
 */
const SECTIONS_THIS_SWEEP_CANNOT_RUN: Readonly<Record<string, string>> = Object.freeze({
  selection: 'runSimulation builds no weight-set selector, so a non-`off` policy cannot be run',
});

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

/** Every declared row `core` exports, deduplicated by id, in a stable order. */
function declaredRows(): readonly DispatchParameterSpec[] {
  const source = barrel as unknown as Readonly<Record<string, unknown>>;
  const byId = new Map<string, DispatchParameterSpec>();
  for (const name of Object.keys(source).sort()) {
    if (!name.endsWith(PARAMETER_SCHEMA_SUFFIX)) continue;
    const value = source[name];
    if (!Array.isArray(value) || !value.every(isParameterSpec)) continue;
    for (const spec of value as readonly DispatchParameterSpec[]) {
      if (!byId.has(spec.id)) byId.set(spec.id, spec);
    }
  }
  return [...byId.values()];
}

type Authored = Record<string, unknown>;

/** Write one value at its dotted profile path, the way `decodeInto` does. */
function writeInto(profile: Authored, id: string, value: Value): void {
  const dot = id.indexOf('.');
  const section = id.slice(0, dot);
  const key = id.slice(dot + 1);

  if (section === 'weights') {
    const weights = (profile['weights'] ?? {}) as Record<string, unknown>;
    weights[key] = value;
    profile['weights'] = weights;
    return;
  }
  if (section === 'constraints') {
    const declared = new Set((profile['hardConstraints'] ?? []) as readonly string[]);
    if (value === true) declared.add(key);
    else declared.delete(key);
    profile['hardConstraints'] = [...declared];
    return;
  }
  if (!(PROFILE_OBJECT_SECTIONS as readonly string[]).includes(section)) {
    throw new Error(`no dispatcher profile has a "${section}" section`);
  }
  const bucket = (profile[section] ?? {}) as Record<string, unknown>;
  bucket[key] = value;
  profile[section] = bucket;
}

/** The document shape `parseDispatcherProfiles` expects, around one authored profile. */
function materialise(authored: Authored): DispatcherProfile {
  const parsed = parseDispatcherProfiles(
    {
      version: 1,
      terms: COST_TERMS.map((term) => ({
        id: term.id,
        measures: term.measures,
        serves: 'search-space liveness probe',
      })),
      normalization: { required: true },
      profiles: [authored],
    },
    '<search-space liveness probe>',
  );
  const profile = parsed.profiles[0];
  if (profile === undefined) throw new Error('the parser returned no profile');
  return profile;
}

/** Whether a dispatcher profile can hold this id at all. Decided by doing it. */
function isProfileAuthorable(spec: DispatchParameterSpec, base: Authored): boolean {
  const dot = spec.id.indexOf('.');
  if (dot <= 0 || dot >= spec.id.length - 1) return false;
  try {
    const authored = structuredClone(base);
    writeInto(authored, spec.id, spec.default as Value);
    materialise(authored);
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- *
 * Probe values, and gates satisfied transitively
 * -------------------------------------------------------------------------- */

function round(spec: DispatchParameterSpec, value: number): number {
  return spec.type === 'integer' ? Math.round(value) : value;
}

/**
 * Values worth trying for one dimension, most contrasting first.
 *
 * The endpoints lead because a dimension that does anything at all does it most visibly across
 * its whole declared range; the default and the midpoint follow because some endpoints are
 * rejected by a cross-field rule the schema owns (`bypassLoadThreshold` may not exceed
 * `overloadThreshold`, `maxDwellS` may not fall below the base dwell), and a dimension must not
 * be reported flat merely because the first pair drawn was inadmissible.
 */
function probeValues(spec: DispatchParameterSpec): readonly Value[] {
  if (spec.type === 'boolean') return [false, true];
  if (spec.type === 'categorical') return [...(spec.values ?? [])];
  const [min, max] = spec.range ?? [0, 1];
  return [...new Set([round(spec, min), round(spec, max), spec.default as number])];
}

/** Ordered distinct pairs, most contrasting first. */
function probePairs(spec: DispatchParameterSpec): readonly (readonly [Value, Value])[] {
  const values = probeValues(spec);
  const pairs: (readonly [Value, Value])[] = [];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      pairs.push([values[i] as Value, values[j] as Value]);
    }
  }
  return pairs;
}

/** Values of a gate that satisfy one condition, most preferred first. */
function gateValues(gate: DispatchParameterSpec, condition: ActiveWhenCondition): readonly Value[] {
  if (!isActiveWhenRange(condition)) {
    return [...condition].filter((value) =>
      gate.type === 'boolean' ? true : (gate.values ?? [value]).includes(value),
    ).map((value) => (gate.type === 'boolean' ? value === 'true' : value));
  }
  const [low, high] = gate.range ?? [0, 1];
  const min = Math.max(low, condition.min ?? Number.NEGATIVE_INFINITY);
  const max = Math.min(high, condition.max ?? Number.POSITIVE_INFINITY);
  if (min > max) return [];
  // The admissible value nearest the gate's own default: the gate is satisfied with the smallest
  // change to the rest of the configuration, so what the probe measures stays the dimension
  // under test rather than the gate.
  const preferred = Math.min(Math.max(gate.default as number, min), max);
  return [...new Set([round(gate, preferred), round(gate, max), round(gate, min)])];
}

/**
 * Every gate of a dimension, set to an admitted value, **transitively**.
 *
 * `choice` selects among the admitted values of each list-form gate, so a gate combination that
 * a policy refuses outright — `dispatch.callType: destination-entry` against this base's
 * `deferred` timing — can be stepped past rather than reported as an inert dimension.
 */
function satisfyGates(
  spec: DispatchParameterSpec,
  byId: ReadonlyMap<string, DispatchParameterSpec>,
  choice: number,
  into: Authored,
  seen: Set<string> = new Set(),
): void {
  if (seen.has(spec.id)) return;
  seen.add(spec.id);
  for (const [gateId, condition] of Object.entries(spec.activeWhen ?? {})) {
    if (condition === undefined) continue;
    const gate = byId.get(gateId);
    if (gate === undefined) continue;
    const admitted = gateValues(gate, condition);
    const value = admitted[Math.min(choice, admitted.length - 1)];
    if (value === undefined) continue;
    writeInto(into, gateId, value);
    satisfyGates(gate, byId, choice, into, seen);
  }
}

/* -------------------------------------------------------------------------- *
 * Running
 * -------------------------------------------------------------------------- */

/** Every leg's car and boarding instant: the trajectory, not a statistic over it. */
function trajectory(result: SimulationResult): string {
  return result.record.passengers
    .map(
      (leg) =>
        `${leg.passengerId}:${leg.carId ?? '-'}:${String(leg.boardedAt)}:${String(leg.alightedAt)}`,
    )
    .join('|');
}

interface Harness {
  readonly cfg: LoadedConfig;
  readonly base: Authored;
  readonly buildingsById: ReadonlyMap<string, ResolvedBuilding>;
  /** Memoized: the same (building, profile) pair is probed by several dimensions. */
  readonly seen: Map<string, string>;
}

/**
 * One memo for the whole file, keyed by the run request rather than by the test.
 *
 * A run is a pure function of `(building, profile, options, seed)`, so two tests asking for the
 * same one must get the same answer — and each of those runs costs 20-370 ms. The sweep asks for
 * a few hundred of them; without this the file is minutes of arithmetic that has already been
 * done, which on a parallel runner is not merely slow but starves the other suites' timeouts.
 */
const RUNS = new Map<string, string>();

type RunOverrides = Omit<Partial<SimulationConfig>, 'building' | 'dispatcherProfile'>;

function runTrajectory(
  harness: Harness,
  buildingId: string,
  authored: Authored,
  overrides: RunOverrides,
  building?: ResolvedBuilding,
): string {
  const key = `${buildingId}|${JSON.stringify(authored)}|${JSON.stringify(overrides)}`;
  const cached = harness.seen.get(key);
  if (cached !== undefined) return cached;
  const result = runSimulation({
    building: building ?? (harness.buildingsById.get(buildingId) as ResolvedBuilding),
    dispatcherProfile: materialise(authored),
    trafficProfiles: harness.cfg.trafficProfiles,
    elevatorSpecs: harness.cfg.elevatorSpecs,
    seed: SEED,
    onTimeout: 'report',
    ...overrides,
  });
  const digest = trajectory(result);
  harness.seen.set(key, digest);
  return digest;
}

interface Sweep {
  readonly id: string;
  readonly live: boolean;
  /** Present when live: which pair, on which building. */
  readonly evidence?: string | undefined;
  /** True when no pair of values could be materialised and run at all. */
  readonly inadmissible: boolean;
}

/**
 * Two profiles differing in exactly one dimension, run until they diverge.
 *
 * `satisfyOwnGates` is on for every liveness question and **off** for the one question that is
 * about the gate itself: the gated-off probe writes a violating gate value into `harness.base`
 * and must not have it written straight back. Without the switch that probe silently measures
 * the region *inside* the gate and reports every gate in the schema as unsound, which is what it
 * did the first time it was run.
 */
function sweepDimension(
  harness: Harness,
  spec: DispatchParameterSpec,
  byId: ReadonlyMap<string, DispatchParameterSpec>,
  overrides: RunOverrides = {},
  buildingIds: readonly string[] = PROBE_BUILDINGS,
  building?: ResolvedBuilding,
  satisfyOwnGates = true,
): Sweep {
  let admissible = false;
  for (let choice = 0; choice < 3; choice += 1) {
    // Whether this gate choice produced a comparable pair of runs at all. A pair the schema or
    // the policy layer refuses — `bypassLoadThreshold: 0`, `maxDwellS` under the base dwell,
    // destination entry against deferred assignment — is skipped rather than counted as
    // evidence, and only a choice for which *every* pair was refused escalates to the next one.
    let anyRan = false;
    for (const [low, high] of probePairs(spec)) {
      let left: Authored;
      let right: Authored;
      try {
        left = structuredClone(harness.base);
        right = structuredClone(harness.base);
        if (satisfyOwnGates) {
          satisfyGates(spec, byId, choice, left);
          satisfyGates(spec, byId, choice, right);
        }
        writeInto(left, spec.id, low);
        writeInto(right, spec.id, high);
        materialise(left);
        materialise(right);
      } catch {
        continue; // the schema refuses this pair; it is not evidence of anything
      }
      let refused = false;
      for (const buildingId of buildingIds) {
        let a: string;
        let b: string;
        try {
          a = runTrajectory(harness, buildingId, left, overrides, building);
          b = runTrajectory(harness, buildingId, right, overrides, building);
        } catch {
          // The policy layer refuses this combination outright. Not evidence either way.
          refused = true;
          break;
        }
        anyRan = true;
        admissible = true;
        if (a !== b) {
          return {
            id: spec.id,
            live: true,
            evidence: `${String(low)} vs ${String(high)} on ${buildingId}`,
            inadmissible: false,
          };
        }
      }
      void refused;
    }
    if (anyRan) break;
  }
  return { id: spec.id, live: false, inadmissible: !admissible };
}

/* -------------------------------------------------------------------------- *
 * The allowlist, and its proof obligation
 * -------------------------------------------------------------------------- */

/**
 * How a declared-inert dimension is proven to be inert *for a reason* rather than disconnected.
 *
 * `reason` is for a human; `liveUnder` is for the test. An entry without a working `liveUnder`
 * would be an unfalsifiable claim, which is exactly what "it is fine, it is just conditional"
 * looked like each of the five times this defect shipped.
 */
interface InertReason {
  readonly reason: string;
  /** Profile fields that make the dimension live. Applied to both arms of the probe. */
  readonly liveUnder?: Authored | undefined;
  /** Run options that make the dimension live. */
  readonly liveWith?: RunOverrides | undefined;
  /** Set when the live condition is a *building* no shipped configuration provides. */
  readonly liveOnOneCarBank?: boolean | undefined;
}

const DECLARED_INERT: Readonly<Record<string, InertReason>> = Object.freeze({
  /*
   * A theorem, not a plateau. With one round there is no round to reallocate a declined contract
   * into, so the sealed-bid winner is the lowest bid — which is what the central scorer picks.
   * `seam.test.ts` asserts the equality directly. It stops being flat the moment a second round
   * exists, and that is what the proof obligation below executes.
   */
  'auction.aggregation': {
    reason:
      'sealed bid at auction.rounds = 1 is provably the central argmin over the same weights, so the aggregation cannot change a run until a second round exists',
    liveUnder: { auction: { rounds: 3, reserveMarginalDelayS: 25 } },
  },

  /*
   * A ceiling that nothing reaches. `predictive-balanced` runs adaptive dwell at a gain of
   * 0.4 s/passenger, so the granted dwell tops out well under any value in [4, 30]; raise the
   * gain and the ceiling starts binding. Not a gate: the dimension is live at gains this schema
   * already admits, and `activeWhen` cannot say "live when another continuous knob is large
   * enough that this one binds" without pretending to know the hall queue.
   */
  'answer.maxDwellS': {
    reason:
      'the adaptive dwell never reaches any ceiling in the declared range at the shipped dwellAdaptationGain of 0.4 s/passenger',
    liveUnder: { answer: { dwellPolicy: 'adaptive', dwellAdaptationGain: 2 } },
  },

  /*
   * A budget for events that do not happen at the shipped defaults: photo-eye obstruction is
   * drawn at `sim.doorObstructionProbability`, which defaults to 0, and the courtesy hold is
   * refused unless a profile authors `answer.reopenOnLateArrival`, which defaults to false. Turn
   * either on and the budget binds — the second is the one the courtesy hold landed with.
   */
  'answer.maxReopensPerStop': {
    reason:
      'no reopen is generated at the shipped defaults: doorObstructionProbability is 0 and reopenOnLateArrival is false, so there is no reopen for a budget to bound',
    liveUnder: { answer: { reopenOnLateArrival: true } },
  },

  /*
   * A starvation guard, and a guard that does not fire is not a dead one. Its call site is live —
   * `Simulation` passes the group snapshots that `filterEligible`'s guard needs on every
   * decision — but the guard needs *exactly one* eligible car, rejected *solely* on load, which
   * no shipped building's fleet produces. A one-car bank does, and that is the obligation below.
   */
  'answer.allowBypassIfSoleEligibleCar': {
    reason:
      'the guard needs exactly one eligible car rejected solely on load; every shipped building has a fleet large enough that another car is always eligible',
    liveOnOneCarBank: true,
  },

  /*
   * The worked example this file's header used to give for a *gate*, moved to where the claim
   * has to be proven. It carried `activeWhen: { 'idle.predictorCycleS': { max: 1800 } }`, and
   * that bound was measurably wrong in the direction that costs the most: at cycle 3600 —
   * outside the gate — sweeping the horizon over {30, 120, 300, 900, 3600} still produces 2
   * distinct trajectories on `secure-tower`. The gate hid a live region, which is exactly what
   * `activeWhen` is supposed to prevent.
   *
   * The real condition is relational (a bucket-of-day has to recur inside the window, roughly
   * `horizon >= cycle`) and `activeWhen` is a comparison against constants, so no bound is
   * sound. Ungated and allowlisted instead — the entry below then has to *execute* the
   * condition, which the gate never did.
   */
  'idle.predictorHorizonS': {
    reason:
      'the forecast integrates to exactly rate x horizon while no bucket-of-day recurs inside a replication, and all three consumers reduce it to a scale-invariant statistic, so the whole declared range is one run at the shipped predictorCycleS of 86400',
    liveUnder: { idle: { predictorCycleS: 1800 } },
  },
});

/* -------------------------------------------------------------------------- *
 * The other half of the same obligation: a gate must not hide a live region
 * -------------------------------------------------------------------------- */

/**
 * Values of a gate that **violate** one condition, most contrasting first.
 *
 * The mirror of {@link gateValues}. For a list-form condition, any admitted value of the gate
 * that is not in the list; for a range, the parts of the gate's own range outside `[min, max]`.
 */
function gateViolatingValues(
  gate: DispatchParameterSpec,
  condition: ActiveWhenCondition,
): readonly Value[] {
  if (!isActiveWhenRange(condition)) {
    const excluded = new Set<string>(condition);
    if (gate.type === 'boolean') {
      return [true, false].filter((value) => !excluded.has(String(value)));
    }
    return (gate.values ?? []).filter((value) => !excluded.has(value));
  }
  const [low, high] = gate.range ?? [0, 1];
  const out: number[] = [];
  // Just outside each end, and the far endpoint, so a condition with one open side still
  // produces a probe. `round` keeps an integer dimension integral.
  if (condition.max !== undefined && condition.max < high) {
    const justOver = Math.min(high, condition.max * (gate.scale === 'log' ? 2 : 1) + 1);
    out.push(round(gate, justOver), round(gate, high));
  }
  if (condition.min !== undefined && condition.min > low) {
    const justUnder = Math.max(low, condition.min / (gate.scale === 'log' ? 2 : 1) - 1);
    out.push(round(gate, justUnder), round(gate, low));
  }
  return [...new Set(out)];
}

/* -------------------------------------------------------------------------- *
 * The assertions
 * -------------------------------------------------------------------------- */

describe('every searchable dimension can change a run, or declares why it cannot', () => {
  async function harnessFor(): Promise<{
    harness: Harness;
    dimensions: readonly DispatchParameterSpec[];
    byId: ReadonlyMap<string, DispatchParameterSpec>;
  }> {
    const cfg = await load();
    const parsed = cfg.dispatcherProfilesById.get(BASE_PROFILE_ID) as DispatcherProfile;
    const base = structuredClone(parsed) as unknown as Authored;
    const buildingsById = new Map(
      BUILDING_IDS.map((id) => [id, cfg.buildingsById.get(id) as ResolvedBuilding]),
    );
    const harness: Harness = { cfg, base, buildingsById, seen: RUNS };
    const dimensions = declaredRows().filter((spec) => isProfileAuthorable(spec, base));
    const byId = new Map(dimensions.map((spec) => [spec.id, spec]));
    return { harness, dimensions, byId };
  }

  it('discovers the whole space off the schema exports, not a list', async () => {
    // A scanner that silently matched nothing would pass every assertion below.
    const { dimensions } = await harnessFor();
    const ids = dimensions.map((spec) => spec.id);
    expect(ids.length).toBeGreaterThanOrEqual(48);
    // One representative per section a dispatcher profile has, so a section falling out of the
    // discovery — the way `eligibility.*` and `normalization.*` once had no profile path at all —
    // is a red test rather than a quietly smaller sweep.
    for (const id of [
      'weights.waitTime',
      'normalization.waitTimeS',
      'constraints.noDirectionReversal',
      'dispatch.callType',
      'eligibility.maxLoadFactorForAssignment',
      'answer.overloadThreshold',
      'idle.predictorHorizonS',
      'auction.aggregation',
    ]) {
      expect(ids, `${id} fell out of the discovered space`).toContain(id);
    }
    // And the sections a dispatcher is *measured against* stay out, by the authorability rule
    // rather than by name.
    for (const id of ['car.designLoadFactor', 'sim.doorObstructionProbability']) {
      expect(ids, `${id} became authorable into a dispatcher profile`).not.toContain(id);
    }
  }, 60_000);

  it('accounts for every section the schema declares, including the one it cannot run', () => {
    // The list above is hand-written and the schema's is derived, so the two can drift — and did:
    // this file named six sections while `dispatcherProfileSchema` declared seven, and the seventh
    // simply vanished from the sweep with nothing reading as wrong. That is § D146's defect in a
    // second file, and this assertion is what makes it impossible to repeat silently.
    //
    // Not a subset check. The **difference** must be exactly the sections named, with reasons, in
    // SECTIONS_THIS_SWEEP_CANNOT_RUN — so an eighth section landing in the schema fails here (it
    // is neither probed nor excused), and `selection` becoming runnable fails here too (the excuse
    // outlived its reason). An exclusion nobody can let rot, which is what this file already asks
    // of DECLARED_INERT.
    const declared = new Set(DISPATCHER_PROFILE_OBJECT_SECTIONS);
    const probed = new Set<string>(PROFILE_OBJECT_SECTIONS);
    for (const section of probed) {
      expect(declared, `this sweep probes "${section}", which no dispatcher profile has`).toContain(
        section,
      );
    }
    expect(
      [...declared].filter((section) => !probed.has(section)).sort(),
      'a section the schema declares is neither probed by this sweep nor excused with a reason',
    ).toStrictEqual(Object.keys(SECTIONS_THIS_SWEEP_CANNOT_RUN).sort());
  });

  it('finds no flat dimension without a declared reason', async () => {
    const { harness, dimensions, byId } = await harnessFor();
    const flat: string[] = [];
    const inadmissible: string[] = [];
    const live: string[] = [];

    for (const spec of dimensions) {
      const verdict = sweepDimension(harness, spec, byId);
      if (verdict.live) {
        live.push(`${verdict.id} (${verdict.evidence ?? ''})`);
        continue;
      }
      if (verdict.inadmissible) inadmissible.push(verdict.id);
      flat.push(verdict.id);
    }

    // A dimension no admissible pair of values could be built for is not "flat", it is
    // unmeasurable — and reported separately so it cannot hide inside the allowlist.
    expect(
      inadmissible,
      'no pair of values for these dimensions could be materialised and run at all, so the sweep ' +
        'could not decide them. Widen probeValues or fix the schema; do not allowlist them',
    ).toEqual([]);

    const unexplained = flat.filter((id) => !(id in DECLARED_INERT));
    expect(
      unexplained,
      'these dimensions produced a byte-identical passenger record across their whole declared ' +
        'range on every shipped building. A search will spend 50-200 replications an evaluation ' +
        'on each of them and report whichever value the draw held. Either wire the behaviour, ' +
        'gate it with activeWhen so a generic optimizer skips it, narrow the declared range to ' +
        'the part that does something, or add it to DECLARED_INERT with the condition under ' +
        'which it IS live — which that entry then has to prove',
    ).toEqual([]);

    // The other direction: an entry whose dimension has become live is a stale claim, and a
    // stale allowlist is where dead configuration goes to be forgotten.
    const stale = Object.keys(DECLARED_INERT).filter((id) => !flat.includes(id));
    expect(
      stale.map((id) => (byId.has(id) ? `${id} — now live under the sweep` : `${id} — gone`)),
      'delete the entry (the dimension is live, or no longer exists) rather than the assertion',
    ).toEqual([]);

    // Non-vacuity: the sweep has to be able to say "live" at all, and for all of the space bar
    // the allowlist. As `data/` ships that is 44 live plus 4 declared inert, out of 48.
    expect(live.length).toBe(dimensions.length - Object.keys(DECLARED_INERT).length);
  }, 600_000);

  it('keeps live the three dimensions this sweep was written for', async () => {
    // The regression pins for findings #9/#10, #12/#13 and #21 in docs/08-review-findings.md.
    // Each of these was flat over its whole declared range on every shipped building, and each
    // is closed by a *different* remedy — a gate, a behaviour, a range — so a single generic
    // assertion above would not say which one regressed. The evidence string is the measurement.
    // `idle.predictorHorizonS` is deliberately not in this list any more. Its remedy moved from
    // a gate to a `DECLARED_INERT` entry — see that entry — and the obligation that keeps it
    // honest is the "proves every declared-inert dimension live" test below, which runs the
    // same sweep under the condition the entry names. Asserting it live here as well would
    // assert it live at the *shipped* cycle, where it provably is not.
    const { harness, byId } = await harnessFor();
    for (const id of [
      // #12/#13: Simulation.#reopenForLateArrival is the non-test caller it did not have.
      'answer.reopenOnLateArrival',
      // #21: the declared range now reaches the design load factor, where the interlock binds.
      'answer.overloadThreshold',
    ]) {
      const spec = byId.get(id) as DispatchParameterSpec;
      expect(spec, `${id} is no longer a searchable dimension`).toBeDefined();
      const verdict = sweepDimension(harness, spec, byId);
      expect(verdict.live, `${id} went flat again`).toBe(true);
    }
  }, 600_000);

  it('finds no activeWhen gate that hides a live region', async () => {
    /*
     * **The half of the contract `activeWhen` never had to keep.**
     *
     * A `DECLARED_INERT` entry is a claim with a proof obligation: it names the condition under
     * which the dimension is live and the test executes it. An `activeWhen`-gated region carried
     * no obligation at all — the sweep satisfied the gate, found the dimension live inside it,
     * and never looked outside. So a gate was the one unfalsifiable escape hatch in a file whose
     * entire purpose is to have none, and "it is fine, it is just conditional" is precisely what
     * the five shipped instances of this defect looked like.
     *
     * `idle.predictorHorizonS` is why this exists rather than why it is a good idea. It shipped
     * gated on `{ 'idle.predictorCycleS': { max: 1800 } }`, and at cycle 3600 — gated **off** —
     * the horizon still moved `secure-tower`. That is a live dimension a generic optimizer was
     * told to skip, which `dispatch/predictor/parameters.ts` calls the worse of the two errors
     * in its own words. Nothing in this file could have said so.
     *
     * The assertion is the contrapositive of the gate's meaning: outside its condition, the
     * dimension must be **flat**. A gate that fails this is not documentation, it is a claim
     * that is false, and the remedy is to fix the bound or to drop the gate and allowlist the
     * dimension — which is what that row did.
     */
    const { harness, dimensions, byId } = await harnessFor();
    const unsound: string[] = [];
    let gatesChecked = 0;

    for (const spec of dimensions) {
      for (const [gateId, condition] of Object.entries(spec.activeWhen ?? {})) {
        if (condition === undefined) continue;
        const gate = byId.get(gateId);
        if (gate === undefined) continue;
        const violating = gateViolatingValues(gate, condition);
        if (violating.length === 0) continue; // the gate admits the gate's whole range
        gatesChecked += 1;

        for (const value of violating) {
          const off = structuredClone(harness.base) as Authored;
          // The gate's *own* gates still have to be satisfied, or the probe measures a
          // combination the policy layer refuses rather than the region under test.
          satisfyGates(gate, byId, 0, off);
          writeInto(off, gateId, value);
          let outside: Sweep;
          try {
            outside = sweepDimension(
              { ...harness, base: off },
              spec,
              byId,
              {},
              PROBE_BUILDINGS,
              undefined,
              false,
            );
          } catch {
            continue; // the configuration is inadmissible; not evidence either way
          }
          if (outside.live) {
            unsound.push(
              `${spec.id} is gated on ${gateId} ${JSON.stringify(condition)}, and at ` +
                `${gateId}=${String(value)} — outside that gate — it still moves a run ` +
                `(${outside.evidence ?? ''})`,
            );
          }
        }
      }
    }

    // Non-vacuity: a scanner that matched no gate would pass this silently, which is the same
    // defect one level up.
    expect(gatesChecked, 'no activeWhen gate was checked at all').toBeGreaterThan(0);
    expect(
      unsound,
      'these gates tell a generic optimizer to skip a region in which the dimension is ' +
        'demonstrably live. A gate is a machine-readable claim, not a comment: either tighten ' +
        'the condition until it is true, or remove the gate and carry the dimension in ' +
        'DECLARED_INERT, whose entries have to prove when they ARE live',
    ).toEqual([]);
  }, 600_000);

  it('proves every declared-inert dimension live under the condition its entry names', async () => {
    // The half that keeps the allowlist honest. Each entry claims the dimension is conditional
    // rather than disconnected; here that claim is executed.
    const { harness, byId } = await harnessFor();

    for (const [id, entry] of Object.entries(DECLARED_INERT)) {
      const spec = byId.get(id) as DispatchParameterSpec;
      expect(spec, `${id} is no longer a dimension`).toBeDefined();

      if (entry.liveOnOneCarBank === true) {
        // A synthesised one-car bank at a demand level that fills it: the only configuration in
        // which "exactly one eligible car, rejected on load" can happen at all.
        const building = tinyBuilding(harness.cfg, 1000);
        const verdict = sweepDimension(
          harness,
          spec,
          byId,
          { demand: { arrivalRatePctPop5min: 30 }, durationS: 1800 },
          [building.id],
          building,
        );
        expect(
          verdict.live,
          `${id} is allowlisted as "live only on a one-car bank" and did not move a run there either`,
        ).toBe(true);
        continue;
      }

      const enriched: Harness = {
        ...harness,
        base: mergeAuthored(structuredClone(harness.base) as Authored, entry.liveUnder ?? {}),
      };
      const verdict = sweepDimension(enriched, spec, byId, entry.liveWith ?? {});
      expect(
        verdict.live,
        `${id} is allowlisted with the reason "${entry.reason}", and it is still flat under the ` +
          'very condition that entry says makes it live. Either the condition is wrong or the ' +
          'dimension really is disconnected',
      ).toBe(true);
    }
  }, 600_000);
});

/** Shallow-merge a patch of profile sections into an authored profile. */
function mergeAuthored(into: Authored, patch: Authored): Authored {
  for (const [section, value] of Object.entries(patch)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      into[section] = { ...((into[section] ?? {}) as object), ...value };
    } else {
      into[section] = value;
    }
  }
  return into;
}
