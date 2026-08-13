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

import { EVERYDAY_MODES, isPlayable } from './modes.js';
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

  it('leaves exactly one mode playable, and it is Today’s tower', () => {
    /*
     * Stated as a fact about this build rather than as a design intent. When a second mode's
     * Everyday screens land, this case fails — which is the point: the menu's refusals and the tree
     * move together or the failure is visible here rather than on a player's screen.
     */
    const playable = EVERYDAY_MODES.filter(isPlayable).map((mode) => mode.title);
    expect(playable).toEqual(["Today's tower"]);
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
      stage: ['stage'],
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

  it('hands Today’s tower straight to the stage, because the door is not built', () => {
    // § 6.1's front door and § 6.2's brief do not exist. The tile skips them rather than routing
    // through two empty screens, and `shell.ts`'s absences register is where that is written down.
    expect(EVERYDAY_MODES[0]?.screen).toBe('stage');
    for (const missing of ['door', 'brief'] as const) {
      expect(EVERYDAY_MODES.map((mode) => mode.screen)).not.toContain(missing);
    }
  });
});

describe('the availability flags describe this tree, not a remembered one', () => {
  it('says Endless rush is unbuilt, and there is still no rush module', () => {
    const rush = EVERYDAY_MODES.find((mode) => mode.screen === 'rush');
    expect(rush?.unavailable).toBeDefined();
    /*
     * The refusal, checked against disk. If somebody builds `everyday/rush/` and leaves this tile
     * saying *not built yet*, that is § D227's defect — a control telling a player not to touch
     * something that now works — and this is the case that catches it.
     */
    expect(existsSync(`${SRC}rush`), 'a rush module exists but the tile still refuses').toBe(false);
  });

  it('does not claim the campaign or Fix-a-building are missing — only their Everyday screens are', () => {
    /*
     * The opposite direction, and the more embarrassing one. Both engines are in the tree and
     * exercised; a refusal reading *not built* would understate the product to the only person
     * reading it. So both directories are asserted present *and* both refusals are asserted to be
     * about the screen rather than about the thing.
     */
    for (const [dir, screen] of [
      ['campaign', 'towers'],
      ['fixit', 'fixit'],
    ] as const) {
      expect(existsSync(`${SRC}${dir}`), dir).toBe(true);
      const mode = EVERYDAY_MODES.find((candidate) => candidate.screen === screen);
      expect(mode?.unavailable, screen).toMatch(/screens? (?:is|are) not built/);
    }
  });
});
