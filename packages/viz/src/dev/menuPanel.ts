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
