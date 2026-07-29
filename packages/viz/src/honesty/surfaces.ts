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
import { itemsIn, VIEW_MODES, type DisclosureOrigin } from '../mode/types.js';
import { OPERATIONAL_ZONING_NOTE } from '../editor/editorEdits.js';
import { previewGeometry } from '../editor/editorPreview.js';
import { summariseReport, validateBuilding, type ValidationReport } from '../editor/editorValidate.js';
import { frameAt } from '../frame/frameAt.js';
import { landingAssignmentsAt, meansAreSuppressed, overlayAt, queueAt, type FloorQueue, type LandingAssignment } from '../frame/overlay.js';
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
    moveTo() {},
    lineTo() {},
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
 * ## Why both modes, when `HONESTY_MODES` currently names one
 *
 * A `DisclosureItem` carries **both** renderings at once — that is what makes parity a comparison
 * rather than a re-derivation — so a mode is a projection of one datum, not a second run. Driving
 * only `context.case.mode` would leave every Basic string unsearched while the corpus looked
 * complete, and the Basic strings are the ones with new prose in them: `SUPPRESSION_LEAD`, the
 * plain-language locked-out note, `BASIC_WINDOW_VALUE`. Both projections cost one call.
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
    seeds.push({ field: 'judge.headline', text: verdict.headline, role: 'goal', goal: { rateShown: /\b\d+\s*(?:of|\/)\s*\d+\b/.test(verdict.headline), seeds: context.batch.arms[0]?.replications.length ?? 0 } });
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

/**
 * Every surface the search drives.
 *
 * The order is the order a reader meets them: the run, the picture, the panel, the batch, the
 * campaign. Nothing branches on it.
 */
export const SURFACE_ADAPTERS: readonly SurfaceAdapter[] = Object.freeze([
  RUN_SUMMARY,
  DESCRIBE_FRAME,
  OVERLAY,
  CANVAS,
  MOOD,
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
