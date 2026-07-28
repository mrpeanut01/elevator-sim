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

import type { VizFloor, VizShaft } from '../contract/types.js';

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
}

export interface Layout {
  readonly width: number;
  readonly height: number;
  /** The shaft area: everything between the label gutters and below the header. */
  readonly plot: Rect;
  readonly columns: readonly ShaftColumn[];
  readonly rows: readonly FloorRow[];
  /** Pixel height of a drawn car. Shrinks with the floor pitch so cars never overlap. */
  readonly carHeightPx: number;
  /** Pixel y for a height above datum, in metres. Continuous, and clamped to the plot. */
  yForHeight(heightM: number): number;
  /** Height above datum for a pixel y. Inverse of {@link yForHeight}, for click-to-seek. */
  heightForY(y: number): number;
}

export interface LayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly floors: readonly VizFloor[];
  readonly shafts: readonly VizShaft[];
  /** Room for floor ids and heights. */
  readonly gutterLeftPx?: number;
  /** Room for the waiting-passenger counts. */
  readonly gutterRightPx?: number;
  /** Room for the title and the counters. */
  readonly headerPx?: number;
  readonly footerPx?: number;
  readonly paddingPx?: number;
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

export function buildLayout(options: LayoutOptions): Layout {
  const gutterLeft = options.gutterLeftPx ?? DEFAULTS.gutterLeftPx;
  const gutterRight = options.gutterRightPx ?? DEFAULTS.gutterRightPx;
  const header = options.headerPx ?? DEFAULTS.headerPx;
  const footer = options.footerPx ?? DEFAULTS.footerPx;
  const padding = options.paddingPx ?? DEFAULTS.paddingPx;

  const plot: Rect = {
    x: padding + gutterLeft,
    y: padding + header,
    width: Math.max(1, options.width - 2 * padding - gutterLeft - gutterRight),
    height: Math.max(1, options.height - 2 * padding - header - footer),
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

  const count = options.shafts.length;
  const available = plot.width;
  const rawWidth = count === 0 ? 0 : (available - SHAFT_GAP_PX * (count - 1)) / count;
  const shaftWidth = Math.max(MIN_SHAFT_WIDTH_PX, Math.min(MAX_SHAFT_WIDTH_PX, rawWidth));
  const totalWidth = count * shaftWidth + Math.max(0, count - 1) * SHAFT_GAP_PX;
  const originX = plot.x + Math.max(0, (available - totalWidth) / 2);

  const columns: ShaftColumn[] = options.shafts.map((shaft, index) => {
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

  const rows: FloorRow[] = options.floors.map((floor) => ({
    floorId: floor.id,
    label: floor.label ?? floor.id,
    heightM: floor.heightM,
    y: yForHeight(floor.heightM),
  }));

  const pitchPx = options.floors.length > 1 ? plot.height / (options.floors.length - 1) : plot.height;
  const carHeightPx = Math.max(6, Math.min(28, pitchPx * 0.7));

  return {
    width: options.width,
    height: options.height,
    plot,
    columns,
    rows,
    carHeightPx,
    yForHeight,
    heightForY,
  };
}
