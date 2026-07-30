/**
 * The two rounded shapes the stage draws, as paths on a {@link Canvas2DLike}.
 *
 * The car and the out-of-service badge are both rounded rectangles (design `:2069–2077` and
 * `:2098–2107`), and the artefact spells each one out inline with six `quadraticCurveTo` calls.
 * Spelling it twice is how the two would drift apart, so it is spelled here once.
 *
 * ## Why not `ctx.roundRect`
 *
 * It exists on a real context and it would be one call. It is also five years younger than the
 * rest of this interface, and — the deciding reason — a single `roundRect(x, y, w, h, r)` in a
 * recorded transcript says nothing about *where the corners went*, whereas the path below records
 * its own top edge, its own bottom edge and its own radius as separate calls with separate
 * numbers. `render/canvas.test.ts` locates the car by that top edge and asserts it against
 * `layout.yForHeight`, which is the one assertion in this package that keeps the S-curve from
 * being quietly re-quantised into a floor lookup.
 */

import type { Canvas2DLike } from './canvas.js';

export interface RoundedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Corner radius. Clamped to half the shorter side, so a squat box does not invert. */
  readonly radius: number;
}

/**
 * Trace a rounded rectangle. Leaves the path open; the caller fills or strokes it.
 *
 * Starts at the top-left corner's end-of-arc — the same place the artefact starts — so the first
 * recorded `moveTo` carries the box's top edge and its radius together.
 */
export function roundedRectPath(ctx: Canvas2DLike, box: RoundedRect): void {
  const { x, y, width, height } = box;
  const radius = Math.max(0, Math.min(box.radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Trace and fill, in the current `fillStyle`. The two callers never want one without the other. */
export function fillRoundedRect(ctx: Canvas2DLike, box: RoundedRect): void {
  roundedRectPath(ctx, box);
  ctx.fill();
}

/** A filled disc. The rider's head, and nothing else on this canvas. */
export function fillCircle(ctx: Canvas2DLike, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, radius), 0, Math.PI * 2);
  ctx.fill();
}
