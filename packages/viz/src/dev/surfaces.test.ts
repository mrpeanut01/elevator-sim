/**
 * The navigation rules, and the one place a constant is duplicated on purpose.
 *
 * Nothing here needs a document: {@link surfaceStateFor} and its friends are pure, which is the
 * whole reason they were extracted out of the old `boot()`.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CONTEXTUAL_TABS, RAIL_SEGMENTS, TABS, type TabName } from './elementMap.js';
import {
  DRAWER_BREAKPOINT_PX,
  drawerStateFor,
  railStateFor,
  segmentAfterKey,
  surfaceStateFor,
  tabAfterKey,
} from './surfaces.js';

const none = new Set<TabName>();

describe('which tabs are present', () => {
  it('hides every contextual editor nobody has opened', () => {
    const state = surfaceStateFor('run', none);
    for (const entry of state.tabs) {
      const contextual = CONTEXTUAL_TABS.includes(entry.tab);
      expect(entry.hidden).toBe(contextual);
    }
    expect(state.ring).toStrictEqual(TABS.filter((tab) => !CONTEXTUAL_TABS.includes(tab)));
  });

  it('reveals a contextual editor once it has been opened, and keeps it revealed', () => {
    const revealed = new Set<TabName>(['dispatcher']);
    // Revealed and *not* active: it stays in the strip, which is the point.
    const state = surfaceStateFor('run', revealed);
    expect(state.ring).toContain('dispatcher');
    expect(state.ring).not.toContain('traffic');
  });

  it('never hides the active tab, even before the rail has revealed it', () => {
    const state = surfaceStateFor('machines', none);
    const machines = state.tabs.find((entry) => entry.tab === 'machines');
    expect(machines?.hidden).toBe(false);
    expect(machines?.selected).toBe(true);
    // A selected button nobody can focus is worse than a visible one.
    expect(machines?.tabIndex).toBe(0);
  });

  it('gives exactly one visible tab a tabindex of 0', () => {
    for (const active of TABS) {
      const state = surfaceStateFor(active, none);
      const focusable = state.tabs.filter((entry) => entry.tabIndex === 0);
      expect(focusable).toHaveLength(1);
      expect(focusable[0]?.hidden).toBe(false);
    }
  });

  it('shows exactly one panel', () => {
    for (const active of TABS) {
      const state = surfaceStateFor(active, none);
      const shown = state.tabs.filter((entry) => !entry.panelHidden);
      expect(shown.map((entry) => entry.tab)).toStrictEqual([active]);
    }
  });
});

describe('arrow keys walk the visible ring', () => {
  it('skips a hidden contextual editor rather than focusing it', () => {
    const state = surfaceStateFor('scenarios', none);
    // `scenarios` is third; the next visible surface is `compare`, not `dispatcher`.
    expect(tabAfterKey(state, 'scenarios', 'ArrowRight')).toBe('compare');
    expect(tabAfterKey(state, 'run', 'ArrowLeft')).toBe('parameters');
  });

  it('walks into a revealed editor', () => {
    const state = surfaceStateFor('scenarios', new Set<TabName>(['dispatcher']));
    expect(tabAfterKey(state, 'scenarios', 'ArrowRight')).toBe('dispatcher');
  });

  it('wraps, and answers Home and End with the ring’s own ends', () => {
    const state = surfaceStateFor('run', none);
    const ring = state.ring;
    expect(tabAfterKey(state, ring[ring.length - 1] as TabName, 'ArrowRight')).toBe(ring[0]);
    expect(tabAfterKey(state, 'run', 'Home')).toBe(ring[0]);
    expect(tabAfterKey(state, 'run', 'End')).toBe(ring[ring.length - 1]);
  });

  it('answers nothing for a key it does not handle', () => {
    expect(tabAfterKey(surfaceStateFor('run', none), 'run', 'Enter')).toBeUndefined();
  });
});

describe('the right rail', () => {
  it('shows exactly one segment and gives it the tabindex', () => {
    for (const active of RAIL_SEGMENTS) {
      const state = railStateFor(active);
      expect(state.segments.filter((entry) => entry.selected)).toHaveLength(1);
      expect(state.segments.filter((entry) => entry.tabIndex === 0)).toHaveLength(1);
      expect(state.segments.filter((entry) => !entry.panelHidden).map((e) => e.segment)).toStrictEqual([
        active,
      ]);
    }
  });

  it('wraps on the arrow keys', () => {
    expect(segmentAfterKey('machines', 'ArrowRight')).toBe('dispatcher');
    expect(segmentAfterKey('dispatcher', 'ArrowLeft')).toBe('machines');
    expect(segmentAfterKey('traffic', 'PageDown')).toBeUndefined();
  });
});

describe('the drawer', () => {
  it('is a column above the breakpoint, whatever the reader last chose', () => {
    for (const opened of [true, false]) {
      const state = drawerStateFor(DRAWER_BREAKPOINT_PX, opened);
      expect(state.isDrawer).toBe(false);
      // A rail they never asked to close must not vanish when the window widens.
      expect(state.open).toBe(true);
    }
  });

  it('is closed by default below the breakpoint, and opens on request', () => {
    expect(drawerStateFor(DRAWER_BREAKPOINT_PX - 1, false).open).toBe(false);
    expect(drawerStateFor(DRAWER_BREAKPOINT_PX - 1, true).open).toBe(true);
  });

  it('labels the toggle by what pressing it will do', () => {
    expect(drawerStateFor(1000, false).toggleLabel).toBe('Controls ▸');
    expect(drawerStateFor(1000, true).toggleLabel).toBe('Close controls');
  });
});

describe('the breakpoint is duplicated in the stylesheet, and the two agree', () => {
  it('matches the @media rule that actually does the layout', async () => {
    const html = await readFile(
      fileURLToPath(new URL('../../index.html', import.meta.url)),
      'utf8',
    );
    /*
     * The stylesheet lays the rail out and this constant only decides the toggle's own state, so
     * the two can drift without either being wrong on its own — the symptom would be a toggle that
     * says "Controls ▸" beside a rail that is already a column. Asserting the pair here is cheaper
     * than noticing that at 1339 px.
     */
    expect(html).toContain(`@media (max-width: ${String(DRAWER_BREAKPOINT_PX - 1)}px)`);
  });
});
