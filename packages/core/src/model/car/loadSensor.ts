/**
 * The load-weighing device.
 *
 * Real load cells sit under the car platform and read one number: **mass**. Everything this
 * module does follows from taking that literally.
 *
 * ## It sums masses, it does not count people
 *
 * `loadFactor = currentMassKg / ratedLoadKg`, where `currentMassKg` is the sum of the actual
 * masses of the people aboard — each drawn from the injected `StreamSet`'s `passengerMass`
 * stream by `PassengerFactory`. Counting heads and multiplying by a nominal 75 kg would make
 * the sensor a deterministic function of occupancy and leave it with nothing to measure,
 * which is exactly the modelling error CLAUDE.md calls out ("passenger mass is a
 * distribution, not a constant"). Sixteen light passengers and sixteen heavy ones are the
 * same count and different loads, and only one of them trips the alarm.
 *
 * ## The two thresholds are production features, not inventions
 *
 * From docs/02-elevator-reference.md § Load weighing behavior:
 *
 * | Threshold | Behaviour |
 * |---|---|
 * | ~80% of rated load | **Hall call bypass** — the car stops answering *new hall calls* and serves only its car calls. This is the "skip floors that have been called" feature. |
 * | ~110% of rated load | **Overload alarm** — doors held open, the car will not start. |
 *
 * Both are tunable from data (`data/elevator-specs.json → loadSensor`, overridable per
 * dispatcher profile at `answer.bypassLoadThreshold` / `answer.overloadThreshold`) and both
 * declare their schema in {@link LOAD_SENSOR_PARAMETERS} — CLAUDE.md invariants 7 and 8.
 *
 * ## Design load is a third, different number
 *
 * `designLoadFactor` is 0.8 and is **not** the bypass threshold, even though both are 0.8 by
 * default. Design load is a *traffic-analysis assumption* — cars fill to 80% of rated
 * capacity because people do not pack in — and it sizes the RTT oracle and the handling
 * capacity calculation. Bypass is a *control decision* the operator can retune. They are
 * separate fields because tuning one must not silently move the other; using 1.0 for either
 * makes the simulator systematically optimistic.
 *
 * Nothing here reads a wall clock or draws a random number.
 */

import type { AnswerStageConfig, LoadSensorConfig, ResolvedCar } from '../../config/types.js';
import { ModelError } from '../types.js';

import type { CarLoadSnapshot, CarParameterSpec } from './types.js';

/* -------------------------------------------------------------------------- *
 * Configuration
 * -------------------------------------------------------------------------- */

/**
 * Runtime defaults, used when neither `data/elevator-specs.json → loadSensor` nor a
 * dispatcher profile's answer stage supplies a value.
 *
 * The numbers match the reference file exactly; this object is the single source of truth
 * that {@link LOAD_SENSOR_PARAMETERS} quotes, so the declared schema and the resolver can
 * never disagree.
 */
export const LOAD_SENSOR_DEFAULTS = Object.freeze({
  /** Hall-call bypass. docs/02-elevator-reference.md § Load weighing behavior. */
  bypassLoadThreshold: 0.8,
  /** Overload alarm: doors held, the car will not start. */
  overloadThreshold: 1.1,
  /** Traffic-analysis fill assumption. Never 1.0. */
  designLoadFactor: 0.8,
  /** EN 81's 75 kg per person, used only to *project* a load that has not happened yet. */
  nominalPassengerMassKg: 75,
} as const satisfies {
  readonly bypassLoadThreshold: number;
  readonly overloadThreshold: number;
  readonly designLoadFactor: number;
  readonly nominalPassengerMassKg: number;
});

/** Every number the load sensor needs, already resolved. Built by {@link resolveLoadSensor}. */
export interface ResolvedLoadSensorConfig {
  /** Rated load in kilograms. The denominator of every load factor. */
  readonly ratedLoadKg: number;
  /** Persons at rated load, from the `ratedLoadLb / 150` convention. */
  readonly capacityPersons: number;
  /** Fraction of rated capacity traffic analysis assumes a car fills to. */
  readonly designLoadFactor: number;
  /** Load fraction at which new hall calls are refused. */
  readonly bypassLoadThreshold: number;
  /** Load fraction at which the doors are held and the car will not start. */
  readonly overloadThreshold: number;
  /** Mean body mass used to project a boarding load. Not used to measure anything. */
  readonly nominalPassengerMassKg: number;
}

/** Explicit overrides applied last. Precedence: `overrides` > `answer` > `specs` > defaults. */
export interface LoadSensorOverrides {
  readonly bypassLoadThreshold?: number | undefined;
  readonly overloadThreshold?: number | undefined;
  readonly designLoadFactor?: number | undefined;
  readonly nominalPassengerMassKg?: number | undefined;
}

/**
 * The dispatcher-profile answer-stage settings the load sensor consumes.
 *
 * Declared structurally, as `physics/doors` does with `DoorAnswerSource`, so this module
 * states exactly what it reads from a profile; an `AnswerStageConfig` satisfies it without a
 * cast. Both keys are already accepted by `answerStageSchema`, so a profile on disk can set
 * them today.
 */
export interface LoadSensorAnswerSource {
  readonly bypassLoadThreshold?: number | undefined;
  readonly overloadThreshold?: number | undefined;
}

/**
 * Merge a car's rated load with the sensor thresholds from the specs file, the dispatcher
 * profile and any explicit overrides.
 *
 * Pure. Validates eagerly, because a sensor whose overload threshold sits below its bypass
 * threshold produces plausible-looking nonsense — every loaded car would be "overloaded but
 * still accepting hall calls" — rather than an error.
 *
 * @throws ModelError if the rated load is not positive, if a threshold is not a finite
 *   positive number, if `bypassLoadThreshold` exceeds 1 (a car cannot bypass only above its
 *   own rated load), or if `overloadThreshold` is below `bypassLoadThreshold`.
 */
export function resolveLoadSensor(
  car: Pick<ResolvedCar, 'id' | 'ratedLoadKg' | 'capacityPersons' | 'designLoadFactor'>,
  specs?: LoadSensorConfig | undefined,
  answer?: LoadSensorAnswerSource | AnswerStageConfig | undefined,
  overrides?: LoadSensorOverrides | undefined,
): ResolvedLoadSensorConfig {
  const ratedLoadKg = car.ratedLoadKg;
  if (!Number.isFinite(ratedLoadKg) || ratedLoadKg <= 0) {
    throw new ModelError(
      `Car "${car.id}" needs a positive ratedLoadKg for its load sensor; received ${ratedLoadKg}.`,
    );
  }

  const bypassLoadThreshold = requireFraction(
    overrides?.bypassLoadThreshold ??
      answer?.bypassLoadThreshold ??
      specs?.hallCallBypassThreshold ??
      LOAD_SENSOR_DEFAULTS.bypassLoadThreshold,
    'bypassLoadThreshold',
    car.id,
  );
  const overloadThreshold = requirePositive(
    overrides?.overloadThreshold ??
      answer?.overloadThreshold ??
      specs?.overloadAlarmThreshold ??
      LOAD_SENSOR_DEFAULTS.overloadThreshold,
    'overloadThreshold',
    car.id,
  );
  const designLoadFactor = requireFraction(
    overrides?.designLoadFactor ?? car.designLoadFactor ?? LOAD_SENSOR_DEFAULTS.designLoadFactor,
    'designLoadFactor',
    car.id,
  );
  const nominalPassengerMassKg = requirePositive(
    overrides?.nominalPassengerMassKg ?? LOAD_SENSOR_DEFAULTS.nominalPassengerMassKg,
    'nominalPassengerMassKg',
    car.id,
  );

  if (overloadThreshold < bypassLoadThreshold) {
    throw new ModelError(
      `Car "${car.id}": overloadThreshold (${overloadThreshold}) must not be below bypassLoadThreshold (${bypassLoadThreshold}). A car that refuses hall calls only after it has already refused to move has no bypass behaviour at all.`,
    );
  }

  return Object.freeze({
    ratedLoadKg,
    capacityPersons: car.capacityPersons,
    designLoadFactor,
    bypassLoadThreshold,
    overloadThreshold,
    nominalPassengerMassKg,
  });
}

function requirePositive(value: number, field: string, carId: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ModelError(
      `Car "${carId}": load sensor ${field} must be a finite positive number; received ${value}.`,
    );
  }
  return value;
}

function requireFraction(value: number, field: string, carId: string): number {
  const positive = requirePositive(value, field, carId);
  if (positive > 1) {
    throw new ModelError(
      `Car "${carId}": load sensor ${field} must be a fraction of rated load in (0, 1]; received ${positive}.`,
    );
  }
  return positive;
}

/* -------------------------------------------------------------------------- *
 * Pure helpers
 * -------------------------------------------------------------------------- */

/** Anything the cell can weigh: it knows an identity and a mass, and nothing else. */
export interface WeighedOccupant {
  readonly id: string;
  readonly massKg: number;
}

/**
 * Total mass of a group, kilograms.
 *
 * Summed in the order given, so two runs that board the same people in the same order get
 * bit-identical floating-point totals. Ordering matters here for exactly the reason it
 * matters in the event queue: a sum that depends on hash iteration order is a determinism
 * leak that shows up as an unreproducible run, not as a crash.
 */
export function totalMassKg(occupants: Iterable<WeighedOccupant>): number {
  let total = 0;
  for (const occupant of occupants) total += occupant.massKg;
  return total;
}

/** `massKg / ratedLoadKg`, the fraction of rated load the cell is reading. */
export function loadFactorOf(massKg: number, ratedLoadKg: number): number {
  return massKg / ratedLoadKg;
}

/* -------------------------------------------------------------------------- *
 * The sensor
 * -------------------------------------------------------------------------- */

/**
 * One car's load cell: who is aboard, what they weigh, and which thresholds that crosses.
 *
 * Mutable — it is per-run state and is reset between replications — but the mutation surface
 * is deliberately three methods wide ({@link add}, {@link remove}, {@link reset}) and every
 * derived quantity is a getter, so nothing outside can put the mass and the occupant list
 * out of step.
 *
 * ```ts
 * sensor.add(passenger);             // sums passenger.massKg, not a head count
 * sensor.loadFactor;                 // 0.82
 * sensor.isBypassingHallCalls;       // true  — no new hall calls, car calls still served
 * sensor.isOverloaded;               // false — the car will still start
 * ```
 */
export class LoadSensor {
  readonly config: ResolvedLoadSensorConfig;

  /** Occupant id to mass, in boarding order. A Map, so iteration order is deterministic. */
  readonly #occupants = new Map<string, number>();
  #massKg = 0;

  constructor(config: ResolvedLoadSensorConfig) {
    this.config = config;
  }

  /** Rated load, kilograms: the denominator of {@link loadFactor}. */
  get ratedLoadKg(): number {
    return this.config.ratedLoadKg;
  }

  /** Load fraction at which the car stops accepting new hall calls. */
  get bypassLoadThreshold(): number {
    return this.config.bypassLoadThreshold;
  }

  /** Load fraction at which the doors are held and the car will not start. */
  get overloadThreshold(): number {
    return this.config.overloadThreshold;
  }

  /** Fraction of rated capacity traffic analysis assumes a car fills to. 0.8, never 1.0. */
  get designLoadFactor(): number {
    return this.config.designLoadFactor;
  }

  /**
   * The load a traffic study sizes the system against: `ratedLoadKg * designLoadFactor`.
   *
   * Distinct from the bypass threshold even when the two fractions coincide — see the module
   * docstring.
   */
  get designLoadKg(): number {
    return this.config.ratedLoadKg * this.config.designLoadFactor;
  }

  /** Persons at design load, truncated: `floor(capacityPersons * designLoadFactor)`. */
  get designCapacityPersons(): number {
    return Math.floor(this.config.capacityPersons * this.config.designLoadFactor);
  }

  /** What the cell reads: the sum of the masses aboard, kilograms. */
  get massKg(): number {
    return this.#massKg;
  }

  /** How many people are aboard. Reported, never used to compute the load. */
  get occupants(): number {
    return this.#occupants.size;
  }

  /** `massKg / ratedLoadKg`. */
  get loadFactor(): number {
    return loadFactorOf(this.#massKg, this.config.ratedLoadKg);
  }

  /**
   * **Hall-call bypass.** At or above `bypassLoadThreshold` the car refuses *new hall calls*
   * and serves only the car calls already registered inside it.
   *
   * At or above, not above: a car sitting exactly on its threshold has reached the load the
   * operator declared as "full enough", and `>` would make the behaviour depend on
   * floating-point luck.
   */
  get isBypassingHallCalls(): boolean {
    return this.loadFactor >= this.config.bypassLoadThreshold;
  }

  /** **Overload alarm.** At or above `overloadThreshold`: doors held, the car will not start. */
  get isOverloaded(): boolean {
    return this.loadFactor >= this.config.overloadThreshold;
  }

  /** Whether the car is free to start, as far as the load cell is concerned. */
  get canStart(): boolean {
    return !this.isOverloaded;
  }

  /** Mass that can still be taken on before design load, kilograms. Never negative. */
  get remainingToDesignLoadKg(): number {
    return Math.max(0, this.designLoadKg - this.#massKg);
  }

  /** Whether an occupant with this id is aboard. */
  has(occupantId: string): boolean {
    return this.#occupants.has(occupantId);
  }

  /** The mass recorded for an occupant, or `undefined` if they are not aboard. */
  massOf(occupantId: string): number | undefined {
    return this.#occupants.get(occupantId);
  }

  /**
   * Record someone stepping in.
   *
   * @throws ModelError if the occupant is already aboard (a double-board is a bug in the
   *   caller, and silently ignoring it would understate every load) or if the mass is not
   *   positive and finite.
   */
  add(occupant: WeighedOccupant): void {
    if (this.#occupants.has(occupant.id)) {
      throw new ModelError(
        `Occupant "${occupant.id}" is already aboard and cannot board again; the load sensor would double-count them.`,
      );
    }
    if (!Number.isFinite(occupant.massKg) || occupant.massKg <= 0) {
      throw new ModelError(
        `Occupant "${occupant.id}" needs a positive finite massKg; received ${occupant.massKg}. Draw it from the passengerMass stream.`,
      );
    }
    this.#occupants.set(occupant.id, occupant.massKg);
    this.#recompute();
  }

  /**
   * Record someone stepping out.
   *
   * @returns the mass removed.
   * @throws ModelError if they were never aboard.
   */
  remove(occupant: WeighedOccupant | string): number {
    const id = typeof occupant === 'string' ? occupant : occupant.id;
    const massKg = this.#occupants.get(id);
    if (massKg === undefined) {
      throw new ModelError(`Occupant "${id}" is not aboard and cannot alight.`);
    }
    this.#occupants.delete(id);
    this.#recompute();
    return massKg;
  }

  /** Everyone aboard, in boarding order. A copy. */
  aboard(): readonly WeighedOccupant[] {
    return [...this.#occupants].map(([id, massKg]) => Object.freeze({ id, massKg }));
  }

  /** The reading, as the cost query sees it. */
  snapshot(): CarLoadSnapshot {
    return Object.freeze({
      massKg: this.#massKg,
      ratedLoadKg: this.config.ratedLoadKg,
      loadFactor: this.loadFactor,
      occupants: this.#occupants.size,
      bypassLoadThreshold: this.config.bypassLoadThreshold,
      overloadThreshold: this.config.overloadThreshold,
      designLoadFactor: this.config.designLoadFactor,
      isBypassingHallCalls: this.isBypassingHallCalls,
      isOverloaded: this.isOverloaded,
    });
  }

  /** Empty the car. For reusing a building across replications. */
  reset(): void {
    this.#occupants.clear();
    this.#massKg = 0;
  }

  /**
   * Re-sum from the occupant list rather than adding and subtracting a running total.
   *
   * Subtracting floats accumulates error that depends on the *history* of boardings, so an
   * empty car could read 1e-13 kg and two runs that boarded the same people in a different
   * order could disagree in the last bits. Re-summing over at most ~26 occupants costs
   * nothing and makes the reading a function of who is aboard, full stop.
   */
  #recompute(): void {
    let total = 0;
    for (const massKg of this.#occupants.values()) total += massKg;
    this.#massKg = total;
  }
}

/* -------------------------------------------------------------------------- *
 * Tunables (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

/**
 * The schema for every load-sensor tunable.
 *
 * Ranges are the ones declared in docs/06-parameterization-and-tuning.md § Stage 6.
 * `answer.*` ids resolve against a dispatcher profile's answer stage — both are already
 * accepted by `answerStageSchema`, so an optimizer can persist a winner as a profile.
 * `car.*` ids resolve against a car in a building config.
 *
 * `answer.allowBypassIfSoleEligibleCar` is deliberately **absent**: it is a starvation guard
 * that depends on how many *other* cars could serve the floor, which no car can know. It is
 * declared by the dispatcher, which owns it.
 *
 * ## `answer.overloadThreshold`'s range starts at the design load factor, not at rated load
 *
 * It used to be declared over `[1, 1.5]`, and over that whole interval it is a **flat plateau**:
 * boarding stops at the design load (`car.designLoadFactor` x rated, universally 0.8 — CLAUDE.md
 * § modelling rules), so a threshold at or above 1.0 can only reject a candidate heavier than
 * `0.2 x rated`. That is 146 kg on the lightest shipped car against a N(75, 15) passenger mass
 * distribution — at least 4.7 sigma — so `Car.isOverloaded`, `doorsHeldByOverload` and the
 * overload-alarm path were dead in every run this project can produce, while an optimizer spent
 * 50–200 replications an evaluation resolving the dimension. Measured: 1.0 vs 1.5 is
 * bit-identical on all five shipped buildings.
 *
 * The interlock is not dead, it is **one-sided**: it starts biting as the threshold approaches
 * the boarding cap from above, because the last boarder is what carries the load across. So the
 * floor of the declared range is {@link LOAD_SENSOR_DEFAULTS.designLoadFactor} — the first value
 * at which the predicate can reject anybody — rather than rated load, and the invariant that
 * keeps it honest is asserted in `loadSensor.test.ts`: **the range must start at or below the
 * design load factor, or the dimension has no reachable effect.** The default is unchanged at
 * EN 81's 110 %, so no shipped run moves; only the interval a search may explore does.
 */
export const LOAD_SENSOR_PARAMETERS: readonly CarParameterSpec[] = [
  {
    id: 'answer.bypassLoadThreshold',
    type: 'continuous',
    range: [0, 1],
    scale: 'linear',
    default: LOAD_SENSOR_DEFAULTS.bypassLoadThreshold,
    description:
      'Load fraction at which the car stops accepting new hall calls and serves only its car calls. The production "skip floors that have been called" behaviour; 0.8 on real load-weighing devices.',
  },
  {
    id: 'answer.overloadThreshold',
    type: 'continuous',
    range: [LOAD_SENSOR_DEFAULTS.designLoadFactor, 1.5],
    scale: 'linear',
    default: LOAD_SENSOR_DEFAULTS.overloadThreshold,
    description:
      'Load fraction at which the overload alarm sounds: the doors are held open and the car will not start. Must not be below bypassLoadThreshold. The range starts at the design load factor rather than at rated load because boarding already stops at the design load: above it the predicate can only reject a candidate heavier than (overloadThreshold - designLoadFactor) x rated, which at 1.0 and above is 0.2 x rated — at least 4.7 sigma of the passenger mass distribution, i.e. never. Measured bit-identical from 1.0 to 1.5 on all five shipped buildings, and live from 0.81 down. EN 81 sets the real device at 110%, which is the default; the lower end of the range is the conservative interlock that trips as the last boarder crosses the cap.',
  },
  {
    id: 'car.designLoadFactor',
    type: 'continuous',
    range: [0.6, 1],
    scale: 'linear',
    default: LOAD_SENSOR_DEFAULTS.designLoadFactor,
    description:
      'Fraction of rated capacity traffic analysis assumes a car fills to. Universally 0.8; 1.0 makes every result systematically optimistic. Not the same knob as bypassLoadThreshold.',
  },
  {
    id: 'car.nominalPassengerMassKg',
    type: 'continuous',
    range: [50, 100],
    scale: 'linear',
    default: LOAD_SENSOR_DEFAULTS.nominalPassengerMassKg,
    unit: 'kg',
    description:
      "EN 81's 75 kg per person, used only to project the load a call that has not happened yet would add. Measured load is always the sum of real drawn masses, never this number times a head count.",
  },
];
