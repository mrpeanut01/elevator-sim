/**
 * Nothing above the plot overprints anything else above the plot.
 *
 * ## The defect
 *
 * The mood headline was drawn at `y = 48` with `textBaseline: 'top'` — the box `[48, 60]`. The
 * bank label is drawn at `plot.y − 18` with `textBaseline: 'bottom'`, and with a 64 px header and
 * 12 px of padding that is `y = 58`, the box `[46, 58]`. **Ten pixels of overprint, on every
 * building with more than one bank.** The hidden-shaft notice at `plot.y − 20` overprinted both,
 * and the selected landing's caption was drawn at *the same* `y` as the hidden-shaft notice and
 * the same `x`, so those two overprinted each other exactly.
 *
 * Each literal was locally correct. They were written by different lanes, months apart, and no
 * test could see the collision because every test asserted *what* was drawn and none asserted
 * *where*, relative to anything else.
 *
 * ## The guard
 *
 * Draw a real scene, take every `fillText` whose baseline lands above `plot.y`, turn each into a
 * rectangle from the recorded `font`, `textAlign` and `textBaseline`, and require the rectangles
 * to be pairwise disjoint. **Nothing here is a coordinate.** The boxes come from what the renderer
 * asked the context for; the band comes from `layout.plot.y`. Moving a row without moving its
 * neighbour turns this red wherever the row is.
 *
 * The character advances are the renderer's own (`CHAR_ADVANCE_PX`, `BOLD_CHAR_ADVANCE_PX`) —
 * approximate, and deliberately so: {@link Canvas2DLike} has no `measureText`, which is what keeps
 * this package testable under Node. An approximate width is the right instrument for a defect
 * measured in tens of pixels.
 */

import { describe, expect, it } from 'vitest';

import { constantSeries } from '../contract/series.js';
import { VIZ_SCHEMA_VERSION, type Frame, type VizRecording, type VizShaft } from '../contract/types.js';
import { FIXTURE_DOOR_CONFIG, fixtureSummary } from '../fixtures.test-helper.js';
import { DEFAULT_THEME, drawScene, type Canvas2DLike } from './canvas.js';
import { buildLayout, MIN_HEADER_PX, type Layout } from './layout.js';
import type { BuildingMood } from './mood.js';

/* -------------------------------------------------------------------------- *
 * A context that records enough to rebuild a text box
 * -------------------------------------------------------------------------- */

interface Written {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly font: string;
  readonly align: Canvas2DLike['textAlign'];
  readonly baseline: Canvas2DLike['textBaseline'];
}

interface Box {
  readonly written: Written;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

class Recorder implements Canvas2DLike {
  readonly written: Written[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  font = '';
  textAlign: Canvas2DLike['textAlign'] = 'start';
  textBaseline: Canvas2DLike['textBaseline'] = 'alphabetic';
  globalAlpha = 1;

  save(): void {}
  restore(): void {}
  clearRect(): void {}
  fillRect(): void {}
  strokeRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  quadraticCurveTo(): void {}
  arc(): void {}
  fill(): void {}
  stroke(): void {}
  fillText(text: string, x: number, y: number): void {
    this.written.push({
      text,
      x,
      y,
      font: this.font,
      align: this.textAlign,
      baseline: this.textBaseline,
    });
  }
}

/** The renderer's own advances — see `render/canvas.ts`. Bold is the 14 px face. */
const CHAR_ADVANCE_PX = 7.2;
const BOLD_CHAR_ADVANCE_PX = 8.5;

function boxOf(written: Written): Box {
  const bold = written.font.startsWith('bold');
  const advance = bold ? BOLD_CHAR_ADVANCE_PX : CHAR_ADVANCE_PX;
  const fontPx = bold ? 14 : 12;
  const width = [...written.text].length * advance;
  const left =
    written.align === 'right' || written.align === 'end'
      ? written.x - width
      : written.align === 'center'
        ? written.x - width / 2
        : written.x;
  // `top` and `bottom` are the *glyph* box, not the line box: two rows one line box apart are
  // adjacent, not overlapping, and the guard must not call that a collision.
  const top =
    written.baseline === 'top' || written.baseline === 'hanging'
      ? written.y
      : written.baseline === 'middle'
        ? written.y - fontPx / 2
        : written.y - fontPx;
  return { written, left, right: left + width, top, bottom: top + fontPx };
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/* -------------------------------------------------------------------------- *
 * A multi-bank building — the configuration the defect needed
 * -------------------------------------------------------------------------- */

function shaft(carId: string, bankId: string, label: string): VizShaft {
  return {
    carId,
    bankId,
    label,
    startFloorId: 'G',
    startHeightM: 0,
    servedFloorIds: ['G', '2', '3', '4'],
    capacityPersons: 13,
    doorConfig: FIXTURE_DOOR_CONFIG,
    motions: [],
    doorMarks: [],
    occupants: constantSeries(0),
    loadFactor: constantSeries(0),
  };
}

const SHAFTS: readonly VizShaft[] = [
  shaft('low-A', 'low-rise', 'A'),
  shaft('low-B', 'low-rise', 'B'),
  shaft('high-A', 'high-rise', 'C'),
  shaft('high-B', 'high-rise', 'D'),
];

const RECORDING: VizRecording = {
  schemaVersion: VIZ_SCHEMA_VERSION,
  runId: 'synthetic',
  seed: '20260729',
  buildingId: 'synthetic',
  buildingName: 'Synthetic Mixed-Use High-Rise',
  dispatcherProfileId: 'destination-eta',
  passengerModel: 'destination-dispatch',
  status: 'timed-out',
  startedAt: 0,
  endedAt: 900,
  floors: [
    { id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
    { id: '2', index: 1, heightM: 4, isEntrance: false, isTransferFloor: true, population: 20 },
    { id: '3', index: 2, heightM: 7, isEntrance: false, isTransferFloor: false, population: 20 },
    { id: '4', index: 3, heightM: 10, isEntrance: false, isTransferFloor: false, population: 20 },
  ],
  shafts: SHAFTS,
  legs: [],
  landings: [],
  progress: {
    waiting: constantSeries(0),
    boardedLegs: constantSeries(0),
    meanWaitS: constantSeries(0),
  },
  summary: { ...fixtureSummary(), saturated: true, awtIsValid: false, undelivered: 31 },
  // Version 7. Empty is the legal value for a fixture that exercises none of the three:
  // the timeline draws one unlabelled band, the decision log draws its empty state, and
  // no shaft is dark. See `contract/types.ts`.
  demandPhases: [],
  decisions: [],
  outOfServiceCarIds: [],
  warnings: [],
};

const FRAME: Frame = {
  schemaVersion: VIZ_SCHEMA_VERSION,
  runId: 'synthetic',
  simTimeS: 450,
  cars: SHAFTS.map((s) => ({
    carId: s.carId,
    bankId: s.bankId,
    label: s.label,
    heightM: 4,
    floorId: '2',
    direction: 0 as const,
    doorFraction: 0,
    doorPhase: 'closed' as const,
    occupants: 0,
    loadFactor: 0,
  })),
  landings: [
    { floorId: 'G', waitingUp: 9, waitingDown: 0 },
    { floorId: '2', waitingUp: 3, waitingDown: 2 },
    { floorId: '3', waitingUp: 0, waitingDown: 4 },
    { floorId: '4', waitingUp: 0, waitingDown: 1 },
  ],
  totalWaiting: 19,
  boardedLegs: 88,
  runningMeanWaitS: 61.4,
};

const MOOD: BuildingMood = {
  level: 'distressed',
  glyph: '●',
  headline: 'The queues never stopped growing — the building could not keep up.',
  drivers: [],
  provisional: true,
  // Issue #109. The header band draws `glyph` and `headline` and nothing else off this record, so
  // the retraction is here to satisfy the type and is deliberately not asserted on: the surface
  // that draws it is the left rail's driver block.
  retraction: 'The run has not finished.',
  caveat: 'One run of one seed.',
};

/**
 * Every widget that can appear above the plot, at once.
 *
 * The selection is the shaft-box case *and* the caption case; the narrow layouts below also make
 * `hiddenShaftCount` positive, so the notices row carries both of its tenants.
 */
function drawAt(
  width: number,
  height: number,
  shafts: readonly VizShaft[] = SHAFTS,
): { ctx: Recorder; layout: Layout } {
  const layout = buildLayout({
    width,
    height,
    floors: RECORDING.floors,
    shafts,
    gutterRightPx: 280,
  });
  const ctx = new Recorder();
  drawScene(ctx, {
    recording: RECORDING,
    frame: FRAME,
    layout,
    theme: DEFAULT_THEME,
    mood: MOOD,
    selection: { floorId: '3', answeredByCarId: 'high-A', answeredInS: 41, waiting: 4, oldestWaitS: 210 },
    unansweredCallFloorIds: ['4'],
  });
  return { ctx, layout };
}

/** Every text box whose glyphs land wholly or partly above the plot. */
function headerBoxes(ctx: Recorder, layout: Layout): readonly Box[] {
  return ctx.written.map(boxOf).filter((box) => box.top < layout.plot.y);
}

/** Every text drawn above the plot, whatever row it thinks it is on. */
function aboveThePlot(ctx: Recorder, layout: Layout): readonly Written[] {
  return ctx.written.filter((written) => written.y < layout.plot.y);
}

function collisions(boxes: readonly Box[]): readonly string[] {
  const found: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a === undefined || b === undefined) continue;
      if (!overlaps(a, b)) continue;
      found.push(
        `"${a.written.text}" [${a.left.toFixed(0)},${a.top.toFixed(0)}–${a.right.toFixed(0)},${a.bottom.toFixed(0)}] ` +
          `overprints "${b.written.text}" [${b.left.toFixed(0)},${b.top.toFixed(0)}–${b.right.toFixed(0)},${b.bottom.toFixed(0)}]`,
      );
    }
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * The rule
 * -------------------------------------------------------------------------- */

describe('the header band never draws two things in the same place', () => {
  // Widths chosen for what they *cause*, not for their roundness: 1440 is the window § 11 W7b
  // measured the stage at, 900 is the overlay panel's threshold, and 420 forces both the shaft
  // count to be truncated (`RS-05`) and the right-aligned lines to meet the left-aligned ones.
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [900, 640],
    [640, 520],
    [420, 400],
  ] as const) {
    it(`keeps every header row clear of every other at ${String(width)}×${String(height)}`, () => {
      const { ctx, layout } = drawAt(width, height);
      const boxes = headerBoxes(ctx, layout);
      // The band is not empty, or the test would pass by drawing nothing — the false negative a
      // fixture that routes past its subject produces.
      expect(boxes.length).toBeGreaterThanOrEqual(6);
      expect(collisions(boxes)).toEqual([]);
    });
  }

  it('draws the mood line and the bank labels, so the pair that collided is really in the band', () => {
    /*
     * The negative control for the test above, and it is not decoration: a disjointness assertion
     * is satisfied by an empty set, so a fixture that never drew a mood line or a bank label would
     * pass every size above while testing nothing. That is the *"a fixture routing the test past
     * its subject"* shape wave 8 found six times. So the two claims that actually collided are
     * named, and so are the other two rows that shared their `y`.
     */
    const { ctx, layout } = drawAt(1440, 900);
    const boxes = headerBoxes(ctx, layout);
    const mood = boxes.find((box) => box.written.text.includes('queues never stopped growing'));
    const bank = boxes.filter((box) => box.written.text === 'low-rise' || box.written.text === 'high-rise');
    expect(mood, 'the mood headline is drawn in the header band').toBeDefined();
    expect(bank.length, 'both bank labels are drawn in the header band').toBeGreaterThanOrEqual(2);
    // …and the shaft labels and both notices, which are the other two rows that shared a y.
    expect(boxes.some((box) => box.written.text.startsWith('floor 3'))).toBe(true);
    expect(boxes.some((box) => box.written.text === 'A')).toBe(true);
    expect(layout.plot.y).toBeGreaterThan(mood?.bottom ?? 0);
  });

  it('draws nothing above the plot on a row the band does not declare', () => {
    /*
     * The anti-erosion half, and it is here because of a documented near-miss: § D159 records a
     * guard in `lockedOutRender.test.ts` whose `y > 40` filter silently stopped meaning *"landing
     * rows"* when another lane started drawing at `y = 48`. Every assertion in it stayed true and
     * the *meaning* moved. **A merge can erode a guard while leaving it green.**
     *
     * A pairwise-disjointness test has exactly that weakness: two new rows that miss each other
     * pass it while owning no row at all. So the band's rows are also asserted to be *the* rows.
     * A future lane that draws a seventh thing above the plot gets a failure naming its text and
     * its `y`, rather than silence until it happens to land on somebody.
     *
     * The cut is `written.y < plot.y` and not the box's top edge: the topmost floor row is drawn
     * *at* `plot.y` with `textBaseline: 'middle'`, so its box straddles the boundary and it is a
     * landing, not a header. Checked rather than assumed — over this scene at all five sizes
     * above, *every* text box on the canvas is pairwise disjoint, so the cut is not hiding a
     * collision it declines to look at.
     */
    for (const [width, height] of [
      [1440, 900],
      [900, 640],
      [420, 400],
    ] as const) {
      const { ctx, layout } = drawAt(width, height);
      const rows = new Set([
        layout.header.titleY,
        layout.header.metaY,
        layout.header.moodY,
        layout.header.noticeY,
        layout.header.bankY,
        layout.header.shaftY,
      ]);
      const strays = aboveThePlot(ctx, layout)
        .filter((written) => !rows.has(written.y))
        .map((written) => `"${written.text}" at y=${String(written.y)}`);
      expect(strays).toEqual([]);
      // …and every declared row is actually used, or the set above would be satisfiable by
      // drawing nothing — the fixture-routes-past-its-subject shape, one level up.
      const used = new Set(aboveThePlot(ctx, layout).map((written) => written.y));
      expect([...rows].filter((row) => !used.has(row))).toEqual([]);
    }
  });

  it('keeps every header row inside the canvas, however long its sentence is', () => {
    /*
     * Disjointness says nothing about the right edge, and the mood headline is a whole sentence:
     * *"The queues never stopped growing — the building could not keep up."* is 66 characters,
     * which is 475 px at this face and wider than a 420 px canvas. Deleting its clip came back
     * **green** against the disjointness tests above — a row alone on its row cannot overprint
     * anybody, and it still runs off the edge. The banner and the counters have the same exposure
     * and are clipped against their neighbours rather than against the canvas, so they are checked
     * here from the other side.
     */
    for (const [width, height] of [
      [1440, 900],
      [640, 520],
      [420, 400],
    ] as const) {
      const { ctx, layout } = drawAt(width, height);
      const outside = headerBoxes(ctx, layout)
        .filter((box) => box.right > layout.width || box.left < 0)
        .map((box) => `"${box.written.text}" [${box.left.toFixed(0)}–${box.right.toFixed(0)}] of ${String(layout.width)}`);
      expect(outside).toEqual([]);
    }
  });

  it('puts the hidden-shaft warning and the selection caption on one row without overlap', () => {
    // `RS-05`'s warning fires and shares the notices row with `RV-T3`'s caption. Before this unit
    // both were drawn at `plot.y − 20`, left-aligned at `plot.x` — the same pixel — and one was
    // written straight through the other.
    //
    // The overflow used to be built by asking for a 420 px canvas with a 280 px right gutter, and
    // § D236 made that arrangement lay out all four shafts: the gutters are clamped now, so a
    // caller's over-request no longer collapses the plot to nothing. The claim under test is
    // unchanged and the *building* is what overflows now — sixteen cars in the same 420 px, which
    // is a real Mixed-Use High-Rise bank rather than an artefact of a caller asking for more
    // gutter than there is canvas.
    const crowded = Array.from({ length: 16 }, (_, index) =>
      shaft(`crowd-${String(index)}`, 'low-rise', String.fromCharCode(65 + index)),
    );
    const { ctx, layout } = drawAt(420, 400, crowded);
    expect(layout.hiddenShaftCount).toBeGreaterThan(0);
    const notices = ctx.written
      .map(boxOf)
      .filter((box) => box.written.y === layout.header.noticeY);
    expect(notices.length).toBe(2);
    expect(collisions(notices)).toEqual([]);
  });

  it('derives the header height from the rows it holds, and refuses a shorter one', () => {
    // The default is computed, not chosen — and a caller who asks for the old 64 px is clamped
    // rather than quietly given back the overprint.
    const asked = buildLayout({
      width: 1440,
      height: 900,
      floors: RECORDING.floors,
      shafts: SHAFTS,
      headerPx: 64,
    });
    const standard = buildLayout({
      width: 1440,
      height: 900,
      floors: RECORDING.floors,
      shafts: SHAFTS,
    });
    expect(asked.plot.y).toBe(standard.plot.y);
    expect(standard.plot.y).toBe(12 + MIN_HEADER_PX);
    // Every row of the band is inside the band, in order, and none of them is on top of another.
    const { header, plot } = standard;
    const tops = [
      header.titleY,
      header.metaY,
      header.moodY,
      header.noticeY - header.linePx,
      header.bankY - header.linePx,
      header.shaftY - header.linePx,
    ];
    expect([...tops]).toEqual([...tops].sort((a, b) => a - b));
    expect(new Set(tops).size).toBe(tops.length);
    expect(header.shaftY).toBeLessThan(plot.y);

    /*
     * The three plot-anchored rows land exactly where the literals they replaced put them.
     *
     * That is not a coincidence to be tidied away — it is the statement that **this fix moved the
     * plot down and did not move a single label relative to it**, so the editor preview and the
     * run viewer draw the same picture they drew before, taller. It is also why three of the
     * fifteen mutations in this unit's battery are *equivalent* rather than survivors: replacing
     * `header.bankY` with `plot.y − 18` produces an identical program today. Pinned here so that
     * if a future row stack does move them, it moves them on purpose.
     */
    expect(header.shaftY).toBe(plot.y - 4);
    expect(header.bankY).toBe(plot.y - 18);
    expect(header.noticeY).toBe(plot.y - 32);
  });
});

