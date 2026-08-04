/// <reference types="node" />

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config/loader.js';
import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { StreamSet } from '../random/index.js';

import { Bank, type CarLike } from './bank.js';
import { Building, createBuilding } from './building.js';
import { PassengerFactory, type Passenger } from './passenger.js';
import { ModelError } from './types.js';

/**
 * The acceptance bar for this module: the five buildings that ship in this repository are
 * built through the real loader and the real factory. No fixtures — a model that only works
 * on hand-written test data is not a model of these buildings.
 */
const REAL_DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(REAL_DATA_DIR);
});

function resolved(id: string): ResolvedBuilding {
  const found = config.buildingsById.get(id);
  if (found === undefined) throw new Error(`test fixture missing building "${id}"`);
  return found;
}

function build(id: string): Building {
  return createBuilding(resolved(id));
}

function requireBank<TCar extends CarLike>(building: Building<TCar>, bankId: string): Bank<TCar> {
  const bank = building.bankById(bankId);
  if (bank === undefined) throw new Error(`test fixture missing bank "${bankId}"`);
  return bank;
}

/** What `data/buildings/` actually contains, pinned so a config edit cannot pass silently. */
const EXPECTED = [
  { id: 'chancery-house', type: 'office', floors: 19, banks: 1, cars: 6, entrances: ['G'], transfers: [], zones: 0, population: 612 },
  { id: 'crown-hotel', type: 'hotel', floors: 24, banks: 1, cars: 5, entrances: ['G'], transfers: [], zones: 1, population: 866 },
  { id: 'garden-apartments', type: 'residential', floors: 6, banks: 1, cars: 2, entrances: ['G'], transfers: [], zones: 0, population: 120 },
  { id: 'midtown-office', type: 'office', floors: 21, banks: 1, cars: 4, entrances: ['P1', 'G'], transfers: [], zones: 0, population: 1710 },
  { id: 'mixed-use-high-rise', type: 'mixed-use', floors: 60, banks: 3, cars: 16, entrances: ['G'], transfers: ['G', '31'], zones: 2, population: 2276 },
  { id: 'secure-tower', type: 'office', floors: 30, banks: 2, cars: 6, entrances: ['G'], transfers: ['G'], zones: 5, population: 992 },
  { id: 'st-jude-hospital', type: 'hospital', floors: 13, banks: 1, cars: 5, entrances: ['G'], transfers: [], zones: 2, population: 922 },
  { id: 'vertical-city', type: 'mixed-use', floors: 100, banks: 7, cars: 35, entrances: ['G'], transfers: ['G', '2', '26', '27', '51', '52', '76', '77'], zones: 2, population: 4887 },
] as const;

describe('createBuilding over the shipped buildings', () => {
  it('builds all eight', () => {
    expect(config.buildings.map((b) => b.id)).toEqual(EXPECTED.map((e) => e.id));
  });

  for (const expected of EXPECTED) {
    describe(expected.id, () => {
      it('reproduces the declared structure', () => {
        const building = build(expected.id);

        expect(building.id).toBe(expected.id);
        expect(building.type).toBe(expected.type);
        expect(building.floorCount).toBe(expected.floors);
        expect(building.bankCount).toBe(expected.banks);
        expect(building.cars).toHaveLength(expected.cars);
        expect(building.entranceFloors.map((f) => f.id)).toEqual([...expected.entrances]);
        expect(building.transferFloors.map((f) => f.id)).toEqual([...expected.transfers]);
        expect(building.accessZones).toHaveLength(expected.zones);
        expect(building.totalPopulation).toBe(expected.population);
      });

      it('matches its resolved config floor for floor and bank for bank', () => {
        const source = resolved(expected.id);
        const building = createBuilding(source);

        expect(building.floors.map((f) => f.id)).toEqual(source.floors.map((f) => f.id));
        expect(building.banks.map((b) => b.id)).toEqual(source.banks.map((b) => b.id));
        expect(building.config).toBe(source);
        expect(building.source).toBe(source.source);
      });

      it('looks every floor up by id and by index, and stays sorted', () => {
        const building = build(expected.id);

        for (const floor of building.floors) {
          expect(building.floorById(floor.id)).toBe(floor);
          expect(building.floorByIndex(floor.index)).toBe(floor);
          expect(building.floorIndexOf(floor.id)).toBe(floor.index);
        }

        const indices = building.floors.map((f) => f.index);
        expect([...indices].sort((a, b) => a - b)).toEqual(indices);

        // Heights increase strictly with index — the invariant the config layer enforces and
        // every travel-time calculation depends on.
        const heights = building.floors.map((f) => f.heightM);
        expect([...heights].sort((a, b) => a - b)).toEqual(heights);
      });

      it('serves every floor a bank declares, and declares every floor a bank serves', () => {
        const building = build(expected.id);
        for (const bank of building.banks) {
          for (const floorId of bank.servesFloors) {
            expect(building.hasFloor(floorId)).toBe(true);
            expect(building.canPhysicallyServe(bank.id, floorId)).toBe(true);
            expect(building.banksServing(floorId)).toContain(bank);
          }
        }
      });
    });
  }
});

describe('floor lookup', () => {
  it('handles basements and gaps in the numbering', () => {
    const midtown = build('midtown-office');
    // P1 is index -1: floor lookup is by declared index, not by array position.
    expect(midtown.floorByIndex(-1)?.id).toBe('P1');
    expect(midtown.floorById('P1')?.index).toBe(-1);

    const secure = build('secure-tower');
    // Secure Tower jumps from G (0) straight to 2. There is no floor 1 to find.
    expect(secure.floorByIndex(0)?.id).toBe('G');
    expect(secure.floorByIndex(1)).toBeUndefined();
    expect(secure.floorByIndex(2)?.id).toBe('2');
  });

  it('returns undefined for unknown floors and throws only when asked to', () => {
    const secure = build('secure-tower');
    expect(secure.floorById('B7')).toBeUndefined();
    expect(secure.hasFloor('B7')).toBe(false);
    expect(secure.floorIndexOf('B7')).toBeUndefined();
    expect(() => secure.requireFloor('B7')).toThrow(ModelError);
    expect(secure.requireFloor('30').label).toBe('Executive');
  });

  it('exposes entrance and transfer flags per floor', () => {
    const mixed = build('mixed-use-high-rise');
    expect(mixed.isEntrance('G')).toBe(true);
    expect(mixed.isTransferFloor('G')).toBe(true);
    // The sky lobby is a transfer floor but not a street entrance — the two flags are
    // independent, and neither is inferred from the other.
    expect(mixed.isEntrance('31')).toBe(false);
    expect(mixed.isTransferFloor('31')).toBe(true);
    expect(mixed.isTransferFloor('45')).toBe(false);
    expect(mixed.isTransferFloor('nope')).toBe(false);
  });
});

describe('service zoning — canPhysicallyServe', () => {
  it('stops the low bank at the top of its shaft', () => {
    const secure = build('secure-tower');

    expect(secure.canPhysicallyServe('low', '15')).toBe(true);
    expect(secure.canPhysicallyServe('low', '30')).toBe(false);
    expect(secure.canPhysicallyServe('high', '30')).toBe(true);
    expect(secure.canPhysicallyServe('high', '15')).toBe(false);
  });

  it('is false for banks and floors that do not exist', () => {
    const secure = build('secure-tower');
    expect(secure.canPhysicallyServe('mid', '15')).toBe(false);
    expect(secure.canPhysicallyServe('low', 'B7')).toBe(false);
  });

  it('lists the banks serving a floor in declared order', () => {
    const mixed = build('mixed-use-high-rise');
    expect(mixed.banksServing('G').map((b) => b.id)).toEqual(['shuttle', 'office-local']);
    expect(mixed.banksServing('31').map((b) => b.id)).toEqual(['shuttle', 'residential-local']);
    expect(mixed.banksServing('45').map((b) => b.id)).toEqual(['residential-local']);
    expect(mixed.banksServing('B7')).toEqual([]);
  });
});

describe('access zoning — isAccessPermitted', () => {
  it('permits a credential on its own tenant floors', () => {
    const secure = build('secure-tower');
    expect(secure.isAccessPermitted('tenant-alpha-staff', '2')).toBe(true);
    expect(secure.isAccessPermitted('tenant-alpha-staff', '8')).toBe(true);
  });

  it('denies that same credential on the executive floor', () => {
    const secure = build('secure-tower');
    expect(secure.isAccessPermitted('tenant-alpha-staff', '30')).toBe(false);
    expect(secure.isAccessPermitted('tenant-delta-staff', '30')).toBe(false);
    expect(secure.isAccessPermitted('exec', '30')).toBe(true);
    expect(secure.isAccessPermitted('exec-escort', '30')).toBe(true);
  });

  it('has no universal credential', () => {
    // The executive floor deliberately excludes `facilities` and `security`, which every
    // tenant zone grants, so no implementation can short-circuit the check with a
    // building-wide allow-list.
    const secure = build('secure-tower');
    for (const group of ['facilities', 'security']) {
      expect(secure.isAccessPermitted(group, '9')).toBe(true);
      expect(secure.isAccessPermitted(group, '23')).toBe(true);
      expect(secure.isAccessPermitted(group, '30')).toBe(false);
    }
  });

  it('leaves floors in no access zone unrestricted, credential or not', () => {
    const secure = build('secure-tower');
    expect(secure.isAccessRestricted('G')).toBe(false);
    expect(secure.isAccessPermitted('tenant-alpha-staff', 'G')).toBe(true);
    expect(secure.isAccessPermitted('nobody-in-particular', 'G')).toBe(true);
    expect(secure.isAccessPermitted(undefined, 'G')).toBe(true);
    expect(secure.permittedCredentialGroups('G')).toBeUndefined();
  });

  it('denies an unbadged visitor and an unknown group on a restricted floor', () => {
    const secure = build('secure-tower');
    expect(secure.isAccessPermitted(undefined, '2')).toBe(false);
    expect(secure.isAccessPermitted('', '2')).toBe(false);
    expect(secure.isAccessPermitted('tenant-alpha-staff ', '2')).toBe(false);
  });

  it('denies every floor the building does not declare', () => {
    const secure = build('secure-tower');
    expect(secure.isAccessPermitted('exec', 'B7')).toBe(false);
    expect(secure.isAccessPermitted(undefined, 'B7')).toBe(false);
  });

  it('reports the zones and the union of groups covering a floor', () => {
    const secure = build('secure-tower');
    expect(secure.accessZonesFor('30').map((zone) => zone.id)).toEqual(['executive']);
    expect([...(secure.permittedCredentialGroups('30') ?? [])]).toEqual(['exec', 'exec-escort']);
    expect(secure.accessZonesFor('G')).toEqual([]);
  });

  it('lets a building with no access zones through unconditionally', () => {
    for (const id of ['garden-apartments', 'midtown-office']) {
      const building = build(id);
      expect(building.accessZones).toEqual([]);
      for (const floor of building.floors) {
        expect(building.isAccessRestricted(floor.id)).toBe(false);
        expect(building.isAccessPermitted(undefined, floor.id)).toBe(true);
        expect(building.isAccessPermitted('anyone', floor.id)).toBe(true);
      }
    }
  });

  it('splits mixed-use credentials by half of the building', () => {
    const mixed = build('mixed-use-high-rise');
    expect(mixed.isAccessPermitted('office-staff', '20')).toBe(true);
    expect(mixed.isAccessPermitted('office-staff', '45')).toBe(false);
    expect(mixed.isAccessPermitted('resident', '45')).toBe(true);
    expect(mixed.isAccessPermitted('resident', '20')).toBe(false);
    // Retail and the sky lobby are open to the street.
    expect(mixed.isAccessRestricted('3')).toBe(false);
    expect(mixed.isAccessRestricted('31')).toBe(false);
  });
});

describe('the two zoning concepts stay separate', () => {
  it('has floors that are physically reachable but access-denied', () => {
    const secure = build('secure-tower');
    // The shaft opens onto 30; this credential still may not go there.
    expect(secure.canPhysicallyServe('high', '30')).toBe(true);
    expect(secure.isAccessPermitted('tenant-charlie-staff', '30')).toBe(false);
  });

  it('has floors that are access-permitted but physically unreachable by a given bank', () => {
    const secure = build('secure-tower');
    // The credential is fine; the low bank simply does not reach floor 30.
    expect(secure.isAccessPermitted('exec', '30')).toBe(true);
    expect(secure.canPhysicallyServe('low', '30')).toBe(false);
  });

  it('makes eligibility the intersection, never either one alone', () => {
    const secure = build('secure-tower');

    // Permitted and reachable: the high bank, and only the high bank.
    expect(secure.banksEligibleFor('exec', '30').map((b) => b.id)).toEqual(['high']);
    // Reachable, not permitted: no bank is eligible even though `high` serves the floor.
    expect(secure.banksEligibleFor('tenant-alpha-staff', '30')).toEqual([]);
    expect(secure.banksServing('30').map((b) => b.id)).toEqual(['high']);
    // Unrestricted lobby: both banks, for anybody.
    expect(secure.banksEligibleFor(undefined, 'G').map((b) => b.id)).toEqual(['low', 'high']);
  });

  it('cannot answer the operational-zoning question at all', () => {
    // Operational (dynamic) zoning is a tunable dispatcher strategy and deliberately has no
    // home on the building. If this ever fails, the third concept has leaked into the model.
    const members = Object.getOwnPropertyNames(Building.prototype);
    expect(members.filter((name) => /operational|dynamiczone/i.test(name))).toEqual([]);
  });

  it('gives each question only the arguments it can legitimately use', () => {
    // canPhysicallyServe(bankId, floorId) — no credential to consult, so a shaft cannot be
    // made to reach a floor by badge. isAccessPermitted(credentialGroup, floorId) — no bank
    // to consult, so permission cannot silently become a routing decision.
    expect(Building.prototype.canPhysicallyServe).toHaveLength(2);
    expect(Building.prototype.isAccessPermitted).toHaveLength(2);
  });
});

describe('sky-lobby journeys through a real building', () => {
  it('cannot get from the ground lobby to a residential floor on one bank', () => {
    // The premise of the transfer: no single bank serves both ends of the journey.
    const mixed = build('mixed-use-high-rise');
    const direct = mixed.banks.filter((bank) => bank.servesFloor('G') && bank.servesFloor('45'));
    expect(direct).toEqual([]);
    expect(mixed.isTransferFloor('31')).toBe(true);
  });

  it('keeps one journey identity from the street to the 45th floor', () => {
    const mixed = build('mixed-use-high-rise');
    const passengers = new PassengerFactory({
      streams: new StreamSet(20260725),
      massConfig: config.trafficProfiles.passengerMass,
      topology: mixed,
    });

    // Leg 1: shuttle, G -> 31.
    const leg1 = passengers.arrive({
      originFloorId: 'G',
      destinationFloorId: '31',
      finalDestinationFloorId: '45',
      arrivedAt: 100,
      credentialGroup: 'resident',
    });
    mixed.requireFloor('G').addWaiting(leg1);
    mixed.requireFloor('G').registerHallCall(leg1.direction, 100);
    expect(mixed.requireFloor('G').queueLength('up')).toBe(1);

    const [boarded] = mixed.requireFloor('G').takeWaiting('up');
    expect(boarded).toBe(leg1);
    leg1.board(118);
    leg1.alight(140);

    // Leg 2: residential local, 31 -> 45, after a 12 s walk across the sky lobby.
    const leg2 = passengers.transfer(leg1, { destinationFloorId: '45', arrivedAt: 152 });
    mixed.requireFloor('31').addWaiting(leg2);
    leg2.board(190);
    leg2.alight(226);

    expect(leg2.journeyId).toBe(leg1.journeyId);
    expect(leg2.journeyOriginFloorId).toBe('G');
    expect(leg2.originFloorId).toBe('31');
    expect(leg2.massKg).toBe(leg1.massKg);

    // Per-leg statistics stay per-leg...
    expect(leg1.waitTimeS).toBe(18);
    expect(leg2.waitTimeS).toBe(38);
    // ...and time to destination spans both, including the transfer walk.
    expect(leg2.timeToDestinationS).toBe(126);
    expect(mixed.isAccessPermitted(leg2.credentialGroup, leg2.destinationFloorId)).toBe(true);
  });

  it('routes an office-to-residence trip through both transfer floors', () => {
    const mixed = build('mixed-use-high-rise');
    const passengers = new PassengerFactory({
      streams: new StreamSet(31),
      massConfig: config.trafficProfiles.passengerMass,
      topology: mixed,
    });

    // 45 -> 20: residential-local down to 31, shuttle down to G, office-local up to 20.
    const leg1 = passengers.arrive({
      originFloorId: '45',
      destinationFloorId: '31',
      finalDestinationFloorId: '20',
      arrivedAt: 0,
    });
    leg1.board(30);
    leg1.alight(70);
    const leg2 = passengers.transfer(leg1, { destinationFloorId: 'G', arrivedAt: 80 });
    leg2.board(100);
    leg2.alight(130);
    const leg3 = passengers.transfer(leg2, { destinationFloorId: '20', arrivedAt: 140 });
    leg3.board(160);
    leg3.alight(220);

    expect(leg1.direction).toBe('down');
    expect(leg3.direction).toBe('up');
    expect(new Set([leg1.journeyId, leg2.journeyId, leg3.journeyId]).size).toBe(1);
    expect(leg3.legIndex).toBe(2);
    expect(leg3.timeToDestinationS).toBe(220);
    expect(passengers.journeyCount).toBe(1);
  });

  it('refuses to transfer at a floor Secure Tower does not flag', () => {
    const secure = build('secure-tower');
    const passengers = new PassengerFactory({
      streams: new StreamSet(1),
      massConfig: config.trafficProfiles.passengerMass,
      topology: secure,
    });
    // 6 -> 18 must change cars at G, the only floor both banks reach and the only one flagged.
    const leg1 = passengers.arrive({
      originFloorId: '6',
      destinationFloorId: '15',
      finalDestinationFloorId: '18',
      arrivedAt: 0,
    });
    leg1.board(10);
    leg1.alight(20);
    expect(() => passengers.transfer(leg1, { destinationFloorId: '18', arrivedAt: 30 })).toThrow(
      /not flagged isTransferFloor/,
    );

    const viaLobby = passengers.arrive({
      originFloorId: '6',
      destinationFloorId: 'G',
      finalDestinationFloorId: '18',
      arrivedAt: 0,
    });
    viaLobby.board(10);
    viaLobby.alight(40);
    const leg2 = passengers.transfer(viaLobby, { destinationFloorId: '18', arrivedAt: 50 });
    expect(leg2.journeyId).toBe(viaLobby.journeyId);
    expect(leg2.originFloorId).toBe('G');
  });
});

describe('boarding a floor that more than one bank serves', () => {
  it('is not a hypothetical: every multi-bank building that ships has shared floors', () => {
    const shared: Record<string, readonly string[]> = {};
    for (const expected of EXPECTED) {
      const building = build(expected.id);
      if (building.bankCount < 2) continue;
      shared[expected.id] = building.floors
        .filter((floor) => building.banksServing(floor.id).length > 1)
        .map((floor) => floor.id);
    }

    expect(shared).toEqual({
      'mixed-use-high-rise': ['G', '31'],
      'secure-tower': ['G'],
      'vertical-city': ['G', '2', '26', '27', '51', '52', '76', '77'],
    });
  });

  it('never hands a car a passenger its own shafts cannot reach', () => {
    // Regression. The ground lobby of Mixed-Use High-Rise is served by `shuttle` and
    // `office-local`, and both queues are the same queue. An office-local car taking the head
    // of the `up` queue unconditionally would carry away a passenger bound for the sky lobby
    // at 31 — a floor its shafts do not reach — and delete them from the landing, so the hall
    // call could not recover them.
    const mixed = build('mixed-use-high-rise');
    const passengers = new PassengerFactory({
      streams: new StreamSet(4471),
      massConfig: config.trafficProfiles.passengerMass,
      topology: mixed,
    });
    const lobby = mixed.requireFloor('G');
    const officeLocal = requireBank(mixed, 'office-local');
    const shuttle = requireBank(mixed, 'shuttle');

    expect(officeLocal.servesFloor('31')).toBe(false);
    expect(shuttle.servesFloor('20')).toBe(false);

    const toSkyLobby = passengers.arrive({
      originFloorId: 'G',
      destinationFloorId: '31',
      finalDestinationFloorId: '45',
      arrivedAt: 0,
      credentialGroup: 'resident',
    });
    const toOffice = passengers.arrive({
      originFloorId: 'G',
      destinationFloorId: '20',
      arrivedAt: 5,
      credentialGroup: 'office-staff',
    });
    lobby.addWaiting(toSkyLobby);
    lobby.addWaiting(toOffice);
    lobby.registerHallCall('up', 0);

    // An office-local car arrives first, with room for eight.
    const boarding = lobby.takeWaiting('up', 8, (p) => officeLocal.servesFloor(p.destinationFloorId));

    expect(boarding).toEqual([toOffice]);
    for (const passenger of boarding) {
      expect(mixed.canPhysicallyServe('office-local', passenger.destinationFloorId)).toBe(true);
    }
    // The sky-lobby passenger is still on the landing, and the call is still lit for the
    // bank that can actually take them.
    expect(lobby.waiting('up')).toEqual([toSkyLobby]);
    expect(lobby.hasHallCall('up')).toBe(true);

    const shuttleBoarding = lobby.takeWaiting('up', 8, (p) => shuttle.servesFloor(p.destinationFloorId));
    expect(shuttleBoarding).toEqual([toSkyLobby]);
    expect(lobby.queueLength('up')).toBe(0);
  });

  it('lets the caller board on the full eligibility rule, service and access together', () => {
    // The predicate is caller-supplied precisely so the rule can be the intersection the
    // dispatcher actually uses, without the landing knowing anything about zoning.
    const secure = build('secure-tower');
    const passengers = new PassengerFactory({
      streams: new StreamSet(9091),
      massConfig: config.trafficProfiles.passengerMass,
      topology: secure,
    });
    const lobby = secure.requireFloor('G');
    const low = requireBank(secure, 'low');
    const high = requireBank(secure, 'high');

    // Floor 8 is in the tenant-alpha zone and in the low bank's shaft: permitted and reachable.
    const toLowRise = passengers.arrive({
      originFloorId: 'G',
      destinationFloorId: '8',
      arrivedAt: 0,
      credentialGroup: 'tenant-alpha-staff',
    });
    const toExecutive = passengers.arrive({
      originFloorId: 'G',
      destinationFloorId: '30',
      arrivedAt: 1,
      credentialGroup: 'exec',
    });
    const barredFromExecutive = passengers.arrive({
      originFloorId: 'G',
      destinationFloorId: '30',
      arrivedAt: 2,
      credentialGroup: 'tenant-alpha-staff',
    });
    for (const passenger of [toLowRise, toExecutive, barredFromExecutive]) {
      lobby.addWaiting(passenger);
    }

    const eligibleFor = (bank: Bank) => (p: Passenger) =>
      secure.banksEligibleFor(p.credentialGroup, p.destinationFloorId).includes(bank);

    expect(lobby.takeWaiting('up', 8, eligibleFor(low))).toEqual([toLowRise]);
    // The high bank takes the exec, and leaves the passenger whose badge does not open 30 —
    // service zoning alone would have boarded them.
    expect(high.servesFloor('30')).toBe(true);
    expect(lobby.takeWaiting('up', 8, eligibleFor(high))).toEqual([toExecutive]);
    expect(lobby.waiting('up')).toEqual([barredFromExecutive]);
  });
});

describe('runtime state', () => {
  it('is independent between two buildings built from the same config', () => {
    const source = resolved('midtown-office');
    const a = createBuilding(source);
    const b = createBuilding(source);

    a.requireFloor('G').registerHallCall('up', 10);
    expect(a.requireFloor('G').hasHallCall('up')).toBe(true);
    expect(b.requireFloor('G').hasHallCall('up')).toBe(false);
  });

  it('resets every floor for a fresh replication', () => {
    const secure = build('secure-tower');
    const passengers = new PassengerFactory({
      streams: new StreamSet(2),
      massConfig: config.trafficProfiles.passengerMass,
      topology: secure,
    });
    secure
      .requireFloor('G')
      .addWaiting(passengers.arrive({ originFloorId: 'G', destinationFloorId: '9', arrivedAt: 0 }));
    secure.requireFloor('G').registerHallCall('up', 0);
    secure.requireFloor('9').registerHallCall('down', 5);

    secure.reset();

    for (const floor of secure.floors) {
      expect(floor.queueLength()).toBe(0);
      expect(floor.activeHallCalls()).toEqual([]);
    }
  });

  it('resets the cars too, not only the floors', () => {
    // Regression, and the reason this matters is statistical rather than cosmetic. A
    // replication runner that reuses a building must start replication N+1 with the cars
    // parked as they were at t=0; inheriting replication N's positions, loads and committed
    // calls makes the replications serially correlated, and Phase 3's paired-t interval is
    // then a confident interval around the wrong number.
    class StatefulCar {
      floorId = 'G';
      loadKg = 0;
      serviceMode = 'in-service';
      readonly committedCalls: string[] = [];
      resetCount = 0;

      constructor(readonly id: string) {}

      reset(): void {
        this.resetCount += 1;
        this.floorId = 'G';
        this.loadKg = 0;
        this.serviceMode = 'in-service';
        this.committedCalls.length = 0;
      }
    }

    const secure = createBuilding(resolved('secure-tower'), {
      createCar: (spec, context) => new StatefulCar(`${context.bankId}-${spec.id}`),
    });

    // End of replication N: cars are scattered, loaded, and one is out of service.
    const [first, second] = secure.cars;
    if (first === undefined || second === undefined) throw new Error('expected six cars');
    first.floorId = '15';
    first.loadKg = 900;
    first.committedCalls.push('15:down');
    second.serviceMode = 'out-of-service';
    secure.requireFloor('G').registerHallCall('up', 40);

    secure.reset();

    expect(secure.requireFloor('G').hasHallCall('up')).toBe(false);
    for (const car of secure.cars) {
      expect(car.floorId).toBe('G');
      expect(car.loadKg).toBe(0);
      expect(car.serviceMode).toBe('in-service');
      expect(car.committedCalls).toEqual([]);
      expect(car.resetCount).toBe(1);
    }
  });

  it('resets cars through an explicit resetCar hook when they have no reset() of their own', () => {
    class ParkedCar {
      floorId = 'G';
      constructor(readonly id: string) {}
    }

    const secure = createBuilding(resolved('secure-tower'), {
      createCar: (spec, context) => new ParkedCar(`${context.bankId}-${spec.id}`),
      resetCar: (car) => {
        car.floorId = 'G';
      },
    });

    for (const car of secure.cars) car.floorId = '15';
    secure.reset();
    expect(secure.cars.map((car) => car.floorId)).toEqual(secure.cars.map(() => 'G'));
  });

  it("prefers the supplied resetCar over the car's own reset()", () => {
    class BothCar {
      ownResetCalled = false;
      hookResetCalled = false;
      constructor(readonly id: string) {}
      reset(): void {
        this.ownResetCalled = true;
      }
    }

    const secure = createBuilding(resolved('secure-tower'), {
      createCar: (spec, context) => new BothCar(`${context.bankId}-${spec.id}`),
      resetCar: (car) => {
        car.hookResetCalled = true;
      },
    });

    secure.reset();
    expect(secure.cars.every((car) => car.hookResetCalled)).toBe(true);
    expect(secure.cars.some((car) => car.ownResetCalled)).toBe(false);
  });

  it('resets a building whose cars are the stateless resolved specs without complaint', () => {
    const secure = build('secure-tower');
    expect(() => secure.reset()).not.toThrow();
    expect(secure.cars.map((car) => car.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});

describe('car objects', () => {
  it('keeps the resolved specs as its cars by default', () => {
    const secure = build('secure-tower');
    const low = secure.bankById('low');
    expect(low).toBeDefined();
    expect(low?.cars).toEqual(low?.carSpecs);
    expect(low?.cars.map((car) => car.id)).toEqual(['A', 'B', 'C']);
    expect(low?.carSpecs.map((car) => car.ratedSpeedMps)).toEqual([4, 4, 4]);
    expect(secure.cars.map((car) => car.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('accepts a car factory, so the physics layer can own the car entity', () => {
    // `model/car/` lands after this module. The building is generic over the car type so the
    // bank can hold real cars later without this file knowing anything about them.
    class StubCar {
      constructor(
        readonly id: string,
        readonly bankId: string,
        readonly ratedSpeedMps: number,
      ) {}
    }

    const building = createBuilding(resolved('secure-tower'), {
      createCar: (spec, context) => new StubCar(`${context.bankId}-${spec.id}`, context.bankId, spec.ratedSpeedMps),
    });

    expect(building.cars).toHaveLength(6);
    expect(building.cars.every((car) => car instanceof StubCar)).toBe(true);
    expect(building.banks[0]?.cars.map((car) => car.id)).toEqual(['low-A', 'low-B', 'low-C']);
    expect(building.banks[0]?.carById('low-B')?.ratedSpeedMps).toBe(4);
    // The resolved specification is still reachable, whichever form the cars took.
    expect(building.banks[0]?.carSpecs.map((car) => car.id)).toEqual(['A', 'B', 'C']);
    expect(building.canPhysicallyServe('low', '15')).toBe(true);
  });
});
