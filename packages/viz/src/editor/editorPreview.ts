/**
 * The editor's live preview: a building drawn with **no run** — `UX.md` `ED-01`, `ED-02`.
 *
 * This is the module `DECISIONS.md` D15 narrowed `buildLayout` for. The old signature took
 * `readonly VizShaft[]`, and a `VizShaft` carries motions, door marks, occupancy and load
 * series and a rated capacity — that is, *a finished simulation*. Laying out a building the user
 * is still typing therefore required running it, which is neither fast enough for a keystroke
 * nor possible for a document that does not yet validate. `ShaftGeometry` is the four fields
 * geometry actually needs, and this module produces them from a config.
 *
 * ## It works on the invalid document too
 *
 * That is the whole point of a live preview: the reader changes a floor height, the picture
 * moves, and the two happen in the same second. If the preview waited for a valid document it
 * would blank on every intermediate keystroke, which is worse than not having one.
 *
 * So {@link previewGeometry} takes whatever it is given and produces the best geometry it can:
 * a resolved building when one exists, and otherwise a best-effort read of the raw `floors` /
 * `floorRanges` / `banks`. It never throws and it never validates — {@link validateBuilding} is
 * what says whether the document is legal, and duplicating that judgement here would be a second
 * source of truth about legality.
 */

import {
  expandFloors,
  type BuildingConfig,
  type FloorConfig,
  type ResolvedBuilding,
} from '@elevator-sim/core/browser';

import type { VizFloor } from '../contract/types.js';
import type { ShaftGeometry } from '../render/layout.js';

/**
 * A floor list in **building order**: highest first, ground at the bottom — `U1`.
 *
 * The editor's form used to list floors in declaration order, top-first, so Garden Apartments
 * read `G, 2, 3, 4, 5, 6` downward while the preview six inches to its right drew `6` at the top
 * and the lobby at the bottom. Two views of one building on one screen, running in opposite
 * directions. Every floor-ordered list in the editor now goes through here.
 *
 * ## Why `index` and not the reverse of the array
 *
 * `index` is what a building means by *which floor is above which*: `expandFloors` sorts its
 * output by it, `resolveBuilding` re-sorts by it, and `buildLayout` places rows by the height
 * that `index` is required to agree with. The declaration array is only the order somebody typed
 * the floors in, and it is not always the building's — `data/buildings/midtown-office.json`
 * declares index `0` before index `-1`, so reversing the array would draw the basement *above*
 * the lobby in the form and below it in the picture. That is the same defect on one building
 * instead of five, which is worse than the defect, because it looks fixed.
 *
 * Pure, and it copies: the caller renders from the result and commits from the original, so the
 * document's own order is never rewritten by looking at it.
 */
export function floorsInBuildingOrder(
  floors: readonly FloorConfig[],
): readonly FloorConfig[] {
  // A stable tie-break on height, for the malformed document where two floors share an index —
  // the loader rejects that, but the preview and the form both run on documents it would reject.
  return [...floors].sort((a, b) => b.index - a.index || b.heightM - a.heightM);
}

/**
 * Do the **declaration order** and the **building order** of one floor list agree?
 *
 * A statement about two orderings, and deliberately not a statement about legality. `ED-24`'s
 * declaration-order view shows it so that the ⇧/⇩ buttons have a visible effect *besides* the row
 * moving: press one on a document where the two agree and this flips to *differ*, which is the
 * single sentence that tells a reader the array actually changed. The whole defect the view exists
 * to close was a control whose effect could not be seen ([`docs/07`](../../../../docs/07-handoff.md)
 * § 8), and a row moving inside a list the reader has just been told is *the array's own order* is
 * weak evidence on its own — every list looks like it is in its own order.
 *
 * **Nothing here decides whether a document is legal.** Two orders differing is ordinary: four of
 * the five shipped buildings declare their floors bottom-up, so they differ from the moment they
 * are opened. `parseBuilding`/`resolveBuilding` decide legality and the Validation panel reports
 * it — § D67 — and this predicate is never consulted about it. It is also not what
 * `floor-height-order` checks: `parse.ts` runs that check over `expandFloors`' output, which is
 * already sorted ascending by `index`, so the declaration array's order is not an input to it.
 *
 * Lives here rather than in `dev/editor.ts` for the reason `floorsInBuildingOrder` does: that
 * file's docstring says everything with a decision in it is tested under Node, and *"do these two
 * orders agree"* is a decision.
 */
export function declarationOrderMatchesBuildingOrder(
  floors: readonly FloorConfig[],
): boolean {
  const building = floorsInBuildingOrder(floors);
  return floors.every((floor, at) => building[at]?.id === floor.id);
}

export interface PreviewGeometry {
  readonly floors: readonly VizFloor[];
  readonly shafts: readonly ShaftGeometry[];
  /** Floor ids no bank serves. Drawn as unassignable — `RV-08`, and `ED-13`'s sibling. */
  readonly unservedFloorIds: readonly string[];
  /**
   * The floor expansion, as a sentence — `ED-T2`, `ED-07`.
   *
   * A `floorRanges` building's real floor list exists only after `expandFloors`, so an editor
   * that showed the ranges and not their expansion would be hiding the thing the author is
   * actually authoring.
   */
  readonly expansion: string;
}

function toVizFloor(floor: FloorConfig): VizFloor {
  return {
    id: floor.id,
    index: floor.index,
    heightM: floor.heightM,
    label: floor.label,
    isEntrance: floor.isEntrance === true,
    isTransferFloor: floor.isTransferFloor === true,
    population: floor.population,
  };
}

/**
 * Floors, however far they can be got.
 *
 * `expandFloors` throws a `ConfigError` on a malformed range. A preview that propagated it would
 * blank the canvas mid-keystroke, so the explicit floors are used on their own instead — which
 * is exactly what the reader can still see is right about their document.
 */
function previewFloors(building: Partial<BuildingConfig>): readonly FloorConfig[] {
  try {
    return expandFloors(building);
  } catch {
    return [...(building.floors ?? [])].sort((a, b) => a.index - b.index);
  }
}

/** Geometry for a document, valid or not. Never throws. */
export function previewGeometry(
  building: Partial<BuildingConfig>,
  resolved?: ResolvedBuilding | undefined,
): PreviewGeometry {
  const floors = resolved?.floors ?? previewFloors(building);
  const declared =
    (building.floors?.length ?? 0) + expandedFromRanges(building);

  const shafts: ShaftGeometry[] = [];
  const served = new Set<string>();
  for (const bank of building.banks ?? []) {
    for (const car of bank.cars ?? []) {
      shafts.push({
        carId: `${bank.id}-${car.id}`,
        bankId: bank.id,
        label: car.id,
        servedFloorIds: [...bank.servesFloors],
      });
      for (const floorId of bank.servesFloors) served.add(floorId);
    }
  }

  return {
    floors: floors.map(toVizFloor),
    shafts,
    unservedFloorIds: floors.map((floor) => floor.id).filter((id) => !served.has(id)),
    expansion:
      floors.length === 0
        ? 'no floors declared'
        : `${String(floors.length)} floors, ${String(floors[0]?.id ?? '?')} … ${String(floors[floors.length - 1]?.id ?? '?')}` +
          (declared === floors.length ? '' : ` (from ${String(building.floorRanges?.length ?? 0)} range(s) plus explicit entries)`),
  };
}

/** Floors a range *declares*, for the expansion caption. Not a validation. */
function expandedFromRanges(building: Partial<BuildingConfig>): number {
  return (building.floorRanges ?? []).reduce(
    (total, range) => total + Math.max(0, range.toIndex - range.fromIndex + 1),
    0,
  );
}
