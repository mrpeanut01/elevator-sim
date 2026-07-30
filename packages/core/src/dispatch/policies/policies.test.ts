/**
 * The acceptance bar, and the two invariants this directory is most likely to break.
 *
 * ## The bar
 *
 * > *Every profile in `data/dispatcher-profiles.json` builds a working policy and runs a full
 * > simulation to completion on Midtown Office.*
 *
 * Both halves matter and they fail differently. "Builds a working policy" catches a profile
 * weighting a term nothing implements or declaring a stage setting the resolver rejects — a
 * load-time error. "Runs to completion" catches the subtler one: a profile whose stage settings
 * *resolve* but whose behaviour never clears a landing, which shows up as a `timed-out` run with
 * undelivered passengers and, in a batch, as a saturated cell whose AWT must be suppressed rather
 * than reported (docs/03-traffic-and-statistics.md).
 *
 * **What this file does *not* establish, stated up front.** The full-run half runs each profile
 * once, through whichever aggregation the profile declares — `auction.aggregation` selects the
 * policy factory, so `auction-multi-round` really does run its contract net inside
 * `runSimulation`. What is still absent here is any *comparison*: one replication per profile
 * proves a configuration terminates and clears its landings, and nothing in this file is a claim
 * about AWT. The paired-t intervals live in `packages/experiments/src/benchmark/`.
 *
 * ## A weight that resolves is not a weight that contributes
 *
 * The distinction the Phase 2 defect turned on, one level up. A profile weighting a term the
 * registry does not implement lands in `pendingWeights` and is visible; a profile weighting a term
 * that *is* implemented but that evaluates to zero on every car looks identical to a profile that
 * never weighted it, and the resolver cannot tell them apart. So the assertion here is on
 * `ScoreBreakdown.contribution`, not on registration: every weighted term must move at least one
 * car's cost on a fixture bank, or be named in an exception list with the reason.
 *
 * ## Invariant 7, checked two ways
 *
 * A directory whose whole subject is "which policy" is where `if (profile.id === …)` would appear if
 * it appeared anywhere. So it is checked mechanically — every source file in this directory is read
 * and searched for an identity comparison or a profile-id literal — **and** behaviourally, by
 * rebuilding every profile under a scrambled id and asserting that not one decision moves. The grep
 * catches the obvious form; the scramble catches every form, including one nobody thought to grep
 * for.
 *
 * ## Invariant 8, in both directions
 *
 * Every value the aggregation reads is declared, and every declaration resolves to a value
 * something reads. A hidden knob makes a tuned winner optimal only at whatever the hidden value
 * happened to be; a spurious one makes an optimizer spend fifty to two hundred replications
 * discovering that a dimension does nothing, and a noisy objective will attribute a difference to
 * it anyway.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../config/loader.js';
import { dispatcherProfileSchema } from '../../config/schema.js';
import { AGGREGATIONS } from '../../config/types.js';
import type { DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../../config/types.js';
import type { CarSnapshot } from '../../model/car/types.js';
import { Simulation, runSimulation } from '../../sim/simulation.js';
import {
  DISPATCH_PARAMETER_IDS,
  activeWhenSatisfied,
  dispatchParameter,
  isActiveWhenRange,
  isParameterActive,
} from '../parameters.js';
import { createDispatchPolicy, resolveDispatchConfig } from '../policy.js';
import { COST_TERMS, COST_TERMS_BY_ID } from '../terms/index.js';
import type {
  DispatchCall,
  DispatchDecision,
  DispatchParameterSpec,
  RepositionContext,
} from '../types.js';

import { AuctionDispatchPolicy, createAuctionPolicy, resolveAuctionConfig } from './auction.js';
import { board, call, clockAt, hallCall, makeCar, snapshotAt } from './fixtures.test-helper.js';
import { groupContext } from './groupContext.js';
import { MAX_AUCTION_ROUNDS, POLICY_DEFAULTS, POLICY_PARAMETERS, POLICY_PARAMETER_IDS, policyParameter } from './parameters.js';
import { POLICY_FACTORIES, createPolicyFor } from './registry.js';
import {
  fixedForecast,
  movesOf,
  prepositionPlan,
  repositionContextFor,
  resolvePrepositionContext,
} from './prepositioning.js';
import type { DemandForecastSource } from './types.js';

const REAL_DATA_DIR = fileURLToPath(new URL('../../../../../data', import.meta.url));
const POLICIES_DIR = fileURLToPath(new URL('.', import.meta.url));

let config: LoadedConfig;
let profiles: readonly DispatcherProfile[];
let midtown: ResolvedBuilding;

beforeAll(async () => {
  config = await loadConfig(REAL_DATA_DIR);
  profiles = config.dispatcherProfiles.profiles;
  midtown = config.buildingsById.get('midtown-office') as ResolvedBuilding;
});

function decisionFingerprint(decision: DispatchDecision): string {
  return JSON.stringify({
    outcome: decision.outcome,
    carIds: decision.carIds,
    boardingPassengersPerCar: decision.boardingPassengersPerCar,
    cost: decision.cost,
    reason: decision.reason,
    scores: decision.scores.map((score) => [score.carId, score.cost]),
    rejected: decision.rejected.map((verdict) => [verdict.carId, verdict.reason]),
  });
}

const BANK: readonly CarSnapshot[] = [
  snapshotAt('A', '0'),
  snapshotAt('B', '6'),
  snapshotAt('C', '14'),
  snapshotAt('D', '20'),
];

/**
 * The context `Simulation.#park` actually supplies, verbatim.
 *
 * `simulation.ts:#park` now builds
 * `repositionContextFor(car, resolvePrepositionContext(snapshots, at, { entranceFloorIds,
 * predictor }))`, so a profile's stage 7 is judged against the partition and the forecast a real
 * run supplies — which is what makes `zone-center` a shipped strategy rather than a declared one.
 * The entrance list is Midtown Office's, matching the `BANK` fixture's shaft.
 *
 * It used to be `{ entranceFloorIds }` alone, and the two tests below that use it measured a bank
 * collapsing onto one floor because of it.
 */
const RUNNER_PARK_ENTRANCES: readonly string[] = Object.freeze(['P1', 'G']);

/** One car's stage-7 context, resolved exactly as the runner resolves it, for a whole bank. */
function runnerParkContext(
  cars: readonly CarSnapshot[],
  car: CarSnapshot,
  predictor?: DemandForecastSource | undefined,
): RepositionContext {
  return repositionContextFor(
    car,
    resolvePrepositionContext(cars, 0, {
      entranceFloorIds: RUNNER_PARK_ENTRANCES,
      ...(predictor === undefined ? {} : { predictor }),
    }),
  );
}

/** A forecast concentrated high and thin low, so `predictedDemand` can separate two cars. */
const DEMAND_FORECAST = fixedForecast(new Map([['18', 30], ['3', 4]]));

/* -------------------------------------------------------------------------- *
 * `activeWhen`, read off a profile — the mechanical form of "this weight is live"
 * -------------------------------------------------------------------------- */

/**
 * The value a profile gives a dotted tunable path, resolved rather than as authored.
 *
 * The *resolved* configuration is the right source: `rideTimeTerm.activeWhen` names
 * `dispatch.callType`, and a profile that authors no `dispatch` section still runs at
 * `DISPATCH_DEFAULTS.callType` — a gate has to be judged against what the run will do, not against
 * what the file happens to spell out. Sections `resolveDispatchConfig` does not own (`auction`)
 * fall back to the authored profile, so a term gated on an aggregation would be handled here
 * without this helper needing to know that any such term exists.
 */
function settingAt(profile: DispatcherProfile, path: string): unknown {
  const resolved = resolveDispatchConfig(profile) as unknown as Record<string, unknown>;
  const authored = profile as unknown as Record<string, unknown>;
  for (const root of [resolved, authored]) {
    let cursor: unknown = root;
    for (const key of path.split('.')) {
      if (typeof cursor !== 'object' || cursor === null) {
        cursor = undefined;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    if (cursor !== undefined) return cursor;
  }
  return undefined;
}

/** Term ids this profile weights above zero whose own `activeWhen` its settings do not satisfy. */
function unsatisfiedGatesOf(profile: DispatcherProfile): readonly string[] {
  const dead: string[] = [];
  for (const [termId, weight] of Object.entries(profile.weights)) {
    if (weight === 0) continue;
    const term = COST_TERMS_BY_ID.get(termId);
    if (term?.activeWhen === undefined) continue;
    const satisfied = Object.entries(term.activeWhen).every(([path, admitted]) =>
      admitted.includes(String(settingAt(profile, path))),
    );
    if (!satisfied) dead.push(termId);
  }
  return dead;
}

interface ContributionScenario {
  readonly name: string;
  readonly cars: readonly CarSnapshot[];
  readonly at: number;
  readonly call: DispatchCall;
  readonly waitingPassengers: number;
}

/**
 * Three banks, chosen so that between them every implemented term has something to price.
 *
 * A term handed no information is *correctly* zero, so a single impoverished fixture would report
 * two thirds of the library as inert and prove nothing. Each scenario exists for the terms it is the
 * only one to feed:
 *
 * | Scenario | Feeds |
 * |---|---|
 * | `idle` | `waitTime`, `distanceTravelled`, `stopCount`, `zoneAffinity`, `predictedDemand`, **`rideTime`** |
 * | `loaded` | `detourPenalty`, `existingCallDelay`, `loadFactor`, `crowding`, `starvation`, `rideTime` |
 * | `descending` | `directionReversal` — an idle car has no direction to reverse — and `rideTime` |
 *
 * ## Every call carries a destination, and it has to (finding C26)
 *
 * `rideTime` is the one term in the library with an `activeWhen`, and what it asks for is a call
 * that knows where the passenger is going. These three calls used to carry no `destinationFloorId`,
 * so `costRequestFor` forwarded none and `rideTime` returned 0 for every car in every scenario **by
 * construction** — which meant the "has no weight that contributes nothing" assertion below would
 * fail any profile that legitimately weighted it, and the failure would read as a defect in the
 * profile rather than as a gap in this fixture.
 *
 * That it was a fixture gap was provable from this very file: the next test but one takes
 * `contributionScenarios()[1]`, spreads a destination onto its call, and measures `rideTime` at 0
 * under `up-down-buttons` and above 0 under `destination-entry`. The apparatus existed; the
 * contribution scenarios simply never had a destination on them, because until Phase 6 no shipped
 * profile weighted the one term that needs one.
 *
 * The destinations are chosen **above the call floor and different per scenario**, so `rideTime`
 * has a real journey to price and two scenarios cannot mask each other by pricing the same one.
 * They change nothing for the other eleven terms, which never read the field.
 */
function contributionScenarios(): readonly ContributionScenario[] {
  const idle: ContributionScenario = {
    name: 'idle',
    cars: [snapshotAt('A', '0'), snapshotAt('B', '6'), snapshotAt('C', '12'), snapshotAt('D', '18')],
    at: 0,
    call: call('9', 'up', 0, '17'),
    waitingPassengers: 6,
  };

  // Cars below the call with passengers bound above it, so the new stop is inserted ahead of
  // commitments they already hold: that is `marginalDelaySeconds`, which is `existingCallDelay`, and
  // weighted by the people aboard it is `detourPenalty`. The older assigned hall calls give
  // `starvation` an age to escalate on, and forty waiting against fourteen seats gives `crowding` an
  // unserved fraction.
  const clock = clockAt(0);
  const loadedBank = [
    (() => {
      const car = makeCar('A', '2', clock);
      board(car, 10, '19', 0);
      car.assignHallCall(hallCall('16', 'up', 0));
      return car;
    })(),
    (() => {
      const car = makeCar('B', '4', clock);
      board(car, 6, '18', 0);
      car.assignHallCall(hallCall('14', 'up', 5));
      return car;
    })(),
    (() => {
      const car = makeCar('C', '1', clock);
      board(car, 13, '20', 0);
      return car;
    })(),
    makeCar('D', '3', clock),
  ];
  clock.set(90);
  const loaded: ContributionScenario = {
    name: 'loaded',
    cars: loadedBank.map((car) => car.snapshot(90)),
    at: 90,
    call: call('9', 'up', 0, '19'),
    waitingPassengers: 40,
  };

  const descendingClock = clockAt(0);
  const descendingBank = ['A', 'B', 'C', 'D'].map((id, index) => {
    const car = makeCar(id, String(14 + index), descendingClock);
    board(car, 3, '0', 0);
    car.departFor('0', 0);
    return car;
  });
  descendingClock.set(4);
  const descending: ContributionScenario = {
    name: 'descending',
    cars: descendingBank.map((car) => car.snapshot(4)),
    at: 4,
    call: call('9', 'up', 0, '20'),
    waitingPassengers: 8,
  };

  return [idle, loaded, descending];
}

/* -------------------------------------------------------------------------- *
 * The acceptance bar
 * -------------------------------------------------------------------------- */

describe('every profile in data/dispatcher-profiles.json', () => {
  it('declares the seven the brief names, plus the two this phase adds', () => {
    const ids = profiles.map((profile) => profile.id);
    for (const required of [
      'nearest-car',
      'eta',
      'collective',
      'energy-aware',
      'fairness-first',
      'capacity-aware',
      'predictive-balanced',
      'auction',
      'zoned-uppeak',
    ]) {
      expect(ids, `missing profile "${required}"`).toContain(required);
    }
  });

  it('builds a working policy under both aggregations and decides', () => {
    for (const profile of profiles) {
      const subject = call('9', 'up');

      const central = createDispatchPolicy(profile);
      const auction = createAuctionPolicy(profile);
      const at = central.register(subject, 0, { waitingPassengers: 8 }).scoreableAt;
      auction.register(subject, 0, { waitingPassengers: 8 });

      const decided = central.dispatch(subject.id, BANK, at, { waitingPassengers: 8 });
      const auctioned = auction.dispatch(subject.id, BANK, at, { waitingPassengers: 8 });

      expect(decided.outcome, profile.id).toBe('assigned');
      expect(decided.primaryCarId, profile.id).toBeDefined();
      expect(Number.isFinite(decided.cost ?? Number.NaN), profile.id).toBe(true);
      // Default aggregation is the control arm, so the two must agree exactly.
      expect(decisionFingerprint(auctioned), profile.id).toBe(decisionFingerprint(decided));
    }
  });

  it('weights only terms the cost-term library declares', () => {
    const declared = new Set(config.dispatcherProfiles.terms.map((term) => term.id));
    for (const profile of profiles) {
      for (const termId of Object.keys(profile.weights)) {
        expect(declared.has(termId), `${profile.id} weights ${termId}`).toBe(true);
      }
      // And the resolver accepts every one of them, implemented or pending.
      const resolved = resolveAuctionConfig(profile);
      expect(resolved.weights.size + resolved.pendingWeights.size, profile.id).toBe(
        Object.keys(profile.weights).length,
      );
    }
  });

  it('weights nothing the registry does not implement', () => {
    // Four of these profiles were authored in Phase 2 against terms no phase implemented:
    // `energy-aware` weighted `stopCount`, `fairness-first` weighted `starvation`, `capacity-aware`
    // weighted `loadFactor` and `crowding`, and `predictive-balanced` weighted eleven of the twelve.
    // Each *loaded*, and each scored as though its weight vector were two or three terms wide — a
    // plausible-looking run of a dispatcher nobody configured, which is the exact failure the
    // resolver's `pendingWeights` bucket exists to make visible rather than silent.
    for (const profile of profiles) {
      const resolved = resolveAuctionConfig(profile);
      expect(
        [...resolved.pendingWeights.keys()],
        `${profile.id} still weights terms nothing implements`,
      ).toEqual([]);
      expect(resolved.weights.size, profile.id).toBe(Object.keys(profile.weights).length);
    }
  });

  it('has no weight that contributes nothing — the assertion registration cannot make', () => {
    // An empty `pendingWeights` bucket proves each weighted term is *implemented*. It does not
    // prove any of them *prices anything*, and those are different failures with the same
    // signature: a term that evaluates to zero on every car makes the profile's argmin identical to
    // the profile without that weight, and no load-time check and no `pendingWeights` assertion can
    // see it. That is the Phase 2 defect one level up, so the assertion is on
    // `ScoreBreakdown.contribution`.
    //
    // Scored through `groupContext`, because three of the twelve terms price something neither the
    // car nor the call can answer — a zone, a forecast, a landing count — and a term handed no
    // information is *correctly* zero. Withholding it would be testing that the fixture is
    // uninformative, not that the term is dead. `zoneAffinity` is the one this was written for: it
    // reads `zoneFloorIdsByCarId` off the observation, `groupContext` produces it, `DispatchContext`
    // carries it and `observationFor` forwards it, so across these scenarios `zoned-uppeak` prices it
    // at up to 0.133, and the ranking that produces is not the `waitTime`-only ranking — see the
    // argmin-flip fixture in `auction.test.ts`.
    const inertByProfile: Record<string, readonly string[]> = {};

    for (const profile of profiles) {
      const policy = createDispatchPolicy(profile);
      const moved = new Set<string>();

      for (const scenario of contributionScenarios()) {
        const context = groupContext(scenario.cars, scenario.at, {
          waitingPassengers: scenario.waitingPassengers,
          predictor: DEMAND_FORECAST,
        });
        for (const score of policy.score(scenario.call, scenario.cars, scenario.at, context)) {
          for (const term of score.terms) {
            const where = `${profile.id}/${scenario.name}/${term.termId}`;
            expect(Number.isFinite(term.contribution), where).toBe(true);
            // A cost, never a bonus — `CostTermDefinition` requires it, and a negative
            // contribution would make the weighted sum non-monotonic in its own weights.
            expect(term.contribution, `${where} is negative`).toBeGreaterThanOrEqual(0);
            if (term.contribution > 0) moved.add(term.termId);
          }
        }
      }

      const inert = Object.keys(profile.weights).filter((termId) => !moved.has(termId));
      if (inert.length > 0) inertByProfile[profile.id] = inert;
    }

    // No exceptions. There used to be exactly one, carried here as an allowance:
    // `predictive-balanced` weighted `rideTime` at 0.3 while authoring no `dispatch.callType`, so it
    // ran at the `up-down-buttons` default where `rideTimeTerm.activeWhen` declares the term inert,
    // and the weight priced nothing on any shipped run of either single-leg building. An allowance
    // list is the wrong instrument for that: it records one known-dead weight and licenses the next
    // one. The weight is gone from `data/dispatcher-profiles.json` (bit-identically — a saturating
    // map sends raw 0 to 0, so no published number moved) and the *general* rule is asserted
    // mechanically below, off each term's own `activeWhen`.
    expect(inertByProfile).toEqual({});
  });

  it('lets a profile weighting rideTime under a destination call type pass the contribution check', () => {
    /*
     * **The regression pin for finding C26.** The assertion above scores every shipped profile over
     * `contributionScenarios()`, and those scenarios used to carry no destination — so `rideTime`
     * returned 0 for every car in every one of them *by construction*, and the natural Phase 6
     * profile (`{ waitTime: 1, rideTime: 1 }` under a destination call type) could not be shipped:
     * it failed with `{ 'destination-eta': ['rideTime'] }`, and the failure looked like a defect in
     * the profile rather than a gap in the fixture.
     *
     * This is that promotion, exercised. It is deliberately run against a profile built here rather
     * than one taken from `data/`, because whether the shipped file *carries* the weight is a
     * separate decision with its own pins to regenerate — this test's job is to prove the blocker
     * is gone, so that the decision can be taken on its merits.
     */
    const candidate: DispatcherProfile = {
      id: 'destination-eta+ride',
      name: 'Destination ETA with ride time',
      weights: { waitTime: 1, rideTime: 1 },
      dispatch: { callType: 'mobile-credential' },
    };
    expect(unsatisfiedGatesOf(candidate)).toEqual([]);

    const policy = createDispatchPolicy(candidate);
    const priced = new Set<string>();
    for (const scenario of contributionScenarios()) {
      const context = groupContext(scenario.cars, scenario.at, {
        waitingPassengers: scenario.waitingPassengers,
        predictor: DEMAND_FORECAST,
      });
      for (const score of policy.score(scenario.call, scenario.cars, scenario.at, context)) {
        for (const term of score.terms) {
          if (term.contribution > 0) priced.add(term.termId);
        }
      }
    }
    expect(
      [...priced].sort(),
      'rideTime is still zero on every car in every contribution scenario, so the fixture is ' +
        'still destination-blind and the promotion is still blocked',
    ).toEqual(['rideTime', 'waitTime']);

    // And the other direction, so the fixture cannot be said to be smuggling a destination into a
    // conventional scenario: the same scenarios under `up-down-buttons` price `rideTime` at zero,
    // because `costRequestFor` drops the field the call carries.
    const conventional = createDispatchPolicy({
      ...candidate,
      id: 'conventional+ride',
      dispatch: { callType: 'up-down-buttons' },
    });
    for (const scenario of contributionScenarios()) {
      const context = groupContext(scenario.cars, scenario.at, {
        waitingPassengers: scenario.waitingPassengers,
        predictor: DEMAND_FORECAST,
      });
      for (const score of conventional.score(scenario.call, scenario.cars, scenario.at, context)) {
        for (const term of score.terms) {
          if (term.termId === 'rideTime') expect(term.contribution).toBe(0);
        }
      }
    }
  });

  it('lets no profile weight a term its own stage settings make inert', () => {
    // The rule the allowance list above used to stand in for, stated once and derived rather than
    // enumerated: a term that declares `activeWhen` is asking for a stage setting, and a profile
    // that pays a weight without authoring that setting has bought nothing. It is invariant 8 read
    // in the other direction — the schema already says when each dimension is live, so honouring it
    // is mechanical, and a human reading the profile is the only party the declaration was not
    // already protecting.
    //
    // Every gate is read from the profile's *resolved* configuration, so a setting inherited from
    // `DISPATCH_DEFAULTS` counts exactly as one written out, and an authored section this resolver
    // does not own (`auction`) still answers from the profile itself.
    const violations: string[] = [];
    for (const profile of profiles) {
      for (const [termId, weight] of Object.entries(profile.weights)) {
        if (weight === 0) continue;
        const term = COST_TERMS_BY_ID.get(termId);
        if (term?.activeWhen === undefined) continue;
        for (const [path, admitted] of Object.entries(term.activeWhen)) {
          const actual = settingAt(profile, path);
          if (admitted.includes(String(actual))) continue;
          violations.push(
            `${profile.id} weights ${termId} at ${String(weight)} but its ${path} is ` +
              `"${String(actual)}", and the term declares activeWhen ${path} ∈ ` +
              `{${admitted.join(', ')}}`,
          );
        }
      }
    }
    expect(violations).toEqual([]);

    // Not vacuous, in both directions. At least one shipped term declares a gate at all, and a
    // profile that violates it is caught — otherwise this passes forever on an empty loop.
    const gated = COST_TERMS.filter((term) => term.activeWhen !== undefined);
    expect(gated.map((term) => term.id)).toContain('rideTime');
    const offender: DispatcherProfile = {
      id: 'gate-violator',
      name: 'Weights rideTime under up-down-buttons',
      weights: { waitTime: 1, rideTime: 0.3 },
      dispatch: { callType: 'up-down-buttons' },
    };
    expect(unsatisfiedGatesOf(offender)).toEqual(['rideTime']);
    expect(
      unsatisfiedGatesOf({ ...offender, dispatch: { callType: 'destination-entry' } }),
    ).toEqual([]);
  });

  it('makes a weight its stage settings gate off bite the moment the declared condition is met', () => {
    // Which is what makes the rule above a diagnosis rather than a prohibition. Same profile, same
    // fixture, one stage setting changed — the one `rideTimeTerm.activeWhen` names. `rideTime` is
    // added back onto `predictive-balanced`'s weights here on purpose: this is the measurement that
    // says dropping it from the shipped file cost nothing, because the term only ever had a value to
    // contribute under a `callType` that profile does not author.
    const authoredProfile = profiles.find((candidate) => candidate.id === 'predictive-balanced');
    expect(authoredProfile).toBeDefined();
    expect(authoredProfile?.weights.rideTime, 'the dead weight is back in the shipped file')
      .toBeUndefined();
    const profile: DispatcherProfile | undefined =
      authoredProfile === undefined
        ? undefined
        : { ...authoredProfile, weights: { ...authoredProfile.weights, rideTime: 0.3 } };
    const scenario = contributionScenarios()[1];
    expect(scenario).toBeDefined();
    const subject = {
      ...(scenario as ContributionScenario).call,
      destinationFloorId: '19',
      destinationFloorIndex: 19,
    };
    const cars = (scenario as ContributionScenario).cars;
    const at = (scenario as ContributionScenario).at;

    const rideTimeOf = (callType: 'up-down-buttons' | 'destination-entry'): number => {
      const authored = profile as DispatcherProfile;
      const policy = createDispatchPolicy({
        ...authored,
        // `assignmentTiming: immediate` on **both** arms, so `callType` is the only thing that
        // differs. The profile authors `deferred`, and `resolveDispatchConfig` rightly refuses
        // destination entry with a defer window — a destination dispatcher must name the car at the
        // landing (docs/06 § Stage 4), which is itself a documented cost of the approach. Holding it
        // fixed keeps this a one-variable comparison rather than making it a two-variable one.
        dispatch: { ...authored.dispatch, callType, assignmentTiming: 'immediate' },
      });
      const context = groupContext(cars, at, { waitingPassengers: 40, predictor: DEMAND_FORECAST });
      let peak = 0;
      for (const score of policy.score(subject, cars, at, context)) {
        for (const term of score.terms) {
          if (term.termId === 'rideTime' && term.contribution > peak) peak = term.contribution;
        }
      }
      return peak;
    };

    expect(rideTimeOf('up-down-buttons')).toBe(0);
    expect(rideTimeOf('destination-entry')).toBeGreaterThan(0);
  });

  it('scores both of those terms above zero inside runSimulation, now that the runner builds a group context', () => {
    // This assertion used to say the opposite, and said it deliberately: `Simulation.#dispatchBank`
    // called `policy.dispatch(callId, snapshots, at, { waitingPassengers, waitingMassKg })` — two
    // counts and nothing else — so `zoneFloorIdsByCarId` and `demandForecast` were absent in every
    // real run, `zoneAffinity` and `predictedDemand` were 0 for every car, `zoned-uppeak`'s argmin
    // was exactly `eta`'s, and `predictive-balanced` paid for a `predictedDemand` weight it did not
    // get. The runner now resolves both facts once per dispatch pass through `groupContext` and
    // shares them across the calls in the pass, so the two terms price for real.
    //
    // Kept as the *contrast* rather than deleted: withholding the group facts must still produce
    // zero, or "the term is live" would be untestable — a term that scored non-zero on no
    // information would be inventing one.
    const scenario = contributionScenarios()[0] as ContributionScenario;
    const withoutGroupFacts = { waitingPassengers: scenario.waitingPassengers };

    for (const [profileId, termId] of [
      ['zoned-uppeak', 'zoneAffinity'],
      ['predictive-balanced', 'predictedDemand'],
    ] as const) {
      const profile = profiles.find((candidate) => candidate.id === profileId) as DispatcherProfile;
      const policy = createDispatchPolicy(profile);

      const bare = policy.score(scenario.call, scenario.cars, scenario.at, withoutGroupFacts);
      for (const score of bare) {
        const term = score.terms.find((candidate) => candidate.termId === termId);
        expect(term, `${profileId} does not weight ${termId}`).toBeDefined();
        expect(term?.contribution, `${profileId}/${termId} with no group facts`).toBe(0);
      }

      // The context the runner really builds — `groupContext(snapshots, at, { predictor })` — same
      // profile, same cars, same instant.
      const withGroup = policy.score(
        scenario.call,
        scenario.cars,
        scenario.at,
        groupContext(scenario.cars, scenario.at, {
          waitingPassengers: scenario.waitingPassengers,
          predictor: DEMAND_FORECAST,
        }),
      );
      const peak = Math.max(
        ...withGroup.map(
          (score) =>
            score.terms.find((candidate) => candidate.termId === termId)?.contribution ?? 0,
        ),
      );
      expect(peak, `${profileId}/${termId} with a group context`).toBeGreaterThan(0);
    }
  });

  it('ships no profile whose stage 7 collapses a bank under the context the runner supplies', () => {
    // `zone-center` with no partition sends every car in a bank to the same shaft median — the
    // outcome `zoning.ts` calls worse than not parking — and `Simulation.#park` used to supply no
    // partition, sending all four Midtown cars to floor 10. It now resolves the partition and the
    // forecast for the whole bank, so the bar a shipped profile has to clear is its behaviour
    // against exactly that context.
    //
    // Entrance floors are exempt: sending a whole bank to the lobby is `lobby`'s entire intent.
    for (const profile of profiles) {
      const policy = createDispatchPolicy(profile);
      const targets = BANK.map((car) => policy.reposition(car, 0, runnerParkContext(BANK, car)))
        .filter((decision) => decision.move && decision.targetFloorId !== undefined)
        .map((decision) => decision.targetFloorId as string)
        .filter((floorId) => !RUNNER_PARK_ENTRANCES.includes(floorId));

      expect(
        targets.length,
        `${profile.id} sends ${targets.length} cars to ${[...new Set(targets)].join(', ')} under the context Simulation.#park supplies`,
      ).toBe(new Set(targets).size);
    }
  });

  it('parks the same bank on distinct floors, and would collapse it without the partition', () => {
    // The other half, so the guard above cannot be satisfied by a strategy that simply never parks:
    // the shipped `zone-center` profile must actually spread a bank out, and the impoverished
    // context must still be the thing that collapses it. Both are asserted, because "does not
    // collapse" and "parks at all" fail identically in a summary.
    const zoned = profiles.find((candidate) => candidate.id === 'zoned-uppeak') as DispatcherProfile;
    expect(zoned.idle?.parkingStrategy, 'the shipped profile no longer declares zone-center').toBe(
      'zone-center',
    );
    const policy = createDispatchPolicy(zoned);

    // Four cars standing at the lobby, which is what an up-peak bank looks like before it disperses.
    const lobbyBank = ['A', 'B', 'C', 'D'].map((id) => snapshotAt(id, '0'));

    const entrancesOnly = { entranceFloorIds: RUNNER_PARK_ENTRANCES };
    const collapsed = lobbyBank
      .map((car) => policy.reposition(car, 0, entrancesOnly))
      .filter((decision) => decision.move && decision.targetFloorId !== undefined)
      .map((decision) => decision.targetFloorId as string);
    const spread = movesOf(prepositionPlan(policy, lobbyBank, 0, entrancesOnly)).map(
      (decision) => decision.targetFloorId,
    );

    // Every car moves, and all four to the same floor, when nobody supplies a partition.
    expect(collapsed.length, 'the unwired context still moves the whole bank').toBe(lobbyBank.length);
    expect(new Set(collapsed).size, 'the unwired context still collapses').toBe(1);
    // With the partition — which is what the runner now resolves — one floor per car that moves.
    expect(new Set(spread).size, 'the wired context still spreads').toBeGreaterThan(1);
    expect(new Set(spread).size).toBe(spread.length);
  });

  it('runs a full simulation to completion on Midtown Office', () => {
    for (const profile of profiles) {
      const result = runSimulation({
        building: midtown,
        dispatcherProfile: profile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: 20260726,
        onTimeout: 'report',
      });

      expect(result.status, `${profile.id}: ${result.warnings.join('; ')}`).toBe('completed');
      // Every passenger either arrived or is named. A missing one is an audit failure, never a
      // legitimate outcome.
      expect(result.conservation.balanced, profile.id).toBe(true);
      expect(result.undelivered, profile.id).toEqual([]);
      expect(result.summary.waiting.meanS, profile.id).toBeGreaterThan(0);
      expect(result.summary.timeToDestination.meanS, profile.id).toBeGreaterThan(0);
      expect(result.dispatcherProfileId, profile.id).toBe(profile.id);
    }
  }, 120_000);

  it('exercises the stage settings each new profile declares, rather than defaulting them', () => {
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));

    const capacity = resolveAuctionConfig(byId.get('capacity-aware') as DispatcherProfile);
    expect(capacity.dispatch.assignmentMode).toBe('split-demand');
    expect(capacity.dispatch.reassignmentPolicy).toBe('until-commitment');
    expect(capacity.dispatch.commitmentPoint).toBe('on-deceleration');
    expect(capacity.answer.allowBypassIfSoleEligibleCar).toBe(true);

    const fairness = resolveAuctionConfig(byId.get('fairness-first') as DispatcherProfile);
    // The latest commitment point and the largest budget of any profile: fairness is partly the
    // freedom to keep moving a call.
    expect(fairness.dispatch.commitmentPoint).toBe('on-door-open');
    expect(fairness.dispatch.maxReassignmentsPerCall).toBe(4);

    const energy = resolveAuctionConfig(byId.get('energy-aware') as DispatcherProfile);
    expect(energy.idle.parkingStrategy).toBe('stay');

    const zoned = resolveAuctionConfig(byId.get('zoned-uppeak') as DispatcherProfile);
    expect(zoned.dispatch.assignmentMode).toBe('split-demand');
    expect(zoned.dispatch.splitThresholdPassengers).toBe(10);
    // `zone-center`, and the two tests above are why it may be: `Simulation.#park` resolves the
    // partition for the whole bank, so the strategy spreads a bank rather than collapsing it. The
    // deadband comes down with it — at the 5 s default the whole shaft is inside it and the
    // strategy would be indistinguishable from `stay`.
    expect(zoned.idle.parkingStrategy).toBe('zone-center');
    expect(zoned.idle.repositionThresholdS).toBe(2);

    const predictive = byId.get('predictive-balanced') as DispatcherProfile;
    expect(resolveAuctionConfig(predictive).idle.parkingStrategy).toBe('predicted-demand');
    // `idle.predictorHorizonS` is authored here and resolved by the predictor, not by this module —
    // see `parameters.ts` § What is deliberately not here.
    expect(predictive.idle?.predictorHorizonS).toBe(300);

    const auction = resolveAuctionConfig(byId.get('auction') as DispatcherProfile);
    // A car that may hand a contract back must be allowed to lose one, and the setting is held
    // identical across both arms of the aggregation comparison — see the next describe block.
    expect(auction.dispatch.reassignmentPolicy).toBe('until-commitment');
    expect(auction.dispatch.commitmentPoint).toBe('on-deceleration');
    expect(auction.dispatch.assignmentTiming).toBe('immediate');
  });
});

/* -------------------------------------------------------------------------- *
 * The aggregation is authored as one profile and two option sets, not two profiles
 * -------------------------------------------------------------------------- */

describe('the aggregation comparison isolates the aggregation', () => {
  it('is authored as data, and every profile declares the aggregation it runs under', () => {
    // This assertion used to be the reverse — a tripwire asserting `dispatcherProfileSchema` had no
    // `auction` section — because while it did not, a *second* auction profile could not express a
    // different aggregation and would resolve to the control arm under another name. That was the
    // defect: a profile named "multi-round with bid withdrawal" that resolved to `rounds: 1`,
    // differing from its own control only in stage 5, so the paired-t interval a benchmark of the
    // pair produced was an interval on reassignment and measured exactly zero aggregation.
    //
    // The section landed, so the tripwire is replaced by the assertion it was holding a place for.
    const base = profiles.find((candidate) => candidate.id === 'auction') as DispatcherProfile;
    const parsed = dispatcherProfileSchema.safeParse({
      ...base,
      auction: { aggregation: 'contract-net', rounds: 3, reserveMarginalDelayS: 25 },
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);

    // Every profile resolves to an aggregation it actually declares, and every profile that never
    // mentions one is the centralized argmin — the default that keeps a run from silently getting
    // an auction it did not ask for.
    const declared = new Map(
      profiles.map((profile) => [profile.id, resolveAuctionConfig(profile).auction]),
    );
    expect(declared.get('auction')?.aggregation).toBe('contract-net');
    expect(declared.get('auction-multi-round')?.aggregation).toBe('contract-net');
    for (const profile of profiles) {
      const resolved = declared.get(profile.id);
      expect(resolved?.aggregation, profile.id).toBe(
        profile.auction?.aggregation ?? POLICY_DEFAULTS.aggregation,
      );
      if (profile.auction === undefined) {
        expect(resolved, profile.id).toEqual({
          aggregation: POLICY_DEFAULTS.aggregation,
          rounds: POLICY_DEFAULTS.rounds,
          reserveMarginalDelayS: POLICY_DEFAULTS.reserveMarginalDelayS,
        });
      }
    }
  });

  it('builds both arms as profiles, differing in nothing but the auction section', () => {
    const control = resolveAuctionConfig(
      profiles.find((candidate) => candidate.id === 'auction') as DispatcherProfile,
    );
    const treatment = resolveAuctionConfig(
      profiles.find((candidate) => candidate.id === 'auction-multi-round') as DispatcherProfile,
    );

    // Every resolved section outside `auction` must be identical, or the interval is an interval on
    // whichever one differs. This is the assertion the one-profile-two-option-sets arrangement made
    // by construction and that two *authored* profiles have to earn.
    for (const section of ['dispatch', 'answer', 'idle', 'eligibility', 'normalization'] as const) {
      expect(treatment[section], section).toEqual(control[section]);
    }
    expect([...treatment.weights]).toEqual([...control.weights]);
    expect(treatment.declaredHardConstraints).toEqual(control.declaredHardConstraints);
    expect(treatment.constraints).toEqual(control.constraints);
    expect(control.auction.rounds).toBe(1);
    expect(treatment.auction.rounds).toBe(3);
    expect(treatment.auction.reserveMarginalDelayS).toBe(25);
    // And both are aggregated by the same factory, so the only difference a run can see is the
    // round budget and the reserve.
    expect(control.auction.aggregation).toBe('contract-net');
    expect(treatment.auction.aggregation).toBe('contract-net');
  });

  it('selects the policy by a table keyed on the declared aggregation, never by a name', () => {
    // CLAUDE.md invariant 7, at the level above a weight vector. The registry is total over
    // `AGGREGATIONS` and every row is reachable from data.
    expect(Object.keys(POLICY_FACTORIES).sort()).toEqual([...AGGREGATIONS].sort());
    for (const profile of profiles) {
      const policy = createPolicyFor(profile);
      const expected =
        (profile.auction?.aggregation ?? POLICY_DEFAULTS.aggregation) === 'contract-net';
      expect(policy instanceof AuctionDispatchPolicy, profile.id).toBe(expected);
    }
    expect(() =>
      createPolicyFor(profiles[0] as DispatcherProfile, {
        auction: { aggregation: 'swarm' as unknown as 'contract-net' },
      }),
    ).toThrow(/auction\.aggregation/);
  });

  it('makes the treatment arm allocate somewhere the control arm does not', () => {
    // An aggregation that never diverges is one dispatcher measured twice, and Phase 3 measured what
    // that costs: a difference under ~8% of AWT is unmeasurable at n = 100 against a structurally
    // different baseline, so a renamed dispatcher reads exactly like a correct null result. The
    // divergence has to be shown at the decision level, where it is exact.
    const base = profiles.find((candidate) => candidate.id === 'auction') as DispatcherProfile;
    const subject = call('5', 'up');
    const context = { waitingPassengers: 6 };

    // The near car would cross its own bypass threshold by winning; the far one would not.
    const near = makeCar('A', '4');
    board(near, 14, '19');
    const cars = [near.snapshot(0), makeCar('B', '20').snapshot(0)];

    const control = createAuctionPolicy(base);
    control.register(subject, 0, context);
    const controlDecision = control.dispatch(subject.id, cars, 0, context);

    const treatment = createAuctionPolicy(base, { auction: { rounds: 3 } });
    treatment.register(subject, 0, context);
    const treatmentDecision = treatment.dispatch(subject.id, cars, 0, context);

    expect(controlDecision.primaryCarId).toBe('A');
    expect(treatmentDecision.primaryCarId).toBe('B');
    expect(treatment.auction(subject.id)?.divergedFromArgmin).toBe(true);
    expect(control.auction(subject.id)?.divergedFromArgmin).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * The seam, guarded rather than described
 * -------------------------------------------------------------------------- */

describe('every behaviour in dispatch/policies is reachable from runSimulation', () => {
  // This block used to assert the opposite, symbol by symbol: that `simulation.ts` contained no
  // `groupContext`, no `.reconsider(`, no `CapacityReassignmentMonitor` and no `createPolicy`, and
  // that `sim/types.ts` had no policy hook. Those were tripwires on gaps, written to go red the day
  // the wiring landed. It has landed, so they are replaced by the assertions they were holding a
  // place for — and by BEHAVIOURAL ones rather than grep, because a grep for a symbol proves a call
  // site exists and not that anything reaches it. Four times in this project a behaviour has been
  // configurable, unit-tested and dead in the shipped path; a symbol search would have caught none
  // of them once someone imported the name and never called it.
  //
  // The run-level guards live in `sim/seam.test.ts`, which asserts observable differences between
  // configurations. What is asserted here is the narrower claim this directory can make on its own:
  // that the runner *does* call in, measured through the counters `Simulation` keeps.
  const SIM_DIR = fileURLToPath(new URL('../../sim', import.meta.url));
  let simulation: string;

  beforeAll(async () => {
    simulation = await readFile(join(SIM_DIR, 'simulation.ts'), 'utf8');
  });

  it('feeds an arrival model and consults it, on a building where parking dominates', () => {
    const garden = config.buildingsById.get('garden-apartments') as ResolvedBuilding;
    const predictive = profiles.find(
      (candidate) => candidate.id === 'predictive-balanced',
    ) as DispatcherProfile;
    const run = new Simulation({
      building: garden,
      dispatcherProfile: predictive,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: 20260726,
      onTimeout: 'report',
    });
    run.run();

    // One arrival observed per generated leg, and never more: the model is fed on real arrivals
    // only, at the moment somebody begins waiting, and never from the trace.
    expect(run.stageActivity.predictorObservations).toBeGreaterThan(0);
    expect(run.stageActivity.predictorObservations).toBeLessThanOrEqual(
      run.trace.passengerCount * garden.banks.length,
    );
    // And the forecast is a real one: every floor the bank serves is reported on, cold-start
    // included, because "no evidence" is not "no demand".
    const forecast = run.predictors.get(garden.banks[0]?.id as string);
    expect(forecast, 'no arrival model was built for the bank').toBeDefined();
    expect(forecast?.expectedDemandByFloor(run.trace.durationS).size).toBe(
      garden.banks[0]?.servesFloors.length,
    );
  }, 60_000);

  it('runs the load-driven stage-5 sweep, and migrates only for a profile that opted in', () => {
    // The mechanism and its control arm in one assertion. `capacity-aware` declares
    // `reassignmentPolicy: until-commitment`; `eta` leaves it at the `never` default. Both cross
    // their bypass thresholds on an up-peak Midtown run — the sweep runs for both — and only the
    // one that opted into stage 5 moves a call. A migration count of zero for `eta` is the
    // mechanism being *off*, which is what makes its value measurable against its own absence; a
    // crossing count of zero would be the mechanism never having run at all, and the two used to
    // look identical.
    const activity = (profileId: string) => {
      const run = new Simulation({
        building: midtown,
        dispatcherProfile: profiles.find(
          (candidate) => candidate.id === profileId,
        ) as DispatcherProfile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: 20260726,
        onTimeout: 'report',
      });
      run.run();
      return run.stageActivity;
    };

    const optedIn = activity('capacity-aware');
    expect(optedIn.capacityCrossings, 'no car ever crossed its threshold').toBeGreaterThan(0);
    expect(optedIn.capacityMigrations, 'stage 5 never moved a call').toBeGreaterThan(0);

    const control = activity('eta');
    expect(control.capacityCrossings, 'the sweep did not run for the control arm').toBeGreaterThan(0);
    expect(control.capacityMigrations, 'reassignmentPolicy: never still migrated').toBe(0);
    expect(control.capacityHeld, 'the control arm looked at no call').toBeGreaterThan(0);
  }, 60_000);

  it('builds each bank through the registry, so an authored aggregation runs', () => {
    const multi = profiles.find(
      (candidate) => candidate.id === 'auction-multi-round',
    ) as DispatcherProfile;
    const run = new Simulation({
      building: midtown,
      dispatcherProfile: multi,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: 20260726,
      onTimeout: 'report',
    });
    run.run();

    for (const [bankId, policy] of run.policies) {
      expect(policy instanceof AuctionDispatchPolicy, bankId).toBe(true);
      expect((policy as AuctionDispatchPolicy).config.auction.rounds, bankId).toBe(3);
    }
  }, 60_000);

  it('never reads a clock or a profile id in the run loop', () => {
    // The two invariants the wiring above is most likely to have broken, checked on the source it
    // was added to. CLAUDE.md invariants 3 and 7.
    const code = simulation.replaceAll(/\/\*[\S\s]*?\*\//gu, '').replaceAll(/\/\/.*$/gmu, '');
    for (const forbidden of ['Date.now', 'performance.now', 'setTimeout', 'Math.random']) {
      expect(code, `simulation.ts uses ${forbidden}`).not.toContain(forbidden);
    }
    for (const profile of profiles) {
      expect(code, `simulation.ts names the profile "${profile.id}"`).not.toContain(
        `'${profile.id}'`,
      );
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Invariant 7
 * -------------------------------------------------------------------------- */

describe('nothing in dispatch/policies reads a profile id (CLAUDE.md invariant 7)', () => {
  let sources: readonly { readonly file: string; readonly code: string }[];

  beforeAll(async () => {
    const names = (await readdir(POLICIES_DIR)).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.includes('test-helper'),
    );
    sources = await Promise.all(
      names.map(async (file) => ({
        file,
        // Comments legitimately name profiles — `auction.ts` discusses the `auction` profile at
        // length — so they are stripped before the search. What is being checked is code.
        code: (await readFile(join(POLICIES_DIR, file), 'utf8'))
          .replaceAll(/\/\*[\S\s]*?\*\//gu, '')
          .replaceAll(/\/\/.*$/gmu, ''),
      })),
    );
    expect(names.length).toBeGreaterThanOrEqual(6);
  });

  it('contains no identity comparison against a hard-coded name', () => {
    // A quoted right-hand side is the failure: `profile.id === 'nearest-car'` puts behaviour in code
    // the config claims to own. A comparison against a *variable* — `parameter.id === id`, the
    // schema lookup in `parameters.ts` — is a lookup by key and carries no behaviour, so the
    // pattern requires a literal rather than banning the operator.
    for (const { file, code } of sources) {
      expect(code, `${file} compares an id to a literal`).not.toMatch(/\.id\s*[!=]==\s*['"`]/u);
      expect(code, `${file} compares an id to a literal`).not.toMatch(
        /\bid\s*[!=]==\s*['"`]/u,
      );
      expect(code, `${file} switches on an id`).not.toMatch(/switch\s*\(\s*[\w.]*\bid\b/u);
    }
  });

  it('contains no profile-id literal at all', () => {
    for (const profile of profiles) {
      for (const { file, code } of sources) {
        expect(code, `${file} mentions "${profile.id}" in code`).not.toContain(`'${profile.id}'`);
        expect(code, `${file} mentions "${profile.id}" in code`).not.toContain(`"${profile.id}"`);
      }
    }
  });

  it('makes the identical decision when every profile is renamed', () => {
    // The check the grep cannot make. If any behaviour depended on identity in a form nobody
    // thought to search for, a scrambled id would move a decision.
    for (const profile of profiles) {
      const scrambled: DispatcherProfile = {
        ...profile,
        id: `${[...profile.id].reverse().join('')}-zz`,
        name: 'Anonymous',
      };
      const subject = call('9', 'up');

      const original = createDispatchPolicy(profile);
      const renamed = createDispatchPolicy(scrambled);
      const at = original.register(subject, 0, { waitingPassengers: 8 }).scoreableAt;
      renamed.register(subject, 0, { waitingPassengers: 8 });

      expect(
        decisionFingerprint(renamed.dispatch(subject.id, BANK, at, { waitingPassengers: 8 })),
        profile.id,
      ).toBe(
        decisionFingerprint(original.dispatch(subject.id, BANK, at, { waitingPassengers: 8 })),
      );

      // And through the aggregation, with a round budget that can actually withdraw.
      const originalAuction = createAuctionPolicy(profile, { auction: { rounds: 3 } });
      const renamedAuction = createAuctionPolicy(scrambled, { auction: { rounds: 3 } });
      originalAuction.register(subject, 0, { waitingPassengers: 8 });
      renamedAuction.register(subject, 0, { waitingPassengers: 8 });
      expect(
        decisionFingerprint(
          renamedAuction.dispatch(subject.id, BANK, at, { waitingPassengers: 8 }),
        ),
        profile.id,
      ).toBe(
        decisionFingerprint(
          originalAuction.dispatch(subject.id, BANK, at, { waitingPassengers: 8 }),
        ),
      );
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Invariant 8
 * -------------------------------------------------------------------------- */

describe('the schema and the aggregation agree about what is tunable', () => {
  it('declares every value the resolved aggregation carries', () => {
    const resolved = resolveAuctionConfig({ id: 'p', name: 'P', weights: { waitTime: 1 } });
    for (const key of Object.keys(resolved.auction)) {
      expect(POLICY_PARAMETER_IDS.has(`auction.${key}`), `undeclared: auction.${key}`).toBe(true);
    }
  });

  it('declares nothing that resolves to nothing', () => {
    const resolved = resolveAuctionConfig({ id: 'p', name: 'P', weights: { waitTime: 1 } });
    for (const parameter of POLICY_PARAMETERS) {
      const [section, key] = parameter.id.split('.');
      // Every row is the aggregation's, and every one resolves to a field of it. This module
      // declares nothing outside `auction.*`, which is the test of whether it stayed a policy: the
      // other three behaviours here read knobs `DISPATCH_PARAMETERS` and `PREDICTOR_PARAMETERS`
      // already own.
      expect(section, parameter.id).toBe('auction');
      expect(Object.hasOwn(resolved.auction, key as string), parameter.id).toBe(true);
    }
  });

  it('declares each knob exactly once across the whole schema', () => {
    for (const id of POLICY_PARAMETER_IDS) {
      expect(DISPATCH_PARAMETER_IDS.has(id), `${id} is declared twice`).toBe(false);
    }
    expect(POLICY_PARAMETERS.length).toBe(POLICY_PARAMETER_IDS.size);
  });

  it('quotes its defaults from POLICY_DEFAULTS rather than repeating the numbers', () => {
    expect(policyParameter('auction.rounds')?.default).toBe(POLICY_DEFAULTS.rounds);
    expect(policyParameter('auction.reserveMarginalDelayS')?.default).toBe(
      POLICY_DEFAULTS.reserveMarginalDelayS,
    );
    expect(policyParameter('nonsense.knob')).toBeUndefined();
  });

  it('gives a generic optimizer everything it needs to sample each row', () => {
    for (const parameter of POLICY_PARAMETERS) {
      expect(parameter.description.length, parameter.id).toBeGreaterThan(40);
      if (parameter.type === 'continuous' || parameter.type === 'integer') {
        const range = parameter.range;
        expect(range, parameter.id).toBeDefined();
        expect(range?.[0]).toBeLessThan(range?.[1] as number);
        expect(typeof parameter.default).toBe('number');
        expect(parameter.default as number).toBeGreaterThanOrEqual(range?.[0] as number);
        expect(parameter.default as number).toBeLessThanOrEqual(range?.[1] as number);
        expect(parameter.scale, parameter.id).toBeDefined();
      }
    }
  });

  it('evaluates every activeWhen by the same rule the rest of the schema does', () => {
    // The contract `dispatch/parameters.test.ts` asserts for every row in DISPATCH_PARAMETERS,
    // restated here for this module's rows. There is one evaluation rule for the whole schema or
    // there is elevator-specific knowledge in it (CLAUDE.md invariant 8) — and that rule is
    // `activeWhenSatisfied`, which takes both declared forms.
    //
    // The list form must name a categorical and every listed value must be one it admits. The
    // range form must name an integer or continuous gate and must actually gate: an interval that
    // covered the gate's whole declared range would be a condition that can never be false, which
    // reads as a gate and is decoration.
    for (const parameter of POLICY_PARAMETERS) {
      for (const [dependency, condition] of Object.entries(parameter.activeWhen ?? {})) {
        const gate = policyParameter(dependency) ?? dispatchParameter(dependency);
        expect(gate, `${parameter.id} → ${dependency}`).toBeDefined();

        if (isActiveWhenRange(condition)) {
          expect(gate?.type, `${parameter.id} → ${dependency} is not numeric`).toMatch(
            /^(?:integer|continuous)$/,
          );
          const [low, high] = gate?.range as readonly [number, number];
          expect(
            condition.min !== undefined || condition.max !== undefined,
            `${parameter.id} → ${dependency} bounds nothing`,
          ).toBe(true);
          // Excludes at least one value the gate can take, and admits at least one.
          expect(activeWhenSatisfied(condition, low) && activeWhenSatisfied(condition, high)).toBe(
            false,
          );
          expect(activeWhenSatisfied(condition, low) || activeWhenSatisfied(condition, high)).toBe(
            true,
          );
          continue;
        }

        expect(gate?.type, `${parameter.id} → ${dependency} is not categorical`).toBe('categorical');
        expect(condition.length, `${parameter.id} activeWhen ${dependency}`).toBeGreaterThan(0);
        for (const value of condition) {
          expect(gate?.values, `${parameter.id} → ${dependency}=${value}`).toContain(value);
        }
      }
    }
  });

  it('keeps the reserve inert at one round — declared as a numeric gate and measured', () => {
    // The condition that used to be inexpressible, now both declared and measured. A reserve of
    // zero seconds declines every bidder that would delay anybody, so if `rounds: 1` were not
    // inert this would withdraw; and the second half proves the fixture can in fact produce a
    // withdrawal, so the first half is not passing because nothing was over the reserve.
    const authored = { id: 'p', name: 'P', weights: { waitTime: 1 } };
    const subject = call('5', 'up');
    const context = { waitingPassengers: 2 };

    const near = makeCar('A', '4');
    board(near, 6, '19');
    const cars = [near.snapshot(0), makeCar('B', '20').snapshot(0)];

    for (const [rounds, expected] of [
      [1, 0],
      [2, 1],
    ] as const) {
      const policy = createAuctionPolicy(authored, {
        auction: { rounds, reserveMarginalDelayS: 0 },
      });
      policy.register(subject, 0, context);
      policy.dispatch(subject.id, cars, 0, context);
      expect(policy.auction(subject.id)?.withdrawals.length, `rounds ${rounds}`).toBe(expected);
    }

    // And the range a Phase 7 optimizer samples still covers every round the resolver accepts.
    expect(policyParameter('auction.rounds')?.range).toEqual([1, MAX_AUCTION_ROUNDS]);
    // Both knobs are inert under `auction.aggregation: central-argmin`, which holds no auction at
    // all. `auction.rounds` carries only that condition.
    expect(policyParameter('auction.rounds')?.activeWhen).toEqual({
      'auction.aggregation': ['contract-net'],
    });
    // The reserve carries both halves, and `activeWhen` is a conjunction. The second half is the
    // numeric form, which exists because a gate on an integer cannot be a list of strings.
    expect(policyParameter('auction.reserveMarginalDelayS')?.activeWhen).toEqual({
      'auction.aggregation': ['contract-net'],
      'auction.rounds': { min: 2 },
    });

    // And it evaluates, by the one shared rule, to exactly the behaviour measured above: dead at
    // one round, live at two, dead under the centralized argmin whatever the round budget is.
    const reserve = policyParameter('auction.reserveMarginalDelayS') as DispatchParameterSpec;
    const at = (aggregation: string, rounds: number): boolean =>
      isParameterActive(reserve, (id) =>
        id === 'auction.aggregation' ? aggregation : id === 'auction.rounds' ? rounds : undefined,
      );
    expect(at('contract-net', 1)).toBe(false);
    expect(at('contract-net', 2)).toBe(true);
    expect(at('contract-net', MAX_AUCTION_ROUNDS)).toBe(true);
    expect(at('central-argmin', 3)).toBe(false);
  });
});
