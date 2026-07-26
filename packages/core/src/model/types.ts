/**
 * Shared vocabulary for the simulation model.
 *
 * These are the words the rest of the simulator argues in: which way a car is going, what a
 * button press is, what mode a car is in. They are deliberately small, immutable value types
 * with no behaviour beyond pure helpers — the runtime state lives on {@link Floor},
 * {@link Bank}, {@link Building} and (from `model/car/`) the car itself.
 *
 * Two invariants shape this file:
 *
 * - **No wall-clock time** (CLAUDE.md invariant 3). Every timestamp here is a
 *   {@link SimTime}, in simulated seconds, and originates from the kernel.
 * - **Ordering is by floor `index`, never by `heightM`.** `index` is the shaft order the
 *   dispatcher means by "up"; `heightM` is the distance the car physically travels. The
 *   config layer already guarantees `heightM` increases strictly with `index`, so the two
 *   agree on direction — but only `index` is defined for a building with skipped numbers
 *   (no floor 13) or basements.
 *
 * This module imports nothing but kernel *types*, so it is free of any runtime dependency
 * and safe to import from anywhere in `core/`.
 */

import type { SimTime } from '../kernel/index.js';

/* -------------------------------------------------------------------------- *
 * Direction
 * -------------------------------------------------------------------------- */

/** The two directions of travel. A stationary car has no direction, expressed as `undefined`. */
export const DIRECTIONS = ['up', 'down'] as const;

export type Direction = (typeof DIRECTIONS)[number];

/** The direction opposite to `direction`. */
export function oppositeDirection(direction: Direction): Direction {
  return direction === 'up' ? 'down' : 'up';
}

/**
 * The direction of travel from one floor to another, by **floor index**.
 *
 * Returns `undefined` when the indices are equal: a trip that goes nowhere has no direction,
 * and callers must decide what that means rather than being handed an arbitrary one.
 */
export function directionBetween(fromIndex: number, toIndex: number): Direction | undefined {
  if (toIndex > fromIndex) return 'up';
  if (toIndex < fromIndex) return 'down';
  return undefined;
}

/* -------------------------------------------------------------------------- *
 * Credentials
 * -------------------------------------------------------------------------- */

/**
 * An access-control credential group, e.g. `tenant-alpha-staff`.
 *
 * Named rather than left as a bare `string` because it appears next to floor ids and bank
 * ids in signatures where transposing two arguments would otherwise type-check.
 *
 * Access zoning (credential x floor) is one of three distinct zoning concepts and must never
 * be collapsed into the other two — see {@link Building.isAccessPermitted}.
 */
export type CredentialGroup = string;

/* -------------------------------------------------------------------------- *
 * Service mode
 * -------------------------------------------------------------------------- */

/**
 * The operating mode of a car. Car-owned state, per docs/01-architecture.md: degraded modes
 * are natural as a per-car state machine and miserable as central flags.
 *
 * - `in-service` — normal automatic operation; answers hall calls and car calls.
 * - `independent` — attendant/independent service. Removed from group control: it answers
 *   car calls pressed inside the car only, and the dispatcher must not allocate hall calls
 *   to it.
 * - `fire-recall` — Phase I emergency recall. The car returns to its designated level and
 *   parks with doors open; it provides no passenger service. (Phase II firefighter
 *   operation is a distinct mode and is out of scope for Phase 1 — it would be a new member
 *   of this union, not a reinterpretation of this one.)
 * - `out-of-service` — parked, maintenance, or failed. Provides nothing.
 */
export const SERVICE_MODES = ['in-service', 'independent', 'fire-recall', 'out-of-service'] as const;

export type ServiceMode = (typeof SERVICE_MODES)[number];

/**
 * Whether a car in this mode may be allocated hall calls.
 *
 * This is the group controller's hard eligibility gate, alongside service zoning. Only
 * `in-service` qualifies: a car on independent service is under an attendant's control, and
 * a recalled or out-of-service car is not carrying passengers at all.
 */
export function acceptsHallCalls(mode: ServiceMode): boolean {
  return mode === 'in-service';
}

/**
 * Whether a car in this mode still honours car calls registered inside it.
 *
 * `independent` does — that is the entire point of the mode — which is why hall-call and
 * car-call eligibility are two predicates rather than one `isAvailable` flag.
 */
export function acceptsCarCalls(mode: ServiceMode): boolean {
  return mode === 'in-service' || mode === 'independent';
}

/* -------------------------------------------------------------------------- *
 * Calls
 * -------------------------------------------------------------------------- */

/**
 * A landing call: somebody pressed up or down at a floor.
 *
 * Immutable by design. `Car.estimateCost(request: HallCall)` is pure (CLAUDE.md invariant 1)
 * and is called thousands of times per dispatch decision, so the request it is handed must
 * be a value that cannot be edited by the callee.
 *
 * Note what is deliberately *absent*: the destination, and the caller's credential. With
 * up/down buttons the system does not learn either until the passenger is already in the
 * car. That asymmetry is the mechanism behind the result this project wants to reproduce —
 * destination dispatch does better under access control precisely because it learns the
 * destination at call time and can authorize and optimize in the same step.
 */
export interface HallCall {
  /**
   * Stable identity of the call, for reassignment tracking and starvation guards.
   *
   * For conventional up/down buttons this is {@link hallCallId}: one live call per
   * (floor, direction), because there is exactly one button.
   */
  readonly id: string;
  readonly floorId: string;
  /** Shaft ordering of {@link floorId}. Carried so scoring needs no floor lookup. */
  readonly floorIndex: number;
  readonly direction: Direction;
  /**
   * When the button was first pressed, in simulated seconds.
   *
   * "First": re-pressing a live button does not restart this clock, or waiting time and
   * every starvation term would silently reset (see {@link Floor.registerHallCall}).
   */
  readonly registeredAt: SimTime;
}

/** The identity of the up/down button at a floor: one live call per floor per direction. */
export function hallCallId(floorId: string, direction: Direction): string {
  return `${floorId}:${direction}`;
}

/**
 * A destination registered from inside the car.
 *
 * Distinct from {@link HallCall}: a car call is already aboard, so it has no direction of
 * its own (the car's direction decides that) and it cannot be reassigned to another car.
 */
export interface CarCall {
  readonly floorId: string;
  /** Shaft ordering of {@link floorId}. */
  readonly floorIndex: number;
  readonly registeredAt: SimTime;
}

/* -------------------------------------------------------------------------- *
 * Double-deck geometry
 * -------------------------------------------------------------------------- */

/** Which deck of a double-deck car serves a floor. */
export const DECK_POSITIONS = ['lower', 'upper'] as const;

export type DeckPosition = (typeof DECK_POSITIONS)[number];

/**
 * Two floors a double-deck car opens onto simultaneously.
 *
 * The pair is ordered: the lower deck serves {@link lowerFloorId}. Load-time validation has
 * already checked that the two are exactly one deck separation apart in `heightM`, so a pair
 * reaching the model layer is physically realizable.
 */
export interface FloorPair {
  readonly lowerFloorId: string;
  readonly upperFloorId: string;
}

/* -------------------------------------------------------------------------- *
 * Structural lookups
 * -------------------------------------------------------------------------- */

/**
 * The little a passenger factory needs to know about a building's floors.
 *
 * Declared structurally so `passenger.ts` need not import `building.ts` — {@link Building}
 * satisfies this by having the two methods, and the import graph stays acyclic.
 */
export interface FloorTopology {
  /** Shaft ordering of a floor, or `undefined` if the building has no such floor. */
  floorIndexOf(floorId: string): number | undefined;
  /** Whether a floor is a sky lobby where a journey may change banks and continue. */
  isTransferFloor(floorId: string): boolean;
}

/* -------------------------------------------------------------------------- *
 * Errors
 * -------------------------------------------------------------------------- */

/**
 * An impossible operation on the simulation model: boarding a passenger twice, transferring
 * at a floor that is not a sky lobby, building a passenger whose origin is its destination.
 *
 * Every one of these is a bug in the caller rather than bad input data — bad input data
 * fails earlier, in the config layer, as a `ConfigError`. Thrown rather than returned so it
 * cannot be ignored into a silently wrong statistic.
 */
export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelError';
  }
}
