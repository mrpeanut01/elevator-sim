/**
 * **The crowd on the stage a stranger actually meets** — `docs/38` § 1's *"the fun is watching the
 * people"*, checked on the painter that draws them for a player rather than on the one that draws
 * them for an engineer.
 *
 * ## Why this file exists rather than more cases next door
 *
 * This repository has two painters and until now the good one was on the wrong surface.
 * `render/riderFigures.ts` — head-and-body silhouettes, a per-rider bob hashed off the passenger
 * id, an amplitude that grows with the wait — had exactly **one** non-test importer,
 * `render/canvas.ts`, the Engineer schematic. `render/stageCrowd.test.ts` records that the lane
 * those figures need was `undefined` on **seven of the eight** shipped buildings, so the nicest
 * drawing in the tree reached almost nothing and none of what it reached was the Everyday stage.
 * Meanwhile `everyday/cutaway.ts` drew 4.5 px capsules whose only varying property was hue.
 *
 * So the three claims below are claims about `drawCutaway`, and each is one a screenshot could not
 * settle and a green suite did not:
 *
 * | block | the failure it exists for |
 * |---|---|
 * | the band's second channel | a wait age carried by colour alone at 4.5 px — `UX.md` KB-15 |
 * | the wash | an AD-S8 ground that swallows the marks it sits under — AD-A2 |
 * | determinism | a bob read off a wall clock, so a scrubbed frame is not reproducible |
 *
 * Nothing here asserts a coordinate it could have read from the geometry, and nothing asserts a
 * colour it could have read from the palette.
 */

import { describe, expect, it } from 'vitest';

import type { VizFloor, VizLeg } from '../contract/types.js';
import type { FloorQueue } from '../frame/overlay.js';
import { frameAt } from '../frame/frameAt.js';
import { queueAt } from '../frame/overlay.js';
import { WAIT_BANDS } from '../live/bands.js';
import { syntheticFloor, syntheticRecording } from '../live/synthetic.test-helper.js';
import { MIN_FIGURE_HEIGHT_PX } from '../render/riderFigures.js';
import { drawCutaway } from './cutaway.js';
import { stageGeometryOf, stageInkFor } from './stageScreenModel.js';
import { EVERYDAY_COLORS as C } from './tokens.js';

/* -------------------------------------------------------------------------- *
 * A recording context that records
 * -------------------------------------------------------------------------- */

interface Call {
  readonly op: string;
  readonly args: readonly (number | string)[];
}

/**
 * Every call, with the brush that was set when it was made.
 *
 * `fillStyle`/`strokeStyle` are captured **into each call** rather than tracked separately,
 * because the question every assertion below asks is *what colour was this rectangle* and a
 * transcript that records the brush changes separately cannot answer it without re-simulating the
 * state machine.
 */
class Recorder {
  readonly calls: Call[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  lineCap = 'butt';
  font = '';
  textAlign = 'left';
  textBaseline = 'alphabetic';
  globalAlpha = 1;

  #push(op: string, ...args: (number | string)[]): void {
    this.calls.push({ op, args });
  }
  save(): void {
    this.#push('save');
  }
  restore(): void {
    this.#push('restore');
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    this.#push('clearRect', x, y, w, h);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.#push('fillRect', x, y, w, h, this.fillStyle);
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.#push('strokeRect', x, y, w, h, this.strokeStyle);
  }
  beginPath(): void {
    this.#push('beginPath');
  }
  closePath(): void {
    this.#push('closePath');
  }
  moveTo(x: number, y: number): void {
    this.#push('moveTo', x, y);
  }
  lineTo(x: number, y: number): void {
    this.#push('lineTo', x, y);
  }
  quadraticCurveTo(a: number, b: number, c: number, d: number): void {
    this.#push('quadraticCurveTo', a, b, c, d);
  }
  arcTo(a: number, b: number, c: number, d: number, r: number): void {
    this.#push('arcTo', a, b, c, d, r);
  }
  arc(x: number, y: number, r: number, from: number, to: number): void {
    this.#push('arc', x, y, r, from, to, this.fillStyle);
  }
  fill(): void {
    this.#push('fill', this.fillStyle);
  }
  stroke(): void {
    this.#push('stroke', this.strokeStyle, this.lineWidth);
  }
  fillText(text: string, x: number, y: number): void {
    this.#push('fillText', text, x, y, this.fillStyle);
  }
  setLineDash(): void {
    this.#push('setLineDash');
  }
  translate(x: number, y: number): void {
    this.#push('translate', x, y);
  }
  rotate(a: number): void {
    this.#push('rotate', a);
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.#push('rect', x, y, w, h);
  }
  clip(): void {
    this.#push('clip');
  }

  get transcript(): string {
    return this.calls.map((call) => `${call.op}(${call.args.join(',')})`).join('\n');
  }
}

/* -------------------------------------------------------------------------- *
 * A building with a queue on it
 * -------------------------------------------------------------------------- */

const FLOORS: readonly VizFloor[] = [
  syntheticFloor('L0', 0, 'Lobby'),
  syntheticFloor('L1', 1),
  syntheticFloor('L2', 2),
];

/**
 * One waiting leg. `arrivedAt` is what sets the wait at the playhead, so a case that wants a
 * particular band asks for it by arrival rather than by naming a band — the classification is the
 * product's and this file does not restate it.
 */
function waiting(id: string, arrivedAt: number, floorId = 'L0'): VizLeg {
  return {
    passengerId: id,
    originFloorId: floorId,
    destinationFloorId: 'L2',
    direction: 'up',
    arrivedAt,
  };
}

/** One leg that boarded at `boardedAt` — what `FloorQueue.recentlyBoarded` counts. */
function boarded(id: string, arrivedAt: number, boardedAt: number, floorId = 'L0'): VizLeg {
  return { ...waiting(id, arrivedAt, floorId), boardedAt, carId: 'main-A', bankId: 'main' };
}

interface Scene {
  readonly ctx: Recorder;
  readonly queues: readonly FloorQueue[];
  readonly geometry: ReturnType<typeof stageGeometryOf>;
}

/**
 * Paint one frame.
 *
 * `height` is the lever the scale cases pull: the geometry divides it by the floor count, so a
 * tall canvas over three floors is a generous pitch and a short one is the 165-floor regime in
 * miniature. Nothing here chooses a pitch directly, because `rowPitch` is the geometry's to derive.
 */
function paint(options: {
  readonly legs: readonly VizLeg[];
  readonly at: number;
  readonly height?: number;
  readonly floors?: readonly VizFloor[];
}): Scene {
  const floors = options.floors ?? FLOORS;
  const recording = syntheticRecording({ legs: options.legs, floors });
  const geometry = stageGeometryOf({
    width: 900,
    height: options.height ?? 600,
    floors,
    shafts: recording.shafts,
  });
  const ctx = new Recorder();
  const frame = frameAt(recording, options.at);
  const queues = queueAt(recording, options.at);
  drawCutaway(ctx as unknown as CanvasRenderingContext2D, {
    recording,
    frame,
    queues,
    geometry,
    floorLabelOf: (id) => id,
  });
  return { ctx, queues, geometry };
}

/** Every filled disc — a figure's head, and nothing else this painter draws. */
function heads(ctx: Recorder): readonly Call[] {
  return ctx.calls.filter((call) => call.op === 'arc');
}

/** Every rounded-rect fill of a given colour — a capsule, located by its brush. */
function capsuleHeights(ctx: Recorder, ink: string): readonly number[] {
  const out: number[] = [];
  for (let index = 0; index < ctx.calls.length; index += 1) {
    const call = ctx.calls[index];
    if (call?.op !== 'fill' || call.args[0] !== ink) continue;
    // A rounded rect opens with `moveTo(x + r, y)` and closes at `arcTo(…, y, …)`; its height is
    // the distance between the first `moveTo` of the path and the `lineTo` that turns the corner.
    let top: number | undefined;
    let bottom: number | undefined;
    for (let back = index - 1; back >= 0 && back > index - 12; back -= 1) {
      const step = ctx.calls[back];
      if (step === undefined) break;
      if (step.op === 'moveTo') {
        top = Number(step.args[1]);
        break;
      }
      if (step.op === 'arcTo') bottom = Math.max(bottom ?? 0, Number(step.args[3]));
    }
    if (top !== undefined && bottom !== undefined) out.push(bottom - top);
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * Contrast, for the wash
 * -------------------------------------------------------------------------- */

function channels(hex: string): readonly [number, number, number] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as unknown as [
    number,
    number,
    number,
  ];
}
function luminance(rgb: readonly [number, number, number]): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}
function contrast(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
function over(
  ground: readonly [number, number, number],
  ink: readonly [number, number, number],
  alpha: number,
): readonly [number, number, number] {
  return [0, 1, 2].map((i) => (ground[i] ?? 0) * (1 - alpha) + (ink[i] ?? 0) * alpha) as unknown as [
    number,
    number,
    number,
  ];
}

const BAND_INKS = WAIT_BANDS.map((band) => stageInkFor(band.fromS));

/* -------------------------------------------------------------------------- *
 * The claims
 * -------------------------------------------------------------------------- */

describe('the band is never carried by colour alone', () => {
  it('draws a longer-waiting rider taller than a fresh one, as a figure', () => {
    // Two people on the same landing, one just arrived and one past every boundary the absolute
    // ladder has. Same painter, same pitch, same cell: only the band differs.
    const { ctx } = paint({
      legs: [waiting('p-fresh', 300), waiting('p-stale', 0)],
      at: 300,
    });
    const drawn = heads(ctx);
    expect(drawn).toHaveLength(2);
    // The heads sit at the top of each figure, so a taller figure has a *smaller* y.
    const ys = drawn.map((call) => Number(call.args[1]));
    const radii = drawn.map((call) => Number(call.args[2]));
    expect(Math.min(...ys)).toBeLessThan(Math.max(...ys));
    // And the taller one is drawn with the bigger head, because the head is a fraction of the
    // figure — so the channel is two-dimensional rather than a nudge.
    expect(Math.max(...radii)).toBeGreaterThan(Math.min(...radii));
  });

  it('keeps the height channel below the pitch where a figure is still a figure', () => {
    // 165 floors in 600 px is the § D527 ceiling's regime: the pitch collapses, the silhouette
    // goes, and the capsule comes back. The band must survive that, or the degradation has
    // removed the very thing the degradation exists to protect.
    const many = Array.from({ length: 165 }, (_, index) =>
      syntheticFloor(`F${String(index)}`, index),
    );
    const { ctx, geometry } = paint({
      legs: [waiting('p-fresh', 300, 'F0'), waiting('p-stale', 0, 'F0')],
      at: 300,
      floors: many,
      height: 600,
    });
    const capsuleH = Math.max(5, Math.min(11, geometry.rowPitch * 0.62));
    expect(capsuleH).toBeLessThan(MIN_FIGURE_HEIGHT_PX);
    expect(heads(ctx)).toHaveLength(0);

    const fresh = capsuleHeights(ctx, stageInkFor(0));
    const stale = capsuleHeights(ctx, stageInkFor(10_000));
    expect(fresh).toHaveLength(1);
    expect(stale).toHaveLength(1);
    expect(stale[0] ?? 0).toBeGreaterThan(fresh[0] ?? 0);
  });

  it('switches to figures exactly where the room for one appears, and not before', () => {
    // The threshold is derived — `MIN_FIGURE_HEIGHT_PX` over `capsuleH`'s own 0.62 — so this is
    // asserted in both directions rather than at one convenient size. A one-sided check would pass
    // on a painter that had simply stopped drawing figures at all.
    const tall = paint({ legs: [waiting('p', 0)], at: 300, height: 600 });
    expect(tall.geometry.rowPitch * 0.62).toBeGreaterThanOrEqual(MIN_FIGURE_HEIGHT_PX);
    expect(heads(tall.ctx).length).toBeGreaterThan(0);

    const short = paint({
      legs: [waiting('p', 0, 'F0')],
      at: 300,
      floors: Array.from({ length: 80 }, (_, index) => syntheticFloor(`F${String(index)}`, index)),
      height: 600,
    });
    expect(short.geometry.rowPitch * 0.62).toBeLessThan(MIN_FIGURE_HEIGHT_PX);
    expect(heads(short.ctx)).toHaveLength(0);
  });
});

describe('the AD-S8 landing wash', () => {
  it('draws the deepest band present, on the landing band, only where somebody stands', () => {
    const { ctx, geometry } = paint({
      legs: [waiting('p-fresh', 300), waiting('p-stale', 0)],
      at: 300,
    });
    const washes = ctx.calls.filter(
      (call) => call.op === 'fillRect' && String(call.args[4]).startsWith('rgba('),
    );
    expect(washes).toHaveLength(1);
    const wash = washes[0];
    expect(Number(wash?.args[0])).toBe(geometry.landing.x);
    expect(Number(wash?.args[2])).toBe(geometry.landing.width);
    // The deepest band, not the newest: the oldest wait on the floor decides the colour.
    const deepest = stageInkFor(300);
    expect(String(wash?.args[4])).toContain(String(Number.parseInt(deepest.slice(1, 3), 16)));
  });

  it('draws no wash on a landing nobody is standing at', () => {
    const { ctx } = paint({ legs: [], at: 300 });
    expect(
      ctx.calls.filter((call) => call.op === 'fillRect' && String(call.args[4]).startsWith('rgba(')),
    ).toHaveLength(0);
  });

  it('is the heaviest wash that costs no band its AD-A2 floor, asserted in both directions', () => {
    /*
     * The rule the constant answers: *the largest hundredth at which every band that clears 3:1
     * against the bare ground today still clears it under the worst wash it can sit on.* Worst
     * means a capsule on a wash of its own band, which is the pair that converges fastest.
     *
     * `sun` is at **1.78:1** on the bare ground and is below the floor before any wash — that is
     * `docs/28` § 7.2's own figure and AD-A2's open defect (#204), and the rule is quantified over
     * the bands that clear *today* precisely so a pre-existing failure cannot license a heavier
     * wash. The `expect` below would go red if somebody "fixed" `sun` and left this alone, which
     * is the right direction for it to fail in.
     */
    const ground = channels(C.cardSunk);
    const clearsBare = BAND_INKS.filter((ink) => contrast(channels(ink), ground) >= 3);
    expect(clearsBare.length).toBeGreaterThan(0);
    expect(clearsBare.length).toBeLessThan(BAND_INKS.length);

    const worstUnder = (alpha: number): number =>
      Math.min(
        ...clearsBare.map((ink) =>
          Math.min(...BAND_INKS.map((w) => contrast(channels(ink), over(ground, channels(w), alpha)))),
        ),
      );
    expect(worstUnder(0.13)).toBeGreaterThanOrEqual(3);
    expect(worstUnder(0.14)).toBeLessThan(3);

    // And the painter uses that alpha rather than one of its own.
    const { ctx } = paint({ legs: [waiting('p', 0)], at: 300 });
    const wash = ctx.calls.find(
      (call) => call.op === 'fillRect' && String(call.args[4]).startsWith('rgba('),
    );
    expect(String(wash?.args[4])).toContain('0.130');
  });
});

describe('the picture is a function of the frame and the playhead', () => {
  it('draws the identical call sequence twice at the same instant', () => {
    // The whole determinism argument, and the one a bob can break silently: `replay/replay.test.ts`
    // claims equal frame sequences imply equal pictures, and a figure driven off `Date.now()` or off
    // an accumulator that survives a seek would make that false while looking perfectly good.
    const legs = [waiting('p-1', 0), waiting('p-2', 120), boarded('p-3', 10, 298)];
    expect(paint({ legs, at: 300 }).ctx.transcript).toBe(paint({ legs, at: 300 }).ctx.transcript);
  });

  it('draws a different picture one simulated second later, so the bob is live rather than frozen', () => {
    // The negative half. Two instants one second apart must differ, or "deterministic" has been
    // met by drawing nothing that moves — which is the cheapest way to pass the case above.
    const legs = [waiting('p-1', 0)];
    expect(paint({ legs, at: 300 }).ctx.transcript).not.toBe(paint({ legs, at: 301 }).ctx.transcript);
  });

  it('redraws the earlier instant identically after the later one, so a scrub back is exact', () => {
    const legs = [waiting('p-1', 0), waiting('p-2', 60)];
    const first = paint({ legs, at: 300 }).ctx.transcript;
    paint({ legs, at: 420 });
    expect(paint({ legs, at: 300 }).ctx.transcript).toBe(first);
  });
});
