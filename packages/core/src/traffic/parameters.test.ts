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

import { intensityAt, splitAt } from './demandTemplate.js';
import { planDemand, generateTrace } from './generator.js';
import {
  TRAFFIC_DEFAULTS,
  TRAFFIC_PARAMETERS,
  type ResolvedDayVariation,
  type TrafficConfig,
} from './types.js';

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
  /*
   * A model version, not a knob. It says *which simulator* produced a number, so an optimizer that
   * sampled it would be searching across two simulators and reporting the difference as a tuning
   * result — the exact confusion `docs/03`'s pairing rules exist to prevent. Metrics do move when
   * it changes, which is why it is `null` for a different reason than `idPrefix` is.
   */
  trafficModel: null,
  /*
   * Which *part of the day* the run covers (§ D285) — a scenario axis, not a knob, and `null` for a
   * third reason on top of the two above.
   *
   * § D244 rule 3 kept `startOfDayS` out of this surface because an optimizer sampling *what hour it
   * is* would search a dimension that cannot move a cost. The window is that hour made selectable,
   * so the argument applies harder: sampling it would search *which experiment to run*, and
   * CLAUDE.md § Tuning discipline says the opposite — tune per traffic pattern, which means holding
   * the pattern fixed and searching the weights inside it.
   *
   * There is also a declaration this surface could not honestly make. A tunable declares a range,
   * and the only true range here is `[0, the selected template's own durationS)` — 1 800 s for
   * `rise-and-fall` and 36 000 s for `office-day`. `activeWhen` selects on a *value*, not on a
   * length read out of `data/`, so any range written here would be wrong for five of the seven
   * shipped records. A declared schema that disagrees with the resolver is worse than none.
   */
  windowStartS: null,
  windowEndS: null,

  template: ['traffic.template'],
  templateOverrides: [
    'traffic.riseAndFall.durationS',
    'traffic.riseAndFall.peakWindowS',
    'traffic.riseAndFall.baselineFraction',
    'traffic.constant.durationS',
    'traffic.constant.discardFirstS',
    'traffic.constant.discardLastS',
    'traffic.lunchTwoWay.durationS',
    'traffic.lunchTwoWay.mixAmplitude',
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
  credentialGap: ['traffic.credentialGap.wrongZoneShare'],
  maxLegs: ['traffic.maxLegs'],
  batchSize: [
    'traffic.batchSize.distribution',
    'traffic.batchSize.mean',
    'traffic.batchSize.weight',
  ],
  passengerMass: [
    'traffic.passengerMass.distribution',
    'traffic.passengerMass.meanKg',
    'traffic.passengerMass.stdDevKg',
    'traffic.passengerMass.minKg',
    'traffic.passengerMass.maxKg',
  ],
  dayVariation: [
    'traffic.dayVariation.minDemandFactor',
    'traffic.dayVariation.maxDemandFactor',
    'traffic.dayVariation.peakShiftS',
  ],
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
    // Pinned as a count as well as a set, because `TRAFFIC_PARAMETERS`' own docstring quotes this
    // number in prose and said "two" while four were declared. A sentence nothing checks goes
    // stale; this is what makes the next edit to it fail rather than drift.
    expect(nullDefaults.length).toBe(16);
    expect(new Set(nullDefaults)).toEqual(
      new Set([
        'traffic.arrivalRatePctPop5min',
        'traffic.directionalSplit.incoming',
        'traffic.directionalSplit.outgoing',
        'traffic.directionalSplit.interfloor',
        // docs/14 §§ 2.1-2.2. The same reasoning, twice more. The group-size curve's default is
        // whatever `data/traffic-profiles.json` authors per profile — 1.4 for a standard office
        // and 2.0 for a hotel — so a number here would impose one building's grouping on every
        // other. The body-mass block's default is a single figure in the same file, and declaring
        // it here would make two places that state it and one place that can go stale.
        'traffic.batchSize.distribution',
        'traffic.batchSize.mean',
        'traffic.batchSize.weight',
        'traffic.passengerMass.distribution',
        'traffic.passengerMass.meanKg',
        'traffic.passengerMass.stdDevKg',
        'traffic.passengerMass.minKg',
        'traffic.passengerMass.maxKg',
        // docs/14 § 2.3, and null for a neighbouring reason rather than that one: there is no
        // reference file to defer to here. *No day variation at all* is the only default that
        // leaves every published figure standing, and a multiplier declared here would silently
        // make every run in the repository a different Tuesday.
        'traffic.dayVariation.minDemandFactor',
        'traffic.dayVariation.maxDemandFactor',
        'traffic.dayVariation.peakShiftS',
        // § D265, and null for the `passengerMass` reason exactly: the share is a single figure in
        // `data/traffic-profiles.json` with its reasoning attached, and it is an uncited assumption
        // rather than a measurement. Declaring a second copy here would make two places that state
        // it — and the one nobody is reading is the one that is right.
        'traffic.credentialGap.wrongZoneShare',
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
          // `null` is "leave it unset", exactly as in the numeric branch above — the value then
          // comes from the data rather than from this schema, so it is not one of `values` and
          // must not be. An optimizer reads it as "omit the key", never as "the first option".
          if (parameter.default !== null) expect(values ?? [], parameter.id).toContain(parameter.default);
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
    for (const id of ['traffic.lunchTwoWay.durationS', 'traffic.lunchTwoWay.mixAmplitude']) {
      expect(gate(id), id).toEqual({ 'traffic.template': ['lunch-two-way'] });
    }
    // The parameters that are always live declare no gate.
    for (const id of ['traffic.demandLevel', 'traffic.maxLegs', 'traffic.entranceWeight']) {
      expect(gate(id), id).toBeUndefined();
    }
  });

  /**
   * The group-size curve's two shape parameters are inert under the other family, and the gate
   * says so. A `mean` sampled against an `explicit` curve is ignored — the mean is derived from
   * the weights — and a weight vector sampled against a `geometric` one is ignored too. An
   * optimizer that did not know would spend half its budget moving a number that changes nothing,
   * which is the failure `activeWhen` exists to prevent.
   */
  it('marks each group-size shape parameter inert under the other family', () => {
    const gate = (id: string): unknown =>
      TRAFFIC_PARAMETERS.find((parameter) => parameter.id === id)?.activeWhen;
    expect(gate('traffic.batchSize.mean')).toEqual({
      'traffic.batchSize.distribution': ['geometric', 'zeroTruncatedPoisson'],
    });
    expect(gate('traffic.batchSize.weight')).toEqual({
      'traffic.batchSize.distribution': ['explicit'],
    });
    // The five mass parameters are live under both families and declare no gate: `lognormal` and
    // `normal` take the same four numbers, they just interpret the spread differently.
    for (const id of [
      'traffic.passengerMass.distribution',
      'traffic.passengerMass.meanKg',
      'traffic.passengerMass.stdDevKg',
      'traffic.passengerMass.minKg',
      'traffic.passengerMass.maxKg',
    ]) {
      expect(gate(id), id).toBeUndefined();
    }
  });

  it('names the collection a per-member parameter ranges over', () => {
    // `traffic.entranceWeight` is declared once and supplied once per entrance floor, the way
    // `car.doorOpenS` is declared once for however many cars a building has. Without naming
    // the collection an optimizer cannot know how many values to sample.
    const spec = TRAFFIC_PARAMETERS.find((parameter) => parameter.id === 'traffic.entranceWeight');
    expect(spec?.perMemberOf).toBe('building.entranceFloors');
    // `traffic.batchSize.weight` is the second, and its collection is not a building's: the sizes
    // a group-size curve names are the vector's own length, chosen by whoever authors the curve.
    // Declaring it is what tells an optimizer how many values to sample rather than leaving it to
    // guess that one weight is one number.
    const weight = TRAFFIC_PARAMETERS.find((p) => p.id === 'traffic.batchSize.weight');
    expect(weight?.perMemberOf).toBe('traffic.batchSize.sizes');
    expect(
      TRAFFIC_PARAMETERS.filter((parameter) => parameter.perMemberOf !== undefined).map((p) => p.id),
    ).toEqual(['traffic.entranceWeight', 'traffic.batchSize.weight']);
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
    ids: ['traffic.credentialGap.wrongZoneShare'],
    buildingId: 'secure-tower',
    // **0, the control arm, rather than a larger share.** The observation below is a boolean, and
    // it has to differ between the base configuration and the probe: the base *is* the data's own
    // share, which already produces refusals here, so probing a bigger share would observe `true`
    // on both sides and assert nothing. Probing 0 is the one value that turns the quantity off,
    // which is what makes `not.toEqual(expected)` separate the two. Asserting a *count* instead
    // would pin a seed rather than a knob.
    probe: { credentialGap: { wrongZoneShare: 0 } },
    // The quantity the gap exists to move: legs whose own credential cannot reach the floor they
    // are going to. Zero under every configuration this repository shipped before § D265.
    observe: (config) => {
      const permitted = new Map<string, readonly string[]>();
      for (const zone of building('secure-tower').accessZones) {
        for (const floorId of zone.floors) {
          permitted.set(floorId, [...(permitted.get(floorId) ?? []), ...zone.credentialGroups]);
        }
      }
      return generateTrace(config).passengers.some((passenger) => {
        const groups = permitted.get(passenger.finalDestinationFloorId);
        if (groups === undefined) return false;
        return (
          passenger.credentialGroup === undefined || !groups.includes(passenger.credentialGroup)
        );
      });
    },
    expected: false,
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
  {
    ids: ['traffic.lunchTwoWay.durationS'],
    buildingId: 'midtown-office',
    probe: { template: 'lunch-two-way', templateOverrides: { durationS: 2400 } },
    observe: (config) => planDemand(config).template.durationS,
    expected: 2400,
  },
  {
    // Observed on the arc rather than on the field it was written into: the amplitude's whole job
    // is to move the mix at a time, and a probe that read the option back would pass on a template
    // that stored it and never applied it. 0.5 halves the distance from the period mean (0.45) to
    // the authored endpoint (0.90), so the mix at the end of the run is 0.675 outgoing.
    ids: ['traffic.lunchTwoWay.mixAmplitude'],
    buildingId: 'midtown-office',
    probe: { template: 'lunch-two-way', templateOverrides: { mixAmplitude: 0.5 } },
    observe: (config) => {
      const { template } = planDemand(config);
      return splitAt(template, 0)?.outgoing;
    },
    expected: 0.675,
  },

  /* ---- docs/14 § 2.2 — the group-size curve ------------------------------- */

  {
    // Observed on the *drawn* sizes, not on the field the option was written into. A weight vector
    // with a single non-zero entry admits exactly one group size, so a resolver that stored the
    // curve and drew from the profile's geometric anyway shows up as a set with several members.
    ids: ['traffic.batchSize.distribution'],
    buildingId: 'midtown-office',
    probe: { batchSize: { distribution: 'explicit', weights: [0, 1] } },
    observe: (config) => [
      ...new Set(generateTrace(config).arrivals.map((batch) => batch.passengers.length)),
    ],
    expected: [2],
  },
  {
    ids: ['traffic.batchSize.mean'],
    buildingId: 'midtown-office',
    probe: { batchSize: { distribution: 'geometric', mean: 4 } },
    // The plan's own mean, which is the number `batchesPerSecond` divides by. office-standard
    // declares 1.4, so the probe moves it and the batch rate with it.
    observe: (config) => planDemand(config).sources[0]?.meanBatchSize,
    expected: 4,
  },
  {
    // The vector's mean is **derived**, and this is the assertion that says so: `(1·3 + 2·1) / 4`
    // is 1.25, a number appearing nowhere in the configuration. A resolver that carried a mean
    // beside the weights, or that fell back to the profile's 1.4, fails here.
    ids: ['traffic.batchSize.weight'],
    buildingId: 'midtown-office',
    probe: { batchSize: { distribution: 'explicit', weights: [3, 1] } },
    observe: (config) => planDemand(config).sources[0]?.meanBatchSize,
    expected: 1.25,
  },

  /* ---- docs/14 § 2.1 — body mass ----------------------------------------- */

  {
    ids: ['traffic.passengerMass.distribution'],
    buildingId: 'midtown-office',
    probe: {
      passengerMass: {
        distribution: 'lognormal',
        meanKg: 75,
        stdDevKg: 15,
        minKg: 20,
        maxKg: 200,
      },
    },
    // The block the draw actually reads, resolved once in `planDemand` and passed to `drawMass`.
    // Not an echo of the option: `generateTrace` has no second path to a mass distribution.
    observe: (config) => planDemand(config).passengerMass.distribution,
    expected: 'lognormal',
  },
  {
    // A zero spread makes every passenger identical, so the observation is the drawn population
    // itself rather than the configuration: one distinct mass, and it is the one asked for.
    ids: ['traffic.passengerMass.meanKg'],
    buildingId: 'midtown-office',
    probe: {
      passengerMass: { distribution: 'normal', meanKg: 99, stdDevKg: 0, minKg: 20, maxKg: 200 },
    },
    observe: (config) => [
      ...new Set(generateTrace(config).passengers.map((passenger) => passenger.massKg)),
    ],
    expected: [99],
  },
  {
    ids: ['traffic.passengerMass.stdDevKg'],
    buildingId: 'midtown-office',
    probe: {
      passengerMass: { distribution: 'normal', meanKg: 75, stdDevKg: 0, minKg: 20, maxKg: 200 },
    },
    observe: (config) =>
      new Set(generateTrace(config).passengers.map((passenger) => passenger.massKg)).size,
    expected: 1,
  },
  {
    // The truncation is observed where it binds. A lower bound just under the mean clamps roughly
    // half the population onto itself, so the lightest passenger in the run *is* the bound — which
    // a resolver that dropped the bound could not produce.
    ids: ['traffic.passengerMass.minKg'],
    buildingId: 'midtown-office',
    probe: {
      passengerMass: { distribution: 'normal', meanKg: 75, stdDevKg: 15, minKg: 74.5, maxKg: 200 },
    },
    observe: (config) =>
      Math.min(...generateTrace(config).passengers.map((passenger) => passenger.massKg)),
    expected: 74.5,
  },
  {
    ids: ['traffic.passengerMass.maxKg'],
    buildingId: 'midtown-office',
    probe: {
      passengerMass: { distribution: 'normal', meanKg: 75, stdDevKg: 15, minKg: 20, maxKg: 75.5 },
    },
    observe: (config) =>
      Math.max(...generateTrace(config).passengers.map((passenger) => passenger.massKg)),
    expected: 75.5,
  },

  /* ---- docs/14 § 2.3 — inter-day variability ------------------------------ */

  {
    /*
     * A degenerate band — `min === max` — is what makes the multiplier *observable* rather than
     * merely present: the draw is then a constant, so the plan's headline rate is the profile's
     * own rate times exactly 1.6 and the assertion is arithmetic rather than a range check.
     * Observed on the plan's rate, which is what `batchesPerSecond` and every expected-passenger
     * figure are computed from, not on the field the option was written into. `midtown-office`'s
     * office-standard profile runs 12 %/5 min over 1 710 people; 1.6x is 19.2 %.
     *
     * The band's two ends are separated by the probe below, so this row and that one together
     * cover both ids without either being an echo of the other.
     */
    ids: ['traffic.dayVariation.minDemandFactor'],
    buildingId: 'midtown-office',
    probe: { dayVariation: { minDemandFactor: 1.6, maxDemandFactor: 1.6 } },
    observe: (config) =>
      Number((planDemand(config, drawDayFor(config)).peakPassengersPerSecond * 300).toPrecision(9)),
    expected: Number(((19.2 / 100) * 1710).toPrecision(9)),
  },
  {
    /*
     * The upper end moved on its own, with the lower end held at the row above's value. A
     * resolver that read only `minDemandFactor` — or that averaged the two — produces 1.6 here.
     * `nextFloat()` on this seed's `dayVariation` stream is a fixed number in `[0, 1)`, so the
     * drawn factor is a deterministic point strictly inside the band and strictly above its
     * lower end, which is all this probe needs to assert.
     */
    ids: ['traffic.dayVariation.maxDemandFactor'],
    buildingId: 'midtown-office',
    probe: { dayVariation: { minDemandFactor: 1.6, maxDemandFactor: 2.6 } },
    observe: (config) => planDemand(config, drawDayFor(config)).peakPassengersPerSecond > 1.6 * BASE_MIDTOWN_RATE,
    expected: true,
  },
  {
    /*
     * Observed on the template's geometry rather than on the option, for
     * `traffic.lunchTwoWay.mixAmplitude`'s reason: a resolver that stored the bound and never
     * shifted anything would pass a read-back. A non-zero bound moves the measurement window off
     * the 750 s the un-shifted rise-and-fall puts it at, and the shift is signed, so the
     * assertion is that it moved rather than which way.
     */
    ids: ['traffic.dayVariation.peakShiftS'],
    buildingId: 'midtown-office',
    probe: { dayVariation: { minDemandFactor: 1, maxDemandFactor: 1, peakShiftS: 200 } },
    observe: (config) => planDemand(config, drawDayFor(config)).template.reportWindowStartS !== 750,
    expected: true,
  },
];

/** `midtown-office`'s own peak rate, passengers/second, with no day variation applied. */
const BASE_MIDTOWN_RATE = (12 / 100) * 1710 / 300;

/**
 * The day this config's seed draws, taken through the shipped path rather than recomputed.
 *
 * `drawDayVariation` is module-private in `generator.ts` — deliberately, since `generateTrace` is
 * its only caller and an exported draw helper would be a seam nothing calls. So the probe reaches
 * it the way a run does: generate the trace and read back what the run recorded it drew. That also
 * makes these three rows assertions about `generateTrace`'s wiring and not only about `planDemand`.
 */
function drawDayFor(config: TrafficConfig): ResolvedDayVariation | undefined {
  return generateTrace(config).dayVariation;
}

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
