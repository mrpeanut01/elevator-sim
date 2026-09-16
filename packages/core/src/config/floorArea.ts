/**
 * **What the hoistways take out of every floor they pass through** — `DECISIONS.md` § D601,
 * GitHub issue #429.
 *
 * ## Why this exists at all
 *
 * The issue's title is the claim: *the equipment catalogue exists to resolve a trade-off*, and
 * without shafts costing floor area there is no trade-off — more shafts is monotonically better,
 * so every equipment decision has one right answer. Al-Kodmany (Buildings 2015, 5(3), 1070–1104)
 * sells every technology in the review on space rather than on seconds: TWIN recovers *"more than
 * 830 m²"* on a 31-storey building, double-deck cuts *"no less than 11 hoistways"* out of a
 * 52-storey office, destination dispatch *"reduces the required number of elevators"*. Before this
 * module the model had no concept of area anywhere — `areaM2`, `floorArea`, `rentable` and
 * `coreArea` returned zero hits across the whole tree.
 *
 * ## What this module is, and what it deliberately is not
 *
 * It is **the physical fact and nothing else**: a floor has a plate, a shaft takes plan area out
 * of every level it passes, and a floor with more hole than floor is refused. There is **no
 * price**, no second budget and no income term, and that is a decision rather than an omission —
 * see the head of `config/floorArea.test.ts` and § D601 § 5 for the reasoning, which is the
 * product owner's own on the issue: making area a *cost* introduces a second budget axis and a
 * Career income term, neither of which is in `docs/38`, so it reshapes the economy rather than
 * adding a price.
 *
 * ## The one modelling claim, stated where it can be argued with
 *
 * **A shaft consumes area over its bank's whole *span*, not over its served set.** A bank serving
 * 43–75 takes plan area out of floor 12 as well, because the hoistway physically passes through
 * it. That is not a convenience: it is the reason sky lobbies exist, and it is what makes the core
 * of a tall building taper — the express shafts stack up at the bottom and stop at the top. A
 * model that charged only the served floors would make a shuttle free everywhere it does not open,
 * which is the opposite of the fact the issue is about.
 *
 * **A double-deck car is one shaft**, charged once, at its *per-deck* rated load. That is exactly
 * the saving the source records for the 52-storey office, and it is why `buildingPlateOf` has
 * always said *"a double-deck car is one car: it occupies one shaft"*.
 *
 * ## Non-test callers
 *
 * `config/parse.ts#resolveBuilding` is the only caller of {@link resolveFloorArea}, and what it
 * resolves is read by `packages/viz/src/dev/rightRail.ts#buildingPlateOf`, which draws the core
 * row on the building plate. **Nothing in `sim/`, `dispatch/` or `model/` reads it**, which is the
 * whole of why no leg can move; `config/floorArea.test.ts` asserts that on a run rather than on
 * the import graph.
 */

import { ISSUE_CODES, WARNING_CODES } from './schema.js';
import type {
  ElevatorSpecs,
  FloorConfig,
  ResolvedBank,
  ResolvedBuildingArea,
  ResolvedFloorArea,
  ShaftFootprintTable,
} from './types.js';

/** What {@link resolveFloorArea} produces, plus the diagnostics it raised getting there. */
export interface FloorAreaResolution {
  /** Absent when no floor declares a plate, or when only some do. */
  readonly area: ResolvedBuildingArea | undefined;
  /** `(path, message, code)` triples for the caller to raise as issues. */
  readonly issues: readonly { readonly path: string; readonly message: string; readonly code: string }[];
  /** The same shape, for warnings. */
  readonly warnings: readonly { readonly path: string; readonly message: string; readonly code: string }[];
}

/**
 * The plan area one hoistway of this car takes, m².
 *
 * `ratedLoadLbPerDeck` wins over `ratedLoadLb` on a double-deck car: the decks are stacked
 * vertically in one hole, so the hole is sized by one deck. A car outside every band cannot
 * happen — `config/schema.ts` requires the table contiguous from 0 to an open top — but the
 * fallback is the **largest** band rather than zero, because a shaft that costs nothing is the
 * defect this whole module exists to close.
 */
export function shaftFootprintM2(
  car: { readonly ratedLoadLb: number; readonly ratedLoadLbPerDeck?: number | undefined },
  table: ShaftFootprintTable,
): number {
  const load = car.ratedLoadLbPerDeck ?? car.ratedLoadLb;
  for (const band of table.bands) {
    const [from, to] = band.ratedLoadLbRange;
    if (load >= from && (to === null || load < to)) return band.plateAreaM2;
  }
  return table.bands.reduce((most, band) => Math.max(most, band.plateAreaM2), 0);
}

/**
 * **The plan area ONE shaft of this bank permanently removes from the building** — the quantity
 * [§ D630](../../../../DECISIONS.md) prices, m².
 *
 * One car's {@link shaftFootprintM2} multiplied by the number of floors its bank's span reaches —
 * the same footprint × span arithmetic {@link resolveFloorArea} charges each floor with, summed
 * the other way round. A bank with no car, or a bank whose span reaches no floor, is `undefined`
 * rather than zero: a shaft that costs nothing is the defect this module exists to close, and a
 * caller that cannot resolve the quantity must say so rather than charge for the cheapest band.
 *
 * **It is deliberately per-shaft rather than per-bank.** What a player buys is one more car in one
 * more hoistway, so the bank's existing cars are not what is being charged for; the price is what
 * the *next* hole takes out of every plate it passes.
 *
 * **Non-test caller**: `packages/viz/src/fixit/parse.ts#fixitContextOf`, which turns it into a
 * price band through `packages/viz/src/pricing/parse.ts#shaftAreaBandOf`. Nothing in `sim/`,
 * `dispatch/` or `model/` reads it, so no leg moves — see this module's own header.
 */
export function shaftPlanAreaM2(
  /**
   * The structural minimum rather than a whole {@link ResolvedBank}: the cars whose plated load
   * sizes the hole, and the floors that fix the span. A caller holding a resolved bank satisfies it
   * exactly; a caller holding the two fields — `fixit/parse.ts#fixitContextOf` takes the same
   * structural-minimum shape for the same reason — does not have to manufacture the rest.
   */
  bank: {
    readonly cars: readonly {
      readonly ratedLoadLb: number;
      readonly ratedLoadLbPerDeck?: number | undefined;
    }[];
    readonly servesFloors: readonly string[];
  },
  floors: readonly { readonly id: string; readonly index: number }[],
  table: ShaftFootprintTable,
): number | undefined {
  const car = bank.cars[0];
  if (car === undefined) return undefined;
  const span = spanOf(bank, new Map(floors.map((floor) => [floor.id, floor.index] as const)));
  if (span === undefined) return undefined;
  const reached = floors.filter((floor) => floor.index >= span.lo && floor.index <= span.hi).length;
  if (reached === 0) return undefined;
  return round2(shaftFootprintM2(car, table) * reached);
}

/** The lowest and highest floor **index** a bank's shafts pass through, or `undefined`. */
function spanOf(
  /* Only the served set is read, so only the served set is declared — see {@link shaftPlanAreaM2}. */
  bank: { readonly servesFloors: readonly string[] },
  indexOfFloorId: ReadonlyMap<string, number>,
): { readonly lo: number; readonly hi: number } | undefined {
  let lo: number | undefined;
  let hi: number | undefined;
  for (const floorId of bank.servesFloors) {
    const index = indexOfFloorId.get(floorId);
    if (index === undefined) continue;
    lo = lo === undefined || index < lo ? index : lo;
    hi = hi === undefined || index > hi ? index : hi;
  }
  return lo === undefined || hi === undefined ? undefined : { lo, hi };
}

/**
 * Resolve every floor's core, and the building's totals.
 *
 * Called once, from `resolveBuilding`, after the banks are resolved — it needs the cars' rated
 * loads and the banks' spans, and nothing else. Pure.
 */
export function resolveFloorArea(
  floors: readonly FloorConfig[],
  banks: readonly ResolvedBank[],
  specs: ElevatorSpecs,
): FloorAreaResolution {
  const issues: { path: string; message: string; code: string }[] = [];
  const warnings: { path: string; message: string; code: string }[] = [];

  const declared = floors.filter((floor) => floor.grossAreaM2 !== undefined);
  if (declared.length === 0) return { area: undefined, issues, warnings };

  const table = specs.shaftFootprint;
  if (table === undefined) {
    warnings.push({
      path: 'floors',
      message:
        `this building declares a gross floor area on ${String(declared.length)} floor${declared.length === 1 ? '' : 's'}, but this data directory's elevator-specs.json declares no shaftFootprint block, so there is no plan area to charge a hoistway with. Every floor resolves its plate with no core: the area is declared and buys nothing here.`,
      code: WARNING_CODES.floorAreaBuysNothing,
    });
    return { area: undefined, issues, warnings };
  }

  const indexOfFloorId = new Map(floors.map((floor) => [floor.id, floor.index] as const));
  const coreByIndex = new Map<number, number>();
  for (const bank of banks) {
    const span = spanOf(bank, indexOfFloorId);
    if (span === undefined) continue;
    const bankFootprint = bank.cars.reduce(
      (sum, car) => sum + shaftFootprintM2(car, table),
      0,
    );
    if (bankFootprint === 0) continue;
    for (const floor of floors) {
      if (floor.index < span.lo || floor.index > span.hi) continue;
      coreByIndex.set(floor.index, (coreByIndex.get(floor.index) ?? 0) + bankFootprint);
    }
  }

  const byFloor: ResolvedFloorArea[] = [];
  for (const floor of floors) {
    const grossM2 = floor.grossAreaM2;
    if (grossM2 === undefined) continue;
    const coreM2 = round2(coreByIndex.get(floor.index) ?? 0);
    if (coreM2 > grossM2) {
      issues.push({
        path: `floors["${floor.id}"].grossAreaM2`,
        message: `floor "${floor.id}" has a gross area of ${String(grossM2)} m² and ${String(coreM2)} m² of hoistway passing through it, so the shafts take more plan area than the floor has. Give the floor a larger plate, or take a shaft out of a bank whose span reaches it.`,
        code: ISSUE_CODES.coreExceedsFloorPlate,
      });
      continue;
    }
    byFloor.push({
      floorId: floor.id,
      grossM2,
      coreM2,
      lettableM2: round2(grossM2 - coreM2),
    });
  }

  if (declared.length !== floors.length) {
    warnings.push({
      path: 'floors',
      message: `${String(declared.length)} of this building's ${String(floors.length)} floors resolve a gross area and the rest do not, so the building's own gross, core and lettable totals are not published: a sum over some of a building's floors would read as a figure for all of them. Declare grossAreaPerFloorM2 on the building to cover the floors that state nothing.`,
      code: WARNING_CODES.partialFloorArea,
    });
    return { area: undefined, issues, warnings };
  }
  if (issues.length > 0) return { area: undefined, issues, warnings };

  const grossM2 = round2(byFloor.reduce((sum, floor) => sum + floor.grossM2, 0));
  const coreM2 = round2(byFloor.reduce((sum, floor) => sum + floor.coreM2, 0));
  return {
    area: {
      grossM2,
      coreM2,
      lettableM2: round2(grossM2 - coreM2),
      coreShare: grossM2 === 0 ? 0 : coreM2 / grossM2,
      byFloor,
    },
    issues,
    warnings,
  };
}

/**
 * Two decimal places, in the one place that rounds.
 *
 * Footprints are authored to the tenth and summed over up to 106 cars and 165 floors, so a raw
 * sum carries binary-floating-point tails that would show up as `1399.9999999999998 m²` on a
 * player-facing plate. Rounded here rather than at the renderer, so the figure the plate draws and
 * the figure the ceiling is checked against are the same number.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
