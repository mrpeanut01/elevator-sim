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
import {
  canSubmitForm,
  formIssues,
  postingRefusal,
  type AccountForm,
  type AccountState,
} from '../menu/account.js';
import type { BoardPage } from '../menu/client.js';
import {
  FREE_PLAY_RATES,
  back,
  canStart,
  freePlayIssues,
  navigate,
  updateFreePlay,
  updateSettings,
} from '../menu/menu.js';
import {
  FREE_PLAY_DURATIONS_S,
  PLAYBACK_SPEEDS,
  type FreePlaySelection,
  type MenuCatalogue,
  type MenuScreen,
  type MenuState,
  type Settings,
} from '../menu/types.js';

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
  update(next: MenuState): void;
  /** Called when the player commits a Free Play selection that {@link canStart} accepts. */
  start(selection: FreePlaySelection): void;
  /** Called when the player picks Campaign. The campaign surface owns everything after that. */
  openCampaign(): void;
  /* ------------------------------------------------------------- accounts */
  account(): AccountState;
  updateAccountForm(patch: Partial<AccountForm>): void;
  /** Sign in or register, according to the form's own mode. The host owns the request. */
  submitAccountForm(): void;
  signOut(): void;
  /* ---------------------------------------------------------- leaderboard */
  leaderboard(): LeaderboardView;
  openBoard(configHash: string): void;
}

/* -------------------------------------------------------------------------- *
 * Rendering
 * -------------------------------------------------------------------------- */

/** Draw the current screen into `host`. Called on every state change; cheap enough to do so. */
export function renderMenu(root: HTMLElement, host: MenuPanelHost): void {
  const state = host.state();
  const doc = host.doc;
  const screen = state.screen;

  const heading = el(doc, 'h1', { className: 'menu-title' });
  setText(heading, titleOf(screen));

  const body =
    screen === 'main'
      ? mainScreen(doc, host)
      : screen === 'free-play'
        ? freePlayScreen(doc, host)
        : screen === 'settings'
          ? settingsScreen(doc, host)
          : screen === 'account'
            ? accountScreen(doc, host)
            : screen === 'leaderboard'
              ? leaderboardScreen(doc, host)
              : placeholderScreen(doc, screen);

  const children: Node[] = [heading, body];
  if (screen !== 'main') children.push(backButton(doc, host));
  fill(root, ...children);
}

function titleOf(screen: MenuScreen): string {
  switch (screen) {
    case 'main':
      return 'Elevator Sim';
    case 'campaign':
      return 'Campaign';
    case 'free-play':
      return 'Free play';
    case 'settings':
      return 'Settings';
    case 'leaderboard':
      return 'Leaderboard';
    case 'account':
      return 'Account';
  }
}

function backButton(doc: Document, host: MenuPanelHost): HTMLElement {
  const button = el(doc, 'button', { className: 'menu-back', attrs: { type: 'button' } });
  setText(button, 'Back');
  button.addEventListener('click', () => {
    host.update(back(host.state()));
  });
  return button;
}

/* -------------------------------------------------------------------------- *
 * The screens
 * -------------------------------------------------------------------------- */

/** The root: one row per destination, in the order a new player should meet them. */
function mainScreen(doc: Document, host: MenuPanelHost): HTMLElement {
  const list = el(doc, 'div', { className: 'menu-list' });
  const rows: readonly (readonly [string, string, () => void])[] = [
    [
      'Campaign',
      'The scenarios in order, each teaching one thing',
      () => {
        host.openCampaign();
        host.update(navigate(host.state(), 'campaign'));
      },
    ],
    [
      'Free play',
      'Any building, any dispatcher, any traffic',
      () => {
        host.update(navigate(host.state(), 'free-play'));
      },
    ],
    [
      'Leaderboard',
      'Verified scores, by configuration',
      () => {
        host.update(navigate(host.state(), 'leaderboard'));
      },
    ],
    [
      'Account',
      'Sign in to post a score',
      () => {
        host.update(navigate(host.state(), 'account'));
      },
    ],
    [
      'Settings',
      'Presentation only — nothing here changes a run',
      () => {
        host.update(navigate(host.state(), 'settings'));
      },
    ],
  ];

  for (const [label, detail, onClick] of rows) {
    const button = el(doc, 'button', { className: 'menu-row', attrs: { type: 'button' } });
    const name = el(doc, 'span', { className: 'menu-row-name' });
    setText(name, label);
    const help = el(doc, 'span', { className: 'menu-row-detail' });
    setText(help, detail);
    fill(button, name, help);
    button.addEventListener('click', onClick);
    list.append(button);
  }
  return list;
}

/** Free play: one select per axis, the issues, and a Start that refuses a broken selection. */
function freePlayScreen(doc: Document, host: MenuPanelHost): HTMLElement {
  const state = host.state();
  const selection = state.freePlay;
  const wrap = el(doc, 'div', { className: 'menu-freeplay' });

  wrap.append(
    selectRow(doc, 'Building', selection.buildingId, host.catalogue.buildings, (id) => {
      host.update(updateFreePlay(host.state(), { buildingId: id }));
    }),
    selectRow(doc, 'Dispatcher', selection.dispatcherProfileId, host.catalogue.dispatchers, (id) => {
      host.update(updateFreePlay(host.state(), { dispatcherProfileId: id }));
    }),
    selectRow(doc, 'Traffic shape', selection.demandTemplateId, host.catalogue.demandTemplates, (id) => {
      host.update(updateFreePlay(host.state(), { demandTemplateId: id }));
    }),
    // `null` is the building's own profile and is offered first: it is a real selection, not an
    // absent one, and resolving it here would pin a rate `data/` is free to change.
    selectRow(
      doc,
      'Arrival rate',
      String(selection.arrivalRatePctPop5min),
      FREE_PLAY_RATES.map((rate) => ({
        id: String(rate),
        name: rate === null ? 'This building’s own profile' : `${String(rate)} % of population / 5 min`,
      })),
      (value) => {
        host.update(
          updateFreePlay(host.state(), {
            arrivalRatePctPop5min: value === 'null' ? null : Number(value),
          }),
        );
      },
    ),
    selectRow(
      doc,
      'Run length',
      String(selection.durationS),
      FREE_PLAY_DURATIONS_S.map((seconds) => ({
        id: String(seconds),
        name: `${String(Math.round(seconds / 60))} minutes`,
      })),
      (value) => {
        host.update(updateFreePlay(host.state(), { durationS: Number(value) }));
      },
    ),
    seedRow(doc, host),
  );

  const issues = freePlayIssues(selection, host.catalogue);
  if (issues.length > 0) {
    const list = el(doc, 'ul', { className: 'menu-issues' });
    for (const issue of issues) {
      const item = el(doc, 'li', {});
      setText(item, issue.message);
      list.append(item);
    }
    wrap.append(list);
  }

  const start = el(doc, 'button', { className: 'menu-start', attrs: { type: 'button' } });
  setText(start, 'Start');
  const ready = canStart(selection, host.catalogue);
  // Disabled AND explained. A Start that fails silently moves an explainable error somewhere with
  // no words for it.
  if (!ready) start.setAttribute('disabled', 'disabled');
  start.addEventListener('click', () => {
    if (canStart(host.state().freePlay, host.catalogue)) host.start(host.state().freePlay);
  });
  wrap.append(start);

  return wrap;
}

/** Settings. Every control here is presentation; none of them may change a run (§ D214 § 2). */
function settingsScreen(doc: Document, host: MenuPanelHost): HTMLElement {
  const wrap = el(doc, 'div', { className: 'menu-settings' });
  const settings = host.state().settings;

  wrap.append(
    toggleRow(doc, 'Reduce motion', settings.reduceMotion, (value) => {
      host.update(updateSettings(host.state(), { reduceMotion: value }));
    }),
    toggleRow(doc, 'Show the energy axis', settings.showEnergyAxis, (value) => {
      host.update(updateSettings(host.state(), { showEnergyAxis: value }));
    }),
    selectRow(
      doc,
      'Playback speed',
      String(settings.playbackSpeed),
      PLAYBACK_SPEEDS.map((speed) => ({ id: String(speed), name: `${String(speed)}×` })),
      (value) => {
        host.update(updateSettings(host.state(), { playbackSpeed: Number(value) }));
      },
    ),
    selectRow(
      doc,
      'Theme',
      settings.theme,
      (['system', 'dark', 'light'] as const).map((id) => ({ id, name: id })),
      (value) => {
        host.update(updateSettings(host.state(), { theme: value as Settings['theme'] }));
      },
    ),
  );

  // Said on the surface, not only in a docstring: a player choosing a setting should know it cannot
  // move their score, and § D214 § 2 is why nothing here is allowed to.
  const note = el(doc, 'p', { className: 'menu-note' });
  setText(
    note,
    'These change how the simulation is drawn, never what it computes — so they cannot move a ' +
      'score or make two runs incomparable.',
  );
  wrap.append(note);
  return wrap;
}

/* -------------------------------------------------------------------------- *
 * Account
 * -------------------------------------------------------------------------- */

/**
 * Sign in, or create an account.
 *
 * Two things this screen must get right, both of which are about what it does *not* say. The
 * refusal for a wrong password and the refusal for an unknown address are the same sentence,
 * because the server deliberately makes them identical and a client that split them would put the
 * account-enumeration oracle back. And an **unconfirmed** account is shown as playable — the notice
 * says what is still gated rather than presenting the account as broken.
 */
function accountScreen(doc: Document, host: MenuPanelHost): HTMLElement {
  const wrap = el(doc, 'div', { className: 'menu-account' });
  const state = host.account();

  if (state.user !== undefined) {
    const who = el(doc, 'p', { className: 'menu-account-who' });
    setText(who, `Signed in as ${state.user.displayName}.`);
    wrap.append(who);

    const refusal = postingRefusal(state);
    if (refusal !== undefined) {
      const note = el(doc, 'p', { className: 'menu-note' });
      setText(note, refusal);
      wrap.append(note);
    }
    const out = el(doc, 'button', { className: 'menu-signout', attrs: { type: 'button' } });
    setText(out, 'Sign out');
    out.addEventListener('click', () => {
      host.signOut();
    });
    wrap.append(out);
    if (state.notice !== undefined) wrap.append(noticeLine(doc, state.notice));
    return wrap;
  }

  const registering = state.form.mode === 'register';
  const toggle = el(doc, 'button', { className: 'menu-account-mode', attrs: { type: 'button' } });
  setText(toggle, registering ? 'I already have an account' : 'Create an account');
  toggle.addEventListener('click', () => {
    host.updateAccountForm({ mode: registering ? 'sign-in' : 'register' });
  });
  wrap.append(toggle);

  wrap.append(
    textRow(doc, 'Email', 'email', state.form.email, (value) => {
      host.updateAccountForm({ email: value });
    }),
  );
  if (registering) {
    wrap.append(
      textRow(doc, 'Display name', 'text', state.form.displayName, (value) => {
        host.updateAccountForm({ displayName: value });
      }),
    );
  }
  wrap.append(
    textRow(doc, 'Password', 'password', state.form.password, (value) => {
      host.updateAccountForm({ password: value });
    }),
  );

  // Shown, not merely counted. `formIssues` reports all of them at once so a player is not made to
  // guess how many there are.
  const issues = formIssues(state.form);
  if (issues.length > 0 && state.form.password.length + state.form.email.length > 0) {
    const list = el(doc, 'ul', { className: 'menu-issues' });
    for (const issue of issues) {
      const item = el(doc, 'li', {});
      setText(item, issue.message);
      list.append(item);
    }
    wrap.append(list);
  }

  const submit = el(doc, 'button', { className: 'menu-account-submit', attrs: { type: 'button' } });
  setText(submit, registering ? 'Create account' : 'Sign in');
  if (!canSubmitForm(state)) submit.setAttribute('disabled', 'disabled');
  submit.addEventListener('click', () => {
    host.submitAccountForm();
  });
  wrap.append(submit);

  if (state.notice !== undefined) wrap.append(noticeLine(doc, state.notice));
  return wrap;
}

/* -------------------------------------------------------------------------- *
 * Leaderboard
 * -------------------------------------------------------------------------- */

/**
 * The boards, and one board's rows.
 *
 * Two rules from elsewhere in the project land on this screen and neither is negotiable. **The
 * server's own note about the ranking is printed verbatim** — § D106's *energy is an axis, never a
 * score*, generalised: one metric orders the rows and the others sit beside it, never combined.
 * And a board with nothing in it says so in words, rather than drawing an empty table that reads
 * like a failure.
 */
function leaderboardScreen(doc: Document, host: MenuPanelHost): HTMLElement {
  const wrap = el(doc, 'div', { className: 'menu-leaderboard' });
  const view = host.leaderboard();

  if (view.notice !== undefined) wrap.append(noticeLine(doc, view.notice));

  if (view.boards.length > 0) {
    wrap.append(
      selectRow(
        doc,
        'Board',
        view.selected ?? '',
        view.boards.map((board) => ({
          id: board.configHash,
          // The hash is shortened for the eye and never for the request: `openBoard` gets the whole
          // one, because a truncated board id is a board id that matches the wrong board.
          name: `${board.configHash.slice(0, 8)}…`,
          detail: `${String(board.entries)} ${board.entries === 1 ? 'entry' : 'entries'}`,
        })),
        (configHash) => {
          host.openBoard(configHash);
        },
      ),
    );
  }

  const page = view.page;
  if (page !== undefined) {
    const note = el(doc, 'p', { className: 'menu-note' });
    setText(note, page.note);
    wrap.append(note);

    if (page.entries.length === 0) {
      const empty = el(doc, 'p', {});
      setText(empty, 'Nothing has been posted to this board yet.');
      wrap.append(empty);
    } else {
      const table = el(doc, 'ol', { className: 'menu-board' });
      for (const entry of page.entries) {
        const row = el(doc, 'li', { className: 'menu-board-row' });
        const name = el(doc, 'span', { className: 'menu-board-name' });
        setText(name, entry.displayName);
        const figures = el(doc, 'span', { className: 'menu-board-figures' });
        // All four, always. Showing only the ranked one would let a reader infer the others moved
        // with it, which is the claim the note exists to refuse.
        setText(
          figures,
          `AWT ${entry.measured.awtS.toFixed(1)} s · WT95 ${entry.measured.wt95S.toFixed(1)} s · ` +
            `TTD ${entry.measured.ttdMeanS.toFixed(1)} s · over-long ${entry.measured.pctOverLongWait.toFixed(1)} %`,
        );
        const seed = el(doc, 'span', { className: 'menu-board-seed' });
        // Printed because it is what makes the row checkable: invariant 5 says a run replays from
        // its seed, and a leaderboard that hid the seed would be asking to be taken on trust.
        setText(seed, `seed ${entry.run.seed}`);
        fill(row, name, figures, seed);
        table.append(row);
      }
      wrap.append(table);
    }
  }

  return wrap;
}

function noticeLine(doc: Document, text: string): HTMLElement {
  const line = el(doc, 'p', { className: 'menu-notice' });
  setText(line, text);
  return line;
}

/** A screen whose surface has not landed yet, said plainly rather than drawn as though it had. */
function placeholderScreen(doc: Document, screen: MenuScreen): HTMLElement {
  const wrap = el(doc, 'div', { className: 'menu-placeholder' });
  const text = el(doc, 'p', {});
  setText(
    text,
    screen === 'campaign'
      ? 'The campaign surface is open behind this menu.'
      : 'This screen is not built yet. Nothing here is a placeholder for a number — it is empty ' +
          'because the surface has not landed.',
  );
  fill(wrap, text);
  return wrap;
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

function seedRow(doc: Document, host: MenuPanelHost): HTMLElement {
  const row = el(doc, 'label', { className: 'menu-seed' });
  const text = el(doc, 'span', {});
  setText(text, 'Seed');
  const input = el(doc, 'input', {
    attrs: { type: 'text', inputmode: 'numeric', value: host.state().freePlay.seed },
  });
  input.addEventListener('change', () => {
    host.update(updateFreePlay(host.state(), { seed: (input as HTMLInputElement).value }));
  });
  fill(row, text, input);
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
