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
 *
 * ## Two surfaces, one page
 *
 * A tablist rather than two documents, because the editor's whole payoff is `ED-04`: a valid
 * edit goes straight to a run without a reload, keeping the seed and the dispatcher the reader
 * had already chosen.
 */

import { SimulationError, type BuildingConfig, type SimulationConfig } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import { frameSequence, serializeFrames } from '../frame/sequence.js';
import {
  landingAssignmentsAt,
  meansAreSuppressed,
  overlayAt,
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
import { mountEditor } from './editor.js';
import { loadBrowserResources, resolveEdited, type BrowserResources } from './data.js';

/** `PB-T1`: ×1 … ×120, and `[`/`]` step this ladder — `KB-07`. */
const SPEEDS = [1, 2, 5, 10, 30, 60, 120] as const;
/** Width reserved for the live metrics panel. Dropped below this viewport width — `RS-03`. */
const OVERLAY_WIDTH_PX = 250;
const OVERLAY_MIN_VIEWPORT_PX = 900;
/** One display frame at 60 Hz, in simulated seconds at the current speed — `KB-06`, `PB-08`. */
const FRAME_S = 1 / 60;

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
  readonly tabViewer: HTMLButtonElement;
  readonly tabEditor: HTMLButtonElement;
  readonly panelViewer: HTMLElement;
  readonly panelEditor: HTMLElement;
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
    tabViewer: find<HTMLButtonElement>('tab-viewer'),
    tabEditor: find<HTMLButtonElement>('tab-editor'),
    panelViewer: find<HTMLElement>('panel-viewer'),
    panelEditor: find<HTMLElement>('panel-editor'),
    confirm: find<HTMLDialogElement>('confirm'),
    confirmMessage: find<HTMLElement>('confirm-message'),
    confirmOk: find<HTMLButtonElement>('confirm-ok'),
    confirmCancel: find<HTMLButtonElement>('confirm-cancel'),
  };
}

/** `KB-14` — the reader has asked for no motion beyond the simulation itself. */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function main(): Promise<void> {
  const ui = elements();
  ui.status.textContent = 'loading data…';

  let resources: BrowserResources;
  const load = async (): Promise<boolean> => {
    try {
      resources = await loadBrowserResources();
      return true;
    } catch (error) {
      // RV-17: what failed, and a Retry that refetches without a page reload (RV-21).
      ui.error.replaceChildren(
        `could not load data/: ${message(error)} `,
        (() => {
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.textContent = 'Retry';
          retry.addEventListener('click', () => {
            void (async () => {
              ui.error.textContent = '';
              ui.status.textContent = 'loading data…';
              if (await load()) start();
            })();
          });
          return retry;
        })(),
      );
      ui.error.focus();
      return false;
    }
  };
  if (!(await load())) return;

  let started = false;
  function start(): void {
    if (started) return;
    started = true;
    boot(ui, resources);
  }
  start();
}

function boot(ui: Elements, resources: BrowserResources): void {
  for (const building of resources.buildings) {
    ui.building.append(new Option(`${building.name} (${building.id})`, building.id));
  }
  for (const profile of resources.dispatcherProfiles) {
    ui.dispatcher.append(new Option(profile.id, profile.id));
  }
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
  let currentTab: 'viewer' | 'editor' = params.get('tab') === 'editor' ? 'editor' : 'viewer';

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
    const dispatcherProfile = resources.dispatcherProfiles.find(
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

    const config: SimulationConfig = {
      building: resolved,
      dispatcherProfile,
      trafficProfiles: resources.trafficProfiles,
      elevatorSpecs: resources.elevatorSpecs,
      seed,
      durationS,
      /**
       * `report`, not the kernel's default `throw`.
       *
       * At the shipped traffic rates, Mixed-Use High-Rise, Secure Tower and Vertical City
       * routinely end a 900 s run with people still in the system, and `Simulation` treats that
       * as a failed run — correctly, because a mean over a system that never cleared is the
       * confident nonsense this project exists to avoid. But under `throw` there is no recording
       * at all, so pressing **Run** on three of the five shipped buildings produced an error
       * message and an empty canvas rather than the playback UX.md RV-01 promises.
       *
       * `report` gives the viewer the recording it has to be able to draw, and the run's
       * `timed-out` status and undelivered count now lead the canvas banner as well as the
       * status line — UX.md RV-16. Nothing about the statistics moves: `awtIsValid` still comes
       * from the summary and still suppresses every mean, in the header and in the overlay.
       */
      onTimeout: 'report',
    };

    ui.status.textContent = `simulating ${resolved.name} for ${String(durationS)} s — this blocks the page for about a second…`;
    lastConfig = config;
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
      // not a building that starts moving on its own.
      autoplay: !prefersReducedMotion(),
      loop: ui.loop.checked,
    });
    ui.playPause.textContent = playback.state === 'playing' ? 'Pause' : 'Play';
    ui.status.textContent = statusLine(next);
    ui.banner.textContent = `${next.buildingName} · ${next.dispatcherProfileId} · seed ${next.seed}`;
    populateBankFilter(next);
    landingOptionsKey = NO_OPTIONS_YET;
    populateLandings(next, next.startedAt);
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
  });
  ui.dispatcher.addEventListener('change', syncUrl);
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
    if (ui.panelEditor.hidden === false) return;
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

  function selectTab(which: 'viewer' | 'editor'): void {
    const viewer = which === 'viewer';
    currentTab = which;
    ui.tabViewer.setAttribute('aria-selected', String(viewer));
    ui.tabEditor.setAttribute('aria-selected', String(!viewer));
    ui.tabViewer.tabIndex = viewer ? 0 : -1;
    ui.tabEditor.tabIndex = viewer ? -1 : 0;
    ui.panelViewer.hidden = !viewer;
    ui.panelEditor.hidden = viewer;
    if (!viewer) {
      // `D11`: one building across both panes. Declines to act on an unsaved edit — see
      // `EditorHandle.showBuilding`.
      editor.showBuilding(ui.building.value);
      editor.refresh();
    }
    syncUrl();
  }

  ui.tabViewer.addEventListener('click', () => {
    selectTab('viewer');
  });
  ui.tabEditor.addEventListener('click', () => {
    selectTab('editor');
  });
  for (const [tab, other, which] of [
    [ui.tabViewer, ui.tabEditor, 'editor'],
    [ui.tabEditor, ui.tabViewer, 'viewer'],
  ] as const) {
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      selectTab(which);
      other.focus();
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
    onOpen: (buildingId) => {
      applyParam(ui.building, buildingId);
      // A shipped building was chosen, so the ad-hoc document the editor may have handed over
      // earlier is no longer what Run means.
      adhocBuilding = undefined;
      syncUrl();
    },
    onRun: (building) => {
      adhocBuilding = building;
      selectTab('viewer');
      ui.tabViewer.focus();
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

  // `D11`: `?tab=editor` survives a reload, and opens on the building the URL names. After the
  // mount, because `selectTab('editor')` hands the building over to the editor.
  if (currentTab === 'editor') selectTab('editor');

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

    if (playback !== undefined && recording !== undefined && !ui.panelViewer.hidden) {
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
      drawScene(surface, {
        recording,
        frame,
        layout,
        overlay: wantsOverlay ? metrics : undefined,
        selection,
        unservedFloorIds: unservedFloors(recording),
        unansweredCallFloorIds: unanswered,
      });

      // KB-13: the canvas is not a hole in the page. Updated at most twice a second, because a
      // live region that changes 60 times a second is unusable rather than accessible.
      const description = describeFrame({
        recording,
        frame,
        metrics,
        unansweredCallFloorIds: unanswered,
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
    if (ui.panelViewer.hidden) return;
    ui.description.textContent = lastDescription;
  }, 2000);

  // The transport is disabled until there is something to play — UX.md § B.3's empty state.
  for (const control of [ui.playPause, ui.stepBack, ui.stepForward, ui.scrub, ui.exportPng]) {
    control.disabled = true;
  }
  const enable = (): void => {
    for (const control of [ui.playPause, ui.stepBack, ui.stepForward, ui.scrub, ui.exportPng]) {
      control.disabled = recording === undefined;
    }
  };
  ui.run.addEventListener('click', enable);
  ui.loadRecording.addEventListener('change', () => {
    window.setTimeout(enable, 0);
  });

  ui.status.textContent = 'ready — press Run, or open the building editor';
  runOnce();
  enable();
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

void main();
