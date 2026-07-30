/**
 * The surface machinery: which tab is showing, which rail segment is open, and whether the rail is
 * a column or a drawer.
 *
 * ## Why the *decisions* are pure and only the writing is not
 *
 * The old viewer's tab machinery was a loop over `TABS` inside a 1 060-line `boot()`. It worked,
 * and it was untestable for the ordinary reason: reaching it needed a document. That was tolerable
 * for two tabs and a `hidden` attribute.
 *
 * The design handoff makes it not tolerable. There are now ten surfaces, four of which are
 * **contextual** — their tab buttons are absent from the strip until the right rail opens one
 * (`docs/12-design-handoff.md` § 1.3 M1) — and a roving tabindex has to skip the hidden ones or
 * keyboard navigation walks into a button nobody can see. That is a rule with an off-by-one in it,
 * and a rule with an off-by-one in it belongs in a pure function.
 *
 * So {@link surfaceStateFor} decides — for a given active tab and a given set of revealed
 * contextual tabs — exactly which buttons are present, which is selected, which is focusable and
 * which panels are hidden. {@link applySurfaceState} is the dumb writer. The same split
 * `controls/render.ts` established, applied to navigation.
 */

import {
  CONTEXTUAL_TABS,
  RAIL_SEGMENTS,
  TABS,
  type Elements,
  type RailSegment,
  type TabName,
} from './elementMap.js';

/** What one tab button should look like. */
export interface TabState {
  readonly tab: TabName;
  readonly selected: boolean;
  /** Absent from the strip entirely — a contextual editor nobody has opened. */
  readonly hidden: boolean;
  /** The roving tabindex: exactly one visible tab is `0` and every other is `-1`. */
  readonly tabIndex: 0 | -1;
  readonly panelHidden: boolean;
}

export interface SurfaceState {
  readonly tabs: readonly TabState[];
  /** Visible tabs in strip order — the ring the arrow keys walk. */
  readonly ring: readonly TabName[];
}

/**
 * Which tabs are present, selected and focusable.
 *
 * `revealed` is the set of contextual editors the rail has opened this session. A contextual tab
 * is revealed permanently once opened rather than hidden again on leaving it, because a reader who
 * has been to the dispatcher editor once should be able to get back without going through the rail
 * — and because a control that appears and disappears under the pointer is the interaction defect
 * this project's accessibility ledger calls out by name.
 *
 * The active tab is always in the ring even when it is contextual and not yet in `revealed`;
 * a selected button nobody can focus is worse than a visible one.
 */
export function surfaceStateFor(active: TabName, revealed: ReadonlySet<TabName>): SurfaceState {
  const contextual = new Set<TabName>(CONTEXTUAL_TABS);
  const visible = (tab: TabName): boolean =>
    !contextual.has(tab) || revealed.has(tab) || tab === active;

  const ring = TABS.filter(visible);
  /*
   * The roving tabindex's `0` goes to the selected tab when it is visible, and to the first visible
   * tab otherwise. `otherwise` is not dead: `active` is always visible by the rule above, so this
   * is the branch that runs when `TABS` is somehow empty — which cannot happen, and is written as a
   * total function anyway because the alternative is `ring[0]!`.
   */
  const focusable = ring.includes(active) ? active : ring[0];

  return {
    ring,
    tabs: TABS.map((tab): TabState => {
      const shown = visible(tab);
      return {
        tab,
        selected: tab === active,
        hidden: !shown,
        tabIndex: shown && tab === focusable ? 0 : -1,
        panelHidden: tab !== active,
      };
    }),
  };
}

/** Write a {@link SurfaceState} onto the page. Decides nothing. */
export function applySurfaceState(elements: Elements, state: SurfaceState): void {
  for (const entry of state.tabs) {
    const button = elements.tabs[entry.tab];
    const panel = elements.panels[entry.tab];
    button.hidden = entry.hidden;
    button.setAttribute('aria-selected', entry.selected ? 'true' : 'false');
    button.tabIndex = entry.tabIndex;
    panel.hidden = entry.panelHidden;
  }
}

/**
 * The next tab for an arrow key, wrapping, over the **visible** ring only.
 *
 * `Home` and `End` are the ring's ends rather than `TABS`'s, for the same reason.
 */
export function tabAfterKey(
  state: SurfaceState,
  active: TabName,
  key: string,
): TabName | undefined {
  const ring = state.ring;
  if (ring.length === 0) return undefined;
  const at = ring.indexOf(active);
  const index = at === -1 ? 0 : at;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return ring[(index + 1) % ring.length];
    case 'ArrowLeft':
    case 'ArrowUp':
      return ring[(index - 1 + ring.length) % ring.length];
    case 'Home':
      return ring[0];
    case 'End':
      return ring[ring.length - 1];
    default:
      return undefined;
  }
}

/* -------------------------------------------------------------------------- *
 * The right rail
 * -------------------------------------------------------------------------- */

export interface RailState {
  readonly segments: readonly {
    readonly segment: RailSegment;
    readonly selected: boolean;
    readonly tabIndex: 0 | -1;
    readonly panelHidden: boolean;
  }[];
}

export function railStateFor(active: RailSegment): RailState {
  return {
    segments: RAIL_SEGMENTS.map((segment) => ({
      segment,
      selected: segment === active,
      tabIndex: segment === active ? 0 : -1,
      panelHidden: segment !== active,
    })),
  };
}

export function applyRailState(elements: Elements, state: RailState): void {
  for (const entry of state.segments) {
    const button = elements.rail.segments[entry.segment];
    const panel = elements.rail.panels[entry.segment];
    button.setAttribute('aria-selected', entry.selected ? 'true' : 'false');
    button.tabIndex = entry.tabIndex;
    panel.hidden = entry.panelHidden;
  }
}

export function segmentAfterKey(active: RailSegment, key: string): RailSegment | undefined {
  const at = RAIL_SEGMENTS.indexOf(active);
  const index = at === -1 ? 0 : at;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return RAIL_SEGMENTS[(index + 1) % RAIL_SEGMENTS.length];
    case 'ArrowLeft':
    case 'ArrowUp':
      return RAIL_SEGMENTS[(index - 1 + RAIL_SEGMENTS.length) % RAIL_SEGMENTS.length];
    case 'Home':
      return RAIL_SEGMENTS[0];
    case 'End':
      return RAIL_SEGMENTS[RAIL_SEGMENTS.length - 1];
    default:
      return undefined;
  }
}

/* -------------------------------------------------------------------------- *
 * The drawer — § 1.1 S5
 * -------------------------------------------------------------------------- */

/**
 * The viewport width below which the right rail stops being a column.
 *
 * The handoff's own number (`design.html` `layoutRails`, `w < 1340`). It is duplicated in the
 * stylesheet's `@media (max-width: 1339px)` block because CSS cannot read a TypeScript constant and
 * JavaScript should not be laying out a column — the stylesheet does the layout and this constant
 * exists only so the *toggle's own state* agrees with it. `surfaces.test.ts` is what stops the two
 * drifting: it reads `index.html` and asserts the media query matches.
 */
export const DRAWER_BREAKPOINT_PX = 1340;

export interface DrawerState {
  /** Whether the layout is in drawer mode at all. */
  readonly isDrawer: boolean;
  /** Whether the rail is on screen. Always true in column mode. */
  readonly open: boolean;
  readonly toggleLabel: string;
}

/**
 * The drawer's state for a viewport width and a reader's last choice.
 *
 * In column mode the rail is always shown and the reader's choice is remembered but not applied,
 * so widening the window does not hide a rail they never asked to close, and narrowing it again
 * restores what they had.
 */
export function drawerStateFor(viewportPx: number, openedByReader: boolean): DrawerState {
  const isDrawer = viewportPx < DRAWER_BREAKPOINT_PX;
  const open = !isDrawer || openedByReader;
  return {
    isDrawer,
    open,
    toggleLabel: openedByReader ? 'Close controls' : 'Controls ▸',
  };
}

export function applyDrawerState(elements: Elements, state: DrawerState): void {
  elements.rail.root.hidden = !state.open;
  elements.rail.drawerToggle.textContent = state.toggleLabel;
  elements.rail.drawerToggle.setAttribute('aria-expanded', state.open ? 'true' : 'false');
}
