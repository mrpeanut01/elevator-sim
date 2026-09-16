/**
 * **The viewer's pre-fit and the server's are one kit** — GitHub issue #372, § D640.
 *
 * `data/chime-ledger.json`'s `rush-prefit` reaches a run through two different appliers, and that
 * is deliberate rather than tolerated: in this package a pre-fitted rush *is* a fitted building, so
 * it goes through `campaign/fitOut.ts`'s generic fold like a campaign tower's bookings, while
 * `packages/server` — which has no shop and no fold, and may not import this package — applies
 * `@elevator-sim/core`'s `config/rushPrefit.ts` directly. One set of values, held in `core`, and
 * two paths onto a building.
 *
 * **Two paths that agree today are the shape this repository has a rule about**, so the agreement
 * is asserted rather than argued, in three places and at three depths:
 *
 * - here, on the **documents**: byte-identical on every shipped tower, raw and resolved;
 * - here, on the **profile**: the same three fields, whichever end concluded them;
 * - and in `packages/server/src/leaderboard/rushHoldAgreement.json`'s `prefit` cells, on the
 *   **legs**, each half playing its own whole path and each cell required to differ from its
 *   unfitted twin. That last one is the only one that can catch a kit which folds perfectly and
 *   changes no decision, which is what `destination-eta` did for a whole release (§ D112).
 *
 * The price arithmetic is checked here too, because `core` deliberately does not parse
 * `data/price-schedule.json` and this package does.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  RUSH_PREFIT_KIT,
  loadConfig,
  parseBuilding,
  prefittedRushBuilding,
  prefittedRushProfile,
  resolveBuilding,
  type LoadedConfig,
} from '@elevator-sim/core';

import { fittedBuilding } from '../campaign/fitOut.js';
import type { BrowserResources } from '../dev/data.js';
import { drivingProfileOf, initialState, withBuilding, withDispatcher, type ViewerState } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { priceOf } from '../pricing/parse.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';

import { RUSH_PREFIT_FIT_OUT, RUSH_SEED } from './rush.js';

let config: LoadedConfig;
let resources: BrowserResources;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  resources = {
    priceSchedule: shippedPriceSchedule(),
    elevatorSpecs: config.elevatorSpecs,
    trafficProfiles: config.trafficProfiles,
    dispatcherProfiles: config.dispatcherProfiles,
    buildings: config.buildings,
    entries: config.buildings.map((building) => ({ file: `${building.id}.json`, config: building.config, resolved: building })),
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
});

describe('the kit as this package folds it', () => {
  it('is the core kit’s three effects on the identity, and nothing else', () => {
    expect(RUSH_PREFIT_FIT_OUT.doorSecondsSaved).toBe(RUSH_PREFIT_KIT.doorSecondsSaved);
    expect(RUSH_PREFIT_FIT_OUT.transferCeilingS).toBe(RUSH_PREFIT_KIT.transferCeilingS);
    expect(RUSH_PREFIT_FIT_OUT.zonesTheTower).toBe(RUSH_PREFIT_KIT.zonesTheTower);
    /*
     * The categories § D640 refused, asserted as absences. A flat currency purchase may not
     * pre-solve the tower and may not pre-decide who drives, and an absence nothing checks is how
     * the next tier copied into this constant would arrive.
     */
    expect(RUSH_PREFIT_FIT_OUT.extraShafts).toBe(0);
    expect(RUSH_PREFIT_FIT_OUT.machineClassId).toBeUndefined();
    expect(RUSH_PREFIT_FIT_OUT.carPersons).toBeUndefined();
    expect(RUSH_PREFIT_FIT_OUT.callType).toBeUndefined();
    expect(RUSH_PREFIT_FIT_OUT.passengerAssignment).toBeUndefined();
    expect(RUSH_PREFIT_FIT_OUT.rideTimeWeightFloor).toBe(0);
    expect(RUSH_PREFIT_FIT_OUT.arrivalRateFactor).toBe(1);
    expect(RUSH_PREFIT_FIT_OUT.movesHeaviestTenantDown).toBe(false);
  });

  it('costs what the three shop rows it is cost, in the shipped schedule', () => {
    const schedule = shippedPriceSchedule();
    const summed = RUSH_PREFIT_KIT.rungs.reduce((total, rung) => total + (priceOf(schedule, rung.priceId).priceUnits ?? 0), 0);
    expect(
      summed,
      'a row of the pre-fit kit has been re-priced in data/price-schedule.json, so the fifteen chimes ' +
        '§ D640 set at one chime per unit no longer follow from anything. Re-derive the sink’s price ' +
        'or the kit, and say which in the entry — a quotient nobody re-derived is exactly what § D256 ' +
        'refuses.',
    ).toBe(RUSH_PREFIT_KIT.totalUnits);
  });
});

describe('the two building appliers agree, on every shipped tower', () => {
  it('produce the same authored document', () => {
    const differing: string[] = [];
    for (const building of config.buildings) {
      const here = fittedBuilding(building.config, RUSH_PREFIT_FIT_OUT, config.elevatorSpecs);
      const there = prefittedRushBuilding(building.config, config.elevatorSpecs);
      if (JSON.stringify(here) !== JSON.stringify(there)) differing.push(building.id);
    }
    expect(differing, 'the viewer’s fold and core’s applier build different towers').toEqual([]);
  });

  it('produce the same resolved building, which is what a run is built from', () => {
    const differing: string[] = [];
    for (const building of config.buildings) {
      const here = fittedBuilding(building.config, RUSH_PREFIT_FIT_OUT, config.elevatorSpecs);
      const there = prefittedRushBuilding(building.config, config.elevatorSpecs);
      const resolvedHere = resolveBuilding(parseBuilding(here as unknown), config.elevatorSpecs);
      const resolvedThere = resolveBuilding(parseBuilding(there as unknown), config.elevatorSpecs);
      if (JSON.stringify(resolvedHere) !== JSON.stringify(resolvedThere)) differing.push(building.id);
    }
    expect(differing).toEqual([]);
  });

  it('actually change the tower, so the agreement above is not two no-ops agreeing', () => {
    /*
     * The negative control, and it is the one that would have caught a fold that quietly did
     * nothing: two appliers that both return their input agree perfectly.
     */
    const unchanged = config.buildings.filter(
      (building) =>
        JSON.stringify(prefittedRushBuilding(building.config, config.elevatorSpecs)) ===
        JSON.stringify(building.config),
    );
    expect(unchanged.map((building) => building.id), 'the kit left a shipped tower exactly as built').toEqual([]);
  });
});

describe('the two dispatcher appliers agree about how the group is worked', () => {
  /** The state a rush runs a shipped dispatcher from, with and without the kit. */
  function standing(buildingId: string, dispatcherId: string, fitted: boolean): ViewerState {
    const base = withDispatcher(withBuilding(initialState(resources, RUSH_SEED), resources, buildingId), resources, dispatcherId);
    return fitted ? { ...base, campaignFitOut: RUSH_PREFIT_FIT_OUT } : base;
  }

  it('conclude the same three fields, for every shipped dispatcher', () => {
    const disagreeing: string[] = [];
    for (const profile of config.dispatcherProfiles.profiles) {
      const asShipped = drivingProfileOf(resources, standing('midtown-office', profile.id, false));
      const here = drivingProfileOf(resources, standing('midtown-office', profile.id, true));
      /*
       * `core`'s conclusion applied to **the same base** — the profile the viewer's own chain
       * produces without a kit — which is the only comparison that is about the kit rather than
       * about `authoring/dispatcherSpec.ts`'s round trip.
       */
      const there = prefittedRushProfile(asShipped);
      const zoning = (candidate: typeof here): unknown => [
        candidate.dispatch?.assignmentMode,
        candidate.dispatch?.splitThresholdPassengers,
        candidate.idle?.parkingStrategy,
      ];
      if (JSON.stringify(zoning(here)) !== JSON.stringify(zoning(there))) {
        disagreeing.push(`${profile.id}: viewer ${JSON.stringify(zoning(here))} core ${JSON.stringify(zoning(there))}`);
      }
    }
    expect(disagreeing).toEqual([]);
  });

  it('move the group off what it was, on every shipped dispatcher but the one already zoned', () => {
    const inert: string[] = [];
    for (const profile of config.dispatcherProfiles.profiles) {
      const asShipped = drivingProfileOf(resources, standing('midtown-office', profile.id, false));
      const fitted = drivingProfileOf(resources, standing('midtown-office', profile.id, true));
      if (JSON.stringify(asShipped) === JSON.stringify(fitted)) inert.push(profile.id);
    }
    /*
     * **Measured rather than expected, and asserted in both directions.** The kit's Control L1 rung
     * *is* operational zoning, and `zoned-uppeak` ships declaring exactly what that rung concludes —
     * `assignmentMode: split-demand`, `splitThresholdPassengers: 10`, `parkingStrategy: zone-center`
     * — so on that dispatcher the rung buys nothing, and buying it again cannot. The other two
     * rungs still bite there, because they are edits to the building rather than to the profile;
     * what this row says is that the *dispatcher* is untouched.
     *
     * It is the same shape as `campaign/fitOut.ts`'s note that `tenants` L1's 1.2 s ceiling moves no
     * leg on `midtown-office`, which is already at it: a tier is inert where the thing it buys is
     * already there, and a cell where that happens is a measured fact rather than a surprise. Both
     * directions, so a shipped profile that quietly stopped being zoned goes red here rather than
     * making this list shorter and nobody noticing.
     */
    expect(inert, 'the kit left a shipped dispatcher exactly as it drives').toEqual(['zoned-uppeak']);
    const zoned = config.dispatcherProfiles.profiles.find((profile) => profile.id === 'zoned-uppeak');
    expect(zoned?.dispatch?.assignmentMode, 'zoned-uppeak is excused and is no longer zoned').toBe('split-demand');
    expect(zoned?.idle?.parkingStrategy).toBe('zone-center');
  });
});
