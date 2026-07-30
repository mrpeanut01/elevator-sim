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
  resolveDemandTemplate,
  type Car,
  type CarMotion,
  type Direction,
  type PassengerRecord,
  type ResolvedBuilding,
  type ResolvedCar,
  type ResolvedDemandTemplate,
  type SimTime,
  type SimulationConfig,
  type SimulationResult,
} from '@elevator-sim/core/browser';

import { StepSeriesBuilder, constantSeries } from '../contract/series.js';
import {
  VIZ_SCHEMA_VERSION,
  type StepSeries,
  type VizFloor,
  type VizLanding,
  type VizLeg,
  type VizDecision,
  type VizPhase,
  type VizProgress,
  type VizRecording,
  type VizShaft,
  type VizSummary,
} from '../contract/types.js';
import { DecisionCollector, recordingPolicyFactory } from './decisionLog.js';
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
 * What the caller may ask of a recording beyond the run itself.
 *
 * Both fields describe the *recording*, not the simulation — except {@link outOfServiceCarIds},
 * which describes both, and says so.
 */
export interface RecordRunOptions {
  /**
   * Capture the dispatch decisions. Default `true`.
   *
   * Turned off by the replication batch, where fifty runs' worth of decisions would be carried
   * to a report that shows none of them. It is a recording-size switch and nothing else: an
   * instrumented run and an uninstrumented one produce equal `RunRecord`s, which
   * `decisionLog.test.ts` asserts rather than assumes.
   *
   * Ignored — and a `config.createPolicy` the caller supplied is left alone — when the caller has
   * already claimed the hook. Two wrappers on one policy is a silently different run.
   */
  readonly recordDecisions?: boolean | undefined;
  /**
   * Runtime car ids to hold **out of service** for the whole run.
   *
   * Set through `Car.setMode` before `run()`, so `estimateCost` refuses the car with
   * `infeasibleReason: 'serviceMode'` and the group dispatches around it with no new branch
   * anywhere. This is the handoff's *click the badge under a shaft* (§ 1.5 B7) reaching the
   * simulator: a car a reader takes out of service is genuinely out of service, and the day's
   * figures are the figures of a group one car short.
   *
   * An id that matches no car is an error rather than a no-op — a typo that silently ran the full
   * group would be reported as the reduced one.
   */
  readonly outOfServiceCarIds?: readonly string[] | undefined;
}

/**
 * Simulate `config` and describe the result for a screen.
 *
 * Throws whatever `Simulation.run()` throws — a `SimulationError` for a run whose conservation
 * audit failed or whose drain deadline fired. A viewer must surface that as a failure state
 * rather than draw a partial building; see `UX.md`, run viewer, error states.
 */
export function recordRun(config: SimulationConfig, options: RecordRunOptions = {}): RecordedRun {
  const wanted = options.recordDecisions ?? true;
  const collector = new DecisionCollector();
  // Only when the caller has not already claimed the hook. See {@link RecordRunOptions}.
  const instrumented = wanted && config.createPolicy === undefined;
  const effective: SimulationConfig = instrumented
    ? { ...config, createPolicy: recordingPolicyFactory(collector) }
    : config;

  const simulation = new Simulation(effective);
  const outOfService = applyOutOfService(simulation, options.outOfServiceCarIds ?? []);
  const tracks = new Map<string, CarTrack>();
  const starts = new Map<string, CarStart>();
  for (const car of simulation.building.cars) {
    tracks.set(car.id, instrumentCar(car));
    // Before `run()`, not after. `car.floorId`/`car.heightM` are live. See {@link CarStart}.
    starts.set(car.id, { floorId: car.floorId, heightM: car.heightM });
  }
  const result = simulation.run();
  return {
    recording: describeRun(config.building, simulation.building.cars, tracks, starts, result, {
      decisions: instrumented ? collector.build() : [],
      phases: describePhases(config, result),
      outOfServiceCarIds: outOfService,
    }),
    result,
  };
}

/**
 * Put the named cars out of service, before the run.
 *
 * Returns the ids actually set, sorted, so the recording carries what happened rather than what
 * was asked for. Throws on an id that names no car: see {@link RecordRunOptions}.
 */
function applyOutOfService(simulation: Simulation, ids: readonly string[]): readonly string[] {
  if (ids.length === 0) return [];
  const byId = new Map(simulation.building.cars.map((car) => [car.id, car]));
  const applied: string[] = [];
  for (const id of ids) {
    const car = byId.get(id);
    if (car === undefined) {
      throw new Error(
        `recordRun: "${id}" was asked to be out of service, but this building has no such car. ` +
          `Known cars: ${[...byId.keys()].join(', ')}. A run that quietly ignored the request ` +
          'would report the full group’s figures as the reduced group’s.',
      );
    }
    car.setMode('out-of-service');
    applied.push(id);
  }
  applied.sort((a, b) => a.localeCompare(b));
  return applied;
}

/**
 * The run's demand schedule, as the transport timeline needs it.
 *
 * Resolved through `core`'s own `resolveDemandTemplate` from the same `demandTemplate` field the
 * run was configured with, so these are the segments the generator drew from. A template that
 * cannot be resolved yields an **empty** list rather than an invented one — the timeline draws a
 * single unlabelled band and says nothing it cannot support. See {@link VizPhase}.
 */
function describePhases(config: SimulationConfig, result: SimulationResult): readonly VizPhase[] {
  let template: ResolvedDemandTemplate;
  try {
    template = resolveDemandTemplate(
      config.demandTemplate ?? 'rise-and-fall',
      config.trafficProfiles.demandTemplates,
    );
  } catch {
    return [];
  }
  const scale = scaleOf(config.durationS, template.durationS);
  const population = result.record.population;
  const nominal = nominalRateOf(config, result);
  return template.phases.map((phase, index): VizPhase => {
    const startS = phase.startS * scale;
    const endS = phase.endS * scale;
    const mid = (phase.startIntensity + phase.endIntensity) / 2;
    const kind = kindOf(phase.startIntensity, phase.endIntensity);
    return {
      id: `${String(index)}-${kind}`,
      kind,
      label: labelOfPhase(kind, phase.startIntensity, phase.endIntensity),
      startS,
      endS,
      startIntensity: phase.startIntensity,
      endIntensity: phase.endIntensity,
      // Absent, not zero, when the run's record carries no population: see {@link VizPhase}.
      ratePctPop5min: nominal === null || population === undefined ? null : nominal * mid,
      inReportWindow:
        endS > result.reportWindow.startS && startS < result.reportWindow.endS,
    };
  });
}

/**
 * A template resolved at its own duration, stretched onto the run's.
 *
 * `SimulationConfig.durationS` overrides the template's own horizon, and the generator scales the
 * phase knots with it. Doing the same here rather than drawing the template's unscaled seconds is
 * what stops a 1 800 s run from being labelled with a 1 800 s timeline whose peak sits at the
 * 30-minute template's 600 s mark.
 */
function scaleOf(durationS: number | undefined, templateDurationS: number): number {
  if (durationS === undefined || templateDurationS <= 0) return 1;
  return durationS / templateDurationS;
}

/**
 * Peak demand in percent of population per five minutes, or `null` when the run cannot say.
 *
 * Read off the *offered* demand the run actually recorded rather than off the profile, so a
 * `demand.arrivalRatePctPop5min` override — which is how the compare surface sweeps to saturation
 * — is reflected instead of contradicted.
 */
function nominalRateOf(config: SimulationConfig, result: SimulationResult): number | null {
  const override = config.demand?.arrivalRatePctPop5min;
  if (override !== undefined && Number.isFinite(override)) return override;
  const offered = result.summary.handlingCapacity.offeredPer5Min;
  const population = result.record.population;
  if (population === undefined || population <= 0 || !Number.isFinite(offered)) return null;
  // `offeredPer5Min` is averaged over the whole run, so dividing by the template's mean intensity
  // recovers the peak rate the phases are fractions of.
  const meanIntensity = meanIntensityOf(config, result);
  if (meanIntensity <= 0) return null;
  return ((offered / population) * 100) / meanIntensity;
}

function meanIntensityOf(config: SimulationConfig, result: SimulationResult): number {
  try {
    const template = resolveDemandTemplate(
      config.demandTemplate ?? 'rise-and-fall',
      config.trafficProfiles.demandTemplates,
    );
    if (template.durationS <= 0) return 1;
    return template.intensityIntegralS / template.durationS;
  } catch {
    void result;
    return 1;
  }
}

function kindOf(start: number, end: number): VizPhase['kind'] {
  if (end > start) return 'ramp-up';
  if (end < start) return 'ramp-down';
  return start >= 1 ? 'hold' : 'flat';
}

/**
 * A phrase short enough to survive a narrow segment, and true at both ends.
 *
 * `PEAK` is reserved for a segment that actually holds the template's peak intensity — a
 * `constant-iso` run holds at 1.0 for two hours and is `STEADY`, not a two-hour peak, because
 * calling it one would tell a reader the building is under a rush it is not under.
 */
function labelOfPhase(kind: VizPhase['kind'], start: number, end: number): string {
  switch (kind) {
    case 'ramp-up':
      return 'FILLING';
    case 'ramp-down':
      return 'EASING';
    case 'hold':
      return 'PEAK';
    default:
      return start === 0 && end === 0 ? 'QUIET' : 'STEADY';
  }
}

/* -------------------------------------------------------------------------- *
 * The fold
 * -------------------------------------------------------------------------- */

/** The version-7 facts the fold cannot derive, gathered by {@link recordRun} around the run. */
interface RecordedExtras {
  readonly decisions: readonly VizDecision[];
  readonly phases: readonly VizPhase[];
  readonly outOfServiceCarIds: readonly string[];
}

function describeRun(
  building: ResolvedBuilding,
  cars: readonly Car[],
  tracks: ReadonlyMap<string, CarTrack>,
  starts: ReadonlyMap<string, CarStart>,
  result: SimulationResult,
  extras: RecordedExtras,
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
  const legs = describeLegs(result.record.passengers);

  return {
    schemaVersion: VIZ_SCHEMA_VERSION,
    runId: result.runId,
    seed: result.seed,
    buildingId: building.id,
    buildingName: building.name,
    dispatcherProfileId: result.dispatcherProfileId,
    trafficProfileId: result.record.trafficProfileId,
    // `RunRecord.passengerModel` is omitted rather than written when the run is conventional —
    // `Simulation` only stamps it for a destination-dispatch run, so a version-1 record still
    // parses. `conventional` is therefore the honest reading of its absence, not a fallback.
    passengerModel: result.record.passengerModel ?? 'conventional',
    status: result.status,
    startedAt: result.record.startedAt,
    endedAt: result.record.endedAt,
    floors: building.floors.map(describeFloor),
    shafts,
    landings,
    legs,
    progress,
    summary: describeSummary(result),
    demandPhases: extras.phases,
    decisions: extras.decisions,
    outOfServiceCarIds: extras.outOfServiceCarIds,
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

/**
 * `NaN` in, `null` out — the one place the contract's absence convention is applied.
 *
 * `core` says *"not measured"* with `NaN` so an absent measurement cannot arrive disguised as a
 * zero. A recording says it with `null` so the same fact survives `JSON.stringify`, which turns
 * `NaN` into `null` anyway and would otherwise leave a **loaded** recording holding a `null` that
 * the type says is a `number`. See the {@link VizSummary} block comment in `contract/types.ts`.
 *
 * `Infinity` is caught by the same guard for the same reason — `JSON.stringify(Infinity)` is also
 * `null` — rather than left to arrive as a number no `toFixed` should be called on.
 */
function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function describeSummary(result: SimulationResult): VizSummary {
  const { summary, conservation } = result;
  const { waiting, handlingCapacity, achievedInterval, serviceLevel, energy } = summary;
  return {
    saturated: summary.saturation.saturated,
    awtIsValid: summary.awtIsValid,
    awtInvalidReason: summary.awtInvalidReason,
    /*
     * Version 8, and copied on the line under the prose it belongs to rather than filed with the
     * version-5 block below, because the two halves of one refusal are one datum. `core` emits both
     * or neither — `metrics/summarize.ts` spreads the pair out of a single `AwtInvalidity` — so
     * copying them adjacently and unconditionally is what keeps *"present exactly when the reason
     * is"* true here without this file re-deciding anything. It is never re-derived from
     * `saturated`/`waitCount`/`unservedCount`, which is the whole reason `core` publishes it.
     */
    awtInvalidGround: summary.awtInvalidGround,
    meanWaitS: waiting.meanS,
    wait95S: waiting.p95S,
    meanTimeToDestinationS: summary.timeToDestination.meanS,
    generated: conservation.generated,
    delivered: conservation.delivered,
    undelivered: conservation.undelivered,

    // Version 5. Every field here is copied from the summary `core` already produced — never
    // recomputed from the recording's own arrays, which would be a second source of truth about
    // a question the metrics module has answered, on a different window.
    reportWindow: {
      id: summary.window.id,
      startS: summary.window.startS,
      endS: summary.window.endS,
    },
    windowSeconds: summary.windowSeconds,
    waitCount: waiting.count,
    timeToDestinationCount: summary.timeToDestination.count,
    pctOverLongWait: finiteOrNull(waiting.pctOverLongWait),
    longWaitThresholdS: waiting.longWaitThresholdS,
    unservedCount: waiting.unservedCount,
    handlingCapacity: {
      personsPer5Min: handlingCapacity.personsPer5Min,
      offeredPer5Min: handlingCapacity.offeredPer5Min,
      // Absent, not zero: a building whose record carries no population has no `%POP`, and a
      // `0 %` there would read as "nobody moved".
      pctPopulationPer5Min:
        handlingCapacity.pctPopulationPer5Min === undefined
          ? null
          : finiteOrNull(handlingCapacity.pctPopulationPer5Min),
    },
    achievedInterval: {
      meanS: finiteOrNull(achievedInterval.meanS),
      coefficientOfVariation: finiteOrNull(achievedInterval.coefficientOfVariation),
      count: achievedInterval.count,
    },
    serviceLevel: {
      verdict: serviceLevel.verdict,
      longestWaitS: finiteOrNull(serviceLevel.longestWaitS),
      longestWaitIsCensored: serviceLevel.longestWaitIsCensored,
      overHorizonCount: serviceLevel.overHorizonCount,
      arrivalCount: serviceLevel.arrivalCount,
      horizonS: serviceLevel.horizonS,
    },
    energy: {
      measured: energy.measured,
      workKJ: finiteOrNull(energy.workKJ),
      workPerServedLegKJ: finiteOrNull(energy.workPerServedLegKJ),
      // The denominator of `workPerServedLegKJ`, which `EnergyStatistics` divides by and does not
      // publish. `summarize.ts` passes `counts.alighted` as its `servedLegCount`, so this is that
      // same number rather than a second reading of it.
      deliveredLegCount: summary.counts.alighted,
      distanceM: finiteOrNull(energy.distanceM),
      starts: finiteOrNull(energy.starts),
    },
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

/**
 * The per-leg projection the fold cannot give back.
 *
 * Ten fields of `PassengerRecord`, not fifteen: see {@link VizLeg} for what is left out and
 * why. Sorted by `(arrivedAt, passengerId)` so the array's order is total and reproducible —
 * `result.record.passengers` is in generation order, which is deterministic but is not an order
 * anything downstream may binary-search or compare against.
 *
 * `boardedAt`, `carId`, `bankId`, `assignedCarId` and `credentialGroup` are written as *absent*
 * rather than as
 * `undefined` values when the record has none, because a recording round-trips through JSON in
 * the replay harness and `JSON.stringify` drops `undefined` — a recording that carried explicit
 * `undefined`s would not equal itself after the trip. `recordRun.test.ts` § *survives a JSON
 * round trip unchanged* is the test that says so.
 */
function describeLegs(passengers: readonly PassengerRecord[]): readonly VizLeg[] {
  const legs = passengers.map((passenger): VizLeg => {
    const leg: {
      -readonly [K in keyof VizLeg]: VizLeg[K];
    } = {
      passengerId: passenger.passengerId,
      originFloorId: passenger.originFloorId,
      destinationFloorId: passenger.destinationFloorId,
      direction: passenger.direction,
      arrivedAt: passenger.arrivedAt,
    };
    if (passenger.boardedAt !== undefined) leg.boardedAt = passenger.boardedAt;
    if (passenger.alightedAt !== undefined) leg.alightedAt = passenger.alightedAt;
    if (passenger.carId !== undefined) leg.carId = passenger.carId;
    if (passenger.bankId !== undefined) leg.bankId = passenger.bankId;
    if (passenger.assignedCarId !== undefined) leg.assignedCarId = passenger.assignedCarId;
    if (passenger.credentialGroup !== undefined) leg.credentialGroup = passenger.credentialGroup;
    return leg;
  });
  legs.sort((a, b) => a.arrivedAt - b.arrivedAt || a.passengerId.localeCompare(b.passengerId));
  return legs;
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
    const key = `${event.floorId}\u0000${event.direction}`;
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
