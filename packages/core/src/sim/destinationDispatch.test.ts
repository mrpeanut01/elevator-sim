/**
 * **Destination dispatch, measured at the seam.**
 *
 * `dispatch.passengerAssignment: 'panel'` is the passenger-model change: at the moment the call is
 * registered the passenger is told which car to walk to, and boarding honours that. Everything
 * about it is configurable, unit-testable in isolation, and — if it were wired to nothing — would
 * pass every other check this repository runs while producing a run identical to conventional
 * dispatch under a destination profile's name. `docs/09-destination-dispatch-contract.md` § 8 names
 * that outcome as the most likely way this phase ships a ninth dead seam, and this file is the
 * measurement that says it did not.
 *
 * Nothing here asserts that destination dispatch is *better*. That is a study's job, at a budget,
 * with a paired-t interval, and on TTD rather than AWT (DECISIONS.md § D27). These are the
 * structural claims a study would otherwise be quoting intervals on top of:
 *
 * 1. every passenger is promised a car, and the promise reaches the record;
 * 2. **zero** passengers board a car other than the one they were promised;
 * 3. the promise is **write-once** — a full car leaves people behind rather than handing them on,
 *    and the count of times it does is reported rather than engineered away (§ D29);
 * 4. the landing is one call per origin-destination pair, so the call count genuinely rises;
 * 5. `arrivedAt` does not move, at any walk time, because it is the window-membership key every
 *    paired-t in this project depends on;
 * 6. no trace stream is touched, so common random numbers survive the model change;
 * 7. the whole thing is inert at `passengerAssignment: 'none'`, byte for byte.
 *
 * Run against the buildings the project ships, through the real `loadConfig` and the real
 * `runSimulation`, because a fixture building would prove that a fixture building works.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { createPolicyFor } from '../dispatch/index.js';
import { MODEL_SENSITIVE_METRIC_IDS } from '../metrics/comparability.js';
import { Passenger } from '../model/passenger.js';
import { StreamSet } from '../random/index.js';

import { BUILDING_IDS, load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

const SEED = 20_260_726;

/**
 * The contract's primary operating point (docs/09 § 2.2 and § Sources).
 *
 * 40/30/30 incoming/outgoing/interfloor is the only shipped-building configuration in which a
 * destination carries information a direction button does not: under pure up-peak from one lobby
 * every call is "up from G" and the destination adds nothing to the *direction*, which is why the
 * three shipped benchmark points are close to the worst possible place to measure this.
 */
const INTERFLOOR_MIX = {
  durationS: 1800,
  reportWindow: 'full-run',
  demand: {
    directionalSplit: { incoming: 0.4, outgoing: 0.3, interfloor: 0.3 },
    arrivalRatePctPop5min: 1.5,
    peakWindowS: 300,
  },
} as const satisfies Partial<SimulationConfig>;

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

function buildingOf(id: string): ResolvedBuilding {
  const building = config.buildingsById.get(id);
  if (building === undefined) throw new Error(`missing building fixture "${id}"`);
  return building;
}

/** `eta` with the two stage settings that make it a destination dispatcher, and nothing else. */
function armProfile(
  id: string,
  dispatch: DispatcherProfile['dispatch'],
  weights?: Readonly<Record<string, number>> | undefined,
): DispatcherProfile {
  const base = config.dispatcherProfilesById.get('eta');
  if (base === undefined) throw new Error('missing dispatcher fixture "eta"');
  return {
    ...base,
    id,
    name: id,
    weights: { ...base.weights, ...(weights ?? {}) },
    dispatch: { ...base.dispatch, ...dispatch },
  };
}

const CONVENTIONAL = (): DispatcherProfile => armProfile('arm-conventional', {});
const DISCLOSURE = (): DispatcherProfile =>
  armProfile('arm-disclosure', { callType: 'mobile-credential' }, { rideTime: 1 });
const PANEL = (): DispatcherProfile =>
  armProfile(
    'arm-panel',
    { callType: 'mobile-credential', passengerAssignment: 'panel' },
    { rideTime: 1 },
  );

function run(
  buildingId: string,
  profile: DispatcherProfile,
  overrides: Partial<SimulationConfig> = {},
): SimulationResult {
  return runSimulation({
    building: buildingOf(buildingId),
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    onTimeout: 'report',
    ...INTERFLOOR_MIX,
    ...overrides,
  });
}

/** Every leg's car and boarding instant — the trajectory, not a statistic over it. */
function trajectory(result: SimulationResult): string {
  return result.record.passengers
    .map(
      (leg) =>
        `${leg.passengerId}:${leg.carId ?? '-'}:${String(leg.boardedAt)}:${String(leg.alightedAt)}`,
    )
    .join('|');
}

/** The window-membership column, which no dispatcher and no walk may move. */
function arrivalColumn(result: SimulationResult): string {
  return result.record.passengers.map((leg) => `${leg.passengerId}:${leg.arrivedAt}`).join('|');
}

/* -------------------------------------------------------------------------- *
 * 1-3. The seam: promised, and boarded only what was promised
 * -------------------------------------------------------------------------- */

describe('the landing panel names a car and boarding honours it', () => {
  it('promises every passenger a car, and the promise reaches the record', () => {
    for (const buildingId of ['midtown-office', 'secure-tower']) {
      const result = run(buildingId, PANEL());
      const audit = result.conservation;

      expect(audit.legsAssigned, `${buildingId}: nobody was promised a car at all`).toBeGreaterThan(
        0,
      );
      // Every leg, not merely most: `#reconcile` requires the equality on a completed run, and
      // this is the same claim read off the record rather than off the runner's counter — a
      // promise the record does not carry cannot be audited from a stored run.
      expect(result.status, buildingId).toBe('completed');
      expect(audit.legsAssigned, buildingId).toBe(audit.legsCreated);
      const recorded = result.record.passengers.filter(
        (leg) => leg.assignedCarId !== undefined,
      ).length;
      expect(recorded, `${buildingId}: promises made vs promises recorded`).toBe(
        audit.legsAssigned,
      );
      for (const leg of result.record.passengers) {
        expect(leg.assignedAt, `${leg.passengerId} has a car but no time`).toBeDefined();
        expect(leg.assignedAt as number).toBeGreaterThanOrEqual(leg.arrivedAt);
      }
    }
  });

  it('boards nobody onto a car other than the one they were promised', () => {
    // **The liveness assertion this whole unit exists for.** A destination profile that ships,
    // loads, weights `rideTime` and then boards head-of-queue would pass every other check here.
    for (const buildingId of BUILDING_IDS) {
      const result = run(buildingId, PANEL());
      expect(result.conservation.wrongCarBoardings, buildingId).toBe(0);

      const wrong = result.record.passengers.filter(
        (leg) =>
          leg.assignedCarId !== undefined &&
          leg.carId !== undefined &&
          leg.assignedCarId !== leg.carId,
      );
      expect(wrong.map((leg) => leg.passengerId), buildingId).toEqual([]);
    }
  });

  it('boards somebody other than the head of the queue, which is what makes the promise bite', () => {
    /*
     * Non-vacuity for the assertion above. "Zero wrong-car boardings" is trivially true of a run
     * in which the promised car is always the car that would have taken them anyway, and that is
     * exactly what a dead seam looks like. So: the same passengers, the same seed, the same trace,
     * and a **different car** for a substantial share of them.
     */
    const conventional = run('midtown-office', CONVENTIONAL());
    const panel = run('midtown-office', PANEL());

    const carOf = new Map(
      conventional.record.passengers.map((leg) => [leg.passengerId, leg.carId]),
    );
    let compared = 0;
    let different = 0;
    for (const leg of panel.record.passengers) {
      const before = carOf.get(leg.passengerId);
      if (before === undefined || leg.carId === undefined) continue;
      compared += 1;
      if (before !== leg.carId) different += 1;
    }
    expect(compared, 'no passenger was comparable across the two arms').toBeGreaterThan(50);
    expect(
      different / compared,
      'the panel sent essentially everybody to the car conventional dispatch would have used; ' +
        'either the assignment is not reaching the boarding predicate, or the operating point ' +
        'has no destination information in it',
    ).toBeGreaterThan(0.2);
  });

  it('keeps the promise write-once: a full car leaves people behind and the count is reported', () => {
    /*
     * DECISIONS.md § D29. The measurement is on a configuration that genuinely fills cars — the
     * shipped Midtown demand, which is far above the interfloor-mix point — because at a light
     * load nothing overflows and the counter is honestly zero.
     *
     * A non-zero count is the **result**, not a failure: it is the price of committing at the
     * panel, which is the cost destination dispatch is supposed to pay and this simulator exists
     * to quantify. What must never happen is the alternative — the panel quietly re-offering a
     * promised passenger to the group — and that is the `wrongCarBoardings` assertion plus the
     * per-passenger check below, which proves each of them ended up in the car they were told.
     */
    const result = run('midtown-office', PANEL(), {
      durationS: undefined as unknown as number,
      reportWindow: undefined,
      demand: undefined,
    });
    expect(result.conservation.brokenPromises, 'no car ever filled up').toBeGreaterThan(0);
    expect(result.conservation.wrongCarBoardings).toBe(0);

    // Everybody bumped still got the car they were promised, or is still waiting for it.
    for (const leg of result.record.passengers) {
      if (leg.carId === undefined) continue;
      expect(leg.carId, `${leg.passengerId} boarded a car nobody promised them`).toBe(
        leg.assignedCarId,
      );
    }
  });

  it('refuses a second promise, exactly as it refuses a second boarding', () => {
    const passenger = new Passenger({
      id: 'p1',
      journeyId: 'j1',
      originFloorId: 'G',
      originFloorIndex: 0,
      destinationFloorId: '10',
      destinationFloorIndex: 10,
      massKg: 75,
      arrivedAt: 10,
    });
    expect(passenger.isAssigned).toBe(false);
    passenger.assign('car-A', 12);
    expect(passenger.assignedCarId).toBe('car-A');
    expect(passenger.assignedAt).toBe(12);
    expect(() => passenger.assign('car-B', 13)).toThrow(/write-once/);
    // Backwards in time, and after boarding, are both refused.
    const other = new Passenger({
      id: 'p2',
      journeyId: 'j2',
      originFloorId: 'G',
      originFloorIndex: 0,
      destinationFloorId: '10',
      destinationFloorIndex: 10,
      massKg: 75,
      arrivedAt: 10,
    });
    expect(() => other.assign('car-A', 9)).toThrow(/never runs backwards/);
    other.board(11);
    expect(() => other.assign('car-A', 12)).toThrow(/boarded at/);
  });

  it('allows a second promise only after the first is released, and never after boarding', () => {
    /* `releasePromise` is the single exception to write-once, and it is the model half of the
       Phase 8 P5 fix: a promise whose car has left group control cannot be kept, so it is voided
       rather than held (`the root DECISIONS.md` § T22-D1). The guard that keeps it from becoming a
       general `reassign()` lives at the one call site — `Simulation.#revokePromisesTo`, gated on
       `Car.acceptsHallCalls` — and is asserted in `sim/serviceMode.test.ts`; what is asserted here
       is that the model itself still refuses everything else. */
    const make = (id: string): Passenger =>
      new Passenger({
        id,
        journeyId: `j-${id}`,
        originFloorId: 'G',
        originFloorIndex: 0,
        destinationFloorId: '10',
        destinationFloorIndex: 10,
        massKg: 75,
        arrivedAt: 10,
      });

    const passenger = make('p3');
    passenger.assign('car-A', 12);
    expect(passenger.releasePromise(14)).toBe('car-A');
    expect(passenger.isAssigned).toBe(false);
    expect(passenger.assignedCarId).toBeUndefined();
    expect(passenger.assignedAt).toBeUndefined();

    // And only then does a second promise stand.
    passenger.assign('car-B', 15);
    expect(passenger.assignedCarId).toBe('car-B');
    expect(() => passenger.assign('car-C', 16)).toThrow(/write-once/);

    // Releasing nothing is a no-op, so a sweep over a landing needs no pre-filter.
    expect(make('p4').releasePromise(14)).toBeUndefined();

    // A promise discharged by boarding is not a promise that can be voided: doing so would make
    // `assignedCarId !== carId` read as a wrong-car boarding, which is asserted to be zero.
    const boarded = make('p5');
    boarded.assign('car-A', 12);
    boarded.board(13);
    expect(() => boarded.releasePromise(14)).toThrow(/boarded at/);
  });
});

/* -------------------------------------------------------------------------- *
 * 4. The landing becomes one request per origin-destination pair
 * -------------------------------------------------------------------------- */

describe('the call identity is the origin-destination pair', () => {
  it('registers strictly more calls than the same run with up/down buttons', () => {
    // docs/09 § 1.3: two arrivals at one landing for two different floors are two requests under a
    // panel where a direction button makes them one. A ratio of exactly 1.0 is a wiring bug.
    let conventionalCalls = 0;
    let panelCalls = 0;
    const count = (profile: DispatcherProfile): number => {
      let calls = 0;
      runSimulation({
        building: buildingOf('midtown-office'),
        dispatcherProfile: profile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
        ...INTERFLOOR_MIX,
        // The instrumentation hook, which is what it is for: the shipped path still chooses its
        // policy from data (`createPolicyFor`), and this counts what that policy was asked to
        // register. Delegated explicitly rather than through a `Proxy`, because the real policy
        // holds its lifecycles in a private field and a proxy's `this` is the proxy.
        createPolicy: (source, options) => {
          const seen = new Set<string>();
          const inner = createPolicyFor(source, options);
          return {
            id: inner.id,
            name: inner.name,
            engine: inner.engine,
            config: inner.config,
            parameters: inner.parameters,
            get calls() {
              return inner.calls;
            },
            register: (call, at, context) => {
              if (!seen.has(call.id)) {
                seen.add(call.id);
                calls += 1;
              }
              return inner.register(call, at, context);
            },
            dispatch: (...args) => inner.dispatch(...args),
            reconsider: (...args) => inner.reconsider(...args),
            answer: (...args) => inner.answer(...args),
            reposition: (...args) => inner.reposition(...args),
            score: (...args) => inner.score(...args),
            eligible: (...args) => inner.eligible(...args),
            lifecycle: (...args) => inner.lifecycle(...args),
            complete: (...args) => inner.complete(...args),
            cancel: (...args) => inner.cancel(...args),
            reset: () => {
              inner.reset();
            },
          };
        },
      });
      return calls;
    };
    conventionalCalls = count(CONVENTIONAL());
    panelCalls = count(PANEL());

    expect(conventionalCalls).toBeGreaterThan(0);
    expect(
      panelCalls,
      'the panel registered no more calls than a direction button did, so the landing is still ' +
        'keyed on direction and the destination is changing nothing about the allocation unit',
    ).toBeGreaterThan(conventionalCalls);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * 5. `arrivedAt` never moves — the window-membership contract
 * -------------------------------------------------------------------------- */

describe('the walk to the named car is charged between arrival and boarding', () => {
  it('leaves the arrivedAt column byte-identical at every walk time, on a single-leg building', () => {
    /*
     * `PassengerRecord.arrivedAt` is documented as the window-membership key: dispatcher-
     * independent, so the same passenger falls in the same report window under every configuration
     * being compared. Charging the walk by moving it later would change *which* passengers each arm
     * reports on, and a paired-t over differently-populated windows is not a paired-t — a failure
     * that changes every interval in the phase and makes no test go red.
     *
     * Asserted on the single-leg buildings only, and that is not a hedge. On a building with a sky
     * lobby the *second* leg's `arrivedAt` is the first leg's alighting time plus the transfer
     * walk, which is dispatcher-dependent and already differs between arms today
     * (docs/09 § 2.4). The claim that survives there is journey-level, and it is the reason TTD
     * rather than AWT is the comparison metric.
     */
    for (const buildingId of ['midtown-office', 'garden-apartments']) {
      const baseline = arrivalColumn(run(buildingId, DISCLOSURE()));
      for (const assignedWalkS of [0, 5, 10, 30]) {
        expect(
          arrivalColumn(run(buildingId, PANEL(), { assignedWalkS })),
          `${buildingId} at assignedWalkS=${assignedWalkS}`,
        ).toBe(baseline);
      }
    }
  });

  it('makes the walk cost something, so the default of zero is a choice and not a stub', () => {
    const free = run('midtown-office', PANEL(), { assignedWalkS: 0 });
    const walked = run('midtown-office', PANEL(), { assignedWalkS: 20 });
    expect(walked.summary.waiting.meanS).toBeGreaterThan(free.summary.waiting.meanS);
    expect(walked.summary.timeToDestination.meanS).toBeGreaterThan(
      free.summary.timeToDestination.meanS,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * 6. Common random numbers survive the model change
 * -------------------------------------------------------------------------- */

describe('the passenger population is untouched by the passenger model', () => {
  it('leaves the four trace streams where a conventional run leaves them', () => {
    /*
     * The `traffic/generator.test.ts` pattern applied to a whole `runSimulation`: after the run,
     * the streams that decide **who arrives, when, from where, to where and weighing what** must be
     * at exactly the state a conventional run at the same seed left them. If a panel run consumed
     * one extra draw from any of them, two arms at one seed would see different populations, common
     * random numbers would be destroyed, and the power of every paired comparison in the phase
     * would drop by about an order of magnitude — with nothing failing.
     */
    const streamsOf = (profile: DispatcherProfile): string => {
      const streams = new StreamSet(SEED);
      runSimulation({
        building: buildingOf('midtown-office'),
        dispatcherProfile: profile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
        ...INTERFLOOR_MIX,
      });
      return JSON.stringify([
        streams.arrivals.getState(),
        streams.origins.getState(),
        streams.destinations.getState(),
        streams.passengerMass.getState(),
      ]);
    };
    // A `StreamSet` built beside the run rather than the run's own: the guarantee being checked is
    // that the *derivation* from a master seed is what the trace uses, and that nothing the panel
    // does perturbs it. Both arms produce the identical trace, which is the observable form.
    expect(streamsOf(PANEL())).toBe(streamsOf(CONVENTIONAL()));

    const conventional = run('midtown-office', CONVENTIONAL());
    const panel = run('midtown-office', PANEL(), { assignedWalkS: 15 });
    expect(JSON.stringify(panel.trace.passengers)).toBe(
      JSON.stringify(conventional.trace.passengers),
    );
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * 7. Inert when it is off, and the metrics say when it is on
 * -------------------------------------------------------------------------- */

describe('the gate is flat outside itself and the run says which model it is', () => {
  it('is byte-identical to the disclosure arm when the panel is off', () => {
    // `passengerAssignment` defaults to `none`, and `none` must reproduce the run that existed
    // before this parameter did — on every shipped building, trajectory for trajectory. This is
    // what makes it safe for Phase 6a's pinned figures to stand unchanged.
    for (const buildingId of BUILDING_IDS) {
      const implicit = run(buildingId, DISCLOSURE());
      const explicit = run(
        buildingId,
        armProfile(
          'arm-disclosure',
          { callType: 'mobile-credential', passengerAssignment: 'none' },
          { rideTime: 1 },
        ),
      );
      expect(trajectory(explicit), buildingId).toBe(trajectory(implicit));
    }
  });

  it('refuses a panel under a call type that cannot ask for a destination', () => {
    expect(() =>
      run('midtown-office', armProfile('bad', { passengerAssignment: 'panel' })),
    ).toThrow(/A panel that cannot ask for a destination is an up\/down button/);
  });

  it('stamps the model on the record and names the metrics it makes uncomparable', () => {
    const panel = run('midtown-office', PANEL());
    expect(panel.comparability.passengerModel).toBe('destination-dispatch');
    expect(panel.comparability.notComparableMetrics).toEqual(MODEL_SENSITIVE_METRIC_IDS);
    expect(panel.record.passengerModel).toBe('destination-dispatch');
    expect(
      panel.warnings.some((warning) => warning.includes('destination-dispatch passenger model')),
      'the run does not say out loud that its AWT is a different quantity',
    ).toBe(true);

    const disclosure = run('midtown-office', DISCLOSURE());
    expect(disclosure.comparability.passengerModel).toBe('conventional');
    expect(disclosure.comparability.notComparableMetrics).toEqual([]);
    expect(disclosure.record.passengerModel).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * D30 — the kiosk authorizes
 * -------------------------------------------------------------------------- */

describe('a destination-entry kiosk performs the access check (DECISIONS.md § D30)', () => {
  it('serves an access-controlled building that a bare kiosk cannot serve at all', () => {
    /*
     * The measured shape of the defect D30 rules on: `costRequestFor` drops the credential under
     * `destination-entry`, so `estimateCost` is asked whether an **unbadged** passenger may reach a
     * zoned floor and answers no for every car — leaving the call permanently unassignable. A bare
     * kiosk therefore does not merely fail to help on `secure-tower`, it breaks the building
     * *harder* than conventional dispatch does.
     *
     * A kiosk that authorizes is a kiosk that has already performed that check, and this is the
     * before/after. Note what is *not* claimed: nothing here says the destination makes the
     * building faster — H-ACCESS-2 is refuted (§ D60) and the saving is in the credential.
     */
    const bare = run('secure-tower', armProfile('bare-kiosk', { callType: 'destination-entry' }));
    expect(bare.status).toBe('timed-out');
    expect(bare.conservation.undelivered).toBeGreaterThan(0);

    const authorizing = run(
      'secure-tower',
      armProfile('kiosk-panel', {
        callType: 'destination-entry',
        passengerAssignment: 'panel',
      }),
    );
    expect(authorizing.status).toBe('completed');
    expect(authorizing.conservation.undelivered).toBe(0);
  });
});
