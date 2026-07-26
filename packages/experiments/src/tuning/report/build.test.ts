/**
 * Assembly — what the page is allowed to contain before anybody formats it.
 *
 * The claims here are structural: which guards ran, which candidates were flagged, what the report
 * refuses outright. Every fixture is built to a known answer for the reason
 * `fixtures.test-helper.ts` gives — the point of the module is to recognize a situation, and a
 * simulation cannot be asked to produce an overfitted candidate on demand.
 */

import { describe, expect, it } from 'vitest';

import { loadConfig, runSimulation, type LoadedConfig } from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';

import { buildTuningReport, seedSetFromReplications } from './build.js';
import { ENERGY_OBJECTIVE_ID } from './pareto.js';
import { TuningReportError, type CandidateEvaluation } from './types.js';
import { HOLDOUT_SEEDS, TUNING_SEEDS, candidate, wobble } from './fixtures.test-helper.js';

const jitter = (values: readonly number[], size: number): readonly number[] =>
  values.map((value, index) => value + (index % 2 === 0 ? size : -size));

const REF_TUNING = wobble(16, TUNING_SEEDS.length);
const REF_HOLDOUT = wobble(16.4, HOLDOUT_SEEDS.length);
const REF_ENERGY = wobble(100, TUNING_SEEDS.length, 3);

const reference = candidate({
  candidateId: 'predictive-balanced',
  tuningAwt: REF_TUNING,
  holdoutAwt: REF_HOLDOUT,
  tuningEnergy: REF_ENERGY,
  holdoutEnergy: REF_ENERGY,
});

/** A candidate offset by a constant on each seed set, with a fixed non-degenerate spread. */
function offset(
  candidateId: string,
  tuningOffset: number,
  holdoutOffset: number,
  energyOffset = 0,
): CandidateEvaluation {
  return candidate({
    candidateId,
    tuningAwt: jitter(REF_TUNING.map((value) => value + tuningOffset), 0.1),
    holdoutAwt: jitter(REF_HOLDOUT.map((value) => value + holdoutOffset), 0.1),
    tuningEnergy: REF_ENERGY.map((value) => value + energyOffset),
    holdoutEnergy: REF_ENERGY.map((value) => value + energyOffset),
    parameters: { 'idle.repositionThresholdS': 2, 'weights.waitTime': 1.2 },
  });
}

const honest = offset('c-honest', -2, -2);
const overfitted = offset('c-overfit', -2, 0);
const near = offset('c-near', 0, 0);

/* -------------------------------------------------------------------------- *
 * What the report refuses
 * -------------------------------------------------------------------------- */

describe('buildTuningReport refuses what cannot be reported honestly', () => {
  it('refuses a holdout set that overlaps the tuning set', () => {
    const leaky = candidate({
      candidateId: 'leaky',
      tuningAwt: REF_TUNING,
      holdoutAwt: REF_HOLDOUT,
      holdoutSeeds: [...HOLDOUT_SEEDS.slice(0, 11), TUNING_SEEDS[0] as number],
    });

    expect(() => buildTuningReport({ reference, candidates: [leaky] })).toThrow(TuningReportError);
  });

  it('reports the overlap instead of throwing only when a caller explicitly asks', () => {
    const leaky = candidate({
      candidateId: 'leaky',
      tuningAwt: REF_TUNING,
      holdoutAwt: REF_HOLDOUT,
      holdoutSeeds: [...HOLDOUT_SEEDS.slice(0, 11), TUNING_SEEDS[0] as number],
    });
    const report = buildTuningReport({
      reference,
      candidates: [leaky],
      requireDisjointSeedSets: false,
    });

    // The reference's own two sets are disjoint. The verdict is not read off the reference: one
    // leaky arm makes the guard meaningless for the arm the page is actually about.
    expect(report.seedSets.disjoint).toBe(false);
    expect(report.seedSets.sharedSeeds).toEqual(['1']);
    expect(report.notes.join(' ')).toContain('THE HOLDOUT SET IS NOT DISJOINT');
  });

  it('refuses a candidate id that repeats the reference', () => {
    expect(() =>
      buildTuningReport({ reference, candidates: [offset('predictive-balanced', -1, -1)] }),
    ).toThrow(/appears twice/);
  });
});

/* -------------------------------------------------------------------------- *
 * The front
 * -------------------------------------------------------------------------- */

describe('the front', () => {
  it('places the reference arm on it like any other candidate', () => {
    const report = buildTuningReport({ reference, candidates: [honest, overfitted, near] });

    expect(report.front.entries.map((entry) => entry.candidateId)).toEqual([
      'predictive-balanced',
      'c-honest',
      'c-overfit',
      'c-near',
    ]);
    expect(report.front.dominated).toContain('predictive-balanced');
  });

  it('recomputes the front on the holdout seeds, where the overfitted candidate falls off', () => {
    const report = buildTuningReport({ reference, candidates: [honest, overfitted, near] });

    expect(report.front.front).toContain('c-overfit');
    expect(report.holdoutFront?.front).not.toContain('c-overfit');
    expect(report.holdoutFront?.front).toContain('c-honest');
  });

  it('prints candidates in the order supplied, never reordered by result', () => {
    const report = buildTuningReport({ reference, candidates: [near, overfitted, honest] });
    expect(report.candidates.map((summary) => summary.candidateId)).toEqual([
      'c-near',
      'c-overfit',
      'c-honest',
    ]);
  });

  it('carries no scalarized score anywhere in the value', () => {
    const report = buildTuningReport({ reference, candidates: [honest] });
    const serialized = JSON.stringify(report, (_key, value: unknown) =>
      typeof value === 'function' ? '[fn]' : value,
    );

    expect(serialized).not.toMatch(/"(score|overall|weightedTotal|fitness)"/);
  });
});

/* -------------------------------------------------------------------------- *
 * The guards
 * -------------------------------------------------------------------------- */

describe('the anti-overfitting guards', () => {
  it('flags the candidate whose gain did not survive disjoint seeds', () => {
    const report = buildTuningReport({ reference, candidates: [honest, overfitted, near] });

    expect(report.flaggedOverfitting).toEqual(['c-overfit']);
    expect(report.unconfirmed).toEqual([]);
  });

  it('says loudly when there is no holdout set at all', () => {
    const tuningOnly = candidate({
      candidateId: 'tuning-only',
      tuningAwt: jitter(REF_TUNING.map((value) => value - 2), 0.1),
      tuningEnergy: REF_ENERGY,
    });
    const report = buildTuningReport({
      reference: candidate({
        candidateId: 'predictive-balanced',
        tuningAwt: REF_TUNING,
        tuningEnergy: REF_ENERGY,
      }),
      candidates: [tuningOnly],
    });

    expect(report.holdoutFront).toBeUndefined();
    expect(report.notes.join(' ')).toContain('NO HOLDOUT SET');
    expect(report.holdout.every((assessment) => assessment.verdict === 'unquotable')).toBe(true);
  });

  it('notes an empty energy axis rather than letting the front look three-dimensional', () => {
    const noEnergyReference = candidate({
      candidateId: 'ref',
      tuningAwt: REF_TUNING,
      holdoutAwt: REF_HOLDOUT,
    });
    const noEnergyCandidate = candidate({
      candidateId: 'c',
      tuningAwt: jitter(REF_TUNING.map((value) => value - 2), 0.1),
      holdoutAwt: jitter(REF_HOLDOUT.map((value) => value - 2), 0.1),
    });
    const report = buildTuningReport({
      reference: noEnergyReference,
      candidates: [noEnergyCandidate],
    });

    expect(report.front.inactiveObjectiveIds).toEqual([ENERGY_OBJECTIVE_ID]);
    expect(report.notes.join(' ')).toContain('THE ENERGY AXIS IS EMPTY');
    expect(report.notes.join(' ')).toContain('not evidence that energy is unaffected');
  });

  it('notes a candidate that did not run on the reference seeds, because CRN is then partial', () => {
    const shortSeeds = candidate({
      candidateId: 'short',
      tuningAwt: REF_TUNING.slice(0, 8),
      holdoutAwt: REF_HOLDOUT.slice(0, 8),
      tuningEnergy: REF_ENERGY.slice(0, 8),
      holdoutEnergy: REF_ENERGY.slice(0, 8),
    });
    const report = buildTuningReport({ reference, candidates: [shortSeeds] });

    expect(report.notes.join(' ')).toContain("Not every candidate ran on the reference's tuning seeds");
    expect(report.notes.join(' ')).toContain('99.69%');
  });

  it('names a bit-identical candidate as a plateau rather than a near miss', () => {
    const twin = candidate({
      candidateId: 'twin',
      tuningAwt: REF_TUNING,
      holdoutAwt: REF_HOLDOUT,
      tuningEnergy: REF_ENERGY,
      holdoutEnergy: REF_ENERGY,
    });
    const report = buildTuningReport({ reference, candidates: [twin] });

    expect(report.notes.join(' ')).toContain('bit-identical runs');
    expect(report.notes.join(' ')).toContain('plateau');
  });

  it('flags saturated replications, and Phase 3 suppresses their wait statistics', () => {
    const saturatedCandidate = candidate({
      candidateId: 'saturated',
      tuningAwt: REF_TUNING,
      holdoutAwt: REF_HOLDOUT,
      tuningEnergy: REF_ENERGY,
      holdoutEnergy: REF_ENERGY,
    });
    const withSaturation: CandidateEvaluation = {
      ...saturatedCandidate,
      tuning: {
        ...saturatedCandidate.tuning,
        observations: saturatedCandidate.tuning.observations.map((entry, index) =>
          index === 0 ? { ...entry, saturated: true, awtIsValid: false } : entry,
        ),
      },
    };
    const report = buildTuningReport({ reference, candidates: [withSaturation] });
    const summary = report.candidates[0];

    expect(report.notes.join(' ')).toContain('Saturated replications present in: saturated');
    expect(summary?.tuning.statisticallyValid).toBe(false);
    expect(summary?.tuning.metrics.find((metric) => metric.metricId === 'awt')?.suppressed).toBe(
      true,
    );
    // Energy survives, exactly as handling capacity does: it is a real measurement of a failing
    // configuration, and suppressing it would hide the evidence for why it failed.
    expect(summary?.tuning.metrics.find((metric) => metric.metricId === 'energy')?.suppressed).toBe(
      false,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Replication accounting
 * -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- *
 * The integration seam
 * -------------------------------------------------------------------------- */

describe('seedSetFromReplications', () => {
  /*
   * Driven by the real simulator against the real `data/` directory, not by a literal. The risk
   * this seam carries is a *field mapping* — reading AWT off the wrong member of `RunSummary`, or
   * reading a field the simulator does not actually populate — and a hand-built summary would prove
   * only that a hand-built summary maps correctly. Garden Apartments is the cheapest building that
   * produces a valid, non-saturated peak: about a millisecond a run.
   */
  const DATA_DIR = fileURLToPath(new URL('../../../../../data', import.meta.url));
  let config: LoadedConfig | undefined;

  const summaries = async () => {
    config ??= await loadConfig(DATA_DIR);
    const building = config.buildingsById.get('garden-apartments');
    const profile = config.dispatcherProfilesById.get('collective');
    if (building === undefined || profile === undefined) throw new Error('missing fixture data');
    return [11n, 12n, 13n].map((seed, index) => ({
      replication: index,
      summary: runSimulation({
        building,
        dispatcherProfile: profile,
        trafficProfiles: (config as LoadedConfig).trafficProfiles,
        elevatorSpecs: (config as LoadedConfig).elevatorSpecs,
        seed,
        onTimeout: 'report' as const,
      }).summary,
    }));
  };

  it('turns a runner cell into a seed set carrying the seed as the pairing key', async () => {
    const seedSet = await summaries().then((replications) =>
      seedSetFromReplications(replications, { seedSetId: 'tune-a', role: 'tuning' }),
    );

    expect(seedSet.seedSetId).toBe('tune-a');
    expect(seedSet.role).toBe('tuning');
    expect(seedSet.observations.map((entry) => entry.seed)).toEqual(['11', '12', '13']);
    expect(seedSet.observations.every((entry) => Number.isFinite(entry.awtS))).toBe(true);
    expect(seedSet.observations.every((entry) => Number.isFinite(entry.wt95S))).toBe(true);
  });

  it('leaves the energy axis unmeasured unless a caller supplies a proxy', async () => {
    const replications = await summaries();
    const bare = seedSetFromReplications(replications, { seedSetId: 'tune-a', role: 'tuning' });
    const withEnergy = seedSetFromReplications(replications, {
      seedSetId: 'tune-a',
      role: 'tuning',
      // A stand-in for a proxy the simulator does not yet record. Any finite per-replication
      // scalar exercises the seam; `alighted` is chosen because it is always populated.
      energyProxyOf: (replication) => replication.summary.counts.alighted,
    });

    expect(bare.observations.every((entry) => entry.energyProxy === undefined)).toBe(true);
    expect(withEnergy.observations.every((entry) => Number.isFinite(entry.energyProxy))).toBe(true);
  });

  it('drops a non-finite proxy rather than carrying NaN into an interval', async () => {
    const seedSet = await summaries().then((replications) =>
      seedSetFromReplications(replications, {
        seedSetId: 'tune-a',
        role: 'tuning',
        energyProxyOf: () => Number.NaN,
      }),
    );
    expect(seedSet.observations.every((entry) => entry.energyProxy === undefined)).toBe(true);
  });
});

describe('replication accounting', () => {
  it('carries the replication count of both seed sets', () => {
    const report = buildTuningReport({ reference, candidates: [honest] });

    expect(report.seedSets.tuning.replications).toBe(12);
    expect(report.seedSets.holdout?.replications).toBe(12);
    expect(report.reference.tuning.replications).toBe(12);
    expect(report.reference.holdout?.replications).toBe(12);
  });

  it('warns below the 50-replication floor the project budget is stated in', () => {
    const report = buildTuningReport({ reference, candidates: [honest] });
    expect(report.reference.tuning.warnings.join(' ')).toContain('50–200 budget');
  });

  it('reports convergence as not assessed when no target half-width was given', () => {
    const report = buildTuningReport({ reference, candidates: [honest] });
    expect(report.reference.tuning.convergence.status).toBe('not-assessed');

    const targeted = buildTuningReport({
      reference,
      candidates: [honest],
      targetHalfWidth: 1,
      replicationCap: 12,
    });
    expect(targeted.reference.tuning.convergence.status).toBe('converged');
  });
});
