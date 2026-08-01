import { beforeAll, describe, expect, it } from 'vitest';

import { Simulation } from '@elevator-sim/core';
import type {
  GeneratedPassenger,
  LoadedConfig,
  PassengerTrace,
  SimulationDemandOptions,
} from '@elevator-sim/core';

import {
  assertCrnAligned,
  canonicalJson,
  crnCohortsOf,
  normalizeExperimentSeed,
  replicationSeed,
  replicationSeeds,
  traceKeyOf,
  verifyCrnAlignment,
} from './crn.js';
import { planExperiment } from './experiment.js';
import { GARDEN_HEALTHY, MIDTOWN_UP_PEAK, loadResources, specOf } from './fixtures.test-helper.js';
import { simulationConfigFor, traceDigest } from './replication.js';
import { runExperiment } from './replicationRunner.js';
import type { CellResult, ExperimentCell, ReplicationRecord } from './types.js';
import { RunnerError } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadResources();
}, 60_000);

/* -------------------------------------------------------------------------- *
 * Seed derivation
 * -------------------------------------------------------------------------- */

describe('replicationSeed', () => {
  /**
   * COMPATIBILITY LOCK.
   *
   * These are the seeds every stored run record in this project is addressed by. The mapping is
   * `deriveStreamSeed(experimentSeed, 'replication:' + i).initState`, and core pins golden vectors
   * for `deriveStreamSeed` itself; this pins the runner's use of it. Any edit that moves these
   * numbers invalidates the reproducibility of every persisted experiment and is a versioned data
   * break, not a refactor.
   */
  it('is pinned to golden vectors', () => {
    expect(replicationSeed(0, 0)).toBe(11_777_367_069_203_533_313n);
    expect(replicationSeed(0, 1)).toBe(7_861_853_957_516_101_869n);
    expect(replicationSeed(0, 7)).toBe(195_836_387_200_301_326n);
    expect(replicationSeed(1, 0)).toBe(17_001_417_621_336_880_981n);
    expect(replicationSeed(20_260_726, 0)).toBe(17_015_323_115_843_402_779n);
    expect(replicationSeed(20_260_726, 1)).toBe(2_079_075_001_935_724_218n);
    expect(replicationSeed(20_260_726, 3)).toBe(5_354_814_411_817_056_826n);
  });

  it('accepts a 64-bit seed as a decimal string, so a spec survives JSON', () => {
    expect(replicationSeed('18446744073709551615', 0)).toBe(16_827_680_331_992_190_915n);
    expect(replicationSeed('20260726', 5)).toBe(replicationSeed(20_260_726, 5));
    expect(normalizeExperimentSeed('-1')).toBe(18_446_744_073_709_551_615n);
  });

  it('rejects a seed that is not a decimal integer', () => {
    expect(() => normalizeExperimentSeed('1e9')).toThrow(RunnerError);
    expect(() => normalizeExperimentSeed('abc')).toThrow(/decimal integer/);
  });

  it('rejects a negative or fractional replication index', () => {
    expect(() => replicationSeed(1, -1)).toThrow(RunnerError);
    expect(() => replicationSeed(1, 1.5)).toThrow(/non-negative safe integer/);
  });

  it('produces distinct seeds across a large batch', () => {
    const seeds = replicationSeeds(20_260_726, 500);
    expect(seeds).toHaveLength(500);
    expect(new Set(seeds).size).toBe(500);
  });

  it('is a function of (experimentSeed, replication) and nothing else', () => {
    // The enforcement is structural — there is no third parameter to pass a dispatcher through —
    // so what is checkable is that two experiments differing only in seed do not overlap.
    const a = replicationSeeds(1, 32);
    const b = replicationSeeds(2, 32);
    expect(new Set([...a, ...b]).size).toBe(64);
  });
});

/* -------------------------------------------------------------------------- *
 * Canonical form
 * -------------------------------------------------------------------------- */

describe('canonicalJson', () => {
  it('is insensitive to key order and drops undefined, as JSON does', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it('renders a bigint rather than throwing, because seeds are bigints', () => {
    expect(canonicalJson({ seed: 12n })).toBe('{"seed":"12"}');
  });

  it('sorts nested keys and preserves array order', () => {
    expect(canonicalJson([{ z: 1, a: [3, 1, 2] }])).toBe('[{"a":[3,1,2],"z":1}]');
  });
});

/* -------------------------------------------------------------------------- *
 * The equivalence class
 * -------------------------------------------------------------------------- */

describe('traceKeyOf', () => {
  it('ignores the dispatcher and everything else the trace generator cannot see', () => {
    const plan = planExperiment(
      specOf({
        id: 'trace-key',
        buildings: ['midtown-office'],
        dispatchers: [
          'collective',
          'nearest-car',
          { id: 'crippled', profile: 'collective', options: { weights: { waitTime: 0 } } },
        ],
        traffic: [MIDTOWN_UP_PEAK],
      }),
      config,
    );
    const keys = new Set(plan.cells.map((cell) => cell.traceKey));
    expect(plan.cells).toHaveLength(3);
    expect(keys.size).toBe(1);
    expect(plan.cohorts).toHaveLength(1);
    expect(plan.cohorts[0]?.cellIds).toHaveLength(3);
  });

  it('separates cells whose demand differs', () => {
    const plan = planExperiment(
      specOf({
        id: 'two-arms',
        dispatchers: ['collective', 'nearest-car'],
        traffic: [GARDEN_HEALTHY, { id: 'quiet', durationS: 900, demand: { arrivalRatePctPop5min: 5 } }],
      }),
      config,
    );
    expect(new Set(plan.cells.map((cell) => cell.traceKey)).size).toBe(2);
    expect(plan.cohorts).toHaveLength(2);
    for (const cohort of plan.cohorts) expect(cohort.cellIds).toHaveLength(2);
  });

  it('separates cells whose building differs', () => {
    const plan = planExperiment(
      specOf({
        id: 'two-buildings',
        buildings: ['garden-apartments', 'midtown-office'],
        traffic: [{ id: 'shared', durationS: 900, demand: { arrivalRatePctPop5min: 5 } }],
      }),
      config,
    );
    expect(new Set(plan.cells.map((cell) => cell.traceKey)).size).toBe(2);
  });

  it('is stable against an incidental key ordering in the demand options', () => {
    const [a] = planExperiment(
      specOf({
        id: 'a',
        traffic: [{ id: 't', demand: { arrivalRatePctPop5min: 5, peakWindowS: 300 } }],
      }),
      config,
    ).cells;
    const [b] = planExperiment(
      specOf({
        id: 'b',
        traffic: [{ id: 't', demand: { peakWindowS: 300, arrivalRatePctPop5min: 5 } }],
      }),
      config,
    ).cells;
    expect(a?.traceKey).toBe(b?.traceKey);
  });

  /**
   * **Every field of the demand surface separates a cohort, and the list is derived from the type.**
   *
   * `traceKeyOf` is a hand-written mirror of core's `traceConfigFor`, and a field missing from it
   * does not fail — it *merges two cohorts*. Two cells running different populations are then
   * declared trace-equivalent, handed the same seeds, and paired. That is arithmetic across
   * unrelated populations, which is the one thing this module exists to prevent.
   *
   * Found by adversarial review of wave 13's T3: the two docs/14 §§ 2.1-2.2 knobs were omitted, and
   * so was `mixAmplitude` — the flat-mix negative control § D162 condition 5 requires, which would
   * have been cohorted *with the treatment it is the control for*. No shipped experiment sets it,
   * so this is a cohort that could have merged rather than one that did.
   *
   * `satisfies Record<keyof SimulationDemandOptions, ...>` is what stops the next one: a field
   * added to the demand surface without a row here fails to compile. `verifyCrnAlignment` compares
   * `traceDigest` and would surface a mis-merged cohort after the fact, but a detector that reports
   * a broken experiment once it has run is not a substitute for a key that does not merge it.
   */
  it('separates a cohort on every field the demand surface declares', () => {
    const VARIANTS = {
      demandLevel: { demandLevel: 'max' },
      arrivalRatePctPop5min: { arrivalRatePctPop5min: 9 },
      directionalSplit: { directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 } },
      batchSharesDestination: { batchSharesDestination: true },
      entranceWeights: { entranceWeights: { G: 1 } },
      interfloorWeighting: { interfloorWeighting: 'uniform' },
      credentialAssignment: { credentialAssignment: 'none' },
      maxLegs: { maxLegs: 4 },
      peakWindowS: { peakWindowS: 420 },
      baselineFraction: { baselineFraction: 0.25 },
      mixAmplitude: { mixAmplitude: 0.5 },
      batchSize: { batchSize: { distribution: 'explicit', weights: [0, 0, 0, 1] } },
      passengerMass: {
        passengerMass: {
          distribution: 'lognormal',
          meanKg: 110,
          stdDevKg: 15,
          minKg: 40,
          maxKg: 200,
        },
      },
    } as const satisfies Record<keyof SimulationDemandOptions, SimulationDemandOptions>;

    const keyFor = (demand: SimulationDemandOptions | undefined): string | undefined =>
      planExperiment(
        specOf({
          id: 'per-field',
          traffic: [{ id: 't', ...(demand === undefined ? {} : { demand }) }],
        }),
        config,
      ).cells[0]?.traceKey;

    const bare = keyFor(undefined);
    expect(bare).toBeDefined();
    for (const [field, demand] of Object.entries(VARIANTS)) {
      expect(
        keyFor(demand as SimulationDemandOptions),
        `demand.${field} must change the CRN key; cells that differ in it are not paired`,
      ).not.toBe(bare);
    }
    // And every variant is distinct from every other, so no two fields collapse onto one key.
    const keys = Object.values(VARIANTS).map((d) => keyFor(d as SimulationDemandOptions));
    expect(new Set(keys).size).toBe(Object.keys(VARIANTS).length);
  });

  it('does not react to run-loop mechanics', () => {
    const base = specOf({ id: 'mechanics' });
    const plain = planExperiment(base, config).cells[0];
    const tweaked = planExperiment(
      { ...base, simulation: { drainGraceS: 1200, transferWalkS: 25, doorObstructionProbability: 0 } },
      config,
    ).cells[0];
    expect(traceKeyOf(plain!.simulation)).toBe(traceKeyOf(tweaked!.simulation));
  });
});

describe('crnCohortsOf', () => {
  it('preserves plan order and reports the shared building and traffic arm', () => {
    const cells: ExperimentCell[] = [
      { ...stubCell('b|t|x'), traceKey: 'K1' },
      { ...stubCell('b|t|y'), traceKey: 'K1' },
      { ...stubCell('b|u|x'), traceKey: 'K2' },
    ];
    const cohorts = crnCohortsOf(cells);
    expect(cohorts.map((cohort) => cohort.traceKey)).toEqual(['K1', 'K2']);
    expect(cohorts[0]?.cellIds).toEqual(['b|t|x', 'b|t|y']);
  });
});

function stubCell(cellId: string): ExperimentCell {
  return {
    cellId,
    index: 0,
    buildingId: 'b',
    trafficArmId: cellId.split('|')[1] ?? 't',
    dispatcherArmId: 'x',
    dispatcherProfileId: 'x',
    traceKey: 'K',
    // The cohort grouping never touches the payload; a cast keeps the stub honest about that.
    simulation: undefined as unknown as ExperimentCell['simulation'],
  };
}

/* -------------------------------------------------------------------------- *
 * THE CRN PROOF
 * -------------------------------------------------------------------------- */

/**
 * The claim in docs/03-traffic-and-statistics.md § Part 4, checked directly rather than through a
 * digest: at replication `i`, two *different dispatchers* are handed the same passengers.
 *
 * `Simulation` is constructed but not run, because that is exactly the window the property lives
 * in — core generates the whole trace in the constructor, before a car moves, and exposes it as
 * `.trace`. If seeding ever picked up a dependency on the dispatcher, this comparison would fail
 * while every summary statistic still looked plausible.
 */
describe('common random numbers, proved on the traces themselves', () => {
  const REPLICATIONS = 6;

  it('gives two dispatchers byte-identical passenger populations at every replication', () => {
    const plan = planExperiment(
      specOf({
        id: 'crn-proof',
        buildings: ['midtown-office'],
        dispatchers: ['collective', 'nearest-car'],
        traffic: [MIDTOWN_UP_PEAK],
      }),
      config,
    );
    const [collective, nearestCar] = plan.cells;
    expect(collective?.dispatcherProfileId).toBe('collective');
    expect(nearestCar?.dispatcherProfileId).toBe('nearest-car');

    let seenPassengers = 0;
    for (let replication = 0; replication < REPLICATIONS; replication += 1) {
      const seed = replicationSeed(plan.experimentSeed, replication);
      const left = new Simulation(simulationConfigFor(plan.experimentId, collective!, replication, seed));
      const right = new Simulation(simulationConfigFor(plan.experimentId, nearestCar!, replication, seed));

      // Byte-identical, not merely equivalent: JSON.stringify pins key order too.
      expect(JSON.stringify(left.trace)).toBe(JSON.stringify(right.trace));
      expect(traceDigest(left.trace)).toBe(traceDigest(right.trace));
      expect(left.trace.seed).toBe(seed.toString());
      expect(left.trace.passengerCount).toBeGreaterThan(0);
      seenPassengers += left.trace.passengerCount;

      // ...and field by field, so the assertion does not rest on one serializer.
      const a = left.trace.passengers;
      const b = right.trace.passengers;
      expect(a).toHaveLength(b.length);
      for (const [index, passenger] of a.entries()) expectSamePassenger(passenger, b[index]!);
    }
    expect(seenPassengers).toBeGreaterThan(REPLICATIONS * 10);
  }, 60_000);

  it('gives *different* populations at different replication indices', () => {
    // The other half of the claim: CRN pairs across arms, it does not collapse replications into
    // one another. A "reduction in variance" produced by running the same trace fifty times would
    // be an artefact, not a variance reduction.
    const plan = planExperiment(specOf({ id: 'crn-distinct', traffic: [GARDEN_HEALTHY] }), config);
    const cell = plan.cells[0]!;
    const digests = new Set<string>();
    for (let replication = 0; replication < REPLICATIONS; replication += 1) {
      const seed = replicationSeed(plan.experimentSeed, replication);
      digests.add(
        traceDigest(new Simulation(simulationConfigFor(plan.experimentId, cell, replication, seed)).trace),
      );
    }
    expect(digests.size).toBe(REPLICATIONS);
  }, 60_000);

  it('reproduces a replication from its stored seed alone', () => {
    const plan = planExperiment(specOf({ id: 'crn-replay', traffic: [GARDEN_HEALTHY] }), config);
    const cell = plan.cells[0]!;
    const seed = replicationSeed(plan.experimentSeed, 3);
    const first = new Simulation(simulationConfigFor(plan.experimentId, cell, 3, seed));
    const again = new Simulation(simulationConfigFor(plan.experimentId, cell, 3, BigInt(first.trace.seed)));
    expect(JSON.stringify(again.trace)).toBe(JSON.stringify(first.trace));
  }, 60_000);

  it('detects a broken pairing', async () => {
    const result = await runExperiment(
      specOf({
        id: 'crn-audit',
        buildings: ['midtown-office'],
        dispatchers: ['collective', 'nearest-car'],
        traffic: [MIDTOWN_UP_PEAK],
        replication: { minReplications: 3, maxReplications: 3, checkEvery: 3 },
      }),
      config,
    );

    const report = verifyCrnAlignment(result.cells);
    expect(report.aligned).toBe(true);
    expect(report.comparableCohorts).toBe(1);
    expect(report.checkedReplications).toBe(3);
    expect(() => assertCrnAligned(result.cells)).not.toThrow();

    // Corrupt one digest and the audit must notice; otherwise it is decoration.
    const [first, second] = result.cells;
    const tampered: CellResult[] = [
      first!,
      {
        ...second!,
        replications: second!.replications.map((record, index): ReplicationRecord =>
          index === 1 ? { ...record, traceDigest: 'deadbeefdeadbeef' } : record,
        ),
      },
    ];
    const broken = verifyCrnAlignment(tampered);
    expect(broken.aligned).toBe(false);
    expect(broken.mismatches).toHaveLength(1);
    expect(broken.mismatches[0]?.replication).toBe(1);
    expect(() => assertCrnAligned(tampered)).toThrow(/Common random numbers are broken/);
  }, 60_000);
});

function expectSamePassenger(a: GeneratedPassenger, b: GeneratedPassenger): void {
  expect(b.id).toBe(a.id);
  expect(b.journeyId).toBe(a.journeyId);
  expect(b.batchId).toBe(a.batchId);
  expect(b.arrivalTimeS).toBe(a.arrivalTimeS);
  expect(b.originFloorId).toBe(a.originFloorId);
  expect(b.finalDestinationFloorId).toBe(a.finalDestinationFloorId);
  expect(b.massKg).toBe(a.massKg);
  expect(b.credentialGroup).toBe(a.credentialGroup);
  expect(b.category).toBe(a.category);
  expect(b.legs).toEqual(a.legs);
}

/* -------------------------------------------------------------------------- *
 * The digest itself
 * -------------------------------------------------------------------------- */

describe('traceDigest', () => {
  it('is 16 hex digits and changes when the population changes', () => {
    const plan = planExperiment(specOf({ id: 'digest', traffic: [GARDEN_HEALTHY] }), config);
    const cell = plan.cells[0]!;
    const trace = new Simulation(
      simulationConfigFor(plan.experimentId, cell, 0, replicationSeed(plan.experimentSeed, 0)),
    ).trace;
    expect(traceDigest(trace)).toMatch(/^[0-9a-f]{16}$/);

    const mutated: PassengerTrace = {
      ...trace,
      passengers: trace.passengers.map((passenger, index) =>
        index === 0 ? { ...passenger, massKg: passenger.massKg + 1 } : passenger,
      ),
    };
    expect(traceDigest(mutated)).not.toBe(traceDigest(trace));
  }, 60_000);
});
