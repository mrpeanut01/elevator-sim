/**
 * The sequential stopping rule against a real configuration, and against the doc's guidance.
 *
 * docs/03-traffic-and-statistics.md § Part 3 gives a worked target — "±2 s" at "90 %" on AWT — and
 * a budget: "50–200 replications per configuration, not 10." This suite runs the rule at exactly
 * that target and reports where it actually stops.
 *
 * ## The finding, which is a tension in the doc rather than a bug in the code
 *
 * The rule is arithmetically correct and stops where the arithmetic says. On Midtown Office
 * up-peak, `eta`'s per-replication AWT has a standard deviation of ~3.5 s about a mean of ~16.5 s,
 * so `halfWidth = t · s / √n` crosses 2 s at **n = 10** — and 10 is precisely the run count the
 * same document calls a 12 % error. The two pieces of guidance are in conflict, and the reason is
 * that ±2 s is ±12 % of this AWT: the target is looser than the accuracy the budget is there to
 * buy.
 *
 * The runner is already built so that this cannot bite: `RUNNER_DEFAULTS.minReplications` is 50 and
 * the rule is not consulted below it, so the *policy* floor dominates and a default sweep spends
 * 50–200 replications whatever the rule thinks. The number worth writing down is the target that
 * makes the two agree — measured below, ±0.5 s (≈ 3 % of AWT) needs ~140 replications, squarely
 * inside the doc's band. A configuration whose AWT interval should genuinely be ±2 s wide does not
 * need 50 runs, and one tuned to 1 % differences needs far more than 200.
 *
 * ## The defect this suite pins
 *
 * `StoppingVerdict.distribution` is documented as recording "which approximation the rule used —
 * 't' for n ≤ 25, 'z' past it", and `StoppingSummary.evaluations` as letting a replication count
 * "be explained afterwards rather than re-derived". Wire the rule up exactly as `stopping.ts`'s own
 * docstring instructs — `halfWidthStoppingRule((samples, { confidence }) => estimateMean(samples,
 * { confidence }))` — and the field is always `undefined`, because `MeanEstimate` calls it `method`
 * and `HalfWidthEstimate` calls it `distribution`. The recorded audit trail is therefore silent
 * about the one thing the doc singles out. See the report; the assertion below documents the
 * current behaviour so a fix is a visible change rather than a silent one.
 */

import { describe, expect, it } from 'vitest';

import { estimateMean } from '../reports/statistics.js';
import { halfWidthStoppingRule } from '../runner/stopping.js';
import {
  GATE_BUILDING,
  GATE_SEED,
  MIDTOWN_UP_PEAK,
  cellOf,
  loadResources,
  productionStoppingRule,
  runGateExperiment,
  samplesOf,
  withProfiles,
} from './harness.js';
import type { ReplicationMetric } from '../runner/metrics.js';

interface StopOutcome {
  readonly metric: ReplicationMetric;
  readonly acceptableRange: number;
  readonly minReplications: number;
  readonly replicationsRun: number;
  readonly reason: string;
  readonly halfWidth: number | undefined;
  readonly mean: number | undefined;
  readonly stdDev: number | undefined;
  readonly distribution: string | undefined;
}

async function stopAt(
  metric: ReplicationMetric,
  acceptableRange: number,
  minReplications: number,
  checkEvery: number,
): Promise<StopOutcome> {
  const resources = withProfiles(await loadResources(), []);
  const result = await runGateExperiment({
    id: `gate/stopping-${metric}-${acceptableRange}-${minReplications}`,
    seed: GATE_SEED,
    building: GATE_BUILDING,
    dispatchers: ['eta'],
    traffic: MIDTOWN_UP_PEAK,
    replications: 600,
    resources,
    stoppingRule: productionStoppingRule,
    replicationOverrides: {
      minReplications,
      maxReplications: 600,
      checkEvery,
      confidence: 0.9,
      acceptableRange,
      stoppingMetric: metric,
    },
  });
  const cell = cellOf(result, 'eta');
  const last = cell.stopping.evaluations.at(-1);
  return {
    metric,
    acceptableRange,
    minReplications,
    replicationsRun: cell.stopping.replicationsRun,
    reason: cell.stopping.reason,
    halfWidth: last?.verdict.halfWidth,
    mean: last?.verdict.mean,
    stdDev: last?.verdict.stdDev,
    distribution: last?.verdict.distribution,
  };
}

describe('sequential stopping against a real configuration', () => {
  it('reports where ±2 s at 90 % confidence on AWT actually stops', async () => {
    /* Unconstrained: the rule's own crossing point, with the policy floor lowered out of the way. */
    const free = await stopAt('awtS', 2, 2, 1);
    /* As shipped: the doc's replication floor of 50, consulted every 8. */
    const shipped = await stopAt('awtS', 2, 50, 8);

    console.log(
      `[stopping] AWT, ±2 s, 90 %: rule crosses at n = ${free.replicationsRun} (${free.reason}, half-width ${free.halfWidth?.toFixed(4)} s, mean ${free.mean?.toFixed(4)} s, s = ${free.stdDev?.toFixed(4)} s)`,
    );
    console.log(
      `[stopping] AWT, ±2 s, 90 %, with the shipped minReplications = 50: n = ${shipped.replicationsRun} (${shipped.reason}, achieved half-width ${shipped.halfWidth?.toFixed(4)} s, s = ${shipped.stdDev?.toFixed(4)} s)`,
    );

    expect(free.reason).toBe('rule-satisfied');
    expect(shipped.reason).toBe('rule-satisfied');
    /* The doc's own ±2 s target is met long before its 50-replication floor. Reported, not fixed:
       the floor is what protects the result, and the target is what is mis-scaled. */
    expect(free.replicationsRun).toBeLessThan(50);
    expect(shipped.replicationsRun).toBe(50);
    if (shipped.halfWidth === undefined) throw new Error('no evaluation was recorded');
    expect(shipped.halfWidth).toBeLessThan(2);

    /* The defect: the recorded verdict cannot say which quantile family produced the half-width,
       because `estimateMean` reports it as `method` and the port reads `distribution`. */
    expect(free.distribution).toBeUndefined();
    expect(shipped.distribution).toBeUndefined();
    const bridged = halfWidthStoppingRule((samples, { confidence }) => {
      const estimate = estimateMean(samples, { confidence });
      return { ...estimate, distribution: estimate.method };
    });
    const verdict = bridged({
      samples: [1, 2, 3, 4, 5],
      acceptableRange: 10,
      confidence: 0.9,
      metric: 'awtS',
      replications: 5,
    });
    expect(typeof verdict === 'boolean' ? undefined : verdict.distribution).toBe('t');
  }, 1_800_000);

  it('reports the target that puts the run count inside the doc’s 50–200 band', async () => {
    const resources = withProfiles(await loadResources(), []);
    /* One 400-replication reference sample, so every projection below uses the same s. */
    const reference = await runGateExperiment({
      id: 'gate/stopping-reference',
      seed: GATE_SEED,
      building: GATE_BUILDING,
      dispatchers: ['eta'],
      traffic: MIDTOWN_UP_PEAK,
      replications: 400,
      resources,
    });
    const samples = samplesOf(reference, 'eta', 'awtS');
    const estimate = estimateMean([...samples], { confidence: 0.9 });
    console.log(
      `[stopping] reference sample: n = ${estimate.n}, mean ${estimate.mean.toFixed(4)} s, s = ${estimate.stdDev.toFixed(4)} s, 90 % half-width ${estimate.halfWidth.toFixed(4)} s`,
    );
    const z90 = 1.6448536269514722;
    for (const target of [2, 1, 0.8, 0.5, 0.4, 0.25]) {
      const needed = Math.ceil((z90 * estimate.stdDev / target) ** 2);
      console.log(
        `[stopping] ±${target} s (${((target / estimate.mean) * 100).toFixed(1)} % of AWT) at 90 % needs n ≈ ${needed}`,
      );
    }
    /* The claim: the doc's 50–200 budget corresponds to a ±0.5 s target on this configuration,
       not to its own ±2 s worked example. */
    const at050 = Math.ceil((z90 * estimate.stdDev / 0.5) ** 2);
    const at200 = Math.ceil((z90 * estimate.stdDev / 2) ** 2);
    expect(at050).toBeGreaterThanOrEqual(50);
    expect(at050).toBeLessThanOrEqual(200);
    expect(at200).toBeLessThan(50);
  }, 1_800_000);

  it('needs more replications for the WT95 percentile than for the mean', async () => {
    /* docs/03 § Part 5: "Percentile confidence intervals require substantially more replications
       than mean CIs. If WT95 is a headline metric, factor that into the stopping rule." Measured
       at the same absolute target, so the two are comparable. */
    const awt = await stopAt('awtS', 1, 2, 1);
    const wt95 = await stopAt('wt95S', 1, 2, 1);
    console.log(
      `[stopping] at ±1 s and 90 %: AWT stops at n = ${awt.replicationsRun} (s = ${awt.stdDev?.toFixed(4)} s); WT95 stops at n = ${wt95.replicationsRun} (s = ${wt95.stdDev?.toFixed(4)} s)`,
    );
    expect(wt95.replicationsRun).toBeGreaterThan(awt.replicationsRun);
  }, 1_800_000);
});
