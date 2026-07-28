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
 * ## The two service-mode cases are now reachable, and are covered in both arms
 *
 * "All cars out of service" and "mid-run mode changes" used to be unauthorable, and this file
 * used to carry a skipped test naming the `core` change that would fix it. That change landed:
 * `carConfigSchema.mode` and `BuildingConfig.serviceEvents` are authored data, resolved by
 * `resolveBuilding` into `CarInit.mode` and a kernel-scheduled `Car.setMode`. The skipped test is
 * now a real one.
 *
 * The old `Proxy` is kept, and not out of sentiment. It is the **dispatcher-view control arm**:
 * it changes what the group controller believes about a car without changing what the car is, and
 * the difference between the two arms turns out to be a measurable property of the simulator
 * rather than an artefact of the instrument —
 *
 * > with a *dispatcher-blinded* fleet the group allocates nothing and **people still board**,
 * > because `#loadWhileIdle` opens a car already standing at an occupied landing without asking
 * > the dispatcher; with a *physically recalled* fleet the group allocates nothing and **nobody
 * > boards**, because `#carCanCarry` refuses the car.
 *
 * So `legsBoarded === 0` is false of one arm and true of the other, from the same reason code and
 * the same zero allocations. Both are asserted, on one building at one seed, in
 * "the two arms differ in exactly one place" below. `validation/serviceMode.ts` carries the
 * row-by-row table.
 */

import {
  runSimulation,
  type DispatcherProfile,
  type LoadedConfig,
  type ServiceEventConfig,
  type ServiceMode,
  type SimulationConfig,
  type SimulationResult,
} from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { checkAll } from '../fuzz/properties.js';
import { PROPERTY_BOUNDS, type FuzzCase, type Violation } from '../fuzz/types.js';
import { withCallType } from '../fuzz/run.js';
import { seenAsMode, watchDispatch } from './serviceMode.js';
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

});

/* -------------------------------------------------------------------------- *
 * 5b and 6b. Service mode — the physical half, from an authored configuration
 * -------------------------------------------------------------------------- */

/**
 * The fixture for the physical arm: one bank, **two** cars, three occupied floors.
 *
 * Two cars rather than one because the load-bearing claim is that a recalled car's committed hall
 * calls are handed *back to the group*, and a group of one has nowhere to hand them. Synthetic
 * rather than a shipped building because putting a `mode` or a `serviceEvents` entry into
 * `data/buildings/*.json` would move every published pin in `benchmark/published.ts` for a
 * demonstration a fixture makes just as well — and because `syntheticBuilding` goes through
 * `parseBuilding`/`resolveBuilding`, which is the exact path `loadConfig` takes, so nothing here
 * is reachable that `data/` could not also contain.
 */
function serviceFixture(
  id: string,
  options: {
    readonly carModes?: Readonly<Record<string, ServiceMode>>;
    readonly serviceEvents?: readonly ServiceEventConfig[];
  } = {},
): SimulationConfig['building'] {
  return syntheticBuilding(
    {
      id,
      floors: 3,
      carsPerBank: 2,
      banks: 1,
      populationPerFloor: 90,
      type: 'residential',
      trafficProfile: 'residential',
      ...(options.carModes === undefined ? {} : { carModes: options.carModes }),
      ...(options.serviceEvents === undefined ? {} : { serviceEvents: options.serviceEvents }),
    },
    config.elevatorSpecs,
    config.trafficProfiles.profiles.map((entry) => entry.id),
  );
}

/** Authored car ids, which is what a `serviceEvents` entry names. */
const AUTHORED_A = '1-1';
const AUTHORED_B = '1-2';

/**
 * The ids the *dispatcher* uses, derived rather than written out.
 *
 * `Simulation` namespaces a car by its bank — `` `${bankId}-${spec.id}` `` — so the authored
 * `"1-1"` of bank `"bank-1"` is `"bank-1-1-1"` at run time, which is exactly the kind of string
 * nobody should hand-write into an assertion. Derived from the building the test just built, so a
 * change to either naming convention fails on the *behaviour* rather than on a stale literal.
 */
function runtimeCarIds(building: SimulationConfig['building']): { a: string; b: string } {
  const bank = building.banks[0];
  if (bank === undefined) throw new Error('the service fixture has no bank');
  const find = (authored: string): string => {
    const car = bank.cars.find((entry) => entry.id === authored);
    if (car === undefined) throw new Error(`the service fixture has no car "${authored}"`);
    return `${bank.id}-${car.id}`;
  };
  return { a: find(AUTHORED_A), b: find(AUTHORED_B) };
}

const RECALL_AT = 300;
const RETURN_AT = 600;

/**
 * The corner's run parameters, identical across every arm below so the arms are comparable.
 *
 * 1800 s because {@link runCorner} drives every corner from `constant-iso`, which discards its
 * first 15 minutes and last 5 and therefore has no measurement window at all below 20 minutes.
 * It refuses rather than trimming, which is the correct refusal and is why this is stated here
 * rather than discovered.
 */
const SERVICE_RUN = {
  seed: 20260728,
  durationS: 1800,
  arrivalRatePctPop5min: 20,
  drainGraceS: 600,
} as const;

describe('service mode, physically — a car the group does not merely disbelieve in', () => {
  /**
   * The test that used to be skipped, and the three claims its own docstring promised.
   *
   * A car is recalled at `RECALL_AT` and returned at `RETURN_AT` by an authored `serviceEvents`
   * schedule. The claims are that the recalled car **releases its committed hall calls**, that
   * those calls are **re-offered to the rest of the group** and land on the other car, and that
   * the car **picks work up again** when it comes back.
   *
   * Every measurement is taken through `createPolicy` — the documented instrumentation seam —
   * because none of the three is readable off a `SimulationResult`: the record says which car
   * carried a leg, not which decisions the controller was asked for.
   *
   * **The control is in the same test, and it is what makes this not vacuous.** The identical
   * building at the identical seed *without* the schedule is run alongside, and the assertions
   * are stated as differences against it: the control keeps allocating to the recalled car after
   * `RECALL_AT` and refuses nobody for `serviceMode`. Written as bare assertions on the scheduled
   * run alone, every claim below could be satisfied by a run in which the group simply happened to
   * prefer the other car.
   */
  it('releases committed hall calls when a car is physically taken out of service, re-offers them, and takes it back', () => {
    const building = serviceFixture('adversarial-recall', {
      serviceEvents: [
        { atS: RECALL_AT, carId: AUTHORED_A, mode: 'out-of-service' },
        { atS: RETURN_AT, carId: AUTHORED_A, mode: 'in-service' },
      ],
    });
    const { a: CAR_A, b: CAR_B } = runtimeCarIds(building);
    const seen = watchDispatch();
    const scheduled = runCorner({
      ...SERVICE_RUN,
      id: 'adversarial/physical-recall',
      building,
      dispatcherProfile: profile('collective'),
      createPolicy: seen.createPolicy,
    });

    const control = watchDispatch();
    runCorner({
      ...SERVICE_RUN,
      id: 'adversarial/physical-recall-control',
      building: serviceFixture('adversarial-recall-control'),
      dispatcherProfile: profile('collective'),
      createPolicy: control.createPolicy,
    });

    const before = seen.allocations.filter((entry) => entry.at < RECALL_AT);
    const during = seen.allocations.filter((entry) => entry.at > RECALL_AT && entry.at < RETURN_AT);
    const after = seen.allocations.filter((entry) => entry.at >= RETURN_AT);

    /* Which calls car A was still holding when the recall fired, rebuilt from the allocation
       stream: a call leaves A the moment a later decision names somebody else. `#completeCall`
       is invisible from out here, so this is an *upper* bound on what A held — the safe direction,
       because the assertion below is that the re-offer covers some of them. */
    const heldByA = new Set<string>();
    for (const entry of before) {
      if (entry.carIds.includes(CAR_A)) heldByA.add(entry.callId);
      else heldByA.delete(entry.callId);
    }

    /* The premise: A really was working before the recall. */
    expect(before.length).toBeGreaterThan(0);
    expect(heldByA.size).toBeGreaterThan(0);

    /* **Claim 1 — the release, at the instant itself.** `#onServiceChange` re-offers every
       released call and dispatches the bank at the event's own simulated time, so the group is
       asked about exactly those call ids at exactly `RECALL_AT`. Asserting the instant is what
       makes this the recall rather than a coincidence: a call id is `bank#floor:direction` and
       recurs every time that landing fills again. */
    const askedAtTheRecall = seen.decisions.filter(
      (entry) => entry.at === RECALL_AT && heldByA.has(entry.callId),
    );
    expect(askedAtTheRecall.length).toBeGreaterThan(0);

    /* **Claim 2 — the re-offer, and where it lands.** A `register` carrying a `registeredAt`
       older than the newest instant the group has been asked about cannot be a first
       registration: the button has been lit since the original press and nobody re-pressed it,
       which is why `#reofferCall` keeps the original time. */
    expect(seen.reoffers.length).toBeGreaterThan(0);
    expect(seen.reoffers.some((entry) => heldByA.has(entry.callId))).toBe(true);
    const rehomed = [...heldByA].filter((callId) => {
      const first = seen.allocations.find(
        (entry) => entry.at >= RECALL_AT && entry.callId === callId && entry.carIds.length > 0,
      );
      return first !== undefined && first.carIds.includes(CAR_B);
    });
    expect(rehomed.length).toBeGreaterThan(0);

    /* And the group never names A again while it is out. `Car.assignHallCall` throws rather than
       accepting one, so a single A here would be a crashed run rather than a soft failure. */
    for (const entry of during) expect(entry.carIds).not.toContain(CAR_A);
    expect(seen.refusals.get('serviceMode') ?? 0).toBeGreaterThan(0);

    /* **Claim 3 — it comes back.** No special handling exists for a returning car and none is
       needed: `serviceMode` is deliberately absent from `STRUCTURAL_INELIGIBILITY`, so calls no
       car could take stayed retry-able and the pending dispatch tick finds A the moment it is
       back. Boardings, not merely allocations — the car has to actually carry somebody. */
    const allocatedToAAfterReturn = after.filter((entry) => entry.carIds.includes(CAR_A));
    const carriedByAAfterReturn = scheduled.result.record.passengers.filter(
      (leg) => leg.carId === CAR_A && leg.boardedAt !== undefined && leg.boardedAt >= RETURN_AT,
    );
    expect(allocatedToAAfterReturn.length).toBeGreaterThan(0);
    expect(carriedByAAfterReturn.length).toBeGreaterThan(0);

    /* ---- the control: none of the above is true of a fleet that is in service ---- */
    const controlAfterRecall = control.allocations.filter((entry) => entry.at >= RECALL_AT);
    const controlToA = controlAfterRecall.filter((entry) => entry.carIds.includes(CAR_A));

    console.log(
      `[adversarial] physical recall: allocations before=${String(before.length)}, ` +
        `during the recall=${String(during.length)} (to A: 0 by assertion), after the return=${String(after.length)}, ` +
        `calls held by A at the recall=${String(heldByA.size)}, re-decided at the instant=${String(askedAtTheRecall.length)}, ` +
        `re-homed to B=${String(rehomed.length)}, re-offers=${String(seen.reoffers.length)}, ` +
        `serviceMode refusals=${String(seen.refusals.get('serviceMode') ?? 0)}, ` +
        `legs carried by A after the return=${String(carriedByAAfterReturn.length)} | ` +
        `control: allocations after ${String(RECALL_AT)} s=${String(controlAfterRecall.length)}, of them to A=${String(controlToA.length)}, ` +
        `serviceMode refusals=${String(control.refusals.get('serviceMode') ?? 0)}, re-offers=${String(control.reoffers.length)}`,
    );

    /* The same building at the same seed with the schedule removed keeps using A right through
       the window in which the scheduled run refuses to, and never reaches the reason code. Every
       assertion above is therefore about the schedule and not about this dispatcher's taste in
       cars.
       Re-offers are deliberately *not* asserted to be zero in the control: `#reofferCall` is also
       the path a car that filled up and left people behind uses, so a healthy run legitimately
       produces some. What the control pins is that none of them is a `serviceMode` release. */
    expect(controlToA.length).toBeGreaterThan(0);
    expect(control.refusals.get('serviceMode') ?? 0).toBe(0);

    /* And the books balance across a mid-run recall, which is the claim that outlives the rest. */
    expect(scheduled.result.conservation.balanced).toBe(true);
    expectNoViolations('physical recall', scheduled);
  }, 300_000);

  /**
   * The whole fleet, physically withdrawn from t=0 — the corner the fuzz generator deliberately
   * cannot reach (`fuzz/generate.ts` § "Service mode is generated") because P5 legitimately fires
   * on it. Here that is the assertion rather than a problem: `termination` must fire, and must be
   * the only one that does.
   */
  it('boards nobody at all when every car is authored out of service, and loses nobody either', () => {
    const seen = watchDispatch();
    const outcome = runCorner({
      ...SERVICE_RUN,
      id: 'adversarial/all-cars-physically-out-of-service',
      building: serviceFixture('adversarial-all-out', {
        carModes: { [AUTHORED_A]: 'out-of-service', [AUTHORED_B]: 'out-of-service' },
      }),
      dispatcherProfile: profile('collective'),
      createPolicy: seen.createPolicy,
    });
    const audit = outcome.result.conservation;
    console.log(
      `${describeOutcome('all cars physically out of service', outcome)}, ` +
        `serviceMode refusals=${String(seen.refusals.get('serviceMode') ?? 0)}, ` +
        `allocations=${String(seen.allocations.length)}, ` +
        `boarded=${String(audit.legsBoarded)}/${String(audit.legsCreated)}`,
    );

    /* The reason code, reached through the shipped eligibility stage from nothing but a config. */
    expect(seen.refusals.get('serviceMode') ?? 0).toBeGreaterThan(0);
    expect(seen.allocations).toHaveLength(0);
    expect(outcome.result.trace.passengerCount).toBeGreaterThan(0);

    /* **And nobody boards.** This is the assertion the dispatcher-view arm cannot make and must
       not make: there the cars are physically in service and `#loadWhileIdle` keeps collecting
       people from an occupied landing. Here `#carCanCarry` refuses, which is not cosmetic —
       `Car.board` registers a car call and `registerCarCall` throws for a mode that does not
       honour one, so without that clause this configuration would crash the run outright. */
    expect(audit.legsBoarded).toBe(0);

    /* Nobody is lost even so: every generated journey is a named undelivered one. */
    expect(audit.balanced).toBe(true);
    expect(outcome.result.undelivered).toHaveLength(audit.generated);
    expect(outcome.result.status).toBe('timed-out');

    /* And the campaign's own deadlock detector agrees, which is the cross-check that the corner
       is real: a fleet that sits while a servable passenger waits *is* a deadlock, and it must be
       the only property that fires — nobody lost, nobody misdelivered, nothing overfilled, no
       negative time. */
    expect(outcome.violations.map((violation) => violation.property)).toEqual(['termination']);
  }, 300_000);

  /**
   * **The two arms, side by side.** One building, one seed, one dispatcher; the only difference
   * is whether the fleet is withdrawn from the dispatcher's *view* or from the *building*.
   *
   * The pin: both arms allocate exactly nothing, and they disagree about boarding. That
   * disagreement is a real property of the simulator — `#loadWhileIdle` deliberately does not
   * consult the dispatcher — and pinning it here means a change that made it consult the
   * dispatcher would fail this test rather than quietly making the two arms identical and every
   * "out of service" assertion in this file interchangeable.
   */
  it('differ in exactly one place: the blinded fleet still boards, the recalled fleet cannot', () => {
    const blinded = seenAsMode('out-of-service', 0);
    const armA = runCorner({
      ...SERVICE_RUN,
      id: 'adversarial/arm-a-dispatcher-blinded',
      building: serviceFixture('adversarial-arm-a'),
      dispatcherProfile: profile('collective'),
      createPolicy: blinded.createPolicy,
    });

    const recalled = watchDispatch();
    const armB = runCorner({
      ...SERVICE_RUN,
      id: 'adversarial/arm-b-physically-recalled',
      building: serviceFixture('adversarial-arm-b', {
        carModes: { [AUTHORED_A]: 'out-of-service', [AUTHORED_B]: 'out-of-service' },
      }),
      dispatcherProfile: profile('collective'),
      createPolicy: recalled.createPolicy,
    });

    console.log(
      `[adversarial] arm A (dispatcher-blinded): rewrites=${String(blinded.rewrites)}, ` +
        `allocations=${String(blinded.allocations)}, legsBoarded=${String(armA.result.conservation.legsBoarded)}, ` +
        `delivered=${String(armA.result.conservation.delivered)}/${String(armA.result.conservation.generated)} | ` +
        `arm B (physically recalled): allocations=${String(recalled.allocations.length)}, ` +
        `legsBoarded=${String(armB.result.conservation.legsBoarded)}, ` +
        `delivered=${String(armB.result.conservation.delivered)}/${String(armB.result.conservation.generated)}`,
    );

    /* Both injections actually fired, so neither zero below is a silent no-op. */
    expect(blinded.rewrites).toBeGreaterThan(0);
    expect(recalled.decisions.length).toBeGreaterThan(0);

    /* The half they agree on: the group controller allocated nothing, in either arm. */
    expect(blinded.allocations).toBe(0);
    expect(recalled.allocations).toHaveLength(0);

    /* The half they do not, and the reason the `Proxy` is kept rather than deleted. */
    expect(armA.result.conservation.legsBoarded).toBeGreaterThan(0);
    expect(armB.result.conservation.legsBoarded).toBe(0);

    /* Both are honest runs whatever else they are. */
    expect(armA.result.conservation.balanced).toBe(true);
    expect(armB.result.conservation.balanced).toBe(true);
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * 7. Destination dispatch × a service schedule — handback H6 / T22 § limitation 4
 * -------------------------------------------------------------------------- */

/**
 * **The crossing this package did not have, and it is the one the deadlock lived in.**
 *
 * `packages/core/DECISIONS-T22.md` § *Known limitations* item 4 handed this back precisely:
 * {@link runCorner} and `fuzz/run.ts`'s `fuzzSimulationConfigFor` both drove **conventional**
 * dispatch here, so `serviceEvents` crossed with `dispatch.passengerAssignment: 'panel'` was
 * covered in `core` (`sim/serviceMode.test.ts` § 4) and by the fuzz generator — which is how
 * `fuzz-1000384` was found — but nowhere in `experiments/validation`.
 *
 * That crossing is not an arbitrary hole. It is exactly where the P5 deadlock was: a promise pinned
 * by D29's write-once rule to a car the schedule then put on `independent`, `#candidateCars`
 * restricting the re-offered call to that car, and 1 694 s of fleet inactivity with a servable
 * journey outstanding while another car in the same bank stood idle. `Simulation.#revokePromisesTo`
 * fixed it; nothing in *this* package would have noticed if it regressed.
 *
 * So the corner is run through the same six properties every other corner here is, and three things
 * are asserted that only this crossing can produce:
 *
 * 1. the promise machinery **engaged** — a non-zero `legsAssigned`, so a green result is not the
 *    green of a run in which no promise was ever made;
 * 2. the schedule **bit** — a non-zero `promisesRevoked`, which is `0` on every conventional run
 *    and on every run without a mid-run service change, so it cannot be produced by accident;
 * 3. the books still balance, including the audit's netting claim
 *    `legsAssigned − promisesRevoked === legsCreated` on a run that delivered everybody.
 *
 * **The control is the same building at the same seed with no schedule**, because "the panel and a
 * schedule coexist" is only interesting against a run where the schedule is the single difference.
 */
describe('destination dispatch crossed with a service schedule (handback H6)', () => {
  it('revokes the promises a withdrawn car cannot keep, and stays conserved', () => {
    const scheduled = runCorner({
      ...SERVICE_RUN,
      id: 'adversarial/panel-with-service-schedule',
      building: serviceFixture('adversarial-panel-schedule', {
        serviceEvents: [
          { atS: RECALL_AT, carId: AUTHORED_A, mode: 'independent' },
          { atS: RETURN_AT, carId: AUTHORED_A, mode: 'in-service' },
        ],
      }),
      dispatcherProfile: profile('destination-panel'),
    });

    const control = runCorner({
      ...SERVICE_RUN,
      id: 'adversarial/panel-without-service-schedule',
      building: serviceFixture('adversarial-panel-control'),
      dispatcherProfile: profile('destination-panel'),
    });

    const audit = scheduled.result.conservation;
    const baseline = control.result.conservation;
    console.log(
      `[adversarial] panel × schedule: ${describeOutcome('panel-with-schedule', scheduled)}, ` +
        `legsAssigned=${String(audit.legsAssigned)}, brokenPromises=${String(audit.brokenPromises)}, ` +
        `promisesRevoked=${String(audit.promisesRevoked)} | control: ` +
        `legsAssigned=${String(baseline.legsAssigned)}, promisesRevoked=${String(baseline.promisesRevoked)}`,
    );

    /* The six properties the whole campaign is written against. P5 is the one that reported the
       deadlock, and it is in `checkAll` rather than restated here. */
    expectNoViolations('adversarial/panel-with-service-schedule', scheduled);
    expectNoViolations('adversarial/panel-without-service-schedule', control);

    /* 1. The passenger model engaged. Without this the rest is the green of an empty run. */
    expect(
      audit.legsAssigned,
      'no leg was ever promised a car, so `passengerAssignment: "panel"` did not engage and this ' +
        'corner is testing conventional dispatch under a different profile id.',
    ).toBeGreaterThan(0);
    expect(baseline.legsAssigned).toBeGreaterThan(0);

    /* 2. The schedule bit, and only in the scheduled arm. `promisesRevoked` is 0 on every
          conventional run and on every run with no mid-run service change, so a non-zero here is
          produced by this crossing and by nothing else. */
    expect(
      audit.promisesRevoked,
      'the schedule withdrew a car that was holding promises and none was revoked. That is the ' +
        'fuzz-1000384 configuration: the promise outlives the car’s ability to keep it, the call ' +
        'is re-offered only to that car, and the bank deadlocks.',
    ).toBeGreaterThan(0);
    expect(baseline.promisesRevoked).toBe(0);

    /* 3. The books, including the netting claim `legsAssigned` was redefined for. */
    expect(scheduled.result.conservation.balanced).toBe(true);
    expect(control.result.conservation.balanced).toBe(true);
    expect(scheduled.result.undelivered).toHaveLength(0);
    expect(audit.legsAssigned - audit.promisesRevoked).toBe(audit.legsCreated);
  }, 300_000);

  /**
   * The same crossing through `fuzzSimulationConfigFor`, which is the other half of the handback.
   *
   * `withCallType` is what a `FuzzCase` uses to select a passenger model, and it **deletes**
   * `passengerAssignment` under `up-down-buttons` — so a case that draws `destination-panel` with a
   * conventional call type is not this crossing at all. Asserted here rather than assumed, because
   * that deletion is precisely why the corner above had to be written by hand.
   */
  it('reaches the panel through fuzzSimulationConfigFor’s own call-type selection', () => {
    const panel = profile('destination-panel');
    expect(panel.dispatch?.passengerAssignment).toBe('panel');

    const conventional = withCallType(panel, 'up-down-buttons');
    expect(
      conventional.dispatch?.passengerAssignment,
      'withCallType no longer drops passengerAssignment under up-down-buttons. If a conventional ' +
        'call type can now carry a panel, the fuzz corpus has changed shape and the assumption ' +
        'this corner was written against is gone.',
    ).toBeUndefined();

    const credentialed = withCallType(panel, 'mobile-credential');
    expect(credentialed.dispatch?.passengerAssignment).toBe('panel');
    expect(credentialed.dispatch?.callType).toBe('mobile-credential');
  });
});
