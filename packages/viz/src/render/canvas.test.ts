/**
 * The renderer, against a recording 2D context.
 *
 * Drawing is the part of a viewer that usually escapes testing: it needs a browser, so it gets
 * a screenshot and a shrug. It does not escape here, because {@link Canvas2DLike} is a
 * structural interface and a stub can record every call. Two properties are worth having and
 * both are asserted:
 *
 * 1. **Equal frames draw equal call sequences.** That is the step that turns "the frame
 *    sequences match" (`replay/replay.test.ts`) into "the pictures match", which is what Phase
 *    4's acceptance criterion actually claims.
 * 2. **The car lands where its height says.** A renderer that drew the nearest floor instead
 *    would pass every other test in this package and quietly discard the S-curve.
 */

import { describe, expect, it } from 'vitest';

import { FIXTURE_DOOR_CONFIG } from '../fixtures.test-helper.js';
import { constantSeries } from '../contract/series.js';
import { VIZ_SCHEMA_VERSION, type Frame, type VizRecording } from '../contract/types.js';
import { buildLayout } from './layout.js';
import { DEFAULT_THEME, drawScene, formatClock, type Canvas2DLike } from './canvas.js';

/* -------------------------------------------------------------------------- *
 * A recording context
 * -------------------------------------------------------------------------- */

interface Call {
  readonly op: string;
  readonly args: readonly (number | string)[];
}

class RecordingContext implements Canvas2DLike {
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
  moveTo(x: number, y: number): void {
    this.#push('moveTo', x, y);
  }
  lineTo(x: number, y: number): void {
    this.#push('lineTo', x, y);
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
}

/* -------------------------------------------------------------------------- *
 * A synthetic building
 * -------------------------------------------------------------------------- */

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
  endedAt: 120,
  floors: [
    { id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
    { id: '2', index: 1, heightM: 3, isEntrance: false, isTransferFloor: false, population: 20 },
    { id: '3', index: 2, heightM: 6, isEntrance: false, isTransferFloor: false, population: 20 },
  ],
  shafts: [
    {
      carId: 'main-A',
      bankId: 'main',
      label: 'A',
      startFloorId: 'G',
      startHeightM: 0,
      servedFloorIds: ['G', '2', '3'],
      capacityPersons: 13,
      doorConfig: FIXTURE_DOOR_CONFIG,
      motions: [],
      doorMarks: [],
      occupants: constantSeries(0),
      loadFactor: constantSeries(0),
    },
  ],
  legs: [],
  landings: [],
  progress: {
    waiting: constantSeries(0),
    boardedLegs: constantSeries(0),
    meanWaitS: constantSeries(0),
  },
  summary: {
    saturated: false,
    awtIsValid: true,
    meanWaitS: 12,
    wait95S: 30,
    meanTimeToDestinationS: 40,
    generated: 50,
    delivered: 50,
    undelivered: 0,
  },
  warnings: [],
};

/** The one car of the synthetic building, with fields overridden. */
function car(overrides: Partial<Frame['cars'][number]> = {}): Frame['cars'][number] {
  return {
    carId: 'main-A',
    bankId: 'main',
    label: 'A',
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

/** The one shaft of the synthetic building, with fields overridden. */
function shaft(overrides: Partial<VizRecording['shafts'][number]>): VizRecording['shafts'][number] {
  const base = RECORDING.shafts[0];
  if (base === undefined) throw new Error('synthetic recording has no shaft');
  return { ...base, ...overrides };
}

function frame(overrides: Partial<Frame> = {}): Frame {
  return {
    schemaVersion: VIZ_SCHEMA_VERSION,
    runId: 'synthetic',
    simTimeS: 60,
    cars: [car()],
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

const layout = buildLayout({
  width: 900,
  height: 640,
  floors: RECORDING.floors,
  shafts: RECORDING.shafts,
});

function draw(f: Frame, recording: VizRecording = RECORDING): RecordingContext {
  const ctx = new RecordingContext();
  drawScene(ctx, { recording, frame: f, layout, theme: DEFAULT_THEME });
  return ctx;
}

/* -------------------------------------------------------------------------- *
 * Tests
 * -------------------------------------------------------------------------- */

describe('drawScene', () => {
  it('draws something', () => {
    const ctx = draw(frame());
    expect(ctx.calls.length).toBeGreaterThan(20);
    expect(ctx.calls.some((call) => call.op === 'fillRect')).toBe(true);
    expect(ctx.calls.some((call) => call.op === 'fillText')).toBe(true);
  });

  it('is a pure function of its inputs: equal frames draw equal call sequences', () => {
    expect(draw(frame()).transcript).toBe(draw(frame()).transcript);
  });

  it('draws different pictures for different frames', () => {
    expect(draw(frame({ simTimeS: 90 })).transcript).not.toBe(draw(frame()).transcript);
  });

  it('places the car at the pixel its height maps to, not at the nearest floor', () => {
    const midway = draw(frame());
    const expectedY = layout.yForHeight(1.5) - layout.carHeightPx / 2;
    const carRect = midway.calls.find(
      (call) => call.op === 'fillRect' && call.args[3] === layout.carHeightPx,
    );
    expect(carRect).toBeDefined();
    expect(carRect?.args[1]).toBeCloseTo(expectedY, 9);

    // And a car 1 cm higher must draw 1 cm higher, not identically.
    const nudged = draw(frame({ cars: [car({ heightM: 1.51 })] }));
    expect(nudged.transcript).not.toBe(midway.transcript);
  });

  it('draws the door gap in proportion to the open fraction', () => {
    const widths = [0, 0.5, 1].map((doorFraction) => {
      const ctx = draw(frame({ cars: [car({ doorFraction })] }));
      const seam = ctx.calls.find(
        (call) => call.op === 'fillRect' && call.args[4] === DEFAULT_THEME.doorSeam,
      );
      return Number(seam?.args[2] ?? -1);
    });
    expect(widths[0]).toBe(1); // shut: the minimum-width seam
    expect(widths[1] ?? 0).toBeGreaterThan(widths[0] ?? 0);
    expect(widths[2] ?? 0).toBeGreaterThan(widths[1] ?? 0);
  });

  it('shows the running mean as an em dash before anybody has been served', () => {
    const ctx = draw(frame({ boardedLegs: 0, runningMeanWaitS: undefined }));
    expect(ctx.transcript).toContain('mean wait so far —');
  });

  it('says so, loudly, when the run saturated', () => {
    const saturated: VizRecording = {
      ...RECORDING,
      summary: {
        ...RECORDING.summary,
        saturated: true,
        awtIsValid: false,
        awtInvalidReason: 'queue diverged',
      },
    };
    expect(draw(frame(), saturated).transcript).toContain('SATURATED — AWT suppressed');
    expect(draw(frame()).transcript).not.toContain('SATURATED');
  });

  it('draws a shaft only over the floors it serves', () => {
    const partial: VizRecording = {
      ...RECORDING,
      shafts: [shaft({ servedFloorIds: ['2', '3'] })],
    };
    const full = draw(frame());
    const limited = draw(frame(), partial);
    const shaftRect = (ctx: RecordingContext): Call | undefined =>
      ctx.calls.find((call) => call.op === 'strokeRect');
    const fullHeight = Number(shaftRect(full)?.args[3] ?? 0);
    const limitedHeight = Number(shaftRect(limited)?.args[3] ?? 0);
    expect(limitedHeight).toBeGreaterThan(0);
    expect(limitedHeight).toBeLessThan(fullHeight);
  });

  it('draws a waiting badge only where somebody is waiting', () => {
    const ctx = draw(frame());
    expect(ctx.transcript).toContain('▲3');
    expect(ctx.transcript).toContain('▼2');
    // The car's own direction arrow uses the same glyph, so the quiet frame parks it too —
    // otherwise this would assert nothing about the landings.
    const quiet = draw(
      frame({
        cars: [car({ direction: 0 })],
        landings: RECORDING.floors.map((f) => ({ floorId: f.id, waitingUp: 0, waitingDown: 0 })),
      }),
    );
    expect(quiet.transcript).not.toContain('▲');
    expect(quiet.transcript).not.toContain('▼');
  });
});

describe('formatClock', () => {
  it('reads m:ss below an hour and h:mm:ss above it', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(605)).toBe('10:05');
    expect(formatClock(3661)).toBe('1:01:01');
  });

  it('does not produce a negative clock', () => {
    expect(formatClock(-30)).toBe('0:00');
  });
});
