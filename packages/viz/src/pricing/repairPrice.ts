/**
 * **What a fix-a-building repair costs, read off the schedule rather than off the case file** —
 * GitHub issue **#366**'s second criterion.
 *
 * `data/fixit-cases.json` used to carry a `costUnits` on each of its seventy-two repairs. Those
 * numbers were the second price list in a tree that had six, and — this is the part that decided
 * the design — **they were not derived from anything**. Measured on `669a5c7`, three times over:
 *
 * | | what the shipped file did |
 * |---|---|
 * | door dwell | seventeen repairs buy the **same** hall and car settings at 1, 2 or 3 units |
 * | a faster machine | ten repairs buy a 0.5 m/s bump at 8, 9 or 10 units, with no relation to the bump or to how many cars are touched (8 cars → 10 u; 1 car → 12 u) |
 * | a rezoned bank | `two-cars-out-wrong-month` prices **three** rezones of the same building, of the same size, at **0, 4 and 12 units** |
 *
 * So there is no magnitude rule to recover and none is invented here. A repair's price is the sum
 * of the schedule prices of the changes its patch actually buys, and a patch that buys two things
 * pays for two things. That is the only rule, and it is the one #366 asks for.
 *
 * ## What that costs, said plainly
 *
 * Thirty-nine of the seventy-two prices move. **No case breaks a rule** — every diagnosed repair
 * still costs 0–9, every new shaft is still 34 and still unaffordable inside its case's budget —
 * and `fixit/parse.ts` re-checks all of them at load, so this is asserted rather than claimed.
 *
 * What does change is **two cases whose options were only ever distinguished by an authored
 * price**. In `two-cars-out-wrong-month` the diagnosed, cheap and costly repairs are all the same
 * act on the same building, and the file charged 4, 0 and 12 for them; they cost 6 each now. In
 * `bed-cars-locked-out` the diagnosed and costly repairs are both rezones and cost 6 each now. The
 * schedule did not degrade those cases — it **revealed** that their three options were never
 * economically different, which is a content finding for GitHub issue #233 rather than a pricing
 * one, and `fixit/parse.ts#PRICE_ORDER_OUTSTANDING` holds it where it cannot be forgotten.
 */

import { changeCovering } from './parse.js';
import type { PriceSchedule, PricedChange } from './types.js';

/**
 * The `covers` path for each shape a patch can take.
 *
 * Keyed by what is *physically changed* rather than by which config section the field sits in —
 * `dispatcher.idle.parkingFloorIndex` tells a car where to wait and is dispatcher-tier, while
 * `dispatcher.dispatch.callType` installs a landing panel and is equipment-tier. #366 draws that
 * line itself, from [§ D112](../../../../DECISIONS.md), and this is where it is drawn in code.
 */
export interface RepairPatchShape {
  readonly building?: unknown;
  readonly dispatcher?: unknown;
}

/** A non-null object, or `undefined`. */
function objectOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A non-empty array, or `undefined`. Narrowed rather than trusted: patches come from `data/`. */
function arrayOf(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : undefined;
}

/** Every `covers` path a patch touches, in the order the schedule lists them. */
export function pathsIn(patch: RepairPatchShape): readonly string[] {
  const out: string[] = [];
  const building = objectOf(patch.building);
  if (building !== undefined) {
    if (arrayOf(building['addCars']) !== undefined) out.push('building.addCars[]');
    if (arrayOf(building['banks']) !== undefined) out.push('building.banks[]');
    if (arrayOf(building['floorPopulations']) !== undefined) out.push('building.floorPopulations[]');
    for (const entry of arrayOf(building['cars']) ?? []) {
      const set = objectOf(objectOf(entry)?.['set']) ?? {};
      if ('dwellHallCallS' in set) out.push('building.cars[].set.dwellHallCallS');
      if ('dwellCarCallS' in set) out.push('building.cars[].set.dwellCarCallS');
      if ('ratedSpeedDeltaMps' in set) out.push('building.cars[].set.ratedSpeedDeltaMps');
    }
  }
  for (const [group, fields] of Object.entries(objectOf(patch.dispatcher) ?? {})) {
    for (const field of Object.keys(objectOf(fields) ?? {})) out.push(`dispatcher.${group}.${field}`);
  }
  return out;
}

/**
 * The distinct changes a patch buys.
 *
 * Distinct, because a patch that trims both the hall dwell and the car dwell has bought *one*
 * change — the doors were re-set once — and charging twice would be the schedule inventing a price
 * the ladder does not hold.
 */
export function changesBought(
  schedule: PriceSchedule,
  patch: RepairPatchShape,
): readonly PricedChange[] {
  return changesAtPaths(schedule, pathsIn(patch));
}

/**
 * The distinct changes a set of `covers` paths buys — {@link changesBought} with the patch walk
 * taken off the front.
 *
 * It exists because the fix-it **editor** buys priced changes without ever holding a patch to walk:
 * a zoning control carries a floor count and a parking control carries a strategy, and the banks
 * array one of them becomes is not built until the run is planned (`fixit/run.ts`). Pricing that
 * through {@link changesBought} would mean manufacturing a patch-shaped object purely to be walked
 * back into the two strings it started as.
 *
 * Splitting it here rather than counting units in the engine is the point: the dedupe is the rule
 * that a patch trimming both dwells has bought the doors **once**, and an editor that re-implemented
 * it would be the second price list #366 exists to abolish. Both callers now share this one.
 */
export function changesAtPaths(
  schedule: PriceSchedule,
  paths: readonly string[],
): readonly PricedChange[] {
  const found = new Map<string, PricedChange>();
  for (const path of paths) {
    const change = changeCovering(schedule, path);
    if (change !== undefined) found.set(change.id, change);
  }
  return [...found.values()];
}

/** Paths the schedule prices nothing for — a repair buying one is a repair nobody can pay for. */
export function unpricedPathsIn(
  schedule: PriceSchedule,
  patch: RepairPatchShape,
): readonly string[] {
  return pathsIn(patch).filter((path) => changeCovering(schedule, path) === undefined);
}

/** What a repair costs: the sum of the distinct changes it buys. An empty patch is free. */
export function repairPriceUnits(schedule: PriceSchedule, patch: RepairPatchShape): number {
  return changesBought(schedule, patch).reduce((sum, change) => sum + change.priceUnits, 0);
}

/*
 * **There is no `repairNights` here, and its absence is deliberate.**
 *
 * One was written — `changesBought(...).reduce(sum + change.nights)`, three lines, obviously
 * correct — for Career's half of #366's fourth criterion. Nothing in this change calls it, because
 * the campaign shop is the next PR's, and `deadCode.test.ts` caught it on the first run: *"no
 * caller anywhere … the defect this repository has shipped ten times in code."*
 *
 * So it is deleted rather than listed in `DEAD_CANDIDATES`. `PricedChange.nights` is on the
 * schedule and the parser validates it; the function that reads it lands with the caller that
 * needs it.
 */
