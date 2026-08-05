/**
 * The menu state machine, and the catalogue's derivation from real `data/`.
 *
 * Two tiers, deliberately. The reducer is exercised against a three-line fixture, because it is a
 * pure function and a `data/` load would only make it slower. The **catalogue** is exercised against
 * the real configuration in both directions, because its whole purpose is to track `data/` and a
 * fixture would prove only that it tracks a fixture.
 */

import { describe, expect, it } from 'vitest';

import { loadConfig } from '@elevator-sim/core';

import { DATA_DIR } from '../fixtures.test-helper.js';

import { buildingDetail, catalogueOf, type CatalogueSource } from './catalogue.js';
import {
  FREE_PLAY_RATES,
  back,
  canStart,
  freePlayIssues,
  initialMenuState,
  navigate,
  updateFreePlay,
  updateSettings,
} from './menu.js';
import {
  DEFAULT_SETTINGS,
  FREE_PLAY_DURATIONS_S,
  MENU_SCREENS,
  PLAYBACK_SPEEDS,
  ROOT_SCREEN,
  type MenuCatalogue,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * A fixture with one of everything
 * -------------------------------------------------------------------------- */

const CATALOGUE: MenuCatalogue = Object.freeze({
  buildings: Object.freeze([
    { id: 'alpha', name: 'Alpha' },
    { id: 'beta', name: 'Beta' },
  ]),
  dispatchers: Object.freeze([{ id: 'collective', name: 'Conventional collective' }]),
  demandTemplates: Object.freeze([{ id: 'rise-and-fall', name: 'Rise and fall' }]),
});

/* -------------------------------------------------------------------------- *
 * Navigation
 * -------------------------------------------------------------------------- */

describe('navigation', () => {
  it('opens at the root with nothing to go back to', () => {
    const state = initialMenuState(CATALOGUE);
    expect(state.screen).toBe(ROOT_SCREEN);
    expect(state.history).toEqual([]);
    // Back at the root is a no-op that returns the SAME object, so a panel that calls it on every
    // render does not churn.
    expect(back(state)).toBe(state);
  });

  it('remembers the way back, and returns through it', () => {
    let state = initialMenuState(CATALOGUE);
    state = navigate(state, 'leaderboard');
    state = navigate(state, 'free-play');
    expect(state.screen).toBe('free-play');

    state = back(state);
    expect(state.screen).toBe('leaderboard');
    state = back(state);
    expect(state.screen).toBe(ROOT_SCREEN);
    expect(state.history).toEqual([]);
  });

  it('treats the root as a way out rather than a step deeper', () => {
    let state = initialMenuState(CATALOGUE);
    state = navigate(state, 'campaign');
    state = navigate(state, 'settings');
    state = navigate(state, ROOT_SCREEN);
    // The stack is cleared, not appended to: "Main menu" from three screens deep leaves nothing to
    // go back through, which is what a player means by it.
    expect(state.history).toEqual([]);
    expect(back(state)).toBe(state);
  });

  it('does not push the screen it is already on', () => {
    let state = navigate(initialMenuState(CATALOGUE), 'settings');
    const again = navigate(state, 'settings');
    expect(again).toBe(state);
    // ...and it stays a no-op however many times it is called.
    state = navigate(navigate(again, 'settings'), 'settings');
    expect(state.history).toEqual([]);
  });

  it('can reach every declared screen', () => {
    // Derived from the union rather than listed, so a screen added without a route fails here.
    for (const screen of MENU_SCREENS) {
      expect(navigate(initialMenuState(CATALOGUE), screen).screen).toBe(screen);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Settings
 * -------------------------------------------------------------------------- */

describe('settings', () => {
  it('starts at the documented defaults, with the energy axis off', () => {
    // Off is not an arbitrary default: § D106 says energy is an axis and never a score, so it is
    // shown when asked for rather than folded into the first thing a player sees.
    expect(initialMenuState(CATALOGUE).settings).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.showEnergyAxis).toBe(false);
  });

  it('applies a partial change without disturbing the rest', () => {
    const state = updateSettings(initialMenuState(CATALOGUE), { reduceMotion: true });
    expect(state.settings.reduceMotion).toBe(true);
    expect(state.settings.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('accepts every offered playback speed', () => {
    for (const speed of PLAYBACK_SPEEDS) {
      expect(updateSettings(initialMenuState(CATALOGUE), { playbackSpeed: speed }).settings.playbackSpeed).toBe(
        speed,
      );
    }
  });

  it('drops a speed it does not offer rather than clamping to one it does', () => {
    // Restored state from another build is the only way this arrives. Clamping would present a
    // preference the player never chose as though they had.
    const state = updateSettings(initialMenuState(CATALOGUE), { playbackSpeed: 3.7 });
    expect(state.settings.playbackSpeed).toBe(DEFAULT_SETTINGS.playbackSpeed);
  });
});

/* -------------------------------------------------------------------------- *
 * Free play
 * -------------------------------------------------------------------------- */

describe('the free-play selection', () => {
  it('opens on something that can actually be started', () => {
    const state = initialMenuState(CATALOGUE);
    expect(freePlayIssues(state.freePlay, CATALOGUE)).toEqual([]);
    expect(canStart(state.freePlay, CATALOGUE)).toBe(true);
  });

  it('defaults the rate to the building’s own profile rather than a number', () => {
    // `null` is a distinct selection, not a missing one: resolving it here would pin a rate that
    // `data/` is free to change.
    expect(initialMenuState(CATALOGUE).freePlay.arrivalRatePctPop5min).toBeNull();
    expect(FREE_PLAY_RATES[0]).toBeNull();
  });

  it('reports every problem at once, not the first', () => {
    const broken = updateFreePlay(initialMenuState(CATALOGUE), {
      buildingId: 'nowhere',
      dispatcherProfileId: 'nobody',
      durationS: 7,
      seed: 'abc',
    });
    const issues = freePlayIssues(broken.freePlay, CATALOGUE);
    expect(issues.map((issue) => issue.field).sort()).toEqual([
      'buildingId',
      'dispatcherProfileId',
      'durationS',
      'seed',
    ]);
    // A player who fixes one and is then told about the next has been made to guess how many
    // there are.
    expect(issues.length).toBeGreaterThan(1);
    expect(canStart(broken.freePlay, CATALOGUE)).toBe(false);
  });

  it('names a missing building in words a player can act on', () => {
    const gone = updateFreePlay(initialMenuState(CATALOGUE), { buildingId: 'demolished' });
    const [issue] = freePlayIssues(gone.freePlay, CATALOGUE);
    expect(issue?.message).toContain('demolished');
    expect(issue?.message).toMatch(/renamed or removed/u);
  });

  it('refuses a seed that would not survive a round trip', () => {
    // The server replays a submitted seed (§ D214 § 3), so it has to come back from JSON and a
    // database byte for byte. A float would lose precision and a long string would be stored.
    for (const seed of ['', 'abc', '1.5', '-1', '1'.repeat(21), ' 1']) {
      const state = updateFreePlay(initialMenuState(CATALOGUE), { seed });
      expect(
        freePlayIssues(state.freePlay, CATALOGUE).some((issue) => issue.field === 'seed'),
        seed,
      ).toBe(true);
    }
    for (const seed of ['0', '20260804', '1'.repeat(20)]) {
      const state = updateFreePlay(initialMenuState(CATALOGUE), { seed });
      expect(freePlayIssues(state.freePlay, CATALOGUE), seed).toEqual([]);
    }
  });

  it('refuses a template whose own period is longer than the run, and says both numbers', () => {
    // The kernel throws *"leaves no measurement window"* for `constant-iso` under two hours. That
    // is correct and it is said in a place a player cannot act on, so the menu refuses the
    // combination first — with the template's minimum and the player's choice both in the sentence.
    const withIso: MenuCatalogue = {
      ...CATALOGUE,
      demandTemplates: [
        { id: 'rise-and-fall', name: 'Rise and fall' },
        { id: 'constant-iso', name: 'Constant (ISO)', minimumDurationS: 7200 },
      ],
    };
    const short = updateFreePlay(initialMenuState(withIso), {
      demandTemplateId: 'constant-iso',
      durationS: 900,
    });
    const [issue] = freePlayIssues(short.freePlay, withIso);
    expect(issue?.field).toBe('durationS');
    expect(issue?.message).toContain('Constant (ISO)');
    expect(issue?.message).toContain('120 minutes');
    expect(issue?.message).toContain('15-minute');

    // ...and it is accepted at a length that reaches the period.
    const long = updateFreePlay(short, { durationS: 7200 });
    expect(freePlayIssues(long.freePlay, withIso)).toEqual([]);
  });

  it('every shipped template can be run at some offered length', async () => {
    // Both directions again, and derived from `data/`. A template that ships and fits inside none
    // of the offered run lengths would be listed in the menu and unstartable at every one of them.
    const config = await loadConfig(DATA_DIR);
    const catalogue = catalogueOf(config as unknown as CatalogueSource);
    for (const template of catalogue.demandTemplates) {
      const workable = FREE_PLAY_DURATIONS_S.filter(
        (durationS) => durationS >= (template.minimumDurationS ?? 0),
      );
      expect(workable.length, template.id).toBeGreaterThan(0);
    }
  });

  it('opens on a Free play selection the menu would actually let you start', async () => {
    /*
     * The test above proves every template *has* a workable length. It did not prove the opening
     * state *picks* one, and it did not: `durationS` was a fixed index into the ladder, 15 minutes,
     * while the first shipped template declares a 30-minute period. So the menu refused the state
     * it had just built, and a new player's first sight of Free play was a disabled Start under a
     * refusal — the screen GitHub issue #13 is about.
     *
     * Against the real `data/` load rather than `CATALOGUE`, because the defect was a disagreement
     * between two shipped numbers and a fixture can be authored not to have it.
     */
    const config = await loadConfig(DATA_DIR);
    const catalogue = catalogueOf(config as unknown as CatalogueSource);
    expect(freePlayIssues(initialMenuState(catalogue).freePlay, catalogue)).toEqual([]);
  });

  it('accepts every offered duration and rate', () => {
    for (const durationS of FREE_PLAY_DURATIONS_S) {
      const state = updateFreePlay(initialMenuState(CATALOGUE), { durationS });
      expect(freePlayIssues(state.freePlay, CATALOGUE), String(durationS)).toEqual([]);
    }
    for (const rate of FREE_PLAY_RATES) {
      const state = updateFreePlay(initialMenuState(CATALOGUE), { arrivalRatePctPop5min: rate });
      expect(freePlayIssues(state.freePlay, CATALOGUE), String(rate)).toEqual([]);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The catalogue, against real data
 * -------------------------------------------------------------------------- */

describe('the catalogue is derived from data/, in both directions', () => {
  it('offers every shipped building, dispatcher and template, and nothing else', async () => {
    const config = await loadConfig(DATA_DIR);
    const catalogue = catalogueOf(config as unknown as CatalogueSource);

    // Both directions. A building that lands and a building that leaves are each a failure here,
    // which is the whole reason the menu derives rather than lists (§ D213).
    expect(catalogue.buildings.map((entry) => entry.id).sort()).toEqual(
      config.buildings.map((building) => building.id).sort(),
    );
    expect(catalogue.dispatchers.map((entry) => entry.id)).toEqual(
      config.dispatcherProfiles.profiles.map((profile) => profile.id),
    );
    expect(catalogue.demandTemplates.map((entry) => entry.id)).toEqual(
      config.trafficProfiles.demandTemplates.map((template) => template.id),
    );

    // Non-vacuous: a catalogue derived from an empty config would satisfy the equalities above.
    expect(catalogue.buildings.length).toBeGreaterThanOrEqual(8);
    expect(catalogue.dispatchers.length).toBeGreaterThanOrEqual(12);
    expect(catalogue.demandTemplates.length).toBeGreaterThanOrEqual(5);
  });

  it('filters nothing — a dispatcher that loses is still a choice', async () => {
    const config = await loadConfig(DATA_DIR);
    const catalogue = catalogueOf(config as unknown as CatalogueSource);
    // `nearest-car` is the weakest shipped dispatcher and the one that saturates first. It is
    // offered anyway: "a profile that fails to beat the baseline is a result about that profile",
    // and Free Play is where the player is the experimenter.
    expect(catalogue.dispatchers.map((entry) => entry.id)).toContain('nearest-car');
  });

  it('describes a building by what a player picks it for', async () => {
    const config = await loadConfig(DATA_DIR);
    const midtown = config.buildingsById.get('midtown-office');
    expect(midtown).toBeDefined();
    const detail = buildingDetail(midtown as never);
    expect(detail).toMatch(/floors/u);
    expect(detail).toMatch(/people/u);
    expect(detail).toMatch(/cars/u);
    // Thousands separated, because 1710 people is a number a reader has to parse and 1,710 is not.
    expect(detail).toContain('1,710');
  });

  it('says which templates support an interval and which are for cross-checking', async () => {
    const config = await loadConfig(DATA_DIR);
    const catalogue = catalogueOf(config as unknown as CatalogueSource);
    const byId = new Map(catalogue.demandTemplates.map((entry) => [entry.id, entry.detail]));
    // A player choosing `constant-iso` for a scored run should learn it is a cross-checking shape
    // before the leaderboard tells them afterwards.
    expect(byId.get('rise-and-fall')).toBe('recommended');
    expect(byId.get('constant-iso')).toBe('cross-checking');
  });
});
