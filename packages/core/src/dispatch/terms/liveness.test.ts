/**
 * The test that says every weighted term can actually change a decision.
 *
 * A cost term can be wrong in two ways. It can compute the wrong number — every other file in
 * this directory tests for that — or it can be **inert**: implemented, registered, weighted by a
 * shipped profile, and returning the same value (usually zero) for every candidate car in every
 * configuration the engine can be put in. The second is worse, because nothing fails. Boundedness
 * tests pass, purity tests pass, `scoreCar` is happy, the run completes, and a Phase 7 optimizer
 * spends a fifth of its replication budget searching a dimension that cannot move an `argmin` —
 * against a measured resolution floor of ~1.3 s, 8% of AWT, at n = 100 (docs/03 § the Phase 3
 * gate). That is exactly how a noise-driven "winner" gets reported.
 *
 * Three terms shipped inert and no test caught it: `rideTime` returned 0 in every shipped profile
 * because none sets `dispatch.callType`, and `zoneAffinity` and `predictedDemand` returned 0
 * everywhere because `lifecycle.observationFor` built an observation from two fields and dropped
 * the two the group controller owns. Every terms test injected those fields through a fixture
 * helper, so the terms looked alive from the inside and were dead through the engine.
 *
 * So this file asserts liveness the only way that means anything:
 *
 * - through **`policy.score()`**, not through a hand-built `TermContext`, so the observation is the
 *   one `observationFor` really produces and the request is the one `costRequestFor` really builds
 *   under the profile's `callType`;
 * - on **a real building** — `midtown-office`, mid-run, cars carrying passengers and holding
 *   landing calls — not on a fixture shaft chosen to make a term speak;
 * - demanding a **non-zero raw** *and* a **spread between two candidate cars**. Non-zero alone is
 *   not enough: a term that returns the same 36 m for every car is a constant added to every
 *   candidate's cost, and a constant cannot change a ranking.
 *
 * ## What this file does **not** claim, stated so nobody reads more into it
 *
 * It proves the terms are live through the **policy**, given a caller that supplies what it holds.
 * It does not prove they are live through `sim/simulation.ts`, and for a whole phase two of them
 * were not: the run loop called `policy.dispatch(..., { waitingPassengers, waitingMassKg })`, built
 * no group context, and a profile weighting `zoneAffinity` produced **byte-identical AWT at weights
 * of 0.3, 0 and 50** on `midtown-office`. That is closed — `#dispatchBank` resolves a
 * `groupContext` per pass and `#park` resolves the bank's preposition context — but the claim this
 * file makes is still the narrower one, deliberately. **`sim/seam.test.ts` is where the run-level
 * claim lives**: it wraps the real policy through `SimulationConfig.createPolicy` and requires every
 * weighted term to produce a non-zero raw *and* a spread across candidate cars inside a full
 * `runSimulation`. Two files, two claims, and neither can be mistaken for the other.
 */

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../config/loader.js';
import type { CarSnapshot, ServedFloor } from '../../model/car/types.js';
import { hallCallId } from '../../model/types.js';
import { DATA_DIR } from '../../sim/fixtures.test-helper.js';
import { Simulation } from '../../sim/simulation.js';
import { createDispatchPolicy } from '../policy.js';
import type { DispatchCall, DispatchContext, DispatcherProfileSource } from '../types.js';

import { COST_TERMS } from './index.js';

/**
 * Every term weighted, and the one stage setting `rideTime` needs.
 *
 * `destination-entry` is not a thumb on the scale: it is the configuration under which the term
 * is declared live (`rideTimeTerm.activeWhen`), and the point of the assertion is that the term
 * discriminates *somewhere in the engine's configuration space*, not that it discriminates under
 * the default.
 */
const EVERY_TERM: DispatcherProfileSource = {
  id: 'liveness',
  name: 'Every term weighted',
  weights: Object.fromEntries(COST_TERMS.map((term) => [term.id, 1])),
  dispatch: { callType: 'destination-entry' },
  eligibility: { enRouteDiversion: true },
};

/** What the group controller owns, in the shape `groupContext` hands over. */
function groupFacts(snapshots: readonly CarSnapshot[]): DispatchContext {
  const floors = snapshots[0]?.shaft.floors ?? [];
  const width = Math.max(1, Math.ceil(floors.length / Math.max(1, snapshots.length)));
  const zoneFloorIdsByCarId = new Map<string, readonly string[]>();
  snapshots.forEach((snapshot, index) => {
    zoneFloorIdsByCarId.set(
      snapshot.carId,
      floors.slice(index * width, (index + 1) * width).map((floor) => floor.id),
    );
  });

  // Up-peak shaped: nearly all of it at the terminal, so a car that ends its route high is
  // measurably worse placed than one that ends low.
  const demandForecast = new Map<string, number>();
  floors.forEach((floor, index) => demandForecast.set(floor.id, index === 0 ? 30 : 1));

  return { zoneFloorIdsByCarId, demandForecast };
}

function callAt(
  floor: ServedFloor,
  direction: 'up' | 'down',
  destinationFloorId: string,
  at: number,
): DispatchCall {
  return {
    id: hallCallId(floor.id, direction),
    floorId: floor.id,
    floorIndex: floor.index,
    direction,
    // Old enough that a car already holding it is holding a starving call.
    registeredAt: Math.max(0, at - 95),
    destinationFloorId,
  };
}

interface Liveness {
  nonZero: number;
  evaluations: number;
  maxSpread: number;
}

describe('every term in the registry can change a decision through the real engine', () => {
  it('scores non-zero, and differently between two candidate cars, for all thirteen', async () => {
    const config = await loadConfig(DATA_DIR);
    const building = config.buildingsById.get('midtown-office');
    const shipped = config.dispatcherProfilesById.get('predictive-balanced');
    expect(building).toBeDefined();
    expect(shipped).toBeDefined();

    const policy = createDispatchPolicy(EVERY_TERM);
    const liveness = new Map<string, Liveness>(
      COST_TERMS.map((term) => [term.id, { nonZero: 0, evaluations: 0, maxSpread: 0 }]),
    );
    let scoredCars = 0;
    let carsCarryingPassengers = 0;
    let carsHoldingCalls = 0;

    // Mid-run, at three points, for the reason `normalize.test.ts` truncates: at the end of a
    // replication every car is idle and empty, which is the one state that exercises nothing.
    for (const maxEvents of [600, 1500, 2500]) {
      const simulation = new Simulation({
        building: building!,
        dispatcherProfile: shipped!,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: 20260726,
        maxEvents,
        onTimeout: 'report',
      });
      try {
        simulation.run();
      } catch {
        // A truncated run is the point; the cars are what this test is after, not the numbers.
      }

      const at = Math.max(...simulation.building.cars.map((car) => car.snapshot().at));
      // **`enRouteDiversion` on the snapshot, for the same reason `EVERY_TERM` sets a call type
      // that carries a destination.** Presence is permission (`DECISIONS.md` § D205): a snapshot
      // taken without it has no `divertFrontierIndex`, so `diversionDetour` reads zero for every
      // car and would fail below as inert — not because the term is dead, but because the fixture
      // put it outside its own declared `activeWhen`. The point of this suite is that a term
      // discriminates *somewhere in the engine's configuration space*.
      const snapshots = simulation.building.cars.map((car) =>
        car.snapshot(at, { enRouteDiversion: true }),
      );
      carsCarryingPassengers += snapshots.filter((snapshot) => snapshot.load.occupants > 0).length;
      carsHoldingCalls += snapshots.filter((snapshot) => snapshot.stops.length > 0).length;

      const context = groupFacts(snapshots);

      for (const floor of snapshots[0]?.shaft.floors ?? []) {
        for (const direction of ['up', 'down'] as const) {
          for (const destinationFloorId of ['G', '12', '20']) {
            if (destinationFloorId === floor.id) continue;
            for (const waitingPassengers of [0, 4, 25]) {
              const subject = callAt(floor, direction, destinationFloorId, at);
              const scores = policy.score(subject, snapshots, at, {
                ...context,
                waitingPassengers,
              });
              if (scores.length < 2) continue;
              scoredCars += scores.length;

              for (const term of COST_TERMS) {
                const raws = scores.map(
                  (score) => score.terms.find((breakdown) => breakdown.termId === term.id)?.raw ?? 0,
                );
                const tally = liveness.get(term.id) as Liveness;
                tally.evaluations += raws.length;
                tally.nonZero += raws.filter((raw) => raw !== 0).length;
                tally.maxSpread = Math.max(
                  tally.maxSpread,
                  Math.max(...raws) - Math.min(...raws),
                );
              }
            }
          }
        }
      }
    }

    if (process.env['LIVENESS_REPORT'] === '1') {
      for (const term of COST_TERMS) {
        const t = liveness.get(term.id) as Liveness;
        process.stdout.write(
          `LIVE ${term.id} ${((100 * t.nonZero) / t.evaluations).toFixed(1)}% spread=${t.maxSpread.toFixed(4)} evals=${String(t.evaluations)}\n`,
        );
      }
    }
    // Guards against the assertions below passing on an empty sample.
    expect(scoredCars).toBeGreaterThan(1000);
    expect(carsCarryingPassengers).toBeGreaterThan(2);
    expect(carsHoldingCalls).toBeGreaterThan(2);

    // Measured over 4320 (car, call) evaluations per term — percentage with a non-zero raw, and
    // the largest spread seen between two candidate cars. Regenerate with
    // `LIVENESS_REPORT=1 npx vitest run` on this file rather than editing by hand; a table nobody
    // can re-derive is the shape `benchmark/published.ts` exists to stop.
    //
    //   waitTime 97.6% / 158.8 s      rideTime 100.0% / 140.7 s     detourPenalty 34.3% / 144.8 p·s
    //   diversionDetour 1.7% / 42.5 p·s     existingCallDelay 69.9% / 144.8 s
    //   directionReversal 77.4% / 2   loadFactor 100.0% / 0.72      stopCount 88.2% / 2
    //   distanceTravelled 37.9% / 138.6 m   starvation 69.1% / 59212 s
    //   zoneAffinity 75.0% / 69.3 m   predictedDemand 100.0% / 44.3 m    crowding 34.2% / 0.75
    //
    // **Every number above moved when `diversionDetour` landed, and none of it is that term's
    // arithmetic.** Taking the snapshots with `enRouteDiversion` makes a moving car's route project
    // from its commit point instead of its destination, so every route-derived term is now priced
    // on a different set of routes — `detourPenalty` 44.5% → 34.3%, `distanceTravelled` 11.3% →
    // 37.9%, and the evaluation count 3240 → 4320. The configuration changed, not the terms.
    //
    // **`diversionDetour`'s 1.7% is the point rather than a weakness.** A diversion is rare among
    // all (car, call) pairs, and a term that charged the detour on a third of them would be
    // `detourPenalty` under another name — which is the whole finding of `DECISIONS.md` § D210.
    // What matters is that it is non-zero *and* separates two cars by 42.5 passenger-seconds, so
    // it can move an `argmin`.
    //
    // The three that once read 0.0% and spread 0.0000 are `rideTime`, `zoneAffinity` and
    // `predictedDemand`. The assertions below are deliberately weak — non-zero, and any spread —
    // because the strong forms belong in each term's own file; this one exists to catch death.
    for (const term of COST_TERMS) {
      const tally = liveness.get(term.id) as Liveness;
      // Every weighted term must be able to say something...
      expect(tally.nonZero, `${term.id} scored zero in all ${tally.evaluations} evaluations`).toBeGreaterThan(0);
      // ...and must be able to say something *different* about two cars. A term that cannot is a
      // constant in the weighted sum and cannot move an argmin, however large its weight.
      expect(tally.maxSpread, `${term.id} scored identically for every candidate car`).toBeGreaterThan(0);
    }
  }, 60_000);

  it('is inert, not wrong, when the group controller supplies nothing', async () => {
    // The other half of the contract. `zoneAffinity` and `predictedDemand` price facts only the
    // group controller holds, and a caller that holds none must get zero rather than a guess — a
    // fabricated zone or forecast would be a plausible-looking run of a system nobody configured.
    // This is what makes the assertion above meaningful: the terms are live *because the facts
    // arrive*, not because they invent them.
    const config = await loadConfig(DATA_DIR);
    const building = config.buildingsById.get('midtown-office');
    const shipped = config.dispatcherProfilesById.get('predictive-balanced');

    const simulation = new Simulation({
      building: building!,
      dispatcherProfile: shipped!,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: 20260726,
      maxEvents: 1500,
      onTimeout: 'report',
    });
    try {
      simulation.run();
    } catch {
      // As above.
    }

    const at = Math.max(...simulation.building.cars.map((car) => car.snapshot().at));
    const snapshots = simulation.building.cars.map((car) => car.snapshot(at));
    const policy = createDispatchPolicy(EVERY_TERM);
    const twelve = snapshots[0]?.shaft.floorsById.get('12');
    expect(twelve).toBeDefined();
    const subject = callAt(twelve!, 'down', 'G', at);

    const bare = policy.score(subject, snapshots, at, { waitingPassengers: 4 });
    const supplied = policy.score(subject, snapshots, at, {
      ...groupFacts(snapshots),
      waitingPassengers: 4,
    });

    for (const termId of ['zoneAffinity', 'predictedDemand'] as const) {
      const withoutFacts = bare.map(
        (score) => score.terms.find((breakdown) => breakdown.termId === termId)?.raw ?? 0,
      );
      const withFacts = supplied.map(
        (score) => score.terms.find((breakdown) => breakdown.termId === termId)?.raw ?? 0,
      );
      expect(withoutFacts.every((raw) => raw === 0), termId).toBe(true);
      expect(withFacts.some((raw) => raw !== 0), termId).toBe(true);
    }
  }, 60_000);
});
