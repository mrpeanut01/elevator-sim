/**
 * **What each of the three reference towers is *for*, proved on the legs rather than asserted** —
 * GitHub issues **#425**, **#424** and **#430**, [`DECISIONS.md` § D577](../../../../DECISIONS.md),
 * [§ D578](../../../../DECISIONS.md) and [§ D579](../../../../DECISIONS.md).
 *
 * ## Why this file exists at all
 *
 * [§ D265](../../../../DECISIONS.md) is the defect it is written against, and `docs/05-roadmap.md`'s
 * standing requirement is the rule: **move the control and require the run to change, compared on
 * the legs.** Each of these three buildings was authored to carry exactly one thing no shipped
 * tower carried, and each of those things is the kind that passes every other check this repository
 * runs while binding nothing — a speed the shaft is too short to spend, a limit the loader would
 * have imposed anyway, a service zone every rider could have done without.
 *
 * | tower | the one thing | the control this file moves |
 * |---|---|---|
 * | `ctf-class-reference` | 20 m/s up and 10 m/s down — the first asymmetric shipped car | delete the shuttle's `descentSpeedMps` |
 * | `shanghai-class-reference` | 20.5 m/s — the top of the speed catalogue, reached by no shipped building before it | rate the shuttle at 10.0 m/s, the fastest any shipped car was |
 * | `merdeka-class-reference` | fifty-six office floors one leg from the street | halve that zone, so its upper half transfers |
 *
 * ## The pairing, and why it is the legs
 *
 * Every arm re-reads the authored document, edits **one field**, and puts it through the shipped
 * `parseBuilding` → `resolveBuilding` path, so no code exists here that the loader does not already
 * have. The **journeys are identical on both arms** — same origins, same final destinations, same
 * arrival times — and that is asserted first on every case, because a difference in the demand would
 * make every leg difference below mean nothing.
 *
 * What is compared is then the legs: their count where the control changes routing, and their
 * identity (which car, boarded when, alighted when) where it changes only timing. A mean wait would
 * have been the wrong instrument for the reason `serviceZoneSeam.test.ts` gives — it is a mean, and
 * *the control changes the run* needs no interval.
 *
 * ## What this file deliberately does not claim
 *
 * Nothing here says one arrangement is **better**. That would need a paired-t interval over 50–200
 * replications under common random numbers (`CLAUDE.md` § Statistical discipline), and every figure
 * quoted in a comment below is one seed with its `n` stated.
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

/**
 * Three seeds, and three rather than one because a single seed cannot tell a binding control from
 * a lucky trace. Not a replication budget — nothing here is a mean — the same claim asked three
 * times. The same three `serviceZoneSeam.test.ts` uses, so the two instruments are comparable.
 */
const SEEDS = Object.freeze([20_260_824, 20_268_743, 20_276_662]);

/** The shipped horizon of `rise-and-fall`, stated so every run below is reproducible from here. */
const DURATION_S = 1_800;

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

interface AuthoredCar {
  readonly id: string;
  descentSpeedMps?: number;
  ratedSpeedMps?: number;
  cabinPressurised?: boolean;
}

interface AuthoredBank {
  readonly id: string;
  servesFloors: string[];
  cars: AuthoredCar[];
}

interface Authored {
  banks: AuthoredBank[];
}

/** The authored document, as JSON, ready to be edited in exactly one place. */
function authored(buildingId: string): Authored {
  return JSON.parse(
    readFileSync(join(DATA_DIR, 'buildings', `${buildingId}.json`), 'utf8'),
  ) as Authored;
}

function resolve(buildingId: string, document: Authored): ResolvedBuilding {
  const file = `${buildingId}.json`;
  return resolveBuilding(parseBuilding(document, file), config.elevatorSpecs, {
    file,
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

function bankOf(document: Authored, bankId: string): AuthoredBank {
  const bank = document.banks.find((candidate) => candidate.id === bankId);
  if (bank === undefined) throw new Error(`no bank "${bankId}" in this document`);
  return bank;
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

/** Legs grouped by journey, ascending by `legIndex`. */
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

/**
 * What a journey *is*, independent of how it was carried — the pairing every case below rests on.
 *
 * Origin, final destination and the instant it was offered. If two arms agree here they were
 * handed the same demand, and any leg difference is the control.
 */
function offeredDemand(result: SimulationResult): string {
  return JSON.stringify(
    [...journeys(result).values()]
      .map((legs) => {
        const first = legs[0] as PassengerRecord;
        return [
          first.journeyId,
          first.originFloorId,
          first.finalDestinationFloorId,
          first.journeyStartedAt,
        ];
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

/** Every leg's identity — which ride, in which car, boarded and alighted when. */
function legIdentities(result: SimulationResult): string {
  return JSON.stringify(
    result.record.passengers
      .map((leg) => [
        leg.journeyId,
        leg.legIndex,
        leg.originFloorId,
        leg.destinationFloorId,
        leg.boardedAt ?? null,
        leg.alightedAt ?? null,
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

/* ========================================================================== *
 * 1. CTF-class — the asymmetry binds, and it binds because the cabin is pressurised
 * ========================================================================== */

describe('CTF-class: 20 m/s up and 10 m/s down, and the pair is what moves the run', () => {
  const ID = 'ctf-class-reference';
  const BANK = 'shuttle';

  /** The shipped tower, or the shipped tower with the shuttle's descent limit deleted. */
  function ctf(symmetric: boolean): ResolvedBuilding {
    const document = authored(ID);
    if (symmetric) {
      for (const car of bankOf(document, BANK).cars) delete car.descentSpeedMps;
    }
    return resolve(ID, document);
  }

  it('declares the asymmetry on exactly one bank, and loads clean doing it', () => {
    // Asserted rather than left to the JSON, because every case below is a claim about this
    // arrangement and would quietly become a claim about a different one.
    const building = ctf(false);
    const asymmetric = building.banks.filter((bank) =>
      bank.cars.some((car) => car.descentSpeedMps !== undefined),
    );
    expect(asymmetric.map((bank) => bank.id)).toEqual([BANK]);
    for (const car of asymmetric[0]?.cars ?? []) {
      expect(car.ratedSpeedMps).toBe(20);
      expect(car.descentSpeedMps).toBe(10);
      // The half a reader will not expect, and the half the building's own `$comment` argues for.
      expect(car.cabinPressurised).toBe(true);
    }
    expect(building.warnings.map((warning) => warning.code)).toEqual([]);
  });

  it('would have been a dead field on an unpressurised cabin, and that is measured', () => {
    /*
     * **The § D265 check, run in the direction that could have gone wrong.** This bank's travel is
     * 385.5 m, above `elevator-specs.json`'s `airPressure.appliesAboveTravelM` of 300, so an
     * unpressurised cabin is capped at `descentCapMps` — **10.0 m/s, which is the same figure
     * Hitachi publishes**. On that arrangement, deleting `descentSpeedMps` changes nothing at all:
     * the shaft re-imposes it. The authored field would be a value with no consequence, which is
     * exactly the defect this repository has shipped eleven times in code and twice in `data/`.
     *
     * So the counterfactual here is the *unpressurised* building, both with and without the
     * authored asymmetry, and the two are required to be **identical** — which is what licenses the
     * pressurisation and makes the next case mean something.
     */
    const unpressurised = (withAsymmetry: boolean): ResolvedBuilding => {
      const document = authored(ID);
      for (const car of bankOf(document, BANK).cars) {
        delete car.cabinPressurised;
        if (!withAsymmetry) delete car.descentSpeedMps;
      }
      return resolve(ID, document);
    };

    const withField = unpressurised(true);
    const without = unpressurised(false);
    for (const building of [withField, without]) {
      for (const car of building.banks.find((bank) => bank.id === BANK)?.cars ?? []) {
        expect(car.descentSpeedMps).toBe(10);
      }
      // And the loader says so out loud on both, which no shipped building makes it say.
      expect(building.warnings.map((warning) => warning.code)).toContain(
        'descent-capped-by-air-pressure',
      );
    }

    const seed = SEEDS[0] as number;
    expect(legIdentities(run(without, seed))).toBe(legIdentities(run(withField, seed)));
  }, 300_000);

  it('moves the legs when the descent limit is lifted, on every seed', () => {
    /*
     * The claim. Measured on this tree at `collective`, 1 800 s, seed 20 260 824: the two arms are
     * handed **1 583 identical journeys** and carry them in **2 589** legs either way — the routing
     * does not change, because the asymmetry is a speed and not a zone — and the legs themselves
     * are **not the same legs**: different cars, different boarding instants. That is the quantity
     * a rated speed is *for*, and it is what a leg-count comparison would have missed entirely.
     */
    for (const seed of SEEDS) {
      const shipped = run(ctf(false), seed);
      const symmetric = run(ctf(true), seed);

      // The pairing, first.
      expect(offeredDemand(symmetric), `seed ${String(seed)}`).toBe(offeredDemand(shipped));

      // Non-vacuity: somebody has to use the shuttle, or the control governs nothing.
      const rode = [...journeys(shipped).values()].filter((legs) => legs.length > 1);
      expect(rode.length, `seed ${String(seed)}: nobody transfers`).toBeGreaterThan(100);

      expect(
        legIdentities(symmetric),
        `seed ${String(seed)}: lifting the descent limit changed no leg`,
      ).not.toBe(legIdentities(shipped));
    }
  }, 300_000);
});

/* ========================================================================== *
 * 2. Shanghai-class — the top of the catalogue is spent rather than merely declared
 * ========================================================================== */

describe('Shanghai-class: 20.5 m/s is reached on one hop and spent on all of them', () => {
  const ID = 'shanghai-class-reference';
  const BANK = 'shuttle';
  /** The fastest car any shipped building had before this one — `burj-class-reference`'s shuttle. */
  const PREVIOUS_CEILING_MPS = 10.0;

  function shanghai(ratedSpeedMps: number): ResolvedBuilding {
    const document = authored(ID);
    for (const car of bankOf(document, BANK).cars) car.ratedSpeedMps = ratedSpeedMps;
    return resolve(ID, document);
  }

  it('is the first shipped building to reach the class maximum, and nothing else does', () => {
    const fastest = (building: ResolvedBuilding): number =>
      Math.max(...building.banks.flatMap((bank) => bank.cars.map((car) => car.ratedSpeedMps)));
    const here = config.buildingsById.get(ID);
    expect(here).toBeDefined();
    expect(fastest(here as ResolvedBuilding)).toBe(20.5);
    // `ultra-high-speed`'s own maximum, and the anchor `elevator-specs.json` takes from this
    // machine. Asserted against the spec rather than typed twice.
    const spec = config.elevatorSpecs.classes.find(
      (entry) => entry.id === 'ultra-high-speed',
    );
    expect(spec?.ratedSpeedMps.max).toBe(20.5);
    // And the claim that no *other* shipped building reaches it, which is what makes this building
    // the catalogue's only content caller.
    for (const [id, building] of config.buildingsById) {
      if (id === ID) continue;
      expect(fastest(building), `${id} is now at or above the class maximum too`).toBeLessThan(20.5);
    }
  });

  it('moves the legs against the old ceiling, on every seed', () => {
    /*
     * **The risk this case exists for is CLAUDE.md's own rule**: *short hops never reach rated
     * speed*. At `ultra-high-speed`'s 1.2 m/s² and 1.2 m/s³ an s-curve needs about 185.4 m to reach
     * 20.5 m/s and the same again to stop, so a leg shorter than ~370.7 m is acceleration-limited
     * and the plate figure buys nothing on it. This shuttle makes exactly one hop that is long
     * enough — G to sky lobby 4, 418.5 m — and three that are not (94.5 m, 202.5 m, 310.5 m).
     *
     * So *the rating changes the run* is a live question rather than a formality, and the answer is
     * a run: re-rated at 10.0 m/s, the fastest any shipped car was before this file, the same
     * journeys are carried by different legs.
     */
    for (const seed of SEEDS) {
      const shipped = run(shanghai(20.5), seed);
      const slower = run(shanghai(PREVIOUS_CEILING_MPS), seed);

      expect(offeredDemand(slower), `seed ${String(seed)}`).toBe(offeredDemand(shipped));

      const rode = [...journeys(shipped).values()].filter((legs) => legs.length > 1);
      expect(rode.length, `seed ${String(seed)}: nobody uses the shuttle`).toBeGreaterThan(100);

      expect(
        legIdentities(slower),
        `seed ${String(seed)}: halving the shuttle's rated speed changed no leg`,
      ).not.toBe(legIdentities(shipped));
    }
  }, 300_000);
});

/* ========================================================================== *
 * 3. Merdeka-class — fifty-six floors one leg from the street
 * ========================================================================== */

describe('Merdeka-class: the one-leg low rise is a routing decision and it binds', () => {
  const ID = 'merdeka-class-reference';
  /** The upper half of the direct zone, the floors the counterfactual makes transfer. */
  const MOVED = Object.freeze(Array.from({ length: 28 }, (_, index) => String(index + 29)));

  /** The shipped tower, or the shipped tower with floors 29–56 handed to the high locals. */
  function merdeka(halved: boolean): ResolvedBuilding {
    const document = authored(ID);
    if (halved) {
      const low = bankOf(document, 'local-low');
      const high = bankOf(document, 'local-high');
      low.servesFloors = low.servesFloors.filter((floorId) => !MOVED.includes(floorId));
      high.servesFloors = [...MOVED, ...high.servesFloors];
    }
    return resolve(ID, document);
  }

  it('reaches fifty-six populated office floors from the entrance, in one bank', () => {
    const building = merdeka(false);
    const low = building.banks.find((bank) => bank.id === 'local-low');
    expect(low?.servesFloors).toContain('G');
    for (const floorId of MOVED) expect(low?.servesFloors).toContain(floorId);
    expect(building.warnings.map((warning) => warning.code)).toEqual([]);
  });

  it('makes the halved arm carry the same journeys in more legs, on every seed', () => {
    /*
     * The claim, and the quantity GitHub issue #430 asks about — *fewer transfers over a similar
     * rise*. Measured on this tree at `collective`, 1 800 s, seed 20 260 824: **2 243 journeys,
     * 3 225 legs as shipped (1.438 legs a journey)**, against `burj-class-reference`'s 1.94 on the
     * same seed and horizon. Halve the direct zone and the same journeys need strictly more legs.
     *
     * Asserted as a **relation** rather than pinned as integers, deliberately: the claim is *the
     * one-leg zone binds*, and pinning the counts would fail this file on a traffic-profile edit
     * that leaves the claim perfectly true.
     */
    for (const seed of SEEDS) {
      const shipped = run(merdeka(false), seed);
      const halved = run(merdeka(true), seed);

      expect(offeredDemand(halved), `seed ${String(seed)}`).toBe(offeredDemand(shipped));

      const endsInMoved = (result: SimulationResult): readonly (readonly PassengerRecord[])[] =>
        [...journeys(result).values()].filter((legs) =>
          MOVED.includes((legs[0] as PassengerRecord).finalDestinationFloorId),
        );

      // Non-vacuity: somebody has to be going to the floors the control moves.
      expect(
        endsInMoved(shipped).length,
        `seed ${String(seed)}: nobody travels to floors 29–56`,
      ).toBeGreaterThan(50);

      expect(
        halved.record.passengers.length,
        `seed ${String(seed)}: halving the one-leg zone added no leg`,
      ).toBeGreaterThan(shipped.record.passengers.length);

      const legsPer = (result: SimulationResult): number =>
        result.record.passengers.length / journeys(result).size;
      expect(legsPer(halved), `seed ${String(seed)}`).toBeGreaterThan(legsPer(shipped));
    }
  }, 300_000);
});
