import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig, SimulationDemandOptions } from '@elevator-sim/core';

import { GARDEN_HEALTHY, MIDTOWN_UP_PEAK, loadResources, specOf } from './fixtures.test-helper.js';
import {
  parseExperimentSpec,
  planExperiment,
  resolveParallelPolicy,
  resolveReplicationPolicy,
} from './experiment.js';
import { REPLICATION_METRICS, isReplicationMetric, metricOf, metricsOf } from './metrics.js';
import { RUNNER_DEFAULTS, RUNNER_PARAMETERS, RunnerError } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadResources();
}, 60_000);

/* -------------------------------------------------------------------------- *
 * The spec is data (CLAUDE.md invariant 7)
 * -------------------------------------------------------------------------- */

const VALID_JSON = {
  id: 'collective-vs-nearest-car',
  description: 'the Phase 3 acceptance comparison',
  seed: '20260726',
  buildings: ['midtown-office'],
  dispatchers: ['collective', { id: 'crippled', profile: 'collective', options: { weights: { waitTime: 0 } } }],
  traffic: [
    {
      id: 'up-peak',
      demandTemplate: 'rise-and-fall',
      durationS: 1800,
      reportWindow: 'peak-5min',
      demand: {
        directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
        entranceWeights: { G: 1, P1: 0 },
        arrivalRatePctPop5min: 12,
        peakWindowS: 300,
      },
    },
  ],
  replication: { minReplications: 50, maxReplications: 200, checkEvery: 8, confidence: 0.9, acceptableRange: 2 },
  parallel: { mode: 'auto', workers: 4 },
  simulation: { onTimeout: 'report', drainGraceS: 1800 },
};

/**
 * One non-default value per field of `SimulationDemandOptions`, as a spec author writes it.
 *
 * The `satisfies` is the guard: a field added to the demand surface without a row here fails to
 * compile, which is what `DEMAND_KEYS` — a bare `as const` — could not do, and is why the
 * allow-list and the parser were able to drift apart in the first place.
 */
const DEMAND_JSON = {
  demandLevel: 'max',
  arrivalRatePctPop5min: 9,
  directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
  batchSharesDestination: true,
  entranceWeights: { G: 1 },
  interfloorWeighting: 'uniform',
  credentialAssignment: 'none',
  maxLegs: 4,
  peakWindowS: 420,
  baselineFraction: 0.25,
  mixAmplitude: 0.5,
  batchSize: { distribution: 'explicit', weights: [0, 0, 0, 1] },
  passengerMass: { distribution: 'lognormal', meanKg: 110, stdDevKg: 15, minKg: 40, maxKg: 200 },
} as const satisfies Record<keyof SimulationDemandOptions, unknown>;

describe('parseExperimentSpec reads every demand key it accepts', () => {
  /**
   * **The regression this block exists for, and it is worse than the bug it came from.**
   *
   * `parseDemand` has two hand-written lists: `DEMAND_KEYS`, which `rejectUnknown` consults, and
   * the field-by-field projection that follows it. Wave 13's T3 added three keys to the first and
   * not the second — so a spec setting them stopped being *refused with a clear error* and started
   * being *accepted and silently ignored*. Fail-loud became fail-silent, which is strictly the
   * wrong direction and is the same defect class the commit was written to eliminate.
   *
   * It survived every guard that commit added because `crn.test.ts` and the rest build specs
   * through `fixtures.test-helper.ts`'s `specOf`, which constructs a typed `ExperimentSpec`
   * directly and never calls `parseDemand`. Only the JSON door is affected, so only a test that
   * comes through the JSON door can see it.
   */
  it('parses every key it accepts, rather than accepting keys it drops', () => {
    const spec = parseExperimentSpec({
      ...VALID_JSON,
      traffic: [{ id: 'every-knob', durationS: 900, demand: DEMAND_JSON }],
    });
    const parsed = spec.traffic[0]?.demand;

    for (const [key, value] of Object.entries(DEMAND_JSON)) {
      expect(
        (parsed as Record<string, unknown> | undefined)?.[key],
        `demand.${key} is accepted by rejectUnknown and must be parsed, not dropped`,
      ).toEqual(value);
    }
  });

  /**
   * The negative control the clause above needs. If `rejectUnknown` had simply been widened to
   * accept anything, the assertion would pass by accepting a typo too.
   */
  it('still refuses a key that is not on the surface at all', () => {
    expect(() =>
      parseExperimentSpec({
        ...VALID_JSON,
        traffic: [{ id: 'typo', durationS: 900, demand: { passengerMasses: {} } }],
      }),
    ).toThrow(/passengerMasses/);
  });

  /**
   * A malformed value inside a newly-parsed key is refused by name rather than coerced. A parser
   * that read the key but did not validate it would pass the first clause and hand the simulator a
   * weight vector of strings.
   */
  it('validates inside the keys it now parses', () => {
    expect(() =>
      parseExperimentSpec({
        ...VALID_JSON,
        traffic: [
          {
            id: 'bad-curve',
            durationS: 900,
            demand: { batchSize: { distribution: 'explicit', weights: ['many'] } },
          },
        ],
      }),
    ).toThrow(/weights/);
    expect(() =>
      parseExperimentSpec({
        ...VALID_JSON,
        traffic: [
          {
            id: 'bad-mass',
            durationS: 900,
            demand: { passengerMass: { distribution: 'normal', meanKg: 75 } },
          },
        ],
      }),
    ).toThrow(/stdDevKg/);
  });
});

describe('parseExperimentSpec', () => {
  it('round-trips a spec that is pure JSON', () => {
    const spec = parseExperimentSpec(JSON.parse(JSON.stringify(VALID_JSON)));
    expect(spec.id).toBe('collective-vs-nearest-car');
    expect(spec.seed).toBe('20260726');
    expect(spec.dispatchers).toHaveLength(2);
    expect(spec.traffic[0]?.demand?.arrivalRatePctPop5min).toBe(12);
    expect(spec.replication?.checkEvery).toBe(8);
    // Parsing is idempotent, so a spec can be re-validated after a round trip through a file.
    expect(parseExperimentSpec(spec)).toEqual(spec);
  });

  it('rejects an unknown key rather than ignoring it', () => {
    // The failure mode this prevents: `"replications": 200` next to a schema that says
    // `"replication": {...}` runs at the default budget and reports a tighter interval than earned.
    expect(() => parseExperimentSpec({ ...VALID_JSON, replications: 200 })).toThrow(/unknown key/);
    expect(() =>
      parseExperimentSpec({ ...VALID_JSON, replication: { minReplicaitons: 10 } }),
    ).toThrow(/spec\.replication\.minReplicaitons/);
    expect(() =>
      parseExperimentSpec({
        ...VALID_JSON,
        traffic: [{ id: 't', demand: { arrivalRatePct5min: 12 } }],
      }),
    ).toThrow(/spec\.traffic\[0\]\.demand\.arrivalRatePct5min/);
  });

  it('names the offending path on a type error', () => {
    expect(() => parseExperimentSpec({ ...VALID_JSON, buildings: 'midtown-office' })).toThrow(
      /spec\.buildings: expected an array/,
    );
    expect(() => parseExperimentSpec({ ...VALID_JSON, seed: {} })).toThrow(/spec\.seed/);
    expect(() =>
      parseExperimentSpec({ ...VALID_JSON, traffic: [{ id: 't', demandTemplate: 'rise-and-crash' }] }),
    ).toThrow(/spec\.traffic\[0\]\.demandTemplate/);
    expect(() =>
      parseExperimentSpec({ ...VALID_JSON, replication: { stoppingMetric: 'awt' } }),
    ).toThrow(/not a known replication metric/);
  });

  it('refuses a report window smuggled in through summarize', () => {
    expect(() =>
      parseExperimentSpec({ ...VALID_JSON, simulation: { summarize: { window: 'full-run' } } }),
    ).toThrow(/belongs to the traffic arm/);
  });

  it('carries a RunnerError path for programmatic handling', () => {
    try {
      parseExperimentSpec({ ...VALID_JSON, id: '' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RunnerError);
      expect((error as RunnerError).path).toBe('spec.id');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Policies and the declared schema (invariant 8)
 * -------------------------------------------------------------------------- */

describe('resolveReplicationPolicy', () => {
  it('defaults to the doc’s 50–200 budget', () => {
    const policy = resolveReplicationPolicy(undefined);
    expect(policy.minReplications).toBe(50);
    expect(policy.maxReplications).toBe(200);
    expect(policy.checkEvery).toBe(8);
    expect(policy.confidence).toBe(0.9);
    expect(policy.stoppingMetric).toBe('awtS');
    expect(policy.stopOnSaturation).toBe(true);
  });

  it('raises the cap to the floor when only a floor is given', () => {
    expect(resolveReplicationPolicy({ minReplications: 500 }).maxReplications).toBe(500);
  });

  it('rejects an incoherent budget', () => {
    expect(() => resolveReplicationPolicy({ minReplications: 10, maxReplications: 5 })).toThrow(
      /below replication\.minReplications/,
    );
    expect(() => resolveReplicationPolicy({ checkEvery: 0 })).toThrow(/safe integer >= 1/);
    expect(() => resolveReplicationPolicy({ confidence: 1 })).toThrow(/strictly between 0 and 1/);
    expect(() => resolveReplicationPolicy({ acceptableRange: -1 })).toThrow(/non-negative/);
  });
});

describe('resolveParallelPolicy', () => {
  it('lets a call-site override beat the spec, because the machine is not the experiment', () => {
    expect(resolveParallelPolicy({ mode: 'workers', workers: 6 }, { mode: 'serial' }).mode).toBe('serial');
    expect(resolveParallelPolicy({ mode: 'workers', workers: 6 }, {}).workers).toBe(6);
    expect(resolveParallelPolicy(undefined).mode).toBe('auto');
  });
});

describe('RUNNER_PARAMETERS', () => {
  it('declares every default it claims to (invariant 8)', () => {
    const byId = new Map(RUNNER_PARAMETERS.map((parameter) => [parameter.id, parameter]));
    expect(byId.size).toBe(RUNNER_PARAMETERS.length);
    for (const [key, value] of Object.entries(RUNNER_DEFAULTS)) {
      const parameter = byId.get(`runner.${key}`);
      expect(parameter, `runner.${key} must be declared in RUNNER_PARAMETERS`).toBeDefined();
      expect(parameter?.default).toBe(value);
    }
  });

  it('gives every numeric parameter a range and every declared range a default inside it', () => {
    for (const parameter of RUNNER_PARAMETERS) {
      if (parameter.type === 'continuous' || parameter.type === 'integer') {
        expect(parameter.range, parameter.id).toBeDefined();
        const [min, max] = parameter.range!;
        expect(parameter.default as number, parameter.id).toBeGreaterThanOrEqual(min);
        expect(parameter.default as number, parameter.id).toBeLessThanOrEqual(max);
      }
      expect(parameter.description.length, parameter.id).toBeGreaterThan(20);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Planning
 * -------------------------------------------------------------------------- */

/**
 * **The non-test caller docs/14 § 5 criterion 6 requires, and the whole reason these two fields
 * exist here.**
 *
 * `SimulationConfig.patience` and `SimulationConfig.lobbyCrowding` were, on landing, configurable,
 * unit-tested in isolation and set by **nothing** in `cli/`, `viz/` or `experiments/` — verbatim
 * the shape `docs/05` § *Standing requirement* names, in the wave whose governing rule is that a
 * control failing it is deleted rather than documented. The comparator invoked for them at the
 * time, `doorObstructionProbability`, does not hold: that field *is* driven from shipped paths, as
 * a `SimulationOverridesSpec` field here and from `fuzz/generate.ts`.
 *
 * This is the fix, and this suite is what stops it silently regressing: a spec file names them,
 * `parseExperimentSpec` accepts them, and `planExperiment` puts them on the `SimulationConfig`
 * every replication is run from. Delete either line in `experiment.ts` and this goes red.
 */
describe('the passenger-behaviour overrides reach a planned cell', () => {
  it('parses from a spec file and lands on every cell', () => {
    const spec = parseExperimentSpec({
      ...VALID_JSON,
      simulation: {
        onTimeout: 'report',
        patience: { distribution: 'uniform', meanS: 90, spreadS: 30, minS: 5 },
        lobbyCrowding: { thresholdPersons: 6, factorPerPerson: 0.07, maxFactor: 2.5 },
      },
    });
    expect(spec.simulation?.patience?.meanS).toBe(90);

    const plan = planExperiment(
      { ...spec, buildings: ['midtown-office'], dispatchers: ['collective'], traffic: [MIDTOWN_UP_PEAK] },
      config,
    );
    expect(plan.cells.length).toBeGreaterThan(0);
    for (const cell of plan.cells) {
      expect(cell.simulation.patience).toEqual({
        distribution: 'uniform',
        meanS: 90,
        spreadS: 30,
        minS: 5,
      });
      expect(cell.simulation.lobbyCrowding).toEqual({
        thresholdPersons: 6,
        factorPerPerson: 0.07,
        maxFactor: 2.5,
      });
    }
  });

  /* Absent is absent: a spec naming neither builds the config it built before they existed. */
  it('puts no key on a cell whose spec names neither', () => {
    const plan = planExperiment(specOf({ id: 'quiet' }), config);
    for (const cell of plan.cells) {
      expect(Object.keys(cell.simulation)).not.toContain('patience');
      expect(Object.keys(cell.simulation)).not.toContain('lobbyCrowding');
    }
  });

  it('refuses a curve it does not recognise rather than dropping it', () => {
    expect(() =>
      parseExperimentSpec({
        ...VALID_JSON,
        simulation: { patience: { distribution: 'poisson', meanS: 30 } },
      }),
    ).toThrow(/distribution/);
    expect(() =>
      parseExperimentSpec({
        ...VALID_JSON,
        simulation: { patience: { distribution: 'exponential', meanS: 30, reach: 4 } },
      }),
    ).toThrow(/reach/);
  });
});

describe('planExperiment', () => {
  it('expands the cross product with the dispatcher innermost', () => {
    const plan = planExperiment(
      specOf({
        id: 'cross-product',
        buildings: ['garden-apartments', 'midtown-office'],
        dispatchers: ['collective', 'nearest-car'],
        traffic: [GARDEN_HEALTHY, { id: 'quiet', durationS: 900, demand: { arrivalRatePctPop5min: 5 } }],
      }),
      config,
    );
    expect(plan.cells).toHaveLength(8);
    expect(plan.cells.map((cell) => cell.cellId)).toEqual([
      'garden-apartments|healthy|collective',
      'garden-apartments|healthy|nearest-car',
      'garden-apartments|quiet|collective',
      'garden-apartments|quiet|nearest-car',
      'midtown-office|healthy|collective',
      'midtown-office|healthy|nearest-car',
      'midtown-office|quiet|collective',
      'midtown-office|quiet|nearest-car',
    ]);
    // Arms of a paired comparison are adjacent, so a cohort is a contiguous run of cells.
    expect(plan.cohorts).toHaveLength(4);
    expect(plan.cells.map((cell) => cell.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(plan.guaranteedReplications).toBe(8 * plan.policy.minReplications);
  });

  it('resolves ids to the objects the resources hold, and never branches on them', () => {
    const plan = planExperiment(specOf({ id: 'resolve', buildings: ['midtown-office'] }), config);
    const cell = plan.cells[0]!;
    expect(cell.simulation.building).toBe(config.buildingsById.get('midtown-office'));
    expect(cell.simulation.dispatcherProfile).toBe(config.dispatcherProfilesById.get('collective'));
    expect(cell.simulation.trafficProfiles).toBe(config.trafficProfiles);
    expect(cell.simulation.elevatorSpecs).toBe(config.elevatorSpecs);
  });

  it('defaults onTimeout to report so a saturated configuration is measured, not crashed', () => {
    const plan = planExperiment(specOf({ id: 'timeout' }), config);
    expect(plan.cells[0]?.simulation.onTimeout).toBe('report');
    const strict = planExperiment(
      { ...specOf({ id: 'strict' }), simulation: { onTimeout: 'throw' } },
      config,
    );
    expect(strict.cells[0]?.simulation.onTimeout).toBe('throw');
  });

  it('expresses a crippled control as a variant arm of one profile', () => {
    const plan = planExperiment(
      specOf({
        id: 'crippled',
        buildings: ['midtown-office'],
        dispatchers: ['collective', { id: 'collective-blind', profile: 'collective', options: { weights: { waitTime: 0 } } }],
        traffic: [MIDTOWN_UP_PEAK],
      }),
      config,
    );
    expect(plan.cells.map((cell) => cell.dispatcherArmId)).toEqual(['collective', 'collective-blind']);
    expect(plan.cells.map((cell) => cell.dispatcherProfileId)).toEqual(['collective', 'collective']);
    expect(plan.cells[0]?.simulation.dispatcherOptions).toBeUndefined();
    expect(plan.cells[1]?.simulation.dispatcherOptions).toEqual({ weights: { waitTime: 0 } });
    // Same profile, same building, same traffic: still one CRN cohort.
    expect(plan.cohorts).toHaveLength(1);
  });

  it('stamps each cell with metadata naming its arms', () => {
    const plan = planExperiment(specOf({ id: 'stamped' }), config);
    expect(plan.cells[0]?.simulation.metadata).toEqual({
      experimentId: 'stamped',
      trafficArmId: 'healthy',
      dispatcherArmId: 'collective',
    });
  });

  it('rejects an unknown id, an empty axis and a duplicate arm', () => {
    expect(() => planExperiment(specOf({ id: 'x', buildings: ['nowhere-tower'] }), config)).toThrow(
      /no building "nowhere-tower"/,
    );
    expect(() => planExperiment(specOf({ id: 'x', dispatchers: ['telepathy'] }), config)).toThrow(
      /no dispatcher profile "telepathy"/,
    );
    expect(() => planExperiment(specOf({ id: 'x', buildings: [] }), config)).toThrow(/spec\.buildings is empty/);
    expect(() => planExperiment(specOf({ id: 'x', traffic: [] }), config)).toThrow(/spec\.traffic is empty/);
    expect(() =>
      planExperiment(specOf({ id: 'x', dispatchers: ['collective', 'collective'] }), config),
    ).toThrow(/duplicate dispatcher arm id/);
    expect(() =>
      planExperiment(specOf({ id: 'x', traffic: [GARDEN_HEALTHY, GARDEN_HEALTHY] }), config),
    ).toThrow(/duplicate traffic arm id/);
    expect(() =>
      planExperiment(specOf({ id: 'x', buildings: ['garden-apartments', 'garden-apartments'] }), config),
    ).toThrow(/duplicate building id/);
  });

  it('is pure: two plans of one spec agree, and neither touches the resources', () => {
    const spec = specOf({ id: 'pure', dispatchers: ['collective', 'eta'] });
    const a = planExperiment(spec, config);
    const b = planExperiment(spec, config);
    expect(a.cells.map((cell) => cell.traceKey)).toEqual(b.cells.map((cell) => cell.traceKey));
    expect(a.experimentSeed).toBe(b.experimentSeed);
  });
});

/* -------------------------------------------------------------------------- *
 * Metric projection
 * -------------------------------------------------------------------------- */

describe('metricOf', () => {
  it('names every metric exactly once and recognizes only those', () => {
    expect(new Set(REPLICATION_METRICS).size).toBe(REPLICATION_METRICS.length);
    for (const metric of REPLICATION_METRICS) expect(isReplicationMetric(metric)).toBe(true);
    expect(isReplicationMetric('awt')).toBe(false);
  });

  it('passes NaN through instead of coalescing an absent measurement to zero', () => {
    const empty = {
      waiting: { meanS: Number.NaN, p95S: Number.NaN, p99S: Number.NaN, maxS: Number.NaN, pctOverLongWait: Number.NaN },
      rideTime: { meanS: Number.NaN },
      timeToDestination: { meanS: Number.NaN, p95S: Number.NaN },
      achievedInterval: { meanS: Number.NaN, coefficientOfVariation: Number.NaN },
      handlingCapacity: { personsPer5Min: 0, offeredPer5Min: 0 },
      loadFactor: { meanLoadFactor: Number.NaN, fractionOfTimeAtOrAboveDesignLoad: 0 },
      saturation: { meanQueueLength: 0, maxQueueLength: 0, slopePersonsPerMinute: 0 },
      counts: { arrivals: 0, unserved: 0 },
    } as unknown as Parameters<typeof metricsOf>[0];

    expect(metricOf(empty, 'awtS')).toBeNaN();
    // %POP is optional on the summary; an absent population must not read as 0 % of population.
    expect(metricOf(empty, 'pctPopulationPer5Min')).toBeNaN();
    // Nor may "no arrivals" read as "nobody was left unserved".
    expect(metricOf(empty, 'unservedFraction')).toBeNaN();
    // The whole energy block is absent from this fixture, and totality has to survive that too.
    // It did not when the four energy metrics first landed: they dereferenced `summary.energy`
    // unguarded and this suite went red with a TypeError rather than a NaN. Named individually
    // rather than left to the loop below, because the loop only checks that the KEYS are present.
    for (const metric of ['energyKJ', 'carDistanceM', 'carStarts', 'energyPerServedLegKJ'] as const) {
      expect(metricOf(empty, metric), metric).toBeNaN();
    }
    expect(Object.keys(metricsOf(empty))).toEqual([...REPLICATION_METRICS]);
    // Totality over the whole domain, so a metric added later cannot skip this check by not being
    // named above: every one of them must produce a number on a summary that says almost nothing.
    for (const metric of REPLICATION_METRICS) {
      expect(typeof metricOf(empty, metric), metric).toBe('number');
    }
  });
});
