/**
 * Stage 7, given the two things it needed and never had: a forecast and a zone.
 *
 * Both defects this file fixes are of the same kind — a **declared parameter that was inert** —
 * and both are asserted here against the configuration that made them inert, not against a
 * configuration chosen to make them pass:
 *
 * | Defect | Assertion |
 * |---|---|
 * | `zone-center` never moved a car under its own defaults | it moves one, on the real `midtown-office` bank, at `DISPATCH_DEFAULTS` |
 * | `predicted-demand` had no forecast to read, so every car answered `no-forecast` | it parks somewhere `lobby` does not, on a floor-concentrated pattern |
 *
 * The predictor itself is not under test here, and cannot be: `fixedForecast` is a fixed map with
 * no model behind it, which is the point. What is under test is that **a forecast changes where
 * cars park**, which is a property of stage 7 and of this wiring, and would be true of any
 * learned arrival model that satisfies `DemandForecastSource`.
 *
 * ## What none of it establishes
 *
 * Every assertion here is at the **decision level**, because `Simulation.#park` still supplies
 * neither a forecast nor a partition, so none of this wiring runs inside `runSimulation`. In
 * particular the Phase 5 acceptance criterion *"pre-positioning shows measurable AWT improvement on
 * Garden Apartments"* is **unmet** — see the Garden Apartments block below, which states what the
 * surrogate is and what it is not.
 */

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../config/loader.js';
import type {
  LoadedConfig,
  ParkingStrategy,
  ResolvedBuilding,
  ResolvedCar,
} from '../../config/types.js';
import { Car } from '../../model/car/car.js';
import { shaftForBank, type CarSnapshot } from '../../model/car/types.js';
import { DISPATCH_DEFAULTS } from '../parameters.js';
import { createDispatchPolicy } from '../policy.js';
import type { DispatcherProfileSource } from '../types.js';

import { withLandingCounts, groupContext } from './groupContext.js';
import {
  fixedForecast,
  movesOf,
  parkingFloorIds,
  prepositionPlan,
  repositionContextFor,
  resolvePrepositionContext,
} from './prepositioning.js';
import { createArrivalModel } from '../predictor/arrivalModel.js';
import type { ArrivalModel } from '../predictor/types.js';

import { bandRange, contiguousZones, zoneAssignment, zoneFloorIdsFor } from './zoning.js';
import { call, clockAt, makeCar, plainShaft, profile, snapshotAt } from './fixtures.test-helper.js';
import type { DemandForecastSource } from './types.js';

const DATA_DIR = new URL('../../../../../data', import.meta.url).pathname;

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

function parkingProfile(
  parkingStrategy: ParkingStrategy,
  idle: { repositionThresholdS?: number; repositionEnergyWeight?: number } = {},
): DispatcherProfileSource {
  return profile({ waitTime: 1 }, { idle: { parkingStrategy, ...idle } });
}

/** The real Midtown Office bank: four cars, twenty-one served floors, spec straight from config. */
async function midtownBank(homeFloorIds: readonly string[]): Promise<readonly CarSnapshot[]> {
  const config: LoadedConfig = await loadConfig(DATA_DIR);
  const building = config.buildingsById.get('midtown-office') as ResolvedBuilding;
  const bank = building.banks.find((candidate) => candidate.id === 'main');
  if (bank === undefined) throw new Error('midtown-office has no bank "main"');
  const shaft = shaftForBank(building, 'main');

  return homeFloorIds.map((homeFloorId, index) => {
    const spec = bank.cars[index] as ResolvedCar;
    return new Car({
      id: spec.id,
      bankId: 'main',
      spec,
      shaft,
      homeFloorId,
      clock: clockAt(0),
    }).snapshot(0);
  });
}

/* -------------------------------------------------------------------------- *
 * Operational zoning
 * -------------------------------------------------------------------------- */

describe('operational zoning partitions a bank', () => {
  it('splits n positions into n contiguous bands that cover everything exactly once', () => {
    for (const total of [1, 5, 20, 21, 40]) {
      for (const parts of [1, 2, 3, 4, 7]) {
        const covered: number[] = [];
        for (let index = 0; index < parts; index += 1) {
          const { from, to } = bandRange(total, parts, index);
          expect(to).toBeGreaterThanOrEqual(from);
          for (let position = from; position < to; position += 1) covered.push(position);
        }
        expect(covered).toEqual(Array.from({ length: total }, (_, index) => index));
      }
    }
  });

  it('returns an empty band rather than overlapping when there are more cars than floors', () => {
    // Two floors, four cars: two bands get one floor each and two get none. Empty is the honest
    // answer — two cars cannot each have half of one floor.
    expect(bandRange(2, 4, 0)).toEqual({ from: 0, to: 0 });
    expect(bandRange(2, 4, 1)).toEqual({ from: 0, to: 1 });
    expect(bandRange(2, 4, 2)).toEqual({ from: 1, to: 1 });
    expect(bandRange(2, 4, 3)).toEqual({ from: 1, to: 2 });
    expect(bandRange(0, 3, 0)).toEqual({ from: 0, to: 0 });
    expect(bandRange(5, 0, 0)).toEqual({ from: 0, to: 0 });
    expect(bandRange(5, 2, 9)).toEqual({ from: 0, to: 0 });
  });

  it('gives each in-service car one contiguous band of its own shaft', () => {
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '6'), snapshotAt('C', '14')];
    const zones = contiguousZones(cars);

    expect(zones.map((zone) => zone.carId)).toEqual(['A', 'B', 'C']);
    expect(zones[0]?.floorIds).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    expect(zones[1]?.floorIds).toEqual(['7', '8', '9', '10', '11', '12', '13']);
    expect(zones[2]?.floorIds).toEqual(['14', '15', '16', '17', '18', '19', '20']);

    // Disjoint, and together the whole shaft.
    const all = zones.flatMap((zone) => zone.floorIds);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(plainShaft().floors.length);
  });

  it('is keyed on car id, so two cars passing each other do not swap zones', () => {
    const zones = zoneAssignment([snapshotAt('A', '0'), snapshotAt('B', '20')]);
    const swapped = zoneAssignment([snapshotAt('A', '20'), snapshotAt('B', '0')]);
    expect(swapped.get('A')).toEqual(zones.get('A'));
    expect(swapped.get('B')).toEqual(zones.get('B'));
  });

  it('re-partitions when a car leaves service, and gives that car no band', () => {
    const parked = makeCar('B', '6');
    parked.setMode('out-of-service');
    const zones = zoneAssignment([snapshotAt('A', '0'), parked.snapshot(0), snapshotAt('C', '14')]);

    expect(zones.get('B')).toEqual([]);
    // The two still working split the whole shaft between them rather than leaving B's band
    // uncovered.
    expect(zones.get('A')?.length).toBe(10);
    expect(zones.get('C')?.length).toBe(11);
    expect(zones.get('A')?.concat(zones.get('C') ?? []).length).toBe(21);
  });

  it('partitions each bank independently', () => {
    const low = [
      makeCar('A', '0', clockAt(0), 'low').snapshot(0),
      makeCar('B', '4', clockAt(0), 'low').snapshot(0),
    ];
    const high = [makeCar('C', '8', clockAt(0), 'high').snapshot(0)];
    const zones = zoneAssignment([...low, ...high]);

    expect(zones.get('A')?.length).toBe(10);
    expect(zones.get('B')?.length).toBe(11);
    // A bank of one covers its whole shaft.
    expect(zones.get('C')?.length).toBe(21);
  });

  it('distinguishes an unzoned car from a car with an empty zone', () => {
    expect(zoneFloorIdsFor(undefined, 'A')).toBeUndefined();
    expect(zoneFloorIdsFor(new Map(), 'A')).toBeUndefined();
    expect(zoneFloorIdsFor(new Map([['A', []]]), 'A')).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * zone-center: the Phase 2 defect
 * -------------------------------------------------------------------------- */

describe('zone-center moves a car', () => {
  it('moves one on the real Midtown Office bank under its own declared defaults', async () => {
    // The defect, stated exactly: `zone-center` was inert under its own defaults. Nothing here is
    // chosen to make it pass — the building is the reference building, the thresholds are
    // DISPATCH_DEFAULTS, and no zone is supplied, which is the configuration that did nothing.
    const cars = await midtownBank(['P1', 'P1', 'P1', 'P1']);
    const policy = createDispatchPolicy(parkingProfile('zone-center'));
    expect(policy.config.idle.repositionThresholdS).toBe(DISPATCH_DEFAULTS.repositionThresholdS);
    expect(policy.config.idle.repositionEnergyWeight).toBe(DISPATCH_DEFAULTS.repositionEnergyWeight);

    const decision = policy.reposition(cars[0] as CarSnapshot, 0);

    expect(decision.move).toBe(true);
    expect(decision.reason).toBe('reposition');
    expect(decision.targetFloorId).toBeDefined();
    expect(decision.targetFloorId).not.toBe('P1');
    expect(decision.anticipatedSavingS).toBeGreaterThan(0);
    expect(decision.netGainS).toBeGreaterThanOrEqual(DISPATCH_DEFAULTS.repositionThresholdS);
  });

  it('spreads a bank across distinct floors once the zones are partitioned', async () => {
    const cars = await midtownBank(['P1', 'P1', 'P1', 'P1']);
    const policy = createDispatchPolicy(parkingProfile('zone-center'));

    const unzoned = prepositionPlan(policy, cars, 0, { zones: new Map() });
    const zoned = prepositionPlan(policy, cars, 0);

    // Without a partition every car computes the same shaft median and the whole bank parks on one
    // floor, which is worse than not parking at all.
    expect(parkingFloorIds(unzoned).length).toBe(1);
    // With one, each car takes the middle of its own band, and no two bands have the same middle.
    // Not every car necessarily moves — a car whose band already contains it is `already-there`,
    // and one whose gain is under the deadband stays — which is the deadband working, not a
    // failure of the partition.
    expect(parkingFloorIds(zoned).length).toBeGreaterThan(parkingFloorIds(unzoned).length);
    expect(parkingFloorIds(zoned).length).toBe(movesOf(zoned).length);
    expect(movesOf(zoned).length).toBeGreaterThanOrEqual(3);
  });

  it('will not move a car for a gain below the deadband', async () => {
    const cars = await midtownBank(['P1', 'P1', 'P1', 'P1']);
    const policy = createDispatchPolicy(parkingProfile('zone-center', { repositionThresholdS: 60 }));
    const decision = policy.reposition(cars[0] as CarSnapshot, 0);

    expect(decision.move).toBe(false);
    expect(decision.reason).toBe('below-threshold');
    // It still reports the arithmetic, so a bank that never parks can be diagnosed rather than
    // guessed at.
    expect(decision.anticipatedSavingS).toBeGreaterThan(0);
  });

  it('will not burn energy chasing a gain the trip does not repay', async () => {
    const cars = await midtownBank(['P1', 'P1', 'P1', 'P1']);
    const thrifty = createDispatchPolicy(
      parkingProfile('zone-center', { repositionEnergyWeight: 2, repositionThresholdS: 0 }),
    );
    const free = createDispatchPolicy(
      parkingProfile('zone-center', { repositionEnergyWeight: 0, repositionThresholdS: 0 }),
    );

    const priced = thrifty.reposition(cars[0] as CarSnapshot, 0);
    const ignored = free.reposition(cars[0] as CarSnapshot, 0);

    expect(ignored.move).toBe(true);
    expect(priced.netGainS).toBeLessThan(ignored.netGainS);
    expect(priced.travelSeconds).toBe(ignored.travelSeconds);
  });
});

/* -------------------------------------------------------------------------- *
 * predicted-demand
 * -------------------------------------------------------------------------- */

describe('predicted-demand', () => {
  const CONCENTRATED = fixedForecast(new Map([['18', 40]]));

  it('parks on a different floor from lobby on a floor-concentrated pattern', async () => {
    const cars = await midtownBank(['G', 'G', 'G', 'G']);
    const entranceFloorIds = ['G', 'P1'];

    const predicted = prepositionPlan(
      createDispatchPolicy(parkingProfile('predicted-demand')),
      cars,
      0,
      { entranceFloorIds, predictor: CONCENTRATED },
    );
    const lobby = prepositionPlan(createDispatchPolicy(parkingProfile('lobby')), cars, 0, {
      entranceFloorIds,
      predictor: CONCENTRATED,
    });

    // Where the demand is...
    expect(parkingFloorIds(predicted)).toEqual(['18']);
    expect(movesOf(predicted).length).toBe(cars.length);
    // ...which is not the lobby the cars are already standing on. Standing still is `lobby`'s
    // correct answer here, and the contrast is the point: two strategies, same cars, same forecast,
    // different places.
    expect(parkingFloorIds(lobby)).toEqual([]);
    expect(lobby.every((decision) => decision.reason === 'already-there')).toBe(true);
  });

  it('is inert without a predictor, and says so rather than guessing', async () => {
    const cars = await midtownBank(['G', 'G', 'G', 'G']);
    const plan = prepositionPlan(
      createDispatchPolicy(parkingProfile('predicted-demand')),
      cars,
      0,
      { entranceFloorIds: ['G'] },
    );

    // The Phase 2 state of the world, and the reason the strategy did nothing on every run.
    expect(plan.every((decision) => decision.reason === 'no-forecast')).toBe(true);
    expect(movesOf(plan)).toEqual([]);
  });

  it('distinguishes "no forecast" from "the model expects nobody"', async () => {
    const cars = await midtownBank(['G', 'G', 'G', 'G']);
    const plan = prepositionPlan(
      createDispatchPolicy(parkingProfile('predicted-demand')),
      cars,
      0,
      { predictor: fixedForecast(new Map()) },
    );

    // An empty forecast is information: the model predicts no arrivals anywhere. Degrading it into
    // `lobby` would report a parking result nobody configured.
    expect(plan.every((decision) => decision.reason === 'no-target')).toBe(true);
  });

  it('asks the predictor once per bank, not once per car', async () => {
    const cars = await midtownBank(['G', 'G', 'G', 'G']);
    const asked: (number | undefined)[][] = [];
    const counting: DemandForecastSource = {
      expectedDemandByFloor: (fromT, horizonS) => {
        asked.push([fromT, horizonS]);
        return new Map([['18', 40]]);
      },
    };

    prepositionPlan(createDispatchPolicy(parkingProfile('predicted-demand')), cars, 0, {
      predictor: counting,
      horizonS: 120,
    });

    // Four cars, one question. Asking per car would let two cars in one bank be placed against two
    // different futures if the model were ever stateful.
    expect(asked).toEqual([[0, 120]]);
  });

  it('leaves the horizon to the model unless a caller overrides it', async () => {
    const cars = await midtownBank(['G', 'G', 'G', 'G']);
    const asked: (number | undefined)[][] = [];
    const counting: DemandForecastSource = {
      expectedDemandByFloor: (fromT, horizonS) => {
        asked.push([fromT, horizonS]);
        return new Map([['18', 40]]);
      },
    };
    const policy = createDispatchPolicy(parkingProfile('predicted-demand'));

    prepositionPlan(policy, cars, 30, { predictor: counting });
    // `idle.predictorHorizonS` is the *predictor's* tunable, declared by PREDICTOR_PARAMETERS. This
    // module passes no horizon at all, so the model answers over its own — one source of truth for
    // how far ahead a bank looks.
    expect(asked).toEqual([[30, undefined]]);

    // A forecast over no time is zero everywhere, which would silently turn the strategy into
    // `no-target`. A nonsensical override is discarded rather than honoured.
    asked.length = 0;
    prepositionPlan(policy, cars, 30, { predictor: counting, horizonS: -5 });
    expect(asked).toEqual([[30, undefined]]);
  });
});

/* -------------------------------------------------------------------------- *
 * Garden Apartments — the Phase 5 acceptance criterion, and what is actually proved
 * -------------------------------------------------------------------------- */

describe('pre-positioning on Garden Apartments', () => {
  /**
   * docs/05-roadmap.md § Phase 5 asks for *"pre-positioning shows measurable AWT improvement on
   * Garden Apartments, where parking policy dominates."* **That criterion is unmet, and nothing in
   * this describe block claims otherwise.**
   *
   * It cannot be met from this directory. An AWT interval is a `runSimulation` measurement, and
   * `Simulation.#park` builds its `RepositionContext` inline as `{ entranceFloorIds }` — no
   * forecast, no partition — so `predicted-demand` answers `no-forecast` for every car of every run
   * and pre-positioning has no effect on any AWT the runner can report. Writing a paired-t test
   * today would compare a configuration against itself and report a confident zero, which is the
   * project's stated first failure mode wearing the criterion's clothes.
   *
   * What is proved instead is the **decision-level surrogate**: a forecast turns "no car moves" into
   * "every car moves, with a positive net gain after energy". That is a statement about stage 7's
   * arithmetic and this file's wiring. It is *not* evidence about AWT in either direction — Phase 3
   * measured the resolution limit at ~8% of AWT at n = 100, and a 15 s per-call anticipated saving
   * says nothing about where a real difference would land against that.
   */
  async function gardenBank(): Promise<{
    readonly cars: readonly CarSnapshot[];
    readonly entranceFloorIds: readonly string[];
    readonly upperFloorIds: readonly string[];
  }> {
    const config: LoadedConfig = await loadConfig(DATA_DIR);
    const building = config.buildingsById.get('garden-apartments') as ResolvedBuilding;
    const bank = building.banks[0];
    if (bank === undefined) throw new Error('garden-apartments has no bank');
    const shaft = shaftForBank(building, bank.id);
    const entranceFloorIds = building.entranceFloors.map((floor) => floor.id);

    return {
      cars: bank.cars.map((spec) =>
        new Car({
          id: spec.id,
          bankId: bank.id,
          spec,
          shaft,
          homeFloorId: entranceFloorIds[0] as string,
          clock: clockAt(0),
        }).snapshot(0),
      ),
      entranceFloorIds,
      // Residential down-peak: the demand is upstairs, where the residents are.
      upperFloorIds: building.floors.slice(-3).map((floor) => floor.id),
    };
  }

  it('turns "no car moves" into "every car moves" once a forecast exists', async () => {
    const { cars, entranceFloorIds, upperFloorIds } = await gardenBank();
    const policy = createDispatchPolicy(parkingProfile('predicted-demand'));
    const predictor = fixedForecast(new Map(upperFloorIds.map((floorId) => [floorId, 10])));

    // Exactly the context `Simulation.#park` supplies today.
    const unwired = prepositionPlan(policy, cars, 0, { entranceFloorIds });
    const wired = prepositionPlan(policy, cars, 0, { entranceFloorIds, predictor });

    expect(cars.length).toBeGreaterThan(1);
    expect(unwired.every((decision) => decision.reason === 'no-forecast')).toBe(true);
    expect(movesOf(unwired)).toEqual([]);

    expect(movesOf(wired).length).toBe(cars.length);
    for (const decision of wired) {
      expect(decision.reason).toBe('reposition');
      expect(upperFloorIds).toContain(decision.targetFloorId);
      // Positive after `repositionEnergyWeight` has been charged, per call, which is the arithmetic
      // `repositionDecisionFor` owns and this file does not touch.
      expect(decision.anticipatedSavingS).toBeGreaterThan(0);
      expect(decision.netGainS).toBeGreaterThan(0);
      expect(decision.netGainS).toBeLessThan(decision.anticipatedSavingS);
    }
  });

  it('is a decision-level saving and not an AWT interval, and the deadband still binds', async () => {
    // The guard against reading the number above as a result. A per-call anticipated saving is a
    // property of the projection, and the same projection under a deadband wider than the shaft can
    // pay for moves nobody — which is what makes it arithmetic rather than a measurement.
    const { cars, entranceFloorIds, upperFloorIds } = await gardenBank();
    const predictor = fixedForecast(new Map(upperFloorIds.map((floorId) => [floorId, 10])));
    const thrifty = createDispatchPolicy(
      parkingProfile('predicted-demand', { repositionThresholdS: 600 }),
    );

    const plan = prepositionPlan(thrifty, cars, 0, { entranceFloorIds, predictor });
    expect(movesOf(plan)).toEqual([]);
    expect(plan.every((decision) => decision.reason === 'below-threshold')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * The resolved context
 * -------------------------------------------------------------------------- */

describe('the reposition context a bank is planned against', () => {
  it('lets a supplied partition outrank the computed one', () => {
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '10')];
    const resolved = resolvePrepositionContext(cars, 0, {
      zones: new Map([['A', ['3', '4']]]),
    });
    expect(resolved.zones.get('A')).toEqual(['3', '4']);
    expect(resolved.zones.get('B')).toBeUndefined();
  });

  it('omits what nobody supplied rather than passing undefined through', () => {
    const cars = [snapshotAt('A', '0')];
    const resolved = resolvePrepositionContext(cars, 0);
    const context = repositionContextFor(cars[0] as CarSnapshot, resolved);

    expect(Object.hasOwn(context, 'entranceFloorIds')).toBe(false);
    expect(Object.hasOwn(context, 'demandForecast')).toBe(false);
    expect(context.zoneFloorIds?.length).toBe(21);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it('carries a horizon only when one was asked for', () => {
    const cars = [snapshotAt('A', '0')];
    expect(resolvePrepositionContext(cars, 0).horizonS).toBeUndefined();
    expect(resolvePrepositionContext(cars, 0, { horizonS: -5 }).horizonS).toBeUndefined();
    expect(resolvePrepositionContext(cars, 0, { horizonS: Number.NaN }).horizonS).toBeUndefined();
    expect(resolvePrepositionContext(cars, 0, { horizonS: 45 }).horizonS).toBe(45);
  });

  it('is the same resolution stage 3 gets, so a bank cannot disagree with itself', () => {
    // `terms/observation.ts` requires one forecast to serve both `predictedDemand` (stage 3) and
    // `predicted-demand` parking (stage 7). Two resolutions would be two futures.
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '10')];
    const predictor = fixedForecast(new Map([['18', 40]]));
    const stage3 = groupContext(cars, 0, { predictor, waitingPassengers: 5 });
    const stage7 = resolvePrepositionContext(cars, 0, { predictor });

    expect(stage3.demandForecast).toEqual(stage7.demandForecast);
    expect(stage3.zoneFloorIdsByCarId).toEqual(stage7.zones);
    expect(stage3.waitingPassengers).toBe(5);
  });
});

/* -------------------------------------------------------------------------- *
 * Determinism
 * -------------------------------------------------------------------------- */

describe('a parking plan is a deterministic function of its inputs', () => {
  it('is identical over a hundred runs', async () => {
    const cars = await midtownBank(['P1', 'G', '10', '20']);
    const policy = createDispatchPolicy(parkingProfile('zone-center'));
    let expected: string | undefined;

    for (let run = 0; run < 100; run += 1) {
      const fingerprint = JSON.stringify(prepositionPlan(policy, cars, 0));
      expected ??= fingerprint;
      expect(fingerprint).toBe(expected);
    }
  });

  it('leaves a car that is not idle alone whatever the strategy says', () => {
    const busy = makeCar('A', '0');
    busy.assignHallCall({
      id: 'h',
      floorId: '18',
      floorIndex: 18,
      direction: 'up',
      registeredAt: 0,
    });
    const plan = prepositionPlan(
      createDispatchPolicy(parkingProfile('predicted-demand')),
      [busy.snapshot(0)],
      0,
      { predictor: fixedForecast(new Map([['10', 5]])) },
    );
    expect(plan[0]?.move).toBe(false);
    expect(plan[0]?.reason).toBe('busy');
  });
});

/* -------------------------------------------------------------------------- *
 * The real predictor
 * -------------------------------------------------------------------------- */

describe('the learned arrival model drives predicted-demand without an adapter', () => {
  /**
   * The reconciliation, asserted rather than assumed.
   *
   * `dispatch/predictor` is a separate module written against a separate brief, and the only thing
   * holding the two together is that its read-only `DemandForecast` face satisfies
   * {@link DemandForecastSource} **structurally** — one shared method,
   * `expectedDemandByFloor(fromT, horizonS?)`, which that module documents as *"exactly the shape
   * `RepositionContext.demandForecast` wants"*. No adapter, no import in either direction beyond a
   * type, and this test is what would fail if either side drifted.
   */
  async function observedModel(): Promise<ArrivalModel> {
    const cars = await midtownBank(['G']);
    const model = createArrivalModel({
      floorIds: (cars[0] as CarSnapshot).shaft.floors.map((floor) => floor.id),
    });
    // A down-peak concentrated on one high floor, observed in time order. Nothing here can express
    // an arrival that has not happened yet, which is the predictor's own causality guarantee.
    for (let at = 0; at < 1800; at += 5) {
      model.observe('18', 'down', at);
      if (at % 200 === 0) model.observe('4', 'up', at);
    }
    return model;
  }

  it('is accepted as a forecast source with no translation', async () => {
    const model = await observedModel();
    const source: DemandForecastSource = model;
    const forecast = source.expectedDemandByFloor(1800);

    expect(forecast.size).toBeGreaterThan(1);
    // Every floor the model reports on is present, including ones no arrival was seen at: "no
    // evidence" is not "no demand", and a floor missing from the map is a floor stage 7 would never
    // park on.
    expect(forecast.has('18')).toBe(true);
    expect(forecast.has('10')).toBe(true);
  });

  it('parks cars on the floor its forecast peaks at', async () => {
    const model = await observedModel();
    const cars = await midtownBank(['G', 'G', 'G', 'G']);
    const at = 1800;

    const forecast = model.expectedDemandByFloor(at);
    let peakFloorId: string | undefined;
    let peak = -1;
    for (const [floorId, expected] of forecast) {
      if (expected > peak) {
        peak = expected;
        peakFloorId = floorId;
      }
    }
    expect(peakFloorId).toBe('18');

    const plan = prepositionPlan(
      createDispatchPolicy(parkingProfile('predicted-demand')),
      cars,
      at,
      { entranceFloorIds: ['G', 'P1'], predictor: model },
    );

    expect(parkingFloorIds(plan)).toEqual([peakFloorId]);
    expect(movesOf(plan).length).toBe(cars.length);
  });

  it('goes back to the prior when the model is reset, as a replication needs', async () => {
    const model = await observedModel();
    expect(model.expectedDemandByFloor(1800).get('18') as number).toBeGreaterThan(
      model.expectedDemandByFloor(1800).get('10') as number,
    );
    model.reset();
    // A flat prior has no peak, so `predicted-demand` picks the first floor with the maximum rather
    // than the floor a previous replication happened to learn. Independence, in stage 7's terms.
    const flat = model.expectedDemandByFloor(1800);
    expect(flat.get('18')).toBe(flat.get('10'));
  });
});

/* -------------------------------------------------------------------------- *
 * The stage-3 context
 * -------------------------------------------------------------------------- */

describe('the group controller hands stage 3 the facts only it holds', () => {
  it('carries the partition and the forecast in the shapes the terms declare', () => {
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '10')];
    const context = groupContext(cars, 0, {
      predictor: fixedForecast(new Map([['18', 40]])),
      waitingPassengers: 5,
      waitingMassKg: 375,
    });

    // Exactly `TermObservation.zoneFloorIdsByCarId` and `TermObservation.demandForecast`.
    expect(context.zoneFloorIdsByCarId?.get('A')?.length).toBe(10);
    expect(context.demandForecast?.get('18')).toBe(40);
    expect(context.waitingPassengers).toBe(5);
    expect(context.waitingMassKg).toBe(375);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it('omits a forecast nobody supplied rather than inventing an empty one', () => {
    const context = groupContext([snapshotAt('A', '0')], 0);
    expect(Object.hasOwn(context, 'demandForecast')).toBe(false);
    expect(Object.hasOwn(context, 'waitingPassengers')).toBe(false);
  });

  it('attaches one landing’s counts to a shared per-pass context', () => {
    // The split that makes it affordable: the partition and the forecast are resolved once per pass
    // and the two per-call numbers are attached per call.
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '10')];
    const shared = groupContext(cars, 0, { predictor: fixedForecast(new Map([['18', 40]])) });

    const first = withLandingCounts(shared, 12, 900);
    const second = withLandingCounts(shared, 3);

    expect(first.waitingPassengers).toBe(12);
    expect(first.waitingMassKg).toBe(900);
    expect(second.waitingPassengers).toBe(3);
    expect(Object.hasOwn(second, 'waitingMassKg')).toBe(false);
    // Same partition, same forecast, by reference.
    expect(first.zoneFloorIdsByCarId).toBe(shared.zoneFloorIdsByCarId);
    expect(second.demandForecast).toBe(shared.demandForecast);
    // And the shared context is untouched.
    expect(Object.hasOwn(shared, 'waitingPassengers')).toBe(false);
  });

  it('is accepted by every policy method that takes a DispatchContext', () => {
    // The forward-compatibility claim: the two extra fields are dropped today by
    // `observationFor`, and the call sites compile and behave identically either way.
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '10')];
    const policy = createDispatchPolicy(parkingProfile('stay'));
    const subject = { ...call('9', 'up') };
    const context = withLandingCounts(groupContext(cars, 0, { predictor: fixedForecast(new Map()) }), 4);

    policy.register(subject, 0, context);
    const decision = policy.dispatch(subject.id, cars, 0, context);
    expect(decision.outcome).toBe('assigned');
    expect(decision.boardingPassengersPerCar).toBe(4);
  });
});
