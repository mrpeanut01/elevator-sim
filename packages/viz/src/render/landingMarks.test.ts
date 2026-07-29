/**
 * Every mark a landing row can carry, checked for **shape** collisions with the colour removed.
 *
 * ## Why a second glyph test, when three already exist
 *
 * `riderQueue.test.ts` asserts the four wait bands are four distinct *characters* and
 * `lockedOutRender.test.ts` asserts the three barriers are three distinct *characters*. Both were
 * green while the viewer shipped `✗` (U+2717, *a call no car answers*) and `✖` (U+2716, *this
 * rider is past the abandonment horizon*) **on the same row**: two codepoints, one mark at 12 px.
 * Distinctness over codepoints is not the property anybody wanted. The property is that a reader
 * can tell the marks apart, and a reader tells marks apart by silhouette.
 *
 * The collision was not a coincidence either, which is what promoted it from a blemish to a
 * defect: **a call nobody answers is exactly a call whose riders pass the abandonment horizon**,
 * so the two marks appear together precisely when the building is in trouble.
 *
 * ## What this file asserts, and why it is expressed this way
 *
 * A {@link MarkFamily} is the silhouette a reader sees — *cross*, *ring*, *diamond*, *tick*,
 * *hatched block*, *dot*, *triangle pointing up*, *triangle pointing down*. Two marks in the same
 * family are treated as indistinguishable at 12 px whatever their codepoints are. The rule is:
 *
 * > **No two distinct claims drawn on one landing row may share a family.**
 *
 * The wait bands are one claim with four rungs, so they are allowed to share the ring family among
 * themselves — and they are separated inside it by *fill*, which is asserted too.
 *
 * Two guards keep the table from going stale, because a hand-written table is exactly the shape of
 * false negative wave 8 kept finding:
 *
 * 1. **The claim inventory reads shipped values.** `BAND_GLYPH`, `RELIEF_GLYPH`, `STATE_GLYPHS`
 *    and the four constants `render/canvas.ts` exports. Re-spelling any mark in the renderer moves
 *    this test; it cannot be satisfied by a transcription.
 * 2. **Exhaustiveness is checked against a real draw.** A scene that exercises every landing
 *    branch is rendered and every single-character mark that lands on a floor row must be in the
 *    table. A new mark reaching the row with no family turns this red without anybody remembering.
 */

import { describe, expect, it } from 'vitest';

import { STATE_GLYPHS } from '../access/zoning.js';
import type { LockedOutLanding } from '../access/lockedOut.js';
import { constantSeries } from '../contract/series.js';
import { VIZ_SCHEMA_VERSION, type Frame, type VizRecording } from '../contract/types.js';
import type { FloorQueue, QueuedRider, WaitBand } from '../frame/overlay.js';
import { FIXTURE_DOOR_CONFIG, fixtureSummary } from '../fixtures.test-helper.js';
import {
  DEFAULT_THEME,
  EMPTY_LANDING_GLYPH,
  UNANSWERED_GLYPH,
  WAITING_DOWN_GLYPH,
  WAITING_UP_GLYPH,
  drawScene,
  type Canvas2DLike,
  type Theme,
} from './canvas.js';
import { buildLayout, type Layout } from './layout.js';
import { BAND_GLYPH, RELIEF_GLYPH } from './riderQueue.js';

/* -------------------------------------------------------------------------- *
 * Shape families
 * -------------------------------------------------------------------------- */

/**
 * The silhouette a reader sees at 12 px, with the colour gone.
 *
 * Orientation counts as silhouette: `▲` and `▼` are not confusable and get different families,
 * while `✗` and `✖` are the same drawing at two weights and get the same one. That judgement is
 * the whole content of this table, so it is written out rather than derived — but every *mark* it
 * classifies is read from the renderer, and an unclassified mark is a failure rather than a skip.
 */
type MarkFamily =
  | 'cross'
  | 'ring'
  | 'diamond'
  | 'tick'
  | 'hatched-block'
  | 'dot'
  | 'triangle-up'
  | 'triangle-down';

/** Glyph → silhouette. Includes marks this renderer no longer draws, so a regression is caught. */
const FAMILY: Readonly<Record<string, MarkFamily>> = Object.freeze({
  // Crosses. Two codepoints, one drawing — this pair is the defect this file exists for.
  '✗': 'cross',
  '✖': 'cross',
  '✕': 'cross',
  '×': 'cross',
  // Rings, by fill. The wait-band ladder lives here.
  '○': 'ring',
  '◑': 'ring',
  '●': 'ring',
  '◔': 'ring',
  '◕': 'ring',
  '⊘': 'ring',
  '◆': 'diamond',
  '◇': 'diamond',
  '✓': 'tick',
  '▩': 'hatched-block',
  '▨': 'hatched-block',
  '·': 'dot',
  '▲': 'triangle-up',
  '▼': 'triangle-down',
});

/** Fill fraction, for the ring ladder. Only meaningful inside the `ring` family. */
const RING_FILL: Readonly<Record<string, number>> = Object.freeze({
  '○': 0,
  '◔': 0.25,
  '◑': 0.5,
  '◕': 0.75,
  '●': 1,
});

interface Claim {
  readonly claim: string;
  readonly glyph: string;
}

const BANDS: readonly WaitBand[] = ['settling', 'waiting', 'long', 'abandoned'];

/**
 * Every *other* claim a landing row can carry, read from the values the renderer draws.
 *
 * Nothing here is a literal: re-spelling `✗` in `render/canvas.ts` or `▩` in `access/zoning.ts`
 * moves this list with it.
 */
const OTHER_CLAIMS: readonly Claim[] = [
  { claim: 'no car answers this call', glyph: UNANSWERED_GLYPH },
  { claim: 'no car may legally answer this call', glyph: STATE_GLYPHS['not-permitted'] },
  { claim: 'somebody just boarded here', glyph: RELIEF_GLYPH },
  { claim: 'people are waiting to go up', glyph: WAITING_UP_GLYPH },
  { claim: 'people are waiting to go down', glyph: WAITING_DOWN_GLYPH },
  { claim: 'nobody is at this landing', glyph: EMPTY_LANDING_GLYPH },
];

function familyOf(glyph: string): MarkFamily {
  const family = FAMILY[glyph];
  if (family === undefined) {
    throw new Error(
      `no shape family for the mark ${glyph} (U+${(glyph.codePointAt(0) ?? 0).toString(16).toUpperCase()}). ` +
        'A new mark reached a landing row without being classified — add it to FAMILY in ' +
        'render/landingMarks.test.ts and check it does not share a silhouette with another claim.',
    );
  }
  return family;
}

/* -------------------------------------------------------------------------- *
 * A scene that puts every mark on one picture, and two of them on one row
 * -------------------------------------------------------------------------- */

class Recorder implements Canvas2DLike {
  readonly texts: { text: string; x: number; y: number; fill: string }[] = [];
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
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {}
  fillText(text: string, x: number, y: number): void {
    this.texts.push({ text, x, y, fill: this.fillStyle });
  }
}

const RECORDING: VizRecording = {
  schemaVersion: VIZ_SCHEMA_VERSION,
  runId: 'synthetic',
  seed: '7',
  buildingId: 'synthetic',
  buildingName: 'Synthetic Secure Tower',
  dispatcherProfileId: 'nearest-car',
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
  warnings: [],
};

const FRAME: Frame = {
  schemaVersion: VIZ_SCHEMA_VERSION,
  runId: 'synthetic',
  simTimeS: 60,
  cars: [
    {
      carId: 'main-A',
      bankId: 'main',
      label: 'A',
      heightM: 0,
      floorId: 'G',
      direction: 0,
      doorFraction: 0,
      doorPhase: 'closed',
      occupants: 0,
      loadFactor: 0,
    },
  ],
  landings: [
    // Floor `2` carries both directions, so `▲` and `▼` reach the row this test reads.
    { floorId: 'G', waitingUp: 2, waitingDown: 0 },
    { floorId: '2', waitingUp: 1, waitingDown: 3 },
    // Nobody at `3`, so the empty-landing dot is drawn too.
    { floorId: '3', waitingUp: 0, waitingDown: 0 },
  ],
  totalWaiting: 6,
  boardedLegs: 3,
  runningMeanWaitS: 20,
};

/** Four riders at floor `2`, one per band, with somebody having just boarded. */
function queueOfEveryBand(): FloorQueue {
  const riders: QueuedRider[] = BANDS.map((band, index) => ({
    passengerId: `p${String(index)}`,
    waitedS: 1000 - index,
    direction: 'down' as const,
    destinationFloorId: 'G',
    promisedCarId: undefined,
    band,
  }));
  return {
    floorId: '2',
    riders,
    groups: [
      { key: '', promisedCarId: undefined, riders, total: riders.length, oldestWaitS: 1000 },
    ],
    total: riders.length,
    oldestWaitS: 1000,
    worstBand: 'abandoned',
    recentlyBoarded: 2,
  };
}

const LOCKED_OUT: readonly LockedOutLanding[] = [
  { floorId: '2', cause: 'credential-not-read', legCount: 4, credentialGroups: ['tenant-alpha'] },
];

const layout = buildLayout({
  width: 1000,
  height: 640,
  floors: RECORDING.floors,
  shafts: RECORDING.shafts,
  gutterRightPx: 300,
});

/**
 * A theme with **no colour in it at all** — every field is the same string.
 *
 * Stronger than the existing colour-removal test, which collapses the four band colours and leaves
 * the rest of the palette standing. Here nothing anywhere on the canvas differs by fill, so a mark
 * that is only distinguishable by colour is not distinguishable.
 */
const MONOCHROME: Theme = (() => {
  const one = '#ffffff';
  return {
    ...DEFAULT_THEME,
    background: one,
    shaft: one,
    shaftEdge: one,
    floorLine: one,
    text: one,
    textDim: one,
    car: one,
    carLight: one,
    carHeavy: one,
    carOverload: one,
    doorSeam: one,
    waitingUp: one,
    waitingDown: one,
    warning: one,
    panel: one,
    highlight: one,
    badge: one,
    restricted: one,
    queueBands: { settling: one, waiting: one, long: one, abandoned: one },
    queueRelief: one,
  };
})();

function drawEverything(theme: Theme = MONOCHROME): Recorder {
  const ctx = new Recorder();
  drawScene(ctx, {
    recording: RECORDING,
    frame: FRAME,
    layout,
    theme,
    unservedFloorIds: ['3'],
    unansweredCallFloorIds: ['2'],
    lockedOutLandings: LOCKED_OUT,
    queues: [queueOfEveryBand()],
  });
  return ctx;
}

/** The row for a floor, as drawn: everything at that floor's `y`, left to right. */
function rowsOf(ctx: Recorder, at: Layout, floorId: string): readonly string[] {
  const row = at.rows.find((candidate) => candidate.floorId === floorId);
  if (row === undefined) throw new Error(`no row for floor ${floorId}`);
  return ctx.texts
    .filter((entry) => entry.y === row.y && entry.x >= at.plot.x + at.plot.width)
    .sort((a, b) => a.x - b.x)
    .map((entry) => entry.text);
}

/** The same, against the layout every other test in this file draws through. */
function rowFor(ctx: Recorder, floorId: string): readonly string[] {
  return rowsOf(ctx, layout, floorId);
}

/* -------------------------------------------------------------------------- *
 * The rule
 * -------------------------------------------------------------------------- */

describe('the marks on a landing row are distinguishable by shape', () => {
  it('puts the unanswered call and the abandoned rider on one row, as different shapes', () => {
    /*
     * The acceptance test for this unit's first defect, and it is deliberately built from the
     * co-occurrence rather than around it: floor `2` has a call no car answers **and** a rider
     * past the abandonment horizon, which is the state a real building reaches — the two facts
     * have the same cause.
     *
     * Asserted with the whole palette collapsed to one string, so nothing here can be rescued by
     * a colour.
     */
    const row = rowFor(drawEverything(), '2');
    expect(row).toContain(UNANSWERED_GLYPH);
    expect(row).toContain(BAND_GLYPH.abandoned);
    expect(familyOf(UNANSWERED_GLYPH)).not.toBe(familyOf(BAND_GLYPH.abandoned));
  });

  it('gives every claim on the row its own silhouette', () => {
    const claims: readonly Claim[] = [
      ...OTHER_CLAIMS,
      { claim: 'the wait-band ladder', glyph: BAND_GLYPH.abandoned },
    ];
    // The ladder is represented by its worst rung, because the other three are rings and the
    // ladder is allowed to be a family of its own — that is the next test.
    const seen = new Map<MarkFamily, string>();
    for (const { claim, glyph } of claims) {
      const family = familyOf(glyph);
      const owner = seen.get(family);
      expect(
        owner,
        `"${claim}" draws ${glyph}, whose silhouette (${family}) is already ${String(owner)}`,
      ).toBeUndefined();
      seen.set(family, claim);
    }
    // …and the ring family, which the ladder's other three rungs occupy, belongs to nobody else.
    for (const { claim, glyph } of OTHER_CLAIMS) {
      expect(familyOf(glyph), `"${claim}" is in the wait bands' own family`).not.toBe('ring');
    }
  });

  it('separates the three ring rungs by fill, which is the only thing that separates them', () => {
    const rungs = BANDS.filter((band) => familyOf(BAND_GLYPH[band]) === 'ring');
    const fills = rungs.map((band) => RING_FILL[BAND_GLYPH[band]]);
    expect(fills.every((fill) => fill !== undefined)).toBe(true);
    expect(new Set(fills).size).toBe(rungs.length);
    // Monotone: a longer wait is never a lighter mark.
    expect([...fills]).toEqual([...fills].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it('classifies every mark that actually reaches a landing row', () => {
    /*
     * The exhaustiveness half. A mark added to `drawLandings` by a future lane — the way the wait
     * bands were added beside `✗` — lands here with no family and throws, naming the codepoint.
     * Without this, the table above would be a snapshot of one afternoon.
     */
    const ctx = drawEverything();
    const onRows = layout.rows.flatMap((row) =>
      ctx.texts.filter(
        (entry) => entry.y === row.y && entry.x >= layout.plot.x + layout.plot.width,
      ),
    );
    expect(onRows.length).toBeGreaterThan(0);
    const singles = onRows.map((entry) => entry.text).filter((text) => [...text].length === 1);
    expect(singles.length).toBeGreaterThan(0);
    for (const mark of new Set(singles)) expect(() => familyOf(mark)).not.toThrow();
  });

  it('still says the four bands in four different marks, with the colour gone', () => {
    // The property `riderQueue.test.ts` already had, re-checked here against the drawn row rather
    // than against the plan, because the plan is not what a reader looks at.
    const row = rowFor(drawEverything(), '2');
    const bandMarks = BANDS.map((band) => BAND_GLYPH[band]);
    for (const mark of bandMarks) expect(row).toContain(mark);
    expect(new Set(bandMarks).size).toBe(BANDS.length);
  });

  it('draws the same marks with the palette restored — the fix is not a theme change', () => {
    const flat = rowFor(drawEverything(MONOCHROME), '2');
    const full = rowFor(drawEverything(DEFAULT_THEME), '2');
    expect(full).toEqual(flat);
  });

  it('puts the row’s own worst band on an aggregated row’s caption, not a fixed mark', () => {
    /*
     * `BAND_GLYPH` has **two readers** and only one of them was exercised: the glyph loop, and the
     * caption `drawQueueRow` puts beside a bar once the row has aggregated. Freezing the caption's
     * mark to `BAND_GLYPH.long` came back **green** against every test in this package — the
     * two-reader false negative § D154 and § D157 both record, in this file's own subject.
     *
     * It matters more than it looks: past 40 riders a landing has no individual glyphs at all, so
     * that caption is the *only* mark carrying how bad the wait is, and a deep queue is exactly
     * when somebody is looking.
     */
    const deep = (band: WaitBand): FloorQueue => {
      const riders: QueuedRider[] = Array.from({ length: 60 }, (_, index) => ({
        passengerId: `d${String(index)}`,
        waitedS: 900 - index,
        direction: 'down' as const,
        destinationFloorId: 'G',
        promisedCarId: undefined,
        band,
      }));
      return {
        floorId: '2',
        riders,
        groups: [{ key: '', promisedCarId: undefined, riders, total: 60, oldestWaitS: 900 }],
        total: 60,
        oldestWaitS: 900,
        worstBand: band,
        recentlyBoarded: 0,
      };
    };
    const captionFor = (band: WaitBand, at: Layout): string => {
      const ctx = new Recorder();
      drawScene(ctx, { recording: RECORDING, frame: FRAME, layout: at, theme: MONOCHROME, queues: [deep(band)] });
      const caption = rowsOf(ctx, at, '2').find((text) => text.includes('60 waiting'));
      expect(caption, `an aggregated row draws a caption for ${band}`).toBeDefined();
      return caption ?? '';
    };
    /*
     * **Both** captions, because the bar branch spells the mark twice — once in the full caption
     * and once in the shortened one it falls back to when the gutter cannot hold the oldest wait.
     * A first version of this test used only the default gutter, which takes the *short* branch,
     * and the freeze on the long branch stayed green. Two readers again, one level down.
     */
    const roomy = buildLayout({
      width: 1600,
      height: 640,
      floors: RECORDING.floors,
      shafts: RECORDING.shafts,
      gutterRightPx: 560,
    });
    for (const [name, at] of [['default gutter', layout], ['wide gutter', roomy]] as const) {
      const captions = BANDS.map((band) => captionFor(band, at));
      const marks = captions.map((caption) => [...caption][0] ?? '');
      expect(marks, `${name}: each caption carries its own band`).toEqual(
        BANDS.map((band) => BAND_GLYPH[band]),
      );
      expect(new Set(marks).size).toBe(BANDS.length);
    }
    // …and the two gutters really do take different branches, or the loop above is one test twice.
    expect(captionFor('long', layout)).not.toEqual(captionFor('long', roomy));
    expect(captionFor('long', roomy)).toContain('longest');
  });
});
