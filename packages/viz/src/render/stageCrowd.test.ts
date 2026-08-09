/**
 * The crowd, on the stage the shell actually builds — GitHub issues #115 § 2 and #103.
 *
 * ## Why this file exists rather than more cases in `stageRender.test.ts`
 *
 * `stageRender.test.ts` proves that `drawRiderLane` draws a person when it is given a lane and a
 * rider. It builds that lane itself, with `buildLayout` and a width it chose. **Every assertion in
 * it was true, and no shipped building drew a person.**
 *
 * Measured on this tree before the change, at the 910 × 547 canvas a 1600 × 1000 viewport
 * produces: `Layout.riderLane` was `undefined` on **seven of the eight shipped buildings**. The
 * one exception was Garden Apartments — two cars, the only bank narrow enough that
 * `MAX_SHAFT_WIDTH_PX` left 114 px behind — and Garden Apartments is the building whose landings
 * are empty at 5 s, 15 s, 30 s, 60 s, 120 s and 300 s of its own shipped run. So the feature was
 * configured, wired, unit-tested and reached **no shipped configuration that had a person to
 * draw**, which is the shape `CLAUDE.md`'s standing requirement is written about, arriving through
 * geometry rather than through a missing call.
 *
 * So this file asserts against the two things that test could not see:
 *
 * 1. **The shell's own layout function**, `dev/main.ts#stageLayoutFor` — the non-test caller — at
 *    the canvas the viewer really runs, rather than a `buildLayout` with numbers chosen here.
 * 2. **The shipped buildings and their own recordings**, rather than a fixture with a queue put
 *    into it by hand.
 *
 * ## What a figure is allowed to mean
 *
 * A figure stands for a rider who is standing on that floor **at that playhead**, and for nothing
 * else. `queueAt` is evaluated at the frame's own `simTimeS`, so the last block below scrubs to an
 * instant when nobody is waiting and requires the stage to draw nobody — the negative half that
 * stops a crowd from being scenery. It is the same rule [§ D307](../../../../DECISIONS.md) applied
 * to the banner above it: a surface may not publish, short of `endedAt`, a figure that is only
 * true of the whole run.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { stageLayoutFor } from '../dev/main.js';
import { BUILDING_IDS, DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import { queueAt } from '../frame/overlay.js';
import { frameAt } from '../frame/frameAt.js';
import { recordRun } from '../record/recordRun.js';
import type { VizRecording } from '../contract/types.js';
import { DEFAULT_THEME, drawScene, type Canvas2DLike } from './canvas.js';
import type { Layout } from './layout.js';

/**
 * The canvas a 1600 × 1000 viewport gives the stage, measured in the browser and quoted in issue
 * #115's own table. Everything here is asserted at the size a reader actually gets.
 */
const SHIPPED_CANVAS = { width: 910, height: 547 } as const;
/** And the one a 1440 × 900 viewport gives it, from the same table. Below `RS-03`'s panel cutoff. */
const LAPTOP_CANVAS = { width: 750, height: 308 } as const;

/** Long enough for the tall buildings to build a queue — the horizon `dev/main.ts` itself runs. */
const DURATION_S = 900;

class ArcCounter implements Canvas2DLike {
  readonly arcs: { readonly x: number; readonly y: number }[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  font = '';
  textAlign: Canvas2DLike['textAlign'] = 'start';
  textBaseline: Canvas2DLike['textBaseline'] = 'alphabetic';
  globalAlpha = 1;
  save(): void {}
  restore(): void {}
  clearRect(): void {}
  fillRect(): void {}
  strokeRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  quadraticCurveTo(): void {}
  /**
   * The one `arc` in this renderer is a rider's head — `render/shapes.ts#fillCircle`, called from
   * `render/riderFigures.ts` and from nowhere else in `render/`. Counting arcs is therefore
   * counting people, without this file having to know a colour or a coordinate.
   */
  arc(x: number, y: number): void {
    this.arcs.push({ x, y });
  }
  fill(): void {}
  stroke(): void {}
  fillText(): void {}
}

let config: LoadedConfig;
const recordings = new Map<string, VizRecording>();

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  for (const id of BUILDING_IDS) {
    recordings.set(
      id,
      recordRun(fixtureConfig(config, { buildingId: id, durationS: DURATION_S, onTimeout: 'report' }))
        .recording,
    );
  }
});

function stageFor(id: string, canvas: { readonly width: number; readonly height: number }): Layout {
  const recording = recordings.get(id);
  if (recording === undefined) throw new Error(`no recording for ${id}`);
  return stageLayoutFor({
    ...canvas,
    floors: recording.floors,
    shafts: recording.shafts,
    // The shell's own rule — `RS-03` drops the panel below 900 px of canvas.
    wantsOverlay: canvas.width >= 900,
  });
}

/**
 * The two buildings whose shafts fill the plot, and which therefore keep the picture they had.
 *
 * Mixed-Use High-Rise draws sixteen shafts at 21 px and Vertical City thirty-five at 18 px — the
 * layout's own legible minimum. There is no lane to be had without hiding a machine, and the
 * shafts are the subject. Their landing rows in the right gutter carry the whole claim, which is
 * `render/riderFigures.ts`'s stated degradation: **aggregate, never remove.**
 */
const NO_ROOM_FOR_A_LOBBY = new Set(['mixed-use-high-rise', 'vertical-city']);

describe('the stage has a crowd on it — issue #115 § 2, issue #103', () => {
  it('reserves a lane on six of the eight shipped buildings, at the viewer’s own canvas', () => {
    const withLane = BUILDING_IDS.filter((id) => stageFor(id, SHIPPED_CANVAS).riderLane !== undefined);
    expect([...withLane].sort()).toStrictEqual(
      BUILDING_IDS.filter((id) => !NO_ROOM_FOR_A_LOBBY.has(id))
        .slice()
        .sort(),
    );
    // Six, and before the change it was one — and that one was the empty building.
    expect(withLane).toHaveLength(6);
  });

  it('reserves it at a laptop canvas too, where the metrics panel has already gone', () => {
    for (const id of BUILDING_IDS) {
      const layout = stageFor(id, LAPTOP_CANVAS);
      expect(layout.overlay, `${id}: RS-03 drops the panel below 900 px`).toBeUndefined();
      expect(
        layout.riderLane === undefined,
        `${id}: the lane at a laptop canvas disagrees with the desktop one`,
      ).toBe(NO_ROOM_FOR_A_LOBBY.has(id));
    }
  });

  it('never trades a shaft, or a legible one, for a person', () => {
    /*
     * The cost that would make this a bad bargain, checked at both canvases. `count` is decided
     * against the **whole** plot and the lane is only taken if the same shafts still stand in what
     * is left, so these numbers are the ones the layout produced before the lane existed:
     * everything fits except Vertical City, which hides 2 at a desktop canvas and 9 at a laptop one
     * and says so through `RS-05`'s notice.
     */
    const hidden: Record<string, readonly [number, number]> = {
      'chancery-house': [0, 0],
      'crown-hotel': [0, 0],
      'garden-apartments': [0, 0],
      'midtown-office': [0, 0],
      'mixed-use-high-rise': [0, 0],
      'secure-tower': [0, 0],
      'st-jude-hospital': [0, 0],
      'vertical-city': [2, 9],
    };
    for (const id of BUILDING_IDS) {
      const shipped = stageFor(id, SHIPPED_CANVAS);
      const laptop = stageFor(id, LAPTOP_CANVAS);
      expect([shipped.hiddenShaftCount, laptop.hiddenShaftCount], id).toStrictEqual(hidden[id]);
      for (const layout of [shipped, laptop]) {
        for (const column of layout.columns) {
          // `render/layout.ts`'s own `MIN_SHAFT_WIDTH_PX`. A lane funded by squeezing a shaft below
          // the width the layout calls legible would be trading the subject for the scenery.
          expect(column.width, `${id}: ${column.label}`).toBeGreaterThanOrEqual(18);
        }
      }
    }
  });

  it('draws one head per waiting rider, and draws them in the lane', () => {
    const id = 'midtown-office';
    const recording = recordings.get(id);
    if (recording === undefined) throw new Error('no recording');
    const layout = stageFor(id, SHIPPED_CANVAS);
    const lane = layout.riderLane;
    expect(lane, 'midtown-office lost its lane').toBeDefined();
    if (lane === undefined) return;

    const frame = frameAt(recording, recording.startedAt + 300);
    const queues = queueAt(recording, frame.simTimeS);
    const standing = queues.reduce((total, queue) => total + queue.total, 0);
    expect(standing, 'the sampled instant has nobody standing, so it proves nothing').toBeGreaterThan(
      0,
    );

    const ctx = new ArcCounter();
    drawScene(ctx, {
      recording,
      frame,
      layout,
      unservedFloorIds: [],
      unansweredCallFloorIds: [],
      lockedOutLandings: [],
      queues,
    });
    expect(ctx.arcs.length, 'no people were drawn on a stage with people on it').toBeGreaterThan(0);
    // Never more heads than there are people: the lane truncates to a `+N` rather than inventing a
    // crowd, which is what stops a figure from being decoration.
    expect(ctx.arcs.length).toBeLessThanOrEqual(standing);
    for (const arc of ctx.arcs) {
      expect(arc.x).toBeGreaterThanOrEqual(lane.x);
      expect(arc.x).toBeLessThanOrEqual(lane.x + lane.width);
      // Inside the plot, so a top-floor queue is not drawn up through the shaft labels.
      expect(arc.y).toBeGreaterThanOrEqual(layout.plot.y);
      expect(arc.y).toBeLessThanOrEqual(layout.plot.y + layout.plot.height);
    }
  });

  it('draws nobody at a playhead where nobody is waiting', () => {
    /*
     * The half that makes the crowd a reading rather than a decoration — the temporal rule
     * § D307 states for the banner, applied to the figures. `recordRun` simulates the whole day
     * before the first paint, so a renderer that drew from the *run* rather than from the
     * *playhead* would put the day's crowd on the stage at 00:00 and look completely convincing.
     */
    const id = 'midtown-office';
    const recording = recordings.get(id);
    if (recording === undefined) throw new Error('no recording');
    const layout = stageFor(id, SHIPPED_CANVAS);
    const frame = frameAt(recording, recording.startedAt);
    const queues = queueAt(recording, frame.simTimeS);
    expect(queues.reduce((total, queue) => total + queue.total, 0)).toBe(0);

    const ctx = new ArcCounter();
    drawScene(ctx, {
      recording,
      frame,
      layout,
      unservedFloorIds: [],
      unansweredCallFloorIds: [],
      lockedOutLandings: [],
      queues,
    });
    expect(ctx.arcs).toHaveLength(0);
  });
});
