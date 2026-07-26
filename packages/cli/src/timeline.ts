/**
 * A run, made replayable at display framerate.
 *
 * ## Why this exists
 *
 * docs/01-architecture.md § Simulation kernel says the renderer "samples `positionAt()` at
 * display framerate" while "the kernel only schedules events". A `Simulation` runs to completion
 * in one synchronous call, so there is no live clock to sample — but the *ingredients* of
 * `Car.positionAt` are per-move values (`fromHeightM` plus the S-curve profile the kernel timed
 * the move with), and they are exactly what `Car.departFor` returns.
 *
 * So `captureTimeline` records each `CarMotion` as the run produces it, and `heightAt` evaluates
 * `motion.fromHeightM + positionAt(motion.profile, t - motion.startedAt)` — character for
 * character the computation `Car.positionAt` performs. The picture is therefore *exact*, not
 * interpolated: a car on screen is where the statistics say it was, including through the motor
 * start delay and the levelling settle, because the profile clamps at both ends.
 *
 * ## Why instrumentation rather than a hook
 *
 * `core/` deliberately exposes no per-event callback — a run is a value, not a stream — and
 * inventing one would mean editing a package this work does not own. Wrapping the four public
 * methods that change what a car looks like (`departFor`, `openDoors`, `requestReopen`,
 * `closeDoors`) is contained entirely in this file, cannot influence a decision (every wrapper
 * delegates and returns the delegate's value unchanged), and cannot affect a statistic: the
 * run's `RunRecord` is produced by `metrics/` from the same events either way. Everything else
 * on screen — occupancy, per-floor queues, waiting times — is read from the finished
 * `RunRecord`, which is authoritative.
 */

import {
  doorOpenFractionAt,
  positionAt as profilePositionAt,
  type Building,
  type Car,
  type CarMotion,
  type DoorConfig,
  type DoorMachineState,
  type DoorStep,
  type PassengerRecord,
  type ResolvedBuilding,
  type ResolvedCar,
  type RunRecord,
  type SimTime,
} from '@elevator-sim/core';

/**
 * The door state machine, as it stood after each call that touched it.
 *
 * Recorded rather than derived from the commands, because a door closes *automatically* when
 * its dwell expires: the run realises that transition through `advanceDoorsTo`, so wrapping the
 * commands alone would leave a car's doors standing open forever on screen. Between two marks
 * the open fraction is `doorOpenFractionAt(state, t, config)`, which is the same interpolation
 * `Car.doorOpenFractionAt` performs — the door's counterpart of `positionAt`.
 */
export interface DoorMark {
  readonly at: SimTime;
  readonly state: DoorMachineState;
}

/** Everything one car did, in the order it did it. */
export interface CarTrack {
  readonly carId: string;
  readonly bankId: string;
  /** `carId` with the redundant bank prefix removed, for a narrow column header. */
  readonly label: string;
  /** Height of the car's home floor: where it stands before its first move. */
  readonly startHeightM: number;
  readonly startFloorId: string;
  readonly motions: CarMotion[];
  readonly doors: DoorMark[];
  /** Floor ids this car's shaft serves. */
  readonly servedFloorIds: ReadonlySet<string>;
  readonly spec: ResolvedCar | undefined;
  /** This car's resolved door timings, for interpolating the open fraction. */
  readonly doorConfig: DoorConfig;
}

export type CarTracks = ReadonlyMap<string, CarTrack>;

/**
 * Wrap every car in `building` so its moves and door commands are recorded.
 *
 * Call **before** `Simulation.run()`. Returns the (initially empty) tracks, which fill as the
 * run proceeds.
 */
export function captureTimeline(
  building: Building<Car>,
  resolved: ResolvedBuilding,
): CarTracks {
  // A runtime `Car.id` is `${bankId}-${specId}`, so the resolved spec is keyed by both to
  // survive either convention without guessing.
  const specs = new Map<string, ResolvedCar>();
  for (const bank of resolved.banks) {
    for (const car of bank.cars) {
      specs.set(`${bank.id}-${car.id}`, car);
      if (!specs.has(car.id)) specs.set(car.id, car);
    }
  }

  const tracks = new Map<string, CarTrack>();
  for (const car of building.cars) {
    const track: CarTrack = {
      carId: car.id,
      bankId: car.bankId,
      label: shortCarLabel(car.id, car.bankId),
      startHeightM: car.heightM,
      startFloorId: car.floorId,
      motions: [],
      doors: [],
      servedFloorIds: new Set(car.shaft.floors.map((floor) => floor.id)),
      spec: specs.get(car.id),
      doorConfig: car.doorConfig,
    };
    tracks.set(car.id, track);
    instrument(car, track);
  }
  return tracks;
}

/** `main-A` in bank `main` is just `A` on screen. */
export function shortCarLabel(carId: string, bankId: string): string {
  const prefix = `${bankId}-`;
  return carId.startsWith(prefix) ? carId.slice(prefix.length) : carId;
}

/**
 * Wrap the five public methods that change how a car looks.
 *
 * Each wrapper delegates and returns the delegate's value unchanged, so nothing here can move a
 * decision, a random draw or a statistic. `advanceDoorsTo` is included because that is where an
 * expiring dwell turns into a closing door — the transition nobody commands.
 */
function instrument(car: Car, track: CarTrack): void {
  const departFor = car.departFor.bind(car);
  const openDoors = car.openDoors.bind(car);
  const requestReopen = car.requestReopen.bind(car);
  const closeDoors = car.closeDoors.bind(car);
  const advanceDoorsTo = car.advanceDoorsTo.bind(car);

  car.departFor = (floorId, at) => {
    const motion = departFor(floorId, at ?? car.now());
    track.motions.push(motion);
    return motion;
  };
  car.openDoors = (at, reason): DoorStep => {
    const when = at ?? car.now();
    return mark(track, when, openDoors(when, reason));
  };
  car.requestReopen = (cause, at, reason): DoorStep => {
    const when = at ?? car.now();
    return mark(track, when, requestReopen(cause, when, reason));
  };
  car.closeDoors = (at): DoorStep => {
    const when = at ?? car.now();
    return mark(track, when, closeDoors(when));
  };
  car.advanceDoorsTo = (at): DoorStep => {
    const when = at ?? car.now();
    return mark(track, when, advanceDoorsTo(when));
  };
}

function mark(track: CarTrack, at: SimTime, step: DoorStep): DoorStep {
  track.doors.push({ at, state: step.state });
  return step;
}

/* -------------------------------------------------------------------------- *
 * Sampling
 * -------------------------------------------------------------------------- */

/** The move in effect at `t`: the last one commanded at or before it. */
function motionAt(track: CarTrack, t: SimTime): CarMotion | undefined {
  const motions = track.motions;
  let low = 0;
  let high = motions.length - 1;
  let found: CarMotion | undefined;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = motions[mid];
    if (candidate === undefined) break;
    if (candidate.commandedAt <= t) {
      found = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/**
 * Height above datum at `t`, metres — the exact analytic position.
 *
 * Identical arithmetic to `Car.positionAt`: the profile returns `0` before the move starts and
 * the full displacement after it ends, so one expression covers the motor-start delay, the
 * S-curve and the settle without a special case.
 */
export function heightAt(track: CarTrack, t: SimTime): number {
  const motion = motionAt(track, t);
  if (motion === undefined) return track.startHeightM;
  return motion.fromHeightM + profilePositionAt(motion.profile, t - motion.startedAt);
}

/** Signed direction of travel at `t`: `1` up, `-1` down, `0` standing. */
export function directionAt(track: CarTrack, t: SimTime): -1 | 0 | 1 {
  const motion = motionAt(track, t);
  if (motion === undefined) return 0;
  if (t <= motion.startedAt || t >= motion.arrivesAt) return 0;
  return motion.toHeightM > motion.fromHeightM ? 1 : -1;
}

/** The floor a standing car is at, or the one a moving car left. */
export function floorIdAt(track: CarTrack, t: SimTime): string {
  const motion = motionAt(track, t);
  if (motion === undefined) return track.startFloorId;
  return t >= motion.arrivesAt ? motion.toFloorId : motion.fromFloorId;
}

export type DoorPhase = 'closed' | 'opening' | 'open' | 'closing';

/**
 * How far open the doors are at `t`, 0 shut to 1 fully open.
 *
 * Exact between kernel events, for the same reason {@link heightAt} is: the last recorded
 * {@link DoorMachineState} plus the car's own {@link DoorConfig} is all the interpolation needs.
 */
export function doorFractionAt(track: CarTrack, t: SimTime): number {
  const last = lastDoorMark(track, t);
  if (last === undefined) return 0;
  return doorOpenFractionAt(last.state, t, track.doorConfig);
}

/** Door phase at `t`. `opening`/`closing` are the two moving states, not a rounding of them. */
export function doorPhaseAt(track: CarTrack, t: SimTime): DoorPhase {
  const last = lastDoorMark(track, t);
  if (last === undefined) return 'closed';
  const fraction = doorOpenFractionAt(last.state, t, track.doorConfig);
  if (fraction <= 0) return 'closed';
  if (fraction >= 1) return 'open';
  return last.state.state === 'closing' ? 'closing' : 'opening';
}

function lastDoorMark(track: CarTrack, t: SimTime): DoorMark | undefined {
  const marks = track.doors;
  let low = 0;
  let high = marks.length - 1;
  let found: DoorMark | undefined;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = marks[mid];
    if (candidate === undefined) break;
    if (candidate.at <= t) {
      found = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * The rest of the picture, read from the finished record
 * -------------------------------------------------------------------------- */

/** Occupants and load factor per car, as a step function of time. */
export interface LoadTrack {
  readonly times: readonly number[];
  readonly occupants: readonly number[];
  readonly loadFactors: readonly number[];
}

export function buildLoadTracks(record: RunRecord): ReadonlyMap<string, LoadTrack> {
  const byCar = new Map<string, { times: number[]; occupants: number[]; loadFactors: number[] }>();
  for (const sample of record.loadSamples) {
    let track = byCar.get(sample.carId);
    if (track === undefined) {
      track = { times: [], occupants: [], loadFactors: [] };
      byCar.set(sample.carId, track);
    }
    track.times.push(sample.at);
    track.occupants.push(sample.occupants);
    track.loadFactors.push(sample.loadFactor);
  }
  return byCar;
}

export interface LoadReadingAt {
  readonly occupants: number;
  readonly loadFactor: number;
}

/** Occupancy at `t`. Zero before the first sample — a car nobody has boarded is empty. */
export function loadAt(track: LoadTrack | undefined, t: SimTime): LoadReadingAt {
  if (track === undefined) return { occupants: 0, loadFactor: 0 };
  let low = 0;
  let high = track.times.length - 1;
  let index = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if ((track.times[mid] ?? Number.POSITIVE_INFINITY) <= t) {
      index = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (index < 0) return { occupants: 0, loadFactor: 0 };
  return {
    occupants: track.occupants[index] ?? 0,
    loadFactor: track.loadFactors[index] ?? 0,
  };
}

/**
 * The landing queues and the running waiting-time mean, advanced monotonically.
 *
 * A frame only ever moves forward, so the whole run's passenger records are pre-sorted once into
 * three event streams and each frame consumes the prefix that has become due. That keeps the
 * per-frame cost proportional to what changed rather than to the size of the run.
 */
export class QueueClock {
  readonly #arrivals: readonly PassengerRecord[];
  readonly #boardings: readonly PassengerRecord[];
  #arrivalIndex = 0;
  #boardingIndex = 0;
  #waitSum = 0;
  #waitCount = 0;
  #now = 0;
  readonly #waitingUp = new Map<string, number>();
  readonly #waitingDown = new Map<string, number>();

  constructor(record: RunRecord) {
    this.#arrivals = [...record.passengers].sort((a, b) => a.arrivedAt - b.arrivedAt);
    this.#boardings = record.passengers
      .filter((passenger) => passenger.boardedAt !== undefined)
      .sort((a, b) => (a.boardedAt ?? 0) - (b.boardedAt ?? 0));
  }

  /** Advance to `t`. Must not move backwards. */
  advanceTo(t: SimTime): void {
    while (this.#arrivalIndex < this.#arrivals.length) {
      const passenger = this.#arrivals[this.#arrivalIndex];
      if (passenger === undefined || passenger.arrivedAt > t) break;
      this.#bump(passenger, 1);
      this.#arrivalIndex += 1;
    }
    while (this.#boardingIndex < this.#boardings.length) {
      const passenger = this.#boardings[this.#boardingIndex];
      if (passenger === undefined || (passenger.boardedAt ?? 0) > t) break;
      this.#bump(passenger, -1);
      this.#waitSum += (passenger.boardedAt ?? 0) - passenger.arrivedAt;
      this.#waitCount += 1;
      this.#boardingIndex += 1;
    }
    this.#now = t;
  }

  #bump(passenger: PassengerRecord, delta: number): void {
    const index = passenger.direction === 'down' ? this.#waitingDown : this.#waitingUp;
    index.set(passenger.originFloorId, (index.get(passenger.originFloorId) ?? 0) + delta);
  }

  /** People waiting at `floorId` for an up car, at the current time. */
  waitingUp(floorId: string): number {
    return this.#waitingUp.get(floorId) ?? 0;
  }

  waitingDown(floorId: string): number {
    return this.#waitingDown.get(floorId) ?? 0;
  }

  get totalWaiting(): number {
    let total = 0;
    for (const value of this.#waitingUp.values()) total += value;
    for (const value of this.#waitingDown.values()) total += value;
    return total;
  }

  /** Passengers who have boarded so far. */
  get served(): number {
    return this.#waitCount;
  }

  /**
   * Mean waiting time over everybody served so far, seconds — `NaN` before the first boarding.
   *
   * This is a *live running mean over the whole run so far*, not the windowed AWT of the final
   * summary. It is labelled that way on screen: the two answer different questions and quoting
   * one as the other is exactly the kind of confident nonsense the project is built to avoid.
   */
  get runningMeanWaitS(): number {
    return this.#waitCount === 0 ? Number.NaN : this.#waitSum / this.#waitCount;
  }

  get now(): SimTime {
    return this.#now;
  }
}
