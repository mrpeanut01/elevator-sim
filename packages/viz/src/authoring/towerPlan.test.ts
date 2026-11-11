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

import {
  PLAN_TEMPLATES,
  autoPopulationAt,
  baysAt,
  blankPlan,
  buildingFromPlan,
  deckPairingOf,
  groupsOf,
  layoutOf,
  orphanFloorsOf,
  pairedOnlyGroupsOf,
  planAnalysisOf,
  planFromBuilding,
  planTotalPopulation,
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
  withEscalatorToggled,
  withFloors,
  withPopulation,
  withShaftAdded,
  withShafts,
  withSkyLobbyToggled,
  withStopToggled,
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

const first = (plan: TowerPlan): string => (plan.shafts[0] as PlanShaft).key;

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
});
