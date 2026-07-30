/**
 * The people, drawn as people — `docs/12-design-handoff.md` § 1.3 M3, design `:2114–2157`.
 *
 * ## What this adds, and what it is explicitly **not** allowed to replace
 *
 * The handoff draws one little figure per waiting leg on the floor they are standing on, tinted by
 * how long they have stood. That is a real improvement on a row of dots: a reader sees a crowd
 * rather than a count, and a crowd is what the subject actually is.
 *
 * It is also **colour and nothing else**. Four tints, no shape difference, no text. `UX.md` KB-15
 * forbids that as the sole carrier of a claim, and § 3.1 restates it for this exact feature
 * because Mini Metro's players report losing to a station they never saw fill. So the figures are
 * drawn **beside** the landing row that `render/riderQueue.ts` plans, not instead of it: the same
 * four wait ages are carried on the same row by `BAND_GLYPH`'s four distinct silhouettes, by the
 * `+N`, by the aggregated bar's caption and by `describeFrame`'s sentence. Take every colour off
 * this canvas — `render/landingMarks.test.ts` does exactly that — and the claim survives intact.
 *
 * Deleting the glyph row to make room for the figures would be the one change this file must not
 * make. It would be a colour-only encoding of a fail state, on the surface **Export PNG** writes
 * to a shareable file.
 *
 * ## Where they stand
 *
 * Inside the plot, in {@link Layout.riderLane} — the strip the layout keeps clear to the right of
 * the shaft bank, which is where the artefact puts them (`queueX = bankX + bankW + 30`). When the
 * building has too many shafts for the plot to spare a lane, there is no lane and no figures, and
 * the landing row carries the whole claim on its own. That degradation is the same one § 6.2 uses
 * everywhere else in this directory: **aggregate, never remove**.
 *
 * ## The bob is a function of simulated time
 *
 * `Math.sin(simTimeS · rate + phase)`, where `phase` is a hash of the passenger's own id. No
 * `Date.now()`, no `requestAnimationFrame` counter, no accumulator — `boundaries.test.ts` rule 2
 * would catch the first of those and nothing would catch the last two. Scrubbing to the same `t`
 * twice must draw the same picture, or `replay/replay.test.ts`'s claim that equal frame sequences
 * imply equal pictures is false. `stageRender.test.ts` asserts the identity directly, by drawing
 * the same frame twice and comparing the whole call transcript.
 */

import type { QueuedRider, WaitBand } from '../frame/overlay.js';
import type { Canvas2DLike, Theme } from './canvas.js';
import { fillCircle } from './shapes.js';

/**
 * The depth at which a landing raises the alarm — design `:2151`, `if (list.length > 24)`.
 *
 * Strictly greater than, as the artefact has it: twenty-four people at a lift lobby is a busy
 * morning and twenty-five is a queue that is not being served. The number is the design's; what
 * this repository adds is that crossing it is reported to the caller (see
 * {@link RiderLaneResult.alarm}) rather than only drawn, so the stage's alarm chip and the
 * canvas's own rule cannot disagree about which floor is in trouble.
 */
export const ALARM_STACK_DEPTH = 24;

/** Radians per simulated second the bob cycles at — design `:2137`, `s.tod * 1.6`. */
export const BOB_RATE_RAD_PER_S = 1.6;

/** Cycles per simulated second the alarm rule pulses at — design `:2154`, `s.tod * 3`. */
const ALARM_PULSE_RAD_PER_S = 3;

/**
 * How far a rider bobs, by band, in pixels.
 *
 * The artefact has two rungs — `b >= 2 ? 1.1 : 0.4` — and the handoff's own § 1.3 asks for an
 * amplitude that *"grows with the band"*. Four rungs rather than two, because the bands are the
 * one ladder on this canvas that a reader is meant to read as a ladder, and a two-valued
 * animation says *"fine / not fine"* where the colour and the glyph both say four things. The
 * endpoints are the artefact's.
 *
 * It is never the only signal, and could not be: it is invisible in a screenshot, which is what
 * **Export PNG** produces. It is a *fifth* carrier, after the colour, the glyph, the caption and
 * the sentence.
 */
export const BOB_AMPLITUDE_PX: Readonly<Record<WaitBand, number>> = Object.freeze({
  settling: 0.4,
  waiting: 0.7,
  long: 1.1,
  abandoned: 1.6,
});

/**
 * A per-rider phase offset in `[0, 2π)`, from the passenger id alone.
 *
 * Without it every figure on a landing bobs in lockstep and the crowd reads as one object with a
 * heartbeat. The artefact carries a random `jit` on each rider for this; a recording has no such
 * field and inventing one would mean a random draw inside the renderer, which
 * `CLAUDE.md` invariant 2 forbids outright and which would also make the picture depend on how
 * many times it had been drawn.
 *
 * An FNV-1a hash rather than a sum of char codes: `p1` and `p10` differ in length only, and a
 * sum puts every short id in the same corner of the cycle, which is the lockstep this exists to
 * break. Pure, total, and identical between two draws of the same frame.
 */
export function bobPhaseOf(passengerId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < passengerId.length; index += 1) {
    hash ^= passengerId.charCodeAt(index);
    // `Math.imul` keeps the multiply in 32 bits; `hash * prime` would lose the low bits to the
    // double's 53-bit mantissa after four or five characters and collapse the spread.
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) / 0x100000000) * Math.PI * 2;
}

/** How far above its resting place a rider's figure sits, at this instant. */
export function bobOffsetPx(rider: QueuedRider, simTimeS: number): number {
  return (
    Math.sin(simTimeS * BOB_RATE_RAD_PER_S + bobPhaseOf(rider.passengerId)) *
    BOB_AMPLITUDE_PX[rider.band]
  );
}

/**
 * The alarm rule's alpha at this instant — design `:2154`, `0.35 + 0.3 · sin(t · 3)`.
 *
 * A pulse and not a flash: the rule never goes away, so the alarm cannot be missed between two
 * peaks of the animation. Reduced-motion readers get the rule at its mean, which the caller
 * arranges by passing a fixed `simTimeS`; the *claim* is the rule's presence, not its rhythm, and
 * the chip above the stage and `describeFrame`'s sentence both carry it in words.
 */
export function alarmPulseAlpha(simTimeS: number): number {
  return 0.35 + 0.3 * Math.sin(simTimeS * ALARM_PULSE_RAD_PER_S);
}

/** Horizontal cell one figure occupies — design `:2124`, `figW = 11`. */
export const FIGURE_WIDTH_PX = 11;

/**
 * Pixels held back at the end of the lane for the `+N`.
 *
 * The artefact's own reservation (`:2125`). It is the same rule `drawQueueRow` keeps and for the
 * same measured reason: a count drawn off the end of its container is worse than a count that was
 * never promised, because the reader cannot tell which digits are missing.
 */
const OVERFLOW_RESERVE_PX = 70;

/** The fewest figures a lane will draw before it gives up and shows a bare `+N` — design `:2125`. */
const MIN_FIGURES = 4;

/**
 * How many of a landing's riders the lane can hold.
 *
 * Pure arithmetic, separated from the drawing for the reason everything in this directory is:
 * *what* to draw is testable under Node and *where* is pixels.
 */
export function figureCapacity(laneWidthPx: number): number {
  return Math.max(MIN_FIGURES, Math.floor((laneWidthPx - OVERFLOW_RESERVE_PX) / FIGURE_WIDTH_PX));
}

/**
 * How tall a figure is at a given floor pitch — the artefact's `min(16, max(8, pitch × 0.7))`.
 *
 * Eight pixels is the shortest thing that still reads as a person; sixteen is where one stops
 * looking like a person and starts looking like a column.
 */
export function figureHeightPx(pitchPx: number): number {
  return Math.min(16, Math.max(8, pitchPx * 0.7));
}

/**
 * How much room a figure needs **above** the line it stands on — its body, the top of its head,
 * and the highest the bob can lift it.
 *
 * Exported because the caller has to clamp with it and a test has to check the clamp, and a third
 * transcription of `0.19` and `1.6` is how the three would stop agreeing. The clamp exists
 * because a queue on the top floor is otherwise drawn straight through the shaft labels — the
 * header band's own defect, arriving from underneath, on a scene
 * `render/headerBand.test.ts` cannot construct because it supplies no queues.
 */
export function figureClearancePx(pitchPx: number): number {
  const height = figureHeightPx(pitchPx);
  const headRadius = Math.max(1.4, height * HEAD_RADIUS_FRACTION);
  const worstBob = Math.max(...Object.values(BOB_AMPLITUDE_PX));
  return height + headRadius + worstBob;
}

/** The head's radius as a fraction of the figure — design `:2141`, `fh * 0.19`. */
const HEAD_RADIUS_FRACTION = 0.19;

export interface RiderLaneInput {
  /** Everyone still standing at this landing. Drawn oldest first, so the worst band leads. */
  readonly riders: readonly QueuedRider[];
  /**
   * How many people are actually there — `FloorQueue.total`.
   *
   * Taken separately from `riders.length` rather than derived from it, so the alarm depth and the
   * `+N` are counted from the **queue's own** figure. They agree today; a queue that ever
   * summarised its riders would make them disagree, and the number a reader sees must be the one
   * the rest of the viewer quotes rather than the one this lane happened to be handed.
   */
  readonly total: number;
  /** Left edge of the lane. */
  readonly x: number;
  /** Pixel width available. */
  readonly widthPx: number;
  /** The floor line the figures stand on. */
  readonly feetY: number;
  /** Distance between two floor lines, which sets how tall a figure may be. */
  readonly pitchPx: number;
  readonly simTimeS: number;
}

export interface RiderLaneResult {
  /** Figures actually drawn. */
  readonly shown: number;
  /** Riders the lane had no room for, standing behind the `+N`. */
  readonly overflow: number;
  /** Whether this landing crossed {@link ALARM_STACK_DEPTH}. */
  readonly alarm: boolean;
}

/**
 * One landing's crowd.
 *
 * Returns what it drew, so the caller can report the alarm rather than the caller and this
 * function each deciding for themselves what counts as a stacked landing.
 */
export function drawRiderLane(
  ctx: Canvas2DLike,
  theme: Theme,
  input: RiderLaneInput,
): RiderLaneResult {
  const total = input.total;
  const alarm = total > ALARM_STACK_DEPTH;
  if (total === 0 || input.widthPx <= 0) return { shown: 0, overflow: 0, alarm };

  const capacity = figureCapacity(input.widthPx);
  const shown = Math.min(input.riders.length, capacity);
  const figureHeight = figureHeightPx(input.pitchPx);

  for (let index = 0; index < shown; index += 1) {
    const rider = input.riders[index];
    if (rider === undefined) continue;
    const x = input.x + index * FIGURE_WIDTH_PX;
    const bob = bobOffsetPx(rider, input.simTimeS);
    const top = input.feetY - figureHeight + bob;
    ctx.fillStyle = theme.queueBands[rider.band];
    // Not opaque: a crowd of overlapping figures at a deep landing reads as a mass rather than as
    // a picket fence, and the slab behind them stays visible through the thin ones.
    ctx.globalAlpha = 0.92;
    fillCircle(ctx, x + 3, top, Math.max(1.4, figureHeight * HEAD_RADIUS_FRACTION));
    ctx.fillRect(
      x + 2.1,
      top + figureHeight * 0.3,
      Math.max(1.6, figureHeight * 0.17),
      figureHeight * 0.68,
    );
    ctx.globalAlpha = 1;
  }

  const overflow = total - shown;
  if (overflow > 0) {
    // The count, in the alarm colour, immediately after the last figure — the artefact's `:2147`.
    // A crowd the lane truncated is the one case where the figures alone would understate the
    // landing, so the number is not optional and is not allowed to be the thing that gets clipped.
    ctx.font = FIGURE_COUNT_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.alarm;
    ctx.fillText(`+${String(overflow)}`, input.x + shown * FIGURE_WIDTH_PX + 5, input.feetY);
  }

  return { shown, overflow, alarm };
}

/** The `+N`'s face. Smaller than the body face, because it is a marginal note on a crowd. */
const FIGURE_COUNT_FONT = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';

export interface AlarmRuleInput {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly simTimeS: number;
}

/**
 * The rule under a landing that has stacked — design `:2152–2156`.
 *
 * Drawn **across the whole plot** rather than only under the crowd, because the claim is about
 * the floor and not about the strip of it the figures happened to fit in.
 *
 * The alpha is composed into an `rgba()` string rather than set on `globalAlpha`, so a recording
 * stub sees the pulse in the value it was handed. Setting `globalAlpha` would make the whole
 * animation invisible to `stageRender.test.ts`'s determinism check, which is the failure mode
 * `render/sky.ts` refuses a `CanvasGradient` for.
 */
export function drawAlarmRule(ctx: Canvas2DLike, theme: Theme, input: AlarmRuleInput): void {
  ctx.strokeStyle = rgbaOf(theme.alarm, alarmPulseAlpha(input.simTimeS));
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(input.x, input.y);
  ctx.lineTo(input.x + input.widthPx, input.y);
  ctx.stroke();
}

/**
 * `#rrggbb` plus an alpha, as `rgba(…)`.
 *
 * Total: a colour this cannot parse — a themed `rgba()` already, say — comes back unchanged, so a
 * custom palette loses the pulse rather than drawing `rgba(NaN,NaN,NaN,0.4)` and disappearing.
 */
function rgbaOf(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (match === null) return hex;
  const [, r = '00', g = '00', b = '00'] = match;
  const clamped = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  return `rgba(${String(Number.parseInt(r, 16))},${String(Number.parseInt(g, 16))},${String(
    Number.parseInt(b, 16),
  )},${clamped.toFixed(3)})`;
}
