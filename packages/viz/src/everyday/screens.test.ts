/**
 * **The registry's two derivations, held in both directions.**
 *
 * `EVERYDAY_SCREENS_BUILT` and `UNBUILT_REASONS` are the two halves of one claim — *these screens
 * open, those refuse, in these words* — and every surface (tiles, rail rows, the router, the bar's
 * refusing note) reads them rather than deciding for itself. So this file is where a lane that
 * registers a screen finds out what else its commit must touch: the key must leave the reasons
 * table, or the build ships a refusal over a working screen (§ D227), and an unbuilt key must
 * keep a sentence, or a control silently does nothing.
 */

import { describe, expect, it } from 'vitest';

import {
  EVERYDAY_SCREENS_BUILT,
  isScreenBuilt,
  routeFor,
  SCREEN_NAMES,
  screenModuleFor,
  UNBUILT_REASONS,
  unbuiltReasonFor,
} from './screens.js';
import { EVERYDAY_SCREENS } from './types.js';

describe('what this build has actually built', () => {
  it('is the shell’s two screens and every registered module — today the two plus fixit and settings', () => {
    /*
     * Stated as a fact about this tree rather than a design intent, exactly as `modes.test.ts`
     * does for the tiles: the day a screen lane lands, this case fails and is updated in the same
     * commit — which is the point, because this list is what the menu and the rail derive from.
     * `fixit` was the first registered module (GAMEPLAY § 10, `everyday/fixitScreen.ts`) and
     * `settings` the second (§ 15.1, `everyday/settingsScreen.ts`); § 6's daily loop then landed
     * four more — the front door, the brief, the report and Your week — which is what turns
     * *Today's tower* from a hand-off into a loop. The order is `EVERYDAY_SCREENS`' own, because
     * the constant is a filter over the inventory.
     */
    expect(EVERYDAY_SCREENS_BUILT).toEqual([
      'menu',
      'door',
      'brief',
      'stage',
      'report',
      'fixit',
      'week',
      'settings',
    ]);
  });

  it('derives BUILT from the registry, in both directions', () => {
    for (const screen of EVERYDAY_SCREENS) {
      const registered = screenModuleFor(screen) !== undefined;
      const shellOwned = screen === 'menu' || screen === 'stage';
      expect(isScreenBuilt(screen), screen).toBe(registered || shellOwned);
    }
  });
});

describe('the refusal sentences and the registry move together', () => {
  it('keys a sentence for every unbuilt screen and for no built one', () => {
    for (const screen of EVERYDAY_SCREENS) {
      const reason = UNBUILT_REASONS[screen];
      if (isScreenBuilt(screen)) {
        expect(reason, `${screen} is built and must not keep a refusal`).toBeUndefined();
      } else {
        expect(reason?.trim().length, `${screen} is unbuilt and owes a sentence`).toBeGreaterThan(
          10,
        );
      }
    }
  });

  it('refuses to produce a refusal for a built screen', () => {
    // The throwing arm is deliberate: a caller asking for a refusal over a working screen is the
    // § D227 defect about to happen, and a returned fallback sentence would let it.
    expect(() => unbuiltReasonFor('menu')).toThrow(/built/);
    expect(() => unbuiltReasonFor('door')).toThrow(/built/);
    expect(unbuiltReasonFor('rush')).toMatch(/not built yet/);
  });
});

describe('the router', () => {
  it('sends the two shell-owned keys their own way and splits the rest by registration', () => {
    expect(routeFor('menu')).toBe('menu');
    expect(routeFor('stage')).toBe('handoff');
    for (const screen of EVERYDAY_SCREENS) {
      if (screen === 'menu' || screen === 'stage') continue;
      expect(routeFor(screen), screen).toBe(
        screenModuleFor(screen) === undefined ? 'refusal' : 'screen',
      );
    }
  });

  it('names every screen for a heading, in § 4’s words', () => {
    for (const screen of EVERYDAY_SCREENS) {
      expect(SCREEN_NAMES[screen].trim(), screen).not.toBe('');
    }
    // The one slashed pair is the two boards — one screen, so one heading carrying both tabs.
    expect(SCREEN_NAMES.board).toBe("Today's board / Dispatcher ladder");
  });
});
