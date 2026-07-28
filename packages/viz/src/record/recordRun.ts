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
 * Simulate `config` and describe the result for a screen.
 *
 * Throws whatever `Simulation.run()` throws — a `SimulationError` for a run whose conservation
 * audit failed or whose drain deadline fired. A viewer must surface that as a failure state
 * rather than draw a partial building; see `UX.md`, run viewer, error states.
 */
export function recordRun(config: SimulationConfig): RecordedRun {
  const simulation = new Simulation(config);
  const tracks = new Map<string, CarTrack>();
  for (const car of simulation.building.cars) {
    tracks.set(car.id, instrumentCar(car));
  }
  const result = simulation.run();
  return {
    recording: describeRun(config.building, simulation.building.cars, tracks, result),
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
  result: SimulationResult,
): VizRecording {
  const specs = resolveSpecs(building);
  const loads = loadSeries(result);

  const shafts: VizShaft[] = cars.map((car) => {
    const track = tracks.get(car.id);
    const load = loads.get(car.id);
    const spec = specs.get(car.id);
    return {
      carId: car.id,
      bankId: car.bankId,
      label: shortCarLabel(car.id, car.bankId),
      startFloorId: car.floorId,
      startHeightM: car.heightM,
      servedFloorIds: car.shaft.floors.map((floor) => floor.id),
      capacityPersons: spec?.capacityPersons ?? 0,
      doorConfig: car.doorConfig,
      motions: track?.motions ?? [],
      doorMarks: track?.doorMarks ?? [],
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
  const served = new StepSeriesBuilder(0);
  const meanWait = new StepSeriesBuilder(0);

  let totalWaiting = 0;
  let servedCount = 0;
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
      servedCount += 1;
      waitSum += event.waitS;
    }
    waiting.push(event.at, totalWaiting);
    served.push(event.at, servedCount);
    meanWait.push(event.at, servedCount === 0 ? 0 : waitSum / servedCount);
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
    progress: { waiting: waiting.build(), served: served.build(), meanWaitS: meanWait.build() },
  };
}
