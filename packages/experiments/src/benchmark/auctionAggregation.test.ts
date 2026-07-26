/**
 * **The architecture question, answered empirically.** docs/01-architecture.md declares contract-net
 * bidding a policy to be benchmarked rather than an architecture to be assumed. This is the benchmark.
 *
 * Two findings, and the difference in their *kind* is the finding:
 *
 * 1. **Sealed-bid is the centralized argmin. 0 disagreements in 1200 decisions.** Same car, same
 *    price, every time. Decentralizing the argmin changes who computes it and not what it computes,
 *    so the agent-autonomy hypothesis gains nothing from decentralization alone. This also means the
 *    `auction` row of the main comparison table — which runs through the ordinary
 *    `WeightedCostDispatchPolicy` — **already is** the sealed-bid arm, and no second simulation of it
 *    should be run.
 * 2. **Multi-round diverges on 9.2 % of decisions, and it is now benchmarked on AWT too.** The
 *    contract net is a genuinely different policy: at `rounds = 3, reserveMarginalDelayS = 25` a
 *    provisional winner declines on 380 occasions across 1200 states and the contract lands on a
 *    different car 110 times.
 *
 * The second finding used to end *"but `SimulationConfig` has no policy hook, so an
 * `AuctionDispatchPolicy` cannot be injected into a run and no wait-time interval exists for it"*,
 * and this suite asserted that obstruction against `core`'s own source so the claim could not rot.
 * It has rotted the right way: `config/schema.ts` carries the `auction` section,
 * `dispatch/policies/registry.ts` maps `auction.aggregation` to a factory, and
 * `data/dispatcher-profiles.json` ships **`auction` and `auction-multi-round` as two profiles that
 * differ in that section and in nothing else**. So the aggregation is selected by data, both arms
 * run through `runSimulation`, and `ARM_PROFILES` carries nine entries with a paired-t interval for
 * each. The assertion below is now the reachability claim in the affirmative, made behaviourally:
 * the two profiles must produce observably different journeys on a real building at one seed.
 *
 * The divergence rate is still not a wait-time result and is still not quoted as one. It is the
 * mechanism the interval measures the consequence of.
 */

import { describe, expect, it } from 'vitest';

import { runSimulation } from '@elevator-sim/core';

import { loadResources } from '../validation/harness.js';

import {
  AUCTION_PROFILE,
  CONTRACT_NET,
  ENSEMBLE_BUILDINGS,
  MULTI_ROUND_PROFILE,
  measureAuctionAggregation,
  multiRoundIsReachableFromSimulation,
  type AuctionEnsembleResult,
} from './auctionAggregation.js';

const TIMEOUT_MS = 300_000;

let cached: AuctionEnsembleResult | undefined;

async function ensemble(): Promise<AuctionEnsembleResult> {
  cached ??= await measureAuctionAggregation();
  return cached;
}

describe('Phase 5 — auction aggregation against the centralized argmin', () => {
  it('draws a decision population large enough for a universal claim', async () => {
    const result = await ensemble();
    console.log(
      `${result.states} decision states across ${ENSEMBLE_BUILDINGS.length} buildings; ` +
        `${result.unallocatableStates.length} had no eligible car and both aggregations declined.`,
    );
    expect(result.states).toBeGreaterThanOrEqual(1000);
    // Every state has at least two bidders. An auction with one bidder has no aggregation in it and
    // would dilute the divergence rate with decisions that could not have diverged.
    for (const outcome of result.outcomes) {
      expect(outcome.state.cars.length).toBeGreaterThanOrEqual(2);
    }
  }, TIMEOUT_MS);

  it('finds sealed-bid identical to the centralized argmin on every decision', async () => {
    const result = await ensemble();
    expect(result.sealedDisagreements).toEqual([]);
    expect(result.costDisagreements).toEqual([]);
    expect(result.sealedEqualsArgmin).toBe(true);
    console.log(
      `Sealed-bid vs centralized argmin: ${result.sealedDisagreements.length} allocation differences ` +
        `and ${result.costDisagreements.length} price differences in ${result.states} decisions. ` +
        'Single-round auction dispatch is the central scorer under another name.',
    );
  }, TIMEOUT_MS);

  it('agrees even where nobody is eligible — a declined contract on both sides is agreement', async () => {
    // The eight states the first run of this study mis-reported as price disagreements, because
    // `NaN !== NaN`. Kept as a test so the comparison cannot regress into that reading.
    for (const outcome of (await ensemble()).unallocatableStates) {
      expect(outcome.centralCarId).toBeUndefined();
      expect(outcome.sealedCarId).toBeUndefined();
      expect(outcome.multiRoundCarId).toBeUndefined();
    }
  }, TIMEOUT_MS);

  it('finds the contract net genuinely reallocates — it is not the same policy twice', async () => {
    const result = await ensemble();
    const rounds = new Map<number, number>();
    for (const outcome of result.outcomes) {
      const held = outcome.multiRoundOutcome.rounds;
      rounds.set(held, (rounds.get(held) ?? 0) + 1);
    }
    console.log(
      `Contract net at rounds = ${CONTRACT_NET.rounds}, reserve = ${CONTRACT_NET.reserveMarginalDelayS} s: ` +
        `${result.multiRoundDivergences.length}/${result.states} diverged from the argmin ` +
        `(${(result.divergenceRate * 100).toFixed(1)} %); withdrawals ${JSON.stringify(result.withdrawalsByReason)}; ` +
        `${result.waivedCount} waived to avoid leaving a landing unserved; rounds held ${JSON.stringify([...rounds])}.`,
    );
    // A benchmark whose two arms never diverge is measuring one dispatcher twice. This one does.
    expect(result.multiRoundDivergences.length).toBeGreaterThan(0);
    expect(result.divergenceRate).toBeGreaterThan(0.01);
    // Both withdrawal rules fire. If only one did, the other would be untested behaviour shipping as
    // a tunable.
    expect(result.withdrawalsByReason['reserve-price']).toBeGreaterThan(0);
    expect(result.withdrawalsByReason['load-crossing']).toBeGreaterThan(0);
    // The starvation guard fires too: honouring some withdrawals would leave a landing unserved, and
    // a contract net that dropped the call rather than waiving them would not have made a decision.
    expect(result.waivedCount).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it('reaches multi-round from runSimulation, so the aggregation has a wait-time interval', async () => {
    // This test used to assert the opposite, against core's own source: that `SimulationConfig`
    // carried no policy factory and that `Simulation` built every bank controller with
    // `createDispatchPolicy`. It was written to fail the day the hook landed, and this is that day.
    //
    // What replaces it is behavioural rather than textual, because a grep for a symbol proves a
    // call site exists and not that anything reaches it. Two profiles that differ only in their
    // `auction` section are run on a real building, and the contract net must produce an observably
    // different set of journeys — otherwise the aggregation is one dispatcher measured twice, which
    // is exactly what a renamed profile would look like.
    expect(multiRoundIsReachableFromSimulation()).toBe(true);

    const config = await loadResources();
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('midtown-office is missing');

    const journeysOf = (profileId: string): string => {
      const profile = config.dispatcherProfilesById.get(profileId);
      if (profile === undefined) throw new Error(`missing profile "${profileId}"`);
      const result = runSimulation({
        building,
        dispatcherProfile: profile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: 20260726,
        onTimeout: 'report',
      });
      return result.record.passengers
        .map((leg) => `${leg.passengerId}:${leg.carId ?? '-'}:${String(leg.boardedAt)}`)
        .join('|');
    };

    const sealed = journeysOf(AUCTION_PROFILE);
    const contractNet = journeysOf(MULTI_ROUND_PROFILE);
    expect(
      contractNet,
      'the multi-round profile produced a byte-identical run to the sealed-bid one — the aggregation is not reaching the run loop',
    ).not.toBe(sealed);

    console.log(
      `${MULTI_ROUND_PROFILE} runs its contract net inside runSimulation and allocates differently ` +
        `from ${AUCTION_PROFILE} on midtown-office at one seed. The two profiles differ in their ` +
        'auction section and in nothing else, so the difference is the aggregation.',
    );
  }, TIMEOUT_MS);

  it('runs on the profile whose weights the aggregation question is about', async () => {
    // The *decision-level* ensemble is driven from one profile, which is a property of this
    // measurement rather than of the config layer: it asks what two aggregations do to the same
    // 1200 states, so both sides must be handed identical weights. The shipped pair
    // (`auction` / `auction-multi-round`) is what the AWT comparison uses, and it is sound for the
    // same reason — the two differ in their `auction` section and in nothing else.
    const result = await ensemble();
    expect(AUCTION_PROFILE).toBe('auction');
    expect(result.outcomes.length).toBe(result.states);
    for (const buildingId of ENSEMBLE_BUILDINGS) {
      expect(result.outcomes.some((outcome) => outcome.state.buildingId === buildingId)).toBe(true);
    }
  }, TIMEOUT_MS);
});
