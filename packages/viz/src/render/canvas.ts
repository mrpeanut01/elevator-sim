/**
 * The renderer: one {@link Frame} onto one 2D context.
 *
 * Minimal on purpose. Phase 4's foundation wave delivers the *contract*, and a renderer exists
 * here to prove the contract carries everything a picture needs — a shaft, a car at its
 * analytic height, doors that open and shut, landing calls, a saturation warning — not to be
 * the finished viewer. Wave 2 replaces the drawing without touching anything above it.
 *
 * ## Why it draws against a structural interface
 *
 * {@link Canvas2DLike} is the subset of `CanvasRenderingContext2D` this file uses, written out
 * rather than imported from the DOM lib. Two payoffs, and the second is the one that matters:
 *
 * 1. The module has no DOM dependency, so it type-checks and runs under Node.
 * 2. A test can pass a recording stub and assert *what was drawn* — that a car appears at the
 *    y its height maps to, that a shut door is drawn shut. Rendering is the part of a viewer
 *    that normally escapes testing altogether; here it does not, and the seam is a real one
 *    because `src/dev/main.ts` passes the browser's own context through it.
 *
 * `drawScene` is a pure function of `(frame, recording, layout, theme)` in the sense that
 * matters: given equal inputs it issues an equal sequence of calls. That is asserted directly
 * in `canvas.test.ts`, and it is why "a stored run replays visually identically" follows from
 * the frame sequences matching.
 */

import type { LandingAssignment, OverlayMetrics } from '../frame/overlay.js';
import { meansAreSuppressed } from '../frame/overlay.js';
import type { DoorPhase, Frame, VizRecording } from '../contract/types.js';
import type { Layout } from './layout.js';
import { LOAD_ALARM, drawOverlay, loadColour } from './overlay.js';
import { windowClause } from './runSummary.js';

/** The subset of a 2D canvas context this renderer uses. */
export interface Canvas2DLike {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: 'center' | 'end' | 'left' | 'right' | 'start';
  textBaseline: 'alphabetic' | 'bottom' | 'hanging' | 'ideographic' | 'middle' | 'top';
  globalAlpha: number;
  save(): void;
  restore(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
}

export interface Theme {
  readonly background: string;
  readonly shaft: string;
  readonly shaftEdge: string;
  readonly floorLine: string;
  readonly text: string;
  readonly textDim: string;
  readonly car: string;
  readonly carLight: string;
  /** A car at or over the 80 % fill rule. Not the overload alarm — see {@link Theme.carOverload}. */
  readonly carHeavy: string;
  /** A car at or over the 1.1 overload alarm. Always accompanied by the `!` glyph — `KB-15b`. */
  readonly carOverload: string;
  readonly doorSeam: string;
  readonly waitingUp: string;
  readonly waitingDown: string;
  readonly warning: string;
  /** The metrics panel's ground. */
  readonly panel: string;
  /** A landing or shaft the pointer/keyboard has selected — `RV-T3`. */
  readonly highlight: string;
  /** An entrance or transfer floor's badge — `RV-07`. */
  readonly badge: string;
  /** A landing no car may serve — `RV-08`. */
  readonly restricted: string;
}

/** Readable on a projector and in a screenshot, which is the whole specification. */
export const DEFAULT_THEME: Theme = Object.freeze({
  background: '#0f1319',
  shaft: '#171d26',
  shaftEdge: '#2b3542',
  floorLine: '#232c37',
  text: '#e6edf3',
  textDim: '#7d8896',
  car: '#4f9ee8',
  carLight: '#3fb27f',
  carHeavy: '#e0a03a',
  carOverload: '#e0473a',
  // Distinct from `background` on purpose. They would look the same on screen, but a test that
  // identifies the door seam by its fill would then also match the background wash, and it did.
  doorSeam: '#0b0e13',
  waitingUp: '#3fb27f',
  waitingDown: '#c07ad8',
  warning: '#e0b040',
  panel: '#141a23',
  highlight: '#f2f6fa',
  badge: '#6f7dd6',
  restricted: '#8a6f4a',
});

export interface SceneInput {
  readonly recording: VizRecording;
  readonly frame: Frame;
  readonly layout: Layout;
  readonly theme?: Theme;
  /**
   * The live metrics panel's data. Omitted, no panel is drawn.
   *
   * Passed in rather than computed here because `drawScene` must stay a pure function of its
   * inputs — the property `canvas.test.ts` asserts and the one that turns "the frame sequences
   * match" into "the pictures match".
   */
  readonly overlay?: OverlayMetrics | undefined;
  /** The landing the reader has selected, and the car the record says answers it — `RV-T3`. */
  readonly selection?: SceneSelection | undefined;
  /**
   * Floor ids that no shaft in this building serves — `RV-08`.
   *
   * Derived by the caller from the recording's own `servedFloorIds`, so that "unassignable" is a
   * statement about the geometry rather than about how long somebody has been waiting.
   */
  readonly unservedFloorIds?: readonly string[] | undefined;
  /**
   * Floors with somebody standing at a call **no car answers in this run** — `D10`, `RV-08`.
   *
   * Distinct from {@link SceneInput.unservedFloorIds}, which is geometry: a floor no shaft
   * reaches. This is an *outcome* — a call the run left unanswered — and until now its only
   * surface anywhere in the viewer was the caption `drawSelection` draws for a landing the reader
   * had picked out of the landing `<select>`. That selector is `wide-only` (dropped below 1280 px)
   * and the Phase 9 design sends it to Advanced mode, while the same design lists a locked-out
   * call among the facts Basic mode may never hide. A fact with one optional surface is a fact
   * that is usually not shown, so it is drawn on the landing itself and named in the banner.
   *
   * Derived by the caller from `landingAssignmentsAt`, for the reason `SceneInput.overlay` is:
   * `drawScene` stays a pure function of its inputs, and the renderer never reaches for a
   * recording-wide scan of its own.
   */
  readonly unansweredCallFloorIds?: readonly string[] | undefined;
}

/**
 * What the reader has picked out, and what the record says about it.
 *
 * The three destination fields are absent under the conventional model and present under
 * `destination-dispatch`, where the thing selected is a *destination call* rather than a
 * direction button. See {@link LandingAssignment}.
 */
export interface SceneSelection {
  readonly floorId: string;
  readonly answeredByCarId?: string | undefined;
  readonly answeredInS?: number | undefined;
  readonly waiting?: number | undefined;
  readonly oldestWaitS?: number | undefined;
  /** Where this call is going, under `destination-dispatch`. */
  readonly destinationFloorId?: string | undefined;
  /** The car the landing panel named, under `destination-dispatch`. */
  readonly promisedCarId?: string | undefined;
}

const FONT = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
const FONT_BOLD = 'bold 14px ui-monospace, SFMono-Regular, Menlo, monospace';

export function drawScene(ctx: Canvas2DLike, input: SceneInput): void {
  const { recording, frame, layout } = input;
  const theme = input.theme ?? DEFAULT_THEME;

  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  drawHeader(ctx, input, theme);
  drawFloors(ctx, input, theme);
  drawShafts(ctx, input, theme);
  drawCars(ctx, input, theme);
  drawLandings(ctx, input, theme);
  drawSelection(ctx, input, theme);
  drawFooter(ctx, recording, frame, layout, theme);
  if (input.overlay !== undefined) {
    drawOverlay(ctx, { recording, frame, layout, theme, metrics: input.overlay });
  }
  ctx.restore();
}

/**
 * A glyph per door phase, so door state is never carried by geometry alone — `KB-15a`.
 *
 * `D18` split `KB-15` because the row claimed three redundant signals and shipped one. The gap
 * width is a real signal and stays; this is the second one, and it is a *glyph* rather than a
 * colour precisely because the complaint was that colour was doing the work.
 *
 * The pair of half-blocks reads as leaves: `◂▸` are moving apart, `▸◂` are coming together.
 */
export function doorGlyph(phase: DoorPhase): string {
  switch (phase) {
    case 'closed':
      return '▮';
    case 'opening':
      return '◂▸';
    case 'open':
      return '▯';
    case 'closing':
      return '▸◂';
  }
}

function drawHeader(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { recording, frame, layout } = input;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = FONT_BOLD;
  ctx.fillStyle = theme.text;
  ctx.fillText(recording.buildingName, 12, 10);

  ctx.font = FONT;
  ctx.fillStyle = theme.textDim;
  ctx.fillText(
    `${recording.dispatcherProfileId} · seed ${recording.seed} · ${formatClock(frame.simTimeS)} / ${formatClock(recording.endedAt)}`,
    12,
    30,
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = theme.text;
  ctx.fillText(
    `waiting ${String(frame.totalWaiting)}   boarded ${String(frame.boardedLegs)} legs   ${meanClause(
      recording,
      frame,
    )}`,
    layout.width - 12,
    30,
  );

  // The one statistic a viewer must never quietly average. `awtIsValid` is copied from the
  // summary, not recomputed, so the picture and the report suppress on the same grounds.
  //
  // A run that did not deliver everybody leads the banner (`RV-16`): it is the fact that decides
  // how much of the rest means anything, and until wave 2 it lived only in the DOM status line.
  const banner: string[] = [];
  if (recording.status !== 'completed') {
    banner.push(
      `${recording.status.toUpperCase()} — ${String(recording.summary.undelivered)} undelivered`,
    );
  }
  if (recording.summary.saturated) banner.push('SATURATED — AWT suppressed');
  else if (!recording.summary.awtIsValid) banner.push('AWT suppressed');
  // `D10` — a call no car answered is never left to the landing selector alone. See
  // {@link SceneInput.unansweredCallFloorIds}.
  const unanswered = input.unansweredCallFloorIds ?? [];
  if (unanswered.length > 0) {
    banner.push(
      `${String(unanswered.length)} landing${unanswered.length === 1 ? '' : 's'} unanswered — ${
        unanswered.length === 1 ? 'no car answers' : 'no car answers those calls'
      } in this run`,
    );
  }
  if (banner.length > 0) {
    ctx.fillStyle = theme.warning;
    ctx.fillText(banner.join('   ·   '), layout.width - 12, 10);
  }
}

/**
 * The header's third field: the live running mean, or the fact that it is suppressed.
 *
 * ## Why a suppressed run gets no number here, and why that is not a display preference
 *
 * The header used to draw `mean wait so far 87.7 s` unconditionally, on the line immediately
 * below the `SATURATED — AWT suppressed` banner *the same function draws*. Worse than two
 * surfaces disagreeing: it is **one** `<canvas role="img">`, whose `aria-label` — written by
 * `describeFrame` from the same summary — reads *"Mean waiting time is suppressed… Rolling mean
 * wait over the last 300 seconds is not reported."* The sighted reader saw a number the
 * non-sighted reader was told did not exist, and **Export PNG** baked it into a shareable file,
 * because the canvas is the export source.
 *
 * It leaked on **both** grounds, not only saturation: Secure Tower at seed
 * `16757712606996968457` reports `TIMED-OUT — 20 undelivered · AWT suppressed` beside
 * `mean wait so far 21.0 s`.
 *
 * `Frame.runningMeanWaitS` being a *running* figure rather than the reported AWT does not rescue
 * it. `UX.md` § A.3 forbids **a mean waiting time** on a saturated run and **an AWT when
 * `awtIsValid` is false** on a successful one, and the running mean is a mean waiting time over a
 * run whose queues the statistics module refused to stand behind. `frame/overlay.ts` already
 * suppresses the rolling window mean and the per-bank means on exactly these grounds; this is the
 * one place that did not.
 *
 * The word rather than an em dash, because `—` already means *nobody has been served yet* — a
 * different fact, and one the reader can act on.
 */
function meanClause(recording: VizRecording, frame: Frame): string {
  if (meansAreSuppressed(recording)) return 'mean wait suppressed';
  const mean = frame.runningMeanWaitS;
  return `mean wait so far ${mean === undefined ? '—' : `${mean.toFixed(1)} s`}`;
}

function drawFloors(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { layout } = input;
  const unserved = new Set(input.unservedFloorIds ?? []);
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  for (const row of layout.rows) {
    // Every floor gets a line, on every building, at every pitch. Only the *label* thins.
    ctx.strokeStyle = theme.floorLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.plot.x, row.y);
    ctx.lineTo(layout.plot.x + layout.plot.width, row.y);
    ctx.stroke();

    if (!row.labelled) continue;
    ctx.textAlign = 'right';
    // Entrance and sky-lobby floors get a glyph as well as a colour: `⌂` for the entrance and
    // `⇄` for a transfer floor (RV-07). A reader must be able to find the sky lobby in a
    // greyscale screenshot.
    const badge = row.isTransferFloor ? '⇄ ' : row.isEntrance ? '⌂ ' : '';
    const restricted = unserved.has(row.floorId) ? ' ⊘' : '';
    ctx.fillStyle =
      restricted !== ''
        ? theme.restricted
        : badge === ''
          ? theme.textDim
          : theme.badge;
    // The gutter is everything left of the plot, less the 8 px the text is inset by. A label
    // longer than that is clipped here rather than drawn off the left edge of the canvas.
    const budget = layout.plot.x - 8 - (badge.length + restricted.length) * 8;
    ctx.fillText(
      `${badge}${fitLabel(row.label, budget)}${restricted}`,
      layout.plot.x - 8,
      row.y,
    );
  }
}

function drawShafts(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { recording, layout } = input;
  const servedById = new Map(recording.shafts.map((shaft) => [shaft.carId, new Set(shaft.servedFloorIds)]));
  const bankCount = new Set(recording.shafts.map((shaft) => shaft.bankId)).size;
  for (const column of layout.columns) {
    const served = servedById.get(column.carId);
    // A shaft is drawn only over the floors it physically serves — service zoning made visible,
    // and distinct from access and operational zoning, which are not geometry.
    const rows = layout.rows.filter((row) => served === undefined || served.has(row.floorId));
    const top = rows.reduce((min, row) => Math.min(min, row.y), layout.plot.y + layout.plot.height);
    const bottom = rows.reduce((max, row) => Math.max(max, row.y), layout.plot.y);
    ctx.fillStyle = theme.shaft;
    ctx.fillRect(column.x, top, column.width, Math.max(1, bottom - top));
    ctx.strokeStyle = theme.shaftEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(column.x, top, column.width, Math.max(1, bottom - top));

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = theme.textDim;
    ctx.font = FONT;
    // Clipped to the column, like the floor labels: a 16-shaft building gives each column about
    // 30 px, and `shuttle`/`office-low` run into their neighbours long before that. Found by
    // running the viewer on Mixed-Use High-Rise.
    ctx.fillText(fitLabel(column.label, column.width), column.centreX, layout.plot.y - 4);
    // RV-06: banks are grouped and *labelled*. Only when there is more than one — repeating
    // "main" over every column of a single-bank building is noise, and the shipped buildings
    // that have several banks are exactly the ones where the grouping is the point.
    if (bankCount > 1) {
      ctx.fillStyle = theme.badge;
      ctx.fillText(fitLabel(column.bankId, column.width), column.centreX, layout.plot.y - 18);
    }
  }
}

function drawCars(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { frame, layout } = input;
  const byCar = new Map(frame.cars.map((car) => [car.carId, car]));
  for (const column of layout.columns) {
    const car = byCar.get(column.carId);
    if (car === undefined) continue;
    const centreY = layout.yForHeight(car.heightM);
    const h = layout.carHeightPx;
    const y = centreY - h / 2;
    const x = column.x + 2;
    const w = column.width - 4;

    // Four bands, not three: the 80 % fill rule and the 1.1 overload alarm are different facts
    // about a car and used to share one colour that changed at 0.8 (D18, RV-14).
    ctx.fillStyle = loadColour(car.loadFactor, theme);
    ctx.fillRect(x, y, w, h);

    // Doors: a shut car shows the seam at the centre, an open one shows it split to the sides.
    // Drawing the *gap* rather than the leaves means `doorFraction` reads directly as a width.
    const gap = w * 0.9 * car.doorFraction;
    ctx.fillStyle = theme.doorSeam;
    ctx.fillRect(x + w / 2 - gap / 2, y, Math.max(1, gap), h);

    if (h >= 12) {
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = theme.text;
      ctx.fillText(String(car.occupants), column.centreX, centreY);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (car.direction !== 0) {
      ctx.fillStyle = car.direction === 1 ? theme.waitingUp : theme.waitingDown;
      ctx.fillText(car.direction === 1 ? '▲' : '▼', column.x + w + 6, centreY);
    }

    // KB-15b: the overload alarm carries a glyph, at every floor pitch, on every building. It is
    // a safety state, so it is never the thing that gets dropped when the rows get tight.
    if (car.loadFactor >= LOAD_ALARM) {
      ctx.font = FONT_BOLD;
      ctx.fillStyle = theme.carOverload;
      ctx.fillText('!', column.x - 6, centreY);
    }

    // KB-15a: the door phase carries a glyph as well as the gap width, wherever the pitch leaves
    // room for one. Below that it survives in the frame's text alternative (`describeFrame`),
    // which is what a screen reader gets and what `KB-13` requires.
    if (h >= 14) {
      ctx.font = FONT;
      ctx.fillStyle = theme.textDim;
      ctx.fillText(doorGlyph(car.doorPhase), column.centreX, y + h + 8);
    }
  }

  if (layout.hiddenShaftCount > 0) {
    // RS-05: never silently truncated. The CLI's `watch` says "showing N of M" and so does this.
    ctx.font = FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = theme.warning;
    ctx.fillText(
      `showing ${String(layout.columns.length)} of ${String(layout.columns.length + layout.hiddenShaftCount)} shafts — widen the window`,
      layout.plot.x,
      layout.plot.y - 20,
    );
  }
}

/**
 * The selected landing, and the assignment the record made for it — `RV-T3`.
 *
 * Drawn as a marker on the floor line plus a caption naming the car, because "highlight the
 * assigned car" is not readable unless the reader can also see *which* car was named.
 */
function drawSelection(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { layout, selection } = input;
  if (selection === undefined) return;
  const row = layout.rows.find((candidate) => candidate.floorId === selection.floorId);
  if (row === undefined) return;

  ctx.strokeStyle = theme.highlight;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(layout.plot.x, row.y);
  ctx.lineTo(layout.plot.x + layout.plot.width, row.y);
  ctx.stroke();

  // Under a panel the reader has been *told* which car to walk to, so that is the shaft to box —
  // and it is known even for a call nobody ever answered, which `answeredByCarId` is not.
  const highlighted = selection.promisedCarId ?? selection.answeredByCarId;
  const column = layout.columns.find((candidate) => candidate.carId === highlighted);
  if (column !== undefined) {
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = 2;
    ctx.strokeRect(column.x, layout.plot.y, column.width, layout.plot.height);
  }

  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = theme.highlight;
  ctx.fillText(describeSelection(selection), layout.plot.x, layout.plot.y - 20);
}

/** The caption for a selected landing. Exported so a text alternative can reuse the wording. */
export function describeSelection(selection: SceneSelection): string {
  const where =
    selection.destinationFloorId === undefined
      ? `floor ${selection.floorId}`
      : `floor ${selection.floorId} → ${selection.destinationFloorId}`;
  const waiting =
    selection.waiting === undefined ? '' : ` · ${String(selection.waiting)} waiting`;
  const oldest =
    selection.oldestWaitS === undefined ? '' : ` · longest ${selection.oldestWaitS.toFixed(0)} s`;
  // Three different situations, and the first draft collapsed the first two. Scrubbing to the end
  // of a completed run and reading "unassigned — no car answered this call" about a landing that
  // simply has nobody standing at it is a claim about the dispatcher that is not true.
  if (selection.waiting === 0) return `${where} · nobody is waiting here at this instant`;
  const when =
    selection.answeredInS === undefined ? '' : ` in ${selection.answeredInS.toFixed(0)} s`;

  /*
   * The panel case, and the sentence version 4 exists to make sayable.
   *
   * A promised passenger still standing at the horizon has `answeredByCarId === undefined`, and
   * the branch below would have called that "unassigned — no car answered this call". Under a
   * landing panel that is false: the panel named a car at the instant they arrived, and a
   * viewer saying otherwise reports a dispatcher failure that did not happen. Measured
   * reachable — Vertical City at 20 % pop/5 min, seed 20260727, 25 such legs.
   */
  if (selection.promisedCarId !== undefined) {
    const boarding =
      selection.answeredByCarId === undefined
        ? ' · still waiting when the run ended'
        : `${when === '' ? '' : ` · boards${when}`}`;
    return `${where}${waiting}${oldest} · panel promised car ${selection.promisedCarId}${boarding}`;
  }
  if (selection.answeredByCarId === undefined) {
    return `${where}${waiting}${oldest} · unassigned — no car answered this call in this run`;
  }
  return `${where}${waiting}${oldest} · answered by car ${selection.answeredByCarId}${when}`;
}

/**
 * One line for the landing selector — the same three facts as {@link describeSelection}, short.
 *
 * Here in `render/` rather than in `dev/main.ts` for the reason the whole of this directory is:
 * a label built inside the DOM entry point is a rendered value no test can reach, and this
 * package has already shipped a frame seven of whose eight fields could be replaced by constants
 * with the suite still green. `canvas.test.ts` mutation-tests every field this reads.
 */
export function landingOptionLabel(assignment: LandingAssignment): string {
  const where =
    assignment.destinationFloorId === undefined
      ? `${assignment.floorId} ${assignment.direction}`
      : `${assignment.floorId} → ${assignment.destinationFloorId}`;
  const head = `${where} — ${String(assignment.waiting)} waiting`;
  // The promise first, because under a panel it is what the passenger was actually told, and it
  // is known for a call no car ever reached. Only then the outcome.
  if (assignment.promisedCarId !== undefined) return `${head} → ${assignment.promisedCarId}`;
  if (assignment.answeredByCarId === undefined) return `${head} (unassigned)`;
  return `${head} → ${assignment.answeredByCarId}`;
}

/**
 * The glyph for a landing whose call no car answers — `D10`.
 *
 * `✗` and not `⊘`: `⊘` already means *this floor is served by no shaft* on the label gutter, and
 * the two are different claims — one about the building's geometry, one about what the dispatcher
 * did with a call it could legally have taken. Colour is not the only signal either way.
 */
const UNANSWERED_GLYPH = '✗';

function drawLandings(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { frame, layout } = input;
  const rowById = new Map(layout.rows.map((row) => [row.floorId, row]));
  const unanswered = new Set(input.unansweredCallFloorIds ?? []);
  const x = layout.plot.x + layout.plot.width + 10;
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const landing of frame.landings) {
    const row = rowById.get(landing.floorId);
    if (row === undefined) continue;
    if (landing.waitingUp === 0 && landing.waitingDown === 0) {
      ctx.fillStyle = theme.textDim;
      ctx.fillText('·', x, row.y);
      continue;
    }
    let cursor = x;
    if (landing.waitingUp > 0) {
      ctx.fillStyle = theme.waitingUp;
      const text = `▲${String(landing.waitingUp)}`;
      ctx.fillText(text, cursor, row.y);
      cursor += 8 * (text.length + 1);
    }
    if (landing.waitingDown > 0) {
      ctx.fillStyle = theme.waitingDown;
      const text = `▼${String(landing.waitingDown)}`;
      ctx.fillText(text, cursor, row.y);
      cursor += 8 * (text.length + 1);
    }
    if (unanswered.has(landing.floorId)) {
      ctx.fillStyle = theme.warning;
      ctx.fillText(UNANSWERED_GLYPH, cursor, row.y);
    }
  }
}

function drawFooter(
  ctx: Canvas2DLike,
  recording: VizRecording,
  frame: Frame,
  layout: Layout,
  theme: Theme,
): void {
  // The bar sits on the very bottom edge and the caption above it: overlapping the two put the
  // run status underneath the playhead, which is unreadable at exactly the moment it matters.
  const y = layout.height - 8;
  const barX = layout.plot.x;
  const barW = layout.plot.width;
  ctx.fillStyle = theme.shaft;
  ctx.fillRect(barX, y, barW, 6);

  const span = recording.endedAt - recording.startedAt;
  const fraction = span <= 0 ? 0 : (frame.simTimeS - recording.startedAt) / span;
  ctx.fillStyle = theme.car;
  ctx.fillRect(barX, y, barW * Math.max(0, Math.min(1, fraction)), 6);

  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.textDim;
  // `docs/10` § 7.4 and `UX.md` RV-T4: every figure carries its window, and this is the surface
  // that leaves the building. **Export PNG** writes the canvas to a file, so a bitmap whose
  // header quotes a mean without saying which 300 seconds it covers will be read as covering the
  // whole run. The clause is produced by `render/runSummary.ts` rather than formatted here, so
  // the panel and the picture cannot word the same window differently.
  ctx.fillText(
    `${recording.status} · ${String(recording.summary.generated)} generated · ${windowClause(recording.summary)}`,
    12,
    y - 10,
  );
}

/**
 * Approximate advance of one character at the 12 px monospace face this renderer uses.
 *
 * {@link Canvas2DLike} has no `measureText`, deliberately — adding one would oblige every test
 * stub to implement font metrics, and the seam's value is that a stub is three lines. 7.2 px is
 * the measured advance of `ui-monospace` at 12 px and is close enough to decide how many
 * characters fit in a gutter.
 */
const CHAR_ADVANCE_PX = 7.2;

/**
 * Clip a label to a pixel budget, with an ellipsis — `RV-09` and `RS-04`.
 *
 * Thinning by pitch keeps labels from colliding *vertically*. It does nothing about a label that
 * is simply too long: `vertical-city` names floors things like `Zone 5 hotel`, which at 12 px is
 * 84 px against a 72 px gutter, so the left end of every such label ran off the canvas. Right
 * alignment made it the *start* of the word that vanished, which is the half that identifies it.
 */
export function fitLabel(text: string, budgetPx: number): string {
  const budget = Math.max(1, Math.floor(budgetPx / CHAR_ADVANCE_PX));
  if (text.length <= budget) return text;
  if (budget <= 1) return '…';
  return `${text.slice(0, budget - 1)}…`;
}

/** `m:ss` for a run, `h:mm:ss` once it is long enough to need it. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (value: number): string => (value < 10 ? `0${String(value)}` : String(value));
  return h > 0 ? `${String(h)}:${pad(m)}:${pad(s)}` : `${String(m)}:${pad(s)}`;
}
