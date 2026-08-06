/**
 * **Where may an interval be quoted at all?** The census that fixed every operating point in
 * `arms.ts`, re-measured rather than trusted.
 *
 * This suite exists because the operating point is the one number in a benchmark that is easiest to
 * choose dishonestly. Pick a rate where the baseline collapses and every arm looks brilliant; pick
 * one where nothing is loaded and every arm looks identical. Neither is a lie you can see in the
 * result table. So the choice is made by a rule that has nothing to do with the answer — *the highest
 * load at which every arm, including the baseline, still returns a valid AWT* — and the rule is
 * re-run here.
 *
 * Two things are asserted, and one is deliberately only *reported*:
 *
 * 1. **At the chosen budget every cell is quotable.** If it were not, the main table would be
 *    reporting `UNQUOTABLE` rows and the criterion could not be argued.
 * 2. **Beyond the recorded ceiling the baseline stops being quotable.** This is what makes the
 *    ceiling a fact rather than a habit, and it is the fact that caps this phase's resolution.
 * 3. The *rate* census — what happens at 2 %, 3 %, 4 % — is printed, not asserted. It is the
 *    evidence for the choice, and pinning it would turn a measurement into a fixture.
 */

import { DEFAULT_MAX_WAIT_HORIZON_S } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import type { TrafficArmSpec } from '../runner/types.js';
import { loadResources, runGateExperiment, withProfiles } from '../validation/harness.js';

import {
  ARM_PROFILES,
  BASELINE_PROFILE,
  BENCHMARK_CASES,
  DESTINATION_CASES,
  destinationCase,
} from './arms.js';
import {
  DEFERRED_ARM,
  DISCLOSURE_BASELINE,
  DISCLOSURE_PROFILE,
  RIDE_TIME_WEIGHTS,
  disclosureProfiles,
  rideArmId,
} from './destinationDisclosure.js';
import { BARE_KIOSK_ARM, accessControlProfiles } from './accessControl.js';
import {
  DECOMPOSITION_ARM,
  LEVEL_0_ARM,
  LEVEL_1_ARM,
  MIXED_USE_BUILDING,
  MIXED_USE_POINTS,
  baselineProfileIds,
  mixedUseProfiles,
} from './mixedUseHighRise.js';
import { BENCHMARK_SEED } from './suite.js';

const ALL_PROFILES = [BASELINE_PROFILE, ...ARM_PROFILES];

/** Long: three buildings, nine arms, up to 1000 replications each. */
const TIMEOUT_MS = 900_000;

describe('Phase 5 — the operating points are the highest at which an interval may be quoted', () => {
  it('has every cell quotable at the chosen budget, on all three cases', async () => {
    const resources = withProfiles(await loadResources(), []);
    for (const spec of BENCHMARK_CASES) {
      const result = await runGateExperiment({
        id: `census/at-budget/${spec.id}`,
        seed: BENCHMARK_SEED,
        building: spec.building,
        dispatchers: ALL_PROFILES,
        traffic: spec.traffic,
        replications: spec.replications,
        resources,
      });
      const invalid = result.cells
        .filter((cell) => !cell.aggregate.awtIsValid)
        .map((cell) => `${cell.dispatcherArmId}: ${cell.aggregate.awtInvalidReason ?? 'invalid'}`);
      console.log(
        `${spec.label} at n = ${spec.replications}: ${invalid.length === 0 ? 'every cell quotable' : `INVALID → ${invalid.join(' | ')}`}`,
      );
      expect(invalid).toEqual([]);
      expect(result.saturated).toBe(false);

      /*
       * **The margin under the abandonment horizon, measured rather than assumed.**
       *
       * `RunSummary.awtIsValid`'s fourth gate (T21) suppresses a mean whose window contains a wait
       * past `DEFAULT_MAX_WAIT_HORIZON_S`. `CLAUDE.md`'s standing objection to any suppression rule
       * is that one which fires everywhere computes nothing, so the gap between the horizon and the
       * worst wait these operating points actually produce is asserted here, at the budget the
       * benchmark uses, rather than argued for in a docstring. The assertion above would already
       * fail if the gate fired; this prints the distance, so a change that halves the margin is
       * visible before it becomes a failure.
       */
      const worst = result.cells.map((cell) => ({
        arm: cell.dispatcherArmId,
        longestS: Math.max(
          ...cell.replications.map((record) => record.summary.serviceLevel.longestWaitS),
        ),
      }));
      const worstOverall = worst.reduce((a, b) => (b.longestS > a.longestS ? b : a));
      console.log(
        `  longest single wait at n = ${spec.replications}: ${worstOverall.longestS.toFixed(1)} s ` +
          `(${worstOverall.arm}), against a ${DEFAULT_MAX_WAIT_HORIZON_S} s abandonment horizon — ` +
          `${(DEFAULT_MAX_WAIT_HORIZON_S / worstOverall.longestS).toFixed(1)}× of margin`,
      );
      for (const cell of result.cells) {
        for (const record of cell.replications) {
          expect(record.summary.serviceLevel.verdict, `${spec.label}: ${cell.dispatcherArmId}`).toBe(
            'served',
          );
        }
      }
      // Not a tautology of the line above: the horizon must sit clear of this operating point by
      // a factor, not by a second. Measured: 4.4× here, 6.6× on Garden, 7.4× on Secure Tower,
      // and 2.6× on Midtown interfloor-mix at n = 1000, which is the tightest of the five.
      expect(worstOverall.longestS).toBeLessThan(DEFAULT_MAX_WAIT_HORIZON_S / 2);
    }
  }, TIMEOUT_MS);

  it('records the baseline saturation ceiling, and that it is the baseline that sets it', async () => {
    const resources = withProfiles(await loadResources(), []);
    for (const spec of BENCHMARK_CASES) {
      const result = await runGateExperiment({
        id: `census/ceiling/${spec.id}`,
        seed: BENCHMARK_SEED,
        building: spec.building,
        dispatchers: ALL_PROFILES,
        traffic: spec.traffic,
        replications: 1000,
        resources,
      });

      const firstInvalidByArm = new Map<string, number>();
      for (const cell of result.cells) {
        const index = cell.replications.findIndex((record) => !record.awtIsValid);
        if (index >= 0) firstInvalidByArm.set(cell.dispatcherArmId, index);
      }
      console.log(
        `${spec.label}: first invalid replication by arm over 1000 — ` +
          (firstInvalidByArm.size === 0
            ? 'none, on any arm'
            : [...firstInvalidByArm].map(([arm, index]) => `${arm}@${index}`).join(', ')),
      );

      // The ceiling recorded in `arms.ts` is exactly the baseline's first invalid replication.
      expect(firstInvalidByArm.get(BASELINE_PROFILE)).toBe(spec.admissibleReplications);
      // …and the budget actually used is under it.
      if (spec.admissibleReplications !== undefined) {
        expect(spec.replications).toBeLessThan(spec.admissibleReplications);
      }
      // Every other arm stays quotable **at the budget the benchmark actually uses**, which is the
      // property the ceiling exists to protect. It used to be the stronger claim — that nothing but
      // the baseline ever loses its AWT anywhere in 1000 replications — and that stopped being true
      // when `zoned-uppeak` started parking: `idle.parkingStrategy: zone-center` disperses the bank
      // instead of leaving every car where it last served somebody, which on Secure Tower's
      // access-zoned up-peak costs enough on one tail replication (index 683 of 1000) to lose its
      // AWT. Well above the 500 the case is measured at, and reported rather than hidden.
      for (const [arm, index] of firstInvalidByArm) {
        if (arm === BASELINE_PROFILE) continue;
        expect(index, `${spec.label}: ${arm} loses its AWT inside the measured budget`)
          .toBeGreaterThanOrEqual(spec.replications);
      }
    }
  }, TIMEOUT_MS);

  it('reports why Midtown Office is measured at 1 % and not higher', async () => {
    const resources = withProfiles(await loadResources(), []);
    const rows: string[] = [];
    for (const rate of [1, 2, 3, 4]) {
      const traffic: TrafficArmSpec = Object.freeze({
        id: `up-peak-${rate}`,
        durationS: 900,
        demand: Object.freeze({
          directionalSplit: Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
          entranceWeights: Object.freeze({ G: 1, P1: 0 }),
          arrivalRatePctPop5min: rate,
          peakWindowS: 300,
        }),
      });
      const result = await runGateExperiment({
        id: `census/rate/${rate}`,
        seed: BENCHMARK_SEED,
        building: 'midtown-office',
        dispatchers: ALL_PROFILES,
        traffic,
        replications: 100,
        resources,
      });
      rows.push(
        `  ${rate} % → ` +
          result.cells
            .map(
              (cell) =>
                `${cell.dispatcherArmId}:${cell.aggregate.saturatedCount}${cell.aggregate.awtIsValid ? '' : '*'}`,
            )
            .join(' '),
      );
    }
    console.log('Midtown Office up-peak, saturated replications of 100 (* = no quotable AWT):');
    for (const row of rows) console.log(row);

    // Asserted, because it is the reason for the choice rather than a by-product of it: at 1 % the
    // baseline is quotable, and at 2 % it is not.
    const [oneRow, twoRow, , fourRow] = [rows[0] ?? '', rows[1] ?? '', rows[2] ?? '', rows[3] ?? ''];
    expect(oneRow).toContain(`${BASELINE_PROFILE}:0 `);
    expect(twoRow).not.toContain(`${BASELINE_PROFILE}:0 `);

    // The finding the census produces that no interval can: at 4 % `predictive-balanced` is the only
    // profile in the library that still does not saturate, while the baseline diverges on 52
    // replications in 100. A ranking on AWT at 1 % load says the opposite about the same profile, and
    // both statements are true — which is why a saturation census belongs in a benchmark and not only
    // in a footnote.
    expect(fourRow).toContain('predictive-balanced:0 ');
    expect(fourRow).toContain(`${BASELINE_PROFILE}:52*`);
    // Every arm but that one. Counted against the profile library rather than hard-coded, so a
    // profile added to `data/` is covered without an edit here.
    expect(fourRow.split(' ').filter((token) => token.endsWith('*')).length).toBe(
      ALL_PROFILES.length - 1,
    );
  }, TIMEOUT_MS);

  it('reports why Garden Apartments is reported over the full run and not the peak 5 minutes', async () => {
    const resources = withProfiles(await loadResources(), []);
    const invalidByRate: [number, number][] = [];
    for (const rate of [1, 2, 4, 6, 8]) {
      const result = await runGateExperiment({
        id: `census/garden-peak/${rate}`,
        seed: BENCHMARK_SEED,
        building: 'garden-apartments',
        dispatchers: [BASELINE_PROFILE],
        traffic: {
          id: `residential-${rate}-peak`,
          durationS: 900,
          demand: { arrivalRatePctPop5min: rate, peakWindowS: 300 },
        },
        replications: 100,
        resources,
      });
      const cell = result.cells[0];
      invalidByRate.push([rate, cell?.aggregate.awtInvalidCount ?? -1]);
    }
    console.log(
      'Garden Apartments, peak-5min window: replications of 100 with no valid AWT, by rate — ' +
        invalidByRate.map(([rate, count]) => `${rate} %: ${count}`).join(', '),
    );
    // The peak window is unusable at the sparse rates where parking policy dominates. That is the
    // whole justification for `reportWindow: 'full-run'` on this case.
    expect(invalidByRate[1]?.[1]).toBeGreaterThan(0);
  }, TIMEOUT_MS);
});

/* -------------------------------------------------------------------------- *
 * Phase 6a — the census OQ-5 says may not be inherited
 * -------------------------------------------------------------------------- */

/**
 * **OQ-5: does any arm saturate at the interfloor-mix operating points?**
 *
 * docs/09 § 2.5 is explicit that `arms.ts`'s recorded ceilings — `nearest-car` first losing its AWT
 * at replication 287 on Midtown up-peak and 190 on Secure Tower up-peak — are *for up-peak with
 * `nearest-car`* and **may not be reused**, and that the whole Phase 6 budget depends on the answer.
 * So it is re-measured here, at the new points, over the same 1000 replications, for every arm the
 * Phase 6a studies actually run.
 *
 * The two answers could hardly be more different from each other, and neither is Phase 5's:
 *
 * - **Midtown interfloor-mix: nothing saturates, at all, in 1000 replications** — not even
 *   `nearest-car`, which is the binding constraint on two of Phase 5's three cases. The 1800 s
 *   full-run window at 1.5 % of population per 5 minutes is a *pattern* rather than a peak, and the
 *   lobby plateau that breaks `nearest-car` at up-peak never forms. So `n` is a choice and the study
 *   derives it from its own measured spread instead of from a ceiling.
 * - **Secure Tower interfloor-mix: the bare kiosk is invalid from replication index 0 and every
 *   other arm from index 3**, and no budget changes either. `admissibleReplications: 0` therefore
 *   survives, and its *reason* has been rewritten twice.
 *
 * ## What this row used to say, and why it is worth two paragraphs
 *
 * It said *"both conventional arms are invalid from replication index 0 … that is H-ACCESS-1 in the
 * census rather than in the study"*. Both clauses were the § D254 defect: `estimateCost` asked the
 * access question about a hall call's **pickup** floor, so every landing call raised inside an
 * access zone went unassignable and the conventional arms had no AWT from the first draw.
 *
 * `DECISIONS.md` § D261 corrected it to *"nearest-car, eta, collective and every credentialled arm
 * are clean across the whole census"* — measured, at the time, and **now false as well**. § D265
 * gave a declared share of journeys the badge their own floor implies rather than the one their
 * destination needs, and on this building that turns away 4.1 % of arrivals. Re-censused over 300
 * replications on 2026-08-06 (§ D279), the first invalid replication is **3 on every arm**:
 * `nearest-car`, `eta`, `destination-eta` and all five `rideTime` arms and `eta-deferred` alike.
 *
 * **Failing at the same index on every arm is the finding, and it is why the assertion below is
 * written as an equality across arms rather than as a bound per arm.** Under common random numbers
 * the riders § D265 turns away are the same people in every cell, so a ground that lands on all
 * eight arms at the identical draw is a property of the traffic and not of any dispatcher. The
 * ground is **censoring** — a handful of unserved riders in a 50-to-75-person reporting window,
 * over the 5 % limit — where the kiosk's is **saturation**. The kiosk still binds
 * `admissibleReplications`, and still for § D261's reason: it discloses a destination and carries
 * no credential, so an access-restricted destination is refused by every car.
 */
describe('Phase 6a — the interfloor-mix operating points, censused rather than inherited', () => {
  async function destinationResources() {
    const config = await loadResources();
    const baseline = config.dispatcherProfilesById.get(DISCLOSURE_BASELINE);
    const destination = config.dispatcherProfilesById.get(DISCLOSURE_PROFILE);
    if (baseline === undefined || destination === undefined) {
      throw new Error('data/dispatcher-profiles.json must ship eta and destination-eta');
    }
    return withProfiles(config, [
      ...disclosureProfiles(baseline, destination),
      ...accessControlProfiles(baseline, destination),
    ]);
  }

  /** Every arm either Phase 6a study puts on a building, plus `nearest-car` for the comparison. */
  const DESTINATION_ARMS = [
    BASELINE_PROFILE,
    DISCLOSURE_BASELINE,
    DISCLOSURE_PROFILE,
    ...RIDE_TIME_WEIGHTS.map((weight) => rideArmId(weight)),
    DEFERRED_ARM,
    BARE_KIOSK_ARM,
  ];

  it('finds no ceiling at all on Midtown interfloor-mix, over 1000 replications', async () => {
    const spec = destinationCase('midtown-interfloor-mix');
    const result = await runGateExperiment({
      id: `census/destination/${spec.id}`,
      seed: BENCHMARK_SEED,
      building: spec.building,
      dispatchers: DESTINATION_ARMS,
      traffic: spec.traffic,
      replications: 1000,
      resources: await destinationResources(),
    });

    const firstInvalidByArm = new Map<string, number>();
    for (const cell of result.cells) {
      const index = cell.replications.findIndex((record) => !record.awtIsValid);
      if (index >= 0) firstInvalidByArm.set(cell.dispatcherArmId, index);
    }
    console.log(
      `${spec.label}: first invalid replication by arm over 1000 — ` +
        (firstInvalidByArm.size === 0
          ? 'none, on any arm — including nearest-car'
          : [...firstInvalidByArm].map(([arm, index]) => `${arm}@${index}`).join(', ')),
    );

    // The recorded ceiling and the measurement agree, and the measurement is the stronger claim:
    // `undefined` here means *nothing in 1000*, which is what makes the study's `n` a choice.
    expect([...firstInvalidByArm.keys()]).toEqual([]);
    expect(spec.admissibleReplications).toBeUndefined();
    expect(result.saturated).toBe(false);
    // Phase 5's ceilings are not reused, and this is the assertion that says so: `nearest-car`
    // diverges at 287 on Midtown up-peak and never here, on the same building.
    expect(firstInvalidByArm.get(BASELINE_PROFILE)).toBeUndefined();

    // The margin under the abandonment horizon, on the point with the longest tail of the five
    // shipped ones, at the largest budget any of them is censused at. See the same block in
    // `at-budget` above for why this is asserted rather than argued.
    const worst = result.cells
      .map((cell) => ({
        arm: cell.dispatcherArmId,
        longestS: Math.max(
          ...cell.replications.map((record) => record.summary.serviceLevel.longestWaitS),
        ),
      }))
      .reduce((a, b) => (b.longestS > a.longestS ? b : a));
    console.log(
      `  longest single wait over 1000 replications: ${worst.longestS.toFixed(1)} s (${worst.arm}), ` +
        `against a ${DEFAULT_MAX_WAIT_HORIZON_S} s abandonment horizon`,
    );
    expect(worst.longestS).toBeLessThan(DEFAULT_MAX_WAIT_HORIZON_S / 2);
  }, TIMEOUT_MS);

  it('finds the bare kiosk invalid from replication zero, and every other arm together at three', async () => {
    const spec = destinationCase('secure-interfloor-mix');
    const result = await runGateExperiment({
      id: `census/destination/${spec.id}`,
      seed: BENCHMARK_SEED,
      building: spec.building,
      dispatchers: DESTINATION_ARMS,
      traffic: spec.traffic,
      replications: 300,
      resources: await destinationResources(),
    });

    const firstInvalidByArm = new Map<string, number>();
    for (const cell of result.cells) {
      const index = cell.replications.findIndex((record) => !record.awtIsValid);
      if (index >= 0) firstInvalidByArm.set(cell.dispatcherArmId, index);
    }
    console.log(
      `${spec.label}: first invalid replication by arm over 300 — ` +
        [...firstInvalidByArm].map(([arm, index]) => `${arm}@${index}`).join(', '),
    );

    // The bare kiosk alone fails from the first replication, and it fails structurally:
    // `destination-entry` forwards the destination while dropping the credential, so an
    // access-restricted destination is refused by every car and the queue diverges.
    expect(
      firstInvalidByArm.get(BARE_KIOSK_ARM),
      `${BARE_KIOSK_ARM} should be invalid from the first replication`,
    ).toBe(0);

    /*
     * **Every other arm loses its AWT at the same index, and the equality is the assertion.**
     *
     * A per-arm bound (`each is invalid somewhere before 300`) would be satisfied by eight arms
     * failing at eight different draws, which is what a dispatch effect looks like. What is
     * measured is one draw for all of them — the § D265 credential gap crossing the censoring
     * limit on the same replication in every cell, because common random numbers give every arm
     * the same turned-away riders. So the arms are compared against **each other** rather than
     * against a constant, and the shared index is printed rather than hard-coded, so a change that
     * moved it stays green while a change that split the arms apart goes red.
     */
    const censoredArms = [
      BASELINE_PROFILE,
      DISCLOSURE_BASELINE,
      DISCLOSURE_PROFILE,
      ...RIDE_TIME_WEIGHTS.map((weight) => rideArmId(weight)),
      DEFERRED_ARM,
    ];
    const shared = firstInvalidByArm.get(DISCLOSURE_BASELINE);
    expect(shared, `${DISCLOSURE_BASELINE} no longer loses its AWT anywhere in 300`).toBeGreaterThan(
      0,
    );
    for (const armId of censoredArms) {
      expect(firstInvalidByArm.get(armId), `${armId} diverged from the shared ceiling`).toBe(shared);
    }
    // …and it is the kiosk that binds, strictly earlier than the rest. Without this the block above
    // would still pass if the kiosk had drifted up to join them.
    expect(firstInvalidByArm.get(BARE_KIOSK_ARM) ?? Number.NaN).toBeLessThan(shared as number);

    // Which is what `admissibleReplications: 0` records: no budget makes this case's arm list
    // uniformly quotable, so it has counts rather than an interval table. The number survives both
    // rewrites of its reason — DECISIONS.md § D261, then § D279.
    expect(spec.admissibleReplications).toBe(0);
    console.log(
      `  ${BARE_KIOSK_ARM} binds at 0; the other ${String(censoredArms.length)} arms share ` +
        `index ${String(shared)}`,
    );
  }, TIMEOUT_MS);

  it('covers every case Phase 6a declares', async () => {
    expect(DESTINATION_CASES.map((spec) => spec.id)).toEqual([
      'midtown-interfloor-mix',
      'secure-interfloor-mix',
    ]);
    // And the Phase 5 cases are untouched by this phase: a fourth case added to `BENCHMARK_CASES`
    // would silently change what the Phase 5 criterion was argued on.
    expect(BENCHMARK_CASES.map((spec) => spec.id)).toEqual([
      'midtown-up-peak',
      'garden-residential',
      'secure-up-peak',
    ]);
  });
});

/* -------------------------------------------------------------------------- *
 * Phase 6 on the building its criterion names — DECISIONS.md § D99
 * -------------------------------------------------------------------------- */

/**
 * **The Mixed-Use High-Rise ceilings, censused here rather than inherited from anywhere.**
 *
 * § D99 puts back the building clause D27 dropped, and the first thing that needs is an operating
 * point. `arms.ts`'s ceilings do not transfer — `nearest-car` first loses its AWT at replication 287
 * on Midtown up-peak and 190 on Secure Tower up-peak, and neither number applies to any row below.
 * Reusing another study's ceiling is a mistake this project has made and corrected once already
 * (contract OQ-5), so every number `mixedUseHighRise.ts` spends is measured here.
 *
 * **The rate that is excluded is excluded by its ceiling and not by its answer.** At 3 % of
 * population per 5 minutes the destination arm's gain over `eta` is *larger* than at 2 % — it would
 * have been the flattering choice — and `nearest-car` loses its AWT on replication 22, so no budget
 * in this project's 50–200 band can be spent there with the naive baseline in the cell. That is
 * asserted below rather than mentioned, because "we dropped the rate that did not suit us" and "we
 * dropped the rate whose baseline saturates" look identical in a results table.
 */
describe('Phase 6 — the Mixed-Use High-Rise operating points, censused rather than inherited', () => {
  async function mixedUseResources() {
    const config = await loadResources();
    const destination = config.dispatcherProfilesById.get(DISCLOSURE_PROFILE);
    if (destination === undefined) {
      throw new Error('data/dispatcher-profiles.json must ship destination-eta');
    }
    return {
      resources: withProfiles(config, [...mixedUseProfiles(destination)]),
      baselines: baselineProfileIds(config.dispatcherProfilesById),
    };
  }

  /** Every arm the study puts on this building. */
  function mixedUseArms(baselines: readonly string[]): readonly string[] {
    return [...baselines, DECOMPOSITION_ARM, LEVEL_0_ARM, LEVEL_1_ARM];
  }

  /** `arm → index of its first invalid replication`, absent when it never lost its AWT. */
  async function firstInvalid(
    rate: number,
    replications: number,
  ): Promise<ReadonlyMap<string, number>> {
    const { resources, baselines } = await mixedUseResources();
    const traffic: TrafficArmSpec = {
      id: `up-peak-${String(rate)}pct`,
      durationS: 900,
      demand: {
        directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
        arrivalRatePctPop5min: rate,
        peakWindowS: 300,
      },
    };
    const result = await runGateExperiment({
      id: `census/mixed-use/up-peak-${String(rate)}`,
      seed: BENCHMARK_SEED,
      building: MIXED_USE_BUILDING,
      dispatchers: [...mixedUseArms(baselines)],
      traffic,
      replications,
      resources,
    });
    const found = new Map<string, number>();
    for (const cell of result.cells) {
      const index = cell.replications.findIndex((record) => !record.awtIsValid);
      if (index >= 0) found.set(cell.dispatcherArmId, index);
    }
    console.log(
      `[census] mixed-use up-peak ${String(rate)} %, n = ${String(replications)}: ` +
        (found.size === 0
          ? 'no arm lost its AWT'
          : [...found]
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([arm, index]) => `${arm}@${String(index)}`)
              .join(', ')),
    );
    return found;
  }

  it('finds no ceiling at all at 1 %, over 1000 replications', async () => {
    const found = await firstInvalid(1, 1000);
    expect(
      [...found.keys()],
      'an arm lost its AWT at 1 % of population per 5 minutes. MIXED_USE_POINTS records the ' +
        'ceiling there as undefined — "none in 1000" — and a budget is chosen against it.',
    ).toEqual([]);
    const point = MIXED_USE_POINTS.find((entry) => entry.id === 'up-peak-1pct');
    expect(point?.ceiling).toBeUndefined();
  }, TIMEOUT_MS);

  it('finds the naive baseline setting the ceiling at 2 %, above the budget spent there', async () => {
    const point = MIXED_USE_POINTS.find((entry) => entry.id === 'up-peak-2pct');
    expect(point).toBeDefined();
    if (point === undefined) return;

    const found = await firstInvalid(2, 400);
    // It is `nearest-car` that sets it, which is the handoff's § 4 observation about this profile
    // holding on a second building: it is the only arm that saturates anywhere here.
    expect(found.get(BASELINE_PROFILE)).toBeDefined();
    expect([...found.keys()]).toEqual([BASELINE_PROFILE]);
    // The recorded ceiling is the measured one, and the budget sits under it.
    expect(found.get(BASELINE_PROFILE)).toBe(point.ceiling);
    expect(point.replications).toBeLessThan(point.ceiling as number);
  }, TIMEOUT_MS);

  it('excludes 3 % because its ceiling is 22, not because of what it measures', async () => {
    const found = await firstInvalid(3, 100);
    const ceiling = found.get(BASELINE_PROFILE);
    expect(
      ceiling,
      'nearest-car no longer loses its AWT early at 3 %. That was the whole reason the rate is not ' +
        'an operating point; if it has changed, 3 % should be reconsidered on its merits.',
    ).toBeDefined();
    expect(ceiling as number).toBeLessThan(50);
    // Non-vacuity: 3 % is excluded, so no point may be budgeted at it.
    expect(MIXED_USE_POINTS.map((entry) => entry.traffic.id)).not.toContain('up-peak-3pct');
  }, TIMEOUT_MS);

  it('finds the panel setting the ceiling at 4 %, above the budget spent there', async () => {
    const point = MIXED_USE_POINTS.find((entry) => entry.id === 'up-peak-4pct');
    expect(point).toBeDefined();
    if (point === undefined) return;

    const found = await firstInvalid(4, 210);
    // At the heavy point it is the *panel* that binds, not the naive baseline — the write-once
    // promise under a filling car, which is the same mechanism the 4 % result reports.
    const earliest = Math.min(...[...found.values()]);
    expect(found.get(LEVEL_1_ARM)).toBe(point.ceiling);
    expect(earliest).toBe(point.ceiling);
    expect(point.replications).toBeLessThan(point.ceiling as number);
  }, TIMEOUT_MS);

  it('covers every point Phase 6 declares on this building', () => {
    expect(MIXED_USE_POINTS.map((entry) => entry.id)).toEqual([
      'up-peak-1pct',
      'up-peak-2pct',
      'up-peak-4pct',
    ]);
    // Exactly one point is declared blind, and it is the lightest. A study whose every point was
    // declared blind would pass the blindness check by never claiming anything.
    expect(MIXED_USE_POINTS.filter((entry) => entry.blind).map((entry) => entry.id)).toEqual([
      'up-peak-1pct',
    ]);
  });
});
