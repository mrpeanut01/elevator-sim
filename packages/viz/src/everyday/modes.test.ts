/**
 * **The four tiles, and the claim each one makes about the tree behind it.**
 *
 * `modes.ts` is a table, so most of what could be asserted here would be re-typing it. What is
 * worth asserting is the part that can go *wrong*: whether the availability flags still describe
 * the repository they claim to describe, and whether a tile that refuses says why.
 *
 * The load-bearing case is the last one. `EVERYDAY_MODES` is authored prose about what exists, and
 * this repository's documented failure mode is exactly that — a sentence about a mechanism, or a
 * refusal, that stayed on the screen after the mechanism moved (`docs/05`'s standing requirement,
 * § D227). So *Endless rush is not built* is checked against the tree rather than believed.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { actionBarFor } from './actionBar.js';
import { EVERYDAY_MODES, isPlayable } from './modes.js';
import { rushBarModel, RUSH_PRIMARY_REFUSAL } from './rushScreenModel.js';
import { isScreenBuilt } from './screens.js';
import { EVERYDAY_SCREENS, MODE_PICKS } from './types.js';

const SRC = fileURLToPath(new URL('..', import.meta.url));

describe('the menu offers the four modes the design names', () => {
  it('lists all four, in the guide’s order, and none twice', () => {
    expect(EVERYDAY_MODES.map((mode) => mode.title)).toEqual([
      "Today's tower",
      'Campaign',
      'Endless rush',
      'Fix a building',
    ]);
  });

  it('opens each tile on a screen the inventory knows', () => {
    for (const mode of EVERYDAY_MODES) {
      expect(EVERYDAY_SCREENS, mode.title).toContain(mode.screen);
    }
  });

  it('gives every tile a blurb and a session shape', () => {
    // § 5's shape is what lets a player pick by how long they have, so an empty one is a tile that
    // silently drops the only thing distinguishing a 3-minute mode from a 5-minute one.
    for (const mode of EVERYDAY_MODES) {
      expect(mode.blurb.trim(), mode.title).not.toBe('');
      expect(mode.shape.trim(), mode.title).not.toBe('');
    }
  });

  it('carries § 18’s four picks, one each, in the picks’ own order', () => {
    // The § 3.3 menu primary follows the selected card by `modePick`, so a duplicated or missing
    // pick is a card the bar cannot name.
    expect(EVERYDAY_MODES.map((mode) => mode.pick)).toEqual([...MODE_PICKS]);
  });
});

describe('a tile either reaches the simulation or says it does not', () => {
  it('refuses in a sentence, never in a greyed-out tile with nothing on it', () => {
    for (const mode of EVERYDAY_MODES) {
      if (isPlayable(mode)) continue;
      expect(mode.unavailable?.trim().length, mode.title).toBeGreaterThan(10);
    }
  });

  it('leaves all four modes playable — the rush was the last tile to open', () => {
    /*
     * Stated as a fact about this build rather than as a design intent. When another mode's
     * Everyday screens land, this case fails — which is the point: the menu's refusals and the tree
     * move together or the failure is visible here rather than on a player's screen. Fix a
     * building's tile opened on the commit that registered `everyday/fixitScreen.ts`; the
     * campaign's on the one that registered all three of `everyday/campaignScreens.ts`'s; the
     * rush's on the one that registered `everyday/rushScreen.ts`.
     *
     * **The list is now every tile, and the case is kept rather than deleted for exactly that
     * reason.** A four-of-four list looks vacuous and is the opposite: `isPlayable` is derived from
     * the screen registry, so this fails the moment a screen is unregistered and its tile starts
     * refusing again — which is the direction that has no other check.
     *
     * *Playable* here means the tile's entry screens are registered and nothing more. The rush's
     * § 3.3 primary is inert over an engine that does not exist, which is a fact about that control
     * and is asserted in `rushScreenModel.test.ts` and in the case below, rather than smuggled into
     * this list.
     */
    const playable = EVERYDAY_MODES.filter(isPlayable).map((mode) => mode.title);
    expect(playable).toEqual(["Today's tower", 'Campaign', 'Endless rush', 'Fix a building']);
    // And the pair, the other way: nothing refuses, and nothing carries a sentence it cannot mean.
    expect(EVERYDAY_MODES.filter((mode) => mode.unavailable !== undefined)).toEqual([]);
  });

  it('derives every tile’s availability from the screen registry, both ways', () => {
    /*
     * The standing requirement, pointed at the tiles: a tile opens exactly when the screens its
     * flow enters through are registered. The campaign needs all three of § 8's screens — a
     * campaign whose desk dead-ends mid-flow is worse than a refused tile — and the other three
     * modes need their own entry screen. A lane that registers a screen flips its tile on the
     * same commit, and this case is what fails when the sentence and the registry disagree.
     */
    const gates = {
      /*
       * Today's tower gates on the whole of § 6's loop rather than on its entry screen alone —
       * set up, watch, read, and see the week. § 6's claim is that this mode is a *loop*, and a
       * mode whose report dead-ends is the shape the campaign row below refuses.
       */
      door: ['door', 'brief', 'stage', 'report', 'week'],
      towers: ['towers', 'building', 'contract'],
      rush: ['rush'],
      fixit: ['fixit'],
    } as const;
    for (const mode of EVERYDAY_MODES) {
      const needed = gates[mode.screen as keyof typeof gates];
      expect(needed, mode.title).toBeDefined();
      expect(isPlayable(mode), mode.title).toBe(needed.every(isScreenBuilt));
    }
  });

  it('opens Today’s tower on § 6.1’s front door, now that the loop’s four screens exist', () => {
    /*
     * This case used to assert the opposite — *straight to the stage, because the door is not
     * built* — and it was right when the door and the brief were unbuilt: a tile that routed
     * through two empty screens was worse than one that skipped them. Both are registered now, so
     * the skip is the stale thing and the guide's own route is the live one. The case is inverted
     * rather than deleted, because *which screen the front tile opens* is exactly the fact a
     * future lane might quietly change back.
     */
    expect(EVERYDAY_MODES[0]?.screen).toBe('door');
    // And the day the tile opens is a day, not a hand-off: the whole loop is registered.
    for (const screen of ['door', 'brief', 'stage', 'report', 'week'] as const) {
      expect(isScreenBuilt(screen), screen).toBe(true);
    }
  });
});

describe('the availability flags describe this tree, not a remembered one', () => {
  it('opens Endless rush onto its setup screen, and keeps the refusal about the missing engine', () => {
    /*
     * The direction this case used to run in was *the tile refuses, and there is still no rush
     * module*. § 9.1's setup screen landed, so the tile opens — and the half that was true stays
     * true and is asserted here rather than deleted: there is still no rush engine on disk, which
     * is why `rushScreenModel.ts` marks the § 3.3 primary inert and publishes a register of what
     * is missing. A tile that opened onto a screen with a live *Start the rush* over nothing would
     * be the silently-does-nothing control this file exists to catch.
     */
    const rush = EVERYDAY_MODES.find((mode) => mode.screen === 'rush');
    expect(rush?.unavailable).toBeUndefined();
    expect(existsSync(`${SRC}everyday/rushScreen.ts`)).toBe(true);
    expect(existsSync(`${SRC}rush`), 'a rush engine exists but the primary still refuses').toBe(
      false,
    );
    expect(RUSH_PRIMARY_REFUSAL).toMatch(/not built/);
    /* The refusal is *on the control*, which is what this file's own rule says — so the assertion
       is that the primary carries that sentence, not merely that it is dead (issue #262). */
    expect(rushBarModel(actionBarFor({ screen: 'rush', ctx: 'rush' })).primary.inert).toBe(
      RUSH_PRIMARY_REFUSAL,
    );
  });

  it('opens the campaign, now that all three of § 8’s screens exist beside its economy', () => {
    /*
     * § D227's rule in the direction a landed screen needs, and this tile is the one that carried
     * the refusal longest: the engine was in the tree and exercised while its Everyday screens were
     * not, so the sentence had to be about the *screen* rather than about the thing. All three are
     * registered now — the triage list, the desk and the contract sheet — so the refusal is gone,
     * and keeping it would be a control telling a player not to touch a thing that works.
     *
     * Asserted against disk in both halves: the engine directory, the § 8 economy the screens are
     * drawn from, and the module that mounts them.
     */
    expect(existsSync(`${SRC}campaign`)).toBe(true);
    expect(existsSync(`${SRC}campaign/economy.ts`)).toBe(true);
    expect(existsSync(`${SRC}everyday/campaignScreens.ts`)).toBe(true);
    const mode = EVERYDAY_MODES.find((candidate) => candidate.screen === 'towers');
    expect(mode?.unavailable).toBeUndefined();
  });

  it('opens Fix a building, now that its screen exists beside its engine', () => {
    /*
     * § D227's rule in the direction a landed screen needs: a refusal kept over a working screen
     * is a control telling the player not to touch a thing that works. The engine directory and
     * the screen module are both asserted on disk, and the tile is asserted open.
     */
    expect(existsSync(`${SRC}fixit`)).toBe(true);
    expect(existsSync(`${SRC}everyday/fixitScreen.ts`)).toBe(true);
    const mode = EVERYDAY_MODES.find((candidate) => candidate.screen === 'fixit');
    expect(mode?.unavailable).toBeUndefined();
  });
});
