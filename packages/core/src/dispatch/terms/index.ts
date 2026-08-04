/**
 * The cost-term registry — the one place the engine learns which terms exist.
 *
 * ## The extension point
 *
 * `scoringEngine.ts` iterates this array and never names a term, which is what made landing
 * Phase 5's nine remaining terms an additive change:
 *
 * 1. one file per term, exporting a {@link CostTermDefinition} whose `evaluate` is pure;
 * 2. one row in {@link COST_TERMS};
 * 3. `weights.<id>` in `DISPATCH_PARAMETERS` — which needs no edit either, because that array
 *    is *derived* from this registry.
 *
 * No change to the engine, the lifecycle, the policy, or any existing term, and none was made.
 * `terms.test.ts` asserts the registry's shape so a term added without its metadata fails a test
 * rather than scoring silently wrong.
 *
 * ## The library is now complete
 *
 * `data/dispatcher-profiles.json → terms` declares thirteen terms and all thirteen are implemented,
 * so {@link IMPLEMENTED_TERM_IDS} and {@link DECLARED_TERM_IDS} name the same set and
 * `ResolvedDispatchConfig.pendingWeights` is empty for every profile the file ships.
 *
 * The pending machinery stays, and deliberately: it is what separates *"declared but not yet
 * implemented"* from *"not a term at all"*, and the second must keep throwing. An unrecognised
 * id contributes nothing, so a profile whose only weight is misspelled scores every car at
 * exactly zero and the "dispatcher" degrades into the tie-break, lowest car id wins — a
 * plausible-looking run of a system nobody configured. `resolveDispatchConfig` throws on it, and
 * it must go on throwing whether or not the library happens to be complete today.
 *
 * ## Every registered term must be able to change a decision
 *
 * A term can be wrong by computing the wrong number, or **inert** — registered, weighted by a
 * shipped profile, and returning the same value for every candidate car in every configuration the
 * engine can be put in. The second is worse, because nothing fails: boundedness passes, purity
 * passes, the run completes, and a Phase 7 optimizer burns replications on a dimension that cannot
 * move an `argmin`. Three terms shipped that way and no test caught it — `rideTime` because no
 * profile set `dispatch.callType`, `zoneAffinity` and `predictedDemand` because
 * `lifecycle.observationFor` dropped the two fields the group controller owns.
 *
 * `liveness.test.ts` is the guard: it drives **every** term in this registry through
 * `policy.score()` on a real building and requires a non-zero raw *and* a spread between candidate
 * cars. A new term that cannot discriminate fails there, whatever its own file says about it.
 * Where a term is genuinely live only under some stage setting — `rideTime` needs a call type that
 * carries a destination — the term declares it as `activeWhen` and `parameters.ts` copies it onto
 * the `weights.<id>` row, so the optimizer skips the dimension instead of searching it (CLAUDE.md
 * invariant 8). See `observation.ts` for the group-owned facts and why a term must not guess one.
 *
 * ## Order
 *
 * Registry order is the order breakdowns appear in a {@link CarScore} and the order the weighted
 * sum accumulates in. It is the order of the `terms` array in `data/dispatcher-profiles.json`,
 * so a breakdown reads in the same sequence as the library it came from — fixed here rather than
 * taken from the profile's key order, so two profiles that weight the same terms sum them in the
 * same sequence and get bit-identical floating-point costs. That is the same reason
 * `LoadSensor` re-sums rather than accumulating.
 */

import type { CostTermDefinition } from '../types.js';

import { crowdingTerm } from './crowding.js';
import { detourPenaltyTerm } from './detourPenalty.js';
import { diversionDetourTerm } from './diversionDetour.js';
import { directionReversalTerm } from './directionReversal.js';
import { distanceTravelledTerm } from './distanceTravelled.js';
import { existingCallDelayTerm } from './existingCallDelay.js';
import { loadFactorTerm } from './loadFactor.js';
import { predictedDemandTerm } from './predictedDemand.js';
import { rideTimeTerm } from './rideTime.js';
import { starvationTerm } from './starvation.js';
import { stopCountTerm } from './stopCount.js';
import { waitTimeTerm } from './waitTime.js';
import { zoneAffinityTerm } from './zoneAffinity.js';

/**
 * Every implemented cost term, in the order `data/dispatcher-profiles.json` declares them.
 *
 * All thirteen of docs/06-parameterization-and-tuning.md § Term library: the three Phase 2 owed
 * (the AWT term, the energy proxy, the collective-behaviour term) and the nine Phase 5 owed.
 */
export const COST_TERMS: readonly CostTermDefinition[] = Object.freeze([
  waitTimeTerm,
  rideTimeTerm,
  detourPenaltyTerm,
  diversionDetourTerm,
  existingCallDelayTerm,
  directionReversalTerm,
  loadFactorTerm,
  stopCountTerm,
  distanceTravelledTerm,
  starvationTerm,
  zoneAffinityTerm,
  predictedDemandTerm,
  crowdingTerm,
]);

/**
 * Every term id the library declares, implemented or not — the thirteen rows of
 * `data/dispatcher-profiles.json → terms`, in file order.
 *
 * The vocabulary a profile may weight. A weight on anything else is a typo, and a typo is not a
 * harmless one: see the module docstring for what a misspelled weight does to a decision.
 *
 * Duplicated here rather than read from the data file because this package is pure and fs-free,
 * and because a policy is routinely built from a hand-written object that never went through
 * `dispatcherProfilesSchema`. `policy.test.ts` pins the two together in both directions, so the
 * list cannot drift from the library it mirrors.
 *
 * Kept as its own constant even though it now equals {@link IMPLEMENTED_TERM_IDS}: the two
 * answer different questions — *"is this a term?"* and *"can it contribute to a score?"* — and
 * collapsing them would silently turn a future declared-but-pending term into a typo.
 */
export const DECLARED_TERM_IDS: readonly string[] = Object.freeze([
  'waitTime',
  'rideTime',
  'detourPenalty',
  'diversionDetour',
  'existingCallDelay',
  'directionReversal',
  'loadFactor',
  'stopCount',
  'distanceTravelled',
  'starvation',
  'zoneAffinity',
  'predictedDemand',
  'crowding',
]);

const DECLARED_TERM_ID_SET: ReadonlySet<string> = new Set(DECLARED_TERM_IDS);

/** Whether the cost-term library declares this id at all. Implemented or pending. */
export function isDeclaredTerm(id: string): boolean {
  return DECLARED_TERM_ID_SET.has(id);
}

/** Term id to definition. */
export const COST_TERMS_BY_ID: ReadonlyMap<string, CostTermDefinition> = new Map(
  COST_TERMS.map((term) => [term.id, term]),
);

/** The ids this phase implements, in registry order. */
export const IMPLEMENTED_TERM_IDS: readonly string[] = Object.freeze(
  COST_TERMS.map((term) => term.id),
);

/** A term by id, or `undefined` when no phase has implemented it yet. */
export function costTerm(id: string): CostTermDefinition | undefined {
  return COST_TERMS_BY_ID.get(id);
}

/** Whether a term id is implemented and can therefore contribute to a score. */
export function isImplementedTerm(id: string): boolean {
  return COST_TERMS_BY_ID.has(id);
}

/* -------------------------------------------------------------------------- *
 * The terms, alphabetically by module
 * -------------------------------------------------------------------------- */

export { crowdingTerm, spareSeatsOnArrival, unservedQueueFraction } from './crowding.js';

export { detourPassengerSeconds, detourPenaltyTerm } from './detourPenalty.js';
export {
  callCausesDiversion,
  diversionDetourPassengerSeconds,
  diversionDetourTerm,
} from './diversionDetour.js';

export {
  assessDirectionReversal,
  directionReversalTerm,
  directionReversals,
} from './directionReversal.js';
export type { ReversalAssessment } from './directionReversal.js';

export {
  distanceTravelledTerm,
  marginalDistanceM,
  pathLengthM,
  routeStartHeightM,
} from './distanceTravelled.js';

export { existingCallDelaySeconds, existingCallDelayTerm } from './existingCallDelay.js';

export { loadFactorTerm, resultingLoadFactor } from './loadFactor.js';

export { demandForecastOf, zoneFloorIdsFor } from './observation.js';
export type { ExpectedDemandByFloor } from './observation.js';

export {
  demandMisalignmentM,
  predictedDemandTerm,
  routeEndHeightM,
} from './predictedDemand.js';

export { rideTimeSeconds, rideTimeTerm } from './rideTime.js';

export { compareRoutes, routeComparison } from './routeComparison.js';
export type { DelayedStop, RouteComparison } from './routeComparison.js';

export {
  STARVATION_HALF_COST_S,
  oldestDelayedCallAgeS,
  starvationSeconds,
  starvationTerm,
} from './starvation.js';

export { addedStopCount, stopCountTerm } from './stopCount.js';

export { waitTimeSeconds, waitTimeTerm } from './waitTime.js';

export { zoneAffinityTerm, zoneDeviationM } from './zoneAffinity.js';
