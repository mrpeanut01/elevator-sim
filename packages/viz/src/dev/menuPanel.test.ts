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
import { SIGNED_OUT, updateForm, type AccountForm, type AccountState } from '../menu/account.js';
import type { BoardPage } from '../menu/client.js';
import { catalogueOf, type CatalogueSource } from '../menu/catalogue.js';
import { initialMenuState } from '../menu/menu.js';
import type { ChallengeBoardRow, ChallengeView } from '../menu/challenge.js';
import {
  applyIntent,
  type ChallengeScreenInput,
  type CommissioningScreenInput,
  type MenuIntent,
} from '../menu/screens.js';
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
  checked: boolean;
  hidden: boolean;
  readonly attrs: Map<string, string>;
  readonly children: Recorded[];
  /**
   * The same array as {@link Recorded.children}, under the name the DOM gives it.
   *
   * `dev/dom.ts#reconcile` walks `childNodes` and the panel walks `children`, and they are the same
   * list in a browser too — the difference there is element-versus-node, and this recorder makes no
   * nodes that are not elements. One array rather than two, because two would be a place for them
   * to disagree.
   */
  readonly childNodes: Recorded[];
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
    const children: Recorded[] = [];
    const node: Recorded = {
      tag,
      className: '',
      textContent: '',
      value: '',
      checked: false,
      hidden: false,
      attrs: new Map(),
      children,
      childNodes: children,
      listeners: new Map(),
    };
    return Object.assign(node, {
      setAttribute(key: string, value: string) {
        node.attrs.set(key, value);
      },
      getAttribute(key: string) {
        return node.attrs.get(key) ?? null;
      },
      // Grown because `coverShell` started calling it, which is the only rule this recorder has
      // ever been grown by — `inert` has to come **off** the shell when the overlay closes, and a
      // recorder that could only ever add attributes would report the covering as permanent.
      removeAttribute(key: string) {
        node.attrs.delete(key);
      },
      append(...kids: Recorded[]) {
        node.children.push(...kids);
      },
      replaceChildren(...kids: Recorded[]) {
        node.children.length = 0;
        node.children.push(...kids);
      },
      /*
       * The two `reconcile` needs, and it needs them for the reason it exists: they are the writes
       * that move **one** child, and a recorder that only had `replaceChildren` could not tell a
       * container that rebuilt itself apart from one that left a button where it was. That
       * distinction is the whole of GitHub issue #106.
       */
      removeChild(kid: Recorded) {
        const at = node.children.indexOf(kid);
        if (at >= 0) node.children.splice(at, 1);
        return kid;
      },
      insertBefore(kid: Recorded, before: Recorded | null) {
        const already = node.children.indexOf(kid);
        if (already >= 0) node.children.splice(already, 1);
        const at = before === null ? -1 : node.children.indexOf(before);
        if (at < 0) node.children.push(kid);
        else node.children.splice(at, 0, kid);
        return kid;
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
): Recorder & {
  readonly asked: MenuIntent[];
  readonly draw: () => void;
  /** The one stand-in for the page behind the overlay — see the `inert` cases. */
  readonly shell: Recorded;
} {
  const made = recorder();
  const { doc, root } = made;
  const asked: MenuIntent[] = [];
  const shell = doc.createElement('div') as unknown as Recorded;
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
    shell: () => [shell as unknown as HTMLElement],
    ...overrides,
  };
  const draw = (): void => {
    renderMenu(root as unknown as HTMLElement, host);
  };
  draw();
  return { ...made, asked, draw, shell };
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

  /**
   * **Second, not last** — GitHub issue #98's third recommendation, driven.
   *
   * The issue is a claim about *position*: *"The 'How to play' link is listed last, after Scenarios,
   * Free Play, Challenge, Leaderboard, Account, Settings, and Resume. Most new players will not find
   * it."* That was true — `renderMenu` pushed the entry after every row — and it is the kind of claim
   * only this tier can settle, because the two tiers below it can see the guide **exists** and cannot
   * see where on the page it ended up.
   *
   * It is also the claim `menu/screens.ts#FIRST_VISIT_NOTE` makes to a first-time player in so many
   * words — *"How to play, directly under it"*. A sentence about a layout is pinned by the layout or
   * it is not pinned at all, which is § D227's rule pointed at wayfinding rather than at a refusal.
   */
  it('is drawn directly under the row the screen recommends — issue #98', async () => {
    const loaded = await catalogue();
    for (const mode of ['basic', 'advanced'] as const) {
      const { root } = render(initialMenuState(loaded), loaded, { viewMode: () => mode });
      const list = byClass(root, 'menu-list')[0];
      const kids = list?.children ?? [];

      const recommended = kids.findIndex((child) => child.className.includes('menu-row-primary'));
      const guide = kids.findIndex((child) => child.tag === 'details');
      expect(recommended, `no recommended row on the root in ${mode}`).toBeGreaterThanOrEqual(0);
      expect(guide, `no guide entry on the root in ${mode}`).toBeGreaterThanOrEqual(0);
      expect(guide, `the guide is not directly under the recommended row in ${mode}`).toBe(
        recommended + 1,
      );
      // Non-vacuity in the direction that matters: it must be **above** the ordinary rows, not merely
      // adjacent to the first one. Before this change it was last, so this is the assertion that
      // would have been red.
      expect(kids.length, 'the root draws only the guide and one row').toBeGreaterThan(guide + 1);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The cold start — GitHub issues #90 and #98
 * -------------------------------------------------------------------------- */

describe('the root menu recommends one row, and says so in more than a colour', () => {
  /**
   * The row exists, is first, and carries the recommendation as a **modifier**.
   *
   * #90's complaint is that the root offers rows *"of equal visual weight"* with *"no row that says
   * Start here"*. The first half is a styling claim this tier explicitly cannot answer — see this
   * file's own docstring on what a recorder is not — so what is asserted here is the half a document
   * can carry: the class the stylesheet keys on is written, it is written **alongside** the base
   * class rather than instead of it, and it is on the first row.
   */
  it('puts a recommended row first, without taking the row vocabulary away from it', async () => {
    const loaded = await catalogue();
    for (const mode of ['basic', 'advanced'] as const) {
      const { root } = render(initialMenuState(loaded), loaded, { viewMode: () => mode });
      const list = byClass(root, 'menu-list')[0];
      const first = list?.children[0];
      expect(first?.className, `the first entry on the root is not recommended in ${mode}`).toContain(
        'menu-row-primary',
      );
      // A modifier, never a replacement: the row keeps whichever base class its kind earns, so it
      // keeps that class's padding, border, focus ring and disabled handling.
      expect(
        first?.className.split(' ').filter((name) => name !== 'menu-row-primary'),
        `the recommended row lost its base class in ${mode}`,
      ).toEqual([mode === 'basic' ? 'menu-start' : 'menu-row']);
    }
  });

  /**
   * KB-15, on the one row whose whole job is to be noticed.
   *
   * A recommendation carried only by a tint is invisible to a screen reader, to a monochrome display
   * and to a photocopy — and this repository has already paid for that once, on the board row that
   * marked *which of these is mine* in colour alone. So the words have to say it too, and the words
   * are what this tier can actually read.
   */
  it('says it is the one to press in the row’s own text, not only in its class', async () => {
    const loaded = await catalogue();
    for (const mode of ['basic', 'advanced'] as const) {
      const { root } = render(initialMenuState(loaded), loaded, { viewMode: () => mode });
      const first = byClass(root, 'menu-list')[0]?.children[0];
      const text = textUnder(first as Recorded);
      expect(text, `the recommended row does not name itself in ${mode}`).toContain('Start here');
      expect(text, `the recommended row does not say who it is for in ${mode}`).toContain(
        'if you are new',
      );
    }
  });

  /**
   * **It is not inert**, which is the standing requirement this package exists to keep.
   *
   * A row that looks recommended and dispatches nothing would be the eleventh dead seam wearing the
   * one costume guaranteed to be pressed first. The intent differs by product — § D299's *one door
   * per product* — and both are members the shell's exhaustive switch already performs, so neither
   * arm could compile against a shell that did not handle it.
   */
  it('presses, and asks the shell for the door this product opens', async () => {
    const loaded = await catalogue();
    const casual = render(initialMenuState(loaded), loaded, { viewMode: () => 'basic' });
    byClass(casual.root, 'menu-list')[0]?.children[0]?.listeners.get('click')?.();
    expect(casual.asked, 'Casual’s door does not open the scenarios board').toEqual([
      { kind: 'open-campaign' },
    ]);

    const engineer = render(initialMenuState(loaded), loaded, { viewMode: () => 'advanced' });
    byClass(engineer.root, 'menu-list')[0]?.children[0]?.listeners.get('click')?.();
    expect(engineer.asked, 'Engineer’s door does not open Free play').toEqual([
      { kind: 'navigate', to: 'free-play' },
    ]);
  });

  /**
   * The welcome is a fact about the load, and a host that has not looked says nothing.
   *
   * `undefined` is *nobody has said* — `MenuViewInput.firstVisit`'s rule and `hasServer`'s precedent
   * — so the default host in this file, which has no session store at all, must draw no welcome. A
   * menu that greeted a returning player as a new one is the same class of false claim as one that
   * asserted *needs a server* on a build that has one.
   */
  it('welcomes a first visit, and only when the shell has actually said it is one', async () => {
    const loaded = await catalogue();
    const silent = render(initialMenuState(loaded), loaded);
    expect(textUnder(silent.root)).not.toContain('Nothing was restored');

    const returning = render(initialMenuState(loaded), loaded, { firstVisit: () => false });
    expect(textUnder(returning.root)).not.toContain('Nothing was restored');

    const fresh = render(initialMenuState(loaded), loaded, { firstVisit: () => true });
    const welcome = byClass(fresh.root, 'menu-notice').map((node) => node.textContent).join(' ');
    expect(welcome, 'a first visit gets no welcome').toContain('Nothing was restored');
    // The two wayfinding claims in that sentence are the ones the cases above pin to the page. It
    // may not name a third thing nothing checks.
    expect(welcome).toContain('Start here');
    expect(welcome).toContain('How to play');
  });

  /** The welcome belongs to the screen a player lands on, and to no other. */
  it('says it on the root and nowhere else', async () => {
    const loaded = await catalogue();
    const elsewhere = render({ ...initialMenuState(loaded), screen: 'settings' }, loaded, {
      firstVisit: () => true,
    });
    expect(textUnder(elsewhere.root)).not.toContain('Nothing was restored');
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
     * and no `inert`/`aria-hidden` on the background."* All three are now asserted — the third by
     * the `inert` cases below, over the elements `MenuPanelHost.shell` hands across.
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
    /*
     * The probe key was `Escape` and is now an ordinary letter, because Escape acquired a meaning:
     * it closes the menu (below). The guard is unchanged and still says *the handler owns two keys
     * and no others* — a trap that swallowed every keystroke would make the overlay unusable, and
     * `a` is a key nothing here has any business claiming.
     */
    expect(press('a').prevented, 'the handler is reacting to keys it does not own').toBe(false);
  });

  it('closes the menu on Escape, on every screen including the root — issues #33, #68, #40', async () => {
    /*
     * § D249 § 3 refused binding Escape to `back`: *"it would work on five screens and do nothing on
     * the root, which is exactly where #40's reporter is standing."* So the key is wired to `close`,
     * which is a member of `MenuIntent` and therefore has an arm in the shell's exhaustive switch.
     *
     * Driven on the root **and** on a screen with a history, because the whole point of the refused
     * alternative is that it behaves differently on the two.
     */
    const loaded = await catalogue();
    for (const screen of ['main', 'settings'] as const) {
      const { asked, press } = render({ ...initialMenuState(loaded), screen }, loaded);
      expect(press('Escape').prevented, `${screen}: Escape was left to the browser`).toBe(true);
      expect(asked, `${screen}: Escape asked for something other than a close`).toEqual([
        { kind: 'close' },
      ]);
    }
  });

  it('takes the page behind it out of the document while it is up — issue #33', async () => {
    /*
     * The half § D249 § 3 filed as *needs `dev/main.ts`*. The trap holds the **keyboard**, and only
     * over the controls this file built; it holds no pointer, and nothing focusable inside the
     * overlay that came from elsewhere. Measured before either half existed: 7 focusable controls
     * inside the overlay and **624 in the document**.
     */
    const loaded = await catalogue();
    const { shell } = render(initialMenuState(loaded), loaded);
    expect(shell.attrs.get('inert'), 'the page behind the overlay is still focusable').toBe('');
    expect(shell.attrs.get('aria-hidden'), 'a screen reader can still walk the shell').toBe('true');
  });

  it('gives it back the moment the overlay is hidden', async () => {
    /*
     * The direction that would be catastrophic to get wrong, and the reason the covering is keyed on
     * `root.hidden` with one writer rather than on a flag: a shell left `inert` after the menu
     * closed is a page nobody can click, and it would look completely normal.
     */
    const loaded = await catalogue();
    const { root, shell, draw } = render(initialMenuState(loaded), loaded);
    expect(shell.attrs.has('inert')).toBe(true);
    root.hidden = true;
    draw();
    expect(shell.attrs.has('inert'), 'the shell stayed inert behind a closed menu').toBe(false);
    expect(shell.attrs.has('aria-hidden'), 'the shell stayed hidden behind a closed menu').toBe(false);
  });

  it('brings focus into the overlay, and leaves it there across a redraw', async () => {
    /*
     * The half without which the trap is decorative: the overlay is appended last to
     * `document.body`, so the next Tab from `<body>` walks into the shell *behind* the menu. That
     * is how #68's reporter reached the seed field — by tabbing forward from nowhere, not by
     * tabbing past the end of a short list.
     *
     * **The mechanism under it changed with issue #106 and the promise did not.** This used to
     * assert that the redraw rebuilt the tree and that `restoreFocus` then found the reader's
     * control again by key. Rebuilding is what swallowed the first press of every button beside a
     * text field, so the panel now keeps its controls (`menuPanel.ts#retainer`) and there is
     * nothing to restore in the ordinary case. What a reader gets is unchanged and stronger: the
     * element they were standing on is still the element they are standing on.
     *
     * The non-vacuity guard moved with it. It was *"the redraw did rebuild"*; it is now *"the
     * redraw did happen"*, read off a control the second draw had to write for it to be there.
     */
    const loaded = await catalogue();
    const { root, focused, focus, draw } = render(initialMenuState(loaded), loaded);
    const controls = walk(root).filter((node) => node.attrs.has('data-menu-control'));
    expect(focused(), 'opening the dialog left focus outside it').toBe(controls[0]);

    const third = controls[2];
    expect(third).toBeDefined();
    focus(third ?? null);
    const key = third?.attrs.get('data-menu-control');
    third?.attrs.delete('data-menu-control');
    draw();

    const after = walk(root).filter((node) => node.attrs.has('data-menu-control'));
    expect(
      after.length,
      'the second draw wrote no focus ring at all, so this case proves nothing',
    ).toBe(controls.length);
    expect(after[2], 'the redraw threw the reader’s control away and built another').toBe(third);
    expect(
      focused()?.attrs.get('data-menu-control'),
      'a redraw moved the reader off the control they were standing on',
    ).toBe(key);
  });

  it('puts the reader on the new screen when the control they were on is gone', async () => {
    /*
     * The branch that survives `retainer` and still has work to do: a control keeps its element
     * across a redraw of the *same* screen, and a redraw that changes screen legitimately takes it
     * away. Without this the reader would be left on `<body>`, one Tab from the shell — #68 again.
     */
    const loaded = await catalogue();
    let state = initialMenuState(loaded);
    const made = render(state, loaded, { state: () => state });
    const controls = walk(made.root).filter((node) => node.attrs.has('data-menu-control'));
    made.focus(controls[1] ?? null);

    state = { ...state, screen: 'settings' };
    made.draw();
    const after = walk(made.root).filter((node) => node.attrs.has('data-menu-control'));
    expect(after[0], 'the settings screen registered no controls').toBeDefined();
    expect(
      made.focused(),
      'a screen change left the reader outside the overlay, one Tab from the shell behind it',
    ).toBe(after[0]);
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
 * The account screen — GitHub issues #30 and #31
 * -------------------------------------------------------------------------- */

/** Every control the panel registered, in the order Tab would reach them. */
const controlKeys = (root: Recorded): readonly string[] =>
  walk(root)
    .map((node) => node.attrs.get('data-menu-control'))
    .filter((key): key is string => key !== undefined);

describe('the account screen collects one thing, and never a credential', () => {
  it('renders no password input, label or field anywhere in the tree', async () => {
    /*
     * The document half of § D241's deletion. `menu/client.test.ts` sweeps every shipped module for
     * the literal; this drives the screen and reads what came out, which is the tier that would have
     * caught issue #30 — the reporter's field was in a **panel**, not in the model that fed it.
     */
    const loaded = await catalogue();
    const { root } = render({ ...initialMenuState(loaded), screen: 'account' }, loaded);
    const inputs = walk(root).filter((node) => node.tag === 'input');
    expect(inputs.length, 'the account screen renders no inputs at all').toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input.attrs.get('type'), 'a credential box is on the account screen').not.toBe('password');
    }
    expect(textUnder(root).toLowerCase()).not.toContain('password');
  });

  it('puts the field above the button that submits it — issue #30(a)', async () => {
    /*
     * The reported order was: **Sign in** (primary, filled), **Back**, **Create an account**, then
     * the two live inputs. *"The player reads a call to action, then two navigation buttons, and
     * only then discovers there was a form. Tab order matches the visual order, so a keyboard user
     * hits the submit button first as well."*
     *
     * Read off the focus ring rather than off the markup, because the ring **is** the tab order, so
     * this asserts the half the reporter actually measured rather than a proxy for it.
     */
    const loaded = await catalogue();
    const { root } = render({ ...initialMenuState(loaded), screen: 'account' }, loaded);
    const keys = controlKeys(root);
    const field = keys.findIndex((key) => key.startsWith('account.') && key !== 'account.submit');
    const submit = keys.indexOf('account.submit');
    expect(field, 'the account screen registered no field').toBeGreaterThanOrEqual(0);
    expect(submit, 'the account screen registered no submit').toBeGreaterThanOrEqual(0);
    expect(field, 'Tab reaches the submit before the field it submits').toBeLessThan(submit);
    // …and Back is last, so the ordering is label, input, submit, out — #30's own suggestion.
    expect(keys.indexOf('back')).toBeGreaterThan(submit);
  });
});

/* -------------------------------------------------------------------------- *
 * The first press after typing — GitHub issue #106
 * -------------------------------------------------------------------------- */

/**
 * Everything a container did to its own children, so a redraw that *moved* one is not mistaken for
 * a redraw that left it alone.
 *
 * Node identity after the fact is not enough and that is the whole subtlety of this issue: a
 * browser forgets the element a `mousedown` landed on the instant it is removed, and putting the
 * same object back does not bring the memory back. So what has to be observed is the **write**, not
 * the result — `removeChild` and the `insertBefore` that moves a child already in the list. This
 * patches the two on one recorded node, which is instrumentation over the recorder rather than a
 * member added to it: nothing in the panel calls it, and it asserts about a container the test
 * chose.
 */
function watchChildren(node: Recorded): { readonly touched: readonly Recorded[] } {
  const touched: Recorded[] = [];
  const inner = node as unknown as {
    removeChild: (kid: Recorded) => Recorded;
    insertBefore: (kid: Recorded, before: Recorded | null) => Recorded;
  };
  const removeChild = inner.removeChild.bind(node);
  const insertBefore = inner.insertBefore.bind(node);
  inner.removeChild = (kid) => {
    touched.push(kid);
    return removeChild(kid);
  };
  inner.insertBefore = (kid, before) => {
    if (node.children.includes(kid)) touched.push(kid);
    return insertBefore(kid, before);
  };
  return { touched };
}

/**
 * The account screen with a shell behind it: the host performs `account-form` the way
 * `dev/main.ts` does — `updateForm`, then redraw — rather than merely recording that it was asked.
 *
 * Recording is not enough here. The defect is entirely in *what the redraw does to the tree*, so a
 * host that swallowed the intent would leave the tree it is about untouched and every assertion
 * below would pass over a screen that never redrew.
 */
function accountScreen(loaded: MenuCatalogue): ReturnType<typeof render> & {
  readonly accountNow: () => AccountState;
} {
  let account = SIGNED_OUT;
  let redraw = (): void => {};
  const made = render({ ...initialMenuState(loaded), screen: 'account' }, loaded, {
    account: () => account,
    dispatch: (intent) => {
      made.asked.push(intent);
      if (intent.kind !== 'account-form') return;
      account = updateForm(account, intent.patch as Partial<AccountForm>);
      redraw();
    },
  });
  redraw = made.draw;
  return { ...made, accountNow: () => account };
}

describe('the first press after typing is not swallowed — GitHub issue #106', () => {
  it('leaves the submit button, and its label, exactly where the pointer put them down', async () => {
    /*
     * The reporter's steps, at the tier that can see the mechanism: *"Type into the Account email
     * field, click Email me a link once: no request, no error, no notice. Click again without
     * typing: it works."*
     *
     * The order of events is the entire defect and it is worth spelling out, because the issue's own
     * diagnosis — a rebuild per keystroke — is wrong and there is no `input` listener anywhere in
     * the overlay. `mousedown` on the submit **blurs the field**, blur is what fires `change`,
     * `change` commits the address, committing redraws, and the redraw used to replace every child
     * of the overlay. By `mouseup` the element the press began on was no longer in the document, so
     * the browser had already thrown away the click it was going to dispatch.
     *
     * So this asserts the write rather than the outcome: nothing removed or moved the button, or
     * the span inside it that a pointer is actually standing on.
     */
    const loaded = await catalogue();
    const made = accountScreen(loaded);
    const { root } = made;

    const submit = byClass(root, 'menu-start')[0];
    const label = submit?.children[0];
    const field = walk(root).find((node) => node.tag === 'input');
    const list = byClass(root, 'menu-list')[0];
    expect(submit, 'the account screen renders no submit').toBeDefined();
    expect(field, 'the account screen renders no field').toBeDefined();
    expect(label?.className, 'the submit has no label span to stand on').toBe('menu-row-name');

    const onRoot = watchChildren(root);
    const onList = watchChildren(list as Recorded);
    const onButton = watchChildren(submit as Recorded);

    // Typed, and then committed the way a `mousedown` on the button commits it.
    (field as Recorded).value = 'ada@example.test';
    field?.listeners.get('change')?.();

    expect(
      made.accountNow().form.email,
      'the commit never reached the state, so this case is about nothing',
    ).toBe('ada@example.test');
    expect(
      onButton.touched,
      'the redraw rebuilt the submit’s own label — the span a pointer presses',
    ).not.toContain(label);
    expect(onList.touched, 'the redraw took the submit button out of the list').not.toContain(submit);
    expect(onRoot.touched, 'the redraw took the whole menu list out of the overlay').not.toContain(list);
    // …and it really is the same button, which is the cheap half of the same claim.
    expect(byClass(root, 'menu-start')[0]).toBe(submit);
    expect(byClass(root, 'menu-start')[0]?.children[0]).toBe(label);
  });

  it('leaves it where it is even when the commit changes what else is on screen', async () => {
    /*
     * The case issue #111 is about to make ordinary. A commit that adds or removes a line — a
     * validation issue appearing, a notice being taken back — really does change the shape of the
     * screen, and the button beside it still must not move. This is what makes `reconcile` a
     * reconcile rather than a *skip the write when nothing changed*: the second would carry the
     * case above and put this one straight back.
     */
    const loaded = await catalogue();
    const made = accountScreen(loaded);
    const submit = byClass(made.root, 'menu-start')[0];
    const field = walk(made.root).find((node) => node.tag === 'input');
    const list = byClass(made.root, 'menu-list')[0];
    const before = byClass(made.root, 'menu-issues').length;

    const onRoot = watchChildren(made.root);
    const onList = watchChildren(list as Recorded);
    (field as Recorded).value = 'not-an-address';
    field?.listeners.get('change')?.();

    expect(
      byClass(made.root, 'menu-issues').length,
      'the bad address drew no complaint, so nothing about the screen changed shape',
    ).toBeGreaterThan(before);
    expect(
      onList.touched,
      'a line appearing elsewhere on the screen carried the submit button off with it',
    ).not.toContain(submit);
    expect(onRoot.touched).not.toContain(list);
  });

  it('leaves the reader where the browser is putting them, instead of yanking them back', async () => {
    /*
     * The Tab-then-Enter trap, which is the same defect reached from the keyboard. `change` fires
     * during a blur, and during a blur `document.activeElement` is the body — which used to look
     * exactly like a dialog that had just opened, so `restoreFocus` pulled the reader to
     * `controls[0]`. On this screen `controls[0]` is the address field they were leaving, so Tab
     * out of it landed back in it every time and there was no keyboard route to the button at all.
     */
    const loaded = await catalogue();
    const made = accountScreen(loaded);
    const field = walk(made.root).find((node) => node.tag === 'input');

    made.focus(field ?? null);
    (field as Recorded).value = 'ada@example.test';
    // The blur the browser performs before it hands focus on, and the `change` it fires doing it.
    made.focus(null);
    field?.listeners.get('change')?.();

    expect(
      made.focused(),
      'the commit grabbed the focus back off the control the reader was moving to',
    ).toBeNull();
  });

  it('submits on Enter, having first committed what is in the box', async () => {
    /*
     * The independent half of #106. The account screen is a form in every sense a player can see
     * and none a browser can — the fields are a `<div>`, the submit is `<button type="button">`,
     * and the overlay's keydown handler owns Escape and Tab — so Enter did nothing at all.
     *
     * The **order** is the assertion. Enter fires before the browser's own `change`, so a submit
     * that did not commit first would validate and send the address as it was before the reader
     * typed: on a blank form, the address the server never hears about.
     */
    const loaded = await catalogue();
    const made = accountScreen(loaded);
    const field = walk(made.root).find((node) => node.tag === 'input');

    (field as Recorded).value = 'ada@example.test';
    let defaulted = true;
    field?.listeners.get('keydown')?.({
      key: 'Enter',
      preventDefault: () => {
        defaulted = false;
      },
    });

    expect(made.asked.map((intent) => intent.kind)).toEqual(['account-form', 'account-submit']);
    expect(
      made.accountNow().form.email,
      'Enter asked for a link about an address the state had never been told',
    ).toBe('ada@example.test');
    /*
     * Defaulted away, because a text input's own Enter behaviour is to fire `change` — a second
     * commit of a string the state already holds, arriving after the request has started and
     * clearing the notice it had just earned. `updateForm` refuses a commit that changes nothing
     * for the same reason; this is the other half of that pair.
     */
    expect(defaulted, 'Enter was left to the browser as well as handled here').toBe(false);
  });

  it('refuses Enter exactly where it refuses the button', async () => {
    /*
     * The negative control, and the reason Enter is wired to `MenuScreenView.rows` rather than to
     * an intent this file picked: a keyboard route that bypassed a refusal the screen had already
     * made would be a worse defect than the one being fixed. Free play with a broken seed is the
     * case — Start is disabled and says why, so Enter in the Seed field does exactly as little.
     */
    const loaded = await catalogue();
    const { root, asked } = render(brokenFreePlay(loaded), loaded);
    const seed = walk(root).find((node) => node.attrs.get('data-menu-control') === 'free-play.seed');
    expect(seed, 'the Free play screen renders no seed field').toBeDefined();

    seed?.listeners.get('keydown')?.({ key: 'Enter', preventDefault: () => undefined });
    expect(asked, 'Enter started a run the screen had already refused to start').toEqual([]);

    // …and it does fire where the same screen does offer a Start, so the case above is a refusal
    // rather than a keydown handler that never works.
    const whole = render(wholeFreePlay(loaded), loaded);
    const ready = walk(whole.root).find(
      (node) => node.attrs.get('data-menu-control') === 'free-play.seed',
    );
    ready?.listeners.get('keydown')?.({ key: 'Enter', preventDefault: () => undefined });
    expect(whole.asked.map((intent) => intent.kind)).toEqual(['set-free-play', 'start']);
  });
});

/* -------------------------------------------------------------------------- *
 * The seed field validates the keystroke it is on — GitHub issue #111(a)
 * -------------------------------------------------------------------------- */

/**
 * The Free play screen with a live host: `set-free-play` is **performed**, the way `dev/main.ts`
 * performs it, rather than recorded.
 *
 * {@link accountScreen}'s argument, on the other screen with a text field. A host that only recorded
 * the intent would leave the state — and therefore Start, and therefore the issue list — exactly
 * where the first draw put it, and every assertion below would pass over a screen that never
 * changed its mind. The reducer is the shipped `applyIntent`, so nothing here reproduces a transport
 * it is measuring.
 */
function freePlayScreen(
  loaded: MenuCatalogue,
  seed: string,
): ReturnType<typeof render> & { readonly stateNow: () => MenuState } {
  const base = initialMenuState(loaded);
  let state: MenuState = { ...base, screen: 'free-play', freePlay: { ...base.freePlay, seed } };
  let redraw = (): void => {};
  const made = render(state, loaded, {
    state: () => state,
    dispatch: (intent) => {
      made.asked.push(intent);
      state = applyIntent(state, intent, loaded);
      redraw();
    },
  });
  redraw = made.draw;
  return { ...made, stateNow: () => state };
}

/** The Seed field, and a count of how many times a draw has written its `value` back. */
function seedField(root: Recorded): { readonly node: Recorded; readonly writes: () => number } {
  const node = walk(root).find((entry) => entry.attrs.get('data-menu-control') === 'free-play.seed');
  if (node === undefined) throw new Error('the Free play screen renders no seed field');
  /*
   * A counting setter, because a recorder has no selection and *"the caret did not move"* is not a
   * thing this tier can observe. What it observes is the **write**, which is one step upstream.
   *
   * Said precisely, because the sentence this replaces was not. A draw that writes the box back is
   * not by itself a caret jump: HTML's value setter moves the text entry cursor only when the new
   * value *differs* from the old, and Chromium implements that — measured, `202604` with the caret
   * at 4, re-assigned `'202604'`, caret still 4. So zero writes is a claim about **the panel not
   * writing over the reader**, which is the invariant that keeps a future normalising reducer from
   * turning into a caret jump; the jump itself is the browser tier's, and
   * `menu.browser.test.ts § keeps the caret where the reader put it` is where it is watched.
   */
  let held = node.value;
  let writes = 0;
  Object.defineProperty(node, 'value', {
    get: () => held,
    set: (next: string) => {
      writes += 1;
      held = next;
    },
    configurable: true,
  });
  // The reader's own typing is not a draw's write.
  const typed = (text: string): void => {
    held = text;
  };
  Object.assign(node, { type: typed });
  return { node, writes: () => writes };
}

describe('the seed field validates the keystroke it is on — GitHub issue #111(a)', () => {
  it('takes a valid seed back without waiting for a blur, and re-enables Start', async () => {
    /*
     * The reporter's steps, at the tier that can see the state as well as the markup: *"type `abc`
     * → Start still enabled; blur → disabled; type `777` → **valid seed, Start still disabled**;
     * blur → enabled."*
     *
     * The second half is the blocker. A player is looking at a box holding three digits, under a
     * sentence saying a seed is 1–20 digits, with Start greyed out — and the only way out is to
     * click somewhere else, which nothing on the screen suggests. `change` fires on blur, so the
     * state was one commit behind the box and every decision taken from it was too.
     *
     * Driven through `input` and **not** `change`, deliberately: a case that fired both would pass
     * on the old code through the `change` half and prove nothing.
     */
    const loaded = await catalogue();
    const made = freePlayScreen(loaded, 'abc');
    const { node } = seedField(made.root);

    expect(
      byClass(made.root, 'menu-start')[0]?.attrs.get('disabled'),
      'the broken seed did not refuse Start, so this case starts from the wrong screen',
    ).toBe('disabled');

    (node as unknown as { type: (text: string) => void }).type('777');
    node.listeners.get('input')?.();

    expect(
      made.stateNow().freePlay.seed,
      'the keystroke never reached the state — the field is still committing on blur alone',
    ).toBe('777');
    expect(
      byClass(made.root, 'menu-start')[0]?.attrs.has('disabled'),
      'Start is still refused over a valid seed, which is the screen the issue reports',
    ).toBe(false);
    expect(
      textUnder(made.root),
      'the refusal is still on the page under a seed that satisfies it',
    ).not.toContain('A seed is 1–20 digits');
  });

  it('refuses on the keystroke too, so an invalid seed cannot be pressed', async () => {
    /*
     * The other direction, and the one that stops the case above being satisfied by a Start that is
     * simply always enabled. The first half of the reporter's steps: `abc` typed over a good seed
     * used to leave Start pressable until the field lost focus — a refused selection a player could
     * press, which `menuPanel.ts` has forbidden since it landed and could not enforce on a state
     * that had not been told.
     */
    const loaded = await catalogue();
    const made = freePlayScreen(loaded, '20260804');
    const { node } = seedField(made.root);

    expect(byClass(made.root, 'menu-start')[0]?.attrs.has('disabled')).toBe(false);

    (node as unknown as { type: (text: string) => void }).type('abc');
    node.listeners.get('input')?.();

    expect(made.stateNow().freePlay.seed).toBe('abc');
    expect(
      byClass(made.root, 'menu-start')[0]?.attrs.get('disabled'),
      'Start stayed pressable over a seed the model refuses',
    ).toBe('disabled');
    expect(textUnder(made.root)).toContain('A seed is 1–20 digits');
  });

  it('redraws per keystroke without rebuilding the box, moving the caret or taking the focus', async () => {
    /*
     * **Why issue #106 had to land first, driven rather than argued.**
     *
     * Committing on `input` makes this overlay redraw on every keystroke. Before retention that
     * would have been a `replaceChildren` per keystroke — the box the reader is typing into replaced
     * between characters, a press thrown away with the node it began on, and focus dropped to
     * `<body>` sixty times a word. Three properties are what make it safe, and all three are
     * asserted here over a sequence of five keystrokes rather than read off the source:
     *
     * 1. the `<input>` is the **same object** afterwards and was never removed from its row, so no
     *    `mousedown` is ever orphaned and nothing the reader is typing into goes away
     *    (`reconcile` + `retainer`);
     * 2. **no draw writes `value` back over the reader** — harmless in Chromium while the string is
     *    identical (see {@link seedField}) and a caret jump the day a reducer normalises it;
     * 3. focus is still on the field, because `restoreFocus` returns early while the reader is
     *    already inside the overlay.
     *
     * The issue list appearing and disappearing under the box during the sequence is what makes it
     * a real test of (1): the screen genuinely changes shape between the draws, which is the case
     * `reconcile` exists for rather than the case a skip-if-unchanged would have covered.
     */
    const loaded = await catalogue();
    const made = freePlayScreen(loaded, '');
    const { node, writes } = seedField(made.root);
    const row = walk(made.root).find((entry) => entry.children.includes(node));
    expect(row, 'the seed input has no row to be rebuilt out of').toBeDefined();

    made.focus(node);
    const onRow = watchChildren(row as Recorded);
    const onRoot = watchChildren(made.root);

    const shapes = new Set<number>();
    for (const text of ['7', '7x', '7x7', '77', '777']) {
      (node as unknown as { type: (t: string) => void }).type(text);
      node.listeners.get('input')?.();
      shapes.add(byClass(made.root, 'menu-issues').length);
    }

    expect(
      shapes.size,
      'the screen never changed shape across the sequence, so nothing here was reconciled under ' +
        'pressure and the case is weaker than it reads',
    ).toBeGreaterThan(1);
    expect(onRow.touched, 'a keystroke rebuilt the seed box out of its own row').not.toContain(node);
    expect(onRoot.touched, 'a keystroke carried the whole row off the overlay').not.toContain(row);
    expect(
      walk(made.root).find((entry) => entry.attrs.get('data-menu-control') === 'free-play.seed'),
      'the seed field on the page is a different element from the one that was typed into',
    ).toBe(node);
    expect(
      writes(),
      'a draw wrote the field’s own value back over the reader — harmless in Chromium today, ' +
        'because the string is identical, and a caret jump the moment any reducer normalises it',
    ).toBe(0);
    expect(made.focused(), 'a keystroke took the focus off the field being typed into').toBe(node);
  });

  it('states its rule under the box, before anything is broken — issue #111(c)', async () => {
    /*
     * The bound reached the screen only as a refusal, so the only way to learn it was to break
     * Start. The hint is `MenuAffordance.detail` on the row, drawn under the field on every draw
     * including the clean one — which is the half a refusal structurally cannot do.
     */
    const loaded = await catalogue();
    const made = freePlayScreen(loaded, '20260804');
    const { node } = seedField(made.root);

    expect(byClass(made.root, 'menu-start')[0]?.attrs.has('disabled'), 'the screen is refusing').toBe(
      false,
    );
    const hint = byClass(made.root, 'menu-hint')[0];
    expect(hint?.textContent, 'a clean Free play screen says nothing about what a seed is').toContain(
      'Digits only, up to 20',
    );
    // The affordances the transport's own field has had all along, and this one had none of.
    expect(node.attrs.get('inputmode')).toBe('numeric');
    expect(node.attrs.get('placeholder')).toBe('1–20 digits');
    // …and never `maxlength`, which would truncate a paste in silence — the coercion § D198 removed.
    expect(node.attrs.has('maxlength')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * The leaderboard teaches its shape when it is empty — GitHub issue #34
 * -------------------------------------------------------------------------- */

describe('an empty leaderboard shows what a board is', () => {
  it('draws an example board, and says in words that it is one', async () => {
    /*
     * *"An empty leaderboard should still teach me the shape of the thing … Empty is not the same as
     * blank."* The reporter had just finished a run they were pleased with and found *"no picture of
     * what measuring it against someone would even look like."*
     *
     * The *says so in words* half is not decoration: a greyed row is a signal carried by colour,
     * which KB-15 forbids on its own — and a plausible figure a reader might take for a measurement
     * is the one thing this repository will not ship.
     */
    const loaded = await catalogue();
    const { root } = render({ ...initialMenuState(loaded), screen: 'leaderboard' }, loaded);
    const text = textUnder(root);

    expect(byClass(root, 'menu-board').length, 'nothing board-shaped was drawn').toBeGreaterThan(0);
    expect(text).toContain('An example of a board');
    expect(text, 'the example does not say nobody posted it').toContain('nobody posted them');
    // Where the reader would appear, which is the picture #34 says is missing.
    expect(text).toContain('You, if you post this run');
    // All four metrics, and the sentence that stops them being added up (§ D106).
    for (const metric of ['AWT', 'WT95', 'TTD', 'over-long']) expect(text).toContain(metric);
    expect(text).toContain('never added together');
    // The seed, because a row that hid it would teach a shape that cannot be checked (invariant 5).
    expect(text).toContain('seed');
  });

  it('does not draw one over a real board', async () => {
    // The negative control. An example beside somebody's actual run would be two boards on one
    // screen, and the reader has no way to tell which figures are real.
    const loaded = await catalogue();
    const { root } = render({ ...initialMenuState(loaded), screen: 'leaderboard' }, loaded, {
      leaderboard: () => ({
        boards: [{ configHash: 'abcdef0123456789', entries: 1 }],
        selected: 'abcdef0123456789',
        page: {
          configHash: 'abcdef0123456789',
          metric: 'awtS',
          note: 'One configuration across seeds.',
          entries: [
            {
              displayName: 'Somebody real',
              measured: { awtS: 21.5, wt95S: 44.2, ttdMeanS: 60.1, pctOverLongWait: 6.4 },
              run: { seed: '20260101' },
            },
          ],
        } as unknown as BoardPage,
        notice: undefined,
      }),
    });
    expect(textUnder(root)).not.toContain('An example of a board');
  });
});

/* -------------------------------------------------------------------------- *
 * The challenge board is drawn — GitHub issue #112
 * -------------------------------------------------------------------------- */

/**
 * One challenge board, as `GET /api/challenge-board` answers it.
 *
 * Two entries and not one, because every assertion worth making here is about the *relationship*
 * between rows: which one is the reader's, and how far behind the top row it is. A single-row
 * fixture would pass a renderer that drew the first entry and dropped the rest.
 */
const CHALLENGE_BOARD = (): ChallengeScreenInput => {
  const view: ChallengeView = {
    challenge: {
      id: 'week-2026-32',
      name: 'Morning rush',
      brief: 'The lobby fills for twenty minutes.',
      config: {
        buildingId: 'midtown-office',
        demandTemplateId: 'up-peak',
        arrivalRatePctPop5min: 2,
        durationS: 900,
      },
      seeds: ['1', '2', '3', '4', '5'],
      opensAtMs: 0,
      closesAtMs: 1,
    },
    state: 'open',
    seedCount: 5,
    opensInMs: null,
    closesInMs: 3_600_000,
    clockNote: 'Times are the server’s.',
    dataHash: 'aa',
    compare: {
      note: 'Compare is the only screen that may say one dispatcher beats another.',
      buildingId: 'midtown-office',
      demandTemplateId: 'up-peak',
      arrivalRatePctPop5min: 2,
      durationS: 900,
    },
  };
  const score = (mean: number): ChallengeBoardRow['score'] => ({
    runs: 5,
    legs: 640,
    meanAwtS: mean,
    meanWt95S: mean * 2,
    meanTtdMeanS: mean * 3,
    meanPctOverLongWait: 7.5,
    perSeed: [],
  });
  return {
    runsDone: 5,
    view,
    board: {
      challengeId: 'week-2026-32',
      challenge: view.challenge,
      state: 'open',
      dataHash: 'aa',
      metric: 'awtS',
      seedCount: 5,
      note: 'Ordered on average wait. The four figures are never added together.',
      compare: view.compare,
      entries: [
        {
          id: 'entry-1',
          displayName: 'Grace Hopper',
          dispatcherProfileId: 'collective',
          score: score(21.0),
          submittedAtMs: 10,
        },
        {
          id: 'entry-2',
          displayName: 'Ada Lovelace',
          dispatcherProfileId: 'zoned-uppeak',
          score: score(24.5),
          submittedAtMs: 20,
        },
      ],
      entriesOnOtherData: 0,
    },
  };
};

/** Signed in as the second row's author, so *which of these is mine* has an answer to find. */
const SIGNED_IN_AS_ADA: AccountState = {
  ...SIGNED_OUT,
  token: 'session-token',
  user: { id: 'u1', email: 'ada@example.test', displayName: 'Ada Lovelace', displayNameChosen: true },
};

describe('this week’s challenge draws the board it fetched — GitHub issue #112', () => {
  /*
   * ## What was wrong, and why nothing caught it
   *
   * `ChallengeBoardPage.entries` was fetched by `dev/main.ts#loadChallengeBoard`, threaded into
   * `ChallengeScreenInput`, and **read by no renderer**: `menu/screens.ts#challengeBody` touched
   * `board.note` and `board.otherDataNote` and nothing else. So the screen's *Order the board on*
   * select fired a real re-fetch of a real board, and the only thing a player could see change was
   * the wording of a sentence.
   *
   * It survived because **this file's own host fixture passes `challenge: () => undefined`** for
   * every case above, so the challenge screen has never been rendered here at all. That is the
   * document tier's blind spot rather than an oversight in a test: a screen nobody renders draws
   * whatever it likes.
   *
   * Reverting `menuPanel.ts`'s `if (view.screen === 'challenge') children.push(challengeBoardTable(…))`
   * fails every assertion in this block; the empty-board case below fails on the sentence.
   */
  it('puts a row on the page for each entry, with all four figures and the count behind them', async () => {
    const loaded = await catalogue();
    const { root } = render({ ...initialMenuState(loaded), screen: 'challenge' }, loaded, {
      challenge: () => CHALLENGE_BOARD(),
    });
    const rows = byClass(root, 'menu-board-row');
    expect(rows.length, 'the challenge screen drew no board rows').toBe(2);

    const text = textUnder(root);
    expect(text).toContain('Grace Hopper');
    expect(text).toContain('Ada Lovelace');
    // All four, never a fifth and never a total — § D106 through `boardTable`'s own rule.
    for (const metric of ['AWT', 'WT95', 'TTD', 'over-long']) expect(text).toContain(metric);
    // R13: a mean without the count it was taken over is a different measurement.
    expect(text).toContain('5 runs');
    expect(text).toContain('640 legs');
    // The axis this whole screen exists to vary, named on the row that chose it.
    expect(text).toContain('collective');
    expect(text).toContain('zoned-uppeak');
    /*
     * And no interval and no dispersion. `ChallengeScore`'s docstring forbids one in as many words —
     * five runs cannot support an inference — so the negative is asserted rather than assumed.
     */
    expect(text).not.toMatch(/±|\[\s*-?\d/u);
  });

  it('marks the signed-in player’s own row in words as well as in a class', async () => {
    const loaded = await catalogue();
    const { root } = render({ ...initialMenuState(loaded), screen: 'challenge' }, loaded, {
      challenge: () => CHALLENGE_BOARD(),
      account: () => SIGNED_IN_AS_ADA,
    });
    const mine = byClass(root, 'menu-board-row menu-board-you');
    expect(mine.length, 'no row was marked as the reader’s own').toBe(1);
    // KB-15: the class is the *second* signal. A highlight a screen reader cannot hear would leave
    // the reader who most needs the answer without one.
    expect(textUnder(mine[0] as Recorded)).toContain('Ada Lovelace — you');
    // Ada is 3.5 s behind Grace on `awtS`, which is the metric this board declares.
    expect(textUnder(root)).toContain('3.5 s behind the top row');
  });

  it('marks nobody when nobody is signed in, and names no gap', async () => {
    // The negative control on the pair above: with `SIGNED_OUT`, both assertions must fail to find
    // anything, or the highlight is being drawn on whatever row happens to be first.
    const loaded = await catalogue();
    const { root } = render({ ...initialMenuState(loaded), screen: 'challenge' }, loaded, {
      challenge: () => CHALLENGE_BOARD(),
    });
    expect(byClass(root, 'menu-board-row menu-board-you').length).toBe(0);
    expect(textUnder(root)).not.toContain('behind the top row');
  });

  it('says an empty board is empty, and says how to be the first row on it', async () => {
    const loaded = await catalogue();
    const input = CHALLENGE_BOARD();
    const { root } = render({ ...initialMenuState(loaded), screen: 'challenge' }, loaded, {
      challenge: () => ({
        ...input,
        ...(input.board === undefined ? {} : { board: { ...input.board, entries: [] } }),
      }),
    });
    expect(byClass(root, 'menu-board-row').length).toBe(0);
    const text = textUnder(root);
    expect(text).toContain('Nothing has been posted to this board yet');
    // Named from `seedCount`, so the sentence cannot say five while the challenge asks for eight.
    expect(text).toContain('all 5 seeds');
  });

  it('draws nothing board-shaped when there is no board, rather than an empty table', async () => {
    // The other negative control, and the case every other test in this file was in: no server, or
    // no answer yet. The screen's own notices carry the reason; a wordless empty table would be a
    // second answer to the same question.
    const loaded = await catalogue();
    const { root } = render({ ...initialMenuState(loaded), screen: 'challenge' }, loaded, {
      challenge: () => ({ runsDone: 0 }),
    });
    expect(byClass(root, 'menu-board').length).toBe(0);
    expect(byClass(root, 'menu-board-row').length).toBe(0);
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
