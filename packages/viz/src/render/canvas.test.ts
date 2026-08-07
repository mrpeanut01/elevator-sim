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

import { FIXTURE_DOOR_CONFIG, fixtureSummary } from '../fixtures.test-helper.js';
import { constantSeries } from '../contract/series.js';
import { VIZ_SCHEMA_VERSION, type Frame, type VizRecording } from '../contract/types.js';
import { DEFAULT_FOOTER_PX, MIN_HEADER_PX, buildLayout } from './layout.js';
import { meansAreSuppressed } from '../frame/overlay.js';
import { DEFAULT_THEME, drawScene, formatClock, type Canvas2DLike, type Theme } from './canvas.js';
import { themeFor } from './theme.js';
import type { FloorQueue, QueuedRider, WaitBand } from '../frame/overlay.js';
import { MOOD_GLYPH, type BuildingMood } from './mood.js';
import { BAND_GLYPH } from './riderQueue.js';
import { windowClause } from './runSummary.js';

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
  closePath(): void {
    this.#push('closePath');
  }
  moveTo(x: number, y: number): void {
    this.#push('moveTo', x, y);
  }
  lineTo(x: number, y: number): void {
    this.#push('lineTo', x, y);
  }
  /*
   * The four members `Canvas2DLike` gained with the design handoff's stage, **all recorded**.
   *
   * Recording them rather than swallowing them is the whole reason those four were the ones
   * admitted to the interface: the sky's ramp, the car's rounded body and a rider's bobbing head
   * are now part of the transcript, so *"equal frames draw equal call sequences"* covers them.
   * A no-op stub here would have made the animation invisible to the one test that keeps a
   * scrubbed frame reproducible.
   */
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
  summary: fixtureSummary(),
  // Version 7. Empty is the legal value for a fixture that exercises none of the three:
  // the timeline draws one unlabelled band, the decision log draws its empty state, and
  // no shaft is dark. See `contract/types.ts`.
  demandPhases: [],
  decisions: [],
  outOfServiceCarIds: [],
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
 * Reading the two shapes the design handoff's stage draws with paths
 * -------------------------------------------------------------------------- */

interface PathBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  /** Corner radius, recovered from the `moveTo` that opens the path. */
  readonly radius: number;
  readonly fill: string;
}

/**
 * Every rounded rectangle in a transcript, as a box.
 *
 * `render/shapes.ts` traces a rounded rect as `beginPath · moveTo · … · closePath · fill`, and
 * every one of those calls records its own numbers — which is the reason `Canvas2DLike` was
 * allowed to grow `quadraticCurveTo` and `fill` at all. A disc (`beginPath · arc · fill`) is
 * skipped by the `moveTo` check, so a rider's head is never mistaken for a car.
 */
function roundedPaths(ctx: RecordingContext): readonly PathBox[] {
  const boxes: PathBox[] = [];
  for (let index = 0; index < ctx.calls.length; index += 1) {
    if (ctx.calls[index]?.op !== 'beginPath') continue;
    const move = ctx.calls[index + 1];
    if (move?.op !== 'moveTo') continue;
    const xs: number[] = [];
    const ys: number[] = [];
    let fill: string | undefined;
    for (let cursor = index + 1; cursor < ctx.calls.length; cursor += 1) {
      const call = ctx.calls[cursor];
      if (call === undefined) break;
      if (call.op === 'moveTo' || call.op === 'lineTo') {
        xs.push(Number(call.args[0]));
        ys.push(Number(call.args[1]));
        continue;
      }
      if (call.op === 'quadraticCurveTo') {
        xs.push(Number(call.args[0]), Number(call.args[2]));
        ys.push(Number(call.args[1]), Number(call.args[3]));
        continue;
      }
      if (call.op === 'closePath') continue;
      if (call.op === 'fill') fill = String(call.args[0]);
      break;
    }
    if (fill === undefined || xs.length < 8) continue;
    const left = Math.min(...xs);
    boxes.push({
      left,
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
      radius: Number(move.args[0]) - left,
      fill,
    });
  }
  return boxes;
}

/** The four fills a car body can have. Read from the theme, never transcribed. */
const LOAD_FILLS: ReadonlySet<string> = new Set([
  DEFAULT_THEME.carLight,
  DEFAULT_THEME.car,
  DEFAULT_THEME.carHeavy,
  DEFAULT_THEME.carOverload,
]);

/** The first car body in a transcript — the only rounded path filled in a load colour. */
function carBodyPath(ctx: RecordingContext): PathBox | undefined {
  return roundedPaths(ctx).find((box) => LOAD_FILLS.has(box.fill));
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

  /*
   * `docs/10-experience-layer-contract.md` § 7.4 / `UX.md` RV-T4 — every figure carries its
   * window, on the surface that leaves the building.
   *
   * The header quotes a running mean and the panel quotes windowed figures; a bitmap that says
   * neither which window nor how long it was is a bitmap whose numbers will be read as covering
   * the whole run. **Export PNG** writes this canvas to a file, so the footer is where it has to
   * be — not in the DOM panel, which the export does not capture.
   *
   * Recomputed from the recording rather than written down: replacing the clause with a constant
   * makes the second assertion fail, and dropping it makes the first fail.
   */
  it('names the reporting window in the footer, so the exported PNG says what it covers', () => {
    const text = draw(frame())
      .calls.filter((call) => call.op === 'fillText')
      .map((call) => String(call.args[0]));
    expect(text.some((line) => line.includes(windowClause(RECORDING.summary)))).toBe(true);

    const moved: VizRecording = {
      ...RECORDING,
      summary: {
        ...RECORDING.summary,
        reportWindow: { ...RECORDING.summary.reportWindow, id: 'full-run', startS: 0, endS: 600 },
      },
    };
    const after = new RecordingContext();
    drawScene(after, { recording: moved, frame: frame(), layout, theme: DEFAULT_THEME });
    expect(
      after.calls
        .filter((call) => call.op === 'fillText')
        .some((call) => String(call.args[0]).includes('full-run 0–600 s')),
    ).toBe(true);
  });

  /*
   * Issue #105 — the footer published the **simulation's** outcome as if it were the playback's.
   *
   * `recording.status` is `result.status` off `record/recordRun.ts`, which simulates the whole day
   * before the first frame is painted, and it was drawn bare: `completed · 360 generated · …`,
   * directly under the playback progress bar. At a playhead a quarter of the way in, the word and
   * the bar were two answers to one question.
   *
   * Fixed by **scoping** rather than by gating, and the tests below pin both halves of that choice:
   * every term now names what it is true of, *and* the § 7.4 window clause still reaches an
   * exported PNG at every playhead — which a gate would have taken away.
   */
  it('names what finished, not the playback, and says which window the count covers', () => {
    const early = draw(frame({ simTimeS: 1 }))
      .calls.filter((call) => call.op === 'fillText')
      .map((call) => String(call.args[0]));
    const footer = early.find((line) => line.includes(windowClause(RECORDING.summary)));
    expect(footer).toBeDefined();
    expect(footer).toBe(
      `simulation ${RECORDING.status} · ` +
        `${String(RECORDING.summary.generated)} arrivals generated over the whole day · ` +
        `${windowClause(RECORDING.summary)}`,
    );
    // The premise: the playhead really is near the start of a recording that really is finished.
    expect(RECORDING.status).toBe('completed');
    expect(RECORDING.endedAt).toBeGreaterThan(1);
    // No bare status verb standing on its own where a reader reads it as the transport's.
    expect(footer).not.toMatch(/(^|·\s)completed\b/);
  });

  it('keeps the footer at every playhead, because a bitmap has no later', () => {
    // The reason this surface is scoped rather than withheld: **Export PNG** bakes the canvas into
    // a file, and § 7.4 requires every figure on it to carry its window. Gating the caption the way
    // `dev/leftRail.ts` gates the mood drivers would strip the window clause off every PNG exported
    // mid-run — one honesty rule spending another.
    for (const simTimeS of [0, 30, 60, 119, 120]) {
      const lines = draw(frame({ simTimeS }))
        .calls.filter((call) => call.op === 'fillText')
        .map((call) => String(call.args[0]));
      expect(
        lines.some((line) => line.includes(windowClause(RECORDING.summary))),
        `no window clause at ${String(simTimeS)} s`,
      ).toBe(true);
    }
  });

  it('does not round a timed-out run up to a friendlier word', () => {
    const timedOut: VizRecording = { ...RECORDING, status: 'timed-out' };
    const lines = draw(frame(), timedOut)
      .calls.filter((call) => call.op === 'fillText')
      .map((call) => String(call.args[0]));
    expect(lines.some((line) => line.startsWith('simulation timed-out · '))).toBe(true);
  });

  it('is a pure function of its inputs: equal frames draw equal call sequences', () => {
    expect(draw(frame()).transcript).toBe(draw(frame()).transcript);
  });

  it('draws different pictures for different frames', () => {
    expect(draw(frame({ simTimeS: 90 })).transcript).not.toBe(draw(frame()).transcript);
  });

  it('places the car at the pixel its height maps to, not at the nearest floor', () => {
    /*
     * ## Why this assertion moved, and why it is stronger than the one it replaces
     *
     * The car used to be a `fillRect` and this test found it by *"the rectangle whose height is
     * `carHeightPx`"*, then checked one number: its top edge. The design handoff's car is a
     * rounded path (`render/shapes.ts`), so that finder no longer matches anything — and the
     * replacement is not a translation of the old assertion but a wider one, because the path
     * records four numbers where the rectangle recorded two.
     *
     * Checked here: the top edge is `yForHeight(h) − carHeightPx/2` **and** the bottom edge is
     * exactly `carHeightPx` below it **and** the corner radius lies inside the box. The old test
     * could not see the bottom edge at all — it took the height on faith from the finder it used
     * to locate the call, so a renderer that drew the right top and the wrong height passed it.
     *
     * The property being defended is unchanged and is the whole reason the frame producer
     * evaluates an S-curve: a car's y must be a **continuous** function of its height in metres.
     * A renderer that drew the nearest floor instead would pass every other test in this package.
     */
    const midway = draw(frame());
    const expectedTop = layout.yForHeight(1.5) - layout.carHeightPx / 2;
    const body = carBodyPath(midway);
    expect(body, 'the car body is drawn as a rounded path').toBeDefined();
    expect(body?.top).toBeCloseTo(expectedTop, 9);
    expect((body?.bottom ?? 0) - (body?.top ?? 0)).toBeCloseTo(layout.carHeightPx, 9);
    expect(body?.radius ?? 0).toBeGreaterThan(0);
    expect(body?.radius ?? 0).toBeLessThanOrEqual(layout.carHeightPx / 2);

    // And a car 1 cm higher must draw 1 cm higher, not identically.
    const nudged = draw(frame({ cars: [car({ heightM: 1.51 })] }));
    expect(nudged.transcript).not.toBe(midway.transcript);
    expect(carBodyPath(nudged)?.top ?? 0).toBeLessThan(body?.top ?? 0);
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

  /* ------------------------------------------------------------------ *
   * The header's three counters, each proved to be read rather than typed
   *
   * `render/canvas.ts`'s own docstring notes that this package shipped a frame seven of whose
   * eight fields could be replaced by a constant with the suite still green. These are the
   * mutation controls for the three the header draws: replace the field with a constant and one
   * of these goes red.
   * ------------------------------------------------------------------ */

  it('draws the frame’s own waiting count, not a constant', () => {
    expect(draw(frame({ totalWaiting: 5 })).transcript).toContain('waiting 5');
    expect(draw(frame({ totalWaiting: 41 })).transcript).toContain('waiting 41');
    expect(draw(frame({ totalWaiting: 41 })).transcript).not.toContain('waiting 5');
  });

  it('draws the frame’s own boarded count, not a constant', () => {
    expect(draw(frame({ boardedLegs: 12 })).transcript).toContain('boarded 12 legs');
    expect(draw(frame({ boardedLegs: 137 })).transcript).toContain('boarded 137 legs');
    expect(draw(frame({ boardedLegs: 137 })).transcript).not.toContain('boarded 12 legs');
  });

  it('draws the frame’s own running mean, to one decimal, not a constant', () => {
    expect(draw(frame({ runningMeanWaitS: 18.25 })).transcript).toContain('mean wait so far 18.3 s');
    expect(draw(frame({ runningMeanWaitS: 4.02 })).transcript).toContain('mean wait so far 4.0 s');
    expect(draw(frame({ runningMeanWaitS: 4.02 })).transcript).not.toContain('18.3');
  });

  it('shows the running mean as an em dash before anybody has been served', () => {
    // Only meaningful on a run whose mean the summary stands behind — an em dash means "nobody
    // has been served yet", and the suppressed run below must not be able to borrow that reading.
    const ctx = draw(frame({ boardedLegs: 0, runningMeanWaitS: undefined }));
    expect(ctx.transcript).toContain('mean wait so far —');
    expect(RECORDING.summary.saturated).toBe(false);
    expect(RECORDING.summary.awtIsValid).toBe(true);
  });

  /* ------------------------------------------------------------------ *
   * `D1` — the header never prints a mean the same element says does not exist
   *
   * The defect these two rows were half a test away from catching: `drawHeader` drew
   * `mean wait so far 87.7 s` on the line immediately below the `SATURATED — AWT suppressed`
   * banner *it also drew*, on the one `<canvas role="img">` whose `aria-label` says the mean is
   * suppressed — and `Export PNG` baked the number into a shareable file. Both suppression
   * grounds are asserted, because it leaked on both.
   * ------------------------------------------------------------------ */

  /** A run the summary refuses to publish a mean for, on either of the two grounds. */
  function suppressed(
    summary: Partial<VizRecording['summary']>,
    status: VizRecording['status'] = 'completed',
  ): VizRecording {
    return { ...RECORDING, status, summary: { ...RECORDING.summary, ...summary } };
  }

  it('says so, loudly, when the run saturated — and prints no mean beside the banner', () => {
    const run = suppressed({
      saturated: true,
      awtIsValid: false,
      awtInvalidReason: 'queue diverged',
    });
    const transcript = draw(frame({ runningMeanWaitS: 87.7 }), run).transcript;
    expect(transcript).toContain('SATURATED — AWT suppressed');
    // The assertion the original row stopped one short of.
    expect(transcript).not.toContain('mean wait so far');
    expect(transcript).not.toContain('87.7');
    expect(transcript).toContain('mean wait suppressed');
    expect(draw(frame()).transcript).not.toContain('SATURATED');
  });

  it('prints no mean on the other suppression ground either: awtIsValid false without saturation', () => {
    // Secure Tower, seed 16757712606996968457: `TIMED-OUT — 20 undelivered · AWT suppressed`
    // was drawn beside `mean wait so far 21.0 s`. `saturated` is false here on purpose.
    const run = suppressed(
      { saturated: false, awtIsValid: false, awtInvalidReason: 'censored above the limit', undelivered: 20 },
      'timed-out',
    );
    const transcript = draw(frame({ runningMeanWaitS: 21 }), run).transcript;
    expect(transcript).toContain('TIMED-OUT — 20 undelivered');
    expect(transcript).toContain('AWT suppressed');
    expect(transcript).not.toContain('SATURATED');
    expect(transcript).not.toContain('mean wait so far');
    expect(transcript).not.toContain('21.0');
    expect(transcript).toContain('mean wait suppressed');
  });

  it('suppresses on the summary’s grounds, so the picture and the report can never disagree', () => {
    // The gate is `saturated || !awtIsValid` and nothing else — UX.md § 7.1.4 forbids the viewer
    // holding a second opinion about whether a mean may be shown.
    expect(meansAreSuppressed(RECORDING)).toBe(false);
    expect(meansAreSuppressed(suppressed({ saturated: true }))).toBe(true);
    expect(meansAreSuppressed(suppressed({ awtIsValid: false }))).toBe(true);
    // …and a mean survives every *other* thing that can be wrong with a run.
    expect(meansAreSuppressed(suppressed({ undelivered: 20 }, 'timed-out'))).toBe(false);
    expect(draw(frame(), suppressed({ undelivered: 20 }, 'timed-out')).transcript).toContain(
      'mean wait so far 18.3 s',
    );
  });

  /* ------------------------------------------------------------------ *
   * `D10` — a call no car answers has a surface that is not the landing selector
   * ------------------------------------------------------------------ */

  it('marks a landing whose call no car answers, and names the count in the banner', () => {
    const plain = draw(frame());
    expect(plain.transcript).not.toContain('unanswered');

    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: RECORDING,
      frame: frame(),
      layout,
      theme: DEFAULT_THEME,
      unansweredCallFloorIds: ['G'],
    });
    expect(ctx.transcript).toContain('1 landing unanswered');
    // Drawn on the landing itself, in the warning colour, and not on the quiet floors.
    const marks = ctx.calls.filter(
      (call) => call.op === 'fillText' && call.args[0] === '✗',
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]?.args[3]).toBe(DEFAULT_THEME.warning);
  });

  it('counts the unanswered landings it was given, not a constant', () => {
    const two = new RecordingContext();
    drawScene(two, {
      recording: RECORDING,
      frame: frame(),
      layout,
      theme: DEFAULT_THEME,
      unansweredCallFloorIds: ['G', '2'],
    });
    expect(two.transcript).toContain('2 landings unanswered');
    expect(two.calls.filter((call) => call.op === 'fillText' && call.args[0] === '✗')).toHaveLength(
      2,
    );
  });

  it('does not confuse an unanswered call with a floor no shaft serves', () => {
    // `⊘` is geometry — RV-08's unassignable landing. `✗` is an outcome. Different glyphs,
    // different gutters, because they are different claims about the same building.
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: RECORDING,
      frame: frame(),
      layout,
      theme: DEFAULT_THEME,
      unservedFloorIds: ['3'],
      unansweredCallFloorIds: ['G'],
    });
    const glyphs = ctx.calls
      .filter((call) => call.op === 'fillText')
      .map((call) => String(call.args[0]));
    expect(glyphs.some((text) => text.includes('⊘'))).toBe(true);
    expect(glyphs.some((text) => text === '✗')).toBe(true);
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

/* -------------------------------------------------------------------------- *
 * U4 — rider queues and the mood, on the bitmap (`docs/10` § 6, D1 + D4)
 * -------------------------------------------------------------------------- */

const BANDS: readonly WaitBand[] = ['settling', 'waiting', 'long', 'abandoned'];

describe('drawScene draws the rider queue', () => {
  const band = (index: number): WaitBand => BANDS[index % BANDS.length] ?? 'settling';

  function queue(total: number, overrides: Partial<FloorQueue> = {}): FloorQueue {
    const riders: QueuedRider[] = Array.from({ length: total }, (_, index) => ({
      passengerId: `p${String(index)}`,
      waitedS: 100 - index,
      direction: 'up' as const,
      destinationFloorId: 'G',
      promisedCarId: undefined,
      band: band(index),
    }));
    return {
      floorId: 'G',
      riders,
      groups: [
        { key: '', promisedCarId: undefined, riders, total, oldestWaitS: riders[0]?.waitedS ?? 0 },
      ],
      total,
      oldestWaitS: riders[0]?.waitedS ?? 0,
      worstBand: total > 3 ? 'abandoned' : band(Math.max(0, total - 1)),
      recentlyBoarded: 0,
      ...overrides,
    };
  }

  function withQueues(queues: readonly FloorQueue[], theme = DEFAULT_THEME): RecordingContext {
    const ctx = new RecordingContext();
    drawScene(ctx, { recording: RECORDING, frame: frame(), layout, theme, queues });
    return ctx;
  }

  /**
   * The aggregated **bars**, and only those — `fillRect`s in a band colour that land in the
   * landing gutter, right of the plot.
   *
   * ## Why the position filter is a tightening rather than a loosening
   *
   * A band colour used to identify a bar on its own, because a bar was the only thing on the
   * canvas painted one. The design handoff's stage draws the waiting people as little figures in
   * `Layout.riderLane`, tinted by the same four bands — so `queueBands.long` now matches a bar
   * *and* every torso standing on that floor, and a bare colour filter counted three things where
   * it means to count one (measured: 120 for the 40 rows below, where 40 is the answer).
   *
   * The fix is not to loosen the count. It is to say **where** a bar is, which the old assertion
   * never did: the bar belongs to the landing row in the gutter and the figures belong inside the
   * plot, and a renderer that drew the bar in the wrong place now fails this rather than passing
   * it. See `render/riderFigures.ts` for why the figures are additional to the glyph row and are
   * never allowed to replace it.
   */
  function barsIn(ctx: RecordingContext, band: WaitBand, at = layout): readonly Call[] {
    const gutter = at.plot.x + at.plot.width;
    return ctx.calls.filter(
      (call) =>
        call.op === 'fillRect' &&
        call.args[4] === DEFAULT_THEME.queueBands[band] &&
        Number(call.args[0]) >= gutter,
    );
  }

  it('draws nothing new when no queues are supplied — the shipped picture is unchanged', () => {
    // The regression guard for every other test in this file: U4 is additive, and a viewer that
    // has not computed a queue draws exactly what it drew before.
    const ctx = new RecordingContext();
    drawScene(ctx, { recording: RECORDING, frame: frame(), layout, theme: DEFAULT_THEME });
    expect(ctx.transcript).toBe(draw(frame()).transcript);
  });

  it('draws one glyph per waiting rider, in that rider’s own band', () => {
    const glyphs = withQueues([queue(4)])
      .calls.filter((call) => call.op === 'fillText')
      .map((call) => String(call.args[0]));
    // Read from the shipped map, never transcribed: the abandoned band was re-spelled to break a
    // *shape* collision with `✗` (`render/landingMarks.test.ts`), and a test carrying its own
    // copy of the four marks would have gone red for the change rather than for a defect.
    for (const wanted of BANDS.map((band) => BAND_GLYPH[band])) {
      expect(glyphs, `band glyph ${wanted}`).toContain(wanted);
    }
  });

  it('keeps the band distinguishable when every band colour is the same — KB-15', () => {
    /*
     * The acceptance test for *"bands must be distinguishable by SHAPE, not colour alone"*, on the
     * surface a reader actually looks at. The theme's four band colours are collapsed to one
     * string — a greyscale display, a monochrome printer, a screenshot run through a filter — and
     * the four bands must still be four different marks.
     */
    const flat: Theme = {
      ...DEFAULT_THEME,
      queueBands: { settling: '#fff', waiting: '#fff', long: '#fff', abandoned: '#fff' },
    };
    const marks = withQueues([queue(4)], flat)
      .calls.filter((call) => call.op === 'fillText' && call.args[3] === '#fff')
      .map((call) => String(call.args[0]));
    expect(new Set(marks).size).toBe(4);
    expect([...new Set(marks)].sort((a, b) => a.localeCompare(b))).toEqual(
      BANDS.map((band) => BAND_GLYPH[band]).sort((a, b) => a.localeCompare(b)),
    );
  });

  it('degrades to a bar past the glyph budget, with the count beside it', () => {
    // 175 waiting is M5's measured depth on Midtown Office. The bar is a `fillRect`; the number
    // is drawn as text beside it, because a bar is never the only carrier of its value.
    const ctx = withQueues([queue(175)]);
    const text = ctx.calls.filter((call) => call.op === 'fillText').map((call) => String(call.args[0]));
    // The count survives at every gutter width. It is the value a bar may never carry alone.
    expect(text.some((line) => line.includes('175 waiting'))).toBe(true);
    // The oldest wait is the *secondary* fact and is dropped when the row is too narrow for it,
    // rather than being drawn off the end of the canvas. This layout's gutter is the 76 px
    // default, so it is dropped here — and present when there is room, below.
    expect(text.some((line) => line.includes('longest'))).toBe(false);
    const roomy = new RecordingContext();
    drawScene(roomy, {
      recording: RECORDING,
      frame: frame(),
      layout: buildLayout({
        width: 900,
        height: 640,
        floors: RECORDING.floors,
        shafts: RECORDING.shafts,
        gutterRightPx: 360,
      }),
      theme: DEFAULT_THEME,
      queues: [queue(175)],
    });
    expect(
      roomy.calls
        .filter((call) => call.op === 'fillText')
        .some((call) => String(call.args[0]).includes('175 waiting · longest')),
    ).toBe(true);
    // …and a bar rectangle in one of the band colours, in the landing gutter — see `barsIn`.
    expect(barsIn(ctx, 'abandoned').length).toBe(1);
    /*
     * Deeper queue, longer bar — and not proportionally, which is what the log scale is for.
     *
     * Both queues in **one** scene, because that is the comparison the scale is defined for: the
     * bars are scaled against the deepest queue at this instant, so two of them drawn separately
     * would each fill their own track and comparing across draws would assert nothing. Drawn
     * together, 175 against 379 is 175 against 379.
     */
    const both = withQueues([queue(379), { ...queue(175), floorId: '2' }]);
    const widths = barsIn(both, 'abandoned').map((call) => Number(call.args[2]));
    expect(widths).toHaveLength(2);
    const [deep, shallow] = widths as [number, number];
    expect(deep).toBeGreaterThan(shallow);
    // Linear would put 175 at 46 % of 379. Logarithmic puts it far higher — which is the property
    // that keeps a queue of 20 visible on a building whose worst landing holds 379.
    expect(shallow / deep).toBeGreaterThan(0.8);
    expect(shallow / deep).toBeCloseTo(Math.log1p(175) / Math.log1p(379), 6);
  });

  it('draws the promised car above its riders, so a Level-1 landing is not drawn as a Level-0 one', () => {
    const riderFor = (id: string, carId: string): QueuedRider => ({
      passengerId: id,
      waitedS: 20,
      direction: 'up',
      destinationFloorId: '3',
      promisedCarId: carId,
      band: 'settling',
    });
    const a = [riderFor('a1', 'main-A'), riderFor('a2', 'main-A')];
    const b = [riderFor('b1', 'main-B')];
    const panelQueue: FloorQueue = {
      floorId: 'G',
      riders: [...a, ...b],
      groups: [
        { key: 'main-A', promisedCarId: 'main-A', riders: a, total: 2, oldestWaitS: 20 },
        { key: 'main-B', promisedCarId: 'main-B', riders: b, total: 1, oldestWaitS: 20 },
      ],
      total: 3,
      oldestWaitS: 20,
      worstBand: 'settling',
      recentlyBoarded: 0,
    };
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: RECORDING,
      frame: frame(),
      layout: buildLayout({
        width: 900,
        height: 640,
        floors: RECORDING.floors,
        shafts: RECORDING.shafts,
        gutterRightPx: 300,
      }),
      theme: DEFAULT_THEME,
      queues: [panelQueue],
    });
    const labels = ctx.calls
      .filter((call) => call.op === 'fillText' && call.args[3] === DEFAULT_THEME.badge)
      .map((call) => String(call.args[0]));
    // The entrance badge shares the badge colour, so it is filtered out by shape rather than the
    // assertion being loosened: `⌂ G` is the floor gutter's, and the two promises are the row's.
    expect(labels.filter((line) => line.includes('main'))).toEqual(['main-A ', 'main-B ']);
  });

  it('draws the `+N` the plan produced, inside the row, not a constant', () => {
    // 20 riders into a row that fits a few of them. The number is the row's, recomputed here.
    const narrowLayout = buildLayout({
      width: 900,
      height: 640,
      floors: RECORDING.floors,
      shafts: RECORDING.shafts,
      gutterRightPx: 150,
    });
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: RECORDING,
      frame: frame(),
      layout: narrowLayout,
      theme: DEFAULT_THEME,
      queues: [queue(20)],
    });
    /*
     * The landing **row**, which since the design handoff's stage is not the only thing on the
     * canvas that can print a `+N`.
     *
     * `Layout.riderLane` draws the same crowd as little figures inside the plot and states its own
     * overflow the same way, so `find(text === '+7')` can now land on either. The two counts are
     * different claims — one is *this row ran out of cells*, the other is *this lobby ran out of
     * floor* — and this test is about the first. Filtering to the gutter is what keeps it about
     * the first; the numbers happen to agree today, and a test that would pass on either is a
     * test measuring whichever it reached.
     */
    const gutter = narrowLayout.plot.x + narrowLayout.plot.width;
    const onTheRow = ctx.calls.filter(
      (call) => call.op === 'fillText' && Number(call.args[1]) >= gutter,
    );
    const drawn = onTheRow.map((call) => String(call.args[0]));
    const bandMarks: readonly string[] = BANDS.map((band) => BAND_GLYPH[band]);
    const glyphCount = drawn.filter((line) => bandMarks.includes(line)).length;
    expect(glyphCount).toBeGreaterThan(0);
    expect(glyphCount).toBeLessThan(20);
    expect(drawn).toContain(`+${String(20 - glyphCount)}`);

    /*
     * …and it is drawn **inside** the canvas, not past its right edge.
     *
     * Driven on Midtown Office at 5:05, seed 42, where the Garage row read `18 waiti` with the
     * rest under the metrics panel. The glyphs fill to the row width and the count follows them,
     * so the row has to keep cells back for it — and nothing else in this file would notice if it
     * stopped. A clipped count is worse than no count: the reader cannot tell which digits are
     * missing.
     */
    const label = `+${String(20 - glyphCount)}`;
    const call = onTheRow.find((entry) => entry.args[0] === label);
    const x = Number(call?.args[1] ?? 0);
    expect(x).toBeGreaterThan(0);
    expect(x + label.length * 7.2).toBeLessThanOrEqual(narrowLayout.width - 12);
  });

  it('draws the counts and the queue, not one instead of the other', () => {
    // The direction split is the only thing on the row that says which way people want to go, so
    // U4 adds to it rather than replacing it.
    const ctx = withQueues([queue(3)]);
    expect(ctx.transcript).toContain('▲3');
    expect(ctx.transcript).toContain('○');
  });

  it('marks a boarding that just happened, on both the bar row and the glyph row', () => {
    /*
     * **Both**, and the second half is here because the first was passing for the wrong reason.
     * The default 76 px gutter leaves five cells, and a queue that reserves five for its own
     * count has none left — so this row was a *bar*, and the mutation that deleted the relief mark
     * from the **glyph** branch came back green. The wide layout below exercises that branch.
     */
    const narrow = withQueues([queue(2, { recentlyBoarded: 3 })]);
    expect(
      narrow.calls
        .filter((call) => call.op === 'fillText' && call.args[3] === DEFAULT_THEME.queueRelief)
        .map((call) => String(call.args[0])),
    ).toEqual(['✓3']);

    const wide = new RecordingContext();
    drawScene(wide, {
      recording: RECORDING,
      frame: frame(),
      layout: buildLayout({
        width: 900,
        height: 640,
        floors: RECORDING.floors,
        shafts: RECORDING.shafts,
        gutterRightPx: 300,
      }),
      theme: DEFAULT_THEME,
      queues: [queue(2, { recentlyBoarded: 3 })],
    });
    const drawn = wide.calls.filter((call) => call.op === 'fillText');
    // Glyph mode: two riders, each drawn, and the relief mark after them.
    expect(drawn.filter((call) => call.args[3] === DEFAULT_THEME.queueBands.settling)).toHaveLength(1);
    expect(
      drawn
        .filter((call) => call.args[3] === DEFAULT_THEME.queueRelief)
        .map((call) => String(call.args[0])),
    ).toEqual(['✓3']);
  });
});

describe('drawScene draws the building mood — D4, and R1’s payoff', () => {
  const mood = (level: 'calm' | 'frustrated' | 'distressed', provisional = false): BuildingMood => ({
    level,
    glyph: MOOD_GLYPH[level],
    headline: `headline for ${level}`,
    drivers: [],
    provisional,
    // Issue #109. `drawScene` draws `glyph` and `headline`; the retraction belongs to the left
    // rail's driver block, which this file does not mount. Present so the record is complete.
    retraction: provisional ? 'The run has not finished.' : '',
    caveat: 'not a verdict on the dispatcher',
  });

  it('puts the glyph and the headline on the canvas, so Export PNG carries them', () => {
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: RECORDING,
      frame: frame(),
      layout,
      theme: DEFAULT_THEME,
      mood: mood('distressed'),
    });
    expect(ctx.transcript).toContain(`${MOOD_GLYPH.distressed} headline for distressed`);
  });

  it('is drawn on a run whose mean is refused — the whole point of R1', () => {
    /*
     * The header two lines up says `mean wait suppressed`. The mood line is still there, because
     * nothing it is made of is routed through `awtIsValid` — which is what makes the treatment
     * available on the ~46 of 60 shipped configurations where no mean may be shown (M1).
     */
    const run = { ...RECORDING, summary: { ...RECORDING.summary, saturated: true, awtIsValid: false } };
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: run,
      frame: frame(),
      layout,
      theme: DEFAULT_THEME,
      mood: mood('distressed'),
    });
    expect(ctx.transcript).toContain('mean wait suppressed');
    expect(ctx.transcript).toContain('headline for distressed');
  });

  it('reads the mood it is given rather than deriving one of its own', () => {
    const calm = new RecordingContext();
    drawScene(calm, {
      recording: RECORDING,
      frame: frame(),
      layout,
      theme: DEFAULT_THEME,
      mood: mood('calm'),
    });
    expect(calm.transcript).toContain('headline for calm');
    expect(calm.transcript).not.toContain('headline for distressed');
  });

  it('draws no mood line at all when none is supplied', () => {
    expect(draw(frame()).transcript).not.toContain('headline');
  });
});

describe('a building whose rows cannot be labelled aggregates all the way to a bar', () => {
  /*
   * The case driven in a browser and fixed there: Midtown Office's 21 floors in a short canvas put
   * the floor lines 7 px apart, and two queue captions were drawn on top of each other — text that
   * carries less than nothing. `FloorRow.labelled` is the layout's own answer to "can this row
   * hold 12 px of type", so the queue reuses it rather than inventing a second threshold.
   *
   * The **limitation this test pins** is stated rather than hidden: on those rows the bar is drawn
   * with no count beside it. The count still reaches the reader through `describeFrame`, which
   * names the busiest floors with their numbers.
   */
  const tall: VizRecording = {
    ...RECORDING,
    floors: Array.from({ length: 40 }, (_, index) => ({
      id: `F${String(index)}`,
      index,
      heightM: index * 3,
      isEntrance: index === 0,
      isTransferFloor: false,
      population: 20,
    })),
    shafts: [shaft({ servedFloorIds: Array.from({ length: 40 }, (_, i) => `F${String(i)}`) })],
  };
  const tallLayout = buildLayout({
    width: 900,
    height: 400,
    floors: tall.floors,
    shafts: tall.shafts,
  });

  it('draws bars everywhere and a caption only where a label fits', () => {
    const unlabelled = tallLayout.rows.filter((row) => !row.labelled);
    expect(unlabelled.length).toBeGreaterThan(0);

    const queues: FloorQueue[] = tall.floors.map((floor) => {
      const rider: QueuedRider = {
        passengerId: `p-${floor.id}`,
        waitedS: 200,
        direction: 'up',
        destinationFloorId: 'F0',
        promisedCarId: undefined,
        band: 'long',
      };
      return {
        floorId: floor.id,
        riders: [rider, rider],
        groups: [{ key: '', promisedCarId: undefined, riders: [rider, rider], total: 2, oldestWaitS: 200 }],
        total: 2,
        oldestWaitS: 200,
        worstBand: 'long',
        recentlyBoarded: 0,
      };
    });

    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: tall,
      frame: frame({
        landings: tall.floors.map((floor) => ({ floorId: floor.id, waitingUp: 2, waitingDown: 0 })),
      }),
      layout: tallLayout,
      theme: DEFAULT_THEME,
      queues,
    });

    // Every floor gets a bar — the aggregation is what makes a 40-storey building drawable.
    const bars = ctx.calls.filter(
      (call) =>
        call.op === 'fillRect' &&
        call.args[4] === DEFAULT_THEME.queueBands.long &&
        Number(call.args[0]) >= tallLayout.plot.x + tallLayout.plot.width,
    );
    expect(bars).toHaveLength(40);
    // No glyphs: a row that cannot hold a label cannot hold twelve of these either.
    const text = ctx.calls.filter((call) => call.op === 'fillText').map((call) => String(call.args[0]));
    expect(text).not.toContain('●');
    // …and the captions are exactly as many as the rows that can carry one.
    const captions = text.filter((line) => line.includes('2 waiting'));
    expect(captions.length).toBe(tallLayout.rows.filter((row) => row.labelled).length);
    expect(captions.length).toBeLessThan(40);
    expect(captions.length).toBeGreaterThan(0);
  });

  it('aggregates a row that has the pitch for a glyph but not the room for a label', () => {
    /*
     * The window between the two thresholds — pitch at least `MIN_GLYPH_PITCH_PX` (12) and less
     * than the layout's `MIN_LABEL_PITCH_PX` (14) — where a row *could* hold a glyph and cannot
     * hold the text that identifies it. Without this, the mutation that drops `labelled` from the
     * decision comes back green, because every other case is already decided by the pitch alone.
     */
    const between = buildLayout({
      width: 900,
      // 20 gaps at 13 px, plus the header, footer and padding the layout subtracts. The header is
      // `MIN_HEADER_PX` and the footer `DEFAULT_FOOTER_PX`, not literals, because both are
      // *derived* from the rows their bands hold (`render/layout.ts`) — a transcribed 64 stopped
      // being true the moment the header grew a row, and a transcribed 28 stopped being true the
      // moment the foot band grew the out-of-service badge row. This test's whole point is the
      // two-pixel window it lands the pitch in, so a stale constant does not fail it loudly; it
      // moves the pitch out of the window and the test starts measuring a different case.
      height: 20 * 13 + 24 + MIN_HEADER_PX + DEFAULT_FOOTER_PX,
      floors: tall.floors.slice(0, 21),
      shafts: tall.shafts,
    });
    expect(between.pitchPx).toBeGreaterThanOrEqual(12);
    expect(between.pitchPx).toBeLessThan(14);
    const thinned = between.rows.filter((row) => !row.labelled);
    expect(thinned.length).toBeGreaterThan(0);

    const rider: QueuedRider = {
      passengerId: 'p',
      waitedS: 200,
      direction: 'up',
      destinationFloorId: 'F0',
      promisedCarId: undefined,
      band: 'long',
    };
    const queues: FloorQueue[] = between.rows.map((row) => ({
      floorId: row.floorId,
      riders: [rider],
      groups: [{ key: '', promisedCarId: undefined, riders: [rider], total: 1, oldestWaitS: 200 }],
      total: 1,
      oldestWaitS: 200,
      worstBand: 'long',
      recentlyBoarded: 0,
    }));

    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: { ...tall, floors: tall.floors.slice(0, 21) },
      frame: frame({
        landings: between.rows.map((row) => ({ floorId: row.floorId, waitingUp: 1, waitingDown: 0 })),
      }),
      layout: between,
      theme: DEFAULT_THEME,
      queues,
    });

    // One glyph per labelled row, a bar for every row — the thinned rows aggregate rather than
    // drawing a mark nothing on the screen identifies.
    const glyphs = ctx.calls.filter((call) => call.op === 'fillText' && call.args[0] === '●');
    expect(glyphs).toHaveLength(between.rows.filter((row) => row.labelled).length);
    expect(glyphs.length).toBeLessThan(between.rows.length);
  });
});

/* -------------------------------------------------------------------------- *
 * The bank-filter caption — SG-15 / RS-05
 * -------------------------------------------------------------------------- */

describe('the bank-filter caption', () => {
  /** The synthetic building grown a second bank, so a filter has something to hold back. */
  const twoBanks: VizRecording = {
    ...RECORDING,
    shafts: [shaft({}), shaft({ carId: 'aux-A', bankId: 'aux', label: 'B' })],
  };

  it('names the bank and counts shown of total when the layout was narrowed', () => {
    // The caller filtered the layout to `main`; RS-05 forbids the narrowing to pass in silence,
    // and the caption has to live on the canvas because Export PNG carries the canvas alone.
    const narrowed = buildLayout({
      width: 900,
      height: 640,
      floors: twoBanks.floors,
      shafts: twoBanks.shafts.filter((entry) => entry.bankId === 'main'),
    });
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: twoBanks,
      frame: frame(),
      layout: narrowed,
      theme: DEFAULT_THEME,
      filteredBankId: 'main',
    });
    const caption = ctx.calls.find(
      (call) => call.op === 'fillText' && String(call.args[0]).startsWith('bank '),
    );
    expect(caption?.args[0]).toBe('bank main — showing 1 of 2 shafts');
    // A selection's colour, not a warning's: the narrowing is the reader's own move.
    expect(caption?.args[3]).toBe(DEFAULT_THEME.highlight);
  });

  it('draws no caption when the layout holds the whole building', () => {
    const whole = buildLayout({
      width: 900,
      height: 640,
      floors: twoBanks.floors,
      shafts: twoBanks.shafts,
    });
    const ctx = new RecordingContext();
    drawScene(ctx, { recording: twoBanks, frame: frame(), layout: whole, theme: DEFAULT_THEME });
    expect(
      ctx.calls.some((call) => call.op === 'fillText' && String(call.args[0]).startsWith('bank ')),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * The resolved palette — `GAPS.md`'s *"the light palette repaints the shell and not the stage"*
 * -------------------------------------------------------------------------- */

describe('the stage is drawn in whichever palette was resolved', () => {
  /**
   * The gap this closes, stated once: `render/theme.ts` resolved twenty-seven custom properties
   * for the shell while this renderer held a module-level dark constant, so a reader on `light`
   * got a light shell around a dark stage. The fix is not a second renderer and not a `mode`
   * branch inside one — it is that `drawScene` takes the theme it is given, and the resolver now
   * has one to give. Which is testable here precisely because the theme is a *parameter*.
   */
  const stageFor = (choice: 'dark' | 'light'): Theme =>
    themeFor(choice, (query) => {
      throw new Error(`an explicit choice asked the probe "${query}"`);
    }).stage;

  /** Every colour a transcript actually painted with, by the argument each op records it in. */
  function coloursOf(ctx: RecordingContext): ReadonlySet<string> {
    const at: Readonly<Record<string, number>> = {
      fillRect: 4,
      strokeRect: 4,
      arc: 6,
      fill: 0,
      stroke: 0,
      fillText: 3,
    };
    const out = new Set<string>();
    for (const call of ctx.calls) {
      const index = at[call.op];
      if (index === undefined) continue;
      const value = call.args[index];
      if (typeof value === 'string' && value !== '') out.add(value);
    }
    return out;
  }

  /** The transcript with every colour argument dropped: the geometry, and nothing else. */
  function shapeOf(ctx: RecordingContext): string {
    const at: Readonly<Record<string, number>> = {
      fillRect: 4,
      strokeRect: 4,
      arc: 6,
      fill: 0,
      stroke: 0,
      fillText: 3,
    };
    return ctx.calls
      .map((call) => {
        const index = at[call.op];
        const args = index === undefined ? call.args : call.args.filter((_, i) => i !== index);
        return `${call.op}(${args.join(',')})`;
      })
      .join('\n');
  }

  function drawWith(theme: Theme): RecordingContext {
    const ctx = new RecordingContext();
    // 20:00, so the windows are lit and the night sky is the one being painted — the two stage
    // colours a light mode is most likely to get wrong, and the two `render/tokens.ts` argues
    // hardest about.
    drawScene(ctx, { recording: RECORDING, frame: frame({ simTimeS: 14 * 3600 }), layout, theme });
    return ctx;
  }

  it('draws the same picture in both modes — same marks, same places', () => {
    // A palette may not move a pixel. If this ever fails, the light mode has become a second
    // layout rather than a second palette, and every geometric assertion in this directory is
    // being made about only one of the two pictures the viewer can now draw.
    expect(shapeOf(drawWith(stageFor('light')))).toBe(shapeOf(drawWith(stageFor('dark'))));
  });

  it('shares no fill between the two modes — the stage repaints, whole', () => {
    // The gap, as an assertion. A partial repaint shows up here as a colour common to both
    // transcripts: it would be a mark still being drawn in the dark palette on a light page.
    const dark = coloursOf(drawWith(stageFor('dark')));
    const light = coloursOf(drawWith(stageFor('light')));
    expect(dark.size).toBeGreaterThan(10);
    expect([...dark].filter((colour) => light.has(colour))).toEqual([]);
  });

  it('keeps `DEFAULT_THEME` the dark default, so a caller that names no theme is where it was', () => {
    // The other half of the requirement: existing callers — `honesty/surfaces.ts`, the editor
    // preview, every test in this directory — hand no theme and must be unaffected.
    const named = new RecordingContext();
    drawScene(named, {
      recording: RECORDING,
      frame: frame({ simTimeS: 14 * 3600 }),
      layout,
      theme: DEFAULT_THEME,
    });
    const defaulted = new RecordingContext();
    drawScene(defaulted, { recording: RECORDING, frame: frame({ simTimeS: 14 * 3600 }), layout });
    expect(defaulted.transcript).toBe(named.transcript);
    expect(drawWith(stageFor('dark')).transcript).toBe(named.transcript);
  });

  it('lights its windows and paints its sky from the palette, not from a constant', () => {
    // The two stage claims `render/sky.ts` and the window pass read out of the theme rather than
    // out of a module-level default. Both were the shape of the original defect — a drawing
    // function reaching past its parameter — so both are checked on the light mode by value.
    const light = coloursOf(drawWith(stageFor('light')));
    expect(light.has(stageFor('light').windowNight)).toBe(true);
    expect(light.has(stageFor('dark').windowNight)).toBe(false);
    // The sky is painted as interpolated strips, so the ramp's own stops need not appear; what
    // must is that every strip lies between the light ramp's two stops rather than the dark one's.
    const skyStrips = [...light].filter((colour) => /^#[0-9a-f]{6}$/.test(colour));
    const luminance = (hex: string): number =>
      [1, 3, 5].reduce((sum, offset) => sum + parseInt(hex.slice(offset, offset + 2), 16), 0) / 3;
    const darkest = Math.min(...skyStrips.map(luminance));
    // The darkest hex fill on a light stage is still ink (`--text`, near-black); the *sky* strips
    // are the ones above 0x80, and on the dark stage there are none.
    expect(skyStrips.filter((colour) => luminance(colour) > 0x80).length).toBeGreaterThan(20);
    expect(darkest).toBeLessThan(0x80);

    /*
     * The negative control, and it is a *characterisation* rather than a count.
     *
     * It used to read `toBeLessThan(6)` — the number of bright hex fills the dark stage happened
     * to produce at the time — and § D235 raised three ink tokens past `0x80`, which turned it
     * red without anything about the sky changing. A bound that moves when an unrelated token
     * moves is measuring the wrong thing.
     *
     * What the claim actually is: on a dark stage the bright marks are all **ink and badges** —
     * values the theme itself declares — and none of them is a sky strip, because sky strips are
     * `render/sky.ts#mixHex` *interpolations* between two ramp stops and are equal to no named
     * token. So every bright fill is required to be a member of the theme's own values. That is
     * strictly stronger than the count it replaces: it would fail on one dark sky strip, which
     * `toBeLessThan(6)` would have accepted five of.
     */
    const named = new Set(
      Object.values(stageFor('dark')).flatMap((value) =>
        typeof value === 'string' ? [value] : Array.isArray(value) ? (value as string[]) : [],
      ),
    );
    const strayBright = [...coloursOf(drawWith(stageFor('dark')))].filter(
      (colour) => /^#[0-9a-f]{6}$/.test(colour) && luminance(colour) > 0x80 && !named.has(colour),
    );
    expect(strayBright, 'a bright fill on the dark stage that no token declares').toEqual([]);
  });
});
