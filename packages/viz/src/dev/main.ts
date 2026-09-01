/**
 * The shell: the shipped, non-test caller of everything this package exports.
 *
 * The roadmap's standing requirement is that a behaviour must name a caller which is not one of its
 * own tests. This file is that caller. Every directory added by the design refactor is reached from
 * here, and the table below is the answer to *"name the non-test caller"* for each of them:
 *
 * | Module | Reached from |
 * |---|---|
 * | `live/bands.ts`, `observations.ts`, `honesty.ts`, `decisions.ts` | `dev/leftRail.ts`, mounted below — and, for `WAIT_BANDS`' four `legendLabel`s, {@link waitLegendEntries} |
 * | `live/timeline.ts` | {@link drawTransport} and the header clock |
 * | `shift/contracts.ts`, `week.ts`, `goals.ts`, `events.ts`, `growth.ts` | `dev/state.ts`'s `shiftRunConfigOf`, called by {@link runShift} |
 * | `shift/report.ts` | {@link closeShift}, and `dev/reportPanel.ts` |
 * | `authoring/*` | the four editor mounts, and `shiftRunConfigOf` |
 * | `record/decisionLog.ts` | `recordRun` — called by `dev/shiftWorker.ts` for the shift, and directly by {@link runChallenge} for a challenge's seeds |
 * | `dev/shiftRunner.ts`, `dev/shiftWorker.ts` | {@link runShift} and {@link verifyCurrent}, which no longer simulate on this thread |
 * | `dev/offThreadRuns.ts` | `dev/fixitPanel.ts` and `dev/watchPanel.ts`, both handed {@link boot}'s one `spawnRunWorker` — GitHub issue #165 |
 * | `dev/surfaces.ts` | {@link applyNavigation} |
 * | `frame/overlay.ts` | {@link drawStage} and the landing selector |
 * | `record/document.ts` | **Load recording**, **Save recording** and **Verify replay** |
 * | `dev/bootstrap.ts` | {@link main}, the only thing that loads `data/` — `RV-17`/`RV-21` |
 * | `dev/motion.ts` | {@link adopt}, which asks whether a new recording may start moving — `KB-14` |
 *
 * ## Two render paths, and why there are two
 *
 * `renderAll` redraws every panel and runs when the **state** changes — a click, an edit, a new
 * recording. `renderLive` redraws only what the **playhead** moves: the stage, the transport, the
 * header clock and the left rail. Sixty times a second.
 *
 * One path would be simpler and wrong in one of two ways. Redrawing everything at 60 Hz rebuilds
 * eleven panels' DOM per frame and churns the accessibility tree; redrawing only on state change
 * leaves the rail frozen while the building fills up, which is the one thing the rail exists to
 * show. The split is the cheap correct answer, and `dom.ts`'s writes are all guarded on *changed*,
 * so a live redraw that finds nothing moved touches nothing.
 *
 * ## What this file does not decide
 *
 * What a run is. That is `dev/state.ts`'s `shiftRunConfigOf`, for the reason `dev/runConfig.ts`
 * existed before it: a decision made inside a click handler needs a document, a canvas and a click
 * to reach, so it cannot be tested and it drifts.
 */

import {
  SimulationError,
  type BuildingConfig,
  type RunInterventionConfig,
} from '@elevator-sim/core/browser';

import {
  provideEngineerSettings,
  type EngineerSettingsBridge,
} from '../everyday/engineerBridge.js';
import { createEverydayHost, EVERYDAY_HOST, type EverydayHostBindings } from '../everyday/host.js';
import { everydaySwap, onEverydaySwapProvided } from '../everyday/swap.js';
import {
  ENGINEER_RETURN_LABEL,
  ENGINEER_RETURN_TITLE,
  EVERYDAY_ROOT_CLASS,
} from '../everyday/types.js';
import type { AccountForm } from '../menu/account.js';
import {
  SIGNED_OUT,
  formIssues,
  linkRequested,
  linkRetryInMsOf,
  namingStage,
  pending,
  postingRefusal,
  rateLimited,
  retryAllowed,
  signedIn,
  signedOut,
  updateForm,
  withNotice,
  type AccountState,
} from '../menu/account.js';
import { catalogueOf } from '../menu/catalogue.js';
import {
  challengeNotOpenOf,
  challengeRunConfigs,
  challengeSubmissionOf,
} from '../menu/challenge.js';
import {
  claimedMetricsOf,
  createClient,
  fetchTransport,
  type LeaderboardClient,
} from '../menu/client.js';
import {
  FREE_PLAY_RATES,
  initialMenuState,
  isSeedText,
  navigate,
  SEED_MAX_DIGITS,
} from '../menu/menu.js';
import { partById, partIdOf, partsOfDay } from '../menu/partsOfDay.js';
import { enterEndless } from '../menu/enterEndless.js';
import { enterFreePlay } from '../menu/enterFreePlay.js';
import {
  applyIntent,
  type ChallengeScreenInput,
  type CommissioningScreenInput,
  type MenuIntent,
} from '../menu/screens.js';
import {
  CALENDAR_PERIODS,
  periodOnDays,
  scheduledEventFor,
  type CalendarPeriod,
  type CalendarPeriodId,
} from '../shift/calendar.js';
import { asBuiltChoices, shaftChoices, speedChoices, withBankChoice } from '../commissioning/choices.js';
import { CONSTRAINTS, commissionableClasses, constraintById } from '../commissioning/types.js';
import { reviewCommissioning } from '../commissioning/refusals.js';
import type { DayPart, MenuState } from '../menu/types.js';
import { renderMenu, type LeaderboardView, type MenuPanelHost } from './menuPanel.js';
import { credentialCapabilityOf } from '../access/dispatcherCredentials.js';
import { lockedOutLandingsAt, type LockedOutLanding } from '../access/lockedOut.js';
import { restrictedFloorIds } from '../access/zoning.js';
import type { VizFloor, VizRecording } from '../contract/types.js';
import {
  landingAssignmentsAt,
  meansAreSuppressed,
  overlayAt,
  queueAt,
  type LandingAssignment,
} from '../frame/overlay.js';
import { WAIT_BANDS, waitBandsAt } from '../live/bands.js';
import { observationsAt } from '../live/observations.js';
import type { WaitBandDefinition, WaitBands } from '../live/types.js';
import {
  interventionStampOf,
  PARK_CARS_LOBBY_LABEL,
  RECOMPUTING_BEAT,
  SWITCH_PINS_NOTE,
  switchDispatcherLabelOf,
} from '../live/interventions.js';
import { patternReadoutAt } from '../live/patternReadout.js';
import {
  GHOST_OPTIONS,
  RACE_NOT_RUN,
  RACE_PENDING,
  RACE_SAMPLE_INTERVAL_S,
  raceLaneOf,
  raceStripViewOf,
  type GhostPick,
} from '../live/raceStrip.js';
import {
  clockAt,
  DAY_START_S,
  phaseAt,
  playheadPctOf,
  tickLabelsOf,
  timeOfDayAt,
  timelineOf,
} from '../live/timeline.js';
import { systemClock } from '../playback/clock.js';
import { Playback } from '../playback/playback.js';
import { readRecordingDocument, verifyReplay, writeRecordingDocument } from '../record/document.js';
import { recordRun } from '../record/recordRun.js';
import {
  DEFAULT_THEME,
  drawScene,
  type Canvas2DLike,
  type CarBadgeHit,
  type SceneSelection,
  type Theme,
} from '../render/canvas.js';
import { describeFrame } from '../render/describeFrame.js';
import { overlayViewOf, type OverlayView } from '../render/overlay.js';
import { buildLayout, type Layout, type ShaftGeometry } from '../render/layout.js';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  NO_SHEET_YET,
  drawReportCard,
  reportCardOf,
} from '../render/reportCard.js';
import { AWT_ID, WT95_ID } from '../render/runSummary.js';
import { disclosureItems } from '../mode/disclosure.js';
import { parityRefusal } from '../mode/parity.js';
import { isViewMode, itemsIn, type DisclosureItem, type ViewMode } from '../mode/types.js';
import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import { runIdentityIssues } from '../scope/runIdentity.js';
import { demandFromSpec, specFromTrafficProfile } from '../authoring/patternSpec.js';
import { contractById, statLineOf } from '../shift/contracts.js';
import { bankingRefusalFor, UNCHOSEN_RUN_CANNOT_BANK } from '../shift/banking.js';
import { shiftObservationsOf } from '../shift/observations.js';
import { readGoals } from '../shift/goals.js';
import { dayReportOf, type DayReportInput, type ShapedDayReport } from '../shift/report.js';
import { HISTORY_DAYS, outcomeOf } from '../shift/week.js';
import { tomorrowBriefingOf, type TomorrowBriefing } from '../shift/tomorrow.js';
import { coachWeekLines, weekKeptLine } from '../shift/weekLabel.js';
import { weekdayOf, type DayOutcome, type WeekState } from '../shift/types.js';

import { mountBatchPanel } from './batchPanel.js';
import { mountSuitePanel } from './suitePanel.js';
import { mountCampaignPanel, type CampaignPanelHandle } from './campaignPanel.js';
import { createLoader } from './bootstrap.js';
import {
  loadBrowserResources,
  loadCampaign,
  loadFixitCases,
  loadReferenceRuns,
  type BrowserResources,
} from './data.js';
import { mountFixitPanel } from './fixitPanel.js';
import { WATCHING_HEADER_CLASS, mountWatchPanel } from './watchPanel.js';
import { chip, el, fill, fillSelect, keyedFill, setHidden, setText } from './dom.js';
import {
  ELEMENT_IDS,
  MissingElementsError,
  isRailSegment,
  isTabName,
  resolveElements,
  type Elements,
  type RailSegment,
  type TabName,
} from './elementMap.js';
import { mountEditor } from './editor.js';
import { mountBuildingEditor } from './buildingEditor.js';
import { mountDispatcherEditor } from './dispatcherEditor.js';
import { mountRuleEditor } from './ruleEditor.js';
import { mountSelectorEditor } from './selectorEditor.js';
import { mountLeftRail, shiftGoalsOf } from './leftRail.js';
import { mountMachinesEditor } from './machinesEditor.js';
import { APPLIED_SCHEMA, mountParameterForm, patienceFromCandidate } from './parameterForm.js';
import { mountReport, runProgressOf } from './reportPanel.js';
import { mountRightRail } from './rightRail.js';
import { mountScenarios } from './scenariosPanel.js';
import { mountTrafficEditor } from './trafficEditor.js';
import { playbackRateFor, shouldAutoplayWith } from './motion.js';
import { themeFor } from '../render/theme.js';
import { libraryNoticeFor, restoreNoticeFor, saveNoticeFor } from '../persist/notice.js';
import {
  clearSession,
  loadLibrary,
  loadSession,
  patchMovesTheWeek,
  patchTouchesLibrary,
  saveSession,
} from '../persist/session.js';
import type { SessionStore } from '../persist/types.js';
import type { MountContext, Panel, UnfiledSheetFacts, ViewAt } from './mountTypes.js';
import {
  allBuildingIds,
  allDispatchers,
  buildingConfigOf,
  shiftDemandTemplateId,
  shiftSubmittedSelection,
  closedWeekOf,
  specsWithSaved,
  buildingNameOf,
  disclosureOf,
  drivingProfileOf,
  initialState,
  profileById,
  resolvedBuildingOf,
  shiftRunConfigOf,
  tomorrowFactsOf,
  weeksForSession,
  withBuilding,
  type PatternSelection,
  type ShiftRunConfig,
  type ViewerState,
} from './state.js';
import { ghostPlanOf, plainBaselineOf } from './ghostRun.js';
import { recordRefusalFor, watchRecordOf } from '../watch/record.js';
import type { WatchableRun } from '../watch/types.js';
import type { WatchingView } from '../watch/view.js';
import {
  PLAYER_SHELL_COPY,
  footerSeedLineOf,
  shellWatchingCopyOf,
} from '../watch/shell.js';
import { watchingStateOf } from '../watch/session.js';
import {
  createShiftRunner,
  shiftRunCostOf,
  type ShiftRunCost,
} from './shiftRunner.js';
import {
  DRAWER_BREAKPOINT_PX,
  applyDrawerState,
  applyRailState,
  applySurfaceState,
  drawerStateFor,
  escapeClosesDrawer,
  railStateFor,
  revealedTabsFrom,
  revealedTabsTo,
  segmentAfterKey,
  surfaceStateFor,
  tabAfterKey,
} from './surfaces.js';

/**
 * The playback ladder — `PB-T1`, `KB-07`.
 *
 * It reaches ×900 now and did not before, and the reason is the shift: a 1 800 s shift at ×60 is
 * thirty seconds of watching, which is right for studying a peak and wrong for getting to the end
 * of a day. The handoff's own chips are ×1 / ×10 / ×60 / ×240 / ×900 and those are the five.
 */
const SPEEDS = [1, 10, 60, 240, 900] as const;

/**
 * The chip a fresh mode opens on — ×60, the ladder's middle rung, a 1 800 s shift in thirty
 * seconds of watching. One name for a value two sites hold (`baseSpeed`'s initialiser and
 * {@link resetTransportSpeed}), so the speed a cold boot gets and the speed a mode entry restores
 * cannot drift apart.
 */
const DEFAULT_BASE_SPEED = 60;

/** Width of the right gutter, where the landing counts and the rider queues are drawn. */
const QUEUE_GUTTER_PX = 280;
/*
 * `OVERLAY_WIDTH_PX` (250) and `OVERLAY_MIN_VIEWPORT_PX` (900) used to sit here — the room the
 * live metrics panel was given inside the bitmap, and the canvas width below which `RS-03` took it
 * away. Both are gone with `docs/21` § 3.4: the panel is a DOM card under the stage, so it needs no
 * room on the canvas and it does not disappear on a narrow viewport — it **stacks**, which is what
 * RS-03 asks of controls and is more rather than less. The room the panel was holding is the
 * plot's now, which is the beneficiary § D316 named.
 */

/**
 * What the stage asks for around the plot, widest request first — GitHub issue #41.
 *
 * ## The defect: two numbers that were the same at every width and every building
 *
 * {@link QUEUE_GUTTER_PX} and a 250 px metrics panel were passed to `buildLayout` unchanged
 * whatever was being drawn, so 530 px of a canvas went to scenery whether the building had two
 * shafts or thirty-five. Measured: **Vertical City draws 27 of 35 at a 1920 px viewport** —
 * `RS-05`'s *"showing 27 of 35"* notice is doing its job and saying so, and eight shafts of a
 * building whose whole subject is its shafts are off the picture on the largest screen anybody has.
 *
 * ## Why this is a ladder rather than arithmetic
 *
 * The obvious fix computes the plot width a shaft count needs and subtracts. It would need
 * `MIN_SHAFT_WIDTH_PX` and the shaft gap, both private to `render/layout.ts`, and a copy of either
 * is a second answer to *how wide is a legible shaft* that drifts the day that file is tuned — the
 * failure this repository counts. So nothing here computes a fit: the shell **asks the layout** by
 * building one and reading `Layout.hiddenShaftCount`, which is the layout's own measurement of
 * exactly this question, already carried for the `RS-05` notice.
 *
 * The rungs yield in `fitGutters`' own order and for its stated reason. The last rung asks for
 * **nothing**, which hands the layout its own documented default rather than a floor copied from
 * it: this file never names a minimum, and `layout.ts` still clamps whatever it is handed.
 *
 * A building that fits on rung one stays on rung one, so no picture that was right moves.
 *
 * **It had a first rung that also asked for the metrics panel**, and dropping it was the ladder's
 * whole first step. `docs/21` § 3.4 moved that panel to the DOM, so the ladder is gutters only and
 * every building starts 250 px wider than it did — a shaft that was hidden at rung one can only
 * become visible.
 */
const STAGE_GUTTER_LADDER: readonly { readonly gutter: number }[] =
  Object.freeze([
    { gutter: QUEUE_GUTTER_PX },
    { gutter: Math.round(QUEUE_GUTTER_PX / 2) },
    // `gutter: 0` is *ask for nothing*, which `buildLayout` reads as its own `DEFAULTS.gutterRightPx`
    // — see the note above about never copying that number here.
    { gutter: 0 },
  ]);
/** One display frame at 60 Hz, in simulated seconds at the current speed — `KB-06`, `PB-08`. */
const FRAME_S = 1 / 60;
/** How often the live region is re-announced. Every frame would be unusable. */
const ANNOUNCE_MS = 2000;

/* ========================================================================== *
 * The wait-age legend — § 1.3 M4
 * ========================================================================== */

/** One key of the wait-age legend: a colour to draw a disc in, the words beside it, and — since
 *  the legend became a reading rather than a key — how many people are standing in it right now. */
export interface WaitLegendEntry {
  readonly label: string;
  readonly color: string;
  /**
   * People standing in this band at the playhead, or `undefined` before there is a run.
   *
   * A head count, never an estimate and never suppressible — `live/bands.ts` says so in its own
   * words, and nothing here divides anything. `undefined` is drawn as `—` rather than as `0`,
   * because *no run yet* and *nobody waiting* are two different states and the second is a result.
   */
  readonly count: number | undefined;
  /**
   * The band's own boundary, for the entry's tooltip — `0–30 s`, `30–60 s`, `60–120 s`, `120 s+`.
   *
   * It earns its place on the fourth entry, and it used to be the **only** thing holding that
   * entry honest. `WAIT_BANDS[3].legendLabel` was the handoff's word *gave up* (`:233`), and
   * `bands.ts` is explicit that the band counts **people still standing** past two minutes rather
   * than people who abandoned — that is `observationsAt(…).abandoned`, a different population on a
   * different clock. A bare label could carry that ambiguity harmlessly; a label with a *count* on
   * it is a figure, so the boundary went beside it.
   *
   * `docs/20` defect 4 then measured what the tooltip could not reach: the *bar's* own labels sat
   * beside the Day report's, six centimetres apart, under one phrase and with two different
   * numbers. The rung now reads *past two minutes* and the band *eyeing the stairs*, so the words
   * carry it too — and this stays, because a range is the thing a reader checks a count against and
   * the fourth entry is still the one that most needs checking.
   *
   * **Two numbers and a unit, deliberately, rather than a sentence.** It restates a bound the band
   * already publishes, so it cannot be false unless `WAIT_BANDS` moves, in which case it moves
   * with it — which is what makes it data rather than a claim about a run, and therefore not
   * something `honesty/`'s search has anything to be true or false about.
   */
  readonly rangeLabel: string;
}

/**
 * The legend's four entries, in ascending severity — the handoff `:230–233`.
 *
 * **Derived, never written.** Both halves of every entry already exist on `live/bands.ts`'s
 * `WAIT_BANDS`: `legendLabel` is *under 30 s* / *a minute* / *two minutes* / *past two minutes*
 * (`docs/20` defect 4 rejoined the fourth rung to that ladder), and `color`
 * is the same band palette the mood bar, the canvas and the report all read. Until this function
 * existed, `legendLabel` reached **no DOM anywhere** — four authored strings with no non-test
 * caller, which is the dead-seam shape this repository has closed eleven times — and the page drew
 * a legend title with nothing under it.
 *
 * Writing the four labels into the markup instead would have been the other failure: a fifth copy
 * of a palette whose whole point is that the rail, the stage and the report cannot disagree about
 * what amber means. So the *decision* is here and pure, and {@link legendEntryNode} is the
 * decision-free half that puts it on the page — the pattern `dom.ts` documents, and the only one
 * that is testable in a suite with no jsdom.
 */
export function waitLegendEntries(bands?: WaitBands | undefined): readonly WaitLegendEntry[] {
  return WAIT_BANDS.map((band, index) => ({
    label: band.legendLabel,
    color: band.color,
    count: bands?.counts[index]?.count,
    rangeLabel: rangeLabelOf(band),
  }));
}

/**
 * The stage's layout: the widest scenery this canvas can afford **and still draw the building**.
 *
 * GitHub issue #41. Walks {@link STAGE_GUTTER_LADDER} and takes the first rung on which no shaft is
 * hidden; falls through to the last rung when even that cannot hold them all, which is the honest
 * answer on a phone and is where `RS-05`'s *"showing 6 of 12"* notice takes over. Nothing here
 * decides how wide a shaft has to be — `Layout.hiddenShaftCount` is the layout's own measurement of
 * whether they fit, and asking it is what keeps this file free of a copy of `render/layout.ts`'s
 * private minimums.
 *
 * It took a `wantsOverlay` until `docs/21` § 3.4, because `RS-03` dropped the live-metrics panel
 * below 900 px of canvas whether or not the shafts fit. The panel is DOM now and reserves nothing
 * here, so the question is gone rather than answered.
 */
export function stageLayoutFor(options: {
  readonly width: number;
  readonly height: number;
  readonly floors: readonly VizFloor[];
  readonly shafts: readonly ShaftGeometry[];
}): Layout {
  let last: Layout | undefined;
  for (const rung of STAGE_GUTTER_LADDER) {
    const layout = buildLayout({
      ...options,
      ...(rung.gutter === 0 ? {} : { gutterRightPx: rung.gutter }),
    });
    if (layout.hiddenShaftCount === 0) return layout;
    last = layout;
  }
  /*
   * The ladder is a frozen non-empty tuple, so `last` is always assigned by the time this is
   * reached. The fallback is a `buildLayout` at the narrowest rung rather than a throw: a stage
   * that refused to draw would turn *some shafts do not fit* into *no picture at all*, which is
   * § D234's own defect.
   */
  return last ?? buildLayout(options);
}

/* ========================================================================== *
 * The transport's reading of the run — GitHub issue #71
 * ========================================================================== */

/**
 * The two figures the status strip carries, **as the reader's own mode words them**.
 *
 * ## The defect this closes
 *
 * The line was `AWT ${meanWaitS} s · WT95 ${wait95S} s`, built from `recording.summary` directly.
 * Issue #71 diffed every rendered text node between the two modes on a completed shift and found
 * that `AWT · WT95` is identical in both — one of six strings that made Casual, in the reporter's
 * words, *less* informative than Engineer for the audience it names.
 *
 * The renderings that would have fixed it already existed and already reached this file:
 * `disclosureItems` was called on every recording and its output dropped with `void itemsIn;`
 * (§ D240 § 2). So this is not a new vocabulary — it is the shipped one, mounted.
 *
 * ## Why it reads the items rather than the summary
 *
 * Because the items are what parity is checked over, and a status line derived independently could
 * disagree with the check that says the two modes agree. It also gets the **suppression** for free
 * and in one place: `mode/disclosure.ts` already replaces a refused mean with the run's own reason,
 * so this function has no `meansAreSuppressed` branch of its own to keep in step with `docs/10` R9.
 *
 * ## It carries each figure's `n`, and the honesty search is why
 *
 * The line it replaces read `AWT 13.1 s · WT95 27.4 s` and had done since it was written. Seeding it
 * into the corpus made `honesty/properties.ts` fail on it immediately, at six generated cases in
 * both modes: **an estimate with no count beside it** — R13 clause one, *"`n = 5` is not a caveat on
 * `11.3 s`; it is part of what `11.3 s` means"*. The finding is about the shipped strip rather than
 * about this function, and it had been invisible for the same reason the whole issue is: nothing on
 * this line went through the layer that classifies a figure as an estimate.
 *
 * So the count comes with the value. `Rendering.count` already holds it, in the same visual unit,
 * which is what makes this a **routing** change rather than a new claim: the figure, its window and
 * its `n` were all sitting in the item the shell was throwing away.
 *
 * `undefined` — never an empty string — when there is no run or the items carry neither figure.
 * The strip's transient messages live in the same element, and writing `''` over one of them would
 * blank the screen at the moment a reader is being told something.
 *
 * ## The line is playhead-aware, and the whole-run sentence waits for the end — `docs/19` defect 4
 *
 * The figures this line carries are folds of the **finished** day: `disclosureItems` reads
 * `recording.summary`, which exists before the first paint because `recordRun` simulates the whole
 * day up front. Drawn unconditionally, the line published *"average wait suppressed … the queues
 * never settled during this run"* — past tense — from the first second of playback, beside a
 * stage header that correctly speaks in the *so far* register. That is the violation class the
 * honesty sweep's temporal axis polices (a whole-run figure at a playhead short of `endedAt`), on
 * the one line a reader glances at without opening a panel.
 *
 * `progress` is the playhead against the run's own end. Short of the end the line **withholds and
 * says so**, in the register `dev/reportPanel.ts`'s watching sheet established: it names the
 * figures that are coming and when they file, and prints no number and no verdict — the running
 * figure a reader can have mid-run is already on the stage header (`render/canvas.ts#meanClause`),
 * and a second copy here would be a second answer. At `endedAt` (or for a caller with no playhead,
 * which is how the parity check and the pre-playhead call sites read a whole run) the line is the
 * whole-run one, unchanged. `honesty/surfaces.ts` drives both registers at five playheads and
 * declares a whole-run line drawn early as `basis: 'whole-run'`, so the temporal property holds
 * this seam closed rather than this docstring — which is why the register split is **recorded
 * here rather than in `DECISIONS.md`, under § D405**: it is § D307's temporal rule applied to one
 * line, and a property asserts it.
 */
export interface TransportStatusProgress {
  /** The playhead, simulated seconds. */
  readonly atS: number;
  /** The run's own end — `recording.endedAt`, never a constant. */
  readonly endedAt: number;
}

export function transportStatusOf(
  items: readonly DisclosureItem[],
  mode: ViewMode,
  progress?: TransportStatusProgress | undefined,
): string | undefined {
  const drawn = itemsIn(items, mode);
  const shown = [AWT_ID, WT95_ID]
    .map((id) => drawn.find((item) => item.id === id))
    .filter((item) => item !== undefined);
  if (shown.length === 0) return undefined;

  if (progress !== undefined && progress.atS < progress.endedAt) {
    /*
     * The so-far register. Labels only — the labels are the reader's names for the two figures,
     * and naming what is withheld is what makes this a refusal rather than a blank. No numeral:
     * a count here would be a figure, and the figures are exactly what has not been earned yet.
     */
    const labels = shown.map((item) => item.label).join(' and ');
    return `still playing — ${labels} are read over the finished day, and file when the playhead reaches the end`;
  }

  const figures = shown.map((item) => {
    const { value, count } = item.rendering;
    return count === undefined ? `${item.label} ${value}` : `${item.label} ${value} (${count})`;
  });

  /*
   * **A refusal carries its reason, once.**
   *
   * Two things this had to be driven to get right, and printing what the function returns is what
   * found both.
   *
   * The line it replaces read `AWT suppressed — <the run's own awtInvalidReason>`, and the first
   * draft of this routing dropped the second half: on `midtown-office` at the viewer's defaults —
   * a run whose mean *is* refused — it produced `average wait suppressed (n = 201 rides)` and
   * nothing about why. That is R3 with the reason deleted, on the surface a reader glances at
   * without opening a panel: a **worse** line than the one it replaced.
   *
   * Appending it per figure was the second draft, and it printed a 300-character refusal **twice**,
   * because both figures are refused by the same `awtIsValid` call and carry the same sentence. So
   * the reasons are deduplicated and said after the figures. Two figures refused for two different
   * reasons — which no shipped ground produces today, since the gate is one call — would print
   * both, in order, rather than silently choosing one.
   *
   * Only a `suppression` origin contributes: on a quotable figure the note is the window and the
   * sample, and `figures` above already carries the sample.
   */
  const reasons = [
    ...new Set(
      shown
        .filter((item) => item.origin.kind === 'suppression')
        .map((item) => item.rendering.note)
        .filter((note) => note !== undefined),
    ),
  ];
  return [figures.join(' · '), ...reasons].join(' — ');
}

/** A band's boundary, as the two numbers it already publishes and the unit they are in. */
function rangeLabelOf(band: WaitBandDefinition): string {
  const from = String(band.fromS);
  const to = band.toS;
  return to === undefined ? `${from} s+` : `${from}–${String(to)} s`;
}

/**
 * One entry as a node: the handoff's `●` in the band's colour, the band's words, and its count.
 *
 * `countNode` is passed in rather than created here because the four count nodes are the only part
 * of this row that changes at 60 Hz — {@link WaitLegendEntry.count} moves every frame while the
 * labels and the palette never move at all. The caller keeps the handles and writes them with
 * `setText`, so the row is built exactly once and hovering an entry to read its `title` survives
 * the playhead running underneath it.
 */
function legendEntryNode(
  doc: Document,
  entry: WaitLegendEntry,
  countNode: HTMLElement,
): HTMLElement {
  return el(doc, 'span', {
    className: 'legend-entry',
    title: entry.rangeLabel,
    children: [
      el(doc, 'span', {
        text: '●',
        style: { color: entry.color },
        // The disc is the colour key; the words beside it are the claim. KB-15 — a reader who
        // cannot separate amber from orange still reads *a minute* and *two minutes*, and now
        // reads the head count too, which is a third signal that is not a colour either.
        attrs: { 'aria-hidden': 'true' },
      }),
      el(doc, 'span', { text: entry.label }),
      countNode,
    ],
  });
}

function elements(): Elements {
  const resolved = resolveElements<Elements>(document, ELEMENT_IDS);
  if (!resolved.ok) throw new MissingElementsError(resolved.missing, resolved.total);
  return resolved.elements;
}

/* ========================================================================== *
 * Boot
 * ========================================================================== */

async function main(): Promise<void> {
  const ui = elements();
  disableTransport(ui, true);
  const loader = createLoader<BrowserResources>({
    load: loadBrowserResources,
    start: (resources) => {
      boot(ui, resources);
    },
    fail: (error, retry) => {
      showLoadFailure(ui, error, retry);
    },
  });
  await loader.attempt();
}

function disableTransport(ui: Elements, disabled: boolean): void {
  for (const control of [
    ui.transport.playPause,
    ui.transport.stepBack,
    ui.transport.stepForward,
    ui.transport.exportPng,
    ui.transport.saveRecording,
    ui.transport.verify,
  ]) {
    control.disabled = disabled;
  }
}

function showLoadFailure(ui: Elements, error: unknown, retry: () => Promise<boolean>): void {
  const message = error instanceof Error ? error.message : String(error);
  setText(ui.transport.error, `${message}\n`);
  setText(ui.transport.status, 'could not load data/');
  // SH-16/SH-19 (§ D198): a failed boot left the phase pill and the footer status line blank —
  // the two chrome slots only drawHeader/drawFooter ever fill, and neither runs when data/ does
  // not load. Authored here in the empty state's own vocabulary.
  setText(ui.header.phaseLabel, 'no run yet');
  setText(ui.footer.statusLine, 'no shift run yet — data/ did not load');
  const again = el(document, 'button', { className: 'chip', text: 'Retry', attrs: { type: 'button' } });
  again.addEventListener('click', () => {
    setText(ui.transport.error, '');
    setText(ui.transport.status, 'loading data…');
    void retry();
  });
  ui.transport.error.append(again);
  ui.transport.error.focus();
}

function boot(ui: Elements, resources: BrowserResources): void {
  /* ---------------------------------------------------------------------- *
   * State
   * ---------------------------------------------------------------------- */
  let state: ViewerState = applyDeepLink(initialState(resources, randomSeed()), resources);
  // A deep link names the building before anything can have been edited, so the editor's working
  // copy follows it unconditionally here — `withBuilding`'s pristine test is trivially true.
  state = withBuilding(state, resources, state.buildingId);
  const deepLinkDefaults = deepLinkDefaultsOf(resources);
  /**
   * Whether {@link syncUrl} may write yet — `SH-09`.
   *
   * False until the boot sequence below has run, so a fresh page keeps a clean address bar: the
   * first `renderAll` is not the reader doing anything, and a bar that grew `?seed=…` on load
   * would bury the params that mean something under one that names a run nobody chose. From the
   * first real state change onward the address follows the run, seed included.
   */
  let urlWritable = false;
  let playback: Playback | undefined;
  let building = resources.entries[0]?.resolved;
  let lastAnnouncedMs = 0;
  let selectedLandingId = '';
  /** The run whose day has already been filed. See {@link tick}. */
  let filedRunId: string | undefined;
  /**
   * The run whose day ran out **behind the Everyday cover** — GitHub issue **#287**.
   *
   * ## What it is, in one sentence
   *
   * A day that reached its end while the other product had the page was not this surface's day to
   * close, and it does not become this surface's day to close later. This records which run that
   * happened to, so a player who then walks through § 3.2's door does not have the day filed out
   * from under them by the trip.
   *
   * ## Why the guard in {@link tick} is not enough on its own
   *
   * That guard is a *level* — `playback.state === 'ended'` is true on every frame from the end of
   * the run onward — so gating it on *who has the page right now* would have moved the file rather
   * than removed it: the first frame after `enterEngineer` would find an ended transport, an unfiled
   * run and the Engineer surface in front, and bank the Everyday player's day on the way in. Turning
   * the level into an **edge** is what makes the boundary hold: the instant the day ran out is the
   * instant that decides, and that instant belongs to whichever world was in front of it.
   *
   * A third `let` beside {@link filedRunId} and {@link simulatedRecording}, on the rule those two
   * already state: *has this run been filed?*, *did we run it?* and *did this run end somewhere we
   * were not?* are three questions, and § D311 is what happens when two of them share a flag.
   *
   * **Deliberately not saved or restored by {@link enterWatch}/{@link stopWatching}**, where
   * `filedRunId` is. That pair exists so a filed day cannot be filed twice through the spectator's
   * back door; this one needs no such care because it re-derives itself. {@link adopt} clears it,
   * and if the transport is still sitting past the end under the cover the very next frame writes it
   * again — so the worst a round trip can do is re-answer a question correctly.
   *
   * Recorded as § D383; the argument is `everyday/swap.ts#EverydaySwapPort.hasThePage`'s.
   */
  let endedUnderTheCover: string | undefined;
  /**
   * Why the run on screen was started — `docs/20` defect 17, and the one fact `closeShift` cannot
   * read off the recording.
   *
   * ENGINE_CONTRACT § 1.4: an intervention is **the same run's record growing** — append to the
   * log, re-simulate from t = 0 — never a new run. But the record cannot testify to that at filing
   * time, because a plain retry of an unchanged selection reproduces the same `{seed, config}` too
   * (§ D223's correction inside `closeDay`'s docstring). So the *intent* is latched where it
   * exists: {@link runShift} writes it on every start, `'player'` unless the caller says
   * otherwise, and the intervention button is the one caller that says otherwise. `closeShift`
   * hands it to `closedWeekOf`, where it gates exactly one thing — the attempt count. A player who
   * pressed *Run* once and parked once has made one attempt at the day, not two.
   *
   * A third `let` beside {@link filedRunId} and {@link simulatedRecording} on their own rule:
   * *has this run been filed?*, *did we run it?* and *why did it start?* are three questions, and
   * § D311 is what happens when two of them share a flag.
   */
  let runCause: 'player' | 'intervention' = 'player';
  /**
   * The run **this shell simulated**, as opposed to the run on screen — GitHub issue #136.
   *
   * The two are the same except after {@link loadRecordingFile}, which is the whole of the issue:
   * a recording read off disk reaches {@link closeShift}, where the day's facts come from `state`
   * and the week gets written. `shift/banking.ts` carries the argument for refusing that and for
   * why refusing is the only one of the three options the file's own contents allow.
   *
   * **The recording itself, not its `runId`.** `runId` looks like a per-run identity and is a
   * digest of building, dispatcher and seed — `shift/banking.ts` records how that was found and why
   * comparing it would have been the option this decision rejected.
   *
   * A second `let` beside {@link filedRunId} rather than a widening of it, because they answer
   * different questions — *has this run already been filed?* and *did we run it?* — and § D311 is
   * the case law: two questions sharing one flag is how **Resume** came to un-gate a filing.
   */
  let simulatedRecording: VizRecording | undefined;
  /**
   * What the sheet on screen was shaped from, so a presentation setting can re-shape it.
   *
   * ## Why the input is held rather than the sheet re-assembled
   *
   * `showEnergyAxis` is presentation, and the `set-setting` arm's own rule is that presentation is
   * *applied now, not at the next `adopt`* — a setting that only took effect on the next run is
   * indistinguishable from an inert one for as long as a player stays on the screen, which is
   * exactly how four of them went unnoticed (§ D250). `dayReportOf` is pure, so re-running it is
   * free and safe; what is **not** safe is re-running `closeShift`, which banks the day, increments
   * the attempt and can clear a contract. Holding the input separates *shape the sheet* from *file
   * the day* without splitting `closeShift` into two functions that could drift about which
   * recording they are describing.
   *
   * `undefined` before anything is filed, and it is never cleared: it is the input for whatever
   * sheet `ViewerState.report` currently holds, and those two are written together and only here.
   */
  let filedReportInput: DayReportInput | undefined;
  /**
   * The `(run, mode, register)` key the transport status line was last derived for — see
   * {@link drawTransportStatus} for why a transient message survives exactly until it changes,
   * and why the key is these three facts rather than the derived text.
   */
  let lastTransportStatusKey: string | undefined;
  /**
   * Where the service badges were last drawn, for the click handler.
   *
   * Declared **here**, with the other boot-scope bindings, and not beside the function that reads
   * it. It was declared next to `badgeAt` and `drawStage` runs before that statement is reached, so
   * the very first draw threw `Cannot access 'carBadgeHits' before initialization` — a temporal
   * dead zone inside a closure, which is precisely the failure `dev/bootstrap.ts` was extracted to
   * stop happening on the load path. It surfaced as *the shift did not run* over a stage that had
   * in fact drawn, because the throw landed after the picture and before the assignment.
   */
  let carBadgeHits: readonly CarBadgeHit[] = [];
  let bankFilter = '';
  /**
   * The line the calendar produced for the day on screen, or `''` on an ordinary one.
   *
   * Held rather than recomputed, and that is `docs/16` S5: `shiftRunConfigOf` is the only thing that
   * knows what the calendar actually **applied** — a template the run length refused never reaches
   * it, and a population is what `expandFloors` counted rather than the factor asked for. A ribbon
   * that re-derived it would be a second answer, and the wrong one on exactly the days a refusal
   * fired.
   */
  let calendarCaption = '';
  /**
   * The hour the run on screen actually begins at, seconds after local midnight — issue #83.
   *
   * `DAY_START_S`, a flat 06:00, stood in every one of the four places this now reaches: the header
   * clock, its empty state, the transport strip and the Day report. So `lunch-two-way` was drawn at
   * breakfast and *Event egress* at dawn, and a player who picked *"CIBSE Guide D lunch two-way"*
   * got a morning with a different mix. § D244 gave every template its own hour and § D285 gave a
   * *part* of one its own; this is where the viewer finally reads them.
   *
   * **Captured from the run rather than re-derived from `state`**, and that is § D234's lesson at
   * the one seam it would recur on: `state` is what the player has *selected* and the recording is
   * what they are *watching*, and the two differ the moment a control moves before the next run.
   * Reading the selection here would put the next run's clock on the last run's sheet.
   *
   * `undefined` before the first run and for a recording restored from a file, where the clock falls
   * back to the shipped `DAY_START_S` — a recording's own hour is not in `VizRecording`, and
   * inventing one from whatever is selected now would be exactly the defect above.
   */
  let runStartOfDayS: number | undefined;
  /**
   * Whether the player has entered a play mode — § D232, and the guard on every progression write.
   *
   * `false` for exactly as long as the menu overlay has never been dismissed. The shell opens **on
   * the menu**, over a viewer that is already loaded and running, and boot's own `runShift()` sits
   * below that overlay: a play-tester opened the deployed app, read the menu for two minutes,
   * pressed nothing, and came back to `376 carried today`, all four goals ticked, `1 clean days
   * running` and `1/3 banked this scenario` (issue #39). A full shift had run to completion and
   * banked a clean day behind an opaque overlay.
   *
   * Two things follow from this flag and they are separate:
   *
   * 1. **The boot run does not play itself.** {@link adopt} hands `autoplay: false` while this is
   *    false, so the stage is drawn at 06:00 and stays there. The picture survives — the browser
   *    tier reads the bitmap and § D220's *draws the stage* is a claim about a frame, not about a
   *    moving one — and the footer says `paused` rather than `running`, which is what a cold load
   *    is.
   * 2. **Nothing files.** {@link closeShift} returns early, so no day is closed, no attempt is
   *    counted and no contract is cleared before the player has chosen anything.
   *
   * It is **not** the same question as *"is the menu hidden right now?"*. Re-opening the menu
   * mid-week must not un-choose the mode the player is in; this latches once and never goes back.
   *
   * ## The two questions this used to be, and why they had to come apart — GitHub issue #117
   *
   * One flag answered both of the numbered points above, and {@link closeMenu} latched it on
   * **every** way out of the overlay — including **Resume**, whose own docstring says *"Resume
   * itself starts nothing"*. For autoplay that is right and is argued there. For filing it is not:
   * Resume is a change of mind, and it un-gated `closeShift` over a recording nobody had asked for.
   *
   * What that cost is issue #117. Boot's own `runShift()` puts a full recording on screen before the
   * player has touched anything (a saved session's building and dispatcher, on a saved seed). Press
   * **Escape**, press play, and that run reached the end, filed as a real day, and **rotated into
   * the `was` column of the Day report's *What moved since the run before this one***. The next
   * genuine run was then differenced against a day the player never asked for: the reporter's
   * `CARRIED was 39 → 621`, a real improvement rendered as a catastrophe.
   *
   * So the *filing* gate is this flag and the *autoplay* gate is {@link menuHasBeenDismissed},
   * latched on every way out. The two were always two questions and the second one only looked
   * like the first because both start `false`.
   *
   * ## Where it latches: a mode entered, or a run started on purpose — `docs/19` defect 1
   *
   * *Latched only where a mode is entered* was the whole rule, and the play-experience audit found
   * what it swallowed: after any reload, **Resume** is the natural way out of the overlay
   * (`changed-their-mind`, correctly no latch), and every run the player then explicitly started —
   * **Run this shift**, *Save it and run it*, a scenario card — completed, reached `closeShift`,
   * and was refused in silence. The player did exactly what the empty sheet's copy asks and got
   * *Nothing filed yet* forever; recovery was leaving the menu again by a row that happens to be a
   * mode. So {@link playerStartedARun} is the second latch site: the flag's meaning is unchanged —
   * *the player asked for play on purpose* — and a deliberate run-start is that, by a door that is
   * not the overlay. What still never latches is everything § D232 and issue #117 closed: boot's
   * own `runShift()`, Resume, Escape, navigation, and the menu's configuration arms
   * (`set-calendar` re-runs the shift under the overlay to keep the stage honest, and choosing a
   * calendar is not asking for a day to count).
   */
  let playerHasChosen = false;
  /**
   * Whether the overlay has ever been dismissed — the **autoplay** half of what was one flag.
   *
   * True on every way out, **Resume included**, and that is the argument {@link closeMenu} used
   * to make for latching everything: a player who pressed *Resume* to get back to the shift they
   * were watching has left the menu on purpose, and a run they then re-roll should play, exactly as
   * it would have had they never opened the menu.
   *
   * It gates nothing that counts. `adopt` reads it for `autoplay` and nothing else does — see
   * {@link playerHasChosen} for the half that must not follow it, and for what happened when it did.
   */
  let menuHasBeenDismissed = false;
  /**
   * Whether any day has been filed **in this sitting** — `docs/19` defect 14's missing fact.
   *
   * `restoreSession` brings the week's banked days back and deliberately not their sheets (the
   * argument is `dev/reportPanel.ts#emptyReportView`'s), so after a reload the rail says *on a
   * roll · 1/1 banked* over a sheet reading *Nothing filed yet* — both true, and nothing on the
   * screen connecting them. `state.week.history` cannot tell that state from mid-session play: the
   * history is non-empty five minutes after any day closes. This flag is the difference — written
   * once, where {@link closeShift} files, and read only by {@link viewAt}'s `unfiledSheet` facts.
   * Never reset: a sitting that has filed a day has a sheet-shaped memory to lose, and one that
   * has not, has not.
   */
  let filedThisSitting = false;

  /**
   * Who the Everyday data host notifies when the state changes — the listener half of
   * `everyday/host.ts`'s `subscribe`. Filled through the bindings' `onChange`, drained at the end
   * of {@link renderAll}, which is the one choke point every state write already passes through —
   * so a subscriber hears about exactly the changes a panel would redraw for, and never about a
   * playhead frame ({@link renderLive} deliberately does not notify; the host's `playheadS` is a
   * pull).
   *
   * A `const` array, but declared up here with the `let`s all the same: `renderAll` runs in
   * boot's own sequence below, and a `const` after that sequence is the TDZ throw the guard in
   * `main.test.ts` exists for — that guard's regex watches `let` only, so this comment is the
   * fence for the `const` case.
   */
  const everydayHostListeners: (() => void)[] = [];

  /*
   * **Both of the two below are here for `carBadgeHits`' reason, and both were not.**
   *
   * `boot()`'s sequence — `restoreSession(); applyTheme(); renderAll(); runShift();` — runs before
   * the body reaches either declaration, and `applyTheme` **assigns** `stageTheme`. Function
   * declarations hoist; `let` does not, so the page threw `Cannot access 'stageTheme' before
   * initialization` on the second statement of boot, and the last-resort handler reported *The
   * viewer did not start.* over a blank shell. `baseSpeed` was one statement behind it, in
   * `drawTransportChrome`.
   *
   * **The third and fourth occurrences of the same mistake in this closure**, after `started` in
   * `bootstrap.ts` and `carBadgeHits` above — and the first two are written up in prose directly
   * overhead. Prose that has been ignored twice is not a control, so `main.test.ts` now reads this
   * file as text and requires every `let` at this indentation to sit above the boot sequence.
   */
/**
   * The palette the canvas draws in — the stage half of {@link applyTheme}'s answer.
   *
   * Held rather than resolved per frame: `themeFor` reads `matchMedia`, and a draw loop that asked
   * the browser for the colour scheme sixty times a second would be doing work whose answer changes
   * about twice a year.
   */
  let stageTheme: Theme = DEFAULT_THEME;
/**
   * The transport chip's own speed, in simulated seconds per real second.
   *
   * Held separately from `playback.speed` because `settings.playbackSpeed` multiplies it — see
   * {@link applyPlaybackSpeed}. Without the split, a reader on ×2 would find their chip selection
   * jump to whichever chip happened to equal `60 × 2`, and the two controls would fight.
   *
   * Opens on {@link DEFAULT_BASE_SPEED} and returns to it on every **mode entry** — see
   * {@link resetTransportSpeed} for the boundary and its argument (`docs/19` defect 12).
   */
  let baseSpeed = DEFAULT_BASE_SPEED;

  /* ---------------------------------------------------------------------- *
   * The menu — § D214 § 2, and the non-test caller of `menu/`
   * ---------------------------------------------------------------------- */

  /**
   * The shell opens on the menu, over the viewer.
   *
   * An overlay rather than a route, deliberately: the viewer behind it is already loaded and
   * running, so **Back** and **Campaign** are instant and nothing is torn down to show a list of
   * five rows. It also keeps `index.html` untouched, which matters because `elementMap.test.ts`
   * asserts that page's shape and a new required container would be a change to the contract for
   * a screen that is chrome.
   */
  const menuRoot = el(document, 'div', { className: 'menu-overlay' });
  document.body.append(menuRoot);
  /**
   * Where a wait is announced to a screen reader — see {@link announceWait}.
   *
   * Built here rather than declared in `index.html` for `menuRoot`'s own reason: `elementMap.ts`
   * asserts that page's required shape, and a new required container would be a change to that
   * contract for something that is chrome. Hidden by inline style rather than by a class, because
   * the stylesheet is not this lane's to edit and a region hidden with `display:none` or
   * `visibility:hidden` is a region assistive technology does not read at all.
   */
  const waitLiveRegion = el(document, 'div', {
    className: 'menu-wait-live',
    attrs: { role: 'status', 'aria-live': 'polite' },
    style: {
      position: 'absolute',
      width: '1px',
      height: '1px',
      margin: '-1px',
      padding: '0',
      border: '0',
      overflow: 'hidden',
      'clip-path': 'inset(50%)',
      'white-space': 'nowrap',
    },
  });
  document.body.append(waitLiveRegion);
  // Derived once. Two calls would be two catalogues, and a panel drawing one while the reducer
  // validated against the other is the kind of disagreement that only shows up as a Start button
  // that refuses something the list offered.
  const menuCatalogue = catalogueOf(resources);
  let menuState: MenuState = initialMenuState(menuCatalogue);

  /**
   * The account and leaderboard screens, and the one place a request is started.
   *
   * `client` is `undefined` unless the page declares a server, with
   * `<meta name="elevator-sim-api" content="https://…">`. There is **no default origin**: a client
   * that fell back to the page's own origin would work in development and fail in a build served
   * from a CDN, which is the class of bug that only reproduces where it cannot be debugged. With no
   * client the two screens say so plainly rather than drawing a form whose button can never do
   * anything.
   *
   * A `<meta>` rather than a build-time constant, because the same built bundle is served from more
   * than one place and baking the origin in would need a rebuild per deployment. The tag is
   * optional, so `index.html` is unchanged and `elementMap.test.ts`'s contract is untouched.
   */
  /**
   * A worker that runs one simulation and hands the recording back — `dev/shiftWorker.ts`.
   *
   * One factory for all three of its near sides: `createShiftRunner` below, and
   * `dev/offThreadRuns.ts` inside the Fix-a-building and Watch panels (GitHub issue #165). Hoisted
   * here rather than written out per caller because `new Worker(new URL(…))` is a **bundler seam** —
   * Vite rewrites that exact expression — and three copies of it are three chances for one to be
   * spelled differently and silently fall back to a runtime fetch.
   */
  const spawnRunWorker = (): Worker =>
    new Worker(new URL('./shiftWorker.ts', import.meta.url), { type: 'module' });

  /**
   * Fix-a-building — GAMEPLAY § 10, mounted like the menu: a TypeScript-built overlay, so
   * `index.html` and `elementMap.test.ts`'s contract are untouched. The case file is fetched on
   * first open (`loadFixitCases`'s own note on why it is not part of boot).
   */
  const fixitPanel = mountFixitPanel({
    document,
    resources,
    loadCases: () => loadFixitCases(resources),
    spawnRunWorker,
  });

  /**
   * Watching somebody else's run — GAMEPLAY § 14.1, Everyday Mode slice 8.
   *
   * Mounted like the Fix-a-building overlay and for the same reasons, with one addition: the
   * spectator **chrome** is not an overlay. § 14.1's differentiation is structural, so the strip is
   * inserted into the page above the header — `parentElement?.insertBefore`, this package's one
   * insertion idiom — and the header itself is inverted by a class while a run is being watched.
   *
   * The gate's run is on a worker — GitHub issue #165. This paragraph used to state a cost
   * instead (*"~0.2–1.5 s on the shipped buildings"*, carried from `dev/fixitPanel.ts`) and it is
   * deleted rather than reworded: a stated cost that has been paid is § D227's stale refusal. The
   * measurement that replaced it is in `dev/watchPanel.ts`'s own header, and it found that
   * sentence understated by more than threefold on the worst row this picker can offer.
   */
  const watchPanel = mountWatchPanel({
    document,
    resources,
    stateNow: () => state,
    loadReferenceRuns: () =>
      loadReferenceRuns((id: string) => buildingNameOf(resources, state.savedBuildings, id)),
    spawnRunWorker,
    buildingNameOf: (id) => buildingNameOf(resources, state.savedBuildings, id),
    dispatcherNameOf: (id) => profileById(resources, state.savedDispatchers, id).name,
    onWatch: (run, view, recording) => {
      enterWatch(run, view, recording);
    },
    onPlayThisCrowd: (run) => {
      playThisCrowd(run);
    },
    onStopWatching: () => {
      stopWatching();
    },
  });
  {
    /*
     * Above the header, so the inverted strip and the inverted header read as one block — and
     * **inside a band of their own**, which is `docs/20` defect 12 and a layout bug rather than a
     * styling preference.
     *
     * `.shell` is `grid-template-rows: auto 1fr auto` over exactly three children: the header, the
     * body, the footer. Inserting the strip as a fourth child *before* the header shifts all three
     * down a track — the strip takes the leading `auto`, **the header takes the `1fr`**, the body
     * takes the trailing `auto` and the footer lands in an implicit row — inside a `height: 100vh`
     * box with `overflow: hidden`. What a player sees is the strip and the header contending for
     * the top of the page with the wordmark, Menu and clock clipped, which is what the audit
     * photographed (`61-watching.png`).
     *
     * So the two go into one band that occupies the header's own track, and the grid is back to
     * three children whether or not anybody is watching. The band is inserted with
     * `parentElement?.insertBefore` — this package's one insertion idiom — before the header is
     * moved into it. No rule in `index.html` selects the header as a child of `.shell` (there is no
     * `.shell > *` rule at all), so nothing about the header's own styling moves with it, and
     * `ui.header.right.closest('header')` — how every other reader finds the header — does not care
     * about depth. `min-width: 0` is the ordinary grid-item guard: without it the band's minimum
     * content size would stop `.topbar`'s own ellipsis from ever engaging.
     */
    const headerEl = ui.header.right.closest('header');
    if (headerEl !== null) {
      const band = el(document, 'div', { className: 'watch-band', style: { 'min-width': '0' } });
      headerEl.parentElement?.insertBefore(band, headerEl);
      band.append(watchPanel.chrome, headerEl);
    }
  }

  /**
   * The canvas pill — § 14.1's *"a pill, top left"*.
   *
   * Absolutely positioned over `.stage-wrap`, which is given `position: relative` at mount time. A
   * relative block container lays out exactly as a static one, so nothing on the page moves; what
   * it buys is that the pill sits **on** the stage rather than above it, which is where § 14.1 puts
   * it and the only place a spectator's eye is guaranteed to be.
   */
  const watchPill = el(document, 'div', {
    className: 'watch-pill',
    style: {
      display: 'none',
      position: 'absolute',
      top: '10px',
      left: '10px',
      'z-index': '5',
      // The spectator pill inverts with the page, as `watchPanel.ts`'s chrome does and for
      // § 14.1's reason — the two ground tokens read upside down, never a literal.
      background: 'var(--text)',
      color: 'var(--bg)',
      padding: '4px 10px',
      'border-radius': '999px',
      font: '11px/1.2 system-ui, sans-serif',
      'letter-spacing': '0.06em',
      'pointer-events': 'none',
    },
  });
  {
    const stageWrap = ui.stage.canvas.parentElement;
    stageWrap?.style.setProperty('position', 'relative');
    stageWrap?.insertBefore(watchPill, ui.stage.canvas);
  }

  const apiOrigin =
    document.querySelector('meta[name="elevator-sim-api"]')?.getAttribute('content')?.trim() ?? '';
  const client = apiOrigin === '' ? undefined : createClient(apiOrigin, fetchTransport(fetch));

  /*
   * The three unavailability sentences, rewritten — issue #29, and the fix is two fixes.
   *
   * **The jargon.** *"This build was not compiled against a server"* uses *compiled* as a transitive
   * verb with a preposition, implies the player could obtain a different build (there is no
   * download; this is a hosted URL), and exposes an HTTP verb — *fetch* — as game vocabulary. It
   * reads as a stack trace on the first prose most players meet.
   *
   * **The untruth.** It was never a compile-time fact. § D215 § 4 reads a `<meta>` tag at run time,
   * and § D243 injects that tag from the server that is serving the page — so the same bytes are a
   * connected build behind the server and an unconnected one behind a CDN. Saying *compiled* named
   * the wrong mechanism and named it confidently.
   *
   * And the reassurance was false on its own terms: *"everything else on this menu works without
   * one"* was printed on a menu where two of the other five rows also do not (#28). So these say
   * **which** rows need a server and which do not, by name, and the case they describe is still
   * real — a bundle served from a CDN with no server beside it never passes through § D243's
   * injection and lands here.
   */
  const NO_SERVER_ROWS =
    'Scenarios, Free play and Settings do not need one; Leaderboard and Account do.';
  /*
   * Issue #34's empty state, in the one channel this file owns.
   *
   * A designed empty state teaches the shape of the thing, and the shape is the part a player
   * cannot guess: what a board *is*, what is on a row, and what orders it. The three nouns the
   * screen used without defining — configuration, seed, metric — are defined here in the order a
   * reader meets them.
   *
   * The last sentence is § D106 generalised and it is not decoration: four figures sit side by side,
   * one of them orders the rows, and none is ever folded into another. A composite score over these
   * would rank the configuration that carried fewest people highest.
   */
  const NO_SERVER_BOARDS =
    'This site has no leaderboard server behind it, so there are no boards to read. Here is what ' +
    'one is. A board is a single exact configuration — the same building, dispatcher, traffic ' +
    'template, arrival rate and run length — and its rows are that configuration played on ' +
    'different seeds, one row per posted run, so two rows differ only in which passengers turned ' +
    'up. A seed is the number those passengers are generated from: same seed, same people, same ' +
    'minute-by-minute demand. Every row carries the average wait, the 95th-percentile wait, the ' +
    'mean time to destination and the share waiting over a minute, side by side. One of the four ' +
    'orders the rows; the other three are shown beside it and are never combined into a score. ' +
    `Picking a different dispatcher moves you to a different board rather than up this one. ${NO_SERVER_ROWS}`;
  /*
   * Issue #32, and the half of it that has nothing to do with the missing server.
   *
   * Four of the five questions the screen never answered — what is scored, what *the same seeds*
   * means, how long a week runs, how a run gets submitted — are properties of the game's design and
   * not of this week's data. They are answerable with the server off, and this is where they get
   * answered, because § D218 § 3 says the client never invents *which* challenge is current and
   * says nothing about the client explaining what a challenge is.
   *
   * The claim about comparability is the one to keep honest: common random numbers make two runs
   * comparable **as runs**, and this screen still never says one dispatcher beat another. Compare
   * is the only surface allowed to say that, and only with a paired-t interval that excludes zero.
   */
  const NO_SERVER_CHALLENGE =
    'This site has no challenge server behind it, so there is no challenge to load. Here is what ' +
    'one is. Everybody gets the same building, the same run length and the same numbered seeds — ' +
    'the same seed generates the same passengers arriving at the same moments, so the only thing ' +
    'that differs between two players is the dispatcher they chose. A challenge is scored over its ' +
    'whole seed set rather than a lucky single run, and you submit the set in one go or not at ' +
    'all: a partial set is a different question, not a smaller score. A challenge opens and closes ' +
    'on the server’s clock, and the board stays readable after it shuts. Ordering a board on ' +
    'one metric is a fact about what was posted and never a claim that one dispatcher beats ' +
    `another — Compare is the only screen allowed to say that. ${NO_SERVER_ROWS}`;
  const NO_SERVER_SIGN_IN =
    'This site has no account server behind it, so there is nowhere to sign in and nothing is ' +
    `sent anywhere. ${NO_SERVER_ROWS}`;
  const NO_SERVER_POST =
    'This site has no leaderboard server behind it, so this run cannot be posted. It is still on ' +
    'screen and still in the report — nothing about it is lost.';
  /**
   * What is said while a request is in flight, and what is said once it has been a while.
   *
   * § D243 § 4 and § D247: the Container App runs at `minReplicas: 0`, and a request to a sleeping
   * one was measured at **32.2 s** against **0.13 s** warm. So a wait of half a minute here is a
   * *correct* answer arriving slowly, and the two failures available are giving up — which reports
   * `unreachable` about a server that is starting — and saying nothing, which is indistinguishable
   * from a hang. Neither is taken: nothing is cancelled, and the wording escalates on a timer.
   *
   * ## The ladder is graded in the product's own vocabulary, and the grading is checked
   *
   * This is an app about waiting for lifts, and the player is now the one waiting. So the rungs
   * name the band a **tenant** would be in at the same elapsed time — the four the mood bar uses.
   * That is a joke and it is also a teaching device: a player learns what *breezy* and *checking
   * watch* mean by being in them.
   *
   * **It is prose about the player's wait and never a statistic about a run.** Nothing here imports
   * `live/bands.ts`, nothing routes through a surface that publishes run figures, and no rung
   * carries a number about a simulation. What it must not do is *misname* a band, because a screen
   * that called 20 s *tapping foot* would be teaching the reader the product's own vocabulary
   * wrongly — so `main.test.ts` reads these rungs out of this file's source and checks each band
   * word against `WAIT_BANDS`' real boundaries, which are 30 s, 60 s and 120 s.
   *
   * There is deliberately **no progress bar and no percentage.** There is no progress to report — a
   * container is starting and it will not say how far — and inventing one is the same class of
   * defect as a figure a run does not support.
   */
  const WAIT_LADDER: readonly { readonly afterMs: number; readonly text: string }[] = Object.freeze([
    {
      afterMs: 4_000,
      text:
        'Summoning the car. This site’s server shuts down when nobody is playing, which is what ' +
        'keeps it free to leave running — so the first request after a quiet spell is starting it.',
    },
    {
      // 10 s. Under 30 s, which is `breezy` — checked against WAIT_BANDS rather than asserted here.
      afterMs: 10_000,
      text: 'Still on its way. A tenant waiting this long is one your mood bar calls breezy.',
    },
    {
      // 30 s: the breezy → tapping foot boundary, and about where the measured cold start lands.
      afterMs: 30_000,
      text:
        'Thirty seconds — the exact point where your own mood bar stops calling a wait breezy and ' +
        'starts calling it tapping foot. We are aware of the irony.',
    },
    {
      // 60 s: tapping foot gives way to checking watch.
      afterMs: 60_000,
      text: 'A minute — long enough that your own mood bar has moved a tenant into checking watch.',
    },
    {
      /*
       * 120 s: checking watch → eyeing the stairs, and the rung that stops blaming the cold start.
       * A sleeping container was measured at 32.2 s; four times that is not a cold start any more,
       * and going on saying *it is just waking up* would be a reassurance that had stopped being
       * true — which this repository has a standing rule about.
       */
      afterMs: 120_000,
      text:
        'Two minutes — your mood bar’s last band, eyeing the stairs, where a tenant starts ' +
        'looking for another way up. You ' +
        'do not have that option, and a cold start was measured at about half a minute, so this is ' +
        'no longer a sleeping server. Nothing you typed is lost.',
    },
  ]);

  /*
   * The unavailability is said **on mount**, which is issue #30's own stated fix ordering.
   *
   * The screen used to be indistinguishable from a working login until the player pressed the
   * button, at which point it admitted there had never been anywhere for the address to go. That
   * ordering is the privacy problem rather than the layout one: whatever a player typed, they typed
   * into a form with no stated purpose, and they could not have known before typing.
   */
  let accountState: AccountState = client === undefined ? signedOut(NO_SERVER_SIGN_IN) : SIGNED_OUT;
  let boardView: LeaderboardView = {
    boards: [],
    selected: undefined,
    page: undefined,
    notice: client === undefined ? NO_SERVER_BOARDS : undefined,
  };
  /**
   * True **while** a boards request is in flight, and false again the moment it settles.
   *
   * Not a one-shot latch, which is what it was: `boardsRequested` was set on the first fetch and
   * never cleared, so the arrival trigger died after the first visit to the screen and the sentence
   * *"No scores have been posted yet."* — written on a board that was empty once — was permanent.
   * A player who posted a run then walked back to the Leaderboard read the opposite of what the
   * server had just told them, and only a full page reload ever corrected it (GitHub issue #112).
   *
   * The guard is still needed for the reason the latch was reached for: requests are started from
   * arrivals and from a successful post, and two of those can overlap. Guarding *in flight* keeps
   * the double-fetch out without also keeping the second visit out.
   */
  let boardsInFlight = false;

  /* ---------------------------------------------------------------------- *
   * Waking the container before the player needs it — § D247 § 5
   * ---------------------------------------------------------------------- */

  /**
   * The three screens that talk to a server, and therefore the three that are worth waking for.
   *
   * Entering one is **intent**, and intent is minutes ahead of the request on the account screen
   * (an address has to be typed) and seconds ahead on the other two. Waking on *submit* would be
   * waking at the moment the wait starts, which buys nothing at all.
   */
  const WAKING_SCREENS: ReadonlySet<string> = new Set(['account', 'leaderboard', 'challenge']);
  /**
   * The floor between two wakes, so bouncing between **Back** and **Account** is not one request
   * per bounce.
   *
   * Far below any scale-to-zero window, so it can never suppress a wake that was needed: a
   * container that went to sleep did so after minutes of idleness, not inside thirty seconds.
   */
  const WAKE_MIN_INTERVAL_MS = 30_000;
  let lastWakeMs = Number.NEGATIVE_INFINITY;

  /**
   * Fire and forget. **Nothing branches on the answer and nothing waits for it.**
   *
   * `/api/wake` answers from memory with no store call, so a 200 means *the process is running* and
   * nothing more; treating a failure as meaningful would turn a courtesy into a dependency and make
   * a database outage read as a server that is merely asleep. So the result is discarded here, in
   * one place, rather than at each call site where somebody would eventually be tempted by it.
   *
   * The throttle reads `clock`, the shell's one `DisplayClock`, rather than `Date.now()`.
   * `boundaries.test.ts` gives the wall clock exactly one home — `playback/clock.ts` — and it caught
   * this: a second reader in `dev/main.ts` is precisely the drift that rule exists to stop, and it
   * is not excused by the reading being *only a throttle*. The instant here is a real one and it is
   * not a simulated second; invariant 3 is about `core/`, and this is the shell.
   */
  function wakeServer(): void {
    if (client === undefined) return;
    const nowMs = clock.now();
    if (nowMs - lastWakeMs < WAKE_MIN_INTERVAL_MS) return;
    lastWakeMs = nowMs;
    void client.wake();
  }

  /* ---------------------------------------------------------------------- *
   * This week's challenge
   * ---------------------------------------------------------------------- */

  /**
   * What the server said, and how far this browser has got with it.
   *
   * **Nothing here is computed from a local clock.** § D218 § 3: the challenge's state, the time
   * until it opens and the time until it closes are the server's measurements, held and drawn. A
   * countdown built by differencing two clocks would be the client answering a question the server
   * has already answered, one subtraction later.
   */
  let challengeView: ChallengeScreenInput = {
    runsDone: 0,
    ...(client === undefined ? { notice: NO_SERVER_CHALLENGE } : {}),
  };
  /**
   * In flight, on {@link boardsInFlight}'s rule and for the same defect.
   *
   * This was a one-shot latch too, and the consequence here is sharper than on the leaderboard: the
   * whole of `view.state`, `opensInMs` and `closesInMs` is *the server's measurement at the moment
   * it answered*, so a challenge that opened while the tab was on the run surface stayed drawn as
   * *not open yet* until the page was reloaded — a countdown that had stopped, on the one screen
   * § D218 § 3 forbids the client to compute a countdown on.
   */
  let challengeInFlight = false;
  /**
   * The seed set this browser has simulated, paired with the seed each recording is *of*.
   *
   * Paired rather than read back off the recording: `SimulationResult.seed` is `String(config.seed)`,
   * so a challenge naming `007` yields a recording saying `7` and an honest set would be refused as
   * `unknown-seed`. Every shipped challenge spells its seeds canonically, so this is latent — and a
   * latent wrong refusal is one `data/` edit away from being a live one.
   */
  let challengeRecordings: { readonly seed: string; readonly recording: VizRecording }[] = [];
  /** Which dispatcher the runs above are of. Changing it discards them — they are of another run. */
  let challengeRanWith = '';

  async function loadChallenge(): Promise<void> {
    if (client === undefined || challengeInFlight) return;
    challengeInFlight = true;
    challengeView = { ...challengeView, notice: 'Loading this week’s challenge…' };
    drawMenu();
    let ok = false;
    try {
      const result = await client.challenges();
      ok = result.ok;
      challengeView = result.ok
        ? { ...challengeView, view: result.value.current, notice: undefined }
        : { ...challengeView, notice: result.detail };
    } finally {
      challengeInFlight = false;
    }
    drawMenu();
    if (ok) void loadChallengeBoard();
  }

  async function loadChallengeBoard(): Promise<void> {
    const view = challengeView.view;
    if (client === undefined || view === undefined) return;
    const result = await client.challengeBoard(view.challenge.id, menuState.challenge.metric);
    challengeView = result.ok
      ? { ...challengeView, board: result.value }
      : { ...challengeView, notice: result.detail };
    drawMenu();
  }

  /**
   * Simulate every seed the challenge names, in the order it names them.
   *
   * Synchronous and blocking, deliberately: five 900-second runs are a few hundred milliseconds in
   * this kernel, and a progress bar over something that fast is a lie about how long it took. If the
   * seed count ever rises far enough for that to stop being true, the count is the thing to look at
   * — `MAX_CHALLENGE_SEEDS` is 8 and the server's cooldown already scales with it.
   */
  function runChallenge(): void {
    const view = challengeView.view;
    if (view === undefined) return;
    const dispatcherProfileId = menuState.challenge.dispatcherProfileId;
    const built = challengeRunConfigs(view, resources, dispatcherProfileId);
    if (!built.ok) {
      challengeView = { ...challengeView, notice: built.detail, runsDone: 0 };
      challengeRecordings = [];
      drawMenu();
      return;
    }
    /*
     * The previous set is dropped **before** the first run rather than replaced after the last. A
     * throw partway through would otherwise leave three runs of the new dispatcher beside two of the
     * old one, and `challengeSubmissionOf` would accept that as a complete set of five.
     */
    challengeRecordings = [];
    challengeRanWith = dispatcherProfileId;
    for (const run of built.runs) {
      const recorded = recordRun(run.config, { recordDecisions: false });
      challengeRecordings.push({ seed: run.seed, recording: recorded.recording });
    }
    challengeView = {
      ...challengeView,
      runsDone: challengeRecordings.length,
      notice: undefined,
      postRefusal: undefined,
    };
    drawMenu();
  }

  /**
   * Post the whole set, or none of it.
   *
   * `challengeSubmissionOf` refuses **before** the network for a missing or duplicated seed, and
   * that ordering is the point: the server's rejection is an accusation, and spending it on a client
   * bug is the defect `submitScore` already argues about one board over.
   */
  async function postChallenge(): Promise<void> {
    const view = challengeView.view;
    if (client === undefined || view === undefined) return;
    const token = accountState.token;
    if (token === undefined) return;

    const body = challengeSubmissionOf(
      view,
      challengeRanWith,
      challengeRecordings.map((entry) => ({ ...entry.recording, seed: entry.seed })),
    );
    if (!body.ok) {
      challengeView = { ...challengeView, postRefusal: body.detail };
      drawMenu();
      return;
    }

    const posted = await client.submitChallenge(token, body.submission);
    if (posted.ok) {
      challengeView = { ...challengeView, postRefusal: undefined, notice: undefined };
      accountState = withNotice(accountState, 'Posted. The server replayed every seed and they reproduced.');
      drawMenu();
      void loadChallengeBoard();
      return;
    }
    /*
     * The 409 is the one refusal with somewhere to send the player: it names the challenge that *is*
     * open. Carried from the server's own `detail` and widened with that id rather than rewritten —
     * two answers to *which challenge is current* is the failure § D218 § 3 is about.
     */
    const shut = challengeNotOpenOf(posted);
    challengeView = {
      ...challengeView,
      postRefusal:
        shut === undefined
          ? posted.detail
          : `${shut.detail} (open now: ${shut.currentChallengeId})`,
    };
    drawMenu();
  }

  async function loadBoards(): Promise<void> {
    if (client === undefined || boardsInFlight) return;
    boardsInFlight = true;
    boardView = { ...boardView, notice: 'Loading boards…' };
    drawMenu();
    try {
      const result = await client.boards();
      boardView = result.ok
        ? {
            boards: result.value.map((board) => ({ boardKey: board.boardKey, entries: board.entries })),
            selected: undefined,
            page: undefined,
            notice: result.value.length === 0 ? 'No scores have been posted yet.' : undefined,
          }
        : { ...boardView, notice: result.detail };
    } finally {
      /*
       * `finally`, so a client that ever throws instead of returning a `Failure` does not wedge the
       * screen shut for the rest of the session. `menu/client.ts` turns every transport error into a
       * `Failure` today; that is a fact about a module next door, and this is the flag it would
       * strand.
       */
      boardsInFlight = false;
    }
    drawMenu();
  }

  /**
   * The one place this build touches `localStorage` for a session — `persist/` decides, this reads.
   *
   * The account token is deliberately **not** here and never will be: `menu/account.ts` holds it in
   * memory on purpose, and a persistence layer that quietly widened that decision would be
   * overruling a security choice from a directory that does not own it.
   */
  const sessionStore: SessionStore = {
    read: (key) => window.localStorage.getItem(key),
    write: (key, value) => {
      window.localStorage.setItem(key, value);
    },
    remove: (key) => {
      window.localStorage.removeItem(key);
    },
  };

  /**
   * Bring back the week, the settings and the Free Play selection.
   *
   * ## Why a failed restore *clears* the slot
   *
   * `clearSession`'s only caller, and it is a necessary one rather than a tidy one. A snapshot that
   * fails validation fails **deterministically** — a version this build cannot read, a shape it does
   * not recognise, a contract `data/` no longer ships — so leaving it in place means re-reading and
   * re-rejecting the same bytes on every load, forever, while every subsequent save is written over
   * a slot the player can never get value from again. Clearing it costs a week that was already
   * unreadable and gives the next save somewhere to live.
   *
   * `absent` is not a failure and is not cleared: it is an ordinary first visit.
   *
   * ## What a player is not told, stated rather than hidden
   *
   * The failure carries a reason and **nothing shows it**. A player whose week is dropped sees a
   * fresh one and no explanation, which is a real gap and is filed as one in `GAPS.md` § 3 rather
   * than papered over here — putting the sentence on screen makes it a player-facing string, and it
   * would then owe the honesty sweep an adapter, which is a lane of its own.
   */
  /**
   * A one-time line about a session that could not be restored — `undefined` when there is nothing
   * to say, which is the ordinary case and the whole of a first visit.
   *
   * It lives in the coach ribbon's hint, and that is a **compromise stated rather than hidden**: the
   * hint is advice about the run, and this is news about the save. It goes there because the ribbon
   * already gives refusals priority over advice (`state.withheld` does exactly this), and because a
   * slot of its own is markup this lane does not own. A dedicated line is the better home.
   *
   * It is cleared the moment the player does anything, because by then it is describing something
   * two actions ago and the hint has advice to give again.
   */
  let restoreNotice: string | undefined;

  /**
   * Whether this page loaded with nothing restored — GitHub issues #90 and #98.
   *
   * ## The knowledge existed and was thrown away, which is why this is a variable rather than a call
   *
   * `persist/types.ts` has carried a dedicated `absent` arm since it was written, arguing in its own
   * docstring that *"nothing stored yet is an ordinary first visit"* and must not be reported as a
   * loss. It had two readers and neither was a screen: `restoreNoticeFor` returns `undefined` for it
   * (correctly — a first visit is not a loss to announce), and the line below declines to clear the
   * slot. So the product knew, at exactly one instant per load, that nobody had ever played here, and
   * the answer went nowhere. #90 asks for the surface that would have used it.
   *
   * ## Latched at boot rather than asked per draw
   *
   * `saveSessionNow` runs on the first setting a player touches, so a per-draw `loadSession` would
   * answer *yes* on one redraw and *no* on the next — the welcome vanishing under somebody reading
   * it, and the menu changing shape mid-sentence. This is therefore a fact about **this load**, and
   * `menu/screens.ts`'s `FIRST_VISIT_NOTE` is worded about what was restored rather than about what
   * is stored, so it stays true for the life of the page.
   *
   * It starts `false`: a shell that never restored is not a shell that found nothing, and claiming a
   * first visit before looking would be the guess `MenuViewInput.firstVisit`'s `undefined` exists to
   * avoid.
   */
  let loadedWithNothingRestored = false;

  function restoreSession(): void {
    /*
     * **The library first, and on both paths.**
     *
     * A library is a set of independent documents and a week is one state whose parts constrain
     * each other — `persist/types.ts` argues the distinction at length — so a week this build
     * cannot read does not make the buildings the reader drew unreadable. Restoring the library
     * even when the session is refused is the whole benefit of that split, and skipping it here
     * would quietly throw away the thing the gap called *the most valuable thing a player creates*.
     *
     * It also has to precede `withBuilding` below, which reads `state.savedBuildings`.
     */
    const restoredLibrary = loadLibrary(sessionStore, resources);
    state = {
      ...state,
      savedBuildings: restoredLibrary.library.buildings,
      savedDispatchers: restoredLibrary.library.dispatchers,
      savedPatterns: restoredLibrary.library.patterns,
      savedClasses: restoredLibrary.library.classes,
    };
    libraryNotice = libraryNoticeFor(restoredLibrary.dropped);

    const restored = loadSession(sessionStore);
    if (!restored.ok) {
      /*
       * Told, not swallowed. This branch cleared the unreadable slot and started fresh in silence,
       * so a player who lost a week got a new one and no explanation — and the failure carried a
       * precise reason the whole way here before being dropped on the floor.
       */
      restoreNotice = restoreNoticeFor(restored.failure);
      /*
       * The same arm, read for the other half of what it means — issues #90 and #98. `absent` is the
       * one failure that is not one, and it is the only signal this product has ever had that
       * somebody is here for the first time. It was already branched on for *do not clear the slot*;
       * it is now also branched on for *say so on the menu*. One read, two consumers (`docs/16` S5).
       */
      loadedWithNothingRestored = restored.failure.kind === 'absent';
      if (restored.failure.kind !== 'absent') clearSession(sessionStore);
      return;
    }
    menuState = {
      ...menuState,
      settings: restored.snapshot.settings,
      freePlay: restored.snapshot.freePlay,
    };
    /*
     * The pair, and in this order: `withBuilding` below reads `state.parkedWeeks` and would
     * otherwise resume a week out of an empty list — which is the restored campaign losing every
     * scenario except the one it opened on, at the first boot after issue #107 was fixed.
     */
    state = {
      ...state,
      week: restored.snapshot.week,
      parkedWeeks: restored.snapshot.parkedWeeks,
    };
    /*
     * The building follows the week rather than being persisted beside it. `persist/` excludes
     * `buildingId` deliberately: a contract names its building, so storing both would be two
     * sources of truth for exactly the mismatch `withBuilding` exists to prevent — a sheet headed
     * one building and footed another, which this repository has already shipped once.
     */
    const contract = contractById(restored.snapshot.week.contractId);
    if (contract !== undefined) state = withBuilding(state, resources, contract.buildingId);
  }

  /**
   * A second line, for the two pieces of news that are not about the week.
   *
   * `libraryNotice` is *some of what you saved could not be reopened*; `saveNotice` is *nothing new
   * is being kept*. Held apart from `restoreNotice` because they can be true at the same time and
   * one slot cannot say both — and because the save one is about the **future**, so unlike the
   * other two it must not be cleared by the next run.
   */
  let libraryNotice: string | undefined;
  let saveNotice: string | undefined;

  /**
   * What happened to the week the player just put down — GitHub issue #107, and `undefined` almost
   * always.
   *
   * A third backward-looking line rather than a fourth kind of `restoreNotice`, because it is news
   * about an action the player has just taken rather than about the save: it is written by one
   * control, it is true for one moment, and `runShift` spends it on the next thing they do — the
   * same lifetime `restoreNotice` and `libraryNotice` have and for the same reason.
   */
  let weekNotice: string | undefined;

  /** Write the session back. Cheap, total, and never throws — a refusing browser is not an error. */
  function saveSessionNow(): void {
    /*
     * **A mode that does not own a week does not write one** — § D231, issue #64's other half.
     *
     * Guarding `closeDay` alone was not enough. `enterFreePlay` replaces `state.week` with a fresh
     * day-one week *the moment Free Play starts*, so any later save — and changing a setting saves
     * — would have written that scaffolding over the campaign's banked days. The settings and the
     * Free Play selection still persist, because those belong to the player rather than to the
     * week; only the week itself is held back, and what is held back is whatever the slot already
     * has.
     */
    const stored = loadSession(sessionStore);
    const written = saveSession(
      sessionStore,
      // Both weeks or neither, from one instant — see `weeksForSession`. Holding the live week back
      // while writing an in-memory parked list would store the campaign's week twice, once on each
      // side of the pair, on two different days.
      { ...state, ...weeksForSession(state, stored.ok ? stored.snapshot : undefined) },
      menuState,
    );
    /*
     * The refusal reaches the player, which is the whole reason the budget exists. A library that
     * outgrew the slot and stopped being written **in silence** would be the gap this closed,
     * reopened one layer down: the failure a player needs to know about is precisely the one they
     * cannot see, because the symptom is a reload that lost something.
     */
    saveNotice = written.ok ? undefined : saveNoticeFor(written.failure);
  }

  /**
   * Everything the menu asks for, in one exhaustive switch.
   *
   * ## Why a switch and not eight methods
   *
   * The eight it replaces each let the *panel* decide something and this file merely perform it,
   * which is `docs/16` § 5's own diagnosis of why three of the eight failing clauses shipped: a
   * decision made inside a click handler has no test that can reach it. The decisions are now
   * `menu/screens.ts`'s and this function is the performer.
   *
   * ## The clause the switch itself closes
   *
   * `submit-score` is a member of {@link MenuIntent}, so **this file does not compile without a
   * handler for it** — and the handler is the first non-test caller `menu/client.ts#submit` has ever
   * had. § 5 clause 8: the leaderboard could be read and never posted to, and the Account row's own
   * subtitle described something no player could do.
   */
  function dispatchMenu(intent: MenuIntent): void {
    switch (intent.kind) {
      case 'navigate':
      case 'back':
      case 'set-free-play':
      case 'set-setting': {
        const next = applyIntent(menuState, intent, menuCatalogue);
        const arrived = next.screen === 'leaderboard' && menuState.screen !== 'leaderboard';
        const menuStateBefore = menuState.screen;
        menuState = next;
        /*
         * Applied **now**, not at the next `adopt`. A setting that only took effect on the next run
         * would be indistinguishable from an inert one for as long as a player stayed on this
         * screen, which is exactly how the four of them went unnoticed.
         */
        if (intent.kind === 'set-setting') {
          applyPlaybackSpeed();
          applyTheme();
          if (menuState.settings.reduceMotion) playback?.pause();
          /*
           * The energy axis is a **figure on a sheet**, so the sheet is re-shaped and then the
           * panel is redrawn — GitHub issue #70.
           *
           * `renderAll()` alone was this line, and it was honest about the shell and wrong about
           * the Day report: the filed `ShapedDayReport` already holds its figure list, so redrawing
           * the panel drew the same two kJ tiles again. `dayReportOf` is pure and re-running it is
           * free; `closeShift` is what banks a day and is deliberately not re-entered. See
           * {@link filedReportInput}.
           */
          if (intent.field === 'showEnergyAxis') {
            if (filedReportInput !== undefined) {
              filedReportInput = {
                ...filedReportInput,
                showEnergyAxis: menuState.settings.showEnergyAxis,
              };
              state = { ...state, report: dayReportOf(filedReportInput) };
            }
            renderAll();
          }
          /*
           * The canvas is not part of `renderAll`'s panel sweep, and the playback tick only redraws
           * on a frame change — so without this a theme flip repainted the shell and left the stage
           * on the previous palette until the reader scrubbed. Exactly the half-repaint this feature
           * exists to end, arriving through the render path instead of the palette.
           */
          if (intent.field === 'theme') drawStage();
          drawTransportChrome(viewAt());
          saveSessionNow();
        }
        drawMenu();
        // Started on **arrival**, once, and never from inside a render: a render that fetched would
        // fetch again on every state change its own response caused, and each render would look
        // correct on its own.
        if (arrived) void loadBoards();
        if (next.screen === 'challenge' && menuStateBefore !== 'challenge') void loadChallenge();
        /*
         * Woken on arrival, on the same rule and for a different reason. `loadBoards` and
         * `loadChallenge` are requests whose answers are drawn; this is a request whose answer is
         * discarded, and it is here because *arriving* is the earliest honest signal that a player
         * is about to need the server. The Account screen is the one that pays off: it fires when
         * the screen opens and the request that matters is sent after an address has been typed.
         */
        if (next.screen !== menuStateBefore && WAKING_SCREENS.has(next.screen)) wakeServer();
        return;
      }

      case 'start': {
        /*
         * `docs/16` § 5 clauses 2 and 3, both of which were here.
         *
         * The selection reached `ViewerState` and **nothing ran** — every other state changer in
         * this file calls `runShift()` and this one called `renderAll()`, so Start left the previous
         * recording on screen. And the week was never reset, so `shiftRunConfigOf` went on applying
         * `grownBuilding`'s 11 %/day and `eventFor`'s twist to a run the menu had described as a
         * plain one: on day 7 the building was two thirds fuller than the screen said, with a car
         * possibly held out of service, and nothing anywhere mentioned it.
         *
         * The decision is `menu/enterFreePlay.ts` — pure, and tested by comparing the legs against a
         * run built from the selection alone. This arm performs it.
         */
        /*
         * The week being put down, read **before** the switch — GitHub issue #125, and it is the
         * building select's line one arm over.
         *
         * `enterFreePlay` now parks the campaign week rather than overwriting it
         * (`dev/state.ts#withFreePlayWeek`), and from the outside a parked week and a destroyed one
         * look identical: the ribbon reads day 1 either way. `weekKeptLine` is the sentence that
         * tells the difference, and it is the sentence that says *how* — *pick that building again
         * and it carries on from there* is the recovery path, which on the campaign's own building
         * is a re-pick of the select the player is already looking at.
         */
        const leavingWeek = state.week;
        const entered = enterFreePlay(state, resources, menuState.freePlay, menuCatalogue);
        if (entered === undefined) return;
        // `enterFreePlay` selects the simulation tab — issue #23, and it is in the decision rather
        // than here for the reason that module exists at all.
        state = entered;
        menuState = navigate(menuState, 'main');
        closeMenu('entered-a-mode');
        // A mode is being entered, so the chip latched in the last one does not travel — docs/19
        // defect 12, and {@link resetTransportSpeed} owns the boundary.
        resetTransportSpeed();
        runShift();
        /*
         * After `runShift` and drawn on its own, for the building select's reason: `runShift` spends
         * the notices already on screen, so assigning this one before it would hand it to the line
         * that clears it.
         */
        weekNotice = weekKeptLine(leavingWeek, state.week);
        if (weekNotice !== undefined) drawCoach(viewAt());
        return;
      }

      case 'close':
        /*
         * The way out that is not a mode being entered — issues #40, #33 and #68. `renderAll`
         * rather than `runShift`: leaving the menu is not asking for a different day, and re-running
         * here would throw away the shift the player pressed **Resume** to get back to.
         *
         * **And the one arm that must not latch the filing gate** — issue #117. It is the arm
         * Escape presses, and behind the overlay on a cold load sits boot's own recording, which
         * nobody asked for; letting this count as a choice let that run be filed and become the
         * baseline the next real run was measured against. See `closeMenu`.
         */
        closeMenu('changed-their-mind');
        renderAll();
        return;

      case 'open-campaign':
        /*
         * `docs/16` § 5 clause 6. This arm was `closeMenu()` and nothing else, so picking Campaign
         * dropped the player on whatever tab the shell happened to be on — usually `run`, which is
         * the simulation, not the scenarios. The screen behind the menu is now selected explicitly.
         */
        state = { ...state, tab: 'scenarios' };
        closeMenu('entered-a-mode');
        renderAll();
        return;

      case 'start-endless':
        /*
         * The one arm that both closes the menu **and** runs, because *keep going* is an answer
         * about the week rather than about a screen: `openEndless` puts the player on day one of a
         * building they are already looking at, and leaving the previous day's recording up would
         * show a sheet headed day 1 over legs simulated on some other day.
         *
         * `runShift` is what every state changer in this file calls, and § 5 clause 2 is what
         * happens when one of them forgets.
         */
        state = enterEndless(state);
        menuState = navigate(menuState, 'main');
        closeMenu('entered-a-mode');
        // Mode entry — the latched chip stays behind (docs/19 defect 12, resetTransportSpeed).
        resetTransportSpeed();
        runShift();
        return;

      case 'open-fixit':
        /*
         * The overlay opens over whatever is running; nothing behind it is torn down, so leaving
         * it lands back on the shift exactly as it was — which is what the row's `presentation`
         * scope promises. The menu closes the way `open-campaign` closes it: the player chose a
         * surface, and two overlays stacked would each claim Escape.
         */
        closeMenu('entered-a-mode');
        fixitPanel.open();
        return;

      case 'open-watch':
        /*
         * `open-fixit`'s arm exactly, and for its reasons: the overlay opens over whatever is
         * running, nothing behind it is torn down, and the menu closes because two overlays
         * stacked would each claim Escape.
         *
         * Opening the picker enters **nothing** — a row's `Watch it` does, through
         * `enterWatch`. That split is why the menu row's scope is `presentation`: a list of runs
         * changes no run.
         */
        closeMenu('entered-a-mode');
        watchPanel.open();
        return;

      case 'reopen':
        menuRoot.hidden = false;
        menuState = navigate(menuState, 'main');
        drawMenu();
        /*
         * Opening the Menu is the earliest intent there is, and it is the one that catches the case
         * the screen-entry wake cannot: a player who has been running shifts for twenty minutes has
         * touched no API at all, so the container that served the page has had time to scale back
         * to zero underneath them. Boot is deliberately **not** a wake — `serve.ts` serves this page
         * from the same container, so a page that loaded came out of a process that is awake.
         */
        wakeServer();
        return;

      case 'open-board': {
        if (client === undefined) return;
        const hash = intent.boardKey;
        boardView = { ...boardView, selected: hash, page: undefined, notice: 'Loading…' };
        drawMenu();
        void client.board(hash, 'awtS').then((result) => {
          boardView = result.ok
            ? { ...boardView, selected: hash, page: result.value, notice: undefined }
            : { ...boardView, selected: hash, page: undefined, notice: result.detail };
          drawMenu();
        });
        return;
      }

      case 'beat-score': {
        /*
         * A board row, run — GitHub issue #93 § 1.
         *
         * **Through `applyIntent` and `enterFreePlay`, and not through a second path.** The
         * selection is written into `menuState.freePlay` by the reducer, exactly as if the player had
         * moved all six Free Play selects to the row's values, and the run is entered by the same
         * function **Start** uses. A shortcut that built a `ViewerState` here would be a second way
         * to begin a free-play run, and the first thing the second one would stop doing is resetting
         * the week — which is `docs/16` § 5 clause 3, the defect `enterFreePlay` exists to have
         * ended.
         *
         * The selection is written **even when the run cannot start**, which is why the two lines are
         * in this order. `enterFreePlay` returns `undefined` for a row this build cannot resolve, and
         * leaving the selection behind means the player can press *Free play* and read
         * `freePlayIssues`' own sentence with the offending field named — rather than pressing a row
         * and watching nothing happen. `menu/screens.ts` disables the row with that same sentence, so
         * this is the backstop rather than the notice.
         */
        menuState = applyIntent(menuState, intent, menuCatalogue);
        const entered = enterFreePlay(state, resources, menuState.freePlay, menuCatalogue);
        if (entered === undefined) {
          drawMenu();
          return;
        }
        state = entered;
        menuState = navigate(menuState, 'main');
        closeMenu('entered-a-mode');
        // Mode entry — the latched chip stays behind (docs/19 defect 12, resetTransportSpeed).
        resetTransportSpeed();
        runShift();
        return;
      }

      case 'submit-score': {
        void submitScore();
        return;
      }

      case 'set-challenge': {
        menuState = applyIntent(menuState, intent, menuCatalogue);
        /*
         * Picking a different dispatcher **discards the runs**. They are simulations of a different
         * configuration, and keeping them would let a player run five seeds on one dispatcher, pick
         * another, and post the first one's figures under the second one's name.
         */
        if (intent.field === 'dispatcherProfileId') {
          challengeRecordings = [];
          challengeView = { ...challengeView, runsDone: 0, postRefusal: undefined };
        }
        drawMenu();
        // The board is ordered by the server, so a new metric is a new request rather than a re-sort.
        if (intent.field === 'metric') void loadChallengeBoard();
        return;
      }

      case 'set-calendar': {
        /*
         * The period is placed over **this week's own days** rather than over absolute dates, which
         * is what `periodOnDays` is for: the shift layer has no calendar but `WEEKDAYS`, and a
         * period pinned to day numbers a week has already passed would be on and doing nothing.
         */
        const period = CALENDAR_PERIODS[intent.periodId as CalendarPeriodId] as
          | CalendarPeriod
          | undefined;
        state = {
          ...state,
          calendar: period === undefined ? null : periodOnDays(period, 1, HISTORY_DAYS),
        };
        drawMenu();
        runShift();
        return;
      }

      case 'set-constraint':
        state = { ...state, commissioningConstraintId: intent.constraintId };
        drawMenu();
        return;

      case 'set-commissioning': {
        const authored = buildingConfigOf(resources, state.savedBuildings, state.buildingId);
        if (authored === undefined) return;
        const classes = commissionableClasses(specsWithSaved(resources, state.savedClasses));
        const choices = state.commissioning.length === 0 ? asBuiltChoices(authored, classes) : state.commissioning;
        const current = choices.find((choice) => choice.bankId === intent.bankId);
        if (current === undefined) return;
        const next =
          intent.dimension === 'machineClass'
            ? { ...current, machineClassId: intent.value }
            : intent.dimension === 'shafts'
              ? { ...current, shafts: Number(intent.value) }
              : { ...current, ratedSpeedMps: Number(intent.value) };
        state = { ...state, commissioning: withBankChoice(choices, next) };
        drawMenu();
        /*
         * The fabric is `between-games`, so it takes effect on the next run rather than re-running
         * under the reader — the same rule the dispatcher editor beside it keeps, and the one the
         * mode's whole premise rests on: you choose, and then you live with it.
         */
        return;
      }

      case 'commit-commissioning':
        /*
         * **The fabric stops being a draft** — GitHub issue #48.
         *
         * `state.commissioning` is already written, pick by pick, so this arm changes no choice.
         * What it does is what the screen had no way to say: leave the design phase and open the
         * week on it. `runShift` because the fabric is `between-games` and this is the moment
         * between games — the player has finished choosing, and the run they see next is the one
         * they chose. Every other commit in this switch does exactly this pair.
         *
         * No guard here on `review.admissible`: `menu/screens.ts` disables the row and says why,
         * which is `docs/16` S7's rule that a control which cannot be honoured is not offered. A
         * second check would be a second answer to *may this open a week*, and the two would
         * disagree the day the review gains a gate.
         */
        state = { ...state, tab: 'run' };
        closeMenu('entered-a-mode');
        // Mode entry — the latched chip stays behind (docs/19 defect 12, resetTransportSpeed).
        resetTransportSpeed();
        runShift();
        return;

      case 'reset-commissioning':
        /*
         * Back to as built — the screen's other verb. `[]` is `ViewerState.commissioning`'s *as
         * built* and is byte-identical to the authored building, so this is one step rather than an
         * undo stack: a per-pick history would be a second model of the choices beside the one the
         * reducer holds.
         *
         * `drawMenu` and **not** `runShift`. The player is still on the commissioning screen and
         * has not said they are finished; re-running here would spend a simulation on a fabric they
         * are in the middle of deciding, and would move the shift under the menu they are reading.
         */
        state = { ...state, commissioning: [] };
        drawMenu();
        return;

      case 'run-challenge':
        runChallenge();
        return;

      case 'post-challenge':
        void postChallenge();
        return;

      case 'account-form':
        accountState = updateForm(accountState, intent.patch as Partial<AccountForm>);
        drawMenu();
        return;

      case 'account-submit': {
        if (client === undefined) {
          accountState = withNotice(accountState, NO_SERVER_SIGN_IN);
          drawMenu();
          return;
        }
        /*
         * The client's own rules first, and they are a courtesy rather than a gate: a malformed
         * address refused here costs nobody a mail, and § D242 charges the per-address and
         * per-caller budgets *before* it looks at the account — so a typo spent on the server is a
         * budget spent on whoever owns that address.
         */
        const issues = formIssues(accountState);
        if (issues.length > 0) {
          accountState = withNotice(accountState, issues.map((issue) => issue.message).join(' '));
          drawMenu();
          return;
        }
        void (namingStage(accountState) ? chooseDisplayName(client) : askForLink(client));
        return;
      }

      case 'sign-out': {
        const token = accountState.token;
        accountState = signedOut('Signed out.');
        drawMenu();
        // The local state is cleared first and the server is told second. A sign-out that waited for
        // the network would leave a player looking signed in while their connection was down.
        if (client !== undefined && token !== undefined) void client.logout(token);
        return;
      }
    }
  }

  /* ---------------------------------------------------------------------- *
   * Signing in — § D241, and the four things a link flow has to get right
   * ---------------------------------------------------------------------- */

  /**
   * Say something now, and say something else if it takes a while. Returns the way to stop.
   *
   * § D243 § 4 measured a **28.7 s** cold start against the live app, so a request on this surface
   * is allowed to take about half a minute and be perfectly healthy. Two obvious responses are both
   * wrong. Cancelling it reports `unreachable` — *"the leaderboard server could not be reached"* —
   * about a server that is reachable and starting, which is the one sentence in `CLIENT_FAILURES`
   * that would be a lie here. Saying nothing for thirty seconds is indistinguishable from a hang,
   * and a player who reloads mid-request has spent one of § D242's three per-address links.
   *
   * So nothing is cancelled — `menu/client.ts` sets no timeout and no `AbortSignal`, and asserts
   * that about itself — and the *wording* escalates instead. The timer is beside the request rather
   * than inside the client, because the client has no screen to write to.
   */
  function startWaiting(first: string): () => void {
    accountState = pending(accountState, first);
    announceWait(first);
    drawMenu();
    /*
     * One timer per rung rather than one repeating tick, so a rung is announced exactly when it is
     * reached and never re-announced. `aria-live` re-reads on every write, and a polite region
     * rewritten every second is a screen reader talking over the player for half a minute.
     */
    const timers = WAIT_LADDER.map((rung) =>
      window.setTimeout(() => {
        accountState = pending(accountState, rung.text);
        announceWait(rung.text);
        drawMenu();
      }, rung.afterMs),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      announceWait('');
    };
  }

  /**
   * Say it to a screen reader as well as to the screen.
   *
   * A **visually hidden** region rather than a second visible line: the words are already on the
   * panel, and printing them twice would be two copies for a sighted reader to reconcile. The
   * `role="status"` plus `aria-live="polite"` pair is deliberate belt and braces — some readers key
   * off the role and some off the attribute — and *polite* rather than *assertive* because a wait
   * is not an alert and must not interrupt whatever the player is reading.
   *
   * It is written **only on a band change**, which is what one-timer-per-rung buys: a region
   * rewritten on a tick would be read out again on every tick.
   *
   * Nothing here animates, so there is nothing for `settings.reduceMotion` to suppress — the
   * escalation is a change of words, which a reader who has asked for less motion still wants.
   */
  function announceWait(text: string): void {
    waitLiveRegion.textContent = text;
  }

  /**
   * Ask for a sign-in link — the whole of what this screen collects.
   *
   * The 202 is shown in the **server's** words. It is identical whether or not the address has an
   * account (§ D241 § 7), and a client that added *"welcome back"* or *"we have created your
   * account"* to it would rebuild the account-enumeration oracle in prose after the server went to
   * some trouble to close it on the wire.
   *
   * The 429 is the one refusal this file reads a field out of. § D242 gives a duration and
   * deliberately does not say **which** of the two budgets was spent, because naming it would leak
   * whether anybody else has been asking about the address; the duration is carried into the state
   * so the form stops offering a second request the server has already promised to refuse.
   */
  async function askForLink(api: LeaderboardClient): Promise<void> {
    const done = startWaiting('Asking for a sign-in link…');
    const result = await api.requestLink(accountState.form.email.trim());
    done();
    if (result.ok) {
      accountState = linkRequested(accountState, result.value);
      drawMenu();
      return;
    }
    const retryInMs = linkRetryInMsOf(result);
    if (retryInMs === undefined) {
      accountState = withNotice(accountState, result.detail);
      drawMenu();
      return;
    }
    accountState = rateLimited(accountState, result.detail, retryInMs);
    drawMenu();
    // The gate lifts on its own. A refusal a player has to guess their way out of is a refusal that
    // teaches them the screen is broken.
    window.setTimeout(() => {
      accountState = retryAllowed(accountState);
      drawMenu();
    }, retryInMs);
  }

  /**
   * Name yourself, once — § D241 § 7, and the second request the oracle forced.
   *
   * A name cannot travel with the link request, because a form that asked for one *only when the
   * address was new* would say whether the address was new. So the account is minted with a
   * generated name, `displayNameChosen` says so on the wire, and this is the rename over a session
   * that already proves the address.
   *
   * **409 is reported as taken**, unlike a taken address, and the asymmetry is deliberate: a
   * display name is drawn on every board, so it is already public.
   */
  async function chooseDisplayName(api: LeaderboardClient): Promise<void> {
    const token = accountState.token;
    if (token === undefined) return;
    const done = startWaiting('Saving your name…');
    const result = await api.setDisplayName(token, accountState.form.displayName.trim());
    done();
    accountState = result.ok
      ? signedIn(accountState, token, result.value)
      : withNotice(accountState, result.detail);
    drawMenu();
  }

  /**
   * Redeem a mailed link out of the URL fragment, then get rid of it.
   *
   * ## Why the token is in the fragment, and why this is the half that finishes the job
   *
   * § D241 § 4. A fragment is **never transmitted**, so a mail client, a scanner or a corporate
   * link-rewriting appliance that fetches the URL cannot carry the token anywhere, let alone spend
   * it; and it keeps the token out of access logs, ingress traces and `Referer`. That property is
   * about the *link*. It says nothing about the address bar the player is now looking at, which is
   * shoulder-surfable, copy-pasteable into a bug report and preserved by a reload — so the fragment
   * is cleared here.
   *
   * **Cleared before the request, not after it.** A reload during a 28.7-second cold start would
   * otherwise re-send a token that the first attempt is in the middle of spending, and the second
   * attempt would come back `link-spent` — a correct refusal to an honest player, produced by this
   * file rather than by anything they did.
   *
   * The token is never put into a notice, a log or a URL this build constructs. The three refusals
   * that can come back — expired, spent, invalid — are the server's own sentences, and each is
   * worded around whether asking again will help.
   */
  async function redeemLinkFromHash(): Promise<void> {
    const linkToken = new URLSearchParams(window.location.hash.replace(/^#/u, '')).get('sign-in');
    if (linkToken === null || linkToken === '') return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    // Opening a link is a request to sign in, so the screen that shows the outcome is the one the
    // player is put on. A result written to a panel nobody navigates to is a result nobody reads.
    menuState = navigate(menuState, 'account');
    if (client === undefined) {
      accountState = withNotice(accountState, NO_SERVER_SIGN_IN);
      drawMenu();
      return;
    }
    const done = startWaiting('Signing you in…');
    const result = await client.redeem(linkToken);
    done();
    accountState = result.ok
      ? signedIn(accountState, result.value.token, result.value.user)
      : signedOut(result.detail);
    drawMenu();
  }

  /**
   * Post the run on screen — `menu/client.ts#submit`'s first non-test caller.
   *
   * ## Three refusals before a request, and none of them is a guess
   *
   * The **claimed** metrics are read straight off the recording this browser produced, and the
   * server re-runs the configuration and compares. So nothing here has to be trusted, and nothing
   * here tries to be clever: an honest client sends what it measured.
   *
   * What it must not do is send a run the server *cannot* reproduce. `runIdentityIssues` is that
   * predicate — the same one `provenanceLineOf` asks (`docs/16` S5) — and a run carrying day 7's
   * growth or a held car fails it. Without the check the server would reject those as forgeries,
   * spending the one accusation this product makes on a client bug.
   *
   * A saturated run is refused here too, and it is refused *by the same comparison the server
   * makes*: `awtIsValid` travels with the submission, so a client claiming a valid mean for a
   * diverging queue is caught as a wrong claim rather than silently corrected and ranked anyway.
   */
  async function submitScore(): Promise<void> {
    /*
     * Issue #21: all three of these were a bare `return`.
     *
     * **Post this run** is drawn as a filled primary action, and a filled primary action that
     * consumes a click and produces nothing at all is worse than a disabled one — the player
     * cannot tell whether it worked, whether it is still going, or whether the screen is broken.
     * `menu/screens.ts` disables the row and supplies a `disabledWhy` for each of these cases, and
     * that is the right place for the affordance; this is the backstop for every route that reaches
     * the handler anyway, and it costs three sentences.
     *
     * The sentences are distinct on purpose, for `leaderboardBody`'s own reason: *there is no
     * server* is about the deployment, *there is no run* is about the screen, and *nobody is
     * signed in* is about the player. One sentence for all three would tell a signed-in player
     * with a finished run to sign in.
     */
    const recording = state.recording;
    if (recording === undefined) {
      accountState = withNotice(
        accountState,
        'There is no finished run to post yet. Run a shift from Scenarios or Free play, then come ' +
          'back — the run on screen is what gets posted.',
      );
      drawMenu();
      return;
    }
    if (client === undefined) {
      accountState = withNotice(accountState, NO_SERVER_POST);
      drawMenu();
      return;
    }
    const token = accountState.token;
    if (token === undefined) {
      accountState = withNotice(accountState, postingRefusal(accountState) ?? NO_SERVER_SIGN_IN);
      drawMenu();
      return;
    }

    /*
     * The fourth refusal — **the predicate this function's own docstring names, finally called
     * here.** GitHub issue #129.
     *
     * The docstring above has said since it was written that *"what it must not do is send a run
     * the server cannot reproduce. `runIdentityIssues` is that predicate"*, and this handler did
     * not ask it. The only gate was the affordance: `menuHost.runState` computes the same issues,
     * `menu/screens.ts` disables the row and draws `rankingRefusal` beside it. That is the right
     * place for the *affordance* and it is not a gate — which is issue #21's own argument about the
     * three refusals above it, in as many words: *"this is the backstop for every route that
     * reaches the handler anyway"*. Three of the four had one and the load-bearing one did not.
     *
     * It matters more now than it did. #129 moved a commissioned fabric and a calendar period from
     * *silently posted and refused as a forgery* to *refused here by name*, so this predicate is
     * the thing standing between a shipped feature and the one accusation this product makes. A
     * refusal that exists only in a disabled button is a refusal one keyboard route away from not
     * existing.
     */
    /*
     * **The run on screen has to be the run this shell simulated** — Everyday Mode slice 8, and the
     * same object-identity gate `closeShift` already uses.
     *
     * Found while wiring the spectator state, and it is **not only** about watching. `submitScore`
     * posts `claimedMetricsOf(recording.summary)` — the metrics of whatever is on screen — under
     * `state.buildingId`, `state.dispatcherId` and `state.seed`, which are the **player's own**
     * selection. Those two describe the same run for a run this shell simulated and describe
     * different runs for any other:
     *
     * - while **watching**, `state.recording` is somebody else's day and the selection is the
     *   spectator's;
     * - for a recording **loaded from a file** (issue #136), they have never agreed, and that hole
     *   predates this slice.
     *
     * Either way the server replays the submitted seed, does not reproduce, and answers
     * `422 metrics-do-not-reproduce` — *"this product's one accusation, aimed at a player who did
     * nothing wrong"*, which is `scope/runIdentity.ts`'s own sentence about exactly this shape.
     * `runIdentityIssues` below cannot see it: it inspects the **state**, and the state is
     * perfectly reproducible. What is wrong is the *recording beside it*.
     *
     * So the gate is `bankingRefusalFor`, reused rather than restated — one answer to *is the run on
     * screen this shell's own?*, now asked by both the thing that banks a day and the thing that
     * posts one.
     */
    const notOurs = bankingRefusalFor(recording, simulatedRecording);
    if (notOurs !== null) {
      accountState = withNotice(accountState, `This run cannot be posted: ${notOurs}.`);
      drawMenu();
      return;
    }

    const identity = runIdentityIssues(state, resources, 'ranked');
    if (identity.length > 0) {
      accountState = withNotice(
        accountState,
        `This run cannot be posted: ${identity.map((issue) => issue.message).join('; ')}.`,
      );
      drawMenu();
      return;
    }

    /*
     * The fifth refusal, and the one that used to be a `?? 0`. See `claimedMetricsOf`: an
     * unmeasured long-wait share written as zero is a wrong claim, and the server answers a wrong
     * claim by refusing the submission as a forgery.
     */
    const claim = claimedMetricsOf(recording.summary);
    if (!claim.ok) {
      accountState = withNotice(accountState, claim.detail);
      drawMenu();
      return;
    }

    // Same escalation as the sign-in path: the server this posts to is the one § D243 measured at
    // 28.7 s cold, and a primary action that goes quiet for half a minute reads as the dead button
    // #21 is about.
    const done = startWaiting('Posting this run…');
    const result = await client.submit(token, {
      run: {
        buildingId: state.buildingId,
        dispatcherProfileId: state.dispatcherId,
        // `state`, never `menuState.freePlay` — see {@link shiftSubmittedSelection}. These two lines
        // read the menu until § D318, and the comment below already held the argument against it.
        ...shiftSubmittedSelection(
          resources,
          state,
          buildingConfigOf(resources, state.savedBuildings, state.buildingId),
        ),
        durationS: state.shiftLengthS,
        // `state`, not `menuState.freePlay`, and the distinction is the same one the two lines above
        // now obey: this is the window the run *was simulated with*, and the menu holds the window
        // currently *selected*. They agree until somebody changes the selection after a run and
        // before posting, and then only one of them describes the seed the server is about to
        // replay. § D285.
        windowStartS: state.windowStartS,
        seed: state.seed.toString(),
        /*
         * § 11.5's rules and § 1.4's log, spread rather than written as `ruleRows: state.ruleRows`
         * — GitHub issue #179.
         *
         * The spread is the same decision `shiftRunConfigOf` makes at the same two fields and for
         * the same reason: `core` pins a run with no `interventions` key byte-identical to one built
         * before the field existed, `profileWithRules` returns the profile by object identity for an
         * empty list, and the server drops an empty list from its digest. Writing `[]` on the wire
         * would be a claim the run never made, and would re-digest every score already posted.
         *
         * `state`, never the menu, for the reason the two lines above give: this is what the run was
         * *simulated with*, and `runIdentityIssues` has already refused any state whose log holds a
         * kind the wire may not carry.
         */
        ...(state.ruleRows.length === 0 ? {} : { ruleRows: state.ruleRows }),
        ...(state.interventions.length === 0 ? {} : { interventions: state.interventions }),
      },
      claimed: claim.claimed,
    });
    done();
    accountState = withNotice(
      accountState,
      result.ok ? 'Posted. The server replayed your seed and it reproduced.' : result.detail,
    );
    drawMenu();
    /*
     * **The board is re-read after a 201** — GitHub issue #112, and it is the correctness half of
     * that issue rather than a courtesy.
     *
     * This ended at `drawMenu()`. The server had just created an entry and answered with it, and the
     * screen went on drawing the board list it had fetched on arrival — which, on a first visit to a
     * fresh deployment, is the sentence *"No scores have been posted yet."* So the one action the
     * whole surface exists for returned 201 and the screen said the opposite, and the only way to
     * see the row was to reload the page.
     *
     * A refetch rather than an optimistic insert. The submission's own answer carries the accepted
     * entry, but the board it belongs on is keyed by a digest the *server* computed over the run and
     * the loaded `data/`, and this browser does not compute that digest. Splicing the row into
     * whichever board happened to be selected would be this client guessing which board it is on —
     * and a row shown on the wrong board is a worse failure than a row shown a round-trip late.
     */
    if (result.ok) void loadBoards();
  }

  /*
   * The Everyday settings screen's Motion row, wired to **this** menu's switch rather than to a
   * second value — `everyday/engineerBridge.ts` has the whole argument. The write goes through
   * `dispatchMenu` as the same `set-setting` intent `menu/screens.ts`'s `settings.reduce-motion`
   * toggle dispatches, so the application (`playback?.pause()`), the redraw and `saveSessionNow()`
   * all happen exactly as they would from the Engineer menu, and the two surfaces cannot disagree.
   */
  const engineerSettingsBridge: EngineerSettingsBridge = {
    reduceMotion: () => menuState.settings.reduceMotion,
    setReduceMotion: (value) => {
      dispatchMenu({ kind: 'set-setting', field: 'reduceMotion', value: value ? 'on' : 'off' });
    },
  };
  provideEngineerSettings(engineerSettingsBridge);

  const menuHost: MenuPanelHost = {
    doc: document,
    catalogue: menuCatalogue,
    state: () => menuState,
    dispatch: dispatchMenu,
    account: () => accountState,
    leaderboard: () => boardView,
    viewMode: () => state.mode,
    /*
     * Handed over **even with no server** — issue #32, and the change is one word.
     *
     * This returned `undefined` when there was no client, which sent `challengeBody` down its own
     * fallback and printed the sentence #29 is about. The screen now always has a
     * `ChallengeScreenInput`, so the sentence a player reads is `challengeView.notice`, which this
     * file authored: what a challenge is, what is scored, what *the same seeds* buys, and how a set
     * is submitted. None of that depended on the server, and four of #32's five questions were
     * unanswerable only because the screen had nowhere to put the answer.
     */
    challenge: () => challengeView,
    /*
     * GitHub issue #28's one line, and the shell is the only thing that can write it.
     *
     * The origin comes from a `<meta>` tag read at run time (§ D215 § 4, § D243), so the same bytes
     * are a connected build behind a server and an unconnected one behind a CDN — `menu/screens.ts`
     * cannot tell and correctly says nothing when nobody has. `client` is `undefined` exactly when
     * that lookup found no origin, which is the same fact `open-board` and `account-submit` already
     * branch on, so this introduces no second answer to *is there a server*.
     */
    hasServer: () => client !== undefined,
    /*
     * Issues #90 and #98's one line, and the shell is the only thing that can write it: the answer
     * comes from `loadSession` against this browser's `localStorage`, which `menu/screens.ts` has no
     * dependency on. See {@link loadedWithNothingRestored} for why it is latched at boot rather than
     * re-read here.
     */
    firstVisit: () => loadedWithNothingRestored,
    shell: shellBehindMenu,
    calendarPeriodId: () => state.calendar?.id ?? '',
    commissioning: () => commissioningInput(),
    runState: () => {
      const issues = runIdentityIssues(state, resources, 'ranked');
      return {
        hasRun: state.recording !== undefined,
        rankingRefusal: issues.length === 0 ? undefined : issues.map((issue) => issue.message).join('; '),
        /*
         * Whether the shift behind the overlay is one the player has any relationship with —
         * `docs/19`'s Resume copy nit. On a **genuinely first** load the recording on screen is
         * boot's own (issue #97 requires Resume enabled over it), yet *"Back to the shift on
         * screen"* claims a shift the player has never seen. Two facts only this file holds
         * decide it: the menu has been dismissed this sitting ({@link menuHasBeenDismissed} —
         * they have been out there), or the session restored (`!loadedWithNothingRestored` — a
         * previous sitting's shifts are theirs). `menu/screens.ts#resumeRow` words the row; this
         * carries the facts, which is the split every panel keeps.
         */
        everLeftTheMenu: menuHasBeenDismissed || !loadedWithNothingRestored,
      };
    },
  };

  /**
   * The fabric screen's whole input, derived from the same three things the run derives from.
   *
   * Built fresh on every draw rather than held: it is a pure function of the building, the saved
   * classes and the choices, and a cached copy would be a second answer to *what may this bank
   * take* — which is precisely the question a stale one would get wrong after the reader saved a
   * machine class.
   */
  function commissioningInput(): CommissioningScreenInput | undefined {
    const authored = buildingConfigOf(resources, state.savedBuildings, state.buildingId);
    if (authored === undefined) return undefined;
    const specs = specsWithSaved(resources, state.savedClasses);
    const classes = commissionableClasses(specs);
    const choices = state.commissioning.length === 0 ? asBuiltChoices(authored, classes) : state.commissioning;
    const constraint = constraintById(state.commissioningConstraintId) ?? CONSTRAINTS[0];
    if (constraint === undefined) return undefined;
    const review = reviewCommissioning({ base: authored, choices, classes, specs, constraint });
    return {
      buildingName: authored.name,
      constraintId: constraint.id,
      choices,
      review,
      optionsFor: (bankId) => {
        const choice = choices.find((entry) => entry.bankId === bankId);
        const machineClass = classes.find((entry) => entry.id === choice?.machineClassId);
        return {
          /*
           * Derived from the building and the class rather than listed. The shaft ladder spans one
           * fewer than the bank has to four more, because those are the moves a player actually
           * makes; the speed ladder is the **class's own declared band**, so a speed outside it is
           * not offered rather than offered and refused (`docs/16` S7).
           */
          shafts: shaftChoices(choice?.shafts ?? 1).map((n) => ({ id: String(n), name: String(n) })),
          machineClass: classes.map((entry) => ({ id: entry.id, name: entry.name })),
          ratedSpeed: speedChoices(machineClass).map((speed) => ({
            id: String(speed),
            name: `${speed.toFixed(2)} m/s`,
          })),
        };
      },
    };
  }

  /**
   * Everything the overlay covers — issues #33 and #68, and the shell naming its own.
   *
   * Derived from `document.body` rather than listed, minus the two things this file appended to it,
   * so an element added to `index.html` is covered on the day it lands. A hand-written list of the
   * page's top-level elements would be the shape this repository keeps finding stale, on a guard
   * whose going stale is silent: the shell would look right and one more thing behind the menu would
   * be reachable.
   *
   * The two exemptions are both this file's own. The overlay cannot cover itself. And
   * {@link waitLiveRegion} is a `role="status"` that announces **the menu's** own waits — a sign-in
   * link taking half a minute (§ D243 § 4) — so hiding it from assistive technology while the menu
   * is up would silence the one region the menu speaks through.
   *
   * Read fresh on every draw rather than captured once: `boot` appends both exemptions before the
   * first `drawMenu`, and a list taken at mount would be a snapshot of a page that is still being
   * assembled.
   */
  /**
   * What sits behind this menu, for `menuPanel.ts#coverShell` to take out of the page.
   *
   * **The Everyday shell is excluded, and that exclusion is a fix.** `everyday/shell.ts` mounts its
   * own root as a sibling of `div.shell` and covers this whole surface; without the third clause
   * below, opening this menu behind it wrote `inert` onto the Everyday root, and the front door the
   * application boots on became unclickable — silently, because `inert` reports no error and paints
   * no differently.
   *
   * It is excluded rather than the Everyday shell defending itself, for the reason `coverShell`'s
   * own docstring gives: *the shell's own elements are not that file's to disable*, and this
   * function is the shell naming what it is. The Everyday root is not part of it.
   */
  function shellBehindMenu(): readonly HTMLElement[] {
    return [...document.body.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        child !== menuRoot &&
        child !== waitLiveRegion &&
        !child.classList.contains(EVERYDAY_ROOT_CLASS),
    );
  }

  function drawMenu(): void {
    renderMenu(menuRoot, menuHost);
  }

  /**
   * Leave the menu — and the one place either latch is set.
   *
   * Four of the five ways out are a mode being entered: **Start** (free play), **Open the doors**
   * (the campaign), **Keep going** (endless) and **Open the week on this fabric** (commissioning).
   * **Resume** is the other, and it is a change of mind rather than a choice — GitHub issue #40, and
   * the intent Escape presses.
   *
   * ## Why the caller has to say which, and may not omit it — GitHub issue #117
   *
   * This latched `playerHasChosen` unconditionally, on every arm, and the docstring argued for it:
   * a player who pressed **Resume** has left the menu on purpose and a run they re-roll should play.
   * That argument is sound about **autoplay** and false about **filing**, and one flag could not
   * hold both. Boot's own `runShift()` has a full recording on screen before the player has touched
   * anything, and un-gating `closeShift` from Resume let that recording be filed as a real day and
   * become the baseline the *next* run was differenced against — #117's phantom `was`.
   *
   * So {@link menuHasBeenDismissed} is set on every arm and {@link playerHasChosen} only on a mode
   * — this overlay's half of the question; {@link playerStartedARun} is the other latch site, for
   * a run the player starts from the shell itself (`docs/19` defect 1).
   * The two are still latched **here** rather than in the five arms, which is the property the
   * previous docstring was protecting and it survives: a sixth way out of the overlay cannot forget
   * to answer, because {@link exit} is a required parameter with two values and no default. That is
   * `shift/report.ts`'s own rule about `ReportSubject` — *a required field cannot be forgotten by
   * the next mode that arrives; a default would let the same bug ship again in silence.*
   *
   * Resume itself starts nothing — there is no `adopt` on that path — so the shift on screen stays
   * where the playhead left it either way.
   *
   * **It redraws**, because the overlay's `hidden` is what `menuPanel.ts#coverShell` reads to decide
   * whether the shell behind is `inert`. Setting `hidden` without drawing would hide the menu and
   * leave the page underneath it out of the accessibility tree and unclickable — issue #68 with the
   * sign flipped, and the reason the covering is keyed on one value with one writer.
   *
   * @param exit whether this way out is a play mode being entered, or the player changing their
   *   mind about having opened the menu at all.
   */
  function closeMenu(exit: 'entered-a-mode' | 'changed-their-mind'): void {
    menuRoot.hidden = true;
    menuHasBeenDismissed = true;
    if (exit === 'entered-a-mode') playerHasChosen = true;
    drawMenu();
  }

  /**
   * The filing gate's second latch site: the player started a run on purpose — `docs/19` defect 1.
   *
   * {@link closeMenu} latches {@link playerHasChosen} where a mode is entered, and that set was
   * complete only for players who never reload: after a reload the natural way out is **Resume**
   * (a change of mind, correctly no latch), and every run then started with **Run this shift**,
   * *Save it and run it*, *Open the doors on tomorrow* or a scenario card completed and silently
   * failed to file. Those controls are this function's two callers:
   *
   * - `wireTransport`'s Run button — the control the empty sheet's own copy names; and
   * - `MountContext.runShift` — the one seam every panel's explicit run-this press goes through
   *   (the scenario cards, the dispatcher editor's *Save it and run it*, the report's next-day
   *   button, the right rail's re-run cards, the building and traffic editors' apply-and-run).
   *
   * Latching **here** and not inside {@link runShift} is the § D232 line held: `runShift` is also
   * boot's own call and the menu's `set-calendar` refresh, and a latch inside it would let a page
   * nobody chose to play file boot's recording — issue #117's phantom, restored by the fix for its
   * shadow. The latch is on the press, before the worker answers, because the choice is the press:
   * a run that then refuses or is cancelled changes what is on stage, not what the player asked
   * for.
   */
  function playerStartedARun(): void {
    playerHasChosen = true;
  }

  drawMenu();

  /**
   * Whether the transport restarts at the end.
   *
   * A boot-scope boolean rather than `#loop.checked`, because `#loop` is a `.chip[aria-pressed]`
   * now (`docs/12` § 4.7) and a button has no checked state. The element carries the same fact in
   * `aria-pressed`, written by {@link setLooping} and read by nothing — one source, one writer.
   */
  let looping = false;

  /* ---------------------------------------------------------------------- *
   * The race — GAMEPLAY §7.4, Everyday slice 4d
   * ---------------------------------------------------------------------- */

  /**
   * Who the player is racing — closure state on `bankFilter`'s and {@link looping}'s precedent,
   * deliberately **not** a `ViewerState` field: the pick changes which *comparison* recording is
   * made and never a leg of the player's own run, so persisting it or probing it as a run input
   * would claim an effect it does not have. It seeds `'none'` so boot costs no second simulation
   * — *nobody* is simply not issuing the second request (`dev/ghostRun.ts`).
   */
  let ghostPick: GhostPick = 'none';
  /**
   * The rival's finished recording, adopted **read-only beside** the primary — never assigned to
   * `state.recording` or {@link simulatedRecording}, so `bankingRefusalFor`'s identity gate
   * refuses it by construction and it can touch neither `dayClosed`, the week, nor the board.
   * `ghostRun.test.ts` asserts that refusal on a real pair rather than trusting this sentence.
   */
  let ghostRecording: VizRecording | undefined;
  /** Why the pick produced no run (`ghostPlanOf`'s `refused` arm), for the verdict slot. */
  let ghostRefusal: string | undefined;
  /** Whether the job in flight on {@link shiftRunner} is the rival's — see {@link scheduleGhost}. */
  let ghostInFlight = false;
  /** The plan behind the run on screen, held so a pick change can re-race without re-planning. */
  let lastShiftPlan: ShiftRunConfig | undefined;
  /** What the strip geometry was last drawn for — see {@link drawRaceStrip}'s keying. */
  let lastRaceKey = '';

  /* ---------------------------------------------------------------------- *
   * Watching somebody else's run — GAMEPLAY § 14.1, ENGINE_CONTRACT § 1.5
   * ---------------------------------------------------------------------- */

  /**
   * Everything the shell has to put back when `⤺ Stop watching` is pressed.
   *
   * § 14.1: *"stopping the watch returns you exactly where you were."* That is a promise about
   * **state**, not about a redraw, and the only way to keep it is to hold the state rather than to
   * recompute it — a rebuild would put the player back on *a* run rather than on *their* run, at
   * whatever playhead the rebuild happened to produce.
   *
   * The playhead is in here for exactly that reason and is the field a reader is most likely to
   * think unnecessary. It is the one a spectator visibly loses: `adopt` builds a fresh `Playback`
   * at the start of the recording, so without this a player who paused their own day at 09:41 to
   * look at somebody else's would come back to 06:00 on a run they had already watched two-thirds
   * of. `main.test.ts` asserts the round trip on all four — recording, report, week and playhead.
   */
  interface WatchedBefore {
    readonly state: ViewerState;
    /*
     * {@link simulatedRecording} is deliberately **not** in here, and its absence is the design.
     *
     * The obvious snapshot saves it, clears it and puts it back — and that would make this the
     * second writer of a field `main.progression.test.ts` requires to have exactly one, which it
     * caught on the first run of this code. The guard is right and the shape was wrong: a watch
     * never touches the field at all. While watching, `state.recording` is the watched run and
     * `simulatedRecording` is still the player's own, so `bankingRefusalFor`'s identity comparison
     * fails and refuses; on stop, `state.recording` becomes the player's own run again — the same
     * object — and the comparison succeeds without anything having been restored.
     *
     * So the spectator lock is *the field not moving*, which is a stronger guarantee than a
     * save-and-restore: there is no window in which a bug could put it back early.
     */
    readonly ghostRecording: VizRecording | undefined;
    readonly ghostRefusal: string | undefined;
    readonly ghostPick: GhostPick;
    readonly startOfDayS: number | undefined;
    readonly filedRunId: string | undefined;
    readonly playheadS: number | undefined;
    /**
     * Whether the player's own run was **playing** when they left it.
     *
     * The playhead alone is not *"exactly where you were"*, and the browser tier is what said so: a
     * player who had paused at 08:30 came back to 08:31 and climbing, because `adopt` autoplays.
     * One second of drift is not a rounding artefact — it is a run that resumed on its own, which
     * is the same class of surprise as the speed chip latching across a mode (`docs/19` defect 12).
     */
    readonly wasPlaying: boolean;
    /**
     * The speed chip the player had latched — `docs/20` defect 10, and the same defect `docs/19`
     * defect 12 found one mode door over.
     *
     * Entering a watch is a **mode entry**: the run on the stage is a different day, of a different
     * length, that the player did not start. The chip they latched belongs to the thing they left,
     * and at ×900 a shipped reference run is over about a second and a half after `Watch it` — the
     * audit measured 06:22 of a record ending ~06:26. So {@link enterWatch} calls
     * {@link resetTransportSpeed} exactly as every other mode door does.
     *
     * It is saved here for the *other* half of § 14.1, which the mode doors have no equivalent of:
     * *"stopping the watch returns you exactly where you were."* A reset with no restore would put
     * the player back on their own run at a speed they never chose — the same surprise, aimed the
     * other way — so the chip goes back with the playhead and the pause state.
     */
    readonly baseSpeed: number;
  }

  /** The run being watched and what to put back, or `undefined` when nobody is being watched. */
  let watching:
    | { readonly run: WatchableRun; readonly view: WatchingView; readonly before: WatchedBefore }
    | undefined;

  /**
   * Whether the shell is in the spectator state — the one question every disabling reads.
   *
   * A function over one field rather than a second boolean, because two facts that must agree is
   * how a control comes to be enabled during a watch: `docs/16` S1's rule, and the reason
   * `ViewerState.playMode` is a field rather than an inference one module over.
   */
  function isWatching(): boolean {
    return watching !== undefined;
  }

  const clock = systemClock();

  /**
   * The shift, run off the painting thread — the UI readiness audit's B3.
   *
   * `dev/shiftRunner.ts` holds the whole argument: why the config crosses whole rather than being
   * re-derived, why the clone is faithful, why there is no progress bar and why cancellation is
   * `terminate()`. This is its one non-test caller.
   *
   * The **Run this shift** button is the cancel button while a run is in flight. That is one
   * control rather than two, and it is the control the player is already looking at: the primary
   * action of the ribbon is *make this run happen*, and while one is happening its opposite is the
   * only thing that action can honestly mean. It also needs no new element on a page whose markup
   * is canonical (`docs/12` § D174).
   */
  /*
   * The `recomputing` beat — contract § 1.4: re-simulate synchronously below ~400 ms; above it,
   * a beat rather than a freeze. The re-run is a worker round trip, so the stage never freezes;
   * what the beat buys is the stamp slot saying *why* the day is about to change under the
   * playhead. Armed on press by {@link appendIntervention}, shown only once 400 ms of wall clock
   * have genuinely passed — a 181 ms building must not flash it — and settled by *whatever* ends
   * the run. Wall clock, deliberately: this measures the player's wait, which is the one duration
   * the kernel's clock cannot see.
   *
   * **Declared above the runner that settles it, and that placement is the fix rather than a
   * filing choice.** The settle happens in `onRunning(false)` — the one hook that sees a success,
   * a cancel and a failure alike — so the state it clears must exist before the runner is
   * constructed. It did not: these three sat with the strip a hundred lines below, and only an
   * accident of boot order (nothing starts a run in between) kept a `ReferenceError` off the
   * page. The strip's own elements stay where they are; only the state moves, because
   * `settleRecompute` touches no DOM.
   */
  let interventionRecomputeTimer: number | undefined;
  let interventionRecomputing = false;
  const settleRecompute = (): void => {
    if (interventionRecomputeTimer !== undefined) window.clearTimeout(interventionRecomputeTimer);
    interventionRecomputeTimer = undefined;
    interventionRecomputing = false;
  };

  const shiftRunner = createShiftRunner({
    spawn: spawnRunWorker,
    clock,
    onStatus: (text) => {
      setText(ui.transport.status, text);
    },
    onRunning: (running) => {
      /*
       * The transport is deliberately **not** disabled here. The recording on screen is the one
       * from before, it is complete, and it plays: `dev/batchPanel.ts`'s own line — *"the page is
       * still yours while this runs"* — is the whole point of moving off the main thread, and
       * greying the transport out would give back the thing that was bought.
       */
      ui.coach.run.textContent = running ? 'Cancel this run' : 'Run this shift';
      /*
       * Whatever ends, the rival is no longer in flight — completion clears it in the ghost
       * job's own callback, and this is the one hook that also sees a cancel and a failure, so
       * the race strip's *waiting* line can never outlive the run it was waiting for.
       */
      if (!running) {
        ghostInFlight = false;
        /*
         * And neither can the intervention strip's `recomputing` beat — review finding 4. The
         * success path settles it in its own `runShift` callback; a failed or cancelled re-run
         * never reaches that callback, and a beat left standing would promise a recompute that
         * stopped happening. Idempotent when no timer is armed, so ordinary runs pay nothing.
         */
        settleRecompute();
      }
    },
    onFailed: (message) => {
      failRun(message);
    },
  });
  /*
   * The elapsed line, ticked from here rather than from inside the runner.
   *
   * One interval for the life of the page rather than one started and stopped per run: `tick()` is
   * a no-op when nothing is running, so the alternative buys nothing and adds two more transitions
   * to keep in step with the worker's. 500 ms because the line counts whole seconds — a faster tick
   * would redraw the same string.
   */
  window.setInterval(() => {
    shiftRunner.tick();
  }, 500);
  /**
   * The legend's fill, keyed on the bands themselves.
   *
   * `WAIT_BANDS` is frozen, so the key never changes and the row is built exactly once however many
   * times `renderAll` runs — the same guard `leftRail.ts` uses, for the same reason: a `fill` on
   * every state change drops hover, and hover is how the reader reads a `title`.
   */
  const fillLegend = keyedFill(ui.stage.legend);
  /**
   * The four count cells, held from the one build `fillLegend` ever does.
   *
   * The counts are live and the row is not: rebuilding four entries every frame would churn the
   * accessibility tree sixty times a second and would drop a hover mid-read, which is the exact
   * cost `fillLegend`'s docstring above exists to avoid. So the structure is keyed on the frozen
   * band set and built once, and the playhead only ever writes text into these four nodes.
   */
  let legendCountCells: readonly HTMLElement[] = [];

  /* ---------------------------------------------------------------------- *
   * LIVE METRICS, as a card — `docs/21` § 3.4
   * ---------------------------------------------------------------------- */

  /**
   * The three lists' fills, and the cells each build hands back.
   *
   * ## Why this is keyed structure plus written cells, and not a `fill`
   *
   * `renderLive` runs at 60 Hz and every figure on this card moves. A `fill` per frame is GitHub
   * issue #106 exactly — the detached-button defect — and two of its three consequences are live
   * here: a reader scrolling the car list of Vertical City's thirty-five cars would lose their
   * place sixty times a second, and a `title` could never appear because hover is cancelled before
   * the browser's delay elapses. `dev/watchPanel.ts` records the third.
   *
   * So each list is keyed on its **structure** — which banks exist, which cars, which arm the
   * estimate is in — and the moving parts are text and style writes into nodes the build handed
   * back. That is `legendCountCells`' pattern above, and it is the only shape that survives a
   * panel whose every value changes on every frame.
   */
  const fillLiveFigures = keyedFill(ui.liveMetrics.figures);
  const fillLiveBanks = keyedFill(ui.liveMetrics.banks);
  const fillLiveCars = keyedFill(ui.liveMetrics.cars);
  let liveObservationCells: readonly HTMLElement[] = [];
  let liveEstimateCell: HTMLElement | undefined;
  let liveBankCells: readonly { readonly boarded: HTMLElement; readonly mean: HTMLElement }[] = [];
  let liveCarCells: readonly {
    readonly fill: HTMLElement;
    readonly mark: HTMLElement;
    readonly load: HTMLElement;
  }[] = [];

  /** A label-and-value row. The value cell is handed back so the playhead can write into it. */
  function liveRow(label: string, className = 'lm-value'): {
    readonly node: HTMLElement;
    readonly value: HTMLElement;
  } {
    const value = el(document, 'span', { className });
    return {
      node: el(document, 'div', {
        className: 'live-metrics-row',
        children: [el(document, 'span', { className: 'lm-label', text: label }), value],
      }),
      value,
    };
  }

  /**
   * Draw the live metrics card from one view — the same view the honesty sweep drives.
   *
   * Every word comes from `render/overlay.ts#overlayViewOf`, in the reader's own register, and
   * nothing here decides a format: the view hands over strings. What this function decides is
   * which node a string goes in, which is the split `dev/dom.ts` documents and the only one that
   * keeps the panel drivable without a document.
   *
   * **The refusal arm draws no value cell at all.** `OverlayEstimate`'s refused member carries no
   * `value` field, so this is a property of the type rather than of the care taken here — `docs/10`
   * R3, made structural by the migration.
   */
  function drawLiveMetrics(view: OverlayView): void {
    setText(ui.liveMetrics.title, view.title);
    setText(ui.liveMetrics.window, view.window);

    const estimate = view.estimate;
    fillLiveFigures(
      [
        view.observations.map((row) => row.label).join('|'),
        estimate.kind,
        estimate.label,
        estimate.kind === 'refused' ? `${estimate.head}|${estimate.reason}|${estimate.basis}` : '',
      ].join('~'),
      () => {
        const rows = view.observations.map((row) => liveRow(row.label));
        liveObservationCells = rows.map((row) => row.value);
        const nodes: Node[] = rows.map((row) => row.node);
        if (estimate.kind === 'refused') {
          liveEstimateCell = undefined;
          nodes.push(
            el(document, 'div', {
              className: 'live-metrics-row',
              children: [el(document, 'span', { className: 'lm-label', text: estimate.label })],
            }),
            el(document, 'p', {
              className: 'live-metrics-refusal',
              children: [
                el(document, 'span', { className: 'lm-head', text: estimate.head }),
                el(document, 'span', { className: 'lm-reason', text: estimate.reason }),
              ],
            }),
          );
        } else {
          const row = liveRow(estimate.label);
          liveEstimateCell = row.value;
          nodes.push(row.node);
        }
        return nodes;
      },
    );
    for (const [index, row] of view.observations.entries()) {
      const cell = liveObservationCells[index];
      if (cell !== undefined) setText(cell, row.value);
    }
    if (liveEstimateCell !== undefined && estimate.kind !== 'refused') {
      setText(liveEstimateCell, estimate.value);
    }

    fillLiveBanks(
      [
        view.bankHeading,
        view.banksEmpty ?? '',
        view.banks.map((bank) => `${bank.bankId}${bank.refused ? '!' : ''}`).join('|'),
      ].join('~'),
      () => {
        const heading = el(document, 'div', {
          className: 'live-metrics-head-row',
          text: view.bankHeading,
        });
        if (view.banksEmpty !== undefined) {
          liveBankCells = [];
          return [
            heading,
            el(document, 'div', { className: 'live-metrics-row', children: [
              el(document, 'span', { className: 'lm-label', text: view.banksEmpty }),
            ] }),
          ];
        }
        const built = view.banks.map((bank) => {
          const boarded = el(document, 'span', { className: 'lm-value' });
          const mean = el(document, 'span', {
            className: bank.refused ? 'lm-value lm-refused' : 'lm-value',
          });
          return {
            node: el(document, 'div', {
              className: 'live-metrics-row',
              children: [
                el(document, 'span', { className: 'lm-label', text: bank.bankId }),
                el(document, 'span', { children: [boarded, document.createTextNode('  '), mean] }),
              ],
            }),
            boarded,
            mean,
          };
        });
        liveBankCells = built.map((entry) => ({ boarded: entry.boarded, mean: entry.mean }));
        return [heading, ...built.map((entry) => entry.node)];
      },
    );
    for (const [index, bank] of view.banks.entries()) {
      const cells = liveBankCells[index];
      if (cells === undefined) continue;
      setText(cells.boarded, bank.boarded);
      setText(cells.mean, bank.mean);
    }

    fillLiveCars(
      [
        view.carHeading,
        view.cars
          .map((car) => `${car.carId}·${car.label}·${car.tone}${car.overloaded ? '!' : ''}`)
          .join('|'),
      ].join('~'),
      () => {
        const heading = el(document, 'div', {
          className: 'live-metrics-head-row',
          text: view.carHeading,
        });
        const built = view.cars.map((car) => {
          const bar = el(document, 'span', { className: `live-metrics-fill lm-tone-${car.tone}` });
          const mark = el(document, 'span', { className: 'live-metrics-full-mark' });
          const load = el(document, 'span', {
            className: car.overloaded ? 'lm-load lm-overloaded' : 'lm-load',
          });
          return {
            node: el(document, 'div', {
              className: 'live-metrics-car',
              children: [
                el(document, 'span', { className: 'lm-car-label', text: car.label }),
                el(document, 'span', { className: 'live-metrics-track', children: [bar, mark] }),
                load,
              ],
            }),
            fill: bar,
            mark,
            load,
          };
        });
        liveCarCells = built.map((entry) => ({
          fill: entry.fill,
          mark: entry.mark,
          load: entry.load,
        }));
        return [heading, ...built.map((entry) => entry.node)];
      },
    );
    for (const [index, car] of view.cars.entries()) {
      const cells = liveCarCells[index];
      if (cells === undefined) continue;
      cells.fill.style.width = `${(car.fillFraction * 100).toFixed(2)}%`;
      cells.mark.style.left = `${(car.fullMarkFraction * 100).toFixed(2)}%`;
      setText(cells.load, car.load);
    }
  }

  /* ---------------------------------------------------------------------- *
   * The intervention strip — Everyday Mode slice 3 (contract § 1.4, § 7.6)
   * ---------------------------------------------------------------------- */

  /*
   * The stage's one intervention control and the stamp beside it, built here on
   * `dispatcherEditor.ts`'s precedent because the canonical markup has no block for them, and
   * inserted **above the stage and under the coach ribbon** — the ribbon is this surface's
   * header, and § 7.6 puts the most recent intervention's stamp under the header. Sibling-insert
   * via `parentElement?.insertBefore`, the idiom every other mount uses and the one the DOM test
   * recorders answer; the words live in `live/interventions.ts`, pure and honesty-swept, and this
   * block only decides which element they go in.
   *
   * Pressing the button appends `{ atS: playhead, change: park-cars-lobby }` to the state's log
   * and re-runs the day — the whole § 1.4 mechanism: re-simulate from t = 0, prefix bit-identical
   * by construction (`sim/interventions.test.ts`), playback resumed at the same playhead by the
   * `seekTo` in the run's own callback. The seek happens *after* `applyShift` has adopted the new
   * recording, so it lands on the recording it describes rather than on the one being replaced.
   *
   * **`applyShift` still clears `report` and `tomorrow`, deliberately.** An intervention is not a
   * new day — but the sheet and the beat are accounts of a *recording*, and the recording they
   * described has just been replaced; a sheet left standing would caption a run that is no longer
   * on screen, which is § D223's stale-sheet defect. The day itself is untouched: `week` does not
   * move, and the re-run day files again through the ordinary `closeShift` gate when its playhead
   * runs out.
   */
  const interventionStamp = el(document, 'span', {
    className: 'helpful',
    attrs: { role: 'status' },
    style: { color: 'var(--dim)', 'font-size': '11.5px' },
  });
  const interventionButton = el(document, 'button', {
    className: 'chip',
    text: PARK_CARS_LOBBY_LABEL,
    attrs: {
      type: 'button',
      title:
        'appends to this day’s record at the playhead and re-simulates the day from the start — ' +
        'everything before this moment is unchanged, and playback resumes here',
    },
  });
  /*
   * The second intervention — § 20.12's own ordering (*start with park the cars in the lobby,
   * then dispatcher switching*). The target is the plain baseline through `plainBaselineOf`, the
   * § D134 resolution the ghost already uses, so the driver this hands the day to and the rival
   * the race strip draws cannot be two different dispatchers. The label speaks the profile's
   * *name*; the core arm carries the profile whole, exactly as `ghostRun.ts` swaps the field.
   */
  const switchTarget = plainBaselineOf(resources);
  const switchButton = el(document, 'button', {
    className: 'chip',
    text: switchTarget === undefined ? '' : switchDispatcherLabelOf(switchTarget.name),
    attrs: {
      type: 'button',
      // The pin, stated where the player decides — SWITCH_PINS_NOTE's own docstring (§ D227:
      // a behaviour nothing states is a stale refusal waiting to happen).
      title:
        'appends to this day’s record at the playhead and re-simulates the day from the start — ' +
        SWITCH_PINS_NOTE,
    },
  });
  setHidden(switchButton, switchTarget === undefined);
  const interventionStrip = el(document, 'div', {
    style: { display: 'flex', 'align-items': 'center', gap: '10px', margin: '0 0 8px' },
    children: [interventionButton, switchButton, interventionStamp],
  });
  {
    // `.stage-wrap` is the canvas's own wrapper; the strip goes immediately before it.
    const stageWrap = ui.stage.canvas.parentElement;
    stageWrap?.parentElement?.insertBefore(interventionStrip, stageWrap);
  }

  /**
   * § 1.4's *record growing*, in one place — the button below and the Everyday stage's control both
   * land here.
   *
   * **`atS` is the caller's playhead rather than this shell's**, and that is what makes one
   * implementation serviceable for two stages. The Engineer button passes its own transport's
   * position; `everyday/stageScreen.ts` runs its own `Playback` over the same recording and passes
   * *its* position, which is the instant the player was actually looking at. Reading `playback`
   * here instead would stamp an Everyday intervention wherever this surface happened to be paused —
   * a change filed at a moment nobody saw.
   *
   * A second copy of this in the host bindings would be two different runs from one press, which is
   * the shape `docs/20` defect 17 already had to unpick once.
   */
  function interveneAt(atS: number, change: RunInterventionConfig['change']): void {
    if (state.recording === undefined) return;
    state = { ...state, interventions: [...state.interventions, { atS, change }] };
    renderAll();
    settleRecompute();
    interventionRecomputeTimer = window.setTimeout(() => {
      interventionRecomputing = true;
      setText(interventionStamp, RECOMPUTING_BEAT);
    }, 400);
    runShift(() => {
      // After adopt: the new Playback exists by the time a run lands, and seeking does not
      // start or stop playback — a reader who was paused stays paused at the stamped instant.
      settleRecompute();
      playback?.seekTo(atS);
      // The one `runShift` call that is § 1.4's *record growing* rather than a new ask — see
      // {@link runCause}. Said here, at the site that appended to the log a few statements up,
      // because intent exists nowhere else: the re-simulated recording is indistinguishable from
      // a retry's. Both controls funnel through this helper, so both inherit the cause.
    }, 'intervention');
  }

  interventionButton.addEventListener('click', () => {
    if (state.recording === undefined || playback === undefined) return;
    interveneAt(playback.simTimeS, { kind: 'park-cars-lobby' });
  });
  switchButton.addEventListener('click', () => {
    if (state.recording === undefined || playback === undefined) return;
    if (switchTarget === undefined) return;
    interveneAt(playback.simTimeS, { kind: 'switch-dispatcher', profile: switchTarget });
  });

  /** A profile's vector, canonically — key order is authoring noise, not a difference. */
  const vectorOf = (weights: Readonly<Record<string, number>>): string =>
    JSON.stringify(
      Object.fromEntries(Object.entries(weights).sort(([a], [b]) => a.localeCompare(b))),
    );
  /** Memo per state object — the derivation walks the whole chain and this runs per frame. */
  let switchNoopCache: { readonly forState: ViewerState; readonly noop: boolean } | undefined;
  /**
   * Whether pressing the switch would genuinely change nothing — review finding 2. The old
   * check compared base **ids**, and the driving profile is *derived* (levers, selector, rules —
   * `drivingProfileOf`'s chain), so it disabled the control exactly where pressing it would
   * change the run: a lever-moved player handing the day back to the plain baseline. § D177's
   * inert-control class with the polarity reversed. Now: with a handover already on the log, the
   * press is a no-op only if that handover names this target (the pin makes later state moot);
   * otherwise the press is a no-op only if the *vector actually driving* equals the target's —
   * compared canonically, through the one derivation `shiftRunConfigOf` itself runs — **and** no
   * chooser is live, because on a rules or selector profile the switch also stands the chooser
   * down, which is a change even at equal base weights.
   */
  const switchWouldChangeNothing = (viewState: ViewerState): boolean => {
    if (switchTarget === undefined) return true;
    let latest: string | undefined;
    for (const entry of viewState.interventions) {
      if (entry.change.kind === 'switch-dispatcher') latest = entry.change.profile.id;
    }
    if (latest !== undefined) return latest === switchTarget.id;
    if (switchNoopCache?.forState === viewState) return switchNoopCache.noop;
    const driving = drivingProfileOf(resources, viewState);
    const noop =
      vectorOf(driving.weights) === vectorOf(switchTarget.weights) &&
      (driving.selection?.policy ?? 'off') === 'off';
    switchNoopCache = { forState: viewState, noop };
    return noop;
  };

  /** The strip's live facts: whether each control can act now, and the latest stamp. */
  function drawIntervention(view: ViewAt): void {
    const hasRun = view.recording !== undefined;
    // Disabled rather than hidden while no run is on screen: a control that cannot act now says
    // so (`docs/design` § 7.6's rule), and the title carries what pressing it will do.
    interventionButton.disabled = !hasRun;
    // Also disabled when the press would genuinely change nothing — a handover to the vector
    // already driving is a control that moves nothing, which § D177 ranks below no control at all.
    switchButton.disabled = !hasRun || switchWouldChangeNothing(view.state);
    if (interventionRecomputing) {
      setText(interventionStamp, RECOMPUTING_BEAT);
      return;
    }
    setText(
      interventionStamp,
      interventionStampOf(view.state.interventions, view.simTimeS, runStartOfDayS),
    );
  }

  /* ---------------------------------------------------------------------- *
   * The mount context — the only thing a panel may do to the world
   * ---------------------------------------------------------------------- */
  const context: MountContext = {
    update(patch) {
      state = { ...state, ...patch };
      /*
       * **The library is written the moment it changes** — GitHub issue #113 § 2.
       *
       * `saveSessionNow` had exactly two callers and neither was a save button: a `set-setting`
       * intent, and `closeDay()`. That explains the report — *four dispatchers saved, one survived a
       * reload* — precisely rather than approximately. A dispatcher filed through *Save it and run
       * it* runs a shift, and a shift that ends closes a day, and closing a day writes the session;
       * one filed through Save alone was never written at all, and the reporter's inference that
       * there must be two storage paths is wrong. There is one writer and one reader.
       *
       * This is the choke point every panel already writes through, so it is the one place where
       * *the library moved* is a fact rather than a convention each editor has to remember. See
       * {@link patchTouchesLibrary} for why no debounce is needed: the hot patches — a slider drag
       * writing `dispatcherSpec` — do not touch a shelf, and the ones that do are button presses.
       *
       * **And the week is written the moment it moves** — `docs/20` defect 14, the same defect
       * about the campaign's progress instead of its library. *Open the doors on tomorrow*
       * advanced the week here and the advanced day did not reach `localStorage` until the end of
       * the day the press started, so a tab closed a second after the press lost it. Same fix,
       * same choke point, second predicate — {@link patchMovesTheWeek} holds the census of the
       * three sites that patch a week and why none of them is hot, and § D231's `weeksForSession`
       * still decides *what* gets written on every save this triggers.
       */
      if (patchTouchesLibrary(patch) || patchMovesTheWeek(patch)) saveSessionNow();
      renderAll();
    },
    runShift(onRan) {
      /*
       * Every call through this seam is a panel answering an explicit press whose meaning is
       * *make this run happen* — so it is one of {@link playerStartedARun}'s two sites, and the
       * gate `closeShift` keeps cannot swallow a run the player asked a panel for (`docs/19`
       * defect 1). Boot and the menu's own refreshes call the closure `runShift` directly and
       * never come through here.
       */
      playerStartedARun();
      runShift(onRan);
    },
    enterMode() {
      /*
       * A panel announcing a **mode entry** — today the scenario cards, the one mode door that
       * does not pass through `dispatchMenu`'s arms. The shell-owned transport state resets here
       * and nowhere on the ordinary run path; {@link resetTransportSpeed} owns the boundary and
       * the argument (`docs/19` defect 12).
       */
      resetTransportSpeed();
    },
    openTab(tab) {
      const revealed = new Set(state.revealedTabs);
      revealed.add(tab);
      state = { ...state, tab, revealedTabs: revealed };
      /*
       * **And the reveal is written where it is made** — issue #130, § D330's first condition.
       *
       * Here rather than in `renderAll`, because this is the one moment the set can change and a
       * writer on the render path would re-write the same bytes on every frame.
       * {@link saveRevealedTabs} is total for `persist/session.ts`'s reason one directory over: the
       * natural caller of a save is a player pressing a tab, and a full storage quota must not turn
       * navigation into a dead control.
       *
       * Unconditional rather than guarded on *did the set actually grow* — `revealedTabsTo` is
       * ordered by `CONTEXTUAL_TABS` and filtered to them, so pressing an already-revealed tab
       * writes the bytes that are already there. A guard would be a second opinion about what
       * changed, and this way there is only one.
       */
      saveRevealedTabs(revealed);
      /*
       * **A navigation dismisses the drawer** — `docs/19` defect 6. Below the breakpoint the
       * right rail is an overlay covering the editor column, so *Open dispatcher editor →* opened
       * the editor **behind** the drawer that launched it, with "EDITING — …" truncated under the
       * panel the player had to know to close. Leaving for a surface is the reader saying *show me
       * that surface*, so the overlay yields — every navigation comes through here, which is what
       * makes this one write cover the four `Open … editor` links, the report's lever cards and
       * the tab strip alike. Column mode is untouched: there the rail occludes nothing and
       * `drawerOpen` is the remembered choice `drawerStateFor`'s docstring protects.
       */
      if (drawerStateFor(window.innerWidth, state.drawerOpen).isDrawer && state.drawerOpen) {
        state = { ...state, drawerOpen: false };
      }
      /*
       * **A navigation files a day only when the day has been played out** — § D232, closing the
       * half § D223 named and could not reach from its own lane.
       *
       * This arm was `if (tab === 'report') closeShift();` at any playhead. § D223 is precise about
       * why that is wrong and about why it is *not* a lie: the simulator runs a day to its end and
       * then plays it back, so what got banked was the true outcome of a day that really was
       * simulated in full. What was wrong is that **a navigation had a progression side effect the
       * reader did not ask for** — it incremented `week.attempt`, and it could bank a clean shift
       * and clear a contract, on a run nobody had watched a second of.
       *
       * The guard is § D223's own: file only when the playhead has reached `endedAt`. That is the
       * same instant the sheet itself agrees to be a whole-day account at, so the tab can no longer
       * bank a day the sheet is simultaneously declining to report — the running sheet and the
       * filed one now cover exactly the two sides of one condition.
       *
       * `tick` still files the ordinary way, from the transport reaching the end on the run tab.
       * This arm remains reachable and necessary: a run that ended while the reader was on another
       * surface never met `tick`'s `state.tab === 'run'`, and `Playback` advances off the injected
       * clock rather than off the frame loop — so its playhead *is* at `endedAt` by the time the
       * reader opens the sheet, and the day files then.
       */
      if (tab === 'report' && playheadHasRunOut()) closeShift();
      renderAll();
      ui.tabs[tab].focus();
    },
    fail(message) {
      setText(ui.transport.error, message);
    },
  };

  /* ---------------------------------------------------------------------- *
   * Panels
   * ---------------------------------------------------------------------- */
  const leftRail = mountLeftRail(
    { mood: ui.mood, shift: ui.shift, honesty: ui.honesty, decisionLog: ui.decisionLog },
    context,
  );
  const rightRail = mountRightRail(ui.rail, context);
  const reportPanel = mountReport(ui.report, context);
  const scenariosPanel = mountScenarios(ui.scenarioList, context);
  const dispatcherEditor = mountDispatcherEditor(ui.dispatcherEditor, context);
  /*
   * The weight-set selector, mounted beneath the dispatcher's own controls — `docs/17` § 5 clause 6.
   *
   * `selection.policy` over `patternSwitching` is the simulator's **one genuine mid-run adaptation**,
   * and it was reachable from no screen: the product's only real within-day mechanism was invisible
   * to the player it was built for. It follows `dispatcherEditor` in every respect, including that
   * an edit takes effect on the next Run rather than re-running under the reader.
   */
  const selectorEditor = mountSelectorEditor(ui.selectorEditor, context);
  /*
   * The Everyday rules editor, beneath the selector — GAMEPLAY §11.5. The same footing as the
   * selector in every respect: applied over whoever is driving, next-run rather than mid-run,
   * and when rules are written they take the run (`rulesOverrideNoteOf` on the selector panel is
   * the other half of that sentence).
   */
  const ruleEditor = mountRuleEditor(ui.ruleEditor, context);
  const trafficEditor = mountTrafficEditor(ui.trafficEditor, context);
  const machinesEditor = mountMachinesEditor(ui.machinesEditor, context);
  const buildingEditor = mountBuildingEditor(ui.buildingEditor, context);
  const statePanels: readonly Panel[] = [
    rightRail,
    reportPanel,
    scenariosPanel,
    dispatcherEditor,
    selectorEditor,
    ruleEditor,
    trafficEditor,
    machinesEditor,
    buildingEditor,
  ];

  /*
   * The document editor, kept whole beneath the elevation — `docs/12` § 4.5. It is the only
   * surface that can express access zoning, per-floor ids and a floor range, and it carries
   * docs/10 § 11 W8's open half. Its ids never moved, so it mounts exactly as it did before.
   */
  const editor = mountEditor({
    resources,
    // Asked for at draw time, so a theme flipped while the editor is open reaches its preview too.
    theme: () => stageTheme,
    onRun: (config: BuildingConfig) => {
      adoptEditedBuilding(config);
    },
    confirm: confirmDiscard,
    /*
     * § D159's access/dispatcher compatibility warning is keyed on whoever is currently driving.
     * Without this the editor's `renderAccessNote` takes its early return and blanks itself, so
     * the warning is dead on this surface — which is exactly what happened between `aa7d943`,
     * where the old shell passed `() => ui.dispatcher.value`, and here. The five-tab viewer had a
     * `<select>` to read; the shift viewer keeps the same fact in `state.dispatcherId`.
     */
    currentDispatcherId: () => state.dispatcherId,
  });

  /*
   * **The Parameters tab, bound to one schema and honest about the other eleven** — the UI
   * readiness audit's B4.
   *
   * The handle this mount used to return was discarded here, and `ParameterFormHandle.candidate()`
   * — *"the only route from that form to a value"* — was called by nothing in `packages/viz/src` or
   * `packages/cli/src`. 114 live controls, 12 schemas, and a run that came back byte for byte
   * whatever a player moved.
   *
   * What is wired is `sim.patience.*`, and it is wired **through the state** rather than read out of
   * the form at Run time: `ViewerState.patience` is what `shiftRunConfigOf` reads, which is what
   * puts this control inside `scope/scope.test.ts`'s derived key set — the instrument that would
   * have caught the original defect and could not see a closure local. The other eleven schemas and
   * the dispatcher space say *NOT APPLIED* on screen, in the form, above their own controls.
   *
   * The branch is here rather than in the mount because **this file is what knows what a run
   * reads**. `dev/parameterForm.ts` publishes what the picker is showing and names its source; the
   * shell decides what that means.
   */
  mountParameterForm({
    container: ui.paramForm,
    picker: ui.paramSource,
    status: ui.paramStatus,
    refusal: ui.paramRefusal,
    onCandidate: (sourceName, candidate) => {
      if (sourceName !== APPLIED_SCHEMA) return;
      /*
       * `context.update` and **not** `runShift()`. An edit here takes effect on the next Run, which
       * is what `mountDispatcherEditor` and `mountSelectorEditor` already do and for the same
       * reason: a slider that re-simulated on every change would put a run inside a drag. The
       * on-screen note says *press Run this shift to see it* for exactly this reason.
       */
      context.update({ patience: patienceFromCandidate(candidate) });
    },
  });

  mountBatchPanel({
    elements: ui.batch,
    resources,
    inherit: () => ({
      buildingId: state.buildingId,
      seed: state.seed.toString(),
      durationS: String(state.shiftLengthS),
    }),
  });

  /*
   * The suite, beside the bench — Everyday Mode slice 7 (docs/18 § Slice 7). One comparison over
   * ticked matrix cells; the ticks render from `MATRIX_CELLS` inside the mount, so nothing here
   * or in `index.html` retypes the fixture list. It inherits nothing from the viewer on purpose:
   * a suite's cells fix the building and the traffic, which is the point of a fixed fixture list.
   */
  mountSuitePanel({ elements: ui.suite, resources });

  /*
   * The campaign needs its own data file, which is fetched separately. A page that could not load
   * it must still be a page — the campaign is one of ten surfaces — so the failure is reported in
   * that surface's own alert slot and the other nine come up.
   */
  let campaign: CampaignPanelHandle | undefined;
  void loadCampaign(resources)
    .then((loaded) => {
      campaign = mountCampaignPanel({
        elements: ui.campaign,
        resources,
        loaded,
        mode: () => state.mode,
      });
    })
    .catch((error: unknown) => {
      setText(ui.campaign.error, error instanceof Error ? error.message : String(error));
    });

  /* ---------------------------------------------------------------------- *
   * The shell's own controls
   * ---------------------------------------------------------------------- */
  wireNavigation();
  wireCoach();
  wireTransport();
  wireRaceStrip();
  wireHeaderAndFooter();
  wireKeyboard();
  wireStageClicks();

  window.addEventListener('resize', () => {
    applyNavigation();
    renderLive();
  });
  /*
   * A `matchMedia` listener as well as `resize`, on the same breakpoint the stylesheet uses.
   *
   * `resize` alone left the drawer stale: crossing 1340 px, the rail stayed a visible overlay lying
   * on top of the stage until the reader pressed the toggle **twice** — once to register a close it
   * had not had, once to open it. `matchMedia` fires exactly on the crossing rather than on every
   * intermediate pixel, so the state changes at the same instant the layout does.
   */
  window
    .matchMedia(`(max-width: ${String(DRAWER_BREAKPOINT_PX - 1)}px)`)
    .addEventListener('change', () => {
      applyNavigation();
    });

  restoreSession();
  applyTheme();
  renderAll();
  runShift();
  /*
   * **The overlay is redrawn once the opening shift exists** — GitHub issue #97.
   *
   * `drawMenu()` runs ~200 lines above, before this `runShift()`, so the first menu a player ever
   * sees was painted against `runState().hasRun === false` — `state.recording` is `undefined` until
   * `runShift` assigns it — and **nothing redrew it afterwards**. Neither `renderAll` nor `runShift`
   * calls `drawMenu`; every other `drawMenu` in this file is on an intent arm, and boot presses no
   * intent. So *Resume* sat disabled under *"There is no shift on screen to go back to yet"* over a
   * shift that had been simulated, drawn and paused behind the overlay. That sentence is what issue
   * #97's reporter quoted, and it was the honest output of a stale paint rather than of a stale
   * fact.
   *
   * **Here and not inside `renderAll`.** `renderAll` runs on every state change — a tab, a slider, a
   * playhead-driven panel sweep — and rebuilding the overlay on each of those is issue #106 with a
   * new trigger: a press swallowed mid-`mousedown`, and focus taken off whatever the reader was on.
   * Boot is the one moment where the menu's world changes and no intent says so, so boot is the one
   * place that owes the redraw.
   */
  drawMenu();
  /*
   * The mailed link, redeemed on the way in.
   *
   * After `runShift()` so a slow redemption never delays the thing the page is for, and **before**
   * `urlWritable` so the fragment is gone before anything else writes an address. It clears the
   * fragment synchronously and then awaits, so nothing later in this file can observe the token and
   * nothing this build writes can carry it.
   */
  void redeemLinkFromHash();
  urlWritable = true;
  /*
   * The one write boot itself owes — the `SH-09` residual (§ D198). The flip above happens after
   * boot's `runShift()` has already passed `renderAll`/`syncUrl`, so without this line the address
   * bar stayed bare until the first interaction, and a link copied at that instant was a different
   * run wearing the same address. § D189's clause is *nothing writes before boot completes*; boot
   * has completed on this line, and the opening run's seed belongs in the bar from here on —
   * `replaceState` only and defaults omitted, both `syncUrl`'s own rules, so an untouched boot
   * writes exactly `?seed=…`.
   */
  syncUrl();
  requestAnimationFrame(tick);

  /*
   * The Everyday data host — `everyday/host.ts`'s bindings, implemented against this closure and
   * published for the shell `everyday/boot.ts` mounted while this boot was still fetching data.
   *
   * Every binding is a thin read of a closure fact or a press of a seam that already exists;
   * every derivation over them lives in `createEverydayHost`, where it is testable without a
   * document. Two are worth naming here because they are the § 3.4 latch's own grounds:
   *
   * - `runIsOwn` is `bankingRefusalFor`'s identity comparison, read rather than re-argued — a
   *   watched or file-loaded run is somebody else's, and § 3.4 exempts it (*there is nothing of
   *   yours to lose*);
   * - `playerHasChosen` is § D232's flag, so boot's own demo run never arms the confirm strip —
   *   a warning about a run nobody started would be theatre (issue #39's class).
   *
   * `startRun` goes through `context.runShift`, which is one of `playerStartedARun`'s two latch
   * sites — a run the host starts is a run a player pressed for, on a screen this shell cannot
   * see, and it must file exactly as the Run button's does.
   *
   * Published after the boot sequence above, so a host method can never observe a half-booted
   * closure. Everything the Engineer surface does is unchanged when nothing consumes this: the
   * bindings write nothing at publish time, and the listener list drains empty.
   */
  const everydayHostBindings: EverydayHostBindings = {
    resources,
    state: () => state,
    playheadS: () => playback?.simTimeS ?? state.recording?.startedAt ?? 0,
    dayClosed: () => state.recording !== undefined && filedRunId === state.recording.runId,
    runIsOwn: () => state.recording !== undefined && state.recording === simulatedRecording,
    playerHasChosen: () => playerHasChosen,
    dayStartS: () => runStartOfDayS,
    startRun: () => {
      context.runShift();
    },
    intervene: (atS, change) => {
      interveneAt(atS, change);
    },
    closeDay: () => {
      closeShift();
    },
    openRunTab: () => {
      context.openTab('run');
    },
    applyPatch: (patch) => {
      context.update(patch);
    },
    /*
     * § 14.1's six bindings, and every one of them is the *same* seam the Engineer picker presses —
     * GitHub issue #182, § D436. `mountWatchPanel` above is handed `loadReferenceRuns`,
     * `recordRun`, `enterWatch`, `stopWatching` and `playThisCrowd`; these are those five plus a
     * read of the `watching` field, so the two shells enter, leave and convert a watch through one
     * implementation. A second entry point would be a second answer to *whose day is on screen*,
     * which is the property `dev/watchPanel.ts` is one file for.
     */
    loadReferenceRuns: () =>
      loadReferenceRuns((id: string) => buildingNameOf(resources, state.savedBuildings, id)),
    simulateRecord: (config) => recordRun(config).recording,
    enterWatch: (run, view, recording) => {
      enterWatch(run, view, recording);
    },
    stopWatching: () => {
      stopWatching();
    },
    playThisCrowd: (run) => {
      playThisCrowd(run);
    },
    watching: () =>
      watching === undefined ? undefined : { run: watching.run, view: watching.view },
    onChange: (listener) => {
      everydayHostListeners.push(listener);
      return () => {
        const at = everydayHostListeners.indexOf(listener);
        if (at >= 0) everydayHostListeners.splice(at, 1);
      };
    },
  };
  EVERYDAY_HOST.publish(createEverydayHost(everydayHostBindings));

  /* ====================================================================== *
   * Rendering
   * ====================================================================== */


  /**
   * Landings whose calls no car **may** answer, at `t` — `docs/10` § 10.4, `U8`.
   *
   * The restricted set and the credential flag are the caller's to supply, because `lockedOut.ts`
   * is deliberately unable to guess either: an empty restricted set means *this caller does not
   * know*, which is a different claim from *this building restricts nothing*, and only the shell
   * has the building document to tell them apart.
   */
  function lockedOutAt(recording: VizRecording, at: number): readonly LockedOutLanding[] {
    const config = buildingConfigOf(resources, state.savedBuildings, recording.buildingId);
    const profile = profileById(resources, state.savedDispatchers, state.dispatcherId);
    return lockedOutLandingsAt({
      recording,
      at,
      restrictedFloorIds: restrictedFloorIds(
        recording.floors.map((floor) => floor.id),
        config?.accessZones,
      ),
      carriesCredential: credentialCapabilityOf(profile).carriesCredential,
    });
  }

  function viewAt(): ViewAt {
    const recording = state.recording;
    const simTimeS = playback?.simTimeS ?? recording?.startedAt ?? 0;
    return {
      state,
      resources,
      recording,
      simTimeS,
      // The header clock's own hour, on the view so every panel prints the same one — `docs/19`
      // defect 2. See {@link runStartOfDayS} for when it is `undefined`.
      startOfDayS: runStartOfDayS,
      /*
       * The **last run's** building while a run is on screen, and the building the state is
       * pointing at when there is not — § D234, issue #36.
       *
       * `building` is `shiftRunConfigOf`'s: grown to the day, commissioned, with the day's
       * incidents on it, and therefore the right thing to describe the recording beside it. It is
       * the wrong thing to describe when the recording has been cleared and nothing has re-run,
       * which is exactly what *Take the next assignment* does — it moves `buildingId`, drops the
       * recording, and does not run. The header then drew the new building's name against the old
       * building's specs, and the picture underneath was the old building's frame stretched over
       * the new one's box.
       */
      building: recording === undefined ? resolvedBuildingOf(resources, state) : building,
      playing: playback?.state === 'playing',
      /*
       * The spectator fact, on the view because the rail needs it and cannot reach this closure —
       * see {@link ViewAt.watching}. Through {@link isWatching} rather than `watching !== undefined`
       * inline, so there is one answer to *is this somebody else's run* on both sides of the render.
       */
      watching: isWatching(),
      unfiledSheet: unfiledSheetFacts(recording, simTimeS),
    };
  }

  /**
   * Why the Day report is empty while the screen suggests otherwise — the two closure facts
   * `ViewAt.unfiledSheet` exists to carry (`docs/19` defects 1 and 14), computed here because
   * {@link playerHasChosen}, {@link simulatedRecording} and {@link filedThisSitting} live in this
   * closure and no panel may.
   *
   * The refusal arm answers only for a run that has **run out**: short of `endedAt` the panel's
   * watching sheet is already the honest account, and a refusal about a day still playing would be
   * the § D223 defect in a new coat. The two grounds are asked in `closeShift`'s own order —
   * issue #136's first, § D232's second — so the sentence on the empty sheet is the sentence the
   * gate actually refused on. `runProgressOf` is the one played-out predicate, not a re-derivation
   * (§ D223's two-answers rule); it is called on the pair directly rather than through
   * {@link playheadHasRunOut} because that helper builds a `ViewAt`, and this runs inside one.
   */
  function unfiledSheetFacts(
    recording: VizRecording | undefined,
    simTimeS: number,
  ): UnfiledSheetFacts | undefined {
    if (state.report !== undefined) return undefined;
    const ranOut =
      recording !== undefined && runProgressOf({ recording, simTimeS }).kind === 'played-out';
    const refusal = !ranOut
      ? undefined
      : (bankingRefusalFor(recording, simulatedRecording) ??
        (playerHasChosen ? undefined : UNCHOSEN_RUN_CANNOT_BANK));
    const fromPreviousSitting = !filedThisSitting && state.week.history.length > 0;
    if (refusal === undefined && !fromPreviousSitting) return undefined;
    return { refusal, fromPreviousSitting };
  }

  /** Everything. Runs when the state changed. */
  function renderAll(): void {
    syncUrl();
    applyNavigation();
    const view = viewAt();
    for (const panel of statePanels) panel.render(view);
    leftRail.render(view);
    drawHeader(view);
    drawCoach(view);
    drawFooter(view);
    drawTransportChrome(view);
    drawParity();
    drawLegend(view);
    drawRaceStrip(view);
    drawIntervention(view);
    drawWatching();
    drawStage();
    /*
     * The Everyday host's subscribers, last — after every panel above, so a screen that reads the
     * host inside its listener reads the same state the page has just been drawn from. Over a
     * snapshot, so a listener that unsubscribes (or subscribes a sibling) mid-notification does
     * not skip or double-call a neighbour.
     */
    for (const listener of [...everydayHostListeners]) listener();
  }

  /**
   * Everything § 14.1's differentiation table asks the **shell** for — drawn from one value, and
   * cleared by the same function.
   *
   * ## Why one function rather than a clause in each of the six draws
   *
   * Because the table is a single claim — *this is not your run* — and six independently-guarded
   * clauses is six chances for one of them to stay behind. § 14.1's own sentence is that a
   * spectator who cannot tell whose day they are looking at makes the whole board untrustworthy;
   * the failure mode that produces is a header that reverted while the pill did not, which is worse
   * than either treatment alone.
   *
   * So: one read of {@link watching}, every surface written on both arms, and `main.test.ts`
   * asserts the whole set appears and disappears together.
   *
   * ## The three disablings, and why two of them are not new flags
   *
   * `interventionButton` and the ghost `select` are disabled here — contract § 1.5: *"Interventions
   * are replayed, not offered. The intervention API is disabled in this context; playback controls
   * (pause, the five speeds) are not interventions."* The transport is therefore **left alone**,
   * which is the half of that sentence a disabling sweep would have got wrong.
   *
   * The third — *a watched run cannot be closed, banked or posted* — has no line here at all,
   * deliberately. `enterWatch` never writes {@link simulatedRecording}, so `bankingRefusalFor`
   * refuses the run by object identity and `closeShift` returns before it writes anything. A flag
   * checked here would be a second answer to a question the product already answers, and the second
   * answer is the one that goes stale.
   */
  function drawWatching(): void {
    const view = watching?.view;
    const headerEl = ui.header.right.closest('header');
    headerEl?.classList.toggle(WATCHING_HEADER_CLASS, view !== undefined);
    if (headerEl !== null && headerEl !== undefined) {
      // The inverted treatment — § 14.1's *"the single strongest signal"*. Inline rather than in
      // `index.html`'s stylesheet for `waitLiveRegion`'s stated reason: the sheet is not this
      // lane's to edit, and the class above is what a future sheet would hook.
      headerEl.style.setProperty('background', view === undefined ? '' : 'var(--text)');
      headerEl.style.setProperty('color', view === undefined ? '' : 'var(--bg)');
    }
    watchPanel.showChrome(view, watching?.run);
    watchPill.style.display = view === undefined ? 'none' : 'block';
    setText(watchPill, view?.pill ?? '');
    /*
     * § 14.1's rail subline, `WATCHING · <NAME>`, and § 14.1's *"no timeline"*. The timeline is
     * **hidden rather than disabled**: the table says *no timeline*, and a greyed-out scrubber is
     * still a timeline telling a spectator that the four-step day is theirs to close.
     */
    /*
     * **Both the attribute and the inline display**, and the pair is a finding rather than belt and
     * braces. `index.html` gives `#timeline` a `display` of its own, which is more specific than the
     * user-agent's `[hidden] { display: none }` — so the attribute alone left the scrubber on
     * screen, and the browser tier caught it on its first run. The attribute stays because it is
     * what an assistive technology reads; the inline rule is what actually removes it.
     */
    ui.transport.timeline.hidden = view !== undefined;
    ui.transport.timeline.style.setProperty('display', view === undefined ? '' : 'none');
    /*
     * § 14.1's rail subline replaces the phase pill, which is the element that carries
     * `MID-DAY · 08:41` — the table's own example. **Written after `drawHeader`** in both render
     * paths rather than branched inside it, so the header keeps one derivation of the phase and
     * this keeps one derivation of the spectator treatment; `drawHeader` re-writes the pill on
     * every live frame and this re-writes it back, which is why it is in `renderLive` too.
     */
    if (view !== undefined) setText(ui.header.phaseLabel, view.railSubline);
    // Contract § 1.5 — the intervention API is disabled, the playback controls are not.
    if (view !== undefined) interventionButton.disabled = true;
    ui.race.ghost.disabled = view !== undefined;
    /*
     * **The picker is hidden, not merely disabled** — § 14.1's *"no verdict — you are not in this
     * comparison"*, and `docs/20` defect 7's least obvious half. A disabled `<select>` still
     * renders its own selected option, and one of the three is `your latest saved`: the rule the
     * section states is about the word on the screen, not about which controls respond.
     *
     * **The attribute and the inline display**, exactly as the timeline above needs both and for
     * the identical reason: `index.html` gives `.race-pick` a `display: inline-flex` of its own,
     * which is more specific than the user-agent's `[hidden] { display: none }`. The attribute
     * alone left the whole picker — label, control and all three option texts — on the screen, and
     * the browser tier caught it on the first run of this sweep.
     */
    setHidden(ui.race.pick, view !== undefined);
    ui.race.pick.style.setProperty('display', view === undefined ? '' : 'none');

    /*
     * The four shell surfaces § 14.1's table does not name — `watch/shell.ts`, `docs/20` defect 7.
     *
     * They are written **here** rather than in the four draws that own the elements, for
     * `drawWatching`'s own stated reason: the differentiation is a single claim, and four
     * independently-guarded clauses is four chances for one of them to stay behind. Both arms are
     * written on every call, so nothing can be left saying `Your run` over a stranger's day.
     *
     * The Day report's note is `hidden` on the player's arm rather than emptied, because an empty
     * bordered box is a slot that looks like it failed to fill.
     */
    const copy = view === undefined ? PLAYER_SHELL_COPY : shellWatchingCopyOf(view);
    setText(ui.race.youName, copy.raceKey);
    setText(ui.shift.eyebrow, copy.railEyebrow);
    setText(ui.shift.runNote, copy.railNote);
    setText(ui.report.spectatorNote, copy.reportNote);
    setHidden(ui.report.spectatorNote, copy.reportNote === '');
  }

  /**
   * § 1.3 M4 — the four wait-age keys, from `WAIT_BANDS` and from nowhere else, each carrying its
   * live head count.
   *
   * ## Why the counts are here at all
   *
   * The row said what amber *means* and never how many people amber currently **is**, so a reader
   * could not tell one person from thirty from the only surface that names the four colours the
   * stage is drawing in. The left rail's mood bar already carries counts (L2) and is a different
   * instrument on a different card; this is the key under the stage, and it now reads rather than
   * merely keys. The words and the palette are still `WAIT_BANDS`' and are still written nowhere
   * else.
   *
   * **Four head counts and no total.** The counts *are* the scale — an exact count separates one
   * person from thirty in a way no bar and no max-marker can — and a total would be a fifth figure
   * whose sentence (*"12 standing now"*) is a claim about a run, which `honesty/surfaces.ts` would
   * have to drive rather than this file assert. Left out rather than smuggled past that search.
   *
   * ## Why it is cheap enough to run at 60 Hz
   *
   * One extra `waitBandsAt` — a single early-terminating pass over `recording.legs` up to `t` —
   * beside the several `renderLive` already makes, and *no* DOM work on a frame where the digits
   * did not change, because the structure is built once and `setText` no-ops on equal text. The
   * canvas render in `drawStage` dominates this by orders of magnitude.
   */
  function drawLegend(view: ViewAt): void {
    const bands =
      view.recording === undefined ? undefined : waitBandsAt(view.recording, view.simTimeS);
    const entries = waitLegendEntries(bands);
    /*
     * The key is deliberately the labels and colours only, and **not** the counts: keying on a
     * figure that moves every frame would rebuild the row every frame, which is what holding the
     * cells below exists to prevent.
     */
    fillLegend(entries.map((entry) => `${entry.label}·${entry.color}`).join('|'), () => {
      const cells: HTMLElement[] = [];
      const nodes = entries.map((entry) => {
        const cell = el(document, 'span', { className: 'legend-count' });
        cells.push(cell);
        return legendEntryNode(document, entry, cell);
      });
      legendCountCells = cells;
      return [ui.stage.legendTitle, ...nodes];
    });
    for (const [index, entry] of entries.entries()) {
      const cell = legendCountCells[index];
      if (cell !== undefined) setText(cell, entry.count === undefined ? '—' : String(entry.count));
    }
  }

  /* ---------------------------------------------------------------------- *
   * The race strip — GAMEPLAY §7.4, Everyday slice 4d
   * ---------------------------------------------------------------------- */

  /**
   * Issue the rival's run — a second recording of the same crowd, through the same worker.
   *
   * Called from `runShift`'s own delivery callback, **after** the player's run has landed and
   * been drawn: sequential by construction, so the primary is never contended, and cancel-safe
   * by the runner's own rule — a new primary ask supersedes the rival (*the latest ask wins*),
   * and the Run button's cancel face stops it like any other run. A rival result arriving for a
   * day that has since been replaced is dropped by the identity guard below, which is
   * `bankingRefusalFor`'s object-identity move applied one step earlier.
   *
   * The config is the primary's own with the dispatcher swapped (`dev/ghostRun.ts` — same
   * building, same demand, same seed: the same crowd, which is the whole of CRN). The rival's
   * recording is adopted **read-only beside** the primary: never `state.recording`, never
   * {@link simulatedRecording}, so it cannot file, bank, or close a day.
   */
  function scheduleGhost(plan: ShiftRunConfig, primaryRecording: VizRecording): void {
    const ghost = ghostPlanOf(resources, state.savedDispatchers, plan.config, ghostPick);
    if (ghost.kind === 'none') return; // nobody is free: the second request is simply not made
    if (ghost.kind === 'refused') {
      ghostRefusal = ghost.reason;
      lastRaceKey = '';
      drawRaceStrip(viewAt());
      return;
    }
    ghostInFlight = true;
    shiftRunner.start({
      label: `rival’s day — ${ghost.label}`,
      config: ghost.config,
      outOfServiceCarIds: plan.outOfServiceCarIds,
      /*
       * Off: the decision log is the primary run's surface, nothing reads a rival's decisions,
       * and the rival's recording is already a second multi-megabyte clone crossing the thread.
       */
      recordDecisions: false,
      cost: costOf(plan),
      onDone: (recording) => {
        ghostInFlight = false;
        if (state.recording !== primaryRecording) return; // a later day superseded this race
        ghostRecording = recording;
        lastRaceKey = '';
        drawRaceStrip(viewAt());
      },
    });
  }

  /** The two lanes' fixed logical boxes — the SVG `viewBox`es in `index.html`, exactly. */
  const RACE_TOP_BOX = { width: 640, height: 64 } as const;
  const RACE_BOTTOM_BOX = { width: 640, height: 40 } as const;

  /**
   * Draw the strip — words from `live/raceStrip.ts`, geometry from `raceLaneOf`, values only.
   *
   * Keyed rather than redrawn at 60 Hz: the lanes are §7.4's four-minute samples, so the drawing
   * only changes when the playhead crosses a grid line, the run or rival changes, or the day
   * runs out — {@link lastRaceKey} says which drawing is on screen and everything else is a
   * no-op frame. The verdict therefore updates at the same four-minute cadence as the lanes it
   * summarises (and once more at the very end), which keeps the strip's whole cost off the
   * per-frame path a 22 000-leg recording would otherwise pay twice per frame.
   *
   * Both recordings are sampled at the **one** playhead — PT-F2's unified clock — so pause and
   * speed drive both lines by construction; there is no second clock to drift.
   */
  function drawRaceStrip(view: ViewAt): void {
    const recording = view.recording;
    setHidden(ui.race.root, recording === undefined);
    if (recording === undefined) return;
    const ghost = ghostRecording;
    const bucket = Math.floor((view.simTimeS - recording.startedAt) / RACE_SAMPLE_INTERVAL_S);
    const key = [
      recording.runId,
      ghost?.runId ?? '',
      ghostPick,
      ghostRefusal ?? '',
      ghostInFlight ? 'in-flight' : '',
      String(bucket),
      view.simTimeS >= recording.endedAt ? 'end' : '',
    ].join('|');
    if (key === lastRaceKey) return;
    lastRaceKey = key;

    const stripView = raceStripViewOf({ recording, ghost, simTimeS: view.simTimeS });
    const option = GHOST_OPTIONS.find((entry) => entry.id === ghostPick);
    /*
     * The verdict slot, in honesty order: a refusal outranks everything (it says why there is no
     * rival); a picked-but-absent rival says whether one is coming; and only a drawn rival — or
     * the *nobody* pick, whose slot carries the plain figure — speaks through the view itself.
     */
    const verdict =
      ghostRefusal ??
      (stripView.ghost !== undefined || ghostPick === 'none'
        ? stripView.verdict
        : ghostInFlight
          ? RACE_PENDING
          : RACE_NOT_RUN);
    setText(ui.race.verdict, verdict);
    setText(ui.race.note, stripView.note);
    setText(ui.race.footer, stripView.footer);
    setHidden(ui.race.ghostKey, stripView.ghost === undefined);
    setText(ui.race.ghostName, stripView.ghost === undefined ? '' : (option?.label ?? ''));

    // One clock, one x-axis: the longer of the two spans, so the lines align instant for
    // instant. `endedAt` is an outcome, so two runs of one crowd may legitimately differ.
    const spanEndS = Math.max(recording.endedAt, ghost?.endedAt ?? recording.endedAt);
    const top = raceLaneOf(
      stripView.yours,
      stripView.ghost,
      (sample) => sample.standingWaitS,
      RACE_TOP_BOX,
      spanEndS,
      60,
    );
    const bottom = raceLaneOf(
      stripView.yours,
      stripView.ghost,
      (sample) => sample.standing,
      RACE_BOTTOM_BOX,
      spanEndS,
      10,
    );
    ui.race.topYou.setAttribute('points', top.you);
    ui.race.topGhost.setAttribute('points', top.ghost);
    ui.race.sixty.setAttribute('y1', top.markY.toFixed(1));
    ui.race.sixty.setAttribute('y2', top.markY.toFixed(1));
    ui.race.bottomYou.setAttribute('points', bottom.you);
    ui.race.bottomGhost.setAttribute('points', bottom.ghost);
  }

  /**
   * The picker. Options come from `GHOST_OPTIONS` — the model's own honest three, never markup —
   * with each option's one-line note as its `title`. The moved-control rule holds at the seam:
   * a pick maps through `ghostPlanOf` to a different second recording (compared on the legs in
   * `ghostRun.test.ts`), and *nobody* maps to no second request at all.
   */
  function wireRaceStrip(): void {
    for (const option of GHOST_OPTIONS) {
      ui.race.ghost.append(
        el(document, 'option', {
          text: option.label,
          attrs: { value: option.id, title: option.note },
        }),
      );
    }
    ui.race.ghost.value = ghostPick;
    ui.race.ghost.addEventListener('change', () => {
      const value = ui.race.ghost.value;
      ghostPick = GHOST_OPTIONS.some((option) => option.id === value)
        ? (value as GhostPick)
        : 'none';
      ui.race.ghost.title = GHOST_OPTIONS.find((option) => option.id === ghostPick)?.note ?? '';
      ghostRecording = undefined;
      ghostRefusal = undefined;
      lastRaceKey = '';
      if (ghostPick === 'none') {
        // A rival in flight is cancelled — its result would be dropped unread anyway. A primary
        // in flight is not ours to stop.
        if (ghostInFlight) shiftRunner.cancel();
        drawRaceStrip(viewAt());
        return;
      }
      const primary = state.recording;
      if (
        lastShiftPlan !== undefined &&
        primary !== undefined &&
        /*
         * Identity, not configuration — `shift/banking.ts`'s own move. A recording loaded from
         * a file has no plan behind it, and racing `lastShiftPlan` under it would draw a rival
         * of a *different* day beside it; the strip waits for a run this shell simulated.
         */
        primary === simulatedRecording &&
        // A primary in flight will race this pick when it lands; only a rival may be superseded.
        (!shiftRunner.isRunning() || ghostInFlight)
      ) {
        scheduleGhost(lastShiftPlan, primary);
      }
      drawRaceStrip(viewAt());
    });
  }

  /** Only what the playhead moves. Runs at 60 Hz. */
  function renderLive(): void {
    const view = viewAt();
    leftRail.render(view);
    drawHeader(view);
    drawFooter(view);
    drawPlayhead(view);
    // The status strip's register follows the playhead (`docs/19` defect 4): the whole-run line
    // may not stand while the day is still playing. Writes only when the derived text changed,
    // so the strip's transient messages survive — see drawTransportStatus.
    drawTransportStatus();
    // The legend's counts are a reading at `t`, so they belong here and not only in `renderAll`.
    // Left out, the row would state the counts of whichever frame last changed the state — a
    // figure that is stale in exactly the way a scrubbing reader cannot see.
    drawLegend(view);
    // The race strip follows the playhead the same way — and it keys itself on the four-minute
    // sample grid, so most frames it is a string compare and nothing else.
    drawRaceStrip(view);
    // The stamp is a reading at `t` too: a reader who scrubs back past their own intervention
    // must watch it disappear, because at that instant on the stage it has not happened yet.
    drawIntervention(view);
    // The spectator treatment, re-applied because `drawHeader` above has just overwritten the
    // phase pill with the run's own phase. See `drawWatching` for why it is one function.
    drawWatching();
    drawStage();
  }

  /**
   * Whether **this** surface is the one the player is looking at — GitHub issue **#287**.
   *
   * One expression for a question two sites ask, because the two are the same question and a second
   * spelling of it is how they come to disagree. Both are ways to file a day that are *this*
   * surface's and not the Everyday product's: {@link tick}'s end-of-day close, and the
   * `Ctrl`/`Cmd`+`Enter` arm of the `window` key handler. § 6.4 gives the other product exactly one
   * way to set `dayClosed` — its own *Close the day* — and neither of these is it.
   *
   * **`!== true` rather than `=== false`, and that is the load-bearing half.** `everydaySwap()`
   * answers `undefined` on a build that loaded this module with no Everyday shell over it, and
   * there the honest reading is that this surface has the page: there is no other world for the day
   * to belong to. A predicate that read the absent port as *somebody else has it* would have turned
   * one issue into an Engineer surface that can never file a day at all.
   */
  function engineerHasThePage(): boolean {
    return everydaySwap()?.hasThePage() !== true;
  }

  function tick(now: number): void {
    if (playback !== undefined && state.tab === 'run') {
      renderLive();
      if (now - lastAnnouncedMs > ANNOUNCE_MS) {
        lastAnnouncedMs = now;
        announce();
      }
      /*
       * The day closes when the day ends — the handoff's own behaviour (`closeDay` fires at
       * `tod >= DAY_END` and opens the sheet). Guarded on `filedRunId` rather than on a boolean, so
       * loading a different recording arms it again and a loop does not file the same day twice.
       *
       * **And only while this surface has the page** — GitHub issue **#287**, the defect this
       * comment used to describe its way past. The sentence above is a statement about the
       * *Engineer* product, and § D338's door put a second one in front of it: `everyday/boot.ts`
       * mounts a cover, § 7's stage builds its **own** `Playback` over the same recording, and the
       * player drives that one. This one keeps running behind the cover at `DEFAULT_BASE_SPEED`
       * — ×60, autoplayed, reachable by no control the Everyday player has — so it reached the end
       * of a five-minute-to-an-hour day on a fixed real-time schedule and filed, scored and banked
       * it. Measured: 60.0 s from arriving on the stage, at the hour `garden-apartments` opens on,
       * having touched nothing. `GAMEPLAY_AND_NAVIGATION.md` § 6.4 and § 16 rule 1 say the same
       * thing twice — *`Close the day` is the **only** thing that sets `dayClosed`* — and the
       * Everyday player's own press for it is `EverydayHost.closeDay`, which reaches `closeShift`
       * by the front door and is untouched by this.
       *
       * {@link endedUnderTheCover} carries the reason this is an **edge** and not simply a gate on
       * who has the page. `everydaySwap()` answering `undefined` — a build that loaded `dev/main.ts`
       * with no Everyday shell over it — is the Engineer surface having the page by default, which
       * is the honest reading: there is no other world for the day to belong to.
       */
      if (playback.state === 'ended' && filedRunId !== state.recording?.runId) {
        if (!engineerHasThePage()) endedUnderTheCover = state.recording?.runId;
        else if (endedUnderTheCover !== state.recording?.runId) closeShift();
      }
    }
    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------------------- *
   * Navigation — § 1.1 S5, § 1.3 M1, § 1.4 R1
   * ---------------------------------------------------------------------- */

  function applyNavigation(): void {
    applySurfaceState(ui, surfaceStateFor(state.tab, state.revealedTabs, disclosureOf(state.mode)));
    applyRailState(ui, railStateFor(state.railSegment));
    applyDrawerState(ui, drawerStateFor(window.innerWidth, state.drawerOpen));
  }

  /**
   * The address bar follows the run — `SH-09`, the other half of {@link applyDeepLink}.
   *
   * `replaceState`, never `pushState`: every state change through {@link renderAll} would
   * otherwise become a history entry, and Back would unwind fifty tweaks one keypress at a time
   * before it left the page. The address is a *description* of the current state, not a journal
   * of how it was reached, so it is replaced in place and Back keeps meaning *leave*.
   */
  function syncUrl(): void {
    if (!urlWritable) return;
    const search = deepLinkSearchOf(state, deepLinkDefaults);
    if (window.location.search === search) return;
    window.history.replaceState(null, '', `${window.location.pathname}${search}`);
  }

  /**
   * Where a shared link points, without its query — the origin and path this page is served from.
   *
   * Read from `window.location` rather than configured, because the answer differs between the dev
   * server, the deployed static site and a file somebody opened locally, and a configured base
   * would be the one of those three that is wrong for the other two.
   */
  function shareBase(): string {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function wireNavigation(): void {
    for (const tab of Object.keys(ui.tabs) as TabName[]) {
      ui.tabs[tab].addEventListener('click', () => {
        context.openTab(tab);
      });
    }
    /*
     * One listener on the strip rather than ten on the buttons: the ring is decided by
     * `surfaces.ts` and a per-button handler would have to know its own index, which is the thing
     * that goes wrong when a tab becomes contextual.
     */
    ui.tabs.run.parentElement?.addEventListener('keydown', (event) => {
      const next = tabAfterKey(
        surfaceStateFor(state.tab, state.revealedTabs, disclosureOf(state.mode)),
        state.tab,
        event.key,
      );
      if (next === undefined) return;
      event.preventDefault();
      context.openTab(next);
    });

    for (const segment of Object.keys(ui.rail.segments) as RailSegment[]) {
      ui.rail.segments[segment].addEventListener('click', () => {
        context.update({ railSegment: segment });
      });
    }
    ui.rail.segments.dispatcher.parentElement?.addEventListener('keydown', (event) => {
      const next = segmentAfterKey(state.railSegment, event.key);
      if (next === undefined) return;
      event.preventDefault();
      context.update({ railSegment: next });
      ui.rail.segments[next].focus();
    });

    ui.rail.drawerToggle.addEventListener('click', () => {
      context.update({ drawerOpen: !state.drawerOpen });
    });

    ui.rail.openDispatcher.addEventListener('click', () => {
      context.openTab('dispatcher');
    });
    ui.rail.openTraffic.addEventListener('click', () => {
      context.openTab('traffic');
    });
    ui.rail.openBuilding.addEventListener('click', () => {
      context.openTab('building');
    });
    ui.rail.openMachines.addEventListener('click', () => {
      context.openTab('machines');
    });
    ui.coach.allScenarios.addEventListener('click', () => {
      context.update({ tab: 'scenarios' });
    });
    ui.buildingEditor.openMachines.addEventListener('click', () => {
      context.openTab('machines');
    });
  }

  /* ---------------------------------------------------------------------- *
   * Header and footer — § 1.1 S3, S4
   * ---------------------------------------------------------------------- */

  function wireHeaderAndFooter(): void {
    /*
     * `docs/16` § 5 clause 5 — the way back in.
     *
     * The menu is a place the player leaves and has reason to return to: to change building, to
     * read a board, to sign in. It had no way back at all, so every one of those meant reloading
     * the page and losing the week. One button, and the `reopen` intent it dispatches is the same
     * one `?screen=` uses, so there is one answer to *what does re-opening the menu do*.
     */
    ui.header.openMenu.addEventListener('click', () => {
      dispatchMenu({ kind: 'reopen' });
    });

    /*
     * GAMEPLAY § 3.2's swap, returning — the half that makes the door two-way.
     *
     * The rail row in the other shell opens this surface; for one wave nothing brought a player
     * back, so crossing over stranded them in the developer tool for the rest of the visit. This is
     * that way back, and it is deliberately the *player's* control rather than a debug affordance:
     * it sits beside `Menu`, which is the other "leave this surface" button, and it presses through
     * `everyday/swap.ts`'s port so this module never names the Everyday shell.
     *
     * **Both words come from `everyday/types.ts`.** `index.html` carries the id and nothing else —
     * the rail's own row reads its note from the same module, and two shells describing one door in
     * two wordings is exactly what that module was extracted to prevent.
     *
     * The control is `hidden` until a shell is mounted, and it is not refused when none is: on a
     * page with no Everyday Mode there is no world to go back to, so a sentence saying the swap is
     * unavailable would be claiming one exists. `everyday/swap.ts`'s docstring has the argument.
     * Nothing unsubscribes because this boot runs once and lives as long as the document.
     */
    ui.header.backToEveryday.textContent = ENGINEER_RETURN_LABEL;
    ui.header.backToEveryday.title = ENGINEER_RETURN_TITLE;
    const showSwapDoor = (): void => {
      ui.header.backToEveryday.hidden = everydaySwap() === undefined;
    };
    showSwapDoor();
    onEverydaySwapProvided(showSwapDoor);
    ui.header.backToEveryday.addEventListener('click', () => {
      everydaySwap()?.returnToEveryday();
    });

    ui.header.viewMode.addEventListener('change', () => {
      const value = ui.header.viewMode.value;
      if (!isViewMode(value)) return;
      window.localStorage.setItem(MODE_KEY, value);
      context.update({ mode: value });
      /*
       * The status strip is written here as well as on `adopt` — issue #71, and see
       * {@link drawTransportStatus} for why it is not in `renderAll`. These are the two moments the
       * derived text can change: a new recording, and the reader moving this control. A mode change
       * that left the strip on the previous mode's words would be the disclosure selector doing
       * three-quarters of something, which is worse to read than doing none of it.
       */
      drawTransportStatus(true);
    });
    /*
     * The remembered mode, **unless the link named one**. A deep link is somebody sending a
     * finding to somebody else; a remembered preference that overrode it would show the recipient
     * a different page from the one that was sent, and neither of them would know.
     */
    const linked = new URLSearchParams(window.location.search).get('mode');
    const remembered = window.localStorage.getItem(MODE_KEY);
    if (!isViewMode(linked) && isViewMode(remembered)) state = { ...state, mode: remembered };

    /*
     * **The reveal, brought back** — issue #130, § D330's first condition. Beside the mode and for
     * the mode's own reason: this is a disclosure preference, not progress, and `persist/`'s
     * envelope is the *week*, refused whole when any part of it will not read. An unknown tab name
     * must not be able to cost a player their week, so it lives in its own slot where the worst it
     * can do is resolve to *nothing revealed* — the state a first visit is already in.
     *
     * There is no deep-link arm to answer here, and the reason is not *because nothing carries a
     * tab*. {@link syncUrl} keeps the address describing the state, so a reload **does** come back
     * to the surface the reader was on — `?tab=dispatcher` survives where `persist/`'s ledger
     * correctly says the *session* does not store one. The two are different questions: `?tab=`
     * names where to look, and this names what the strip offers. A link that shrank the strip would
     * be a sender taking surfaces off a recipient's page, which is the opposite of what a deep link
     * is for, so this is restored unconditionally and the address decides nothing about it.
     *
     * That distinction is not decorative: it is why `tabGate.browser.test.ts`'s reload case has to
     * leave the editor before it reads the strip. The active tab is shown whether or not it was
     * revealed, so a case that reloaded straight into `?tab=dispatcher` would have been reading the
     * address bar and calling it persistence.
     */
    state = { ...state, revealedTabs: loadRevealedTabs() };

    /*
     * **Two controls, and they copy two different artefacts** — GitHub issue #118 § 2.
     *
     * It was one, and the history matters: `#copy-provenance` on the transport called the same
     * function with the same arguments and produced the *same line* as `#copy-run`, so the
     * duplicate went (`docs/12` § 4.7) and RV-T7's *one control that copies the run's provenance*
     * was satisfied. That is still true — what changed is which artefact is the provenance.
     *
     * `copy run` now copies a **URL that opens the run**, because that is the thing a player can
     * send to somebody who does not have the repository checked out, and because this product's
     * determinism is what makes a link worth sending. `copy CLI` keeps the flags, for the reader
     * who wants the run outside a browser in the tool every published figure was measured with.
     * Two artefacts, two controls, and neither pretending to be the other.
     */
    ui.footer.copyRun.addEventListener('click', () => {
      void copyArtefact(
        'copy run',
        ui.footer.copyRun,
        shareLinkOf(state, resources, deepLinkDefaults, shareBase()),
        'link',
      );
    });
    ui.footer.copyCli.addEventListener('click', () => {
      void copyArtefact('copy CLI', ui.footer.copyCli, provenanceLineOf(state, resources), 'CLI line');
    });
  }

  function drawHeader(view: ViewAt): void {
    /*
     * The select follows the state rather than the other way round. It was set only on the
     * remembered-mode path, so a `?mode=advanced` link put the page in engineer mode with the
     * control reading *Casual* — the panels and their own switch disagreeing about which mode
     * the reader was in.
     */
    if (ui.header.viewMode.value !== state.mode) ui.header.viewMode.value = state.mode;
    setText(ui.header.buildingName, buildingNameOf(resources, state.savedBuildings, state.buildingId));
    // `view.building`, not the boot-scope binding: the two differ exactly when there is no
    // recording, which is the case § D234 is about. Reading the binding here is what put the
    // tutorial's geometry under the next scenario's name.
    setText(
      ui.header.buildingSub,
      view.building === undefined ? '' : statLineOf(view.building),
    );
    setText(
      ui.header.clock,
      view.recording === undefined
        ? clockAt(0, runStartOfDayS)
        : clockAt(view.simTimeS, runStartOfDayS),
    );
    // The run's own hour, exactly as the clock two lines up — the pill's segment carries clocked
    // titles, and a second call site on the default axis is how two clocks come back (defect 2).
    const phase =
      view.recording === undefined
        ? undefined
        : phaseAt(view.recording, view.simTimeS, { dayStartS: runStartOfDayS ?? DAY_START_S });
    setText(ui.header.phaseLabel, phase?.label ?? 'no run yet');
    /*
     * Slice 4b — the pattern the selector holds at the playhead, beside the phase pill and
     * updating as the playhead crosses a switch, because it re-derives per frame from the
     * recording exactly as the phase pill does. Hidden — not emptied — when the run built no
     * detector or there is no run yet: the readout's `label` is `''` precisely then, and a
     * visible empty pill would still *look* like a claim. The words come from the model
     * (`PATTERN_NAMES`, rule 11), never a bare engine id.
     */
    const pattern =
      view.recording === undefined
        ? undefined
        : patternReadoutAt(view.recording, view.simTimeS);
    ui.header.patternLabel.hidden = pattern === undefined || pattern.label === '';
    setText(ui.header.patternLabel, pattern?.label ?? '');
    if (pattern !== undefined && pattern.title !== '') {
      ui.header.patternLabel.setAttribute('title', pattern.title);
    } else {
      ui.header.patternLabel.removeAttribute('title');
    }
    setText(
      ui.header.dayLabel,
      `Day ${String(state.week.day)} · ${weekdayOf(state.week.dayIdx)}`,
    );
    const population =
      view.building?.floors.reduce((total, floor) => total + floor.population, 0) ?? 0;
    setText(ui.header.tenantsLine, `${population.toLocaleString('en-GB')} tenants`);
  }

  /**
   * § 1.1 S4 — the counts at the playhead, and **whose run they are of**.
   *
   * ## The one branch, and why it is here rather than in `drawWatching`
   *
   * `docs/20` defect 7: while watching, this line read `paused · 363 arrived, 363 carried · lobby
   * holder` with `seed 20260804 · day 1` beneath it — the *spectator's* dispatcher and the
   * *spectator's* seed, under a strip headed `THEIR DISPATCHER Conventional collective`. The counts
   * were right, because they come from the recording on the stage; the identity was wrong, because
   * it came from `state`, and `watch/session.ts#watchingStateOf` deliberately leaves everything but
   * `recording` alone. A spectator reading their own seed under somebody else's day is § 14.1's own
   * *"will read the figures as their own"*, arriving through the one surface that names a run
   * without describing it.
   *
   * The branch is **here** rather than in `drawWatching`, which owns every other spectator surface,
   * because the identity is one clause of a sentence whose other clauses move every frame. Two
   * writers for one element is how a footer comes to show a stranger's dispatcher beside the
   * player's counts; one writer reading one `watching` is not.
   */
  function drawFooter(view: ViewAt): void {
    const watched = watching;
    const profile = profileById(resources, state.savedDispatchers, state.dispatcherId);
    // The record's dispatcher, in the words `watch/view.ts` already resolved for the strip's own
    // `THEIR DISPATCHER` cell — a second lookup here is a second answer to whose run this is.
    const dispatcherName = watched === undefined ? profile.name : watched.view.dispatcherName;
    const observations =
      view.recording === undefined ? undefined : observationsAt(view.recording, view.simTimeS);
    setText(
      ui.footer.statusLine,
      observations === undefined
        ? 'no shift run yet'
        : `${view.playing ? 'running' : 'paused'} · ${String(observations.arrived)} arrived, ` +
          `${String(observations.carried)} carried · ${dispatcherName.toLowerCase()}` +
          (watched === undefined ? '' : ` · ${shellWatchingCopyOf(watched.view).footerNote}`),
    );
    setText(
      ui.footer.seedLine,
      watched === undefined
        ? `seed ${state.seed.toString()} · day ${String(state.week.day)}`
        : footerSeedLineOf(watched.run.record),
    );
  }

  /**
   * Copy one provenance artefact, or say why there is none — TP-13, widened to two artefacts.
   *
   * `noun` is what the refusal calls the thing that does not exist (*no link*, *no CLI line*),
   * because a button that reads *no artefact* tells a reader nothing about which of the two they
   * pressed. The refusal itself is the same shape as before and for the same reason: the control
   * refuses rather than copying something that would rebuild a **different** run, and it names
   * every reason, because each is a fact about this run the reader would otherwise meet as an
   * unexplained mismatch.
   */
  async function copyArtefact(
    label: string,
    button: HTMLButtonElement,
    artefact: Provenance,
    noun: string,
  ): Promise<void> {
    if (!artefact.ok) {
      setText(ui.transport.status, `no ${noun} reproduces this run — ${artefact.reasons.join('; ')}`);
      setText(button, `no ${noun}`);
      window.setTimeout(() => {
        setText(button, label);
      }, 1400);
      return;
    }
    try {
      await navigator.clipboard.writeText(artefact.line);
      setText(button, 'copied');
    } catch {
      // A clipboard a browser refuses is not an error the reader caused. Show the line instead.
      setText(ui.transport.status, artefact.line);
    }
    window.setTimeout(() => {
      setText(button, label);
    }, 1400);
  }

  /**
   * This run's disclosure items, in both modes at once — the layer's one shipped derivation.
   *
   * Asked here and handed to both consumers (`docs/16` S5). {@link drawParity} checks them whole and
   * {@link drawTransportStatus} draws two of them; two calls would be two answers to *what does this
   * run disclose*, and the parity check would then be checking a list that is not the list on
   * screen — which is the one thing that check may not do.
   */
  function disclosureNow(): readonly DisclosureItem[] {
    const recording = state.recording;
    if (recording === undefined) return [];
    return disclosureItems({
      recording,
      dispatcherName: profileById(resources, state.savedDispatchers, state.dispatcherId).name,
      lockedOut: lockedOutAt(recording, recording.endedAt),
      showEnergyAxis: menuState.settings.showEnergyAxis,
    });
  }

  function drawParity(): void {
    /*
     * Parity is a property of **what was mounted**, not of the mode toggle: § 4's rule is that
     * Basic may never hide a failure Advanced would show, and that is a claim about this run's
     * items. So the items are derived from the recording and checked whole — a check over an empty
     * list would pass every time and say nothing.
     */
    const items = disclosureNow();
    setText(ui.header.modeParity, items.length === 0 ? '' : (parityRefusal(items) ?? ''));
  }

  /**
   * The transport's own reading of the run — **through the disclosure layer**, GitHub issue #71.
   *
   * ## What was here, and why it was the majority of the issue
   *
   * This line was built from `recording.summary` directly: `AWT 13.1 s · WT95 27.4 s`, mode-blind,
   * on a screen whose mode selector claims to simplify things for a reader out of their depth. The
   * disclosure layer's per-mode renderings *were* computed on every recording — and then dropped
   * with `void itemsIn;`, a deliberate no-op keeping the import used (§ D240 § 2). So the layer had
   * a non-test caller that used it for a check and discarded its output, which is the standing
   * requirement's own shape one level in: **a call whose return value is dropped looks exactly like
   * a caller and is not one.**
   *
   * ## Why this is written on adopt, on a mode change, and on a register change — not per frame
   *
   * `#status` is also where four transient messages land — the copied provenance line, *copied*,
   * *the shift did not run*, a batch's progress — each of which restores itself after its own
   * moment. A writer that re-wrote the derived text every frame would clobber whichever of those
   * was on screen, which is a regression wearing a fix. So the derived text is written only when
   * it **changed**: {@link lastTransportStatusKey} remembers what the line was derived for, `renderLive`
   * calls this at 60 Hz, and the write happens exactly when the line's register flips — the
   * playhead reaching `endedAt`, or scrubbing back off it — plus the two original moments (a new
   * recording, the mode selector), which pass `force` because they are also the moments a stale
   * transient must yield. Between those instants the derived text is constant, so the transients
   * keep the screen exactly as they did when this ran on two call sites.
   */
  function drawTransportStatus(force = false): void {
    const recording = state.recording;
    /*
     * The register is a function of three facts — which run, which mode, and whether the playhead
     * has reached the run's end — and of nothing that moves between those flips. Keyed on them so
     * the 60 Hz caller pays one string compare per frame, not a `disclosureItems` rebuild: the
     * items fold the whole recording and are exactly the work this line must not redo per frame.
     */
    const progress =
      recording === undefined
        ? undefined
        : { atS: playback?.simTimeS ?? recording.startedAt, endedAt: recording.endedAt };
    const key = `${recording?.runId ?? 'none'}|${state.mode}|${
      progress !== undefined && progress.atS < progress.endedAt ? 'playing' : 'ended'
    }`;
    if (!force && key === lastTransportStatusKey) return;
    const text = transportStatusOf(disclosureNow(), state.mode, progress);
    if (text === undefined) return;
    lastTransportStatusKey = key;
    setText(ui.transport.status, text);
  }

  /* ---------------------------------------------------------------------- *
   * The coach ribbon — § 1.3 M2
   * ---------------------------------------------------------------------- */

  function wireCoach(): void {
    ui.coach.building.addEventListener('change', () => {
      /*
       * The week being put down, read **before** the switch — GitHub issue #107.
       *
       * `withBuilding` parks it rather than destroying it, and the ribbon still shows the new
       * week's day 1, which from the outside looks exactly like the defect. `weekKeptLine` is the
       * sentence that tells the difference; it is `undefined` for a week with nothing in it, which
       * is every building change made while a player is still choosing one.
       */
      const leaving = state.week;
      state = withBuilding(state, resources, ui.coach.building.value);
      renderAll();
      runShift();
      /*
       * Set **after** the run and drawn on its own, because `runShift` is what spends the two
       * notices already on screen — assigning this one before it would hand it to the line that
       * clears it. Only the ribbon is redrawn: nothing else on the page depends on this string.
       */
      weekNotice = weekKeptLine(leaving, state.week);
      if (weekNotice !== undefined) drawCoach(viewAt());
    });
    ui.coach.pattern.addEventListener('change', () => {
      context.update({ pattern: ui.coach.pattern.value });
      runShift();
    });
    ui.coach.shiftLength.addEventListener('change', () => {
      // One control, two fields — § D286. The option's id carries both halves of the selection, so
      // this handler does not have to know what a part is; `freePlayPatch` is the same decision in
      // the menu, and both go through the one parser.
      const part = partById(coachParts(), ui.coach.shiftLength.value);
      if (part === undefined) return;
      context.update({ shiftLengthS: part.durationS, windowStartS: part.windowStartS });
      runShift();
    });
  }

  /**
   * The parts of the day the campaign's select offers, for whatever template is about to run.
   *
   * Read through `shiftDemandTemplateId` rather than from `state.pattern` directly, so the options
   * are parts of the period the run will actually use — a select offering a lunch peak of a template
   * the run is not on is § D177's inert control with a plausible label.
   */
  function coachParts(): readonly DayPart[] {
    return partsOfDay(
      resources.trafficProfiles.demandTemplates,
      shiftDemandTemplateId(resources, state, buildingConfigOf(resources, state.savedBuildings, state.buildingId)),
    );
  }

  function drawCoach(view: ViewAt): void {
    fillSelect(
      ui.coach.building,
      allBuildingIds(resources, state.savedBuildings).map((id) => ({
        value: id,
        label: buildingNameOf(resources, state.savedBuildings, id),
      })),
      state.buildingId,
    );
    fillSelect(
      ui.coach.pattern,
      [
        { value: 'building', label: 'The building’s own demand' },
        ...resources.trafficProfiles.profiles.map((profile) => ({
          value: profile.id,
          label: profile.name,
        })),
        ...state.savedPatterns.map((saved) => ({
          value: saved.id,
          label: `${saved.spec.name} (yours)`,
        })),
      ],
      state.pattern,
    );
    /*
     * *Part of the day*, derived from the loaded records and **the same list Free play offers** —
     * issue #82, which reported one setting wearing two names, four narrative options here and five
     * numeric ones there. `partsOfDay` is the single derivation; this select and `menu/screens.ts`
     * both read it, so the two cannot drift into two answers again.
     */
    fillSelect(
      ui.coach.shiftLength,
      coachParts().map((part) => ({ value: part.id, label: part.label })),
      partIdOf(state.windowStartS, state.shiftLengthS),
    );

    /*
     * Both lines from one decision, and the decision is not here — see `shift/weekLabel.ts`.
     *
     * What was here tested `state.week.contractId === undefined` on a field typed `string`, so the
     * *Sandbox* eyebrow and the *free play* progress line were **unreachable**: a reader's own
     * building was labelled *Scenario · day 4* and told how many clean shifts it had banked toward
     * nothing. TypeScript does not object to `string === undefined`, which is why a strict build
     * carried it.
     */
    const coach = coachWeekLines(state.week, state.shiftLengthS);
    /*
     * The calendar's own caption wins the eyebrow when a period is running, because it is the more
     * specific true thing: *Vacation week · Monday* says both what day it is and what kind of week,
     * where *Scenario · day 1* says only the second. Built from **what was applied** rather than
     * from what was asked for — a withheld template never appears in it.
     */
    setText(ui.coach.label, calendarCaption === '' ? coach.label : calendarCaption);
    setText(ui.coach.title, buildingNameOf(resources, state.savedBuildings, state.buildingId));
    setText(ui.coach.progress, coach.progress);
    setText(ui.coach.hint, coachHint(view));
  }

  function coachHint(view: ViewAt): string {
    // Ahead of the withheld refusals: those are about the run on screen, and this is about whether
    // the run on screen is the one the player left. Both outrank advice.
    /*
     * Precedence, and it is decided rather than incidental. `saveNotice` outranks everything because
     * it is the only one about the future — a player who is no longer being saved needs to know
     * before they spend another twenty minutes. Then the week that could not be read, then what was
     * dropped out of the library, then the run's own refusals, then advice.
     */
    if (saveNotice !== undefined) return saveNotice;
    if (restoreNotice !== undefined) return restoreNotice;
    if (libraryNotice !== undefined) return libraryNotice;
    /*
     * Below the two that are about the save and above the run's own refusals — issue #107. It
     * outranks `withheld` because a player who has just moved between assignments is asking *what
     * happened to my week*, and it sits under the other two because those describe a condition that
     * is still true while this one describes a keystroke.
     */
    if (weekNotice !== undefined) return weekNotice;
    if (state.withheld.length > 0) return state.withheld.join(' ');
    if (view.recording === undefined) {
      return 'Press play and watch a call appear, a car answer it, and the wait end. That is the whole simulator in one move.';
    }
    const observations = observationsAt(view.recording, view.simTimeS);
    if (observations.arrived < 20) {
      return 'Nothing is graded before the building wakes up — the goals stay blank until twenty people have called.';
    }
    if (observations.waitingNow > 25) {
      return 'This is the crunch. Watch which floor stacks up, then try a different dispatcher in the rail — a smarter one is free, a fifth car is not.';
    }
    return 'Keep an eye on the goals in the left rail. The building only gets busier tomorrow.';
  }

  /* ---------------------------------------------------------------------- *
   * The run
   * ---------------------------------------------------------------------- */

  /**
   * How big the run `plan` describes is about to be — `dev/shiftRunner.ts#shiftRunCostOf`.
   *
   * The rate is read the way `core` reads it: `config.demand.arrivalRatePctPop5min` when the player
   * named one, and otherwise the building's own profile at the `typical` band, which is the
   * precedence `Simulation` itself applies. A second guess at it here would be a number that agreed
   * with the run on the cells anybody checked and diverged on the rest — `dev/batchPanel.ts`'s
   * `effectiveRatePctPop5min` makes the same argument one tab over, and this follows it rather than
   * inventing a third rule.
   *
   * A building whose profile this build does not carry yields `0`, which reads as *not heavy* — the
   * config layer already warns about that case, and a size estimate is not the place to raise it a
   * second time.
   */
  function costOf(plan: ShiftRunConfig): ShiftRunCost {
    const named = plan.config.demand?.arrivalRatePctPop5min;
    /*
     * `plan.config.trafficProfiles` and **not** `resources.trafficProfiles`: a reader who edited the
     * pattern is running against `trafficProfilesWithPattern`'s widened file, and reading the
     * shipped one here would estimate the run they did not ask for. The config is what the kernel
     * is handed, so it is what the estimate is taken from.
     */
    const profile = plan.config.trafficProfiles.profiles.find(
      (entry) => entry.id === plan.building.trafficProfile,
    );
    const ratePctPop5min = named ?? profile?.arrivalRatePctPop5min.typical ?? 0;
    return shiftRunCostOf({
      population: plan.building.totalPopulation,
      ratePctPop5min,
      // `durationS` when the run is the whole period and the window's own length when it is a part
      // of one — § D286 puts exactly one of the two on the config, so this reads whichever is there.
      durationS:
        plan.config.durationS ??
        (plan.config.windowEndS ?? 0) - (plan.config.windowStartS ?? 0),
    });
  }

  /**
   * Simulate the shift the current state describes — **on a worker**, since `dev/shiftWorker.ts`.
   *
   * ## What moved, and what deliberately did not
   *
   * This function used to call `recordRun` inline, which put a 31–70 s synchronous simulation on
   * the thread that paints (the UI readiness audit's B3; 21–31 s measured in Node on the worst cell
   * the menu offers, under the shipped `collective` — see `dev/shiftRunner.ts` for the table and for
   * why that row rather than a slower one). Everything up to and including `shiftRunConfigOf` is **still synchronous and
   * still here**: it is the part that can refuse, and a refusal must land on the same keystroke that
   * caused it. What crosses the thread is the run.
   *
   * Its **signature has not changed**, and that is the point rather than a convenience. Fourteen
   * call sites in this file are `runShift()` at the end of a handler, and every one of them was
   * already fire-and-forget — nothing read `state.recording` on the next line. The two that set a
   * notice *after* the call still work, because the clearing they order themselves against happens
   * in the synchronous prologue below.
   *
   * The one thing that did have to move is `drawMenu()`: boot draws the overlay immediately after
   * calling this, and on a synchronous run that overlay was painted over a finished recording.
   * See {@link applyShift}.
   */
  function runShift(
    onRan?: (recording: VizRecording) => void,
    cause: 'player' | 'intervention' = 'player',
  ): void {
    // Latched per start, so the value `closeShift` reads is about the run that will land — the
    // runner supersedes in-flight asks, and the latest ask is the one whose recording files. See
    // {@link runCause}; `'player'` is the default because every press but one means *a new ask*.
    runCause = cause;
    setText(ui.transport.error, '');
    /*
     * The restore notice survives boot's own run and nothing after it.
     *
     * `urlWritable` is `false` for exactly the boot sequence and `true` from the first real state
     * change onward, which is the same *"is this the reader doing something?"* question this needs —
     * so it is reused rather than answered twice. A second flag would be a second thing to keep in
     * step with the boot order.
     */
    /*
     * The three backward-looking notices are spent once the player does something; `saveNotice` is
     * not, because it describes a condition that is still true and will still be true next time.
     *
     * `weekNotice` is written by the building select *after* this line has run in the same handler,
     * which is what makes it survive its own change and no other — see `wireCoach`.
     */
    if (urlWritable) {
      restoreNotice = undefined;
      libraryNotice = undefined;
      weekNotice = undefined;
    }
    try {
      const plan = shiftRunConfigOf(resources, state);
      building = plan.building;
      calendarCaption = plan.calendarLine;
      // The race's inputs move with the run: the plan is what a pick change re-races against,
      // and whatever was in flight is about to be superseded by this start — the latest ask wins,
      // so the flag follows the runner rather than trailing it.
      lastShiftPlan = plan;
      ghostInFlight = false;
      shiftRunner.start({
        label: 'shift',
        config: plan.config,
        outOfServiceCarIds: plan.outOfServiceCarIds,
        /*
         * **On, and the cost was measured rather than assumed.** `recordRun` defaults it to `true`
         * and the left rail's decision log is what reads it, so turning it off would take a shipped
         * surface with it.
         *
         * On the worst cell the menu offers — `vertical-city`/`collective`/`constant-iso`/7 200 s —
         * the log is **818 KB of a 57.3 MB recording, 1.4 %**, because `DecisionCollector` caps at
         * 4 000 entries. Its **run-time** cost is *not resolvable by this apparatus*, which is the
         * honest statement rather than *"it is free"*: two consecutive runs disagreed about the sign
         * across two sessions (48.3 s instrumented against 55.9 s plain in one; 27.5 s against
         * 21.2 s in the other), so what dominates is warm-up and not the collector. There is nothing
         * here worth buying back on a 1.4 % share.
         */
        recordDecisions: true,
        cost: costOf(plan),
        onDone: (recording, startOfDayS) => {
          applyShift(recording, startOfDayS, plan.withheld);
          /*
           * **After the state is written and after the page has been drawn**, so a panel that arms
           * itself here is arming against the run that is on screen rather than the one before it.
           * `dev/dispatcherEditor.ts` then re-renders itself from inside the callback, which is the
           * one extra paint this seam costs and the reason it is a callback rather than a fifth
           * member on {@link MountContext}.
           */
          onRan?.(recording);
          /*
           * The rival runs **after the player's own lands** — sequential, on the same runner, so
           * it is cancel-safe by the runner's own rule: a new primary ask supersedes it, and
           * Cancel stops it. Last in this callback so every panel above armed against the
           * primary, not against a race that has not happened yet.
           */
          scheduleGhost(plan, recording);
        },
      });
    } catch (error) {
      failRun(error);
    }
  }

  /**
   * Take delivery of a finished run. The second half of {@link runShift}, on the message.
   *
   * Everything here was inline in `runShift` before the worker, in this order, and the order is
   * unchanged. What is new is the last line.
   */
  function applyShift(
    recording: VizRecording,
    startOfDayS: number | undefined,
    withheld: readonly string[],
  ): void {
    // The template's own hour, moved on by the window when the run is a part of a day. Absent for
    // `constant-iso`, which declares none — omission means *this has no hour*, never *midnight*.
    runStartOfDayS = startOfDayS;
    // The run this shell simulated — GitHub issue #136, and the only place it is written. See
    // {@link simulatedRecording}.
    simulatedRecording = recording;
    // The rival raced the run that has just been replaced, so its recording goes with it —
    // a ghost line left standing beside a new day would be two different crowds on one scale,
    // which is the one thing the strip exists to never draw. Re-issued by `runShift`'s own
    // callback once this recording is on screen.
    ghostRecording = undefined;
    ghostRefusal = undefined;
    lastRaceKey = '';
    // `tomorrow` goes with `report`: both are accounts of a day that has been closed, and a new
    // run has not closed one. Leaving the beat standing would put yesterday's overnight reveal
    // under today's date, which is the stale-sheet defect § D223 closed one field over.
    state = {
      ...state,
      recording,
      report: undefined,
      tomorrow: undefined,
      withheld,
    };
    adopt(recording);
    renderAll();
    /*
     * **The overlay is redrawn when the run it is standing over finishes** — GitHub issue #97,
     * kept closed across the move to a worker.
     *
     * Boot's sequence is `runShift(); drawMenu();`. On a synchronous run that `drawMenu` painted
     * against a finished recording; on this one it paints against `hasRun === false`, and *Resume*
     * would sit disabled under *"There is no shift on screen to go back to yet"* over a shift that
     * had been simulated and drawn. Issue #97's own sentence, arriving by a new route.
     *
     * Guarded on the overlay being **on screen**, which is the narrow case where its world can have
     * gone stale under it — boot, and the `set-calendar` arm, which already calls `drawMenu()` one
     * line before running. `renderAll` deliberately does not do this (see boot's own note): a
     * rebuild on every state change is issue #106, a press swallowed mid-`mousedown`.
     */
    if (!menuRoot.hidden) drawMenu();
  }

  /**
   * Enter the spectator state — § 14.1, and the whole of what `Watch it` means.
   *
   * ## What is deliberately **not** written
   *
   * {@link simulatedRecording}. The watched run goes onto `state.recording` so the stage, the
   * transport and every panel draw it, and it is never the run this shell simulated — so
   * `shift/banking.ts#bankingRefusalFor`'s object-identity gate refuses it **by construction**,
   * exactly as slice 4d's ghost is refused. That is § 14.1's *"a watched run cannot be closed,
   * scored or posted"* enforced through the refusal the product already had, rather than through a
   * fourth flag `closeShift` would have to remember to consult.
   *
   * `state.week`, `state.report` and `state.tomorrow` are not touched either. The day belongs to
   * somebody else and is already closed; `dayClosed` has no business moving, and the sheet the
   * player left open is theirs and is still theirs when they come back.
   */
  function enterWatch(run: WatchableRun, view: WatchingView, recording: VizRecording): void {
    if (watching !== undefined) return;
    watching = {
      run,
      view,
      before: {
        state,
        ghostRecording,
        ghostRefusal,
        ghostPick,
        startOfDayS: runStartOfDayS,
        filedRunId,
        playheadS: playback?.simTimeS,
        wasPlaying: playback?.state === 'playing',
        baseSpeed,
      },
    };
    /*
     * A mode is being entered, so the latched chip stays behind — `docs/20` defect 10, and
     * {@link resetTransportSpeed} owns the boundary. Read {@link WatchedBefore.baseSpeed} for why
     * the value is saved rather than only dropped: § 14.1 promises the player their own run back
     * exactly as they left it, and the speed is part of *exactly*.
     *
     * **Before `adopt`**, which is not stylistic: `adopt` builds the `Playback` with
     * `playbackRateFor(baseSpeed, …)`, so a reset afterwards would construct the transport at the
     * latched speed and correct it a frame later — a stranger's day would still start at ×900.
     */
    resetTransportSpeed();
    /*
     * The rival's line goes down for the run it raced. Leaving it standing beside somebody else's
     * day would be two different crowds on one scale, which `applyShift` already refuses for the
     * same reason when a new primary lands.
     */
    ghostRecording = undefined;
    ghostRefusal = undefined;
    lastRaceKey = '';
    /*
     * The watched run's own start-of-day hour is not known here — the record carries the
     * configuration, and `runStartOfDayS` is produced by the runner. `undefined` is the honest
     * answer and is what the header already draws for a template that declares no hour: an
     * omission means *this has no hour*, never *midnight*.
     */
    runStartOfDayS = undefined;
    /*
     * Through `watch/session.ts` rather than spelled out here — § 14.1's *"`dayClosed` is
     * untouched, and so is your own day's state"* is a checkable claim, and a claim living in a
     * click handler is a claim nothing checks. `session.test.ts` asserts the untouched half by
     * object identity.
     */
    state = watchingStateOf(state, recording);
    adopt(recording);
    renderAll();
  }

  /**
   * Leave it, putting back exactly what was there — § 14.1's `⤺ Stop watching`.
   *
   * Every field of {@link WatchedBefore} is restored, including the playhead, and the recording is
   * re-adopted rather than re-simulated: it is the **same object** `applyShift` put on the state,
   * so the player's own run comes back as the run this shell simulated and `bankingRefusalFor`
   * stops refusing it — without {@link simulatedRecording} ever having been written. See
   * {@link WatchedBefore} for why that is the lock rather than a convenience.
   *
   * `seekTo` after `adopt`, and only when there was a playhead to put back. `adopt` builds the
   * `Playback`, so seeking before it would seek a transport that has been replaced; seeking a
   * `Playback` does not start or stop it, so a player who was paused comes back paused.
   */
  function stopWatching(): void {
    const session = watching;
    if (session === undefined) return;
    const before = session.before;
    watching = undefined;
    state = before.state;
    ghostRecording = before.ghostRecording;
    ghostRefusal = before.ghostRefusal;
    ghostPick = before.ghostPick;
    runStartOfDayS = before.startOfDayS;
    lastRaceKey = '';
    /*
     * The chip the player latched before they left — see {@link WatchedBefore.baseSpeed}. Assigned
     * **before `adopt`** for `enterWatch`'s reason in reverse: `adopt` reads `baseSpeed` when it
     * builds the `Playback`, so the player's own run comes back at the player's own speed rather
     * than at the spectator default and a correction.
     */
    baseSpeed = before.baseSpeed;
    if (state.recording === undefined) {
      /*
       * A player who had no run of their own gets the stage they had — nothing on it. `adopt`
       * cannot express that (it takes a recording), so the transport is left as the watch left it
       * and the state says there is no run, which is what every panel already reads.
       */
      playback = undefined;
      disableTransport(ui, true);
    } else {
      adopt(state.recording);
      if (before.playheadS !== undefined) playback?.seekTo(before.playheadS);
      /*
       * And paused if they were paused. `adopt` autoplays whenever the overlay has been dismissed,
       * so without this a spectator's return silently starts a run the player had stopped — see
       * {@link WatchedBefore.wasPlaying}. Seeking neither starts nor stops playback, so the order
       * of these two lines is free; `pause` is written after for the reader.
       */
      if (!before.wasPlaying) playback?.pause();
    }
    /*
     * **After `adopt`, which arms the filing gate.** `adopt` sets `filedRunId = undefined`, so a
     * restore that did not put the old value back would let a day the player had already filed
     * file a second time — the same double-bank `WeekState.attempt` exists to make impossible,
     * arriving through the spectator's back door.
     */
    filedRunId = before.filedRunId;
    renderAll();
  }

  /**
   * § 14.1's primary — *"drops the spectator state and opens the brief for the same day, which is
   * the whole reason watching exists."*
   *
   * ## What it does, and the half it deliberately does not do
   *
   * It leaves the spectator state and puts the watched run's **selection** on the player's own
   * state — building, dispatcher, pattern, the two Free Play axes, the length and the window — then
   * runs it. So the player gets the same crowd to play, from their own state, through `runShift`,
   * which is the one function that turns a state into a run.
   *
   * It does **not** carry the record's intervention log or its week day. The log is the other
   * player's changes of mind and copying them would hand the spectator a run they did not make;
   * the day number belongs to the watched week and would grow the spectator's building by somebody
   * else's schedule. Both are omissions with reasons rather than oversights, which is why they are
   * written here — `docs/16` S1.
   */
  function playThisCrowd(run: WatchableRun): void {
    const record = run.record;
    stopWatching();
    if (record === undefined || record === null) return;
    state = {
      ...state,
      buildingId: record.buildingId,
      dispatcherId: record.dispatcherId,
      pattern: record.pattern,
      shiftLengthS: record.shiftLengthS,
      windowStartS: record.windowStartS,
      seed: BigInt(record.seed),
      freePlay:
        record.demandTemplateId === null
          ? state.freePlay
          : {
              demandTemplateId: record.demandTemplateId,
              arrivalRatePctPop5min: record.arrivalRatePctPop5min,
            },
      // The spectator's own log goes, because the run they are about to play is a different day.
      interventions: [],
    };
    renderAll();
    runShift();
  }

  function adoptEditedBuilding(config: BuildingConfig): void {
    const id = config.id;
    const saved = [
      ...state.savedBuildings.filter((entry) => entry.id !== id),
      { id, config },
    ];
    state = { ...state, savedBuildings: saved, buildingId: id, tab: 'run' };
    /*
     * The one library write that does **not** go through `context.update`, so it says so itself.
     * The JSON editor hands a whole `BuildingConfig` back rather than a patch, and a building the
     * reader typed out by hand is exactly the thing issue #113 § 2 is about losing on reload.
     */
    saveSessionNow();
    runShift();
  }

  function failRun(error: unknown): void {
    const message =
      error instanceof SimulationError || error instanceof Error ? error.message : String(error);
    setText(ui.transport.error, message);
    setText(ui.transport.status, 'the shift did not run');
    ui.transport.error.focus();
  }

  

  /**
   * Apply the transport chip and the player's own multiplier together — `docs/16` § 5 clause 4.
   *
   * `settings.playbackSpeed` reached **nothing** before this: `menu/types.ts` declared it, the menu
   * drew it, and the viewer had its own `SPEEDS` ladder that never consulted it. That is a control
   * a player can move in a shipped menu that changes no pixel, which is `docs/12` § 5 clause 9's
   * violation, and it is the one `scope.test.ts` catches structurally now.
   *
   * A **multiplier** rather than a replacement, because the two controls answer different
   * questions. The chip is *how much simulated time passes per real second* — a property of the
   * run being watched, and the thing `×900` means. The setting is *how fast this player likes to
   * watch*, and it should survive changing the chip.
   */
  /**
   * Paint the player's chosen palette onto the document — `docs/16` § 5 clause 4's last setting.
   *
   * `themeFor` decides and this writes, which is the split the rest of `dev/` keeps. `color-scheme`
   * is set alongside the tokens and is not polish: without it a light palette gets dark native
   * scrollbars and `<select>` popups, and no token assertion would catch that because no token is
   * involved.
   *
   * **The stage follows.** `themeFor` now resolves a `stage` palette as well as the shell's tokens,
   * so the limitation this docstring used to name — a light shell around a dark stage — is closed.
   * `data-theme` is stamped on the root for the same reason the tokens are written: it is what makes
   * `index.html`'s `:root[data-theme='light']` block live, and without it the block is dead CSS.
   */
  function applyTheme(): void {
    const theme = themeFor(menuState.settings.theme, (query) => window.matchMedia(query));
    const root = document.documentElement;
    for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(name, value);
    root.style.setProperty('color-scheme', theme.colorScheme);
    root.dataset['theme'] = theme.name;
    stageTheme = theme.stage;
  }

  

  function applyPlaybackSpeed(): void {
    playback?.setSpeed(playbackRateFor(baseSpeed, menuState.settings.playbackSpeed));
  }

  /**
   * Return the transport chip to {@link DEFAULT_BASE_SPEED} — called on **mode entry**, and the
   * boundary is the decision (`docs/19` defect 12).
   *
   * The Everyday handoff's §7.3 rule is *"Speed never carries across days: each run opens at the
   * player's default speed, so a day can never vanish in three seconds because the last one ended
   * at 30×"*. The defect it names is real and was reproduced here: ×900 latched from a previous
   * mode ended Free Play's first day before a frame of it was watched. The boundary shipped is
   * **narrower than the handoff's**, deliberately:
   *
   * - **A mode being entered resets** — Free play's Start, *Keep going*, a leaderboard row's
   *   *beat this*, a commissioning week opening, a scenario card taken
   *   ({@link MountContext.enterMode}). The player is starting a new thing to watch, and the chip
   *   they latched belongs to the thing they left.
   * - **A mid-week re-run keeps the player's chip.** Re-running Tuesday five seconds after
   *   choosing ×240 is the same sitting, the same mode and the same intent; snapping the chip
   *   back on every run would fight the player on exactly the surface they are iterating on.
   *   The handoff's own §4.6 chips survive this deviation because the *settings* multiplier —
   *   the player's declared preference — is not touched here at all.
   *
   * `applyPlaybackSpeed` is called so a playback already adopted follows immediately, and the
   * chrome is redrawn so the lit chip agrees — the same pair the chip's own `onPick` performs.
   */
  function resetTransportSpeed(): void {
    baseSpeed = DEFAULT_BASE_SPEED;
    applyPlaybackSpeed();
    drawTransportChrome(viewAt());
  }

  function adopt(recording: VizRecording): void {
    playback = new Playback(recording, clock, {
      speed: playbackRateFor(baseSpeed, menuState.settings.playbackSpeed),
      loop: looping,
      /*
       * KB-14: a reader who asked for less motion gets a paused first frame — and `docs/16` § 5
       * clause 4, because *asked* now includes the menu's own switch and not only the operating
       * system's. `shouldAutoplay` reads `prefers-reduced-motion`; a player who set the setting has
       * asked for the same thing by a different route and was being ignored.
       *
       * **And nothing plays until the overlay has been dismissed** — § D232, issue #39. Boot's own
       * `runShift()` lands under the menu overlay, so a page nobody had touched read
       * `running · 0 arrived, 0 carried` on load and had carried 376 people by the time the reader
       * finished the menu. The recording is still made and still drawn — the stage shows the
       * building at 06:00, which is the start state a cold load should sit at — it simply does not
       * start moving on its own behind a screen the player has not left yet.
       *
       * `menuHasBeenDismissed` rather than `playerHasChosen` — issue #117 split the two, and this
       * is the half that keeps **Resume** behaving exactly as § D232 wrote it: a player who pressed
       * Resume has left the menu on purpose, and a run they re-roll should play. What Resume no
       * longer does is let a run **count**; that is `closeShift`'s gate and the reason for the
       * split.
       */
      autoplay:
        menuHasBeenDismissed &&
        shouldAutoplayWith(window.matchMedia.bind(window), menuState.settings.reduceMotion),
    });
    disableTransport(ui, false);
    filedRunId = undefined;
    /*
     * The other half of the filing gate re-armed with it — issue #287. A new recording has not
     * ended anywhere yet, so the record of *where the last one ended* would be a claim about a run
     * that is no longer on screen. See {@link endedUnderTheCover} for why clearing it here is safe
     * even mid-cover: the next frame re-derives it from the transport and the port.
     */
    endedUnderTheCover = undefined;
    selectedLandingId = '';
    fillLandingSelect(recording);
    fillBankSelect(recording);
    /*
     * Through the disclosure layer — issue #71, and the suppression comes with it.
     *
     * This was a two-arm ternary over `meansAreSuppressed(recording)` reading `summary.meanWaitS`
     * and `summary.wait95S` directly: mode-blind, and a **second** copy of the R9 refusal that
     * `mode/disclosure.ts` already owns. Both problems go together, because the renderings this now
     * reads are the ones `drawParity` checks — so the line on screen and the parity claim about it
     * can no longer be about two different lists.
     */
    drawTransportStatus(true);
  }

  /**
   * Close the shift and file the sheet.
   *
   * The report is built from the **whole** recording rather than from the playhead: a day's account
   * is the day's, and a reader who paused at 09:00 has not made the afternoon not happen.
   */
  /**
   * Whether the caret is somewhere a navigation would throw work away.
   *
   * The DOM read, kept apart from {@link reportOpensItself}'s decision for the reason every panel
   * in `dev/` states: a decision that needs a `document` cannot be tested. A `<select>` counts —
   * an open dropdown unmounted underneath the reader is the same interruption as an unmounted
   * textbox, minus the lost characters.
   */
  /** The focused element as a `(tagName, role)` pair — the DOM half of {@link spaceBelongsToFocus}. */
  function activationRoleOf(active: Element | null): ActivationRole {
    return {
      tagName: active?.tagName ?? '',
      role: active?.getAttribute('role')?.trim().toLowerCase() ?? '',
    };
  }

  function focusIsInAControl(): boolean {
    const active = document.activeElement;
    return (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    );
  }

  /**
   * Whether the run on screen has been played to its end — the one test, asked in one place.
   *
   * `runProgressOf` is `dev/reportPanel.ts`'s and is imported rather than re-derived. It is the
   * predicate that decides whether the sheet is allowed to be a whole-day account (§ D223), and
   * *"may this day be filed"* has to be the same question or the tab banks a day the sheet on it is
   * declining to report. Two answers to that is § D223's own two-answers screen, one layer down.
   */
  function playheadHasRunOut(): boolean {
    return runProgressOf(viewAt()).kind === 'played-out';
  }

  /**
   * The between-day beat for a week that has just closed a day — GitHub issue #91.
   *
   * Split out of {@link closeShift} so the *mapping* is readable and so the two population figures
   * are visibly measured on two different buildings: today's is the one the run that just ended
   * actually resolved to (`building`, written by `runShift` from `shiftRunConfigOf`), and
   * tomorrow's is `tomorrowFactsOf`'s, which resolves tomorrow's document through the same chain.
   * Neither is a multiplier on the other, which is the whole of the honesty claim this beat makes.
   *
   * `building` rather than a fresh resolve, and that is a consistency property rather than a
   * saving: `drawHeader` reads the same binding for its `N tenants` line, so the beat's *from*
   * figure is the number already on the screen. A second resolve here could disagree with the
   * header the moment anything moved between the run and the close — which is the two-answers
   * defect this sheet has been repaired for twice.
   *
   * It is `undefined` only before the first run, and a day cannot close before one — the `0`
   * fallback is a total-function guard rather than a reachable state, and it is a fallback for a
   * *count* rather than for a rate, so it cannot become a plausible-looking statistic.
   */
  function briefingFor(
    week: WeekState,
    closed: DayOutcome,
    verdict: ShapedDayReport['verdict'],
  ): TomorrowBriefing {
    const facts = tomorrowFactsOf(resources, { ...state, week });
    return tomorrowBriefingOf({
      closed,
      week,
      contract: contractById(week.contractId),
      verdict,
      populationToday: building?.totalPopulation ?? 0,
      populationTomorrow: facts.population,
      calendarLineTomorrow: facts.calendarLine,
      withheldTomorrow: facts.withheld,
    });
  }

  function closeShift(): void {
    const recording = state.recording;
    if (recording === undefined || filedRunId === recording.runId) return;
    /*
     * Nothing is filed before the player has entered a mode — § D232, issue #39.
     *
     * The shell opens on the menu over a viewer that has already run boot's shift. Without this, a
     * cold load with the overlay still up reached `tick`, found `playback.state === 'ended'`, and
     * closed a day: `1 clean days running` and `1/3 banked this scenario` on a page nobody had
     * touched. The run itself is real and stays on screen; what it may not do is count.
     *
     * **And `playerHasChosen` is the narrow flag, not `menuHasBeenDismissed`** — GitHub issue #117.
     * Pressing *Resume* dismisses the overlay without entering a mode, and while the two questions
     * shared one flag that press un-gated this line over boot's own recording: it filed as a real
     * day and became the baseline the Day report differenced the player's *next* run against. A
     * banked day is not the only thing a premature file costs.
     */
    if (!playerHasChosen) return;
    /*
     * **And a run this shell did not simulate files nothing** — GitHub issue #136.
     *
     * Above `filedRunId` on purpose. Latching there would mark the loaded run as filed, and the
     * next thing the player does with it — press *Day report*, press *Export report PNG* — would
     * then be met by the first line's silent early return instead of by a sentence. The decision
     * and its argument are `shift/banking.ts`'s; the only thing that happens here is that it is
     * asked, before anything has been written.
     */
    const cannotBank = bankingRefusalFor(recording, simulatedRecording);
    if (cannotBank !== null) {
      setText(ui.transport.status, cannotBank);
      return;
    }
    filedRunId = recording.runId;
    // This sitting now has a filed sheet, so the empty state's previous-sitting sentence retires —
    // see {@link filedThisSitting}. Written at the latch rather than at the save, because the fact
    // it records is *a sheet existed*, not *a write succeeded*.
    filedThisSitting = true;
    const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
    /*
     * The same expression the rail draws from — `dev/leftRail.ts#shiftGoalsOf`, and it is one
     * function rather than two identical lines because the sheet this files and the rail the
     * player watched it against must ask the day the same thing.
     */
    const goals = shiftGoalsOf(state, resources);
    const readings = readGoals(goals, observations);
    /*
     * The event the run was under, not the one the ordinary schedule would have given — GitHub
     * issue #135, and this is the caller with the widest blast radius of the four. It feeds three
     * things: `outcomeOf`'s `eventId`, which goes into the week's own history; the sheet's
     * `bookedLine`, which prints the name and the note as *identity*; and `ReportBasis.demand`'s
     * week-day arm, where a wrong id makes a calendar-overridden day pair with an ordinary one as
     * one question — the exact comparison § D311 built the basis to refuse.
     */
    const event = scheduledEventFor(state.calendar, state.week.day, state.week.dayIdx);
    const outcome = outcomeOf({
      day: state.week.day,
      dayIdx: state.week.dayIdx,
      eventId: event.id,
      readings,
      minutePct: observations.minutePct,
      carried: observations.carried,
      arrived: observations.arrived,
      /*
       * The run this day was, so it can be watched — Everyday Mode slice 8, § 14.1 / § 1.5.
       *
       * `undefined` when `watchRecordIssues` has something to say, stored as `null`, and the two
       * spellings are one decision rather than sloppiness: `watchRecordOf` answers `undefined` in
       * the language of *"there is no such value"*, and `DayOutcome.record` spells absence the way
       * a JSON round trip can carry it — `Observations.peakQueueFloorId`'s own note, one struct
       * over.
       *
       * Written from **`state`**, which is the run this shell simulated: `bankingRefusalFor` has
       * already refused every other case forty lines up, so by here the recording on screen *is*
       * `simulatedRecording` and `state` is the question that produced it. Reading the menu's
       * selection instead would be § D318's defect — a record describing whatever a select was
       * left on after the run.
       */
      record: watchRecordOf(state, resources) ?? null,
      /*
       * And **why**, when there is no record — `docs/20` defect 1. Written from the same `state` on
       * the same line for the same reason: the two are one fact with two spellings, and a day that
       * carried a `null` record with no cause is what made every day filed after a rule was written
       * unwatchable under a sentence blaming the file format.
       */
      recordRefusal: recordRefusalFor(state, resources),
    });
    /*
     * **The week is written only by a mode that owns one** — § D231, issue #64.
     *
     * This line was `closeDay(state.week, outcome)`, unconditional, *above* the `playMode` branch
     * forty lines down that shapes the sheet's `subject`. So a Free Play run advanced and wrote the
     * scenario week while the sheet it produced printed *"one run, not part of a week — nothing is
     * banked"* — and `saveSessionNow()` below put it in `localStorage`, where it survived a reload
     * and took the player's banked shifts with it.
     *
     * The decision is `dev/state.ts`'s and is asserted there against a week with a banked day in
     * it, because a decision made inside this closure needs a document, a canvas and a click to
     * reach — which is why this one went four modes without a test.
     */
    /*
     * `recordGrew` — `docs/20` defect 17. A re-file caused by the intervention button is the same
     * run's record growing (ENGINE_CONTRACT § 1.4), so it replaces the day's effect without
     * counting an attempt; {@link runCause} is where the intent was latched and `closeDay`'s
     * docstring is where the one thing it gates is argued.
     */
    const week = closedWeekOf(state, outcome, runCause === 'intervention');
    filedReportInput = {
      recording,
      observations,
      goals,
      week,
      // The scenario this shift belongs to, not `undefined`. Passing nothing made the sheet say
      // *your own building — nothing is being banked* on the same day the banner cleared a
      // scenario and the rail counted the shift as banked: three panels, two answers.
      contract: contractById(state.week.contractId),
      /*
       * The sheet's shape follows the mode, and the mode is a field rather than a guess — see
       * `ViewerState.playMode`. A Free Play run's sheet drops the week-shaped lines entirely
       * (streak, banked count, tomorrow's forecast) rather than blanking them, because an empty slot
       * the layout still reserves is `docs/10` R3's "blank where a number should be", one layer up.
       */
      subject:
        state.playMode === 'free-play'
          ? {
              kind: 'single-run' as const,
              // From `state`, never from the menu — {@link shiftSubmittedSelection}, § D318. This
              // read the menu until then, so the sheet's own description of a finished run moved
              // when a select moved, with no re-run: § D227's stale-refusal shape applied to a
              // figure's *basis* rather than to a refusal.
              selection: {
                ...shiftSubmittedSelection(
                  resources,
                  state,
                  buildingConfigOf(resources, state.savedBuildings, state.buildingId),
                ),
                durationS: state.shiftLengthS,
              },
            }
          : { kind: 'week-day' as const },
      /*
       * What the day was set to run — GitHub issue #126, and **the one caller that knows**.
       *
       * All three fields are read off `state`, which is where `shiftRunConfigOf` reads them from
       * eighty lines up: `shiftLengthS` and `windowStartS` are the two halves § D286 split one
       * control into, and `pattern` is the arrival pattern the run resolved against. Not one of them
       * is available from `recording` — `ShiftPlan`'s docstring measures the span that looks like it
       * would do and does not, and the reason it does not is that a dispatcher swap moves it.
       *
       * Read here rather than at `runShift` for `dayStartS`'s reason one field down: this is the
       * value the run on screen was started from, and the mid-run energy-axis refile above spreads
       * this same input rather than rebuilding it, so a sheet redrawn for a preference cannot
       * silently acquire a plan the run never had.
       */
      plan: {
        shiftLengthS: state.shiftLengthS,
        windowStartS: state.windowStartS,
        patternId: state.pattern,
      },
      event,
      /*
       * The period, so the *Tomorrow* card can name tomorrow's event the way the run tomorrow will
       * be built — GitHub issue #135. The period rather than the resolved event, because deciding
       * *which day tomorrow is* is `shift/report.ts`'s arithmetic and a third copy of it here is
       * how the two derivations drifted in the first place.
       *
       * From `state`, never from `recording`: a recording knows what happened and a period is what
       * was scheduled. That is #126's trap and #135's, said twice because both issues record it.
       */
      calendar: state.calendar,
      dispatcherName: profileById(resources, state.savedDispatchers, state.dispatcherId).name,
      /*
       * The run's own hour, not a flat 06:00 — issue #83. `DAY_START_S` survives as the fallback for
       * a template that declares none (`constant-iso`) and for a recording restored from a file.
       * See {@link runStartOfDayS} for why this is captured from the run rather than from `state`.
       */
      dayStartS: runStartOfDayS ?? DAY_START_S,
      /*
       * The run record's third member, reaching the sheet — `docs/19` defect 10. From `state`,
       * which is where `shiftRunConfigOf` read it when the run on screen was built, so the log the
       * sheet prints is the log the legs were simulated under; the clearing ledger that keeps that
       * true across day and building changes is `ViewerState.interventions`' own docstring.
       */
      interventions: state.interventions,
      /*
       * The rules the run was driven by — `docs/20` defect 2. From `state` for `interventions`'
       * reason exactly: `shiftRunConfigOf` applies `profileWithRules(profile, state.ruleRows)` when
       * it builds the run, so these are the rows the legs on screen were simulated under rather
       * than whatever the editor happens to be holding now.
       */
      ruleRows: state.ruleRows,
      /*
       * **The one caller with a player** — GitHub issue #70, and the second half of § D250's
       * one-field-and-one-caller fix.
       *
       * Every other caller of `dayReportOf` is describing a run rather than serving a preference —
       * the honesty sweep, the acceptance suites — and gets the axis shown, which is what
       * `DayReportInput.showEnergyAxis`'s `undefined` means. This is the shell, so it passes the
       * player's own value, and the Day report's kJ pair is the first pixel `Settings.showEnergyAxis`
       * has ever reached.
       */
      showEnergyAxis: menuState.settings.showEnergyAxis,
    };
    const report = dayReportOf(filedReportInput);
    /*
     * The between-day beat — GitHub issue #91.
     *
     * Built here rather than in the panel, and from the same closing of the same day the sheet is
     * built from, so the two cannot be accounts of different days. Three things about the wiring
     * are deliberate:
     *
     * 1. **Only a mode that owns a week gets one.** The condition is `week !== state.week`, which
     *    is `closedWeekOf`'s own answer to *did a day actually close* — § D231's guard read off its
     *    result rather than re-tested against `playMode`, so a ninth play mode cannot acquire a
     *    between-day beat by forgetting to be listed here. A Free Play run's sheet drops every
     *    week-shaped statement, and the beat is one.
     * 2. **The closed day is `history`'s last entry, not `outcome`.** They are the same value
     *    today, and `closeDay` is the thing entitled to say which day the week ended up holding —
     *    a retry *replaces* the last entry rather than appending, so reading the state is what
     *    keeps the beat right on the fourth attempt at Monday.
     * 3. **`tomorrowFactsOf` runs once, here.** It resolves tomorrow's building; see its docstring
     *    for why that is affordable exactly on this path and nowhere near a render.
     */
    const closedDay = week === state.week ? null : (week.history.at(-1) ?? null);
    const tomorrow = closedDay === null ? undefined : briefingFor(week, closedDay, report.verdict);
    /*
     * The tab is **not** forced here. `closeShift` is reached two ways — the playhead reaching the
     * end, and the reader opening the sheet — and the second one has already set the tab. Setting
     * it again inside a handler that `openTab` called would be the same write twice, which is how a
     * navigation ends up fighting itself.
     */
    state = { ...state, week, report, tomorrow };
    /*
     * **The sheet opens itself only over a reader who is not doing something else** — § D233,
     * issue #67.
     *
     * This was `if (state.tab !== 'report') state = { ...state, tab: 'report' };`, unconditional.
     * At ×60 a shift ends about every thirty real seconds, so on the Simulation tab the pane was
     * yanked to the Day report on that cadence: a play-tester typing in the **Seed** field had the
     * textbox unmounted mid-word with the characters going nowhere and nothing to undo, and a click
     * on the **Dispatcher** tab was overridden a moment later by a navigation they had not asked
     * for.
     *
     * The auto-open is the handoff's own behaviour (`closeDay` fires at the end of the day and
     * opens the sheet) and is kept, because the handoff wins disagreements about what the screen
     * does. What it never described is a reader who has already gone somewhere else. So the two
     * cases the issue reports are exactly the two the predicate refuses, and the ordinary case —
     * watching the run, hands off — is unchanged.
     */
    if (reportOpensItself({ tab: state.tab, focusIsInAControl: focusIsInAControl() })) {
      state = { ...state, tab: 'report' };
    }
    // A closed day is the thing a player would most mind losing to a reload, so it is the moment
    // the session is written. `nextDay` goes through here on its way to the next sheet.
    saveSessionNow();
    renderAll();
  }

  /* ---------------------------------------------------------------------- *
   * The stage — § 1.3 M3
   * ---------------------------------------------------------------------- */

  /**
   * The name a reader knows this recording's dispatcher by — `GAMEPLAY_AND_NAVIGATION.md` § 16 rule 11, and
   * `docs/20` defect 9.
   *
   * ## Why it is not `profileById`
   *
   * `dev/state.ts#profileById` **substitutes the first shipped profile** for an id it cannot
   * resolve, which is the right answer for *which dispatcher does the reader's state select* (a
   * selector must select something) and the wrong one for *what did this recording run*: a run
   * loaded from a file naming a profile this build does not ship would be captioned `Nearest car`,
   * which is a false statement about the picture rather than a missing one. So the lookup is by
   * exact id and the fallback is the recording's own string — the same fallback
   * `shift/report.ts#dayReportOf` takes, so the stage and the sheet degrade to one word rather than
   * to two.
   *
   * Read from `state.savedDispatchers` at call time rather than captured, because the reader can
   * save a profile — and rename one — while a recording is on screen.
   */
  function dispatcherNameOf(recording: VizRecording): string {
    const found = allDispatchers(resources, state.savedDispatchers).find(
      (profile) => profile.id === recording.dispatcherProfileId,
    );
    return found?.name ?? recording.dispatcherProfileId;
  }

  function drawStage(): void {
    const recording = state.recording;
    const canvas = ui.stage.canvas;
    const context2d = canvas.getContext('2d');
    if (context2d === null) return;

    const box = canvas.parentElement?.getBoundingClientRect();
    const width = Math.max(360, Math.floor(box?.width ?? 800));
    const height = Math.max(260, Math.floor(box?.height ?? 500));
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
    }
    context2d.setTransform(ratio, 0, 0, ratio, 0, 0);

    /*
     * **No run, no picture** — § D234, issue #36's second half, and the reason the early return
     * moved below the resize rather than being deleted.
     *
     * This function used to return before touching the canvas at all when there was no recording,
     * so the last frame stayed painted at the backing size it was painted at. Pressing *Take the
     * next assignment* left a 360×260 bitmap of Garden Apartments stretched across a 750×405 box —
     * measured by the reporter — with its title, its shafts and its overflowing status strip still
     * legible under the next scenario's name. Every other surface was already in the correct *no
     * run yet* empty state; only the canvas was lying.
     *
     * The buffer is resized first and *then* cleared, in that order: clearing a stale-sized buffer
     * and leaving it stale would fix the picture and keep the blur the moment anything drew again.
     * The alt text goes with it, because a screen reader was being told about the previous run too.
     */
    if (recording === undefined || playback === undefined) {
      context2d.clearRect(0, 0, width, height);
      setHidden(ui.stage.alarm, true);
      /*
       * The card goes with the picture — `docs/21` L-5's *hidden: a slot with nothing to say*. Not
       * an empty card with its headings still on it: a caption over nothing is R3's blank where a
       * number should be, one container up.
       */
      setHidden(ui.liveMetrics.root, true);
      canvas.setAttribute('aria-label', 'No shift has been run yet, so the stage is empty.');
      return;
    }

    const frame = playback.frame();
    // SG-15: the filter narrows what is laid out, so the shown bank gets the whole plot width.
    // Everything keyed by floor — queues, landings, locked-out marks — stays whole-building.
    const bank = shaftsForBank(recording.shafts, bankFilter);
    /*
     * The scenery yields to the building — issue #41. `stageLayoutFor` walks a ladder of gutter and
     * overlay requests and takes the first on which no shaft is hidden, instead of handing over the
     * same two numbers at every width and every building.
     */
    const layout = stageLayoutFor({
      width,
      height,
      floors: recording.floors,
      shafts: bank.shafts,
    });
    /*
     * The live metrics, drawn as a **card under the stage** rather than into this bitmap —
     * `docs/21` § 3.4. Computed here rather than in a mount of its own because `overlayAt` is a
     * scan over the recording's legs and this function already needs the frame at the same instant;
     * two scans per frame for one panel would be the cache `frame/overlay.ts` refuses to have.
     */
    const overlay = overlayAt(recording, frame.simTimeS);
    setHidden(ui.liveMetrics.root, false);
    drawLiveMetrics(overlayViewOf(overlay, frame, state.mode));
    const assignments: readonly LandingAssignment[] = landingAssignmentsAt(recording, frame.simTimeS);
    const lockedOut: readonly LockedOutLanding[] = lockedOutAt(recording, frame.simTimeS);
    const hits = drawScene(context2d as unknown as Canvas2DLike, {
      theme: stageTheme,
      recording,
      frame,
      dispatcherName: dispatcherNameOf(recording),
      layout,
      selection: selectionFor(assignments),
      unservedFloorIds: unservedFloorsOf(recording),
      unansweredCallFloorIds: assignments
        .filter((entry) => entry.answeredByCarId === undefined && entry.waiting > 0)
        .map((entry) => entry.floorId),
      lockedOutLandings: lockedOut,
      queues: queueAt(recording, frame.simTimeS),
      /*
       * The run's own hour, not a flat 06:00 — issue #83. `DAY_START_S` survives as the fallback for
       * a template that declares none (`constant-iso`) and for a recording restored from a file.
       * See {@link runStartOfDayS} for why this is captured from the run rather than from `state`.
       */
      dayStartS: runStartOfDayS ?? DAY_START_S,
      filteredBankId: bank.filtered ? bankFilter : undefined,
      /*
       * The reader's disclosure level, for the live-metrics panel — GitHub issue #100, whose first
       * checklist item is that panel and which measured it identical in the two modes. It reaches
       * `render/overlay.ts` and nothing else on this canvas; see `SceneInput.mode` for why the
       * header band's refusal is deliberately not wordable from here.
       */
      mode: state.mode,
    });
    carBadgeHits = hits.carBadges;

    const alarm = hits.alarm;
    setHidden(ui.stage.alarm, alarm === undefined);
    if (alarm !== undefined) {
      setText(ui.stage.alarmText, `${String(alarm.waiting)} people stacked up at ${alarm.label}`);
      setText(ui.stage.alarmSub, 'a car is on its way — or add one under Building');
    }
    canvas.setAttribute(
      'aria-label',
      describeFrame({ recording, frame, dispatcherName: dispatcherNameOf(recording) }),
    );
  }

  function selectionFor(assignments: readonly LandingAssignment[]): SceneSelection | undefined {
    if (selectedLandingId === '') return undefined;
    const found = assignments.find((entry) => entry.floorId === selectedLandingId);
    if (found === undefined) return { floorId: selectedLandingId };
    return {
      floorId: found.floorId,
      answeredByCarId: found.answeredByCarId,
      answeredInS: found.answeredInS,
      waiting: found.waiting,
    };
  }

  function unservedFloorsOf(recording: VizRecording): readonly string[] {
    const served = new Set(recording.shafts.flatMap((shaft) => shaft.servedFloorIds));
    return recording.floors.filter((floor) => !served.has(floor.id)).map((floor) => floor.id);
  }

  /**
   * Clicking the badge under a shaft takes that car out of service — § 1.5 B7.
   *
   * The hit rectangles come back from `drawScene`, so the click target is wherever the badge was
   * actually drawn rather than wherever this file thinks it should be. A second copy of the layout
   * arithmetic here is how a control ends up one pixel out on one building.
   */
  function wireStageClicks(): void {
    ui.stage.canvas.addEventListener('click', (event) => {
      const hit = badgeAt(event);
      if (hit === undefined) return;
      const held = new Set(state.outOfServiceCarIds);
      if (held.has(hit.carId)) held.delete(hit.carId);
      else held.add(hit.carId);
      state = { ...state, outOfServiceCarIds: [...held].sort((a, b) => a.localeCompare(b)) };
      runShift();
    });
    ui.stage.canvas.addEventListener('mousemove', (event) => {
      ui.stage.canvas.style.cursor = badgeAt(event) === undefined ? 'default' : 'pointer';
    });
  }

  function badgeAt(event: MouseEvent): CarBadgeHit | undefined {
    const rect = ui.stage.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return carBadgeHits.find(
      (hit) =>
        x >= hit.rect.x &&
        x <= hit.rect.x + hit.rect.width &&
        y >= hit.rect.y &&
        y <= hit.rect.y + hit.rect.height,
    );
  }

  function announce(): void {
    const recording = state.recording;
    if (recording === undefined || playback === undefined) return;
    setText(
      ui.stage.description,
      describeFrame({
        recording,
        frame: playback.frame(),
        dispatcherName: dispatcherNameOf(recording),
      }),
    );
  }

  /* ---------------------------------------------------------------------- *
   * The transport — § 1.3 M5
   * ---------------------------------------------------------------------- */

  function wireTransport(): void {
    ui.transport.playPause.addEventListener('click', () => {
      playback?.toggle();
      drawTransportChrome(viewAt());
    });
    ui.transport.stepBack.addEventListener('click', () => {
      step(-1);
    });
    ui.transport.stepForward.addEventListener('click', () => {
      step(1);
    });
    ui.transport.loop.addEventListener('click', () => {
      setLooping(!looping);
      // `Playback` takes `loop` at construction, so the change reaches a run already on screen only
      // by re-adopting it. That was true of the checkbox too; only the event name moved.
      if (state.recording !== undefined) adopt(state.recording);
    });
    ui.transport.timeline.addEventListener('click', (event) => {
      scrubTo(event.clientX);
    });
    ui.transport.timeline.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      step(event.key === 'ArrowRight' ? 60 : -60);
    });
    // § 4.7 — Run moved into the coach ribbon, beside the three selects that decide what it runs.
    /*
     * **And it is the cancel button while a run is in flight** — the audit's B3, second half.
     *
     * The branch is on the runner rather than on a flag of this file's own, so the label, the
     * behaviour and the worker's lifetime cannot disagree about whether something is running: one
     * fact, read where it lives. `onRunning` above writes the label from the same transition.
     */
    ui.coach.run.addEventListener('click', () => {
      if (shiftRunner.isRunning()) {
        shiftRunner.cancel();
        return;
      }
      // The other {@link playerStartedARun} site — the control the empty sheet's copy names, and
      // the audit's own repro (`docs/19` defect 1): reload → Resume → this button → a full day →
      // the day must file. On the start arm only: cancelling is not asking for a day to count,
      // though by then the press that started the run has already latched.
      playerStartedARun();
      runShift();
    });
    ui.transport.verify.addEventListener('click', () => {
      verifyCurrent();
    });
    ui.transport.saveRecording.addEventListener('click', () => {
      saveRecording();
    });
    ui.transport.loadRecording.addEventListener('change', () => {
      void loadRecordingFile();
    });
    ui.transport.exportPng.addEventListener('click', () => {
      exportPng();
    });
    ui.transport.seed.addEventListener('change', () => {
      const entry = seedEntryOf(ui.transport.seed.value);
      if (entry.kind === 'refuse') {
        /*
         * TP-08: the run must not start with a seed the field does not show. The refusal lands on
         * the status line naming what was typed, and the field is restored to the seed that is
         * still running — the same pair every other refusal on this transport uses.
         */
        ui.transport.seed.value = state.seed.toString();
        setText(ui.transport.status, entry.message);
        return;
      }
      const seed = entry.kind === 'draw' ? randomSeed() : entry.seed;
      // A blank draws one **and shows it** — a blank field over a drawn seed is the same
      // field-does-not-show-the-run hazard as the refusal above, one keystroke earlier.
      ui.transport.seed.value = seed.toString();
      context.update({ seed });
      runShift();
    });
    ui.transport.bankFilter.addEventListener('change', () => {
      bankFilter = ui.transport.bankFilter.value;
      drawStage();
    });
    ui.transport.landingSelect.addEventListener('change', () => {
      selectedLandingId = ui.transport.landingSelect.value;
      drawStage();
    });
  }

  /**
   * The one writer of the loop toggle's two representations.
   *
   * `aria-pressed` is not decoration here: `.chip[aria-pressed='true']` is the *only* thing that
   * makes the chip look on, so a state that reached `looping` without reaching the attribute would
   * be a transport that loops with its own control drawn off (KB-15 — the state is announced in
   * words as well as drawn).
   */
  function setLooping(on: boolean): void {
    looping = on;
    ui.transport.loop.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function step(frames: number): void {
    if (playback === undefined) return;
    playback.pause();
    playback.seekBy(frames * FRAME_S * playback.speed);
    renderLive();
    drawTransportChrome(viewAt());
  }

  function scrubTo(clientX: number): void {
    const recording = state.recording;
    if (recording === undefined || playback === undefined) return;
    const rect = ui.transport.timeline.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    playback.seekToProgress(fraction);
    renderLive();
  }

  /** The parts of the transport that change only when the run or the speed does. */
  function drawTransportChrome(view: ViewAt): void {
    const playing = view.playing;
    setText(ui.transport.playPause, playing ? '❚❚' : '▶');
    ui.transport.playPause.setAttribute('aria-label', playing ? 'Pause' : 'Play');

    fill(
      ui.transport.speedChips,
      ...SPEEDS.map((speed) => {
        const label = `×${String(speed)}`;
        // `1 simulated seconds` was already on the tooltip; promoting the same sentence to the
        // accessible name would have put the disagreement in a second place rather than fixing it.
        const unit = speed === 1 ? 'second' : 'seconds';
        const title = `${String(speed)} simulated ${unit} per real second`;
        const node = chip(document, {
          label,
          // Against `baseSpeed`, not `playback.speed` — the player's own multiplier is applied on
          // top, so comparing the product would leave no chip lit at any setting but ×1.
          selected: baseSpeed === speed,
          title,
          onPick: () => {
            baseSpeed = speed;
            applyPlaybackSpeed();
            drawTransportChrome(viewAt());
          },
        });
        /*
         * `×900` spoken is "times nine hundred" — a multiplier of nothing named. The sentence that
         * says what it multiplies was on `title` alone, and a `title` waits a second for a hover,
         * cannot be reached from a keyboard and does not exist on a touch device: a play-tester
         * read this row as five unexplained numbers with no tooltips at all, which is what an
         * undiscovered tooltip looks like from the outside. So **the same sentence** goes on the
         * accessible name, from the same two locals — one wording, two channels, and no second
         * copy to drift.
         *
         * It leads with the visible text, and that is WCAG 2.5.3 rather than style: a name that
         * dropped `×900` would break speech input for a reader who can see the chip and says its
         * label out loud. Set here rather than through `ChipSpec` because `dom.ts`'s chip is
         * shared with rows whose visible words are already their whole claim.
         */
        node.setAttribute('aria-label', `${label} — ${title}`);
        return node;
      }),
    );

    const recording = view.recording;
    if (recording === undefined) {
      fill(ui.transport.ticks);
      return;
    }
    // Same hour as the header and the sheet. Three surfaces reading three different clocks for one
    // instant is the disagreement `clockOf`'s own docstring warns about.
    const segments = timelineOf(recording, { dayStartS: runStartOfDayS ?? DAY_START_S });
    /*
     * The playhead is a child of the timeline and must survive the segments being replaced, so it
     * is re-appended rather than recreated: recreating it would drop the element `#playhead` names
     * and `elementMap.test.ts` would be describing a page that no longer exists.
     */
    fill(
      ui.transport.timeline,
      ...segments.map((segment) =>
        el(document, 'div', {
          className: 'phase-seg',
          title: segment.title,
          style: {
            flex: String(segment.span),
            background: segment.bg,
          },
          children: [el(document, 'span', { text: segment.label, style: { color: segment.fg } })],
        }),
      ),
      ui.transport.playhead,
    );
    fill(
      ui.transport.ticks,
      // The same hour as the segments one call up and the header clock — the tick row was the one
      // transport surface still on the 06:00 default, so a `lunch-two-way` run was ruled
      // `06:00 06:07 …` under a header reading `12:00` (`docs/19` defect 2).
      ...tickLabelsOf(recording, 5, { dayStartS: runStartOfDayS ?? DAY_START_S }).map((label) =>
        el(document, 'span', { text: label.label }),
      ),
    );
    drawPlayhead(view);
  }

  function drawPlayhead(view: ViewAt): void {
    const recording = view.recording;
    if (recording === undefined) return;
    const pct = playheadPctOf(recording, view.simTimeS);
    ui.transport.playhead.style.left = `${pct.toFixed(2)}%`;
    ui.transport.timeline.setAttribute('aria-valuenow', String(Math.round(pct * 10)));
    /*
     * **Seconds, and the frame step is why** — § D234, issue #69.
     *
     * The play-tester pressed the `,` advertised on the step button's own tooltip five times and
     * reported that it does nothing. Driven in the browser tier, it does exactly what it promises:
     * the playhead moved `5.15 % → 5.10 %`, the same distance the button's own click moves it. What
     * is true is that **nothing on the page could show it**. One display frame at the default ×60
     * is one simulated second — 0.06 % of a 1 800 s run, under half a pixel of timeline, and this
     * slider's `aria-valuetext` was `hh:mm`. So the one reader the tooltip makes a promise to, and
     * the only reader with no pixels to check it against, was told the shortcut exists and given a
     * readout that could not move under it.
     *
     * `hh:mm:ss` here rather than a wider `aria-valuenow` scale, because `valuemax` lives in
     * `index.html` and because a time is what this slider is *of*: `aria-valuetext` exists exactly
     * so a slider announces its own units instead of a percentage. The header clock stays `hh:mm` —
     * it is a caption on a day, not a readout on a control.
     */
    ui.transport.timeline.setAttribute(
      'aria-valuetext',
      clockWithSecondsAt(view.simTimeS, runStartOfDayS),
    );
  }

  function fillLandingSelect(recording: VizRecording): void {
    fillSelect(
      ui.transport.landingSelect,
      [
        { value: '', label: 'none' },
        ...recording.floors.map((floor) => ({
          value: floor.id,
          label: floor.label ?? floor.id,
        })),
      ],
      '',
    );
  }

  function fillBankSelect(recording: VizRecording): void {
    const banks = [...new Set(recording.shafts.map((shaft) => shaft.bankId))].sort((a, b) =>
      a.localeCompare(b),
    );
    fillSelect(
      ui.transport.bankFilter,
      [{ value: '', label: 'all' }, ...banks.map((id) => ({ value: id, label: id }))],
      bankFilter,
    );
  }

  /* ---------------------------------------------------------------------- *
   * Recording in and out
   * ---------------------------------------------------------------------- */

  /**
   * Re-run the current configuration and compare — `PB-16`.
   *
   * **On the worker too, and that is not incidental.** This is a second full simulation of exactly
   * the run that already froze the tab once, behind a button one click from the transport; leaving
   * it synchronous would have left B3 half-fixed on the surface where it is most surprising, since
   * nothing about *Verify replay* says *this will cost you a minute*.
   *
   * It goes through the same runner, so the two share one worker slot: pressing Verify while a
   * shift is running terminates the shift, which is the same *latest ask wins* rule every other
   * control on this page follows.
   */
  function verifyCurrent(): void {
    const recording = state.recording;
    if (recording === undefined) return;
    try {
      const plan = shiftRunConfigOf(resources, state);
      shiftRunner.start({
        label: 'replay check',
        config: plan.config,
        outOfServiceCarIds: plan.outOfServiceCarIds,
        // The default `recordRun` takes, so the run being compared is the run this shell makes.
        // A check that verified an uninstrumented recording against an instrumented one would be
        // comparing two different requests, which `record/decisionLog.ts` says produce equal
        // records — but *says* is not the claim this button exists to make.
        recordDecisions: true,
        cost: costOf(plan),
        onDone: (again) => {
          const verdict = verifyReplay(recording, again);
          // The stored recording stays on screen either way — `PB-16`'s second half. A mismatch is
          // evidence about the build, not a reason to quietly swap in whatever came out.
          setText(ui.transport.status, verdict.message);
        },
      });
    } catch (error) {
      failRun(error);
    }
  }

  function saveRecording(): void {
    const recording = state.recording;
    if (recording === undefined) return;
    /*
     * TP-10 (§ D198): this wrote `{recording, frames}` — a wrapper readRecordingDocument refuses
     * by its first check — so Load could not read Save's own file. The document is now written by
     * the reader's own module, and it is the recording itself; the frames re-derive from it.
     */
    const blob = new Blob([writeRecordingDocument(recording)], {
      type: 'application/json',
    });
    downloadBlob(blob, `${recording.buildingId}-${recording.seed}.json`);
  }

  async function loadRecordingFile(): Promise<void> {
    const file = ui.transport.loadRecording.files?.[0];
    if (file === undefined) return;
    try {
      const loaded = readRecordingDocument(await file.text());
      if (!loaded.ok) {
        setText(ui.transport.error, loaded.failure.message);
        ui.transport.error.focus();
        return;
      }
      // The beat goes with the sheet: a recording read off disk is not a day of anybody's week,
      // and an overnight reveal left standing beside it would describe a building the loaded run
      // has nothing to do with.
      state = { ...state, recording: loaded.recording, report: undefined, tomorrow: undefined };
      /*
       * The run's own hour goes with them, and this line makes a sentence true that was not —
       * GitHub issue #136's other half. {@link runStartOfDayS}'s docstring says it is `undefined`
       * *"for a recording restored from a file, where the clock falls back to the shipped
       * `DAY_START_S`"*, and nothing cleared it: `boot()` simulates a shift before the player can
       * press anything, so a loaded recording was drawn on the **previous** run's clock in all four
       * places that read this. A refusal pinned by a sentence rather than by a line is § D227, and
       * this was one.
       */
      runStartOfDayS = undefined;
      adopt(loaded.recording);
      renderAll();
    } catch (error) {
      failRun(error);
    }
  }

  /**
   * Write the **Day report card**, not the stage — GitHub issue #118 § 1.
   *
   * This was `ui.stage.canvas.toBlob(...)`: the live canvas at the playhead, which after a finished
   * day is a picture of an empty building with a clipped metrics panel on it. `render/reportCard.ts`
   * carries the argument for what replaces it and why a stage screenshot is a false claim rather
   * than a plain one.
   *
   * **It files the day first, on the same guard the Day report tab files it on** — § D223's, through
   * `closeShift` itself rather than a second copy of the decision. A reader who has watched a run to
   * the end and pressed this has done exactly what pressing *Day report* does, and refusing them a
   * card over a sheet that has not been *looked at* would be a refusal about navigation dressed as
   * one about the run. `closeShift` returns early for a run it has already filed, so pressing this
   * twice banks nothing twice.
   *
   * **And it refuses rather than falling back.** With no sheet — the playhead short of `endedAt`,
   * so § D232's guard holds and nothing may be filed — there is nothing to draw, and the old
   * behaviour (export the stage) is precisely the artefact the issue is about, so it is not the
   * graceful degradation it looks like. The refusal names what to do instead, on the same status
   * line every other transport refusal lands on.
   */
  function exportPng(): void {
    if (state.report === undefined && playheadHasRunOut()) closeShift();
    const report = state.report;
    if (report === undefined) {
      /*
       * Three reasons there is no sheet, and they are different instructions — GitHub issue #136,
       * and `docs/19` defect 1 for the third. `NO_SHEET_YET` says *run a shift to the end*, which
       * is false advice to a reader who has just watched a loaded recording to its end — and
       * equally false to one who watched boot's own run to its end without ever choosing to play
       * (§ D232's ground, which used to fall through to that same sentence). The chain asks in
       * `closeShift`'s own order, so the status line names the ground the gate actually refused on.
       */
      setText(
        ui.transport.status,
        bankingRefusalFor(state.recording, simulatedRecording) ??
          (state.recording !== undefined && playheadHasRunOut() && !playerHasChosen
            ? UNCHOSEN_RUN_CANNOT_BANK
            : NO_SHEET_YET),
      );
      return;
    }
    const surface = document.createElement('canvas');
    surface.width = CARD_WIDTH;
    surface.height = CARD_HEIGHT;
    const ctx = surface.getContext('2d');
    if (ctx === null) {
      setText(ui.transport.status, 'this browser gave no 2d context, so there is no card to write');
      return;
    }
    // The same cast `drawScene`'s call site makes, for the same reason: `Canvas2DLike` is the
    // subset the renderers use, and `fillStyle` there is a `string` rather than the DOM's
    // `string | CanvasGradient | CanvasPattern`.
    drawReportCard(
      ctx as unknown as Canvas2DLike,
      reportCardOf({
        report,
        buildingName: buildingNameOf(resources, state.savedBuildings, state.buildingId),
        seed: state.seed.toString(),
        // The same artefact `copy run` puts on the clipboard, so the picture and the link a reader
        // is handed name one run in one form. Its refusal arm is drawn, not dropped.
        recipe: shareLinkOf(state, resources, deepLinkDefaults, shareBase()),
      }),
      stageTheme,
    );
    surface.toBlob((blob) => {
      if (blob === null) return;
      downloadBlob(blob, `${state.buildingId}-${state.seed.toString()}-report.png`);
    });
  }

  function downloadBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = el(document, 'a', { attrs: { href: url, download: name } });
    link.click();
    URL.revokeObjectURL(url);
  }

  /* ---------------------------------------------------------------------- *
   * Keyboard — KB-06, KB-07
   * ---------------------------------------------------------------------- */

  function wireKeyboard(): void {
    window.addEventListener('keydown', (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLSelectElement) return;
      /*
       * A key a focused control already answered is not this handler's to answer again. The tab
       * strip, the rail segments and the timeline all `preventDefault` on the arrows and on
       * Home/End when they handle one, and they run first — target before window — so without
       * this guard an arrow pressed on the timeline would both frame-step (`KX-09`, the
       * timeline's own handler) and seek (`KX-10`, below), two moves for one key.
       */
      if (event.defaultPrevented) return;
      const seek = seekActionForKey(event.key, event.shiftKey);
      if (seek !== undefined && playback !== undefined) {
        event.preventDefault();
        playback.pause();
        if (seek.kind === 'by') playback.seekBy(seek.deltaS);
        else playback.seekToProgress(seek.kind === 'toEnd' ? 1 : 0);
        renderLive();
        drawTransportChrome(viewAt());
        return;
      }
      switch (event.key) {
        case ' ':
          /*
           * **Space belongs to a focused control first** — § D234, found while driving issue #69.
           *
           * This arm was an unconditional `event.preventDefault()`, and that is not a spare
           * keystroke: `preventDefault` on a `keydown` of Space over a focused `<button>`
           * **suppresses the button's own activation**. Measured in the browser tier — Space with
           * `#step-back` focused toggled play/pause and did **not** step back — so the two controls
           * the play-tester was alternating between were fighting each other for one key, and the
           * one that lost is the one the platform promises.
           *
           * The timeline is deliberately *not* in the exempt set: `role="slider"` does not activate
           * on Space in any platform convention, so a reader who has tabbed to the transport bar
           * still gets play/pause from it. `KX-04`'s three `instanceof` guards above already
           * excused inputs, textareas and selects; this is the fourth kind of control that owns the
           * key, and the first one that owns it by *activation* rather than by typing.
           */
          if (spaceBelongsToFocus(activationRoleOf(document.activeElement))) break;
          event.preventDefault();
          playback?.toggle();
          drawTransportChrome(viewAt());
          break;
        case ',':
          step(-1);
          break;
        case '.':
          step(1);
          break;
        case '[':
        case ']': {
          const index = SPEEDS.indexOf(baseSpeed as (typeof SPEEDS)[number]);
          const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, index + (event.key === ']' ? 1 : -1)))];
          if (next !== undefined) {
            baseSpeed = next;
            applyPlaybackSpeed();
          }
          drawTransportChrome(viewAt());
          break;
        }
        case 'Enter':
          /*
           * **And only while this surface has the page** — GitHub issue **#287**'s class, found
           * while tracing what else was armed behind § D338's cover, and not what that issue
           * reported.
           *
           * This listener is on `window`. The Everyday shell covers the Engineer surface with
           * `inert` and `visibility:hidden`, and **neither stops a window-level key handler** —
           * `inert` takes an element out of hit-testing and the tab order, not out of the bubble
           * path of a key pressed on `body`. So a shortcut belonging to a surface the Everyday
           * player cannot see filed, scored and banked their day, from § 7's stage, on two
           * keystrokes. Measured: `Ctrl`+`Enter` on a stage the player had not closed left the row
           * reading *the day is filed*.
           *
           * The other arms of this handler are deliberately **not** guarded here, and the omission
           * is a decision rather than an oversight: Space, the seek keys and the speed chips move
           * the covered transport, which after {@link tick}'s fix files nothing and shows nobody
           * anything. That is its own defect — an Engineer keyboard live under an Everyday screen —
           * and it is a different one, with a different fix, and it does not score a day.
           */
          if ((event.metaKey || event.ctrlKey) && engineerHasThePage()) closeShift();
          break;
        case 'Escape':
          // SH-12 / KX-11: Escape dismisses the drawer, and only the drawer — in column mode the
          // key is inert and focus stays wherever it was. Focus returns to the toggle because the
          // toggle is what re-opens what Escape just closed.
          if (escapeClosesDrawer(window.innerWidth, state.drawerOpen)) {
            context.update({ drawerOpen: false });
            ui.rail.drawerToggle.focus();
          }
          break;
        default:
          break;
      }
    });
    /*
     * The report sheet's buttons are wired by `mountReport` and nowhere else. This function held a
     * second listener on `#report-next-day` and `#report-back` until 2026-07-30, when driving found
     * one press of "Open the doors on tomorrow" advancing TWO days (DR-13, § D198): both handlers
     * applied `nextDay`, so Tuesday and Thursday were unreachable by the button.
     * `reportPanel.test.ts` now pins one binding site per button.
     */
  }

  /* ---------------------------------------------------------------------- *
   * The confirm dialog — ED-22 / ED-23, KB-12
   * ---------------------------------------------------------------------- */

  function confirmDiscard(message: string): Promise<boolean> {
    setText(ui.confirmMessage, message);
    const previous = document.activeElement;
    ui.confirm.showModal();
    return new Promise((resolve) => {
      ui.confirm.addEventListener(
        'close',
        () => {
          if (previous instanceof HTMLElement) previous.focus();
          resolve(ui.confirm.returnValue === 'ok');
        },
        { once: true },
      );
    });
  }

  void editor;
}

const MODE_KEY = 'elevator-sim.viewMode';

/* ========================================================================== *
 * The reveal's slot — issue #130, § D330 condition 1
 * ========================================================================== */

/**
 * Where the revealed contextual tabs live.
 *
 * A third key on this origin, and the third is argued rather than assumed. `persist/types.ts`'s
 * `SESSION_KEY` docstring makes the case *against* extra keys — *"three keys is three states that
 * can disagree — a week from this build beside settings from the last one"* — and that case is
 * about a **week**, whose parts are views of one another. Nothing in this set is a view of
 * anything: no field of the week, the settings or the Free Play selection is derivable from which
 * editors a player has opened, so there is no pair here that can disagree.
 *
 * What the envelope *would* have cost is the reason this is not in it. A session is refused whole
 * when any part of it will not read, so a tab name this build no longer knows would take the
 * player's week with it. `revealedTabsFrom` resolves the same bytes to *nothing revealed*, which
 * is the state a first visit is in.
 *
 * Beside `elevator-sim.viewMode` and dotted like it, which is the sibling this genuinely has: both
 * are disclosure, both are per-browser, and neither is progress.
 */
const REVEALED_TABS_KEY = 'elevator-sim.revealedTabs';

/**
 * Read the slot, and treat every failure as an empty one.
 *
 * `localStorage` **throws** rather than returning `null` where a browser is configured to block
 * site data, and this is read during boot — so an unguarded read is a blank page for a reader
 * whose privacy settings are none of this product's business. `persist/session.ts` makes the same
 * argument at length for the session slot (*"the natural caller of `loadSession` is boot, where a
 * throw is a blank page"*); this is that argument, one key over.
 */
function loadRevealedTabs(): ReadonlySet<TabName> {
  try {
    return revealedTabsFrom(window.localStorage.getItem(REVEALED_TABS_KEY));
  } catch {
    return new Set<TabName>();
  }
}

/**
 * Write the slot, and treat every failure as nothing having happened.
 *
 * Total for `persist/session.ts`'s stated reason: the caller is a player pressing a tab, and *"a
 * save that threw would therefore turn a full storage quota into a dead slider"* — here, a dead
 * tab. The reveal is still live in memory either way; what is lost is only its survival of a
 * reload, which is exactly the state the product was in before § D330.
 */
function saveRevealedTabs(revealed: ReadonlySet<TabName>): void {
  try {
    window.localStorage.setItem(REVEALED_TABS_KEY, revealedTabsTo(revealed));
  } catch {
    /* Quota, a blocked origin, or a private window. Nothing here is worth a sentence on screen. */
  }
}

/* ========================================================================== *
 * Space, and who owns it — § D234, issue #69
 * ========================================================================== */

/** What the focused element is, as far as *does Space activate this?* is concerned. */
export interface ActivationRole {
  /** Upper-case, as `Element.tagName` gives it. `''` when nothing is focused. */
  readonly tagName: string;
  /** An explicit `role`, lower-cased, or `''`. An author's `role` outranks the tag. */
  readonly role: string;
}

/**
 * The ARIA roles whose platform contract is *Space activates me*.
 *
 * `slider` is deliberately absent and is the one worth naming: the transport timeline carries
 * `role="slider"`, sliders are driven by arrows in every platform convention, and a reader who has
 * tabbed onto the bar should still get play/pause from the space bar. `link` is absent too —
 * a link is <kbd>Enter</kbd>.
 */
const SPACE_ACTIVATES_ROLES: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'switch',
  'tab',
]);

/**
 * Whether <kbd>Space</kbd> belongs to whatever is focused rather than to the transport — issue #69.
 *
 * ## The defect, found by driving rather than by reading
 *
 * `wireKeyboard`'s Space arm called `event.preventDefault()` unconditionally. On a focused
 * `<button>` that **cancels the button's own activation** — the browser synthesises the click from
 * the default action, and the default action had been prevented. Measured in the browser tier:
 * Space with `#step-back` focused toggled play/pause and did not step a frame. So a reader
 * alternating between the two transport controls the issue is about had them fighting for one key,
 * and the loser was the one the platform guarantees.
 *
 * ## Why the answer is a role and not an `instanceof`
 *
 * The three guards above this in the handler are `instanceof HTMLInputElement` and friends, which
 * is right for *typing*: a textarea owns every printable key by being a textarea. Activation is not
 * a fact about a constructor — a `<div role="button">` owns Space and an `<a>` does not, and both
 * are `HTMLElement`. Keeping the question as a `(tagName, role)` pair also keeps this decision
 * testable without a document, which is the split the rest of `dev/` keeps.
 *
 * An `<input>` reaches this predicate as `INPUT` and would answer `true` for a checkbox — but it
 * never gets here, because `KX-04`'s guard has already returned. Answering correctly anyway costs
 * nothing and means the predicate is true on its own terms rather than only in context.
 */
export function spaceBelongsToFocus(focus: ActivationRole): boolean {
  if (focus.role !== '') return SPACE_ACTIVATES_ROLES.has(focus.role);
  return focus.tagName === 'BUTTON' || focus.tagName === 'SUMMARY' || focus.tagName === 'INPUT';
}

/* ========================================================================== *
 * The transport clock — § D234, issue #69
 * ========================================================================== */

/**
 * `hh:mm:ss` at a playhead position — the timeline slider's `aria-valuetext`, and the only place
 * in the product that prints a second.
 *
 * `live/timeline.ts`'s `clockAt` is `hh:mm` and stays `hh:mm`: it is the header's *caption on a
 * day*, and putting seconds on it would make a chrome line tick sixty times a minute for no
 * reader's benefit. This is a *readout on a control*, and the control advertises a shortcut that
 * moves the playhead by one simulated second at the shipped speed. A readout that could not
 * resolve its own control's smallest move is what made the shortcut look dead.
 *
 * Built from `timeOfDayAt` rather than from a second copy of the day-start offset, so the two
 * clocks cannot come to disagree about what 06:00 means. `dayStartS` follows `timeOfDayAt`'s
 * contract — the run's own hour, `undefined` falling back to the shared default — because a
 * readout that announced `06:12:07` over a header reading `08:42` is `docs/19` defect 2 on the
 * one surface a sighted reader cannot cross-check.
 */
export function clockWithSecondsAt(simTimeS: number, dayStartS?: number | undefined): string {
  const wrapped = ((timeOfDayAt(simTimeS, dayStartS) % 86_400) + 86_400) % 86_400;
  const hours = Math.floor(wrapped / 3600);
  const minutes = Math.floor((wrapped % 3600) / 60);
  const seconds = Math.floor(wrapped % 60);
  return (
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:` +
    String(seconds).padStart(2, '0')
  );
}

/* ========================================================================== *
 * When the report is allowed to open itself — § D233
 * ========================================================================== */

/** What decides whether a finished run may move the pane. Both facts are about the *reader*. */
export interface ReportOpenInput {
  /** The surface the reader is on when the run ends. */
  readonly tab: TabName;
  /** Whether the caret is inside an input, a textarea or a select. */
  readonly focusIsInAControl: boolean;
}

/**
 * Whether a run reaching its end may switch the pane to the Day report — `issue #67`.
 *
 * Two refusals, and each is one of the two the issue reports:
 *
 * - **The reader is not on the run.** They clicked *Dispatcher* while the shift was finishing, and
 *   a moment later the selected tab was *Day report* — a click overridden by a timer they do not
 *   control. A reader who has navigated has answered *where should I be* more recently than the
 *   transport has.
 * - **The reader is typing.** The Seed textbox was unmounted mid-word and the characters went
 *   nowhere, with no error and nothing to undo. Silently discarding input is the worst class of
 *   interruption, and it is the one a fixed cadence guarantees: at ×60 a shift ends roughly every
 *   thirty real seconds, and with the loop chip on it never stops.
 *
 * Everything else is unchanged, deliberately. The design's own behaviour is that the day ending
 * opens the sheet, and `docs/12`'s standing rule is that the handoff wins disagreements about what
 * the screen does — so a reader watching the run, hands off the keyboard, still gets taken to the
 * report the moment it is worth reading. What the handoff never described is a reader who is
 * already somewhere else, and that is the whole of what this refuses.
 *
 * Being on the report tab already is *not* a refusal case: it is a no-op the caller skips anyway,
 * and answering `true` there keeps the predicate a statement about the destination rather than
 * about whether a write is redundant.
 */
export function reportOpensItself(input: ReportOpenInput): boolean {
  if (input.focusIsInAControl) return false;
  return input.tab === 'run' || input.tab === 'report';
}

/* ========================================================================== *
 * The bank filter — SG-15
 * ========================================================================== */

/** What the stage should draw for a bank filter: the shafts, and whether any were held back. */
export interface BankFilterResult<T> {
  readonly shafts: readonly T[];
  /** True only when the filter actually narrowed the set — what turns the caption on. */
  readonly filtered: boolean;
}

/**
 * The shafts the stage draws under a bank filter — `SG-15`, and the function whose absence made
 * `#bank-filter` inert: the `change` handler wrote a binding and `drawStage` handed
 * `recording.shafts` whole to `buildLayout` regardless (`GAPS.md`, § D180's false premise).
 *
 * `''` is *all*, the select's own first option. A filter naming a bank this recording does not
 * have — the run changed under a remembered selection — matches nothing, and drawing an empty
 * stage would claim the building has no shafts; the filter falls back to the whole set instead,
 * unfiltered, so the picture never lies about the geometry. A single-bank building filtered to
 * its only bank narrows nothing and reports `filtered: false`, so no caption counts N of N.
 */
export function shaftsForBank<T extends { readonly bankId: string }>(
  shafts: readonly T[],
  bankId: string,
): BankFilterResult<T> {
  if (bankId === '') return { shafts, filtered: false };
  const matching = shafts.filter((shaft) => shaft.bankId === bankId);
  if (matching.length === 0 || matching.length === shafts.length) {
    return { shafts, filtered: false };
  }
  return { shafts: matching, filtered: true };
}

/* ========================================================================== *
 * Copy run — TP-13
 * ========================================================================== */

/**
 * The binary `copy CLI` writes a line for — `packages/cli/package.json`'s `bin` key.
 *
 * Spelled here rather than imported because `viz` does not depend on `cli` and must not start:
 * `main.test.ts` reads that manifest and asserts the two agree, which is the check an import would
 * have given for free and a hard-coded string would otherwise have given never.
 */
const CLI_COMMAND = 'elevator-sim';

/** A CLI line that reproduces the run, or the reasons no such line exists. */
export type Provenance =
  | { readonly ok: true; readonly line: string }
  | { readonly ok: false; readonly reasons: readonly string[] };

/**
 * The `copy run` payload — `TP-13`, the retired `RV-T7`'s outstanding half.
 *
 * The shipped line named `--building --dispatcher --seed --duration` and **no traffic and no
 * day**, so on any non-default pattern or any later day it was a provenance claim the CLI would
 * honour and turn into a different run (`GAPS.md`). Two changes close that:
 *
 * - **A shipped pattern is named with `--traffic`, plus `--template` when the pattern's template
 *   is not the CLI's `rise-and-fall` default.** That pair was verified by driving, not argued:
 *   the viewer's pattern pipeline (`specFromTrafficProfile` → `demandFromSpec` → a patched
 *   profile) and the CLI's `withTrafficProfile` route produced **bit-identical legs at 10 of 10
 *   cells** — two buildings × (the building's own demand + four shipped profiles), seed 123,
 *   900 s, hashed over `legs`/`boardedLegs`/`waiting`, with the CLI side holding the shipped
 *   dispatcher profile object as `planRun` does — and the two-way cells **diverge without
 *   `--template`**, which is why it is emitted rather than assumed. The equivalence holds only
 *   from the base the refusals below protect; `main.test.ts` pins one cell of it.
 * - **A run no flag set can express gets no line at all.** A saved pattern has no CLI loader; a
 *   day past the first grows the building and schedules an event; a held car, a moved group
 *   lever, a saved building or dispatcher all change the run and have no flag. Refusing with the
 *   reasons is the honest form — the whole point of the control is that the reader could not
 *   otherwise reproduce the run, so a line that reproduces a *different* one is worse than none.
 *
 * ## The third change, and it is Free Play's whole selection — GitHub issue #118
 *
 * The line still omitted **`freePlay`** and **`windowStartS`**, which is to say it omitted the two
 * axes the menu asks a Free Play player for and the pattern select cannot express. Both reach the
 * kernel — `shiftRunConfigOf` applies the template and the rate *over* the pattern's, and the
 * window selects part of the authored schedule — and both are `between-games` controls the
 * leaderboard hashes into a board's identity. A player who set the rate to 6 % and copied the line
 * got a command that runs the building's own rate instead, silently: exactly the defect the two
 * bullets above closed for `--traffic`, one field over, and the one the issue reports.
 *
 * `--part` is a **clock range**, because that is the only form the CLI's flag takes, so it is
 * derived from the template record's own `startOfDayMin`. A template that declares no hour
 * (`constant-iso`) has no clock for a part to name, so a windowed run on one is **refused** rather
 * than given a line that would run the whole period.
 *
 * Pure, so the claim *this line is this run* is testable without a clipboard.
 */
export function provenanceLineOf(state: ViewerState, resources: BrowserResources): Provenance {
  /*
   * The refusals are `scope/runIdentity.ts`'s, not this function's — `docs/16` S5.
   *
   * They were written out here, and the leaderboard's submit path was about to write them out
   * again. *"Can this run be reproduced elsewhere from its own selection?"* is one question, and two
   * answers to it is the single disagreement a replay-verified board cannot survive: a client
   * stricter than the server refuses a run the server would have taken, and a client looser than it
   * posts a run the server rejects **as a forgery** — the one place this product accuses somebody of
   * cheating, spending that accusation on a client bug.
   *
   * What stays here is the half that is genuinely about the CLI: which flags spell this run.
   */
  const reasons = [...runIdentityIssues(state, resources, 'ranked').map((issue) => issue.message)];
  const flags: string[] = [
    /*
     * The command, not just its flags — issue #118 § 2. The line was `--building … --dispatcher …`
     * with nothing to run, so the reader had to know the binary's name and the subcommand before
     * the clipboard was worth anything. `elevator-sim run` is exactly what `cli/commands/run.ts`
     * echoes back on every run it prints, so the two artefacts read the same.
     */
    `${CLI_COMMAND} run`,
    `--building ${state.buildingId}`,
    `--dispatcher ${state.dispatcherId}`,
  ];

  let template: string | undefined;
  if (state.pattern !== 'building') {
    const shipped = resources.trafficProfiles.profiles.find((profile) => profile.id === state.pattern);
    if (shipped !== undefined) {
      flags.push(`--traffic ${shipped.id}`);
      const demand = demandFromSpec(specFromTrafficProfile(resources.trafficProfiles, shipped.id));
      if (demand.demandTemplate !== 'rise-and-fall') template = demand.demandTemplate;
    }
  }
  /*
   * Free Play's template wins over the pattern's, because `shiftRunConfigOf` applies it last and
   * for its stated reason: it is the reader's most recent and most explicit statement about what to
   * run. `rise-and-fall` is still omitted — it is the CLI's own default, and a flag that restates a
   * default is noise in a line somebody has to read.
   */
  if (state.freePlay !== undefined && state.freePlay.demandTemplateId !== 'rise-and-fall') {
    template = state.freePlay.demandTemplateId;
  }

  const part = partFlagFor(state, resources, template);
  if (part.kind === 'refused') reasons.push(part.reason);

  /*
   * **What only a submission can say** — GitHub issue #179, and `partFlagFor`'s shape one field
   * over.
   *
   * `scope/runIdentity.ts` used to refuse a written rule list and a non-empty intervention log for
   * both of this question's consumers, because neither artefact could express them. `SubmittedRun`
   * now carries both and the server replays them, so the shared predicate correctly stops refusing —
   * and **the CLI still has no flag for either**, and no plausible one: a rule row is four scalars
   * and a log is a time series, where `elevator-sim run` takes a building, a dispatcher, a seed and
   * a span.
   *
   * So the refusal moves here rather than disappearing. It is the same argument the function already
   * makes about a part with no clock: a line that reproduces a *different* run is worse than no
   * line, and the whole point of the control is that the reader could not otherwise reproduce it.
   */
  if (state.ruleRows.length > 0) {
    reasons.push(
      `${String(state.ruleRows.length)} Everyday rule(s) drive this run's dispatcher, and ` +
        `${CLI_COMMAND} has no flag for a rule list — the line would run the profile's own weights`,
    );
  }
  if (state.interventions.length > 0) {
    reasons.push(
      `${String(state.interventions.length)} mid-run intervention(s) are on this day's record, and ` +
        `${CLI_COMMAND} has no flag for an intervention log — the line would run the day untouched`,
    );
  }

  if (reasons.length > 0) return { ok: false, reasons };
  // The CLI's own echo order — `planRun`'s `commandLine` puts `--template`, then `--rate`, then
  // `--part`, after `--duration`.
  flags.push(`--seed ${state.seed.toString()}`);
  /*
   * `--duration` and `--part` are **mutually exclusive**, and the CLI is what says so rather than a
   * preference here: a template with authored phases refuses `templateOverrides.durationS` outright
   * (§ D285 — *"there is no geometry to refit and a new duration would rescale a whole day's
   * schedule"*), so a line carrying both is a line the CLI answers with an error. The part's clock
   * range already carries the length, so nothing is lost by leaving it out. Verified by running it:
   * `--template office-day --part 08:30-09:00 --duration 1800` fails, and the same line without
   * `--duration` runs.
   */
  if (part.kind !== 'named') flags.push(`--duration ${String(state.shiftLengthS)}`);
  if (template !== undefined) flags.push(`--template ${template}`);
  const rate = state.freePlay?.arrivalRatePctPop5min;
  if (rate !== undefined && rate !== null) flags.push(`--rate ${String(rate)}`);
  if (part.kind === 'named') flags.push(`--part ${part.range}`);
  return { ok: true, line: flags.join(' ') };
}

/** `--part 08:30-09:00`, nothing to say, or the reason no clock range names this window. */
type PartFlag =
  | { readonly kind: 'none' }
  | { readonly kind: 'named'; readonly range: string }
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * The clock range `--part` takes, derived from the template record's own hour.
 *
 * The CLI's `dayWindowOf` computes `windowStartS = (fromMin − startOfDayMin) × 60`; this is that
 * arithmetic run backwards, which is what makes the flag's value a fact about the same record
 * rather than a second opinion about where the day starts. A template with no `startOfDayMin` has
 * no clock at all (`constant-iso`, § D244), so a run windowed onto one gets a refusal rather than a
 * line the CLI would honour by running the whole period — the module's own rule, applied to the
 * axis that had no flag.
 */
function partFlagFor(
  state: ViewerState,
  resources: BrowserResources,
  templateFlag: string | undefined,
): PartFlag {
  if (state.windowStartS === null) return { kind: 'none' };
  const templateId =
    templateFlag ??
    shiftDemandTemplateId(
      resources,
      state,
      buildingConfigOf(resources, state.savedBuildings, state.buildingId),
    );
  const record = resources.trafficProfiles.demandTemplates.find((entry) => entry.id === templateId);
  const startOfDayMin = record?.startOfDayMin;
  if (startOfDayMin === undefined) {
    return {
      kind: 'refused',
      reason:
        `this run covers part of “${templateId}”, and that template declares no hour — ` +
        '--part takes a clock range, so no CLI line names this window',
    };
  }
  const fromMin = startOfDayMin + state.windowStartS / 60;
  const toMin = fromMin + state.shiftLengthS / 60;
  const clock = (minutes: number): string =>
    `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
  return { kind: 'named', range: `${clock(fromMin)}-${clock(toMin)}` };
}

/* ========================================================================== *
 * Keyboard seeking — KX-10
 * ========================================================================== */

/** What a transport key asks of the playhead. `by` is simulated seconds, sign and all. */
export type SeekAction =
  | { readonly kind: 'by'; readonly deltaS: number }
  | { readonly kind: 'toStart' }
  | { readonly kind: 'toEnd' };

/**
 * The seek a key asks for, if any — `KX-10`, the retired `KB-04`/`KB-05`'s successor.
 *
 * Fixed **simulated** seconds, not display frames: <kbd>←</kbd>/<kbd>→</kbd> move 5 s,
 * <kbd>Shift</kbd> makes it 60 s, and <kbd>Home</kbd>/<kbd>End</kbd> are the run's own ends. The
 * timeline's focused arrows remain `KX-09`'s frame step — a *speed-relative* move — and the two
 * never fire together because a key the timeline answered is `defaultPrevented` before the global
 * handler sees it. Pure, so the mapping is testable without a window.
 */
export function seekActionForKey(key: string, shiftKey: boolean): SeekAction | undefined {
  switch (key) {
    case 'ArrowLeft':
      return { kind: 'by', deltaS: shiftKey ? -60 : -5 };
    case 'ArrowRight':
      return { kind: 'by', deltaS: shiftKey ? 60 : 5 };
    case 'Home':
      return { kind: 'toStart' };
    case 'End':
      return { kind: 'toEnd' };
    default:
      return undefined;
  }
}

/**
 * Deep links, so a finding can be sent to somebody.
 *
 * `?building&dispatcher&seed&duration&tab&mode` — the same keys the old viewer accepted, plus
 * nothing: a link that named a surface this page had renamed would be a broken promise, and
 * `isTabName` is what refuses one rather than silently opening the first tab.
 *
 * The window read lives here and the decisions live in {@link deepLinkStateOf}, which is pure in
 * its `URLSearchParams` — the same split the rest of `dev/` uses, and what lets the reader be
 * tested against the serializer it must round-trip with.
 */
function applyDeepLink(state: ViewerState, resources: BrowserResources): ViewerState {
  return deepLinkStateOf(state, resources, new URLSearchParams(window.location.search));
}

/**
 * The reader's decisions: which of the eleven params are honoured, and what refuses each.
 *
 * ## It was seven, and the four that were missing are the run — GitHub issue #118
 *
 * `?building&dispatcher&seed&duration` names four of the axes `shiftRunConfigOf` reads and left
 * `pattern`, `windowStartS` and both halves of `freePlay` on the floor. Every one of those is a
 * `between-games` control in `scope/surface.ts`, which is to say it is *part of the run's identity*
 * — the leaderboard hashes them into the board a score belongs to — so a link that dropped them was
 * a different run wearing the same address, which is the exact failure the *"the seed is always
 * written"* clause below exists to prevent, three axes over.
 *
 * The param names are the CLI's — `traffic`, `template`, `rate` — so the two artefacts `copy run`
 * can produce say the same thing in the same words. `windowStart` is seconds into the template's
 * period and is deliberately *not* called `window`: the CLI's `--window` names the reporting window
 * and `--part` takes a clock range, and a third meaning for either would be worse than a new word.
 */
/**
 * The largest arrival rate any control in this product will accept — `menu/menu.ts#FREE_PLAY_RATES`'
 * top rung, read rather than restated.
 *
 * Derived so the ladder stays the single authority: if Free Play ever offers 20 %, a link may carry
 * 20 % on the same commit and nobody has to remember this line.
 */
const MAX_OFFERED_RATE_PCT_POP5MIN = FREE_PLAY_RATES.reduce<number>(
  (highest, rate) => (rate === null ? highest : Math.max(highest, rate)),
  0,
);

/**
 * The link's `rate`, bounded — the UI readiness audit's B3, second axis.
 *
 * ## What was wrong
 *
 * `rate` was parsed by `/^\d+(\.\d+)?$/` and honoured **whatever it said**. Free Play's own
 * validator only requires `rate > 0` (`menu/menu.ts#freePlayIssues`), so nothing anywhere put a
 * ceiling on the demand a shared address could ask a stranger's browser for. Measured on
 * `midtown-office`/`nearest-car`/1 800 s: rate 12 → 447 ms, 50 → 950 ms, 100 → 2 794 ms,
 * **200 → 6 588 ms** — and that is the *small* building at a quarter of the longest run the menu
 * offers. A link is not a control a player moved; it is a number somebody else typed.
 *
 * ## Why this is a clamp and not a refusal
 *
 * `duration` two dozen lines up is `Math.max(60, Math.min(7200, …))`, and this is the same
 * decision about the same kind of stranger's input: a link that overshoots runs the largest thing
 * the product itself offers rather than nothing at all. The precedent that says a link may not
 * exceed what a field would accept is `seed`'s, right here — *"an address carrying twenty-one
 * digits would run something no field in this product would have accepted and no board would have
 * taken"* (issue #111(c)). This is that rule at the second axis, and it was the axis with no rule.
 *
 * A rate that is not a positive number is `null`, which is *the building's own profile* — the same
 * value the parser already produced for an absent or unparseable `rate`, so this changes nothing
 * about links that were already honest.
 */
function linkRateOf(rate: string | null): number | null {
  if (rate === null || !/^\d+(\.\d+)?$/.test(rate)) return null;
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, MAX_OFFERED_RATE_PCT_POP5MIN);
}

export function deepLinkStateOf(
  state: ViewerState,
  resources: BrowserResources,
  params: URLSearchParams,
): ViewerState {
  const patch: { -readonly [K in keyof ViewerState]?: ViewerState[K] } = {};
  const buildingId = params.get('building');
  if (buildingId !== null && buildingConfigOf(resources, [], buildingId) !== undefined) {
    patch.buildingId = buildingId;
  }
  const dispatcherId = params.get('dispatcher');
  if (
    dispatcherId !== null &&
    resources.dispatcherProfiles.profiles.some((profile) => profile.id === dispatcherId)
  ) {
    patch.dispatcherId = dispatcherId;
  }
  const seed = params.get('seed');
  // The same bound the field takes and the menu takes — issue #111(c). A link is the third way a
  // seed gets into this page, and a rule that held on two of three would be the drift the shared
  // predicate exists to stop: an address carrying twenty-one digits would run something no field
  // in this product would have accepted and no board would have taken.
  if (seed !== null && isSeedText(seed)) patch.seed = BigInt(seed);
  const duration = params.get('duration');
  if (duration !== null && /^\d+$/.test(duration)) {
    patch.shiftLengthS = Math.max(60, Math.min(7200, Number(duration)));
  }
  const tab = params.get('tab');
  if (isTabName(tab)) patch.tab = tab;
  const segment = params.get('rail');
  if (isRailSegment(segment)) patch.railSegment = segment;
  const mode = params.get('mode');
  if (isViewMode(mode)) patch.mode = mode;
  /*
   * The four run axes, each refused the way the four above are refused: a value `data/` does not
   * ship is dropped and the page keeps its own, never coerced into the nearest thing that parses.
   *
   * `traffic` names a **shipped** profile only. A saved pattern is one this browser has and the
   * recipient does not, which is why `runIdentityIssues` refuses to put one in a shareable
   * artefact at all — so there is nothing here for a link to honour.
   */
  const traffic = params.get('traffic');
  if (traffic !== null && resources.trafficProfiles.profiles.some((entry) => entry.id === traffic)) {
    patch.pattern = traffic;
  }
  const windowStart = params.get('windowStart');
  if (windowStart !== null && /^\d+$/.test(windowStart)) patch.windowStartS = Number(windowStart);
  /*
   * `template` and `rate` are one field — `ViewerState.freePlay` — so they are read as one. A link
   * carrying either puts the page in the state Free Play's Start puts it in, because that is the
   * only state in which `shiftRunConfigOf` reads them: writing `rate` alone onto a page whose
   * `freePlay` is `undefined` would need a template to go with it, and the template a link did not
   * name is not one this page may invent.
   */
  const template = params.get('template');
  const rate = params.get('rate');
  const templateShips =
    template !== null &&
    resources.trafficProfiles.demandTemplates.some((entry) => entry.id === template);
  if (templateShips) {
    patch.freePlay = { demandTemplateId: template, arrivalRatePctPop5min: linkRateOf(rate) };
  }
  /*
   * The **state's** opening length when the link names none, not the module constant — § D234.
   *
   * These two were `DEFAULT_SHIFT_LENGTH_S` and `deepLinkDefaultsOf(...).shiftLengthS`, two
   * constants that happened to be equal, and `deepLinkSearchOf` omits `duration` whenever it equals
   * the second. The moment `c1` gained an authored shift (issue #27) they stopped agreeing, and the
   * round trip broke in the direction that is hardest to see: a link produced from an untouched page
   * omitted `duration`, and applying it silently ran a 1 800 s shift where the page had run 3 600 —
   * *"a different run wearing the same address"*, which is the failure this pair exists to prevent
   * and which `main.test.ts` caught.
   *
   * `state` here is `initialState`'s, and `deepLinkDefaultsOf` reads the same function, so the
   * writer's *default* and the reader's *fallback* are now one value by construction rather than by
   * two literals staying in step.
   */
  return { ...state, ...patch, shiftLengthS: patch.shiftLengthS ?? state.shiftLengthS };
}

/**
 * The values the serializer omits — a fresh page's own state, so a fresh page's address stays
 * clean. Derived from {@link initialState} rather than written twice: if § D134 moves the opening
 * dispatcher again, the URL's idea of *default* moves with it.
 */
export interface DeepLinkDefaults {
  readonly buildingId: string;
  readonly dispatcherId: string;
  readonly shiftLengthS: number;
  readonly tab: TabName;
  readonly railSegment: RailSegment;
  readonly mode: ViewMode;
  /** `'building'` on a fresh page — the building's own demand, and what every figure was measured under. */
  readonly pattern: PatternSelection;
  /** `null` on a fresh page: the whole of whichever period the template declares. § D285. */
  readonly windowStartS: number | null;
}

export function deepLinkDefaultsOf(resources: BrowserResources): DeepLinkDefaults {
  // The seed argument is irrelevant to the eight fields read off; `0n` is not a default seed.
  const opening = initialState(resources, 0n);
  return {
    buildingId: opening.buildingId,
    dispatcherId: opening.dispatcherId,
    shiftLengthS: opening.shiftLengthS,
    tab: opening.tab,
    railSegment: opening.railSegment,
    mode: opening.mode,
    pattern: opening.pattern,
    windowStartS: opening.windowStartS,
  };
}

/**
 * The other half of {@link deepLinkStateOf}: the same eleven params, written — `SH-09`.
 *
 * Two decisions, both deliberate:
 *
 * - **A default is omitted.** A URL that spelt out `?tab=run&rail=dispatcher&duration=1800` on a
 *   page nobody has touched is noise, and noise in an address is what stops people reading the
 *   part that matters.
 * - **The seed is always written.** It has no default to omit — it is drawn at random per session
 *   — and it is the one param without which the pasted link is a different run wearing the same
 *   address. Invariant 5 puts the seed on every persisted run record; the address bar is a place
 *   a run gets persisted to.
 *
 * `freePlay` has **no default to compare against**: `initialState` leaves it `undefined`, and
 * `undefined` there is not *"the same as the opening page"* but *"the campaign owns the run"*. So
 * the two params are written whenever the field is present, and a rate of `null` — the building's
 * own profile, a selection rather than a missing one — is written as the word rather than omitted.
 */
export function deepLinkSearchOf(state: ViewerState, defaults: DeepLinkDefaults): string {
  const params = new URLSearchParams();
  if (state.buildingId !== defaults.buildingId) params.set('building', state.buildingId);
  if (state.dispatcherId !== defaults.dispatcherId) params.set('dispatcher', state.dispatcherId);
  params.set('seed', state.seed.toString());
  if (state.shiftLengthS !== defaults.shiftLengthS) params.set('duration', String(state.shiftLengthS));
  if (state.pattern !== defaults.pattern) params.set('traffic', state.pattern);
  if (state.windowStartS !== defaults.windowStartS && state.windowStartS !== null) {
    params.set('windowStart', String(state.windowStartS));
  }
  if (state.freePlay !== undefined) {
    params.set('template', state.freePlay.demandTemplateId);
    if (state.freePlay.arrivalRatePctPop5min !== null) {
      params.set('rate', String(state.freePlay.arrivalRatePctPop5min));
    }
  }
  if (state.tab !== defaults.tab) params.set('tab', state.tab);
  if (state.railSegment !== defaults.railSegment) params.set('rail', state.railSegment);
  if (state.mode !== defaults.mode) params.set('mode', state.mode);
  return `?${params.toString()}`;
}

/**
 * The **link** `copy run` copies — GitHub issue #118 § 2, and the artefact this product is for.
 *
 * The control copied `--building … --dispatcher … --seed … --duration …`: flags with no command
 * name, for somebody who has the repository checked out. The issue's own argument is the right one
 * — *"this product's determinism is its superpower: a seed **is** a shareable object"* — and the
 * page already accepts every axis of a run in its own address. So the primary artefact is a URL that
 * **opens the run**, and the CLI line stays behind a second control for the people who want it.
 *
 * ## It refuses through the same predicate the CLI line refuses through
 *
 * `runIdentityIssues`, not a second opinion — `docs/16` S5's whole argument, and it applies here
 * more sharply than anywhere: a link that quietly dropped a saved building would send somebody a
 * page that runs a different building under this run's name, and neither of them would know. What a
 * URL may carry is exactly what {@link deepLinkSearchOf} writes and {@link deepLinkStateOf} honours,
 * and `main.test.ts` holds the round trip.
 *
 * ## Where it is *more* faithful than the CLI line, and why that is not an argument for dropping one
 *
 * A run windowed onto a template that declares no hour has no `--part` to name it, so
 * {@link provenanceLineOf} refuses; `windowStart` is seconds and carries it fine. The line still
 * earns its place — it is the artefact that reproduces a run **outside a browser**, in the tool the
 * published figures were measured with.
 */
export function shareLinkOf(
  state: ViewerState,
  resources: BrowserResources,
  defaults: DeepLinkDefaults,
  base: string,
): Provenance {
  const reasons = runIdentityIssues(state, resources, 'ranked').map((issue) => issue.message);
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, line: `${base}${deepLinkSearchOf(state, defaults)}` };
}

/* -------------------------------------------------------------------------- *
 * The seed field — TP-08
 * -------------------------------------------------------------------------- */

/** What one entry into the seed field asks for: a fresh draw, this seed, or nothing. */
export type SeedEntry =
  | { readonly kind: 'draw' }
  | { readonly kind: 'run'; readonly seed: bigint }
  | { readonly kind: 'refuse'; readonly message: string };

/**
 * The seed field's parse — `TP-08`, and a refusal where a coercion was.
 *
 * The shipped parse was `BigInt(raw.replace(/\D/g, '') || '0')`, so `banana` silently became
 * **seed 0**: the field kept reading `banana` while the footer read *seed 0* — a provenance
 * control reproducing a different run without saying so (§ D198). Anything that is not a seed is
 * refused by name, never coerced into a seed nobody typed. A blank field asks for a fresh draw —
 * `UX.md` TP-08's stated contract — and the caller shows whatever seed actually runs.
 *
 * ## The rule is `menu/menu.ts#isSeedText`, and adopting it is GitHub issue #111(c)
 *
 * This took `/^\d+$/` — unbounded — while the menu's Seed field took `/^\d{1,20}$/`. The issue
 * reported the two as inconsistent and named *this* one as the strict half, citing a
 * `maxlength="20"` that does not exist anywhere in `packages/viz`; the inconsistency is real and
 * runs the other way. It is not symmetric, either, which is why this side moved rather than the
 * other: a run started from **this** field can be posted to a board, `menu.ts` bounds a seed at
 * twenty digits so it survives JSON and a database byte for byte (§ D214 § 3), and a twenty-one
 * digit seed typed here would have been accepted by the field, run, drawn, and then refused at post
 * time by a rule nothing on this screen had mentioned.
 *
 * **No `maxlength` attribute**, and that is the same decision as the one above it. `maxlength`
 * truncates a paste in silence, which would hand back the coercion § D198 removed — a field
 * quietly holding the first twenty digits of a seed somebody meant. The bound is enforced where the
 * refusal can name it.
 *
 * ## What still differs between the two fields, and why it is not the same rule twice
 *
 * A blank. Here it draws one, because this field is always showing the seed that is *running*, so
 * an empty box is a gesture — *give me another* — and the caller writes the drawn seed straight
 * back into it. The menu's field is naming a run that does not exist yet and has no generator
 * behind it: a blank there is the absence of a choice, and `freePlayIssues` says so in words. One
 * rule for *what a seed is*; two answers to *what nothing means*, because the two blanks are not
 * the same blank.
 */
export function seedEntryOf(raw: string): SeedEntry {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'draw' };
  if (isSeedText(trimmed)) return { kind: 'run', seed: BigInt(trimmed) };
  // Two refusals, because "that is not a number" is unhelpful about a string of digits. The long
  // one names the count, so a reader can see what they are being asked to cut.
  const overlong = /^\d+$/.test(trimmed);
  return {
    kind: 'refuse',
    message: overlong
      ? `“${trimmed}” is ${String(trimmed.length)} digits — a seed is 1–${String(SEED_MAX_DIGITS)} of ` +
        'them, so it survives a round trip to a board and back. ' +
        'The field shows the seed that is still running.'
      : `“${trimmed}” is not a seed — a seed is 1–${String(SEED_MAX_DIGITS)} digits. ` +
        'The field shows the seed that is still running.',
  };
}

/**
 * A seed nobody chose, so the first shift is not the same shift for everybody.
 *
 * `crypto.getRandomValues` and not `Math.random()`: invariant 2 is about the *simulation's* random
 * numbers and this is not one of them, but the habit is worth keeping — and a seed is written into
 * the record, so a weak one would be a weak provenance.
 */
function randomSeed(): bigint {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return (BigInt(bytes[0] ?? 1) << 16n) ^ BigInt(bytes[1] ?? 1);
}

/**
 * The boot, and the last resort.
 *
 * If `elements()` throws, the page has no error slot to write into — that was the defect that put
 * `MissingElementsError` in `elementMap.ts` — so this prepends one rather than failing silently in
 * a console nobody has open.
 *
 * The condition is *is there a page at all*. In a browser it is always true and nothing about the
 * shipped behaviour changes; under `vitest`'s `environment: 'node'` it is false, which is what lets
 * a test import this module for the pure functions it exports. Every other module in `dev/` is
 * already importable that way — this one ran the whole shell on import, so nothing in it could be
 * tested, and {@link waitLegendEntries} is the first thing here that has to be.
 */
if (typeof document !== 'undefined') {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const pre = document.createElement('pre');
    pre.style.cssText =
      'color:var(--bad);padding:12px;white-space:pre-wrap;font:12px var(--mono)';
    pre.textContent = `The viewer did not start.\n\n${message}`;
    document.body.prepend(pre);
  });
}

export { applyDeepLink, randomSeed, SPEEDS };
export type { ViewerState };
