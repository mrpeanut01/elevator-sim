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
 * So {@link surfaceStateFor} decides — for a given active tab, a given set of revealed
 * contextual tabs and a given disclosure mode — exactly which buttons are present, which is
 * selected, which is focusable and which panels are hidden. {@link applySurfaceState} is the dumb
 * writer. The same split `controls/render.ts` established, applied to navigation.
 *
 * ## The gate is mode-aware, and it says so on the strip — [§ D330](../../../../DECISIONS.md)
 *
 * GitHub issue #130. Three things were true of the gate at once: nothing told a player the four
 * editors existed, the reveal died on reload, and a hidden tab and an absent feature look
 * identical. § D330 chose *keep the gate, persist the reveal, add the affordance — and never gate
 * Engineer*, because #130 and #110 pull in opposite directions and both are right: dropping the
 * gate ships #110's complaint (Parameters in Casual opening on *58 dimensions, 38 live*) and
 * leaving it fixes neither.
 *
 * All three of its binding conditions land where they can be checked rather than asserted:
 *
 * 1. **The reveal survives a reload.** {@link revealedTabsFrom} and {@link revealedTabsTo} are the
 *    codec; `dev/main.ts` owns the slot, beside `elevator-sim.viewMode`, for that field's own
 *    stated reason. Only the *set* travels through that slot — but say what else does, because the
 *    obvious sentence here is false: `dev/main.ts#syncUrl` keeps the address describing the state
 *    (`SH-09`), so a reload also comes back to `?tab=…`, and the reader lands where they were. That
 *    is why the browser case for this condition leaves the editor before it reads the strip — the
 *    active tab is shown whether or not it was revealed, so a reload straight into the editor
 *    proves nothing about the set.
 * 2. **The affordance's claim is derived from the gate itself.** {@link SurfaceState.gate} counts
 *    the `hidden` flags this function has just computed. There is one computation, so the sentence
 *    and the strip cannot drift — § D227, which rates a stale sentence about a control worse than
 *    a control that does nothing.
 * 3. **Engineer has no gate at all.** `engineer` short-circuits the contextual rule, so every tab
 *    is present on the first frame and the notice is absent. § D299 § 1: a change to Engineer may
 *    make it easier to use, it may not make it say less.
 *
 * This is a **disclosure** rule and not a parity one. `mode/parity.ts` operates on
 * `DisclosureItem`s — figures, warnings, fail states — and a contextual editor's tab button is
 * none of those, so nothing here can hide a failure from Casual.
 */

import {
  CONTEXTUAL_TABS,
  RAIL_SEGMENTS,
  TABS,
  type Elements,
  type RailSegment,
  type TabName,
} from './elementMap.js';
import type { DisclosureMode } from '../live/types.js';

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

/**
 * What the strip says about the editors it is still holding back — issue #130's problem 1.
 *
 * `undefined` rather than a zero-count member, because *"0 more editors"* is a sentence nobody
 * should ever read: the notice exists only while there is something behind the gate, and Engineer
 * never has one at all.
 */
export interface TabGateNotice {
  /**
   * How many contextual editors are hidden right now. **Counted off the `hidden` flags this
   * render produced**, never off `CONTEXTUAL_TABS.length` — the active tab is always shown even
   * before it is revealed, so a constant four would be wrong the moment a player is standing in
   * one. § D330's second condition is that this number and the strip come from one computation.
   */
  readonly hiddenCount: number;
  /** The words, derived from {@link hiddenCount}. */
  readonly text: string;
}

export interface SurfaceState {
  readonly tabs: readonly TabState[];
  /** Visible tabs in strip order — the ring the arrow keys walk. */
  readonly ring: readonly TabName[];
  /** The gate's own announcement, or `undefined` when the strip is holding nothing back. */
  readonly gate: TabGateNotice | undefined;
}

/**
 * The sentence, from the count and nothing else.
 *
 * Not exported, and that is the point rather than tidiness: a caller that could build this string
 * from a number of its own would be free to build it from the *wrong* number, which is the drift
 * § D330's second condition exists to make impossible.
 *
 * It names the rail by the word the rail wears — `#rail-right` is `aria-label="Controls"` and the
 * narrow-window toggle reads *Controls ▸* — so the noun is one a player can find at either width.
 * It is a **note and not a control**: pressing it does nothing, because the rail is already the
 * handoff's only route to these editors (`docs/12` § 1.4 R2) and a second door in the strip would
 * be this file overruling the handoff on what the screen looks like. The standing requirement's
 * other half applies instead — it moves no leg, and `surfaces.test.ts` pins that refusal by a run.
 */
const gateNoticeText = (count: number): string =>
  count === 1
    ? '1 more editor — open it from the Controls rail'
    : `${String(count)} more editors — open them from the Controls rail`;

/**
 * Which tabs are present, selected and focusable.
 *
 * `revealed` is the set of contextual editors the rail has opened. A contextual tab is revealed
 * permanently once opened rather than hidden again on leaving it, because a reader who has been to
 * the dispatcher editor once should be able to get back without going through the rail — and
 * because a control that appears and disappears under the pointer is the interaction defect this
 * project's accessibility ledger calls out by name. Since § D330 that permanence outlives the
 * page: `dev/main.ts` restores the set at boot, so *revealed* means revealed rather than revealed
 * until you close the tab.
 *
 * `disclosure` decides whether there is a gate at all. In `engineer` there is none — every tab is
 * present from the first frame and `revealed` is not consulted, which is the § D299 § 1 clause
 * § D330 turned into code. In `casual` the gate sequences, and sequencing is not a ceiling:
 * nothing is unreachable, and the strip says how much is behind the rail.
 *
 * The active tab is always in the ring even when it is contextual and not yet in `revealed`;
 * a selected button nobody can focus is worse than a visible one.
 */
export function surfaceStateFor(
  active: TabName,
  revealed: ReadonlySet<TabName>,
  disclosure: DisclosureMode,
): SurfaceState {
  const contextual = new Set<TabName>(CONTEXTUAL_TABS);
  const gated = disclosure === 'casual';
  const visible = (tab: TabName): boolean =>
    !gated || !contextual.has(tab) || revealed.has(tab) || tab === active;

  const ring = TABS.filter(visible);
  /*
   * The roving tabindex's `0` goes to the selected tab when it is visible, and to the first visible
   * tab otherwise. `otherwise` is not dead: `active` is always visible by the rule above, so this
   * is the branch that runs when `TABS` is somehow empty — which cannot happen, and is written as a
   * total function anyway because the alternative is `ring[0]!`.
   */
  const focusable = ring.includes(active) ? active : ring[0];

  const tabs = TABS.map((tab): TabState => {
    const shown = visible(tab);
    return {
      tab,
      selected: tab === active,
      hidden: !shown,
      tabIndex: shown && tab === focusable ? 0 : -1,
      panelHidden: tab !== active,
    };
  });

  /*
   * The count is read back off `tabs` rather than recomputed from `revealed`. Recomputing it would
   * be a second opinion about the same question, and the two would agree right up until somebody
   * changed one of them — which is exactly how the sentence this repository keeps finding stale
   * gets written.
   */
  const hiddenCount = tabs.filter((entry) => entry.hidden).length;

  return {
    ring,
    tabs,
    gate: hiddenCount === 0 ? undefined : { hiddenCount, text: gateNoticeText(hiddenCount) },
  };
}

/* -------------------------------------------------------------------------- *
 * The reveal, across a reload — § D330 condition 1
 * -------------------------------------------------------------------------- */

/**
 * The stored reveal, read back — total, and empty on anything it does not recognise.
 *
 * ## Why this is a codec here rather than a field of the session envelope
 *
 * `persist/types.ts#SessionSnapshot` is the **week**, restored whole or not at all, and its own
 * docstring is explicit that its parts constrain each other. A revealed tab constrains nothing:
 * it is a disclosure preference on exactly the footing `viewer.mode` sits on, and that field has
 * held its own `localStorage` key since before `persist/` existed. Folding this into the envelope
 * would mean an unreadable tab name could refuse a player's **week**, which is a wildly
 * disproportionate failure for a fact about a tab strip.
 *
 * So the two-key argument in `persist/types.ts#SESSION_KEY` — *three keys is three states that can
 * disagree* — is answered rather than ignored: it is about a week written at one instant beside
 * settings written at another, and there is no field of either that this set is a second view of.
 *
 * ## Why it is total
 *
 * The bytes were written by whatever build the player last loaded. A tab that no longer exists, a
 * payload that is not an array, a slot somebody edited by hand — every one of them resolves to *no
 * reveal*, which is precisely the state a first visit is in and therefore a state the product is
 * already correct for. There is nothing here worth a refusal a player would have to read.
 *
 * A `Set` is why the field was excluded from the envelope in the first place — `jsonSafety.ts`
 * refuses one by name, because `JSON.stringify(new Set())` is `{}` and loses every entry without
 * an error. The codec is the answer to that: an array of names on the wire, a `Set` in the state.
 */
export function revealedTabsFrom(stored: string | null): ReadonlySet<TabName> {
  if (stored === null) return new Set<TabName>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored) as unknown;
  } catch {
    return new Set<TabName>();
  }
  if (!Array.isArray(parsed)) return new Set<TabName>();
  const known = new Set<string>(CONTEXTUAL_TABS);
  return new Set<TabName>(
    parsed.filter((entry): entry is TabName => typeof entry === 'string' && known.has(entry)),
  );
}

/**
 * The reveal, on its way out.
 *
 * Filtered and ordered by {@link CONTEXTUAL_TABS} rather than written out in iteration order, so
 * the bytes are a function of *what is revealed* and not of *what order it was opened in* — two
 * players who have opened the same editors write the same slot. Only contextual names are stored:
 * a primary tab in this set would be a fact with no consequence, and storing one would invite a
 * reader to think it had one.
 */
export function revealedTabsTo(revealed: ReadonlySet<TabName>): string {
  return JSON.stringify(CONTEXTUAL_TABS.filter((tab) => revealed.has(tab)));
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
  /*
   * The text is cleared as well as hidden. A `hidden` node still holds its words for anything that
   * reads the DOM rather than the paint — a copy, a snapshot, an assistive technology walking the
   * tree — and *4 more editors* left behind in Engineer would be the gate's own sentence surviving
   * the gate, which is the failure this notice exists to stop rather than commit.
   */
  elements.tabGateNote.hidden = state.gate === undefined;
  elements.tabGateNote.textContent = state.gate?.text ?? '';
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

/**
 * Whether <kbd>Escape</kbd> dismisses the drawer — `SH-12` / `KX-11`.
 *
 * True only when the layout is in drawer mode **and** the reader opened it. In column mode the
 * rail is not dismissable, and Escape must not write `drawerOpen: false` over a choice the reader
 * never made — {@link drawerStateFor} remembers that choice across the breakpoint precisely so
 * narrowing the window restores what they had. A closed drawer answers false too, so the caller
 * leaves focus where it is rather than yanking it to the toggle for a key that did nothing.
 */
export function escapeClosesDrawer(viewportPx: number, openedByReader: boolean): boolean {
  const state = drawerStateFor(viewportPx, openedByReader);
  return state.isDrawer && openedByReader;
}
