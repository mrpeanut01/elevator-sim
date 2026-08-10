/**
 * The seam every panel mount is written against.
 *
 * ## One shape, eleven panels
 *
 * A mount is built once, with the elements it owns and a way to change the state, and is then
 * asked to `render` whenever anything moves. It never reads the state out of a closure and it never
 * writes one directly: it calls {@link MountContext.update} with a patch, and the shell re-renders
 * everything. That is slower than a targeted DOM write and it is the right trade at this size —
 * the alternative is eleven panels each deciding which of the others need to know, which is how two
 * panels come to disagree about what is running.
 *
 * The redraw is cheap because the expensive thing is the simulation, and the simulation does not
 * re-run on a render. {@link dom.setText} and friends write only when the value changed, so a
 * 60 Hz playback loop touches the accessibility tree only where something actually moved.
 */

import type { ResolvedBuilding } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';

import type { BrowserResources } from './data.js';
import type { TabName } from './elementMap.js';
import type { ViewerState } from './state.js';

/**
 * Everything a panel is allowed to know about *right now*.
 *
 * The playhead is here rather than in {@link ViewerState} on purpose: it moves sixty times a second
 * and a state patch per frame would make every `update` a whole-page render. The shell owns it and
 * hands it down.
 */
export interface ViewAt {
  readonly state: ViewerState;
  readonly resources: BrowserResources;
  /** The recording being played, or `undefined` before the first run. */
  readonly recording: VizRecording | undefined;
  /** The playhead, in simulated seconds. Clamped into the recording when there is one. */
  readonly simTimeS: number;
  /** The building the current run resolved to, for the plates. `undefined` before the first run. */
  readonly building: ResolvedBuilding | undefined;
  /** Whether playback is running, for the transport's glyph and the status line. */
  readonly playing: boolean;
}

/** What a mount may do to the world. Everything else it must ask for. */
export interface MountContext {
  /** Merge a patch into the state and re-render. Never mutates the state it was given. */
  update(patch: Partial<ViewerState>): void;
  /**
   * Re-run the simulation with the current state, and draw the result.
   *
   * **It returns before the run finishes**, and since `dev/shiftWorker.ts` it always did in the
   * sense that matters: the simulation happens on a worker, so the recording is not on the state
   * when this call returns. Every panel but one already treated this as the last statement of a
   * handler, which is why the signature did not have to change for them.
   *
   * `onRan` is for the one that did not. `dev/dispatcherEditor.ts` arms its result strip on
   * *"which run did my press cause"* and read `view.recording.runId` on the next line, under a
   * comment that said `runShift` re-renders synchronously — true when it was written, and the
   * shape CLAUDE.md calls a stale stated mechanism. The callback is handed **the recording the run
   * produced**, so the panel does not have to ask a `ViewAt` that has not been rebuilt yet, and it
   * is called **only when a run actually landed**: a configuration that refused, a run that threw
   * and a run the player cancelled all call it never, which is exactly the guarantee that panel's
   * strip depends on.
   */
  runShift(onRan?: (recording: VizRecording) => void): void;
  /** Move to a surface, revealing its tab if it is one of the four contextual editors. */
  openTab(tab: TabName): void;
  /**
   * Show a message in the surface's own error slot.
   *
   * Panels do not throw. A `ConfigError` from an edit is a fact about the document the reader is
   * holding, not a crash, and `index.html` gives every editor a `role="alert"` of its own so the
   * message lands where the edit happened.
   */
  fail(message: string): void;
}

/** A mounted panel. Built once, rendered often. */
export interface Panel {
  render(view: ViewAt): void;
}
