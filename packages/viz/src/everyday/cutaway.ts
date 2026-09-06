/**
 * **§ 7.2's picture, as a painter** — the canvas sizing rule and the cutaway, moved out of
 * `stageScreen.ts` for GitHub issue #348 so that Fix a building's case screen can play the
 * as-built run on the same picture the stage draws (`docs/35` PM-FB1) without importing the stage,
 * its transport, its goals and its race strip. Two consumers of one painter rather than two
 * painters: a car that reads as a car on the stage reads as the same car here.
 *
 * Every word and every rectangle in here is decided elsewhere — the docstring on
 * {@link drawCutaway} says where — and this module adds nothing of its own: it is the moved text,
 * with its imports. `stageScreen.ts` still owns the stage; this file owns the paint.
 */

import type { Frame, VizRecording } from '../contract/types.js';
import type { FloorQueue } from '../frame/overlay.js';
import { carRestsAt } from '../render/carRest.js';
import {
  stageCarPaintOf,
  stageCarReadoutOf,
  stageCarRestBarOf,
  stageCrowdCapOf,
  stageInkFor,
  STAGE_OUT_OF_SERVICE,
  type StageGeometry,
} from './stageScreenModel.js';
import { EVERYDAY_COLORS as C, EVERYDAY_TYPE as TYPE } from './tokens.js';

/**
 * Size a canvas for the device, or refuse.
 *
 * § 14: read the bounding rect, multiply by `min(2, devicePixelRatio)`, set the transform. Never a
 * CSS scale — a CSS-scaled canvas is a bitmap stretched, and the hairlines this cutaway is mostly
 * made of go to mush.
 *
 * **`false` for a zero box, and that is the § D335 rule rather than defensiveness.** A canvas
 * measured while an ancestor is `display:none` reports `0 × 0`; sizing to that and drawing produces
 * a blank canvas that stays blank when the ancestor comes back, because nothing re-measures. So a
 * zero box is *not* a size — it is "ask again next frame".
 */
export function sizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | undefined {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return undefined;
  const dpr = Math.min(2, canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1);
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return undefined;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/* -------------------------------------------------------------------------- *
 * The cutaway
 * -------------------------------------------------------------------------- */

/** What one paint of the cutaway needs. All of it derived at one instant, by the caller. */
export interface CutawayInput {
  readonly recording: VizRecording;
  readonly frame: Frame;
  readonly queues: readonly FloorQueue[];
  readonly geometry: StageGeometry;
  readonly floorLabelOf: (id: string) => string;
}

/**
 * § 7.2's picture: floor slabs, shaft wells as light voids, cars as dark boxes with amber doors that
 * split as they open, riders as marks inside the car, a `riders/capacity` readout, a direction arrow
 * while travelling, and the waiting crowd as capsules coloured by how long each person has stood.
 *
 * The colour is `stageScreenModel.ts#stageInkFor`, which reads `live/bands.ts`' boundaries — so a
 * capsule on this screen and the mood card in the Engineer rail are two paints of one banding.
 *
 * ## Every word and every rectangle in here is decided elsewhere
 *
 * This function draws five `fillText` sites, and until GitHub issue **#212** three of them were
 * composed **here**: the out-of-service caption, the `riders/capacity` readout and the direction
 * glyph. A string composed in a mount is a string no honesty property can read — the mount needs a
 * document, a canvas and an animation frame, so `derive.test.ts` excludes it, correctly. One of the
 * three was a **live figure** drawn on the vertical slice's centrepiece and swept by nothing.
 *
 * They are `stageScreenModel.ts#STAGE_OUT_OF_SERVICE` and `#stageCarReadoutOf` now, and the car's
 * geometry is `#stageCarPaintOf` for the same reason one layer down: the door-fill inversion #212
 * reports was arithmetic nothing could check without a canvas. What is left here is where a
 * rectangle lands on the page and which colour the brush is.
 */
export function drawCutaway(ctx: CanvasRenderingContext2D, input: CutawayInput): void {
  const { geometry: g, frame, recording } = input;
  ctx.clearRect(0, 0, g.width, g.height);

  /* The building's ground: a warm well behind the whole elevation. */
  ctx.fillStyle = C.cardSunk;
  roundedRect(ctx, g.plot.x, g.plot.y, g.plot.width, g.plot.height, 10);
  ctx.fill();

  /* --- Floor slabs, with the number and the tenant line in the gutter. --- */
  const slab = Math.max(2, Math.min(4, g.rowPitch * 0.16));
  /*
   * Everything from here to the end of the cars is clipped to the plot — GitHub issue #324. With
   * the camera on a band, rows and cars outside it still have a `y` (the same scale, continued),
   * and the clip is what turns that into a window rather than a drawing that spills over the
   * chrome. With the whole tower fitted nothing lies outside the plot and the clip is a no-op.
   */
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.plot.x, g.plot.y, g.plot.width, g.plot.height);
  ctx.clip();
  for (const row of g.rows) {
    if (!row.visible) continue;
    ctx.fillStyle = row.isEntrance ? C.ruleMid : C.ruleLight;
    ctx.fillRect(g.plot.x + 6, row.y, g.plot.width - 12, slab);
    if (!row.labelled) continue;
    ctx.fillStyle = row.isEntrance ? C.ink : C.warmGrey;
    ctx.font = `600 ${String(Math.min(11, Math.max(8, g.rowPitch * 0.45)))}px ${TYPE.mono}`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(input.floorLabelOf(row.floorId), g.plot.x + 4, row.y - 1, g.gutterWidth - 8);
  }

  /* --- The wells. A void is lighter than the building around it, per § 7.2. --- */
  for (const column of g.columns) {
    if (column.outOfService) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = C.faint;
      ctx.lineWidth = 1;
      ctx.strokeRect(column.x, g.plot.y + 6, column.width, g.plot.height - 12);
      ctx.restore();
      ctx.save();
      ctx.translate(column.centreX, g.plot.y + g.plot.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = C.warmGrey;
      ctx.font = `500 9px ${TYPE.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(STAGE_OUT_OF_SERVICE, 0, 0);
      ctx.restore();
      continue;
    }
    ctx.fillStyle = C.paper;
    ctx.fillRect(column.x, g.plot.y + 6, column.width, g.plot.height - 12);
  }

  /* --- The waiting crowd, at the landings. --- */
  const capsuleW = 4.5;
  const capsuleH = Math.max(5, Math.min(11, g.rowPitch * 0.62));
  const perRow = Math.max(1, Math.floor((g.landing.width - 8) / (capsuleW + 2)));
  for (const floor of input.queues) {
    const row = g.rows.find((candidate) => candidate.floorId === floor.floorId);
    if (row === undefined || !row.visible) continue;
    const cap = stageCrowdCapOf(floor.riders.length);
    for (let index = 0; index < cap.drawn; index += 1) {
      const rider = floor.riders[index];
      if (rider === undefined) continue;
      const lane = Math.floor(index / perRow);
      const slot = index % perRow;
      /* Right-to-left from the well, so the queue reads as a crowd pressed against the doors. */
      const x = g.landing.x + g.landing.width - 6 - (slot + 1) * (capsuleW + 2) - lane * 1.5;
      const y = row.y - 2 - capsuleH - lane * (capsuleH * 0.25);
      ctx.fillStyle = stageInkFor(rider.waitedS);
      roundedRect(ctx, x, y, capsuleW, capsuleH, capsuleW / 2);
      ctx.fill();
    }
    if (cap.overflow !== undefined) {
      ctx.fillStyle = C.ink;
      ctx.font = `600 9px ${TYPE.mono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(cap.overflow, g.landing.x + 2, row.y - 2);
    }
  }

  /* --- The cars. --- */
  const carH = Math.max(9, Math.min(20, g.rowPitch * 0.86));
  /* AD-S17. Derived once per paint from the record's own motions and door marks — never from a
     field on the frame, and never from a motion the playhead has not reached. */
  const restByCar = new Map(carRestsAt(recording, frame).map((rest) => [rest.carId, rest]));
  for (const car of frame.cars) {
    const column = g.columns.find((candidate) => candidate.carId === car.carId);
    if (column === undefined || column.outOfService) continue;
    const shaft = recording.shafts.find((candidate) => candidate.carId === car.carId);
    const y = g.yForHeight(car.heightM) - carH;
    const bodyX = column.x + 1.5;
    const bodyWidth = column.width - 3;
    ctx.fillStyle = C.ink;
    roundedRect(ctx, bodyX, y, bodyWidth, carH, 3);
    ctx.fill();

    /*
     * Everything inside the car is `stageScreenModel.ts#stageCarPaintOf`'s — GitHub issue **#212**.
     * The doorway, the two leaves and the mark grid used to be arithmetic here, and the arithmetic
     * was inverted: at `doorFraction = 0` each leaf was half the body, so a shut car was a solid
     * amber block and the `paper` marks sat on it at 1.83:1. Nothing about that could be checked
     * without a canvas. It is a plan now, and this loop paints it.
     */
    const paint = stageCarPaintOf({
      bodyWidth,
      carHeight: carH,
      doorFraction: car.doorFraction,
      occupants: car.occupants,
    });
    ctx.fillStyle = C.sun;
    for (const leaf of paint.leaves) {
      ctx.fillRect(bodyX + leaf.x, y + leaf.y, leaf.width, leaf.height);
    }
    /* Riders aboard, capped at nine — § 14. A tenth mark says nothing a reader can count. */
    ctx.fillStyle = C.paper;
    for (const mark of paint.marks) {
      ctx.fillRect(bodyX + mark.x, y + mark.y, mark.width, mark.height);
    }

    /* `riders/capacity`, and the direction arrow while it travels. */
    const readout = stageCarReadoutOf({
      occupants: car.occupants,
      capacityPersons: shaft?.capacityPersons,
      direction: car.direction,
    });
    ctx.fillStyle = C.warmGrey;
    ctx.font = `500 8.5px ${TYPE.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(readout.occupancy, column.centreX, y - 1.5);
    if (readout.direction !== undefined) {
      ctx.fillStyle = C.terracotta;
      ctx.font = `600 9px ${TYPE.mono}`;
      ctx.fillText(readout.direction, column.centreX, y - 10);
    } else {
      /*
       * **AD-S17 — the rest bar.** The third state of the slot above, and the only mark in this
       * cutaway that says a lift is doing nothing.
       *
       * `docs/34` § 9.2 is the whole argument for it: a parking fault is *"the product's most-used
       * fault family"* and *"has no mark on the stage"*, because an idle car is a stationary car
       * with `direction === 0` and is pixel-identical to any empty car that happens to be stopped.
       * Campaign stage 1 asks the player to reason about where the lifts wait; this is the first
       * thing on the screen that shows them waiting.
       *
       * `inkSoft` rather than `ink`, and neither `terracotta` nor `sun`: the car's own body is
       * `ink`, so a bar in it would read as part of the car rather than as a mark about it, and an
       * alarm colour would make the stage assert that standing still is *wrong* — which is the
       * player's conclusion to reach and not the renderer's to draw. `inkSoft` on the well's
       * `paper` is the same family one rung down, measured at **8.36:1** in
       * `render/carRest.test.ts`, and it is the only ink in this cutaway that no other mark uses.
       */
      const rest = restByCar.get(car.carId);
      if (rest !== undefined) {
        const bar = stageCarRestBarOf({ bodyWidth, fill: rest.fill });
        ctx.fillStyle = C.inkSoft;
        ctx.fillRect(bodyX + bar.x, y + bar.y, bar.width, bar.height);
      }
    }
  }
  ctx.restore();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
