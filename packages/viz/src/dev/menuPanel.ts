/**
 * The main menu — `DECISIONS.md` § D214 § 2, and the named non-test caller of everything in
 * `src/menu/`.
 *
 * The chain is `dev/main.ts → dev/menuPanel.ts → menu/menu.ts` and `menu/catalogue.ts`. That
 * sentence is the point of this file existing at all: the menu state machine landed a commit before
 * this panel did, and `viz/deadCode.test.ts` immediately reported all eight of its exports as
 * having no caller — the defect this repository has shipped ten times in code, caught on the run
 * after it was introduced. The fix is a caller, not an allowlist entry.
 *
 * ## What this file decides, and what it does not
 *
 * It decides **pixels**: which rows exist, what they say, what a click dispatches. It decides
 * nothing about navigation, validation or what a selection means — those are pure functions next
 * door, tested without a document, for the reason `dev/runConfig.ts` is a cautionary tale in this
 * package's history.
 *
 * The one rule it enforces itself is that **Start is disabled while the selection has issues, and
 * the issues are shown**. A menu that lets a player press Start on a broken selection and then
 * fails somewhere in the runner has moved an explainable error to a place with no words for it.
 */

import { el, fill, on, reconcile, setText, type ElementSpec } from './dom.js';
import {
  canSubmitForm,
  formIssues,
  namingStage,
  postingRefusal,
  type AccountState,
} from '../menu/account.js';
import type { BoardPage, ClaimedMetrics } from '../menu/client.js';
import type { ChallengeScore } from '../menu/challenge.js';

import {
  screenOf,
  withChosenValue,
  type ChallengeScreenInput,
  type CommissioningScreenInput,
  type MenuAffordance,
  type MenuGuide,
  type MenuIntent,
} from '../menu/screens.js';
import type { MenuCatalogue, MenuState } from '../menu/types.js';

/**
 * What the leaderboard screen has to draw, as data.
 *
 * A view rather than a client handle, deliberately. The panel must not be able to start a request:
 * a render that fetched would fetch again on every state change, and the loop would be invisible
 * because each render looks correct on its own.
 */
export interface LeaderboardView {
  readonly boards: readonly { readonly configHash: string; readonly entries: number }[];
  readonly selected: string | undefined;
  readonly page: BoardPage | undefined;
  /** A sentence to show instead of rows — loading, unreachable, or nothing posted yet. */
  readonly notice: string | undefined;
}

/** What the panel needs from its host: the state, and a way to replace it. */
export interface MenuPanelHost {
  readonly doc: Document;
  readonly catalogue: MenuCatalogue;
  state(): MenuState;
  /**
   * Everything a player asks for, as one call.
   *
   * Eight methods before this — `start`, `openCampaign`, `submitAccountForm`, `signOut`,
   * `openBoard` and three more — each of which was a decision the panel made and the shell merely
   * performed. Collapsed to one, so the *decisions* live in `menu/screens.ts` where a test can
   * reach them and the shell's handler is an **exhaustive switch** over {@link MenuIntent}.
   *
   * That switch is the mechanism that ends `docs/16` § 5 clause 8: `client.submit` had no caller at
   * all, and `submit-score` is a member of the union, so the shell does not compile without one.
   */
  dispatch(intent: MenuIntent): void;
  account(): AccountState;
  leaderboard(): LeaderboardView;
  /**
   * What only the shell knows: whether a run is on screen, whether it may be ranked, and whether
   * the player has ever been out to it — `everLeftTheMenu` is `docs/19`'s Resume copy nit, and
   * optional with `firstVisit`'s convention: an absent answer is *nobody has said*, which the
   * screen words as the ordinary Resume rather than guessing at a first sitting.
   */
  runState(): {
    readonly hasRun: boolean;
    readonly rankingRefusal: string | undefined;
    readonly everLeftTheMenu?: boolean | undefined;
  };
  /** The reader's disclosure level, for the one settings row Basic cannot honour — `docs/16` S7. */
  viewMode(): 'basic' | 'advanced';
  /**
   * This week's challenge, as the server answered — never as this browser worked out (§ D218 § 3).
   *
   * `undefined` when there is no server. The screen has a row for that case rather than an empty
   * panel, which is `docs/16` § 5 clause 6's rule applied to an absence rather than to an oversight.
   */
  challenge(): ChallengeScreenInput | undefined;
  /** The fabric, its constraint's verdict, and what each bank may take. `undefined` with no building. */
  commissioning(): CommissioningScreenInput | undefined;
  /** Which calendar period is over the week, or `''`. */
  calendarPeriodId(): string;
  /**
   * The page **behind** the overlay, so it can be taken out of the page while the overlay is up.
   *
   * Handed over rather than found, and the distinction is § D249 § 3's. The shell's elements are not
   * this file's to disable — but they are the shell's to *name*, and once named the writing belongs
   * beside the focus trap, because *is the overlay covering the page?* has exactly one answer and it
   * is `root.hidden`. A `document.body` traversal here would make this file decide what the shell
   * **is**, which is a second answer that can drift from `dev/main.ts`'s.
   *
   * Required, not optional. A modal whose page behind it stays live is issue #68 — a seed typed into
   * a field the player could not see — and a host that forgot to say would be that, silently. The
   * one legitimate answer for *nothing behind me* is an empty array, which says it.
   */
  shell(): readonly HTMLElement[];
  /**
   * Whether this deployment has a server behind it — GitHub issue #28's signal on the root menu.
   *
   * Only the shell can answer it: the origin comes from a `<meta>` tag read at run time (§ D215 § 4,
   * § D243), so the same bytes are a connected build behind a server and an unconnected one behind a
   * CDN. **`dev/main.ts` now answers it** — `hasServer: () => client !== undefined`, the same fact
   * the `open-board` and `account-submit` arms already branch on, so there is no second answer to
   * *is there a server*.
   *
   * It stays **optional**, and the reason changed rather than went away. It was optional because the
   * shell was another lane's; it is optional now because *absence has a meaning of its own* —
   * `MenuViewInput.hasServer`'s `undefined` is **nobody has said**, which is what a caller with no
   * `<meta>` lookup (a test, a future embedder) honestly is. A required member would force such a
   * caller to guess, and a menu that asserted *needs a server* on a build that has one is a worse
   * claim than the silence it replaced.
   */
  hasServer?: (() => boolean) | undefined;
  /**
   * Whether this page loaded with nothing restored — GitHub issues #90 and #98.
   *
   * Only the shell can answer it, for {@link MenuPanelHost.hasServer}'s reason one layer over: the
   * answer comes from `loadSession` against `window.localStorage`, and `menu/screens.ts` does not
   * depend on the persistence layer to draw a menu. `dev/main.ts` reads it once during
   * `restoreSession` — the one instant the product has ever known it — and latches it, rather than
   * re-reading per draw and letting the notice disappear under a reader the first time anything saves.
   *
   * Optional, and `undefined` means **nobody has said** rather than *no*. A test or an embedder that
   * has no session store is honestly in that state, and a menu that welcomed a returning player as a
   * new one is the same class of wrong claim as one that asserted *needs a server* on a build that has
   * one. See `menu/screens.ts`'s {@link MenuViewInput.firstVisit}.
   */
  firstVisit?: (() => boolean) | undefined;
}

/* -------------------------------------------------------------------------- *
 * Rendering
 * -------------------------------------------------------------------------- */

/**
 * Put one control in the overlay's focus ring, under a key that survives the redraw.
 *
 * Threaded through every row builder rather than recovered afterwards with a selector, because the
 * builders are the only things that know **which** element of a row a Tab actually lands on: a
 * `select` row is a `<label>` around a `<select>`, and the label is not focusable. Returns its
 * argument so a builder can keep writing to the control on the same line it registers it.
 */
type KeepControl = <T extends HTMLElement>(control: T, key: string) => T;

/* -------------------------------------------------------------------------- *
 * Keeping the node a pointer is standing on — GitHub issue #106
 * -------------------------------------------------------------------------- */

/** One element an overlay is keeping, and the tag it was made as. */
interface Kept {
  readonly tag: string;
  readonly node: HTMLElement;
}

/**
 * What each overlay kept from its **previous** draw, by key.
 *
 * A `WeakMap` on the root rather than a module-level map, for {@link CONTROLS}' reason: two overlays
 * would otherwise share one set of nodes, and the second would silently steal the first's.
 */
const RETAINED = new WeakMap<HTMLElement, Map<string, Kept>>();

/** Ask for the element under a key: the one from the last draw, or a new one. */
type Retain = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  key: string,
  spec?: ElementSpec,
) => HTMLElementTagNameMap[K];

/**
 * The four things every builder below needs, as one argument.
 *
 * Threaded rather than reached for, because there is no such thing as *the current draw* — the
 * retainer is per draw by construction (see {@link retainer}), and a builder that could reach a
 * previous one would reuse a node this draw has already given to somebody else.
 */
interface Draw {
  readonly doc: Document;
  readonly retain: Retain;
  readonly keep: KeepControl;
  /** What Enter in a text field presses, or `undefined` when the screen has nothing to submit. */
  readonly submit: (() => void) | undefined;
}

/**
 * The other half of {@link reconcile} — GitHub issue #106.
 *
 * `reconcile` will leave a child alone when it is already in the right place, and *the same node
 * being handed back next draw* is what makes that possible. This is where that comes from: a key
 * names a **role** in the screen — the title, the list, this row's control — and the element that
 * played it last time plays it again.
 *
 * ## Three things fall out of it, and only the first is what the issue asked for
 *
 * The submit button survives the redraw its own `mousedown` causes, so the click lands. **A text
 * field keeps its caret and its focus**, because a retained `<input>` is never rebuilt — which is
 * what makes it safe to redraw this overlay on *every keystroke*, the thing issue #111's
 * per-keystroke validation now does. That half is measured rather than argued: forcing this
 * function to build a fresh element every draw makes `menu.browser.test.ts § keeps the caret where
 * the reader put it` report `'202604'` where `'20269904'` was typed — the keystrokes reach nothing,
 * because what they were aimed at no longer exists. And a `<details>` the reader opened stays open,
 * which it did not before.
 *
 * This paragraph used to credit `textRow`'s `value`-write guard alongside retention. It does not
 * now: that guard turns out not to be what keeps the caret today, and `textRow`'s own docstring
 * carries the measurement and the narrower reason the guard is still right.
 *
 * ## Why the map is rebuilt every draw rather than accumulated
 *
 * A key is unique **within a screen** — {@link MenuAffordance}'s own contract — and screens differ.
 * Accumulating would hand a `select` from Settings to a row on Free play that happened to share an
 * id, carrying its options and its listeners with it. So each draw publishes only what it used, and
 * a node nobody asked for this time is simply not offered next time. The tag is stored beside the
 * node and checked, so even a within-screen collision cannot return the wrong kind of element.
 */
function retainer(root: HTMLElement, doc: Document): Retain {
  const before = RETAINED.get(root) ?? new Map<string, Kept>();
  const now = new Map<string, Kept>();
  RETAINED.set(root, now);
  return <K extends keyof HTMLElementTagNameMap>(tag: K, key: string, spec: ElementSpec = {}) => {
    const kept = before.get(key);
    const node =
      kept !== undefined && kept.tag === tag
        ? (kept.node as HTMLElementTagNameMap[K])
        : el(doc, tag, spec);
    /*
     * Re-applied on the reuse path, because the class is the one part of a spec a screen can change
     * under a role that keeps its key. Everything else — a `type`, an `aria-*` — is written at
     * creation, and anything a builder needs kept current it writes itself on every draw.
     */
    if (spec.className !== undefined && node.className !== spec.className) {
      node.className = spec.className;
    }
    now.set(key, { tag, node });
    return node;
  };
}

/**
 * What Enter in a text field presses — the second half of GitHub issue #106.
 *
 * ## The defect, which is separate from the swallowed click and was confirmed with it
 *
 * The account screen is a form in every sense a player can see and in none a browser can: the
 * fields are a `<div>`, the submit is `<button type="button">` with a click listener, and the
 * overlay's own keydown handler owns Escape and Tab. So Enter in the address field did nothing at
 * all, on the one screen where pressing Enter after typing an address is the most ordinary thing a
 * person does.
 *
 * ## Why the submit is still not inside a `<form>`
 *
 * {@link renderMenu}'s comment on the account screen's ordering refuses that move and the refusal
 * still holds: the submit is a {@link MenuAffordance} whose label, refusal and intent are decided
 * by `menu/screens.ts`, and a button built inside a form beside its own click handler is the
 * decision-in-a-render that split exists to stop. A real `<form>` would also need a `submit`
 * listener calling `preventDefault` on every path, because there is nowhere for it to post.
 *
 * ## So the rule is the browser's own, applied to the rows the screen decided
 *
 * HTML's implicit submission presses *the form's first submit button*, and refuses when there is
 * none. This is that, over `MenuScreenView.rows`: the first `commit` row that is **enabled**. It
 * decides nothing a screen has not already decided — a refused Start stays refused, and Enter does
 * exactly as little as clicking the disabled button it names does, with the same `disabledWhy`
 * already on the page saying why.
 */
function implicitSubmit(
  rows: readonly MenuAffordance[],
  host: MenuPanelHost,
): (() => void) | undefined {
  const row = rows.find((candidate) => candidate.kind === 'commit' && candidate.enabled);
  if (row === undefined) return undefined;
  return () => {
    host.dispatch(row.intent);
  };
}

/**
 * Draw the current screen. **Decides nothing.**
 *
 * Every row, its label, whether it is enabled and what pressing it asks for come from
 * `menu/screens.ts#screenOf`. This file turns that into elements and turns a click into
 * {@link MenuPanelHost.dispatch}. The split is `dev/surfaces.ts`'s and `controls/render.ts`'s, and
 * the reason is `docs/16` § 5: three of the eight clauses the product failed were decisions taken
 * inside a click handler, where nothing could reach them.
 *
 * ## It also makes the overlay behave like the dialog it looks like — issues #33 and #68
 *
 * The one thing here that is not *turn a row into an element*: {@link asModal}. The overlay covers
 * the whole viewport and was not a dialog in any sense a browser or a screen reader could see — no
 * `role`, no `aria-modal`, no accessible name, and nothing keeping Tab inside it. Measured before
 * the change: **7 focusable controls inside the overlay and 624 in the document**, and six Tab
 * presses from the first menu row put focus on a link, then a button, then a `<select>` **behind**
 * the screen the player was looking at. Issue #68 is what that costs: the reporter tabbed blind out
 * of the *Settings* screen — the one that promises *"nothing here changes a run"* — into the seed
 * field, typed `424242`, and re-seeded the simulation with no visible feedback until they left.
 *
 * The panel owns this because the panel is the only thing that knows what is *in* the overlay.
 *
 * **The two halves § D249 § 3 left open are now closed, and neither moved here by itself.**
 * `inert` and `aria-hidden` on the shell behind are written by {@link coverShell} over the elements
 * {@link MenuPanelHost.shell} hands over — the shell still names its own, this file only writes
 * what `root.hidden` says. And **Escape** dispatches {@link MenuIntent} `close`, a member added
 * together with the arm in `dev/main.ts` that performs it, because a member nothing handles compiles
 * and ships a dead control: `dispatchMenu` returns `void` and has no `never` arm. Binding Escape to
 * `back` instead is still refused, for § D249's reason — it would work on five screens and do
 * nothing on the root.
 *
 * ## And it draws in a way that survives being drawn under a pointer — GitHub issue #106
 *
 * The other thing here that is not *turn a row into an element*. A text field commits on `change`,
 * `change` fires on blur, and blur is the default action of `mousedown` — so pressing a button
 * beside a field redraws this overlay **between the press and the release**. While that redraw was
 * `fill`, it replaced every child, and a browser will not dispatch a click whose `mousedown`
 * element has left the document: *"Type into the Account email field, click Email me a link once:
 * no request, no error, no notice."*
 *
 * Two rules follow and both are load-bearing for the validation issue #111 adds next door, which
 * will make this redraw happen on **every keystroke**. Anything a pointer can stand on is kept
 * across draws ({@link retainer}) and written in place, so no press and no caret is ever thrown
 * away; and the containers that hold controls are written with {@link reconcile} rather than
 * `fill`, so a line appearing elsewhere on the screen does not carry the button off with it.
 *
 * `fill` is still right wherever nothing in the container can be pressed — the guide's paragraphs,
 * an issue list, a board's rows — and for a `<select>`'s options, which a browser presses inside a
 * popup of its own rather than in this tree.
 */
export function renderMenu(root: HTMLElement, host: MenuPanelHost): void {
  const doc = host.doc;
  const account = host.account();
  const board = host.leaderboard();
  const run = host.runState();
  /*
   * Asked once and handed to both halves — `docs/16` S5. The rows need it to offer *Save this name*
   * instead of nothing, and the form needs it to ask for a name instead of an address; two calls
   * would be two answers to *which question is being asked*, which is the split that let issue #31's
   * screen print a sign-in error under a registration form.
   */
  const naming = namingStage(account);
  /*
   * Asked once and used twice, on the same rule {@link namingStage} is asked under: the screen's
   * rows and notices are decided from it next door, and the board table below draws its `entries`.
   * Two calls would be two answers to *what is on this week's board*, and the table would be able to
   * show rows the notices above it were counted from a different fetch of.
   */
  const challenge = host.challenge();
  const view = screenOf({
    state: host.state(),
    catalogue: host.catalogue,
    canPost: account.user !== undefined,
    postingRefusal: postingRefusal(account),
    hasRun: run.hasRun,
    rankingRefusal: run.rankingRefusal,
    // `firstVisit`'s convention one field over: absent is *nobody has said*, never a guess.
    ...(run.everLeftTheMenu === undefined ? {} : { everLeftTheMenu: run.everLeftTheMenu }),
    boards: board.boards,
    /*
     * The open board, handed to the decision half — GitHub issue #93.
     *
     * `board.page` has been in this view since the table below was written and reached nothing but
     * the table. Every control a reader gets over a row is decided next door from this, on
     * `namingStage`'s rule one screen over: two answers to *what is on the board a player is looking
     * at* would let the rows below disagree with the sentences above them.
     */
    ...(board.page === undefined ? {} : { boardPage: board.page }),
    viewMode: host.viewMode(),
    challenge,
    commissioning: host.commissioning(),
    calendarPeriodId: host.calendarPeriodId(),
    naming,
    ...(host.hasServer === undefined ? {} : { hasServer: host.hasServer() }),
    // Same shape as `hasServer` above and for the same reason: an absent host method is *nobody has
    // said*, which the view models as `undefined` and answers with silence rather than a guess.
    ...(host.firstVisit === undefined ? {} : { firstVisit: host.firstVisit() }),
  });

  /*
   * Which control the reader was on, read **before** the write that could destroy it.
   *
   * It could, and since {@link retainer} it usually does not: a control that keeps its key keeps
   * its element, so the ordinary redraw now leaves focus exactly where it was. This is still read
   * because a redraw that changes *screens* legitimately takes the control away. See
   * {@link restoreFocus}.
   */
  const wasOn = focusedControlKey(doc, root);

  const controls: HTMLElement[] = [];
  const keep: KeepControl = (control, key) => {
    control.setAttribute(CONTROL_KEY, key);
    controls.push(control);
    return control;
  };
  const draw: Draw = {
    doc,
    retain: retainer(root, doc),
    keep,
    submit: implicitSubmit(view.rows, host),
  };

  const children: Node[] = [];
  const heading = draw.retain('h1', 'title', { className: 'menu-title' });
  setText(heading, view.title);
  children.push(heading);

  view.notices.forEach((notice, index) => {
    children.push(noticeLine(draw, `notice.${String(index)}`, notice));
  });

  /*
   * **The account screen puts its form above its buttons, and that ordering is the fix** — GitHub
   * issue #30(a). It read: *Sign in* (primary, filled), *Back*, *Create an account*, then the two
   * live inputs. *"The player reads a call to action, then two navigation buttons, and only then
   * discovers there was a form. Tab order matches the visual order, so a keyboard user hits the
   * submit button first as well."*
   *
   * So on this one screen the fields come first and the rows — submit, then Back — come last, which
   * is #30's own suggested ordering. It is done here rather than by moving the submit into the form,
   * because the submit is a {@link MenuAffordance} that `menu/screens.ts` decides the label and the
   * refusal of, and a button built inside a click-handler-adjacent form is the decision-in-a-render
   * this whole split exists to stop.
   *
   * The **notice goes above the form**, which is #30(b): *"the screen only admits it cannot work
   * after you submit."* `dev/main.ts` seeds `AccountState.notice` on mount when there is no server,
   * so the sentence is now the first thing under the heading rather than an apology appended after
   * a click.
   */
  const accountFirst = view.screen === 'account';
  if (accountFirst && account.notice !== undefined) {
    children.push(noticeLine(draw, 'account.notice', account.notice));
  }
  if (accountFirst && (account.user === undefined || naming)) {
    children.push(accountForm(draw, host, account, naming));
  }

  const list = draw.retain('div', 'list', { className: 'menu-list' });
  const rows: Node[] = view.rows.map((row) => affordance(draw, host, row));
  /*
   * **Second, directly under the row that recommends a path** — GitHub issue #98, which asks for
   * *How to play* at the top of the nav or behind a persistent `?`.
   *
   * It was **last**, after all six navigations and after Resume, and the issue is right about what
   * that costs: *"Most new players will not find it."* The entry is a `<details>` and it is an entry
   * rather than a row — see the comment on `MenuScreenView.guide` for why it carries no intent and
   * asks nothing of the shell.
   *
   * It is second rather than first, and the order is the argument. A player who does not yet know
   * what a dispatcher is needs the explanation before the five ways of doing it, and needs the one
   * recommendation before the explanation — otherwise the first thing on the product's first screen
   * is a wall of prose, which is the failure #98 describes one screen later. So: press this, or read
   * why first.
   *
   * ## Why the index is found rather than assumed
   *
   * `rows[1]` would be a claim that the recommended row is `rows[0]`, made here, by a number. The
   * recommendation is `MenuAffordance.primary` and `menu/screens.ts` decides it, so this asks. A
   * screen with a guide and no recommendation puts it first, which is the honest position when there
   * is nothing to sit under.
   */
  if (view.guide !== undefined) {
    const recommended = view.rows.findIndex((row) => row.primary === true);
    rows.splice(recommended + 1, 0, guideEntry(draw, view.guide));
  }
  reconcile(list, ...rows);
  children.push(list);

  if (view.issues.length > 0) children.push(issueList(draw, 'issues', view.issues));

  /*
   * The two screens with content an affordance cannot express: a table of somebody else's runs.
   *
   * The challenge arm is GitHub issue #112. `ChallengeBoardPage.entries` was fetched, threaded
   * through `dev/main.ts` into {@link ChallengeScreenInput} — and read by **no renderer**: the whole
   * of `menu/screens.ts`'s use of the board was `board.note` and `board.otherDataNote`, two
   * sentences. So the *Order the board on* select fired a real re-fetch of a real board, and its
   * only visible effect was that a sentence changed wording. A control that reorders something
   * nobody can see is the inert control this repository's standing requirement is written about,
   * arriving from the rendering end rather than the wiring end.
   */
  if (view.screen === 'leaderboard') children.push(boardTable(draw, board, account));
  if (view.screen === 'challenge') children.push(challengeBoardTable(draw, challenge, account));

  // `reconcile` and not `fill`, and the whole of issue #106 is in that word: this container holds
  // controls, and a container of controls may not be rebuilt under a pointer that is already down
  // on one of them.
  reconcile(root, ...children);
  asModal(doc, root, view.title, controls, host.dispatch);
  // `HTMLElement.hidden` is `boolean | string` since `hidden="until-found"` — and every string it
  // can hold is a *hidden* state, so truthiness is the whole of the question rather than a coercion
  // papering over one.
  coverShell(host.shell(), Boolean(root.hidden));
  restoreFocus(doc, root, controls, wasOn);
}

/**
 * Take the shell behind the overlay out of the page while the overlay is up — issues #33 and #68.
 *
 * ## Why this is the belt to the trap's braces
 *
 * {@link asModal} holds the **keyboard**, and only over the controls this file built. It does not
 * hold a pointer, and it does not hold something focusable inside the overlay that came from
 * somewhere else — a link inside a notice, say. Measured before either half existed: 7 focusable
 * controls inside the overlay and **624 in the document**, and issue #68's reporter reached the seed
 * field behind the menu from the one screen whose own note promises *"nothing here changes a run"*,
 * typed `424242`, and re-seeded the run.
 *
 * `inert` is what removes a subtree from focus, from hit-testing and from the accessibility tree in
 * one attribute. `aria-hidden` goes with it because `inert` is the newer of the two and a reader on
 * an assistive technology that has not implemented it would otherwise still be walked through the
 * shell — belt and braces, and the pair is cheap.
 *
 * ## Why the shell is handed over rather than found
 *
 * § D249 § 3 filed this as *needs `dev/main.ts`*, on the ground that the shell's own elements are
 * not this file's to disable. They still are not: {@link MenuPanelHost.shell} is the shell naming
 * them, and this function only writes what the overlay's own `hidden` says. A `document.body`
 * traversal here would be this file deciding what the shell **is**, which is the same class of
 * second answer the trap refuses a `querySelectorAll` for.
 *
 * ## Why it is keyed on `root.hidden` rather than on a flag
 *
 * One source. `dev/main.ts#closeMenu` and the `reopen` arm both write `hidden` and then draw, so
 * the covering and the overlay can never disagree — which a second boolean threaded through the
 * host could, in exactly the direction that leaves the page permanently inert.
 */
function coverShell(shell: readonly HTMLElement[], menuHidden: boolean): void {
  for (const element of shell) {
    if (menuHidden) {
      element.removeAttribute('inert');
      element.removeAttribute('aria-hidden');
      continue;
    }
    element.setAttribute('inert', '');
    element.setAttribute('aria-hidden', 'true');
  }
}

/* -------------------------------------------------------------------------- *
 * The overlay is a modal — issues #33 and #68
 * -------------------------------------------------------------------------- */

/**
 * The attribute that names a control across a redraw.
 *
 * An attribute rather than a `WeakMap` keyed on the node, because the node the reader was standing
 * on does not survive the redraw and is precisely what has to be found again. The value is the
 * affordance's own `id` — already *"stable, and unique within a screen"* by {@link MenuAffordance}'s
 * contract — so no second naming scheme is introduced.
 */
const CONTROL_KEY = 'data-menu-control';

/** Overlays whose Tab handler is already attached. One listener per root, ever. */
const WIRED = new WeakSet<HTMLElement>();

/** The controls of the **current** draw, so the handler reads the live list rather than a stale one. */
const CONTROLS = new WeakMap<HTMLElement, readonly HTMLElement[]>();

/**
 * Where Escape sends its intent, refreshed on every draw for {@link CONTROLS}' own reason.
 *
 * The listener is attached once per root, ever, so capturing a `dispatch` in its closure would pin
 * the first draw's host forever — the same staleness the control list is a `WeakMap` to avoid, on a
 * value whose being stale would be silent rather than visible.
 */
const DISPATCH = new WeakMap<HTMLElement, (intent: MenuIntent) => void>();

/**
 * Make the overlay a dialog, and keep Tab inside it.
 *
 * ## The three attributes
 *
 * `role="dialog"` and `aria-modal="true"` are what tell an assistive technology that the rest of
 * the page is not currently available; `aria-label` gives the dialog the name it had none of — the
 * screen's own title, so *Settings* and *Leaderboard* are told apart by something other than their
 * contents. All three were absent, measured.
 *
 * ## The trap, and what it is honestly not
 *
 * The list of controls is **the one this file just built**, in draw order, rather than a
 * `querySelectorAll` over the result. Two reasons, and the second is the one that mattered: a
 * selector would be a second, unasserted answer to *what is focusable in here* that could drift
 * from what was drawn, and this package's document tier deliberately has no selector engine
 * (`menuPanel.test.ts` refuses to grow one), so a trap built on one could not be driven under Node.
 *
 * It holds Tab and Shift+Tab at the two ends of that list. It is **not** the whole of a modal: a
 * reader who reaches something focusable inside the overlay that the panel did not build — a link
 * inside a notice, say — is not caught, and neither is a pointer. `inert` on the shell behind is
 * the belt to this braces and it needs `dev/main.ts`, which this lane does not own.
 */
function asModal(
  doc: Document,
  root: HTMLElement,
  label: string,
  controls: readonly HTMLElement[],
  dispatch: (intent: MenuIntent) => void,
): void {
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', label);

  CONTROLS.set(root, controls);
  DISPATCH.set(root, dispatch);
  if (WIRED.has(root)) return;
  WIRED.add(root);
  root.addEventListener('keydown', (event: KeyboardEvent) => {
    /*
     * **Escape closes, on every screen** — issues #33 and #68, and § D249 § 3's refused
     * alternative. Binding it to `back` was considered and rejected there: it would work on the
     * five screens with a history and do nothing on the root, *"which is exactly where #40's
     * reporter is standing"*. So the key means the same thing everywhere, and what it means is the
     * `close` intent — which is a member of {@link MenuIntent} rather than a `root.hidden = true`
     * here, because hiding the overlay is one of two things `dev/main.ts#closeMenu` does and a
     * second writer of the first would leave the second undone.
     */
    if (event.key === 'Escape') {
      event.preventDefault();
      DISPATCH.get(root)?.({ kind: 'close' });
      return;
    }
    if (event.key !== 'Tab') return;
    const list = CONTROLS.get(root) ?? [];
    if (list.length === 0) return;
    const at = list.indexOf(doc.activeElement as HTMLElement);
    const backwards = event.shiftKey;
    if (at !== (backwards ? 0 : list.length - 1)) return;
    event.preventDefault();
    list[backwards ? list.length - 1 : 0]?.focus();
  });
}

/** The key of the control the reader is standing on, or `undefined` if they are outside the menu. */
function focusedControlKey(doc: Document, root: HTMLElement): string | undefined {
  const active = doc.activeElement;
  if (active === null || active === undefined || !root.contains(active)) return undefined;
  return active.getAttribute(CONTROL_KEY) ?? undefined;
}

/**
 * Whether this overlay has had the reader in it since it was last opened.
 *
 * Not *where* they are — {@link CONTROL_KEY} answers that. This answers *have they been here at
 * all*, which is the one thing that tells an empty `document.activeElement` mid-blur apart from an
 * empty one on a dialog that has just gone up. Cleared while hidden, because coming back is
 * arriving again. See {@link restoreFocus}.
 */
const HAS_HELD_FOCUS = new WeakSet<HTMLElement>();

/**
 * Put the reader back where they were, bring them in if they have never been here, and — the case
 * this used to get wrong — leave them alone while the browser is in the middle of moving them.
 *
 * ## Why this is not a nicety
 *
 * A redraw that rebuilds the tree destroys the focused element, so **every** state change dropped
 * focus to `<body>` — and the overlay sits last in the document, so the next Tab from `<body>`
 * walks into the shell *behind* the menu rather than into the menu. That is how issue #68's
 * reporter reached the seed field: not by tabbing past the end of a short list, but by tabbing
 * forward from nowhere.
 *
 * ## The third branch, and why the first two were a trap on their own — GitHub issue #106
 *
 * `change` on a text field fires **during a blur**, and a blur is the default action of both
 * `mousedown` and Tab. At that instant `document.activeElement` is the body: the old element has
 * been let go and the new one has not been taken up. So a redraw driven by a field commit looked
 * exactly like a dialog that had just opened, and this function did what a dialog that has just
 * opened wants — it pulled focus to `controls[0]`.
 *
 * On the account screen `controls[0]` is the email field, which is the field the reader has just
 * left. So Tab out of the address and into *Email me a link* put focus straight back in the
 * address, on every attempt, and there was no keyboard route to the button at all. The pointer had
 * the same problem from the other end (see {@link reconcile}), which is why the issue reads as one
 * defect and is two.
 *
 * The signal that separates the two cases is not *is anything focused* but *has anybody ever been
 * in here*: a blur can only happen to a reader who was already standing on something.
 * {@link HAS_HELD_FOCUS} is that, and nothing finer would do — the key of the control they were on
 * is already gone by the time `change` fires.
 *
 * **Never while hidden.** `dev/main.ts#closeMenu` sets `hidden` and later draws still run, so
 * without this guard leaving the menu would immediately steal focus back into it.
 */
function restoreFocus(
  doc: Document,
  root: HTMLElement,
  controls: readonly HTMLElement[],
  wasOn: string | undefined,
): void {
  if (root.hidden) {
    HAS_HELD_FOCUS.delete(root);
    return;
  }
  if (controls.length === 0) return;

  const active = doc.activeElement;
  // Already inside, which since `retainer` is the ordinary case rather than the lucky one: the
  // control the reader is standing on is the same element it was before the draw.
  if (active !== null && root.contains(active)) {
    HAS_HELD_FOCUS.add(root);
    return;
  }

  // They were on a control of ours and this draw took it away — a screen change. The one with the
  // same key if there is one, the top of the new screen if there is not.
  const again =
    wasOn === undefined
      ? undefined
      : controls.find((control) => control.getAttribute(CONTROL_KEY) === wasOn);
  if (again !== undefined) {
    again.focus();
    HAS_HELD_FOCUS.add(root);
    return;
  }
  if (wasOn === undefined && HAS_HELD_FOCUS.has(root)) return;

  const first = controls[0];
  if (first === undefined) return;
  first.focus();
  HAS_HELD_FOCUS.add(root);
}

/* -------------------------------------------------------------------------- *
 * One affordance
 * -------------------------------------------------------------------------- */

/**
 * Turn one {@link MenuAffordance} into an element.
 *
 * The `select`, `toggle` and `text` arms rebuild their intent from what the player chose — which is
 * why {@link MenuIntent} `set-free-play` and `set-setting` carry a **field and a value** rather than
 * a prepared patch. A prepared patch would have been the answer to a question nobody had asked yet,
 * since the affordance is built before anybody picks anything.
 *
 * **The rewrite is `menu/screens.ts#withChosenValue` and is not written here.** It used to be, as a
 * ternary naming two of the six intents that carry a chosen value, and the other four therefore
 * dispatched the value that was already showing — issues #44 and #42, and latent on `set-challenge`
 * and `set-constraint`. A conditional over a union with a fallback arm is a silent default; that
 * function is an exhaustive switch, so the seventh such intent cannot be added without an arm. See
 * its docstring for the whole of the argument.
 */
function affordance(draw: Draw, host: MenuPanelHost, row: MenuAffordance): HTMLElement {
  const withValue = (value: string): MenuIntent => withChosenValue(row.intent, value);

  /*
   * The **control** is kept, never the row wrapper. A `select` row is a `<label>` around a
   * `<select>`, and it is the `<select>` a Tab lands on; keeping the label would build a focus ring
   * that never matches `document.activeElement` and a trap that never fires.
   */
  if (row.kind === 'select') {
    return selectRow(
      draw,
      row.label,
      row.value ?? '',
      row.options ?? [],
      row.id,
      (id) => {
        host.dispatch(withValue(id));
      },
      // The screen decides the words; this only draws them — `textRow`'s own rule, extended to
      // selects for the one row that carries a relationship sentence (docs/19's playback-speed
      // nit). A row that carries none draws none.
      row.detail,
    );
  }
  if (row.kind === 'toggle') {
    return toggleRow(draw, row.label, row.value === 'on', row.id, (value) => {
      host.dispatch(withValue(value ? 'on' : 'off'));
    });
  }
  if (row.kind === 'text') {
    return textRow(draw, {
      label: row.label,
      type: 'text',
      value: row.value ?? '',
      key: row.id,
      // Said before it is broken rather than after — issue #111(c). The screen decides the words;
      // this only draws them, and a row that carries none draws none.
      hint: row.detail,
      placeholder: row.placeholder,
      inputMode: row.inputMode,
      onChange: (value) => {
        host.dispatch(withValue(value));
      },
    });
  }

  const base = row.kind === 'back' ? 'menu-back' : row.kind === 'commit' ? 'menu-start' : 'menu-row';
  const button = draw.retain('button', `row.${row.id}`, {
    /*
     * A **modifier**, appended and never substituted — `MINE`'s precedent below, and the reason is
     * the same one. The recommendation this marks is already in the row's own words (*Start here*),
     * so the class is the second channel rather than the only one (KB-15); and a replacement class
     * would have taken the row's padding, border and focus ring with it, so the recommended row would
     * have stopped looking like a row of this menu at all.
     *
     * `retainer` re-applies `className` on the reuse path whenever it differs, so a row that gains or
     * loses the recommendation across a redraw is restyled rather than left carrying the old class —
     * which is what makes this safe on the one screen whose rows change with the view mode.
     */
    className: row.primary === true ? `${base} ${PRIMARY_ROW}` : base,
    attrs: { type: 'button' },
  });
  /*
   * The spans are retained too, and that is not tidiness — it is the whole of issue #106 on this
   * control. A browser remembers the **innermost** element the pointer went down on, and on a row
   * that is the `.menu-row-name` span rather than the button around it. Rebuilding the label while
   * keeping the button would drop the click just as surely as rebuilding the button did.
   */
  const name = draw.retain('span', `name.${row.id}`, { className: 'menu-row-name' });
  setText(name, row.label);
  const kids: Node[] = [name];
  // Disabled **and** explained, always. A control that refuses in silence moves an explainable
  // error to the one moment with no words for it.
  const detail = row.enabled ? row.detail : (row.disabledWhy ?? row.detail);
  if (detail !== undefined && detail.length > 0) {
    const help = draw.retain('span', `detail.${row.id}`, { className: 'menu-row-detail' });
    setText(help, detail);
    kids.push(help);
  }
  reconcile(button, ...kids);
  if (row.enabled) button.removeAttribute('disabled');
  else button.setAttribute('disabled', 'disabled');
  on(button, 'click', () => {
    host.dispatch(row.intent);
  });
  // A disabled button is not focusable, so it is not in the ring. Putting it there would build a
  // trap whose last member cannot be reached, and Tab would walk straight past it into the shell.
  // Written **both ways** since the button outlives the draw: a row that has just been refused
  // would otherwise keep the key it was registered under when it was still pressable, and the trap
  // would go on offering a control Tab can no longer reach.
  if (row.enabled) draw.keep(button, row.id);
  else button.removeAttribute(CONTROL_KEY);
  return button;
}

/**
 * The row a screen recommends — GitHub issue #90's *"there is no row that says Start here"*.
 *
 * A modifier over `menu-row` or `menu-start`, on {@link MINE}'s rule: the tint is never the only
 * signal, because the row says *Start here* in its own label and `MenuAffordance.primary` is what the
 * stylesheet is agreeing with rather than what it is asserting.
 *
 * Written as a `const` so `dev/surfaces.test.ts` sees it. That test derives the class names this file
 * emits **from this file's source** and requires a rule for each in `index.html`; it matches single
 * quotes, so a name that only ever appeared inside a template literal would be invisible to it and
 * would ship unstyled — which is the exact failure that test was written about.
 */
const PRIMARY_ROW = 'menu-row-primary';

/* -------------------------------------------------------------------------- *
 * How to play — an entry that discloses rather than navigates
 * -------------------------------------------------------------------------- */

/**
 * The guide, as a native disclosure in the menu list — GitHub issue #13.
 *
 * ## Three shapes were available and this is the one that costs nothing to be wrong about
 *
 * A seventh **screen** would have been the obvious fit — it is what Settings is — and it is not
 * built, for a reason outside this file: `MENU_SCREENS` is walked by an exhaustive switch in
 * `playthrough/walk.test.ts`, which this lane does not own, so widening the union here breaks a
 * build somewhere else. A **button plus panel state** would have needed a {@link MenuIntent} the
 * shell's own switch performs, and an intent nothing performs is the dead control this package has
 * shipped eleven times.
 *
 * `details` needs neither. The browser owns the open/closed state, it starts closed so it blocks
 * nothing, `summary` is focusable and operable from the keyboard without a handler, and the whole
 * thing is inert to the state machine — which is the honest description of a page that only
 * explains.
 *
 * ## Every class here already has a rule
 *
 * `dev/surfaces.test.ts` derives the class names this file emits from its own source and requires
 * a rule for each in `index.html`, which this lane also does not own. So the entry is built from
 * the vocabulary the menu already ships: the row card, the row name, the row detail line, and the
 * note paragraph. Nothing new is introduced, and the entry therefore looks like the six above it
 * because it is made of the same parts.
 */
function guideEntry(draw: Draw, guide: MenuGuide): HTMLElement {
  /*
   * Retained, and here that buys something a reader can feel: the browser owns this entry's
   * open/closed state, and a `<details>` rebuilt on every redraw slams shut under somebody who had
   * opened it and then touched any other control on the screen.
   */
  const block = draw.retain('details', 'row.guide');

  // Structured exactly as `affordance` builds a navigate row, so the closed entry is visually the
  // seventh member of the list rather than a different kind of thing that happens to sit under it.
  // Kept in the focus ring because `summary` is focusable without a `tabindex`, so a trap that did
  // not know about it would end one control short of where Tab actually goes.
  const summary = draw.keep(draw.retain('summary', 'control.guide', { className: 'menu-row' }), 'guide');
  const name = draw.retain('span', 'guide.name', { className: 'menu-row-name' });
  setText(name, guide.title);
  const lead = draw.retain('span', 'guide.lead', { className: 'menu-row-detail' });
  setText(lead, guide.summary);
  reconcile(summary, name, lead);

  const body = draw.retain('div', 'guide.body');
  const lines: Node[] = [];
  for (const section of guide.sections) {
    const heading = el(draw.doc, 'p', { className: 'menu-row-name' });
    setText(heading, section.heading);
    lines.push(heading);
    for (const paragraph of section.body) {
      const line = el(draw.doc, 'p', { className: 'menu-note' });
      setText(line, paragraph);
      lines.push(line);
    }
  }
  // `fill`, not `reconcile`: prose, and nothing in here is pressable.
  fill(body, ...lines);

  reconcile(block, summary, body);
  return block;
}

function issueList(draw: Draw, key: string, issues: readonly string[]): HTMLElement {
  const list = draw.retain('ul', key, { className: 'menu-issues' });
  fill(
    list,
    ...issues.map((issue) => {
      const item = el(draw.doc, 'li', {});
      setText(item, issue);
      return item;
    }),
  );
  return list;
}

/* -------------------------------------------------------------------------- *
 * Account — one field at a time, and never a credential
 * -------------------------------------------------------------------------- */

/**
 * The single question this screen is asking right now.
 *
 * ## What was deleted here, and why deleting was the fix rather than disabling
 *
 * This function drew a mode toggle, an address, a conditional display name **and a live
 * `<input type="password">`**. § D241 replaced the credential with a mailed link and deleted the
 * password path from the server and the model; issue #30 is what a *half*-deleted one costs, and
 * the reporter put it exactly right: *"a password field that is presented as functional, accepts
 * input, and is wired to nothing is a keystroke collector by accident, and the player has no way to
 * know that before typing."* Disabling it would have kept the box on the page. It is gone, and
 * `menu/client.test.ts` sweeps every shipped module under `packages/viz/src` for the literal so it
 * cannot come back through some other file.
 *
 * The mode toggle went with it (issue #31). There is no sign-in/register split to toggle: asking
 * for a display name **only when the address is new** tells the person filling in the form whether
 * the address is new, which is the account-enumeration oracle the server's identical-bytes 202
 * exists to close (§ D241 § 7).
 *
 * ## One field, chosen by the session rather than by this function
 *
 * Signed out, the question is the address. Signed in and unnamed, it is the name — and
 * `account.ts#namingStage` decides which, because *which field is live is a fact about the session*.
 * That is also why `formIssues` now takes the **state**: handing it a bare form made the caller
 * decide, which is the split that let issue #31's screen print a sign-in error under a registration
 * form.
 *
 * **Its fields are in the focus ring, and that is the point of the ring.** Issue #33 names this
 * screen for the reason: *"Account is a form. Tabbing from the last field is the single most
 * ordinary keyboard action on that screen, and it can drop the player onto controls behind a screen
 * they cannot see."*
 */
function accountForm(
  draw: Draw,
  host: MenuPanelHost,
  state: AccountState,
  naming: boolean,
): HTMLElement {
  const wrap = draw.retain('div', 'account.form', { className: 'menu-account' });
  const blocks: Node[] = [];

  const field = (label: string, type: 'text' | 'email', key: string, value: string): void => {
    blocks.push(
      textRow(draw, {
        label,
        type,
        value,
        key: `account.${key}`,
        onChange: (next) => {
          host.dispatch({ kind: 'account-form', patch: { [key]: next } });
        },
      }),
    );
  };
  if (naming) field('Display name', 'text', 'displayName', state.form.displayName);
  else field('Email', 'email', 'email', state.form.email);

  /*
   * Shown, not merely counted. `formIssues` reports all of them at once so a player is not made to
   * guess how many there are — and only once they have typed something, so an untouched form is not
   * a wall of complaints. `canSubmitForm` is the same predicate one layer up and is the shell's
   * gate; it is asked here only so this screen never shows a clean form the shell would refuse.
   */
  const issues = formIssues(state);
  const typed = naming ? state.form.displayName.length : state.form.email.length;
  if (issues.length > 0 && typed > 0) {
    blocks.push(issueList(draw, 'account.issues', issues.map((issue) => issue.message)));
  }
  if (!canSubmitForm(state) && state.retryInMs !== undefined) {
    // The 429 gate, said where the form is. § D242 charges its budgets per address and per caller,
    // so a form that stayed live after a refusal would spend a second request on somebody who did
    // nothing wrong — and the server has already said it will refuse it.
    blocks.push(
      noticeLine(
        draw,
        'account.retry',
        'That request was refused for now. Wait for the time named above before asking again.',
      ),
    );
  }
  reconcile(wrap, ...blocks);
  return wrap;
}

/* -------------------------------------------------------------------------- *
 * Leaderboard — one board's rows
 * -------------------------------------------------------------------------- */

/**
 * The selected board's entries.
 *
 * Two rules from elsewhere land here and neither is negotiable. **The server's own note about the
 * ranking is printed verbatim** — § D106's *energy is an axis, never a score*, generalised: one
 * metric orders the rows and the others sit beside it, never combined. And a board with nothing in
 * it says so in words rather than drawing an empty table that reads like a failure.
 */
function boardTable(draw: Draw, view: LeaderboardView, account: AccountState): HTMLElement {
  const doc = draw.doc;
  /*
   * Only the wrapper is retained, and that is enough: everything inside it is prose and figures,
   * and a reader cannot press any of it. What the wrapper buys is that the *rest* of the screen —
   * the rows above it — is not shifted about when a board arrives.
   */
  const wrap = draw.retain('div', 'board', { className: 'menu-leaderboard' });
  const blocks: Node[] = [];
  if (view.notice !== undefined) blocks.push(noticeLine(draw, 'board.notice', view.notice));

  const page = view.page;
  if (page === undefined) {
    // Nothing to read, so the screen shows the **shape** of what would be read — issue #34.
    if (view.boards.length === 0) blocks.push(exampleBoard(doc));
    fill(wrap, ...blocks);
    return wrap;
  }

  const note = el(doc, 'p', { className: 'menu-note' });
  setText(note, page.note);
  blocks.push(note);

  if (page.entries.length === 0) {
    const empty = el(doc, 'p', {});
    setText(empty, 'Nothing has been posted to this board yet.');
    blocks.push(empty);
    // A board that exists and is empty is still a board whose shape is worth showing — and it is
    // the one case where the reader is about to be the first row on it.
    blocks.push(exampleBoard(doc));
    fill(wrap, ...blocks);
    return wrap;
  }

  /*
   * Which row is the reader's, and how far off the top it is \u2014 GitHub issue #93 \u00a7 3.
   *
   * The challenge board next door has done both since issue #112 and this one did neither, which is
   * the half of #93 that is a straightforward omission rather than a design question: `boardRow`'s
   * own `mine` parameter was written here, documented here, and set by exactly one of its two
   * callers. Matched on the display name for `challengeBoardTable`'s reason \u2014 it is the only
   * identity on the wire, the store refuses a duplicate name case-insensitively, and it is compared
   * case-insensitively so a reader who signed up as `Ada` is not told none of these rows is theirs.
   */
  const mine = account.user?.displayName.toLowerCase();
  const ranked = RANKED_MEASURED[page.metric];
  const leader = page.entries[0]?.measured;

  const table = el(doc, 'ol', { className: 'menu-board' });
  for (const entry of page.entries) {
    const isMine = mine !== undefined && entry.displayName.toLowerCase() === mine;
    table.append(
      boardRow(doc, {
        name: entry.displayName,
        // All four, always. Showing only the ranked one would let a reader infer the others moved
        // with it, which is the claim the note exists to refuse.
        figures:
          `AWT ${entry.measured.awtS.toFixed(1)} s \u00b7 WT95 ${entry.measured.wt95S.toFixed(1)} s \u00b7 ` +
          `TTD ${entry.measured.ttdMeanS.toFixed(1)} s \u00b7 over-long ${entry.measured.pctOverLongWait.toFixed(1)} %`,
        // Printed because it is what makes the row checkable: invariant 5 says a run replays from
        // its seed, and a leaderboard that hid the seed would be asking to be taken on trust.
        //
        // The dispatcher is deliberately **not** here, and that is the one place this row differs
        // from the challenge board's. There the dispatcher is the axis that varies and belongs on
        // every row; here it is in the board's own key, so printing it per row would say it varies
        // when it cannot. It is named once, above the table, by `menu/boardRun.ts#boardRevealOf`.
        meta:
          `seed ${entry.run.seed} \u00b7 one run` +
          (isMine && ranked !== undefined && leader !== undefined
            ? gapSentence(ranked.of(entry.measured) - ranked.of(leader), ranked.unit)
            : ''),
        ...(isMine ? { mine: true } : {}),
      }),
    );
  }
  blocks.push(table);
  fill(wrap, ...blocks);
  return wrap;
}

/**
 * One row of a board: who, the four figures, and the line that makes it checkable.
 *
 * Shared by the leaderboard, the challenge board and the worked example, so all three teach the same
 * shape. The third argument is the only thing that differs between them \u2014 a seed for a single run, a
 * run and leg count for a set \u2014 and it is a *string the caller composed* rather than a union this
 * function switches on, because the moment it switched it would be deciding what a board row means
 * and that decision belongs beside the data it is about.
 */
function boardRow(
  doc: Document,
  entry: {
    readonly name: string;
    readonly figures: string;
    readonly meta: string;
    /** The signed-in player's own row. Drawn differently, and never *only* differently \u2014 see below. */
    readonly mine?: boolean;
  },
): HTMLElement {
  const row = el(doc, 'li', {
    className: entry.mine === true ? `menu-board-row ${MINE}` : 'menu-board-row',
  });
  const name = el(doc, 'span', { className: 'menu-board-name' });
  /*
   * The marker is **in the text**, not only in the class. KB-15 forbids a distinction carried by
   * colour alone, and a highlighted row a screen reader cannot hear is exactly that: the reader who
   * most needs *which of these is mine* answered is the one the stylesheet cannot answer it for.
   */
  setText(name, entry.mine === true ? `${entry.name} \u2014 you` : entry.name);
  const figures = el(doc, 'span', { className: 'menu-board-figures' });
  setText(figures, entry.figures);
  const meta = el(doc, 'span', { className: 'menu-board-seed' });
  setText(meta, entry.meta);
  fill(row, name, figures, meta);
  return row;
}

/** The signed-in player's own row. A modifier on `menu-board-row`, never a replacement for it. */
const MINE = 'menu-board-you';

/**
 * What a board looks like, drawn when there is none — GitHub issue #34.
 *
 * *"An empty leaderboard should still teach me the shape of the thing: what the columns are, what
 * 'a board' is, how boards are chosen, and where I would appear. Empty is not the same as blank."*
 * The reporter had just finished a run they were pleased with and found *"nowhere to put it and
 * nobody to measure it against — and, more importantly, no picture of what measuring it against
 * someone would even look like."*
 *
 * ## The three rules this example has to keep, and it keeps all three
 *
 * **It says it is an example, in words, above itself.** A greyed row is a visual signal, and KB-15
 * forbids one carried by shape or colour alone; more to the point, a plausible-looking figure that
 * a reader might take for a measurement is exactly the thing this repository refuses to ship. The
 * two rows are named *Somebody else* and *You, if you post this run*, which cannot be mistaken for
 * accounts, and the second is where the reader is being told they would appear.
 *
 * **All four metrics, never a fifth and never a total.** § D106: one metric orders the rows, the
 * other three sit beside it, and none is folded into a score. A composite here would teach the one
 * thing the whole product refuses to say.
 *
 * **The seed is on the row.** It is what makes a row checkable — invariant 5 — and a teaching
 * example that hid it would teach the wrong shape.
 *
 * Built from the vocabulary the real table already uses, so what a reader learns here is what they
 * will meet: `dev/surfaces.test.ts` derives this file's class names from its own source and requires
 * a rule for each in `index.html`, which this lane does not own, and no class is invented.
 */
function exampleBoard(doc: Document): HTMLElement {
  const wrap = el(doc, 'div', {});
  const lead = el(doc, 'p', { className: 'menu-note' });
  setText(
    lead,
    'An example of a board, so the shape is legible before there is one. These are not real ' +
      'runs and nobody posted them.',
  );
  wrap.append(lead);

  const table = el(doc, 'ol', { className: 'menu-board' });
  const rows: readonly { readonly who: string; readonly figures: string; readonly seed: string }[] = [
    {
      who: 'Somebody else',
      figures: 'AWT 24.6 s · WT95 51.2 s · TTD 63.4 s · over-long 8.1 %',
      seed: 'seed 20260101 · one run',
    },
    {
      who: 'You, if you post this run',
      figures: 'AWT — · WT95 — · TTD — · over-long —',
      seed: 'seed — · one run',
    },
  ];
  for (const row of rows) {
    table.append(boardRow(doc, { name: row.who, figures: row.figures, meta: row.seed }));
  }
  wrap.append(table);

  const rule = el(doc, 'p', { className: 'menu-note' });
  setText(
    rule,
    'One of the four figures orders the board and the other three sit beside it — they are never ' +
      'added together, because a run that spends less by carrying fewer people has not done better. ' +
      'The seed is printed so any row can be replayed and checked.',
  );
  wrap.append(rule);
  return wrap;
}

/* -------------------------------------------------------------------------- *
 * This week's challenge — the board it already had and never drew
 * -------------------------------------------------------------------------- */

/**
 * The challenge board's rows — GitHub issue #112.
 *
 * ## Why this is a second function rather than an argument to {@link boardTable}
 *
 * The two boards rank different things. A leaderboard row is **one run**, and the honest thing to
 * print beside it is its seed, because a seed is what makes it replayable (invariant 5). A challenge
 * row is **a set** — `seedCount` runs of the same numbered seeds — so its four figures are means and
 * the honest thing beside them is the count they were taken over, which `ChallengeScore` carries as
 * `runs` and `legs` for exactly this reason (R13). One function switching on which it had been given
 * would be one place deciding what a row *means* for both.
 *
 * ## What it does not do
 *
 * **No interval and no dispersion.** `ChallengeScore`'s own docstring forbids it in as many words —
 * five runs cannot support an inference and a `[min, max]` beside a mean is read as a confidence
 * interval by everyone who has ever seen one — and `perSeed` is on the wire, which is what makes the
 * ban worth restating here rather than assuming.
 *
 * **No note of its own.** `page.note` and `page.otherDataNote` are already drawn above, as notices,
 * by `menu/screens.ts#challengeBody`. Printing them again here would be this file deciding a screen
 * says something twice.
 */
function challengeBoardTable(
  draw: Draw,
  challenge: ChallengeScreenInput | undefined,
  account: AccountState,
): HTMLElement {
  const doc = draw.doc;
  const wrap = draw.retain('div', 'challenge-board', { className: 'menu-leaderboard' });
  const page = challenge?.board;
  if (page === undefined) {
    // No server, nothing fetched yet, or a refused fetch — and each of those already has a sentence
    // in the notices above. An empty table here would be a second, wordless answer.
    fill(wrap);
    return wrap;
  }

  if (page.entries.length === 0) {
    const empty = el(doc, 'p', {});
    setText(
      empty,
      `Nothing has been posted to this board yet. Run all ${String(page.seedCount)} seeds and post ` +
        'the set to be the first row on it.',
    );
    fill(wrap, empty);
    return wrap;
  }

  /*
   * Which row is the reader's, matched on the display name.
   *
   * It is the only identity on the wire: `ChallengeBoardRow.id` is the *entry's* uuid and there is
   * no user id in the body, deliberately. Matching on the name is sound rather than a guess — the
   * store refuses a duplicate display name case-insensitively (`#userByName`), so one name is one
   * account — and it is compared the same way, because a reader who signed up as `Ada` and is drawn
   * as `ada` on the board would otherwise be told none of these rows is theirs.
   */
  const mine = account.user?.displayName.toLowerCase();
  const ranked = RANKED_MEAN[page.metric];
  const leaderScore = page.entries[0]?.score;

  const table = el(doc, 'ol', { className: 'menu-board' });
  for (const entry of page.entries) {
    const isMine = mine !== undefined && entry.displayName.toLowerCase() === mine;
    const score = entry.score;
    table.append(
      boardRow(doc, {
        name: entry.displayName,
        // All four, on `boardTable`'s rule and § D106's: one of them orders the board and the other
        // three sit beside it, and none is ever folded into the others.
        figures:
          `AWT ${score.meanAwtS.toFixed(1)} s · WT95 ${score.meanWt95S.toFixed(1)} s · ` +
          `TTD ${score.meanTtdMeanS.toFixed(1)} s · over-long ${score.meanPctOverLongWait.toFixed(1)} %`,
        // The dispatcher, because it is the axis this whole screen exists to vary: everybody on this
        // board ran the same building on the same seeds, so it is the only thing that differs.
        meta:
          `${String(score.runs)} runs · ${String(score.legs)} legs · ${entry.dispatcherProfileId}` +
          gapToLeader(isMine, ranked, score, leaderScore),
        ...(isMine ? { mine: true } : {}),
      }),
    );
  }
  fill(wrap, table);
  return wrap;
}

/**
 * How to read the ranked mean off a score, and what its unit is called.
 *
 * Written out rather than derived, because the four ids are a **wire vocabulary**:
 * `/api/challenge-board` 400s `no-such-metric` on anything else. A metric this table does not know
 * is left without a gap rather than guessed at — see {@link gapToLeader} — so a fifth one added
 * server-side degrades to *no extra sentence* rather than to a number in the wrong unit.
 */
const RANKED_MEAN: Readonly<
  Record<string, { readonly of: (score: ChallengeScore) => number; readonly unit: string } | undefined>
> = Object.freeze({
  awtS: { of: (score) => score.meanAwtS, unit: 's' },
  wt95S: { of: (score) => score.meanWt95S, unit: 's' },
  ttdMeanS: { of: (score) => score.meanTtdMeanS, unit: 's' },
  pctOverLongWait: { of: (score) => score.meanPctOverLongWait, unit: 'points' },
});

/**
 * The reader's distance from the top row, on the one metric the board is ordered by.
 *
 * On the reader's own row and nowhere else, which is the whole of what keeps it a fact rather than a
 * claim: it is the difference between two published figures on the axis the server has already
 * sorted, said to the person who posted one of them. It is deliberately **not** a sentence about
 * dispatchers — `docs/10` § 5.5 and § D218 § 5 clause 5 leave that to Compare, which is the only
 * surface with the replications to say it, and `view.compare.note` is drawn above this table saying
 * so.
 *
 * Empty for the leader themselves, and empty for a metric this build does not know.
 */
function gapToLeader(
  isMine: boolean,
  ranked: { readonly of: (score: ChallengeScore) => number; readonly unit: string } | undefined,
  score: ChallengeScore,
  leader: ChallengeScore | undefined,
): string {
  if (!isMine || ranked === undefined || leader === undefined) return '';
  return gapSentence(ranked.of(score) - ranked.of(leader), ranked.unit);
}

/**
 * The one sentence both boards say about a gap, so they cannot come to say it differently.
 *
 * Extracted when the configuration board grew the same feature (GitHub issue #93 § 3): the challenge
 * board has highlighted the reader's row and printed its distance from the top since issue #112, and
 * the leaderboard — the screen #93 is actually about — did neither. Two copies of this arithmetic
 * would be two places deciding what *behind* means, and the tie case is exactly where they would
 * drift.
 */
function gapSentence(gap: number, unit: string): string {
  // Every ranked metric on either board is a cost, so a non-positive gap means this row *is* the top
  // row — or ties it, which is not a thing to congratulate somebody on in a sentence about a
  // difference.
  if (!(gap > 0)) return '';
  return ` · ${gap.toFixed(1)} ${unit} behind the top row on this board’s metric`;
}

/**
 * How to read the ranked figure off a leaderboard row, and what its unit is called.
 *
 * {@link RANKED_MEAN}'s sibling, and separate for that record's own reason: the two boards rank
 * different things. A challenge score is a **mean over a seed set** and a leaderboard entry is
 * **one run**, so a shared table would have to decide which a `metric` names, and the four ids only
 * look like the same vocabulary. Both degrade the same way — a metric this build does not know gets
 * no gap sentence rather than a number in the wrong unit.
 */
const RANKED_MEASURED: Readonly<
  Record<string, { readonly of: (measured: ClaimedMetrics) => number; readonly unit: string } | undefined>
> = Object.freeze({
  awtS: { of: (measured) => measured.awtS, unit: 's' },
  wt95S: { of: (measured) => measured.wt95S, unit: 's' },
  ttdMeanS: { of: (measured) => measured.ttdMeanS, unit: 's' },
  pctOverLongWait: { of: (measured) => measured.pctOverLongWait, unit: 'points' },
});

function noticeLine(draw: Draw, key: string, text: string): HTMLElement {
  const line = draw.retain('p', key, { className: 'menu-notice' });
  setText(line, text);
  return line;
}

/* -------------------------------------------------------------------------- *
 * Rows
 * -------------------------------------------------------------------------- */

function selectRow(
  draw: Draw,
  label: string,
  value: string,
  options: readonly { readonly id: string; readonly name: string; readonly detail?: string | undefined }[],
  key: string,
  onChange: (id: string) => void,
  hint?: string | undefined,
): HTMLElement {
  const row = draw.retain('label', `row.${key}`, { className: 'menu-select' });
  const text = draw.retain('span', `label.${key}`);
  setText(text, label);
  const select = draw.keep(draw.retain('select', `control.${key}`), key);
  // The `<select>` is retained and its options are not, which is the one place issue #106's rule
  // does not reach: an option is pressed inside a popup the browser owns, never in this tree, so
  // rebuilding the list under a pointer costs nothing. The element the pointer is standing on here
  // is the select, and that stays.
  fill(
    select,
    ...options.map((option) => {
      const node = el(draw.doc, 'option', { attrs: { value: option.id } });
      setText(node, option.detail === undefined ? option.name : `${option.name} — ${option.detail}`);
      if (option.id === value) node.setAttribute('selected', 'selected');
      return node;
    }),
  );
  /*
   * The attribute above is the option's *default* selectedness, which is what a freshly built
   * `<select>` picks up. This one is the live value, and it is written because the element now
   * outlives the draw: a retained select whose options were replaced would otherwise hold whatever
   * the browser fell back to rather than what the state says.
   */
  if (options.some((option) => option.id === value) && select.value !== value) select.value = value;
  on(select, 'change', () => {
    onChange(select.value);
  });
  // `textRow`'s hint span, same class and same absence rule: no sentence, no node.
  const help =
    hint === undefined || hint === ''
      ? undefined
      : draw.retain('span', `hint.${key}`, { className: 'menu-hint' });
  if (help !== undefined) setText(help, hint ?? '');
  reconcile(row, text, select, help);
  return row;
}


/** One text field, as the screen decided it. See {@link textRow}. */
interface TextRowSpec {
  readonly label: string;
  readonly type: 'text' | 'email';
  readonly value: string;
  readonly key: string;
  /** A line under the box that is always there — {@link MenuAffordance.detail} on a `text` row. */
  readonly hint?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly inputMode?: 'numeric' | undefined;
  readonly onChange: (value: string) => void;
}

/**
 * A labelled text input.
 *
 * `type` carries the two the product still collects — a name and an address. It used to carry a
 * third, and that third is the whole of GitHub issue #30: a live credential box wired to a path
 * § D241 had deleted. The union is now the enumeration of what may be asked for, so a fourth kind
 * of field is a deliberate edit here rather than a string somebody passed.
 *
 * `email` is not decoration either: it gets the right keyboard on a phone and the browser's own
 * autofill, on the one field a player is least willing to retype.
 *
 * ## It commits on `input`, and that is GitHub issue #111(a)
 *
 * `change` on a text field fires on **blur**. So the state was one commit behind the box, and every
 * decision taken from the state was one commit behind what the player was looking at. Measured on
 * the Seed field: type `abc` and Start is still enabled — a refused selection you may press — blur
 * and it disables; type `777` over it and Start stays **disabled under a valid seed**, beside a
 * sentence saying *"a seed is 1–20 digits"* about a box holding three of them. Neither half is a
 * cosmetic lag: the first offers a run the model has already refused, and the second refuses a run
 * the model would accept, and a player has no way to tell that the fix is to click elsewhere.
 *
 * Both listeners stay. `input` is what makes the state track the box; `change` is what catches the
 * commits `input` is not guaranteed to raise on every browser and assistive path, and a second
 * commit of a string the state already holds is refused one layer down — `account.ts#updateForm`
 * says so in its own words, and `updateFreePlay` of an identical value produces an identical
 * selection.
 *
 * **What makes it safe is issue #106 and nothing else**, which is why that landed first. A commit
 * redraws the whole overlay, so this is now a redraw per keystroke. **Retention is the whole of
 * what carries it**, and that is measured rather than reasoned: with {@link retainer} forced to
 * build a fresh element every draw, `menu.browser.test.ts § keeps the caret where the reader put
 * it` fails with the field holding `202604` — the two characters typed into the middle of it
 * reached nothing at all, because the element they were being typed into stopped existing between
 * keystrokes — and *Tab out of the field reaches Start* fails beside it. With retention, both pass
 * against a real Chromium.
 *
 * The value is set as a property and not an attribute, so re-rendering does not blow away what the
 * player is mid-way through typing.
 *
 * ## The guard on that write, and the claim about it that was wrong
 *
 * This comment used to say — and `dev/dom.ts`'s sibling rules imply — that *assigning `value` to a
 * text input moves the caret to the end of the string **even when the string is unchanged***. It
 * was written for this change before this change existed, and it is **false**. HTML's own value
 * setter moves the text entry cursor only when the sanitized new value *differs from the old*, and
 * Chromium implements it: measured on a bare `<input>` holding `202604` with the caret at 4,
 * assigning `'202604'` leaves it at **4** and assigning `'999999'` moves it to **6**. Removing the
 * comparison below changes no browser-observable behaviour on any path this menu has today, because
 * a commit is synchronous and neither `updateFreePlay` nor `account.ts#updateForm` rewrites the
 * string it was handed — so the state and the box always agree by the time the draw runs.
 *
 * The guard stays, with the honest reason rather than the invented one: it is the difference
 * between *the state agrees with the box* and *the state is written back onto the box*, and the day
 * a reducer normalises a value — trims a seed, lower-cases an address — that is exactly the write
 * that would throw a reader correcting the middle of a field to the end of it. It costs a string
 * comparison and it is the only thing standing between here and that.
 *
 * `restoreFocus` restores a control and has never restored a caret, which is why none of this can
 * be delegated to it.
 *
 * ## The account form now complains while you type, and that is the same fix
 *
 * `accountForm` shows `formIssues` once anything has been typed, so a live commit makes the
 * complaint live too. That is deliberate: the alternative is a form that tells you the address is
 * malformed only after you have left it, which is the defect above wearing a different label. The
 * complaint clears on the keystroke that fixes it, which is the half a blur-only commit could not
 * offer at all.
 *
 * ## Enter, and why it is here rather than in a `<form>`
 *
 * See {@link implicitSubmit} for what Enter presses and why the submit stays outside a form. Two
 * details belong here, next to the handler. The value is **committed first**, because the browser
 * has not fired `change` yet and submitting would otherwise validate and send the string as it was
 * before the reader typed. And `preventDefault` is called, because a text input's own Enter
 * behaviour is to fire that `change` — a second commit of a value the state already holds, landing
 * *after* the request has started and clearing the notice it had just put on the screen.
 * `account.ts#updateForm` refuses a commit that changes nothing for the same reason, so the pair is
 * belt and braces rather than one guard doing all the work.
 */
function textRow(draw: Draw, spec: TextRowSpec): HTMLElement {
  const { key, onChange } = spec;
  const row = draw.retain('label', `row.${key}`, { className: 'menu-text' });
  const text = draw.retain('span', `label.${key}`);
  setText(text, spec.label);
  /*
   * The attributes are written at creation and never again, which {@link retainer} allows for
   * everything but the class. They are constants of the field rather than of the draw — a seed field
   * does not stop wanting a numeric keypad between keystrokes — so there is nothing here for a later
   * draw to keep current.
   */
  const input = draw.keep(
    draw.retain('input', `control.${key}`, {
      attrs: {
        type: spec.type,
        ...(spec.placeholder === undefined ? {} : { placeholder: spec.placeholder }),
        ...(spec.inputMode === undefined ? {} : { inputmode: spec.inputMode }),
      },
    }),
    key,
  );
  if (input.value !== spec.value) input.value = spec.value;
  const commit = (): void => {
    onChange(input.value);
  };
  // The pair, and the order they arrive in: `input` on every keystroke, `change` on the blur that
  // follows. See the docstring for why both.
  on(input, 'input', commit);
  on(input, 'change', commit);
  const submit = draw.submit;
  on(input, 'keydown', (event) => {
    if ((event as KeyboardEvent).key !== 'Enter' || submit === undefined) return;
    event.preventDefault();
    commit();
    submit();
  });
  const hint =
    spec.hint === undefined || spec.hint === ''
      ? undefined
      : draw.retain('span', `hint.${key}`, { className: 'menu-hint' });
  if (hint !== undefined) setText(hint, spec.hint ?? '');
  reconcile(row, text, input, hint);
  return row;
}

function toggleRow(
  draw: Draw,
  label: string,
  value: boolean,
  key: string,
  onChange: (value: boolean) => void,
): HTMLElement {
  const row = draw.retain('label', `row.${key}`, { className: 'menu-toggle' });
  const text = draw.retain('span', `label.${key}`);
  setText(text, label);
  const input = draw.keep(
    draw.retain('input', `control.${key}`, { attrs: { type: 'checkbox' } }),
    key,
  );
  // The attribute is the box's *default* state and the property is its live one. Both, and both
  // ways: a retained box the reader has already ticked stays ticked otherwise, however firmly the
  // state it is drawn from says the setting is off.
  if (value) input.setAttribute('checked', 'checked');
  else input.removeAttribute('checked');
  if (input.checked !== value) input.checked = value;
  on(input, 'change', () => {
    onChange(input.checked);
  });
  reconcile(row, text, input);
  return row;
}
