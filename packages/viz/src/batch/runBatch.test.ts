/**
 * The batch runner, against the buildings this project actually ships.
 *
 * The claim W3 makes is about `data/`, not about a fixture: *"a batch of 50 on Midtown Office
 * returns a paired-t interval on a difference"*. So the real directory is loaded and the real
 * profiles are run, exactly as `record/recordRun.test.ts` and `core`'s own fixtures do.
 *
 * ## The two assertions that carry the lane
 *
 * 1. **Common random numbers hold.** Asserted three ways, because the failure is silent: the two
 *    arms' `PassengerTrace`s are compared with vitest's own deep equality (independent of this
 *    package's comparator), the comparator is given a positive control so it cannot be vacuously
 *    passing, and the seeds are re-derived here from `experiments`' shipped `replicationSeed`.
 * 2. **Suppression propagates.** Garden Apartments at 900 s produces a genuinely mixed batch — a
 *    few replications whose own summary refuses a mean — so the *"partly suppressed"* case is
 *    exercised on real data rather than on a hand-built one, and the estimate rows are asserted
 *    to carry no number while the observation rows are asserted to carry one.
 */

import { loadConfig, type LoadedConfig, type PassengerTrace } from '@elevator-sim/core';
import { metricOf, replicationSeed } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { batchReport } from './report.js';
import { BatchError, firstTraceDisagreement, runBatch } from './runBatch.js';
import { BATCH_METRICS, BATCH_METRIC_CLASS, type BatchRequest, type BatchResources } from './types.js';
import { recordRun } from '../record/recordRun.js';
import { DATA_DIR, requireBuilding, requireDispatcher } from '../fixtures.test-helper.js';

/** The seed every measurement in this file and in `DECISIONS.md` § D158 was taken at. */
const BATCH_SEED = '20260729';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 120_000);

function resourcesFor(buildingId: string): BatchResources {
  return {
    building: requireBuilding(config, buildingId),
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
}

function requestFor(
  buildingId: string,
  replications: number,
  arms: readonly [string, string],
  arrivalRatePctPop5min: number | null = null,
): BatchRequest {
  return {
    buildingId,
    seed: BATCH_SEED,
    durationS: 900,
    replications,
    arms: [
      { armId: 'baseline', dispatcherProfileId: arms[0] },
      { armId: 'candidate', dispatcherProfileId: arms[1] },
    ],
    arrivalRatePctPop5min,
  };
}

describe('common random numbers', () => {
  it('gives both arms the same seed at every replication, from the shipped derivation', () => {
    const result = runBatch(requestFor('garden-apartments', 6, ['collective', 'eta']), resourcesFor('garden-apartments'));
    const [baseline, candidate] = result.arms;
    expect(baseline?.replications).toHaveLength(6);
    for (let i = 0; i < 6; i += 1) {
      const expected = replicationSeed(BATCH_SEED, i).toString();
      expect(baseline?.replications[i]?.seed).toBe(expected);
      expect(candidate?.replications[i]?.seed).toBe(expected);
    }
  }, 60_000);

  it('reports the batch as aligned, having compared one pair per replication', () => {
    const result = runBatch(requestFor('garden-apartments', 6, ['collective', 'eta']), resourcesFor('garden-apartments'));
    expect(result.crn.aligned).toBe(true);
    expect(result.crn.checkedComparisons).toBe(6);
    expect(result.crn.mismatches).toEqual([]);
    // The equivalence class is recorded, and it names the population rather than the dispatcher.
    expect(result.crn.traceKey).toContain('garden-apartments');
    expect(result.crn.traceKey).not.toContain('collective');
  }, 60_000);

  it('the two arms really do see the same passengers — checked outside this module', () => {
    /*
     * The load-bearing assertion of the whole lane, and it deliberately does not use
     * `firstTraceDisagreement`: it rebuilds both arms' runs here, at the seeds the batch would
     * use, and compares the generated populations with vitest's own deep equality. If the
     * package's comparator were wrong, this would still catch a broken pairing.
     */
    const resources = resourcesFor('midtown-office');
    for (let i = 0; i < 3; i += 1) {
      const seed = replicationSeed(BATCH_SEED, i);
      const base = {
        building: resources.building,
        trafficProfiles: resources.trafficProfiles,
        elevatorSpecs: resources.elevatorSpecs,
        durationS: 900,
        onTimeout: 'report',
        seed,
        replication: i,
      } as const;
      const left = recordRun({
        ...base,
        dispatcherProfile: requireDispatcher(config, 'collective'),
      }).result.trace;
      const right = recordRun({
        ...base,
        dispatcherProfile: requireDispatcher(config, 'eta'),
      }).result.trace;

      expect(left.passengerCount).toBeGreaterThan(0);
      expect(right).toEqual(left);
      expect(firstTraceDisagreement(left, right)).toBeNull();
    }
  }, 60_000);

  it('negative control: the comparison can fail, and names the field it failed on', () => {
    // Without this the assertion above could be passing because every trace equals every other
    // trace — the silent mode a "replay verified" test degrades into.
    const resources = resourcesFor('midtown-office');
    const profile = requireDispatcher(config, 'collective');
    const traceAt = (index: number) =>
      recordRun({
        building: resources.building,
        dispatcherProfile: profile,
        trafficProfiles: resources.trafficProfiles,
        elevatorSpecs: resources.elevatorSpecs,
        durationS: 900,
        onTimeout: 'report',
        seed: replicationSeed(BATCH_SEED, index),
      }).result.trace;

    const first = traceAt(0);
    const second = traceAt(1);
    expect(second).not.toEqual(first);
    const detail = firstTraceDisagreement(first, second);
    expect(detail).not.toBeNull();
    expect(detail).toMatch(/^(?:seed|passengerCount|arrivals\.length|passengers)/);
  }, 60_000);

  /*
   * **The control the one above cannot be.** Found by mutation, and it is the false negative T60
   * recorded the shape of: freezing the *per-passenger* half of `firstTraceDisagreement` to
   * `return null` left the whole suite green, because two traces at different seeds differ at the
   * `seed` field and the comparator returns before the passenger loop is ever reached. Every scalar
   * a batch's two arms share by construction, so the per-passenger comparison is the only half that
   * can ever fire in production — and it was the half nothing could fail on.
   *
   * These cases therefore differ from the baseline in **exactly one passenger field**, with every
   * scalar identical, so the loop is the only thing that can catch them.
   */
  it('negative control: a trace differing only inside one passenger is still caught', () => {
    const resources = resourcesFor('midtown-office');
    const trace = recordRun({
      building: resources.building,
      dispatcherProfile: requireDispatcher(config, 'collective'),
      trafficProfiles: resources.trafficProfiles,
      elevatorSpecs: resources.elevatorSpecs,
      durationS: 900,
      onTimeout: 'report',
      seed: replicationSeed(BATCH_SEED, 0),
    }).result.trace;
    expect(trace.passengers.length).toBeGreaterThan(3);

    const withPassenger = (index: number, patch: Record<string, unknown>): PassengerTrace => ({
      ...trace,
      passengers: trace.passengers.map((passenger, at) =>
        at === index ? { ...passenger, ...patch } : passenger,
      ),
    });

    /* One field per case, and one from the leg array, because a leg is where a route lives. */
    const cases: readonly (readonly [string, PassengerTrace])[] = [
      ['arrival time', withPassenger(2, { arrivalTimeS: trace.passengers[2]!.arrivalTimeS + 1 })],
      ['origin floor', withPassenger(1, { originFloorId: 'not-a-floor' })],
      ['mass', withPassenger(3, { massKg: 1 })],
      ['credential', withPassenger(0, { credentialGroup: 'not-a-group' })],
      [
        'leg destination',
        withPassenger(0, {
          legs: trace.passengers[0]!.legs.map((leg, index) =>
            index === 0 ? { ...leg, destinationFloorId: 'not-a-floor' } : leg,
          ),
        }),
      ],
    ];

    for (const [what, mutated] of cases) {
      const detail = firstTraceDisagreement(trace, mutated);
      expect(detail, what).not.toBeNull();
      // Named, and named as a *passenger* — not as a scalar that happened to differ too.
      expect(detail, what).toMatch(/^passengers\[\d+]/);
    }

    /* …and the comparator still says nothing about a trace compared with itself. */
    expect(firstTraceDisagreement(trace, { ...trace })).toBeNull();
  }, 60_000);
});

describe('what a batch records', () => {
  it('never lets a NaN reach the record — an absent measurement is null', () => {
    const result = runBatch(requestFor('vertical-city', 2, ['collective', 'eta']), resourcesFor('vertical-city'));
    for (const arm of result.arms) {
      for (const replication of arm.replications) {
        for (const metric of BATCH_METRICS) {
          const value = replication.metrics[metric];
          expect(value === null || Number.isFinite(value), `${arm.armId}/${metric}`).toBe(true);
        }
      }
    }
  }, 60_000);

  it('records the offered demand off the same projection every other figure comes from', () => {
    /*
     * `offeredPer5Min` is a **field** rather than a `BatchMetric` — every arm sees the same
     * passengers by construction, so a comparison row on it would be a paired difference of a
     * value with itself. It is here because `answer-the-demand` is `personsPer5Min >=
     * offeredPer5Min` and the batch carried only the carried half.
     *
     * Asserted against `experiments`' shipped `metricOf` rather than against a literal, because
     * the claim is *"the same projection"*, and asserted as **equal across arms** because that is
     * the property the field's docstring rests its whole design on.
     */
    const result = runBatch(requestFor('midtown-office', 3, ['collective', 'eta']), resourcesFor('midtown-office'));
    const [baseline, candidate] = result.arms;
    expect(baseline?.replications.length).toBe(3);
    for (const [index, replication] of (baseline?.replications ?? []).entries()) {
      const fresh = recordRun({
        building: requireBuilding(config, 'midtown-office'),
        dispatcherProfile: requireDispatcher(config, 'collective'),
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        durationS: 900,
        onTimeout: 'report',
        seed: BigInt(replication.seed),
        replication: replication.replication,
      }).result.summary;
      expect(replication.offeredPer5Min).toBe(metricOf(fresh, 'offeredPer5Min'));
      expect(replication.offeredPer5Min).not.toBeNull();
      expect(candidate?.replications[index]?.offeredPer5Min).toBe(replication.offeredPer5Min);
    }
  }, 60_000);

  it('copies the run summary’s own verdict rather than recomputing one', () => {
    const resources = resourcesFor('secure-tower');
    const result = runBatch(requestFor('secure-tower', 4, ['collective', 'collective2']), {
      ...resources,
      dispatcherProfilesById: new Map([
        ['collective', requireDispatcher(config, 'collective')],
        ['collective2', requireDispatcher(config, 'collective')],
      ]),
    });
    for (const arm of result.arms) {
      for (const replication of arm.replications) {
        const fresh = recordRun({
          building: resources.building,
          dispatcherProfile: requireDispatcher(config, 'collective'),
          trafficProfiles: resources.trafficProfiles,
          elevatorSpecs: resources.elevatorSpecs,
          durationS: 900,
          onTimeout: 'report',
          seed: BigInt(replication.seed),
          replication: replication.replication,
        }).recording.summary;
        expect(replication.awtIsValid).toBe(fresh.awtIsValid);
        expect(replication.saturated).toBe(fresh.saturated);
        expect(replication.awtInvalidReason).toBe(fresh.awtInvalidReason ?? null);
      }
    }
  }, 60_000);

  it('is deterministic in the request', () => {
    const request = requestFor('garden-apartments', 4, ['collective', 'eta']);
    const first = runBatch(request, resourcesFor('garden-apartments'));
    const second = runBatch(request, resourcesFor('garden-apartments'));
    expect(second.arms).toEqual(first.arms);
  }, 60_000);

  it('reports progress once per arm-replication, monotonically, to the total', () => {
    const seen: number[] = [];
    const result = runBatch(
      requestFor('garden-apartments', 5, ['collective', 'eta']),
      resourcesFor('garden-apartments'),
      {
        onProgress: (progress) => {
          expect(progress.total).toBe(10);
          seen.push(progress.completed);
        },
      },
    );
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.arms[0]?.replications).toHaveLength(5);
  }, 60_000);

  it('measures elapsed time through the injected clock and never a global one', () => {
    let ticks = 0;
    const result = runBatch(
      requestFor('garden-apartments', 2, ['collective', 'eta']),
      resourcesFor('garden-apartments'),
      { clock: { now: () => (ticks += 100) } },
    );
    expect(result.elapsedMs).toBe(100);
  }, 60_000);
});

describe('a request that cannot be run says so', () => {
  const resources = () => resourcesFor('garden-apartments');

  it('refuses an unknown dispatcher by name', () => {
    const request = requestFor('garden-apartments', 2, ['collective', 'no-such-profile']);
    expect(() => runBatch(request, resources())).toThrow(BatchError);
    expect(() => runBatch(request, resources())).toThrow(/no-such-profile/);
  }, 60_000);

  it('refuses two arms with one id, and a non-positive replication count', () => {
    const shared = requestFor('garden-apartments', 2, ['collective', 'eta']);
    expect(() =>
      runBatch({ ...shared, arms: [shared.arms[0]!, shared.arms[0]!] }, resources()),
    ).toThrow(/share an id/);
    expect(() => runBatch({ ...shared, replications: 0 }, resources())).toThrow(/positive whole/);
    expect(() => runBatch({ ...shared, durationS: 0 }, resources())).toThrow(/positive number/);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Suppression, end to end, on real buildings
 * -------------------------------------------------------------------------- */

describe('suppression propagates from the replication to the batch', () => {
  it('Garden Apartments at 50: a mixed batch, and no estimate is averaged over the survivors', () => {
    const result = runBatch(
      requestFor('garden-apartments', 50, ['collective', 'eta']),
      resourcesFor('garden-apartments'),
    );
    const report = batchReport(result);

    /*
     * The premise. This building is not chosen because it fails — it is the healthiest one the
     * project ships — and it *still* refuses a mean on a handful of seeds, which is the point:
     * a partly suppressed batch is the ordinary case, not the edge.
     */
    const baseline = report.arms[0];
    expect(baseline?.n).toBe(50);
    expect(baseline?.quotable).toBeGreaterThan(0);
    expect(baseline?.quotable).toBeLessThan(50);
    expect(baseline?.reasons.length).toBeGreaterThan(0);

    for (const row of report.comparisons[0]?.rows ?? []) {
      if (BATCH_METRIC_CLASS[row.metric] === 'estimate') {
        expect(row.verdict, row.metric).toBe('suppressed');
        expect(row.estimate, row.metric).toBeNull();
        expect(row.pairs, row.metric).toBe(0);
        // R3: what replaced the number is a reason, not a blank, a dash or a zero.
        expect(row.sentence, row.metric).toMatch(/there is no .* to compare/);
        expect(row.note, row.metric).toContain('not averaged');
      } else {
        /*
         * R1: an observation is never *suppressed*, because it is a fact about a run that
         * happened. It may still be **unmeasured**, and on this building it is — which is a real
         * finding rather than a slack assertion. `pctOverLongWait` is a percentage of the rides
         * served *in the reporting window*, and Garden Apartments is the building § 1 R13 measures
         * as quoting an AWT over five legs at one seed and one at another; at some seeds the
         * window has none, so there is no percentage rather than a zero percent. The two states
         * are distinguished, which is exactly what `null`-not-zero is for.
         */
        expect(row.verdict, row.metric).not.toBe('suppressed');
        expect(row.pairs, row.metric).toBe(row.verdict === 'unmeasured' ? 0 : 50);
      }
    }

    /* …and at least one observation really did report, or the clause above is vacuous. */
    const carried = report.comparisons[0]?.rows.find((row) => row.metric === 'personsPer5Min');
    expect(carried?.pairs).toBe(50);
    expect(carried?.estimate?.n).toBe(50);
  }, 120_000);

  it('Midtown Office at 50: shipped demand suppresses every estimate; a lower demand does not', () => {
    /*
     * W3's acceptance clause names this building, and this is the finding that clause did not
     * anticipate — recorded in `DECISIONS.md` § D158. At Midtown's own traffic profile the batch
     * has an observation-based comparison and no estimate-based one at all, on either arm.
     */
    const shipped = batchReport(
      runBatch(requestFor('midtown-office', 50, ['collective', 'eta']), resourcesFor('midtown-office')),
    );
    expect(shipped.arms[0]?.quotable).toBe(0);
    expect(shipped.arms[1]?.quotable).toBe(0);
    expect(shipped.comparisons[0]?.rows.find((row) => row.metric === 'awtS')?.verdict).toBe(
      'suppressed',
    );
    const carried = shipped.comparisons[0]?.rows.find((row) => row.metric === 'personsPer5Min');
    expect(carried?.pairs).toBe(50);
    expect(carried?.estimate).not.toBeNull();

    /* …and the same building at a demand every arm survives does return the paired interval. */
    const quotable = batchReport(
      runBatch(
        requestFor('midtown-office', 50, ['collective', 'eta'], 3),
        resourcesFor('midtown-office'),
      ),
    );
    expect(quotable.arms[0]?.quotable).toBe(50);
    expect(quotable.arms[1]?.quotable).toBe(50);
    const awt = quotable.comparisons[0]?.rows.find((row) => row.metric === 'awtS');
    expect(awt?.verdict).toBe('resolved');
    expect(awt?.pairs).toBe(50);
    expect(awt?.estimate?.method).toBe('t');
    expect(awt?.estimate?.upper).toBeLessThan(0);
    expect(awt?.sentence).toContain('50 runs');
  }, 600_000);

  it('W3 liveness, end to end: a shipped profile against itself is not resolved', () => {
    /*
     * The stated liveness evidence, run through the real simulator rather than a fixture: two arms
     * carrying the same profile see the same passengers *and* make the same decisions, so every
     * paired difference is exactly zero and no row may name a winner.
     */
    const resources = resourcesFor('midtown-office');
    const result = runBatch(requestFor('midtown-office', 50, ['eta', 'eta-again'], 3), {
      ...resources,
      dispatcherProfilesById: new Map([
        ['eta', requireDispatcher(config, 'eta')],
        ['eta-again', requireDispatcher(config, 'eta')],
      ]),
    });
    const report = batchReport(result);
    for (const row of report.comparisons[0]?.rows ?? []) {
      expect(row.verdict, row.metric).not.toBe('resolved');
      if (row.estimate !== null) {
        expect(row.estimate.mean, row.metric).toBe(0);
        expect(row.estimate.n, row.metric).toBe(50);
      }
    }
    expect(
      report.comparisons[0]?.rows.find((row) => row.metric === 'awtS')?.sentence,
    ).toContain('not ordered');
  }, 600_000);
});
