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
  CASUAL_REFUSAL_REASON,
  CASUAL_REFUSAL_REASON_SO_FAR,
  SUPPRESSION_REASON_PENDING,
} from '../mode/disclosure.js';
import {
  DEFAULT_THEME,
  describeSelection,
  landingOptionLabel,
  doorGlyph,
  drawScene,
  fitLabel,
  type Canvas2DLike,
} from './canvas.js';
import { MIN_HEADER_PX, buildLayout } from './layout.js';
import {
  CASUAL_WORDS,
  ENGINEER_WORDS,
  LOAD_ALARM,
  LOAD_FULL,
  loadColour,
  loadTone,
  loadTrackMax,
  overlayViewOf,
  type OverlayView,
} from './overlay.js';

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
  // The four `Canvas2DLike` gained with the design handoff's stage. Recorded rather than
  // swallowed, so a mark this panel draws with a path is as visible to a test as a `fillRect`.
  closePath(): void {
    this.#push('closePath');
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
  // Version 7. Empty is the legal value for a fixture that exercises none of the three:
  // the timeline draws one unlabelled band, the decision log draws its empty state, and
  // no shaft is dark. See `contract/types.ts`.
  demandPhases: [],
  decisions: [],
  outOfServiceCarIds: [],
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

function layoutFor(recording: VizRecording): ReturnType<typeof buildLayout> {
  return buildLayout({
    ...WIDE,
    floors: recording.floors,
    shafts: recording.shafts,
  });
}

/**
 * The fixture with a refused mean — `core`'s own prose, verbatim.
 *
 * One helper rather than the three copies the drawn panel's suites each kept: the reason string is
 * the thing being asserted about in half of them, and three transcriptions of one sentence is the
 * shape this repository keeps finding stale.
 */
function saturatedRecording(): VizRecording {
  return {
    ...RECORDING,
    summary: {
      ...RECORDING.summary,
      saturated: true,
      awtIsValid: false,
      awtInvalidReason:
        'Queue length rose by 268.0 persons (53.59/min, 12.0x the queue’s own scatter) over the ' +
        '300 s reporting window, against thresholds 8 persons and 0.5/min; the system is ' +
        'saturated, AWT is not approximately normal and its confidence interval must be ' +
        'suppressed.',
    },
  };
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
 * The live metrics view — `docs/21` § 3.4
 * -------------------------------------------------------------------------- */

/**
 * The panel is a **view** now, and these assertions moved with it rather than being rewritten.
 *
 * Every one of them used to read the panel's `fillText` transcript. They read `overlayViewOf`'s
 * fields instead, and the claims are the same claims: each value is recomputed from the recording
 * rather than pinned, the estimate is replaced by its reason on a refused run and the observations
 * survive beside it, and both registers say every word they said.
 *
 * **Four assertions are gone and none of them was about a fact.** They were the row allocator's:
 * *showing 3 of 12 banks*, *no room here*, the panel that draws nothing below 200 px, and the panel
 * that draws nothing when the layout reserved no room. All four were a bitmap running out of
 * pixels, and a card that lists every bank and every car has no such state. `docs/21` § 1.3's
 * ledger check is what this answers to, and the row it names is *`LIVE METRICS` in two registers,
 * suppressed statistics replaced by refusals in either register* — carried below, in full.
 *
 * What replaces the width floor is not here at all: it is `dev/liveMetrics.browser.test.ts`, which
 * measures `scrollWidth <= clientWidth` on the real card over all eight shipped buildings in both
 * registers. That is the check issue #115 § 6 said no DOM tier could make.
 */
describe('the live metrics view carries the metrics it was given', () => {
  const at = 100;
  const metrics = overlayAt(RECORDING, at);
  const viewAt = (mode: 'basic' | 'advanced' = 'advanced'): OverlayView =>
    overlayViewOf(metrics, frame({ simTimeS: at }), mode);

  it('carries every observation, each recomputed from the recording rather than pinned', () => {
    const view = viewAt();
    const values = new Map(view.observations.map((row) => [row.label, row.value]));
    expect(values.get(ENGINEER_WORDS.waiting)).toBe(String(metrics.waitingNow));
    expect(values.get(ENGINEER_WORDS.boarded)).toBe(`${String(metrics.boardedInWindow)} legs`);
    expect(values.get(ENGINEER_WORDS.longest)).toBe(
      metrics.longestCurrentWaitS === undefined
        ? '—'
        : `${metrics.longestCurrentWaitS.toFixed(0)} s`,
    );
    // The window's bounds, which is what a reader checks a figure against.
    expect(view.window).toBe(
      `window ${metrics.windowStartS.toFixed(0)}–${metrics.simTimeS.toFixed(0)} s`,
    );
  });

  it('carries the rolling mean, and it moves when the legs move', () => {
    const view = viewAt();
    const estimate = view.estimate;
    if (estimate.kind !== 'figure') throw new Error('expected a figure');
    expect(estimate.value).toBe(`${(metrics.rollingMeanWaitS ?? 0).toFixed(1)} s`);
    // The other direction: a different window is a different mean, and the view follows it.
    const later = overlayViewOf(overlayAt(RECORDING, 300), frame({ simTimeS: 300 }));
    if (later.estimate.kind !== 'figure') throw new Error('expected a figure at 300 s');
    expect(later.estimate.value).toBe(
      `${(overlayAt(RECORDING, 300).rollingMeanWaitS ?? 0).toFixed(1)} s`,
    );
  });

  it('names every bank that served somebody, with its own count and mean', () => {
    const view = viewAt();
    expect(view.banks).toHaveLength(metrics.banks.length);
    expect(view.banks.length).toBeGreaterThan(0);
    for (const [index, bank] of metrics.banks.entries()) {
      const row = view.banks[index];
      if (row === undefined) throw new Error('a bank the metrics carried is not in the view');
      expect(row.bankId).toBe(bank.bankId);
      expect(row.boarded).toBe(`${String(bank.boardedInWindow)} legs`);
      expect(row.mean).toBe(
        bank.meanWaitS === undefined
          ? ENGINEER_WORDS.bankSuppressed
          : `${bank.meanWaitS.toFixed(1)} s`,
      );
      expect(row.refused).toBe(bank.meanWaitS === undefined);
    }
  });

  it('lists every bank and every car, because a card has no row budget', () => {
    /*
     * The claim that replaces *showing 3 of 12 banks*. The drawn panel allocated rows against the
     * pixels it had and said what it left out; there is nothing to leave out now, and the honest
     * assertion is that the two lists are total.
     */
    const many = frame({
      simTimeS: at,
      cars: Array.from({ length: 16 }, (_, index) =>
        car({ carId: `c-${String(index)}`, label: `C${String(index)}`, loadFactor: index / 20 }),
      ),
    });
    const view = overlayViewOf(metrics, many);
    expect(view.cars).toHaveLength(16);
    expect(view.cars.map((row) => row.label)).toEqual(many.cars.map((row) => row.label));
    expect(view.banks).toHaveLength(metrics.banks.length);
  });

  it('scales the car track past 1 and marks where rated load sits — RV-14', () => {
    /*
     * The bar's arithmetic, which moved from `fillRect` widths to two fractions on the view. The
     * claim is unchanged and it is `RV-14`'s: the track does not silently clip at 1, so an
     * overloaded car draws **past** the full mark rather than at it.
     */
    const heavy = frame({
      simTimeS: at,
      cars: [car({ carId: 'a', label: 'A', loadFactor: 0.4 }), car({ carId: 'b', label: 'B', loadFactor: 1.35 })],
    });
    const view = overlayViewOf(metrics, heavy);
    const trackMax = loadTrackMax(heavy.cars);
    expect(trackMax).toBe(1.35);
    const [light, over] = view.cars;
    if (light === undefined || over === undefined) throw new Error('expected two car rows');
    expect(light.fillFraction).toBeCloseTo(0.4 / trackMax, 10);
    expect(over.fillFraction).toBeCloseTo(1, 10);
    expect(over.fullMarkFraction).toBeCloseTo(1 / trackMax, 10);
    // Past the mark, not at it — the property the scaled track exists for.
    expect(over.fillFraction).toBeGreaterThan(over.fullMarkFraction);
    // KB-15b: the glyph is in the string, so the colour is never the only signal.
    expect(over.load).toBe('1.35 !');
    expect(over.overloaded).toBe(true);
    expect(light.load).toBe('0.40');
    expect(light.overloaded).toBe(false);
  });

  it('replaces the estimate with its reason on a saturated run, and keeps the observations', () => {
    const saturated = saturatedRecording();
    const end = saturated.endedAt;
    const view = overlayViewOf(overlayAt(saturated, end), frame({ simTimeS: end }));
    const estimate = view.estimate;
    if (estimate.kind !== 'refused') throw new Error('a saturated run kept its mean');
    expect(estimate.head).toBe('SUPPRESSED');
    expect(estimate.reason).toBe(saturated.summary.awtInvalidReason);
    expect(estimate.basis).toBe('whole-run');
    /* The refused arm has no `value` field at all — R3 as a shape rather than as care taken. */
    expect(Object.hasOwn(estimate, 'value')).toBe(false);
    /* And the observations stay: they are how a reader *sees* the queue diverging. */
    expect(view.observations.map((row) => row.label)).toEqual([
      ENGINEER_WORDS.waiting,
      ENGINEER_WORDS.longest,
      ENGINEER_WORDS.boarded,
    ]);
    expect(view.observations.every((row) => row.value !== '')).toBe(true);
  });

  it('does not date the engineer’s reason to a day that has not finished', () => {
    /*
     * `docs/20` defect 3. `awtInvalidReason` is a whole-run verdict in past tense, and it was
     * printed at every playhead. Short of `endedAt` the engineer's arm carries the pending
     * sentence instead, and the basis says which window it is about.
     */
    const saturated = saturatedRecording();
    const early = Math.round(saturated.startedAt + (saturated.endedAt - saturated.startedAt) * 0.14);
    const view = overlayViewOf(overlayAt(saturated, early), frame({ simTimeS: early }));
    if (view.estimate.kind !== 'refused') throw new Error('the early playhead kept its mean');
    expect(view.estimate.basis).toBe('now');
    expect(view.estimate.reason).toBe(SUPPRESSION_REASON_PENDING);
    expect(view.estimate.reason).not.toBe(saturated.summary.awtInvalidReason);
  });

  it('draws a dash where the window holds no sample, and never an empty box', () => {
    const empty = { ...overlayAt(RECORDING, at), rollingMeanWaitS: undefined, suppressed: false };
    const view = overlayViewOf(empty, frame({ simTimeS: at }));
    if (view.estimate.kind !== 'no-sample') throw new Error('an empty window claimed a figure');
    expect(view.estimate.value).toBe('—');
  });

  it('says nothing was served rather than drawing an empty list', () => {
    const nobody = { ...overlayAt(RECORDING, at), banks: [] };
    const view = overlayViewOf(nobody, frame({ simTimeS: at }));
    expect(view.banks).toHaveLength(0);
    expect(view.banksEmpty).toBe(ENGINEER_WORDS.nothingYet);
    // And the note is absent — not `''` — whenever there is a list to draw.
    expect(viewAt().banksEmpty).toBeUndefined();
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

  it('carries each car’s load factor as a number, recomputed from the frame', () => {
    /*
     * Read off the view rather than off a `fillText` transcript — `docs/21` § 3.4. The claim is the
     * one it always was: the figure is the frame's, at the frame's precision, per car.
     */
    const f = frame();
    const view = overlayViewOf(metrics, f);
    expect(view.cars).toHaveLength(f.cars.length);
    for (const [index, each] of f.cars.entries()) {
      expect(view.cars[index]?.load).toContain(each.loadFactor.toFixed(2));
    }
  });

  it('labels an overloaded car with a glyph, not only a colour — KB-15b', () => {
    const overloaded = overlayViewOf(metrics, frame({ cars: [car({ loadFactor: LOAD_ALARM })] }));
    expect(overloaded.cars[0]?.load).toBe(`${LOAD_ALARM.toFixed(2)} !`);
    expect(overloaded.cars[0]?.overloaded).toBe(true);
    expect(overloaded.cars[0]?.tone).toBe('overloaded');

    const full = overlayViewOf(metrics, frame({ cars: [car({ loadFactor: LOAD_FULL })] }));
    expect(full.cars[0]?.load).not.toContain('!');
    expect(full.cars[0]?.overloaded).toBe(false);
    // The design-load band is a *distinct* fact from the alarm — `UX.md` RV-14, `D18`.
    expect(full.cars[0]?.tone).toBe('at-design-load');
  });

  it('is one judgement with two renderers — the tone names the band the colour paints', () => {
    /*
     * The stage takes a `Theme` colour and the card takes a class; `loadTone` is the single set of
     * boundaries both read, so a car cannot be amber on the picture and green on the panel. Asserted
     * over the four bands rather than over one, because the pairing is what is being claimed.
     */
    for (const [factor, tone, colour] of [
      [0.2, 'room', DEFAULT_THEME.carLight],
      [0.6, 'carrying', DEFAULT_THEME.car],
      [LOAD_FULL, 'at-design-load', DEFAULT_THEME.carHeavy],
      [LOAD_ALARM, 'overloaded', DEFAULT_THEME.carOverload],
    ] as const) {
      expect(loadTone(factor)).toBe(tone);
      expect(loadColour(factor, DEFAULT_THEME)).toBe(colour);
    }
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

  /**
   * Sixteen shafts whose labels differ only at the very end — the shape that produced issue
   * #115 § 4's `Z…`, in a fixture.
   *
   * Two claims, and the second is the one the issue is about. **Nothing overhangs what it names**:
   * a per-column label is budgeted by its column and a bank heading by the span of the columns it
   * covers. And **no two columns say the same thing**, which is the claim `fitLabel` alone could
   * not keep: clipping `car-number-0` … `car-number-15` to a 29 px column gives sixteen copies of
   * `car…`, and a picture of sixteen identical labels is a picture with no labels in it.
   */
  it('keeps sixteen column headers distinct, and inside what they name — RV-06, issue #115 § 4', () => {
    // Found by running the viewer on Mixed-Use High-Rise: sixteen shafts give each column about
    // 30 px, and `shuttle` / `office-low` ran into their neighbours into an unreadable band.
    const many = Array.from({ length: 16 }, (_, index) => ({
      ...(RECORDING.shafts[0] as VizRecording['shafts'][number]),
      carId: `c${String(index)}`,
      bankId: index < 8 ? 'shuttle-express' : 'office-low-rise',
      label: `car-number-${String(index)}`,
    }));
    const wide: VizRecording = { ...RECORDING, shafts: many };
    const layout = layoutFor(wide);
    const ctx = new RecordingContext();
    drawScene(ctx, {
      recording: wide,
      frame: frame({ cars: [] }),
      layout,
      theme: DEFAULT_THEME,
    });

    // The shaft row: one text per column, at the column's own centre, inside the column's width.
    const columnWidth = layout.columns[0]?.width ?? 0;
    expect(columnWidth).toBeGreaterThan(0);
    const shaftRow = ctx.calls.filter(
      (call) => call.op === 'fillText' && call.args[2] === layout.header.shaftY,
    );
    expect(shaftRow).toHaveLength(16);
    for (const call of shaftRow) {
      expect(String(call.args[0]).length * 7.2).toBeLessThanOrEqual(columnWidth);
    }
    // The point of the change: sixteen labels, sixteen different strings.
    expect(new Set(shaftRow.map((call) => String(call.args[0]))).size).toBe(16);

    // The bank row: one heading per contiguous bank, budgeted by that bank's span and not by one
    // column — and it carries the elided prefix back, so `car-number-13` is still on the picture.
    const bankRow = ctx.calls.filter(
      (call) => call.op === 'fillText' && call.args[2] === layout.header.bankY,
    );
    expect(bankRow).toHaveLength(2);
    const spanPx = 8 * columnWidth + 7 * 10;
    for (const call of bankRow) {
      expect(String(call.args[0]).length * 7.2).toBeLessThanOrEqual(spanPx);
      expect(String(call.args[0])).toContain('car-number-*');
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
  /** The playhead the run's own `undelivered` belongs to. See `canvas.ts#undeliveredAt`. */
  const atEnd = { simTimeS: RECORDING.endedAt } as const;

  it('leads with the status and the undelivered count', () => {
    const timedOut: VizRecording = {
      ...RECORDING,
      status: 'timed-out',
      summary: { ...RECORDING.summary, undelivered: 69 },
    };
    const text = draw(frame(atEnd), timedOut).texts.join('\n');
    expect(text).toContain('TIMED-OUT — 69 undelivered');
    expect(draw(frame(atEnd)).texts.join('\n')).not.toContain('TIMED-OUT');
  });

  it('shows both the status and the suppression when both apply', () => {
    const both: VizRecording = {
      ...RECORDING,
      status: 'timed-out',
      summary: { ...RECORDING.summary, undelivered: 12, saturated: true, awtIsValid: false },
    };
    const text = draw(frame(atEnd), both).texts.join('\n');
    expect(text).toContain('TIMED-OUT — 12 undelivered');
    expect(text).toContain('SATURATED — AWT suppressed');
  });

  it('keeps the status word at every playhead, and the run’s own count at only one', () => {
    // § D294 on this same header: `recording.status` is printed verbatim mid-run, because a PNG
    // exported at 01:40 has no later and RV-16's lead may not be the thing that goes missing from
    // it. What is withheld is the *figure*, not the fact that the run did not finish.
    const timedOut: VizRecording = {
      ...RECORDING,
      status: 'timed-out',
      summary: { ...RECORDING.summary, undelivered: 69 },
    };
    const early = draw(frame(), timedOut).texts.join('\n');
    expect(early).toContain('TIMED-OUT');
    expect(early).not.toContain('69');
  });
});

/* -------------------------------------------------------------------------- *
 * The two registers — issue #100
 * -------------------------------------------------------------------------- */

/**
 * **Every word of both registers reaches the view**, and the refusal is as hard in either.
 *
 * The measurement that produced issue #100: `drawOverlay` took no mode, so `LIVE METRICS`,
 * `rolling mean wait`, `waiting now` and `BY BANK` were byte-identical in Basic and Advanced. The
 * fix was a table of two registers; this is the assertion that neither half of it can rot, and it
 * is written over the tables themselves rather than over a list somebody remembered to update — a
 * tenth word added to either register with no view field to carry it is red here.
 */
describe('the live metrics view speaks a player’s words in Casual — issue #100', () => {
  const at = 100;

  /** Every string a view carries, in one array, for the *this word reached the screen* checks. */
  const stringsOf = (view: OverlayView): readonly string[] => [
    view.title,
    view.window,
    ...view.observations.flatMap((row) => [row.label, row.value]),
    view.estimate.label,
    ...(view.estimate.kind === 'refused'
      ? [view.estimate.head, view.estimate.reason]
      : [view.estimate.value]),
    view.bankHeading,
    ...(view.banksEmpty === undefined ? [] : [view.banksEmpty]),
    ...view.banks.flatMap((row) => [row.bankId, row.boarded, row.mean]),
    view.carHeading,
    ...view.cars.map((row) => row.load),
  ];

  const viewOf = (recording: VizRecording, mode: 'basic' | 'advanced', t = at): OverlayView =>
    overlayViewOf(overlayAt(recording, t), frame({ simTimeS: t }), mode);

  it('says what the panel is in a player’s words, and keeps the engineer’s', () => {
    expect(viewOf(RECORDING, 'basic').title).toBe(CASUAL_WORDS.title);
    expect(viewOf(RECORDING, 'advanced').title).toBe(ENGINEER_WORDS.title);
  });

  it('defaults to the engineer’s panel, byte for byte', () => {
    const asked = overlayViewOf(overlayAt(RECORDING, at), frame({ simTimeS: at }), 'advanced');
    const defaulted = overlayViewOf(overlayAt(RECORDING, at), frame({ simTimeS: at }));
    expect(stringsOf(defaulted)).toEqual(stringsOf(asked));
  });

  it('carries every word of whichever register it is in, and none of the other’s', () => {
    /*
     * Derived from the two tables rather than listed. A word added to one register and forgotten in
     * the view is red; a word that leaks across registers is red on the second half.
     */
    const mixed = frame({ simTimeS: at });
    for (const [mode, mine, theirs] of [
      ['basic', CASUAL_WORDS, ENGINEER_WORDS],
      ['advanced', ENGINEER_WORDS, CASUAL_WORDS],
    ] as const) {
      const view = overlayViewOf(overlayAt(RECORDING, at), mixed, mode);
      const drawn = stringsOf(view).join('\n');
      for (const [key, word] of Object.entries(mine)) {
        // These two are drawn only in the states that call for them; the rest are unconditional.
        if (key === 'bankSuppressed' || key === 'nothingYet') continue;
        expect(drawn, `${mode} lost ${key}`).toContain(word);
      }
      for (const [key, word] of Object.entries(theirs)) {
        // `longest wait` is byte-identical in both registers and is in both tables on purpose.
        if (word === mine[key as keyof typeof mine]) continue;
        expect(drawn, `${mode} leaked ${key} from the other register`).not.toContain(word);
      }
    }
  });

  it('keeps the window’s basis rather than dropping it', () => {
    /*
     * Casual gets the window's **length** rather than its bounds, and it is subtracted rather than
     * assumed: early in a run the window is genuinely shorter than 300 s, and *the last 300 s*
     * there would describe a window the panel is not showing.
     */
    const t = RECORDING.startedAt + 60;
    const metrics = overlayAt(RECORDING, t);
    expect(viewOf(RECORDING, 'basic', t).window).toBe(
      `the last ${(metrics.simTimeS - metrics.windowStartS).toFixed(0)} s`,
    );
    expect(viewOf(RECORDING, 'advanced', t).window).toContain('window ');
  });

  it('refuses a mean just as hard, and says so in words a player has', () => {
    const saturated = saturatedRecording();
    const end = saturated.endedAt;
    const estimate = viewOf(saturated, 'basic', end).estimate;
    if (estimate.kind !== 'refused') throw new Error('Casual kept a refused mean');
    // Never softer: every candidate says there is no average before it says anything else.
    expect(estimate.head.toLowerCase()).toContain('no average');
    expect(estimate.reason).toBe(CASUAL_REFUSAL_REASON);
    expect(estimate.label).toBe(CASUAL_WORDS.rollingMean);
    expect(Object.hasOwn(estimate, 'value')).toBe(false);
  });

  it('does not call the refusal a result before the day has one', () => {
    const saturated = saturatedRecording();
    const early = Math.round(saturated.startedAt + (saturated.endedAt - saturated.startedAt) * 0.14);
    const estimate = viewOf(saturated, 'basic', early).estimate;
    if (estimate.kind !== 'refused') throw new Error('the early playhead kept its mean');
    expect(estimate.basis).toBe('now');
    expect(estimate.reason).toBe(CASUAL_REFUSAL_REASON_SO_FAR);
  });

  it('prints no mean anywhere on a refused run, in either register', () => {
    const saturated = saturatedRecording();
    const end = saturated.endedAt;
    /*
     * The mean **as this panel would print it** — `12.0 s`, with the unit — rather than as a bare
     * numeral. The bare form is what was written first and it was a false positive waiting: `core`'s
     * own refusal sentence says the queue rose at *12.0x the queue's own scatter*, and a check that
     * cannot tell a suppressed figure from a digit inside the reason for suppressing it would go red
     * on the very sentence R3 requires to be there.
     */
    const printed = `${saturated.summary.meanWaitS.toFixed(1)} s`;
    // The positive control: an unrefused run at the same instant really does print it that way.
    const healthy = viewOf(RECORDING, 'advanced', end).estimate;
    expect(healthy.kind).toBe('figure');
    for (const mode of ['basic', 'advanced'] as const) {
      const drawn = stringsOf(viewOf(saturated, mode, end)).join('\n');
      expect(drawn, `${mode} printed the refused mean`).not.toContain(printed);
    }
  });

  it('gives a refused bank the register’s own word rather than a number', () => {
    const saturated = saturatedRecording();
    const end = saturated.endedAt;
    for (const [mode, words] of [
      ['basic', CASUAL_WORDS],
      ['advanced', ENGINEER_WORDS],
    ] as const) {
      const view = viewOf(saturated, mode, end);
      expect(view.banks.length).toBeGreaterThan(0);
      for (const bank of view.banks) {
        expect(bank.refused, 'a refused run kept a bank mean').toBe(true);
        expect(bank.mean).toBe(words.bankSuppressed);
      }
    }
  });
});
