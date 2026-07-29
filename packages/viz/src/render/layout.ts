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

/**
 * The text rows stacked above the plot — **one arithmetic place for the whole header band.**
 *
 * ## Why this exists rather than six literals in the renderer
 *
 * It shipped as six literals in two files, and they collided. The mood headline `render/canvas.ts`
 * draws at `y = 48` with `textBaseline: 'top'` occupies `[48, 60]`; the bank label `drawShafts`
 * writes at `plot.y − 18` with `textBaseline: 'bottom'` occupies `[46, 58]`. **Ten pixels of
 * overprint on every building with more than one bank**, confirmed arithmetically and on screen.
 * The hidden-shaft notice (`plot.y − 20`, so `[44, 56]`) overprinted *both*, and the selected
 * landing's caption is drawn at the same `y` as the hidden-shaft notice, so those two overprinted
 * each other as well. Four claims, three rows of space, no owner.
 *
 * The two literals were each locally correct and were written by different lanes months apart.
 * That is the shape of the defect: **a header row is a shared resource and nothing owned it.** So
 * the band is computed here, once, from the rows it must hold, and `headerPx`'s default is
 * *derived* from that stack rather than being a number somebody picked.
 *
 * ## The bank row is reserved even when there is one bank
 *
 * `render/canvas.ts` draws a bank label only when the building has more than one bank (`RV-06`) —
 * repeating `main` over every column of a single-bank building is noise. The **row** is reserved
 * either way, because `dev/main.ts` filters the shafts by bank and a building drawn through that
 * filter has exactly one bank: a band that shrank would make the whole picture jump 14 px when the
 * reader picked a bank out of a `<select>`. Fourteen pixels of stable geometry is worth more than
 * fourteen pixels of plot that appear and disappear.
 */
export interface HeaderBand {
  /** Top y of the title and the warning banner. Drawn with `textBaseline: 'top'`. */
  readonly titleY: number;
  /** Top y of the run-meta line and the right-aligned counters. `textBaseline: 'top'`. */
  readonly metaY: number;
  /** Top y of the building-mood line — `docs/10` § 6, D4. `textBaseline: 'top'`. */
  readonly moodY: number;
  /**
   * Baseline y of the notices row — the hidden-shaft count and the selected landing's caption.
   *
   * One row for both, because both are left-aligned at {@link Rect.x} and drawing them at the same
   * `y` is what the two of them did. Drawn with `textBaseline: 'bottom'`, like everything else
   * anchored upward from the plot.
   */
  readonly noticeY: number;
  /** Baseline y of the bank-label row — `RV-06`. Reserved on every building; see above. */
  readonly bankY: number;
  /** Baseline y of the per-shaft label row. */
  readonly shaftY: number;
  /**
   * Height of one text row in this band, pixels — the box a 12 px line occupies.
   *
   * Carried so a test can rebuild every row's rectangle from the layout rather than from a
   * transcribed constant, which is what `render/headerBand.test.ts` does.
   */
  readonly linePx: number;
  /** The same, for the bold 14 px face the title uses. */
  readonly titleLinePx: number;
}

export interface Layout {
  readonly width: number;
  readonly height: number;
  /** The shaft area: everything between the label gutters and below the header. */
  readonly plot: Rect;
  /**
   * Where each row of text above the plot goes — see {@link HeaderBand}.
   *
   * Every renderer that writes above {@link Layout.plot} reads it from here. Nothing in `render/`
   * may compute a header y of its own; that is the defect this field closes.
   */
  readonly header: HeaderBand;
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
  /**
   * Room for the title, the counters, the mood line and the labels above the plot.
   *
   * Defaults to {@link MIN_HEADER_PX}, which is *derived* from {@link HeaderBand}'s row stack
   * rather than chosen. A smaller value is clamped up to it: a caller asking for a header too
   * short to hold its own rows is asking for the overprint this band exists to prevent, and
   * silently drawing two labels on top of each other is the worse of the two failures.
   */
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

/* -------------------------------------------------------------------------- *
 * The header band's row stack
 * -------------------------------------------------------------------------- */

/** Line box of the 12 px monospace face `render/` draws body text in. */
const HEADER_LINE_PX = 14;
/** Line box of the bold 14 px face the title uses. */
const HEADER_TITLE_LINE_PX = 16;
/** Where the title sits. Two pixels above the padding line, which is where it has always been. */
const HEADER_TOP_PX = 10;
/** Air between the last header row and the first row anchored upward from the plot. */
const HEADER_GAP_PX = 2;
/** Air between the shaft label and the plot's top edge. */
const SHAFT_LABEL_GAP_PX = 4;

/** Rows anchored upward from the plot: notices, bank labels, shaft labels. */
const PLOT_LABEL_ROWS = 3;

const DEFAULT_PADDING_PX = 12;

/**
 * The smallest header that holds its own rows, for a given padding — computed, not chosen.
 *
 * `HEADER_TOP_PX − paddingPx` is the distance the title sits above the padding line; the rest is
 * {@link HeaderBand}'s six rows plus the air between the two groups and above the plot.
 */
export function minHeaderPx(paddingPx: number = DEFAULT_PADDING_PX): number {
  return (
    HEADER_TOP_PX -
    paddingPx +
    HEADER_TITLE_LINE_PX +
    2 * HEADER_LINE_PX +
    HEADER_GAP_PX +
    PLOT_LABEL_ROWS * HEADER_LINE_PX +
    SHAFT_LABEL_GAP_PX
  );
}

/**
 * The shipped minimum: **90 px**, against the 64 px it was before.
 *
 * 64 px was never enough for six rows, which is exactly why four of them overlapped. The 26 px
 * this costs the plot is paid back, and then some, by the panel strip in `index.html` — the run
 * summary and the mood gauge now share a row instead of stacking, which is worth ~126 px at
 * 900 px of viewport. Measured before and after; see the delivery report.
 */
export const MIN_HEADER_PX = minHeaderPx(DEFAULT_PADDING_PX);

const DEFAULTS = {
  gutterLeftPx: 72,
  gutterRightPx: 76,
  footerPx: 28,
  paddingPx: DEFAULT_PADDING_PX,
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
  const footer = options.footerPx ?? DEFAULTS.footerPx;
  const padding = options.paddingPx ?? DEFAULTS.paddingPx;
  // Clamped, not trusted: a header shorter than its own rows draws two labels on top of each
  // other, which is the defect this band exists to close. See {@link LayoutOptions.headerPx}.
  const header = Math.max(minHeaderPx(padding), options.headerPx ?? minHeaderPx(padding));
  const overlayWidth = Math.max(0, options.overlayWidthPx ?? 0);

  const plot: Rect = {
    x: padding + gutterLeft,
    y: padding + header,
    width: Math.max(1, options.width - 2 * padding - gutterLeft - gutterRight - overlayWidth),
    height: Math.max(1, options.height - 2 * padding - header - footer),
  };

  // Two anchors, meeting in the middle: the three text rows hang from the top of the canvas, and
  // the three label rows stand on the plot. `header` is clamped above so the two never meet.
  const shaftY = plot.y - SHAFT_LABEL_GAP_PX;
  const headerBand: HeaderBand = {
    titleY: HEADER_TOP_PX,
    metaY: HEADER_TOP_PX + HEADER_TITLE_LINE_PX,
    moodY: HEADER_TOP_PX + HEADER_TITLE_LINE_PX + HEADER_LINE_PX,
    noticeY: shaftY - 2 * HEADER_LINE_PX,
    bankY: shaftY - HEADER_LINE_PX,
    shaftY,
    linePx: HEADER_LINE_PX,
    titleLinePx: HEADER_TITLE_LINE_PX,
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
    header: headerBand,
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
