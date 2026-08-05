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

import { el, fill, setText } from './dom.js';
import { canSubmitForm, formIssues, postingRefusal, type AccountState } from '../menu/account.js';
import type { BoardPage } from '../menu/client.js';

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
  /** What only the shell knows: whether a run is on screen, and whether it may be ranked. */
  runState(): { readonly hasRun: boolean; readonly rankingRefusal: string | undefined };
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
 * The panel owns this because the panel is the only thing that knows what is *in* the overlay. It
 * does not own the other half and does not pretend to: `inert` on the shell behind, and Escape
 * closing the menu, both need `dev/main.ts` — the first because the shell's own elements are not
 * this file's to disable, the second because there is no {@link MenuIntent} that closes the overlay
 * and adding one whose arm nothing performs is the dead control this package has shipped eleven
 * times. Both are filed rather than half-built.
 */
export function renderMenu(root: HTMLElement, host: MenuPanelHost): void {
  const doc = host.doc;
  const account = host.account();
  const board = host.leaderboard();
  const run = host.runState();
  const view = screenOf({
    state: host.state(),
    catalogue: host.catalogue,
    canPost: account.user !== undefined,
    postingRefusal: postingRefusal(account),
    hasRun: run.hasRun,
    rankingRefusal: run.rankingRefusal,
    boards: board.boards,
    viewMode: host.viewMode(),
    challenge: host.challenge(),
    commissioning: host.commissioning(),
    calendarPeriodId: host.calendarPeriodId(),
  });

  /*
   * Which control the reader was on, read **before** the fill that destroys it.
   *
   * `fill` replaces every child, so the focused element is gone by the time the new tree exists —
   * which is why focus fell out of this overlay on every state change, not only when somebody
   * tabbed past the end. See {@link restoreFocus}.
   */
  const wasOn = focusedControlKey(doc, root);

  const controls: HTMLElement[] = [];
  const keep: KeepControl = (control, key) => {
    control.setAttribute(CONTROL_KEY, key);
    controls.push(control);
    return control;
  };

  const children: Node[] = [];
  const heading = el(doc, 'h1', { className: 'menu-title' });
  setText(heading, view.title);
  children.push(heading);

  for (const notice of view.notices) children.push(noticeLine(doc, notice));

  const list = el(doc, 'div', { className: 'menu-list' });
  for (const row of view.rows) list.append(affordance(doc, host, row, keep));
  // The seventh entry on the root, and it is an entry rather than a row: see the comment on
  // `MenuScreenView.guide` for why the guide carries no intent and asks nothing of the shell.
  if (view.guide !== undefined) list.append(guideEntry(doc, view.guide, keep));
  children.push(list);

  if (view.issues.length > 0) children.push(issueList(doc, view.issues));

  // The two screens with content an affordance cannot express: a credential form, and a table of
  // somebody else's runs. Both are drawn below the rows the model does own.
  if (view.screen === 'account' && account.user === undefined) {
    children.push(accountForm(doc, host, account, keep));
  }
  if (view.screen === 'account' && account.notice !== undefined) {
    children.push(noticeLine(doc, account.notice));
  }
  if (view.screen === 'leaderboard') children.push(boardTable(doc, board));

  fill(root, ...children);
  asModal(doc, root, view.title, controls);
  restoreFocus(doc, root, controls, wasOn);
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
): void {
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', label);

  CONTROLS.set(root, controls);
  if (WIRED.has(root)) return;
  WIRED.add(root);
  root.addEventListener('keydown', (event: KeyboardEvent) => {
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
 * Put the reader back where they were, or bring them in if they were not here.
 *
 * ## Why this is not a nicety
 *
 * `fill` replaces every child on every redraw, so **every** state change dropped focus to `<body>`
 * — and the overlay sits last in the document, so the next Tab from `<body>` walks into the shell
 * *behind* the menu rather than into the menu. That is how issue #68's reporter reached the seed
 * field: not by tabbing past the end of a short list, but by tabbing forward from nowhere.
 *
 * So the two branches are one rule with two causes. The reader was on a control and it no longer
 * exists: find the one with the same key, because a control keeps its identity across a redraw even
 * though its element does not. The reader was not in the overlay at all and the overlay is up:
 * bring them to the first control, which is what opening a modal is supposed to do.
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
  if (root.hidden || controls.length === 0) return;
  if (wasOn === undefined && root.contains(doc.activeElement)) return;
  const again = controls.find((control) => control.getAttribute(CONTROL_KEY) === wasOn);
  (again ?? controls[0])?.focus();
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
function affordance(
  doc: Document,
  host: MenuPanelHost,
  row: MenuAffordance,
  keep: KeepControl,
): HTMLElement {
  const withValue = (value: string): MenuIntent => withChosenValue(row.intent, value);

  /*
   * The **control** is kept, never the row wrapper. A `select` row is a `<label>` around a
   * `<select>`, and it is the `<select>` a Tab lands on; keeping the label would build a focus ring
   * that never matches `document.activeElement` and a trap that never fires.
   */
  if (row.kind === 'select') {
    return selectRow(doc, row.label, row.value ?? '', row.options ?? [], keep, row.id, (id) => {
      host.dispatch(withValue(id));
    });
  }
  if (row.kind === 'toggle') {
    return toggleRow(doc, row.label, row.value === 'on', keep, row.id, (value) => {
      host.dispatch(withValue(value ? 'on' : 'off'));
    });
  }
  if (row.kind === 'text') {
    return textRow(doc, row.label, 'text', row.value ?? '', keep, row.id, (value) => {
      host.dispatch(withValue(value));
    });
  }

  const button = el(doc, 'button', {
    className: row.kind === 'back' ? 'menu-back' : row.kind === 'commit' ? 'menu-start' : 'menu-row',
    attrs: { type: 'button' },
  });
  const name = el(doc, 'span', { className: 'menu-row-name' });
  setText(name, row.label);
  const kids: Node[] = [name];
  // Disabled **and** explained, always. A control that refuses in silence moves an explainable
  // error to the one moment with no words for it.
  const detail = row.enabled ? row.detail : (row.disabledWhy ?? row.detail);
  if (detail !== undefined && detail.length > 0) {
    const help = el(doc, 'span', { className: 'menu-row-detail' });
    setText(help, detail);
    kids.push(help);
  }
  fill(button, ...kids);
  if (!row.enabled) button.setAttribute('disabled', 'disabled');
  button.addEventListener('click', () => {
    host.dispatch(row.intent);
  });
  // A disabled button is not focusable, so it is not in the ring. Putting it there would build a
  // trap whose last member cannot be reached, and Tab would walk straight past it into the shell.
  if (row.enabled) keep(button, row.id);
  return button;
}

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
function guideEntry(doc: Document, guide: MenuGuide, keep: KeepControl): HTMLElement {
  const block = el(doc, 'details', {});

  // Structured exactly as `affordance` builds a navigate row, so the closed entry is visually the
  // seventh member of the list rather than a different kind of thing that happens to sit under it.
  // Kept in the focus ring because `summary` is focusable without a `tabindex`, so a trap that did
  // not know about it would end one control short of where Tab actually goes.
  const summary = keep(el(doc, 'summary', { className: 'menu-row' }), 'guide');
  const name = el(doc, 'span', { className: 'menu-row-name' });
  setText(name, guide.title);
  const lead = el(doc, 'span', { className: 'menu-row-detail' });
  setText(lead, guide.summary);
  fill(summary, name, lead);

  const body = el(doc, 'div', {});
  for (const section of guide.sections) {
    const heading = el(doc, 'p', { className: 'menu-row-name' });
    setText(heading, section.heading);
    body.append(heading);
    for (const paragraph of section.body) {
      const line = el(doc, 'p', { className: 'menu-note' });
      setText(line, paragraph);
      body.append(line);
    }
  }

  fill(block, summary, body);
  return block;
}

function issueList(doc: Document, issues: readonly string[]): HTMLElement {
  const list = el(doc, 'ul', { className: 'menu-issues' });
  for (const issue of issues) {
    const item = el(doc, 'li', {});
    setText(item, issue);
    list.append(item);
  }
  return list;
}

/* -------------------------------------------------------------------------- *
 * Account — the credential form, which is not an affordance
 * -------------------------------------------------------------------------- */

/**
 * Sign in, or create an account.
 *
 * Two things this screen must get right, both about what it does *not* say. The refusal for a wrong
 * password and the refusal for an unknown address are the same sentence, because the server
 * deliberately makes them identical and a client that split them would put the account-enumeration
 * oracle back. And an **unconfirmed** account is shown as playable — the notice says what is still
 * gated rather than presenting the account as broken.
 *
 * **Its fields are in the focus ring, and that is the point of the ring.** Issue #33 names this
 * screen for the reason: *"Account is a form. Tabbing from the Password field is the single most
 * ordinary keyboard action on that screen, and it can drop the player onto controls behind a screen
 * they cannot see."*
 */
function accountForm(
  doc: Document,
  host: MenuPanelHost,
  state: AccountState,
  keep: KeepControl,
): HTMLElement {
  const wrap = el(doc, 'div', { className: 'menu-account' });
  const registering = state.form.mode === 'register';

  const toggle = keep(
    el(doc, 'button', { className: 'menu-account-mode', attrs: { type: 'button' } }),
    'account.mode',
  );
  setText(toggle, registering ? 'I already have an account' : 'Create an account');
  toggle.addEventListener('click', () => {
    host.dispatch({ kind: 'account-mode', register: !registering });
  });
  wrap.append(toggle);

  const field = (label: string, type: 'text' | 'email' | 'password', key: string, value: string): void => {
    wrap.append(
      textRow(doc, label, type, value, keep, `account.${key}`, (next) => {
        host.dispatch({ kind: 'account-form', patch: { [key]: next } });
      }),
    );
  };
  field('Email', 'email', 'email', state.form.email);
  if (registering) field('Display name', 'text', 'displayName', state.form.displayName);
  field('Password', 'password', 'password', state.form.password);

  // Shown, not merely counted. `formIssues` reports all of them at once so a player is not made to
  // guess how many there are — and only once they have typed something, so an untouched form is not
  // a wall of complaints.
  const issues = formIssues(state.form);
  if (issues.length > 0 && state.form.password.length + state.form.email.length > 0) {
    wrap.append(issueList(doc, issues.map((issue) => issue.message)));
  }
  void canSubmitForm;
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
function boardTable(doc: Document, view: LeaderboardView): HTMLElement {
  const wrap = el(doc, 'div', { className: 'menu-leaderboard' });
  if (view.notice !== undefined) wrap.append(noticeLine(doc, view.notice));

  const page = view.page;
  if (page === undefined) return wrap;

  const note = el(doc, 'p', { className: 'menu-note' });
  setText(note, page.note);
  wrap.append(note);

  if (page.entries.length === 0) {
    const empty = el(doc, 'p', {});
    setText(empty, 'Nothing has been posted to this board yet.');
    wrap.append(empty);
    return wrap;
  }

  const table = el(doc, 'ol', { className: 'menu-board' });
  for (const entry of page.entries) {
    const row = el(doc, 'li', { className: 'menu-board-row' });
    const name = el(doc, 'span', { className: 'menu-board-name' });
    setText(name, entry.displayName);
    const figures = el(doc, 'span', { className: 'menu-board-figures' });
    // All four, always. Showing only the ranked one would let a reader infer the others moved with
    // it, which is the claim the note exists to refuse.
    setText(
      figures,
      `AWT ${entry.measured.awtS.toFixed(1)} s \u00b7 WT95 ${entry.measured.wt95S.toFixed(1)} s \u00b7 ` +
        `TTD ${entry.measured.ttdMeanS.toFixed(1)} s \u00b7 over-long ${entry.measured.pctOverLongWait.toFixed(1)} %`,
    );
    const seed = el(doc, 'span', { className: 'menu-board-seed' });
    // Printed because it is what makes the row checkable: invariant 5 says a run replays from its
    // seed, and a leaderboard that hid the seed would be asking to be taken on trust.
    setText(seed, `seed ${entry.run.seed} \u00b7 one run`);
    fill(row, name, figures, seed);
    table.append(row);
  }
  wrap.append(table);
  return wrap;
}

function noticeLine(doc: Document, text: string): HTMLElement {
  const line = el(doc, 'p', { className: 'menu-notice' });
  setText(line, text);
  return line;
}

/* -------------------------------------------------------------------------- *
 * Rows
 * -------------------------------------------------------------------------- */

function selectRow(
  doc: Document,
  label: string,
  value: string,
  options: readonly { readonly id: string; readonly name: string; readonly detail?: string | undefined }[],
  keep: KeepControl,
  key: string,
  onChange: (id: string) => void,
): HTMLElement {
  const row = el(doc, 'label', { className: 'menu-select' });
  const text = el(doc, 'span', {});
  setText(text, label);
  const select = keep(el(doc, 'select', {}), key);
  for (const option of options) {
    const node = el(doc, 'option', { attrs: { value: option.id } });
    setText(node, option.detail === undefined ? option.name : `${option.name} — ${option.detail}`);
    if (option.id === value) node.setAttribute('selected', 'selected');
    select.append(node);
  }
  select.addEventListener('change', () => {
    onChange((select as HTMLSelectElement).value);
  });
  fill(row, text, select);
  return row;
}


/**
 * A labelled text input.
 *
 * `type` is a parameter so the password field is a real `password` input — a browser that shows a
 * passphrase in clear text on a shared screen is the one failure this screen can cause on its own.
 * The value is set as a property and not an attribute, so re-rendering does not blow away what the
 * player is mid-way through typing.
 */
function textRow(
  doc: Document,
  label: string,
  type: 'text' | 'email' | 'password',
  value: string,
  keep: KeepControl,
  key: string,
  onChange: (value: string) => void,
): HTMLElement {
  const row = el(doc, 'label', { className: 'menu-text' });
  const text = el(doc, 'span', {});
  setText(text, label);
  const input = keep(el(doc, 'input', { attrs: { type } }), key) as HTMLInputElement;
  input.value = value;
  input.addEventListener('change', () => {
    onChange(input.value);
  });
  fill(row, text, input);
  return row;
}

function toggleRow(
  doc: Document,
  label: string,
  value: boolean,
  keep: KeepControl,
  key: string,
  onChange: (value: boolean) => void,
): HTMLElement {
  const row = el(doc, 'label', { className: 'menu-toggle' });
  const text = el(doc, 'span', {});
  setText(text, label);
  const input = keep(el(doc, 'input', { attrs: { type: 'checkbox' } }), key);
  if (value) input.setAttribute('checked', 'checked');
  input.addEventListener('change', () => {
    onChange((input as HTMLInputElement).checked);
  });
  fill(row, text, input);
  return row;
}
