/**
 * The sky, as arithmetic — the half of `render/sky.ts` that has no pixels in it.
 *
 * Three properties, and each of them is a way the sky could be wrong without looking wrong:
 *
 * 1. **The four bands are four different skies.** A ramp table with two entries accidentally
 *    equal would draw the same picture at breakfast and at dusk, and nothing else in this package
 *    would notice.
 * 2. **The hour comes from simulated time and wraps.** A run long enough to cross midnight must
 *    keep getting a sky rather than running off the end of the fourth band.
 * 3. **`night` is not `skyBandAt(…) === 'night'`.** They disagree between 07:00 and 07:30 on
 *    purpose, and collapsing them is the tidy-up that would silently light a building's windows
 *    for half an hour after dawn.
 *
 * The drawn half — that the strips actually change with the hour — is in `stageRender.test.ts`,
 * because that is a claim about a transcript rather than about a number.
 */

import { describe, expect, it } from 'vitest';

import {
  DAY_START_S,
  DEFAULT_SKY,
  SKY_BAND_COUNT,
  drawSky,
  hourOfDay,
  isNight,
  mixHex,
  skyBandAt,
  skyRampAt,
  type SkyBand,
} from './sky.js';
import type { Canvas2DLike } from './canvas.js';

const BANDS: readonly SkyBand[] = ['dawn', 'day', 'dusk', 'night'];

/** A context that keeps only what the sky draws: a fill and a rectangle. */
function stripRecorder(): Canvas2DLike & { readonly strips: { fill: string; y: number; h: number }[] } {
  const strips: { fill: string; y: number; h: number }[] = [];
  return {
    strips,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    globalAlpha: 1,
    save() {},
    restore() {},
    clearRect() {},
    fillRect(_x: number, y: number, _w: number, h: number) {
      strips.push({ fill: this.fillStyle, y, h });
    },
    strokeRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc() {},
    fill() {},
    stroke() {},
    fillText() {},
  };
}

describe('the four bands of the day are four different skies', () => {
  it('gives every band two stops, and no two bands the same pair', () => {
    const pairs = BANDS.map((band) => DEFAULT_SKY[band].join('→'));
    expect(new Set(pairs).size).toBe(BANDS.length);
    // …and each ramp actually ramps, rather than being a flat wash with two names for one colour.
    for (const band of BANDS) {
      const [top, bottom] = DEFAULT_SKY[band];
      expect(top, band).not.toBe(bottom);
    }
  });

  it('picks a different ramp at each of the four hours the design names', () => {
    /*
     * The boundaries are the artefact's (`:2000–2005`), read one minute either side of each so a
     * `<` quietly becoming a `<=` is caught. The hours are chosen for what they *are* — the last
     * minute of dawn, the last of the working day, the last of dusk — rather than for roundness.
     */
    expect(skyBandAt(6)).toBe('dawn');
    expect(skyBandAt(7.49)).toBe('dawn');
    expect(skyBandAt(7.5)).toBe('day');
    expect(skyBandAt(16.49)).toBe('day');
    expect(skyBandAt(16.5)).toBe('dusk');
    expect(skyBandAt(19.49)).toBe('dusk');
    expect(skyBandAt(19.5)).toBe('night');
    expect(skyBandAt(23.9)).toBe('night');
    expect(skyBandAt(0)).toBe('dawn');

    const ramps = [6, 12, 18, 22].map((hour) => skyRampAt(hour).join('→'));
    expect(new Set(ramps).size).toBe(4);
  });

  it('keeps *is it dark* a separate question from *which ramp*', () => {
    // 07:15 is under the dawn ramp with the lights already off, which is what a building does and
    // what the artefact draws. Collapsing the two predicates is the tidy-up this pins shut.
    expect(skyBandAt(7.25)).toBe('dawn');
    expect(isNight(7.25)).toBe(false);
    expect(isNight(6.5)).toBe(true);
    expect(isNight(19.6)).toBe(true);
    expect(isNight(12)).toBe(false);
  });
});

describe('the hour is the run’s own, and it wraps', () => {
  it('starts the day where `docs/12` § 4.1 puts it', () => {
    expect(DAY_START_S).toBe(6 * 3600);
    expect(hourOfDay(0)).toBe(6);
    expect(hourOfDay(1800)).toBe(6.5);
  });

  it('reads the offset it is given rather than the default', () => {
    expect(hourOfDay(0, 8 * 3600)).toBe(8);
    expect(hourOfDay(3600, 8 * 3600)).toBe(9);
  });

  it('wraps past midnight instead of running out of bands', () => {
    // A twenty-hour shift is representable and nothing refuses one. Without the wrap the sky
    // would simply stop changing, which is a caption that stops describing the picture.
    expect(hourOfDay(20 * 3600)).toBe(2);
    expect(skyBandAt(hourOfDay(20 * 3600))).toBe('dawn');
    expect(hourOfDay(-7 * 3600)).toBeCloseTo(23, 9);
  });
});

describe('the ramp is painted as strips a transcript can read', () => {
  it('covers the height in `SKY_BAND_COUNT` strips, top stop to bottom stop', () => {
    const ctx = stripRecorder();
    const hour = drawSky(ctx, { width: 200, height: 480, simTimeS: 0 });
    expect(hour).toBe(6);
    expect(ctx.strips).toHaveLength(SKY_BAND_COUNT);
    expect(ctx.strips[0]?.y).toBe(0);
    // The last strip's own top plus its height reaches the bottom edge — no gap, and the extra
    // pixel of overlap `drawSky` adds is the only thing past it.
    const last = ctx.strips[SKY_BAND_COUNT - 1];
    expect((last?.y ?? 0) + (last?.h ?? 0)).toBeGreaterThanOrEqual(480);

    // The strips walk from one stop to the other, monotonically and without repeating the ends.
    const [top, bottom] = DEFAULT_SKY.dawn;
    expect(ctx.strips[0]?.fill).not.toBe(ctx.strips[SKY_BAND_COUNT - 1]?.fill);
    expect(mixHex(top, bottom, 0)).toBe(top.toLowerCase());
    expect(mixHex(top, bottom, 1)).toBe(bottom.toLowerCase());
  });

  it('paints a different sky at each of the four hours — the whole point of the feature', () => {
    const firstStripAt = (simTimeS: number): string => {
      const ctx = stripRecorder();
      drawSky(ctx, { width: 200, height: 480, simTimeS });
      return ctx.strips[0]?.fill ?? '';
    };
    // 06:00 dawn, 12:00 day, 18:00 dusk, 21:00 night, from a day that starts at 06:00.
    const fills = [0, 6 * 3600, 12 * 3600, 15 * 3600].map(firstStripAt);
    expect(new Set(fills).size).toBe(4);
  });

  it('is total on a palette it cannot interpolate, rather than drawing `#NaNNaNNaN`', () => {
    // A themed palette may reasonably carry `rgba()` stops. The ramp then steps once at the
    // halfway mark instead of blending, which is a worse picture and not a broken one.
    expect(mixHex('rgba(0,0,0,1)', '#ffffff', 0.2)).toBe('rgba(0,0,0,1)');
    expect(mixHex('rgba(0,0,0,1)', '#ffffff', 0.8)).toBe('#ffffff');
  });
});
