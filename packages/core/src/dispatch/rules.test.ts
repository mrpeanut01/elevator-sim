/**
 * The Everyday rules — GAMEPLAY_AND_NAVIGATION.md §11.5 compiled onto the weight-set selector.
 *
 * Four families, and the last is the one that earns the file its place:
 *
 * 1. **Resolution refusals** — the `resolveWeightSets` posture, row by row: unknown ids,
 *    out-of-list values, invalid pairings, duplicated static rows, and rows authored under a
 *    policy that never reads them.
 * 2. **Per-condition truth** — each of the nine conditions over hand-built observations,
 *    including the midtown P1/G entrance regression re-pinned for the lobby queue, the
 *    wraps-midnight window, the quiet-stretch complement, and the clockless crowd.
 * 3. **Selection semantics** — first match wins, ordering decides, release-on-no-match behind
 *    the shared dwell, and the fallback's **object identity** with the profile's own weights.
 * 4. **Moved controls** — § D112's anti-inertness rule, per buildable action: for each of the
 *    eight shipped actions a guaranteed-true rule changes a real run at a named measured cell,
 *    compared on the legs (§ D177), with `spread-out` — the zone-context inertness trap the
 *    design flagged — measured like the rest rather than argued.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { resolveCar } from '../config/resolveCar.js';
import { dispatcherProfileSchema } from '../config/schema.js';
import type { ElevatorSpecs, LoadedConfig, ResolvedCar } from '../config/types.js';
import { Car } from '../model/car/car.js';
import { createShaft, type CarShaft, type CarSnapshot } from '../model/car/types.js';
import { hallCallId, type Direction } from '../model/types.js';
import { fingerprint, load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';
import type { SimulationConfig, SimulationResult } from '../sim/types.js';

import { repositionDecisionFor } from './lifecycle.js';
import { createDispatchPolicy, resolveDispatchConfig } from './policy.js';
import {
  INITIAL_SELECTOR_STATE,
  RULE_EMPHASIS,
  STACKING_MIN_CALLS,
  resolveRuleArms,
  ruleArmMatches,
  rulesObservationOf,
  selectRuleArm,
  type ResolvedSelection,
  type RuleArm,
  type RulesObservation,
} from './selector.js';
import type { CallLifecycle, DispatchCall, ResolvedIdleStage } from './types.js';
import { PARK_AT_TOP_FLOOR_INDEX } from './types.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

const STYLE_WEIGHTS: ReadonlyMap<string, number> = new Map([['waitTime', 1]]);

const STYLE_IDLE: ResolvedIdleStage = Object.freeze({
  parkingStrategy: 'stay',
  parkingFloorIndex: 0,
  repositionThresholdS: 2,
  repositionEnergyWeight: 0.2,
});

const SELECTION: ResolvedSelection = Object.freeze({
  policy: 'rules',
  hysteresisS: 120,
  observationWindowS: 300,
  lobbyArrivalRateGain: 1,
  interfloorRateGain: 1,
  downPeakRateGain: 1,
  switchMargin: 0,
});

function arms(rows: readonly Parameters<typeof resolveRuleArms>[0][number][]): readonly RuleArm[] {
  return resolveRuleArms(rows, STYLE_WEIGHTS, STYLE_IDLE, 'probe').ruleSets.arms;
}

/** An observation with everything quiet, overridden field by field. */
function observed(overrides: Partial<RulesObservation> = {}): RulesObservation {
  return {
    longestWaitS: 0,
    lobbyQueue: 0,
    maxCarLoadFactor: 0,
    carsOutOfService: 0,
    timeOfDayS: undefined,
    openCalls: [],
    ...overrides,
  };
}

/** A lifecycle with only the fields the observation reads. */
const lifecycle = (
  floorIndex: number,
  registeredAt: number,
  waitingPassengers: number,
): CallLifecycle =>
  ({
    registeredAt,
    waitingPassengers,
    call: { floorIndex },
  }) as unknown as CallLifecycle;

/** A snapshot with only the fields the observation reads. */
const carLike = (lowestIndex: number, mode: string, loadFactor: number): CarSnapshot =>
  ({ shaft: { lowestIndex }, mode, load: { loadFactor } }) as unknown as CarSnapshot;

/* -------------------------------------------------------------------------- *
 * 1 — resolution refusals
 * -------------------------------------------------------------------------- */

describe('resolveRuleArms refuses what it cannot compile honestly', () => {
  it('refuses an unknown condition and an unknown action, naming the profile and the row', () => {
    expect(() =>
      arms([{ when: 'lobby-queue-pases', whenValue: 12, then: 'jump-queue' }]),
    ).toThrow(/probe.*row 1.*unknown condition "lobby-queue-pases"/s);
    expect(() =>
      arms([{ when: 'call-waited', whenValue: 60, then: 'urgent-up-calls' }]),
    ).toThrow(/probe.*row 1.*unknown action "urgent-up-calls"/s);
  });

  it('refuses the two §11.5 actions core omits, by not declaring them', () => {
    // The refusal list's first two entries, held as vocabulary: `skip-above` (service range is
    // building fabric) and `urgent-up-calls` (no direction-conditional cost term) are absent
    // from RULE_ACTIONS, so every spelling of them is the unknown-action refusal above.
    expect(() => arms([{ when: 'call-waited', whenValue: 60, then: 'skip-above' }])).toThrow(
      /unknown action/,
    );
  });

  it('refuses an out-of-list value rather than rounding it', () => {
    expect(() => arms([{ when: 'call-waited', whenValue: 61, then: 'jump-queue' }])).toThrow(
      /requires one of 30, 45, 60, 90, 120; received 61/,
    );
    expect(() =>
      arms([{ when: 'lobby-queue-passes', whenValue: 12, then: 'park-at-floor', thenValue: 6 }]),
    ).toThrow(/park-at-floor.*requires one of/);
  });

  it('refuses a value on a valueless condition', () => {
    expect(() => arms([{ when: 'shaft-out', whenValue: 1, then: 'spread-out' }])).toThrow(
      /carries no value/,
    );
  });

  it('refuses no-new-pickups paired with anything but car-fuller-than, and a second such row', () => {
    expect(() =>
      arms([{ when: 'call-waited', whenValue: 60, then: 'no-new-pickups' }]),
    ).toThrow(/only pairs with "car-fuller-than"/);
    expect(() =>
      arms([
        { when: 'car-fuller-than', whenValue: 0.7, then: 'no-new-pickups' },
        { when: 'car-fuller-than', whenValue: 0.8, then: 'no-new-pickups' },
      ]),
    ).toThrow(/second "no-new-pickups"/);
  });

  it('refuses policy rules with no rows, and rows under a policy that never reads them', () => {
    expect(() =>
      resolveDispatchConfig({
        id: 'p',
        name: 'P',
        weights: { waitTime: 1 },
        selection: { policy: 'rules' },
      }),
    ).toThrow(/declares it follows rules and has none to follow/);
    expect(() =>
      resolveDispatchConfig({
        id: 'p',
        name: 'P',
        weights: { waitTime: 1 },
        rules: { rows: [{ when: 'call-waited', whenValue: 60, then: 'jump-queue' }] },
      }),
    ).toThrow(/never reads them/);
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — per-condition truth
 * -------------------------------------------------------------------------- */

describe('the nine conditions, over hand-built observations', () => {
  const matches = (
    row: Parameters<typeof resolveRuleArms>[0][number],
    observation: RulesObservation,
  ): boolean => ruleArmMatches(arms([row])[0]!, observation);

  it('a call has waited v — true at and above the threshold (60 s at exactly 60 is waited)', () => {
    const row = { when: 'call-waited', whenValue: 60, then: 'jump-queue' };
    expect(matches(row, observed({ longestWaitS: 59 }))).toBe(false);
    expect(matches(row, observed({ longestWaitS: 60 }))).toBe(true);
    expect(matches(row, observed({ longestWaitS: 61 }))).toBe(true);
  });

  it('the lobby queue passes v — strictly above, and only over entrance floors', () => {
    const row = { when: 'lobby-queue-passes', whenValue: 12, then: 'hold-at-lobby' };
    expect(matches(row, observed({ lobbyQueue: 11 }))).toBe(false);
    expect(matches(row, observed({ lobbyQueue: 12 }))).toBe(false);
    expect(matches(row, observed({ lobbyQueue: 13 }))).toBe(true);
  });

  it('re-pins the midtown P1/G regression: the lobby queue reads the entrance set, not the lowest floor', () => {
    // The `main` bank serves P1 at −1 and the lobby G at 0; both are entrances, neither alone.
    const cars = [carLike(-1, 'in-service', 0)];
    const lifecycles = [lifecycle(0, 0, 9), lifecycle(-1, 0, 4), lifecycle(5, 0, 7)];
    const withEntrances = rulesObservationOf(lifecycles, cars, 10, {
      entranceFloorIndices: new Set([-1, 0]),
    });
    expect(withEntrances.lobbyQueue).toBe(13);
    // The stated fallback for a caller that supplies nothing: the shaft's lowest served floor —
    // wrong on a building with a basement, and stated (the ArrivalWindow keeps the same rule).
    const fallback = rulesObservationOf(lifecycles, cars, 10, undefined);
    expect(fallback.lobbyQueue).toBe(4);
  });

  it('a car is fuller than v — strictly above, and out-of-service cars are not "a car"', () => {
    const row = { when: 'car-fuller-than', whenValue: 0.7, then: 'emptiest-car' };
    expect(matches(row, observed({ maxCarLoadFactor: 0.7 }))).toBe(false);
    expect(matches(row, observed({ maxCarLoadFactor: 0.71 }))).toBe(true);
    const observation = rulesObservationOf(
      [],
      [carLike(0, 'out-of-service', 0.95), carLike(0, 'in-service', 0.4)],
      0,
      undefined,
    );
    expect(observation.maxCarLoadFactor).toBe(0.4);
    expect(observation.carsOutOfService).toBe(1);
  });

  it('time before and after — half-open windows over (startOfDayS + at) mod 86400', () => {
    const before = { when: 'time-before', whenValue: 36000, then: 'hold-at-lobby' };
    const after = { when: 'time-after', whenValue: 43200, then: 'hold-at-lobby' };
    expect(matches(before, observed({ timeOfDayS: 35999 }))).toBe(true);
    expect(matches(before, observed({ timeOfDayS: 36000 }))).toBe(false);
    expect(matches(after, observed({ timeOfDayS: 43199 }))).toBe(false);
    expect(matches(after, observed({ timeOfDayS: 43200 }))).toBe(true);
    // The derivation itself, through the observation builder: 22:24 + 2 h wraps past midnight.
    const wrapped = rulesObservationOf([], [], 2 * 3600, { startOfDayS: 1344 * 60 });
    expect(wrapped.timeOfDayS).toBe((1344 * 60 + 7200) % 86400);
  });

  it('the day is in v — the three named windows, and quiet-stretch as their complement', () => {
    const morning = { when: 'day-period', whenValue: 'morning-rush', then: 'hold-at-lobby' };
    const quiet = { when: 'day-period', whenValue: 'quiet-stretch', then: 'spread-out' };
    expect(matches(morning, observed({ timeOfDayS: 8 * 3600 }))).toBe(true);
    expect(matches(morning, observed({ timeOfDayS: 10 * 3600 }))).toBe(false);
    // 15:00 is in none of morning/lunch/evening, so the quiet stretch holds; 12:00 is lunch.
    expect(matches(quiet, observed({ timeOfDayS: 15 * 3600 }))).toBe(true);
    expect(matches(quiet, observed({ timeOfDayS: 12 * 3600 }))).toBe(false);
  });

  it('a clockless crowd makes every time clause false — including the negated quiet stretch', () => {
    for (const value of ['morning-rush', 'quiet-stretch'] as const) {
      const row = { when: 'day-period', whenValue: value, then: 'hold-at-lobby' };
      expect(matches(row, observed({ timeOfDayS: undefined }))).toBe(false);
    }
    expect(
      matches(
        { when: 'time-before', whenValue: 43200, then: 'hold-at-lobby' },
        observed({ timeOfDayS: undefined }),
      ),
    ).toBe(false);
  });

  it('a shaft is out of service — at least one car not in service', () => {
    const row = { when: 'shaft-out', then: 'spread-out' };
    expect(matches(row, observed({ carsOutOfService: 0 }))).toBe(false);
    expect(matches(row, observed({ carsOutOfService: 1 }))).toBe(true);
  });

  it(`calls are stacking above v — ${String(STACKING_MIN_CALLS)} distinct open calls strictly above the floor`, () => {
    const row = { when: 'calls-stacking-above', whenValue: 6, then: 'spread-out' };
    const two = observed({
      openCalls: [
        { floorIndex: 7, waitingPassengers: 1 },
        { floorIndex: 9, waitingPassengers: 1 },
        { floorIndex: 6, waitingPassengers: 1 }, // at, not above
      ],
    });
    expect(matches(row, two)).toBe(false);
    const three = observed({
      openCalls: [
        { floorIndex: 7, waitingPassengers: 1 },
        { floorIndex: 9, waitingPassengers: 1 },
        { floorIndex: 11, waitingPassengers: 1 },
      ],
    });
    expect(matches(row, three)).toBe(true);
  });

  it('nobody is waiting below v — a zero-passenger lifecycle below is not somebody', () => {
    const row = { when: 'nobody-below', whenValue: 5, then: 'spread-out' };
    expect(
      matches(row, observed({ openCalls: [{ floorIndex: 3, waitingPassengers: 0 }] })),
    ).toBe(true);
    expect(
      matches(row, observed({ openCalls: [{ floorIndex: 3, waitingPassengers: 1 }] })),
    ).toBe(false);
    expect(
      matches(row, observed({ openCalls: [{ floorIndex: 5, waitingPassengers: 4 }] })),
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — selection semantics
 * -------------------------------------------------------------------------- */

describe('first match wins, ordering decides, and no match releases behind the dwell', () => {
  const twoRows = [
    { when: 'lobby-queue-passes', whenValue: 6, then: 'hold-at-lobby' },
    { when: 'call-waited', whenValue: 30, then: 'jump-queue' },
  ] as const;

  it('takes the first matching row when several are true, and the other order takes the other', () => {
    const both = observed({ lobbyQueue: 10, longestWaitS: 45 });
    const forward = selectRuleArm(arms([...twoRows]), SELECTION, both, INITIAL_SELECTOR_STATE, 0);
    expect(forward.arm?.patternId).toBe('rule-1:lobby-queue-passes:6');
    const reversed = selectRuleArm(
      arms([twoRows[1], twoRows[0]]),
      SELECTION,
      both,
      INITIAL_SELECTOR_STATE,
      0,
    );
    expect(reversed.arm?.patternId).toBe('rule-1:call-waited:30');
  });

  it('releases to nothing when no row matches, only after the dwell', () => {
    const list = arms([...twoRows]);
    const taken = selectRuleArm(
      list,
      SELECTION,
      observed({ lobbyQueue: 10 }),
      INITIAL_SELECTOR_STATE,
      0,
    );
    expect(taken.switched).toBe(true);
    expect(taken.arm).toBeDefined();

    // 60 s in — inside the 120 s dwell — the condition lapses and the arm keeps the run.
    const held = selectRuleArm(list, SELECTION, observed(), taken.state, 60);
    expect(held.switched).toBe(false);
    expect(held.held).toBe('hysteresis');
    expect(held.arm?.patternId).toBe('rule-1:lobby-queue-passes:6');

    // Past the dwell it releases — §11.5's "If no rule fits, Steady hand decides."
    const released = selectRuleArm(list, SELECTION, observed(), taken.state, 120);
    expect(released.switched).toBe(true);
    expect(released.arm).toBeUndefined();
    expect(released.state.activeIndex).toBeUndefined();

    // And the released state carries `since`, so a rule re-firing waits the dwell out too —
    // which is what stops "lobby queue passes 12" flapping at 11.9/12.1.
    const refire = selectRuleArm(
      list,
      SELECTION,
      observed({ lobbyQueue: 10 }),
      released.state,
      150,
    );
    expect(refire.held).toBe('hysteresis');
    expect(refire.arm).toBeUndefined();
  });

  it('a flapping condition with a 1 s period changes arms at the dwell rate, not the flap rate', () => {
    const list = arms([...twoRows]);
    let state = INITIAL_SELECTOR_STATE;
    let switches = 0;
    for (let t = 0; t < 600; t += 1) {
      const noisy = observed({ lobbyQueue: t % 2 === 0 ? 10 : 0 });
      const result = selectRuleArm(list, SELECTION, noisy, state, t);
      state = result.state;
      if (result.switched) switches += 1;
    }
    // 600 s at a 120 s dwell admits at most five regime changes.
    expect(switches).toBeGreaterThan(0);
    expect(switches).toBeLessThanOrEqual(5);
  });

  it('an idle-only arm leaves the weights alone; a weight arm raises exactly one term', () => {
    const idleArm = arms([{ when: 'shaft-out', then: 'hold-at-lobby' }])[0]!;
    expect(idleArm.weights).toBeUndefined();
    expect(idleArm.idle?.parkingStrategy).toBe('lobby');
    // The style's own deadband and energy weight survive — the rule is about *where*.
    expect(idleArm.idle?.repositionThresholdS).toBe(STYLE_IDLE.repositionThresholdS);
    expect(idleArm.idle?.repositionEnergyWeight).toBe(STYLE_IDLE.repositionEnergyWeight);

    const weightArm = arms([{ when: 'shaft-out', then: 'jump-queue' }])[0]!;
    expect(weightArm.idle).toBeUndefined();
    expect(weightArm.weights?.get('starvation')).toBe(RULE_EMPHASIS);
    expect(weightArm.weights?.get('waitTime')).toBe(1);
    // max(style, RULE_EMPHASIS): a style already past the emphasis keeps its own weight.
    const loud = resolveRuleArms(
      [{ when: 'shaft-out', then: 'jump-queue' }],
      new Map([['starvation', 0.9]]),
      STYLE_IDLE,
      'probe',
    ).ruleSets.arms[0]!;
    expect(loud.weights?.get('starvation')).toBe(0.9);
  });
});

/* -------------------------------------------------------------------------- *
 * Fixture cars for the policy-level tests
 * -------------------------------------------------------------------------- */

const REFERENCE_SPECS: ElevatorSpecs = {
  version: 1,
  units: { speed: 'm/s' },
  conventions: {
    personsPerRatedLoadUS: 'ratedLoadLb / 150',
    personsPerRatedLoadEN81: 'ratedLoadKg / 75',
    designLoadFactor: 0.8,
  },
  classes: [
    {
      id: 'round-numbers',
      name: 'Round numbers',
      ratedSpeedMps: { min: 0.5, max: 10, typical: 2.0 },
      maxRiseM: 600,
      maxFloors: 100,
      acceleration: { typical: 1.0, max: 1.2 },
      jerk: { typical: 1.0, max: 1.6 },
      capacityLbRange: [1000, 4000],
      application: 'Test fixture',
    },
  ],
  codeMinimumSpeedByRise: [],
  capacities: [{ ratedLoadLb: 3000, ratedLoadKg: 1350, personsUS: 20, use: 'Office' }],
  doors: {
    centerOpening: { openS: 2.0, closeS: 3.0 },
    sideOpening: { openS: 2.5, closeS: 4.0 },
    dwellCarCallS: { min: 2, max: 4, typical: 3 },
    dwellHallCallS: { min: 4, max: 7, typical: 5 },
  },
  timing: {
    motorStartDelayS: 0.5,
    levelingSettleS: { min: 0.5, max: 1.0, typical: 0.5 },
    passengerTransferS: { office: 1.2, residential: 1.75, hotel: 1.5, hospital: 2.5 },
  },
  loadSensor: { hallCallBypassThreshold: 0.8, overloadAlarmThreshold: 1.1 },
  realWorldAnchors: [],
};

const SPEC: ResolvedCar = resolveCar(
  { id: 'A', spec: 'round-numbers', ratedLoadLb: 3000 },
  REFERENCE_SPECS,
);

function plainShaft(count = 21): CarShaft {
  return createShaft(
    Array.from({ length: count }, (_, index) => ({
      id: String(index),
      index,
      heightM: index * 4,
    })),
  );
}

function makeCar(id = 'A', homeFloorId = '0'): Car {
  return new Car({ id, bankId: 'low', spec: SPEC, shaft: plainShaft(), homeFloorId, clock: { now: () => 0 } });
}

function call(floorId: string, direction: Direction, registeredAt = 0): DispatchCall {
  return {
    id: hallCallId(floorId, direction),
    floorId,
    floorIndex: Number(floorId),
    direction,
    registeredAt,
  };
}

/* -------------------------------------------------------------------------- *
 * 4 — fallback identity, and the arm through the policy
 * -------------------------------------------------------------------------- */

describe('the policy under rules', () => {
  const RULES_PROFILE = {
    id: 'ruled',
    name: 'Ruled',
    weights: { waitTime: 1 },
    selection: { policy: 'rules' as const },
    rules: {
      rows: [{ when: 'call-waited' as const, whenValue: 60, then: 'jump-queue' as const }],
    },
  };

  it('hands the scorer config.weights by object identity when no rule matches', () => {
    const policy = createDispatchPolicy(RULES_PROFILE);
    const snapshot = makeCar().snapshot(0);
    policy.register(call('5', 'up', 0), 0);
    policy.dispatch(hallCallId('5', 'up'), [snapshot], 10);
    // 10 s < 60 s: no match, and the fallback is the frozen Map itself, not a copy.
    expect(policy.activeWeights).toBe(policy.config.weights);
    expect(policy.activePattern).toBeUndefined();
  });

  it('adopts the arm once the condition holds, exposes its provenance id, and counts the switch', () => {
    const policy = createDispatchPolicy(RULES_PROFILE);
    const snapshot = makeCar().snapshot(0);
    policy.register(call('5', 'up', 0), 0);
    policy.dispatch(hallCallId('5', 'up'), [snapshot], 61);
    expect(policy.activePattern).toBe('rule-1:call-waited:60');
    expect(policy.activeWeights.get('starvation')).toBe(RULE_EMPHASIS);
    expect(policy.weightSetSwitches).toBe(1);
    // reset() clears the rules state with everything else.
    policy.reset();
    expect(policy.activePattern).toBeUndefined();
    expect(policy.activeWeights).toBe(policy.config.weights);
  });

  it('builds no ArrivalWindow: ruleSets and weightSets are mutually exclusive by construction', () => {
    const config = resolveDispatchConfig(RULES_PROFILE);
    expect(config.ruleSets).toBeDefined();
    expect(config.weightSets).toBeUndefined();
    // And a profile without rules resolves to no ruleSets — the byte-identity half.
    const plain = resolveDispatchConfig({ id: 'p', name: 'P', weights: { waitTime: 1 } });
    expect(plain.ruleSets).toBeUndefined();
  });

  it('a startOfDayS supplied under policy off changes no decision (the field is read only under rules)', () => {
    const policy = createDispatchPolicy({ id: 'p', name: 'P', weights: { waitTime: 1 } });
    const snapshot = makeCar().snapshot(0);
    policy.register(call('5', 'up', 0), 0);
    const bare = policy.dispatch(hallCallId('5', 'up'), [snapshot], 10);
    policy.reset();
    policy.register(call('5', 'up', 0), 0);
    const clocked = policy.dispatch(hallCallId('5', 'up'), [snapshot], 10, {
      startOfDayS: 30600,
    });
    expect(clocked).toEqual(bare);
  });
});

/* -------------------------------------------------------------------------- *
 * 5 — idle precedence and the fixed-floor strategy
 * -------------------------------------------------------------------------- */

describe('stage 7 under rules', () => {
  const HOLD_PROFILE = {
    id: 'holder',
    name: 'Holder',
    weights: { waitTime: 1 },
    selection: { policy: 'rules' as const },
    rules: {
      rows: [{ when: 'call-waited' as const, whenValue: 30, then: 'hold-at-lobby' as const }],
    },
  };

  it('applies intervention idleOverride > rule arm idle > profile idle, in that order', () => {
    const policy = createDispatchPolicy(HOLD_PROFILE);
    const idleCar = makeCar('A', '15').snapshot(0);
    const entrances = { entranceFloorIds: ['0'] };

    // No arm in force: the profile's own idle (stay) decides.
    expect(policy.reposition(idleCar, 0, entrances).reason).toBe('parked');

    // Arm in force: the rule's lobby strategy decides.
    policy.register(call('5', 'up', 0), 0);
    policy.dispatch(hallCallId('5', 'up'), [idleCar], 31);
    const underRule = policy.reposition(idleCar, 31, entrances);
    expect(underRule).toMatchObject({ move: true, targetFloorId: '0' });

    // A player's explicit intervention outranks the standing rule.
    const overridden = policy.reposition(idleCar, 31, {
      ...entrances,
      idleOverride: { ...policy.config.idle, parkingStrategy: 'zone-center' },
    });
    expect(overridden.targetFloorId).toBe('10');
  });

  it('fixed-floor parks at the configured index, at the shaft top for the sentinel, and refuses an unserved index', () => {
    const at7 = resolveDispatchConfig({
      id: 'p',
      name: 'P',
      weights: { waitTime: 1 },
      idle: { parkingStrategy: 'fixed-floor', parkingFloorIndex: 7 },
    });
    const car = makeCar('A', '15').snapshot(0);
    const decision = repositionDecisionFor(car, at7, {});
    expect(decision).toMatchObject({ move: true, targetFloorId: '7' });
    // The point-mass demand model: from the target, the expected response is zero, so the
    // saving is exactly the travel — the same collapse `lobby` has with one entrance.
    expect(decision.anticipatedSavingS).toBe(decision.travelSeconds);

    const atTop = { ...at7, idle: { ...at7.idle, parkingFloorIndex: PARK_AT_TOP_FLOOR_INDEX } };
    expect(repositionDecisionFor(car, atTop, {}).targetFloorId).toBe('20');

    const unserved = { ...at7, idle: { ...at7.idle, parkingFloorIndex: 99 } };
    expect(repositionDecisionFor(car, unserved, {}).reason).toBe('no-target');
  });

  it('compiles park-at-floor: lobby to the lobby strategy and top to the sentinel', () => {
    const compiled = resolveRuleArms(
      [
        { when: 'shaft-out', then: 'park-at-floor', thenValue: 'lobby' },
        { when: 'shaft-out', then: 'park-at-floor', thenValue: 'top' },
        { when: 'shaft-out', then: 'park-at-floor', thenValue: 7 },
      ],
      STYLE_WEIGHTS,
      STYLE_IDLE,
      'probe',
    ).ruleSets.arms;
    expect(compiled[0]!.idle?.parkingStrategy).toBe('lobby');
    expect(compiled[1]!.idle).toMatchObject({
      parkingStrategy: 'fixed-floor',
      parkingFloorIndex: PARK_AT_TOP_FLOOR_INDEX,
    });
    expect(compiled[2]!.idle).toMatchObject({
      parkingStrategy: 'fixed-floor',
      parkingFloorIndex: 7,
    });
  });
});

/* -------------------------------------------------------------------------- *
 * 6 — the static compile
 * -------------------------------------------------------------------------- */

describe('no-new-pickups is a static compile into stage 2', () => {
  it('lands in eligibility.maxLoadFactorForAssignment and outranks the authored value', () => {
    const config = resolveDispatchConfig({
      id: 'p',
      name: 'P',
      weights: { waitTime: 1 },
      eligibility: { maxLoadFactorForAssignment: 1.0 },
      selection: { policy: 'rules' },
      rules: {
        rows: [{ when: 'car-fuller-than', whenValue: 0.6, then: 'no-new-pickups' }],
      },
    });
    expect(config.eligibility.maxLoadFactorForAssignment).toBe(0.6);
    // A pickup-only row compiles to no arm at all: it is checked car-by-car by the engine's
    // own stage-2 mechanism, outside the top-to-bottom scan.
    expect(config.ruleSets?.arms).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- *
 * 7 — the schema round trip
 * -------------------------------------------------------------------------- */

describe('the rules section through the profile schema', () => {
  const authored = {
    id: 'ruled',
    name: 'Ruled',
    weights: { waitTime: 1 },
    selection: { policy: 'rules' },
    rules: {
      $comment: 'authored note',
      rows: [
        { when: 'lobby-queue-passes', whenValue: 12, then: 'hold-at-lobby' },
        { when: 'call-waited', whenValue: 60, then: 'jump-queue' },
      ],
    },
  };

  it('round-trips a rules profile, $comment included', () => {
    const parsed = dispatcherProfileSchema.parse(authored);
    expect(parsed).toEqual(authored);
  });

  it('rejects an id outside the declared vocabulary at load, not at run', () => {
    const misspelt = {
      ...authored,
      rules: { rows: [{ when: 'lobby-queue-pases', whenValue: 12, then: 'hold-at-lobby' }] },
    };
    expect(dispatcherProfileSchema.safeParse(misspelt).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * 8 — moved controls, per buildable action, on the shipped path
 * -------------------------------------------------------------------------- */

let loaded: LoadedConfig;

beforeAll(async () => {
  loaded = await load();
});

function runConfig(
  buildingId: string,
  rows: readonly { when: string; whenValue?: number | string; then: string; thenValue?: number | string }[],
  seed: number,
  overrides: Partial<SimulationConfig> = {},
  profileId = 'collective',
): SimulationConfig {
  const building = loaded.buildingsById.get(buildingId);
  const base = loaded.dispatcherProfilesById.get(profileId);
  if (building === undefined || base === undefined) throw new Error('fixture missing');
  const dispatcherProfile =
    rows.length === 0
      ? base
      : ({
          ...base,
          selection: { policy: 'rules' },
          rules: { rows },
        } as typeof base);
  return {
    building,
    dispatcherProfile,
    trafficProfiles: loaded.trafficProfiles,
    elevatorSpecs: loaded.elevatorSpecs,
    seed,
    onTimeout: 'report',
    ...overrides,
  };
}

/** The § D177 projection: legs, never a window statistic. */
function legsOf(result: SimulationResult): string {
  return JSON.stringify(
    result.record.passengers.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

describe('every buildable action moves a run at a named measured cell (§ D112, § D177)', () => {
  const SEED = 20260726;

  /*
   * Two cells, each a measured choice rather than a preference:
   *
   * - **midtown-office** for the four weight arms and the static compile — the office morning
   *   (rise-and-fall, startOfDayS 08:30) queues past every threshold the rules name, so the
   *   conditions hold for real stretches of the run and the raised term has decisions to move.
   * - **garden-apartments** for the three idle arms — stage 7 dominates sparse traffic
   *   (`dispatch/lifecycle.ts`'s own sentence), and the same cell `sim/interventions.test.ts`
   *   measured the lobby override on. The conditions are time clauses over the template's
   *   authored 08:30 start, chosen to hold for the whole 1 800 s run, so the arm is in force
   *   whenever a car goes idle.
   */
  let midtownBase: string;
  let midtownLunchBase: string;
  let gardenBase: string;

  beforeAll(() => {
    midtownBase = legsOf(runSimulation(runConfig('midtown-office', [], SEED)));
    midtownLunchBase = legsOf(
      runSimulation(runConfig('midtown-office', [], SEED, { demandTemplate: 'lunch-two-way' })),
    );
    gardenBase = legsOf(runSimulation(runConfig('garden-apartments', [], SEED)));
  }, 300_000);

  const moved = (
    buildingId: string,
    rows: readonly { when: string; whenValue?: number | string; then: string; thenValue?: number | string }[],
    overrides: Partial<SimulationConfig> = {},
    profileId = 'collective',
  ): string => legsOf(runSimulation(runConfig(buildingId, rows, SEED, overrides, profileId)));

  /** The two-way lunch cell, for the terms a pure up-peak cannot separate. */
  const LUNCH: Partial<SimulationConfig> = { demandTemplate: 'lunch-two-way' };
  /** A prestige-level morning, for the one term that needs cars actually full. */
  const HEAVY: Partial<SimulationConfig> = { demand: { arrivalRatePctPop5min: 16 } };

  it('jump-queue (weights.starvation) — midtown-office, when a call has waited 30 s', () => {
    expect(moved('midtown-office', [{ when: 'call-waited', whenValue: 30, then: 'jump-queue' }]))
      .not.toBe(midtownBase);
  }, 300_000);

  /*
   * The next three run on `midtown-office`/`lunch-two-way`, and the cell is measured rather
   * than preferred: at the pure morning up-peak all three rules were **inert on the legs** —
   * every candidate car is doing the same thing (running up from the lobby), so distance
   * tracks wait, nobody's load separates from anybody's, and no car is ever pointing the wrong
   * way. The two-way lunch mix is the traffic where those three terms exist at all.
   */
  it('nearest-car (weights.distanceTravelled) — midtown-office/lunch-two-way, when a call has waited 30 s', () => {
    expect(
      moved(
        'midtown-office',
        [{ when: 'call-waited', whenValue: 30, then: 'nearest-car' }],
        LUNCH,
      ),
    ).not.toBe(midtownLunchBase);
  }, 300_000);

  it('emptiest-car (weights.loadFactor) — midtown-office at a prestige-level 16 %/5min morning, when a car is fuller than 50%', () => {
    // At the standard rate no midtown car crosses 50% for long enough to separate the fleet on
    // load — the arm engaged and no argmin flipped. 16 %/5min is docs/03's prestige-office
    // up-peak band, the demand at which "the emptiest car" is a real distinction.
    const base = moved('midtown-office', [], HEAVY);
    expect(
      moved(
        'midtown-office',
        [{ when: 'car-fuller-than', whenValue: 0.5, then: 'emptiest-car' }],
        HEAVY,
      ),
    ).not.toBe(base);
  }, 300_000);

  it('prefer-same-direction (weights.directionReversal) — midtown-office/lunch-two-way on eta, when a call has waited 30 s', () => {
    // On `collective` this action is structurally inert, and the reason is worth the sentence:
    // that profile ships the `noDirectionReversal` **hard** constraint, so a car pointing the
    // wrong way is filtered at stage 2 and the soft term prices identical zeros over every
    // survivor. `eta` carries no hard constraint, which is what makes the soft preference a
    // decision the rule can move. The rules editor applies the arm to whichever style is
    // driving; this is the honest statement of where the lever exists.
    const base = moved('midtown-office', [], LUNCH, 'eta');
    expect(
      moved(
        'midtown-office',
        [{ when: 'call-waited', whenValue: 30, then: 'prefer-same-direction' }],
        LUNCH,
        'eta',
      ),
    ).not.toBe(base);
  }, 300_000);

  it('no-new-pickups (eligibility ceiling) — midtown-office, when a car is fuller than 50%', () => {
    expect(
      moved('midtown-office', [
        { when: 'car-fuller-than', whenValue: 0.5, then: 'no-new-pickups' },
      ]),
    ).not.toBe(midtownBase);
  }, 300_000);

  it('hold-at-lobby (idle arm) — garden-apartments, during the morning rush', () => {
    expect(
      moved('garden-apartments', [
        { when: 'day-period', whenValue: 'morning-rush', then: 'hold-at-lobby' },
      ]),
    ).not.toBe(gardenBase);
  }, 300_000);

  it('park-at-floor top (fixed-floor arm) — garden-apartments, before 10:00', () => {
    expect(
      moved('garden-apartments', [
        { when: 'time-before', whenValue: 36000, then: 'park-at-floor', thenValue: 'top' },
      ]),
    ).not.toBe(gardenBase);
  }, 300_000);

  it('spread-out (zone-center arm) — garden-apartments, during the morning rush: the flagged inertness trap, measured', () => {
    // The design's single highest-risk row: an arm-level zone-center with no per-car zoning
    // context would send every idle car to one median — huddle wearing spread's name. The
    // shipped run resolves `zoneAssignment(cars)` unconditionally in `Simulation.#park`, so the
    // context is there for the arm exactly as for a profile; this run is the measurement.
    expect(
      moved('garden-apartments', [
        { when: 'day-period', whenValue: 'morning-rush', then: 'spread-out' },
      ]),
    ).not.toBe(gardenBase);
  }, 300_000);

  it('ordering moves the run: the same two rows, reordered, are different runs', () => {
    const forward = moved('midtown-office', [
      { when: 'car-fuller-than', whenValue: 0.5, then: 'emptiest-car' },
      { when: 'call-waited', whenValue: 30, then: 'jump-queue' },
    ]);
    const reversed = moved('midtown-office', [
      { when: 'call-waited', whenValue: 30, then: 'jump-queue' },
      { when: 'car-fuller-than', whenValue: 0.5, then: 'emptiest-car' },
    ]);
    expect(forward).not.toBe(reversed);
  }, 600_000);

  it('a rules run is deterministic: same config, same seed, same fingerprint (invariant 5)', () => {
    const config = (): SimulationConfig =>
      runConfig(
        'garden-apartments',
        [{ when: 'day-period', whenValue: 'morning-rush', then: 'hold-at-lobby' }],
        SEED,
      );
    expect(fingerprint(runSimulation(config()))).toBe(fingerprint(runSimulation(config())));
  }, 300_000);
});
