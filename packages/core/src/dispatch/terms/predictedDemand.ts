/**
 * `predictedDemand` — how badly serving this call would leave the car out of position for the
 * demand that is coming. Serves pre-positioning.
 *
 * ```
 * end = where the car's route ends once it has served this call
 * raw = Σ_f forecast(f) · |height(f) − end|  /  Σ_f forecast(f)              (metres)
 * ```
 *
 * The demand-weighted mean distance from where the car will finish to where the calls are
 * expected. A car that ends its route in the middle of tomorrow's demand scores near zero; one
 * that ends at the far end of the shaft from it pays. Serving a call is not free of positional
 * consequence, and this is the term that says so.
 *
 * ## Where the forecast comes from — the predictor, not this file
 *
 * The forecast is the **predictor's** output: a learned per-floor, per-time-of-day arrival model
 * with `idle.predictorHorizonS` and `idle.predictorLearningRate` behind it. This term does not
 * build one, and structurally it could not:
 *
 * - a predictor is **stateful** — it has a learning rate and updates as arrivals happen — and a
 *   cost term is a pure function of its context (CLAUDE.md invariant 1). There is nowhere in
 *   `evaluate(context)` to put a model, and no legitimate way for it to learn;
 * - `TermContext` carries no clock beyond `at` and no building, so a term cannot know the
 *   time-of-day bucket or the population it would need to forecast from;
 * - the forecast must be resolved **once per decision** and shared, or a twelve-term weight
 *   vector would run the predictor twelve times per car.
 *
 * So the predictor produces one forecast per decision and it arrives on the observation. The
 * shape is not restated here: `observation.ts` types the field as the return of the predictor's
 * own `DemandForecast.expectedDemandByFloor(at)`, through a type-only import, so a change to
 * what the predictor produces breaks this term at compile time rather than silently. It is also
 * exactly what `RepositionContext.demandForecast` declares. One forecast, one type, read by
 * stage 3 here and by stage 7 there, so a run cannot pre-position against one future while
 * scoring its calls against another. `policies/groupContext.ts` is the other end of the
 * hand-off; see `observation.ts` for the one-line reconciliation both ends still need.
 *
 * ## Inert without a forecast
 *
 * No forecast, an empty one, or one whose weights sum to zero: the term scores zero. The same
 * choice `repositionDecisionFor` makes when it reports `no-forecast` rather than guessing, and
 * for the same reason — a fabricated forecast would produce a plausible-looking run of a system
 * nobody configured.
 *
 * Floors the shaft does not serve are skipped: demand this car cannot answer is not this car's
 * misalignment. Negative and non-finite forecast weights are skipped too, so a predictor
 * emitting nonsense degrades to "no opinion" instead of poisoning the weighted sum.
 *
 * Pure. Reads the shared {@link routeComparison} and the observation.
 */

import { shaftFloor } from '../../model/car/types.js';
import type { CostTermDefinition, TermContext } from '../types.js';

import { routeStartHeightM } from './distanceTravelled.js';
import { demandForecastOf } from './observation.js';
import { routeComparison } from './routeComparison.js';

/**
 * Height above datum where the car's route ends once it has served this call, metres.
 *
 * The last stop of the projected route, or — for a car with nothing to do and no call it can
 * serve — where the route would start, which for a moving car is the floor it is committed to
 * and cannot stop short of.
 */
export function routeEndHeightM(context: TermContext): number {
  const projected = routeComparison(context).projected;
  const last = projected[projected.length - 1];
  return last === undefined ? routeStartHeightM(context.car) : last.heightM;
}

/** Demand-weighted mean metres between where the car will end up and where demand is forecast. */
export function demandMisalignmentM(context: TermContext): number {
  const forecast = demandForecastOf(context.observation);
  if (forecast === undefined || forecast.size === 0) return 0;

  const endHeightM = routeEndHeightM(context);
  let weight = 0;
  let weighted = 0;

  for (const [floorId, expected] of forecast) {
    if (!Number.isFinite(expected) || expected <= 0) continue;
    const floor = shaftFloor(context.car.shaft, floorId);
    // Demand this shaft cannot answer is not this car's misalignment.
    if (floor === undefined) continue;
    weight += expected;
    weighted += expected * Math.abs(floor.heightM - endHeightM);
  }

  return weight > 0 ? weighted / weight : 0;
}

/** Metres, on the `distanceM` reference: it is a distance in the shaft, like `distanceTravelled`. */
export const predictedDemandTerm: CostTermDefinition = Object.freeze({
  id: 'predictedDemand',
  unit: 'm',
  measures: 'Misalignment with forecast future calls',
  // Everyday Mode's words for this term — engine contract §6.3, issue #147. Two readers,
  // two vocabularies: `measures` stays addressed to an optimizer, these to a player.
  player: Object.freeze({
    name: 'predicted demand',
    serves: 'pre-positioning',
    atZero: 'react only',
    atFull: 'move before the crowd does',
  } as const),
  normalization: Object.freeze({ mode: 'saturating', scale: 'distanceM' } as const),
  evaluate: demandMisalignmentM,
});
