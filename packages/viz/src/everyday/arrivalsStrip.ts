/**
 * **The approach and the day's shape, painted** — the two small pictures on the stage's
 * *Arriving next* card. `stageArrivals.ts` decides every count; this file decides rectangles.
 *
 * ## The approach
 *
 * The door is at the left and the next ten minutes run away from it to the right, so the crowd
 * slides toward the door as the clock runs and a column empties as its people walk in. Each column
 * is one thirty-second slot: people who walk in at an entrance are solid, and people who call from
 * another floor are stacked above them as an outline. Ink and shape both differ, so neither is a
 * colour-only signal (KB-15).
 *
 * A column's height is measured in people against `StageArrivalsAhead.scalePeople`, which reads no
 * further than the window does. The day's shape beside it is the schedule's intensity, not a count.
 *
 * ## No words are drawn here
 *
 * Every label on the card is a DOM node `stageScreen.ts` writes from `stageArrivals.ts`' strings, so
 * this file has no `fillText` and composes nothing a reader reads. The geometry is
 * {@link approachBarsOf} and {@link dayShapeOf}, which are pure and take no canvas.
 */

import {
  ARRIVALS_AHEAD_S,
  type StageArrivalsAhead,
  type StageArrivalsIndex,
} from './stageArrivals.js';
import { EVERYDAY_COLORS as C } from './tokens.js';

/**
 * The four canvas calls this file makes, written out so a test can hand in a recorder. The style
 * fields are `unknown` because the browser's own context types them wider than a string, and this
 * file only ever assigns one.
 */
export interface StripBrush {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
}

/** A box in CSS pixels. */
export interface StripBox {
  readonly width: number;
  readonly height: number;
}

/** One painted column of the approach. `doorsHeight` is solid, `floorsHeight` sits on top of it as an outline. */
export interface ApproachBar {
  readonly x: number;
  readonly width: number;
  readonly doorsHeight: number;
  readonly floorsHeight: number;
}

/** The door post's width, and the room kept clear under the lane for its baseline. */
const DOOR_W = 4;
const BASELINE_H = 2;
/** A column never fills the lane: the busiest slot of the day stops short of the top. */
const HEADROOM = 0.9;
/** The shortest a column with anybody in it is drawn, so one person is still a mark. */
const MIN_MARK_PX = 3;

/** Where each slot's column lands. Pure. */
export function approachBarsOf(ahead: StageArrivalsAhead, box: StripBox): readonly ApproachBar[] {
  const laneX = DOOR_W + 2;
  const laneW = box.width - laneX;
  const laneH = box.height - BASELINE_H;
  if (laneW <= 0 || laneH <= 0) return [];
  const perPerson = (laneH * HEADROOM) / ahead.scalePeople;
  const bars: ApproachBar[] = [];
  for (const slot of ahead.slots) {
    const total = slot.doors + slot.floors;
    if (total === 0) continue;
    const from = Math.max(0, slot.startsInS) / ARRIVALS_AHEAD_S;
    const to = Math.min(ARRIVALS_AHEAD_S, slot.endsInS) / ARRIVALS_AHEAD_S;
    const x = laneX + from * laneW;
    const width = Math.max(0, (to - from) * laneW - 2);
    if (width < 0.5) continue;
    const height = Math.min(laneH, Math.max(MIN_MARK_PX, total * perPerson));
    const doorsHeight = (height * slot.doors) / total;
    bars.push({ x, width, doorsHeight, floorsHeight: height - doorsHeight });
  }
  return bars;
}

/** Paint the approach into a context already sized and transformed by `cutaway.ts#sizeCanvas`. */
export function drawApproach(ctx: StripBrush, ahead: StageArrivalsAhead, box: StripBox): void {
  ctx.clearRect(0, 0, box.width, box.height);
  const floorY = box.height - BASELINE_H;

  /* The pavement and the door post. */
  ctx.fillStyle = C.ruleMid;
  ctx.fillRect(0, floorY, box.width, BASELINE_H);
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, DOOR_W, box.height);

  for (const bar of approachBarsOf(ahead, box)) {
    if (bar.doorsHeight > 0) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(bar.x, floorY - bar.doorsHeight, bar.width, bar.doorsHeight);
    }
    if (bar.floorsHeight > 0) {
      const top = floorY - bar.doorsHeight - bar.floorsHeight;
      ctx.fillStyle = C.paperDeeper;
      ctx.fillRect(bar.x, top, bar.width, bar.floorsHeight);
      ctx.strokeStyle = C.warmGrey;
      ctx.lineWidth = 1;
      ctx.strokeRect(bar.x + 0.5, top + 0.5, Math.max(0, bar.width - 1), Math.max(0, bar.floorsHeight - 1));
    }
  }
}

/** The schedule's geometry. Pure. */
export interface DayShape {
  readonly columns: readonly { readonly x: number; readonly width: number; readonly height: number }[];
  /** The playhead's x. */
  readonly nowX: number;
  /** Where the look-ahead window ends. */
  readonly aheadX: number;
}

export function dayShapeOf(ahead: StageArrivalsAhead, index: StageArrivalsIndex, box: StripBox): DayShape {
  const laneH = box.height - BASELINE_H;
  const count = index.day.length;
  const step = count > 0 ? box.width / count : 0;
  return {
    columns: index.day.map((column, i) => {
      return {
        x: i * step,
        width: Math.max(1, step - 1),
        height: column.intensity === 0 ? 0 : Math.max(1, column.intensity * laneH * HEADROOM),
      };
    }),
    nowX: ahead.dayFraction * box.width,
    aheadX: ahead.aheadFraction * box.width,
  };
}

/** Paint the schedule: what has gone is faint, what is still to come is dark, and the look-ahead is washed. */
export function drawDayShape(
  ctx: StripBrush,
  ahead: StageArrivalsAhead,
  index: StageArrivalsIndex,
  box: StripBox,
): void {
  ctx.clearRect(0, 0, box.width, box.height);
  const floorY = box.height - BASELINE_H;
  const shape = dayShapeOf(ahead, index, box);

  ctx.fillStyle = C.amberWash;
  ctx.fillRect(shape.nowX, 0, Math.max(2, shape.aheadX - shape.nowX), floorY);

  for (const column of shape.columns) {
    if (column.height === 0) continue;
    ctx.fillStyle = column.x + column.width <= shape.nowX ? C.fainter : C.warmGrey;
    ctx.fillRect(column.x, floorY - column.height, column.width, column.height);
  }

  ctx.fillStyle = C.ruleMid;
  ctx.fillRect(0, floorY, box.width, BASELINE_H);
  ctx.fillStyle = C.terracotta;
  ctx.fillRect(Math.min(box.width - 2, Math.max(0, shape.nowX - 1)), 0, 2, box.height);
}
