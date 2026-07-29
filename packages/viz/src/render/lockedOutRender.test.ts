/**
 * The locked-out landing, **drawn** and **spoken** — `docs/10` § 10.4.
 *
 * Three barriers now reach the run viewer and the whole point is that they are three:
 *
 * | mark | fact | kind of zoning |
 * |---|---|---|
 * | `⊘` on the label gutter | no shaft reaches this floor | service |
 * | `✗` beside the queue | a car could have come and none did | none — an outcome |
 * | `▩` beside the queue | no car may legally answer | access |
 *
 * A renderer that drew any two of them the same way would collapse concepts `CLAUDE.md` forbids
 * collapsing, so the assertions below are mostly about *difference*.
 *
 * The last suite is the field's liveness, checked the way `DECISIONS.md` § D154 says mutation
 * testing has to be checked: **per reader**, because a value with two readers can survive one of
 * them being frozen and look live.
 */

import { describe, expect, it } from 'vitest';

import {
  describeLockedOut,
  lockedOutLandingsAt,
  type LockedOutLanding,
} from '../access/lockedOut.js';
import { STATE_GLYPHS } from '../access/zoning.js';
import type { FloorQueue, QueuedRider } from '../frame/overlay.js';
import { constantSeries } from '../contract/series.js';
import { VIZ_SCHEMA_VERSION, type Frame, type VizRecording } from '../contract/types.js';
import { FIXTURE_DOOR_CONFIG, fixtureSummary } from '../fixtures.test-helper.js';
import { DEFAULT_THEME, drawScene, type Canvas2DLike } from './canvas.js';
import { describeFrame } from './describeFrame.js';
import { buildLayout } from './layout.js';

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

  /**
   * Only the marks drawn **on a landing row**, which is not the same set as "every `▩` on the
   * canvas": the banner carries the glyph too, at `y = 10`. Keying on position is what stops a
   * mutation that deletes the landing mark — or that spells it with the *unanswered* glyph —
   * passing because the banner still mentions it. That two-reader false negative is the shape
   * `DECISIONS.md` § D154 records, and both mutations survived the first version of this file.
   *
   * **The cut is the top of the plot, not an arbitrary 40 px**, and that was tightened at the
   * W6/U4 merge rather than after another survivor: `drawHeader` now writes the building mood at
   * `y = 48`, so a threshold chosen to clear the two header lines no longer did. Anything above
   * `layout.plot.y` is header — title, sub-line, counters, banner, mood — and none of it is a
   * landing.
   */
  marks(): readonly string[] {
    return this.texts.filter((entry) => entry.y >= layout.plot.y).map((entry) => entry.text);
  }

  /** Everything drawn, colour discarded. */
  get colourless(): string {
    return this.texts.map((entry) => entry.text).join('\n');
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
    { floorId: 'G', waitingUp: 1, waitingDown: 0 },
    { floorId: '2', waitingUp: 0, waitingDown: 4 },
    { floorId: '3', waitingUp: 0, waitingDown: 2 },
  ],
  totalWaiting: 7,
  boardedLegs: 3,
  runningMeanWaitS: 20,
};

const LOCKED_OUT: readonly LockedOutLanding[] = [
  { floorId: '2', cause: 'credential-not-read', legCount: 4, credentialGroups: ['tenant-alpha-staff'] },
];

/** Four riders standing at floor `2`, so the row carries T61's glyph run beside the marks. */
function queueAtFloorTwo(): FloorQueue {
  const riders: QueuedRider[] = [0, 1, 2, 3].map((n) => ({
    passengerId: `p${String(n)}`,
    waitedS: 30 + n,
    direction: 'down' as const,
    destinationFloorId: 'G',
    promisedCarId: undefined,
    band: 'long' as const,
  }));
  return {
    floorId: '2',
    riders,
    groups: [{ key: '', promisedCarId: undefined, riders, total: riders.length, oldestWaitS: 33 }],
    total: riders.length,
    oldestWaitS: 33,
    worstBand: 'long',
    recentlyBoarded: 0,
  };
}

const layout = buildLayout({
  width: 900,
  height: 640,
  floors: RECORDING.floors,
  shafts: RECORDING.shafts,
});

function draw(input: Partial<Parameters<typeof drawScene>[1]> = {}): Recorder {
  const ctx = new Recorder();
  drawScene(ctx, {
    recording: RECORDING,
    frame: FRAME,
    layout,
    theme: DEFAULT_THEME,
    ...input,
  });
  return ctx;
}

describe('the three barriers stay three marks', () => {
  it('draws the mark on the landing row itself, not only in the banner', () => {
    expect(draw({ lockedOutLandings: LOCKED_OUT }).marks()).toContain(
      STATE_GLYPHS['not-permitted'],
    );
    expect(draw().marks()).not.toContain(STATE_GLYPHS['not-permitted']);
  });

  it('still marks a locked-out landing whose direction counts have gone to zero', () => {
    /*
     * The empty-landing branch draws `·` and returns, and it gained a third condition at the
     * W6/U4 merge (`queue === undefined`). A landing the caller has *named* as locked out must
     * survive that branch: dropping it would put the picture and the banner in disagreement about
     * the same floor, which is the failure `meanClause`'s docstring records in the other
     * direction.
     */
    const quiet: Frame = {
      ...FRAME,
      landings: FRAME.landings.map((landing) =>
        landing.floorId === '2' ? { ...landing, waitingUp: 0, waitingDown: 0 } : landing,
      ),
    };
    const ctx = new Recorder();
    drawScene(ctx, {
      recording: RECORDING,
      frame: quiet,
      layout,
      theme: DEFAULT_THEME,
      lockedOutLandings: LOCKED_OUT,
    });
    expect(ctx.texts.filter((entry) => entry.y >= layout.plot.y).map((e) => e.text)).toContain(
      STATE_GLYPHS['not-permitted'],
    );
  });

  it('keeps a cell of air between the call marks and the rider glyphs', () => {
    /*
     * The two groups say different things about the same landing — `✗`/`▩` about the **call**,
     * `●◑○◆` about the **people** — and after the W6/U4 merge they share a row. Run together
     * they read as one string. Asserted in pixels because it is a pixel decision: the mark
     * occupies one cell, the advance past it is two, and the separator makes three before the
     * queue may start.
     *
     * The gap is not what stops the two groups being *confused*, and this comment used to say it
     * was: the abandoned band was `✖`, one codepoint and no distance at all from the unanswered
     * `✗`. That was a shape collision and space does not fix one — the band is now `◆`, and the
     * rule is in `render/landingMarks.test.ts`. This test is still about the space.
     */
    const ctx = new Recorder();
    drawScene(ctx, {
      recording: RECORDING,
      frame: FRAME,
      layout,
      theme: DEFAULT_THEME,
      lockedOutLandings: LOCKED_OUT,
      queues: [queueAtFloorTwo()],
    });
    const mark = ctx.texts.find(
      (entry) => entry.text === STATE_GLYPHS['not-permitted'] && entry.y >= layout.plot.y,
    );
    expect(mark).toBeDefined();
    const after = ctx.texts.filter(
      (entry) => entry.y === mark?.y && entry.x > (mark?.x ?? 0),
    );
    expect(after.length).toBeGreaterThan(0);
    expect((after[0]?.x ?? 0) - (mark?.x ?? 0)).toBeGreaterThanOrEqual(24);
  });

  it('is not the glyph for "no car answered" and not the glyph for "no shaft reaches"', () => {
    const marks = draw({
      lockedOutLandings: LOCKED_OUT,
      unansweredCallFloorIds: ['3'],
      unservedFloorIds: ['3'],
    }).marks();
    // All three drawn, all three different, on one picture — asserted over what reached the
    // **rows**, so spelling one barrier with another's glyph cannot pass on the banner's copy.
    expect(marks).toContain(STATE_GLYPHS['not-permitted']);
    expect(marks).toContain('✗');
    expect(marks.some((mark) => mark.includes(STATE_GLYPHS['not-served']))).toBe(true);
    expect(STATE_GLYPHS['not-permitted']).not.toBe('✗');
    expect(STATE_GLYPHS['not-permitted']).not.toBe(STATE_GLYPHS['not-served']);
  });

  it('draws both marks when a landing is unanswered *and* locked out, never one instead of the other', () => {
    const marks = draw({ lockedOutLandings: LOCKED_OUT, unansweredCallFloorIds: ['2'] }).marks();
    expect(marks.filter((mark) => mark === '✗')).toHaveLength(1);
    expect(marks.filter((mark) => mark === STATE_GLYPHS['not-permitted'])).toHaveLength(1);
  });
});

describe('the banner says which credential, not just how many', () => {
  it('names the credential the dispatcher is not reading', () => {
    const banner = draw({ lockedOutLandings: LOCKED_OUT }).colourless;
    expect(banner).toContain('1 landing locked out');
    expect(banner).toContain('tenant-alpha-staff');
    expect(banner).toContain('not read');
    // The unabridged claim lives in the sentence the `aria-label` carries.
    expect(
      describeFrame({ recording: RECORDING, frame: FRAME, lockedOutLandings: LOCKED_OUT }),
    ).toContain('no car may legally answer');
  });

  it('never overprints the building name, however many clauses it grows', () => {
    /*
     * Found by driving Secure Tower at 800 px: the title is drawn left at `x = 12` and the banner
     * right-aligned on the same line, and with four clauses they already met in the middle —
     * *"⊘Secure Tower"* with the banner written through it. Adding § 10.4's clause made it worse,
     * so the clip is asserted rather than eyeballed.
     */
    const narrow = buildLayout({
      width: 900,
      height: 640,
      floors: RECORDING.floors,
      shafts: RECORDING.shafts,
    });
    const ctx = new Recorder();
    drawScene(ctx, {
      recording: { ...RECORDING, status: 'timed-out' },
      frame: FRAME,
      layout: narrow,
      theme: DEFAULT_THEME,
      lockedOutLandings: LOCKED_OUT,
      unansweredCallFloorIds: ['3'],
    });
    const banner = ctx.texts.find((entry) => entry.text.includes('locked out'));
    // The clause survives the clip, because the banner is ordered by priority and a structural
    // refusal is second. What gets cut is the tail.
    expect(banner).toBeDefined();
    expect(banner?.text.endsWith('…')).toBe(true);
    expect(banner?.text.startsWith('TIMED-OUT')).toBe(true);
    // The clipped line, right-aligned at `width - 12`, must not reach the title's right edge.
    const titleRightPx = 12 + 'Synthetic Secure Tower'.length * 8.5;
    expect(900 - 12 - (banner?.text.length ?? 0) * 7.2).toBeGreaterThan(titleRightPx);
  });

  it('keeps the unanswered clause beside it rather than replacing it', () => {
    const banner = draw({
      lockedOutLandings: LOCKED_OUT,
      unansweredCallFloorIds: ['3'],
    }).colourless;
    expect(banner).toContain('unanswered');
    expect(banner).toContain('locked out');
  });
});

describe('the screen reader hears the same sentence', () => {
  it('gets the credential named, which the glyph cannot carry', () => {
    const text = describeFrame({
      recording: RECORDING,
      frame: FRAME,
      lockedOutLandings: LOCKED_OUT,
    });
    expect(text).toContain('tenant-alpha-staff');
    expect(text).toContain('locked out');
    expect(describeFrame({ recording: RECORDING, frame: FRAME })).not.toContain('locked out');
  });

  it('is worded by the same function the banner uses, in two lengths that carry the same facts', () => {
    // The canvas banner is one line beside a title, so it gets the `short` form: same function,
    // same landing count, same credentials, without the floor lists the picture already draws as
    // glyphs. The `aria-label` gets the whole sentence, because it has no width limit.
    const long = describeLockedOut(LOCKED_OUT);
    const short = describeLockedOut(LOCKED_OUT, { short: true });
    expect(draw({ lockedOutLandings: LOCKED_OUT }).colourless).toContain(short);
    expect(
      describeFrame({ recording: RECORDING, frame: FRAME, lockedOutLandings: LOCKED_OUT }),
    ).toContain(long);
    // Neither length may drop a fact the other carries about *what* and *whose credential*.
    for (const form of [long, short]) {
      expect(form).toContain('1 landing locked out');
      expect(form).toContain('tenant-alpha-staff');
    }
    expect(short.length).toBeLessThan(long.length);
  });
});

/*
 * `VizLeg.credentialGroup`'s liveness, per reader.
 *
 * § D154 records the shape of mutation testing's own failure mode: `wait95S` came back green
 * because the value had two readers and freezing one left the other live. So the field is frozen
 * **in each direction it can be frozen** and each reader is asserted separately:
 *
 * 1. frozen to absent — the *cause* changes, and the sentence stops naming any credential;
 * 2. frozen to a constant — the *named* credential changes while the counts do not.
 *
 * A test that only counted landings would pass both mutations, which is exactly the false
 * negative being guarded against.
 */
describe('freezing the credential is visible in every reader', () => {
  /** One waiting, never-served leg at a restricted floor, with the field under test on it. */
  function recordingWith(credentialGroup: string | undefined): VizRecording {
    return {
      ...RECORDING,
      legs: [
        {
          passengerId: 'p1',
          originFloorId: '2',
          destinationFloorId: 'G',
          direction: 'down',
          arrivedAt: 10,
          ...(credentialGroup === undefined ? {} : { credentialGroup }),
        },
      ],
    };
  }

  const classify = (credentialGroup: string | undefined): readonly LockedOutLanding[] =>
    lockedOutLandingsAt({
      recording: recordingWith(credentialGroup),
      at: 60,
      restrictedFloorIds: ['2', '3'],
      carriesCredential: false,
    });

  const live = classify('tenant-alpha-staff');

  it('reader 1 — the cause: frozen to absent, the classification changes what it blames', () => {
    const frozen = classify(undefined);
    expect(live[0]?.cause).toBe('credential-not-read');
    expect(frozen[0]?.cause).toBe('rider-has-no-credential');
    expect(describeLockedOut(frozen)).toContain('no dispatcher can serve them');
    expect(describeLockedOut(live)).toContain('this dispatcher does not read');
  });

  it('reader 2 — the name: frozen to a constant, the counts survive and the credential does not', () => {
    const frozen = classify('frozen');
    // The count is what a weaker test would have checked, and it is identical under the
    // mutation. Only the named credential moves — which is the field's whole content.
    expect(frozen[0]?.legCount).toBe(live[0]?.legCount);
    expect(describeLockedOut(frozen)).toContain('1 landing locked out');
    expect(describeLockedOut(frozen)).not.toContain('tenant-alpha-staff');
  });

  it('reader 3 — the picture: the banner text moves with the credential', () => {
    expect(draw({ lockedOutLandings: live }).colourless).not.toBe(
      draw({ lockedOutLandings: classify('frozen') }).colourless,
    );
  });

  it('reader 4 — the eligibility gate: with the credential read, the landing is not locked out', () => {
    // The one branch that reads the field for something other than words: a rider whose
    // credential the cars *do* receive is waiting, not locked out.
    expect(
      lockedOutLandingsAt({
        recording: recordingWith('tenant-alpha-staff'),
        at: 60,
        restrictedFloorIds: ['2', '3'],
        carriesCredential: true,
      }),
    ).toEqual([]);
  });
});
