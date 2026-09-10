/**
 * **An admitted vector runs** — GitHub issue **#475**, asserted as a set equality rather than as a
 * sentence.
 *
 * `controls/editedProfile.ts` exists so a caller can ask *may a player set this?* without building
 * a run, and it says so in its own docstring: *"the pre-flight cannot pass something the run then
 * rejects, and the run cannot accept something the pre-flight refused."* That was false. Four of
 * the configurations `scenario/survivorSpace.ts` enumerates were admitted by the gate and thrown on
 * by `core` when the building was constructed — *"dwellPolicy \"adaptive\" requires maxDwellS >= the
 * larger base dwell (5s)"* — and `measureSurvivors.ts` had to count them **out** of `examined`,
 * because a configuration nobody can run is neither a way through a scenario nor a failed attempt.
 *
 * ## What this file asserts, and why it is an equality and not an implication
 *
 * A gate that refuses a **superset** is as wrong as one that refuses a subset, in the direction
 * that is harder to notice: it tells a player a dial is out of range when the simulator would
 * happily have run it, and nothing ever fires. So every case below asserts **both** directions
 * over an enumerated population — the set the gate refuses is exactly the set `core` throws on.
 *
 * ## The oracle is a run being built, not a second opinion about one
 *
 * {@link coreRefusalFor} constructs a real {@link Simulation} on the scenario's own building from a
 * profile assembled **without asking the gate**. That is the shipped construction path — `Car`'s
 * constructor calls `resolveDoorConfig` and `resolveLoadSensor`, which is where the throw comes
 * from — minus the stepping, which is not what is being asked. A test that asked
 * `buildingFeasibility` instead would be asking the gate's own helper whether the gate is right.
 *
 * ## Three populations, and each is here because the other two cannot do its job
 *
 * 1. {@link SWEEP_CAPTURE} — the four the survivor sweep actually hit, captured as vectors. They
 *    are a **pinned corpus rather than a re-derivation**, and the reason is the fix itself: the
 *    sampler now refuses them at the draw, so re-running it can no longer produce them. Their
 *    provenance is on the constant.
 * 2. The **boundary**, per shipped campaign building, with the bound derived from the cars rather
 *    than quoted. This is the population that makes the file non-vacuous without depending on the
 *    capture: it straddles the constraint by construction, at the exact value the constraint turns
 *    on rather than at a round number chosen for convenience.
 * 3. The **sweep's own space**, at the pinned master seed and sample size — every scenario, every
 *    rung. This is the one that says the defect is gone where it was found, and it is a set
 *    equality too rather than a count of zero.
 *
 * Nothing here simulates: a `Simulation` is constructed and dropped. The whole file is under a
 * second on a quiet box, which is why it is always-on rather than behind `ELEVATOR_SIM_SURVIVORS`.
 */

import { loadConfig, Simulation } from '@elevator-sim/core';
import type { DispatcherProfile, ResolvedBuilding } from '@elevator-sim/core';
import {
  candidateProfile,
  collectSearchSpace,
  type ParameterValue,
  type SearchSpace,
} from '@elevator-sim/experiments/browser';
import type { LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { candidateOf } from '../controls/controls.js';
import {
  admitEditedVector,
  applyEdit,
  valuesFromProfile,
  type EditTarget,
} from '../controls/editedProfile.js';
import type { Campaign, CampaignStage } from '../campaign/types.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PriceSchedule } from '../pricing/types.js';

import { rungsOf } from './budget.js';
import {
  SURVIVOR_MASTER_SEED,
  SURVIVOR_SAMPLE_SIZE,
  loadSurvivorFixture,
} from './regenerateSurvivors.test-helper.js';
import { sampleReachableConfigurations, samplerSeedFor } from './survivorSpace.js';

/** One point of a population, with enough of its origin to be found again. */
interface Probe {
  readonly where: string;
  readonly values: Readonly<Record<string, ParameterValue>>;
}

/**
 * **The four `admitEditedVector` admitted and `core` threw on** — issue #475's own measurement.
 *
 * Captured from `scenario/survivorSweep.test.ts`'s draw at master seed 20 260 910 and sample size
 * 12, on the tree that carried the defect (`7d3cfa2`), by asking every drawn configuration whether
 * the run it describes builds. The `where` field is `<scenario>/<rung>/<draw index>` — the same
 * three coordinates `data/scenario-survivors.json` keys a cell by — so a reader can go back to the
 * cell each came from.
 *
 * **Pinned rather than re-derived, and the fix is why.** The sampler now hands
 * `admitEditedVector` the scenario's building, so these four are refused at the draw and redrawn:
 * the sweep can no longer produce them, and a test that re-derived its own population from the
 * sampler would quietly become vacuous on the commit that fixed the thing it exists to catch. The
 * boundary population below is what keeps this file honest without them.
 *
 * Every one is the same defect: an adaptive dwell policy with a ceiling under the car's own larger
 * base dwell. That is not a claim that the defect has one shape — the load-sensor bound below is a
 * second shape of the same class — it is what this sweep drew.
 */
const SWEEP_CAPTURE: readonly {
  readonly where: string;
  readonly stageId: string;
  readonly values: Readonly<Record<string, ParameterValue>>;
}[] = [
  {
    where: 'stage-3-overwhelmed/equipment-rung/edit-6',
    stageId: 'stage-3-overwhelmed',
    values: {
      'weights.waitTime': 2.1194911868426307,
      'weights.detourPenalty': 1.853555725885454,
      'weights.existingCallDelay': 3.6648776509231267,
      'weights.directionReversal': 2.6731233290165473,
      'weights.loadFactor': 0.9650780434848311,
      'weights.stopCount': 3.515142861068925,
      'weights.distanceTravelled': 4.637359849861858,
      'weights.starvation': 0.22013548873147715,
      'weights.zoneAffinity': 1.07682612849118,
      'weights.predictedDemand': 4.878156665805024,
      'weights.crowding': 4.185541530163427,
      'answer.dwellPolicy': 'adaptive',
      'answer.dwellAdaptationGain': 1.9170978380538095,
      'answer.maxDwellS': 4.7404868959840645,
    },
  },
  {
    where: 'stage-5-credentials/base/edit-1',
    stageId: 'stage-5-credentials',
    values: {
      'answer.dwellPolicy': 'adaptive',
      'answer.dwellAdaptationGain': 0.6530154054797999,
      'answer.maxDwellS': 4.425978313983316,
    },
  },
  {
    where: 'stage-6-the-tall-one/building-rung/edit-4',
    stageId: 'stage-6-the-tall-one',
    values: {
      'answer.dwellPolicy': 'adaptive',
      'answer.dwellAdaptationGain': 1.3929657157865158,
      'answer.maxDwellS': 4.148596212995968,
    },
  },
  {
    where: 'stage-9-both-ways-at-once/building-rung/edit-8',
    stageId: 'stage-9-both-ways-at-once',
    values: {
      'answer.dwellPolicy': 'adaptive',
      'answer.dwellAdaptationGain': 0.05775545070143773,
      'answer.maxDwellS': 4.099195142619374,
    },
  },
];

let config: LoadedConfig;
let campaign: Campaign;
let space: SearchSpace;
let schedule: PriceSchedule;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const fixture = await loadSurvivorFixture();
  campaign = fixture.campaign;
  space = collectSearchSpace();
  schedule = shippedPriceSchedule();
}, 120_000);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The first shipped stage that runs on this building, or a throw. */
function stageOn(buildingId: string): CampaignStage {
  const stage = campaign.stages.find((entry) => entry.building === buildingId);
  if (stage === undefined) throw new Error(`no shipped stage runs on "${buildingId}"`);
  return stage;
}

function baselineFor(stage: CampaignStage): DispatcherProfile {
  const profile = config.dispatcherProfilesById.get(stage.dispatcher.startingProfileId);
  if (profile === undefined) throw new Error(`no dispatcher profile "${stage.dispatcher.startingProfileId}"`);
  return profile;
}

function targetFor(building: ResolvedBuilding): EditTarget {
  return { building, elevatorSpecs: config.elevatorSpecs };
}

/**
 * **What `core` says when the run this vector describes is built**, or `undefined` when it builds.
 *
 * The profile is assembled the way `resolveEditedProfile` assembles one — `applyEdit`,
 * `candidateOf`, `candidateProfile` — and then handed to `Simulation`'s constructor, which is
 * where `Car` resolves its doors and its load cell. Deliberately **not** `buildingFeasibility`: the
 * gate calls that, so an oracle built on it would agree with the gate about a building neither of
 * them had constructed.
 *
 * The simulation is constructed and dropped — nothing here steps the kernel. `durationS` is the
 * **stage's own**, and that is not cosmetic: `Simulation`'s constructor refuses a run shorter than
 * the demand template's peak hold (*"a 300 s peak hold does not fit inside a 60 s run"*), so an
 * oracle that invented a short horizon would report every vector as one core refuses and this file
 * would pass while asserting nothing about dwell at all. It did, on its first run.
 */
function coreRefusalFor(
  baseline: DispatcherProfile,
  building: ResolvedBuilding,
  values: Readonly<Record<string, ParameterValue>>,
  durationS: number,
): string | undefined {
  const applied = applyEdit(space, valuesFromProfile(space, baseline), values);
  if (!applied.ok) return `no dial would hold this: ${applied.reason}`;
  let profile: DispatcherProfile;
  try {
    profile = candidateProfile(space, candidateOf(space, applied.values), {
      id: 'issue-475-oracle',
      name: 'Issue 475 oracle',
      base: baseline,
    });
  } catch (error) {
    return messageOf(error);
  }
  try {
    new Simulation({
      building,
      dispatcherProfile: profile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      dispatcherProfiles: config.dispatcherProfiles,
      durationS,
      seed: 1,
    });
  } catch (error) {
    return messageOf(error);
  }
  return undefined;
}

/**
 * The dwell ceiling this building's cars actually impose, derived rather than quoted.
 *
 * `resolveDoorConfig` refuses `maxDwellS < max(dwellCarCallS, dwellHallCallS)` **per car**, so a
 * profile is infeasible on a building as soon as one car says so, and the building's bound is the
 * largest of them. Reading it off the cars is what makes the boundary case below a test of the
 * real constraint rather than of the number 5.
 */
function dwellBoundOf(building: ResolvedBuilding): number {
  let bound = 0;
  for (const bank of building.banks) {
    for (const car of bank.cars) {
      bound = Math.max(bound, car.dwellCarCallS, car.dwellHallCallS);
    }
  }
  return bound;
}

/** Every distinct building the shipped campaign runs a scenario on. */
function campaignBuildings(): readonly ResolvedBuilding[] {
  const seen = new Map<string, ResolvedBuilding>();
  for (const stage of campaign.stages) {
    if (!seen.has(stage.building)) seen.set(stage.building, requireBuilding(config, stage.building));
  }
  return [...seen.values()];
}

/**
 * Assert that the gate and `core` agree, in both directions, over one population.
 *
 * Returns the two counts so a case can also refuse to pass on an empty or one-sided population —
 * an equality over a set nothing falls on either side of is a guard that would pass on any gate at
 * all.
 */
function agreeOver(
  baseline: DispatcherProfile,
  building: ResolvedBuilding,
  durationS: number,
  probes: readonly Probe[],
): { readonly refused: string[]; readonly threw: string[] } {
  const refused: string[] = [];
  const threw: string[] = [];
  const target = targetFor(building);
  for (const probe of probes) {
    const admission = admitEditedVector(space, baseline, probe.values, target);
    const core = coreRefusalFor(baseline, building, probe.values, durationS);
    if (!admission.admissible) refused.push(probe.where);
    if (core !== undefined) threw.push(probe.where);
    expect(
      admission.admissible,
      admission.admissible
        ? `${probe.where}: the gate admitted a vector core refuses — ${String(core)}`
        : `${probe.where}: the gate refused a vector core builds — ${String(admission.reason)}`,
    ).toBe(core === undefined);
  }
  return { refused, threw };
}

/* -------------------------------------------------------------------------- *
 * 1 — The four the survivor sweep hit
 * -------------------------------------------------------------------------- */

describe('the four configurations the survivor sweep had to count out — issue #475', () => {
  it('are vectors every dial and every building-independent check admits', () => {
    /*
     * Non-vacuity for the case below. If these four were refused by a *dial* — out of range, or on
     * a dead gate — then the sweep would never have drawn them and the gate would never have had a
     * chance to be wrong about them. The defect is precisely that everything short of the car
     * says yes.
     */
    for (const captured of SWEEP_CAPTURE) {
      const stage = campaign.stages.find((entry) => entry.id === captured.stageId);
      expect(stage, `no shipped stage "${captured.stageId}"`).toBeDefined();
      if (stage === undefined) continue;
      const baseline = baselineFor(stage);
      const applied = applyEdit(space, valuesFromProfile(space, baseline), captured.values);
      expect(applied.ok, applied.ok ? '' : applied.reason).toBe(true);
      if (!applied.ok) continue;
      expect(space.validate(candidateOf(space, applied.values)), captured.where).toBeUndefined();
    }
  });

  it('are refused by the gate, and core throws on every one of them', () => {
    for (const captured of SWEEP_CAPTURE) {
      const stage = campaign.stages.find((entry) => entry.id === captured.stageId);
      if (stage === undefined) throw new Error(`no shipped stage "${captured.stageId}"`);
      const building = requireBuilding(config, stage.building);
      const baseline = baselineFor(stage);

      const core = coreRefusalFor(baseline, building, captured.values, stage.durationS);
      expect(core, `${captured.where}: core built a run this issue says it refuses`).toBeDefined();
      expect(core, captured.where).toContain('maxDwellS');

      const admission = admitEditedVector(space, baseline, captured.values, targetFor(building));
      expect(admission.admissible, `${captured.where}: still admitted`).toBe(false);
      expect(admission.candidate, `${captured.where}: a refused vector handed back a point`).toBeUndefined();
    }
    expect(SWEEP_CAPTURE.length, 'the capture is empty, so this case asserts nothing').toBe(4);
  });

  it('carry a reason that names the dial and the bound it violated', () => {
    for (const captured of SWEEP_CAPTURE) {
      const stage = campaign.stages.find((entry) => entry.id === captured.stageId);
      if (stage === undefined) throw new Error(`no shipped stage "${captured.stageId}"`);
      const building = requireBuilding(config, stage.building);
      const reason = admitEditedVector(
        space,
        baselineFor(stage),
        captured.values,
        targetFor(building),
      ).reason;
      expect(reason, captured.where).toBeDefined();
      const said = reason ?? '';
      /* The dial. A caller that cannot tell which control to point at cannot act on a refusal. */
      expect(said, captured.where).toContain('maxDwellS');
      expect(said, captured.where).toContain('dwellPolicy');
      /* The bound, as a number, and the value that missed it. */
      expect(said, captured.where).toContain(`${String(dwellBoundOf(building))}s`);
      expect(said, captured.where).toContain(String(captured.values['answer.maxDwellS']));
      /* And where it was measured, because the bound belongs to a car rather than to the space. */
      expect(said, captured.where).toContain(building.id);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — The boundary, derived from the cars
 * -------------------------------------------------------------------------- */

describe('the gate turns over exactly where core does', () => {
  it('refuses below each building’s own dwell bound and admits at it and above', () => {
    const buildings = campaignBuildings();
    expect(buildings.length, 'the campaign names no building').toBeGreaterThan(0);
    for (const building of buildings) {
      const bound = dwellBoundOf(building);
      expect(bound, `${building.id} declares no dwell timings`).toBeGreaterThan(0);
      const stage = stageOn(building.id);
      const baseline = baselineFor(stage);
      /*
       * The values are the ones the constraint is actually about, not round ones: the declared
       * floor of `answer.maxDwellS` (4), the last representable step below the bound, the bound
       * itself — `maxDwellS < baseCeiling` is strict, so the bound is admissible — and two above.
       */
      const probes: Probe[] = [4, bound - 1e-9, bound, bound + 1e-9, 20, 30].map((maxDwellS) => ({
        where: `${building.id}@${String(maxDwellS)}`,
        values: { 'answer.dwellPolicy': 'adaptive', 'answer.maxDwellS': maxDwellS },
      }));
      const { refused, threw } = agreeOver(baseline, building, stage.durationS, probes);
      expect(refused, `${building.id}: the gate and core disagree`).toEqual(threw);
      expect(refused.length, `${building.id}: nothing was refused, so the sweep straddles nothing`)
        .toBeGreaterThan(0);
      expect(
        refused.length,
        `${building.id}: everything was refused, so the sweep straddles nothing`,
      ).toBeLessThan(probes.length);
      /* The bound itself is on the admitting side — a fencepost this gate could get wrong. */
      expect(refused, `${building.id}: the bound itself was refused`).not.toContain(
        `${building.id}@${String(bound)}`,
      );
      expect(refused, `${building.id}: a hair under the bound was admitted`).toContain(
        `${building.id}@${String(bound - 1e-9)}`,
      );
    }
  });

  it('refuses a load-sensor bound the declared box also admits, so the class is not one dial', () => {
    /*
     * `answer.bypassLoadThreshold` declares `[0, 1]` and `resolveLoadSensor` requires it strictly
     * positive. It is the *second* constraint `buildingFeasibility` names, and it is here so that
     * the case above cannot be read as a fix for one dimension: what was wrong was that the gate
     * asked a building-independent question at all.
     */
    const building = campaignBuildings()[0];
    expect(building).toBeDefined();
    if (building === undefined) return;
    const stage = stageOn(building.id);
    const baseline = baselineFor(stage);
    if (!space.ids.includes('answer.bypassLoadThreshold')) return;
    const { refused, threw } = agreeOver(baseline, building, stage.durationS, [
      { where: 'bypass@0', values: { 'answer.bypassLoadThreshold': 0 } },
      { where: 'bypass@0.8', values: { 'answer.bypassLoadThreshold': 0.8 } },
    ]);
    expect(refused).toEqual(threw);
    expect(refused, 'a zero bypass threshold is the point of this case').toContain('bypass@0');
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — The sweep's own space, at the pinned seed
 * -------------------------------------------------------------------------- */

describe('every configuration the survivor sweep enumerates is one core will build', () => {
  it('agrees with core on all of them, at the pinned master seed and sample size', () => {
    let examined = 0;
    const disagreements: string[] = [];
    for (const stage of campaign.stages) {
      const building = requireBuilding(config, stage.building);
      const baseline = baselineFor(stage);
      const target = targetFor(building);
      for (const rung of rungsOf(stage.budget)) {
        const drawn = sampleReachableConfigurations({
          space,
          schedule,
          baseline,
          building,
          elevatorSpecs: config.elevatorSpecs,
          units: rung.units,
          sampleSize: SURVIVOR_SAMPLE_SIZE,
          seed: samplerSeedFor(SURVIVOR_MASTER_SEED, stage.id, rung.stepId),
        });
        for (const [index, configuration] of drawn.configurations.entries()) {
          examined += 1;
          const where = `${stage.id}/${rung.stepId ?? 'base'}/edit-${String(index)}`;
          const core = coreRefusalFor(baseline, building, configuration.values, stage.durationS);
          const admission = admitEditedVector(space, baseline, configuration.values, target);
          if (admission.admissible !== (core === undefined)) {
            disagreements.push(
              `${where}: gate ${admission.admissible ? 'admitted' : 'refused'}, core ` +
                `${core === undefined ? 'built' : 'threw'} — ${String(core ?? admission.reason)}`,
            );
          }
          if (core !== undefined) {
            disagreements.push(`${where}: the sweep still draws a configuration core refuses — ${core}`);
          }
        }
      }
    }
    expect(examined, 'the sweep enumerated nothing, so this case asserts nothing').toBeGreaterThan(0);
    expect(disagreements, 'the gate and core disagree about a drawn configuration').toEqual([]);
  }, 120_000);
});
