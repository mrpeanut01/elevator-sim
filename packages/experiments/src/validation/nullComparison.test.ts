/**
 * **Phase 3 acceptance criterion 1** — "comparing a dispatcher against itself yields a paired-t
 * interval containing zero."
 *
 * Split into the two questions that sentence hides, because they have different answers and only
 * one of them is statistical.
 *
 * ## 1a. Under common random numbers, the differences must be *exactly* zero
 *
 * Two arms of the same profile at the same replication index are the same configuration driven by
 * the same seed. A deterministic simulator must return the same numbers, so every paired
 * difference is `0` and the interval is `[0, 0]` — not "a small interval straddling zero". A
 * confidence interval here would be a way of not noticing a determinism bug: an interval wide
 * enough to contain zero also contains a leaked `Date.now()`, a `Map` iteration order, or a
 * dispatcher that consumed from a shared RNG. So this suite asserts bit-level identity across
 * **every** metric, and would report non-zero as critical rather than as noise.
 *
 * ## 1b. Across different experiment seeds, the interval must contain zero — usually
 *
 * With two disjoint sets of passenger populations the differences are real noise with a true mean
 * of zero, so the interval contains zero at the nominal rate and **not always**. A suite that
 * asserted "contains zero" on one seed pair would be a 5 %-flaky test *and* an untrue statement
 * about the method. What is actually checkable is the coverage: over 40 disjoint seed pairs, how
 * often does the 95 % interval wrongly exclude zero? The measured answer is 2/40 = 5.0 %, exactly
 * nominal, which is the real content of criterion 1b — the interval machinery is calibrated.
 */

import { describe, expect, it } from 'vitest';

import { REPLICATION_METRICS } from '../runner/metrics.js';
import { verifyCrnAlignment } from '../runner/crn.js';
import { fingerprintExperiment } from '../runner/replicationRunner.js';
import {
  GATE_BUILDING,
  GATE_REPLICATIONS,
  GATE_SEED,
  MIDTOWN_UP_PEAK,
  cellOf,
  comparePaired,
  digestsOf,
  formatEstimate,
  loadResources,
  runGateExperiment,
  samplesOf,
  withProfiles,
} from './harness.js';

describe('Phase 3 criterion 1a — a dispatcher against itself under CRN is bit-identical', () => {
  it('produces exactly zero paired differences on every metric', async () => {
    const resources = withProfiles(await loadResources(), []);
    const result = await runGateExperiment({
      id: 'gate/null-crn',
      seed: GATE_SEED,
      building: GATE_BUILDING,
      /* Two arms, same profile, different arm ids: the same configuration twice. */
      dispatchers: [
        { id: 'left', profile: 'eta' },
        { id: 'right', profile: 'eta' },
      ],
      traffic: MIDTOWN_UP_PEAK,
      replications: GATE_REPLICATIONS,
      resources,
    });

    /* Two genuinely separate cells, genuinely run twice — not one cell compared with itself, and
       not a cache. 200 replications for 100 pairs, and two distinct run ids per index. */
    expect(result.cells).toHaveLength(2);
    expect(result.replicationsRun).toBe(GATE_REPLICATIONS * 2);
    const leftIds = cellOf(result, 'left').replications.map((record) => record.runId);
    const rightIds = cellOf(result, 'right').replications.map((record) => record.runId);
    expect(new Set([...leftIds, ...rightIds]).size).toBe(GATE_REPLICATIONS * 2);

    /* The populations must be the same before the metrics can mean anything. */
    const audit = verifyCrnAlignment(result.cells);
    expect(audit.aligned).toBe(true);
    expect(audit.comparableCohorts).toBe(1);
    expect(audit.checkedReplications).toBe(GATE_REPLICATIONS);
    expect(digestsOf(result, 'left')).toEqual(digestsOf(result, 'right'));

    const offenders: string[] = [];
    for (const metric of REPLICATION_METRICS) {
      const left = samplesOf(result, 'left', metric);
      const right = samplesOf(result, 'right', metric);
      expect(left).toHaveLength(GATE_REPLICATIONS);
      for (const [index, value] of left.entries()) {
        const other = right[index] as number;
        const same = Number.isNaN(value) ? Number.isNaN(other) : value === other;
        if (!same) offenders.push(`${metric}[${index}]: ${value} vs ${other}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `A dispatcher compared against itself under common random numbers produced different numbers. This is a determinism bug (CLAUDE.md invariants 2, 3, 4), not statistical noise, and every paired comparison in the project rests on it being impossible.\n${offenders.slice(0, 20).join('\n')}`,
      );
    }

    const awt = comparePaired('awtS', samplesOf(result, 'left', 'awtS'), samplesOf(result, 'right', 'awtS'));
    console.log(
      `[criterion 1a] AWT paired difference ${formatEstimate(awt.estimate)}; exact zeros ${awt.exactZeroCount}/${awt.n}; max |difference| ${awt.maxAbsDifference}`,
    );
    expect(awt.exactZeroCount).toBe(GATE_REPLICATIONS);
    expect(awt.maxAbsDifference).toBe(0);
    expect(awt.estimate.lower).toBe(0);
    expect(awt.estimate.upper).toBe(0);
    /* [0, 0] contains zero, which is criterion 1 read literally, and is the strongest form of it. */
    expect(awt.significant).toBe(false);
  }, 600_000);
});

describe('Phase 3 criterion 1b — a dispatcher against itself on disjoint seeds is calibrated', () => {
  /**
   * 40 disjoint pairs of 100-replication seed sets. Deterministic — the seeds are fixed — so the
   * measured rejection count is a fact about this simulator and not a coin flip, but the *bound*
   * asserted is chosen from the binomial distribution before looking: `X ~ Bin(40, 0.05)` has
   * mean 2, and `P(X ≥ 8) ≈ 0.2 %`. A count at or above 8 would say the interval under-covers,
   * which for a lognormal AWT at n = 100 is a real possibility worth testing rather than assuming
   * (docs/03-traffic-and-statistics.md § "AWT is lognormal, but approximate it as normal").
   */
  it('rejects the true null at about the nominal 5 % rate', async () => {
    const resources = withProfiles(await loadResources(), []);
    const pairs = 40;
    const series: number[][] = [];
    for (let i = 0; i < pairs * 2; i += 1) {
      const seed = 10_000_019 + i * 7_919;
      const run = await runGateExperiment({
        id: `gate/null-independent-${seed}`,
        seed,
        building: GATE_BUILDING,
        dispatchers: ['eta'],
        traffic: MIDTOWN_UP_PEAK,
        replications: GATE_REPLICATIONS,
        resources,
      });
      series.push([...samplesOf(run, 'eta', 'awtS')]);
    }

    let rejections = 0;
    let containedZero = 0;
    const effects: number[] = [];
    for (let i = 0; i < pairs; i += 1) {
      const comparison = comparePaired(
        'awtS',
        series[2 * i] as number[],
        series[2 * i + 1] as number[],
      );
      effects.push(comparison.estimate.mean);
      if (comparison.significant) rejections += 1;
      else containedZero += 1;
    }
    const meanEffect = effects.reduce((total, value) => total + value, 0) / effects.length;
    console.log(
      `[criterion 1b] ${containedZero}/${pairs} paired-t intervals contained zero (${((rejections / pairs) * 100).toFixed(1)} % rejection against a nominal 5 %); mean measured difference ${meanEffect.toFixed(4)} s`,
    );

    expect(rejections).toBeLessThan(8);
    expect(containedZero).toBeGreaterThan(pairs - 8);
    /* The point estimate of a true zero must itself be near zero: 40 × 100 replications of the
       same configuration cannot average to a bias without something being wrong with the seeding. */
    expect(Math.abs(meanEffect)).toBeLessThan(0.5);
  }, 1_800_000);
});

describe('the determinism criterion 1a rests on', () => {
  /**
   * Two runs of one spec, from scratch, compared by `fingerprintExperiment` — every replication's
   * summary, scalar projection, saturation flag, trace digest and conservation audit, plus each
   * cell's stopping history. Criterion 1a is the *comparison* case of this; asserting the whole
   * result separately means a determinism regression is attributed to determinism rather than
   * showing up as an inexplicable non-zero difference.
   */
  it('gives byte-identical results for the same spec run twice', async () => {
    const resources = withProfiles(await loadResources(), []);
    const run = async (): Promise<string> =>
      fingerprintExperiment(
        await runGateExperiment({
          id: 'gate/determinism',
          seed: GATE_SEED,
          building: GATE_BUILDING,
          dispatchers: ['eta', 'nearest-car'],
          traffic: MIDTOWN_UP_PEAK,
          replications: 20,
          resources,
        }),
      );
    const first = await run();
    const second = await run();
    console.log(`[determinism] experiment fingerprint ${first.length} chars, identical=${first === second}`);
    expect(second).toBe(first);
  }, 600_000);
});
