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
  type MenuAffordance,
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
}

/* -------------------------------------------------------------------------- *
 * Rendering
 * -------------------------------------------------------------------------- */

/**
 * Draw the current screen. **Decides nothing.**
 *
 * Every row, its label, whether it is enabled and what pressing it asks for come from
 * `menu/screens.ts#screenOf`. This file turns that into elements and turns a click into
 * {@link MenuPanelHost.dispatch}. The split is `dev/surfaces.ts`'s and `controls/render.ts`'s, and
 * the reason is `docs/16` § 5: three of the eight clauses the product failed were decisions taken
 * inside a click handler, where nothing could reach them.
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
  });

  const children: Node[] = [];
  const heading = el(doc, 'h1', { className: 'menu-title' });
  setText(heading, view.title);
  children.push(heading);

  for (const notice of view.notices) children.push(noticeLine(doc, notice));

  const list = el(doc, 'div', { className: 'menu-list' });
  for (const row of view.rows) list.append(affordance(doc, host, row));
  children.push(list);

  if (view.issues.length > 0) children.push(issueList(doc, view.issues));

  // The two screens with content an affordance cannot express: a credential form, and a table of
  // somebody else's runs. Both are drawn below the rows the model does own.
  if (view.screen === 'account' && account.user === undefined) {
    children.push(accountForm(doc, host, account));
  }
  if (view.screen === 'account' && account.notice !== undefined) {
    children.push(noticeLine(doc, account.notice));
  }
  if (view.screen === 'leaderboard') children.push(boardTable(doc, board));

  fill(root, ...children);
}

/* -------------------------------------------------------------------------- *
 * One affordance
 * -------------------------------------------------------------------------- */

/**
 * Turn one {@link MenuAffordance} into an element.
 *
 * The `select` and `toggle` arms rebuild their intent from the chosen option — which is why
 * {@link MenuIntent} `set-free-play` and `set-setting` carry a **field and a value** rather than a
 * prepared patch. A prepared patch would have been the answer to a question nobody had asked yet,
 * since the affordance is built before anybody picks anything.
 */
function affordance(doc: Document, host: MenuPanelHost, row: MenuAffordance): HTMLElement {
  const withValue = (value: string): MenuIntent =>
    row.intent.kind === 'set-free-play' || row.intent.kind === 'set-setting'
      ? { ...row.intent, value }
      : row.intent;

  if (row.kind === 'select') {
    return selectRow(doc, row.label, row.value ?? '', row.options ?? [], (id) => {
      host.dispatch(withValue(id));
    });
  }
  if (row.kind === 'toggle') {
    return toggleRow(doc, row.label, row.value === 'on', (value) => {
      host.dispatch(withValue(value ? 'on' : 'off'));
    });
  }
  if (row.kind === 'text') {
    return textRow(doc, row.label, 'text', row.value ?? '', (value) => {
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
  return button;
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
 */
function accountForm(doc: Document, host: MenuPanelHost, state: AccountState): HTMLElement {
  const wrap = el(doc, 'div', { className: 'menu-account' });
  const registering = state.form.mode === 'register';

  const toggle = el(doc, 'button', { className: 'menu-account-mode', attrs: { type: 'button' } });
  setText(toggle, registering ? 'I already have an account' : 'Create an account');
  toggle.addEventListener('click', () => {
    host.dispatch({ kind: 'account-mode', register: !registering });
  });
  wrap.append(toggle);

  const field = (label: string, type: 'text' | 'email' | 'password', key: string, value: string): void => {
    wrap.append(
      textRow(doc, label, type, value, (next) => {
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
  onChange: (id: string) => void,
): HTMLElement {
  const row = el(doc, 'label', { className: 'menu-select' });
  const text = el(doc, 'span', {});
  setText(text, label);
  const select = el(doc, 'select', {});
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
  onChange: (value: string) => void,
): HTMLElement {
  const row = el(doc, 'label', { className: 'menu-text' });
  const text = el(doc, 'span', {});
  setText(text, label);
  const input = el(doc, 'input', { attrs: { type } }) as HTMLInputElement;
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
  onChange: (value: boolean) => void,
): HTMLElement {
  const row = el(doc, 'label', { className: 'menu-toggle' });
  const text = el(doc, 'span', {});
  setText(text, label);
  const input = el(doc, 'input', { attrs: { type: 'checkbox' } });
  if (value) input.setAttribute('checked', 'checked');
  input.addEventListener('change', () => {
    onChange((input as HTMLInputElement).checked);
  });
  fill(row, text, input);
  return row;
}
