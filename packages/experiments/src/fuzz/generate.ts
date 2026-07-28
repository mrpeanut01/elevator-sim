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
  parseBuilding,
  resolveBuilding,
  type BuildingConfig,
  type CallType,
  type DemandTemplateId,
  type ElevatorSpecs,
  type Rng,
  type ResolvedBuilding,
  StreamSet,
} from '@elevator-sim/core';

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
});

/** Everything the generator needs from the loaded reference data. Ids are data, never literals. */
export interface GenerateOptions {
  readonly elevatorSpecs: ElevatorSpecs;
  /** Shipped dispatcher profile ids. Which dispatcher runs is a choice, not a branch. */
  readonly dispatcherProfileIds: readonly string[];
  /** Shipped traffic profile ids. */
  readonly trafficProfileIds: readonly string[];
  readonly space?: FuzzSpace | undefined;
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
  const dispatcherProfileId = pick(runRng, options.dispatcherProfileIds);
  // `constant-iso` needs a 20-minute horizon before it has a measurement window at all, so it
  // is reachable only in a space whose runs are long enough — the always-on corpus is entirely
  // `rise-and-fall`, and the deep campaign draws both. Stated on the corpus, not capped here.
  const demandTemplate = pick(
    runRng,
    (['rise-and-fall', 'constant-iso'] as const).filter(
      (id) => space.maxDurationS >= minDurationFor(id),
    ),
  );
  // With restricted floors in play a bare up/down button carries no credential, so a call from
  // a restricted landing is unassignable and those passengers are locked out for the whole run.
  // That is a real operating condition and it is generated on purpose in a minority of cases —
  // tagged, so the starvation property can tell "abandoned" from "not authorized to travel".
  const lockout = accessZones.length > 0 && runRng.nextFloat() < 0.25;
  const callType: CallType =
    accessZones.length === 0
      ? pick(runRng, ['up-down-buttons', 'mobile-credential'] as const)
      : lockout
        ? 'up-down-buttons'
        : 'mobile-credential';

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
      cars: bank.cars.map((car) => ({ ...car })),
    })),
    accessZones,
  };

  const tags: string[] = [topology];
  if (floors.length <= 3) tags.push('degenerate-rise');
  if (banks.every((bank) => bank.cars.length === 1)) tags.push('single-car-banks');
  if (accessZones.length > 0) tags.push('access-zones');
  if (lockout) tags.push('access-lockout');
  if (floors.some((floor) => floor.index < 0)) tags.push('basement');
  if (floors.filter((floor) => floor.isEntrance === true).length > 1) tags.push('two-entrances');
  if (buildingType === 'mixed-use') tags.push('mixed-use');

  return Object.freeze({
    caseId: `fuzz-${String(fuzzSeed)}`,
    fuzzSeed: String(fuzzSeed),
    // A distinct integer, so the passenger population is not a function of the building shape.
    simSeed: Number(BigInt.asUintN(31, BigInt(fuzzSeed) * 2654435761n + 1013904223n)),
    topology,
    building: parseBuilding(authored, `fuzz-${String(fuzzSeed)}.json`),
    dispatcherProfileId,
    callType,
    arrivalRatePctPop5min: uniform(runRng, 2, space.maxArrivalRatePctPop5min, 1),
    demandTemplate,
    durationS: runRng.nextIntInclusive(
      Math.max(space.minDurationS, minDurationFor(demandTemplate)),
      Math.max(space.maxDurationS, minDurationFor(demandTemplate)),
    ),
    // Zero most of the time, because a non-zero probability draws from the `doorObstruction`
    // stream and the determinism tests rely on it being untouched at the default.
    doorObstructionProbability: runRng.nextFloat() < 0.25 ? uniform(runRng, 0.05, 0.5, 2) : 0,
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
