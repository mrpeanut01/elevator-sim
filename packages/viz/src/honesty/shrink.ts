/**
 * Shrinking: turning a counterexample nobody can read into the smallest one that still fails.
 *
 * ## Why this is much simpler than `fuzz/shrink.ts`, and why that is a feature
 *
 * `experiments`' shrinker performs **building surgery** — removing a floor and every one of the
 * three places that names it — because its cases are generated graphs. This search's cases are
 * shipped configurations: a building id out of `data/buildings/`, a profile id out of
 * `data/dispatcher-profiles.json`, a stage id out of `data/campaign.json`. Nothing here can
 * produce a config the schema rejects, so the reducers are over the **scalar** axes and over the
 * two id axes, and every candidate is by construction runnable.
 *
 * That has one consequence worth stating: shrinking here is cheap enough to leave on. A shrunk
 * case runs one recording and `2 × replications` batch replications, and the reducers drive
 * `replications` down first precisely because that is where the wall clock is.
 *
 * ## The rule that makes shrinking honest
 *
 * A candidate is accepted only if it still violates **a property the original violated**. This is
 * `fuzz/shrink.ts`'s rule verbatim, and for its reason: shrinking toward *"some property fails"*
 * would wander from an R3 leak to an unrelated R10 hit and report the wrong minimal case. The
 * target set is computed from the original outcome and never widened.
 *
 * ## Replay
 *
 * A shrunk case is a hand-reduced neighbour of a generated one, so it is **not** reproducible
 * from `honestySeed` alone — `caseFromSeed` gives back the unshrunk parent. `honestySeed` is
 * carried anyway, so the parent is always one call away, and `formatHonestyCase` prints the shrunk
 * case in full. A counterexample nobody can replay is a rumour.
 */

import { evaluateCase, isFailure, type HonestyResources } from './run.js';
import type { HonestyCase, HonestyOutcome, HonestyProperty } from './types.js';

/** How hard to try. Each step runs simulations, so the budget is a wall-clock budget. */
export interface ShrinkOptions {
  /** Maximum candidate evaluations. 60 by default. */
  readonly budget?: number | undefined;
}

export interface HonestyShrinkResult {
  readonly original: HonestyOutcome;
  /** The smallest case found that still violates a property the original violated. */
  readonly minimal: HonestyOutcome;
  /** Reductions accepted. */
  readonly steps: number;
  /** Candidates evaluated, accepted or not. */
  readonly evaluations: number;
}

/** One reduction: a smaller case, or `undefined` when this axis is already minimal. */
type Reducer = (
  honestyCase: HonestyCase,
  resources: HonestyResources,
) => readonly HonestyCase[];

/**
 * A reduced case, named from the **original** and the step count.
 *
 * `${original}-s${n}`, never `${current}-s${n}`: chaining the suffix produced a forty-segment id
 * on the first run, which is unreadable and — worse — hides how many reductions actually landed
 * behind how many were tried.
 */
function withId(original: HonestyCase, patch: HonestyCase, step: number): HonestyCase {
  return Object.freeze({ ...patch, caseId: `${original.caseId}-s${String(step)}` });
}

/** Whether two cases differ in anything but their id. A no-op candidate is never a reduction. */
function differs(a: HonestyCase, b: HonestyCase): boolean {
  return JSON.stringify({ ...a, caseId: '' }) !== JSON.stringify({ ...b, caseId: '' });
}

/**
 * The reducers, in the order they are tried.
 *
 * Ordered by **cost removed per step**, not by tidiness: dropping the stage and halving the
 * replications each remove simulations, and a counterexample that survives them is one a reader
 * can re-run in a second. The id axes come last because they change *which* strings are produced,
 * so a reduction there is the most likely to lose the violation and the most informative when it
 * does not.
 */
const REDUCERS: readonly Reducer[] = Object.freeze([
  /* Drop the campaign half. */
  (honestyCase) => (honestyCase.stageId === null ? [] : [{ ...honestyCase, stageId: null }]),
  /*
   * Put the tower back **as built** — § D437's axis, reduced away.
   *
   * Second, and what it buys is a *diagnosis* rather than wall clock: a violation that survives
   * this was never about the fit-out, and one that does not survive it is a violation only a
   * fitted tower produces. That is the single most useful thing a reader can learn about a
   * counterexample on this axis, and the shrinker records it by what it accepted.
   */
  (honestyCase) => (honestyCase.fitOutId === null ? [] : [{ ...honestyCase, fitOutId: null }]),
  /* Halve the batch, then walk it to the floor of two — one replication forms no interval. */
  (honestyCase) => {
    const candidates: HonestyCase[] = [];
    for (const replications of [2, Math.max(2, Math.floor(honestyCase.replications / 2))]) {
      if (replications < honestyCase.replications) candidates.push({ ...honestyCase, replications });
    }
    return candidates;
  },
  /* Shorten the horizon. 600 s is `riseAndFallTemplate`'s floor above its own 300 s peak hold. */
  (honestyCase) => {
    const candidates: HonestyCase[] = [];
    for (const durationS of [600, Math.max(600, honestyCase.durationS - 300)]) {
      if (durationS < honestyCase.durationS) candidates.push({ ...honestyCase, durationS });
    }
    return candidates;
  },
  /* Drop the demand override, so the case reads as the building's own profile. */
  (honestyCase) =>
    honestyCase.arrivalRatePctPop5min === null ? [] : [{ ...honestyCase, arrivalRatePctPop5min: null }],
  /* Collapse the two arms — the smallest comparison there is. */
  (honestyCase) =>
    honestyCase.candidateProfileId === honestyCase.baselineProfileId
      ? []
      : [{ ...honestyCase, candidateProfileId: honestyCase.baselineProfileId }],
  /*
   * Move to a **strictly smaller** shipped building the violation survives on.
   *
   * Strictly smaller, by {@link BUILDING_ORDER}, and that word is load-bearing: the first version
   * of this reducer offered every other building, so a case already on Garden Apartments was
   * offered Midtown, accepted it as a "reduction", was then offered Garden again, and the
   * shrinker cycled until it ran out of budget — 40 accepted steps that reduced nothing, with a
   * case id forty suffixes long to show for it. A reduction that is not an ordering is not a
   * reduction.
   *
   * Garden Apartments is the floor deliberately: it is the one building on which **12 of 12**
   * dispatchers publish a mean (§ D164), so a counterexample that survives the move down is one
   * whose cause is not *"the run was refused"*, and one that does not survive it says the
   * opposite. Both answers are worth having, and the shrinker records which by what it accepted.
   */
  (honestyCase, resources) => {
    const here = BUILDING_ORDER.indexOf(honestyCase.buildingId);
    if (here <= 0) return [];
    return BUILDING_ORDER.slice(0, here)
      .filter((id) => resources.buildingsById.has(id))
      .reverse()
      .map((buildingId) => ({ ...honestyCase, buildingId, stageId: null }));
  },
]);

/**
 * The shipped buildings, smallest first.
 *
 * Ordered by what a reader has to hold in their head to re-run the case — floors, then banks,
 * then cars — which is also, and not by coincidence, replication cost: Garden Apartments is 2 ms
 * a replication and Vertical City is 196 ms (**M6**).
 */
const BUILDING_ORDER: readonly string[] = Object.freeze([
  'garden-apartments',
  'midtown-office',
  'secure-tower',
  'mixed-use-high-rise',
  'vertical-city',
]);

/**
 * Reduce a failing case to the smallest neighbour that still fails the same way.
 *
 * Never widens the target set, never accepts a candidate that skipped or threw for a different
 * reason, and never runs past its budget.
 */
export function shrinkCase(
  original: HonestyOutcome,
  resources: HonestyResources,
  options: ShrinkOptions = {},
): HonestyShrinkResult {
  const budget = options.budget ?? 60;
  const target: ReadonlySet<HonestyProperty> = new Set(
    original.violations.map((found) => found.property),
  );
  if (target.size === 0) return { original, minimal: original, steps: 0, evaluations: 0 };

  let best = original;
  let steps = 0;
  let evaluations = 0;

  let improved = true;
  while (improved && evaluations < budget) {
    improved = false;
    for (const reduce of REDUCERS) {
      for (const candidate of reduce(best.case, resources)) {
        if (evaluations >= budget) break;
        if (!differs(candidate, best.case)) continue;
        evaluations += 1;
        const outcome = evaluateCase(withId(original.case, candidate, steps + 1), resources);
        if (!isFailure(outcome)) continue;
        if (!outcome.violations.some((found) => target.has(found.property))) continue;
        best = outcome;
        steps += 1;
        improved = true;
        break;
      }
      if (improved) break;
    }
  }

  return { original, minimal: best, steps, evaluations };
}
