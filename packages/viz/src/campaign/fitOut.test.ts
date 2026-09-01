/**
 * **Move the control and require the run to change — § D177, compared on the legs.**
 *
 * GitHub issue #181's first clause is that *nothing bought reaches a run*, so the only assertion
 * that closes it is one that runs the simulation twice and requires the passengers to have taken
 * different journeys. Never a window statistic: § D177's own words are that *a mean can be unchanged
 * for a run that is entirely different, and a mean can move because the window moved.* The
 * comparison string is `scope/probes.test-helper.ts`'s `legsOf` — passenger, car, boarding instant,
 * in the recording's own order — and the run is built by `shiftRunConfigOf`, so what is measured is
 * the shipped call path rather than an instrument.
 *
 * ## The cell every § D177 case names
 *
 * `garden-apartments` at **3 600 s**, which is the campaign's own cell rather than a convenient one:
 * `c1` is the only contract `openingCareer` holds, `shift/contracts.ts` declares its
 * `shiftLengthS: 3600`, and `everyday/host.ts#runCampaignDay` writes exactly that length. A tier
 * proved to move the legs somewhere else would be a tier proved somewhere the campaign never runs.
 *
 * ## Three cells are empty at it, and all three are measured rather than fled from
 *
 * `commissioning.test.ts` set the precedent one directory over and `docs/10` § 0's M1 is the reason:
 * a building where nothing you change makes any difference is a real finding about a *building*, and
 * reporting it as a dead control would be the false accusation an instrument like this is most
 * dangerous for. So each empty cell below is asserted **with** a cell where the same tier does move,
 * which is the difference between *the control is fine and the cell is empty* and *the control does
 * nothing*.
 *
 * | tier | at the campaign's cell | measured reason | where it does move |
 * |---|---|---|---|
 * | `cars` L1 | inert | the fitted document really is 10 → 16 persons; two cars over an hour of a residential trickle never fill, so capacity binds on nothing | the same cell at 15 % of population per 5 min |
 * | `cars` L2 | inert | the same sparseness one rung up | `midtown-office` at 1 800 s, as built |
 * | `control` L2 | inert | Level-0 disclosure with two cars: this is `garden-apartments`' own documented collapse of the dispatcher menu, and § D112's finding that a destination which changes no decision is worth nothing | `midtown-office` at 1 800 s — and `control` L3, the Level-1 panel, moves at the campaign's own cell |
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseBuilding, type BuildingConfig } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { RESOURCES, baseState, legsOf } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf, drivingProfileOf, type ViewerState } from '../dev/state.js';
import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';

import { freshTower } from './career.js';
import { SHOP, shopTierAt, type ShopCategoryId } from './economy.js';
import {
  AS_BUILT,
  MIN_DOOR_S,
  fitOutIsAsBuilt,
  fitOutOf,
  fittedArrivalRate,
  fittedBuilding,
  fittedBuildingLoads,
  leversWithKit,
  profileWithKit,
  type CampaignFitOut,
} from './fitOut.js';

/** The campaign's own cell — see the module docstring. */
const CONTRACT_LENGTH_S = 3600;

/** A tower with some categories fitted, and nothing else bought. */
function towerWith(fitted: Partial<Record<ShopCategoryId, number>>): ReturnType<typeof freshTower> {
  return {
    ...freshTower({
      contractId: 'c1',
      buildingId: 'garden-apartments',
      dispatcherId: 'collective',
      rate: 3,
    }),
    fitted,
  };
}

/** The kit one category at one level folds to. */
function kit(category: ShopCategoryId, level: number): CampaignFitOut {
  return fitOutOf(towerWith({ [category]: level }));
}

function stateWith(fit: CampaignFitOut | undefined, over: Partial<ViewerState> = {}): ViewerState {
  return {
    ...baseState(),
    buildingId: 'garden-apartments',
    shiftLengthS: CONTRACT_LENGTH_S,
    campaignFitOut: fit,
    ...over,
  };
}

const legsWith = (fit: CampaignFitOut | undefined, over: Partial<ViewerState> = {}): string =>
  legsOf(stateWith(fit, over));

/** The building a state actually runs, resolved — for the cases that read the document. */
function ranBuilding(fit: CampaignFitOut | undefined, over: Partial<ViewerState> = {}) {
  return shiftRunConfigOf(RESOURCES, stateWith(fit, over)).config.building;
}

const shipped = (id: string) => {
  const entry = RESOURCES.entries.find((candidate) => candidate.config.id === id);
  if (entry === undefined) throw new Error(`${id} is not loaded`);
  return entry.config;
};

/**
 * **Every building `data/buildings/` ships**, read off disk rather than off `RESOURCES`.
 *
 * `probes.test-helper.ts` deliberately loads two — the walk simulates, and § D216 § 5 bounds it —
 * and two is not enough for the cases that ask a question about *the shipped set*. It is the
 * difference between a decisive assertion and a vacuous one: the *never shrinks a car* case below
 * is passed by a broken implementation on both loaded buildings and failed by `crown-hotel`'s 4 000
 * lb service car and `mixed-use-high-rise`'s shuttles, which are the only cars in the repository
 * above the `cars` ladder's own top rung. `commissioning.test.ts` reads the directory for the same
 * reason.
 */
const SHIPPED: readonly BuildingConfig[] = readdirSync(join(DATA_DIR, 'buildings'))
  .filter((name) => name.endsWith('.json'))
  .map((name) =>
    parseBuilding(JSON.parse(readFileSync(join(DATA_DIR, 'buildings', name), 'utf8')) as unknown),
  );

/* -------------------------------------------------------------------------- *
 * The negative control, first — because every case below is measured against it
 * -------------------------------------------------------------------------- */

describe('a tower with nothing bought', () => {
  it('folds to AS_BUILT', () => {
    const fit = fitOutOf(towerWith({}));
    expect(fitOutIsAsBuilt(fit)).toBe(true);
    expect(fit).toEqual(AS_BUILT);
  });

  it('recognises AS_BUILT after a structured clone, not only by object identity', () => {
    // The run is built on a worker, so a fit-out reaches the other side as a fresh object with the
    // same values. A field-by-field comparison is what survives that; `===` on the object does not.
    expect(fitOutIsAsBuilt(structuredClone(AS_BUILT))).toBe(true);
    expect(fitOutIsAsBuilt(structuredClone(kit('doors', 1)))).toBe(false);
  });

  it('leaves the building it runs by object identity, not a copy that happens to be equal', () => {
    // `shift/incidents.ts`'s rule and its reason: a run's building document is digested into a
    // leaderboard board, so a config layer returning a fresh object for a no-op moves every board.
    for (const id of ['garden-apartments', 'midtown-office']) {
      const base = shipped(id);
      expect(fittedBuilding(base, AS_BUILT, RESOURCES.elevatorSpecs), id).toBe(base);
      expect(fittedBuilding(base, undefined, RESOURCES.elevatorSpecs), id).toBe(base);
    }
  });

  it('runs the day it ran before the field existed — no fit-out and AS_BUILT are one run', () => {
    expect(legsWith(AS_BUILT)).toBe(legsWith(undefined));
  });

  it('leaves the driving profile and the levers alone, by object identity', () => {
    const profile = RESOURCES.dispatcherProfiles.profiles[0];
    expect(profile).toBeDefined();
    if (profile === undefined) return;
    expect(profileWithKit(profile, AS_BUILT)).toBe(profile);
    expect(profileWithKit(profile, undefined)).toBe(profile);
    expect(leversWithKit(DEFAULT_LEVERS, AS_BUILT)).toBe(DEFAULT_LEVERS);
    expect(leversWithKit(DEFAULT_LEVERS, undefined)).toBe(DEFAULT_LEVERS);
    expect(fittedArrivalRate(5, AS_BUILT)).toBe(5);
    expect(fittedArrivalRate(5, undefined)).toBe(5);
  });
});

/* -------------------------------------------------------------------------- *
 * The table — every tier buys something, and something the loader takes
 * -------------------------------------------------------------------------- */

const TIERS = SHOP.flatMap((category) =>
  category.tiers.map((tier) => ({
    where: `${category.id} L${String(tier.level)}`,
    categoryId: category.id,
    tier,
  })),
);

describe('§ 8.2’s shop', () => {
  it('was read — sixteen tiers over six categories', () => {
    expect(TIERS.length).toBe(16);
    expect(SHOP.length).toBe(6);
  });

  it('declares a non-empty fit-out on every tier', () => {
    for (const { where, tier } of TIERS) {
      expect(
        Object.keys(tier.fits).length,
        `${where} buys nothing — that is issue #181 arriving one tier at a time`,
      ).toBeGreaterThan(0);
    }
  });

  it('folds every tier into something that is not AS_BUILT', () => {
    for (const { where, categoryId, tier } of TIERS) {
      expect(fitOutIsAsBuilt(kit(categoryId, tier.level)), where).toBe(false);
    }
  });

  it('produces a building the loader takes, for every tier of every shipped building', () => {
    expect(SHIPPED.length, 'data/buildings/ was not read').toBeGreaterThan(5);
    for (const base of SHIPPED) {
      for (const { where, categoryId, tier } of TIERS) {
        const fitted = fittedBuilding(base, kit(categoryId, tier.level), RESOURCES.elevatorSpecs);
        expect(
          () => fittedBuildingLoads(fitted, RESOURCES.elevatorSpecs),
          `${base.id} · ${where}`,
        ).not.toThrow();
      }
    }
  });

  it('produces a building the loader takes with the whole shop fitted at once', () => {
    const everything = fitOutOf(
      towerWith({ doors: 3, control: 3, machines: 3, cars: 2, shafts: 2, tenants: 3 }),
    );
    for (const base of SHIPPED) {
      const fitted = fittedBuilding(base, everything, RESOURCES.elevatorSpecs);
      expect(() => fittedBuildingLoads(fitted, RESOURCES.elevatorSpecs), base.id).not.toThrow();
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The fold
 * -------------------------------------------------------------------------- */

describe('the fold over § 8.2’s fitted levels', () => {
  it('reads the highest live level whole rather than summing the ladder', () => {
    // Every delta is absolute at its level, so level 3 is not level 1 applied three times.
    const l3 = kit('doors', 3);
    const l1 = kit('doors', 1);
    expect(l1.doorSecondsSaved).toBe(1);
    expect(l3.doorSecondsSaved).toBe(3);
    expect(fitOutOf(towerWith({ doors: 3 }))).toEqual(l3);
  });

  it('is not a claim about a level nobody has bought', () => {
    expect(kit('shafts', 1).extraShafts).toBe(1);
    expect(kit('shafts', 2).extraShafts).toBe(2);
    expect(fitOutOf(towerWith({})).extraShafts).toBe(0);
  });

  it('merges categories without one overwriting another', () => {
    const both = fitOutOf(towerWith({ doors: 1, shafts: 1 }));
    expect(both.doorSecondsSaved).toBe(1);
    expect(both.extraShafts).toBe(1);
  });

  it('reads a booking whose nights are behind today and refuses one whose are not', () => {
    /*
     * The nights are the gate, and they are `economy.ts#bookingIsLive`'s rather than this module's
     * — which is the point of the assertion. A tier bought this morning with two nights of works is
     * not in the kit until the day its works are past, so § 8.2's booking rules reach the
     * simulation rather than being read a second time here.
     */
    const booking = {
      categoryId: 'doors' as const,
      level: 1 as const,
      startIdx: 2,
      nights: 2,
      units: 4,
    };
    const beforeWorks = { ...towerWith({}), day: 3, bookings: [booking] };
    const afterWorks = { ...towerWith({}), day: 5, bookings: [booking] };
    expect(fitOutIsAsBuilt(fitOutOf(beforeWorks))).toBe(true);
    expect(fitOutOf(afterWorks).doorSecondsSaved).toBe(1);
  });
});

/* -------------------------------------------------------------------------- *
 * § D177, one tier at a time, at the campaign's own cell
 * -------------------------------------------------------------------------- */

/** The three cells the table in the module docstring names. Everything else must move. */
const EMPTY_AT_THE_CONTRACT_CELL: readonly string[] = ['cars L1', 'cars L2', 'control L2'];

describe('at garden-apartments over 3 600 s, buying a tier changes the legs', () => {
  const asBuilt = legsWith(undefined);

  for (const { where, categoryId, tier } of TIERS) {
    if (EMPTY_AT_THE_CONTRACT_CELL.includes(where)) continue;
    it(`${where} — ${tier.name}`, () => {
      expect(legsWith(kit(categoryId, tier.level))).not.toBe(asBuilt);
    });
  }

  it('is thirteen of the sixteen, and the register of the other three is not stale', () => {
    // Both directions, in `deadCode.test.ts`'s idiom: a cell that has started moving must leave the
    // register, or the register becomes decoration.
    for (const where of EMPTY_AT_THE_CONTRACT_CELL) {
      const entry = TIERS.find((candidate) => candidate.where === where);
      expect(entry, `${where} is registered and is not a tier`).toBeDefined();
      if (entry === undefined) continue;
      expect(legsWith(kit(entry.categoryId, entry.tier.level)), `${where} moves now`).toBe(asBuilt);
    }
    expect(TIERS.length - EMPTY_AT_THE_CONTRACT_CELL.length).toBe(13);
  });
});

/* -------------------------------------------------------------------------- *
 * The three empty cells, each with the cell where the same tier does move
 * -------------------------------------------------------------------------- */

describe('car size is live and the campaign’s building is what is insensitive to it', () => {
  it('really does put 16-person cars in the tower — the document moves', () => {
    const asBuilt = ranBuilding(undefined).banks.flatMap((bank) => bank.cars);
    const bought = ranBuilding(kit('cars', 1)).banks.flatMap((bank) => bank.cars);
    expect(asBuilt.map((car) => car.capacityPersons)).toEqual([10, 10]);
    expect(bought.map((car) => car.capacityPersons)).toEqual([16, 16]);
  });

  it('moves the legs once the cars fill — the same cell at 15 % of population per 5 min', () => {
    /*
     * The building's own `$comment` is the reason and it is quoted rather than paraphrased:
     * *"parking policy dominates here: traffic is sparse enough that idle car position matters more
     * than assignment cleverness"*. Two cars over an hour of a residential trickle are never full,
     * so a bigger car binds on nothing. 15 % is above the residential profile's declared maximum of
     * 7 %, which is exactly why this is a **diagnosis** of an empty cell rather than a cell the
     * campaign runs at.
     */
    const crowded = {
      freePlay: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: 15, seed: '1' },
    } as unknown as Partial<ViewerState>;
    expect(legsWith(kit('cars', 1), crowded)).not.toBe(legsWith(undefined, crowded));
    expect(legsWith(kit('cars', 2), crowded)).not.toBe(legsWith(undefined, crowded));
  });

  it('moves the legs at midtown-office at 1 800 s, one rung up', () => {
    const busy: Partial<ViewerState> = { buildingId: 'midtown-office', shiftLengthS: 1800 };
    expect(legsWith(kit('cars', 2), busy)).not.toBe(legsWith(undefined, busy));
  });

  it('is already fitted at midtown-office at L1, which is why that cell is empty too', () => {
    // 2 500 lb at `geared-traction` is sixteen persons by the specs file's own divisor, so the tier
    // is a rung the building already stands on. The `Math.max` in `carsFitted` is what makes that
    // *unchanged* rather than *shrunk*.
    const busy: Partial<ViewerState> = { buildingId: 'midtown-office', shiftLengthS: 1800 };
    const asBuilt = ranBuilding(undefined, busy).banks.flatMap((bank) => bank.cars);
    const bought = ranBuilding(kit('cars', 1), busy).banks.flatMap((bank) => bank.cars);
    expect(asBuilt.every((car) => car.capacityPersons === 16)).toBe(true);
    expect(bought.map((car) => car.ratedLoadLb)).toEqual(asBuilt.map((car) => car.ratedLoadLb));
  });

  it('never makes a car smaller than it already is, on any tier of any shipped building', () => {
    /*
     * Swept over the **shipped** set rather than the two loaded ones, and that is what makes the
     * case decisive rather than vacuous: without the `Math.max` in `carsFitted` this passes on both
     * of `probes.test-helper.ts`'s buildings — Garden Apartments grows and Midtown is already at the
     * tier — and fails on `crown-hotel`'s 4 000 lb service car, which the clamp alone would take to
     * 2 500. Measured, not argued: those are the only cars in `data/buildings/` above the ladder.
     */
    let compared = 0;
    for (const base of SHIPPED) {
      for (const level of [1, 2]) {
        const before = base.banks.flatMap((bank) => bank.cars);
        const after = fittedBuilding(base, kit('cars', level), RESOURCES.elevatorSpecs).banks.flatMap(
          (bank) => bank.cars,
        );
        after.forEach((car, index) => {
          const was = before[index]?.ratedLoadLb;
          if (was === undefined || car.ratedLoadLb === undefined) return;
          compared += 1;
          expect(car.ratedLoadLb, `${base.id} L${String(level)} car ${car.id}`).toBeGreaterThanOrEqual(was);
        });
      }
    }
    // Non-vacuity: a sweep that compared nothing would agree with any implementation at all.
    expect(compared).toBeGreaterThan(40);
  });
});

describe('the landing panel is live and Level-0 disclosure is what garden-apartments cannot feel', () => {
  it('writes the call type and the ride-time floor onto whichever dispatcher is driving', () => {
    const driving = drivingProfileOf(RESOURCES, stateWith(kit('control', 2)));
    expect(driving.dispatch?.callType).toBe('mobile-credential');
    expect(driving.weights['rideTime']).toBe(0.5);
    // and the standing order still chooses who drives — the base is `collective`, not a substitute
    expect(driving.weights['waitTime']).toBe(
      drivingProfileOf(RESOURCES, stateWith(undefined)).weights['waitTime'],
    );
  });

  it('moves the legs at midtown-office at 1 800 s', () => {
    const busy: Partial<ViewerState> = { buildingId: 'midtown-office', shiftLengthS: 1800 };
    expect(legsWith(kit('control', 2), busy)).not.toBe(legsWith(undefined, busy));
  });

  it('is the Level-1 panel that moves at the campaign’s own cell, which is the ladder’s shape', () => {
    // `docs/09` § 1.1's two levels, arriving as two tiers: disclosure is weak on two cars and
    // assignment is not. § D112 measured the same asymmetry across the whole matrix.
    const driving = drivingProfileOf(RESOURCES, stateWith(kit('control', 3)));
    expect(driving.dispatch?.passengerAssignment).toBe('panel');
    expect(legsWith(kit('control', 3))).not.toBe(legsWith(undefined));
  });

  it('raises a floor rather than overruling a dispatcher that already prices ride time', () => {
    const panel = RESOURCES.dispatcherProfiles.profiles.find(
      (profile) => profile.id === 'destination-panel',
    );
    expect(panel).toBeDefined();
    if (panel === undefined) return;
    // `destination-panel` weights rideTime 1.0; the L2 tier's floor is 0.5 and must not lower it.
    expect(profileWithKit(panel, kit('control', 2)).weights['rideTime']).toBe(1);
  });
});

describe('queue marshalling is a ceiling, so a building already at it is not moved', () => {
  it('moves the legs at the campaign’s own cell', () => {
    expect(legsWith(kit('tenants', 1))).not.toBe(legsWith(undefined));
  });

  it('does nothing at midtown-office, because an office lobby already transfers at 1.2 s', () => {
    // Asserted from `data/elevator-specs.json` rather than from a copy of its numbers, so a change
    // to the shipped table fails this case instead of quietly making the sentence false.
    const office = RESOURCES.elevatorSpecs.timing.passengerTransferS.office;
    expect(kit('tenants', 1).transferCeilingS).toBe(office);
    const busy: Partial<ViewerState> = { buildingId: 'midtown-office', shiftLengthS: 1800 };
    expect(legsWith(kit('tenants', 1), busy)).toBe(legsWith(undefined, busy));
  });
});

/* -------------------------------------------------------------------------- *
 * The numbers are the shipped ones — asserted against `data/`, never against a copy
 * -------------------------------------------------------------------------- */

describe('every figure in the table is the design’s own or the data’s own', () => {
  it('names three machine classes the specs file declares, at speeds inside their bands', () => {
    for (const level of [1, 2, 3]) {
      const fit = kit('machines', level);
      const spec = RESOURCES.elevatorSpecs.classes.find((entry) => entry.id === fit.machineClassId);
      expect(spec, `machines L${String(level)} names an unknown class`).toBeDefined();
      if (spec === undefined || fit.ratedSpeedMps === undefined) continue;
      expect(fit.ratedSpeedMps).toBeGreaterThanOrEqual(spec.ratedSpeedMps.min);
      expect(fit.ratedSpeedMps).toBeLessThanOrEqual(spec.ratedSpeedMps.max);
    }
  });

  it('takes the doors’ second off the hall dwell from the shipped typical-against-minimum step', () => {
    const dwell = RESOURCES.elevatorSpecs.doors.dwellHallCallS;
    expect(kit('doors', 2).hallDwellSecondsSaved).toBe(dwell.typical - dwell.min);
  });

  it('takes both ride-time floors from the two shipped destination profiles', () => {
    const weightOf = (id: string): number | undefined =>
      RESOURCES.dispatcherProfiles.profiles.find((profile) => profile.id === id)?.weights['rideTime'];
    expect(kit('control', 2).rideTimeWeightFloor).toBe(weightOf('destination-eta'));
    expect(kit('control', 3).rideTimeWeightFloor).toBe(weightOf('destination-panel'));
  });

  it('converts persons to a rated load through the specs file’s own divisor', () => {
    // `core`'s `personsAtRatedLoad` is the inverse, so a tier that says sixteen people produces a
    // car the loader reports as sixteen people. That is what makes the tier's name a fact.
    const bought = ranBuilding(kit('cars', 1)).banks.flatMap((bank) => bank.cars);
    expect(bought.every((car) => car.capacityPersons === 16)).toBe(true);
  });

  it('flattens the peak by exactly the third the tier’s own sentence names', () => {
    expect(kit('tenants', 2).arrivalRateFactor).toBeCloseTo(2 / 3, 10);
    expect(fittedArrivalRate(6, kit('tenants', 2))).toBeCloseTo(4, 10);
  });
});

/* -------------------------------------------------------------------------- *
 * The two edits with a rule of their own
 * -------------------------------------------------------------------------- */

describe('the door cycle', () => {
  it('takes the saving off the close first, then the open, and floors both', () => {
    const before = ranBuilding(undefined).banks.flatMap((bank) => bank.cars);
    const after = ranBuilding(kit('doors', 3)).banks.flatMap((bank) => bank.cars);
    const cycle = (cars: typeof before): number[] =>
      cars.map((car) => Math.round((car.doorOpenS + car.doorCloseS) * 100) / 100);
    // garden-apartments ships `sideOpening`: 2.5 s open, 4.0 s close.
    expect(cycle(before)).toEqual([6.5, 6.5]);
    expect(cycle(after)).toEqual([3.5, 3.5]);
    expect(after.every((car) => car.doorCloseS >= MIN_DOOR_S)).toBe(true);
    expect(after.every((car) => car.doorOpenS >= MIN_DOOR_S)).toBe(true);
  });

  it('never takes a half below the floor, however much a tier asks for', () => {
    const greedy: CampaignFitOut = { ...AS_BUILT, doorSecondsSaved: 99 };
    const cars = fittedBuilding(
      shipped('garden-apartments'),
      greedy,
      RESOURCES.elevatorSpecs,
    ).banks.flatMap((bank) => bank.cars);
    for (const car of cars) {
      expect(car.doorOpenS).toBe(MIN_DOOR_S);
      expect(car.doorCloseS).toBe(MIN_DOOR_S);
    }
  });
});

describe('moving a tenant floor', () => {
  it('moves the crowd without changing its size', () => {
    const before = ranBuilding(undefined);
    const after = ranBuilding(kit('tenants', 3));
    const total = (b: typeof before): number =>
      b.floors.reduce((sum, floor) => sum + floor.population, 0);
    expect(total(after)).toBe(total(before));
    expect(after.floors.map((floor) => floor.population)).not.toEqual(
      before.floors.map((floor) => floor.population),
    );
  });

  it('takes the highest of the tied heaviest floors and puts it on the two lowest', () => {
    // Garden Apartments is five floors of 24 above the lobby, so every floor ties. The tie is
    // broken by index — *comes down* is only meaningful from above — which is a total order rather
    // than a draw.
    const after = ranBuilding(kit('tenants', 3));
    const by = new Map(after.floors.map((floor) => [floor.id, floor.population]));
    expect(by.get('6')).toBe(0);
    expect(by.get('2')).toBe(36);
    expect(by.get('3')).toBe(36);
    expect(by.get('4')).toBe(24);
  });
});

describe('zoning the tower', () => {
  it('is written as the express lever, and never switches a pulled one off', () => {
    const pulled = { ...DEFAULT_LEVERS, express: true };
    expect(leversWithKit(pulled, kit('control', 1))).toBe(pulled);
    expect(leversWithKit(DEFAULT_LEVERS, kit('control', 1)).express).toBe(true);
  });

  it('reaches the run through the one expression that owns what the lever means', () => {
    // `profileFromSpec`'s express arm — split demand and zone-centre parking — rather than a second
    // copy of it here. Asserted on the driving profile, which is what the run is built from.
    const driving = drivingProfileOf(RESOURCES, stateWith(kit('control', 1)));
    expect(driving.dispatch?.assignmentMode).toBe('split-demand');
    expect(driving.idle?.parkingStrategy).toBe('zone-center');
  });
});
