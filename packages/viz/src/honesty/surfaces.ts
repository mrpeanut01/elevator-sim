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
 * `drawScene`, `drawOverlay` and `drawPreview` are the surfaces a player actually looks at, and
 * they take a `Canvas2DLike` — a **structural** interface with `fillText` on it and no DOM
 * anywhere. So they are driven with a context that records every `fillText`, and every string the
 * bitmap would have carried is checked exactly like a string a function returned. A search over
 * the experience layer that exempted the canvas would exempt the screen.
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

import type {
  DispatcherProfiles,
  ElevatorSpecs,
  ResolvedBuilding,
  TrafficProfiles,
} from '@elevator-sim/core/browser';

import { restrictedFloorIds } from '../access/zoning.js';
import { credentialLensFor, describeCredentialLens, LENS_LEGEND, LENS_OPERATIONAL_NOTE, STATE_WORDS } from '../access/zoning.js';
import { checkAccessCompatibility, credentialCapabilityOf } from '../access/dispatcherCredentials.js';
import { describeLockedOut, lockedOutLandingsAt, type LockedOutLanding } from '../access/lockedOut.js';
import { batchReport, type BatchReport } from '../batch/report.js';
import { BATCH_METRIC_CLASS, BATCH_METRIC_PRESENTATION, BATCH_METRICS, type BatchResult } from '../batch/types.js';
import { briefingFor } from '../campaign/brief.js';
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
import { disclosureItems } from '../mode/disclosure.js';
import { parityRefusal, parityViolations } from '../mode/parity.js';
import { SIGNED_OUT, formIssues, postingRefusal, signedIn, updateForm } from '../menu/account.js';
import { catalogueOf, type CatalogueSource } from '../menu/catalogue.js';
import { screenOf } from '../menu/screens.js';
import { DEFAULT_SETTINGS, MENU_SCREENS } from '../menu/types.js';
import { CLIENT_FAILURES } from '../menu/client.js';
import { canStart, freePlayIssues } from '../menu/menu.js';
import { itemsIn, VIEW_MODES, type DisclosureOrigin } from '../mode/types.js';
import { OPERATIONAL_ZONING_NOTE } from '../editor/editorEdits.js';
import { previewGeometry } from '../editor/editorPreview.js';
import { summariseReport, validateBuilding, type ValidationReport } from '../editor/editorValidate.js';
import { frameAt } from '../frame/frameAt.js';
import { landingAssignmentsAt, meansAreSuppressed, overlayAt, queueAt, type FloorQueue, type LandingAssignment } from '../frame/overlay.js';
import { WAIT_BANDS, moodAt, waitBandsAt } from '../live/bands.js';
import { decisionRowsAt } from '../live/decisions.js';
import { honestyAt } from '../live/honesty.js';
import { phaseAt, timelineOf } from '../live/timeline.js';
import { verifyReplay } from '../record/document.js';
import { DEFAULT_THEME, drawScene, describeSelection, landingOptionLabel, type Canvas2DLike, type SceneSelection } from '../render/canvas.js';
import { describeFrame } from '../render/describeFrame.js';
import { buildLayout } from '../render/layout.js';
import { buildingMood, moodObservationsOf, type BuildingMood } from '../render/mood.js';
import { drawOverlay } from '../render/overlay.js';
import { describePreview, drawPreview } from '../render/preview.js';
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
import {
  dwellHintOf,
  flagLineOf,
  flagRowsOf,
  leverRowsOf,
  termRowsOf,
} from '../dev/dispatcherEditor.js';
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
  statRowsOf,
  streakLineOf,
} from '../dev/leftRail.js';
import { machineRowsOf, ratedSpeedChipsOf, speedLadderOf } from '../dev/machinesEditor.js';
import {
  diagnosisRowsOf,
  emptyReportView,
  figureViewOf,
  goalRowViewOf,
  reportViewOf,
} from '../dev/reportPanel.js';
import {
  buildingPlateOf,
  dispatcherBlurbOf,
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
import { baseDemandOf, eventFor, SHIFT_EVENTS, shiftRunPatch } from '../shift/events.js';
import { bestLineFor, goalsForDay, readGoal, readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import {
  averageWaitFigure,
  clockRange,
  dayReportOf,
  NOT_RECORDED,
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
import { restoreNoticeFor } from '../persist/notice.js';
import { loadSession } from '../persist/session.js';
import { SESSION_SCHEMA_VERSION, type SessionRestoreFailure, type SessionStore } from '../persist/types.js';
import { closeDay, openEndless, openWeek, outcomeOf } from '../shift/week.js';
import { coachWeekLines } from '../shift/weekLabel.js';

import type { HonestyCase, RenderedText, TextProvenance, TextRole } from './types.js';

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
  covers: ['render/describeFrame.ts#describeFrame'],
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
        }),
        role: 'prose',
      });
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
          });
        }
        for (const [index, bank] of metrics.banks.entries()) {
          if (bank.meanWaitS === undefined) continue;
          seeds.push({
            field: `overlayAt(@${at.toFixed(0)}s).banks[${String(index)}].meanWaitS`,
            text: `${bank.bankId} mean wait ${bank.meanWaitS.toFixed(1)} s`,
            role: 'estimate',
            gated: true,
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
    'render/overlay.ts#drawOverlay',
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
      overlayWidthPx: 240,
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
      const ctx = textCapturingContext();
      drawScene(ctx, {
        recording,
        frame: bundle.frame,
        layout,
        overlay: bundle.metrics,
        ...(selection === undefined ? {} : { selection }),
        unservedFloorIds: unservedFloors(recording),
        unansweredCallFloorIds: bundle.unanswered,
        lockedOutLandings: bundle.lockedOut,
        queues: bundle.queues,
        mood: bundle.mood,
      });
      for (const [index, text] of ctx.texts.entries()) {
        seeds.push({ field: `drawScene(@${at.toFixed(0)}s).fillText[${String(index)}]`, text, role: 'prose' });
      }
      const overlayCtx = textCapturingContext();
      drawOverlay(overlayCtx, {
        recording,
        frame: bundle.frame,
        metrics: bundle.metrics,
        layout,
        theme: DEFAULT_THEME,
      });
      for (const [index, text] of overlayCtx.texts.entries()) {
        seeds.push({ field: `drawOverlay(@${at.toFixed(0)}s).fillText[${String(index)}]`, text, role: 'prose' });
      }
      if (selection !== undefined) {
        seeds.push({ field: `describeSelection(@${at.toFixed(0)}s)`, text: describeSelection(selection), role: 'prose' });
      }
      for (const [index, assignment] of bundle.assignments.slice(0, 4).entries()) {
        seeds.push({
          field: `landingOptionLabel(@${at.toFixed(0)}s)[${String(index)}]`,
          text: landingOptionLabel(assignment),
          role: 'label',
        });
      }
    }
    return singleRun(this.id, seeds);
  },
};

const MOOD: SurfaceAdapter = {
  id: 'render/mood.ts#buildingMood',
  covers: ['render/mood.ts#buildingMood'],
  render(context) {
    const seeds: TextSeed[] = [];
    for (const at of sampleTimes(context.recording)) {
      const { mood } = context.bundleAt(at);
      seeds.push({ field: `mood(@${at.toFixed(0)}s).headline`, text: mood.headline, role: 'observation' });
      if (mood.caveat !== '') {
        seeds.push({ field: `mood(@${at.toFixed(0)}s).caveat`, text: mood.caveat, role: 'prose' });
      }
      for (const [index, driver] of mood.drivers.entries()) {
        seeds.push({
          field: `mood(@${at.toFixed(0)}s).drivers[${String(index)}](${driver.id})`,
          text: `${driver.label}: ${driver.text}`,
          role: 'observation',
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

    for (const at of sampleTimes(recording)) {
      const stamp = at.toFixed(0);
      const mood = moodAt(recording, at);
      seeds.push({ field: `mood(@${stamp}s).headline`, text: mood.headline, role: 'observation' });
      seeds.push({ field: `mood(@${stamp}s).sub`, text: mood.sub, role: 'observation' });

      const bands = waitBandsAt(recording, at);
      for (const entry of bands.counts) {
        seeds.push({
          field: `bands(@${stamp}s).${entry.band.id}`,
          text: `${entry.band.label} ${String(entry.count)}`,
          role: 'observation',
          declaredCount: bands.total,
          countShown: true,
        });
      }

      const segment = phaseAt(recording, at);
      if (segment !== undefined) {
        seeds.push({ field: `phaseAt(@${stamp}s)`, text: segment.title, role: 'observation' });
      }

      for (const [index, row] of decisionRowsAt(recording, at).entries()) {
        seeds.push({
          field: `decision(@${stamp}s)[${String(index)}].head`,
          text: row.head,
          role: 'label',
        });
        seeds.push({
          field: `decision(@${stamp}s)[${String(index)}].why`,
          text: row.why,
          role: 'observation',
        });
      }

      for (const mode of ['casual', 'engineer'] as const) {
        const card = honestyAt(recording, at, mode);
        seeds.push({ field: `honesty(${mode}, @${stamp}s).title`, text: card.title, role: 'prose' });
        seeds.push({ field: `honesty(${mode}, @${stamp}s).plain`, text: card.plain, role: 'prose' });
        if (card.maths !== undefined) {
          seeds.push({
            field: `honesty(${mode}, @${stamp}s).maths`,
            text: card.maths,
            // The refusal's own words when there is one; counts and thresholds otherwise.
            role: card.suppressed ? 'reason' : 'observation',
            declaredCount: recording.summary.waitCount,
            countShown: true,
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
          });
          if (plan.reliefText !== undefined) {
            seeds.push({
              field: `planQueueRow(@${at.toFixed(0)}s, ${queue.floorId}, ${mode}).reliefText`,
              text: plan.reliefText,
              role: 'observation',
            });
          }
        }
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
  covers: ['record/document.ts#verifyReplay'],
  render(context) {
    const verdict = verifyReplay(context.recording, context.recording);
    return singleRun(this.id, [{ field: 'verifyReplay.message', text: verdict.message, role: 'observation' }]);
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
  covers: ['batch/report.ts#batchReport', 'batch/types.ts#BATCH_METRIC_PRESENTATION'],
  render(context) {
    const report = context.report;
    const seeds: (TextSeed & { comparison?: RenderedText['comparison'] })[] = [
      { field: 'demandClause', text: report.demandClause, role: 'label' },
      { field: 'crnSentence', text: report.crnSentence, role: 'prose' },
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
    'mode/disclosure.ts#BASIC_WINDOW_VALUE',
    'mode/parity.ts#parityViolations',
    'mode/parity.ts#parityRefusal',
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
 * `goalsForDay` alternates its third bar on `day % 2` — even days ask a reader to hold a landing's
 * depth, odd days ask that nobody crosses the abandonment horizon — so a single day would leave
 * one of the two goal sentences unrendered on every case of every campaign. Day 1 and day 4 also
 * split the two branches of `contractLineFor` and `taughtFor`: day 1 runs the building's **own**
 * scenario, day 4 runs it as *a building the reader drew*, which is the branch that prints
 * *"nothing is being banked"*.
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

function shiftBundleOf(context: HonestyContext): ShiftBundle {
  const hit = SHIFT_BUNDLES.get(context);
  if (hit !== undefined) return hit;

  const { recording } = context;
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const dispatcherName =
    context.profiles.find((profile) => profile.id === recording.dispatcherProfileId)?.name ??
    recording.dispatcherProfileId;

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
    const event = eventFor(day, dayIdx);
    const outcome = outcomeOf({
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
      dispatcherName,
      dayStartS: DAY_START_S,
    };
    const report = dayReportOf({ ...common, subject: { kind: 'week-day' } }) as WeekDayReport;
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
    }) as SingleRunReport;
    return { day, dayIdx, contract, event, goals, readings, week, banked, report, singleRunReport };
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
      for (const reading of report.goals) {
        seeds.push({
          field: `${at}.goals(${reading.goal.id}).label`,
          text: reading.goal.label,
          role: 'label',
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
      const bands = waitBandsAt(recording, at);
      const view = moodViewOf(bands, moodOf(bands));
      seeds.push({ field: `moodViewOf(@${stamp}s).headline`, text: view.headline, role: 'observation' });
      seeds.push({ field: `moodViewOf(@${stamp}s).sub`, text: view.sub, role: 'observation' });
      seeds.push({
        field: `moodViewOf(@${stamp}s).barLabel`,
        text: view.barLabel,
        role: 'observation',
        declaredCount: bands.total,
        countShown: true,
      });
      for (const entry of view.legend) {
        seeds.push({
          field: `moodViewOf(@${stamp}s).legend(${entry.bandId})`,
          text: `${entry.label} ${String(entry.count)}`,
          role: 'observation',
          declaredCount: bands.total,
          countShown: true,
        });
      }

      const live = observationsAt(recording, at);
      for (const row of statRowsOf(live)) {
        seeds.push({
          field: `statRowsOf(@${stamp}s).${row.label}.value`,
          text: `${row.label}: ${row.value}`,
          role: 'observation',
        });
        seeds.push({
          field: `statRowsOf(@${stamp}s).${row.label}.title`,
          text: row.title,
          role: 'prose',
        });
      }
      seeds.push({
        field: `servedCaptionFor(@${stamp}s)`,
        text: servedCaptionFor(live.longWaitThresholdS),
        role: 'label',
      });
      seeds.push({
        field: `servedTitleFor(@${stamp}s)`,
        text: servedTitleFor(live.longWaitThresholdS, live.servedCount),
        role: 'prose',
        declaredCount: live.servedCount,
        countShown: true,
      });

      for (const driver of moodDriverRowsOf(context.bundleAt(at).mood)) {
        seeds.push({
          field: `moodDriverRowsOf(@${stamp}s).${driver.label}`,
          text: `${driver.label}: ${driver.glyph} ${driver.text}`,
          role: 'observation',
        });
      }

      for (const mode of ['casual', 'engineer'] as const) {
        for (const showMaths of [false, true]) {
          const disclosure = mathsDisclosureOf(honestyAt(recording, at, mode), showMaths, mode);
          seeds.push({
            field: `mathsDisclosureOf(${mode}, showMaths=${String(showMaths)}, @${stamp}s).toggleLabel`,
            text: disclosure.toggleLabel,
            role: 'label',
          });
          if (disclosure.mathsHidden || disclosure.maths === '') continue;
          seeds.push({
            field: `mathsDisclosureOf(${mode}, showMaths=${String(showMaths)}, @${stamp}s).maths`,
            text: disclosure.maths,
            // `honestyAt` already asked `meansAreSuppressed`; a suppressed card's maths is the
            // refusal's own arithmetic, and everything else in that slot is a count or a threshold.
            role: context.suppressed ? 'reason' : 'observation',
            declaredCount: recording.summary.waitCount,
            countShown: true,
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
      for (const row of goalRowsOf(entry.readings)) {
        seeds.push({
          field: `${at}.goalRowsOf(${row.label}).value`,
          // The glyph is never the only signal — KB-15 — so the row is driven as a reader sees it.
          text: `${row.glyph} ${row.label} — ${row.value}`,
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
 */
const REPORT_PANEL: SurfaceAdapter = {
  id: 'dev/reportPanel.ts#reportViewOf',
  covers: [
    'dev/reportPanel.ts#reportViewOf',
    'dev/reportPanel.ts#figureViewOf',
    'dev/reportPanel.ts#goalRowViewOf',
    'dev/reportPanel.ts#diagnosisRowsOf',
    'dev/reportPanel.ts#emptyReportView',
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
      const at = `day${String(entry.day)}.${shaped.of}`;
      const view = reportViewOf(shaped);
      seeds.push({ field: `${at}.title`, text: view.title, role: 'label' });
      seeds.push({ field: `${at}.lede`, text: view.lede, role: 'observation' });
      for (const [index, cell] of view.figures.entries()) {
        const source = entry.report.figures[index];
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
        const row = goalRowViewOf(firstReading);
        seeds.push({ field: `${at}.goalRowViewOf.help`, text: row.help, role: 'label' });
      }
      const firstFigure = entry.report.figures[0];
      if (firstFigure !== undefined) {
        const cell = figureViewOf(firstFigure);
        seeds.push({
          field: `${at}.figureViewOf(${cell.label})`,
          text: `${cell.label}: ${cell.value}`,
          role: reportFigureShape(firstFigure).role,
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

    /* The empty sheet, which is drawn rather than hidden — § 2.2. */
    const empty = emptyReportView();
    seeds.push({ field: 'emptyReportView.title', text: empty.title, role: 'label' });
    seeds.push({ field: 'emptyReportView.lede', text: empty.lede, role: 'prose' });
    if (empty.framing.kind === 'week-day') {
      seeds.push({ field: 'emptyReportView.nextDayLabel', text: empty.framing.nextDayLabel, role: 'label' });
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
    'dev/rightRail.ts#dispatcherPlateOf',
    'dev/rightRail.ts#dispatcherBlurbOf',
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

    /* R2 — the dispatcher list, every shipped profile. */
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
      for (const row of dispatcherPlateOf(profile)) {
        seeds.push({
          field: `dispatcherPlateOf(${profile.id}).${row.k}`,
          text: `${row.k}: ${row.v}`,
          role: 'label',
        });
        if (row.help !== undefined) {
          seeds.push({
            field: `dispatcherPlateOf(${profile.id}).${row.k}.help`,
            text: row.help,
            role: 'prose',
          });
        }
      }
    }

    /* R3 — the building plate, with a run and without one. */
    for (const [label, recording] of [
      ['with-run', context.recording],
      ['no-run', undefined],
    ] as const) {
      for (const row of buildingPlateOf(context.building, recording)) {
        seeds.push({
          field: `buildingPlateOf(${label}).${row.k}`,
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
            field: `buildingPlateOf(${label}).${row.k}.help`,
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
const MENU: SurfaceAdapter = {
  id: 'menu/menu.ts#freePlayIssues',
  covers: [
    'menu/menu.ts#freePlayIssues',
    'menu/menu.ts#canStart',
    'menu/catalogue.ts#catalogueOf',
    'menu/catalogue.ts#buildingDetail',
    'menu/account.ts#formIssues',
    'menu/account.ts#postingRefusal',
    'menu/account.ts#signedIn',
    'menu/client.ts#CLIENT_FAILURES',
    'menu/screens.ts#screenOf',
    'menu/screens.ts#titleOf',
    'menu/screens.ts#applyIntent',
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
    }

    const whole = {
      buildingId: catalogue.buildings[0]?.id ?? '',
      dispatcherProfileId: catalogue.dispatchers[0]?.id ?? '',
      demandTemplateId: catalogue.demandTemplates[0]?.id ?? '',
      arrivalRatePctPop5min: null,
      durationS: 900,
      seed: '20260804',
    };
    const broken = { ...whole, buildingId: 'demolished', seed: 'not-a-seed', durationS: 7 };
    /*
     * A third selection, valid in every field and refused on a **cross-field** rule: the longest
     * template's own period against the shortest offered run. Driven separately because its
     * sentence carries two numbers a reader will act on, and a wrong one sends them to change the
     * axis that was already right.
     */
    const longest = [...catalogue.demandTemplates].sort(
      (left, right) => (right.minimumDurationS ?? 0) - (left.minimumDurationS ?? 0),
    )[0];
    const tooShort = { ...whole, demandTemplateId: longest?.id ?? whole.demandTemplateId, durationS: 300 };

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
     * actually lives. `postingRefusal` gets **both** of its arms — signed out, and signed in but
     * unconfirmed — because collapsing them is the specific mistake it exists to avoid.
     */
    const account = updateForm(SIGNED_OUT, { mode: 'register', email: 'nope', password: 'short' });
    for (const [index, issue] of formIssues(account.form).entries()) {
      seeds.push({
        field: `account.issue.${String(index)}.${issue.field}`,
        text: issue.message,
        role: 'reason',
      });
    }
    const player = { id: 'u1', email: 'p@example.test', displayName: 'A player', confirmed: false };
    for (const [label, state] of [
      ['signed-out', SIGNED_OUT],
      ['unconfirmed', signedIn(SIGNED_OUT, 'token', player)],
      ['confirmed', signedIn(SIGNED_OUT, 'token', { ...player, confirmed: true })],
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
    const menuStates = [
      { label: 'whole', selection: whole, canPost: true, hasRun: true, refusal: undefined },
      { label: 'broken', selection: broken, canPost: false, hasRun: false, refusal: undefined },
      {
        label: 'unrankable',
        selection: whole,
        canPost: true,
        hasRun: true,
        refusal:
          'day 7 grows the building by 66 % and schedules \u201cMove-in day\u201d, and neither travels with a selection',
      },
    ] as const;
    for (const arm of menuStates) {
      for (const screen of MENU_SCREENS) {
        const view = screenOf({
          state: { screen, history: [], settings: DEFAULT_SETTINGS, freePlay: arm.selection },
          catalogue,
          canPost: arm.canPost,
          hasRun: arm.hasRun,
          ...(arm.refusal === undefined ? {} : { rankingRefusal: arm.refusal }),
          boards: [{ configHash: 'abcdef0123456789', entries: 3 }],
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

export const SURFACE_ADAPTERS: readonly SurfaceAdapter[] = Object.freeze([
  RUN_SUMMARY,
  DESCRIBE_FRAME,
  OVERLAY,
  CANVAS,
  MOOD,
  LIVE_RAIL,
  RIDER_QUEUE,
  ACCESS,
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
