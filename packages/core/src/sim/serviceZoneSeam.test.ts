/**
 * **Ashgate's basement restriction binds on real journeys, and the proof is a run rather than a
 * sentence** — GitHub issue **#501**, [`DECISIONS.md` § D573](../../../../DECISIONS.md).
 *
 * ## Why this file exists at all
 *
 * [§ D265](../../../../DECISIONS.md) is the defect this is written against, and it is worth stating
 * in its own words because the shape is easy to re-ship: `accessZones` was *loaded, schema-checked,
 * cross-validated with four dedicated warning codes, indexed correctly by `Bank` and consulted by
 * `Simulation` in three places — and could not change a result*, because every generated rider
 * already carried the credential their own route needed. A restriction no rider ever needs is a
 * dead seam that passes every check this repository runs.
 *
 * `data/buildings/ashgate.json` declares exactly that kind of restriction. Its five cars sit in two
 * banks: four serve `G` and the nineteen floors above, one serves `B2`, `B1` and `G`. Nothing in the
 * schema, the loader, the connectivity model or the round-trip oracle can tell whether that split
 * changes a single journey — each of them is satisfied by a building that merely *validates*. So the
 * claim is made the only way `docs/05-roadmap.md`'s standing requirement admits: **move the control
 * and require the run to change, compared on the legs.**
 *
 * ## The control, and why it is the one the repair would move
 *
 * The counterfactual gives bank `main` the two basement floors as well. That is not an arbitrary
 * perturbation: it is the repair `GAMEPLAY_AND_NAVIGATION.md` § 10.5 case 6 names for *The car park
 * nobody serves* — *extend a second car's service range*. One field moves, in the document the
 * loader reads, and everything else — the floors, the populations, the entrances, the transfer flag,
 * the cars, the profile, the seed and the horizon — is the shipped building's.
 *
 * ## What is compared, and why it is the legs and not a mean
 *
 * The **journeys are identical on both arms** and the **legs are not**. That pairing is the whole
 * argument: a difference in the journey count would mean the two arms were offered different demand
 * and any leg difference would be that instead. What moves is how many rides a journey takes —
 * every car-park journey is two legs as shipped and one with the restriction lifted — which is
 * exactly the quantity a service zone is *for*.
 *
 * A wait or a time-to-destination would have been the wrong instrument twice over: it is a mean, and
 * on this building the two arms move it in **opposite directions** (see the last case). The legs are
 * counts, and they are what `docs/05`'s rule names.
 *
 * ## What this file deliberately does not claim
 *
 * It says nothing about which arrangement is *better*. Two configurations are compared here and
 * neither is called an improvement: that would need a paired-t interval over 50–200 replications
 * under common random numbers (`CLAUDE.md` § Statistical discipline), and *the restriction changes
 * the run* needs none of it. The opposite-direction movement in the last case is reported as an
 * observation on one seed, with its `n`, and is not a finding about dispatch.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { parseBuilding, resolveBuilding } from '../config/parse.js';
import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';
import type { PassengerRecord } from '../metrics/types.js';

import { DATA_DIR, load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationResult } from './types.js';

/** The building under test, and the one bank whose `servesFloors` is the control. */
const BUILDING_ID = 'ashgate';
const RESTRICTED_BANK = 'main';
const CAR_PARK = Object.freeze(['B2', 'B1']);

/**
 * Three seeds, and three rather than one because a single seed cannot tell a binding restriction
 * from a lucky trace. They are not a replication budget — nothing here is a mean — they are the
 * same claim asked three times.
 */
const SEEDS = Object.freeze([20_260_824, 20_268_743, 20_276_662]);

/** The shipped horizon of `rise-and-fall`, stated so the run is reproducible from this file. */
const DURATION_S = 1_800;

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

interface Authored {
  readonly banks: { readonly id: string; servesFloors: string[] }[];
}

/**
 * The shipped building, or the shipped building with `main` extended to the car park.
 *
 * Built by re-reading the authored document and editing one field, so the arms differ in exactly
 * that field and in nothing a helper decided. Everything goes through `parseBuilding` and
 * `resolveBuilding`, so no code path exists here that the shipped loader does not already have.
 */
function ashgate(extendMain: boolean): ResolvedBuilding {
  const file = `${BUILDING_ID}.json`;
  const authored = JSON.parse(readFileSync(join(DATA_DIR, 'buildings', file), 'utf8')) as Authored;
  if (extendMain) {
    const main = authored.banks.find((bank) => bank.id === RESTRICTED_BANK);
    if (main === undefined) throw new Error(`${BUILDING_ID} declares no bank "${RESTRICTED_BANK}"`);
    main.servesFloors = [...CAR_PARK, ...main.servesFloors];
  }
  return resolveBuilding(parseBuilding(authored, file), config.elevatorSpecs, {
    file,
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

function run(building: ResolvedBuilding, seed: number): SimulationResult {
  const profile = config.dispatcherProfilesById.get('collective');
  if (profile === undefined) throw new Error('missing dispatcher fixture "collective"');
  return runSimulation({
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed,
    durationS: DURATION_S,
    onTimeout: 'report',
  });
}

/** Legs grouped by the journey they belong to, ascending by `legIndex`. */
function journeys(result: SimulationResult): Map<string, readonly PassengerRecord[]> {
  const byJourney = new Map<string, PassengerRecord[]>();
  for (const leg of result.record.passengers) {
    const legs = byJourney.get(leg.journeyId) ?? [];
    legs.push(leg);
    byJourney.set(leg.journeyId, legs);
  }
  for (const legs of byJourney.values()) legs.sort((a, b) => a.legIndex - b.legIndex);
  return byJourney;
}

/** The journeys that begin in the car park — the ones the restriction is about. */
function fromCarPark(result: SimulationResult): readonly (readonly PassengerRecord[])[] {
  return [...journeys(result).values()].filter(
    (legs) => legs[0] !== undefined && CAR_PARK.includes(legs[0].originFloorId),
  );
}

/** What a journey is, independent of how many rides it took — the pairing this file rests on. */
function offeredDemand(result: SimulationResult): string {
  return JSON.stringify(
    [...journeys(result).values()]
      .map((legs) => {
        const first = legs[0] as PassengerRecord;
        return [first.journeyId, first.originFloorId, first.finalDestinationFloorId, first.journeyStartedAt];
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

describe('the shipped building declares the restriction the issue specifies', () => {
  it('puts one of five cars on the car park, and the split is the only way to say so', () => {
    // `servesFloors` is declared per **bank**, so *one of five cars reaches B1–B2* is expressible
    // only as a bank of one. Asserted here rather than left to the JSON, because every case below
    // is a claim about this arrangement and would quietly become a claim about a different one.
    const building = ashgate(false);
    const cars = building.banks.map((bank) => ({ id: bank.id, cars: bank.cars.length }));
    expect(cars).toEqual([
      { id: 'main', cars: 4 },
      { id: 'carpark', cars: 1 },
    ]);

    const reaching = building.banks.filter((bank) =>
      CAR_PARK.every((floorId) => bank.servesFloors.includes(floorId)),
    );
    expect(reaching.map((bank) => bank.id)).toEqual(['carpark']);
    expect(reaching[0]?.cars).toHaveLength(1);

    // And the shipped arrangement loads clean, so nothing below is measured on a building the
    // loader is already complaining about.
    expect(building.warnings.map((warning) => warning.code)).toEqual([]);
  });
});

describe('the restriction binds — § D265’s rule, on the legs', () => {
  it('makes every car-park journey two legs, and lifting it makes them one', () => {
    for (const seed of SEEDS) {
      const shipped = run(ashgate(false), seed);
      const lifted = run(ashgate(true), seed);

      // **The pairing.** Same journeys, to the field: same origins, same final destinations, same
      // arrival times. Without this the leg counts below would be comparing two demands.
      expect(offeredDemand(lifted), `seed ${String(seed)}`).toBe(offeredDemand(shipped));

      const shippedCarPark = fromCarPark(shipped);
      const liftedCarPark = fromCarPark(lifted);

      // Non-vacuity, and it is the half § D265 is actually about: a restriction is only a seam if
      // somebody needs it. A run in which nobody starts in the car park would make every assertion
      // below true and mean nothing.
      expect(shippedCarPark.length, `seed ${String(seed)}: nobody arrives in the car park`).toBeGreaterThan(50);
      expect(liftedCarPark.length, `seed ${String(seed)}`).toBe(shippedCarPark.length);

      // The claim. Every car-park journey rides twice as shipped and once with `main` extended.
      expect(
        [...new Set(shippedCarPark.map((legs) => legs.length))],
        `seed ${String(seed)}: as shipped, a car-park journey is two legs`,
      ).toEqual([2]);
      expect(
        [...new Set(liftedCarPark.map((legs) => legs.length))],
        `seed ${String(seed)}: restriction lifted, a car-park journey is one leg`,
      ).toEqual([1]);

      // And the transfer is at `G`, which is why the building flags it `isTransferFloor`.
      for (const legs of shippedCarPark) {
        expect(legs[0]?.destinationFloorId, `seed ${String(seed)}`).toBe('G');
        expect(legs[1]?.originFloorId, `seed ${String(seed)}`).toBe('G');
      }
    }
  }, 300_000);

  it('moves the whole run’s leg count, and moves nothing about the demand', () => {
    /*
     * The same finding one level up, where `docs/05`'s rule is worded: the *run* changes. Measured
     * on this tree, `collective`, 1 800 s — the figures `data/buildings/ashgate.json`'s `$comment`
     * and `docs/04` § 11 publish:
     *
     * | seed | journeys | legs as shipped | legs lifted |
     * |---|---|---|---|
     * | 20 260 824 | 244 | 381 | 244 |
     * | 20 268 743 | 246 | 383 | 246 |
     * | 20 276 662 | 217 | 353 | 217 |
     *
     * They are asserted as a **relation** rather than pinned as three integers, deliberately: the
     * claim is *the restriction binds*, and pinning the absolute counts would make this file fail
     * on a traffic-profile edit that leaves the claim perfectly true. The counts above are in the
     * comment so a reader can check the shape; the assertions are what must hold.
     */
    for (const seed of SEEDS) {
      const shipped = run(ashgate(false), seed);
      const lifted = run(ashgate(true), seed);

      const shippedLegs = shipped.record.passengers.length;
      const liftedLegs = lifted.record.passengers.length;
      const journeyCount = journeys(shipped).size;

      expect(journeys(lifted).size, `seed ${String(seed)}`).toBe(journeyCount);
      // With the restriction lifted nothing transfers, so legs and journeys coincide.
      expect(liftedLegs, `seed ${String(seed)}`).toBe(journeyCount);
      // As shipped they do not, and the difference is exactly the car-park journeys' second ride.
      expect(shippedLegs - liftedLegs, `seed ${String(seed)}`).toBe(
        fromCarPark(shipped).length + [...journeys(shipped).values()].filter(
          (legs) => legs.length > 1 && !CAR_PARK.includes(legs[0]?.originFloorId ?? ''),
        ).length,
      );
      expect(shippedLegs, `seed ${String(seed)}`).toBeGreaterThan(liftedLegs);
    }
  }, 300_000);

  it('costs the counterfactual a loader warning the shipped arrangement does not raise', () => {
    /*
     * **The restriction is physical as well as schematic**, and this is where that is checked
     * rather than asserted in prose. A shaft reaching both `B2` (−7.2 m) and floor 19 (+72.7 m) is
     * a 79.9 m rise, past `geared-traction`'s 76 m `maxRiseM`. So the repair § 10.5 names is not
     * free even in the model: the shipped arrangement loads clean and the extended one does not.
     *
     * That is *why* a car-park lift is a separate, slower machine, and it is the reason the two
     * arms above are a counterfactual rather than a proposal.
     */
    expect(ashgate(false).warnings.map((warning) => warning.code)).toEqual([]);
    expect(ashgate(true).warnings.map((warning) => warning.code)).toContain('rise-exceeds-class');
  });
});

describe('what the comparison is not', () => {
  it('moves the two headline means in opposite directions, which is why the legs are the instrument', () => {
    /*
     * One seed, reported with its `n`, and **no better or worse is claimed** — two configurations
     * are compared here and calling either an improvement would need a paired interval at 50–200
     * replications under common random numbers, which this file does not run and does not need.
     *
     * The observation is the point: lifting the restriction gives every car-park rider one ride
     * instead of two, so time to destination falls — and it also puts the four tower cars on the
     * basements, so the mean wait **rises**. A file that had picked either mean as its instrument
     * would have reported the restriction as helping or as hurting, on a claim that is neither.
     */
    const seed = SEEDS[0] as number;
    const shipped = run(ashgate(false), seed);
    const lifted = run(ashgate(true), seed);

    expect(lifted.summary.timeToDestination.meanS).toBeLessThan(shipped.summary.timeToDestination.meanS);
    expect(lifted.summary.waiting.meanS).toBeGreaterThan(shipped.summary.waiting.meanS);

    // Both arms publish a quotable mean at all, which is what makes the sentence above meaningful
    // rather than a comparison of two refusals.
    expect(shipped.summary.awtIsValid).toBe(true);
    expect(lifted.summary.awtIsValid).toBe(true);
  }, 300_000);
});
