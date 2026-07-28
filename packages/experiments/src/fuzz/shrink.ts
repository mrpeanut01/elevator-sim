/**
 * Shrinking: turning a counterexample nobody can read into the smallest one that still fails.
 *
 * ## Why this is hand-written, and why there is no new dependency
 *
 * The obvious move is `fast-check`. It was considered and rejected, and the reason is not
 * dependency hygiene alone (though `core` keeps exactly one runtime dependency and
 * `experiments` keeps none beyond `core`, so adding one is a real decision — `DECISIONS-T12.md`
 * records it). The reason is that a generic shrinker shrinks *values*, and a building config is
 * a graph of **cross-references**: `servesFloors` names floor ids, `accessZones.floors` names
 * floor ids, `servesFloorPairs` names pairs of them, and a transfer floor is meaningful only
 * where two banks meet. Shrinking a floor id out of the `floors` array without shrinking it out
 * of the three places that name it produces a config `parseBuilding` rejects — so a generic
 * shrinker's candidates are almost all invalid, and it converges on nothing while burning a
 * replication per attempt.
 *
 * The reducers below are therefore domain-aware: each removes one *building element* and every
 * reference to it at once, and each candidate is re-validated through the real schema
 * (`parseBuilding` and `resolveBuilding`) before it is run. A candidate that fails validation,
 * or that disconnects the bank graph so no route exists, is discarded rather than reported.
 *
 * ## The rule that makes shrinking honest
 *
 * A candidate is accepted only if it still violates **a property the original violated**.
 * Shrinking toward "some property fails" would happily wander from a lost-passenger bug to an
 * unrelated starvation bound and report the wrong minimal case. The target set is computed from
 * the original outcome and never widened.
 *
 * ## Replay
 *
 * A shrunk case is a hand-reduced neighbour of a generated one, so it is **not** reproducible
 * from `fuzzSeed` alone — `caseFromSeed` would give back the unshrunk parent. `fuzzSeed` is
 * carried anyway, so the parent is always one call away, and {@link formatFuzzCase} prints the
 * shrunk case in full: a counterexample nobody can replay is a rumour.
 */

import { ConfigError } from '@elevator-sim/core';

import { minDurationFor, reparse, resolveCase } from './generate.js';
import { evaluateCase, generateOptionsFrom, isFailure, type RunOptions } from './run.js';
import type { FuzzCase, FuzzOutcome, FuzzProperty } from './types.js';

/** How hard to try. Each step is a full replication, so the budget is a wall-clock budget. */
export interface ShrinkOptions {
  /** Maximum candidate evaluations. 120 by default: a shrunk case runs in milliseconds. */
  readonly budget?: number | undefined;
}

export interface ShrinkResult {
  readonly original: FuzzOutcome;
  /** The smallest case found that still violates a property the original violated. */
  readonly minimal: FuzzOutcome;
  /** Reductions accepted. */
  readonly steps: number;
  /** Candidates evaluated, accepted or not. */
  readonly evaluations: number;
}

/* -------------------------------------------------------------------------- *
 * Building surgery
 * -------------------------------------------------------------------------- */

/** A mutable, JSON-shaped view of a building config, for a reducer to edit. */
interface DraftBuilding {
  id: string;
  name: string;
  type: string;
  trafficProfile: string;
  floors: { id: string; index: number; heightM: number; population: number; isEntrance?: boolean; isTransferFloor?: boolean }[];
  totalPopulation?: number;
  banks: { id: string; servesFloors: string[]; cars: Record<string, unknown>[] }[];
  accessZones: { id: string; floors: string[]; credentialGroups: string[] }[];
  /**
   * The authored service schedule, carried through every reduction.
   *
   * Carrying it is not optional and dropping it would be the quiet kind of wrong: a shrinker
   * that silently removed the schedule would report a "minimal" counterexample that no longer
   * contains the mid-run mode change the original was about, and the reduction step that did it
   * would look exactly like a legitimate one because the candidate still fails — for a different
   * reason. So it is carried, and {@link dropServiceEvent} removes entries **one at a time and
   * on purpose**, so that "the schedule was not needed" is a measured reduction rather than an
   * accident of the draft shape.
   */
  serviceEvents: { atS: number; carId: string; bankId?: string; mode: string }[];
}

function draftOf(fuzzCase: FuzzCase): DraftBuilding {
  const building = fuzzCase.building;
  return {
    id: building.id,
    name: building.name,
    type: building.type,
    trafficProfile: building.trafficProfile,
    floors: (building.floors ?? []).map((floor) => ({
      id: floor.id,
      index: floor.index,
      heightM: floor.heightM,
      population: floor.population,
      ...(floor.isEntrance === true ? { isEntrance: true } : {}),
      ...(floor.isTransferFloor === true ? { isTransferFloor: true } : {}),
    })),
    banks: building.banks.map((bank) => ({
      id: bank.id,
      servesFloors: [...bank.servesFloors],
      cars: bank.cars.map((car) => ({ ...car })),
    })),
    accessZones: (building.accessZones ?? []).map((zone) => ({
      id: zone.id,
      floors: [...zone.floors],
      credentialGroups: [...zone.credentialGroups],
    })),
    serviceEvents: (building.serviceEvents ?? []).map((event) => ({
      atS: event.atS,
      carId: event.carId,
      ...(event.bankId === undefined ? {} : { bankId: event.bankId }),
      mode: event.mode,
    })),
  };
}

/**
 * Which cars a draft still declares, as the ids a `serviceEvents` entry may name.
 *
 * `bankId` is optional in the authored form and generated ids are unique building-wide, so an
 * entry is matched the way `resolveBuilding` matches it: by car id, restricted to the named bank
 * when there is one.
 */
function eventIsResolvable(draft: DraftBuilding, event: DraftBuilding['serviceEvents'][number]): boolean {
  return draft.banks.some(
    (bank) =>
      (event.bankId === undefined || bank.id === event.bankId) &&
      bank.cars.some((car) => car['id'] === event.carId),
  );
}

/**
 * Whether every bank of a draft keeps at least one hall-call-accepting car for the whole run.
 *
 * The same construction rule `generate.ts` enforces, re-checked here because a reducer can break
 * it in a way the generator never would: dropping the *other* car of a two-car bank leaves the
 * degraded one alone, and a bank with no serving car makes P5 fire on a passenger the property
 * believes is servable. Under shrinking that failure would be indistinguishable from the one
 * being reduced — same property, different cause — and the campaign would print a minimal
 * counterexample that is a generator artefact. So such a candidate is discarded, exactly as a
 * candidate that disconnects the bank graph is.
 *
 * `in-service` is the only mode `acceptsHallCalls` admits, and the schedule is replayed in
 * authored order because that is the order the kernel fires it in (CLAUDE.md invariant 4).
 */
function everyBankAlwaysServes(draft: DraftBuilding): boolean {
  const serving = new Map<string, Set<string>>();
  for (const bank of draft.banks) {
    serving.set(
      bank.id,
      new Set(
        bank.cars
          .filter((car) => (car['mode'] ?? 'in-service') === 'in-service')
          .map((car) => String(car['id'])),
      ),
    );
  }
  const short = (): boolean => [...serving.values()].some((cars) => cars.size === 0);
  if (short()) return false;

  for (const event of draft.serviceEvents) {
    for (const bank of draft.banks) {
      if (event.bankId !== undefined && bank.id !== event.bankId) continue;
      if (!bank.cars.some((car) => car['id'] === event.carId)) continue;
      const cars = serving.get(bank.id);
      if (cars === undefined) continue;
      if (event.mode === 'in-service') cars.add(event.carId);
      else cars.delete(event.carId);
    }
    if (short()) return false;
  }
  return true;
}

/**
 * Re-validate a draft through the real schema and produce a candidate case, or `undefined` if
 * the edit produced a config the loader would reject.
 *
 * The structural preconditions the schema does *not* state — at least one entrance, at least
 * one populated floor — are checked here, because a building with neither generates no demand
 * and a vacuously passing case is not a smaller counterexample, it is no counterexample.
 */
function candidateFrom(
  parent: FuzzCase,
  draft: DraftBuilding,
  step: number,
  overrides: Partial<Pick<FuzzCase, 'arrivalRatePctPop5min' | 'durationS' | 'doorObstructionProbability'>>,
  options: RunOptions,
): FuzzCase | undefined {
  if (draft.floors.length < 2) return undefined;
  if (!draft.floors.some((floor) => floor.isEntrance === true)) return undefined;
  if (!draft.floors.some((floor) => floor.population > 0)) return undefined;
  if (draft.banks.length === 0) return undefined;
  if (draft.banks.some((bank) => bank.servesFloors.length < 2 || bank.cars.length === 0)) return undefined;
  // A schedule entry naming a car this draft no longer declares is a `ConfigError` from
  // `resolveBuilding`, which would silently discard every candidate that dropped a scheduled car.
  // Dropped with the car instead, the way `dropFloor` drops every reference to a floor.
  draft.serviceEvents = draft.serviceEvents.filter((event) => eventIsResolvable(draft, event));
  if (!everyBankAlwaysServes(draft)) return undefined;
  draft.totalPopulation = draft.floors.reduce((sum, floor) => sum + floor.population, 0);

  const caseId = `${parent.caseId}-s${String(step)}`;
  let candidate: FuzzCase;
  try {
    candidate = {
      ...parent,
      caseId,
      building: reparse(draft, caseId),
      ...overrides,
    };
  } catch (error) {
    if (error instanceof ConfigError) return undefined;
    throw error;
  }
  try {
    resolveCase(candidate, generateOptionsFrom(options.config));
  } catch (error) {
    if (error instanceof ConfigError) return undefined;
    throw error;
  }
  return candidate;
}

/* -------------------------------------------------------------------------- *
 * Reducers
 * -------------------------------------------------------------------------- */

type Reducer = (fuzzCase: FuzzCase) => readonly DraftBuilding[];

/** Drop one whole bank. The largest single reduction, so it is tried first. */
const dropBank: Reducer = (fuzzCase) => {
  const drafts: DraftBuilding[] = [];
  const banks = fuzzCase.building.banks;
  if (banks.length < 2) return drafts;
  for (let i = 0; i < banks.length; i += 1) {
    const draft = draftOf(fuzzCase);
    draft.banks.splice(i, 1);
    drafts.push(draft);
  }
  return drafts;
};

/** Drop one floor, and every reference to it. */
const dropFloor: Reducer = (fuzzCase) => {
  const drafts: DraftBuilding[] = [];
  for (const floor of fuzzCase.building.floors ?? []) {
    const draft = draftOf(fuzzCase);
    draft.floors = draft.floors.filter((entry) => entry.id !== floor.id);
    for (const bank of draft.banks) {
      bank.servesFloors = bank.servesFloors.filter((id) => id !== floor.id);
    }
    draft.accessZones = draft.accessZones
      .map((zone) => ({ ...zone, floors: zone.floors.filter((id) => id !== floor.id) }))
      .filter((zone) => zone.floors.length > 0);
    drafts.push(draft);
  }
  return drafts;
};

/** Drop one car from a bank that has more than one. */
const dropCar: Reducer = (fuzzCase) => {
  const drafts: DraftBuilding[] = [];
  fuzzCase.building.banks.forEach((bank, bankIndex) => {
    if (bank.cars.length < 2) return;
    for (let carIndex = 0; carIndex < bank.cars.length; carIndex += 1) {
      const draft = draftOf(fuzzCase);
      const target = draft.banks[bankIndex];
      if (target === undefined) continue;
      target.cars = target.cars.filter((_, index) => index !== carIndex);
      drafts.push(draft);
    }
  });
  return drafts;
};

/** Drop one access zone. */
const dropAccessZone: Reducer = (fuzzCase) => {
  const drafts: DraftBuilding[] = [];
  const zones = fuzzCase.building.accessZones ?? [];
  for (let i = 0; i < zones.length; i += 1) {
    const draft = draftOf(fuzzCase);
    draft.accessZones.splice(i, 1);
    drafts.push(draft);
  }
  return drafts;
};

/** Empty one floor. Fewer passengers is a smaller counterexample even at the same shape. */
const emptyFloor: Reducer = (fuzzCase) => {
  const drafts: DraftBuilding[] = [];
  (fuzzCase.building.floors ?? []).forEach((floor, index) => {
    if (floor.population === 0) return;
    const draft = draftOf(fuzzCase);
    const target = draft.floors[index];
    if (target === undefined) return;
    target.population = 0;
    drafts.push(draft);
  });
  return drafts;
};

/** Drop one entry of the service schedule. "The recall was not needed" is a real reduction. */
const dropServiceEvent: Reducer = (fuzzCase) => {
  const drafts: DraftBuilding[] = [];
  const events = fuzzCase.building.serviceEvents ?? [];
  for (let i = 0; i < events.length; i += 1) {
    const draft = draftOf(fuzzCase);
    draft.serviceEvents.splice(i, 1);
    drafts.push(draft);
  }
  return drafts;
};

/**
 * Put one car that starts the run in a degraded mode back `in-service`.
 *
 * The counterpart of {@link dropServiceEvent} for the *initial* mode, and the reason both exist
 * is the honesty rule at the top of this file: the smallest case that still fails is the one
 * worth reporting, and a case that still fails with the fleet whole says something quite
 * different from one that needs a car withdrawn. The reduction is only accepted if the failure
 * survives it, so which of the two it is gets measured rather than assumed.
 */
const restoreCarMode: Reducer = (fuzzCase) => {
  const drafts: DraftBuilding[] = [];
  fuzzCase.building.banks.forEach((bank, bankIndex) => {
    bank.cars.forEach((car, carIndex) => {
      if (car.mode === undefined || car.mode === 'in-service') return;
      const draft = draftOf(fuzzCase);
      const target = draft.banks[bankIndex]?.cars[carIndex];
      if (target === undefined) return;
      delete target['mode'];
      drafts.push(draft);
    });
  });
  return drafts;
};

const STRUCTURAL_REDUCERS: readonly Reducer[] = Object.freeze([
  dropBank,
  dropFloor,
  dropCar,
  dropAccessZone,
  dropServiceEvent,
  restoreCarMode,
  emptyFloor,
]);

/** The scalar knobs, reduced toward the quietest configuration that still fails. */
function scalarCandidates(fuzzCase: FuzzCase): readonly Partial<FuzzCase>[] {
  const candidates: Partial<FuzzCase>[] = [];
  if (fuzzCase.doorObstructionProbability > 0) candidates.push({ doorObstructionProbability: 0 });
  const floorS = minDurationFor(fuzzCase.demandTemplate);
  if (fuzzCase.durationS > floorS) {
    candidates.push({ durationS: Math.max(floorS, Math.round(fuzzCase.durationS / 2)) });
  }
  if (fuzzCase.arrivalRatePctPop5min > 1) {
    candidates.push({
      arrivalRatePctPop5min: Math.max(1, Math.round((fuzzCase.arrivalRatePctPop5min / 2) * 10) / 10),
    });
  }
  return candidates;
}

/* -------------------------------------------------------------------------- *
 * The search
 * -------------------------------------------------------------------------- */

/** Which properties an outcome failed. `threw` is its own target, so a crash shrinks to a crash. */
function targetOf(outcome: FuzzOutcome): { properties: ReadonlySet<FuzzProperty>; threw: boolean } {
  return {
    properties: new Set(outcome.violations.map((violation) => violation.property)),
    threw: outcome.threw !== undefined,
  };
}

function stillFails(candidate: FuzzOutcome, target: ReturnType<typeof targetOf>): boolean {
  if (target.threw && candidate.threw !== undefined) return true;
  return candidate.violations.some((violation) => target.properties.has(violation.property));
}

/** A one-line size measure. Smaller is better; ties are broken by the reducer order. */
function sizeOf(fuzzCase: FuzzCase): number {
  const floors = (fuzzCase.building.floors ?? []).length;
  const cars = fuzzCase.building.banks.reduce((sum, bank) => sum + bank.cars.length, 0);
  const population = (fuzzCase.building.floors ?? []).reduce((sum, floor) => sum + floor.population, 0);
  // A schedule entry and a withdrawn car are both *things a reader has to hold in their head* to
  // understand the counterexample, so both carry weight — otherwise `dropServiceEvent` and
  // `restoreCarMode` would produce candidates the size guard rejects as no smaller, and the two
  // reducers would never fire.
  const degraded = fuzzCase.building.banks.reduce(
    (sum, bank) => sum + bank.cars.filter((car) => car.mode !== undefined && car.mode !== 'in-service').length,
    0,
  );
  return (
    floors * 1000 +
    fuzzCase.building.banks.length * 5000 +
    cars * 800 +
    (fuzzCase.building.accessZones ?? []).length * 400 +
    (fuzzCase.building.serviceEvents ?? []).length * 300 +
    degraded * 300 +
    population +
    fuzzCase.durationS
  );
}

/**
 * Greedily reduce a failing case until nothing smaller still fails.
 *
 * Greedy rather than exhaustive on purpose: every candidate is a full replication, so the
 * budget is the wall-clock cost. The loop restarts from the top after each accepted reduction,
 * which is what lets "drop a bank" open up "drop the six floors only that bank served".
 */
export function shrinkCase(original: FuzzOutcome, options: RunOptions & ShrinkOptions): ShrinkResult {
  const budget = options.budget ?? 120;
  const target = targetOf(original);
  if (!isFailure(original)) {
    return { original, minimal: original, steps: 0, evaluations: 0 };
  }

  let best = original;
  let steps = 0;
  let evaluations = 0;

  let improved = true;
  while (improved && evaluations < budget) {
    improved = false;

    for (const reducer of STRUCTURAL_REDUCERS) {
      for (const draft of reducer(best.case)) {
        if (evaluations >= budget) break;
        const candidate = candidateFrom(best.case, draft, steps + 1, {}, options);
        if (candidate === undefined) continue;
        if (sizeOf(candidate) >= sizeOf(best.case)) continue;
        evaluations += 1;
        const outcome = evaluateCase(candidate, options);
        if (outcome.skipped !== undefined) continue;
        if (!stillFails(outcome, target)) continue;
        best = outcome;
        steps += 1;
        improved = true;
        break;
      }
      if (improved) break;
    }
    if (improved) continue;

    for (const overrides of scalarCandidates(best.case)) {
      if (evaluations >= budget) break;
      const candidate: FuzzCase = { ...best.case, caseId: `${best.case.caseId}-s${String(steps + 1)}`, ...overrides };
      evaluations += 1;
      const outcome = evaluateCase(candidate, options);
      if (outcome.skipped !== undefined) continue;
      if (!stillFails(outcome, target)) continue;
      best = outcome;
      steps += 1;
      improved = true;
      break;
    }
  }

  return { original, minimal: best, steps, evaluations };
}

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

/**
 * A counterexample, in full and in one string.
 *
 * Named `formatFuzzCase` rather than `formatCase` because `benchmark/` exports a `formatCase`
 * for a benchmark *case*, and the package barrel re-exports both modules. Resolved by renaming
 * at the source rather than by omission, following `tuning/index.ts`'s `SearchCandidate`: a
 * reader of the barrel gets both, and neither can silently shadow the other.
 *
 * Prints the seed **and** the whole config, because a shrunk case is not seed-derivable and a
 * failure that can only be described is a failure that will be argued about.
 */
export function formatFuzzCase(fuzzCase: FuzzCase): string {
  // Both service-mode facts on one line, above the config rather than buried in it. A withdrawn
  // car and a mid-run recall are the two things that most change how a run reads, and a reader
  // scanning a counterexample should not have to diff two hundred lines of JSON to find them.
  const withdrawn = fuzzCase.building.banks.flatMap((bank) =>
    bank.cars
      .filter((car) => car.mode !== undefined && car.mode !== 'in-service')
      .map((car) => `${bank.id}/${car.id}=${String(car.mode)}`),
  );
  const schedule = (fuzzCase.building.serviceEvents ?? []).map(
    (event) => `${String(event.atS)}s ${event.bankId === undefined ? '' : `${event.bankId}/`}${event.carId}→${event.mode}`,
  );
  const lines = [
    `case      ${fuzzCase.caseId}`,
    `fuzzSeed  ${fuzzCase.fuzzSeed}   (caseFromSeed reproduces the *unshrunk* parent)`,
    `simSeed   ${String(fuzzCase.simSeed)}`,
    `topology  ${fuzzCase.topology}   tags: ${fuzzCase.tags.join(', ')}`,
    `dispatch  ${fuzzCase.dispatcherProfileId} / ${fuzzCase.callType}`,
    `demand    ${String(fuzzCase.arrivalRatePctPop5min)} %pop/5min over ${String(fuzzCase.durationS)} s, drain ${String(fuzzCase.drainGraceS)} s, obstruction ${String(fuzzCase.doorObstructionProbability)}`,
    `service   initial: ${withdrawn.length === 0 ? 'all in-service' : withdrawn.join(', ')}   schedule: ${schedule.length === 0 ? 'none' : schedule.join('; ')}`,
    'building',
    JSON.stringify(fuzzCase.building, null, 2),
  ];
  return lines.join('\n');
}

/** A counterexample and what it violated, ready to paste into a bug report. */
export function formatOutcome(outcome: FuzzOutcome): string {
  const violations = outcome.violations.map(
    (violation) => `  [${violation.property}] ${violation.message}`,
  );
  const thrown = outcome.threw === undefined ? [] : [`  [threw] ${outcome.threw}`];
  return [
    formatFuzzCase(outcome.case),
    `status    ${outcome.status}, ${String(outcome.generatedPassengers)} passengers, ${outcome.simulatedSeconds.toFixed(1)} simulated s`,
    'violations',
    ...violations,
    ...thrown,
  ].join('\n');
}
