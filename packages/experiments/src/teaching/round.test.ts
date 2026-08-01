/**
 * **The round is driven, not described** — docs/14 § 4.2 and § 4.3.
 *
 * Two seeds, two claims, and each isolates one of them. `docs/05-roadmap.md`'s standing
 * requirement is *move the control and require the run to change*, and a teaching surface has two
 * controls that must move different things:
 *
 * | move | must change | must not change |
 * |---|---|---|
 * | the **training** traffic seed | the taught policy | — |
 * | the **holdout** traffic seed | the published interval | the taught policy |
 *
 * The second row is the one that makes § 4.3 mechanical rather than aspirational. A round whose
 * published interval did not move when the holdout traffic moved would be a round reporting a
 * number measured somewhere else — and *"somewhere else"* has exactly one plausible address.
 *
 * The gate is then **re-derived independently**: a fresh two-arm experiment at the holdout traffic
 * seed, built from the winner the round returned, must reproduce the round's own mean. A claim
 * that a figure was measured on held-out traffic is checkable, so it is checked.
 *
 * Budgets here are the smallest that keep every clause live — the verdict budget is the band's own
 * floor of 50, because the spec refuses anything below it and that refusal is the point. These are
 * not the measurement; the measurement is run at the top of the band and published separately.
 */

import { SELECTOR_INPUTS } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { toResources } from '../benchmark/weightSetSelection.js';
import { compareCell } from '../benchmark/verdict.js';
import { loadResources, runGateExperiment, samplesOf } from '../validation/harness.js';
import type { LoadedConfig } from '@elevator-sim/core';
import type { ExperimentResources } from '../runner/types.js';

import { TeachingError, type TeachingSpec } from './spec.js';
import { formatTeachingRound, runTeachingRound, type TeachingRound } from './round.js';

const RUN_SEED = 20260726;
const TRAINING_TRAFFIC_SEED = 900_001;
const HOLDOUT_TRAFFIC_SEED = 900_002;

const POINT = Object.freeze({
  id: 'interfloor-mix-1.5pct',
  durationS: 900,
  reportWindow: 'full-run' as const,
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 0.4, outgoing: 0.3, interfloor: 0.3 }),
    entranceWeights: Object.freeze({ G: 1 }),
    arrivalRatePctPop5min: 1.5,
    peakWindowS: 300,
  }),
});

function specOf(patch: Partial<TeachingSpec['seeds']> = {}): TeachingSpec {
  return {
    id: 'teach-test',
    building: 'midtown-office',
    traffic: [POINT],
    observations: SELECTOR_INPUTS.map((id) => ({ id, causality: 'trailing-window' as const })),
    action: {
      kind: 'weight-set-selection',
      parameterIds: [
        'selection.lobbyArrivalRateGain',
        'selection.interfloorRateGain',
        'selection.downPeakRateGain',
        'selection.switchMargin',
      ],
    },
    objective: {
      gate: 'ttdMeanS',
      direction: 'lower-is-better',
      costs: ['awtS', 'energyPerServedLegKJ'],
      referenceArm: 'census',
    },
    budget: {
      censusReplications: 20,
      searchCandidates: 4,
      searchReplications: 8,
      resolutionReplications: 20,
      verdictReplications: 50,
    },
    seeds: {
      runSeed: RUN_SEED,
      trainingTrafficSeed: TRAINING_TRAFFIC_SEED,
      holdoutTrafficSeed: HOLDOUT_TRAFFIC_SEED,
      ...patch,
    },
  };
}

let config: LoadedConfig;
let resources: ExperimentResources;
let round: TeachingRound;

beforeAll(async () => {
  config = await loadResources();
  resources = toResources(config);
  round = await runTeachingRound({ spec: specOf(), config, resources });
}, 600_000);

describe('the round declares what it measured, and on which traffic', () => {
  it('reports a verdict on held-out traffic, with the two realized seed sets disjoint', () => {
    expect(round.measuredOn).toBe('held-out traffic');
    expect(round.seedSets.disjoint).toBe(true);
    expect(round.seedSets.runSeedHeld).toBe(true);
    expect(['ACCEPTED', 'NOT ACCEPTED']).toContain(round.verdict);
    expect(round.verdictReason).toContain(String(HOLDOUT_TRAFFIC_SEED));
  });

  it('checks its declared observation set against the detector the run actually uses', () => {
    expect(round.observationsMatchDetector).toBe(true);
    expect([...round.detectorInputs].sort()).toEqual([...SELECTOR_INPUTS].sort());
    expect(round.observationWindowS).toBeGreaterThan(0);
  });

  it('chose the reference arm by the point’s own census, before any policy existed', () => {
    const cell = round.cells[0];
    expect(cell?.census.rows.length).toBe(resources.dispatcherProfilesById.size);
    expect(cell?.referenceProfileId).toBe(cell?.census.referenceProfileId);
    expect(cell?.referenceProfileId).not.toBe('nearest-car');
  });

  it('measured this cell’s own resolution limit rather than inheriting docs/07 § 4’s AWT pair', () => {
    const cell = round.cells[0];
    expect(cell?.resolution.provenance).toContain('ttdMeanS');
    /* At the **training** traffic, never the holdout: a limit measured on the traffic it grades
       would make "below the resolution limit" arithmetically identical to "the interval contains
       zero", which is § D140's raise deleted rather than applied. The provenance names the traffic
       seed, so the claim is checkable from the string a reader is handed. */
    expect(cell?.resolution.provenance).toContain(`traffic seed ${String(TRAINING_TRAFFIC_SEED)}`);
    expect(cell?.resolution.provenance).not.toContain(String(HOLDOUT_TRAFFIC_SEED));
    expect(cell?.resolutionLimitS).toBeGreaterThan(0);
  });

  it('prints the whole round, including the training number labelled as not a result', () => {
    const page = formatTeachingRound(round);
    expect(page).toContain('HELD-OUT');
    expect(page).toContain('a bare mean, no interval, not a result');
    expect(page).toContain('NOT the gate');
  });
});

describe('the two seeds move different things', () => {
  it('a different holdout traffic seed moves the published interval and not the policy', async () => {
    const other = await runTeachingRound({
      spec: specOf({ holdoutTrafficSeed: 900_003 }),
      config,
      resources,
    });
    expect(other.policy.winner.selection).toEqual(round.policy.winner.selection);
    expect(other.policy.winner.trainingMeanDeltaS).toBe(round.policy.winner.trainingMeanDeltaS);
    expect(other.cells[0]?.gate.estimate.mean).not.toBe(round.cells[0]?.gate.estimate.mean);
  }, 600_000);

  it('a different training traffic seed moves the policy', async () => {
    const other = await runTeachingRound({
      spec: specOf({ trainingTrafficSeed: 900_004 }),
      config,
      resources,
    });
    expect(other.policy.winner.trainingMeanDeltaS).not.toBe(round.policy.winner.trainingMeanDeltaS);
  }, 600_000);
});

describe('the published gate is re-derivable from the holdout traffic alone', () => {
  it('reproduces the round’s own mean from a fresh experiment at the holdout traffic seed', async () => {
    const cell = round.cells[0];
    if (cell === undefined) throw new Error('the round produced no cell');
    const library = config.dispatcherProfiles;
    expect(library).toBeDefined();
    const experiment = await runGateExperiment({
      id: 'teaching/rederive',
      seed: RUN_SEED,
      trafficSeed: HOLDOUT_TRAFFIC_SEED,
      building: 'midtown-office',
      dispatchers: [
        { id: 'reference', profile: cell.referenceProfileId },
        {
          id: 'taught',
          profile: cell.referenceProfileId,
          options: { selection: round.policy.winner.selection, weightSets: undefined },
        },
      ],
      traffic: POINT,
      replications: 50,
      resources,
    });
    const rederived = compareCell({
      metric: 'ttdMeanS',
      armId: 'taught',
      baselineId: 'reference',
      candidate: samplesOf(experiment, 'taught', 'ttdMeanS'),
      baseline: samplesOf(experiment, 'reference', 'ttdMeanS'),
      quotable: true,
    });
    expect(rederived.estimate.mean).toBeCloseTo(cell.gate.estimate.mean, 9);
  }, 600_000);
});

describe('the round refuses rather than reporting', () => {
  it('refuses a declared observation set the detector does not read', async () => {
    await expect(
      runTeachingRound({
        spec: {
          ...specOf(),
          observations: [{ id: 'lobbyArrivalRate', causality: 'trailing-window' }],
        },
        config,
        resources,
      }),
    ).rejects.toThrow(TeachingError);
  });

  it('refuses a spec whose two traffic seeds are equal, before anything runs', async () => {
    await expect(
      runTeachingRound({
        spec: specOf({ holdoutTrafficSeed: TRAINING_TRAFFIC_SEED }),
        config,
        resources,
      }),
    ).rejects.toThrow(/under a second name/);
  });
});
