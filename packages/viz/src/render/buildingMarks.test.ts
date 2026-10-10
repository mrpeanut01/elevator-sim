/**
 * **Where a credential decides, and where an escalator joins two floors — on the stage** (GitHub
 * issue #544, `DECISIONS.md` § D1307).
 *
 * #544 found that the stage could draw an access refusal only after it happened (`▩`) and could
 * not draw an escalator at all, because the recording carried neither the building's zones nor its
 * non-lift edges. Version 17 carries both, and the claims below are the lane's acceptance:
 *
 * 1. Stage 5's recording (`secure-tower`, *Credentials*) carries its access zones, and stage 6's
 *    (`vertical-city`, *The tall one*) its escalators, read off the building the run was simulated on.
 * 2. Each is drawn with a glyph, on **both** painters: the Engineer schematic (`render/canvas.ts`)
 *    and the § 7 stage a player plays on (`everyday/cutaway.ts`).
 * 3. Each is said in a sentence, in the canvas's text alternative.
 * 4. A building that declares neither records what version 16 recorded, apart from the number.
 *
 * Every glyph assertion is over the **label gutter**, row by row, and in both directions: a zoned
 * labelled row carries `⚿` and an unzoned one does not. A mark drawn on every row would pass a
 * one-directional check, and so would one drawn in a banner.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { STATE_GLYPHS } from '../access/zoning.js';
import type { VizRecording } from '../contract/types.js';
import { drawCutaway } from '../everyday/cutaway.js';
import { stageGeometryOf } from '../everyday/stageScreenModel.js';
import { DATA_DIR, fixtureConfig, requireBuilding } from '../fixtures.test-helper.js';
import { frameAt } from '../frame/frameAt.js';
import { recordRun } from '../record/recordRun.js';
import { ACCESS_ZONE_GLYPH, TRANSPORT_MODE_GLYPHS, expressBankIdsOf, floorMarksOf } from './buildingMarks.js';
import { DEFAULT_THEME, drawScene, type Canvas2DLike } from './canvas.js';
import { describeFrame } from './describeFrame.js';
import { buildLayout } from './layout.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

let config: LoadedConfig;
/** `data/campaign.json`'s stages, by their one-based number, for the building each one plays. */
let stageBuildingIds: readonly string[];
const recordings = new Map<string, VizRecording>();

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const campaign = JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8')) as {
    readonly stages: readonly { readonly building: string }[];
  };
  stageBuildingIds = campaign.stages.map((stage) => stage.building);
});

/** One 600 s run of a building, recorded once per file. */
function recordingOf(buildingId: string): VizRecording {
  const cached = recordings.get(buildingId);
  if (cached !== undefined) return cached;
  const { recording } = recordRun(fixtureConfig(config, { buildingId, onTimeout: 'report' }));
  recordings.set(buildingId, recording);
  return recording;
}

function stageBuilding(stage: number): string {
  const id = stageBuildingIds[stage - 1];
  if (id === undefined) throw new Error(`data/campaign.json has no stage ${String(stage)}`);
  return id;
}

/* -------------------------------------------------------------------------- *
 * The two painters' gutters
 * -------------------------------------------------------------------------- */

/** Every gutter label `drawFloors` wrote, by floor, on a canvas wide and tall enough to label. */
function schematicGutter(recording: VizRecording): ReadonlyMap<string, string> {
  const layout = buildLayout({ width: 1400, height: 2400, floors: recording.floors, shafts: recording.shafts });
  const texts: { text: string; x: number; y: number }[] = [];
  const ctx: Canvas2DLike = new Proxy({} as Canvas2DLike, {
    get(_target, key) {
      if (key === 'fillText') {
        return (text: string, x: number, y: number) => texts.push({ text, x, y });
      }
      return () => undefined;
    },
    set: () => true,
  });
  drawScene(ctx, {
    recording,
    frame: frameAt(recording, recording.startedAt),
    layout,
    theme: DEFAULT_THEME,
  });
  const byFloor = new Map<string, string>();
  const gutterX = layout.plot.x - 8;
  for (const row of layout.rows) {
    if (!row.labelled) continue;
    const label = texts.find((entry) => entry.x === gutterX && entry.y === row.y);
    if (label !== undefined) byFloor.set(row.floorId, label.text);
  }
  return byFloor;
}

/** Every gutter label the § 7 cutaway wrote, by floor. */
function stageGutter(recording: VizRecording): ReadonlyMap<string, string> {
  const geometry = stageGeometryOf({
    width: 1400,
    height: 2400,
    floors: recording.floors,
    shafts: recording.shafts,
  });
  const texts: { text: string; x: number; y: number }[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_target, key) {
      if (key === 'fillText') {
        return (text: string, x: number, y: number) => texts.push({ text, x, y });
      }
      return () => undefined;
    },
    set: () => true,
  });
  const frame = frameAt(recording, recording.startedAt);
  drawCutaway(ctx, { recording, frame, queues: [], geometry, floorLabelOf: (id) => id });
  const byFloor = new Map<string, string>();
  for (const row of geometry.rows) {
    if (!row.labelled || !row.visible) continue;
    const label = texts.find((entry) => entry.x === geometry.plot.x + 4 && entry.y === row.y - 1);
    if (label !== undefined) byFloor.set(row.floorId, label.text);
  }
  return byFloor;
}

const PAINTERS = [
  ['the Engineer schematic', schematicGutter],
  ['the § 7 stage', stageGutter],
] as const;

/**
 * Both directions of one mark over one gutter: every labelled floor in `marked` carries it, every
 * other labelled floor does not, and there is at least one of each — or the check is vacuous.
 */
function expectMarkedExactly(gutter: ReadonlyMap<string, string>, glyph: string, marked: ReadonlySet<string>): void {
  const withMark = [...gutter].filter(([, text]) => text.includes(glyph)).map(([id]) => id);
  const expected = [...gutter.keys()].filter((id) => marked.has(id));
  expect(withMark).toEqual(expected);
  expect(expected.length, 'no labelled floor carries the mark, so the check is vacuous').toBeGreaterThan(0);
  expect(gutter.size - expected.length, 'every labelled floor carries the mark').toBeGreaterThan(0);
}

/* -------------------------------------------------------------------------- *
 * 1. The recording carries them
 * -------------------------------------------------------------------------- */

describe('version 17 carries the building’s access zones and escalators — #544, § D1307', () => {
  it('stage 5’s recording carries its access zones, each zone’s floors in building order', () => {
    const buildingId = stageBuilding(5);
    const building = requireBuilding(config, buildingId);
    expect(building.accessZones.length, `${buildingId} declares no access zone`).toBeGreaterThan(0);
    const recording = recordingOf(buildingId);
    const order = recording.floors.map((floor) => floor.id);
    expect(recording.accessZones).toEqual(
      building.accessZones.map((zone) => ({
        id: zone.id,
        floorIds: order.filter((id) => zone.floors.includes(id)),
        credentialGroups: zone.credentialGroups,
      })),
    );
    /* Absent, not empty, where the building declares none. */
    expect('transportModes' in recording).toBe(building.transportModes.length > 0);
  });

  it('stage 6’s recording carries its escalators, each with its kind and its floors lower first', () => {
    const buildingId = stageBuilding(6);
    const building = requireBuilding(config, buildingId);
    expect(building.transportModes.length, `${buildingId} declares no escalator`).toBeGreaterThan(0);
    const recording = recordingOf(buildingId);
    const indexOf = (id: string): number => building.floorsById.get(id)?.index ?? Number.NaN;
    expect(recording.transportModes).toEqual(
      building.transportModes.map((mode) => ({
        id: mode.id,
        kind: mode.kind ?? 'escalator',
        floorIds: [...mode.connects].sort((a, b) => indexOf(a) - indexOf(b)),
      })),
    );
    expect(recording.transportModes?.every((mode) => mode.kind === 'escalator')).toBe(true);
  });

  it('a building that declares neither records what version 16 recorded, apart from the number', () => {
    /*
     * The guard. Garden Apartments is the career's opener and Midtown Office the first day a newcomer
     * is dealt; neither declares a zone or a non-lift edge. A projection that wrote `[]` would put two
     * new keys into every such recording, which is what this reds on.
     */
    for (const buildingId of ['garden-apartments', 'midtown-office']) {
      const building = requireBuilding(config, buildingId);
      expect(building.accessZones).toEqual([]);
      expect(building.transportModes).toEqual([]);
      const text = JSON.stringify(recordingOf(buildingId));
      expect(text).not.toContain('"accessZones"');
      expect(text).not.toContain('"transportModes"');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 2. Drawn with a glyph, on both painters
 * -------------------------------------------------------------------------- */

describe('each is drawn with a glyph in the label gutter, on both painters', () => {
  for (const [painter, gutterOf] of PAINTERS) {
    it(`${painter}: stage 5 marks exactly its zoned floors with ⚿`, () => {
      const recording = recordingOf(stageBuilding(5));
      const zoned = new Set(recording.accessZones?.flatMap((zone) => zone.floorIds));
      expectMarkedExactly(gutterOf(recording), ACCESS_ZONE_GLYPH, zoned);
    });

    it(`${painter}: stage 6 marks exactly its escalator landings with ⇅`, () => {
      const recording = recordingOf(stageBuilding(6));
      const landings = new Set(recording.transportModes?.flatMap((mode) => mode.floorIds));
      expectMarkedExactly(gutterOf(recording), TRANSPORT_MODE_GLYPHS.escalator, landings);
    });

    it(`${painter}: a building that declares neither draws none of the three marks`, () => {
      const gutter = gutterOf(recordingOf('garden-apartments'));
      expect(gutter.size).toBeGreaterThan(0);
      for (const glyph of [ACCESS_ZONE_GLYPH, ...Object.values(TRANSPORT_MODE_GLYPHS)]) {
        expect([...gutter.values()].some((text) => text.includes(glyph)), glyph).toBe(false);
      }
    });

    it(`${painter}: the mark reads the recording’s zones, not the building’s name`, () => {
      /*
       * § D154's per-reader liveness. The same stage-5 recording with the field deleted draws no `⚿`:
       * a painter that keyed the mark on the building id, or on the credential a leg carries, would
       * still draw it.
       */
      const { accessZones: _dropped, ...withoutZones } = recordingOf(stageBuilding(5));
      const gutter = gutterOf(withoutZones);
      expect([...gutter.values()].some((text) => text.includes(ACCESS_ZONE_GLYPH))).toBe(false);
    });
  }

  it('the § 7 stage draws § D624’s roof mark on exactly the express banks’ wells', () => {
    /*
     * Until § D1307 the express mark was the Engineer schematic's alone, and #544 asked for the
     * stage a day is played on. Stage 6's tower has shuttles to its sky lobbies and local banks
     * above them, so both directions are on one building.
     */
    const recording = recordingOf(stageBuilding(6));
    const express = expressBankIdsOf(recording);
    const banks = new Set(recording.shafts.map((shaft) => shaft.bankId));
    expect(express.size).toBeGreaterThan(0);
    expect(banks.size - express.size).toBeGreaterThan(0);
    const geometry = stageGeometryOf({ width: 1400, height: 2400, floors: recording.floors, shafts: recording.shafts });
    const peaks: { x: number; y: number }[] = [];
    let previous: { x: number; y: number } | undefined;
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get(_target, key) {
        if (key === 'moveTo') return (x: number, y: number) => (previous = { x, y });
        if (key === 'lineTo') {
          return (x: number, y: number) => {
            /* A roof's peak: the first line goes up and to the right from the path's start. */
            if (previous !== undefined && y < previous.y && x > previous.x) peaks.push({ x, y });
            previous = undefined;
          };
        }
        return () => undefined;
      },
      set: () => true,
    });
    drawCutaway(ctx, {
      recording,
      frame: frameAt(recording, recording.startedAt),
      queues: [],
      geometry,
      floorLabelOf: (id) => id,
    });
    const top = geometry.plot.y + 6;
    const bankOf = new Map(recording.shafts.map((shaft) => [shaft.carId, shaft.bankId] as const));
    const roofed = new Set(
      geometry.columns
        .filter((column) => peaks.some((peak) => peak.x === column.centreX && peak.y === top))
        .map((column) => column.carId),
    );
    expect([...roofed].sort()).toEqual(
      geometry.columns
        .filter((column) => express.has(bankOf.get(column.carId) ?? ''))
        .map((column) => column.carId)
        .sort(),
    );
  });

  it('the stairs at St Jude draw their own mark, not the escalator’s', () => {
    const recording = recordingOf('st-jude-hospital');
    const stairs = recording.transportModes?.filter((mode) => mode.kind === 'stairs') ?? [];
    expect(stairs.length).toBeGreaterThan(0);
    const marks = floorMarksOf(recording);
    for (const floorId of stairs.flatMap((mode) => mode.floorIds)) {
      expect(marks.get(floorId)).toContain(TRANSPORT_MODE_GLYPHS.stairs);
      expect(marks.get(floorId)).not.toContain(TRANSPORT_MODE_GLYPHS.escalator);
    }
  });

  it('the three access marks stay three: the building’s zone, the run’s refusal, and no shaft at all', () => {
    expect(ACCESS_ZONE_GLYPH).not.toBe(STATE_GLYPHS['not-permitted']);
    expect(ACCESS_ZONE_GLYPH).not.toBe(STATE_GLYPHS['not-served']);
    expect(new Set(Object.values(TRANSPORT_MODE_GLYPHS)).size).toBe(Object.keys(TRANSPORT_MODE_GLYPHS).length);
  });
});

/* -------------------------------------------------------------------------- *
 * 3. Said in a sentence
 * -------------------------------------------------------------------------- */

describe('each is said in the canvas’s text alternative', () => {
  const sentenceOf = (recording: VizRecording): string =>
    describeFrame({ recording, frame: frameAt(recording, recording.startedAt) });

  it('stage 5 says where a credential decides who may ride', () => {
    const recording = recordingOf(stageBuilding(5));
    expect(sentenceOf(recording)).toContain(
      `${String(recording.accessZones?.length)} access zones cover floors 2–30: only a rider whose ` +
        'credential the zone admits may ride to them.',
    );
  });

  it('stage 6 says which floors its escalators join', () => {
    expect(sentenceOf(recordingOf(stageBuilding(6)))).toContain(
      '4 escalators join floors G to 2, 26 to 27, 51 to 52 and 76 to 77.',
    );
  });

  it('St Jude says its stair, as a stair', () => {
    expect(sentenceOf(recordingOf('st-jude-hospital'))).toContain('A stair joins floors G to 1.');
  });

  it('a building that declares neither says neither', () => {
    const sentence = sentenceOf(recordingOf('garden-apartments'));
    expect(sentence).not.toContain('access zone');
    expect(sentence).not.toContain('escalator');
    expect(sentence).not.toContain('stair');
  });
});
