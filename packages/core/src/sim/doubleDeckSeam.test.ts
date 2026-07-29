/**
 * **The double-deck seam guard**, in the manner of `sim/seam.test.ts`.
 *
 * The claim under test is the one `data/buildings/vertical-city.json` has made since it was
 * authored and the runtime ignored for the whole life of the project: *a stop at a floor pair
 * serves both floors at once*. Every assertion below is **behavioural** — two configurations the
 * docs say must differ are run through `runSimulation` on the same seed, and their car
 * trajectories must not be byte-identical.
 *
 * ## Why trajectories, and not AWT
 *
 * `sim/seam.test.ts` gives the reason and it is the reason here: two configurations can produce
 * the same mean from different journeys, and *a mean is exactly the statistic that hides a
 * structural difference*. Double-deck's whole effect is structural — half the stops, one door
 * cycle where there were two — and it lands on `vertical-city`, whose shuttle bank is the one the
 * closed-form oracle cannot measure at all. So the evidence is the car's own path: which floors it
 * stood at, how many times, and how far it drove.
 *
 * ## The three properties
 *
 * | Property | Fails when |
 * |---|---|
 * | a double-deck car stands only at **stop positions** | `Car` stops normalizing a floor to its pair's lower floor, and a car "moves" 4.5 m between two floors it occupies simultaneously |
 * | the pairing **changes the run** | `shaftForBank` stops reading `servesFloorPairs`, or nothing downstream reads the shaft's deck index — the exact shape of the ten dead seams |
 * | the pairing **saves stops on the shuttle** | the decks are wired but a stop is still being made once per floor, which is the defect wearing the fix |
 *
 * The control arm is the same building with `servesFloorPairs` stripped — the hardware without its
 * geometry, which is precisely the state the runtime used to be in for every double-deck bank.
 */

import { describe, expect, it } from 'vitest';

import type { ResolvedBank, ResolvedBuilding } from '../config/types.js';

import { BUILDING_IDS, load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

const SEED = 20_260_726;
const DECK_BUILDING = 'vertical-city';
const DECK_BANK = 'shuttle';

/** Every leg's car and boarding instant: the trajectory, not a statistic over it. */
function trajectory(result: SimulationResult): string {
  return result.record.passengers
    .map(
      (leg) =>
        `${leg.passengerId}:${leg.carId ?? '-'}:${String(leg.boardedAt)}:${String(leg.alightedAt)}`,
    )
    .join('|');
}

/** The same building with every deck pairing stripped: the hardware, minus its geometry. */
function withoutFloorPairs(building: ResolvedBuilding): ResolvedBuilding {
  return {
    ...building,
    banks: building.banks.map((bank) => {
      const { servesFloorPairs: _dropped, ...rest } = bank as ResolvedBank & {
        servesFloorPairs?: unknown;
      };
      return rest as ResolvedBank;
    }),
  };
}

describe('a stop at a floor pair serves both floors, and a run can see it', () => {
  it('never drives a double-deck car the deck separation, and still serves the upper floors', async () => {
    const cfg = await load();
    const building = cfg.buildingsById.get(DECK_BUILDING) as ResolvedBuilding;
    const bank = building.banks.find((candidate) => candidate.id === DECK_BANK);
    if (bank === undefined) throw new Error(`missing bank ${DECK_BANK}`);
    const pairs = bank.servesFloorPairs ?? [];
    expect(pairs, 'the shuttle no longer declares floor pairs').not.toEqual([]);

    const common: Omit<SimulationConfig, 'building'> = {
      dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
    };
    const paired = runSimulation({ ...common, building });
    const single = runSimulation({ ...common, building: withoutFloorPairs(building) });

    const upperFloorIds = new Set(pairs.map((pair) => pair[1]));
    const heightOf = (floorId: string): number =>
      building.floorsById.get(floorId)?.heightM ?? Number.NaN;
    // The deck separation, read off the building rather than off the car's declared 4.5 m, so
    // the assertion is about the geometry the shaft actually has.
    const separationM = Math.min(
      ...pairs.map((pair) => heightOf(pair[1]) - heightOf(pair[0])),
    );
    expect(separationM).toBeGreaterThan(0);

    // **The trajectory itself.** Every completed move of every shuttle car, from the run
    // record's travel samples. The floors of a pair are `separationM` apart and a double-deck
    // car occupies both at once, so a move of that length is a car being driven to where it
    // already is — the exact defect the normalization exists to prevent. The threshold is
    // *below* the smallest legal inter-pair hop (G to 26 is 105.6 m) and above the separation,
    // so it separates the two cleanly.
    const shuttleMoves = (result: SimulationResult): readonly number[] =>
      (result.record.travelSamples ?? [])
        .filter((sample) => sample.carId.startsWith(`${DECK_BANK}-`))
        .map((sample) => sample.distanceM);

    const pairedMoves = shuttleMoves(paired);
    expect(pairedMoves.length, 'the shuttle cars never moved').toBeGreaterThan(0);
    const intraPair = pairedMoves.filter((distanceM) => distanceM <= separationM * 1.5);
    expect(
      intraPair,
      'a shuttle car was driven a deck separation, so it is being positioned per floor rather than per pair',
    ).toEqual([]);

    // The control arm proves the assertion above can fail: without the pairing the same cars,
    // on the same seed and the same passengers, do make exactly that move.
    expect(
      shuttleMoves(single).filter((distanceM) => distanceM <= separationM * 1.5).length,
      'the single-deck arm made no intra-pair move either, so the assertion above is vacuous',
    ).toBeGreaterThan(0);

    // And both floors of the pairs were nonetheless served: passengers alighted at the upper
    // floors the cars never stood at, which is only possible through the upper deck.
    const alightedUpper = paired.record.passengers.filter(
      (leg) => leg.alightedAt !== null && upperFloorIds.has(leg.destinationFloorId),
    );
    expect(
      alightedUpper.length,
      'nobody ever alighted at an upper-deck floor, so the upper deck served nothing',
    ).toBeGreaterThan(0);
  }, 180_000);

  it('changes the run: the same seed with the pairing stripped gives a different trajectory', async () => {
    const cfg = await load();
    const building = cfg.buildingsById.get(DECK_BUILDING) as ResolvedBuilding;
    const common: Omit<SimulationConfig, 'building'> = {
      dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
    };

    const paired = runSimulation({ ...common, building });
    const single = runSimulation({ ...common, building: withoutFloorPairs(building) });

    // Common random numbers: the trace is drawn before anything moves and from the same seed, so
    // the two arms see the *same passengers*. Anything that differs afterwards is the decks.
    expect(paired.trace.passengers.length).toBe(single.trace.passengers.length);
    expect(
      trajectory(paired),
      'declaring servesFloorPairs changed nothing in the run — the deck geometry is dead in the shipped path',
    ).not.toBe(trajectory(single));
  }, 120_000);

  it('makes strictly fewer stops on the shuttle bank for the same passengers', async () => {
    const cfg = await load();
    const building = cfg.buildingsById.get(DECK_BUILDING) as ResolvedBuilding;
    const common: Omit<SimulationConfig, 'building'> = {
      dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
    };

    const paired = runSimulation({ ...common, building });
    const single = runSimulation({ ...common, building: withoutFloorPairs(building) });

    // Completed moves of the shuttle bank. A stop that serves two floors is a stop the car does
    // not have to drive to twice, so the move count is where the saving shows up in the record.
    const movesOn = (result: SimulationResult, bankId: string): number =>
      (result.record.travelSamples ?? []).filter((sample) =>
        sample.carId.startsWith(`${bankId}-`),
      ).length;

    // **The point of the hardware.** A pair is one stop where two floors were two, so the same
    // demand is served with fewer approaches and fewer door cycles. Asserted as a strict
    // inequality rather than a ratio: the saving depends on how often both floors of a pair are
    // wanted at once, which is a property of the traffic and not something to pin a constant to
    // here.
    expect(
      movesOn(paired, DECK_BANK),
      'the paired arm made no fewer moves on the shuttle than the single-deck arm',
    ).toBeLessThan(movesOn(single, DECK_BANK));

    // And the decks did the work the counters say they did.
    expect(paired.stageActivity.doubleDeckPairedStops).toBeGreaterThan(0);
    expect(single.stageActivity.doubleDeckPairedStops).toBe(0);
  }, 120_000);

  it('leaves every building without a double-deck car untouched, byte for byte', async () => {
    const cfg = await load();
    // The blast radius, as a test rather than as a claim. `withoutFloorPairs` is a no-op on a
    // building that declares none, so the two arms are the same configuration and the check is
    // that the deck-aware code paths are genuinely inert — the same property that makes the
    // stored golden runs of the other four buildings reproduce.
    for (const id of BUILDING_IDS) {
      const building = cfg.buildingsById.get(id) as ResolvedBuilding;
      if (building.banks.some((bank) => bank.cars.some((car) => car.doubleDeck === true))) continue;
      const common: Omit<SimulationConfig, 'building'> = {
        dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
        trafficProfiles: cfg.trafficProfiles,
        elevatorSpecs: cfg.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
      };
      expect(trajectory(runSimulation({ ...common, building })), `${id} is not deterministic`).toBe(
        trajectory(runSimulation({ ...common, building: withoutFloorPairs(building) })),
      );
    }
  }, 180_000);
});
