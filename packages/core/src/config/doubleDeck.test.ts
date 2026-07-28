/**
 * **The double-deck honesty guard.**
 *
 * `doubleDeck`, `deckSeparationM`, `ratedLoadLbPerDeck`, `servesFloorPairs` and the whole `Bank`
 * deck index are parsed, cross-validated with two dedicated warning codes, resolved onto
 * `ResolvedCar` and unit-tested — and had **zero runtime consumers**. `Car` has no deck concept,
 * so `data/buildings/vertical-city.json`'s eight declared shuttles ran as eight single-deck cars
 * of the same whole-car capacity, making up to twice the stops the declared hardware would; every
 * round-trip time, interval and handling-capacity number reported for that bank described
 * hardware nobody configured, and nothing anywhere said so.
 *
 * Double-deck *dispatch* is legitimately Phase 6 (`docs/07-handoff.md`). The defect is not that
 * it is unimplemented — it is that the config layer validated the deck pairing carefully enough
 * to look wired and then went silent, and silence reads as "modelled".
 *
 * So the guard is the second of the two remedies finding #11 offers: **the run says so**. It walks
 * `data/buildings/` for any car declaring `doubleDeck`, and requires that both `loadConfig` and
 * `runSimulation` name the building and state that double-deck operation is not simulated. It is
 * asserted in both directions — a building with no double-deck car must raise neither warning —
 * so the day a `Car` learns about decks this file fails and has to be revisited rather than
 * quietly continuing to disclaim a limitation that no longer exists.
 */

import { describe, expect, it } from 'vitest';

import { runSimulation } from '../sim/simulation.js';
import { BUILDING_IDS, load } from '../sim/fixtures.test-helper.js';
import type { ResolvedBuilding } from './types.js';

import { WARNING_CODES } from './schema.js';

const SEED = 20_260_726;

const declaresDoubleDeck = (building: ResolvedBuilding): boolean =>
  building.banks.some((bank) => bank.cars.some((car) => car.doubleDeck === true));

describe('a building whose cars the runtime cannot model says so, on the config and on every run', () => {
  it('warns from loadConfig for exactly the buildings that declare a double-deck car', async () => {
    const cfg = await load();
    const declaring = BUILDING_IDS.filter((id) =>
      declaresDoubleDeck(cfg.buildingsById.get(id) as ResolvedBuilding),
    );
    // Non-vacuity. `data/buildings/vertical-city.json` is the one that declares them; a data
    // change that removed it would make every assertion below true of nothing.
    expect(declaring, 'no shipped building declares a double-deck car any more').not.toEqual([]);

    const warnedFiles = new Set(
      cfg.warnings
        .filter((warning) => warning.code === WARNING_CODES.doubleDeckNotSimulated)
        .map((warning) => warning.file),
    );
    for (const id of BUILDING_IDS) {
      const wanted = declaring.includes(id);
      const warned = [...warnedFiles].some((file) => file.includes(id));
      expect(
        warned,
        wanted
          ? `${id} declares double-deck cars and loadConfig said nothing about it`
          : `${id} declares no double-deck car, yet loadConfig disclaimed one`,
      ).toBe(wanted);
    }
  });

  it('carries the same statement into the run, where a stored record can see it', async () => {
    // A config warning is read once by whoever loaded the directory. `result.warnings` is what
    // a report and a serialized record have in front of them, and it is where a reader of a
    // Vertical City round-trip time needs the caveat to be.
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
      const stated = result.warnings.some((warning) =>
        warning.includes('double-deck operation is not simulated'),
      );
      expect(stated, `${id}: run warnings and declared hardware disagree`).toBe(
        declaresDoubleDeck(building),
      );
      if (stated) {
        expect(result.warnings.find((warning) => warning.includes('double-deck'))).toContain(id);
      }
    }
  }, 120_000);
});
