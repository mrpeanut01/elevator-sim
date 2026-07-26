/**
 * `experiments/oracle` — reconciling a simulated up-peak against the closed form.
 *
 * The reusable half of the Phase 2 acceptance gate. The gate itself lives in
 * `packages/core/src/analytical/validation.test.ts`, because it has to drive the simulator and
 * `core` cannot depend on this package; what is here is the arithmetic that turns two sets of
 * numbers into a verdict, which Phase 3's replication runner needs anyway.
 *
 * ```ts
 * import { reconcileRoundTrip, summariseReplications } from '@elevator-sim/experiments';
 *
 * const reconciliation = reconcileRoundTrip({
 *   // analytical/, re-evaluated at the load the simulator actually carried
 *   closedForm: matched.result,
 *   // the same population model with jerk-limited flights and real door dwells
 *   completed: { flightS, dwellS, fixedS, stops },
 *   measured: {
 *     roundTripS: summariseReplications(perRunRoundTrip),
 *     passengersPerTrip: summariseReplications(perRunLoad),
 *     stopsPerTrip: summariseReplications(perRunStops),
 *     intervalS: summariseReplications(perRunInterval),
 *     percentPopulation5Min: summariseReplications(perRunCapacity),
 *   },
 * });
 *
 * reconciliation.rawDivergence; //  0.316 — 32 % long against the textbook figure
 * reconciliation.residual;      // -0.0003 — and none of it unexplained
 * reconciliation.explained;     //  true
 * reconciliation.terms;         //  +33.6 s acceleration, +13.5 s minimum dwell
 * ```
 *
 * Everything exported here is pure and imports nothing — see `./types.ts` for why the input
 * types are structural rather than imported from `@elevator-sim/core`.
 */

export {
  DEFAULT_RESIDUAL_TOLERANCE,
  constantSpeedPenalty,
  departureGapBracket,
  reconcileRoundTrip,
  relativeDivergence,
  summariseReplications,
} from './reconcile.js';

export type { DepartureGapBracket } from './reconcile.js';

export type {
  ClosedFormRoundTrip,
  CompletedRoundTrip,
  MeasuredRoundTrip,
  ReconciliationTerm,
  RelativeDivergence,
  ReplicationStatistic,
  RoundTripReconciliation,
} from './types.js';
