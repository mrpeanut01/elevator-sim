/**
 * **The rush rebuild's menu, its fold and its legality** — GitHub issue #372, § D1295.
 *
 * Read against the **shipped** `data/price-schedule.json`, `data/buildings/` and dispatcher profiles,
 * on `rushPurse.test.ts`'s ground. What is not here, because it cannot be, is whether a rebuild
 * changes a run: that is asked of legs, by `packages/server/src/leaderboard/rushHoldAgreement.json`'s
 * rebuilt cells, each played by both halves and required to differ from its unrebuilt twin. Whether
 * this table agrees with the shop's own numbers is asked by
 * `packages/viz/src/everyday/rushRebuild.test.ts`, which is the side that can import the shop.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadConfig } from './loader.js';
import { changeCovering, parsePriceSchedule } from './priceSchedule.js';
import { RUSH_PREFIT_KIT, prefittedRushProfile } from './rushPrefit.js';
import {
  RUSH_AS_SHIPPED,
  RUSH_NO_LEVELS,
  RUSH_PREFIT_LEVELS,
  RUSH_REBUILD_CATEGORY_IDS,
  RUSH_REBUILD_OFF_MENU,
  RUSH_REBUILD_TIERS,
  fitProfileOf,
  rushFitOf,
  rushLevelsAfter,
  rushRebuildUnits,
  rushRebuiltBuilding,
  rushRebuiltProfile,
} from './rushRebuild.js';

const DATA = fileURLToPath(new URL('../../../../data/', import.meta.url));
const SCHEDULE = parsePriceSchedule(JSON.parse(readFileSync(`${DATA}price-schedule.json`, 'utf8')) as unknown);

describe('the menu, against the shipped price schedule', () => {
  it('names a priced row for every tier on it and off it, and that row prices the same shop tier', () => {
    for (const tier of [...RUSH_REBUILD_TIERS, ...RUSH_REBUILD_OFF_MENU]) {
      const path = `shop.${tier.categoryId}.${String(tier.level)}`;
      expect(changeCovering(SCHEDULE, path)?.id, `${tier.priceId} is not the row that prices ${path}`).toBe(tier.priceId);
    }
  });

  it('sells Doors, Control and Car size at every level and Tenants at level 1, and refuses Shafts and Machines by name', () => {
    const on = RUSH_REBUILD_TIERS.map((tier) => `${tier.categoryId}.${String(tier.level)}`);
    expect(on).toEqual(['doors.1', 'doors.2', 'doors.3', 'control.1', 'control.2', 'control.3', 'cars.1', 'cars.2', 'tenants.1']);
    const off = new Map(RUSH_REBUILD_OFF_MENU.map((tier) => [`${tier.categoryId}.${String(tier.level)}`, tier.reason]));
    for (const level of [1, 2, 3]) expect(off.get(`machines.${String(level)}`)).toBe('commissioning');
    for (const level of [1, 2]) expect(off.get(`shafts.${String(level)}`)).toBe('commissioning');
    expect(off.get('tenants.2')).toBe('crowd');
    expect(off.get('tenants.3')).toBe('crowd');
    /* Nothing is both. */
    for (const key of on) expect(off.has(key), key).toBe(false);
  });

  it('offers something a first round can afford on every shipped tower — 12 units is the least a first round pays', () => {
    /*
     * `data/rush-purse.json`'s note measured the first rounds at 12 to 50 units (6 to 25 waves at 2
     * units a wave, and the two towers that never break pay 60). A menu whose cheapest tier sat above
     * 12 would be a purse the smallest tower could never spend after its first round.
     */
    const prices = RUSH_REBUILD_TIERS.map((tier) => rushRebuildUnits(SCHEDULE, [tier.priceId]));
    expect(Math.min(...prices)).toBeLessThanOrEqual(12);
    expect(prices.filter((units) => units <= 12).length).toBeGreaterThanOrEqual(3);
  });
});

describe('the fold', () => {
  it('is as shipped at no levels', () => {
    expect(rushFitOf(RUSH_NO_LEVELS)).toBe(RUSH_AS_SHIPPED);
  });

  it('folds the pre-fit kit’s three levels to the kit’s three effects and nothing else', () => {
    expect(rushFitOf(RUSH_PREFIT_LEVELS)).toEqual({
      ...RUSH_AS_SHIPPED,
      doorSecondsSaved: RUSH_PREFIT_KIT.doorSecondsSaved,
      transferCeilingS: RUSH_PREFIT_KIT.transferCeilingS,
      zonesTheTower: RUSH_PREFIT_KIT.zonesTheTower,
    });
  });

  it('reads a level whole rather than summed on the one below — Control 2 replaces zoning with a panel', () => {
    const fit = rushFitOf({ control: 2 });
    expect(fit.zonesTheTower).toBe(false);
    expect(fit.callType).toBe('mobile-credential');
    expect(fit.rideTimeWeightFloor).toBe(0.5);
  });

  it('throws on a level the menu has no tier for, rather than reading it as shipped', () => {
    expect(() => rushFitOf({ tenants: 2 })).toThrow(/no tenants tier at level 2/u);
  });
});

describe('what a rebuild may add', () => {
  it('goes straight to any level — a tier does not require the one below inside a sitting (§ D640)', () => {
    const after = rushLevelsAfter(RUSH_NO_LEVELS, ['advance-opening', 'larger-cars-21']);
    expect(after).toEqual({ ok: true, levels: { doors: 3, cars: 2 } });
  });

  it('refuses, each by its own kind, an unknown row, a row off the menu, a level already fitted and a second tier of one category', () => {
    const after = rushLevelsAfter(RUSH_PREFIT_LEVELS, ['no-such-row', 'new-car', 'faster-doors', 'larger-cars', 'larger-cars-21']);
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.refusals.map((refusal) => [refusal.kind, refusal.priceId])).toEqual([
      ['unknown', 'no-such-row'],
      ['off-menu', 'new-car'],
      ['already-fitted', 'faster-doors'],
      ['same-category-twice', 'larger-cars-21'],
    ]);
  });

  it('prices a rebuild as the sum of its rows', () => {
    expect(rushRebuildUnits(SCHEDULE, ['faster-doors', 'zone-the-tower'])).toBe(
      rushRebuildUnits(SCHEDULE, ['faster-doors']) + rushRebuildUnits(SCHEDULE, ['zone-the-tower']),
    );
    expect(rushRebuildUnits(SCHEDULE, [])).toBe(0);
  });
});

describe('the appliers', () => {
  it('return their input by identity when nothing is fitted', async () => {
    const config = await loadConfig(DATA);
    const building = config.buildingsById.get('midtown-office');
    const profile = config.dispatcherProfilesById.get('collective');
    if (building === undefined || profile === undefined) throw new Error('the shipped data lost midtown-office or collective');
    expect(rushRebuiltBuilding(building.config, RUSH_AS_SHIPPED, config.elevatorSpecs)).toBe(building.config);
    expect(fitProfileOf(profile, RUSH_AS_SHIPPED)).toBe(profile);
    expect(rushRebuiltProfile(profile, RUSH_AS_SHIPPED, (entry) => entry)).toBe(profile);
  });

  it('give the pre-fit’s profile exactly what the kit’s own applier gives it', async () => {
    const config = await loadConfig(DATA);
    for (const profile of config.dispatcherProfiles.profiles) {
      expect(rushRebuiltProfile(profile, rushFitOf(RUSH_PREFIT_LEVELS), (entry) => entry), profile.id).toEqual(
        prefittedRushProfile(profile),
      );
    }
  });

  it('fit every category of the menu into a shipped tower or profile, so no row is a purchase with no applier', async () => {
    const config = await loadConfig(DATA);
    const building = config.buildingsById.get('midtown-office');
    const profile = config.dispatcherProfilesById.get('collective');
    if (building === undefined || profile === undefined) throw new Error('the shipped data lost midtown-office or collective');
    for (const tier of RUSH_REBUILD_TIERS) {
      const fit = rushFitOf({ [tier.categoryId]: tier.level });
      const builtChanged = rushRebuiltBuilding(building.config, fit, config.elevatorSpecs) !== building.config;
      const profileChanged = JSON.stringify(rushRebuiltProfile(profile, fit, (entry) => entry)) !== JSON.stringify(profile);
      expect(builtChanged || profileChanged, `${tier.priceId} edits neither the tower nor the profile`).toBe(true);
    }
    expect(RUSH_REBUILD_CATEGORY_IDS.length).toBe(4);
  });
});
