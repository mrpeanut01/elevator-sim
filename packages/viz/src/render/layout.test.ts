import { describe, expect, it } from 'vitest';

import { FIXTURE_DOOR_CONFIG } from '../fixtures.test-helper.js';
import { constantSeries } from '../contract/series.js';
import type { VizFloor, VizShaft } from '../contract/types.js';
import { buildLayout } from './layout.js';

const FLOORS: readonly VizFloor[] = [
  { id: 'B1', index: -1, heightM: -3.5, isEntrance: false, isTransferFloor: false, population: 0 },
  { id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
  { id: '2', index: 1, heightM: 4.5, isEntrance: false, isTransferFloor: false, population: 20 },
  { id: '3', index: 2, heightM: 7.5, isEntrance: false, isTransferFloor: false, population: 20 },
];

function shaft(carId: string): VizShaft {
  return {
    carId,
    bankId: 'main',
    label: carId,
    startFloorId: 'G',
    startHeightM: 0,
    servedFloorIds: FLOORS.map((floor) => floor.id),
    capacityPersons: 13,
    doorConfig: FIXTURE_DOOR_CONFIG,
    motions: [],
    doorMarks: [],
    occupants: constantSeries(0),
    loadFactor: constantSeries(0),
  };
}

const layout = buildLayout({
  width: 1000,
  height: 700,
  floors: FLOORS,
  shafts: [shaft('A'), shaft('B'), shaft('C')],
});

describe('buildLayout', () => {
  it('puts the lowest floor at the bottom of the plot and the highest at the top', () => {
    const bottom = layout.yForHeight(-3.5);
    const top = layout.yForHeight(7.5);
    expect(top).toBeLessThan(bottom);
    expect(top).toBeCloseTo(layout.plot.y, 6);
    expect(bottom).toBeCloseTo(layout.plot.y + layout.plot.height, 6);
  });

  it('maps height continuously, so an S-curve is not re-quantised into a jump', () => {
    // Equal height increments must produce equal pixel increments — a lookup of the nearest
    // floor would produce a staircase here, and the whole point of evaluating the profile is
    // that it does not.
    const step = layout.yForHeight(0) - layout.yForHeight(1);
    for (const h of [1, 2, 3, 4, 5, 6]) {
      expect(layout.yForHeight(h - 1) - layout.yForHeight(h)).toBeCloseTo(step, 9);
    }
    expect(step).toBeGreaterThan(0);
  });

  it('scales by metres, not by floor count, so an unequal pitch looks unequal', () => {
    // G→2 is 4.5 m and 2→3 is 3.0 m: the first gap must be the larger one on screen.
    const lower = layout.yForHeight(0) - layout.yForHeight(4.5);
    const upper = layout.yForHeight(4.5) - layout.yForHeight(7.5);
    expect(lower).toBeGreaterThan(upper);
    expect(lower / upper).toBeCloseTo(4.5 / 3, 6);
  });

  it('clamps outside the shaft rather than drawing off-canvas', () => {
    expect(layout.yForHeight(-1000)).toBeCloseTo(layout.plot.y + layout.plot.height, 6);
    expect(layout.yForHeight(1000)).toBeCloseTo(layout.plot.y, 6);
  });

  it('inverts, for click-to-seek', () => {
    for (const h of [-3.5, 0, 2.25, 4.5, 7.5]) {
      expect(layout.heightForY(layout.yForHeight(h))).toBeCloseTo(h, 6);
    }
  });

  it('places floor rows with the same function the cars use', () => {
    for (const row of layout.rows) {
      expect(row.y).toBe(layout.yForHeight(row.heightM));
    }
    expect(layout.rows.map((row) => row.floorId)).toEqual(['B1', 'G', '2', '3']);
  });

  it('lays out one non-overlapping column per shaft, in order', () => {
    expect(layout.columns.map((column) => column.carId)).toEqual(['A', 'B', 'C']);
    for (let i = 1; i < layout.columns.length; i += 1) {
      const previous = layout.columns[i - 1];
      const current = layout.columns[i];
      if (previous === undefined || current === undefined) throw new Error('missing column');
      expect(current.x).toBeGreaterThanOrEqual(previous.x + previous.width);
    }
    for (const column of layout.columns) {
      expect(column.centreX).toBeCloseTo(column.x + column.width / 2, 9);
    }
  });

  it('keeps cars small enough not to overlap the floor pitch', () => {
    const pitch = layout.plot.height / (FLOORS.length - 1);
    expect(layout.carHeightPx).toBeLessThan(pitch);
    expect(layout.carHeightPx).toBeGreaterThan(0);
  });

  it('survives a degenerate viewport and a single-floor building', () => {
    const tiny = buildLayout({ width: 40, height: 40, floors: FLOORS, shafts: [shaft('A')] });
    expect(tiny.plot.width).toBeGreaterThan(0);
    expect(tiny.plot.height).toBeGreaterThan(0);

    const one = buildLayout({
      width: 400,
      height: 300,
      floors: [FLOORS[1] as VizFloor],
      shafts: [shaft('A')],
    });
    expect(Number.isFinite(one.yForHeight(0))).toBe(true);
    expect(one.rows).toHaveLength(1);
  });

  it('handles a building with no cars at all', () => {
    const empty = buildLayout({ width: 800, height: 600, floors: FLOORS, shafts: [] });
    expect(empty.columns).toHaveLength(0);
    expect(empty.hiddenShaftCount).toBe(0);
    expect(Number.isFinite(empty.yForHeight(0))).toBe(true);
  });

  /* ------------------------------------------------------------------ *
   * The plot's share of the canvas — § D236, issues #73 and #41
   * ------------------------------------------------------------------ */

  /** `dev/main.ts`'s own request, which is the one that produced the defect. */
  const asShipped = (width: number, cars: number) =>
    buildLayout({
      width,
      height: 640,
      floors: FLOORS,
      shafts: Array.from({ length: cars }, (_, index) => shaft(String.fromCharCode(65 + index))),
      gutterRightPx: 280,
    });

  it('draws the whole bank on a phone, where it used to draw one shaft of it', () => {
    /*
     * The regression test for issue #73, at the exact number `dev/main.ts` produces: `drawStage`
     * floors the canvas at 360 px, and 360 − 24 padding − 72 left gutter − 280 rider gutter is
     * **negative**. `Math.max(1, …)` made that a one-pixel plot and `capacity`'s own `Math.max(1,
     * …)` made it one shaft — so a phone drew shaft A of Chancery House's six with three quarters
     * of the canvas blank beside it, on every building in the game.
     */
    expect(asShipped(360, 2).columns).toHaveLength(2);
    expect(asShipped(360, 6).columns).toHaveLength(6);
    expect(asShipped(360, 6).hiddenShaftCount).toBe(0);
    // And a building that genuinely does not fit still says so rather than being cropped in
    // silence — RS-05 is unchanged, it just no longer fires on a six-car bank.
    expect(asShipped(360, 35).columns.length).toBeGreaterThan(1);
    expect(asShipped(360, 35).hiddenShaftCount).toBeGreaterThan(0);
  });

  it('never lets the gutters take more than their share, at any width', () => {
    for (const width of [200, 360, 420, 500, 606, 766, 1232, 1872]) {
      const built = asShipped(width, 6);
      const inner = width - 2 * built.paddingPx;
      expect(built.plot.width / inner, `plot share at ${String(width)}`).toBeGreaterThanOrEqual(
        0.449,
      );
    }
  });

  it('is inert at desktop widths — no picture that fitted has moved', () => {
    // The clamp is a floor, not a redesign. At 1232 px (a 1920 × 1080 window) the shipped request
    // already leaves the plot more than half the canvas, so the gutters come through untouched.
    const wide = asShipped(1232, 6);
    expect(wide.plot.x).toBe(12 + 72);
    /*
     * `− 250` used to close this arithmetic: the live metrics panel's reservation. `docs/21` § 3.4
     * moved that panel to the DOM, so the plot is **250 px wider at every width** — which is the
     * beneficiary § D316 named when it gave the panel a floor rather than letting it clip. The
     * expression is still the request rather than a pinned number, so it stays a claim about the
     * layout rather than a transcription of one run of it.
     */
    expect(wide.plot.width).toBe(1232 - 24 - 72 - 280);
  });

  it('spends the air between shafts before it spends a shaft', () => {
    /*
     * Issue #41: Vertical City's thirty-five cars against a 1 232 px canvas. At the roomy 10 px
     * gap, 36 % of the plot's width is air at exactly the moment there is not enough of it.
     *
     * The counts are asserted as *improvements* rather than pinned, because the exact number is a
     * function of four constants and pinning it would make this a transcription. What must hold is
     * the direction and the invariant under it: no shaft is ever narrower than the legible
     * minimum, so this buys shafts out of the gaps and never out of legibility.
     */
    const crowded = asShipped(1232, 35);
    expect(crowded.columns.length).toBeGreaterThan(22);
    expect(crowded.columns[0]?.width ?? 0).toBeGreaterThanOrEqual(18);

    // A bank that fits keeps the roomy gap: the fallback is a fallback.
    const roomy = asShipped(1232, 6);
    const gap = (roomy.columns[1]?.x ?? 0) - (roomy.columns[0]?.x ?? 0) - (roomy.columns[0]?.width ?? 0);
    expect(gap).toBeCloseTo(10, 6);
  });

  it('finds the row nearest a pixel, for hover and click', () => {
    const row = layout.rows[2];
    if (row === undefined) throw new Error('missing row');
    expect(layout.rowNearestY(row.y)?.floorId).toBe(row.floorId);
    expect(layout.rowNearestY(row.y + 1)?.floorId).toBe(row.floorId);
    expect(layout.rowNearestY(-1000)?.floorId).toBe('3');
    expect(layout.rowNearestY(10_000)?.floorId).toBe('B1');
    expect(buildLayout({ width: 400, height: 300, floors: [], shafts: [] }).rowNearestY(0)).toBeUndefined();
  });
});
