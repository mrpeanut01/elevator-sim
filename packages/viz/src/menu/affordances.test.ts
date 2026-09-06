/**
 * `docs/16` S7 as a checked clause — GitHub issue #178 item 1, § D516.
 *
 * Two claims, and they are different. The model **withholds** a row its mode forbids: driven here
 * on a synthetic row, because no shipped builder produces one. And every shipped screen, over every
 * state the menu's own tests drive, withholds **nothing**: S7 is met by construction and the guard
 * is what turns a future forbidden row into a red build rather than a row that quietly disappears.
 */

import { describe, expect, it } from 'vitest';

import { permits, permittedLineFor } from '../scope/permits.js';
import { RESOURCES } from '../scope/probes.test-helper.js';
import { CHANGE_SCOPES, PLAY_MODES } from '../scope/types.js';

import { MODE_OF_SCREEN, offeredIn } from './affordances.js';
import { catalogueOf } from './catalogue.js';
import { initialMenuState } from './menu.js';
import { screenOf, type MenuAffordance } from './screens.js';
import { MENU_SCREENS } from './types.js';

const CATALOGUE = catalogueOf(RESOURCES);

function row(id: string, scope: MenuAffordance['scope']): MenuAffordance {
  return { id, label: id, kind: 'commit', scope, enabled: true, intent: { kind: 'start' } };
}

describe('offeredIn — the split is the matrix, row by row', () => {
  it('withholds exactly the rows the mode forbids and keeps their order', () => {
    const rows = CHANGE_SCOPES.map((scope) => row(`row.${scope}`, scope));
    for (const mode of PLAY_MODES) {
      const split = offeredIn(mode, rows);
      expect(split.offered.map((r) => r.scope)).toEqual(CHANGE_SCOPES.filter((s) => permits(mode, s)));
      expect(split.withheld.map((r) => r.scope)).toEqual(CHANGE_SCOPES.filter((s) => !permits(mode, s)));
      expect(split.offered.length + split.withheld.length).toBe(rows.length);
    }
  });

  it('withholds a between-days row on the Free Play screen — the docs/16 § 5 clause 3 defect as a rule', () => {
    const split = offeredIn('free-play', [row('a', 'between-games'), row('b', 'between-days'), row('c', 'presentation')]);
    expect(split.offered.map((r) => r.id)).toEqual(['a', 'c']);
    expect(split.withheld.map((r) => r.id)).toEqual(['b']);
  });
});

describe('MODE_OF_SCREEN — every screen has answered', () => {
  it('names a mode or a door for each of the eight screens, and every named mode is a play mode', () => {
    expect(Object.keys(MODE_OF_SCREEN).sort()).toEqual([...MENU_SCREENS].sort());
    for (const screen of MENU_SCREENS) {
      const mode = MODE_OF_SCREEN[screen];
      if (mode !== null) expect(PLAY_MODES).toContain(mode);
    }
  });

  it('puts the rooms inside a mode and leaves the doors outside one', () => {
    expect(MODE_OF_SCREEN['free-play']).toBe('free-play');
    expect(MODE_OF_SCREEN.challenge).toBe('ranked');
    expect(MODE_OF_SCREEN.leaderboard).toBe('ranked');
    expect(MODE_OF_SCREEN.commissioning).toBe('commissioning');
    /* The campaign screen's scenario pick is a between-games row on the way into a mode that forbids
       between-games once entered; mapping it would withhold the row that opens the mode. */
    expect(MODE_OF_SCREEN.campaign).toBeNull();
    expect(MODE_OF_SCREEN.main).toBeNull();
  });
});

describe('S7 on the shipped screens', () => {
  const state = initialMenuState(CATALOGUE);
  const arms = [
    { label: 'no run', hasRun: false, canPost: false },
    { label: 'run, posting', hasRun: true, canPost: true },
  ];

  it('withholds nothing on any screen in any arm — met by construction, and checked', () => {
    for (const arm of arms) {
      for (const screen of MENU_SCREENS) {
        const view = screenOf({
          state: { ...state, screen },
          catalogue: CATALOGUE,
          canPost: arm.canPost,
          hasRun: arm.hasRun,
          hasServer: true,
          boards: [{ boardKey: 'daily:2026-09-06', entries: 3 }],
        });
        expect(view.withheld, `${arm.label} / ${screen}`).toEqual([]);
        const mode = MODE_OF_SCREEN[screen];
        if (mode === null) continue;
        for (const r of view.rows) expect(permits(mode, r.scope), `${screen}: ${r.id} is ${r.scope}`).toBe(true);
      }
    }
  });

  it('says the sentence once, last, on every room and never on a door', () => {
    for (const screen of MENU_SCREENS) {
      const view = screenOf({ state: { ...state, screen }, catalogue: CATALOGUE, canPost: false, hasRun: false });
      const mode = MODE_OF_SCREEN[screen];
      const line = mode === null ? undefined : permittedLineFor(mode);
      if (line === undefined) {
        for (const m of PLAY_MODES) expect(view.notices).not.toContain(permittedLineFor(m));
      } else {
        expect(view.notices[view.notices.length - 1]).toBe(line);
        expect(view.notices.filter((n) => n === line)).toHaveLength(1);
      }
    }
  });

  it('keeps Back offered on every screen but the root, whatever the mode forbids', () => {
    for (const screen of MENU_SCREENS) {
      const view = screenOf({ state: { ...state, screen }, catalogue: CATALOGUE, canPost: false, hasRun: false });
      expect(view.rows.some((r) => r.kind === 'back'), screen).toBe(screen !== 'main');
    }
  });
});
