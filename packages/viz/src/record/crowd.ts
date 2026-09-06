/**
 * **Do two recordings share a crowd?** — GitHub issue #350, `docs/35` PM5.
 *
 * Three shipped surfaces put two runs side by side and say, in one form or another, *these two
 * runs met the same people*: Fix a building's as-built and repaired pair, the intervention's
 * pressed and unpressed pair (the re-simulated prefix is *"bit-identical by construction"*), and
 * the race strip's primary and rival (*"the same crowd, which is the whole of CRN"*). Until this
 * module every one of those was defended by an argument about the code — the trace is built
 * before the dispatcher sees it, no intervention arm writes demand, a purchase is fabric and never
 * population — and an argument is exactly what the claim already had. This is the assertion.
 *
 * ## What "the same crowd" means here — and the leg it deliberately does not read
 *
 * Two recordings agree on the crowd when, for every **first** leg, both carry a leg with the same
 * `(passengerId, arrivedAt, originFloorId, finalDestinationFloorId)` — **in both directions**, so a leg
 * on one side with no partner on the other is a difference whichever side it is on. What is
 * deliberately *not* compared is everything the dispatcher decides: `boardedAt`, `alightedAt`, the
 * car — **and every leg minted at a sky-lobby transfer**, which is the finding this module was
 * built on. The issue that asked for it proposed the four-field key over *every* leg; measured on
 * the shipped fix-it cases, that key came back *different* on all seven cases set in the three
 * transfer buildings (`secure-tower`, `vertical-city`, `mixed-use-high-rise`) while the runs' own
 * dispatcher patches touched no population. The legs that moved were the `leg20`, `leg21`, …
 * passengers: second legs, whose `arrivedAt` is the instant the *first* car dropped its rider at the
 * transfer floor. That instant is the dispatcher's doing, so a key that reads it compares the two
 * dispatchers and calls the answer a crowd. `VizLeg.legIndex` (schema version 11) is what lets the
 * check leave those out; a first leg is the traffic generator's own arrival, and the generator runs
 * before any dispatcher sees the day.
 *
 * The fourth field is the journey's **final** destination rather than the leg's, and that is the
 * same finding one repair over: `express-that-stops-everywhere` cures a fault by **zoning**, and
 * under the repaired zoning a `3 → 21` ride that was one direct leg becomes `3 → G` and `G → 21`.
 * The person, the instant, the origin and where they wanted to go are unchanged; the leg's own
 * destination is a route, and a route is the building's. `VizLeg.finalDestinationFloorId` lands at
 * the same version for this reader.
 *
 * Two runs of the same crowd under two dispatchers therefore differ on nothing this module reads,
 * which is what makes the check useful rather than tautological — and a run whose *generator*
 * output moved, which is what a population patch does, differs on the first legs themselves.
 *
 * ## Non-vacuity is part of the contract
 *
 * Two empty recordings are **not** the same crowd. A helper that compared two empty sets and
 * passed would certify a pair nobody ran, which is `deadCode.test.ts`'s own idiom applied to a
 * comparison: a check that can be satisfied by nothing having happened is not a check.
 *
 * ## Why the result is a list of sentences rather than a boolean alone
 *
 * A violation has to say *which pair and which leg*, or a red at one of three sites sends a reader
 * to the wrong one. {@link crowdDifferencesOf} names the passenger and what moved; {@link
 * sameCrowd} is the predicate over it; {@link assertSameCrowd} throws with the pair's own name in
 * front. The list is capped so a pair that shares nothing does not produce a thousand-line error.
 *
 * ## The fourth pair, which does not exist yet
 *
 * `docs/35` § 8 names a works-night pairing — the campaign day with a purchase against the day
 * without, same seed — and says this assertion covers it. That pairing is GitHub issue #353's and
 * is not built; when it lands it calls {@link assertSameCrowd} like the other three, and this
 * sentence is deleted on that commit.
 */

import type { VizLeg, VizRecording } from '../contract/types.js';

/** The part of a recording this module reads — so a test can hand in `{ legs }` and nothing else. */
export type CrowdSource = Pick<VizRecording, 'legs'>;

/** How many differing legs an error names before it says *and N more*. */
export const CROWD_DIFFERENCE_LIMIT = 8;

/** A leg the generator issued, as opposed to one a transfer minted. Absent `legIndex` is a fixture. */
function isFirstLeg(leg: VizLeg): boolean {
  return (leg.legIndex ?? 0) === 0;
}

/** The identity of a leg as the crowd knows it — nothing the dispatcher decided. */
function crowdKeyOf(leg: VizLeg): string {
  return `${leg.passengerId} ${String(leg.arrivedAt)} ${leg.originFloorId} ${goingTo(leg)}`;
}

/** Where the journey ends — the leg's own destination on a fixture that predates the field. */
function goingTo(leg: VizLeg): string {
  return leg.finalDestinationFloorId ?? leg.destinationFloorId;
}

function describeLeg(leg: VizLeg): string {
  return `passenger ${leg.passengerId} arriving at ${String(leg.arrivedAt)} s on ${leg.originFloorId} for ${goingTo(leg)}`;
}

/**
 * Every way the two crowds differ, as sentences, capped at {@link CROWD_DIFFERENCE_LIMIT} plus a
 * count of the rest. Empty when the two recordings share a crowd.
 *
 * Both directions: a leg only `left` carries and a leg only `right` carries are each named. A
 * passenger present on both sides whose arrival or floors moved is named **once**, as *moved*,
 * rather than as one leg missing from each side, because that is what a reader needs to know.
 */
export function crowdDifferencesOf(left: CrowdSource, right: CrowdSource): readonly string[] {
  const leftLegs = left.legs.filter(isFirstLeg);
  const rightLegs = right.legs.filter(isFirstLeg);
  if (leftLegs.length === 0 && rightLegs.length === 0) {
    return [
      'neither recording carries a first leg, so there is no crowd to compare — two empty runs are not the same crowd',
    ];
  }
  const leftByKey = new Map(leftLegs.map((leg) => [crowdKeyOf(leg), leg] as const));
  const rightByKey = new Map(rightLegs.map((leg) => [crowdKeyOf(leg), leg] as const));
  const leftByPassenger = new Map(leftLegs.map((leg) => [leg.passengerId, leg] as const));
  const rightByPassenger = new Map(rightLegs.map((leg) => [leg.passengerId, leg] as const));

  const differences: string[] = [];
  const moved = new Set<string>();
  for (const [key, leg] of leftByKey) {
    if (rightByKey.has(key)) continue;
    const partner = rightByPassenger.get(leg.passengerId);
    if (partner === undefined) {
      differences.push(`only the first run carries ${describeLeg(leg)}`);
    } else if (!moved.has(leg.passengerId)) {
      moved.add(leg.passengerId);
      differences.push(`${describeLeg(leg)} in the first run is ${describeLeg(partner)} in the second`);
    }
  }
  for (const [key, leg] of rightByKey) {
    if (leftByKey.has(key) || moved.has(leg.passengerId)) continue;
    if (!leftByPassenger.has(leg.passengerId)) {
      differences.push(`only the second run carries ${describeLeg(leg)}`);
    }
  }
  if (differences.length > CROWD_DIFFERENCE_LIMIT) {
    const rest = differences.length - CROWD_DIFFERENCE_LIMIT;
    return [...differences.slice(0, CROWD_DIFFERENCE_LIMIT), `and ${String(rest)} more`];
  }
  return differences;
}

/** Whether the two recordings met the same crowd. `false` for two empty recordings — see above. */
export function sameCrowd(left: CrowdSource, right: CrowdSource): boolean {
  return crowdDifferencesOf(left, right).length === 0;
}

/**
 * Throw unless the two recordings share a crowd, naming the pair that made the claim and the
 * first legs that break it. `pair` is the surface's own noun — *the fix-it pair*, *the
 * intervention pair*, *the race* — so a red says where to look.
 */
export function assertSameCrowd(left: CrowdSource, right: CrowdSource, pair: string): void {
  const differences = crowdDifferencesOf(left, right);
  if (differences.length === 0) return;
  throw new Error(
    `${pair} claims both runs met the same crowd, and they did not: ${differences.join('; ')}. ` +
      'Two runs that do not share a crowd may not be drawn on one scale or paired figure by figure.',
  );
}
