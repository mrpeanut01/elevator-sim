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
 * | `record/decisionLog.ts` | `recordRun`, called by {@link runShift} |
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

import { SimulationError, type BuildingConfig } from '@elevator-sim/core/browser';

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
import { initialMenuState, navigate } from '../menu/menu.js';
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
import { buildLayout, type Layout, type ShaftGeometry } from '../render/layout.js';
import { AWT_ID, WT95_ID } from '../render/runSummary.js';
import { disclosureItems } from '../mode/disclosure.js';
import { parityRefusal } from '../mode/parity.js';
import { isViewMode, itemsIn, type DisclosureItem, type ViewMode } from '../mode/types.js';
import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import { runIdentityIssues } from '../scope/runIdentity.js';
import { demandFromSpec, specFromTrafficProfile } from '../authoring/patternSpec.js';
import { contractById, statLineOf } from '../shift/contracts.js';
import { eventFor } from '../shift/events.js';
import { shiftObservationsOf } from '../shift/observations.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import { dayReportOf, type DayReportInput } from '../shift/report.js';
import { HISTORY_DAYS, outcomeOf } from '../shift/week.js';
import { coachWeekLines } from '../shift/weekLabel.js';
import { weekdayOf } from '../shift/types.js';

import { mountBatchPanel } from './batchPanel.js';
import { mountCampaignPanel, type CampaignPanelHandle } from './campaignPanel.js';
import { createLoader } from './bootstrap.js';
import { loadBrowserResources, loadCampaign, type BrowserResources } from './data.js';
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
import { mountSelectorEditor } from './selectorEditor.js';
import { mountLeftRail } from './leftRail.js';
import { mountMachinesEditor } from './machinesEditor.js';
import { mountParameterForm } from './parameterForm.js';
import { mountReport, runProgressOf } from './reportPanel.js';
import { mountRightRail } from './rightRail.js';
import { mountScenarios } from './scenariosPanel.js';
import { mountTrafficEditor } from './trafficEditor.js';
import { playbackRateFor, shouldAutoplayWith } from './motion.js';
import { themeFor } from '../render/theme.js';
import { libraryNoticeFor, restoreNoticeFor, saveNoticeFor } from '../persist/notice.js';
import { clearSession, loadLibrary, loadSession, saveSession } from '../persist/session.js';
import type { SessionStore } from '../persist/types.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';
import {
  allBuildingIds,
  buildingConfigOf,
  shiftDemandTemplateId,
  closedWeekOf,
  specsWithSaved,
  buildingNameOf,
  disclosureOf,
  initialState,
  profileById,
  resolvedBuildingOf,
  shiftRunConfigOf,
  weekForSession,
  withBuilding,
  type ViewerState,
} from './state.js';
import {
  DRAWER_BREAKPOINT_PX,
  applyDrawerState,
  applyRailState,
  applySurfaceState,
  drawerStateFor,
  escapeClosesDrawer,
  railStateFor,
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

/** Width of the right gutter, where the landing counts and the rider queues are drawn. */
const QUEUE_GUTTER_PX = 280;
/** Width reserved for the live metrics panel. Dropped below this viewport width — `RS-03`. */
const OVERLAY_WIDTH_PX = 250;
const OVERLAY_MIN_VIEWPORT_PX = 900;

/**
 * What the stage asks for around the plot, widest request first — GitHub issue #41.
 *
 * ## The defect: two numbers that were the same at every width and every building
 *
 * {@link QUEUE_GUTTER_PX} and {@link OVERLAY_WIDTH_PX} were passed to `buildLayout` unchanged
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
 * The rungs yield in `fitGutters`' own order and for its stated reason — *the overlay panel is a
 * whole surface and goes first, then the right gutter*. The last rung asks for **nothing**, which
 * hands the layout its own documented default rather than a floor copied from it: this file never
 * names a minimum, and `layout.ts` still clamps whatever it is handed.
 *
 * A building that fits on rung one stays on rung one, so no picture that was right moves.
 */
const STAGE_GUTTER_LADDER: readonly { readonly gutter: number; readonly overlay: boolean }[] =
  Object.freeze([
    { gutter: QUEUE_GUTTER_PX, overlay: true },
    { gutter: QUEUE_GUTTER_PX, overlay: false },
    { gutter: Math.round(QUEUE_GUTTER_PX / 2), overlay: false },
    // `gutter: 0` is *ask for nothing*, which `buildLayout` reads as its own `DEFAULTS.gutterRightPx`
    // — see the note above about never copying that number here.
    { gutter: 0, overlay: false },
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
   * It earns its place on the fourth entry. `WAIT_BANDS[3].legendLabel` is the handoff's word
   * *gave up* (`:233`), and `bands.ts` is explicit that the band counts **people still standing**
   * past two minutes rather than people who abandoned — that is `observationsAt(…).abandoned`, a
   * different population on a different clock. A bare label could carry that ambiguity harmlessly;
   * a label with a *count* on it is a figure, so the boundary goes beside it.
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
 * `WAIT_BANDS`: `legendLabel` is *under 30 s* / *a minute* / *two minutes* / *gave up*, and `color`
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
 * `wantsOverlay` stays the caller's, because it answers a different question — `RS-03` drops the
 * live-metrics panel below 900 px of canvas whether or not the shafts fit — and a rung that
 * re-enabled it would be this function overruling that rule.
 */
export function stageLayoutFor(options: {
  readonly width: number;
  readonly height: number;
  readonly floors: readonly VizFloor[];
  readonly shafts: readonly ShaftGeometry[];
  readonly wantsOverlay: boolean;
}): Layout {
  const { wantsOverlay, ...rest } = options;
  let last: Layout | undefined;
  for (const rung of STAGE_GUTTER_LADDER) {
    const layout = buildLayout({
      ...rest,
      ...(rung.gutter === 0 ? {} : { gutterRightPx: rung.gutter }),
      overlayWidthPx: rung.overlay && wantsOverlay ? OVERLAY_WIDTH_PX : 0,
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
  return last ?? buildLayout({ ...rest, overlayWidthPx: 0 });
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
 */
export function transportStatusOf(
  items: readonly DisclosureItem[],
  mode: ViewMode,
): string | undefined {
  const drawn = itemsIn(items, mode);
  const shown = [AWT_ID, WT95_ID]
    .map((id) => drawn.find((item) => item.id === id))
    .filter((item) => item !== undefined);
  if (shown.length === 0) return undefined;

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
   * So the *filing* gate is this flag and it is latched only where a mode is entered; the *autoplay*
   * gate is {@link menuHasBeenDismissed}, latched on every way out. The two were always two
   * questions and the second one only looked like the first because both start `false`.
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
   */
  let baseSpeed = 60;

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
       * 120 s: checking watch → taking the stairs, and the rung that stops blaming the cold start.
       * A sleeping container was measured at 32.2 s; four times that is not a cold start any more,
       * and going on saying *it is just waking up* would be a reassurance that had stopped being
       * true — which this repository has a standing rule about.
       */
      afterMs: 120_000,
      text:
        'Two minutes — your mood bar’s last band, taking the stairs, where a tenant gives up. You ' +
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
  /** Requests are started here and never from a render — a render that fetched would loop. */
  let boardsRequested = false;

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
  let challengeRequested = false;
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
    if (client === undefined || challengeRequested) return;
    challengeRequested = true;
    challengeView = { ...challengeView, notice: 'Loading this week’s challenge…' };
    drawMenu();
    const result = await client.challenges();
    challengeView = result.ok
      ? { ...challengeView, view: result.value.current, notice: undefined }
      : { ...challengeView, notice: result.detail };
    drawMenu();
    if (result.ok) void loadChallengeBoard();
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
    if (client === undefined || boardsRequested) return;
    boardsRequested = true;
    boardView = { ...boardView, notice: 'Loading boards…' };
    drawMenu();
    const result = await client.boards();
    boardView = result.ok
      ? {
          boards: result.value.map((board) => ({ configHash: board.configHash, entries: board.entries })),
          selected: undefined,
          page: undefined,
          notice: result.value.length === 0 ? 'No scores have been posted yet.' : undefined,
        }
      : { ...boardView, notice: result.detail };
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
      if (restored.failure.kind !== 'absent') clearSession(sessionStore);
      return;
    }
    menuState = {
      ...menuState,
      settings: restored.snapshot.settings,
      freePlay: restored.snapshot.freePlay,
    };
    state = { ...state, week: restored.snapshot.week };
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
      { ...state, week: weekForSession(state, stored.ok ? stored.snapshot.week : undefined) },
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
        const next = applyIntent(menuState, intent);
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
        const entered = enterFreePlay(state, resources, menuState.freePlay, menuCatalogue);
        if (entered === undefined) return;
        // `enterFreePlay` selects the simulation tab — issue #23, and it is in the decision rather
        // than here for the reason that module exists at all.
        state = entered;
        menuState = navigate(menuState, 'main');
        closeMenu('entered-a-mode');
        runShift();
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
        runShift();
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
        const hash = intent.configHash;
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

      case 'submit-score': {
        void submitScore();
        return;
      }

      case 'set-challenge': {
        menuState = applyIntent(menuState, intent);
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
     * The fourth refusal, and the one that used to be a `?? 0`. See `claimedMetricsOf`: an
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
        demandTemplateId: menuState.freePlay.demandTemplateId,
        arrivalRatePctPop5min: menuState.freePlay.arrivalRatePctPop5min,
        durationS: state.shiftLengthS,
        // `state`, not `menuState.freePlay`, and the distinction matters here more than it does on
        // the lines above: this is the window the run *was simulated with*, and the menu holds the
        // window currently *selected*. They agree until somebody changes the selection after a run
        // and before posting, and then only one of them describes the seed the server is about to
        // replay. § D285.
        windowStartS: state.windowStartS,
        seed: state.seed.toString(),
      },
      claimed: claim.claimed,
    });
    done();
    accountState = withNotice(
      accountState,
      result.ok ? 'Posted. The server replayed your seed and it reproduced.' : result.detail,
    );
    drawMenu();
  }

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
    shell: shellBehindMenu,
    calendarPeriodId: () => state.calendar?.id ?? '',
    commissioning: () => commissioningInput(),
    runState: () => {
      const issues = runIdentityIssues(state, resources, 'ranked');
      return {
        hasRun: state.recording !== undefined,
        rankingRefusal: issues.length === 0 ? undefined : issues.map((issue) => issue.message).join('; '),
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
  function shellBehindMenu(): readonly HTMLElement[] {
    return [...document.body.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child !== menuRoot && child !== waitLiveRegion,
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
   * So {@link menuHasBeenDismissed} is set on every arm and {@link playerHasChosen} only on a mode.
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

  drawMenu();

  /**
   * Whether the transport restarts at the end.
   *
   * A boot-scope boolean rather than `#loop.checked`, because `#loop` is a `.chip[aria-pressed]`
   * now (`docs/12` § 4.7) and a button has no checked state. The element carries the same fact in
   * `aria-pressed`, written by {@link setLooping} and read by nothing — one source, one writer.
   */
  let looping = false;

  const clock = systemClock();
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
   * The mount context — the only thing a panel may do to the world
   * ---------------------------------------------------------------------- */
  const context: MountContext = {
    update(patch) {
      state = { ...state, ...patch };
      renderAll();
    },
    runShift() {
      runShift();
    },
    openTab(tab) {
      const revealed = new Set(state.revealedTabs);
      revealed.add(tab);
      state = { ...state, tab, revealedTabs: revealed };
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
  const trafficEditor = mountTrafficEditor(ui.trafficEditor, context);
  const machinesEditor = mountMachinesEditor(ui.machinesEditor, context);
  const buildingEditor = mountBuildingEditor(ui.buildingEditor, context);
  const statePanels: readonly Panel[] = [
    rightRail,
    reportPanel,
    scenariosPanel,
    dispatcherEditor,
    selectorEditor,
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

  mountParameterForm({
    container: ui.paramForm,
    picker: ui.paramSource,
    status: ui.paramStatus,
    refusal: ui.paramRefusal,
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
    };
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
    drawStage();
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

  /** Only what the playhead moves. Runs at 60 Hz. */
  function renderLive(): void {
    const view = viewAt();
    leftRail.render(view);
    drawHeader(view);
    drawFooter(view);
    drawPlayhead(view);
    // The legend's counts are a reading at `t`, so they belong here and not only in `renderAll`.
    // Left out, the row would state the counts of whichever frame last changed the state — a
    // figure that is stale in exactly the way a scrubbing reader cannot see.
    drawLegend(view);
    drawStage();
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
       */
      if (playback.state === 'ended' && filedRunId !== state.recording?.runId) {
        closeShift();
      }
    }
    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------------------- *
   * Navigation — § 1.1 S5, § 1.3 M1, § 1.4 R1
   * ---------------------------------------------------------------------- */

  function applyNavigation(): void {
    applySurfaceState(ui, surfaceStateFor(state.tab, state.revealedTabs));
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
      const next = tabAfterKey(surfaceStateFor(state.tab, state.revealedTabs), state.tab, event.key);
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
      drawTransportStatus();
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
     * One copy control, not two. `#copy-provenance` on the transport called this same function
     * with the same arguments and produced the same line as the footer's `#copy-run` — and
     * `#copy-run` is the handoff's own S4 requirement, so the duplicate was the one to go
     * (`docs/12` § 4.7). RV-T7 asks for *one* control that copies the run's provenance, and it now
     * has exactly one.
     */
    ui.footer.copyRun.addEventListener('click', () => {
      void copyProvenance('copy run', ui.footer.copyRun);
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
    const phase = view.recording === undefined ? undefined : phaseAt(view.recording, view.simTimeS);
    setText(ui.header.phaseLabel, phase?.label ?? 'no run yet');
    setText(
      ui.header.dayLabel,
      `Day ${String(state.week.day)} · ${weekdayOf(state.week.dayIdx)}`,
    );
    const population =
      view.building?.floors.reduce((total, floor) => total + floor.population, 0) ?? 0;
    setText(ui.header.tenantsLine, `${population.toLocaleString('en-GB')} tenants`);
  }

  function drawFooter(view: ViewAt): void {
    const profile = profileById(resources, state.savedDispatchers, state.dispatcherId);
    const observations =
      view.recording === undefined ? undefined : observationsAt(view.recording, view.simTimeS);
    setText(
      ui.footer.statusLine,
      observations === undefined
        ? 'no shift run yet'
        : `${view.playing ? 'running' : 'paused'} · ${String(observations.arrived)} arrived, ` +
          `${String(observations.carried)} carried · ${profile.name.toLowerCase()}`,
    );
    setText(
      ui.footer.seedLine,
      `seed ${state.seed.toString()} · day ${String(state.week.day)}`,
    );
  }

  async function copyProvenance(label: string, button: HTMLButtonElement): Promise<void> {
    const provenance = provenanceLineOf(state, resources);
    if (!provenance.ok) {
      /*
       * TP-13: the control refuses rather than copying a line the CLI would honour and turn into
       * a *different* run. A refused copy names every reason, because each one is a fact about
       * this run the reader would otherwise discover as an unexplained mismatch.
       */
      setText(ui.transport.status, `no CLI line reproduces this run — ${provenance.reasons.join('; ')}`);
      setText(button, 'no CLI line');
      window.setTimeout(() => {
        setText(button, label);
      }, 1400);
      return;
    }
    try {
      await navigator.clipboard.writeText(provenance.line);
      setText(button, 'copied');
    } catch {
      // A clipboard a browser refuses is not an error the reader caused. Show the line instead.
      setText(ui.transport.status, provenance.line);
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
   * ## Why this is written on adopt and on a mode change, and not in `renderAll`
   *
   * `#status` is also where four transient messages land — the copied provenance line, *copied*,
   * *the shift did not run*, a batch's progress — each of which restores itself after its own
   * moment. A writer inside `renderAll` would clobber whichever of those was on screen the next
   * time any state moved, which is a regression wearing a fix. So the derived text is written at
   * the two moments it can actually change: a new recording, and the reader moving the mode
   * selector. One derivation ({@link transportStatusOf}), two call sites, and the transient
   * messages keep the screen until one of those two happens — which is exactly what they did
   * before.
   */
  function drawTransportStatus(): void {
    const text = transportStatusOf(disclosureNow(), state.mode);
    if (text !== undefined) setText(ui.transport.status, text);
  }

  /* ---------------------------------------------------------------------- *
   * The coach ribbon — § 1.3 M2
   * ---------------------------------------------------------------------- */

  function wireCoach(): void {
    ui.coach.building.addEventListener('change', () => {
      state = withBuilding(state, resources, ui.coach.building.value);
      renderAll();
      runShift();
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

  function runShift(): void {
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
     * The two backward-looking notices are spent once the player does something; `saveNotice` is
     * not, because it describes a condition that is still true and will still be true next time.
     */
    if (urlWritable) {
      restoreNotice = undefined;
      libraryNotice = undefined;
    }
    try {
      const plan = shiftRunConfigOf(resources, state);
      building = plan.building;
      calendarCaption = plan.calendarLine;
      const recorded = recordRun(plan.config, {
        outOfServiceCarIds: plan.outOfServiceCarIds,
      });
      // The template's own hour, moved on by the window when the run is a part of a day. Absent for
      // `constant-iso`, which declares none — omission means *this has no hour*, never *midnight*.
      runStartOfDayS = recorded.result.trace.startOfDayS;
      state = { ...state, recording: recorded.recording, report: undefined, withheld: plan.withheld };
      adopt(recorded.recording);
      renderAll();
    } catch (error) {
      failRun(error);
    }
  }

  function adoptEditedBuilding(config: BuildingConfig): void {
    const id = config.id;
    const saved = [
      ...state.savedBuildings.filter((entry) => entry.id !== id),
      { id, config },
    ];
    state = { ...state, savedBuildings: saved, buildingId: id, tab: 'run' };
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
    drawTransportStatus();
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
    filedRunId = recording.runId;
    const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
    const goals = goalsForDay(state.week.day);
    const readings = readGoals(goals, observations);
    const event = eventFor(state.week.day, state.week.dayIdx);
    const outcome = outcomeOf({
      day: state.week.day,
      dayIdx: state.week.dayIdx,
      eventId: event.id,
      readings,
      minutePct: observations.minutePct,
      carried: observations.carried,
      arrived: observations.arrived,
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
    const week = closedWeekOf(state, outcome);
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
              selection: {
                demandTemplateId: menuState.freePlay.demandTemplateId,
                arrivalRatePctPop5min: menuState.freePlay.arrivalRatePctPop5min,
                durationS: state.shiftLengthS,
              },
            }
          : { kind: 'week-day' as const },
      event,
      dispatcherName: profileById(resources, state.savedDispatchers, state.dispatcherId).name,
      /*
       * The run's own hour, not a flat 06:00 — issue #83. `DAY_START_S` survives as the fallback for
       * a template that declares none (`constant-iso`) and for a recording restored from a file.
       * See {@link runStartOfDayS} for why this is captured from the run rather than from `state`.
       */
      dayStartS: runStartOfDayS ?? DAY_START_S,
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
     * The tab is **not** forced here. `closeShift` is reached two ways — the playhead reaching the
     * end, and the reader opening the sheet — and the second one has already set the tab. Setting
     * it again inside a handler that `openTab` called would be the same write twice, which is how a
     * navigation ends up fighting itself.
     */
    state = { ...state, week, report };
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
      canvas.setAttribute('aria-label', 'No shift has been run yet, so the stage is empty.');
      return;
    }

    const frame = playback.frame();
    const wantsOverlay = width >= OVERLAY_MIN_VIEWPORT_PX;
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
      wantsOverlay,
    });
    const overlay = overlayAt(recording, frame.simTimeS);
    const assignments: readonly LandingAssignment[] = landingAssignmentsAt(recording, frame.simTimeS);
    const lockedOut: readonly LockedOutLanding[] = lockedOutAt(recording, frame.simTimeS);
    const hits = drawScene(context2d as unknown as Canvas2DLike, {
      theme: stageTheme,
      recording,
      frame,
      layout,
      overlay: wantsOverlay ? overlay : undefined,
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
    });
    carBadgeHits = hits.carBadges;

    const alarm = hits.alarm;
    setHidden(ui.stage.alarm, alarm === undefined);
    if (alarm !== undefined) {
      setText(ui.stage.alarmText, `${String(alarm.waiting)} people stacked up at ${alarm.label}`);
      setText(ui.stage.alarmSub, 'a car is on its way — or add one under Building');
    }
    canvas.setAttribute('aria-label', describeFrame({ recording, frame }));
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
    setText(ui.stage.description, describeFrame({ recording, frame: playback.frame() }));
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
    ui.coach.run.addEventListener('click', () => {
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
      ...tickLabelsOf(recording, 5).map((label) =>
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
    ui.transport.timeline.setAttribute('aria-valuetext', clockWithSecondsAt(view.simTimeS));
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

  function verifyCurrent(): void {
    const recording = state.recording;
    if (recording === undefined) return;
    try {
      const plan = shiftRunConfigOf(resources, state);
      const again = recordRun(plan.config, { outOfServiceCarIds: plan.outOfServiceCarIds });
      const verdict = verifyReplay(recording, again.recording);
      // The stored recording stays on screen either way — `PB-16`'s second half. A mismatch is
      // evidence about the build, not a reason to quietly swap in whatever came out.
      setText(ui.transport.status, verdict.message);
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
      state = { ...state, recording: loaded.recording, report: undefined };
      adopt(loaded.recording);
      renderAll();
    } catch (error) {
      failRun(error);
    }
  }

  function exportPng(): void {
    ui.stage.canvas.toBlob((blob) => {
      if (blob === null) return;
      downloadBlob(blob, `${state.buildingId}-${state.seed.toString()}.png`);
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
          if (event.metaKey || event.ctrlKey) closeShift();
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
 * clocks cannot come to disagree about what 06:00 means.
 */
export function clockWithSecondsAt(simTimeS: number): string {
  const wrapped = ((timeOfDayAt(simTimeS) % 86_400) + 86_400) % 86_400;
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
  const reasons = runIdentityIssues(state, resources, 'ranked').map((issue) => issue.message);
  const flags: string[] = [`--building ${state.buildingId}`, `--dispatcher ${state.dispatcherId}`];

  let template: string | undefined;
  if (state.pattern !== 'building') {
    const shipped = resources.trafficProfiles.profiles.find((profile) => profile.id === state.pattern);
    if (shipped !== undefined) {
      flags.push(`--traffic ${shipped.id}`);
      const demand = demandFromSpec(specFromTrafficProfile(resources.trafficProfiles, shipped.id));
      if (demand.demandTemplate !== 'rise-and-fall') template = demand.demandTemplate;
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };
  // The CLI's own echo order — `planRun`'s `commandLine` puts `--template` after `--duration`.
  flags.push(`--seed ${state.seed.toString()}`, `--duration ${String(state.shiftLengthS)}`);
  if (template !== undefined) flags.push(`--template ${template}`);
  return { ok: true, line: flags.join(' ') };
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

/** The reader's decisions: which of the seven params are honoured, and what refuses each. */
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
  if (seed !== null && /^\d+$/.test(seed)) patch.seed = BigInt(seed);
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
}

export function deepLinkDefaultsOf(resources: BrowserResources): DeepLinkDefaults {
  // The seed argument is irrelevant to the six fields read off; `0n` is not a default seed.
  const opening = initialState(resources, 0n);
  return {
    buildingId: opening.buildingId,
    dispatcherId: opening.dispatcherId,
    shiftLengthS: opening.shiftLengthS,
    tab: opening.tab,
    railSegment: opening.railSegment,
    mode: opening.mode,
  };
}

/**
 * The other half of {@link deepLinkStateOf}: the same seven params, written — `SH-09`.
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
 */
export function deepLinkSearchOf(state: ViewerState, defaults: DeepLinkDefaults): string {
  const params = new URLSearchParams();
  if (state.buildingId !== defaults.buildingId) params.set('building', state.buildingId);
  if (state.dispatcherId !== defaults.dispatcherId) params.set('dispatcher', state.dispatcherId);
  params.set('seed', state.seed.toString());
  if (state.shiftLengthS !== defaults.shiftLengthS) params.set('duration', String(state.shiftLengthS));
  if (state.tab !== defaults.tab) params.set('tab', state.tab);
  if (state.railSegment !== defaults.railSegment) params.set('rail', state.railSegment);
  if (state.mode !== defaults.mode) params.set('mode', state.mode);
  return `?${params.toString()}`;
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
 * control reproducing a different run without saying so (§ D198). The rule is the deep-link
 * reader's own (`deepLinkStateOf`): a seed is `/^\d+$/`, and anything else is refused by name,
 * never coerced into a seed nobody typed. A blank field asks for a fresh draw — `UX.md` TP-08's
 * stated contract — and the caller shows whatever seed actually runs.
 */
export function seedEntryOf(raw: string): SeedEntry {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'draw' };
  if (/^\d+$/.test(trimmed)) return { kind: 'run', seed: BigInt(trimmed) };
  return {
    kind: 'refuse',
    message:
      `“${trimmed}” is not a seed — a seed is a whole number. ` +
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
    pre.style.cssText = 'color:#e0473a;padding:12px;white-space:pre-wrap;font:12px ui-monospace,monospace';
    pre.textContent = `The viewer did not start.\n\n${message}`;
    document.body.prepend(pre);
  });
}

export { applyDeepLink, randomSeed, SPEEDS };
export type { ViewerState };
