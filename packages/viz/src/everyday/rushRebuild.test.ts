/**
 * **The rush rebuild between rounds, as a player meets it** — GitHub issue #372, § D1295.
 *
 * Three things are held here, against the shipped data:
 *
 * 1. **`core`'s menu is the shop's own numbers.** `core/config/rushRebuild.ts` transcribes the shop's
 *    `fits` because `core` may not import this package; this is the pin that turns a transcription
 *    into an agreement. Every menu tier has the shop tier's price id and numbers at its category and
 *    level, and every shop tier is on exactly one of the menu and the off-menu list.
 * 2. **The menu's states and words**, driven through the view a player reads on a shipped tower.
 * 3. **The purse it offers is `core`'s derivation**, from the waves each round outlasted and what each
 *    rebuild spent, opening at what the claimed top-ups grant.
 *
 * Whether a rebuild changes a run is asked of legs, where legs are: `packages/server`'s
 * `rushHoldAgreement.json` rebuilt cells, which this package's `rushHoldAgreement.test.ts` plays
 * through the host's own rebuild, and `packages/server`'s `rushSitting.test.ts`.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  RUSH_PREFIT_KIT,
  RUSH_PREFIT_LEVELS,
  RUSH_REBUILD_OFF_MENU,
  RUSH_REBUILD_TIERS,
  loadConfig,
  rushRebuildUnits,
  type LoadedConfig,
  type PriceSchedule,
} from '@elevator-sim/core';

import { SHOP } from '../campaign/economy.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';

import { AS_BUILT } from '../campaign/fitOut.js';

import { rushFitOutOf } from './rush.js';
import { rushRebuildLineOf } from './rushScreenModel.js';
import {
  RUSH_PURSE,
  RUSH_REBUILD_COPY,
  rushFitsLineOf,
  rushPurseBeforeNextOf,
  rushRebuildPressOf,
  rushRebuildViewOf,
  rushTierNameOf,
  rushTopUpClaimsOf,
  type RushRebuildInput,
} from './rushRebuild.js';

let config: LoadedConfig;
let schedule: PriceSchedule;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  schedule = shippedPriceSchedule();
});

function midtown(over: Partial<RushRebuildInput> = {}): RushRebuildInput {
  const building = config.buildingsById.get('midtown-office');
  if (building === undefined) throw new Error('the shipped data lost midtown-office');
  return { levels: {}, pending: [], purseUnits: 12, schedule, building: building.config, specs: config.elevatorSpecs, ...over };
}

function rowOf(input: RushRebuildInput, priceId: string) {
  const row = rushRebuildViewOf(input).categories.flatMap((category) => category.rows).find((entry) => entry.priceId === priceId);
  if (row === undefined) throw new Error(`no row for ${priceId}`);
  return row;
}

describe('core’s rush menu is the shop’s own numbers — GitHub issue #372, § D1295', () => {
  it('gives every menu tier the shop tier’s price id and fits, at its category and level', () => {
    for (const tier of RUSH_REBUILD_TIERS) {
      const shop = SHOP.find((category) => category.id === tier.categoryId)?.tiers.find((entry) => entry.level === tier.level);
      expect(shop?.priceId, `${tier.categoryId} ${String(tier.level)}`).toBe(tier.priceId);
      expect(tier.fits, tier.priceId).toEqual(shop?.fits);
    }
  });

  it('puts every shop tier on exactly one of the menu and the off-menu list', () => {
    const on = new Set(RUSH_REBUILD_TIERS.map((tier) => `${tier.categoryId}.${String(tier.level)}.${tier.priceId}`));
    const off = new Set(RUSH_REBUILD_OFF_MENU.map((tier) => `${tier.categoryId}.${String(tier.level)}.${tier.priceId}`));
    const shop = SHOP.flatMap((category) => category.tiers.map((tier) => `${category.id}.${String(tier.level)}.${tier.priceId}`));
    for (const key of shop) expect(on.has(key) !== off.has(key), key).toBe(true);
    expect(on.size + off.size).toBe(shop.length);
  });

  it('folds the pre-fit’s levels to the pre-fit kit this package fits, field for field', () => {
    expect(rushFitOutOf(RUSH_PREFIT_LEVELS)).toEqual({
      ...AS_BUILT,
      doorSecondsSaved: RUSH_PREFIT_KIT.doorSecondsSaved,
      transferCeilingS: RUSH_PREFIT_KIT.transferCeilingS,
      zonesTheTower: RUSH_PREFIT_KIT.zonesTheTower,
    });
    expect(rushFitOutOf({})).toBeUndefined();
  });
});

describe('the menu a player reads', () => {
  it('draws every shop category, Shafts and Machines refused by name with the reason', () => {
    const view = rushRebuildViewOf(midtown());
    expect(view.categories.map((category) => category.name)).toEqual(SHOP.map((category) => category.name));
    for (const id of ['shafts', 'machines']) {
      const category = view.categories.find((entry) => entry.id === id);
      expect(category?.rows).toEqual([]);
      expect(category?.refusal).toBe(RUSH_REBUILD_COPY.needsCommissioning);
    }
    for (const priceId of ['staggered-starts', 'move-a-tenant']) {
      expect(rowOf(midtown(), priceId)).toMatchObject({ state: 'off-menu', note: RUSH_REBUILD_COPY.changesTheCrowd, pressable: false });
    }
  });

  it('offers what the purse covers, says what it falls short by, and refuses what would change nothing on this tower', () => {
    const input = midtown();
    const doors = rushRebuildUnits(schedule, ['faster-doors']);
    expect(rowOf(input, 'faster-doors')).toMatchObject({ state: 'buy', action: RUSH_REBUILD_COPY.buy(doors), pressable: true });
    const panel = rushRebuildUnits(schedule, ['full-destination']);
    expect(rowOf(input, 'full-destination')).toMatchObject({ state: 'short', note: RUSH_REBUILD_COPY.short(panel - 12), pressable: false });
    /* Measured on the legs: Midtown's cars are already rated for sixteen and its lobby already boards at 1.2 s. */
    expect(rowOf(input, 'larger-cars')).toMatchObject({ state: 'changes-nothing', note: RUSH_REBUILD_COPY.changesNothing });
    expect(rowOf(input, 'queue-marshalling')).toMatchObject({ state: 'changes-nothing' });
  });

  it('marks what the sitting has fitted, and what is picked with the way to put it back', () => {
    expect(rowOf(midtown({ levels: RUSH_PREFIT_LEVELS }), 'faster-doors')).toMatchObject({ state: 'fitted', pressable: false });
    const picked = midtown({ pending: ['faster-doors'] });
    expect(rowOf(picked, 'faster-doors')).toMatchObject({ state: 'picked', action: RUSH_REBUILD_COPY.undo, pressable: true });
    const cost = rushRebuildUnits(schedule, ['faster-doors']);
    expect(rushRebuildViewOf(picked).pendingLine).toBe(RUSH_REBUILD_COPY.pending(cost, 12 - cost));
    expect(rushRebuildViewOf(midtown()).pendingLine).toBe(RUSH_REBUILD_COPY.noneYet);
  });

  it('says what a tier fits in plain numbers read off core’s table', () => {
    expect(rowOf(midtown(), 'faster-doors').fits).toBe('1 s off every door cycle.');
    expect(rowOf(midtown(), 'door-sensors').fits).toBe('1 s off every door cycle; 1 s off the time doors stand open at a landing.');
    expect(rushFitsLineOf({ carPersons: 21 })).toBe(`${RUSH_REBUILD_COPY.fitsCars(21).charAt(0).toUpperCase()}${RUSH_REBUILD_COPY.fitsCars(21).slice(1)}.`);
    expect(rushFitsLineOf({})).toBe('');
  });

  it('names a rebuild by the shop’s own tier name', () => {
    expect(rushTierNameOf('faster-doors')).toBe('Faster doors');
    expect(rushTierNameOf('not-a-row')).toBe('not-a-row');
  });
});

describe('the setup screen’s line about the rebuild — § D1295', () => {
  it('says what a wave pays from the purse’s own figure, and the opening purse only when there is one', () => {
    const standard = rushRebuildLineOf(RUSH_PURSE.unitsPerWaveOutlasted, 0);
    expect(standard).toContain(`pays ${String(RUSH_PURSE.unitsPerWaveOutlasted)} units into a purse`);
    expect(standard).toContain('What you buy stays for the rest of the sitting.');
    expect(standard).not.toContain('opens with');
    expect(rushRebuildLineOf(RUSH_PURSE.unitsPerWaveOutlasted, 15)).toContain('This sitting opens with 15 units you bought with chimes.');
    expect(rushRebuildLineOf(1, 1)).toBe(
      'Each wave a round outlasts pays 1 unit into a purse, and between rounds you can spend it rebuilding the tower: ' +
        'doors, control, car size and queue marshalling. What you buy stays for the rest of the sitting. This sitting ' +
        'opens with 1 unit you bought with chimes.',
    );
  });
});

describe('a press on the menu — the host’s one rule', () => {
  it('adds a buyable tier, replaces a pick of the same category, and puts a picked tier back', () => {
    const added = rushRebuildPressOf(midtown(), 'faster-doors');
    expect(added).toEqual({ ok: true, pending: ['faster-doors'] });
    const replaced = rushRebuildPressOf(midtown({ pending: ['faster-doors'] }), 'door-sensors');
    expect(replaced).toEqual({ ok: true, pending: ['door-sensors'] });
    const back = rushRebuildPressOf(midtown({ pending: ['faster-doors'] }), 'faster-doors');
    expect(back).toEqual({ ok: true, pending: [] });
  });

  it('refuses a press the menu draws inert, in the row’s own words', () => {
    expect(rushRebuildPressOf(midtown({ purseUnits: 0 }), 'faster-doors')).toEqual({
      ok: false,
      reason: RUSH_REBUILD_COPY.short(rushRebuildUnits(schedule, ['faster-doors'])),
    });
    expect(rushRebuildPressOf(midtown(), 'larger-cars')).toEqual({ ok: false, reason: RUSH_REBUILD_COPY.changesNothing });
    expect(rushRebuildPressOf(midtown(), 'new-car')).toMatchObject({ ok: false });
    expect(rushRebuildPressOf(midtown({ levels: RUSH_PREFIT_LEVELS }), 'faster-doors')).toEqual({ ok: false, reason: RUSH_REBUILD_COPY.fitted });
  });
});

describe('the purse the menu offers — core’s derivation over this device’s rounds', () => {
  const perWave = (): number => RUSH_PURSE.unitsPerWaveOutlasted;

  it('pays a round on the waves it outlasted at its hold moment, and takes a rebuild’s price before the round it opens', () => {
    /* Midtown Office as shipped holds 1 640 s, in wave 10: nine waves outlasted. */
    expect(rushPurseBeforeNextOf({ rounds: [{ holdS: 1640 }], modifiers: [], schedule })).toBe(9 * perWave());
    const doors = rushRebuildUnits(schedule, ['faster-doors']);
    /* Rebuilt with Doors 1 it holds 1 684 s, still in wave 10. */
    expect(
      rushPurseBeforeNextOf({ rounds: [{ holdS: 1640 }, { holdS: 1684, rebuild: ['faster-doors'] }], modifiers: [], schedule }),
    ).toBe(9 * perWave() - doors + 9 * perWave());
  });

  it('opens at what the claimed top-up grants, and counts a round that never crossed as every wave outlasted', () => {
    const topUp = rushPurseBeforeNextOf({ rounds: [], modifiers: [{ sinkId: 'rush-purse-top-up', steps: 3 }], schedule });
    expect(topUp).toBe(15);
    expect(rushPurseBeforeNextOf({ rounds: [{ holdS: null }], modifiers: [], schedule })).toBe(30 * perWave());
  });

  it('claims the top-up the account owns, capped at what one sitting may claim, and nothing it does not own', () => {
    expect(rushTopUpClaimsOf([{ sinkId: 'rush-purse-top-up', steps: 5 }])).toEqual([{ sinkId: 'rush-purse-top-up', steps: 3 }]);
    expect(rushTopUpClaimsOf([{ sinkId: 'career-purse-top-up', steps: 2 }])).toEqual([]);
    expect(rushTopUpClaimsOf([])).toEqual([]);
  });
});
