/**
 * **The double-deck honesty guard — now guarding the opposite claim.**
 *
 * Until Phase 6 this file asserted that the runtime did *not* model decks. `doubleDeck`,
 * `deckSeparationM`, `ratedLoadLbPerDeck`, `servesFloorPairs` and the whole `Bank` deck index
 * were parsed, cross-validated with dedicated warning codes, resolved onto `ResolvedCar` and
 * unit-tested — and had **zero runtime consumers**, the eleventh instance of this repository's
 * signature defect. The guard's own docstring set the condition for its retirement:
 *
 * > *"the day a `Car` learns about decks this file fails and has to be revisited rather than
 * > quietly continuing to disclaim a limitation that no longer exists."*
 *
 * That day is this commit, and this is the revision. What is asserted now is the *simulation*,
 * counted rather than read:
 *
 * 1. **The shipped disclaimer is gone**, and gone because it is false — no run of any shipped
 *    building says double-deck operation is not simulated.
 * 2. **The decks fire on the building that declares them**: paired stops, boardings on both
 *    decks, and a per-deck load rule that is exercised rather than merely present.
 * 3. **They fire nowhere else.** Every counter is zero on every building with no double-deck
 *    car, which is the other half of the claim: a mechanism that fires everywhere is a
 *    regression, not a mechanism.
 * 4. **The narrowed disclaimer still works, in both directions.** A double-deck bank that
 *    declares no `servesFloorPairs` has no geometry to simulate, gets a single-deck shaft, and
 *    says so — on the config *and* on the run. No shipped building is in that state.
 */

import { describe, expect, it } from 'vitest';

import { runSimulation } from '../sim/simulation.js';
import { BUILDING_IDS, load } from '../sim/fixtures.test-helper.js';
import type { ResolvedBank, ResolvedBuilding } from './types.js';

import { WARNING_CODES } from './schema.js';

const SEED = 20_260_726;

const declaresDoubleDeck = (building: ResolvedBuilding): boolean =>
  building.banks.some((bank) => bank.cars.some((car) => car.doubleDeck === true));

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

describe('double-deck operation is simulated, and counted on the building that declares it', () => {
  it('raises the retired disclaimer on no shipped building, from loadConfig or from a run', async () => {
    const cfg = await load();
    const declaring = BUILDING_IDS.filter((id) =>
      declaresDoubleDeck(cfg.buildingsById.get(id) as ResolvedBuilding),
    );
    // Non-vacuity. `data/buildings/vertical-city.json` is the one that declares them; a data
    // change that removed it would make every assertion below true of nothing.
    expect(declaring, 'no shipped building declares a double-deck car any more').not.toEqual([]);

    expect(
      cfg.warnings.filter((warning) => warning.code === WARNING_CODES.missingFloorPairs),
      'a shipped bank declares double-deck cars without servesFloorPairs, so its decks are not modelled',
    ).toEqual([]);

    for (const id of BUILDING_IDS) {
      const result = runSimulation({
        building: cfg.buildingsById.get(id) as ResolvedBuilding,
        dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
        trafficProfiles: cfg.trafficProfiles,
        elevatorSpecs: cfg.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
      });
      expect(
        result.warnings.filter((warning) => warning.includes('not simulated')),
        `${id}: a run still disclaims a limitation that no longer exists`,
      ).toEqual([]);
    }
  }, 180_000);

  it('counts paired stops and both decks’ boardings on the building that declares decks, and zero everywhere else', async () => {
    const cfg = await load();
    for (const id of BUILDING_IDS) {
      const building = cfg.buildingsById.get(id) as ResolvedBuilding;
      const result = runSimulation({
        building,
        dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
        trafficProfiles: cfg.trafficProfiles,
        elevatorSpecs: cfg.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
      });
      const activity = result.stageActivity;

      if (!declaresDoubleDeck(building)) {
        // The inert half, and the reason the blast radius is provable rather than asserted:
        // nothing about a single-deck building touches any of this.
        expect(activity.doubleDeckStops, `${id} made a double-deck stop`).toBe(0);
        expect(activity.doubleDeckPairedStops, `${id} made a paired stop`).toBe(0);
        expect(activity.doubleDeckBoardings, `${id} assigned a deck`).toEqual([0, 0]);
        expect(activity.doubleDeckAlightings).toEqual([0, 0]);
        expect(activity.doubleDeckDeckFullRefusals).toBe(0);
        expect(activity.deckMismatchLegs).toBe(0);
        continue;
      }

      // **Measured, not read.** Each of these is a count from a real run of a real shipped
      // building; "it looks wired" is what this repository has shipped ten times.
      expect(activity.doubleDeckStops, `${id}: no double-deck car ever stopped`).toBeGreaterThan(0);
      expect(
        activity.doubleDeckPairedStops,
        `${id}: double-deck cars stopped, but never onto two floors at once — the geometry is not reaching the shaft`,
      ).toBeGreaterThan(0);
      expect(
        activity.doubleDeckBoardings[0],
        `${id}: nobody ever boarded the lower deck`,
      ).toBeGreaterThan(0);
      expect(
        activity.doubleDeckBoardings[1],
        `${id}: nobody ever boarded the upper deck — deck assignment is collapsing to one side`,
      ).toBeGreaterThan(0);
      expect(activity.doubleDeckAlightings[0]).toBeGreaterThan(0);
      expect(activity.doubleDeckAlightings[1]).toBeGreaterThan(0);
      // A leg whose origin and destination sit on different decks cannot be ridden. This was
      // *expected* to be zero — `traffic/route.ts` never routes one onto the shuttle — and is
      // not, because a leg is not bound to a bank and the shuttle is offered the one-floor
      // `G <-> 2` queues the ground-lobby locals serve. Asserted live rather than absent, since
      // a zero here would mean the guard had stopped being consulted.
      expect(
        activity.deckMismatchLegs,
        `${id}: the cross-deck guard is never consulted, so it cannot be protecting anything`,
      ).toBeGreaterThan(0);
      // Per-deck capacity, exercised rather than merely present: each of these is a boarding
      // loop stopped by a *deck* filling while the car body still had room, which is the count
      // of times the per-deck 80 % rule gave a different answer from the whole-car one.
      expect(
        activity.doubleDeckDeckFullRefusals,
        `${id}: no deck ever filled, so the per-deck design load changed no decision here`,
      ).toBeGreaterThan(0);
      // The dwell projection and the boarding loop must agree per deck, for the same reason
      // `lateArrivalHoldsProjected` is compared with `lateArrivalHoldsBoarded`: a stop sized for
      // a cohort it does not take is a stop of the wrong length, and dwell dominates the round
      // trip. They need not be *equal* — the projection is taken when the doors are commanded
      // open and a passenger may reach the landing during the dwell — so this bounds the
      // disagreement rather than forbidding it. Measured at 700 vs 701 and 339 vs 338.
      for (const slot of [0, 1] as const) {
        const projected = activity.doubleDeckBoardingsProjected[slot];
        const boarded = activity.doubleDeckBoardings[slot];
        expect(
          Math.abs(projected - boarded) / Math.max(1, boarded),
          `${id}: deck ${slot} was sized for ${projected} boarders and took ${boarded}`,
        ).toBeLessThan(0.05);
      }
    }
  }, 180_000);
});

describe('a double-deck bank with no declared pairing has no geometry, and says so in both directions', () => {
  it('disclaims on the run, and only for the bank that is missing its pairs', async () => {
    const cfg = await load();
    for (const id of BUILDING_IDS) {
      const building = cfg.buildingsById.get(id) as ResolvedBuilding;
      const stripped = withoutFloorPairs(building);
      const result = runSimulation({
        building: stripped,
        dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
        trafficProfiles: cfg.trafficProfiles,
        elevatorSpecs: cfg.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
      });
      const disclaimed = result.warnings.some((warning) =>
        warning.includes('no servesFloorPairs'),
      );
      expect(
        disclaimed,
        `${id}: run warnings and declared hardware disagree once the pairing is stripped`,
      ).toBe(declaresDoubleDeck(building));
      if (disclaimed) {
        expect(result.warnings.find((warning) => warning.includes('servesFloorPairs'))).toContain(
          id,
        );
        // And the decks really are not modelled, which is what makes the disclaimer true rather
        // than decorative.
        expect(result.stageActivity.doubleDeckPairedStops).toBe(0);
        expect(result.stageActivity.doubleDeckStops).toBe(0);
      }
    }
  }, 180_000);
});
