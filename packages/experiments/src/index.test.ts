/**
 * Integration guard for the package's public surface.
 *
 * `src/index.ts` is the only file a consumer of `@elevator-sim/experiments` touches, and it is the
 * one file no module owner edits while working inside their own module. That makes it where drift
 * collects: a submodule gains an export, the barrel does not, and the symbol is invisible from
 * outside the package even though every module test is green.
 *
 * Structural rather than a hand-maintained name list, so the barrel stays in sync automatically —
 * add a module to `submodules` below and the coverage check applies to it too. The mirror of
 * `core/src/index.test.ts`, and it carries one documented exception where `core`'s carries none.
 */

import { describe, expect, it } from 'vitest';

import * as barrel from './index.js';
import * as benchmarkModule from './benchmark/index.js';
import * as oracleModule from './oracle/index.js';
import * as reportsModule from './reports/index.js';
import * as runnerModule from './runner/index.js';
import * as statsModule from './reports/statistics.js';
import * as tuningModule from './tuning/index.js';
import { corpus, nonTestImportersOf } from './tuning/callers.test-helper.js';

const submodules = {
  stats: statsModule,
  runner: runnerModule,
  reports: reportsModule,
  oracle: oracleModule,
  benchmark: benchmarkModule,
  tuning: tuningModule,
} satisfies Record<string, Record<string, unknown>>;

/**
 * Names the barrel deliberately does not re-export, with the reason.
 *
 * The barrel's docstring is the long version. `canonicalJson` is exported by both `runner/` and
 * `reports/` with *different* semantics — the runner's lets `JSON.stringify` turn a `NaN` into
 * `null`, the reports' renders it as `"NaN"` so that "no measurement" is never read back as zero —
 * so re-exporting either under the bare name would hand half the callers the other's behaviour
 * silently. The test below proves the two disagree, which is what makes the omission a decision
 * rather than an oversight.
 */
const OMITTED = new Set(['canonicalJson']);

describe('the public barrel re-exports every module surface', () => {
  it.each(Object.keys(submodules))('re-exports every runtime value from %s', (name) => {
    const submodule = submodules[name as keyof typeof submodules] as Record<string, unknown>;
    const exported = Object.keys(submodule).filter((key) => !OMITTED.has(key));

    /* Guard against a vacuous assertion if a barrel is ever emptied. */
    expect(exported.length).toBeGreaterThan(0);
    expect(Object.keys(barrel)).toEqual(expect.arrayContaining(exported));
  });

  it.each(Object.keys(submodules))('re-exports %s as the same binding, not a copy', (name) => {
    const submodule = submodules[name as keyof typeof submodules] as Record<string, unknown>;
    for (const [key, value] of Object.entries(submodule)) {
      if (OMITTED.has(key)) continue;
      expect((barrel as Record<string, unknown>)[key]).toBe(value);
    }
  });

  it('adds nothing of its own: every barrel export comes from a module', () => {
    const owned = new Set(Object.values(submodules).flatMap((module) => Object.keys(module)));
    expect(Object.keys(barrel).filter((key) => !owned.has(key))).toEqual([]);
  });

  it('omits only what it says it omits, and only where the omission is load-bearing', () => {
    for (const name of OMITTED) expect(Object.keys(barrel)).not.toContain(name);

    /* The reason, asserted rather than asserted-in-a-comment: the two implementations differ on a
       value that matters. A `RunSummary` is full of legitimate `NaN`s, and the difference between
       `null` and `"NaN"` is the difference between "nobody was served" and "the mean was zero". */
    const fromRunner = runnerModule.canonicalJson({ meanS: Number.NaN });
    const fromReports = reportsModule.canonicalJson({ meanS: Number.NaN });
    expect(fromRunner).toBe('{"meanS":null}');
    expect(fromReports).toBe('{"meanS":"NaN"}');
    expect(fromRunner).not.toBe(fromReports);
  });
});

describe('Phase 3 is usable through the barrel alone', () => {
  it('derives common random numbers and confirms replication i is seed f(experimentSeed, i)', () => {
    const seed = barrel.normalizeExperimentSeed(20_260_726);
    const seeds = barrel.replicationSeeds(seed, 4);

    expect(seeds).toHaveLength(4);
    expect(new Set(seeds).size).toBe(4);
    /* The whole of CRN: the same (experimentSeed, index) gives the same seed, whatever else the
       experiment contains — so two arms at index i see one passenger population. */
    for (const [index, value] of seeds.entries()) {
      expect(barrel.replicationSeed(seed, index)).toBe(value);
    }
  });

  it('builds a paired-t interval and reads its verdict', () => {
    const baseline = [16.1, 15.4, 17.2, 16.8, 15.9, 16.4, 17.0, 15.7, 16.2, 16.6];
    /* A constant +2 s offset: a real effect with no variance in the difference at all. */
    const candidate = baseline.map((value) => value + 2);

    const estimate = barrel.pairedDifferenceEstimate(candidate, baseline, { confidence: 0.95 });
    expect(estimate.n).toBe(10);
    expect(estimate.mean).toBeCloseTo(2, 9);
    /* n = 10 is at or below `T_DISTRIBUTION_MAX_N`, so the t family is the one the doc prescribes. */
    expect(barrel.T_DISTRIBUTION_MAX_N).toBe(25);
    expect(estimate.method).toBe('t');
    expect(barrel.intervalContainsZero(estimate)).toBe(false);

    /* And the same series against itself is the null: an interval of exactly [0, 0]. */
    const nothing = barrel.pairedDifferenceEstimate(baseline, baseline);
    expect(nothing.mean).toBe(0);
    expect(barrel.intervalContainsZero(nothing)).toBe(true);
  });

  it('drives the sequential stopping rule with the barrel’s own estimator', () => {
    const rule = barrel.halfWidthStoppingRule((samples, { confidence }) =>
      barrel.estimateMean(samples, { confidence }),
    );
    const input = { acceptableRange: 0.5, confidence: 0.9, metric: 'awtS' as const };

    /* A tight sample satisfies ±0.5 s; a wide one does not. The rule is arithmetic, not taste. */
    const tight = rule({ ...input, samples: [16, 16.1, 15.9, 16.05, 15.95, 16.02], replications: 6 });
    const wide = rule({ ...input, samples: [4, 28, 11, 39, 7, 22], replications: 6 });
    const verdict = (value: boolean | { readonly stop: boolean }): boolean =>
      typeof value === 'boolean' ? value : value.stop;

    expect(verdict(tight)).toBe(true);
    expect(verdict(wide)).toBe(false);
    /* The shipped floor that protects a result whatever the rule thinks (docs/03 § Part 3). */
    expect(barrel.RUNNER_DEFAULTS.minReplications).toBe(50);
  });

  it('exposes the per-replication metric vocabulary a paired comparison ranges over', () => {
    expect(barrel.REPLICATION_METRICS.length).toBeGreaterThan(0);
    expect(barrel.isReplicationMetric('awtS')).toBe(true);
    expect(barrel.isReplicationMetric('not-a-metric')).toBe(false);
    expect(barrel.HEADLINE_METRIC_ID.length).toBeGreaterThan(0);
  });
});

/**
 * Phase 5's contribution to the surface is a *vocabulary*, and it is the part a later phase is
 * most likely to re-derive from memory and get wrong in the optimistic direction. So the barrel is
 * asserted to carry the four distinctions rather than merely to compile.
 */
describe('Phase 5 verdict vocabulary is usable through the barrel alone', () => {
  const cell = (candidate: readonly number[], baseline: readonly number[], quotable = true) =>
    barrel.compareCell({
      metric: 'awtS',
      armId: 'arm',
      baselineId: 'baseline',
      candidate,
      baseline,
      quotable,
    });

  it('separates IDENTICAL from INDISTINGUISHABLE — the distinction no budget collapses', () => {
    const baseline = [16.1, 15.4, 17.2, 16.8, 15.9, 16.4, 17.0, 15.7, 16.2, 16.6];

    /* Bit-identical arms. Not an effect too small to see; no effect. Three of Phase 5's eight
       shipped profiles land here against `eta`, so this is a real case and not a corner. */
    expect(cell(baseline, baseline).verdict).toBe('IDENTICAL');

    /* A difference swamped by its own spread: below resolution at this budget, which is not the
       same as absent and is emphatically not a win. */
    const noisy = baseline.map((value, index) => value + (index % 2 === 0 ? 3.4 : -3.1));
    expect(cell(noisy, baseline).verdict).toBe('INDISTINGUISHABLE');
  });

  it('calls a real effect BETTER or WORSE by its sign, negative being better', () => {
    const baseline = [16.1, 15.4, 17.2, 16.8, 15.9, 16.4, 17.0, 15.7, 16.2, 16.6];
    expect(cell(baseline.map((value) => value - 2), baseline).verdict).toBe('BETTER');
    expect(cell(baseline.map((value) => value + 2), baseline).verdict).toBe('WORSE');
  });

  it('refuses to quote a mean whose cell saturated, whatever the interval says', () => {
    const baseline = [16.1, 15.4, 17.2, 16.8, 15.9, 16.4, 17.0, 15.7, 16.2, 16.6];
    const better = baseline.map((value) => value - 2);

    /* Same samples, same interval — the only change is that a queue diverged. UNQUOTABLE
       short-circuits the arithmetic, because an interval over an invalidated AWT is not a weaker
       result, it is not a result (CLAUDE.md § Statistical discipline). */
    expect(cell(better, baseline, false).verdict).toBe('UNQUOTABLE');
    expect(barrel.CELL_VERDICTS).toContain('UNQUOTABLE');
  });

  it('answers an INDISTINGUISHABLE cell with the n it would need, from its own observed spread', () => {
    /* `n >= (z · s_D / |d|)²`, computed rather than guessed. */
    expect(barrel.replicationsToResolve(1, 10)).toBe(385);
    /* A difference that is exactly zero has no n that resolves it — `undefined`, never a number. */
    expect(barrel.replicationsToResolve(0, 10)).toBeUndefined();
    /* And no spread needs no budget. */
    expect(barrel.replicationsToResolve(1, 0)).toBe(1);
  });

  it('carries the arms and the baseline as data, so a profile cannot be dropped in code', () => {
    expect(barrel.BASELINE_PROFILE).toBe('nearest-car');
    expect(barrel.ARM_PROFILES).not.toContain(barrel.BASELINE_PROFILE);
    expect(barrel.ARM_PROFILES.length).toBeGreaterThan(0);
    expect(barrel.BENCHMARK_CASES.length).toBeGreaterThan(0);
  });
});

/**
 * Phase 7's contribution to the surface is a **module that had no caller at all**, which is a
 * different failure from the one every other block here guards against.
 *
 * docs/08-review-findings.md § 1: `tuning/` shipped complete, correct, unit-tested and reachable
 * from nothing — no `tuning/index.ts`, no re-export from this barrel, no CLI command, and every
 * importer of `randomSearch`, `successiveHalving`, `sepCmaEs`, `runnerObjective` and
 * `runHoldoutRound` a `*.test.ts` beside it. The roadmap's own rule is not *"is it reachable?"* but
 * **"name the non-test caller"**, so both halves are asserted below, separately, because the first
 * one passing is exactly what made the sixth instance invisible.
 */
describe('Phase 7 is reachable from the barrel and called from outside its own tests', () => {
  /** The five entry points docs/08-review-findings.md § 1 names by hand. */
  const ENTRY_POINTS = [
    'randomSearch',
    'successiveHalving',
    'sepCmaEs',
    'runnerObjective',
    'runHoldoutRound',
  ] as const;

  const scope = corpus();

  it.each(ENTRY_POINTS)('re-exports %s from the package root', (name) => {
    const value = (barrel as Record<string, unknown>)[name];
    expect(value, `${name} is not on @elevator-sim/experiments`).toBeTypeOf('function');
    expect(value).toBe((tuningModule as Record<string, unknown>)[name]);
  });

  it.each(ENTRY_POINTS)('has at least one non-test, non-barrel importer of %s', (name) => {
    const callers = nonTestImportersOf(scope, name);
    expect(
      callers,
      `${name} has no non-test caller. A barrel re-export is reachability, not use, and a {@link} ` +
        'tag is neither — that combination is precisely the state Phase 7 shipped in ' +
        '(docs/08-review-findings.md § 1). Something outside a *.test.ts must import it',
    ).not.toEqual([]);
  });

  it('counts the CLI tune command as the caller, and the barrels as not', () => {
    /* Named rather than merely counted: "some file imports it" is satisfiable by a second barrel,
       and the point of the rule is that a specific, shipped, user-reachable path uses it. */
    for (const name of ENTRY_POINTS) {
      expect(nonTestImportersOf(scope, name)).toContain('cli/src/commands/tune.ts');
    }
    /* And the inverse, so the scanner cannot be passing for the wrong reason: the barrels do bind
       these names, and must not be what makes the assertion above pass. */
    expect(nonTestImportersOf(scope, 'randomSearch')).not.toContain('experiments/src/index.ts');
    expect(nonTestImportersOf(scope, 'randomSearch')).not.toContain(
      'experiments/src/tuning/index.ts',
    );
  });

  it('drives the search space through the barrel alone, with no elevator-specific knowledge', () => {
    /* CLAUDE.md invariant 8, as a usable surface rather than as a declaration: a generic optimizer
       reads the schema, draws a point from a named stream, and writes it back as a real profile —
       and nothing in this test names a floor, a car or a call. */
    const space = barrel.searchSpace();
    expect(space.ids.length).toBeGreaterThan(0);
    expect(space.parameters.every((parameter) => parameter.id.includes('.'))).toBe(true);

    const rng = barrel.policyNoiseStream(20_260_727);
    const candidate = barrel.sampleCandidate(space, rng);
    expect(candidate.size).toBeGreaterThan(0);

    /* Exactly in both directions, which is what makes a search's winner a configuration a run can
       be reproduced from rather than a vector nobody can author. */
    const profile = barrel.candidateProfile(space, candidate, { id: 'barrel-probe' });
    expect(profile.id).toBe('barrel-probe');
    const roundTripped = barrel.candidateFromProfile(space, profile);
    for (const [id, value] of candidate) expect(roundTripped.get(id)).toEqual(value);
  });

  it('keeps the two Candidates apart: the space keeps the name, the search is renamed', () => {
    /* A type-level assertion, so it is `tsc` that enforces it and this test that records why.
       `tuning/space`'s Candidate is a parameter assignment; `tuning/search`'s is a configuration
       under evaluation, and its generic is routinely the first. Both are on the surface, under
       names that cannot be confused. */
    const point: barrel.Candidate = new Map([['weights.waitTime', 1]]);
    const underEvaluation: barrel.SearchCandidate<barrel.Candidate> = {
      id: 'c-1',
      value: point,
      origin: 'test',
    };
    expect(underEvaluation.value.get('weights.waitTime')).toBe(1);
  });

  it('exposes the held-out guard as a refusal, not as a warning', () => {
    /* CLAUDE.md § Tuning discipline. An overlapping holdout set is not a weaker guard against
       overfitting, it is *no* guard, so the barrel's own function throws rather than annotating —
       and it is reachable from the package root, which is what this block is about. */
    const observation = (seed: string): barrel.TuningObservation => ({
      runId: `run-${seed}`,
      seed,
      windowSeconds: 3600,
      arrivals: 40,
      served: 40,
      unserved: 0,
      awtS: 16,
      wt95S: 30,
      pctOverLongWait: 0,
      ttdS: 60,
      achievedIntervalS: 40,
      personsPer5Min: 12,
      saturated: false,
      awtIsValid: true,
    });
    const evaluation = (
      tuningSeeds: readonly string[],
      holdoutSeeds: readonly string[],
    ): barrel.CandidateEvaluation => ({
      candidateId: 'c-1',
      tuning: { seedSetId: 'tune', role: 'tuning', observations: tuningSeeds.map(observation) },
      holdout: { seedSetId: 'hold', role: 'holdout', observations: holdoutSeeds.map(observation) },
    });

    expect(() => barrel.assertDisjointSeedSets([evaluation(['1', '2'], ['3', '4'])])).not.toThrow();
    /* One shared seed is enough: the search optimized against that traffic. */
    expect(() => barrel.assertDisjointSeedSets([evaluation(['1', '2'], ['2', '4'])])).toThrow(
      barrel.TuningReportError,
    );
  });
});
