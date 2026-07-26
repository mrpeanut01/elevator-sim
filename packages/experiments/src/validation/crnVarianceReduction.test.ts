/**
 * **Phase 3 acceptance criterion 3** — "CRN measurably reduces the variance of the difference
 * versus independent runs on the same comparison."
 *
 * ## The measurement
 *
 * One comparison, `nearest-car` against `eta` on Midtown Office up-peak, at n = 100, two ways:
 *
 * - **paired / CRN** — one experiment, two arms. Replication `i` of both arms is driven by
 *   `replicationSeed(GATE_SEED, i)`, so both see a byte-identical passenger population.
 * - **independent** — the `nearest-car` arm paired against `eta` runs from a *different* master
 *   seed, so index `i` names unrelated runs on the two sides.
 *
 * `Var(A − B)` in each design, the reduction as a percentage, and the implied factor in required
 * replications. The independent variance is averaged over six disjoint baseline seed sets, because
 * a single estimate of it is noisy enough to move the headline by tens of percent — the six
 * estimates here span 68 to 85 s², and quoting whichever one came first would be quoting sampling
 * error as a result.
 *
 * The same quantity is also computed *from the CRN arm alone*, as `Var(A) + Var(B)` against
 * `Var(A − B) = Var(A) + Var(B) − 2·Cov(A, B)`. That estimator uses only the paired runs, so it
 * cannot be biased by which seed set the independent baseline drew, and the two answers agreeing
 * is the evidence that the pairing is doing what the algebra says.
 *
 * ## What this suite found, and reports rather than hides
 *
 * docs/03-traffic-and-statistics.md § Part 4 cites published reductions "reaching ~94 %, roughly
 * 5–20× fewer runs". On this simulator that figure is a function of **how similar the two
 * dispatchers are**, and the range is enormous:
 *
 * | Comparison | rho | reduction | factor |
 * |---|---|---|---|
 * | `eta` vs `eta` + 0.1·distanceTravelled | 0.997 | 99.7 % | 324× |
 * | `eta` vs `eta` + 0.8·distanceTravelled | 0.903 | 89.8 % | 9.8× |
 * | `eta` vs `nearest-car` | 0.608 | 43.8 % | 1.8× |
 *
 * So the doc's headline holds in the regime Phase 7 works in — small perturbations of one weight
 * vector — and does **not** hold for a comparison between structurally different dispatchers,
 * where two cars end up in different places within a minute of the first call and the runs
 * decorrelate. The ceiling is also lower than 100 % for a second reason worth stating: with
 * unequal marginal variances, perfect correlation still leaves `(sd_A − sd_B)²`, which on the
 * `nearest-car` comparison is 23.1 of 82.3 s² — so 71.9 % reduction is the *most* that comparison
 * can yield however good the synchronization gets, and 94 % was never reachable there. This suite
 * asserts the ladder, so a future change that broke synchronization would show up as the
 * near-neighbour rung collapsing.
 */

import { describe, expect, it } from 'vitest';

import { verifyCrnAlignment } from '../runner/crn.js';
import {
  GATE_BUILDING,
  GATE_REPLICATIONS,
  GATE_SEED,
  MIDTOWN_UP_PEAK,
  comparePaired,
  digestsOf,
  formatEstimate,
  loadResources,
  measureCrnBenefit,
  runGateExperiment,
  samplesOf,
  withProfiles,
} from './harness.js';
import type { DispatcherArmSpec } from '../runner/types.js';

describe('Phase 3 criterion 3 — common random numbers reduce the variance of the difference', () => {
  it('measures the reduction on nearest-car vs eta, paired against independent', async () => {
    const resources = withProfiles(await loadResources(), []);
    const study = await measureCrnBenefit({
      id: 'gate/crn',
      building: GATE_BUILDING,
      traffic: MIDTOWN_UP_PEAK,
      candidate: 'nearest-car',
      baseline: 'eta',
      candidateArmId: 'nearest-car',
      baselineArmId: 'eta',
      replications: GATE_REPLICATIONS,
      resources,
      seedA: GATE_SEED,
      seedB: 991_827_331,
    });

    console.log(
      `[criterion 3] CRN         Var(A-B) = ${study.crn.varianceOfDifference.toFixed(4)} s², rho = ${study.crn.correlation.toFixed(4)}, ${formatEstimate(study.crn.estimate)}`,
    );
    console.log(
      `[criterion 3] independent Var(A-B) = ${study.independent.varianceOfDifference.toFixed(4)} s², rho = ${study.independent.correlation.toFixed(4)}, ${formatEstimate(study.independent.estimate)}`,
    );
    console.log(
      `[criterion 3] reduction ${(study.varianceReduction * 100).toFixed(2)} %, implied ${study.replicationFactor.toFixed(2)}× fewer replications, half-width ratio ${study.halfWidthRatio.toFixed(3)}`,
    );

    expect(study.crnAligned).toBe(true);
    expect(study.crn.varianceOfDifference).toBeLessThan(study.independent.varianceOfDifference);
    expect(study.varianceReduction).toBeGreaterThan(0);
    /* Independent pairing must show no correlation — that is what makes it the control. */
    expect(Math.abs(study.independent.correlation)).toBeLessThan(0.3);
    expect(study.crn.correlation).toBeGreaterThan(0.3);
  }, 1_800_000);

  it('averages the independent variance over six seed sets, and cross-checks it against the algebra', async () => {
    const resources = withProfiles(await loadResources(), []);
    const paired = await runGateExperiment({
      id: 'gate/crn-paired',
      seed: GATE_SEED,
      building: GATE_BUILDING,
      dispatchers: ['nearest-car', 'eta'],
      traffic: MIDTOWN_UP_PEAK,
      replications: GATE_REPLICATIONS,
      resources,
    });
    expect(digestsOf(paired, 'nearest-car')).toEqual(digestsOf(paired, 'eta'));

    const candidate = samplesOf(paired, 'nearest-car', 'awtS');
    const crn = comparePaired('awtS', candidate, samplesOf(paired, 'eta', 'awtS'));

    const seeds = [991_827_331, 424_242, 5_150_101, 88_991_237, 313_131, 20_260_727] as const;
    const variances: number[] = [];
    for (const seed of seeds) {
      const other = await runGateExperiment({
        id: `gate/crn-independent-${seed}`,
        seed,
        building: GATE_BUILDING,
        dispatchers: ['eta'],
        traffic: MIDTOWN_UP_PEAK,
        replications: GATE_REPLICATIONS,
        resources,
      });
      variances.push(
        comparePaired('awtS', candidate, samplesOf(other, 'eta', 'awtS')).varianceOfDifference,
      );
    }
    const empiricalIndependent = variances.reduce((total, value) => total + value, 0) / variances.length;
    /* Var(A) + Var(B) — the independent variance implied by the paired runs themselves. */
    const impliedIndependent = crn.varianceCandidate + crn.varianceBaseline;

    console.log(
      `[criterion 3] independent Var(A-B) over ${seeds.length} seed sets: ${variances.map((value) => value.toFixed(1)).join(', ')} s² (mean ${empiricalIndependent.toFixed(4)})`,
    );
    console.log(
      `[criterion 3] Var(A) + Var(B) from the paired runs = ${impliedIndependent.toFixed(4)} s²; Var(A-B) under CRN = ${crn.varianceOfDifference.toFixed(4)} s²`,
    );
    console.log(
      `[criterion 3] reduction: empirical ${((1 - crn.varianceOfDifference / empiricalIndependent) * 100).toFixed(2)} %, algebraic ${((1 - crn.varianceOfDifference / impliedIndependent) * 100).toFixed(2)} %`,
    );
    /* Perfect correlation would still leave (sd_A - sd_B)²: the ceiling this comparison has. */
    const floor = (Math.sqrt(crn.varianceCandidate) - Math.sqrt(crn.varianceBaseline)) ** 2;
    console.log(
      `[criterion 3] unequal-variance floor (sd_A - sd_B)² = ${floor.toFixed(4)} s², i.e. a ceiling of ${((1 - floor / impliedIndependent) * 100).toFixed(2)} % reduction on this comparison however good the synchronization`,
    );

    /* The two estimators must agree to well inside the sampling spread of the empirical one. */
    const disagreement =
      Math.abs(empiricalIndependent - impliedIndependent) / impliedIndependent;
    console.log(`[criterion 3] estimator disagreement ${(disagreement * 100).toFixed(2)} %`);
    expect(disagreement).toBeLessThan(0.15);
    expect(crn.varianceOfDifference).toBeLessThan(empiricalIndependent);
  }, 1_800_000);

  it('shows the reduction rising to the doc’s ~94 % as the two arms converge', async () => {
    const resources = withProfiles(await loadResources(), []);
    const arms: DispatcherArmSpec[] = [
      { id: 'base', profile: 'eta' },
      { id: 'near', profile: 'eta', options: { weights: { waitTime: 1, distanceTravelled: 0.1 } } },
      { id: 'mid', profile: 'eta', options: { weights: { waitTime: 1, distanceTravelled: 0.8 } } },
      { id: 'far', profile: 'nearest-car' },
    ];
    const result = await runGateExperiment({
      id: 'gate/crn-ladder',
      seed: GATE_SEED,
      building: GATE_BUILDING,
      dispatchers: arms,
      traffic: MIDTOWN_UP_PEAK,
      replications: GATE_REPLICATIONS,
      resources,
    });
    expect(verifyCrnAlignment(result.cells).aligned).toBe(true);

    const base = samplesOf(result, 'base', 'awtS');
    const reductions = new Map<string, number>();
    for (const armId of ['near', 'mid', 'far']) {
      const comparison = comparePaired('awtS', samplesOf(result, armId, 'awtS'), base);
      const implied = comparison.varianceCandidate + comparison.varianceBaseline;
      const reduction = 1 - comparison.varianceOfDifference / implied;
      reductions.set(armId, reduction);
      console.log(
        `[criterion 3] ${armId.padEnd(5)} rho ${comparison.correlation.toFixed(4)}, Var(A-B) ${comparison.varianceOfDifference.toFixed(4)} s² against ${implied.toFixed(4)} s² independent → ${(reduction * 100).toFixed(2)} % reduction, ${(implied / comparison.varianceOfDifference).toFixed(1)}× fewer replications`,
      );
    }

    const near = reductions.get('near') ?? 0;
    const mid = reductions.get('mid') ?? 0;
    const far = reductions.get('far') ?? 0;
    /* Monotone in similarity: this is the shape a working CRN has, and the shape that would break
       first if a dispatcher id ever leaked into a seed. */
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    /* And in the near-neighbour regime — the one Phase 7's optimizer works in — the doc's claim
       holds with room to spare. */
    expect(near).toBeGreaterThan(0.94);
  }, 1_800_000);
});
