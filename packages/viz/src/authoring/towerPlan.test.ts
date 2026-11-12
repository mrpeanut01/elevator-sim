/**
 * **The tower plan, held to the loader and to the run.**
 *
 * Three things are asserted, in the order they would fail:
 *
 * 1. **Every template and every shipped building becomes a document the loader builds.** A plan is
 *    worth nothing if `parseBuilding` or `resolveBuilding` refuses what it writes.
 * 2. **The massing rule** — the tallest shafts are the core, shorter ones alternate sides, and a
 *    wider floor holds more people by default.
 * 3. **Every control reaches the run, compared on the legs.** This is the repository's standing
 *    requirement, applied to each thing the plan can say that `BuildingSpec` could not: a shaft's
 *    height, its service pattern, a second deck, a second car in the hoistway, a sky lobby, an
 *    escalator, a floor's people. A control that changed the document and not the run would be the
 *    defect `docs/05-roadmap.md`'s standing requirement counts instances of.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  WARNING_CODES,
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type DispatcherProfile,
  type ElevatorSpecs,
  type SimulationConfig,
  type TrafficProfiles,
} from '@elevator-sim/core';

import { BUILDING_IDS } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import { escalatorCapacityChoices } from './buildingSpec.js';

import {
  PLAN_TEMPLATES,
  autoPopulationAt,
  baysAt,
  blankPlan,
  buildingFromPlan,
  deckPairingOf,
  escalatorAbove,
  escalatorCarriesLiftJourneys,
  groupsOf,
  layoutOf,
  orphanFloorsOf,
  pairedOnlyGroupsOf,
  planAnalysisOf,
  planFromBuilding,
  planTotalPopulation,
  podiumPlan,
  rescueLobbyFor,
  shaftLabelOf,
  skyLobbyPlan,
  stopsOf,
  strandedFloorsOf,
  supertallPlan,
  unpairedDeckStopsOf,
  withAutoZones,
  withCars,
  withDecks,
  withEscalatorCapacity,
  withEscalatorToggled,
  withFloors,
  withPopulation,
  withShaftAdded,
  withShafts,
  withSkyLobbyToggled,
  stairsAbove,
  withAccessZoneAdded,
  withAccessZoneRemoved,
  withDescentSpeed,
  withEscalatorSeconds,
  withPanel,
  withStairsAdded,
  withStopToggled,
  withTransportModeRemoved,
  withWing,
  zonedTowerPlan,
  type PlanShaft,
  type TowerPlan,
} from './towerPlan.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const SPECS: ElevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
const TRAFFIC: TrafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
const PROFILES = parseDispatcherProfiles(read('dispatcher-profiles.json'));
const ETA = PROFILES.profiles.find((profile) => profile.id === 'eta') as DispatcherProfile;

function configFor(plan: TowerPlan, overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  const file = `${plan.id}.json`;
  const building = resolveBuilding(parseBuilding(buildingFromPlan(plan, SPECS) as unknown, file), SPECS, { file });
  return {
    building,
    dispatcherProfile: ETA,
    trafficProfiles: TRAFFIC,
    elevatorSpecs: SPECS,
    dispatcherProfiles: PROFILES,
    seed: 20261111n,
    durationS: 600,
    onTimeout: 'report',
    ...overrides,
  };
}

/** Who was carried by which car and when — the legs, never a window statistic. */
function legsOf(plan: TowerPlan, overrides: Partial<SimulationConfig> = {}): string {
  return JSON.stringify(
    recordRun(configFor(plan, overrides), { recordDecisions: false }).recording.legs.map((leg) => [
      leg.passengerId,
      leg.carId ?? '',
      leg.boardedAt ?? -1,
    ]),
  );
}

/** The same run, by when each leg ended: a walk or a ride on an escalator has no car and no boarding. */
function arrivalsOf(plan: TowerPlan): string {
  return JSON.stringify(
    recordRun(configFor(plan), { recordDecisions: false }).recording.legs.map((leg) => [
      leg.passengerId,
      leg.carId ?? '',
      leg.alightedAt ?? -1,
    ]),
  );
}

const first = (plan: TowerPlan): string => (plan.shafts[0] as PlanShaft).key;

/**
 * A two-level lobby, made with the board's own edits: every shaft's lobby door closed, floor 1 a
 * sky lobby, and an escalator from the street up to it. The one arrangement in which an escalator
 * is on the way to a lift, which no template ships.
 */
function mezzanineLobby(): TowerPlan {
  const base = zonedTowerPlan();
  const closed = base.shafts.reduce((plan, shaft) => withStopToggled(plan, shaft.key, 0), base);
  return withEscalatorToggled(withSkyLobbyToggled(closed, [1]), 0);
}

describe('every plan becomes a building the loader builds', () => {
  for (const template of PLAN_TEMPLATES) {
    it(`template "${template.id}" loads, strands nobody and orphans no floor`, () => {
      const plan = template.make();
      const analysis = planAnalysisOf(plan, SPECS);
      expect(analysis.refusals).toEqual([]);
      expect(orphanFloorsOf(plan)).toEqual([]);
      expect(strandedFloorsOf(plan)).toEqual([]);
      expect(unpairedDeckStopsOf(plan)).toEqual([]);
      /*
       * The plan's own reachability answer, held to the loader's. `strandedFloorsOf` is a search
       * over a plan; `resolveBuilding` runs `core`'s connectivity model over the document. A
       * template the plan calls sound and the loader calls unreachable would mean the mirror had
       * stopped mirroring.
       */
      const codes = (analysis.resolved?.warnings ?? []).map((warning) => warning.code);
      expect(codes).not.toContain(WARNING_CODES.unreachableFromEntrance);
      expect(analysis.banks.length).toBe(groupsOf(plan).length);
    });
  }

  it('opens every shipped building, and what it writes loads and serves the same floors', () => {
    for (const id of BUILDING_IDS) {
      const config = parseBuilding(read(`buildings/${id}.json`));
      const shipped = resolveBuilding(config, SPECS);
      const { plan } = planFromBuilding(config, id);
      const analysis = planAnalysisOf(plan, SPECS);
      expect(analysis.refusals, id).toEqual([]);
      const resolved = analysis.resolved;
      if (resolved === undefined) throw new Error(`${id} did not resolve`);
      /* Nobody moved in or out: the total is the document's, to the person. */
      expect(planTotalPopulation(plan), id).toBe(shipped.totalPopulation);
      /* The same number of cars, and each bank's stop count survives — stop lists with gaps included. */
      const carsOf = (building: typeof shipped): number =>
        building.banks.reduce((total, bank) => total + bank.cars.length, 0);
      expect(carsOf(resolved), id).toBe(carsOf(shipped));
      const stopCounts = (building: typeof shipped): readonly number[] =>
        building.banks.flatMap((bank) => bank.cars.map(() => bank.servesFloors.length)).sort((a, b) => a - b);
      expect(stopCounts(resolved), id).toEqual(stopCounts(shipped));
      const decked = (building: typeof shipped): number =>
        building.banks.reduce((total, bank) => total + bank.cars.filter((car) => car.doubleDeck).length, 0);
      expect(decked(resolved), id).toBe(decked(shipped));
    }
  });
});

describe('the massing rule', () => {
  it('puts the tallest shafts in the core and alternates shorter ones left then right', () => {
    let plan = blankPlan();
    plan = withShaftAdded(plan, 0, 8);
    plan = withShaftAdded(plan, 0, 8);
    plan = withShaftAdded(plan, 0, 5);
    plan = withShaftAdded(plan, 0, 3);
    const layout = layoutOf(plan);
    expect(layout.structures.map((structure) => [structure.side, structure.top, structure.shaftKeys.length])).toEqual([
      ['left', 3, 1],
      ['left', 8, 2],
      ['core', 12, 4],
      ['right', 5, 1],
    ]);
    /* Left to right the columns never overlap, and every shaft has one. */
    const columns = plan.shafts.map((shaft) => layout.columnByShaft[shaft.key]);
    expect(new Set(columns).size).toBe(plan.shafts.length);
  });

  it('makes a wider floor hold more people than a floor of the bare tower', () => {
    const plan = withShaftAdded(withShaftAdded(blankPlan(), 0, 4), 0, 4);
    const layout = layoutOf(plan);
    expect(baysAt(plan, layout, 2)).toBe(6);
    expect(baysAt(plan, layout, 9)).toBe(4);
    expect(autoPopulationAt(plan, layout, 2)).toBeGreaterThan(autoPopulationAt(plan, layout, 9));
    /* A lobby and a sky lobby hold nobody until somebody says otherwise. */
    expect(autoPopulationAt(plan, layout, 0)).toBe(0);
    expect(autoPopulationAt(withSkyLobbyToggled(plan, [6]), layout, 6)).toBe(0);
  });

  it('keeps the core at the roof when the tower is made taller', () => {
    const taller = withFloors(withShaftAdded(blankPlan(), 0, 5), 20);
    expect(taller.shafts.filter((shaft) => shaft.top === 20)).toHaveLength(4);
    expect(taller.shafts.filter((shaft) => shaft.top === 5)).toHaveLength(1);
    expect(orphanFloorsOf(taller)).toEqual([]);
  });

  it('stands two blocks of one height on opposite sides, as two groups, and reads them back', () => {
    const podium = podiumPlan();
    const one = layoutOf(podium).structures.filter((structure) => structure.top === 3);
    expect(one.map((structure) => structure.shaftKeys.length)).toEqual([3]);

    const split = withWing(podium, ['s5', 's9'], 1);
    const two = layoutOf(split).structures.filter((structure) => structure.top === 3);
    expect(two.map((structure) => [structure.side, structure.shaftKeys.length])).toEqual([
      ['left', 1],
      ['right', 2],
    ]);
    expect(groupsOf(split)).toHaveLength(groupsOf(podium).length + 1);
    /* The floors are as wide as before: a block moved across the building is the same plate. */
    expect(planTotalPopulation(split)).toBe(planTotalPopulation(podium));

    const reopened = planFromBuilding(buildingFromPlan(split, SPECS), split.id).plan;
    expect(layoutOf(reopened).structures.map((structure) => [structure.side, structure.top, structure.shaftKeys.length])).toEqual(
      layoutOf(split).structures.map((structure) => [structure.side, structure.top, structure.shaftKeys.length]),
    );
    expect(withWing(split, ['s5', 's9'], 0)).toEqual(podium);
  });

  it('labels shafts past the twenty-sixth without repeating a letter', () => {
    expect([0, 25, 26, 27, 52].map(shaftLabelOf)).toEqual(['A', 'Z', 'AA', 'AB', 'BA']);
  });
});

describe('service patterns', () => {
  const plan = skyLobbyPlan();
  const shaft = (service: PlanShaft['service'], rest: Partial<PlanShaft> = {}): PlanShaft => ({
    ...(plan.shafts[0] as PlanShaft),
    bottom: 0,
    top: 30,
    service,
    ...rest,
  });

  it('deals each pattern its own stops', () => {
    expect(stopsOf(plan, shaft('local'))).toHaveLength(31);
    expect(stopsOf(plan, shaft('express', { zoneLow: 21 }))).toEqual([0, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
    expect(stopsOf(plan, shaft('shuttle'))).toEqual([0, 30]);
    expect(stopsOf(plan, shaft('shuttle', { top: 60 }))).toEqual([0, 30, 60]);
    expect(stopsOf(plan, shaft('custom', { stops: [0, 7, 19, 44] }))).toEqual([0, 7, 19]);
  });

  it('widens a double-deck landing to the pair, and pairs it lower deck first', () => {
    const decked = stopsOf(plan, shaft('shuttle', { decks: 2 }));
    expect(decked).toEqual([0, 1, 29, 30]);
    expect(deckPairingOf(decked)).toEqual({ pairs: [[0, 1], [29, 30]], unpaired: [] });
    expect(deckPairingOf([0, 1, 5, 8, 9])).toEqual({ pairs: [[0, 1], [8, 9]], unpaired: [5] });
  });

  it('turns a hand-closed floor into a custom list that starts from the pattern', () => {
    const closed = withStopToggled(blankPlan(), first(blankPlan()), 7);
    const edited = closed.shafts[0] as PlanShaft;
    expect(edited.service).toBe('custom');
    expect(stopsOf(closed, edited)).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
    /* One shaft with different doors is a group of its own: the bank split, visible. */
    expect(groupsOf(closed)).toHaveLength(2);
  });

  it('zones a tower in one press, and the lower zone becomes a wing', () => {
    const zoned = withAutoZones(withFloors(blankPlan(), 24), 2);
    expect(groupsOf(zoned)).toHaveLength(2);
    expect(orphanFloorsOf(zoned)).toEqual([]);
    expect(strandedFloorsOf(zoned)).toEqual([]);
    expect(layoutOf(zoned).structures.map((structure) => structure.side)).toEqual(['left', 'core']);
  });
});

describe('what is wrong with a drawing is found before the loader is asked', () => {
  it('names a floor no shaft opens at, and a floor with a shaft nobody can reach', () => {
    const plan = skyLobbyPlan();
    /* Take the dot off the sky lobby: the upper locals still open at 30, and nobody may change there. */
    const cut = withSkyLobbyToggled(plan, [30]);
    expect(strandedFloorsOf(cut)).toHaveLength(30);
    expect(rescueLobbyFor(cut, 45)).toBe(30);
    expect(strandedFloorsOf(withSkyLobbyToggled(cut, [30]))).toEqual([]);
    /* Lower every shaft's reach by one floor and the top floor has no doors at all. */
    const short = { ...blankPlan(), floors: 13 };
    expect(orphanFloorsOf(short)).toEqual([13]);
  });

  it('refuses a group made only of two-car shafts, and accepts one with an ordinary shaft beside them', () => {
    const plan = blankPlan();
    const all = withCars(plan, plan.shafts.map((shaft) => shaft.key), 2);
    expect(pairedOnlyGroupsOf(all)).toHaveLength(1);
    expect(pairedOnlyGroupsOf(withCars(plan, [first(plan)], 2))).toEqual([]);
  });

  it('never leaves two decks and two cars on one shaft', () => {
    const plan = blankPlan();
    const key = first(plan);
    const both = withDecks(withCars(plan, [key], 2), [key], 2).shafts[0] as PlanShaft;
    expect([both.decks, both.cars]).toEqual([2, 1]);
    const other = withCars(withDecks(plan, [key], 2), [key], 2).shafts[0] as PlanShaft;
    expect([other.decks, other.cars]).toEqual([1, 2]);
  });
});

describe('the drawing board is not decoration — every control moves the legs', () => {
  const base = zonedTowerPlan();
  const control = legsOf(base);

  it('carries people at all, so an equal fingerprint could not be two empty runs', () => {
    expect((JSON.parse(control) as unknown[]).length).toBeGreaterThan(50);
  });

  it('a shaft made shorter changes the run', () => {
    const key = first(base);
    expect(legsOf(withShafts(base, [key], (shaft) => ({ ...shaft, top: 12 })))).not.toBe(control);
  });

  it('a service pattern changes the run', () => {
    const express = (base.shafts[4] as PlanShaft).key;
    expect(legsOf(withShafts(base, [express], (shaft) => ({ ...shaft, service: 'local' })))).not.toBe(control);
  });

  it('a hand-closed stop changes the run', () => {
    expect(legsOf(withStopToggled(base, first(base), 9))).not.toBe(control);
  });

  it('a different machine in one shaft changes the run', () => {
    const key = first(base);
    const slower = withShafts(base, [key], (shaft) => ({
      ...shaft,
      machine: { ...shaft.machine, ratedSpeedMps: 2.5 },
    }));
    expect(legsOf(slower)).not.toBe(control);
  });

  it('people set by hand on one floor change the run', () => {
    expect(legsOf(withPopulation(base, [10], 400))).not.toBe(control);
  });

  it('a second car in one hoistway changes the run, and the loader builds the pair', () => {
    const paired = withCars(base, [first(base)], 2);
    const analysis = planAnalysisOf(paired, SPECS);
    expect(analysis.refusals).toEqual([]);
    const shafts = analysis.resolved?.banks.flatMap((bank) => bank.shafts) ?? [];
    expect(shafts.filter((shaft) => shaft.carIds.length === 2)).toHaveLength(1);
    expect(shafts.find((shaft) => shaft.carIds.length === 2)?.separation).toBeDefined();
    expect(legsOf(paired)).not.toBe(control);
  });

  it('a pair is written with a sector boundary, so nobody is left aboard or waiting', () => {
    /*
     * `docs/11` § 3.2's R1. Without a boundary a pair under up/down buttons runs the free regime,
     * in which each car boards riders bound past its mate and the shaft ends the run with people
     * still in the cars (`sim/twinShaftSector.test.ts`). The board writes the middle stop of the
     * group, and the assertion is on the legs: every rider who arrived was carried and put down.
     */
    const paired = withCars(zonedTowerPlan(), ['s1'], 2);
    const bank = planAnalysisOf(paired, SPECS).resolved?.banks.find((entry) =>
      entry.shafts.some((shaft) => shaft.carIds.length === 2),
    );
    const pair = bank?.shafts.find((shaft) => shaft.carIds.length === 2);
    expect(pair?.sectorBoundaryFloorId).toBe('10');
    expect(bank?.servesFloors).toContain(pair?.sectorBoundaryFloorId);

    const run = recordRun(configFor(paired, { seed: 7000n, durationS: 1800 }), { recordDecisions: false });
    const legs = run.recording.legs;
    expect(legs.filter((leg) => leg.boardedAt !== undefined && leg.alightedAt === undefined)).toEqual([]);
    expect(legs.filter((leg) => leg.boardedAt === undefined && leg.alightedAt === undefined)).toEqual([]);
    expect(legs.some((leg) => leg.carId === 'bank-1-A1')).toBe(true);
    expect(legs.some((leg) => leg.carId === 'bank-1-A2')).toBe(true);
    expect(JSON.stringify(run.result.warnings)).not.toContain('free regime');
  });

  it('a block stood apart is a group of its own, and the run changes', () => {
    const podium = podiumPlan();
    expect(legsOf(withWing(podium, ['s5', 's9'], 1))).not.toBe(legsOf(podium));
  });

  it('a slower descent changes the run, and a limit at the rated speed is no limit', () => {
    const key = first(base);
    const rated = (base.shafts[0] as PlanShaft).machine.ratedSpeedMps;
    const limited = withDescentSpeed(base, [key], rated / 2);
    expect(planAnalysisOf(limited, SPECS).refusals).toEqual([]);
    expect(legsOf(limited)).not.toBe(control);
    expect(withDescentSpeed(limited, [key], rated)).toEqual(base);
    expect(withDescentSpeed(limited, [key], undefined)).toEqual(base);
  });

  it('floors kept for one group change the run, and lifting the zone restores it', () => {
    const kept = withAccessZoneAdded(base, [30, 31, 32], 'tenants');
    expect(planAnalysisOf(kept, SPECS).refusals).toEqual([]);
    expect(legsOf(kept)).not.toBe(control);
    expect(withAccessZoneAdded(base, [30], '  ')).toBe(base);
    const zone = kept.accessZones[0]?.id ?? '';
    expect(legsOf(withAccessZoneRemoved(kept, zone))).toBe(control);
  });

  it('a stair changes the run, is written as set by hand, and is refused without all four numbers', () => {
    const stairs = { upS: 26, downS: 19, up: 0.9, down: 0.9 };
    const walked = withStairsAdded(base, 0, stairs);
    expect(planAnalysisOf(walked, SPECS).refusals).toEqual([]);
    expect(arrivalsOf(walked)).not.toBe(arrivalsOf(base));
    const written = buildingFromPlan(walked, SPECS).transportModes?.[0];
    expect(written?.kind).toBe('stairs');
    expect(written?.$comment).toContain('NOT cited');
    /* A climb quicker than the walk down, a share past one, and a blank are each no stair at all. */
    expect(withStairsAdded(base, 0, { ...stairs, upS: 10 })).toBe(base);
    expect(withStairsAdded(base, 0, { ...stairs, down: 1.2 })).toBe(base);
    expect(withStairsAdded(base, 0, { ...stairs, up: Number.NaN })).toBe(base);
    expect(stairsAbove(walked, 0)?.id).toBe(written?.id);
    expect(escalatorAbove(walked, 0)).toBeUndefined();
    expect(withTransportModeRemoved(walked, written?.id ?? '')).toEqual(base);
  });

  it('a landing panel is written on its floor and read back', () => {
    const panelled = withPanel(base, [0], 'destination-entry');
    const config = buildingFromPlan(panelled, SPECS);
    expect(config.floors?.find((floor) => floor.index === 0)?.landingCallType).toBe('destination-entry');
    expect(planFromBuilding(config, panelled.id).plan.panelByFloor).toEqual({ 0: 'destination-entry' });
    expect(planFromBuilding(config, panelled.id).notCarried).toEqual([]);
    expect(withPanel(panelled, [0], undefined)).toEqual(base);
    expect(planAnalysisOf(panelled, SPECS).refusals).toEqual([]);
    /*
     * A panel changes what a call discloses, so it moves the run only under a controller that reads
     * the destination. Under `eta` it moves nothing, and the board's hint says so.
     */
    expect(legsOf(panelled)).toBe(control);
    const reader = PROFILES.profiles.find((profile) => profile.id === 'destination-eta') as DispatcherProfile;
    /* And there the lobby already has one, so it is taking the panel away that changes the run. */
    expect(legsOf(panelled, { dispatcherProfile: reader })).toBe(legsOf(base, { dispatcherProfile: reader }));
    const buttoned = withPanel(base, [0], 'up-down-buttons');
    expect(legsOf(buttoned, { dispatcherProfile: reader })).not.toBe(legsOf(base, { dispatcherProfile: reader }));
  });

  it('an escalator made slower changes the run where a journey has to take it', () => {
    /* The upper group boards one floor up, so everybody bound for it rides the escalator first. */
    const upper = base.shafts.filter((shaft) => shaft.service === 'express').map((shaft) => shaft.key);
    expect(upper.length).toBeGreaterThan(0);
    const mezzanine = withEscalatorToggled(
      withSkyLobbyToggled(withShafts(base, upper, (shaft) => ({ ...shaft, bottom: 1 })), [1]),
      0,
    );
    expect(planAnalysisOf(mezzanine, SPECS).refusals).toEqual([]);
    expect(strandedFloorsOf(mezzanine)).toEqual([]);
    const slow = withEscalatorSeconds(mezzanine, 0, 120);
    expect(escalatorAbove(slow, 0)?.traversalTimeS).toBe(120);
    expect(legsOf(slow)).not.toBe(legsOf(mezzanine));
    /* Where a lift opens on both ends of an escalator the lift is the route, and the seconds move nothing. */
    const podium = podiumPlan();
    expect(legsOf(withEscalatorSeconds(podium, 0, 120))).toBe(legsOf(podium));
  });

  it('publishes no interval for the group that holds a pair, and still publishes the others', () => {
    /* The closed form counts the pair as two free cars; measured 2026-11-11 it improved while the run did not. */
    const before = planAnalysisOf(base, SPECS).banks;
    expect(before.every((bank) => bank.figures !== undefined)).toBe(true);
    const after = planAnalysisOf(withCars(base, [first(base)], 2), SPECS).banks;
    expect(after[0]?.figures).toBeUndefined();
    expect(after[0]?.refusal).toContain('two cars in one shaft');
    expect(after.slice(1).map((bank) => bank.figures)).toEqual(before.slice(1).map((bank) => bank.figures));
  });

  it('a second deck changes the run, on the building that has double-deck shuttles', () => {
    const tall = supertallPlan();
    const shuttles = tall.shafts.filter((shaft) => shaft.decks === 2).map((shaft) => shaft.key);
    expect(shuttles.length).toBeGreaterThan(0);
    const single = withDecks(tall, shuttles, 1);
    expect(planAnalysisOf(single, SPECS).refusals).toEqual([]);
    expect(legsOf(single)).not.toBe(legsOf(tall));
  });

  it('a sky lobby and an escalator each change the run', () => {
    const sky = skyLobbyPlan();
    const skyControl = legsOf(sky);
    /* Without the transfer flag nobody may change at 30, so the upper half generates no lobby trip. */
    expect(legsOf(withSkyLobbyToggled(sky, [30]))).not.toBe(skyControl);
    expect(legsOf(withEscalatorToggled(sky, 0))).not.toBe(skyControl);
  });

  it('an escalator’s carrying capacity changes the run where riders are routed over it, and only there', () => {
    /*
     * § D1632. The edit is the one the board's chip makes — a row of the reference table — and
     * the comparison is on the legs. The plan is a two-level lobby drawn on the board: the lifts
     * start one floor up, at a sky lobby, and the escalator is the only way to them from the
     * street. Riders are routed over it; those who reach it together step on a slot apart and the
     * lifts beyond are boarded at different instants.
     */
    const tall = mezzanineLobby();
    const narrowest = escalatorCapacityChoices(SPECS.escalatorCapacity)[0];
    if (narrowest === undefined) throw new Error('the reference table has no 0.5 m/s row');
    const analysisTall = planAnalysisOf(tall, SPECS);
    expect(analysisTall.refusals).toEqual([]);
    const resolvedTall = analysisTall.resolved;
    const lobby = escalatorAbove(tall, 0);
    if (resolvedTall === undefined || lobby === undefined) throw new Error('the plan did not build');
    expect(escalatorCarriesLiftJourneys(resolvedTall, lobby.id)).toBe(true);
    const uncapped = legsOf(tall);
    const capped = withEscalatorCapacity(tall, 0, narrowest.personsPerHour);
    expect(planAnalysisOf(capped, SPECS).refusals).toEqual([]);
    expect(legsOf(capped)).not.toBe(uncapped);
    expect(legsOf(withEscalatorCapacity(capped, 0, undefined))).toBe(uncapped);

    // The document says what the figure is and where it is from, because this board had the table.
    const written = buildingFromPlan(capped, SPECS).transportModes?.find((mode) => mode.id === lobby.id);
    expect(written?.capacityPersonsPerHour).toBe(narrowest.personsPerHour);
    expect(written?.$comment).toContain('CITED as the row');
    for (const mode of buildingFromPlan(tall, SPECS).transportModes ?? []) {
      expect(mode).not.toHaveProperty('capacityPersonsPerHour');
    }

    /*
     * **And the other half, pinned by a run and not by the sentence that states it** (§ D227).
     * On the sky-lobby template an escalator above the lobby joins two floors the same lifts
     * already join, so no lift journey is routed over it — and a limit there, even one rider an
     * hour, moves no leg at all. The board says so; this is what makes that true.
     */
    const drawn = withEscalatorToggled(skyLobbyPlan(), 0);
    const resolvedDrawn = planAnalysisOf(drawn, SPECS).resolved;
    const idle = escalatorAbove(drawn, 0);
    if (resolvedDrawn === undefined || idle === undefined) throw new Error('the template did not build');
    expect(escalatorCarriesLiftJourneys(resolvedDrawn, idle.id)).toBe(false);
    expect(legsOf(withEscalatorCapacity(drawn, 0, 1))).toBe(legsOf(drawn));
    // A floor with no escalator above it has nothing to set.
    expect(withEscalatorCapacity(drawn, 3, narrowest.personsPerHour)).toBe(drawn);
  });
});
