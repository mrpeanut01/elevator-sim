/**
 * The design handoff's stage, on the canvas — `docs/12-design-handoff.md` § 1.3 M3.
 *
 * `canvas.test.ts` owns the claims the stage inherited: the car lands where its height says, the
 * door gap tracks `doorFraction`, no suppressed mean reaches the bitmap. This file owns what the
 * handoff **added**, and each block below is a way the addition could be wrong while looking
 * right in a screenshot:
 *
 * | Block | The failure it exists for |
 * |---|---|
 * | the sky | four bands that draw one picture, so the hour never shows |
 * | the load tint | a car that changes colour at the wrong load, or a red car with no `!` |
 * | the crowd | a wait age carried by colour alone — `UX.md` KB-15 |
 * | the bob | an animation read off a wall clock, so a scrubbed frame is not reproducible |
 * | the badge | a control whose hit box is a second copy of the layout |
 * | the alarm | a chip and a rule that disagree about which floor is in trouble |
 * | the foot band | the header band's own defect, arriving from underneath |
 *
 * Nothing here asserts a coordinate it could have read from the layout, and nothing asserts a
 * colour it could have read from the theme. Both rules are the reason `render/headerBand.test.ts`
 * caught a collision that four other test files were green through.
 */

import { describe, expect, it } from 'vitest';

import { constantSeries } from '../contract/series.js';
import { VIZ_SCHEMA_VERSION, type Frame, type VizRecording } from '../contract/types.js';
import { FIXTURE_DOOR_CONFIG, fixtureSummary } from '../fixtures.test-helper.js';
import type { FloorQueue, QueuedRider, WaitBand } from '../frame/overlay.js';
import {
  DEFAULT_THEME,
  SERVICE_OFF_GLYPH,
  SERVICE_ON_GLYPH,
  drawScene,
  type Canvas2DLike,
  type SceneHits,
  type Theme,
} from './canvas.js';
import { describeFrame } from './describeFrame.js';
import { buildLayout, type Layout } from './layout.js';
import { LOAD_ALARM, LOAD_FULL, LOAD_OCCUPIED, loadColour } from './overlay.js';
import {
  ALARM_STACK_DEPTH,
  FIGURE_WIDTH_PX,
  bobPhaseOf,
  figureCapacity,
  figureClearancePx,
} from './riderFigures.js';
import { BAND_GLYPH } from './riderQueue.js';
import { SKY_BAND_COUNT } from './sky.js';

/* -------------------------------------------------------------------------- *
 * A recording context that keeps everything
 * -------------------------------------------------------------------------- */

interface Call {
  readonly op: string;
  readonly args: readonly (number | string)[];
}

class Recorder implements Canvas2DLike {
  readonly calls: Call[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  font = '';
  textAlign: Canvas2DLike['textAlign'] = 'start';
  textBaseline: Canvas2DLike['textBaseline'] = 'alphabetic';
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
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.#push('quadraticCurveTo', cpx, cpy, x, y);
  }
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void {
    this.#push('arc', x, y, radius, startAngle, endAngle, this.fillStyle);
  }
  fill(): void {
    this.#push('fill', this.fillStyle);
  }
  stroke(): void {
    this.#push('stroke', this.strokeStyle);
  }
  fillText(text: string, x: number, y: number): void {
    this.#push('fillText', text, x, y, this.fillStyle);
  }

  get transcript(): string {
    return this.calls.map((call) => `${call.op}(${call.args.join(',')})`).join('\n');
  }

  texts(): readonly string[] {
    return this.calls.filter((call) => call.op === 'fillText').map((call) => String(call.args[0]));
  }
}

/* -------------------------------------------------------------------------- *
 * A building with room for a lobby, two cars and somebody standing in it
 * -------------------------------------------------------------------------- */

function shaft(carId: string, label: string): VizRecording['shafts'][number] {
  return {
    carId,
    bankId: 'main',
    label,
    startFloorId: 'G',
    startHeightM: 0,
    servedFloorIds: ['G', '2', '3'],
    capacityPersons: 13,
    doorConfig: FIXTURE_DOOR_CONFIG,
    motions: [],
    doorMarks: [],
    occupants: constantSeries(0),
    loadFactor: constantSeries(0),
  };
}

const RECORDING: VizRecording = {
  schemaVersion: VIZ_SCHEMA_VERSION,
  runId: 'synthetic',
  seed: '7',
  buildingId: 'synthetic',
  buildingName: 'Synthetic Tower',
  dispatcherProfileId: 'eta',
  passengerModel: 'conventional',
  status: 'completed',
  startedAt: 0,
  endedAt: 1800,
  floors: [
    { id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
    { id: '2', index: 1, heightM: 3, isEntrance: false, isTransferFloor: true, population: 40 },
    { id: '3', index: 2, heightM: 6, isEntrance: false, isTransferFloor: false, population: 40 },
  ],
  shafts: [shaft('main-A', 'A'), shaft('main-B', 'B')],
  legs: [],
  landings: [],
  progress: {
    waiting: constantSeries(0),
    boardedLegs: constantSeries(0),
    meanWaitS: constantSeries(0),
  },
  summary: fixtureSummary(),
  demandPhases: [],
  decisions: [],
  outOfServiceCarIds: [],
  warnings: [],
};

function frameCar(carId: string, overrides: Partial<Frame['cars'][number]> = {}): Frame['cars'][number] {
  return {
    carId,
    bankId: 'main',
    label: carId === 'main-A' ? 'A' : 'B',
    heightM: 1.5,
    floorId: 'G',
    direction: 1,
    doorFraction: 0,
    doorPhase: 'closed',
    occupants: 4,
    loadFactor: 0.3,
    ...overrides,
  };
}

function frame(overrides: Partial<Frame> = {}): Frame {
  return {
    schemaVersion: VIZ_SCHEMA_VERSION,
    runId: 'synthetic',
    simTimeS: 60,
    cars: [frameCar('main-A'), frameCar('main-B')],
    landings: [
      { floorId: 'G', waitingUp: 3, waitingDown: 0 },
      { floorId: '2', waitingUp: 0, waitingDown: 2 },
      { floorId: '3', waitingUp: 0, waitingDown: 0 },
    ],
    totalWaiting: 5,
    boardedLegs: 12,
    runningMeanWaitS: 18.25,
    ...overrides,
  };
}

const LAYOUT = buildLayout({
  width: 1440,
  height: 900,
  floors: RECORDING.floors,
  shafts: RECORDING.shafts,
});

interface DrawOptions {
  readonly recording?: VizRecording;
  readonly frame?: Frame;
  readonly layout?: Layout;
  readonly theme?: Theme;
  readonly queues?: readonly FloorQueue[];
  readonly dayStartS?: number;
}

function draw(options: DrawOptions = {}): { ctx: Recorder; hits: SceneHits; layout: Layout } {
  const ctx = new Recorder();
  const layout = options.layout ?? LAYOUT;
  const hits = drawScene(ctx, {
    recording: options.recording ?? RECORDING,
    frame: options.frame ?? frame(),
    layout,
    theme: options.theme ?? DEFAULT_THEME,
    ...(options.queues === undefined ? {} : { queues: options.queues }),
    ...(options.dayStartS === undefined ? {} : { dayStartS: options.dayStartS }),
  });
  return { ctx, hits, layout };
}

/** A landing with `total` people on it, cycling the four bands so every colour is exercised. */
const BANDS: readonly WaitBand[] = ['settling', 'waiting', 'long', 'abandoned'];
function queue(floorId: string, total: number, band?: WaitBand): FloorQueue {
  const riders: QueuedRider[] = Array.from({ length: total }, (_, index) => ({
    passengerId: `${floorId}-p${String(index)}`,
    waitedS: 200 - index,
    direction: 'up' as const,
    destinationFloorId: '3',
    promisedCarId: undefined,
    band: band ?? BANDS[index % BANDS.length] ?? 'settling',
  }));
  return {
    floorId,
    riders,
    groups: [{ key: '', promisedCarId: undefined, riders, total, oldestWaitS: 200 }],
    total,
    oldestWaitS: 200,
    worstBand: band ?? 'abandoned',
    recentlyBoarded: 0,
  };
}

/* -------------------------------------------------------------------------- *
 * The sky
 * -------------------------------------------------------------------------- */

describe('the stage is painted under a sky that says what time it is', () => {
  /** The ramp strips: full-width `fillRect`s at `x = 0` that are shorter than the canvas. */
  function strips(ctx: Recorder, layout: Layout): readonly string[] {
    return ctx.calls
      .filter(
        (call) =>
          call.op === 'fillRect' &&
          Number(call.args[0]) === 0 &&
          Number(call.args[2]) === layout.width &&
          Number(call.args[3]) < layout.height,
      )
      .map((call) => String(call.args[4]));
  }

  it('paints the ramp behind everything, in strips', () => {
    const { ctx, layout } = draw();
    expect(strips(ctx, layout)).toHaveLength(SKY_BAND_COUNT);
    // Behind everything: the first strip is drawn before the first shaft is.
    const firstStrip = ctx.calls.findIndex((call) => call.op === 'fillRect' && Number(call.args[2]) === layout.width);
    const firstShaft = ctx.calls.findIndex((call) => call.op === 'strokeRect');
    expect(firstStrip).toBeGreaterThanOrEqual(0);
    expect(firstStrip).toBeLessThan(firstShaft);
  });

  it('draws four different skies at the four hours the design names', () => {
    /*
     * The acceptance test for M3's first clause. The four are reached through `simTimeS`, not
     * through a parameter, so this also asserts the hour is a function of the **frame**: a sky
     * wired to a clock would give four identical answers here and four different ones a second
     * later, which is the failure `replay.test.ts` cannot see and this can.
     */
    const at = (simTimeS: number): readonly string[] =>
      strips(draw({ frame: frame({ simTimeS }) }).ctx, LAYOUT);
    // From a 06:00 start: 06:30 dawn, 12:00 day, 18:00 dusk, 21:00 night.
    const hours = [1800, 6 * 3600, 12 * 3600, 15 * 3600].map(at);
    const tops = hours.map((ramp) => ramp[0] ?? '');
    const bottoms = hours.map((ramp) => ramp[SKY_BAND_COUNT - 1] ?? '');
    expect(new Set(tops).size, `top stops: ${tops.join(' ')}`).toBe(4);
    expect(new Set(bottoms).size, `bottom stops: ${bottoms.join(' ')}`).toBe(4);
    // …and each of the four really is a ramp on the canvas, not a flat wash.
    for (const [index, ramp] of hours.entries()) {
      expect(ramp[0], `hour ${String(index)}`).not.toBe(ramp[SKY_BAND_COUNT - 1]);
    }
  });

  it('reads the day-start offset it is given', () => {
    // The offset is an option for one reason — `live/timeline.ts` will own it — so it has to be
    // *read*, or the parallel lane's value would land and change nothing.
    const early = strips(draw({ frame: frame({ simTimeS: 0 }), dayStartS: 6 * 3600 }).ctx, LAYOUT);
    const late = strips(draw({ frame: frame({ simTimeS: 0 }), dayStartS: 21 * 3600 }).ctx, LAYOUT);
    expect(early[0]).not.toBe(late[0]);
  });

  it('lights the windows warm after dark and cold in the day, and never both', () => {
    const windowFills = (simTimeS: number): ReadonlySet<string> =>
      new Set(
        draw({ frame: frame({ simTimeS }) })
          .ctx.calls.filter(
            (call) =>
              call.op === 'fillRect' &&
              (call.args[4] === DEFAULT_THEME.windowNight || call.args[4] === DEFAULT_THEME.windowDay),
          )
          .map((call) => String(call.args[4])),
      );
    // 06:00 is inside `isNight`; midday is not.
    expect([...windowFills(0)]).toEqual([DEFAULT_THEME.windowNight]);
    expect([...windowFills(6 * 3600)]).toEqual([DEFAULT_THEME.windowDay]);
  });

  it('lights the same windows every time it is asked — no RNG in the renderer', () => {
    // CLAUDE.md invariant 2. The artefact seeds its window pattern with `Math.random()`; this
    // renderer may not, and a pattern that changed between two draws of one frame would break
    // the property `replay/replay.test.ts` turns into "the pictures match".
    expect(draw().ctx.transcript).toBe(draw().ctx.transcript);
  });
});

/* -------------------------------------------------------------------------- *
 * The car's load tint
 * -------------------------------------------------------------------------- */

describe('a car is tinted by what it is carrying', () => {
  it('changes at the four boundaries, read from the shipped constants', () => {
    /*
     * Three of the artefact's four steps, and the fourth deliberately refused — see
     * `render/overlay.ts`'s `loadColour`, which records why red stays at the overload alarm
     * rather than moving down to the design's 0.95. Boundaries are read from `LOAD_OCCUPIED`,
     * `LOAD_FULL` and `LOAD_ALARM`, so a change to any of them moves this test with it.
     */
    expect(loadColour(0, DEFAULT_THEME)).toBe(DEFAULT_THEME.carLight);
    expect(loadColour(LOAD_OCCUPIED, DEFAULT_THEME)).toBe(DEFAULT_THEME.carLight);
    expect(loadColour(LOAD_OCCUPIED + 0.01, DEFAULT_THEME)).toBe(DEFAULT_THEME.car);
    expect(loadColour(LOAD_FULL - 0.01, DEFAULT_THEME)).toBe(DEFAULT_THEME.car);
    expect(loadColour(LOAD_FULL, DEFAULT_THEME)).toBe(DEFAULT_THEME.carHeavy);
    expect(loadColour(LOAD_ALARM - 0.01, DEFAULT_THEME)).toBe(DEFAULT_THEME.carHeavy);
    expect(loadColour(LOAD_ALARM, DEFAULT_THEME)).toBe(DEFAULT_THEME.carOverload);
    expect(new Set([
      DEFAULT_THEME.carLight,
      DEFAULT_THEME.car,
      DEFAULT_THEME.carHeavy,
      DEFAULT_THEME.carOverload,
    ]).size).toBe(4);
  });

  it('puts the tint on the drawn body, not only in the function', () => {
    // `loadColour` being right is a different claim from the car being painted with it — the
    // two-reader false negative § D154 records, in this file's own subject.
    const bodyFill = (loadFactor: number): string | undefined =>
      draw({ frame: frame({ cars: [frameCar('main-A', { loadFactor })] }) })
        .ctx.calls.filter((call) => call.op === 'fill')
        .map((call) => String(call.args[0]))
        .find((fill) =>
          [
            DEFAULT_THEME.carLight,
            DEFAULT_THEME.car,
            DEFAULT_THEME.carHeavy,
            DEFAULT_THEME.carOverload,
          ].includes(fill),
        );
    expect(bodyFill(0.1)).toBe(DEFAULT_THEME.carLight);
    expect(bodyFill(0.5)).toBe(DEFAULT_THEME.car);
    expect(bodyFill(0.9)).toBe(DEFAULT_THEME.carHeavy);
    expect(bodyFill(1.2)).toBe(DEFAULT_THEME.carOverload);
  });

  it('never draws an overloaded car without the `!` beside it — KB-15b', () => {
    // The reason the red band was not moved to the design's 0.95. A tint at the alarm and a glyph
    // at the alarm are one signal drawn twice; a tint at 0.95 and a glyph at 1.1 is a colour-only
    // claim about the most serious state a car can be in.
    const glyphsAt = (loadFactor: number): readonly string[] =>
      draw({ frame: frame({ cars: [frameCar('main-A', { loadFactor })] }) }).ctx.texts();
    expect(glyphsAt(LOAD_ALARM)).toContain('!');
    expect(glyphsAt(LOAD_ALARM - 0.01)).not.toContain('!');
  });

  it('keeps the door gap distinguishable from the page behind it', () => {
    // The comment `DEFAULT_THEME` has carried since wave 2: a test that identifies the door seam
    // by its fill must not also match the background wash. The repalette moved both values, so
    // the property is asserted rather than left to the two tokens happening to differ.
    expect(DEFAULT_THEME.doorSeam).not.toBe(DEFAULT_THEME.background);
  });
});

/* -------------------------------------------------------------------------- *
 * The crowd
 * -------------------------------------------------------------------------- */

describe('the people are drawn as people, and never as colour alone', () => {
  /** A rider's head: the only `arc` on this canvas. Its fill is the rider's band. */
  function headFills(ctx: Recorder): readonly string[] {
    return ctx.calls.filter((call) => call.op === 'arc').map((call) => String(call.args[5]));
  }

  it('gives the layout a lane, and stands one figure per rider in it', () => {
    const { ctx, layout } = draw({ queues: [queue('2', 4)] });
    expect(layout.riderLane, 'a two-shaft building at 1440 px has room for a lobby').toBeDefined();
    expect(headFills(ctx)).toHaveLength(4);
    // Inside the plot and inside the lane, which is what makes them part of the building rather
    // than another column of marks in the gutter.
    const lane = layout.riderLane;
    for (const call of ctx.calls.filter((entry) => entry.op === 'arc')) {
      expect(Number(call.args[0])).toBeGreaterThanOrEqual(lane?.x ?? 0);
      expect(Number(call.args[0])).toBeLessThanOrEqual((lane?.x ?? 0) + (lane?.width ?? 0));
    }
  });

  it('colours each figure by its own band, in the design’s four', () => {
    const fills = headFills(draw({ queues: [queue('2', 4)] }).ctx);
    expect(new Set(fills)).toEqual(new Set(BANDS.map((band) => DEFAULT_THEME.queueBands[band])));
    // …and one band at a time, so the mapping is per rider rather than per landing.
    for (const band of BANDS) {
      const only = headFills(draw({ queues: [queue('2', 3, band)] }).ctx);
      expect(new Set(only)).toEqual(new Set([DEFAULT_THEME.queueBands[band]]));
    }
  });

  it('KB-15: the wait age is still carried by shape when the colour is gone', () => {
    /*
     * **The acceptance test for the one thing this feature was not allowed to do.**
     *
     * The handoff's figures encode the wait age in colour and in nothing else. `UX.md` KB-15
     * forbids that as a sole carrier, so the figures are *additional* to the landing row's glyph
     * ladder rather than a replacement for it — see `render/riderFigures.ts`. A future lane that
     * deletes the glyph row to make room for the crowd turns this red.
     *
     * Asserted with every colour in the theme collapsed to one string, so nothing can be rescued
     * by a tint.
     */
    const flat: Theme = {
      ...DEFAULT_THEME,
      queueBands: { settling: '#fff', waiting: '#fff', long: '#fff', abandoned: '#fff' },
    };
    const { ctx } = draw({ queues: [queue('2', 4)], theme: flat });
    const drawn = ctx.texts();
    for (const band of BANDS) expect(drawn, `band ${band}`).toContain(BAND_GLYPH[band]);
    // The figures are there too — this is a both-and, not an either-or.
    expect(headFills(ctx)).toHaveLength(4);
  });

  it('counts the ones the lane could not hold, in the alarm colour', () => {
    const { ctx, layout } = draw({ queues: [queue('2', 60)] });
    const capacity = figureCapacity(layout.riderLane?.width ?? 0);
    expect(headFills(ctx)).toHaveLength(capacity);
    const overflow = ctx.calls.find(
      (call) => call.op === 'fillText' && String(call.args[0]).startsWith('+') && call.args[3] === DEFAULT_THEME.alarm,
    );
    expect(overflow, 'a truncated crowd states how many it hid').toBeDefined();
    expect(String(overflow?.args[0])).toBe(`+${String(60 - capacity)}`);
  });

  it('keeps the top floor’s crowd inside the plot, out of the header band', () => {
    /*
     * A figure stands with its feet on the floor line and its head a figure-height above it, so
     * the top row's crowd would be drawn *above* `plot.y` — straight through the shaft and bank
     * labels. That is the header band's own defect arriving from underneath, and
     * `render/headerBand.test.ts` cannot see it because its scene supplies no queues.
     */
    const { ctx, layout } = draw({ queues: [queue('3', 3)] });
    const heads = ctx.calls.filter((call) => call.op === 'arc');
    expect(heads.length).toBeGreaterThan(0);
    for (const head of heads) {
      // The head's top edge, which is the highest ink a figure puts on the canvas.
      expect(Number(head.args[1]) - Number(head.args[2])).toBeGreaterThanOrEqual(layout.plot.y);
    }
    // …and the clamp is the *shared* measurement rather than a local sum: the renderer and this
    // guard both ask `figureClearancePx`, so a taller head or a wilder bob moves both at once.
    const topRow = layout.rows.find((row) => row.floorId === '3');
    expect(layout.plot.y + figureClearancePx(layout.pitchPx)).toBeGreaterThan(topRow?.y ?? 0);
  });

  it('draws nobody when the shafts leave no lane, and says everything anyway', () => {
    // Mixed-Use High-Rise on a narrow window. The lane goes, the glyph row stays, and the claim
    // is unchanged — `docs/10` § 6.2's *aggregate, never remove*, one level up.
    const crowded = buildLayout({
      width: 640,
      height: 640,
      floors: RECORDING.floors,
      shafts: Array.from({ length: 12 }, (_, index) => shaft(`main-${String(index)}`, String(index))),
    });
    expect(crowded.riderLane).toBeUndefined();
    const { ctx } = draw({ layout: crowded, queues: [queue('2', 4)] });
    expect(ctx.calls.filter((call) => call.op === 'arc')).toHaveLength(0);
    expect(ctx.texts().some((text) => BANDS.some((band) => text === BAND_GLYPH[band]))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * The bob
 * -------------------------------------------------------------------------- */

describe('the bob is a function of simulated time and of nothing else', () => {
  it('draws an identical call sequence twice at the same `t`', () => {
    /*
     * **The property `replay/replay.test.ts` rests on.** Its whole argument is that equal frame
     * sequences imply equal pictures, which is only true while the renderer is a pure function of
     * its inputs. An animation driven by `Date.now()`, by `requestAnimationFrame`'s counter or by
     * an accumulator inside the module would break that, and only the first of the three is
     * something `boundaries.test.ts` can see.
     */
    const once = draw({ queues: [queue('2', 6)] }).ctx.transcript;
    const twice = draw({ queues: [queue('2', 6)] }).ctx.transcript;
    expect(twice).toBe(once);
  });

  it('actually moves between two instants, or it is not an animation', () => {
    // The negative control. Without it the test above is satisfied by a figure that never bobs.
    const a = draw({ frame: frame({ simTimeS: 60 }), queues: [queue('2', 6)] }).ctx;
    const b = draw({ frame: frame({ simTimeS: 60.4 }), queues: [queue('2', 6)] }).ctx;
    const headsOf = (ctx: Recorder): readonly number[] =>
      ctx.calls.filter((call) => call.op === 'arc').map((call) => Number(call.args[1]));
    expect(headsOf(a)).toHaveLength(6);
    expect(headsOf(b)).toEqual(headsOf(b));
    expect(headsOf(a)).not.toEqual(headsOf(b));
  });

  it('gives each rider its own phase, so a crowd is not one object with a heartbeat', () => {
    const phases = ['p1', 'p2', 'p10', 'p11', 'a', 'b'].map(bobPhaseOf);
    expect(new Set(phases).size).toBe(phases.length);
    for (const phase of phases) {
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(Math.PI * 2);
    }
    // Stable across calls — it is a hash, not a counter.
    expect(bobPhaseOf('p1')).toBe(phases[0]);
  });

  it('puts the crowd on the canvas at one figure-width per person', () => {
    const { ctx, layout } = draw({ queues: [queue('2', 5)] });
    const xs = ctx.calls.filter((call) => call.op === 'arc').map((call) => Number(call.args[0]));
    for (let index = 1; index < xs.length; index += 1) {
      expect((xs[index] ?? 0) - (xs[index - 1] ?? 0)).toBeCloseTo(FIGURE_WIDTH_PX, 9);
    }
    expect(xs[0]).toBeCloseTo((layout.riderLane?.x ?? 0) + 3, 9);
  });
});

/* -------------------------------------------------------------------------- *
 * The out-of-service badge — `docs/12` § 1.5 B7
 * -------------------------------------------------------------------------- */

describe('every shaft carries a service badge, and the badge is a target', () => {
  const held: VizRecording = { ...RECORDING, outOfServiceCarIds: ['main-B'] };

  it('draws one badge per column and says which state in words', () => {
    const { ctx, hits } = draw({ recording: held });
    expect(hits.carBadges.map((badge) => badge.carId)).toEqual(['main-A', 'main-B']);
    expect(hits.carBadges.map((badge) => badge.outOfService)).toEqual([false, true]);
    const badgeTexts = ctx
      .texts()
      .filter((text) => text === SERVICE_ON_GLYPH || text === SERVICE_OFF_GLYPH);
    expect(badgeTexts).toEqual([SERVICE_ON_GLYPH, SERVICE_OFF_GLYPH]);
    // KB-15: the two states are two different marks, not one mark in two colours.
    expect(SERVICE_ON_GLYPH).not.toBe(SERVICE_OFF_GLYPH);
  });

  it('reports a hit rectangle that contains the pill it drew', () => {
    /*
     * The seam `src/dev/` hit-tests against. It is reported rather than recomputed there for the
     * reason the whole of `render/` exists: a hit box derived from the same arithmetic in the DOM
     * entry point is a second copy of the layout, and the two drift the first time a badge moves.
     */
    const { hits, layout } = draw({ recording: held });
    for (const [index, badge] of hits.carBadges.entries()) {
      const column = layout.columns[index];
      expect(column?.carId).toBe(badge.carId);
      // Centred on its column, inside the foot band's own row, and larger than the drawn pill.
      expect(badge.rect.x + badge.rect.width / 2).toBeCloseTo(column?.centreX ?? 0, 9);
      expect(badge.rect.y).toBeLessThan(layout.foot.badgeY);
      expect(badge.rect.y + badge.rect.height).toBeGreaterThan(
        layout.foot.badgeY + layout.foot.badgeHeightPx,
      );
      expect(badge.rect.width).toBeGreaterThan(0);
    }
    // Two badges, two rectangles, and they do not overlap — a pointer can pick a car.
    const [a, b] = hits.carBadges;
    expect(a?.rect.x ?? 0).toBeLessThan(b?.rect.x ?? 0);
    expect((a?.rect.x ?? 0) + (a?.rect.width ?? 0)).toBeLessThan(b?.rect.x ?? 0);
  });

  it('says it in the text alternative too, so a screen reader is not the one reader who misses it', () => {
    /*
     * `KB-13`. The stage says this three ways to a sighted reader — a dimmed shaft, a red pill and
     * the word `OOS` — and said it zero ways to anybody on the `aria-label` until this. It is not
     * cosmetic: every count in that sentence is a count a smaller group of cars produced.
     */
    const spoken = describeFrame({ recording: held, frame: frame() });
    expect(spoken).toContain('1 car held out of service: main-B');
    expect(describeFrame({ recording: RECORDING, frame: frame() })).not.toContain('out of service');
  });

  it('reads the recording’s own list rather than inferring from a car that has not moved', () => {
    // A viewer that inferred *out of service* from *never moved* would mark an idle car on a
    // quiet morning. `VizRecording.outOfServiceCarIds` is the fact; the picture reads it.
    expect(draw().hits.carBadges.every((badge) => !badge.outOfService)).toBe(true);
    expect(draw({ recording: held }).hits.carBadges.filter((badge) => badge.outOfService)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- *
 * The alarm
 * -------------------------------------------------------------------------- */

describe('a landing that stacks up raises one alarm the whole stage agrees on', () => {
  it('fires strictly above the design’s depth, and not at it', () => {
    expect(draw({ queues: [queue('2', ALARM_STACK_DEPTH)] }).hits.alarm).toBeUndefined();
    const raised = draw({ queues: [queue('2', ALARM_STACK_DEPTH + 1)] }).hits;
    expect(raised.alarm?.floorId).toBe('2');
    expect(raised.alarm?.waiting).toBe(ALARM_STACK_DEPTH + 1);
  });

  it('draws a pulsing rule across the plot on every landing that crossed', () => {
    const { ctx, layout } = draw({
      queues: [queue('2', ALARM_STACK_DEPTH + 1), queue('3', ALARM_STACK_DEPTH + 5)],
    });
    const rules = ctx.calls.filter(
      (call) => call.op === 'stroke' && String(call.args[0]).startsWith('rgba(224,71,58'),
    );
    expect(rules).toHaveLength(2);
    // Across the *plot*, because the claim is about the floor and not about the strip of it the
    // crowd fits in.
    const spans = ctx.calls.filter((call) => call.op === 'lineTo' && Number(call.args[0]) === layout.plot.x + layout.plot.width);
    expect(spans.length).toBeGreaterThanOrEqual(2);
  });

  it('pulses on simulated time, so the same `t` draws the same alpha', () => {
    const alphaAt = (simTimeS: number): string =>
      draw({ frame: frame({ simTimeS }), queues: [queue('2', ALARM_STACK_DEPTH + 1)] })
        .ctx.calls.filter((call) => call.op === 'stroke' && String(call.args[0]).startsWith('rgba(224,71,58'))
        .map((call) => String(call.args[0]))
        .join('');
    expect(alphaAt(60)).toBe(alphaAt(60));
    expect(alphaAt(60)).not.toBe(alphaAt(60.3));
  });

  it('names the deepest landing, so the chip and the rules cannot disagree', () => {
    // The chip above the stage is one chip and more than one floor can be in trouble. It names
    // the worst; the rules mark them all. Both come from this one draw, which is the point.
    const { hits } = draw({
      queues: [queue('2', ALARM_STACK_DEPTH + 1), queue('3', ALARM_STACK_DEPTH + 30)],
    });
    expect(hits.alarm?.floorId).toBe('3');
    expect(hits.alarm?.waiting).toBe(ALARM_STACK_DEPTH + 30);
  });
});

/* -------------------------------------------------------------------------- *
 * The foot band — `render/headerBand.test.ts`'s rule, at the other end
 * -------------------------------------------------------------------------- */

describe('nothing below the plot draws on top of anything else below the plot', () => {
  /*
   * The foot band had two tenants and enough room, so it never went wrong. The badge row is a
   * third, 15 px tall, and hung off the plot's bottom edge by hand it lands on the run-status
   * caption at every viewport size — `[h − 35, h − 20]` against `[h − 24, h − 12]`, computed from
   * the two functions' own arithmetic before either was written. `Layout.foot` owns the three
   * rows for the same reason `Layout.header` owns its six.
   */
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [900, 640],
    [640, 520],
    [420, 400],
  ] as const) {
    it(`keeps the badge row, the caption and the playhead apart at ${String(width)}×${String(height)}`, () => {
      const layout = buildLayout({ width, height, floors: RECORDING.floors, shafts: RECORDING.shafts });
      const { foot, plot } = layout;
      const badge = { top: foot.badgeY, bottom: foot.badgeY + foot.badgeHeightPx };
      // The caption is 12 px on a `middle` baseline — the same box `headerBand.test.ts` builds.
      const caption = { top: foot.statusY - 6, bottom: foot.statusY + 6 };
      const bar = { top: foot.progressY, bottom: foot.progressY + foot.progressHeightPx };

      expect(badge.top, 'the badge row hangs below the plot').toBeGreaterThan(plot.y + plot.height);
      expect(badge.bottom, 'the badge row clears the caption').toBeLessThanOrEqual(caption.top);
      expect(caption.bottom, 'the caption clears the playhead').toBeLessThanOrEqual(bar.top);
      expect(bar.bottom, 'the playhead is inside the canvas').toBeLessThanOrEqual(height);
    });
  }

  it('draws the badge inside its own row and the caption inside its own', () => {
    const { ctx, layout } = draw({ recording: { ...RECORDING, outOfServiceCarIds: ['main-A'] } });
    const belowPlot = ctx.calls.filter(
      (call) => call.op === 'fillText' && Number(call.args[2]) > layout.plot.y + layout.plot.height,
    );
    const rows = new Set([layout.foot.badgeY + layout.foot.badgeHeightPx / 2 + 0.5, layout.foot.statusY]);
    const strays = belowPlot
      .filter((call) => !rows.has(Number(call.args[2])))
      .map((call) => `"${String(call.args[0])}" at y=${String(call.args[2])}`);
    expect(strays, 'a fourth tenant appeared in the foot band without a row of its own').toEqual([]);
    // …and both declared rows are used, or the set above is satisfiable by drawing nothing.
    const used = new Set(belowPlot.map((call) => Number(call.args[2])));
    expect([...rows].filter((row) => !used.has(row))).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * The building itself
 * -------------------------------------------------------------------------- */

describe('the plot reads as a building', () => {
  it('draws the mass behind the slabs and a slab on every floor', () => {
    const { ctx, layout } = draw();
    const mass = ctx.calls.filter((call) => call.op === 'fillRect' && call.args[4] === DEFAULT_THEME.mass);
    expect(mass).toHaveLength(1);
    expect(Number(mass[0]?.args[1])).toBeLessThan(layout.plot.y);
    const slabs = ctx.calls.filter((call) => call.op === 'fillRect' && call.args[4] === DEFAULT_THEME.floorSlab);
    // Every floor gets one, on every building, at every pitch — only the *label* thins.
    expect(slabs).toHaveLength(layout.rows.length);
    for (const slab of slabs) {
      expect(Number(slab.args[3]), 'a slab is 2–6 px deep').toBeGreaterThanOrEqual(2);
      expect(Number(slab.args[3])).toBeLessThanOrEqual(6);
    }
  });

  it('gives the entrance, the sky lobby and a plain floor three different labels', () => {
    const { ctx } = draw();
    const labels = ctx.calls.filter(
      (call) => call.op === 'fillText' && String(call.args[0]).endsWith('G'),
    );
    expect(labels.some((call) => String(call.args[0]).startsWith('⌂'))).toBe(true);
    expect(ctx.texts().some((text) => text.startsWith('⇄'))).toBe(true);
    // Three claims, three glyph/colour pairs, and the two badges are not the plain grey.
    expect(new Set([DEFAULT_THEME.badge, DEFAULT_THEME.badgeTransfer, DEFAULT_THEME.floorLabel]).size).toBe(3);
  });

  it('runs a cable from the shaft head to each car, and a ground line at the entrance', () => {
    const { ctx, layout } = draw();
    const cables = ctx.calls.filter((call) => call.op === 'stroke' && call.args[0] === DEFAULT_THEME.cable);
    expect(cables).toHaveLength(layout.columns.length);
    const ground = ctx.calls.filter((call) => call.op === 'stroke' && call.args[0] === DEFAULT_THEME.ground);
    expect(ground).toHaveLength(1);
  });

  it('puts the shaft bank on the left when there is a lobby, and centres it when there is not', () => {
    // One decision, not two: the lane is what is left after the bank is pushed left, so a layout
    // with no lane must put the bank back where every existing test in this package expects it.
    const roomy = buildLayout({ width: 1440, height: 900, floors: RECORDING.floors, shafts: RECORDING.shafts });
    expect(roomy.riderLane).toBeDefined();
    expect(roomy.columns[0]?.x).toBeCloseTo(roomy.plot.x + 18, 9);

    const tight = buildLayout({
      width: 640,
      height: 640,
      floors: RECORDING.floors,
      shafts: Array.from({ length: 12 }, (_, index) => shaft(`main-${String(index)}`, String(index))),
    });
    expect(tight.riderLane).toBeUndefined();
    const span = (tight.columns.at(-1)?.x ?? 0) + (tight.columns.at(-1)?.width ?? 0) - (tight.columns[0]?.x ?? 0);
    expect((tight.columns[0]?.x ?? 0) - tight.plot.x).toBeCloseTo(
      tight.plot.x + tight.plot.width - ((tight.columns[0]?.x ?? 0) + span),
      6,
    );
  });

  it('hands over a lane the figure planner can actually use', () => {
    // The layout's minimum and `riderFigures.ts`'s own are two constants that have to agree, and
    // nothing but this makes them. A lane below the planner's floor would be pixels spent on
    // fewer people than the gutter already draws.
    expect(figureCapacity(LAYOUT.riderLane?.width ?? 0)).toBeGreaterThanOrEqual(4);
  });
});
