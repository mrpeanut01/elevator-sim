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
      // A leg whose origin and destination sit on different decks cannot be ridden. It used to
      // be non-zero here — 200 distinct legs at this seed — and the reason was the one-floor
      // `G <-> 2` lobby leg: planned on a ground-lobby local, offered to the shuttle because a
      // leg is not bound to a bank, and impossible on a double-deck car because G and 2 are the
      // same stop position.
      //
      // **`vertical-city` now declares an escalator between those two floors, so that leg no
      // longer exists and the guard is no longer reached from shipped data.** Asserted at zero
      // here, and asserted *live* in the suite below against the same building with its
      // `transportModes` stripped — which is exactly the configuration every figure published
      // before that declaration was measured under. A guard with no live case anywhere would be
      // this repository's signature defect; a guard with a live case that is no longer shipped
      // is a fact worth stating in both places.
      expect(
        activity.deckMismatchLegs,
        `${id}: a cross-deck leg was refused, but no shipped route produces one any more`,
      ).toBe(0);
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
      // trip.
      //
      // **This was a flat 5 % on the absolute difference, and § D254 broke it honestly.** The
      // bound was calibrated on 700 vs 701 and 339 vs 338 — near-exact agreement, measured on a
      // `vertical-city` that was barely being served: access zoning was applied to the hall
      // call's *pickup* floor, so the shuttle's landings inside floors 53–75 and 78–100 were
      // refused and its queues never grew. Served properly the lower deck now **fills**, 72 times
      // at this seed, and the projection reads 839 against 794 boarded — 5.67 %.
      //
      // So the bound is re-pointed at the mechanism instead of widened past it, and the result is
      // stricter in the case that matters. Two claims:
      //
      // 1. The projection may never be **short** of the cohort that boarded by more than 5 %. That
      //    is the direction nothing legitimate produces and the one that under-sizes a stop.
      // 2. Any **overshoot** must be accounted for by a deck that filled. `doubleDeckDeckFullRefusals`
      //    counts boarding loops stopped by the per-deck 80 % rule, so it is an upper bound on the
      //    passengers a correct projection could have counted and the loop then declined to take.
      //    With no refusals at all this collapses to `projected <= boarded`, which is tighter than
      //    the 5 % it replaces.
      for (const slot of [0, 1] as const) {
        const projected = activity.doubleDeckBoardingsProjected[slot];
        const boarded = activity.doubleDeckBoardings[slot];
        const where = `${id}: deck ${slot} was sized for ${projected} boarders and took ${boarded}`;
        expect((boarded - projected) / Math.max(1, boarded), `${where} — under-sized`).toBeLessThan(
          0.05,
        );
        expect(
          projected - boarded,
          `${where}, and only ${activity.doubleDeckDeckFullRefusals} boarding loops were stopped by a full deck`,
        ).toBeLessThanOrEqual(activity.doubleDeckDeckFullRefusals);
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

/**
 * The cross-deck refusal, kept live after the escalators removed its only shipped case.
 *
 * `#deckAllows` refuses a leg whose origin and destination sit on different decks of the same
 * rigidly coupled car. On `vertical-city` the only legs that ever reached it were the one-floor
 * `G <-> 2` lobby hops — and the building's declared escalators now carry those, so the shipped
 * configuration reaches the refusal zero times.
 *
 * That is a correct outcome and a dangerous one: the branch would be untested from `data/` and
 * nothing would say so. So it is exercised against `vertical-city` **minus its transport modes**,
 * which is not a fixture invented for the test — it is the building exactly as it was shipped
 * before this change, and the configuration every `vertical-city` figure published before it was
 * measured under.
 */
describe('the cross-deck refusal still refuses, on the configuration that still produces one', () => {
  /** The building as it was before it declared an escalator. */
  function withoutTransportModes(building: ResolvedBuilding): ResolvedBuilding {
    return { ...building, transportModes: [] };
  }

  it('refuses cross-deck legs when the lobby hop is a lift leg again, and none when it is not', async () => {
    const cfg = await load();
    const shipped = cfg.buildingsById.get('vertical-city') as ResolvedBuilding;
    /*
     * **One escalator per two-level lobby**, so this count tracks `servesFloorPairs` rather than
     * a remembered number: the shuttle declares four pairs and each is a lobby with a machine in
     * it. Written as the derived equality rather than as `toBe(4)`, so a fifth pair without a
     * fifth escalator fails here and not somewhere downstream.
     */
    const pairs = shipped.banks.find((bank) => bank.id === 'shuttle')?.servesFloorPairs ?? [];
    expect(shipped.transportModes.map((mode) => [...mode.connects])).toEqual(
      pairs.map((pair) => [...pair]),
    );
    expect(shipped.transportModes.length, 'vertical-city declares no transport mode').toBe(4);

    const run = (building: ResolvedBuilding) =>
      runSimulation({
        building,
        dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
        trafficProfiles: cfg.trafficProfiles,
        elevatorSpecs: cfg.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
      });

    const before = run(withoutTransportModes(shipped));
    const after = run(shipped);

    expect(
      before.stageActivity.deckMismatchLegs,
      'the pre-escalator configuration no longer reaches the cross-deck guard either, so nothing exercises it',
    ).toBeGreaterThan(0);
    expect(after.stageActivity.deckMismatchLegs).toBe(0);
    // The refusal costs nobody a ride: the run still balances on both sides.
    expect(before.conservation.balanced).toBe(true);
    expect(after.conservation.balanced).toBe(true);
  }, 180_000);
});
