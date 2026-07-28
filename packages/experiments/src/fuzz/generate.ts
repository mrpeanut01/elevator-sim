/**
 * Randomized building configurations — the point of the whole track.
 *
 * ## Generate buildings, not just seeds
 *
 * Re-seeding the five shipped buildings explores one axis: which passengers arrive. It cannot
 * find a bug that needs a two-floor building, a single-car bank, a 12 m floor pitch, a skipped
 * floor number, a basement entrance or a sky lobby nobody authored. So this module generates
 * the **configuration**, and it generates it through the real schema: every case is run
 * through `parseBuilding` (the same `buildingConfigSchema` `loadConfig` applies) and
 * `resolveBuilding` (the same cross-reference pass), so a case that reaches the simulator is
 * by construction one the loader would accept. A fuzzer that emits invalid configs tests the
 * validator, not the simulator.
 *
 * ## Every draw comes from a named stream (CLAUDE.md invariant 2)
 *
 * Seven streams are derived off an injected `StreamSet`, one per generation concern. That is
 * not ceremony: the simulator's own streams are separated for the same reason, and a generator
 * that used one stream for everything would make "how many cars" depend on "how many floors"
 * in a way that makes shrinking incoherent — change the floor count and every later decision
 * moves. With separate streams, `caseFromSeed(s)` is stable under local edits to this file in
 * a way one stream would not be, and there is no `Math.random()` anywhere in the directory.
 *
 * The service-mode axis (below) is drawn from its own `fuzz.service` stream for exactly that
 * reason and for one more: every building the corpus generated before that axis existed is
 * **bit-identical** apart from the keys the axis adds, so the pinned coverage assertions in
 * `generate.test.ts` — floor counts, topologies, entrance arrangements — did not have to move
 * to accommodate a widening that has nothing to do with them.
 *
 * ## Service mode is generated, and the fleet is never wholly withdrawn
 *
 * `CarConfig.mode` and `BuildingConfig.serviceEvents` make "a car is out of service" and "a car
 * changes mode mid-run" authorable, so both are generated here — see {@link generateService}.
 * One rule is enforced by construction and is not a convenience: **every bank keeps at least one
 * hall-call-accepting car at every instant of the run.** A bank with none is a bank whose
 * landings nobody can collect, and `properties.ts` `isServable` reasons about topology and
 * access credentials, not about service mode — so it would call those passengers servable and
 * P5 would report a deadlock. That report would be correct (the property working), and it would
 * also be a *generator* artefact rather than a simulator finding, which is the same mistake
 * `unroutable` exists to keep out of the campaign. The corner itself is not lost: it is covered
 * deliberately, with the expected `timed-out` status asserted, in
 * `validation/adversarial.test.ts` and `core/src/sim/serviceMode.test.ts`.
 *
 * ## The call type is drawn against the profile, not beside it
 *
 * A `(building, dispatcher profile, call type)` triple used to be three independent draws, and the
 * third is not independent of the second: `dispatch.passengerAssignment: 'panel'` declares
 * `activeWhen: { 'dispatch.callType': [...DESTINATION_CALL_TYPES] }` and `resolveDispatchConfig`
 * **refuses** the pair outright, while `weights.rideTime` carries the same gate from the term's own
 * definition and goes silently to zero under it. So the generator drew pairs the engine cannot run
 * (`destination-panel` × `up-down-buttons`, which `run.ts` `withCallType` rewrote at run time) and
 * pairs it runs with the profile's whole point switched off (`destination-eta` × `up-down-buttons`,
 * whose `weights.rideTime: 0.5` is inert). Measured before the fix: **1 of the 64 pinned cases and
 * 122 of 2 000 deep cases**, 61 of each kind.
 *
 * {@link legalCallTypesFor} closes it, and it is derived rather than listed: for each candidate the
 * profile is resolved through the **real** `resolveDispatchConfig` (which is what refuses the hard
 * pairs), and then every row of `DISPATCH_PARAMETERS` the profile moves off its declared default is
 * required to be *live* by its own `activeWhen`. No profile id and no term id appears here
 * (CLAUDE.md invariant 7) — a thirteenth profile, or a second gated term, is covered on the day it
 * lands in `data/`.
 *
 * What that does **not** do is widen the axis. {@link GENERATED_CALL_TYPES} is the two rungs of the
 * information ladder the campaign explores, and `destination-entry` — the middle rung, legal for
 * eleven of the twelve shipped profiles — is still unreached by both corpora. Widening it is a
 * coverage decision with a different blast radius (it moves roughly half of every corpus, and under
 * access zoning it is a *third* case rather than a second, being a call that carries a destination
 * but no credential), and it belongs to its own task rather than to this one. `generate.test.ts` asserts
 * both halves: that every generated pair is legal, and that the unexplored rung is named.
 *
 * ## Connectivity is a construction guarantee, not a filter
 *
 * `RoutePlanner.requireRoute` throws when no chain of banks connects two floors, which is
 * correct behaviour for a building nobody could ride — but it is a *generator* defect, not a
 * simulator one, and a campaign that reported it as a counterexample would drown the real
 * findings. So each of the four topologies is connected by construction: the two multi-bank
 * layouts always share a floor flagged `isTransferFloor`, and `generate.test.ts` asserts the
 * whole corpus routes. Shrinking re-checks it, and discards a candidate that disconnects.
 */

import {
  CALL_TYPES,
  DISPATCH_PARAMETERS,
  DispatchError,
  dispatchParameterValue,
  parseBuilding,
  resolveBuilding,
  resolveDispatchConfig,
  type BuildingConfig,
  type CallType,
  type DemandTemplateId,
  type DispatcherProfile,
  type ElevatorSpecs,
  type Rng,
  type ResolvedBuilding,
  type ResolvedDispatchConfig,
  type ServiceEventConfig,
  type ServiceMode,
  StreamSet,
} from '@elevator-sim/core';

// One rule for every `activeWhen` in every schema, and this is the package's only copy of it —
// `core` implements it beside `DISPATCH_PARAMETERS` but does not put it on the barrel, so
// `tuning/space/types.ts` restates it once and says so in its own docstring. Imported rather than
// restated a second time: a generator that evaluated gates by a rule of its own would be deciding
// what "live" means for a schema it does not own.
import { activeWhenSatisfied } from '../tuning/space/types.js';

import type { FuzzCase, FuzzTopology } from './types.js';

/**
 * Shortest run each demand template will resolve at.
 *
 * Both floors are properties of the shipped `data/traffic-profiles.json`, not of this file:
 * `rise-and-fall` holds a 300 s peak that must fit inside the horizon, and `constant-iso`
 * discards its first 15 minutes and last 5 as warm-up and cool-down, so a run shorter than
 * 20 minutes has no measurement window at all. Both templates throw rather than trimming —
 * correctly, because a peak window wider than the run would report a slice of a ramp as the
 * peak. The generator honours both floors and so does the shrinker.
 */
export const MIN_DURATION_BY_TEMPLATE: Readonly<Record<string, number>> = Object.freeze({
  'rise-and-fall': 360,
  'constant-iso': 1260,
});

export function minDurationFor(demandTemplate: string): number {
  return MIN_DURATION_BY_TEMPLATE[demandTemplate] ?? 360;
}

/* -------------------------------------------------------------------------- *
 * Generation space
 * -------------------------------------------------------------------------- */

/**
 * The bounds of the search space, in the two sizes the campaign runs at.
 *
 * `standard` is the always-on corpus: small enough that 24 cases cost a few seconds, wide
 * enough that every topology, both entrance arrangements and both extremes of floor pitch are
 * reachable. `deep` is the opt-in campaign and widens the same axes rather than adding new
 * ones, so a deep finding shrinks into the standard space whenever it can.
 */
export interface FuzzSpace {
  /** Total declared floors, **including basements**. Never below 2: a bank must serve two. */
  readonly minFloors: number;
  /** Total declared floors, including basements. The corpus asserts it is reached and not passed. */
  readonly maxFloors: number;
  readonly maxCarsPerBank: number;
  readonly maxPopulationPerFloor: number;
  readonly minDurationS: number;
  readonly maxDurationS: number;
  readonly maxArrivalRatePctPop5min: number;
  readonly drainGraceS: number;
  /**
   * Probability that a bank of two or more cars starts the run with **one** of them in a
   * degraded service mode.
   *
   * Per bank, not per building, so a shuttle layout is three independent draws. Never applied to
   * a single-car bank: see {@link generateService} for why the fleet is never wholly withdrawn.
   */
  readonly initialServiceModeProbability: number;
  /** Probability that a case carries a mid-run {@link ServiceEventConfig} schedule at all. */
  readonly serviceScheduleProbability: number;
}

/** The always-on corpus space. Deliberately small; the cost is stated, never silently capped. */
export const STANDARD_SPACE: FuzzSpace = Object.freeze({
  minFloors: 2,
  maxFloors: 14,
  maxCarsPerBank: 3,
  maxPopulationPerFloor: 160,
  minDurationS: 360,
  maxDurationS: 900,
  maxArrivalRatePctPop5min: 30,
  drainGraceS: 900,
  initialServiceModeProbability: 0.2,
  serviceScheduleProbability: 0.25,
});

/** The opt-in campaign space: taller buildings, longer horizons, demand well past capacity. */
export const DEEP_SPACE: FuzzSpace = Object.freeze({
  minFloors: 2,
  maxFloors: 40,
  maxCarsPerBank: 6,
  maxPopulationPerFloor: 140,
  minDurationS: 300,
  maxDurationS: 1800,
  maxArrivalRatePctPop5min: 28,
  drainGraceS: 1800,
  // Wider than the always-on corpus on the same axis rather than on a new one, which is the rule
  // the whole deep space follows: a deep finding must shrink into the standard space when it can.
  initialServiceModeProbability: 0.3,
  serviceScheduleProbability: 0.4,
});

/** Everything the generator needs from the loaded reference data. Ids are data, never literals. */
export interface GenerateOptions {
  readonly elevatorSpecs: ElevatorSpecs;
  /**
   * The shipped dispatcher profiles, whole. Which dispatcher runs is a choice, not a branch.
   *
   * The profiles rather than their ids, because the call type a case may name is a function of the
   * profile it names it beside — see {@link legalCallTypesFor}. An id cannot answer that question,
   * and a lookup table keyed by id inside the generator would be the branch invariant 7 forbids.
   */
  readonly dispatcherProfiles: readonly DispatcherProfile[];
  /** Shipped traffic profile ids. */
  readonly trafficProfileIds: readonly string[];
  readonly space?: FuzzSpace | undefined;
}

/* -------------------------------------------------------------------------- *
 * Which call types a profile can carry
 * -------------------------------------------------------------------------- */

/**
 * The call types the campaign draws from, and the one it does not.
 *
 * The two ends of the `dispatch.callType` ladder: a landing button that knows neither destination
 * nor credential, and a phone that knows both. They are the two that matter to the rest of this
 * file, because the access-zone axis turns on whether the call carries a **credential** — a
 * restricted landing is servable under one and a lockout under the other.
 *
 * `destination-entry` — the middle rung, which knows the destination and not the credential — is
 * deliberately **not** here, and that is a coverage gap this file states rather than hides. See the
 * module docstring; `generate.test.ts` asserts the gap is named and not merely absent.
 */
export const GENERATED_CALL_TYPES: readonly CallType[] = Object.freeze(
  CALL_TYPES.filter((callType) => callType !== 'destination-entry'),
);

/**
 * The call type an access-restricted landing needs before its passengers can be carried at all.
 *
 * A literal because it is a property of what the *call type* knows rather than a tunable: `docs/06`
 * § Stage 1 — *"mobile-credential knows both"* — and `core` publishes no predicate for the
 * credential half (`isDestinationCallType` covers only the destination half). Named here so the two
 * places the generator depends on it read as one fact.
 */
const CREDENTIALED_CALL_TYPE: CallType = 'mobile-credential';

const DISPATCH_PARAMETER_BY_ID = new Map(
  DISPATCH_PARAMETERS.map((parameter) => [parameter.id, parameter]),
);

/**
 * Whether this profile can be run under this call type without either being refused or gutted.
 *
 * Two grounds, and the second is the one that has no exception to throw:
 *
 * 1. **`resolveDispatchConfig` refuses the pair.** `dispatch.passengerAssignment: 'panel'` under a
 *    call type that carries no destination is *"a panel that cannot ask for a destination"*
 *    (`DECISIONS.md` § T16-D1), and `dispatch.assignmentTiming: 'deferred'` under
 *    `destination-entry` is refused for the mirror reason. Both throw `DispatchError`, so the real
 *    resolver is asked rather than its rules restated.
 * 2. **A tunable the profile moved off its default is inert.** Every row of `DISPATCH_PARAMETERS`
 *    that declares an `activeWhen` must be live under the candidate call type. That is what catches
 *    `destination-eta` × `up-down-buttons`: nothing refuses it, it runs, and `weights.rideTime: 0.5`
 *    — the entire difference between that profile and `eta` ([§ D112](DECISIONS.md)) — returns 0 for
 *    every car. A case that names a destination profile and measures a conventional one is worse
 *    than a case that crashes, because it reports.
 *
 * The default comparison is what makes the second ground safe to apply to the *whole* schema: a
 * parameter still sitting at its declared default is one the profile is not asking for, and a gate
 * closed over it costs nothing. Only what the profile actually authored has to be live.
 */
export function carriesCallType(profile: DispatcherProfile, callType: CallType): boolean {
  const candidate: DispatcherProfile = { ...profile, dispatch: { ...profile.dispatch, callType } };

  let resolved: ResolvedDispatchConfig;
  try {
    resolved = resolveDispatchConfig(candidate);
  } catch (error) {
    if (error instanceof DispatchError) return false;
    throw error;
  }

  // A parameter the resolved config does not carry reads as its declared default, which is exactly
  // what the engine will use — the same rule `policies.test.ts` § `settingAt` states: a gate is
  // judged against what the run will do, not against what the file happens to spell out.
  const read = (id: string): number | string | boolean | undefined =>
    dispatchParameterValue(resolved, id) ?? DISPATCH_PARAMETER_BY_ID.get(id)?.default;

  for (const parameter of DISPATCH_PARAMETERS) {
    const conditions = parameter.activeWhen;
    if (conditions === undefined) continue;
    if (read(parameter.id) === parameter.default) continue;
    for (const [gate, condition] of Object.entries(conditions)) {
      if (condition === undefined) continue;
      if (!activeWhenSatisfied(condition, read(gate))) return false;
    }
  }
  return true;
}

/**
 * Every call type in {@link GENERATED_CALL_TYPES} this profile can carry, in ladder order.
 *
 * @throws Error if a shipped profile can carry none of them. That is a `data/` change this
 *   generator cannot express, not a case to skip: a profile the campaign silently stopped
 *   generating would narrow the corpus without failing anything, which is the exact shape of defect
 *   `generate.test.ts`'s coverage assertions exist to catch.
 */
export function legalCallTypesFor(profile: DispatcherProfile): readonly CallType[] {
  const legal = GENERATED_CALL_TYPES.filter((callType) => carriesCallType(profile, callType));
  if (legal.length === 0) {
    throw new Error(
      `dispatcher profile "${profile.id}" can carry none of the call types the fuzz generator draws ` +
        `(${GENERATED_CALL_TYPES.join(', ')}), so no case can name it. Widen GENERATED_CALL_TYPES or ` +
        `fix the profile; do not skip it silently.`,
    );
  }
  return legal;
}

/* -------------------------------------------------------------------------- *
 * Small helpers over `Rng`
 * -------------------------------------------------------------------------- */

function pick<T>(rng: Rng, items: readonly T[]): T {
  const chosen = items[rng.nextInt(0, items.length)];
  /* c8 ignore next -- nextInt is in range by construction; this narrows the type. */
  if (chosen === undefined) throw new RangeError('cannot pick from an empty list');
  return chosen;
}

/** Uniform in `[low, high]`, rounded to `decimals` so a config reads like one a human wrote. */
function uniform(rng: Rng, low: number, high: number, decimals = 2): number {
  const scale = 10 ** decimals;
  return Math.round((low + rng.nextFloat() * (high - low)) * scale) / scale;
}

/* -------------------------------------------------------------------------- *
 * Floors
 * -------------------------------------------------------------------------- */

interface GeneratedFloor {
  readonly id: string;
  readonly index: number;
  readonly heightM: number;
  population: number;
  isEntrance?: boolean;
  isTransferFloor?: boolean;
}

/** `G` at index 0, `B1`/`B2` below it, the plain number above. Unique because indices are. */
function floorIdOf(index: number): string {
  if (index === 0) return 'G';
  return index < 0 ? `B${String(-index)}` : String(index);
}

/**
 * A shaft: strictly increasing `heightM` against strictly increasing `index`, with the
 * entrance at 0 m.
 *
 * Index gaps are generated on purpose — real towers skip 13, and a skipped *number* is not a
 * skipped *storey*, so the height still advances by exactly one pitch. A generator that
 * advanced the height by the index gap would build a building with a phantom floor's worth of
 * shaft in it and quietly change every flight time.
 */
function generateFloors(rng: Rng, space: FuzzSpace): GeneratedFloor[] {
  // Basements first, then the floors above them, so the **total** honours `maxFloors`. Drawing
  // the above-ground count against `maxFloors` and adding basements afterwards silently pushes
  // the corpus two floors past its own declared ceiling, which is the sort of quiet widening the
  // "what this does not cover" claim exists to prevent.
  const basements = rng.nextFloat() < 0.25 ? rng.nextIntInclusive(1, 2) : 0;
  const above = rng.nextIntInclusive(
    Math.max(1, space.minFloors - 1 - basements),
    Math.max(1, space.maxFloors - 1 - basements),
  );

  // Pitch: the ordinary range, and a 15 % tail of degenerate ones — a 2.2 m crawlspace or a
  // 12 m atrium storey. Both are legal configs and both change which hops reach rated speed.
  const pitchM = rng.nextFloat() < 0.15 ? uniform(rng, 2.2, 12, 1) : uniform(rng, 2.6, 4.6, 1);
  const skipThirteen = rng.nextFloat() < 0.3;

  const indices: number[] = [];
  for (let b = basements; b >= 1; b -= 1) indices.push(-b);
  indices.push(0);
  let next = 1;
  for (let i = 0; i < above; i += 1) {
    if (skipThirteen && next === 13) next += 1;
    indices.push(next);
    next += 1;
  }

  const floors: GeneratedFloor[] = [];
  indices.forEach((index, position) => {
    // Heights are laid out from the bottom and then shifted so the entrance sits at 0 m,
    // which is the convention every shipped building uses.
    const heightM = Math.round((position - basements) * pitchM * 1000) / 1000;
    floors.push({ id: floorIdOf(index), index, heightM, population: 0 });
  });

  // Populations. The entrance carries none (it is where people enter the building, not where
  // they live), and a sprinkling of upper floors are empty — a plant room, a vacant tenancy.
  let populated = 0;
  for (const floor of floors) {
    if (floor.index === 0) continue;
    const population = rng.nextFloat() < 0.15 ? 0 : rng.nextIntInclusive(4, space.maxPopulationPerFloor);
    floor.population = population;
    if (population > 0) populated += 1;
  }
  // A building with no population generates no demand, and a vacuously-passing property is
  // worse than no property. Force one occupied floor.
  if (populated === 0) {
    const last = floors[floors.length - 1];
    if (last !== undefined && last.index !== 0) last.population = 20;
    else {
      const first = floors[0];
      if (first !== undefined) first.population = 20;
    }
  }

  const entrance = floors.find((floor) => floor.index === 0);
  if (entrance !== undefined) entrance.isEntrance = true;
  // A second entrance in the basement — car park, metro concourse. Two-terminal up-peak is a
  // materially different traffic problem from one-terminal, and no generated building would
  // ever reach it by chance.
  if (basements > 0 && rng.nextFloat() < 0.4) {
    const basement = floors[0];
    if (basement !== undefined) {
      basement.isEntrance = true;
      basement.population = 0;
    }
  }

  return floors;
}

/* -------------------------------------------------------------------------- *
 * Banks and cars
 * -------------------------------------------------------------------------- */

interface GeneratedCar {
  readonly id: string;
  readonly spec: string;
  readonly ratedSpeedMps: number;
  readonly ratedLoadLb: number;
  readonly doorType: 'centerOpening' | 'sideOpening';
  readonly passengerTransferS?: number;
}

interface GeneratedBank {
  readonly id: string;
  readonly servesFloors: readonly string[];
  readonly cars: readonly GeneratedCar[];
}

/**
 * One car, resolved against a real elevator class.
 *
 * Speed and load are drawn inside the class envelope most of the time and outside it
 * sometimes: outside is a *warning*, not an error, so the loader accepts it and the run
 * proceeds — which makes an undersized car in a tall shaft a reachable configuration rather
 * than a hypothetical one.
 */
function generateCar(
  rng: Rng,
  specs: ElevatorSpecs,
  id: string,
  needsTransferTime: boolean,
): GeneratedCar {
  const spec = pick(rng, specs.classes);
  const insideEnvelope = rng.nextFloat() < 0.85;
  const ratedSpeedMps = insideEnvelope
    ? uniform(rng, spec.ratedSpeedMps.min, spec.ratedSpeedMps.max)
    : uniform(rng, 0.4, 10);
  const ratedLoadLb = insideEnvelope
    ? Math.round(uniform(rng, spec.capacityLbRange[0], spec.capacityLbRange[1], 0) / 50) * 50
    : Math.round(uniform(rng, 900, 6000, 0) / 50) * 50;

  return {
    id,
    spec: spec.id,
    ratedSpeedMps,
    ratedLoadLb,
    doorType: rng.nextFloat() < 0.5 ? 'centerOpening' : 'sideOpening',
    // `mixed-use` has no row in `timing.passengerTransferS` on purpose, so a car in a mixed
    // building must state its own or the loader raises `missing-passenger-transfer`.
    ...(needsTransferTime ? { passengerTransferS: uniform(rng, 1, 2.5, 2) } : {}),
  };
}

function generateCars(
  rng: Rng,
  specs: ElevatorSpecs,
  space: FuzzSpace,
  bankId: string,
  needsTransferTime: boolean,
): GeneratedCar[] {
  // Weighted towards one and two: a single-car bank has no allocation problem at all, which
  // is exactly what makes an overflow attributable to capacity rather than to dispatch.
  const count =
    rng.nextFloat() < 0.3 ? 1 : rng.nextIntInclusive(2, Math.max(2, space.maxCarsPerBank));
  const cars: GeneratedCar[] = [];
  for (let i = 0; i < count; i += 1) {
    cars.push(generateCar(rng, specs, `${bankId}-${String(i + 1)}`, needsTransferTime));
  }
  return cars;
}

/**
 * Lay the banks out over the floors, and flag any transfer floor the layout needs.
 *
 * Mutates `floors` only to set `isTransferFloor`, which is the one property of a floor that
 * is a consequence of the bank layout rather than an input to it.
 */
function generateBanks(
  rng: Rng,
  specs: ElevatorSpecs,
  space: FuzzSpace,
  floors: GeneratedFloor[],
  topology: FuzzTopology,
  needsTransferTime: boolean,
): GeneratedBank[] {
  const ids = floors.map((floor) => floor.id);
  const bank = (id: string, servesFloors: readonly string[]): GeneratedBank => ({
    id,
    servesFloors,
    cars: generateCars(rng, specs, space, id, needsTransferTime),
  });

  switch (topology) {
    case 'single-bank':
      return [bank('main', ids)];

    case 'parallel-banks':
      return [bank('a', ids), bank('b', ids)];

    case 'sky-lobby': {
      // The split floor is served by both banks and is the only place a journey may change
      // one, so it must be flagged. Both halves keep at least two floors.
      const split = rng.nextIntInclusive(1, ids.length - 2);
      const sky = floors[split];
      /* c8 ignore next -- `split` is inside the array by construction. */
      if (sky === undefined) return [bank('main', ids)];
      sky.isTransferFloor = true;
      return [bank('low', ids.slice(0, split + 1)), bank('high', ids.slice(split))];
    }

    case 'shuttle': {
      const split = rng.nextIntInclusive(2, ids.length - 2);
      const sky = floors[split];
      const bottom = ids[0];
      /* c8 ignore next -- both indices are inside the array by construction. */
      if (sky === undefined || bottom === undefined) return [bank('main', ids)];
      sky.isTransferFloor = true;
      return [
        // An express run between exactly two floors: the smallest legal `servesFloors`.
        bank('shuttle', [bottom, sky.id]),
        bank('low', ids.slice(0, split + 1)),
        bank('high', ids.slice(split)),
      ];
    }
  }
}

/* -------------------------------------------------------------------------- *
 * Service mode
 * -------------------------------------------------------------------------- */

/**
 * The three modes that are not `in-service`.
 *
 * All three are generated, not just `out-of-service`, because they are three different
 * behaviours and only one of them is the obvious one. `acceptsHallCalls` is true for
 * `in-service` alone, so all three take the car out of *group* control; but `acceptsCarCalls` is
 * also true for `independent`, so an `independent` car still answers the buttons pressed inside
 * it and finishes the journeys of whoever is already aboard, while an `out-of-service` or
 * `fire-recall` car strands them. Generating only `out-of-service` would leave the branch that
 * distinguishes them unvisited.
 */
const DEGRADED_MODES: readonly ServiceMode[] = Object.freeze([
  'out-of-service',
  'independent',
  'fire-recall',
]);

/** `mode` per `bankId/carId`, plus the authored schedule. Both go straight into the config. */
interface ServicePlan {
  readonly modes: ReadonlyMap<string, ServiceMode>;
  readonly events: readonly ServiceEventConfig[];
  /** A car left its bank and came back. Tagged, because the return path is its own behaviour. */
  readonly returns: boolean;
}

/**
 * Draw an initial mode per car and a mid-run schedule, under one hard constraint.
 *
 * **Every bank holds at least one `in-service` car at every instant of the run**, and two clauses
 * are what enforce it: an initial degradation is drawn only for a bank of two or more cars, and a
 * scheduled withdrawal only for a bank that still has two *serving* cars once the initial draw is
 * in. Both leave one behind. The module docstring gives the reason at length; the short form is
 * that a bank with no serving car makes P5 fire on a passenger `properties.ts` believes is
 * servable, and that verdict would be *correct* — which makes it a generator defect, not a
 * simulator finding, and the campaign must not report it as one.
 *
 * Times are drawn as fractions of `durationS` rather than as absolute seconds, so a 360 s case
 * and an 1800 s case both get a schedule that fires inside their own demand horizon. A withdrawal
 * lands in the first half and a return, when there is one, strictly before the horizon ends —
 * past it the entry is legal but the simulator refuses it with a warning
 * (`sim/simulation.ts` `#scheduleServiceEvents`), which would silently make the case inert.
 */
function generateService(
  rng: Rng,
  space: FuzzSpace,
  banks: readonly GeneratedBank[],
  durationS: number,
): ServicePlan {
  const modes = new Map<string, ServiceMode>();
  const events: ServiceEventConfig[] = [];

  for (const bank of banks) {
    if (bank.cars.length < 2) continue;
    if (rng.nextFloat() >= space.initialServiceModeProbability) continue;
    const car = pick(rng, bank.cars);
    modes.set(`${bank.id}/${car.id}`, pick(rng, DEGRADED_MODES));
  }

  let returns = false;
  if (rng.nextFloat() < space.serviceScheduleProbability) {
    // A bank that would still be serving its landings with the car withdrawn: at least two cars
    // currently `in-service`, so removing one leaves one.
    const servingOf = (bank: GeneratedBank): readonly GeneratedCar[] =>
      bank.cars.filter((car) => !modes.has(`${bank.id}/${car.id}`));
    const eligible = banks.filter((bank) => servingOf(bank).length >= 2);
    if (eligible.length > 0) {
      const bank = pick(rng, eligible);
      const car = pick(rng, servingOf(bank));
      const outAt = Math.round(durationS * uniform(rng, 0.15, 0.5, 3));
      events.push({
        atS: outAt,
        carId: car.id,
        // Car ids are `<bankId>-<n>` and bank ids are distinct, so they are unique building-wide
        // and `bankId` is genuinely optional here. Both forms are drawn: the resolver's
        // unqualified lookup is a real path and an unfuzzed one is an untested one.
        ...(rng.nextFloat() < 0.5 ? { bankId: bank.id } : {}),
        mode: pick(rng, DEGRADED_MODES),
      });
      // Drawn, not implied. `outAt` is inside the first half and the gap is at most 35 % of the
      // horizon, so a return would *always* fit — which would make "withdrawn for the rest of the
      // run" unreachable and the `service-return` tag vacuous. The two are different runs: a car
      // that comes back re-enters group control and the retry timer finds it, and a car that does
      // not leaves its bank one car short to the end.
      const backAt = Math.round(outAt + durationS * uniform(rng, 0.15, 0.35, 3));
      if (rng.nextFloat() < 0.6 && backAt < durationS) {
        returns = true;
        events.push({
          atS: backAt,
          carId: car.id,
          ...(rng.nextFloat() < 0.5 ? { bankId: bank.id } : {}),
          mode: 'in-service',
        });
      }
    }
  }

  return { modes, events, returns };
}

/* -------------------------------------------------------------------------- *
 * The case
 * -------------------------------------------------------------------------- */

/** Topologies a building of this many floors can actually carry. */
function topologiesFor(floorCount: number): readonly FuzzTopology[] {
  if (floorCount < 3) return ['single-bank', 'parallel-banks'];
  if (floorCount < 4) return ['single-bank', 'parallel-banks', 'sky-lobby'];
  return ['single-bank', 'parallel-banks', 'sky-lobby', 'shuttle'];
}

/**
 * Build one case from one seed.
 *
 * Pure and total for a given `(fuzzSeed, options)`: the same pair always produces the same
 * case, on any platform. That is what makes a reported counterexample an integer rather than
 * a paragraph.
 *
 * @throws ConfigError if the generator ever emits a config the real schema rejects. That is a
 *   bug in *this* file — the whole design is that it cannot happen — and it is thrown rather
 *   than filtered so it cannot be mistaken for a simulator finding.
 */
export function caseFromSeed(fuzzSeed: number | bigint, options: GenerateOptions): FuzzCase {
  const space = options.space ?? STANDARD_SPACE;
  const streams = new StreamSet(fuzzSeed);
  const shape = streams.derive('fuzz.shape');
  const floorRng = streams.derive('fuzz.floors');
  const bankRng = streams.derive('fuzz.banks');
  const carRng = streams.derive('fuzz.cars');
  const accessRng = streams.derive('fuzz.access');
  const runRng = streams.derive('fuzz.run');
  const serviceRng = streams.derive('fuzz.service');

  const buildingType = pick(shape, ['office', 'residential', 'hotel', 'mixed-use'] as const);
  const trafficProfile = pick(shape, options.trafficProfileIds);
  const floors = generateFloors(floorRng, space);
  const topology = pick(shape, topologiesFor(floors.length));
  const banks = generateBanks(bankRng, options.elevatorSpecs, space, floors, topology, buildingType === 'mixed-use');

  /* ---- access zones ------------------------------------------------------ */
  // Never on an entrance and never on a transfer floor: a restricted transfer floor makes a
  // route no credential can complete, and the trace generator correctly refuses to generate
  // the trip — which would silently narrow the demand rather than test anything.
  const zoneCandidates = floors.filter(
    (floor) => floor.isEntrance !== true && floor.isTransferFloor !== true && floor.index > 0,
  );
  const zoneCount =
    zoneCandidates.length >= 2 && accessRng.nextFloat() < 0.35 ? accessRng.nextIntInclusive(1, 2) : 0;
  const accessZones: { id: string; floors: string[]; credentialGroups: string[] }[] = [];
  const taken = new Set<string>();
  for (let z = 0; z < zoneCount; z += 1) {
    const size = accessRng.nextIntInclusive(1, Math.min(3, zoneCandidates.length));
    const zoneFloors: string[] = [];
    for (let i = 0; i < size; i += 1) {
      const candidate = pick(accessRng, zoneCandidates);
      if (taken.has(candidate.id)) continue;
      taken.add(candidate.id);
      zoneFloors.push(candidate.id);
    }
    if (zoneFloors.length === 0) continue;
    accessZones.push({
      id: `zone-${String(z + 1)}`,
      floors: zoneFloors,
      credentialGroups: [`grp-${String(z + 1)}`],
    });
  }

  /* ---- run configuration ------------------------------------------------- */
  const dispatcherProfile = pick(runRng, options.dispatcherProfiles);
  const dispatcherProfileId = dispatcherProfile.id;
  // `constant-iso` needs a 20-minute horizon before it has a measurement window at all, so it
  // is reachable only in a space whose runs are long enough — the always-on corpus is entirely
  // `rise-and-fall`, and the deep campaign draws both. Stated on the corpus, not capped here.
  const demandTemplate = pick(
    runRng,
    (['rise-and-fall', 'constant-iso'] as const).filter(
      (id) => space.maxDurationS >= minDurationFor(id),
    ),
  );
  // The call types this profile can actually be run under — never all of them, and never a fixed
  // list. See `legalCallTypesFor`.
  const callTypes = legalCallTypesFor(dispatcherProfile);
  const credentialed = callTypes.find((id) => id === CREDENTIALED_CALL_TYPE);
  const uncredentialed = callTypes.find((id) => id !== CREDENTIALED_CALL_TYPE);

  // With restricted floors in play a bare up/down button carries no credential, so a call from
  // a restricted landing is unassignable and those passengers are locked out for the whole run.
  // That is a real operating condition and it is generated on purpose in a minority of cases —
  // tagged, so the starvation property can tell "abandoned" from "not authorized to travel".
  //
  // The draw is made whenever there are access zones and is *then* resolved against what the
  // profile can carry, rather than the two being folded into one condition: the `fuzz.run` stream
  // must advance identically whatever the profile is, or making the generator profile-aware would
  // move every scalar drawn after it — the horizon, the arrival rate, the service schedule that is
  // a function of the horizon — in every case, for a reason that has nothing to do with them.
  const lockoutDrawn = accessZones.length > 0 && runRng.nextFloat() < 0.25;
  const underAccessZones = (lockoutDrawn ? uncredentialed : credentialed) ?? credentialed ?? uncredentialed;
  /* c8 ignore next 4 -- `legalCallTypesFor` throws on an empty set, so one of the two is present. */
  if (underAccessZones === undefined) {
    throw new Error(`no legal call type for dispatcher profile "${dispatcherProfileId}"`);
  }
  const callType: CallType = accessZones.length === 0 ? pick(runRng, callTypes) : underAccessZones;
  // The tag is read off the chosen call type rather than off the draw, so it says what is true of
  // the case: restricted landings are locked out exactly when the call carries no credential.
  const lockout = accessZones.length > 0 && callType !== CREDENTIALED_CALL_TYPE;

  // Drawn here rather than inline in the returned object literal, in exactly the order they were
  // drawn before this axis existed — `arrivalRatePctPop5min`, then `durationS`, then
  // `doorObstructionProbability` — because the service schedule needs the horizon in hand and a
  // reordered draw would move every case in the pinned corpus for no reason anybody could read.
  const arrivalRatePctPop5min = uniform(runRng, 2, space.maxArrivalRatePctPop5min, 1);
  const durationS = runRng.nextIntInclusive(
    Math.max(space.minDurationS, minDurationFor(demandTemplate)),
    Math.max(space.maxDurationS, minDurationFor(demandTemplate)),
  );
  // Zero most of the time, because a non-zero probability draws from the `doorObstruction`
  // stream and the determinism tests rely on it being untouched at the default.
  const doorObstructionProbability =
    runRng.nextFloat() < 0.25 ? uniform(runRng, 0.05, 0.5, 2) : 0;

  const service = generateService(serviceRng, space, banks, durationS);

  const authored = {
    id: `fuzz-${String(fuzzSeed)}`,
    name: `Fuzz building ${String(fuzzSeed)}`,
    type: buildingType,
    trafficProfile,
    floors: floors.map((floor) => ({
      id: floor.id,
      index: floor.index,
      heightM: floor.heightM,
      population: floor.population,
      ...(floor.isEntrance === true ? { isEntrance: true } : {}),
      ...(floor.isTransferFloor === true ? { isTransferFloor: true } : {}),
    })),
    totalPopulation: floors.reduce((sum, floor) => sum + floor.population, 0),
    banks: banks.map((bank) => ({
      id: bank.id,
      servesFloors: [...bank.servesFloors],
      cars: bank.cars.map((car) => {
        const mode = service.modes.get(`${bank.id}/${car.id}`);
        // Absent, not `'in-service'`: `CarConfig.mode` is optional and its absence means the
        // default, so an unaffected car authors exactly the JSON it authored before.
        return { ...car, ...(mode === undefined ? {} : { mode }) };
      }),
    })),
    accessZones,
    ...(service.events.length === 0 ? {} : { serviceEvents: [...service.events] }),
  };

  const tags: string[] = [topology];
  if (floors.length <= 3) tags.push('degenerate-rise');
  if (banks.every((bank) => bank.cars.length === 1)) tags.push('single-car-banks');
  if (accessZones.length > 0) tags.push('access-zones');
  if (lockout) tags.push('access-lockout');
  if (floors.some((floor) => floor.index < 0)) tags.push('basement');
  if (floors.filter((floor) => floor.isEntrance === true).length > 1) tags.push('two-entrances');
  if (buildingType === 'mixed-use') tags.push('mixed-use');
  if (service.modes.size > 0) tags.push('initial-service-mode');
  if (service.events.length > 0) tags.push('service-schedule');
  if (service.returns) tags.push('service-return');

  return Object.freeze({
    caseId: `fuzz-${String(fuzzSeed)}`,
    fuzzSeed: String(fuzzSeed),
    // A distinct integer, so the passenger population is not a function of the building shape.
    simSeed: Number(BigInt.asUintN(31, BigInt(fuzzSeed) * 2654435761n + 1013904223n)),
    topology,
    building: parseBuilding(authored, `fuzz-${String(fuzzSeed)}.json`),
    dispatcherProfileId,
    callType,
    arrivalRatePctPop5min,
    demandTemplate,
    durationS,
    doorObstructionProbability,
    drainGraceS: space.drainGraceS,
    tags: Object.freeze(tags),
  });
}

/** `resolveBuilding` for a case, against the real specs. Throws `ConfigError` on a bad config. */
export function resolveCase(fuzzCase: FuzzCase, options: GenerateOptions): ResolvedBuilding {
  return resolveBuilding(fuzzCase.building, options.elevatorSpecs, {
    file: `${fuzzCase.caseId}.json`,
    trafficProfileIds: new Set(options.trafficProfileIds),
  });
}

/** Re-parse an edited building through the real schema. Used by the shrinker. */
export function reparse(building: unknown, caseId: string): BuildingConfig {
  return parseBuilding(building, `${caseId}.json`);
}
