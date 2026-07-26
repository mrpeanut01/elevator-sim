/**
 * The cost-term registry — the one place the engine learns which terms exist.
 *
 * ## The extension point
 *
 * `scoringEngine.ts` iterates this array and never names a term. Landing Phase 5's nine
 * remaining terms (`rideTime`, `detourPenalty`, `existingCallDelay`, `loadFactor`,
 * `stopCount`, `starvation`, `zoneAffinity`, `predictedDemand`, `crowding`) is therefore:
 *
 * 1. one file per term, exporting a {@link CostTermDefinition} whose `evaluate` is pure;
 * 2. one row in {@link COST_TERMS};
 * 3. one `weights.<id>` row in `DISPATCH_PARAMETERS`, plus a `normalization.<scale>` row if
 *    the term needs a new saturating reference.
 *
 * No change to the engine, the lifecycle, the policy, or any existing term. That is the
 * property this indirection exists to buy, and `terms.test.ts` asserts the registry's shape
 * so a term added without its metadata fails a test rather than scoring silently wrong.
 *
 * ## Declared but not implemented
 *
 * `data/dispatcher-profiles.json → terms` declares twelve terms; this phase implements three.
 * A profile weighting the other nine still builds a working policy — the weights are carried
 * in `ResolvedDispatchConfig.pendingWeights` and contribute nothing. Rejecting them instead
 * would make `predictive-balanced` unloadable until Phase 5, which would mean the acceptance
 * criterion "load every profile" could not be met.
 *
 * That tolerance is exactly as wide as the library and no wider: {@link DECLARED_TERM_IDS} is
 * the twelve, and `resolveDispatchConfig` throws on anything else. `dispatcherProfilesSchema`
 * catches a misspelling in the data file, but it is not the only way a profile reaches the
 * engine — every fixture in this module, and every candidate a Phase 7 optimizer builds
 * through `DispatchPolicyOptions.weights`, is a hand-built object no schema ever sees.
 *
 * ## Order
 *
 * Registry order is the order breakdowns appear in a {@link CarScore} and the order the
 * weighted sum accumulates in. Fixed here rather than taken from the profile's key order, so
 * two profiles that weight the same terms sum them in the same sequence and get bit-identical
 * floating-point costs — the same reason `LoadSensor` re-sums rather than accumulating.
 */

import type { CostTermDefinition } from '../types.js';

import { distanceTravelledTerm } from './distanceTravelled.js';
import { directionReversalTerm } from './directionReversal.js';
import { waitTimeTerm } from './waitTime.js';

/**
 * Every implemented cost term, in a fixed order.
 *
 * Phase 2 implements the three docs/05-roadmap.md § Phase 2 asks for: the AWT term, the
 * energy proxy, and the term that expresses collective behaviour.
 */
export const COST_TERMS: readonly CostTermDefinition[] = Object.freeze([
  waitTimeTerm,
  distanceTravelledTerm,
  directionReversalTerm,
]);

/**
 * Every term id the library declares, implemented or not — the twelve rows of
 * `data/dispatcher-profiles.json → terms`, in file order.
 *
 * The vocabulary a profile may weight. A weight on anything else is a typo, and a typo is not
 * a harmless one: an unrecognised id contributes nothing, so a profile whose only weight is
 * misspelled scores every car at exactly zero and the "dispatcher" silently degrades into the
 * tie-break, lowest car id wins. That is a plausible-looking run of a system nobody
 * configured, which is the same failure an ignored hard constraint would be, and
 * `resolveDispatchConfig` treats it the same way: it throws.
 *
 * Duplicated here rather than read from the data file because this package is pure and
 * fs-free, and because a policy is routinely built from a hand-written object that never went
 * through `dispatcherProfilesSchema`. `policy.test.ts` pins the two together in both
 * directions, so the list cannot drift from the library it mirrors.
 */
export const DECLARED_TERM_IDS: readonly string[] = Object.freeze([
  'waitTime',
  'rideTime',
  'detourPenalty',
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

export { assessDirectionReversal, directionReversalTerm, directionReversals } from './directionReversal.js';
export type { ReversalAssessment } from './directionReversal.js';

export {
  distanceTravelledTerm,
  marginalDistanceM,
  pathLengthM,
  routeStartHeightM,
} from './distanceTravelled.js';

export { waitTimeSeconds, waitTimeTerm } from './waitTime.js';
