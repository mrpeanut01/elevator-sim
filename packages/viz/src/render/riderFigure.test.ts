/**
 * **The shared silhouette** — `render/riderFigures.ts#drawRiderFigure`, the one figure both stages
 * draw.
 *
 * `stageRender.test.ts` owns what the Engineer lane does with it and
 * `everyday/cutawayCrowd.test.ts` owns what the Everyday cutaway does. This file owns the three
 * things that are true of the primitive itself and would otherwise be asserted twice, differently:
 *
 * | block | the failure it exists for |
 * |---|---|
 * | the rank ladder | a band's geometry keyed on a name, so two ladders had to agree and did not |
 * | totality | a rung index off the end drawing nothing, or `NaN`, on a building nobody tested |
 * | `withAlpha` | a translucent mark set on `globalAlpha`, invisible to every recording stub |
 */

import { describe, expect, it } from 'vitest';

import type { Canvas2DLike } from './canvas.js';
import {
  BAND_HEIGHT_SHARE,
  BOB_AMPLITUDE_PX,
  MIN_FIGURE_HEIGHT_PX,
  WAIT_BAND_RANK,
  drawRiderFigure,
  figureHeightPx,
  withAlpha,
} from './riderFigures.js';

interface Call {
  readonly op: string;
  readonly args: readonly number[];
}

function recorder(): { ctx: Canvas2DLike; calls: Call[] } {
  const calls: Call[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save() {},
    restore() {},
    clearRect() {},
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ op: 'fillRect', args: [x, y, w, h] });
    },
    strokeRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc(x: number, y: number, r: number) {
      calls.push({ op: 'arc', args: [x, y, r] });
    },
    fill() {},
    stroke() {},
    fillText() {},
  } as unknown as Canvas2DLike;
  return { ctx, calls };
}

function draw(overrides: { bandRank: number; simTimeS?: number; heightPx?: number }): Call[] {
  const { ctx, calls } = recorder();
  drawRiderFigure(ctx, {
    centreX: 50,
    feetY: 100,
    heightPx: overrides.heightPx ?? 12,
    bandRank: overrides.bandRank,
    passengerId: 'p-1',
    simTimeS: overrides.simTimeS ?? 0,
    fill: '#123456',
  });
  return calls;
}

/** The top of the figure at this instant — its head's centre y. */
function headY(calls: readonly Call[]): number {
  return calls.find((call) => call.op === 'arc')?.args[1] ?? Number.NaN;
}

describe('the band rides on a rung, not on a band name', () => {
  it('draws a taller figure for every step up the ladder', () => {
    const tops = [0, 1, 2, 3].map((rank) => headY(draw({ bandRank: rank })));
    for (let index = 1; index < tops.length; index += 1) {
      // A taller figure reaches further above the same feet line, so its head's y is smaller.
      expect(tops[index] ?? 0).toBeLessThan(tops[index - 1] ?? 0);
    }
  });

  it('saturates rather than throwing on a rung off either end', () => {
    // A ladder that grew a fifth rung, or a caller that handed in `-1` or `NaN`, must draw a
    // figure rather than `NaN` coordinates — which a canvas swallows silently and a screenshot
    // shows as nothing at all.
    for (const rank of [-4, 9, Number.NaN, Number.POSITIVE_INFINITY]) {
      const calls = draw({ bandRank: rank });
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) for (const arg of call.args) expect(Number.isFinite(arg)).toBe(true);
    }
    expect(headY(draw({ bandRank: 9 }))).toBe(headY(draw({ bandRank: 3 })));
    expect(headY(draw({ bandRank: -4 }))).toBe(headY(draw({ bandRank: 0 })));
  });

  it('keeps the two exported band tables and the rung ladder as one ramp', () => {
    // The tables are what `render/canvas.ts` and `figureClearancePx` read; the ladder is what the
    // figure reads. They were one set of numbers written twice until this ramp existed, and this
    // is the assertion that keeps them one.
    const order = ['settling', 'waiting', 'long', 'abandoned'] as const;
    order.forEach((band, rank) => {
      expect(WAIT_BAND_RANK[band]).toBe(rank);
    });
    const shares = order.map((band) => BAND_HEIGHT_SHARE[band]);
    const bobs = order.map((band) => BOB_AMPLITUDE_PX[band]);
    expect(shares).toStrictEqual([...shares].sort((a, b) => a - b));
    expect(bobs).toStrictEqual([...bobs].sort((a, b) => a - b));
    // The worst rung keeps the whole of the room its caller budgeted: the ladder descends from 1
    // rather than ascending to it, which is what keeps every overlap figure on both stages fixed.
    expect(shares[shares.length - 1]).toBe(1);
  });

  it('takes the calm end down and never the worst end up', () => {
    // Stated as a property rather than as four numbers, because the hazard is a future edit that
    // makes the fourth band taller "so it stands out" and silently moves § 8 (7)'s overlap
    // arithmetic on the Everyday stage and `figureClearancePx`'s clamp on the Engineer one.
    const feetY = 100;
    const heightPx = 12;
    const worst = headY(draw({ bandRank: 3, heightPx }));
    expect(feetY - worst).toBeLessThanOrEqual(heightPx + 1.4 + Math.max(...Object.values(BOB_AMPLITUDE_PX)));
  });
});

describe('the bob is a function of simulated time and of nothing else', () => {
  it('draws the same figure twice at one instant and a different one a second later', () => {
    expect(draw({ bandRank: 2, simTimeS: 40 })).toStrictEqual(draw({ bandRank: 2, simTimeS: 40 }));
    expect(draw({ bandRank: 2, simTimeS: 40 })).not.toStrictEqual(draw({ bandRank: 2, simTimeS: 41 }));
  });

  it('gives two riders different phases from their ids alone', () => {
    const { ctx: a, calls: callsA } = recorder();
    const { ctx: b, calls: callsB } = recorder();
    const common = { centreX: 50, feetY: 100, heightPx: 12, bandRank: 2, simTimeS: 7, fill: '#000' };
    drawRiderFigure(a, { ...common, passengerId: 'p1' });
    drawRiderFigure(b, { ...common, passengerId: 'p10' });
    // `p1` and `p10` differ in length only — the case an FNV-1a hash exists for, and the one a sum
    // of char codes puts in the same corner of the cycle.
    expect(headY(callsA)).not.toBe(headY(callsB));
  });
});

describe('the derived floor', () => {
  it('reads the figure floor out of figureHeightPx rather than restating it', () => {
    expect(MIN_FIGURE_HEIGHT_PX).toBe(figureHeightPx(0));
    // And it really is a floor: no pitch, however small, produces a shorter figure.
    for (const pitch of [0, 1, 4, 11.4, 200]) expect(figureHeightPx(pitch)).toBeGreaterThanOrEqual(MIN_FIGURE_HEIGHT_PX);
  });
});

describe('withAlpha', () => {
  it('composes the alpha into the value, so a recording stub can see it', () => {
    expect(withAlpha('#4F8A5B', 0.13)).toBe('rgba(79,138,91,0.130)');
  });

  it('returns an unparseable colour unchanged rather than drawing rgba(NaN,…)', () => {
    expect(withAlpha('rgba(1,2,3,0.5)', 0.2)).toBe('rgba(1,2,3,0.5)');
    expect(withAlpha('var(--band-0)', 0.2)).toBe('var(--band-0)');
  });

  it('clamps rather than emitting an alpha outside the range', () => {
    expect(withAlpha('#000000', 5)).toBe('rgba(0,0,0,1.000)');
    expect(withAlpha('#000000', -3)).toBe('rgba(0,0,0,0.000)');
  });
});
