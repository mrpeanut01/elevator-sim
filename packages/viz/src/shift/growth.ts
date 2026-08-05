/**
 * The escalating half of the week: the building fills up overnight.
 *
 * ## Why this is a building edit and not a multiplier on a caption
 *
 * `docs/12-design-handoff.md` § 3.1 BE6 states the requirement in one line: *"Population growth
 * therefore reaches the simulation rather than only the header."* The handoff's own `startDay`
 * scales each floor's population by `1 + 0.11 × (day − 1)` and hands the scaled floors to its toy
 * simulator; the equivalent here is a **real edit to a real `BuildingConfig`**, put back through
 * `parseBuilding` and `resolveBuilding` — the same path the building editor already uses — so the
 * grown building is a building the loader built and not a number printed in a header.
 *
 * That distinction is the roadmap's standing requirement again. A growth factor that only reached
 * the tenant count in the header would be the twelfth dead seam, and it would be a *lying* one:
 * *"+11 % more tenants than today"* over a run whose arrival rate is identical is a caption that
 * does not describe the picture under it.
 *
 * ## Linear, not compounding
 *
 * `1 + 0.11 × (day − 1)`, which is the design's arithmetic and not an approximation of `1.11 ^
 * (day − 1)`. At day 20 the two differ by more than a factor of two (×3.09 against ×7.26), and
 * Vertical City compounded would be carrying 35 000 people — a building nobody can record in a
 * browser tab and one the design never drew. Day 1 is the building exactly as shipped, which is
 * what makes a day-1 figure comparable with every other figure this repository has published.
 *
 * ## `totalPopulation` cannot drift, by construction
 *
 * `resolveBuilding` warns `population-mismatch` when the declared `totalPopulation` disagrees with
 * the sum of expanded floor populations by more than half a person, and it uses the floor sum
 * regardless. A grown building that kept its shipped `totalPopulation` would therefore load with a
 * new warning on every day after the first — which the definition of done's clause 10 would catch,
 * eventually, in somebody else's suite.
 *
 * So the declared total is recomputed **through `core`'s own `expandFloors`**, the very function
 * `resolveBuilding` calls, rather than re-derived by summing the two floor-declaring fields here.
 * Re-deriving it would be a second implementation of the range-expansion and the explicit-floor
 * precedence rules (an explicit `floors` entry overrides a `floorRanges` floor at the same index),
 * and the two would agree until somebody changed one. `growth.test.ts` asserts all five shipped
 * buildings load at days 1, 5 and 20 with **no warning the shipped building did not already have**.
 *
 * ## Rounding, and the one thing it must not do
 *
 * Populations are rounded to whole people — half a resident is not a resident. Rounding happens
 * per floor and per range, and the total is then computed from the rounded values, so the declared
 * total is the sum of what the floors actually say rather than the rounded sum of an unrounded
 * total. Those differ by up to half a person per floor, which on Vertical City is fifty people and
 * is exactly the size of drift the `population-mismatch` warning exists to notice.
 *
 * ## Why {@link scaledBuilding} is exported, and it is a widening rather than a convenience
 *
 * Growth is not the only thing that scales a building's population: `shift/calendar.ts` puts a
 * vacation, a public holiday or a quarter-end over the week, and every one of them is *the same
 * building edit at a different factor*. Re-deriving that edit there would be a second
 * implementation of the four rules this file argues for above — round per floor and per range,
 * never negative, recompute the declared total through `core`'s own `expandFloors`, and leave an
 * undeclared total undeclared — and the two would agree until somebody changed one, which is the
 * failure the `totalPopulationOf` docstring is already written about.
 *
 * So the factor is the seam. {@link growthFactor} still owns *what day 5 means*; only the arithmetic
 * of applying a factor is shared, and `growth.test.ts` pins the delegation so the two cannot drift.
 */

import { expandFloors, type BuildingConfig, type FloorConfig, type FloorRange } from '@elevator-sim/core/browser';

import { GROWTH_PER_DAY } from './types.js';

/**
 * How much bigger the building is on `day` than on day 1.
 *
 * `1` on day 1 and on any day below it, so a caller that has not started a week yet gets the
 * shipped building rather than a shrunken one. Exported because the header's *"+11 % more tenants
 * than today"* line and the coach ribbon both want to state it, and re-deriving it there would be
 * two copies of one constant.
 */
export function growthFactor(day: number): number {
  return 1 + GROWTH_PER_DAY * Math.max(0, day - 1);
}

/**
 * The shipped building, grown to `day`.
 *
 * Returns a **new** `BuildingConfig`; the input is not mutated and is not retained. The result is
 * accepted by `parseBuilding` and `resolveBuilding` — that is the contract, and `growth.test.ts`
 * asserts it on all five shipped buildings at days 1, 5 and 20 rather than on one.
 *
 * Day 1 returns a structurally identical config (the factor is exactly 1 and `Math.round` is the
 * identity on the integers `data/` declares), which is why a day-1 shift is comparable with every
 * published figure.
 */
export function grownBuilding(config: BuildingConfig, day: number): BuildingConfig {
  return scaledBuilding(config, growthFactor(day));
}

/**
 * The same building with every floor's population multiplied by `factor`.
 *
 * The whole of {@link grownBuilding}, with the day taken out — see the module docstring for why
 * that is a seam rather than a helper. `factor` is anything non-negative and finite: above 1 the
 * building fills up, below 1 it empties, and `1` returns a structurally identical config because
 * `Math.round` is the identity on the integers `data/` declares.
 *
 * Returns a **new** `BuildingConfig` at every factor, including `1`. It does not return its input:
 * a caller that needs *nothing happened today* to be observable as object identity has to decide
 * that for itself and not call this, which is what `calendar.ts` does — an identity shortcut here
 * would silently change what `grownBuilding(config, 1)` returns.
 */
export function scaledBuilding(config: BuildingConfig, factor: number): BuildingConfig {
  const floors: readonly FloorConfig[] | undefined =
    config.floors === undefined
      ? undefined
      : config.floors.map((floor) => ({ ...floor, population: grow(floor.population, factor) }));

  const floorRanges: readonly FloorRange[] | undefined =
    config.floorRanges === undefined
      ? undefined
      : config.floorRanges.map((range) => ({
          ...range,
          populationPerFloor: grow(range.populationPerFloor, factor),
        }));

  const grownSource = {
    ...(floors === undefined ? {} : { floors }),
    ...(floorRanges === undefined ? {} : { floorRanges }),
  };

  return {
    ...config,
    ...grownSource,
    // Absent stays absent: a building that declared no total is not given one here. The declared
    // value is a cross-check, and inventing one would be inventing the check.
    ...(config.totalPopulation === undefined
      ? {}
      : { totalPopulation: totalPopulationOf(grownSource) }),
  };
}

/** Whole people, never negative. A floor declared at 0 (a lobby, a plant deck) stays at 0. */
function grow(population: number, factor: number): number {
  return Math.max(0, Math.round(population * factor));
}

/**
 * The sum `resolveBuilding` will compute, computed the same way it computes it.
 *
 * Through `core`'s `expandFloors`, so range expansion and the explicit-floor precedence rule are
 * read from one implementation rather than two. A source that `expandFloors` refuses is a source
 * `resolveBuilding` would also refuse, so the throw propagates rather than being swallowed into a
 * plausible number — a grown building that quietly reported a total for floors that will not
 * expand is precisely the confident nonsense this project is built to avoid.
 */
function totalPopulationOf(source: {
  readonly floors?: readonly FloorConfig[] | undefined;
  readonly floorRanges?: readonly FloorRange[] | undefined;
}): number {
  return expandFloors(source).reduce((sum, floor) => sum + floor.population, 0);
}
