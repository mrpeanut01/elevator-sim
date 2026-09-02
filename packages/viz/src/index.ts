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
 * `the root DECISIONS.md`: **`docs/01` should gain `viz/editor/`, and these four files
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
 * | {@link recordRun} | `src/dev/shiftWorker.ts`, which is where the browser viewer simulates — the shift (the UI readiness audit's B3 — it was `src/dev/main.ts` on the thread that paints) and, since GitHub issue #165, both Fix-a-building shells and Watch's reproduction gate through `src/dev/offThreadRuns.ts`; and `src/dev/main.ts#runChallenge` directly, for a challenge's seeds |
 * | {@link overlayAt} | `src/dev/main.ts`'s draw loop, every animation frame; and `drawScene` draws its result |
 * | {@link landingAssignmentsAt} | `src/dev/main.ts`'s landing selector and its draw loop |
 * | {@link meansAreSuppressed} | three of them, which is the point: `overlayAt` here, `drawHeader` in `src/render/canvas.ts`, and `statusLine` in `src/dev/main.ts` — `D1` |
 * | {@link overlayViewOf} | `src/dev/main.ts#drawLiveMetrics`, the DOM card under the stage — `docs/21` § 3.4 took this panel off the bitmap, and `drawOverlay` went with it |
 * | {@link loadColour}, {@link loadTrackMax}, {@link doorGlyph}, {@link describeSelection} | `src/render/canvas.ts` and `src/render/overlay.ts` |
 * | {@link loadTone} | both renderers of a car's load: `loadColour` here for the stage, and the live metrics card's tone class in `src/dev/main.ts` |
 * | {@link describeFrame} | `src/dev/main.ts`, as the canvas's `aria-label` and its live region — `KB-13` |
 * | {@link runSummaryFigures} | `disclosureItems` in `src/mode/disclosure.ts`, which `src/dev/main.ts` calls from `adopt` on every recording — `docs/10` § 11 **W2**, now through § 4's mode layer |
 * | {@link queueAt} | `src/dev/main.ts`'s draw loop, every animation frame — `docs/10` § 6, **U4** |
 * | {@link waitBandsOf}, {@link waitBandOf} | `queueAt`, in `src/frame/overlay.ts`, once per rider |
 * | {@link worseBand} | `queueAt`, for `FloorQueue.worstBand` |
 * | {@link planQueueRow} | `drawQueueRow` in `src/render/canvas.ts`, once per landing per frame |
 * | {@link riderMoodOf} | `planQueueRow`, which puts the mood on every glyph it emits |
 * | {@link describeQueue} | `describeFrame` in `src/render/describeFrame.ts` — § 6.3's clause |
 * | {@link BAND_GLYPH}, {@link BAND_WORDS}, {@link RELIEF_GLYPH} | `src/render/canvas.ts` and `describeQueue`. The shapes KB-15 requires beside the colours |
 * | {@link buildingMood}, {@link moodObservationsOf} | `src/dev/main.ts`'s draw loop; `drawMood` mounts the result and `drawScene` draws its headline |
 * | {@link MOOD_GLYPH} | `buildingMood`, in `src/render/mood.ts`. The building-scale half of KB-15 |
 * | {@link windowClause} | `drawFooter`, in `src/render/canvas.ts` — § 7.4 on the surface `Export PNG` writes to a file |
 * | {@link landingOptionLabel} | `src/dev/main.ts`'s `populateLandings`, one option per landing call |
 * | {@link readRecordingDocument} | `src/dev/main.ts`'s **Load recording** control — the version check's first real caller |
 * | {@link verifyReplay}, {@link recordingFingerprint} | `src/dev/main.ts`'s **Verify replay** control |
 * | {@link validateBuilding}, {@link validateBuildingText}, {@link summariseReport}, {@link issuesMayBeIncomplete} | `src/dev/editor.ts` |
 * | {@link previewGeometry} | `src/dev/editor.ts`'s live preview; and `drawPreview` |
 * | {@link drawPreview}, {@link describePreview} | `src/dev/editor.ts` |
 * | {@link EditorHistory} | `src/dev/editor.ts`'s Undo / Redo / Discard |
 * | the `editorEdits.ts` operations, {@link serializeBuilding}, {@link blankBuilding}, {@link OPERATIONAL_ZONING_NOTE} | `src/dev/editor.ts`'s form controls, one control per operation |
 * | {@link frameAt} | `Playback.frame()`, every animation frame from `src/dev/main.ts`; and `frameSequence` |
 * | {@link frameSequence}, {@link serializeFrames} | the replay-equivalence instrument — drivers are `replay.test.ts` and `record/document.test.ts`'s TP-10 round trip; the shipped caller they had in `saveRecording` was the TP-10 defect itself, removed § D198 |
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
 * | {@link controlsFor}, {@link applyControlEdit}, {@link resetControl}, {@link defaultValues}, {@link candidateOf}, {@link describeCondition} | `src/dev/parameterForm.ts` — W4's mount, `docs/10` § 11 |
 * | {@link renderControl}, {@link renderControls}, {@link renderUnsearchable}, {@link valueAtSliderPosition} | `src/dev/parameterForm.ts`; and `renderControl` from `renderControls`, in `src/controls/render.ts` |
 * | {@link renderSlider}, {@link renderStepper}, {@link renderSelect}, {@link renderCheckbox} | `renderControl`, in `src/controls/render.ts`. **Inside the module only** — the dispatch is the entry point and the four are its branches |
 * | {@link sliderPositionOf} | `renderSlider`, in `src/controls/render.ts`. Inside the module only |
 * | {@link inputIdOf}, {@link helpIdOf}, {@link SLIDER_STEPS} | `src/controls/render.ts`, in every renderer. Exported because a caller wiring events needs the same id derivation the renderer used, and two derivations of one id is how a label stops pointing at its input |
 * | {@link runBatch} | `src/dev/batchWorker.ts`, the worker the Compare tab starts — `docs/10` § 11 **W3** |
 * | {@link firstTraceDisagreement} | `runBatch`, once per arm per replication. **Inside the module only** — it is the CRN audit, and nothing outside has a second trace to compare |
 * | {@link batchReport} | `src/dev/batchPanel.ts`, on the main thread, when the worker returns |
 * | {@link BATCH_METRICS}, {@link BATCH_METRIC_CLASS}, {@link BATCH_METRIC_PRESENTATION} | `src/batch/report.ts` and `src/batch/runBatch.ts`; the class map is also what makes a ninth metric a compile error rather than a silent default |
 * | {@link MIN_REPLICATION_BUDGET}, {@link MAX_REPLICATION_BUDGET} | `batchReport`, in `src/batch/report.ts`. Inside the module only |
 * | {@link BatchError} | thrown by `runBatch`; caught and flattened by `src/dev/batchWorker.ts` |
 * | {@link goalReport} | `src/dev/batchPanel.ts`, on the batch the Compare tab just ran — `docs/10` § 11 **W9** |
 * | {@link measureGoalRate}, {@link judgeReplication} | `goalReport`, and `src/scenario/measure.ts`. R12's arithmetic, in one place |
 * | {@link asPerReplicationGoal} | `goalReport` in `src/scenario/goalReport.ts`, `measureScenario` in `src/scenario/measure.ts`, and `judgeStage` in `src/campaign/judge.ts` — all three of the callers that used to hold the guard by convention. It is also the gate a caller outside this package must pass to reach {@link judgeReplication} at all, because that function's parameter type is the narrowed one |
 * | {@link measureScenario}, {@link publishedScenarioFor} | `src/scenario/regenerate.test-helper.ts`, the driver that writes `data/scenario-goals.json`, and `src/scenario/goalRates.test.ts`, which re-derives it. **The only export here whose shipped caller is a driver rather than a screen**, and it is the shape `experiments/src/benchmark/regeneratePins.ts` already has: a published number needs something that can produce it again |
 * | {@link validatePublishedGoalRates} | `src/scenario/goalRates.test.ts` — the guard. A goal kind with no measured rate on a scenario is a failure, not an omission |
 * | {@link CANDIDATE_GOALS}, {@link CANDIDATE_SCENARIOS} | `goalReport`, `regenerate.test-helper.ts` and the guard |
 * | {@link parseCampaign}, {@link validateCampaign} | `loadCampaign` in `src/dev/data.ts`, called once by `src/dev/main.ts` before the Campaign tab is mounted — `docs/10` § 5.2 |
 * | {@link editableIdsOf} | `src/dev/campaignPanel.ts`, `src/campaign/brief.ts` and `parse.ts`'s lever check. One answer to *"may I move this?"* |
 * | {@link briefingFor} | `src/dev/campaignPanel.ts`'s left column, redrawn on every stage change |
 * | {@link admitProfile}, {@link movedDimensions} | `src/dev/campaignPanel.ts` — a profile outside the stage's editable set is refused with the dimension named, before the batch |
 * | {@link judgeStage} | `src/campaign/stageSequence.ts#runStageToVerdict`, and `dev/campaignPanel.ts` through it — **twice per stage**, once per seed set, because a stage clears on the tuning batch *and* on seeds it was not tuned against |
 * | {@link batchRequestForStage}, {@link demonstrationConfigFor}, {@link stageReplicationSeed} | `src/campaign/stageSequence.ts#runStageToVerdict`, which builds **both** batches so the two can differ only in their seed set; `dev/campaignPanel.ts` and `campaign.test.ts` reach them through it rather than assembling a second request — the shape § D159 calls *a fixture routing the test to the wrong code path*, one level up |
 * | {@link failStateCounts}, {@link evidenceFrom}, {@link failStateReports} | `src/dev/campaignPanel.ts` — § 5.3's four states, counted over the batch and diagnosed on one replayed replication |
 * | {@link PROBABILITY_WORDS}, {@link probabilityWordIn} | `src/campaign/parse.ts`, which refuses an authored brief that trips it — R10 at load time rather than in review |
 * | {@link disclosureItems} | `drawSummaryNow` in `src/dev/main.ts`, on every adopted recording and on every mode change; and `failStateDisclosure` in `src/dev/campaignPanel.ts` — `docs/10` § 4, **W6** |
 * | {@link parityRefusal} | the same two functions, on **exactly the items they are about to mount**, so § 4 is a property of the shipped path and not only of the suite |
 * | {@link parityViolations} | `parityRefusal`, in `src/mode/parity.ts`, and `mode/parity.test.ts`'s fictional fifth fail state |
 * | {@link itemsIn}, {@link renderingIn} | `drawRunSummary` in `src/dev/main.ts` and `draw` in `src/dev/campaignPanel.ts` — the one place a mode decides what is on screen |
 * | {@link disclosureClassOf} | `parityViolations`. **Inside the module only** — it is the classification the check is derived over, and a caller outside would be a second opinion about § 4's non-negotiable list |
 * | {@link VIEW_MODES}, {@link isViewMode} | `src/dev/main.ts`'s mode toggle, its URL key and its remembered preference |
 * | {@link resolveEditedProfile} | `armProfile` in `src/batch/runBatch.ts`, inside the worker, and `candidateProfileFor` in `src/dev/campaignPanel.ts`, before Run is enabled — **the same function on both sides**, which is what stops a pre-flight from passing what a run then rejects |
 * | {@link admitEditedVector} | `resolveEditedProfile`, and `dev/campaignPanel.ts` through it |
 * | {@link valuesFromProfile} | `src/dev/campaignPanel.ts`'s editor, to open on the chosen profile's own point |
 * | {@link applyEdit} | `admitEditedVector`, in `src/controls/editedProfile.ts`. Inside the module only — every write goes through `applyControlEdit`, so a second entry point would be a second bounds check |
 *
 * `frameSequence` and `serializeFrames` exist because Phase 4's acceptance criterion needs a
 * headless, browser-free way to compare two replays. The shipped **Verify replay** control now
 * compares {@link recordingFingerprint}s, and the pair's one shipped caller — `saveRecording`
 * writing their output into the saved document — turned out to be `TP-10` itself: the wrapper it
 * built was exactly what {@link readRecordingDocument} refuses, and the frames it carried were a
 * second copy of what the recording already determines (`replay.test.ts`'s reloaded-equals-
 * in-memory property). So since § D198 the pair is the replay-equivalence *instrument*, driven by
 * `replay.test.ts` and `record/document.test.ts`'s round trip, and `deadCode.test.ts` carries the
 * classification.
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
 *
 * The fifth audit's disposition wave (§ D192) removed two more in the same shape:
 *
 * - **`landingAssignmentAt`** was `landingAssignmentsAt`'s single-floor form, and its own table
 *   row already admitted *no caller outside this package*; inside it there was none either —
 *   `dev/main.ts` holds a {@link LandingAssignment}'s `key` and filters the plural form itself,
 *   which is the reason `key` is on the type.
 * - **`ControlKind`** was a type alias bound by nothing but this barrel — not even a test. The
 *   four kinds live on as the `kind` discriminants of the {@link Control} union, which is what
 *   every renderer actually switches on.
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
  landingOptionLabel,
  type Canvas2DLike,
  type SceneInput,
  type SceneSelection,
  type Theme,
} from './render/canvas.js';
export {
  LOAD_ALARM,
  LOAD_FULL,
  loadColour,
  loadTone,
  loadTrackMax,
  overlayViewOf,
  type LoadTone,
  type OverlayBankRow,
  type OverlayCarRow,
  type OverlayEstimate,
  type OverlayRow,
  type OverlayView,
} from './render/overlay.js';
export { describeFrame, type DescribeFrameInput } from './render/describeFrame.js';
/*
 * The figure ids and `FIGURE_ORDER` are deliberately **not** re-exported. They have no caller
 * outside their own module and its test — `runSummaryFigures` orders its own output by them — and
 * a barrel row whose honest entry reads *none* is what the note above this table is about.
 */
export {
  runSummaryFigures,
  windowClause,
  type SummaryBar,
  type SummaryFigure,
  type SummaryFigureKind,
  type SummarySeverity,
} from './render/runSummary.js';
export { describePreview, drawPreview, type PreviewInput } from './render/preview.js';

export {
  DEFAULT_RELIEF_WINDOW_S,
  DEFAULT_WINDOW_S,
  landingAssignmentsAt,
  meansAreSuppressed,
  overlayAt,
  queueAt,
  waitBandOf,
  waitBandsOf,
  worseBand,
  type BankMetrics,
  type FloorQueue,
  type LandingAssignment,
  type OverlayMetrics,
  type OverlayOptions,
  type QueueGroup,
  type QueueOptions,
  type QueuedRider,
  type WaitBand,
  type WaitBandThresholds,
} from './frame/overlay.js';

/* -------------------------------------------------------------------------- *
 * U4 — rider queues and the mood treatment painted on them (docs/10 § 6, D1 + D4)
 * -------------------------------------------------------------------------- */

export {
  BAND_GLYPH,
  BAND_WORDS,
  MAX_GLYPHS_WITH_COUNT,
  MAX_INDIVIDUAL_GLYPHS,
  RELIEF_GLYPH,
  describeQueue,
  planQueueRow,
  riderMoodOf,
  type QueueGlyph,
  type QueueRowInput,
  type QueueRowMode,
  type QueueRowPlan,
  type QueueSegment,
  type RiderMood,
} from './render/riderQueue.js';

export {
  MOOD_GLYPH,
  buildingMood,
  moodObservationsOf,
  type BuildingMood,
  type MoodDriver,
  type MoodLevel,
  type MoodObservations,
  type MoodSummary,
} from './render/mood.js';

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
} from './editor/editorEdits.js';
export { EditorHistory, MIN_HISTORY_DEPTH, type HistoryState } from './editor/editorHistory.js';
export { previewGeometry, type PreviewGeometry } from './editor/editorPreview.js';
export {
  issuesMayBeIncomplete,
  summariseReport,
  validateBuilding,
  validateBuildingText,
  type ValidateOptions,
  type ValidationReport,
  type ValidationStage,
} from './editor/editorValidate.js';

/* -------------------------------------------------------------------------- *
 * controls/ — the schema-generated parameter form (docs/10 § 11 W4)
 *
 * Pure: a search space plus a point in, one control per dimension out, and four
 * renderers keyed on the declared `type`. No DOM — `src/dev/parameterForm.ts` is
 * the one file that instantiates a `ControlNode`, and it is the non-test caller.
 * -------------------------------------------------------------------------- */

export {
  applyControlEdit,
  candidateOf,
  controlsFor,
  defaultValues,
  describeCondition,
  resetControl,
} from './controls/controls.js';

export type {
  CheckboxControl,
  Control,
  ControlCommon,
  ControlEdit,
  ControlValues,
  SelectControl,
  SliderControl,
  StepperControl,
} from './controls/types.js';

export {
  SLIDER_STEPS,
  helpIdOf,
  inputIdOf,
  renderCheckbox,
  renderControl,
  renderControls,
  renderSelect,
  renderSlider,
  renderStepper,
  renderUnsearchable,
  sliderPositionOf,
  valueAtSliderPosition,
} from './controls/render.js';

export type { ControlNode } from './controls/render.js';

/* -------------------------------------------------------------------------- *
 * batch/ — N paired replications, and the paired-t report on them (docs/10 § 11 W3)
 *
 * The single-run surface may say "in this run, X happened" and may not say
 * "this dispatcher is better" (R2). This is the other sentence. The statistics
 * are `@elevator-sim/experiments`' — `pairedDifferenceEstimate` and
 * `intervalContainsZero`, imported through the browser barrel — and nothing
 * statistical is computed in this package.
 * -------------------------------------------------------------------------- */

export {
  BATCH_METRICS,
  BATCH_METRIC_CLASS,
  BATCH_METRIC_PRESENTATION,
  type BatchArmRequest,
  type BatchArmResult,
  type BatchCrnAudit,
  type BatchCrnMismatch,
  type BatchMetric,
  type BatchMetricClass,
  type BatchMetricPresentation,
  type BatchProgress,
  type BatchReplication,
  type BatchRequest,
  type BatchResources,
  type BatchResult,
  type BatchWorkerMessage,
  type BatchWorkerRequest,
} from './batch/types.js';

export {
  BatchError,
  firstTraceDisagreement,
  runBatch,
  type RunBatchOptions,
} from './batch/runBatch.js';

export {
  MAX_REPLICATION_BUDGET,
  MIN_REPLICATION_BUDGET,
  batchReport,
  type BatchArmSummary,
  type BatchComparison,
  type BatchComparisonRow,
  type BatchReport,
  type BatchVerdict,
} from './batch/report.js';

/* -------------------------------------------------------------------------- *
 * scenario/ — R12 made mechanical: what a goal *is* on a configuration
 *   (docs/10 § 1 R12, § 5.2, § 11 W9)
 *
 * A goal that always passes or always fails is not a goal; a goal in between
 * is judged over a batch. This is the instrument that decides which, the seven
 * stages it was run on, the published table in `data/scenario-goals.json`, and
 * the validator that refuses a table with a kind in it unaccounted for.
 * -------------------------------------------------------------------------- */

export {
  DISPOSITION_OF,
  GOAL_BLOCKER,
  GOAL_JUDGEMENT,
  GOAL_KINDS,
  GOAL_READS,
  GOAL_TAKES_THRESHOLD,
  asPerReplicationGoal,
  goalLabel,
  isPerReplicationGoal,
  judgeReplication,
  measureGoalRate,
  type GoalDisposition,
  type GoalJudgement,
  type GoalKind,
  type GoalNarrowing,
  type GoalOutcome,
  type GoalRate,
  type GoalRateClass,
  type GoalSpec,
  type GoalUnjudgeable,
  type PerReplicationGoalKind,
  type PerReplicationGoalSpec,
} from './scenario/goals.js';

export {
  CANDIDATE_GOALS,
  CANDIDATE_SCENARIOS,
  LONG_WAIT_CEILING_PCT,
} from './scenario/candidates.js';

export {
  measureScenario,
  publishedScenarioFor,
  type GoalScenario,
  type MeasureOptions,
  type MeasuredGoal,
  type MeasuredScenario,
  type SeedSet,
} from './scenario/measure.js';

export {
  MIN_SEEDS_PER_GOAL,
  classOfCounts,
  validatePublishedGoalRates,
  type PublishedGoalRates,
  type PublishedGoalRecord,
  type PublishedRate,
  type PublishedScenario,
  type PublishedSeedSet,
} from './scenario/published.js';

export {
  goalReport,
  type GoalReport,
  type GoalReportRow,
  type GoalReportWithheld,
} from './scenario/goalReport.js';


/* -------------------------------------------------------------------------- *
 * The campaign — `docs/10-experience-layer-contract.md` § 5, W5
 *
 * Seven stages, as data validated by a schema. A goal is selected from
 * `data/scenario-goals.json`'s measured `goals` bucket and never authored; the
 * bar it is judged against is the count that table published for the shipped
 * setting on the same seeds; and every verdict comes from a batch, because R2
 * says one replication cannot support the sentence.
 * -------------------------------------------------------------------------- */

export {
  FAIL_STATES,
  type Campaign,
  type CampaignStage,
  type EditableDimensions,
  type FailState,
  type StageDispatcher,
  type StageTraffic,
} from './campaign/types.js';

export {
  CampaignError,
  editableIdsOf,
  parseCampaign,
  playerFacingStrings,
  validateCampaign,
  type CampaignContext,
} from './campaign/parse.js';

export { PROBABILITY_WORDS, probabilityWordIn } from './campaign/words.js';

export {
  admitProfile,
  movedDimensions,
  valueText,
  type MovedDimension,
  type ProfileAdmission,
} from './campaign/dimensions.js';

export { briefingFor, type BriefedDimension, type BriefingInput, type StageBriefing } from './campaign/brief.js';

export {
  judgeStage,
  type JudgeStageInput,
  type StageGoalVerdict,
  type StageReport,
} from './campaign/judge.js';

export {
  BASELINE_ARM_ID,
  CANDIDATE_ARM_ID,
  batchRequestForStage,
  demonstrationConfigFor,
  stageReplicationSeed,
  type DemonstrationInput,
} from './campaign/stageRun.js';

export {
  evidenceFrom,
  failStateCounts,
  failStateReports,
  type DemonstrationEvidence,
  type EvidenceInput,
  type FailStateCount,
  type FailStateReport,
  type FailStateReportInput,
  type NamedLanding,
} from './campaign/failStates.js';

/* -------------------------------------------------------------------------- *
 * Basic and Advanced — `docs/10-experience-layer-contract.md` § 4, W6
 *
 * A mode is a presentation, never a run: `mode/disclosure.ts` takes the run
 * summary and the fail states unaltered and answers one further question —
 * which of them may Basic leave out, and what must survive when it does.
 * `mode/parity.ts` is the check `DECISIONS.md` § D163 clause 2 measures Phase 9
 * against, and the reason it is a check rather than a second list is that it
 * names no fail state, no suppression ground and no figure id.
 * -------------------------------------------------------------------------- */

export {
  VIEW_MODES,
  disclosureClassOf,
  isViewMode,
  itemsIn,
  renderingIn,
  type DisclosureClass,
  type DisclosureItem,
  type DisclosureOrigin,
  type Rendering,
  type Severity,
  type ViewMode,
} from './mode/types.js';

export {
  BASIC_HIDES,
  BASIC_WINDOW_VALUE,
  SUPPRESSION_LEAD,
  disclosureItems,
  type DisclosureInput,
  type FailStateDisclosure,
} from './mode/disclosure.js';

export { parityRefusal, parityViolations, type ParityViolation } from './mode/parity.js';

/* -------------------------------------------------------------------------- *
 * The live weight editor — § 11 W6, closing § D161's known limitation
 * -------------------------------------------------------------------------- */

export {
  admitEditedVector,
  applyEdit,
  resolveEditedProfile,
  valuesFromProfile,
  type EditAdmission,
  type EditedProfileOutcome,
  type EditedVector,
} from './controls/editedProfile.js';
