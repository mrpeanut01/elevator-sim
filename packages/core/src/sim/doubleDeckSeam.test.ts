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
 * | the pairing **serves both floors of a pair in one stop** | the decks are wired but a stop is still being made once per floor, which is the defect wearing the fix |
 *
 * The third row used to read *"the pairing saves stops on the shuttle"* and was checked as a
 * strict cross-arm inequality at one dispatcher and one seed. It is now a within-arm property plus
 * a pinned three-dispatcher census, because the cross-arm inequality is **measurably not
 * universal** — see the note on that test.
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

  /**
   * **The stop saving, as a census rather than as a single cell — and it is not universal.**
   *
   * This assertion used to be `movesOn(paired) < movesOn(single)` at one dispatcher and one seed,
   * `eta` at 20260726. It passed, 221 against 256. It stopped passing when `vertical-city`
   * declared escalators at its three sky lobbies: the same cell now comes back **245 against 245**,
   * a dead heat.
   *
   * Widening the census is what says whether that is news, and it says the opposite of what a
   * single failing cell suggests: **the strict inequality was never universal.** Measured across
   * the three shipped dispatchers at four seeds, the paired arm made *more* shuttle moves than the
   * single-deck arm in 3 of 12 cells — under `collective`, at 3 of its 4 seeds — **on the
   * pre-escalator configuration too**. The old guard held because of which cell it sampled, which
   * is the fifth false-negative shape in this repository's list: a control that passes for a
   * reason other than the one it names.
   *
   * **Two things confound the cross-arm move count, and both are real.**
   *
   * 1. The arms do not run the same shuttle legs. Stripping `servesFloorPairs` frees the router —
   *    a car boarding at `G` may then alight at `27` directly — so the control's decomposition is
   *    different demand on the shuttle, not the same demand served differently. Measured at this
   *    seed: 1 025 shuttle legs paired against 1 004 single under `eta`.
   * 2. A move is a completed drive between stop *positions*, so it also counts repositioning the
   *    dispatcher chose. `collective` parks and re-parks differently under the two geometries.
   *
   * So the cross-arm counts are **pinned as measured** — in both directions, including the cells
   * where double-deck loses — and the claim the mechanism actually supports is asserted
   * *within* the arm: a paired stop serves two floors in one stop, `doubleDeckPairedStops` counts
   * them, and it is non-zero on the paired arm and exactly zero on the control. That is the
   * property `shaftForBank` implements. The move count is evidence about the *traffic*.
   */
  it('the paired arm serves both floors of a pair in one stop, and the move saving is not universal', async () => {
    const cfg = await load();
    const building = cfg.buildingsById.get(DECK_BUILDING) as ResolvedBuilding;
    const run = (b: ResolvedBuilding, profileId: string): SimulationResult =>
      runSimulation({
        building: b,
        dispatcherProfile: cfg.dispatcherProfilesById.get(profileId)!,
        trafficProfiles: cfg.trafficProfiles,
        elevatorSpecs: cfg.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
      });

    // Completed moves of the shuttle bank. A stop that serves two floors is a stop the car does
    // not have to drive to twice, so this is where a saving would show up in the record.
    const movesOn = (result: SimulationResult, bankId: string): number =>
      (result.record.travelSamples ?? []).filter((sample) =>
        sample.carId.startsWith(`${bankId}-`),
      ).length;

    /**
     * Shuttle moves, `[paired, single]`, measured at {@link SEED} on the shipped configuration.
     *
     * **Re-measured for § D254**, which is the change that let this building be served at all:
     * `vertical-city` declares access zones over floors 53–75 and 78–100, and access zoning was
     * being applied to a hall call's *pickup* floor, so every conventional arm was refusing
     * landings raised inside those zones. All three arms now deliver 1 976 of 1 976 where they
     * previously delivered 1 759–1 855, so the shuttle is carrying more people and driving more
     * moves on both sides of the comparison. The counts below are that run.
     */
    const CENSUS: Readonly<Record<string, readonly [number, number]>> = {
      'nearest-car': [251, 261],
      eta: [273, 296],
      collective: [301, 303],
    };

    let saved = 0;
    for (const [profileId, expected] of Object.entries(CENSUS)) {
      const paired = run(building, profileId);
      const single = run(withoutFloorPairs(building), profileId);
      expect([movesOn(paired, DECK_BANK), movesOn(single, DECK_BANK)], profileId).toEqual(expected);
      if (expected[0] < expected[1]) saved += 1;

      // **The within-arm property, which is the one the geometry is responsible for.** A paired
      // stop is a stop that opened onto both floors of a pair; the control cannot make one at all.
      expect(paired.stageActivity.doubleDeckPairedStops, profileId).toBeGreaterThan(0);
      expect(single.stageActivity.doubleDeckPairedStops, profileId).toBe(0);
    }

    // Pinned rather than asserted as a rule. This said *two* of the three shipped dispatchers save
    // moves and one draws, and added: "if a change makes this three, that is a result and it should
    // be read as one."
    //
    // **A change made it three, and this is that reading.** The draw was `eta` at 245/245, measured
    // on a run in which the shuttle was starved: § D254's pickup-floor access check meant
    // `vertical-city` never delivered more than 1 855 of its 1 976 journeys under any conventional
    // arm, and a bank with too little to do has too little to save. Served properly, `eta` saves 23
    // moves (273 against 296) and every shipped dispatcher is now better off paired than single.
    //
    // It is still pinned rather than promoted to a rule. Three of three is a stronger result than
    // two of three, and it is exactly the kind of result that would be worth nothing if the count
    // were allowed to drift.
    expect(saved).toBe(3);
  }, 300_000);

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
