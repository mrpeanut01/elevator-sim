/**
 * The shell: the shipped, non-test caller of everything this package exports.
 *
 * The roadmap's standing requirement is that a behaviour must name a caller which is not one of its
 * own tests. This file is that caller. Every directory added by the design refactor is reached from
 * here, and the table below is the answer to *"name the non-test caller"* for each of them:
 *
 * | Module | Reached from |
 * |---|---|
 * | `live/bands.ts`, `observations.ts`, `honesty.ts`, `decisions.ts` | `dev/leftRail.ts`, mounted below |
 * | `live/timeline.ts` | {@link drawTransport} and the header clock |
 * | `shift/contracts.ts`, `week.ts`, `goals.ts`, `events.ts`, `growth.ts` | `dev/state.ts`'s `shiftRunConfigOf`, called by {@link runShift} |
 * | `shift/report.ts` | {@link closeShift}, and `dev/reportPanel.ts` |
 * | `authoring/*` | the four editor mounts, and `shiftRunConfigOf` |
 * | `record/decisionLog.ts` | `recordRun`, called by {@link runShift} |
 * | `dev/surfaces.ts` | {@link applyNavigation} |
 * | `frame/overlay.ts` | {@link drawStage} and the landing selector |
 * | `record/document.ts` | **Load recording** and **Verify replay** |
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

import { credentialCapabilityOf } from '../access/dispatcherCredentials.js';
import { lockedOutLandingsAt, type LockedOutLanding } from '../access/lockedOut.js';
import { restrictedFloorIds } from '../access/zoning.js';
import type { VizRecording } from '../contract/types.js';
import { frameSequence, serializeFrames } from '../frame/sequence.js';
import {
  landingAssignmentsAt,
  meansAreSuppressed,
  overlayAt,
  queueAt,
  type LandingAssignment,
} from '../frame/overlay.js';
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
import { readRecordingDocument, verifyReplay } from '../record/document.js';
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
import { isViewMode, itemsIn, type DisclosureItem } from '../mode/types.js';
import { contractById, statLineOf } from '../shift/contracts.js';
import { eventFor } from '../shift/events.js';
import { shiftObservationsOf } from '../shift/observations.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import { dayReportOf } from '../shift/report.js';
import { closeDay, nextDay, outcomeOf } from '../shift/week.js';
import { weekdayOf } from '../shift/types.js';

import { mountBatchPanel } from './batchPanel.js';
import { mountCampaignPanel, type CampaignPanelHandle } from './campaignPanel.js';
import { createLoader } from './bootstrap.js';
import { loadBrowserResources, loadCampaign, type BrowserResources } from './data.js';
import { chip, fill, fillSelect, setHidden, setText, el } from './dom.js';
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

  const clock = systemClock();

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
    applyNavigation();
    const view = viewAt();
    for (const panel of statePanels) panel.render(view);
    leftRail.render(view);
    drawHeader(view);
    drawCoach(view);
    drawFooter(view);
    drawTransportChrome(view);
    drawParity();
    drawStage();
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

    ui.footer.copyRun.addEventListener('click', () => {
      void copyProvenance('copy run', ui.footer.copyRun);
    });
    ui.transport.copyProvenance.addEventListener('click', () => {
      void copyProvenance('Copy provenance', ui.transport.copyProvenance);
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
    const line =
      `--building ${state.buildingId} --dispatcher ${state.dispatcherId} ` +
      `--seed ${state.seed.toString()} --duration ${String(state.shiftLengthS)}`;
    try {
      await navigator.clipboard.writeText(line);
      setText(button, 'copied');
    } catch {
      // A clipboard a browser refuses is not an error the reader caused. Show the line instead.
      setText(ui.transport.status, line);
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
      loop: ui.transport.loop.checked,
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
    const layout = buildLayout({
      width,
      height,
      floors: recording.floors,
      shafts: recording.shafts,
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
    ui.transport.loop.addEventListener('change', () => {
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
    ui.transport.run.addEventListener('click', () => {
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
      const raw = ui.transport.seed.value.trim();
      const seed = raw === '' ? randomSeed() : BigInt(raw.replace(/\D/g, '') || '0');
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
    const blob = new Blob([JSON.stringify({ recording, frames: serializeFrames(frameSequence(recording)) })], {
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
        default:
          break;
      }
    });
    ui.report.nextDay.addEventListener('click', () => {
      state = { ...state, week: nextDay(state.week), report: undefined, tab: 'run' };
      runShift();
    });
    ui.report.back.addEventListener('click', () => {
      context.update({ tab: 'run' });
    });
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

/**
 * Deep links, so a finding can be sent to somebody.
 *
 * `?building&dispatcher&seed&duration&tab&mode` — the same keys the old viewer accepted, plus
 * nothing: a link that named a surface this page had renamed would be a broken promise, and
 * `isTabName` is what refuses one rather than silently opening the first tab.
 */
function applyDeepLink(state: ViewerState, resources: BrowserResources): ViewerState {
  const params = new URLSearchParams(window.location.search);
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
 * The last resort.
 *
 * If `elements()` throws, the page has no error slot to write into — that was the defect that put
 * `MissingElementsError` in `elementMap.ts` — so this prepends one rather than failing silently in
 * a console nobody has open.
 */
void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#e0473a;padding:12px;white-space:pre-wrap;font:12px ui-monospace,monospace';
  pre.textContent = `The viewer did not start.\n\n${message}`;
  document.body.prepend(pre);
});

export { applyDeepLink, randomSeed, SPEEDS };
export type { ViewerState };
