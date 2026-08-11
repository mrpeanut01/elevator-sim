/**
 * What running a case **is** — the two configs, the pair of runs, and the measurement.
 *
 * `campaign/stageRun.ts`'s rule, transplanted: this module is the only statement anywhere of how
 * a case's runs are built, the panel calls it, and the validation suite calls it. A test that
 * assembled its own `SimulationConfig` would vouch for a reimplementation of the call site.
 *
 * ## The basis
 *
 * **Two single runs sharing the traffic seed** — as-built against as-repaired. The spec's own
 * copy claims exactly that basis (§ 10.4: *"one run before, one run after — enough to see a
 * repair this size; not enough to split hairs"*), and the basis line is printed verbatim under
 * every result. It is never presented as a paired interval: one seed is one draw, and the surface
 * allowed to say *better* across seeds is the bench.
 *
 * ## How a patch becomes a run
 *
 * Fabric patches are applied to the **authored building document** and the result goes through
 * `parseBuilding` + `resolveBuilding` — the same door a shipped file enters by, so a patched
 * building the loader would refuse is refused here too (`dev/data.ts#resolveEdited`'s argument).
 * Dispatcher patches merge section-whole onto the case's named profile. The measurement then
 * reads the recording's own legs — never a summary statistic, because the complaint is scoped to
 * named floors and a window statistic has no floors in it.
 */

import {
  parseBuilding,
  resolveBuilding,
  type BuildingConfig,
  type DispatcherProfile,
  type DispatcherProfiles,
  type ElevatorSpecs,
  type ResolvedBuilding,
  type SimulationConfig,
  type TrafficProfiles,
} from '@elevator-sim/core/browser';

import type { VizLeg, VizRecording } from '../contract/types.js';
import { recordRun, type RecordedRun } from '../record/recordRun.js';
import type { FixitMeasurement } from './engine.js';
import type { ComplaintMeasure, ComplaintScope, FigureSpec, FixitCase, FixitPatch, FixitState } from './types.js';

/* -------------------------------------------------------------------------- *
 * Patch application
 * -------------------------------------------------------------------------- */

interface MutableCar {
  id: string;
  ratedSpeedMps?: number;
  ratedLoadLb?: number;
  dwellCarCallS?: number;
  dwellHallCallS?: number;
  [key: string]: unknown;
}

interface MutableBank {
  id: string;
  cars: MutableCar[];
  [key: string]: unknown;
}

interface MutableBuildingDocument {
  floors?: { id: string; population?: number; [key: string]: unknown }[];
  banks?: MutableBank[];
  totalPopulation?: number;
  [key: string]: unknown;
}

function carsOf(doc: MutableBuildingDocument, carIds: readonly string[]): MutableCar[] {
  const all = (doc.banks ?? []).flatMap((bank) => bank.cars);
  if (carIds.length === 1 && carIds[0] === '*') return all;
  const byId = new Map(all.map((car) => [car.id, car]));
  return carIds.map((id) => {
    const car = byId.get(id);
    if (car === undefined) {
      throw new Error(`fixit: a patch names car "${id}", which this building does not have.`);
    }
    return car;
  });
}

/** Apply one fabric patch to a cloned authored document. Throws on a name nothing matches. */
function applyBuildingPatch(doc: MutableBuildingDocument, patch: NonNullable<FixitPatch['building']>): void {
  for (const population of patch.floorPopulations ?? []) {
    for (const floorId of population.floorIds) {
      const floor = (doc.floors ?? []).find((candidate) => candidate.id === floorId);
      if (floor === undefined) {
        throw new Error(`fixit: a patch sets the population of floor "${floorId}", which this building does not declare as a floor.`);
      }
      floor.population = population.population;
    }
    // The declared total no longer describes the patched floors; drop it so the loader derives
    // the sum rather than warning about a mismatch the patch itself created.
    delete doc.totalPopulation;
  }
  if (patch.banks !== undefined) {
    doc.banks = patch.banks as MutableBank[];
  }
  for (const carPatch of patch.cars ?? []) {
    for (const car of carsOf(doc, carPatch.carIds)) {
      if (carPatch.set.ratedSpeedDeltaMps !== undefined) {
        if (typeof car.ratedSpeedMps !== 'number') {
          throw new Error(`fixit: car "${car.id}" declares no ratedSpeedMps for a speed delta to add to.`);
        }
        car.ratedSpeedMps += carPatch.set.ratedSpeedDeltaMps;
      }
      if (carPatch.set.dwellCarCallS !== undefined) car.dwellCarCallS = carPatch.set.dwellCarCallS;
      if (carPatch.set.dwellHallCallS !== undefined) car.dwellHallCallS = carPatch.set.dwellHallCallS;
    }
  }
  for (const added of patch.addCars ?? []) {
    const bank = (doc.banks ?? []).find((candidate) => candidate.id === added.bankId);
    if (bank === undefined) {
      throw new Error(`fixit: a patch adds a car to bank "${added.bankId}", which this building does not have.`);
    }
    const copied = bank.cars.find((candidate) => candidate.id === added.copyCarId);
    if (copied === undefined) {
      throw new Error(`fixit: a patch copies car "${added.copyCarId}", which bank "${added.bankId}" does not have.`);
    }
    bank.cars.push({ ...structuredClone(copied), id: added.id });
  }
}

/** Merge dispatcher sections over the base profile — each section shallow, replace-by-key. */
function applyDispatcherPatches(
  base: DispatcherProfile,
  patches: readonly FixitPatch[],
): DispatcherProfile {
  let profile: DispatcherProfile = base;
  for (const patch of patches) {
    const dispatcher = patch.dispatcher;
    if (dispatcher === undefined) continue;
    profile = {
      ...profile,
      ...(dispatcher.idle === undefined ? {} : { idle: { ...profile.idle, ...dispatcher.idle } }),
      ...(dispatcher.dispatch === undefined ? {} : { dispatch: { ...profile.dispatch, ...dispatcher.dispatch } }),
      ...(dispatcher.answer === undefined ? {} : { answer: { ...profile.answer, ...dispatcher.answer } }),
    } as DispatcherProfile;
  }
  return profile;
}

/** The machinery the editor bought, as a fabric patch at § 9's step sizes. */
function editorPatchOf(state: FixitState): FixitPatch {
  if (state.speedSteps === 0 && state.capacitySteps === 0) return {};
  return {
    building: {
      cars: [
        {
          carIds: ['*'],
          set: {
            ...(state.speedSteps === 0 ? {} : { ratedSpeedDeltaMps: 0.5 * state.speedSteps }),
          },
        },
      ],
    },
  };
}

/**
 * Capacity steps change `ratedLoadLb` directly rather than through {@link CarPatch}'s whitelist:
 * +300 lb is +2 places at the load table's own 150 lb seat, which is the contract's step.
 */
function applyCapacitySteps(doc: MutableBuildingDocument, steps: number): void {
  if (steps === 0) return;
  for (const car of carsOf(doc, ['*'])) {
    if (typeof car.ratedLoadLb !== 'number') {
      throw new Error(`fixit: car "${car.id}" declares no ratedLoadLb for a capacity step to add to.`);
    }
    car.ratedLoadLb += 300 * steps;
    if (typeof car['ratedLoadLbPerDeck'] === 'number') {
      car['ratedLoadLbPerDeck'] = (car['ratedLoadLbPerDeck'] as number) + 150 * steps;
    }
  }
}

/* -------------------------------------------------------------------------- *
 * The two configs
 * -------------------------------------------------------------------------- */

/**
 * What building a case needs from the loaded `data/` — a structural subset of
 * `dev/data.ts#BrowserResources`, declared here so this module (and its Node-side validation
 * suite) does not depend on the browser loader to describe the same five facts.
 */
export interface FixitResources {
  /** Authored document beside its resolution — `BuildingEntry`'s shape. */
  readonly entries: readonly { readonly config: BuildingConfig; readonly resolved: ResolvedBuilding }[];
  readonly elevatorSpecs: ElevatorSpecs;
  readonly trafficProfiles: TrafficProfiles;
  readonly dispatcherProfiles: DispatcherProfiles;
  readonly trafficProfileIds: ReadonlySet<string>;
}

/** The pair of configs a case is scored on. Pure — nothing here runs anything. */
export interface FixitRunPlan {
  readonly asBuilt: SimulationConfig;
  readonly asRepaired: SimulationConfig;
}

/**
 * Build both configs. Everything the passenger trace is a function of — building id, seed,
 * horizon, demand — comes off the **case** and is identical between the two; only the patches
 * differ, which is what sharing the traffic seed buys.
 */
export function fixitRunPlanOf(
  entry: FixitCase,
  state: FixitState,
  resources: FixitResources,
): FixitRunPlan {
  const repairPatches = entry.repairs
    .filter((repair) => state.selectedRepairIds.includes(repair.id))
    .map((repair) => repair.patch);
  return {
    asBuilt: configOf(entry, [entry.asBuilt.patch], 0, resources),
    asRepaired: configOf(
      entry,
      [entry.asBuilt.patch, ...repairPatches, editorPatchOf(state)],
      state.capacitySteps,
      resources,
    ),
  };
}

function configOf(
  entry: FixitCase,
  patches: readonly FixitPatch[],
  capacitySteps: number,
  resources: FixitResources,
): SimulationConfig {
  const authored = resources.entries.find((candidate) => candidate.resolved.id === entry.buildingId);
  if (authored === undefined) {
    throw new Error(`fixit: case "${entry.id}" names building "${entry.buildingId}", which this build does not ship.`);
  }
  const baseProfile = resources.dispatcherProfiles.profiles.find(
    (candidate) => candidate.id === entry.dispatcherProfileId,
  );
  if (baseProfile === undefined) {
    throw new Error(`fixit: case "${entry.id}" names dispatcher "${entry.dispatcherProfileId}", which this build does not ship.`);
  }

  const doc = structuredClone(authored.config) as unknown as MutableBuildingDocument;
  for (const patch of patches) {
    if (patch.building !== undefined) applyBuildingPatch(doc, patch.building);
  }
  applyCapacitySteps(doc, capacitySteps);
  // The same door a shipped file enters by — parse, then resolve against the loaded specs.
  const file = `${entry.buildingId}.json`;
  const building: ResolvedBuilding = resolveBuilding(
    parseBuilding(doc, file),
    resources.elevatorSpecs,
    { file, trafficProfileIds: resources.trafficProfileIds },
  );

  return {
    building,
    dispatcherProfile: applyDispatcherPatches(baseProfile, patches),
    trafficProfiles: resources.trafficProfiles,
    elevatorSpecs: resources.elevatorSpecs,
    dispatcherProfiles: resources.dispatcherProfiles,
    seed: BigInt(entry.run.seed),
    durationS: entry.run.durationS,
    // Three of the five shipped buildings routinely end a run with people still aboard;
    // under `throw` there is no recording to score. `stageRun.ts`'s reason, verbatim.
    onTimeout: 'report',
    ...(entry.run.arrivalRatePctPop5min === null
      ? {}
      : { demand: { arrivalRatePctPop5min: entry.run.arrivalRatePctPop5min } }),
  };
}

/** The pair, run. Decisions are not recorded — two runs' worth would be carried to no reader. */
export function runFixitPair(plan: FixitRunPlan): { readonly before: RecordedRun; readonly after: RecordedRun } {
  return {
    before: recordRun(plan.asBuilt, { recordDecisions: false }),
    after: recordRun(plan.asRepaired, { recordDecisions: false }),
  };
}

/* -------------------------------------------------------------------------- *
 * Measurement — the complaint and the rest, from the legs
 * -------------------------------------------------------------------------- */

function inScope(leg: VizLeg, scope: ComplaintScope): boolean {
  switch (scope.mode) {
    case 'origin':
      return scope.floorIds.includes(leg.originFloorId);
    case 'touches':
      return (
        scope.floorIds.includes(leg.originFloorId) || scope.floorIds.includes(leg.destinationFloorId)
      );
    case 'origin-to-destination':
      return (
        scope.floorIds.includes(leg.originFloorId) &&
        (scope.destinationFloorIds ?? []).includes(leg.destinationFloorId)
      );
  }
}

/** One run's scoped readings. Turned-away legs are outside both halves — they never waited. */
interface RunReadings {
  readonly scopeLegs: number;
  readonly scopeBoarded: number;
  readonly longWaits: number;
  readonly meanWaitS: number | null;
  readonly worstWaitS: number | null;
  readonly restBoarded: number;
  readonly restAwayPct: number | null;
}

function readingsOf(recording: VizRecording, measure: ComplaintMeasure): RunReadings {
  let scopeLegs = 0;
  let scopeBoarded = 0;
  let longWaits = 0;
  let waitSum = 0;
  let worst: number | null = null;
  let restBoarded = 0;
  let restUnder = 0;
  for (const leg of recording.legs) {
    if (leg.refusedAt !== undefined) continue;
    const wait = leg.boardedAt === undefined ? undefined : leg.boardedAt - leg.arrivedAt;
    if (inScope(leg, measure.scope)) {
      scopeLegs += 1;
      if (wait === undefined) {
        // A leg the run outlived is not a short wait: it counts against the complaint.
        longWaits += 1;
      } else {
        scopeBoarded += 1;
        waitSum += wait;
        if (wait >= measure.thresholdS) longWaits += 1;
        if (worst === null || wait > worst) worst = wait;
      }
    } else if (wait !== undefined) {
      restBoarded += 1;
      if (wait < measure.thresholdS) restUnder += 1;
    }
  }
  return {
    scopeLegs,
    scopeBoarded,
    longWaits,
    meanWaitS: scopeBoarded === 0 ? null : waitSum / scopeBoarded,
    worstWaitS: worst,
    restBoarded,
    restAwayPct: restBoarded === 0 ? null : (restUnder / restBoarded) * 100,
  };
}

function complaintValueOf(readings: RunReadings, measure: ComplaintMeasure): number | null {
  return measure.kind === 'long-waits' ? readings.longWaits : readings.meanWaitS;
}

/** The § 10.4 measurement over the pair. The engine's `classifyOutcome` consumes this. */
export function measuredOf(
  entry: FixitCase,
  before: VizRecording,
  after: VizRecording,
): FixitMeasurement {
  const measure = entry.complaint.measure;
  const b = readingsOf(before, measure);
  const a = readingsOf(after, measure);
  const complaintBefore = complaintValueOf(b, measure);
  const complaintAfter = complaintValueOf(a, measure);
  const gone =
    complaintBefore === null || complaintBefore <= 0 || complaintAfter === null
      ? null
      : Math.max(0, ((complaintBefore - complaintAfter) / complaintBefore) * 100);
  return {
    complaintBefore: complaintBefore ?? 0,
    complaintAfter: complaintAfter ?? 0,
    scopeBoardedBefore: b.scopeBoarded,
    scopeBoardedAfter: a.scopeBoarded,
    complaintGonePct: gone,
    restAwayBeforePct: b.restAwayPct,
    restAwayAfterPct: a.restAwayPct,
    restBoardedBefore: b.restBoarded,
    restBoardedAfter: a.restBoarded,
    restDeltaPoints:
      b.restAwayPct === null || a.restAwayPct === null ? null : a.restAwayPct - b.restAwayPct,
  };
}

/* -------------------------------------------------------------------------- *
 * The four figures — computed from the as-built run, never authored
 * -------------------------------------------------------------------------- */

export interface FigureValue {
  readonly label: string;
  readonly text: string;
  readonly reading: FigureSpec['reading'];
}

/** § 10.1 item 3's four figures, each a measurement of the as-built run with its denominator. */
export function figureValuesOf(entry: FixitCase, asBuilt: VizRecording): readonly FigureValue[] {
  const readings = readingsOf(asBuilt, entry.complaint.measure);
  return entry.figures.map((figure) => ({
    label: figure.label,
    reading: figure.reading,
    text: figureText(figure, entry, readings),
  }));
}

function figureText(figure: FigureSpec, entry: FixitCase, readings: RunReadings): string {
  const measure = entry.complaint.measure;
  switch (figure.kind) {
    case 'complaint':
      return measure.kind === 'long-waits'
        ? `${String(readings.longWaits)} of ${String(readings.scopeLegs)} journeys`
        : meanText(readings);
    case 'scope-long-waits':
      return `${String(readings.longWaits)} of ${String(readings.scopeLegs)} journeys`;
    case 'scope-mean-wait':
      return meanText(readings);
    case 'scope-worst-wait':
      return readings.worstWaitS === null ? 'nobody boarded' : `${readings.worstWaitS.toFixed(0)} s`;
    case 'rest-away-pct':
      return readings.restAwayPct === null
        ? 'nobody else rode'
        : `${readings.restAwayPct.toFixed(1)} % of ${String(readings.restBoarded)} journeys`;
  }
}

function meanText(readings: RunReadings): string {
  return readings.meanWaitS === null
    ? 'nobody boarded'
    : `${readings.meanWaitS.toFixed(1)} s over ${String(readings.scopeBoarded)} boarded journeys`;
}
