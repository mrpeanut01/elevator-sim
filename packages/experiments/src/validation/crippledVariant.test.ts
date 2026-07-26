/**
 * **Phase 3 acceptance criterion 2** — "comparing against a deliberately crippled variant yields
 * an interval excluding zero" — and the number Phases 5 and 7 actually need from this gate: the
 * smallest degradation the apparatus can *resolve*.
 *
 * ## The variants are config, never code
 *
 * CLAUDE.md invariant 7. Three cripples, by three different config routes, so the criterion is not
 * resting on one mechanism:
 *
 * | Variant | Route | What it does |
 * |---|---|---|
 * | `ignores-wait` | `DispatchPolicyOptions.weights` on the arm | `waitTime: 0`, `directionReversal: 1` — the doc's own suggestion, a weight vector that ignores waiting time entirely |
 * | `park-stay` | a derived `DispatcherProfile` registered under a new id | `idle.parkingStrategy: 'stay'` — cars are left wherever they last stopped |
 * | `no-assignable-car` | `DispatchPolicyOptions.eligibility` | `maxLoadFactorForAssignment: 0.05` — no car may ever be assigned |
 *
 * The third is included because it is the *pathological* case and it is the one that shows the
 * apparatus refusing to answer: nobody is served, AWT is `NaN`, and `estimateMean` throws rather
 * than averaging an absent measurement. A gate that could be talked into a confidence interval
 * there could be talked into one anywhere.
 *
 * `park-stay` turns out to be the simulator's **default** (`DISPATCH_DEFAULTS.parkingStrategy` is
 * `'stay'`), which makes the honest form of that comparison the other way round: lobby parking is
 * the variant and it is a 78 % improvement on up-peak. It is reported as measured, in the
 * direction the numbers point, rather than relabelled to fit the criterion's wording.
 *
 * ## The resolution limit
 *
 * A single crippled variant proves the interval can exclude zero when handed a 12 % effect. It
 * says nothing about whether a 1 % dispatcher improvement is measurable, which is the question
 * Phase 5 ("each dispatcher beats nearest-car") and Phase 7 ("candidates whose difference falls
 * below the half-width are reported as indistinguishable") live or die on. So the second suite
 * here walks a ladder of *small* degradations — `eta` with a `distanceTravelled` weight of δ
 * added, δ from 0.3 to 1.6 — across ten independent seed sets at n = 100, and reports the
 * detection rate at each rung. That is a power curve, and its knee is the project's practical
 * resolution limit.
 */

import { describe, expect, it } from 'vitest';

import { verifyCrnAlignment } from '../runner/crn.js';
import { estimateMean } from '../reports/statistics.js';
import { ReportsError } from '../reports/types.js';
import {
  GATE_BUILDING,
  GATE_REPLICATIONS,
  GATE_SEED,
  MIDTOWN_UP_PEAK,
  cellOf,
  comparePaired,
  derivedProfile,
  formatEstimate,
  loadResources,
  runGateExperiment,
  samplesOf,
  withProfiles,
} from './harness.js';
import type { DispatcherArmSpec } from '../runner/types.js';

describe('Phase 3 criterion 2 — a crippled variant is detected', () => {
  it('excludes zero for a weight vector that ignores waiting time', async () => {
    const config = await loadResources();
    const eta = config.dispatcherProfilesById.get('eta');
    if (eta === undefined) throw new Error('data/dispatcher-profiles.json no longer defines "eta".');
    const resources = withProfiles(config, [
      derivedProfile(eta, 'eta-park-lobby', {
        name: 'eta, idle cars return to the lobby',
        idle: { parkingStrategy: 'lobby' },
      }),
    ]);

    const result = await runGateExperiment({
      id: 'gate/crippled',
      seed: GATE_SEED,
      building: GATE_BUILDING,
      dispatchers: [
        { id: 'base', profile: 'eta' },
        {
          id: 'ignores-wait',
          profile: 'eta',
          options: { weights: { waitTime: 0, directionReversal: 1 } },
        },
        { id: 'park-lobby', profile: 'eta-park-lobby' },
      ],
      traffic: MIDTOWN_UP_PEAK,
      replications: GATE_REPLICATIONS,
      resources,
    });

    expect(verifyCrnAlignment(result.cells).aligned).toBe(true);
    const base = samplesOf(result, 'base', 'awtS');
    const baseCell = cellOf(result, 'base');
    expect(baseCell.aggregate.saturatedCount).toBe(0);
    expect(baseCell.aggregate.awtIsValid).toBe(true);
    const baseMean = base.reduce((total, value) => total + value, 0) / base.length;

    const crippled = comparePaired('awtS', samplesOf(result, 'ignores-wait', 'awtS'), base);
    const crippledCell = cellOf(result, 'ignores-wait');
    console.log(
      `[criterion 2] base AWT ${baseMean.toFixed(4)} s; "ignores-wait" ${crippled.candidateMean.toFixed(4)} s; paired difference ${formatEstimate(crippled.estimate)} = +${((crippled.estimate.mean / baseMean) * 100).toFixed(2)} % (rho ${crippled.correlation.toFixed(3)}, sd_D ${Math.sqrt(crippled.varianceOfDifference).toFixed(3)} s, saturated ${crippledCell.aggregate.saturatedCount}/${GATE_REPLICATIONS})`,
    );

    /* The criterion, and its direction: worse, significantly. */
    expect(crippledCell.aggregate.awtIsValid).toBe(true);
    expect(crippled.significant).toBe(true);
    expect(crippled.estimate.lower).toBeGreaterThan(0);

    /* How many replications this effect actually needed, computed from the measured spread:
       n = (t · s_D / Δ)² . Reported so the criterion is not mistaken for "100 were required". */
    const sd = Math.sqrt(crippled.varianceOfDifference);
    const needed = Math.ceil((1.96 * sd / Math.abs(crippled.estimate.mean)) ** 2);
    console.log(
      `[criterion 2] replications needed for this effect at 95 %: ${needed} (measured with ${GATE_REPLICATIONS})`,
    );
    expect(needed).toBeLessThan(GATE_REPLICATIONS);

    /* The parking comparison, in the direction the numbers point. `stay` is the default, so the
       honest statement is that lobby parking is a large improvement, not that `stay` is a cripple
       somebody invented for this test. */
    const parking = comparePaired('awtS', samplesOf(result, 'park-lobby', 'awtS'), base);
    console.log(
      `[criterion 2] idle.parkingStrategy 'lobby' vs the default 'stay': ${formatEstimate(parking.estimate)} = ${((parking.estimate.mean / baseMean) * 100).toFixed(2)} % on AWT`,
    );
    expect(parking.significant).toBe(true);
    expect(parking.estimate.upper).toBeLessThan(0);
  }, 600_000);

  it('refuses an interval for a variant that serves nobody', async () => {
    const resources = withProfiles(await loadResources(), []);
    const result = await runGateExperiment({
      id: 'gate/crippled-pathological',
      seed: GATE_SEED,
      building: GATE_BUILDING,
      dispatchers: [
        { id: 'base', profile: 'eta' },
        {
          id: 'no-assignable-car',
          profile: 'eta',
          options: { eligibility: { maxLoadFactorForAssignment: 0.05 } },
        },
      ],
      traffic: MIDTOWN_UP_PEAK,
      replications: 10,
      resources,
    });
    const cell = cellOf(result, 'no-assignable-car');
    const samples = samplesOf(result, 'no-assignable-car', 'awtS');
    console.log(
      `[criterion 2] eligibility.maxLoadFactorForAssignment = 0.05: awtIsValid=${cell.aggregate.awtIsValid} (${cell.aggregate.awtInvalidReason ?? '-'}), nonFinite ${cell.aggregate.metrics.awtS.nonFiniteCount}/${samples.length}, unserved fraction ${cell.aggregate.metrics.unservedFraction.statistic?.mean.toFixed(4) ?? 'n/a'}`,
    );
    expect(cell.aggregate.awtIsValid).toBe(false);
    expect(cell.aggregate.metrics.awtS.nonFiniteCount).toBeGreaterThan(0);
    /* And the interval arithmetic refuses rather than propagating NaN into a printed interval. */
    expect(() => estimateMean(samples)).toThrow(ReportsError);
  }, 600_000);
});

describe('Phase 3 resolution limit — the smallest degradation detectable at n = 100', () => {
  /**
   * A power curve, not a single significance test.
   *
   * "Reliably detect" is a statement about repetition, so each rung is measured on ten disjoint
   * seed sets of 100 replications and the detection rate is reported. Nothing here is tuned: the
   * rungs were chosen to bracket the knee, the confidence level is 95 %, and the assertion is only
   * that the curve is a curve — power at the bottom rung is below the top rung's, and the top rung
   * is detected on every seed set.
   */
  it('reports the detection rate against effect size', async () => {
    const resources = withProfiles(await loadResources(), []);
    const deltas = [0.3, 0.4, 0.5, 0.6, 0.8, 1.2, 1.6] as const;
    const seeds = [
      GATE_SEED, 991_827_331, 424_242, 5_150_101, 88_991_237, 313_131, 20_260_727, 7_777_777, 1_009,
      60_221_408,
    ] as const;
    const arms: DispatcherArmSpec[] = [
      { id: 'base', profile: 'eta' },
      ...deltas.map((delta) => ({
        id: `d${delta}`,
        profile: 'eta',
        options: { weights: { waitTime: 1, distanceTravelled: delta } },
      })),
    ];

    const rows = new Map<number, { effects: number[]; halfWidths: number[]; detected: number }>();
    for (const delta of deltas) rows.set(delta, { effects: [], halfWidths: [], detected: 0 });
    let baseMeanTotal = 0;

    for (const seed of seeds) {
      const result = await runGateExperiment({
        id: `gate/resolution-${seed}`,
        seed,
        building: GATE_BUILDING,
        dispatchers: arms,
        traffic: MIDTOWN_UP_PEAK,
        replications: GATE_REPLICATIONS,
        resources,
      });
      const base = samplesOf(result, 'base', 'awtS');
      baseMeanTotal += base.reduce((total, value) => total + value, 0) / base.length;
      for (const delta of deltas) {
        const comparison = comparePaired('awtS', samplesOf(result, `d${delta}`, 'awtS'), base);
        const row = rows.get(delta);
        if (row === undefined) continue;
        row.effects.push(comparison.estimate.mean);
        row.halfWidths.push(comparison.estimate.halfWidth);
        /* Detected *and* in the right direction. A significant interval on the wrong side is a
           worse outcome than no interval, and counting it as power would hide it. */
        if (comparison.significant && comparison.estimate.lower > 0) row.detected += 1;
      }
    }

    const baseMean = baseMeanTotal / seeds.length;
    console.log(
      `[resolution] base AWT ${baseMean.toFixed(4)} s; ${seeds.length} seed sets × n = ${GATE_REPLICATIONS}; 95 % paired-t`,
    );
    const mean = (values: readonly number[]): number =>
      values.reduce((total, value) => total + value, 0) / values.length;
    for (const delta of deltas) {
      const row = rows.get(delta);
      if (row === undefined) continue;
      const effect = mean(row.effects);
      console.log(
        `[resolution] +${String(delta).padEnd(4)} distanceTravelled: effect ${effect.toFixed(5)} s (${((effect / baseMean) * 100).toFixed(3)} % of AWT), mean half-width ${mean(row.halfWidths).toFixed(5)} s, detected ${row.detected}/${seeds.length}`,
      );
    }

    const bottom = rows.get(deltas[0]);
    const top = rows.get(deltas.at(-1) ?? Number.NaN);
    if (bottom === undefined || top === undefined) throw new Error('unreachable');
    expect(top.detected).toBe(seeds.length);
    expect(bottom.detected).toBeLessThan(top.detected);
    /* Every effect on this ladder is small; none of them may be mistaken for the 12 % cripple. */
    expect(Math.abs(mean(top.effects)) / baseMean).toBeLessThan(0.1);
  }, 1_800_000);
});
