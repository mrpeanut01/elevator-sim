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
 * once, through the central argmin, because `SimulationConfig` has no policy hook and an
 * `AuctionDispatchPolicy` cannot be injected into `runSimulation` at all (`index.ts` § *Nothing in
 * this directory is reachable from `runSimulation` yet*). The two-aggregation half runs one
 * *decision* per profile, and at the default `rounds: 1` that is literally the same computation as
 * the central argmin — which is what it asserts. So "a profile that deadlocks under the contract
 * net" is **not** covered by anything here, and no claim in this file is about AWT.
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
import type { DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../../config/types.js';
import type { CarSnapshot } from '../../model/car/types.js';
import { runSimulation } from '../../sim/simulation.js';
import { DISPATCH_PARAMETER_IDS, dispatchParameter } from '../parameters.js';
import { createDispatchPolicy } from '../policy.js';
import type { DispatchCall, DispatchDecision } from '../types.js';

import { createAuctionPolicy, resolveAuctionConfig } from './auction.js';
import { board, call, clockAt, hallCall, makeCar, snapshotAt } from './fixtures.test-helper.js';
import { groupContext } from './groupContext.js';
import { MAX_AUCTION_ROUNDS, POLICY_DEFAULTS, POLICY_PARAMETERS, POLICY_PARAMETER_IDS, policyParameter } from './parameters.js';
import { fixedForecast, movesOf, prepositionPlan } from './prepositioning.js';

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
 * `simulation.ts:#park` builds `{ entranceFloorIds: this.#entranceFloorIds }` and nothing else, so a
 * profile's stage 7 must be sane against *this*, not against the richer context
 * `prepositionPlan` can build. When `#park` starts passing
 * `repositionContextFor(car, resolvePrepositionContext(...))`, widen this constant and the
 * `zone-center` profiles may come back.
 */
const RUNNER_PARK_CONTEXT = Object.freeze({ entranceFloorIds: Object.freeze(['P1', 'G']) });

/** A forecast concentrated high and thin low, so `predictedDemand` can separate two cars. */
const DEMAND_FORECAST = fixedForecast(new Map([['18', 30], ['3', 4]]));

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
 * | `idle` | `waitTime`, `distanceTravelled`, `stopCount`, `zoneAffinity`, `predictedDemand` |
 * | `loaded` | `detourPenalty`, `existingCallDelay`, `loadFactor`, `crowding`, `starvation` |
 * | `descending` | `directionReversal` — an idle car has no direction to reverse |
 */
function contributionScenarios(): readonly ContributionScenario[] {
  const idle: ContributionScenario = {
    name: 'idle',
    cars: [snapshotAt('A', '0'), snapshotAt('B', '6'), snapshotAt('C', '12'), snapshotAt('D', '18')],
    at: 0,
    call: call('9', 'up'),
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
    call: call('9', 'up'),
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
    call: call('9', 'up'),
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

    // Exactly one exception, and it is the term's own declared condition rather than a defect:
    // `rideTimeTerm.activeWhen` is `{ dispatch.callType: ['destination-entry',
    // 'mobile-credential'] }`, and `predictive-balanced` authors no `callType`, so under
    // `up-down-buttons` no landing call carries a destination and the term is 0 for every car. The
    // next test proves that is the reason by flipping the one setting.
    expect(inertByProfile).toEqual({ 'predictive-balanced': ['rideTime'] });
  });

  it('makes the one inert weight bite the moment its declared condition is met', () => {
    // Which is what turns the exception above from an excuse into a diagnosis. Same profile, same
    // fixture, one stage setting changed — the one `rideTimeTerm.activeWhen` names.
    const profile = profiles.find((candidate) => candidate.id === 'predictive-balanced');
    expect(profile).toBeDefined();
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

  it('scores two of those terms at zero inside runSimulation, because nothing there builds a group context', () => {
    // The gap the test above deliberately does not paper over, pinned so it is measured rather than
    // discovered. `Simulation.#dispatchBank` calls `policy.dispatch(callId, snapshots, at,
    // { waitingPassengers: waiting.count })` — two counts and nothing else — so `zoneFloorIdsByCarId`
    // and `demandForecast` are absent in every real run and the two terms that read them are 0 for
    // every car. `zoned-uppeak`'s argmin is then exactly `eta`'s, and `predictive-balanced` pays for
    // a `predictedDemand` weight it does not get.
    //
    // Not a defect in this directory and not worked around here: `groupContext` produces both fields
    // and the test above proves they price. What is missing is one call in `sim/`, and until it lands
    // this assertion is the honest statement of what a benchmark of `zoned-uppeak` today measures.
    const scenario = contributionScenarios()[0] as ContributionScenario;
    const runnerContext = { waitingPassengers: scenario.waitingPassengers };

    for (const [profileId, termId] of [
      ['zoned-uppeak', 'zoneAffinity'],
      ['predictive-balanced', 'predictedDemand'],
    ] as const) {
      const profile = profiles.find((candidate) => candidate.id === profileId) as DispatcherProfile;
      const policy = createDispatchPolicy(profile);
      const scores = policy.score(scenario.call, scenario.cars, scenario.at, runnerContext);
      for (const score of scores) {
        const term = score.terms.find((candidate) => candidate.termId === termId);
        expect(term, `${profileId} does not weight ${termId}`).toBeDefined();
        expect(term?.contribution, `${profileId}/${termId} under the runner's context`).toBe(0);
      }

      // And with the group context it is not zero — same profile, same cars, same instant.
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
    // outcome `zoning.ts` calls worse than not parking — and `Simulation.#park` supplies no
    // partition. Measured before this profile changed: all four Midtown cars to floor 10. So the bar
    // a shipped profile has to clear is its behaviour against RUNNER_PARK_CONTEXT, not against the
    // richer context `prepositionPlan` can build.
    //
    // Entrance floors are exempt: sending a whole bank to the lobby is `lobby`'s entire intent.
    const cars = BANK.map((car) => car);
    for (const profile of profiles) {
      const policy = createDispatchPolicy(profile);
      const targets = cars
        .map((car) => policy.reposition(car, 0, RUNNER_PARK_CONTEXT))
        .filter((decision) => decision.move && decision.targetFloorId !== undefined)
        .map((decision) => decision.targetFloorId as string)
        .filter((floorId) => !RUNNER_PARK_CONTEXT.entranceFloorIds.includes(floorId));

      expect(
        targets.length,
        `${profile.id} sends ${targets.length} cars to ${[...new Set(targets)].join(', ')} under the context Simulation.#park supplies`,
      ).toBe(new Set(targets).size);
    }
  });

  it('parks the same bank on distinct floors once a partition is supplied', () => {
    // The other half, so the guard above cannot be satisfied by a strategy that simply never parks.
    // `zone-center` is not broken; it is unwired. Given the partition `prepositionPlan` builds, the
    // same profile that collapsed spreads across distinct floors.
    const zoned = profiles.find((candidate) => candidate.id === 'zoned-uppeak') as DispatcherProfile;
    const policy = createDispatchPolicy({
      ...zoned,
      idle: { ...zoned.idle, parkingStrategy: 'zone-center' },
    });

    // Four cars standing at the lobby, which is what an up-peak bank looks like before it disperses.
    const lobbyBank = ['A', 'B', 'C', 'D'].map((id) => snapshotAt(id, '0'));

    const collapsed = lobbyBank
      .map((car) => policy.reposition(car, 0, RUNNER_PARK_CONTEXT))
      .filter((decision) => decision.move && decision.targetFloorId !== undefined)
      .map((decision) => decision.targetFloorId as string);
    const spread = movesOf(prepositionPlan(policy, lobbyBank, 0, RUNNER_PARK_CONTEXT)).map(
      (decision) => decision.targetFloorId,
    );

    // Every car moves, and all four to the same floor.
    expect(collapsed.length, 'the unwired context still moves the whole bank').toBe(lobbyBank.length);
    expect(new Set(collapsed).size, 'the unwired context still collapses').toBe(1);
    // With the partition, one floor per car that moves, and more than one floor.
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
  });

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
    // Not `zone-center`, and the two tests above are why: `Simulation.#park` supplies no partition,
    // so declaring it would ship a profile that sends a whole bank to one floor.
    expect(zoned.idle.parkingStrategy).toBe('stay');

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
  it('cannot be authored as data at all yet, and this goes red the day it can', () => {
    // The tripwire. `dispatcherProfileSchema` is strict and has no `auction` section, so a profile
    // carrying one is rejected at load time — which is why a *second* auction profile could not
    // express a different aggregation and would resolve to the control arm under another name. That
    // was the defect: a profile named "multi-round with bid withdrawal" that resolved to
    // `rounds: 1`, differing from its own control only in stage 5, so the paired-t interval a
    // benchmark of the pair produced was an interval on reassignment and measured exactly zero
    // aggregation.
    //
    // When `config/schema.ts` gains the section (the rows it owes are in `types.ts` § Pending config
    // surface), this assertion fails. That is the point: the fix is to author the treatment arm as a
    // profile and replace this test with one asserting the authored value, and a green suite must
    // not be able to hide the gap in the meantime.
    const base = profiles.find((candidate) => candidate.id === 'auction') as DispatcherProfile;
    const parsed = dispatcherProfileSchema.safeParse({
      ...base,
      auction: { rounds: 3, reserveMarginalDelayS: 25 },
    });
    expect(parsed.success, 'config/schema.ts now carries an auction section — author it').toBe(false);

    // ...and therefore every authored profile resolves to the default aggregation. Nothing in the
    // data file claims an aggregation it cannot carry.
    for (const profile of profiles) {
      expect(resolveAuctionConfig(profile).auction, profile.id).toEqual({
        rounds: POLICY_DEFAULTS.rounds,
        reserveMarginalDelayS: POLICY_DEFAULTS.reserveMarginalDelayS,
      });
    }
  });

  it('builds both arms from one profile, differing in nothing but auction.rounds', () => {
    const base = profiles.find((candidate) => candidate.id === 'auction') as DispatcherProfile;
    const control = resolveAuctionConfig(base);
    const treatment = resolveAuctionConfig(base, {
      auction: { rounds: 3, reserveMarginalDelayS: 25 },
    });

    // Every resolved section outside `auction` must be identical, or the interval is an interval on
    // whichever one differs. This is the assertion the two-profile arrangement could not make.
    for (const section of ['dispatch', 'answer', 'idle', 'eligibility', 'normalization'] as const) {
      expect(treatment[section], section).toEqual(control[section]);
    }
    expect([...treatment.weights]).toEqual([...control.weights]);
    expect(treatment.declaredHardConstraints).toEqual(control.declaredHardConstraints);
    expect(treatment.constraints).toEqual(control.constraints);
    expect(control.auction.rounds).toBe(1);
    expect(treatment.auction.rounds).toBe(3);
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
 * The wiring gaps, enforced rather than described
 * -------------------------------------------------------------------------- */

describe('nothing in dispatch/policies is reachable from runSimulation, and that is asserted', () => {
  // A gap recorded only in a docstring rots two ways: it stays after it is fixed, so the module
  // understates itself, or it is quietly worked around and the docstring becomes the only evidence
  // that anything is missing. Both have the same shape as the defect this phase was reviewed for — a
  // declared thing that does nothing — so the four gaps are pinned here instead.
  //
  // Every assertion below FAILS the day the corresponding wiring lands. That is deliberate and it is
  // the point: whoever lands it must come back and (a) delete the assertion, (b) correct
  // `index.ts` § *Nothing in this directory is reachable from `runSimulation` yet*, and (c) write the
  // measurement the wiring makes possible — for `#park`, the Garden Apartments AWT interval that
  // Phase 5 asks for and `prepositioning.test.ts` currently substitutes a decision-level surrogate
  // for.
  const SIM_DIR = fileURLToPath(new URL('../../sim', import.meta.url));
  let simulation: string;
  let simTypes: string;

  beforeAll(async () => {
    simulation = await readFile(join(SIM_DIR, 'simulation.ts'), 'utf8');
    simTypes = await readFile(join(SIM_DIR, 'types.ts'), 'utf8');
  });

  it('has no policy hook on SimulationConfig, so an auction cannot enter a run', () => {
    expect(simTypes, 'SimulationConfig now has createPolicy — inject the auction and measure it').not.toContain(
      'createPolicy',
    );
    expect(simulation).not.toContain('createAuctionPolicy');
  });

  it('has no reconsider call site, so capacity-driven migration never fires', () => {
    // The gap the report on this module did not disclose. `capacity.ts`'s whole subject is stage 5,
    // and `simulation.ts` never asks a policy to reconsider anything, so the mechanism has never run
    // on a building and its value against `reassignmentPolicy: never` is unmeasured.
    expect(simulation, 'simulation.ts now reconsiders — wire the monitor and measure it').not.toContain(
      '.reconsider(',
    );
    expect(simulation).not.toContain('CapacityReassignmentMonitor');
  });

  it('builds its reposition context inline, so no forecast and no partition reach stage 7', () => {
    const remedy =
      'simulation.ts now builds a reposition context — restore zone-center on zoned-uppeak and write the Garden Apartments AWT interval Phase 5 asks for';
    for (const symbol of ['repositionContextFor', 'prepositionPlan', 'resolvePrepositionContext']) {
      expect(simulation, remedy).not.toContain(symbol);
    }
    // And the inline construction is still exactly the one the two parking tests above measure.
    expect(simulation).toContain('entranceFloorIds: this.#entranceFloorIds');
  });

  it('builds its dispatch context from two counts, so zoneAffinity and predictedDemand stay zero', () => {
    const remedy =
      'simulation.ts now builds a group context — delete the runner-context assertion above, which asserts these two terms score zero in a run';
    for (const symbol of [
      'groupContext',
      'withLandingCounts',
      'zoneFloorIdsByCarId',
      'demandForecast',
    ]) {
      expect(simulation, remedy).not.toContain(symbol);
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
    // Verbatim the contract `dispatch/parameters.test.ts` asserts for every row in
    // DISPATCH_PARAMETERS: the gate must exist, be categorical, and admit each listed value. There
    // is one evaluation rule for the whole schema or there is elevator-specific knowledge in it
    // (CLAUDE.md invariant 8).
    //
    // This suite previously checked only that the dependency id was known and the value list
    // non-empty, which let `auction.reserveMarginalDelayS` gate on `auction.rounds` — an integer
    // with a range and no `values` — using the stringified numbers ['2'…'8']. That gate satisfies the
    // shape and none of the semantics: a generic optimizer evaluates `gate.values.includes('2')`
    // against `undefined` and either throws or disables the reserve forever, and one comparing its
    // own sampled 3 against '3' never activates it. It is gone; see `parameters.ts` § Why the reserve
    // carries no activeWhen. This assertion is what stops it, or anything like it, coming back.
    for (const parameter of POLICY_PARAMETERS) {
      for (const [dependency, values] of Object.entries(parameter.activeWhen ?? {})) {
        const gate = policyParameter(dependency) ?? dispatchParameter(dependency);
        expect(gate, `${parameter.id} → ${dependency}`).toBeDefined();
        expect(gate?.type, `${parameter.id} → ${dependency} is not categorical`).toBe('categorical');
        expect(values.length, `${parameter.id} activeWhen ${dependency}`).toBeGreaterThan(0);
        for (const value of values) {
          expect(gate?.values, `${parameter.id} → ${dependency}=${value}`).toContain(value);
        }
      }
    }
  });

  it('keeps the reserve inert at one round — asserted on the aggregation, not on a value list', () => {
    // The condition the deleted gate tried to express, measured instead. A reserve of zero seconds
    // declines every bidder that would delay anybody, so if `rounds: 1` were not inert this would
    // withdraw; and the second half proves the fixture can in fact produce a withdrawal, so the
    // first half is not passing because nothing was over the reserve.
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

    // And the range a Phase 7 optimizer samples still covers every round the resolver accepts, so
    // the dimension is searchable even though the condition is not machine-readable.
    expect(policyParameter('auction.rounds')?.range).toEqual([1, MAX_AUCTION_ROUNDS]);
    expect(policyParameter('auction.reserveMarginalDelayS')?.activeWhen).toBeUndefined();
    // The condition is stated where it cannot be misread, since it cannot be evaluated.
    expect(policyParameter('auction.reserveMarginalDelayS')?.description).toContain(
      'auction.rounds is 1',
    );
  });
});
