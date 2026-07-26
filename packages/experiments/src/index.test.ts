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
import * as oracleModule from './oracle/index.js';
import * as reportsModule from './reports/index.js';
import * as runnerModule from './runner/index.js';
import * as statsModule from './reports/statistics.js';

const submodules = {
  stats: statsModule,
  runner: runnerModule,
  reports: reportsModule,
  oracle: oracleModule,
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
