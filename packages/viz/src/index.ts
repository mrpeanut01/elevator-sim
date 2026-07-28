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
 * | Recording | `record/recordRun.ts` | `core` — the only place a simulation is run |
 * | Documents | `record/document.ts` | the contract. Reads and fingerprints a recording that came from a *file* |
 * | Frames | `frame/frameAt.ts`, `frame/sequence.ts` | the contract. Pure: `(recording, t) → Frame` |
 * | Metrics | `frame/overlay.ts` | the contract. Pure: `(recording, t) → OverlayMetrics` |
 * | Playback | `playback/` | frames, plus an injected {@link DisplayClock} |
 * | Editing | `editorEdits.ts`, `editorValidate.ts`, `editorHistory.ts`, `editorPreview.ts` | `core`'s config module. Knows nothing about runs |
 * | Rendering | `render/` | frames and metrics. Draws through a structural 2D context, never the DOM |
 *
 * Nothing points back up. A renderer cannot start a simulation, playback cannot draw, the frame
 * producer cannot read a clock, and the editor cannot see a recording.
 *
 * ## Why the editor's four modules are flat files rather than `editor/`
 *
 * They want to be `src/editor/`, and they were, for most of wave 2. `core`'s
 * `sim/moduleTree.test.ts` compares every source directory under `packages/*​/src` — at any depth
 * — against the module tree in `docs/01-architecture.md`, in **both** directions, and fails on a
 * directory the doc does not name. Wave 2 does not own `docs/`, so a new directory here would
 * have meant either a red suite or a doc edit outside this task's remit; flat files at the
 * package root need neither, and `src/` itself is already a documented directory.
 *
 * The same constraint is why `frame/overlay.ts` is not `metrics/overlay.ts` and
 * `record/document.ts` is not `recording/document.ts`. Both are defensible where they now sit —
 * the overlay is a pure `(recording, t) → …` producer exactly like `frameAt`, and reading a
 * recording belongs with writing one — so those two are homes rather than compromises. The
 * editor is the compromise, and it is recorded as a handback in
 * `packages/viz/DECISIONS-T11.md`: **`docs/01` should gain `viz/editor/`, and these four files
 * should move into it in the same change.**
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
 * | {@link overlayAt} | `src/dev/main.ts`'s draw loop, every animation frame; and `drawScene` draws its result |
 * | {@link landingAssignmentsAt} | `src/dev/main.ts`'s landing selector and its draw loop |
 * | {@link landingAssignmentAt} | `landingAssignmentsAt`'s single-floor form. **No caller outside this package** |
 * | {@link drawOverlay} | `drawScene`, in `src/render/canvas.ts` |
 * | {@link loadColour}, {@link loadTrackMax}, {@link doorGlyph}, {@link describeSelection} | `src/render/canvas.ts` and `src/render/overlay.ts` |
 * | {@link describeFrame} | `src/dev/main.ts`, as the canvas's `aria-label` and its live region — `KB-13` |
 * | {@link readRecordingDocument} | `src/dev/main.ts`'s **Load recording** control — the version check's first real caller |
 * | {@link verifyReplay}, {@link recordingFingerprint} | `src/dev/main.ts`'s **Verify replay** control |
 * | {@link validateBuilding}, {@link validateBuildingText}, {@link summariseReport}, {@link issuesMayBeIncomplete} | `src/dev/editor.ts` |
 * | {@link previewGeometry} | `src/dev/editor.ts`'s live preview; and `drawPreview` |
 * | {@link drawPreview}, {@link describePreview} | `src/dev/editor.ts` |
 * | {@link EditorHistory} | `src/dev/editor.ts`'s Undo / Redo / Discard |
 * | the `editorEdits.ts` operations, {@link serializeBuilding}, {@link blankBuilding}, {@link OPERATIONAL_ZONING_NOTE} | `src/dev/editor.ts`'s form controls, one control per operation |
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
  type VizLeg,
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
  describeSelection,
  doorGlyph,
  drawScene,
  formatClock,
  type Canvas2DLike,
  type SceneInput,
  type SceneSelection,
  type Theme,
} from './render/canvas.js';
export {
  LOAD_ALARM,
  LOAD_FULL,
  drawOverlay,
  loadColour,
  loadTrackMax,
  type OverlayInput,
} from './render/overlay.js';
export { describeFrame, type DescribeFrameInput } from './render/describeFrame.js';
export { describePreview, drawPreview, type PreviewInput } from './render/preview.js';

export {
  DEFAULT_WINDOW_S,
  landingAssignmentAt,
  landingAssignmentsAt,
  overlayAt,
  type BankMetrics,
  type LandingAssignment,
  type OverlayMetrics,
  type OverlayOptions,
} from './frame/overlay.js';

export {
  readRecordingDocument,
  recordingFingerprint,
  verifyReplay,
  type RecordingLoad,
  type RecordingLoadFailure,
  type ReplayVerdict,
} from './record/document.js';

export {
  OPERATIONAL_ZONING_NOTE,
  addBank,
  addCar,
  addFloor,
  addFloorRange,
  blankBuilding,
  moveFloor,
  removeAccessZone,
  removeBank,
  removeCar,
  removeFloor,
  removeFloorRange,
  serializeBuilding,
  setBankServedFloors,
  setCarSpec,
  updateCar,
  updateFloor,
  upsertAccessZone,
} from './editorEdits.js';
export { EditorHistory, MIN_HISTORY_DEPTH, type HistoryState } from './editorHistory.js';
export { previewGeometry, type PreviewGeometry } from './editorPreview.js';
export {
  issuesMayBeIncomplete,
  summariseReport,
  validateBuilding,
  validateBuildingText,
  type ValidateOptions,
  type ValidationReport,
  type ValidationStage,
} from './editorValidate.js';
