/**
 * `experiments/oracle` — reconciling a simulated up-peak against the closed form.
 *
 * The reusable half of the Phase 2 acceptance gate. The gate itself lives in
 * `packages/core/src/analytical/validation.test.ts`, because it has to drive the simulator and
 * `core` cannot depend on this package; what is here is the arithmetic that turns two sets of
 * numbers into a verdict, which Phase 3's replication runner needs anyway.
 *
 * **Phase 8 extended this from two buildings to five.** `./upPeakCase.ts` derives the closed
 * form's inputs for any of the fourteen shipped banks, isolates a bank as a building the simulator
 * can run, and reduces a run record to what {@link reconcileRoundTrip} consumes;
 * `fiveBuildings.test.ts` is the always-on reconciliation across all five buildings,
 * `bankCensus.test.ts` the arithmetic-only census over all fourteen banks, and
 * `deepCampaign.test.ts` the opt-in campaign over the eleven measurable ones at n = 128.
 * `./DECISIONS-T13.md` records the decisions those took, and the four defects they surfaced in
 * code outside this module.
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

/* -------------------------------------------------------------------------- *
 * Phase 8's `./upPeakCase.js` is deliberately NOT re-exported here.
 *
 * That module drives the arithmetic above on an arbitrary shipped bank: it derives the closed
 * form's inputs for any of the fourteen, isolates a bank as a building the simulator can run, and
 * measures a round trip off the record. Its callers are
 * `oracle/fiveBuildings.test.ts` (the always-on five-building reconciliation),
 * `oracle/deepCampaign.test.ts` (every measurable bank at n = 128) and
 * `validation/physics.test.ts` (which takes each building's `df` from the oracle's own derivation
 * rather than from a literal) — **three test files and no shipped path.**
 *
 * `docs/05-roadmap.md`'s standing requirement asks for the non-test caller to be *named*. Here the
 * honest answer is that there is none, and none is wanted: this is an **acceptance gate's
 * apparatus**, in exactly the position `src/index.ts` describes for `validation/` — "an executable
 * argument rather than a library" — and putting it on the package surface would claim otherwise.
 * Two concrete costs would come with it: `index.test.ts` requires this barrel and the package
 * barrel to carry identical surfaces, so exporting it widens the published API of
 * `@elevator-sim/experiments`; and everything above imports nothing at all, while `upPeakCase.ts`
 * pulls in the whole of `@elevator-sim/core`, so a browser bundle importing `oracle/` for the
 * reconciliation arithmetic would acquire the simulator with it.
 *
 * A Phase 6 comparison that needs it imports `oracle/upPeakCase.js` directly — and if one ever
 * ships, this note gets a caller to name and the decision can be revisited with evidence.
 * -------------------------------------------------------------------------- */

export type {
  ClosedFormRoundTrip,
  CompletedRoundTrip,
  MeasuredRoundTrip,
  ReconciliationTerm,
  RelativeDivergence,
  ReplicationStatistic,
  RoundTripReconciliation,
} from './types.js';
