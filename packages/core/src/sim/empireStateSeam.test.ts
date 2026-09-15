/**
 * **What `empire-state-class-reference` is *for*, proved on the legs rather than asserted** — GitHub
 * issue [#427](https://github.com/mrpeanut01/elevator-sim/issues/427),
 * [`DECISIONS.md` § D596](../../../../DECISIONS.md).
 *
 * `docs/05-roadmap.md`'s standing requirement is the rule: **move the control and require the run to
 * change, compared on the legs.** This tower carries one thing no shipped building carried — a
 * **relay**: a 372 m rise reached by changing lifts twice, with no express anywhere in it. Every
 * other tall building in `data/buildings/` hangs its upper zones off a dedicated shuttle.
 *
 * The control is the one authored fact that makes it a relay rather than a sky-lobby stack: bank H
 * does not serve the ground. Give it a terminal at the street and the tower stops being a relay, and
 * the legs say so before any sentence does.
 *
 * **Compared on the legs and on the leg *count*, which is deliberate.** `directionalSpeedSeam.test.ts`
 * records the opposite case — a speed is not a zone, so it moves the legs and not their number. A
 * relay *is* a zone, so the count is exactly where it shows, and a comparison that looked only at
 * leg identity would have understated it.
 *
 * **What this file does not claim.** Nothing here says one arrangement is better. That would need a
 * paired-t interval over 50–200 replications under common random numbers; every figure quoted below
 * is one seed with its `n` stated.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';

import { load } from './fixtures.test-helper.js';
import {
  SEEDS,
  authored,
  bankOf,
  journeys,
  journeysNeedingLegs,
  legIdentities,
  offeredDemand,
  resolveAuthored,
  run,
} from './referenceTowerSeam.test-helper.js';

const ID = 'empire-state-class-reference';
/** The second relay — 86 to 102, and the bank that does not reach the street. */
const TOP_BANK = 'bank-h';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
}, 300_000);

function shipped(): ResolvedBuilding {
  const building = config.buildingsById.get(ID);
  if (building === undefined) throw new Error(`no building "${ID}"`);
  return building;
}

/** The shipped tower, or the shipped tower with an express from the street to the top zone. */
function withExpressToTheTop(): ResolvedBuilding {
  const document = authored(ID);
  const bank = bankOf(document, TOP_BANK);
  bank.servesFloors = ['G', ...bank.servesFloors];
  return resolveAuthored(config, ID, document);
}

describe('the relay is the building, and it is authored as an absence', () => {
  it('has eight banks, two transfer floors and no bank that spans the street and the top', () => {
    /*
     * Asserted rather than left to the JSON. The property that makes this a *relay* is negative —
     * no bank reaches both the entrance and the top zone — and a negative property is exactly the
     * kind that survives an edit nobody notices.
     */
    const building = shipped();
    expect(building.warnings.map((warning) => warning.code)).toEqual([]);
    expect(building.banks).toHaveLength(8);
    expect(
      building.floors.filter((floor) => floor.isTransferFloor).map((floor) => floor.id).sort(),
    ).toEqual(['80', '86', 'G']);

    const top = building.banks.find((bank) => bank.id === TOP_BANK);
    expect(top?.servesFloors).not.toContain('G');
    // And no *other* bank bridges the gap either, which is the claim "no express" actually makes.
    for (const bank of building.banks) {
      const reachesStreet = bank.servesFloors.includes('G');
      const reachesTop = bank.servesFloors.includes('102');
      expect(reachesStreet && reachesTop, `${bank.id} is an express to the top`).toBe(false);
    }
  });

  it('routes the street to the top observatory in three legs, changing at 80 and at 86', () => {
    // The relay stated as a route rather than as a bank list. Three legs is also the maximum
    // `config/buildingConnectivity.test.ts` allows from an entrance to a populated floor, so this
    // tower sits exactly on that limit — deliberately, because a fourth rung would not load.
    const building = shipped();
    const chain = ['bank-f', 'bank-g', TOP_BANK].map((id) =>
      building.banks.find((bank) => bank.id === id),
    );
    expect(chain[0]?.servesFloors).toContain('G');
    expect(chain[0]?.servesFloors).toContain('80');
    expect(chain[1]?.servesFloors).toContain('80');
    expect(chain[1]?.servesFloors).toContain('86');
    expect(chain[2]?.servesFloors).toContain('86');
    expect(chain[2]?.servesFloors).toContain('102');
  });
});

describe('an express to the top changes the run, on every seed', () => {
  it('takes a leg off the journeys that relay, and empties the three-leg population', () => {
    /*
     * **The claim.** Measured on this tree at `collective`, 1 800 s, over identical journeys: legs a
     * journey fall from **1.2040 / 1.2228 / 1.2214** to **1.1134 / 1.1063 / 1.1172**, and the
     * journeys that need **three** legs fall from **167 / 216 / 182** to **13 / 13 / 8**.
     *
     * Asserted as relations rather than as those literals: a pinned 167 here would be a published
     * number nothing re-derives the day the demand template moves, and what the claim needs is that
     * removing the relay removes the relaying.
     */
    for (const seed of SEEDS) {
      const relay = run(config, shipped(), seed);
      const express = run(config, withExpressToTheTop(), seed);

      // The pairing, first.
      expect(offeredDemand(express), `seed ${String(seed)}`).toBe(offeredDemand(relay));
      expect(journeys(express).size).toBe(journeys(relay).size);

      // Non-vacuity: somebody has to relay, or the control governs nothing.
      const relayed = journeysNeedingLegs(relay, 3);
      expect(relayed, `seed ${String(seed)}: nobody needs three legs`).toBeGreaterThan(50);

      expect(
        journeysNeedingLegs(express, 3),
        `seed ${String(seed)}: the express did not take the third leg off`,
      ).toBeLessThan(relayed / 4);
      expect(
        express.record.passengers.length,
        `seed ${String(seed)}: the express carried the same journeys in as many legs`,
      ).toBeLessThan(relay.record.passengers.length);
      expect(
        legIdentities(express),
        `seed ${String(seed)}: giving bank H a terminal at the street changed no leg`,
      ).not.toBe(legIdentities(relay));
    }
  }, 600_000);
});
