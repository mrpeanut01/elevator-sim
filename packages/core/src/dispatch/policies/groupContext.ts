/**
 * The two facts only the group controller knows, on their way to stage 3.
 *
 * `terms/observation.ts` states the problem precisely: three of the twelve cost terms price
 * something neither the car nor the call can answer, and two of the three —
 *
 * | Term | Fact it needs |
 * |---|---|
 * | `zoneAffinity` | the car's **operational** zone |
 * | `predictedDemand` | the arrival forecast |
 *
 * — are owned by the dispatcher, not by a car. A cost term is a pure function and cannot own a
 * learned model or a partition, so both are resolved **once per decision** by whoever holds them
 * and handed to the terms through the observation. This file is the "whoever holds them" end of
 * that hand-off, and it holds them for the same reason `zoning.ts` and `prepositioning.ts` exist:
 * a zone is a dispatcher strategy and a forecast is a dispatcher input.
 *
 * ## One resolution, two stages
 *
 * The forecast and the partition are resolved by `resolvePrepositionContext`, the same call stage 7
 * makes, so a run cannot place a car against one forecast and price its calls against another.
 * That is `terms/observation.ts`'s own stated intent — *"the predictor produces one forecast that
 * both stage 3 (`predictedDemand`) and stage 7 (`parkingStrategy: predicted-demand`) read"* — and
 * two resolutions would be two futures the bank disagreed about.
 *
 * ## The channel is open, and the runner uses it
 *
 * `DispatchContext` declares `zoneFloorIdsByCarId` and `demandForecast`, `lifecycle.observationFor`
 * forwards both onto the `DispatchObservation`, and `Simulation.#dispatchBank` now calls this
 * function **once per dispatch pass** and shares the result across the calls in the pass:
 *
 * ```ts
 * // sim/simulation.ts, #dispatchBank — once per pass, not once per call
 * group ??= groupContext(snapshots, at, { predictor: this.#predictors.get(bank.id) });
 * policy.dispatch(lifecycle.callId, snapshots, at, withLandingCounts(group, waiting.count, waiting.massKg));
 * ```
 *
 * It used to pass `{ waitingPassengers, waitingMassKg }` and nothing else, so inside `runSimulation`
 * both fields were absent and both terms evaluated to zero — inert, not wrong, which is the
 * behaviour `terms/observation.ts` deliberately chose for a term with no information, but it meant a
 * profile weighting either term scored in a real run as though that weight were absent. Counted
 * through the shipped engine on `midtown-office`, one seed:
 *
 * | term | non-zero evaluations before | after |
 * |---|---|---|
 * | `zoneAffinity` (`zoned-uppeak`) | 0 of 437 | **372 of 495**, with spread across cars in 150 of 151 decisions |
 * | `predictedDemand` (`predictive-balanced`) | 0 of 7 057 | **7 435 of 7 435** |
 *
 * The shapes match end to end: `zoneAssignment` returns exactly the map
 * `TermObservation.zoneFloorIdsByCarId` declares, and `DemandForecastSource.expectedDemandByFloor`
 * returns exactly the map `TermObservation.demandForecast` declares — it is the predictor's own
 * method, so the forecast a term reads and the forecast stage 7 parks against are literally the same
 * object.
 */

import type { SimTime } from '../../kernel/types.js';
import type { CarSnapshot } from '../../model/car/types.js';
import type { DispatchContext } from '../types.js';

import { resolvePrepositionContext } from './prepositioning.js';
import type { DemandForecastSource, ZoneAssignment } from './types.js';

/**
 * `DispatchContext` widened by the two facts the group controller owns.
 *
 * Declared as an extension here rather than as a fork of `DispatchContext`, so a
 * `GroupObservationContext` is accepted by every existing policy method unchanged and gains meaning
 * the moment `observationFor` forwards the fields.
 */
export interface GroupObservationContext extends DispatchContext {
  /** Car id to the floor ids of that car's operational zone. For `zoneAffinity`. */
  readonly zoneFloorIdsByCarId?: ReadonlyMap<string, readonly string[]> | undefined;
  /** Floor id to expected arrivals over the predictor's horizon. For `predictedDemand`. */
  readonly demandForecast?: ReadonlyMap<string, number> | undefined;
  /**
   * Shaft indices of the building's entrance floors. For the weight-set selector's detector.
   *
   * The third fact only the group controller holds. A car snapshot carries the shaft's served
   * floors and not whether any of them is an entrance, so a detector that must tell a lobby
   * arrival from an interfloor one has to be told — see `DispatchContext.entranceFloorIndices`
   * for the measurement that made that non-obvious.
   */
  readonly entranceFloorIndices?: ReadonlySet<number> | undefined;
}

/** What the caller knows, and what it holds, when it asks for a decision. */
export interface GroupContextOptions {
  /** Passengers waiting at the call floor for the call direction, when somebody counted. */
  readonly waitingPassengers?: number | undefined;
  /** Their total mass, kilograms. */
  readonly waitingMassKg?: number | undefined;
  /** Operational zones. Omit and one contiguous band per in-service car is computed. */
  readonly zones?: ZoneAssignment | undefined;
  /** The learned arrival model. Omit and no forecast is supplied, which leaves terms inert. */
  readonly predictor?: DemandForecastSource | undefined;
  /**
   * Override the horizon the forecast is taken over, seconds. Omitted, the model answers over its
   * own `idle.predictorHorizonS`, which `PREDICTOR_PARAMETERS` declares.
   */
  readonly horizonS?: number | undefined;
  /** Shaft indices of the building's entrance floors. Omit and the detector falls back. */
  readonly entranceFloorIndices?: ReadonlySet<number> | undefined;
}

/**
 * Build the decision context for one bank at one instant.
 *
 * Resolve it **once per dispatch pass and share it across every call in the pass**, not once per
 * call. Two reasons, and the second is the one that would actually bite:
 *
 * - a twelve-term weight vector must cost one route projection, not twelve — the property
 *   `TermContext.estimate` exists to protect, applied one level up to the observation;
 * - the partition is a function of which cars are in service, so resolving it per call would let
 *   two calls decided at the same instant be scored against two different partitions if a car
 *   changed mode between them. A bank that disagrees with itself about its own zones inside one
 *   instant is not a bank a paired comparison can measure.
 *
 * Fields are omitted rather than set to `undefined`, because `exactOptionalPropertyTypes` is on and
 * the frozen result should record what was actually known.
 */
export function groupContext(
  cars: readonly CarSnapshot[],
  at: SimTime,
  options: GroupContextOptions = {},
): GroupObservationContext {
  const resolved = resolvePrepositionContext(cars, at, {
    ...(options.zones === undefined ? {} : { zones: options.zones }),
    ...(options.predictor === undefined ? {} : { predictor: options.predictor }),
    ...(options.horizonS === undefined ? {} : { horizonS: options.horizonS }),
  });

  return Object.freeze({
    ...(options.waitingPassengers === undefined
      ? {}
      : { waitingPassengers: options.waitingPassengers }),
    ...(options.waitingMassKg === undefined ? {} : { waitingMassKg: options.waitingMassKg }),
    zoneFloorIdsByCarId: resolved.zones,
    ...(resolved.demandForecast === undefined
      ? {}
      : { demandForecast: resolved.demandForecast }),
    ...(options.entranceFloorIndices === undefined
      ? {}
      : { entranceFloorIndices: options.entranceFloorIndices }),
  });
}

/**
 * The same context with one landing's counts attached.
 *
 * The per-pass part of {@link groupContext} — the zones and the forecast — is expensive and shared;
 * the per-call part is two numbers. Splitting them is what lets a runner resolve the group facts
 * once and still tell each call how many people are standing at its landing.
 */
export function withLandingCounts(
  context: GroupObservationContext,
  waitingPassengers: number | undefined,
  waitingMassKg?: number | undefined,
): GroupObservationContext {
  return Object.freeze({
    ...context,
    ...(waitingPassengers === undefined ? {} : { waitingPassengers }),
    ...(waitingMassKg === undefined ? {} : { waitingMassKg }),
  });
}
