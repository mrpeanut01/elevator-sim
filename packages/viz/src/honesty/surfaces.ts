/**
 * Driving every player-facing surface of the experience layer, and collecting what it said.
 *
 * ## The one rule this file exists to keep
 *
 * An adapter **renders**; it never judges. Everything a property needs in order to decide
 * whether a string is honest either comes out of the shipped surface's own classification —
 * `SummaryFigure.kind`, `BatchComparisonRow.verdict`, `BatchComparisonRow.favours`,
 * `GoalRate.disposition` — or out of the run's own statistics via `meansAreSuppressed`. Nothing
 * here decides that a mean is legitimate, that a comparison is resolved, or that a goal has a
 * rate. That is [`docs/10`](../../../../docs/10-experience-layer-contract.md) § 1 R9 —
 * *"one source of truth for 'may I show this'"* — applied to the instrument that checks R9.
 *
 * ## Why the canvas is driven rather than skipped
 *
 * `drawScene` and `drawPreview` are surfaces a player actually looks at, and they take a
 * `Canvas2DLike` — a **structural** interface with `fillText` on it and no DOM anywhere. So they
 * are driven with a context that records every `fillText`, and every string the bitmap would have
 * carried is checked exactly like a string a function returned. A search over the experience layer
 * that exempted the canvas would exempt the screen.
 *
 * `drawOverlay` was the third and is gone: `docs/21` § 3.4 made the live metrics panel a view and a
 * DOM card, so its strings arrive through {@link LIVE_METRICS} under **named fields** rather than as
 * `fillText[15]` of a captured array. That is the one thing the capture cannot give — per-string
 * provenance — and the migration is why it is now worth saying that the capture is a fallback for
 * what is genuinely a picture rather than the way this corpus prefers to read words.
 *
 * ## Coverage is asserted, never assumed
 *
 * Each adapter names the exported declarations it covers. `derive.ts` computes the set of
 * text-producing declarations **from the source tree**, and `derive.test.ts` fails when one is in
 * neither an adapter's `covers` nor the stated exclusion list. Separately, `honesty.test.ts`
 * asserts every adapter produced at least one string over the corpus: an adapter that renders
 * nothing is a dead adapter, and a dead adapter is how a search certifies a surface it never
 * looked at.
 */

import {
  RULE_ACTION_WORDS,
  RULE_ACTIONS,
  RULE_CONDITION_WORDS,
  RULE_CONDITIONS,
  type DispatcherProfiles,
  type ElevatorSpecs,
  type ResolvedBuilding,
  type TrafficProfiles,
} from '@elevator-sim/core/browser';

import { restrictedFloorIds } from '../access/zoning.js';
import { credentialLensFor, describeCredentialLens, LENS_LEGEND, LENS_OPERATIONAL_NOTE, STATE_WORDS } from '../access/zoning.js';
import { checkAccessCompatibility, credentialCapabilityOf } from '../access/dispatcherCredentials.js';
import { describeLockedOut, lockedOutLandingsAt, type LockedOutLanding } from '../access/lockedOut.js';
import { describePinnedQueues, pinnedQueuesAt, type PinnedQueue } from '../frame/pinnedQueue.js';
import { batchReport, populationLineOf, type BatchReport } from '../batch/report.js';
import { SuiteError, suiteCellViewOf, suitePlanOf, suiteSummaryOf } from '../batch/suite.js';
import { BATCH_METRIC_CLASS, BATCH_METRIC_PRESENTATION, BATCH_METRICS, type BatchResult, type BatchWorkerMessage } from '../batch/types.js';
import { briefingFor } from '../campaign/brief.js';
import { ACTION_BAR_ROWS, actionBarFor, confirmStripFor, TIMELINE_STEPS } from '../everyday/actionBar.js';
import {
  buildingLineOf,
  FIXIT_SCREEN_COPY,
  fixitBarModel,
  fixitCaseRailModel,
  fixitMachineryRows,
  fixitRepairStateLine,
  fixitSpendSummary,
} from '../everyday/fixitScreenModel.js';
import {
  benchBudgetNoteOf,
  benchEntrantsOf,
  benchFieldRefusal,
  benchResultViewOf,
  benchTestsOf,
  benchTestsRefusal,
  benchVerdictNoteOf,
  benchWorkLineOf,
  BENCH_COPY,
  BENCH_FIELD_MAX,
  BENCH_REPLICATION_CHOICES,
} from '../everyday/benchModel.js';
import {
  behaviourBlockOf,
  carriedBlocksOf,
  constraintCardsOf,
  libraryCardsOf,
  /* Aliased: `dev/leftRail.ts` and `dev/rightRail.ts` already export these two names. */
  mathsDisclosureOf as workshopMathsOf,
  nameplateOf as workshopNameplateOf,
  playStyleAbsenceOf,
  playStyleCardsOf,
  rulesBlockOf,
  switchingBlockOf,
  termDisclosureOf,
  workshopLeversOf,
  WORKSHOP_COPY,
} from '../everyday/workshopModel.js';
import { briefScreenViewOf, GHOST_REFUSAL, lockedForScore } from '../everyday/briefView.js';
import { doorScreenViewOf, DAY_OFFSET_MIN, DOOR_STEPS, SAME_FOR_EVERYONE } from '../everyday/doorView.js';
import { HOST_PENDING_REASON } from '../everyday/host.js';
import { EVERYDAY_MODES } from '../everyday/modes.js';
import { AVATAR_SWATCHES } from '../everyday/profile.js';
import { railModel, sublineFor } from '../everyday/rail.js';
import { SCREEN_NAMES, UNBUILT_REASONS } from '../everyday/screens.js';
import { everydayReportViewOf } from '../everyday/reportView.js';
import { settingsScreenViewOf } from '../everyday/settingsView.js';
import { EVERYDAY_SHELL_ABSENCES } from '../everyday/shell.js';
import {
  stageAlarmOf,
  stageBarModelOf,
  stageCrowdCapOf,
  stageHeaderOf,
  stageInkFor,
  stageInterventionsOf,
  stageLegend,
  STAGE_ABSENCES,
  STAGE_INTERVENTIONS,
  STAGE_NO_GHOST,
  STAGE_RECOMPUTING,
} from '../everyday/stageScreenModel.js';
import { todayOf } from '../everyday/today.js';
import {
  ENGINEER_RETURN_LABEL,
  ENGINEER_RETURN_TITLE,
  EVERYDAY_SCREENS,
  RUN_CONTEXTS,
} from '../everyday/types.js';
import { weekScreenViewOf } from '../everyday/weekView.js';
import { percentileLine, WORLD_FIGURES_ABSENT, WORLD_FIGURES_LABEL, WORLD_FIGURES_REASON } from '../everyday/world.js';
import type { GoalObservations } from '../shift/types.js';
import { buildingView, contractView, towersView } from '../everyday/campaignModel.js';
import {
  applyCampaignAction,
  freshTower,
  openingCareer,
  type CampaignCareer,
  type CampaignTower,
} from '../campaign/career.js';
import { admitProfile } from '../campaign/dimensions.js';
import { failStateCounts, failStateReports, evidenceFrom, type DemonstrationEvidence } from '../campaign/failStates.js';
import { judgeStage } from '../campaign/judge.js';
import { playerFacingStrings } from '../campaign/parse.js';
import { playerSafeDescription } from '../campaign/words.js';
import type { CampaignStage } from '../campaign/types.js';
import type { VizRecording } from '../contract/types.js';
import { applyControlEdit, controlsFor, defaultValues, resetControl } from '../controls/controls.js';
import { admitEditedVector, resolveEditedProfile, type EditedVector } from '../controls/editedProfile.js';
import type { ControlValues } from '../controls/types.js';
import { renderControls, renderUnsearchable, type ControlNode } from '../controls/render.js';
import { casualRefusalFor, disclosureItems } from '../mode/disclosure.js';
import { GLOSSARY_TERMS, glossaryFor } from '../mode/glossary.js';
import { parityRefusal, parityViolations } from '../mode/parity.js';
import { SIGNED_OUT, formIssues, postingRefusal, signedIn, updateForm } from '../menu/account.js';
import { catalogueOf, type CatalogueSource } from '../menu/catalogue.js';
import { screenOf } from '../menu/screens.js';
import { DEFAULT_SETTINGS, MENU_SCREENS } from '../menu/types.js';
import { CLIENT_FAILURES, type BoardEntry, type BoardPage } from '../menu/client.js';
import { canStart, freePlayIssues, initialMenuState } from '../menu/menu.js';
import { itemsIn, VIEW_MODES, type DisclosureOrigin } from '../mode/types.js';
import { OPERATIONAL_ZONING_NOTE } from '../editor/editorEdits.js';
import { previewGeometry } from '../editor/editorPreview.js';
import { summariseReport, validateBuilding, type ValidationReport } from '../editor/editorValidate.js';
import {
  STANDING_EXTRAS,
  budgetNoteOf,
  classifyOutcome,
  emptyFixitState,
  repairRowOf,
  spendOf,
  stepSpeed,
  toggleExtra,
  toggleRepair,
  type FixitMeasurement,
} from '../fixit/engine.js';
import { figureValuesOf, measuredOf } from '../fixit/run.js';
import type { FixitCase } from '../fixit/types.js';
import { frameAt } from '../frame/frameAt.js';
import { BOARD_SCREEN_COPY, DAILY_BOARD_ABSENCE } from '../everyday/boardScreen.js';
import {
  caseNameOf,
  caseNamesOf,
  ladderRowsOf,
  sendGateOf,
  whatAreTheFortyOf,
  LADDER_EMPTY,
  LADDER_WORLD_ABSENCE,
  REFERENCE_RUN_LABEL,
  type LadderEntry,
} from '../gauntlet/ladder.js';
import { proofCasesOf, type ProofCase, type ProofCaseSet } from '../gauntlet/proofCases.js';
import {
  proofCaseCountOf,
  ratingFigureOf,
  RATING_BASIS,
  RATING_CAVEAT,
  type RatingSummary,
} from '../gauntlet/rating.js';
import { runGauntlet, GAUNTLET_CANCELLED, type GauntletWorker } from '../gauntlet/run.js';
import { landingAssignmentsAt, meansAreSuppressed, overlayAt, queueAt, type FloorQueue, type LandingAssignment } from '../frame/overlay.js';
import { WAIT_BANDS, moodAt, waitBandsAt } from '../live/bands.js';
import { decisionRowsAt } from '../live/decisions.js';
import { honestyAt } from '../live/honesty.js';
import {
  interventionStampOf,
  PARK_CARS_LOBBY_LABEL,
  RECOMPUTING_BEAT,
  SWITCH_PINS_NOTE,
  switchDispatcherLabelOf,
} from '../live/interventions.js';
import {
  GHOST_OPTIONS,
  RACE_NOT_RUN,
  RACE_PENDING,
  raceStripViewOf,
  raceVerdictOf,
} from '../live/raceStrip.js';
import { DAY_HAS_NO_RECORD, refusalForDay } from '../watch/library.js';
import { recordUnreadableReason } from '../watch/record.js';
import { postedResultOf, reproductionRefusalFor } from '../watch/reproduce.js';
import type { WatchableRun } from '../watch/types.js';
import {
  PLAYER_SHELL_COPY,
  shellWatchingCopyOf,
  shellWatchingStrings,
} from '../watch/shell.js';
import { watchingStrings, watchingViewOf } from '../watch/view.js';
import { phaseAt, timelineOf } from '../live/timeline.js';
import { verifyReplay } from '../record/document.js';
import { DEFAULT_THEME, drawScene, describeSelection, landingOptionLabel, type Canvas2DLike, type SceneSelection } from '../render/canvas.js';
import { describeFrame, suppressionSentenceOf } from '../render/describeFrame.js';
import { buildLayout } from '../render/layout.js';
import { buildingMood, moodObservationsOf, type BuildingMood } from '../render/mood.js';
import { overlayViewOf } from '../render/overlay.js';
import { describePreview, drawPreview } from '../render/preview.js';
import { NO_SHEET_YET, reportCardOf, type CardRecipe } from '../render/reportCard.js';
import { runIdentityIssues } from '../scope/runIdentity.js';
import { ghostPlanOf } from '../dev/ghostRun.js';
import { initialState, shiftRunConfigOf, tomorrowFactsOf } from '../dev/state.js';
import { tomorrowBriefingOf } from '../shift/tomorrow.js';
import { describeQueue, planQueueRow } from '../render/riderQueue.js';
import { AWT_ID, ENERGY_ID, TTD_ID, WT95_ID, runSummaryFigures, windowClause } from '../render/runSummary.js';
import { goalReport } from '../scenario/goalReport.js';
import { goalLabel, GOAL_BLOCKER } from '../scenario/goals.js';
import type { PublishedScenario } from '../scenario/published.js';

/* ---- the design refactor's surfaces: the shift layer, the four editors, the panels ---- */
import {
  BLANK_SPEC,
  buildingAdvice,
  buildingFromSpec,
  buildingSummary,
  occupancyLine,
  SPEC_ROWS,
  specFromBuilding,
  upPeakAnalysisOf,
  validateSpec,
  type BuildingSpec,
} from '../authoring/buildingSpec.js';
import {
  adviceFor,
  blankSpec,
  costFunctionLine,
  DEFAULT_LEVERS,
  DWELL_CHOICES,
  DWELL_HINTS,
  inertTerms,
  profileFromSpec,
  specFromProfile,
  type DispatcherSpec,
} from '../authoring/dispatcherSpec.js';
import {
  classesFromSpecs,
  classFromSpec,
  MACHINE_ROWS,
  machineSummary,
  plainDescription,
  specFromClass,
  type MachineClass,
} from '../authoring/machineSpec.js';
import {
  DEFAULT_PATTERN,
  PATTERN_ROWS,
  patternSummary,
  PEAK_ORDERS,
  PEAK_ORDER_INFO,
  rowsFor,
  specFromTrafficProfile,
} from '../authoring/patternSpec.js';
import {
  accessMatrixOf,
  checkBuilding,
  elevationCarsOf,
  elevationNoteOf,
  elevationRowsOf,
  specRowsOf,
  speedChipsOf,
  transportNoteOf,
  zoneChoicesOf,
} from '../dev/buildingEditor.js';
import type { BrowserResources } from '../dev/data.js';
import { transportStatusOf } from '../dev/main.js';
import {
  dwellHintOf,
  flagLineOf,
  flagRowsOf,
  leverRowsOf,
  termRowsOf,
} from '../dev/dispatcherEditor.js';
import {
  FAMILY_ELSEWHERE,
  FAMILY_EYEBROW,
  FAMILY_NOTE,
  FLAG_OWNED,
  SELECTION_REFUSAL,
  familyControlsViewOf,
  familyPartitionOf,
} from '../dev/familyControls.js';
import {
  RULES_EXCLUSIVITY_NOTE,
  defaultRuleRow,
  fallbackLineOf,
  leverLineOf,
  readbackOf,
  ruleIssues,
  ruleProvenanceName,
  type RuleRow,
} from '../authoring/ruleSpec.js';
import {
  plainLeverEchoOf,
  plainLeverHelp,
  plainLeverSub,
  plainLeversOf,
} from '../mode/plainLevers.js';
import {
  goalRowsOf,
  historyBarsOf,
  idleDecisionRow,
  idleHonestyCard,
  idleMoodView,
  idleStatRowsOf,
  mathsDisclosureOf,
  moodDriverRowsOf,
  moodViewOf,
  runFiguresOf,
  servedCaptionFor,
  servedTitleFor,
  shiftIsOver,
  statRowsOf,
  streakLineOf,
  todayShareFor,
} from '../dev/leftRail.js';
import { machineRowsOf, ratedSpeedChipsOf, speedLadderOf } from '../dev/machinesEditor.js';
import {
  diagnosisRowsOf,
  emptyReportView,
  figureViewOf,
  goalRowViewOf,
  reportViewOf,
  runProgressOf,
  type ReportDeltaView,
} from '../dev/reportPanel.js';
import {
  buildingPlateOf,
  dispatcherBlurbOf,
  dispatcherCardOf,
  dispatcherFamilyOf,
  dispatcherNoteOf,
  dispatcherPlateOf,
  machineWarningOf,
  nameplateOf,
  patternOptionsOf,
  trafficPlateOf,
} from '../dev/rightRail.js';
import { scenarioCardsOf } from '../dev/scenariosPanel.js';
import {
  patternRowsOf,
  previewSegmentsOf,
  previewTemplateOf,
} from '../dev/trafficEditor.js';
import { moodOf } from '../live/bands.js';
import { observationsAt } from '../live/observations.js';
import { CONTRACTS, contractById, contractForBuilding, nextContract, statLineOf } from '../shift/contracts.js';
import { bankingRefusalFor, LOADED_RUN_CANNOT_BANK, UNCHOSEN_RUN_CANNOT_BANK } from '../shift/banking.js';
import { baseDemandOf, SHIFT_EVENTS, shiftRunPatch } from '../shift/events.js';
import { bestLineFor, goalsForDay, readGoal, readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import {
  averageWaitFigure,
  clockRange,
  dayReportOf,
  NOT_RECORDED,
  type ShapedDayReport,
  type ShiftPlan,
  type SingleRunReport,
  type WeekDayReport,
} from '../shift/report.js';
import {
  DAY_START_S,
  type DayReport,
  type GoalReading,
  type Observations,
  type ReportFigure,
  type ScenarioContract,
  type ShiftEvent,
  type ShiftGoal,
  type WeekState,
} from '../shift/types.js';
import {
  defaultSelectorSpec,
  patternLine,
  patternName,
  policyLine,
  selectorContextFrom,
  selectorIssues,
  specFromProfile as selectorSpecFromProfile,
  type SelectorSpec,
} from '../authoring/selectorSpec.js';
import { patternReadoutAt } from '../live/patternReadout.js';
import {
  armOptionsOf,
  armRowsOf,
  changedNoteOf,
  policyChipsOf,
  rulesOverrideNoteOf,
  scalarRowsOf,
  selectorAvailability,
} from '../dev/selectorEditor.js';
import {
  challengeNotOpenOf,
  challengeRunConfigs,
  challengeSubmissionOf,
  type ChallengeView,
} from '../menu/challenge.js';
import { claimedMetricsOf } from '../menu/client.js';
import {
  CALENDAR_PERIODS,
  CALENDAR_PERIOD_IDS,
  calendarDayFor,
  calendarLine,
  calendarPatch,
  periodOnDays,
  scheduledEventFor,
} from '../shift/calendar.js';
import { asBuiltChoices, movedChoiceText, movedChoices, withBankChoice } from '../commissioning/choices.js';
import { reviewCommissioning } from '../commissioning/refusals.js';
import { CONSTRAINTS, DIMENSION_LABELS, commissionableClasses } from '../commissioning/types.js';
import { libraryNoticeFor, restoreNoticeFor, saveNoticeFor } from '../persist/notice.js';
import { LIBRARY_BUDGET_CHARACTERS, type DroppedEntry } from '../persist/types.js';
import { loadSession } from '../persist/session.js';
import { SESSION_SCHEMA_VERSION, type SessionRestoreFailure, type SessionStore } from '../persist/types.js';
import {
  FREE_PLAY_CONTRACT_ID,
  closeDay,
  nextDay,
  openEndless,
  openWeek,
  outcomeOf,
} from '../shift/week.js';
import { coachWeekLines, weekKeptLine } from '../shift/weekLabel.js';

import type { WaitBandBasis } from '../live/types.js';

import { withheldStates, type WithheldState } from './generate.js';
import type {
  HonestyCase,
  RenderedText,
  TextProvenance,
  TextRole,
  TextPlayhead,
  WithheldFigure,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The context an adapter is handed
 * -------------------------------------------------------------------------- */

/** The campaign half of a case, present only when the case names a stage. */
export interface StageBundle {
  readonly stage: CampaignStage;
  readonly published: PublishedScenario;
  readonly dimensionIds: readonly string[];
  readonly dimensionHelp: ReadonlyMap<string, string>;
  readonly evidence: DemonstrationEvidence;
}

/** Everything an adapter may read. Assembled once per case by `run.ts`; never fetched here. */
export interface HonestyContext {
  readonly case: HonestyCase;
  /** The single replication every `single-run` surface is driven from. */
  readonly recording: VizRecording;
  /**
   * **The run before this one** — the second replication, on the case's candidate arm. Issue #127.
   *
   * Present so a surface that pairs two runs can be driven as a pairing rather than as a first
   * sheet. It is never the *subject* of a property: every check reads {@link recording}, so a
   * pairing adapter puts this one in the `before` column and the case's own run in the `after`,
   * which is what the shell does (`dev/reportPanel.ts#rotatedOn` — the sheet on screen is the new
   * one). An adapter that put it the other way round would be asking R3 about a run the context
   * does not describe.
   *
   * `run.ts#comparisonConfigFor` says why it is a second simulation and why it is the candidate arm.
   */
  readonly comparisonRecording: VizRecording;
  /** What the run's own summary says about its estimates. R9's one gate, asked once. */
  readonly suppressed: boolean;
  readonly batch: BatchResult;
  readonly report: BatchReport;
  readonly stage: StageBundle | undefined;
  /** Floors inside an access zone, and whether the case's dispatcher reads a credential. */
  readonly access: {
    readonly restrictedFloorIds: readonly string[];
    readonly carriesCredential: boolean;
  };
  /** `collectSearchSpace()`, handed in so this module never reaches for `experiments`' Node surface. */
  readonly space: ControlSpace;
  /** The building document, for the editor surfaces. */
  readonly buildingDocument: unknown;
  readonly elevatorSpecs: Parameters<typeof validateBuilding>[1];
  readonly profiles: readonly Parameters<typeof credentialCapabilityOf>[0][];
  readonly accessZones: Parameters<typeof restrictedFloorIds>[1];
  readonly floorIds: readonly string[];
  readonly buildingName: string;
  /**
   * The case's own resolved building.
   *
   * Added for the authoring and shift surfaces, which take a building rather than a recording:
   * `statLineOf` derives a scenario card's spec line from it (`docs/12` § 4.4 — *"generated from
   * the building JSON, not authored"*), `specFromBuilding` reads it back into the editor's shape,
   * and `shiftRunPatch` needs its banks to decide which car an event holds. It is the **same**
   * object `run.ts` already resolved for the recording, not a second lookup.
   */
  readonly building: ResolvedBuilding;
  /**
   * Every shipped building, as the page loads them.
   *
   * The scenarios grid draws all five cards at once, so a search that handed it one building would
   * render four *"no building is loaded"* refusals and call the surface driven.
   */
  readonly buildings: readonly ResolvedBuilding[];
  /** For the pattern editor, which opens on the building's own demand rather than on a default. */
  readonly trafficProfiles: TrafficProfiles;
  /**
   * The whole of `data/dispatcher-profiles.json`, not its `profiles` array.
   *
   * The dispatcher editor draws one row per **cost term** and puts the term's own `measures`
   * sentence in the tooltip, and the term library is a file-level block. `dev/data.ts` carries the
   * whole file for the same reason and says so.
   */
  readonly dispatcherProfiles: DispatcherProfiles;
  /**
   * One instant's frame, metrics, queues, assignments, lock-outs and mood — **memoised**.
   *
   * Six adapters want the same instant, and before this was memoised each of them re-scanned the
   * whole recording for it: `queueAt` and `overlayAt` are single passes over every leg, and at
   * five instants × six adapters that was thirty passes per case for five instants' worth of
   * data. Assembled once, in `run.ts`, exactly the way `dev/main.ts` assembles it.
   */
  readonly bundleAt: (at: number) => FrameBundle;
}

/** Just enough of `SearchSpace` for the controls surfaces, so the type does not cross a barrel. */
export type ControlSpace = Parameters<typeof controlsFor>[0];

/** One surface, and how to make it speak. */
export interface SurfaceAdapter {
  /** `<module>#<export>` — the id `derive.ts` produces, and the one a violation names. */
  readonly id: string;
  /**
   * Every exported declaration this adapter drives, as `<module>#<export>`.
   *
   * More than one when a covered export is reached only *through* another — `renderSlider` is
   * only ever called by `renderControls`, and listing it here is the claim that driving the
   * second drives the first. `derive.test.ts` reads this list; it is not decoration.
   */
  readonly covers: readonly string[];
  render(context: HonestyContext): readonly RenderedText[];
}

/* -------------------------------------------------------------------------- *
 * Small helpers
 * -------------------------------------------------------------------------- */

/**
 * A `Canvas2DLike` that draws nothing and remembers every string.
 *
 * The interface has no `measureText`, so nothing here has to approximate a font metric: the
 * renderers budget in pixels and ellipsise themselves. What comes back is exactly the text the
 * bitmap would have carried.
 */
export function textCapturingContext(): Canvas2DLike & { readonly texts: readonly string[] } {
  const texts: string[] = [];
  return {
    texts,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    globalAlpha: 1,
    save() {},
    restore() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    // The four path and shape members `Canvas2DLike` gained with the design handoff's stage. They
    // are no-ops here for the same reason every other geometry member is: this context exists to
    // answer *what did the surface say*, and a rounded car says nothing.
    quadraticCurveTo() {},
    arc() {},
    fill() {},
    stroke() {},
    fillText(text: string) {
      if (text.trim() !== '') texts.push(text);
    },
  };
}

function flatten(node: ControlNode, into: string[]): void {
  if (node.text !== undefined && node.text.trim() !== '') into.push(node.text);
  for (const child of node.children) flatten(child, into);
}

/**
 * The class `controls/render.ts` puts on the node that carries `SearchParameter.description`.
 *
 * Read rather than guessed: `renderControl` draws the description into
 * `node('p', { class: 'control-help', … }, [], control.help)`, and `control.help` **is**
 * `parameter.description`, verbatim. That is what makes {@link TextProvenance} `schema` a
 * structural fact about where a string came from rather than a judgement about what it says —
 * see `properties.ts` § *Scoped to result-bearing text*.
 */
const CONTROL_HELP_CLASS = 'control-help';

/** Flatten, remembering which nodes are `core`'s own schema text rather than the viewer's. */
function flattenTagged(
  node: ControlNode,
  into: { readonly text: string; readonly schema: boolean }[],
  schema = false,
): void {
  const isSchema = schema || node.attrs['class'] === CONTROL_HELP_CLASS;
  if (node.text !== undefined && node.text.trim() !== '') into.push({ text: node.text, schema: isSchema });
  for (const child of node.children) flattenTagged(child, into, isSchema);
}

/** The instants a single-run surface is sampled at: start, quarters, and the very end. */
export function sampleTimes(recording: VizRecording): readonly number[] {
  const span = recording.endedAt - recording.startedAt;
  return [0, 0.25, 0.5, 0.75, 1].map((fraction) => recording.startedAt + span * fraction);
}

interface TextSeed {
  readonly field: string;
  readonly text: string;
  readonly role?: TextRole;
  /**
   * Overrides the surface's default provenance.
   *
   * Only ever narrower, and only ever for the one class the adapter can identify structurally:
   * a string a *schema* authored, which a surface re-prints unaltered.
   */
  readonly provenance?: TextProvenance;
  readonly declaredCount?: number | null | undefined;
  readonly countShown?: boolean | undefined;
  readonly energyAxis?: boolean | undefined;
  readonly gated?: boolean | undefined;
  /** When the surface said it, for a surface driven at a playhead — see {@link atPlayhead}. */
  readonly playhead?: TextPlayhead | undefined;
  /** That this cell stands where a figure the state withholds would be — see {@link WithheldFigure}. */
  readonly withheld?: WithheldFigure | undefined;
}

/**
 * The window seed for a surface driven at `at` — the one place a playhead becomes a declaration.
 *
 * `basis` is passed only by a caller that has a shipped type carrying it. Everything else gets the
 * clock and nothing more, which is what puts it on the textual half of the temporal property
 * without claiming a declaration it never made.
 */
function atPlayhead(recording: VizRecording, at: number, basis?: WaitBandBasis): TextPlayhead {
  return { atS: at, endedAt: recording.endedAt, ...(basis === undefined ? {} : { basis }) };
}

/**
 * The basis the **rail** chooses at this playhead, asked of the rail rather than recomputed.
 *
 * `dev/leftRail.ts#shiftIsOver` is exported for exactly this, and says so: *"a probe that recomputed
 * `t >= endedAt` would assert its own arithmetic and say nothing about the rail."* `basisAt` — the
 * rail's private one-liner over it — is what `drawMood` and `drawHonesty` pass to `waitBandsAt` and
 * `honestyAt`, so a sweep that took those functions' **defaults** was rendering the live copy at
 * `endedAt` where the screen shows the retrospective one. It did, until this axis landed.
 */
function railBasisAt(recording: VizRecording, at: number): WaitBandBasis {
  return shiftIsOver(recording, at) ? 'whole-run' : 'now';
}

/**
 * The dispatcher's display name, resolved exactly as the shell resolves it — `docs/20` defect 9.
 *
 * `dev/main.ts#dispatcherNameOf` is the lookup: exact id against the loaded profiles, falling back
 * to the recording's own string. It is spelled again here rather than imported because
 * `honesty/` may not import `dev/main.ts` (it mounts a page), and it is the *lookup* that is
 * duplicated rather than a wording — the string this produces is a profile's authored `name`, from
 * `data/dispatcher-profiles.json`, which is the same file both readers consult.
 *
 * Driving the canvas and the frame description **without** it would sweep the arm no player sees:
 * the id is the fallback, and a corpus that only ever exercises a fallback measures the surface a
 * probe gets rather than the one a reader gets.
 */
function dispatcherNameOf(context: HonestyContext): string {
  const found = context.dispatcherProfiles.profiles.find(
    (profile) => profile.id === context.recording.dispatcherProfileId,
  );
  return found?.name ?? context.recording.dispatcherProfileId;
}

function singleRun(surfaceId: string, seeds: readonly TextSeed[]): readonly RenderedText[] {
  return seeds
    .filter((seed) => seed.text.trim() !== '')
    .map((seed) => ({
      surfaceId,
      field: seed.field,
      text: seed.text,
      role: seed.role ?? 'prose',
      provenance: seed.provenance ?? ('single-run' as const),
      declaredCount: seed.declaredCount,
      countShown: seed.countShown,
      energyAxis: seed.energyAxis,
      gated: seed.gated,
      playhead: seed.playhead,
      withheld: seed.withheld,
    }));
}

/* -------------------------------------------------------------------------- *
 * Frame-time inputs, derived exactly the way `dev/main.ts` derives them
 * -------------------------------------------------------------------------- */

function unservedFloors(recording: VizRecording): readonly string[] {
  const served = new Set(recording.shafts.flatMap((shaft) => shaft.servedFloorIds));
  return recording.floors.map((floor) => floor.id).filter((id) => !served.has(id));
}

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

export interface FrameBundle {
  readonly at: number;
  readonly frame: ReturnType<typeof frameAt>;
  readonly metrics: ReturnType<typeof overlayAt>;
  readonly queues: readonly FloorQueue[];
  readonly assignments: readonly LandingAssignment[];
  readonly unanswered: readonly string[];
  readonly lockedOut: readonly LockedOutLanding[];
  readonly mood: BuildingMood;
}

/**
 * One instant, assembled the way `dev/main.ts` assembles it.
 *
 * Deliberately a copy of the shipped call site's *inputs* rather than a call into it: `dev/` is
 * DOM-bound and cannot be driven under Node. The inputs are copied line for line, and the
 * duplication is stated rather than hidden — `derive.test.ts` excludes `dev/main.ts` with this
 * reason attached, so nobody reads this file as covering it.
 */
export function buildFrameBundle(
  recording: VizRecording,
  access: HonestyContext['access'],
  at: number,
): FrameBundle {
  const frame = frameAt(recording, at);
  const metrics = overlayAt(recording, at);
  const queues = queueAt(recording, at);
  const assignments = landingAssignmentsAt(recording, at);
  const unanswered = unansweredCallFloors(recording, assignments);
  const lockedOut = lockedOutLandingsAt({
    recording,
    at,
    restrictedFloorIds: access.restrictedFloorIds,
    carriesCredential: access.carriesCredential,
  });
  const mood = buildingMood(moodObservationsOf(recording, queues, at));
  return { at, frame, metrics, queues, assignments, unanswered, lockedOut, mood };
}

/** The memoised accessor `run.ts` puts on the context. One instant is computed at most once. */
export function memoisedBundles(
  recording: VizRecording,
  access: HonestyContext['access'],
): (at: number) => FrameBundle {
  const cache = new Map<number, FrameBundle>();
  return (at) => {
    const hit = cache.get(at);
    if (hit !== undefined) return hit;
    const bundle = buildFrameBundle(recording, access, at);
    cache.set(at, bundle);
    return bundle;
  };
}

/* -------------------------------------------------------------------------- *
 * The adapters
 * -------------------------------------------------------------------------- */

const RUN_SUMMARY: SurfaceAdapter = {
  id: 'render/runSummary.ts#runSummaryFigures',
  covers: ['render/runSummary.ts#runSummaryFigures', 'render/runSummary.ts#windowClause'],
  render(context) {
    const surfaceId = this.id;
    const seeds: TextSeed[] = [];
    for (const [index, figure] of runSummaryFigures(context.recording).entries()) {
      /*
       * The figure's *own* classification decides the role. This is the whole of the adapter's
       * contract: `render/runSummary.ts` already asks `meansAreSuppressed` and already writes
       * `kind: 'suppressed'` when the answer is yes, so a figure that comes back `estimate` on a
       * suppressed run is the surface asserting something the summary refuses — and the property
       * says so rather than this file second-guessing the classification.
       */
      const role: TextRole =
        figure.kind === 'estimate'
          ? 'estimate'
          : figure.kind === 'suppressed'
            ? 'suppressed'
            : figure.kind === 'observation'
              ? 'observation'
              : 'label';
      const isEnergy = figure.id === ENERGY_ID;
      // The three quantities `awtIsValid` speaks for, by their shipped ids.
      const gated = figure.id === AWT_ID || figure.id === WT95_ID || figure.id === TTD_ID;
      seeds.push({
        field: `figures[${String(index)}](${figure.id}).value`,
        text: `${figure.label}: ${figure.value}`,
        role,
        declaredCount: figure.count === undefined ? undefined : countOf(figure.count),
        countShown: figure.count !== undefined,
        energyAxis: isEnergy,
        gated,
      });
      if (figure.note !== undefined) {
        seeds.push({
          field: `figures[${String(index)}](${figure.id}).note`,
          // A suppressed figure's note *is* the refusal, and a refusal quotes numbers legitimately.
          text: figure.note,
          role: figure.kind === 'suppressed' ? 'reason' : role === 'estimate' ? 'estimate' : 'prose',
          declaredCount: figure.count === undefined ? undefined : countOf(figure.count),
          countShown: figure.count !== undefined,
          energyAxis: isEnergy,
          gated,
        });
      }
      for (const [barIndex, bar] of figure.bars.entries()) {
        seeds.push({
          field: `figures[${String(index)}](${figure.id}).bars[${String(barIndex)}]`,
          text: `${bar.label}: ${bar.text}`,
          role: 'observation',
          energyAxis: isEnergy,
        });
      }
    }
    seeds.push({ field: 'windowClause', text: windowClause(context.recording.summary), role: 'label' });
    return singleRun(surfaceId, seeds);
  },
};

/** The first integer in a `count` string — `"over 5 rides"` → `5`. `null` when it names none. */
function countOf(count: string): number | null {
  const found = /(\d[\d\s,]*)/.exec(count);
  if (found?.[1] === undefined) return null;
  const value = Number(found[1].replace(/[\s,]/g, ''));
  return Number.isFinite(value) ? value : null;
}

const DESCRIBE_FRAME: SurfaceAdapter = {
  id: 'render/describeFrame.ts#describeFrame',
  covers: [
    'render/describeFrame.ts#describeFrame',
    /*
     * The paragraph's refusal clause — `docs/20` defect 3. `describeFrame` is its only non-test
     * caller and it is seeded again below under its own field, because a clause folded into a
     * paragraph carries no basis and R6's structural half reads nothing else.
     */
    'render/describeFrame.ts#suppressionSentenceOf',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    for (const at of sampleTimes(context.recording)) {
      const bundle = context.bundleAt(at);
      seeds.push({
        field: `describeFrame(@${at.toFixed(0)}s)`,
        text: describeFrame({
          recording: context.recording,
          frame: bundle.frame,
          metrics: bundle.metrics,
          unansweredCallFloorIds: bundle.unanswered,
          lockedOutLandings: bundle.lockedOut,
          queues: bundle.queues,
          mood: bundle.mood,
          // The name a player reads, not the id a probe would default to. See `dispatcherNameOf`.
          dispatcherName: dispatcherNameOf(context),
        }),
        role: 'prose',
        /*
         * On the temporal axis with no `basis`, and that is the honest declaration: `describeFrame`
         * composes one paragraph out of live frame data, live queues, run-level status and — when a
         * caller passes one — the mood's drivers, and it declares nothing about which of those folds
         * which window. So the structural half cannot reach it and the textual half is what does.
         */
        playhead: atPlayhead(context.recording, at),
      });
      /*
       * **The refusal clause, on the temporal axis with its own basis** — `docs/20` defect 3.
       *
       * Seeded separately from the paragraph above, and that is what makes it reachable: R6's
       * structural half reads a declaration, R6's textual half reads a numeral, and this clause has
       * a declaration and no numeral. Folded into the paragraph it was a `role: 'prose'` string with
       * no basis, which is exactly how *"Queue length rose by 128.7 persons … the system is
       * saturated"* travelled the corpus unremarked at 14 % of every case.
       *
       * `suppressionSentenceOf` is the **product's** function and returns both halves together, so
       * the adapter declares what the product declares rather than deciding a window here — the
       * `railBasisAt` rule, applied to a sentence instead of a card.
       */
      const suppression = suppressionSentenceOf(context.recording, bundle.frame);
      if (suppression !== undefined) {
        seeds.push({
          field: `describeFrame(@${at.toFixed(0)}s).suppression`,
          text: suppression.text,
          role: 'reason',
          playhead: atPlayhead(context.recording, at, suppression.basis),
        });
      }
    }
    return singleRun(this.id, seeds);
  },
};

const OVERLAY: SurfaceAdapter = {
  id: 'frame/overlay.ts#overlayAt',
  covers: ['frame/overlay.ts#overlayAt'],
  render(context) {
    const seeds: TextSeed[] = [];
    for (const at of sampleTimes(context.recording)) {
      const { metrics } = context.bundleAt(at);
      if (metrics.suppressionReason !== undefined) {
        seeds.push({
          field: `overlayAt(@${at.toFixed(0)}s).suppressionReason`,
          text: metrics.suppressionReason,
          role: 'reason',
          /*
           * The **producer's** field, declared with the producer's own basis. It is `core`'s
           * whole-run sentence and it is carried on every `OverlayMetrics`, so it is `'whole-run'`
           * only where `overlayAt` says the playhead has earned it — which is never early, which is
           * correct: `frame/overlay.ts` is not a surface, and whether this string reaches a reader
           * early is `render/overlay.ts`'s decision. That decision is swept below, where the panel
           * is driven.
           */
          playhead: atPlayhead(context.recording, at, metrics.suppressionBasis),
        });
      }
      /*
       * The rolling mean is the estimate R3 is about at frame time, and it is reported here
       * **only on a suppressed run** — where its presence *is* the leak, because
       * `render/overlay.ts` prints `metrics.rollingMeanWaitS.toFixed(1)` whenever it is defined.
       *
       * On an unsuppressed run the number is legitimate and the string that carries it is
       * `drawOverlay`'s, not this adapter's. Synthesising one here and then judging its `n` would
       * be judging a sentence the harness wrote — which is the one thing an adapter must never do,
       * and which the first run of this search did before it was corrected.
       */
      if (context.suppressed) {
        if (metrics.rollingMeanWaitS !== undefined) {
          seeds.push({
            field: `overlayAt(@${at.toFixed(0)}s).rollingMeanWaitS`,
            text: `rolling mean wait ${metrics.rollingMeanWaitS.toFixed(1)} s`,
            role: 'estimate',
            gated: true,
            playhead: atPlayhead(context.recording, at),
          });
        }
        for (const [index, bank] of metrics.banks.entries()) {
          if (bank.meanWaitS === undefined) continue;
          seeds.push({
            field: `overlayAt(@${at.toFixed(0)}s).banks[${String(index)}].meanWaitS`,
            text: `${bank.bankId} mean wait ${bank.meanWaitS.toFixed(1)} s`,
            role: 'estimate',
            gated: true,
            playhead: atPlayhead(context.recording, at),
          });
        }
      }
    }
    return singleRun(this.id, seeds);
  },
};

const CANVAS: SurfaceAdapter = {
  id: 'render/canvas.ts#drawScene',
  covers: [
    'render/canvas.ts#drawScene',
    'render/canvas.ts#describeSelection',
    'render/canvas.ts#landingOptionLabel',
    'render/canvas.ts#fitLabel',
    /*
     * The header banner's Casual refusal — GitHub issue #100. Declared in `mode/disclosure.ts`
     * beside the per-ground table it reads, and **driven from here**, because `drawHeader` is its
     * only caller and a surface is covered by whoever renders it. `suppressionLeadFor`, the long
     * projection of the same row, is covered by the `MODE` adapter for the same reason: it is driven
     * by the two surfaces that draw *it*. One table, two projections, two drivers.
     */
    'mode/disclosure.ts#suppressionBannerFor',
    'mode/disclosure.ts#NO_AVERAGE_LEAD',
    /*
     * The stage's crowd, reached only through `drawScene` — the `renderSlider`/`renderControls`
     * case this interface's `covers` docstring names.
     *
     * This is a **coverage claim, not an exclusion**: the adapter below passes `bundle.queues`, so
     * a landing deep enough to overflow its lane really does draw its `+N` into the corpus at
     * every sampled instant, and a landing past the alarm depth really does execute the rule.
     * They are listed because the derivation finds them (a font string and an `rgba()` builder
     * read as prose to the two-adjacent-words scanner) and an unclassified producer is red — not
     * because anything about them is exempt.
     */
    'render/riderFigures.ts#drawRiderLane',
    'render/riderFigures.ts#drawAlarmRule',
    /*
     * `loadColour` is the same reading, one file over, and it arrived in this list the day the four
     * load bands were named: its arms read `'at-design-load'` now rather than a bare `theme.X`, and
     * a hyphen is a word break to the two-adjacent-words scanner. It returns a **colour**, and it is
     * listed rather than excluded because `drawScene` really does call it on every car of every
     * frame this adapter draws — a coverage claim, on the precedent two lines up.
     */
    'render/overlay.ts#loadColour',
  ],
  render(context) {
    const { recording } = context;
    const seeds: TextSeed[] = [];
    const layout = buildLayout({
      width: 1440,
      height: 900,
      floors: recording.floors,
      shafts: recording.shafts,
      gutterRightPx: 168,
    });
    for (const at of sampleTimes(recording)) {
      const bundle = context.bundleAt(at);
      const selection: SceneSelection | undefined =
        bundle.assignments[0] === undefined
          ? undefined
          : {
              floorId: bundle.assignments[0].floorId,
              ...(bundle.assignments[0].answeredByCarId === undefined
                ? {}
                : { answeredByCarId: bundle.assignments[0].answeredByCarId }),
              waiting: bundle.assignments[0].waiting,
            };
      /*
       * **`drawScene` in both registers, and the claim that used to stand here is retired.**
       *
       * It read: *"`drawScene` above is left at its default, and that is a claim rather than an
       * oversight: `render/canvas.ts` passes `input.mode` to `drawOverlay` and to nothing else, so
       * every mode-sensitive string it can emit is emitted here, twice."* True when it was written
       * and false the moment GitHub issue #100's second panel landed — the header band's refusal,
       * its running mean and the word in front of the waiting count all move with the mode now. A
       * corpus that swept one register of a two-register surface would have been sweeping half a
       * screen while reporting a whole one, which is the failure the temporal axis was grown to stop
       * one dimension over.
       *
       * Both passes carry every non-mode input, so the two differ by the mode and by nothing else.
       */
      for (const mode of VIEW_MODES) {
        const ctx = textCapturingContext();
        drawScene(ctx, {
          recording,
          frame: bundle.frame,
          // See `dispatcherNameOf` — the subtitle a player reads is the profile's name.
          dispatcherName: dispatcherNameOf(context),
          layout,
          ...(selection === undefined ? {} : { selection }),
          unservedFloorIds: unservedFloors(recording),
          unansweredCallFloorIds: bundle.unanswered,
          lockedOutLandings: bundle.lockedOut,
          queues: bundle.queues,
          mood: bundle.mood,
          mode,
        });
        for (const [index, text] of ctx.texts.entries()) {
          seeds.push({
            field: `drawScene(${mode}@${at.toFixed(0)}s).fillText[${String(index)}]`,
            text,
            role: 'prose',
            playhead: atPlayhead(recording, at),
          });
        }
      }
      if (selection !== undefined) {
        seeds.push({
          field: `describeSelection(@${at.toFixed(0)}s)`,
          text: describeSelection(selection),
          role: 'prose',
          playhead: atPlayhead(recording, at),
        });
      }
      for (const [index, assignment] of bundle.assignments.slice(0, 4).entries()) {
        seeds.push({
          field: `landingOptionLabel(@${at.toFixed(0)}s)[${String(index)}]`,
          text: landingOptionLabel(assignment),
          role: 'label',
          playhead: atPlayhead(recording, at),
        });
      }
    }
    return singleRun(this.id, seeds);
  },
};

/**
 * The mood gauge — `render/mood.ts#buildingMood`, **as a renderer is obliged to draw it.**
 *
 * ## Why the drivers are gated here rather than listed whole
 *
 * `BuildingMood.drivers` is *every observation consulted*, and four of the five carry
 * `basis: 'whole-run'` — `recordRun` simulates the day up front, so `summary.saturated`,
 * `summary.serviceLevel`, `summary.delivered` and `summary.handlingCapacity` are the end of the
 * shift by the first frame of it. The producer publishing them in its return value is correct; a
 * renderer drawing them at a part-way playhead is issue #109, and `dev/leftRail.ts` gates them
 * (§ D293).
 *
 * This adapter used to seed **all five at all five playheads**, which made the corpus claim a player
 * reads four sentences the product deliberately withholds — and `RenderedText`'s own docstring is
 * *"one string a player would actually see."* It now drives `moodDriverRowsOf`, which is
 * `moodDriverPanelOf` reached through its exported door and whose docstring names *"the honesty
 * sweep, chiefly"* as the caller it exists for. So the retraction row enters the corpus for the
 * first time, the four withheld sentences leave it at the four early playheads, and both are still
 * checked in full at `endedAt` where the card actually publishes them.
 *
 * The basis travels with the row: `MoodDriverRow` drops it, so it is looked back up on the driver
 * whose label the row carries — the same join the rail makes when it styles a row by its level.
 */
const MOOD: SurfaceAdapter = {
  id: 'render/mood.ts#buildingMood',
  covers: ['render/mood.ts#buildingMood'],
  render(context) {
    const seeds: TextSeed[] = [];
    for (const at of sampleTimes(context.recording)) {
      const { mood } = context.bundleAt(at);
      const stamp = at.toFixed(0);
      seeds.push({
        field: `mood(@${stamp}s).headline`,
        text: mood.headline,
        role: 'observation',
        playhead: atPlayhead(context.recording, at),
      });
      if (mood.caveat !== '') {
        seeds.push({ field: `mood(@${stamp}s).caveat`, text: mood.caveat, role: 'prose' });
      }
      const basisOf = new Map(mood.drivers.map((driver) => [driver.label, driver] as const));
      for (const [index, row] of moodDriverRowsOf(mood).entries()) {
        const driver = basisOf.get(row.label);
        seeds.push({
          field: `mood(@${stamp}s).drivers[${String(index)}](${driver?.id ?? 'retraction'})`,
          text: `${row.label}: ${row.text}`,
          /*
           * The retraction is not one of the drivers, and it is a `reason` rather than an
           * `observation`: it names what the card has stopped showing. R6's own remedy may not be
           * the thing R6 refuses.
           */
          role: driver === undefined ? 'reason' : 'observation',
          playhead: atPlayhead(context.recording, at, driver?.basis),
        });
      }
    }
    return singleRun(this.id, seeds);
  },
};

/**
 * The design handoff's left rail and transport — `src/live/`.
 *
 * Every string these produce is a sentence a player reads on the primary screen, so they are
 * **driven** rather than excluded: the mood headline, the four band labels, the timeline's chips
 * and titles, the decision log's heads and reasons, and the honesty card in both disclosure
 * modes. Driving both modes matters more here than anywhere else in the file — the card's whole
 * job is to say whether an estimate may be quoted, and a search that only ever rendered the
 * casual half would never see the sentence that quotes the refusal.
 *
 * The roles are the surfaces' own classification, not a judgement made here. The honesty card's
 * `maths` is `reason` when the run's means are suppressed, because that is exactly what it is —
 * `core`'s refusal, quoted — and `observation` otherwise, because every figure in that branch is
 * a count, a threshold or a longest wait. Nothing in `live/` is ever an `estimate`: the directory
 * does not name a suppressible figure, which `live/noMeans.test.ts` asserts by grep.
 */
const LIVE_RAIL: SurfaceAdapter = {
  id: 'live/bands.ts#moodAt',
  covers: [
    'live/bands.ts#WAIT_BANDS',
    'live/bands.ts#BAND_COLORS',
    'live/bands.ts#bandIndexOf',
    'live/bands.ts#bandOf',
    'live/bands.ts#moodAt',
    'live/bands.ts#moodOf',
    'live/bands.ts#waitBandsAt',
    'live/decisions.ts#decisionRowsAt',
    'live/decisions.ts#TERM_PHRASES',
    'live/honesty.ts#honestyAt',
    'live/timeline.ts#timelineOf',
    'live/timeline.ts#phaseAt',
    'live/interventions.ts#PARK_CARS_LOBBY_LABEL',
    'live/interventions.ts#switchDispatcherLabelOf',
    'live/interventions.ts#SWITCH_PINS_NOTE',
    'live/interventions.ts#RECOMPUTING_BEAT',
    'live/interventions.ts#interventionStampOf',
    'live/patternReadout.ts#patternReadoutAt',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const { recording } = context;

    for (const band of WAIT_BANDS) {
      seeds.push({ field: `waitBand(${band.id}).label`, text: band.label, role: 'label' });
      seeds.push({ field: `waitBand(${band.id}).legend`, text: band.legendLabel, role: 'label' });
    }
    for (const segment of timelineOf(recording)) {
      seeds.push({ field: `timeline(${segment.id}).label`, text: segment.label, role: 'label' });
      seeds.push({ field: `timeline(${segment.id}).title`, text: segment.title, role: 'observation' });
    }

    /*
     * The stage's intervention control — Everyday Mode slice 3. The label is static; the stamp is
     * driven at every sample against a log stamped mid-run, so both of its states enter the
     * corpus: the sentence (`09:14 · parked the cars in the lobby`) at playheads at or after the
     * stamp, and the deliberate `''` before it — `interventionStampOf` answers for the playhead,
     * not for the log, which is what keeps the temporal property met by construction rather than
     * by a guard in the caller.
     */
    seeds.push({ field: 'interventionButton.label', text: PARK_CARS_LOBBY_LABEL, role: 'label' });
    /*
     * The strip's other two controls and its beat — the log's second and third change kinds.
     *
     * The switch label and both stamps are **parametric over words a player reads** — a dispatcher
     * name and the chosen option's own sentence — so they are seeded from the case's own profile
     * name rather than from a literal: the register rule this sweep exists to enforce is that no
     * engine identifier reaches a player surface, and a label seeded with a hard-coded name would
     * pass while the shipped one leaked an id. `dispatcherNameOf` is the same lookup the stage
     * uses. The pin note and the `recomputing` beat are static, and enter beside the label they
     * are shown with: the beat is what the stamp slot reads while a re-simulation is in flight,
     * which is a state a player produces by pressing either control.
     */
    const switchTargetName = dispatcherNameOf(context);
    seeds.push({
      field: 'switchButton.label',
      text: switchDispatcherLabelOf(switchTargetName),
      role: 'label',
    });
    seeds.push({ field: 'switchButton.title', text: SWITCH_PINS_NOTE, role: 'observation' });
    seeds.push({ field: 'interventionStamp.recomputing', text: RECOMPUTING_BEAT, role: 'observation' });
    /*
     * One log carrying all three kinds, stamped across the run, so every stamp sentence enters the
     * corpus at the playheads that can show it — and the deliberate `''` before the first, which is
     * what keeps `interventionStampOf`'s temporal property met by construction.
     */
    const third = (recording.endedAt - recording.startedAt) / 3;
    const interventionLog = [
      { atS: recording.startedAt + third, change: { kind: 'park-cars-lobby' } as const },
      {
        atS: recording.startedAt + third * 1.5,
        change: {
          kind: 'switch-dispatcher',
          profile: { id: 'plain-baseline', name: switchTargetName, weights: {} },
        } as const,
      },
      {
        atS: recording.startedAt + third * 2,
        change: {
          kind: 'answer-incident',
          option: 'call the fitter out now',
          serviceEvents: [],
        } as const,
      },
    ];
    for (const at of sampleTimes(recording)) {
      const stamp = interventionStampOf(interventionLog, at);
      if (stamp === '') continue;
      seeds.push({
        field: `interventionStamp(@${at.toFixed(0)}s)`,
        text: stamp,
        role: 'observation',
        playhead: atPlayhead(recording, at),
      });
    }

    /*
     * The header's pattern readout — slice 4b, driven the way the intervention stamp is: the
     * corpus's own recordings run every shipped profile at `selection.policy: 'off'`, so the trace
     * is synthesized onto a copy of the recording, which is a state a player produces by turning
     * the selector on. Three recordings, four states: the case's own (absent — the label must be
     * empty, because a run that built no detector may not read as a pattern), a trace whose bank
     * abstains and then selects (both phrases cross the sampled playheads), and a two-bank trace
     * in disagreement (the split label names both patterns rather than picking one). The switch
     * sits mid-run so the temporal axis sees the readout change across it.
     */
    const midpoint = (recording.startedAt + recording.endedAt) / 2;
    const traced: [string, VizRecording][] = [
      ['own', recording],
      [
        'selecting',
        { ...recording, patternSwitches: [{ atS: midpoint, bankId: 'main', patternId: 'up-peak' }] },
      ],
      [
        'split',
        {
          ...recording,
          patternSwitches: [
            { atS: recording.startedAt, bankId: 'main', patternId: 'two-way' },
            { atS: midpoint, bankId: 'north', patternId: 'idle' },
          ],
        },
      ],
    ];
    for (const [name, subject] of traced) {
      for (const at of sampleTimes(subject)) {
        const readout = patternReadoutAt(subject, at);
        if (readout.label === '') continue;
        seeds.push({
          field: `patternReadout(${name}, @${at.toFixed(0)}s).label`,
          text: readout.label,
          role: 'observation',
          playhead: atPlayhead(subject, at),
        });
        if (readout.title !== '') {
          seeds.push({
            field: `patternReadout(${name}, @${at.toFixed(0)}s).title`,
            text: readout.title,
            role: 'prose',
            playhead: atPlayhead(subject, at),
          });
        }
      }
    }

    for (const at of sampleTimes(recording)) {
      const stamp = at.toFixed(0);
      /*
       * **The basis the rail picks, not the parameter's default** — and the default is what this
       * adapter took until the temporal axis landed.
       *
       * `waitBandsAt`, `moodAt` and `honestyAt` all default to `'now'` *"so every caller written
       * before the second basis existed keeps the reading it had"*, and `dev/leftRail.ts` is not
       * such a caller: `drawMood` and `drawHonesty` both pass `basisAt(recording, t)`. So at
       * `endedAt` the screen has been drawing the retrospective banding, the retrospective face and
       * the retrospective honesty card, and this sweep has been rendering the live copy of all
       * three — a whole class of player-facing sentence that had never been in the corpus. Asking
       * `shiftIsOver` is asking the rail's own question; see {@link railBasisAt}.
       */
      const basis = railBasisAt(recording, at);
      const mood = moodAt(recording, at, basis);
      seeds.push({
        field: `mood(${basis}, @${stamp}s).headline`,
        text: mood.headline,
        role: 'observation',
        playhead: atPlayhead(recording, at, mood.basis),
      });
      seeds.push({
        field: `mood(${basis}, @${stamp}s).sub`,
        text: mood.sub,
        role: 'observation',
        playhead: atPlayhead(recording, at, mood.basis),
      });

      const bands = waitBandsAt(recording, at, basis);
      for (const entry of bands.counts) {
        seeds.push({
          field: `bands(${basis}, @${stamp}s).${entry.band.id}`,
          text: `${entry.band.label} ${String(entry.count)}`,
          role: 'observation',
          declaredCount: bands.total,
          countShown: true,
          playhead: atPlayhead(recording, at, bands.basis),
        });
      }

      const segment = phaseAt(recording, at);
      if (segment !== undefined) {
        seeds.push({
          field: `phaseAt(@${stamp}s)`,
          text: segment.title,
          role: 'observation',
          playhead: atPlayhead(recording, at),
        });
      }

      for (const [index, row] of decisionRowsAt(recording, at).entries()) {
        seeds.push({
          field: `decision(@${stamp}s)[${String(index)}].head`,
          text: row.head,
          role: 'label',
          playhead: atPlayhead(recording, at),
        });
        seeds.push({
          field: `decision(@${stamp}s)[${String(index)}].why`,
          text: row.why,
          role: 'observation',
          playhead: atPlayhead(recording, at),
        });
      }

      for (const mode of ['casual', 'engineer'] as const) {
        const card = honestyAt(recording, at, mode, basis);
        /*
         * `HonestyCard.basis` speaks for **the casual card only**, in its own words: *"the engineer
         * card reads a verdict about the whole run on either."* So it is carried as a declaration on
         * the casual copy and withheld on the engineer one, where it would be a declaration about a
         * different string. An adapter that copied it onto both would be inventing a classification,
         * which is the one thing this file's header says an adapter must never do.
         */
        const declared = mode === 'casual' ? card.basis : undefined;
        seeds.push({
          field: `honesty(${mode}, ${basis}, @${stamp}s).title`,
          text: card.title,
          role: 'prose',
          playhead: atPlayhead(recording, at, declared),
        });
        seeds.push({
          field: `honesty(${mode}, ${basis}, @${stamp}s).plain`,
          text: card.plain,
          role: 'prose',
          playhead: atPlayhead(recording, at, declared),
        });
        if (card.maths !== undefined) {
          seeds.push({
            field: `honesty(${mode}, ${basis}, @${stamp}s).maths`,
            text: card.maths,
            // The refusal's own words when there is one; counts and thresholds otherwise.
            role: card.suppressed ? 'reason' : 'observation',
            declaredCount: recording.summary.waitCount,
            countShown: true,
            playhead: atPlayhead(recording, at, declared),
          });
        }
      }
    }
    return singleRun(this.id, seeds);
  },
};

const RIDER_QUEUE: SurfaceAdapter = {
  id: 'render/riderQueue.ts#planQueueRow',
  covers: [
    'render/riderQueue.ts#planQueueRow',
    'render/riderQueue.ts#describeQueue',
    'render/riderQueue.ts#BAND_WORDS',
    'render/riderQueue.ts#MAX_GLYPHS_WITH_COUNT',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    for (const at of sampleTimes(context.recording)) {
      for (const queue of context.bundleAt(at).queues.slice(0, 6)) {
        seeds.push({
          field: `describeQueue(@${at.toFixed(0)}s, ${queue.floorId})`,
          text: describeQueue(queue),
          role: 'observation',
          playhead: atPlayhead(context.recording, at),
        });
        /*
         * Both bands of § 6.2's degradation: a row wide enough for individual glyphs, and one
         * narrow enough that it collapses to a bar and a count. The two print different sentences,
         * so a rule that held on one is not a rule that holds.
         */
        for (const [mode, capacityCells] of [['wide', 24], ['narrow', 4]] as const) {
          const plan = planQueueRow({ queue, capacityCells, pitchFits: mode === 'wide', scaleTotal: Math.max(1, queue.total) });
          seeds.push({
            field: `planQueueRow(@${at.toFixed(0)}s, ${queue.floorId}, ${mode}).text`,
            text: plan.text,
            role: 'observation',
            playhead: atPlayhead(context.recording, at),
          });
          if (plan.reliefText !== undefined) {
            seeds.push({
              field: `planQueueRow(@${at.toFixed(0)}s, ${queue.floorId}, ${mode}).reliefText`,
              text: plan.reliefText,
              role: 'observation',
              playhead: atPlayhead(context.recording, at),
            });
          }
        }
      }
    }
    return singleRun(this.id, seeds);
  },
};

/**
 * The write-once promise's cost, as the player is told it — § D29, § D291's sibling.
 *
 * Swept rather than excluded because it is the newest thing on the banner and it makes a *causal*
 * claim: it says a named car is why a crowd is standing still. A sentence like that going stale —
 * naming a car that is not the one, or surviving a change to how promises work — is the failure
 * this whole apparatus exists to catch, and it is the shape `patternSwitching` and the traffic
 * editor's mean-group-size refusal both had.
 *
 * ## Why this one may not use {@link sampleTimes} alone (§ D333)
 *
 * **It went silent, and the reason it went silent is that the product got better.** This adapter
 * sampled the five fixed fractions every other surface uses, which is right for a surface that
 * always has something to say and wrong for a *conditional* one. Once § D333 bounded the panel's
 * promises the runs drained, the condition stopped holding at 0/25/50/75/100 %, and the adapter
 * emitted **no strings at all** — so `honesty.test.ts`'s own false-negative hunt reported it among
 * the silent, which is the check working exactly as intended.
 *
 * A conditional surface has to be sampled where its condition holds, or the corpus is measuring
 * the sampler rather than the sentence. So the fixed fractions are kept — they are the comparable
 * ones across adapters — and the run's **most pinned** instant is swept for and added to them. The
 * condition still holds in roughly half of a saturated run's frames (194 of 401 on `suppressedConfig`
 * at the time of writing), so this is not a hunt for a needle; it is a refusal to assume the needle
 * sits on a fifth.
 *
 * Silent on a run that never pins, which is correct and is what the conventional arm is.
 */
const PINNED_QUEUES: SurfaceAdapter = {
  id: 'frame/pinnedQueue.ts#describePinnedQueues',
  covers: [
    'frame/pinnedQueue.ts#describePinnedQueues',
    'frame/pinnedQueue.ts#pinnedQueuesAt',
  ],
  render(context) {
    const { recording } = context;
    const pinnedAt = (at: number): readonly PinnedQueue[] =>
      pinnedQueuesAt(context.bundleAt(at).queues, recording.shafts, recording.passengerModel);

    // The worst instant, found by sweep. Coarse on purpose: the condition holds across a wide
    // stretch of a saturated run, so a fine sweep would buy nothing but corpus build time.
    let peakAt: number | undefined;
    let worstSeen = 0;
    const steps = 40;
    for (let i = 0; i <= steps; i += 1) {
      const at = recording.startedAt + ((recording.endedAt - recording.startedAt) * i) / steps;
      const head = pinnedAt(at)[0];
      if (head !== undefined && head.waiting > worstSeen) {
        worstSeen = head.waiting;
        peakAt = at;
      }
    }

    // Deduped and ordered, so the corpus is stable across runs of the same recording.
    const times = [...sampleTimes(recording)];
    if (peakAt !== undefined && !times.includes(peakAt)) times.push(peakAt);
    times.sort((a, b) => a - b);

    const seeds: TextSeed[] = [];
    for (const at of times) {
      const pinned = pinnedAt(at);
      if (pinned.length === 0) continue;
      for (const short of [false, true]) {
        seeds.push({
          field: `describePinnedQueues(@${at.toFixed(0)}s, short=${String(short)})`,
          text: describePinnedQueues(pinned, { short }),
          role: 'observation',
          playhead: atPlayhead(recording, at),
        });
      }
    }
    return singleRun(this.id, seeds);
  },
};

const ACCESS: SurfaceAdapter = {
  id: 'access/lockedOut.ts#describeLockedOut',
  covers: [
    'access/lockedOut.ts#describeLockedOut',
    'access/lockedOut.ts#lockedOutLandingsAt',
    'access/lockedOut.ts#LOCKOUT_CAUSES',
    'access/zoning.ts#describeCredentialLens',
    'access/zoning.ts#credentialLensFor',
    'access/zoning.ts#LENS_LEGEND',
    'access/zoning.ts#LENS_OPERATIONAL_NOTE',
    'access/zoning.ts#STATE_WORDS',
    'access/zoning.ts#floorRunsOf',
    'access/dispatcherCredentials.ts#checkAccessCompatibility',
    'access/dispatcherCredentials.ts#credentialCapabilityOf',
    'access/dispatcherCredentials.ts#credentialAwareProfileIds',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    for (const at of sampleTimes(context.recording)) {
      const { lockedOut } = context.bundleAt(at);
      if (lockedOut.length === 0) continue;
      for (const short of [false, true]) {
        seeds.push({
          field: `describeLockedOut(@${at.toFixed(0)}s, short=${String(short)})`,
          text: describeLockedOut(lockedOut, { short }),
          role: 'observation',
          playhead: atPlayhead(context.recording, at),
        });
      }
    }

    const capability = credentialCapabilityOf(context.profiles.find((p) => p.id === context.case.baselineProfileId) ?? context.profiles[0]!);
    seeds.push({ field: 'credentialCapabilityOf.reason', text: capability.reason, role: 'prose' });

    const compatibility = checkAccessCompatibility({
      buildingName: context.buildingName,
      floorIds: context.floorIds,
      accessZones: context.accessZones,
      profile: context.profiles.find((p) => p.id === context.case.baselineProfileId) ?? context.profiles[0]!,
      profiles: context.profiles,
    });
    if (compatibility.warning !== undefined) {
      seeds.push({ field: 'checkAccessCompatibility.warning', text: compatibility.warning, role: 'prose' });
    }

    const lens = credentialLensFor({
      floors: context.recording.floors,
      shafts: context.recording.shafts,
      accessZones: context.accessZones,
      credentialGroup: 'staff',
    });
    seeds.push({ field: 'describeCredentialLens', text: describeCredentialLens(lens), role: 'observation' });
    seeds.push({ field: 'LENS_OPERATIONAL_NOTE', text: LENS_OPERATIONAL_NOTE, role: 'prose' });
    for (const [index, row] of LENS_LEGEND.entries()) {
      seeds.push({
        field: `LENS_LEGEND[${String(index)}]`,
        text: `${row.word} — ${row.zoning}. ${row.sentence}`,
        role: 'label',
      });
    }
    for (const [state, word] of Object.entries(STATE_WORDS)) {
      seeds.push({ field: `STATE_WORDS.${state}`, text: word, role: 'label' });
    }
    return singleRun(this.id, seeds);
  },
};

const EDITOR: SurfaceAdapter = {
  id: 'editor/editorValidate.ts#summariseReport',
  covers: [
    'editor/editorValidate.ts#summariseReport',
    'editor/editorValidate.ts#validateBuilding',
    'editor/editorPreview.ts#previewGeometry',
    'editor/editorEdits.ts#OPERATIONAL_ZONING_NOTE',
    'render/preview.ts#describePreview',
    'render/preview.ts#drawPreview',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const report: ValidationReport = validateBuilding(context.buildingDocument, context.elevatorSpecs, {});
    seeds.push({ field: 'summariseReport', text: summariseReport(report), role: 'prose' });
    for (const [index, issue] of report.issues.entries()) {
      seeds.push({ field: `validateBuilding.issues[${String(index)}]`, text: issue.message, role: 'reason' });
    }
    for (const [index, warning] of report.warnings.entries()) {
      seeds.push({ field: `validateBuilding.warnings[${String(index)}]`, text: warning.message, role: 'reason' });
    }
    seeds.push({ field: 'OPERATIONAL_ZONING_NOTE', text: OPERATIONAL_ZONING_NOTE, role: 'prose' });

    if (report.building !== undefined) {
      const geometry = previewGeometry(report.building, report.resolved);
      seeds.push({ field: 'previewGeometry.expansion', text: geometry.expansion, role: 'observation' });
      const lens = credentialLensFor({
        floors: geometry.floors,
        shafts: geometry.shafts,
        accessZones: context.accessZones,
        credentialGroup: 'staff',
      });
      seeds.push({ field: 'describePreview', text: describePreview(geometry, lens), role: 'prose' });
      const ctx = textCapturingContext();
      drawPreview(ctx, {
        geometry,
        layout: buildLayout({ width: 900, height: 700, floors: geometry.floors, shafts: geometry.shafts }),
        title: context.buildingName,
        caption: summariseReport(report),
        lens,
      });
      for (const [index, text] of ctx.texts.entries()) {
        seeds.push({ field: `drawPreview.fillText[${String(index)}]`, text, role: 'prose' });
      }
    }
    return singleRun(this.id, seeds);
  },
};

const CONTROLS: SurfaceAdapter = {
  id: 'controls/controls.ts#controlsFor',
  covers: [
    'controls/controls.ts#controlsFor',
    'controls/controls.ts#describeCondition',
    'controls/controls.ts#applyControlEdit',
    'controls/controls.ts#resetControl',
    'controls/render.ts#renderControls',
    'controls/render.ts#renderControl',
    'controls/render.ts#renderSlider',
    'controls/render.ts#renderStepper',
    'controls/render.ts#renderSelect',
    'controls/render.ts#renderCheckbox',
    'controls/render.ts#renderUnsearchable',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const values: ControlValues = defaultValues(context.space);
    const controls = controlsFor(context.space, values);
    for (const control of controls) {
      seeds.push({ field: `controlsFor.${control.id}.label`, text: control.label, role: 'label' });
      if (control.help !== undefined) {
        /*
         * The Parameters tab prints `SearchParameter.description` — text `core` authored for a
         * schema reader and a viewer re-prints unchanged. It is rendered rather than exempted,
         * and it is marked `schema` rather than `single-run`, which is a fact about **where the
         * string came from** and not an exemption from a rule: R3, R11, R13's frequency clause
         * and R2's ordering clause all still apply to it, and only R10 — which is about
         * translating a *result* into a probability word — does not. § D171 is the decision;
         * `properties.ts` § *Scoped to result-bearing text* is the reasoning.
         */
        seeds.push({
          field: `controlsFor.${control.id}.help`,
          text: control.help,
          role: 'prose',
          provenance: 'schema',
        });
      }
      if (control.inactiveReason !== undefined) {
        seeds.push({ field: `controlsFor.${control.id}.inactiveReason`, text: control.inactiveReason, role: 'reason' });
      }
    }
    const rendered: { readonly text: string; readonly schema: boolean }[] = [];
    flattenTagged(renderControls(controls), rendered);
    for (const [index, node] of rendered.entries()) {
      seeds.push({
        field: `renderControls.text[${String(index)}]`,
        text: node.text,
        role: 'label',
        // The `control-help` node, and only it, carries `core`'s own description. See above.
        ...(node.schema ? { provenance: 'schema' as const } : {}),
      });
    }
    const unsearchable = renderUnsearchable(context.space.unsearchable);
    if (unsearchable !== undefined) {
      const lines: string[] = [];
      flatten(unsearchable, lines);
      for (const [index, text] of lines.entries()) {
        seeds.push({ field: `renderUnsearchable.text[${String(index)}]`, text, role: 'prose' });
      }
    }
    const first = controls[0];
    if (first !== undefined) {
      const refused = applyControlEdit(context.space, values, first.id, Number.NaN);
      if (!refused.accepted) {
        seeds.push({ field: 'applyControlEdit.reason', text: refused.reason, role: 'reason' });
      }
      const reset = resetControl(context.space, values, `${first.id}-not-a-dimension`);
      if (!reset.accepted) {
        seeds.push({ field: 'resetControl.reason', text: reset.reason, role: 'reason' });
      }
    }
    /*
     * `playerSafeDescription` is the shipped R10 filter. It is driven here over the same schema
     * text the Parameters tab prints, so the *filter* is searched as well as the surface: if it
     * ever returns a string with a probability word in it, that is a hole in the remedy rather
     * than in the surface.
     *
     * **The provenance is decided by what the filter did**, which is the whole of the
     * classification and needs no word list:
     *
     * - **passed through** — the return value *is* `control.help`, so the string is `core`'s own
     *   description and is marked `schema`, exactly as the `.help` seed above. It cannot carry a
     *   probability word (the filter guarantees that), and its numbers are schema constants that
     *   have nothing to do with this run. R3 read them anyway and reported a `meanWaitS` of 50 s
     *   matching a `50` in `answer.reopenOnLateArrival`'s prose — `honesty-9100022`, deep tier;
     * - **rewritten** — the return value is this package's own refusal sentence, so it stays
     *   result-bearing and R10 reads it. That is the case the drive exists for.
     */
    for (const control of controls) {
      const safe = playerSafeDescription(control.help);
      if (safe === null) continue;
      seeds.push({
        field: `playerSafeDescription(${control.id})`,
        text: safe,
        role: 'prose',
        ...(safe === control.help ? { provenance: 'schema' as const } : {}),
      });
    }
    return singleRun(this.id, seeds);
  },
};

const REPLAY: SurfaceAdapter = {
  id: 'record/document.ts#verifyReplay',
  covers: [
    'record/document.ts#verifyReplay',
    'shift/banking.ts#bankingRefusalFor',
    'shift/banking.ts#LOADED_RUN_CANNOT_BANK',
    'shift/banking.ts#UNCHOSEN_RUN_CANNOT_BANK',
  ],
  render(context) {
    const verdict = verifyReplay(context.recording, context.recording);
    return singleRun(this.id, [
      { field: 'verifyReplay.message', text: verdict.message, role: 'observation' },
      /*
       * What a loaded recording may not do — GitHub issue #136, and it belongs on this surface
       * rather than beside `NO_SHEET_YET` because both sentences here are about the standing of a
       * run that arrived from somewhere else.
       *
       * `reason` for `NO_SHEET_YET`'s reason: it explains a refusal and names what to do instead,
       * which is the shape R3 judges. `authored` because it is a constant rather than a reading —
       * nothing about this run produced it, and classifying it `single-run` would let a figure into
       * it without the count rules noticing.
       */
      {
        field: 'loadedRunCannotBank',
        text: LOADED_RUN_CANNOT_BANK,
        role: 'reason',
        provenance: 'authored',
      },
      /*
       * The same question's other ground — § D232's, given words by `docs/19` defect 1: a run
       * nobody started banks nothing, and the refusal now speaks instead of returning in silence.
       * Beside `loadedRunCannotBank` because the two are `shift/banking.ts`'s two answers to *what
       * must a run be before it may close a day*, and for the same `reason`/`authored` pairing:
       * it explains a refusal and names what to do instead, and nothing about the run produced it.
       */
      {
        field: 'unchosenRunCannotBank',
        text: UNCHOSEN_RUN_CANNOT_BANK,
        role: 'reason',
        provenance: 'authored',
      },
    ]);
  },
};

/* ---- batch-provenance surfaces ---- */

function batchText(surfaceId: string, seeds: readonly (TextSeed & { readonly comparison?: RenderedText['comparison']; readonly goal?: RenderedText['goal'] })[]): readonly RenderedText[] {
  return seeds
    .filter((seed) => seed.text.trim() !== '')
    .map((seed) => ({
      surfaceId,
      field: seed.field,
      text: seed.text,
      role: seed.role ?? 'prose',
      provenance: 'batch' as const,
      declaredCount: seed.declaredCount,
      countShown: seed.countShown,
      comparison: seed.comparison,
      goal: seed.goal,
      energyAxis: seed.energyAxis,
    }));
}

const BATCH_REPORT: SurfaceAdapter = {
  id: 'batch/report.ts#batchReport',
  covers: [
    'batch/report.ts#batchReport',
    /*
     * The population line, in words — `docs/20` defect 9. Covered here rather than in an adapter of
     * its own because it is a *projection of this report*: its whole input is
     * {@link BatchReport.traceKey}, three panels draw it directly under `crnSentence`, and seeding
     * it beside that sentence is what puts the two on one surface the way a reader meets them.
     *
     * `TRACE_KEY_WORDS`, `spacedKey` and `traceValueWords` — the table, the fallback spelling and
     * the value renderer — are **not** listed: they are module-private, so the derivation does not
     * find them and a `covers` entry for them would be a coverage claim for nothing. They are swept
     * all the same, because every string they hold reaches the corpus through the call below.
     */
    'batch/report.ts#populationLineOf',
    'batch/types.ts#BATCH_METRIC_PRESENTATION',
  ],
  render(context) {
    const report = context.report;
    const seeds: (TextSeed & { comparison?: RenderedText['comparison'] })[] = [
      { field: 'demandClause', text: report.demandClause, role: 'label' },
      { field: 'crnSentence', text: report.crnSentence, role: 'prose' },
      /*
       * Seeded as the panels draw it — the lead-in included, because that is the sentence a reader
       * meets and the numerals in the rendered key sit inside it. Drawn with the building name, the
       * arm the product takes wherever it has one.
       */
      {
        field: 'populationLine',
        text: `Every arm ran this population: ${populationLineOf(report.traceKey, {
          buildingName: report.buildingName,
        })}.`,
        role: 'observation',
      },
    ];
    if (report.budgetNote !== null) {
      seeds.push({ field: 'budgetNote', text: report.budgetNote, role: 'reason' });
    }
    for (const [index, arm] of report.arms.entries()) {
      seeds.push({
        field: `arms[${String(index)}].sentence`,
        text: arm.sentence,
        role: 'observation',
        declaredCount: arm.n,
        countShown: arm.sentence.includes(String(arm.n)),
      });
      for (const [reasonIndex, reason] of arm.reasons.entries()) {
        seeds.push({ field: `arms[${String(index)}].reasons[${String(reasonIndex)}]`, text: reason, role: 'reason' });
      }
    }
    for (const [index, comparison] of report.comparisons.entries()) {
      /*
       * The roll-up and its remedy — seeded like any other batch string, and **with no `comparison`
       * shape**, which is the honest classification rather than a convenience.
       *
       * `checkSingleRunComparative`'s batch clauses read `RenderedText.comparison` to ask *"does
       * this string name a winner the row was not entitled to?"*. The summary names no arm at all:
       * it counts rows by verdict and points at the row that does. Attaching a shape here would
       * mean inventing a `favours` and a `pairs` for a sentence that has neither, and the search
       * would then be checking a fiction. What it is still swept for is everything textual — R10's
       * word list and R13's frequency form — which is what a counting sentence can actually break.
       */
      seeds.push({
        field: `comparisons[${String(index)}].summary.sentence`,
        text: comparison.summary.sentence,
        role: 'prose',
        declaredCount: comparison.rows[0]?.totalPairs ?? 0,
      });
      if (comparison.summary.remedy !== null) {
        seeds.push({
          field: `comparisons[${String(index)}].summary.remedy`,
          text: comparison.summary.remedy,
          role: 'reason',
          declaredCount: comparison.rows[0]?.totalPairs ?? 0,
        });
      }
      for (const row of comparison.rows) {
        const energyAxis = BATCH_METRIC_CLASS[row.metric] === 'axis';
        const shape = {
          favours: row.favours,
          verdict: row.verdict,
          pairs: row.pairs,
        };
        seeds.push({
          field: `comparisons[${String(index)}].${row.metric}.sentence`,
          text: row.sentence,
          role: 'comparison',
          declaredCount: row.pairs,
          countShown: row.sentence.includes(String(row.pairs)) || row.sentence.includes(String(row.totalPairs)),
          comparison: shape,
          energyAxis,
        });
        seeds.push({
          field: `comparisons[${String(index)}].${row.metric}.note`,
          text: row.note,
          role: 'comparison',
          declaredCount: row.pairs,
          countShown: row.note.includes(String(row.pairs)),
          comparison: shape,
          energyAxis,
        });
      }
    }
    for (const metric of BATCH_METRICS) {
      const presentation = BATCH_METRIC_PRESENTATION[metric];
      seeds.push({
        field: `BATCH_METRIC_PRESENTATION.${metric}.label`,
        text: presentation.label,
        role: 'label',
        energyAxis: BATCH_METRIC_CLASS[metric] === 'axis',
      });
    }
    return batchText(this.id, seeds);
  },
};

const GOAL_REPORT: SurfaceAdapter = {
  id: 'scenario/goalReport.ts#goalReport',
  covers: [
    'scenario/goalReport.ts#goalReport',
    'scenario/goals.ts#goalLabel',
    'scenario/goals.ts#GOAL_BLOCKER',
    'scenario/goals.ts#measureGoalRate',
    'scenario/goals.ts#judgeReplication',
    'scenario/goals.ts#DISPOSITION_OF',
  ],
  render(context) {
    const report = goalReport(context.batch);
    const replications = context.batch.arms[0]?.replications.length ?? 0;
    const seeds: (TextSeed & { goal?: RenderedText['goal'] })[] = [];
    if (report.floorNote !== null) {
      seeds.push({ field: 'floorNote', text: report.floorNote, role: 'reason' });
    }
    for (const [index, row] of report.rows.entries()) {
      seeds.push({
        field: `rows[${String(index)}](${row.label})`,
        text: row.sentence,
        role: 'goal',
        declaredCount: replications,
        countShown: row.sentence.includes(String(replications)),
        goal: { rateShown: /\b\d+\s+of\s+\d+\b/.test(row.sentence), seeds: replications },
      });
    }
    for (const [index, withheld] of report.withheld.entries()) {
      seeds.push({
        field: `withheld[${String(index)}](${withheld.label})`,
        text: withheld.reason,
        role: 'reason',
      });
    }
    for (const kind of Object.keys(GOAL_BLOCKER)) {
      const blocker = GOAL_BLOCKER[kind as keyof typeof GOAL_BLOCKER];
      if (blocker !== null) seeds.push({ field: `GOAL_BLOCKER.${kind}`, text: blocker, role: 'reason' });
      seeds.push({
        field: `goalLabel.${kind}`,
        text: goalLabel({ kind: kind as never, threshold: null }),
        role: 'label',
      });
    }
    return batchText(this.id, seeds);
  },
};

/**
 * The suite — Everyday Mode slice 7's per-cell view over the bench (`batch/suite.ts`).
 *
 * Most of what the suite screen shows is `batchReport`'s own sentences re-rendered, and those are
 * seeded here **again under this surface's id** because the suite genuinely draws them: a string
 * on two screens is two chances to mislead, and the comparative checks should see it wherever it
 * appears. The comparison shape on each row is taken from the report's row — `favours`, verdict
 * and pairs — exactly as `BATCH_REPORT` attaches it, so a suite row that named a winner the row
 * was not entitled to would fail here the same way.
 *
 * What is *new* prose is driven the way `RESTORE_NOTICE` drives its broken stores — by
 * manufacturing the state that produces it: the field-of-two refusal through a result carrying a
 * third arm, and `suitePlanOf`'s tick refusals through an empty and a duplicated tick list. The
 * two cell-shape refusals (`demandTemplate`, missing horizon) are *not* drivable through the real
 * `MATRIX_CELLS` — every shipped cell is clean, which is the point of them — so those literals
 * reach only the static R10 sweep, stated here rather than dressed as coverage.
 */
const SUITE_BENCH: SurfaceAdapter = {
  id: 'batch/suite.ts#suiteCellViewOf',
  /*
   * `suitePlanOf` is deliberately not in `covers` although its refusals are seeded below: the
   * producer derivation does not find it (its prose lives in `throw` messages, which the scanner
   * does not attribute to the export), and a `covers` entry for a declaration the derivation
   * cannot find is a coverage claim for nothing — `derive.test.ts` said so when it was listed.
   * The refusal strings are still in the corpus under this surface, driven for real below.
   */
  // `suiteSummaryOf` composes the index's cell texts (docs/20 defect 15) and is driven below on
  // the same view, so it is covered here rather than excluded — its one caller is the suite mount.
  covers: ['batch/suite.ts#suiteCellViewOf', 'batch/suite.ts#suiteSummaryOf'],
  render(context) {
    const cell = { id: 'honesty-suite-cell', label: context.report.buildingName };
    const view = suiteCellViewOf(cell, context.batch);
    const seeds: (TextSeed & { comparison?: RenderedText['comparison'] })[] = [];
    if (view.answer !== null) {
      seeds.push({
        field: 'answer',
        text: view.answer,
        role: 'prose',
        declaredCount: view.report.comparisons[0]?.rows[0]?.totalPairs ?? 0,
      });
    }
    for (const [index, arm] of view.arms.entries()) {
      seeds.push({
        field: `arms[${String(index)}].sentence`,
        text: arm.sentence,
        role: 'observation',
        declaredCount: view.report.arms[index]?.n ?? 0,
        countShown: arm.sentence.includes(String(view.report.arms[index]?.n ?? -1)),
      });
    }
    const sourceRows = view.report.comparisons[0]?.rows ?? [];
    for (const [index, mark] of view.rows.entries()) {
      const source = sourceRows[index];
      if (source === undefined) continue;
      seeds.push({
        field: `rows[${String(index)}](${mark.metric}).sentence`,
        text: mark.sentence,
        role: 'comparison',
        declaredCount: source.pairs,
        countShown:
          mark.sentence.includes(String(source.pairs)) ||
          mark.sentence.includes(String(source.totalPairs)),
        comparison: { favours: source.favours, verdict: source.verdict, pairs: source.pairs },
        energyAxis: BATCH_METRIC_CLASS[mark.metric] === 'axis',
      });
    }
    /*
     * The index over those rows — `docs/20` defect 15. Its cells are authored in
     * `suiteSummaryOf` (the verdict word, plus the arm's name only where `favours` named one) and
     * drawn before the prose, so they are seeded with the source row's own comparison shape: an
     * index mark that outran its row's gate fails here exactly as the row itself would.
     */
    const summary = suiteSummaryOf([view]);
    summary.lines[0]?.marks.forEach((mark, index) => {
      const source = sourceRows[index];
      if (mark === null || mark === undefined || source === undefined) return;
      seeds.push({
        field: `summary.marks[${String(index)}](${source.metric}).text`,
        text: mark.text,
        role: 'comparison',
        declaredCount: source.pairs,
        comparison: { favours: source.favours, verdict: source.verdict, pairs: source.pairs },
        energyAxis: BATCH_METRIC_CLASS[source.metric] === 'axis',
      });
    });
    /* The refusal branches, manufactured on purpose — see the adapter docstring. */
    const third = context.batch.arms[1];
    if (third !== undefined) {
      const tripled = { ...context.batch, arms: [...context.batch.arms, { ...third, armId: 'ghost-arm' }] };
      const refused = suiteCellViewOf(cell, tripled);
      if (refused.verdictRefusal !== null) {
        seeds.push({ field: 'verdictRefusal', text: refused.verdictRefusal, role: 'reason' });
      }
    }
    const field = [
      { armId: 'baseline', dispatcherProfileId: 'collective' },
      { armId: 'candidate', dispatcherProfileId: 'eta' },
    ] as const;
    for (const [name, cellIds] of [
      ['planRefusal.noCells', []],
      ['planRefusal.duplicateTick', ['midtown-up-peak', 'midtown-up-peak']],
    ] as const) {
      try {
        suitePlanOf({ cellIds, seed: '1', replications: 50, field });
      } catch (error: unknown) {
        if (error instanceof SuiteError) {
          seeds.push({ field: name, text: error.message, role: 'reason' });
        }
      }
    }
    return batchText(this.id, seeds);
  },
};

/**
 * Basic and Advanced, both drawn, and the parity check that runs on what was drawn.
 *
 * ## Why both modes, on every case, whatever `context.case.mode` says
 *
 * A `DisclosureItem` carries **both** renderings at once — that is what makes parity a comparison
 * rather than a re-derivation — so a mode is a projection of one datum, not a second run. Driving
 * only `context.case.mode` would leave half the strings unsearched on every case while the corpus
 * looked complete, and the Basic strings are the ones with new prose in them: `SUPPRESSION_LEAD`,
 * the plain-language locked-out note, `BASIC_WINDOW_VALUE`. Both projections cost one call. This
 * held when `HONESTY_MODES` named one mode and still holds now it names two: the generated axis
 * exists for a future renderer that *branches* on the case's mode, and this adapter is not one.
 *
 * ## The inputs are `dev/main.ts`'s, line for line
 *
 * The dispatcher's display name, and the locked-out landings at `endedAt`. **No fail states**, for
 * the reason the shipped call site gives in as many words: *"a fail state's frequency comes from
 * a batch and R2 forbids reading one off a single replication."* Inventing a batch here to make
 * the adapter louder would be the adapter judging.
 */
const MODE: SurfaceAdapter = {
  id: 'mode/disclosure.ts#disclosureItems',
  covers: [
    'mode/disclosure.ts#disclosureItems',
    'mode/disclosure.ts#SUPPRESSION_LEAD',
    /*
     * The per-ground half of the same refusal, which became an export when a **second** surface
     * needed it — the Day report, GitHub issue #100. It reaches the corpus twice over: through
     * `disclosureItems` below, which is the call this adapter drives, and through
     * `dev/reportPanel.ts#reportViewOf`'s Casual arm, which is driven in that adapter. Two drivers
     * for one sentence is what makes it one sentence rather than two that agree today.
     */
    'mode/disclosure.ts#suppressionLeadFor',
    'mode/disclosure.ts#BASIC_WINDOW_VALUE',
    'mode/parity.ts#parityViolations',
    'mode/parity.ts#parityRefusal',
    /*
     * The transport's status strip — GitHub issue #71, and it belongs to **this** adapter rather
     * than to one of its own.
     *
     * `dev/main.ts#transportStatusOf` composes two of the renderings above into one line. An
     * adapter of its own would have to build the same items from the same recording to drive it,
     * which is a second answer to *what does this run disclose* — and the parity check a few lines
     * down would then be checking a list that is not the list on screen. So it is seeded here, off
     * the items that were already derived.
     */
    'dev/main.ts#transportStatusOf',
  ],
  render(context) {
    const { recording } = context;
    const seeds: TextSeed[] = [];
    const profile = context.profiles.find(
      (candidate) => candidate.id === recording.dispatcherProfileId,
    );
    const items = disclosureItems({
      recording,
      ...(profile?.name === undefined ? {} : { dispatcherName: profile.name }),
      lockedOut: context.bundleAt(recording.endedAt).lockedOut,
    });

    for (const mode of VIEW_MODES) {
      for (const item of itemsIn(items, mode)) {
        const { rendering } = item;
        const shape = disclosureShapeOf(item.origin);
        const common = {
          role: shape.role,
          declaredCount: rendering.count === undefined ? undefined : countOf(rendering.count),
          countShown: rendering.count !== undefined,
          energyAxis: shape.energyAxis,
          gated: shape.gated,
        };
        seeds.push({ field: `${mode}.${item.id}.label`, text: item.label, role: 'label' });
        seeds.push({ ...common, field: `${mode}.${item.id}.value`, text: rendering.value });
        if (rendering.note !== undefined) {
          seeds.push({
            ...common,
            field: `${mode}.${item.id}.note`,
            /* A refused statistic's note **is** the refusal, and a refusal quotes its own numbers. */
            ...(shape.role === 'suppressed' ? { role: 'reason' as const } : {}),
            text: rendering.note,
          });
        }
        for (const [index, bar] of rendering.bars.entries()) {
          seeds.push({
            field: `${mode}.${item.id}.bars[${String(index)}]`,
            text: `${bar.label}: ${bar.text}`,
            role: 'observation',
            energyAxis: shape.energyAxis,
          });
        }
      }
    }

    /*
     * The refusal, on exactly the items above — the same call `dev/main.ts` makes on every draw.
     *
     * It is silent while the shipped product keeps § 4, which is a fact about the product rather
     * than a gap in the search: `mode/parity.test.ts` breaks each of the three rules on purpose
     * and watches all three fire. What this drive adds is that if parity *did* break on a
     * generated case, the sentence it puts on screen would itself be checked for honesty.
     */
    for (const [index, broken] of parityViolations(items).entries()) {
      seeds.push({ field: `parityViolations[${String(index)}]`, text: broken.message, role: 'reason' });
    }
    /*
     * The line the transport actually prints, in both modes — issue #71.
     *
     * `estimate`, because that is what it is: `AWT` and `WT95` are the two figures `awtIsValid`
     * speaks for, and on a run whose mean is refused this line carries the refusal instead. Seeding
     * it as anything softer would exempt the one string on the shell that a reader glances at
     * without opening a panel.
     */
    for (const mode of VIEW_MODES) {
      const status = transportStatusOf(items, mode);
      if (status === undefined) continue;
      const awt = itemsIn(items, mode).find((item) => item.id === 'awt');
      seeds.push({
        field: `${mode}.transportStatus`,
        text: status,
        role: 'estimate',
        /*
         * The `n` is **on the line**, which is what makes seeding it as an estimate legal — and it
         * is there because this seed put it there. Driven into the corpus reading `AWT 13.1 s ·
         * WT95 27.4 s`, the search failed six cases on R13 clause one at once; the count comes off
         * the same `Rendering` the value does, so `declaredCount` reads it from the item rather
         * than re-parsing the line this adapter just built.
         */
        declaredCount: awt?.rendering.count === undefined ? undefined : countOf(awt.rendering.count),
        countShown: awt?.rendering.count !== undefined,
        // The register a caller with no playhead gets is the whole-run one — said explicitly, at
        // the one playhead it is earned, so the temporal axis sees this line's terminal form too.
        playhead: atPlayhead(recording, recording.endedAt),
      });
      /*
       * The same line at every sampled playhead — `docs/19` defect 4, on § D307's precedent.
       *
       * `dev/main.ts#drawTransportStatus` now derives this line per frame with the playhead
       * against the run's own end, so the corpus drives the call the shell makes rather than the
       * one it used to make. The mechanisation is the declaration: a line drawn short of
       * `endedAt` that is **byte-identical to the whole-run line** is the whole-run register
       * published early, and it is seeded with `basis: 'whole-run'` so the temporal property's
       * structural half refuses it without any cue-matching — which matters here, because the
       * whole-run sentence's own numerals (`29.3 s`, `n = 236 rides`) name quantities the
       * WHOLE_RUN_COUNTS table has no live counterpart for. The honest mid-run register differs
       * from the terminal line by construction (it withholds and says so), carries no figure, and
       * is seeded as the refusal-shaped prose it is.
       */
      for (const at of sampleTimes(recording)) {
        if (at >= recording.endedAt) continue;
        const early = transportStatusOf(items, mode, { atS: at, endedAt: recording.endedAt });
        if (early === undefined) continue;
        seeds.push({
          field: `${mode}.transportStatus@${at.toFixed(0)}s`,
          text: early,
          role: 'prose',
          playhead:
            early === status
              ? { atS: at, endedAt: recording.endedAt, basis: 'whole-run' }
              : atPlayhead(recording, at),
        });
      }
    }

    const refusal = parityRefusal(items);
    if (refusal !== undefined) seeds.push({ field: 'parityRefusal', text: refusal, role: 'reason' });

    return singleRun(this.id, seeds);
  },
};

/**
 * What R3, R11 and R13 need to know about a disclosure item, from its **origin**.
 *
 * The same three facts the run-summary adapter takes from a `SummaryFigure`, reached through
 * `DisclosureOrigin` because that is the classification `mode/` carries. Nothing here re-decides
 * whether a statistic is refused: an item whose origin is `suppression` is one
 * `render/runSummary.ts` already returned with `kind: 'suppressed'`.
 */
function disclosureShapeOf(origin: DisclosureOrigin): {
  readonly role: TextRole;
  readonly gated: boolean;
  readonly energyAxis: boolean;
} {
  const gatedId = (id: string): boolean => id === AWT_ID || id === WT95_ID || id === TTD_ID;
  switch (origin.kind) {
    case 'suppression':
      return { role: 'suppressed', gated: gatedId(origin.figureId), energyAxis: origin.figureId === ENERGY_ID };
    case 'figure':
      return {
        role:
          origin.figureKind === 'estimate'
            ? 'estimate'
            : origin.figureKind === 'observation'
              ? 'observation'
              : origin.figureKind === 'suppressed'
                ? 'suppressed'
                : 'label',
        gated: gatedId(origin.figureId),
        energyAxis: origin.figureId === ENERGY_ID,
      };
    case 'undelivered':
    case 'locked-out':
    case 'fail-state':
      return { role: 'observation', gated: false, energyAxis: false };
    case 'run-identity':
      return { role: 'label', gated: false, energyAxis: false };
    case 'warning':
    case 'passenger-model':
    case 'fail-state-diagnosis':
      return { role: 'prose', gated: false, energyAxis: false };
  }
}

/**
 * A weight vector the player edited, admitted or refused **at the control**.
 *
 * Four points, and three of them are refusals, because the refusals are the strings: a dimension
 * the space does not declare, a value the dimension cannot hold, and a combination the declared
 * box admits and `core` refuses. `editedProfile.ts` names all three in its own docstring and says
 * the third *"is not a theoretical branch"* — one uniform draw in eight violates it.
 *
 * The fourth is the admitted vector, whose profile carries a **name a report prints** —
 * *"…(edited from collective)"* — which is the only string on this surface that is not a refusal.
 */
const EDITED_PROFILE: SurfaceAdapter = {
  id: 'controls/editedProfile.ts#resolveEditedProfile',
  covers: [
    'controls/editedProfile.ts#resolveEditedProfile',
    'controls/editedProfile.ts#admitEditedVector',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const base = context.profiles.find(
      (candidate) => candidate.id === context.case.baselineProfileId,
    );
    if (base === undefined) return [];

    const declared = new Set(context.space.parameters.map((parameter) => parameter.id));
    const first = context.space.parameters[0];
    const edits: readonly { readonly label: string; readonly edit: EditedVector['values'] }[] = [
      { label: 'undeclared-dimension', edit: { 'not.a.declared.dimension': 1 } },
      ...(first === undefined ? [] : [{ label: 'unholdable-value', edit: { [first.id]: Number.NaN } }]),
      /*
       * The one constraint `SearchSpace.validate` enforces that the declared box does not:
       * a `destination-entry` dispatcher may not defer. Named by id and **guarded** — if `core`
       * renames either dimension this simply stops being driven rather than throwing, and
       * `derive.test.ts` still requires the declaration to be covered.
       */
      ...(declared.has('dispatch.callType') && declared.has('dispatch.assignmentTiming')
        ? [
            {
              label: 'infeasible-combination',
              edit: {
                'dispatch.callType': 'destination-entry',
                'dispatch.assignmentTiming': 'deferred',
              } as EditedVector['values'],
            },
          ]
        : []),
      { label: 'admitted', edit: {} },
    ];

    for (const { label, edit } of edits) {
      const admission = admitEditedVector(context.space, base, edit);
      if (admission.reason !== undefined) {
        seeds.push({ field: `admitEditedVector.${label}.reason`, text: admission.reason, role: 'reason' });
      }
      const resolved = resolveEditedProfile(context.space, base, {
        baseProfileId: base.id,
        profileId: `${base.id}-edited`,
        values: edit,
      });
      if (resolved.ok) {
        seeds.push({ field: `resolveEditedProfile.${label}.name`, text: resolved.profile.name, role: 'label' });
      } else {
        seeds.push({ field: `resolveEditedProfile.${label}.reason`, text: resolved.reason, role: 'reason' });
      }
    }
    return singleRun(this.id, seeds);
  },
};

/* ---- campaign surfaces, driven only on a case that names a stage ---- */

const CAMPAIGN: SurfaceAdapter = {
  id: 'campaign/judge.ts#judgeStage',
  covers: [
    'campaign/judge.ts#judgeStage',
    'campaign/brief.ts#briefingFor',
    'campaign/failStates.ts#failStateReports',
    'campaign/failStates.ts#failStateCounts',
    'campaign/failStates.ts#evidenceFrom',
    'campaign/dimensions.ts#admitProfile',
    'campaign/parse.ts#playerFacingStrings',
    'campaign/words.ts#playerSafeDescription',
  ],
  render(context) {
    const bundle = context.stage;
    if (bundle === undefined) return [];
    const { stage, published } = bundle;
    const seeds: (TextSeed & { goal?: RenderedText['goal']; comparison?: RenderedText['comparison'] })[] = [];

    for (const [label, text] of playerFacingStrings(stage)) {
      seeds.push({ field: `authored.${label}`, text, role: 'prose' });
    }

    const briefing = briefingFor({
      stage,
      published,
      dimensionIds: bundle.dimensionIds,
      dimensionHelp: bundle.dimensionHelp,
    });
    seeds.push({ field: 'briefing.configuration', text: briefing.configuration, role: 'label' });
    seeds.push({ field: 'briefing.seedNote', text: briefing.seedNote, role: 'label' });
    for (const [index, sentence] of briefing.sentences.entries()) {
      seeds.push({ field: `briefing.sentences[${String(index)}]`, text: sentence, role: 'prose' });
    }
    for (const [index, fact] of briefing.facts.entries()) {
      seeds.push({
        field: `briefing.facts[${String(index)}]`,
        text: fact,
        role: 'goal',
        goal: { rateShown: /\b\d+\s*(?:of|\/)\s*\d+\b/.test(fact), seeds: stage.replications },
      });
    }
    for (const [index, withheld] of briefing.withheld.entries()) {
      seeds.push({ field: `briefing.withheld[${String(index)}]`, text: withheld, role: 'reason' });
    }
    for (const [index, goal] of briefing.goals.entries()) {
      seeds.push({
        field: `briefing.goals[${String(index)}]`,
        text: goal,
        role: 'goal',
        goal: { rateShown: /\b\d+\s*(?:of|\/)\s*\d+\b/.test(goal), seeds: stage.replications },
      });
    }
    for (const dimension of briefing.editable) {
      if (dimension.help !== null) {
        seeds.push({ field: `briefing.editable.${dimension.id}.help`, text: dimension.help, role: 'prose' });
      }
    }

    const verdict = judgeStage({ stage, published, result: context.batch, report: context.report });
    /*
     * The headline is an **observation**, not a goal claim — narrowed from `role: 'goal'` after the
     * deep tier reported `goal-without-rate` against it (§ D186).
     *
     * The old seed tested `\d+ of \d+` for `rateShown`, and on the uncleared branch that matched
     * `${met} of ${total}` — **a count of goals against goals, with no seed in it anywhere**. Drive a
     * stage on a batch with no replications and the headline reads `0 of 2 goals reached over 0 runs`:
     * the pattern is satisfied and there is no run for a rate to be over. So the check was not
     * reporting the cleared branch because a rate was missing; it was **accepting the uncleared branch
     * for the wrong reason**, which is wave 8's *tests that could not fail* arriving inside the
     * instrument § D163 built to find them.
     *
     * There is no rate a headline could carry: R12's rate is per goal, four goals have four different
     * ones, and each already states its own (`passed 45 of 50 runs`) in a separately-seeded sentence
     * below. `beat-the-baseline` is `batch-only`, which § D160 records R12 as never having reached.
     * What R13 asks of a headline — the `n` — it does carry, on **both** branches, so that is what is
     * declared here.
     *
     * **What this gives up:** the search can no longer catch a headline *rewritten* to assert a
     * per-goal outcome without a rate. That is bounded rather than left implicit — `judge.test.ts`
     * asserts the produced headline names no goal kind and no goal label, on both branches, with the
     * cleared one driven through a real 50-replication batch.
     */
    const headlineSeeds = context.batch.arms[0]?.replications.length ?? 0;
    seeds.push({
      field: 'judge.headline',
      text: verdict.headline,
      role: 'observation',
      declaredCount: headlineSeeds,
      countShown: verdict.headline.includes(String(headlineSeeds)),
    });
    for (const goal of verdict.goals) {
      const replications = context.batch.arms[0]?.replications.length ?? 0;
      seeds.push({
        field: `judge.goals.${goal.kind}.sentence`,
        text: goal.sentence,
        role: 'goal',
        declaredCount: replications,
        countShown: goal.sentence.includes(String(replications)),
        goal: { rateShown: /\b\d+\s*(?:of|\/)\s*\d+\b/.test(goal.sentence), seeds: replications },
      });
      seeds.push({ field: `judge.goals.${goal.kind}.note`, text: goal.note, role: 'reason' });
    }

    const counts = failStateCounts(context.batch.arms[0]?.replications ?? []);
    for (const report of failStateReports({
      stage,
      counts,
      evidence: bundle.evidence,
      dimensionHelp: bundle.dimensionHelp,
    })) {
      seeds.push({ field: `failState.${report.state}.frequency`, text: report.frequency, role: 'observation' });
      seeds.push({ field: `failState.${report.state}.sentence`, text: report.sentence, role: 'observation' });
      seeds.push({ field: `failState.${report.state}.diagnosis`, text: report.diagnosis, role: 'prose' });
      seeds.push({ field: `failState.${report.state}.lever`, text: report.lever, role: 'prose' });
    }
    return batchText(this.id, seeds);
  },
};

/* -------------------------------------------------------------------------- *
 * The design refactor's surfaces — the shift layer, the four editors, the panels
 * -------------------------------------------------------------------------- */

/**
 * The one fold, taken once per case, and the two days every shift surface is driven over.
 *
 * ## Why the fold is `live/`'s and not a second one
 *
 * `shift/observations.ts` says it in as many words: *"`live/` folds and this projects"*, and
 * *"that is how a repository ends up with two answers to how many people has this building
 * carried"* — § D111's defect, one layer up. So the recording is folded exactly once, by
 * `observationsAt(recording, recording.endedAt)`, and projected by `shiftObservationsOf`. There is
 * exactly one such call in the shipped product (`dev/main.ts#closeShift`) and this is the same one,
 * at the same instant, for the same stated reason: *"a day's account is the day's, and a reader
 * who paused at 09:00 has not made the afternoon not happen."*
 *
 * ## Why two days rather than one
 *
 * Day 1 and day 4 split the two branches of `contractLineFor` and `taughtFor`: day 1 runs the
 * building's **own** scenario, day 4 runs it as *a building the reader drew*, which is the branch
 * that prints *"nothing is being banked"*. (This section used to also cite `goalsForDay`'s
 * `day % 2` alternation — retired when the worst-wait ceiling subsumed the odd-day horizon goal,
 * see `shift/goals.ts#goalsForDay` — but the contract branches alone still need both days, and
 * two days also keep two points of the bar-hardening ladder in the corpus.)
 *
 * ## Why each day is closed twice
 *
 * `closeDay` only produces a {@link ClearedAward} when the banked count reaches the contract's
 * `needClean`, and whether the generated run cleared its goals is not something an adapter may
 * arrange. So each day is also closed on a week that has **already** banked `needClean` shifts —
 * a state a reader reaches by playing — and that is what renders `awardFor`'s sentence. Day 4
 * closes on `c5`, the last contract, so `nextContract` returns `undefined` and the other branch —
 * *"any scenario you like — they are all open"* — is rendered too.
 */
interface ShiftDay {
  readonly day: number;
  readonly dayIdx: number;
  readonly contract: ScenarioContract | undefined;
  readonly event: ShiftEvent;
  readonly goals: readonly ShiftGoal[];
  readonly readings: readonly GoalReading[];
  /** The week the run actually produced. */
  readonly week: WeekState;
  /** The same day closed on a week already at `needClean`, so the award banner renders. */
  readonly banked: WeekState;
  /** The week-day sheet. */
  readonly report: WeekDayReport;
  /** The same day shaped as a single run — `docs/17` § 3.2. Both shapes ship; both are swept. */
  readonly singleRunReport: SingleRunReport;
  /**
   * The same day, closed a **second** time — *attempt 2 at this day*.
   *
   * The `previous` half of the pairing a reader produces by pressing Run twice on one selection.
   * `runId` is building-dispatcher-seed, so the second run reproduces bit-identically (§ D223) and
   * the two sheets differ only in their attempt line — which is not one of `SELECTION_ROWS`' three,
   * so the block draws its *nothing moved* arm. That is the arm no seeded case had ever rendered.
   */
  readonly retried: WeekDayReport;
  /**
   * The same day on the **candidate** dispatcher — the pairing the delta block exists for.
   *
   * One building, one day, one seed, one plan, a different arm. `ReportBasis` deliberately does not
   * refuse it (`shift/report.ts`: *"a retry with a different dispatcher on one day is the comparison
   * this block exists to draw"*), so this is the pairing whose figure rows are actually drawn.
   */
  readonly swapped: WeekDayReport;
  /**
   * The same day run over a **different stretch** — issue #126's first new refusal axis.
   *
   * Same recording and same day: the *only* thing that differs is `ShiftPlan.shiftLengthS`, which is
   * what makes the refusal this pairs into attributable to one axis rather than to a run.
   */
  readonly shorterShift: WeekDayReport;
  /** The same day built from a **different arrival pattern** — issue #126's second new axis. */
  readonly otherPattern: WeekDayReport;
}

interface ShiftBundle {
  readonly observations: Observations;
  readonly dispatcherName: string;
  readonly days: readonly ShiftDay[];
}

/**
 * Memoised per context, because five adapters want the same day and the fold is a pass over every
 * leg plus a sort of `2n` queue events. Keyed on the context object, which `run.ts` builds fresh
 * per case, so nothing survives a case.
 */
const SHIFT_BUNDLES = new WeakMap<HonestyContext, ShiftBundle>();

/**
 * What the day was set to run, for a seeded case — `shift/report.ts#ShiftPlan`, issue #126.
 *
 * The case's own horizon rather than a constant, so the plan a sheet publishes is the plan the
 * recording was actually made under: `HonestyCase.durationS` is what `recordingConfigFor` passes as
 * `durationS`, and a basis naming a length the run did not have would be the defect § D227 is about
 * with the polarity reversed.
 *
 * `windowStartS: null` and `patternId: 'building'` are the comparable defaults — the whole of the
 * period, and the building's own traffic profile, which is the demand every published figure in this
 * repository was measured under and the one `recordingConfigFor` actually asks for.
 */
function planFor(context: HonestyContext): ShiftPlan {
  return { shiftLengthS: context.case.durationS, windowStartS: null, patternId: 'building' };
}

function shiftBundleOf(context: HonestyContext): ShiftBundle {
  const hit = SHIFT_BUNDLES.get(context);
  if (hit !== undefined) return hit;

  const { recording } = context;
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const nameOf = (profileId: string): string =>
    context.profiles.find((profile) => profile.id === profileId)?.name ?? profileId;
  const dispatcherName = nameOf(recording.dispatcherProfileId);
  const shiftPlan = planFor(context);
  /*
   * The candidate run, folded at its own end — the `previous` half of every drawn pairing.
   *
   * A second fold rather than a reuse, because it is a second run: `live/` folds once per recording
   * and this projects it, exactly as the case's own recording is folded above. See
   * `run.ts#comparisonConfigFor` for why the run exists at all.
   */
  const comparison = context.comparisonRecording;
  const comparisonObservations = shiftObservationsOf(
    observationsAt(comparison, comparison.endedAt),
  );
  const comparisonName = nameOf(comparison.dispatcherProfileId);

  const plan: readonly { readonly day: number; readonly contractId: string; readonly own: boolean }[] = [
    // The building's own scenario, on the odd-day goal set.
    { day: 1, contractId: contractForBuilding(context.case.buildingId)?.id ?? 'c1', own: false },
    // A building the reader drew, on the even-day goal set, banked against the last contract.
    { day: 4, contractId: 'c5', own: true },
  ];

  const days = plan.map(({ day, contractId, own }): ShiftDay => {
    const dayIdx = (day - 1) % 7;
    const contract = own ? undefined : contractById(contractId);
    const goals = goalsForDay(day);
    const readings = readGoals(goals, observations);
    /*
     * Through `scheduledEventFor` with **no period**, which is the shape every other axis on this
     * bundle takes: one ordinary week, varied one field at a time.
     *
     * `null` rather than a period on purpose, and said rather than left to look like an oversight —
     * GitHub issue #135. The strings a calendar can put on this sheet are `SHIFT_EVENTS`' own names
     * and notes, seeded below and swept on every shipped period by `CALENDAR_AND_FABRIC`, so a
     * third bundle day under `moving-week` would multiply six sheets across two surfaces to sweep a
     * vocabulary already in the corpus. What a period changes is *which* of those the card picks,
     * and that is a `report.test.ts` case rather than an R-property.
     */
    const event = scheduledEventFor(null, day, dayIdx);
    const outcome = outcomeOf({
      record: null,
      // No record and no cause: these bundle days are built from a recording rather than from a
      // `ViewerState`, so there is no state for `recordRefusalFor` to have refused.
      recordRefusal: null,
      day,
      dayIdx,
      eventId: event.id,
      arrived: observations.arrived,
      carried: observations.carried,
      minutePct: observations.minutePct,
      readings,
    });
    const opened: WeekState = { ...openWeek(contractId), day, dayIdx };
    const week = closeDay(opened, outcome);
    const banked = closeDay(
      { ...opened, cleanRun: contractById(contractId)?.needClean ?? 1 },
      outcome,
    );
    const common = {
      recording,
      observations,
      goals,
      // The banked week, so the sheet renders its cleared banner as well as its streak line.
      week: banked,
      contract,
      event,
      // The same `null` the event above was resolved against, and it has to be the same one: a
      // bundle whose today came from no period and whose tomorrow came from one would put two
      // weeks on one sheet.
      calendar: null,
      dispatcherName,
      dayStartS: DAY_START_S,
    };
    const report = dayReportOf({
      ...common,
      subject: { kind: 'week-day' },
      plan: shiftPlan,
      /*
       * An intervened day, so the sheet's log line is in the corpus — `docs/19` defect 10, on the
       * new producer `live/interventions.ts#interventionLogOf`. One press, mid-run, which is the
       * state the audit's own repro produced; the stamp's wording is the stage's own and the LIVE
       * adapter already drives it against a playhead. The five sibling sheets below carry **no**
       * log on purpose: an untouched day printing nothing is the other arm, and both are shipped
       * states.
       */
      interventions: [
        { atS: (recording.startedAt + recording.endedAt) / 2, change: { kind: 'park-cars-lobby' } },
      ],
      /*
       * And a **ruled** day, so the sheet's rule lines and its fallback sentence are in the corpus
       * — `docs/20` defect 2, on `shift/report.ts#ruleLines`. Two rows rather than one, because the
       * ordinal is part of the claim: `rule 1 · …` and `rule 2 · …` say the engine reads them in
       * first-match order, and a single row would sweep a sentence that never has to number itself.
       * The five sibling sheets below carry none, which is the other shipped arm — the same split
       * the intervention log above is seeded under.
       */
      ruleRows: [
        { when: 'lobby-queue-passes', whenValue: 30, then: 'hold-at-lobby' },
        { when: 'call-waited', whenValue: 30, then: 'jump-queue' },
      ],
    }) as WeekDayReport;
    /*
     * The four sheets a **pairing** needs — issue #127, and each is one axis away from `report`.
     *
     * Built here rather than in the adapter for `singleRunReport`'s reason one field down: a sheet is
     * a pure function of its input, six of them cost nothing beside the fold above, and an adapter
     * that assembled its own `DayReportInput` would be a second answer to *what a day's sheet is*.
     *
     * `retried` closes the **same** outcome onto the week the first close returned, which is what
     * `week.ts`'s retry branch keys on — a second independently opened week would say *attempt 1*
     * and pair as a sheet the shell cannot produce.
     */
    const retried = dayReportOf({
      ...common,
      week: closeDay(banked, outcome),
      subject: { kind: 'week-day' },
      plan: shiftPlan,
    }) as WeekDayReport;
    const swapped = dayReportOf({
      ...common,
      recording: comparison,
      /*
       * The candidate run's **own** fold, and its own dispatcher name. `dayReportOf` reads today's
       * goals against whatever observations it is handed, so the swapped sheet's figures, verdict and
       * goal readings are all statements about the candidate run — which is what makes the delta rows
       * underneath it a pairing of two runs rather than one run printed twice.
       */
      observations: comparisonObservations,
      dispatcherName: comparisonName,
      subject: { kind: 'week-day' },
      plan: shiftPlan,
    }) as WeekDayReport;
    const shorterShift = dayReportOf({
      ...common,
      subject: { kind: 'week-day' },
      // Half the horizon, and nothing else. `Math.round` keeps it a whole minute, which is what
      // `extentLineOf` compares on.
      plan: { ...shiftPlan, shiftLengthS: Math.round(shiftPlan.shiftLengthS / 120) * 60 },
    }) as WeekDayReport;
    const otherPattern = dayReportOf({
      ...common,
      subject: { kind: 'week-day' },
      /*
       * A **shipped** profile id rather than an invented one, so the axis is driven on a value the
       * rail's pattern select can actually produce: `dev/rightRail.ts#patternOptionsOf` offers
       * `'building'` plus every `data/traffic-profiles.json` profile, and the first of those is what
       * a reader picks when they leave the comparable default.
       */
      plan: { ...shiftPlan, patternId: context.trafficProfiles.profiles[0]?.id ?? 'office-standard' },
    }) as WeekDayReport;
    /*
     * The **same day, shaped as a single run** — driven beside the week-day sheet rather than
     * instead of it.
     *
     * A Free Play sheet is not a week-day sheet with six lines removed: it has a title of its own,
     * two meta lines the week never prints, an attempt line worded *at this selection*, and a
     * pointer at Compare. None of those strings entered the honesty sweep at all until this arm,
     * because the adapter drove one shape and the product ships two.
     */
    const singleRunReport = dayReportOf({
      ...common,
      subject: {
        kind: 'single-run',
        selection: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: null, durationS: 1800 },
      },
      plan: shiftPlan,
    }) as SingleRunReport;
    return {
      day,
      dayIdx,
      contract,
      event,
      goals,
      readings,
      week,
      banked,
      report,
      singleRunReport,
      retried,
      swapped,
      shorterShift,
      otherPattern,
    };
  });

  const bundle: ShiftBundle = { observations, dispatcherName, days };
  SHIFT_BUNDLES.set(context, bundle);
  return bundle;
}

/**
 * The one figure on the Day sheet that `awtIsValid` speaks for, by its shipped id.
 *
 * The same discipline `RUN_SUMMARY` applies with `AWT_ID`/`WT95_ID`/`TTD_ID`: the classification
 * comes from the surface's own id, never from a word in the value. `shift/report.ts`'s module
 * docstring states the rule this reads — *"`AVERAGE WAIT` is the only figure on this sheet that a
 * saturated run may not publish"* — and `worst-wait` is deliberately **not** here, because a
 * longest wait is an observation R4 says is drawn on a saturated run on purpose.
 */
const REPORT_AVERAGE_WAIT_ID = 'average-wait';

/** What R3, R11 and R13 need about a report cell, from the cell's own `tone`, `id` and `axisOnly`. */
function reportFigureShape(figure: ReportFigure): {
  readonly role: TextRole;
  readonly gated: boolean;
  readonly energyAxis: boolean;
} {
  const gated = figure.id === REPORT_AVERAGE_WAIT_ID;
  if (figure.tone === 'withheld') return { role: 'suppressed', gated, energyAxis: figure.axisOnly };
  if (figure.axisOnly) return { role: 'observation', gated: false, energyAxis: true };
  return { role: gated ? 'estimate' : 'observation', gated, energyAxis: false };
}

/**
 * The Day report — the sheet that prints `withheld`, and the most safety-critical string here.
 *
 * ## Why this is driven rather than excluded
 *
 * `shift/report.ts` publishes a mean. That is the whole of the argument: it is the only surface the
 * design refactor added that can print `summary.meanWaitS`, it gates that one figure on
 * `awtIsValid && !saturated`, and R3 plus the suppression rule are exactly the checks that claim
 * needs. A search that excluded it would be excluding the figure it exists to watch.
 *
 * Every seed's role is the **sheet's own** classification, read through {@link reportFigureShape}
 * from `ReportFigure.tone`, `ReportFigure.id` and `ReportFigure.axisOnly`. Nothing here decides
 * that a mean is legitimate: `averageWaitFigure` already asked the summary, and a cell that came
 * back `plain` on a suppressed run would be the sheet disagreeing with `core` — which the property
 * reports rather than this file second-guessing.
 *
 * ## The small print is a `reason`, and that is a structural fact rather than a kindness
 *
 * `DayReport.smallPrint` exists for one purpose: to refuse a comparative reading of one day.
 * *"This is one replication of one day on one seed. It cannot tell you that X is better than
 * anything — that needs 50 or more paired runs …"* It **names** the ordering claim it is refusing,
 * in R2's own words, which is precisely what `TextRole` `reason` is for and precisely why
 * `properties.ts` exempts that role: the refusal is the one string entitled to quote what it
 * refuses. See `checkSingleRunComparative`'s own note on the third narrowing.
 */
const SHIFT_REPORT: SurfaceAdapter = {
  id: 'shift/report.ts#dayReportOf',
  covers: [
    'shift/report.ts#dayReportOf',
    'shift/report.ts#averageWaitFigure',
    'shift/report.ts#clockRange',
    'shift/report.ts#NOT_RECORDED',
    /*
     * The filed sheet's intervention log — `docs/19` defect 10. Authored in `live/` beside the
     * stage stamp so the two share their verbs and their clock; rendered here because the sheet's
     * meta block is where its lines land, on the intervened day this bundle drives.
     */
    'live/interventions.ts#interventionLogOf',
    'shift/goals.ts#goalsForDay',
    'shift/goals.ts#readGoal',
    'shift/goals.ts#readGoals',
    'shift/goals.ts#bestLineFor',
    'shift/events.ts#SHIFT_EVENTS',
    'shift/events.ts#eventFor',
    'shift/events.ts#shiftRunPatch',
    'shift/week.ts#closeDay',
    'shift/contracts.ts#CONTRACTS',
    'shift/contracts.ts#contractById',
    'shift/contracts.ts#contractForBuilding',
    'shift/contracts.ts#nextContract',
    'shift/contracts.ts#statLineOf',
    'shift/weekLabel.ts#coachWeekLines',
    'shift/weekLabel.ts#weekKeptLine',
    'shift/tomorrow.ts#tomorrowBriefingOf',
    'dev/state.ts#tomorrowFactsOf',
  ],
  render(context) {
    const { recording } = context;
    const { summary } = recording;
    const bundle = shiftBundleOf(context);
    const seeds: TextSeed[] = [];

    /* ---- the sheet itself, on both days ---- */
    for (const entry of bundle.days) {
      const at = `day${String(entry.day)}`;
      const { report } = entry;
      seeds.push({ field: `${at}.title`, text: report.title, role: 'label' });
      for (const [index, line] of report.metaLines.entries()) {
        seeds.push({ field: `${at}.metaLines[${String(index)}]`, text: line, role: 'label' });
      }
      seeds.push({ field: `${at}.lede`, text: report.lede, role: 'observation' });

      for (const figure of report.figures) {
        const shape = reportFigureShape(figure);
        const countInNote = /(\d[\d,]*)/.test(figure.note);
        seeds.push({
          field: `${at}.figures(${figure.id}).value`,
          text: `${figure.label}: ${figure.value}`,
          role: shape.role,
          declaredCount: shape.gated ? summary.waitCount : undefined,
          // The sheet carries a figure's `n` in its **note**, which sits under the value in the
          // same cell. `countShown` is R13's *"in the same visual unit"*, so it is read off the
          // note the cell actually printed rather than off whether a count exists.
          countShown: shape.gated ? countInNote : undefined,
          energyAxis: shape.energyAxis,
          gated: shape.gated,
        });
        seeds.push({
          field: `${at}.figures(${figure.id}).note`,
          text: figure.note,
          // A withheld cell's note **is** `core`'s refusal, quoted whole.
          role: shape.role === 'suppressed' ? 'reason' : 'observation',
          declaredCount: shape.gated ? summary.waitCount : undefined,
          countShown: shape.gated ? countInNote : undefined,
          energyAxis: shape.energyAxis,
          gated: shape.gated,
        });
      }

      seeds.push({ field: `${at}.verdictLine`, text: report.verdictLine, role: 'observation' });
      seeds.push({ field: `${at}.streakLine`, text: report.streakLine, role: 'prose' });
      seeds.push({ field: `${at}.contractLine`, text: report.contractLine, role: 'label' });
      if (report.cleared !== null) {
        seeds.push({
          field: `${at}.cleared.reward`,
          text: report.cleared.reward,
          role: 'label',
        });
        seeds.push({
          field: `${at}.cleared.nextTitle`,
          text: report.cleared.nextTitle,
          role: 'label',
        });
      }
      for (const { reading, was } of report.goals) {
        seeds.push({
          field: `${at}.goals(${reading.goal.id}).label`,
          text: reading.goal.label,
          role: 'label',
        });
        /*
         * The "was" slot, as the panel dresses it — `was 78%`, or the bare em dash on a day with
         * no yesterday. An observation about the previous run, so it takes the same role as the
         * reading beside it; the seeded weeks here have no history, so this drives the em-dash
         * arm, and the RAIL adapter's advanced-day rows drive the figure arm.
         */
        seeds.push({
          field: `${at}.goals(${reading.goal.id}).was`,
          text: was === '—' ? was : `was ${was}`,
          role: 'observation',
        });
        /*
         * **Deliberately `observation`, not `goal`, and the distinction is the shift layer's own.**
         *
         * `TextRole` `goal` is R12's object — a goal whose across-seed pass rate must be published
         * beside it — and § D160 found that R12 *abolishes* the single-run goal category for the
         * campaign. `shift/goals.ts` states at length why a shift reading is a different thing:
         * it is a comparison of one day's **count** against a stated bar, never a claim that a
         * dispatcher is better, and the sheet's own small print says so on every single day. There
         * is no batch behind it and no rate to publish, so classifying it `goal` would report every
         * shipped day as an R12 violation of a rule aimed at the campaign.
         *
         * Nothing is hidden by the choice: R3, R10, R11 and R13's frequency clause all still read
         * these strings, and the value a reading prints is `GoalReading.display`, which is `—`
         * whenever the goal is `pending` — so a number cannot appear on an ungraded row.
         */
        seeds.push({
          field: `${at}.goals(${reading.goal.id}).display`,
          text: `${reading.goal.label} — ${reading.display}`,
          role: 'observation',
          declaredCount: bundle.observations.arrived,
          countShown: false,
        });
      }
      for (const row of report.diagnosis) {
        seeds.push({ field: `${at}.diagnosis(${row.id}).when`, text: row.when, role: 'label' });
        seeds.push({ field: `${at}.diagnosis(${row.id}).what`, text: row.what, role: 'observation' });
        seeds.push({ field: `${at}.diagnosis(${row.id}).why`, text: row.why, role: 'prose' });
      }
      for (const lever of report.levers) {
        seeds.push({ field: `${at}.levers(${lever.id}).title`, text: lever.title, role: 'label' });
        seeds.push({ field: `${at}.levers(${lever.id}).body`, text: lever.body, role: 'prose' });
      }
      seeds.push({ field: `${at}.forecast.name`, text: report.forecast.name, role: 'label' });
      seeds.push({ field: `${at}.forecast.note`, text: report.forecast.note, role: 'prose' });
      seeds.push({
        field: `${at}.forecast.demand`,
        text: report.forecast.demand,
        role: 'observation',
      });
      seeds.push({ field: `${at}.taught`, text: report.taught, role: 'prose' });
      // The refusal. See the adapter's docstring.
      seeds.push({ field: `${at}.smallPrint`, text: report.smallPrint, role: 'reason' });
      seeds.push({ field: `${at}.nextDayName`, text: report.nextDayName, role: 'label' });

      /* ---- the day's own inputs, driven where the sheet reaches them through a helper ---- */
      seeds.push({
        field: `${at}.bestLineFor`,
        text: bestLineFor(bundle.observations, entry.banked.bestMinutePct),
        role: 'observation',
      });
      const firstGoal = entry.goals[0];
      if (firstGoal !== undefined) {
        const reading = readGoal(firstGoal, bundle.observations);
        seeds.push({
          field: `${at}.readGoal(${firstGoal.id})`,
          text: `${firstGoal.label} — ${reading.display}`,
          role: 'observation',
        });
      }
      seeds.push({ field: `${at}.eventFor.name`, text: entry.event.name, role: 'label' });
      seeds.push({ field: `${at}.eventFor.note`, text: entry.event.note, role: 'prose' });
    }

    /* ---- the figure the whole sheet is careful about, driven on its own ---- */
    const wait = averageWaitFigure(summary);
    const waitShape = reportFigureShape(wait);
    seeds.push({
      field: 'averageWaitFigure.value',
      text: `${wait.label}: ${wait.value}`,
      role: waitShape.role,
      declaredCount: summary.waitCount,
      countShown: /(\d[\d,]*)/.test(wait.note),
      gated: true,
    });
    seeds.push({
      field: 'averageWaitFigure.note',
      text: wait.note,
      role: waitShape.role === 'suppressed' ? 'reason' : 'observation',
      declaredCount: summary.waitCount,
      countShown: /(\d[\d,]*)/.test(wait.note),
      gated: true,
    });
    /* ---- the coach ribbon's two lines, on all three kinds of week ---- */
    /*
     * Driven over the three cases rather than one, because the defect `weekLabel.ts` closes was that
     * **two of the three branches were unreachable** — the predicate tested a `string` against
     * `undefined`, so *Sandbox* and *free play* had never been printed at all. A sweep that drove
     * the common case would have swept the one branch that worked.
     *
     * `openWeek('no-such-contract')` is the reader's own building, and it is spelled as an id no
     * contract answers to rather than as a flag, because that is exactly how the shell reaches it.
     */
    for (const [name, week] of [
      ['scenario', { ...openWeek('c2'), day: 4, cleanRun: 1 }],
      ['endless', { ...openEndless(), day: 12, cleanRun: 5 }],
      ['sandbox', openWeek('no-such-contract')],
      /*
       * The fourth branch, added with GitHub issue #125 and added for this loop's founding reason.
       * A free-play week used to carry the *building's* contract id, so it reached the **scenario**
       * branch and a run that banks nothing was labelled *Scenario · day 1 · 0 clean shifts banked*.
       * It now carries `FREE_PLAY_CONTRACT_ID` and has a branch of its own — and a branch nothing
       * drives is a claim nobody checks, which is what this loop exists to say.
       */
      ['free play', openWeek(FREE_PLAY_CONTRACT_ID)],
    ] as const) {
      const lines = coachWeekLines(week, 1800);
      seeds.push({ field: `coachWeekLines(${name}).label`, text: lines.label, role: 'label' });
      /*
       * `observation` rather than `label`: two of the three progress lines carry a **count** — clean
       * shifts banked, clean days run — and a count on a surface is the thing R13's clauses are
       * about. Classifying it `label` would exempt exactly the half of the line worth checking.
       */
      seeds.push({
        field: `coachWeekLines(${name}).progress`,
        text: lines.progress,
        role: 'observation',
      });
    }

    /* ---- the line about the week that was just put down — issue #107 ---- */
    /*
     * `weekKeptLine` is a **claim about a week that is no longer on screen**, which is the hardest
     * kind of string for a reader to check and therefore the one most worth sweeping: it names a
     * day, sometimes a streak and sometimes a banked count, about a state the player cannot see.
     *
     * Four pairs, covering the three names it can produce — a scenario, an endless week, a drawn
     * building's — and both of the endings, *starts a new week* and *picks up on day n*. The name
     * coverage is the same defect `coachWeekLines` was written to close, one function over: a
     * branch nothing can print is a claim nobody can check. The `undefined` case is not seeded
     * because it is the absence of a string; `weekLabel.test.ts` is where it is asserted.
     */
    for (const [name, left, arrived] of [
      ['scenario→scenario', { ...openWeek('c1'), day: 4, streak: 4, cleanRun: 4 }, openWeek('c2')],
      ['scenario→resumed', { ...openWeek('c1'), day: 4, streak: 2 }, { ...openWeek('c2'), day: 3 }],
      ['endless→scenario', { ...openEndless(), day: 12, cleanRun: 5 }, openWeek('c2')],
      [
        'scenario→sandbox',
        { ...openWeek('c1'), day: 4, cleanRun: 1 },
        { ...openWeek('no-such-contract'), day: 4 },
      ],
      /*
       * The fifth pair, and the one whose line a player now reads on every **Start** — issue #125.
       * `dev/main.ts`'s `start` arm prints this the way the building select does, because a parked
       * week and a destroyed one look identical from the ribbon, and this sentence is what tells
       * them apart. It is also the only pair that reaches the arrival clause *"is one run and banks
       * nothing"*, which replaces *"starts a new week"* for a mode that has no week to start.
       */
      [
        'scenario→free play',
        { ...openWeek('c2'), day: 4, streak: 4, cleanRun: 2 },
        openWeek(FREE_PLAY_CONTRACT_ID),
      ],
    ] as const) {
      const line = weekKeptLine(left, arrived);
      if (line === undefined) continue;
      seeds.push({
        // `observation` for `coachWeekLines(…).progress`'s reason: the line's whole content is
        // counts, and classifying it `label` would exempt the half worth checking.
        field: `weekKeptLine(${name})`,
        text: line,
        role: 'observation',
      });
    }

    /* ---- the between-day beat — GitHub issue #91 ---- */
    /*
     * Driven through **the shipped chain**, not through hand-chosen numbers.
     *
     * `tomorrowFactsOf` resolves tomorrow's building the way `closeShift` does — commissioning,
     * growth, the calendar, `parseBuilding`/`resolveBuilding` — so the population the sweep checks
     * is the population a player would be shown, and the two figures in `TENANTS` come from two
     * different resolved documents rather than from one multiplied by 1.11. A seed built from a
     * literal would have swept a string this surface cannot actually produce.
     *
     * Both days of the bundle are driven, because the beat differs on them in a way that matters:
     * day 1 is the building exactly as shipped and day 4 is 1.33× it, so the reveal's own delta is
     * exercised at two magnitudes rather than at one. All three verdicts are driven for the same
     * reason `VERDICT_VOICE` is a table — `ungraded` is the arm whose sentence a finding removed
     * once already (§ D234), and a sweep that drove only the day's own verdict would leave two of
     * the three unswept on any given case.
     */
    {
      const shiftResources = browserResourcesOf(context);
      for (const entry of bundle.days) {
        const at = `day${String(entry.day)}`;
        const facts = tomorrowFactsOf(shiftResources, {
          ...initialState(shiftResources, 1n),
          buildingId: context.case.buildingId,
          week: entry.week,
        });
        for (const verdict of ['cleared', 'missed', 'ungraded'] as const) {
          const beat = tomorrowBriefingOf({
            closed: entry.week.history.at(-1) ?? null,
            week: entry.week,
            contract: entry.contract,
            verdict,
            populationToday: context.building.totalPopulation,
            populationTomorrow: facts.population,
            calendarLineTomorrow: facts.calendarLine,
            withheldTomorrow: facts.withheld,
          });
          const where = `${at}.tomorrow(${verdict})`;
          seeds.push({ field: `${where}.headline`, text: beat.headline, role: 'label' });
          for (const group of beat.groups) {
            seeds.push({
              field: `${where}.${group.id}.caption`,
              text: group.caption,
              role: 'label',
            });
            for (const row of group.rows) {
              seeds.push({ field: `${where}.${group.id}(${row.id}).label`, text: row.label, role: 'label' });
              /*
               * `observation` on both halves, for `coachWeekLines(…).progress`'s reason: every
               * value here is a **count** — legs carried, clean days, people moving in — and a
               * count is precisely what R13's clauses are about. Classifying the value `label`
               * would exempt the half of the row worth checking.
               *
               * No `declaredCount` is passed, and that is a statement rather than an omission:
               * none of these figures is an *estimate* over a sample. They are counts of things
               * that happened and populations read off a building document, so there is no `n`
               * they could carry and none is claimed.
               */
              seeds.push({ field: `${where}.${group.id}(${row.id}).value`, text: row.value, role: 'observation' });
              seeds.push({ field: `${where}.${group.id}(${row.id}).note`, text: row.note, role: 'observation' });
            }
          }
          for (const [index, line] of beat.withheld.entries()) {
            // A refusal, and `reason` is the role a refusal gets — it is entitled to name what it
            // is refusing. See the adapter's docstring on the small print.
            seeds.push({ field: `${where}.withheld[${String(index)}]`, text: line, role: 'reason' });
          }
        }
      }
    }

    seeds.push({ field: 'NOT_RECORDED', text: NOT_RECORDED, role: 'label' });
    seeds.push({
      field: 'clockRange',
      text: clockRange(recording.startedAt, recording.endedAt, DAY_START_S),
      role: 'label',
    });

    /* ---- the five events, and what each writes into a run ---- */
    const trafficProfile =
      context.trafficProfiles.profiles.find(
        (candidate) => candidate.id === context.building.trafficProfile,
      ) ?? context.trafficProfiles.profiles[0];
    for (const event of Object.values(SHIFT_EVENTS)) {
      seeds.push({ field: `SHIFT_EVENTS.${event.id}.name`, text: event.name, role: 'label' });
      seeds.push({ field: `SHIFT_EVENTS.${event.id}.note`, text: event.note, role: 'prose' });
      if (trafficProfile === undefined) continue;
      /*
       * Both values of `templateVariesMix`, because the refusal only exists under the second: a
       * `lunch-two-way` run has its directional mix set by the template, `core` refuses both at
       * once, and `shiftRunPatch` says so rather than producing a config that throws. The viewer
       * runs both templates, so both are configurations a reader reaches.
       */
      for (const varies of [false, true]) {
        const patch = shiftRunPatch({
          event,
          building: context.building,
          base: baseDemandOf(trafficProfile),
          templateVariesMix: varies,
        });
        for (const [index, withheld] of patch.withheld.entries()) {
          seeds.push({
            field: `shiftRunPatch(${event.id}, variesMix=${String(varies)}).withheld[${String(index)}]`,
            text: withheld,
            role: 'reason',
          });
        }
      }
    }

    /* ---- the five contracts, and the stat line derived from the building rather than authored ---- */
    for (const contract of CONTRACTS) {
      seeds.push({ field: `CONTRACTS.${contract.id}.label`, text: contract.label, role: 'label' });
      seeds.push({ field: `CONTRACTS.${contract.id}.title`, text: contract.title, role: 'label' });
      seeds.push({ field: `CONTRACTS.${contract.id}.teaches`, text: contract.teaches, role: 'prose' });
      seeds.push({ field: `CONTRACTS.${contract.id}.brief`, text: contract.brief, role: 'prose' });
      seeds.push({ field: `CONTRACTS.${contract.id}.reward`, text: contract.reward, role: 'label' });
      const after = nextContract(contract.id);
      if (after !== undefined) {
        seeds.push({
          field: `nextContract(${contract.id})`,
          text: `${after.label} — ${after.title}`,
          role: 'label',
        });
      }
    }
    seeds.push({
      field: 'statLineOf',
      text: statLineOf(context.building),
      role: 'observation',
    });

    return singleRun(this.id, seeds);
  },
};

/**
 * The four editors' copy — slider labels, tooltips, summary lines and advice.
 *
 * ## Why this is one adapter over four modules
 *
 * They are one surface to a reader: `docs/12` § 1.3 M8–M11 is a single editing column that swaps
 * its rows as the reader moves between the dispatcher, the pattern, the machine and the building.
 * The `field` on every seed names the module and the export, so a violation still points at one
 * function.
 *
 * ## What is driven, and what a row's `help` is
 *
 * Every `SpecRow`, `MachineRow` and `PatternRow` carries a `label` and a `help`, and the `help` is
 * the tooltip a reader opens — prose this package authored, about what the control does to the
 * simulation. It is **not** {@link TextProvenance} `schema`: `core` did not write it, no
 * `SearchParameter.description` is being re-printed, and § D171's narrowing of R10 is scoped to
 * text `core` wrote about its own dial. So it is `single-run`, exactly as the existing `EDITOR`
 * adapter classifies `validateBuilding`'s messages, and every property reads it.
 *
 * The specs driven are the reader's real starting points: the case's own building read back with
 * `specFromBuilding`, the case's own dispatcher with `specFromProfile`, the building's own traffic
 * profile with `specFromTrafficProfile`, and the blank forms a reader starting from nothing gets.
 * The one constructed spec is the `rideTime`-under-`up-down-buttons` vector, which is § D112's
 * shipped defect and the thing `inertTerms` exists to refuse — a vector a reader produces by
 * dragging one slider.
 */
const AUTHORING: SurfaceAdapter = {
  id: 'authoring/buildingSpec.ts#buildingSummary',
  covers: [
    'authoring/buildingSpec.ts#buildingSummary',
    'authoring/buildingSpec.ts#buildingAdvice',
    'authoring/buildingSpec.ts#occupancyLine',
    'authoring/buildingSpec.ts#validateSpec',
    'authoring/buildingSpec.ts#upPeakAnalysisOf',
    'authoring/buildingSpec.ts#SPEC_ROWS',
    'authoring/buildingSpec.ts#BLANK_SPEC',
    'authoring/buildingSpec.ts#specFromBuilding',
    'authoring/buildingSpec.ts#buildingFromSpec',
    'authoring/dispatcherSpec.ts#adviceFor',
    'authoring/dispatcherSpec.ts#costFunctionLine',
    'authoring/dispatcherSpec.ts#inertTerms',
    'authoring/dispatcherSpec.ts#DWELL_HINTS',
    'authoring/dispatcherSpec.ts#specFromProfile',
    'authoring/dispatcherSpec.ts#profileFromSpec',
    'authoring/dispatcherSpec.ts#blankSpec',
    'authoring/machineSpec.ts#MACHINE_ROWS',
    'authoring/machineSpec.ts#machineSummary',
    'authoring/machineSpec.ts#plainDescription',
    'authoring/machineSpec.ts#specFromClass',
    'authoring/machineSpec.ts#classFromSpec',
    'authoring/patternSpec.ts#PATTERN_ROWS',
    'authoring/patternSpec.ts#patternSummary',
    'authoring/patternSpec.ts#PEAK_ORDER_INFO',
    'authoring/patternSpec.ts#PEAK_ORDERS',
    'authoring/patternSpec.ts#rowsFor',
    'authoring/patternSpec.ts#DEFAULT_PATTERN',
    'authoring/patternSpec.ts#specFromTrafficProfile',
  ],
  render(context) {
    const seeds: TextSeed[] = [];

    /* ---- M11, the building ---- */
    for (const row of SPEC_ROWS) {
      seeds.push({ field: `SPEC_ROWS.${row.key}.label`, text: `${row.group} · ${row.label}`, role: 'label' });
      seeds.push({ field: `SPEC_ROWS.${row.key}.help`, text: row.help, role: 'prose' });
    }
    const authored = specFromBuilding(context.building.config, context.building.id);
    const specs: readonly { readonly label: string; readonly spec: BuildingSpec }[] = [
      { label: 'from-building', spec: authored },
      { label: 'blank', spec: BLANK_SPEC },
      /*
       * A drag that has orphaned a floor, and a rise past the class envelope. Both are states a
       * reader reaches by dragging a shaft's band, and both are the sentences `validateSpec`
       * exists to draw — the second of which is worded so it does **not** claim the loader
       * refuses, because `config/parse.ts` raises it as an advisory and builds the bank.
       */
      {
        label: 'orphaned-band',
        spec: { ...BLANK_SPEC, floors: 20, cars: 1, bandByCar: { 0: [0, 4] as readonly [number, number] } },
      },
      /*
       * All four escalator states at once — an end the tower no longer has, both ends on one
       * floor, a traversal time the loader refuses, and a machine that lands on no transfer
       * level. Each is a distinct sentence in `validateSpec`, and three of the four are claims
       * about what the loader does, which is exactly the class `documentation.test.ts` catches
       * one level up and this sweep catches at the control.
       */
      {
        label: 'escalators',
        spec: {
          ...BLANK_SPEC,
          skyFloors: [6],
          transportModes: [
            { id: 'escalator-1', connects: [6, 7] as readonly [number, number], traversalTimeS: 21.2 },
            { id: 'escalator-2', connects: [2, 3] as readonly [number, number], traversalTimeS: 21.2 },
            { id: 'escalator-3', connects: [4, 4] as readonly [number, number], traversalTimeS: 21.2 },
            { id: 'escalator-4', connects: [1, 40] as readonly [number, number], traversalTimeS: 21.2 },
            { id: 'escalator-5', connects: [8, 9] as readonly [number, number], traversalTimeS: 0 },
          ],
        },
      },
    ];
    for (const { label, spec } of specs) {
      seeds.push({ field: `buildingSummary(${label})`, text: buildingSummary(spec), role: 'observation' });
      seeds.push({ field: `occupancyLine(${label})`, text: occupancyLine(spec), role: 'observation' });
      seeds.push({ field: `buildingAdvice(${label})`, text: buildingAdvice(spec), role: 'prose' });
      /*
       * The sizing block — slice 6. Every string the block can draw goes in: the figures line and
       * the § 10 reading on the analysable specs, the re-voiced divergence sentences (the shipped
       * buildings trip them — `from-building` alone raises several), and both refusal shapes (the
       * `escalators` spec is a document the loader refuses, so it exercises the building-level
       * one). Empty seeds are filtered by `singleRun`, so a refused bank's empty line costs
       * nothing.
       */
      const sized = upPeakAnalysisOf(spec, context.elevatorSpecs);
      seeds.push({ field: `upPeakAnalysisOf(${label}).refusal`, text: sized.refusal, role: 'reason' });
      for (const bank of sized.banks) {
        const at = `upPeakAnalysisOf(${label}).${bank.bankId}`;
        seeds.push({ field: `${at}.refusal`, text: bank.refusal, role: 'reason' });
        seeds.push({ field: `${at}.line`, text: bank.line, role: 'observation' });
        seeds.push({ field: `${at}.reading`, text: bank.reading, role: 'prose' });
        for (const [index, warning] of bank.warnings.entries()) {
          seeds.push({ field: `${at}.warnings[${String(index)}]`, text: warning, role: 'reason' });
        }
      }
      const built = buildingFromSpec(spec, { specs: context.elevatorSpecs });
      seeds.push({ field: `buildingFromSpec(${label}).name`, text: built.name, role: 'label' });
      for (const bank of built.banks) {
        seeds.push({
          field: `buildingFromSpec(${label}).banks(${bank.id}).name`,
          text: bank.name ?? bank.id,
          role: 'label',
        });
      }
    }

    /* ---- M10, the machine class ---- */
    for (const row of MACHINE_ROWS) {
      seeds.push({ field: `MACHINE_ROWS.${row.key}.label`, text: `${row.group} · ${row.label}`, role: 'label' });
      seeds.push({ field: `MACHINE_ROWS.${row.key}.help`, text: row.help, role: 'prose' });
    }
    const classes = classesFromSpecs(context.elevatorSpecs);
    for (const machineClass of classes) {
      seeds.push({
        field: `plainDescription(${machineClass.id})`,
        text: plainDescription(machineClass),
        role: 'observation',
      });
      const machineSpec = specFromClass(machineClass);
      seeds.push({
        field: `specFromClass(${machineClass.id}).name`,
        text: machineSpec.name,
        role: 'label',
      });
      seeds.push({
        field: `machineSummary(${machineClass.id})`,
        text: machineSummary(machineSpec),
        role: 'observation',
      });
      const saved: MachineClass = classFromSpec(machineSpec, `${machineClass.id}-yours`);
      seeds.push({ field: `classFromSpec(${machineClass.id}).name`, text: saved.name, role: 'label' });
      seeds.push({
        field: `classFromSpec(${machineClass.id}).application`,
        text: saved.application,
        role: 'label',
      });
    }
    // The building editor draws its class limits beside the elevation. `classes[2]` is the row the
    // viewer opens on (`dev/state.ts`), and the orphaned-band spec above is 20 floors of 3.6 m.
    const limitClass = classes[2] ?? classes[0];
    for (const { label, spec } of specs) {
      for (const [index, problem] of validateSpec(spec, limitClass).entries()) {
        seeds.push({
          field: `validateSpec(${label})[${String(index)}]`,
          text: problem,
          role: 'reason',
        });
      }
    }

    /* ---- M9, the arrival pattern ---- */
    for (const row of PATTERN_ROWS) {
      seeds.push({ field: `PATTERN_ROWS.${row.key}.label`, text: `${row.group} · ${row.label}`, role: 'label' });
      seeds.push({ field: `PATTERN_ROWS.${row.key}.help`, text: row.help, role: 'prose' });
    }
    for (const order of PEAK_ORDERS) {
      const info = PEAK_ORDER_INFO[order];
      seeds.push({ field: `PEAK_ORDER_INFO.${order}.label`, text: info.label, role: 'label' });
      seeds.push({ field: `PEAK_ORDER_INFO.${order}.note`, text: info.note, role: 'prose' });
      const patternSpec = { ...DEFAULT_PATTERN, order };
      seeds.push({
        field: `patternSummary(${order})`,
        text: patternSummary(patternSpec),
        role: 'observation',
      });
      for (const row of rowsFor(patternSpec)) {
        seeds.push({ field: `rowsFor(${order}).${row.key}`, text: row.label, role: 'label' });
      }
    }
    const buildingPattern = specFromTrafficProfile(
      context.trafficProfiles,
      context.building.trafficProfile,
    );
    seeds.push({ field: 'specFromTrafficProfile.name', text: buildingPattern.name, role: 'label' });
    seeds.push({
      field: 'specFromTrafficProfile.summary',
      text: patternSummary(buildingPattern),
      role: 'observation',
    });
    seeds.push({ field: 'DEFAULT_PATTERN.name', text: DEFAULT_PATTERN.name, role: 'label' });

    /* ---- M8, the dispatcher ---- */
    for (const [choice, hint] of Object.entries(DWELL_HINTS)) {
      seeds.push({ field: `DWELL_HINTS.${choice}`, text: hint, role: 'prose' });
    }
    const termIds = Object.keys(
      context.profiles.find((profile) => profile.id === context.case.baselineProfileId)?.weights ?? {},
    );
    const dispatcherSpecs: readonly { readonly label: string; readonly spec: DispatcherSpec }[] = [
      ...context.profiles.map((profile) => ({
        label: profile.id,
        spec: specFromProfile(profile),
      })),
      { label: 'blank', spec: blankSpec(termIds) },
      /* § D112's vector: a weighted `rideTime` the engine will not read. */
      {
        label: 'inert-ridetime',
        spec: {
          name: 'My dispatcher',
          weights: { rideTime: 50, waitTime: 100 },
          families: {},
          flags: { pool: false, zone: false, bypass: true },
        },
      },
    ];
    for (const { label, spec } of dispatcherSpecs) {
      seeds.push({ field: `specFromProfile(${label}).name`, text: spec.name, role: 'label' });
      seeds.push({
        field: `costFunctionLine(${label})`,
        text: costFunctionLine(spec, (termId) => termId),
        role: 'observation',
      });
      seeds.push({ field: `adviceFor(${label})`, text: adviceFor(spec), role: 'prose' });
      for (const inert of inertTerms(spec)) {
        seeds.push({
          field: `inertTerms(${label}).${inert.termId}`,
          text: inert.why,
          role: 'reason',
        });
      }
      seeds.push({
        field: `profileFromSpec(${label}).name`,
        text: profileFromSpec(spec, { id: `${label}-edited` }).name,
        role: 'label',
      });
    }

    return singleRun(this.id, seeds);
  },
};

/**
 * The left rail's view models — § 1.2 L1–L7.
 *
 * `dev/leftRail.ts` is in `dev/` because it also mounts, and everything driven here is the pure
 * half: the mood card, the four stat rows, *YOUR RUN*, *TODAY'S SHIFT*, the maths disclosure and
 * the decision log's row shape. `mountLeftRail` is the DOM half and is excluded with the rest of
 * the mounts; the split is `controls/render.ts`'s and this file's own — *"the decision is a pure
 * function returning a descriptor, and the DOM is the dumb instantiator"*.
 *
 * The four **idle** views are driven too, and they are not filler: they are the state a reader
 * meets before the first shift, they are the one place the rail must claim nothing at all, and
 * `idleStatRowsOf` deliberately does not print the caption `served under 60 s` because no run has
 * measured a threshold. A surface that says nothing is exactly where an invented figure hides.
 */
const RAIL_VIEW: SurfaceAdapter = {
  id: 'dev/leftRail.ts#moodViewOf',
  covers: [
    'dev/leftRail.ts#moodViewOf',
    'dev/leftRail.ts#idleMoodView',
    'dev/leftRail.ts#statRowsOf',
    'dev/leftRail.ts#idleStatRowsOf',
    'dev/leftRail.ts#servedCaptionFor',
    'dev/leftRail.ts#servedTitleFor',
    'dev/leftRail.ts#streakLineOf',
    'dev/leftRail.ts#runFiguresOf',
    'dev/leftRail.ts#historyBarsOf',
    'dev/leftRail.ts#goalRowsOf',
    'dev/leftRail.ts#mathsDisclosureOf',
    'dev/leftRail.ts#idleHonestyCard',
    'dev/leftRail.ts#idleDecisionRow',
    'dev/leftRail.ts#moodDriverRowsOf',
  ],
  render(context) {
    const { recording } = context;
    const seeds: TextSeed[] = [];
    const bundle = shiftBundleOf(context);

    for (const at of sampleTimes(recording)) {
      const stamp = at.toFixed(0);
      /* The rail's own choice at this playhead, not the parameter default — see {@link railBasisAt}. */
      const basis = railBasisAt(recording, at);
      const bands = waitBandsAt(recording, at, basis);
      const view = moodViewOf(bands, moodOf(bands));
      const banded = atPlayhead(recording, at, bands.basis);
      seeds.push({ field: `moodViewOf(${basis}, @${stamp}s).headline`, text: view.headline, role: 'observation', playhead: banded });
      seeds.push({ field: `moodViewOf(${basis}, @${stamp}s).sub`, text: view.sub, role: 'observation', playhead: banded });
      seeds.push({
        field: `moodViewOf(${basis}, @${stamp}s).barLabel`,
        text: view.barLabel,
        role: 'observation',
        declaredCount: bands.total,
        countShown: true,
        playhead: banded,
      });
      for (const entry of view.legend) {
        seeds.push({
          field: `moodViewOf(${basis}, @${stamp}s).legend(${entry.bandId})`,
          text: `${entry.label} ${String(entry.count)}`,
          role: 'observation',
          declaredCount: bands.total,
          countShown: true,
          playhead: banded,
        });
      }

      const live = observationsAt(recording, at);
      for (const row of statRowsOf(live)) {
        seeds.push({
          field: `statRowsOf(@${stamp}s).${row.label}.value`,
          text: `${row.label}: ${row.value}`,
          role: 'observation',
          playhead: atPlayhead(recording, at),
        });
        seeds.push({
          field: `statRowsOf(@${stamp}s).${row.label}.title`,
          text: row.title,
          role: 'prose',
          playhead: atPlayhead(recording, at),
        });
      }
      seeds.push({
        field: `servedCaptionFor(@${stamp}s)`,
        text: servedCaptionFor(live.longWaitThresholdS),
        role: 'label',
        playhead: atPlayhead(recording, at),
      });
      seeds.push({
        field: `servedTitleFor(@${stamp}s)`,
        text: servedTitleFor(live.longWaitThresholdS, live.servedCount),
        role: 'prose',
        declaredCount: live.servedCount,
        countShown: true,
        playhead: atPlayhead(recording, at),
      });

      const mood = context.bundleAt(at).mood;
      const driverOf = new Map(mood.drivers.map((driver) => [driver.label, driver] as const));
      for (const row of moodDriverRowsOf(mood)) {
        const driver = driverOf.get(row.label);
        seeds.push({
          field: `moodDriverRowsOf(@${stamp}s).${row.label}`,
          text: `${row.label}: ${row.glyph} ${row.text}`,
          // The retraction row carries no driver, and it withholds rather than reports. See MOOD.
          role: driver === undefined ? 'reason' : 'observation',
          playhead: atPlayhead(recording, at, driver?.basis),
        });
      }

      for (const mode of ['casual', 'engineer'] as const) {
        for (const showMaths of [false, true]) {
          const card = honestyAt(recording, at, mode, basis);
          const declared = mode === 'casual' ? card.basis : undefined;
          const disclosure = mathsDisclosureOf(card, showMaths, mode);
          seeds.push({
            field: `mathsDisclosureOf(${mode}, showMaths=${String(showMaths)}, ${basis}, @${stamp}s).toggleLabel`,
            text: disclosure.toggleLabel,
            role: 'label',
            playhead: atPlayhead(recording, at, declared),
          });
          if (disclosure.mathsHidden || disclosure.maths === '') continue;
          seeds.push({
            field: `mathsDisclosureOf(${mode}, showMaths=${String(showMaths)}, ${basis}, @${stamp}s).maths`,
            text: disclosure.maths,
            // `honestyAt` already asked `meansAreSuppressed`; a suppressed card's maths is the
            // refusal's own arithmetic, and everything else in that slot is a count or a threshold.
            role: context.suppressed ? 'reason' : 'observation',
            declaredCount: recording.summary.waitCount,
            countShown: true,
            playhead: atPlayhead(recording, at, declared),
          });
        }
      }
    }

    /* ---- the week, on the two days the shift bundle closed ---- */
    for (const entry of bundle.days) {
      const at = `day${String(entry.day)}`;
      const streak = streakLineOf(entry.banked);
      seeds.push({ field: `${at}.streakLineOf`, text: streak.text, role: 'observation' });
      for (const figure of runFiguresOf(entry.banked)) {
        seeds.push({
          field: `${at}.runFiguresOf(${figure.label})`,
          text: `${figure.value} ${figure.label}`,
          role: 'observation',
        });
      }
      for (const bar of historyBarsOf(
        entry.banked.history,
        bundle.observations.minutePct,
        entry.dayIdx,
      )) {
        seeds.push({ field: `${at}.historyBarsOf(${bar.short}).title`, text: bar.title, role: 'observation' });
      }
      // The pre-history branch: a day still running, and a week with nothing banked at all.
      for (const bar of historyBarsOf([], undefined, entry.dayIdx)) {
        seeds.push({ field: `${at}.historyBarsOf(empty).title`, text: bar.title, role: 'observation' });
      }
      for (const row of goalRowsOf(entry.readings, entry.week.history, entry.day)) {
        seeds.push({
          field: `${at}.goalRowsOf(${row.label}).value`,
          // The glyph is never the only signal — KB-15 — so the row is driven as a reader sees it,
          // "was" slot included. On the day just closed the history holds no *previous* day, so
          // this is the em-dash arm; the figure arm is the advanced day below.
          text: `${row.glyph} ${row.label} — ${row.was} — ${row.value}`,
          role: 'observation',
        });
      }
      /*
       * The same rows on the **morning after** — `nextDay` of the closed week, which is the state
       * a player reaches by pressing the report's own primary button. It is the only shipped state
       * whose "was" slot carries a figure rather than the em dash (the previous day is now
       * `history[day-1]`), so without it the corpus would sweep the dash and never the number —
       * and a mis-attributed yesterday is exactly the claim this slot could get wrong.
       */
      const morningAfter = nextDay(entry.week);
      const tomorrowsGoals = readGoals(goalsForDay(morningAfter.day), bundle.observations);
      for (const row of goalRowsOf(tomorrowsGoals, morningAfter.history, morningAfter.day)) {
        seeds.push({
          field: `${at}.goalRowsOf(nextDay, ${row.label}).was`,
          text: `${row.glyph} ${row.label} — ${row.was} — ${row.value}`,
          role: 'observation',
        });
      }
    }

    /* ---- the state before the first shift ---- */
    const idleMood = idleMoodView();
    seeds.push({ field: 'idleMoodView.headline', text: idleMood.headline, role: 'label' });
    seeds.push({ field: 'idleMoodView.sub', text: idleMood.sub, role: 'label' });
    seeds.push({ field: 'idleMoodView.barLabel', text: idleMood.barLabel, role: 'label' });
    for (const row of idleStatRowsOf()) {
      seeds.push({ field: `idleStatRowsOf(${row.label}).value`, text: `${row.label}: ${row.value}`, role: 'label' });
      seeds.push({ field: `idleStatRowsOf(${row.label}).title`, text: row.title, role: 'prose' });
    }
    const idleCard = idleHonestyCard();
    seeds.push({ field: 'idleHonestyCard.title', text: idleCard.title, role: 'label' });
    seeds.push({ field: 'idleHonestyCard.plain', text: idleCard.plain, role: 'prose' });
    const idleRow = idleDecisionRow();
    seeds.push({ field: 'idleDecisionRow.head', text: idleRow.head, role: 'label' });
    seeds.push({ field: 'idleDecisionRow.why', text: idleRow.why, role: 'prose' });
    seeds.push({ field: 'idleDecisionRow.title', text: idleRow.title, role: 'prose' });

    return singleRun(this.id, seeds);
  },
};

/**
 * Two sheets the panel is asked to difference, and what makes the pair interesting.
 *
 * `current` is always a sheet of {@link HonestyContext.recording}, and that is not a convenience: it
 * is what keeps the properties answerable. Every check reads `context.recording.summary`, so a
 * pairing whose *current* sheet described the candidate run would be asking R3 whether a mean is
 * licensed against a run the context is not about. The candidate run goes in the `before` column,
 * which is also where the shell puts it — `rotatedOn` makes the sheet on screen the new one.
 */
interface ReportPairing {
  readonly label: string;
  readonly previous: ShapedDayReport;
  readonly current: ShapedDayReport;
}

/**
 * The six pairings, and the branch of `reportDeltaOf` each one reaches.
 *
 * A list rather than six inline calls, because the claim being made is about **coverage**: every
 * branch of the block is drawn by a state a player can produce, and a branch nobody reaches is a
 * branch nobody sweeps. Three draw and three refuse, which is the split the block itself has.
 *
 * | pairing | what a player did | branch |
 * |---|---|---|
 * | `retry` | pressed Run twice on one selection | drawn, *nothing moved* |
 * | `swap` | clicked a different dispatcher card | drawn, figure rows |
 * | `another-day` | played Tuesday after Monday | refused — traffic |
 * | `free-play-then-week` | finished a Free Play run, opened a scenario day | refused — mode and traffic |
 * | `shorter-shift` | changed the run length between days | refused — the stretch (#126) |
 * | `other-pattern` | changed the arrival pattern between days | refused — the pattern (#126) |
 *
 * **`swap` is the one that carries the block's content**, and on a case whose two arms are the same
 * profile it degenerates to `retry`'s branch — see `run.ts#comparisonConfigFor`. That is left as it
 * falls rather than forced: `caseFromSeed` draws the identical-arm control on 15 % of cases, so the
 * corpus reaches both arms of the note without this list deciding which.
 *
 * The two `#126` rows are the axes that did not exist before this wave, and they are the reason the
 * refusal half is three pairings rather than one: a refusal that only ever names *the building* would
 * leave the sentence composed for four other axes unrendered, which is the same defect one level in.
 */
function reportPairingsOf(bundle: ShiftBundle): readonly ReportPairing[] {
  const first = bundle.days[0];
  const second = bundle.days[1];
  if (first === undefined) return [];
  return [
    { label: 'retry', previous: first.report, current: first.retried },
    { label: 'swap', previous: first.swapped, current: first.report },
    ...(second === undefined
      ? []
      : [{ label: 'another-day', previous: second.report, current: first.report }]),
    { label: 'free-play-then-week', previous: first.singleRunReport, current: first.report },
    { label: 'shorter-shift', previous: first.shorterShift, current: first.report },
    { label: 'other-pattern', previous: first.otherPattern, current: first.report },
  ];
}

/**
 * Every string the delta block draws, seeded — and the two classification decisions in it.
 *
 * ## The roles are the sheet's own, and the figure rows are the argument
 *
 * `DeltaRowView` carries no classification of its own, so `types.ts`'s rule would make every row
 * `prose`. That rule has a second half — *"an adapter copies the surface's classification; it never
 * invents one"* — and a figure row **is** a figure: it is matched back to the `ReportFigure` the
 * current sheet published, by the label the row was built from, and it takes that cell's role, its
 * `gated` flag and its `axisOnly` flag. A row pairing `AVERAGE WAIT` is the sheet's own estimate
 * with a second value beside it, and calling it prose because the pairing dropped the tone would be
 * the adapter deciding a property does not apply.
 *
 * ## `countShown` is still a measurement, and what it measures moved — GitHub issue #137
 *
 * When this adapter was written the block drew `LABEL was X → Y` and no count anywhere in its box,
 * so the flag was a flat `false` for a gated row and R13 duly reported it on 24 of 49 always-on
 * cases and 28 of 60 deep. The row now carries each side's own count — `DeltaRowView.beforeCount`
 * and `afterCount`, the two sheets' own figure notes — drawn beside its own value by both
 * renderers. The flag is read off **the later side's** count string, because the later sheet is
 * where this row's role came from, and it is read as a digit test over that string rather than as
 * `!== null`: a count field holding a sentence with no number in it is not a count on screen.
 *
 * A side whose sheet refused its mean has no count, draws none and reports none, so a pairing whose
 * **earlier** cell is `withheld` comes back `countShown` read off the later side, which published
 * one — and R13 stays silent on the refused half because that side's role is `suppressed`, which is
 * R3's business rather than R13's.
 *
 * **The other arrangement no longer reaches this function — § D334.** A pairing whose *current*
 * cell is `withheld` used to draw `30.5 s → withheld`, and on a same-arm pair the earlier run's
 * mean rounds onto the withheld one often rather than rarely: `honesty-9100011` printed the run's
 * own refused `meanWaitS` beside the word hiding it. `reportDeltaOf` now declines that pairing and
 * names the figure in the note, so the only rows this adapter sees are ones ending on a value the
 * current sheet stands behind.
 *
 * ## The counts are seeded as their own strings, which is the grid's arrangement and not a dodge
 *
 * The figure grid one block down seeds a cell's value and its note as **two** strings and reads
 * `countShown` off the note, because *"the sheet draws the value and the note together"*. This row
 * is now the same shape: `dev/reportPanel.ts#deltaRow` draws the count in its own `<span>` beside
 * the value it belongs to, so two seeds is what the DOM actually is.
 *
 * It also keeps a coincidence out of the corpus that inlining would have invited, and the
 * coincidence is a real one rather than a hypothetical: R3's textual half fires on a **numeral in
 * the same clause as a cue naming the quantity**, the row's label *is* that cue (`AVERAGE`), and a
 * count spliced in beside it puts `waitCount` a few characters from the word `average` on runs
 * whose mean is refused. `honesty-9100031` is that exact shape already — a refused `meanWaitS` of
 * 19.65 colliding with a `20` that is a seed count — and it is open. Seeding the count as its own
 * string carries no cue, so the collision cannot be manufactured here; what R13 needs from the
 * arrangement is `countShown`, which is the flag, not the splice.
 *
 * ## The note is `prose`, deliberately, and it is the stronger choice
 *
 * Both arms of `ReportDeltaView.note` are refusals in substance (*"not a result, and not a
 * direction"*; *"Nothing here is a comparison"*), and `role: 'reason'` would have exempted them from
 * R2's textual half and R3's — the exemption `smallPrint` legitimately takes. They are seeded `prose`
 * instead, so both scans run over them: the block's whole claim is that it compares without ordering,
 * and the cheapest way to stop checking that claim is to classify it as already true.
 */
function deltaSeeds(
  at: string,
  delta: ReportDeltaView,
  current: ShapedDayReport,
  playhead?: TextPlayhead,
): readonly TextSeed[] {
  const seeds: TextSeed[] = [];
  const withPlayhead = playhead === undefined ? {} : { playhead };
  seeds.push({ field: `${at}.delta.caption`, text: delta.caption, role: 'label', ...withPlayhead });
  for (const row of delta.selection) {
    seeds.push({
      field: `${at}.delta.selection(${row.label})`,
      // The row as a reader hears it: `was` in words, because the arrow is `aria-hidden`.
      text: `${row.label} was ${row.before} → ${row.after}`,
      role: 'observation',
      ...withPlayhead,
    });
  }
  const cellOf = new Map(current.figures.map((figure) => [figure.label, figure] as const));
  for (const row of delta.figures) {
    const source = cellOf.get(row.label);
    const shape =
      source === undefined
        ? { role: 'observation' as TextRole, gated: false, energyAxis: false }
        : reportFigureShape(source);
    seeds.push({
      field: `${at}.delta.figures(${row.label})`,
      text: `${row.label} was ${row.before} → ${row.after}`,
      role: shape.role,
      // The **later** sheet's count, because the later sheet is the one this row's role came from.
      declaredCount: shape.gated ? source?.count : undefined,
      countShown: shape.gated ? /(\d[\d,]*)/.test(row.afterCount ?? '') : undefined,
      energyAxis: shape.energyAxis,
      gated: shape.gated,
      ...withPlayhead,
    });
    for (const [side, note] of [
      ['beforeCount', row.beforeCount],
      ['afterCount', row.afterCount],
    ] as const) {
      if (note === null) continue;
      seeds.push({
        field: `${at}.delta.figures(${row.label}).${side}`,
        text: note,
        // A denominator is a fact about a run that happened, on either side of the pairing.
        role: 'observation',
        ...withPlayhead,
      });
    }
  }
  seeds.push({ field: `${at}.delta.note`, text: delta.note, role: 'prose', ...withPlayhead });
  return seeds;
}

/**
 * The observation sheet as the panel draws it — § 4.2's figure grid, goal rows and diagnosis.
 *
 * A second rendering of the same `DayReport`, and it is worth searching separately for one reason:
 * `figureViewOf` is where `axisOnly` is **enforced**, ahead of the tone, so an energy cell that
 * arrived carrying a ranking tone still draws with no colour. What the panel adds to the sheet's
 * own strings is the `title` on a goal row (the state in words, KB-15) and the cleared banner's
 * sentence, and both are read.
 *
 * The roles come from the **report's** cells rather than from the view's, because the view drops
 * `id` and `tone` on the way through. The two lists are the same list in the same order —
 * `reportViewOf` is `report.figures.map(figureViewOf)` — so they are zipped by index.
 *
 * ## The delta block, swept for the first time — GitHub issue #127
 *
 * `reportViewOf` takes a third argument and this adapter passed none, so `ReportView.delta` was
 * `null` on every seeded case: the caption, **both** arms of the note, the refusal sentence issues
 * #117/#102 added and every paired row were rendered by nothing. § D310 recorded it as a gap it
 * walked past; § D311 recorded that the gap had since widened, because the dispatcher editor's
 * result strip draws the **same** `ReportDeltaView` through the same export. An unswept refusal is
 * the shape § D227 rates above a stale figure: a stale figure is wrong, a stale refusal tells a
 * reader not to look.
 *
 * {@link REPORT_PAIRINGS} is what closes it — six pairings over the sheets `shiftBundleOf` builds,
 * chosen so that each of the block's branches is reached by a **shipped** state rather than by a
 * constructed one, and so that every refusal names one axis a reader could have moved.
 */
const REPORT_PANEL: SurfaceAdapter = {
  id: 'dev/reportPanel.ts#reportViewOf',
  covers: [
    'dev/reportPanel.ts#reportViewOf',
    'dev/reportPanel.ts#figureViewOf',
    'dev/reportPanel.ts#goalRowViewOf',
    'dev/reportPanel.ts#diagnosisRowsOf',
    'dev/reportPanel.ts#emptyReportView',
    'dev/reportPanel.ts#runProgressOf',
    /*
     * The lever cards, and the table that decides which of them navigate — issue #38.
     *
     * They reach this adapter through `reportViewOf`, which is `leverRowsOf(shaped.levers)`, and the
     * loop below already seeds every card's title and body. `LEVER_SURFACES` is named here rather
     * than excluded because it is not separable from them: the derived scanner reads its hyphenated
     * ids as prose, and the honest answer is that the words a player sees on those cards **are**
     * driven — what the table adds is a `TabName`, which is an element id and reaches no sentence.
     * An exclusion would have had to claim the cards are unchecked, which is false.
     */
    'dev/reportPanel.ts#leverRowsOf',
    'dev/reportPanel.ts#LEVER_SURFACES',
    /*
     * Casual's reading of the same sheet — GitHub issues #110 and #100, `mode/casualDay.ts`.
     *
     * Every one of these reaches the corpus through `reportViewOf(…, mode)` in the loop below,
     * which renders **both** registers on every case. They are named rather than excluded because
     * each of them produces a sentence a player reads: the note leads, the section heading, the
     * small-print translation and the reach note. `casualFigureOrderOf` produces no prose at all
     * and is listed for the reason `LEVER_SURFACES` is — the derived scanner reads its hyphenated
     * figure ids as phrases, and the honest answer is that what it decides (an order) is driven
     * here, twice, rather than that it is exempt.
     */
    'mode/casualDay.ts#casualNoteFor',
    'mode/casualDay.ts#casualFigureOrderOf',
    'mode/casualDay.ts#CASUAL_FIGURE_ORDER',
    'mode/casualDay.ts#CASUAL_LEVERS_HEADING',
    'mode/casualDay.ts#CASUAL_SMALL_PRINT_LEAD',
    'mode/casualDay.ts#CASUAL_REACH_NOTE',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const bundle = shiftBundleOf(context);

    for (const entry of bundle.days) {
      /*
       * Both shapes of the sheet, per day. `docs/17` § 3.2: a Free Play sheet is not a week-day
       * sheet with six lines deleted — it has its own title, two meta lines the week never prints,
       * and a pointer at Compare — and until this loop the adapter drove one shape while the
       * product shipped two.
       */
      for (const shaped of [entry.report, entry.singleRunReport]) {
      /*
       * **Both registers, on every case** — GitHub issues #110 and #100.
       *
       * Until this loop, `reportViewOf` took no mode and the sheet was byte-identical in Casual and
       * Engineer, so one render was one render. It now leads with different cells, words a refused
       * mean for the reader who met it and translates the small print, and every one of those
       * strings is a claim about this run. Rendering one mode would put the other's sentences
       * outside the search — issue #127's shape, which is open because a surface escaped it.
       */
      for (const mode of VIEW_MODES) {
      const at = `day${String(entry.day)}.${shaped.of}.${mode}`;
      const view = reportViewOf(shaped, undefined, undefined, undefined, mode);
      seeds.push({ field: `${at}.title`, text: view.title, role: 'label' });
      seeds.push({ field: `${at}.lede`, text: view.lede, role: 'observation' });
      if (view.leversHeading !== undefined) {
        seeds.push({ field: `${at}.leversHeading`, text: view.leversHeading, role: 'label' });
      }
      // The goal block's reframed heading — `docs/19` defect 13. Present exactly on the
      // single-run shape, where the authored *The shift asked for* would claim a contract.
      if (view.goalsHeading !== undefined) {
        seeds.push({ field: `${at}.goalsHeading`, text: view.goalsHeading, role: 'label' });
      }
      for (const [index, cell] of view.figures.entries()) {
        /*
         * Paired by **id**, not by index. Casual reorders the grid (`casualFigureOrderOf`), so the
         * position a cell sits at in the view is no longer the position it sits at on the sheet —
         * and the shape being looked up decides whether R3 gates this string and whether R13 wants
         * a count beside it. An index lookup would have attributed the energy axis's exemption to
         * whatever cell happened to land eighth.
         */
        const source = shaped.figures.find((figure) => figure.label === cell.label);
        const shape = source === undefined
          ? { role: 'observation' as TextRole, gated: false, energyAxis: false }
          : reportFigureShape(source);
        seeds.push({
          field: `${at}.figures[${String(index)}](${cell.label}).value`,
          text: `${cell.label}: ${cell.value}`,
          role: shape.role,
          declaredCount: shape.gated ? context.recording.summary.waitCount : undefined,
          countShown: shape.gated ? /(\d[\d,]*)/.test(cell.note) : undefined,
          energyAxis: shape.energyAxis,
          gated: shape.gated,
        });
        seeds.push({
          field: `${at}.figures[${String(index)}](${cell.label}).note`,
          text: cell.note,
          role: shape.role === 'suppressed' ? 'reason' : 'observation',
          energyAxis: shape.energyAxis,
        });
      }
      for (const row of view.goals) {
        seeds.push({
          field: `${at}.goals(${row.label}).display`,
          text: `${row.glyph} ${row.label} — ${row.display}`,
          role: 'observation',
        });
        // The state in words. The glyph is the shorthand; this is the message.
        seeds.push({ field: `${at}.goals(${row.label}).help`, text: row.help, role: 'label' });
      }
      for (const [index, row] of view.diagnosis.entries()) {
        seeds.push({
          field: `${at}.diagnosis[${String(index)}]`,
          text: `${row.when} — ${row.what}`,
          role: 'observation',
        });
        seeds.push({ field: `${at}.diagnosis[${String(index)}].why`, text: row.why, role: 'prose' });
      }
      for (const lever of view.levers) {
        seeds.push({ field: `${at}.levers(${lever.title})`, text: lever.body, role: 'prose' });
      }
      seeds.push({ field: `${at}.verdictLine`, text: view.verdictLine, role: 'observation' });
      /*
       * The meta block, swept for the first time.
       *
       * Found while reshaping the sheet: the adapter drove the title, the lede, the figures, the
       * goals, the diagnosis, the levers, the verdict, the streak, the contract line, the banner,
       * *what this taught*, the small print and the next-day label — and never `metaLines`. So the
       * seed, the clock span, the replication count and the attempt line have never been in the
       * corpus, on a block whose whole job is to say what the figures above it are figures *of*.
       */
      for (const [index, line] of view.metaLines.entries()) {
        seeds.push({ field: `${at}.metaLines[${String(index)}]`, text: line, role: 'observation' });
      }
      if (view.framing.kind === 'week-day') {
        seeds.push({ field: `${at}.streakLine`, text: view.framing.streakLine, role: 'prose' });
        seeds.push({ field: `${at}.contractLine`, text: view.framing.contractLine, role: 'label' });
        if (view.framing.cleared !== null) {
          seeds.push({ field: `${at}.cleared.note`, text: view.framing.cleared.note, role: 'label' });
        }
        seeds.push({ field: `${at}.taught`, text: view.framing.taught, role: 'prose' });
        seeds.push({ field: `${at}.nextDayLabel`, text: view.framing.nextDayLabel, role: 'label' });
      }
      /*
       * Driven on **both** shapes, because both now carry it. `why` is the sentence that sends a
       * reader to the one surface allowed to answer *"is this better?"*, so it is `prose` a property
       * can judge — and it is the sentence most at risk of drifting into a claim that Compare will
       * find a winner.
       */
      if (view.nextStep !== undefined) {
        seeds.push({ field: `${at}.nextStep.label`, text: view.nextStep.label, role: 'label' });
        seeds.push({ field: `${at}.nextStep.why`, text: view.nextStep.why, role: 'prose' });
      }
      seeds.push({ field: `${at}.smallPrint`, text: view.smallPrint, role: 'reason' });

      /* The two row builders, driven on their own so the coverage claim names what it calls. */
      const firstReading = entry.readings[0];
      if (firstReading !== undefined) {
        const row = goalRowViewOf({ reading: firstReading, was: '—' });
        seeds.push({ field: `${at}.goalRowViewOf.help`, text: row.help, role: 'label' });
      }
      const firstFigure = entry.report.figures[0];
      if (firstFigure !== undefined) {
        const cell = figureViewOf(firstFigure, mode);
        seeds.push({
          field: `${at}.figureViewOf(${cell.label})`,
          text: `${cell.label}: ${cell.value}`,
          role: reportFigureShape(firstFigure).role,
        });
        /*
         * The **note**, which is the half of this cell the mode moves — and on a refused run it is
         * the whole of Casual's answer to issue #100: `mode/disclosure.ts#suppressionLeadFor`'s
         * per-ground sentence, in front of `core`'s own reason. Seeded as a `reason` when the cell
         * is refused, for the loop above's reason: the refusal is the one string entitled to quote
         * the numbers it is refusing.
         */
        seeds.push({
          field: `${at}.figureViewOf(${cell.label}).note`,
          text: cell.note,
          role: reportFigureShape(firstFigure).role === 'suppressed' ? 'reason' : 'observation',
        });
      }
      /*
       * The one cell that can be refused, driven **in both registers on every case** — and it is
       * the only figure this adapter reaches by id rather than by position.
       *
       * `figures[0]` above is `carried` on every shipped sheet, so the loop that was here drove the
       * Casual wording of a count and never of a refusal. On the 14 of 60 generated cases whose
       * summary refuses a mean, `average-wait` is where every new sentence in `mode/casualDay.ts`
       * actually lands.
       */
      const refusable = shaped.figures.find((figure) => figure.id === 'average-wait');
      if (refusable !== undefined) {
        const cell = figureViewOf(refusable, mode);
        const shape = reportFigureShape(refusable);
        seeds.push({
          field: `${at}.figureViewOf(average-wait).note`,
          text: cell.note,
          role: shape.role === 'suppressed' ? 'reason' : 'observation',
          declaredCount: shape.gated ? context.recording.summary.waitCount : undefined,
          countShown: shape.gated ? /(\d[\d,]*)/.test(cell.note) : undefined,
          gated: shape.gated,
        });
      }
      for (const [index, row] of diagnosisRowsOf(entry.report.diagnosis).entries()) {
        seeds.push({
          field: `${at}.diagnosisRowsOf[${String(index)}].what`,
          text: row.what,
          role: 'observation',
        });
      }
      }
      }
    }

    /*
     * The delta block — GitHub issue #127, and the first time these strings have been in the corpus.
     *
     * Six pairings, drawn through the shipped `reportViewOf` with a real `previous` rather than
     * through a second implementation, so what the search checks is what the panel and the
     * dispatcher editor's strip both draw. See {@link reportPairingsOf} for what each pair is a
     * player doing, and {@link deltaSeeds} for why a figure row keeps the sheet's own role.
     *
     * Asserted rather than assumed: a pairing whose `delta` came back `null` would be this adapter
     * certifying the block on a case that did not draw it, which is `honesty.test.ts`'s *"an adapter
     * whose renderer silently returns nothing certifies a surface it never looked at"* one level in.
     * `reportViewOf` returns a delta for every non-`undefined` `previous` on a played-out sheet, so
     * the throw is unreachable rather than defensive — and it is the kind of unreachable that stops
     * being unreachable when somebody adds a fourth arm to `reportViewOf`.
     */
    for (const pairing of reportPairingsOf(bundle)) {
      const paired = reportViewOf(pairing.current, { kind: 'played-out' }, pairing.previous);
      if (paired.delta === null) {
        throw new Error(`pairing "${pairing.label}" drew no delta block`);
      }
      seeds.push(...deltaSeeds(`pair(${pairing.label})`, paired.delta, pairing.current));
    }

    /* The empty sheet, which is drawn rather than hidden — § 2.2. */
    const empty = emptyReportView();
    seeds.push({ field: 'emptyReportView.title', text: empty.title, role: 'label' });
    seeds.push({ field: 'emptyReportView.lede', text: empty.lede, role: 'prose' });
    if (empty.framing.kind === 'week-day') {
      seeds.push({ field: 'emptyReportView.nextDayLabel', text: empty.framing.nextDayLabel, role: 'label' });
    }
    /*
     * The empty sheet's two other ledes — `docs/19` defects 1 and 14, each a state a player
     * produces (a completed run standing unfileable; a reload mid-campaign). The refused arm is a
     * `reason` — it is `shift/banking.ts`'s refusal, quoted whole, and the refusal is the one
     * string entitled to name what it refuses. Both grounds are driven so the precedence
     * (`refusal` first) is a run rather than a sentence.
     */
    const refusedEmpty = emptyReportView({
      refusal: UNCHOSEN_RUN_CANNOT_BANK,
      fromPreviousSitting: true,
    });
    seeds.push({ field: 'emptyReportView(refused).lede', text: refusedEmpty.lede, role: 'reason' });
    const priorSittingEmpty = emptyReportView({ refusal: undefined, fromPreviousSitting: true });
    seeds.push({
      field: 'emptyReportView(previous-sitting).lede',
      text: priorSittingEmpty.lede,
      role: 'prose',
    });

    /*
     * The third sheet — issue #16, § D223.
     *
     * A filed report drawn while the playhead is short of `endedAt` is replaced by a sheet that
     * says the day is not over, because the header, the footer and the rail are all describing an
     * instant the filed sheet is hours past. Driven here for exactly the reason the empty sheet is:
     * a state of this surface that the search does not reach is an unchecked one, and its lede is
     * the only sentence on the surface that names two clock times of its own composition.
     */
    const filed = bundle.days[0]?.report;
    const before = bundle.days[0]?.swapped;
    if (filed !== undefined) {
      /*
       * **Driven at every sampled playhead, and on the temporal axis** — because this surface is
       * the rule the axis exists to generalise, and driving it at one instant was checking one
       * branch of a decision that has two.
       *
       * `runProgressOf` returns `watching` short of `endedAt` and `played-out` at it, so the same
       * two lines below carry the refusal at the four early playheads and the filed sheet's own
       * title and lede at the fifth. That is *"this surface obeys § D223"* stated as a run: the
       * property sees the whole-day figures appear exactly when the playhead earns them, and would
       * see them appear early.
       *
       * **And the pairing rides the same loop** — issue #127's third acceptance clause, which is R6
       * pointed at the delta block. `ReportView.delta` is documented `null` *"on both sheets that are
       * not an account of a played-out run: § D223's rule is that a sheet reporting a whole day waits
       * for the whole day, and a delta is made of that sheet's figures, so it waits too"* — and until
       * this argument it was a sentence rather than a run. Driven here with a real `previous`, the
       * four early playheads seed **nothing** (there is no block to seed) and the fifth seeds every
       * row of it at `atS === endedAt`, so a delta that started appearing early would arrive on the
       * axis carrying whole-run figures and R6 would have it.
       */
      for (const at of sampleTimes(context.recording)) {
        const stamp = at.toFixed(0);
        const running = reportViewOf(
          filed,
          runProgressOf({ recording: context.recording, simTimeS: at }),
          before,
        );
        if (running.delta !== null) {
          seeds.push(
            ...deltaSeeds(
              `runningReportView(@${stamp}s)`,
              running.delta,
              filed,
              atPlayhead(context.recording, at),
            ),
          );
        }
        seeds.push({
          field: `runningReportView(@${stamp}s).title`,
          text: running.title,
          role: 'label',
          playhead: atPlayhead(context.recording, at),
        });
        seeds.push({
          field: `runningReportView(@${stamp}s).lede`,
          text: running.lede,
          role: 'prose',
          playhead: atPlayhead(context.recording, at),
        });
        for (const [index, cell] of running.figures.entries()) {
          const source = filed.figures[index];
          const shape = source === undefined
            ? { role: 'observation' as TextRole, gated: false, energyAxis: false }
            : reportFigureShape(source);
          seeds.push({
            field: `runningReportView(@${stamp}s).figures[${String(index)}](${cell.label})`,
            text: `${cell.label}: ${cell.value}`,
            role: shape.role,
            /*
             * The `n` comes off the cell's own note, exactly as the loop above reads it. Seeding the
             * value without it made R13 fire on this surface — the harness's defect, not the
             * panel's: the note is where the sheet prints the count and dropping it from the seed
             * asked R13 a question about a string nobody draws.
             */
            declaredCount: shape.gated ? context.recording.summary.waitCount : undefined,
            countShown: shape.gated ? /(\d[\d,]*)/.test(cell.note) : undefined,
            energyAxis: shape.energyAxis,
            gated: shape.gated,
            playhead: atPlayhead(context.recording, at),
          });
          seeds.push({
            field: `runningReportView(@${stamp}s).figures[${String(index)}](${cell.label}).note`,
            text: cell.note,
            role: shape.role === 'suppressed' ? 'reason' : 'observation',
            energyAxis: shape.energyAxis,
            playhead: atPlayhead(context.recording, at),
          });
        }
      }
    }

    return singleRun(this.id, seeds);
  },
};

/**
 * The scenarios grid — five cards, and the stat line § 4.4 forbids authoring.
 *
 * Driven over **every** shipped building rather than the case's one, because the grid draws all
 * five at once and `statLineOf` is the claim under search: *"6 floors · 2 cars · 0.63 m/s · 120
 * people"*, derived from `data/buildings/` and never transcribed beside it. The unresolved card is
 * driven too — a reader who deleted a building file gets a card that says so rather than a card
 * that invents a spec for it, and that sentence is a refusal worth checking.
 */
const SCENARIOS: SurfaceAdapter = {
  id: 'dev/scenariosPanel.ts#scenarioCardsOf',
  covers: ['dev/scenariosPanel.ts#scenarioCardsOf'],
  render(context) {
    const seeds: TextSeed[] = [];
    const week = shiftBundleOf(context).days[0]?.banked ?? openWeek();

    for (const [label, buildings] of [
      ['loaded', context.buildings],
      ['none-loaded', [] as readonly ResolvedBuilding[]],
    ] as const) {
      for (const card of scenarioCardsOf(CONTRACTS, week, buildings)) {
        seeds.push({
          field: `${label}.${card.contractId}.title`,
          text: `${card.label} — ${card.title}`,
          role: 'label',
        });
        seeds.push({ field: `${label}.${card.contractId}.name`, text: card.name, role: 'label' });
        seeds.push({ field: `${label}.${card.contractId}.brief`, text: card.brief, role: 'prose' });
        seeds.push({
          field: `${label}.${card.contractId}.statLine`,
          text: card.statLine,
          role: card.resolved ? 'observation' : 'reason',
        });
        seeds.push({
          field: `${label}.${card.contractId}.objective`,
          text: card.objective,
          role: 'observation',
        });
        seeds.push({ field: `${label}.${card.contractId}.reward`, text: card.reward, role: 'label' });
        seeds.push({ field: `${label}.${card.contractId}.teaches`, text: card.teaches, role: 'prose' });
        seeds.push({ field: `${label}.${card.contractId}.help`, text: card.help, role: 'label' });
      }
    }
    return singleRun(this.id, seeds);
  },
};

/**
 * The right rail's four plates — § 1.4 R1–R3, *what is running*.
 *
 * The most claim-dense surface the refactor added, and the one whose module docstring states the
 * rule this adapter exists to hold to account: *"a plate never computes a round trip. It reads one
 * off the run, or it says there is no run."* So `buildingPlateOf` is driven **both** with the
 * case's recording and with `undefined`, because the second is where the plate must say *no run
 * yet* instead of filling the space with arithmetic the simulator did not do.
 *
 * `achieved interval` is the one row here that is a mean, and § 1.5 B8 is unconditional about it.
 * The row is therefore rendered with the run's own suppression state: `withheld` on a refused run
 * with `core`'s reason in its help, and a mean with its gap count otherwise. Nothing on this plate
 * reaches for `meanWaitS`, so nothing here is `gated` — the plate's own docstring says so and the
 * property is what checks it.
 */
const RIGHT_RAIL: SurfaceAdapter = {
  id: 'dev/rightRail.ts#buildingPlateOf',
  covers: [
    'dev/rightRail.ts#buildingPlateOf',
    /* The specification block on that plate — `docs/21` § 3.7 (1). Reached only through
       `buildingPlateOf`, which is what drives it above. */
    'dev/rightRail.ts#closedFormRowsOf',
    /* The per-bank analysis both the plate and the building editor's live readout draw from. */
    'authoring/buildingSpec.ts#upPeakBanksOf',
    'dev/rightRail.ts#dispatcherPlateOf',
    'dev/rightRail.ts#dispatcherBlurbOf',
    /*
     * GitHub issue #100's second panel. `dispatcherCardOf` composes the two registers and
     * `dispatcherBehaviourOf` derives the one that is new, so both are seeded below — in **both**
     * modes, over every profile the case carries, which is what makes the Casual sentence's counts
     * (*"only 3 of the 13 cards here"*) searchable rather than merely written.
     */
    'dev/rightRail.ts#dispatcherCardOf',
    'dev/rightRail.ts#dispatcherBehaviourOf',
    'dev/rightRail.ts#dispatcherFamilyOf',
    'dev/rightRail.ts#dispatcherNoteOf',
    'dev/rightRail.ts#trafficPlateOf',
    'dev/rightRail.ts#nameplateOf',
    'dev/rightRail.ts#machineWarningOf',
    'dev/rightRail.ts#patternOptionsOf',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const specs = context.elevatorSpecs as ElevatorSpecs;

    /*
     * R2 — the dispatcher list, every shipped profile, **both registers** (GitHub issue #100).
     *
     * The peer set handed to `dispatcherCardOf` is `context.profiles`, which is the list the rail
     * itself draws from. That is load-bearing rather than convenient: the Casual sentence counts the
     * cards (*"of the 13 cards here"*), so a corpus that passed a different set would be searching a
     * sentence the product never says.
     */
    for (const profile of context.profiles) {
      seeds.push({
        field: `dispatcherFamilyOf(${profile.id})`,
        text: dispatcherFamilyOf(profile),
        role: 'label',
      });
      seeds.push({
        field: `dispatcherBlurbOf(${profile.id})`,
        text: dispatcherBlurbOf(profile),
        role: 'prose',
      });
      seeds.push({
        field: `dispatcherNoteOf(${profile.id})`,
        text: dispatcherNoteOf(context.profiles, profile.id),
        role: 'label',
      });
      for (const mode of VIEW_MODES) {
        const card = dispatcherCardOf(profile, context.profiles, mode);
        seeds.push({
          field: `dispatcherCardOf(${mode}, ${profile.id}).sub`,
          text: card.sub,
          role: 'prose',
        });
        seeds.push({
          field: `dispatcherCardOf(${mode}, ${profile.id}).help`,
          text: card.help,
          role: 'prose',
        });
        for (const row of dispatcherPlateOf(profile, mode)) {
          seeds.push({
            field: `dispatcherPlateOf(${mode}, ${profile.id}).${row.k}`,
            text: `${row.k}: ${row.v}`,
            role: 'label',
          });
          if (row.help !== undefined) {
            seeds.push({
              field: `dispatcherPlateOf(${mode}, ${profile.id}).${row.k}.help`,
              text: row.help,
              role: 'prose',
            });
          }
        }
      }
    }

    /*
     * R3 — the building plate, with a run and without one, in both registers.
     *
     * The Casual arm was **never swept**: `buildingPlateOf` has taken a mode since GitHub issue #71
     * and this adapter has always called it at the default, so the plain-language lead on
     * `handling capacity` and on the withheld `achieved interval` — the second of which precedes
     * `core`'s own refusal — has sat outside the corpus the whole time. Added here because issue
     * #100's lane is in this adapter anyway and a mode axis that covers one of the two functions on
     * a panel is the § D194 null wearing a different number.
     */
    for (const [label, recording, mode] of [
      ['with-run', context.recording, 'advanced'],
      ['no-run', undefined, 'advanced'],
      ['with-run', context.recording, 'basic'],
      ['no-run', undefined, 'basic'],
    ] as const) {
      /*
       * `specs` is handed over so the **closed-form rows are swept** — `docs/21` § 3.7 (1). They are
       * the one block on this plate that is not a reading of a run, and the labelling that keeps
       * them honest (*a specification, not a measurement*, the assumption citation, the divergence
       * sentences) is exactly the kind of claim this corpus exists to hold. Omitting `specs` here
       * would have shipped a new figure block with no register at all.
       */
      for (const row of buildingPlateOf(context.building, recording, mode, specs)) {
        seeds.push({
          field: `buildingPlateOf(${mode}, ${label}).${row.k}`,
          text: `${row.k}: ${row.v}`,
          /*
           * `achieved interval` is the plate's one mean, and the plate has already asked
           * `meansAreSuppressed`. A row that came back with a number on a refused run is the
           * surface disagreeing with the summary, which is what the property reports.
           */
          role:
            row.k === 'achieved interval'
              ? row.v === 'withheld'
                ? 'suppressed'
                : 'observation'
              : 'observation',
        });
        if (row.help !== undefined) {
          seeds.push({
            field: `buildingPlateOf(${mode}, ${label}).${row.k}.help`,
            text: row.help,
            // A withheld row's help quotes `core`'s own refusal.
            role: row.k === 'achieved interval' && row.v === 'withheld' ? 'reason' : 'prose',
          });
        }
      }
    }

    /* R3 — the traffic plate, on the building's own pattern. */
    const patternSpec = specFromTrafficProfile(
      context.trafficProfiles,
      context.building.trafficProfile,
    );
    for (const row of trafficPlateOf(patternSpec, context.building.totalPopulation)) {
      seeds.push({
        field: `trafficPlateOf.${row.k}`,
        text: `${row.k}: ${row.v}`,
        role: 'observation',
      });
      if (row.help !== undefined) {
        seeds.push({ field: `trafficPlateOf.${row.k}.help`, text: row.help, role: 'prose' });
      }
    }
    // `population` reads *no building resolved* rather than `0` before a building resolves.
    for (const row of trafficPlateOf(patternSpec, undefined)) {
      if (row.k !== 'population') continue;
      seeds.push({ field: 'trafficPlateOf(no-building).population', text: row.v, role: 'reason' });
    }

    /* R3 — the nameplate, and the class advisory, over every shipped class. */
    for (const machineClass of classesFromSpecs(specs)) {
      for (const row of nameplateOf(machineClass, specs)) {
        seeds.push({
          field: `nameplateOf(${machineClass.id}).${row.k}`,
          text: `${row.k}: ${row.v}`,
          role: 'observation',
        });
        if (row.help !== undefined) {
          seeds.push({
            field: `nameplateOf(${machineClass.id}).${row.k}.help`,
            text: row.help,
            role: 'prose',
          });
        }
      }
      for (const [label, building] of [
        ['with-building', context.building],
        ['no-building', undefined],
      ] as const) {
        seeds.push({
          field: `machineWarningOf(${machineClass.id}, ${label})`,
          text: machineWarningOf(machineClass, building),
          role: 'prose',
        });
      }
    }

    /* R2 — the arrival-pattern list. */
    for (const option of patternOptionsOf(browserResourcesOf(context), [], context.building)) {
      seeds.push({
        field: `patternOptionsOf(${option.id}).label`,
        text: `${option.label} · ${option.tag}`,
        role: 'label',
      });
      seeds.push({ field: `patternOptionsOf(${option.id}).sub`, text: option.sub, role: 'observation' });
      seeds.push({ field: `patternOptionsOf(${option.id}).help`, text: option.help, role: 'prose' });
    }

    return singleRun(this.id, seeds);
  },
};

/**
 * `BrowserResources` as the page assembles it, from what the case already loaded.
 *
 * Two rail and editor surfaces take the whole record rather than the two fields they read, and
 * reconstructing it here is the alternative to widening their signatures for a test's convenience.
 * Every field is the shipped one: the same `data/` documents, the same resolved buildings.
 */
function browserResourcesOf(context: HonestyContext): BrowserResources {
  return {
    elevatorSpecs: context.elevatorSpecs as ElevatorSpecs,
    trafficProfiles: context.trafficProfiles,
    dispatcherProfiles: context.dispatcherProfiles,
    buildings: context.buildings,
    entries: context.buildings.map((building) => ({
      file: `${building.id}.json`,
      config: building.config,
      resolved: building,
    })),
    trafficProfileIds: new Set(context.trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
}

/**
 * The four editors as the panels draw them — sliders, chips, the elevation and the preview strip.
 *
 * `authoring/` is the model and these are its views, so the split is the same one `RAIL_VIEW`
 * names: the row-building is pure and driven, the mount is DOM and excluded. What the views add to
 * the model's own strings is the part that changes with what the reader has dragged — the value
 * beside each slider, the field the row writes, the over-capacity sentence, the elevation's
 * per-floor tooltips, and the two **refusals**: `inertPatternRows`, which says a control writes
 * nothing the run reads, and `checkBuilding`, which runs the spec through the real loader on every
 * edit and reports what it said.
 *
 * The specs driven are the same three `AUTHORING` uses — the case's own building read back, the
 * blank form, and the orphaned-band drag — so a violation on a row can be traced to a spec a
 * reader can reproduce.
 */
const EDITOR_PANELS: SurfaceAdapter = {
  id: 'dev/buildingEditor.ts#specRowsOf',
  covers: [
    'dev/buildingEditor.ts#specRowsOf',
    'dev/buildingEditor.ts#specFieldOf',
    'dev/buildingEditor.ts#formatSpecValue',
    'dev/buildingEditor.ts#overCapacityNote',
    'dev/buildingEditor.ts#speedChipsOf',
    'dev/buildingEditor.ts#elevationRowsOf',
    'dev/buildingEditor.ts#elevationCarsOf',
    'dev/buildingEditor.ts#elevationNoteOf',
    'dev/buildingEditor.ts#transportNoteOf',
    'dev/buildingEditor.ts#checkBuilding',
    'dev/dispatcherEditor.ts#termRowsOf',
    'dev/dispatcherEditor.ts#flagRowsOf',
    'dev/dispatcherEditor.ts#flagLineOf',
    'dev/dispatcherEditor.ts#leverRowsOf',
    'dev/dispatcherEditor.ts#dwellHintOf',
    'mode/plainLevers.ts#plainLeversOf',
    'mode/plainLevers.ts#plainLeverSub',
    'mode/plainLevers.ts#plainLeverHelp',
    'mode/plainLevers.ts#plainLeverEchoOf',
    'dev/machinesEditor.ts#machineRowsOf',
    'dev/machinesEditor.ts#machineFieldOf',
    'dev/machinesEditor.ts#formatMachineValue',
    'dev/machinesEditor.ts#ratedSpeedChipsOf',
    'dev/trafficEditor.ts#patternRowsOf',
    'dev/trafficEditor.ts#formatPatternValue',
    'dev/trafficEditor.ts#inertPatternRows',
    'dev/trafficEditor.ts#previewSegmentsOf',
    'dev/trafficEditor.ts#previewKindOf',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const specs = context.elevatorSpecs as ElevatorSpecs;
    const classes = classesFromSpecs(specs);
    const limitClass = classes[2] ?? classes[0];
    const trafficProfileIds = new Set(context.trafficProfiles.profiles.map((profile) => profile.id));

    /* ---- M11, the building editor ---- */
    const buildingSpecs: readonly { readonly label: string; readonly spec: BuildingSpec }[] = [
      { label: 'from-building', spec: specFromBuilding(context.building.config, context.building.id) },
      { label: 'blank', spec: BLANK_SPEC },
      // Let past design capacity, which is the one row that swaps its sub-line for a sentence.
      { label: 'over-capacity', spec: { ...BLANK_SPEC, occupancyPct: 115 } },
      /*
       * A two-level lobby joined by an escalator, and a second machine joining two ordinary
       * floors — the state `transportNoteOf` exists to say something about, and the one a reader
       * reaches by pressing *+ escalator* twice. Both halves of its sentence are seeded at once.
       */
      {
        label: 'sky-lobby',
        spec: {
          ...BLANK_SPEC,
          skyFloors: [6],
          transportModes: [
            { id: 'escalator-1', connects: [6, 7] as readonly [number, number], traversalTimeS: 21.2 },
            { id: 'escalator-2', connects: [2, 3] as readonly [number, number], traversalTimeS: 21.2 },
          ],
        },
      },
    ];
    for (const { label, spec } of buildingSpecs) {
      for (const view of specRowsOf(spec)) {
        seeds.push({
          field: `specRowsOf(${label}).${view.row.key}.value`,
          text: `${view.row.label}: ${view.value}`,
          role: 'label',
        });
        seeds.push({
          field: `specRowsOf(${label}).${view.row.key}.sub`,
          text: view.sub,
          // The over-capacity sub-line is a claim about what this building costs; the ordinary one
          // names the document field the slider writes.
          role: view.overCapacity ? 'observation' : 'label',
        });
      }
      seeds.push({
        field: `elevationNoteOf(${label})`,
        text: elevationNoteOf(spec),
        role: 'prose',
      });
      seeds.push({
        field: `transportNoteOf(${label})`,
        text: transportNoteOf(spec),
        role: 'prose',
      });
      for (const row of elevationRowsOf(spec)) {
        seeds.push({
          field: `elevationRowsOf(${label}).floor${String(row.floor)}.label`,
          text: `${row.label} — ${row.peopleText}`,
          role: 'observation',
        });
        seeds.push({
          field: `elevationRowsOf(${label}).floor${String(row.floor)}.labelTitle`,
          text: row.labelTitle,
          role: 'prose',
        });
        seeds.push({
          field: `elevationRowsOf(${label}).floor${String(row.floor)}.skyTitle`,
          text: row.skyTitle,
          role: 'prose',
        });
        seeds.push({
          field: `elevationRowsOf(${label}).floor${String(row.floor)}.occTitle`,
          text: row.occTitle,
          role: 'observation',
        });
      }
      for (const car of elevationCarsOf(spec)) {
        seeds.push({
          field: `elevationCarsOf(${label}).${car.id}.legend`,
          text: car.legend,
          role: 'label',
        });
      }
      for (const chip of speedChipsOf(spec, limitClass, speedLadderOf(specs))) {
        seeds.push({
          field: `speedChipsOf(${label}).${chip.label}`,
          text: chip.label,
          role: 'label',
        });
      }
      const check = checkBuilding(spec, specs, trafficProfileIds);
      if (check.error !== '') {
        seeds.push({ field: `checkBuilding(${label}).error`, text: check.error, role: 'reason' });
      }
      for (const [index, warning] of check.warnings.entries()) {
        seeds.push({
          field: `checkBuilding(${label}).warnings[${String(index)}]`,
          text: warning,
          role: 'reason',
        });
      }
    }

    /*
     * The express toggle's two strings, driven on both throws of the toggle — GAPS § 3's
     * *"the elevation's express toggle produces two strings the honesty search never sees"*.
     *
     * `elevationCarsOf` was already covered and its `legend` seeded, but none of the three specs
     * above pins a band above the lobby, so `expressLabel` rendered `''` on every case of every
     * campaign and `expressTitle` — the handoff's sentence at `docs/design/…:737`, kept
     * module-private in `dev/buildingEditor.ts` precisely so that only this file could classify
     * it, through the export that carries it — was never rendered at all. The two specs here are
     * the two states a reader reaches by pinning a band `[6, 12]` and clicking the toggle: still
     * landing in the lobby (the default; label `✓ express from the lobby, skipping 2–6`), and
     * taken out of it (label `stays in its band — click to run express from the lobby`).
     *
     * The toggle is mounted only where `canExpress` holds (`dev/buildingEditor.ts` `:1554`), so
     * its title is seeded under the same guard; a car without the button has no tooltip to read.
     * Cars the toggle does not apply to render `expressLabel: ''`, which `singleRun` drops — the
     * absence of a button is not a string. The legend is seeded too, because `band only` is a
     * role word none of the shipped specs can produce.
     */
    const expressSpec: BuildingSpec = {
      ...BLANK_SPEC,
      bandByCar: { 0: [6, 12] as readonly [number, number] },
    };
    for (const [label, spec] of [
      ['express-on', expressSpec],
      ['express-off', { ...expressSpec, noLobby: { 0: true } }],
    ] as const) {
      for (const car of elevationCarsOf(spec)) {
        seeds.push({
          field: `elevationCarsOf(${label}).${car.id}.expressLabel`,
          text: car.expressLabel,
          role: 'label',
        });
        if (car.canExpress) {
          seeds.push({
            field: `elevationCarsOf(${label}).${car.id}.expressTitle`,
            text: car.expressTitle,
            role: 'prose',
          });
        }
        seeds.push({
          field: `elevationCarsOf(${label}).${car.id}.legend`,
          text: car.legend,
          role: 'label',
        });
      }
    }

    /*
     * The access block, driven rather than statically swept — GAPS § 3's *"the access block's
     * labels, tooltips and legend are statically swept, not driven"*.
     *
     * The register's stated fix was *"a covers entry"*, and that half turns out not to be
     * available: `accessMatrixOf` and `zoneChoicesOf` return facts and ids with no prose literal
     * of their own — deliberately, per `dev/buildingEditor.ts` § *Access zoning — pure*, which
     * kept sentences out of the producers precisely so they would not become unclassifiable
     * surfaces — so the derivation does not list them and a `covers` entry naming them would fail
     * `derive.test.ts`'s no-stale-coverage guard. What is available is the rendering: the strings
     * a reader sees are compositions of those facts made at the mount, and each is seeded here
     * exactly as the shipped call site composes it — the matrix cell's `${glyph} ${word}`
     * (`dev/buildingEditor.ts:1689`, KB-15's two signals, never colour alone), the zone chip's
     * `${id} · ${floors}f · ${groups}g` (`:1593`), and the restricted floors as runs (§ 10.3's
     * form). The six authored tooltip and legend sentences (`ZONE_FLOOR_TITLE` …
     * `MATRIX_DISPATCHER_NOTE`) are module-private and reachable only through
     * `mountBuildingEditor`, so they stay on the static R10 sweep — driving them needs an export
     * from `dev/buildingEditor.ts`, a file this one does not own, and that is reported rather
     * than reached for.
     *
     * The spec is constructed because four of the five shipped buildings declare
     * `accessZones: []`: one zone a credential opens and one whose groups have all been
     * withdrawn — the stranded state § 10.2 asks the matrix to make visible. One spec renders
     * all three cell states (reachable, not permitted, unrestricted), the stranded clause of
     * `elevationNoteOf`, `validateSpec`'s empty-group refusal, and the real loader's own refusal
     * through `checkBuilding` — the schema's `credentialGroups.min(1)`, said in the parser's
     * words rather than paraphrased.
     */
    const zonedSpec: BuildingSpec = {
      ...BLANK_SPEC,
      accessZones: [
        { id: 'exec', floors: [10, 11, 12], credentialGroups: ['staff'] },
        { id: 'service-core', floors: [5], credentialGroups: [] },
      ],
    };
    const zonedMatrix = accessMatrixOf(zonedSpec);
    seeds.push({
      field: 'accessMatrixOf(zoned).restrictedRuns',
      text: zonedMatrix.restrictedRuns,
      role: 'label',
    });
    for (const row of zonedMatrix.rows) {
      for (const cell of row.cells) {
        seeds.push({
          field: `accessMatrixOf(zoned).rows(${row.floorId}).cells(${cell.group})`,
          text: `${cell.glyph} ${cell.word}`,
          role: 'label',
        });
      }
    }
    for (const choice of zoneChoicesOf(zonedSpec, 'exec')) {
      seeds.push({
        field: `zoneChoicesOf(${choice.id}).label`,
        text: `${choice.id} · ${String(choice.floorCount)}f · ${String(choice.groupCount)}g`,
        role: 'label',
      });
      seeds.push({ field: `zoneChoicesOf(${choice.id}).runs`, text: choice.runs, role: 'label' });
    }
    seeds.push({ field: 'elevationNoteOf(zoned)', text: elevationNoteOf(zonedSpec), role: 'prose' });
    for (const [index, problem] of validateSpec(zonedSpec, limitClass).entries()) {
      seeds.push({
        field: `validateSpec(zoned)[${String(index)}]`,
        text: problem,
        role: 'reason',
      });
    }
    const zonedCheck = checkBuilding(zonedSpec, specs, trafficProfileIds);
    if (zonedCheck.error !== '') {
      seeds.push({ field: 'checkBuilding(zoned).error', text: zonedCheck.error, role: 'reason' });
    }
    for (const [index, warning] of zonedCheck.warnings.entries()) {
      seeds.push({
        field: `checkBuilding(zoned).warnings[${String(index)}]`,
        text: warning,
        role: 'reason',
      });
    }

    /* ---- M10, the machine editor ---- */
    for (const machineClass of classes) {
      const machineSpec = specFromClass(machineClass);
      for (const view of machineRowsOf(machineSpec)) {
        seeds.push({
          field: `machineRowsOf(${machineClass.id}).${view.row.key}.value`,
          text: `${view.row.label}: ${view.value}`,
          role: 'label',
        });
        seeds.push({
          field: `machineRowsOf(${machineClass.id}).${view.row.key}.field`,
          text: view.field,
          role: 'label',
        });
      }
      for (const chip of ratedSpeedChipsOf(machineSpec, speedLadderOf(specs))) {
        seeds.push({
          field: `ratedSpeedChipsOf(${machineClass.id}).${chip.label}`,
          text: chip.label,
          role: 'label',
        });
      }
    }

    /* ---- M9, the traffic editor ---- */
    for (const order of PEAK_ORDERS) {
      const patternSpec = { ...DEFAULT_PATTERN, order };
      for (const view of patternRowsOf(patternSpec)) {
        seeds.push({
          field: `patternRowsOf(${order}).${view.row.key}.value`,
          text: `${view.row.label}: ${view.value}`,
          role: 'label',
        });
        if (view.refusal !== undefined) {
          seeds.push({
            field: `patternRowsOf(${order}).${view.row.key}.refusal`,
            text: view.refusal,
            role: 'reason',
          });
        }
      }
      const resolution = previewTemplateOf(
        patternSpec,
        context.trafficProfiles.demandTemplates,
        context.recording.endedAt - context.recording.startedAt,
      );
      if (!resolution.ok) {
        seeds.push({
          field: `previewTemplateOf(${order}).reason`,
          text: resolution.reason,
          role: 'reason',
        });
        continue;
      }
      for (const segment of previewSegmentsOf(resolution.template, patternSpec)) {
        seeds.push({
          field: `previewSegmentsOf(${order}).${segment.id}.short`,
          text: segment.short,
          role: 'label',
        });
        seeds.push({
          field: `previewSegmentsOf(${order}).${segment.id}.title`,
          text: segment.title,
          role: 'observation',
        });
      }
    }

    /* ---- M8, the dispatcher editor ---- */
    const terms = context.dispatcherProfiles.terms;
    for (const profile of context.profiles) {
      const spec = specFromProfile(profile);
      for (const view of termRowsOf(terms, spec, inertTerms(spec))) {
        seeds.push({
          field: `termRowsOf(${profile.id}).${view.termId}.label`,
          text: `${view.label} ${String(view.value)}`,
          role: 'label',
        });
        seeds.push({
          field: `termRowsOf(${profile.id}).${view.termId}.help`,
          text: view.help,
          role: 'prose',
        });
        seeds.push({
          field: `termRowsOf(${profile.id}).${view.termId}.serves`,
          text: view.serves,
          role: 'label',
        });
        if (view.inertWhy !== undefined) {
          seeds.push({
            field: `termRowsOf(${profile.id}).${view.termId}.inertWhy`,
            text: view.inertWhy,
            role: 'reason',
          });
        }
      }
      seeds.push({
        field: `flagLineOf(${profile.id})`,
        text: flagLineOf(profile),
        role: 'label',
      });
      for (const row of flagRowsOf(spec)) {
        seeds.push({
          field: `flagRowsOf(${profile.id}).${row.key}.label`,
          text: `${row.label} — ${row.on ? 'on' : 'off'}`,
          role: 'label',
        });
        seeds.push({ field: `flagRowsOf(${profile.id}).${row.key}.hint`, text: row.hint, role: 'prose' });
        seeds.push({ field: `flagRowsOf(${profile.id}).${row.key}.help`, text: row.help, role: 'prose' });
      }
      /*
       * All four dwell states, including *inherit* — which is the one the page opens on and the
       * one `authoring/dispatcherSpec.ts` records as the defect it caught: a *normal* chip pressed
       * by nobody had been rewriting every profile that authored a dwell.
       */
      for (const dwell of [undefined, ...DWELL_CHOICES] as const) {
        seeds.push({
          field: `dwellHintOf(${profile.id}, ${dwell ?? 'inherit'})`,
          text: dwellHintOf({ ...DEFAULT_LEVERS, dwell }, profile),
          role: 'prose',
        });
      }
    }
    for (const levers of [
      DEFAULT_LEVERS,
      { ...DEFAULT_LEVERS, parking: true },
      { ...DEFAULT_LEVERS, express: true },
    ]) {
      for (const row of leverRowsOf(levers)) {
        seeds.push({
          field: `leverRowsOf(${row.key}, on=${String(row.on)}).label`,
          text: `${row.label} — ${row.on ? 'on' : 'off'}`,
          role: 'label',
        });
        seeds.push({ field: `leverRowsOf(${row.key}).hint`, text: row.hint, role: 'prose' });
        seeds.push({ field: `leverRowsOf(${row.key}).help`, text: row.help, role: 'prose' });
      }
    }

    /*
     * The Basic register of the term rows — the sub-line reads the term's own player words from
     * `core` (Everyday handoff §16 rule 11, issue #147). Driven once over a blank spec rather
     * than per profile, because the words are the model's and do not vary with what a reader has
     * dragged; the per-profile loop above already drives everything that does.
     */
    for (const view of termRowsOf(terms, blankSpec(terms.map((term) => term.id)), [], 'basic')) {
      seeds.push({
        field: `termRowsOf(basic).${view.termId}.serves`,
        text: view.serves,
        role: 'label',
      });
    }

    /*
     * The four plain levers — Everyday Mode slice 1 (`mode/plainLevers.ts`). The composed
     * sub-line and tooltip are the model's own compositions, the same two strings the mount
     * draws, so the sweep and the screen cannot drift apart.
     */
    for (const lever of plainLeversOf(blankSpec(terms.map((term) => term.id)), DEFAULT_LEVERS)) {
      seeds.push({ field: `plainLeversOf.${lever.id}.label`, text: lever.label, role: 'label' });
      seeds.push({ field: `plainLeversOf.${lever.id}.sub`, text: plainLeverSub(lever), role: 'prose' });
      seeds.push({ field: `plainLeversOf.${lever.id}.help`, text: plainLeverHelp(lever), role: 'prose' });
      // The moved-lever echo (docs/19 defect 5) — the same composition the editor draws after a
      // pull, over the same view, so the acknowledgement a player reads is what is swept.
      seeds.push({ field: `plainLeverEchoOf.${lever.id}`, text: plainLeverEchoOf(lever), role: 'prose' });
    }

    return singleRun(this.id, seeds);
  },
};

/**
 * Every surface the search drives.
 *
 * The order is the order a reader meets them: the run, the picture, the panel, the batch, the
 * campaign. Nothing branches on it.
 */

/**
 * The menu — § D214 § 2's free-play selection and the catalogue behind it.
 *
 * Driven rather than excluded, because **`buildingDetail` puts numbers on a player surface**:
 * `21 floors · 1,710 people · 4 cars` is three figures a reader will believe, and the honesty
 * property exists for exactly that. `freePlayIssues` is driven on a **broken** selection as well as
 * a whole one, because its whole job is the words shown when something is wrong — a surface only
 * ever driven with valid input has left its error path unswept, which is where careless prose
 * actually lives.
 */
/**
 * A challenge as the server issues one — **constructed**, and that is stated rather than smoothed.
 *
 * No `data/` in this package ships a challenge: the rotation lives in `packages/server`, which `viz`
 * must build and test without (invariant 6's argument, one package over). So this is the shape the
 * wire carries, written here, and the honest consequence is that a change to the server's shape does
 * not redden this file — `menu/challenge.test.ts` is where that parity is pinned.
 *
 * The arm chosen is **upcoming**, because it carries the most prose: the window sentence, the
 * partial-set refusal and the board note at once. Those three are where careless wording on this
 * screen would be — a countdown implying the client measured it, or a refusal implying a partial set
 * is a smaller score rather than a different question.
 */
const CHALLENGE_VIEW: ChallengeView = Object.freeze({
  challenge: Object.freeze({
    id: 'midtown-morning-4',
    name: 'Midtown morning',
    brief:
      'Five seeds on Midtown Office at the morning peak. Everybody runs the same passengers; ' +
      'the dispatcher is yours.',
    config: Object.freeze({
      buildingId: 'midtown-office',
      demandTemplateId: 'rise-and-fall',
      arrivalRatePctPop5min: 3,
      durationS: 900,
    }),
    seeds: Object.freeze(['1001', '1002', '1003', '1004', '1005']),
    opensAtMs: 0,
    closesAtMs: 0,
  }),
  state: 'upcoming',
  seedCount: 5,
  opensInMs: 7_200_000,
  closesInMs: null,
  clockNote:
    'Which challenge is open is decided by the server. The window below is issued with the ' +
    'challenge, and the remaining time is measured on the server’s clock, not on yours.',
  dataHash: 'abcdef0123456789',
  compare: Object.freeze({
    note:
      'Compare answers the question a board cannot. It replays two dispatchers on the same ' +
      'passenger traces at a replication budget large enough to resolve a difference, and ' +
      'reports an interval that can contain zero.',
    buildingId: 'midtown-office',
    demandTemplateId: 'rise-and-fall',
    arrivalRatePctPop5min: 3,
    durationS: 900,
  }),
});

const MENU: SurfaceAdapter = {
  id: 'menu/menu.ts#freePlayIssues',
  covers: [
    'menu/menu.ts#freePlayIssues',
    'menu/menu.ts#canStart',
    'menu/catalogue.ts#catalogueOf',
    'menu/catalogue.ts#buildingDetail',
    // § D286. Its prose is the option labels and the sentence under them — *Morning rush —
    // 08:30–09:00*, *30 min of demand … then however long it takes to clear* — which is exactly the
    // kind of claim the honesty properties exist for: a label that named a clock the run did not use
    // would be R1's defect with a friendly face. Driven below rather than excused.
    'menu/partsOfDay.ts#partsOfDay',
    'menu/account.ts#formIssues',
    /*
     * The naming rule itself, reached only *through* `formIssues` — the second shape this list's
     * docstring names. It was extracted so Everyday Mode's § 15.1 name field refuses in the same
     * words rather than in a second copy of them, and driving `formIssues` over the naming stage
     * (below, through `signedIn`'s unnamed player) is what drives it: every sentence it can
     * return is one `formIssues` hands back.
     */
    'menu/account.ts#displayNameIssueOf',
    'menu/account.ts#postingRefusal',
    'menu/account.ts#signedIn',
    'menu/client.ts#CLIENT_FAILURES',
    'menu/screens.ts#screenOf',
    'menu/screens.ts#titleOf',
    'menu/screens.ts#applyIntent',
    /*
     * GitHub issue #93's three sentences about a board, and every one of them is a claim about a run
     * this browser did not make. The reveal names the dispatcher that produced somebody's figures;
     * the refusal says why it cannot; the detail line promises a reproduction. Driven below on a
     * board that resolves, one that does not, and one whose rows disagree — because the two refusals
     * are where careless wording on this screen would be, and a surface only ever swept with a
     * well-formed board would leave both unread.
     */
    'menu/boardRun.ts#boardConfigurationOf',
    'menu/boardRun.ts#boardRevealOf',
    'menu/boardRun.ts#boardRevealRefusalOf',
    'menu/boardRun.ts#BEAT_LABEL',
    'menu/boardRun.ts#beatDetailOf',
    'menu/boardRun.ts#beatRefusalOf',
    'menu/boardRun.ts#BEATING_NOTE',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    // Assembled from what the context already carries rather than from a second load: the menu's
    // whole claim is that it derives from the loaded configuration, and a search that handed it a
    // separately-built list would be checking a different catalogue than the page shows.
    const catalogue = catalogueOf({
      buildings: context.buildings as unknown as CatalogueSource['buildings'],
      dispatcherProfiles: context.dispatcherProfiles,
      trafficProfiles: context.trafficProfiles,
    });

    for (const entry of catalogue.buildings) {
      seeds.push({ field: `building.${entry.id}.name`, text: entry.name, role: 'label' });
      // `observation` and not `label`: this is a count of real things, and a wrong one is the
      // failure mode the sweep is for.
      seeds.push({
        field: `building.${entry.id}.detail`,
        text: entry.detail ?? '',
        role: 'observation',
      });
    }
    for (const entry of catalogue.demandTemplates) {
      seeds.push({ field: `template.${entry.id}.detail`, text: entry.detail ?? '', role: 'label' });
      /*
       * Every part of every shipped template, both strings. The label carries a clock range and the
       * detail carries a quantity of demand, so both are claims about the run a player is about to
       * start — and the second is the one issue #80 was filed about, where the number named the
       * demand schedule and was read as the run.
       */
      for (const part of entry.parts ?? []) {
        seeds.push({ field: `template.${entry.id}.part.${part.id}.label`, text: part.label, role: 'label' });
        seeds.push({
          field: `template.${entry.id}.part.${part.id}.detail`,
          text: part.detail,
          role: 'observation',
        });
      }
    }

    const challengeSelection = {
      dispatcherProfileId: catalogue.dispatchers[0]?.id ?? '',
      metric: 'awtS',
    };
    const challengeInput = { view: CHALLENGE_VIEW, runsDone: 3 };
    /*
     * The opening selection, **from the menu's own opening state** rather than rebuilt here — so a
     * sweep cannot drive a selection the menu would never produce. § D286 made the *part* a
     * derivation and this file copied it; issue #99 moved the *pair* off `[0]` and this copy would
     * have been the site that kept the retired answer alive (`dev/defaults.ts`, § D192's shape). One
     * call now answers all six fields.
     */
    const whole = initialMenuState(catalogue).freePlay;
    const broken = { ...whole, buildingId: 'demolished', seed: 'not-a-seed', durationS: 7 };
    /*
     * A third selection, valid in every field and refused on a **cross-field** rule: a part that
     * belongs to a different template. Driven separately because its sentence names what *is*
     * offered, and a wrong one sends a reader to change the axis that was already right.
     */
    const tooShort = { ...whole, durationS: 300, windowStartS: null };

    for (const [label, selection] of [
      ['whole', whole],
      ['broken', broken],
      ['too-short', tooShort],
    ] as const) {
      for (const [index, issue] of freePlayIssues(selection, catalogue).entries()) {
        seeds.push({
          field: `${label}.issue.${String(index)}.${issue.field}`,
          text: issue.message,
          role: 'reason',
        });
      }
      seeds.push({
        field: `${label}.canStart`,
        text: canStart(selection, catalogue) ? 'Start' : 'Start is unavailable',
        role: 'label',
      });
    }

    /*
     * The account screen's own prose.
     *
     * Driven for the same reason the broken selection above is: every sentence here is one a
     * player only ever meets when something has gone wrong, which is where careless wording
     * actually lives.
     *
     * **`postingRefusal` has one arm now, and the second was not dropped from this sweep — it was
     * deleted from the product.** § D241 § 5 removed `confirmed` along with the password: a mailed
     * link cannot issue a session to somebody who has not proved they can read the address, so the
     * flag would have been true for everybody who could ever observe it. What replaced it is the
     * *naming* prompt, which is a prompt rather than a gate, so it is driven through `signedIn`'s
     * notice below instead of through a refusal.
     *
     * Both of `formIssues`'s questions are driven, because they are asked at different moments and
     * a sweep that only saw the address would never read a word about the name.
     */
    const player = {
      id: 'u1',
      email: 'p@example.test',
      displayName: 'player-9f2c1a4b7e05',
      displayNameChosen: false,
    };
    const badAddress = updateForm(SIGNED_OUT, { email: 'nope' });
    const badName = updateForm(signedIn(SIGNED_OUT, 'token', player), { displayName: 'x' });
    for (const [stage, state] of [
      ['address', badAddress],
      ['name', badName],
    ] as const) {
      for (const [index, issue] of formIssues(state).entries()) {
        seeds.push({
          field: `account.${stage}.issue.${String(index)}.${issue.field}`,
          text: issue.message,
          role: 'reason',
        });
      }
    }
    for (const [label, state] of [
      ['signed-out', SIGNED_OUT],
      ['unnamed', signedIn(SIGNED_OUT, 'token', player)],
      ['named', signedIn(SIGNED_OUT, 'token', { ...player, displayName: 'A player', displayNameChosen: true })],
    ] as const) {
      const refusal = postingRefusal(state);
      if (refusal !== undefined) {
        seeds.push({ field: `account.${label}.refusal`, text: refusal, role: 'reason' });
      }
      if (state.notice !== undefined) {
        seeds.push({ field: `account.${label}.notice`, text: state.notice, role: 'prose' });
      }
    }

    // The three sentences the client authors when there is no server answer to carry. `reason`
    // rather than `prose`: each one explains a refusal a player is looking at.
    for (const [code, text] of Object.entries(CLIENT_FAILURES)) {
      seeds.push({ field: `client.${code}`, text, role: 'reason' });
    }

    /*
     * Every screen, driven — and driven in the states where the prose is hardest.
     *
     * `screenOf` is the decision half of the menu panel, so every title, every row label, every
     * `detail` under a row and every `disabledWhy` reaches a player through it. The axis that
     * matters is not *which screen* but *what is wrong*: a Start that is enabled says one word, and
     * a Start that is refused says a sentence with two numbers in it. So the sweep drives the whole
     * screen set against a whole selection **and** a broken one, and against a signed-out player as
     * well as a signed-in one.
     *
     * `rankingRefusal` is seeded with a real one — `scope/runIdentity.ts`'s wording for a run on a
     * grown building. That sentence is shown beside a disabled **Post this run**, which is a claim
     * about why somebody's score is not going up, and is exactly the shape R2 exists to police.
     */
    /*
     * **The two axes added with the cold-start door** \u2014 GitHub issues #90 and #98.
     *
     * `screenOf` defaults `viewMode` to `advanced` and `firstVisit` to *nobody has said*, so the three
     * arms above drive Engineer's door and no welcome at all. That would have left the Casual sentence
     * and the whole first-visit note outside the corpus while every count in the phase's status row
     * went up \u2014 which is the shape issue #127 was filed about one lane over, arriving here by
     * omission rather than by oversight.
     *
     * Two arms rather than a cross product: the axes are independent of the three above (a refused
     * selection does not change what a welcome says), so four extra cells would be four extra copies
     * of the same strings. What is needed is that **every string the root can emit** is reached, and
     * one Casual arm plus one first-visit arm reaches all of them.
     */
    /*
     * **The `unrankable` arm's refusal is produced rather than quoted — GitHub issue #140.**
     *
     * It was a hand-copied literal: *"day 7 grows the building by 66 % and schedules “Move-in
     * day”, and neither travels with a selection"*. Two things were wrong with it and only one of
     * them was ever going to be noticed. It was a **copy of another module's sentence**, so it went
     * stale the moment `runIdentity` reworded — § D227's subject exactly, and #140 is the reword.
     * And it was **not a sentence the product could produce for the state it described**:
     * `eventFor(7, dayIdx)` is `ordinary` on a weekday of day 7 and `weekend` on its Sunday, so a
     * day 7 that books a move-in needs a calendar period the fixture named nowhere. A corpus seeded
     * with a refusal no reader can meet sweeps wording no reader will ever see.
     *
     * Six `nextDay`s rather than `{ ...week, day: 7 }`, for `tomorrowFactsOf`'s reason: the weekday
     * index wraps the way the shipped transition wraps, so this is a week a player can actually be
     * standing in.
     */
    const menuResources = browserResourcesOf(context);
    const day1 = initialState(menuResources, 1n);
    const [grownDay] = runIdentityIssues(
      { ...day1, week: [1, 2, 3, 4, 5, 6].reduce((week) => nextDay(week), day1.week) },
      menuResources,
      'ranked',
    );

    const menuStates: readonly {
      readonly label: string;
      readonly selection: typeof whole;
      readonly canPost: boolean;
      readonly hasRun: boolean;
      readonly refusal: string | undefined;
      readonly viewMode?: 'basic' | 'advanced';
      readonly firstVisit?: boolean;
      readonly everLeftTheMenu?: boolean;
    }[] = [
      { label: 'whole', selection: whole, canPost: true, hasRun: true, refusal: undefined },
      { label: 'broken', selection: broken, canPost: false, hasRun: false, refusal: undefined },
      {
        label: 'unrankable',
        selection: whole,
        canPost: true,
        hasRun: true,
        refusal: grownDay?.message,
      },
      {
        label: 'casual',
        selection: whole,
        canPost: true,
        hasRun: true,
        refusal: undefined,
        viewMode: 'basic',
      },
      {
        label: 'first-visit',
        selection: whole,
        canPost: true,
        hasRun: true,
        refusal: undefined,
        firstVisit: true,
        // The state a genuinely first load is in: the menu has never been dismissed, so Resume's
        // first-sitting wording (docs/19's copy nit) is what this arm sweeps.
        everLeftTheMenu: false,
      },
    ];
    /*
     * An **open** board, in three states — GitHub issue #93.
     *
     * The arms above drive the leaderboard screen with a board *list* and no board open, which is
     * every sentence that surface had before #93 and none of the ones it has now. What is added is
     * the configuration reveal, the two refusals behind it and the per-row control's own line — all
     * four of which are claims about somebody else's run, which is the hardest thing on any screen
     * in this product to word safely.
     *
     * Three pages rather than one, on the broken-selection precedent two hundred lines up: `resolved`
     * is the ordinary case, `unknown` names a dispatcher this build does not ship (a live case, since
     * the viewer is served from a CDN and the API from a separate container — § D308), and
     * `disagreeing` is a page whose rows do not share a configuration, which is the state in which
     * this screen must say nothing about what ran rather than name the first row's dispatcher for
     * all of them.
     *
     * The runs are constructed rather than fetched, and that is stated rather than smoothed for
     * `CHALLENGE_VIEW`'s reason: no `data/` in this package ships a posted score, and the wire shape
     * is the server's. What keeps the constructed ids honest is that they are the **catalogue's
     * own** — a sweep over a building this build does not ship would be checking a sentence no
     * player can reach.
     */
    const openingRun = {
      buildingId: whole.buildingId,
      dispatcherProfileId: whole.dispatcherProfileId,
      demandTemplateId: whole.demandTemplateId,
      arrivalRatePctPop5min: whole.arrivalRatePctPop5min,
      durationS: whole.durationS,
      windowStartS: whole.windowStartS,
      seed: whole.seed,
    };
    const measured = Object.freeze({
      awtS: 24.6,
      wt95S: 51.2,
      ttdMeanS: 63.4,
      pctOverLongWait: 8.1,
      awtIsValid: true,
    });
    const entryOf = (name: string, run: typeof openingRun): BoardEntry => ({
      id: `entry-${name}`,
      displayName: name,
      run,
      measured,
      submittedAtMs: 0,
    });
    const pageOf = (entries: readonly BoardEntry[]): BoardPage => ({
      configHash: 'abcdef0123456789',
      metric: 'awtS',
      note: 'Ranked on the named metric alone. The others are shown beside it and never combined.',
      entries,
    });
    const boardPages: readonly { readonly label: string; readonly page: BoardPage }[] = [
      { label: 'resolved', page: pageOf([entryOf('A player', openingRun), entryOf('Another', { ...openingRun, seed: '77' })]) },
      {
        label: 'unknown',
        page: pageOf([entryOf('A player', { ...openingRun, dispatcherProfileId: 'a-profile-this-build-lacks' })]),
      },
      {
        label: 'disagreeing',
        page: pageOf([
          entryOf('A player', openingRun),
          entryOf('Another', { ...openingRun, arrivalRatePctPop5min: 6 }),
        ]),
      },
    ];

    for (const arm of menuStates) {
      for (const screen of MENU_SCREENS) {
        const view = screenOf({
          state: {
            screen,
            history: [],
            settings: DEFAULT_SETTINGS,
            freePlay: arm.selection,
            challenge: challengeSelection,
          },
          catalogue,
          canPost: arm.canPost,
          hasRun: arm.hasRun,
          ...(arm.refusal === undefined ? {} : { rankingRefusal: arm.refusal }),
          ...(arm.viewMode === undefined ? {} : { viewMode: arm.viewMode }),
          ...(arm.firstVisit === undefined ? {} : { firstVisit: arm.firstVisit }),
          ...(arm.everLeftTheMenu === undefined ? {} : { everLeftTheMenu: arm.everLeftTheMenu }),
          boards: [{ configHash: 'abcdef0123456789', entries: 3 }],
          challenge: challengeInput,
        });
        const at = `screen.${arm.label}.${screen}`;
        seeds.push({ field: `${at}.title`, text: view.title, role: 'label' });
        for (const [index, notice] of view.notices.entries()) {
          seeds.push({ field: `${at}.notice.${String(index)}`, text: notice, role: 'prose' });
        }
        for (const [index, issue] of view.issues.entries()) {
          seeds.push({ field: `${at}.issue.${String(index)}`, text: issue, role: 'reason' });
        }
        for (const row of view.rows) {
          seeds.push({ field: `${at}.${row.id}.label`, text: row.label, role: 'label' });
          if (row.detail !== undefined) {
            seeds.push({ field: `${at}.${row.id}.detail`, text: row.detail, role: 'prose' });
          }
          if (row.disabledWhy !== undefined) {
            seeds.push({ field: `${at}.${row.id}.why`, text: row.disabledWhy, role: 'reason' });
          }
        }
      }
    }

    /*
     * The leaderboard with a board open. One screen rather than the whole set, because `boardPage`
     * reaches exactly one of them and driving the other seven with it would be seven copies of
     * strings that do not depend on it — the same argument the two extra arms above are kept flat
     * for.
     */
    for (const { label, page } of boardPages) {
      const view = screenOf({
        state: {
          screen: 'leaderboard',
          history: [],
          settings: DEFAULT_SETTINGS,
          freePlay: whole,
          challenge: challengeSelection,
        },
        catalogue,
        canPost: true,
        hasRun: true,
        boards: [{ configHash: page.configHash, entries: page.entries.length }],
        boardPage: page,
        challenge: challengeInput,
      });
      const at = `board.${label}`;
      for (const [index, notice] of view.notices.entries()) {
        seeds.push({ field: `${at}.notice.${String(index)}`, text: notice, role: 'prose' });
      }
      for (const row of view.rows) {
        seeds.push({ field: `${at}.${row.id}.label`, text: row.label, role: 'label' });
        if (row.detail !== undefined) {
          seeds.push({ field: `${at}.${row.id}.detail`, text: row.detail, role: 'prose' });
        }
        if (row.disabledWhy !== undefined) {
          seeds.push({ field: `${at}.${row.id}.why`, text: row.disabledWhy, role: 'reason' });
        }
      }
    }

    return singleRun(this.id, seeds);
  },
};

/**
 * The one persistence string a player ever reads — and the reason it stopped being excludable.
 *
 * `derive.test.ts` used to exclude the whole of `persist/` with a reason that ended: *"The day that
 * sentence reaches a screen it stops being excludable, and this reason stops being true."* That day
 * is this adapter. `persist/notice.ts#restoreNoticeFor` turns a discriminated restore failure into a
 * line the coach ribbon shows, so it is a player-facing claim about what happened to their week.
 *
 * ## Driven through `loadSession`, not around it
 *
 * Two of the six arms **quote the diagnostic** — the `parse` and `shape` messages name a field and
 * are worth carrying — so a sweep that invented those messages would check wording nobody ships.
 * The three broken stores below are read through the real `loadSession`, which is why it moves out
 * of the exclusion list and into `covers`: its sentences now reach a screen, through this quotation
 * and only through it.
 *
 * The remaining three arms cannot be produced from bytes — `unavailable` needs a throwing store,
 * `version` needs an envelope from another build, `stale` needs `data/` to have lost something — so
 * they are seeded from constructed failures, and that difference is stated rather than smoothed
 * over.
 *
 * ## Roles
 *
 * `reason`, all of them. Each is a refusal that names what it refused and what happens instead,
 * which is exactly what that role is for — and it is the role that exempts a string from being read
 * as a claim about a *run*, which none of these is.
 */
const RESTORE_NOTICE: SurfaceAdapter = {
  id: 'persist/notice.ts#restoreNoticeFor',
  covers: ['persist/notice.ts#restoreNoticeFor', 'persist/session.ts#loadSession'],
  render(this: SurfaceAdapter) {
    const seeds: TextSeed[] = [];

    /* ---- the arms a real store can produce, read through the real loader ---- */
    const stored = (value: string | null): SessionStore => ({
      read: () => value,
      write: () => undefined,
      remove: () => undefined,
    });
    const bytes: readonly (readonly [string, string | null])[] = [
      ['absent', null],
      ['parse', '{not json'],
      ['shape', JSON.stringify({ version: SESSION_SCHEMA_VERSION, week: { day: 'Tuesday' } })],
    ];
    for (const [name, value] of bytes) {
      const restored = loadSession(stored(value));
      if (restored.ok) continue;
      seeds.push({
        field: `loadSession(${name}).message`,
        text: restored.failure.message,
        role: 'reason',
      });
      const notice = restoreNoticeFor(restored.failure);
      if (notice !== undefined) {
        seeds.push({ field: `restoreNoticeFor(${name})`, text: notice, role: 'reason' });
      }
    }

    /* ---- the three a store cannot reach from bytes alone ---- */
    const constructed: readonly SessionRestoreFailure[] = [
      { kind: 'unavailable', message: 'The browser refused to read site data.' },
      {
        kind: 'version',
        message: 'Written by a different build.',
        found: SESSION_SCHEMA_VERSION + 1,
        supported: SESSION_SCHEMA_VERSION,
      },
      { kind: 'stale', message: 'Names things this build no longer ships.', missing: ['c9'] },
    ];
    for (const failure of constructed) {
      const notice = restoreNoticeFor(failure);
      if (notice !== undefined) {
        seeds.push({ field: `restoreNoticeFor(${failure.kind})`, text: notice, role: 'reason' });
      }
    }

    return singleRun(this.id, seeds);
  },
};

/**
 * The weight-set selector — the product's one genuine mid-run mechanism, and its first surface.
 *
 * ## Why every string here needs the sweep more than most
 *
 * The learned selector has been refused **three times** — § D145, § D156, § D169 — and the last
 * refusal closed the mix-varying question in the refusing direction. The hand-authored selector is
 * shipped and works; what nobody has measured is that switching *helps* on any configuration a
 * player will run. So a label reading *"switches to the faster weights during the morning peak"*
 * would be an unmeasured comparative on the exact question three studies declined to answer, and it
 * would read as a finding because it sits on a control.
 *
 * The authoring module already scans its own prose for a comparative vocabulary. This adapter is the
 * generic half: the same strings go through R2, R3, R10 and R13 with everything else.
 *
 * ## Driven on four contexts, because the refusals are where the prose is
 *
 * The shipped library with a policy on; the same with the policy `off` (six refusals plus the map);
 * a spec bound to a pattern the detector does not declare — § D112's shape in a new field, resolved
 * cleanly and read by nobody; and a **library with no `patternSwitching` at all**, which is the one
 * that produces `selectorAvailability`'s note. The last is not reachable from `data/` today and is
 * constructed, which is stated rather than smoothed over.
 */
const SELECTOR: SurfaceAdapter = {
  id: 'dev/selectorEditor.ts#mountSelectorEditor',
  covers: [
    'dev/selectorEditor.ts#mountSelectorEditor',
    'dev/selectorEditor.ts#selectorAvailability',
    'dev/selectorEditor.ts#POLICY_HINTS',
    'dev/selectorEditor.ts#policyChipsOf',
    'dev/selectorEditor.ts#SCALAR_LABELS',
    'dev/selectorEditor.ts#scalarRowsOf',
    'dev/selectorEditor.ts#armRowsOf',
    'dev/selectorEditor.ts#armOptionsOf',
    'dev/selectorEditor.ts#changedNoteOf',
    'authoring/selectorSpec.ts#PATTERN_LINES',
    'authoring/selectorSpec.ts#PATTERN_NAMES',
    'authoring/selectorSpec.ts#INPUT_PHRASES',
    'authoring/selectorSpec.ts#patternLine',
    'authoring/selectorSpec.ts#patternName',
    'authoring/selectorSpec.ts#signatureLine',
    'authoring/selectorSpec.ts#policyLine',
    'authoring/selectorSpec.ts#patternCards',
    'authoring/selectorSpec.ts#selectorIssues',
    'authoring/selectorSpec.ts#helpFor',
    'authoring/selectorSpec.ts#rangeFor',
    'authoring/selectorSpec.ts#defaultSelectorSpec',
    'authoring/selectorSpec.ts#specFromProfile',
    'authoring/selectorSpec.ts#specIsDirty',
    'authoring/selectorSpec.ts#profileWithSelector',
  ],
  render(this: SurfaceAdapter, context) {
    const seeds: TextSeed[] = [];
    const file = context.dispatcherProfiles;
    if (file === undefined) return singleRun(this.id, seeds);

    const selectorContext = selectorContextFrom(file, 900);
    const profile = file.profiles[0];
    if (profile === undefined) return singleRun(this.id, seeds);

    const base = selectorSpecFromProfile(profile, selectorContext);
    const patterns = file.patternSwitching?.patternDetector.patterns ?? [];
    const firstPattern = patterns[0] ?? 'up-peak';

    const arms: readonly (readonly [string, SelectorSpec])[] = [
      ['on', { ...base, policy: 'fuzzy' }],
      // Every control refused at once — the arm that carries six sentences and the map's own.
      ['off', { ...base, policy: 'off' }],
      /*
       * A binding for a pattern the detector does not declare. The resolver iterates the detector's
       * own patterns, so this entry resolves cleanly and is read by nobody — § D112's defect in a
       * new field, and the refusal is the only thing that makes it visible.
       */
      [
        'stray-binding',
        {
          ...base,
          policy: 'fuzzy',
          weightSetsByPattern: { ...base.weightSetsByPattern, 'no-such-pattern': profile.id },
        },
      ],
    ];

    for (const [name, spec] of arms) {
      const issues = selectorIssues(spec, selectorContext);
      seeds.push({
        field: `${name}.policyLine`,
        text: policyLine(spec, selectorContext),
        role: 'label',
      });
      seeds.push({
        field: `${name}.changedNote`,
        text: changedNoteOf(spec, profile, selectorContext),
        role: 'label',
      });
      for (const [index, issue] of issues.entries()) {
        seeds.push({ field: `${name}.issue[${String(index)}]`, text: issue.message, role: 'reason' });
      }
      for (const chip of policyChipsOf(spec)) {
        seeds.push({ field: `${name}.policy.${chip.policy}.label`, text: chip.label, role: 'label' });
        seeds.push({ field: `${name}.policy.${chip.policy}.hint`, text: chip.hint, role: 'prose' });
      }
      for (const row of scalarRowsOf(spec, issues)) {
        seeds.push({ field: `${name}.scalar.${row.field}.label`, text: row.label, role: 'label' });
        seeds.push({ field: `${name}.scalar.${row.field}.help`, text: row.help, role: 'prose' });
        // The number beside the thumb. An `observation` because it is a value the run will read.
        seeds.push({
          field: `${name}.scalar.${row.field}.value`,
          text: `${row.label}: ${row.valueText}`,
          role: 'observation',
        });
        seeds.push({ field: `${name}.scalar.${row.field}.refusal`, text: row.refusal, role: 'reason' });
      }
      for (const row of armRowsOf(spec, selectorContext, issues)) {
        seeds.push({ field: `${name}.arm.${row.patternId}.line`, text: row.line, role: 'prose' });
        /*
         * The derived one. `signatureLine` reads the authored membership ramps and says what the
         * detector matches on — so it is a **claim about the configuration**, and a wrong one would
         * describe a regime the run never enters.
         */
        seeds.push({
          field: `${name}.arm.${row.patternId}.signature`,
          text: row.signature,
          role: 'observation',
        });
        seeds.push({
          field: `${name}.arm.${row.patternId}.weightSet`,
          text: row.weightSetName,
          role: 'label',
        });
        seeds.push({ field: `${name}.arm.${row.patternId}.refusal`, text: row.refusal, role: 'reason' });
      }
    }

    for (const option of armOptionsOf(selectorContext, profile.id)) {
      seeds.push({ field: `option.${option.value}`, text: option.label, role: 'label' });
    }
    seeds.push({
      field: 'availability.offered',
      text: selectorAvailability(selectorContext).note,
      role: 'reason',
    });
    /*
     * The unavailable note, on a library that declares no patterns. No shipped `data/` reaches it —
     * so it is constructed here rather than left unswept, and that difference is said rather than
     * hidden behind an arm that looks driven.
     */
    seeds.push({
      field: 'availability.absent',
      text: selectorAvailability({ profiles: file.profiles, patternSwitching: undefined }).note,
      role: 'reason',
    });
    seeds.push({
      field: `patternLine(${firstPattern})`,
      text: patternLine(firstPattern) ?? '',
      role: 'prose',
    });
    /*
     * The short names, one per declared pattern — the header pill's vocabulary (slice 4b). Driven
     * over the detector's own `patterns` so a name for a dropped pattern, or a missing one for a
     * new pattern, changes the corpus the day the data moves; `selectorSpec.test.ts` holds the
     * key set both ways and this puts the words themselves through R2/R10 with everything else.
     */
    for (const patternId of patterns) {
      seeds.push({
        field: `patternName(${patternId})`,
        text: patternName(patternId) ?? '',
        role: 'label',
      });
    }

    return singleRun(this.id, seeds);
  },
};

/**
 * The challenge board's client half — four producers, and every one of them a refusal.
 *
 * ## Why these strings are the client's own, unusually
 *
 * Everywhere else on this surface the rule is *carry the server's wording unrewritten*, because a
 * second place that decides what a rejection means is a second place that can be wrong. These are
 * the exception, and deliberately: each fires **before the request is made**, so there is no server
 * wording to carry. A challenge that names a building this build does not ship, a seed set with a
 * gap in it, a long-wait share that was never measured — none of those reach the server, which is
 * the whole point, since the server's rejection is an accusation and spending it on a client bug is
 * the defect `submitScore` argues about one board over.
 *
 * ## The one they must not become
 *
 * `docs/10` § 5.5 bans a leaderboard that ranks dispatchers from single runs, and this board's whole
 * design points at that ban — the dispatcher is the axis. So a refusal that said *"post a better
 * dispatcher"* or *"this one came out ahead"* would be the ban arriving through a refusal, which is
 * the one place nobody reads for comparative claims. `challenge.test.ts` scans them lexically; this
 * adapter is the generic half, and puts them through R2 with everything else.
 */
const CHALLENGE: SurfaceAdapter = {
  id: 'menu/challenge.ts#challengeRunConfigs',
  covers: [
    'menu/challenge.ts#challengeRunConfigs',
    'menu/challenge.ts#challengeSubmissionOf',
    'menu/challenge.ts#challengeNotOpenOf',
    'menu/client.ts#claimedMetricsOf',
  ],
  render(this: SurfaceAdapter, context) {
    const seeds: TextSeed[] = [];
    const view = CHALLENGE_VIEW;

    /* ---- the run-config refusals: one per thing `data/` might not ship ---- */
    const resources = {
      buildings: context.buildings,
      dispatcherProfiles: context.dispatcherProfiles,
      trafficProfiles: context.trafficProfiles,
      elevatorSpecs: context.elevatorSpecs,
    } as unknown as Parameters<typeof challengeRunConfigs>[1];

    const configArms: readonly (readonly [string, ChallengeView, string])[] = [
      ['unknown-dispatcher', view, 'no-such-dispatcher'],
      [
        'unknown-building',
        { ...view, challenge: { ...view.challenge, config: { ...view.challenge.config, buildingId: 'demolished' } } },
        'collective',
      ],
      [
        'unknown-template',
        {
          ...view,
          challenge: {
            ...view.challenge,
            config: { ...view.challenge.config, demandTemplateId: 'no-such-template' },
          },
        },
        'collective',
      ],
    ];
    for (const [name, arm, dispatcherId] of configArms) {
      const built = challengeRunConfigs(arm, resources, dispatcherId);
      if (!built.ok) {
        seeds.push({ field: `runConfigs.${name}`, text: built.detail, role: 'reason' });
      }
    }

    /* ---- the submission refusals: a gap in the set, and a seed nobody asked for ---- */
    const recording = context.recording;
    const paired = (seed: string): { readonly seed: string } & VizRecording => ({
      ...recording,
      seed,
    });
    const submissionArms: readonly (readonly [string, readonly ({ readonly seed: string } & VizRecording)[]])[] = [
      ['missing-seed', [paired('1001'), paired('1002')]],
      ['duplicate-seed', view.challenge.seeds.map(() => paired('1001'))],
      ['foreign-seed', [...view.challenge.seeds.slice(1).map(paired), paired('9999')]],
    ];
    for (const [name, recordings] of submissionArms) {
      const body = challengeSubmissionOf(view, 'collective', recordings);
      if (!body.ok) {
        seeds.push({ field: `submission.${name}`, text: body.detail, role: 'reason' });
      }
    }

    /* ---- the 409, carried rather than authored ---- */
    const shut = challengeNotOpenOf({
      ok: false,
      code: 'challenge-not-open',
      detail: 'That challenge is not taking entries.',
      issues: [],
      body: {
        error: 'challenge-not-open',
        state: 'closed',
        challengeId: view.challenge.id,
        opensAtMs: 0,
        closesAtMs: 0,
        currentChallengeId: 'midtown-morning-5',
        detail: 'That challenge is not taking entries.',
      },
    });
    if (shut !== undefined) {
      // The server's sentence, and the assertion that this module did not rewrite it.
      seeds.push({ field: 'notOpen.detail', text: shut.detail, role: 'reason' });
    }

    /* ---- the claim a client makes about its own run ---- */
    const unmeasured = claimedMetricsOf({ ...recording.summary, pctOverLongWait: null });
    if (!unmeasured.ok) {
      seeds.push({ field: 'claimedMetrics.unmeasured', text: unmeasured.detail, role: 'reason' });
    }

    return singleRun(this.id, seeds);
  },
};

/**
 * The calendar, the fabric, and the two persistence sentences that reach a ribbon.
 *
 * Three lanes in one adapter because they share the property that matters here: **each says what it
 * did to a run, and each has a way of saying more than it did.** A calendar line that named a
 * template the run length refused; a constraint sentence whose capital figure drifted toward
 * reading like a score; a library notice that put a validator's JSON path on a coach ribbon. All
 * three are prose about a run, and all three are driven on the arm where the refusal fires rather
 * than only on the happy one.
 *
 * ## What the fabric's sentence must never become
 *
 * `docs/10` § 5.5 bans grade letters, efficiency scores and energy scores. A capital figure is a
 * limit and not a metric — `commissioning/types.ts` argues it with the § D106 precedent, and the
 * reason it needs arguing is that the cheapest building is the one with the fewest shafts, so a
 * capital *score* would rank the towers serving fewest people highest. `commissioning/`'s own suite
 * scans its literals for a 22-pattern lexicon; this adapter is the generic half, putting the same
 * sentences through R2 and R11 with everything else.
 */
const CALENDAR_AND_FABRIC: SurfaceAdapter = {
  id: 'shift/calendar.ts#calendarLine',
  covers: [
    'shift/calendar.ts#calendarLine',
    'shift/calendar.ts#calendarPatch',
    'shift/calendar.ts#CALENDAR_PERIODS',
    'shift/calendar.ts#CALENDAR_PERIOD_IDS',
    /*
     * `scheduledEventFor` is deliberately **not** claimed here, and `derive.test.ts` is why: it
     * returns a `ShiftEvent`, not prose, so it is no more a text producer than `calendarDayFor` is.
     * A `covers` entry for it would be a coverage claim for nothing — which that suite refuses in
     * those words, and did, on the first draft of this line. Its *output* is swept below, because
     * the name and note the override picks are strings a player reads.
     */
    'commissioning/types.ts#CONSTRAINTS',
    'commissioning/types.ts#constraintById',
    'commissioning/types.ts#DIMENSION_LABELS',
    'commissioning/refusals.ts#reviewCommissioning',
    'commissioning/building.ts#commissionedBuilding',
    'commissioning/choices.ts#movedChoices',
    'commissioning/choices.ts#movedChoiceText',
    'persist/notice.ts#libraryNoticeFor',
    'persist/notice.ts#saveNoticeFor',
    'persist/session.ts#loadLibrary',
    'persist/types.ts#LIBRARY_BUDGET_CHARACTERS',
    'persist/validate.ts#libraryFrameIssue',
    'persist/validate.ts#restoreLibrary',
  ],
  render(this: SurfaceAdapter, context) {
    const seeds: TextSeed[] = [];
    const building = context.building;

    /* ---- the calendar: every period, and the day each one shapes ---- */
    for (const id of CALENDAR_PERIOD_IDS) {
      const period = CALENDAR_PERIODS[id];
      seeds.push({ field: `period.${id}.name`, text: period.name, role: 'label' });
      seeds.push({ field: `period.${id}.note`, text: period.note, role: 'prose' });

      const placed = periodOnDays(period, 1, 7);
      for (const day of [1, 6]) {
        const today = calendarDayFor(placed, day, (day - 1) % 7);
        const patch = calendarPatch({
          day: today,
          building,
          split: { incoming: 0.85, outgoing: 0.05, interfloor: 0.1 },
          demandTemplateId: 'rise-and-fall',
          demandTemplates: context.trafficProfiles.demandTemplates,
          runLengthS: 1800,
        });
        /*
         * `observation`, not `label`: the line carries a **population count** taken off the edited
         * building, and a count on a surface is what R13's clauses are about. Driven at day 1 and
         * day 6 because two of the shipped periods gate on the weekday, so a Saturday is a
         * different sentence — and on one of them, no sentence at all.
         */
        seeds.push({
          field: `period.${id}.day${String(day)}.line`,
          text: today === null ? '' : calendarLine(patch),
          role: 'observation',
        });
        /*
         * The event the day is actually under — GitHub issue #135's fix, swept on every shipped
         * period rather than only on the ordinary week the shift bundle drives.
         *
         * These are `SHIFT_EVENTS`' own name and note, which `SHIFT_REPORT` already seeds for the
         * schedule's answer; what is new here is the **override's** answer, and it is a different
         * pair on five of `moving-week`'s seven days. `label` and `prose` match the roles those two
         * strings carry everywhere else, so a period cannot smuggle a figure onto a surface by
         * booking an event with one in its note.
         */
        const booked = scheduledEventFor(placed, day, (day - 1) % 7);
        seeds.push({ field: `period.${id}.day${String(day)}.event.name`, text: booked.name, role: 'label' });
        seeds.push({ field: `period.${id}.day${String(day)}.event.note`, text: booked.note, role: 'prose' });
        for (const [index, withheld] of patch.withheld.entries()) {
          seeds.push({
            field: `period.${id}.day${String(day)}.withheld[${String(index)}]`,
            text: withheld,
            role: 'reason',
          });
        }
      }
    }

    /* ---- the fabric: every constraint, against as-built and against a moved bank ---- */
    const classes = commissionableClasses(context.elevatorSpecs);
    const asBuilt = asBuiltChoices(building, classes);
    const first = asBuilt[0];
    const moved =
      first === undefined ? asBuilt : withBankChoice(asBuilt, { ...first, shafts: first.shafts + 3 });
    for (const label of Object.values(DIMENSION_LABELS)) {
      seeds.push({ field: `dimension.${label}`, text: label, role: 'label' });
    }
    for (const constraint of CONSTRAINTS) {
      seeds.push({ field: `constraint.${constraint.id}.label`, text: constraint.label, role: 'label' });
      seeds.push({ field: `constraint.${constraint.id}.note`, text: constraint.note, role: 'prose' });
      for (const [name, choices] of [
        ['as-built', asBuilt],
        ['moved', moved],
      ] as const) {
        const review = reviewCommissioning({
          base: building,
          choices,
          classes,
          specs: context.elevatorSpecs,
          constraint,
        });
        /*
         * The one sentence the capital figure appears in, on both arms — because the arm that
         * refuses is the one whose wording could slip into ranking, and the arm that does not is
         * where an unearned superlative would sit unchallenged.
         */
        seeds.push({
          field: `constraint.${constraint.id}.${name}.sentence`,
          text: review.sentence,
          role: 'observation',
        });
        for (const refusal of review.refusals) {
          seeds.push({
            field: `constraint.${constraint.id}.${name}.refusal(${refusal.code})`,
            text: refusal.message,
            role: 'reason',
          });
        }
      }
    }
    for (const change of movedChoices(asBuilt, moved)) {
      seeds.push({ field: `moved.${change.bankId}.${change.dimension}`, text: movedChoiceText(change), role: 'label' });
    }

    /* ---- the two persistence sentences a ribbon shows ---- */
    const dropped: readonly DroppedEntry[] = [
      { shelf: 'building', index: 0, label: 'Tower B', reason: 'banks[0].cars[0].spec is unknown' },
      { shelf: 'dispatcher', index: 1, label: 'Mine', reason: 'weights.rideTime is not a number' },
      { shelf: 'pattern', index: 2, label: 'Lunch', reason: 'batchMean is out of range' },
      { shelf: 'class', index: 3, label: 'Fast', reason: 'ratedSpeedMps.min is negative' },
    ];
    for (const count of [1, dropped.length]) {
      const notice = libraryNoticeFor(dropped.slice(0, count));
      if (notice !== undefined) {
        // Both shapes: the singular names the one thing, the plural names three and counts the rest.
        seeds.push({ field: `library.dropped.${String(count)}`, text: notice, role: 'reason' });
      }
    }
    seeds.push({
      field: 'library.overBudget',
      text:
        saveNoticeFor({
          kind: 'library-too-large',
          message: '',
          characters: 640_000,
          limit: LIBRARY_BUDGET_CHARACTERS,
          entries: 28,
        }) ?? '',
      role: 'reason',
    });

    return singleRun(this.id, seeds);
  },
};

/**
 * The statistics vocabulary — issue #22, driven rather than excluded.
 *
 * ## Why this is an adapter and not an entry in `NOT_PLAYER_FACING`
 *
 * Because it is player-facing copy about **what a number means**, which is the closest thing to
 * the honesty search's own subject that this package contains. An exclusion would have had to
 * argue that prose written to explain a confidence interval is not the kind of prose R1, R2, R10,
 * R11 and R13 are about, and there is no version of that argument that survives being written
 * down. `mode/glossary.ts` was authored knowing it would be swept.
 *
 * The sweep is not decorative. Every rule it applies is one this table could plausibly break:
 * **R10** because a natural way to explain an interval is *"there is a 95 % chance"*, which is
 * exactly the misreading Budescu measured; **R11** because a natural way to explain kilojoules is
 * to call a small number good; **R2** because the whole risk of a plain-language layer is that
 * *"this run cannot tell them apart"* drifts into *"A is better"*.
 *
 * ## Two renderings, and the second is what makes this more than a string dump
 *
 * 1. **The whole table.** Every term and every explanation, on every case — so no entry can hide
 *    behind never having been selected by a run.
 * 2. **What the batch actually selected.** `glossaryFor` run over the shipped batch report's own
 *    sentences, which is the call the Compare tab makes. This is the liveness half: a selector
 *    that matched nothing would leave `honesty.test.ts`'s per-surface assertion looking at a
 *    corpus with no evidence the vocabulary is ever attached to anything.
 *
 * ## Provenance is `authored`, deliberately
 *
 * Not `schema`. `schema` is the one provenance R10 does not scope to — it exists for `core`'s own
 * description of its own dial, re-printed unaltered, which has no run behind it. This text is
 * this package's own writing about results, so it is result-bearing and the probability-word rule
 * applies to it in full. Picking `schema` would have been an exemption dressed as a category.
 *
 * ## What the roles say, and why `term` is not `prose`
 *
 * `GlossaryTerm.term` is seeded `label` — *"a name, a unit, a heading"* — because it is exactly
 * that: the product's own word, quoted back. `GlossaryTerm.plain` is `prose`. The split matters
 * for R13's frequency clause, which skips labels: `95th-percentile wait` is a name and not a
 * restatement of anything.
 *
 * The batch report, goal report, stage verdict and stage briefing each now carry a `glossary`
 * field holding **these same objects by reference**, so the strings seeded here are the strings
 * those surfaces draw. That is why `BATCH_REPORT` and `CAMPAIGN` do not seed their `glossary`
 * fields a second time: it would put one sentence into the corpus under two surface ids and make
 * the search look broader than it is.
 */
const GLOSSARY: SurfaceAdapter = {
  id: 'mode/glossary.ts#glossaryFor',
  covers: [
    'mode/glossary.ts#glossaryFor',
    'mode/glossary.ts#GLOSSARY_TERMS',
    // The keyed lookup `mode/disclosure.ts` uses for the two Casual leads the glossary owns. It
    // returns a `plain` this adapter already seeds, so driving it separately would put one
    // sentence in the corpus twice; listing it here is the claim that seeding the table drives it.
    'mode/glossary.ts#glossaryPlain',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    for (const entry of GLOSSARY_TERMS) {
      seeds.push({
        field: `${entry.id}.term`,
        text: entry.term,
        role: 'label',
        provenance: 'authored',
      });
      seeds.push({
        field: `${entry.id}.plain`,
        text: entry.plain,
        role: 'prose',
        provenance: 'authored',
      });
    }
    /*
     * The selector, on the batch the case actually ran — the Compare tab's own call. Seeded by the
     * *selected* term's id rather than by its text, so this half of the corpus is a claim about
     * which words were attached and the text itself is not duplicated under a second field.
     */
    const selected = glossaryFor([
      context.report.demandClause,
      context.report.crnSentence,
      ...context.report.arms.map((arm) => arm.sentence),
      ...context.report.comparisons.flatMap((comparison) =>
        comparison.rows.flatMap((row) => [row.label, row.sentence, row.note]),
      ),
    ]);
    for (const entry of selected) {
      seeds.push({
        field: `selected.${entry.id}`,
        text: entry.term,
        role: 'label',
        provenance: 'authored',
      });
    }
    return singleRun(this.id, seeds);
  },
};

/**
 * The exported report card — the one surface here that **leaves the building** — issue #118 § 1.
 *
 * Every other adapter drives something a reader sees while they still have the run in front of
 * them: they can open the sheet, move the playhead, read the small print. This one drives a PNG
 * that gets pasted into a chat, so a claim on it is read with none of that around it and cannot be
 * corrected by the next screen. That makes it the surface where a suppressed figure drawn as a
 * figure, or a mean quoted without its window, costs the most — and it is why the card exists as a
 * pure `reportCardOf` at all rather than as drawing code inside `dev/`.
 *
 * Both shapes of sheet, per day, exactly as `REPORT_PANEL` drives them — and **both arms of the
 * recipe**, because the refusal is a sentence a reader has to act on and the card is where they
 * meet it. The reasons handed in are `runIdentityIssues`' own, quoted through a fixture rather than
 * regenerated here: the point of driving them on this surface is the *card's* framing of them, and
 * the sentences themselves are `scope/runIdentity.ts`'s and are accounted for there.
 */
const REPORT_CARD: SurfaceAdapter = {
  id: 'render/reportCard.ts#reportCardOf',
  covers: ['render/reportCard.ts#reportCardOf', 'render/reportCard.ts#NO_SHEET_YET'],
  render(context) {
    const seeds: TextSeed[] = [];
    const bundle = shiftBundleOf(context);
    const resources = browserResourcesOf(context);
    const recipes: readonly (readonly [string, CardRecipe])[] = [
      ['link', { ok: true, line: `https://elevator.example/?seed=${String(context.recording.seed)}` }],
      [
        'refused',
        {
          ok: false,
          /*
           * Ids `data/` does **not** ship, deliberately: a value taken from the loaded configuration
           * would be reproducible by construction and the refusal arm would render nothing. These
           * are the two *"saved on this device alone"* refusals a reader is most likely to meet.
           */
          reasons: runIdentityIssues(
            { ...initialState(resources, 1n), buildingId: 'my-tower', dispatcherId: 'my-dispatcher' },
            resources,
            'ranked',
          ).map((issue) => issue.message),
        },
      ],
    ];

    for (const entry of bundle.days) {
      for (const shaped of [entry.report, entry.singleRunReport]) {
        for (const [arm, recipe] of recipes) {
          const at = `day${String(entry.day)}.${shaped.of}.${arm}`;
          const card = reportCardOf({
            report: shaped,
            buildingName: context.case.buildingId,
            seed: String(context.recording.seed),
            recipe,
          });
          seeds.push({ field: `${at}.eyebrow`, text: card.eyebrow, role: 'label' });
          seeds.push({ field: `${at}.title`, text: card.title, role: 'label' });
          seeds.push({ field: `${at}.verdictLine`, text: card.verdictLine, role: 'observation' });
          seeds.push({ field: `${at}.lede`, text: card.lede.join(' '), role: 'observation' });
          for (const [index, tile] of card.tiles.entries()) {
            const source = shaped.figures[index];
            const shape =
              source === undefined
                ? { role: 'observation' as TextRole, gated: false, energyAxis: false }
                : reportFigureShape(source);
            seeds.push({
              field: `${at}.tile[${String(index)}](${tile.label}).value`,
              text: `${tile.label}: ${tile.value}`,
              role: shape.role,
              declaredCount: shape.gated ? context.recording.summary.waitCount : undefined,
              countShown: shape.gated ? /(\d[\d,]*)/.test(tile.note) : undefined,
              energyAxis: shape.energyAxis,
              gated: shape.gated,
            });
            seeds.push({
              field: `${at}.tile[${String(index)}](${tile.label}).note`,
              text: tile.note,
              role: shape.role === 'suppressed' ? 'reason' : 'observation',
              energyAxis: shape.energyAxis,
            });
          }
          seeds.push({ field: `${at}.section`, text: card.sectionHeading, role: 'label' });
          for (const [index, row] of card.rows.entries()) {
            seeds.push({
              field: `${at}.row[${String(index)}]`,
              text: row,
              role: 'observation',
            });
          }
          for (const [index, line] of card.footer.entries()) {
            seeds.push({
              field: `${at}.footer[${String(index)}]`,
              text: line,
              role: recipe.ok ? 'observation' : 'reason',
            });
          }
        }
      }
    }

    /*
     * The refusal the control itself shows, which is not on any card: pressing **Export report
     * PNG** before a day has been filed. It is `reason` rather than `label` because it explains a
     * refusal and names what to do instead, which is the shape R3 judges.
     */
    seeds.push({ field: 'noSheetYet', text: NO_SHEET_YET, role: 'reason', provenance: 'authored' });
    return singleRun(this.id, seeds);
  },
};

/* -------------------------------------------------------------------------- *
 * Fix-a-building — GAMEPLAY § 10 over `fixit/`'s pure model
 * -------------------------------------------------------------------------- */

/**
 * A search case over the context's own building, so every sentence the Fix-a-building engine can
 * author is rendered against real runs — the figures and the measured rows read
 * {@link HonestyContext.recording} and {@link HonestyContext.comparisonRecording} (`before` is the
 * comparison run, `after` the case's own, the `dev/reportPanel.ts#rotatedOn` convention).
 *
 * The **authored** halves — complaint, diagnosis, repair names, effects — are synthetic here, like
 * the escalator fixtures above: the shipped `data/fixit-cases.json` copy is validated at load time
 * by `fixit/parse.ts` (R10 and § 16 rule 11), which is the campaign precedent — `data/` documents
 * are refused at the door, and what the search drives is the machinery that wraps them.
 */
/** The declarations the FIXIT adapter drives. A list, so `derive.test.ts` can hold it both ways. */
const FIXIT_COVERS: readonly string[] = [
  'fixit/engine.ts#classifyOutcome',
  'fixit/engine.ts#budgetNoteOf',
  'fixit/engine.ts#repairRowOf',
  'fixit/engine.ts#STANDING_EXTRAS',
  'fixit/engine.ts#BASIS_LINE',
  // Driven through the rows above: `repairRowOf` asks `affordabilityOf`, which sums `spendOf`,
  // and the states the adapter renders are built by the two toggles rather than written by hand.
  'fixit/engine.ts#spendOf',
  'fixit/engine.ts#affordabilityOf',
  'fixit/engine.ts#toggleRepair',
  'fixit/engine.ts#toggleExtra',
  'fixit/run.ts#figureValuesOf',
  /*
   * The Everyday screen's pure half (GAMEPLAY § 10, `everyday/fixitScreen.ts` is the DOM half and
   * is excluded on the mounts' shared ground). These hold every word the screen draws of its own —
   * the rail chrome and its derived `{fixed}/{total}`, the § 3.3 substitutions the fixit row
   * leaves state-dependent, the § 9-priced stepper lines and the running-total split — and they
   * are driven below over states the engine's own reducers build. `buildingLineOf` is not listed
   * because the derivation does not find it (a `·`-joined name and floor count carries no two
   * adjacent prose words); it is rendered below anyway, inside the rail rows.
   */
  'everyday/fixitScreenModel.ts#FIXIT_SCREEN_COPY',
  'everyday/fixitScreenModel.ts#fixitCaseRailModel',
  'everyday/fixitScreenModel.ts#fixitBarModel',
  'everyday/fixitScreenModel.ts#fixitMachineryRows',
  'everyday/fixitScreenModel.ts#fixitSpendSummary',
  'everyday/fixitScreenModel.ts#fixitRepairStateLine',
];

function fixitSearchCase(context: HonestyContext): FixitCase {
  const floors = context.recording.floors.map((floor) => floor.id);
  const scopeFloors = floors.slice(0, Math.max(1, Math.ceil(floors.length / 2)));
  const repairPatch = { dispatcher: { idle: { parkingStrategy: 'stay' } } };
  return {
    id: 'search-case',
    name: 'The searched tower',
    buildingId: context.building.id,
    dispatcherProfileId: context.case.baselineProfileId,
    run: { seed: '1', durationS: context.case.durationS, arrivalRatePctPop5min: null },
    asBuilt: {
      note: 'The fault is in how it is configured, not in what it is made of.',
      patch: {},
    },
    complaint: {
      text: 'The wait on my floor is longer than it was last year, and nothing about the building has changed.',
      complainer: 'tenant, the searched half',
      measure: {
        kind: 'long-waits',
        label: 'waits over a minute starting in the searched half',
        thresholdS: 60,
        scope: { mode: 'origin', floorIds: scopeFloors },
      },
    },
    symptom: 'waits over a minute, while cars stand elsewhere',
    figures: [
      { kind: 'complaint', label: 'Waits over a minute in the searched half', reading: 'bad' },
      { kind: 'scope-mean-wait', label: 'Mean wait in the searched half', reading: 'mid' },
      { kind: 'scope-worst-wait', label: 'Worst wait in the searched half', reading: 'mid' },
      { kind: 'rest-away-pct', label: 'Rest of the building away inside a minute', reading: 'healthy' },
    ],
    diagnosis: {
      text: 'The idle fleet is parked where the calls are not.',
      reasoning: 'Every long wait in this run began with the cars standing together at the far end of the shaft.',
    },
    budgetUnits: 12,
    repairs: [
      { id: 's-diagnosed', role: 'diagnosed', name: 'Let the idle fleet wait along its stops', costUnits: 0, effect: 'A setting, and the long waits above are the target.', patch: repairPatch },
      { id: 's-costly', role: 'costly-fix', name: 'Re-gear the machines', costUnits: 10, effect: 'Faster climbs shorten the worst wait; the parking stays.', patch: repairPatch },
      { id: 's-cheap', role: 'cheap-fix', name: 'Trim the door dwell', costUnits: 2, effect: 'A second off every stop moves the mean a little.', patch: repairPatch },
      { id: 's-shaft', role: 'new-shaft', name: 'A new shaft · beyond a repair budget', costUnits: 34, effect: 'A capital conversation with the owner, not a work order.', patch: repairPatch },
    ],
    result: {
      head: 'The building is awake.',
      body: 'Nothing was bought: the cars were always enough — they were parked in the wrong place.',
    },
  };
}

const FIXIT: SurfaceAdapter = {
  id: 'fixit/engine.ts#classifyOutcome',
  covers: FIXIT_COVERS,
  render(this: SurfaceAdapter, context) {
    const seeds: TextSeed[] = [];
    const entry = fixitSearchCase(context);

    /* ---- the standing extras: every name and every line, authored in the engine ---- */
    for (const extra of STANDING_EXTRAS) {
      seeds.push({ field: `extra.${extra.id}.name`, text: extra.name, role: 'label', provenance: 'authored' });
      seeds.push({ field: `extra.${extra.id}.line`, text: extra.line, role: 'prose', provenance: 'authored' });
    }

    /* ---- the four figures, measured on the case's own run, both measure kinds ---- */
    for (const figure of figureValuesOf(entry, context.recording)) {
      seeds.push({ field: `figure(${figure.label})`, text: `${figure.label}: ${figure.text}`, role: 'observation' });
    }
    const meanEntry: FixitCase = {
      ...entry,
      complaint: { ...entry.complaint, measure: { ...entry.complaint.measure, kind: 'mean-wait' } },
    };

    /* ---- affordability and the budget notes, on states the reducers themselves build ---- */
    const empty = emptyFixitState();
    let spent = toggleRepair(entry, empty, 's-costly');
    spent = toggleExtra(entry, spent, 'tenant-notices');
    for (const state of [empty, spent]) {
      for (const repair of entry.repairs) {
        const row = repairRowOf(entry, state, repair);
        seeds.push({ field: `repair.${repair.id}.price`, text: row.priceLine, role: 'label' });
        if (row.refusal !== undefined) {
          seeds.push({ field: `repair.${repair.id}.refusal`, text: row.refusal, role: 'reason' });
        }
      }
      seeds.push({
        field: 'budget.note',
        text: budgetNoteOf(entry, spendOf(entry, state)),
        role: 'prose',
        provenance: 'authored',
      });
    }
    // The third note — over budget — is unreachable through the reducers by design (§ 10.2), so
    // it is worded against a fabricated spend, exactly as the outcome below is.
    seeds.push({
      field: 'budget.note.over',
      text: budgetNoteOf(entry, { repairUnits: 34, extraUnits: 0, editorUnits: 0, totalUnits: 34, machineryUnits: 34 }),
      role: 'prose',
      provenance: 'authored',
    });

    /* ---- the measured outcome, before = the comparison run, after = the case's own ---- */
    for (const [name, subject] of [
      ['long-waits', entry],
      ['mean-wait', meanEntry],
    ] as const) {
      const measurement = measuredOf(subject, context.comparisonRecording, context.recording);
      const outcome = classifyOutcome(subject, measurement, spendOf(subject, empty));
      seeds.push({ field: `outcome.${name}.head`, text: outcome.head, role: 'label', provenance: 'authored' });
      seeds.push({ field: `outcome.${name}.body`, text: outcome.body, role: 'prose', provenance: 'authored' });
      seeds.push({ field: `outcome.${name}.basis`, text: outcome.basis, role: 'reason', provenance: 'authored' });
      for (const [index, row] of outcome.rows.entries()) {
        const isMeanRow = name === 'mean-wait' && index === 0;
        seeds.push({
          field: `outcome.${name}.row[${String(index)}]`,
          text: `${row.label}: ${row.before} → ${row.after} · ${row.verdict}`,
          role: 'observation',
          // A scoped mean travels with the count it was taken over, one per side — issue #137's
          // rule, kept here by construction and declared so the search can hold it.
          ...(isMeanRow
            ? { declaredCount: measurement.scopeBoardedAfter, countShown: /\d/.test(row.after) }
            : {}),
        });
      }
    }

    /* ---- the three outcomes a green pair cannot produce, worded against fabricated measures ---- */
    const flat: FixitMeasurement = {
      complaintBefore: 10,
      complaintAfter: 1,
      scopeBoardedBefore: 40,
      scopeBoardedAfter: 40,
      complaintGonePct: 90,
      restAwayBeforePct: 95,
      restAwayAfterPct: 90,
      restBoardedBefore: 120,
      restBoardedAfter: 120,
      restDeltaPoints: -5,
    };
    const worse = classifyOutcome(entry, flat, spendOf(entry, empty));
    const short = classifyOutcome(
      entry,
      { ...flat, complaintGonePct: 30, restDeltaPoints: 0 },
      spendOf(entry, empty),
    );
    const over = classifyOutcome(entry, flat, {
      repairUnits: 34,
      extraUnits: 0,
      editorUnits: 0,
      totalUnits: 34,
      machineryUnits: 34,
    });
    for (const [name, outcome] of [
      ['worse', worse],
      ['short', short],
      ['over', over],
    ] as const) {
      seeds.push({ field: `outcome.${name}.head`, text: outcome.head, role: 'label', provenance: 'authored' });
      seeds.push({ field: `outcome.${name}.body`, text: outcome.body, role: 'prose', provenance: 'authored' });
    }

    /* ================================================================== *
     * The Everyday screen's own words — GAMEPLAY § 10's screen chrome.
     *
     * Everything above is the machinery both surfaces read; everything here is what
     * `everyday/fixitScreen.ts` draws around it, held pure in `fixitScreenModel.ts` precisely so
     * it can be driven here (the mount itself is DOM-bound and excluded, exactly as the Engineer
     * panel's is). The states are built by the engine's own reducers wherever a reducer can reach
     * them, on this adapter's established habit.
     * ================================================================== */

    /* ---- the case rail: both tags, and the derived {fixed}/{total} on both sides of solved ---- */
    for (const [where, solvedIds] of [
      ['none-solved', new Set<string>()],
      ['one-solved', new Set([entry.id])],
    ] as const) {
      const rail = fixitCaseRailModel([entry], solvedIds, entry.id, () =>
        buildingLineOf(context.buildingName, context.recording.floors.length),
      );
      seeds.push({ field: `rail.${where}.heading`, text: rail.heading, role: 'label', provenance: 'authored' });
      seeds.push({ field: `rail.${where}.hint`, text: rail.hint, role: 'prose', provenance: 'authored' });
      /*
       * `{fixed}/{total} fixed` is a count of the rows beside it, so it is an observation with its
       * own denominator on the face of it — the R13 shape, declared rather than left to the
       * property to infer.
       */
      seeds.push({
        field: `rail.${where}.count`,
        text: rail.count,
        role: 'observation',
        declaredCount: rail.rows.length,
        countShown: true,
      });
      for (const row of rail.rows) {
        seeds.push({ field: `rail.${where}.tag`, text: row.tag, role: 'label', provenance: 'authored' });
        seeds.push({ field: `rail.${where}.tower`, text: row.towerLine, role: 'observation' });
      }
    }

    /* ---- the § 3.3 substitutions, over all four states the screen can be in ---- */
    const barBase = actionBarFor({ screen: 'fixit', ctx: 'daily' });
    for (const [where, view] of [
      ['unready', { ready: false, running: false, ran: false, solved: false }],
      ['ready', { ready: true, running: false, ran: false, solved: false }],
      ['ran', { ready: true, running: false, ran: true, solved: false }],
      ['running', { ready: true, running: true, ran: false, solved: false }],
      ['solved', { ready: true, running: false, ran: true, solved: true }],
    ] as const) {
      const row = fixitBarModel(barBase, view);
      seeds.push({ field: `bar.${where}.primary`, text: row.primary.label, role: 'label', provenance: 'authored' });
      if (row.note !== undefined) {
        seeds.push({ field: `bar.${where}.note`, text: row.note, role: 'prose', provenance: 'authored' });
      }
      if (row.wayOut !== undefined && row.inverted) {
        seeds.push({ field: `bar.${where}.wayOut`, text: row.wayOut, role: 'label', provenance: 'authored' });
      }
    }

    /* ---- the § 9-priced steppers, at the budget and under it ---- */
    for (const [where, machineState, affordable] of [
      ['affordable', empty, true],
      ['at-budget', { ...empty, speedSteps: 1, capacitySteps: 1 }, false],
    ] as const) {
      for (const row of fixitMachineryRows(machineState, affordable, affordable)) {
        seeds.push({ field: `machines.${where}.${row.key}.label`, text: row.label, role: 'label', provenance: 'authored' });
        seeds.push({ field: `machines.${where}.${row.key}.readout`, text: row.readout, role: 'observation' });
        seeds.push({ field: `machines.${where}.${row.key}.priced`, text: row.priced, role: 'label' });
      }
    }

    /* ---- the running total's two lines, on states the reducers built ---- */
    for (const [where, state] of [
      ['nothing', empty],
      ['repairs', spent],
      ['machinery', stepSpeed(entry, empty, 1)],
    ] as const) {
      const summary = fixitSpendSummary(entry, spendOf(entry, state));
      seeds.push({ field: `spend.${where}.spent`, text: summary.spentLine, role: 'observation' });
      seeds.push({ field: `spend.${where}.committed`, text: summary.committedLine, role: 'observation' });
      seeds.push({ field: `spend.${where}.capital`, text: summary.capitalLine, role: 'observation' });
    }

    /* ---- the repair row's state word, all three arms ---- */
    for (const [where, row] of [
      ['selected', { selected: true, refusal: undefined }],
      ['affordable', { selected: false, refusal: undefined }],
      ['refused', { selected: false, refusal: repairRowOf(entry, spent, entry.repairs[3]!).refusal }],
    ] as const) {
      seeds.push({
        field: `repair.state.${where}`,
        text: fixitRepairStateLine(row),
        role: where === 'refused' ? 'reason' : 'label',
      });
    }

    return singleRun(this.id, seeds);
  },
};

/**
 * The Everyday rules editor — GAMEPLAY §11.5's when/then rows, their readbacks, lever lines,
 * refusals, and the stage header's rule-provenance words.
 *
 * Driven over the **whole declared vocabulary** rather than a sample: one row per condition and
 * one per action, so a template, a lever badge or a caveat added in `core` enters the corpus the
 * day it lands — the same posture the SELECTOR adapter takes over the detector's patterns. The
 * refusal arms manufacture each `ruleIssues` message the model can raise, because a refusal is
 * player copy in exactly the sense a caption is (§ D227: the refusal is the honest half of the
 * control).
 */
const RULES_EDITOR: SurfaceAdapter = {
  id: 'authoring/ruleSpec.ts#ruleIssues',
  covers: [
    'authoring/ruleSpec.ts#ruleIssues',
    'authoring/ruleSpec.ts#leverLineOf',
    'authoring/ruleSpec.ts#fallbackLineOf',
    'authoring/ruleSpec.ts#RULES_EXCLUSIVITY_NOTE',
    'authoring/ruleSpec.ts#ruleProvenanceName',
    'dev/selectorEditor.ts#rulesOverrideNoteOf',
  ],
  render(this: SurfaceAdapter) {
    const seeds: TextSeed[] = [];

    // One row per condition, cycling the actions; then one row per action, on a fixed condition
    // — so every template is substituted at least once and every lever line and caveat renders.
    const conditionRows: RuleRow[] = RULE_CONDITIONS.map((when, index) => {
      const then = RULE_ACTIONS[index % RULE_ACTIONS.length]!;
      return ruleRowOf(when, then);
    });
    const actionRows: RuleRow[] = RULE_ACTIONS.map((then) => ruleRowOf('call-waited', then));

    for (const row of [...conditionRows, ...actionRows]) {
      seeds.push({
        field: `readback.${row.when}.${row.then}`,
        text: `Reads as: ${readbackOf(row)}`,
        role: 'label',
      });
      seeds.push({ field: `lever.${row.when}.${row.then}`, text: leverLineOf(row), role: 'prose' });
    }

    // The provenance naming path — the pill's words for a rule arm, per condition.
    RULE_CONDITIONS.forEach((when, index) => {
      const words = RULE_CONDITION_WORDS[when];
      const value = words.values?.[0]?.value;
      const suffix = value === undefined ? '' : `:${String(value)}`;
      seeds.push({
        field: `provenance.${when}`,
        text: ruleProvenanceName(`rule-${String(index + 1)}:${when}${suffix}`) ?? '',
        role: 'label',
      });
    });

    // Every refusal the model can raise: the clockless time rule, the invalid pairing, the
    // duplicated static row, and the out-of-list value.
    const refusalArms: readonly (readonly [string, readonly RuleRow[], boolean])[] = [
      ['clockless', [ruleRowOf('time-before', 'hold-at-lobby')], false],
      ['pairing', [ruleRowOf('call-waited', 'no-new-pickups')], true],
      [
        'duplicate',
        [ruleRowOf('car-fuller-than', 'no-new-pickups'), ruleRowOf('car-fuller-than', 'no-new-pickups')],
        true,
      ],
      ['out-of-list', [{ when: 'call-waited', whenValue: 61, then: 'jump-queue' }], true],
    ];
    for (const [name, rows, hasClock] of refusalArms) {
      for (const [index, issue] of ruleIssues(rows, { hasClock }).entries()) {
        seeds.push({
          field: `${name}.issue[${String(index)}]`,
          text: issue.message,
          role: 'reason',
        });
      }
    }

    seeds.push({ field: 'fallback', text: fallbackLineOf('Steady hand'), role: 'label' });
    seeds.push({ field: 'exclusivity', text: RULES_EXCLUSIVITY_NOTE, role: 'prose' });
    // The switching panel's override note — both arms, because silence is the other claim.
    seeds.push({ field: 'override.some', text: rulesOverrideNoteOf(2), role: 'reason' });
    seeds.push({ field: 'override.none', text: rulesOverrideNoteOf(0), role: 'reason' });

    return singleRun(this.id, seeds);
  },
};

/**
 * The race strip and its ghost picker — GAMEPLAY §7.4, Everyday slice 4d.
 *
 * The ghost the strip is driven with is the context's own `comparisonRecording` — a real second
 * recording, exactly what the shipped ghost is (`dev/ghostRun.ts` swaps one field of the primary's
 * config) — so the verdict enters the corpus computed from two genuine runs rather than from
 * doctored percentages. Both of the strip's states are driven at every sampled playhead: racing,
 * and racing **nobody**, whose verdict slot carries the plain figure and whose note is empty (an
 * empty seed is dropped by `singleRun`, which is the correct rendering of *no note*).
 *
 * The verdict is `observation` — two shares of two runs at one instant — and it is driven on the
 * temporal axis, because it is derived from so-far observations and must never publish a
 * whole-run figure at a mid-run playhead. The footer is `reason`: it is the strip's standing
 * refusal of a comparative reading, R2's third narrowing exactly. The three wordings the sampled
 * pair may not happen to produce are driven through `raceVerdictOf` directly, at shares a player
 * produces by being ahead, behind, or unserved.
 *
 * `ghostPlanOf` is driven through the same shipped plan chain the shift adapter uses
 * (`shiftRunConfigOf` over `initialState`), in both speaking arms: the refusal when nothing is
 * saved (`NO_SAVED_DISPATCHER`), and the run arm whose label names the grey line.
 */
const RACE_STRIP: SurfaceAdapter = {
  id: 'live/raceStrip.ts#raceStripViewOf',
  covers: [
    'live/raceStrip.ts#GHOST_OPTIONS',
    'live/raceStrip.ts#RACE_FOOTER',
    'live/raceStrip.ts#SAME_CROWD_NOTE',
    'live/raceStrip.ts#RACE_PENDING',
    'live/raceStrip.ts#RACE_NOT_RUN',
    'live/raceStrip.ts#raceVerdictOf',
    'live/raceStrip.ts#raceStripViewOf',
    'dev/ghostRun.ts#NO_SAVED_DISPATCHER',
    'dev/ghostRun.ts#ghostPlanOf',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const { recording, comparisonRecording } = context;

    for (const option of GHOST_OPTIONS) {
      seeds.push({ field: `ghostOption(${option.id}).label`, text: option.label, role: 'label' });
      seeds.push({ field: `ghostOption(${option.id}).note`, text: option.note, role: 'prose' });
    }
    seeds.push({ field: 'race.pending', text: RACE_PENDING, role: 'prose' });
    seeds.push({ field: 'race.notRun', text: RACE_NOT_RUN, role: 'prose' });

    for (const at of sampleTimes(recording)) {
      const stamp = at.toFixed(0);
      const raced = raceStripViewOf({ recording, ghost: comparisonRecording, simTimeS: at });
      seeds.push({
        field: `race(@${stamp}s).verdict`,
        text: raced.verdict,
        role: 'observation',
        playhead: atPlayhead(recording, at),
      });
      seeds.push({ field: `race(@${stamp}s).note`, text: raced.note, role: 'prose' });
      seeds.push({ field: `race(@${stamp}s).footer`, text: raced.footer, role: 'reason' });
      const alone = raceStripViewOf({ recording, ghost: undefined, simTimeS: at });
      seeds.push({
        field: `race(nobody, @${stamp}s).verdict`,
        text: alone.verdict,
        role: 'observation',
        playhead: atPlayhead(recording, at),
      });
    }

    // The wordings the sampled pair may not produce, at shares a player can hold.
    seeds.push({ field: 'race.verdict(ahead)', text: raceVerdictOf(61.4, 52.2), role: 'observation' });
    seeds.push({ field: 'race.verdict(behind)', text: raceVerdictOf(52.2, 61.4), role: 'observation' });
    seeds.push({ field: 'race.verdict(unserved)', text: raceVerdictOf(undefined, undefined), role: 'reason' });

    // The picker's plan half, through the shipped chain — both speaking arms.
    const resources = browserResourcesOf(context);
    const plan = shiftRunConfigOf(resources, {
      ...initialState(resources, 1n),
      buildingId: context.case.buildingId,
      shiftLengthS: 300,
    });
    const refused = ghostPlanOf(resources, [], plan.config, 'latest-saved');
    if (refused.kind === 'refused') {
      seeds.push({ field: 'race.ghost(latest-saved).refusal', text: refused.reason, role: 'reason' });
    }
    const plain = ghostPlanOf(resources, [], plan.config, 'plain-baseline');
    if (plain.kind === 'run') {
      seeds.push({ field: 'race.ghost(plain-baseline).label', text: plain.label, role: 'label' });
    }
    return singleRun(this.id, seeds);
  },
};

/**
 * Watching somebody else's run — GAMEPLAY § 14.1, Everyday Mode slice 8.
 *
 * ## What is driven, and what the corpus is
 *
 * `watchingStrings(view)` — the **view's own** enumeration of everything it draws, which is also
 * what `view.test.ts` walks for the no-first-person rule. Reusing it rather than re-listing the
 * fields here is the point: two lists of *what a watched run says* is how one of them comes to omit
 * the cell somebody added, and this corpus and that rule would then disagree about which strings
 * exist.
 *
 * Both sources are driven — a day this device filed and a shipped reference run — because
 * `sourceLine` is the one cell that differs between them and it is § 20.11's disclaimer.
 *
 * ## Why the refusals are here too
 *
 * A row that cannot be watched says why, and those sentences are player-facing on exactly the
 * footing the header is. All three grounds are seeded: the day with no record, the record naming
 * something this build does not ship, and the reproduction refusal — the last one built from a real
 * drift rather than a literal, so the figures it names are the figures the derivation produces.
 *
 * ## Why the posted figures carry no playhead
 *
 * They are whole-run counts, and the temporal axis (§ D307) exists to catch a whole-run figure
 * published at a playhead short of `endedAt`. A watched run's posted result **is** a whole-run
 * claim, and it is licensed: it is the record's filed result, presented as such by
 * `POSTED_FIGURES_NOTE`, and it is never a reading of the replay at the instant on screen. So the
 * seeds carry no playhead and the note that makes them honest is seeded beside them.
 */
const WATCH: SurfaceAdapter = {
  id: 'watch/view.ts#watchingViewOf',
  covers: [
    'watch/view.ts#watchingViewOf',
    'watch/view.ts#postedFiguresOf',
    'watch/view.ts#REPLAY_PILL_VERB',
    'watch/view.ts#REFERENCE_RUN_LINE',
    'watch/view.ts#FILED_DAY_LINE',
    'watch/view.ts#STOP_WATCHING_LABEL',
    'watch/view.ts#PLAY_THIS_CROWD_LABEL',
    'watch/view.ts#POSTED_FIGURES_NOTE',
    'watch/library.ts#DAY_HAS_NO_RECORD',
    'watch/library.ts#refusalForDay',
    /*
     * `recordRefusalFor` composes no prose of its own — it joins `runIdentityIssues`' sentences,
     * which `SCOPE_REFUSALS` already sweeps — but it *is* the producer that puts them on a watching
     * surface, and the seed above renders one through `refusalForDay` in the wording a picker row
     * prints. Covered here rather than excluded, because the composition is the player-facing act.
     */
    'watch/record.ts#recordRefusalFor',
    'watch/reproduce.ts#reproductionRefusalFor',
    'watch/record.ts#recordUnreadableReason',
    /*
     * The shell's own spectator surfaces — `docs/20` defect 7. They are covered **here**, beside
     * the strip they contradicted, rather than in an adapter of their own: a reader auditing *what
     * a watched run says* has to see the race key, the rail's eyebrow, the footer's clause and the
     * report's note in the same corpus as `THEIR DISPATCHER`, because the defect was precisely that
     * the two halves of that sentence were written by modules that never met.
     */
    'watch/shell.ts#shellWatchingCopyOf',
    'watch/shell.ts#PLAYER_SHELL_COPY',
    'watch/shell.ts#RAIL_EYEBROW_PLAYER',
    'watch/shell.ts#RAIL_EYEBROW_WATCHING',
    'watch/shell.ts#RAIL_NOTE_PLAYER',
    'watch/shell.ts#RAIL_NOTE_WATCHING',
    'watch/shell.ts#footerSeedLineOf',
    'watch/shell.ts#reportNoteWhileWatching',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const posted = postedResultOf(context.recording);

    for (const source of ['filed-day', 'reference'] as const) {
      const run: WatchableRun = {
        id: `watch-${source}`,
        source,
        label: source === 'reference' ? 'The house baseline' : 'Tuesday \u00b7 day 2',
        buildingName: context.building.name,
        subtitle: 'day 2 of this week',
        record: null,
        posted,
        blocked: null,
      };
      const view = watchingViewOf(run, context.case.baselineProfileId);
      /*
       * Through the view's own enumeration, so a cell added to `WatchingView` enters this corpus
       * on the day it lands rather than on the day somebody remembers.
       */
      for (const [index, text] of watchingStrings(view).entries()) {
        seeds.push({ field: `watch(${source}).string[${String(index)}]`, text, role: 'label' });
      }
      seeds.push({ field: `watch(${source}).figuresNote`, text: view.figuresNote, role: 'reason' });
      /*
       * The shell's arm of the same view, through the shell module's own enumeration for
       * `watchingStrings`' stated reason — a surface added to `ShellWatchingCopy` with no line in
       * `shellWatchingStrings` is outside both this corpus and § 14.1's grep at once.
       */
      for (const [index, text] of shellWatchingStrings(shellWatchingCopyOf(view)).entries()) {
        if (text === '') continue;
        seeds.push({ field: `watch(${source}).shell[${String(index)}]`, text, role: 'label' });
      }
    }

    /*
     * The player's own arm as well, because it is what the shell says the rest of the time and it
     * is the arm whose disappearance would satisfy every no-first-person check in the tree.
     */
    for (const [index, text] of shellWatchingStrings(PLAYER_SHELL_COPY).entries()) {
      if (text === '') continue;
      seeds.push({ field: `watch.player.shell[${String(index)}]`, text, role: 'label' });
    }

    // The three grounds a row can lose its affordance on, each in the words the picker prints.
    seeds.push({ field: 'watch.blocked(no-record)', text: DAY_HAS_NO_RECORD, role: 'reason' });
    /*
     * And the fourth sentence a `no-record` row can carry — `docs/20` defect 1. A day whose record
     * was *refused* quotes the issue that refused it, so this seed carries a real scope message
     * rather than a literal: the wording a reader meets is the wrapper plus whatever
     * `runIdentityIssues` said, and seeding the wrapper alone would sweep half a sentence.
     */
    seeds.push({
      field: 'watch.blocked(refused)',
      text: refusalForDay(
        'the group levers are moved off their defaults, and a selection carries no levers',
      ),
      role: 'reason',
    });
    const unreadable = recordUnreadableReason(
      {
        version: 1,
        seed: '1',
        buildingId: 'no-such-tower',
        dispatcherId: context.case.baselineProfileId,
        pattern: 'building',
        demandTemplateId: null,
        arrivalRatePctPop5min: null,
        shiftLengthS: 900,
        windowStartS: null,
        day: 1,
        dayIdx: 0,
        outOfServiceCarIds: [],
        interventions: [],
        ruleRows: [],
      },
      browserResourcesOf(context),
    );
    if (unreadable !== null) {
      seeds.push({ field: 'watch.blocked(unreadable)', text: unreadable, role: 'reason' });
    }
    /*
     * A real drift rather than a literal pair, so the sentence names the figures the derivation
     * produces. Two of the four moved, which is also `listOf`'s two-item arm.
     */
    const drifted = reproductionRefusalFor(posted, {
      ...posted,
      carried: posted.carried + 4,
      worstWaitS: posted.worstWaitS + 11,
    });
    if (drifted !== null) {
      seeds.push({ field: 'watch.blocked(does-not-reproduce)', text: drifted, role: 'reason' });
    }
    return singleRun(this.id, seeds);
  },
};


/**
 * **The withheld matrix — ENGINE_CONTRACT § 12.2, driven from the state model rather than from
 * fixtures.**
 *
 * ## What this adapter is, and why it is a state sweep rather than a surface
 *
 * Every other adapter here drives one surface in the state the case produced. This one drives
 * **several surfaces in thirty-two states**, because the claim § 12.2 makes is about the states and
 * not about the surfaces: *"four independent reasons a figure is withheld … and they combine …
 * every combination renders `—` or a labelled unavailable state; none renders a zero, a spinner or
 * a stale figure."* `generate.ts#withheldStates` is the enumeration; this is what it is enumerated
 * *for*.
 *
 * The states are enumerated rather than drawn, so a case does not sample the matrix — it renders
 * all of it. Nothing here runs a simulation: every state is a projection of the case's own two
 * recordings, with the case's own run standing for the player's and the **candidate** run standing
 * for the stranger's, which is the only honest way to have two runs without paying for a third.
 *
 * ## Which of § 12.2's five surfaces exist in this tree, said rather than assumed
 *
 * `docs/18`'s precedent is that this audit corrects the plan, and two of the five named surfaces
 * are the prototype's rather than this shell's:
 *
 * | § 12.2 names | here |
 * |---|---|
 * | Your week | **exists** — `dev/leftRail.ts`'s week card: the three run figures, the seven-day sparkline, and `shift/weekLabel.ts#coachWeekLines`' ribbon |
 * | the report | **exists** — `dev/reportPanel.ts#emptyReportView`, the sheet's own account of why it is empty |
 * | the board | **exists, without a server** — `menu/screens.ts`'s leaderboard body over `menu/client.ts`'s types |
 * | the ladder | **does not exist** — a standing dispatcher rating is unbuilt; slice 4d omitted the ghost's *best* arm for the same reason (*"needs a rating that does not exist"*), and a sweep of a ladder would be a sweep of a screen nobody can open |
 * | the percentile line | **does not exist** — nothing in this tree computes *"better than 64 % of today's players"*: there is no world distribution, and `menu/client.ts` has no endpoint that would carry one |
 *
 * The two absences are named here rather than stubbed, on § 20.11's own rule about reference runs
 * and slice 4d's about the world band: a surface invented in order to be swept is a surface with no
 * reader, and the sweep would then certify it.
 *
 * ## What is marked withheld, and what deliberately is not
 *
 * A cell is marked when the state makes its figure **unavailable**, never merely unflattering:
 *
 * - *best day so far* under `day-not-closed` — a high-water mark over an empty history.
 * - *banked this scenario* under `sandbox` — a fraction whose denominator is a contract the week
 *   does not have.
 * - the sparkline's provisional bar under `watching` — the stage is showing a stranger's run, so
 *   there is no figure of the player's own to draw. **This is the one that was wrong**, and
 *   `dev/leftRail.ts#todayShareFor` is the fix.
 * - the empty sheet's title under `day-not-closed` or `watching`.
 * - the board's *Post this run* refusal under `no-post`, `watching` or `day-not-closed`.
 * - the leaderboard's first notice under `world-absent` — the slot § 16 rule 15 requires to carry a
 *   labelled unavailable state. Seeded as the empty string when the view produces no notice at all,
 *   because *nothing where the world figures were* is the defect that rule is about, and a cell the
 *   sweep never seeds is a cell the property cannot judge.
 *
 * **Not marked:** the sparkline's *so far* bar when the run on the stage is the player's own.
 * § 14's prototype shows `—` there until the day closes; this tree draws a provisional bar whose
 * title says *"so far"* in the same breath as the number, which is the same licence the temporal
 * axis grants (`properties.ts#NAMES_ITS_OWN_WINDOW`) and which `docs/18`'s framing lets the code
 * win. Also not marked: *clean days running* and *N clean shifts banked*, which are counts of
 * things that happened and are honestly zero.
 *
 * **Known limit, stated rather than discovered.** A row the view does **not** draw produces no
 * string, so *"no board row survives with no server"* is asserted where absences are assertable —
 * `menu/screens.ts`'s own tests — and not here. This instrument judges what a surface said.
 */
const WITHHELD_MATRIX: SurfaceAdapter = {
  id: 'dev/leftRail.ts#runFiguresOf',
  covers: [
    'dev/leftRail.ts#runFiguresOf',
    'dev/leftRail.ts#historyBarsOf',
    'shift/weekLabel.ts#coachWeekLines',
    'dev/reportPanel.ts#emptyReportView',
    'shift/banking.ts#bankingRefusalFor',
    'menu/account.ts#postingRefusal',
    'menu/screens.ts#screenOf',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const bundle = shiftBundleOf(context);
    const day = bundle.days[0];
    /* c8 ignore next -- `shiftBundleOf` always builds two days; this narrows the type. */
    if (day === undefined) return [];

    /* The player's own run, and the stranger's — the candidate arm, folded at its own end. */
    const ownShare = bundle.observations.minutePct;
    const watched = context.comparisonRecording;
    const watchedShare = shiftObservationsOf(observationsAt(watched, watched.endedAt)).minutePct;

    const catalogue = catalogueOf({
      buildings: context.buildings as unknown as CatalogueSource['buildings'],
      dispatcherProfiles: context.dispatcherProfiles,
      trafficProfiles: context.trafficProfiles,
    });
    const menuState = initialMenuState(catalogue);
    const player = {
      id: 'u1',
      email: 'p@example.test',
      displayName: 'A player',
      displayNameChosen: true,
    };

    for (const state of withheldStates()) {
      const at = `withheld(${state.id})`;
      const cell = (
        because: readonly string[],
        ifPublished: readonly string[],
      ): WithheldFigure => ({ state: state.id, because, ifPublished });

      /* ---- Your week: the card, the sparkline and the ribbon ---- */
      const contractId = state.sandbox ? FREE_PLAY_CONTRACT_ID : day.week.contractId;
      const week: WeekState = state.dayNotClosed
        ? openWeek(contractId)
        : { ...day.week, contractId };

      for (const [index, figure] of runFiguresOf(week).entries()) {
        const withheldHere =
          index === 1 && state.dayNotClosed
            ? cell(['day-not-closed'], [String(ownShare), String(watchedShare)])
            : index === 2 && state.sandbox
              ? cell(['sandbox'], [])
              : undefined;
        seeds.push({
          field: `${at}.week.figure(${figure.label})`,
          text: figure.value,
          role: withheldHere === undefined ? 'observation' : 'suppressed',
          ...(withheldHere === undefined ? {} : { withheld: withheldHere }),
        });
        seeds.push({
          field: `${at}.week.figure(${figure.label}).label`,
          text: figure.label,
          role: 'label',
        });
      }

      /*
       * The stage's own share, asked of the rail's decision rather than of the recording — the
       * whole point of `todayShareFor` is that *whose figure is this* is a decision and not a read.
       */
      const share = todayShareFor(state.watching, state.watching ? watchedShare : ownShare);
      const provisional = week.history.length === 0;
      for (const [index, bar] of historyBarsOf(week.history, share, week.dayIdx).entries()) {
        const withheldHere =
          provisional && state.watching ? cell(['watching'], [String(watchedShare)]) : undefined;
        seeds.push({
          field: `${at}.week.bar[${String(index)}].title`,
          text: bar.title,
          role: withheldHere === undefined ? 'observation' : 'suppressed',
          ...(withheldHere === undefined ? {} : { withheld: withheldHere }),
        });
      }

      const ribbon = coachWeekLines(week, context.case.durationS);
      seeds.push({ field: `${at}.week.ribbon.label`, text: ribbon.label, role: 'label' });
      seeds.push({
        field: `${at}.week.ribbon.progress`,
        text: ribbon.progress,
        role: state.sandbox ? 'suppressed' : 'observation',
        ...(state.sandbox ? { withheld: cell(['sandbox'], []) } : {}),
      });

      /* ---- The day's sheet ---- */
      const onScreen = state.watching ? watched : context.recording;
      const bankingRefusal = bankingRefusalFor(onScreen, context.recording);
      if (state.dayNotClosed || state.watching) {
        const refusal =
          bankingRefusal ?? (state.dayNotClosed ? UNCHOSEN_RUN_CANNOT_BANK : undefined);
        const sheet = emptyReportView({ refusal, fromPreviousSitting: false });
        seeds.push({
          field: `${at}.report.title`,
          text: sheet.title,
          role: 'suppressed',
          withheld: cell(
            state.watching ? ['watching'] : ['day-not-closed'],
            [String(ownShare), String(watchedShare)],
          ),
        });
        seeds.push({ field: `${at}.report.lede`, text: sheet.lede, role: 'reason' });
      }

      /* ---- The board: posting, and the world with nothing behind it ---- */
      const account = state.noPost ? SIGNED_OUT : signedIn(SIGNED_OUT, 'token', player);
      const refusalToPost = postingRefusal(account);
      const board = screenOf({
        state: { ...menuState, screen: 'leaderboard' },
        catalogue,
        canPost: !state.noPost,
        hasRun: !state.dayNotClosed,
        ...(refusalToPost === undefined ? {} : { postingRefusal: refusalToPost }),
        ...(state.watching && bankingRefusal !== null ? { rankingRefusal: bankingRefusal } : {}),
        /*
         * No `boards` and no `boardPage` with the API absent — the state issue #123 describes and
         * the one this build is permanently in. The other arm is a board that answered, which is
         * what `MENU` already drives; here it is the axis's second value rather than the default.
         */
        ...(state.worldAbsent ? {} : { boards: [{ configHash: 'abcdef0123456789', entries: 3 }] }),
      });
      const postRow = board.rows.find((row) => row.id === 'leaderboard.submit');
      const postRefused = state.noPost || state.dayNotClosed || state.watching;
      seeds.push({
        field: `${at}.board.submit.why`,
        text: postRow?.disabledWhy ?? '',
        role: postRefused ? 'suppressed' : 'label',
        ...(postRefused
          ? {
              withheld: cell(
                state.reasons.filter((reason) =>
                  ['no-post', 'day-not-closed', 'watching'].includes(reason),
                ),
                [],
              ),
            }
          : {}),
      });
      seeds.push({
        field: `${at}.board.worldFigures`,
        text: board.notices[0] ?? '',
        role: state.worldAbsent ? 'suppressed' : 'prose',
        ...(state.worldAbsent ? { withheld: cell(['world-absent'], []) } : {}),
      });
    }
    return singleRun(this.id, seeds);
  },
};

/** One rule row with each id's first declared value, for the adapter above. */
function ruleRowOf(when: RuleRow['when'], then: RuleRow['then']): RuleRow {
  const whenValue = RULE_CONDITION_WORDS[when].values?.[0]?.value;
  const thenValue = RULE_ACTION_WORDS[then].values?.[0]?.value;
  return {
    when,
    ...(whenValue === undefined ? {} : { whenValue }),
    then,
    ...(thenValue === undefined ? {} : { thenValue }),
  };
}

/**
 * **Everyday Mode's front door and frame** — the menu's four tiles, the rail with its footer, the
 * § 3.3 action-bar table, § 3.4's confirm strips, the per-screen refusals, and the register of
 * absences.
 *
 * ## Why this is in the corpus at all, and why it is the pure half only
 *
 * It is the first screen a player meets, and almost everything on it is a **claim about what this
 * build can do**: four tiles that say what each mode is and how long it takes, those of them that
 * refuse saying why, a rail whose rows carry the same kind of refusal, a bar whose every cell
 * promises what a control does, and a list headed *what this build does not do yet*. Those are
 * exactly the sentences that go stale — the roadmap's standing requirement is about a control that
 * says it writes nothing while writing something, and `docs/05`'s § D227 is about the mirror
 * image. A front door full of refusals nothing sweeps is that defect with a bigger audience.
 *
 * `everyday/shell.ts#mountEverydayShell` is **not** driven here and is excluded in
 * `derive.test.ts` on the DOM mounts' shared ground: it needs a document. The split is deliberate
 * and is the reason `modes.ts`, `rail.ts`, `actionBar.ts` and `screens.ts` are pure — the mount
 * draws what they decide, so driving them is driving the words. What the mount authors of its own
 * is the headings, the menu lede and the refusal screen's way-back line, which reach only the
 * static sweep, and that is a limitation rather than coverage.
 *
 * ## Why the rail is driven over every screen and every context
 *
 * `sublineFor` is a total function over `EVERYDAY_SCREENS × RUN_CONTEXTS` — both iterated from
 * the constants rather than restated, after a hand-written three-context loop here went stale the
 * day `watch` landed — and its whole job is to tell a player **where they are**. A subline that
 * says `MID-DAY` on the rush or `READING THE REPORT` at the front door is a false statement about
 * the player's own position, and the only way to know none of them does that is to ask for all of
 * them. The § 3.3 table is swept row for row on the same argument: every cell is a claim about
 * what a control does or costs, and the table is the one place the claims live.
 */
const EVERYDAY_MENU: SurfaceAdapter = {
  id: 'everyday/modes.ts#EVERYDAY_MODES',
  covers: [
    'everyday/modes.ts#EVERYDAY_MODES',
    'everyday/rail.ts#sublineFor',
    'everyday/rail.ts#railGroups',
    'everyday/rail.ts#railFooter',
    'everyday/rail.ts#railModel',
    'everyday/actionBar.ts#ACTION_BAR_ROWS',
    'everyday/actionBar.ts#actionBarFor',
    'everyday/actionBar.ts#confirmStripFor',
    'everyday/actionBar.ts#TIMELINE_STEPS',
    'everyday/screens.ts#UNBUILT_REASONS',
    'everyday/screens.ts#unbuiltReasonFor',
    'everyday/screens.ts#SCREEN_NAMES',
    'everyday/shell.ts#EVERYDAY_SHELL_ABSENCES',
    'everyday/host.ts#HOST_PENDING_REASON',
  ],
  render(context) {
    void context;
    const seeds: TextSeed[] = [];

    for (const mode of EVERYDAY_MODES) {
      seeds.push({ field: `mode.${mode.screen}.title`, text: mode.title, role: 'label' });
      seeds.push({ field: `mode.${mode.screen}.blurb`, text: mode.blurb, role: 'prose' });
      /*
       * § 5's session shape — *"~3 min · no losing"*. `role: 'prose'` rather than `estimate`: it is
       * a statement about how long a *player* spends, authored once and true of the mode, not a
       * figure any run produced. R13 asking it for an `n` would be asking the wrong question.
       */
      seeds.push({ field: `mode.${mode.screen}.shape`, text: mode.shape, role: 'prose' });
      if (mode.unavailable !== undefined) {
        // The refusal's own words, on the role the rules exempt from R3 — the whole point of a
        // refusal is that it may name what it is refusing.
        seeds.push({
          field: `mode.${mode.screen}.unavailable`,
          text: mode.unavailable,
          role: 'reason',
        });
      }
    }

    /* Every screen × every context, for the reason in the docstring. */
    for (const screen of EVERYDAY_SCREENS) {
      for (const ctx of RUN_CONTEXTS) {
        seeds.push({
          field: `rail.subline.${screen}.${ctx}`,
          text: sublineFor({ screen, ctx }),
          role: 'label',
        });
      }
    }

    /*
     * Both shapes of rail: outside a campaign, and inside one where the CAMPAIGN group appears —
     * with a placeholder building so the desk row (whose label *is* the building's name) is
     * present in the swept shape. Driving only the first shape would leave the campaign rows swept
     * by nothing, and they are rows that open screens which do not exist.
     */
    for (const inCampaign of [false, true]) {
      const model = railModel(
        { screen: 'menu', ctx: 'campaign' },
        inCampaign ? { inCampaign, openBuilding: '⟨building⟩' } : {},
      );
      const where = inCampaign ? 'in-campaign' : 'no-campaign';
      seeds.push({ field: `rail.${where}.brand`, text: model.brand, role: 'label' });
      seeds.push({ field: `rail.${where}.mode`, text: model.mode, role: 'label' });
      for (const group of model.groups) {
        seeds.push({ field: `rail.${where}.${group.title}`, text: group.title, role: 'label' });
        for (const item of group.items) {
          seeds.push({
            field: `rail.${where}.${group.title}.${item.screen}`,
            text: item.label,
            role: 'label',
          });
          if (item.unavailable !== undefined) {
            seeds.push({
              field: `rail.${where}.${group.title}.${item.screen}.unavailable`,
              text: item.unavailable,
              role: 'reason',
            });
          }
        }
      }
    }

    /*
     * § 3.2's footer, once — it does not vary by campaign shape. The identity card's streak line
     * is the honest-absence form (no profile store exists), which is exactly the kind of sentence
     * that goes stale the day one does.
     */
    const footer = railModel({ screen: 'menu', ctx: 'daily' }).footer;
    seeds.push({ field: 'rail.footer.playingAs', text: footer.identity.heading, role: 'label' });
    seeds.push({ field: 'rail.footer.name', text: footer.identity.name, role: 'label' });
    seeds.push({ field: 'rail.footer.streak', text: footer.identity.streak, role: 'reason' });
    seeds.push({ field: 'rail.footer.settings', text: footer.settings.label, role: 'label' });
    if (footer.settings.unavailable !== undefined) {
      seeds.push({
        field: 'rail.footer.settings.unavailable',
        text: footer.settings.unavailable,
        role: 'reason',
      });
    }
    /*
     * The swap row's label only. Its note — and the Engineer header's two words, which no rail
     * model carries — are the `ENGINEER_DOOR` adapter's; the row lost its `unavailable` arm when the
     * door was built, and a seed for a refusal that no longer exists would be this file claiming a
     * string the derivation cannot find.
     */
    seeds.push({ field: 'rail.footer.swap', text: footer.engineerSwap.label, role: 'label' });

    /*
     * § 3.3's table, row for row: every cell is a claim about a control. The `⟨…⟩` cells are the
     * guide's own state-dependent placeholders, swept as authored so a drift in the convention is
     * visible here too.
     */
    for (const row of ACTION_BAR_ROWS) {
      const key = row.ctx === undefined ? `bar.${row.screen}` : `bar.${row.screen}.${row.ctx}`;
      seeds.push({ field: `${key}.leave`, text: row.leave.label, role: 'label' });
      if (row.back !== undefined) {
        seeds.push({ field: `${key}.back`, text: row.back.label, role: 'label' });
      }
      for (const [index, variant] of row.primary.variants.entries()) {
        seeds.push({ field: `${key}.primary.${String(index)}`, text: variant, role: 'label' });
      }
      if (row.note !== undefined) {
        seeds.push({ field: `${key}.note`, text: row.note, role: 'prose' });
      }
      for (const [index, variant] of (row.noteVariants ?? []).entries()) {
        seeds.push({ field: `${key}.note.${String(index)}`, text: variant, role: 'prose' });
      }
      if (row.wayOut !== undefined) {
        seeds.push({ field: `${key}.wayOut`, text: row.wayOut, role: 'label' });
      }
    }
    for (const [flow, stops] of Object.entries(TIMELINE_STEPS)) {
      for (const stop of stops) {
        seeds.push({
          field: `bar.timeline.${flow}.${stop.screen}`,
          text: stop.label,
          role: 'label',
        });
      }
    }

    /* § 3.4's strips — the daily/campaign pair and the rush pair; `watch` never warns. */
    for (const ctx of RUN_CONTEXTS) {
      const strip = confirmStripFor(ctx);
      if (strip === undefined) continue;
      seeds.push({ field: `bar.confirm.${ctx}.question`, text: strip.question, role: 'prose' });
      seeds.push({
        field: `bar.confirm.${ctx}.consequence`,
        text: strip.consequence,
        role: 'prose',
      });
      seeds.push({ field: `bar.confirm.${ctx}.leave`, text: strip.leaveLabel, role: 'label' });
      seeds.push({ field: `bar.confirm.${ctx}.stay`, text: strip.stayLabel, role: 'label' });
    }

    /*
     * The per-screen refusals and § 4 names, from the registry: the router's refusal screen, the
     * rail captions and the bar's refusing note all quote these, so they are swept at the source.
     */
    for (const screen of EVERYDAY_SCREENS) {
      seeds.push({ field: `screen.${screen}.name`, text: SCREEN_NAMES[screen], role: 'label' });
      const reason = UNBUILT_REASONS[screen];
      if (reason !== undefined) {
        seeds.push({ field: `screen.${screen}.unbuilt`, text: reason, role: 'reason' });
      }
    }

    for (const [index, absence] of EVERYDAY_SHELL_ABSENCES.entries()) {
      seeds.push({ field: `absence.${String(index)}`, text: absence, role: 'reason' });
    }

    /*
     * The shell's one boot-order sentence: a registered screen entered before `dev/main.ts` has
     * published the data host. A refusal about a screen, so the role the rules give a refusal —
     * and swept at its source in `host.ts`, where it is pure, exactly like the registry's
     * per-screen sentences above.
     */
    seeds.push({ field: 'host.pending', text: HOST_PENDING_REASON, role: 'reason' });

    return singleRun(this.id, seeds);
  },
};

/**
 * **Everyday Mode's settings screen** — GAMEPLAY § 15.1, the words half.
 *
 * ## Why a settings panel belongs in a corpus about honesty
 *
 * Almost every string on it is a claim about a **control**: what a row does, where a name is
 * shown, what this device keeps, and — for six of § 15.1's rows — why the control is not there at
 * all. That is the roadmap's standing requirement in its most literal form: a control that says
 * it writes nothing while writing something, and § D227's mirror image, a refusal standing over a
 * seam that works. The register in {@link SETTINGS_ABSENCES} is six such refusals in one array,
 * and a refusal nothing sweeps is exactly the sentence that goes stale the day somebody wires the
 * seam it refuses about.
 *
 * ## What is driven, and the one state that is not a fixture
 *
 * Every state the pure view distinguishes, iterated rather than sampled: no stored profile and a
 * stored one, a name the display-name rule takes and one it refuses, a write that survived the tab
 * and one that did not, and **all three** values of the Engineer bridge — reduced, full, and
 * *absent*. The third is the honest one to insist on: while `dev/main.ts` is still booting there is
 * no switch to write, so the screen draws a sentence in the row's place, and that sentence is a
 * claim about a control that does not exist yet. A sweep that only ever saw the two flipped states
 * would never read it.
 *
 * `everyday/settingsScreen.ts#SETTINGS_SCREEN` is **not** driven here and is excluded in
 * `derive.test.ts` on the DOM mounts' shared ground — it needs a document — which is the same
 * pure/DOM split `EVERYDAY_MENU` describes for the shell. What that mount authors of its own is
 * geometry and two class names, not sentences.
 */
const EVERYDAY_SETTINGS: SurfaceAdapter = {
  id: 'everyday/settingsView.ts#settingsScreenViewOf',
  covers: [
    'everyday/settingsView.ts#settingsScreenViewOf',
    'everyday/settingsView.ts#SETTINGS_ABSENCES',
    /*
     * `everyday/types.ts#ENGINEER_SWAP_REFUSAL` used to be claimed here, reached through the
     * register above. The row it refused about is built, so the refusal is deleted and the register
     * is six entries rather than seven; the swap's words are the `ENGINEER_DOOR` adapter's now.
     */
  ],
  render(context) {
    void context;
    const seeds: TextSeed[] = [];

    const stored = { name: 'A player', avatarColor: AVATAR_SWATCHES[2].color };
    const cases = [
      ['fresh', { profile: undefined, reduceMotion: false }],
      ['named', { profile: stored, reduceMotion: false }],
      ['reduced', { profile: stored, reduceMotion: true }],
      /* The still-booting window: the Motion row's absence rather than the row. */
      ['booting', { profile: stored, reduceMotion: undefined }],
      /* A refused draft — `menu/account.ts`'s sentence, drawn beside the field. */
      ['refused-name', { profile: stored, draftName: 'x', reduceMotion: false }],
      /* A store that keeps nothing: the profile is real for this tab and says so. */
      ['not-durable', { profile: stored, durable: false, reduceMotion: false }],
    ] as const;

    for (const [label, input] of cases) {
      const view = settingsScreenViewOf(input);
      seeds.push({ field: `${label}.eyebrow`, text: view.eyebrow, role: 'label' });
      seeds.push({ field: `${label}.title`, text: view.title, role: 'label' });
      seeds.push({ field: `${label}.lede`, text: view.lede, role: 'prose' });

      seeds.push({ field: `${label}.you.heading`, text: view.you.heading, role: 'label' });
      seeds.push({ field: `${label}.you.nameLabel`, text: view.you.nameLabel, role: 'label' });
      seeds.push({ field: `${label}.you.name`, text: view.you.nameValue, role: 'label' });
      seeds.push({ field: `${label}.you.pictureLabel`, text: view.you.pictureLabel, role: 'label' });
      seeds.push({ field: `${label}.you.note`, text: view.you.note, role: 'prose' });
      seeds.push({ field: `${label}.you.home`, text: view.you.home, role: 'prose' });
      if (view.you.nameIssue !== undefined) {
        seeds.push({ field: `${label}.you.nameIssue`, text: view.you.nameIssue, role: 'reason' });
      }
      if (view.you.saveNotice !== undefined) {
        seeds.push({ field: `${label}.you.saveNotice`, text: view.you.saveNotice, role: 'reason' });
      }

      seeds.push({ field: `${label}.playing.heading`, text: view.playing.heading, role: 'label' });
      for (const row of view.playing.rows) {
        seeds.push({ field: `${label}.playing.${row.id}.label`, text: row.label, role: 'label' });
        /* The § 16 register: one clause saying what the row does. */
        seeds.push({ field: `${label}.playing.${row.id}.note`, text: row.note, role: 'prose' });
        seeds.push({ field: `${label}.playing.${row.id}.value`, text: row.value, role: 'label' });
      }
      if (view.playing.absentNote !== undefined) {
        seeds.push({
          field: `${label}.playing.absent`,
          text: view.playing.absentNote,
          role: 'reason',
        });
      }

      seeds.push({ field: `${label}.device.heading`, text: view.device.heading, role: 'label' });
      for (const [index, fact] of view.device.facts.entries()) {
        const at = `${label}.device.${String(index)}`;
        seeds.push({ field: `${at}.label`, text: fact.label, role: 'label' });
        seeds.push({ field: `${at}.value`, text: fact.value, role: 'label' });
        seeds.push({ field: `${at}.note`, text: fact.note, role: 'prose' });
      }

      seeds.push({
        field: `${label}.absences.heading`,
        text: view.absences.heading,
        role: 'label',
      });
      for (const [index, entry] of view.absences.entries.entries()) {
        seeds.push({ field: `${label}.absence.${String(index)}`, text: entry, role: 'reason' });
      }
    }

    return singleRun(this.id, seeds);
  },
};

/**
 * **GAMEPLAY § 8's three campaign screens** — the triage list, the building desk and the contract
 * sheet, driven over every state their pure half distinguishes.
 *
 * ## Why this surface is worth driving rather than sampling
 *
 * These screens are almost entirely **derived claims**: a record (`17 cleared · 1 missed`), a purse
 * ledger, a wear head, a renewal priced off a clear rate, a rolling calendar whose columns and cells
 * must come from one array, and a shop in which every tier states why it may not be bought. Each is
 * an observation with a denominator on the face of it, which is R13's shape, and each is derived
 * from `campaign/economy.ts` — so the honest failure mode here is not a wrong sentence but a right
 * sentence about a figure nothing measured.
 *
 * Two of those are drawn as **refusals** and both are seeded as reasons rather than labels: the trip
 * budget's *was* figure, which this simulator does not record, and § 8.8's offers, which need a
 * complexity the contract publishes for six buildings and a week switch these screens do not reach.
 * A refusal nothing sweeps is the sentence that goes stale the day somebody wires the seam it
 * refuses about — which is § D227, and is why `CAMPAIGN_ABSENCES` is here too.
 *
 * ## The states, iterated rather than picked
 *
 * A first day with nothing bought; a two-tower career in its second month with a renewal due and a
 * wear clock past its head; a month with works booked and a buy half-made; and a run on the stage,
 * so the four tests grade rather than sit pending. `everyday/campaignScreens.ts` is **not** driven
 * here and is excluded in `derive.test.ts` on the DOM mounts' shared ground — it needs a document,
 * and what it authors of its own is geometry and class names.
 */
const EVERYDAY_CAMPAIGN: SurfaceAdapter = {
  id: 'everyday/campaignModel.ts#towersView',
  covers: [
    'everyday/campaignModel.ts#towersView',
    'everyday/campaignModel.ts#buildingView',
    'everyday/campaignModel.ts#contractView',
    'everyday/campaignModel.ts#calendarView',
    'everyday/campaignModel.ts#campaignTestRows',
    'everyday/campaignModel.ts#campaignTestGoals',
    'everyday/campaignModel.ts#testsHeldLine',
    'everyday/campaignModel.ts#careerStageLabel',
    'everyday/campaignModel.ts#recordLine',
    'everyday/campaignModel.ts#TOWERS_COPY',
    'everyday/campaignModel.ts#BUILDING_COPY',
    'everyday/campaignModel.ts#CONTRACT_COPY',
    'everyday/campaignModel.ts#WEAR_HEADS',
    'everyday/campaignModel.ts#TEST_TENSIONS',
    'everyday/campaignModel.ts#TRIPS_REFUSAL',
    'everyday/campaignModel.ts#CALENDAR_LEGEND',
    'everyday/campaignModel.ts#MONTH_LEGEND',
    /* Reached through the three views above: every figure they print is one of these. */
    'campaign/economy.ts#SHOP',
    'campaign/economy.ts#SLOTS',
    'campaign/economy.ts#DIFFICULTIES',
    'campaign/economy.ts#shopTierState',
    'campaign/economy.ts#worksDayLine',
    'campaign/economy.ts#purseOf',
    'campaign/economy.ts#shopTotalUnits',
    'campaign/economy.ts#shopCategoryById',
    'campaign/economy.ts#shopTierAt',
    'campaign/economy.ts#slotsOpen',
    'campaign/economy.ts#nextSlot',
    'campaign/economy.ts#COMPLEXITY',
    'campaign/economy.ts#complexityOf',
    'campaign/economy.ts#earnedSoFar',
    'campaign/economy.ts#carriedIn',
    'campaign/economy.ts#atRiskTowers',
    'campaign/economy.ts#contractIsLost',
    'everyday/campaignModel.ts#CALENDAR_GLYPHS',
    'campaign/career.ts#BUILD_IDS',
    'campaign/career.ts#applyCampaignAction',
    /* The record and its decisions — every option the desk offers is authored here. */
    'campaign/career.ts#CAMPAIGN_ABSENCES',
    'campaign/career.ts#needOf',
    'campaign/career.ts#nextLineOf',
    'campaign/career.ts#BUILD_LABELS',
    'campaign/career.ts#openingCareer',
    'campaign/career.ts#freshTower',
    'campaign/career.ts#quirkOf',
  ],
  render(context) {
    void context;
    const seeds: TextSeed[] = [];

    const buildings = new Map([
      ['garden-apartments', { name: 'Garden Apartments', spec: '7 floors · 2 cars · 0.63 m/s · 240 people' }],
      ['chancery-house', { name: 'Chancery House', spec: '20 floors · 6 cars · 5 m/s · 612 people' }],
    ]);
    const dispatchers = [
      { id: 'eta', name: 'Minimum estimated wait', note: undefined, saved: false },
      { id: 'mine', name: 'Morning Shift v3', note: undefined, saved: true },
    ];

    const first = openingCareer('eta');
    const worn: CampaignTower = {
      ...freshTower({ contractId: 'c6', buildingId: 'chancery-house', dispatcherId: 'mine', rate: 4 }),
      day: 19,
      missed: 1,
      months: 2,
      trips: 41_000,
    };
    const second: CampaignCareer = { ...first, today: 24, towers: [...first.towers, worn] };
    const spending: CampaignCareer = {
      ...first,
      towers: [{ ...first.towers[0]!, day: 6, carry: 120 }],
    };
    const booked = applyCampaignAction(
      applyCampaignAction(spending, {
        kind: 'press-tier',
        towerId: 'c1',
        categoryId: 'machines',
        level: 1,
      }),
      { kind: 'pick-start', startIdx: 11 },
    );
    const pending = applyCampaignAction(spending, {
      kind: 'press-tier',
      towerId: 'c1',
      categoryId: 'doors',
      level: 2,
    });
    /* A run on the stage, so the three measurable tests grade rather than sit pending. */
    const observations: GoalObservations = {
      arrived: 400,
      carryPct: 97,
      minutePct: 80,
      peakQueue: 21,
      abandoned: 0,
      worstWaitS: 164,
      worstWaitIsCensored: false,
    };

    const cases: readonly (readonly [string, CampaignCareer, GoalObservations | undefined])[] = [
      ['first-day', first, undefined],
      ['second-month', { ...second, openTowerId: 'c6' }, observations],
      ['booked', booked, observations],
      ['picking-a-night', pending, undefined],
    ];

    for (const [label, career, observed] of cases) {
      const input = {
        career,
        buildings,
        dispatchers,
        observations: observed,
        history: [],
      } as const;

      const towers = towersView(input);
      seeds.push({ field: `${label}.towers.title`, text: towers.title, role: 'label' });
      seeds.push({ field: `${label}.towers.stage`, text: towers.stagePill, role: 'label' });
      seeds.push({ field: `${label}.towers.meta`, text: towers.meta, role: 'observation' });
      seeds.push({ field: `${label}.towers.lede`, text: towers.lede, role: 'prose' });
      seeds.push({ field: `${label}.towers.standing.note`, text: towers.standing.note, role: 'prose' });
      seeds.push({ field: `${label}.towers.standing.value`, text: towers.standing.value, role: 'observation' });
      for (const slot of towers.standing.slots) {
        seeds.push({ field: `${label}.towers.slot.${slot.heading}.tag`, text: slot.tag, role: 'label' });
        seeds.push({ field: `${label}.towers.slot.${slot.heading}.note`, text: slot.note, role: 'prose' });
      }
      for (const stat of towers.stats) {
        seeds.push({
          field: `${label}.towers.stat.${stat.label}`,
          text: stat.value,
          role: 'observation',
        });
        seeds.push({ field: `${label}.towers.stat.${stat.label}.note`, text: stat.note, role: 'prose' });
      }
      seeds.push({ field: `${label}.towers.calendar.note`, text: towers.calendar.note, role: 'prose' });
      for (const entry of towers.calendar.legend) {
        seeds.push({ field: `${label}.towers.legend.${entry.label}`, text: entry.label, role: 'label' });
      }
      for (const row of towers.calendar.rows) {
        /* One tooltip per row is enough: they are one sentence with a day substituted. */
        const cell = row.cells.find((entry) => entry.mark !== 'blank') ?? row.cells[0];
        if (cell !== undefined) {
          seeds.push({ field: `${label}.towers.calendar.${row.towerId}.tip`, text: cell.tip, role: 'label' });
        }
      }
      for (const heading of towers.headings) {
        seeds.push({ field: `${label}.towers.head.${heading}`, text: heading, role: 'label' });
      }
      for (const row of towers.rows) {
        const at = `${label}.towers.row.${row.towerId}`;
        seeds.push({ field: `${at}.spec`, text: row.spec, role: 'observation' });
        seeds.push({ field: `${at}.quirk`, text: row.quirk, role: 'prose' });
        seeds.push({ field: `${at}.terms`, text: row.terms, role: 'observation' });
        seeds.push({ field: `${at}.day`, text: row.day, role: 'observation' });
        /* `N cleared · M missed` is a record with both halves on its face — the R13 shape. */
        seeds.push({ field: `${at}.record`, text: row.record, role: 'observation' });
        seeds.push({ field: `${at}.wear`, text: row.wear, role: 'observation' });
        seeds.push({ field: `${at}.order.note`, text: row.order.note, role: 'prose' });
        for (const build of row.order.builds) {
          seeds.push({ field: `${at}.build.${build.id}`, text: build.label, role: 'label' });
        }
        seeds.push({ field: `${at}.status`, text: row.status, role: 'label' });
        seeds.push({ field: `${at}.statusSub`, text: row.statusSub, role: 'prose' });
        seeds.push({ field: `${at}.cta`, text: row.cta, role: 'label' });
      }
      seeds.push({
        field: `${label}.towers.footer`,
        text: towers.footer,
        role: 'observation',
        declaredCount: towers.rows.length,
      });
      seeds.push({ field: `${label}.towers.offers`, text: towers.offers.refusal, role: 'reason' });
      seeds.push({ field: `${label}.towers.lately`, text: towers.lately.refusal, role: 'reason' });
      seeds.push({ field: `${label}.towers.lately.sub`, text: towers.lately.sub, role: 'prose' });
      seeds.push({ field: `${label}.towers.footnote`, text: towers.oddsFootnote, role: 'prose' });
      for (const [index, entry] of towers.absences.entries.entries()) {
        seeds.push({ field: `${label}.towers.absence.${String(index)}`, text: entry, role: 'reason' });
      }

      const desk = buildingView(input);
      if (desk !== undefined) {
        seeds.push({ field: `${label}.desk.name`, text: desk.name, role: 'label' });
        seeds.push({ field: `${label}.desk.spec`, text: desk.spec, role: 'observation' });
        seeds.push({ field: `${label}.desk.state`, text: desk.statePill, role: 'label' });
        if (desk.need !== undefined) {
          seeds.push({ field: `${label}.desk.need.allowance`, text: desk.need.allowance, role: 'observation' });
          seeds.push({ field: `${label}.desk.need.due`, text: desk.need.due, role: 'label' });
          seeds.push({ field: `${label}.desk.need.title`, text: desk.need.title, role: 'label' });
          seeds.push({ field: `${label}.desk.need.brief`, text: desk.need.brief, role: 'prose' });
          if (desk.need.offer !== undefined) {
            seeds.push({ field: `${label}.desk.offer.rate`, text: desk.need.offer.rate, role: 'observation' });
            seeds.push({ field: `${label}.desk.offer.head`, text: desk.need.offer.head, role: 'prose' });
            seeds.push({ field: `${label}.desk.offer.why`, text: desk.need.offer.why, role: 'prose' });
          }
        }
        if (desk.options !== undefined) {
          seeds.push({ field: `${label}.desk.options.note`, text: desk.options.note, role: 'prose' });
          seeds.push({ field: `${label}.desk.options.purse`, text: desk.options.purse, role: 'observation' });
          for (const option of desk.options.rows) {
            const at = `${label}.desk.option.${option.id}`;
            seeds.push({ field: `${at}.label`, text: option.label, role: 'label' });
            seeds.push({ field: `${at}.cost`, text: option.cost, role: option.affordable ? 'label' : 'reason' });
            seeds.push({ field: `${at}.when`, text: option.when, role: 'label' });
            seeds.push({ field: `${at}.effect`, text: option.effect, role: 'prose' });
          }
        }
        if (desk.quiet !== undefined) {
          seeds.push({ field: `${label}.desk.quiet.heading`, text: desk.quiet.heading, role: 'label' });
          seeds.push({ field: `${label}.desk.quiet.body`, text: desk.quiet.body, role: 'prose' });
          seeds.push({ field: `${label}.desk.quiet.next`, text: desk.quiet.next, role: 'prose' });
        }
        seeds.push({ field: `${label}.desk.order.sub`, text: desk.order.sub, role: 'prose' });
        seeds.push({ field: `${label}.desk.order.note`, text: desk.order.view.note, role: 'prose' });
        for (const row of desk.fitted.rows) {
          seeds.push({ field: `${label}.desk.fitted.${row.categoryId}`, text: row.label, role: 'label' });
          seeds.push({ field: `${label}.desk.fitted.${row.categoryId}.level`, text: row.level, role: 'observation' });
        }
        seeds.push({ field: `${label}.desk.purse.onHand`, text: desk.purse.onHand, role: 'observation' });
        seeds.push({ field: `${label}.desk.purse.note`, text: desk.purse.note, role: 'prose' });
        seeds.push({ field: `${label}.desk.purse.link`, text: desk.purse.link, role: 'label' });
        seeds.push({ field: `${label}.desk.quirk`, text: desk.quirk.text, role: 'prose' });
        seeds.push({ field: `${label}.desk.quirk.sub`, text: desk.quirk.sub, role: 'prose' });
        seeds.push({ field: `${label}.desk.condition.head`, text: desk.condition.head, role: 'label' });
        seeds.push({ field: `${label}.desk.condition.trips`, text: desk.condition.trips, role: 'observation' });
        seeds.push({ field: `${label}.desk.condition.note`, text: desk.condition.note, role: 'prose' });
        seeds.push({ field: `${label}.desk.rate.now`, text: desk.odds.now, role: 'observation' });
        seeds.push({ field: `${label}.desk.rate.note`, text: desk.odds.note, role: 'prose' });
        seeds.push({ field: `${label}.desk.temporary`, text: desk.temporary.body, role: 'reason' });
        seeds.push({ field: `${label}.desk.month.day`, text: desk.month.day, role: 'observation' });
        seeds.push({ field: `${label}.desk.month.cleared`, text: desk.month.cleared, role: 'observation' });
        seeds.push({ field: `${label}.desk.month.missed`, text: desk.month.missed, role: 'observation' });
        seeds.push({ field: `${label}.desk.tests.eyebrow`, text: desk.tests.eyebrow, role: 'label' });
        seeds.push({ field: `${label}.desk.tests.note`, text: desk.tests.note, role: 'prose' });
        seeds.push({ field: `${label}.desk.tests.held`, text: desk.tests.held, role: 'observation' });
        for (const row of desk.tests.rows) {
          const at = `${label}.desk.test.${row.id}`;
          seeds.push({ field: `${at}.label`, text: row.label, role: 'label' });
          seeds.push({ field: `${at}.target`, text: row.target, role: 'label' });
          seeds.push({ field: `${at}.was`, text: row.was, role: 'observation' });
          seeds.push({ field: `${at}.tension`, text: row.tension, role: 'prose' });
          if (row.reading !== undefined) {
            seeds.push({ field: `${at}.reading`, text: row.reading.display, role: 'observation' });
          }
          if (row.refusal !== undefined) {
            seeds.push({ field: `${at}.refusal`, text: row.refusal, role: 'reason' });
          }
        }
      }

      const sheet = contractView(input);
      if (sheet !== undefined) {
        seeds.push({ field: `${label}.contract.title`, text: sheet.title, role: 'label' });
        seeds.push({ field: `${label}.contract.meta`, text: sheet.meta, role: 'observation' });
        seeds.push({ field: `${label}.contract.lede`, text: sheet.lede, role: 'prose' });
        seeds.push({ field: `${label}.contract.difficulty.note`, text: sheet.difficulty.note, role: 'prose' });
        seeds.push({ field: `${label}.contract.difficulty.footer`, text: sheet.difficulty.footer, role: 'prose' });
        for (const entry of sheet.difficulty.buttons) {
          seeds.push({ field: `${label}.contract.difficulty.${entry.id}`, text: entry.label, role: 'label' });
        }
        seeds.push({ field: `${label}.contract.month.note`, text: sheet.month.note, role: 'observation' });
        for (const head of sheet.month.heads) {
          seeds.push({ field: `${label}.contract.head.${head}`, text: head, role: 'label' });
        }
        const cell = sheet.month.weeks[0]?.cells[0];
        if (cell !== undefined) {
          seeds.push({ field: `${label}.contract.month.tip`, text: cell.tip, role: 'label' });
        }
        if (sheet.month.prompt !== undefined) {
          seeds.push({ field: `${label}.contract.month.prompt`, text: sheet.month.prompt, role: 'prose' });
          seeds.push({ field: `${label}.contract.month.cancel`, text: sheet.month.cancel, role: 'label' });
        }
        for (const entry of sheet.month.booked) {
          seeds.push({ field: `${label}.contract.booked.${entry.name}`, text: entry.when, role: 'observation' });
        }
        if (sheet.month.worksCost !== undefined) {
          seeds.push({ field: `${label}.contract.worksCost`, text: sheet.month.worksCost, role: 'observation' });
        }
        for (const entry of sheet.month.legend) {
          seeds.push({ field: `${label}.contract.legend.${entry}`, text: entry, role: 'label' });
        }
        seeds.push({ field: `${label}.contract.purse.onHand`, text: sheet.purse.onHand, role: 'observation' });
        seeds.push({ field: `${label}.contract.purse.note`, text: sheet.purse.note, role: 'observation' });
        for (const week of sheet.purse.weeks) {
          seeds.push({ field: `${label}.contract.purse.${week.label}`, text: week.value, role: 'observation' });
          seeds.push({ field: `${label}.contract.purse.${week.label}.note`, text: week.note, role: 'label' });
        }
        seeds.push({ field: `${label}.contract.rate.now`, text: sheet.purse.oddsNow, role: 'observation' });
        seeds.push({ field: `${label}.contract.rate.after`, text: sheet.purse.oddsAfter, role: 'observation' });
        seeds.push({ field: `${label}.contract.rate.note`, text: sheet.purse.oddsNote, role: 'prose' });
        seeds.push({ field: `${label}.contract.purse.total`, text: sheet.purse.totalNote, role: 'prose' });
        seeds.push({ field: `${label}.contract.purse.carry`, text: sheet.purse.carryNote, role: 'prose' });
        seeds.push({ field: `${label}.contract.purse.kit`, text: sheet.purse.kitNote, role: 'prose' });
        seeds.push({ field: `${label}.contract.tests.conflict`, text: sheet.tests.conflict, role: 'prose' });
        seeds.push({ field: `${label}.contract.shop.eyebrow`, text: sheet.shop.eyebrow, role: 'label' });
        seeds.push({ field: `${label}.contract.shop.sub`, text: sheet.shop.sub, role: 'prose' });
        for (const category of sheet.shop.categories) {
          const at = `${label}.contract.shop.${category.id}`;
          seeds.push({ field: `${at}.name`, text: category.name, role: 'label' });
          seeds.push({ field: `${at}.sub`, text: category.sub, role: 'prose' });
          seeds.push({ field: `${at}.owned`, text: category.owned, role: 'observation' });
          for (const row of category.rows) {
            const tier = `${at}.${row.levelLabel}`;
            seeds.push({ field: `${tier}.name`, text: row.name, role: 'label' });
            seeds.push({ field: `${tier}.cost`, text: row.cost, role: 'observation' });
            seeds.push({ field: `${tier}.effect`, text: row.effect, role: 'prose' });
            seeds.push({
              field: `${tier}.state`,
              text: row.state,
              role: row.pressable ? 'observation' : 'reason',
            });
          }
        }
        seeds.push({ field: `${label}.contract.terms.heading`, text: sheet.terms.heading, role: 'label' });
        for (const row of sheet.terms.rows) {
          seeds.push({ field: `${label}.contract.term.${row.label}`, text: row.label, role: 'label' });
          seeds.push({ field: `${label}.contract.term.${row.label}.got`, text: row.got, role: 'observation' });
        }
        seeds.push({ field: `${label}.contract.shaft.heading`, text: sheet.shaft.heading, role: 'label' });
        seeds.push({ field: `${label}.contract.shaft.body`, text: sheet.shaft.body, role: 'prose' });
        seeds.push({ field: `${label}.contract.shaft.body2`, text: sheet.shaft.body2, role: 'prose' });
      }
    }

    return singleRun(this.id, seeds);
  },
};

/**
 * The dispatcher editor's family controls — `docs/21` § 3.6, `dev/familyControls.ts`.
 *
 * What is new here and not already in `CONTROLS` is the **frame** around the generated controls:
 * the block titles, the per-block *Read by …* line naming the non-test caller, the status count,
 * the sentence about the two dimensions that live on a flag instead, and the override notes that
 * say a control below is outranked by a switch above. The controls themselves are `CONTROLS`'s and
 * are not re-seeded here; what is seeded is what this panel adds.
 *
 * Driven over four states rather than one, because three of the strings only exist in some of them:
 * a profile with no zoning draws no zoning override, a profile with a dwell chip pressed draws
 * three, and the gate reason on `dispatch.passengerAssignment` only appears while the destination
 * flag is off. The refusal is seeded as a constant because it is drawn by the register's own node
 * (`unauthorableBlocksOf` → `UNAUTHORABLE_COPY`) rather than by the block's view — one string, one
 * author, two readers.
 *
 * Appended last, per the fault-ordering rule stated at `SHIFT_REPORT`.
 */
const FAMILY_CONTROLS: SurfaceAdapter = {
  id: 'dev/familyControls.ts#familyControlsViewOf',
  covers: [
    'dev/familyControls.ts#familyControlsViewOf',
    'dev/familyControls.ts#familyOverridesOf',
    'dev/familyControls.ts#familyPartitionOf',
    'dev/familyControls.ts#FAMILY_TITLES',
    'dev/familyControls.ts#FAMILY_CALLERS',
    'dev/familyControls.ts#FAMILY_DIMENSIONS',
    'dev/familyControls.ts#FAMILY_EYEBROW',
    'dev/familyControls.ts#FAMILY_NOTE',
    'dev/familyControls.ts#FAMILY_ELSEWHERE',
    'dev/familyControls.ts#FLAG_OWNED',
    'dev/familyControls.ts#SELECTION_REFUSAL',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const space = context.space;

    /*
     * The refusal, and the two sentences that are true of the panel however it is configured. Each
     * is seeded once — a constant repeated per profile would put thirteen copies of one sentence in
     * front of R13's frequency clause and say nothing new about any of them.
     */
    seeds.push({ field: 'SELECTION_REFUSAL', text: SELECTION_REFUSAL, role: 'reason' });
    seeds.push({ field: 'FAMILY_NOTE', text: FAMILY_NOTE, role: 'prose' });
    seeds.push({ field: 'FAMILY_ELSEWHERE', text: FAMILY_ELSEWHERE, role: 'reason' });
    seeds.push({ field: 'FAMILY_EYEBROW', text: FAMILY_EYEBROW, role: 'label' });
    for (const id of FLAG_OWNED) {
      seeds.push({ field: `FLAG_OWNED.${id}`, text: id, role: 'label', provenance: 'schema' });
    }
    /*
     * The partition, as words. `unaccounted` is what the block would have to say if a schema row
     * landed in no family — it is empty on every shipped tree and is seeded anyway, because the
     * sentence a surface prints when something is missing is exactly the one nobody drives.
     */
    const partition = familyPartitionOf(space);
    seeds.push({
      field: 'familyPartitionOf.unaccounted',
      text:
        partition.unaccounted.length === 0
          ? ''
          : `${String(partition.unaccounted.length)} declared dimensions are drawn by no control: ${partition.unaccounted.join(', ')}`,
      role: 'reason',
    });

    const states: readonly {
      readonly label: string;
      readonly profileId: string;
      readonly levers: typeof DEFAULT_LEVERS;
      readonly zone: boolean;
    }[] = [
      { label: 'as-authored', profileId: '', levers: DEFAULT_LEVERS, zone: false },
      { label: 'zoned', profileId: '', levers: DEFAULT_LEVERS, zone: true },
      {
        label: 'dwell-pressed',
        profileId: '',
        levers: { ...DEFAULT_LEVERS, dwell: DWELL_CHOICES[0] },
        zone: false,
      },
      {
        label: 'parked',
        profileId: '',
        levers: { ...DEFAULT_LEVERS, parking: true },
        zone: false,
      },
    ];

    for (const profile of context.profiles) {
      const base = profile as unknown as Parameters<typeof specFromProfile>[0];
      const read = specFromProfile(base, base.name);
      for (const state of states) {
        const spec: DispatcherSpec = {
          ...read,
          families: {},
          flags: { ...read.flags, zone: state.zone || read.flags.zone },
        };
        const draft = profileFromSpec(spec, { id: 'honesty', base, levers: state.levers });
        const view = familyControlsViewOf({
          space,
          spec,
          levers: state.levers,
          draft,
          base,
        });
        const at = `${base.id}.${state.label}`;
        seeds.push({ field: `${at}.status`, text: view.status, role: 'observation' });
        for (const block of view.blocks) {
          seeds.push({ field: `${at}.${block.family}.title`, text: block.title, role: 'label' });
          /*
           * The caller line is the panel's own claim about the code — *this block is read by X* —
           * so it is an observation rather than a label. If it ever names something that is not a
           * caller, that is a false statement on a player-facing surface and it belongs in front of
           * the same properties every other claim here does.
           */
          seeds.push({
            field: `${at}.${block.family}.caller`,
            text: block.caller,
            role: 'observation',
          });
          for (const row of block.rows) {
            if (row.overriddenBy === undefined) continue;
            seeds.push({
              field: `${at}.${block.family}.${row.control.id}.overriddenBy`,
              text: row.overriddenBy,
              role: 'reason',
            });
          }
        }
      }
    }

    return singleRun(this.id, seeds);
  },
};

/**
 * **GAMEPLAY § 7's stage** — Everyday Mode's own day screen, in the corpus.
 *
 * ## Why the whole header is driven at sampled playheads rather than once
 *
 * The three § 7.1 figures are folds *at the playhead*, and the temporal axis (§ D300's E-4,
 * § D307) is the property that exists because two surfaces published a whole-run figure at a
 * part-way one. So every figure below carries {@link atPlayhead}, and the sampling is
 * `sampleTimes`' — the same instants every other playhead-driven surface is asked at, so a
 * violation on this screen is comparable with one on the canvas.
 *
 * Both arms of each figure are driven where the arms exist: *away inside a minute* refuses before
 * anybody has boarded (R13's rule — a share of nothing is not 100 %) and carries its `n` after,
 * and *the longest anybody has stood* says `and counting` while its maximum belongs to somebody
 * still standing. Sampling only the middle of a run would drive neither.
 *
 * ## What is seeded that a reader might not expect
 *
 * The **refusals**, all of them, on `role: 'reason'`: the intervention control's three grounds, the
 * § 3.3 primary's three, and the ghost lane's. A refusal is the class of sentence this repository
 * has twice found stale (§ D227), and the corpus is where a stale one is caught.
 *
 * `stageInkFor` and `STAGE_BAND_INK` are **covered without being seeded**, and that is a true claim
 * rather than a gap: they answer in `#RRGGBB`, not in words, and `stageLegend()` — which is seeded —
 * reads both. What a reader reads off the ramp is the legend's four plain-words rungs, and those are
 * `live/bands.ts`' own `legendLabel`s, driven here for the first time on a paper-mode surface.
 *
 * `everyday/stageScreen.ts#STAGE_SCREEN` is **not** driven and is excluded in `derive.test.ts` on
 * the DOM mounts' shared ground — it needs a document, a canvas and an animation frame. The split
 * is the point: everything the screen *says* is here, and what the mount authors of its own is
 * geometry, class names and two static captions.
 */
const EVERYDAY_STAGE: SurfaceAdapter = {
  id: 'everyday/stageScreenModel.ts#stageHeaderOf',
  covers: [
    'everyday/stageScreenModel.ts#stageHeaderOf',
    'everyday/stageScreenModel.ts#stageAlarmOf',
    'everyday/stageScreenModel.ts#stageInterventionsOf',
    'everyday/stageScreenModel.ts#stageBarModelOf',
    'everyday/stageScreenModel.ts#stageCrowdCapOf',
    'everyday/stageScreenModel.ts#stageLegend',
    'everyday/stageScreenModel.ts#stageInkFor',
    'everyday/stageScreenModel.ts#STAGE_BAND_INK',
    'everyday/stageScreenModel.ts#STAGE_ABSENCES',
    'everyday/stageScreenModel.ts#STAGE_INTERVENTIONS',
    'everyday/stageScreenModel.ts#STAGE_NO_GHOST',
    'everyday/stageScreenModel.ts#STAGE_NO_PHASE',
    'everyday/stageScreenModel.ts#STAGE_RECOMPUTING',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const { recording } = context;
    const floorLabelOf = (id: string): string =>
      recording.floors.find((floor) => floor.id === id)?.label ?? id;

    for (const rung of stageLegend()) {
      seeds.push({ field: `stage.legend.${rung.id}`, text: rung.label, role: 'label' });
      /* Covered, not seeded — a hex is not a sentence. Called so the claim in `covers` is true. */
      void stageInkFor(rung.id === 'breezy' ? 1 : 200);
    }
    for (const absence of STAGE_ABSENCES) {
      seeds.push({ field: 'stage.absence', text: absence, role: 'reason' });
    }
    for (const arm of STAGE_INTERVENTIONS) {
      seeds.push({
        field: `stage.intervene.${arm.change.kind}.label`,
        text: arm.label,
        role: 'label',
      });
      seeds.push({
        field: `stage.intervene.${arm.change.kind}.explains`,
        text: arm.explains,
        role: 'prose',
      });
    }
    seeds.push({ field: 'stage.race.noGhost', text: STAGE_NO_GHOST, role: 'reason' });

    /* § 14's overflow chip — the one string `stageCrowdCapOf` produces. */
    const capped = stageCrowdCapOf(412);
    if (capped.overflow !== undefined) {
      seeds.push({ field: 'stage.landing.overflow', text: capped.overflow, role: 'label' });
    }

    for (const at of sampleTimes(recording)) {
      const stamp = at.toFixed(0);
      const observations = observationsAt(recording, at);
      const head = stageHeaderOf({
        simTimeS: at,
        recording,
        observations,
        driverName: 'the plain baseline',
      });
      seeds.push({
        field: `stage(@${stamp}s).clock`,
        text: head.clock,
        role: 'label',
        playhead: atPlayhead(recording, at),
      });
      seeds.push({ field: `stage(@${stamp}s).phase`, text: head.phase, role: 'label' });
      seeds.push({ field: `stage(@${stamp}s).driving`, text: head.drivingLabel, role: 'label' });
      for (const figure of head.figures) {
        seeds.push({ field: `stage(@${stamp}s).figure.label`, text: figure.label, role: 'label' });
        seeds.push({
          field: `stage(@${stamp}s).figure(${figure.label}).value`,
          text: figure.value,
          role: 'observation',
          /* R13: a ratio's `n` sits in its own box, and a count is its own `n`. */
          countShown: figure.count !== undefined,
          playhead: atPlayhead(recording, at),
        });
        if (figure.count !== undefined) {
          seeds.push({
            field: `stage(@${stamp}s).figure(${figure.label}).count`,
            text: figure.count,
            role: 'label',
            playhead: atPlayhead(recording, at),
          });
        }
        if (figure.refusal !== undefined) {
          seeds.push({
            field: `stage(@${stamp}s).figure(${figure.label}).refusal`,
            text: figure.refusal,
            role: 'reason',
          });
        }
      }

      const alarm = stageAlarmOf(observations, floorLabelOf);
      if (alarm !== undefined) {
        seeds.push({
          field: `stage(@${stamp}s).alarm`,
          text: alarm,
          role: 'observation',
          playhead: atPlayhead(recording, at),
        });
      }

      const stamped = stageInterventionsOf({
        interventions: [{ atS: recording.startedAt, change: { kind: 'park-cars-lobby' } }],
        simTimeS: at,
        hasRun: true,
        dayClosed: false,
        recomputing: false,
      });
      if (stamped.stamp !== '') {
        seeds.push({
          field: `stage(@${stamp}s).intervene.stamp`,
          text: stamped.stamp,
          role: 'observation',
          playhead: atPlayhead(recording, at),
        });
      }
    }

    /* Every refusal both controls can produce, on the states the sampling above cannot reach. */
    const interventionStates = [
      ['no-run', { hasRun: false, dayClosed: false, recomputing: false }],
      ['filed', { hasRun: true, dayClosed: true, recomputing: false }],
      ['recomputing', { hasRun: true, dayClosed: false, recomputing: true }],
    ] as const;
    for (const [label, flags] of interventionStates) {
      const view = stageInterventionsOf({
        interventions: [],
        simTimeS: recording.startedAt,
        ...flags,
      });
      if (view.refusal !== undefined) {
        seeds.push({ field: `stage.intervene(${label}).refusal`, text: view.refusal, role: 'reason' });
      }
      const bar = stageBarModelOf({ screen: 'stage', ctx: 'daily' }, flags);
      if (bar.note !== undefined) {
        seeds.push({ field: `stage.bar(${label}).note`, text: bar.note, role: 'reason' });
      }
      seeds.push({ field: `stage.bar(${label}).primary`, text: bar.primary.label, role: 'label' });
    }
    seeds.push({ field: 'stage.recomputing', text: STAGE_RECOMPUTING, role: 'prose' });

    return singleRun(this.id, seeds);
  },
};

/**
 * **LIVE METRICS, as a card** — `docs/21` § 3.4, and the adapter that moved rather than appeared.
 *
 * ## What this drives, and what used to drive it
 *
 * The panel's strings were swept through `CANVAS`, by capturing `drawOverlay`'s `fillText` calls
 * into an array. That worked and it cost the corpus something it could not get back: a captured
 * array has no per-string provenance, so a violation could be reported against *the fifteenth
 * `fillText` of the panel at 340 s* and nothing more. Every string is a **named field** of
 * `overlayViewOf`'s view now — `estimate.head`, `banks[2].mean`, `cars[0].load` — so a finding
 * names the row rather than an index into a draw order.
 *
 * The `role` split is what the array could not carry either: an observation is a `label`, a
 * refusal is a `reason`, and R6's structural half can only read a basis off a seed that has one.
 * Both refusal strings carry `metrics.suppressionBasis`, which is the producer's own reading of its
 * clock (`docs/20` defect 3) rather than a comparison made here.
 *
 * ## Both registers, at every sampled playhead
 *
 * Unchanged from the loop this replaces, and for `honesty/types.ts#HONESTY_MODES`' stated reason:
 * *the value of generating the axis is the day a mode-aware renderer lands*. The panel's Casual
 * words include the one string on this surface that may never be wrong — the refusal — so a mode
 * only half the cases draw is half a screen the search never sees.
 *
 * ## What is **not** driven here, and why that is honest
 *
 * `dev/main.ts#drawLiveMetrics` — the card's DOM half — is excluded on the DOM mounts' shared
 * ground in `derive.test.ts`. It needs a document, and the pure/DOM split exists precisely so that
 * every word is drivable without one: the mount decides which node a string goes in and authors
 * none of them.
 *
 * Appended at the end of {@link SURFACE_ADAPTERS}, per the fault-ordering rule stated at
 * `SHIFT_REPORT`: `faults.ts` corrupts the **first** string matching a shape, and this surface
 * re-renders phrases the canvas adapter also draws.
 */
const LIVE_METRICS: SurfaceAdapter = {
  id: 'render/overlay.ts#overlayViewOf',
  covers: [
    'render/overlay.ts#overlayViewOf',
    'render/overlay.ts#ENGINEER_WORDS',
    'render/overlay.ts#CASUAL_WORDS',
    /*
     * The panel's refusal, in both registers — `docs/20` defect 3. `overlayViewOf` is their only
     * caller, this adapter is what drives it, and the seeds below render `casualRefusalFor` under
     * its own field so R6's structural half can read the basis it returns. `SUPPRESSION_REASON_
     * PENDING` is the engineer's arm of the same gate, worded by the same function.
     */
    'mode/disclosure.ts#casualRefusalFor',
    'mode/disclosure.ts#CASUAL_REFUSAL_REASON',
    'mode/disclosure.ts#CASUAL_REFUSAL_REASON_SO_FAR',
    'mode/disclosure.ts#SUPPRESSION_REASON_PENDING',
    /* The four load bands, as names. The card draws one per car row; `loadColour` is the stage's
       projection of the same judgement and is covered by `CANVAS`. */
    'render/overlay.ts#loadTone',
  ],
  render(context) {
    const { recording } = context;
    const seeds: TextSeed[] = [];
    for (const at of sampleTimes(recording)) {
      const bundle = context.bundleAt(at);
      for (const mode of VIEW_MODES) {
        const view = overlayViewOf(bundle.metrics, bundle.frame, mode);
        const where = `${mode}@${at.toFixed(0)}s`;
        seeds.push({
          field: `overlayViewOf(${where}).title`,
          text: view.title,
          role: 'label',
          playhead: atPlayhead(recording, at),
        });
        seeds.push({
          field: `overlayViewOf(${where}).window`,
          text: view.window,
          role: 'label',
          playhead: atPlayhead(recording, at),
        });
        for (const [index, row] of view.observations.entries()) {
          const at_ = `overlayViewOf(${where}).observations[${String(index)}]`;
          seeds.push({
            field: `${at_}.label`,
            text: row.label,
            role: 'label',
            playhead: atPlayhead(recording, at),
          });
          /*
           * The value goes in as its own seed rather than joined to the label, and that is R13's
           * shape rather than tidiness: a figure the search can see is a figure it can ask *what
           * is this a count of* about. `waiting now 70` as one string is one prose blob.
           */
          seeds.push({
            field: `${at_}.value`,
            text: `${row.label} ${row.value}`,
            role: 'prose',
            playhead: atPlayhead(recording, at),
          });
        }
        const estimate = view.estimate;
        seeds.push({
          field: `overlayViewOf(${where}).estimate.label`,
          text: estimate.label,
          role: 'label',
          playhead: atPlayhead(recording, at),
        });
        if (estimate.kind === 'refused') {
          seeds.push({
            field: `overlayViewOf(${where}).estimate.head`,
            text: estimate.head,
            role: 'reason',
            playhead: atPlayhead(recording, at, estimate.basis),
          });
          seeds.push({
            field: `overlayViewOf(${where}).estimate.reason`,
            text: estimate.reason,
            role: 'reason',
            playhead: atPlayhead(recording, at, estimate.basis),
          });
        } else {
          seeds.push({
            field: `overlayViewOf(${where}).estimate.value`,
            text: `${estimate.label} ${estimate.value}`,
            role: 'prose',
            playhead: atPlayhead(recording, at),
          });
        }
        seeds.push({
          field: `overlayViewOf(${where}).bankHeading`,
          text: view.bankHeading,
          role: 'label',
          playhead: atPlayhead(recording, at),
        });
        if (view.banksEmpty !== undefined) {
          seeds.push({
            field: `overlayViewOf(${where}).banksEmpty`,
            text: view.banksEmpty,
            role: 'reason',
            playhead: atPlayhead(recording, at),
          });
        }
        for (const [index, bank] of view.banks.entries()) {
          seeds.push({
            field: `overlayViewOf(${where}).banks[${String(index)}]`,
            text: `${bank.bankId} ${bank.boarded} ${bank.mean}`,
            role: bank.refused ? 'reason' : 'prose',
            playhead: atPlayhead(recording, at),
          });
        }
        seeds.push({
          field: `overlayViewOf(${where}).carHeading`,
          text: view.carHeading,
          role: 'label',
          playhead: atPlayhead(recording, at),
        });
        for (const [index, car] of view.cars.entries()) {
          seeds.push({
            field: `overlayViewOf(${where}).cars[${String(index)}]`,
            text: `${car.label} ${car.load}`,
            role: 'prose',
            playhead: atPlayhead(recording, at),
          });
        }
      }
    }
    return singleRun(this.id, seeds);
  },
};

/* -------------------------------------------------------------------------- *
 * The gauntlet and the ladder — GAMEPLAY § 14, § 20.10, contract § 12.3
 * -------------------------------------------------------------------------- */

/**
 * **The forty proof cases, the rating they produce, and the ladder that shows it.**
 *
 * ## Why this belongs in a corpus about honesty more than most surfaces do
 *
 * A ladder rating is the only **standing public claim** this product makes about a dispatcher —
 * every other figure is a fact about one run, said once and gone. R2 is the rule it lives closest
 * to (*"a score is a property of a run, never of a dispatcher"*), and a rating is deliberately a
 * property of a dispatcher, made admissible only by the two sentences drawn beside it: what it is a
 * mean of ({@link RATING_BASIS}) and what a gap between two rows is not ({@link RATING_CAVEAT}).
 * Those two are exactly the sentences whose absence R13 and R2 exist to catch, so the rating figure
 * is seeded as an `estimate` carrying its own `n` — the `proof cases` column beside it — and the
 * search may ask R13's question of it directly.
 *
 * The refusals matter for the same reason one level down: § 20.10's gate (*"a dirty dispatcher
 * cannot be sent, and the button says why"*), a cancelled gauntlet's *"nothing is rated"*, the
 * unrated and *edited since* row states, the empty table, and § 12.2's labelled absence where the
 * daily board's server would be. Each is a claim about what this build will not do, which is the
 * class § D227 records going stale.
 *
 * ## The proof set is synthetic here, and the shipped one is validated at the door
 *
 * `FIXIT`'s precedent exactly: the authored halves are synthetic (two towers over the context's own
 * buildings, two crowd shapes with placeholder labels) and the shipped `data/proof-cases.json` is
 * refused at load by `parseProofCases`, whose refusals `gauntlet/proofCases.test.ts` drives. What
 * this adapter drives is the machinery that wraps the document — and the placeholders are
 * deliberate a second time: `gauntlet/proofCases.test.ts` asserts that no module under
 * `packages/viz/src` contains a shipped tower name or crowd label, and this file is inside that
 * scope.
 *
 * ## The gauntlet runs against a worker double, which is the only way it speaks at all
 *
 * `runGauntlet`'s player-facing strings are its progress line and its two stop reasons, and all
 * three exist only while forty simulations are in flight. The double answers each `postMessage`
 * synchronously from the context's own finished batch, so the progress line, the finished rating,
 * the failed-case refusal and the cancellation are every one of them rendered from a real
 * `BatchResult` rather than from a fixture.
 */
const GAUNTLET: SurfaceAdapter = {
  id: 'gauntlet/ladder.ts#ladderRowsOf',
  covers: [
    'gauntlet/ladder.ts#ladderRowsOf',
    'gauntlet/ladder.ts#sendGateOf',
    'gauntlet/ladder.ts#whatAreTheFortyOf',
    'gauntlet/ladder.ts#caseNameOf',
    'gauntlet/ladder.ts#caseNamesOf',
    'gauntlet/ladder.ts#REFERENCE_RUN_LABEL',
    'gauntlet/ladder.ts#LADDER_EMPTY',
    'gauntlet/ladder.ts#LADDER_WORLD_ABSENCE',
    'gauntlet/rating.ts#RATING_BASIS',
    'gauntlet/rating.ts#RATING_CAVEAT',
    'gauntlet/rating.ts#ratingFigureOf',
    'gauntlet/rating.ts#proofCaseCountOf',
    // Driven through `runGauntlet`, which folds every case through them before it finishes.
    'gauntlet/rating.ts#ratedCaseOf',
    'gauntlet/rating.ts#proofCaseScoreOf',
    'gauntlet/proofCases.ts#proofCasesOf',
    'gauntlet/proofCases.ts#proofCaseRequestOf',
    'gauntlet/run.ts#runGauntlet',
    'gauntlet/run.ts#GAUNTLET_CANCELLED',
    // The board screen's own two string tables; its `mount` is excluded on the mounts' ground.
    'everyday/boardScreen.ts#BOARD_SCREEN_COPY',
    'everyday/boardScreen.ts#DAILY_BOARD_ABSENCE',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const towers = context.buildings.slice(0, 2);
    /*
     * Placeholder labels, in the `⟨…⟩` register this corpus already uses for a substituted cell.
     * A shipped crowd label here would be the second copy of the fixture list that
     * `gauntlet/proofCases.ts` exists to prevent, in the file that checks for it.
     */
    const set: ProofCaseSet = {
      version: 1,
      towers: towers.map((building, index) => ({
        id: building.id,
        arrivalRatePctPop5min: 1 + index,
        why: '⟨why this building is in the set⟩',
      })),
      crowds: [
        {
          id: 'shape-a',
          label: '⟨first crowd shape⟩',
          tests: '⟨what the first shape tests⟩',
          durationS: 900,
          demand: { directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 } },
        },
        {
          id: 'shape-b',
          label: '⟨second crowd shape⟩',
          tests: '⟨what the second shape tests⟩',
          durationS: 900,
          demand: { directionalSplit: { incoming: 0, outgoing: 1, interfloor: 0 } },
        },
      ],
    };
    const nameOf = (towerId: string): string =>
      towers.find((building) => building.id === towerId)?.name ?? towerId;

    /* § 14.2's disclosure — every building, every shape, and the closing arithmetic. */
    const forty = whatAreTheFortyOf(set, (towerId) => {
      const building = towers.find((candidate) => candidate.id === towerId);
      const lifts = building?.banks.reduce((count, bank) => count + bank.cars.length, 0) ?? 0;
      return {
        name: nameOf(towerId),
        spec: `${String(building?.floors.length ?? 0)} floors · ${String(lifts)} lifts`,
      };
    });
    seeds.push({ field: 'forty.heading', text: forty.heading, role: 'label' });
    for (const [index, tower] of forty.towers.entries()) {
      seeds.push({ field: `forty.tower.${String(index)}.name`, text: tower.name, role: 'label' });
      seeds.push({ field: `forty.tower.${String(index)}.spec`, text: tower.spec, role: 'label' });
      seeds.push({ field: `forty.tower.${String(index)}.why`, text: tower.why, role: 'prose' });
    }
    for (const [index, crowd] of forty.crowds.entries()) {
      seeds.push({ field: `forty.crowd.${String(index)}.label`, text: crowd.label, role: 'label' });
      seeds.push({ field: `forty.crowd.${String(index)}.tests`, text: crowd.tests, role: 'prose' });
    }
    seeds.push({ field: 'forty.arithmetic', text: forty.arithmetic, role: 'prose' });
    seeds.push({ field: 'forty.basis', text: forty.basis, role: 'prose' });
    /* The caveat is a refusal to name a winner, which is R2's own exemption. */
    seeds.push({ field: 'forty.caveat', text: forty.caveat, role: 'reason' });

    /* § 20.10's gate, all three states — nothing open, an unsaved edit, and a saved dispatcher. */
    for (const [key, candidate] of [
      ['none', undefined],
      ['dirty', { dispatcherId: 'candidate', dispatcherName: '⟨dispatcher⟩', dirty: true }],
      ['saved', { dispatcherId: 'candidate', dispatcherName: '⟨dispatcher⟩', dirty: false }],
    ] as const) {
      const gate = sendGateOf(candidate);
      seeds.push({ field: `send.${key}.label`, text: gate.label, role: 'label' });
      if (gate.refusal !== null) {
        seeds.push({ field: `send.${key}.refusal`, text: gate.refusal, role: 'reason' });
      }
    }

    /*
     * The forty themselves, three ways: finished, failed at the first case, and cancelled. The
     * double answers synchronously from the context's own batch, so every figure below came out of
     * a real run rather than out of this file.
     */
    const workerOf = (message: BatchWorkerMessage): (() => GauntletWorker) => {
      return () => {
        let handler: ((event: { data: unknown }) => void) | undefined;
        return {
          postMessage: () => {
            handler?.({ data: message });
          },
          terminate: () => {},
          addEventListener: (type: string, listener: unknown) => {
            if (type === 'message') handler = listener as (event: { data: unknown }) => void;
          },
        } as GauntletWorker;
      };
    };

    let finished: RatingSummary | undefined;
    const progressLines: string[] = [];
    runGauntlet({
      set,
      dispatcherProfileId: context.batch.arms[0]?.dispatcherProfileId ?? 'collective',
      replications: 1,
      towerNameOf: nameOf,
      createWorker: workerOf({ kind: 'done', result: context.batch }),
      onProgress: (progress) => progressLines.push(progress.line),
      onFinished: (summary) => {
        finished = summary;
      },
      onStopped: () => {},
    });
    for (const [index, line] of progressLines.entries()) {
      seeds.push({ field: `run.progress.${String(index)}`, text: line, role: 'label' });
    }

    for (const [key, message] of [
      ['failed', { kind: 'failed', message: '⟨what the worker said⟩' } as const],
    ] as const) {
      runGauntlet({
        set,
        dispatcherProfileId: 'collective',
        replications: 1,
        towerNameOf: nameOf,
        createWorker: workerOf(message),
        onProgress: () => {},
        onFinished: () => {},
        onStopped: (reason) => {
          seeds.push({ field: `run.${key}`, text: reason, role: 'reason' });
        },
      });
    }
    seeds.push({ field: 'run.cancelled', text: GAUNTLET_CANCELLED, role: 'reason' });

    /*
     * The table. Three rows: a reference run with a complete rating, the same dispatcher after an
     * edit (`edited since`), and one that has never run (`unrated`). Every state § 14 names.
     */
    const names = caseNamesOf(set, nameOf);
    const entries: LadderEntry[] = [];
    if (finished !== undefined) {
      entries.push({
        dispatcherId: 'reference',
        dispatcherName: '⟨reference dispatcher⟩',
        isReference: true,
        fingerprint: 'as-rated',
        summary: finished,
      });
      entries.push({
        dispatcherId: 'edited',
        dispatcherName: '⟨edited dispatcher⟩',
        isReference: false,
        fingerprint: 'as-rated',
        summary: finished,
      });
      entries.push({
        dispatcherId: 'never-run',
        dispatcherName: '⟨unrated dispatcher⟩',
        isReference: false,
        fingerprint: 'as-rated',
        summary: { ...finished, rating: null, casesRated: 0, complete: false, weakest: null },
      });
    }
    const rows = ladderRowsOf(entries, {
      fingerprintOf: (id) => (id === 'edited' ? 'moved-since' : 'as-rated'),
      caseNameOf: (caseId) => names.get(caseId) ?? caseId,
    });
    for (const row of rows) {
      const at = `ladder.${row.dispatcherId}`;
      seeds.push({ field: `${at}.name`, text: row.name, role: 'label' });
      /*
       * R13's question, asked of the one figure in this product that is a standing claim: the
       * rating is a mean, and the count it is a mean over is the column beside it. `declaredCount`
       * is the summary's own `casesRated` and `countShown` says the cell is in the same row.
       */
      seeds.push({
        field: `${at}.rating`,
        text: row.rating,
        role: 'estimate',
        declaredCount: entries.find((entry) => entry.dispatcherId === row.dispatcherId)?.summary
          .casesRated,
        countShown: true,
      });
      seeds.push({ field: `${at}.proofCases`, text: row.proofCases, role: 'observation' });
      seeds.push({ field: `${at}.weakest`, text: row.weakestAt, role: 'label' });
      if (row.referenceLabel !== null) {
        seeds.push({ field: `${at}.reference`, text: row.referenceLabel, role: 'label' });
      }
      if (row.staleness !== null) {
        seeds.push({ field: `${at}.staleness`, text: row.staleness, role: 'reason' });
      }
      if (row.incompleteNote !== null) {
        seeds.push({ field: `${at}.incomplete`, text: row.incompleteNote, role: 'reason' });
      }
    }

    /* The two formatters on a rating nothing produced — § 13's `—`, never a zero. */
    const nothing: RatingSummary = {
      rating: null,
      casesRated: 0,
      casesRun: 0,
      casesTotal: proofCasesOf(set).length,
      complete: false,
      weakest: null,
      cases: [],
    };
    seeds.push({ field: 'rating.none.figure', text: ratingFigureOf(nothing), role: 'suppressed' });
    seeds.push({ field: 'rating.none.cases', text: proofCaseCountOf(nothing), role: 'observation' });
    seeds.push({
      field: 'case.name',
      text: caseNameOf(proofCasesOf(set)[0] as ProofCase, nameOf(towers[0]?.id ?? '')),
      role: 'label',
    });

    /* The screen's chrome, its two absences, and the standing sentences beside the table. */
    for (const [key, text] of Object.entries(BOARD_SCREEN_COPY)) {
      seeds.push({ field: `board.copy.${key}`, text, role: 'label' });
    }
    seeds.push({ field: 'board.daily.absent', text: DAILY_BOARD_ABSENCE, role: 'reason' });
    seeds.push({ field: 'ladder.world.absent', text: LADDER_WORLD_ABSENCE, role: 'reason' });
    seeds.push({ field: 'ladder.empty', text: LADDER_EMPTY, role: 'reason' });
    seeds.push({ field: 'ladder.reference.label', text: REFERENCE_RUN_LABEL, role: 'label' });
    seeds.push({ field: 'rating.basis', text: RATING_BASIS, role: 'prose' });
    seeds.push({ field: 'rating.caveat', text: RATING_CAVEAT, role: 'reason' });

    return singleRun(this.id, seeds);
  },
};

/**
 * **Everyday Mode's daily loop** — GAMEPLAY § 6 and § 14, the words half of four screens.
 *
 * ## Why this loop belongs in a corpus about honesty more than any other Everyday surface
 *
 * Because almost everything on it is a **withheld** state, and § 12.2 says the withheld states
 * must be enumerated *from the state model* rather than from hand-written fixtures. Four screens
 * draw two independent absences that combine:
 *
 * - **the day is not closed** — § 16 rule 1's `—`, on today's chip at the front door, on today's
 *   card in Your week, and on the percentile line. It is a fact about the reader's own run;
 * - **the world is unreachable** — § 16 rule 15's labelled band, which in this build is the
 *   *normal* state, because there is no server. It is a fact about other players.
 *
 * A screen that printed `0%` for the first would tell a reader nobody got away inside a minute; a
 * screen that printed `0 players` for the second would tell them nobody played. Both are R3's
 * blank-versus-failure rule, and both are exactly the kind of sentence a search finds and a
 * reviewer does not. Every case below is driven with the day open **and** closed for that reason.
 *
 * ## And two refusals that are claims about controls
 *
 * § 6.1's replay and § 6.2's ghost are both refused in this build, and both refusals are sentences
 * a player reads about a control they can see. That is § D227's shape — a refusal is pinned by a
 * run, never by another sentence — and a refusal nothing sweeps is the sentence that goes stale
 * the day somebody wires the seam it refuses about.
 *
 * ## What is driven, and what is not
 *
 * Every pure producer of the four screens, over both arms of the day-closed axis and over a week
 * with history and one without. The four **mounts** are excluded in `derive.test.ts` on the DOM
 * mounts' shared ground — they draw into the shell's scroll region, so they cannot run without a
 * document — which is the same pure/DOM split `EVERYDAY_MENU` and `EVERYDAY_SETTINGS` describe.
 * What those mounts author of their own is geometry and class names.
 *
 * The report screen's own view is driven here; the **sheet** inside it is `reportViewOf`'s, which
 * `DAY_REPORT_VIEW` already drives in both registers. This adapter seeds what `reportView.ts` adds
 * on top: the Everyday empty state, the levers' no-surface sentence, the closing block's title,
 * the tomorrow button's note, and the stale-sheet warning — five claims about what this screen is
 * showing, none of which exist on the Engineer panel.
 */
const EVERYDAY_DAILY_LOOP: SurfaceAdapter = {
  id: 'everyday/today.ts#todayOf',
  covers: [
    'everyday/today.ts#todayOf',
    'everyday/doorView.ts#doorScreenViewOf',
    'everyday/doorView.ts#DOOR_STEPS',
    'everyday/doorView.ts#SAME_FOR_EVERYONE',
    'everyday/briefView.ts#briefScreenViewOf',
    'everyday/briefView.ts#GHOST_REFUSAL',
    'everyday/briefView.ts#lockedForScore',
    'everyday/weekView.ts#weekScreenViewOf',
    'everyday/reportView.ts#everydayReportViewOf',
    'everyday/world.ts#percentileLine',
    'everyday/world.ts#WORLD_FIGURES_LABEL',
    'everyday/world.ts#WORLD_FIGURES_REASON',
    'everyday/world.ts#WORLD_FIGURES_ABSENT',
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const bundle = shiftBundleOf(context);

    for (const entry of bundle.days) {
      /*
       * The day record first — one object, four screens (§ 16 rule 14). Seeded once per day rather
       * than once per screen, because the whole claim of that rule is that the brief and the door
       * are quoting the *same* sentences.
       */
      const today = todayOf({
        week: entry.week,
        // No period, on `shiftBundleOf`'s own stated ground: what a period changes is which event
        // the card picks, and every event's words are already in the corpus.
        calendar: null,
        building: context.building,
        buildingId: context.building.id,
        dispatcherName: entry.report.metaLines[0],
        goals: entry.readings,
        seed: 424_242n,
      });
      const at = `day${String(entry.day)}`;
      seeds.push({ field: `${at}.today.label`, text: today.dayLabel, role: 'label' });
      seeds.push({ field: `${at}.today.lede`, text: today.lede, role: 'observation' });
      seeds.push({ field: `${at}.today.seed`, text: today.seedLine, role: 'label' });
      for (const fact of today.facts) {
        seeds.push({ field: `${at}.today.fact.${fact.label}`, text: fact.value, role: 'observation' });
      }
      if (today.load !== undefined) {
        seeds.push({ field: `${at}.today.load.word`, text: today.load.word, role: 'label' });
        seeds.push({ field: `${at}.today.load.note`, text: today.load.note, role: 'observation' });
      }
      if (today.outOfService !== undefined) {
        seeds.push({
          field: `${at}.today.outage`,
          text: today.outOfService.sentence,
          role: 'observation',
        });
      }
      for (const ask of today.asks) {
        seeds.push({ field: `${at}.today.asks`, text: ask, role: 'label' });
      }

      /*
       * **Both arms of the day-closed axis, on every screen that has one** — § 12.2's matrix, as
       * far as this build reaches it. `closed: false` is the state a reader is in for the whole of
       * the day they are playing, and it is the arm that draws every `—`.
       */
      for (const closed of [false, true]) {
        const arm = `${at}.${closed ? 'closed' : 'open'}`;

        /* ---- the front door, at today and at a past day (the replay refusal) ---- */
        for (const offset of [0, DAY_OFFSET_MIN]) {
          const door = doorScreenViewOf({
            week: entry.week,
            today,
            dayOffset: offset,
            dayClosed: closed,
          });
          const where = `${arm}.door${String(offset)}`;
          seeds.push({ field: `${where}.kind`, text: door.kindPill, role: 'label' });
          seeds.push({ field: `${where}.stepper`, text: door.stepper.label, role: 'label' });
          seeds.push({ field: `${where}.rule`, text: door.rule, role: 'prose' });
          for (const chip of door.chips) {
            seeds.push({ field: `${where}.chip.score`, text: chip.score, role: 'observation' });
            seeds.push({ field: `${where}.chip.note`, text: chip.note, role: 'label' });
          }
          seeds.push({ field: `${where}.world.label`, text: door.world.label, role: 'label' });
          seeds.push({ field: `${where}.world.reason`, text: door.world.reason, role: 'reason' });
          for (const absent of door.world.absent) {
            seeds.push({ field: `${where}.world.absent`, text: absent, role: 'reason' });
          }
          for (const step of door.steps) {
            seeds.push({ field: `${where}.step.${step.n}.head`, text: step.head, role: 'label' });
            seeds.push({ field: `${where}.step.${step.n}.body`, text: step.body, role: 'prose' });
          }
          seeds.push({ field: `${where}.driver`, text: door.driver.note, role: 'prose' });
          seeds.push({ field: `${where}.same`, text: door.sameForEveryone, role: 'prose' });
          seeds.push({ field: `${where}.primary.label`, text: door.primary.label, role: 'label' });
          /* The § 6.1 replay refusal on the past-day arm; the § 3.3 note on today's. */
          seeds.push({
            field: `${where}.primary.note`,
            text: door.primary.note,
            role: door.primary.inert ? 'reason' : 'prose',
          });
        }

        /* ---- Your week: today's card, the tally, the percentile, the board's absence ---- */
        const week = weekScreenViewOf({
          week: entry.week,
          towerToday: context.buildingName,
          dayClosed: closed,
          // A sheet stands exactly when the day is closed here, which is the shipped pairing; the
          // two-can-disagree arm is `weekView.test.ts`'s, where it is a claim about a control.
          sheetStanding: closed,
        });
        seeds.push({ field: `${arm}.week.streak`, text: week.streakLine, role: 'observation' });
        for (const card of week.cards) {
          seeds.push({ field: `${arm}.week.card.score`, text: card.score, role: 'observation' });
          seeds.push({ field: `${arm}.week.card.note`, text: card.note, role: 'label' });
        }
        seeds.push({ field: `${arm}.week.tally`, text: week.tally.line, role: 'observation' });
        seeds.push({ field: `${arm}.week.readNote`, text: week.readNote, role: 'prose' });
        seeds.push({
          field: `${arm}.week.percentile`,
          text: week.percentile.line,
          role: 'reason',
        });
        seeds.push({ field: `${arm}.week.split`, text: week.splitCaption, role: 'prose' });
        seeds.push({ field: `${arm}.week.board.refusal`, text: week.board.refusal, role: 'reason' });
        for (const rule of week.board.rules) {
          seeds.push({ field: `${arm}.week.board.rule`, text: rule.title, role: 'label' });
          seeds.push({ field: `${arm}.week.board.body`, text: rule.body, role: 'prose' });
        }
      }

      /* ---- the brief: the wrinkle, what today asks, and the two refusals ---- */
      /*
       * The dispatcher list the brief offers, carrying the Engineer's own Casual sentence per
       * profile — `dispatcherCardOf(profile, peers, 'basic').sub`, which is the same expression
       * `briefScreen.ts` hands the view and which `DISPATCHER_CARDS` already drives on its own
       * surface. The peers are `context.profiles`, which is the list the rail shows.
       */
      const options = context.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        description: dispatcherCardOf(profile, context.profiles, 'basic').sub,
      }));
      const brief = briefScreenViewOf({
        today,
        dispatchers: options,
        savedIds: [],
        selectedId: options[0]?.id ?? '',
      });
      seeds.push({ field: `${at}.brief.title`, text: brief.title, role: 'label' });
      seeds.push({ field: `${at}.brief.wrinkle.title`, text: brief.wrinkle.title, role: 'label' });
      seeds.push({ field: `${at}.brief.wrinkle.body`, text: brief.wrinkle.body, role: 'observation' });
      seeds.push({ field: `${at}.brief.wrinkle.shared`, text: brief.wrinkle.shared, role: 'prose' });
      seeds.push({ field: `${at}.brief.asks.note`, text: brief.asks.note, role: 'prose' });
      seeds.push({ field: `${at}.brief.count`, text: brief.drivers.count, role: 'observation' });
      seeds.push({ field: `${at}.brief.bar`, text: brief.barNote, role: 'label' });
      for (const [name, card] of [
        ['ghost', brief.ghost],
        ['locked', brief.locked],
      ] as const) {
        seeds.push({ field: `${at}.brief.${name}.what`, text: card.what, role: 'prose' });
        seeds.push({ field: `${at}.brief.${name}.why`, text: card.why, role: 'reason' });
        seeds.push({ field: `${at}.brief.${name}.caveat`, text: card.caveat, role: 'prose' });
      }

      /*
       * ---- the report screen's own additions ----
       *
       * Three states: nothing filed, a filed sheet, and a filed sheet with a newer unfiled run on
       * the stage. The third is the one worth insisting on — it is the sentence that stops a reader
       * taking this sheet for an account of the run they can currently see.
       */
      for (const [label, input] of [
        ['empty', { report: undefined, previous: undefined, overnight: undefined, newerRunOnStage: false }],
        ['filed', { report: entry.report, previous: undefined, overnight: undefined, newerRunOnStage: false }],
        ['paired', { report: entry.report, previous: entry.swapped, overnight: undefined, newerRunOnStage: false }],
        ['stale', { report: entry.report, previous: undefined, overnight: undefined, newerRunOnStage: true }],
      ] as const) {
        const view = everydayReportViewOf(input);
        const where = `${at}.report.${label}`;
        if (view.emptyLede !== undefined) {
          seeds.push({ field: `${where}.empty`, text: view.emptyLede, role: 'prose' });
        }
        seeds.push({ field: `${where}.figuresHeading`, text: view.headings.figures, role: 'label' });
        seeds.push({ field: `${where}.overnightHeading`, text: view.headings.overnight, role: 'label' });
        seeds.push({ field: `${where}.honesty.title`, text: view.honesty.title, role: 'label' });
        /*
         * `role: 'reason'`, which is what `DAY_REPORT` and `DAY_REPORT_VIEW` classify the same
         * string as — and the classification is load-bearing rather than cosmetic. The small
         * print's whole job is to **refuse** a comparative reading of one day, and it does that in
         * R2's own words (*"it cannot tell you that X is better than anything — that needs 50 or
         * more paired runs …"*), which names an ordering and names a dispatcher. Seeded `prose`
         * it fired `single-run-comparative` on eighteen strings across three cases on this
         * adapter's first run — the property's own documented third narrowing, met from the wrong
         * side. A refusal is the one string entitled to name the ordering it is refusing.
         */
        seeds.push({ field: `${where}.honesty.body`, text: view.honesty.body, role: 'reason' });
        if (view.honesty.pointer !== undefined) {
          seeds.push({ field: `${where}.pointer`, text: view.honesty.pointer.why, role: 'prose' });
        }
        for (const lever of view.levers) {
          if (lever.noSurfaceNote === undefined) continue;
          seeds.push({ field: `${where}.lever.refusal`, text: lever.noSurfaceNote, role: 'reason' });
        }
        if (view.tomorrow !== undefined) {
          seeds.push({ field: `${where}.tomorrow.label`, text: view.tomorrow.label, role: 'label' });
          seeds.push({ field: `${where}.tomorrow.note`, text: view.tomorrow.note, role: 'prose' });
        }
        if (view.staleNote !== undefined) {
          seeds.push({ field: `${where}.stale`, text: view.staleNote, role: 'reason' });
        }
      }
    }

    /*
     * The two constants no rendered view reaches on its own: `DOOR_STEPS`' and `SAME_FOR_EVERYONE`
     * are seeded through the door view above, and `percentileLine`'s two arms through Your week.
     * `GHOST_REFUSAL` and `lockedForScore` likewise. What is left is the world band's own three,
     * asserted here as well so the exclusion list never has to claim they are unchecked.
     */
    seeds.push({ field: 'world.label', text: WORLD_FIGURES_LABEL, role: 'label' });
    seeds.push({ field: 'world.reason', text: WORLD_FIGURES_REASON, role: 'reason' });
    for (const absent of WORLD_FIGURES_ABSENT) {
      seeds.push({ field: 'world.absent', text: absent, role: 'reason' });
    }
    for (const closed of [false, true]) {
      seeds.push({ field: `world.percentile.${String(closed)}`, text: percentileLine(closed), role: 'reason' });
    }
    for (const step of DOOR_STEPS) {
      seeds.push({ field: `door.step.${step.n}`, text: step.body, role: 'prose' });
    }
    seeds.push({ field: 'door.same', text: SAME_FOR_EVERYONE, role: 'prose' });
    seeds.push({ field: 'brief.ghost.why', text: GHOST_REFUSAL.why, role: 'reason' });
    seeds.push({ field: 'brief.locked.why', text: lockedForScore().why, role: 'reason' });

    return singleRun(this.id, seeds);
  },
};

/**
 * **The door between the two products** — GAMEPLAY § 3.2's *Switch to Engineer* row and the header
 * control that brings a player back.
 *
 * ## Why three sentences deserve an adapter of their own
 *
 * Because every one of them is a claim about a **transition**, which is the one kind of claim no
 * screen can be read to check. The row promises that nothing stops when the page changes hands; the
 * header's title promises the return lands on the screen the player left; both promise, in the same
 * breath, that the choice does not survive a reload. A player who believes the first two and is
 * wrong loses a day's run to a button press, and a player who believes the third and is wrong finds
 * a developer tool where their game was.
 *
 * They are also exactly the sentences this repository has watched go stale. The row's previous text
 * was a **refusal** — *"not built yet, Everyday Mode is the only play style in this build"* — and
 * `docs/05`'s § D227 is about the wave in which a sentence like that outlives the thing it refuses
 * about. The refusal is gone with the same commit that built the door; what is here now is the
 * positive form, which is the form that can go stale in the other direction.
 *
 * ## What is driven, and what is not
 *
 * All three words, and the rail footer row that carries two of them. What is **not** here is the
 * transition itself — `shell.ts#enterEngineer`, the `inert` sequencing and the `visibility` write
 * are DOM, excluded on the mounts' shared ground, and pinned instead by
 * `everyday/shell.browser.test.ts`'s round trip. That split is the point rather than a gap: this
 * adapter checks that the promise is *sayable*, and the browser tier checks that it is *true*.
 *
 * Appended last, per the fault-ordering rule stated at `SHIFT_REPORT`: the row's note shares its
 * shape with the rail's other footer captions, so an earlier slot would move every footer-shaped
 * fault onto this surface.
 */
const ENGINEER_DOOR: SurfaceAdapter = {
  id: 'everyday/types.ts#ENGINEER_SWAP_NOTE',
  covers: [
    'everyday/types.ts#ENGINEER_SWAP_NOTE',
    'everyday/types.ts#ENGINEER_RETURN_LABEL',
    'everyday/types.ts#ENGINEER_RETURN_TITLE',
  ],
  render(context) {
    void context;
    const swap = railModel({ screen: 'menu', ctx: 'daily' }).footer.engineerSwap;
    return singleRun(this.id, [
      { field: 'rail.footer.swap.label', text: swap.label, role: 'label' },
      /*
       * `prose` rather than `reason`: it is not a refusal any more, and the exemption a refusal
       * carries — it may name the thing it is refusing — is one this sentence has no claim on.
       */
      { field: 'rail.footer.swap.note', text: swap.note, role: 'prose' },
      { field: 'engineer.header.back.label', text: ENGINEER_RETURN_LABEL, role: 'label' },
      { field: 'engineer.header.back.title', text: ENGINEER_RETURN_TITLE, role: 'prose' },
    ]);
  },
};

/* -------------------------------------------------------------------------- *
 * The dispatcher workshop — GAMEPLAY § 11 over `everyday/workshopModel.ts`
 * -------------------------------------------------------------------------- */

/**
 * **Everyday Mode's dispatcher workshop** — the six disclosure layers, driven over the shipped
 * dispatcher library.
 *
 * ## Why this surface is worth sweeping, and what it is most likely to get wrong
 *
 * It is the screen § D301 calls the mass-market draw, and almost every string on it is a **claim
 * about a control**: what a lever owns, what a weight serves, which filter runs before the
 * scoring, what the profile carries that the screen cannot draw, whether the switching block
 * reaches the run. That is exactly the class the roadmap's standing requirement is about, in both
 * directions — a control that says it writes nothing while writing something (§ D227), and a
 * control that writes nothing and does not say so (§ D219).
 *
 * The three classes of sentence it could most easily get wrong are all driven below. **A cost
 * line** (R2 — it must not read as a claim about a day), **the maths disclosure** (§ 16 rule 12 —
 * the plain sentence first, then every symbol, then the expression), and **the refusals**: the
 * inert-term refusal § D112 earned, the clockless time rule, the unnamed hard constraint, and the
 * *inert while one setting runs all shift* sentence, which is the one that would be a lie if the
 * detector were ever built under `off`.
 *
 * ## Driven over every style, and both switching states
 *
 * Each of the shipped play styles is loaded in turn, so the cards, the term rows, the cost line
 * and the maths symbols are rendered against six different vectors rather than one — a term whose
 * player words are only reachable under a profile that weights it would otherwise never be swept.
 * The switching block is rendered under `off` *and* under `fuzzy`, because its inert note exists
 * only in the first and its detector help only in the second.
 *
 * `everyday/workshopScreen.ts#WORKSHOP_SCREEN` is not driven here and is excluded in
 * `derive.test.ts` on the DOM mounts' shared ground: it needs a document. What that mount authors
 * of its own is geometry, class names and the two joining words `when` and `then`.
 */
const EVERYDAY_WORKSHOP: SurfaceAdapter = {
  id: 'everyday/workshopModel.ts#WORKSHOP_COPY',
  covers: [
    'everyday/workshopModel.ts#WORKSHOP_COPY',
    'everyday/workshopModel.ts#playStyleAbsenceOf',
    'everyday/workshopModel.ts#termDisclosureOf',
    'everyday/workshopModel.ts#mathsDisclosureOf',
    'everyday/workshopModel.ts#behaviourBlockOf',
    'everyday/workshopModel.ts#constraintCardsOf',
    'everyday/workshopModel.ts#carriedBlocksOf',
    'everyday/workshopModel.ts#switchingBlockOf',
    'everyday/workshopModel.ts#rulesBlockOf',
    'everyday/workshopModel.ts#nameplateOf',
    /*
     * Three exports are deliberately **not** listed and are rendered anyway:
     * `playStyleCardsOf`, `libraryCardsOf` and `workshopLeversOf`. The derivation does not find
     * them, and it is right not to — none of them authors a phrase. The style cards carry
     * `data/dispatcher-profiles.json`'s own `name` and `trade` (swept above, seed by seed), the
     * library cards carry each profile's `name`, and the lever views are `mode/plainLevers.ts`'s,
     * already driven by the editor adapter. Listing them would be a coverage claim about
     * functions that produce no prose of their own, which is the stale-coverage half of
     * `derive.test.ts`'s guard.
     */
  ],
  render(context) {
    const seeds: TextSeed[] = [];
    const file = context.dispatcherProfiles;

    for (const [key, text] of Object.entries(WORKSHOP_COPY)) {
      seeds.push({ field: `copy.${key}`, text, role: 'prose', provenance: 'authored' });
    }

    /* ---- the left panel: six style cards, the rest of the shelf, the nameplate ---- */
    for (const card of playStyleCardsOf(file, 'collective', DEFAULT_LEVERS, blankSpec([]))) {
      seeds.push({ field: `style.${card.id}.name`, text: card.name, role: 'label', provenance: 'authored' });
      seeds.push({ field: `style.${card.id}.trade`, text: card.trade, role: 'prose', provenance: 'authored' });
    }
    /* The refusal a build with no declared styles draws — reachable only through a file that has
     * none, so it is manufactured here rather than left as a sentence no run has seen. */
    const { playStyles: _styles, ...bare } = file;
    const absence = playStyleAbsenceOf(bare);
    if (absence !== undefined) {
      seeds.push({ field: 'style.absent', text: absence, role: 'reason', provenance: 'authored' });
    }
    for (const card of libraryCardsOf(file, 'collective')) {
      seeds.push({ field: `library.${card.profileId}`, text: card.name, role: 'label', provenance: 'authored' });
    }

    /* ---- the ladder, once per shipped style, so every vector is swept ---- */
    const styled = (file.playStyles ?? []).map((style) => style.profileId);
    const profiles = file.profiles.filter((profile) => styled.includes(profile.id));
    for (const profile of profiles.length > 0 ? profiles : file.profiles.slice(0, 1)) {
      const spec = specFromProfile(profile, profile.name);
      const label = profile.id;

      for (const lever of workshopLeversOf(spec, DEFAULT_LEVERS)) {
        seeds.push({ field: `${label}.lever.${lever.id}`, text: lever.label, role: 'label' });
        seeds.push({ field: `${label}.lever.${lever.id}.sub`, text: plainLeverSub(lever), role: 'prose' });
        seeds.push({ field: `${label}.lever.${lever.id}.echo`, text: plainLeverEchoOf(lever), role: 'prose' });
        seeds.push({ field: `${label}.lever.${lever.id}.help`, text: plainLeverHelp(lever), role: 'reason' });
      }

      const terms = termDisclosureOf(file.terms, spec);
      seeds.push({ field: `${label}.terms.summary`, text: terms.summary, role: 'label' });
      seeds.push({ field: `${label}.terms.hint`, text: terms.hint, role: 'prose', provenance: 'authored' });
      for (const row of terms.rows) {
        seeds.push({ field: `${label}.term.${row.termId}`, text: `${row.label} — ${row.serves}`, role: 'label' });
        if (row.inertWhy !== undefined) {
          seeds.push({ field: `${label}.term.${row.termId}.inert`, text: row.inertWhy, role: 'reason' });
        }
      }

      const maths = workshopMathsOf(spec, file.terms);
      seeds.push({ field: `${label}.maths.plain`, text: maths.plainSentence, role: 'prose', provenance: 'authored' });
      for (const symbol of maths.symbols) {
        seeds.push({
          field: `${label}.maths.symbol.${symbol.symbol}`,
          text: `${symbol.symbol} — ${symbol.name}, ${symbol.serves} · ${symbol.weight}`,
          role: 'label',
        });
      }
      /*
       * The cost line, on `role: 'observation'` rather than `estimate`. It is a statement of the
       * configuration a reader is looking at — the same claim `vectorLineOf` makes one surface
       * over — and not a figure any run produced, so R13 asking it for an `n` would be asking the
       * wrong question of it.
       */
      seeds.push({ field: `${label}.maths.line`, text: maths.line, role: 'observation' });
      seeds.push({ field: `${label}.maths.signs`, text: maths.signs, role: 'prose', provenance: 'authored' });

      const behaviour = behaviourBlockOf(spec, DEFAULT_LEVERS);
      seeds.push({ field: `${label}.behaviour.boundary`, text: behaviour.boundary, role: 'reason', provenance: 'authored' });
      for (const flag of behaviour.flags) {
        seeds.push({ field: `${label}.flag.${flag.key}`, text: `${flag.label} — ${flag.hint}`, role: 'label' });
      }
      for (const lever of behaviour.groupLevers) {
        seeds.push({ field: `${label}.group.${lever.key}`, text: `${lever.label} — ${lever.hint}`, role: 'label' });
      }

      for (const card of constraintCardsOf(profile)) {
        seeds.push({ field: `${label}.constraint.${card.id}`, text: `${card.name} — ${card.effect}`, role: 'reason' });
      }
      for (const entry of carriedBlocksOf(profile)) {
        seeds.push({ field: `${label}.carried.${entry.block}`, text: entry.words, role: 'reason', provenance: 'authored' });
      }
    }

    /*
     * The unnamed-constraint fallback, manufactured: no shipped profile can reach it (the record
     * in `core` is total over `HardConstraintId`), and a refusal no run has ever rendered is a
     * refusal nobody has read. `FIXIT`'s over-budget note is manufactured on the same ground.
     */
    const invented = { ...file.profiles[0]!, hardConstraints: ['someFutureFilter'] };
    for (const card of constraintCardsOf(invented)) {
      if (!card.unnamed) continue;
      seeds.push({ field: 'constraint.unnamed', text: `${card.name} — ${card.effect}`, role: 'reason' });
    }
    /* Every carried-block sentence, over a profile that carries all of them it can. */
    for (const profile of file.profiles) {
      for (const entry of carriedBlocksOf(profile)) {
        seeds.push({ field: `carried.${entry.block}`, text: entry.words, role: 'reason', provenance: 'authored' });
      }
    }

    /* ---- the switching block, in both states ---- */
    const selectorContext = selectorContextFrom(file, 900);
    const base = defaultSelectorSpec(selectorContext);
    for (const policy of ['off', 'fuzzy'] as const) {
      const view = switchingBlockOf({ ...base, policy }, selectorContext);
      seeds.push({ field: `switching.${policy}.policyLine`, text: view.policyLine, role: 'prose' });
      if (view.inertNote !== undefined) {
        seeds.push({ field: `switching.${policy}.inert`, text: view.inertNote, role: 'reason', provenance: 'authored' });
      }
      for (const mode of view.modes) {
        seeds.push({ field: `switching.${policy}.mode.${mode.policy}`, text: mode.label, role: 'label', provenance: 'authored' });
      }
      for (const control of view.controls) {
        seeds.push({ field: `switching.${policy}.control.${control.field}`, text: control.label, role: 'label', provenance: 'authored' });
        seeds.push({ field: `switching.${policy}.control.${control.field}.help`, text: control.help, role: 'prose' });
      }
      for (const card of view.patterns) {
        if (card.line !== undefined) {
          seeds.push({ field: `switching.${policy}.pattern.${card.patternId}`, text: card.line, role: 'prose' });
        }
        if (card.signature !== undefined) {
          seeds.push({ field: `switching.${policy}.pattern.${card.patternId}.signature`, text: card.signature, role: 'observation' });
        }
      }
    }

    /* ---- the rules editor: every offered phrase, a live row, and a live refusal ---- */
    for (const hasClock of [true, false]) {
      const rows: RuleRow[] = [
        defaultRuleRow(),
        { ...defaultRuleRow(), when: 'time-before', whenValue: 32_400 },
      ];
      const block = rulesBlockOf(rows, 'Steady hand', { hasClock });
      const where = hasClock ? 'clock' : 'no-clock';
      seeds.push({ field: `rules.${where}.fallback`, text: block.fallback, role: 'label' });
      seeds.push({ field: `rules.${where}.exclusivity`, text: block.exclusivity, role: 'prose', provenance: 'authored' });
      seeds.push({ field: `rules.${where}.vocabulary`, text: block.vocabularyNote, role: 'reason', provenance: 'authored' });
      for (const option of block.whenOptions) {
        seeds.push({ field: `rules.when.${option.id}`, text: option.template, role: 'label' });
        for (const value of option.values ?? []) {
          seeds.push({ field: `rules.when.${option.id}.${String(value.value)}`, text: value.label, role: 'label' });
        }
      }
      for (const option of block.thenOptions) {
        seeds.push({ field: `rules.then.${option.id}`, text: option.template, role: 'label' });
        for (const value of option.values ?? []) {
          seeds.push({ field: `rules.then.${option.id}.${String(value.value)}`, text: value.label, role: 'label' });
        }
      }
      for (const row of block.rows) {
        seeds.push({ field: `rules.${where}.row.${String(row.index)}.readback`, text: row.readback, role: 'prose' });
        seeds.push({ field: `rules.${where}.row.${String(row.index)}.lever`, text: row.lever, role: 'label' });
        for (const [at, issue] of row.issues.entries()) {
          seeds.push({ field: `rules.${where}.row.${String(row.index)}.issue.${String(at)}`, text: issue.message, role: 'reason' });
        }
      }
      const empty = rulesBlockOf([], 'Steady hand', { hasClock }).empty;
      if (empty !== undefined) {
        seeds.push({ field: `rules.${where}.empty`, text: empty, role: 'reason', provenance: 'authored' });
      }
    }

    /* ---- the nameplate, in both of its states ---- */
    const clean = specFromProfile(file.profiles[0]!, file.profiles[0]!.name);
    const moved = { ...clean, weights: { ...clean.weights, starvation: 71 } };
    for (const [where, spec, rows] of [
      ['unchanged', clean, [] as readonly RuleRow[]],
      ['dirty', moved, [defaultRuleRow()] as readonly RuleRow[]],
    ] as const) {
      const plate = workshopNameplateOf({
        startedFrom: file.profiles[0]!.name,
        spec,
        levers: DEFAULT_LEVERS,
        baseSpec: clean,
        baseLevers: DEFAULT_LEVERS,
        ruleRows: rows,
      });
      if (plate.unchanged !== undefined) {
        seeds.push({ field: `nameplate.${where}.unchanged`, text: plate.unchanged, role: 'prose', provenance: 'authored' });
      }
      seeds.push({ field: `nameplate.${where}.startedFrom`, text: plate.startedFrom, role: 'label' });
      seeds.push({ field: `nameplate.${where}.levers`, text: plate.leversMoved, role: 'observation' });
      seeds.push({ field: `nameplate.${where}.rules`, text: plate.rules, role: 'observation' });
      seeds.push({ field: `nameplate.${where}.bench`, text: plate.provedOnTheBench, role: 'reason' });
    }

    return singleRun(this.id, seeds);
  },
};

/* -------------------------------------------------------------------------- *
 * The test bench — GAMEPLAY § 12 over `everyday/benchModel.ts`
 * -------------------------------------------------------------------------- */

/**
 * **Everyday Mode's test bench** — the field, the tests, the budget, and everything it says about
 * a result it did not compute.
 *
 * ## What the sweep is actually asking of this surface
 *
 * § 12's whole claim is that the bench *"is allowed to shrug"*, and the failure mode is the one
 * CLAUDE.md names outright: a screen that turns a two-run subtraction into a verdict. So the seeds
 * below carry the **refusals** — the field's two bounds, the empty tick list, the two budget
 * notes, the three-arm verdict refusal — and the two sentences that would be the defect if they
 * were ever drawn without them: § 12.2's *Too close to call*, which sits **beside**
 * `report.ts`'s `unresolved` and never in place of it, and the never-a-subtraction rule itself.
 *
 * The per-cell figures and comparison rows are **not** re-seeded here: they are `batchReport`'s
 * own sentences, driven by `BATCH_REPORT`, and re-rendered under the suite's id by `SUITE_BENCH`.
 * Adding a third copy would put duplicates ahead of the originals and move every batch-shaped
 * fault onto this surface, which is the ordering rule stated at `SHIFT_REPORT`.
 *
 * `everyday/benchScreen.ts#BENCH_SCREEN` is not driven here and is excluded in `derive.test.ts`
 * on the DOM mounts' shared ground: it mounts DOM and owns a batch `Worker`.
 */
const EVERYDAY_BENCH: SurfaceAdapter = {
  id: 'everyday/benchModel.ts#BENCH_COPY',
  covers: [
    'everyday/benchModel.ts#BENCH_COPY',
    'everyday/benchModel.ts#BENCH_STANDING_NOTES',
    'everyday/benchModel.ts#benchEntrantsOf',
    'everyday/benchModel.ts#benchFieldRefusal',
    'everyday/benchModel.ts#benchTestsRefusal',
    'everyday/benchModel.ts#benchBudgetNoteOf',
    'everyday/benchModel.ts#benchWorkLineOf',
    'everyday/benchModel.ts#benchVerdictNoteOf',
    'everyday/benchModel.ts#benchResultViewOf',
    // Driven through `benchFieldRefusal`, which it calls before narrowing to the tuple: a field
    // it returns `undefined` for is exactly a field that refusal names.
    'everyday/benchModel.ts#benchFieldOf',
  ],
  render(context) {
    const seeds: TextSeed[] = [];

    for (const [key, text] of Object.entries(BENCH_COPY)) {
      seeds.push({ field: `copy.${key}`, text, role: 'prose', provenance: 'authored' });
    }

    /* ---- the field, at every size the toggles can reach ---- */
    const shelf = context.dispatcherProfiles.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
    }));
    for (const size of [0, 1, 2, BENCH_FIELD_MAX, BENCH_FIELD_MAX + 1]) {
      const picked = shelf.slice(0, size).map((entry) => entry.id);
      const refusal = benchFieldRefusal(picked);
      if (refusal !== undefined) {
        seeds.push({ field: `field.${String(size)}.refusal`, text: refusal, role: 'reason' });
      }
      seeds.push({
        field: `field.${String(size)}.verdictNote`,
        text: benchVerdictNoteOf(size),
        role: 'reason',
      });
      for (const entrant of benchEntrantsOf(shelf, picked)) {
        seeds.push({ field: `field.${String(size)}.entrant.${entrant.profileId}`, text: entrant.name, role: 'label' });
        if (entrant.refusal !== undefined) {
          seeds.push({ field: `field.${String(size)}.entrant.${entrant.profileId}.refusal`, text: entrant.refusal, role: 'reason' });
        }
      }
    }

    /* ---- the tests, and the empty-tick refusal ---- */
    for (const test of benchTestsOf(['midtown-up-peak'])) {
      seeds.push({ field: `test.${test.cellId}`, text: test.label, role: 'label' });
    }
    const noTests = benchTestsRefusal([]);
    if (noTests !== undefined) {
      seeds.push({ field: 'tests.refusal', text: noTests, role: 'reason', provenance: 'authored' });
    }

    /* ---- the budget: every choice's work line, and both notes ---- */
    for (const choice of BENCH_REPLICATION_CHOICES) {
      seeds.push({
        field: `budget.${String(choice)}.work`,
        text: benchWorkLineOf(3, choice, 2),
        role: 'observation',
      });
      const note = benchBudgetNoteOf(choice);
      if (note !== undefined) {
        seeds.push({ field: `budget.${String(choice)}.note`, text: note, role: 'reason', provenance: 'authored' });
      }
    }

    /*
     * ---- the result: the standing notes, the index's own words, and the three-arm refusal ----
     *
     * The index's verdict words are `suiteSummaryOf`'s and are seeded here under the bench's id
     * because this is the surface a player reads them on; the per-row sentences below them are
     * `batchReport`'s and are deliberately not re-seeded (see the adapter docstring).
     */
    const cell = { id: 'midtown-up-peak', label: 'Midtown Office, up-peak 1 %' };
    const two = suiteCellViewOf(cell, context.batch);
    const third = context.batch.arms[1];
    const many =
      third === undefined
        ? undefined
        : suiteCellViewOf(cell, {
            ...context.batch,
            arms: [...context.batch.arms, { ...third, armId: 'bench-ghost-arm' }],
          });
    const view = benchResultViewOf(many === undefined ? [two] : [two, many]);
    seeds.push({ field: 'result.caption', text: view.caption, role: 'label', provenance: 'authored' });
    seeds.push({ field: 'result.neverASubtraction', text: view.neverASubtraction, role: 'prose', provenance: 'authored' });
    for (const [index, note] of view.standingNotes.entries()) {
      seeds.push({ field: `result.standing.${String(index)}`, text: note, role: 'prose', provenance: 'authored' });
    }
    for (const line of view.summary.lines) {
      for (const [index, mark] of line.marks.entries()) {
        if (mark === null) continue;
        seeds.push({ field: `result.${line.cellId}.mark.${String(index)}`, text: mark.text, role: 'observation' });
      }
      if (line.note !== null) {
        seeds.push({ field: `result.${line.cellId}.note`, text: line.note, role: 'reason' });
      }
    }
    /*
     * § 12.2's heading, seeded only where a drawn row actually came back `unresolved`. Seeding it
     * unconditionally would be the surface asserting a shrug it had not measured, which is the
     * mirror image of the defect this whole screen exists to refuse.
     */
    for (const cellId of view.tooCloseCellIds) {
      seeds.push({ field: `result.${cellId}.tooClose`, text: BENCH_COPY.tooCloseHeading, role: 'reason' });
    }

    return singleRun(this.id, seeds);
  },
};

export const SURFACE_ADAPTERS: readonly SurfaceAdapter[] = Object.freeze([
  RUN_SUMMARY,
  DESCRIBE_FRAME,
  OVERLAY,
  CANVAS,
  MOOD,
  LIVE_RAIL,
  RIDER_QUEUE,
  ACCESS,
  PINNED_QUEUES,
  MODE,
  EDITOR,
  CONTROLS,
  EDITED_PROFILE,
  REPLAY,
  BATCH_REPORT,
  GOAL_REPORT,
  CAMPAIGN,
  /*
   * The design refactor's surfaces, appended rather than interleaved: `faults.ts` corrupts the
   * **first** string matching a shape, so inserting an adapter ahead of `RUN_SUMMARY` would move
   * every fault onto a different surface and quietly change what `honesty.test.ts`'s shrink
   * assertions are about.
   */
  SHIFT_REPORT,
  AUTHORING,
  RAIL_VIEW,
  RIGHT_RAIL,
  REPORT_PANEL,
  SCENARIOS,
  EDITOR_PANELS,
  MENU,
  RESTORE_NOTICE,
  SELECTOR,
  CHALLENGE,
  CALENDAR_AND_FABRIC,
  // Appended, for the reason stated at `SHIFT_REPORT` above: `faults.ts` corrupts the first string
  // matching a shape, so an adapter inserted earlier would move every fault onto a different
  // surface and silently change what the shrink assertions are about.
  GLOSSARY,
  EVERYDAY_MENU,
  EVERYDAY_SETTINGS,
  REPORT_CARD,
  // Appended, same reason again: the suite re-seeds the bench's sentences under its own surface
  // id, and placing it earlier would put duplicates of BATCH_REPORT's strings ahead of the
  // originals and move every batch-shaped fault onto this surface.
  SUITE_BENCH,
  // Appended last, per the fault-ordering rule stated at SHIFT_REPORT.
  FIXIT,
  // Appended after FIXIT, same reason again: the rules editor's readbacks share phrases
  // with the selector's copy, and inserting it earlier would move selector-shaped faults
  // onto this surface.
  RULES_EDITOR,
  // Appended last, per the fault-ordering rule stated at SHIFT_REPORT: slice 4d's race strip.
  RACE_STRIP,
  WATCH,
  // Appended last, per the fault-ordering rule stated at SHIFT_REPORT: § 7's Everyday stage. Its
  // header figures share wordings with the live rail's, so an earlier slot would move every
  // rail-shaped fault onto this surface.
  EVERYDAY_STAGE,
  // Appended last, per the fault-ordering rule stated at SHIFT_REPORT: § 12.2's withheld matrix
  // re-renders cells other adapters draw in their ordinary state, so placing it earlier would move
  // every week-shaped and menu-shaped fault onto this surface.
  WITHHELD_MATRIX,
  // Appended last, per the fault-ordering rule stated at SHIFT_REPORT: `docs/21` § 3.4's live
  // metrics card re-renders phrases `CANVAS` also draws — the refusal head and reason above all —
  // so placing it earlier would move every panel-shaped fault onto this surface.
  LIVE_METRICS,
  // Appended last, per the fault-ordering rule stated at SHIFT_REPORT: the ladder re-seeds a
  // rating and a case count, which are figure-shaped, so placing it earlier would move
  // batch-shaped faults onto this surface.
  GAUNTLET,
  /*
   * Appended last, per the fault-ordering rule stated at SHIFT_REPORT — and **moved here on the
   * merge**, which is the part worth reading. The daily-loop lane had it between
   * `EVERYDAY_SETTINGS` and `REPORT_CARD`, which was the end of the array on that branch and is
   * the middle of it here. Left where it merged, it would sit ahead of eleven surfaces it shares
   * wordings with — the report card's figures, the week's withheld cells, § 7's stage header —
   * and every fault of those shapes would have moved onto this surface without a line of either
   * branch changing. That is exactly the silent re-mapping the rule exists to stop, so the rule is
   * applied to the merged array rather than to each branch's.
   */
  EVERYDAY_DAILY_LOOP,
  // Appended last, per the fault-ordering rule stated at SHIFT_REPORT: § 3.2's swap row and the
  // Engineer header's return, whose captions share a shape with the rail's other footer rows.
  ENGINEER_DOOR,
  /*
   * Appended last, per the fault-ordering rule stated at SHIFT_REPORT — and **moved here on the
   * merge**, which is the second time this array has recorded that sentence and the first time it
   * was recorded by a merge git did not stop to ask about.
   *
   * The campaign lane appended it after `WITHHELD_MATRIX`, which was the end of the array on that
   * branch and is the middle of it here. There was **no conflict marker**: both branches added
   * lines after a line they agreed on, so the textual merge simply took both and the adapter
   * landed four surfaces up. Left there it would have sat ahead of `LIVE_METRICS`, `GAUNTLET`,
   * `EVERYDAY_DAILY_LOOP` and `ENGINEER_DOOR` — and its own comment names the collision it would
   * cause, because § 8's three screens share record-shaped phrases with the week's surfaces and
   * `EVERYDAY_DAILY_LOOP` is where the week now lives. Every week-shaped fault would have moved
   * onto this surface without a line of either branch changing, which is the failure `EVERYDAY_DAILY_LOOP`'s
   * own note (four entries above) describes from the other side.
   *
   * The rule is applied to the merged array rather than to either branch's, and a clean auto-merge
   * is not evidence that it was: this position was chosen, not inherited.
   */
  EVERYDAY_CAMPAIGN,
  /*
   * Appended last, per the fault-ordering rule stated at SHIFT_REPORT — **and this pair is the one
   * the rule bites hardest on**, which is why they go here rather than where their branch had them
   * (its own end, four surfaces up from this one).
   *
   * § 11's workshop re-renders the dispatcher library's term rows, its cost line and its maths
   * disclosure, and every one of those shares a wording with `EDITOR`, `CONTROLS`,
   * `EDITED_PROFILE` and `RULES_EDITOR`. § 12's bench re-seeds a suite index — cells, replication
   * counts, a verdict — which is `BATCH_REPORT`'s and `SUITE_BENCH`'s shape exactly. Placed
   * earlier, these two would have taken editor-shaped and batch-shaped faults off six surfaces at
   * once, which is more re-mapping than any single insertion in this array has ever risked.
   */
  EVERYDAY_WORKSHOP,
  EVERYDAY_BENCH,
  /*
   * Appended last, per the fault-ordering rule stated at SHIFT_REPORT: `docs/21` § 3.6's family
   * controls.
   *
   * Its branch's note read *"re-renders nothing another adapter draws, but the rule is about
   * position, and the position for a new adapter is the end"* — and the second clause is why the
   * first one not surviving the merge costs nothing. That branch did not carry § 11's workshop,
   * which now seeds the dispatcher library's term rows and cost line two entries above; whether
   * this panel's block frame shares a wording with any of them is **unmeasured here**, and the
   * end of the array is the position that does not require it to be measured.
   *
   * The claim is therefore withdrawn rather than restated. What is left is the rule, which was
   * always the load-bearing half.
   */
  FAMILY_CONTROLS,
]);

/** Every declaration the adapter set claims to drive, as `<module>#<export>`. */
export function coveredDeclarations(): ReadonlySet<string> {
  const covered = new Set<string>();
  for (const adapter of SURFACE_ADAPTERS) for (const id of adapter.covers) covered.add(id);
  return covered;
}

/** Render every surface, in order. Never throws for a surface that has nothing to say. */
export function renderAll(context: HonestyContext): readonly RenderedText[] {
  const texts: RenderedText[] = [];
  for (const adapter of SURFACE_ADAPTERS) texts.push(...adapter.render(context));
  return texts;
}

/** Whether the case's own run had its estimates refused. The one gate, asked once (R9). */
export function suppressionOf(recording: VizRecording): boolean {
  return meansAreSuppressed(recording);
}

export { batchReport, evidenceFrom };
