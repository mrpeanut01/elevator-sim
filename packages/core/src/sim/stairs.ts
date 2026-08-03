/**
 * Stairs: the transport mode nobody is sent over and some people take anyway.
 *
 * ## What is different about a stair, and why it needed code at all
 *
 * `TransportModeConfig` has carried non-lift connections since `vertical-city` declared its lobby
 * escalators, and `traffic/route.ts` routes journeys over them. That is the right model for an
 * escalator: it is **structural**, the geometry says those two floors connect, and the passenger
 * has no say in the matter.
 *
 * A stair is not that. It is **offered**, and mostly declined. So the router never sees one —
 * `routeTopologyOf` filters `kind: 'stairs'` out of its edge set — and this module makes the offer
 * instead, **in trace order before the run starts** (see below), on two conditions:
 *
 * 1. the journey's two ends are joined by a declared stairs mode;
 * 2. the drawn propensity for that direction clears.
 *
 * docs/14 § 3.3 lists a third — *"the journey is within a declared floor-count reach"* — and on
 * this data shape it is **not independently expressible**: `connects` is a pair, so the mode's
 * span is fixed and condition 1 already decides it. The array form that appeared to separate the
 * two was measured to be dead in every entry but its last; `StairsUseConfig` records that, and it
 * is a correction to the contract rather than a requirement quietly dropped.
 *
 * ## Both asymmetries, and why either alone is worse than neither
 *
 * A stair is asymmetric twice over, and the two are independent:
 *
 * - **Cost** — climbing takes longer than descending (`traversalTimeS: { upS, downS }`).
 * - **Willingness** — far more people will walk down two floors than up two (`use.up` /
 *   `use.down`, selected by the *sign* of the delta).
 *
 * Model only the cost and you get riders cheerfully climbing forty floors, slowly. Model only the
 * willingness and the ones who do climb arrive as fast as those going down. Neither is a building,
 * and a model symmetric in `|Δfloor|` is **worse than no model**: it would quietly claim
 * up-traffic self-relieves at the same rate as down-traffic, when down-peak is exactly where a
 * real building's stairs take load off the lifts.
 *
 * ## The draw is taken in trace order, before the run starts
 *
 * For `sim/patience.ts`'s reason, which applies unchanged: a draw taken as riders appear would be
 * ordered by nothing the dispatcher does *here* — batch instants come from the trace — but
 * pre-drawing keeps the rule uniform and makes the table a pure function of `(trafficSeed, trace)`
 * that can be inspected without running anything. Only a journey that is genuinely **offered** a
 * stair consumes a draw, so a building with no stairs never touches the `modeChoice` stream.
 *
 * **The header used to say the offer is made "at the moment the rider appears at the landing".**
 * It is not, and the two sentences contradicted each other three paragraphs apart. `#onBatchArrival`
 * *applies* a decision this module took before the first event fired.
 *
 * Nothing here reads a clock (invariant 3); every draw comes from the injected stream
 * (invariant 2).
 */

import type { ResolvedBuilding, TransportModeConfig } from '../config/types.js';
import type { Rng } from '../random/rng.js';

/** A stairs mode a journey may be offered, with the seconds it would actually cost them. */
export interface StairsOffer {
  /** `TransportModeConfig.id` of the stair taken. */
  readonly modeId: string;
  /** Seconds this journey spends on it — `upS` climbing, `downS` descending. */
  readonly transitS: number;
}

/**
 * Unordered floor-pair key, so a mode is found from either end.
 *
 * `|` is not in `DEFAULT_ID_PATTERN`, so no floor id can contain one and no two distinct pairs can
 * collide on a key. It replaced a NUL separator, which worked and was a mistake: the repository's
 * `grep` wraps `ugrep -I` and skips a file it deems binary **by printing nothing**, so a source
 * carrying a raw NUL makes every negative search over it worthless. `packages/viz`'s dead-code
 * audit refuses to scan such a file rather than reporting a clean sweep of it, and that is what
 * caught this one.
 */
function pairKeyOf(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Every declared stairs mode, indexed by the floor pair it joins.
 *
 * **Empty on every building that declares none**, which is every building this repository ships —
 * so {@link stairsOfferFor} returns `undefined` without looking at anything and the `modeChoice`
 * stream is never drawn from.
 */
export function stairsIndexOf(
  building: ResolvedBuilding,
): ReadonlyMap<string, TransportModeConfig> {
  const index = new Map<string, TransportModeConfig>();
  for (const mode of building.transportModes ?? []) {
    if ((mode.kind ?? 'escalator') !== 'stairs') continue;
    // First declared wins, matching `route.ts`'s tie rule: declared order decides, so the choice
    // is a stable property of the config rather than of iteration order (invariant 4's spirit).
    const key = pairKeyOf(mode.connects[0], mode.connects[1]);
    if (!index.has(key)) index.set(key, mode);
  }
  return index;
}

/**
 * The offer this journey would be made, or `undefined` when it is made none.
 *
 * `undefined` covers both *"no stair joins those floors"* and *"the stair joins them but the climb
 * is beyond its reach"*. Neither consumes a draw, which is what {@link drawStairsChoices} relies
 * on to leave the `modeChoice` stream untouched on a building without stairs.
 *
 * Pure, and total: a malformed curve cannot be authored past `transportModeSchema`.
 */
export function stairsOfferFor(
  index: ReadonlyMap<string, TransportModeConfig>,
  originFloorId: string,
  originFloorIndex: number,
  destinationFloorId: string,
  destinationFloorIndex: number,
): { readonly offer: StairsOffer; readonly propensity: number } | undefined {
  if (index.size === 0) return undefined;
  const mode = index.get(pairKeyOf(originFloorId, destinationFloorId));
  if (mode === undefined || mode.use === undefined) return undefined;

  // **Signed**, never `Math.abs`. The whole point of declaring two numbers is that the sign
  // decides which is read; a distance would silently average a climb with a descent.
  const delta = destinationFloorIndex - originFloorIndex;
  if (delta === 0) return undefined;
  const propensity = delta > 0 ? mode.use.up : mode.use.down;
  if (propensity <= 0) return undefined;

  const transitS =
    typeof mode.traversalTimeS === 'number'
      ? mode.traversalTimeS
      : delta > 0
        ? mode.traversalTimeS.upS
        : mode.traversalTimeS.downS;
  return { offer: { modeId: mode.id, transitS }, propensity };
}

/** What {@link drawStairsChoices} needs to know about one journey. */
export interface StairsCandidate {
  readonly journeyId: string;
  readonly originFloorId: string;
  readonly originFloorIndex: number;
  readonly finalDestinationFloorId: string;
  readonly finalDestinationFloorIndex: number;
}

/**
 * Who takes the stairs, decided in trace order before anything moves.
 *
 * Returns only the journeys that **took** them; a journey that was offered a stair and declined it
 * is absent, exactly as one that was never offered anything is. The distinction is not needed
 * downstream and keeping it would invite a caller to treat "declined" as a state a rider is in.
 *
 * One draw per **offered** journey, and none at all for the rest, which is what leaves the
 * `modeChoice` stream untouched on every building that declares no stair.
 */
export function drawStairsChoices(
  rng: Rng,
  index: ReadonlyMap<string, TransportModeConfig>,
  journeys: readonly StairsCandidate[],
): ReadonlyMap<string, StairsOffer> {
  const taken = new Map<string, StairsOffer>();
  if (index.size === 0) return taken;
  for (const journey of journeys) {
    const offered = stairsOfferFor(
      index,
      journey.originFloorId,
      journey.originFloorIndex,
      journey.finalDestinationFloorId,
      journey.finalDestinationFloorIndex,
    );
    if (offered === undefined) continue;
    if (rng.nextFloat() < offered.propensity) taken.set(journey.journeyId, offered.offer);
  }
  return taken;
}
