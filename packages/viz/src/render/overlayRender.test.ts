/**
 * Everything wave 2 draws, asserted against a recomputation rather than a literal.
 *
 * ## The defect this file exists to prevent
 *
 * `frameAt.test.ts` records that **seven of `frameCar`'s eight fields could be replaced by
 * constants** without the package's suite noticing: each sampler was unit-tested, and *the frame
 * calling the sampler* was owned by nobody. The overlay is the same shape of risk one layer up —
 * `overlay.test.ts` proves `overlayAt` computes the right numbers, and proves nothing at all
 * about the panel drawing them.
 *
 * So every assertion below takes the form "the transcript contains the value **recomputed from
 * the input**". Replacing any rendered value with a constant then fails, because the expectation
 * is derived rather than written down. The mutation table in the delivery report is the
 * experiment that shows it does.
 */

import { describe, expect, it } from 'vitest';

import { FIXTURE_DOOR_CONFIG, fixtureSummary } from '../fixtures.test-helper.js';
import { constantSeries } from '../contract/series.js';
import {
  VIZ_SCHEMA_VERSION,
  type DoorPhase,
  type Frame,
  type VizLeg,
  type VizRecording,
} from '../contract/types.js';
import { overlayAt, type LandingAssignment } from '../frame/overlay.js';
import {
  DEFAULT_THEME,
  describeSelection,
  landingOptionLabel,
  doorGlyph,
  drawScene,
  fitLabel,
  type Canvas2DLike,
} from './canvas.js';
import { buildLayout } from './layout.js';
import { LOAD_ALARM, LOAD_FULL, loadColour, loadTrackMax } from './overlay.js';

/* -------------------------------------------------------------------------- *
 * A recording 2D context
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

  /** Every string that reached `fillText`, in order. */
  get texts(): readonly string[] {
    return this.calls.filter((call) => call.op === 'fillText').map((call) => String(call.args[0]));
  }
}

/* -------------------------------------------------------------------------- *
 * A synthetic recording with real legs
 * -------------------------------------------------------------------------- */

const LEGS: readonly VizLeg[] = [
  { passengerId: 'p1', originFloorId: 'G', destinationFloorId: '2', direction: 'up', arrivedAt: 10, boardedAt: 22, carId: 'main-A', bankId: 'main' },
  { passengerId: 'p2', originFloorId: 'G', destinationFloorId: '3', direction: 'up', arrivedAt: 12, boardedAt: 40, carId: 'main-B', bankId: 'main' },
  { passengerId: 'p3', originFloorId: '2', destinationFloorId: 'G', direction: 'down', arrivedAt: 30, boardedAt: 75, carId: 'high-A', bankId: 'high' },
  { passengerId: 'p4', originFloorId: '3', destinationFloorId: 'G', direction: 'down', arrivedAt: 50 },
  { passengerId: 'p5', originFloorId: '3', destinationFloorId: 'G', direction: 'down', arrivedAt: 55, boardedAt: 500, carId: 'high-A', bankId: 'high' },
];

function shaft(carId: string, bankId: string, label: string): VizRecording['shafts'][number] {
  return {
    carId,
    bankId,
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
  endedAt: 600,
  floors: [
    { id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
    { id: '2', index: 1, heightM: 3, isEntrance: false, isTransferFloor: true, population: 20 },
    { id: '3', index: 2, heightM: 6, isEntrance: false, isTransferFloor: false, population: 20 },
  ],
  shafts: [shaft('main-A', 'main', 'A'), shaft('main-B', 'main', 'B'), shaft('high-A', 'high', 'A')],
  landings: [],
  legs: LEGS,
  progress: {
    waiting: constantSeries(0),
    boardedLegs: constantSeries(0),
    meanWaitS: constantSeries(0),
  },
  summary: fixtureSummary({ generated: 5, delivered: 4, undelivered: 1 }),
  warnings: [],
};

function car(overrides: Partial<Frame['cars'][number]> = {}): Frame['cars'][number] {
  return {
    carId: 'main-A',
    bankId: 'main',
    label: 'A',
    heightM: 1.5,
    floorId: 'G',
    direction: 0,
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
    simTimeS: 100,
    cars: [car(), car({ carId: 'main-B', label: 'B', loadFactor: 0.85 }), car({ carId: 'high-A', label: 'A', loadFactor: 1.2 })],
    landings: RECORDING.floors.map((floor) => ({ floorId: floor.id, waitingUp: 0, waitingDown: 0 })),
    totalWaiting: 2,
    boardedLegs: 3,
    runningMeanWaitS: 25,
    ...overrides,
  };
}

const WIDE = { width: 1200, height: 700 } as const;

function layoutFor(recording: VizRecording, overlayWidthPx = 250): ReturnType<typeof buildLayout> {
  return buildLayout({
    ...WIDE,
    floors: recording.floors,
    shafts: recording.shafts,
    overlayWidthPx,
  });
}

function draw(
  f: Frame,
  recording: VizRecording = RECORDING,
  extra: Partial<Parameters<typeof drawScene>[1]> = {},
): RecordingContext {
  const ctx = new RecordingContext();
  drawScene(ctx, {
    recording,
    frame: f,
    layout: layoutFor(recording),
    theme: DEFAULT_THEME,
    ...extra,
  });
  return ctx;
}

/* -------------------------------------------------------------------------- *
 * The overlay panel
 * -------------------------------------------------------------------------- */

describe('the live metrics panel draws the metrics it was given', () => {
  const at = 100;
  const metrics = overlayAt(RECORDING, at);

  it('draws every observation, each recomputed from the recording rather than pinned', () => {
    const ctx = draw(frame({ simTimeS: at }), RECORDING, { overlay: metrics });
    const text = ctx.texts.join('\n');

    // Recomputed here, from the legs, without going through `overlayAt`: two independent
    // routes to the same number, so a constant in either one fails.
    const waitingNow = LEGS.filter(
      (leg) => leg.arrivedAt <= at && (leg.boardedAt === undefined || leg.boardedAt > at),
    ).length;
    const longest = Math.max(
      ...LEGS.filter(
        (leg) => leg.arrivedAt <= at && (leg.boardedAt === undefined || leg.boardedAt > at),
      ).map((leg) => at - leg.arrivedAt),
    );
    const boarded = LEGS.filter(
      (leg) => leg.boardedAt !== undefined && leg.boardedAt <= at && leg.boardedAt >= at - metrics.windowS,
    ).length;

    expect(text).toContain(`waiting now      ${String(waitingNow)}`);
    expect(text).toContain(`longest wait     ${longest.toFixed(0)} s`);
    expect(text).toContain(`boarded (window) ${String(boarded)} legs`);
  });

  it('draws the rolling mean, and it moves when the legs move', () => {
    const ctx = draw(frame({ simTimeS: at }), RECORDING, { overlay: metrics });
    expect(metrics.rollingMeanWaitS).toBeDefined();
    expect(ctx.texts.join('\n')).toContain(`${(metrics.rollingMeanWaitS ?? 0).toFixed(1)} s`);

    // Shift every wait by ten seconds and the panel must say something different.
    const shifted: VizRecording = {
      ...RECORDING,
      legs: LEGS.map((leg) => ({ ...leg, arrivedAt: Math.max(0, leg.arrivedAt - 10) })),
    };
    const shiftedMetrics = overlayAt(shifted, at);
    const after = draw(frame({ simTimeS: at }), shifted, { overlay: shiftedMetrics });
    expect(after.texts.join('\n')).not.toBe(ctx.texts.join('\n'));
  });

  it('names every bank that served somebody, with its own count and mean', () => {
    const ctx = draw(frame({ simTimeS: at }), RECORDING, { overlay: metrics });
    const text = ctx.texts.join('\n');
    expect(metrics.banks.length).toBeGreaterThan(0);
    for (const bank of metrics.banks) {
      expect(text).toContain(
        `${bank.bankId}  ${String(bank.boardedInWindow)} legs  ${(bank.meanWaitS ?? 0).toFixed(1)} s`,
      );
    }
  });

  it('replaces the estimate with its reason on a saturated run, and keeps the observations', () => {
    const saturated: VizRecording = {
      ...RECORDING,
      summary: {
        ...RECORDING.summary,
        saturated: true,
        awtIsValid: false,
        awtInvalidReason: 'queue length rose by 41 persons over the reporting window',
      },
    };
    const ctx = draw(frame({ simTimeS: at }), saturated, { overlay: overlayAt(saturated, at) });
    const text = ctx.texts.join('\n');

    expect(text).toContain('SUPPRESSED');
    expect(text).toContain('queue length rose by 41 persons');
    // The observations survive — a reader must still see the queue that is diverging.
    expect(text).toContain('waiting now');
    expect(text).toContain('boarded (window)');
    // And no mean appears anywhere in the panel.
    const clean = draw(frame({ simTimeS: at }), RECORDING, { overlay: metrics });
    const cleanMean = (metrics.rollingMeanWaitS ?? 0).toFixed(1);
    expect(clean.texts.join('\n')).toContain(`${cleanMean} s`);
    expect(text).not.toContain(`${cleanMean} s`);
    expect(text).toContain('suppressed');
  });

  it('never draws below the panel it was given, and says what it left out', () => {
    // Found by running the viewer on `vertical-city` (seven banks, 35 cars): the bank list ran
    // past the bottom edge and the CAR LOAD section — the one carrying the overload alarm — was
    // drawn off-screen entirely.
    const manyBanks: VizRecording = {
      ...RECORDING,
      legs: Array.from({ length: 40 }, (_, index) => ({
        passengerId: `q${String(index)}`,
        originFloorId: 'G',
        destinationFloorId: '3',
        direction: 'up' as const,
        arrivedAt: 10 + index,
        boardedAt: 20 + index,
        carId: `bank-${String(index % 12)}-A`,
        bankId: `bank-${String(index % 12)}`,
      })),
    };
    // A short viewport as well as a long list, so both sections are genuinely over budget.
    const layout = buildLayout({
      width: 1200,
      height: 340,
      floors: manyBanks.floors,
      shafts: manyBanks.shafts,
      overlayWidthPx: 250,
    });
    const panel = layout.overlay;
    if (panel === undefined) throw new Error('expected a panel');
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: manyBanks,
      frame: frame({
        cars: Array.from({ length: 35 }, (_, index) =>
          car({ carId: `c${String(index)}`, label: `c${String(index)}` }),
        ),
      }),
      layout,
      theme: DEFAULT_THEME,
      overlay: overlayAt(manyBanks, at),
    });

    const inPanel = ctx.calls.filter(
      (call) => call.op === 'fillText' && Number(call.args[1]) >= panel.x,
    );
    expect(inPanel.length).toBeGreaterThan(5);
    for (const call of inPanel) {
      expect(Number(call.args[2])).toBeLessThanOrEqual(panel.y + panel.height);
    }
    const text = ctx.texts.join('\n');
    // Both sections account for what they hold: either "showing N of M" with N ≥ 1, or the
    // collapsed "M — no room at this size" line. Never "showing 0 of M", which is two lines that
    // say nothing and read as a bug — that is what an earlier version of this rule produced on
    // Mixed-Use High-Rise, and it hid the overload alarm entirely.
    expect(text).toMatch(/(showing [1-9]\d* of 12 banks|12 banks — no room here)/);
    expect(text).toMatch(/(showing [1-9]\d* of 35 cars|35 cars — no room here)/);
    expect(text).not.toMatch(/showing 0 of/);
  });

  it('always leaves room for the car-load rows, however many banks there are', () => {
    // The measured regression: three banks plus a four-line suppression reason left the car
    // section with no rows at all on a 400 px canvas.
    const legs = Array.from({ length: 30 }, (_, index) => ({
      passengerId: `q${String(index)}`,
      originFloorId: 'G',
      destinationFloorId: '3',
      direction: 'up' as const,
      arrivedAt: 10 + index,
      boardedAt: 20 + index,
      carId: `bank-${String(index % 3)}-A`,
      bankId: `bank-${String(index % 3)}`,
    }));
    const saturated: VizRecording = {
      ...RECORDING,
      legs,
      summary: {
        ...RECORDING.summary,
        saturated: true,
        awtIsValid: false,
        awtInvalidReason:
          'Queue length rose by 95.9 persons (19.18/min, 13.2x the queue own scatter) over the ' +
          '300 s reporting window, against thresholds 8 persons and 0.5/min; the system is ' +
          'saturated, AWT is not approximately normal and its confidence interval must be ' +
          'suppressed.',
      },
    };
    const layout = buildLayout({
      width: 1200,
      height: 420,
      floors: saturated.floors,
      shafts: saturated.shafts,
      overlayWidthPx: 250,
    });
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: saturated,
      frame: frame({
        cars: Array.from({ length: 16 }, (_, index) =>
          car({ carId: `c${String(index)}`, label: `c${String(index)}`, loadFactor: 0.1 * index }),
        ),
      }),
      layout,
      theme: DEFAULT_THEME,
      overlay: overlayAt(saturated, at),
    });
    const text = ctx.texts.join('\n');
    expect(text).toContain('CAR LOAD');
    expect(text).not.toMatch(/showing 0 of \d+ cars/);
    // At least the reserved rows were drawn, each carrying its own load factor.
    expect(ctx.texts.filter((t) => /^\d\.\d\d$/.test(t)).length).toBeGreaterThanOrEqual(4);
  });

  it('counts the banks it left out when some but not all of them fit', () => {
    // The mutation harness found this line untested: the 12-bank case above takes the *collapsed*
    // path, so "showing N of M banks" itself had no cover. A tall panel with thirty banks is the
    // shape that exercises it.
    const many: VizRecording = {
      ...RECORDING,
      legs: Array.from({ length: 60 }, (_, index) => ({
        passengerId: `r${String(index)}`,
        originFloorId: 'G',
        destinationFloorId: '3',
        direction: 'up' as const,
        arrivedAt: 10 + index,
        boardedAt: 20 + index,
        carId: `bank-${String(index % 30)}-A`,
        bankId: `bank-${String(index % 30).padStart(2, '0')}`,
      })),
    };
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: many,
      frame: frame(),
      layout: layoutFor(many, 250),
      theme: DEFAULT_THEME,
      overlay: overlayAt(many, at),
    });
    const text = ctx.texts.join('\n');
    const shown = ctx.texts.filter((t) => t.startsWith('bank-')).length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(30);
    expect(text).toContain(`showing ${String(shown)} of 30 banks`);
  });

  it('draws nothing at all when the panel is too short for its mandatory content', () => {
    // Below `MIN_PANEL_HEIGHT_PX` the title, the window, the three observations and the estimate
    // block do not fit, and squeezing them draws over the bottom edge. Same answer as RS-03 gives
    // a narrow viewport: no panel, and the header counters carry the headline numbers.
    const layout = buildLayout({
      width: 1200,
      height: 240,
      floors: RECORDING.floors,
      shafts: RECORDING.shafts,
      overlayWidthPx: 250,
    });
    expect(layout.overlay).toBeDefined();
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: RECORDING,
      frame: frame(),
      layout,
      theme: DEFAULT_THEME,
      overlay: metrics,
    });
    expect(ctx.texts.join('\n')).not.toContain('LIVE METRICS');
  });

  it('draws no panel at all when the layout reserved no room — RS-03', () => {
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: RECORDING,
      frame: frame(),
      layout: layoutFor(RECORDING, 0),
      theme: DEFAULT_THEME,
      overlay: metrics,
    });
    expect(ctx.texts.join('\n')).not.toContain('LIVE METRICS');
  });

  it('draws no panel when no metrics were given', () => {
    expect(draw(frame()).texts.join('\n')).not.toContain('LIVE METRICS');
  });
});

/* -------------------------------------------------------------------------- *
 * RV-14 / KB-15b — the load bar and the overload alarm
 * -------------------------------------------------------------------------- */

describe('car load — RV-14', () => {
  const metrics = overlayAt(RECORDING, 100);

  it('scales the track past 1 so an overloaded car does not clip at full', () => {
    const cars = [car({ loadFactor: 1.3 })];
    expect(loadTrackMax(cars)).toBeCloseTo(1.3, 9);
    // And a fleet under the alarm still leaves the alarm inside the track, so the full mark is
    // never at the very end of the bar.
    expect(loadTrackMax([car({ loadFactor: 0.2 })])).toBe(LOAD_ALARM);
  });

  it('draws each car’s load factor as a number, recomputed from the frame', () => {
    const f = frame();
    const ctx = draw(f, RECORDING, { overlay: metrics });
    const text = ctx.texts.join('\n');
    for (const each of f.cars) {
      expect(text).toContain(each.loadFactor.toFixed(2));
    }
  });

  it('labels an overloaded car with a glyph, not only a colour — KB-15b', () => {
    const overloaded = frame({ cars: [car({ loadFactor: LOAD_ALARM })] });
    const ctx = draw(overloaded, RECORDING, { overlay: metrics });
    expect(ctx.texts).toContain('!');
    expect(ctx.texts.join('\n')).toContain(`${LOAD_ALARM.toFixed(2)} !`);

    const full = frame({ cars: [car({ loadFactor: LOAD_FULL })] });
    const quiet = draw(full, RECORDING, { overlay: metrics });
    expect(quiet.texts).not.toContain('!');
  });

  it('uses four bands, with the alarm and the fill rule at different thresholds — D18', () => {
    expect(loadColour(0.2, DEFAULT_THEME)).toBe(DEFAULT_THEME.carLight);
    expect(loadColour(0.6, DEFAULT_THEME)).toBe(DEFAULT_THEME.car);
    expect(loadColour(LOAD_FULL, DEFAULT_THEME)).toBe(DEFAULT_THEME.carHeavy);
    expect(loadColour(LOAD_ALARM, DEFAULT_THEME)).toBe(DEFAULT_THEME.carOverload);
    // The complaint D18 recorded: the alarm colour fired at 0.8, which is the fill rule.
    expect(loadColour(0.8, DEFAULT_THEME)).not.toBe(DEFAULT_THEME.carOverload);
  });
});

/* -------------------------------------------------------------------------- *
 * KB-15a — door state carries a glyph
 * -------------------------------------------------------------------------- */

describe('door state — KB-15a', () => {
  it('gives each of the four phases a distinct glyph', () => {
    const phases: readonly DoorPhase[] = ['closed', 'opening', 'open', 'closing'];
    const glyphs = phases.map(doorGlyph);
    expect(new Set(glyphs).size).toBe(4);
  });

  it('draws the glyph for the phase the frame carries', () => {
    for (const phase of ['closed', 'opening', 'open', 'closing'] as const) {
      const ctx = draw(frame({ cars: [car({ doorPhase: phase, doorFraction: 0.5 })] }));
      expect(ctx.texts).toContain(doorGlyph(phase));
    }
  });

  it('draws a different glyph for a different phase at the same gap width', () => {
    // Opening and closing are the same fraction and differ only by state, which is exactly the
    // pair a fill-width-only signal cannot distinguish.
    const opening = draw(frame({ cars: [car({ doorPhase: 'opening', doorFraction: 0.5 })] }));
    const closing = draw(frame({ cars: [car({ doorPhase: 'closing', doorFraction: 0.5 })] }));
    expect(opening.transcript).not.toBe(closing.transcript);
  });
});

/* -------------------------------------------------------------------------- *
 * RV-T3 — the selected landing and its assignment
 * -------------------------------------------------------------------------- */

describe('landing selection — RV-T3', () => {
  it('names the assigned car and how long until it arrives', () => {
    const selection = {
      floorId: '3',
      answeredByCarId: 'high-A',
      answeredInS: 400,
      waiting: 2,
      oldestWaitS: 50,
    };
    const ctx = draw(frame(), RECORDING, { selection });
    const text = ctx.texts.join('\n');
    expect(text).toContain(describeSelection(selection));
    expect(text).toContain('high-A');
    expect(text).toContain('400 s');
  });

  it('says unassigned when the record never answered the call — RV-08', () => {
    const selection = { floorId: '3', waiting: 1, oldestWaitS: 50 };
    expect(describeSelection(selection)).toContain('unassigned');
    expect(draw(frame(), RECORDING, { selection }).texts.join('\n')).toContain('unassigned');
  });

  it('distinguishes "nobody waiting" from "nobody answered"', () => {
    // Found by driving the viewer: scrubbing to the end of a *completed* run and selecting a
    // landing produced "unassigned — no car answered this call in this run" about a landing that
    // simply had nobody at it. That is a claim about the dispatcher, and it was false.
    expect(describeSelection({ floorId: '3', waiting: 0 })).toContain('nobody is waiting');
    expect(describeSelection({ floorId: '3', waiting: 0 })).not.toContain('unassigned');
    expect(describeSelection({ floorId: '3', waiting: 2 })).toContain('unassigned');
  });

  it('outlines the assigned car’s shaft, and only when one is named', () => {
    const outlined = draw(frame(), RECORDING, {
      selection: { floorId: '3', answeredByCarId: 'high-A' },
    });
    const bare = draw(frame(), RECORDING, { selection: { floorId: '3' } });
    const highlights = (ctx: RecordingContext): number =>
      ctx.calls.filter(
        (call) => call.op === 'strokeRect' && call.args[4] === DEFAULT_THEME.highlight,
      ).length;
    expect(highlights(outlined)).toBe(1);
    expect(highlights(bare)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Version 4 — the landing panel, drawn
 *
 * Every value added here is checked against a *different* value in the same fixture, so a field
 * replaced by a constant changes the assertion's answer rather than merely its wording. That is
 * the discipline `frameAt.test.ts` records at length after seven of eight frame-car mutants
 * survived the suite.
 * -------------------------------------------------------------------------- */

describe('a selected destination call — version 4', () => {
  const promised = {
    floorId: '3',
    destinationFloorId: '12',
    promisedCarId: 'high-A',
    answeredByCarId: 'high-A',
    answeredInS: 400,
    waiting: 2,
    oldestWaitS: 50,
  };

  it('says where the call is going and which car the panel named', () => {
    const text = describeSelection(promised);
    // The destination is read from `destinationFloorId`, not from `floorId`: a constant, or the
    // origin repeated, fails both halves.
    expect(text).toContain('floor 3 → 12');
    expect(text).not.toContain('floor 3 → 3');
    expect(text).toContain('panel promised car high-A');
    expect(text).toContain('2 waiting');
    expect(text).toContain('50 s');
    expect(text).toContain('boards in 400 s');
    // …and it is drawn, not merely computed.
    expect(draw(frame(), RECORDING, { selection: promised }).texts.join('\n')).toContain(text);
  });

  it('never calls a promised passenger an unanswered call — the version-3 falsehood', () => {
    /*
     * A passenger the panel promised a car, still standing when the horizon closed. Version 3
     * had no field for the promise, so `answeredByCarId === undefined` was the only signal and
     * the caption read "unassigned — no car answered this call in this run". Under a landing
     * panel that is a dispatcher failure being reported where none happened. Measured reachable:
     * Vertical City at 20 % pop/5 min, seed 20260727, 25 such legs.
     */
    const stranded = { ...promised, answeredByCarId: undefined, answeredInS: undefined };
    const text = describeSelection(stranded);
    expect(text).toContain('panel promised car high-A');
    expect(text).toContain('still waiting when the run ended');
    expect(text).not.toContain('unassigned');
    // The conventional reading is untouched: with no promise, the same shape still reads RV-08.
    expect(describeSelection({ ...stranded, promisedCarId: undefined, destinationFloorId: undefined }))
      .toContain('unassigned');
  });

  it('outlines the promised shaft, not the one that happened to answer', () => {
    // `promisedCarId` and `answeredByCarId` are deliberately different cars here. A renderer
    // still boxing `answeredByCarId` would outline `main-A`; there is exactly one highlight, so
    // the two cannot both be drawn and the assertion discriminates.
    const disagreeing = { ...promised, promisedCarId: 'high-A', answeredByCarId: 'main-A' };
    const ctx = draw(frame(), RECORDING, { selection: disagreeing });
    const highlightRects = ctx.calls.filter(
      (call) => call.op === 'strokeRect' && call.args[4] === DEFAULT_THEME.highlight,
    );
    expect(highlightRects.length).toBe(1);
    const layout = layoutFor(RECORDING);
    const highA = layout.columns.find((column) => column.carId === 'high-A');
    const mainA = layout.columns.find((column) => column.carId === 'main-A');
    expect(highA?.x).not.toBe(mainA?.x);
    expect(highlightRects[0]?.args[0]).toBe(highA?.x);
  });

  it('labels a landing option by the call, not by the floor', () => {
    const panelRow: LandingAssignment = {
      key: '3 up 12 high-A',
      floorId: '3',
      direction: 'up',
      destinationFloorId: '12',
      promisedCarId: 'high-A',
      waiting: 2,
      oldestWaitS: 50,
      answeredByCarId: undefined,
      answeredByBankId: undefined,
      answeredInS: undefined,
    };
    expect(landingOptionLabel(panelRow)).toBe('3 → 12 — 2 waiting → high-A');
    // Conventional: the direction is the identity and the outcome is what there is to show.
    const plain: LandingAssignment = {
      ...panelRow,
      key: '3 up',
      destinationFloorId: undefined,
      promisedCarId: undefined,
      answeredByCarId: 'main-A',
    };
    expect(landingOptionLabel(plain)).toBe('3 up — 2 waiting → main-A');
    expect(landingOptionLabel({ ...plain, answeredByCarId: undefined })).toBe(
      '3 up — 2 waiting (unassigned)',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * RV-07 / RV-08 / RV-09 / RS-05
 * -------------------------------------------------------------------------- */

describe('floor rows', () => {
  it('badges the entrance and the sky lobby with glyphs, not colours alone — RV-07', () => {
    const ctx = draw(frame());
    expect(ctx.texts).toContain('⌂ G');
    expect(ctx.texts).toContain('⇄ 2');
  });

  it('labels the bank above each shaft when there is more than one — RV-06', () => {
    const ctx = draw(frame());
    expect(new Set(RECORDING.shafts.map((s) => s.bankId)).size).toBeGreaterThan(1);
    expect(ctx.texts).toContain('main');
    expect(ctx.texts).toContain('high');

    // …and not on a single-bank building, where repeating one name over every column is noise.
    const oneBank: VizRecording = {
      ...RECORDING,
      shafts: RECORDING.shafts.map((s) => ({ ...s, bankId: 'main' })),
    };
    const single = new RecordingContext();
    drawScene(single, {
      recording: oneBank,
      frame: frame(),
      layout: layoutFor(oneBank),
      theme: DEFAULT_THEME,
    });
    expect(single.texts).not.toContain('main');
  });

  it('clips a column header to its column — RV-06 at sixteen shafts', () => {
    // Found by running the viewer on Mixed-Use High-Rise: sixteen shafts give each column about
    // 30 px, and `shuttle` / `office-low` ran into their neighbours into an unreadable band.
    const many = Array.from({ length: 16 }, (_, index) => ({
      ...(RECORDING.shafts[0] as VizRecording['shafts'][number]),
      carId: `c${String(index)}`,
      bankId: index < 8 ? 'shuttle-express' : 'office-low-rise',
      label: `car-number-${String(index)}`,
    }));
    const wide: VizRecording = { ...RECORDING, shafts: many };
    const layout = layoutFor(wide, 250);
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: wide,
      frame: frame({ cars: [] }),
      layout,
      theme: DEFAULT_THEME,
    });
    const headers = ctx.texts.filter(
      (text) => text.startsWith('car-') || text.startsWith('shuttle') || text.startsWith('office'),
    );
    expect(headers.length).toBeGreaterThan(0);
    const columnWidth = layout.columns[0]?.width ?? 0;
    for (const text of headers) {
      expect(text.length * 7.2).toBeLessThanOrEqual(columnWidth);
    }
  });

  it('marks a floor no shaft serves as unassignable — RV-08', () => {
    const ctx = draw(frame(), RECORDING, { unservedFloorIds: ['3'] });
    expect(ctx.texts).toContain('3 ⊘');
    expect(draw(frame()).texts).toContain('3');
  });

  it('thins labels rather than rows on a tall building — RV-09', () => {
    const floors = Array.from({ length: 60 }, (_, index) => ({
      id: String(index),
      index,
      heightM: index * 3.2,
      isEntrance: index === 0,
      isTransferFloor: index === 30,
      population: 20,
    }));
    const tall = buildLayout({ width: 1200, height: 700, floors, shafts: RECORDING.shafts });
    expect(tall.rows).toHaveLength(60);
    const labelled = tall.rows.filter((row) => row.labelled);
    expect(labelled.length).toBeLessThan(60);
    expect(labelled.length).toBeGreaterThan(0);
    // The two the reader orients by are never among the thinned.
    expect(tall.rows[0]?.labelled).toBe(true);
    expect(tall.rows[30]?.labelled).toBe(true);
    expect(tall.rows[59]?.labelled).toBe(true);

    // A short building thins nothing.
    const short = buildLayout({ ...WIDE, floors: RECORDING.floors, shafts: RECORDING.shafts });
    expect(short.rows.every((row) => row.labelled)).toBe(true);
  });

  it('never labels two rows closer together than a line box — RV-09', () => {
    // Found by running the viewer: `vertical-city` has several sky lobbies, every one of which is
    // force-labelled, and the first thinning rule added them back *on top of* strided neighbours.
    const floors = Array.from({ length: 62 }, (_, index) => ({
      id: String(index),
      index,
      heightM: index * 3.2,
      isEntrance: index === 0,
      // Transfer floors deliberately placed off the stride, which is what caused the collision.
      isTransferFloor: index === 15 || index === 31 || index === 47,
      population: 20,
    }));
    const tall = buildLayout({ width: 1200, height: 700, floors, shafts: RECORDING.shafts });
    const labelled = tall.rows.filter((row) => row.labelled);
    const collisions: string[] = [];
    for (let i = 1; i < labelled.length; i += 1) {
      const gap = Math.abs((labelled[i]?.y ?? 0) - (labelled[i - 1]?.y ?? 0));
      // Two *reference* floors may still sit adjacent — a sky lobby directly above the entrance
      // is a real building, and neither may be dropped. Everything else must have room.
      const bothForced =
        (labelled[i]?.isEntrance === true || labelled[i]?.isTransferFloor === true) &&
        (labelled[i - 1]?.isEntrance === true || labelled[i - 1]?.isTransferFloor === true);
      if (gap < 14 && !bothForced) {
        collisions.push(`${labelled[i - 1]?.floorId ?? '?'} / ${labelled[i]?.floorId ?? '?'} at ${gap.toFixed(1)} px`);
      }
    }
    expect(collisions).toEqual([]);
    // …and the sky lobbies are still labelled, which is what made the collision possible.
    for (const index of [15, 31, 47]) expect(tall.rows[index]?.labelled).toBe(true);
  });

  it('clips a long floor label into the gutter instead of off the canvas — RV-09', () => {
    // Also found by running the viewer: `vertical-city` labels floors `Zone 5 hotel`, which is
    // wider than the 72 px gutter, and right-aligned text loses its *start* when it overflows.
    expect(fitLabel('Zone 5 hotel', 200)).toBe('Zone 5 hotel');
    expect(fitLabel('Zone 5 hotel', 40).length).toBeLessThan('Zone 5 hotel'.length);
    expect(fitLabel('Zone 5 hotel', 40).endsWith('…')).toBe(true);
    expect(fitLabel('Zone 5 hotel', 40).startsWith('Zon')).toBe(true);
    expect(fitLabel('X', 1)).toBe('X');

    const longLabels = RECORDING.floors.map((floor) => ({
      ...floor,
      label: 'A very long floor label indeed',
    }));
    const ctx = new RecordingContext();
    const layout = buildLayout({ ...WIDE, floors: longLabels, shafts: RECORDING.shafts });
    drawScene(ctx, {
      recording: { ...RECORDING, floors: longLabels },
      frame: frame(),
      layout,
      theme: DEFAULT_THEME,
    });
    const drawn = ctx.calls.filter(
      (call) => call.op === 'fillText' && String(call.args[0]).replace(/^[⌂⇄] /, '').startsWith('A very'),
    );
    expect(drawn.length).toBe(RECORDING.floors.length);
    for (const call of drawn) {
      const text = String(call.args[0]);
      expect(text.endsWith('…')).toBe(true);
      // The text is right-aligned at `plot.x - 8`, so its left edge is that minus its width, and
      // that edge must be on the canvas.
      expect(Number(call.args[1]) - text.length * 7.2).toBeGreaterThanOrEqual(0);
    }
  });

  it('says how many shafts it is showing rather than truncating — RS-05', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      carId: `c${String(index)}`,
      bankId: 'main',
      label: String(index),
      servedFloorIds: ['G', '2', '3'],
    }));
    const cramped = buildLayout({ width: 700, height: 600, floors: RECORDING.floors, shafts: many });
    expect(cramped.hiddenShaftCount).toBeGreaterThan(0);
    expect(cramped.columns.length + cramped.hiddenShaftCount).toBe(40);

    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: { ...RECORDING, shafts: RECORDING.shafts },
      frame: frame(),
      layout: cramped,
      theme: DEFAULT_THEME,
    });
    expect(ctx.texts.join('\n')).toContain(
      `showing ${String(cramped.columns.length)} of 40 shafts`,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * RV-16 — a run that did not finish is never drawn as one that did
 * -------------------------------------------------------------------------- */

describe('the run status banner — RV-16', () => {
  it('leads with the status and the undelivered count', () => {
    const timedOut: VizRecording = {
      ...RECORDING,
      status: 'timed-out',
      summary: { ...RECORDING.summary, undelivered: 69 },
    };
    const text = draw(frame(), timedOut).texts.join('\n');
    expect(text).toContain('TIMED-OUT — 69 undelivered');
    expect(draw(frame()).texts.join('\n')).not.toContain('TIMED-OUT');
  });

  it('shows both the status and the suppression when both apply', () => {
    const both: VizRecording = {
      ...RECORDING,
      status: 'timed-out',
      summary: { ...RECORDING.summary, undelivered: 12, saturated: true, awtIsValid: false },
    };
    const text = draw(frame(), both).texts.join('\n');
    expect(text).toContain('TIMED-OUT — 12 undelivered');
    expect(text).toContain('SATURATED — AWT suppressed');
  });
});

/* -------------------------------------------------------------------------- *
 * The layout's new geometry
 * -------------------------------------------------------------------------- */

describe('the overlay never overlaps the plot', () => {
  it('reserves its width from the plot rather than drawing on top of it', () => {
    const withPanel = layoutFor(RECORDING, 250);
    const withoutPanel = layoutFor(RECORDING, 0);
    expect(withoutPanel.overlay).toBeUndefined();
    expect(withPanel.overlay).toBeDefined();
    expect(withPanel.plot.width).toBe(withoutPanel.plot.width - 250);
    const panel = withPanel.overlay;
    if (panel === undefined) throw new Error('expected a panel');
    expect(panel.x).toBeGreaterThanOrEqual(withPanel.plot.x + withPanel.plot.width);
    expect(panel.x + panel.width).toBeLessThanOrEqual(withPanel.width);
  });
});
