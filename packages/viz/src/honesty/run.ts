/**
 * Turning one {@link HonestyCase} into one verdict.
 *
 * The seam between the generator and the properties, and it is deliberately thin: it runs the
 * **shipped** `recordRun` and the **shipped** `runBatch`, assembles the context every adapter
 * reads, renders every surface, and hands the strings to `checkAll`. Nothing here selects
 * behaviour by building id or by profile name — a search run must be the same run a player gets,
 * or it proves nothing about the one they get.
 *
 * ## Failure taxonomy
 *
 * Three outcomes, and keeping them apart is what stops the campaign drowning its own findings:
 *
 * - **violations** — a property does not hold of a string the product would show. A finding.
 * - **skipped** — the case could not be evaluated. A shrink step that names a stage whose
 *   building the case no longer uses lands here, and is discarded rather than counted.
 * - **threw** — an exception that is not a property verdict. Always a finding.
 *
 * ## What is *not* a skip
 *
 * A run that saturates, times out, or refuses its own mean. Those are the interesting half of the
 * space — **M1** puts 46 of 60 shipped cells there — and a harness that skipped them would search
 * only the cases R3 has nothing to say about.
 */

import type {
  AccessZone,
  DispatcherProfile,
  DispatcherProfiles,
  ElevatorSpecs,
  ResolvedBuilding,
  SimulationConfig,
  TrafficProfiles,
} from '@elevator-sim/core/browser';

import { batchReport } from '../batch/report.js';
import { runBatch } from '../batch/runBatch.js';
import type { BatchRequest, BatchResources, BatchResult } from '../batch/types.js';
import { evidenceFrom } from '../campaign/failStates.js';
import { batchRequestForStage, demonstrationConfigFor } from '../campaign/stageRun.js';
import type { CampaignStage } from '../campaign/types.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { credentialCapabilityOf } from '../access/dispatcherCredentials.js';
import { recordRun } from '../record/recordRun.js';
import type { PublishedScenario } from '../scenario/published.js';
import { checkAll } from './properties.js';
import {
  memoisedBundles,
  renderAll,
  suppressionOf,
  type ControlSpace,
  type HonestyContext,
  type StageBundle,
} from './surfaces.js';
import type {
  HonestyCase,
  HonestyOutcome,
  RenderedText,
  TemporalReach,
  WithheldReach,
} from './types.js';

/**
 * Everything a case needs that is not the case.
 *
 * Assembled by the caller from `loadConfig(DATA_DIR)`, never fetched here: this module is
 * browser-facing and `boundaries.test.ts` refuses a `node:` import in it. The same split
 * `batch/types.ts#BatchResources` already uses, for the same reason.
 */
export interface HonestyResources {
  readonly buildingsById: ReadonlyMap<string, ResolvedBuilding>;
  /** The raw authored documents, for the editor surfaces. Keyed by building id. */
  readonly buildingDocumentsById: ReadonlyMap<string, unknown>;
  readonly dispatcherProfiles: DispatcherProfiles;
  readonly dispatcherProfilesById: ReadonlyMap<string, DispatcherProfile>;
  readonly trafficProfiles: TrafficProfiles;
  readonly elevatorSpecs: ElevatorSpecs;
  /** `collectSearchSpace()`, from `experiments`' environment-free barrel. */
  readonly space: ControlSpace;
  /** Stages by id, with their published row. Absent means no case may name a stage. */
  readonly stagesById?: ReadonlyMap<string, { readonly stage: CampaignStage; readonly published: PublishedScenario }> | undefined;
  readonly dimensionHelp: ReadonlyMap<string, string>;
  /**
   * Injected between rendering and checking, for `faults.ts` only.
   *
   * The one hook in this directory, and it exists for the reason `fuzz/run.ts`'s `createPolicy`
   * hook does: a property that has never failed is a property that cannot fail, and the only way
   * to show one firing is to break, on purpose, the exact thing it protects. The campaign never
   * passes it.
   */
  readonly corruptTexts?: ((texts: readonly RenderedText[], context: HonestyContext) => readonly RenderedText[]) | undefined;
}

function requireBuilding(resources: HonestyResources, id: string): ResolvedBuilding {
  const building = resources.buildingsById.get(id);
  if (building === undefined) throw new UnrunnableCase(`unknown building "${id}"`);
  return building;
}

function requireProfile(resources: HonestyResources, id: string): DispatcherProfile {
  const profile = resources.dispatcherProfilesById.get(id);
  if (profile === undefined) throw new UnrunnableCase(`unknown dispatcher profile "${id}"`);
  return profile;
}

/** A case the shipped data cannot express. A generator defect, never a finding. */
export class UnrunnableCase extends Error {
  override readonly name = 'UnrunnableCase';
}

/** What a case that rendered nothing reached on the temporal axis. Zero, not absent. */
const NO_TEMPORAL_REACH: TemporalReach = Object.freeze({
  atPlayhead: 0,
  early: 0,
  declaredNow: 0,
  declaredWholeRun: 0,
});

/** The same, for the withheld matrix. Zero cells in zero states, never an absent field. */
const NO_WITHHELD_REACH: WithheldReach = Object.freeze({ cells: 0, states: 0 });

/**
 * How far the withheld matrix reached into this case's strings — measured, never assumed.
 *
 * Counted after `corruptTexts` for {@link temporalReachOf}'s reason, and counting **states** as well
 * as cells because § 12.2's claim is about every combination: a corpus that marked a thousand cells
 * in four states would satisfy a cell count and leave twenty-eight combinations unswept.
 */
function withheldReachOf(texts: readonly RenderedText[]): WithheldReach {
  const states = new Set<string>();
  let cells = 0;
  for (const text of texts) {
    if (text.withheld === undefined) continue;
    cells += 1;
    states.add(text.withheld.state);
  }
  return { cells, states: states.size };
}

/**
 * How far the temporal axis reached into this case's strings — measured, never assumed.
 *
 * Counted **after** `corruptTexts`, from the same array the properties are handed, so a fault that
 * moved a string onto or off the axis is visible in the same numbers the check saw. See
 * {@link TemporalReach} for why the counts are reported at all.
 */
function temporalReachOf(texts: readonly RenderedText[]): TemporalReach {
  let atPlayhead = 0;
  let early = 0;
  let declaredNow = 0;
  let declaredWholeRun = 0;
  for (const text of texts) {
    const at = text.playhead;
    if (at === undefined) continue;
    atPlayhead += 1;
    if (at.atS < at.endedAt) early += 1;
    if (at.basis === 'now') declaredNow += 1;
    if (at.basis === 'whole-run') declaredWholeRun += 1;
  }
  return { atPlayhead, early, declaredNow, declaredWholeRun };
}

/** The stage a case names, with its published row. `undefined` when the case names none. */
function stageOf(
  honestyCase: HonestyCase,
  resources: HonestyResources,
): { readonly stage: CampaignStage; readonly published: PublishedScenario } | undefined {
  if (honestyCase.stageId === null) return undefined;
  const entry = resources.stagesById?.get(honestyCase.stageId);
  if (entry === undefined) throw new UnrunnableCase(`unknown campaign stage "${honestyCase.stageId}"`);
  if (entry.stage.building !== honestyCase.buildingId) {
    throw new UnrunnableCase(
      `case names stage "${honestyCase.stageId}" (building ${entry.stage.building}) on building ` +
        `"${honestyCase.buildingId}" — a stage's goals may not be judged on a batch the stage never ran`,
    );
  }
  return entry;
}

/** The single replication every `single-run` surface is driven from. Exported so a case replays by hand. */
export function recordingConfigFor(
  honestyCase: HonestyCase,
  resources: HonestyResources,
): SimulationConfig {
  const staged = stageOf(honestyCase, resources);
  if (staged !== undefined) {
    /*
     * A stage case is driven through `campaign/stageRun.ts` — the module that exists so that
     * nothing can exercise a *second* construction of what a stage run is. Reassembling the
     * config here would be § D159's second false-negative variant, arriving in the instrument
     * built to find it.
     */
    return demonstrationConfigFor({
      stage: staged.stage,
      building: requireBuilding(resources, honestyCase.buildingId),
      dispatcherProfile: requireProfile(resources, staged.stage.dispatcher.startingProfileId),
      trafficProfiles: resources.trafficProfiles,
      elevatorSpecs: resources.elevatorSpecs,
      dispatcherProfiles: resources.dispatcherProfiles,
      replication: 0,
    });
  }
  return {
    building: requireBuilding(resources, honestyCase.buildingId),
    dispatcherProfile: requireProfile(resources, honestyCase.baselineProfileId),
    dispatcherProfiles: resources.dispatcherProfiles,
    trafficProfiles: resources.trafficProfiles,
    elevatorSpecs: resources.elevatorSpecs,
    seed: BigInt(honestyCase.simSeed),
    durationS: honestyCase.durationS,
    // The viewer's own setting. A run that threw on a timeout would remove from the search
    // exactly the buildings `docs/10` § 0 says the honest state space is mostly made of.
    onTimeout: 'report',
    runId: honestyCase.caseId,
    ...(honestyCase.arrivalRatePctPop5min === null
      ? {}
      : { demand: { arrivalRatePctPop5min: honestyCase.arrivalRatePctPop5min } }),
  };
}

/**
 * The **second** replication a case runs — the run a pairing surface differences against.
 * GitHub issue #127.
 *
 * ## Why a second simulation, when the corpus is measured in simulations
 *
 * `dev/reportPanel.ts#reportViewOf` takes a `previous` sheet, and the corpus handed it none — so
 * `ReportDeltaView`'s caption, both arms of its note and every paired row were rendered by nothing,
 * on a block § D310 draws on **two** surfaces. Half of that is reachable without a second run: two
 * sheets of one recording pair as *nothing moved*, and two sheets of different questions refuse. The
 * half that is not is the one the block exists for — **a dispatcher swap on one configuration**,
 * where the figures actually differ and the block prints rows. A corpus that drove only the empty
 * arms would have swept the block's frame and not its content.
 *
 * So the case's **candidate** arm is run once at single-run scale, which is a change of one
 * simulation per case against a batch of `2 × replications`. It is the candidate rather than an
 * invented profile because the case already names it: `HonestyCase.candidateProfileId` is the arm
 * `batchRequestFor` puts opposite the baseline, and drawing a different dispatcher here would search
 * a comparison the case is not about.
 *
 * **When the two arms are the same profile this is bit-identical to {@link recordingConfigFor}'s
 * run**, which is not a defect and is not special-cased: `caseFromSeed` draws the identical-arm
 * control at `identicalArmProbability`, and on those cases the pairing correctly renders *nothing
 * moved* — § D223's *"the same day simulated again … it reproduces exactly"*, which is a shipped
 * state a reader reaches by pressing Run twice. The corpus therefore reaches both arms of the note
 * by construction rather than by a flag set here.
 *
 * Derived from {@link recordingConfigFor} rather than reassembled, for that function's own stated
 * reason: a second construction of *what a case's run is* is § D159's second false-negative variant
 * arriving inside the instrument built to find it. `runId` is the only other field that moves, so
 * the two recordings are distinguishable in a counterexample.
 */
export function comparisonConfigFor(
  honestyCase: HonestyCase,
  resources: HonestyResources,
): SimulationConfig {
  return {
    ...recordingConfigFor(honestyCase, resources),
    dispatcherProfile: requireProfile(resources, honestyCase.candidateProfileId),
    runId: `${honestyCase.caseId}-candidate`,
  };
}

/** The batch every `batch` surface is driven from. Exported for the same reason. */
export function batchRequestFor(
  honestyCase: HonestyCase,
  resources: HonestyResources,
): BatchRequest {
  const staged = stageOf(honestyCase, resources);
  if (staged !== undefined) {
    return batchRequestForStage(staged.stage, honestyCase.candidateProfileId);
  }
  return {
    buildingId: honestyCase.buildingId,
    seed: honestyCase.simSeed,
    durationS: honestyCase.durationS,
    replications: honestyCase.replications,
    arms: [
      { armId: 'shipped', dispatcherProfileId: honestyCase.baselineProfileId },
      { armId: 'yours', dispatcherProfileId: honestyCase.candidateProfileId },
    ],
    arrivalRatePctPop5min: honestyCase.arrivalRatePctPop5min,
  };
}

function batchResourcesFor(honestyCase: HonestyCase, resources: HonestyResources): BatchResources {
  return {
    building: requireBuilding(resources, honestyCase.buildingId),
    dispatcherProfiles: resources.dispatcherProfiles,
    trafficProfiles: resources.trafficProfiles,
    elevatorSpecs: resources.elevatorSpecs,
  };
}

function stageBundleFor(
  honestyCase: HonestyCase,
  resources: HonestyResources,
  recording: Parameters<typeof evidenceFrom>[0]['recording'],
  access: { readonly restrictedFloorIds: readonly string[]; readonly carriesCredential: boolean },
): StageBundle | undefined {
  const entry = stageOf(honestyCase, resources);
  if (entry === undefined) return undefined;
  return {
    stage: entry.stage,
    published: entry.published,
    dimensionIds: resources.space.ids,
    dimensionHelp: resources.dimensionHelp,
    evidence: evidenceFrom({
      recording,
      replication: 0,
      seed: honestyCase.simSeed,
      restrictedFloorIds: access.restrictedFloorIds,
      carriesCredential: access.carriesCredential,
    }),
  };
}

/** Assemble everything an adapter reads, running the two simulations a case needs. */
export function contextFor(honestyCase: HonestyCase, resources: HonestyResources): HonestyContext {
  const building = requireBuilding(resources, honestyCase.buildingId);
  const profile = requireProfile(resources, honestyCase.baselineProfileId);
  requireProfile(resources, honestyCase.candidateProfileId);

  const { recording } = recordRun(recordingConfigFor(honestyCase, resources));
  /* The run a pairing surface differences against — see {@link comparisonConfigFor}. */
  const comparison = recordRun(comparisonConfigFor(honestyCase, resources)).recording;
  const batch: BatchResult = runBatch(
    batchRequestFor(honestyCase, resources),
    batchResourcesFor(honestyCase, resources),
  );

  const floorIds = building.floors.map((floor) => floor.id);
  const accessZones: readonly AccessZone[] | undefined = building.accessZones;
  const access = {
    restrictedFloorIds: restrictedFloorIds(floorIds, accessZones),
    carriesCredential: credentialCapabilityOf(profile).carriesCredential,
  };

  return {
    case: honestyCase,
    recording,
    comparisonRecording: comparison,
    suppressed: suppressionOf(recording),
    batch,
    report: batchReport(batch),
    stage: stageBundleFor(honestyCase, resources, recording, access),
    access,
    space: resources.space,
    buildingDocument: resources.buildingDocumentsById.get(honestyCase.buildingId) ?? {},
    elevatorSpecs: resources.elevatorSpecs,
    profiles: resources.dispatcherProfiles.profiles,
    accessZones,
    floorIds,
    buildingName: building.name,
    building,
    buildings: [...resources.buildingsById.values()],
    trafficProfiles: resources.trafficProfiles,
    dispatcherProfiles: resources.dispatcherProfiles,
    bundleAt: memoisedBundles(recording, access),
  };
}

/**
 * Run one case, render every surface, and check all seven properties against what it said.
 *
 * Never throws for a case-level problem: every failure mode becomes a field on the outcome, so a
 * campaign of hundreds reports hundreds of verdicts rather than stopping at the first interesting
 * one.
 */
export function evaluateCase(honestyCase: HonestyCase, resources: HonestyResources): HonestyOutcome {
  let context: HonestyContext;
  try {
    context = contextFor(honestyCase, resources);
  } catch (error) {
    if (error instanceof UnrunnableCase) {
      return {
        case: honestyCase,
        violations: [],
        skipped: 'unrunnable',
        textCount: 0,
        surfacesExercised: [],
        simulations: 0,
        suppressed: false,
        temporal: NO_TEMPORAL_REACH,
        withheld: NO_WITHHELD_REACH,
      };
    }
    return {
      case: honestyCase,
      violations: [],
      threw: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      textCount: 0,
      surfacesExercised: [],
      simulations: 0,
      suppressed: false,
      temporal: NO_TEMPORAL_REACH,
      withheld: NO_WITHHELD_REACH,
    };
  }

  /*
   * Counted from the batch that actually ran, not from the case: a stage case runs the stage's
   * own declared replications, and a cost report derived from the wrong number is decoration.
   *
   * **Two**, not one, since issue #127: the case's own run and the candidate run a pairing surface
   * differences against ({@link comparisonConfigFor}). Counted here rather than left at 1 because
   * this figure is published — `docs/05-roadmap.md` carries it beside the corpus size — and a cost
   * that under-reports by a run per case is the class of stale number CLAUDE.md's own
   * *"pin it to the run that produced it"* is about.
   */
  const simulations =
    2 + context.batch.arms.reduce((total, arm) => total + arm.replications.length, 0);
  try {
    const rendered = renderAll(context);
    const texts = resources.corruptTexts === undefined ? rendered : resources.corruptTexts(rendered, context);
    const surfaces = [...new Set(texts.map((text) => text.surfaceId))].sort((a, b) => a.localeCompare(b));
    return {
      case: honestyCase,
      violations: Object.freeze(checkAll(context, texts)),
      textCount: texts.length,
      surfacesExercised: Object.freeze(surfaces),
      simulations,
      suppressed: context.suppressed,
      temporal: temporalReachOf(texts),
      withheld: withheldReachOf(texts),
    };
  } catch (error) {
    return {
      case: honestyCase,
      violations: [],
      threw: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      textCount: 0,
      surfacesExercised: [],
      simulations,
      suppressed: context.suppressed,
      temporal: NO_TEMPORAL_REACH,
      withheld: NO_WITHHELD_REACH,
    };
  }
}

/** Whether an outcome is a finding: a violated property, or an exception that is not a skip. */
export function isFailure(outcome: HonestyOutcome): boolean {
  return outcome.violations.length > 0 || outcome.threw !== undefined;
}
