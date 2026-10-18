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

import type { DispatcherProfile, InterventionChange, RunInterventionConfig } from '@elevator-sim/core/browser';

import { drawCutaway, sizeCanvas } from './cutaway.js';
import { Playback } from '../playback/playback.js';
import { systemClock } from '../playback/clock.js';
import type { Frame, VizFloor, VizRecording } from '../contract/types.js';
import { describeFrame } from '../render/describeFrame.js';
import { frameAt } from '../frame/frameAt.js';
import { queueAt } from '../frame/overlay.js';
import { observationsAt } from '../live/observations.js';
import { clockAt } from '../live/timeline.js';
// AD-S17 — one derivation of *standing still* for both stages; see `render/carRest.ts`.
import {
  GHOST_OPTIONS,
  RACE_SAMPLE_INTERVAL_S,
  raceLaneOf,
  raceSlotsOf,
  raceStripViewOf,
  raceVerdictSlotAt,
  type GhostPick,
  type RaceStripView,
} from '../live/raceStrip.js';
import type { LiveObservations } from '../live/types.js';
import type { GoalState } from '../shift/types.js';
import { actionBarFor, type ActionBarModel } from './actionBar.js';
import { RUSH_LOSS_HOLD_MS, RUSH_NOT_LANDED, rushCompactHudOf, rushInterventionStampOf, rushLossLineOf, rushOpeningPaceOf, rushStageHeaderOf } from './rush.js';
import { RUSH_END_ASK_COPY, RUSH_STREAM } from './rushScreenModel.js';
import type { EverydayHost } from './host.js';
import { SCREEN_NAMES, type EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import {
  DEFAULT_STAGE_SPEED_INDEX,
  STAGE_AWAITING_RUN,
  STAGE_CAMERAS,
  STAGE_DRIVING_LABEL,
  STAGE_INTERVENTIONS,
  STAGE_RACE_PICKER_LABEL,
  STAGE_RECOMPUTING,
  stageCallAnsweredLineOf,
  stageRecomputingLineOf,
  STAGE_SPEEDS,
  STAGE_SWITCH_PICKER_LABEL,
  STAGE_SWITCH_PICKER_NOTE,
  STAGE_FLOOR_JUMP_PLACEHOLDER,
  stageAlarmOf,
  stageBarModelOf,
  stageRunFailedViewOf,
  stageBookedOutOf,
  stageCameraChipsOf,
  type StageCameraId,
  stageCameraWindowOf,
  type StageFigure,
  type StageFigureTone,
  stageFigureToneOf,
  stageFloorJumpOptionsOf,
  stageFilingLandsOn,
  stageGeometryOf,
  stageGoalsOf,
  type StageGoalRow,
  stageHeaderOf,
  type StageInterventionRow,
  stageInterventionsOf,
  type StageInterventionView,
  stageLegend,
  stageMayAdopt,
  stageOpeningLineOf,
  STAGE_OVERLAY_PLAY,
  STAGE_SKIP_COPY,
  stageBuildingScrollOf,
  stageHeaderSticksOf,
  stageLitSpeedOf,
  stagePlayControlOf,
  stageHandoverVerdictOf,
  type StageHandoverVerdict,
  stagePressChangedNobody,
  stageShowsOpening,
  stageSkipViewOf,
  stageSpeedAt,
  type StageSwitchTarget,
} from './stageScreenModel.js';
import { everydayProfileStore } from './profileStore.js';
import { DAY_ATTEMPT_COPY } from '../shift/attempt.js';
import { carAbsencesOf, type BookedOutCar } from '../shift/bookedOut.js';
/* GitHub issue #592, § D991 — the whole day's acts and the pace rule over them. */
import { actsOf, type DayAct } from '../shift/dayLength.js';
import type { RunHorizon } from '../shift/types.js';
import {
  firstLostInstantOf,
  stagePaceNoteOf,
  stagePaceOf,
  stageSkipLineStands,
  stageSkipSpeechOf,
  stagePaceStateOf,
  stageStatusOf,
  stageSkipApplies,
  stageSkipLineOf,
  stageSkipOf,
  type StagePaceReason,
  FRESH_PACE_COUNTERS,
  paceCountersAfter,
  type PaceCounters,
  type StagePace,
  worstWaitLossBeginsOf,
} from './stagePace.js';
/* Wave AI, § D1029 — the pinned day's call. */
import { DAY_CALL_FINAL_GOAL_IDS, type DayCallDriverNames } from '../shift/dayCalls.js';
import type { PressCall } from '../shift/pressCall.js';
import {
  STAGE_CALL_COPY,
  stageCallCardOf,
  stageCallStandingOrderOf,
  stageCallPresentOf,
  stageCallPhaseOf,
  stageEndDayOf,
  stageLostCardOf,
  STAGE_LOST_COPY,
  type StageCallOption,
} from './stageCall.js';
import { STAGE_CALL_ROWS_HEADING, stageCallRowsCaveatOf } from './stageCallRow.js';
/* GitHub issue #340: the two beat-1 events. The recorder is a no-op until consent is granted. */
import { everydayTelemetry } from './telemetryPort.js';
import { telemetryRunPointerOf } from '../telemetry/schema.js';
/*
 * § D344's sound — GitHub issue #258. The decisions are `audio.ts`', the graph is
 * `audioEngine.ts`', and this file holds the two frames, the limiter's memory and the context.
 */
import {
  audioCrossoverOf,
  audioPlanFor,
  NO_AUDIO_YET,
  type AudioCrossover,
  type AudioDirectorState,
} from './audio.js';
import { createAudioSink, type AudioSink } from './audioEngine.js';
import { switchUnpostableReasonOf } from '../scope/switchWire.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayState, RunContext } from './types.js';
import {
  playThisCrowdRefusalFor,
  watchStageBarOf,
  SPECTATOR_MAKES_NO_CHANGES,
} from './watchStage.js';
import type { WatchingView, WatchOwner } from '../watch/view.js';
import { driverNameAt, interventionLogOf } from '../live/interventions.js';
import { campaignDockViewOf, type CampaignDockView } from './campaignDock.js';
import { DIFFICULTIES } from '../campaign/economy.js';
import { DAY_CENSUS_COPY, campaignTestGoals, contractAsksEyebrow } from './campaignModel.js';
import { quietCareerDayOf } from './campaignScreens.js';

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
const barFacts: {
  hasRun: boolean;
  dayClosed: boolean;
  recomputing: boolean;
  dayEnded: boolean;
  /** § D1361: why this tab may not play the stage's day, with the attempt's weekday. */
  held: { readonly kind: 'elsewhere' | 'stale'; readonly weekday: string } | undefined;
} = { hasRun: false, dayClosed: false, recomputing: false, dayEnded: false, held: undefined };

/**
 * Whether this session has already seen visible trouble — GitHub issue #340, `docs/26` § 7.2 E3.
 *
 * *"`trouble_visible` ships once per session — the first crossing only."* Module scope rather than
 * mount scope, and the choice is the difference between *this session* and *this mount*: the stage
 * is mounted and unmounted every time a player walks off it and back, and a per-mount latch would
 * fire again on the second visit. Trouble is a thing a player sees for the first time once.
 *
 * It sits beside {@link barFacts} for that module's own reason — the stage's cross-mount facts live
 * here — and it is never reset, because a page load is what starts a session and a page load is a
 * fresh module.
 */
let troubleSeen = false;

/**
 * Whether the alarm strip was on the screen at the last draw — the edge {@link troubleSeen} is set
 * on. See the comment beside the event for why the condition is not watched directly.
 */
let alarmDrawn = false;

/**
 * The same store's spectator half — GitHub issue **#182**, [§ D436](../../../../DECISIONS.md).
 *
 * `bar(state)` is handed the shell's state and nothing else, so the § 3.3 `stage · watching` row's
 * one refinement — § 20.15's withdrawal of the primary on a row from another day — has to be
 * somewhere the refinement can see. Written by {@link mountStage} on every host notification, beside
 * the four above, and cleared when the watch ends: a stale refusal is worse than none
 * (§ D227), and this one would sit on a *player's own* day claiming it belonged to somebody else.
 */
const watchFacts: { hasReplay: boolean; playRefusal: string | undefined; owner?: WatchOwner | undefined } = {
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
/** § D1381: a header figure's ink by its tone — the handoff's live accent, then the palette's verdicts. */
const FIGURE_INK: Readonly<Record<StageFigureTone, string>> = Object.freeze({
  live: C.terracotta,
  met: C.moss,
  missed: C.alarm,
  still: C.ink,
});

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
 * constant over (`today.ts`'s plate carried a cited 400 for exactly that reason, until § D514
 * made it configuration).
 *
 * **No floor is set beneath it.** `340px` would only bind below a 567 px viewport, which is shorter
 * than anything the support matrix carries, so keeping it would have added a constant that nothing
 * in the supported range can reach — and the clause holds there anyway, since 340 px of a 567 px
 * viewport is already 60 %.
 */
const STAGE_CANVAS_HEIGHT = '60vh';

/** The shortest the rush's compact row lets the building get — wave AS, lane AS-1 ({@link syncRushCompact}). */
const RUSH_COMPACT_MIN_CANVAS_PX = 260;

/**
 * How often the stage's live region is re-announced — GitHub issue **#239**.
 *
 * The label on the canvas is rewritten on every frame, which costs nothing and is read only when a
 * player asks for it. The **region** is different: `aria-live` re-reads on every write, so a region
 * rewritten sixty times a second is a screen reader talking over the player continuously. Two
 * seconds is `dev/main.ts#ANNOUNCE_MS`'s figure, kept rather than re-chosen — the Engineer surface
 * has been announcing a stage at that cadence since `KB-13`, and a second number here would be two
 * answers to one question.
 */
const STAGE_ANNOUNCE_MS = 2000;

/*
 * The canvas sizing and the cutaway painter live in `cutaway.ts` now — GitHub issue #348, so that
 * Fix a building can play the as-built run on the same picture without importing this whole stage.
 * Nothing about the painting moved; what moved is the file it is in.
 */

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
  /**
   * **Where this stage is held while another tab holds the day's attempt** — wave AO, lane AO-1,
   * [§ D1361](../../../../DECISIONS.md). The playhead where it stood when the hold began (or the
   * run's start, for a run adopted under the hold), so this tab shows nothing it had not already
   * shown; `undefined` while this tab may play the day. {@link holdForAnotherTab} keeps it.
   */
  let heldAtS: number | undefined;
  /** Display time of the last live-region write — see {@link STAGE_ANNOUNCE_MS}. */
  let lastAnnouncedMs = Number.NEGATIVE_INFINITY;
  /** A stopped frame's sentence, waiting for the rate limit to lift — see `announce`. */
  let pendingSay: number | undefined;
  let adopted: VizRecording | undefined;
  /**
   * **What stood on the host when this mount began** — GitHub issue **#548**, and it is latched
   * before the entry press below rather than after it.
   *
   * § 7.3 says entering the stage is entering *the player's* day, and both routes onto it press for
   * one: `everyday/briefScreen.ts`'s primary is `host.startRun(); context.go('stage');`, and the
   * mount's own {@link stageEntryStartsARun} presses when nothing of the player's is standing.
   * `startRun` returns before the run lands — the simulation is on a worker and takes 15–60 s on the
   * towers this product ships — and `dev/main.ts` leaves the **previous** recording on the state
   * while it runs, on purpose (*"the recording on screen is the one from before, it is complete, and
   * it plays"*). That is right for the Engineer workbench, whose status line names the run in
   * flight. Here it put **yesterday's day on today's stage**: the player pressed Start, watched the
   * clock advance for a minute, and had the whole thing taken away when their own day landed and
   * {@link adopt} rebuilt the transport at the start of the run with the speed chip back at its
   * default. That is issue #548's *"reverts to the pre-Start paused screen"*, from the other end.
   *
   * So this mount remembers the one recording it may **not** take, and {@link stageMayAdopt} refuses
   * it for exactly as long as `host.runPending()` says the day that replaces it is still simulating.
   * The stage sits on {@link STAGE_AWAITING_RUN} until then, which is what `briefScreen.ts`'s own
   * docstring already promised it did.
   *
   * **Not on a watch**, on the guard below's ground: `enterWatch` puts somebody else's recording on
   * the state synchronously and navigates, so on that route what stands at entry **is** the thing to
   * play — and a shift left in flight behind it would otherwise refuse the spectator's own record.
   */
  let standingAtEntry: VizRecording | undefined;
  let speedIndex = defaultSpeedIndex();
  /*
   * ---- § D991's pace — GitHub issue #592. Three cells, all set in `adopt`. ----
   *
   * `speedIndex` above stays the **player's** rung; the transport may run faster than it between a
   * whole day's peaks, and `everyday/stagePace.ts` decides when. A chip press sets
   * `playerChoseSpeed`, and from then on the stage leaves the speed alone for the rest of the day.
   */
  let paceHorizon: RunHorizon = 'period';
  let paceActs: readonly DayAct[] = [];
  /**
   * Whether this is a scored day — a week's day on the daily stage, slice or whole day — which
   * [§ D1169](../../../../DECISIONS.md) paces by the tutorial's hold rule rather than by the peaks.
   */
  let paceScored = false;
  /** The reason the last paced frame gave, so a chip press knows whether the stage was fast. */
  let lastPaceReason: StagePaceReason | undefined;
  /*
   * § D1493 (wave AP, lane G-3): the real seconds of `watching` since the last decision, the playing
   * frame they were last counted at and its speed, and whether a chip pressed while the stage played
   * on has set the allowance aside until the next call.
   */
  let paceCounters: PaceCounters = FRESH_PACE_COUNTERS;
  /* Wave AQ, lane AQ-2 (§ D1506): the last paced frame, whose answer the counters advance by. */
  let watchedFrame: { readonly atS: number; readonly simPerRealS: number; readonly pace: StagePace } | undefined;
  let watchAllowanceOff = false;
  /** When a chip was pressed on this day — § D991 clause 2 as § D1029 amends it. */
  let playerChoseSpeedAtS: number | undefined;
  /*
   * ---- § D1212's skip between a scored whole day's peaks. Three cells, reset in `adopt`. ----
   *
   * `skipArmedAtS` is where the beat before a skip began, or `undefined` when no skip is coming;
   * `skipLandedAtS` is where the last skip landed, so the frame it lands on does not start another
   * beat; `skipLine` is the line the last skip left, which the strip keeps until the next one.
   */
  let skipArmedAtS: number | undefined;
  let skipLandedAtS: number | undefined;
  let skipLine = '';
  /*
   * ---- Wave AO, lane AO-4: one message for one state (`stagePace.ts#stageStatusOf`). ----
   *
   * `paceText` is what the pace rule (or a call's stop) says now and `paceStopped` whether that is a
   * stop; `skipLineReason` is the pace reason on the first frame after the last skip landed, so the
   * line goes the frame the stage leaves that state (`stageSkipLineStands`). {@link showStatus} is
   * the one writer of both spans.
   */
  let paceText = '';
  let paceStopped = false;
  let skipLineReason: StagePaceReason | undefined;
  /** A press set the day playing, and the next frame brings the building into view — {@link bringBuildingIntoView}. */
  let bringBuildingPending = false;
  /*
   * ---- § D1029's call — wave AI. Two cells, both set in `adopt`. ----
   *
   * `stageCall` is latched once per attempt, from the recording the attempt opened on, and only
   * when the host says the run is its tower's pinned day exactly as measured. `callAnswered` is
   * whether this attempt has answered it: a press at the call, *leave them*, or a skip to the end.
   */
  let stageCall: PressCall | undefined;
  let callAnswered = false;
  /*
   * ---- § D1138's ordinary calls — wave AJ. One cell. ----
   *
   * The calls themselves are the host's (`everyday/host.ts#dayCallOnStage`), asked afresh each
   * frame because they move as the player answers. This is only whether the transport is paused
   * **waiting** at a call whose two runs have not landed yet, so the stage can play on by itself if
   * that candidate turns out not to be raised.
   */
  let waitingOnCall = false;
  /**
   * Whether the player pressed *Skip to the end* and the stage is running to the next call on their
   * behalf — § D1151. Cleared when a card is drawn (the skip has arrived) and on the skip that runs
   * the day out.
   */
  let skipping = false;
  /* ---- § D344's sound — GitHub issue #258. Four cells, none of which a leg can read. ---- */
  /** The synthesised sink, built on the first frame that has something to play. */
  let audioSink: AudioSink | undefined;
  /** This building's discrete-cue ceiling and its lobbies. Recomputed on `adopt`, never per frame. */
  let audioCrossover: AudioCrossover | undefined;
  /** The frame the last cue check compared against — the transition detector's other half. */
  let audioBefore: Frame | undefined;
  /** The chime rate limiter's memory. */
  let audioState: AudioDirectorState = NO_AUDIO_YET;
  /** § 7.3's camera — GitHub issue #324. A view over the recording; it writes nothing to the run. */
  let camera: StageCameraId = 'whole';
  /** The floor a jump-to-floor selection targets — GitHub issue #549, § D625. Read only when `camera === 'floor'`. */
  let targetFloorId: string | undefined;
  let started = false;
  let pendingFrame: number | undefined;
  /**
   * The whole state {@link drawRace} last drew — the four-minute grid line **and** the rival.
   *
   * It was `raceGrid`, a bare grid index, while there was nothing but the playhead to key on. A
   * second recording lands on a worker result rather than on a clock tick, so the index alone left
   * the rival off the lanes until the playhead next crossed a boundary (GitHub issue #226, § D482).
   * The index is gone rather than kept beside this: written and never read is the shape this
   * repository has a standing rule about, at the smallest scale it occurs at.
   */
  let raceKeyDrawn = '';
  let raceView: RaceStripView | undefined;
  /** {@link raceSlotsOf}'s verdict for the drawn state — see the last lines of {@link drawRace}. */
  let raceSlotVerdict = '';
  /**
   * The recording an intervention was pressed over. § 7.6 asks for a `recomputing` beat rather than
   * a silent freeze; the beat ends when the host notifies with a *different* recording, which is the
   * only signal the façade offers and the correct one — § 1.4's re-simulation keeps the `runId`.
   */
  let recomputingOver: VizRecording | undefined;
  /** Wave AQ, lane AQ-2: what the player chose, when the recomputing beat follows a call's answer. */
  let answeredLine: string | undefined;
  /**
   * **The parking press whose re-simulation is in flight, and the verdict on the last one that
   * landed** — GitHub issue #588, [§ D1278](../../../../DECISIONS.md).
   *
   * {@link intervene} writes `pendingPress` beside {@link recomputingOver}, so when {@link adopt}
   * takes the re-simulated day it holds the day before the press, the day after it, and the press:
   * the with-and-without pair on one seed, compared once on the legs by
   * `stageScreenModel.ts#stagePressChangedNobody`. `pressChangedNobody` is that press when the
   * answer was *nobody's trip changed*, and `undefined` otherwise; every adoption rewrites it, so a
   * new day or a later answer never inherits an old verdict.
   */
  let pendingPress: RunInterventionConfig | undefined;
  let pressChangedNobody: RunInterventionConfig | undefined;
  /**
   * **The last handover, judged when its day landed** — GitHub issue #571,
   * [§ D1310](../../../../DECISIONS.md). `stageScreenModel.ts#stageHandoverVerdictOf` reads the same
   * pair {@link adopt} hands § D1278's comparator, and every adoption rewrites it for the same reason.
   */
  let handoverVerdict: StageHandoverVerdict | undefined;
  /** What the parking note last said, so a frame that changes nothing writes nothing. */
  let parkingNoteSaid = '';
  /** What § 14.1's band was last drawn for — see {@link drawWatching}. `''` while it is down. */
  let watchKey = '';
  /**
   * **What the two other announcement regions last said, and when** — `docs/36` `AX-3`, GitHub
   * issue #406, [§ D592](../../../../DECISIONS.md).
   *
   * `AX-3`'s policy is *"a live region is written when its sentence changes, and at no other
   * time"*, and `docs/36` § 3.2 names the alarm strip as **the clearest example in the product of
   * why that standard exists**: `alarm.replaceChildren(…)` ran on every frame the alarm was up,
   * which is up to sixty rewrites a second of a `role="status"` region. `interventionStamp` was the
   * same defect one element over, through `textContent =` — and assigning the *same* string still
   * replaces the text node, so the mutation fires and the reader re-reads. Measured on
   * `vertical-city` over 300 frames: **91 stamp writes, every one of them the same sentence**, and
   * 28 alarm writes over the 28 frames the strip was up.
   *
   * **The two need different guards, and finding that out is what the measurement bought.** The
   * stamp's sentence is fixed once an intervention is pressed, so equality is the whole answer. The
   * alarm's is not: `stageScreenModel.ts#stageAlarmOf` carries a live count, so its sentence really
   * does change on most frames and an equality guard alone leaves the region talking. It gets
   * {@link description}'s answer as well — the same {@link STAGE_ANNOUNCE_MS} rather than a second
   * number — on a hidden sibling, so the strip a sighted player reads keeps its live count. See
   * {@link alarm}.
   *
   * `alarmDrawnLine` is the strip's own last paint and is **not** an accessibility guard; it is here
   * because a repaint that paints the same thing is work nobody asked for.
   *
   * The check is `everyday/screenReaderWalkthrough.browser.test.ts`, and it goes red without these.
   */
  let alarmSaid: string | undefined;
  let alarmSaidMs = Number.NEGATIVE_INFINITY;
  let alarmDrawnLine: string | undefined;
  let stampSaid: string | undefined;

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

  /*
   * The car the tower books out part-way through the day — GitHub issue #596 item 3, § D983. The
   * words are `stageScreenModel.ts#stageBookedOutOf`'s; this is the pill. Down on a tower that books
   * nothing, which is most of them.
   */
  const bookedPill = el(doc, 'span', 'everyday-stage-booked');
  bookedPill.style.cssText = [
    `border:1px dashed ${C.terracotta}`,
    `border-radius:${String(R.pill)}px`,
    'padding:3px 10px',
    `font:500 10px ${TYPE.mono}`,
    'letter-spacing:.08em',
    `color:${C.terracotta}`,
    'display:none',
  ].join(';');
  /* Read once per recording, not per frame — `resolvedBuilding()` resolves the whole run config. */
  let bookedFor: VizRecording | undefined;
  /* Whether {@link bookedCars} was read for a watched run — the spectator state can arrive a frame after its recording. */
  let bookedWatching = false;
  let bookedCars: readonly BookedOutCar[] = [];

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

  /*
   * **A practice run says so on the stage** — wave AM, lane AM-B, [§ D1239](../../../../DECISIONS.md),
   * the post-AL panel's seat D (D6). The stage of *Take this call again* and of *Run today again*
   * looked exactly like the scored day's, and only the report said the run banked nothing. The
   * sentence is the brief's for the ground the close will print (`EverydayHost.practiceOnStage`);
   * down on a run that banks.
   */
  const practiceLine = el(doc, 'span', 'everyday-stage-practice');
  practiceLine.style.cssText = [
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.pill)}px`,
    'padding:3px 10px',
    'font-size:12px',
    `color:${C.inkSoft}`,
    'display:none',
  ].join(';');

  /*
   * **Every strip in this header wraps, and that is one answer to GitHub issue #240 rather than
   * four.** The header itself has wrapped since it was written; its *children* did not, and a
   * `display:flex` row that cannot wrap has a min-content width equal to the sum of its items —
   * which is what propagates up a whole screen. Measured at 360 px before the change, the § 7
   * stage's min-content was **485 px** against a 360 px viewport, and the speed strip's seven chips
   * were 302 of it. A wrapping strip's min-content is its widest single item instead.
   */
  const figures = el(doc, 'div', 'everyday-stage-figures');
  figures.style.cssText = `display:flex;flex-wrap:wrap;gap:${String(GAP.section)}px;margin-left:auto`;

  const playButton = el(doc, 'button', 'everyday-stage-play');
  /** {@link focusPlayOnRushEntry}'s once-only flag, here so no early call meets it uninitialised. */
  let rushEntryFocusPending = context.ctx === 'rush';
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
  speeds.style.cssText = `display:flex;flex-wrap:wrap;gap:${String(GAP.tight)}px`;
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

  /*
   * § 2.3's way out of watching — GitHub issue **#369**, § D525 clause 4.
   *
   * Beside the ladder rather than on it, and the placement is the argument: it is not an eighth
   * rung. A rung changes how fast the recording is drawn; this moves the playhead to `endedAt`.
   * `stageScreenModel.ts#STAGE_SKIP_COPY`'s note is what says that to the player, and
   * {@link syncTransport} is what keeps the control honest once the day is over — a button still
   * pressable when it can do nothing is § D354's defect wearing different clothes.
   */
  const skipButton = el(doc, 'button', 'everyday-stage-skip');
  skipButton.type = 'button';
  skipButton.addEventListener('click', () => {
    skipToEnd();
  });

  /*
   * § 7.3's camera — GitHub issue #324, § D505. Drawn only on a tower the camera can help
   * (`stageCameraChipsOf` measures it against the canvas each paint), which is the honest form of
   * *a control that writes nothing must say so* for a view control: on a short tower the three
   * positions are one picture, and a chip that changed nothing would be a lie in a strip.
   */
  speeds.append(skipButton);
  /*
   * **End the day** — [§ D1168](../../../../DECISIONS.md). Drawn only on a scored day whose queue or
   * worst-wait goal already reads missed at the playhead ({@link drawEndDay}), where the day cannot
   * clear and the stage asks nothing more. Beside the skip, because it is the same kind of control:
   * it moves no run, and files the day on the recording already made.
   */
  const endDayButton = el(doc, 'button', 'everyday-stage-end-day');
  endDayButton.type = 'button';
  endDayButton.style.display = 'none';
  endDayButton.addEventListener('click', () => {
    endTheDay();
  });
  speeds.append(endDayButton);
  /*
   * § D991's note — why the transport is at the rung it is, on a whole day. Empty on every other
   * run, where nothing is paced. Written by {@link pace} on change only.
   */
  const paceNote = el(doc, 'span', 'everyday-stage-pace');
  paceNote.style.cssText = `align-self:center;font:500 11px ${TYPE.mono};color:${C.warmGrey}`;
  speeds.append(paceNote);
  /*
   * § D1212's line — the beat's note while a skip is coming, and then what the skip passed over.
   * Its own element beside the pace note, because the pace note says why the transport is at its
   * rung and this says where the playhead went; one line doing both would be rewritten every frame.
   * Polite, so a reader hears a skip once, when it lands.
   */
  const skipNote = el(doc, 'span', 'everyday-stage-skip-line');
  skipNote.setAttribute('aria-live', 'polite');
  skipNote.style.cssText = `align-self:center;font:500 11px ${TYPE.mono};color:${C.warmGrey}`;
  speeds.append(skipNote);

  const cameras = el(doc, 'div', 'everyday-stage-cameras');
  /*
   * Never `hidden`: the strip is a flex box whose whole content is the chips, so with none in it
   * the box has no height, and `hiddenBox.test.ts` refuses an inline `display` on anything the
   * `hidden` attribute is asked to hide, because the inline value outranks `[hidden]`.
   */
  cameras.style.cssText = `display:flex;flex-wrap:wrap;gap:${String(GAP.tight)}px`;
  const cameraButtons = STAGE_CAMERAS.map((chip) => {
    const button = el(doc, 'button', 'everyday-stage-camera', chip.label);
    button.type = 'button';
    button.dataset['camera'] = chip.id;
    button.addEventListener('click', () => {
      camera = chip.id;
      syncCamera();
      requestFrame();
    });
    return button;
  });
  /* Empty until a laid-out paint offers the chips — see the paint below for why absent, not hidden. */

  /*
   * The fourth camera position — a jump to a player-chosen floor, GitHub issue #549, § D625. A
   * `<select>` rather than a fifth {@link STAGE_CAMERAS} chip: the other three need no input before
   * they do anything, and this one does, so a chip with nothing to click first would be a control
   * that looked live and did nothing — exactly what § D219/§ D227 refuse in both directions.
   */
  const floorJump = el(doc, 'select', 'everyday-stage-floor-jump');
  /**
   * `STAGE_FLOOR_JUMP_PLACEHOLDER` verbatim — the sighted reader's own words, which is what SC
   * 2.5.3 asks an accessible name to match, and the reason every other `<select>` in this file
   * sets `aria-label` from the string it also draws rather than a second phrasing of it.
   */
  floorJump.setAttribute('aria-label', STAGE_FLOOR_JUMP_PLACEHOLDER);
  floorJump.style.cssText = [
    `background:transparent`,
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.control)}px`,
    'padding:5px 9px',
    `font:500 11px ${TYPE.mono}`,
    `color:${C.warmGrey}`,
    'cursor:pointer',
    /*
     * `vertical-city`'s hundred floors give the select's widest `<option>` more text than a phone
     * viewport holds; unbounded, the browser sizes the closed box to that text and pushes it past
     * the edge of the header's own wrapped row. `max-width:100%` is `campaignScreens.ts#select`'s
     * same fix for the same shape — smallScreen.browser.test.ts's #549 case.
     */
    'max-width:100%',
  ].join(';');
  /** The floor set the select's `<option>`s were last built from — rebuilt only when this changes. */
  let floorJumpBuiltFor: readonly VizFloor[] | undefined;
  floorJump.addEventListener('change', () => {
    if (floorJump.value === '') return;
    camera = 'floor';
    targetFloorId = floorJump.value;
    syncCamera();
    requestFrame();
  });

  function syncCamera(): void {
    for (const button of cameraButtons) {
      const on = button.dataset['camera'] === camera;
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
    /* Picking a fixed chip un-picks the floor jump — there is no `floor` chip to do it instead. */
    if (camera !== 'floor') floorJump.value = '';
  }
  syncCamera();

  /*
   * GitHub issue #626 item 7: the select was appended here with no `<option>` and stayed that way on a
   * tower whose floors all fit, a control that did nothing. It joins the header only once it has
   * floors to offer, beside the camera chips under the same gate, and leaves when it has none.
   */
  header.append(clock, phase, nextPhase, bookedPill, driving, practiceLine, figures, playButton, speeds, cameras);

  /*
   * **Pillar 3's strip** — GitHub issue **#277**, [§ D470](../../../../DECISIONS.md).
   *
   * The charter named P3 as the pillar this build failed outright — re-adjudicated on GitHub issue #277's landing, `docs/22` § 2 — and its refusal test is *where on
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
  /*
   * **Which of a career player's two goal sets this strip is** — GitHub issue #567. Under the
   * heading rather than under the rows, and above {@link goalNote}: a reader who cannot tell these
   * five from the contract's four has that question before they have the one about playheads. Empty
   * on every other flow, and the element is hidden rather than left as a blank line.
   */
  const goalContract = el(doc, 'span', 'everyday-stage-goals-contract');
  goalContract.style.cssText = `font-size:11px;line-height:1.4;color:${C.inkSoft}`;
  /*
   * **The week's five, folded under the contract's four on a career day** — wave AR, lane AR-4,
   * GitHub issue #633. Closed by default: the four above are what file the day. Down everywhere else.
   */
  const goalWeek = el(doc, 'details', 'everyday-stage-goals-week') as HTMLDetailsElement;
  goalWeek.style.cssText = `display:none;border-top:1px solid ${C.ruleLight};padding-top:6px`;
  const goalWeekSummary = el(doc, 'summary', 'everyday-stage-goals-week-heading');
  goalWeekSummary.style.cssText = `${EYEBROW};cursor:pointer`;
  const goalWeekNote = el(doc, 'span', 'everyday-stage-goals-week-note');
  goalWeekNote.style.cssText = `display:block;font-size:11px;line-height:1.4;color:${C.inkSoft};margin:4px 0`;
  const goalWeekRows = el(doc, 'div', 'everyday-stage-goals-week-rows');
  goalWeekRows.style.cssText = goalRows.style.cssText;
  goalWeek.append(goalWeekSummary, goalWeekNote, goalWeekRows);
  goals.append(goalHeading, goalContract, goalRows, goalNote, goalWeek);

  /**
   * **The alarm strip is a picture again, and its announcement moved to {@link alarmSay}** —
   * `docs/36` `AX-3`, GitHub issue #406, [§ D592](../../../../DECISIONS.md).
   *
   * It carried `role="status"` and was rewritten on every frame it was up, which `docs/28` AD-A3 and
   * `docs/36` § 3.2 both name as the clearest announcement defect in the product. The first fix
   * tried was an equality guard — write only when the sentence changes — and measuring it showed
   * why that is not enough on its own: `stageScreenModel.ts#stageAlarmOf` returns *"41 people
   * waiting, deepest at floor 7"*, and the **count moves**, so the sentence genuinely changes on
   * most frames and a reader is still talked over continuously.
   *
   * So the strip keeps the live count a sighted player wants and stops being a live region, and a
   * visually hidden sibling carries the announcement at {@link STAGE_ANNOUNCE_MS}. That is the split
   * {@link description} already makes one element over, for the same reason, with the same constant
   * rather than a second number — and `AX-0` is satisfied: nothing stops being said, and nothing
   * stops being drawn.
   */
  const alarm = el(doc, 'div', 'everyday-stage-alarm');
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

  /**
   * The alarm's announcement — the strip's own sentence, said once and then at most every
   * {@link STAGE_ANNOUNCE_MS}. See {@link alarm} for why the two are separate elements.
   *
   * It is the **same string** rather than a second wording, so the two cannot drift; that is
   * `honesty/agreement.ts`'s `surfaces-disagree` avoided structurally rather than asserted.
   */
  const alarmSay = el(doc, 'p', 'everyday-stage-alarm-say');
  alarmSay.setAttribute('role', 'status');
  alarmSay.setAttribute('aria-live', 'polite');
  alarmSay.style.cssText = [
    'position:absolute',
    'width:1px',
    'height:1px',
    'margin:-1px',
    'padding:0',
    'overflow:hidden',
    'clip:rect(0 0 0 0)',
    'clip-path:inset(50%)',
    'white-space:nowrap',
    'border:0',
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
  watchFigures.style.cssText = `display:flex;flex-wrap:wrap;gap:${String(GAP.section)}px;margin-left:auto`;
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

  /**
   * **The stage's text alternative** — GitHub issue **#239**'s second criterion, `UX.md` `KB-13`.
   *
   * A `<canvas>` has no accessible children, so to a non-sighted player everything on this screen
   * is a blank rectangle — and this is the screen the game is played on. The Engineer surface has
   * had `render/describeFrame.ts` in its canvas label and a live region since `KB-13`; the
   * Everyday stage shipped without either, which is the gap #239 names as *"the hard case"*.
   *
   * **The same sentence rather than a second one.** `describeFrame` is a pure function of
   * `(recording, frame)`, so the words and the picture read the same frame and cannot drift. A
   * description assembled from this module's own state would be a second source of truth about
   * what is on screen, which is the defect that file's docstring was written about.
   *
   * **Visually hidden rather than drawn**, because every fact in it is already on the screen for a
   * sighted player — the clock, the figures, the alarm — and printing it again would be two copies
   * to reconcile. `role="status"` and `aria-live="polite"` together are belt and braces (readers
   * key off one or the other), and *polite* because a day in progress is not an alert.
   */
  const description = el(doc, 'p', 'everyday-stage-description');
  description.setAttribute('role', 'status');
  description.setAttribute('aria-live', 'polite');
  description.style.cssText = [
    'position:absolute',
    'width:1px',
    'height:1px',
    'margin:-1px',
    'padding:0',
    'overflow:hidden',
    'clip:rect(0 0 0 0)',
    'clip-path:inset(50%)',
    'white-space:nowrap',
    'border:0',
  ].join(';');
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
  /* § D1309, GitHub issue #573: a playback verb, so the brief's `Start the day` is the one start. */
  const startButton = el(doc, 'button', 'everyday-stage-start', STAGE_OVERLAY_PLAY);
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
  /*
   * **The failed state's two ways on** — GitHub issue #593, `stageRunFailedViewOf`. Hidden until a
   * run of the player's own fails; then the overlay says so and these are the only two controls it
   * offers, because a failure the player cannot act on is the endless spinner with better words.
   */
  const failedRow = el(doc, 'div', 'everyday-stage-failed');
  failedRow.style.cssText = 'display:none;gap:10px;flex-wrap:wrap;justify-content:center';
  const retryButton = el(doc, 'button', 'everyday-stage-failed-retry');
  retryButton.type = 'button';
  retryButton.style.cssText = startButton.style.cssText;
  retryButton.addEventListener('click', () => {
    /*
     * The flow's own run press, not the daily one: `host.startRun` disarms a career day's latch by
     * design (`host.ts#campaignDayTowerId`), so a career retry through it would come back as a
     * Scenario day, and a rush's standing is written by `startRush` alone.
     */
    const careerDay = context.ctx === 'campaign' ? host.campaignDay() : undefined;
    if (careerDay !== undefined) host.runCampaignDay(careerDay.tower.id);
    else if (context.ctx === 'rush') host.startRush();
    else if (context.ctx === 'daily') host.playDay();
    else host.startRun();
    syncTransport();
  });
  const backButton = el(doc, 'button', 'everyday-stage-failed-back');
  backButton.type = 'button';
  backButton.style.cssText = [
    'background:transparent',
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.row)}px`,
    'padding:10px 22px',
    `color:${C.ink}`,
    'font-size:14px',
    'cursor:pointer',
  ].join(';');
  backButton.addEventListener('click', () => {
    context.go(stageRunFailedViewOf(context.ctx).back.screen);
  });
  failedRow.append(retryButton, backButton);
  /*
   * **A quiet career day offers Skip to the end beside Play, and leads with it** — wave AS, lane
   * AS-4, GitHub issue #637 item 6, [§ D1572](../../../../DECISIONS.md). On a day the desk's census
   * marks quiet (§ D1543), pressing *Play* ran two minutes with nothing to decide. The skip is the
   * stage's own `skipToEnd` (so it still stops at any call the day raises) and the line above it is
   * `DAY_CENSUS_COPY.quietStage`. Shown only on such a day; every other start is unchanged.
   */
  const quietNote = el(doc, 'p', 'everyday-stage-quiet-note', DAY_CENSUS_COPY.quietStage);
  quietNote.style.cssText = `display:none;margin:0;color:${C.ink};font-size:13px;font-weight:600;max-width:44ch`;
  const startRow = el(doc, 'div', 'everyday-stage-start-row');
  startRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center';
  const quietSkip = el(doc, 'button', 'everyday-stage-start-skip', STAGE_SKIP_COPY.label);
  quietSkip.type = 'button';
  quietSkip.style.cssText = startButton.style.cssText + ';display:none';
  quietSkip.addEventListener('click', () => {
    skipToEnd();
  });
  const START_PRIMARY = startButton.style.cssText;
  const START_SECONDARY = [
    'background:transparent',
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.row)}px`,
    'padding:10px 22px',
    `color:${C.ink}`,
    'font-size:14px',
    'font-weight:600',
    'cursor:pointer',
  ].join(';');
  startRow.append(startButton, quietSkip);
  status.append(statusText, quietNote, startRow, failedRow);
  stageWrap.append(canvas, description, watchPill, status);

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
    /*
     * Disabled until a run is on this stage — wave AQ, lane AQ-3. {@link intervene} does nothing
     * without one, and a tab whose run was refused (another tab holds the week's day) drew both arms
     * pressable over a press that did nothing. {@link draw} enables them once a run is adopted.
     */
    button.disabled = true;
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
  /*
   * **The picker says on its own face that choosing is not committing** — GitHub issue #565,
   * § D856, whose argument is on `STAGE_SWITCH_PICKER_NOTE`. Drawn beside the control and pointed
   * at by `aria-describedby`, so a screen reader meets it in the same breath as the list rather
   * than after it; `id` is set here because the note is this mount's element and the words are the
   * model's, which is this file's founding split.
   */
  const switchPickerNote = el(doc, 'span', 'everyday-stage-switch-note');
  switchPickerNote.id = 'everyday-stage-switch-note';
  switchPickerNote.style.cssText = `font-size:11.5px;line-height:1.5;color:${C.warmGrey};flex-basis:100%`;
  switchPicker.setAttribute('aria-describedby', switchPickerNote.id);
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
    // The note is about the pair; with no shelf there is no control for it to be about.
    switchPickerNote.hidden = latest.length === 0;
  }
  const switchButton = el(doc, 'button', 'everyday-stage-intervene');
  switchButton.type = 'button';
  /* Disabled until a run is on this stage, for the parking arms' reason above. */
  switchButton.disabled = true;
  switchButton.dataset['interventionKind'] = 'adopt-dispatcher';
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
    if (target === undefined) return undefined;
    /*
     * GitHub issue #338, § D486: the shipped shelf is every dispatcher the host offers less the
     * ones the reader saved, and a handover the board could not carry says so on the row before
     * the press rather than at the moment of posting.
     */
    const savedIds = new Set(host.savedDispatchers().map((entry) => entry.id));
    const shipped = switchable.filter((profile) => !savedIds.has(profile.id));
    const unpostable = switchUnpostableReasonOf(target, shipped);
    return { target, driving: () => host.drivingProfile(), ...(unpostable === undefined ? {} : { unpostable }) };
  };
  const interventionStamp = el(doc, 'span', 'everyday-stage-stamp');
  interventionStamp.setAttribute('role', 'status');
  interventionStamp.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.warmGrey}`;
  const interventionRefusal = el(doc, 'span', 'everyday-stage-intervene-refusal');
  interventionRefusal.id = 'everyday-stage-intervene-refusal';
  interventionRefusal.style.cssText = `font-size:11.5px;color:${C.label}`;
  /* The handover arm's note — drawn, not a title, because a reason a player cannot see is not one. */
  const interventionNote = el(doc, 'span', 'everyday-stage-intervene-note');
  interventionNote.style.cssText = `font-size:11.5px;color:${C.warmGrey};flex-basis:100%`;
  /*
   * **The parking arms' note** — GitHub issue #588, [§ D1278](../../../../DECISIONS.md). A slot of its
   * own, because `interventionNote` above is the handover row's and its one writer is
   * {@link applySwitchRow}; a parking note written into it would be overwritten on the next frame.
   * § D949's second ruled-out route was exactly this missing element: a note on a parking row was a
   * string no surface rendered. Drawn text rather than a `title`, for the reason the handover note
   * gives one line up.
   */
  const parkingNote = el(doc, 'span', 'everyday-stage-park-note');
  parkingNote.style.cssText = `font-size:11.5px;color:${C.warmGrey};flex-basis:100%`;
  interventions.append(
    ...interventionButtons,
    switchPicker,
    switchButton,
    switchPickerNote,
    interventionStamp,
    interventionRefusal,
    interventionNote,
    parkingNote,
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
  /*
   * § 7.4's picker — GitHub issue #226, § D482. The options are `GHOST_OPTIONS`, the model's own
   * honest three, never markup: an option authored here would be a fourth arm of a list whose
   * docstring argues at length that the missing two are *omitted, not stubbed*.
   *
   * `id`/`htmlFor` rather than a wrapping `<label>`, matching the handover picker two blocks up.
   */
  const raceKey = el(doc, 'span', 'everyday-stage-race-key');
  raceKey.style.cssText = `font:500 10.5px ${TYPE.mono};color:${C.warmGrey}`;
  const racePickLabel = el(doc, 'label', undefined, STAGE_RACE_PICKER_LABEL);
  racePickLabel.style.cssText = EYEBROW;
  racePickLabel.htmlFor = 'everyday-stage-ghost';
  const racePicker = el(doc, 'select', 'everyday-stage-ghost');
  racePicker.id = 'everyday-stage-ghost';
  racePicker.style.cssText = [
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.control)}px`,
    `background:${C.paper}`,
    `color:${C.ink}`,
    'padding:3px 6px',
    `font-family:${TYPE.body}`,
    'font-size:12px',
    'max-width:100%',
  ].join(';');
  /**
   * Write the picker's face for the run on screen — GAMEPLAY § 14.1, GitHub issue #226.
   *
   * ## Why the options are rewritten rather than the control merely disabled
   *
   * A disabled `<select>` still renders its option list, and `innerText` reads it: while a record
   * was on the stage the three offers stayed on the screen, one of them called `your latest saved`,
   * over somebody else's day. That is § 14.1's stated defect condition — *"the word `you` on a
   * watched run is a defect"* — and `watchStage.browser.test.ts` found it by sweeping the rendered
   * screen. Greying a control does not un-say what the control says.
   *
   * ## Kept in the layout, and rebuilt rather than hidden
   *
   * The `<select>` itself stays mounted and stays where it is. Hiding it would be the trap lane A
   * hit one lane over: an element removed from a laid-out flow is not merely invisible, it stops
   * being *placed*, and the tracks around it re-fit. What changes is what it presents.
   *
   * The spectator's face is `GHOST_OPTIONS`' own *nobody* — no new string, and the true one: while
   * a record is on the stage there is no rival and none can be commissioned. The reason is not on
   * this control at all any more; it is drawn under the lanes, from `raceSlotsOf`'s note, which is
   * how the Engineer strip says it too. A `title` said it before, where nobody read it.
   */
  let raceOffers: 'all' | 'spectator' | '' = '';
  function writeRaceOptions(watching: boolean): void {
    const wanted = watching ? 'spectator' : 'all';
    if (raceOffers === wanted) return;
    raceOffers = wanted;
    racePicker.replaceChildren();
    for (const option of GHOST_OPTIONS) {
      if (watching && option.id !== 'none') continue;
      const entry = el(doc, 'option', undefined, option.label);
      entry.value = option.id;
      /*
       * No `title` on a spectator's entry. `nobody`'s own note says *"just your day"*, which is a
       * true sentence about the player's run and a false one about the record on the stage — and an
       * attribute is exactly where a wrong sentence survives unread.
       */
      if (!watching) entry.title = option.note;
      racePicker.append(entry);
    }
  }
  writeRaceOptions(false);
  racePicker.value = 'none';
  raceHead.append(raceTitle, raceVerdict, racePickLabel, racePicker, raceKey);
  const laneWait = laneBlock(doc, 'how long people are waiting');
  const laneStanding = laneBlock(doc, 'still standing');
  const raceNote = el(doc, 'p', 'everyday-stage-race-note');
  raceNote.style.cssText = `margin:0;font-size:11.5px;color:${C.label}`;
  const raceFooter = el(doc, 'p', 'everyday-stage-race-footer');
  raceFooter.style.cssText = `margin:0;font-size:11.5px;color:${C.warmGrey}`;
  race.append(raceHead, laneWait.block, laneStanding.block, raceNote, raceFooter);

  /*
   * **The stage's register of absences is not drawn here any more** — it is on the settings
   * screen with the other five (`everyday/buildNotes.ts`), which is GitHub issue #207. The array
   * has not moved and neither has any absence it names; the rows that remain were re-worded out
   * of the design document's vocabulary and say the same thing they said.
   *
   * The ghost lane's refusal used to be the one a player still met *here*, on the lane's own card —
   * `STAGE_NO_GHOST`, the register's one **control's** refusal. It is gone with the absence it named
   * (GitHub issue #226, § D482): the lane has a picker now, and what that card carries instead is the
   * picked option's own note — or, when a pick cannot honestly be run, the reason. Still on the
   * control rather than only in a register, which is the rule that entry was the example of.
   */
  /*
   * § 7.5's dock — *"a 288 px column floats at the right of the stage"* when `ctx === 'campaign'`
   * (GitHub issue #171, § D507). The stage and the column share a row that wraps, so on a narrow
   * viewport the column drops under the picture rather than squeezing it: every control the dock
   * holds is measured by `viewportGates.browser.test.ts`, and a column that overflowed the page
   * would be a control nobody could reach. Every word in it is `campaignDock.ts`'s; this block only
   * decides the elements. **Absent from the document** outside a campaign day — never hidden —
   * for the camera strip's reason two blocks up.
   */
  const stageRow = el(doc, 'div', 'everyday-stage-row');
  stageRow.style.cssText = `display:flex;flex-wrap:wrap;align-items:flex-start;gap:${String(GAP.row + 2)}px`;
  stageWrap.style.flex = '1 1 480px';
  stageWrap.style.minWidth = '0';
  const dock = el(doc, 'aside', 'everyday-stage-dock');
  dock.style.cssText = [
    'flex:0 0 288px',
    'max-width:100%',
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.card)}px`,
    `background:${C.paper}`,
    'padding:12px 14px',
    'display:flex',
    'flex-direction:column',
    `gap:${String(GAP.row)}px`,
  ].join(';');
  dock.setAttribute('aria-label', 'campaign dock');
  stageRow.append(stageWrap);

  /**
   * **The one screen in the product that exposed no heading at all** — `docs/36` `AX-15`, GitHub
   * issue #406, [§ D591](../../../../DECISIONS.md).
   *
   * Measured on Chromium's own accessibility tree, screen by screen: twenty of the twenty-one
   * screens `everyday/screens.ts` builds expose exactly one level-1 heading, and this one — the
   * screen the game is actually played on — exposed none. Heading navigation is how a screen-reader
   * user answers *where am I*, and on the stage the answer was silence.
   *
   * **Visually hidden, for the reason {@link description} is**: every fact on this screen is already
   * drawn for a sighted player — the clock, the phase, the driver, the figures — and § 7.1's header
   * is a strip of live values rather than a title. Printing a title above it would be a layout
   * change the design handoff did not ask for, and the clause asks for a heading rather than for a
   * bigger header. `AX-0` is satisfied in the other direction too: nothing is removed here.
   *
   * `SCREEN_NAMES.stage` rather than a sentence of its own, so this adds **no** player-facing string
   * and the stage cannot come to be called two things. The shell draws the same constant as the
   * region's landmark name and on its own refusal screens.
   */
  const title = el(doc, 'h1', 'everyday-stage-title', SCREEN_NAMES.stage);
  title.style.cssText = [
    'position:absolute',
    'width:1px',
    'height:1px',
    'margin:-1px',
    'padding:0',
    'overflow:hidden',
    'clip:rect(0 0 0 0)',
    'clip-path:inset(50%)',
    'white-space:nowrap',
    'border:0',
  ].join(';');

  /*
   * **§ D1029's call card** — drawn only while a pinned day's call stands at the playhead, and
   * rebuilt only when the call changes. The words are `everyday/stageCall.ts`'s; this decides which
   * element they go in and what the buttons press.
   */
  const callCard = el(doc, 'div', 'everyday-stage-call');
  callCard.setAttribute('role', 'group');
  /*
   * **A destination rather than a stop on the tab order** — `docs/36` `AX-12`, *focus moves to what
   * just happened*, and the post-AI playability panel's first finding in all four seats: the stage
   * stopped for the call and the card was drawn below the fold with nothing sent to it, so a
   * player saw a frozen clock. See {@link showCallCard} for when focus moves, and why only then.
   */
  callCard.tabIndex = -1;
  callCard.setAttribute('aria-describedby', 'everyday-stage-call-question');
  callCard.hidden = true;
  callCard.style.cssText = [
    `border:1.5px solid ${C.ink}`,
    `border-radius:${String(R.row)}px`,
    `background:${C.card}`,
    'padding:12px 14px',
  ].join(';');
  /*
   * The grid lives on an inner body rather than on the card, because an inline `display:grid` on
   * the card would outrank the `[hidden]` rule and draw an empty card before the call
   * (`hiddenBox.test.ts`). The card is hidden by its attribute alone.
   */
  const callBody = el(doc, 'div', 'everyday-stage-call-body');
  callBody.style.cssText = 'display:grid;gap:7px';
  /*
   * **The close asks once while a call is up** — wave AL, lane AL-A, the post-AK panel's seat B
   * (D1). § 3.3's *Close the day* filed the day as it stood, unanswered, on the first press; on a
   * phone it is the largest button on the screen. The ask sits inside the card, under its answers,
   * so the question and the choice it would skip are read together. Hidden by its attribute alone
   * (its layout is on an inner row), for `callBody`'s reason above. Words: `STAGE_CALL_COPY`.
   */
  const closeAsk = el(doc, 'div', 'everyday-stage-call-confirm');
  closeAsk.hidden = true;
  closeAsk.setAttribute('role', 'group');
  closeAsk.setAttribute('aria-label', STAGE_CALL_COPY.closeAsk);
  const closeAskInner = el(doc, 'div');
  closeAskInner.style.cssText = `display:grid;gap:7px;margin-top:10px;padding-top:10px;border-top:1px solid ${C.rule}`;
  const closeAskQuestion = el(doc, 'p', 'everyday-stage-call-confirm-question', STAGE_CALL_COPY.closeAsk);
  closeAskQuestion.style.cssText = 'margin:0;font-size:13.5px;font-weight:600';
  const closeAskConsequence = el(doc, 'p', undefined, STAGE_CALL_COPY.closeConsequence);
  closeAskConsequence.style.cssText = `margin:0;font-size:13px;line-height:1.45;color:${C.inkSoft}`;
  const closeAskRow = el(doc, 'div');
  closeAskRow.style.cssText = `display:flex;flex-wrap:wrap;gap:${String(GAP.row)}px`;
  const closeAskFile = el(doc, 'button', 'everyday-stage-call-confirm-file', STAGE_CALL_COPY.closeFile);
  closeAskFile.type = 'button';
  closeAskFile.style.cssText = ARM_BUTTON_CSS;
  const closeAskBack = el(doc, 'button', 'everyday-stage-call-confirm-back', STAGE_CALL_COPY.closeBack);
  closeAskBack.type = 'button';
  closeAskBack.style.cssText = ARM_BUTTON_CSS;
  closeAskFile.addEventListener('click', () => {
    fileDay();
  });
  closeAskBack.addEventListener('click', () => {
    closeAsk.hidden = true;
    callCard.focus({ preventScroll: true });
  });
  closeAskRow.append(closeAskFile, closeAskBack);
  closeAskInner.append(closeAskQuestion, closeAskConsequence, closeAskRow);
  closeAsk.append(closeAskInner);
  /*
   * **And so does the skip** — wave AN, lane AN-6, [§ D1324](../../../../DECISIONS.md), the post-AM
   * panel's seat D (D4). § D1151 made a press of *Skip to the end* with the card up the player's
   * answer, so one press ran a scored day out past a call that was due, where *Close the day* asks.
   * The same question, on the same footing as the close's: under the card's answers, focus on *Back
   * to the call*, and a second press of the skip, or *Skip to the end* here, skips as before.
   */
  const skipAsk = el(doc, 'div', 'everyday-stage-skip-confirm');
  skipAsk.hidden = true;
  skipAsk.setAttribute('role', 'group');
  skipAsk.setAttribute('aria-label', STAGE_CALL_COPY.skipAsk);
  const skipAskInner = el(doc, 'div');
  skipAskInner.style.cssText = closeAskInner.style.cssText;
  const skipAskQuestion = el(doc, 'p', 'everyday-stage-skip-confirm-question', STAGE_CALL_COPY.skipAsk);
  skipAskQuestion.style.cssText = closeAskQuestion.style.cssText;
  const skipAskConsequence = el(doc, 'p', undefined, STAGE_CALL_COPY.skipConsequence);
  skipAskConsequence.style.cssText = closeAskConsequence.style.cssText;
  const skipAskRow = el(doc, 'div');
  skipAskRow.style.cssText = closeAskRow.style.cssText;
  const skipAskGo = el(doc, 'button', 'everyday-stage-skip-confirm-go', STAGE_CALL_COPY.skipGo);
  skipAskGo.type = 'button';
  skipAskGo.style.cssText = ARM_BUTTON_CSS;
  const skipAskBack = el(doc, 'button', 'everyday-stage-skip-confirm-back', STAGE_CALL_COPY.closeBack);
  skipAskBack.type = 'button';
  skipAskBack.style.cssText = ARM_BUTTON_CSS;
  skipAskGo.addEventListener('click', () => {
    skipToEnd(true);
  });
  skipAskBack.addEventListener('click', () => {
    skipAsk.hidden = true;
    callCard.focus({ preventScroll: true });
  });
  skipAskRow.append(skipAskGo, skipAskBack);
  skipAskInner.append(skipAskQuestion, skipAskConsequence, skipAskRow);
  skipAsk.append(skipAskInner);
  callCard.append(callBody, closeAsk, skipAsk);
  /*
   * **The rush's end asks once** — wave AQ, lane AQ-3, the post-AP playtest. Drawn under the header
   * in a rush only, hidden by its attribute alone (layout on an inner row, for `callBody`'s reason).
   * Words: `rushScreenModel.ts#RUSH_END_ASK_COPY`.
   */
  const endAsk = el(doc, 'div', 'everyday-stage-end-confirm');
  endAsk.hidden = true;
  endAsk.setAttribute('role', 'group');
  endAsk.setAttribute('aria-label', RUSH_END_ASK_COPY.question);
  const endAskInner = el(doc, 'div');
  endAskInner.style.cssText = [
    'display:grid;gap:7px',
    `border:1.5px solid ${C.ink}`,
    `border-radius:${String(R.row)}px`,
    `background:${C.card}`,
    'padding:12px 14px',
  ].join(';');
  const endAskQuestion = el(doc, 'p', 'everyday-stage-end-confirm-question', RUSH_END_ASK_COPY.question);
  endAskQuestion.style.cssText = closeAskQuestion.style.cssText;
  const endAskConsequence = el(doc, 'p', undefined, RUSH_END_ASK_COPY.consequence);
  endAskConsequence.style.cssText = closeAskConsequence.style.cssText;
  const endAskRow = el(doc, 'div');
  endAskRow.style.cssText = closeAskRow.style.cssText;
  const endAskGo = el(doc, 'button', 'everyday-stage-end-confirm-go', RUSH_END_ASK_COPY.end);
  endAskGo.type = 'button';
  endAskGo.style.cssText = ARM_BUTTON_CSS + ';min-height:44px';
  const endAskBack = el(doc, 'button', 'everyday-stage-end-confirm-back', RUSH_END_ASK_COPY.keep);
  endAskBack.type = 'button';
  endAskBack.style.cssText = ARM_BUTTON_CSS + ';min-height:44px';
  /** Whether the stage was playing when the ask went up, so *Keep playing* plays on. */
  let endAskResume = false;
  endAskGo.addEventListener('click', () => {
    endRushNow();
  });
  endAskBack.addEventListener('click', () => {
    endAsk.hidden = true;
    if (endAskResume && playback !== undefined && playback.state !== 'playing') togglePlay();
    endAskResume = false;
    syncTransport();
  });
  endAskRow.append(endAskGo, endAskBack);
  endAskInner.append(endAskQuestion, endAskConsequence, endAskRow);
  endAsk.append(endAskInner);
  /** § 9.2's *End the rush*: stopped by hand, at the playhead, and straight to its own result. */
  function endRushNow(): void {
    endAsk.hidden = true;
    playback?.pause();
    host.endRush(playback?.simTimeS ?? adopted?.startedAt ?? 0);
    context.go('report');
  }
  let callCardKey = '';

  /*
   * **The lost day's card** — wave AO, lane DR-1, [§ D1435](../../../../DECISIONS.md), swarm DR's
   * ruling § Q4. Once a goal graded on a maximum reads past its bar at the playhead the stage stops
   * there once and puts this in the call card's place: *End the day* (focused) or *Watch the rest*,
   * which plays on under `stagePace.ts`'s `lost` line. Hidden by its attribute alone, with its
   * layout on an inner body, for `callBody`'s reason above. The stage never ends the day itself.
   */
  const lostCard = el(doc, 'div', 'everyday-stage-lost');
  lostCard.setAttribute('role', 'group');
  lostCard.setAttribute('aria-label', STAGE_LOST_COPY.heading);
  lostCard.tabIndex = -1;
  lostCard.hidden = true;
  lostCard.style.cssText = callCard.style.cssText;
  const lostBody = el(doc, 'div', 'everyday-stage-lost-body');
  lostBody.style.cssText = 'display:grid;gap:7px';
  const lostHeading = el(doc, 'div', 'everyday-stage-lost-heading', STAGE_LOST_COPY.heading);
  lostHeading.style.cssText = `font:600 11px ${TYPE.mono};letter-spacing:0.08em;color:${C.label}`;
  const lostFact = el(doc, 'p', 'everyday-stage-lost-fact');
  lostFact.style.cssText = 'margin:0;font-size:13.5px;line-height:1.45;font-weight:600';
  const lostChoices = el(doc, 'p', 'everyday-stage-lost-choices', STAGE_LOST_COPY.choices);
  lostChoices.style.cssText = `margin:0;font-size:13px;line-height:1.45;color:${C.inkSoft}`;
  const lostRow = el(doc, 'div');
  lostRow.style.cssText = `display:flex;flex-wrap:wrap;gap:${String(GAP.row)}px`;
  const lostEnd = el(doc, 'button', 'everyday-stage-lost-end', STAGE_LOST_COPY.end);
  lostEnd.type = 'button';
  lostEnd.style.cssText = `${ARM_BUTTON_CSS};background:${C.ink};color:${C.card};border-color:${C.ink}`;
  const lostWatch = el(doc, 'button', 'everyday-stage-lost-watch', STAGE_LOST_COPY.watch);
  lostWatch.type = 'button';
  lostWatch.style.cssText = ARM_BUTTON_CSS;
  lostEnd.addEventListener('click', () => {
    lostCard.hidden = true;
    endTheDay();
  });
  lostWatch.addEventListener('click', () => {
    lostCard.hidden = true;
    if (playback === undefined) return;
    started = true;
    playback.play();
    syncTransport();
    requestFrame();
  });
  lostRow.append(lostEnd, lostWatch);
  lostBody.append(lostHeading, lostFact, lostRow, lostChoices);
  lostCard.append(lostBody);
  /** Where the stage first read the adopted run lost, and whether its card has stopped the stage yet. */
  let lostAtS: number | undefined;
  let lostCardShown = false;
  /**
   * The furthest instant the stage has read the day not lost at, on the run it is playing: the
   * previous frame's playhead, so each frame reads the stretch since it (§ D1446). `undefined`
   * before the first read and after a fresh adoption.
   */
  let lostReadToS: number | undefined;
  /** {@link worstWaitLossBeginsOf} on the adopted run, worked out once per recording. */
  let lostBegins: { readonly recording: VizRecording; readonly atS: readonly number[] } | undefined;

  function lostBeginsOn(recording: VizRecording): readonly number[] {
    if (lostBegins?.recording === recording) return lostBegins.atS;
    const bar = host
      .goalsAt(recording.startedAt)
      .find((reading) => DAY_CALL_FINAL_GOAL_IDS.includes(reading.goal.id) && reading.goal.reads === 'worstWaitS')?.goal.bar;
    lostBegins = { recording, atS: bar === undefined ? [] : worstWaitLossBeginsOf(recording.legs, bar) };
    return lostBegins.atS;
  }

  /**
   * **Where in `(fromS, toS]` the stage should stop on the lost day's card**, or `undefined`: wave
   * AP, lane AP-D1, [§ D1446](../../../../DECISIONS.md), the post-AO panel's seat D (D1). Only on the
   * player's own scored day, once per attempt, never over a call's card or a pinned call still
   * standing (§ D1435), and never at the day's last instant, which the bar already says has run out.
   */
  function lostStopIn(recording: VizRecording, fromS: number, toS: number): number | undefined {
    if (lostCardShown || context.ctx !== 'daily' || watchingNow() !== undefined) return undefined;
    if (activeCall()?.pinned === true || !callCard.hidden) return undefined;
    const atS = firstLostInstantOf(
      (at) => stageLostCardOf(host.goalsAt(at), '') !== undefined,
      fromS,
      Math.min(toS, recording.endedAt),
      lostBeginsOn(recording),
    );
    return atS === undefined || atS >= recording.endedAt ? undefined : atS;
  }

  /**
   * **Stop on the lost day's card at `atS`**: § D1435's stop, put on the instant the day was lost
   * (§ D1446) as § D1153 puts the stage on a call's second. The playhead goes back to it, so the
   * clock, the header and the card's fact describe one instant. Whatever was carrying the stage on
   * (a skip, a wait at a call that has not been raised) ends here, because a lost day asks no call
   * and the stage never ends the day for the player.
   */
  function stopOnLoss(atS: number): void {
    if (playback === undefined) return;
    const view = stageLostCardOf(host.goalsAt(atS), clockAt(atS, host.dayStartS()));
    if (view === undefined) return;
    lostAtS = atS;
    lostCardShown = true;
    lostReadToS = atS;
    playback.pause();
    if (playback.simTimeS !== atS) playback.seekTo(atS);
    dropSkipBeat();
    skipping = false;
    waitingOnCall = false;
    if (skipLine !== '') {
      skipLine = '';
      skipLineReason = undefined;
      showStatus();
    }
    lostFact.textContent = view.fact;
    lostCard.hidden = false;
    lostCard.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    lostEnd.focus({ preventScroll: true });
    syncTransport();
    requestFrame();
  }

  /**
   * § D1435: the first instant of the player's own scored day at which a goal graded on a maximum
   * reads past its bar stops the stage once, on the card, focusing *End the day*. A pinned day's call
   * still standing is answered first (§ D1168 clause 2); a card is never drawn over a call's. Once
   * the transport plays again the card goes.
   *
   * **The stretch since the last frame, read at the playhead the frame ends on**: wave AP, lane
   * AP-D1, [§ D1446](../../../../DECISIONS.md), the post-AO panel's seat D (D1). It read one
   * instant, the frame's, and read it before the frame's own stops. A frame at `600×` that crossed a
   * call and then the loss latched the card at an instant past the call, the stage went back to the
   * call, and after the answer the card was spent, so the rest played under the `lost` line with no
   * card; and a frame could step over the few seconds a worst-wait miss reads before the next long
   * waiter censors it.
   */
  function drawLost(recording: VizRecording): void {
    if (playback === undefined) return;
    if (!lostCard.hidden && playback.state === 'playing') lostCard.hidden = true;
    if (lostCardShown) return;
    const toS = Math.min(playback.simTimeS, recording.endedAt);
    const fromS = lostReadToS !== undefined && lostReadToS < toS ? lostReadToS : toS;
    const atS = lostStopIn(recording, fromS, toS);
    /* Never moved back by a frame drawn before a skip's seek lands: what is marked read stays read. */
    lostReadToS = Math.max(lostReadToS ?? toS, toS);
    if (atS !== undefined) stopOnLoss(atS);
  }
  /**
   * Show or hide the card — and, **on the frame it appears and on no other**, bring it into the
   * screen region's view and put focus on it.
   *
   * `drawCall` runs on every paint, and `AX-12`'s second half is *never because of the render
   * loop*: a focus written per frame would pull the keyboard back to the card every sixteen
   * milliseconds and would steal it from anything the player moved to. So the move is keyed on the
   * transition from hidden to shown, which is the stage stopping for the call — an event in the
   * run, once per attempt — and a card already up is left alone. `nearest` rather than `start`,
   * because the card sits directly under the header and is already in view at a desktop height;
   * at a phone height it scrolls the region only as far as the card needs.
   *
   * After an answer the card leaves the document flow, and focus would fall to the body; it goes to
   * the transport instead, which is what the answer set moving.
   */
  /**
   * **A card taller than the screen region scrolls inside itself** — wave AO, joined at integration.
   * Lane P2-1's answer lines (§ D1432) made the card about 450 px tall, and at 390×844 the screen
   * region shows about 336, so `nearest` could bring only its foot into view and the question sat
   * above the region. The card keeps its height where it fits; where it does not, it is capped at the
   * region's own height and scrolls, so the question, the focus and every answer stay in the region.
   */
  function fitCallCardToRegion(): void {
    callCard.style.maxHeight = '';
    callCard.style.overflowY = '';
    const region = callCard.closest<HTMLElement>('.everyday-screen');
    if (region === null) return;
    /* § D1527: under a pinned header the card has the region less the header. */
    const room = region.clientHeight - 16 - (headerSticks ? header.offsetHeight : 0);
    if (room > 0 && callCard.offsetHeight > room) {
      callCard.style.maxHeight = `${String(room)}px`;
      callCard.style.overflowY = 'auto';
    }
  }
  function showCallCard(shown: boolean): void {
    const appearing = shown && callCard.hidden;
    const leaving = !shown && !callCard.hidden;
    const hadFocus = leaving && callCard.contains(doc.activeElement);
    callCard.hidden = !shown;
    /* The close's question belongs to the call it would skip, and goes with it; so does the skip's. */
    if (!shown) {
      closeAsk.hidden = true;
      skipAsk.hidden = true;
    }
    if (appearing) {
      /*
       * Wave AR, lane AR-2, § D1531: the live region still held the last sentence said while the
       * stage moved (*0 legs waiting* at 09:46, before the skip that landed on the 10:40 call) beside a
       * card saying *2 people are standing*. It is emptied as the card appears, which is a clearing
       * and not an announcement, so the two-second limit is not stamped by it; the call's own frame is
       * said by `announce` when the limit lifts.
       */
      if (description.textContent !== '') description.textContent = '';
      fitCallCardToRegion();
      callCard.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      callCard.focus({ preventScroll: true });
    } else if (hadFocus) {
      playButton.focus({ preventScroll: true });
    }
  }

  /*
   * **Each answered call's row, once its window can be observed** — wave AL, lane AL-E,
   * [§ D1219](../../../../DECISIONS.md), from the call plus 660 s; since wave AP's lane DT-2 a row
   * that reads goals leads with its first crossing and prints no count, and the caveat is said once
   * above the rows. The words and the timing are `everyday/stageCallRow.ts`'s, and this decides only
   * where they go. Hidden by its attribute alone, with the layout on an inner body, for
   * `callBody`'s reason above.
   */
  const callRows = el(doc, 'section', 'everyday-stage-call-rows');
  callRows.hidden = true;
  callRows.setAttribute('aria-label', STAGE_CALL_ROWS_HEADING);
  callRows.style.cssText = [
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.row)}px`,
    `background:${C.card}`,
    'padding:10px 14px',
  ].join(';');
  let callRowsKey = '';
  /** Redraw the rows when the set due at the playhead changes, and at no other frame. */
  function drawCallRows(recording: VizRecording, simTimeS: number): void {
    const rows =
      dayCallsAskedIn(context.ctx) && watchingNow() === undefined ? host.dayCallRowsAt(recording, simTimeS) : [];
    const caveat = stageCallRowsCaveatOf(rows);
    const key = [caveat ?? '', ...rows.map((row) => `${row.id}|${row.lead ?? ''}|${row.goals ?? ''}|${row.counts ?? ''}|${row.note ?? ''}`)].join('\n');
    if (key === callRowsKey) return;
    callRowsKey = key;
    callRows.replaceChildren();
    callRows.hidden = rows.length === 0;
    if (rows.length === 0) return;
    const body = el(doc, 'div', 'everyday-stage-call-rows-body');
    body.style.cssText = 'display:grid;gap:8px';
    const heading = el(doc, 'div', 'everyday-stage-call-rows-heading', STAGE_CALL_ROWS_HEADING);
    heading.style.cssText = `font-size:10.5px;letter-spacing:0.08em;color:${C.label}`;
    body.append(heading);
    /* Wave AP, lane DT-2: the caveat once, under the heading, rather than under every row. */
    if (caveat !== undefined) {
      const said = el(doc, 'p', 'everyday-stage-call-rows-caveat', caveat);
      said.style.cssText = `margin:0;font-size:12px;line-height:1.45;color:${C.inkSoft}`;
      body.append(said);
    }
    for (const row of rows) {
      const item = el(doc, 'div', 'everyday-stage-call-row');
      item.dataset['row'] = row.id;
      item.style.cssText = 'display:grid;gap:3px';
      const title = el(doc, 'p', 'everyday-stage-call-row-heading', row.heading);
      title.style.cssText = 'margin:0;font-size:13px;font-weight:600';
      item.append(title);
      /* DT-2: the first crossing leads, then each answer's goals so far, the answer taken first. */
      if (row.lead !== undefined) {
        const lead = el(doc, 'p', 'everyday-stage-call-row-lead', row.lead);
        lead.style.cssText = 'margin:0;font-size:13px;line-height:1.45;font-weight:600';
        item.append(lead);
      }
      if (row.goals !== undefined) {
        const goalsLine = el(doc, 'p', 'everyday-stage-call-row-goals', row.goals);
        goalsLine.style.cssText = 'margin:0;font-size:13px;line-height:1.45';
        item.append(goalsLine);
      }
      /* A counts-only row (a record written before the readings), and a failed or quiet row's sentence. */
      if (row.counts !== undefined) {
        const counts = el(doc, 'p', 'everyday-stage-call-row-counts', row.counts);
        counts.style.cssText = 'margin:0;font-size:13px;line-height:1.45';
        item.append(counts);
      }
      if (row.note !== undefined) {
        const note = el(doc, 'p', 'everyday-stage-call-row-note', row.note);
        note.style.cssText = `margin:0;font-size:12px;line-height:1.45;color:${C.inkSoft}`;
        item.append(note);
      }
      body.append(item);
    }
    callRows.append(body);
  }

  /*
   * **The call card sits under the header and above the goals** — the post-AI playability panel,
   * all four seats. It was appended after the building and its legend, which put it at y ≈ 1 060
   * on a 900 px viewport and y ≈ 1 320 on a 844 px phone while the only sign above the fold was the
   * transport's small grey *stopped for the day's call*. Here it is the next thing under the clock
   * that stopped, which is where the eye already is. Hidden, it has no box, so every other screen
   * state lays out exactly as it did.
   */
  root.append(
    title,
    header,
    callCard,
    lostCard,
    callRows,
    goals,
    watchBand,
    alarm,
    alarmSay,
    stageRow,
    legend,
    interventions,
    race,
  );
  /*
   * **In a rush the choice chips sit under the header** — wave AQ, lane AQ-3, the post-AP playtest:
   * under the building they were below the fixed footer at 1280×600 and below the fold on a 390×844
   * phone, so the rush's only choices were out of reach while the climb ran. A rush has no call card,
   * goals or race to keep above them. Every other context keeps its order. Recorded here under
   * [§ D405](../../../../DECISIONS.md).
   */
  if (context.ctx === 'rush') {
    root.insertBefore(interventions, header.nextSibling);
    root.insertBefore(endAsk, header.nextSibling);
    /*
     * **And the chips' notes go under the building** — wave AR, lane AR-1 (GitHub issue #633): on a
     * 390×844 phone the header and the chips with their three notes filled the screen, so the
     * building sat below the fold until *Play* scrolled it up and the chips off. Without the notes
     * the chips are four short rows, and the stage starts on the first screen; *Play*'s scroll to the
     * lobby rows (§ D1508) then leaves the chips in view. The notes keep their ids, so the picker's
     * `aria-describedby` still names its note. Rush only. Recorded under [§ D405](../../../../DECISIONS.md).
     */
    const rushNotes = el(doc, 'div', 'everyday-stage-rush-notes');
    rushNotes.style.cssText = `display:flex;flex-wrap:wrap;gap:${String(GAP.row)}px`;
    rushNotes.append(switchPickerNote, interventionNote, parkingNote);
    root.insertBefore(rushNotes, stageRow.nextSibling);
  }
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
    if (bringBuildingPending) {
      bringBuildingPending = false;
      bringBuildingIntoView();
    }
    draw();
    if (playback?.state === 'playing') requestFrame();
    else syncTransport();
  }

  function togglePlay(): void {
    if (playback === undefined) return;
    /* § D1361: a day another tab holds is shown here no further. */
    if (heldAtS !== undefined) return;
    /* Wave AS, lane AS-1: the round is over and the stage is only showing where. */
    if (rushLossLine !== undefined) return;
    if (playback.state === 'playing') {
      playback.pause();
      /* § D1212: a pause stops a skip that is coming; *Play* starts a fresh beat. */
      dropSkipBeat();
    } else {
      /*
       * Lane AO-4: the button is held while the stage works out a call; a key press is held with it.
       * **But the press is kept**: wave AP, lane AP-D1, [§ D1447](../../../../DECISIONS.md), the
       * post-AO panel's seats D (D2) and A (defect 4). A call can stand at the day's first instant
       * (a wrinkle that begins as the day does, the lift-service Wednesday's car C from 08:00), so
       * § 7.3's *Start* was pressed while the stage worked it out and was swallowed: the day had not
       * started, nothing waited on the call, and once its runs landed unraised the stage sat at
       * 08:00. The press now marks the day started and waiting, so it plays on, or stops on the card,
       * when the runs land, exactly as a stage that met the call while playing does.
       */
      if (waitingAtCall()) {
        started = true;
        waitingOnCall = true;
        syncTransport();
        return;
      }
      started = true;
      /*
       * The one place a player gesture reaches the sound — GitHub issue #258. A browser suspends
       * an `AudioContext` built outside a gesture, so Play is where it is let out; a stage that
       * never gets pressed makes no noise, which is also the honest answer.
       */
      audioSink?.wake();
      playback.play();
      bringBuildingPending = true;
    }
    syncTransport();
    requestFrame();
  }

  /** Whether the header is pinned at the top of the page now — {@link syncHeaderStick}. */
  let headerSticks = false;

  /**
   * **The loss, held on the building** — wave AS, lane AS-1 (GitHub issue #635, finding 5). When the
   * round crosses the hold line the stage stops on that instant and says so for
   * `rush.ts#RUSH_LOSS_HOLD_MS` before the result, which used to cut in within the same frame. The
   * round is recorded as ended at once, so leaving during the hold loses nothing.
   */
  let rushLossLine: string | undefined;
  let rushLossTimer: number | undefined;
  function goToRushResult(): void {
    if (rushLossTimer !== undefined) view?.clearTimeout(rushLossTimer);
    rushLossTimer = undefined;
    if (alive) context.go('report');
  }

  /** Whether the rush's compact phone row is up — {@link syncRushCompact}, `rush.ts#rushCompactHudOf`. */
  let rushCompact = false;
  /** What a folded element's inline `display` was, so unfolding puts back exactly that. */
  const foldedDisplay = new Map<HTMLElement, string>();
  function fold(node: HTMLElement, on: boolean): void {
    if (on) {
      if (!foldedDisplay.has(node)) foldedDisplay.set(node, node.style.display);
      node.style.display = 'none';
      return;
    }
    const was = foldedDisplay.get(node);
    if (was === undefined) return;
    foldedDisplay.delete(node);
    node.style.display = was;
  }

  /**
   * **The rush's compact phone row** — wave AS, lane AS-1, `rush.ts#rushCompactHudOf` says when and
   * why. Asked on every transport change and on a resize. While it is up, the header shows the clock,
   * the wave, the count past two minutes and *Pause*, pinned, and the building is sized to the room
   * left under the header and the chips, so the lobby rows stay on the same screen.
   */
  function syncRushCompact(): void {
    if (context.ctx !== 'rush') return;
    const compact = rushCompactHudOf({ regionWidth: region.clientWidth, playing: playback?.state === 'playing' });
    /* Every time, not on the edge: the transport rewrites the chips' whole style on each change. */
    for (const node of [driving, cameras, floorJump, skipButton, ...speedButtons, switchPicker, switchButton, switchPickerNote, interventionRefusal, interventionNote]) {
      fold(node, compact);
    }
    if (compact !== rushCompact) {
      rushCompact = compact;
      header.style.padding = compact ? '6px 12px' : '10px 14px';
      syncHeaderStick();
      requestFrame();
    }
    fitRushCanvas();
  }

  /** The canvas's height in the compact row: the room under the pinned header and the chips, never taller than the usual 60vh. */
  function fitRushCanvas(): void {
    if (!rushCompact) {
      if (canvas.style.height !== STAGE_CANVAS_HEIGHT) canvas.style.height = STAGE_CANVAS_HEIGHT;
      return;
    }
    const viewportBottom = view?.innerHeight ?? doc.documentElement.clientHeight;
    const shown = region.getBoundingClientRect();
    const bar = doc.querySelector<HTMLElement>('.everyday-bar')?.getBoundingClientRect();
    const bottom = Math.min(viewportBottom, shown.bottom, bar !== undefined && bar.height > 0 ? bar.top : Number.POSITIVE_INFINITY);
    const top = Math.max(0, shown.top);
    const above = header.offsetHeight + interventions.offsetHeight + (endAsk.hidden ? 0 : endAsk.offsetHeight) + 2 * GAP.block;
    const chrome = stageWrap.offsetHeight - canvas.offsetHeight + 2;
    const room = Math.floor(bottom - top - above - chrome);
    const usual = 0.6 * viewportBottom;
    const height = `${String(Math.max(RUSH_COMPACT_MIN_CANVAS_PX, Math.min(usual, room)))}px`;
    if (canvas.style.height !== height) canvas.style.height = height;
  }

  /**
   * **Pin the header while the building scrolls under it** — wave AR, lane AR-2,
   * [§ D1527](../../../../DECISIONS.md), `stageScreenModel.ts#stageHeaderSticksOf`. Asked when the day
   * starts playing and on a resize, never per frame, because it reads the header's laid-out height.
   * The cards that scroll themselves into view keep a top margin of the header's height, so a pinned
   * header never covers the call it stopped for.
   */
  function syncHeaderStick(): void {
    const sticks =
      rushCompact ||
      stageHeaderSticksOf({
        headerHeight: header.offsetHeight,
        regionHeight: region.clientHeight,
        rush: context.ctx === 'rush',
      });
    headerSticks = sticks;
    header.style.position = sticks ? 'sticky' : '';
    header.style.top = sticks ? '0' : '';
    header.style.zIndex = sticks ? '3' : '';
    const margin = sticks ? `${String(header.offsetHeight + GAP.block)}px` : '';
    for (const card of [callCard, lostCard, closeAsk, skipAsk]) card.style.scrollMarginTop = margin;
  }

  /**
   * **Keep the building in view while the day plays** — wave AO, lane AO-4, the post-AN panel's seat
   * B (lost moment 9, defect 9), [§ D1385](../../../../DECISIONS.md) clause 4. Asked when a press sets the day playing: on a phone the header's
   * *▶ Play* sits above the goals, and the canvas under them was below the fixed bar for the whole of
   * the day it started. `stageScreenModel.ts#stageBuildingScrollOf` decides: since wave AQ
   * ([§ D1508](../../../../DECISIONS.md)) it keeps the canvas's bottom, the lobby rows, in view, and a
   * stage whose lobby already shows is not scrolled under the reader.
   *
   * **On the next frame, never inside the press** ({@link bringBuildingPending}): the shell keeps the
   * region's offset across the first re-render after a player's press (`shell.ts#keepScrollAcrossRerender`),
   * so a scroll made in the press is put back by the press's own button-text change. The call
   * card's scroll is made from a frame for the same reason.
   */
  function bringBuildingIntoView(): void {
    syncHeaderStick();
    /* Wave AS, lane AS-1: the compact row fits header, chips and building together; start at the header. */
    if (rushCompact) {
      fitRushCanvas();
      const at = root.getBoundingClientRect().top - region.getBoundingClientRect().top;
      if (Math.abs(at) >= 1) region.scrollTop += at;
      return;
    }
    const box = canvas.getBoundingClientRect();
    const shown = region.getBoundingClientRect();
    const viewportBottom = view?.innerHeight ?? doc.documentElement.clientHeight;
    const seen = { top: Math.max(0, shown.top), bottom: Math.min(viewportBottom, shown.bottom) };
    /* § D1527: a pinned header covers the top of what the player can see. */
    if (headerSticks) seen.top = Math.max(seen.top, shown.top + header.offsetHeight);
    /* Wave AQ, lane AQ-2 (§ D1508): the lobby rows, where the day's deepest queue usually stands. */
    const by = stageBuildingScrollOf(box, seen);
    if (by !== 0) region.scrollTop += by;
  }

  function setSpeed(index: number): void {
    speedIndex = index;
    /*
     * § D991: a chip press is the player's — until the next act boundary since § D1029, which is
     * `stagePace.ts#chipStands`'s rule; the stage paces again from there.
     */
    /*
     * § D1169: on a scored day a chip pressed while somebody has waited a minute is the rung the
     * stage keeps for every such stretch, and nothing more; pressed while it is fast, it stands until
     * somebody next waits a minute.
     */
    playerChoseSpeedAtS = paceScored && lastPaceReason === 'watching' ? undefined : (playback?.simTimeS ?? 0);
    /* § D1493: a chip press is a decision; pressed while the stage played on, it stands to the next call. */
    paceCounters = { ...paceCounters, watchedRealS: 0 };
    if (lastPaceReason === 'unheld') watchAllowanceOff = true;
    /* Lane AO-4: a chip press is a state of the player's making, so a skip's line from before it is over. */
    if (skipLine !== '') {
      skipLine = '';
      skipLineReason = undefined;
      showStatus();
    }
    playback?.setSpeed(stageSpeedAt(index).simPerRealS);
    syncTransport();
    requestFrame();
  }

  /**
   * **Pace a whole day** — GitHub issue #592, [§ D991](../../../../DECISIONS.md).
   *
   * Asked once a frame, from {@link draw}, with the present frame's longest wait and nothing
   * later. The rule is `everyday/stagePace.ts#stagePaceOf`'s; this moves the transport only when
   * the answer changes, because `Playback.setSpeed` re-anchors and a re-anchor on every frame
   * would be sixty for nothing. The note is written on change for the same reason.
   *
   * It touches the transport's speed and nothing else — never the playhead (`docs/28` AD-S4) — so a
   * day played this way is the same recording, the same legs and the same report.
   */
  function pace(simTimeS: number, longestStandingS: number | undefined): void {
    if (playback === undefined) return;
    /*
     * **Only while the transport is playing.** The stage opens paused at `startedAt` on the player's
     * own rung — § 4.6's *the day opens at the player's default speed*, which two browser cases
     * hold — and pacing begins with the first *Start*, *Play* or skip. A paused transport is not
     * moving, so nothing is re-paced under it: the chip and the note keep what they last said, and
     * on a day nobody has started that is the rung the player set and no note at all.
     */
    if (playback.state !== 'playing') {
      /* § D1493: a paused transport watches nothing, and a seek made while paused is not watching. */
      watchedFrame = undefined;
      /* § D1212: whatever stopped the transport stopped a skip that was coming. */
      dropSkipBeat();
      /*
       * **At the day's end nothing is being paced** — § D1239, the post-AL panel's seats B and D:
       * *stopped for the day's call* and *fast-forwarding at 30×* stood under an 18:00 clock after a
       * skip had run the day out. The bar says the day has run out; the note says nothing more.
       */
      if (playback.simTimeS >= playback.recording.endedAt && (paceText !== '' || skipLine !== '')) {
        /* Wave AO, lane AO-4: and nor does a skip's line — the day's end is one state, said by the bar. */
        skipLine = '';
        skipLineReason = undefined;
        setPace('', false);
      }
      /* A stop the stage is waiting at says so, on a resumed attempt too (lane AO-4). */
      syncWaitingNote();
      return;
    }
    if (watchedFrame !== undefined) {
      paceCounters = paceCountersAfter(paceCounters, {
        pace: watchedFrame.pace,
        fromS: watchedFrame.atS,
        toS: simTimeS,
        simPerRealS: watchedFrame.simPerRealS,
      });
    }
    const paced = stagePaceOf({
      horizon: paceHorizon,
      acts: paceActs,
      simTimeS,
      watchingSimPerRealS: stageSpeedAt(speedIndex).simPerRealS,
      longestStandingS,
      playerChoseSpeedAtS,
      callAtS: activeCall()?.call.atS,
      scored: paceScored,
      lostAtS,
      watchedRealS: watchAllowanceOff ? undefined : paceCounters.watchedRealS,
      lingerRealS: paceCounters.lingerRealS,
    });
    /* Wave AS, lane AS-1: a rush's first wave plays fast unless a speed was pressed (`rush.ts#rushOpeningPaceOf`). */
    const rushOpening =
      context.ctx === 'rush'
        ? rushOpeningPaceOf({
            heldS: simTimeS - playback.recording.startedAt,
            watchingSimPerRealS: stageSpeedAt(speedIndex).simPerRealS,
            playerChoseSpeed: playerChoseSpeedAtS !== undefined,
          })
        : undefined;
    const answer: StagePace = rushOpening === undefined ? paced : { simPerRealS: rushOpening.simPerRealS, reason: 'unmanaged' };
    lastPaceReason = answer.reason;
    watchedFrame = { atS: simTimeS, simPerRealS: answer.simPerRealS, pace: answer };
    /* § D1493: a call raised, or waited at, or answered, is a decision, and the allowance starts again. */
    if (answer.reason === 'call') {
      paceCounters = FRESH_PACE_COUNTERS;
      watchAllowanceOff = false;
    }
    /* § D1169: a chip pressed while fast stands until somebody next waits a minute, and not past it. */
    if (answer.reason === 'watching') playerChoseSpeedAtS = undefined;
    /*
     * § D1138: an ordinary call whose two runs have not landed stops the transport too, and says
     * what it is waiting for rather than *stopped for the day's call* — the call may not be raised.
     */
    const waiting = answer.reason === 'call' && activeCall()?.raised === false;
    const note = waiting
      ? STAGE_CALL_COPY.waiting
      : (rushOpening?.note ?? stagePaceNoteOf(answer, { acts: paceActs, simTimeS, dayStartS: host.dayStartS() }) ?? '');
    /*
     * Wave AO, lane AO-4 — one message for one state (`stagePace.ts#stageStatusOf`): the line a skip
     * left stands while the stage stays where it landed, and goes the frame it leaves (or a call
     * stops it); the pace note is drawn only where neither a stop nor a skip is speaking.
     */
    if (skipLine !== '') {
      /* § D1525: past the allowance a waiter crossing the minute does not end the state the line names. */
      const state = stagePaceStateOf(answer);
      if (!stageSkipLineStands({ landedReason: skipLineReason, reason: state })) {
        skipLine = '';
        skipLineReason = undefined;
      } else if (skipLineReason === undefined) {
        skipLineReason = state;
      }
    }
    setPace(note, answer.reason === 'call');
    if (answer.reason === 'call') waitingOnCall = waiting;
    /*
     * **The call stops the transport** — § D1029. At any rung, and after a chip press, because the
     * `'call'` reason outranks `'chosen'`. It pauses and never seeks (`docs/28` AD-S4): the frame it
     * stops on may be a few simulated seconds past the call at a fast rung, and the answer is
     * stamped at the call second whatever the frame, inside a window the pin was admitted on.
     */
    if (answer.reason === 'call') {
      playback.pause();
      dropSkipBeat();
      /*
       * **And the frame it stops on is the call's** — [§ D1153](../../../../DECISIONS.md), the post-AJ
       * panel's seat D (H10). At a fast rung the frame the pause lands on is a few simulated seconds
       * past the call, while the answer is stamped at the call second: the header read *12
       * standing* on the stopped frame and the report's press row *11 standing* at the stamp, both
       * right, one instant apart. The playhead is put back on the call second, so the clock, the
       * header, the strip and the card describe the instant the press is filed at. It moves the
       * playhead within the stop and nothing else: where the stage stops and at what speed it runs
       * are unchanged.
       */
      const callAtS = activeCall()?.call.atS;
      if (callAtS !== undefined && playback.simTimeS > callAtS) {
        playback.seekTo(callAtS);
        requestFrame();
      }
      syncTransport();
      return;
    }
    if (playback.speed !== answer.simPerRealS) {
      playback.setSpeed(answer.simPerRealS);
      syncTransport();
    }
    skipBetweenPeaks(simTimeS, answer.reason);
  }

  /**
   * **Skip the quiet of a scored whole day** — [§ D1212](../../../../DECISIONS.md), which skipped
   * between its peaks, widened by [§ D1266](../../../../DECISIONS.md) to anywhere in the day;
   * `everyday/stagePace.ts#stageSkipOf`'s rule.
   *
   * Asked from {@link pace} on every playing frame. Where the rule applies, the first frame starts
   * a beat and writes its note; once the beat is over the playhead is moved to the instant the rule
   * reads off the recording, and the line says what was passed over. Anything that ends the stretch
   * first (somebody waits a minute, a chip is pressed, the stage stops for a call, a re-simulation
   * begins) drops the beat, and a pause drops it too because `pace` is not asked while paused.
   *
   * It moves the playhead and nothing else, as *Skip to the end* does: the recording was made whole
   * before the stage drew a frame, so the report, the goals and every figure read the same run.
   */
  function skipBetweenPeaks(simTimeS: number, reason: StagePaceReason): void {
    const recording = adopted;
    if (playback === undefined || recording === undefined) return;
    const applies =
      recomputingOver === undefined &&
      !skipping &&
      !(skipLandedAtS !== undefined && Math.abs(simTimeS - skipLandedAtS) < 1) &&
      stageSkipApplies({ horizon: paceHorizon, scored: paceScored, acts: paceActs, simTimeS, reason });
    if (!applies) {
      dropSkipBeat();
      return;
    }
    if (skipArmedAtS === undefined || simTimeS < skipArmedAtS) {
      skipArmedAtS = simTimeS;
      showStatus();
      return;
    }
    const skip = stageSkipOf({
      acts: paceActs,
      legs: recording.legs,
      simTimeS,
      armedAtS: skipArmedAtS,
      simPerRealS: playback.speed,
      stopAtS: activeCall()?.call.atS,
      /* § D1266: after the last peak the skip may land on the day's end. */
      endedAt: recording.endedAt,
    });
    if (skip === undefined) return;
    skipArmedAtS = undefined;
    skipLandedAtS = skip.toS;
    skipLine = stageSkipLineOf(skip, host.dayStartS());
    skipLineReason = undefined;
    showStatus();
    playback.seekTo(skip.toS);
    syncTransport();
    requestFrame();
  }

  /** A beat that will not end in a skip: the note goes back to the last skip's line, or to nothing. */
  function dropSkipBeat(): void {
    if (skipArmedAtS === undefined) return;
    skipArmedAtS = undefined;
    showStatus();
  }

  /**
   * **The one writer of the transport's two lines** — wave AO, lane AO-4, the post-AN panel's seat B
   * (lost moment 5): `stagePace.ts#stageStatusOf` decides which of them speaks, so the two can never
   * run together.
   */
  function showStatus(): void {
    const lines = stageStatusOf({
      pace: paceText,
      stopped: paceStopped,
      skip: stageSkipSpeechOf({ armedRealS: beatArmedRealS(), pace: watchedFrame?.pace, line: skipLine }),
    });
    if (paceNote.textContent !== lines.pace) paceNote.textContent = lines.pace;
    if (skipNote.textContent !== lines.skip) skipNote.textContent = lines.skip;
  }

  /** Real seconds the coming skip's beat has run, read off the transport, or `undefined` with none coming. */
  function beatArmedRealS(): number | undefined {
    if (skipArmedAtS === undefined || playback === undefined || !(playback.speed > 0)) return undefined;
    return Math.max(0, (playback.simTimeS - skipArmedAtS) / playback.speed);
  }

  /** What the pace rule, or a call's stop, says now. */
  function setPace(text: string, stopped: boolean): void {
    paceText = text;
    paceStopped = stopped;
    showStatus();
  }

  /**
   * **Whether the stage is stopped at a call whose runs have not landed** — wave AO, lane AO-4, the
   * post-AN panel's seat B (lost moments 6 and 7). True while the transport is paused, short of the
   * day's end, with an ordinary candidate standing at or before the playhead and not yet raised:
   * the pace stopped there (§ D1138), or a resumed attempt reopened there (§ D1218). The transport's
   * button says so and cannot be pressed ({@link syncTransport}), and the note says what the stage
   * is doing ({@link syncWaitingNote}).
   */
  function waitingAtCall(): boolean {
    if (playback === undefined || playback.state === 'playing') return false;
    if (playback.simTimeS >= playback.recording.endedAt) return false;
    const standing = activeCall();
    if (standing === undefined || standing.call.atS > playback.simTimeS) return false;
    /*
     * Raised but not yet drawn is still waiting: the host's notification reaches the transport a
     * frame before the card is drawn, and *Play* offered in that frame would be the same false offer.
     */
    return !standing.raised || callCard.hidden !== false;
  }

  /**
   * The paused stage's note while it waits at a call, and back to nothing once it no longer does —
   * a resumed attempt reopens paused at the instant it was left, where the pace (which is asked only
   * while playing) would say nothing at all. A stop the pace made itself is left to the pace.
   */
  function syncWaitingNote(): void {
    if (playback === undefined || playback.state === 'playing') return;
    const waiting = waitingAtCall();
    if (waiting && paceText !== STAGE_CALL_COPY.waiting && callCard.hidden) {
      setPace(STAGE_CALL_COPY.waiting, true);
    } else if (!waiting && !waitingOnCall && paceText === STAGE_CALL_COPY.waiting) {
      setPace('', false);
    }
  }

  /**
   * **Say the picture** — GitHub issue **#239**'s second criterion, `UX.md` `KB-13`.
   *
   * Two writes with two different cadences, and the split is the whole of it.
   *
   * The **label** goes on every frame. It is not read aloud on write — a screen reader speaks a
   * canvas's accessible name when the player moves to it — so keeping it current costs one string
   * per frame and means a reader who arrives mid-day is told what is on screen *now* rather than
   * what was on it when the day started.
   *
   * The **region** is rate-limited by {@link STAGE_ANNOUNCE_MS}, because `aria-live` re-reads on
   * every write. That is the mistake this function exists to not make: a polite region rewritten on
   * every frame is a reader talking over the player for the whole day, which is worse than silence
   * because it cannot be interrupted.
   *
   * Both take `describeFrame`'s sentence rather than composing their own, so the words on this
   * screen and the words on the Engineer surface's stage are one function's, and neither can drift
   * from the frame it describes.
   */
  function announce(recording: VizRecording, frame: Frame, dispatcherName: string): void {
    /* § D1383: a rush's text quotes the climb its page states, not the drain the recording runs on into. */
    const sentence = describeFrame({
      recording,
      frame,
      dispatcherName,
      ...(context.ctx === 'rush' ? { horizonS: RUSH_STREAM.lengthS } : {}),
    });
    canvas.setAttribute('aria-label', sentence);
    if (pendingSay !== undefined) {
      view?.clearTimeout(pendingSay);
      pendingSay = undefined;
    }
    if (description.textContent === sentence) return;
    const waitMs = STAGE_ANNOUNCE_MS - (systemClock().now() - lastAnnouncedMs);
    if (waitMs <= 0) {
      say(sentence);
      return;
    }
    /*
     * **A stopped frame is said when the limit allows, not left for the next frame** — the post-AI
     * panel's seat D, D7. A moving picture draws again inside the limit and the next frame past it
     * says what is on screen then. A stopped one draws no next frame, so the region kept the last
     * sentence it had been allowed to say: *7 legs waiting* on the paused frame of St Jude's call
     * beside a header reading 10, and *at 23:42 of 30:00* on a day that had run out. So a stage that
     * is not playing schedules the frame it stopped on for the moment the two-second limit lifts —
     * the limit `screenReaderWalkthrough.browser.test.ts` holds, kept, and the stopped frame said
     * within it. The next draw, or unmounting, cancels it.
     */
    if (playback?.state === 'playing') return;
    pendingSay = view?.setTimeout(() => {
      pendingSay = undefined;
      if (alive) say(sentence);
    }, waitMs);
  }

  /** One write to the live region, stamped for the rate limit. */
  function say(sentence: string): void {
    lastAnnouncedMs = systemClock().now();
    description.textContent = sentence;
  }

  /**
   * **Run the picture out — § 2.3's skip control, GitHub issue #369.**
   *
   * Three lines, and the first one is the one that is easy to leave out. `Playback.state` reports
   * `ended` only while the transport is *playing* and the playhead has reached `endedAt` — it is a
   * derived state rather than a flag, which is what lets a seek backwards resume without anything
   * resetting. A skip that paused and seeked would therefore leave the transport reading `paused`
   * at the last frame, `syncTransport`'s `dayEnded` edge would never fire, and § 3.3's row would go
   * on offering *Close the day* about a day the player can see has finished.
   *
   * **It reaches the transport and nothing else**, which is `docs/16`'s rule for a presentation
   * control: the recording was simulated on a worker before this screen drew a frame, so a day
   * watched at `1×`, at `600×` and a day skipped are the same day — the same legs, the same
   * report. `stageSkip.test.ts` asserts that rather than leaving it to this paragraph.
   */
  function skipToEnd(confirmed = false): void {
    if (playback === undefined) return;
    if (heldAtS !== undefined) return;
    /*
     * **And the day has been started** — GitHub issue #565's third defect, § D947.
     *
     * This line was missing, and what it cost was a false sentence on the one surface that has no
     * picture to contradict it: § 7.3's overlay stayed up over a finished day, reading *"Paused at
     * 18:00, the start of the day. Nothing has happened yet"* beside the day's own closing
     * figures, on the canvas's accessible name as well as on the glass. A player who skips has
     * committed to the day exactly as a player who presses *Play* has, so the flag belongs here
     * too — and `stageShowsOpening` is the derivation that makes the next control that forgets it
     * harmless.
     */
    started = true;
    /*
     * **A skip stops at a call that has not been answered** — [§ D1151](../../../../DECISIONS.md),
     * which amends § D1029's *a skip is the player's own answer to a call they have not been asked
     * yet* and § D1138's *a skip answers every call the day had left*. The post-AJ panel's seat D
     * (H1) pressed *Skip to the end* on a newcomer's first day and the stage ran past the day's only
     * call; the day banked as missed and the report said *nothing was pressed*. So a skip runs the
     * picture to the next call standing and the stage stops there as it would at any rung, with the
     * card up. Pressed again with the card up, it is the player's answer: the call is recorded as
     * skipped and the day runs to its end.
     *
     * An ordinary candidate whose two runs have not landed is waited at, exactly as the stage waits
     * at one while playing; {@link skipping} carries the press across the wait, so a candidate that
     * is not raised does not hand the player back a day playing at their rung.
     */
    const standing = activeCall();
    /*
     * **And across a re-simulation** — wave AM, lane AM-B, § D1239, the post-AL panel's seat B: an
     * answer's re-simulation hides the day's next call until its run lands, and a skip pressed in
     * that beat ran to the day's end, so the next card came up under an 18:00 clock beside *the day
     * has run out*. The skip is carried across the beat, and {@link adopt} takes it on.
     */
    if (standing === undefined && recomputingOver !== undefined) {
      skipping = true;
      return;
    }
    if (standing !== undefined && (playback.simTimeS < standing.call.atS || !standing.raised)) {
      skipping = true;
      if (playback.simTimeS < standing.call.atS) {
        playback.play();
        playback.seekTo(standing.call.atS);
        syncTransport();
        requestFrame();
      }
      return;
    }
    /*
     * **A call that is due asks first** — wave AN, lane AN-6, [§ D1324](../../../../DECISIONS.md).
     * Reaching here with a call standing means it is raised and its second has come: its card is up,
     * or is drawn on the next frame. The first press puts {@link skipAsk}'s question under its
     * answers; a second press, with the question up, or the question's own *Skip to the end*, is the
     * answer § D1151 made it.
     */
    if (standing !== undefined && !confirmed && skipAsk.hidden) {
      skipping = false;
      askBeforeSkipping(playback.simTimeS);
      return;
    }
    skipping = false;
    if (standing !== undefined) {
      if (standing.pinned) {
        callAnswered = true;
        host.skipPressCall();
      } else {
        /* The card is up: that call is recorded as skipped, and the day asks no more. */
        host.skipDayCalls(true);
      }
      showCallCard(false);
    }
    waitingOnCall = false;
    /*
     * **A skip that would run past the instant the day was lost stops there, on the card, once** —
     * wave AP, lane AP-D1, [§ D1446](../../../../DECISIONS.md), reading swarm DR's § Q4 (*the stage
     * stops once*) as binding a skip as it binds a frame, the way § D1151 stops a skip at a call. The
     * card's *End the day* files the day, and a second press of the skip runs it to the end.
     *
     * **Except the skip that answers a call**: § D1151 makes a skip pressed with the card up the
     * player's answer, *and the day runs to its end*, so that press is not stopped again on the way.
     * The stretch it jumps is marked read, or the next frame would find the loss inside it.
     */
    if (standing !== undefined) {
      lostReadToS = playback.recording.endedAt;
    } else {
      const lostS = lostStopIn(playback.recording, playback.simTimeS, playback.recording.endedAt);
      if (lostS !== undefined) {
        stopOnLoss(lostS);
        return;
      }
    }
    playback.play();
    playback.seekTo(playback.recording.endedAt);
    syncTransport();
    requestFrame();
  }

  /**
   * **The call standing on this attempt**, of either kind — the one reading pace, card and holds
   * share. The pinned day's § D1029 call while it is unanswered, else the ordinary day's next call
   * from the host (§ D1138), which only the daily stage asks for — on a pinned day too, once its
   * call is answered ([§ D1204](../../../../DECISIONS.md)). `raised: false` is an ordinary
   * candidate whose runs have not landed: the stage waits at it but draws no card.
   */
  function activeCall():
    | {
        readonly call: PressCall;
        readonly raised: boolean;
        readonly pinned: boolean;
        /** § D1167: present when the raised call asks who drives. */
        readonly drivers?: DayCallDriverNames | undefined;
      }
    | undefined {
    if (watchingNow() !== undefined) return undefined;
    if (stageCall !== undefined && !callAnswered) return { call: stageCall, raised: true, pinned: true };
    /*
     * § D1408: a career day asks too, where its event makes it a day that asks; the host decides
     * which career days those are (`everyday/careerCalls.ts`) and answers `undefined` for the rest.
     */
    if (!dayCallsAskedIn(context.ctx) || adopted === undefined || recomputingOver !== undefined) return undefined;
    /*
     * § D1204: once the pinned call is answered, the day asks on. The host opens the ordinary
     * session after it, searched from five minutes past it, and refuses it where the call was
     * skipped — so a skip with the pinned card up still answers every call the day had left.
     */
    const next = host.dayCallOnStage(adopted, stageCall);
    if (next === undefined) return undefined;
    return next.question === 'driver'
      ? { call: next.call, raised: next.raised, pinned: false, drivers: next.drivers }
      : { call: next.call, raised: next.raised, pinned: false };
  }

  /**
   * The held reason for the parking presses and the handover, or `undefined`. A pinned call holds
   * them from the day's start until it is answered (§ D1029: the call is where that day's press is
   * made). An ordinary call holds them only while its card is up, because an ordinary day's calls
   * are not promised in advance and a hold that named one might name a call that is never raised.
   */
  function callHeld(): string | undefined {
    const standing = activeCall();
    if (standing === undefined) return undefined;
    const atCall = standing.raised && (playback?.simTimeS ?? 0) >= standing.call.atS;
    /* § D1239: once the stage has stopped at the call, the hold says the card is where the presses are. */
    if (atCall) return STAGE_CALL_COPY.heldAtCall;
    return standing.pinned ? STAGE_CALL_COPY.held : undefined;
  }

  /**
   * **Answer the call** — § D1029, and § D1138 for an ordinary one. A press is stamped at the call
   * second rather than at the playhead, because the stage may have stopped a frame past it; *leave
   * them* presses nothing. An ordinary call's press adopts the run the host already made for it, so
   * the beat is the same one an intervention shows and ends on the same notification. Either way
   * the day plays on from where it stopped.
   */
  function answerCall(option: StageCallOption): void {
    const change = option.change;
    const standing = activeCall();
    const current = adopted;
    if (standing === undefined || !standing.raised || current === undefined || playback === undefined) return;
    const call = standing.call;
    showCallCard(false);
    started = true;
    waitingOnCall = false;
    /* Wave AQ, lane AQ-2: the recomputing beat after an answer says what was chosen. */
    const said = stageCallAnsweredLineOf(option);
    if (standing.pinned) {
      callAnswered = true;
      host.notePinnedCallDone();
      if (change !== undefined) {
        withRecomputeBeat(
          current,
          () => {
            host.intervene(call.atS, change);
          },
          said,
        );
      }
    } else if (option.answer === 'leave') {
      host.answerDayCall('leave');
    } else {
      /* § D1167: a driver answer adopts the handover run the session made, as a parking answer does. */
      withRecomputeBeat(
        current,
        () => {
          host.answerDayCall(option.answer);
        },
        said,
      );
      /*
       * The adoption is synchronous, so the beat has already ended on the new recording. If the host
       * refused the answer (a run it did not make stands, or one is in flight), nothing was adopted
       * and the beat would wait for a recording that is not coming: it ends here instead.
       */
      if (adopted === current) {
        recomputingOver = undefined;
        barFacts.recomputing = false;
        context.refreshBar();
      }
    }
    playback.play();
    /* Lane AO-4: the card has gone and the day plays on, so the building comes back into view. */
    bringBuildingPending = true;
    syncTransport();
    requestFrame();
  }

  /** Show, hide or rebuild the card for the playhead. */
  function drawCall(simTimeS: number): void {
    const standing = activeCall();
    const call = standing?.call;
    /*
     * § D1138: the stage stopped to wait for an ordinary candidate's runs, and they landed without
     * raising it (or the day's calls ran out). Nothing stands at this instant any more, so the day
     * plays on by itself — the player did not pause it, and a stage left paused here would be a
     * stop with no call behind it.
     */
    /*
     * Wave AP, lane AP-D1, [§ D1447](../../../../DECISIONS.md): **a skip carried across the wait is a
     * reason to go on by itself.** {@link skipToEnd} marks it, and only {@link pace} marked the wait,
     * which it does only while the transport plays; a skip pressed at a call standing at the day's
     * first instant, before anything played, was carried and never read, so the first press did
     * nothing and the second reached the call (the post-AO panel's seats D, D2, and A, defect 4).
     */
    const carried = waitingOnCall || (skipping && recomputingOver === undefined);
    if (carried && playback !== undefined && (standing === undefined || standing.call.atS > simTimeS)) {
      waitingOnCall = false;
      /* § D1151: a skip that was waiting here goes on to the next call, or to the end. */
      if (skipping) {
        skipToEnd();
        return;
      }
      playback.play();
      syncTransport();
      requestFrame();
    }
    const showing =
      standing !== undefined &&
      standing.raised &&
      call !== undefined &&
      stageCallPhaseOf(call, simTimeS, false) === 'called';
    if (!showing || call === undefined) {
      showCallCard(false);
      return;
    }
    /*
     * **The card is drawn at its own clock** — § D1239, the post-AL panel's seat B. A call raised
     * after the transport had run on (to the day's end, after a skip) came up under the end's clock,
     * *18:00*, with *the day has run out* on the bar. The playhead goes back to the call second and
     * the transport stops there, as the pace stops it at a call (§ D1153): the picture is the one
     * the question is asked over, and the skip that ran past it did not answer it.
     */
    if (playback !== undefined && playback.simTimeS > call.atS + 1) {
      playback.pause();
      playback.seekTo(call.atS);
      const stopNote =
        stagePaceNoteOf({ simPerRealS: stageSpeedAt(speedIndex).simPerRealS, reason: 'call' }, { acts: paceActs, simTimeS: call.atS }) ?? '';
      /* Lane AO-4: a stop speaks alone, and the skip that ran past it is over. */
      skipLine = '';
      skipLineReason = undefined;
      setPace(stopNote, true);
      syncTransport();
      requestFrame();
    }
    /* The wait is over and the call is raised: the note says what the stop now is. */
    if (paceText === STAGE_CALL_COPY.waiting || paceText === '') {
      /* Lane AO-4: and on a resumed attempt, whose paused stage the pace never wrote, it says so too. */
      skipLine = '';
      skipLineReason = undefined;
      setPace(
        stagePaceNoteOf({ simPerRealS: stageSpeedAt(speedIndex).simPerRealS, reason: 'call' }, { acts: paceActs, simTimeS }) ?? '',
        true,
      );
    }
    waitingOnCall = false;
    /* § D1151: the skip has arrived at a call; the next press of it is the player's answer. */
    skipping = false;
    const key = `${String(call.atS)}|${call.rule}|${standing.drivers === undefined ? 'placement' : 'driver'}`;
    if (key !== callCardKey) {
      callCardKey = key;
      /* § D1206: who stands at the call second, read off the run on the stage and nothing after it. */
      const present = adopted === undefined ? undefined : stageCallPresentOf(adopted, call.atS);
      /*
       * § D1432: the goal nearest its bar, off the rail's own readings at the call second, and each
       * answer's line, a driver's from its own profile (the one driving now where it is the keep).
       */
      const driving = host.drivingProfile();
      const card = stageCallCardOf(
        call,
        host.dayStartS(),
        bookedCars,
        standing.drivers,
        present,
        {
          readings: host.goalsAt(call.atS),
          driverOf: (name) => (driving.name === name ? driving : host.dispatchers().find((profile) => profile.name === name)),
        },
        /* § D1528: a placement call after an earlier park or spread says so. */
        stageCallStandingOrderOf(host.interventions(), call.atS),
      );
      const heading = el(doc, 'div', 'everyday-stage-call-heading', card.heading);
      heading.style.cssText = `font:600 11px ${TYPE.mono};letter-spacing:0.08em;color:${C.label}`;
      const facts = card.facts.map((fact) => {
        const line = el(doc, 'p', 'everyday-stage-call-fact', fact);
        line.style.cssText = `margin:0;font-size:13px;line-height:1.45;color:${C.inkSoft}`;
        return line;
      });
      const question = el(doc, 'p', 'everyday-stage-call-question', card.question);
      question.id = 'everyday-stage-call-question';
      question.style.cssText = 'margin:2px 0 0;font-size:13.5px;font-weight:600';
      const row = el(doc, 'div');
      row.style.cssText = `display:flex;flex-wrap:wrap;gap:${String(GAP.row)}px`;
      for (const option of card.options) {
        const button = el(doc, 'button', 'everyday-stage-call-answer', option.label);
        button.type = 'button';
        button.dataset['answer'] = option.answer;
        button.style.cssText = ARM_BUTTON_CSS;
        button.addEventListener('click', () => {
          answerCall(option);
        });
        row.append(button);
      }
      /* § D1432: one line per answer saying what it is, in the buttons' order, under them. */
      const lines = card.options.flatMap((option) => {
        if (option.line === undefined) return [];
        const line = el(doc, 'p', 'everyday-stage-call-answer-line', option.line);
        line.dataset['answer'] = option.answer;
        line.style.cssText = `margin:0;font-size:12.5px;line-height:1.45;color:${C.inkSoft}`;
        return [line];
      });
      callCard.setAttribute('aria-label', card.heading);
      callBody.replaceChildren(heading, ...facts, question, row, ...lines);
    }
    showCallCard(true);
  }

  function intervene(change: (typeof STAGE_INTERVENTIONS)[number]['change']): void {
    const current = adopted;
    if (playback === undefined || current === undefined) return;
    const atS = playback.simTimeS;
    /*
     * The playhead is *this* screen's, not the shell's — `EverydayHost.intervene`'s whole reason for
     * taking it. A change stamped at the Engineer transport's position would be filed at an instant
     * nobody was looking at.
     */
    /* § D1278: the press, held until its day lands, so `adopt` can say whether it changed anybody's trip. */
    pendingPress = { atS, change };
    withRecomputeBeat(current, () => {
      host.intervene(atS, change);
    });
  }

  /**
   * § 7.6's `recomputing` beat around a press that grows the record — the stage's arms and the
   * dock's answer share it, so the two cannot freeze differently.
   *
   * The beat goes up on this frame rather than on the host's notification: *show a `recomputing`
   * beat rather than freezing silently*, and the freeze starts here. It comes down when the host
   * notifies with a different recording ({@link adopt}).
   */
  function withRecomputeBeat(current: VizRecording, press: () => void, answered?: string): void {
    answeredLine = answered;
    recomputingOver = current;
    barFacts.recomputing = true;
    context.refreshBar();
    syncTransport();
    draw();
    press();
  }

  /* ---------------------------------------------------------------- § 7.5's dock */

  /** The dock's last drawn state, so a frame that changes nothing rebuilds nothing. */
  let dockKey = '';
  /** The reason the last press was refused, drawn under the rows until the next state change. */
  let dockRefusal: string | undefined;

  function dockViewNow(): CampaignDockView | undefined {
    if (context.ctx !== 'campaign') return undefined;
    const facts = host.campaignDay();
    if (facts === undefined) return undefined;
    const dayStartS = host.dayStartS();
    const answer = host.interventions().find((entry) => entry.change.kind === 'answer-incident');
    return campaignDockViewOf({
      tower: facts.tower,
      buildingName: facts.buildingName,
      incident: facts.incident,
      runLengthS: facts.runLengthS,
      simTimeS: playback?.simTimeS ?? 0,
      dayStartS,
      answeredStamp: answer === undefined ? undefined : interventionLogOf([answer], dayStartS)[0],
      hasRun: adopted !== undefined && !barFacts.dayClosed && !barFacts.recomputing,
      /* § D1543: the playhead at the end of an unfiled day, the bar's own `dayEnded`. */
      dayOver: adopted !== undefined && barFacts.dayEnded && !barFacts.dayClosed,
    });
  }

  function syncDock(): void {
    const view = dockViewNow();
    if (view === undefined) {
      if (dock.parentElement !== null) dock.remove();
      dockKey = '';
      return;
    }
    if (dock.parentElement === null) stageRow.append(dock);
    const key = `${JSON.stringify(view)}\u0000${dockRefusal ?? ''}`;
    if (key === dockKey) return;
    dockKey = key;
    dock.replaceChildren(...dockChildrenOf(view));
  }

  function dockChildrenOf(view: CampaignDockView): readonly HTMLElement[] {
    const name = el(doc, 'div', 'everyday-stage-dock-name', view.buildingName);
    name.style.cssText = `font:600 13px ${TYPE.body};color:${C.ink}`;
    const dayLine = el(doc, 'div', 'everyday-stage-dock-day', view.dayLine);
    dayLine.style.cssText = `font:500 10px ${TYPE.mono};letter-spacing:.1em;color:${C.inkSoft};text-transform:uppercase`;
    const figures = el(doc, 'div', 'everyday-stage-dock-figures');
    figures.style.cssText = `display:grid;grid-template-columns:repeat(3,1fr);gap:${String(GAP.tight)}px`;
    for (const figure of view.figures) {
      const cell = el(doc, 'div', 'everyday-stage-dock-figure');
      const value = el(doc, 'div', 'everyday-stage-dock-value', figure.value);
      value.style.cssText = `font:600 15px ${TYPE.body};color:${C.ink}`;
      const label = el(doc, 'div', 'everyday-stage-dock-label', figure.label);
      label.style.cssText = `font:400 11px ${TYPE.body};color:${C.inkSoft}`;
      cell.append(value, label);
      figures.append(cell);
    }
    const block = el(doc, 'div', 'everyday-stage-dock-incident');
    block.dataset['state'] = view.incident.kind;
    block.style.cssText = `display:flex;flex-direction:column;gap:${String(GAP.tight)}px;border-top:1px solid ${C.rule};padding-top:${String(GAP.row)}px`;
    const eyebrowRow = el(doc, 'div', 'everyday-stage-dock-eyebrow-row');
    eyebrowRow.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline';
    const eyebrow = el(doc, 'span', 'everyday-stage-dock-eyebrow', view.incident.heading);
    eyebrow.style.cssText = `font:500 10px ${TYPE.mono};letter-spacing:.12em;color:${C.sun}`;
    eyebrowRow.append(eyebrow);
    if (view.incident.kind !== 'quiet') {
      const clock = el(doc, 'span', 'everyday-stage-dock-clock', view.incident.clock);
      clock.style.cssText = `font:500 11px ${TYPE.mono};color:${C.inkSoft}`;
      eyebrowRow.append(clock);
    }
    block.append(eyebrowRow);
    if (view.incident.kind === 'quiet') {
      block.append(el(doc, 'div', 'everyday-stage-dock-note', view.incident.note));
    } else {
      const title = el(doc, 'div', 'everyday-stage-dock-title', view.incident.title);
      title.style.cssText = `font:600 13px ${TYPE.body};color:${C.ink}`;
      block.append(title);
      if (view.incident.kind === 'open') {
        block.append(el(doc, 'div', 'everyday-stage-dock-note', view.incident.note));
        const options = el(doc, 'div', 'everyday-stage-dock-options');
        options.setAttribute('role', 'group');
        options.setAttribute('aria-label', 'options, with what each costs and when it takes effect');
        options.style.cssText = `display:flex;flex-direction:column;gap:${String(GAP.tight)}px`;
        for (const option of view.incident.options) {
          const button = el(doc, 'button', 'everyday-stage-dock-option');
          button.type = 'button';
          button.dataset['option'] = option.id;
          button.title = option.effect;
          button.style.cssText = [
            'text-align:left',
            `border:1px solid ${C.rule}`,
            `border-radius:${String(R.control)}px`,
            `background:${C.paper}`,
            `color:${C.ink}`,
            'padding:8px 10px',
            `font:500 12.5px ${TYPE.body}`,
            'cursor:pointer',
            'display:flex',
            'flex-direction:column',
            'gap:2px',
          ].join(';');
          const head = el(doc, 'span', 'everyday-stage-dock-option-head');
          head.style.cssText = 'display:flex;justify-content:space-between;gap:8px';
          head.append(
            el(doc, 'span', 'everyday-stage-dock-option-label', option.label),
            el(doc, 'span', 'everyday-stage-dock-option-cost', option.cost),
          );
          const when = el(doc, 'span', 'everyday-stage-dock-option-when', option.when);
          when.style.cssText = `font:400 11px ${TYPE.body};color:${C.inkSoft}`;
          button.append(head, when);
          if (option.refusal !== undefined) {
            button.disabled = true;
            button.style.opacity = '.55';
            button.style.cursor = 'default';
            const why = el(doc, 'span', 'everyday-stage-dock-option-refusal', option.refusal);
            why.style.cssText = `font:400 11px ${TYPE.body};color:${C.inkSoft}`;
            button.append(why);
          }
          button.addEventListener('click', () => {
            answerFromDock(option.id);
          });
          options.append(button);
        }
        block.append(options);
        if (dockRefusal !== undefined) {
          const line = el(doc, 'div', 'everyday-stage-dock-refusal', dockRefusal);
          line.style.cssText = `font:400 11px ${TYPE.body};color:${C.inkSoft}`;
          block.append(line);
        }
      } else {
        const stamp = el(doc, 'div', 'everyday-stage-dock-stamp', view.incident.stamp);
        stamp.style.cssText = `font:500 11px ${TYPE.mono};color:${C.inkSoft}`;
        block.append(stamp);
      }
      const footer = el(doc, 'div', 'everyday-stage-dock-footer', view.incident.footer);
      footer.style.cssText = `font:400 11px ${TYPE.body};color:${C.inkSoft}`;
      block.append(footer);
    }
    const levers = el(doc, 'div', 'everyday-stage-dock-levers', view.otherLevers);
    levers.style.cssText = `font:400 11px ${TYPE.body};color:${C.inkSoft}`;
    return [name, dayLine, figures, block, levers];
  }

  function answerFromDock(optionId: string): void {
    const current = adopted;
    if (playback === undefined || current === undefined) return;
    const atS = playback.simTimeS;
    /*
     * The host answers or says why not, in the dock's own words; a refusal is drawn under the rows
     * rather than swallowed (§ 7.6's fourth rule), and a press that landed grows the record through
     * the same beat the stage's arms use.
     */
    let reason: string | undefined;
    withRecomputeBeat(current, () => {
      reason = host.answerIncident(atS, optionId);
    });
    if (reason !== undefined) {
      /* Nothing grew: take the beat back down on this frame rather than waiting for a run that never comes. */
      recomputingOver = undefined;
      barFacts.recomputing = false;
      context.refreshBar();
      syncTransport();
    }
    dockRefusal = reason;
    dockKey = '';
    syncDock();
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
  /**
   * § 4.6's *Default speed*, read at the one place speed resets — GitHub issue #229. The store is
   * this device's, so the ladder index is looked up from the stored value each time rather than
   * cached: a player who changes the setting and starts the next day gets the next day at the new
   * speed. A stored value off the ladder cannot arrive (`profile.ts#loadDefaultSpeed` refuses it),
   * and the fallback to `DEFAULT_STAGE_SPEED_INDEX` is for the type rather than for a case.
   */
  function defaultSpeedIndex(): number {
    const wanted = everydayProfileStore().defaultSpeed();
    const index = STAGE_SPEEDS.findIndex((speed) => speed.simPerRealS === wanted);
    return index === -1 ? DEFAULT_STAGE_SPEED_INDEX : index;
  }

  function adopt(recording: VizRecording): void {
    const resumeAtS = recomputingOver !== undefined ? playback?.simTimeS : undefined;
    const wasPlaying = recomputingOver !== undefined && playback?.state === 'playing';
    /*
     * § D1278 — GitHub issue #588. The day before the press and the day after it are both in hand
     * on this line and on no other, so the parking press is judged here, once: on the legs, by the
     * model. Any other adoption (a new day, a call's answer, the dock's) leaves no press pending
     * and so clears the verdict rather than carrying it onto a day it was not about.
     */
    const press = pendingPress;
    pendingPress = undefined;
    pressChangedNobody =
      press !== undefined &&
      recomputingOver !== undefined &&
      stagePressChangedNobody({ before: recomputingOver, after: recording, press })
        ? press
        : undefined;
    /*
     * § D1310 — GitHub issue #571. A handover is judged on the same pair, and on the goals as well:
     * the strip's own list, read at each day's end. Any other press or adoption clears it.
     */
    const handover =
      press !== undefined && press.change.kind === 'adopt-dispatcher' && recomputingOver !== undefined
        ? stageHandoverVerdictOf({
            before: recomputingOver,
            after: recording,
            press,
            goals: host.goalsAt(recording.endedAt).map((reading) => reading.goal),
          })
        : undefined;
    handoverVerdict =
      press !== undefined && handover !== undefined
        ? { press, outcome: handover, dayEndS: recording.endedAt }
        : undefined;
    adopted = recording;
    recomputingOver = undefined;
    barFacts.recomputing = false;
    /* A fresh recording is a fresh answer to the dock's question; a stale refusal would outlive it. */
    dockRefusal = undefined;
    if (resumeAtS === undefined) {
      speedIndex = defaultSpeedIndex();
      started = false;
      playerChoseSpeedAtS = undefined;
      /* § D1435: a fresh day has not been lost; a re-simulation after a press keeps the stop it had. */
      lostAtS = undefined;
      lostCardShown = false;
      lostCard.hidden = true;
      lostReadToS = undefined;
    } else if (lostReadToS !== undefined && lostReadToS > resumeAtS) {
      /* § D1446: the re-simulated run is the same day only up to the press, so it is read on from there. */
      lostReadToS = resumeAtS;
    }
    /*
     * § D1029 — the call, latched per attempt. A fresh attempt asks the host once, of the recording
     * it opens on; a re-simulation after the answer keeps it and marks it answered. Never on a watched
     * run or the rush: the host answers about the state, and on those the recording on screen is not
     * the state's day.
     */
    if (resumeAtS === undefined) {
      stageCall =
        context.ctx === 'watch' || context.ctx === 'rush' ? undefined : host.pressCallOnStage(recording);
      /* § D1218: a resumed attempt that answered its pinned call with *leave them* pressed nothing. */
      callAnswered = host.interventions().length > 0 || host.pinnedCallDone(recording);
      skipping = false;
    } else if (host.interventions().length > 0) {
      callAnswered = true;
    }
    /*
     * § D991 — which runs are paced. A whole day **the player's own shell simulated**, and nothing
     * else: `host.runHorizon()` answers about the state, so on a watched or replayed recording it
     * would be describing a different run, and the Rush's template is a phase list whose only peak
     * is its end. The acts are the recording's own schedule, never a list written here.
     */
    paceHorizon = context.ctx !== 'rush' ? host.runHorizon() : 'period';
    paceActs = actsOf(recording.demandPhases);
    paceScored = scoredPaceIn(context.ctx);
    if (resumeAtS === undefined) lastPaceReason = undefined;
    /* § D1493: a new recording is a new day, or the run an answer just made; either way nothing is owed. */
    paceCounters = FRESH_PACE_COUNTERS;
    watchedFrame = undefined;
    watchAllowanceOff = false;
    /* § D1212: a fresh day has skipped nothing; a re-simulation keeps the line it had. */
    skipArmedAtS = undefined;
    if (resumeAtS === undefined) {
      skipLandedAtS = undefined;
      skipLine = '';
      skipLineReason = undefined;
      showStatus();
    }
    /*
     * A new recording is a new building — GitHub issue #258. The crossover is the old tower's
     * doors and the remembered frame is the old tower's cars, so both are dropped rather than
     * carried; a stale `audioBefore` would announce every car in the new lobby at once.
     */
    audioCrossover = undefined;
    audioBefore = undefined;
    /*
     * **A replay of a called day opens just before the call, playing** — wave AK,
     * [§ D1140](../../../../DECISIONS.md), `everyday/callOpening.ts`. Asked on a fresh adoption only:
     * a re-simulation resumes where the stage stopped, and an ordinary day's host answers
     * `undefined`, so it opens at its start with § 7.3's `Start` up as before. Started and playing
     * rather than paused, because the opening overlay describes the start of the day, and a stage
     * paused mid-morning with no `Start` would be a stop nobody asked for.
     */
    const openAtS = resumeAtS === undefined ? host.openingAtS(recording) : undefined;
    /*
     * **A resumed attempt opens where it had reached, paused** — wave AL, lane AL-E,
     * [§ D1218](../../../../DECISIONS.md). A fresh mount over the day's attempt (the brief, the door,
     * a menu or a reload between) used to open at the day's start with § 7.3's *Start* up, which let
     * a day watched to its end be played again from its opening with every answer known. The
     * attempt's furthest shown instant is the host's; `undefined` for any other run and for an
     * attempt that never left its start, which opens as a fresh day does.
     */
    const resumedAtS =
      resumeAtS === undefined && openAtS === undefined && context.ctx === 'daily'
        ? host.attemptResumeAtS(recording)
        : undefined;
    const startAtS = resumeAtS ?? openAtS ?? resumedAtS;
    playback = new Playback(recording, systemClock(), {
      speed: stageSpeedAt(speedIndex).simPerRealS,
      ...(startAtS === undefined ? {} : { startAtS }),
    });
    /* § D1361: a run adopted while another tab holds the day opens held at its start, and does not play. */
    if (heldAtS !== undefined) {
      heldAtS = recording.startedAt;
      playback.setReach(heldAtS);
    }
    if (wasPlaying && heldAtS === undefined) playback.play();
    if (openAtS !== undefined && heldAtS === undefined) {
      started = true;
      playback.play();
    }
    if (resumedAtS !== undefined) {
      started = true;
      /*
       * An attempt left at its end is resumed at its end: playing, so the transport reads `ended`
       * exactly as {@link skipToEnd} leaves it, and § 3.3's row offers the close rather than a skip.
       */
      if (resumedAtS >= recording.endedAt) playback.play();
    }
    raceKeyDrawn = '';
    raceView = undefined;
    syncTransport();
    requestFrame();
    /* § D1239: a skip pressed while this run was being made goes on from here, to the next call or the end. */
    if (resumeAtS !== undefined && skipping) skipToEnd();
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

  /**
   * **After *Start the rush*, keyboard focus lands on *Play*** — wave AQ, lane AQ-3, the post-AP
   * playtest: the setup screen's primary is unmounted by the press and focus fell to the page body.
   * Once, when the round's run is on the stage and *Play* can be pressed, and only if focus is still
   * nowhere, so a player who has already moved it keeps it. Recorded here under § D405.
   */
  function focusPlayOnRushEntry(): void {
    if (!rushEntryFocusPending || adopted === undefined || playButton.disabled) return;
    rushEntryFocusPending = false;
    const active = doc.activeElement;
    if (active === null || active === doc.body || active === doc.documentElement) playButton.focus({ preventScroll: true });
    if (rushPlayOnArrival) {
      rushPlayOnArrival = false;
      if (playback?.state !== 'playing') togglePlay();
    }
  }

  /**
   * **An Enter pressed before *Play* can take focus is kept** — wave AR, lane AR-1 (GitHub issue #633).
   * Focus reaches *Play* only once the round's run lands, 0.6–2.1 s after *Start the rush*, and an
   * Enter in that gap went to the page body and was lost. So while the entry focus is still owed and
   * focus is nowhere, Enter or Space is the press of *Play*, carried out the moment *Play* can act.
   * Rush only. Recorded under [§ D405](../../../../DECISIONS.md).
   */
  let rushPlayOnArrival = false;
  function onRushEntryKey(event: KeyboardEvent): void {
    if (!rushEntryFocusPending || (event.key !== 'Enter' && event.key !== ' ')) return;
    const active = doc.activeElement;
    if (active !== null && active !== doc.body && active !== doc.documentElement) return;
    event.preventDefault();
    rushPlayOnArrival = true;
  }
  if (context.ctx === 'rush') doc.addEventListener('keydown', onRushEntryKey);

  /**
   * **A day whose attempt another tab holds is shown here no further** — wave AO, lane AO-1,
   * [§ D1361](../../../../DECISIONS.md), the post-AN panel's seat D (D2). The saved attempt belongs
   * to one tab at a time. While another tab holds it, this stage pauses where it stands and holds
   * its playhead there (`Playback.setReach`), its transport and presses do nothing, and § 3.3's
   * primary is the takeover. Let go the moment this tab holds the day again, which a takeover's
   * re-simulated run replaces anyway. Only the daily flow carries a scored attempt.
   */
  function holdForAnotherTab(): void {
    const attempt = context.ctx === 'daily' ? host.dayAttempt() : undefined;
    const kind = attempt === undefined ? undefined : host.stageHold(adopted);
    barFacts.held = attempt === undefined || kind === undefined ? undefined : { kind, weekday: attempt.weekday };
    if (barFacts.held !== undefined) {
      if (heldAtS === undefined) {
        heldAtS = playback?.simTimeS ?? adopted?.startedAt ?? 0;
        playback?.pause();
        dropSkipBeat();
      }
      if (playback !== undefined && playback.reach !== heldAtS) playback.setReach(heldAtS);
      return;
    }
    if (heldAtS === undefined) return;
    heldAtS = undefined;
    playback?.setReach(null);
  }

  /** The host said something changed. Adopt a new recording; otherwise just redraw the facts. */
  function onHostChange(): void {
    if (!alive) return;
    const runState = host.runState();
    barFacts.dayClosed = runState.dayClosed;
    context.setRunOpen(runState.open);
    const recording = host.recording();
    const mayAdopt = stageMayAdopt({
      incoming: recording,
      adopted,
      runPending: host.runPending(),
      standingAtEntry,
      runFailed: host.runFailure?.() !== undefined,
    });
    /*
     * **Behind the veil, no other day** — wave AP, lane AP-D1, [§ D1448](../../../../DECISIONS.md),
     * the post-AO panel's seats D (D7) and A (6). A second tab opened on *Continue your week* while
     * the first held the attempt adopted the page's own run (an 08:30 hour on another seed, another
     * car booked out, other bars) and drew it under *your attempt at this day is still open*, with a
     * *▶ Play* that looked live. Such a run is not adopted: the stage stays empty under § D1361's
     * line, with nothing to play, until a takeover brings the attempt's own run.
     */
    const anotherDay = context.ctx === 'daily' && recording !== undefined && host.stageHoldsAnotherDay(recording);
    if (mayAdopt && recording !== undefined && !anotherDay) adopt(recording);
    holdForAnotherTab();
    /*
     * § 3.3's row asks *this* stage what it has, and while the third clause of {@link stageMayAdopt}
     * is holding, what it has is nothing — GitHub issue #548. Unguarded, `runState().hasRun` is true
     * of the recording the stage is refusing to draw, so the primary would offer *Close the day* over
     * a day that is not on screen and `closeDay` would file it. `stageBarModelOf` says the honest
     * thing instead: *the day has not started yet — there is nothing to file*.
     */
    const awaitingToday = adopted === undefined && recording !== undefined && (!mayAdopt || anotherDay);
    barFacts.hasRun = runState.hasRun && !awaitingToday;
    /*
     * § 20.15's withdrawal, re-read on every notification rather than latched at mount — GitHub
     * issue #182. The record does not move within one watch, but the **week** does: closing a day
     * from another screen advances it, and a refusal computed once would then be describing a
     * comparison that has changed under it. Cleared outright when nothing is being watched, so a
     * player's own stage can never carry a spectator's refusal (§ D227).
     */
    const session = context.ctx === 'watch' ? host.watching() : undefined;
    watchFacts.hasReplay = session !== undefined && adopted !== undefined;
    /* Whose record it is, so the row's note speaks to its owner — § D1186. */
    watchFacts.owner = session?.view.owner;
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
    /* The dock reads the log and the purse, both of which move on a notification. */
    syncDock();
    syncTransport();
    requestFrame();
  }

  function syncTransport(): void {
    /*
     * Wave AS, lane AS-1 (GitHub issue #635, finding 2): the entry focus may press *Play* itself, so
     * the state is read after it. Read before, an early Enter left *▶ Play* on a running round.
     */
    focusPlayOnRushEntry();
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
      /* § D1543: the dock says the day is over on the same edge the bar hears it. */
      syncDock();
      /*
       * § 7.2 E2 — `run_observed`, beat 1 of `docs/26 K2`'s chain, GitHub issue #340.
       *
       * On the same edge and for the same reason the bar is refreshed here: this is the one
       * function every transport change passes through, and it fires on the transition rather than
       * on the frame. `reachedEndedAt` is `true` because that is the transition — a player who
       * leaves halfway emits nothing, which is § 9.2's direction: a lost observation subtracts
       * from `docs/26 K2` and can never add to it.
       *
       * The pointer is `undefined` on a watched run, a replay and anything this shell did not
       * simulate (`host.ts#runPointer` says why), and no event is emitted then. An event about
       * somebody else's day would be a false statement rather than a missing one.
       */
      const pointer = ended ? context.host.runPointer() : undefined;
      if (pointer !== undefined) {
        everydayTelemetry().record({
          name: 'run_observed',
          run: telemetryRunPointerOf(pointer),
          reachedEndedAt: true,
        });
      }
    }
    /*
     * The transport's button, one rule over two lanes (joined at integration): stopped at a call whose
     * runs are still being made it says the stage is working and is not offered as *Play* (lane AO-4,
     * the post-AN panel's seat B, lost moment 6); once the day has run out it is inert with the reason
     * on its face, as the skip beside it is (§ D1381, lane AO-3).
     */
    const waitingNow = waitingAtCall();
    /* § D1448: while another tab holds the day, neither control is drawn as if it would act. */
    const heldBy =
      heldAtS === undefined
        ? undefined
        : barFacts.held?.kind === 'stale'
          ? DAY_ATTEMPT_COPY.staleStage
          : DAY_ATTEMPT_COPY.elsewhereStage;
    const play = stagePlayControlOf({ playing, hasRun: playback !== undefined, waitingOnCall: waitingNow, dayEnded: ended, heldBy });
    playButton.textContent = play.label;
    playButton.disabled = play.inert || rushLossLine !== undefined;
    /* A held button says why to a reader on it, in the line a sighted player reads beside it. */
    playButton.title = waitingNow ? STAGE_CALL_COPY.waiting : (play.note ?? '');
    playButton.style.opacity = play.inert && playback !== undefined ? '0.55' : '';
    playButton.style.cursor = play.inert ? 'default' : 'pointer';
    /*
     * § 2.3's skip control, resolved from the same fact the bar reads — GitHub issue #369. Inert
     * once there is nothing left to skip, with the reason on the button's own `title` rather than
     * only in a docstring: `stageSkipViewOf` is the one place that decides, so the mount cannot
     * disagree with the corpus about what this control says.
     */
    const skip = stageSkipViewOf({ dayEnded: ended, hasRun: playback !== undefined, heldBy });
    skipButton.textContent = skip.label;
    skipButton.title = skip.note;
    skipButton.disabled = skip.inert || rushLossLine !== undefined;
    skipButton.style.cssText = [
      'background:transparent',
      `border:1px solid ${C.rule}`,
      `border-radius:${String(R.control)}px`,
      'padding:5px 9px',
      `font:500 11px ${TYPE.mono}`,
      `color:${skipButton.disabled ? C.label : C.ink}`,
      `cursor:${skipButton.disabled ? 'default' : 'pointer'}`,
    ].join(';');
    /*
     * The chip that is lit is the rung the transport is **at** while it moves, which on a scored day
     * may be faster than the player's own (§ D991: *every change shows on the chip*), and the
     * player's own rung while it is stopped — wave AO, lane AO-4, `stageScreenModel.ts#stageLitSpeedOf`:
     * a call stop and the day's end lit `30×` for a player who had never left `4×`. The label is
     * always the multiplier, so the lit chip is never a claim the transport contradicts.
     */
    const chosenAt = stageSpeedAt(speedIndex).simPerRealS;
    const runningAt = stageLitSpeedOf({
      moving: playing,
      runningSimPerRealS: playback?.speed ?? chosenAt,
      chosenSimPerRealS: chosenAt,
    });
    for (const [index, button] of speedButtons.entries()) {
      const on = stageSpeedAt(index).simPerRealS === runningAt;
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
    /* After the chips' styles are written, so the compact row's folds stand over them. */
    syncRushCompact();
    /*
     * § 7.3's single centred `Start`. It is up before the first press and gone after it, so the
     * overlay never sits over a moving picture; a run that has not arrived says so in the same
     * place, because a blank stage with no sentence is the control-that-does-nothing shape.
     */
    /*
     * **A day that failed says so, and offers a way on** — GitHub issue #593. Only while nothing of
     * today's is on the stage (or a re-run over it is what failed) and nothing newer is pending: a
     * press of *Try the day again* clears the host's failure as it starts the next run, so the
     * waiting line takes over on the same notification.
     */
    /*
     * § D1361: another tab holds this day's attempt. Above every other state, because the picture
     * under it is held and none of the controls below act; the bar's primary is the takeover.
     */
    /* § D1572: the quiet start's row is the opening's alone; every other state below hides it. */
    quietNote.style.display = 'none';
    quietSkip.style.display = 'none';
    startRow.style.display = 'none';
    /* Wave AS, lane AS-1: the loss's line over the building it happened on. */
    if (rushLossLine !== undefined) {
      failedRow.style.display = 'none';
      statusText.textContent = rushLossLine;
      startButton.style.display = 'none';
      status.style.display = 'flex';
      return;
    }
    if (heldAtS !== undefined) {
      failedRow.style.display = 'none';
      statusText.textContent =
        barFacts.held?.kind === 'stale' ? DAY_ATTEMPT_COPY.staleStage : DAY_ATTEMPT_COPY.elsewhereStage;
      startButton.style.display = 'none';
      status.style.display = 'flex';
      return;
    }
    const failed =
      context.ctx !== 'watch' &&
      host.runFailure?.() !== undefined &&
      !host.runPending() &&
      (adopted === undefined || recomputingOver !== undefined);
    failedRow.style.display = failed ? 'flex' : 'none';
    if (failed) {
      const failedView = stageRunFailedViewOf(context.ctx);
      statusText.textContent = failedView.line;
      retryButton.textContent = failedView.retry;
      backButton.textContent = failedView.back.label;
      startButton.style.display = 'none';
      status.style.display = 'flex';
      return;
    }
    if (adopted === undefined) {
      statusText.textContent =
        recomputingOver !== undefined ? stageRecomputingLineOf(answeredLine) : STAGE_AWAITING_RUN;
      startButton.style.display = 'none';
      status.style.display = 'flex';
      return;
    }
    if (recomputingOver !== undefined) {
      statusText.textContent = stageRecomputingLineOf(answeredLine);
      startButton.style.display = 'none';
      status.style.display = 'flex';
      return;
    }
    if (stageShowsOpening({ started, simTimeS: playback?.simTimeS ?? adopted.startedAt, recording: adopted })) {
      /* AD-S5: the last moment the player is not watching anything is the moment to say what the
         schedule is about to do. `stageOpeningLineOf` composes it; nothing is authored here.
         The condition is `stageShowsOpening`'s rather than a bare `!started` — § D947: a playhead
         that has moved makes every word of that sentence false, whatever any flag says. */
      statusText.textContent = stageOpeningLineOf({
        recording: adopted,
        simTimeS: playback?.simTimeS ?? adopted.startedAt,
        dayStartS: host.dayStartS(),
      });
      const quiet = context.ctx === 'campaign' && quietCareerDayOf(host);
      startButton.style.cssText = quiet ? START_SECONDARY : START_PRIMARY;
      quietNote.style.display = quiet ? '' : 'none';
      quietSkip.style.display = quiet ? '' : 'none';
      startRow.style.display = 'flex';
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
    switchRow = view.rows.find((row) => row.change.kind === 'adopt-dispatcher');
    if (switchRow !== undefined) {
      switchButton.textContent = switchRow.label;
      switchButton.title = switchRow.refusal ?? switchRow.explains;
      switchButton.disabled = sharedRefusal !== undefined || switchRow.refusal !== undefined;
      switchPicker.disabled = sharedRefusal !== undefined;
    }
    interventionRefusal.textContent = sharedRefusal ?? switchRow?.refusal ?? '';
    interventionNote.textContent = switchRow?.note ?? '';
    /*
     * **The picker's note is withheld wherever the picker cannot act**, and the note is written
     * here rather than at creation so that one function decides it — the same reason the refusal
     * above has one writer.
     *
     * `STAGE_SWITCH_PICKER_NOTE` ends *"until you press the button beside it"*, which is true of a
     * player and false of a spectator: while watching somebody else's run the picker is disabled on
     * this very line and `interventionRefusal` already says *spectator*. A second sentence telling
     * that reader how to commit a change they cannot make is § 14.1's own defect condition, and
     * `watchStage.browser.test.ts` sweeps `.everyday-screen` for the first person to catch exactly
     * this. § 7.6's fourth rule is that a control which cannot act says so; the standing refusal is
     * that sentence, and this one is the instructions for a control that can.
     */
    switchPickerNote.textContent = sharedRefusal === undefined ? STAGE_SWITCH_PICKER_NOTE : '';
    /*
     * **And a picker the refusal disables is described by the refusal** — [§ D1047](../../../../DECISIONS.md).
     * The note it pointed at is emptied on the line above, so a held picker announced as dimmed with
     * no reason: `screenReaderWalkthrough.browser.test.ts`'s `disabled-says-why`, found the first time
     * a bare load reached a pinned day's stage, which since § D1047 is every fresh device's first.
     */
    switchPicker.setAttribute(
      'aria-describedby',
      sharedRefusal === undefined ? switchPickerNote.id : interventionRefusal.id,
    );
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
      ...(pressChangedNobody === undefined ? {} : { pressChangedNobody }),
      ...(handoverVerdict === undefined ? {} : { handoverVerdict }),
    });
    applySwitchRow(view, sharedRefusalOf(view, watchingNow()) ?? callHeld());
    applyParkingRows(view);
  }

  /**
   * The parking arms' note, from the rows the model built — GitHub issue #588,
   * [§ D1278](../../../../DECISIONS.md). One writer, called wherever the handover row is applied,
   * and written only when its sentence changes (`AX-3`'s rule, which the stamp beside it keeps).
   */
  function applyParkingRows(view: StageInterventionView): void {
    const said =
      view.rows.find(
        (row) => row.note !== undefined && STAGE_INTERVENTIONS.some((arm) => arm.change.kind === row.change.kind),
      )?.note ?? '';
    if (said === parkingNoteSaid) return;
    parkingNote.textContent = said;
    parkingNoteSaid = said;
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
    /* § D1361: every arm at once, while another tab holds this day's attempt. */
    if (heldAtS !== undefined) {
      return barFacts.held?.kind === 'stale' ? DAY_ATTEMPT_COPY.staleStage : DAY_ATTEMPT_COPY.elsewhereStage;
    }
    return (watching === undefined ? undefined : SPECTATOR_MAKES_NO_CHANGES) ?? view.refusal;
  }

  /**
   * **One frame of sound** — § D344's design, driven from the same playhead the picture is.
   *
   * Every judgement is `everyday/audio.ts`', and this function makes none of them: it holds the
   * two frames the cue detector compares, the limiter's memory and the context, and hands them
   * over. `docs/16` S2's *"the sink must be the shipped decision"* is why there is no arithmetic
   * here to get wrong.
   *
   * **The context is built lazily and only when there is something to play**, which is what makes
   * *the build is fully playable muted* a fact about the code rather than a claim: a player with
   * Sound off never causes an `AudioContext` to exist, so there is nothing to fail, suspend or
   * leak. The `typeof` guard is for the node tier, where `stageScreen.test.ts` drives this mount
   * against a document that has no Web Audio at all.
   */
  function sound(recording: VizRecording, frame: Frame, observations: LiveObservations): void {
    const soundOn = everydayProfileStore().soundOn();
    if (!soundOn && audioSink === undefined) {
      /* Nothing exists and nothing should; keep the frame so unmuting does not fire a backlog. */
      audioBefore = frame;
      return;
    }
    if (soundOn && audioSink === undefined) {
      if (typeof AudioContext === 'undefined') {
        audioBefore = frame;
        return;
      }
      audioSink = createAudioSink(new AudioContext());
      /*
       * Woken on creation as well as from Play, because the two orders both happen. A stage
       * mounted and then played builds the context on the frame before the press and is woken by
       * it; a stage whose first frame is already playing builds it *after* the press, and would
       * otherwise sit suspended until the player pressed pause and play again. By this point the
       * document has sticky user activation — a run is reached through several presses — so this
       * is a resume rather than an attempt to make a noise nobody asked for.
       */
      audioSink.wake();
    }
    const sink = audioSink;
    if (sink === undefined) return;
    audioCrossover ??= audioCrossoverOf(recording);
    const planned = audioPlanFor({
      crossover: audioCrossover,
      simPerRealS: playback?.speed ?? stageSpeedAt(speedIndex).simPerRealS,
      before: audioBefore,
      now: frame,
      observations,
      realTimeS: sink.now(),
      soundOn,
      state: audioState,
    });
    audioState = planned.state;
    audioBefore = frame;
    sink.play(planned.plan);
  }

  /** One paint: the header, the cutaway, the alarm, the strip. */
  function draw(): void {
    const recording = adopted;
    if (recording === undefined || playback === undefined) {
      /* No run on this stage: no press can act, so none is offered — the parking arms' reason. */
      for (const button of interventionButtons) button.disabled = true;
      switchButton.disabled = true;
      return;
    }
    const simTimeS = playback.simTimeS;
    const observations: LiveObservations = observationsAt(recording, simTimeS);
    pace(simTimeS, observations.longestCurrentWaitS);
    drawCall(playback.simTimeS);
    /* § D1219 — the rows due at the frame drawn. */
    drawCallRows(recording, simTimeS);
    /*
     * Hoisted out of the canvas branch below for GitHub issue #258. It was computed only over a
     * laid-out canvas, which is correct for a picture and wrong for a sound: the cues are the
     * building's own doors and they do not stop happening because a box has no height yet. The
     * function is pure, so this is the same value the branch used to make for itself.
     */
    const frame = frameAt(recording, simTimeS);
    sound(recording, frame, observations);
    const labelOf = (id: string): string =>
      recording.floors.find((floor) => floor.id === id)?.label ?? id;

    /*
     * **Who is driving at this playhead**, not who the day was configured with — wave AL, lane AL-A,
     * the post-AK panel's seats B and C. After a handover the header kept naming the configured
     * dispatcher until the end of the day (daily and rush alike), beside a log saying the day had
     * been handed over. `live/interventions.ts#driverNameAt` reads the run's own log: the player's
     * on their own day, and the watched record's on a replay ([§ D1188](../../../../DECISIONS.md)).
     */
    const configuredName =
      host.dispatcherById(recording.dispatcherProfileId)?.name ?? recording.dispatcherProfileId;
    const driverName = driverNameAt(
      watchingNow() === undefined ? host.interventions() : (host.watching()?.run.record?.interventions ?? []),
      simTimeS,
      configuredName,
    );
    announce(recording, frame, driverName);
    /*
     * § 9.2, GitHub issue #220: in the `rush` context the clock is held time and the pill is the
     * wave, and the run ends where the recording crosses the hold line — the stage stops the replay
     * there and hands the player to the result. `everyday/rush.ts` decides both; nothing is worked
     * out here.
     */
    if (context.ctx === 'rush') {
      const session = host.rush();
      /* Wave AR, lane AR-1: a round counts as running once its clock has moved, not at the press. */
      if (session !== undefined && session.endedAtS === undefined && simTimeS > recording.startedAt) host.rushRoundPlaying();
      if (session?.holdAtS !== undefined && session.endedAtS === undefined && simTimeS >= session.holdAtS) {
        playback.pause();
        host.endRush(session.holdAtS);
        /* Wave AS, lane AS-1: stop on the crossing itself, say so, then the result. */
        if (view === null || view === undefined) {
          context.go('report');
          return;
        }
        rushLossLine = rushLossLineOf();
        if (simTimeS > session.holdAtS) playback.seekTo(session.holdAtS);
        rushLossTimer = view.setTimeout(goToRushResult, RUSH_LOSS_HOLD_MS);
        syncTransport();
        requestFrame();
        return;
      }
    }
    const rushHead = context.ctx === 'rush' ? rushStageHeaderOf({ recording, simTimeS, driverName }) : undefined;
    const head =
      rushHead === undefined
        ? stageHeaderOf({ simTimeS, recording, observations, dayStartS: host.dayStartS(), driverName })
        : {
            clock: rushHead.held,
            phase: rushHead.wave,
            next: undefined,
            drivingLabel: rushHead.drivingLabel,
            driverName: rushHead.driverName,
            /* Wave AS, lane AS-1: the phone's compact row keeps one figure ({@link syncRushCompact}). */
            figures: rushCompact ? [rushHead.compactFigure] : rushHead.figures,
          };
    const watching = watchingNow();
    clock.textContent = head.clock;
    /* Wave AS, lane AS-4 (#636 item 6): the rail's subline carries this clock and where the day stands. */
    context.railClock?.({
      clock: head.clock,
      phase: stageShowsOpening({ started, simTimeS, recording })
        ? 'before'
        : simTimeS >= recording.endedAt
          ? 'over'
          : 'running',
    });
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
    /*
     * § D983. The player's own building, and only on the player's own run: a watched record is
     * somebody else's day in somebody else's tower, and a rush books nothing.
     */
    /*
     * **A watched run names its own cars out** — wave AL, lane AL-A, the post-AK panel's seat D (H1).
     * The pill was switched off while watching, on the ground that a watched record is somebody
     * else's tower; so a replay of the player's own day showed car D standing idle at floor 20 with
     * nothing saying it was booked out. The watched run's cars come from the run the gate simulated
     * (`watch/record.ts#WatchRunPlan.bookedOut`), never from the spectator's selection, and its hour
     * is the watched run's too (`host.dayStartS()` reads it while watching).
     */
    if (recording !== bookedFor || (watching !== undefined) !== bookedWatching) {
      bookedFor = recording;
      bookedWatching = watching !== undefined;
      const building = host.resolvedBuilding();
      /* § D1149: every window, a car out from the first instant included — the pill and the call card both read this. */
      bookedCars =
        watching !== undefined
          ? (host.watching()?.bookedOut ?? [])
          : building?.id === recording.buildingId
            ? carAbsencesOf(building)
            : [];
    }
    const booked =
      context.ctx !== 'rush'
        ? stageBookedOutOf({ bookedOut: bookedCars, simTimeS, dayStartS: host.dayStartS() })
        : [];
    bookedPill.textContent = booked.join('   ');
    bookedPill.style.display = booked.length === 0 ? 'none' : '';
    /* A watched record's handovers are on its own log, so a replay names its driver at the playhead too (§ D1188). */
    drivingName.textContent =
      watching === undefined
        ? head.driverName
        : driverNameAt(host.watching()?.run.record?.interventions ?? [], simTimeS, watching.dispatcherName);
    /* § D1239: the practice sentence, on the player's own daily run only. */
    const practice = context.ctx === 'daily' && watching === undefined ? host.practiceOnStage?.() : undefined;
    if (practiceLine.textContent !== (practice ?? '')) practiceLine.textContent = practice ?? '';
    const practiceDisplay = practice === undefined ? 'none' : '';
    if (practiceLine.style.display !== practiceDisplay) practiceLine.style.display = practiceDisplay;
    /* § D1381: the strip's own judgement, at the strip's own instant — a rush and a watched run grade nothing. */
    const figureJudged = simTimeS >= recording.endedAt;
    const figureReadings = context.ctx === 'rush' || watching !== undefined ? [] : host.goalsAt(simTimeS);
    drawFigures(
      head.figures,
      head.figures.map((figure) => stageFigureToneOf(figure, figureReadings, figureJudged)),
    );
    drawGoals(recording, simTimeS, watching);
    drawEndDay(recording, simTimeS, watching);
    drawLost(recording);
    /*
     * § D1218: how far the day's attempt has been shown, so leaving and coming back resumes here.
     * Noted at the playhead the frame ends on, after the stops that put it back (a call's second,
     * § D1153; the lost instant, § D1446), so the reach is never a frame past where the stage
     * stopped. Wave AP, lane AP-D1: the Engineer transport follows this reach (§ D1449).
     */
    if (context.ctx === 'daily') host.noteShown(recording, playback.simTimeS);
    /*
     * A rush asks nothing of the day: § 9.2 has no brief and no goals to grade. Only the rush is
     * written here: {@link drawGoals} owns the strip's display, and writing `''` over its `flex`
     * dropped the column, so the heading ran into its sentence (wave AR, lane AR-4, GitHub #633).
     */
    if (context.ctx === 'rush') goals.style.display = 'none';
    drawWatching(watching);

    const alarmLine = stageAlarmOf(observations, labelOf);
    alarm.style.display = alarmLine === undefined ? 'none' : 'flex';
    /* The strip: drawn only when the sentence changes, because a repaint that paints the same
       thing is work nobody asked for. It is no longer a live region — see {@link alarmSay}. */
    if (alarmLine !== undefined && alarmLine !== alarmDrawnLine) {
      alarm.replaceChildren(breathingDot(doc), el(doc, 'span', undefined, alarmLine));
      alarmDrawnLine = alarmLine;
    }
    /*
     * The announcement: when the sentence changes **and** not oftener than
     * {@link STAGE_ANNOUNCE_MS} — `AX-3`, and {@link alarm}'s docstring for why both halves are
     * needed. Cleared once when the trouble ends, so a reader is not left with a sentence about a
     * queue that has gone; the guard on that write is what stops the clearing itself repeating.
     */
    const nowMs = systemClock().now();
    if (alarmLine === undefined) {
      if (alarmSaid !== undefined) {
        alarmSay.textContent = '';
        alarmSaid = undefined;
      }
    } else if (alarmLine !== alarmSaid && nowMs - alarmSaidMs >= STAGE_ANNOUNCE_MS) {
      alarmSay.textContent = alarmLine;
      alarmSaid = alarmLine;
      alarmSaidMs = nowMs;
    }
    /*
     * § 7.2 E3 — `trouble_visible`, and it is `charter S1` exactly: *a first-time player reaches a
     * building in visible trouble within 90 s of first load.*
     *
     * ## What counts as visible trouble is the stage's decision and not this line's
     *
     * `docs/26` § 6.2 requires the threshold to *"exist once, declared beside the stage, cited by
     * the schema and never re-stated in the telemetry client"* — P-5 — because two definitions of
     * visible trouble would be two sets of statistics that nobody could tell apart. The shipped
     * one is `stageScreenModel.ts#stageAlarmOf` over `STAGE_ALARM_STANDING`, and this reads the
     * **drawn** result of it rather than the count behind it: the event fires exactly when the
     * alarm strip is on the screen, which is what *visible* means.
     *
     * ## The dwell, and what is honestly missing
     *
     * § 6.2 asks for a threshold **and a declared dwell**, because *"passengers arrive in batches,
     * so an instantaneous count crossing a line is a normal arrival rather than a building failing
     * to drain."* The shipped alarm has a threshold and no wall-clock dwell, and this lane does not
     * invent one: a constant authored here would be the second definition § 6.2 forbids, and a
     * constant authored beside the stage would be this lane deciding what the stage means by
     * trouble. What the alarm does have is a threshold on **forty people standing**, which a batch
     * does not reach on arrival. The gap is real, it is `docs/26` § 11's *"the visible-trouble
     * threshold and dwell belong to the stage and are owed by M2"*, and it is stated rather than
     * papered over.
     *
     * ## Once per session, on the crossing — and **on the edge**, which is not a nicety
     *
     * § 7.2: *"`trouble_visible` ships once per session — the first crossing only. A second one
     * answers no question in § 6 and would turn a funnel event into a stream."* The recorder cannot
     * enforce that (it holds no per-name history), so the guard is here, and it is a module-level
     * latch rather than a per-mount one: a player who walks off the stage and back has still only
     * seen trouble for the first time once.
     *
     * **`draw()` runs on every animation frame**, so the transition is what is watched rather than
     * the condition — `syncTransport`'s own rule about `dayEnded`, one function up. Written as a
     * plain `if (alarmShowing && !troubleSeen)` it read correctly and cost a `runPointer()` — which
     * resolves the whole selection — sixty times a second for as long as the alarm was up and the
     * pointer came back `undefined`. That is not hypothetical: it timed out three cases of
     * `stageScreen.browser.test.ts`, which is how it was found, and P-6 makes a telemetry line that
     * can slow a page a defect rather than a cost.
     *
     * The latch is set on the crossing whether or not a pointer is available, so a run this shell
     * did not simulate spends the session's one crossing and emits nothing. That is the honest
     * direction: § 9.2 says a missing event subtracts from a KPI and can never add to one, and an
     * event about somebody else's day would be a false statement rather than a missing one.
     */
    const alarmShowing = alarmLine !== undefined;
    if (alarmShowing !== alarmDrawn) {
      alarmDrawn = alarmShowing;
      if (alarmShowing && !troubleSeen) {
        troubleSeen = true;
        const pointer = context.host.runPointer();
        if (pointer !== undefined) {
          everydayTelemetry().record({
            name: 'trouble_visible',
            run: telemetryRunPointerOf(pointer),
            atRunS: simTimeS,
          });
        }
      }
    }

    const ctx = sizeCanvas(canvas);
    if (ctx !== undefined) {
      const rect = canvas.getBoundingClientRect();
      /*
       * The camera chips exist exactly where a window would change the picture — GitHub issue #324.
       * Decided only over a laid-out canvas: a box with no height yet (the first paint before layout,
       * a covered world) would read as a plot nothing fits, and offer three chips over a tower they
       * cannot help. Until then the strip keeps whatever the last laid-out paint decided.
       */
      if (rect.height > 0) {
        /*
         * Absent from the document rather than hidden in it: `viewportGates.browser.test.ts`
         * measures every control the DOM holds, and a hidden chip is a zero-sized control to it.
         */
        const offered = stageCameraChipsOf(recording.floors, rect.height).length > 0;
        if (offered && cameras.childElementCount === 0) cameras.replaceChildren(...cameraButtons);
        if (!offered && cameras.childElementCount > 0) cameras.replaceChildren();
        /*
         * The select's options are rebuilt only when the floor set they were built from changes —
         * a new recording, not a new frame — so a mid-shift repaint never resets the control an
         * unrelated player interaction is mid-way through. `stageFloorJumpOptionsOf` is offered
         * under the same gate `stageCameraChipsOf` is, so the two controls appear and disappear
         * together.
         */
        if (recording.floors !== floorJumpBuiltFor || offered !== floorJump.isConnected) {
          floorJumpBuiltFor = recording.floors;
          const options = stageFloorJumpOptionsOf(recording.floors, rect.height);
          if (options.length > 0) {
            const placeholder = el(doc, 'option', undefined, STAGE_FLOOR_JUMP_PLACEHOLDER);
            placeholder.value = '';
            placeholder.disabled = true;
            placeholder.selected = true;
            const entries = options.map((option) => {
              const entry = el(doc, 'option', undefined, option.label);
              entry.value = option.floorId;
              return entry;
            });
            floorJump.replaceChildren(placeholder, ...entries);
            if (!floorJump.isConnected) cameras.after(floorJump);
          } else {
            floorJump.replaceChildren();
            floorJump.remove();
          }
          /* A rebuilt select has forgotten any floor a player had jumped to. */
          if (camera === 'floor') {
            camera = 'whole';
            targetFloorId = undefined;
            syncCamera();
          }
        }
      }
      drawCutaway(ctx, {
        recording,
        frame,
        queues: queueAt(recording, simTimeS),
        geometry: stageGeometryOf({
          width: rect.width,
          height: rect.height,
          floors: recording.floors,
          shafts: recording.shafts,
          outOfServiceCarIds: recording.outOfServiceCarIds,
          window: stageCameraWindowOf({
            camera,
            floors: recording.floors,
            height: rect.height,
            cars: frame.cars,
            targetFloorId,
          }),
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
      ...(pressChangedNobody === undefined ? {} : { pressChangedNobody }),
      ...(handoverVerdict === undefined ? {} : { handoverVerdict }),
    });
    /* Wave AS, lane AS-1: a rush stamps in held time, the header's clock (`rush.ts#rushInterventionStampOf`). */
    const stamp =
      context.ctx === 'rush' ? rushInterventionStampOf(host.interventions(), simTimeS, recording.startedAt) : intervention.stamp;
    /* Written only when the stamp changes — {@link stampSaid}, `AX-3`. */
    if (stamp !== stampSaid) {
      interventionStamp.textContent = stamp;
      stampSaid = stamp;
    }
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
    /*
     * § D1029: before a pinned day's call is answered, the parking presses and the handover are
     * held — the call is where the day's press is made, and a press or a switch before it would be
     * a day nobody measured. Composed after the shared refusal, which still wins.
     */
    const refusal = sharedRefusalOf(intervention, watching) ?? callHeld();
    for (const button of interventionButtons) button.disabled = refusal !== undefined;
    /*
     * The handover arm has a refusal of its own — a hand-over to the vector already driving moves
     * nothing — and it is drawn beside the control rather than in the shared line, because the park
     * arm next to it is still pressable in that state. The whole-control refusal above still wins:
     * a filed day cannot be handed to anybody either.
     */
    applySwitchRow(intervention, refusal);
    applyParkingRows(intervention);

    drawRace(recording, simTimeS);
    syncDock();
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
   * **End the day, where the day is already lost** — [§ D1168](../../../../DECISIONS.md). A scored
   * day's own run, not a watched one, and not once it has run out: from the rail's own readings at
   * this playhead, the control appears when the queue or the worst-wait goal reads missed, and its
   * note names that goal. Nothing after the playhead is read.
   */
  function drawEndDay(recording: VizRecording, simTimeS: number, watching: WatchingView | undefined): void {
    const view =
      context.ctx === 'daily' &&
      watching === undefined &&
      playback?.state !== 'ended' &&
      simTimeS < recording.endedAt &&
      /* A pinned day's call still standing is § D1029's to answer first; the control waits for it. */
      activeCall()?.pinned !== true
        ? stageEndDayOf(host.goalsAt(simTimeS))
        : undefined;
    if (view === undefined) {
      if (endDayButton.style.display !== 'none') endDayButton.style.display = 'none';
      return;
    }
    if (endDayButton.textContent !== view.label) endDayButton.textContent = view.label;
    if (endDayButton.title !== view.note) endDayButton.title = view.note;
    if (endDayButton.style.display === 'none') {
      endDayButton.style.cssText = [
        'background:transparent',
        `border:1px solid ${C.rule}`,
        `border-radius:${String(R.control)}px`,
        'padding:5px 9px',
        `font:500 11px ${TYPE.mono}`,
        `color:${C.ink}`,
        'cursor:pointer',
      ].join(';');
    }
  }

  /**
   * *End the day* pressed — [§ D1168](../../../../DECISIONS.md). Checked again at the press, from the
   * same readings, so a stale button files nothing; then the host keeps the instant for the report's
   * row and stops the day's calls, the playhead goes to the recording's end, and the day is filed
   * exactly as the stage's own primary files it.
   */
  /**
   * File the day and open what the filing lands on — the tail of the stage's primary, shared with
   * *End the day* so the two cannot file differently.
   */
  /**
   * Put the close's question up under the call, and focus *Back to the call* — see the primary.
   * Wave AM, lane AM-B, [§ D1239](../../../../DECISIONS.md), amending [§ D1189](../../../../DECISIONS.md)'s
   * *focus moves to the first*: with focus on *Close the day as it stands*, two presses of `Enter`
   * ended a scored day with its call unanswered (the post-AL panel's seat B). The safe button takes
   * focus, so closing takes a deliberate second choice.
   */
  function askBeforeClosing(): void {
    skipAsk.hidden = true;
    closeAsk.hidden = false;
    closeAsk.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    closeAskBack.focus({ preventScroll: true });
  }

  /**
   * Put the skip's question up under the call, and focus *Back to the call* — {@link askBeforeClosing}'s
   * twin, § D1324. The card is drawn first where the frame has not drawn it yet, so the question is
   * never asked inside a card nobody can see; the transport stops at the call as the pace stops it.
   */
  function askBeforeSkipping(simTimeS: number): void {
    playback?.pause();
    if (callCard.hidden) drawCall(simTimeS);
    closeAsk.hidden = true;
    skipAsk.hidden = false;
    skipAsk.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    skipAskBack.focus({ preventScroll: true });
    syncTransport();
    requestFrame();
  }

  function fileDay(): void {
    closeAsk.hidden = true;
    skipAsk.hidden = true;
    playback?.pause();
    host.closeDay();
    syncTransport();
    const landing = stageFilingLandsOn(context.ctx, {
      dayClosed: host.runState().dayClosed,
      hasReport: host.lastReport() !== undefined,
    });
    if (landing !== undefined) context.go(landing);
  }

  function endTheDay(): void {
    const recording = adopted;
    if (playback === undefined || recording === undefined || context.ctx !== 'daily') return;
    if (activeCall()?.pinned === true) return;
    const atS = playback.simTimeS;
    if (stageEndDayOf(host.goalsAt(atS)) === undefined) return;
    started = true;
    skipping = false;
    waitingOnCall = false;
    /* § D1446: the player has ended the day, so the run out to its end stops on no card. */
    lostCardShown = true;
    showCallCard(false);
    host.endDayEarly(atS);
    playback.play();
    playback.seekTo(recording.endedAt);
    syncTransport();
    requestFrame();
    fileDay();
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
  function drawGoals(
    recording: VizRecording,
    simTimeS: number,
    watching: WatchingView | undefined,
  ): void {
    /*
     * **Down while watching**, on § 14.1's own ground: *"a spectator who could intervene would be
     * playing, not watching"*, and a spectator whose screen graded the record against **their** day
     * would be doing the reading half of the same thing. The bars are the player's week — they
     * harden with `WeekState.day` — and the run on the stage belongs to somebody else, so a strip
     * headed *what today asks* over it is a claim about a day that is not the one being watched.
     * The record's own posted result is drawn instead, by {@link drawWatching}, with the note that
     * says which figures are which.
     */
    if (watching !== undefined) {
      goals.style.display = 'none';
      return;
    }
    const week = host.week();
    const strip = stageGoalsOf({
      readings: host.goalsAt(simTimeS),
      /*
       * The fold those readings were graded against, at the same instant — GitHub issue #456. Taken
       * from the host rather than folded here: two folds of one recording at one playhead is the
       * failure `shift/observations.ts` has a rule about, and this screen already refuses to
       * re-derive the readings for exactly that reason two lines up.
       */
      observations: host.goalFactsAt(simTimeS),
      simTimeS,
      endedAt: recording.endedAt,
      history: week.history,
      day: week.day,
      /* The screen's own flow, never the recording's — GitHub issue #567. */
      contract: context.ctx === 'campaign',
      /* § D1543: a career day leads with the contract's four, the tower's own, at its day. */
      contractGoals: careerTowerGoals(),
    });
    goals.style.display = 'flex';
    goalHeading.textContent = strip.heading;
    goalContract.textContent = strip.contract;
    goalContract.style.display = strip.contract === '' ? 'none' : '';
    goalNote.textContent = strip.note;
    drawGoalRows(goalRows, strip.rows);
    const folded = strip.secondary;
    goalWeek.style.display = folded === undefined ? 'none' : 'block';
    if (folded !== undefined) {
      if (goalWeekSummary.textContent !== folded.heading) goalWeekSummary.textContent = folded.heading;
      if (goalWeekNote.textContent !== folded.note) goalWeekNote.textContent = folded.note;
      drawGoalRows(goalWeekRows, folded.rows);
    }
  }

  /** The open career tower's four tests, headed as the desk heads them, or `undefined` off a career day. */
  function careerTowerGoals(): { readonly heading: string; readonly goals: ReturnType<typeof campaignTestGoals> } | undefined {
    if (context.ctx !== 'campaign') return undefined;
    const tower = host.campaignDay()?.tower;
    if (tower === undefined) return undefined;
    return { heading: contractAsksEyebrow(tower.day), goals: campaignTestGoals(DIFFICULTIES[tower.difficultyId]) };
  }

  function drawGoalRows(goalRows: HTMLElement, rows: readonly StageGoalRow[]): void {
    goalRows.replaceChildren();
    for (const row of rows) {
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

      /*
       * The riders who were left standing — § D106 at the renderer, GitHub issue #456.
       *
       * Between the claim and the track, in the *was* slot's faint ink and never in `ink`: the
       * verdict's colour on this line would make the count read as part of the verdict, and it is
       * an observation beside one. Appended only where there is one, so no row grows a blank line
       * about a population it does not have.
       */
      if (row.beside !== '') {
        const beside = el(doc, 'span', 'everyday-stage-goal-beside', row.beside);
        beside.style.cssText = `font:500 10px ${TYPE.mono};color:${C.faint};min-width:0`;
        line.append(top, beside, track);
        goalRows.append(line);
        continue;
      }

      line.append(top, track);
      goalRows.append(line);
    }
  }

  function drawFigures(list: readonly StageFigure[], tones: readonly StageFigureTone[] = []): void {
    figures.replaceChildren();
    for (const [index, figure] of list.entries()) {
      const box = el(doc, 'div', 'everyday-stage-figure');
      box.style.cssText = 'display:flex;flex-direction:column;gap:1px';
      const label = el(doc, 'span', undefined, figure.label);
      label.style.cssText = EYEBROW;
      const value = el(doc, 'span', 'everyday-stage-figure-value', figure.value);
      /*
       * § D1381: the live accent while the day runs, the goal row's own verdict once it has run out,
       * so a passing reading at 18:00 is not drawn in the red family beside a met goal.
       */
      const tone = tones[index] ?? (figure.refusal === undefined ? 'live' : 'still');
      value.dataset['tone'] = tone;
      value.style.cssText = `font:500 16px ${TYPE.mono};color:${figure.refusal !== undefined ? C.faint : FIGURE_INK[tone]}`;
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
    const race = host.ghostRace();
    /*
     * **§ 14.1, and in the key rather than only after it.** `raceSlotsOf` reads this now — a
     * spectator's three cells are not the player's — so a key that watched only the clock and the
     * rival would leave the *nobody* pick's *"just your day"* under a stranger's lanes until the
     * playhead next crossed a four-minute boundary. It is the same lesson `drawWatching` records one
     * screen over, arriving through the redraw key instead of through a missed clause.
     */
    const watching = watchingNow() !== undefined;
    const grid = Math.floor((simTimeS - recording.startedAt) / RACE_SAMPLE_INTERVAL_S);
    /*
     * The rival is part of the key, not only the grid line — GitHub issue #226, § D482. A second
     * recording lands between grid crossings (it is a worker result, not a playhead event), and a
     * key that watched only the clock would leave the grey line off the lanes until the playhead
     * next crossed a four-minute boundary. `runId` is not enough on its own either: the *nobody*
     * pick and a refusal both have none, and the two say different things in the verdict slot.
     */
    const key = [
      String(grid),
      race.pick,
      race.rival?.runId ?? '',
      race.refusal ?? '',
      race.pending ? 'pending' : '',
      watching ? 'watching' : '',
    ].join('|');
    if (key !== raceKeyDrawn || raceView === undefined) {
      raceKeyDrawn = key;
      raceView = raceStripViewOf({ recording, ghost: race.rival, simTimeS });
      /*
       * **One x-axis for both lines**, so they align instant for instant: the longer of the two
       * spans. `endedAt` is an outcome rather than a schedule, so two runs of one crowd may
       * legitimately end at different moments — `dev/main.ts`'s strip takes the same maximum, and
       * scaling each line to its own end would draw a rival that finished sooner as if it had been
       * slower everywhere.
       */
      const spanEndS = Math.max(recording.endedAt, race.rival?.endedAt ?? recording.endedAt);
      const wait = raceLaneOf(
        raceView.yours,
        raceView.ghost,
        (sample) => sample.standingWaitS,
        LANE_BOX,
        spanEndS,
        LANE_MARK_S,
      );
      const standing = raceLaneOf(
        raceView.yours,
        raceView.ghost,
        (sample) => sample.standing,
        LANE_BOX,
        spanEndS,
        Math.max(1, ...raceView.yours.map((sample) => sample.standing)),
      );
      laneWait.line.setAttribute('points', wait.you);
      laneWait.ghost.setAttribute('points', wait.ghost);
      laneWait.mark.setAttribute('y1', String(wait.markY));
      laneWait.mark.setAttribute('y2', String(wait.markY));
      laneStanding.line.setAttribute('points', standing.you);
      laneStanding.ghost.setAttribute('points', standing.ghost);
      laneStanding.mark.setAttribute('y1', String(standing.markY));
      laneStanding.mark.setAttribute('y2', String(standing.markY));
      raceFooter.textContent = raceView.footer;
      /*
       * The note and the key's name, from `raceSlotsOf` — the same derivation the Engineer strip
       * fills its slots from, so the two surfaces cannot disagree about whether a rival is drawn.
       * `slots.rivalName` is `''` unless a line is actually on the lanes, which is what makes the
       * key an attribution rather than a label: a name beside no line, or beside the wrong one, is
       * the incoherence issue #269 is about.
       */
      const slots = raceSlotsOf(
        raceView,
        {
          pick: race.pick,
          recording: race.rival,
          refusal: race.refusal,
          pending: race.pending,
          watching,
          watchingOwn: watchingNow()?.owner === 'player',
        },
        recording,
      );
      raceNote.textContent = slots.note;
      raceKey.textContent = slots.rivalName === '' ? '' : `— — ${slots.rivalName}`;
      raceSlotVerdict = slots.verdict;
    }
    /*
     * **§ 14.1's picker, all of it in one place.** *"§ 7.6's intervention machinery is disabled while
     * watching. A spectator who could intervene would be playing, not watching"* — and a spectator
     * who could commission a second run would be commissioning it against somebody else's crowd.
     *
     * **Disabled is necessary and was never sufficient**, which is the finding rather than a detail:
     * a disabled `<select>` still renders its options, so greying this control left `your latest
     * saved` on screen beside a stranger's day and the browser tier's § 14.1 sweep caught it. What
     * the control *presents* is `writeRaceOptions`' job; this is what it *does*.
     *
     * The `title` is gone in the spectator arm rather than rewritten. It held the reason, where a
     * touch device never shows it and a pointer rarely does; the reason is drawn text now, under the
     * lanes, from the note both strips share. An attribute nobody reads is not a declaration.
     *
     * It is outside the keyed block because entering and leaving a watch moves neither the grid line
     * nor the rival, so a key-gated write would leave the control enabled over a watch that had just
     * started. That is `drawWatching`'s own lesson one screen over: a treatment applied by six
     * independently-guarded clauses is six chances for one of them to stay behind. (The *note* is
     * key-gated and correct, because `watching` is now part of the key above.)
     *
     * The transport is deliberately untouched: pause and the speed chips are not interventions.
     */
    writeRaceOptions(watching);
    const shows = watching ? 'none' : race.pick;
    if (racePicker.value !== shows) racePicker.value = shows;
    racePicker.disabled = watching;
    racePicker.title = watching
      ? ''
      : (GHOST_OPTIONS.find((option) => option.id === race.pick)?.note ?? '');
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
    /*
     * The slot at the playhead rather than at the last grid line — the post-AI panel's seat D, D7:
     * the header read 10 standing and this read 6 on one paused frame. See `raceVerdictSlotAt`.
     */
    const liveVerdict = raceVerdictSlotAt(
      { verdict: raceSlotVerdict, note: '', rivalName: '' },
      { pick: race.pick, recording: race.rival, refusal: race.refusal, pending: race.pending, watching },
      recording,
      simTimeS,
    );
    raceVerdict.textContent = watchingNow()?.eyebrow ?? liveVerdict;
  }

  /* ------------------------------------------------------------------ wire */

  /*
   * § 7.4's picker, pressed — GitHub issue #226, § D482.
   *
   * **This is the whole of the wire, and it is deliberately one call.** The pick is validated
   * against `GHOST_OPTIONS` and handed to the host, which presses `dev/main.ts#setGhostPick` — the
   * same function the Engineer strip's own `<select>` calls, which issues the second request through
   * the same worker. Nothing about *who the rival is* or *whether that rival can honestly be run* is
   * decided here; a screen that answered either would be the second answer this façade exists to
   * prevent. The lanes redraw on the host's notification, not from this handler, so a request that
   * refuses and one that lands arrive by the same route.
   */
  racePicker.addEventListener('change', () => {
    const value = racePicker.value;
    host.raceAgainst(
      GHOST_OPTIONS.some((option) => option.id === value) ? (value as GhostPick) : 'none',
    );
  });

  const unsubscribe = host.subscribe(onHostChange);
  const onResize = (): void => {
    syncRushCompact();
    syncHeaderStick();
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
  /* GitHub issue #548 — latched *before* the press below, which is the press that makes it stale. */
  if (context.ctx !== 'watch') standingAtEntry = host.recording();
  /*
   * **Not while the day asked for is still coming, and a career day by the career's own press** —
   * GitHub issue #594. From fresh storage the boot run is nobody's choice, so a career day's stage
   * arrived here with `open` false and pressed `host.startRun()` over the career run already in
   * flight: that press is § 6's, it disarms the career latch by design, and the career day was then
   * filed into the Scenario week as a Monday nobody played. A pending run is the day the player
   * pressed for, so the mount waits for it; and in the campaign context the re-press, when one is
   * due, is `runCampaignDay` for the latched tower, which is the only press that files to a career.
   */
  const pressTheDay = (): void => {
    const careerDay = context.ctx === 'campaign' ? host.campaignDay() : undefined;
    if (careerDay !== undefined) host.runCampaignDay(careerDay.tower.id);
    /* § D1218: the daily day's own press resumes an attempt standing on it rather than rewinding it. */
    else if (context.ctx === 'daily') host.playDay();
    else if (context.ctx !== 'campaign') host.startRun();
  };
  if (context.ctx !== 'watch' && context.ctx !== 'rush' && !host.runPending() && stageEntryStartsARun(host.runState())) pressTheDay();
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
      if (pendingSay !== undefined) view?.clearTimeout(pendingSay);
      pendingSay = undefined;
      if (rushLossTimer !== undefined) view?.clearTimeout(rushLossTimer);
      rushLossTimer = undefined;
      if (pendingFrame !== undefined && view !== null && view !== undefined) {
        view.cancelAnimationFrame(pendingFrame);
      }
      pendingFrame = undefined;
      view?.removeEventListener('resize', onResize);
      doc.removeEventListener('keydown', onRushEntryKey);
      unsubscribe();
      playback = undefined;
      adopted = undefined;
      /* The graph and its context go with the mount — GitHub issue #258. */
      audioSink?.close();
      audioSink = undefined;
      audioBefore = undefined;
      audioCrossover = undefined;
      audioState = NO_AUDIO_YET;
      /*
       * {@link watchFacts} is module state and outlives this mount, so it is cleared here rather
       * than left for the next one to overwrite: a refusal about somebody else's record, still
       * standing on the § 3.3 row of a player's own stage, is § D227's stale refusal in the one
       * place a player would believe it.
       */
      watchFacts.hasReplay = false;
      watchFacts.playRefusal = undefined;
      watchFacts.owner = undefined;
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
       * § D1361: while another tab holds this day's attempt, § 3.3's primary reads *Continue ⟨day⟩
       * here* with the note that says what it does, so this press is the player's takeover. The run
       * it lands is the attempt as last saved, re-simulated, and lets this stage's hold go.
       */
      if (barFacts.held !== undefined && context.ctx === 'daily') {
        host.playDay({ takeOver: barFacts.held.kind === 'elsewhere' });
        syncTransport();
        return;
      }
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
      /*
       * § 9.2's *End the rush*, asked once (wave AQ, lane AQ-3): the first press pauses the climb and
       * puts {@link endAsk} under the header with focus on *Keep playing*; a second press ends it.
       */
      if (context.ctx === 'rush') {
        /* Wave AS, lane AS-1: during the loss's hold the round has ended; the press goes on to the result. */
        if (rushLossLine !== undefined) {
          goToRushResult();
          return;
        }
        if (endAsk.hidden && adopted !== undefined) {
          endAskResume = playback?.state === 'playing';
          playback?.pause();
          endAsk.hidden = false;
          syncTransport();
          endAskBack.focus({ preventScroll: false });
          return;
        }
        endRushNow();
        return;
      }
      /*
       * **A call is up: ask once before filing** — wave AL, lane AL-A, the post-AK panel's seat B
       * (D1). The first press puts {@link closeAsk}'s question under the card's answers and moves
       * focus to *Back to the call* (§ D1239); a second press of this primary, or *Close the day as
       * it stands*, files. Nothing is
       * asked with no card up, because then there is no answer to skip.
       */
      if (!callCard.hidden && closeAsk.hidden) {
        askBeforeClosing();
        return;
      }
      fileDay();
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

/**
 * **The stage contexts that ask the day's calls** — the daily stage since § D1138, and a career day
 * since wave AO, lane DS-2 ([§ D1408](../../../../DECISIONS.md)). Which career days ask is the host's
 * (`everyday/careerCalls.ts#careerDayCallsOf`: a day with an event), so an ordinary career day still
 * meets no card; a watch, a rush and a fix case never ask. Pure and exported for
 * `stageScreen.test.ts`; its non-test callers are {@link mountStage}'s `activeCall` and its call rows.
 */
export function dayCallsAskedIn(ctx: RunContext): boolean {
  return ctx === 'daily' || ctx === 'campaign';
}

/**
 * **The stage contexts paced as a scored day** ([§ D1169](../../../../DECISIONS.md)): fast while nobody
 * on a landing has waited a minute, the player's rung while somebody has. The daily stage since
 * § D1169, and a career day since wave AQ, lane AQ-2 ([§ D1507](../../../../DECISIONS.md)): Garden
 * Apartments' day 1 opened on eighteen simulated minutes of empty landings, four and a half real
 * minutes at `4×`, under *nobody has called a lift yet*. A watch, a rush and a fix case play at the
 * player's rung. Pure and exported for `stageScreen.test.ts`; its non-test caller is
 * {@link mountStage}'s `adopt`.
 */
export function scoredPaceIn(ctx: RunContext): boolean {
  return ctx === 'daily' || ctx === 'campaign';
}

/** One lane of § 7.4's strip: a caption, a dashed marker and your line. */
function laneBlock(
  doc: Document,
  caption: string,
): {
  readonly block: HTMLElement;
  readonly line: SVGPolylineElement;
  /** The rival's line — `''` whenever no rival is drawn. */
  readonly ghost: SVGPolylineElement;
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
  /*
   * The rival, **under** the player's line and in a quieter ink — § 7.4's grey line. Appended first
   * so yours is never occluded where the two cross, which is the frame in which the race is at its
   * most interesting and the one an equal `z` would draw arbitrarily.
   */
  const ghost = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  ghost.setAttribute('class', 'everyday-stage-lane-ghost');
  ghost.setAttribute('fill', 'none');
  ghost.setAttribute('stroke', C.warmGrey);
  ghost.setAttribute('stroke-width', '1.5');
  ghost.setAttribute('stroke-dasharray', '3 3');
  ghost.setAttribute('vector-effect', 'non-scaling-stroke');
  ghost.setAttribute('points', '');
  const line = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('class', 'everyday-stage-lane-you');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', C.terracotta);
  line.setAttribute('stroke-width', '2');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  line.setAttribute('points', '');
  svg.append(mark, ghost, line);
  block.append(label, svg);
  return { block, line, ghost, mark };
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
  /* § 3.3's rush row is its own: one primary, *End the rush*, live once the stream has landed. */
  if (state.ctx === 'rush') {
    const base = actionBarFor(state);
    return barFacts.hasRun ? base : { ...base, primary: { ...base.primary, inert: RUSH_NOT_LANDED } };
  }
  return stageBarModelOf(state, barFacts);
}

/** The registry row — GAMEPLAY § 7's screen, mounted by `shell.ts` through `screens.ts`. */
export const STAGE_SCREEN: EverydayScreenModule = {
  key: 'stage',
  mount: mountStage,
  bar: stageBar,
};
