/**
 * Passengers, and the journeys they make.
 *
 * ## One object per leg, one identity per journey
 *
 * A `Passenger` models **one leg** of a journey: an arrival at a landing, a wait, a ride,
 * an alighting. Buildings with sky lobbies make journeys multi-leg — `data/buildings/README.md`
 * defines a transfer floor as one where "a passenger alighting here is re-injected as a new
 * arrival on the next leg while keeping its original journey identity, so time-to-destination
 * spans both trips" — so the second leg is a genuinely new arrival, with its own wait, in a
 * different bank's queue.
 *
 * Modelling that as one mutable object whose timestamps are overwritten at each transfer
 * would destroy the first leg's waiting time, which is a headline statistic. Modelling it as
 * independent passengers would destroy time-to-destination, which is *the* metric for a
 * mixed-use tower. So: a new `Passenger` per leg, carrying a {@link Passenger.journeyId} and
 * {@link Passenger.journeyStartedAt} that survive the transfer. Per-leg statistics come from
 * the leg; per-journey statistics come from the final leg, which knows when the journey
 * began.
 *
 * ## Mass
 *
 * Mass is drawn from the injected `StreamSet`'s `passengerMass` stream, never from
 * `Math.random`, and never fixed to a constant (CLAUDE.md invariant 2, and the modelling rule
 * that "passenger mass is a distribution, not a constant" — otherwise the load sensor has
 * nothing to measure). {@link PassengerFactory} is the only sanctioned way to create an
 * arriving passenger for exactly that reason: it owns the draw, so no caller can substitute
 * a constant by accident.
 */

import type { SimTime } from '../kernel/index.js';
import type { PassengerMassConfig } from '../config/types.js';
import type { Rng, StreamSet } from '../random/index.js';

import { ModelError, type CredentialGroup, type Direction, type FloorTopology } from './types.js';

/** Distributions {@link drawPassengerMass} knows how to sample. */
export const SUPPORTED_MASS_DISTRIBUTIONS = ['normal'] as const;

/**
 * Draw one body mass, in kilograms, from `rng`.
 *
 * `rng` must be the `passengerMass` stream of an injected `StreamSet`. Nothing here enforces
 * that — a function cannot know which stream it was handed — which is why simulation code
 * should go through {@link PassengerFactory}, which does.
 *
 * **Exactly one underlying draw is consumed per call, whatever the outcome.** The tails are
 * clamped into `[minKg, maxKg]` rather than rejected and re-drawn, because rejection would
 * make the number of draws depend on the values drawn: under common random numbers two
 * configurations would then fall out of step on this stream the first time one of them
 * happened to draw a 130 kg passenger. Clamping is also the physically honest choice — the
 * normal distribution's tails run to zero and to infinity, and neither is a person.
 */
export function drawPassengerMass(rng: Rng, config: PassengerMassConfig): number {
  if (config.distribution !== 'normal') {
    throw new ModelError(
      `Unsupported passenger mass distribution "${config.distribution}". Supported: ${SUPPORTED_MASS_DISTRIBUTIONS.join(', ')}. Add the sampler here and declare it in data/traffic-profiles.json.`,
    );
  }
  if (!Number.isFinite(config.meanKg) || config.meanKg <= 0) {
    throw new ModelError(`Passenger mass meanKg must be a positive number; received ${config.meanKg}`);
  }
  if (!Number.isFinite(config.stdDevKg) || config.stdDevKg < 0) {
    throw new ModelError(
      `Passenger mass stdDevKg must be a non-negative number; received ${config.stdDevKg}`,
    );
  }
  if (!Number.isFinite(config.minKg) || config.minKg <= 0) {
    throw new ModelError(`Passenger mass minKg must be a positive number; received ${config.minKg}`);
  }
  const maxKg = config.maxKg ?? Number.POSITIVE_INFINITY;
  if (Number.isNaN(maxKg) || maxKg <= config.minKg) {
    throw new ModelError(
      `Passenger mass maxKg must exceed minKg; received minKg=${config.minKg}, maxKg=${String(config.maxKg)}`,
    );
  }

  const draw = rng.normal(config.meanKg, config.stdDevKg);
  return Math.min(Math.max(draw, config.minKg), maxKg);
}

/** Everything a {@link Passenger} needs. Optional fields default to a single-leg journey. */
export interface PassengerInit {
  /** Unique within a run, and identifies *this leg*. See {@link PassengerInit.journeyId}. */
  readonly id: string;
  /** Stable across every leg of the journey. For a single-leg journey, any unique value. */
  readonly journeyId: string;
  readonly originFloorId: string;
  /** Shaft ordering of {@link PassengerInit.originFloorId}. */
  readonly originFloorIndex: number;
  /** Where *this leg* ends — the sky lobby, on a leg that transfers. */
  readonly destinationFloorId: string;
  /** Shaft ordering of {@link PassengerInit.destinationFloorId}. */
  readonly destinationFloorIndex: number;
  /** Body mass, kilograms. Drawn from the `passengerMass` stream, never a constant. */
  readonly massKg: number;
  /** When the passenger arrived at {@link PassengerInit.originFloorId} and began waiting. */
  readonly arrivedAt: SimTime;
  /** Access-control credential. `undefined` means an unbadged visitor. */
  readonly credentialGroup?: CredentialGroup | undefined;
  /** 0 for the first leg. Increments at each transfer. */
  readonly legIndex?: number | undefined;
  /** Where the journey started. Defaults to this leg's origin. */
  readonly journeyOriginFloorId?: string | undefined;
  /** When the journey started. Defaults to this leg's `arrivedAt`. */
  readonly journeyStartedAt?: SimTime | undefined;
  /** Where the journey ends. Defaults to this leg's destination (a single-leg journey). */
  readonly finalDestinationFloorId?: string | undefined;
}

/** The parts of the next leg that are not inherited from the leg that produced it. */
export interface NextLegInit {
  /** Unique id for the new leg. */
  readonly id: string;
  readonly destinationFloorId: string;
  /** Shaft ordering of {@link NextLegInit.destinationFloorId}. */
  readonly destinationFloorIndex: number;
  /**
   * When the passenger is available at the transfer floor and starts waiting again — the
   * alighting time plus however long it takes to walk across the sky lobby.
   */
  readonly arrivedAt: SimTime;
  /** Re-routing only. Defaults to the journey's existing final destination. */
  readonly finalDestinationFloorId?: string | undefined;
}

/**
 * One leg of one passenger's journey.
 *
 * Mutable in exactly three places — {@link Passenger.board}, {@link Passenger.alight} and
 * nothing else — and every mutation is a timestamp that may be written once. Everything
 * else is `readonly`, so a passenger handed to a cost function cannot be edited by it.
 */
export class Passenger {
  /** Identity of this leg. Unique within a run. */
  readonly id: string;
  /**
   * Identity of the whole journey, stable across sky-lobby transfers.
   *
   * This is what lets time-to-destination span both trips: leg 2 of a journey carries the
   * same `journeyId` — and the same {@link Passenger.journeyStartedAt} — as leg 1.
   */
  readonly journeyId: string;
  /** 0 for the first leg, incrementing at each transfer. */
  readonly legIndex: number;
  readonly originFloorId: string;
  readonly originFloorIndex: number;
  readonly destinationFloorId: string;
  readonly destinationFloorIndex: number;
  /** Where the whole journey ends. Equal to {@link destinationFloorId} on the final leg. */
  readonly finalDestinationFloorId: string;
  /** Where the whole journey began. Equal to {@link originFloorId} on the first leg. */
  readonly journeyOriginFloorId: string;
  /** When the whole journey began. Equal to {@link arrivedAt} on the first leg. */
  readonly journeyStartedAt: SimTime;
  /** Body mass in kilograms, drawn from the `passengerMass` stream. Constant across legs. */
  readonly massKg: number;
  /** Access-control credential, or `undefined` for an unbadged visitor. Constant across legs. */
  readonly credentialGroup: CredentialGroup | undefined;
  /** When this leg's wait began. */
  readonly arrivedAt: SimTime;
  /** Which way this leg travels, from the floor *indices*. */
  readonly direction: Direction;

  #boardedAt: SimTime | undefined;
  #alightedAt: SimTime | undefined;

  constructor(init: PassengerInit) {
    if (init.id.length === 0) throw new ModelError('Passenger id must not be empty');
    if (init.journeyId.length === 0) throw new ModelError('Passenger journeyId must not be empty');
    if (!Number.isInteger(init.originFloorIndex) || !Number.isInteger(init.destinationFloorIndex)) {
      throw new ModelError(
        `Passenger "${init.id}" needs integer floor indices; received origin ${init.originFloorIndex}, destination ${init.destinationFloorIndex}`,
      );
    }
    if (init.originFloorIndex === init.destinationFloorIndex) {
      throw new ModelError(
        `Passenger "${init.id}" travels from floor "${init.originFloorId}" to itself. A trip that goes nowhere has no direction and no waiting time; it must not be generated.`,
      );
    }
    if (!Number.isFinite(init.massKg) || init.massKg <= 0) {
      throw new ModelError(
        `Passenger "${init.id}" needs a positive finite massKg; received ${init.massKg}. Draw it from the passengerMass stream.`,
      );
    }
    if (!Number.isFinite(init.arrivedAt)) {
      throw new ModelError(`Passenger "${init.id}" needs a finite arrivedAt; received ${init.arrivedAt}`);
    }
    const legIndex = init.legIndex ?? 0;
    if (!Number.isInteger(legIndex) || legIndex < 0) {
      throw new ModelError(`Passenger "${init.id}" needs a non-negative integer legIndex; received ${legIndex}`);
    }
    const journeyStartedAt = init.journeyStartedAt ?? init.arrivedAt;
    if (journeyStartedAt > init.arrivedAt) {
      throw new ModelError(
        `Passenger "${init.id}" starts leg ${legIndex} at t=${init.arrivedAt} but claims its journey began later, at t=${journeyStartedAt}.`,
      );
    }

    this.id = init.id;
    this.journeyId = init.journeyId;
    this.legIndex = legIndex;
    this.originFloorId = init.originFloorId;
    this.originFloorIndex = init.originFloorIndex;
    this.destinationFloorId = init.destinationFloorId;
    this.destinationFloorIndex = init.destinationFloorIndex;
    this.finalDestinationFloorId = init.finalDestinationFloorId ?? init.destinationFloorId;
    this.journeyOriginFloorId = init.journeyOriginFloorId ?? init.originFloorId;
    this.journeyStartedAt = journeyStartedAt;
    this.massKg = init.massKg;
    this.credentialGroup = init.credentialGroup;
    this.arrivedAt = init.arrivedAt;
    this.direction = init.destinationFloorIndex > init.originFloorIndex ? 'up' : 'down';
  }

  /** When the passenger entered the car, or `undefined` while still waiting. */
  get boardedAt(): SimTime | undefined {
    return this.#boardedAt;
  }

  /** When the passenger left the car, or `undefined` while waiting or riding. */
  get alightedAt(): SimTime | undefined {
    return this.#alightedAt;
  }

  get hasBoarded(): boolean {
    return this.#boardedAt !== undefined;
  }

  get hasAlighted(): boolean {
    return this.#alightedAt !== undefined;
  }

  /** Waiting at the landing: arrived, not yet aboard. */
  get isWaiting(): boolean {
    return this.#boardedAt === undefined;
  }

  /** Aboard a car. */
  get isRiding(): boolean {
    return this.#boardedAt !== undefined && this.#alightedAt === undefined;
  }

  /** True when this leg ends at the journey's final destination — nothing follows it. */
  get isFinalLeg(): boolean {
    return this.destinationFloorId === this.finalDestinationFloorId;
  }

  /** Record boarding. Write-once: a second call is a bug, not an update. */
  board(at: SimTime): void {
    if (this.#boardedAt !== undefined) {
      throw new ModelError(
        `Passenger "${this.id}" boarded at t=${this.#boardedAt} and cannot board again at t=${at}.`,
      );
    }
    if (!Number.isFinite(at) || at < this.arrivedAt) {
      throw new ModelError(
        `Passenger "${this.id}" cannot board at t=${at}: it arrived at t=${this.arrivedAt}. Simulated time never runs backwards.`,
      );
    }
    this.#boardedAt = at;
  }

  /** Record alighting. Requires a prior {@link board}; write-once. */
  alight(at: SimTime): void {
    const boardedAt = this.#boardedAt;
    if (boardedAt === undefined) {
      throw new ModelError(`Passenger "${this.id}" cannot alight at t=${at}: it never boarded.`);
    }
    if (this.#alightedAt !== undefined) {
      throw new ModelError(
        `Passenger "${this.id}" alighted at t=${this.#alightedAt} and cannot alight again at t=${at}.`,
      );
    }
    if (!Number.isFinite(at) || at < boardedAt) {
      throw new ModelError(
        `Passenger "${this.id}" cannot alight at t=${at}: it boarded at t=${boardedAt}. Simulated time never runs backwards.`,
      );
    }
    this.#alightedAt = at;
  }

  /** Seconds spent waiting at the landing on this leg, or `undefined` while still waiting. */
  get waitTimeS(): number | undefined {
    return this.#boardedAt === undefined ? undefined : this.#boardedAt - this.arrivedAt;
  }

  /** Seconds spent in the car on this leg, or `undefined` until the passenger alights. */
  get rideTimeS(): number | undefined {
    if (this.#boardedAt === undefined || this.#alightedAt === undefined) return undefined;
    return this.#alightedAt - this.#boardedAt;
  }

  /** Wait plus ride for this leg alone, or `undefined` until the passenger alights. */
  get legTimeS(): number | undefined {
    return this.#alightedAt === undefined ? undefined : this.#alightedAt - this.arrivedAt;
  }

  /**
   * Time to destination: the whole journey, arrival at the first landing to alighting at the
   * final one — **including** the transfer and the second wait.
   *
   * `undefined` unless this is the final leg and it has completed; a passenger standing in a
   * sky lobby waiting for the second car has no time-to-destination yet, and reporting the
   * first leg's duration as one would flatter every sky-lobby building.
   */
  get timeToDestinationS(): number | undefined {
    if (!this.isFinalLeg || this.#alightedAt === undefined) return undefined;
    return this.#alightedAt - this.journeyStartedAt;
  }

  /**
   * Re-inject this passenger at a transfer floor as the next leg of the same journey.
   *
   * The new leg inherits the journey identity, start time, origin, mass and credential; it
   * starts fresh on arrival time and boarding state. Mass is *not* re-drawn — it is the same
   * person, and a second draw would consume the `passengerMass` stream at a rate that
   * depends on how many transfers a run happened to produce, desynchronizing common random
   * numbers.
   *
   * Requires this leg to have completed: a passenger who has not alighted is still in a car
   * and cannot be waiting at a landing. Whether the floor is a legitimate sky lobby is
   * checked by {@link PassengerFactory.transfer}, which has the building to check against.
   */
  beginNextLeg(init: NextLegInit): Passenger {
    const alightedAt = this.#alightedAt;
    if (alightedAt === undefined) {
      throw new ModelError(
        `Passenger "${this.id}" cannot begin its next leg: it has not alighted at "${this.destinationFloorId}" yet.`,
      );
    }
    if (init.arrivedAt < alightedAt) {
      throw new ModelError(
        `Passenger "${this.id}" cannot start its next leg at t=${init.arrivedAt}: it alighted at t=${alightedAt}.`,
      );
    }
    const finalDestinationFloorId = init.finalDestinationFloorId ?? this.finalDestinationFloorId;
    if (finalDestinationFloorId === this.destinationFloorId) {
      throw new ModelError(
        `Passenger "${this.id}" has already reached its final destination "${finalDestinationFloorId}"; there is no next leg. Pass finalDestinationFloorId to re-route it instead.`,
      );
    }

    return new Passenger({
      id: init.id,
      journeyId: this.journeyId,
      legIndex: this.legIndex + 1,
      originFloorId: this.destinationFloorId,
      originFloorIndex: this.destinationFloorIndex,
      destinationFloorId: init.destinationFloorId,
      destinationFloorIndex: init.destinationFloorIndex,
      finalDestinationFloorId,
      journeyOriginFloorId: this.journeyOriginFloorId,
      journeyStartedAt: this.journeyStartedAt,
      massKg: this.massKg,
      ...(this.credentialGroup === undefined ? {} : { credentialGroup: this.credentialGroup }),
      arrivedAt: init.arrivedAt,
    });
  }
}

/** A new arrival at a landing. Mass is drawn, never supplied — see {@link PassengerFactory}. */
export interface ArrivalRequest {
  readonly originFloorId: string;
  /** Where this leg ends: the sky lobby, when the journey continues past it. */
  readonly destinationFloorId: string;
  readonly arrivedAt: SimTime;
  readonly credentialGroup?: CredentialGroup | undefined;
  /** Where the journey ends. Defaults to `destinationFloorId` (a single-leg journey). */
  readonly finalDestinationFloorId?: string | undefined;
}

/** Continuation of an existing journey at the transfer floor the passenger just alighted on. */
export interface TransferRequest {
  /** Where the *next* leg ends. */
  readonly destinationFloorId: string;
  /** When the passenger is ready to wait again: alighting time plus the walk across the lobby. */
  readonly arrivedAt: SimTime;
  /** Re-routing only. Defaults to the journey's existing final destination. */
  readonly finalDestinationFloorId?: string | undefined;
}

export interface PassengerFactoryOptions {
  /**
   * The run's stream set. Mass is drawn from its `passengerMass` stream and from no other —
   * the whole set is taken, rather than a bare `Rng`, so a caller cannot hand over the wrong
   * stream and quietly couple two stochastic sources (CLAUDE.md invariant 2).
   */
  readonly streams: StreamSet;
  /** Body-mass distribution, from `data/traffic-profiles.json`. */
  readonly massConfig: PassengerMassConfig;
  /** The building, for floor lookup and transfer-floor validation. */
  readonly topology: FloorTopology;
  /** Prefix for generated passenger ids. Defaults to `p`. */
  readonly idPrefix?: string | undefined;
  /** Prefix for generated journey ids. Defaults to `j`. */
  readonly journeyIdPrefix?: string | undefined;
}

/**
 * Creates passengers, draws their mass, and keeps journey identity intact across transfers.
 *
 * One per replication, constructed with that replication's `StreamSet`. Ids are allocated
 * from a per-factory counter rather than a module-level one: module-level mutable state
 * would make a passenger's id depend on how many other simulations the process had already
 * run, so two identical replications would produce different records.
 *
 * ```ts
 * const factory = new PassengerFactory({ streams, massConfig, topology: building });
 * const leg1 = factory.arrive({ originFloorId: 'G', destinationFloorId: '31',
 *                               finalDestinationFloorId: '45', arrivedAt: 0 });
 * // ... leg1 rides the shuttle, boards, alights at the sky lobby ...
 * const leg2 = factory.transfer(leg1, { destinationFloorId: '45', arrivedAt: t });
 * leg2.journeyId === leg1.journeyId;  // true — TTD spans both legs
 * ```
 */
export class PassengerFactory {
  readonly #streams: StreamSet;
  readonly #massConfig: PassengerMassConfig;
  readonly #topology: FloorTopology;
  readonly #idPrefix: string;
  readonly #journeyIdPrefix: string;

  #passengerCount = 0;
  #journeyCount = 0;

  constructor(options: PassengerFactoryOptions) {
    this.#streams = options.streams;
    this.#massConfig = options.massConfig;
    this.#topology = options.topology;
    this.#idPrefix = options.idPrefix ?? 'p';
    this.#journeyIdPrefix = options.journeyIdPrefix ?? 'j';
  }

  /** Passengers created so far, across all legs. */
  get passengerCount(): number {
    return this.#passengerCount;
  }

  /** Journeys started so far. Lower than {@link passengerCount} once transfers occur. */
  get journeyCount(): number {
    return this.#journeyCount;
  }

  /** A new journey arriving at a landing, with mass drawn from the `passengerMass` stream. */
  arrive(request: ArrivalRequest): Passenger {
    const originFloorIndex = this.#requireFloorIndex(request.originFloorId, 'origin');
    const destinationFloorIndex = this.#requireFloorIndex(request.destinationFloorId, 'destination');
    if (request.finalDestinationFloorId !== undefined) {
      this.#requireFloorIndex(request.finalDestinationFloorId, 'final destination');
    }

    this.#journeyCount += 1;
    const journeyId = `${this.#journeyIdPrefix}${this.#journeyCount}`;

    return new Passenger({
      id: this.#nextPassengerId(),
      journeyId,
      originFloorId: request.originFloorId,
      originFloorIndex,
      destinationFloorId: request.destinationFloorId,
      destinationFloorIndex,
      ...(request.finalDestinationFloorId === undefined
        ? {}
        : { finalDestinationFloorId: request.finalDestinationFloorId }),
      ...(request.credentialGroup === undefined ? {} : { credentialGroup: request.credentialGroup }),
      massKg: drawPassengerMass(this.#streams.passengerMass, this.#massConfig),
      arrivedAt: request.arrivedAt,
    });
  }

  /**
   * Re-inject an alighted passenger at a sky lobby as the next leg of the same journey.
   *
   * Rejects a transfer at a floor not flagged `isTransferFloor`. That flag is declared per
   * building rather than inferred from `isEntrance`, and a journey that "transfers" at an
   * ordinary floor is a routing bug that would otherwise show up only as an inexplicably
   * good time-to-destination.
   */
  transfer(passenger: Passenger, request: TransferRequest): Passenger {
    const transferFloorId = passenger.destinationFloorId;
    if (!this.#topology.isTransferFloor(transferFloorId)) {
      throw new ModelError(
        `Passenger "${passenger.id}" cannot transfer at floor "${transferFloorId}": that floor is not flagged isTransferFloor. Only a declared sky lobby joins two legs of one journey.`,
      );
    }
    const destinationFloorIndex = this.#requireFloorIndex(request.destinationFloorId, 'destination');
    if (request.finalDestinationFloorId !== undefined) {
      this.#requireFloorIndex(request.finalDestinationFloorId, 'final destination');
    }

    return passenger.beginNextLeg({
      id: this.#nextPassengerId(),
      destinationFloorId: request.destinationFloorId,
      destinationFloorIndex,
      arrivedAt: request.arrivedAt,
      ...(request.finalDestinationFloorId === undefined
        ? {}
        : { finalDestinationFloorId: request.finalDestinationFloorId }),
    });
  }

  #nextPassengerId(): string {
    this.#passengerCount += 1;
    return `${this.#idPrefix}${this.#passengerCount}`;
  }

  #requireFloorIndex(floorId: string, role: string): number {
    const index = this.#topology.floorIndexOf(floorId);
    if (index === undefined) {
      throw new ModelError(`Unknown ${role} floor "${floorId}": this building does not declare it.`);
    }
    return index;
  }
}
