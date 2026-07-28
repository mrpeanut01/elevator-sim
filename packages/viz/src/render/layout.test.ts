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
    expect(Number.isFinite(empty.yForHeight(0))).toBe(true);
  });
});
