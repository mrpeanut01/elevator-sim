/**
 * The driver, end to end against the real `data/` directory — and therefore the artefact
 * docs/05-roadmap.md § Phase 7 is judged on, produced by a code path rather than described by one.
 *
 * ## Why this suite runs a simulator when every other file here runs on literals
 *
 * Because the claim under test is *connection*. `pareto.test.ts`, `holdout.test.ts` and
 * `build.test.ts` are right to be synthetic: a simulation cannot be asked for a candidate that is
 * overfitted on purpose, and a fixture built from literals comes with a known answer. None of that
 * touches the failure this file exists to prevent, which docs/05-roadmap.md § *Standing requirement*
 * states plainly: a behaviour *configurable, unit-tested in isolation and dead in the shipped path*
 * passes every check this repository runs, and has shipped four times. A green suite over literals
 * is exactly what that defect looks like.
 *
 * So this suite asserts what only a real run can: that the finalists' parameter vectors reach the
 * dispatcher, that the two seed sets are genuinely different traffic, and that the page comes out
 * the other end. The **known answer** is the one docs/06 § Worked example leaves in place on
 * purpose: `predictive-balanced` ships `idle.repositionThresholdS: 8`, and the Phase 5 sweep found
 * an interior optimum at 2 s.
 *
 * ## What it deliberately does not assert
 *
 * **That the 2 s arm wins with an interval excluding zero.** Measured here at n = 60 on this
 * building: `−0.916 [−2.161, +0.328]` on the tuning seed and `−1.288 [−2.277, −0.298]` on the
 * holdout seed. The effect is real and the sign is stable; the *significance* at a budget a test
 * suite can afford is not, and asserting it would be a coin flip dressed as a gate — the exact
 * failure CLAUDE.md § Statistical discipline names. docs/03's own table says a ±0.5 s interval costs
 * 141 replications at 90 % confidence and ±0.25 s costs 563. The gate asserts what is structural and
 * leaves the number to a run with a budget.
 */

import { describe, expect, it } from 'vitest';

import type { DispatcherProfile, LoadedConfig } from '@elevator-sim/core';

import { benchmarkCase } from '../../benchmark/arms.js';
import { derivedProfile, loadResources, withProfiles } from '../../validation/harness.js';
import type { ExperimentResources, ExperimentResult, ExperimentSpec } from '../../runner/types.js';

import { buildTuningReport } from './build.js';
import { formatTuningReport } from './format.js';
import { ENERGY_OBJECTIVE_ID } from './pareto.js';
import {
  candidateEvaluationsOf,
  holdoutRoundSpec,
  runHoldoutRound,
  type HoldoutRound,
  type HoldoutRoundInput,
  type TuningArm,
} from './holdoutRound.js';
import { TuningReportError } from './types.js';

/**
 * Garden Apartments at the operating point `benchmark/arms.ts` measured and justified — 2 % of
 * population per 5 minutes over a full hour, reported over the whole run.
 *
 * Taken from `benchmarkCase` rather than re-declared, so this suite cannot quietly acquire an
 * operating point of its own. It is the building docs/05-roadmap.md names for pre-positioning, and
 * the one whose deadband sweep is the phase's known answer.
 */
const CASE = benchmarkCase('garden-residential');

/** The seed the "search" optimized against, and a different one it was never allowed to see. */
const TUNING_SEED = '20260726';
const HOLDOUT_SEED = '981234567';

/** Small enough for a suite, and above the two a paired interval needs. See the module docstring. */
const REPLICATIONS = 24;

const BASE_PROFILE_ID = 'predictive-balanced';

/** `predictive-balanced` with one field moved, exactly as a materialized search point would be. */
function atDeadband(base: DispatcherProfile, thresholdS: number): DispatcherProfile {
  return derivedProfile(base, `pb-deadband-${String(thresholdS)}`, {
    name: `${base.name} (deadband ${String(thresholdS)} s)`,
    idle: { ...base.idle, repositionThresholdS: thresholdS },
  });
}

interface Fixture {
  readonly config: LoadedConfig;
  readonly resources: ExperimentResources;
  readonly arms: readonly TuningArm[];
  readonly input: HoldoutRoundInput;
}

let fixture: Fixture | undefined;
let round: HoldoutRound | undefined;

async function fixtureOf(): Promise<Fixture> {
  if (fixture !== undefined) return fixture;
  const config = await loadResources();
  const base = config.dispatcherProfilesById.get(BASE_PROFILE_ID);
  if (base === undefined) throw new Error(`data/ has no profile "${BASE_PROFILE_ID}"`);

  /*
   * The reference is the profile **as shipped**, at its authored 8 s deadband. docs/06 is explicit
   * that the 8 is left in place as Phase 7's ground-truth case and must not be hand-edited; the
   * candidates are in-memory variants of it, which is what a tuner produces and is the difference
   * between searching a dimension and editing the answer into the data.
   */
  const arms: readonly TuningArm[] = [
    { candidateId: BASE_PROFILE_ID, profile: base, parameters: { 'idle.repositionThresholdS': 8 } },
    {
      candidateId: 'c-deadband-2',
      profile: atDeadband(base, 2),
      parameters: { 'idle.repositionThresholdS': 2 },
    },
    {
      candidateId: 'c-deadband-5',
      profile: atDeadband(base, 5),
      parameters: { 'idle.repositionThresholdS': 5 },
    },
  ];
  const resources = withProfiles(config, [arms[1]?.profile as DispatcherProfile, arms[2]?.profile as DispatcherProfile]);
  const input: HoldoutRoundInput = {
    resources,
    buildingId: CASE.building,
    traffic: CASE.traffic,
    reference: arms[0] as TuningArm,
    candidates: arms.slice(1),
    tuningSeed: TUNING_SEED,
    holdoutSeed: HOLDOUT_SEED,
    replications: REPLICATIONS,
  };
  fixture = { config, resources, arms, input };
  return fixture;
}

async function roundOf(): Promise<HoldoutRound> {
  round ??= await runHoldoutRound((await fixtureOf()).input);
  return round;
}

/* -------------------------------------------------------------------------- *
 * The spec, without a simulator
 * -------------------------------------------------------------------------- */

describe('holdoutRoundSpec', () => {
  it('differs between the two sets in the seed and nothing else', async () => {
    const { input } = await fixtureOf();
    const tuning = holdoutRoundSpec(input, 'tuning');
    const holdout = holdoutRoundSpec(input, 'holdout');

    expect(tuning.seed).toBe(TUNING_SEED);
    expect(holdout.seed).toBe(HOLDOUT_SEED);
    // Everything that is not the seed, the id or the prose label must match: the difference between
    // the two sets has to be the traffic, or the split measures two experiments rather than one
    // experiment on two samples.
    const stripped = (spec: ExperimentSpec) => ({ ...spec, id: '', description: '', seed: '' });
    expect(stripped(tuning)).toEqual(stripped(holdout));
  });

  it('puts every arm in one experiment at one seed, which is what pairs them', async () => {
    const { input } = await fixtureOf();
    const spec = holdoutRoundSpec(input, 'tuning');

    expect(spec.dispatchers).toEqual([
      { id: BASE_PROFILE_ID, profile: BASE_PROFILE_ID },
      { id: 'c-deadband-2', profile: 'pb-deadband-2' },
      { id: 'c-deadband-5', profile: 'pb-deadband-5' },
    ]);
    expect(spec.replication?.minReplications).toBe(REPLICATIONS);
    expect(spec.replication?.maxReplications).toBe(REPLICATIONS);
  });
});

/* -------------------------------------------------------------------------- *
 * What it refuses, before anything runs
 * -------------------------------------------------------------------------- */

describe('runHoldoutRound refuses a split that is not a split', () => {
  const neverRuns = (): Promise<ExperimentResult> => {
    throw new Error('the runner must not be reached');
  };

  it('refuses the same seed for both sets, which would be one experiment counted twice', async () => {
    const { input } = await fixtureOf();
    await expect(
      runHoldoutRound({ ...input, holdoutSeed: TUNING_SEED, run: neverRuns }),
    ).rejects.toThrow(TuningReportError);
    await expect(
      runHoldoutRound({ ...input, holdoutSeed: TUNING_SEED, run: neverRuns }),
    ).rejects.toThrow(/same passenger traces under two names/);
  });

  it('refuses a replication budget no interval can be formed from', async () => {
    const { input } = await fixtureOf();
    await expect(runHoldoutRound({ ...input, replications: 1, run: neverRuns })).rejects.toThrow(
      /at least two/,
    );
  });

  it('refuses two arms that bind different profiles to one id', async () => {
    const { input, config } = await fixtureOf();
    const base = config.dispatcherProfilesById.get(BASE_PROFILE_ID) as DispatcherProfile;
    const collide: TuningArm = {
      candidateId: 'c-collision',
      // Same profile id as the 2 s arm, different contents: the runner would resolve one of them.
      profile: derivedProfile(base, 'pb-deadband-2', {
        idle: { ...base.idle, repositionThresholdS: 7 },
      }),
    };
    await expect(
      runHoldoutRound({ ...input, candidates: [...input.candidates, collide], run: neverRuns }),
    ).rejects.toThrow(/cannot share a profile id and differ/);
  });
});

/* -------------------------------------------------------------------------- *
 * The round, against the real simulator
 * -------------------------------------------------------------------------- */

describe('runHoldoutRound produces the Phase 7 acceptance artefact', () => {
  it('runs a holdout set that is real, disjoint traffic', { timeout: 120_000 }, async () => {
    const { report, evaluations } = await roundOf();

    const seedsOn = (role: 'tuning' | 'holdout') =>
      new Set(
        evaluations.flatMap((evaluation) =>
          (role === 'tuning' ? evaluation.tuning : evaluation.holdout)?.observations.map(
            (observation) => observation.seed,
          ) ?? [],
        ),
      );
    const tuningSeeds = seedsOn('tuning');
    const holdoutSeeds = seedsOn('holdout');

    // Every arm ran the same seeds within a set — common random numbers, by construction — and the
    // two sets share none of them, which is the guard the whole phase rests on.
    expect(tuningSeeds.size).toBe(REPLICATIONS);
    expect(holdoutSeeds.size).toBe(REPLICATIONS);
    expect([...holdoutSeeds].filter((seed) => tuningSeeds.has(seed))).toEqual([]);
    expect(report.seedSets.disjoint).toBe(true);
    expect(report.seedSets.sharedSeeds).toEqual([]);
    expect(report.seedSets.tuning.replications).toBe(REPLICATIONS);
    expect(report.seedSets.holdout?.replications).toBe(REPLICATIONS);
  });

  it('reports a front on both seed sets, with every arm placed', { timeout: 120_000 }, async () => {
    const { report } = await roundOf();

    expect(report.front.entries.map((entry) => entry.candidateId)).toEqual([
      BASE_PROFILE_ID,
      'c-deadband-2',
      'c-deadband-5',
    ]);
    expect(report.holdoutFront).toBeDefined();
    expect(report.holdoutFront?.entries).toHaveLength(3);
    // The front is non-empty on both sets. An empty front over three fully-measured arms is the
    // failure mode this module shipped with, and it produced no error of any kind.
    expect(report.front.front.length).toBeGreaterThan(0);
    expect(report.holdoutFront?.front.length).toBeGreaterThan(0);
    expect(report.front.indeterminate).toEqual([]);
    expect(report.holdoutFront?.indeterminate).toEqual([]);
  });

  it('carries the tuned parameter into the simulator', { timeout: 120_000 }, async () => {
    const { report } = await roundOf();
    const awtOf = (candidateId: string) =>
      report.comparisons
        .find((comparison) => comparison.candidateId === candidateId)
        ?.tuning.find((objective) => objective.objectiveId === 'awt');

    const tightened = awtOf('c-deadband-2');
    expect(tightened).toBeDefined();
    expect(tightened?.pairs).toBe(REPLICATIONS);
    /*
     * The wiring guard, and the whole reason this suite runs a simulator.
     * docs/05-roadmap.md § Standing requirement: "A bit-identical result is a wiring bug until
     * proven otherwise." Moving `idle.repositionThresholdS` from 8 s to 2 s on the building whose
     * sweep has an interior optimum at 2 s must change the runs; if it does not, the parameter is
     * not reaching stage 7 and every number on the page is a measurement of one arm under three
     * names.
     */
    expect(tightened?.verdict).not.toBe('IDENTICAL');
    expect(tightened?.exactZeroPairs).toBeLessThan(tightened?.pairs ?? 0);
    // Direction only, not significance: see the module docstring on why the interval is not asserted.
    expect(tightened?.meanDifference).toBeLessThan(0);
  });

  it('meets the piecewise-constant objective, and says so', { timeout: 120_000 }, async () => {
    const { report } = await roundOf();
    const plateau = report.comparisons
      .find((comparison) => comparison.candidateId === 'c-deadband-5')
      ?.tuning.find((objective) => objective.objectiveId === 'awt');

    /*
     * A step from 8 s to 5 s leaves most replications bit-identical: the deadband only matters on a
     * run where some reposition decision sits between the two values. That is docs/03 § "Measured:
     * flat plateaus, not noise" appearing in a real run rather than in a fixture, and it is why an
     * optimizer taking small steps here stalls.
     */
    expect(plateau?.exactZeroPairs).toBeGreaterThan(0);
    expect(plateau?.exactZeroPairs).toBeLessThanOrEqual(plateau?.pairs ?? 0);
  });

  it('renders a page that carries both sets and the conclusion', { timeout: 120_000 }, async () => {
    const { report, page } = await roundOf();

    expect(page).toContain('SEED SETS');
    expect(page).toContain(`tune-${TUNING_SEED}`);
    expect(page).toContain(`hold-${HOLDOUT_SEED}`);
    expect(page).toContain('DISJOINT');
    expect(page).toContain('PARETO FRONT');
    expect(page).toContain('holdout seed set');
    expect(page).toContain('HOLDOUT — tuning seeds against held-out seeds');
    expect(page).toContain('CONCLUSION');
    expect(page).toContain('idle.repositionThresholdS=2');
    // Deterministic from the report value alone.
    expect(formatTuningReport(report)).toBe(page);
  });

  it('is reproducible: the same seeds produce the same page', { timeout: 120_000 }, async () => {
    const { input } = await fixtureOf();
    const first = await roundOf();
    const again = await runHoldoutRound(input);
    expect(again.page).toBe(first.page);
  });
});

/* -------------------------------------------------------------------------- *
 * The energy axis — the one seam this module cannot close from here
 * -------------------------------------------------------------------------- */

describe('the energy axis', () => {
  it('is empty on every report this repository can currently produce', { timeout: 120_000 }, async () => {
    const { report } = await roundOf();

    /*
     * Not a defect in this module and not papered over either. `core`'s `RunSummary` records no
     * energy, no metres travelled and no stop count, and `runner/metrics.ts` projects none of the
     * three, so there is nothing honest to project onto the axis. It is suppressed with that reason
     * printed rather than defaulted to zero, which would make every arm tie and silently restore a
     * two-axis front. Until a per-run travel statistic exists, docs/06 § Guardrails' three-objective
     * front is a two-objective front and the page says so.
     */
    expect(report.front.inactiveObjectiveIds).toEqual([ENERGY_OBJECTIVE_ID]);
    expect(report.notes.join(' ')).toContain('THE ENERGY AXIS IS EMPTY');
  });

  it('activates the moment a caller can supply a proxy, with no signature changed', { timeout: 120_000 }, async () => {
    const { arms } = await fixtureOf();
    const { tuningResult, holdoutResult } = await roundOf();

    /*
     * The same two experiments, joined again with a proxy supplied. `served` is a stand-in and not a
     * proposal — it is the axis's wiring under test, not its physics. What this pins is that the
     * seam is one function wide: when `core` grows car-metres travelled, `energyProxyOf` is where it
     * arrives and nothing else in this module changes.
     */
    const withEnergy = candidateEvaluationsOf({
      arms,
      tuningResult,
      holdoutResult,
      tuningSeedSetId: 'tune-x',
      holdoutSeedSetId: 'hold-x',
      energyProxyOf: (replication) => replication.summary.counts.alighted,
    });
    const [reference, ...candidates] = withEnergy as [
      (typeof withEnergy)[number],
      ...(typeof withEnergy)[number][],
    ];
    const report = buildTuningReport({ reference, candidates });

    expect(report.front.activeObjectiveIds).toContain(ENERGY_OBJECTIVE_ID);
    expect(report.front.inactiveObjectiveIds).toEqual([]);
    expect(report.notes.join(' ')).not.toContain('THE ENERGY AXIS IS EMPTY');
  });
});
