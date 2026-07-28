/**
 * Car vocabulary: the shaft it runs in, the snapshot the cost query reads, and the
 * {@link CostEstimate} it returns.
 *
 * Split from `car.ts` for the same reason `physics/doors/types.ts` is split from
 * `doorMachine.ts`: a dispatcher needs the words to *talk about* a car — what a cost
 * estimate contains, what makes a call infeasible — without importing the entity, its
 * mutable state, or the door machine it drives.
 *
 * ## The one type that matters
 *
 * {@link CarSnapshot} is the reason this module exists. docs/01-architecture.md calls
 * `estimateCost()` "the interface that decides everything" and requires it to be pure
 * (CLAUDE.md invariant 1), because the dispatcher evaluates thousands of hypotheticals per
 * decision. Purity is a property that is easy to claim and easy to lose, so it is made
 * *structural* here rather than promised in a comment: the estimator is a free function
 * over a `CarSnapshot`, which is a frozen value with no methods, no reference back to the
 * {@link Car} that produced it, no `Rng`, and no scheduler. There is no handle in a
 * snapshot through which simulation state *could* be mutated.
 *
 * ## Conventions (see CLAUDE.md)
 *
 * - SI throughout: metres, seconds, kilograms. Time is simulated seconds from the kernel;
 *   nothing here reads a wall clock (invariant 3).
 * - Every field is `readonly`, every array a copy.
 * - **Ordering is by floor `index`, never by `heightM`.** `index` is the shaft order the
 *   dispatcher means by "up"; `heightM` is the distance the car physically travels. The
 *   config layer guarantees they agree in direction, but only `index` is defined for a
 *   building that skips 13 or starts at -2.
 */

import type { SimTime } from '../../kernel/types.js';
import type { DoorConfig, DoorMachineState } from '../../physics/doors/index.js';
import type { MotionConstraints, MotionProfile } from '../../physics/motion/index.js';
import type { AccessZone, ResolvedBuilding } from '../../config/types.js';
import { ModelError, type CredentialGroup, type Direction, type ServiceMode } from '../types.js';

/* -------------------------------------------------------------------------- *
 * Clock
 * -------------------------------------------------------------------------- */

/**
 * The one capability a car needs from the kernel: what time it is.
 *
 * Declared structurally and deliberately *narrow* — `SimKernel` and `EventContext.kernel`
 * both satisfy it — so a car can read the simulated clock but can never schedule, cancel or
 * re-enter the kernel from inside a cost query. Nothing here is `Date.now()`
 * (CLAUDE.md invariant 3).
 */
export interface CarClock {
  now(): SimTime;
}

/* -------------------------------------------------------------------------- *
 * Shaft — service zoning and geometry, frozen for the run
 * -------------------------------------------------------------------------- */

/** One floor a shaft opens onto, with the geometry travel time is computed from. */
export interface ServedFloor {
  readonly id: string;
  /** Shaft ordering. Integer, possibly negative, possibly not contiguous. */
  readonly index: number;
  /** Height above datum, metres. Increases strictly with {@link index}. */
  readonly heightM: number;
  /**
   * **Access zoning.** Credential groups permitted to reach this floor, or `undefined` when
   * the floor is covered by no access zone and is therefore unrestricted.
   *
   * `undefined` rather than "every group in the building": unrestricted means *no check*,
   * which is not the same as a permit list that happens to contain everyone — an unbadged
   * visitor passes the first and fails the second.
   */
  readonly permittedCredentialGroups: ReadonlySet<CredentialGroup> | undefined;
}

/** A served floor as authored, before {@link createShaft} indexes it. */
export interface ServedFloorInit {
  readonly id: string;
  readonly index: number;
  readonly heightM: number;
  readonly permittedCredentialGroups?: Iterable<CredentialGroup> | undefined;
}

/**
 * The floors one car's shaft physically opens onto, indexed for O(1) lookup.
 *
 * Immutable building fabric, built once and shared by reference into every snapshot — which
 * is what keeps snapshot construction cheap enough to call ten thousand times.
 *
 * It carries **two of the three kinds of zoning, kept apart** exactly as
 * docs/01-architecture.md requires: {@link shaftServes} answers the physical question (does
 * the shaft open onto that floor at all) and {@link isAccessPermitted} the credential
 * question. Operational zoning — which cars should cover which floors right now — is a
 * dispatcher strategy and appears nowhere in this module.
 */
export interface CarShaft {
  /** Floors served, ascending by {@link ServedFloor.index}. */
  readonly floors: readonly ServedFloor[];
  readonly floorsById: ReadonlyMap<string, ServedFloor>;
  readonly floorsByIndex: ReadonlyMap<number, ServedFloor>;
  /** Lowest served floor index. `undefined` for an empty shaft, which cannot occur. */
  readonly lowestIndex: number;
  readonly highestIndex: number;
}

/**
 * Index a list of served floors into a {@link CarShaft}.
 *
 * @throws ModelError if the list is empty, if two floors share an id or an index, or if
 *   `heightM` does not increase strictly with `index` — a shaft whose geometry disagrees
 *   with its ordering would make "up" mean two different things and silently corrupt every
 *   direction-dependent cost term.
 */
export function createShaft(floors: readonly ServedFloorInit[]): CarShaft {
  if (floors.length === 0) {
    throw new ModelError('A car shaft must serve at least one floor.');
  }

  const sorted = [...floors].sort((a, b) => a.index - b.index);
  const byId = new Map<string, ServedFloor>();
  const byIndex = new Map<number, ServedFloor>();
  const served: ServedFloor[] = [];

  let previous: ServedFloor | undefined;
  for (const floor of sorted) {
    if (!Number.isInteger(floor.index)) {
      throw new ModelError(
        `Shaft floor "${floor.id}" needs an integer index; received ${floor.index}.`,
      );
    }
    if (!Number.isFinite(floor.heightM)) {
      throw new ModelError(
        `Shaft floor "${floor.id}" needs a finite heightM; received ${floor.heightM}.`,
      );
    }
    if (byId.has(floor.id)) {
      throw new ModelError(`Shaft declares floor "${floor.id}" twice.`);
    }
    if (byIndex.has(floor.index)) {
      throw new ModelError(`Shaft declares two floors at index ${floor.index}.`);
    }
    if (previous !== undefined && floor.heightM <= previous.heightM) {
      throw new ModelError(
        `Shaft floor "${floor.id}" (index ${floor.index}) is at ${floor.heightM} m, not above "${previous.id}" (index ${previous.index}) at ${previous.heightM} m. Height must increase strictly with index or "up" is ambiguous.`,
      );
    }

    const groups =
      floor.permittedCredentialGroups === undefined
        ? undefined
        : (new Set(floor.permittedCredentialGroups) as ReadonlySet<CredentialGroup>);
    const entry: ServedFloor = Object.freeze({
      id: floor.id,
      index: floor.index,
      heightM: floor.heightM,
      permittedCredentialGroups: groups,
    });

    byId.set(entry.id, entry);
    byIndex.set(entry.index, entry);
    served.push(entry);
    previous = entry;
  }

  const first = served[0];
  const last = served[served.length - 1];
  /* c8 ignore next 3 -- unreachable: `served` is non-empty by the guard above. */
  if (first === undefined || last === undefined) {
    throw new ModelError('A car shaft must serve at least one floor.');
  }

  return Object.freeze({
    floors: Object.freeze(served),
    floorsById: byId,
    floorsByIndex: byIndex,
    lowestIndex: first.index,
    highestIndex: last.index,
  });
}

/**
 * Build the shaft for one bank of a resolved building, folding in the building's access
 * zones.
 *
 * This is the form a car factory uses, because it runs *during* `createBuilding` and so has
 * the {@link ResolvedBuilding} but not yet the runtime `Building`:
 *
 * ```ts
 * const building = createBuilding(resolved, {
 *   createCar: (spec, ctx) =>
 *     new Car({ id: spec.id, bankId: ctx.bankId, spec,
 *               shaft: shaftForBank(resolved, ctx.bankId),
 *               homeFloorId: 'G', clock: kernel }),
 * });
 * ```
 *
 * @throws ModelError if the building declares no such bank, or the bank names a floor the
 *   building does not declare. Both are caught earlier by the config layer; the checks are
 *   here so a hand-built `ResolvedBuilding` in a test fails loudly rather than producing a
 *   shaft with a hole in it.
 */
export function shaftForBank(building: ResolvedBuilding, bankId: string): CarShaft {
  const bank = building.banks.find((candidate) => candidate.id === bankId);
  if (bank === undefined) {
    const known = building.banks.map((candidate) => candidate.id).join(', ');
    throw new ModelError(
      `Building "${building.id}" declares no bank "${bankId}". Declared banks: ${known || '(none)'}.`,
    );
  }

  const permitted = credentialsByFloorId(building.accessZones);

  return createShaft(
    bank.servesFloors.map((floorId) => {
      const floor = building.floorsById.get(floorId);
      if (floor === undefined) {
        throw new ModelError(
          `Bank "${bankId}" serves floor "${floorId}", which building "${building.id}" does not declare.`,
        );
      }
      const groups = permitted.get(floorId);
      return {
        id: floor.id,
        index: floor.index,
        heightM: floor.heightM,
        ...(groups === undefined ? {} : { permittedCredentialGroups: groups }),
      };
    }),
  );
}

/**
 * Floor id to the **union** of credential groups permitted there.
 *
 * A floor covered by two zones is reachable by either zone's groups — the union, not the
 * intersection — matching `Building.isAccessPermitted`. Nothing in the schema forbids
 * overlapping zones.
 */
function credentialsByFloorId(
  zones: readonly AccessZone[],
): ReadonlyMap<string, ReadonlySet<CredentialGroup>> {
  const byFloor = new Map<string, Set<CredentialGroup>>();
  for (const zone of zones) {
    for (const floorId of zone.floors) {
      const groups = byFloor.get(floorId);
      if (groups === undefined) byFloor.set(floorId, new Set(zone.credentialGroups));
      else for (const group of zone.credentialGroups) groups.add(group);
    }
  }
  return byFloor;
}

/** The floor a shaft opens onto, or `undefined` if it does not serve that floor. */
export function shaftFloor(shaft: CarShaft, floorId: string): ServedFloor | undefined {
  return shaft.floorsById.get(floorId);
}

/**
 * **Service zoning.** Whether this shaft physically opens onto a floor.
 *
 * A hard feasibility filter: no credential, dispatcher weight or traffic pattern can make
 * it true when it is false.
 */
export function shaftServes(shaft: CarShaft, floorId: string): boolean {
  return shaft.floorsById.has(floorId);
}

/**
 * **Access zoning.** Whether a credential group may reach a floor this shaft serves.
 *
 * `false` for a floor the shaft does not serve at all, so a caller that checks only this
 * cannot accidentally admit an unreachable floor — but the two questions stay separate, and
 * a dispatcher wanting to distinguish "the shaft does not go there" from "you may not go
 * there" calls {@link shaftServes} as well.
 */
export function isAccessPermitted(
  shaft: CarShaft,
  credentialGroup: CredentialGroup | undefined,
  floorId: string,
): boolean {
  const floor = shaft.floorsById.get(floorId);
  if (floor === undefined) return false;
  const permitted = floor.permittedCredentialGroups;
  if (permitted === undefined) return true;
  return credentialGroup !== undefined && permitted.has(credentialGroup);
}

/* -------------------------------------------------------------------------- *
 * Motion
 * -------------------------------------------------------------------------- */

/**
 * A move in progress: the S-curve profile, where it started, and the three times that
 * bracket it.
 *
 * The three times are distinct on purpose. `commandedAt` is when the controller said "go";
 * `startedAt` is `commandedAt + motorStartDelayS`, when the brake has lifted and the profile
 * actually begins; `arrivesAt` is `startedAt + profile.duration + levelingSettleS`, when the
 * car is levelled and the doors may open. The motion profile deliberately covers none of
 * that overhead — see `MotionProfile.duration` — so it has to be added by whoever owns the
 * car, which is here.
 */
export interface CarMotion {
  readonly profile: MotionProfile;
  readonly fromFloorId: string;
  readonly fromFloorIndex: number;
  readonly fromHeightM: number;
  readonly toFloorId: string;
  readonly toFloorIndex: number;
  readonly toHeightM: number;
  /** When the move was commanded. */
  readonly commandedAt: SimTime;
  /** `commandedAt + motorStartDelayS`: when the profile's t=0 is. */
  readonly startedAt: SimTime;
  /** `startedAt + profile.duration + levelingSettleS`: when the car is levelled. */
  readonly arrivesAt: SimTime;
  readonly direction: Direction;
}

/* -------------------------------------------------------------------------- *
 * Stops and route
 * -------------------------------------------------------------------------- */

/**
 * A floor this car is committed to stopping at, and everything the door and load models
 * need to price the stop.
 *
 * A stop is the *union* of the reasons for it: a floor with both a car call and an assigned
 * hall call is one stop, not two, and its dwell is the longer of the two base dwells rather
 * than their sum — passengers alighting and passengers boarding do not take turns.
 */
export interface CommittedStop {
  readonly floorId: string;
  readonly floorIndex: number;
  readonly heightM: number;
  /** Somebody aboard pressed this floor. */
  readonly carCall: boolean;
  /** A hall call at this floor is assigned to this car. */
  readonly hallCall: boolean;
  /** Directions of the assigned hall calls at this floor, up before down. */
  readonly hallCallDirections: readonly Direction[];
  /** Earliest registration among the calls making up this stop. Drives starvation terms. */
  readonly registeredAt: SimTime;
  /** Passengers aboard whose destination is this floor. */
  readonly alightingCount: number;
  /** Their total mass, kilograms — what the load cell will stop reading here. */
  readonly alightingMassKg: number;
  /** Passengers assumed to board here. See `CAR_DEFAULTS.assumedBoardingPassengers`. */
  readonly boardingCount: number;
}

/**
 * A committed stop with the time the projection says the car reaches it.
 *
 * Both times are **relative to `snapshot.at`**, never absolute, so a route is directly
 * comparable between two cars evaluated at the same instant and cannot be mistaken for a
 * kernel timestamp.
 */
export interface RouteStop extends CommittedStop {
  /** Position in the route, 0-based. */
  readonly order: number;
  /** Seconds from `snapshot.at` until the car is levelled at this floor. */
  readonly arrivalSeconds: number;
  /** Seconds from `snapshot.at` until the doors are shut again and the car may leave. */
  readonly departureSeconds: number;
  /** True for the hypothetical stop a cost query added; false for a real commitment. */
  readonly requested: boolean;
}

/* -------------------------------------------------------------------------- *
 * Load
 * -------------------------------------------------------------------------- */

/**
 * What the load cell reads, and what it means.
 *
 * The mass is the **sum of actual passenger masses**, never a person count times a nominal
 * weight — the whole point of drawing mass from a distribution (`passengerMass` stream) is
 * that the sensor has something real to measure. See docs/02-elevator-reference.md
 * § Load weighing behavior.
 */
export interface CarLoadSnapshot {
  /** Sum of the masses of everyone aboard, kilograms. */
  readonly massKg: number;
  readonly ratedLoadKg: number;
  /** `massKg / ratedLoadKg`. */
  readonly loadFactor: number;
  readonly occupants: number;
  /** Load fraction at which the car stops answering *new hall calls*. Default 0.8. */
  readonly bypassLoadThreshold: number;
  /** Load fraction at which the doors are held and the car will not start. Default 1.1. */
  readonly overloadThreshold: number;
  /** Fraction of rated capacity traffic analysis assumes a car fills to. 0.8, never 1.0. */
  readonly designLoadFactor: number;
  /** `loadFactor >= bypassLoadThreshold`. */
  readonly isBypassingHallCalls: boolean;
  /** `loadFactor >= overloadThreshold`. */
  readonly isOverloaded: boolean;
}

/* -------------------------------------------------------------------------- *
 * The snapshot
 * -------------------------------------------------------------------------- */

/**
 * Everything `estimateCost` is allowed to know, frozen at an instant.
 *
 * **This type is the purity mechanism** (CLAUDE.md invariant 1). It is a plain value: no
 * methods, no back-reference to the {@link Car}, no `Rng`, no `EventScheduler`. The
 * estimator is a free function of `(CarSnapshot, CostRequest)`, so there is no handle
 * through which it *could* mutate simulation state, draw a random number or schedule an
 * event — purity is structural rather than a promise in a comment.
 *
 * The two collection fields that are not deep copies are {@link shaft} and
 * {@link doorConfig}: both are immutable for the whole run and are shared by reference,
 * which is what keeps building a snapshot cheap enough to do ten thousand times in one
 * dispatch decision.
 */
export interface CarSnapshot {
  readonly carId: string;
  readonly bankId: string;
  /** Simulated time the snapshot was taken. Every route time is relative to this. */
  readonly at: SimTime;
  readonly mode: ServiceMode;

  /** Floor the car is at, or the one it last left while {@link motion} is in progress. */
  readonly floorId: string;
  readonly floorIndex: number;
  /** Height above datum at {@link at}, metres — interpolated when the car is moving. */
  readonly heightM: number;
  /** Direction of the current run, or `undefined` for an idle car. */
  readonly direction: Direction | undefined;
  /** The move in progress, or `undefined` when the car is standing. */
  readonly motion: CarMotion | undefined;

  readonly door: DoorMachineState;
  readonly doorConfig: DoorConfig;

  /** The comfort envelope: rated speed, acceleration, jerk. */
  readonly constraints: MotionConstraints;
  /** Brake lift and torque build before the profile begins, seconds. */
  readonly motorStartDelayS: number;
  /** Levelling and settling after the profile ends, seconds. */
  readonly levelingSettleS: number;
  /** Seconds per passenger per direction through the doorway. */
  readonly passengerTransferS: number;
  /** Mean body mass used to project boarding load, kilograms. */
  readonly nominalPassengerMassKg: number;
  /** Passengers a hall-call stop is assumed to load, absent better information. */
  readonly assumedBoardingPassengers: number;

  readonly shaft: CarShaft;
  readonly load: CarLoadSnapshot;
  /** Committed stops, in floor-index order. Route ordering is applied by `projectRoute`. */
  readonly stops: readonly CommittedStop[];
}

/* -------------------------------------------------------------------------- *
 * The request and the estimate
 * -------------------------------------------------------------------------- */

/**
 * What the dispatcher asks the car to price.
 *
 * A `HallCall` satisfies this directly — that is the signature docs/01-architecture.md
 * specifies — and the extra fields are all optional, for the cases a bare up/down button
 * cannot express:
 *
 * - `credentialGroup` and `destinationFloorId` are unknown at call time with conventional
 *   buttons and known under destination entry, so a credential-aware profile can authorize and
 *   optimize in one step where a conventional one cannot authorize at all.
 *   **Measured, the performance claim built on that asymmetry is refuted** (DECISIONS.md § D30,
 *   § D60). The credential is what makes an access-controlled building servable at all —
 *   conventional dispatch cannot serve `secure-tower`'s interfloor traffic under any budget — and
 *   once the credential is present, moving the *destination* earlier buys **less** there than on
 *   an unzoned building, because the access check has already passed and three identical cars per
 *   bank leave less for a destination to differentiate. The asymmetry is real; "better under
 *   access control because of it" was not measured when it was written and is now measured false.
 * - `boardingPassengers` / `boardingMassKg` let a dispatcher that has counted the hall queue
 *   say so, instead of the car assuming `assumedBoardingPassengers`.
 */
export interface CostRequest {
  /** Stable call identity when the request came from a real hall call. Not read here. */
  readonly id?: string | undefined;
  readonly floorId: string;
  /**
   * Carried by `HallCall`. **Not read** — the shaft's geometry is authoritative, because a
   * car must price a floor by where it physically is, not by what a caller says its index
   * was.
   */
  readonly floorIndex?: number | undefined;
  /** Which way the passenger wants to travel. Absent for a request with no direction. */
  readonly direction?: Direction | undefined;
  readonly registeredAt?: SimTime | undefined;
  /**
   * Whether this is a landing call or a request from inside the car.
   *
   * It changes feasibility, and only in one way: hall-call bypass at 80% load stops a car
   * accepting new **hall** calls while it goes on serving its car calls. That asymmetry is
   * the whole of the "skip floors that have been called" behaviour. Defaults to `hall`.
   */
  readonly kind?: 'hall' | 'car' | undefined;
  /** Access-control credential, when known. `undefined` means an unbadged visitor. */
  readonly credentialGroup?: CredentialGroup | undefined;
  /** Destination, when known at call time (destination entry). */
  readonly destinationFloorId?: string | undefined;
  /** Passengers expected to board. Defaults to `assumedBoardingPassengers`. */
  readonly boardingPassengers?: number | undefined;
  /** Their total mass, kilograms. Defaults to `boardingPassengers * nominalPassengerMassKg`. */
  readonly boardingMassKg?: number | undefined;
}

/** Why a car cannot serve a request. Diagnostic; the contract is the boolean. */
export const INFEASIBILITY_REASONS = [
  /** The car's service mode does not accept this kind of call. */
  'serviceMode',
  /** **Service zoning**: the shaft does not open onto the requested floor. */
  'serviceZone',
  /** **Access zoning**: the credential may not reach the requested floor. */
  'accessDenied',
  /** The declared destination is outside this shaft's service zone. */
  'destinationServiceZone',
  /** The credential may not reach the declared destination. */
  'destinationAccessDenied',
  /** Load is at or above `overloadThreshold`: doors held, the car will not start. */
  'overload',
  /** Load is at or above `bypassLoadThreshold`: no new hall calls, car calls still served. */
  'hallCallBypass',
] as const;

export type InfeasibilityReason = (typeof INFEASIBILITY_REASONS)[number];

/**
 * The answer to "what would it cost this car to serve that call?".
 *
 * The first four fields are the contract from docs/01-architecture.md. The last two are
 * diagnostics: they make a `false` actionable and give the Phase 5 `stopCount` cost term its
 * raw input, and no decision should depend on them that could not be made without them.
 *
 * An infeasible estimate reports `etaSeconds: Infinity` rather than `0` or `-1`, so a scorer
 * that forgets to check {@link feasible} ranks the car last instead of first.
 */
export interface CostEstimate {
  /**
   * Whether this car can serve the request at all: service zoning, access zoning, service
   * mode and the load sensor, in that order.
   *
   * `false` is a hard filter, not a large cost. Note the one deliberate softness:
   * `hallCallBypass` is reported as infeasible because that is what a loaded car does, but
   * the dispatcher holds the starvation guard (`allowBypassIfSoleEligibleCar`) and may
   * override it, because only the dispatcher knows whether another car could serve the
   * floor. See docs/06-parameterization-and-tuning.md § Stage 6.
   */
  readonly feasible: boolean;
  /**
   * Seconds from now until the car is levelled at the requested floor, accounting for every
   * committed stop in between — the door time at each and the real S-curve travel time
   * between them. `Infinity` when infeasible.
   */
  readonly etaSeconds: number;
  /**
   * Seconds of extra delay this call would impose on passengers already committed to: the
   * sum, over every stop the car had already committed to, of how much later it would be
   * reached. Zero when the new stop falls after everything else on the route, or when the
   * floor was already a stop.
   */
  readonly marginalDelaySeconds: number;
  /**
   * Load factor the car would be carrying after serving this call: everyone who alights
   * before or at the requested floor is gone, and the expected boarders are aboard.
   */
  readonly resultingLoadFactor: number;
  /** Why not, when {@link feasible} is `false`; `undefined` otherwise. Diagnostic. */
  readonly infeasibleReason: InfeasibilityReason | undefined;
  /** Committed stops the car would serve before reaching the requested floor. Diagnostic. */
  readonly stopsBefore: number;
}

/* -------------------------------------------------------------------------- *
 * Tunables (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

/** Parameter kinds a generic optimizer understands. See docs/06-parameterization-and-tuning.md. */
export type CarParameterType = 'continuous' | 'integer' | 'categorical' | 'boolean';

/**
 * A self-describing tunable, in the same shape as `DoorParameterSpec`.
 *
 * The shape is repeated rather than imported from `physics/doors` because it is not a door
 * concept — it is the generic parameter-schema shape from
 * docs/06-parameterization-and-tuning.md, which has no home module yet. When Phase 7 lands a
 * `tuning/` package this declaration and the door one should both move there; until then,
 * duplicating eight fields is cheaper than making the load sensor depend on the door
 * machine for a type.
 */
export interface CarParameterSpec {
  /** Dotted path of the value in config, e.g. `answer.bypassLoadThreshold`. */
  readonly id: string;
  readonly type: CarParameterType;
  /** Inclusive `[min, max]`. Present for `continuous` and `integer`. */
  readonly range?: readonly [number, number] | undefined;
  readonly scale?: 'linear' | 'log' | undefined;
  /** Admissible values. Present for `categorical`. */
  readonly values?: readonly string[] | undefined;
  readonly default: number | string | boolean;
  /** SI unit, or omitted for a dimensionless quantity. */
  readonly unit?: string | undefined;
  readonly description: string;
  /** Parameter id to the values that make this parameter live. */
  readonly activeWhen?: Readonly<Record<string, readonly string[]>> | undefined;
}
