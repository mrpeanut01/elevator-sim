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
  /**
   * The run's own start-of-day, seconds since midnight, or `undefined` when the run declares no
   * hour (`constant-iso`, and a recording loaded from a file — `VizRecording` does not carry it).
   *
   * **One clock per run** (`docs/19` defect 2). This is the value the shell feeds the header
   * clock, and it is on `ViewAt` so every panel that prints a time of day reads the same hour —
   * the decision feed's stamps and the honesty card's window range used to take `clockAt`'s
   * 06:00 default while the header read the run's own 08:30, which is two clocks about one
   * instant. `undefined` makes every reader fall back to the shared `DAY_START_S` **together**.
   */
  readonly startOfDayS?: number | undefined;
  /** The building the current run resolved to, for the plates. `undefined` before the first run. */
  readonly building: ResolvedBuilding | undefined;
  /** Whether playback is running, for the transport's glyph and the status line. */
  readonly playing: boolean;
  /**
   * Why the Day report has nothing on it while the rest of the screen suggests otherwise, or
   * `undefined` when the empty sheet is empty for the plain reason (nothing has been run).
   *
   * Here rather than derivable by the panel, because both facts live in `boot()`'s closure where
   * no panel can reach them: whether the run on screen is one the player asked for (§ D232's
   * `playerHasChosen`), and whether any sheet has been filed **in this sitting** (a restored
   * week's `history` cannot tell a reload from a day advanced five minutes ago). The panel's
   * `emptyReportView` holds the wording; this carries the facts — the split every panel keeps.
   */
  readonly unfiledSheet?: UnfiledSheetFacts | undefined;
}

/**
 * The two facts behind an empty sheet that is not plainly empty — `docs/19` defects 1 and 14.
 *
 * Both optional and independently so, because they answer different questions and can hold at
 * once (a reload mid-campaign followed by watching boot's run to its end raises both): the
 * refusal is about the **run on screen**, the prior-sitting flag is about the **week the rail is
 * describing**. `dev/reportPanel.ts#emptyReportView` gives the refusal precedence — a completed
 * run standing unfiled is the thing the reader is looking at.
 */
export interface UnfiledSheetFacts {
  /**
   * Why the completed run on screen has not filed, in one sentence, or `undefined` when no
   * completed run is standing unfiled. The sentences are `shift/banking.ts`'s two — a run this
   * shell did not simulate (issue #136), and a run nobody started (§ D232, `docs/19` defect 1) —
   * quoted, never composed here.
   */
  readonly refusal: string | undefined;
  /**
   * Whether the week on the rail was banked in a previous sitting with no sheet filed in this
   * one — the restore state `docs/19` defect 14 found incoherent: the rail read *on a roll ·
   * 1/1 banked* while the sheet read *Nothing filed yet* with nothing connecting the two.
   */
  readonly fromPreviousSitting: boolean;
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
  /**
   * Announce that this press **enters a mode** — a scenario card taken, a week restarted — as
   * opposed to re-running the day already on screen.
   *
   * The distinction exists for shell-owned transport state: the speed chips reset on mode entry
   * and survive mid-week re-runs (`docs/19` defect 12; `dev/main.ts#resetTransportSpeed` owns the
   * boundary and its argument). The menu's own mode doors reset directly in their `dispatchMenu`
   * arms; this member is for the one mode door that lives on a panel — the scenario cards. It is
   * **not** implied by {@link runShift}: every re-run comes through that seam, and resetting there
   * would fight the player on exactly the surface they iterate on.
   *
   * Optional, because ten of the eleven panels never enter a mode and a recorder-backed test
   * context should not have to stub a member its mount cannot call. A panel that gains a mode
   * door calls it with `?.` — an absent implementation means the context's owner keeps no
   * transport state, which is true of every context but the shell's.
   */
  enterMode?(): void;
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
