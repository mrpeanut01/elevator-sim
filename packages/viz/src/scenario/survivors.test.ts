/**
 * **The survivor count's always-on half** — GitHub issue **#367**. Nothing here simulates.
 *
 * `survivorSweep.test.ts` re-runs the sweep behind `ELEVATOR_SIM_SURVIVORS=deep` and asserts the
 * pinned counts reproduce. This file asserts everything that can be decided from two files on
 * disk, which is `difficultyCurve.test.ts`'s own split and for the same reason: a rule that only
 * runs on Sunday is a rule a pull request can break on Monday.
 *
 * Five separable claims, and each fails on its own:
 *
 * 1. **The space is derived from the schedule and the search space, in both directions.** Nothing
 *    about which changes a scenario run can reach is written down here.
 * 2. **The space is uncountable at every shipped rung, and that is measured rather than
 *    hardwired.** A fixture schedule pricing only categorical dials makes `enumerable` true, so
 *    the field reports a property rather than a constant. Without that control, *"sampled
 *    everywhere"* would be indistinguishable from a function that returns `false`.
 * 3. **The sampler is reproducible, affordable and live.** The same seed draws the same
 *    configurations; a different seed draws different ones; every drawn configuration costs no
 *    more than the rung; every dial it moves is one the schedule prices; and no dial it moves is
 *    one the player could not have moved.
 * 4. **The published table is well formed and inside every rule a scenario may not ship without.**
 *    `validatePublishedSurvivors` over the shipped `data/scenario-survivors.json`.
 * 5. **The negative controls fire.** Every rule is applied to a mutation of the **real** loaded
 *    table rather than to a hand-built fixture, because a guard checked only against an object it
 *    built itself proves that the object is well formed. `goalRates.test.ts`'s discipline, and its
 *    stated reason: a mutation that stays green because the value it changed has a second reader
 *    is the false-negative shape this directory keeps finding.
 */

import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { useCampaignFixture } from '../campaign/campaign.test-helper.js';
import { movedDimensions } from '../campaign/dimensions.js';
import { admitEditedVector } from '../controls/editedProfile.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PriceSchedule } from '../pricing/types.js';

import { admitPurchase, rungsOf } from './budget.js';
import { SCENARIO_SURVIVORS_PATH } from './regenerateSurvivors.test-helper.js';
import {
  MAX_REPLICATIONS,
  MIN_REPLICATIONS,
  SURVIVOR_COPY,
  dialShareInterval,
  firstHourScenarioIds,
  survivorSentenceFor,
  validatePublishedSurvivors,
  type PublishedSurvivorScenario,
  type PublishedSurvivorStep,
  type PublishedSurvivors,
  type SurvivorContext,
} from './survivors.js';
import {
  UNPRICED_TIER,
  bundleSpaceOf,
  dimensionsCoveredBy,
  dropdownConfigurationsOf,
  reachableChangesOf,
  sampleReachableConfigurations,
  samplerSeedFor,
  unpricedDimensionIds,
  unreachableChangeIdsOf,
} from './survivorSpace.js';

const fixture = useCampaignFixture();
const schedule = shippedPriceSchedule();

let table: PublishedSurvivors;

beforeAll(async () => {
  table = JSON.parse(await readFile(SCENARIO_SURVIVORS_PATH, 'utf8')) as PublishedSurvivors;
}, 60_000);

function contextOf(): SurvivorContext {
  return { stages: [...fixture.campaign.stages], schedule };
}

/* -------------------------------------------------------------------------- *
 * The registers — measured breaches, named rather than hidden
 * -------------------------------------------------------------------------- */

/**
 * **Scenarios nothing gets through at any rung, measured 2026-09-10 on `8939d79`.**
 *
 * § D525 clause 3 says *zero is not a scenario* unless it declares itself a diagnosis, and six of
 * the ten do neither. The register exists for `difficultyCurve.test.ts`'s stated reason, which is
 * `honesty.test.ts`'s before it: *"a register that can only grow is decoration."* A scenario here
 * must still measure zero at every rung, and a scenario that measures zero must be here — both
 * directions, so a rebalance that opens one of these empties its row rather than leaving a stale
 * entry, and a scenario that quietly closes is red.
 *
 * **This is a finding about the campaign, not about this instrument**, and the positive control
 * below is what separates the two: the same sweep finds `predictive-balanced` on stage 5 and
 * `fairness-first` on stage 3, which two suites written before this table pin independently. What
 * empties this register is `docs/33` C2's rebalance — by demand or by fabric, never by a bar
 * (DC-R1) — which is GitHub issue **#234**, and a row leaves on the commit that makes it stop
 * reproducing.
 *
 * The reason on each row is the measurement rather than a diagnosis: what a scenario says about
 * itself in the player's words is an authored sentence, and `regenerateSurvivors.test-helper.ts`
 * deliberately never writes one — a regenerator that supplied a diagnosis would let a zero count
 * silence its own guard.
 */
const UNWINNABLE_AS_MEASURED: Readonly<Record<string, string>> = Object.freeze({
  'stage-2-morning-rush':
    '0 of 20 at the base rung and 0 of 24 at both bought rungs; 3 to 5 configurations a rung ran ' +
    'a batch that refused its own mean.',
  'stage-4-two-banks': '0 of 24 at every rung; 4 to 6 a rung suppressed.',
  'stage-6-the-tall-one': '0 of 24, 0 of 24 and 0 of 23; 1 to 3 a rung suppressed.',
  'stage-8-the-headline-address':
    '0 of 20 and 0 of 24 twice, with nothing suppressed anywhere — the one row here where every ' +
    'configuration stood behind its own numbers and still missed a bar.',
  'stage-9-both-ways-at-once':
    '0 of 24, 0 of 24 and 0 of 23, with **every** examined configuration suppressed. Read the ' +
    'count beside that: on this scenario no configuration produced a quotable mean, so a zero ' +
    'here says less about the ways through than the other five do.',
  'stage-10-the-bed-and-the-visitor':
    '0 of 24 at every rung, and every examined configuration suppressed — the same shape as ' +
    'stage 9 and the same caveat.',
});

/**
 * **Scenarios a player meets in their first hour whose count is exactly one**, measured with the
 * same run.
 *
 * GitHub issue **#381**'s floor: *no scenario a player meets in the first hour may have a survivor
 * count of one.* One survivor is the ceiling of the ladder and should not be reachable before the
 * player knows what the controls do. Both of these are one at **every** rung, so the widened
 * budget does not open them either.
 *
 * Which scenarios are *in the first hour* is derived rather than authored — `survivors.ts#firstHourScenarioIds`
 * cumulates the campaign's own `durationS` to an hour of simulated play, which on the shipped
 * campaign is the first four stages. #381 owns the authoritative definition and that function is
 * the one place to change when it rules.
 */
const FIRST_HOUR_SINGLE_SURVIVOR: Readonly<Record<string, string>> = Object.freeze({
  'stage-1-first-call':
    'one at every rung, and it is `zoned-uppeak` from the dropdown rather than a dial: 1 of 20 at ' +
    'the base rung and 1 of 24 at both bought ones, with the dial half at 0 of 12 throughout.',
  'stage-3-overwhelmed':
    'one at every rung, `fairness-first` from the dropdown, with the dial half at 0 of 12 or 11 ' +
    'throughout — and 20 to 24 of the examined configurations suppressed, which is what an ' +
    'overwhelmed building looks like from here.',
});

/**
 * Whether a violation line is one of the two registers' — matched on the scenario id **and** the
 * clause, never on the id alone.
 *
 * Matching on the id alone would let a registered scenario acquire a *second*, unrelated defect and
 * have it swallowed, which is the way a register stops being read. The clause markers are the
 * validator's own sentences.
 */
function isRegistered(line: string): boolean {
  for (const id of Object.keys(UNWINNABLE_AS_MEASURED)) {
    if (line.includes(`"${id}"`) && line.includes('Zero is not a scenario')) return true;
  }
  for (const id of Object.keys(FIRST_HOUR_SINGLE_SURVIVOR)) {
    if (line.includes(`"${id}"`) && line.includes('GitHub issue #381')) return true;
  }
  return false;
}

/**
 * A deep-mutable view of the table, for the negative controls.
 *
 * The published shape is `readonly` all the way down — deliberately, because nothing in the product
 * edits a pinned measurement. The controls have to, and a cast per field would be nineteen casts
 * that each need re-reading. One type, stated once, and every mutation below is then a plain
 * assignment a reader can see is spoiling exactly one thing.
 */
type Writable<T> = T extends readonly (infer U)[]
  ? Writable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Writable<T[K]> }
    : T;

type WritableTable = Writable<PublishedSurvivors>;
type WritableScenario = Writable<PublishedSurvivorScenario>;
type WritableStep = Writable<PublishedSurvivorStep>;

function clone(): WritableTable {
  return JSON.parse(JSON.stringify(table)) as WritableTable;
}

/** The first scenario of a cloned table, so a mutation finds real data to spoil. */
function firstScenario(mutated: WritableTable): WritableScenario {
  const scenario = mutated.scenarios[0];
  if (scenario === undefined) throw new Error('the shipped table has no scenario');
  return scenario;
}

function firstStep(scenario: WritableScenario): WritableStep {
  const step = scenario.steps[0];
  if (step === undefined) throw new Error('the shipped table has a scenario with no budget step');
  return step;
}

/** Apply a mutation to a clone and return what the validator says about the result. */
function mutate(change: (mutated: WritableTable) => void): readonly string[] {
  const mutated = clone();
  change(mutated);
  return validatePublishedSurvivors(mutated as PublishedSurvivors, contextOf());
}

/**
 * Take every survivor out of one cell, consistently.
 *
 * Consistently is the whole point: zeroing `survivors` alone would trip the arithmetic clauses
 * first and the *"zero is not a scenario"* control would then be asserting against a table that is
 * wrong for a different reason. `goalRates.test.ts`'s own discipline — a mutation must produce
 * exactly the defect it was written for.
 */
function clearSurvivors(step: WritableStep): void {
  step.survivors = 0;
  step.survivorNames = [];
  step.dropdown.survivors = 0;
  step.dials.survivors = 0;
  for (const cell of Object.values(step.perTier)) cell.survivors = 0;
}

/* -------------------------------------------------------------------------- *
 * 1 — The space is derived, in both directions
 * -------------------------------------------------------------------------- */

describe('what a scenario run can reach is derived from the schedule, never written down', () => {
  it('partitions every priced change into reachable and unreachable, with nothing in both or neither', () => {
    const reachable = reachableChangesOf(fixture.space, schedule).map((change) => change.changeId);
    const unreachable = unreachableChangeIdsOf(fixture.space, schedule);
    expect([...reachable, ...unreachable].sort()).toEqual(
      schedule.changes.map((change) => change.id).sort(),
    );
    expect(reachable.filter((id) => unreachable.includes(id))).toEqual([]);
    /* Non-vacuity in both directions: a partition with an empty half asserts nothing. */
    expect(reachable.length, 'no priced change reaches a scenario run at all').toBeGreaterThan(0);
    expect(unreachable.length, 'the bound this measurement declares is empty').toBeGreaterThan(0);
  });

  it('calls a change reachable exactly when it covers a dimension the space declares', () => {
    for (const change of schedule.changes) {
      const covered = dimensionsCoveredBy(fixture.space, change);
      const reachable = reachableChangesOf(fixture.space, schedule).some(
        (entry) => entry.changeId === change.id,
      );
      expect(reachable, `${change.id}: covers ${String(covered.length)} declared dimensions`).toBe(
        covered.length > 0,
      );
    }
  });

  it('leaves every unpriced dimension out of the reachable set, and says how many there are', () => {
    const priced = new Set(
      reachableChangesOf(fixture.space, schedule).flatMap((change) => change.dimensionIds),
    );
    const unpriced = unpricedDimensionIds(fixture.space, schedule);
    for (const id of unpriced) expect(priced.has(id), id).toBe(false);
    expect(unpriced.length + priced.size).toBe(fixture.space.parameters.length);
    expect(
      table.provenance.unpricedDimensionCount,
      'the table publishes the exclusion it was measured under',
    ).toBe(unpriced.length);
    expect(table.provenance.declaredDimensionCount).toBe(fixture.space.parameters.length);
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — The space is uncountable at every rung, and the field is not a constant
 * -------------------------------------------------------------------------- */

describe('the sampling method is a measurement of the rung, not a policy', () => {
  it('finds no shipped rung whose configuration space could be enumerated', () => {
    const reachable = reachableChangesOf(fixture.space, schedule);
    let rungs = 0;
    for (const stage of fixture.campaign.stages) {
      for (const rung of rungsOf(stage.budget)) {
        rungs += 1;
        const space = bundleSpaceOf(fixture.space, reachable, rung.units);
        expect(space.enumerable, `${stage.id} at ${String(rung.units)} units`).toBe(false);
        expect(space.size).toBeNull();
        expect(space.bundles.length, `${stage.id} at ${String(rung.units)} units`).toBeGreaterThan(0);
      }
    }
    expect(rungs, 'the sweep found no rung to ask about').toBeGreaterThan(0);
  });

  it('reports an enumerable space when every affordable change covers only finite dials', () => {
    /*
     * The positive control for the case above, and the reason it is not vacuous: without it,
     * `enumerable: false` everywhere is indistinguishable from a function that returns `false`.
     * The fixture keeps only the schedule's categorical-covering change, so the space really is
     * countable and the same function must say so.
     */
    const categoricalOnly: PriceSchedule = {
      ...schedule,
      changes: schedule.changes.filter((change) =>
        dimensionsCoveredBy(fixture.space, change).every(
          (id) =>
            fixture.space.parameters.find((parameter) => parameter.id === id)?.type ===
            'categorical',
        ),
      ),
    };
    const reachable = reachableChangesOf(fixture.space, categoricalOnly);
    expect(reachable.length, 'the fixture priced no categorical-only change').toBeGreaterThan(0);
    const space = bundleSpaceOf(fixture.space, reachable, 100);
    expect(space.enumerable).toBe(true);
    expect(space.size).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — The sampler
 * -------------------------------------------------------------------------- */

describe('the draw is reproducible, affordable and live', () => {
  const baseline = () => fixture.requireProfile('collective');
  /**
   * The building the draw is admitted against — GitHub issue **#475**.
   *
   * A drawn vector is admissible **on a building**: `answer.maxDwellS` under an adaptive dwell
   * policy is bounded by a car's own door timings, so the sampler cannot answer *"could the player
   * have set this?"* without one. The first stage's own tower, through the same `resourcesFor` the
   * played batches use, so the filter and the run are about the same cars.
   */
  const target = () => {
    const resources = fixture.resourcesFor(fixture.campaign.stages[0] ?? fixture.stageAt(0));
    return { building: resources.building, elevatorSpecs: resources.elevatorSpecs };
  };

  it('draws the same configurations from the same seed and different ones from another', () => {
    const request = {
      space: fixture.space,
      schedule,
      baseline: baseline(),
      ...target(),
      units: 24,
      sampleSize: 8,
    };
    const first = sampleReachableConfigurations({ ...request, seed: 4242 });
    const again = sampleReachableConfigurations({ ...request, seed: 4242 });
    const other = sampleReachableConfigurations({ ...request, seed: 4243 });
    expect(first.configurations).toEqual(again.configurations);
    expect(first.configurations.length).toBeGreaterThan(0);
    expect(other.configurations).not.toEqual(first.configurations);
  });

  it('gives every cell its own seed, so no two cells share a draw', () => {
    const seeds = new Map<number, string>();
    for (const stage of fixture.campaign.stages) {
      for (const rung of rungsOf(stage.budget)) {
        const key = `${stage.id}#${rung.stepId ?? ''}`;
        const seed = samplerSeedFor(table.provenance.masterSeed, stage.id, rung.stepId);
        const already = seeds.get(seed);
        expect(already, `${key} and ${String(already)} draw from seed ${String(seed)}`).toBeUndefined();
        seeds.set(seed, key);
      }
    }
    expect(seeds.size).toBe(
      fixture.campaign.stages.reduce((sum, stage) => sum + rungsOf(stage.budget).length, 0),
    );
  });

  it('never draws a configuration the rung cannot pay for', () => {
    for (const units of [4, 15, 24, 54]) {
      const drawn = sampleReachableConfigurations({
        space: fixture.space,
        schedule,
        baseline: baseline(),
        ...target(),
        units,
        sampleSize: 12,
        seed: 991,
      });
      expect(drawn.configurations.length, `at ${String(units)} units`).toBeGreaterThan(0);
      for (const configuration of drawn.configurations) {
        expect(configuration.units, `${configuration.changeIds.join('+')}`).toBeLessThanOrEqual(units);
        expect(
          admitPurchase(schedule, units, Object.keys(configuration.values)).admitted,
          `${configuration.changeIds.join('+')} at ${String(units)} units`,
        ).toBe(true);
      }
    }
  });

  it('moves only dials the schedule prices, and only dials the player could have moved', () => {
    const priced = new Set(
      reachableChangesOf(fixture.space, schedule).flatMap((change) => change.dimensionIds),
    );
    const drawn = sampleReachableConfigurations({
      space: fixture.space,
      schedule,
      baseline: baseline(),
      ...target(),
      units: 54,
      sampleSize: 16,
      seed: 20_260_910,
    });
    expect(drawn.configurations.length).toBeGreaterThan(0);
    for (const configuration of drawn.configurations) {
      expect(Object.keys(configuration.values).length, 'a configuration that moves nothing').toBeGreaterThan(0);
      for (const id of Object.keys(configuration.values)) expect(priced.has(id), id).toBe(true);
      /* Live: every drawn vector is one the editor's own admission check would accept. */
      const admission = admitEditedVector(
        fixture.space,
        baseline(),
        configuration.values,
        target(),
      );
      expect(admission.admissible, admission.reason ?? '').toBe(true);
    }
  });

  it('reports a short sample rather than looping when the draw budget runs out', () => {
    const drawn = sampleReachableConfigurations({
      space: fixture.space,
      schedule,
      baseline: baseline(),
      ...target(),
      units: 4,
      sampleSize: 5,
      seed: 7,
      drawBudgetMultiple: 1,
    });
    expect(drawn.draws).toBeLessThanOrEqual(5);
    expect(drawn.configurations.length).toBeLessThanOrEqual(5);
  });
});

/* -------------------------------------------------------------------------- *
 * 4 — The dropdown census
 * -------------------------------------------------------------------------- */

describe('the dropdown stratum is a census, priced by the same ladder as the dials', () => {
  it('offers every shipped profile that runs a different system, and never the baseline itself', () => {
    const baseline = fixture.requireProfile('collective');
    const dropdown = dropdownConfigurationsOf(
      fixture.space,
      schedule,
      baseline,
      fixture.config.dispatcherProfiles.profiles,
    );
    const offered = new Set(dropdown.map((entry) => entry.profileId));
    expect(offered.has(baseline.id), 'the baseline is not a way through itself').toBe(false);
    for (const profile of fixture.config.dispatcherProfiles.profiles) {
      if (profile.id === baseline.id) continue;
      const moves = movedDimensions(fixture.space, baseline, profile).length > 0;
      expect(offered.has(profile.id), `${profile.id} moves ${String(moves)}`).toBe(moves);
    }
    expect(dropdown.length, 'the census is empty').toBeGreaterThan(0);
  });

  it('prices a switch through admitPurchase, so the dropdown and the dials cost the same ladder', () => {
    const baseline = fixture.requireProfile('collective');
    for (const entry of dropdownConfigurationsOf(
      fixture.space,
      schedule,
      baseline,
      fixture.config.dispatcherProfiles.profiles,
    )) {
      const candidate = fixture.requireProfile(entry.profileId);
      const moved = movedDimensions(fixture.space, baseline, candidate).map((row) => row.id);
      const admission = admitPurchase(schedule, Number.MAX_SAFE_INTEGER, moved);
      expect(entry.units, entry.profileId).toBe(admission.units);
      expect([...entry.changeIds].sort(), entry.profileId).toEqual([...admission.changeIds].sort());
      if (entry.changeIds.length === 0) expect(entry.tier, entry.profileId).toBe(UNPRICED_TIER);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 5 — The published table
 * -------------------------------------------------------------------------- */

describe('the published survivor table is well formed and may ship', () => {
  it('declares itself measured and names the run that produced it', () => {
    expect(table.provenance.kind).toBe('measured');
    expect(table.provenance.command).toContain('survivorSweep.test.ts');
    expect(table.provenance.tree.trim()).not.toBe('');
    expect(table.generatedBy).toContain('regenerateSurvivors.test-helper.ts');
  });

  it('passes its own schema apart from the registered breaches', () => {
    const unregistered = validatePublishedSurvivors(table, contextOf()).filter(
      (line) => !isRegistered(line),
    );
    expect(
      unregistered,
      'a survivor count breaches a rule a scenario may not ship without, and it is in neither ' +
        'register. Either the campaign moved — which is #234’s rebalance and is the point — or ' +
        'the breach is new and belongs in a register with the reason.',
    ).toEqual([]);
  });

  it('finds exactly the registered zero counts, in both directions', () => {
    const measured = table.scenarios
      .filter((scenario) => scenario.steps.every((step) => step.survivors === 0))
      .map((scenario) => scenario.id);
    expect(new Set(measured)).toEqual(new Set(Object.keys(UNWINNABLE_AS_MEASURED)));
    /* Non-vacuity: a register checked against an empty measurement asserts nothing. */
    expect(table.scenarios.length).toBeGreaterThan(measured.length);
  });

  it('finds exactly the registered first-hour single survivors, in both directions', () => {
    const measured = table.scenarios
      .filter(
        (scenario) =>
          scenario.inFirstHour && scenario.steps.some((step) => step.survivors === 1),
      )
      .map((scenario) => scenario.id);
    expect(new Set(measured)).toEqual(new Set(Object.keys(FIRST_HOUR_SINGLE_SURVIVOR)));
  });

  it('names only scenarios the campaign ships in either register', () => {
    const shipped = new Set(fixture.campaign.stages.map((stage) => stage.id));
    for (const id of Object.keys(UNWINNABLE_AS_MEASURED)) expect(shipped.has(id), id).toBe(true);
    for (const id of Object.keys(FIRST_HOUR_SINGLE_SURVIVOR)) expect(shipped.has(id), id).toBe(true);
  });

  it('finds the survivors the played-stage suites already pin, which is what says it can find one', () => {
    /*
     * The positive control for the whole instrument, and it is not a tautology: these two are
     * pinned by suites that were written before this table existed and that reach the verdict by a
     * different route. `campaign/stageFiveClears.test.ts` sweeps the thirteen shipped profiles on
     * stage 5 and records that exactly one survives the holdout — `predictive-balanced` — and
     * `difficultyCurve.test.ts`'s DC-2 register names `fairness-first` on stage 3. A sweep that
     * found neither would be counting something, and it would not be ways through this campaign.
     */
    for (const [id, profileId] of [
      ['stage-5-credentials', 'predictive-balanced'],
      ['stage-3-overwhelmed', 'fairness-first'],
    ] as const) {
      const scenario = table.scenarios.find((entry) => entry.id === id);
      expect(scenario, id).toBeDefined();
      for (const step of scenario?.steps ?? []) {
        expect(step.survivorNames, `${id}#${step.stepId ?? 'base'}`).toContain(profileId);
      }
    }
  });

  it('counts every scenario at every budget step, in both directions', () => {
    const published = new Set(table.scenarios.map((scenario) => scenario.id));
    const shipped = new Set(fixture.campaign.stages.map((stage) => stage.id));
    expect([...published].sort()).toEqual([...shipped].sort());
    for (const stage of fixture.campaign.stages) {
      const scenario = table.scenarios.find((entry) => entry.id === stage.id);
      expect(scenario, stage.id).toBeDefined();
      expect(scenario?.steps.map((step) => step.stepId)).toEqual(
        rungsOf(stage.budget).map((rung) => rung.stepId),
      );
    }
  });

  it('judges every cell at this repository’s replication budget', () => {
    for (const scenario of table.scenarios) {
      expect(scenario.replications, scenario.id).toBeGreaterThanOrEqual(MIN_REPLICATIONS);
      expect(scenario.replications, scenario.id).toBeLessThanOrEqual(MAX_REPLICATIONS);
      expect(scenario.tuningSeeds.seed, scenario.id).not.toBe(scenario.holdoutSeeds.seed);
    }
  });

  it('derives the first hour from the campaign’s own durations rather than from a list', () => {
    const derived = firstHourScenarioIds(fixture.campaign.stages);
    for (const scenario of table.scenarios) {
      expect(scenario.inFirstHour, scenario.id).toBe(derived.has(scenario.id));
    }
    expect(derived.size, 'no scenario is in the first hour').toBeGreaterThan(0);
    expect(derived.size, 'every scenario is in the first hour').toBeLessThan(
      fixture.campaign.stages.length,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * 6 — Negative controls, every one on the real table
 * -------------------------------------------------------------------------- */

describe('the guard fires on the defect each clause was written for', () => {
  it('refuses a table that does not declare itself measured', () => {
    const violations = mutate((mutated) => {
      mutated.provenance.kind = 'chosen' as 'measured';
    });
    expect(violations.some((line) => line.includes('does not declare itself measured'))).toBe(true);
  });

  it('refuses a table whose run is not pinned', () => {
    const violations = mutate((mutated) => {
      mutated.provenance.tree = '  ';
    });
    expect(violations.some((line) => line.includes('provenance.tree'))).toBe(true);
  });

  it('refuses a scenario that ships with no survivor count', () => {
    const violations = mutate((mutated) => {
      mutated.scenarios = mutated.scenarios.slice(1);
    });
    expect(violations.some((line) => line.includes('has no survivor count'))).toBe(true);
  });

  it('refuses a count keyed by an array position rather than by a step id', () => {
    const violations = mutate((mutated) => {
      const scenario = firstScenario(mutated);
      scenario.steps = [...scenario.steps].reverse();
    });
    expect(violations.some((line) => line.includes('keyed by a stable'))).toBe(true);
  });

  it('refuses a budget step the scenario’s ladder does not have', () => {
    const violations = mutate((mutated) => {
      const scenario = firstScenario(mutated);
      scenario.steps = scenario.steps.slice(0, 1);
    });
    expect(violations.some((line) => line.includes('budget steps and the scenario'))).toBe(true);
  });

  it('refuses a scenario nothing clears that does not declare itself a diagnosis', () => {
    const violations = mutate((mutated) => {
      const scenario = firstScenario(mutated);
      scenario.diagnosis = null;
      for (const step of scenario.steps) clearSurvivors(step);
    });
    expect(violations.some((line) => line.includes('Zero is not a scenario'))).toBe(true);
  });

  it('accepts the same zero once the scenario says so in the player’s words', () => {
    /*
     * Scoped to the mutated scenario, because six others in the shipped table are registered for
     * this very clause and an unscoped filter would be asserting about them instead.
     */
    const subjectId = firstScenario(clone()).id;
    const violations = mutate((mutated) => {
      const scenario = firstScenario(mutated);
      scenario.diagnosis =
        'This tower cannot be run inside the bars as it stands, and nothing the ladder sells changes that.';
      for (const step of scenario.steps) clearSurvivors(step);
    });
    expect(
      violations.filter(
        (line) => line.includes(`"${subjectId}"`) && line.includes('Zero is not a scenario'),
      ),
    ).toEqual([]);
  });

  it('refuses a rung every configuration clears — DC-1 as a reading of this count', () => {
    const violations = mutate((mutated) => {
      const scenario = firstScenario(mutated);
      const step = firstStep(scenario);
      step.survivors = step.examined;
    });
    expect(violations.some((line) => line.includes('nothing here for a player to fail'))).toBe(true);
  });

  it('refuses a single survivor on a scenario a player meets in their first hour', () => {
    /*
     * The subject is a first-hour scenario that does **not** already have a single survivor, or the
     * mutation would be a no-op and the case would pass on a violation the shipped table already
     * carries. Two of the four first-hour scenarios are registered above for exactly that count.
     */
    const subject = table.scenarios.find(
      (entry) => entry.inFirstHour && entry.steps.every((step) => step.survivors !== 1),
    );
    expect(subject, 'every first-hour scenario already has a single survivor').toBeDefined();
    const violations = mutate((mutated) => {
      const scenario = mutated.scenarios.find((entry) => entry.id === subject?.id);
      if (scenario === undefined) throw new Error('the subject vanished from the clone');
      const step = firstStep(scenario);
      step.survivors = 1;
      step.survivorNames = ['edit-0'];
      step.dials.survivors = 1;
      const [tier] = Object.values(step.perTier);
      if (tier !== undefined) tier.survivors = 1;
    });
    expect(
      violations.some(
        (line) => line.includes(`"${subject?.id ?? ''}"`) && line.includes('GitHub issue #381'),
      ),
    ).toBe(true);
  });

  it('refuses a count whose strata do not sum to it', () => {
    const violations = mutate((mutated) => {
      const step = firstStep(firstScenario(mutated));
      step.examined = step.examined + 1;
    });
    expect(violations.some((line) => line.includes('the two strata examined'))).toBe(true);
  });

  it('refuses a count whose per-tier table does not add up to it', () => {
    const violations = mutate((mutated) => {
      const step = firstStep(firstScenario(mutated));
      const [first] = Object.values(step.perTier);
      if (first === undefined) throw new Error('a step with no tiers');
      first.examined += 1;
    });
    expect(violations.some((line) => line.includes('per-tier table sums to'))).toBe(true);
  });

  it('refuses a count that names fewer survivors than it claims', () => {
    const violations = mutate((mutated) => {
      const step = firstStep(firstScenario(mutated));
      step.survivorNames = [];
      step.survivors = 1;
      step.dials.survivors += 1;
    });
    expect(violations.some((line) => line.includes('cannot be listed cannot be checked'))).toBe(true);
  });

  it('refuses a sampled cell with no seed, so no draw is unrepeatable', () => {
    const violations = mutate((mutated) => {
      const step = firstStep(firstScenario(mutated));
      step.sampling.seed = 0;
    });
    expect(violations.some((line) => line.includes('carries no seed'))).toBe(true);
  });

  it('refuses a cell published as an exhaustive count over an uncountable space', () => {
    const violations = mutate((mutated) => {
      const step = firstStep(firstScenario(mutated));
      step.sampling.method = 'exhaustive';
    });
    expect(violations.some((line) => line.includes('uncountable'))).toBe(true);
  });

  it('refuses a cell counted over a replication budget the project forbids', () => {
    const violations = mutate((mutated) => {
      firstScenario(mutated).replications = 10;
    });
    expect(violations.some((line) => line.includes('Ten is not enough'))).toBe(true);
  });

  it('refuses a cell whose two seed sets are the same, so the holdout validated nothing', () => {
    const violations = mutate((mutated) => {
      const scenario = firstScenario(mutated);
      scenario.holdoutSeeds.seed = scenario.tuningSeeds.seed;
    });
    expect(violations.some((line) => line.includes('the holdout validated nothing'))).toBe(true);
  });

  it('refuses a dropdown census that shrinks as the budget grows', () => {
    const violations = mutate((mutated) => {
      const scenario = firstScenario(mutated);
      const top = scenario.steps.at(-1);
      if (top === undefined) throw new Error('a scenario with no steps');
      top.dropdown.examined = 0;
      top.examined = top.dials.examined;
    });
    expect(violations.some((line) => line.includes('census that shrinks'))).toBe(true);
  });

  it('refuses a count baselined against a dispatcher the scenario does not start from', () => {
    const violations = mutate((mutated) => {
      firstScenario(mutated).baselineProfileId = 'nearest-car';
    });
    expect(violations.some((line) => line.includes('measures another game'))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * 7 — The reader's sentence
 * -------------------------------------------------------------------------- */

describe('the count reaches a player as a count, never as a score', () => {
  it('carries its own denominator in its own sentence, on every shipped cell', () => {
    for (const scenario of table.scenarios) {
      for (const step of scenario.steps) {
        const sentence = survivorSentenceFor(scenario, step);
        expect(sentence, `${scenario.id}#${step.stepId ?? 'base'}`).toContain(
          String(step.examined),
        );
        expect(sentence).toContain(SURVIVOR_COPY.heading);
        /* No grade, no letter, no star — docs/38 § 4. */
        expect(sentence).not.toMatch(/\b(?:grade|score|rating|stars?|difficulty level)\b/iu);
      }
    }
  });

  it('says a cell that examined nothing said nothing, rather than printing a zero', () => {
    const scenario = firstScenario(clone());
    const step = firstStep(scenario);
    const sentence = survivorSentenceFor(scenario, { ...step, examined: 0, survivors: 0 });
    expect(sentence).toContain('nothing was tried');
    expect(sentence).toContain('a count nobody took are different things');
  });

  it('leads with the diagnosis where a scenario declares one', () => {
    const scenario = firstScenario(clone());
    const step = firstStep(scenario);
    const sentence = survivorSentenceFor(
      { ...scenario, diagnosis: 'the bank is one car short of the crowd it was let to.' },
      step,
    );
    expect(sentence).toContain(SURVIVOR_COPY.diagnosisLead);
    expect(sentence).toContain('one car short');
  });

  it('gives the sampled half an interval a census would not get', () => {
    /* 0 of 12 is not "nothing clears" — it bounds the share, and the bound is what a reader needs. */
    const none = dialShareInterval({ examined: 12, survivors: 0 });
    expect(none.low).toBe(0);
    expect(none.high).toBeGreaterThan(0.2);
    expect(none.high).toBeLessThan(0.3);
    const some = dialShareInterval({ examined: 12, survivors: 6 });
    expect(some.low).toBeGreaterThan(0.2);
    expect(some.high).toBeLessThan(0.8);
    expect(dialShareInterval({ examined: 0, survivors: 0 })).toEqual({ low: 0, high: 1 });
  });
});
