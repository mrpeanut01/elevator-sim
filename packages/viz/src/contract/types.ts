/**
 * The rendering contract: the seam between a simulation run and anything that draws it.
 *
 * ## What a renderer consumes, and why it is not a live `Simulation`
 *
 * A renderer consumes a {@link VizRecording} — a finished, serialisable, seed-bearing
 * description of one replication. It never consumes a live `Simulation`, and the reason is
 * structural rather than stylistic.
 *
 * `Simulation.run()` is one synchronous call that returns when the whole replication is over.
 * There is no live clock inside it to sample, and there could not be one: CLAUDE.md invariant 3
 * says no wall-clock time in `core/`, so `core` has no notion of "now, at 60 Hz". A renderer
 * that wanted to drive the kernel would have to invert that control, which means either a tick
 * loop (destroying the discrete-event guarantee) or a wall clock inside `core` (destroying
 * invariant 3). Both are worse than the alternative, which costs nothing: a replication of a
 * shipped building simulates in milliseconds, so the run happens *first* and playback samples
 * the result.
 *
 * That choice is what makes Phase 4's acceptance criterion mechanically checkable. "A stored
 * run replays visually identically" is, under this contract, the statement that
 * `frameAt(recording, t)` is a pure function and that `recordRun(config)` is deterministic in
 * the seed — both of which are testable in Node with no browser and no timers. See
 * `src/replay/replay.test.ts`.
 *
 * ## Why the recording is not the `RunRecord`
 *
 * A `RunRecord` is a statistical dataset. It carries passenger legs, load samples and queue
 * samples — but *not* where a car was at 12.34 s, because no statistic needs that. The
 * ingredients of `Car.positionAt` are per-move values (`fromHeightM` plus the `MotionProfile`
 * the kernel timed the move with) and they live on the {@link CarMotion} objects `departFor`
 * returns, which the record has no reason to keep.
 *
 * So a recording is a *second* projection of the same run, aimed at a screen instead of at a
 * confidence interval. It is derived from the run and from nothing else: every number in it is
 * either a `CarMotion`/`DoorMachineState` the kernel produced, or a step series folded out of
 * the `RunRecord`'s own passenger and load samples. The picture and the statistics therefore
 * cannot disagree, because there is only one source.
 *
 * ## Time
 *
 * Every time in this file is **simulated seconds**, sourced from the kernel, exactly as
 * everywhere else in the project. Display time — milliseconds off a wall clock or a test's
 * fake clock — appears only in `src/playback/`, which converts one to the other and is the
 * single place in the package where the two meet. Nothing here knows what a frame rate is.
 */

import type {
  CarMotion,
  Direction,
  DoorConfig,
  DoorMachineState,
  SimTime,
  SimulationStatus,
} from '@elevator-sim/core';

/**
 * Bumped when the shape below changes incompatibly.
 *
 * A recording is serialisable on purpose — the replay harness round-trips one through JSON
 * before sampling it, so a field that cannot survive `JSON.parse(JSON.stringify(x))` is a test
 * failure rather than a surprise in wave 2.
 */
export const VIZ_SCHEMA_VERSION = 1;

/* -------------------------------------------------------------------------- *
 * Geometry
 * -------------------------------------------------------------------------- */

/** One floor, as a renderer needs it: an id, a height, and the two flags that get a badge. */
export interface VizFloor {
  readonly id: string;
  readonly index: number;
  /** Height above datum, metres. May be negative — basements exist. */
  readonly heightM: number;
  readonly label?: string | undefined;
  readonly isEntrance: boolean;
  readonly isTransferFloor: boolean;
  readonly population: number;
}

/* -------------------------------------------------------------------------- *
 * Step series
 * -------------------------------------------------------------------------- */

/**
 * A right-continuous step function of simulated time, as two parallel arrays.
 *
 * `times` is strictly increasing. The value at `t` is `values[i]` for the greatest `i` with
 * `times[i] <= t`, and {@link StepSeries.before} for `t` earlier than every entry. Parallel
 * arrays rather than an array of pairs because a recording of a busy building holds tens of
 * thousands of these points and the flat form serialises to less than half the JSON.
 *
 * Sampled by `stepValueAt`, which binary-searches. That is what keeps {@link Frame} production
 * a *pure* function of `(recording, t)` rather than a stateful cursor that only works if frames
 * are requested in order — a scrubbing playhead moves backwards, and so does a replay test that
 * samples the same instant twice.
 */
export interface StepSeries {
  readonly times: readonly SimTime[];
  readonly values: readonly number[];
  /** Value before the first entry. */
  readonly before: number;
}

/* -------------------------------------------------------------------------- *
 * Cars
 * -------------------------------------------------------------------------- */

/** The door state machine as it stood at `at`; between two marks the fraction is interpolated. */
export interface VizDoorMark {
  readonly at: SimTime;
  readonly state: DoorMachineState;
}

/**
 * One shaft, and everything its car did.
 *
 * {@link motions} is the whole point of the contract: each entry carries the `MotionProfile`
 * the kernel timed that move with, so a renderer evaluates
 * `fromHeightM + positionAt(profile, t - startedAt)` and gets the car's *analytic* position —
 * the same arithmetic `Car.positionAt` performs, including the motor-start delay and the
 * levelling settle, because the profile clamps at both ends. Nothing is interpolated between
 * kernel events; the S-curve is evaluated.
 */
export interface VizShaft {
  readonly carId: string;
  readonly bankId: string;
  /** `carId` with the redundant bank prefix removed, for a narrow column header. */
  readonly label: string;
  readonly startFloorId: string;
  readonly startHeightM: number;
  /** Floor ids this shaft physically serves — service zoning, not access and not operational. */
  readonly servedFloorIds: readonly string[];
  /** Rated capacity in persons, for turning a load factor back into a crowd. */
  readonly capacityPersons: number;
  readonly doorConfig: DoorConfig;
  readonly motions: readonly CarMotion[];
  readonly doorMarks: readonly VizDoorMark[];
  /** Occupants aboard, as a step function. From the record's load samples. */
  readonly occupants: StepSeries;
  /** `massKg / ratedLoadKg`. Can exceed 1: 1.1 is the overload alarm, not the ceiling. */
  readonly loadFactor: StepSeries;
}

/* -------------------------------------------------------------------------- *
 * Landings and progress
 * -------------------------------------------------------------------------- */

/** How many people stand at one landing wanting one direction, as a step function. */
export interface VizLanding {
  readonly floorId: string;
  readonly direction: Direction;
  readonly waiting: StepSeries;
}

/**
 * The three headline counters, as step functions of simulated time.
 *
 * {@link meanWaitS} is a **running mean over everybody served so far**, not the windowed AWT of
 * the summary. The two answer different questions and quoting one as the other is exactly the
 * confident nonsense this project is built to avoid, so the field is named for what it is and
 * `Frame.runningMeanWaitS` is `undefined` — not zero — until somebody has actually boarded.
 */
export interface VizProgress {
  readonly waiting: StepSeries;
  readonly served: StepSeries;
  readonly meanWaitS: StepSeries;
}

/* -------------------------------------------------------------------------- *
 * The recording
 * -------------------------------------------------------------------------- */

/**
 * Statistics a viewer may show, and the one flag that decides whether it may show them.
 *
 * {@link awtIsValid} is copied from `RunSummary` rather than recomputed. A viewer that renders
 * `meanS` while this is `false` is reporting a mean for a system whose queues grow without
 * bound; the UX inventory makes suppressing it a required state, not a nicety.
 */
export interface VizSummary {
  readonly saturated: boolean;
  readonly awtIsValid: boolean;
  readonly awtInvalidReason?: string | undefined;
  readonly meanWaitS: number;
  readonly wait95S: number;
  readonly meanTimeToDestinationS: number;
  readonly generated: number;
  readonly delivered: number;
  readonly undelivered: number;
}

/**
 * One replication, as a renderer sees it. Serialisable, and self-sufficient.
 *
 * Carries {@link seed} because CLAUDE.md invariant 5 says every persisted run record does, and
 * because the replay harness re-derives the whole recording from it: a recording whose seed did
 * not reproduce it would be decorative, and `replay.test.ts` proves it is not by tampering with
 * the seed and requiring the frames to change.
 */
export interface VizRecording {
  readonly schemaVersion: number;
  readonly runId: string;
  /** Master seed as a decimal string, matching `RunRecord.seed`. Invariant 5. */
  readonly seed: string;
  readonly buildingId: string;
  readonly buildingName: string;
  readonly dispatcherProfileId: string;
  readonly trafficProfileId?: string | undefined;
  readonly status: SimulationStatus;
  /** Simulated time the run started. */
  readonly startedAt: SimTime;
  /** Simulated time the run stopped. Exclusive, matching `RunRecord.endedAt`. */
  readonly endedAt: SimTime;
  readonly floors: readonly VizFloor[];
  readonly shafts: readonly VizShaft[];
  readonly landings: readonly VizLanding[];
  readonly progress: VizProgress;
  readonly summary: VizSummary;
  /** Non-fatal diagnostics from the run, for the viewer's warning strip. */
  readonly warnings: readonly string[];
}

/* -------------------------------------------------------------------------- *
 * Frames
 * -------------------------------------------------------------------------- */

/** Signed direction of travel: `1` up, `-1` down, `0` standing. */
export type TravelDirection = -1 | 0 | 1;

/** `opening` and `closing` are the two moving states, not a rounding of the fraction. */
export type DoorPhase = 'closed' | 'opening' | 'open' | 'closing';

/** One car, at one instant. */
export interface FrameCar {
  readonly carId: string;
  readonly bankId: string;
  readonly label: string;
  /** Height above datum, metres — the analytic S-curve position, not an interpolation. */
  readonly heightM: number;
  /** The floor a standing car is at, or the one a moving car left. */
  readonly floorId: string;
  readonly direction: TravelDirection;
  /** 0 shut to 1 fully open. */
  readonly doorFraction: number;
  readonly doorPhase: DoorPhase;
  readonly occupants: number;
  readonly loadFactor: number;
}

/** One landing, at one instant. */
export interface FrameLanding {
  readonly floorId: string;
  readonly waitingUp: number;
  readonly waitingDown: number;
}

/**
 * Everything on screen at one instant of simulated time.
 *
 * Deliberately a plain data value with no methods and no references back into the recording: it
 * is what a renderer draws, what a test serialises and compares, and what a future transport
 * (a worker, a socket) could post. Two frames produced from the same recording at the same `t`
 * are `===`-equal after `JSON.stringify`, and that is the property Phase 4's acceptance
 * criterion reduces to.
 */
export interface Frame {
  readonly schemaVersion: number;
  readonly runId: string;
  /** Simulated seconds. Clamped to `[recording.startedAt, recording.endedAt]`. */
  readonly simTimeS: SimTime;
  readonly cars: readonly FrameCar[];
  readonly landings: readonly FrameLanding[];
  readonly totalWaiting: number;
  readonly served: number;
  /** Running mean wait over everybody served so far. `undefined` before the first boarding. */
  readonly runningMeanWaitS: number | undefined;
}
