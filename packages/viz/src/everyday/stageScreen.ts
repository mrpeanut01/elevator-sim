/**
 * **The § 7 stage** — GAMEPLAY § 7's warm cutaway, mounted in the Everyday shell's scroll region.
 *
 * This is the screen that replaces § D335's hand-off. Until this file existed, *Today's tower*
 * uncovered the Engineer surface and inset it beside the rail: honest, reversible, and not § 7 — the
 * design's stage is *the screen*, a cutaway elevation with people drawn one per person and coloured
 * by how long they have stood, which is the game's core read. `everyday/screens.ts` now routes
 * `stage` here, `SHELL_OWNED` is down to the menu alone, and the shell's register says what that
 * cost and what it did not.
 *
 * ## A second renderer, sanctioned
 *
 * `render/canvas.ts` draws the Engineer schematic and keeps drawing it. This is § D299 § 3's
 * *"second renderer with motion, doors and drawn people"*, and the two share the things that must
 * not fork — `frame/frameAt.ts` for where a car is, `frame/overlay.ts#queueAt` for who is standing
 * and how long, `live/bands.ts` for what a wait *means* — and fork only on paint. What is authored
 * here is pixels; every number came from somewhere both surfaces read.
 *
 * ## What this file decides: geometry, elements, and when to draw
 *
 * Everything a reader reads is `everyday/stageScreenModel.ts`', where it is pure and drivable
 * without a document. That split is the reason this file may hold `document` and
 * `requestAnimationFrame` at all — `boundaries.test.ts`'s `EVERYDAY_SHELL_FILES` names it, on the
 * same footing as the fixit and settings screens' DOM halves.
 *
 * ## § 14, which is an acceptance criterion here rather than advice
 *
 * - **One `requestAnimationFrame` loop, and it steps only while playing.** {@link requestFrame}
 *   schedules at most one pending frame; a playing transport re-schedules from inside the tick and a
 *   paused one does not, so a paused stage costs nothing. The frame is cancelled and the `resize`
 *   listener dropped on unmount, both in {@link MountedEverydayScreen.unmount}.
 * - **Canvas sizing reads the bounding rect and multiplies by `min(2, devicePixelRatio)`**, then
 *   sets the transform. Never a CSS scale. A **zero box is refused rather than drawn into** — § D335
 *   is explicit that a canvas measured under a `display:none` ancestor gets a zero box and paints
 *   nothing when revealed, so {@link sizeCanvas} answers `false` and the draw is skipped until a
 *   later frame finds a real box.
 * - **At most 26 figures at a landing, then `+N`; at most 9 riders in a car.** Both caps are
 *   `stageScreenModel.ts`' arithmetic, so *a crowd of 400 must not cost a frame* is a claim a test
 *   checks rather than a comment.
 *
 * ## § D293, and why this screen cannot break it
 *
 * No figure drawn here is a fold of the whole run. The header's three are
 * `live/observations.ts#observationsAt`'s, folded at the playhead; the strip's two lanes are
 * `live/raceStrip.ts`'s, sampled up to the playhead; the intervention stamp names the latest entry
 * *at or before* the playhead and nothing later. There is no `summary.meanWaitS` anywhere in this
 * file or its model, so a suppressed mean cannot be drawn — not because a guard refuses it, but
 * because the screen has nothing to draw it from. See `stageScreenModel.ts`'s docstring.
 *
 * ## What a run is here, and where it comes from
 *
 * `record/recordRun.ts` simulates a day **whole**, then it is played back. So the stage never
 * "runs" anything: it asks the data host to start the day, waits for a recording to arrive on a
 * host notification, and replays it with its own `Playback` over `playback/clock.ts`'s system clock.
 * Entering the screen with no run of the player's own presses `startRun` once — that is what
 * pressing *Today's tower* means, and it is the same latching press the Engineer shell's
 * *Run this shift* performs, so the day it produces may file.
 */

import { Playback } from '../playback/playback.js';
import { systemClock } from '../playback/clock.js';
import type { Frame, VizRecording } from '../contract/types.js';
import { frameAt } from '../frame/frameAt.js';
import { queueAt, type FloorQueue } from '../frame/overlay.js';
import { observationsAt } from '../live/observations.js';
import {
  RACE_SAMPLE_INTERVAL_S,
  raceLaneOf,
  raceStripViewOf,
  type RaceStripView,
} from '../live/raceStrip.js';
import type { LiveObservations } from '../live/types.js';
import type { ActionBarModel } from './actionBar.js';
import type { EverydayHost } from './host.js';
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import {
  DEFAULT_STAGE_SPEED_INDEX,
  MAX_CAR_RIDERS,
  stageAlarmOf,
  stageBarModelOf,
  stageCrowdCapOf,
  stageFilingLandsOn,
  stageGeometryOf,
  stageHeaderOf,
  stageInkFor,
  stageInterventionsOf,
  stageLegend,
  stageSpeedAt,
  STAGE_ABSENCES,
  STAGE_INTERVENTIONS,
  STAGE_NO_GHOST,
  STAGE_SPEEDS,
  type StageFigure,
  type StageGeometry,
} from './stageScreenModel.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayState } from './types.js';

/* -------------------------------------------------------------------------- *
 * The module store — what the § 3.3 refinement reads
 * -------------------------------------------------------------------------- */

/**
 * The three facts the shell's bar draw needs and cannot be handed.
 *
 * `screens.ts` calls `bar(state)` with the shell's state alone, so a screen whose row depends on
 * its own run state keeps that state here — `fixitScreen.ts`'s idiom, for its stated reason. The
 * mount writes it and asks for a redraw (`refreshBar`) whenever one of the three moves.
 */
const barFacts = { hasRun: false, dayClosed: false, recomputing: false };

/* -------------------------------------------------------------------------- *
 * Small DOM helpers — the shell's own, kept local rather than exported
 * -------------------------------------------------------------------------- */

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const EYEBROW = `font:500 9.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;

/**
 * Size a canvas for the device, or refuse.
 *
 * § 14: read the bounding rect, multiply by `min(2, devicePixelRatio)`, set the transform. Never a
 * CSS scale — a CSS-scaled canvas is a bitmap stretched, and the hairlines this cutaway is mostly
 * made of go to mush.
 *
 * **`false` for a zero box, and that is the § D335 rule rather than defensiveness.** A canvas
 * measured while an ancestor is `display:none` reports `0 × 0`; sizing to that and drawing produces
 * a blank canvas that stays blank when the ancestor comes back, because nothing re-measures. So a
 * zero box is *not* a size — it is "ask again next frame".
 */
function sizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | undefined {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return undefined;
  const dpr = Math.min(2, canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1);
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return undefined;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/* -------------------------------------------------------------------------- *
 * The cutaway
 * -------------------------------------------------------------------------- */

/** What one paint of the cutaway needs. All of it derived at one instant, by the caller. */
interface CutawayInput {
  readonly recording: VizRecording;
  readonly frame: Frame;
  readonly queues: readonly FloorQueue[];
  readonly geometry: StageGeometry;
  readonly floorLabelOf: (id: string) => string;
}

/**
 * § 7.2's picture: floor slabs, shaft wells as light voids, cars as dark boxes with amber doors that
 * split as they open, riders as marks inside the car, a `riders/capacity` readout, a direction arrow
 * while travelling, and the waiting crowd as capsules coloured by how long each person has stood.
 *
 * The colour is `stageScreenModel.ts#stageInkFor`, which reads `live/bands.ts`' boundaries — so a
 * capsule on this screen and the mood card in the Engineer rail are two paints of one banding.
 */
function drawCutaway(ctx: CanvasRenderingContext2D, input: CutawayInput): void {
  const { geometry: g, frame, recording } = input;
  ctx.clearRect(0, 0, g.width, g.height);

  /* The building's ground: a warm well behind the whole elevation. */
  ctx.fillStyle = C.cardSunk;
  roundedRect(ctx, g.plot.x, g.plot.y, g.plot.width, g.plot.height, 10);
  ctx.fill();

  /* --- Floor slabs, with the number and the tenant line in the gutter. --- */
  const slab = Math.max(2, Math.min(4, g.rowPitch * 0.16));
  for (const row of g.rows) {
    ctx.fillStyle = row.isEntrance ? C.ruleMid : C.ruleLight;
    ctx.fillRect(g.plot.x + 6, row.y, g.plot.width - 12, slab);
    if (!row.labelled) continue;
    ctx.fillStyle = row.isEntrance ? C.ink : C.warmGrey;
    ctx.font = `600 ${String(Math.min(11, Math.max(8, g.rowPitch * 0.45)))}px ${TYPE.mono}`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(input.floorLabelOf(row.floorId), g.plot.x + 4, row.y - 1, g.gutterWidth - 8);
  }

  /* --- The wells. A void is lighter than the building around it, per § 7.2. --- */
  for (const column of g.columns) {
    if (column.outOfService) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = C.faint;
      ctx.lineWidth = 1;
      ctx.strokeRect(column.x, g.plot.y + 6, column.width, g.plot.height - 12);
      ctx.restore();
      ctx.save();
      ctx.translate(column.centreX, g.plot.y + g.plot.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = C.warmGrey;
      ctx.font = `500 9px ${TYPE.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('OUT OF SERVICE', 0, 0);
      ctx.restore();
      continue;
    }
    ctx.fillStyle = C.paper;
    ctx.fillRect(column.x, g.plot.y + 6, column.width, g.plot.height - 12);
  }

  /* --- The waiting crowd, at the landings. --- */
  const capsuleW = 4.5;
  const capsuleH = Math.max(5, Math.min(11, g.rowPitch * 0.62));
  const perRow = Math.max(1, Math.floor((g.landing.width - 8) / (capsuleW + 2)));
  for (const floor of input.queues) {
    const row = g.rows.find((candidate) => candidate.floorId === floor.floorId);
    if (row === undefined) continue;
    const cap = stageCrowdCapOf(floor.riders.length);
    for (let index = 0; index < cap.drawn; index += 1) {
      const rider = floor.riders[index];
      if (rider === undefined) continue;
      const lane = Math.floor(index / perRow);
      const slot = index % perRow;
      /* Right-to-left from the well, so the queue reads as a crowd pressed against the doors. */
      const x = g.landing.x + g.landing.width - 6 - (slot + 1) * (capsuleW + 2) - lane * 1.5;
      const y = row.y - 2 - capsuleH - lane * (capsuleH * 0.25);
      ctx.fillStyle = stageInkFor(rider.waitedS);
      roundedRect(ctx, x, y, capsuleW, capsuleH, capsuleW / 2);
      ctx.fill();
    }
    if (cap.overflow !== undefined) {
      ctx.fillStyle = C.ink;
      ctx.font = `600 9px ${TYPE.mono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(cap.overflow, g.landing.x + 2, row.y - 2);
    }
  }

  /* --- The cars. --- */
  const carH = Math.max(9, Math.min(20, g.rowPitch * 0.86));
  for (const car of frame.cars) {
    const column = g.columns.find((candidate) => candidate.carId === car.carId);
    if (column === undefined || column.outOfService) continue;
    const shaft = recording.shafts.find((candidate) => candidate.carId === car.carId);
    const y = g.yForHeight(car.heightM) - carH;
    ctx.fillStyle = C.ink;
    roundedRect(ctx, column.x + 1.5, y, column.width - 3, carH, 3);
    ctx.fill();

    /* Doors: two amber leaves that split as they open. `doorFraction` is exact between events. */
    const leaf = ((column.width - 3) / 2) * (1 - car.doorFraction);
    if (leaf > 0.4) {
      ctx.fillStyle = C.sun;
      ctx.fillRect(column.x + 1.5, y + 1.5, leaf, carH - 3);
      ctx.fillRect(column.x + column.width - 1.5 - leaf, y + 1.5, leaf, carH - 3);
    }

    /* Riders aboard, capped at nine — § 14. A tenth mark says nothing a reader can count. */
    const aboard = Math.min(car.occupants, MAX_CAR_RIDERS);
    for (let index = 0; index < aboard; index += 1) {
      const across = index % 3;
      const down = Math.floor(index / 3);
      ctx.fillStyle = C.paper;
      ctx.fillRect(
        column.x + 4 + across * ((column.width - 8) / 3),
        y + 3 + down * ((carH - 6) / 3),
        2,
        2,
      );
    }

    /* `riders/capacity`, and the direction arrow while it travels. */
    ctx.fillStyle = C.warmGrey;
    ctx.font = `500 8.5px ${TYPE.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const capacity = shaft?.capacityPersons;
    ctx.fillText(
      capacity === undefined
        ? String(car.occupants)
        : `${String(car.occupants)}/${String(capacity)}`,
      column.centreX,
      y - 1.5,
    );
    if (car.direction !== 0) {
      ctx.fillStyle = C.terracotta;
      ctx.font = `600 9px ${TYPE.mono}`;
      ctx.fillText(car.direction > 0 ? '▲' : '▼', column.centreX, y - 10);
    }
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

/** The logical box the race lanes' polylines are computed in; the SVG scales it to fit. */
const LANE_BOX = { width: 300, height: 46 } as const;

/** § 7.4's dashed marker on the top lane — *a dashed sixty-second line so it reads without a legend*. */
const LANE_MARK_S = 60;

function mountStage(
  region: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = region.ownerDocument;
  const view = doc.defaultView;
  const host: EverydayHost = context.host;

  let alive = true;
  let playback: Playback | undefined;
  let adopted: VizRecording | undefined;
  let speedIndex = DEFAULT_STAGE_SPEED_INDEX;
  let started = false;
  let pendingFrame: number | undefined;
  /** The grid line the race strip was last sampled on — see {@link drawRace}. */
  let raceGrid = -1;
  let raceView: RaceStripView | undefined;
  /**
   * The recording an intervention was pressed over. § 7.6 asks for a `recomputing` beat rather than
   * a silent freeze; the beat ends when the host notifies with a *different* recording, which is the
   * only signal the façade offers and the correct one — § 1.4's re-simulation keeps the `runId`.
   */
  let recomputingOver: VizRecording | undefined;

  /* ---------------------------------------------------------------- chrome */

  const root = el(doc, 'section', 'everyday-stage');
  root.style.cssText = `display:flex;flex-direction:column;gap:${String(GAP.block)}px;min-width:0`;

  const header = el(doc, 'div', 'everyday-stage-header');
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'flex-wrap:wrap',
    `gap:${String(GAP.row + 2)}px`,
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.card)}px`,
    `background:${C.card}`,
    'padding:10px 14px',
  ].join(';');

  const clock = el(doc, 'span', 'everyday-stage-clock');
  clock.style.cssText = `font:500 20px ${TYPE.mono};color:${C.ink};letter-spacing:-.01em`;
  const phase = el(doc, 'span', 'everyday-stage-phase');
  phase.style.cssText = [
    `background:${C.amberWash}`,
    `border:1px solid ${C.amberEdge}`,
    `border-radius:${String(R.pill)}px`,
    'padding:3px 10px',
    `font:500 10px ${TYPE.mono}`,
    'letter-spacing:.1em',
    `color:${C.ink}`,
  ].join(';');

  const driving = el(doc, 'span', 'everyday-stage-driving');
  driving.style.cssText = 'display:flex;align-items:center;gap:6px';
  const drivingEyebrow = el(doc, 'span', undefined, 'DRIVING');
  drivingEyebrow.style.cssText = EYEBROW;
  const drivingDot = el(doc, 'span');
  drivingDot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${C.terracotta};flex:none`;
  const drivingName = el(doc, 'span', 'everyday-stage-driver');
  drivingName.style.cssText = 'font-size:13px;font-weight:600';
  driving.append(drivingEyebrow, drivingDot, drivingName);

  const figures = el(doc, 'div', 'everyday-stage-figures');
  figures.style.cssText = `display:flex;gap:${String(GAP.section)}px;margin-left:auto`;

  const playButton = el(doc, 'button', 'everyday-stage-play');
  playButton.type = 'button';
  playButton.style.cssText = [
    `background:${C.sun}`,
    `border:1px solid ${C.sun}`,
    `border-radius:${String(R.row)}px`,
    'padding:7px 13px',
    `color:${C.ink}`,
    'font-size:12.5px',
    'font-weight:600',
    'cursor:pointer',
  ].join(';');
  playButton.addEventListener('click', () => {
    togglePlay();
  });

  const speeds = el(doc, 'div', 'everyday-stage-speeds');
  speeds.style.cssText = `display:flex;gap:${String(GAP.tight)}px`;
  const speedButtons = STAGE_SPEEDS.map((speed, index) => {
    const button = el(doc, 'button', 'everyday-stage-speed', speed.label);
    button.type = 'button';
    button.dataset['speedIndex'] = String(index);
    button.addEventListener('click', () => {
      setSpeed(index);
    });
    return button;
  });
  speeds.append(...speedButtons);

  header.append(clock, phase, driving, figures, playButton, speeds);

  const alarm = el(doc, 'div', 'everyday-stage-alarm');
  alarm.setAttribute('role', 'status');
  alarm.style.cssText = [
    'display:none',
    'align-items:center',
    'gap:8px',
    `border:1px solid ${C.alarm}`,
    `border-radius:${String(R.row)}px`,
    `color:${C.alarm}`,
    'padding:6px 11px',
    'font-size:12.5px',
    'font-weight:600',
  ].join(';');

  const stageWrap = el(doc, 'div', 'everyday-stage-wrap');
  stageWrap.style.cssText = [
    'position:relative',
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.card)}px`,
    `background:${C.paper}`,
    'overflow:hidden',
  ].join(';');
  const canvas = el(doc, 'canvas', 'everyday-stage-canvas');
  canvas.style.cssText = 'display:block;width:100%;height:340px';
  const status = el(doc, 'div', 'everyday-stage-status');
  status.style.cssText = [
    'position:absolute',
    'inset:0',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:10px',
    'background:rgba(247,242,232,.86)',
    'text-align:center',
    'padding:0 24px',
  ].join(';');
  const statusText = el(doc, 'p', 'everyday-stage-status-text');
  statusText.style.cssText = `margin:0;color:${C.inkSoft};font-size:13px;max-width:44ch`;
  const startButton = el(doc, 'button', 'everyday-stage-start', 'Start');
  startButton.type = 'button';
  startButton.style.cssText = [
    `background:${C.sun}`,
    `border:1px solid ${C.sun}`,
    `border-radius:${String(R.row)}px`,
    'padding:10px 22px',
    `color:${C.ink}`,
    'font-size:14px',
    'font-weight:600',
    'cursor:pointer',
  ].join(';');
  startButton.addEventListener('click', () => {
    togglePlay();
  });
  status.append(statusText, startButton);
  stageWrap.append(canvas, status);

  const legend = el(doc, 'div', 'everyday-stage-legend');
  legend.style.cssText = `display:flex;flex-wrap:wrap;gap:${String(GAP.section)}px;font-size:11.5px;color:${C.warmGrey}`;
  for (const rung of stageLegend()) {
    const item = el(doc, 'span');
    item.style.cssText = 'display:flex;align-items:center;gap:6px';
    const disc = el(doc, 'span');
    disc.style.cssText = `width:9px;height:9px;border-radius:50%;background:${rung.color};flex:none`;
    item.append(disc, el(doc, 'span', undefined, rung.label));
    legend.append(item);
  }

  /* --- § 7.6's control, one button per shipped arm. --- */
  const interventions = el(doc, 'div', 'everyday-stage-interventions');
  interventions.style.cssText = `display:flex;align-items:center;flex-wrap:wrap;gap:${String(GAP.row + 2)}px`;
  const interventionButtons = STAGE_INTERVENTIONS.map((arm) => {
    const button = el(doc, 'button', 'everyday-stage-intervene', arm.label);
    button.type = 'button';
    button.dataset['interventionKind'] = arm.change.kind;
    button.title = arm.explains;
    button.style.cssText = [
      'background:transparent',
      `border:1px solid ${C.rule}`,
      `border-radius:${String(R.control)}px`,
      'padding:6px 12px',
      `color:${C.ink}`,
      'font-size:12.5px',
      'font-weight:600',
      'cursor:pointer',
    ].join(';');
    button.addEventListener('click', () => {
      intervene(arm.change);
    });
    return button;
  });
  const interventionStamp = el(doc, 'span', 'everyday-stage-stamp');
  interventionStamp.setAttribute('role', 'status');
  interventionStamp.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.warmGrey}`;
  const interventionRefusal = el(doc, 'span', 'everyday-stage-intervene-refusal');
  interventionRefusal.style.cssText = `font-size:11.5px;color:${C.label}`;
  interventions.append(...interventionButtons, interventionStamp, interventionRefusal);

  /* --- § 7.4's strip. SVG rather than a second canvas: `raceLaneOf` computes polyline
       attributes for exactly this, and one canvas is one thing to size and one thing to
       measure while hidden. --- */
  const race = el(doc, 'section', 'everyday-stage-race');
  race.style.cssText = [
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.card)}px`,
    `background:${C.card}`,
    'padding:11px 14px',
    `display:flex;flex-direction:column;gap:${String(GAP.row)}px`,
  ].join(';');
  const raceHead = el(doc, 'div');
  raceHead.style.cssText = 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap';
  const raceTitle = el(doc, 'span', undefined, 'THE DAY SO FAR');
  raceTitle.style.cssText = EYEBROW;
  const raceVerdict = el(doc, 'span', 'everyday-stage-verdict');
  raceVerdict.style.cssText = `font:500 12px ${TYPE.mono};color:${C.ink}`;
  raceHead.append(raceTitle, raceVerdict);
  const laneWait = laneBlock(doc, 'how long people are waiting');
  const laneStanding = laneBlock(doc, 'still standing');
  const raceNote = el(doc, 'p', 'everyday-stage-race-note', STAGE_NO_GHOST);
  raceNote.style.cssText = `margin:0;font-size:11.5px;color:${C.label}`;
  const raceFooter = el(doc, 'p', 'everyday-stage-race-footer');
  raceFooter.style.cssText = `margin:0;font-size:11.5px;color:${C.warmGrey}`;
  race.append(raceHead, laneWait.block, laneStanding.block, raceNote, raceFooter);

  const absences = el(doc, 'section', 'everyday-stage-absences');
  absences.style.cssText = 'max-width:70ch';
  const absencesTitle = el(doc, 'h2', undefined, 'What this stage does not do yet');
  absencesTitle.style.cssText = `${EYEBROW};font-size:10.5px;margin:0 0 6px`;
  const absencesList = el(doc, 'ul');
  absencesList.style.cssText = `margin:0;padding-left:18px;display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:${C.warmGrey}`;
  for (const absence of STAGE_ABSENCES) absencesList.append(el(doc, 'li', undefined, absence));
  absences.append(absencesTitle, absencesList);

  root.append(header, alarm, stageWrap, legend, interventions, race, absences);
  region.append(root);

  /* ------------------------------------------------------------- behaviour */

  /**
   * Schedule at most one frame — § 14's *one `requestAnimationFrame` loop*.
   *
   * A playing transport re-schedules from inside {@link tick}; a paused one draws once and stops.
   * So the cost of a paused stage is zero frames, which is what makes the guide's *"it steps only
   * when `running && screen === 'stage'`"* true here without a screen check: an unmounted screen
   * cancels its pending frame and schedules no more.
   */
  function requestFrame(): void {
    if (!alive || pendingFrame !== undefined || view === null || view === undefined) return;
    pendingFrame = view.requestAnimationFrame(tick);
  }

  function tick(): void {
    pendingFrame = undefined;
    if (!alive) return;
    draw();
    if (playback?.state === 'playing') requestFrame();
    else syncTransport();
  }

  function togglePlay(): void {
    if (playback === undefined) return;
    if (playback.state === 'playing') playback.pause();
    else {
      started = true;
      playback.play();
    }
    syncTransport();
    requestFrame();
  }

  function setSpeed(index: number): void {
    speedIndex = index;
    playback?.setSpeed(stageSpeedAt(index).simPerRealS);
    syncTransport();
    requestFrame();
  }

  function intervene(change: (typeof STAGE_INTERVENTIONS)[number]['change']): void {
    const current = adopted;
    if (playback === undefined || current === undefined) return;
    recomputingOver = current;
    barFacts.recomputing = true;
    context.refreshBar();
    /* The § 7.6 beat goes up on this frame rather than on the host's notification: *show a
       `recomputing` beat rather than freezing silently*, and the freeze starts here. */
    syncTransport();
    draw();
    /*
     * The playhead is *this* screen's, not the shell's — `EverydayHost.intervene`'s whole reason for
     * taking it. A change stamped at the Engineer transport's position would be filed at an instant
     * nobody was looking at.
     */
    host.intervene(playback.simTimeS, change);
  }

  /**
   * Take a recording the host has published.
   *
   * **Speed resets here and nowhere else** — § 4.6 and § 7.3: *a day must never vanish in three
   * seconds because the previous one ended at 30×*. The transport opens **paused** at
   * `recording.startedAt`, which is 06:00 on the clock, with the first frame drawn by the
   * {@link requestFrame} below.
   *
   * A re-simulated day is the exception the § 1.4 mechanism requires: playback resumes at the same
   * playhead, so the picture does not jump — the prefix is bit-identical, so the instant the player
   * was watching is the same instant it always was.
   */
  function adopt(recording: VizRecording): void {
    const resumeAtS = recomputingOver !== undefined ? playback?.simTimeS : undefined;
    const wasPlaying = recomputingOver !== undefined && playback?.state === 'playing';
    adopted = recording;
    recomputingOver = undefined;
    barFacts.recomputing = false;
    if (resumeAtS === undefined) {
      speedIndex = DEFAULT_STAGE_SPEED_INDEX;
      started = false;
    }
    playback = new Playback(recording, systemClock(), {
      speed: stageSpeedAt(speedIndex).simPerRealS,
      ...(resumeAtS === undefined ? {} : { startAtS: resumeAtS }),
    });
    if (wasPlaying) playback.play();
    raceGrid = -1;
    raceView = undefined;
    syncTransport();
    requestFrame();
  }

  /** The host said something changed. Adopt a new recording; otherwise just redraw the facts. */
  function onHostChange(): void {
    if (!alive) return;
    const runState = host.runState();
    barFacts.hasRun = runState.hasRun;
    barFacts.dayClosed = runState.dayClosed;
    context.setRunOpen(runState.open);
    const recording = host.recording();
    if (recording !== undefined && recording !== adopted) adopt(recording);
    context.refreshBar();
    syncTransport();
    requestFrame();
  }

  function syncTransport(): void {
    const playing = playback?.state === 'playing';
    playButton.textContent = playing ? '⏸ Pause' : '▶ Play';
    playButton.disabled = playback === undefined;
    for (const [index, button] of speedButtons.entries()) {
      const on = index === speedIndex;
      button.disabled = playback === undefined;
      button.setAttribute('aria-pressed', String(on));
      button.style.cssText = [
        `background:${on ? C.ink : 'transparent'}`,
        `border:1px solid ${on ? C.ink : C.rule}`,
        `border-radius:${String(R.control)}px`,
        'padding:5px 9px',
        `font:500 11px ${TYPE.mono}`,
        `color:${on ? C.paper : C.warmGrey}`,
        'cursor:pointer',
      ].join(';');
    }
    /*
     * § 7.3's single centred `Start`. It is up before the first press and gone after it, so the
     * overlay never sits over a moving picture; a run that has not arrived says so in the same
     * place, because a blank stage with no sentence is the control-that-does-nothing shape.
     */
    if (adopted === undefined) {
      statusText.textContent =
        recomputingOver !== undefined
          ? 'recomputing the day from the start…'
          : 'simulating today’s day — the stage draws the moment it lands';
      startButton.style.display = 'none';
      status.style.display = 'flex';
      return;
    }
    if (recomputingOver !== undefined) {
      statusText.textContent = 'recomputing the day from the start…';
      startButton.style.display = 'none';
      status.style.display = 'flex';
      return;
    }
    if (!started) {
      statusText.textContent = 'Paused at the start of the day. Nothing has happened yet.';
      startButton.style.display = '';
      status.style.display = 'flex';
      return;
    }
    status.style.display = 'none';
  }

  /** One paint: the header, the cutaway, the alarm, the strip. */
  function draw(): void {
    const recording = adopted;
    if (recording === undefined || playback === undefined) return;
    const simTimeS = playback.simTimeS;
    const observations: LiveObservations = observationsAt(recording, simTimeS);
    const labelOf = (id: string): string =>
      recording.floors.find((floor) => floor.id === id)?.label ?? id;

    const head = stageHeaderOf({
      simTimeS,
      recording,
      observations,
      dayStartS: host.dayStartS(),
      driverName:
        host.dispatcherById(recording.dispatcherProfileId)?.name ?? recording.dispatcherProfileId,
    });
    clock.textContent = head.clock;
    phase.textContent = head.phase;
    drivingName.textContent = head.driverName;
    drawFigures(head.figures);

    const alarmLine = stageAlarmOf(observations, labelOf);
    alarm.style.display = alarmLine === undefined ? 'none' : 'flex';
    if (alarmLine !== undefined) alarm.replaceChildren(breathingDot(doc), el(doc, 'span', undefined, alarmLine));

    const ctx = sizeCanvas(canvas);
    if (ctx !== undefined) {
      const rect = canvas.getBoundingClientRect();
      drawCutaway(ctx, {
        recording,
        frame: frameAt(recording, simTimeS),
        queues: queueAt(recording, simTimeS),
        geometry: stageGeometryOf({
          width: rect.width,
          height: rect.height,
          floors: recording.floors,
          shafts: recording.shafts,
          outOfServiceCarIds: recording.outOfServiceCarIds,
        }),
        floorLabelOf: labelOf,
      });
    }

    const intervention = stageInterventionsOf({
      interventions: host.interventions(),
      simTimeS,
      dayStartS: host.dayStartS(),
      hasRun: true,
      dayClosed: barFacts.dayClosed,
      recomputing: recomputingOver !== undefined,
    });
    interventionStamp.textContent = intervention.stamp;
    interventionRefusal.textContent = intervention.refusal ?? '';
    for (const button of interventionButtons) button.disabled = intervention.refusal !== undefined;

    drawRace(recording, simTimeS);
  }

  function drawFigures(list: readonly StageFigure[]): void {
    figures.replaceChildren();
    for (const figure of list) {
      const box = el(doc, 'div', 'everyday-stage-figure');
      box.style.cssText = 'display:flex;flex-direction:column;gap:1px';
      const label = el(doc, 'span', undefined, figure.label);
      label.style.cssText = EYEBROW;
      const value = el(doc, 'span', 'everyday-stage-figure-value', figure.value);
      value.style.cssText = `font:500 16px ${TYPE.mono};color:${figure.refusal === undefined ? C.terracotta : C.faint}`;
      box.append(label, value);
      /*
       * R13: a ratio carries the count it was taken over, in its own box. A count is its own `n`
       * and carries none, and a refusal carries a sentence instead of a number.
       */
      const under = figure.count ?? figure.refusal;
      if (under !== undefined) {
        const note = el(doc, 'span', 'everyday-stage-figure-count', under);
        note.style.cssText = `font:500 9.5px ${TYPE.mono};color:${C.label};max-width:22ch`;
        box.append(note);
      }
      figures.append(box);
    }
  }

  /**
   * § 7.4's two lanes.
   *
   * **Re-sampled only when the playhead crosses a 240 s grid line**, which is what
   * `raceSamplesOf`'s docstring asks its caller to do: the samples are one pass over the legs *per
   * grid point*, so re-deriving them sixty times a second would be the one thing on this screen that
   * genuinely costs a frame. Everything else here is a single pass at the playhead.
   */
  function drawRace(recording: VizRecording, simTimeS: number): void {
    const grid = Math.floor((simTimeS - recording.startedAt) / RACE_SAMPLE_INTERVAL_S);
    if (grid !== raceGrid || raceView === undefined) {
      raceGrid = grid;
      raceView = raceStripViewOf({ recording, ghost: undefined, simTimeS });
      const wait = raceLaneOf(
        raceView.yours,
        raceView.ghost,
        (sample) => sample.standingWaitS,
        LANE_BOX,
        recording.endedAt,
        LANE_MARK_S,
      );
      const standing = raceLaneOf(
        raceView.yours,
        raceView.ghost,
        (sample) => sample.standing,
        LANE_BOX,
        recording.endedAt,
        Math.max(1, ...raceView.yours.map((sample) => sample.standing)),
      );
      laneWait.line.setAttribute('points', wait.you);
      laneWait.mark.setAttribute('y1', String(wait.markY));
      laneWait.mark.setAttribute('y2', String(wait.markY));
      laneStanding.line.setAttribute('points', standing.you);
      laneStanding.mark.setAttribute('y1', String(standing.markY));
      laneStanding.mark.setAttribute('y2', String(standing.markY));
      raceFooter.textContent = raceView.footer;
    }
    raceVerdict.textContent = raceView.verdict;
  }

  /* ------------------------------------------------------------------ wire */

  const unsubscribe = host.subscribe(onHostChange);
  const onResize = (): void => {
    requestFrame();
  };
  view?.addEventListener('resize', onResize);

  /*
   * § 7.3: entering the stage is entering *the player's* day. `open` is false for boot's own demo
   * run (§ D232 — nobody chose it), for a watched or file-loaded run, and for a filed one, so this
   * asks for a day exactly when the player has not got one of their own on the stage.
   */
  if (!host.runState().open) host.startRun();
  onHostChange();

  return {
    unmount: () => {
      alive = false;
      if (pendingFrame !== undefined && view !== null && view !== undefined) {
        view.cancelAnimationFrame(pendingFrame);
      }
      pendingFrame = undefined;
      view?.removeEventListener('resize', onResize);
      unsubscribe();
      playback = undefined;
      adopted = undefined;
    },
    /**
     * § 3.3's primary on the stage: *Close the day* — *stops the clock and writes the report*.
     *
     * **And then opens it** (GitHub issue #206). The destination is
     * `stageScreenModel.ts#stageFilingLandsOn`'s, asked *after* the call with what the host says
     * happened rather than with what the press intended: `closeShift` returns normally from three
     * gates that file nothing, and the rush and watch stages press this same function. Its
     * docstring is the argument; what happens here is that it is asked.
     */
    primary: () => {
      playback?.pause();
      host.closeDay();
      syncTransport();
      const landing = stageFilingLandsOn(context.ctx, {
        dayClosed: host.runState().dayClosed,
        hasReport: host.lastReport() !== undefined,
      });
      if (landing !== undefined) context.go(landing);
    },
  };
}

/** One lane of § 7.4's strip: a caption, a dashed marker and your line. */
function laneBlock(
  doc: Document,
  caption: string,
): {
  readonly block: HTMLElement;
  readonly line: SVGPolylineElement;
  readonly mark: SVGLineElement;
} {
  const block = el(doc, 'div', 'everyday-stage-lane');
  block.style.cssText = 'display:flex;flex-direction:column;gap:3px';
  const label = el(doc, 'span', undefined, caption);
  label.style.cssText = EYEBROW;
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${String(LANE_BOX.width)} ${String(LANE_BOX.height)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = `width:100%;height:${String(LANE_BOX.height)}px;display:block`;
  const mark = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
  mark.setAttribute('x1', '0');
  mark.setAttribute('x2', String(LANE_BOX.width));
  mark.setAttribute('y1', String(LANE_BOX.height));
  mark.setAttribute('y2', String(LANE_BOX.height));
  mark.setAttribute('stroke', C.rule);
  mark.setAttribute('stroke-dasharray', '4 4');
  mark.setAttribute('stroke-width', '1');
  const line = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', C.terracotta);
  line.setAttribute('stroke-width', '2');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  line.setAttribute('points', '');
  svg.append(mark, line);
  block.append(label, svg);
  return { block, line, mark };
}

/** § 7.2's breathing dot beside the alarm sentence. */
function breathingDot(doc: Document): HTMLElement {
  const dot = el(doc, 'span');
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${C.alarm};flex:none`;
  return dot;
}

/** The § 3.3 refinement — worded by `stageScreenModel.ts#stageBarModelOf`, over the module store. */
function stageBar(state: EverydayState): ActionBarModel {
  return stageBarModelOf(state, barFacts);
}

/** The registry row — GAMEPLAY § 7's screen, mounted by `shell.ts` through `screens.ts`. */
export const STAGE_SCREEN: EverydayScreenModule = {
  key: 'stage',
  mount: mountStage,
  bar: stageBar,
};
