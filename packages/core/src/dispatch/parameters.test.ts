import { describe, expect, it } from 'vitest';

import { dispatcherProfileSchema } from '../config/schema.js';
import { LOAD_SENSOR_PARAMETERS } from '../model/car/loadSensor.js';
import { DOOR_PARAMETERS } from '../physics/doors/types.js';

import { NORMALIZATION_DEFAULTS } from './normalize.js';
import {
  DISPATCH_DEFAULTS,
  DISPATCH_PARAMETERS,
  DISPATCH_PARAMETER_IDS,
  activeWhenSatisfied,
  dispatchParameter,
  dispatchParameterValue,
  isActiveWhenRange,
  isParameterActive,
  tunablePathsOf,
} from './parameters.js';
import { resolveAuctionConfig } from './policies/auction.js';
import { POLICY_PARAMETERS, policyParameter } from './policies/parameters.js';
import type { AuctionProfileSource } from './policies/types.js';
import { createDispatchPolicy, resolveDispatchConfig } from './policy.js';
import { resolvePredictorConfig } from './predictor/arrivalModel.js';
import {
  PREDICTOR_PARAMETERS,
  PREDICTOR_PARAMETER_IDS,
  predictorParameter,
  predictorParameterValue,
} from './predictor/parameters.js';
import type { PredictorIdleSource } from './predictor/types.js';
import { COST_TERMS, costTerm } from './terms/index.js';
import type { WeightSetSource } from './selector.js';
import type {
  DispatchParameterSpec,
  DispatcherProfileSource,
  ResolvedDispatchConfig,
} from './types.js';

/**
 * Every dispatch tunable this package declares, in one list.
 *
 * The three schemas partition by module — the lifecycle's, the aggregation's, the arrival
 * model's — but they share one namespace of dotted profile paths and one `activeWhen` namespace,
 * so the contracts that are about the *namespace* have to be asserted over the union. Checking
 * each file against itself is how `auction.reserveMarginalDelayS` came to gate on an id no rule
 * in its own file could see.
 */
const EVERY_PARAMETER: readonly DispatchParameterSpec[] = Object.freeze([
  ...DISPATCH_PARAMETERS,
  ...POLICY_PARAMETERS,
  ...PREDICTOR_PARAMETERS,
]);

/** A declared parameter by id, whichever of the three schemas declares it. */
const declared = (id: string): DispatchParameterSpec | undefined =>
  dispatchParameter(id) ?? policyParameter(id) ?? predictorParameter(id);

/**
 * A profile whose every tunable differs from its default, with `normalization` supplied as an
 * override so this fixture also exercises the `overrides > profile > defaults` precedence. Both
 * sections it once could only reach through options — `eligibility` and `normalization` — are
 * authorable now, and the authorability suite below proves that per id.
 *
 * Every value here is deliberately *not* the default: an assertion that a probe survives is
 * worthless if the probe happens to equal what the resolver would have produced anyway.
 */
const PROBE_PROFILE: DispatcherProfileSource = {
  id: 'probe',
  name: 'Probe',
  // All thirteen, each a different value: the schema derives one row per implemented term, and a
  // probe that skipped a term would not notice a row wired to the wrong weight. `callType` below
  // is `mobile-credential` deliberately — it is what makes `weights.rideTime`'s `activeWhen`
  // satisfied — and `eligibility.enRouteDiversion` does the same for `weights.diversionDetour`, so
  // the probe is taken in the configuration where every weight is live.
  weights: {
    waitTime: 0.55,
    rideTime: 0.35,
    detourPenalty: 0.45,
    diversionDetour: 0.15,
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
    passengerAssignment: 'panel',
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
    enRouteDiversion: true,
    maxLoadFactorForAssignment: 0.65,
  },
  answer: { allowBypassIfSoleEligibleCar: true },
  idle: {
    parkingStrategy: 'zone-center',
    parkingFloorIndex: 3,
    repositionThresholdS: 17,
    repositionEnergyWeight: 1.4,
  },
  // Stage 3's weight-set selection, at `contextual` so all six rows are live at once: the three
  // gains and the margin gate on that value and would otherwise be probed in a configuration
  // where they cannot be read, which is the same hole `dispatch.callType: 'mobile-credential'`
  // above closes for `weights.rideTime`.
  selection: {
    policy: 'contextual',
    hysteresisS: 45,
    observationWindowS: 240,
    lobbyArrivalRateGain: 1.5,
    interfloorRateGain: 2.5,
    downPeakRateGain: 0.5,
    switchMargin: 0.35,
  },
};

/**
 * A one-arm weight-set library, so the probe profile's `selection.policy` resolves.
 *
 * `resolveWeightSets` refuses a profile that asks for a selector with no library — a dispatcher
 * that declares it switches weight sets and has none to switch between does not switch — so the
 * probe has to supply one. Deliberately minimal: this suite is about the six declared scalars,
 * and the arms are not among them.
 */
const PROBE_WEIGHT_SETS: WeightSetSource = {
  patternSwitching: {
    patternDetector: {
      type: 'fuzzy',
      inputs: ['lobbyArrivalRate'],
      patterns: ['busy'],
      hysteresisS: 30,
      membership: { busy: { lobbyArrivalRate: [0, 0.01] } },
    },
    weightSetsByPattern: { busy: 'probe-arm' },
  },
  weightsByProfileId: new Map([['probe-arm', new Map([['waitTime', 1]])]]),
};

/** The value each probed parameter should come back as. */
const PROBE_VALUES: ReadonlyMap<string, number | string | boolean> = new Map<
  string,
  number | string | boolean
>([
  ['weights.waitTime', 0.55],
  ['weights.rideTime', 0.35],
  ['weights.detourPenalty', 0.45],
  ['weights.diversionDetour', 0.15],
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
  ['dispatch.passengerAssignment', 'panel'],
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
  // `true`, against a `false` default: the probe has to differ from the default or the assertion
  // that the value travelled from the profile to the field the engine reads would pass on a
  // profile that was never consulted at all.
  ['eligibility.enRouteDiversion', true],
  ['eligibility.maxLoadFactorForAssignment', 0.65],
  ['answer.allowBypassIfSoleEligibleCar', true],
  ['idle.parkingStrategy', 'zone-center'],
  ['idle.parkingFloorIndex', 3],
  ['idle.repositionThresholdS', 17],
  ['idle.repositionEnergyWeight', 1.4],
  ['selection.policy', 'contextual'],
  ['selection.hysteresisS', 45],
  ['selection.observationWindowS', 240],
  ['selection.lobbyArrivalRateGain', 1.5],
  ['selection.interfloorRateGain', 2.5],
  ['selection.downPeakRateGain', 0.5],
  ['selection.switchMargin', 0.35],
]);

const PROBED: ResolvedDispatchConfig = resolveDispatchConfig(PROBE_PROFILE, {
  normalization: { waitTimeS: 95, distanceM: 44 },
  weightSets: PROBE_WEIGHT_SETS,
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
    //
    // Asserted over **all three** dispatch schemas at once, because a gate crosses them:
    // `auction.reserveMarginalDelayS` in POLICY_PARAMETERS gates on `auction.rounds` in the same
    // file and on nothing in this one, and a rule checked per-file would let a gate name an id no
    // schema declares as long as it did so from the right file.
    for (const parameter of EVERY_PARAMETER) {
      for (const [conditionId, condition] of Object.entries(parameter.activeWhen ?? {})) {
        const where = `${parameter.id} → ${conditionId}`;
        const gate = declared(conditionId);
        expect(gate, where).toBeDefined();

        if (isActiveWhenRange(condition)) {
          // The numeric form. It exists because `auction.rounds` is an integer with a range and
          // no `values`, so no list of strings can say "live at two rounds and above".
          expect(gate?.type, `${where} is not a numeric gate`).toMatch(/^(?:integer|continuous)$/);
          const [low, high] = gate?.range as readonly [number, number];
          expect(condition.min !== undefined || condition.max !== undefined, where).toBe(true);
          if (condition.min !== undefined && condition.max !== undefined) {
            expect(condition.min, where).toBeLessThanOrEqual(condition.max);
          }
          // A gate that admits both ends of the gate's own range can never be false, which reads
          // as a condition and is decoration. One that admits neither disables the knob forever.
          expect(activeWhenSatisfied(condition, low) && activeWhenSatisfied(condition, high), where)
            .toBe(false);
          expect(activeWhenSatisfied(condition, low) || activeWhenSatisfied(condition, high), where)
            .toBe(true);
          continue;
        }

        // The value-list form gates a **categorical or a boolean**. A boolean is a categorical
        // with two values that the schema does not bother to enumerate — `weights.diversionDetour`
        // gates on `eligibility.enRouteDiversion`, and `activeWhenSatisfied` already compares
        // `String(value)`, so the only thing missing was the admissible set. Supplying it here
        // keeps both properties below meaningful rather than exempting the boolean case.
        expect(gate?.type, where).toMatch(/^(?:categorical|boolean)$/);
        const admissible = gate?.type === 'boolean' ? ['true', 'false'] : (gate?.values ?? []);
        expect(condition.length, where).toBeGreaterThan(0);
        for (const value of condition) {
          expect(admissible, `${where}=${value}`).toContain(value);
          expect(activeWhenSatisfied(condition, value), `${where}=${value}`).toBe(true);
        }
        // And it does gate: a value the gate admits that this condition does not must exist, or
        // the condition is satisfied by every configuration and is not a condition.
        const excluded = admissible.filter((value) => !condition.includes(value));
        expect(excluded.length, `${where} admits every value the gate can take`).toBeGreaterThan(0);
      }
    }
  });

  it('is one evaluation rule, not one per form', () => {
    // The property CLAUDE.md invariant 8 turns on: an optimizer implements `activeWhenSatisfied`
    // once and every gate in every dispatch schema evaluates through it. Both forms, and the two
    // ways a read can fail.
    expect(activeWhenSatisfied(['deferred'], 'deferred')).toBe(true);
    expect(activeWhenSatisfied(['deferred'], 'immediate')).toBe(false);
    expect(activeWhenSatisfied(['true'], true)).toBe(true);
    expect(activeWhenSatisfied({ min: 2 }, 2)).toBe(true);
    expect(activeWhenSatisfied({ min: 2 }, 1)).toBe(false);
    expect(activeWhenSatisfied({ min: 2, max: 4 }, 5)).toBe(false);
    expect(activeWhenSatisfied({ max: 4 }, -1)).toBe(true);
    // A gate that could not be read is never satisfied. Guessing would silently activate a knob
    // whose condition nobody evaluated.
    expect(activeWhenSatisfied({ min: 2 }, undefined)).toBe(false);
    expect(activeWhenSatisfied({ min: 2 }, 'contract-net')).toBe(false);
    expect(activeWhenSatisfied(['contract-net'], undefined)).toBe(false);
    expect(activeWhenSatisfied({ min: 2 }, Number.NaN)).toBe(false);

    // A parameter with no activeWhen is always live; a conjunction needs every condition.
    expect(isParameterActive(dispatchParameter('dispatch.callType') as DispatchParameterSpec, () =>
      undefined,
    )).toBe(true);
    const deferWindow = dispatchParameter('dispatch.deferWindowS') as DispatchParameterSpec;
    expect(isParameterActive(deferWindow, () => 'deferred')).toBe(true);
    expect(isParameterActive(deferWindow, () => 'immediate')).toBe(false);
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

    // And it is one of exactly two. Every other term prices something a bare up/down button
    // already knows, so withholding or gating it would hide a live dimension. The second is
    // `weights.diversionDetour`, gated on `eligibility.enRouteDiversion` for the same reason in a
    // different stage: with diversion off, no snapshot carries a commit point, the term is zero
    // for every car, and its weight is a dimension an optimizer would search for nothing
    // (`DECISIONS.md` § D210, § D211).
    const gated = DISPATCH_PARAMETERS.filter(
      (parameter) => parameter.id.startsWith('weights.') && parameter.activeWhen !== undefined,
    ).map((parameter) => parameter.id);
    expect(gated).toEqual(['weights.rideTime', 'weights.diversionDetour']);
  });

  it('carries a partly-conditional term’s condition into its weight’s description', () => {
    /*
     * The declaration that is deliberately **not** a gate, and the assertion that it reaches a
     * schema consumer anyway.
     *
     * `weights.stopCount` is live under every call type — `energy-aware` and
     * `predictive-balanced` weight it at `up-down-buttons` today, and
     * `sim/searchSpaceLiveness.test.ts` measured it still moving a run there — so gating it would
     * hide a live region, which is the one error `activeWhen` exists to make impossible. What is
     * conditional is *what the term prices*, not *whether the dimension is worth searching*, and
     * the honest place for that is the row's prose: docs/06 calls `description` the part of the
     * schema a search reads to decide where to spend budget.
     *
     * Derived from `term.partiallyActiveWhen` in both directions, so a thirteenth term declaring
     * one gets the same treatment with no edit here, and deleting the fold-in turns this red.
     */
    const declared = COST_TERMS.filter((term) => term.partiallyActiveWhen !== undefined);
    expect(declared.map((term) => term.id), 'no term declares partiallyActiveWhen').not.toEqual([]);

    for (const term of declared) {
      const row = dispatchParameter(`weights.${term.id}`);
      expect(row, `weights.${term.id} is not declared`).toBeDefined();
      // Not a gate: an optimizer must keep searching this dimension on both sides.
      expect(row?.activeWhen, `weights.${term.id} is gated as well as partly conditional`)
        .toBeUndefined();
      for (const [gateId, values] of Object.entries(term.partiallyActiveWhen ?? {})) {
        expect(row?.description, `weights.${term.id} hides its condition on ${gateId}`).toContain(
          gateId,
        );
        for (const value of values) {
          expect(
            row?.description,
            `weights.${term.id} names ${gateId} without the value ${value}`,
          ).toContain(value);
        }
      }
      // The gate it names has to exist and admit the values, exactly as `activeWhen`'s does.
      for (const [gateId, values] of Object.entries(term.partiallyActiveWhen ?? {})) {
        const gate = dispatchParameter(gateId);
        expect(gate, `${term.id} names ${gateId}, which is not a declared parameter`).toBeDefined();
        for (const value of values) expect(gate?.values, gateId).toContain(value);
      }
    }
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
 * Authorability — the other half of invariant 8, in both directions
 * -------------------------------------------------------------------------- */

/**
 * A value inside the declared range or value set and **different from the default**, derived from
 * the spec alone.
 *
 * Generic on purpose: a hand-written probe table has to be extended when a row lands, and the row
 * that is forgotten is exactly the one nothing checks. Everything here is `type` plus `range` or
 * `values`, which is all docs/06 promises an optimizer.
 */
function probeFor(parameter: DispatchParameterSpec): number | string | boolean {
  if (parameter.type === 'boolean') return parameter.default !== true;
  if (parameter.type === 'categorical') {
    const other = (parameter.values ?? []).find((value) => value !== parameter.default);
    if (other === undefined) throw new Error(`${parameter.id} has one admissible value`);
    return other;
  }
  const [low, high] = parameter.range as readonly [number, number];
  const midpoint = parameter.type === 'integer' ? Math.round((low + high) / 2) : (low + high) / 2;
  if (midpoint !== parameter.default) return midpoint;
  return parameter.type === 'integer' ? (midpoint < high ? midpoint + 1 : midpoint - 1) : (low + midpoint) / 2;
}

/**
 * The profile a single probe is authored into, as JSON a `data/` file could hold verbatim.
 *
 * **Gates are satisfied from the spec, not by hand.** `activeWhen` is the machine-readable
 * statement of what a knob needs beside it to mean anything, and some of those pairings are
 * refused outright by the resolver rather than merely being inert — `dispatch.passengerAssignment:
 * "panel"` under an up/down button is a panel that cannot ask for a destination, which is a
 * contradiction and not a configuration. An optimizer writing a winner back into `data/` reads the
 * same `activeWhen` and writes the same accompanying values (`tuning/space/encode.ts` runs the
 * real `createPolicyFor` for exactly this reason), so authoring the probe any other way would be
 * testing a round trip nothing performs.
 */
function profileWith(id: string, probe: number | string | boolean): Record<string, unknown> {
  const base: Record<string, unknown> = { id: 'probe', name: 'Probe', weights: {} };
  const spec = EVERY_PARAMETER.find((parameter) => parameter.id === id);
  for (const [gateId, condition] of Object.entries(spec?.activeWhen ?? {})) {
    // List-form conditions only: a range condition names a numeric window rather than a value,
    // and every gate in the schema that a resolver *refuses* is categorical.
    if (condition === undefined || isActiveWhenRange(condition)) continue;
    const value = condition[0];
    if (value === undefined) continue;
    const gateDot = gateId.indexOf('.');
    const gateSection = gateId.slice(0, gateDot);
    const gateKey = gateId.slice(gateDot + 1);
    if (gateSection === 'weights' || gateSection === 'constraints') continue;
    // A condition is a list of **strings** whatever the gate's runtime type, because
    // `activeWhenSatisfied` compares `String(value)`. Authoring `"true"` into a boolean field
    // would be a profile the real schema rejects, so the string is turned back into the value the
    // gate actually holds — the round trip this function exists to test is the authored one.
    const gateType = EVERY_PARAMETER.find((parameter) => parameter.id === gateId)?.type;
    const authored: string | boolean = gateType === 'boolean' ? value === 'true' : value;
    base[gateSection] = { ...((base[gateSection] ?? {}) as object), [gateKey]: authored };
  }
  const dot = id.indexOf('.');
  const section = id.slice(0, dot);
  const key = id.slice(dot + 1);
  if (section === 'weights') return { ...base, weights: { [key]: probe } };
  // The one declared parameter whose authored form is not its dotted path: a hard constraint is a
  // named rule in a list, because `hardConstraints` is a set and `constraints.*` is the boolean
  // per member that a generic optimizer can actually sample. `parameters.ts` records the trade.
  if (section === 'constraints') {
    return { ...base, hardConstraints: probe === true ? [key] : [] };
  }
  return { ...base, [section]: { ...((base[section] ?? {}) as object), [key]: probe } };
}

/**
 * Read a probe back out of whichever resolver owns the section.
 *
 * The parsed profile is passed as the raw parsed object rather than as one interface, because the
 * three resolvers declare three structural views of it — `DispatcherProfileSource`,
 * `AuctionProfileSource`, `PredictorIdleSource` — and the point of the test is that one authored
 * JSON object satisfies all three.
 */
function readBack(
  id: string,
  profile: Readonly<Record<string, unknown>>,
): number | string | boolean | undefined {
  if (id.startsWith('auction.')) {
    const resolved = resolveAuctionConfig(profile as unknown as AuctionProfileSource, {});
    const key = id.slice('auction.'.length);
    return (resolved.auction as unknown as Readonly<Record<string, number | string>>)[key];
  }
  if (PREDICTOR_PARAMETER_IDS.has(id)) {
    return predictorParameterValue(
      resolvePredictorConfig(profile['idle'] as PredictorIdleSource | undefined),
      id,
    );
  }
  // The library goes in for every id, not only the `selection.*` ones: a profile whose
  // `selection.policy` gate was satisfied from the spec (`profileWith` above) asks for a selector
  // whatever knob is being probed, and `resolveWeightSets` refuses one with nothing to select
  // between. Supplying it unconditionally is what keeps the gate satisfaction machine-derived.
  return dispatchParameterValue(
    resolveDispatchConfig(profile as unknown as DispatcherProfileSource, {
      weightSets: PROBE_WEIGHT_SETS,
    }),
    id,
  );
}

describe('every declared tunable is authorable as a profile, and every authorable field is declared', () => {
  it('parses a probe for every declared id through the real profile schema and reads it back', () => {
    // The round trip an optimizer performs at the end of a search: take the winner, write it into
    // `data/dispatcher-profiles.json`, load it. A parameter it can sample but not persist is a
    // dimension it searched for nothing, which is the same defect as a declared-but-unread knob
    // arriving one step later.
    //
    // This used to be false for six of the declared ids. Four predictor rows were rejected by
    // `idleStageSchema` as unrecognized keys and landed in Phase 5's wiring step; `eligibility.*`
    // had no section in the profile schema at all and `normalization.*` had none either, so both
    // could only be reached through `DispatchPolicyOptions` — searchable, unpersistable. All three
    // sections exist now, and this test is the reason they cannot quietly stop existing.
    for (const parameter of EVERY_PARAMETER) {
      const probe = probeFor(parameter);
      expect(probe, `${parameter.id}: probe equals its default`).not.toEqual(parameter.default);

      const authored = profileWith(parameter.id, probe);
      const parsed = dispatcherProfileSchema.safeParse(authored);
      expect(
        parsed.success,
        `${parameter.id} is not authorable: ${JSON.stringify(authored)} → ${parsed.error?.issues[0]?.message ?? ''}`,
      ).toBe(true);

      const profile = parsed.data as Readonly<Record<string, unknown>>;
      expect(readBack(parameter.id, profile), `${parameter.id} did not survive the round trip`)
        .toEqual(probe);
    }
  });

  it('declares every field the profile schema admits — nothing authorable is invisible', () => {
    // The reverse direction, derived from the schema rather than from a list, so a section that
    // gains a field fails here until something declares it. A field an optimizer can write but
    // never sample is a knob whose value the tuned result silently depends on.
    const sections = [
      'normalization',
      'dispatch',
      'eligibility',
      'answer',
      'idle',
      'auction',
      'selection',
    ];
    const undeclared: string[] = [];
    for (const section of sections) {
      const field = (dispatcherProfileSchema.shape as Readonly<Record<string, unknown>>)[section];
      expect(field, `dispatcherProfileSchema has no ${section} section`).toBeDefined();
      const shape = (field as unknown as { unwrap: () => { shape: Record<string, unknown> } })
        .unwrap().shape;
      for (const key of Object.keys(shape)) {
        if (key === '$comment') continue;
        const id = `${section}.${key}`;
        if (declared(id) !== undefined) continue;
        undeclared.push(id);
      }
    }
    // The only authorable dispatch fields no dispatch schema declares, each because **another**
    // schema owns the number and two declarations of one knob is two sources of truth. Asserted as
    // an exact set, so a field that stops being owned elsewhere shows up here rather than nowhere.
    // Every one of them is declared by `DOOR_PARAMETERS` or `LOAD_SENSOR_PARAMETERS`, checked
    // below rather than asserted by comment.
    expect(undeclared.sort()).toStrictEqual(
      [
        // LOAD_SENSOR_PARAMETERS: the load cell owns them; the dispatcher reads their effect.
        'answer.bypassLoadThreshold',
        'answer.overloadThreshold',
        // DOOR_PARAMETERS: the door machine implements dwell and the reopen budget.
        'answer.dwellAdaptationGain',
        'answer.dwellPolicy',
        'answer.maxDwellS',
        'answer.maxReopensPerStop',
        'answer.maxTransferSeconds',
        'answer.reopenOnLateArrival',
      ].sort(),
    );
    const elsewhere = new Set([
      ...DOOR_PARAMETERS.map((parameter) => parameter.id),
      ...LOAD_SENSOR_PARAMETERS.map((parameter) => parameter.id),
    ]);
    for (const id of undeclared) {
      expect(elsewhere.has(id), `${id} is authorable and no schema at all declares it`).toBe(true);
    }
  });

  it('makes the answer-stage ids another schema owns authorable too', () => {
    // Same defect, one module over, and `config/schema.ts` is where both halves of it live.
    // `physics/doors/types.ts` recorded that `answerStageSchema` listed neither
    // `answer.maxReopensPerStop` nor `answer.maxTransferSeconds` while `resolveDoorConfig` read
    // both off `DoorAnswerSource` — which is `profile.answer` verbatim, handed to every `Car` the
    // run builds. So they were live knobs, declared by `DOOR_PARAMETERS`, samplable only through
    // an options object. A dotted id is a promise that a profile can hold the value, whichever
    // schema declares the row.
    for (const parameter of [...DOOR_PARAMETERS, ...LOAD_SENSOR_PARAMETERS]) {
      if (!parameter.id.startsWith('answer.')) continue; // `car.*` ids are authored on a car
      const probe = probeFor(parameter);
      const parsed = dispatcherProfileSchema.safeParse(profileWith(parameter.id, probe));
      expect(
        parsed.success,
        `${parameter.id} is declared as an answer-stage id and no profile can hold it: ${parsed.error?.issues[0]?.message ?? ''}`,
      ).toBe(true);
    }
  });

  it('authors a hard constraint as a named rule, which is the one id that is not its own path', () => {
    // `constraints.noDirectionReversal` is declared as a boolean because a set-valued parameter is
    // not something a generic optimizer can sample. It is authored as a membership in
    // `hardConstraints`, and the mapping is one line in `profileWith` above — recorded here so the
    // exception is a documented translation rather than an id that quietly fails to round-trip.
    const on = dispatcherProfileSchema.parse(profileWith('constraints.noDirectionReversal', true));
    const off = dispatcherProfileSchema.parse(profileWith('constraints.noDirectionReversal', false));
    expect(dispatchParameterValue(resolveDispatchConfig(on as never), 'constraints.noDirectionReversal')).toBe(true);
    expect(dispatchParameterValue(resolveDispatchConfig(off as never), 'constraints.noDirectionReversal')).toBe(false);
  });

  it('still rejects a misspelled knob rather than defaulting it', () => {
    // Strictness is what makes the round trip meaningful: a section that accepted anything would
    // pass the test above for a parameter nothing reads.
    for (const authored of [
      { idle: { repositionThreshold: 3 } },
      { eligibility: { maxLoadFactor: 0.5 } },
      { normalization: { waitTime: 60 } },
      { auction: { round: 3 } },
    ]) {
      const parsed = dispatcherProfileSchema.safeParse({
        id: 'probe',
        name: 'Probe',
        weights: {},
        ...authored,
      });
      expect(parsed.success, JSON.stringify(authored)).toBe(false);
      expect(parsed.error?.issues[0]?.message).toMatch(/Unrecognized key/);
    }
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
