/**
 * Which policy runs a profile — a table, not a conditional.
 *
 * ```ts
 * const policy = createPolicyFor(profile, options);   // sim/simulation.ts builds every bank this way
 * ```
 *
 * CLAUDE.md invariant 7 is explicit about the failure this file exists to avoid: *"If you find
 * yourself writing `if (strategy === 'nearest-car')`, stop — that belongs in config."* Two
 * aggregations therefore cannot be selected by a name comparison anywhere in the run loop, and
 * they are not: the profile declares `auction.aggregation`, this module holds one frozen record
 * from that value to a factory, and selection is a lookup.
 *
 * | `auction.aggregation` | Factory | What it is |
 * |---|---|---|
 * | `central-argmin` (default) | `createDispatchPolicy` | the group controller minimises over every eligible car |
 * | `contract-net` | `createAuctionPolicy` | each car bids, and a provisional winner may take its bid back |
 *
 * ## Why this is a lookup and not a `switch`
 *
 * A `switch` over two values is the same computation today and a different *contract* tomorrow.
 * The record is enumerable, so `AGGREGATIONS` and the factory table are checkable against each
 * other — `policies.test.ts` asserts every declared aggregation has a factory and every factory a
 * declared aggregation, which is the invariant-8 statement one level up from a weight vector: an
 * aggregation an optimizer can sample but not build would be a categorical dimension with a hole
 * in it. A `switch` with a `default` branch hides exactly that hole.
 *
 * ## What it is *not* a selector for
 *
 * Not the engine. There is one engine — `cost(car, call) = Σᵢ wᵢ · normalize(termᵢ)` — and both
 * factories build a policy that computes it identically from the same term library and the same
 * pure `Car.estimateCost()`. `AuctionDispatchPolicy.engine` is `'weighted-cost'` for that reason
 * and it is literally true; docs/06 § *Where auction dispatch fits* says the auction *"uses the
 * same term library … but changes who aggregates"*. Keying this table on `engine` would have made
 * one field mean two things and would have put an aggregation where a cost function belongs.
 *
 * ## Sealed-bid is the control arm, and it is not a second dispatcher
 *
 * `contract-net` at `auction.rounds: 1` is provably the centralized argmin — `auction.ts` proves
 * it against the weighted-cost policy over a deterministic sweep and requires the full
 * `DispatchDecision` to be equal. So a benchmark of `auction` (rounds 1) against `eta` measures
 * the weight vector, and a benchmark of `auction` against `auction-multi-round` measures the
 * aggregation and nothing else. Both are authored as profiles.
 */

import type { Aggregation, DispatcherProfile } from '../../config/types.js';
import { createDispatchPolicy } from '../policy.js';
import { DispatchError, type DispatchPolicy, type DispatchPolicyOptions } from '../types.js';

import { createAuctionPolicy } from './auction.js';
import { POLICY_DEFAULTS } from './parameters.js';
import type { AuctionPolicyOptions, AuctionProfileSource } from './types.js';

/**
 * Build a group controller from a profile.
 *
 * `AuctionProfileSource` rather than `DispatcherProfile`, and {@link AuctionPolicyOptions} rather
 * than `DispatchPolicyOptions`, so the same table serves a hand-built fixture and an optimizer's
 * unpersisted candidate. A real `DispatcherProfile` satisfies the source structurally.
 */
export type DispatchPolicyFactory = (
  profile: AuctionProfileSource,
  options: AuctionPolicyOptions,
) => DispatchPolicy;

/**
 * Aggregation to factory. The whole of "which dispatcher", as data.
 *
 * Frozen and total over {@link Aggregation}: `Record<Aggregation, …>` makes a new value in
 * `AGGREGATIONS` without a row here a **compile error**, which is the property a `switch` with a
 * `default` branch cannot offer.
 */
export const POLICY_FACTORIES: Readonly<Record<Aggregation, DispatchPolicyFactory>> = Object.freeze(
  {
    'central-argmin': (profile, options) => createDispatchPolicy(profile, options),
    'contract-net': (profile, options) => createAuctionPolicy(profile, options),
  },
);

/**
 * The aggregation a profile declares, with the default applied.
 *
 * Reads the authored section only, never a resolved config: this runs *before* a policy exists, so
 * it cannot ask a policy which policy to be. Options win over the profile, the same precedence
 * `resolveAuctionConfig` uses, so an optimizer can sweep the aggregation without rewriting the
 * data file.
 */
export function aggregationOf(
  profile: AuctionProfileSource,
  options: AuctionPolicyOptions = {},
): Aggregation {
  return options.auction?.aggregation ?? profile.auction?.aggregation ?? POLICY_DEFAULTS.aggregation;
}

/**
 * Build the group controller the profile asks for.
 *
 * The one place a run turns a profile into a policy. Every stage setting, every weight and every
 * validation is the factory's; this adds the lookup and the error for a value that named no
 * factory — thrown rather than defaulted, because an unrecognised aggregation that quietly became
 * the central argmin would report a contract-net benchmark that never held an auction.
 *
 * @throws DispatchError if `auction.aggregation` names no factory.
 */
export function createPolicyFor(
  profile: AuctionProfileSource,
  options: AuctionPolicyOptions = {},
): DispatchPolicy {
  const aggregation = aggregationOf(profile, options);
  // Widened deliberately: the key is *data*, and a hand-built fixture or a JSON file can carry a
  // value the type system was told could not exist. A total `Record<Aggregation, …>` gives the
  // compile-time completeness check; this gives the runtime one.
  const factory: DispatchPolicyFactory | undefined = POLICY_FACTORIES[aggregation];
  if (factory === undefined) {
    throw new DispatchError(
      `Dispatcher "${profile.id}" declares auction.aggregation "${String(aggregation)}", which names no policy factory. Known aggregations: ${Object.keys(POLICY_FACTORIES).join(', ')}. An aggregation that silently fell back to the default would report a contract-net result produced by the centralized argmin.`,
    );
  }
  return factory(profile, options);
}

/**
 * A real `DispatcherProfile` is an {@link AuctionProfileSource}, pinned at compile time.
 *
 * The claim `sim/simulation.ts` relies on when it hands a loaded profile straight to
 * {@link createPolicyFor}. Structural, so neither file needs a cast and a divergence between the
 * authored shape and what a factory reads is an error here rather than at a call site.
 */
export const profileAsPolicySource = (profile: DispatcherProfile): AuctionProfileSource => profile;
