/**
 * **The crowd and the machine, seeded apart at the experiment layer** — docs/14 § 1.1.
 *
 * `core` shipped the split in step 1 and `core/src/sim/trafficSeedSeam.test.ts` drives it through
 * `runSimulation`. Nothing in `packages/experiments` could ask for it: `ExperimentSpec` carried
 * one seed, `replicationSeed` derived every replication from it, and `simulationConfigFor` never
 * wrote a `trafficSeed` key. So *"a held-out traffic set that is disjoint by construction"* had no
 * way to be true of an **experiment**, which is what `teaching/` needs it for and is the only
 * reason this seam exists.
 *
 * ## The three-run contrast, which is the whole claim
 *
 * One run-seed change is made twice, and the traffic seed is the only thing that differs between
 * the two attempts:
 *
 * | | change | expected |
 * |---|---|---|
 * | control | run seed A → B, **no** traffic seed | every replication moves — the crowd comes from the run seed |
 * | the split | run seed A → B, traffic seed held | **nothing** moves |
 * | not inert | traffic seed T → U, run seed held | every replication moves |
 *
 * The middle row is meaningless without the first: *"nothing moved"* is also what an inert knob
 * produces, and the control is what separates the two. That is the standing requirement in
 * `docs/05-roadmap.md` applied to a seed rather than to a slider.
 *
 * ## Why the assertions are on metrics and not on `traceDigest`
 *
 * **Found while writing this file, and stated rather than worked around.** `traceDigest` hashes
 * `trace.seed` as its first field, and `trace.seed` is the **master** seed. So two runs of the
 * same crowd against two machines produce two different digests, and the runner's CRN audit trail
 * cannot witness the split it is now possible to ask for. That is correct for what the digest is
 * *for* — every cell of one experiment shares one master seed, so alignment within an experiment
 * is unaffected — and it is wrong as an instrument here. Nothing about the digest is changed by
 * this lane: moving it would move an audit trail to make a new test convenient.
 *
 * The instrument used instead is the per-replication `ttdMeanS` **and** `ConservationAudit.
 * generated` — a mean and a headcount, so a change that moved the timing without moving the
 * population, or the reverse, is visible as itself.
 */

import { describe, expect, it } from 'vitest';

import { toResources } from '../benchmark/weightSetSelection.js';
import { loadResources } from '../validation/harness.js';

import { parseExperimentSpec, planExperiment } from './experiment.js';
import { fingerprintExperiment, runExperiment, trafficSeedFor } from './replicationRunner.js';
import { RunnerError, type ExperimentResources, type ExperimentSpec } from './types.js';

const SEED = 20260731;
const OTHER_SEED = 20261537;
const TRAFFIC_SEED = 900_001;
const OTHER_TRAFFIC_SEED = 900_002;
const REPLICATIONS = 4;

const POINT = Object.freeze({
  id: 'interfloor-mix-1.5pct',
  durationS: 900,
  reportWindow: 'full-run' as const,
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 0.4, outgoing: 0.3, interfloor: 0.3 }),
    entranceWeights: Object.freeze({ G: 1 }),
    arrivalRatePctPop5min: 1.5,
    peakWindowS: 300,
  }),
});

function specOf(seed: number, trafficSeed?: number): ExperimentSpec {
  return {
    id: 'traffic-seed-seam',
    seed,
    ...(trafficSeed === undefined ? {} : { trafficSeed }),
    buildings: ['midtown-office'],
    dispatchers: ['collective'],
    traffic: [POINT],
    replication: {
      minReplications: REPLICATIONS,
      maxReplications: REPLICATIONS,
      checkEvery: REPLICATIONS,
    },
    parallel: { mode: 'serial' as const },
  };
}

let resources: ExperimentResources | undefined;
async function sharedResources(): Promise<ExperimentResources> {
  resources ??= toResources(await loadResources());
  return resources;
}

/** Per-replication `(mean time to destination, passengers generated)`, in index order. */
async function runOf(seed: number, trafficSeed?: number): Promise<readonly (readonly number[])[]> {
  const result = await runExperiment(specOf(seed, trafficSeed), await sharedResources(), {
    keepRecords: false,
  });
  const cell = result.cells[0];
  expect(cell?.replications).toHaveLength(REPLICATIONS);
  return (cell?.replications ?? []).map((record) => [
    record.metrics.ttdMeanS,
    record.conservation.generated,
  ]);
}

describe('a spec may declare a traffic seed, and omitting it changes nothing', () => {
  it('omits the plan key and the result key when the spec omits it', async () => {
    const plan = planExperiment(specOf(SEED), await sharedResources());
    expect(Object.keys(plan)).not.toContain('experimentTrafficSeed');
    expect(trafficSeedFor(plan, 0)).toBeUndefined();

    const result = await runExperiment(specOf(SEED), await sharedResources(), {
      keepRecords: false,
    });
    expect(Object.keys(result)).not.toContain('experimentTrafficSeed');
  });

  it('carries the key, normalized, and derives one traffic seed per replication', async () => {
    const plan = planExperiment(specOf(SEED, TRAFFIC_SEED), await sharedResources());
    expect(plan.experimentTrafficSeed).toBe(BigInt(TRAFFIC_SEED));
    /* Per replication, never once per experiment: a single crowd shared by every replication
       would collapse every demand-side variance to zero while every interval kept printing. */
    expect(trafficSeedFor(plan, 0)).not.toBe(trafficSeedFor(plan, 1));
  });

  it('is byte-identical to no traffic seed when the two seeds are equal', async () => {
    const bare = await runExperiment(specOf(SEED), await sharedResources(), { keepRecords: false });
    const equal = await runExperiment(specOf(SEED, SEED), await sharedResources(), {
      keepRecords: false,
    });
    /* `StreamSet` routes a demand stream to `trafficSeed` when it has one, so a traffic seed equal
       to the master seed selects the values the run already had. The fingerprint carries the
       traffic seed, so the two strings differ by exactly that key and by nothing else. */
    expect(equal.experimentTrafficSeed).toBe(String(SEED));
    expect(fingerprintExperiment({ ...equal, experimentTrafficSeed: undefined })).toBe(
      fingerprintExperiment(bare),
    );
  });
});

describe('the seed that moves decides what moves', () => {
  it('control: with no traffic seed, a run-seed change moves every replication', async () => {
    const [a, b] = await Promise.all([runOf(SEED), runOf(OTHER_SEED)]);
    for (let index = 0; index < REPLICATIONS; index += 1) expect(b[index]).not.toEqual(a[index]);
  });

  it('the split: with the traffic seed held, the same run-seed change moves nothing', async () => {
    const [a, b] = await Promise.all([
      runOf(SEED, TRAFFIC_SEED),
      runOf(OTHER_SEED, TRAFFIC_SEED),
    ]);
    expect(b).toEqual(a);
  });

  it('not inert: with the run seed held, a traffic-seed change moves every replication', async () => {
    const [a, b] = await Promise.all([
      runOf(SEED, TRAFFIC_SEED),
      runOf(SEED, OTHER_TRAFFIC_SEED),
    ]);
    for (let index = 0; index < REPLICATIONS; index += 1) expect(b[index]).not.toEqual(a[index]);
  });
});

describe('parseExperimentSpec admits the field on exactly the terms it admits `seed`', () => {
  it('round-trips a declared traffic seed and omits an undeclared one', () => {
    expect(parseExperimentSpec(specOf(SEED, TRAFFIC_SEED)).trafficSeed).toBe(TRAFFIC_SEED);
    expect(Object.keys(parseExperimentSpec(specOf(SEED)))).not.toContain('trafficSeed');
  });

  it('accepts a decimal string, so 64 bits survive JSON', () => {
    expect(
      parseExperimentSpec({ ...specOf(SEED), trafficSeed: '18446744073709551557' }).trafficSeed,
    ).toBe('18446744073709551557');
  });

  it('refuses a value that is neither a number nor a string, naming the path', () => {
    expect(() => parseExperimentSpec({ ...specOf(SEED), trafficSeed: { base: 1 } })).toThrow(
      /spec\.trafficSeed/,
    );
    expect(() => parseExperimentSpec({ ...specOf(SEED), trafficSeed: null })).toThrow(RunnerError);
  });

  it('defers a non-decimal string to the same place `seed` defers it, and not earlier', async () => {
    /* `seed` accepts any string at parse and is refused by `normalizeExperimentSeed` at plan time.
       The traffic seed does the same thing at the same moment: two seed fields validated at two
       different layers would be two rules to keep in step. */
    const bad = { ...specOf(SEED), trafficSeed: 'tuesday' };
    expect(() => parseExperimentSpec(bad)).not.toThrow();
    const loaded = await sharedResources();
    expect(() => planExperiment(parseExperimentSpec(bad), loaded)).toThrow(RunnerError);
    expect(() =>
      planExperiment(parseExperimentSpec({ ...specOf(SEED), seed: 'tuesday' }), loaded),
    ).toThrow(RunnerError);
  });
});

describe('parallelism cannot move a number, with a traffic seed set either', () => {
  it('agrees between the serial and worker executors', async () => {
    const base = specOf(SEED, TRAFFIC_SEED);
    const serial = await runExperiment(base, await sharedResources(), { keepRecords: false });
    const workers = await runExperiment(
      { ...base, parallel: { mode: 'workers', workers: 2 } },
      await sharedResources(),
      { keepRecords: false },
    );
    expect(fingerprintExperiment(workers)).toBe(fingerprintExperiment(serial));
  });
});
