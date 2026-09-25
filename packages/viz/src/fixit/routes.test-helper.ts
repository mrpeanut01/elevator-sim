/**
 * **Every route a player can take through a fix case's editor, built without reading any repair's
 * role** — the role-blind enumeration two suites share.
 *
 * It was `theAnswerIsNotPrinted.test.ts`'s own (GitHub issues #566 and #568, § D869, re-pinned by
 * § D1020), and it moved here when a second reader needed it: [§ D1120](../../../../DECISIONS.md)'s
 * route census (`routeCensus.sweep.test.ts` and `routeCensus.test.ts`), which counts how many of
 * these routes clear the letter's morning, so the product can open a case with its diagnosis shown
 * where the search is a needle rather than a search. A copy would have been a second statement of
 * *what a player can do*, and the day the two drifted the census would count routes the survivor
 * suite never tries.
 */

import type { SimulationConfig } from '@elevator-sim/core/browser';

import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';

import { emptyFixitState, spendOf, topFloorRaisePriceUnits, zonePriceUnits } from './engine.js';
import {
  dialGroupsOf,
  dialOptionsOf,
  liveDialIdsOf,
  rezoneFabricOf,
  standingDialValuesOf,
} from './families.js';
import {
  fixitPlanRefusalOf,
  standingParkingOf,
  topFloorRaiseCeilingOf,
  zoneOverlapCeilingOf,
  type FixitResources,
} from './run.js';
import { EVERY_CAR, OUT_OF_SERVICE } from './types.js';
import type { EditorParkingStrategy, FixitCase, FixitState } from './types.js';

/** One thing a player can do, named the way the screen names it. */
export interface Route {
  readonly label: string;
  readonly state: FixitState;
}

/**
 * The three strategies the parking select offered when the routes below were first pinned. The
 * two § D1000 added are tried in {@link familyRoutesFor}, after every route pinned before them, so
 * a newly offered strategy can only replace a `repair:` row rather than silently reorder the table.
 */
const SECTION_10_3_PARKING: readonly EditorParkingStrategy[] = Object.freeze(['stay', 'lobby', 'zone-center']);

/**
 * Every route this suite will try, in one fixed order, **built without looking at any repair's
 * role**.
 *
 * The editor's own controls first — the five families `fixit/types.ts#FixitState` draws — and then
 * the repair rows, in the order the screen draws them
 * — until § D1020 retired the menu; now the diagnosed repair alone, last, as the witness. Anything the
 * budget refuses is dropped here rather than run, because a route a player cannot select is not a
 * route.
 */
export function routesFor(entry: FixitCase, asBuilt: SimulationConfig, resources: FixitResources): readonly Route[] {
  const schedule = shippedPriceSchedule();
  const standing = standingParkingOf(asBuilt);
  const zoneCeiling = zoneOverlapCeilingOf(asBuilt.building);
  const raiseCeiling = topFloorRaiseCeilingOf(asBuilt.building);
  const candidates: Route[] = [];
  for (const strategy of SECTION_10_3_PARKING) {
    if (strategy === standing) continue;
    candidates.push({
      label: `parking:${strategy}`,
      state: { ...emptyFixitState(), parkingStrategy: strategy },
    });
  }
  if (zonePriceUnits(schedule) <= entry.budgetUnits) {
    /* Every rung, not only the ceiling: `cases.test.ts` proves each one redraws a different run. */
    for (let floors = 1; floors <= zoneCeiling; floors += 1) {
      candidates.push({
        label: `zone:${String(floors)}`,
        state: { ...emptyFixitState(), zoneOverlapFloors: floors },
      });
    }
  }
  candidates.push({ label: 'speed:1', state: { ...emptyFixitState(), speedSteps: 1 } });
  candidates.push({ label: 'capacity:1', state: { ...emptyFixitState(), capacitySteps: 1 } });
  if (topFloorRaisePriceUnits(schedule) <= entry.budgetUnits) {
    for (let metres = 1; metres <= raiseCeiling; metres += 1) {
      candidates.push({
        label: `raise:${String(metres)}`,
        state: { ...emptyFixitState(), topFloorRaiseM: metres },
      });
    }
  }
  /*
   * Two-control pairs, before the menu is reached: a player who has moved one dial and not cleared
   * the case moves a second, and `one-start-time` is the case that needs it — no single control
   * clears it and `parking:lobby` with one speed step does.
   */
  for (const strategy of SECTION_10_3_PARKING) {
    if (strategy === standing) continue;
    candidates.push({
      label: `parking:${strategy}+speed:1`,
      state: { ...emptyFixitState(), parkingStrategy: strategy, speedSteps: 1 },
    });
    if (zoneCeiling > 0) {
      candidates.push({
        label: `parking:${strategy}+zone:${String(zoneCeiling)}`,
        state: { ...emptyFixitState(), parkingStrategy: strategy, zoneOverlapFloors: zoneCeiling },
      });
    }
  }
  candidates.push(...familyRoutesFor(entry, asBuilt, resources));
  /*
   * **The menu's rows are no longer routes** — [§ D1020](../../../../DECISIONS.md) retired the menu,
   * so a player cannot press a repair row. What stays, last, is the witness: the diagnosed repair,
   * which `families.test.ts` proves the editor writes leg for leg. It is reached only where no
   * sampled editor route holds, and it is labelled `answer:` so the table says which rows are the
   * sample's finds and which are the witness standing in for a route the sample could not choose.
   */
  const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
  if (diagnosed !== undefined) {
    candidates.push({
      label: `answer:${diagnosed.id}`,
      state: { ...emptyFixitState(), selectedRepairIds: [diagnosed.id] },
    });
  }
  return candidates.filter(
    (route) =>
      spendOf(entry, route.state, schedule).totalUnits <= entry.budgetUnits &&
      fixitPlanRefusalOf(entry, route.state, resources) === undefined,
  );
}

/**
 * **§ D1000's families, one move each** — appended after § 10.3's controls and before the menu, so
 * the routes pinned before those families existed keep their place and a family can only replace a
 * `repair:` row, never an earlier editor route.
 *
 * Role-blind and generic, and deliberately a **sample** of the space rather than all of it, which
 * § D525 clause 3 requires the census to say: the two parking strategies the select gained (the
 * fixed floor at the lowest and the highest floor any bank serves), the door hold for every car at
 * the declared defaults and at the declared minimums, every **named** value of every categorical or
 * switch dial of the three dispatcher rows (a numeric dial has no finite list to walk, so none is
 * tried), every car moved into every other bank, a car out for works put back where the shipped
 * building runs it, and every bank that weighs against something other than its plate re-plated.
 * Keying a car and redrawing a bank's floors are not tried: each needs a floor set, and there is no
 * role-blind way to choose one.
 */
function familyRoutesFor(entry: FixitCase, asBuilt: SimulationConfig, resources: FixitResources): readonly Route[] {
  const schedule = shippedPriceSchedule();
  const empty = emptyFixitState();
  const routes: Route[] = [];
  routes.push({ label: 'parking:predicted-demand', state: { ...empty, parkingStrategy: 'predicted-demand' } });
  const servedFloors = asBuilt.building.floors.filter((floor) =>
    asBuilt.building.banks.some((bank) => bank.servesFloors.includes(floor.id)),
  );
  for (const floor of [servedFloors[0], servedFloors.at(-1)]) {
    if (floor === undefined) continue;
    routes.push({
      label: `parking:fixed-floor@${floor.id}`,
      state: { ...empty, parkingStrategy: 'fixed-floor', dispatcherDials: { 'idle.parkingFloorIndex': floor.index } },
    });
  }
  routes.push({ label: 'doors:5/3', state: { ...empty, doorDwell: { [EVERY_CAR]: { hallCallS: 5, carCallS: 3 } } } });
  routes.push({ label: 'doors:4/2', state: { ...empty, doorDwell: { [EVERY_CAR]: { hallCallS: 4, carCallS: 2 } } } });
  const standing = standingDialValuesOf(asBuilt.dispatcherProfile);
  const live = liveDialIdsOf(asBuilt.dispatcherProfile, {});
  for (const group of dialGroupsOf(schedule)) {
    for (const parameter of group.parameters) {
      if (parameter.type !== 'categorical' && parameter.type !== 'boolean') continue;
      if (!live.has(parameter.id)) continue;
      for (const option of dialOptionsOf(parameter, standing.get(parameter.id), asBuilt.building)) {
        routes.push({
          label: `dial:${parameter.id}=${String(option.value)}`,
          state: { ...empty, dispatcherDials: { [parameter.id]: option.value } },
        });
      }
    }
  }
  const shipped = resources.entries.find((candidate) => candidate.resolved.id === entry.buildingId)!.config;
  const fabric = rezoneFabricOf(asBuilt.building, shipped);
  for (const car of fabric.cars) {
    if (car.standingBankId === OUT_OF_SERVICE) {
      const home = (shipped.banks ?? []).find((bank) => bank.cars.some((candidate) => candidate.id === car.id));
      if (home !== undefined && fabric.banks.some((bank) => bank.id === home.id)) {
        routes.push({ label: `car:${car.id}->${home.id}`, state: { ...empty, carBanks: { [car.id]: home.id } } });
      }
      continue;
    }
    for (const bank of fabric.banks) {
      if (bank.id === car.standingBankId) continue;
      routes.push({ label: `car:${car.id}->${bank.id}`, state: { ...empty, carBanks: { [car.id]: bank.id } } });
    }
  }
  for (const bank of fabric.banks) {
    if (bank.offPlate) routes.push({ label: `plate:${bank.id}`, state: { ...empty, platedBankIds: [bank.id] } });
  }
  /* § D1001: every authored tenancy position, which is none on fifteen of the eighteen. */
  for (const cohort of entry.asBuilt.tenancy?.cohorts ?? []) {
    for (const position of cohort.positions) {
      routes.push({
        label: `tenancy:${cohort.id}=${position.id}`,
        state: { ...empty, tenancyPositions: { [cohort.id]: position.id } },
      });
    }
  }
  return routes;
}
