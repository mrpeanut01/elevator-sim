/**
 * Where things go: a pure function from a viewport and a building to pixel geometry.
 *
 * Separate from the drawing for the usual reason and one specific one. The usual reason is that
 * geometry is arithmetic and arithmetic is testable. The specific one is
 * {@link Layout.yForHeight}: a car's vertical position must be a *continuous* function of its
 * height in metres, not a lookup of the floor it is nearest, or the S-curve the frame producer
 * went to the trouble of evaluating would be quantised back into a jump at the last moment.
 *
 * Heights map linearly over `[lowest floor, highest floor]`, which is deliberate: a building
 * with an 8 m lobby and 3 m upper floors should *look* like one. Floor rows are placed by the
 * same function, so a car standing at a floor is exactly on that floor's line by construction
 * rather than by two calculations agreeing.
 */

import type { VizFloor } from '../contract/types.js';

/**
 * The part of a shaft that geometry needs: an identity and the floors it serves.
 *
 * Narrower than {@link VizShaft} on purpose. A layout has nothing to say about motions, door
 * marks, occupancy or capacity, and taking the whole `VizShaft` meant that laying a building out
 * required a *finished run* — which is precisely what UX.md's ED-01/ED-02 (change a floor
 * height, add a car, see the picture update, no run needed) cannot have. `VizShaft` satisfies
 * this structurally, so every existing caller is unchanged and the editor's preview becomes
 * expressible without widening anything later.
 */
export interface ShaftGeometry {
  readonly carId: string;
  readonly bankId: string;
  readonly label: string;
  /** Floor ids this shaft physically serves — service zoning, not access and not operational. */
  readonly servedFloorIds: readonly string[];
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ShaftColumn {
  readonly carId: string;
  readonly bankId: string;
  readonly label: string;
  /** Left edge of the shaft, pixels. */
  readonly x: number;
  readonly width: number;
  /** Centre line, pixels. */
  readonly centreX: number;
}

export interface FloorRow {
  readonly floorId: string;
  readonly label: string;
  readonly heightM: number;
  /** Pixel y of the floor line. */
  readonly y: number;
  /**
   * Whether this row's label is legible at the current pitch — `UX.md` `RV-09`/`RS-04`.
   *
   * **Every floor still has a row.** On a 60-storey building at 700 px the pitch is under 12 px
   * and drawing every id produces an unreadable smear that also hides the two labels that
   * matter. Thinning is by *label*, never by row: the line, the shaft and the car are all still
   * drawn at every floor, and {@link FloorRow.label} is still carried so a text alternative or a
   * hover can read it out.
   *
   * Entrance and transfer floors are never thinned out — they are the two the reader is
   * orienting by.
   */
  readonly labelled: boolean;
  readonly isEntrance: boolean;
  readonly isTransferFloor: boolean;
}

export interface Layout {
  readonly width: number;
  readonly height: number;
  /** The shaft area: everything between the label gutters and below the header. */
  readonly plot: Rect;
  readonly columns: readonly ShaftColumn[];
  readonly rows: readonly FloorRow[];
  /**
   * Shafts that did not fit — `UX.md` `RS-05`.
   *
   * The columns that *are* here are laid out at a legible width; the ones that are not are
   * counted so the renderer can say "showing 6 of 12" rather than truncating in silence, which
   * is what the CLI's `watch` already does and what `RS-05` requires of the viewer too.
   */
  readonly hiddenShaftCount: number;
  /** Pixel height of a drawn car. Shrinks with the floor pitch so cars never overlap. */
  readonly carHeightPx: number;
  /**
   * Pixel distance between two adjacent floor lines.
   *
   * Carried rather than left to be re-derived, because `docs/10` § 6.2 makes it a *decision*
   * input: a rider queue degrades to a bar when *"the floor pitch is below the glyph height"*, and
   * a renderer that recovered the pitch by inverting {@link carHeightPx} would get it wrong at both
   * ends, where that value is clamped. One floor has no pitch; it gets the plot height, matching
   * {@link yForHeight}'s single-floor case.
   */
  readonly pitchPx: number;
  /** The metrics panel's rectangle, when one was asked for. Never overlaps {@link plot}. */
  readonly overlay: Rect | undefined;
  /** Pixel y for a height above datum, in metres. Continuous, and clamped to the plot. */
  yForHeight(heightM: number): number;
  /** Height above datum for a pixel y. Inverse of {@link yForHeight}, for click-to-seek. */
  heightForY(y: number): number;
  /** The floor row nearest a pixel y, for hover and click. `undefined` when there are no rows. */
  rowNearestY(y: number): FloorRow | undefined;
}

export interface LayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly floors: readonly VizFloor[];
  readonly shafts: readonly ShaftGeometry[];
  /** Room for floor ids and heights. */
  readonly gutterLeftPx?: number;
  /** Room for the waiting-passenger counts. */
  readonly gutterRightPx?: number;
  /** Room for the title and the counters. */
  readonly headerPx?: number;
  readonly footerPx?: number;
  readonly paddingPx?: number;
  /**
   * Width reserved for the live metrics panel, to the right of the landing counts.
   *
   * Reserved rather than overlaid: a translucent panel drawn *over* the shafts hides the cars at
   * exactly the moment somebody is reading the metric that made them look. `0` (the default)
   * gives {@link Layout.overlay} `undefined` and the plot the whole width.
   */
  readonly overlayWidthPx?: number;
}

const DEFAULTS = {
  gutterLeftPx: 72,
  gutterRightPx: 76,
  headerPx: 64,
  footerPx: 28,
  paddingPx: 12,
} as const;

/** Largest shaft width that still looks like a shaft, and the smallest that is still legible. */
const MAX_SHAFT_WIDTH_PX = 96;
const MIN_SHAFT_WIDTH_PX = 18;
const SHAFT_GAP_PX = 10;

/**
 * Smallest row pitch at which a 12 px monospace floor id is readable rather than a smear.
 *
 * 12 px is the font size and 14 px is one line box; below that, consecutive labels touch. This
 * is the threshold {@link FloorRow.labelled} thins at.
 */
const MIN_LABEL_PITCH_PX = 14;

export function buildLayout(options: LayoutOptions): Layout {
  const gutterLeft = options.gutterLeftPx ?? DEFAULTS.gutterLeftPx;
  const gutterRight = options.gutterRightPx ?? DEFAULTS.gutterRightPx;
  const header = options.headerPx ?? DEFAULTS.headerPx;
  const footer = options.footerPx ?? DEFAULTS.footerPx;
  const padding = options.paddingPx ?? DEFAULTS.paddingPx;
  const overlayWidth = Math.max(0, options.overlayWidthPx ?? 0);

  const plot: Rect = {
    x: padding + gutterLeft,
    y: padding + header,
    width: Math.max(1, options.width - 2 * padding - gutterLeft - gutterRight - overlayWidth),
    height: Math.max(1, options.height - 2 * padding - header - footer),
  };

  const overlay: Rect | undefined =
    overlayWidth === 0
      ? undefined
      : {
          x: options.width - padding - overlayWidth,
          y: plot.y,
          width: overlayWidth,
          height: plot.height,
        };

  const heights = options.floors.map((floor) => floor.heightM);
  const lowest = heights.length > 0 ? Math.min(...heights) : 0;
  const highest = heights.length > 0 ? Math.max(...heights) : 0;
  const span = highest - lowest;

  // A single-floor building has no span to map over; put its one row in the middle rather than
  // dividing by zero.
  const yForHeight = (heightM: number): number => {
    if (span <= 0) return plot.y + plot.height / 2;
    const fraction = (heightM - lowest) / span;
    const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
    return plot.y + plot.height * (1 - clamped);
  };
  const heightForY = (y: number): number => {
    if (span <= 0) return lowest;
    const fraction = 1 - (y - plot.y) / plot.height;
    const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
    return lowest + span * clamped;
  };

  const total = options.shafts.length;
  const available = plot.width;
  // How many shafts fit at the minimum legible width. Beyond that they are *not* laid out at
  // all: squeezing a thirteenth shaft into 4 px is the silent truncation RS-05 forbids, and the
  // count of the ones left out is reported instead.
  const capacity = Math.max(
    1,
    Math.floor((available + SHAFT_GAP_PX) / (MIN_SHAFT_WIDTH_PX + SHAFT_GAP_PX)),
  );
  const count = Math.min(total, capacity);
  const shown = options.shafts.slice(0, count);
  const rawWidth = count === 0 ? 0 : (available - SHAFT_GAP_PX * (count - 1)) / count;
  const shaftWidth = Math.max(MIN_SHAFT_WIDTH_PX, Math.min(MAX_SHAFT_WIDTH_PX, rawWidth));
  const totalWidth = count * shaftWidth + Math.max(0, count - 1) * SHAFT_GAP_PX;
  const originX = plot.x + Math.max(0, (available - totalWidth) / 2);

  const columns: ShaftColumn[] = shown.map((shaft, index) => {
    const x = originX + index * (shaftWidth + SHAFT_GAP_PX);
    return {
      carId: shaft.carId,
      bankId: shaft.bankId,
      label: shaft.label,
      x,
      width: shaftWidth,
      centreX: x + shaftWidth / 2,
    };
  });

  const pitchPx = options.floors.length > 1 ? plot.height / (options.floors.length - 1) : plot.height;
  // Thin by a whole-number stride so the surviving labels stay evenly spaced. `stride` 1 labels
  // everything; 3 labels every third floor.
  const stride = Math.max(1, Math.ceil(MIN_LABEL_PITCH_PX / Math.max(pitchPx, 0.001)));

  /**
   * Reference floors, which are never thinned: the entrance, every sky lobby, and the two ends.
   *
   * They are what a reader orients by on a 60-storey building, so they win the space. That means
   * a *strided* label may have to give way to one, which is the second half of the rule below —
   * the first draft only added the references back and produced exactly the collision `RV-09`
   * forbids, on `vertical-city`, where several transfer floors sit next to strided ones.
   */
  const floorCount = options.floors.length;
  const forced = options.floors.map(
    (floor, index) =>
      floor.isEntrance || floor.isTransferFloor || index === 0 || index === floorCount - 1,
  );
  const ys = options.floors.map((floor) => yForHeight(floor.heightM));
  const nextForcedY: number[] = new Array<number>(floorCount).fill(Number.POSITIVE_INFINITY);
  let upcoming = Number.POSITIVE_INFINITY;
  for (let index = floorCount - 1; index >= 0; index -= 1) {
    nextForcedY[index] = upcoming;
    if (forced[index] === true) upcoming = ys[index] ?? upcoming;
  }

  let lastLabelledY = Number.NEGATIVE_INFINITY;
  const rows: FloorRow[] = options.floors.map((floor, index) => {
    const y = ys[index] ?? 0;
    const isForced = forced[index] === true;
    const roomBehind = Math.abs(y - lastLabelledY) >= MIN_LABEL_PITCH_PX;
    const roomAhead = Math.abs(y - (nextForcedY[index] ?? Number.POSITIVE_INFINITY)) >= MIN_LABEL_PITCH_PX;
    const labelled =
      stride === 1 || isForced || (index % stride === 0 && roomBehind && roomAhead);
    if (labelled) lastLabelledY = y;
    return {
      floorId: floor.id,
      label: floor.label ?? floor.id,
      heightM: floor.heightM,
      y,
      labelled,
      isEntrance: floor.isEntrance,
      isTransferFloor: floor.isTransferFloor,
    };
  });

  const carHeightPx = Math.max(6, Math.min(28, pitchPx * 0.7));

  const rowNearestY = (y: number): FloorRow | undefined => {
    let best: FloorRow | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const distance = Math.abs(row.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = row;
      }
    }
    return best;
  };

  return {
    width: options.width,
    height: options.height,
    plot,
    columns,
    rows,
    hiddenShaftCount: total - count,
    carHeightPx,
    pitchPx,
    overlay,
    yForHeight,
    heightForY,
    rowNearestY,
  };
}
