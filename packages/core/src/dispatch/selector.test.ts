/**
 * The weight-set selector, at the unit level.
 *
 * What this file can and cannot prove is worth stating, because this repository has shipped
 * eleven behaviours that were *configurable, unit-tested in isolation and dead in the shipped
 * path*, and a green file here is exactly what all eleven had. So: **this suite proves the
 * arithmetic; it does not prove the mechanism is live.** Liveness is measured one level up, on
 * car trajectories, by `experiments/src/benchmark/weightSetSelection.ts`, and the seam's non-test
 * caller is `sim/simulation.ts` through `WeightedCostDispatchPolicy.dispatch`.
 */

import { describe, expect, it } from 'vitest';

import type { CarSnapshot } from '../model/car/types.js';

import {
  ArrivalWindow,
  IDLE_TRAFFIC,
  INITIAL_SELECTOR_STATE,
  SELECTOR_INPUTS,
  armMembership,
  isSelectorInput,
  rampMembership,
  resolveWeightSets,
  selectWeightSet,
  type ResolvedSelection,
  type TrafficObservation,
  type WeightSetSource,
} from './selector.js';
import { DispatchError } from './types.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

const SELECTION: ResolvedSelection = Object.freeze({
  policy: 'fuzzy',
  hysteresisS: 120,
  observationWindowS: 300,
  lobbyArrivalRateGain: 1,
  interfloorRateGain: 1,
  downPeakRateGain: 1,
  switchMargin: 0,
});

const withSelection = (patch: Partial<ResolvedSelection>): ResolvedSelection =>
  Object.freeze({ ...SELECTION, ...patch });

/** Two patterns whose signatures do not overlap, so a test can put the detector anywhere. */
const LIBRARY: WeightSetSource = {
  patternSwitching: {
    patternDetector: {
      type: 'fuzzy',
      inputs: [...SELECTOR_INPUTS],
      patterns: ['up', 'down'],
      hysteresisS: 120,
      membership: {
        up: { lobbyArrivalRate: [0.004, 0.012] },
        down: { downPeakRate: [0.004, 0.012] },
      },
    },
    weightSetsByPattern: { up: 'up-arm', down: 'down-arm' },
  },
  weightsByProfileId: new Map([
    ['up-arm', new Map([['waitTime', 1]])],
    ['down-arm', new Map([['starvation', 1]])],
  ]),
};

const traffic = (patch: Partial<TrafficObservation>): TrafficObservation => ({
  ...IDLE_TRAFFIC,
  ...patch,
});

/** A snapshot with only the fields the arrival window reads. */
const car = (lowestIndex: number): CarSnapshot =>
  ({ shaft: { lowestIndex } }) as unknown as CarSnapshot;

/* -------------------------------------------------------------------------- *
 * Membership arithmetic
 * -------------------------------------------------------------------------- */

describe('a membership ramp is one form read in both directions', () => {
  it('rises when the zero point is below the one point', () => {
    expect(rampMembership(0.0, [1, 3])).toBe(0);
    expect(rampMembership(1.0, [1, 3])).toBe(0);
    expect(rampMembership(2.0, [1, 3])).toBe(0.5);
    expect(rampMembership(3.0, [1, 3])).toBe(1);
    expect(rampMembership(9.0, [1, 3])).toBe(1);
  });

  it('falls when the zero point is above the one point', () => {
    // The same arithmetic read backwards, which is what lets one pattern say "lobby high **and**
    // down low" without a second shape in the schema.
    expect(rampMembership(0.0, [3, 1])).toBe(1);
    expect(rampMembership(1.0, [3, 1])).toBe(1);
    expect(rampMembership(2.0, [3, 1])).toBe(0.5);
    expect(rampMembership(3.0, [3, 1])).toBe(0);
    expect(rampMembership(9.0, [3, 1])).toBe(0);
  });

  it('is a step when the two points coincide', () => {
    expect(rampMembership(0.9, [1, 1])).toBe(0);
    expect(rampMembership(1.0, [1, 1])).toBe(1);
  });

  it('takes the weakest clause, which is fuzzy AND and not an average', () => {
    const sets = resolveWeightSets(LIBRARY, SELECTION, 'p');
    const both: Parameters<typeof armMembership>[0] = {
      patternId: 'x',
      weightSetId: 'x',
      weights: new Map(),
      membership: new Map([
        ['lobbyArrivalRate', [0, 1] as const],
        ['downPeakRate', [1, 0] as const],
      ]),
    };
    expect(sets).toBeDefined();
    // Lobby at 1 gives 1; down at 1 gives 0. An average would say 0.5 and let a pattern win on
    // half its own definition.
    expect(armMembership(both, traffic({ lobbyArrivalRate: 1, downPeakRate: 1 }))).toBe(0);
    expect(armMembership(both, traffic({ lobbyArrivalRate: 1, downPeakRate: 0 }))).toBe(1);
  });
});

/* -------------------------------------------------------------------------- *
 * Resolution — what is refused, and why each refusal is not tolerance
 * -------------------------------------------------------------------------- */

describe('resolving the arms refuses every configuration it cannot keep', () => {
  it('is absent, and costs nothing, while the policy is off', () => {
    expect(resolveWeightSets(LIBRARY, withSelection({ policy: 'off' }), 'p')).toBeUndefined();
    expect(resolveWeightSets(undefined, withSelection({ policy: 'off' }), 'p')).toBeUndefined();
  });

  it('refuses a selector with no library to select from', () => {
    expect(() => resolveWeightSets(undefined, SELECTION, 'p')).toThrow(DispatchError);
  });

  it('refuses a dangling weight-set name rather than falling back silently', () => {
    // The shipped file's own defect: `weightSetsByPattern.idle` named `energy-saver`, which was
    // never authored, and `parse.ts` said pattern switching would "fall back until it exists".
    // Harmless while nothing read the block. Once something does, a missing arm is a regime the
    // dispatcher cannot express, and it would go missing at exactly the traffic the operator
    // configured it for.
    const dangling: WeightSetSource = {
      ...LIBRARY,
      patternSwitching: {
        ...LIBRARY.patternSwitching,
        weightSetsByPattern: { up: 'up-arm', down: 'not-a-profile' },
      },
    };
    expect(() => resolveWeightSets(dangling, SELECTION, 'p')).toThrow(/not an authored/);
  });

  it('refuses a detector input no observation supplies', () => {
    const unknownInput: WeightSetSource = {
      ...LIBRARY,
      patternSwitching: {
        ...LIBRARY.patternSwitching,
        patternDetector: {
          ...LIBRARY.patternSwitching.patternDetector,
          inputs: ['timeOfDay'],
        },
      },
    };
    expect(() => resolveWeightSets(unknownInput, SELECTION, 'p')).toThrow(/timeOfDay/);
  });

  it('refuses a pattern with no membership clause', () => {
    // Its membership would be a constant, so the detector could neither enter nor leave it on
    // evidence — a pattern that is either never chosen or always chosen is not a detection.
    const clauseless: WeightSetSource = {
      ...LIBRARY,
      patternSwitching: {
        ...LIBRARY.patternSwitching,
        patternDetector: {
          ...LIBRARY.patternSwitching.patternDetector,
          membership: { up: { lobbyArrivalRate: [0.004, 0.012] } },
        },
      },
    };
    expect(() => resolveWeightSets(clauseless, SELECTION, 'p')).toThrow(/no membership clause/);
  });

  it('refuses a pattern the weight-set map does not name', () => {
    const unmapped: WeightSetSource = {
      ...LIBRARY,
      patternSwitching: {
        ...LIBRARY.patternSwitching,
        weightSetsByPattern: { up: 'up-arm' },
      },
    };
    expect(() => resolveWeightSets(unmapped, SELECTION, 'p')).toThrow(/no weightSetsByPattern/);
  });

  it('keeps the declared pattern order, which is what breaks ties', () => {
    const sets = resolveWeightSets(LIBRARY, SELECTION, 'p');
    expect(sets?.arms.map((arm) => arm.patternId)).toEqual(['up', 'down']);
    expect(sets?.detector).toBe('fuzzy');
  });
});

/* -------------------------------------------------------------------------- *
 * Selection
 * -------------------------------------------------------------------------- */

describe('selection is pure, deterministic and hysteretic', () => {
  const sets = resolveWeightSets(LIBRARY, SELECTION, 'p')!;

  it('abstains when nothing is recognized, rather than picking the least bad arm', () => {
    const result = selectWeightSet(sets, SELECTION, IDLE_TRAFFIC, INITIAL_SELECTOR_STATE, 0);
    expect(result.arm).toBeUndefined();
    expect(result.switched).toBe(false);
    // The caller runs the profile's own weights. "None of the declared regimes" is information,
    // and guessing would hide it.
  });

  it('takes the arm with the highest membership', () => {
    const result = selectWeightSet(
      sets,
      SELECTION,
      traffic({ lobbyArrivalRate: 0.02 }),
      INITIAL_SELECTOR_STATE,
      10,
    );
    expect(result.arm?.weightSetId).toBe('up-arm');
    expect(result.preferredMembership).toBe(1);
    expect(result.switched).toBe(true);
    expect(result.state).toEqual({ activeIndex: 0, since: 10 });
  });

  it('breaks a tie by declaration order, never by iteration over a hash', () => {
    const tied = traffic({ lobbyArrivalRate: 0.02, downPeakRate: 0.02 });
    const result = selectWeightSet(sets, SELECTION, tied, INITIAL_SELECTOR_STATE, 0);
    expect(result.arm?.patternId).toBe('up');
  });

  it('holds the incumbent until the dwell expires, then switches', () => {
    const first = selectWeightSet(
      sets,
      SELECTION,
      traffic({ lobbyArrivalRate: 0.02 }),
      INITIAL_SELECTOR_STATE,
      100,
    );
    const early = selectWeightSet(
      sets,
      SELECTION,
      traffic({ downPeakRate: 0.02 }),
      first.state,
      100 + 119,
    );
    expect(early.arm?.weightSetId).toBe('up-arm');
    expect(early.preferred?.weightSetId).toBe('down-arm');
    expect(early.held).toBe('hysteresis');
    expect(early.switched).toBe(false);

    const late = selectWeightSet(
      sets,
      SELECTION,
      traffic({ downPeakRate: 0.02 }),
      first.state,
      100 + 120,
    );
    expect(late.arm?.weightSetId).toBe('down-arm');
    expect(late.switched).toBe(true);
  });

  it('keeps the incumbent through a lull rather than dropping to the profile weights', () => {
    const first = selectWeightSet(
      sets,
      SELECTION,
      traffic({ lobbyArrivalRate: 0.02 }),
      INITIAL_SELECTOR_STATE,
      0,
    );
    const lull = selectWeightSet(sets, SELECTION, IDLE_TRAFFIC, first.state, 1000);
    expect(lull.arm?.weightSetId).toBe('up-arm');
    expect(lull.held).toBe('incumbent-preferred');
  });

  it('is a pure function of its arguments — the same call answers the same, always', () => {
    const state = { activeIndex: 0, since: 5 } as const;
    const once = selectWeightSet(sets, SELECTION, traffic({ downPeakRate: 0.02 }), state, 500);
    for (let i = 0; i < 50; i += 1) {
      expect(selectWeightSet(sets, SELECTION, traffic({ downPeakRate: 0.02 }), state, 500)).toEqual(
        once,
      );
    }
  });
});

describe('the learned half is inert at its defaults and bites away from them', () => {
  const sets = resolveWeightSets(LIBRARY, SELECTION, 'p')!;
  const contextual = withSelection({ policy: 'contextual' });

  it('is arithmetically the fuzzy rule at gain 1 and margin 0', () => {
    // Deliberate, and it is what makes "what the learning bought" a difference against the fuzzy
    // arm rather than against an unrelated configuration.
    for (const rate of [0, 0.003, 0.006, 0.012, 0.05]) {
      const observed = traffic({ lobbyArrivalRate: rate });
      expect(selectWeightSet(sets, contextual, observed, INITIAL_SELECTOR_STATE, 0)).toEqual(
        selectWeightSet(sets, SELECTION, observed, INITIAL_SELECTOR_STATE, 0),
      );
    }
  });

  it('a gain moves where the regimes divide', () => {
    const observed = traffic({ lobbyArrivalRate: 0.003 });
    expect(
      selectWeightSet(sets, contextual, observed, INITIAL_SELECTOR_STATE, 0).arm,
    ).toBeUndefined();
    const amplified = withSelection({ policy: 'contextual', lobbyArrivalRateGain: 4 });
    expect(
      selectWeightSet(sets, amplified, observed, INITIAL_SELECTOR_STATE, 0).arm?.weightSetId,
    ).toBe('up-arm');
  });

  it('a switch margin asks the challenger to be better, not merely later', () => {
    const first = selectWeightSet(
      sets,
      contextual,
      traffic({ lobbyArrivalRate: 0.02 }),
      INITIAL_SELECTOR_STATE,
      0,
    );
    // Dwell long expired. The challenger's membership is 0.25 and the incumbent's is 0, so the
    // dwell gate is spent and only the margin is left to decide.
    const observed = traffic({ downPeakRate: 0.006 });
    const margin = withSelection({ policy: 'contextual', switchMargin: 0.5 });
    const held = selectWeightSet(sets, margin, observed, first.state, 5000);
    expect(held.preferredMembership).toBeCloseTo(0.25, 12);
    expect(held.held).toBe('margin');
    expect(held.arm?.weightSetId).toBe('up-arm');

    const permissive = withSelection({ policy: 'contextual', switchMargin: 0.1 });
    expect(selectWeightSet(sets, permissive, observed, first.state, 5000).switched).toBe(true);
  });

  it('leaves the fuzzy policy untouched by a gain, so the two rules are separable', () => {
    const amplified = withSelection({ policy: 'fuzzy', lobbyArrivalRateGain: 4 });
    const observed = traffic({ lobbyArrivalRate: 0.003 });
    expect(selectWeightSet(sets, amplified, observed, INITIAL_SELECTOR_STATE, 0).arm).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * The observation
 * -------------------------------------------------------------------------- */

describe('the arrival window counts passengers, in a trailing window, per car', () => {
  it('reports nothing before anything has arrived', () => {
    expect(new ArrivalWindow().observe(0, 300, [car(0)])).toEqual(IDLE_TRAFFIC);
  });

  it('divides by the whole window, not by the elapsed time', () => {
    // A run therefore begins with every rate at zero and climbs into its regime, instead of a
    // half-second-old run reporting twenty passengers a second.
    const window = new ArrivalWindow();
    window.record(0.5, 0, 'up', 10);
    expect(window.observe(0.5, 300, [car(0)]).lobbyArrivalRate).toBeCloseTo(10 / 300, 12);
  });

  it('classifies by the entrance set when it is given one', () => {
    // The measurement that made this non-obvious: `midtown-office`'s `main` bank serves the
    // garage `P1` at index −1 and the lobby `G` at index 0, and a lowest-served-floor rule put
    // every lobby arrival of a pure up-peak into the interfloor bucket.
    const window = new ArrivalWindow();
    window.record(10, 0, 'up', 6); // G — an entrance
    window.record(10, 5, 'up', 3); // 5 — interfloor
    window.record(10, 5, 'down', 3);
    const observed = window.observe(20, 300, [car(-1)], new Set([-1, 0]));
    expect(observed.lobbyArrivalRate).toBeCloseTo(6 / 300, 12);
    expect(observed.interfloorRate).toBeCloseTo(3 / 300, 12);
    expect(observed.downPeakRate).toBeCloseTo(3 / 300, 12);
  });

  it('falls back to the lowest served floor when nobody supplies the entrances', () => {
    const window = new ArrivalWindow();
    window.record(10, 0, 'up', 6);
    window.record(10, 5, 'up', 3);
    const observed = window.observe(20, 300, [car(-1)]);
    // Wrong on this shaft, and that is the point of stating it: index 0 is not index −1.
    expect(observed.lobbyArrivalRate).toBe(0);
    expect(observed.interfloorRate).toBeCloseTo(9 / 300, 12);
  });

  it('divides by the number of cars, so one membership map is not a fleet size', () => {
    const window = new ArrivalWindow();
    window.record(10, 0, 'up', 12);
    const one = window.observe(20, 300, [car(0)], new Set([0]));
    const four = window.observe(20, 300, [car(0), car(0), car(0), car(0)], new Set([0]));
    expect(one.lobbyArrivalRate).toBeCloseTo(4 * four.lobbyArrivalRate, 12);
  });

  it('prunes what has fallen out of the window', () => {
    const window = new ArrivalWindow();
    window.record(0, 0, 'up', 5);
    window.record(200, 0, 'up', 5);
    expect(window.observe(250, 300, [car(0)], new Set([0])).lobbyArrivalRate).toBeCloseTo(
      10 / 300,
      12,
    );
    expect(window.observe(400, 300, [car(0)], new Set([0])).lobbyArrivalRate).toBeCloseTo(
      5 / 300,
      12,
    );
    expect(window.entries).toHaveLength(1);
  });

  it('ignores a non-positive count, so a re-registration that adds nobody adds nothing', () => {
    const window = new ArrivalWindow();
    window.record(0, 0, 'up', 0);
    window.record(0, 0, 'up', -3);
    expect(window.entries).toHaveLength(0);
  });

  it('clears with the policy that owns it', () => {
    const window = new ArrivalWindow();
    window.record(0, 0, 'up', 5);
    window.clear();
    expect(window.observe(10, 300, [car(0)], new Set([0]))).toEqual(IDLE_TRAFFIC);
  });

  it('reports nothing for a bank with no cars', () => {
    const window = new ArrivalWindow();
    window.record(0, 0, 'up', 5);
    expect(window.observe(10, 300, [])).toEqual(IDLE_TRAFFIC);
  });
});

describe('the input vocabulary', () => {
  it('admits exactly the three inputs an observation supplies', () => {
    expect([...SELECTOR_INPUTS]).toEqual([
      'lobbyArrivalRate',
      'interfloorRate',
      'downPeakRate',
    ]);
    for (const input of SELECTOR_INPUTS) expect(isSelectorInput(input)).toBe(true);
    // Authored in `data/` until this lane, and removed rather than faked: `core/` has no wall
    // clock and the kernel's time is seconds since the run started.
    expect(isSelectorInput('timeOfDay')).toBe(false);
  });
});
