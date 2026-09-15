/**
 * **What `willis-class-reference` is *for*, proved on the legs rather than asserted** — GitHub issue
 * [#426](https://github.com/mrpeanut01/elevator-sim/issues/426),
 * [`DECISIONS.md` § D598](../../../../DECISIONS.md).
 *
 * `docs/05-roadmap.md`'s standing requirement is the rule: **move the control and require the run to
 * change, compared on the legs.** This tower carries the *other* double-deck arrangement — sixteen
 * double-deckers running as the **local** service, pairing every floor in their zone rather than
 * four transfer levels — and it answers, by a run, the one question `CLAUDE.md` leaves open about
 * § D131's model.
 *
 * | claim | the control this file moves |
 * |---|---|
 * | the decks change the run | delete `servesFloorPairs` and the three car fields, whole-car capacity unchanged |
 * | the escalator exists **because** of the decks | count its hops on both arms |
 * | this tower is **not** in the surviving disclaimer's case | delete one bank's pairs and require `missing-floor-pairs` |
 *
 * **The third row is the one `CLAUDE.md` asks for.** It records double-deck operation as simulated
 * and says *"the disclaimer survives only in the narrower case of a double-deck bank declaring no
 * `servesFloorPairs`, which no shipped building raises."* #426 asks whether this tower raises that
 * case. It does not — and that is asserted in **both** directions, because half the claim is that
 * the case still exists and can still be entered.
 *
 * **What this file does not claim.** Nothing here says double-deck is better, or that the paired-stop
 * model is *right* at 1970s kinematics. It says the decks bind. A claim about whether one stop
 * serving two floors saves what the literature says it saves would need a paired-t interval over
 * 50–200 replications under common random numbers, and it is not made here.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { WARNING_CODES } from '../config/schema.js';
import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';

import { load } from './fixtures.test-helper.js';
import {
  SEEDS,
  authored,
  bankOf,
  legIdentities,
  firstLegs,
  resolveAuthored,
  run,
  transportHops,
} from './referenceTowerSeam.test-helper.js';

const ID = 'willis-class-reference';
/** The two double-deck locals. Both pair every floor in their zone. */
const DECK_BANKS: readonly string[] = Object.freeze(['local-low', 'local-mid']);

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
}, 300_000);

function shipped(): ResolvedBuilding {
  const building = config.buildingsById.get(ID);
  if (building === undefined) throw new Error(`no building "${ID}"`);
  return building;
}

/** The shipped tower with both local banks made single-deck, and nothing else touched. */
function singleDeck(): ResolvedBuilding {
  const document = authored(ID);
  for (const bankId of DECK_BANKS) {
    const bank = bankOf(document, bankId);
    delete bank.servesFloorPairs;
    for (const car of bank.cars) {
      delete car.doubleDeck;
      delete car.deckSeparationM;
      delete car.ratedLoadLbPerDeck;
    }
  }
  return resolveAuthored(config, ID, document);
}

describe('sixteen double-deckers, and they are the locals', () => {
  it('declares them on exactly the two local banks, and loads clean doing it', () => {
    const building = shipped();
    expect(building.warnings.map((warning) => warning.code)).toEqual([]);

    const doubleDeck = building.banks.filter((bank) => bank.cars.some((car) => car.doubleDeck));
    expect(doubleDeck.map((bank) => bank.id)).toEqual([...DECK_BANKS]);
    expect(doubleDeck.reduce((count, bank) => count + bank.cars.length, 0)).toBe(16);
    // And they are the *locals*, which is #426's whole framing: the expresses are single-deck.
    for (const bank of building.banks) {
      if (DECK_BANKS.includes(bank.id)) continue;
      expect(bank.cars.some((car) => car.doubleDeck), `${bank.id} is double-deck too`).toBe(false);
    }
  });

  it('pairs every floor in each zone, at exactly the storey height', () => {
    /*
     * The property that distinguishes a double-deck **local** from `vertical-city`'s shuttle: that
     * one pairs four transfer levels, this one pairs thirty office floors and a lobby. It is also
     * the constraint the section is authored around — `config/parse.ts` refuses a pair whose two
     * floors are not exactly `deckSeparationM` apart, so a double-deck local forces one uniform
     * storey height over its whole zone.
     */
    const building = shipped();
    for (const bankId of DECK_BANKS) {
      const bank = building.banks.find((candidate) => candidate.id === bankId);
      expect(bank?.servesFloorPairs).toHaveLength(16);
      const paired = new Set((bank?.servesFloorPairs ?? []).flatMap((pair) => [pair[0], pair[1]]));
      expect(
        [...(bank?.servesFloors ?? [])].filter((id) => !paired.has(id)),
        `${bankId} serves a floor that is in no pair`,
      ).toEqual([]);
      const separation = bank?.cars[0]?.deckSeparationM;
      for (const pair of bank?.servesFloorPairs ?? []) {
        const lower = building.floorsById.get(pair[0])?.heightM ?? Number.NaN;
        const upper = building.floorsById.get(pair[1])?.heightM ?? Number.NaN;
        expect(Math.abs(upper - lower)).toBeCloseTo(separation as number, 6);
      }
    }
  });
});

describe('the decks change the run, and the escalator is a consequence of them', () => {
  it('moves the legs on every seed, over the same arrivals', () => {
    /*
     * **The claim.** Measured on this tree at `collective`, 1 800 s, over identical journeys: the
     * legs differ on every seed, and so does their count — **6 880 / 6 847 / 6 530** with the decks
     * against **6 764 / 6 757 / 6 446** without.
     *
     * **And the escalator's hop count goes to zero**, which is the finding. A deck-bound leg from
     * the lower lobby reaches lower-deck floors only, so a rider bound for an even floor must board
     * at 2 — and the escalator is how they get there. Take the decks off and a single-deck car at
     * G serves the whole zone, so the mode never shortens a route again. `vertical-city`'s four
     * modes could suggest that; this building measures it.
     *
     * Relations rather than literals, for the reason `CLAUDE.md` § *A published number goes stale
     * the same way* gives.
     */
    for (const seed of SEEDS) {
      const decked = run(config, shipped(), seed);
      const single = run(config, singleDeck(), seed);

      /*
       * **The pairing, first — and here it is a bounded exception rather than an identity, which is
       * itself a measurement.** The arrival process is untouched: the two arms offer the **same
       * number of journeys** and **every journey starts at the same instant**, asserted below with
       * no tolerance at all. What is not identical is 31 of 3 949 destinations, and every one of
       * them is a journey that ends at the **upper lobby level `2`** on the decked arm and at `G`
       * on the single-deck one.
       *
       * That is the decks showing up in the demand rather than a broken pairing:
       * `traffic/generator.ts` rejects a journey with no lift leg, and which journeys those are is
       * decided by the routing, which is what the control changes. The exception is asserted as a
       * **fraction under 2 % whose two destination sets are exactly `{2}` and `{G}`** — measured at
       * **31 of 3 949** on the first seed and under 1.3 % on all three — so a control
       * that started perturbing the demand generally would fail here rather than pass quietly.
       */
      const deckedFirst = firstLegs(decked);
      const singleFirst = firstLegs(single);
      expect(singleFirst.size, `seed ${String(seed)}`).toBe(deckedFirst.size);

      const moved: { readonly from: string; readonly to: string }[] = [];
      for (const [journeyId, offered] of deckedFirst) {
        const other = singleFirst.get(journeyId);
        expect(other, `seed ${String(seed)}: ${journeyId} is not in both arms`).toBeDefined();
        expect(
          other?.startedAt,
          `seed ${String(seed)}: ${journeyId} arrives at a different instant`,
        ).toBe(offered.startedAt);
        if (other?.destination !== offered.destination) {
          moved.push({ from: offered.destination, to: other?.destination as string });
        }
      }
      expect(
        moved.length / deckedFirst.size,
        `seed ${String(seed)}: the control perturbed the demand more than the lobby`,
      ).toBeLessThan(0.02);
      expect(new Set(moved.map((one) => one.from)), `seed ${String(seed)}`).toEqual(new Set(['2']));
      expect(new Set(moved.map((one) => one.to)), `seed ${String(seed)}`).toEqual(new Set(['G']));

      const hops = transportHops(decked);
      expect(hops, `seed ${String(seed)}: nobody rides the lobby escalator`).toBeGreaterThan(300);
      expect(
        transportHops(single),
        `seed ${String(seed)}: the escalator still carries hops without the decks`,
      ).toBe(0);
      expect(
        legIdentities(single),
        `seed ${String(seed)}: taking the decks off changed no leg`,
      ).not.toBe(legIdentities(decked));
    }
  }, 900_000);
});

describe('the disclaimer `CLAUDE.md` names, checked in both directions', () => {
  it('this tower does not raise `missing-floor-pairs`', () => {
    // The half #426 asks for. Both double-deck banks declare their pairs, so the case the
    // disclaimer covers is not entered — and the building loads with no warning at all.
    expect(shipped().warnings.map((warning) => warning.code)).not.toContain(
      WARNING_CODES.missingFloorPairs,
    );
  });

  it('and the case still exists: deleting one bank’s pairs raises it', () => {
    /*
     * The other half, and the reason the first is worth anything. A guard that passed because the
     * warning had been deleted would look exactly like a guard that passed because the building is
     * correct. Here the decks are kept and only the pairing is removed — which is the precise shape
     * the disclaimer is about: cars declared double-deck with no pairing, so each runs as a single
     * deck of the whole-car capacity and every round-trip figure describes different hardware.
     */
    const document = authored(ID);
    delete bankOf(document, 'local-low').servesFloorPairs;
    const unpaired = resolveAuthored(config, ID, document);
    expect(unpaired.warnings.map((warning) => warning.code)).toContain(
      WARNING_CODES.missingFloorPairs,
    );
  });
});
