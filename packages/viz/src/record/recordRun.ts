/**
 * Turning one replication into a {@link VizRecording}.
 *
 * This is the *only* place in the package that runs a simulation. Everything downstream —
 * `frameAt`, `frameSequence`, the playback clock, the renderer — is a pure function of the
 * recording, which is what makes "a stored run replays visually identically" a property that
 * can be checked in Node with no browser, no timers and no wall clock.
 *
 * ## Determinism
 *
 * `recordRun(config)` is deterministic in `config`, and the only source of randomness in a
 * `SimulationConfig` is its seed. So two recordings from the same config are structurally
 * identical, and two recordings whose seeds differ by one are not — both asserted in
 * `src/replay/replay.test.ts`, the second because a replay test that cannot fail proves
 * nothing.
 *
 * ## What is folded, and what is kept raw
 *
 * Car motion is kept **raw**: the `CarMotion` objects carry the `MotionProfile` the kernel
 * timed each move with, and a renderer evaluates that profile. Nothing is resampled onto a grid
 * — a grid would be an approximation of a curve the project already knows analytically, and it
 * would make the picture disagree with the statistics at exactly the moments (motor start,
 * levelling settle) where a short hop is most interesting.
 *
 * Landing queues, occupancy and the running counters are **folded into step series**, because
 * their raw form is a per-passenger event list and answering "who is waiting at floor 7 right
 * now" from it costs a scan of the whole run. Folding once, at record time, is what lets
 * `frameAt` be pure *and* fast: a scrubbing playhead moves backwards, so a stateful cursor of
 * the kind the CLI's `watch` uses is not available here.
 */

import {
  Simulation,
  type Car,
  type CarMotion,
  type Direction,
  type PassengerRecord,
  type ResolvedBuilding,
  type ResolvedCar,
  type SimTime,
  type SimulationConfig,
  type SimulationResult,
} from '@elevator-sim/core';

import { StepSeriesBuilder, constantSeries } from '../contract/series.js';
import {
  VIZ_SCHEMA_VERSION,
  type StepSeries,
  type VizFloor,
  type VizLanding,
  type VizProgress,
  type VizRecording,
  type VizShaft,
  type VizSummary,
} from '../contract/types.js';
import { instrumentCar, shortCarLabel, type CarTrack } from './instrument.js';

/** A recording plus the result it came from, for a caller that wants both. */
export interface RecordedRun {
  readonly recording: VizRecording;
  readonly result: SimulationResult;
}

/**
 * Where a car stood before the run, captured before the run.
 *
 * The whole point of this type is the word *before*. `Car.floorId` and `Car.heightM` are live
 * fields: after `Simulation.run()` returns they describe where the car **ended**, and a
 * recording that read them then told the frame producer to park every car at its final position
 * for every instant up to its first commanded move — 77 m out on Midtown Office, whose cars
 * start in the basement, and invisible on Garden Apartments, whose cars start where they end.
 * The recording was still deterministic and still replayed identically; it was simply a picture
 * of a different building. See `recordRun.test.ts` § the start-position guard.
 */
interface CarStart {
  readonly floorId: string;
  readonly heightM: number;
}

/**
 * Simulate `config` and describe the result for a screen.
 *
 * Throws whatever `Simulation.run()` throws — a `SimulationError` for a run whose conservation
 * audit failed or whose drain deadline fired. A viewer must surface that as a failure state
 * rather than draw a partial building; see `UX.md`, run viewer, error states.
 */
export function recordRun(config: SimulationConfig): RecordedRun {
  const simulation = new Simulation(config);
  const tracks = new Map<string, CarTrack>();
  const starts = new Map<string, CarStart>();
  for (const car of simulation.building.cars) {
    tracks.set(car.id, instrumentCar(car));
    // Before `run()`, not after. `car.floorId`/`car.heightM` are live. See {@link CarStart}.
    starts.set(car.id, { floorId: car.floorId, heightM: car.heightM });
  }
  const result = simulation.run();
  return {
    recording: describeRun(config.building, simulation.building.cars, tracks, starts, result),
    result,
  };
}

/* -------------------------------------------------------------------------- *
 * The fold
 * -------------------------------------------------------------------------- */

function describeRun(
  building: ResolvedBuilding,
  cars: readonly Car[],
  tracks: ReadonlyMap<string, CarTrack>,
  starts: ReadonlyMap<string, CarStart>,
  result: SimulationResult,
): VizRecording {
  const specs = resolveSpecs(building);
  const loads = loadSeries(result);

  const shafts: VizShaft[] = cars.map((car) => {
    const track = tracks.get(car.id);
    const load = loads.get(car.id);
    const spec = specs.get(car.id);
    const start = requireStart(starts, car);
    const motions = track?.motions ?? [];
    const doorMarks = track?.doorMarks ?? [];
    assertStartAgreesWithFirstMove(car.id, start, motions);
    assertNonDecreasing(car.id, 'motions', motions, (motion) => motion.commandedAt);
    assertNonDecreasing(car.id, 'doorMarks', doorMarks, (mark) => mark.at);
    return {
      carId: car.id,
      bankId: car.bankId,
      label: shortCarLabel(car.id, car.bankId),
      startFloorId: start.floorId,
      startHeightM: start.heightM,
      servedFloorIds: car.shaft.floors.map((floor) => floor.id),
      capacityPersons: spec?.capacityPersons ?? 0,
      doorConfig: car.doorConfig,
      motions,
      doorMarks,
      occupants: load?.occupants ?? constantSeries(0),
      loadFactor: load?.loadFactor ?? constantSeries(0),
    };
  });

  const { landings, progress } = foldPassengers(result.record.passengers);

  return {
    schemaVersion: VIZ_SCHEMA_VERSION,
    runId: result.runId,
    seed: result.seed,
    buildingId: building.id,
    buildingName: building.name,
    dispatcherProfileId: result.dispatcherProfileId,
    trafficProfileId: result.record.trafficProfileId,
    status: result.status,
    startedAt: result.record.startedAt,
    endedAt: result.record.endedAt,
    floors: building.floors.map(describeFloor),
    shafts,
    landings,
    progress,
    summary: describeSummary(result),
    warnings: result.warnings,
  };
}

/* -------------------------------------------------------------------------- *
 * Record-time validation
 *
 * The rule these keep is the one `StepSeriesBuilder.push` already keeps for the numeric series:
 * a recording is checked where it is *built*, not where it is read. `frameAt.motionAt` and
 * `series.lastAtOrBefore` binary-search `motions` and `doorMarks`, and a binary search over an
 * unsorted array does not fail — it returns a wrong answer, silently, at some instants and not
 * others. That is the worst failure mode this package can have, because the picture stays
 * deterministic and therefore still "replays identically".
 * -------------------------------------------------------------------------- */

function requireStart(starts: ReadonlyMap<string, CarStart>, car: Car): CarStart {
  const start = starts.get(car.id);
  if (start === undefined) {
    throw new Error(
      `recordRun: no start position was captured for car "${car.id}". Every car must be ` +
        'measured before Simulation.run(), because Car.floorId and Car.heightM are live fields.',
    );
  }
  return start;
}

/**
 * The start must be where the kernel says the car was when it first moved.
 *
 * Cheap, exact, and it needs no second source of truth: `CarMotion.fromHeightM` is the car's
 * height at the instant `departFor` was called, and nothing moves a car except `departFor`.
 */
function assertStartAgreesWithFirstMove(
  carId: string,
  start: CarStart,
  motions: readonly CarMotion[],
): void {
  const first = motions[0];
  if (first === undefined) return;
  if (start.heightM !== first.fromHeightM || start.floorId !== first.fromFloorId) {
    throw new Error(
      `recordRun: car "${carId}" is recorded as starting at ${String(start.heightM)} m ` +
        `(floor ${start.floorId}), but its first move departs ${String(first.fromHeightM)} m ` +
        `(floor ${first.fromFloorId}). A start read after the run describes where the car ` +
        'ended, and every frame before the first move would draw it there.',
    );
  }
}

function assertNonDecreasing<T>(
  carId: string,
  what: string,
  entries: readonly T[],
  timeOf: (entry: T) => SimTime,
): void {
  for (let i = 1; i < entries.length; i += 1) {
    const previous = entries[i - 1];
    const current = entries[i];
    if (previous === undefined || current === undefined) continue;
    if (timeOf(current) < timeOf(previous)) {
      throw new Error(
        `recordRun: car "${carId}" has ${what}[${String(i)}] at ${String(timeOf(current))} after ` +
          `${what}[${String(i - 1)}] at ${String(timeOf(previous))}. The frame producer binary-` +
          'searches these, so an out-of-order entry returns a wrong position rather than failing.',
      );
    }
  }
}

function describeFloor(floor: ResolvedBuilding['floors'][number]): VizFloor {
  return {
    id: floor.id,
    index: floor.index,
    heightM: floor.heightM,
    label: floor.label,
    isEntrance: floor.isEntrance === true,
    isTransferFloor: floor.isTransferFloor === true,
    population: floor.population,
  };
}

function describeSummary(result: SimulationResult): VizSummary {
  const { summary, conservation } = result;
  return {
    saturated: summary.saturation.saturated,
    awtIsValid: summary.awtIsValid,
    awtInvalidReason: summary.awtInvalidReason,
    meanWaitS: summary.waiting.meanS,
    wait95S: summary.waiting.p95S,
    meanTimeToDestinationS: summary.timeToDestination.meanS,
    generated: conservation.generated,
    delivered: conservation.delivered,
    undelivered: conservation.undelivered,
  };
}

/** Resolved car specs, keyed by both conventions a runtime `Car.id` can follow. */
function resolveSpecs(building: ResolvedBuilding): ReadonlyMap<string, ResolvedCar> {
  const specs = new Map<string, ResolvedCar>();
  for (const bank of building.banks) {
    for (const car of bank.cars) {
      specs.set(`${bank.id}-${car.id}`, car);
      if (!specs.has(car.id)) specs.set(car.id, car);
    }
  }
  return specs;
}

interface CarLoadSeries {
  readonly occupants: StepSeries;
  readonly loadFactor: StepSeries;
}

/** Occupancy per car, folded from the record's load samples. Zero before the first one. */
function loadSeries(result: SimulationResult): ReadonlyMap<string, CarLoadSeries> {
  const builders = new Map<string, { occupants: StepSeriesBuilder; loadFactor: StepSeriesBuilder }>();
  // Load samples are appended in event order, but sort explicitly rather than rely on it: the
  // builder rejects a decreasing time, and a recording must not depend on an ordering nobody
  // promised. `carId` breaks ties so the sort is total and therefore reproducible.
  const samples = [...result.record.loadSamples].sort(
    (a, b) => a.at - b.at || a.carId.localeCompare(b.carId),
  );
  for (const sample of samples) {
    let builder = builders.get(sample.carId);
    if (builder === undefined) {
      builder = { occupants: new StepSeriesBuilder(0), loadFactor: new StepSeriesBuilder(0) };
      builders.set(sample.carId, builder);
    }
    builder.occupants.push(sample.at, sample.occupants);
    builder.loadFactor.push(sample.at, sample.loadFactor);
  }
  const built = new Map<string, CarLoadSeries>();
  for (const [carId, builder] of builders) {
    built.set(carId, { occupants: builder.occupants.build(), loadFactor: builder.loadFactor.build() });
  }
  return built;
}

/** One change to the landing queues. */
interface QueueEvent {
  readonly at: SimTime;
  /** `1` somebody joined the landing, `-1` somebody boarded. */
  readonly delta: 1 | -1;
  readonly floorId: string;
  readonly direction: Direction;
  /** Seconds this passenger waited, on the boarding event only. */
  readonly waitS: number;
  /** Tie-break, so events at the same instant fold in a reproducible order. */
  readonly passengerId: string;
}

interface FoldedPassengers {
  readonly landings: readonly VizLanding[];
  readonly progress: VizProgress;
}

/**
 * Fold the passenger records into per-landing queues and the three headline counters.
 *
 * Arrivals and boardings are merged into one time-ordered stream and replayed once. Ties are
 * broken by `(time, delta, passengerId)` — deterministically, and with boardings (`-1`) before
 * arrivals (`+1`) at the same instant, so a landing that empties and refills at the same
 * simulated second reads as `0` at that second rather than as a phantom queue of two.
 */
function foldPassengers(passengers: readonly PassengerRecord[]): FoldedPassengers {
  const events: QueueEvent[] = [];
  for (const passenger of passengers) {
    events.push({
      at: passenger.arrivedAt,
      delta: 1,
      floorId: passenger.originFloorId,
      direction: passenger.direction,
      waitS: 0,
      passengerId: passenger.passengerId,
    });
    if (passenger.boardedAt !== undefined) {
      events.push({
        at: passenger.boardedAt,
        delta: -1,
        floorId: passenger.originFloorId,
        direction: passenger.direction,
        waitS: passenger.boardedAt - passenger.arrivedAt,
        passengerId: passenger.passengerId,
      });
    }
  }
  events.sort(
    (a, b) => a.at - b.at || a.delta - b.delta || a.passengerId.localeCompare(b.passengerId),
  );

  const landingBuilders = new Map<string, StepSeriesBuilder>();
  const landingKeys = new Map<string, { floorId: string; direction: Direction }>();
  const counts = new Map<string, number>();

  const waiting = new StepSeriesBuilder(0);
  const boardedLegs = new StepSeriesBuilder(0);
  const meanWait = new StepSeriesBuilder(0);

  let totalWaiting = 0;
  let boardedCount = 0;
  let waitSum = 0;

  for (const event of events) {
    const key = `${event.floorId} ${event.direction}`;
    let builder = landingBuilders.get(key);
    if (builder === undefined) {
      builder = new StepSeriesBuilder(0);
      landingBuilders.set(key, builder);
      landingKeys.set(key, { floorId: event.floorId, direction: event.direction });
    }
    const next = (counts.get(key) ?? 0) + event.delta;
    counts.set(key, next);
    builder.push(event.at, next);

    totalWaiting += event.delta;
    if (event.delta === -1) {
      boardedCount += 1;
      waitSum += event.waitS;
    }
    waiting.push(event.at, totalWaiting);
    boardedLegs.push(event.at, boardedCount);
    meanWait.push(event.at, boardedCount === 0 ? 0 : waitSum / boardedCount);
  }

  const landings: VizLanding[] = [];
  for (const [key, builder] of landingBuilders) {
    const identity = landingKeys.get(key);
    if (identity === undefined) continue;
    landings.push({
      floorId: identity.floorId,
      direction: identity.direction,
      waiting: builder.build(),
    });
  }
  // Sorted so two recordings of the same run agree element for element, whatever order the
  // `Map` was populated in. Invariant 4's rule, applied to a display artefact: never let a hash
  // structure's iteration order decide what a comparison sees.
  landings.sort((a, b) => a.floorId.localeCompare(b.floorId) || a.direction.localeCompare(b.direction));

  return {
    landings,
    progress: {
      waiting: waiting.build(),
      boardedLegs: boardedLegs.build(),
      meanWaitS: meanWait.build(),
    },
  };
}
