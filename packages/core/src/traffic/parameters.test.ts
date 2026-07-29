/// <reference types="node" />

/**
 * The tunable schema (CLAUDE.md invariant 8), held to the standard `physics/doors` already
 * sets for `DOOR_PARAMETERS`.
 *
 * The invariant's point is that a generic optimizer can search the space. That makes a
 * declared id nothing reads worse than an undeclared knob: the optimizer writes the winning
 * value into a configuration, gets a run at the default instead, and nothing says so.
 * `doorMachine.test.ts` states it directly — "A declared answer.* id the resolver honours
 * only from an override is a claim the system cannot keep" — and the round-trip below is the
 * demand-side form of that check, one probe per declared id, each required to differ from the
 * default so the assertion cannot pass vacuously.
 *
 * The coverage test goes the other way, and is the one that would have caught
 * `entranceWeights` shipping undeclared: its table is `satisfies Record<keyof TrafficConfig,
 * ...>`, so a knob added to the config surface without a row here fails to compile.
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config/loader.js';
import type { LoadedConfig, ResolvedBuilding, TrafficProfiles } from '../config/types.js';
import { StreamSet } from '../random/index.js';

import { intensityAt } from './demandTemplate.js';
import { planDemand, generateTrace } from './generator.js';
import { TRAFFIC_DEFAULTS, TRAFFIC_PARAMETERS, type TrafficConfig } from './types.js';

const REAL_DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;
let profiles: TrafficProfiles;

beforeAll(async () => {
  config = await loadConfig(REAL_DATA_DIR);
  profiles = config.trafficProfiles;
});

const building = (id: string): ResolvedBuilding => {
  const found = config.buildingsById.get(id);
  if (found === undefined) throw new Error(`no building "${id}"`);
  return found;
};

const baseFor = (buildingId: string, seed = 5150): TrafficConfig => ({
  building: building(buildingId),
  profiles,
  streams: new StreamSet(seed),
});

/* -------------------------------------------------------------------------- *
 * Coverage: every knob declared, and nothing declared that is not a knob
 * -------------------------------------------------------------------------- */

/**
 * Every field of {@link TrafficConfig}, mapped to the parameter ids that set it.
 *
 * `null` marks a field that is deliberately not a tunable, with the reason. The
 * `satisfies Record<keyof TrafficConfig, ...>` is the load-bearing part: adding a field to
 * `TrafficConfig` without deciding which of the two it is stops the build.
 */
const PARAMETERS_BY_CONFIG_FIELD = {
  // Inputs a configuration is *of*, not knobs within one.
  building: null,
  profiles: null,
  streams: null,
  // Labels on the output. No metric can move when one changes.
  idPrefix: null,
  journeyIdPrefix: null,
  batchIdPrefix: null,

  template: ['traffic.template'],
  templateOverrides: [
    'traffic.riseAndFall.durationS',
    'traffic.riseAndFall.peakWindowS',
    'traffic.riseAndFall.baselineFraction',
    'traffic.constant.durationS',
    'traffic.constant.discardFirstS',
    'traffic.constant.discardLastS',
  ],
  demandLevel: ['traffic.demandLevel'],
  arrivalRatePctPop5min: ['traffic.arrivalRatePctPop5min'],
  directionalSplit: [
    'traffic.directionalSplit.incoming',
    'traffic.directionalSplit.outgoing',
    'traffic.directionalSplit.interfloor',
  ],
  batchSharesDestination: ['traffic.batchSharesDestination'],
  entranceWeights: ['traffic.entranceWeight'],
  interfloorWeighting: ['traffic.interfloorWeighting'],
  credentialAssignment: ['traffic.credentialAssignment'],
  maxLegs: ['traffic.maxLegs'],
} satisfies Record<keyof TrafficConfig, readonly string[] | null>;

describe('traffic tunables declare their schema', () => {
  it('declares every knob the config surface exposes, and only those', () => {
    const mapped = Object.values(PARAMETERS_BY_CONFIG_FIELD)
      .filter((ids): ids is string[] => ids !== null)
      .flat();
    const declared = TRAFFIC_PARAMETERS.map((parameter) => parameter.id);

    expect(new Set(declared)).toEqual(new Set(mapped));
    // No duplicate ids, and no id declared twice under different fields.
    expect(declared.length).toBe(new Set(declared).size);
    expect(mapped.length).toBe(new Set(mapped).size);
    expect(declared.length).toBe(TRAFFIC_PARAMETERS.length);
  });

  it('quotes the same defaults the resolver applies', () => {
    const defaultOf = (id: string): number | string | boolean | null => {
      const spec = TRAFFIC_PARAMETERS.find((parameter) => parameter.id === id);
      if (spec === undefined) throw new Error(`no declared parameter ${id}`);
      return spec.default;
    };
    expect(defaultOf('traffic.template')).toBe(TRAFFIC_DEFAULTS.templateId);
    expect(defaultOf('traffic.demandLevel')).toBe(TRAFFIC_DEFAULTS.demandLevel);
    expect(defaultOf('traffic.batchSharesDestination')).toBe(TRAFFIC_DEFAULTS.batchSharesDestination);
    expect(defaultOf('traffic.interfloorWeighting')).toBe(TRAFFIC_DEFAULTS.interfloorWeighting);
    expect(defaultOf('traffic.credentialAssignment')).toBe(TRAFFIC_DEFAULTS.credentialAssignment);
    expect(defaultOf('traffic.maxLegs')).toBe(TRAFFIC_DEFAULTS.maxLegs);
    expect(defaultOf('traffic.riseAndFall.durationS')).toBe(TRAFFIC_DEFAULTS.riseAndFallDurationS);
    expect(defaultOf('traffic.riseAndFall.peakWindowS')).toBe(TRAFFIC_DEFAULTS.peakWindowS);
    expect(defaultOf('traffic.riseAndFall.baselineFraction')).toBe(TRAFFIC_DEFAULTS.baselineFraction);
    expect(defaultOf('traffic.constant.durationS')).toBe(TRAFFIC_DEFAULTS.constantDurationS);
    expect(defaultOf('traffic.constant.discardFirstS')).toBe(TRAFFIC_DEFAULTS.constantDiscardFirstS);
    expect(defaultOf('traffic.constant.discardLastS')).toBe(TRAFFIC_DEFAULTS.constantDiscardLastS);
    // An entrance with no explicit weight is weighted 1, i.e. uniform.
    expect(defaultOf('traffic.entranceWeight')).toBe(1);
  });

  it('declares no default for the knobs whose default lives in the data', () => {
    // The doc comment on TRAFFIC_PARAMETERS and the declaration have to agree. `default: 12`
    // alongside "no default on purpose" is not a wording slip: an optimizer that starts from
    // declared defaults would run Garden Apartments (residential, typical 5%/5 min) at 12%,
    // 2.4x its intended demand, and report the result as the baseline.
    const nullDefaults = TRAFFIC_PARAMETERS.filter((parameter) => parameter.default === null).map(
      (parameter) => parameter.id,
    );
    expect(new Set(nullDefaults)).toEqual(
      new Set([
        'traffic.arrivalRatePctPop5min',
        'traffic.directionalSplit.incoming',
        'traffic.directionalSplit.outgoing',
        'traffic.directionalSplit.interfloor',
      ]),
    );

    // And "unset" really does mean "the profile decides", per building.
    const garden = planDemand({ building: building('garden-apartments'), profiles });
    expect(garden.peakPassengersPerSecond * 300).toBeCloseTo((5 / 100) * 120, 9);
    const office = planDemand({ building: building('midtown-office'), profiles });
    expect(office.peakPassengersPerSecond * 300).toBeCloseTo((12 / 100) * 1710, 9);
  });

  it('gives an optimizer everything it needs to sample a valid value', () => {
    for (const parameter of TRAFFIC_PARAMETERS) {
      expect(parameter.description.length, parameter.id).toBeGreaterThan(0);
      switch (parameter.type) {
        case 'continuous':
        case 'integer': {
          const range = parameter.range;
          expect(range, parameter.id).toBeDefined();
          if (range === undefined) throw new Error(`${parameter.id} declares no range`);
          expect(range[0]).toBeLessThanOrEqual(range[1]);
          expect(parameter.scale, parameter.id).toBeDefined();
          // `null` is "leave it unset"; any other default must be a number inside the range.
          if (parameter.default !== null) {
            expect(typeof parameter.default, parameter.id).toBe('number');
            expect(parameter.default as number).toBeGreaterThanOrEqual(range[0]);
            expect(parameter.default as number).toBeLessThanOrEqual(range[1]);
            if (parameter.type === 'integer') {
              expect(Number.isInteger(parameter.default as number)).toBe(true);
            }
          }
          break;
        }
        case 'categorical': {
          const values = parameter.values;
          expect(values, parameter.id).toBeDefined();
          expect(values ?? []).toContain(parameter.default);
          break;
        }
        case 'boolean':
          expect(typeof parameter.default, parameter.id).toBe('boolean');
          break;
      }
    }
  });

  it('marks the template-specific geometry inert under the other template', () => {
    const gate = (id: string): unknown =>
      TRAFFIC_PARAMETERS.find((parameter) => parameter.id === id)?.activeWhen;
    for (const id of [
      'traffic.riseAndFall.durationS',
      'traffic.riseAndFall.peakWindowS',
      'traffic.riseAndFall.baselineFraction',
    ]) {
      expect(gate(id), id).toEqual({ 'traffic.template': ['rise-and-fall'] });
    }
    for (const id of [
      'traffic.constant.durationS',
      'traffic.constant.discardFirstS',
      'traffic.constant.discardLastS',
    ]) {
      expect(gate(id), id).toEqual({ 'traffic.template': ['constant-iso'] });
    }
    // The parameters that are always live declare no gate.
    for (const id of ['traffic.demandLevel', 'traffic.maxLegs', 'traffic.entranceWeight']) {
      expect(gate(id), id).toBeUndefined();
    }
  });

  it('names the collection a per-member parameter ranges over', () => {
    // `traffic.entranceWeight` is declared once and supplied once per entrance floor, the way
    // `car.doorOpenS` is declared once for however many cars a building has. Without naming
    // the collection an optimizer cannot know how many values to sample.
    const spec = TRAFFIC_PARAMETERS.find((parameter) => parameter.id === 'traffic.entranceWeight');
    expect(spec?.perMemberOf).toBe('building.entranceFloors');
    expect(
      TRAFFIC_PARAMETERS.filter((parameter) => parameter.perMemberOf !== undefined).map((p) => p.id),
    ).toEqual(['traffic.entranceWeight']);
  });
});

/* -------------------------------------------------------------------------- *
 * The round trip: every declared id is actually read
 * -------------------------------------------------------------------------- */

interface Probe {
  /** Declared ids this probe exercises. */
  readonly ids: readonly string[];
  readonly buildingId: string;
  /** Set on top of the base configuration. Must move the observation off its default. */
  readonly probe: Partial<TrafficConfig>;
  readonly observe: (config: TrafficConfig) => unknown;
  readonly expected: unknown;
}

const categoriesOf = (config: TrafficConfig): string[] =>
  [
    ...new Set(
      planDemand(config).sources.flatMap((source) =>
        source.destinations.map((destination) => destination.category),
      ),
    ),
  ].sort();

const PROBES: readonly Probe[] = [
  {
    ids: ['traffic.template'],
    buildingId: 'midtown-office',
    probe: { template: 'constant-iso' },
    observe: (config) => planDemand(config).template.id,
    expected: 'constant-iso',
  },
  {
    ids: ['traffic.demandLevel'],
    buildingId: 'midtown-office',
    probe: { demandLevel: 'max' },
    // office-standard declares max 15%.
    observe: (config) => Math.round(planDemand(config).peakPassengersPerSecond * 300 * 1e6) / 1e6,
    expected: Math.round((15 / 100) * 1710 * 1e6) / 1e6,
  },
  {
    ids: ['traffic.arrivalRatePctPop5min'],
    buildingId: 'midtown-office',
    probe: { arrivalRatePctPop5min: 7 },
    observe: (config) => Math.round(planDemand(config).peakPassengersPerSecond * 300 * 1e6) / 1e6,
    expected: Math.round((7 / 100) * 1710 * 1e6) / 1e6,
  },
  {
    ids: ['traffic.directionalSplit.incoming'],
    buildingId: 'midtown-office',
    probe: { directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 } },
    observe: categoriesOf,
    expected: ['incoming'],
  },
  {
    ids: ['traffic.directionalSplit.outgoing'],
    buildingId: 'midtown-office',
    probe: { directionalSplit: { incoming: 0, outgoing: 1, interfloor: 0 } },
    observe: categoriesOf,
    expected: ['outgoing'],
  },
  {
    ids: ['traffic.directionalSplit.interfloor'],
    buildingId: 'midtown-office',
    probe: { directionalSplit: { incoming: 0, outgoing: 0, interfloor: 1 } },
    observe: categoriesOf,
    expected: ['interfloor'],
  },
  {
    ids: ['traffic.batchSharesDestination'],
    buildingId: 'midtown-office',
    probe: { batchSharesDestination: true },
    observe: (config) =>
      generateTrace(config).arrivals.every(
        (batch) => new Set(batch.passengers.map((p) => p.finalDestinationFloorId)).size === 1,
      ),
    expected: true,
  },
  {
    ids: ['traffic.entranceWeight'],
    buildingId: 'midtown-office',
    probe: { entranceWeights: { G: 1, P1: 0 } },
    observe: (config) =>
      Object.fromEntries(planDemand(config).entrances.map((e) => [e.floorId, e.weight])),
    expected: { G: 1, P1: 0 },
  },
  {
    ids: ['traffic.interfloorWeighting'],
    buildingId: 'mixed-use-high-rise',
    probe: { interfloorWeighting: 'uniform' },
    // Uniform weighting makes every interfloor destination equally likely; population
    // weighting does not, because Mixed-Use has 28-, 46- and 26-person floors.
    observe: (config) =>
      new Set(
        planDemand(config)
          .sources.find((source) => source.id === 'resident:20')
          ?.destinations.filter((destination) => destination.category === 'interfloor')
          .map((destination) => destination.weight.toPrecision(12)),
      ).size,
    expected: 1,
  },
  {
    ids: ['traffic.credentialAssignment'],
    buildingId: 'secure-tower',
    probe: { credentialAssignment: 'none' },
    observe: (config) =>
      generateTrace(config).passengers.every((p) => p.credentialGroup === undefined),
    expected: true,
  },
  {
    ids: ['traffic.maxLegs'],
    buildingId: 'vertical-city',
    // **3 until the sky lobbies got escalators, and 2 since.** The probe has to bind, and the cap
    // that binds is a fact about the building's geometry: `vertical-city`'s longest planned
    // journey is now three lift legs (zone 3 → zone 5 and its kind), where it used to be four
    // (zone 3 → zone 4, which crossed decks at the *ground* lobby and now crosses at sky lobby A).
    // A cap of 3 refuses nothing today and this probe would assert nothing — the shape
    // `parameters.test.ts`'s own `expect(observe(base)).not.toEqual(expected)` line exists to
    // catch, and did.
    probe: { maxLegs: 2 },
    observe: (config) => planDemand(config).warnings.some((w) => w.includes('maxLegs')),
    expected: true,
  },
  {
    ids: ['traffic.riseAndFall.durationS'],
    buildingId: 'midtown-office',
    probe: { templateOverrides: { durationS: 1200 } },
    observe: (config) => planDemand(config).template.durationS,
    expected: 1200,
  },
  {
    ids: ['traffic.riseAndFall.peakWindowS'],
    buildingId: 'midtown-office',
    probe: { templateOverrides: { peakWindowS: 420 } },
    observe: (config) => {
      const { reportWindowStartS, reportWindowEndS } = planDemand(config).template;
      return reportWindowEndS - reportWindowStartS;
    },
    expected: 420,
  },
  {
    ids: ['traffic.riseAndFall.baselineFraction'],
    buildingId: 'midtown-office',
    probe: { templateOverrides: { baselineFraction: 0.25 } },
    observe: (config) => intensityAt(planDemand(config).template, 0),
    expected: 0.25,
  },
  {
    ids: ['traffic.constant.durationS'],
    buildingId: 'midtown-office',
    probe: { template: 'constant-iso', templateOverrides: { durationS: 3600 } },
    observe: (config) => planDemand(config).template.durationS,
    expected: 3600,
  },
  {
    ids: ['traffic.constant.discardFirstS'],
    buildingId: 'midtown-office',
    probe: { template: 'constant-iso', templateOverrides: { discardFirstS: 600 } },
    observe: (config) => planDemand(config).template.reportWindowStartS,
    expected: 600,
  },
  {
    ids: ['traffic.constant.discardLastS'],
    buildingId: 'midtown-office',
    probe: { template: 'constant-iso', templateOverrides: { discardLastS: 120 } },
    observe: (config) => {
      const { durationS, reportWindowEndS } = planDemand(config).template;
      return durationS - reportWindowEndS;
    },
    expected: 120,
  },
];

describe('every declared traffic tunable is read from the config surface', () => {
  it('covers every declared id with a probe', () => {
    expect(new Set(PROBES.flatMap((probe) => probe.ids))).toEqual(
      new Set(TRAFFIC_PARAMETERS.map((parameter) => parameter.id)),
    );
  });

  it.each(PROBES.map((probe) => [probe.ids.join(', '), probe] as const))(
    'honours %s',
    (_name, probe) => {
      const base = baseFor(probe.buildingId);
      // The probe has to differ from the default, or the assertion below proves nothing.
      expect(probe.observe(base)).not.toEqual(probe.expected);
      expect(probe.observe({ ...base, ...probe.probe })).toEqual(probe.expected);
    },
  );

  it('refuses overrides it would have to ignore', () => {
    // A resolved template carries its own geometry. Accepting `templateOverrides` alongside it
    // and quietly dropping them is the exact failure this whole file exists to prevent.
    const base = baseFor('midtown-office');
    expect(() =>
      planDemand({
        ...base,
        template: planDemand(base).template,
        templateOverrides: { peakWindowS: 420 },
      }),
    ).toThrow(/cannot be applied to the already-resolved template/);
  });
});
