/**
 * **The Scenario hub's contract** — § D525's first tile, GitHub issue #364.
 *
 * The cases here are the ones that would go red if the hub stopped doing the job it exists for:
 * keeping `door` and `fixit` reachable after their own tiles retired. A hub that drew beautifully
 * and pointed at nothing would satisfy every other test in this directory.
 */
import { describe, expect, it } from 'vitest';

import { EVERYDAY_MODES } from './modes.js';
import { isScreenBuilt } from './screens.js';
import { SCENARIO_ABSENCES, scenarioHubViewOf } from './scenarioModel.js';
import { EVERYDAY_SCREENS } from './types.js';

describe('the Scenario hub', () => {
  it('offers every entry as a registered screen — never an invitation to a dead end', () => {
    for (const entry of scenarioHubViewOf().entries) {
      expect(EVERYDAY_SCREENS, entry.id).toContain(entry.screen);
      expect(isScreenBuilt(entry.screen), entry.id).toBe(true);
    }
  });

  it('re-homes both retired tiles, which is the whole reason it exists', () => {
    /*
     * § D525 retires *Today's tower* and *Fix a building* as tiles. Their screens stay registered,
     * so something has to reach them or the registry carries two screens no player can open. This
     * is that assertion, stated positively rather than as the absence of a failure.
     */
    const reached = scenarioHubViewOf().entries.map((entry) => entry.screen);
    expect(reached).toEqual(['door', 'fixit']);

    // And the other half: neither screen is a tile any more, so the hub is the only way in.
    const tiles = EVERYDAY_MODES.map((mode) => mode.screen);
    expect(tiles).not.toContain('door');
    expect(tiles).not.toContain('fixit');
  });

  it('gives every entry a blurb and a session shape, like the tiles it replaces', () => {
    // § 5's shape is how a player picks by how long they have. An entry without one is a row that
    // drops the only thing distinguishing a 3-minute scenario from a 5-minute one.
    for (const entry of scenarioHubViewOf().entries) {
      expect(entry.title.trim(), entry.id).not.toBe('');
      expect(entry.blurb.trim(), entry.id).not.toBe('');
      expect(entry.shape.trim(), entry.id).not.toBe('');
    }
  });

  it('addresses entries by id, and never lets two rows share one', () => {
    const ids = scenarioHubViewOf().entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws the short list’s reason, and keeps its absences a register rather than a mood', () => {
    /*
     * `docs/38` § 2.1 names four sources; two ship. A hub that listed two and said nothing would
     * read as finished. The note is therefore never empty, even when `SCENARIO_ABSENCES` empties —
     * which is the state this case will have to be re-read in when #365 lands.
     */
    const view = scenarioHubViewOf();
    expect(view.note.trim()).not.toBe('');
    expect(view.absences).toBe(SCENARIO_ABSENCES);
    for (const absence of view.absences) {
      expect(absence.trim()).not.toBe('');
      // A register entry says what is missing, not that something is missing.
      expect(absence.length).toBeGreaterThan(20);
    }
  });

  it('is pure — two calls agree, and neither reads a document', () => {
    expect(scenarioHubViewOf()).toEqual(scenarioHubViewOf());
  });
});
