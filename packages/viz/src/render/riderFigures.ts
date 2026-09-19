/**
 * The people, drawn as people — `docs/12-design-handoff.md` § 1.3 M3, design `:2114–2157`.
 *
 * ## What this adds, and what it is explicitly **not** allowed to replace
 *
 * The handoff draws one little figure per waiting leg on the floor they are standing on, tinted by
 * how long they have stood. That is a real improvement on a row of dots: a reader sees a crowd
 * rather than a count, and a crowd is what the subject actually is.
 *
 * It is also **colour and nothing else**. Four tints, no shape difference, no text. `UX.md` KB-15
 * forbids that as the sole carrier of a claim, and § 3.1 restates it for this exact feature
 * because Mini Metro's players report losing to a station they never saw fill. So the figures are
 * drawn **beside** the landing row that `render/riderQueue.ts` plans, not instead of it: the same
 * four wait ages are carried on the same row by `BAND_GLYPH`'s four distinct silhouettes, by the
 * `+N`, by the aggregated bar's caption and by `describeFrame`'s sentence. Take every colour off
 * this canvas — `render/landingMarks.test.ts` does exactly that — and the claim survives intact.
 *
 * Deleting the glyph row to make room for the figures would be the one change this file must not
 * make. It would be a colour-only encoding of a fail state, on the surface **Export PNG** writes
 * to a shareable file.
 *
 * ## Where they stand
 *
 * Inside the plot, in {@link Layout.riderLane} — the strip the layout keeps clear to the right of
 * the shaft bank, which is where the artefact puts them (`queueX = bankX + bankW + 30`). When the
 * building has too many shafts for the plot to spare a lane, there is no lane and no figures, and
 * the landing row carries the whole claim on its own. That degradation is the same one § 6.2 uses
 * everywhere else in this directory: **aggregate, never remove**.
 *
 * ## The bob is a function of simulated time
 *
 * `Math.sin(simTimeS · rate + phase)`, where `phase` is a hash of the passenger's own id. No
 * `Date.now()`, no `requestAnimationFrame` counter, no accumulator — `boundaries.test.ts` rule 2
 * would catch the first of those and nothing would catch the last two. Scrubbing to the same `t`
 * twice must draw the same picture, or `replay/replay.test.ts`'s claim that equal frame sequences
 * imply equal pictures is false. `stageRender.test.ts` asserts the identity directly, by drawing
 * the same frame twice and comparing the whole call transcript.
 */

import type { QueuedRider, WaitBand } from '../frame/overlay.js';
import type { Canvas2DLike, Theme } from './canvas.js';
import { fillCircle } from './shapes.js';

/**
 * The depth at which a landing raises the alarm — design `:2151`, `if (list.length > 24)`.
 *
 * Strictly greater than, as the artefact has it: twenty-four people at a lift lobby is a busy
 * morning and twenty-five is a queue that is not being served. The number is the design's; what
 * this repository adds is that crossing it is reported to the caller (see
 * {@link RiderLaneResult.alarm}) rather than only drawn, so the stage's alarm chip and the
 * canvas's own rule cannot disagree about which floor is in trouble.
 */
export const ALARM_STACK_DEPTH = 24;

/** Radians per simulated second the bob cycles at — design `:2137`, `s.tod * 1.6`. */
export const BOB_RATE_RAD_PER_S = 1.6;

/** Cycles per simulated second the alarm rule pulses at — design `:2154`, `s.tod * 3`. */
const ALARM_PULSE_RAD_PER_S = 3;

/**
 * **The two per-rung ladders, indexed by severity rather than by band name** — and the indirection
 * is the whole reason both stages can draw one person.
 *
 * This repository has **two** four-rung wait ladders and they do not share a boundary above the
 * first. `frame/overlay.ts#waitBandOf` bands by the **run's own** numbers — half the long-wait
 * threshold, the long-wait threshold, `serviceLevel.horizonS` — so a run whose horizon is 900 s
 * calls a 200 s wait `long`. `live/bands.ts#WAIT_BANDS` bands by absolute clock — 30 / 60 / 120 s
 * — so the Everyday stage calls that same 200 s wait `taking-the-stairs`, its worst rung. Both are
 * deliberate and both are documented where they live: one is *the fact*, the other is *the
 * feeling*, and `frame/overlay.ts` says outright that a change to how a queue feels may not
 * quietly change what a band is.
 *
 * **So a figure is given its rung, not its band.** AD-S7's claim is ordinal — *"the fourth band is
 * visibly taller than the first"* — and it is true of either ladder without the two having to
 * agree about where a boundary sits. Keying the geometry on a band **name** would have forced one
 * surface to draw its height off one ladder and its colour off the other, and two channels
 * carrying the same claim from two ladders is worse than one channel: a reader would meet a taller
 * capsule in a calmer colour and have no way to tell which was lying.
 *
 * `BOB_AMPLITUDE_BY_RANK`'s endpoints are the artefact's (`:2137`, `b >= 2 ? 1.1 : 0.4`); the two
 * middle rungs are this repository's, added because the handoff's § 1.3 asks for an amplitude that
 * *"grows with the band"* and the bands are a four-rung ladder. The values are unchanged from when
 * they were written out by name; only their spelling moved.
 */
/** A four-rung ladder, spelled as a tuple so `BAND_*` below index it without a `?? ` fallback. */
type RungLadder = readonly [number, number, number, number];

const BOB_AMPLITUDE_BY_RANK: RungLadder = Object.freeze([0.4, 0.7, 1.1, 1.6]);

/**
 * The calmest rung's share of the room its caller gives it. The ramp runs from here to 1.
 *
 * `0.7` rather than something more dramatic because the height is not the only carrier and could
 * not be: a rung's worth of it is about a pixel at the Everyday stage's widest pitch and less than
 * one below that. It is the channel that makes the ramp survive greyscale and a reader who cannot
 * resolve a 4.5 px hue difference — a second answer, not a louder one.
 */
const MIN_HEIGHT_SHARE = 0.7;

/** The last rung's index, so a caller with a longer ladder saturates rather than reading `undefined`. */
const LAST_RANK = BOB_AMPLITUDE_BY_RANK.length - 1;

/**
 * **AD-S7's height ladder, as one ramp over any number of rungs** —
 * `docs/28-art-direction.md` § 5.4.
 *
 * AD-S7 is a rule about the wait ramp rather than about one surface: *"a capsule's **height**
 * encodes its band as well as its colour: the fourth band is visibly taller than the first …
 * required by § 7 anyway (never colour-only)"*. Until this ramp existed the rule was met on
 * neither stage — the Engineer lane sized every figure from the floor pitch alone and leaned on
 * `riderQueue.ts`'s glyph row beside it, and the Everyday cutaway hoisted one `capsuleH` outside
 * its rider loop and had **no** second channel at all, so at 4.5 px the band rode on hue alone.
 * That is `UX.md` KB-15's exact prohibition, on the one surface `docs/38` says a beginner meets.
 *
 * AD-S7 rejects *width* as the channel because capsules tile on a fixed pitch and a wider capsule
 * changes how many fit a lane, which would move § 8 (7)'s overlap arithmetic. Height has the same
 * hazard upward, which is why this ramp runs the way it does.
 *
 * Exported because there are two callers and they band on two different ladders: {@link
 * drawRiderFigure} evaluates it over `frame/overlay.ts`' four, and `everyday/cutaway.ts` evaluates
 * it over `live/bands.ts`' four for the capsule branch, which does not go through the figure at
 * all. Those were the same four numbers written twice for about an hour, which is exactly long
 * enough for somebody to change one of them.
 *
 * Linear from {@link MIN_HEIGHT_SHARE} to `1`, and `1` is reached at the worst rung rather than
 * passed: **the ladder descends from the room the caller budgeted rather than ascending to it.** A
 * taller worst band would reach further above its floor line precisely where a landing is deepest,
 * which would move `figureClearancePx`'s clamp on one stage and § 8 (7)'s overlap arithmetic on
 * the other. Taking the calm end down moves neither.
 *
 * Total: a rung off either end saturates, and a ladder with fewer than two rungs gives every
 * rider the whole of the room — see the comment on the guard.
 */
export function bandHeightShareAtRank(rank: number, rungs: number): number {
  // A ladder with one rung is no ladder, and nothing descends from the room the caller budgeted:
  // every rider gets the whole of it. Returning the *calm* end here would have made a
  // single-banded building draw every one of its people short, which is the flattering direction
  // and therefore the wrong one.
  const top = Math.floor(rungs) - 1;
  if (!(top >= 1)) return 1;
  const clamped = Number.isFinite(rank) ? Math.min(top, Math.max(0, rank)) : 0;
  return MIN_HEIGHT_SHARE + (1 - MIN_HEIGHT_SHARE) * (clamped / top);
}

/** A rung index, clamped into the ladder and rounded. Total: a caller cannot fall off either end. */
function rankOf(bandRank: number): number {
  if (!Number.isFinite(bandRank)) return 0;
  return Math.min(LAST_RANK, Math.max(0, Math.round(bandRank)));
}

/**
 * How far a rider bobs, by band, in pixels.
 *
 * The artefact has two rungs — `b >= 2 ? 1.1 : 0.4` — and the handoff's own § 1.3 asks for an
 * amplitude that *"grows with the band"*. Four rungs rather than two, because the bands are the
 * one ladder on this canvas that a reader is meant to read as a ladder, and a two-valued
 * animation says *"fine / not fine"* where the colour and the glyph both say four things. The
 * endpoints are the artefact's.
 *
 * It is never the only signal, and could not be: it is invisible in a screenshot, which is what
 * **Export PNG** produces. It is a *fifth* carrier, after the colour, the glyph, the caption and
 * the sentence.
 */
export const BOB_AMPLITUDE_PX: Readonly<Record<WaitBand, number>> = Object.freeze({
  settling: BOB_AMPLITUDE_BY_RANK[0],
  waiting: BOB_AMPLITUDE_BY_RANK[1],
  long: BOB_AMPLITUDE_BY_RANK[2],
  abandoned: BOB_AMPLITUDE_BY_RANK[3],
});

/**
 * The shortest thing this module will still call a person — read out of {@link figureHeightPx}
 * rather than spelled again.
 *
 * `figureHeightPx` clamps to `[8, 16]`, so evaluating it at a pitch of zero returns its own floor,
 * and its docstring is where the 8 is argued: *"eight pixels is the shortest thing that still
 * reads as a person"*. A caller deciding whether it has room for a figure asks this rather than
 * transcribing the number, for `render/carRest.ts#rampEnds`' reason one directory along: a third
 * copy of a bound is how two of them stop agreeing.
 */
export const MIN_FIGURE_HEIGHT_PX = figureHeightPx(0);

export interface RiderFigureInput {
  /**
   * The figure's own vertical axis — its head's centre and its body's centre.
   *
   * A centre rather than a cell, because the two callers anchor differently and both are right:
   * the Engineer lane packs figures to the **left** of an 11 px cell so a crowd reads as a crowd
   * rather than as evenly spaced posts, and the Everyday cutaway tiles them on a 6.5 px pitch
   * where there is no slack to bias. Passing a cell and centring in it would have moved every
   * Engineer figure 2.5 px right, which `stageRender.test.ts` catches and which would have been a
   * layout change smuggled in under a refactor.
   */
  readonly centreX: number;
  /** The line it stands on. The figure is drawn **above** this, never through it. */
  readonly feetY: number;
  /**
   * Head-to-feet, **before** the band share and before the bob — the room the caller has.
   * {@link BAND_HEIGHT_SHARE} takes it down from here; nothing takes it up.
   */
  readonly heightPx: number;
  /**
   * Which rung of its own four-rung wait ladder this rider is on — `0` calmest, `3` worst.
   *
   * A rung and not a {@link WaitBand}, for the reason {@link BOB_AMPLITUDE_BY_RANK} gives at
   * length: the two ladders in this package share no boundary above the first, and AD-S7's claim
   * is ordinal. Out-of-range values saturate rather than throw.
   */
  readonly bandRank: number;
  /**
   * The identity the bob's phase is hashed from, and the reason two adjacent figures are not one
   * object with a heartbeat. See {@link bobPhaseOf}.
   */
  readonly passengerId: string;
  /**
   * Simulated seconds. **Not a wall clock and not an accumulator** — the whole determinism
   * argument in this module's header rests on the caller having no other kind of time to pass, so
   * the field is named for the only one that is legal here.
   */
  readonly simTimeS: number;
  /**
   * The fill, chosen by the caller.
   *
   * A colour rather than a `Theme`, and that is what lets one silhouette serve both stages: the
   * Engineer lane passes `theme.queueBands[band]` and the Everyday cutaway passes
   * `stageScreenModel.ts#stageInkFor`, which are two palettes for one ramp. A `Theme` parameter
   * here would have made this function Engineer-only, which is how the nicest drawing in this
   * repository came to be on the surface a beginner is told never to open.
   */
  readonly fill: string;
  /**
   * Alpha, default 0.92.
   *
   * Not opaque: a crowd of overlapping figures at a deep landing reads as a mass rather than as a
   * picket fence, and the slab behind them stays visible through the thin ones.
   */
  readonly alpha?: number | undefined;
}

/**
 * **One person.** The single silhouette both stages draw, so a rider who reads as a rider on the
 * Everyday cutaway reads as the same rider on the Engineer schematic.
 *
 * A head and a body, the design's own proportions (`:2141`, `fh * 0.19`), the band in the height
 * per AD-S7, and the bob in {@link bobOffsetPx}'s arithmetic — `sin(simTimeS · rate + hash(id))`,
 * which is a pure function of the frame and the playhead and of nothing else. Scrub back to the
 * same `t` and the same picture is drawn, which is what `replay/replay.test.ts`'s claim that equal
 * frame sequences imply equal pictures reduces to.
 *
 * It restores `globalAlpha` itself rather than leaving it to the caller, because an alpha left set
 * is invisible to a recording stub and would silently dim whatever the next brush touched.
 */
export function drawRiderFigure(ctx: Canvas2DLike, input: RiderFigureInput): void {
  const rank = rankOf(input.bandRank);
  const height =
    Math.max(0, input.heightPx) * bandHeightShareAtRank(rank, BOB_AMPLITUDE_BY_RANK.length);
  if (height <= 0) return;
  const bob =
    Math.sin(input.simTimeS * BOB_RATE_RAD_PER_S + bobPhaseOf(input.passengerId)) *
    (BOB_AMPLITUDE_BY_RANK[rank] ?? 0);
  const top = input.feetY - height + bob;
  const headRadius = Math.max(1.4, height * HEAD_RADIUS_FRACTION);
  const bodyWidth = Math.max(1.6, height * BODY_WIDTH_FRACTION);
  const centreX = input.centreX;
  ctx.fillStyle = input.fill;
  ctx.globalAlpha = input.alpha ?? FIGURE_ALPHA;
  fillCircle(ctx, centreX, top, headRadius);
  ctx.fillRect(centreX - bodyWidth / 2, top + height * BODY_TOP_FRACTION, bodyWidth, height * BODY_HEIGHT_FRACTION);
  ctx.globalAlpha = 1;
}

/** The body's width as a fraction of the figure — design `:2143`. */
const BODY_WIDTH_FRACTION = 0.17;
/** Where the body starts below the head's centre — design `:2142`. */
const BODY_TOP_FRACTION = 0.3;
/** How far the body runs, so its foot lands on the line the figure stands on — design `:2143`. */
const BODY_HEIGHT_FRACTION = 0.68;
/** See {@link RiderFigureInput.alpha}. */
const FIGURE_ALPHA = 0.92;

/**
 * `frame/overlay.ts`' four bands as rungs — the one place this package's *fact* ladder is turned
 * into a severity index. Ascending, and asserted exhaustive by `riderFigures.test.ts`, so a fifth
 * band arriving in `WaitBand` fails to compile here rather than silently ranking `0`.
 */
export const WAIT_BAND_RANK: Readonly<Record<WaitBand, number>> = Object.freeze({
  settling: 0,
  waiting: 1,
  long: 2,
  abandoned: 3,
});

/**
 * A per-rider phase offset in `[0, 2π)`, from the passenger id alone.
 *
 * Without it every figure on a landing bobs in lockstep and the crowd reads as one object with a
 * heartbeat. The artefact carries a random `jit` on each rider for this; a recording has no such
 * field and inventing one would mean a random draw inside the renderer, which
 * `CLAUDE.md` invariant 2 forbids outright and which would also make the picture depend on how
 * many times it had been drawn.
 *
 * An FNV-1a hash rather than a sum of char codes: `p1` and `p10` differ in length only, and a
 * sum puts every short id in the same corner of the cycle, which is the lockstep this exists to
 * break. Pure, total, and identical between two draws of the same frame.
 */
export function bobPhaseOf(passengerId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < passengerId.length; index += 1) {
    hash ^= passengerId.charCodeAt(index);
    // `Math.imul` keeps the multiply in 32 bits; `hash * prime` would lose the low bits to the
    // double's 53-bit mantissa after four or five characters and collapse the spread.
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) / 0x100000000) * Math.PI * 2;
}

/*
 * **`bobOffsetPx` was here and is deleted rather than kept.**
 *
 * It took a `QueuedRider` and returned this instant's offset, and its only caller was
 * `drawRiderLane`'s inline figure loop. {@link drawRiderFigure} now owns that arithmetic, and it
 * cannot take a `QueuedRider`: the Everyday cutaway bands on a different ladder and passes a rung.
 * A second entry point returning the same number from a different argument is how two callers come
 * to bob two ways, and an export whose only remaining callers are tests is the defect `CLAUDE.md`
 * counts eleven times in this tree. Closed by deletion, on `model/bank.ts`'s precedent — two of
 * that seam's five members went the same way.
 */

/**
 * The alarm rule's alpha at this instant — design `:2154`, `0.35 + 0.3 · sin(t · 3)`.
 *
 * A pulse and not a flash: the rule never goes away, so the alarm cannot be missed between two
 * peaks of the animation. Reduced-motion readers get the rule at its mean, which the caller
 * arranges by passing a fixed `simTimeS`; the *claim* is the rule's presence, not its rhythm, and
 * the chip above the stage and `describeFrame`'s sentence both carry it in words.
 */
export function alarmPulseAlpha(simTimeS: number): number {
  return 0.35 + 0.3 * Math.sin(simTimeS * ALARM_PULSE_RAD_PER_S);
}

/** Horizontal cell one figure occupies — design `:2124`, `figW = 11`. */
export const FIGURE_WIDTH_PX = 11;

/**
 * Pixels held back at the end of the lane for the `+N`.
 *
 * The artefact's own reservation (`:2125`). It is the same rule `drawQueueRow` keeps and for the
 * same measured reason: a count drawn off the end of its container is worse than a count that was
 * never promised, because the reader cannot tell which digits are missing.
 */
const OVERFLOW_RESERVE_PX = 70;

/** The fewest figures a lane will draw before it gives up and shows a bare `+N` — design `:2125`. */
const MIN_FIGURES = 4;

/**
 * How many of a landing's riders the lane can hold.
 *
 * Pure arithmetic, separated from the drawing for the reason everything in this directory is:
 * *what* to draw is testable under Node and *where* is pixels.
 */
export function figureCapacity(laneWidthPx: number): number {
  return Math.max(MIN_FIGURES, Math.floor((laneWidthPx - OVERFLOW_RESERVE_PX) / FIGURE_WIDTH_PX));
}

/**
 * How tall a figure is at a given floor pitch — the artefact's `min(16, max(8, pitch × 0.7))`.
 *
 * Eight pixels is the shortest thing that still reads as a person; sixteen is where one stops
 * looking like a person and starts looking like a column.
 */
export function figureHeightPx(pitchPx: number): number {
  return Math.min(16, Math.max(8, pitchPx * 0.7));
}

/**
 * How much room a figure needs **above** the line it stands on — its body, the top of its head,
 * and the highest the bob can lift it.
 *
 * Exported because the caller has to clamp with it and a test has to check the clamp, and a third
 * transcription of `0.19` and `1.6` is how the three would stop agreeing. The clamp exists
 * because a queue on the top floor is otherwise drawn straight through the shaft labels — the
 * header band's own defect, arriving from underneath, on a scene
 * `render/headerBand.test.ts` cannot construct because it supplies no queues.
 */
export function figureClearancePx(pitchPx: number): number {
  const height = figureHeightPx(pitchPx);
  const headRadius = Math.max(1.4, height * HEAD_RADIUS_FRACTION);
  const worstBob = Math.max(...Object.values(BOB_AMPLITUDE_PX));
  return height + headRadius + worstBob;
}

/** The head's radius as a fraction of the figure — design `:2141`, `fh * 0.19`. */
const HEAD_RADIUS_FRACTION = 0.19;

export interface RiderLaneInput {
  /** Everyone still standing at this landing. Drawn oldest first, so the worst band leads. */
  readonly riders: readonly QueuedRider[];
  /**
   * How many people are actually there — `FloorQueue.total`.
   *
   * Taken separately from `riders.length` rather than derived from it, so the alarm depth and the
   * `+N` are counted from the **queue's own** figure. They agree today; a queue that ever
   * summarised its riders would make them disagree, and the number a reader sees must be the one
   * the rest of the viewer quotes rather than the one this lane happened to be handed.
   */
  readonly total: number;
  /** Left edge of the lane. */
  readonly x: number;
  /** Pixel width available. */
  readonly widthPx: number;
  /** The floor line the figures stand on. */
  readonly feetY: number;
  /** Distance between two floor lines, which sets how tall a figure may be. */
  readonly pitchPx: number;
  readonly simTimeS: number;
}

export interface RiderLaneResult {
  /** Figures actually drawn. */
  readonly shown: number;
  /** Riders the lane had no room for, standing behind the `+N`. */
  readonly overflow: number;
  /** Whether this landing crossed {@link ALARM_STACK_DEPTH}. */
  readonly alarm: boolean;
}

/**
 * One landing's crowd.
 *
 * Returns what it drew, so the caller can report the alarm rather than the caller and this
 * function each deciding for themselves what counts as a stacked landing.
 */
export function drawRiderLane(
  ctx: Canvas2DLike,
  theme: Theme,
  input: RiderLaneInput,
): RiderLaneResult {
  const total = input.total;
  const alarm = total > ALARM_STACK_DEPTH;
  if (total === 0 || input.widthPx <= 0) return { shown: 0, overflow: 0, alarm };

  const capacity = figureCapacity(input.widthPx);
  const shown = Math.min(input.riders.length, capacity);
  const figureHeight = figureHeightPx(input.pitchPx);

  for (let index = 0; index < shown; index += 1) {
    const rider = input.riders[index];
    if (rider === undefined) continue;
    /*
     * One silhouette for both stages — {@link drawRiderFigure}. This loop used to spell the head
     * and the body inline, and the Everyday cutaway spelled a capsule of its own, so the two
     * surfaces drew the same person two ways and only one of them had a second channel for the
     * band. The
     * cell is {@link FIGURE_WIDTH_PX} wide and the figure keeps the artefact's left bias inside
     * it, so the head lands on the same pixel it always did and the body moves by 0.05 px — the
     * head and the body were never quite concentric before, and now they are.
     */
    drawRiderFigure(ctx, {
      // `+ 3` is the artefact's own left bias inside the cell (`:2141`), kept to the pixel.
      centreX: input.x + index * FIGURE_WIDTH_PX + 3,
      feetY: input.feetY,
      heightPx: figureHeight,
      bandRank: WAIT_BAND_RANK[rider.band],
      passengerId: rider.passengerId,
      simTimeS: input.simTimeS,
      fill: theme.queueBands[rider.band],
    });
  }

  const overflow = total - shown;
  if (overflow > 0) {
    // The count, in the alarm colour, immediately after the last figure — the artefact's `:2147`.
    // A crowd the lane truncated is the one case where the figures alone would understate the
    // landing, so the number is not optional and is not allowed to be the thing that gets clipped.
    ctx.font = FIGURE_COUNT_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.alarm;
    ctx.fillText(`+${String(overflow)}`, input.x + shown * FIGURE_WIDTH_PX + 5, input.feetY);
  }

  return { shown, overflow, alarm };
}

/** The `+N`'s face. Smaller than the body face, because it is a marginal note on a crowd. */
const FIGURE_COUNT_FONT = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';

export interface AlarmRuleInput {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly simTimeS: number;
}

/**
 * The rule under a landing that has stacked — design `:2152–2156`.
 *
 * Drawn **across the whole plot** rather than only under the crowd, because the claim is about
 * the floor and not about the strip of it the figures happened to fit in.
 *
 * The alpha is composed into an `rgba()` string rather than set on `globalAlpha`, so a recording
 * stub sees the pulse in the value it was handed. Setting `globalAlpha` would make the whole
 * animation invisible to `stageRender.test.ts`'s determinism check, which is the failure mode
 * `render/sky.ts` refuses a `CanvasGradient` for.
 */
export function drawAlarmRule(ctx: Canvas2DLike, theme: Theme, input: AlarmRuleInput): void {
  ctx.strokeStyle = withAlpha(theme.alarm, alarmPulseAlpha(input.simTimeS));
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(input.x, input.y);
  ctx.lineTo(input.x + input.widthPx, input.y);
  ctx.stroke();
}

/**
 * `#rrggbb` plus an alpha, as `rgba(…)`.
 *
 * Total: a colour this cannot parse — a themed `rgba()` already, say — comes back unchanged, so a
 * custom palette loses the pulse rather than drawing `rgba(NaN,NaN,NaN,0.4)` and disappearing.
 *
 * **Exported, and composed into the value rather than set on `globalAlpha`.** Two callers now: the
 * alarm rule here, and `everyday/cutaway.ts`'s AD-S8 landing wash. `globalAlpha` is invisible to a
 * recording stub, so a translucent mark set that way cannot be asserted — which is the failure
 * `render/sky.ts` refuses a `CanvasGradient` for, and the reason the wash's own opacity is
 * checkable at all.
 */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (match === null) return hex;
  const [, r = '00', g = '00', b = '00'] = match;
  const clamped = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  return `rgba(${String(Number.parseInt(r, 16))},${String(Number.parseInt(g, 16))},${String(
    Number.parseInt(b, 16),
  )},${clamped.toFixed(3)})`;
}
