/**
 * The navigation rules, and the one place a constant is duplicated on purpose.
 *
 * Nothing here needs a document: {@link surfaceStateFor} and its friends are pure, which is the
 * whole reason they were extracted out of the old `boot()`.
 */

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CONTEXTUAL_TABS, ELEMENT_IDS, RAIL_SEGMENTS, TABS, type TabName } from './elementMap.js';
import {
  DRAWER_BREAKPOINT_PX,
  drawerStateFor,
  escapeClosesDrawer,
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

describe('Escape and the drawer — SH-12 / KX-11', () => {
  it('dismisses an open drawer below the breakpoint', () => {
    expect(escapeClosesDrawer(DRAWER_BREAKPOINT_PX - 1, true)).toBe(true);
  });

  it('does nothing when the drawer is already closed', () => {
    // The caller moves focus to the toggle only on a real close; a false here is what keeps
    // Escape from stealing focus for a key that changed nothing.
    expect(escapeClosesDrawer(DRAWER_BREAKPOINT_PX - 1, false)).toBe(false);
  });

  it('is inert in column mode, whatever the reader last chose', () => {
    /*
     * In column mode the rail is always shown and `drawerOpen` is a *remembered* choice, not an
     * applied one. Escape writing it to false here would silently close the drawer the reader had
     * open the next time the window narrows — a change to state the key visibly did nothing to.
     */
    for (const opened of [true, false]) {
      expect(escapeClosesDrawer(DRAWER_BREAKPOINT_PX, opened)).toBe(false);
      expect(escapeClosesDrawer(DRAWER_BREAKPOINT_PX + 400, opened)).toBe(false);
    }
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

describe('the open drawer must not cover its own toggle — RR-11', () => {
  /*
   * Driven red 2026-07-30 (§ D198): below 1340 px the drawer overlay (`.rail-r`, `z-index: 20`,
   * `width: min(var(--rail-right), 90vw)`) lay over the tab strip's right end where
   * `#drawer-toggle` sits, so the button labelled *Close controls* could not be pressed — a
   * pointer-only reader could not close what they opened, and Escape was accidentally the only
   * exit. The handoff's own drawer treatment (`design.html` :2447) is that the toggle *is* the
   * close control — `drawerLabel` reads 'Close controls' while open, and no close control exists
   * inside the drawer — so the fix is (b) of the two natural ones: the toggle stacks above the
   * overlay, no new chrome. Same stylesheet-pin idiom as RX-03 below: the 1339 px block is the
   * only thing that lays the drawer out, and no script consults either z-index.
   */
  it('the 1339px media block stacks the toggle above the drawer overlay', async () => {
    const html = await readFile(
      fileURLToPath(new URL('../../index.html', import.meta.url)),
      'utf8',
    );
    const start = html.indexOf(`@media (max-width: ${String(DRAWER_BREAKPOINT_PX - 1)}px)`);
    expect(start).toBeGreaterThan(-1);
    const rest = html.slice(start + 1);
    const nextBoundary = [rest.indexOf('@media'), rest.indexOf('</style>')]
      .filter((at) => at !== -1)
      .reduce((a, b) => Math.min(a, b), rest.length);
    const block = rest.slice(0, nextBoundary);
    const drawerZ = /\.rail-r\s*\{[^}]*z-index:\s*(\d+)/.exec(block);
    const toggleZ = /#drawer-toggle\s*\{[^}]*z-index:\s*(\d+)/.exec(block);
    expect(drawerZ?.[1], 'the drawer overlay carries its z-index').toBeDefined();
    expect(toggleZ?.[1], 'the toggle carries a z-index in the same block').toBeDefined();
    // z-index does nothing on a static element: the toggle must also be positioned.
    expect(block).toMatch(/#drawer-toggle\s*\{[^}]*position:\s*relative/);
    expect(Number(toggleZ?.[1])).toBeGreaterThan(Number(drawerZ?.[1]));
  });
});

describe('the stacked layout below 768 px — RX-03', () => {
  /*
   * No TypeScript constant this time, deliberately: the stylesheet is the only thing that lays the
   * stacked column out, no script consults the breakpoint, and a `STACK_BREAKPOINT_PX` whose only
   * reader is this test would be exactly the caller-less seam the standing requirement names. So
   * the test pins the stylesheet itself: the 767 px block must exist and must contain the three
   * declarations that make the layout a stack — the body becomes one scrolling column, the left
   * rail loses its column border for a top one, and the stage keeps at least 60% of the viewport
   * height. Driving found the defect (375×667: the left rail held 236 px and the canvas 0% of the
   * height); this is what stops it coming back.
   */
  it('the 767px media block stacks the body and floors the canvas at 60vh', async () => {
    const html = await readFile(
      fileURLToPath(new URL('../../index.html', import.meta.url)),
      'utf8',
    );
    const start = html.indexOf('@media (max-width: 767px)');
    expect(start).toBeGreaterThan(-1);
    const rest = html.slice(start + 1);
    const nextBoundary = [rest.indexOf('@media'), rest.indexOf('</style>')]
      .filter((at) => at !== -1)
      .reduce((a, b) => Math.min(a, b), rest.length);
    const block = rest.slice(0, nextBoundary);
    // One scrolling column instead of the grid, with the stage ordered first.
    expect(block).toMatch(/\.body\s*\{[^}]*flex-direction:\s*column/);
    expect(block).toMatch(/\.body\s*\{[^}]*overflow-y:\s*auto/);
    expect(block).toMatch(/\.stagecol\s*\{[^}]*order:\s*-1/);
    // The canvas height floor: #stage fills .stage-wrap (height: 100% in the base rules).
    expect(block).toMatch(/\.stage-wrap\s*\{[^}]*min-height:\s*60vh/);
    // The left rail reads as a stacked section rather than a column.
    expect(block).toMatch(/\.rail-l\s*\{[^}]*border-top/);
  });
});

/* -------------------------------------------------------------------------- *
 * The menu has a stylesheet — `docs/16` § 5 clause 7
 * -------------------------------------------------------------------------- */

describe('every class the menu emits has a rule', () => {
  /**
   * The class names `menuPanel.ts` actually writes, derived from its source rather than listed.
   *
   * Listed, this test would be the sixth hand-maintained list in a branch that has already had to
   * widen five by hand (§ D213) — and it would fail in the worst direction, quietly checking fewer
   * class names than the panel emits. Derived, a class added tomorrow is red the same day.
   */
  function emittedClasses(): readonly string[] {
    const source = readFileSync(new URL('./menuPanel.ts', import.meta.url), 'utf8');
    const found = new Set<string>();
    for (const match of source.matchAll(/className:\s*'([a-z-]+)'/gu)) {
      const name = match[1];
      if (name !== undefined && name.startsWith('menu-')) found.add(name);
    }
    // Written as a conditional expression rather than a literal, so the three the affordance
    // renderer picks between are seen too.
    for (const match of source.matchAll(/'(menu-[a-z-]+)'/gu)) {
      const name = match[1];
      if (name !== undefined) found.add(name);
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }

  it('finds the class names by reading the panel', () => {
    // A negative control on the derivation itself: if the regex stopped matching, the assertion
    // below would pass over an empty set and report a stylesheet that covers nothing.
    expect(emittedClasses().length).toBeGreaterThanOrEqual(12);
  });

  it('has a rule in index.html for each of them', async () => {
    /*
     * The clause. Twenty-nine class names shipped with **zero** rules anywhere, on markup appended
     * after a `100vh` shell that does not scroll — so the menu was not an overlay over the game, it
     * was unstyled markup below the fold. Nothing about that looks broken in a screenshot of the
     * game, which is why it survived a review.
     */
    const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
    const missing = emittedClasses().filter((name) => !html.includes(`.${name}`));
    expect(missing, 'class names the panel emits and the stylesheet never mentions').toEqual([]);
  });

  it('puts the overlay above the drawer', async () => {
    // The drawer is `z-index: 20` and is an overlay itself below 1340 px. A menu that shared or
    // undercut that would open *behind* the rail on a narrow window, which reads as not opening.
    const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
    const block = html.slice(html.indexOf('.menu-overlay {'));
    const zIndex = /z-index:\s*(\d+)/u.exec(block.slice(0, 400))?.[1];
    expect(zIndex).toBeDefined();
    expect(Number(zIndex)).toBeGreaterThan(20);
  });

  it('offers a way back to it', async () => {
    // Clause 5's other half: the button exists in the markup, and `elementMap.ts` requires it, so a
    // build that dropped it fails at `resolveElements` rather than silently losing the menu again.
    const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toContain('id="open-menu"');
    expect(ELEMENT_IDS.header.openMenu).toBe('open-menu');
  });
});
