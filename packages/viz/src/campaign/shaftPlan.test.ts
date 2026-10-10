/**
 * **One price per act: a Career shaft costs what a fix-it case charges for it** — GitHub issue
 * #429's Career half, [§ D1312](../../../../DECISIONS.md).
 *
 * `docs/38` § 2.2: *"the shop prices its works from the same schedule Scenario uses, with nights on
 * top, so a fourth car costs the same units in both modes."* Since § D631 a fix-it case prices one
 * new shaft as `new-car` plus the `shaft-area` row at its bank's plan-area band. Before this lane the
 * Career shop quoted the bare row on every tower, which put the two modes at different prices on 59
 * of the 62 shipped banks, and charged one row for the shaft its `extraShafts` added to **every**
 * bank: seven shafts for 34 u on Willis.
 *
 * Four claims, each measured through the shipped path rather than restated:
 *
 * 1. For every shipped bank the Career shop sinks a shaft in, that shaft costs the units a fix-it
 *    case charges for one new shaft in the same bank, read through the same band reader.
 * 2. A shaft tier on a multi-bank tower charges for each shaft it adds, and the shafts it charges
 *    for are the cars `campaign/fitOut.ts#fittedBuilding` adds to the run's tower.
 * 3. A change to the band figures moves both modes' prices together, so an owner ruling on #429's
 *    bands needs no second change.
 * 4. A shaft tier that would sink no shaft is refused, by the shop, the reducer and the host alike,
 *    and the copy around the shop stays true on every tower.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  loadConfig,
  parseBuilding,
  type BuildingConfig,
  type LoadedConfig,
} from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { mixedFleetBanks } from '../commissioning/choices.js';
import { campaignInputOf } from '../everyday/campaignScreens.js';
import {
  CONTRACT_COPY,
  SHOP_NO_SHAFT,
  SHOP_NO_SHAFT_COST,
  contractView,
  shaftDecisionOf,
  type BuildingFacts,
  type CampaignInput,
} from '../everyday/campaignModel.js';
import { createEverydayHost, type EverydayHost, type EverydayHostBindings } from '../everyday/host.js';
import type { CareerStore } from '../everyday/careerStore.js';
import { DATA_DIR, BUILDING_IDS } from '../fixtures.test-helper.js';
import { fixitContextOf } from '../fixit/parse.js';
import { parsePriceSchedule } from '../pricing/parse.js';
import { repairPriceUnits } from '../pricing/repairPrice.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PriceSchedule } from '../pricing/types.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { CONTRACTS, contractForBuilding } from '../shift/contracts.js';
import { ladderTowerConfig } from '../shift/ladder.js';
import type { ViewerState } from '../dev/state.js';

import {
  applyCampaignAction,
  freshTower,
  towerById,
  type CampaignCareer,
  type CampaignTower,
} from './career.js';
import {
  AREA_BANDED_SHAFT_PRICE_IDS,
  DIFFICULTIES,
  DIFFICULTY_IDS,
  SHOP,
  perfectMonthUnits,
  purseOf,
  shopTierAt,
  shopTierPrice,
  shopTierState,
  shopTotalUnits,
  type AddedShaft,
  type TowerShafts,
} from './economy.js';
import { AS_BUILT, fittedBuilding } from './fitOut.js';
import { careerTowerShaftsOf, towerShaftsOf, type CareerShaftResources } from './shaftPlan.js';

const SCHEDULE_PATH = join(DATA_DIR, 'price-schedule.json');

let config: LoadedConfig;
let authored: ReadonlyMap<string, BuildingConfig>;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  authored = new Map(
    BUILDING_IDS.map((id) => [
      id,
      parseBuilding(JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8'))),
    ]),
  );
});

/** The structural resources the Career reads, on a schedule a case may have moved. */
function careerResources(schedule: PriceSchedule): CareerShaftResources {
  return {
    entries: [...authored.values()].map((building) => ({ config: building })),
    elevatorSpecs: config.elevatorSpecs,
    priceSchedule: schedule,
  };
}

/**
 * The shafts the Career shop sinks on a shipped building: the career tower for a building a contract
 * runs, and the tower as authored for the one no contract runs (`burj-class-reference`), so the
 * claim is taken over **every** shipped bank and not only over those a career can reach today.
 */
function shaftsFor(schedule: PriceSchedule, buildingId: string): TowerShafts {
  const shafts =
    contractForBuilding(buildingId) === undefined
      ? towerShaftsOf(authored.get(buildingId)!, config.elevatorSpecs, schedule)
      : careerTowerShaftsOf(careerResources(schedule), buildingId);
  if (shafts === undefined) throw new Error(`${buildingId} resolves no shafts`);
  return shafts;
}

/** What a fix-it case charges for one new shaft in a bank — `fixit/parse.ts`'s own path. */
function fixitShaftUnits(schedule: PriceSchedule, buildingId: string, bankId: string): number {
  const context = fixitContextOf({
    schedule,
    buildings: config.buildings,
    elevatorSpecs: config.elevatorSpecs,
    trafficProfiles: config.trafficProfiles,
    dispatcherProfiles: config.dispatcherProfiles,
  });
  return repairPriceUnits(
    schedule,
    { building: { addCars: [{ bankId }] } },
    context.shaftAreaBandByBank.get(`${buildingId}/${bankId}`),
  );
}

/** The first shaft tier: `new-car`, *A fourth car*. */
function fourthCar() {
  const tier = shopTierAt('shafts', 1);
  if (tier === undefined) throw new Error('the shop sells no first shaft tier');
  return tier;
}

/** One shaft, priced by the Career shop on its own. */
function careerShaftUnits(schedule: PriceSchedule, shaft: AddedShaft): number {
  return shopTierPrice(schedule, fourthCar(), new Map([['new-car', [shaft]]])).units;
}

describe('a Career shaft costs what a fix-it case charges for it — docs/38 § 2.2', () => {
  it('prices every shipped bank the shop sinks a shaft in at the fix-it price, and excepts only the mixed fleets', () => {
    const schedule = shippedPriceSchedule();
    const priced: string[] = [];
    const excepted: string[] = [];
    const mismatched: string[] = [];
    for (const building of config.buildings) {
      const shafts = shaftsFor(schedule, building.id).get('new-car') ?? [];
      const sunk = new Set(shafts.map((shaft) => shaft.bankId));
      for (const bank of building.banks) {
        const key = `${building.id}/${bank.id}`;
        if (!sunk.has(bank.id)) {
          excepted.push(key);
          continue;
        }
        priced.push(key);
        const shaft = shafts.find((entry) => entry.bankId === bank.id)!;
        const career = careerShaftUnits(schedule, shaft);
        const fixit = fixitShaftUnits(schedule, building.id, bank.id);
        if (career !== fixit) mismatched.push(`${key}: Career ${String(career)} u, fix-it ${String(fixit)} u`);
      }
    }
    expect(mismatched).toEqual([]);
    /* 62 shipped banks: every one priced but the two the applier will not grow. */
    expect(priced.length + excepted.length).toBe(62);
    expect(excepted.sort()).toEqual(['crown-hotel/main', 'st-jude-hospital/main']);
    for (const key of excepted) {
      const [buildingId, bankId] = key.split('/');
      expect(mixedFleetBanks(authored.get(buildingId!)!), key).toContain(bankId);
    }
  });

  it('reads the band through the same reader a fix-it case does, on every bank of every contract tower', () => {
    const schedule = shippedPriceSchedule();
    const context = fixitContextOf({
      schedule,
      buildings: config.buildings,
      elevatorSpecs: config.elevatorSpecs,
      trafficProfiles: config.trafficProfiles,
      dispatcherProfiles: config.dispatcherProfiles,
    });
    for (const contract of CONTRACTS) {
      for (const shaft of shaftsFor(schedule, contract.buildingId).get('new-car') ?? []) {
        expect(shaft.band, `${contract.buildingId}/${shaft.bankId}`).toBe(
          context.shaftAreaBandByBank.get(`${contract.buildingId}/${shaft.bankId}`),
        );
      }
    }
  });

  it('quotes Midtown Office’s fourth car at 42 u in both modes, where the shop used to say 34', () => {
    const schedule = shippedPriceSchedule();
    const priced = shopTierPrice(schedule, fourthCar(), shaftsFor(schedule, 'midtown-office'));
    expect(priced).toEqual({ units: 42, nights: 8, shafts: 1 });
    expect(priced.units).toBe(fixitShaftUnits(schedule, 'midtown-office', 'main'));
    /* With no tower known the row alone is charged, as before — the contract's own 34. */
    expect(shopTierPrice(schedule, fourthCar())).toEqual({ units: 34, nights: 8 });
  });

  it('bands the fifth car the same way, and that is the one constant an owner ruling would move', () => {
    const schedule = shippedPriceSchedule();
    expect([...AREA_BANDED_SHAFT_PRICE_IDS].sort()).toEqual(['fifth-car', 'new-car']);
    const fifth = shopTierAt('shafts', 2)!;
    expect(shopTierPrice(schedule, fifth, shaftsFor(schedule, 'midtown-office')).units).toBe(54 + 8);
    expect(shopTierPrice(schedule, fifth, shaftsFor(schedule, 'garden-apartments')).units).toBe(54);
  });
});

describe('a shaft tier on a multi-bank tower charges for each shaft it adds', () => {
  it('charges Willis for the seven shafts the run gets, where one row used to buy all seven', () => {
    const schedule = shippedPriceSchedule();
    const shafts = shaftsFor(schedule, 'willis-class-reference');
    const priced = shopTierPrice(schedule, fourthCar(), shafts);
    /* The cars the applier adds to the tower the career day runs, compared on the building. */
    const handed = ladderTowerConfig(
      authored.get('willis-class-reference')!,
      contractForBuilding('willis-class-reference')?.id,
      config.elevatorSpecs,
    );
    const carsIn = (building: BuildingConfig): number =>
      building.banks.reduce((total, bank) => total + bank.cars.length, 0);
    const grown = fittedBuilding(handed, { ...AS_BUILT, extraShafts: 1 }, config.elevatorSpecs);
    expect(carsIn(grown) - carsIn(handed)).toBe(7);
    expect(priced.shafts).toBe(7);
    /* Each shaft at its own bank's band: five band 1, one band 2, one band 3. */
    expect(priced.units).toBe(7 * 34 + 8 * (1 + 1 + 1 + 2 + 1 + 1 + 3));
    expect(priced.units).toBe(318);
    expect(priced.nights).toBe(8);
  });

  it('charges every contract tower the sum of its shafts’ fix-it prices, tier by tier', () => {
    const schedule = shippedPriceSchedule();
    for (const contract of CONTRACTS) {
      const shafts = shaftsFor(schedule, contract.buildingId);
      const added = shafts.get('new-car') ?? [];
      const expected = added.reduce(
        (total, shaft) => total + fixitShaftUnits(schedule, contract.buildingId, shaft.bankId),
        0,
      );
      expect(shopTierPrice(schedule, fourthCar(), shafts).units, contract.id).toBe(expected);
      /* One shaft a bank a level, on every bank the applier grows. */
      const handed = ladderTowerConfig(
        authored.get(contract.buildingId)!,
        contract.id,
        config.elevatorSpecs,
      );
      const growable = handed.banks.filter((bank) => !mixedFleetBanks(handed).includes(bank.id));
      expect(added.map((shaft) => shaft.bankId), contract.id).toEqual(growable.map((bank) => bank.id));
      expect((shafts.get('fifth-car') ?? []).map((shaft) => shaft.bankId), contract.id).toEqual(
        growable.map((bank) => bank.id),
      );
    }
  });

  it('books what the row showed, through the reducer the host drives', () => {
    const schedule = shippedPriceSchedule();
    const resources = careerResources(schedule);
    const shaftsOf = (id: string) => careerTowerShaftsOf(resources, id);
    const career: CampaignCareer = {
      carry: 0,
      today: 1,
      monthsWorked: 0,
      lost: 0,
      towers: [
        {
          ...freshTower({ contractId: 'c16', buildingId: 'willis-class-reference', dispatcherId: 'eta', rate: 7 }),
          carry: 400,
        },
      ],
      openTowerId: 'c16',
      pendingBooking: undefined,
    };
    const pressed = applyCampaignAction(
      career,
      { kind: 'press-tier', towerId: 'c16', categoryId: 'shafts', level: 1 },
      schedule,
      shaftsOf,
    );
    const booked = applyCampaignAction(pressed, { kind: 'pick-start', startIdx: 0 }, schedule, shaftsOf);
    const tower = towerById(booked, 'c16')!;
    expect(tower.bookings).toHaveLength(1);
    expect(tower.bookings[0]?.units).toBe(318);
    expect(purseOf(tower)).toBe(400 - 318);
  });
});

describe('the band figures move both modes together, because they share one reader', () => {
  /**
   * A moved fixture, parsed through the shipped validator: the second boundary pulled from 400 m²
   * down to 140 m², and the band step raised from 8 u to 10 u. Every bank between 140 and 400 m²
   * changes band and every banded shaft changes price, so the comparison is over prices that moved.
   */
  function movedSchedule(): PriceSchedule {
    const raw = JSON.parse(readFileSync(SCHEDULE_PATH, 'utf8')) as {
      changes: { id: string; rate?: { unitsPer: number }; schema: { default: number } }[];
      areaBands: { bands: { areaM2Range: [number, number | null] }[] };
    };
    const area = raw.changes.find((change) => change.id === 'shaft-area');
    if (area?.rate === undefined) throw new Error('shaft-area lost its rate');
    /* The validator holds the shipped price to the schema's default, so both move together. */
    area.rate.unitsPer = 10;
    area.schema.default = 10;
    const [, second, third] = raw.areaBands.bands;
    if (second === undefined || third === undefined) throw new Error('fewer than three area bands');
    second.areaM2Range = [80, 140];
    third.areaM2Range = [140, 800];
    return parsePriceSchedule(raw);
  }

  it('prices every bank the same in both modes on the moved fixture, and the prices did move', () => {
    const shipped = shippedPriceSchedule();
    const moved = movedSchedule();
    let changed = 0;
    for (const building of config.buildings) {
      const before = shaftsFor(shipped, building.id).get('new-car') ?? [];
      for (const shaft of shaftsFor(moved, building.id).get('new-car') ?? []) {
        const key = `${building.id}/${shaft.bankId}`;
        const career = careerShaftUnits(moved, shaft);
        expect(career, key).toBe(fixitShaftUnits(moved, building.id, shaft.bankId));
        const was = before.find((entry) => entry.bankId === shaft.bankId)!;
        if (career !== careerShaftUnits(shipped, was)) changed += 1;
      }
    }
    /* Every banked shaft moves on the step; the 3 band-0 banks are the only ones that cannot. */
    expect(changed).toBe(60 - 3);
    /* Midtown's 142.8 m² crosses the moved boundary into band 2 in both modes alike. */
    expect(careerShaftUnits(moved, { bankId: 'main', band: 2 })).toBe(34 + 20);
    expect(fixitShaftUnits(moved, 'midtown-office', 'main')).toBe(54);
  });
});

describe('a shaft tier that sinks no shaft is refused, and the copy around the shop stays true', () => {
  const rich = (buildingId: string, contractId: string): CampaignTower => ({
    ...freshTower({ contractId, buildingId, dispatcherId: 'eta', rate: 3 }),
    carry: 400,
  });

  it('refuses both shaft tiers where every bank mixes kinds of car, in the shop and in the reducer', () => {
    const schedule = shippedPriceSchedule();
    for (const [buildingId, contractId] of [
      ['crown-hotel', 'c7'],
      ['st-jude-hospital', 'c8'],
    ] as const) {
      const shafts = shaftsFor(schedule, buildingId);
      const tower = rich(buildingId, contractId);
      const shop = SHOP.find((category) => category.id === 'shafts')!;
      for (const tier of shop.tiers) {
        expect(shopTierState(tower, 'shafts', tier, schedule, undefined, shafts), tier.priceId).toEqual({
          id: 'no-shaft',
          pressable: false,
        });
        /* Without the tower known, the tier is the ordinary purchase it always was. */
        expect(shopTierState(tower, 'shafts', tier, schedule).id).not.toBe('no-shaft');
      }
      const career: CampaignCareer = {
        carry: 0,
        today: 1,
        monthsWorked: 0,
        lost: 0,
        towers: [tower],
        openTowerId: contractId,
        pendingBooking: undefined,
      };
      const action = { kind: 'press-tier', towerId: contractId, categoryId: 'shafts', level: 1 } as const;
      expect(applyCampaignAction(career, action, schedule, () => shafts)).toBe(career);
      /* The control: with no building known the same press books the row, as before § D1312. */
      expect(applyCampaignAction(career, action, schedule)).not.toBe(career);
      /* Every tower that draws this refusal is one whose banks all mix — the line's own reason. */
      const banks = authored.get(buildingId)!.banks.map((bank) => bank.id);
      expect(mixedFleetBanks(authored.get(buildingId)!)).toEqual(banks);
    }
  });

  it('draws the refusal on the shop row and on the shaft card, and quotes no price', () => {
    const schedule = shippedPriceSchedule();
    const facts: BuildingFacts = {
      name: 'Crown Hotel',
      spec: undefined,
      shafts: shaftsFor(schedule, 'crown-hotel'),
    };
    const input: CampaignInput = {
      career: {
        carry: 0,
        today: 1,
        monthsWorked: 0,
        lost: 0,
        towers: [rich('crown-hotel', 'c7')],
        openTowerId: 'c7',
        pendingBooking: undefined,
      },
      schedule,
      buildings: new Map([['crown-hotel', facts]]),
      dispatchers: [],
      observations: undefined,
      observationsBasis: 'whole-run',
      history: [],
    };
    const sheet = contractView(input)!;
    const rows = sheet.shop.categories.find((category) => category.id === 'shafts')!.rows;
    for (const row of rows) {
      expect(row.cost).toBe(SHOP_NO_SHAFT_COST);
      expect(row.state).toBe(SHOP_NO_SHAFT);
      expect(row.pressable).toBe(false);
    }
    expect(sheet.shaft.body).toBe(CONTRACT_COPY.shaftNotSold);
    expect(sheet.shaft.body2).toBe(CONTRACT_COPY.shaftNotSold2);
    /* The shop's worth leaves out what it does not sell: 324 less the two shaft rows. */
    expect(sheet.purse.totalNote).toContain(`worth ${String(324 - 34 - 54)}`);
  });

  it('keeps the lede and the standard note true of every difficulty on every contract tower', () => {
    const schedule = shippedPriceSchedule();
    expect(CONTRACT_COPY.lede).toContain('A perfect month buys only part of the shop');
    expect(DIFFICULTIES.standard.note).toContain('A perfect month buys less than half the shop');
    for (const contract of CONTRACTS) {
      const worth = shopTotalUnits(schedule, shaftsFor(schedule, contract.buildingId));
      for (const id of DIFFICULTY_IDS) {
        expect(perfectMonthUnits(DIFFICULTIES[id]), `${contract.id} ${id}`).toBeLessThan(worth);
      }
      expect(perfectMonthUnits(DIFFICULTIES.standard) / worth, contract.id).toBeLessThan(0.5);
    }
  });

  it('prices the shaft card from the row and times it with the row’s own nights', () => {
    const schedule = shippedPriceSchedule();
    expect(shaftDecisionOf(schedule, shaftsFor(schedule, 'midtown-office')).body).toBe(
      'A fourth car is 42 units and eight nights. Bought on day 6, the first of week two, it is live on ' +
        'day 14 with seven days left to use it. From day 13 it would not be live before the contract ' +
        'ends, and the shop will not book it.',
    );
    expect(shaftDecisionOf(schedule, shaftsFor(schedule, 'willis-class-reference')).body).toMatch(
      /^A fourth car here is a new shaft in each of seven banks, for 318 units and eight nights\. /u,
    );
  });
});

describe('the host hands the shop and the reducer the same shafts', () => {
  /** A desk on Midtown Office's contract with money to spend, through the real host. */
  function hostOnMidtown(): { readonly host: EverydayHost } {
    const state: ViewerState = { ...baseState(), buildingId: 'midtown-office' };
    let held: CampaignCareer | undefined = {
      carry: 0,
      today: 1,
      monthsWorked: 0,
      lost: 0,
      towers: [
        {
          ...freshTower({ contractId: 'c2', buildingId: 'midtown-office', dispatcherId: 'eta', rate: 5 }),
          carry: 100,
        },
      ],
      openTowerId: 'c2',
      pendingBooking: undefined,
    };
    const store: CareerStore = {
      load: () => ({ career: held, refusal: undefined, notice: undefined }),
      save: (career) => {
        held = career;
      },
      clear: () => {
        held = undefined;
      },
    };
    const unused = (): never => {
      throw new Error('this fixture drives the career shop only');
    };
    const bindings: EverydayHostBindings = {
      resources: RESOURCES,
      state: () => state,
      playheadS: () => 0,
      dayClosed: () => false,
      runIsOwn: () => true,
      playerHasChosen: () => true,
      dayStartS: () => undefined,
      startRun: () => {},
      intervene: () => {},
      closeDay: () => {},
      openRunTab: () => {},
      ghostRace: () => ({ pick: 'none' as const, rival: undefined, refusal: undefined, pending: false }),
      raceAgainst: () => {},
      applyPatch: () => {},
      loadReferenceRuns: unused,
      simulateRecord: unused,
      enterWatch: unused,
      stopWatching: unused,
      playThisCrowd: unused,
      watching: () => undefined,
      dailyBoard: undefined,
      onChange: () => () => {},
    };
    return { host: createEverydayHost(bindings, store) };
  }

  it('quotes 42 u on the desk and books 42 u when the player buys it', () => {
    const { host } = hostOnMidtown();
    const row = contractView(campaignInputOf(host))!
      .shop.categories.find((category) => category.id === 'shafts')!
      .rows.find((entry) => entry.level === 1)!;
    expect(row.cost).toBe('42 u · 8n');
    expect(row.pressable).toBe(true);
    host.campaignAct({ kind: 'press-tier', towerId: 'c2', categoryId: 'shafts', level: 1 });
    host.campaignAct({ kind: 'pick-start', startIdx: 0 });
    const tower = towerById(host.campaign(), 'c2')!;
    expect(tower.bookings.map((booking) => booking.units)).toEqual([42]);
    expect(purseOf(tower)).toBe(100 - 42);
  });
});
