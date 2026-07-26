import { describe, expect, it } from 'vitest';

import { resolveCar } from '../../config/resolveCar.js';
import type { AnswerStageConfig, ElevatorSpecs, ResolvedCar } from '../../config/types.js';
import { SimKernel, createEvent } from '../../kernel/index.js';
import { StreamSet } from '../../random/index.js';
import {
  advanceDoor,
  applyDoorCommand,
  createDoorState,
  doorAccountingAt,
  doorOpenFractionAt,
  dwellSecondsFor,
  isDoorMoving,
  maxStopSeconds,
  mergeStopReasons,
  nextDoorTransitionAt,
  nominalStopSeconds,
  resolveDoorConfig,
} from './doorMachine.js';
import { DOOR_DEFAULTS, DOOR_PARAMETERS, DOOR_STATES } from './types.js';
import type {
  DoorAnswerSource,
  DoorCommand,
  DoorConfig,
  DoorEvent,
  DoorEventType,
  DoorMachineState,
  DoorStopReason,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 *
 * The numbers below are the reference values from docs/02-elevator-reference.md
 * § Door parameters, mirrored in data/elevator-specs.json. They are stated here as a
 * fixture rather than read off disk so the physics tests need no filesystem; `resolveCar`
 * is used rather than hand-built timings so the seam between config resolution and the
 * door machine is exercised too.
 * -------------------------------------------------------------------------- */

const REFERENCE_SPECS: ElevatorSpecs = {
  version: 1,
  units: { doorOpenS: 'seconds', doorCloseS: 'seconds' },
  conventions: {
    personsPerRatedLoadUS: 'ratedLoadLb / 150',
    personsPerRatedLoadEN81: 'ratedLoadKg / 75',
    designLoadFactor: 0.8,
  },
  classes: [
    {
      id: 'geared-traction',
      name: 'Geared traction',
      ratedSpeedMps: { min: 1.75, max: 2.5, typical: 2.0 },
      maxRiseM: 76,
      maxFloors: 25,
      acceleration: { typical: 1.0, max: 1.2 },
      jerk: { typical: 1.4, max: 1.6 },
      capacityLbRange: [2500, 4000],
      application: 'Mid-rise',
    },
  ],
  codeMinimumSpeedByRise: [],
  capacities: [{ ratedLoadLb: 2500, ratedLoadKg: 1150, personsUS: 16, use: 'Office standard' }],
  doors: {
    centerOpening: { openS: 1.8, closeS: 3.0 },
    sideOpening: { openS: 2.5, closeS: 4.0 },
    dwellCarCallS: { min: 2, max: 4, typical: 3 },
    dwellHallCallS: { min: 4, max: 7, typical: 5 },
  },
  timing: {
    motorStartDelayS: 0.5,
    levelingSettleS: { min: 0.5, max: 1.0, typical: 0.7 },
    passengerTransferS: { office: 1.2, residential: 1.75, hotel: 1.5 },
  },
  loadSensor: { hallCallBypassThreshold: 0.8, overloadAlarmThreshold: 1.1 },
  realWorldAnchors: [],
};

const centerCar: ResolvedCar = resolveCar({ id: 'A', spec: 'geared-traction' }, REFERENCE_SPECS);
const sideCar: ResolvedCar = resolveCar(
  { id: 'B', spec: 'geared-traction', doorType: 'sideOpening' },
  REFERENCE_SPECS,
);

const CENTER: DoorConfig = resolveDoorConfig(centerCar);
const SIDE: DoorConfig = resolveDoorConfig(sideCar);

const CAR_CALL: DoorStopReason = { carCall: true, hallCall: false };
const HALL_CALL: DoorStopReason = { carCall: false, hallCall: true };
const BOTH_CALLS: DoorStopReason = { carCall: true, hallCall: true };

/** Precision used for every time comparison: nanoseconds of simulated time. */
const PRECISION = 9;

/* -------------------------------------------------------------------------- *
 * Helpers
 * -------------------------------------------------------------------------- */

interface DriveResult {
  readonly state: DoorMachineState;
  readonly events: readonly DoorEvent[];
}

/** Apply a script of `[time, command]` pairs, then run the door out to `finalTime`. */
function drive(
  config: DoorConfig,
  script: readonly (readonly [number, DoorCommand])[],
  finalTime = 10_000,
): DriveResult {
  let door = createDoorState(0);
  const events: DoorEvent[] = [];
  for (const [at, command] of script) {
    const step = applyDoorCommand(door, command, at, config);
    door = step.state;
    events.push(...step.events);
  }
  const tail = advanceDoor(door, finalTime, config);
  events.push(...tail.events);
  return { state: tail.state, events };
}

const typesOf = (events: readonly DoorEvent[]): readonly DoorEventType[] =>
  events.map((entry) => entry.type);

/** Time of the first event of `type`. Throws with the whole trace if there is none. */
function timeOf(events: readonly DoorEvent[], type: DoorEventType): number {
  const found = events.find((entry) => entry.type === type);
  if (found === undefined) {
    throw new Error(`no ${type} in trace [${typesOf(events).join(', ')}]`);
  }
  return found.at;
}

const openAt = (at: number, reason: DoorStopReason): readonly [number, DoorCommand] => [
  at,
  { kind: 'open', reason },
];

const obstructAt = (at: number): readonly [number, DoorCommand] => [
  at,
  { kind: 'reopen', cause: 'obstruction' },
];

const lateArrivalAt = (at: number): readonly [number, DoorCommand] => [
  at,
  { kind: 'reopen', cause: 'lateArrival' },
];

/* -------------------------------------------------------------------------- *
 * Configuration
 * -------------------------------------------------------------------------- */

describe('resolveDoorConfig', () => {
  it('takes the physical timings from the resolved car', () => {
    expect(CENTER.openS).toBe(1.8);
    expect(CENTER.closeS).toBe(3.0);
    expect(CENTER.dwellCarCallS).toBe(3);
    expect(CENTER.dwellHallCallS).toBe(5);

    expect(SIDE.openS).toBe(2.5);
    expect(SIDE.closeS).toBe(4.0);
  });

  it('applies the declared defaults when the profile has no answer stage', () => {
    expect(CENTER.dwellPolicy).toBe(DOOR_DEFAULTS.dwellPolicy);
    expect(CENTER.dwellAdaptationGain).toBe(DOOR_DEFAULTS.dwellAdaptationGain);
    expect(CENTER.maxDwellS).toBe(DOOR_DEFAULTS.maxDwellS);
    expect(CENTER.reopenOnLateArrival).toBe(DOOR_DEFAULTS.reopenOnLateArrival);
    expect(CENTER.maxReopensPerStop).toBe(DOOR_DEFAULTS.maxReopensPerStop);
  });

  it('takes control settings from the dispatcher profile answer stage', () => {
    // Exactly the `answer` block of the `predictive-balanced` profile in
    // data/dispatcher-profiles.json.
    const answer: AnswerStageConfig = {
      bypassLoadThreshold: 0.8,
      allowBypassIfSoleEligibleCar: false,
      dwellPolicy: 'adaptive',
      dwellAdaptationGain: 0.4,
      maxDwellS: 12,
    };
    const config = resolveDoorConfig(centerCar, answer);
    expect(config.dwellPolicy).toBe('adaptive');
    expect(config.dwellAdaptationGain).toBe(0.4);
    expect(config.maxDwellS).toBe(12);
  });

  it('reads the reopen budget and the transfer ceiling from the answer stage too', () => {
    // Regression: both were readable only from `overrides`, so `answer.maxReopensPerStop` —
    // the bound that makes the stop finite — was a declared tunable no profile could set.
    const config = resolveDoorConfig(centerCar, { maxReopensPerStop: 3, maxTransferSeconds: 18 });
    expect(config.maxReopensPerStop).toBe(3);
    expect(config.maxTransferSeconds).toBe(18);
    expect(config.maxReopensPerStop).not.toBe(DOOR_DEFAULTS.maxReopensPerStop);
    expect(config.maxTransferSeconds).not.toBe(DOOR_DEFAULTS.maxTransferSeconds);

    // The override still wins over the profile.
    const overridden = resolveDoorConfig(
      centerCar,
      { maxReopensPerStop: 3, maxTransferSeconds: 18 },
      { maxReopensPerStop: 1, maxTransferSeconds: 4 },
    );
    expect(overridden.maxReopensPerStop).toBe(1);
    expect(overridden.maxTransferSeconds).toBe(4);
  });

  it('rejects a negative transfer ceiling', () => {
    expect(() => resolveDoorConfig(centerCar, undefined, { maxTransferSeconds: -1 })).toThrow(
      /maxTransferSeconds/,
    );
  });

  it('lets an explicit override win over the profile and the car', () => {
    const answer: AnswerStageConfig = { dwellPolicy: 'adaptive', maxDwellS: 12 };
    const config = resolveDoorConfig(centerCar, answer, {
      openS: 2.1,
      maxDwellS: 9,
      maxReopensPerStop: 2,
    });
    expect(config.openS).toBe(2.1);
    expect(config.maxDwellS).toBe(9);
    expect(config.maxReopensPerStop).toBe(2);
    // Untouched by the override, still from the profile.
    expect(config.dwellAdaptationGain).toBe(DOOR_DEFAULTS.dwellAdaptationGain);
  });

  it('rejects timings that would make the machine meaningless', () => {
    expect(() => resolveDoorConfig(centerCar, undefined, { openS: 0 })).toThrow(/openS/);
    expect(() => resolveDoorConfig(centerCar, undefined, { closeS: -1 })).toThrow(/closeS/);
    expect(() => resolveDoorConfig(centerCar, undefined, { dwellCarCallS: -0.5 })).toThrow(
      /dwellCarCallS/,
    );
    expect(() => resolveDoorConfig(centerCar, undefined, { dwellAdaptationGain: -1 })).toThrow(
      /dwellAdaptationGain/,
    );
    expect(() => resolveDoorConfig(centerCar, undefined, { openS: Number.NaN })).toThrow(/openS/);
  });

  it('rejects a non-integer or negative reopen budget', () => {
    expect(() => resolveDoorConfig(centerCar, undefined, { maxReopensPerStop: 2.5 })).toThrow(
      /maxReopensPerStop/,
    );
    expect(() => resolveDoorConfig(centerCar, undefined, { maxReopensPerStop: -1 })).toThrow(
      /maxReopensPerStop/,
    );
  });

  it('rejects an adaptive ceiling below the base dwell', () => {
    // maxDwellS 4 < dwellHallCallS 5 would make adaptive dwell shorter than fixed dwell.
    expect(() =>
      resolveDoorConfig(centerCar, { dwellPolicy: 'adaptive', maxDwellS: 4 }),
    ).toThrow(/maxDwellS/);
    // The same ceiling is fine under the fixed policy, where it is inert.
    expect(() => resolveDoorConfig(centerCar, { dwellPolicy: 'fixed', maxDwellS: 4 })).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- *
 * The nominal cycle
 * -------------------------------------------------------------------------- */

describe('open / dwell / close cycle', () => {
  it('runs closed -> opening -> open -> closing -> closed for a centre-opening door', () => {
    const { state, events } = drive(CENTER, [openAt(0, HALL_CALL)]);

    expect(typesOf(events)).toEqual([
      'door.openStarted',
      'door.opened',
      'door.closeStarted',
      'door.closed',
    ]);
    expect(timeOf(events, 'door.openStarted')).toBeCloseTo(0, PRECISION);
    expect(timeOf(events, 'door.opened')).toBeCloseTo(1.8, PRECISION);
    expect(timeOf(events, 'door.closeStarted')).toBeCloseTo(6.8, PRECISION);
    expect(timeOf(events, 'door.closed')).toBeCloseTo(9.8, PRECISION);

    expect(state.state).toBe('closed');
    expect(state.accounting.openingS).toBeCloseTo(1.8, PRECISION);
    expect(state.accounting.dwellS).toBeCloseTo(5, PRECISION);
    expect(state.accounting.closingS).toBeCloseTo(3.0, PRECISION);
    expect(state.accounting.totalS).toBeCloseTo(9.8, PRECISION);
    expect(state.accounting.reopens).toBe(0);
  });

  it('runs the same cycle 1.7 s slower on a side-opening door', () => {
    const { state, events } = drive(SIDE, [openAt(0, HALL_CALL)]);

    expect(timeOf(events, 'door.opened')).toBeCloseTo(2.5, PRECISION);
    expect(timeOf(events, 'door.closeStarted')).toBeCloseTo(7.5, PRECISION);
    expect(timeOf(events, 'door.closed')).toBeCloseTo(11.5, PRECISION);
    expect(state.accounting.totalS).toBeCloseTo(11.5, PRECISION);
  });

  it.each([
    ['centre, car call', CENTER, CAR_CALL, 1.8 + 3 + 3.0],
    ['centre, hall call', CENTER, HALL_CALL, 1.8 + 5 + 3.0],
    ['centre, both', CENTER, BOTH_CALLS, 1.8 + 5 + 3.0],
    ['side, car call', SIDE, CAR_CALL, 2.5 + 3 + 4.0],
    ['side, hall call', SIDE, HALL_CALL, 2.5 + 5 + 4.0],
    ['side, both', SIDE, BOTH_CALLS, 2.5 + 5 + 4.0],
  ])('total stop time — %s', (_label, config, reason, expected) => {
    const { state } = drive(config, [openAt(0, reason)]);
    expect(state.accounting.totalS).toBeCloseTo(expected, PRECISION);
    expect(nominalStopSeconds(config, reason)).toBeCloseTo(expected, PRECISION);
  });

  it('reports the pending transition the kernel should schedule', () => {
    let door = createDoorState(0);
    expect(nextDoorTransitionAt(door, CENTER)).toBeUndefined();
    expect(isDoorMoving(door)).toBe(false);

    door = applyDoorCommand(door, { kind: 'open', reason: HALL_CALL }, 0, CENTER).state;
    expect(door.state).toBe('opening');
    expect(isDoorMoving(door)).toBe(true);
    expect(nextDoorTransitionAt(door, CENTER)).toBeCloseTo(1.8, PRECISION);

    door = advanceDoor(door, 1.8, CENTER).state;
    expect(door.state).toBe('open');
    expect(nextDoorTransitionAt(door, CENTER)).toBeCloseTo(6.8, PRECISION);

    door = advanceDoor(door, 6.8, CENTER).state;
    expect(door.state).toBe('closing');
    expect(nextDoorTransitionAt(door, CENTER)).toBeCloseTo(9.8, PRECISION);

    door = advanceDoor(door, 9.8, CENTER).state;
    expect(door.state).toBe('closed');
    expect(nextDoorTransitionAt(door, CENTER)).toBeUndefined();
  });

  it('exposes an analytic open fraction for the renderer to interpolate', () => {
    let door = createDoorState(0);
    door = applyDoorCommand(door, { kind: 'open', reason: HALL_CALL }, 0, CENTER).state;

    expect(doorOpenFractionAt(door, 0, CENTER)).toBeCloseTo(0, PRECISION);
    expect(doorOpenFractionAt(door, 0.9, CENTER)).toBeCloseTo(0.5, PRECISION);
    expect(doorOpenFractionAt(door, 1.8, CENTER)).toBeCloseTo(1, PRECISION);
    // Never extrapolates past the end of the phase.
    expect(doorOpenFractionAt(door, 5, CENTER)).toBeCloseTo(1, PRECISION);

    door = advanceDoor(door, 6.8, CENTER).state;
    expect(door.state).toBe('closing');
    expect(doorOpenFractionAt(door, 6.8, CENTER)).toBeCloseTo(1, PRECISION);
    expect(doorOpenFractionAt(door, 8.3, CENTER)).toBeCloseTo(0.5, PRECISION);
    expect(doorOpenFractionAt(door, 9.8, CENTER)).toBeCloseTo(0, PRECISION);
  });

  it('reports in-progress accounting mid-stop', () => {
    const door = applyDoorCommand(
      createDoorState(0),
      { kind: 'open', reason: HALL_CALL },
      0,
      CENTER,
    ).state;

    // 1.0 s into the opening phase.
    const opening = doorAccountingAt(door, 1.0, CENTER);
    expect(opening.openingS).toBeCloseTo(1.0, PRECISION);
    expect(opening.totalS).toBeCloseTo(1.0, PRECISION);

    // 2.2 s in: fully open (1.8) plus 0.4 s of dwell.
    const dwelling = doorAccountingAt(door, 2.2, CENTER);
    expect(dwelling.openingS).toBeCloseTo(1.8, PRECISION);
    expect(dwelling.dwellS).toBeCloseTo(0.4, PRECISION);
    expect(dwelling.totalS).toBeCloseTo(2.2, PRECISION);

    // Past the end of the stop, it agrees with the settled record.
    expect(doorAccountingAt(door, 100, CENTER).totalS).toBeCloseTo(9.8, PRECISION);
  });

  it('advancing in one jump equals advancing in small steps', () => {
    const door = applyDoorCommand(
      createDoorState(0),
      { kind: 'open', reason: BOTH_CALLS },
      0,
      CENTER,
    ).state;

    const oneJump = advanceDoor(door, 12, CENTER);

    let stepwise = door;
    const stepEvents: DoorEvent[] = [];
    for (let t = 0; t <= 12.0000001; t += 0.01) {
      const step = advanceDoor(stepwise, Math.min(t, 12), CENTER);
      stepwise = step.state;
      stepEvents.push(...step.events);
    }

    expect(typesOf(stepEvents)).toEqual(typesOf(oneJump.events));
    expect(stepwise.state).toBe(oneJump.state.state);
    expect(stepwise.accounting.totalS).toBeCloseTo(oneJump.state.accounting.totalS, PRECISION);
  });

  it('refuses to run time backwards', () => {
    const door = applyDoorCommand(
      createDoorState(0),
      { kind: 'open', reason: HALL_CALL },
      5,
      CENTER,
    ).state;
    expect(() => advanceDoor(door, 4.9, CENTER)).toThrow(/backwards/i);
    expect(() => applyDoorCommand(door, { kind: 'close' }, 4.9, CENTER)).toThrow(/backwards/i);
  });
});

/* -------------------------------------------------------------------------- *
 * Dwell selection
 * -------------------------------------------------------------------------- */

describe('dwell depends on why the car stopped', () => {
  it('uses the car-call dwell for a car call', () => {
    expect(dwellSecondsFor(CENTER, CAR_CALL)).toBe(3);
  });

  it('uses the longer hall-call dwell for a hall call', () => {
    expect(dwellSecondsFor(CENTER, HALL_CALL)).toBe(5);
  });

  it('uses the longer of the two when the stop answers both', () => {
    expect(dwellSecondsFor(CENTER, BOTH_CALLS)).toBe(5);
    // Not the sum: alighting and boarding passengers do not take turns.
    expect(dwellSecondsFor(CENTER, BOTH_CALLS)).not.toBe(8);
  });

  it('still takes the longer value when a config inverts the usual ordering', () => {
    const inverted = resolveDoorConfig(centerCar, undefined, {
      dwellCarCallS: 6,
      dwellHallCallS: 4,
    });
    expect(dwellSecondsFor(inverted, BOTH_CALLS)).toBe(6);
    expect(dwellSecondsFor(inverted, HALL_CALL)).toBe(4);
  });

  it('falls back to the shorter car-call dwell when no reason is declared', () => {
    expect(dwellSecondsFor(CENTER, { carCall: false, hallCall: false })).toBe(3);
  });

  it('shows up in the cycle: a hall call holds the door 2 s longer than a car call', () => {
    const carCall = drive(CENTER, [openAt(0, CAR_CALL)]);
    const hallCall = drive(CENTER, [openAt(0, HALL_CALL)]);
    expect(
      hallCall.state.accounting.totalS - carCall.state.accounting.totalS,
    ).toBeCloseTo(2, PRECISION);
  });

  it('merges reasons declared during the same stop', () => {
    expect(mergeStopReasons(CAR_CALL, HALL_CALL)).toEqual({
      carCall: true,
      hallCall: true,
      hallQueueLength: 0,
      transferSeconds: 0,
    });
    expect(
      mergeStopReasons(
        { carCall: true, hallCall: false, hallQueueLength: 2, transferSeconds: 4 },
        { carCall: false, hallCall: true, hallQueueLength: 7, transferSeconds: 9 },
      ),
    ).toEqual({ carCall: true, hallCall: true, hallQueueLength: 7, transferSeconds: 9 });
  });

  it('lets a hall call registered while the door is opening lengthen the dwell', () => {
    const { events } = drive(CENTER, [openAt(0, CAR_CALL), openAt(1.0, HALL_CALL)]);
    // The stop now answers both, so the dwell is the hall-call value.
    expect(timeOf(events, 'door.closeStarted')).toBeCloseTo(1.8 + 5, PRECISION);
  });

  it('anchors a merged dwell to when the door opened, not to when the reason arrived', () => {
    // Opens at 1.8 with a 3 s car-call dwell; the hall call at t = 3.0 widens the dwell to
    // 5 s, but measured from 1.8 — so the door still starts closing at 6.8, not at 8.0.
    const { events } = drive(CENTER, [openAt(0, CAR_CALL), openAt(3.0, HALL_CALL)]);
    expect(typesOf(events)).toContain('door.dwellExtended');
    expect(timeOf(events, 'door.closeStarted')).toBeCloseTo(6.8, PRECISION);
  });

  it('cannot be held open indefinitely by repeating the open command', () => {
    const script: (readonly [number, DoorCommand])[] = [openAt(0, CAR_CALL)];
    for (let t = 2; t < 200; t += 0.1) {
      script.push(openAt(t, BOTH_CALLS));
    }
    const { state } = drive(CENTER, script);
    expect(state.state).toBe('closed');
    expect(state.accounting.reopens).toBe(0);
    expect(state.accounting.totalS).toBeCloseTo(9.8, PRECISION);
  });
});

/* -------------------------------------------------------------------------- *
 * Adaptive dwell — a tunable, not a constant
 * -------------------------------------------------------------------------- */

describe('adaptive dwell', () => {
  const adaptive = resolveDoorConfig(centerCar, {
    dwellPolicy: 'adaptive',
    dwellAdaptationGain: 0.4,
    maxDwellS: 12,
  });

  const withQueue = (hallQueueLength: number): DoorStopReason => ({
    carCall: false,
    hallCall: true,
    hallQueueLength,
  });

  it('ignores the hall queue under the fixed policy', () => {
    expect(dwellSecondsFor(CENTER, withQueue(0))).toBe(5);
    expect(dwellSecondsFor(CENTER, withQueue(30))).toBe(5);
  });

  it('extends the dwell by the gain times the queue length', () => {
    expect(dwellSecondsFor(adaptive, withQueue(0))).toBeCloseTo(5, PRECISION);
    expect(dwellSecondsFor(adaptive, withQueue(1))).toBeCloseTo(5.4, PRECISION);
    expect(dwellSecondsFor(adaptive, withQueue(5))).toBeCloseTo(7.0, PRECISION);
    expect(dwellSecondsFor(adaptive, withQueue(10))).toBeCloseTo(9.0, PRECISION);
  });

  it('clamps at maxDwellS', () => {
    // 5 + 0.4 * 17.5 = 12 exactly, so everything from 18 waiting passengers up is clamped.
    expect(dwellSecondsFor(adaptive, withQueue(18))).toBe(12);
    expect(dwellSecondsFor(adaptive, withQueue(50))).toBe(12);
    expect(dwellSecondsFor(adaptive, withQueue(10_000))).toBe(12);
  });

  it('is monotonically non-decreasing in the queue length', () => {
    let previous = 0;
    for (let queue = 0; queue <= 60; queue += 1) {
      const dwell = dwellSecondsFor(adaptive, withQueue(queue));
      expect(dwell).toBeGreaterThanOrEqual(previous);
      expect(dwell).toBeLessThanOrEqual(adaptive.maxDwellS);
      previous = dwell;
    }
  });

  it('degenerates to the fixed policy when the gain is zero', () => {
    const noGain = resolveDoorConfig(centerCar, {
      dwellPolicy: 'adaptive',
      dwellAdaptationGain: 0,
      maxDwellS: 12,
    });
    for (const queue of [0, 3, 40]) {
      expect(dwellSecondsFor(noGain, withQueue(queue))).toBe(
        dwellSecondsFor(CENTER, withQueue(queue)),
      );
    }
  });

  it('treats a missing or negative queue length as nobody waiting', () => {
    expect(dwellSecondsFor(adaptive, { carCall: false, hallCall: true })).toBe(5);
    expect(dwellSecondsFor(adaptive, withQueue(-4))).toBe(5);
  });

  it('lengthens the real stop, and the extension is clamped there too', () => {
    const light = drive(adaptive, [openAt(0, withQueue(2))]);
    expect(light.state.accounting.totalS).toBeCloseTo(1.8 + 5.8 + 3.0, PRECISION);

    const heavy = drive(adaptive, [openAt(0, withQueue(40))]);
    expect(heavy.state.accounting.totalS).toBeCloseTo(1.8 + 12 + 3.0, PRECISION);
  });
});

/* -------------------------------------------------------------------------- *
 * Passenger transfer time — the `2·P·tp` term of the Barney/CIBSE RTT oracle
 * (docs/03-traffic-and-statistics.md § Part 2), localised to one stop.
 * -------------------------------------------------------------------------- */

describe('passenger transfer time', () => {
  const TP_OFFICE = REFERENCE_SPECS.timing.passengerTransferS.office; // 1.2 s
  const TP_RESIDENTIAL = REFERENCE_SPECS.timing.passengerTransferS.residential; // 1.75 s

  /** What the caller declares: `(boarding + alighting) * tp` for this stop. */
  const transferring = (people: number, tp: number = TP_OFFICE): DoorStopReason => ({
    carCall: false,
    hallCall: true,
    hallQueueLength: people,
    transferSeconds: people * tp,
  });

  it('holds the door at least N * tp for N passengers, which the base dwell never did', () => {
    // A twelve-person lobby boarding needs 14.4 s of transfer; the hall-call dwell is 5 s,
    // and the fixed policy has no other lever. Stops used to come out ~10 s short.
    expect(dwellSecondsFor(CENTER, transferring(12))).toBeCloseTo(12 * TP_OFFICE, PRECISION);
    for (let people = 0; people <= 20; people += 1) {
      expect(dwellSecondsFor(CENTER, transferring(people))).toBeGreaterThanOrEqual(
        people * TP_OFFICE - 1e-9,
      );
    }
  });

  it('lengthens the real stop, not just the dwell calculation', () => {
    const { state, events } = drive(CENTER, [openAt(0, transferring(12))]);
    expect(timeOf(events, 'door.closeStarted')).toBeCloseTo(1.8 + 14.4, PRECISION);
    expect(state.accounting.dwellS).toBeCloseTo(14.4, PRECISION);
    expect(state.accounting.totalS).toBeCloseTo(1.8 + 14.4 + 3.0, PRECISION);
    expect(nominalStopSeconds(CENTER, transferring(12))).toBeCloseTo(19.2, PRECISION);
  });

  it('keeps the policy dwell when the transfer is the shorter of the two', () => {
    // Two people stepping out take 2.4 s, but a hall-call passenger still has to walk to the
    // car: the dwell is the longer of the two, never the sum.
    expect(dwellSecondsFor(CENTER, transferring(2))).toBe(5);
    expect(dwellSecondsFor(CENTER, transferring(2))).not.toBeCloseTo(5 + 2.4, PRECISION);
  });

  it('reproduces the office/residential difference in the reference data', () => {
    // 1.75 s per passenger rather than 1.2 s: luggage, strollers, carts (docs/02 § Doors).
    expect(dwellSecondsFor(CENTER, transferring(10, TP_RESIDENTIAL))).toBeCloseTo(17.5, PRECISION);
    expect(dwellSecondsFor(CENTER, transferring(10, TP_OFFICE))).toBeCloseTo(12, PRECISION);
  });

  it('applies under the adaptive policy as well, taking the larger of the two', () => {
    const adaptive = resolveDoorConfig(centerCar, {
      dwellPolicy: 'adaptive',
      dwellAdaptationGain: 0.4,
      maxDwellS: 12,
    });
    // Queue of 6: adaptive grants 5 + 2.4 = 7.4 s, the transfer needs 7.2 s → policy wins.
    expect(dwellSecondsFor(adaptive, transferring(6))).toBeCloseTo(7.4, PRECISION);
    // Queue of 15: adaptive is clamped at 12 s, the transfer needs 18 s → transfer wins.
    expect(dwellSecondsFor(adaptive, transferring(15))).toBeCloseTo(18, PRECISION);
  });

  it('is clamped at maxTransferSeconds, so the stop stays bounded', () => {
    const absurd: DoorStopReason = { carCall: false, hallCall: true, transferSeconds: 10_000 };
    expect(dwellSecondsFor(CENTER, absurd)).toBe(DOOR_DEFAULTS.maxTransferSeconds);

    const tight = resolveDoorConfig(centerCar, { maxTransferSeconds: 12 });
    expect(dwellSecondsFor(tight, absurd)).toBe(12);
    const { state } = drive(tight, [openAt(0, absurd)]);
    expect(state.accounting.totalS).toBeCloseTo(1.8 + 12 + 3.0, PRECISION);
    expect(state.accounting.totalS).toBeLessThanOrEqual(maxStopSeconds(tight) + 1e-9);
  });

  it('is monotonically non-decreasing in the declared transfer', () => {
    let previous = 0;
    for (let seconds = 0; seconds <= 60; seconds += 0.5) {
      const dwell = dwellSecondsFor(CENTER, {
        carCall: false,
        hallCall: true,
        transferSeconds: seconds,
      });
      expect(dwell).toBeGreaterThanOrEqual(previous);
      expect(dwell).toBeLessThanOrEqual(Math.max(5, CENTER.maxTransferSeconds));
      previous = dwell;
    }
  });

  it('treats a missing, negative or non-finite declaration as nobody transferring', () => {
    expect(dwellSecondsFor(CENTER, HALL_CALL)).toBe(5);
    expect(dwellSecondsFor(CENTER, { ...HALL_CALL, transferSeconds: -3 })).toBe(5);
    expect(dwellSecondsFor(CENTER, { ...HALL_CALL, transferSeconds: Number.NaN })).toBe(5);
  });

  it('lets a revised count during the dwell extend the stop, anchored to when it opened', () => {
    // Five people were expected (6.0 s); nine turn up (10.8 s). The door opened at 1.8, so
    // the close starts at 1.8 + 10.8 — the deadline moves, the anchor does not.
    const { events, state } = drive(CENTER, [
      openAt(0, transferring(5)),
      openAt(3.0, transferring(9)),
    ]);
    expect(typesOf(events)).toContain('door.dwellExtended');
    expect(timeOf(events, 'door.closeStarted')).toBeCloseTo(1.8 + 10.8, PRECISION);
    expect(state.reason.transferSeconds).toBeCloseTo(10.8, PRECISION);
  });

  it('cannot be held open indefinitely by revising the count every tick', () => {
    const script: (readonly [number, DoorCommand])[] = [openAt(0, transferring(5))];
    for (let t = 2; t < 200; t += 0.1) {
      script.push(openAt(t, transferring(50)));
    }
    const { state } = drive(CENTER, script);
    expect(state.state).toBe('closed');
    expect(state.accounting.totalS).toBeLessThanOrEqual(maxStopSeconds(CENTER) + 1e-9);
  });
});

/* -------------------------------------------------------------------------- *
 * Reopen
 * -------------------------------------------------------------------------- */

describe('reopen during closing', () => {
  it('reverses to opening and accounts for every second of the stop', () => {
    // Hall call on a centre-opening door: open 0 → 1.8, dwell to 6.8, closing 6.8 → 9.8.
    // The photo-eye trips at 7.8, one third of the way closed, so the door is 2/3 open and
    // needs (1 - 2/3) * 1.8 = 0.6 s to open again.
    const { state, events } = drive(CENTER, [openAt(0, HALL_CALL), obstructAt(7.8)]);

    expect(typesOf(events)).toEqual([
      'door.openStarted',
      'door.opened',
      'door.closeStarted',
      'door.reopenStarted',
      'door.opened',
      'door.closeStarted',
      'door.closed',
    ]);

    const reopen = events.find((entry) => entry.type === 'door.reopenStarted');
    expect(reopen?.from).toBe('closing');
    expect(reopen?.to).toBe('opening');
    expect(reopen?.openFraction).toBeCloseTo(2 / 3, PRECISION);
    expect(reopen?.cause).toBe('obstruction');

    expect(state.state).toBe('closed');
    expect(timeOf(events, 'door.closed')).toBeCloseTo(16.4, PRECISION);

    // 1.8 opening + 0.6 reopening; 5 + 5 dwelling; 1.0 aborted + 3.0 completed closing.
    expect(state.accounting.openingS).toBeCloseTo(2.4, PRECISION);
    expect(state.accounting.dwellS).toBeCloseTo(10, PRECISION);
    expect(state.accounting.closingS).toBeCloseTo(4.0, PRECISION);
    expect(state.accounting.abortedClosingS).toBeCloseTo(1.0, PRECISION);
    expect(state.accounting.totalS).toBeCloseTo(16.4, PRECISION);
    expect(state.accounting.totalS).toBeCloseTo(
      state.accounting.openingS + state.accounting.dwellS + state.accounting.closingS,
      PRECISION,
    );

    // Attribution for the metrics layer: what the reopen cost over a clean stop.
    expect(state.accounting.totalS - nominalStopSeconds(CENTER, HALL_CALL)).toBeCloseTo(
      6.6,
      PRECISION,
    );
    expect(state.accounting.reopens).toBe(1);
    expect(state.accounting.obstructions).toBe(1);
    expect(state.accounting.lateArrivals).toBe(0);
  });

  it('costs less the earlier in the close it happens', () => {
    const early = drive(CENTER, [openAt(0, HALL_CALL), obstructAt(6.9)]);
    const late = drive(CENTER, [openAt(0, HALL_CALL), obstructAt(9.7)]);
    expect(early.state.accounting.totalS).toBeLessThan(late.state.accounting.totalS);
    // Reversing at 0.1 s into the close costs 0.1 closing + 0.06 reopening + 5 extra dwell.
    expect(early.state.accounting.totalS).toBeCloseTo(9.8 + 0.1 + 0.06 + 5, PRECISION);
  });

  it('distinguishes a late arrival from an obstruction', () => {
    const { state, events } = drive(CENTER, [openAt(0, HALL_CALL), lateArrivalAt(7.8)]);
    const reopen = events.find((entry) => entry.type === 'door.reopenStarted');
    expect(reopen?.cause).toBe('lateArrival');
    expect(state.accounting.lateArrivals).toBe(1);
    expect(state.accounting.obstructions).toBe(0);
    expect(state.accounting.reopens).toBe(1);
  });

  it('honours reopenOnLateArrival = false for the courtesy hold but never for the photo-eye', () => {
    const strict = resolveDoorConfig(centerCar, { reopenOnLateArrival: false });

    const late = drive(strict, [openAt(0, HALL_CALL), lateArrivalAt(7.8)]);
    expect(typesOf(late.events)).toContain('door.reopenRefused');
    expect(late.state.accounting.reopens).toBe(0);
    expect(late.state.accounting.refusedReopens).toBe(1);
    expect(late.state.accounting.totalS).toBeCloseTo(9.8, PRECISION);

    // Obstruction is a safety function; no dispatcher setting switches the photo-eye off.
    const obstructed = drive(strict, [openAt(0, HALL_CALL), obstructAt(7.8)]);
    expect(obstructed.state.accounting.reopens).toBe(1);
    expect(obstructed.state.accounting.totalS).toBeCloseTo(16.4, PRECISION);
  });

  it('restarts the dwell when the door is interrupted while still open', () => {
    // Opens at 1.8, dwell would end at 6.8; the photo-eye trips at 4.0 and the timer
    // restarts, so the close starts at 9.0 and finishes at 12.0.
    const { state, events } = drive(CENTER, [openAt(0, HALL_CALL), obstructAt(4.0)]);
    expect(typesOf(events)).toEqual([
      'door.openStarted',
      'door.opened',
      'door.dwellExtended',
      'door.closeStarted',
      'door.closed',
    ]);
    expect(timeOf(events, 'door.closeStarted')).toBeCloseTo(9.0, PRECISION);
    expect(state.accounting.totalS).toBeCloseTo(12.0, PRECISION);
    expect(state.accounting.dwellS).toBeCloseTo(7.2, PRECISION);
    expect(state.accounting.abortedClosingS).toBe(0);
    expect(state.accounting.reopens).toBe(1);
  });

  it('is a free no-op while the door is already opening', () => {
    const { state, events } = drive(CENTER, [openAt(0, HALL_CALL), obstructAt(0.9)]);
    expect(typesOf(events)).toEqual([
      'door.openStarted',
      'door.opened',
      'door.closeStarted',
      'door.closed',
    ]);
    expect(state.accounting.reopens).toBe(0);
    expect(state.accounting.refusedReopens).toBe(0);
    expect(state.accounting.totalS).toBeCloseTo(9.8, PRECISION);
  });

  it('refuses to reopen a shut door and leaves the completed record alone', () => {
    let door = createDoorState(0);
    door = applyDoorCommand(door, { kind: 'open', reason: HALL_CALL }, 0, CENTER).state;
    door = advanceDoor(door, 20, CENTER).state;
    expect(door.state).toBe('closed');
    const settled = door.accounting;

    const step = applyDoorCommand(door, { kind: 'reopen', cause: 'obstruction' }, 21, CENTER);
    expect(step.refusal).toBe('doorClosed');
    expect(typesOf(step.events)).toEqual(['door.reopenRefused']);
    expect(step.state.accounting).toEqual(settled);
  });

  it('ends the dwell early on a close command', () => {
    const { state, events } = drive(CENTER, [openAt(0, HALL_CALL), [3.0, { kind: 'close' }]]);
    const closeStarted = events.find((entry) => entry.type === 'door.closeStarted');
    expect(closeStarted?.at).toBeCloseTo(3.0, PRECISION);
    expect(closeStarted?.forced).toBe(true);
    expect(state.accounting.dwellS).toBeCloseTo(1.2, PRECISION);
    expect(state.accounting.totalS).toBeCloseTo(6.0, PRECISION);
  });

  it('ignores a close command in every state but open', () => {
    // A real door finishes opening before it will close, and there is nothing to ask of a
    // door that is already closing or shut. In each case the state is whatever the passage
    // of time alone would have produced, and no *forced* close appears in the trace.
    for (const [at, expected] of [
      [0.5, 'opening'],
      [8.0, 'closing'],
      [20, 'closed'],
    ] as const) {
      let door = createDoorState(0);
      door = applyDoorCommand(door, { kind: 'open', reason: HALL_CALL }, 0, CENTER).state;
      const step = applyDoorCommand(door, { kind: 'close' }, at, CENTER);
      expect(step.state.state).toBe(expected);
      expect(step.events.filter((entry) => entry.forced === true).length).toBe(0);
      expect(typesOf(step.events)).toEqual(typesOf(advanceDoor(door, at, CENTER).events));
    }
  });

  it('starts a fresh stop, discarding the previous stop record', () => {
    let door = createDoorState(0);
    door = applyDoorCommand(door, { kind: 'open', reason: HALL_CALL }, 0, CENTER).state;
    door = applyDoorCommand(door, { kind: 'reopen', cause: 'obstruction' }, 7.8, CENTER).state;
    door = advanceDoor(door, 30, CENTER).state;
    expect(door.accounting.reopens).toBe(1);

    const second = applyDoorCommand(door, { kind: 'open', reason: CAR_CALL }, 40, CENTER).state;
    expect(second.stopStartedAt).toBe(40);
    expect(second.reopenCount).toBe(0);
    expect(second.accounting.totalS).toBe(0);
    expect(advanceDoor(second, 100, CENTER).state.accounting.totalS).toBeCloseTo(7.8, PRECISION);
  });
});

/* -------------------------------------------------------------------------- *
 * A reason declared too late
 * -------------------------------------------------------------------------- */

describe('open while the door is already closing', () => {
  /** A hall call the dispatcher assigns as the door is shutting. */
  const LATE_HALL_CALL: DoorStopReason = { carCall: false, hallCall: true, hallQueueLength: 8 };

  /** Car call on a centre-opening door: open 0 → 1.8, dwell to 4.8, closing 4.8 → 7.8. */
  const carCallStop = (config: DoorConfig): DoorMachineState =>
    applyDoorCommand(createDoorState(0), { kind: 'open', reason: CAR_CALL }, 0, config).state;

  it('declines the declaration instead of recording a dwell the stop never gets', () => {
    const step = applyDoorCommand(
      carCallStop(CENTER),
      { kind: 'open', reason: LATE_HALL_CALL },
      5.5,
      CENTER,
    );

    expect(step.state.state).toBe('closing');
    expect(step.declined).toBe('doorClosing');
    // The automatic transitions the command was advanced through come first, then the answer
    // to the command itself.
    expect(typesOf(step.events)).toEqual([
      'door.opened',
      'door.closeStarted',
      'door.openDeclined',
    ]);
    const declined = step.events.find((entry) => entry.type === 'door.openDeclined');
    expect(declined?.declined).toBe('doorClosing');
    expect(declined?.at).toBeCloseTo(5.5, PRECISION);
    // 0.7 s into a 3.0 s close.
    expect(declined?.openFraction).toBeCloseTo(1 - 0.7 / 3.0, PRECISION);

    // The stop reason still describes only what this stop actually honoured.
    expect(step.state.reason.hallCall).toBe(false);
    expect(step.state.reason.hallQueueLength).toBe(0);

    const final = advanceDoor(step.state, 100, CENTER).state;
    expect(final.accounting.totalS).toBeCloseTo(7.8, PRECISION);
    expect(nominalStopSeconds(CENTER, final.reason)).toBeCloseTo(7.8, PRECISION);
    // The attribution `DoorTimeAccounting` documents. It used to come out at -2.0 s.
    expect(final.accounting.totalS - nominalStopSeconds(CENTER, final.reason)).toBeCloseTo(
      0,
      PRECISION,
    );
  });

  it('does not corrupt the attribution under an adaptive profile either', () => {
    // The `answer` block of predictive-balanced with a fifteen-deep queue: merging the reason
    // would have claimed an 11 s dwell against a stop that dwelt for 3 s — an overhead of
    // -8.0 s landing in the metrics layer.
    const adaptive = resolveDoorConfig(centerCar, {
      dwellPolicy: 'adaptive',
      dwellAdaptationGain: 0.4,
      maxDwellS: 12,
    });
    const step = applyDoorCommand(
      carCallStop(adaptive),
      { kind: 'open', reason: { carCall: false, hallCall: true, hallQueueLength: 15 } },
      5.5,
      adaptive,
    );
    const final = advanceDoor(step.state, 100, adaptive).state;
    expect(step.declined).toBe('doorClosing');
    expect(final.accounting.totalS).toBeCloseTo(7.8, PRECISION);
    expect(
      final.accounting.totalS - nominalStopSeconds(adaptive, final.reason),
    ).toBeGreaterThanOrEqual(-1e-9);
  });

  it('says nothing when the declaration would not have changed the stop', () => {
    // Re-declaring what the stop already knows loses nothing, so it is a silent no-op: the
    // trace holds exactly what the passage of time alone would have produced.
    const door = carCallStop(CENTER);
    const step = applyDoorCommand(door, { kind: 'open', reason: CAR_CALL }, 5.5, CENTER);
    expect(step.declined).toBeUndefined();
    expect(typesOf(step.events)).toEqual(typesOf(advanceDoor(door, 5.5, CENTER).events));
    expect(typesOf(step.events)).not.toContain('door.openDeclined');
  });

  it('serves the late hall call if the caller follows the decline with a reopen', () => {
    // The documented remedy: `reopen` reverses the door, spends a slot of the bounded reopen
    // budget and earns a real dwell for the widened reason — unlike `open`, which cannot.
    const declined = applyDoorCommand(
      carCallStop(CENTER),
      { kind: 'open', reason: LATE_HALL_CALL },
      5.5,
      CENTER,
    );
    const reopened = applyDoorCommand(
      declined.state,
      { kind: 'reopen', cause: 'lateArrival', reason: LATE_HALL_CALL },
      5.5,
      CENTER,
    );
    expect(reopened.state.state).toBe('opening');
    expect(reopened.state.reason.hallCall).toBe(true);

    const final = advanceDoor(reopened.state, 100, CENTER).state;
    expect(final.accounting.reopens).toBe(1);
    expect(final.accounting.lateArrivals).toBe(1);
    // A real hall-call dwell was granted, so the stop is longer than a clean one, not shorter.
    expect(final.accounting.totalS).toBeGreaterThan(nominalStopSeconds(CENTER, final.reason));
  });

  it('never ends a stop below its own nominal duration, over randomized command streams', () => {
    // The invariant `DoorTimeAccounting` claims: `totalS - nominalStopSeconds(config, reason)`
    // is an *overhead*. Only a `close` command may put a stop under nominal, so this script
    // never issues one.
    const rng = new StreamSet(19700101).doorObstruction;
    const configs = [
      CENTER,
      SIDE,
      resolveDoorConfig(centerCar, {
        dwellPolicy: 'adaptive',
        dwellAdaptationGain: 0.4,
        maxDwellS: 12,
        maxTransferSeconds: 20,
      }),
      resolveDoorConfig(centerCar, { reopenOnLateArrival: false, maxReopensPerStop: 1 }),
      resolveDoorConfig(sideCar, { maxReopensPerStop: 0 }),
    ];

    const checkSettled = (config: DoorConfig, door: DoorMachineState): void => {
      if (door.state !== 'closed' || door.accounting.totalS === 0) {
        return;
      }
      expect(door.accounting.totalS + 1e-9).toBeGreaterThanOrEqual(
        nominalStopSeconds(config, door.reason),
      );
    };

    let declines = 0;
    let stops = 0;
    for (const config of configs) {
      for (let trial = 0; trial < 25; trial += 1) {
        let door = createDoorState(0);
        let t = 0;
        for (let k = 0; k < 60; k += 1) {
          t += rng.nextFloat() * 2.5;
          const reason: DoorStopReason = {
            carCall: rng.nextFloat() < 0.5,
            hallCall: rng.nextFloat() < 0.5,
            hallQueueLength: rng.nextIntInclusive(0, 20),
            transferSeconds: rng.nextFloat() * 25,
          };
          const roll = rng.nextFloat();
          const command: DoorCommand =
            roll < 0.5
              ? { kind: 'open', reason }
              : roll < 0.8
                ? { kind: 'reopen', cause: 'obstruction', reason }
                : { kind: 'reopen', cause: 'lateArrival', reason };

          // Check the stop that has just finished before the next command can start another
          // one and discard its record.
          const settled = advanceDoor(door, t, config).state;
          if (settled.state === 'closed' && settled.accounting.totalS > 0) {
            stops += 1;
          }
          checkSettled(config, settled);

          const step = applyDoorCommand(door, command, t, config);
          if (step.declined !== undefined) {
            declines += 1;
          }
          door = step.state;
        }
        const final = advanceDoor(door, t + 10_000, config).state;
        stops += 1;
        checkSettled(config, final);
      }
    }

    // The script actually reaches the interesting path, or the assertions are vacuous.
    expect(declines).toBeGreaterThan(20);
    expect(stops).toBeGreaterThan(100);
  });
});

/* -------------------------------------------------------------------------- *
 * Reopen while the door is still opening — refusal rules apply here too
 * -------------------------------------------------------------------------- */

describe('reopen while the door is opening', () => {
  /** A hall call with a deep queue, attached to the reopen request. */
  const CROWDED: DoorStopReason = { carCall: false, hallCall: true, hallQueueLength: 15 };

  it('is refused when the profile has switched the courtesy hold off', () => {
    // Opening lasts 1.8 s of a ~9.8 s stop. Requests arriving in it used to return before
    // every refusal rule: no refusal, no event, no count — and the attached reason still
    // bought an 11 s dwell where the policy permits 3 s.
    const strict = resolveDoorConfig(centerCar, {
      dwellPolicy: 'adaptive',
      dwellAdaptationGain: 0.4,
      maxDwellS: 12,
      reopenOnLateArrival: false,
    });
    const opened = applyDoorCommand(createDoorState(0), { kind: 'open', reason: CAR_CALL }, 0, strict);
    const step = applyDoorCommand(
      opened.state,
      { kind: 'reopen', cause: 'lateArrival', reason: CROWDED },
      1.0,
      strict,
    );

    expect(step.state.state).toBe('opening');
    expect(step.refusal).toBe('policyDisabled');
    expect(typesOf(step.events)).toEqual(['door.reopenRefused']);
    expect(step.events[0]?.cause).toBe('lateArrival');
    expect(step.state.accounting.refusedReopens).toBe(1);
    expect(step.state.accounting.reopens).toBe(0);
    // A refused request may not smuggle in a dwell the profile forbids.
    expect(step.state.reason.hallCall).toBe(false);
    expect(advanceDoor(step.state, 100, strict).state.accounting.totalS).toBeCloseTo(
      1.8 + 3 + 3.0,
      PRECISION,
    );
  });

  it('is refused when the reopen budget is spent, including a budget of zero', () => {
    const never = resolveDoorConfig(centerCar, { maxReopensPerStop: 0 });
    const opened = applyDoorCommand(createDoorState(0), { kind: 'open', reason: HALL_CALL }, 0, never);
    const step = applyDoorCommand(opened.state, { kind: 'reopen', cause: 'obstruction' }, 1.0, never);

    expect(step.refusal).toBe('reopenLimit');
    expect(typesOf(step.events)).toEqual(['door.reopenRefused']);
    expect(step.state.accounting.refusedReopens).toBe(1);
    expect(advanceDoor(step.state, 100, never).state.accounting.totalS).toBeCloseTo(9.8, PRECISION);
  });

  it('stays a free no-op when the rules permit it, and still records the reason', () => {
    // Nothing to reverse and no time lost, so no event and no slot of the budget spent — but
    // the reason it carries does set the dwell when the door reaches fully open.
    const opened = applyDoorCommand(createDoorState(0), { kind: 'open', reason: CAR_CALL }, 0, CENTER);
    const step = applyDoorCommand(
      opened.state,
      { kind: 'reopen', cause: 'obstruction', reason: HALL_CALL },
      0.9,
      CENTER,
    );
    expect(step.refusal).toBeUndefined();
    expect(step.events).toEqual([]);
    expect(step.state.accounting.reopens).toBe(0);
    expect(step.state.accounting.refusedReopens).toBe(0);
    expect(step.state.reason.hallCall).toBe(true);
    expect(advanceDoor(step.state, 100, CENTER).state.accounting.totalS).toBeCloseTo(
      9.8,
      PRECISION,
    );
  });

  it('makes a refused request visible in every state a stop passes through', () => {
    // opening 0 → 1.8, open 1.8 → 6.8, closing 6.8 → 9.8.
    const never = resolveDoorConfig(centerCar, { maxReopensPerStop: 0 });
    for (const [at, state] of [
      [1.0, 'opening'],
      [3.0, 'open'],
      [7.5, 'closing'],
    ] as const) {
      const opened = applyDoorCommand(
        createDoorState(0),
        { kind: 'open', reason: HALL_CALL },
        0,
        never,
      );
      const step = applyDoorCommand(opened.state, { kind: 'reopen', cause: 'obstruction' }, at, never);
      expect(step.state.state).toBe(state);
      expect(step.refusal).toBe('reopenLimit');
      expect(typesOf(step.events)).toContain('door.reopenRefused');
      expect(step.state.accounting.refusedReopens).toBe(1);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The bound on door holding
 * -------------------------------------------------------------------------- */

describe('repeated obstruction cannot hold the door forever', () => {
  const bounded = resolveDoorConfig(centerCar, undefined, { maxReopensPerStop: 3 });

  it('refuses reopens past maxReopensPerStop (nudging)', () => {
    let door = createDoorState(0);
    door = applyDoorCommand(door, { kind: 'open', reason: HALL_CALL }, 0, bounded).state;

    const refusals: string[] = [];
    // Interrupt every 0.4 s for two minutes of simulated time.
    for (let t = 7.0; t < 120; t += 0.4) {
      const step = applyDoorCommand(door, { kind: 'reopen', cause: 'obstruction' }, t, bounded);
      door = step.state;
      if (step.refusal !== undefined) {
        refusals.push(step.refusal);
      }
    }

    // Three honoured — one reversing an in-progress close, two restarting the dwell — and
    // every one of the ~280 requests after that refused.
    expect(door.accounting.reopens).toBe(3);
    expect(refusals.length).toBeGreaterThan(200);
    // Once the door has shut, later requests are refused for a different reason.
    expect(new Set(refusals)).toEqual(new Set(['reopenLimit', 'doorClosed']));
    expect(refusals[0]).toBe('reopenLimit');

    const final = advanceDoor(door, 1_000, bounded).state;
    expect(final.state).toBe('closed');
    expect(final.accounting.totalS).toBeLessThanOrEqual(maxStopSeconds(bounded) + 1e-9);
  });

  it('never exceeds the closed-form worst case under 1000 obstructions', () => {
    let door = createDoorState(0);
    door = applyDoorCommand(door, { kind: 'open', reason: BOTH_CALLS }, 0, bounded).state;
    let t = 0.05;
    for (let i = 0; i < 1000; i += 1) {
      door = applyDoorCommand(door, { kind: 'reopen', cause: 'obstruction' }, t, bounded).state;
      t += 0.05;
    }
    const final = advanceDoor(door, t + 1_000, bounded).state;
    expect(final.state).toBe('closed');
    expect(final.accounting.reopens).toBe(3);
    expect(final.accounting.totalS).toBeLessThanOrEqual(maxStopSeconds(bounded) + 1e-9);
  });

  it('disables reopening entirely at maxReopensPerStop = 0', () => {
    const never = resolveDoorConfig(centerCar, undefined, { maxReopensPerStop: 0 });
    const step = applyDoorCommand(
      applyDoorCommand(createDoorState(0), { kind: 'open', reason: HALL_CALL }, 0, never).state,
      { kind: 'reopen', cause: 'obstruction' },
      7.8,
      never,
    );
    expect(step.refusal).toBe('reopenLimit');
    expect(advanceDoor(step.state, 100, never).state.accounting.totalS).toBeCloseTo(
      9.8,
      PRECISION,
    );
  });

  it('states the bound in closed form', () => {
    // openS + (R+1) * dwellCeiling + R * (closeS + openS) + closeS, where dwellCeiling is the
    // largest dwell `dwellSecondsFor` can return: max(policy ceiling, maxTransferSeconds).
    // With transfer switched off the policy ceiling is max(3, 5) = 5 under the fixed policy.
    const noTransfer = resolveDoorConfig(centerCar, undefined, {
      maxReopensPerStop: 3,
      maxTransferSeconds: 0,
    });
    expect(maxStopSeconds(noTransfer)).toBeCloseTo(1.8 + 4 * 5 + 3 * (3.0 + 1.8) + 3.0, PRECISION);

    const adaptive = resolveDoorConfig(centerCar, {
      dwellPolicy: 'adaptive',
      dwellAdaptationGain: 0.4,
      maxDwellS: 12,
      maxTransferSeconds: 0,
    });
    expect(maxStopSeconds(adaptive)).toBeCloseTo(1.8 + 6 * 12 + 5 * (3.0 + 1.8) + 3.0, PRECISION);

    // A caller that can declare transfer time is what the ceiling bounds, so it takes over
    // the dwell term as soon as it exceeds the policy ceiling.
    expect(maxStopSeconds(bounded)).toBeCloseTo(
      1.8 + 4 * DOOR_DEFAULTS.maxTransferSeconds + 3 * (3.0 + 1.8) + 3.0,
      PRECISION,
    );
    expect(maxStopSeconds(resolveDoorConfig(centerCar, { maxTransferSeconds: 2 }))).toBeCloseTo(
      maxStopSeconds(resolveDoorConfig(centerCar, { maxTransferSeconds: 0 })),
      PRECISION,
    );
  });

  it('holds under randomized command sequences drawn from the doorObstruction stream', () => {
    // The draw belongs to the caller, not the door: the machine takes an obstruction as an
    // input so that one configuration reopening more often than another cannot desynchronize
    // any other stream (CLAUDE.md invariant 2).
    const rng = new StreamSet(20260725).doorObstruction;
    const configs = [
      CENTER,
      SIDE,
      bounded,
      resolveDoorConfig(sideCar, {
        dwellPolicy: 'adaptive',
        dwellAdaptationGain: 0.7,
        maxDwellS: 15,
      }),
      resolveDoorConfig(centerCar, { reopenOnLateArrival: false }, { maxReopensPerStop: 1 }),
    ];

    for (const config of configs) {
      const bound = maxStopSeconds(config) + 1e-9;
      for (let trial = 0; trial < 40; trial += 1) {
        let door = createDoorState(0);
        let t = 0;
        door = applyDoorCommand(door, { kind: 'open', reason: BOTH_CALLS }, 0, config).state;

        for (let k = 0; k < 60; k += 1) {
          t += rng.nextFloat() * 1.5;
          const roll = rng.nextFloat();
          const command: DoorCommand =
            roll < 0.45
              ? { kind: 'reopen', cause: 'obstruction' }
              : roll < 0.7
                ? { kind: 'reopen', cause: 'lateArrival' }
                : roll < 0.85
                  ? { kind: 'close' }
                  : {
                      kind: 'open',
                      reason: {
                        carCall: true,
                        hallCall: true,
                        hallQueueLength: rng.nextIntInclusive(0, 40),
                      },
                    };
          door = applyDoorCommand(door, command, t, config).state;
          expect(doorAccountingAt(door, t, config).totalS).toBeLessThanOrEqual(bound);
        }

        const final = advanceDoor(door, t + 10_000, config).state;
        expect(final.state).toBe('closed');
        expect(final.accounting.totalS).toBeLessThanOrEqual(bound);
        expect(final.accounting.totalS).toBeCloseTo(
          final.accounting.openingS + final.accounting.dwellS + final.accounting.closingS,
          PRECISION,
        );
        expect(final.accounting.reopens).toBeLessThanOrEqual(config.maxReopensPerStop);
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Determinism and purity
 * -------------------------------------------------------------------------- */

describe('determinism', () => {
  const script: readonly (readonly [number, DoorCommand])[] = [
    openAt(0, CAR_CALL),
    openAt(1.0, { carCall: true, hallCall: true, hallQueueLength: 6 }),
    obstructAt(7.4),
    lateArrivalAt(9.1),
    [11.0, { kind: 'close' }],
    obstructAt(11.5),
    obstructAt(14.0),
    obstructAt(19.0),
    obstructAt(24.0),
    openAt(60, HALL_CALL),
    obstructAt(64.0),
  ];

  const adaptive = resolveDoorConfig(centerCar, {
    dwellPolicy: 'adaptive',
    dwellAdaptationGain: 0.4,
    maxDwellS: 12,
  });

  it('produces identical transitions across 100 runs', () => {
    const first = drive(adaptive, script);
    const baseline = JSON.stringify({ state: first.state, events: first.events });

    for (let run = 0; run < 100; run += 1) {
      const replay = drive(adaptive, script);
      expect(JSON.stringify({ state: replay.state, events: replay.events })).toBe(baseline);
    }

    // The script actually exercises the interesting paths, or the assertion is vacuous.
    expect(typesOf(first.events)).toContain('door.reopenStarted');
    expect(typesOf(first.events)).toContain('door.dwellExtended');
    expect(typesOf(first.events)).toContain('door.reopenRefused');
    expect(typesOf(first.events).filter((type) => type === 'door.closed').length).toBe(2);
  });

  it('leaves its inputs bit-identical after 10 000 calls', () => {
    // The same discipline `Car.estimateCost()` is held to (CLAUDE.md invariant 1): the
    // dispatcher evaluates hypotheticals in bulk and nothing may drift.
    let door = applyDoorCommand(
      createDoorState(0),
      { kind: 'open', reason: HALL_CALL },
      0,
      CENTER,
    ).state;
    door = advanceDoor(door, 7.5, CENTER).state;
    expect(door.state).toBe('closing');

    const before = JSON.stringify(door);
    for (let i = 0; i < 10_000; i += 1) {
      advanceDoor(door, 7.5 + (i % 100) / 50, CENTER);
      applyDoorCommand(door, { kind: 'reopen', cause: 'obstruction' }, 8.0, CENTER);
      applyDoorCommand(door, { kind: 'close' }, 8.0, CENTER);
      doorOpenFractionAt(door, 8.0, CENTER);
      doorAccountingAt(door, 8.0, CENTER);
    }
    expect(JSON.stringify(door)).toBe(before);
  });

  it('returns frozen values, so a consumer cannot corrupt a door in place', () => {
    const step = applyDoorCommand(
      createDoorState(0),
      { kind: 'open', reason: HALL_CALL },
      0,
      CENTER,
    );
    expect(Object.isFrozen(step.state)).toBe(true);
    expect(Object.isFrozen(step.state.accounting)).toBe(true);
    expect(Object.isFrozen(step.events)).toBe(true);
    expect(() => {
      (step.state as { state: string }).state = 'open';
    }).toThrow(TypeError);
  });
});

/* -------------------------------------------------------------------------- *
 * Kernel integration — the documented recipe actually works
 * -------------------------------------------------------------------------- */

describe('driving the machine from SimKernel', () => {
  it('reproduces the pure trace when scheduled event-by-event', () => {
    const kernel = new SimKernel({ maxEventsPerRun: 100 });
    let door = createDoorState(kernel.now());
    const trace: DoorEvent[] = [];

    const pump = (): void => {
      const at = nextDoorTransitionAt(door, CENTER);
      if (at === undefined) {
        return;
      }
      kernel.schedule(
        at,
        createEvent('door.tick', (_payload, context) => {
          const step = advanceDoor(door, context.time, CENTER);
          door = step.state;
          trace.push(...step.events);
          pump();
        }),
      );
    };

    const opened = applyDoorCommand(door, { kind: 'open', reason: HALL_CALL }, 0, CENTER);
    door = opened.state;
    trace.push(...opened.events);
    pump();

    // The obstruction is an external input: schedule it like any other simulation event and
    // let the door's own pending transition be superseded by the reopen.
    kernel.schedule(
      7.8,
      createEvent('photo.eye', (_payload, context) => {
        const step = applyDoorCommand(
          door,
          { kind: 'reopen', cause: 'obstruction' },
          context.time,
          CENTER,
        );
        door = step.state;
        trace.push(...step.events);
        pump();
      }),
    );

    kernel.runUntilEmpty();

    expect(door.state).toBe('closed');
    expect(kernel.now()).toBeCloseTo(16.4, PRECISION);

    const pure = drive(CENTER, [openAt(0, HALL_CALL), obstructAt(7.8)]);
    expect(typesOf(trace)).toEqual(typesOf(pure.events));
    expect(door.accounting.totalS).toBeCloseTo(pure.state.accounting.totalS, PRECISION);
  });
});

/* -------------------------------------------------------------------------- *
 * The tunable schema (CLAUDE.md invariant 8)
 * -------------------------------------------------------------------------- */

describe('door tunables declare their schema', () => {
  it('declares every control setting the machine reads', () => {
    const ids = new Set(DOOR_PARAMETERS.map((parameter) => parameter.id));
    for (const id of [
      'car.doorOpenS',
      'car.doorCloseS',
      'car.dwellCarCallS',
      'car.dwellHallCallS',
      'answer.dwellPolicy',
      'answer.dwellAdaptationGain',
      'answer.maxDwellS',
      'answer.reopenOnLateArrival',
      'answer.maxReopensPerStop',
      'answer.maxTransferSeconds',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
    expect(ids.size).toBe(DOOR_PARAMETERS.length);
  });

  it('reads every answer.* tunable it declares from the answer stage', () => {
    // A declared `answer.*` id the resolver honours only from an override is a claim the
    // system cannot keep: an optimizer that writes the winning value into a dispatcher
    // profile gets a run at the default instead. This is the generic form of that check.
    const probe = {
      dwellPolicy: 'adaptive',
      dwellAdaptationGain: 0.9,
      maxDwellS: 17,
      reopenOnLateArrival: false,
      maxReopensPerStop: 2,
      maxTransferSeconds: 25,
    } satisfies DoorAnswerSource;

    const declared = DOOR_PARAMETERS.filter((parameter) => parameter.id.startsWith('answer.')).map(
      (parameter) => parameter.id.slice('answer.'.length),
    );
    const probed: Readonly<Record<string, unknown>> = { ...probe };
    expect(new Set(declared)).toEqual(new Set(Object.keys(probed)));

    const resolved: Readonly<Record<string, unknown>> = { ...resolveDoorConfig(centerCar, probe) };
    const defaults: Readonly<Record<string, unknown>> = { ...DOOR_DEFAULTS };
    for (const key of declared) {
      // The probe has to differ from the default, or the assertion below proves nothing.
      expect(probed[key]).not.toEqual(defaults[key]);
      expect(resolved[key]).toEqual(probed[key]);
    }
  });

  it('quotes the same defaults the resolver applies', () => {
    const defaultOf = (id: string): number | string | boolean => {
      const spec = DOOR_PARAMETERS.find((parameter) => parameter.id === id);
      if (spec === undefined) {
        throw new Error(`no declared parameter ${id}`);
      }
      return spec.default;
    };
    expect(defaultOf('answer.dwellPolicy')).toBe(DOOR_DEFAULTS.dwellPolicy);
    expect(defaultOf('answer.dwellAdaptationGain')).toBe(DOOR_DEFAULTS.dwellAdaptationGain);
    expect(defaultOf('answer.maxDwellS')).toBe(DOOR_DEFAULTS.maxDwellS);
    expect(defaultOf('answer.reopenOnLateArrival')).toBe(DOOR_DEFAULTS.reopenOnLateArrival);
    expect(defaultOf('answer.maxReopensPerStop')).toBe(DOOR_DEFAULTS.maxReopensPerStop);
    expect(defaultOf('answer.maxTransferSeconds')).toBe(DOOR_DEFAULTS.maxTransferSeconds);
  });

  it('gives an optimizer everything it needs to sample a valid value', () => {
    for (const parameter of DOOR_PARAMETERS) {
      expect(parameter.description.length).toBeGreaterThan(0);
      switch (parameter.type) {
        case 'continuous':
        case 'integer': {
          const range = parameter.range;
          expect(range).toBeDefined();
          if (range === undefined) {
            throw new Error(`${parameter.id} declares no range`);
          }
          expect(range[0]).toBeLessThanOrEqual(range[1]);
          expect(typeof parameter.default).toBe('number');
          expect(parameter.default as number).toBeGreaterThanOrEqual(range[0]);
          expect(parameter.default as number).toBeLessThanOrEqual(range[1]);
          if (parameter.type === 'integer') {
            expect(Number.isInteger(parameter.default as number)).toBe(true);
          }
          break;
        }
        case 'categorical': {
          const values = parameter.values;
          expect(values).toBeDefined();
          expect(values ?? []).toContain(parameter.default);
          break;
        }
        case 'boolean':
          expect(typeof parameter.default).toBe('boolean');
          break;
      }
    }
  });

  it('marks the adaptive-only parameters inert under the fixed policy', () => {
    for (const id of ['answer.dwellAdaptationGain', 'answer.maxDwellS']) {
      const spec = DOOR_PARAMETERS.find((parameter) => parameter.id === id);
      expect(spec?.activeWhen).toEqual({ 'answer.dwellPolicy': ['adaptive'] });
    }
    // The parameters that are always live declare no gate.
    expect(
      DOOR_PARAMETERS.find((parameter) => parameter.id === 'answer.maxReopensPerStop')?.activeWhen,
    ).toBeUndefined();
  });

  it('covers exactly the four door states', () => {
    expect([...DOOR_STATES]).toEqual(['closed', 'opening', 'open', 'closing']);
  });
});
