/**
 * The menu panel, driven through a **document recorder** — the third evidence tier, built.
 *
 * ## Why this file exists, and what it is answering
 *
 * `docs/16` S9 names four tiers of evidence — `static sweep < model walk < document recorder <
 * browser` — and this package had the first, the second (`playthrough/walk.test.ts`) and, since
 * § D220, a browser tier that runs only where a headless shell is provisioned. **The third had
 * never been built**, and every module that names the ladder says so in its own docstring. So
 * every claim about what the menu *puts on a page* was either a claim about a pure function next
 * door or a regex over this file's source.
 *
 * That gap is what made GitHub issue #20's second half unanswerable. The reporter wrote:
 *
 * > *"The Start button is fully styled as enabled/clickable and gives no visual feedback on click.
 * > Nothing happens — the screen doesn't navigate anywhere and there's no error toast."*
 *
 * Reading the source, `menu/screens.ts` sets `enabled: canStart(...)` and a `disabledWhy`, and
 * `renderMenu` writes the `disabled` attribute and swaps the detail line for the reason. Both
 * halves look right, and *looking right* is exactly what the eleven dead seams in this package's
 * history also did. A recorder settles it by observation.
 *
 * ## What a recorder is, and the two things it deliberately is not
 *
 * {@link recorder} is about forty lines: `createElement` returns an object carrying a tag, a class,
 * text, attributes and children, and the handful of members `dev/dom.ts` actually touches. Nothing
 * is parsed, nothing is laid out, and no CSS is consulted.
 *
 * So it is **not a browser**, and it is not jsdom — `docs/05` rules both out and this does not
 * smuggle one in: there is no `window`, no layout, no event dispatch and no selector engine, and
 * the object graph is the panel's own output rather than a re-implementation of the DOM.
 *
 * And it is **not evidence about appearance.** It can prove the `disabled` attribute is written and
 * the reason is on the page. It cannot prove the control *looks* disabled, because that is
 * `index.html`'s stylesheet and this tier cannot see one. Where the two come apart — an attribute
 * set on a control that still reads as a solid primary button — the reporter's *"styled as
 * enabled"* is accurate and the attribute assertion below is not a refutation of it. That
 * distinction is stated here rather than left for a reader to infer from a green test.
 *
 * ## And on this control the two **did** come apart — found here, fixed elsewhere, pinned here
 *
 * The refusal reaches the page as a `.menu-row-detail` span inside the `.menu-start` button, and
 * that span inherited `color: var(--dim)`, a grey styled for a dark card, while the button carries
 * `background: var(--accent)`. Measured while this file was being written, that pairing was
 * **1.03:1**: the one sentence explaining why Start will not start, drawn invisibly on the control
 * it explains, with nowhere else for a player to read it. The same span on an ordinary row sits on
 * `var(--card)` at 6.01:1 and was always fine, so it was the primary button specifically.
 *
 * It is **fixed on the base branch** — `§ D235` / GitHub issue #26 added
 * `.menu-start .menu-row-detail { color: var(--accent-ink) }`, arrived at independently and from
 * the Scenarios screen rather than from this one, and its own comment quotes the same 1.03:1. So
 * issue #20's second half is now closed by both halves: the markup was right all along, and the
 * sentence is legible.
 *
 * The last test below is what stops that coming apart again. It does **not** pin a contrast number
 * — `render/theme.test.ts` owns the ink ladder and a value somebody is tuning is the wrong thing
 * for this file to hold — it pins the *pairing*: the detail line inside the accent-filled button
 * must not be drawn in the colour the detail line on a card is drawn in. That is the invariant the
 * defect broke, stated where the recorder has just proved the sentence is in there.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '@elevator-sim/core';

import { asBuiltChoices, shaftChoices, speedChoices } from '../commissioning/choices.js';
import { reviewCommissioning } from '../commissioning/refusals.js';
import { CONSTRAINTS, commissionableClasses, constraintById } from '../commissioning/types.js';
import { SIGNED_OUT } from '../menu/account.js';
import { catalogueOf, type CatalogueSource } from '../menu/catalogue.js';
import { initialMenuState } from '../menu/menu.js';
import type { CommissioningScreenInput, MenuIntent } from '../menu/screens.js';
import type { MenuCatalogue, MenuState } from '../menu/types.js';
import { RESOURCES } from '../scope/probes.test-helper.js';
import { DATA_DIR } from '../fixtures.test-helper.js';

import { renderMenu, type MenuPanelHost } from './menuPanel.js';

/* -------------------------------------------------------------------------- *
 * The recorder
 * -------------------------------------------------------------------------- */

/** One element as the panel built it. Enough to assert against; nothing a browser would add. */
interface Recorded {
  readonly tag: string;
  className: string;
  textContent: string;
  value: string;
  hidden: boolean;
  readonly attrs: Map<string, string>;
  readonly children: Recorded[];
  readonly listeners: Map<string, (event?: unknown) => void>;
}

/** What a recorder hands back: the document, its root, and the focus a browser would be tracking. */
interface Recorder {
  readonly doc: Document;
  readonly root: Recorded;
  /** Where focus is, as the panel's own `.focus()` calls have moved it. */
  focused: () => Recorded | null;
  /** Put focus somewhere, the way a click or a Tab into the overlay would. */
  focus: (node: Recorded | null) => void;
  /** Send a key to whatever has focus, bubbling to the root. Returns whether it was defaulted. */
  press: (key: string, shiftKey?: boolean) => { readonly prevented: boolean };
}

/**
 * A document whose elements remember what was done to them.
 *
 * Every member below is one `dev/dom.ts` or `dev/menuPanel.ts` actually calls, and the set is
 * small on purpose: a recorder that grew a member nobody uses would be a second, unasserted
 * implementation of the DOM sitting in a test directory.
 *
 * **Four members arrived with the modal** — `hidden`, `contains`, `focus` and the document's
 * `activeElement` — and they arrived because `renderMenu` started calling them, which is the rule
 * this recorder has always been grown by. It is still not a browser: `focus` moves a variable, and
 * `press` calls the root's own handler rather than dispatching through a capture and bubble phase.
 * What it can therefore prove is that **the panel's trap decides correctly given where focus is**,
 * and not that a browser routes the key there. The browser tier is where that second claim lives.
 */
function recorder(): Recorder {
  let active: Recorded | null = null;

  const make = (tag: string): Recorded => {
    const node: Recorded = {
      tag,
      className: '',
      textContent: '',
      value: '',
      hidden: false,
      attrs: new Map(),
      children: [],
      listeners: new Map(),
    };
    return Object.assign(node, {
      setAttribute(key: string, value: string) {
        node.attrs.set(key, value);
      },
      getAttribute(key: string) {
        return node.attrs.get(key) ?? null;
      },
      append(...kids: Recorded[]) {
        node.children.push(...kids);
      },
      replaceChildren(...kids: Recorded[]) {
        node.children.length = 0;
        node.children.push(...kids);
      },
      addEventListener(type: string, handler: (event?: unknown) => void) {
        node.listeners.set(type, handler);
      },
      contains(other: Recorded | null) {
        return other !== null && walk(node).includes(other);
      },
      focus() {
        active = node;
      },
      style: {
        setProperty() {
          /* the menu sets no computed style; recorded as a no-op rather than omitted */
        },
        getPropertyValue: () => '',
      },
    });
  };

  const root = make('div');
  const doc = {
    createElement: (tag: string) => make(tag),
    get activeElement() {
      return active;
    },
  } as unknown as Document;

  return {
    doc,
    root,
    focused: () => active,
    focus: (node) => {
      active = node;
    },
    press: (key, shiftKey = false) => {
      let prevented = false;
      root.listeners.get('keydown')?.({
        key,
        shiftKey,
        preventDefault: () => {
          prevented = true;
        },
      });
      return { prevented };
    },
  };
}

/** Every node in the tree, root first. */
function walk(node: Recorded): readonly Recorded[] {
  return [node, ...node.children.flatMap((child) => walk(child))];
}

/** All the text under a node, in order — what a reader would actually see there. */
function textUnder(node: Recorded): string {
  return walk(node)
    .map((entry) => entry.textContent)
    .filter((text) => text !== '')
    .join(' ');
}

const byClass = (node: Recorded, className: string): readonly Recorded[] =>
  walk(node).filter((entry) => entry.className === className);

/* -------------------------------------------------------------------------- *
 * The host
 * -------------------------------------------------------------------------- */

async function catalogue(): Promise<MenuCatalogue> {
  return catalogueOf((await loadConfig(DATA_DIR)) as unknown as CatalogueSource);
}

/**
 * Render one state and hand back the tree.
 *
 * The host is the minimum `renderMenu` reads: no server, no run on screen, nobody signed in. Those
 * are the arms where the interesting refusals live, which is `playthrough/walk.test.ts`'s own
 * argument for driving the unhappy states rather than the happy one.
 */
function render(
  state: MenuState,
  loaded: MenuCatalogue,
  overrides: Partial<MenuPanelHost> = {},
): Recorder & { readonly asked: MenuIntent[]; readonly draw: () => void } {
  const made = recorder();
  const { doc, root } = made;
  const asked: MenuIntent[] = [];
  const host: MenuPanelHost = {
    doc,
    catalogue: loaded,
    state: () => state,
    dispatch: (intent) => asked.push(intent),
    account: () => SIGNED_OUT,
    leaderboard: () => ({ boards: [], selected: undefined, page: undefined, notice: undefined }),
    runState: () => ({ hasRun: false, rankingRefusal: undefined }),
    viewMode: () => 'advanced',
    challenge: () => undefined,
    commissioning: () => undefined,
    calendarPeriodId: () => '',
    ...overrides,
  };
  const draw = (): void => {
    renderMenu(root as unknown as HTMLElement, host);
  };
  draw();
  return { ...made, asked, draw };
}

/** The Free play screen, with the seed deliberately broken so `canStart` refuses. */
const brokenFreePlay = (loaded: MenuCatalogue): MenuState => {
  const base = initialMenuState(loaded);
  return { ...base, screen: 'free-play', freePlay: { ...base.freePlay, seed: 'not-a-seed' } };
};

const wholeFreePlay = (loaded: MenuCatalogue): MenuState => ({
  ...initialMenuState(loaded),
  screen: 'free-play',
});

/**
 * The fabric screen's input, from the shipped `midtown-office` under `new-build`.
 *
 * `MenuPanelHost.commissioning` is allowed to be `undefined` and every case above leaves it so, in
 * which case the screen draws its *no building loaded* fallback: one navigate row, no selects, and
 * nothing for issue #42 to be about. That optionality is how the newest screen came to have no
 * document-tier coverage at all.
 */
const COMMISSIONING: CommissioningScreenInput = (() => {
  const building = RESOURCES.buildings.find((entry) => entry.id === 'midtown-office')?.config;
  if (building === undefined) throw new Error('midtown-office is not loaded');
  const classes = commissionableClasses(RESOURCES.elevatorSpecs);
  const choices = asBuiltChoices(building, classes);
  const constraint = constraintById('new-build') ?? CONSTRAINTS[0];
  if (constraint === undefined) throw new Error('no constraints ship');
  return {
    buildingName: building.name,
    constraintId: constraint.id,
    choices,
    review: reviewCommissioning({
      base: building,
      choices,
      classes,
      specs: RESOURCES.elevatorSpecs,
      constraint,
    }),
    optionsFor: (bankId) => {
      const choice = choices.find((entry) => entry.bankId === bankId);
      const machineClass = classes.find((entry) => entry.id === choice?.machineClassId);
      return {
        shafts: shaftChoices(choice?.shafts ?? 1).map((n) => ({ id: String(n), name: String(n) })),
        machineClass: classes.map((entry) => ({ id: entry.id, name: entry.name })),
        ratedSpeed: speedChoices(machineClass).map((speed) => ({
          id: String(speed),
          name: `${speed.toFixed(2)} m/s`,
        })),
      };
    },
  };
})();

/* -------------------------------------------------------------------------- *
 * Issue #20's second half
 * -------------------------------------------------------------------------- */

describe('a refused Start is disabled in the markup, and says why — GitHub issue #20', () => {
  it('writes the disabled attribute and puts the reason on the page', async () => {
    const loaded = await catalogue();
    const { root } = render(brokenFreePlay(loaded), loaded);

    const start = byClass(root, 'menu-start')[0];
    expect(start, 'the Free play screen no longer renders a Start control').toBeDefined();
    expect(
      start?.attrs.get('disabled'),
      'Start renders without the disabled attribute on a selection the model refuses. The ' +
        'reporter pressed it and nothing happened; this is the half of that a document can answer.',
    ).toBe('disabled');

    // Disabled **and explained** — the rule `menuPanel.ts` has carried since it landed, asserted
    // against what reached the page rather than against the affordance that described it.
    const detail = start?.children.find((child) => child.className === 'menu-row-detail');
    expect(detail?.textContent ?? '', 'Start is refused in silence').not.toBe('');
    expect(textUnder(root)).toContain('A seed is 1–20 digits');
  });

  it('leaves it enabled, and unexplained, when the selection is whole', async () => {
    /*
     * The other direction, and the one that stops the assertion above passing on a Start that is
     * *always* disabled — which, until the base branch fixed the opening selection, is what a
     * player actually met on this screen.
     */
    const loaded = await catalogue();
    const { root } = render(wholeFreePlay(loaded), loaded);

    const start = byClass(root, 'menu-start')[0];
    expect(start?.attrs.has('disabled'), 'a whole selection still renders a disabled Start').toBe(
      false,
    );
    expect(start?.children.some((child) => child.className === 'menu-row-detail')).toBe(false);
  });

  it('is drawn in a colour meant for the surface it sits on', async () => {
    /*
     * The half a document recorder cannot see, pinned as a **pairing** rather than as a number.
     *
     * `.menu-row-detail` is styled for a card. Inside `.menu-start` it sits on the accent fill
     * instead, and inheriting the card colour there measured 1.03:1 — present in the DOM, invisible
     * on the screen, at the one moment a player needs it. `§ D235` fixed it from the Scenarios
     * screen; this asserts the override still exists and still *differs*, so a future tidy that
     * deletes it as redundant fails here rather than on a player's screen.
     *
     * Deliberately no contrast figure: `render/theme.test.ts` owns the ink ladder, and a test in
     * this file holding a value that lane is tuning would fail on their fix.
     */
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

    const base = /\.menu-row-detail\s*\{([^}]*)\}/.exec(html);
    const onAccent = /\.menu-start\s+\.menu-row-detail\s*\{([^}]*)\}/.exec(html);
    expect(base, 'the row detail line has no rule at all').not.toBeNull();
    expect(
      onAccent,
      'the refusal under a disabled Start has no rule of its own, so it inherits a colour styled ' +
        'for a card and is drawn on the accent fill. That is GitHub issue #26 and it is how issue ' +
        '#20 came to look like "nothing happens": the reason was on the page and unreadable.',
    ).not.toBeNull();

    const colourOf = (block: string): string => /color:\s*([^;}]+)/.exec(block)?.[1]?.trim() ?? '';
    expect(colourOf(base?.[1] ?? ''), 'the base rule declares no colour').not.toBe('');
    expect(
      colourOf(onAccent?.[1] ?? ''),
      'the detail line on the accent-filled button is drawn in the same colour as the detail line ' +
        'on a card. Those are two different surfaces and one token cannot serve both.',
    ).not.toBe(colourOf(base?.[1] ?? ''));
    await Promise.resolve();
  });

  it('presses it, and the intent reaches the host', async () => {
    // The third thing the reporter described — *nothing happens* — at the tier that can see it.
    // A click handler is attached and it dispatches `start`; what the shell does with it is
    // `menu/enterFreePlay.test.ts`'s, compared on the legs.
    const loaded = await catalogue();
    const { root, asked } = render(wholeFreePlay(loaded), loaded);
    byClass(root, 'menu-start')[0]?.listeners.get('click')?.();
    expect(asked).toEqual([{ kind: 'start' }]);
  });
});

/* -------------------------------------------------------------------------- *
 * How to play — GitHub issue #13
 * -------------------------------------------------------------------------- */

describe('the how-to-play entry reaches the page', () => {
  it('sits inside the menu list as a disclosure, closed and carrying its own label', async () => {
    const loaded = await catalogue();
    const { root } = render(initialMenuState(loaded), loaded);

    const list = byClass(root, 'menu-list')[0];
    expect(list, 'the root screen renders no menu list').toBeDefined();

    const entry = list?.children.find((child) => child.tag === 'details');
    expect(entry, 'the guide is not in the list the six destinations are in').toBeDefined();
    // Closed on arrival: nothing writes `open`, so it blocks neither the six rows nor the screen.
    expect(entry?.attrs.has('open')).toBe(false);

    const summary = entry?.children.find((child) => child.tag === 'summary');
    expect(summary?.className, 'the entry is drawn in the row vocabulary').toBe('menu-row');
    expect(textUnder(summary as Recorded)).toContain('How to play');
    // It says that it opens, in words: the row card takes the disclosure triangle away, and KB-15
    // forbids a signal carried by shape alone.
    expect(textUnder(summary as Recorded)).toContain('Opens here, and starts nothing');
  });

  it('puts every section of the guide on the page', async () => {
    const loaded = await catalogue();
    const { root } = render(initialMenuState(loaded), loaded);
    const text = textUnder(root);

    for (const heading of [
      'What you are actually doing',
      'The three ways in',
      'What a shift is',
      'The six things Free play lets you set',
      'The dispatchers, and what each one does',
      'What the numbers will and will not say',
      'A first run',
    ]) {
      expect(text, `the guide's "${heading}" section never reached the page`).toContain(heading);
    }
    // Non-vacuity: the walk really is reading the guide's paragraphs and not only its headings.
    expect(text).toContain('one dispatcher beat another');
  });

  it('offers it on the root screen only', async () => {
    const loaded = await catalogue();
    const elsewhere = render({ ...initialMenuState(loaded), screen: 'settings' }, loaded);
    expect(walk(elsewhere.root).some((node) => node.tag === 'details')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * The transport — GitHub issues #44 and #42
 * -------------------------------------------------------------------------- */

/** Every `<select>` the panel drew, in the order it drew them. */
const selectsIn = (root: Recorded): readonly Recorded[] =>
  walk(root).filter((node) => node.tag === 'select');

/** Choose an option the way a browser does: set the value, then fire the change. */
function choose(select: Recorded, value: string): void {
  select.value = value;
  select.listeners.get('change')?.();
}

describe('a select dispatches an intent about the option that was chosen', () => {
  /**
   * The tier that would have caught it, and the reason the two below it did not.
   *
   * `playthrough/walk.test.ts` presses every option of every select — and it builds the intent it
   * presses with the *same* condition the panel used, so it skipped the four intents that were
   * broken and asserted nothing about them. A model walk that reproduces the transport cannot
   * measure it. Here the panel builds the element, the element's own listener runs, and what the
   * host receives is read back — so the rewrite is observed rather than restated.
   */
  it('carries the calendar period the player picked — issue #44', async () => {
    const loaded = await catalogue();
    const { root, asked } = render({ ...initialMenuState(loaded), screen: 'campaign' }, loaded);

    const select = selectsIn(root)[0];
    expect(select, 'the Scenarios screen renders no Calendar select').toBeDefined();
    const options = (select?.children ?? []).map((child) => child.attrs.get('value') ?? '');
    const wanted = options.find((value) => value !== '');
    expect(wanted, 'the Calendar offers nothing but an ordinary week').toBeDefined();

    choose(select as Recorded, wanted ?? '');
    expect(
      asked,
      'the Calendar dispatched an intent naming the period that was already on. Measured in a ' +
        'browser before the fix: the select read "" before choosing Vacation week and "" after it.',
    ).toEqual([{ kind: 'set-calendar', periodId: wanted }]);
  });

  it('carries every fabric dimension the player picked — issue #42', async () => {
    const loaded = await catalogue();
    const { root, asked } = render(
      { ...initialMenuState(loaded), screen: 'commissioning' },
      loaded,
      { commissioning: () => COMMISSIONING },
    );

    const selects = selectsIn(root);
    expect(selects.length, 'the fabric screen renders no selects').toBeGreaterThan(1);

    const picked: string[] = [];
    for (const select of selects) {
      const options = select.children.map((child) => child.attrs.get('value') ?? '');
      const showing = select.children.find((child) => child.attrs.has('selected'))?.attrs.get('value');
      const wanted = options.find((value) => value !== showing);
      if (wanted === undefined) continue;
      picked.push(wanted);
      choose(select, wanted);
    }

    expect(picked.length, 'every fabric select offered only the value already built').toBeGreaterThan(1);
    expect(asked.length, 'a dimension was chosen and nothing was dispatched').toBe(picked.length);
    for (const [index, intent] of asked.entries()) {
      /*
       * The chosen string has to be **on** the intent. Read structurally rather than through a table
       * of *which field this kind puts its value in*: such a table would be a second copy of
       * `withChosenValue`'s own, so a wrong entry would be wrong in both and the check would agree
       * with the defect it exists to find.
       */
      expect(
        Object.values(intent).some((field) => field === picked[index]),
        `${intent.kind} reached the host without "${picked[index] ?? ''}" on it — the player chose ` +
          'one option and the menu asked for the one already showing',
      ).toBe(true);
    }
    // The `Under` row is the constraint, and it was one of the four the old ternary dropped.
    expect(asked.map((intent) => intent.kind)).toContain('set-constraint');
    expect(asked.map((intent) => intent.kind)).toContain('set-commissioning');
  });

  it('still carries the two the old rewrite already handled', async () => {
    // The control case. If this fails alongside the two above, the fault is not in the rewrite.
    const loaded = await catalogue();
    const { root, asked } = render(wholeFreePlay(loaded), loaded);
    const select = selectsIn(root)[0];
    const options = (select?.children ?? []).map((child) => child.attrs.get('value') ?? '');
    const showing = (select?.children ?? []).find((child) => child.attrs.has('selected'))?.attrs.get('value');
    const wanted = options.find((value) => value !== showing);
    choose(select as Recorded, wanted ?? '');
    expect(asked).toEqual([{ kind: 'set-free-play', field: 'buildingId', value: wanted }]);
  });
});

/* -------------------------------------------------------------------------- *
 * The overlay is a modal — GitHub issues #33 and #68
 * -------------------------------------------------------------------------- */

describe('the overlay behaves like the dialog it looks like', () => {
  it('says it is a modal dialog, and says which one', async () => {
    /*
     * Measured on the shipped page before the change, with the Leaderboard overlay covering the
     * screen: `role: null`, `aria-modal: null`, `body[inert]: false`, and the shell's own tabs and
     * comboboxes still exposed. Issue #33's own words: *"There is no `dialog` role, no `aria-modal`,
     * and no `inert`/`aria-hidden` on the background."* Two of those three are this file's; the
     * third is `dev/main.ts`'s and is filed rather than faked here.
     */
    const loaded = await catalogue();
    const { root } = render({ ...initialMenuState(loaded), screen: 'leaderboard' }, loaded);
    expect(root.attrs.get('role')).toBe('dialog');
    expect(root.attrs.get('aria-modal')).toBe('true');
    // Named, and named by the screen — so a reader's dialog list says *Leaderboard* rather than
    // repeating whatever the first button happens to be called.
    expect(root.attrs.get('aria-label')).toBe('Leaderboard');
  });

  it('holds Tab at the end of the menu instead of dropping the player behind it — issue #68', async () => {
    /*
     * The functional half, and the more serious one. #68 is #33's mechanism with a consequence: the
     * reporter tabbed out of the *Settings* screen — *"These change how the simulation is drawn,
     * never what it computes"* — reached the seed field behind the overlay, typed `424242`, and
     * re-seeded the run. Measured before the change, six Tab presses from the first row landed on
     * `BODY`, then a link, then a button, then a `<select>`, every one of them outside the overlay.
     */
    const loaded = await catalogue();
    const { root, focused, focus, press } = render(
      { ...initialMenuState(loaded), screen: 'settings' },
      loaded,
    );
    const controls = walk(root).filter((node) => node.attrs.has('data-menu-control'));
    expect(controls.length, 'the Settings screen registered no controls at all').toBeGreaterThan(2);

    const last = controls[controls.length - 1];
    focus(last ?? null);
    expect(press('Tab').prevented, 'Tab past the last control was allowed to leave the dialog').toBe(
      true,
    );
    expect(focused(), 'Tab from the last control did not wrap to the first').toBe(controls[0]);

    focus(controls[0] ?? null);
    expect(press('Tab', true).prevented, 'Shift+Tab off the first control was allowed to leave').toBe(
      true,
    );
    expect(focused()).toBe(last);
  });

  it('lets Tab move normally in the middle of the ring', async () => {
    // The other direction, and what stops the trap above passing as *Tab never works*. A dialog
    // that swallowed every Tab would be a worse cage than the one that leaked.
    const loaded = await catalogue();
    const { root, focus, press } = render({ ...initialMenuState(loaded), screen: 'settings' }, loaded);
    const controls = walk(root).filter((node) => node.attrs.has('data-menu-control'));
    focus(controls[0] ?? null);
    expect(press('Tab').prevented, 'the first control refused an ordinary forward Tab').toBe(false);
    expect(press('Escape').prevented, 'the trap is reacting to keys that are not Tab').toBe(false);
  });

  it('brings focus into the overlay, and puts it back on the same control after a redraw', async () => {
    /*
     * The half without which the trap is decorative. `fill` replaces every child on every redraw,
     * so the focused element is destroyed by each state change — and the overlay is appended last
     * to `document.body`, so the next Tab from `<body>` walks into the shell *behind* the menu.
     * That is how #68's reporter reached the seed field: by tabbing forward from nowhere, not by
     * tabbing past the end of a short list.
     */
    const loaded = await catalogue();
    const { root, focused, focus, draw } = render(initialMenuState(loaded), loaded);
    const controls = walk(root).filter((node) => node.attrs.has('data-menu-control'));
    expect(focused(), 'opening the dialog left focus outside it').toBe(controls[0]);

    const third = controls[2];
    expect(third).toBeDefined();
    focus(third ?? null);
    const key = third?.attrs.get('data-menu-control');
    draw();

    const after = walk(root).filter((node) => node.attrs.has('data-menu-control'));
    expect(after[2], 'the redraw did not rebuild the tree').not.toBe(third);
    expect(
      focused()?.attrs.get('data-menu-control'),
      'a redraw moved the reader off the control they were standing on',
    ).toBe(key);
  });

  it('does not reach into a hidden menu for the focus', async () => {
    /*
     * `dev/main.ts#closeMenu` hides the overlay and later draws still run, so without the guard
     * leaving the menu would immediately pull focus back into a screen nobody can see — the same
     * defect as #68 with the sign flipped.
     */
    const loaded = await catalogue();
    const { root, focused, focus, draw } = render(initialMenuState(loaded), loaded);
    focus(null);
    root.hidden = true;
    draw();
    expect(focused(), 'a hidden menu took the focus').toBeNull();
  });

  it('keeps a refused control out of the ring', async () => {
    // A disabled button is not focusable, so a ring that contained one would end on a control Tab
    // never reaches — and Tab would walk straight past it into the shell.
    const loaded = await catalogue();
    const { root } = render(brokenFreePlay(loaded), loaded);
    const start = byClass(root, 'menu-start')[0];
    expect(start?.attrs.get('disabled'), 'this case no longer renders a refused Start').toBe('disabled');
    expect(start?.attrs.has('data-menu-control'), 'a disabled Start is in the focus ring').toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * The recorder is worth trusting
 * -------------------------------------------------------------------------- */

describe('the recorder records', () => {
  it('is not vacuous — it sees the six destinations and their intents', async () => {
    // Without this, every assertion above could pass over an empty tree. The root screen's rows
    // are the cheapest thing to count that the panel did not invent.
    const loaded = await catalogue();
    const { root, asked } = render(initialMenuState(loaded), loaded);
    const rows = byClass(root, 'menu-row').filter((node) => node.tag === 'button');
    expect(rows.length).toBe(6);

    rows[0]?.listeners.get('click')?.();
    expect(asked[0]).toEqual({ kind: 'navigate', to: 'campaign' });
  });
});
