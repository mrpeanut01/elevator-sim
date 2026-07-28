/**
 * `@elevator-sim/viz` — the visualization package.
 *
 * ## The dependency direction, which is the whole point
 *
 * This package imports `@elevator-sim/core`. `core` imports nothing from here and must build
 * and test with this package absent — CLAUDE.md invariant 6, verified in its strong form by
 * physically removing the package and rebuilding, not by reading the imports.
 *
 * ## The four layers, in dependency order
 *
 * | Layer | Module | Depends on |
 * |---|---|---|
 * | Contract | `contract/` | `core` types only |
 * | Recording | `record/` | `core` — the only place a simulation is run |
 * | Frames | `frame/` | the contract. Pure: `(recording, t) → Frame` |
 * | Playback | `playback/` | frames, plus an injected {@link DisplayClock} |
 * | Rendering | `render/` | frames. Draws through a structural 2D context, never the DOM |
 *
 * Nothing points back up. A renderer cannot start a simulation, playback cannot draw, and the
 * frame producer cannot read a clock.
 *
 * ## Named non-test callers
 *
 * The roadmap's standing requirement is that a shipped behaviour must name a caller that is not
 * one of its own tests. This barrel is **not** that caller — a re-export looks exactly like one
 * and is not.
 *
 * The table below is **complete**: every runtime export of this package has a row. That is the
 * point. The previous version listed six rows and omitted the two — `isSupportedRecording` and
 * `displayMsAt` — whose honest entry would have read *none*, which made a table designed to
 * catch unowned seams into a table that could only flatter itself. A table that lists only its
 * good rows is worse than no table, because it looks like a check.
 *
 * | Export | Non-test caller |
 * |---|---|
 * | {@link recordRun} | `src/dev/main.ts`, the browser viewer's load path |
 * | {@link frameAt} | `Playback.frame()`, every animation frame from `src/dev/main.ts`; and `frameSequence` |
 * | {@link frameSequence}, {@link serializeFrames} | `src/dev/main.ts`'s **Verify replay** control |
 * | {@link frameTimes} | `frameSequence`, in `src/frame/sequence.ts` |
 * | {@link carHeightAt}, {@link carFloorIdAt}, {@link carDirectionAt}, {@link doorFractionAt}, {@link doorPhaseAt} | `frameCar`, in `src/frame/frameAt.ts`. **Inside the package only** — no caller outside it |
 * | {@link VIZ_SCHEMA_VERSION} | `describeRun`, in `src/record/recordRun.ts`, which stamps it |
 * | {@link StepSeriesBuilder}, {@link constantSeries} | `src/record/recordRun.ts` |
 * | {@link stepValueAt}, {@link lastAtOrBefore} | `src/frame/frameAt.ts` |
 * | {@link stepIndexAt} | `stepValueAt`, in `src/contract/series.ts`. Inside the module only |
 * | {@link instrumentCar}, {@link shortCarLabel} | `src/record/recordRun.ts` |
 * | {@link Playback}, {@link systemClock} | `src/dev/main.ts` |
 * | {@link MIN_SPEED}, {@link MAX_SPEED}, {@link assertSpeed}, {@link simTimeAt}, {@link reanchor} | `src/playback/playback.ts` |
 * | {@link buildLayout}, {@link drawScene} | `src/dev/main.ts` |
 * | {@link DEFAULT_THEME}, {@link formatClock} | `drawScene`, in `src/render/canvas.ts` |
 * | {@link ManualClock} | tests only, by construction — it is the test double |
 *
 * `frameSequence` and `serializeFrames` exist because Phase 4's acceptance criterion needs a
 * headless, browser-free way to compare two replays. They would have shipped as "configurable,
 * unit-tested, never called from a shipped path" — the failure this repository has repeated
 * five times — so the dev viewer's **Verify replay** control runs exactly the comparison
 * `replay.test.ts` runs, from a button, on the run currently on screen.
 *
 * ## Deleted rather than kept as decoration
 *
 * Two exports whose only callers were their own tests were removed in wave 1's remediation
 * rather than left with a plausible future use written next to them:
 *
 * - **`isSupportedRecording`** compared `recording.schemaVersion` to `VIZ_SCHEMA_VERSION`. In the
 *   shipped path the only producer of a recording is `recordRun` from the same build, so the
 *   comparison could not fail — a guard that guards nothing, which is this repository's signature
 *   defect in miniature. The check belongs in the wave-2 file-load path (UX.md PB-07/PB-15),
 *   where a recording arrives from somewhere else and the version can actually differ.
 * - **`displayMsAt`** inverted `simTimeAt`. `Playback` uses `simTimeAt` and `reanchor` and never
 *   needed the inverse; wave 2's click-to-seek on the timeline is where an inverse gets a caller.
 */

export {
  VIZ_SCHEMA_VERSION,
  type DoorPhase,
  type Frame,
  type FrameCar,
  type FrameLanding,
  type StepSeries,
  type TravelDirection,
  type VizDoorMark,
  type VizFloor,
  type VizLanding,
  type VizProgress,
  type VizRecording,
  type VizShaft,
  type VizSummary,
} from './contract/types.js';

export {
  StepSeriesBuilder,
  constantSeries,
  lastAtOrBefore,
  stepIndexAt,
  stepValueAt,
} from './contract/series.js';

export { instrumentCar, shortCarLabel, type CarTrack } from './record/instrument.js';
export { recordRun, type RecordedRun } from './record/recordRun.js';

export {
  carDirectionAt,
  carFloorIdAt,
  carHeightAt,
  doorFractionAt,
  doorPhaseAt,
  frameAt,
} from './frame/frameAt.js';
export {
  frameSequence,
  frameTimes,
  serializeFrames,
  type SequenceOptions,
} from './frame/sequence.js';

export { ManualClock, systemClock, type DisplayClock } from './playback/clock.js';
export {
  MAX_SPEED,
  MIN_SPEED,
  assertSpeed,
  reanchor,
  simTimeAt,
  type PlaybackAnchor,
} from './playback/mapping.js';
export { Playback, type PlaybackOptions, type PlaybackState } from './playback/playback.js';

export {
  buildLayout,
  type FloorRow,
  type Layout,
  type LayoutOptions,
  type Rect,
  type ShaftColumn,
  type ShaftGeometry,
} from './render/layout.js';
export {
  DEFAULT_THEME,
  drawScene,
  formatClock,
  type Canvas2DLike,
  type SceneInput,
  type Theme,
} from './render/canvas.js';
