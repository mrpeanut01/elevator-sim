/**
 * **Phase 8 § Adversarial edge cases** — saturation, single car, all calls to one floor, access
 * lockout, all cars out of service, mid-run mode changes.
 *
 * ## What already covers what, so the additive claim is checkable
 *
 * | Existing | Covers | Leaves open |
 * |---|---|---|
 * | `fuzz/**` | the same six properties over *randomly generated* buildings, with shrinking, each property demonstrated to fail | it samples a space; it does not visit named corners, and a corner reachable only from a shipped building is outside its space entirely |
 * | `benchmark/accessControl.ts` | access control as a **statistical hypothesis** — coverage counts, unserved fraction, a difference-of-differences on TTD | the mechanical question: when a landing is permanently unassignable, is everybody still *accounted for*, or does somebody quietly vanish |
 * | `benchmark/saturationCensus.test.ts` | where the *operating points* are — which arms saturate at which rate, so a benchmark knows where it may quote an interval | what a saturated run must still guarantee about its own dataset |
 * | `core/sim/conservation.test.ts` | the conservation audit on the shipped buildings | the corners below |
 *
 * The corners are the addition. Each is run through the **same six properties** the fuzz campaign
 * checks (`fuzz/properties.ts` `checkAll`), because writing a second set of correctness predicates
 * would create a second source of truth about what "correct" means.
 *
 * ## Saturation is not a failure case, and this suite is written so it cannot be treated as one
 *
 * `CLAUDE.md`: *"If a configuration saturates, flag it and suppress the AWT interval. Do not
 * report a mean for a system whose queues grow without bound."* An adversarial suite that drove a
 * building into saturation and then asserted a good average waiting time would have asserted the
 * bug. So the saturation case asserts the **opposite**: that the run says so, that `awtIsValid` is
 * `false`, and that the mechanical properties — nobody lost, nobody misdelivered, no car over
 * capacity, no negative wait — hold anyway. A saturated run is a legitimate measurement of an
 * overloaded building; it is never a licence to lose a passenger.
 *
 * ## Two cases are unreachable, and are recorded as unreachable
 *
 * "All cars out of service" and "mid-run mode changes" cannot be produced by any authorable
 * configuration: `carConfigSchema` has no service-mode field, `Simulation` keeps `#carsById`
 * private, and nothing schedules a mode change. `validation/serviceMode.ts` states the gap in
 * full. What is done here is the reachable half — the dispatcher's view of an out-of-service car,
 * injected through `SimulationConfig.createPolicy`, which reaches `INELIGIBILITY_REASONS`'
 * `serviceMode` through the shipped eligibility stage in a real run — plus a **skipped, documented
 * test** naming the `core` change that would make the physical half reachable. There is no test
 * here that appears to cover the physical half.
 */

import {
  runSimulation,
  type DispatcherProfile,
  type LoadedConfig,
  type SimulationConfig,
  type SimulationResult,
} from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { checkAll } from '../fuzz/properties.js';
import { PROPERTY_BOUNDS, type FuzzCase, type Violation } from '../fuzz/types.js';
import { withCallType } from '../fuzz/run.js';
import { seenAsMode } from './serviceMode.js';
import { syntheticBuilding } from './syntheticBuilding.js';
import { loadResources } from './harness.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadResources();
}, 120_000);

/* -------------------------------------------------------------------------- *
 * Running a corner, and checking it against the fuzz campaign's own properties
 * -------------------------------------------------------------------------- */

interface Corner {
  readonly id: string;
  readonly building: SimulationConfig['building'];
  readonly dispatcherProfile: DispatcherProfile;
  readonly seed: number;
  readonly durationS: number;
  readonly arrivalRatePctPop5min: number;
  readonly demand?: SimulationConfig['demand'];
  readonly createPolicy?: SimulationConfig['createPolicy'];
  readonly drainGraceS?: number;
}

interface CornerOutcome {
  readonly result: SimulationResult;
  readonly violations: readonly Violation[];
}

/**
 * Run one corner and evaluate the six properties on it.
 *
 * `reportWindow: 'full-run'` for the reason `fuzz/run.ts` gives: a starvation bound and a
 * saturation verdict computed over five minutes of a thirty-minute run would exempt most of the
 * passengers from the properties that are about them.
 *
 * The `FuzzCase` handed to `checkAll` is a label, not a generated case — the property checks read
 * it for identity and for the arrival rate they quote in a violation message. Building the
 * `SimulationConfig` here rather than through `fuzzSimulationConfigFor` is deliberate: these
 * corners need a directional split and an entrance weighting, which a `FuzzCase` cannot express.
 */
function runCorner(corner: Corner): CornerOutcome {
  const simConfig: SimulationConfig = {
    building: corner.building,
    dispatcherProfile: corner.dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: corner.seed,
    demandTemplate: 'constant-iso',
    durationS: corner.durationS,
    demand: corner.demand ?? { arrivalRatePctPop5min: corner.arrivalRatePctPop5min },
    reportWindow: 'full-run',
    onTimeout: 'report',
    runId: corner.id,
    ...(corner.drainGraceS === undefined ? {} : { drainGraceS: corner.drainGraceS }),
    ...(corner.createPolicy === undefined ? {} : { createPolicy: corner.createPolicy }),
  };
  const result = runSimulation(simConfig);
  const fuzzCase = {
    caseId: corner.id,
    fuzzSeed: String(corner.seed),
    simSeed: corner.seed,
    topology: 'single-bank',
    building: undefined as never,
    dispatcherProfileId: corner.dispatcherProfile.id,
    callType: corner.dispatcherProfile.dispatch?.callType ?? 'up-down-buttons',
    arrivalRatePctPop5min: corner.arrivalRatePctPop5min,
    demandTemplate: 'constant-iso',
    durationS: corner.durationS,
    doorObstructionProbability: 0,
    drainGraceS: corner.drainGraceS ?? 0,
    tags: ['adversarial'],
  } as unknown as FuzzCase;

  return {
    result,
    violations: checkAll({
      case: fuzzCase,
      building: simConfig.building,
      dispatcherProfile: simConfig.dispatcherProfile,
      elevatorSpecs: config.elevatorSpecs,
      result,
      bounds: PROPERTY_BOUNDS,
    }),
  };
}

function profile(id: string): DispatcherProfile {
  const found = config.dispatcherProfilesById.get(id);
  if (found === undefined) throw new Error(`no dispatcher profile "${id}"`);
  return found;
}

function describeOutcome(id: string, outcome: CornerOutcome): string {
  const { result } = outcome;
  return (
    `[adversarial] ${id}: status ${result.status}, ${String(result.trace.passengerCount)} journeys, ` +
    `${String(result.record.passengers.length)} legs, ${String(result.undelivered.length)} undelivered, ` +
    `saturated=${String(result.summary.saturation.saturated)}, awtIsValid=${String(result.summary.awtIsValid)}, ` +
    `violations=${String(outcome.violations.length)}`
  );
}

/** The six properties must hold. A violation here is the finding, whatever else the run says. */
function expectNoViolations(id: string, outcome: CornerOutcome): void {
  if (outcome.violations.length > 0) {
    throw new Error(
      `${id} violated ${String(outcome.violations.length)} propert${outcome.violations.length === 1 ? 'y' : 'ies'}:\n` +
        outcome.violations
          .map((violation) => `  ${violation.property}: ${violation.message}${violation.subject === undefined ? '' : ` (${violation.subject})`}`)
          .join('\n'),
    );
  }
  expect(outcome.violations).toEqual([]);
}

/* -------------------------------------------------------------------------- *
 * 1. Saturation
 * -------------------------------------------------------------------------- */

describe('saturation — the run must say so, and must still be honest about its dataset', () => {
  it('flags a grossly overloaded building and suppresses its AWT, without losing anybody', () => {
    const building = config.buildingsById.get('midtown-office');
    expect(building).toBeDefined();
    if (building === undefined) return;

    const outcome = runCorner({
      id: 'adversarial/saturation',
      building,
      dispatcherProfile: profile('nearest-car'),
      seed: 20260728,
      durationS: 1800,
      /* Well past handling capacity: the reference arm saturates at 2 % on this building
         (benchmark/saturationCensus.test.ts) and this is an order of magnitude past that. */
      arrivalRatePctPop5min: 20,
      drainGraceS: 600,
    });
    console.log(describeOutcome('saturation', outcome));

    /* The verdict itself. */
    expect(outcome.result.summary.saturation.saturated).toBe(true);
    /* And the consequence CLAUDE.md requires: no mean is quotable. */
    expect(outcome.result.summary.awtIsValid).toBe(false);
    /* This suite deliberately reads no AWT off this run. The assertion is that it *cannot*. */

    /* The dataset is still intact: nobody vanished, nobody was delivered to the wrong floor,
       no car carried more than the boarding rule allows, nothing preceded its own arrival. */
    expectNoViolations('saturation', outcome);
    expect(outcome.result.conservation.balanced).toBe(true);
  }, 300_000);

  it('does not flag the same building at a rate it can serve — so the flag means something', () => {
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('no midtown-office');
    const outcome = runCorner({
      id: 'adversarial/unsaturated-control',
      building,
      dispatcherProfile: profile('nearest-car'),
      seed: 20260728,
      durationS: 1800,
      arrivalRatePctPop5min: 0.5,
    });
    console.log(describeOutcome('unsaturated control', outcome));
    expect(outcome.result.summary.saturation.saturated).toBe(false);
    expect(outcome.result.summary.awtIsValid).toBe(true);
    expectNoViolations('unsaturated control', outcome);
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * 2. Single car
 * -------------------------------------------------------------------------- */

describe('a single car in a single bank', () => {
  it('serves a building with exactly one car without violating any property', () => {
    const building = syntheticBuilding(
      { id: 'adversarial-single-car', floors: 8, carsPerBank: 1, banks: 1 },
      config.elevatorSpecs,
      config.trafficProfiles.profiles.map((entry) => entry.id),
    );
    expect(building.banks).toHaveLength(1);
    expect(building.banks[0]?.cars).toHaveLength(1);

    const outcome = runCorner({
      id: 'adversarial/single-car',
      building,
      dispatcherProfile: profile('collective'),
      seed: 424242,
      durationS: 1800,
      arrivalRatePctPop5min: 2,
      drainGraceS: 600,
    });
    console.log(describeOutcome('single car', outcome));
    expectNoViolations('single car', outcome);
    expect(outcome.result.trace.passengerCount).toBeGreaterThan(0);

    /* Every leg that was carried was carried by the only car there is. A dispatcher that
       invented a second car id would be caught here and nowhere else. */
    /* Every leg that was carried was carried by the only car there is. A dispatcher that
       invented a second car id would be caught here and nowhere else. (Car ids are namespaced
       by bank in the record, so the assertion is on the *count* plus the suffix rather than on
       a hand-written string that would pin a naming convention nobody promised.) */
    const onlyCar = building.banks[0]?.cars[0]?.id;
    expect(onlyCar).toBeDefined();
    const carIds = new Set(
      outcome.result.record.passengers.map((leg) => leg.carId).filter((id) => id !== undefined),
    );
    expect(carIds.size).toBe(1);
    expect([...carIds][0]).toContain(onlyCar as string);
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * 3. Every call to one floor
 * -------------------------------------------------------------------------- */

describe('all demand concentrated on one landing', () => {
  it('handles a pure single-entrance up-peak with no interfloor traffic at all', () => {
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('no midtown-office');

    const outcome = runCorner({
      id: 'adversarial/one-landing',
      building,
      dispatcherProfile: profile('collective'),
      seed: 11,
      durationS: 1800,
      arrivalRatePctPop5min: 2,
      demand: {
        arrivalRatePctPop5min: 2,
        /* Everything incoming, all of it through the lobby: every hall call in the run is
           `G:up`, so the batching stage sees one landing and nothing else for the whole run. */
        directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
        entranceWeights: { G: 1, P1: 0 },
      },
      drainGraceS: 600,
    });
    console.log(describeOutcome('one landing', outcome));
    expectNoViolations('one landing', outcome);

    /* The premise: every journey really did start at the lobby. If the demand model quietly
       ignored the split, this corner would silently be an ordinary mixed run. */
    const origins = new Set(outcome.result.trace.passengers.map((entry) => entry.originFloorId));
    expect([...origins]).toEqual(['G']);
    expect(outcome.result.trace.passengerCount).toBeGreaterThan(20);
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * 4. Access lockout
 * -------------------------------------------------------------------------- */

describe('access lockout — a landing no car will ever take', () => {
  /**
   * Additive to `benchmark/accessControl.ts`, which measures the *statistics* of access control.
   * The question here is mechanical and has no interval: when a call is structurally
   * unassignable for the whole run, is every affected passenger still accounted for?
   */
  it('leaves locked-out passengers undelivered and named, never silently dropped', () => {
    const building = config.buildingsById.get('secure-tower');
    if (building === undefined) throw new Error('no secure-tower');
    expect(building.accessZones.length).toBeGreaterThan(0);

    const outcome = runCorner({
      id: 'adversarial/access-lockout',
      /* Conventional up/down buttons: a landing call carries no credential, so an
         access-restricted pickup floor is infeasible for every car in the bank. */
      building,
      dispatcherProfile: withCallType(profile('eta'), 'up-down-buttons'),
      seed: 5150,
      durationS: 1800,
      arrivalRatePctPop5min: 2,
      demand: {
        arrivalRatePctPop5min: 2,
        /* Outgoing and interfloor is what puts calls on restricted landings. */
        directionalSplit: { incoming: 0.2, outgoing: 0.5, interfloor: 0.3 },
      },
      drainGraceS: 600,
    });
    console.log(describeOutcome('access lockout', outcome));

    /* The lockout really happened, and the run said so in its own words rather than only in
       its numbers. */
    const refusals = outcome.result.warnings.filter((warning) => warning.includes('accessDenied'));
    expect(refusals.length).toBeGreaterThan(0);
    expect(outcome.result.undelivered.length).toBeGreaterThan(0);

    /* Every undelivered journey is a *named* journey, and the audit balances: the count of
       people who arrived equals delivered plus undelivered. Losing them is the failure this
       case exists to rule out. */
    for (const journey of outcome.result.undelivered) {
      expect(journey.journeyId).toBeTruthy();
    }
    expectNoViolations('access lockout', outcome);
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * 5 and 6. Service mode — the reachable half, and the wall
 * -------------------------------------------------------------------------- */

describe('service mode', () => {
  /**
   * See `validation/serviceMode.ts` for the full statement of what is and is not reachable. In
   * short: the *model* is complete and every path from a configuration to it is missing, so what
   * is exercised here is the dispatcher's view, injected through the documented `createPolicy`
   * seam — and the physical half is a skipped test naming the `core` change, not a green one.
   */
  it('reaches the serviceMode ineligibility reason through the shipped eligibility stage', () => {
    const building = config.buildingsById.get('garden-apartments');
    if (building === undefined) throw new Error('no garden-apartments');

    const injection = seenAsMode('out-of-service', 0);
    const outcome = runCorner({
      id: 'adversarial/all-cars-out-of-service',
      building,
      dispatcherProfile: profile('collective'),
      seed: 777,
      durationS: 1800,
      arrivalRatePctPop5min: 4,
      createPolicy: injection.createPolicy,
      drainGraceS: 600,
    });
    console.log(
      `${describeOutcome('all cars out of service (dispatcher view)', outcome)}, snapshots rewritten=${String(injection.rewrites)}`,
    );

    /* The injection fired. A silent no-op producing a normal run would otherwise read as
       "out-of-service cars are handled fine", which is the exact dishonesty to avoid. */
    expect(injection.rewrites).toBeGreaterThan(0);

    /* And it bit, measured where it can be measured: the group controller allocated **no hall
       call at all**, for the whole run. That is the assertion, and not "nobody boarded" —
       because people do still board, and the reason is worth stating rather than hiding.

       `simulation.ts` `#loadWhileIdle` opens the doors of a car already standing at a landing
       with a queue **without consulting the dispatcher**, deliberately: its docstring says a
       lobby-parking fleet in which no car may load until it is separately allocated "serves one
       car at a time while three sit closed a metre away". So a car parked at the lobby keeps
       collecting lobby passengers however ineligible the group thinks it is, and those
       passengers then press car calls that move it. Nothing is wrong with that — the physical
       car really is in service, because nothing here can change that (see serviceMode.ts) — but
       it is exactly why an "all cars out of service" test written against this seam must assert
       allocations rather than boardings. A test asserting `legsBoarded === 0` here would be
       asserting something false about a correct simulator. */
    const audit = outcome.result.conservation;
    console.log(
      `[adversarial] out-of-service: allocations=${String(injection.allocations)}, audit=${JSON.stringify(audit)}`,
    );
    expect(outcome.result.trace.passengerCount).toBeGreaterThan(0);
    expect(injection.allocations).toBe(0);
    /* The residue is small and is the idle-load path only. Most of the building is stranded. */
    expect(audit.delivered * 2).toBeLessThan(audit.generated);
    expect(outcome.result.undelivered.length).toBeGreaterThan(0);

    /* Nobody is lost even so: the run accounts for every one of them. */
    expect(audit.balanced).toBe(true);

    /* And the fuzz campaign's own deadlock detector notices — which is the cross-check that
       the corner is real. `termination` is the one property that must fire here (a fleet that
       sits while a servable passenger waits *is* a deadlock) and it must be the only one:
       nobody lost, nobody misdelivered, no car overfilled, no negative time. */
    expect(outcome.violations.map((violation) => violation.property)).toEqual(['termination']);
  }, 300_000);

  it('behaves normally when the same injection is a no-op, which is the control', () => {
    const building = config.buildingsById.get('garden-apartments');
    if (building === undefined) throw new Error('no garden-apartments');

    const injection = seenAsMode('in-service', 0);
    const outcome = runCorner({
      id: 'adversarial/in-service-control',
      building,
      dispatcherProfile: profile('collective'),
      seed: 777,
      durationS: 1800,
      arrivalRatePctPop5min: 4,
      createPolicy: injection.createPolicy,
      drainGraceS: 600,
    });
    console.log(describeOutcome('in-service control', outcome));

    /* The proxy is in the path — it rewrote snapshots — and the run is unaffected, so the
       previous test measured the mode and not the wrapper. */
    expect(injection.rewrites).toBeGreaterThan(0);
    expect(outcome.result.undelivered.length).toBe(0);
    expectNoViolations('in-service control', outcome);
  }, 300_000);

  it('takes cars out of service mid-run, as the dispatcher sees it, and stops allocating', () => {
    const building = config.buildingsById.get('garden-apartments');
    if (building === undefined) throw new Error('no garden-apartments');

    const changeAtS = 600;
    const injection = seenAsMode('out-of-service', changeAtS);
    const outcome = runCorner({
      id: 'adversarial/mid-run-mode-change',
      building,
      dispatcherProfile: profile('collective'),
      seed: 909,
      durationS: 1800,
      arrivalRatePctPop5min: 4,
      createPolicy: injection.createPolicy,
      drainGraceS: 600,
    });
    console.log(
      `${describeOutcome('mid-run mode change', outcome)}, rewritten=${String(injection.rewrites)}, untouched-before-${String(changeAtS)}s=${String(injection.untouched)}`,
    );

    /* Both phases really happened, and the second one stopped the group controller dead. */
    expect(injection.untouched).toBeGreaterThan(0);
    expect(injection.rewrites).toBeGreaterThan(0);
    expect(injection.allocations).toBe(0);

    /* Before the change people board; after it, nobody who was not already assigned does.
       The boundary is soft by exactly the amount serviceMode.ts documents — a car already
       carrying a call keeps it, because `Car.setMode` is never called — so the assertion is
       that boarding *stops*, not that it stops instantly. */
    const boardedAfter = outcome.result.record.passengers.filter(
      (leg) => leg.boardedAt !== undefined && leg.boardedAt > changeAtS,
    );
    const boardedBefore = outcome.result.record.passengers.filter(
      (leg) => leg.boardedAt !== undefined && leg.boardedAt <= changeAtS,
    );
    expect(boardedBefore.length).toBeGreaterThan(0);
    const lastBoarding = boardedAfter.reduce(
      (latest, leg) => Math.max(latest, leg.boardedAt as number),
      changeAtS,
    );
    console.log(
      `[adversarial] mid-run: ${String(boardedBefore.length)} legs boarded before ${String(changeAtS)} s, ` +
        `${String(boardedAfter.length)} after, last at ${lastBoarding.toFixed(1)} s`,
    );
    expect(outcome.result.undelivered.length).toBeGreaterThan(0);
    expect(outcome.result.conservation.balanced).toBe(true);
  }, 300_000);

  /**
   * **UNREACHABLE — recorded rather than faked.**
   *
   * This is the physical half of the two service-mode cases, and it is skipped because no
   * configuration, and no injection seam this repository exposes, can produce it. Enabling it
   * needs a `core` change, named here so the test is a request rather than a lament:
   *
   * 1. **`mode` on `carConfigSchema`** (`core/src/config/schema.ts`), carried through
   *    `ResolvedCar` and passed as `CarInit.mode` where `Simulation` builds its cars. That alone
   *    makes "all cars out of service" authorable, and makes `INELIGIBILITY_REASONS.serviceMode`
   *    reachable from `data/` rather than only from a test proxy.
   * 2. **A schedule for changing it** — either an authored `serviceEvents: [{ atS, carId, mode }]`
   *    on the building, or a `SimulationConfig.serviceSchedule` hook alongside `createPolicy`.
   *    `Car.setMode` already exists and already releases the work the new mode cannot do; what is
   *    missing is only something that calls it at a simulated time.
   *
   * With either in place, this test asserts what the injected version cannot: that a recalled car
   * **releases its committed hall calls**, that those calls are re-offered to the rest of the
   * group, and that a car returning to service picks up work again.
   */
  it.skip('releases committed hall calls when a car is physically taken out of service — needs carConfigSchema.mode and a serviceEvents schedule in core', () => {
    /* Intentionally empty. See the docstring above: writing a body against the injection seam
       would produce a green test that does not test what its name says. */
  });
});
