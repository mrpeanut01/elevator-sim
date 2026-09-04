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

import type { DispatcherProfile } from '@elevator-sim/core/browser';

import { Playback } from '../playback/playback.js';
import { systemClock } from '../playback/clock.js';
import type { Frame, VizRecording } from '../contract/types.js';
import { frameAt } from '../frame/frameAt.js';
import { queueAt, type FloorQueue } from '../frame/overlay.js';
import { observationsAt } from '../live/observations.js';
// AD-S17 — one derivation of *standing still* for both stages; see `render/carRest.ts`.
import { carRestsAt } from '../render/carRest.js';
import {
  RACE_SAMPLE_INTERVAL_S,
  raceLaneOf,
  raceStripViewOf,
  type RaceStripView,
} from '../live/raceStrip.js';
import type { LiveObservations } from '../live/types.js';
import type { GoalState } from '../shift/types.js';
import type { ActionBarModel } from './actionBar.js';
import type { EverydayHost } from './host.js';
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import {
  DEFAULT_STAGE_SPEED_INDEX,
  stageAlarmOf,
  stageBarModelOf,
  stageCarPaintOf,
  stageCarReadoutOf,
  stageCarRestBarOf,
  stageCrowdCapOf,
  stageFilingLandsOn,
  stageGeometryOf,
  stageGoalsOf,
  stageHeaderOf,
  stageInkFor,
  stageInterventionsOf,
  stageLegend,
  stageOpeningLineOf,
  stageSpeedAt,
  STAGE_AWAITING_RUN,
  STAGE_DRIVING_LABEL,
  STAGE_INTERVENTIONS,
  STAGE_NO_GHOST,
  STAGE_OUT_OF_SERVICE,
  STAGE_RECOMPUTING,
  STAGE_SPEEDS,
  STAGE_SWITCH_PICKER_LABEL,
  type StageFigure,
  type StageGeometry,
  type StageInterventionRow,
  type StageInterventionView,
  type StageSwitchTarget,
} from './stageScreenModel.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayState } from './types.js';
import {
  playThisCrowdRefusalFor,
  watchStageBarOf,
  SPECTATOR_MAKES_NO_CHANGES,
} from './watchStage.js';
import type { WatchingView } from '../watch/view.js';

/* -------------------------------------------------------------------------- *
 * The module store — what the § 3.3 refinement reads
 * -------------------------------------------------------------------------- */

/**
 * The four facts the shell's bar draw needs and cannot be handed.
 *
 * `screens.ts` calls `bar(state)` with the shell's state alone, so a screen whose row depends on
 * its own run state keeps that state here — `fixitScreen.ts`'s idiom, for its stated reason. The
 * mount writes it and asks for a redraw (`refreshBar`) whenever one of the four moves.
 *
 * **The fourth is not a host read, and that is what makes it belong here** — GitHub issue **#287**.
 * The first three are `EverydayHost.runState()` answers, so any screen could ask for them;
 * `dayEnded` is a fact about the transport *this* screen owns, and `everyday/host.ts` deliberately
 * exposes none. {@link syncTransport} is its one writer, on the edge rather than on every frame.
 */
const barFacts = { hasRun: false, dayClosed: false, recomputing: false, dayEnded: false };

/**
 * The same store's spectator half — GitHub issue **#182**, [§ D436](../../../../DECISIONS.md).
 *
 * `bar(state)` is handed the shell's state and nothing else, so the § 3.3 `stage · watching` row's
 * one refinement — § 20.15's withdrawal of the primary on a row from another day — has to be
 * somewhere the refinement can see. Written by {@link mountStage} on every host notification, beside
 * the four above, and cleared when the watch ends: a stale refusal is worse than none
 * (§ D227), and this one would sit on a *player's own* day claiming it belonged to somebody else.
 */
const watchFacts: { hasReplay: boolean; playRefusal: string | undefined } = {
  hasReplay: false,
  playRefusal: undefined,
};

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
 * The three goal states in § 19's ink — GitHub issue **#277**.
 *
 * Here rather than in `stageScreenModel.ts` because a colour is not a decision about what to say,
 * and here rather than taken from `dev/leftRail.ts#goalRowsOf` because that function answers in the
 * Engineer stylesheet's custom properties (`var(--faint)`, `var(--edge-strong)`) and this shell's
 * palette is `everyday/tokens.ts`. Every row short of the run's end is `pending`, so this table's
 * busiest entry is the faint one.
 *
 * KB-15 — *no colour-only signal* — is kept by the row rather than by this table: `GOAL_GLYPHS`'
 * `✓ × ·` sits at the head of every line and the value or the em dash sits at its end.
 */
const GOAL_INK: Readonly<Record<GoalState, string>> = Object.freeze({
  met: C.moss,
  missed: C.alarm,
  pending: C.faint,
});

/**
 * The cutaway's CSS height — GitHub issue **#303**, § D391.
 *
 * `docs/31-support-matrix.md` § 2 commits that at 360 px of CSS width **and above** the product
 * *"keeps the stage canvas at 60 % or more of the viewport height"*. This was `340px`, a literal
 * with no breakpoint, no viewport unit and no clamp, so the canvas held **42.5 %** at 1280×800 and
 * at 360×800, and **51.0 %** at 375×667 — measured through the player's own path on Chromium
 * headless shell r1194 by `viewportGates.browser.test.ts`, which registered all three.
 *
 * **1280×800 is the tier-1 desktop viewport**, so this was never the small-screen work: it failed
 * identically at the width `M2_MEASUREMENT.md` drives the slice at, where there is no narrow layout
 * to build. That is why #303 is filed apart from **#240** and why landing #240 could not have
 * closed it.
 *
 * ## Why a viewport unit rather than flexing to fill
 *
 * The design handoff draws this container as `min-height:0` inside a flex column with the canvas at
 * `height:100%` — the stage **fills what is left** — and the handoff is canonical for the interface.
 * It cannot be reproduced literally here, and the reason is written down one directory over:
 * `index.html:1541` refuses a percentage height against an auto-height wrap because *"#stage is
 * height: 100%, and a percentage against an auto-height wrap falls back to the canvas's own bitmap
 * height, which the per-frame resize then feeds back into the wrap — the box grows every frame."*
 * The Everyday stage has exactly that shape: it sits in `.everyday-screen`, which is
 * `overflow-y:auto` and therefore auto-height, and {@link sizeCanvas} writes the bitmap from the
 * laid-out box on every resize. A definite, viewport-derived height is the one thing that both
 * tracks the viewport and cannot feed back into itself.
 *
 * ## Why exactly `60vh`, and the margin that leaves
 *
 * It is **the clause's own number**, and it is already this repository's answer to this question:
 * `RX-03` fixed the Engineer surface with `.stage-wrap { height: 60vh; min-height: 60vh }`
 * (`index.html:1551`). One commitment, one figure, in both shells — a second number here would be
 * two answers to *how tall is the stage* and no way to tell which one § 2 meant.
 *
 * It satisfies the clause at **every** viewport height rather than at the three the matrix names,
 * because `60vh` *is* 60 % of the viewport by construction. Say the cost plainly: that is a margin
 * of **zero**. A layout change that put so much as a border inside the canvas's own box would take
 * it under, and the gate would go red rather than the product going quietly non-compliant — which
 * is the correct direction, and the reason no larger figure was invented to buy slack. A number
 * above 60 would have been a threshold with nothing behind it, which this file already refuses one
 * constant over (`today.ts`'s `COMFORTABLE_PER_CAR` carries a citation for exactly that reason).
 *
 * **No floor is set beneath it.** `340px` would only bind below a 567 px viewport, which is shorter
 * than anything the support matrix carries, so keeping it would have added a constant that nothing
 * in the supported range can reach — and the clause holds there anyway, since 340 px of a 567 px
 * viewport is already 60 %.
 */
const STAGE_CANVAS_HEIGHT = '60vh';

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
 *
 * ## Every word and every rectangle in here is decided elsewhere
 *
 * This function draws five `fillText` sites, and until GitHub issue **#212** three of them were
 * composed **here**: the out-of-service caption, the `riders/capacity` readout and the direction
 * glyph. A string composed in a mount is a string no honesty property can read — the mount needs a
 * document, a canvas and an animation frame, so `derive.test.ts` excludes it, correctly. One of the
 * three was a **live figure** drawn on the vertical slice's centrepiece and swept by nothing.
 *
 * They are `stageScreenModel.ts#STAGE_OUT_OF_SERVICE` and `#stageCarReadoutOf` now, and the car's
 * geometry is `#stageCarPaintOf` for the same reason one layer down: the door-fill inversion #212
 * reports was arithmetic nothing could check without a canvas. What is left here is where a
 * rectangle lands on the page and which colour the brush is.
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
      ctx.fillText(STAGE_OUT_OF_SERVICE, 0, 0);
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
  /* AD-S17. Derived once per paint from the record's own motions and door marks — never from a
     field on the frame, and never from a motion the playhead has not reached. */
  const restByCar = new Map(carRestsAt(recording, frame).map((rest) => [rest.carId, rest]));
  for (const car of frame.cars) {
    const column = g.columns.find((candidate) => candidate.carId === car.carId);
    if (column === undefined || column.outOfService) continue;
    const shaft = recording.shafts.find((candidate) => candidate.carId === car.carId);
    const y = g.yForHeight(car.heightM) - carH;
    const bodyX = column.x + 1.5;
    const bodyWidth = column.width - 3;
    ctx.fillStyle = C.ink;
    roundedRect(ctx, bodyX, y, bodyWidth, carH, 3);
    ctx.fill();

    /*
     * Everything inside the car is `stageScreenModel.ts#stageCarPaintOf`'s — GitHub issue **#212**.
     * The doorway, the two leaves and the mark grid used to be arithmetic here, and the arithmetic
     * was inverted: at `doorFraction = 0` each leaf was half the body, so a shut car was a solid
     * amber block and the `paper` marks sat on it at 1.83:1. Nothing about that could be checked
     * without a canvas. It is a plan now, and this loop paints it.
     */
    const paint = stageCarPaintOf({
      bodyWidth,
      carHeight: carH,
      doorFraction: car.doorFraction,
      occupants: car.occupants,
    });
    ctx.fillStyle = C.sun;
    for (const leaf of paint.leaves) {
      ctx.fillRect(bodyX + leaf.x, y + leaf.y, leaf.width, leaf.height);
    }
    /* Riders aboard, capped at nine — § 14. A tenth mark says nothing a reader can count. */
    ctx.fillStyle = C.paper;
    for (const mark of paint.marks) {
      ctx.fillRect(bodyX + mark.x, y + mark.y, mark.width, mark.height);
    }

    /* `riders/capacity`, and the direction arrow while it travels. */
    const readout = stageCarReadoutOf({
      occupants: car.occupants,
      capacityPersons: shaft?.capacityPersons,
      direction: car.direction,
    });
    ctx.fillStyle = C.warmGrey;
    ctx.font = `500 8.5px ${TYPE.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(readout.occupancy, column.centreX, y - 1.5);
    if (readout.direction !== undefined) {
      ctx.fillStyle = C.terracotta;
      ctx.font = `600 9px ${TYPE.mono}`;
      ctx.fillText(readout.direction, column.centreX, y - 10);
    } else {
      /*
       * **AD-S17 — the rest bar.** The third state of the slot above, and the only mark in this
       * cutaway that says a lift is doing nothing.
       *
       * `docs/34` § 9.2 is the whole argument for it: a parking fault is *"the product's most-used
       * fault family"* and *"has no mark on the stage"*, because an idle car is a stationary car
       * with `direction === 0` and is pixel-identical to any empty car that happens to be stopped.
       * Campaign stage 1 asks the player to reason about where the lifts wait; this is the first
       * thing on the screen that shows them waiting.
       *
       * `inkSoft` rather than `ink`, and neither `terracotta` nor `sun`: the car's own body is
       * `ink`, so a bar in it would read as part of the car rather than as a mark about it, and an
       * alarm colour would make the stage assert that standing still is *wrong* — which is the
       * player's conclusion to reach and not the renderer's to draw. `inkSoft` on the well's
       * `paper` is the same family one rung down, measured at **8.36:1** in
       * `render/carRest.test.ts`, and it is the only ink in this cutaway that no other mark uses.
       */
      const rest = restByCar.get(car.carId);
      if (rest !== undefined) {
        const bar = stageCarRestBarOf({ bodyWidth, fill: rest.fill });
        ctx.fillStyle = C.inkSoft;
        ctx.fillRect(bodyX + bar.x, y + bar.y, bar.width, bar.height);
      }
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
  /** What § 14.1's band was last drawn for — see {@link drawWatching}. `''` while it is down. */
  let watchKey = '';

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

  /*
   * AD-S4's addition, and the whole of what GitHub issue #212's second defect turned into: the pill
   * above says which stretch of the demand schedule the playhead is in, and this one says when the
   * next one starts. It is drawn from `demandPhases` — the run's **input** — so it describes the
   * timetable rather than previewing an outcome, which is the line R6 draws.
   */
  const nextPhase = el(doc, 'span', 'everyday-stage-next');
  nextPhase.style.cssText = [
    `border:1px dashed ${C.rule}`,
    `border-radius:${String(R.pill)}px`,
    'padding:3px 10px',
    `font:500 10px ${TYPE.mono}`,
    'letter-spacing:.08em',
    `color:${C.warmGrey}`,
    /* Up only once it has a stretch to name — an empty dashed pill is a control saying nothing. */
    'display:none',
  ].join(';');

  const driving = el(doc, 'span', 'everyday-stage-driving');
  driving.style.cssText = 'display:flex;align-items:center;gap:6px';
  /* The model's own word, here and on every draw from `stageHeaderOf`'s `drivingLabel` — the corpus
     sweeps that one, so a literal here was one word with two sources and one of them checked. */
  const drivingEyebrow = el(doc, 'span', undefined, STAGE_DRIVING_LABEL);
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

  header.append(clock, phase, nextPhase, driving, figures, playButton, speeds);

  /*
   * **Pillar 3's strip** — GitHub issue **#277**, [§ D470](../../../../DECISIONS.md).
   *
   * The charter names P3 as the pillar this build fails outright, and its refusal test is *where on
   * the stage would a player have seen this?* The day asks five things, the brief lists them, the
   * report grades them, and until this element the stage the player actually watches said none of
   * them. Everything drawn into it is decided by `stageScreenModel.ts#stageGoalsOf`; nothing here
   * chooses a word.
   *
   * **Down until a recording lands**, which is `nextPhase`'s rule one block up: an empty strip of
   * five ungraded rows before the first press is a control saying nothing. The brief is where the
   * bars are read before a run.
   */
  const goals = el(doc, 'section', 'everyday-stage-goals');
  goals.style.cssText = [
    'display:none',
    'flex-direction:column',
    `gap:${String(GAP.row)}px`,
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.card)}px`,
    `background:${C.card}`,
    'padding:10px 14px 11px',
  ].join(';');
  const goalHeading = el(doc, 'span', 'everyday-stage-goals-heading');
  goalHeading.style.cssText = EYEBROW;
  const goalRows = el(doc, 'div', 'everyday-stage-goals-rows');
  goalRows.style.cssText = `display:flex;flex-direction:column;gap:${String(GAP.tight)}px`;
  const goalNote = el(doc, 'span', 'everyday-stage-goals-note');
  goalNote.style.cssText = `font-size:11px;line-height:1.4;color:${C.label}`;
  goals.append(goalHeading, goalRows, goalNote);

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

  /* --- § 14.1's identity band. Up exactly while a record is on the stage. --- */
  const watchBand = el(doc, 'section', 'everyday-stage-watching');
  watchBand.style.cssText = [
    'display:none',
    'align-items:center',
    'flex-wrap:wrap',
    `gap:${String(GAP.row + 4)}px`,
    /* § 14.1's *"ink, inverted — the single strongest signal"*, read off `view.headerTone`. */
    `background:${C.ink}`,
    `color:${C.paper}`,
    `border:1px solid ${C.ink}`,
    `border-radius:${String(R.card)}px`,
    'padding:12px 15px',
  ].join(';');
  const watchDisc = el(doc, 'span', 'everyday-stage-watching-initial');
  watchDisc.style.cssText = [
    'width:34px',
    'height:34px',
    'flex:none',
    'border-radius:50%',
    `background:${C.sun}`,
    `color:${C.ink}`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-size:16px',
    'font-weight:700',
  ].join(';');
  const watchWho = el(doc, 'div');
  watchWho.style.cssText = 'min-width:0';
  const watchName = el(doc, 'div', 'everyday-stage-watching-name');
  watchName.style.cssText = 'font-size:19px;font-weight:600';
  const watchSource = el(doc, 'div', 'everyday-stage-watching-source');
  watchSource.style.cssText = 'font-size:11.5px;opacity:.8';
  watchWho.append(watchName, watchSource);
  const watchFigures = el(doc, 'div', 'everyday-stage-watching-figures');
  watchFigures.style.cssText = `display:flex;gap:${String(GAP.section)}px;margin-left:auto`;
  const watchNote = el(doc, 'p', 'everyday-stage-watching-note');
  watchNote.style.cssText = 'margin:0;flex-basis:100%;font-size:11px;opacity:.75';
  watchBand.append(watchDisc, watchWho, watchFigures, watchNote);

  const stageWrap = el(doc, 'div', 'everyday-stage-wrap');
  stageWrap.style.cssText = [
    'position:relative',
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.card)}px`,
    `background:${C.paper}`,
    'overflow:hidden',
  ].join(';');
  /*
   * § 14.1's canvas cell: *"a pill, top left: `REPLAY · <name> · …`"*. Its verb is `watch/view.ts`'s
   * — § D407's substitution — and it is drawn over the cutaway rather than painted into it so the
   * honesty sweep and the browser tier read it as text.
   */
  const watchPill = el(doc, 'div', 'everyday-stage-watching-pill');
  watchPill.style.cssText = [
    'display:none',
    'position:absolute',
    'top:10px',
    'left:10px',
    'z-index:2',
    `background:${C.ink}`,
    `color:${C.paper}`,
    `border-radius:${String(R.pill)}px`,
    'padding:4px 10px',
    `font:500 10px ${TYPE.mono}`,
    'letter-spacing:.1em',
  ].join(';');
  const canvas = el(doc, 'canvas', 'everyday-stage-canvas');
  canvas.style.cssText = `display:block;width:100%;height:${STAGE_CANVAS_HEIGHT}`;
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
  stageWrap.append(canvas, watchPill, status);

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

  /* --- § 7.6's control: a button for the arm that needs nothing, a picker for the one that
       needs a dispatcher. --- */
  const interventions = el(doc, 'div', 'everyday-stage-interventions');
  interventions.style.cssText = `display:flex;align-items:center;flex-wrap:wrap;gap:${String(GAP.row + 2)}px`;
  const ARM_BUTTON_CSS = [
    'background:transparent',
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.control)}px`,
    'padding:6px 12px',
    `color:${C.ink}`,
    'font-size:12.5px',
    'font-weight:600',
    'cursor:pointer',
  ].join(';');
  const interventionButtons = STAGE_INTERVENTIONS.map((arm) => {
    const button = el(doc, 'button', 'everyday-stage-intervene', arm.label);
    button.type = 'button';
    button.dataset['interventionKind'] = arm.change.kind;
    button.title = arm.explains;
    button.style.cssText = ARM_BUTTON_CSS;
    button.addEventListener('click', () => {
      intervene(arm.change);
    });
    return button;
  });

  /*
   * § 7.6's second arm — *switch who is driving* — as a picker and a button (GitHub issue **#171**).
   *
   * **Two elements rather than one per dispatcher**, because the change a press appends carries the
   * whole profile: the picker chooses *who*, the button is the press, and the row that joins them is
   * `stageScreenModel.ts`'s. Every word on the button and every reason it is disabled comes from that
   * model — this block only decides which element they go in, which is the split `dev/main.ts` keeps
   * for the same control on the Engineer strip.
   *
   * **The list is re-read on every host notification, and the first draft of this comment said it
   * could not need to be.** It claimed the saved shelf cannot grow while this screen holds the page,
   * because the workshop that writes it is another screen. That is false in the one direction that
   * matters: § 3.2's door covers the Everyday root rather than hiding it (a canvas under
   * `display:none` never recovers its box), so this screen stays **mounted** while the player is in
   * the Engineer world — where they can save a dispatcher. A list read once at mount would then
   * refuse to offer a driver that exists, under a picker that says *any style or saved dispatcher*.
   *
   * So {@link refreshSwitchOptions} rebuilds the options when the shelf's ids **or names** move and
   * at no other time: an element rebuilt every frame is an element whose menu closes as the player
   * opens it, which is `dev/watchPanel.ts`'s own reason for keying its cells. It runs on every host
   * notification, which is what a save produces.
   *
   * **Said as a limitation rather than presented as coverage**: what is *pinned* by a run is that
   * the picker's options come from the façade at all — `stageScreen.browser.test.ts` reads them off
   * the page and hands the day to one of them. That a shelf grown in the *other world* reaches this
   * list is implemented and not asserted, because no method on the façade writes the shelf: saving a
   * dispatcher is `dev/dispatcherEditor.ts`'s press, and driving it from here would be a cross-world
   * case for one list.
   *
   * The picker opens on the dispatcher the player has standing rather than on a stranger, so the
   * first thing it says is true of the day they are watching. That is often *not* a no-op press: a
   * player who has moved the plain levers is driving a vector the standing name no longer describes,
   * and handing the day to that name is a real change — which is exactly the case an id comparison
   * got wrong on the other surface.
   */
  let switchable: readonly DispatcherProfile[] = [];
  let renderedShelf: string | undefined;
  const switchPicker = el(doc, 'select', 'everyday-stage-switch-pick');
  switchPicker.style.cssText = [
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.control)}px`,
    `background:${C.paper}`,
    `color:${C.ink}`,
    'padding:5px 7px',
    `font-family:${TYPE.body}`,
    'font-size:12.5px',
    'max-width:100%',
  ].join(';');
  switchPicker.setAttribute('aria-label', STAGE_SWITCH_PICKER_LABEL);
  /**
   * The shelf, rebuilt only when it has moved — see the block comment above for why once is wrong.
   *
   * The player's own selection survives a rebuild wherever the profile still exists; when it does
   * not — they were pointed at a dispatcher that has just been deleted — the picker falls back to
   * the standing one rather than to whatever ended up first, so what it names is still a fact about
   * the day.
   */
  function refreshSwitchOptions(): void {
    const latest = host.dispatchers();
    const shelf = latest.map((profile) => `${profile.id}\u0001${profile.name}`).join('\u0000');
    switchable = latest;
    if (shelf === renderedShelf) return;
    renderedShelf = shelf;
    const wanted = switchPicker.value;
    switchPicker.replaceChildren(
      ...latest.map((profile) => {
        const option = el(doc, 'option', undefined, profile.name);
        option.value = profile.id;
        return option;
      }),
    );
    const keep = latest.some((profile) => profile.id === wanted) ? wanted : host.selection().dispatcherId;
    switchPicker.value = latest.some((profile) => profile.id === keep) ? keep : (latest[0]?.id ?? '');
    switchPicker.hidden = latest.length === 0;
    switchButton.hidden = latest.length === 0;
  }
  const switchButton = el(doc, 'button', 'everyday-stage-intervene');
  switchButton.type = 'button';
  switchButton.dataset['interventionKind'] = 'switch-dispatcher';
  switchButton.style.cssText = ARM_BUTTON_CSS;
  /** The handover row as of the last {@link draw} — the model's, never composed here. */
  let switchRow: StageInterventionRow | undefined;
  switchButton.addEventListener('click', () => {
    if (switchRow === undefined || switchRow.refusal !== undefined) return;
    intervene(switchRow.change);
  });
  switchPicker.addEventListener('change', () => {
    syncSwitchArm();
  });
  const switchTarget = (): StageSwitchTarget | undefined => {
    const target = switchable.find((profile) => profile.id === switchPicker.value);
    return target === undefined ? undefined : { target, driving: () => host.drivingProfile() };
  };
  const interventionStamp = el(doc, 'span', 'everyday-stage-stamp');
  interventionStamp.setAttribute('role', 'status');
  interventionStamp.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.warmGrey}`;
  const interventionRefusal = el(doc, 'span', 'everyday-stage-intervene-refusal');
  interventionRefusal.style.cssText = `font-size:11.5px;color:${C.label}`;
  interventions.append(
    ...interventionButtons,
    switchPicker,
    switchButton,
    interventionStamp,
    interventionRefusal,
  );

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

  /*
   * **The stage's register of absences is not drawn here any more** — it is on the settings
   * screen with the other five (`everyday/buildNotes.ts`), which is GitHub issue #207. The array
   * has not moved and neither has any absence it names; three of its four rows were re-worded out
   * of the design document's vocabulary and say the same thing they said. The
   * one refusal a player still meets *here* is the ghost lane's, on the ghost lane's own card
   * (`STAGE_NO_GHOST`, three blocks up) — a control that cannot act says so where the control is.
   */
  root.append(header, goals, watchBand, alarm, stageWrap, legend, interventions, race);
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
   * `recording.startedAt`, with the first frame drawn by the {@link requestFrame} below.
   *
   * **This paragraph used to say that instant is 06:00, and it was wrong** — GitHub issue #212,
   * where the claim was quoted out of here and filed as a defect before anybody measured it. In
   * fact the hour is the run's own: `clockAt` takes `dayStartS` from the demand template the
   * day was built from, six of the seven shipped templates declare one, and the **default** opens at
   * 08:30. `DAY_START_S` (06:00) is the fallback for the one template that declares none. A stated
   * mechanism goes stale the same way a published number does, and this one propagated into an issue
   * body; it is corrected here rather than deleted, so the next reader meets the correction.
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

  /**
   * The § 14.1 session, or `undefined` — read here rather than from `context.ctx` alone.
   *
   * **Both** have to hold and neither is redundant. `context.ctx` is the shell's commitment, and
   * `host.watching()` is whether a record is actually on the state; the shell can only be in the
   * first for a frame before the second is true (`EverydayHost.watchRun` enters the spectator state
   * *before* `enterWatch` navigates, so in the shipped route the second is true first), and the host
   * can be in the second while the Engineer shell is the one watching. Drawing the spectator chrome
   * on either alone would put somebody else's name over the player's own day, or the player's
   * `DRIVING` over somebody else's.
   */
  function watchingNow(): WatchingView | undefined {
    return context.ctx === 'watch' ? host.watching()?.view : undefined;
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
    /*
     * § 20.15's withdrawal, re-read on every notification rather than latched at mount — GitHub
     * issue #182. The record does not move within one watch, but the **week** does: closing a day
     * from another screen advances it, and a refusal computed once would then be describing a
     * comparison that has changed under it. Cleared outright when nothing is being watched, so a
     * player's own stage can never carry a spectator's refusal (§ D227).
     */
    const session = context.ctx === 'watch' ? host.watching() : undefined;
    watchFacts.hasReplay = session !== undefined && adopted !== undefined;
    watchFacts.playRefusal =
      session === undefined
        ? undefined
        : playThisCrowdRefusalFor(session.run.record, {
            day: host.week().day,
            dayIdx: host.week().dayIdx,
          });
    context.refreshBar();
    /*
     * The shelf, on the notification a save produces — the other half of {@link refreshSwitchOptions}'s
     * argument. A dispatcher saved in the Engineer world while this screen sits covered arrives here
     * and nowhere else: `draw` does not run while another world has the page, and the picker's own
     * `change` event fires only when a player touches it.
     */
    syncSwitchArm();
    syncTransport();
    requestFrame();
  }

  function syncTransport(): void {
    const playing = playback?.state === 'playing';
    /*
     * § 3.3's row hears the day run out — GitHub issue **#287**'s fourth criterion.
     *
     * This is the whole of the *"is it still running?"* seam, and it is here because this is the
     * one function every transport change already passes through: the two chips, the play toggle,
     * `adopt`, and `tick`'s own `else` branch on the frame the playback stops. Nothing else has to
     * learn about it.
     *
     * **On the edge, guarded, not on every call.** `refreshBar` re-renders § 3.3's row, and
     * `syncTransport` runs on frames; an unguarded call would rebuild the bar sixty times a second
     * for a fact that moves twice a day. The guard is also what keeps this out of `tick`'s hot
     * path — a playing transport re-schedules from inside `tick` and never reaches here at all.
     */
    const ended = playback?.state === 'ended';
    if (ended !== barFacts.dayEnded) {
      barFacts.dayEnded = ended;
      context.refreshBar();
    }
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
        recomputingOver !== undefined ? STAGE_RECOMPUTING : STAGE_AWAITING_RUN;
      startButton.style.display = 'none';
      status.style.display = 'flex';
      return;
    }
    if (recomputingOver !== undefined) {
      statusText.textContent = STAGE_RECOMPUTING;
      startButton.style.display = 'none';
      status.style.display = 'flex';
      return;
    }
    if (!started) {
      /* AD-S5: the last moment the player is not watching anything is the moment to say what the
         schedule is about to do. `stageOpeningLineOf` composes it; nothing is authored here. */
      statusText.textContent = stageOpeningLineOf({
        recording: adopted,
        simTimeS: playback?.simTimeS ?? adopted.startedAt,
        dayStartS: host.dayStartS(),
      });
      startButton.style.display = '';
      status.style.display = 'flex';
      return;
    }
    status.style.display = 'none';
  }

  /**
   * § 7.6's second arm, drawn from the row the model built for it.
   *
   * Split from {@link draw} because it has two callers and one of them has no frame: the picker
   * fires outside the render loop, and the arm must also be correct **before any run exists** —
   * a button with no words on it is what a mount-time-only label would leave while the stage waits
   * for its first press.
   *
   * The shared refusal still wins. A filed day, a day nobody has started and a re-simulation in
   * flight are true of every arm at once; the row's own refusal is the narrower fact that this
   * particular handover would move nothing, and it leaves the arm beside it pressable.
   *
   * **And it owns the refusal line**, which is why the shared one is passed in rather than written
   * by the caller. § 7.6's fourth rule is that a control which cannot act *says so* — a disabled
   * button and a tooltip is not saying so — so the sentence a player reads is whichever refusal is
   * standing, and one function decides which. Two writers would leave the narrower sentence on the
   * page after the wider one had gone.
   */
  function applySwitchRow(view: StageInterventionView, sharedRefusal: string | undefined): void {
    switchRow = view.rows.find((row) => row.change.kind === 'switch-dispatcher');
    if (switchRow !== undefined) {
      switchButton.textContent = switchRow.label;
      switchButton.title = switchRow.refusal ?? switchRow.explains;
      switchButton.disabled = sharedRefusal !== undefined || switchRow.refusal !== undefined;
      switchPicker.disabled = sharedRefusal !== undefined;
    }
    interventionRefusal.textContent = sharedRefusal ?? switchRow?.refusal ?? '';
  }

  /** The handover arm re-asked from the live facts — for the picker, and for the mount. */
  function syncSwitchArm(): void {
    refreshSwitchOptions();
    const target = switchTarget();
    const view = stageInterventionsOf({
      interventions: host.interventions(),
      simTimeS: playback?.simTimeS ?? 0,
      dayStartS: host.dayStartS(),
      hasRun: adopted !== undefined,
      dayClosed: barFacts.dayClosed,
      recomputing: recomputingOver !== undefined,
      ...(target === undefined ? {} : { switchTo: target }),
    });
    applySwitchRow(view, sharedRefusalOf(view, watchingNow()));
  }

  /**
   * The refusal that is true of **every** arm at once — the run's state, or the spectator rule.
   *
   * § 14.1: *"§ 7.6's intervention machinery is disabled while watching. A spectator who could
   * intervene would be playing, not watching."* Composed here rather than as a fourth arm of the
   * model, because that function is asked the same question in every run context and *who owns this
   * run* is not one of its inputs — the Engineer shell disables the same controls from its own
   * watching latch for the same reason.
   */
  function sharedRefusalOf(
    view: StageInterventionView,
    watching: WatchingView | undefined,
  ): string | undefined {
    return (watching === undefined ? undefined : SPECTATOR_MAKES_NO_CHANGES) ?? view.refusal;
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
    const watching = watchingNow();
    clock.textContent = head.clock;
    /*
     * § 14.1's identity cell: `DRIVING` + the player's dispatcher becomes `THEIR DISPATCHER` + the
     * record's. Both strings are the view's, so the band, the pill and this header cannot come to
     * name three different runs — and `drivingLabel` stays the model's on a player's own day, which
     * is the branch `watch/view.test.ts`'s *keeps the player's own arm first-person* case is the
     * shape of: an arm that quietly became the only arm passes every grep and is wrong.
     */
    drivingEyebrow.textContent = watching?.dispatcherEyebrow ?? head.drivingLabel;
    phase.textContent = head.phase;
    /* Nothing rather than a placeholder: inside the last stretch there is no next one to name. */
    nextPhase.textContent = head.next ?? '';
    nextPhase.style.display = head.next === undefined ? 'none' : '';
    drivingName.textContent = watching?.dispatcherName ?? head.driverName;
    drawFigures(head.figures);
    drawGoals(recording, simTimeS);
    drawWatching(watching);

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

    const target = switchTarget();
    const intervention = stageInterventionsOf({
      interventions: host.interventions(),
      simTimeS,
      dayStartS: host.dayStartS(),
      hasRun: true,
      dayClosed: barFacts.dayClosed,
      recomputing: recomputingOver !== undefined,
      ...(target === undefined ? {} : { switchTo: target }),
    });
    interventionStamp.textContent = intervention.stamp;
    /*
     * § 14.1: *"§ 7.6's intervention machinery is **disabled** while watching. A spectator who could
     * intervene would be playing, not watching."* The refusal is composed here rather than added as
     * a fourth arm of `stageInterventionsOf`, because that function is asked the same question on
     * every run context and *who owns this run* is not one of its inputs — the Engineer shell
     * disables the same controls from its own `isWatching()` for the same reason.
     *
     * The stamp is left exactly as it is: the record's own interventions **are** replayed
     * (contract § 1.5 — *replayed, not offered*), so naming the latest one at or before the playhead
     * is a true statement about the run on screen and hiding it would misdescribe the replay.
     */
    const refusal = sharedRefusalOf(intervention, watching);
    for (const button of interventionButtons) button.disabled = refusal !== undefined;
    /*
     * The handover arm has a refusal of its own — a hand-over to the vector already driving moves
     * nothing — and it is drawn beside the control rather than in the shared line, because the park
     * arm next to it is still pressable in that state. The whole-control refusal above still wins:
     * a filed day cannot be handed to anybody either.
     */
    applySwitchRow(intervention, refusal);

    drawRace(recording, simTimeS);
  }

  /**
   * § 14.1's identity band and canvas pill — every cell of them read off {@link WatchingView}.
   *
   * `undefined` puts both down and restores § 7's own header. Nothing is *removed*: the band and the
   * pill keep their node identity across the transition, which is `dev/watchPanel.ts`'s own reason
   * — a rebuilt-every-frame element is an element whose buttons can never be pressed — and matters
   * here because `draw` runs on frames.
   *
   * The figures are **the record's posted result**, which is § 14.1's own cell (*"so the replay is
   * read against what it achieved"*) and is not the header's three: those are folded live at the
   * playhead by `observationsAt` and stay exactly what they are. The note under them says which is
   * which, in `watch/view.ts`'s words.
   *
   * **Keyed on the view, so the figure boxes are built once per watch rather than once per frame.**
   * `draw` runs on frames and the posted result does not move within one watch — it is the
   * record's, folded at `endedAt` before the replay started — so an unkeyed `replaceChildren` would
   * be `drawRace`'s own rejected shape: a pass rebuilt sixty times a second for a value that
   * changes twice a sitting. The header's live figures are rebuilt per frame because theirs *do*
   * move, which is why {@link drawFigures} is not keyed and this is.
   */
  function drawWatching(view: WatchingView | undefined): void {
    if (view === undefined) {
      watchBand.style.display = 'none';
      watchPill.style.display = 'none';
      watchKey = '';
      return;
    }
    watchBand.style.display = 'flex';
    watchPill.style.display = 'block';
    /* The whole view, because every field of it is drawn — `dev/watchPanel.ts`'s own rule: a key
       over a subset is a key that stops noticing the field somebody adds next. */
    const key = JSON.stringify(view);
    if (key === watchKey) return;
    watchKey = key;
    watchPill.textContent = view.pill;
    watchDisc.textContent = view.initial;
    watchName.textContent = view.name;
    watchSource.textContent = `${view.sourceLine} · ${view.subtitle}`;
    watchNote.textContent = view.figuresNote;
    watchFigures.replaceChildren();
    for (const figure of view.figures) {
      const box = el(doc, 'div', 'everyday-stage-watching-figure');
      box.style.cssText = 'display:flex;flex-direction:column;gap:1px';
      const value = el(doc, 'span', undefined, figure.value);
      value.style.cssText = `font:500 16px ${TYPE.mono}`;
      const label = el(doc, 'span', undefined, figure.label);
      label.style.cssText = `font:500 9.5px ${TYPE.mono};letter-spacing:.06em;opacity:.75;max-width:24ch`;
      box.append(value, label);
      watchFigures.append(box);
    }
  }

  /**
   * § 7.1's goal strip — GitHub issue **#277**, the charter's Pillar 3.
   *
   * Rebuilt per draw rather than keyed, on {@link drawFigures}' ground three lines down: the values
   * are folded at the playhead and move every frame, so a key over the view would miss on every
   * frame and buy nothing. {@link drawWatching} is keyed because the record's posted result does
   * not move within a watch; these do.
   *
   * **{@link EverydayHost.goalsAt} at this screen's playhead, never {@link EverydayHost.goalsToday}.**
   * The latter reads at `EverydayHostBindings.playheadS`, which is the **Engineer** transport's
   * position — not moving while this shell has the page — so the strip would have drawn five
   * constants while the day ran underneath it. That is the defect this repository's standing requirement is written against:
   * move the control and require the run to change. `stageScreen.test.ts` holds it on the drawn
   * figure rather than on an internal field.
   *
   * **The ink is chosen here and the verdict is not.** `stageGoalsOf` hands over
   * {@link StageGoalRow.state}, which is `pending` at every playhead short of the run's end, and
   * this function maps the three states onto `everyday/tokens.ts`' palette. It may not do anything
   * else: `dev/leftRail.ts#goalRowsOf`'s own `color` and `fill` are the Engineer stylesheet's
   * custom properties and would resolve against a palette that is not this shell's. KB-15 holds
   * either way — the glyph and the value both say what the colour says, and a run short of its end
   * draws `·` on every row.
   */
  function drawGoals(recording: VizRecording, simTimeS: number): void {
    const week = host.week();
    const strip = stageGoalsOf({
      readings: host.goalsAt(simTimeS),
      simTimeS,
      endedAt: recording.endedAt,
      history: week.history,
      day: week.day,
    });
    goals.style.display = 'flex';
    goalHeading.textContent = strip.heading;
    goalNote.textContent = strip.note;
    goalRows.replaceChildren();
    for (const row of strip.rows) {
      const ink = GOAL_INK[row.state];
      const line = el(doc, 'div', 'everyday-stage-goal');
      line.dataset['goal'] = row.id;
      line.style.cssText = 'display:flex;flex-direction:column;gap:3px';

      const top = el(doc, 'div');
      top.style.cssText = 'display:flex;align-items:baseline;gap:8px;min-width:0';
      const glyph = el(doc, 'span', 'everyday-stage-goal-glyph', row.glyph);
      glyph.style.cssText = `font:500 12px ${TYPE.mono};color:${ink};flex:none;width:1ch`;
      const label = el(doc, 'span', 'everyday-stage-goal-label', row.label);
      label.style.cssText = `flex:1;min-width:0;font-size:12px;color:${C.inkSoft}`;
      /* The handoff's *"was"* slot (§ 8.6) — last night's figure for the same quantity, or the
         bare em dash. Never this run's, which is what `wasDisplayOf` matches on `reads` for. */
      const was = el(doc, 'span', 'everyday-stage-goal-was', row.was);
      was.style.cssText = `font:500 10px ${TYPE.mono};color:${C.faint};flex:none`;
      const value = el(doc, 'span', 'everyday-stage-goal-value', row.value);
      value.style.cssText = `font:500 13px ${TYPE.mono};color:${ink};flex:none;min-width:5ch;text-align:right`;
      top.append(glyph, label, was, value);

      /* Flat at every playhead short of the end — `stageGoalsOf` zeroes it, and its docstring owns
         the argument: a full track on an untested `at-most` bar is a verdict with no word in it. */
      const track = el(doc, 'div', 'everyday-stage-goal-track');
      track.style.cssText = `height:3px;border-radius:2px;background:${C.ruleLight};overflow:hidden`;
      const fill = el(doc, 'div', 'everyday-stage-goal-fill');
      fill.style.cssText = `height:100%;width:${String(row.barPct)}%;background:${ink}`;
      track.append(fill);

      line.append(top, track);
      goalRows.append(line);
    }
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
    /*
     * § 14.1's race-strip cell: *"**their name** vs the world's middle, and **no verdict** — you are
     * not in this comparison."* The verdict cell carries the view's eyebrow instead — which is
     * `watch/view.ts`'s own `<NAME> · REPLAY`, the true half of the guide's eyebrow with the rival
     * arm dropped rather than stubbed — so the strip names whose day it is plotting and claims
     * nothing about a comparison that is not drawn.
     *
     * `raceView.verdict` on this build's *nobody* arm is `N standing now`, a live figure rather than
     * a judgement, so what is being removed is a figure and not a verdict. It is removed anyway: it
     * is the spectator's reading of somebody else's run in the cell § 14.1 reserves for identity,
     * and the same figure is already in the header two rows up.
     */
    raceVerdict.textContent = watchingNow()?.eyebrow ?? raceView.verdict;
  }

  /* ------------------------------------------------------------------ wire */

  const unsubscribe = host.subscribe(onHostChange);
  const onResize = (): void => {
    requestFrame();
  };
  view?.addEventListener('resize', onResize);

  /*
   * **Never on a watch** — GitHub issue #182, § D436, and this is the one line that would have
   * silently undone the whole route.
   *
   * `stageEntryStartsARun` reads `open`, which `everyday/host.ts` documents as false for *"a watched
   * or file-loaded run — somebody else's"*, and `dayClosed`, which a watch leaves false. So the rule
   * answers **true** on the way into a watch and the mount's first act would have been
   * `host.startRun()`: the player's own day simulated over the top of the record they pressed
   * `Watch it` on, in the same frame, with the spectator chrome coming up over it.
   *
   * The guard is `context.ctx` rather than a fifth clause inside the rule, because the rule is about
   * *the player's day* and this is about *which flow the screen is serving* — § 18's own split, and
   * the reason `ctx` is a parameter of the screen rather than a field of the run.
   */
  if (context.ctx !== 'watch' && stageEntryStartsARun(host.runState())) host.startRun();
  /*
   * The handover arm is drawn from inside this call, before any frame — `draw` returns early with
   * no recording, so without it the button would sit on the awaiting-run stage with no words on it.
   * § 7.6's fourth rule is about controls that cannot act *saying so*, and a blank button says
   * nothing at all.
   */
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
      /*
       * {@link watchFacts} is module state and outlives this mount, so it is cleared here rather
       * than left for the next one to overwrite: a refusal about somebody else's record, still
       * standing on the § 3.3 row of a player's own stage, is § D227's stale refusal in the one
       * place a player would believe it.
       */
      watchFacts.hasReplay = false;
      watchFacts.playRefusal = undefined;
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
      /*
       * § 14.1's primary on a watched stage is a different press entirely — *"drops the spectator
       * state and opens the brief for the same day, which is the whole reason watching exists"* —
       * and it is answered here rather than by a second handle, because § 3.1 gives the shell one
       * primary and `screens.ts` gives one screen one answer to it.
       *
       * `host.playThisCrowd` leaves the spectator state itself, so the navigation below is what ends
       * the § 18 context: `shell.ts#go` clears `ctx` on any move off the stage and calls
       * `stopWatching` — idempotent, so the second call is a no-op rather than a second restore.
       *
       * The brief rather than the stage, which is the guide's own word and not a preference: the
       * crowd has been set up and not yet met, and walking straight onto the stage would skip the
       * screen that says what the day is. § 20.15's *that day's fixture* clause is why this press
       * can be inert at all — see `watchStage.ts#playThisCrowdRefusalFor` — and the shell draws the
       * button disabled with that sentence, so this handler is not reached on a row it refuses.
       */
      const session = context.ctx === 'watch' ? host.watching() : undefined;
      if (session !== undefined) {
        playback?.pause();
        host.playThisCrowd(session.run);
        context.go('brief');
        return;
      }
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

/**
 * Whether walking onto the stage should ask the host for a day — § 7.3, and **GitHub issue #215**.
 *
 * § 7.3: entering the stage is entering *the player's* day, so the mount asks for one exactly when
 * the player has not got one of their own standing on it. `runState().open` is most of that
 * question already: it is false for boot's own demo run (§ D232 — nobody chose it) and for a
 * watched or file-loaded run, both of which are somebody else's day and should be replaced by the
 * player's.
 *
 * ## The clause that had to be taken back out of `open`
 *
 * `open` is **also** false for a day that has been **filed**, and this line used to read
 * `if (!host.runState().open)` — so re-entering the stage after a close silently started a run.
 * Every step after that is automatic and correct on its own terms: `dev/state.ts#startRun` does not
 * re-roll the seed, so the new recording is bit-identical to the one just filed; `dev/main.ts`'s
 * `adopt` clears `filedRunId`, which re-arms the filing gate; and the next close — the tick's, or a
 * player pressing a § 3.3 primary that has quietly become pressable again over a day they already
 * finished — counts an attempt. The sheet then read *"attempt 4 at this day"* to somebody who had
 * pressed *Run* once. **A bit-identical re-simulation is not an attempt**, which is the sentence
 * `shift/week.ts#closeDay`'s `recordGrew` already makes about the intervention case.
 *
 * The count itself is not the defect and is not touched: `closeDay` increments once per close and
 * is honest about that. What was dishonest was a close of a run nobody asked for.
 *
 * ## Why a filed day is refused here rather than exempted at the count
 *
 * The alternative was to widen `recordGrew` so a re-close of an identical `{seed, config}` does not
 * count. `closeDay`'s own docstring refuses that, and `week.test.ts` pins the refusal: *"a retry of
 * an unchanged selection reproduces the same `{seed, config}` too … so intent is the only
 * discriminator there is"*, and a player who presses *Run* again on an unchanged selection **is** on
 * attempt 2 (`week.test.ts`'s *"does not bank a second clean shift for the same day"* and the
 * negative control beside the `recordGrew` case both assert exactly that). An identity test cannot
 * tell those two apart, so it would buy this fix by making a real retry stop counting. Refusing the
 * run is narrower: nothing that a player asked for changes.
 *
 * What the stage shows instead is a state `stageScreenModel.ts` already draws and could not
 * previously stay in for more than a frame — the § 3.3 primary inert under *"the day is filed — its
 * report is written"*, and the intervention rows refusing under *"the day is filed — its record is
 * closed, and tomorrow starts a new one"*. Tomorrow is what starts the next run
 * (`EverydayHost.openTomorrow`, which calls `startRun` itself), and *Run* is what re-runs today.
 *
 * Pure, and exported so the decision is drivable in the node tier: this file's mount needs a
 * document and `stageScreen.test.ts` does not. Its one non-test caller is {@link mountStage}, on the
 * statement after the `resize` listener, and `stageScreen.test.ts` asserts that call site by source
 * as well as the rule by value — a rule the mount has stopped asking passes its own test while the
 * product does the old thing.
 */
export function stageEntryStartsARun(run: {
  readonly open: boolean;
  readonly dayClosed: boolean;
}): boolean {
  return !run.open && !run.dayClosed;
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

/**
 * The § 3.3 refinement — worded by `stageScreenModel.ts#stageBarModelOf`, over the module store.
 *
 * **The watch context is a different row and takes a different refinement**, which is why this is a
 * branch rather than a fifth field on {@link barFacts}: `stageBarModelOf`'s three refusals are all
 * about *the player's own day* (not started, filed, re-simulating), and every one of them is false
 * of a replay — a watched stage has `hasRun: false` by `runState`'s own definition, so the unbranched
 * call would have drawn *"the day has not started yet — there is nothing to file"* under a run that
 * was visibly playing. `everyday/watchStage.ts#watchStageBarOf` is that row's own refinement.
 */
function stageBar(state: EverydayState): ActionBarModel {
  if (state.ctx === 'watch') return watchStageBarOf(state, watchFacts);
  return stageBarModelOf(state, barFacts);
}

/** The registry row — GAMEPLAY § 7's screen, mounted by `shell.ts` through `screens.ts`. */
export const STAGE_SCREEN: EverydayScreenModule = {
  key: 'stage',
  mount: mountStage,
  bar: stageBar,
};
