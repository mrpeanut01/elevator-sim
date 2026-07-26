import { describe, expect, it } from 'vitest';

import { NORMALIZATION_DEFAULTS } from './normalize.js';
import {
  DISPATCH_DEFAULTS,
  DISPATCH_PARAMETERS,
  DISPATCH_PARAMETER_IDS,
  dispatchParameter,
  dispatchParameterValue,
  tunablePathsOf,
} from './parameters.js';
import { createDispatchPolicy, resolveDispatchConfig } from './policy.js';
import { COST_TERMS, costTerm } from './terms/index.js';
import type { DispatcherProfileSource, ResolvedDispatchConfig } from './types.js';

/**
 * A profile whose every tunable differs from its default, plus the option overrides for the
 * sections `config/schema.ts` does not carry yet.
 *
 * Every value here is deliberately *not* the default: an assertion that a probe survives is
 * worthless if the probe happens to equal what the resolver would have produced anyway.
 */
const PROBE_PROFILE: DispatcherProfileSource = {
  id: 'probe',
  name: 'Probe',
  // All twelve, each a different value: the schema derives one row per implemented term, and a
  // probe that skipped a term would not notice a row wired to the wrong weight. `callType` below
  // is `mobile-credential` deliberately — it is what makes `weights.rideTime`'s `activeWhen`
  // satisfied, so the probe is taken in the configuration where every weight is live.
  weights: {
    waitTime: 0.55,
    rideTime: 0.35,
    detourPenalty: 0.45,
    existingCallDelay: 0.65,
    directionReversal: 0.2,
    loadFactor: 0.75,
    stopCount: 0.85,
    distanceTravelled: 0.25,
    starvation: 0.95,
    zoneAffinity: 1.05,
    predictedDemand: 1.15,
    crowding: 1.35,
  },
  hardConstraints: ['noDirectionReversal'],
  dispatch: {
    callType: 'mobile-credential',
    batchWindowS: 1.25,
    assignmentTiming: 'deferred',
    deferWindowS: 2.5,
    assignmentMode: 'split-demand',
    splitThresholdPassengers: 7,
    reassignmentPolicy: 'continuous',
    commitmentPoint: 'on-door-open',
    reassignmentHysteresisS: 11.5,
    maxReassignmentsPerCall: 6,
  },
  eligibility: {
    allowOppositeDirectionPickup: false,
    maxLoadFactorForAssignment: 0.65,
  },
  answer: { allowBypassIfSoleEligibleCar: true },
  idle: {
    parkingStrategy: 'zone-center',
    repositionThresholdS: 17,
    repositionEnergyWeight: 1.4,
  },
};

/** The value each probed parameter should come back as. */
const PROBE_VALUES: ReadonlyMap<string, number | string | boolean> = new Map<
  string,
  number | string | boolean
>([
  ['weights.waitTime', 0.55],
  ['weights.rideTime', 0.35],
  ['weights.detourPenalty', 0.45],
  ['weights.existingCallDelay', 0.65],
  ['weights.directionReversal', 0.2],
  ['weights.loadFactor', 0.75],
  ['weights.stopCount', 0.85],
  ['weights.distanceTravelled', 0.25],
  ['weights.starvation', 0.95],
  ['weights.zoneAffinity', 1.05],
  ['weights.predictedDemand', 1.15],
  ['weights.crowding', 1.35],
  ['normalization.waitTimeS', 95],
  ['normalization.distanceM', 44],
  ['constraints.noDirectionReversal', true],
  ['dispatch.callType', 'mobile-credential'],
  ['dispatch.batchWindowS', 1.25],
  ['dispatch.assignmentTiming', 'deferred'],
  ['dispatch.deferWindowS', 2.5],
  ['dispatch.assignmentMode', 'split-demand'],
  ['dispatch.splitThresholdPassengers', 7],
  ['dispatch.reassignmentPolicy', 'continuous'],
  ['dispatch.commitmentPoint', 'on-door-open'],
  ['dispatch.reassignmentHysteresisS', 11.5],
  ['dispatch.maxReassignmentsPerCall', 6],
  ['eligibility.allowOppositeDirectionPickup', false],
  ['eligibility.maxLoadFactorForAssignment', 0.65],
  ['answer.allowBypassIfSoleEligibleCar', true],
  ['idle.parkingStrategy', 'zone-center'],
  ['idle.repositionThresholdS', 17],
  ['idle.repositionEnergyWeight', 1.4],
]);

const PROBED: ResolvedDispatchConfig = resolveDispatchConfig(PROBE_PROFILE, {
  normalization: { waitTimeS: 95, distanceM: 44 },
});

const DEFAULTED: ResolvedDispatchConfig = resolveDispatchConfig({
  id: 'bare',
  name: 'Bare',
  weights: {},
});

/* -------------------------------------------------------------------------- *
 * Shape
 * -------------------------------------------------------------------------- */

describe('the parameter schema is well formed', () => {
  it('declares a unique id for every parameter', () => {
    const ids = DISPATCH_PARAMETERS.map((parameter) => parameter.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DISPATCH_PARAMETER_IDS.size).toBe(ids.length);
  });

  it('bounds every parameter the way its type requires', () => {
    for (const parameter of DISPATCH_PARAMETERS) {
      const where = parameter.id;
      expect(parameter.description.length, where).toBeGreaterThan(20);

      if (parameter.type === 'continuous' || parameter.type === 'integer') {
        expect(parameter.range, where).toBeDefined();
        const [min, max] = parameter.range as readonly [number, number];
        expect(max, where).toBeGreaterThan(min);
        expect(typeof parameter.default, where).toBe('number');
        expect(parameter.default as number, where).toBeGreaterThanOrEqual(min);
        expect(parameter.default as number, where).toBeLessThanOrEqual(max);
        if (parameter.type === 'integer') {
          expect(Number.isInteger(parameter.default as number), where).toBe(true);
        }
      }

      if (parameter.type === 'categorical') {
        expect(parameter.values, where).toBeDefined();
        expect(parameter.values, where).toContain(parameter.default);
        expect(parameter.range, where).toBeUndefined();
      }

      if (parameter.type === 'boolean') {
        expect(typeof parameter.default, where).toBe('boolean');
        expect(parameter.range, where).toBeUndefined();
        expect(parameter.values, where).toBeUndefined();
      }
    }
  });

  it('makes every activeWhen condition satisfiable by another declared parameter', () => {
    // An optimizer skips a parameter whose activeWhen is unmet. A condition naming a
    // parameter that does not exist, or a value that parameter cannot take, would either
    // disable the knob forever or be ignored — both silently.
    for (const parameter of DISPATCH_PARAMETERS) {
      for (const [conditionId, values] of Object.entries(parameter.activeWhen ?? {})) {
        const gate = dispatchParameter(conditionId);
        expect(gate, `${parameter.id} → ${conditionId}`).toBeDefined();
        expect(gate?.type, `${parameter.id} → ${conditionId}`).toBe('categorical');
        expect(values.length).toBeGreaterThan(0);
        for (const value of values) {
          expect(gate?.values, `${parameter.id} → ${conditionId}=${value}`).toContain(value);
        }
      }
    }
  });

  it('declares one weight per implemented term and no more', () => {
    const weightIds = DISPATCH_PARAMETERS.filter((parameter) =>
      parameter.id.startsWith('weights.'),
    ).map((parameter) => parameter.id);
    expect(weightIds).toEqual(COST_TERMS.map((term) => `weights.${term.id}`));
  });

  it('finds a parameter by id and reports an unknown one as absent', () => {
    expect(dispatchParameter('dispatch.batchWindowS')?.type).toBe('continuous');
    expect(dispatchParameter('dispatch.nonsense')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * Completeness — CLAUDE.md invariant 8, in both directions
 * -------------------------------------------------------------------------- */

describe('the schema and the engine agree about what is tunable', () => {
  it('declares every tunable the engine reads — nothing hidden', () => {
    // A knob the engine reads but does not declare is invisible to Phase 7's optimizer, which
    // would then report a winner that is only optimal at whatever the hidden value happened
    // to be.
    for (const path of tunablePathsOf(PROBED)) {
      expect(DISPATCH_PARAMETER_IDS.has(path), `undeclared tunable: ${path}`).toBe(true);
    }
  });

  it('reads every parameter it declares — nothing spurious', () => {
    // A declared parameter nothing reads is worse than useless: the optimizer spends real
    // replications, 50 to 200 each, discovering that a dimension does nothing, and a noisy
    // objective will happily attribute a difference to it anyway.
    const read = new Set(tunablePathsOf(PROBED));
    for (const parameter of DISPATCH_PARAMETERS) {
      expect(read.has(parameter.id), `declared but unread: ${parameter.id}`).toBe(true);
    }
  });

  it('carries a probe value from a profile through to the field the engine reads', () => {
    // The strong form: it is not enough that the id exists on both sides, the value has to
    // arrive. Every probe differs from its default, so an id wired to the wrong field fails.
    for (const parameter of DISPATCH_PARAMETERS) {
      const expected = PROBE_VALUES.get(parameter.id);
      expect(expected, `no probe for ${parameter.id}`).toBeDefined();
      expect(expected, `probe for ${parameter.id} equals its default`).not.toEqual(
        parameter.default,
      );
      expect(dispatchParameterValue(PROBED, parameter.id), parameter.id).toEqual(expected);
    }
  });

  it('applies exactly the defaults it declares when a profile says nothing', () => {
    for (const parameter of DISPATCH_PARAMETERS) {
      if (parameter.id.startsWith('weights.')) {
        // A term a profile does not mention has no weight at all, which is the same decision
        // as a weight of zero and is what the declared default of 0 means.
        expect(dispatchParameterValue(DEFAULTED, parameter.id)).toBeUndefined();
        continue;
      }
      expect(dispatchParameterValue(DEFAULTED, parameter.id), parameter.id).toEqual(
        parameter.default,
      );
    }
  });

  it('quotes the same default objects the resolver applies, not copies of the numbers', () => {
    expect(dispatchParameter('normalization.waitTimeS')?.default).toBe(
      NORMALIZATION_DEFAULTS.waitTimeS,
    );
    expect(dispatchParameter('normalization.distanceM')?.default).toBe(
      NORMALIZATION_DEFAULTS.distanceM,
    );
    expect(dispatchParameter('dispatch.reassignmentHysteresisS')?.default).toBe(
      DISPATCH_DEFAULTS.reassignmentHysteresisS,
    );
    expect(dispatchParameter('idle.repositionEnergyWeight')?.default).toBe(
      DISPATCH_DEFAULTS.repositionEnergyWeight,
    );
  });

  it('does not declare knobs no phase reads yet, or knobs another schema owns', () => {
    // `predictorHorizonS` and `predictorLearningRate` are declared by `PREDICTOR_PARAMETERS`, not
    // here, for the same reason the door and load-sensor knobs are declared by theirs: one source
    // of truth each, or an optimizer sees a dimension twice.
    //
    // The twelve `weights.*` rows are no longer on this list. All twelve terms are implemented and
    // `liveness.test.ts` proves each can change a decision through `policy.score()`, which is the
    // condition for declaring a weight tunable at all. `weights.rideTime` is the one that needs a
    // qualifier, and it carries it as `activeWhen` rather than by being withheld.
    for (const absent of [
      'idle.predictorHorizonS',
      'idle.predictorLearningRate',
      // Owned by LOAD_SENSOR_PARAMETERS and DOOR_PARAMETERS: one source of truth each.
      'answer.bypassLoadThreshold',
      'answer.overloadThreshold',
      'answer.dwellPolicy',
      'answer.maxDwellS',
    ]) {
      expect(DISPATCH_PARAMETER_IDS.has(absent), `unexpectedly declared: ${absent}`).toBe(false);
    }
  });

  it('gates weights.rideTime on a call type that carries a destination', () => {
    // The condition CLAUDE.md invariant 8 exists for. Under `up-down-buttons` no landing call
    // carries a destination, `rideTime` returns 0 for every car, and its weight is one of twelve
    // dimensions an optimizer would search for nothing — against a measured resolution floor of
    // ~1.3 s, 8% of AWT, at n = 100. Declared by the term itself (`rideTimeTerm.activeWhen`) and
    // copied here by `WEIGHT_PARAMETERS`, so this file names no term of its own accord.
    const row = dispatchParameter('weights.rideTime');
    expect(row?.activeWhen).toEqual({
      'dispatch.callType': ['destination-entry', 'mobile-credential'],
    });
    expect(row?.activeWhen).toEqual(costTerm('rideTime')?.activeWhen);

    // And it is the only one: every other term prices something a bare up/down button already
    // knows, so withholding or gating it would hide a live dimension.
    const gated = DISPATCH_PARAMETERS.filter(
      (parameter) => parameter.id.startsWith('weights.') && parameter.activeWhen !== undefined,
    ).map((parameter) => parameter.id);
    expect(gated).toEqual(['weights.rideTime']);
  });

  it('reports an unknown id rather than guessing', () => {
    expect(dispatchParameterValue(PROBED, 'dispatch.nonsense')).toBeUndefined();
    expect(dispatchParameterValue(PROBED, 'nonsense.batchWindowS')).toBeUndefined();
    expect(dispatchParameterValue(PROBED, 'batchWindowS')).toBeUndefined();
  });

  it('surfaces every weight a profile carries, and only weights that are terms', () => {
    // This pinned the pre-Phase-5 state: `starvation` was declared, unimplemented, carried in
    // `pendingWeights`, and deliberately hidden from the schema so the optimizer would not search
    // a dead dimension. It is implemented now, so the honest assertion is the other one — a weight
    // a profile carries is both readable and declared, and nothing is quietly parked out of sight.
    const config = resolveDispatchConfig({
      id: 'p',
      name: 'P',
      weights: { waitTime: 1, starvation: 0.7 },
    });
    expect(dispatchParameterValue(config, 'weights.starvation')).toBe(0.7);
    expect(DISPATCH_PARAMETER_IDS.has('weights.starvation')).toBe(true);
    expect(config.pendingWeights.size).toBe(0);

    // A term id nothing implements is a typo, and `resolveDispatchConfig` throws on it rather than
    // scoring every car at zero. Reading one back is still `undefined`, not a guess.
    expect(dispatchParameterValue(config, 'weights.waitTiem')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * The optimizer's view
 * -------------------------------------------------------------------------- */

describe('a generic optimizer can drive the policy knowing nothing about elevators', () => {
  it('samples a valid configuration from the schema alone', () => {
    // The contract docs/06 § The parameter schema states: type plus range or values bound the
    // search, `default` gives a starting point, `id` is the path to write the winner back to.
    // Nothing below mentions a floor, a car or a call.
    const weights: Record<string, number> = {};
    const sections: Record<string, Record<string, number | string | boolean>> = {};

    for (const parameter of DISPATCH_PARAMETERS) {
      let sampled: number | string | boolean;
      if (parameter.type === 'boolean') {
        sampled = true;
      } else if (parameter.type === 'categorical') {
        sampled = (parameter.values ?? [])[0] as string;
      } else {
        const [min, max] = parameter.range as readonly [number, number];
        const midpoint = (min + max) / 2;
        sampled = parameter.type === 'integer' ? Math.round(midpoint) : midpoint;
      }

      const dot = parameter.id.indexOf('.');
      const section = parameter.id.slice(0, dot);
      const key = parameter.id.slice(dot + 1);
      if (section === 'weights') weights[key] = sampled as number;
      else (sections[section] ??= {})[key] = sampled;
    }

    const policy = createDispatchPolicy(
      {
        id: 'sampled',
        name: 'Sampled',
        weights,
        hardConstraints: sections['constraints']?.['noDirectionReversal'] === true
          ? ['noDirectionReversal']
          : [],
        dispatch: sections['dispatch'] as DispatcherProfileSource['dispatch'],
        eligibility: sections['eligibility'] as DispatcherProfileSource['eligibility'],
        answer: sections['answer'] as DispatcherProfileSource['answer'],
        idle: sections['idle'] as DispatcherProfileSource['idle'],
      },
      { normalization: sections['normalization'] as { waitTimeS: number; distanceM: number } },
    );

    // And every sampled value survived into the configuration the engine reads.
    for (const parameter of DISPATCH_PARAMETERS) {
      expect(dispatchParameterValue(policy.config, parameter.id), parameter.id).toBeDefined();
    }
    expect(policy.parameters).toBe(DISPATCH_PARAMETERS);
  });

  it('exposes the schema on every policy, whatever profile built it', () => {
    const policy = createDispatchPolicy({ id: 'p', name: 'P', weights: { waitTime: 1 } });
    expect(policy.parameters.length).toBe(DISPATCH_PARAMETERS.length);
  });
});
