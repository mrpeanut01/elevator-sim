/**
 * The queue plan: § 6.2's degradation, and the accessibility constraint that decides the review.
 *
 * Two of these tests are the unit's stated acceptance evidence and are written to be read as such:
 *
 * - **the encoding survives colour removal** — the bands are distinguishable by shape alone, which
 *   `UX.md` KB-15 requires and which § 3.1 restates for this feature because Mini Metro's players
 *   report losing to a station they never saw fill;
 * - **the degradation is measured at the depths that actually occur** — 175 waiting on Midtown
 *   Office and 379 on Vertical City (**M5**), not at a depth chosen to make the test pass.
 */

import { describe, expect, it } from 'vitest';

import type { FloorQueue, QueueGroup, QueuedRider, WaitBand } from '../frame/overlay.js';
import { waitBandOf } from '../frame/overlay.js';
import {
  BAND_GLYPH,
  BAND_WORDS,
  MAX_GLYPHS_WITH_COUNT,
  MAX_INDIVIDUAL_GLYPHS,
  RELIEF_GLYPH,
  describeQueue,
  planQueueRow,
  riderMoodOf,
} from './riderQueue.js';

/* -------------------------------------------------------------------------- *
 * Builders
 * -------------------------------------------------------------------------- */

const BANDS: readonly WaitBand[] = ['settling', 'waiting', 'long', 'abandoned'];

function rider(index: number, band: WaitBand, promisedCarId?: string): QueuedRider {
  return {
    passengerId: `p${String(index)}`,
    // Descending, so the array is oldest-first exactly as `queueAt` produces it.
    waitedS: 100 - index,
    direction: 'up',
    destinationFloorId: 'G',
    promisedCarId,
    band,
  };
}

/** A queue of `n` riders, cycling the four bands so every plan sees all of them. */
function queueOf(n: number, options: { promisedCars?: readonly string[]; boarded?: number } = {}): FloorQueue {
  const cars = options.promisedCars;
  const riders = Array.from({ length: n }, (_, index) =>
    rider(index, BANDS[index % BANDS.length] ?? 'settling', cars?.[index % cars.length]),
  );
  const groups: QueueGroup[] = [...new Set(riders.map((r) => r.promisedCarId ?? ''))]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const members = riders.filter((r) => (r.promisedCarId ?? '') === key);
      return {
        key,
        promisedCarId: key === '' ? undefined : key,
        riders: members,
        total: members.length,
        oldestWaitS: Math.max(...members.map((r) => r.waitedS), 0),
      };
    });
  return {
    floorId: '7',
    riders,
    groups,
    total: n,
    oldestWaitS: riders.reduce((best, r) => Math.max(best, r.waitedS), 0),
    worstBand: riders.reduce<WaitBand>(
      (worst, r) => (BANDS.indexOf(r.band) > BANDS.indexOf(worst) ? r.band : worst),
      'settling',
    ),
    recentlyBoarded: options.boarded ?? 0,
  };
}

const ROOMY = { capacityCells: 200, pitchFits: true, scaleTotal: 400 } as const;

/* -------------------------------------------------------------------------- *
 * Shape, not colour — the hard constraint
 * -------------------------------------------------------------------------- */

describe('the band encoding survives colour removal — KB-15', () => {
  it('gives each of the four bands a distinct shape', () => {
    // Injective, derived from the map rather than written out: a fifth band that reused a shape
    // would make this red without anybody remembering to add a row.
    const shapes = BANDS.map((band) => BAND_GLYPH[band]);
    expect(new Set(shapes).size).toBe(BANDS.length);
    expect(shapes.every((shape) => shape.length > 0)).toBe(true);
    // …and none of them collides with the two glyphs the renderer already owns for other claims:
    // `✗` is *a call no car answers* (D10) and `⊘` is *no shaft serves this floor* (RV-08).
    expect(shapes).not.toContain('✗');
    expect(shapes).not.toContain('⊘');
    expect(shapes).not.toContain(RELIEF_GLYPH);
  });

  it('distinguishes every band with the colours stripped out entirely', () => {
    /*
     * The acceptance test for *"bands must be distinguishable by SHAPE, not colour alone"*.
     *
     * The plan carries no colour at all — colour enters in `render/canvas.ts`, from
     * `Theme.queueBands`. So the strongest available statement is that the plan alone, with no
     * theme in the room, still separates the four. A reader in greyscale sees exactly this.
     */
    const plan = planQueueRow({ queue: queueOf(4), ...ROOMY });
    const drawn = plan.segments.flatMap((segment) => segment.glyphs);
    expect(drawn.map((glyph) => glyph.glyph)).toEqual(BANDS.map((band) => BAND_GLYPH[band]));
    expect(new Set(drawn.map((glyph) => glyph.glyph)).size).toBe(4);
    // The band is on the glyph too, so nothing downstream has to recover it from a colour.
    expect(drawn.map((glyph) => glyph.band)).toEqual(BANDS);
  });

  it('says the four bands in words as well, for the reader who sees no shapes either', () => {
    const said = BANDS.map((band) => BAND_WORDS[band]);
    expect(new Set(said).size).toBe(BANDS.length);
    for (const phrase of said) expect(phrase.length).toBeGreaterThan(3);
  });
});

describe('rider mood is a reading of the band and of nothing else', () => {
  it('is monotone up the ladder', () => {
    expect(riderMoodOf('settling')).toBe('calm');
    expect(riderMoodOf('waiting')).toBe('frustrated');
    expect(riderMoodOf('long')).toBe('distressed');
    expect(riderMoodOf('abandoned')).toBe('distressed');
  });

  it('follows the band when the run’s own thresholds move — R1, one level down', () => {
    // The band comes from `t - arrivedAt` against the run's thresholds, both observations. Move
    // the thresholds and the same wait changes mood, with no estimate anywhere in the chain.
    const strict = { settlingS: 5, longS: 10, horizonS: 20 };
    const lax = { settlingS: 100, longS: 200, horizonS: 900 };
    expect(riderMoodOf(waitBandOf(12, strict))).toBe('distressed');
    expect(riderMoodOf(waitBandOf(12, lax))).toBe('calm');
  });
});

/* -------------------------------------------------------------------------- *
 * § 6.2's three modes
 * -------------------------------------------------------------------------- */

describe('planQueueRow degrades the way § 6.2 says', () => {
  it('draws every rider individually up to the individual-glyph budget, with no count', () => {
    for (const n of [1, 5, MAX_INDIVIDUAL_GLYPHS]) {
      const plan = planQueueRow({ queue: queueOf(n), ...ROOMY });
      expect(plan.mode, `n=${String(n)}`).toBe('glyphs');
      expect(plan.segments.flatMap((s) => s.glyphs)).toHaveLength(n);
      expect(plan.overflow).toBe(0);
      expect(plan.text).toBe('');
      expect(plan.barFraction).toBe(0);
    }
  });

  it('adds the count the moment there are more riders than the eye can tally', () => {
    const plan = planQueueRow({ queue: queueOf(MAX_INDIVIDUAL_GLYPHS + 1), ...ROOMY });
    expect(plan.mode).toBe('glyphs-and-count');
    // Room for all of them here, so nothing is hidden — and the number is still stated, because a
    // reader counting thirteen dots is a reader the row has failed.
    expect(plan.overflow).toBe(0);
    expect(plan.text).toBe('13 waiting');
  });

  it('fills to the row width and puts the rest behind `+N`', () => {
    // The *width* decides, not the building: the same queue on a narrower window degrades sooner.
    const plan = planQueueRow({ queue: queueOf(30), capacityCells: 18, pitchFits: true, scaleTotal: 30 });
    expect(plan.mode).toBe('glyphs-and-count');
    expect(plan.segments.flatMap((s) => s.glyphs)).toHaveLength(18);
    expect(plan.overflow).toBe(12);
    expect(plan.text).toBe('+12');
  });

  it('becomes a bar beyond the glyph budget, at the depths actually measured (M5)', () => {
    for (const n of [MAX_GLYPHS_WITH_COUNT + 1, 175, 379]) {
      const plan = planQueueRow({ queue: queueOf(n), ...ROOMY });
      expect(plan.mode, `n=${String(n)}`).toBe('bar');
      expect(plan.segments).toEqual([]);
      expect(plan.overflow).toBe(n);
      // A bar is never the only carrier of its value — the count and the oldest wait are printed.
      expect(plan.text).toContain(`${String(n)} waiting`);
      expect(plan.text).toContain('longest');
    }
  });

  it('becomes a bar at any depth once the floor pitch is below the glyph height', () => {
    // Vertical City's 100 floors at 700 px. Two riders, no room to draw either.
    const plan = planQueueRow({ queue: queueOf(2), capacityCells: 200, pitchFits: false, scaleTotal: 379 });
    expect(plan.mode).toBe('bar');
    expect(plan.text).toContain('2 waiting');
  });

  it('becomes a bar when the row has no width at all, rather than drawing nothing', () => {
    const plan = planQueueRow({ queue: queueOf(3), capacityCells: 0, pitchFits: true, scaleTotal: 3 });
    expect(plan.mode).toBe('bar');
    expect(plan.overflow).toBe(3);
  });

  it('scales the bar by log(1 + n), which is what makes 379 and 175 both readable', () => {
    const fractionOf = (n: number): number =>
      planQueueRow({ queue: queueOf(n), capacityCells: 200, pitchFits: true, scaleTotal: 379 })
        .barFraction;
    // The formula, recomputed here rather than compared against a literal.
    expect(fractionOf(175)).toBeCloseTo(Math.log1p(175) / Math.log1p(379), 9);
    expect(fractionOf(379)).toBeCloseTo(1, 9);
    // The property the log is *for*: a queue eight times deeper is not eight times longer on
    // screen, and — the part a linear bar gets wrong — a small queue is still visible.
    expect(fractionOf(50)).toBeGreaterThan(0.5 * fractionOf(379));
    expect(fractionOf(50)).toBeLessThan(fractionOf(175));
    // Monotone, and never outside the track.
    for (const n of [41, 100, 175, 379, 5000]) {
      expect(fractionOf(n)).toBeGreaterThan(0);
      expect(fractionOf(n)).toBeLessThanOrEqual(1);
    }
  });

  it('reports an empty floor as empty rather than as a bar of nothing', () => {
    const plan = planQueueRow({ queue: queueOf(0), ...ROOMY });
    expect(plan.mode).toBe('glyphs');
    expect(plan.segments).toEqual([]);
    expect(plan.text).toBe('');
  });
});

describe('the relief transition', () => {
  it('marks a boarding that just happened, at every depth', () => {
    expect(planQueueRow({ queue: queueOf(3, { boarded: 2 }), ...ROOMY }).reliefText).toBe(
      `${RELIEF_GLYPH}2`,
    );
    // Including on a row that has degraded to a bar — the one moment the dispatcher visibly did
    // its job must not be the thing that gets dropped when the queue gets deep.
    expect(planQueueRow({ queue: queueOf(200, { boarded: 9 }), ...ROOMY }).reliefText).toBe(
      `${RELIEF_GLYPH}9`,
    );
  });

  it('shows nothing when nobody boarded, rather than a zero', () => {
    expect(planQueueRow({ queue: queueOf(3), ...ROOMY }).reliefText).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * § 6.2's grouping requirement, under a panel
 * -------------------------------------------------------------------------- */

describe('under destination dispatch the glyphs are grouped and the groups are labelled', () => {
  it('labels each promised car and keeps its riders under it', () => {
    const plan = planQueueRow({
      queue: queueOf(9, { promisedCars: ['main-A', 'main-B', 'main-C'] }),
      ...ROOMY,
    });
    expect(plan.segments.map((segment) => segment.label)).toEqual(['main-A', 'main-B', 'main-C']);
    for (const segment of plan.segments) expect(segment.glyphs).toHaveLength(3);
  });

  it('charges the label to the row’s width, so a labelled group is never drawn unlabelled', () => {
    /*
     * The Level-1-as-Level-0 defect in miniature. If a label could be dropped to fit one more
     * glyph, a panel building's landing would draw as a single undifferentiated queue — which is
     * exactly the picture version 4 of the contract exists to prevent.
     */
    const queue = queueOf(9, { promisedCars: ['main-A', 'main-B', 'main-C'] });
    const plan = planQueueRow({ queue, capacityCells: 12, pitchFits: true, scaleTotal: 9 });
    // Every group still names itself, even the one that got no glyphs at all.
    expect(plan.segments.map((segment) => segment.label)).toEqual(['main-A', 'main-B', 'main-C']);
    const drawn = plan.segments.flatMap((segment) => segment.glyphs).length;
    const hidden = plan.segments.reduce((sum, segment) => sum + segment.hidden, 0);
    expect(drawn + hidden).toBe(9);
    expect(plan.overflow).toBe(hidden);
  });

  it('gives a conventional row one unlabelled segment', () => {
    const plan = planQueueRow({ queue: queueOf(4), ...ROOMY });
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0]?.label).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * § 6.3 — the screen-reader form
 * -------------------------------------------------------------------------- */

describe('describeQueue — the clause that lands with the renderer', () => {
  it('says the count, the longest wait and the band, in words', () => {
    const said = describeQueue(queueOf(6));
    expect(said).toContain('Floor 7');
    expect(said).toContain('6 people waiting');
    expect(said).toContain('the longest for 100 seconds');
    expect(said).toContain(BAND_WORDS.abandoned);
  });

  it('reads the numbers rather than reciting a template', () => {
    // The mutation control: a clause built from constants would say the same thing about both.
    expect(describeQueue(queueOf(1))).toContain('1 person waiting');
    expect(describeQueue(queueOf(37))).toContain('37 people waiting');
    expect(describeQueue(queueOf(37))).not.toContain('1 person');
  });

  it('names the promise groups under a panel, and does not invent them otherwise', () => {
    expect(describeQueue(queueOf(6, { promisedCars: ['main-A', 'main-B'] }))).toContain(
      'across 2 promised cars',
    );
    expect(describeQueue(queueOf(6))).not.toContain('promised');
  });

  it('says a boarding out loud, and an empty floor honestly', () => {
    expect(describeQueue(queueOf(2, { boarded: 3 }))).toContain('3 just boarded');
    expect(describeQueue(queueOf(0))).toContain('nobody waiting');
    expect(describeQueue(queueOf(0, { boarded: 1 }))).toContain('1 just boarded');
  });
});
