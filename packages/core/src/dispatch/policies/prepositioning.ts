/**
 * Predictive pre-positioning — stage 7 given something to predict with, and somewhere to be.
 *
 * ```ts
 * const plan = prepositionPlan(policy, snapshots, kernel.now(), {
 *   entranceFloorIds: building.entranceFloors.map((floor) => floor.id),
 *   predictor,   // any DemandForecastSource; dispatch/predictor's DemandForecast is one
 * });
 * for (const move of movesOf(plan)) depart(move.carId, move.targetFloorId);
 * ```
 *
 * docs/06-parameterization-and-tuning.md § Stage 7: *"Where cars go when they have nothing to do.
 * On sparse-traffic buildings this dominates everything else."* The arithmetic that decides it —
 * expected response time against the demand model the strategy implies, the trip amortised over
 * `PARK_CALL_HORIZON` calls, `repositionThresholdS` as the deadband and `repositionEnergyWeight`
 * as the exchange rate — is `lifecycle.ts`'s `repositionDecisionFor`, unchanged. **This file adds
 * no arithmetic and no tunable.** It supplies the two facts that arithmetic needed and never had:
 *
 * | Strategy | What was missing | Where it now comes from |
 * |---|---|---|
 * | `predicted-demand` | a forecast. Without one stage 7 answers `no-forecast` and no car ever moves | {@link DemandForecastSource} — `dispatch/predictor`'s `DemandForecast` satisfies it structurally — queried once per bank per decision |
 * | `zone-center` | a zone. Without one every car computes the same shaft median and the whole bank parks on one floor | `contiguousZones`, one contiguous band per in-service car |
 *
 * Both were *declared and inert*. `RepositionContext` has carried `demandForecast` and
 * `zoneFloorIds` since Phase 2, `idle.parkingStrategy` has listed both values since Phase 2, and
 * the only caller in the tree — `Simulation.#park` — supplied `entranceFloorIds` and nothing else.
 * Wiring them up is therefore not new behaviour bolted on; it is two declared parameters starting
 * to mean what they say.
 *
 * ## `Simulation.#park` calls this, and the two strategies it feeds are live
 *
 * This section used to say the opposite, in the present tense, because it was true: `#park` built
 * its context inline as `{ entranceFloorIds: this.#entranceFloorIds }`, so inside `runSimulation`
 * `predicted-demand` answered `no-forecast` for every car of every run and `zone-center` — with no
 * partition — sent every car in a bank to the same shaft median. Measured on `midtown-office` at
 * `DISPATCH_DEFAULTS`, four cars from `G`: all four to floor `10`, against one target per band
 * (`2 / 7 / 12 / 17`) through {@link prepositionPlan}.
 *
 * `#park` now resolves the whole bank once — {@link resolvePrepositionContext} with the bank's
 * arrival model and its entrance floors — and derives each car's `RepositionContext` from it with
 * {@link repositionContextFor}. What that changed, measured on `garden-apartments` at n = 500 under
 * CRN against `stay`:
 *
 * | strategy | AWT difference, 95 % paired-t |
 * |---|---|
 * | `zone-center` | **−4.88 s [−5.27, −4.49]**, −29.7 % |
 * | `predicted-demand`, deadband 3 s | **−0.98 s [−1.28, −0.68]**, −5.9 % |
 * | `predicted-demand`, `predictive-balanced`'s authored deadband of 8 s | −0.01 s [−0.02, +0.01], indistinguishable — the move is inside the profile's own `repositionThresholdS`, not absent |
 *
 * So the Phase 5 acceptance criterion *"pre-positioning shows measurable AWT improvement on Garden
 * Apartments"* is **met**, and `data/dispatcher-profiles.json` ships `zoned-uppeak` declaring
 * `zone-center` again. `packages/experiments/src/benchmark/prepositioning.ts` is where those
 * intervals are produced; what `prepositioning.test.ts` asserts here is still a decision-level
 * saving, which is not an AWT interval and must not be reported as one.
 *
 * ## The predictor is a dependency, not a part of this module
 *
 * {@link DemandForecastSource} is one method, declared structurally, exactly as `CarClock` gives
 * the kernel one method and `DoorAnswerSource` gives a profile one shape. The learned per-floor,
 * per-time-of-day arrival model lives in `dispatch/predictor`, whose read-only `DemandForecast`
 * face satisfies this interface with **no adapter in either direction** — the shared method is
 * `expectedDemandByFloor(fromT, horizonS?)`, which that module documents as *"exactly the shape
 * `RepositionContext.demandForecast` wants"*.
 *
 * Every predictor tunable — the horizon, the learning rate, the bucket width, the cycle and the
 * prior — is declared by `PREDICTOR_PARAMETERS` and deliberately not by `POLICY_PARAMETERS`.
 * `expectedDemandByFloor` answers over the model's own configured horizon when none is passed, so
 * this module passes one only when a caller explicitly wants a different window. Two defaults for
 * one horizon would be two knobs moving one number.
 *
 * Nothing here trains the model, mutates it, or can reach the kernel through it: it holds the
 * read-only face, the query is pure, and `fromT` is handed in rather than read from a clock
 * (CLAUDE.md invariant 3).
 *
 * That boundary is what lets this file be tested against a synthetic forecast and stay honest
 * about what it is testing: **that a forecast changes where cars park**, which is a property of
 * stage 7 and of this wiring, not of any particular arrival model's accuracy.
 *
 * ## One forecast per bank, not one per car
 *
 * The forecast is a fact about the building's floors, so it is resolved once per call to
 * {@link prepositionPlan} and shared by every car. Asking the predictor once per car would let two
 * cars in one bank be placed against two different forecasts if the model ever became stateful,
 * and "the cars disagreed about the future" is a bug that would present as unstable parking.
 */

import type { SimTime } from '../../kernel/types.js';
import type { CarSnapshot } from '../../model/car/types.js';
import type { DispatchPolicy, RepositionContext, RepositionDecision } from '../types.js';

import type { DemandForecastSource, PrepositionContext, ZoneAssignment } from './types.js';
import { zoneAssignment, zoneFloorIdsFor } from './zoning.js';

/* -------------------------------------------------------------------------- *
 * Resolving the context
 * -------------------------------------------------------------------------- */

/** A {@link PrepositionContext} with the forecast taken and the zones partitioned, once. */
export interface ResolvedPrepositionContext {
  readonly entranceFloorIds: readonly string[] | undefined;
  readonly zones: ZoneAssignment;
  readonly demandForecast: ReadonlyMap<string, number> | undefined;
  /**
   * The horizon override the forecast was taken over, seconds, or `undefined` when the model
   * answered over its own configured `idle.predictorHorizonS`.
   */
  readonly horizonS: number | undefined;
}

/**
 * Take the forecast and partition the bank, once per decision.
 *
 * A supplied `zones` map always wins over the computed partition: a caller running a dynamic
 * zoning strategy, or a test pinning a particular band, outranks the default static split — the
 * same precedence `responseWeights` gives an explicit `demandForecast` over the model a strategy
 * name implies.
 *
 * An **empty** forecast is passed through as an empty map rather than collapsed to `undefined`.
 * The distinction is real and stage 7 already draws it: `undefined` means *nobody has a forecast*,
 * and `predicted-demand` answers `no-forecast`; an empty map means *the model predicts no arrivals
 * anywhere*, and the honest response to that is `no-target`, not a guess. Degrading a
 * "no arrivals expected" forecast into `lobby` would report a parking result nobody configured.
 */
export function resolvePrepositionContext(
  cars: readonly CarSnapshot[],
  at: SimTime,
  context: PrepositionContext = {},
): ResolvedPrepositionContext {
  // A non-positive or non-finite override is discarded rather than honoured: a forecast over no
  // time is zero everywhere, which would silently turn `predicted-demand` into `no-target`. The
  // model's own configured horizon is the answer when nobody asked for a different one.
  const horizonS =
    context.horizonS === undefined || !Number.isFinite(context.horizonS) || context.horizonS <= 0
      ? undefined
      : context.horizonS;

  return Object.freeze({
    entranceFloorIds: context.entranceFloorIds,
    zones: context.zones ?? zoneAssignment(cars),
    demandForecast: context.predictor?.expectedDemandByFloor(at, horizonS),
    horizonS,
  });
}

/**
 * One car's `RepositionContext`, built from a resolved bank context.
 *
 * Fields are omitted rather than set to `undefined` because `exactOptionalPropertyTypes` is on and
 * the two are not the same thing here: `RepositionContext.demandForecast` present-but-undefined
 * and absent both read as "no forecast", but building the object by omission keeps the frozen value
 * a faithful record of what was actually known.
 */
export function repositionContextFor(
  car: CarSnapshot,
  resolved: ResolvedPrepositionContext,
): RepositionContext {
  const zoneFloorIds = zoneFloorIdsFor(resolved.zones, car.carId);
  return Object.freeze({
    ...(resolved.entranceFloorIds === undefined
      ? {}
      : { entranceFloorIds: resolved.entranceFloorIds }),
    ...(zoneFloorIds === undefined ? {} : { zoneFloorIds }),
    ...(resolved.demandForecast === undefined
      ? {}
      : { demandForecast: resolved.demandForecast }),
  });
}

/* -------------------------------------------------------------------------- *
 * The plan
 * -------------------------------------------------------------------------- */

/** The one capability pre-positioning needs from a policy. Nothing wider. */
export type ParkableGroup = Pick<DispatchPolicy, 'reposition'>;

/**
 * Where every car in a bank should wait, in the order the cars were supplied.
 *
 * One decision per car, each with the full arithmetic that produced it — the anticipated per-call
 * saving, the one-off trip, and the net gain after `repositionEnergyWeight` — so a caller can log
 * *why* a car did not move, which is the failure mode this stage actually has. A bank where every
 * decision is `below-threshold` has its deadband set past what the shaft can pay for; a bank where
 * every decision is `no-forecast` has a predictor that was never wired in. Both look like "parking
 * does nothing" in a summary.
 *
 * Pure with respect to the policy and the cars. It does query the predictor, once.
 */
export function prepositionPlan(
  policy: ParkableGroup,
  cars: readonly CarSnapshot[],
  at: SimTime,
  context: PrepositionContext = {},
): readonly RepositionDecision[] {
  const resolved = resolvePrepositionContext(cars, at, context);
  return Object.freeze(
    cars.map((car) => policy.reposition(car, at, repositionContextFor(car, resolved))),
  );
}

/** The decisions that actually move a car, with a target. */
export function movesOf(
  plan: readonly RepositionDecision[],
): readonly (RepositionDecision & { readonly targetFloorId: string })[] {
  return Object.freeze(
    plan.filter(
      (decision): decision is RepositionDecision & { readonly targetFloorId: string } =>
        decision.move && decision.targetFloorId !== undefined,
    ),
  );
}

/** Distinct target floors the plan sends cars to. The measure of whether a bank spread out. */
export function parkingFloorIds(plan: readonly RepositionDecision[]): readonly string[] {
  return Object.freeze([...new Set(movesOf(plan).map((decision) => decision.targetFloorId))]);
}

/* -------------------------------------------------------------------------- *
 * Forecast helpers
 * -------------------------------------------------------------------------- */

/**
 * A {@link DemandForecastSource} over a fixed set of per-floor weights.
 *
 * **Not a predictor**, and deliberately not called one: it forecasts nothing, learns nothing, and
 * has no notion of time. It exists so a caller that already knows its demand — a synthetic
 * pattern, a measured histogram from a previous run, an operator's stated expectation — can drive
 * `predicted-demand` without a model, and so the wiring in this file can be tested against a
 * forecast whose content is known exactly rather than against a model's output.
 *
 * The learned per-floor, per-time-of-day arrival model is a separate module and satisfies the same
 * interface.
 */
export function fixedForecast(weights: ReadonlyMap<string, number>): DemandForecastSource {
  const frozen = new Map(weights);
  return Object.freeze({
    expectedDemandByFloor: (): ReadonlyMap<string, number> => frozen,
  });
}
