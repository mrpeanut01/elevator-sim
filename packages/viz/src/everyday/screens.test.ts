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
  it('is § 4’s whole inventory — the shell’s own menu and sixteen registered modules', () => {
    /*
     * Stated as a fact about this tree rather than a design intent, exactly as `modes.test.ts`
     * does for the tiles: the day a screen lane lands, this case fails and is updated in the same
     * commit — which is the point, because this list is what the menu and the rail derive from.
     *
     * `fixit` was the first registered module (GAMEPLAY § 10, `everyday/fixitScreen.ts`) and
     * `settings` the second (§ 15.1, `everyday/settingsScreen.ts`). Five lanes then landed the
     * other fourteen between them: § 7's stage (`everyday/stageScreen.ts`) and § 14's board
     * (`everyday/boardScreen.ts` — the ladder half needs no server, so the screen opens and the
     * daily board's tab carries § 12.2's labelled unavailable state instead), § 6's daily loop
     * — the front door, the brief, the report and Your week — which is what turns *Today's tower*
     * from a hand-off into a loop, § 8's campaign trio, `towers`, `building` and `contract`
     * (`everyday/campaignScreens.ts` — one module with three rows, because the three are one
     * flow), § 11's workshop beside § 12's bench (`everyday/workshopScreen.ts`,
     * `everyday/benchScreen.ts`), and § 9.1's rush setup beside § 13's drawing board and § 3.3's
     * tuner (`everyday/rushScreen.ts`, `everyday/designerScreen.ts`, `everyday/tunerScreen.ts`).
     *
     * **This list is now `EVERYDAY_SCREENS` itself, and that is the fact rather than a coincidence
     * of formatting**: every § 4 key is built, so the filter selects everything and
     * `UNBUILT_REASONS` is keyed over nothing. It is asserted as a literal anyway, because the
     * claim under test is *which screens open*, and a list derived from the inventory it is being
     * checked against would assert nothing at all.
     *
     * The order is `EVERYDAY_SCREENS`' own, because the constant is a filter over the inventory
     * and not a record of what registered when. It is why this list can be recomputed from
     * `types.ts` and the registry after a merge rather than reconstructed from five branches'
     * registration orders — which is exactly what was done here, since no two of those lanes
     * registered in the same order and none of their orders is this one. The lane that added the
     * last three asserted `rush, fixit, designer, tuner, settings` on its own branch, which was
     * correct there and is not the order here.
     *
     * **The workshop and the bench are the clearest case for deriving rather than merging.** Their
     * own branch registered them *after* `settings` in the table and asserted them *before* it in
     * this list — both correct, because the table's order decides nothing and the inventory's
     * decides everything. A merge that had tried to reconcile the two orderings would have been
     * reconciling a fact with a non-fact.
     *
     * **`stage` moved sides without moving in this list**, which is the case worth reading twice:
     * it was shell-owned (the § D335 hand-off), it is now registered, and a list that only says
     * *built* cannot tell the difference. The case below is what does.
     */
    expect(EVERYDAY_SCREENS_BUILT).toEqual([
      'menu',
      'door',
      'brief',
      'stage',
      'report',
      'towers',
      'building',
      'contract',
      'rush',
      'fixit',
      'workshop',
      'bench',
      'designer',
      'tuner',
      'week',
      'board',
      'settings',
    ]);
  });

  it('derives BUILT from the registry, in both directions', () => {
    for (const screen of EVERYDAY_SCREENS) {
      const registered = screenModuleFor(screen) !== undefined;
      const shellOwned = screen === 'menu';
      expect(isScreenBuilt(screen), screen).toBe(registered || shellOwned);
    }
  });

  it('owns exactly one screen in the shell — the menu, and no longer the stage', () => {
    /*
     * The hand-off's epitaph. `stage` carries a module now, so it must route like every other
     * registered key; a `stage` that were still shell-owned *and* registered would be built twice
     * and refused by neither half of the reasons check.
     */
    expect(screenModuleFor('menu')).toBeUndefined();
    expect(screenModuleFor('stage')).toBeDefined();
    expect(routeFor('stage')).toBe('screen');
  });
});

describe('the refusal sentences and the registry move together', () => {
  it('keys a sentence for every unbuilt screen and for no built one', () => {
    /*
     * **Both arms still run, and today every key takes the first one.** The loop is over
     * `EVERYDAY_SCREENS`, so it makes seventeen assertions rather than none — this is the check
     * that would catch a key registered without its sentence being deleted, and it is exactly the
     * check that emptied `UNBUILT_REASONS`. The `else` arm is unreached on this build and is kept
     * rather than deleted: the day a screen leaves the registry it is what says the key owes a
     * sentence back.
     */
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
    // And the table is empty rather than merely consistent, which is the stronger statement the
    // loop above cannot make: a key for a screen outside the inventory would pass every iteration.
    expect(Object.keys(UNBUILT_REASONS)).toEqual([]);
  });

  it('refuses to produce a refusal for any screen, because every screen is built', () => {
    /*
     * The throwing arm is deliberate: a caller asking for a refusal over a working screen is the
     * § D227 defect about to happen, and a returned fallback sentence would let it.
     *
     * **The returning arm has no key left to exercise**, and that is the honest state of this
     * function rather than a gap in the case. It used to be pinned on whichever screen was unbuilt
     * that wave — `rush`, then `board` — and repointing it at a screen that still refuses is not
     * available now that none does. So every key is asserted to throw, which is the same claim over
     * the whole inventory and is the pair *refuses ⇔ unbuilt* in the only direction this build can
     * produce. `briefView.test.ts` holds the other half at the one call site that reads it.
     */
    for (const screen of EVERYDAY_SCREENS) {
      expect(() => unbuiltReasonFor(screen), screen).toThrow(/built/);
    }
  });
});

describe('the router', () => {
  it('sends the one shell-owned key its own way and splits the rest by registration', () => {
    expect(routeFor('menu')).toBe('menu');
    for (const screen of EVERYDAY_SCREENS) {
      if (screen === 'menu') continue;
      expect(routeFor(screen), screen).toBe(
        screenModuleFor(screen) === undefined ? 'refusal' : 'screen',
      );
    }
  });

  it('produces two of its three arms, and `refusal` is empty of keys rather than of producers', () => {
    /*
     * `'handoff'` was the fourth value and it had exactly one producer. It went with the route
     * rather than being left in the union: a route a reader can switch on and nothing can return
     * is the dead seam this repository keeps a count of, one type up.
     *
     * **`'refusal'` is not that**, and the distinction is the whole reason this case was rewritten
     * rather than deleted when the last three screens registered. `routeFor`'s branch is over the
     * *registry*, not over the union: any key without a module returns it, and the arm becomes
     * reachable again on the commit that unregisters one — exactly as `UNBUILT_REASONS` becomes
     * non-empty on that same commit. `'handoff'` had one producer and that producer was deleted;
     * this one has a producer with nothing to feed it today.
     *
     * So the assertion is what the registry says, both ways, rather than a shorter list: every key
     * routes to `screen` except the shell's own, and no key routes to `refusal` — which is the fact
     * that would fail if a screen were unregistered without its sentence coming back.
     */
    const produced = new Set(EVERYDAY_SCREENS.map((screen) => routeFor(screen)));
    expect([...produced].sort()).toEqual(['menu', 'screen']);
    expect(EVERYDAY_SCREENS.filter((screen) => routeFor(screen) === 'refusal')).toEqual([]);
    expect(EVERYDAY_SCREENS.filter((screen) => routeFor(screen) === 'refusal')).toEqual(
      EVERYDAY_SCREENS.filter((screen) => UNBUILT_REASONS[screen] !== undefined),
    );
  });

  it('names every screen for a heading, in § 4’s words', () => {
    for (const screen of EVERYDAY_SCREENS) {
      expect(SCREEN_NAMES[screen].trim(), screen).not.toBe('');
    }
    // The one slashed pair is the two boards — one screen, so one heading carrying both tabs.
    expect(SCREEN_NAMES.board).toBe("Today's board / Dispatcher ladder");
  });
});
