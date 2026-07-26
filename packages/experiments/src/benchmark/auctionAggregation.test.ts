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
 * 2. **Multi-round diverges on 9.2 % of decisions, and cannot be benchmarked on AWT at all.** The
 *    contract net is a genuinely different policy: at `rounds = 3, reserveMarginalDelayS = 25` a
 *    provisional winner declines on 380 occasions across 1200 states and the contract lands on a
 *    different car 110 times. But `SimulationConfig` has no policy hook, so an `AuctionDispatchPolicy`
 *    cannot be injected into a run and **no wait-time interval exists for it**. A divergence rate is
 *    not an AWT result. This suite asserts that the obstruction is real by reading `core`'s own
 *    source, so the claim cannot rot into a stale comment.
 *
 * So the answer to *"does multi-round ever beat sealed-bid?"* is: **unmeasured, and unmeasurable
 * today.** It reallocates, which means it *could*. Whether reallocation helps a passenger is a
 * paired-t interval nobody can compute until `core` grows one optional field.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AUCTION_PROFILE,
  CONTRACT_NET,
  ENSEMBLE_BUILDINGS,
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

  it('cannot quote an AWT interval for multi-round, because Simulation has no policy hook', async () => {
    // Asserted against core's own source rather than asserted as a sentence. The day
    // `SimulationConfig` grows a policy factory, this test fails and this whole module is owed a real
    // paired-t comparison on a real building. That failure is the point of the test.
    const simulationSource = readFileSync(
      fileURLToPath(new URL('../../../core/src/sim/simulation.ts', import.meta.url)),
      'utf8',
    );
    const typesSource = readFileSync(
      fileURLToPath(new URL('../../../core/src/sim/types.ts', import.meta.url)),
      'utf8',
    );
    expect(simulationSource).toContain('createDispatchPolicy(profile');
    expect(typesSource).not.toContain('createPolicy');
    expect(multiRoundIsReachableFromSimulation()).toBe(false);
    console.log(
      'AuctionDispatchPolicy is unreachable from runSimulation: SimulationConfig carries no policy ' +
        'factory and Simulation builds every bank controller with createDispatchPolicy. The ' +
        'multi-round arm therefore has a measured divergence rate and NO wait-time interval, and the ' +
        'divergence rate must not be quoted as one.',
    );
  });

  it('runs on the profile whose weights the aggregation question is about', async () => {
    // One profile, two option sets. Two profiles would have differed in stage settings, and the
    // interval between them would have been an interval on stage 5 rather than on the aggregation.
    const result = await ensemble();
    expect(AUCTION_PROFILE).toBe('auction');
    expect(result.outcomes.length).toBe(result.states);
    for (const buildingId of ENSEMBLE_BUILDINGS) {
      expect(result.outcomes.some((outcome) => outcome.state.buildingId === buildingId)).toBe(true);
    }
  }, TIMEOUT_MS);
});
