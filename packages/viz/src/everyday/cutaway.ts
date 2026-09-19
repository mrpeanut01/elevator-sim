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
import { WAIT_BANDS } from '../live/bands.js';
import { carRestsAt } from '../render/carRest.js';
import type { Canvas2DLike } from '../render/canvas.js';
import { drawRiderFigure, MIN_FIGURE_HEIGHT_PX, withAlpha } from '../render/riderFigures.js';
import {
  stageBandOf,
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
  /*
   * **Figures or capsules, and the threshold is derived rather than chosen** — see
   * {@link drawRiderFigure}. `render/riderFigures.ts#MIN_FIGURE_HEIGHT_PX` is that module's own
   * floor for *"the shortest thing that still reads as a person"*, read out of `figureHeightPx`
   * rather than transcribed. `capsuleH` is `rowPitch × 0.62`, so the switch falls at a row pitch
   * of **12.9 px** — which lands, without anybody arranging it, on the pitch at which this stage
   * already stops giving a floor its own label (`stageScreenModel.ts`'s 13 px). The argument is
   * the same in both places: below it there is not room to say a thing per row.
   *
   * At 165 floors on `whole` the pitch is about 3 px and this is `false` everywhere, which is the
   * regime the camera exists for. What does **not** degrade there is AD-S7's height channel below
   * — the capsule branch applies it too — nor AD-S8's wash, which is a whole-row signal and does
   * not depend on pitch at all.
   */
  const asFigures = capsuleH >= MIN_FIGURE_HEIGHT_PX;
  for (const floor of input.queues) {
    const row = g.rows.find((candidate) => candidate.floorId === floor.floorId);
    if (row === undefined || !row.visible) continue;

    /*
     * **AD-S8 — the landing carries its own worst band.** *"A whole row going warm is visible from
     * across a room; twenty-six capsules are not."* A state at the playhead, so it is R6-clean.
     *
     * Keyed on `oldestWaitS` through this surface's own ladder rather than on
     * `FloorQueue.worstBand`, and that is not a shortcut. `worstBand` is `frame/overlay.ts`'
     * **run-relative** ladder (half the long-wait threshold, the threshold, the horizon) while
     * every capsule on this stage is coloured by `live/bands.ts`' **absolute** one (30 / 60 /
     * 120 s). The two disagree above the first boundary, so a wash drawn from one and capsules
     * drawn from the other would put a warm row under calm marks. `stageBandOf` is monotone in the
     * wait and `oldestWaitS` is the maximum, so this *is* the deepest band present — measured on
     * the ladder the reader is looking at.
     */
    if (floor.total > 0) {
      ctx.fillStyle = withAlpha(stageInkFor(floor.oldestWaitS), LANDING_WASH_ALPHA);
      ctx.fillRect(g.landing.x, row.y - g.rowPitch, g.landing.width, g.rowPitch);
    }

    const cap = stageCrowdCapOf(floor.riders.length);
    for (let index = 0; index < cap.drawn; index += 1) {
      const rider = floor.riders[index];
      if (rider === undefined) continue;
      const lane = Math.floor(index / perRow);
      const slot = index % perRow;
      /* Right-to-left from the well, so the queue reads as a crowd pressed against the doors. */
      const x = g.landing.x + g.landing.width - 6 - (slot + 1) * (capsuleW + 2) - lane * 1.5;
      const feetY = row.y - 2 - lane * (capsuleH * 0.25);
      const bandRank = stageBandRankOf(rider.waitedS);
      const ink = stageInkFor(rider.waitedS);
      if (asFigures) {
        /*
         * One silhouette, two stages. The bob is `sin(simTimeS · rate + hash(passengerId))` inside
         * `drawRiderFigure` — simulated time and a passenger id, never a wall clock and never an
         * accumulator, so scrubbing back to this instant redraws this picture exactly.
         */
        drawRiderFigure(asCanvas2DLike(ctx), {
          centreX: x + capsuleW / 2,
          feetY,
          heightPx: capsuleH,
          bandRank,
          passengerId: rider.passengerId,
          simTimeS: frame.simTimeS,
          fill: ink,
        });
      } else {
        /*
         * **AD-S7 at a pitch too small for a person.** The capsule survives, and it now carries the
         * band in its **height** as well as its hue. `capsuleH` used to be hoisted outside this
         * loop, so every rider was the same size and at 4.5 px the band rode on colour alone —
         * `UX.md` KB-15's exact prohibition, on the one surface `docs/38` says a beginner meets.
         * The ladder descends from `capsuleH` rather than ascending to it, so nothing reaches
         * further above its floor line than it did and § 8 (7)'s overlap arithmetic is untouched.
         */
        const height = capsuleH * bandHeightShareOf(bandRank);
        ctx.fillStyle = ink;
        roundedRect(ctx, x, feetY - height, capsuleW, height, capsuleW / 2);
        ctx.fill();
      }
    }

    /*
     * **The relief mark — *a car just took some of them*.**
     *
     * `FloorQueue.recentlyBoarded` has been computed on every frame since `queueAt` shipped and
     * read by **nothing** on this stage; its only readers were Engineer-side. It is the one moment
     * in a run where the dispatcher visibly did its job, and without it a boarding is invisible:
     * the queue simply gets shorter between two frames, which looks exactly like nobody having
     * been there.
     *
     * Drawn as a tick per boarder, in the slots they just vacated — same lane, same pitch, same
     * right-to-left order — so the read is *these stood here a moment ago and are gone*. In
     * `moss`, the calm end of the ramp, because relief is the opposite of the thing the warm end
     * means.
     *
     * **It is a transition marker and deliberately not a figure.** It publishes no count: it is
     * capped at the lane like everything else here, and no `+N` is composed for it, because a
     * string composed inside a painter is read by no honesty property ([§ D347]). The number who
     * boarded is `describeQueue`'s to say in words, and it says it.
     */
    if (floor.recentlyBoarded > 0) {
      const ticks = Math.min(floor.recentlyBoarded, perRow);
      const arm = Math.max(1.5, capsuleH * 0.28);
      ctx.strokeStyle = C.moss;
      ctx.lineWidth = Math.max(1, capsuleH * 0.14);
      ctx.lineCap = 'round';
      for (let index = 0; index < ticks; index += 1) {
        const x = g.landing.x + g.landing.width - 6 - (index + 1) * (capsuleW + 2);
        const y = row.y - 2 - capsuleH * 0.5;
        ctx.beginPath();
        ctx.moveTo(x + capsuleW * 0.1, y);
        ctx.lineTo(x + capsuleW * 0.42, y + arm * 0.55);
        ctx.lineTo(x + capsuleW * 0.95, y - arm * 0.7);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
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

/**
 * **The AD-S8 wash's opacity, and it is measured rather than chosen** — `docs/28` § 5.4 asks for
 * *"an opacity low enough that the capsules still read against it"* and does not name one.
 *
 * The rule this number is the answer to: **the largest hundredth at which every band that clears
 * AD-A2's 3:1 non-text floor today still clears it under the worst wash it can be drawn on** —
 * worst meaning a capsule on a wash of its own band, which is the pair that converges fastest.
 * Measured on the shipped `§ 19` inks over `cardSunk`, and pinned in
 * `everyday/cutawayCrowd.test.ts` in **both** directions:
 *
 * | band | on bare `cardSunk` | under a 0.13 wash | under 0.14 |
 * |---|---|---|---|
 * | `moss` | 3.58 | **3.007** | 2.966 — below the floor |
 * | `terracotta` | 4.64 | 3.898 | 3.845 |
 * | `warmGrey` | 4.94 | 4.148 | 4.091 |
 * | `sun` | **1.78** | 1.496 | 1.475 |
 *
 * **`sun` is below the floor before any wash and this is not the thing that put it there.** That
 * is `docs/28` § 7.2's own figure — *"the 1.78:1 figure above was invisible until the ramp was
 * measured against `cardSunk`"* — and AD-A2's open defect, GitHub issue #204. Stating it beside
 * the number that *is* this file's responsibility is the point: the rule above is written over the
 * bands that clear today precisely so that a pre-existing failure cannot be used to license a
 * heavier wash, and so that nobody reads this table as a claim that the ramp passes.
 */
const LANDING_WASH_ALPHA = 0.13;

/**
 * Which rung of `live/bands.ts`' four-rung ladder a wait sits on — derived from `WAIT_BANDS`'
 * order rather than transcribed, so a fifth rung is ranked rather than dropped.
 *
 * `stageBandOf` returns the rung's **id**; the figure geometry wants its **position**, because
 * AD-S7's claim is ordinal and this package holds two ladders that share no boundary above the
 * first. See `render/riderFigures.ts#BOB_AMPLITUDE_BY_RANK`.
 */
function stageBandRankOf(waitedS: number): number {
  const id = stageBandOf(waitedS);
  const rank = WAIT_BANDS.findIndex((band) => band.id === id);
  return rank < 0 ? 0 : rank;
}

/**
 * AD-S7's height ladder for the capsule branch, in the one shape that keeps it agreeing with the
 * figure branch: the same ramp `render/riderFigures.ts` applies, evaluated here because a capsule
 * is not a figure and does not go through `drawRiderFigure`.
 *
 * Spelled as an interpolation from {@link CAPSULE_MIN_HEIGHT_SHARE} to 1 over the ladder's own
 * length, so the two branches cannot drift into different ladders when a rung is added.
 */
function bandHeightShareOf(rank: number): number {
  const rungs = Math.max(1, WAIT_BANDS.length - 1);
  const clamped = Math.min(rungs, Math.max(0, rank));
  return CAPSULE_MIN_HEIGHT_SHARE + (1 - CAPSULE_MIN_HEIGHT_SHARE) * (clamped / rungs);
}

/** The calmest rung's share — `render/riderFigures.ts#BAND_HEIGHT_SHARE.settling`, one ramp. */
const CAPSULE_MIN_HEIGHT_SHARE = 0.7;

/**
 * The cast `render/`'s painters take, and the one `dev/main.ts:7121` already makes at `drawScene`'s
 * call site for the same reason: `Canvas2DLike.fillStyle` is a `string` where the DOM's is
 * `string | CanvasGradient | CanvasPattern`. That narrowing is deliberate — `render/sky.ts` refuses
 * a `CanvasGradient` outright, because a gradient is one opaque object in a recorded transcript and
 * a determinism test cannot see the ramp inside it. A real context is a superset in every direction
 * this package uses, so the cast loses nothing a caller could rely on.
 */
function asCanvas2DLike(ctx: CanvasRenderingContext2D): Canvas2DLike {
  return ctx as unknown as Canvas2DLike;
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
