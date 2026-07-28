/**
 * The dev viewer: the shipped, non-test caller of everything this package exports.
 *
 * The roadmap's standing requirement is that a behaviour must name a caller which is not one of
 * its own tests. This file is that caller. It loads `data/` over HTTP, runs a replication,
 * records it, and drives {@link Playback} from `requestAnimationFrame` — so `recordRun`,
 * `frameAt`, `Playback`, `buildLayout` and `drawScene` are all exercised by the product rather
 * than only by a suite.
 *
 * It is deliberately small. Wave 2 builds the real viewer — a proper transport, a metrics
 * overlay, the building editor — against the contract this file proves is sufficient. Every
 * state it lacks is enumerated in `UX.md` rather than left to be discovered.
 */

import { SimulationError, type SimulationConfig } from '@elevator-sim/core';

import type { VizRecording } from '../contract/types.js';
import { frameSequence, serializeFrames } from '../frame/sequence.js';
import { recordRun } from '../record/recordRun.js';
import { Playback } from '../playback/playback.js';
import { systemClock } from '../playback/clock.js';
import { buildLayout } from '../render/layout.js';
import { drawScene, type Canvas2DLike } from '../render/canvas.js';
import { loadBrowserResources, type BrowserResources } from './data.js';

const SPEEDS = [1, 5, 10, 30, 60, 120] as const;

interface Elements {
  readonly canvas: HTMLCanvasElement;
  readonly building: HTMLSelectElement;
  readonly dispatcher: HTMLSelectElement;
  readonly speed: HTMLSelectElement;
  readonly seed: HTMLInputElement;
  readonly run: HTMLButtonElement;
  readonly verify: HTMLButtonElement;
  readonly playPause: HTMLButtonElement;
  readonly scrub: HTMLInputElement;
  readonly status: HTMLElement;
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
    speed: find<HTMLSelectElement>('speed'),
    seed: find<HTMLInputElement>('seed'),
    run: find<HTMLButtonElement>('run'),
    verify: find<HTMLButtonElement>('verify'),
    playPause: find<HTMLButtonElement>('play-pause'),
    scrub: find<HTMLInputElement>('scrub'),
    status: find<HTMLElement>('status'),
  };
}

async function main(): Promise<void> {
  const ui = elements();
  ui.status.textContent = 'loading data…';

  let resources: BrowserResources;
  try {
    resources = await loadBrowserResources();
  } catch (error) {
    ui.status.textContent = `could not load data/: ${message(error)}`;
    return;
  }

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
  ui.status.textContent = 'ready — press Run';

  let playback: Playback | undefined;
  let recording: VizRecording | undefined;
  /** The config that produced {@link recording}, kept so Verify replay can re-run exactly it. */
  let lastConfig: SimulationConfig | undefined;

  const runOnce = (): void => {
    const building = resources.buildings.find((candidate) => candidate.id === ui.building.value);
    const dispatcherProfile = resources.dispatcherProfiles.find(
      (candidate) => candidate.id === ui.dispatcher.value,
    );
    if (building === undefined || dispatcherProfile === undefined) {
      ui.status.textContent = 'pick a building and a dispatcher first.';
      return;
    }
    const seedText = ui.seed.value.trim();
    let seed: bigint;
    try {
      seed = seedText === '' ? randomSeed() : BigInt(seedText);
    } catch {
      ui.status.textContent = `"${seedText}" is not a whole number; a seed must be one.`;
      return;
    }
    ui.seed.value = seed.toString();

    const config: SimulationConfig = {
      building,
      dispatcherProfile,
      trafficProfiles: resources.trafficProfiles,
      elevatorSpecs: resources.elevatorSpecs,
      seed,
      durationS: 900,
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
       * `timed-out` status and undelivered count are shown in the status line rather than
       * swallowed — UX.md RV-16. Nothing about the statistics moves: `awtIsValid` still comes
       * from the summary and still suppresses the mean.
       */
      onTimeout: 'report',
    };

    ui.status.textContent = 'simulating…';
    lastConfig = config;
    try {
      recording = recordRun(config).recording;
    } catch (error) {
      recording = undefined;
      playback = undefined;
      ui.status.textContent =
        error instanceof SimulationError
          ? `the simulation refused to report this run: ${error.message}`
          : `run failed: ${message(error)}`;
      return;
    }

    playback = new Playback(recording, systemClock(), {
      speed: Number(ui.speed.value),
      autoplay: true,
    });
    ui.playPause.textContent = 'Pause';
    ui.status.textContent = statusLine(recording);
  };

  /**
   * Phase 4's acceptance criterion, on a button.
   *
   * The recording on screen is serialised through JSON, the run is re-simulated from the *same
   * seed*, and the two frame sequences are compared byte for byte at a real playback rate. Same
   * check `src/replay/replay.test.ts` runs, reachable by a human — which is what stops
   * `frameSequence` from becoming another behaviour that is configurable, unit-tested and never
   * called from a shipped path.
   */
  const verifyReplay = (): void => {
    if (recording === undefined || lastConfig === undefined) {
      ui.status.textContent = 'run something first, then verify it replays.';
      return;
    }
    const options = { fps: 30, speed: 10 } as const;
    const original = serializeFrames(
      frameSequence(JSON.parse(JSON.stringify(recording)) as VizRecording, options),
    );
    let replayed: string;
    try {
      replayed = serializeFrames(frameSequence(recordRun(lastConfig).recording, options));
    } catch (error) {
      ui.status.textContent = `replay failed: ${message(error)}`;
      return;
    }
    const frames = frameSequence(recording, options).length;
    ui.status.textContent =
      replayed === original
        ? `replay verified — ${String(frames)} frames identical from seed ${recording.seed}`
        : `REPLAY MISMATCH from seed ${recording.seed}: the same seed produced a different picture.`;
  };

  ui.run.addEventListener('click', runOnce);
  ui.verify.addEventListener('click', verifyReplay);
  ui.playPause.addEventListener('click', () => {
    playback?.toggle();
    ui.playPause.textContent = playback?.state === 'playing' ? 'Pause' : 'Play';
  });
  ui.speed.addEventListener('change', () => {
    playback?.setSpeed(Number(ui.speed.value));
  });
  ui.scrub.addEventListener('input', () => {
    playback?.seekToProgress(Number(ui.scrub.value) / 1000);
  });

  // Keyboard: space toggles, arrows nudge. The full inventory is in UX.md; this is the subset
  // the foundation needs to prove the transport is drivable without a mouse.
  window.addEventListener('keydown', (event) => {
    if (playback === undefined) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === ' ') {
      event.preventDefault();
      playback.toggle();
      ui.playPause.textContent = playback.state === 'playing' ? 'Pause' : 'Play';
    } else if (event.key === 'ArrowRight') {
      playback.seekBy(event.shiftKey ? 60 : 5);
    } else if (event.key === 'ArrowLeft') {
      playback.seekBy(event.shiftKey ? -60 : -5);
    } else if (event.key === 'Home') {
      playback.reset();
      ui.playPause.textContent = 'Play';
    }
  });

  const ctx = ui.canvas.getContext('2d');
  if (ctx === null) {
    ui.status.textContent = 'this browser has no 2D canvas context.';
    return;
  }
  // `CanvasRenderingContext2D.fillStyle` is `string | CanvasGradient | CanvasPattern`, which is
  // wider than `Canvas2DLike`'s `string`. The narrowing is sound in the direction it is used —
  // the renderer only ever *writes* strings, never reads a style back — and it is what keeps
  // `render/canvas.ts` free of DOM types and therefore testable under Node.
  const surface = ctx as unknown as Canvas2DLike;

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

    if (playback !== undefined && recording !== undefined) {
      const frame = playback.frame();
      const layout = buildLayout({
        width: cssWidth,
        height: cssHeight,
        floors: recording.floors,
        shafts: recording.shafts,
      });
      drawScene(surface, { recording, frame, layout });
      if (document.activeElement !== ui.scrub) {
        ui.scrub.value = String(Math.round(playback.progress * 1000));
      }
      if (playback.state === 'ended') ui.playPause.textContent = 'Play';
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  runOnce();
}

function statusLine(recording: VizRecording): string {
  const { summary } = recording;
  const suppressed = summary.saturated || !summary.awtIsValid;
  const parts = [
    `${recording.buildingName} · ${recording.dispatcherProfileId} · seed ${recording.seed}`,
  ];
  // A run that did not deliver everybody is never presented as a completed one (UX.md RV-16).
  // It leads the line, because it is the fact that decides how much of the rest means anything.
  if (recording.status !== 'completed') {
    parts.push(`${recording.status.toUpperCase()} — ${String(summary.undelivered)} undelivered`);
  }
  parts.push(`${String(summary.generated)} generated, ${String(summary.delivered)} delivered`);
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
