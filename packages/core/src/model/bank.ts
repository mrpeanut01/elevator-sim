/**
 * Bank runtime: a group of cars under one group controller, and the floors their shafts
 * physically open onto.
 *
 * ## Service zoning lives here, and only service zoning
 *
 * `servesFloors` is the first of the three zoning concepts docs/01-architecture.md insists on
 * keeping apart: it is a *hard physical feasibility filter*. A low-rise shaft does not reach
 * floor 30 — no credential, dispatcher setting or emergency changes that. Credential-based
 * access zoning lives on {@link Building}; operational (dynamic) zoning is a dispatcher
 * strategy and appears nowhere in `model/`.
 *
 * ## Why `cars` is generic
 *
 * A bank owns its cars, but the car entity is the physics layer's (`model/car/`), which
 * lands after this module. `Bank<TCar>` therefore carries whatever car object it was built
 * with, defaulting to the {@link ResolvedCar} specification from the config layer. A caller
 * that has real cars builds the building with a factory and gets `Bank<Car>` throughout;
 * everything else keeps the specs and needs no type argument. {@link Bank.carSpecs} is
 * always the resolved configuration either way, so hardware questions ("what does this bank
 * hold at design load?") never depend on which form was chosen.
 */

import type { ResolvedBank, ResolvedCar } from '../config/types.js';

import { ModelError, type DeckPosition, type FloorPair } from './types.js';

/**
 * The least a bank needs to know about a car: that it has an id, and how to be put back to
 * its start-of-run state.
 *
 * `reset` is optional only because the default `TCar` — the {@link ResolvedCar} specification
 * — is immutable configuration with nothing to reset. **A car that carries per-run state
 * (position, load, committed calls, service mode) must implement it**, or
 * {@link Building.reset} will hand replication N+1 replication N's car positions and the
 * replications will not be statistically independent. A car type that cannot expose one can
 * instead be reset through `createBuilding`'s `resetCar` hook.
 */
export interface CarLike {
  readonly id: string;
  /** Drop all per-run state, leaving the car as it was at t=0. */
  reset?(): void;
}

/** Which deck of a double-deck car opens on a floor, and what the other deck opens on. */
export interface DeckAssignment {
  readonly pair: FloorPair;
  /** The deck that opens on the queried floor. */
  readonly deck: DeckPosition;
  /** The floor the *other* deck opens on at the same stop. */
  readonly pairedFloorId: string;
}

export interface BankInit<TCar extends CarLike = ResolvedCar> {
  readonly id: string;
  readonly name?: string | undefined;
  /** Floor ids the shafts open onto, in declared order. Validated against the building. */
  readonly servesFloors: readonly string[];
  /** Double-deck only: `[lower, upper]` pairs served simultaneously. */
  readonly servesFloorPairs?: readonly (readonly [string, string])[] | undefined;
  /** The runtime cars, or the resolved specs when no car objects exist yet. */
  readonly cars: readonly TCar[];
  /** The resolved car configuration, always — even when `cars` holds runtime objects. */
  readonly carSpecs: readonly ResolvedCar[];
}

/**
 * A group of cars and the floors they can physically reach.
 *
 * Immutable: a bank's topology is building fabric, fixed for the run. The mutable state of
 * a *car* belongs to the car.
 */
export class Bank<TCar extends CarLike = ResolvedCar> {
  readonly id: string;
  readonly name: string | undefined;
  /** The cars in this bank, in declared order. */
  readonly cars: readonly TCar[];
  /** Resolved hardware specification per car, in the same order as {@link cars}. */
  readonly carSpecs: readonly ResolvedCar[];
  /** Floor ids served, in declared order. Use {@link servesFloor} for membership tests. */
  readonly servesFloors: readonly string[];
  /** Floor pairs a double-deck car opens onto simultaneously. Empty for single-deck banks. */
  readonly servesFloorPairs: readonly FloorPair[];
  /** True when any car in the bank is double-deck. */
  readonly isDoubleDeck: boolean;

  /** O(1) service-zoning lookup; the whole reason a bank exists at eligibility-filter time. */
  readonly #served: ReadonlySet<string>;
  readonly #carsById: ReadonlyMap<string, TCar>;
  readonly #specsById: ReadonlyMap<string, ResolvedCar>;
  readonly #deckByFloorId: ReadonlyMap<string, DeckAssignment>;

  constructor(init: BankInit<TCar>) {
    if (init.cars.length !== init.carSpecs.length) {
      throw new ModelError(
        `Bank "${init.id}" was given ${init.cars.length} cars but ${init.carSpecs.length} car specs; they must correspond one to one.`,
      );
    }

    this.id = init.id;
    this.name = init.name;
    this.cars = [...init.cars];
    this.carSpecs = [...init.carSpecs];
    this.servesFloors = [...init.servesFloors];
    this.#served = new Set(init.servesFloors);
    this.isDoubleDeck = init.carSpecs.some((car) => car.doubleDeck);

    const carsById = new Map<string, TCar>();
    for (const car of init.cars) {
      carsById.set(car.id, car);
    }
    this.#carsById = carsById;

    const specsById = new Map<string, ResolvedCar>();
    for (const spec of init.carSpecs) {
      specsById.set(spec.id, spec);
    }
    this.#specsById = specsById;

    const pairs: FloorPair[] = [];
    const deckByFloorId = new Map<string, DeckAssignment>();
    for (const [lowerFloorId, upperFloorId] of init.servesFloorPairs ?? []) {
      const pair: FloorPair = Object.freeze({ lowerFloorId, upperFloorId });
      pairs.push(pair);
      deckByFloorId.set(lowerFloorId, {
        pair,
        deck: 'lower',
        pairedFloorId: upperFloorId,
      });
      deckByFloorId.set(upperFloorId, {
        pair,
        deck: 'upper',
        pairedFloorId: lowerFloorId,
      });
    }
    this.servesFloorPairs = pairs;
    this.#deckByFloorId = deckByFloorId;
  }

  /** Build a runtime bank from its resolved config, keeping the resolved cars as the cars. */
  static fromConfig(bank: ResolvedBank): Bank<ResolvedCar> {
    return new Bank<ResolvedCar>({
      id: bank.id,
      ...(bank.name === undefined ? {} : { name: bank.name }),
      servesFloors: bank.servesFloors,
      ...(bank.servesFloorPairs === undefined ? {} : { servesFloorPairs: bank.servesFloorPairs }),
      cars: bank.cars,
      carSpecs: bank.cars,
    });
  }

  get carCount(): number {
    return this.cars.length;
  }

  /**
   * **Service zoning.** Whether this bank's shafts open onto a floor at all.
   *
   * O(1), and hot: the eligibility filter runs it for every car against every call. It is a
   * physical fact about the shaft and says nothing about who is allowed to go there — that
   * is {@link Building.isAccessPermitted}, a different question with a different answer.
   */
  servesFloor(floorId: string): boolean {
    return this.#served.has(floorId);
  }

  /** A car by id, or `undefined` if this bank does not contain it. */
  carById(id: string): TCar | undefined {
    return this.#carsById.get(id);
  }

  /**
   * The hardware spec of a car by its **config** id, or `undefined` if this bank has none.
   *
   * Keyed by `ResolvedCar.id`, which is the id as authored. A runtime car built by a factory
   * may carry a different id, so this is not simply `carById(...)` with a cast.
   */
  carSpecById(id: string): ResolvedCar | undefined {
    return this.#specsById.get(id);
  }

  /**
   * How a double-deck car serves a floor: which deck opens on it, and which floor the other
   * deck opens on at the same stop. `undefined` for a single-deck bank, or for a floor not
   * in any pair.
   */
  deckAssignmentFor(floorId: string): DeckAssignment | undefined {
    return this.#deckByFloorId.get(floorId);
  }

  /** Which deck opens on a floor, or `undefined` if the bank has no pairing for it. */
  deckAt(floorId: string): DeckPosition | undefined {
    return this.#deckByFloorId.get(floorId)?.deck;
  }

}

/*
 * **`pairedFloorOf` and `servesFloorPair` were deleted here, and deleting them was the point.**
 *
 * They shipped with this class, were unit-tested in both directions, and had no non-test caller
 * for their whole life — the eleventh instance of the defect `docs/07-handoff.md` § 3 tracks.
 * Phase 6 gave `isDoubleDeck`, `deckAt` and `deckAssignmentFor` a real one (`sim/simulation.ts`'s
 * bank-level deck-coupling filter) and could name none for these two. The rule is *"name the
 * non-test caller"*, not *"is it reachable"*, so the honest answer for a symbol with no caller and
 * no argument for keeping it is to remove it rather than to add it to an allowlist.
 *
 * `pairedFloorOf`'s job is done by `deckAssignmentFor(floorId)?.pairedFloorId`, which is one field
 * access on a live method; `servesFloorPair` is a two-line predicate over the same value. Nothing
 * is lost that a caller cannot restate in one line — and the day one appears, restating it is the
 * cheap half of the work.
 */
