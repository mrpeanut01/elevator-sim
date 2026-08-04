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

import {
  SIGNED_OUT,
  busy,
  signedIn,
  signedOut,
  updateForm,
  withNotice,
  type AccountState,
} from '../menu/account.js';
import { catalogueOf } from '../menu/catalogue.js';
import { createClient, fetchTransport } from '../menu/client.js';
import { initialMenuState, navigate } from '../menu/menu.js';
import type { MenuState } from '../menu/types.js';
import { renderMenu, type LeaderboardView, type MenuPanelHost } from './menuPanel.js';
import { credentialCapabilityOf } from '../access/dispatcherCredentials.js';
import { lockedOutLandingsAt, type LockedOutLanding } from '../access/lockedOut.js';
import { restrictedFloorIds } from '../access/zoning.js';
import type { VizRecording } from '../contract/types.js';
import {
  landingAssignmentsAt,
  meansAreSuppressed,
  overlayAt,
  queueAt,
  type LandingAssignment,
} from '../frame/overlay.js';
import { WAIT_BANDS } from '../live/bands.js';
import { observationsAt } from '../live/observations.js';
import {
  clockAt,
  DAY_START_S,
  phaseAt,
  playheadPctOf,
  tickLabelsOf,
  timelineOf,
} from '../live/timeline.js';
import { systemClock } from '../playback/clock.js';
import { Playback } from '../playback/playback.js';
import { readRecordingDocument, verifyReplay, writeRecordingDocument } from '../record/document.js';
import { recordRun } from '../record/recordRun.js';
import {
  drawScene,
  type Canvas2DLike,
  type CarBadgeHit,
  type SceneSelection,
} from '../render/canvas.js';
import { describeFrame } from '../render/describeFrame.js';
import { buildLayout } from '../render/layout.js';
import { disclosureItems } from '../mode/disclosure.js';
import { parityRefusal } from '../mode/parity.js';
import { isViewMode, itemsIn, type DisclosureItem, type ViewMode } from '../mode/types.js';
import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import { demandFromSpec, specFromTrafficProfile } from '../authoring/patternSpec.js';
import { contractById, statLineOf } from '../shift/contracts.js';
import { eventFor } from '../shift/events.js';
import { shiftObservationsOf } from '../shift/observations.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import { dayReportOf } from '../shift/report.js';
import { closeDay, outcomeOf } from '../shift/week.js';
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
import { mountLeftRail } from './leftRail.js';
import { mountMachinesEditor } from './machinesEditor.js';
import { mountParameterForm } from './parameterForm.js';
import { mountReport } from './reportPanel.js';
import { mountRightRail } from './rightRail.js';
import { mountScenarios } from './scenariosPanel.js';
import { mountTrafficEditor } from './trafficEditor.js';
import { shouldAutoplay } from './motion.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';
import {
  DEFAULT_SHIFT_LENGTH_S,
  SHIFT_LENGTHS,
  allBuildingIds,
  buildingConfigOf,
  buildingNameOf,
  disclosureOf,
  initialState,
  profileById,
  shiftRunConfigOf,
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
/** One display frame at 60 Hz, in simulated seconds at the current speed — `KB-06`, `PB-08`. */
const FRAME_S = 1 / 60;
/** How often the live region is re-announced. Every frame would be unusable. */
const ANNOUNCE_MS = 2000;

/* ========================================================================== *
 * The wait-age legend — § 1.3 M4
 * ========================================================================== */

/** One key of the wait-age legend: a colour to draw a disc in, and the words beside it. */
export interface WaitLegendEntry {
  readonly label: string;
  readonly color: string;
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
export function waitLegendEntries(): readonly WaitLegendEntry[] {
  return WAIT_BANDS.map((band) => ({ label: band.legendLabel, color: band.color }));
}

/** One entry as a node: the handoff's `●` in the band's colour, then the band's words. */
function legendEntryNode(doc: Document, entry: WaitLegendEntry): HTMLElement {
  return el(doc, 'span', {
    className: 'legend-entry',
    children: [
      el(doc, 'span', {
        text: '●',
        style: { color: entry.color },
        // The disc is the colour key; the words beside it are the claim. KB-15 — a reader who
        // cannot separate amber from orange still reads *a minute* and *two minutes*.
        attrs: { 'aria-hidden': 'true' },
      }),
      el(doc, 'span', { text: entry.label }),
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
  let menuState: MenuState = initialMenuState(catalogueOf(resources));

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

  let accountState: AccountState = SIGNED_OUT;
  let boardView: LeaderboardView = {
    boards: [],
    selected: undefined,
    page: undefined,
    notice:
      client === undefined
        ? 'This build was not compiled against a leaderboard server, so there are no boards to show.'
        : undefined,
  };
  /** Requests are started here and never from a render — a render that fetched would loop. */
  let boardsRequested = false;

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

  const menuHost: MenuPanelHost = {
    doc: document,
    catalogue: catalogueOf(resources),
    state: () => menuState,
    update: (next) => {
      const arrived = next.screen === 'leaderboard' && menuState.screen !== 'leaderboard';
      menuState = next;
      drawMenu();
      // Started on **arrival**, once, and never from inside a render: a render that fetched would
      // fetch again on every state change its own response caused, and each render would look
      // correct on its own.
      if (arrived) void loadBoards();
    },
    start: (selection) => {
      // **Every axis the menu offered is applied.** `shiftRunConfigOf` still owns what a run is —
      // the template and the rate travel as `ViewerState.freePlay` and are read there, not built
      // into a second config here, which is the drift § D214 § 2 refuses. A selection axis that
      // reached nothing would be § D177's inert control with a label on it, and
      // `state.freePlay.test.ts` is the standing requirement pointed at all three.
      state = withBuilding(state, resources, selection.buildingId);
      state = {
        ...state,
        dispatcherId: selection.dispatcherProfileId,
        seed: BigInt(selection.seed),
        shiftLengthS: selection.durationS,
        freePlay: {
          demandTemplateId: selection.demandTemplateId,
          arrivalRatePctPop5min: selection.arrivalRatePctPop5min,
        },
      };
      menuState = navigate(menuState, 'main');
      closeMenu();
      renderAll();
    },
    openCampaign: () => {
      closeMenu();
    },

    account: () => accountState,
    updateAccountForm: (patch) => {
      accountState = updateForm(accountState, patch);
      drawMenu();
    },
    submitAccountForm: () => {
      if (client === undefined) {
        accountState = withNotice(
          accountState,
          'This build was not compiled against a server, so there is nowhere to sign in.',
        );
        drawMenu();
        return;
      }
      const form = accountState.form;
      accountState = busy(accountState, true);
      drawMenu();
      const request =
        form.mode === 'register'
          ? client.register({
              email: form.email.trim(),
              displayName: form.displayName.trim(),
              password: form.password,
            })
          : client.login({ email: form.email.trim(), password: form.password });
      void request.then((result) => {
        accountState = result.ok
          ? signedIn(accountState, result.value.token, result.value.user)
          : withNotice(accountState, result.detail);
        drawMenu();
      });
    },
    signOut: () => {
      const token = accountState.token;
      accountState = signedOut('Signed out.');
      drawMenu();
      // The local state is cleared first and the server is told second. A sign-out that waited for
      // the network would leave a player looking signed in while their connection was down.
      if (client !== undefined && token !== undefined) void client.logout(token);
    },

    leaderboard: () => boardView,
    openBoard: (configHash) => {
      if (client === undefined) return;
      boardView = { ...boardView, selected: configHash, page: undefined, notice: 'Loading…' };
      drawMenu();
      void client.board(configHash, 'awtS').then((result) => {
        boardView = result.ok
          ? { ...boardView, selected: configHash, page: result.value, notice: undefined }
          : { ...boardView, selected: configHash, page: undefined, notice: result.detail };
        drawMenu();
      });
    },
  };

  function drawMenu(): void {
    renderMenu(menuRoot, menuHost);
  }

  function closeMenu(): void {
    menuRoot.hidden = true;
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
      if (tab === 'report') closeShift();
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
  const trafficEditor = mountTrafficEditor(ui.trafficEditor, context);
  const machinesEditor = mountMachinesEditor(ui.machinesEditor, context);
  const buildingEditor = mountBuildingEditor(ui.buildingEditor, context);
  const statePanels: readonly Panel[] = [
    rightRail,
    reportPanel,
    scenariosPanel,
    dispatcherEditor,
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

  renderAll();
  runShift();
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
      building,
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
    drawLegend();
    drawStage();
  }

  /** § 1.3 M4 — the four wait-age keys, from `WAIT_BANDS` and from nowhere else. */
  function drawLegend(): void {
    const entries = waitLegendEntries();
    fillLegend(entries.map((entry) => `${entry.label}·${entry.color}`).join('|'), () => [
      ui.stage.legendTitle,
      ...entries.map((entry) => legendEntryNode(document, entry)),
    ]);
  }

  /** Only what the playhead moves. Runs at 60 Hz. */
  function renderLive(): void {
    const view = viewAt();
    leftRail.render(view);
    drawHeader(view);
    drawFooter(view);
    drawPlayhead(view);
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
    ui.header.viewMode.addEventListener('change', () => {
      const value = ui.header.viewMode.value;
      if (!isViewMode(value)) return;
      window.localStorage.setItem(MODE_KEY, value);
      context.update({ mode: value });
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
    setText(
      ui.header.buildingSub,
      building === undefined ? '' : statLineOf(building),
    );
    setText(ui.header.clock, view.recording === undefined ? '06:00' : clockAt(view.simTimeS));
    const phase = view.recording === undefined ? undefined : phaseAt(view.recording, view.simTimeS);
    setText(ui.header.phaseLabel, phase?.label ?? 'no run yet');
    setText(
      ui.header.dayLabel,
      `Day ${String(state.week.day)} · ${weekdayOf(state.week.dayIdx)}`,
    );
    const population = building?.floors.reduce((total, floor) => total + floor.population, 0) ?? 0;
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

  function drawParity(): void {
    /*
     * Parity is a property of **what was mounted**, not of the mode toggle: § 4's rule is that
     * Basic may never hide a failure Advanced would show, and that is a claim about this run's
     * items. So the items are derived from the recording and checked whole — a check over an empty
     * list would pass every time and say nothing.
     */
    const recording = state.recording;
    if (recording === undefined) {
      setText(ui.header.modeParity, '');
      return;
    }
    const items: readonly DisclosureItem[] = disclosureItems({
      recording,
      dispatcherName: profileById(resources, state.savedDispatchers, state.dispatcherId).name,
      lockedOut: lockedOutAt(recording, recording.endedAt),
    });
    setText(ui.header.modeParity, parityRefusal(items) ?? '');
    void itemsIn;
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
      context.update({ shiftLengthS: Number(ui.coach.shiftLength.value) });
      runShift();
    });
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
    fillSelect(
      ui.coach.shiftLength,
      SHIFT_LENGTHS.map((entry) => ({ value: String(entry.seconds), label: entry.label })),
      String(state.shiftLengthS),
    );

    const contract = state.week.contractId;
    setText(ui.coach.label, contract === undefined ? 'Sandbox' : `Scenario · day ${String(state.week.day)}`);
    setText(ui.coach.title, buildingNameOf(resources, state.savedBuildings, state.buildingId));
    setText(ui.coach.progress, coachProgress());
    setText(ui.coach.hint, coachHint(view));
  }

  function coachProgress(): string {
    if (state.week.contractId === undefined) {
      return `${String(Math.round(state.shiftLengthS / 60))} min of demand · free play`;
    }
    return `${String(state.week.cleanRun)} clean shift${state.week.cleanRun === 1 ? '' : 's'} banked`;
  }

  function coachHint(view: ViewAt): string {
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
    try {
      const plan = shiftRunConfigOf(resources, state);
      building = plan.building;
      const recorded = recordRun(plan.config, {
        outOfServiceCarIds: plan.outOfServiceCarIds,
      });
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

  function adopt(recording: VizRecording): void {
    playback = new Playback(recording, clock, {
      speed: playback?.speed ?? 60,
      loop: looping,
      // KB-14: a reader who asked for less motion gets a paused first frame.
      autoplay: shouldAutoplay(window.matchMedia.bind(window)),
    });
    disableTransport(ui, false);
    filedRunId = undefined;
    selectedLandingId = '';
    fillLandingSelect(recording);
    fillBankSelect(recording);
    setText(
      ui.transport.status,
      meansAreSuppressed(recording)
        ? `AWT suppressed — ${recording.summary.awtInvalidReason ?? 'the queues never settled'}`
        : `AWT ${recording.summary.meanWaitS.toFixed(1)} s · WT95 ${recording.summary.wait95S.toFixed(1)} s`,
    );
  }

  /**
   * Close the shift and file the sheet.
   *
   * The report is built from the **whole** recording rather than from the playhead: a day's account
   * is the day's, and a reader who paused at 09:00 has not made the afternoon not happen.
   */
  function closeShift(): void {
    const recording = state.recording;
    if (recording === undefined || filedRunId === recording.runId) return;
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
    const week = closeDay(state.week, outcome);
    const report = dayReportOf({
      recording,
      observations,
      goals,
      week,
      // The scenario this shift belongs to, not `undefined`. Passing nothing made the sheet say
      // *your own building — nothing is being banked* on the same day the banner cleared a
      // scenario and the rail counted the shift as banked: three panels, two answers.
      contract: contractById(state.week.contractId),
      event,
      dispatcherName: profileById(resources, state.savedDispatchers, state.dispatcherId).name,
      dayStartS: DAY_START_S,
    });
    /*
     * The tab is **not** forced here. `closeShift` is reached two ways — the playhead reaching the
     * end, and the reader opening the sheet — and the second one has already set the tab. Setting
     * it again inside a handler that `openTab` called would be the same write twice, which is how a
     * navigation ends up fighting itself.
     */
    state = { ...state, week, report };
    if (state.tab !== 'report') state = { ...state, tab: 'report' };
    renderAll();
  }

  /* ---------------------------------------------------------------------- *
   * The stage — § 1.3 M3
   * ---------------------------------------------------------------------- */

  function drawStage(): void {
    const recording = state.recording;
    const canvas = ui.stage.canvas;
    const context2d = canvas.getContext('2d');
    if (recording === undefined || playback === undefined || context2d === null) return;

    const box = canvas.parentElement?.getBoundingClientRect();
    const width = Math.max(360, Math.floor(box?.width ?? 800));
    const height = Math.max(260, Math.floor(box?.height ?? 500));
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
    }
    context2d.setTransform(ratio, 0, 0, ratio, 0, 0);

    const frame = playback.frame();
    const wantsOverlay = width >= OVERLAY_MIN_VIEWPORT_PX;
    // SG-15: the filter narrows what is laid out, so the shown bank gets the whole plot width.
    // Everything keyed by floor — queues, landings, locked-out marks — stays whole-building.
    const bank = shaftsForBank(recording.shafts, bankFilter);
    const layout = buildLayout({
      width,
      height,
      floors: recording.floors,
      shafts: bank.shafts,
      gutterRightPx: QUEUE_GUTTER_PX,
      overlayWidthPx: wantsOverlay ? OVERLAY_WIDTH_PX : 0,
    });
    const overlay = overlayAt(recording, frame.simTimeS);
    const assignments: readonly LandingAssignment[] = landingAssignmentsAt(recording, frame.simTimeS);
    const lockedOut: readonly LockedOutLanding[] = lockedOutAt(recording, frame.simTimeS);
    const hits = drawScene(context2d as unknown as Canvas2DLike, {
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
      dayStartS: DAY_START_S,
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
      ...SPEEDS.map((speed) =>
        chip(document, {
          label: `×${String(speed)}`,
          selected: playback?.speed === speed,
          title: `${String(speed)} simulated seconds per real second`,
          onPick: () => {
            playback?.setSpeed(speed);
            drawTransportChrome(viewAt());
          },
        }),
      ),
    );

    const recording = view.recording;
    if (recording === undefined) {
      fill(ui.transport.ticks);
      return;
    }
    const segments = timelineOf(recording);
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
    ui.transport.timeline.setAttribute('aria-valuetext', clockAt(view.simTimeS));
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
          const index = SPEEDS.indexOf((playback?.speed ?? 60) as (typeof SPEEDS)[number]);
          const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, index + (event.key === ']' ? 1 : -1)))];
          if (next !== undefined) playback?.setSpeed(next);
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
  const reasons: string[] = [];
  const flags: string[] = [`--building ${state.buildingId}`, `--dispatcher ${state.dispatcherId}`];

  if (!resources.entries.some((entry) => entry.config.id === state.buildingId)) {
    reasons.push(`the building “${state.buildingId}” is yours alone and data/buildings/ does not ship it`);
  }
  if (!resources.dispatcherProfiles.profiles.some((profile) => profile.id === state.dispatcherId)) {
    reasons.push(
      `the dispatcher “${state.dispatcherId}” is yours alone and data/dispatcher-profiles.json does not ship it`,
    );
  }

  let template: string | undefined;
  if (state.pattern !== 'building') {
    const shipped = resources.trafficProfiles.profiles.find((profile) => profile.id === state.pattern);
    if (shipped === undefined) {
      reasons.push(`the pattern “${state.pattern}” is yours alone and the CLI has no flag that loads a saved pattern`);
    } else {
      flags.push(`--traffic ${shipped.id}`);
      const demand = demandFromSpec(specFromTrafficProfile(resources.trafficProfiles, shipped.id));
      if (demand.demandTemplate !== 'rise-and-fall') template = demand.demandTemplate;
    }
  }

  const event = eventFor(state.week.day, state.week.dayIdx);
  if (state.week.day !== 1 || !event.effect.changesNothing) {
    reasons.push(
      `day ${String(state.week.day)} grows the building and schedules “${event.name}”, and the CLI has no --day`,
    );
  }
  if (state.outOfServiceCarIds.length > 0) {
    reasons.push(
      `${String(state.outOfServiceCarIds.length)} car(s) are held out of service and the CLI has no flag to hold one`,
    );
  }
  if (
    state.levers.parking !== DEFAULT_LEVERS.parking ||
    state.levers.express !== DEFAULT_LEVERS.express ||
    state.levers.dwell !== DEFAULT_LEVERS.dwell
  ) {
    reasons.push('the group levers are moved off their defaults and the CLI has no lever flags');
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
  return { ...state, ...patch, shiftLengthS: patch.shiftLengthS ?? DEFAULT_SHIFT_LENGTH_S };
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
