/**
 * The viewer: the shipped, non-test caller of everything this package exports.
 *
 * The roadmap's standing requirement is that a behaviour must name a caller which is not one of
 * its own tests. This file is that caller for the run viewer and the playback transport, and it
 * mounts `dev/editor.ts`, which is that caller for the building editor. Every module added in
 * wave 2 is reached from here:
 *
 * | Module | Reached from |
 * |---|---|
 * | `frame/overlay.ts` | {@link tick}, every animation frame, and the landing selector |
 * | `render/overlay.ts` | `drawScene`, via `SceneInput.overlay` |
 * | `render/describeFrame.ts` | the canvas's `aria-label` and the live region |
 * | `record/document.ts` | **Load recording** (`readRecordingDocument`) and **Verify replay** (`verifyReplay`) |
 * | `editor*.ts` | `dev/editor.ts`, mounted below |
 * | `dev/bootstrap.ts` | {@link main}, which is the only thing that loads `data/` — `RV-17`/`RV-21` |
 * | `dev/motion.ts` | `adopt`, which asks it whether a new recording may start moving — `KB-14` |
 *
 * ## Three surfaces, one page
 *
 * A tablist rather than three documents, because the editor's whole payoff is `ED-04`: a valid
 * edit goes straight to a run without a reload, keeping the seed and the dispatcher the reader
 * had already chosen.
 *
 * The third surface is W4 (`docs/10-experience-layer-contract.md` § 11): the **generated**
 * parameter form, mounted from `dev/parameterForm.ts`. It is also this file's answer to
 * `DECISIONS.md` § D121's open item — `packages/experiments`' browser barrel had no non-test
 * caller, could not have one until W4 existed, and was tracked as `C34`. It has one now, and the
 * chain is `main.ts → dev/parameterForm.ts → controls/controls.ts → @elevator-sim/experiments/browser`.
 */

import {
  SimulationError,
  type AccessZone,
  type BuildingConfig,
  type SimulationConfig,
} from '@elevator-sim/core/browser';

import {
  checkAccessCompatibility,
  credentialCapabilityOf,
} from '../access/dispatcherCredentials.js';
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
import { recordRun } from '../record/recordRun.js';
import { readRecordingDocument, verifyReplay } from '../record/document.js';
import { Playback } from '../playback/playback.js';
import { systemClock } from '../playback/clock.js';
import { buildLayout } from '../render/layout.js';
import {
  drawScene,
  landingOptionLabel,
  type Canvas2DLike,
  type SceneSelection,
} from '../render/canvas.js';
import { describeFrame } from '../render/describeFrame.js';
import { runSummaryFigures } from '../render/runSummary.js';
import { buildingMood, moodObservationsOf, type BuildingMood } from '../render/mood.js';
import { mountEditor } from './editor.js';
import { mountParameterForm } from './parameterForm.js';
import { mountBatchPanel, type BatchPanelElements } from './batchPanel.js';
import {
  mountCampaignPanel,
  type CampaignPanelElements,
  type CampaignPanelHandle,
} from './campaignPanel.js';
import { createLoader } from './bootstrap.js';
import { PREFERRED_VIEWER_DISPATCHERS, preferredDispatcherId } from './defaults.js';
import { shouldAutoplay } from './motion.js';
import { loadBrowserResources, loadCampaign, resolveEdited, type BrowserResources } from './data.js';
import { viewerRunConfig } from './runConfig.js';

/** `PB-T1`: ×1 … ×120, and `[`/`]` step this ladder — `KB-07`. */
const SPEEDS = [1, 2, 5, 10, 30, 60, 120] as const;
/**
 * Width of the right gutter, where the landing counts and U4's rider queues are drawn.
 *
 * `buildLayout`'s own default is 76 px, which is room for `▲12 ▼7` and nothing else. A queue row
 * needs the rest, and how much of it there is decides where § 6.2's degradation bites — so this is
 * the one number in the viewer that turns *"how many riders get their own glyph"* into a property
 * of the window rather than of the building.
 */
const QUEUE_GUTTER_PX = 280;
/** Width reserved for the live metrics panel. Dropped below this viewport width — `RS-03`. */
const OVERLAY_WIDTH_PX = 250;
const OVERLAY_MIN_VIEWPORT_PX = 900;
/** One display frame at 60 Hz, in simulated seconds at the current speed — `KB-06`, `PB-08`. */
const FRAME_S = 1 / 60;

/**
 * The surfaces, in tab order — `D11`, and the `tab` key in the URL.
 *
 * A list rather than a pair of fields. It was a pair until W4 (`docs/10` § 11) added a third
 * surface, and the pair form had the tab machinery written out twice: two `setAttribute` calls,
 * two `tabIndex` assignments, two `hidden` assignments and a hand-written arrow-key table of
 * `[tab, other, which]` triples that only works for exactly two tabs. Three of anything is where
 * that stops being cheaper than a loop.
 */
const TABS = ['viewer', 'editor', 'parameters', 'compare', 'campaign'] as const;
type TabName = (typeof TABS)[number];

const isTabName = (value: string | null): value is TabName =>
  value !== null && (TABS as readonly string[]).includes(value);

interface Elements {
  readonly canvas: HTMLCanvasElement;
  readonly building: HTMLSelectElement;
  readonly dispatcher: HTMLSelectElement;
  readonly duration: HTMLInputElement;
  readonly speed: HTMLSelectElement;
  readonly seed: HTMLInputElement;
  readonly run: HTMLButtonElement;
  readonly verify: HTMLButtonElement;
  readonly copyProvenance: HTMLButtonElement;
  readonly saveRecording: HTMLButtonElement;
  readonly loadRecording: HTMLInputElement;
  readonly bankFilter: HTMLSelectElement;
  readonly landingSelect: HTMLSelectElement;
  readonly exportPng: HTMLButtonElement;
  readonly playPause: HTMLButtonElement;
  readonly stepBack: HTMLButtonElement;
  readonly stepForward: HTMLButtonElement;
  readonly loop: HTMLInputElement;
  readonly scrub: HTMLInputElement;
  readonly status: HTMLElement;
  readonly error: HTMLElement;
  readonly banner: HTMLElement;
  readonly description: HTMLElement;
  /** Where `render/runSummary.ts`'s figures are drawn — `docs/10` § 11 W2. */
  readonly runSummary: HTMLElement;
  /** § 10.3's pre-run compatibility note. Empty when there is nothing to say. */
  readonly accessNote: HTMLElement;
  /** Where `render/mood.ts`'s gauge is drawn — `docs/10` § 6 / D4, W6's U4. */
  readonly mood: HTMLElement;
  /** Tab button and its panel, per surface. Keyed by {@link TabName}, so a fourth is one entry. */
  readonly tabs: Readonly<Record<TabName, HTMLButtonElement>>;
  readonly panels: Readonly<Record<TabName, HTMLElement>>;
  readonly paramSource: HTMLSelectElement;
  readonly paramForm: HTMLElement;
  readonly paramStatus: HTMLElement;
  readonly paramRefusal: HTMLElement;
  /** The Compare surface's controls — `docs/10` § 11 **W3**. */
  readonly batch: BatchPanelElements;
  /** The Campaign surface's controls — `docs/10` § 5, W5. */
  readonly campaign: CampaignPanelElements;
  readonly confirm: HTMLDialogElement;
  readonly confirmMessage: HTMLElement;
  readonly confirmOk: HTMLButtonElement;
  readonly confirmCancel: HTMLButtonElement;
}

function elements(): Elements {
  const find = <T extends HTMLElement>(id: string): T => {
    const node = document.getElementById(id);
    if (node === null) throw new Error(`missing #${id} in index.html`);
    return node as T;
  };
  return {
    canvas: find<HTMLCanvasElement>('stage'),
    building: find<HTMLSelectElement>('building'),
    dispatcher: find<HTMLSelectElement>('dispatcher'),
    duration: find<HTMLInputElement>('duration'),
    speed: find<HTMLSelectElement>('speed'),
    seed: find<HTMLInputElement>('seed'),
    run: find<HTMLButtonElement>('run'),
    verify: find<HTMLButtonElement>('verify'),
    copyProvenance: find<HTMLButtonElement>('copy-provenance'),
    saveRecording: find<HTMLButtonElement>('save-recording'),
    loadRecording: find<HTMLInputElement>('load-recording'),
    bankFilter: find<HTMLSelectElement>('bank-filter'),
    landingSelect: find<HTMLSelectElement>('landing-select'),
    exportPng: find<HTMLButtonElement>('export-png'),
    playPause: find<HTMLButtonElement>('play-pause'),
    stepBack: find<HTMLButtonElement>('step-back'),
    stepForward: find<HTMLButtonElement>('step-forward'),
    loop: find<HTMLInputElement>('loop'),
    scrub: find<HTMLInputElement>('scrub'),
    status: find<HTMLElement>('status'),
    error: find<HTMLElement>('error'),
    banner: find<HTMLElement>('banner'),
    description: find<HTMLElement>('frame-description'),
    runSummary: find<HTMLElement>('run-summary'),
    accessNote: find<HTMLElement>('access-note'),
    mood: find<HTMLElement>('building-mood'),
    tabs: {
      viewer: find<HTMLButtonElement>('tab-viewer'),
      editor: find<HTMLButtonElement>('tab-editor'),
      parameters: find<HTMLButtonElement>('tab-parameters'),
      compare: find<HTMLButtonElement>('tab-compare'),
      campaign: find<HTMLButtonElement>('tab-campaign'),
    },
    panels: {
      viewer: find<HTMLElement>('panel-viewer'),
      editor: find<HTMLElement>('panel-editor'),
      parameters: find<HTMLElement>('panel-parameters'),
      compare: find<HTMLElement>('panel-compare'),
      campaign: find<HTMLElement>('panel-campaign'),
    },
    paramSource: find<HTMLSelectElement>('param-source'),
    paramForm: find<HTMLElement>('param-form'),
    paramStatus: find<HTMLElement>('param-status'),
    paramRefusal: find<HTMLElement>('param-refusal'),
    batch: {
      building: find<HTMLSelectElement>('batch-building'),
      baseline: find<HTMLSelectElement>('batch-baseline'),
      candidate: find<HTMLSelectElement>('batch-candidate'),
      duration: find<HTMLInputElement>('batch-duration'),
      seed: find<HTMLInputElement>('batch-seed'),
      replications: find<HTMLInputElement>('batch-replications'),
      demand: find<HTMLInputElement>('batch-demand'),
      run: find<HTMLButtonElement>('batch-run'),
      cancel: find<HTMLButtonElement>('batch-cancel'),
      progress: find<HTMLProgressElement>('batch-progress'),
      status: find<HTMLElement>('batch-status'),
      error: find<HTMLElement>('batch-error'),
      output: find<HTMLElement>('batch-output'),
    },
    campaign: {
      stage: find<HTMLSelectElement>('campaign-stage'),
      profile: find<HTMLSelectElement>('campaign-profile'),
      run: find<HTMLButtonElement>('campaign-run'),
      cancel: find<HTMLButtonElement>('campaign-cancel'),
      progress: find<HTMLProgressElement>('campaign-progress'),
      status: find<HTMLElement>('campaign-status'),
      error: find<HTMLElement>('campaign-error'),
      brief: find<HTMLElement>('campaign-brief'),
      output: find<HTMLElement>('campaign-output'),
    },
    confirm: find<HTMLDialogElement>('confirm'),
    confirmMessage: find<HTMLElement>('confirm-message'),
    confirmOk: find<HTMLButtonElement>('confirm-ok'),
    confirmCancel: find<HTMLButtonElement>('confirm-cancel'),
  };
}

/** The controls that need something on screen before they mean anything — UX.md § B.3. */
function transportControls(ui: Elements): readonly (HTMLButtonElement | HTMLInputElement)[] {
  return [ui.playPause, ui.stepBack, ui.stepForward, ui.scrub, ui.exportPng];
}

/**
 * `RV-17` — say what failed, and offer a Retry that refetches without a page reload (`RV-21`).
 *
 * The message is `data.ts`'s, which names the path in every failure mode. This function is only
 * responsible for putting it where the reader is, moving focus to it (`KB-11`), and making the
 * second failure as visible as the first.
 */
function showLoadFailure(ui: Elements, error: unknown, retry: () => Promise<boolean>): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Retry';
  button.addEventListener('click', () => {
    ui.error.textContent = '';
    ui.status.textContent = 'loading data…';
    retry().catch((failure: unknown) => {
      // Only reachable if `boot` itself throws. It used to reach nothing at all: the retry ran
      // inside a floating `async` IIFE, so the page cleared its own error message and then died
      // in silence. See `bootstrap.ts`.
      ui.error.textContent = `the viewer failed to start after loading data/: ${message(failure)}`;
      ui.error.focus();
    });
  });
  ui.error.replaceChildren(`could not load data/: ${message(error)} `, button);
  ui.error.focus();
}

async function main(): Promise<void> {
  const ui = elements();
  ui.status.textContent = 'loading data…';
  // Nothing is playable until `data/` has loaded — UX.md § B.3's empty state. `boot` re-enables
  // them once there is a recording; a failed load must not leave five live-looking controls
  // wired to nothing, which is what `RV-17` shipped with.
  for (const control of transportControls(ui)) control.disabled = true;

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

function boot(ui: Elements, resources: BrowserResources): void {
  for (const building of resources.buildings) {
    ui.building.append(new Option(`${building.name} (${building.id})`, building.id));
  }
  for (const profile of resources.dispatcherProfiles.profiles) {
    ui.dispatcher.append(new Option(profile.id, profile.id));
  }
  /*
   * The opening dispatcher, chosen rather than inherited from `data/`'s file order.
   *
   * `docs/10-experience-layer-contract.md` § 14 item 4, and the reason is measured in
   * `docs/07-handoff.md` § 4: `nearest-car` is *"the **only** profile that saturates"* at the
   * benchmark operating points, and that document recommends `collective` or `eta` as the
   * reference arm instead. It is first in `data/dispatcher-profiles.json`, so before this line
   * the viewer opened on it by accident of file order and the newcomer's first run was the worst
   * one available.
   *
   * A preference list rather than one id, and a fallback to whatever `data/` lists first, so this
   * cannot break the viewer if a profile is renamed — the URL's `dispatcher` parameter is applied
   * after this and still wins.
   *
   * The list itself moved to `dev/defaults.ts` in wave 9 (T73), because it lived here for a whole
   * wave with **no test at all**: § D134 chose it and nothing would have noticed it being chosen
   * back. `dev/defaults.test.ts` now pins it, and this is its named non-test caller.
   */
  const preferred = preferredDispatcherId(
    PREFERRED_VIEWER_DISPATCHERS,
    resources.dispatcherProfiles.profiles,
  );
  if (preferred !== undefined) ui.dispatcher.value = preferred;
  for (const speed of SPEEDS) {
    ui.speed.append(new Option(`×${String(speed)}`, String(speed)));
  }
  ui.speed.value = '10';

  let playback: Playback | undefined;
  let recording: VizRecording | undefined;
  let lastConfig: SimulationConfig | undefined;
  /** A building the editor handed over, outside `data/`. */
  let adhocBuilding: BuildingConfig | undefined;
  let selection: SceneSelection | undefined;
  /**
   * {@link LandingAssignment.key} of the selected call, or `undefined`.
   *
   * Not `selection.floorId`: under a landing panel one floor carries one row per
   * (destination, promised car), so a floor id no longer identifies what the reader picked.
   */
  let selectionKey: string | undefined;
  let assignments: readonly LandingAssignment[] = [];
  let lastDescription = '';
  /**
   * Identity of the option set currently in the landing selector, so it is not rebuilt blindly.
   *
   * The sentinel is not the empty string: an empty assignment list *also* keys to the empty
   * string, so starting there made the very first repopulate look like a no-op and left
   * `index.html`'s placeholder option in place for the whole run. Found by driving the viewer,
   * where the landing selector offered exactly one choice and `RV-T3` was unreachable through
   * the UI it shipped with.
   */
  const NO_OPTIONS_YET = 'not-populated-yet';
  let landingOptionsKey = NO_OPTIONS_YET;

  /* ------------------------------------------------------------------ *
   * Deep link — RV-03, and RV-02's "previous run's seed preserved"
   * ------------------------------------------------------------------ */

  const params = new URLSearchParams(window.location.search);
  applyParam(ui.building, params.get('building'));
  applyParam(ui.dispatcher, params.get('dispatcher'));
  if (params.get('seed') !== null) ui.seed.value = params.get('seed') ?? '';
  if (params.get('duration') !== null) ui.duration.value = params.get('duration') ?? '900';
  if (params.get('speed') !== null) applyParam(ui.speed, params.get('speed'));
  /**
   * Which surface is on screen — `D11`, and the sixth key in the URL.
   *
   * `syncUrl` wrote five keys and not this one, so `selectTab` never recorded where the reader
   * was: a deep link could name a building and a seed and still always open on the viewer, and a
   * reload from the editor came back to the viewer. Held here rather than read back off
   * `aria-selected`, so there is one answer to "which tab" rather than a DOM attribute and a URL
   * that can drift.
   */
  let currentTab: TabName = isTabName(params.get('tab')) ? (params.get('tab') as TabName) : 'viewer';

  function syncUrl(): void {
    const next = new URLSearchParams({
      building: ui.building.value,
      dispatcher: ui.dispatcher.value,
      seed: ui.seed.value,
      duration: ui.duration.value,
      speed: ui.speed.value,
      tab: currentTab,
    });
    window.history.replaceState(null, '', `?${next.toString()}`);
  }

  /* ------------------------------------------------------------------ *
   * Access zoning — docs/10 § 10.3 and § 10.4
   * ------------------------------------------------------------------ */

  /**
   * What the *current* recording needs in order to be asked about lockouts.
   *
   * Two facts, both about things outside the recording: which of its floors sit in an access
   * zone (a property of the **building**), and whether the profile that ran it forwards the
   * credential (a property of the **dispatcher**). `access/lockedOut.ts` says why they are not
   * fields on the contract, and what silence means when they are unknown: an empty list, and no
   * claim. That is the state a recording loaded from a file for a building this build does not
   * ship arrives in.
   */
  let access: { restrictedFloorIds: readonly string[]; carriesCredential: boolean } = {
    restrictedFloorIds: [],
    carriesCredential: false,
  };

  /** The building on screen: the edited document if there is one, otherwise the shipped entry. */
  function currentBuilding(): { name: string; floorIds: readonly string[]; accessZones: readonly AccessZone[] } | undefined {
    if (adhocBuilding !== undefined) {
      try {
        const edited = resolveEdited(resources, adhocBuilding);
        return {
          name: edited.name,
          floorIds: edited.floors.map((floor) => floor.id),
          accessZones: edited.accessZones,
        };
      } catch {
        // An invalid edit has no access zoning to report on. The editor's own validation panel is
        // where that is said; repeating it here would be a second opinion about legality.
        return undefined;
      }
    }
    const shipped = resources.buildings.find((candidate) => candidate.id === ui.building.value);
    return shipped === undefined
      ? undefined
      : {
          name: shipped.name,
          floorIds: shipped.floors.map((floor) => floor.id),
          accessZones: shipped.accessZones,
        };
  }

  /**
   * The same two facts, for a recording that arrived from a **file** rather than from a run.
   *
   * By id, because that is all a loaded recording carries. Unknown either way is the honest
   * empty answer — see {@link access}.
   */
  function accessForIds(
    buildingId: string,
    dispatcherProfileId: string,
  ): { restrictedFloorIds: readonly string[]; carriesCredential: boolean } {
    const shipped = resources.buildings.find((candidate) => candidate.id === buildingId);
    const profile = resources.dispatcherProfiles.profiles.find(
      (candidate) => candidate.id === dispatcherProfileId,
    );
    if (shipped === undefined || profile === undefined) {
      return { restrictedFloorIds: [], carriesCredential: false };
    }
    return {
      restrictedFloorIds: restrictedFloorIds(
        shipped.floors.map((floor) => floor.id),
        shipped.accessZones,
      ),
      carriesCredential: credentialCapabilityOf(profile).carriesCredential,
    };
  }

  /**
   * § 10.3, before **Run** — the highest-value item in U8.
   *
   * Recomputed on every change to either selector, so a reader who switches from
   * `destination-eta` to `nearest-car` on Secure Tower sees the note appear without pressing
   * anything. It is a `role="status"`, not an alert, and it never disables **Run**.
   */
  function renderAccessNote(): void {
    const building = currentBuilding();
    const profile = resources.dispatcherProfiles.profiles.find(
      (candidate) => candidate.id === ui.dispatcher.value,
    );
    if (building === undefined || profile === undefined) {
      ui.accessNote.textContent = '';
      return;
    }
    ui.accessNote.textContent =
      checkAccessCompatibility({
        buildingName: building.name,
        floorIds: building.floorIds,
        accessZones: building.accessZones,
        profile,
        profiles: resources.dispatcherProfiles.profiles,
      }).warning ?? '';
  }

  function fail(text: string): void {
    // KB-11: focus moves to the message so it is announced, and so the reader is at the control
    // that needs changing rather than wherever they pressed.
    ui.error.textContent = text;
    ui.error.focus();
  }

  function clearError(): void {
    ui.error.textContent = '';
  }

  /* ------------------------------------------------------------------ *
   * Running
   * ------------------------------------------------------------------ */

  function runOnce(): void {
    const resolvedBuilding = resources.buildings.find(
      (candidate) => candidate.id === ui.building.value,
    );
    const dispatcherProfile = resources.dispatcherProfiles.profiles.find(
      (candidate) => candidate.id === ui.dispatcher.value,
    );
    if (dispatcherProfile === undefined) {
      fail('pick a dispatcher first.');
      return;
    }
    const building = adhocBuilding === undefined ? resolvedBuilding : undefined;
    const adhoc = adhocBuilding;
    if (building === undefined && adhoc === undefined) {
      fail('pick a building first.');
      return;
    }

    const seedText = ui.seed.value.trim();
    let seed: bigint;
    try {
      seed = seedText === '' ? randomSeed() : BigInt(seedText);
    } catch {
      fail(`"${seedText}" is not a whole number; a seed must be one.`);
      return;
    }
    // RV-02: the seed is written back before the run, so pressing Run again after changing the
    // dispatcher compares like with like rather than drawing a fresh seed.
    ui.seed.value = seed.toString();

    const durationS = Number(ui.duration.value);
    if (!Number.isFinite(durationS) || durationS <= 0) {
      fail('duration must be a positive number of simulated seconds.');
      return;
    }

    let resolved = building;
    if (adhoc !== undefined) {
      try {
        resolved = resolveEdited(resources, adhoc);
      } catch (error) {
        fail(`the edited building could not be resolved: ${message(error)}`);
        return;
      }
    }
    if (resolved === undefined) {
      fail('pick a building first.');
      return;
    }

    // `viewerRunConfig` is where *what a viewer run is* is decided, including the
    // `dispatcherProfiles` file that lets a profile opt into a weight-set selector as data.
    const config: SimulationConfig = viewerRunConfig(resources, {
      building: resolved,
      dispatcherProfile,
      seed,
      durationS,
    });

    ui.status.textContent = `simulating ${resolved.name} for ${String(durationS)} s — this blocks the page for about a second…`;
    lastConfig = config;
    // Captured from the run's *own* inputs rather than looked up afterwards by id: an edited
    // building has no entry in `resources` to look up, and this is the one path that holds both
    // the resolved building and the profile that ran it.
    access = {
      restrictedFloorIds: restrictedFloorIds(
        resolved.floors.map((floor) => floor.id),
        resolved.accessZones,
      ),
      carriesCredential: credentialCapabilityOf(dispatcherProfile).carriesCredential,
    };
    clearError();
    try {
      recording = recordRun(config).recording;
    } catch (error) {
      recording = undefined;
      playback = undefined;
      fail(
        error instanceof SimulationError
          ? `the simulation refused to report this run (seed ${seed.toString()}): ${error.message}`
          : `run failed (seed ${seed.toString()}): ${message(error)}`,
      );
      ui.status.textContent = 'no run on screen.';
      syncTransport();
      return;
    }
    adopt(recording);
    syncUrl();
  }

  /** Put a recording on screen, from a run or from a file. */
  function adopt(next: VizRecording): void {
    recording = next;
    selection = undefined;
    selectionKey = undefined;
    playback = new Playback(next, systemClock(), {
      speed: Number(ui.speed.value),
      // KB-14: a reader who has asked for reduced motion gets the first frame and a Play button,
      // not a building that starts moving on its own. The decision is `motion.ts`'s, so it can be
      // asserted without an operating system that has the preference switched on.
      autoplay: shouldAutoplay((query) => window.matchMedia(query)),
      loop: ui.loop.checked,
    });
    ui.playPause.textContent = playback.state === 'playing' ? 'Pause' : 'Play';
    ui.status.textContent = statusLine(next);
    ui.banner.textContent = `${next.buildingName} · ${next.dispatcherProfileId} · seed ${next.seed}`;
    // `docs/10` § 11 W2's non-test caller. Drawn on adoption rather than in {@link tick}: every
    // figure is a property of the whole run, so redrawing them at 60 Hz would cost a DOM rebuild
    // per frame to display numbers that cannot have changed.
    drawRunSummary(ui.runSummary, next);
    populateBankFilter(next);
    landingOptionsKey = NO_OPTIONS_YET;
    populateLandings(next, next.startedAt);
    syncTransport();
  }

  /**
   * The transport follows the recording — UX.md § B.3's empty state.
   *
   * A function declaration, and called from {@link adopt} rather than hung off the **Run**
   * button's click, because the click was not the only way a recording arrives. `ED-04` hands one
   * over from the editor without any click on **Run**, so after a failed run — which disables
   * these five — *"Run this building"* put a run on screen that could not be paused, stepped,
   * scrubbed or exported. Found while verifying `RV-11`, which is reached through exactly that
   * door.
   */
  function syncTransport(): void {
    for (const control of transportControls(ui)) control.disabled = recording === undefined;
  }

  function populateBankFilter(next: VizRecording): void {
    const banks = [...new Set(next.shafts.map((shaft) => shaft.bankId))].sort((a, b) =>
      a.localeCompare(b),
    );
    ui.bankFilter.replaceChildren(new Option('all banks', ''));
    for (const bank of banks) ui.bankFilter.append(new Option(bank, bank));
    ui.bankFilter.disabled = banks.length < 2;
  }

  /**
   * Rebuild the landing selector from the assignments now in force.
   *
   * Rebuilt as playback advances rather than once at load, because "which landings have somebody
   * standing at them" is a property of the *instant*. The first version of this populated the
   * list at `startedAt`, where nobody is waiting yet, so the control offered exactly one option —
   * "none" — for the whole run and `RV-T3` was unreachable through the UI it shipped with.
   *
   * Skipped when the option set is unchanged, so the reader's open dropdown is not rebuilt under
   * their cursor sixty times a second.
   */
  function populateLandings(next: VizRecording, at: number): void {
    assignments = landingAssignmentsAt(next, at);
    const wanted = assignments
      .map((assignment) => `${assignment.key} ${String(assignment.waiting)}`)
      .join('|');
    if (wanted === landingOptionsKey) return;
    landingOptionsKey = wanted;
    const chosen = ui.landingSelect.value;
    ui.landingSelect.replaceChildren(new Option('no landing selected', ''));
    for (const assignment of assignments) {
      ui.landingSelect.append(new Option(landingOptionLabel(assignment), assignment.key));
    }
    if (assignments.some((assignment) => assignment.key === chosen)) {
      ui.landingSelect.value = chosen;
    }
    ui.landingSelect.disabled = assignments.length === 0;
  }

  /**
   * The whole of a call, handed to the renderer.
   *
   * Every field is copied rather than a subset chosen per model: the renderer decides what a
   * `destination-dispatch` selection reads like, and a caller that filtered here would be a
   * second opinion about the same question.
   */
  function selectionOf(assignment: LandingAssignment): SceneSelection {
    return {
      floorId: assignment.floorId,
      answeredByCarId: assignment.answeredByCarId,
      answeredInS: assignment.answeredInS,
      waiting: assignment.waiting,
      oldestWaitS: assignment.oldestWaitS,
      destinationFloorId: assignment.destinationFloorId,
      promisedCarId: assignment.promisedCarId,
    };
  }

  /* ------------------------------------------------------------------ *
   * Verify, save, load — PB-05, PB-07, PB-15, PB-16, PB-17
   * ------------------------------------------------------------------ */

  function verifyReplayControl(): void {
    if (recording === undefined || lastConfig === undefined) {
      fail('run something first, then verify it replays.');
      return;
    }
    const options = { fps: 30, speed: 10 } as const;
    const stored = JSON.parse(JSON.stringify(recording)) as VizRecording;
    const original = serializeFrames(frameSequence(stored, options));
    let fresh: VizRecording;
    try {
      fresh = recordRun(lastConfig).recording;
    } catch (error) {
      fail(`replay failed: ${message(error)}`);
      return;
    }
    const verdict = verifyReplay(stored, fresh);
    const framesMatch = serializeFrames(frameSequence(fresh, options)) === original;
    const frames = frameSequence(stored, options).length;
    if (verdict.matches && framesMatch) {
      clearError();
      ui.status.textContent = `replay verified — ${String(frames)} frames identical from seed ${stored.seed} (fingerprint ${verdict.storedFingerprint})`;
      return;
    }
    // PB-16: named fingerprints, and the stored recording stays on screen.
    fail(
      framesMatch
        ? `${verdict.message} (the frame sequences matched but the recordings did not)`
        : verdict.message,
    );
  }

  function saveRecording(): void {
    if (recording === undefined) {
      fail('run something first, then save it.');
      return;
    }
    const blob = new Blob([JSON.stringify(recording)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${recording.buildingId}-${recording.seed}.viz.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    ui.status.textContent = `saved ${anchor.download} (schema ${String(recording.schemaVersion)})`;
  }

  ui.loadRecording.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;
    void file.text().then((text) => {
      const result = readRecordingDocument(text);
      if (!result.ok) {
        // PB-15/17/18: the previous run stays on screen and another file can be chosen without
        // a page reload — the input is not disabled and nothing was torn down.
        const failure = result.failure;
        fail(
          failure.kind === 'parse'
            ? `${file.name} is not valid JSON: ${failure.message}${failure.position === undefined ? '' : ` (byte ${String(failure.position)})`}`
            : `${file.name}: ${failure.message}`,
        );
        return;
      }
      clearError();
      lastConfig = undefined; // a loaded recording cannot be re-simulated without its config
      // The loaded recording names a building and a dispatcher by id. If this build ships both,
      // the lockout question can be asked; if it does not, `access` goes empty and the viewer
      // makes no claim rather than an inferred one.
      access = accessForIds(result.recording.buildingId, result.recording.dispatcherProfileId);
      adopt(result.recording);
      ui.status.textContent = `loaded ${file.name} — ${statusLine(result.recording)}`;
    });
  });

  function copyProvenance(): void {
    if (recording === undefined) {
      fail('run something first, then copy its provenance.');
      return;
    }
    // RV-T7: the form the CLI accepts, so a reviewer can paste it into a shell.
    const line =
      `npm run sim -- run --building ${recording.buildingId} --dispatcher ${recording.dispatcherProfileId}` +
      ` --seed ${recording.seed} --duration ${String(Math.round(recording.endedAt - recording.startedAt))}`;
    void navigator.clipboard
      .writeText(line)
      .then(() => {
        ui.status.textContent = `copied: ${line}`;
      })
      .catch(() => {
        // Clipboard permission is not guaranteed; showing the line is the fallback that works.
        ui.status.textContent = `could not use the clipboard. Copy this: ${line}`;
      });
  }

  function exportPng(): void {
    if (recording === undefined) {
      fail('run something first, then export it.');
      return;
    }
    // RS-08: the seed and the clock are already burned into the header the canvas drew, so the
    // exported bitmap carries its own provenance.
    const url = ui.canvas.toDataURL('image/png');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${recording.buildingId}-${recording.seed}-${Math.round(playback?.simTimeS ?? 0)}s.png`;
    anchor.click();
    ui.status.textContent = `exported ${anchor.download}`;
  }

  /* ------------------------------------------------------------------ *
   * Transport
   * ------------------------------------------------------------------ */

  function togglePlay(): void {
    playback?.toggle();
    ui.playPause.textContent = playback?.state === 'playing' ? 'Pause' : 'Play';
  }

  /** One display frame at the current speed — `PB-08`, `KB-06`. Pauses first, as the row says. */
  function stepFrame(direction: 1 | -1): void {
    if (playback === undefined) return;
    playback.pause();
    ui.playPause.textContent = 'Play';
    playback.seekBy(direction * FRAME_S * playback.speed);
  }

  function stepSpeed(direction: 1 | -1): void {
    const index = SPEEDS.indexOf(Number(ui.speed.value) as (typeof SPEEDS)[number]);
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, index + direction))];
    if (next === undefined) return;
    ui.speed.value = String(next);
    playback?.setSpeed(next);
    syncUrl();
  }

  ui.run.addEventListener('click', runOnce);
  ui.verify.addEventListener('click', verifyReplayControl);
  ui.copyProvenance.addEventListener('click', copyProvenance);
  ui.saveRecording.addEventListener('click', saveRecording);
  ui.exportPng.addEventListener('click', exportPng);
  ui.playPause.addEventListener('click', togglePlay);
  ui.stepForward.addEventListener('click', () => {
    stepFrame(1);
  });
  ui.stepBack.addEventListener('click', () => {
    stepFrame(-1);
  });
  ui.speed.addEventListener('change', () => {
    playback?.setSpeed(Number(ui.speed.value));
    syncUrl();
  });
  ui.loop.addEventListener('change', () => {
    // `Playback` takes `loop` at construction, so the setting is applied by re-anchoring a new
    // transport at the current instant rather than by adding a mutable flag to the transport.
    if (recording === undefined || playback === undefined) return;
    const at = playback.simTimeS;
    const wasPlaying = playback.state === 'playing';
    playback = new Playback(recording, systemClock(), {
      speed: playback.speed,
      startAtS: at,
      autoplay: wasPlaying,
      loop: ui.loop.checked,
    });
  });
  ui.scrub.addEventListener('input', () => {
    playback?.seekToProgress(Number(ui.scrub.value) / 1000);
  });
  ui.building.addEventListener('change', () => {
    adhocBuilding = undefined;
    syncUrl();
    renderAccessNote();
  });
  ui.dispatcher.addEventListener('change', () => {
    syncUrl();
    renderAccessNote();
    // Both surfaces, because § 10.3's note is a fact about the *pairing* and the two halves of it
    // are chosen on different screens.
    editor.dispatcherChanged();
  });
  ui.landingSelect.addEventListener('change', () => {
    selection = undefined;
    selectionKey = undefined;
    const key = ui.landingSelect.value;
    if (key === '') return;
    const assignment = assignments.find((candidate) => candidate.key === key);
    if (assignment === undefined) return;
    selectionKey = assignment.key;
    selection = selectionOf(assignment);
  });

  // KB-03/04/05/06/07 — and KB-08: never while a field has focus.
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    // The transport shortcuts belong to the viewer. Any other surface being on screen disables
    // them, so `[`/`]` on the Compare tab does not silently re-speed a playhead nobody can see.
    if (ui.panels.viewer.hidden) return;
    if (playback === undefined) return;
    switch (event.key) {
      case ' ':
        event.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        playback.seekBy(event.shiftKey ? 60 : 5);
        break;
      case 'ArrowLeft':
        playback.seekBy(event.shiftKey ? -60 : -5);
        break;
      case 'Home':
        playback.reset();
        ui.playPause.textContent = 'Play';
        break;
      case 'End':
        playback.seekTo(playback.recording.endedAt);
        break;
      case ',':
        stepFrame(-1);
        break;
      case '.':
        stepFrame(1);
        break;
      case '[':
        stepSpeed(-1);
        break;
      case ']':
        stepSpeed(1);
        break;
      default:
        break;
    }
  });

  /* ------------------------------------------------------------------ *
   * Tabs — KB-01 (roving tabindex, arrow keys)
   * ------------------------------------------------------------------ */

  function selectTab(which: TabName): void {
    currentTab = which;
    for (const name of TABS) {
      const selected = name === which;
      ui.tabs[name].setAttribute('aria-selected', String(selected));
      ui.tabs[name].tabIndex = selected ? 0 : -1;
      ui.panels[name].hidden = !selected;
    }
    if (which === 'editor') {
      // `D11`: one building across the panes. Declines to act on an unsaved edit — see
      // `EditorHandle.showBuilding`.
      editor.showBuilding(ui.building.value);
      editor.refresh();
    }
    // `D11` again, one surface further along: a batch opened after several single runs should be
    // about the building and the seed the reader was just looking at. Once per session, so it
    // never overwrites a choice they made on this panel.
    if (which === 'compare') batch.prefill();
    if (which === 'campaign') campaign?.refresh();
    syncUrl();
  }

  for (const [index, name] of TABS.entries()) {
    ui.tabs[name].addEventListener('click', () => {
      selectTab(name);
    });
    // `KB-01`: arrow keys move along the tablist and wrap, which is the roving-tabindex pattern.
    // Wrapping arithmetic rather than a hand-written neighbour table, because the table only ever
    // worked for exactly two tabs and would have had to be rewritten for the third.
    ui.tabs[name].addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = TABS[(index + step + TABS.length) % TABS.length] ?? 'viewer';
      selectTab(next);
      ui.tabs[next].focus();
    });
  }

  /* ------------------------------------------------------------------ *
   * The editor — ED-04 hands a building back to the viewer
   * ------------------------------------------------------------------ */

  const editor = mountEditor({
    resources,
    // `D11`: the editor opens on the building the URL and the viewer already name, not on
    // whatever `data/` happens to list first.
    initialBuildingId: ui.building.value,
    // § 10.3's other half. Read at render time, not captured, so the editor always asks about the
    // profile the viewer names *now*.
    currentDispatcherId: () => ui.dispatcher.value,
    onOpen: (buildingId) => {
      applyParam(ui.building, buildingId);
      // A shipped building was chosen, so the ad-hoc document the editor may have handed over
      // earlier is no longer what Run means.
      adhocBuilding = undefined;
      syncUrl();
      renderAccessNote();
    },
    onRun: (building) => {
      adhocBuilding = building;
      // Before `runOnce`, so a reader who authors an access zone in the editor and presses
      // **Run this building** with a conventional dispatcher selected reads the note on arrival
      // rather than after the run has already failed — `docs/10` § 11 W8's third acceptance case.
      renderAccessNote();
      selectTab('viewer');
      ui.tabs.viewer.focus();
      runOnce();
    },
    /**
     * A modal question. Resolves `true` to proceed — `KB-12`.
     *
     * `<dialog>.showModal()` gives the focus trap and the focus restore for nothing, which is why
     * it is used rather than a hand-built overlay. What it does **not** give reliably is the
     * `close` event: in the automation context this was driven through, a form submit closed the
     * dialog and set `returnValue` without firing `close` at all, so a promise waiting only on
     * that event never settled and every confirm flow hung silently — the worst possible failure
     * for a dialog, because the page looks fine and one code path simply stops.
     *
     * So the outcome is taken from whichever of four signals arrives first, and a latch makes the
     * promise settle exactly once. That is not defensive padding; it is the difference between a
     * dialog that works in one browser and one that works.
     */
    confirm: (text, okLabel) =>
      new Promise<boolean>((resolve) => {
        ui.confirmMessage.textContent = text;
        // The affirmative button says what it does. It said "Discard" for every question, which
        // on "Open it anyway?" was simply the wrong verb.
        ui.confirmOk.textContent = okLabel;

        let settled = false;
        const finish = (value: boolean): void => {
          if (settled) return;
          settled = true;
          ui.confirm.removeEventListener('close', onClose);
          ui.confirm.removeEventListener('cancel', onCancel);
          ui.confirmOk.removeEventListener('click', onOk);
          ui.confirmCancel.removeEventListener('click', onCancel);
          if (ui.confirm.open) ui.confirm.close();
          resolve(value);
        };
        const onClose = (): void => {
          finish(ui.confirm.returnValue === 'ok');
        };
        const onCancel = (): void => {
          finish(false);
        };
        const onOk = (): void => {
          finish(true);
        };

        ui.confirm.addEventListener('close', onClose);
        ui.confirm.addEventListener('cancel', onCancel); // Escape
        ui.confirmOk.addEventListener('click', onOk);
        ui.confirmCancel.addEventListener('click', onCancel);
        ui.confirm.showModal();
      }),
  });

  /* ------------------------------------------------------------------ *
   * The generated parameter form — docs/10 § 11 W4
   *
   * Mounted unconditionally rather than lazily on the tab switch, so that a schema that fails to
   * collect is reported on the first paint rather than on the first visit. Two of the ten shipped
   * schemas do fail, for stated reasons, and the form draws the reason.
   * ------------------------------------------------------------------ */

  mountParameterForm({
    container: ui.paramForm,
    picker: ui.paramSource,
    status: ui.paramStatus,
    refusal: ui.paramRefusal,
  });

  /* ------------------------------------------------------------------ *
   * The replication batch — docs/10 § 11 W3, and this file is its named non-test caller.
   *
   * The chain is `main.ts → dev/batchPanel.ts → dev/batchWorker.ts → batch/runBatch.ts`, with
   * `batch/report.ts` called back on this thread once the worker returns. Mounted here rather
   * than lazily for the same reason the parameter form is: a panel that fails to build should
   * say so on the first paint, not on the first visit.
   * ------------------------------------------------------------------ */

  const batch = mountBatchPanel({
    resources,
    elements: ui.batch,
    inherit: () => ({
      buildingId: ui.building.value,
      seed: ui.seed.value,
      durationS: ui.duration.value,
    }),
  });

  /* ------------------------------------------------------------------ *
   * The campaign — docs/10 § 5, W5, and this file is its named non-test caller.
   *
   * `main.ts → dev/campaignPanel.ts → dev/batchWorker.ts → batch/runBatch.ts`, with
   * `campaign/judge.ts` and `campaign/failStates.ts` called back on this thread.
   *
   * Loaded asynchronously and mounted when it arrives, because it fetches two more files —
   * `data/campaign.json` and `data/scenario-goals.json` — and the other four surfaces must not
   * wait on them. A failure is drawn where the reader is (`RV-17`'s rule, one panel over) rather
   * than thrown into the console: a campaign whose goal table does not validate is exactly the
   * case that must say so.
   * ------------------------------------------------------------------ */

  let campaign: CampaignPanelHandle | undefined;
  loadCampaign(resources)
    .then((loaded) => {
      campaign = mountCampaignPanel({ resources, loaded, elements: ui.campaign });
    })
    .catch((error: unknown) => {
      ui.campaign.error.textContent = `the campaign could not be loaded: ${message(error)}`;
    });

  // `D11`: `?tab=editor` survives a reload, and opens on the building the URL names. After the
  // mount, because `selectTab('editor')` hands the building over to the editor.
  if (currentTab !== 'viewer') selectTab(currentTab);

  // ED-23: warned before navigation, and only when there is something to lose.
  window.addEventListener('beforeunload', (event) => {
    if (!editor.isDirty()) return;
    event.preventDefault();
  });

  /* ------------------------------------------------------------------ *
   * The draw loop
   * ------------------------------------------------------------------ */

  const ctx = ui.canvas.getContext('2d');
  if (ctx === null) {
    // RV-19: explained in text, not thrown into the console.
    ui.status.textContent =
      'this browser has no 2D canvas context, so the building cannot be drawn. The run still works and the frame description below is produced.';
    return;
  }
  // `CanvasRenderingContext2D.fillStyle` is `string | CanvasGradient | CanvasPattern`, which is
  // wider than `Canvas2DLike`'s `string`. The narrowing is sound in the direction it is used —
  // the renderer only ever *writes* strings, never reads a style back — and it is what keeps
  // `render/canvas.ts` free of DOM types and therefore testable under Node.
  const surface = ctx as unknown as Canvas2DLike;

  let landingRefreshAt = -Infinity;

  const tick = (): void => {
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = ui.canvas.clientWidth;
    const cssHeight = ui.canvas.clientHeight;
    // Both dimensions are checked. Testing width alone leaves a stale backing store when only
    // the height changes — which it does the moment the status line wraps to a second row, and
    // the symptom is the previous frame surviving below the new one.
    const backingWidth = Math.round(cssWidth * ratio);
    const backingHeight = Math.round(cssHeight * ratio);
    if (ui.canvas.width !== backingWidth || ui.canvas.height !== backingHeight) {
      ui.canvas.width = backingWidth;
      ui.canvas.height = backingHeight;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (playback !== undefined && recording !== undefined && !ui.panels.viewer.hidden) {
      const frame = playback.frame();
      const bank = ui.bankFilter.value;
      // RV-06: a bank filter, applied to the *layout* rather than to the frame, so the cars that
      // are hidden are hidden from the picture and not from the metrics.
      const shafts =
        bank === '' ? recording.shafts : recording.shafts.filter((shaft) => shaft.bankId === bank);
      const wantsOverlay = cssWidth >= OVERLAY_MIN_VIEWPORT_PX;
      const layout = buildLayout({
        width: cssWidth,
        height: cssHeight,
        floors: recording.floors,
        shafts,
        // U4's rider queues live in the right gutter, so it is widened to make room for them —
        // and it is the *width* that decides how many riders get an individual glyph before the
        // row degrades to `+N` (`docs/10` § 6.2). A narrow window is therefore not a broken
        // picture; it is the same picture, aggregated sooner.
        gutterRightPx: QUEUE_GUTTER_PX,
        overlayWidthPx: wantsOverlay ? OVERLAY_WIDTH_PX : 0,
      });
      // The assignments are refreshed *before* the draw, not after it, because `D10` makes them
      // an input to the picture rather than only to the landing `<select>`. Drawing first left
      // the first frame after a run marked from the assignment list of `startedAt`.
      if (frame.simTimeS - landingRefreshAt > 1 || frame.simTimeS < landingRefreshAt) {
        landingRefreshAt = frame.simTimeS;
        // Only while the reader is not holding the control open, for KB-10's reason.
        if (document.activeElement === ui.landingSelect) {
          assignments = landingAssignmentsAt(recording, frame.simTimeS);
        } else {
          populateLandings(recording, frame.simTimeS);
        }
        if (selection !== undefined) {
          const fresh = assignments.find((candidate) => candidate.key === selectionKey);
          selection =
            fresh === undefined ? { floorId: selection.floorId, waiting: 0 } : selectionOf(fresh);
        }
      }

      const metrics = overlayAt(recording, frame.simTimeS);
      const unanswered = unansweredCallFloors(recording, assignments);
      // `docs/10` § 10.4's non-test caller. Recomputed per frame like the assignments are,
      // because *"who is standing at a locked-out landing right now"* is a property of the
      // instant, and it costs one pass over `legs` — the same scan `overlayAt` already makes.
      const lockedOut: readonly LockedOutLanding[] = lockedOutLandingsAt({
        recording,
        at: frame.simTimeS,
        restrictedFloorIds: access.restrictedFloorIds,
        carriesCredential: access.carriesCredential,
      });
      // U4 and D4, every frame. Measured with the rendering in place rather than assumed from
      // § 2.5's 0.02–0.07 ms for the sibling selector — see the delivery report for the figure.
      const queues = queueAt(recording, frame.simTimeS);
      const mood = buildingMood(moodObservationsOf(recording, queues, frame.simTimeS));
      drawScene(surface, {
        recording,
        frame,
        layout,
        overlay: wantsOverlay ? metrics : undefined,
        selection,
        unservedFloorIds: unservedFloors(recording),
        unansweredCallFloorIds: unanswered,
        lockedOutLandings: lockedOut,
        queues,
        mood,
      });
      drawMood(ui.mood, mood);

      // KB-13: the canvas is not a hole in the page. Updated at most twice a second, because a
      // live region that changes 60 times a second is unusable rather than accessible.
      const description = describeFrame({
        recording,
        frame,
        metrics,
        unansweredCallFloorIds: unanswered,
        lockedOutLandings: lockedOut,
        queues,
        mood,
      });
      if (description !== lastDescription) {
        lastDescription = description;
        ui.canvas.setAttribute('aria-label', description);
      }

      // KB-10: the scrub position is written only while the reader is not holding it.
      if (document.activeElement !== ui.scrub) {
        ui.scrub.value = String(Math.round(playback.progress * 1000));
      }
      if (playback.state === 'ended') ui.playPause.textContent = 'Play';
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // The live region is updated on a slow cadence of its own, so a screen reader is not read a
  // new sentence every animation frame.
  window.setInterval(() => {
    if (ui.panels.viewer.hidden) return;
    ui.description.textContent = lastDescription;
  }, 2000);

  // Nothing to play until the first run lands. `adopt` and `runOnce`'s failure path keep it
  // honest from here, so there is no second opinion about when these are live.
  syncTransport();

  // Before the first run, not after it: § 10.3's whole point is that the note is *stated* rather
  // than diagnosed, so it must be on screen while the opening building and dispatcher are still
  // only a selection.
  renderAccessNote();
  ui.status.textContent = 'ready — press Run, or open the building editor';
  runOnce();
}

/**
 * Floors standing a call that no car answers in this run — `D10`.
 *
 * `landingAssignmentsAt` only returns calls with somebody waiting at the instant asked for, and
 * `answeredByCarId` is taken off the record rather than guessed, so this is *"nobody ever comes"*
 * and not *"nobody has come yet"*. `promisedCarId` excludes the destination-dispatch case where a
 * panel has already named a car: a promised passenger still standing at the horizon is not an
 * unanswered call, which is the distinction `frame/overlay.ts` § version 4 exists to preserve.
 *
 * Ordered by the building's own floor order, not by id. Sorting the ids as strings read
 * `11, 12, 16, 20, 24, 25, 26, 3, 4, 6, 8, 9` in the spoken description — every digit correct and
 * the sentence useless.
 */
function unansweredCallFloors(
  recording: VizRecording,
  assignments: readonly LandingAssignment[],
): readonly string[] {
  const ids = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.waiting === 0) continue;
    if (assignment.promisedCarId !== undefined) continue;
    if (assignment.answeredByCarId !== undefined) continue;
    ids.add(assignment.floorId);
  }
  return recording.floors.map((floor) => floor.id).filter((id) => ids.has(id));
}

/** Floor ids no shaft in this recording serves — `RV-08`'s unassignable landings. */
function unservedFloors(recording: VizRecording): readonly string[] {
  const served = new Set(recording.shafts.flatMap((shaft) => shaft.servedFloorIds));
  return recording.floors.map((floor) => floor.id).filter((id) => !served.has(id));
}

function applyParam(select: HTMLSelectElement, value: string | null): void {
  if (value === null) return;
  if ([...select.options].some((option) => option.value === value)) select.value = value;
}

/**
 * The run summary, instantiated — `docs/10-experience-layer-contract.md` § 11 **W2**'s named
 * non-test caller.
 *
 * Thin on purpose, and thin in the specific way the rest of this package is: every decision about
 * *what* a figure says, whether it is suppressed, what its `n` is and whether a natural-frequency
 * restatement is admissible is made in `render/runSummary.ts`, where it is asserted against a
 * recomputation under plain Node. This function knows only how to turn a {@link SummaryFigure}
 * into elements.
 *
 * **Nothing here keys on a figure id.** The classes are derived from `kind` and `severity`, so a
 * twelfth figure appears with no edit to this file and no edit to `index.html` — the same rule W4
 * kept for the parameter form, and the reason neither surface holds a list of metric names.
 *
 * The first figure names the seed, which is R7: *"the seed stays visible and copyable in every
 * mode"*. It is rendered as text rather than into the canvas, and that is the copyable half — a
 * bitmap cannot be selected, and `Export PNG` is exactly the path that turns this screen into one.
 */
function drawRunSummary(container: HTMLElement, recording: VizRecording): void {
  const doc = container.ownerDocument;
  container.replaceChildren();
  for (const item of runSummaryFigures(recording)) {
    const row = doc.createElement('div');
    row.className = `figure figure-${item.kind}${item.severity === 'warning' ? ' figure-warning' : ''}`;

    const label = doc.createElement('span');
    label.className = 'figure-label';
    label.textContent = `${item.label} `;
    row.append(label);

    const value = doc.createElement('span');
    value.className = 'figure-value';
    value.textContent = item.value;
    row.append(value);

    if (item.count !== undefined) {
      const count = doc.createElement('span');
      count.className = 'figure-count';
      // R13: the count is in the same visual unit as the figure, never in a tooltip and never
      // behind a disclosure. `n = 5` is not a caveat on `11.3 s`; it is part of what it means.
      //
      // The leading space is not decoration. Adjacent inline elements have no whitespace between
      // them in the *text* layer, so a margin separates them on screen and a screen reader — and
      // the clipboard — get `suppressedn = 234 rides`. Seen in the driven session before it was
      // fixed. `KB-13`'s whole point is that the two readers are told the same thing.
      count.textContent = ` ${item.count}`;
      row.append(count);
    }

    for (const bar of item.bars) {
      const line = doc.createElement('div');
      line.className = 'figure-bar';
      const barLabel = doc.createElement('span');
      barLabel.className = 'figure-bar-label';
      barLabel.textContent = bar.label;
      const track = doc.createElement('span');
      track.className = 'figure-bar-track';
      const fill = doc.createElement('span');
      fill.className = 'figure-bar-fill';
      fill.style.display = 'block';
      fill.style.width = `${String(Math.round(bar.fraction * 1000) / 10)}%`;
      track.append(fill);
      const text = doc.createElement('span');
      text.className = 'figure-bar-text';
      text.textContent = bar.text;
      line.append(barLabel, track, text);
      row.append(line);
    }

    if (item.note !== undefined) {
      const note = doc.createElement('p');
      note.className = 'figure-note';
      note.textContent = item.note;
      row.append(note);
    }
    container.append(row);
  }
}

/**
 * The last mood put on screen, so the gauge's DOM is rebuilt when it changes and not at 60 Hz.
 *
 * The same shape `lastDescription` uses one level up, and for the same reason: replacing a
 * subtree sixty times a second moves focus, defeats text selection and makes the caveat
 * impossible to read. The key is the whole rendered content, so any change to any driver's text
 * — which is the thing a mutation would freeze — still redraws.
 */
let lastMoodKey = '';

/**
 * The building mood gauge, instantiated — `docs/10` § 6 / D4's named non-test caller.
 *
 * Thin, exactly as {@link drawRunSummary} is: every decision about *what* the mood is, which
 * observations it looked at and whether it is still provisional is made in `render/mood.ts`, under
 * plain Node, where it is asserted against a recomputation. This function knows how to make
 * elements.
 *
 * **Nothing here keys on a driver id.** The classes come from `level` and `provisional`, so a sixth
 * observation appears with no edit to this file and none to `index.html` — the rule W4 kept for the
 * parameter form and W2 kept for the summary.
 *
 * The glyph is emitted as text rather than as a coloured dot, which is KB-15 in the DOM: a reader
 * with a monochrome display, a screenshot in greyscale, or no colour perception at all reads the
 * same three shapes the canvas draws.
 */
function drawMood(container: HTMLElement, mood: BuildingMood): void {
  const key = `${mood.level}|${String(mood.provisional)}|${mood.headline}|${mood.drivers
    .map((driver) => `${driver.id}:${driver.level}:${driver.text}`)
    .join('|')}`;
  if (key === lastMoodKey) return;
  lastMoodKey = key;

  const doc = container.ownerDocument;
  container.replaceChildren();

  const head = doc.createElement('p');
  head.className = `mood-head mood-${mood.level}${mood.provisional ? ' mood-provisional' : ''}`;
  const glyph = doc.createElement('span');
  glyph.className = 'mood-glyph';
  glyph.textContent = `${mood.glyph} `;
  const headline = doc.createElement('span');
  headline.className = 'mood-headline';
  headline.textContent = mood.headline;
  head.append(glyph, headline);
  container.append(head);

  for (const driver of mood.drivers) {
    const row = doc.createElement('p');
    row.className = `mood-driver mood-${driver.level}`;
    const label = doc.createElement('span');
    label.className = 'mood-label';
    label.textContent = `${driver.label} `;
    const text = doc.createElement('span');
    text.className = 'mood-text';
    text.textContent = driver.text;
    row.append(label, text);
    container.append(row);
  }

  // R2, in the component rather than in a manual. It is the last thing in the panel because it is
  // what the reader should leave with, and it is never elided in any mode.
  const caveat = doc.createElement('p');
  caveat.className = 'mood-caveat';
  caveat.textContent = mood.caveat;
  container.append(caveat);
}

function statusLine(recording: VizRecording): string {
  const { summary } = recording;
  // One gate, three surfaces — the status line, the canvas header and the metrics panel.
  const suppressed = meansAreSuppressed(recording);
  const parts = [
    `${recording.buildingName} · ${recording.dispatcherProfileId} · seed ${recording.seed}`,
  ];
  // A run that did not deliver everybody is never presented as a completed one (UX.md RV-16).
  // It leads the line, because it is the fact that decides how much of the rest means anything.
  if (recording.status !== 'completed') {
    parts.push(`${recording.status.toUpperCase()} — ${String(summary.undelivered)} undelivered`);
  }
  parts.push(`${String(summary.generated)} generated, ${String(summary.delivered)} delivered`);
  if (summary.generated === 0) {
    // RV-11: an explanation, not an empty chart.
    parts.push('no passengers were generated in this window — nothing to watch');
  }
  parts.push(
    suppressed
      ? `AWT suppressed${summary.awtInvalidReason === undefined ? '' : ` — ${summary.awtInvalidReason}`}`
      : `AWT ${summary.meanWaitS.toFixed(1)} s · WT95 ${summary.wait95S.toFixed(1)} s`,
  );
  return parts.join('   ·   ');
}

/**
 * A seed drawn from the browser's CSPRNG, printed so the run can be reproduced.
 *
 * This is not a simulation random draw — it chooses which run to watch, and it is echoed into
 * the seed field the moment it is used. Nothing inside the simulation ever calls it (CLAUDE.md
 * invariant 2: every draw inside a run comes from a named stream on the injected `StreamSet`).
 */
function randomSeed(): bigint {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return (BigInt(bytes[0] ?? 1) << 32n) | BigInt(bytes[1] ?? 1);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void main().catch((error: unknown) => {
  // A page that stops without saying so is the failure `RV-21` shipped with. There is no state to
  // recover here, so the last thing this file does is refuse to fail quietly.
  const node = document.getElementById('error');
  if (node !== null) node.textContent = `the viewer failed to start: ${message(error)}`;
});
