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

import type { Frame, VizRecording } from '../contract/types.js';
import type { Layout } from './layout.js';

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
  readonly carHeavy: string;
  readonly doorSeam: string;
  readonly waitingUp: string;
  readonly waitingDown: string;
  readonly warning: string;
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
  carHeavy: '#e0714a',
  // Distinct from `background` on purpose. They would look the same on screen, but a test that
  // identifies the door seam by its fill would then also match the background wash, and it did.
  doorSeam: '#0b0e13',
  waitingUp: '#3fb27f',
  waitingDown: '#c07ad8',
  warning: '#e0b040',
});

export interface SceneInput {
  readonly recording: VizRecording;
  readonly frame: Frame;
  readonly layout: Layout;
  readonly theme?: Theme;
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
  drawFooter(ctx, recording, frame, layout, theme);
  ctx.restore();
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
  const mean = frame.runningMeanWaitS;
  ctx.fillText(
    `waiting ${String(frame.totalWaiting)}   boarded ${String(frame.boardedLegs)} legs   mean wait so far ${
      mean === undefined ? '—' : `${mean.toFixed(1)} s`
    }`,
    layout.width - 12,
    30,
  );

  // The one statistic a viewer must never quietly average. `awtIsValid` is copied from the
  // summary, not recomputed, so the picture and the report suppress on the same grounds.
  if (recording.summary.saturated || !recording.summary.awtIsValid) {
    ctx.fillStyle = theme.warning;
    ctx.fillText(
      recording.summary.saturated ? 'SATURATED — AWT suppressed' : 'AWT suppressed',
      layout.width - 12,
      10,
    );
  }
}

function drawFloors(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { layout } = input;
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  for (const row of layout.rows) {
    ctx.strokeStyle = theme.floorLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.plot.x, row.y);
    ctx.lineTo(layout.plot.x + layout.plot.width, row.y);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = theme.textDim;
    ctx.fillText(row.label, layout.plot.x - 8, row.y);
  }
}

function drawShafts(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { recording, layout } = input;
  const servedById = new Map(recording.shafts.map((shaft) => [shaft.carId, new Set(shaft.servedFloorIds)]));
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
    ctx.fillText(column.label, column.centreX, layout.plot.y - 4);
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

    ctx.fillStyle =
      car.loadFactor >= 0.8 ? theme.carHeavy : car.loadFactor >= 0.5 ? theme.car : theme.carLight;
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

    if (car.direction !== 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = car.direction === 1 ? theme.waitingUp : theme.waitingDown;
      ctx.fillText(car.direction === 1 ? '▲' : '▼', column.x + w + 6, centreY);
    }
  }
}

function drawLandings(ctx: Canvas2DLike, input: SceneInput, theme: Theme): void {
  const { frame, layout } = input;
  const rowById = new Map(layout.rows.map((row) => [row.floorId, row]));
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
      ctx.fillText(`▼${String(landing.waitingDown)}`, cursor, row.y);
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
  ctx.fillText(`${recording.status} · ${String(recording.summary.generated)} generated`, 12, y - 10);
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
