/**
 * Floor runtime state: who is waiting, which way, and whether a button is lit.
 *
 * A `Floor` is the mutable twin of a `FloorConfig`. The config is static data the simulation
 * reads and never edits; the `Floor` is the landing as it exists during a run — two FIFO
 * queues of waiting passengers and at most one live hall call per direction.
 *
 * ## Deliberately mechanical
 *
 * Queueing and hall-call registration are kept as separate operations rather than fused into
 * one "passenger arrives" method. Pressing a button is a *policy* decision, not a physical
 * consequence of standing at a landing: under destination entry there are no up/down buttons
 * at all, and under batch registration the dispatcher may collect several arrivals before
 * registering anything. Fusing them here would bake one call type into the model and put a
 * tunable in code (CLAUDE.md invariant 7).
 *
 * Likewise {@link Floor.takeWaiting} does not clear the hall call. A car that fills up leaves
 * passengers behind, and the call must stay lit; deciding that is the answering stage's job,
 * not the landing's. For the same reason it takes an optional `accepts` predicate instead of
 * assuming the boarding car can serve whoever happens to be at the head of the queue: on a
 * floor served by two banks it cannot.
 *
 * ## Ordering
 *
 * Queues are arrays, served head-first, so boarding order is arrival order and is completely
 * deterministic. Nothing here iterates a hash structure to decide who goes first.
 */

import type { SimTime } from '../kernel/index.js';
import type { FloorConfig } from '../config/types.js';

import {
  DIRECTIONS,
  ModelError,
  hallCallId,
  type Direction,
  type HallCall,
} from './types.js';
import type { Passenger } from './passenger.js';

/**
 * One landing during a run.
 *
 * Construct through {@link createBuilding} rather than directly; a floor is only meaningful
 * inside the building that declares it.
 */
export class Floor {
  /** The validated config this floor was built from, with `floorRanges` already expanded. */
  readonly config: FloorConfig;
  /** Display label and reference key, e.g. `G`, `31`. Unique within the building. */
  readonly id: string;
  /** Shaft ordering. Integer, negative for basements, and possibly not contiguous. */
  readonly index: number;
  /** Height above datum, metres. Increases strictly with {@link index}. */
  readonly heightM: number;
  /** Occupants, driving arrival rate as a percentage of population per 5 minutes. */
  readonly population: number;
  /** Ground-level source of incoming traffic. A building may have several. */
  readonly isEntrance: boolean;
  /**
   * Sky lobby: a journey may alight here and continue on another bank with its identity
   * intact. Declared per building, never inferred from {@link isEntrance}.
   */
  readonly isTransferFloor: boolean;
  /** Per-floor traffic profile override, or `undefined` to use the building's. */
  readonly trafficProfile: string | undefined;
  /** Optional human name, e.g. `Lobby`. */
  readonly label: string | undefined;

  /** Two FIFO queues, keyed by the direction the waiting passenger wants to travel. */
  readonly #queues: Record<Direction, Passenger[]> = { up: [], down: [] };
  readonly #hallCalls = new Map<Direction, HallCall>();

  constructor(config: FloorConfig) {
    this.config = config;
    this.id = config.id;
    this.index = config.index;
    this.heightM = config.heightM;
    this.population = config.population;
    this.isEntrance = config.isEntrance === true;
    this.isTransferFloor = config.isTransferFloor === true;
    this.trafficProfile = config.trafficProfile;
    this.label = config.label;
  }

  /* ---------------------------------------------------------------- *
   * Waiting passengers
   * ---------------------------------------------------------------- */

  /**
   * Add a passenger to the landing queue for the direction they are travelling.
   *
   * The direction comes from the passenger's own origin and destination indices, so a
   * passenger can never be queued facing the wrong way.
   */
  addWaiting(passenger: Passenger): void {
    if (passenger.originFloorId !== this.id) {
      throw new ModelError(
        `Passenger "${passenger.id}" waits at floor "${passenger.originFloorId}" and cannot be queued at floor "${this.id}".`,
      );
    }
    if (passenger.hasBoarded) {
      throw new ModelError(
        `Passenger "${passenger.id}" has already boarded and cannot rejoin the queue at floor "${this.id}". A transfer starts a new leg; see PassengerFactory.transfer.`,
      );
    }
    const queue = this.#queues[passenger.direction];
    if (queue.includes(passenger)) {
      throw new ModelError(
        `Passenger "${passenger.id}" is already queued at floor "${this.id}" going ${passenger.direction}.`,
      );
    }
    queue.push(passenger);
  }

  /**
   * Remove a specific passenger from whichever queue holds them — someone giving up, or
   * being reassigned to a different bank.
   *
   * @returns `true` if the passenger was waiting here.
   */
  removeWaiting(passenger: Passenger): boolean {
    const queue = this.#queues[passenger.direction];
    const at = queue.indexOf(passenger);
    if (at < 0) return false;
    queue.splice(at, 1);
    return true;
  }

  /**
   * Remove and return up to `limit` passengers from a direction's queue — boarding, in
   * arrival order.
   *
   * `limit` is how many the car can still take; omit it to board everyone eligible. The hall
   * call is left exactly as it was: if the car filled up, or left somebody it cannot serve,
   * the button must stay lit.
   *
   * ## `accepts`, and why boarding is not just "take the first N"
   *
   * On a floor served by more than one bank, "who is waiting here" and "who can this car
   * take" are different sets. Mixed-Use High-Rise's ground lobby is served by `shuttle` and
   * `office-local`; a passenger bound for the sky lobby at 31 is standing in the same `up`
   * queue as a passenger bound for 20, and `office-local` shafts do not reach 31. Taking the
   * head of the queue unconditionally would put that passenger in a car that can never reach
   * their destination *and* delete them from the landing, so the hall call could not recover
   * them. Every multi-bank building in `data/buildings/` has shared floors: Secure Tower one,
   * Mixed-Use High-Rise two, Vertical City eight.
   *
   * `accepts` is therefore how a caller expresses eligibility, and the eligibility rule stays
   * with the caller rather than being baked in here — service zoning, access zoning, capacity
   * by mass, destination-dispatch assignment and "this car is already full for that floor"
   * are all legitimate, and which of them applies is a dispatcher decision, i.e. data rather
   * than code (CLAUDE.md invariant 7). A single-bank floor simply omits it.
   *
   * ```ts
   * // an `office-local` car boarding at the ground lobby it shares with the shuttle
   * floor.takeWaiting('up', spaceLeft, (p) => bank.servesFloor(p.destinationFloorId));
   * ```
   *
   * Rejected passengers keep their places relative to one another, and only accepted ones
   * count against `limit`, so a car that can take nobody leaves the landing exactly as it
   * found it.
   */
  takeWaiting(
    direction: Direction,
    limit = Number.POSITIVE_INFINITY,
    accepts?: (passenger: Passenger) => boolean,
  ): readonly Passenger[] {
    if (limit < 0 || Number.isNaN(limit)) {
      throw new ModelError(`Boarding limit must be a non-negative number; received ${limit}`);
    }
    const queue = this.#queues[direction];
    const take = Math.min(queue.length, Math.floor(limit));
    if (take === 0) return [];
    if (accepts === undefined) return queue.splice(0, take);

    // A stable scan rather than `splice(0, take)`: everyone is considered in arrival order, so
    // boarding order is still FIFO within the accepted subset, and the passengers this car
    // cannot serve stay queued in the order they arrived.
    const boarding: Passenger[] = [];
    const remaining: Passenger[] = [];
    for (const passenger of queue) {
      if (boarding.length < take && accepts(passenger)) boarding.push(passenger);
      else remaining.push(passenger);
    }
    queue.length = 0;
    for (const passenger of remaining) queue.push(passenger);
    return boarding;
  }

  /**
   * A snapshot of the passengers waiting here, in arrival order. Omit `direction` for both
   * queues, up first.
   *
   * A copy, not the live array: callers routinely iterate this while boarding mutates the
   * queue underneath them.
   */
  waiting(direction?: Direction): readonly Passenger[] {
    if (direction !== undefined) return [...this.#queues[direction]];
    return [...this.#queues.up, ...this.#queues.down];
  }

  /** How many are waiting, for one direction or (omitting `direction`) both. */
  queueLength(direction?: Direction): number {
    if (direction !== undefined) return this.#queues[direction].length;
    return this.#queues.up.length + this.#queues.down.length;
  }

  /** Whether anybody is waiting, for one direction or both. */
  hasWaiting(direction?: Direction): boolean {
    return this.queueLength(direction) > 0;
  }

  /**
   * How long the longest-waiting passenger has been here, in seconds; `0` when nobody is.
   *
   * The queue head is the oldest, because arrivals are appended in simulated-time order and
   * boarding removes from the head — so this is O(1) and needs no scan. It is the raw input
   * to any starvation cost term.
   */
  longestWaitS(now: SimTime, direction?: Direction): number {
    if (direction !== undefined) {
      const head = this.#queues[direction][0];
      return head === undefined ? 0 : now - head.arrivedAt;
    }
    return Math.max(this.longestWaitS(now, 'up'), this.longestWaitS(now, 'down'));
  }

  /* ---------------------------------------------------------------- *
   * Hall calls
   * ---------------------------------------------------------------- */

  /**
   * Press the up or down button.
   *
   * **Idempotent, and deliberately does not refresh `registeredAt`.** A live call stays the
   * call it was: the tenth person to press a button that has been lit for 90 seconds has not
   * reset anyone's wait, and treating it as a new call would erase exactly the starvation the
   * dispatcher is supposed to be penalized for.
   *
   * @returns the live call for that direction, new or pre-existing.
   */
  registerHallCall(direction: Direction, at: SimTime): HallCall {
    const existing = this.#hallCalls.get(direction);
    if (existing !== undefined) return existing;
    if (!Number.isFinite(at)) {
      throw new ModelError(
        `Hall call at floor "${this.id}" needs a finite registration time; received ${at}`,
      );
    }
    const call: HallCall = Object.freeze({
      id: hallCallId(this.id, direction),
      floorId: this.id,
      floorIndex: this.index,
      direction,
      registeredAt: at,
    });
    this.#hallCalls.set(direction, call);
    return call;
  }

  /** The live call for a direction, or `undefined` if the button is not lit. */
  hallCall(direction: Direction): HallCall | undefined {
    return this.#hallCalls.get(direction);
  }

  /** Whether the button for that direction is lit. */
  hasHallCall(direction: Direction): boolean {
    return this.#hallCalls.has(direction);
  }

  /**
   * Extinguish the button — the answering stage's decision, taken when a car has served the
   * call, not a side effect of boarding.
   *
   * @returns `true` if a call was live.
   */
  clearHallCall(direction: Direction): boolean {
    return this.#hallCalls.delete(direction);
  }

  /** Every live call at this floor, up before down, so iteration order is deterministic. */
  activeHallCalls(): readonly HallCall[] {
    const calls: HallCall[] = [];
    for (const direction of DIRECTIONS) {
      const call = this.#hallCalls.get(direction);
      if (call !== undefined) calls.push(call);
    }
    return calls;
  }

  /** Drop all runtime state, leaving the static floor description. For reusing a building. */
  reset(): void {
    this.#queues.up.length = 0;
    this.#queues.down.length = 0;
    this.#hallCalls.clear();
  }
}
