/**
 * The run-less preview — the thing `DECISIONS.md` D15 narrowed `buildLayout` for.
 *
 * The claim under test is precise: **geometry for a building nobody has simulated**. So every
 * test here starts from a `BuildingConfig`, and the only run in the file is the one that proves
 * the preview agrees with the recording a run would have produced. Iterating `BUILDING_IDS`
 * rather than pinning one, for the reason `fixtures.test-helper.ts` records: the single building
 * this package used to pin is the one that could not tell the defect from correct behaviour.
 */

import { loadConfig, type BuildingConfig, type LoadedConfig } from '@elevator-sim/core';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { BUILDING_IDS, DATA_DIR, breadthConfig } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { buildLayout } from '../render/layout.js';
import { describePreview } from '../render/preview.js';
import { addCar, removeFloor, updateFloor } from './editorEdits.js';
import { previewGeometry } from './editorPreview.js';
import { validateBuilding } from './editorValidate.js';

let config: LoadedConfig;
const sources = new Map<string, BuildingConfig>();

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  for (const id of BUILDING_IDS) {
    sources.set(
      id,
      JSON.parse(await readFile(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8')) as BuildingConfig,
    );
  }
}, 120_000);

function sourceOf(id: string): BuildingConfig {
  const source = sources.get(id);
  if (source === undefined) throw new Error(`no source for ${id}`);
  return structuredClone(source);
}

describe.each(BUILDING_IDS)('%s — geometry with no run', (buildingId) => {
  it('describes the same floors and shafts a recording of it would', () => {
    const source = sourceOf(buildingId);
    const report = validateBuilding(source, config.elevatorSpecs, {
      trafficProfileIds: new Set(config.trafficProfilesById.keys()),
    });
    expect(report.valid).toBe(true);
    const geometry = previewGeometry(source, report.resolved);

    const { recording } = recordRun(breadthConfig(config, buildingId));
    expect(geometry.floors.map((floor) => floor.id)).toEqual(
      recording.floors.map((floor) => floor.id),
    );
    expect(geometry.floors.map((floor) => floor.heightM)).toEqual(
      recording.floors.map((floor) => floor.heightM),
    );
    expect(geometry.shafts.map((shaft) => shaft.carId)).toEqual(
      recording.shafts.map((shaft) => shaft.carId),
    );
    for (const [index, shaft] of geometry.shafts.entries()) {
      expect(shaft.servedFloorIds).toEqual(recording.shafts[index]?.servedFloorIds);
    }
  }, 300_000);

  it('lays out through the same `buildLayout` the viewer uses, with no motions in sight', () => {
    const source = sourceOf(buildingId);
    const geometry = previewGeometry(source);
    const layout = buildLayout({
      width: 1000,
      height: 700,
      floors: geometry.floors,
      shafts: geometry.shafts,
    });
    expect(layout.rows.length).toBe(geometry.floors.length);
    expect(layout.columns.length + layout.hiddenShaftCount).toBe(geometry.shafts.length);
  }, 300_000);

  it('produces a text alternative that names the banks and their service zoning', () => {
    const geometry = previewGeometry(sourceOf(buildingId));
    const text = describePreview(geometry);
    for (const bankId of new Set(geometry.shafts.map((shaft) => shaft.bankId))) {
      expect(text).toContain(`Bank ${bankId}`);
    }
  }, 300_000);
});

describe('the preview keeps working while the document is broken', () => {
  it('draws the explicit floors when a floor range is malformed', () => {
    // The point of a live preview: it must not blank between two keystrokes.
    const broken: BuildingConfig = {
      ...sourceOf('garden-apartments'),
      floorRanges: [
        { fromIndex: 10, toIndex: 10_000, startHeightM: 40, floorToFloorM: 3.2, populationPerFloor: 5 },
      ],
    };
    expect(validateBuilding(broken, config.elevatorSpecs).valid).toBe(false);
    const geometry = previewGeometry(broken);
    expect(geometry.floors.length).toBe(6);
    expect(geometry.expansion).toContain('6 floors');
  }, 120_000);

  it('shows an empty state rather than throwing on a document with no floors', () => {
    const geometry = previewGeometry({ banks: [] });
    expect(geometry.floors).toEqual([]);
    expect(geometry.shafts).toEqual([]);
    expect(geometry.expansion).toBe('no floors declared');
    expect(describePreview(geometry)).toContain('No floors');
  });
});

describe('the preview responds to an edit immediately — ED-01, ED-02', () => {
  it('moves a floor when its height changes, with no run', () => {
    // A *middle* floor, deliberately. Raising the topmost one rescales the whole plot and leaves
    // it pinned at the top of the canvas, so the obvious version of this test asserts that the
    // top row did not move — which it never does — and passes on a preview that reads nothing.
    const source = sourceOf('garden-apartments');
    const before = previewGeometry(source);
    const after = previewGeometry(updateFloor(source, '4', { heightM: 11.5 }));
    expect(after.floors.find((floor) => floor.id === '4')?.heightM).toBe(11.5);
    expect(before.floors.find((floor) => floor.id === '4')?.heightM).toBe(9);

    // And the layout actually moves the row, which is the visible half of the claim.
    const layoutOf = (geometry: typeof before): number =>
      buildLayout({ width: 900, height: 600, floors: geometry.floors, shafts: geometry.shafts })
        .rows.find((row) => row.floorId === '4')?.y ?? -1;
    expect(layoutOf(after)).toBeLessThan(layoutOf(before));
  }, 120_000);

  it('adds a shaft the moment a car is added', () => {
    const source = sourceOf('garden-apartments');
    const before = previewGeometry(source);
    const after = previewGeometry(addCar(source, 'main', { id: 'C', spec: 'hydraulic' }));
    expect(after.shafts).toHaveLength(before.shafts.length + 1);
    expect(after.shafts.map((shaft) => shaft.carId)).toContain('main-C');
  }, 120_000);
});

describe('unserved floors — RV-08 in the editor', () => {
  it('names a floor no bank reaches', () => {
    const source = sourceOf('garden-apartments');
    expect(previewGeometry(source).unservedFloorIds).toEqual([]);
    const orphaned = {
      ...source,
      banks: source.banks.map((bank) => ({
        ...bank,
        servesFloors: bank.servesFloors.filter((id) => id !== '6'),
      })),
    };
    expect(previewGeometry(orphaned).unservedFloorIds).toEqual(['6']);
    expect(describePreview(previewGeometry(orphaned))).toContain('Floors no bank serves: 6');
  }, 120_000);

  it('is empty again once the floor itself is removed', () => {
    const source = sourceOf('garden-apartments');
    expect(previewGeometry(removeFloor(source, '6')).unservedFloorIds).toEqual([]);
  }, 120_000);
});
