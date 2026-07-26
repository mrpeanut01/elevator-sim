/**
 * Building runtime: floors, banks, and the two static zoning questions the simulator is
 * allowed to ask.
 *
 * ## The three kinds of zoning, kept apart
 *
 * docs/01-architecture.md calls conflating them "the classic modelling mistake", and
 * CLAUDE.md forbids collapsing them into one field. They are three different questions with
 * three different owners:
 *
 * | Concept | Question | Where it lives |
 * |---|---|---|
 * | **Service** | Do this bank's shafts open onto that floor? | {@link Building.canPhysicallyServe} |
 * | **Access** | May this credential reach that floor? | {@link Building.isAccessPermitted} |
 * | **Operational** | Which cars should cover which floors *right now*? | the dispatcher — **not here** |
 *
 * The first two are separate methods with different parameter types, so they cannot be
 * silently substituted for one another. The third is a tunable strategy that changes minute
 * to minute; putting it in the building would freeze a dispatch policy into the fabric and
 * make it code instead of data (CLAUDE.md invariant 7).
 *
 * A dispatcher's eligibility filter is the *intersection* of the first two, never either
 * alone. {@link Building.banksEligibleFor} computes that intersection by calling both
 * predicates — composing them at the call site rather than merging them into one flag.
 */

import type {
  AccessZone,
  BuildingType,
  ResolvedBuilding,
  ResolvedCar,
} from '../config/types.js';

import { Bank, type CarLike } from './bank.js';
import { Floor } from './floor.js';
import { ModelError, type CredentialGroup, type FloorTopology } from './types.js';

/** Where a car factory is being asked to build a car. */
export interface CarCreationContext {
  /** The bank the car belongs to, as resolved config. */
  readonly bankId: string;
  /** Position within the bank's declared car list. */
  readonly index: number;
}

/** What a {@link Building} needs beyond its fabric. */
export interface BuildingOptions<TCar extends CarLike> {
  /**
   * How to return a car to its start-of-run state, for {@link Building.reset}.
   *
   * Only needed for a car type that holds per-run state but exposes no `reset()` of its own
   * — a car whose own {@link CarLike.reset} exists is reset through that. When both are
   * present this hook wins, so a caller can always override the car's idea of "fresh".
   */
  readonly resetCar?: ((car: TCar) => void) | undefined;
}

export interface CreateBuildingOptions<TCar extends CarLike> extends BuildingOptions<TCar> {
  /**
   * Turn each resolved car specification into a runtime car.
   *
   * Supplied by the physics layer once `model/car/` exists; omit it and the building keeps
   * the {@link ResolvedCar} specs as its cars.
   */
  readonly createCar: (spec: ResolvedCar, context: CarCreationContext) => TCar;
}

/**
 * A building during a run.
 *
 * Floors and banks are fixed for the run; the mutable state is inside the floors (queues,
 * hall calls) and inside the cars. Lookup by floor id and by floor index are both O(1) —
 * the dispatcher does both on every decision, and floor indices are not contiguous (a
 * building may skip 13, or start at -2).
 */
export class Building<TCar extends CarLike = ResolvedCar> implements FloorTopology {
  readonly id: string;
  readonly name: string;
  readonly type: BuildingType;
  /** Building-level traffic profile id. Individual floors may override it. */
  readonly trafficProfile: string;
  /** Where the config was loaded from; carried for diagnostics and run records. */
  readonly source: string;
  /** The validated, resolved config this was built from. */
  readonly config: ResolvedBuilding;
  /** Every floor, ascending by {@link Floor.index}. */
  readonly floors: readonly Floor[];
  /** Floors flagged `isEntrance`, in floor order. */
  readonly entranceFloors: readonly Floor[];
  /** Floors flagged `isTransferFloor` (sky lobbies), in floor order. */
  readonly transferFloors: readonly Floor[];
  readonly banks: readonly Bank<TCar>[];
  /** Every car in the building, bank by bank in declared order. */
  readonly cars: readonly TCar[];
  /** Credential-based zones exactly as declared. Floors in none of them are unrestricted. */
  readonly accessZones: readonly AccessZone[];
  /** Sum of floor populations — authoritative over any declared total. */
  readonly totalPopulation: number;

  readonly #floorsById: ReadonlyMap<string, Floor>;
  readonly #floorsByIndex: ReadonlyMap<number, Floor>;
  readonly #banksById: ReadonlyMap<string, Bank<TCar>>;
  readonly #banksByFloorId: ReadonlyMap<string, readonly Bank<TCar>[]>;
  readonly #zonesByFloorId: ReadonlyMap<string, readonly AccessZone[]>;
  /** Floor id to the union of credential groups permitted there. Absent means unrestricted. */
  readonly #credentialsByFloorId: ReadonlyMap<string, ReadonlySet<CredentialGroup>>;
  readonly #resetCar: ((car: TCar) => void) | undefined;

  constructor(
    config: ResolvedBuilding,
    floors: readonly Floor[],
    banks: readonly Bank<TCar>[],
    options: BuildingOptions<TCar> = {},
  ) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.trafficProfile = config.trafficProfile;
    this.source = config.source;
    this.totalPopulation = config.totalPopulation;
    this.floors = [...floors];
    this.banks = [...banks];
    // Precomputed rather than derived on demand: the dispatcher walks every car on every
    // decision, and a getter that allocated a fresh array each time would be a quiet cost.
    this.cars = this.banks.flatMap((bank) => bank.cars);
    this.accessZones = config.accessZones;

    const floorsById = new Map<string, Floor>();
    const floorsByIndex = new Map<number, Floor>();
    for (const floor of this.floors) {
      floorsById.set(floor.id, floor);
      floorsByIndex.set(floor.index, floor);
    }
    this.#floorsById = floorsById;
    this.#floorsByIndex = floorsByIndex;
    this.entranceFloors = this.floors.filter((floor) => floor.isEntrance);
    this.transferFloors = this.floors.filter((floor) => floor.isTransferFloor);

    const banksById = new Map<string, Bank<TCar>>();
    const banksByFloorId = new Map<string, Bank<TCar>[]>();
    for (const bank of this.banks) {
      banksById.set(bank.id, bank);
      // Banks are the outer loop, so every floor's list comes out in declared bank order and
      // `banksServing` is deterministic without sorting anything.
      for (const floorId of bank.servesFloors) {
        const serving = banksByFloorId.get(floorId);
        if (serving === undefined) banksByFloorId.set(floorId, [bank]);
        else serving.push(bank);
      }
    }
    this.#banksById = banksById;
    this.#banksByFloorId = banksByFloorId;

    const zonesByFloorId = new Map<string, AccessZone[]>();
    const credentialsByFloorId = new Map<string, Set<CredentialGroup>>();
    for (const zone of this.accessZones) {
      for (const floorId of zone.floors) {
        const zones = zonesByFloorId.get(floorId);
        if (zones === undefined) zonesByFloorId.set(floorId, [zone]);
        else zones.push(zone);

        const groups = credentialsByFloorId.get(floorId);
        // A floor covered by two zones is reachable by either zone's groups: the union, not
        // the intersection. Nothing in the schema forbids overlapping zones.
        if (groups === undefined) credentialsByFloorId.set(floorId, new Set(zone.credentialGroups));
        else for (const group of zone.credentialGroups) groups.add(group);
      }
    }
    this.#zonesByFloorId = zonesByFloorId;
    this.#credentialsByFloorId = credentialsByFloorId;
    this.#resetCar = options.resetCar;
  }

  get floorCount(): number {
    return this.floors.length;
  }

  get bankCount(): number {
    return this.banks.length;
  }

  /* ---------------------------------------------------------------- *
   * Floor lookup — O(1) by id and by index
   * ---------------------------------------------------------------- */

  floorById(floorId: string): Floor | undefined {
    return this.#floorsById.get(floorId);
  }

  /** Lookup by shaft ordering. Indices are not contiguous: a building may have no floor 13. */
  floorByIndex(index: number): Floor | undefined {
    return this.#floorsByIndex.get(index);
  }

  /** {@link floorById}, but throws rather than returning `undefined`. */
  requireFloor(floorId: string): Floor {
    const floor = this.#floorsById.get(floorId);
    if (floor === undefined) {
      throw new ModelError(`Building "${this.id}" does not declare a floor "${floorId}".`);
    }
    return floor;
  }

  hasFloor(floorId: string): boolean {
    return this.#floorsById.has(floorId);
  }

  /** Shaft ordering of a floor, or `undefined` if there is no such floor. ({@link FloorTopology}) */
  floorIndexOf(floorId: string): number | undefined {
    return this.#floorsById.get(floorId)?.index;
  }

  /** Whether a floor is a declared sky lobby. ({@link FloorTopology}) */
  isTransferFloor(floorId: string): boolean {
    return this.#floorsById.get(floorId)?.isTransferFloor === true;
  }

  /** Whether a floor is a declared entrance. */
  isEntrance(floorId: string): boolean {
    return this.#floorsById.get(floorId)?.isEntrance === true;
  }

  /* ---------------------------------------------------------------- *
   * Banks
   * ---------------------------------------------------------------- */

  bankById(bankId: string): Bank<TCar> | undefined {
    return this.#banksById.get(bankId);
  }

  /** Every bank whose shafts open onto a floor, in declared bank order. */
  banksServing(floorId: string): readonly Bank<TCar>[] {
    return this.#banksByFloorId.get(floorId) ?? [];
  }

  /* ---------------------------------------------------------------- *
   * Service zoning — physical reachability
   * ---------------------------------------------------------------- */

  /**
   * **Service zoning.** Whether a bank's shafts physically open onto a floor.
   *
   * A hard feasibility filter: no credential, dispatcher weight or traffic pattern can make
   * it true when it is false. `false` for a bank or floor this building does not declare.
   *
   * Distinct from {@link isAccessPermitted}, which is about permission rather than physics.
   * The two are never interchangeable: in Secure Tower the low bank cannot reach floor 30 for
   * anyone, while the high bank reaches it for exactly two credential groups.
   */
  canPhysicallyServe(bankId: string, floorId: string): boolean {
    return this.#banksById.get(bankId)?.servesFloor(floorId) === true;
  }

  /* ---------------------------------------------------------------- *
   * Access zoning — credential permission
   * ---------------------------------------------------------------- */

  /**
   * **Access zoning.** Whether a credential group may reach a floor.
   *
   * Rules, straight from `data/buildings/README.md`:
   * - A floor covered by **no** access zone is unrestricted — everyone may reach it,
   *   including a passenger with no credential at all.
   * - A floor covered by one or more zones is reachable only by a credential group named in
   *   at least one of them. There is no building-wide allow-list and no universal
   *   credential: Secure Tower's executive floor deliberately excludes the `facilities` and
   *   `security` groups every other zone grants, precisely so an implementation cannot
   *   short-circuit this check.
   * - An undeclared floor is not reachable by anyone.
   *
   * Says nothing about whether any shaft goes there — that is {@link canPhysicallyServe}.
   */
  isAccessPermitted(credentialGroup: CredentialGroup | undefined, floorId: string): boolean {
    if (!this.#floorsById.has(floorId)) return false;
    const permitted = this.#credentialsByFloorId.get(floorId);
    if (permitted === undefined) return true;
    return credentialGroup !== undefined && permitted.has(credentialGroup);
  }

  /** Whether any access zone covers this floor. Unrestricted floors return `false`. */
  isAccessRestricted(floorId: string): boolean {
    return this.#credentialsByFloorId.has(floorId);
  }

  /** The access zones covering a floor, in declared order. Empty means unrestricted. */
  accessZonesFor(floorId: string): readonly AccessZone[] {
    return this.#zonesByFloorId.get(floorId) ?? [];
  }

  /**
   * The union of credential groups that may reach a floor, or `undefined` when the floor is
   * unrestricted.
   *
   * `undefined` rather than "every group in the building", because unrestricted means
   * *no check*, which is not the same as a permit list that happens to contain everyone —
   * an unbadged visitor passes the first and fails the second.
   */
  permittedCredentialGroups(floorId: string): ReadonlySet<CredentialGroup> | undefined {
    return this.#credentialsByFloorId.get(floorId);
  }

  /* ---------------------------------------------------------------- *
   * The intersection the dispatcher actually needs
   * ---------------------------------------------------------------- */

  /**
   * Banks that can serve a floor for a given credential: service zoning **and** access
   * zoning, both checked, neither merged into the other.
   *
   * This is the eligibility filter Secure Tower exists to exercise — "the intersection of
   * service zoning and access zoning, never either one alone". It is a composition of the
   * two predicates above and holds no state of its own; a dispatcher that wants only one of
   * the two questions answered should call that one directly.
   */
  banksEligibleFor(
    credentialGroup: CredentialGroup | undefined,
    floorId: string,
  ): readonly Bank<TCar>[] {
    if (!this.isAccessPermitted(credentialGroup, floorId)) return [];
    return this.banksServing(floorId);
  }

  /**
   * Return the whole building to its start-of-run state — every floor's queues and hall
   * calls, and every car — so it can be reused for a new replication.
   *
   * **Why the cars are not optional here.** Replications must be statistically independent;
   * Phase 3's paired-t machinery is meaningless if replication N+1 inherits replication N's
   * car positions, loads, committed calls and service modes. That would show up not as a
   * crash but as serially correlated AWT samples and a confident interval around the wrong
   * number, which is the exact failure mode CLAUDE.md's statistical-discipline section
   * exists to prevent. So `reset()` resets the cars too: through the `resetCar` hook given to
   * {@link createBuilding} if there was one, otherwise through the car's own
   * {@link CarLike.reset}.
   *
   * The residual hazard is a car type that holds per-run state and offers neither. Nothing
   * here can detect that, so it is stated as a contract on {@link CarLike}: a stateful car
   * must implement `reset()`. The default `TCar`, {@link ResolvedCar}, is immutable
   * configuration and has nothing to drop.
   */
  reset(): void {
    for (const floor of this.floors) {
      floor.reset();
    }
    const resetCar = this.#resetCar;
    for (const car of this.cars) {
      if (resetCar !== undefined) resetCar(car);
      else car.reset?.();
    }
  }
}

/**
 * Build the runtime model from a validated, resolved building config.
 *
 * The config layer has already expanded floor ranges, resolved every car against its
 * elevator class and checked every cross-reference, so this is a construction step and not a
 * second round of validation.
 *
 * ```ts
 * const loaded = await loadConfig('data');
 * const building = createBuilding(loaded.buildingsById.get('secure-tower')!);
 * building.canPhysicallyServe('low', '30');            // false — service zoning
 * building.isAccessPermitted('exec', '30');            // true  — access zoning
 * ```
 *
 * Pass `createCar` once `model/car/` exists to get a building whose banks hold runtime cars:
 *
 * ```ts
 * const building = createBuilding(resolved, { createCar: (spec) => new Car(spec, streams) });
 * ```
 *
 * Runtime cars carry per-run state, so {@link Building.reset} has to be able to clear it.
 * It uses the car's own `reset()`; add `resetCar` for a car type that has none:
 *
 * ```ts
 * const building = createBuilding(resolved, {
 *   createCar: (spec) => new Car(spec, streams),
 *   resetCar: (car) => car.returnToPark(),
 * });
 * ```
 */
export function createBuilding(config: ResolvedBuilding): Building<ResolvedCar>;
export function createBuilding<TCar extends CarLike>(
  config: ResolvedBuilding,
  options: CreateBuildingOptions<TCar>,
): Building<TCar>;
export function createBuilding<TCar extends CarLike>(
  config: ResolvedBuilding,
  options?: CreateBuildingOptions<TCar>,
): Building<TCar> | Building<ResolvedCar> {
  const floors = config.floors.map((floor) => new Floor(floor));

  if (options === undefined) {
    return new Building<ResolvedCar>(
      config,
      floors,
      config.banks.map((bank) => Bank.fromConfig(bank)),
    );
  }

  const { createCar } = options;
  const banks = config.banks.map(
    (bank) =>
      new Bank<TCar>({
        id: bank.id,
        ...(bank.name === undefined ? {} : { name: bank.name }),
        servesFloors: bank.servesFloors,
        ...(bank.servesFloorPairs === undefined
          ? {}
          : { servesFloorPairs: bank.servesFloorPairs }),
        cars: bank.cars.map((spec, index) => createCar(spec, { bankId: bank.id, index })),
        carSpecs: bank.cars,
      }),
  );
  return new Building<TCar>(config, floors, banks, options);
}
