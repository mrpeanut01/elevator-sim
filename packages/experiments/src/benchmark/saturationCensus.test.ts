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
 * - **Secure Tower interfloor-mix: both conventional arms are invalid from replication index 0**,
 *   and no budget changes it. That is H-ACCESS-1 in the census rather than in the study, and it is
 *   the reason `DESTINATION_CASES` records `admissibleReplications: 0` for that row: there is no
 *   budget at which every arm has a quotable AWT, so the case has no interval table and its result
 *   is reported as counts.
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
  }, TIMEOUT_MS);

  it('finds the conventional arms invalid from replication zero on Secure Tower interfloor-mix', async () => {
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

    // The three arms with no credential fail immediately and structurally: an access-restricted
    // pickup carries no credential under `up-down-buttons`, and `destination-entry` forwards the
    // destination while dropping the credential, so both are refused by every car.
    for (const armId of [BASELINE_PROFILE, DISCLOSURE_BASELINE, BARE_KIOSK_ARM]) {
      expect(firstInvalidByArm.get(armId), `${armId} should be invalid from the first replication`).toBe(
        0,
      );
    }
    // Every credentialled arm is clean over the whole census.
    for (const armId of [DISCLOSURE_PROFILE, ...RIDE_TIME_WEIGHTS.map((w) => rideArmId(w))]) {
      expect(firstInvalidByArm.get(armId), `${armId} lost its AWT`).toBeUndefined();
    }
    // Which is exactly what `admissibleReplications: 0` records: no budget makes this case's arm
    // list uniformly quotable, so it has counts rather than an interval table.
    expect(spec.admissibleReplications).toBe(0);
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
