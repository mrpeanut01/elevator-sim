/**
 * **The Everyday settings screen** — GAMEPLAY § 15.1, the DOM half. Every word and every decision
 * is `settingsView.ts`'s (which is where the shipped-versus-refused roster and its grep evidence
 * live); this file draws that view with `tokens.ts`'s § 19 values and wires three controls:
 *
 * - the **display name** field, committed per keystroke when `menu/account.ts`'s rule takes the
 *   string and refused in that rule's own sentence beside the field when it does not;
 * - the six **avatar swatches**;
 * - the **Motion** pill, which reads and writes the Engineer's own switch through
 *   `engineerBridge.ts` — never a second value;
 * - the **Units** pill, which reads and writes this device's own preference through
 *   `profileStore.ts` — a value the Engineer surface does not hold, so there is nothing to bridge
 *   to (GitHub issue #170, [§ D448](../../../../DECISIONS.md)). Its write returns the same
 *   durability answer the name and colour do, and it is fed into the same notice, because a device
 *   that will not keep a name will not keep a preference either and the player is owed one
 *   sentence about both rather than two.
 *
 * The name and colour land in `profileStore.ts`'s one store, which is how the rail's `PLAYING AS`
 * card updates without a reload (§ 20.15): the shell subscribes to the same store this screen
 * writes. Nothing here reaches into the shell, and nothing here draws a footer (§ 3.1).
 *
 * Layout, spacing and hex values follow the prototype's `isSettings` region; where the prototype
 * uses a value § 19's scales do not carry (the 11 px row radius, the ochre figure colour) the
 * prototype literal is kept with a note, `tokens.ts`'s own convention for prototype-sourced
 * values.
 *
 * ## The fourth region, which is not the prototype's
 *
 * {@link buildNotesPanel} — the **build-information panel**, closed by default, carrying every
 * register of what this build does not do yet. GitHub issue #207 moved six registers off six
 * player screens and this is where they landed, because this is the screen a person opens when
 * they want to know how the thing is put together. Its words are `everyday/buildNotes.ts`'s and
 * none of them is authored here.
 *
 * This screen used to draw one of those six, its own, in a block of its own. That block is gone:
 * `SETTINGS_ABSENCES` is a section of the panel now, so the six rows this screen does not draw are
 * read in the same place as the twenty-one the rest of the build does not.
 */

import { buildNotesSummaryOf, buildNotesViewOf } from './buildNotes.js';
import { engineerSettings, onEngineerSettingsProvided } from './engineerBridge.js';
import { DEFAULT_EVERYDAY_PROFILE } from './profile.js';
import { everydayProfileStore } from './profileStore.js';
import type { EverydayScreenContext, EverydayScreenHandle, EverydayScreenModule } from './screens.js';
import { settingsScreenViewOf, type SettingsScreenView } from './settingsView.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';

/** The prototype's settings-row radius — not on § 19's scale, kept as its literal. */
const ROW_RADIUS_PX = 11;

/** The prototype's mono figure colour on the *This device* rows — § 19 lists it only as a shaft tint. */
const FACT_FIGURE_COLOR = '#8D6A2F';

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * **The build-information panel** — every register of what this build does not do yet, drawn once.
 *
 * GitHub issue #207: those registers used to be drawn on six player screens, the longest of them
 * under the front door's four mode tiles, so the first substantial block of text a new player met
 * was a list of what was missing. They are all here now, behind a closed disclosure, on the screen
 * a person opens when they want to know how the thing is set up.
 *
 * **Closed by default and never hidden.** A `<details>` is a control a player can leave shut, and
 * a register nobody opens is still a register a curious reader can find — which is the whole
 * distinction between moving these words and deleting them. The summary carries the count so the
 * row says how much is behind it before it is opened.
 *
 * The words are `everyday/buildNotes.ts`'s, and every one of them is swept by the honesty search
 * on every case of every run: nothing here may name a section of a design document, a source file
 * or an identifier.
 */
function buildNotesPanel(doc: Document): HTMLElement {
  const notes = buildNotesViewOf();
  const panel = el(doc, 'details', 'everyday-settings-build-notes');
  panel.style.cssText = `margin-top:26px;border:1px solid ${C.rule};border-radius:${String(ROW_RADIUS_PX)}px;background:${C.cardSunk};padding:13px 16px`;
  const summary = doc.createElement('summary');
  summary.className = 'everyday-settings-build-notes-summary';
  summary.textContent = buildNotesSummaryOf(notes);
  summary.style.cssText = 'cursor:pointer;font-size:13px;font-weight:600;list-style:revert';
  panel.append(summary);

  const lede = el(doc, 'p', 'everyday-settings-build-notes-lede', notes.lede);
  lede.style.cssText = `margin:10px 0 0;font-size:12.5px;line-height:1.5;color:${C.warmGrey};max-width:74ch`;
  panel.append(lede);

  for (const section of notes.sections) {
    const block = el(doc, 'section', 'everyday-settings-build-notes-section');
    block.style.cssText = 'margin-top:18px';
    const heading = el(doc, 'h3', undefined, section.heading);
    heading.style.cssText = `${EYEBROW};font-size:11px;margin:0 0 4px`;
    const note = el(doc, 'p', undefined, section.note);
    note.style.cssText = `margin:0 0 6px;font-size:12px;color:${C.warmGrey}`;
    const list = el(doc, 'ul');
    list.style.cssText = `margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;font-size:12px;line-height:1.5;color:${C.warmGrey};max-width:80ch`;
    for (const entry of section.entries) list.append(el(doc, 'li', undefined, entry));
    block.append(heading, note, list);
    panel.append(block);
  }
  return panel;
}

function mount(host: HTMLElement, _context: EverydayScreenContext): EverydayScreenHandle {
  const doc = host.ownerDocument;
  const store = everydayProfileStore();

  /** The field's uncommitted text — `undefined` while the field simply shows the stored name. */
  let draftName: string | undefined;
  /** The last `set()`'s answer, for the honest sentence about a store that keeps nothing. */
  let durable: boolean | undefined;

  const viewNow = (): SettingsScreenView =>
    settingsScreenViewOf({
      profile: store.current(),
      draftName,
      durable,
      reduceMotion: engineerSettings()?.reduceMotion(),
      units: store.units(),
    });

  let view = viewNow();

  const root = el(doc, 'div', 'everyday-settings');
  root.style.cssText = 'max-width:760px';

  /* ---- header ---- */
  const eyebrow = el(doc, 'div', undefined, view.eyebrow);
  eyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.16em;color:${C.label}`;
  const title = el(doc, 'h1', undefined, view.title);
  title.style.cssText = `font-family:${TYPE.heading};font-size:34px;font-weight:700;letter-spacing:-.02em;margin:10px 0 0`;
  const lede = el(doc, 'p', undefined, view.lede);
  lede.style.cssText = `font-size:16.5px;line-height:1.55;color:${C.inkSoft};margin:12px 0 0;max-width:62ch;text-wrap:pretty`;
  root.append(eyebrow, title, lede);

  /* ---- YOU (§ 15.1's first section) ---- */
  const youHeading = el(doc, 'div', undefined, view.you.heading);
  youHeading.style.cssText = `${EYEBROW};margin:28px 0 10px`;
  const youCard = el(doc, 'div', 'everyday-settings-you');
  youCard.style.cssText = `border:1px solid ${C.rule};border-radius:${String(R.card)}px;background:${C.card};padding:18px 20px`;

  const identityRow = el(doc, 'div');
  identityRow.style.cssText = 'display:flex;align-items:center;gap:16px;flex-wrap:wrap';

  const disc = el(doc, 'span', 'everyday-settings-avatar', view.you.initial);
  const discStyle = (color: string): string =>
    [
      'width:56px',
      'height:56px',
      'border-radius:50%',
      `background:${color}`,
      `color:${C.ink}`,
      'display:flex',
      'align-items:center',
      'justify-content:center',
      `font:700 24px ${TYPE.heading}`,
      'flex:none',
    ].join(';');
  disc.style.cssText = discStyle(view.you.avatarColor);

  const nameBlock = el(doc, 'div');
  nameBlock.style.cssText = 'min-width:220px;flex:1 1 240px';
  const nameLabel = el(doc, 'label', undefined, view.you.nameLabel);
  nameLabel.htmlFor = 'everyday-display-name';
  nameLabel.style.cssText = `display:block;font:500 10px ${TYPE.mono};letter-spacing:.12em;color:${C.label};margin-bottom:5px`;
  const nameInput = el(doc, 'input', 'everyday-settings-name');
  nameInput.id = 'everyday-display-name';
  nameInput.type = 'text';
  nameInput.value = view.you.nameValue;
  nameInput.style.cssText = [
    'width:100%',
    'box-sizing:border-box',
    `border:1.5px solid ${C.rule}`,
    `border-radius:${String(R.row)}px`,
    `background:${C.paper}`,
    'padding:10px 12px',
    `font-family:${TYPE.body}`,
    'font-size:14.5px',
    `color:${C.ink}`,
  ].join(';');
  /*
   * § 15.1's refusal, beside the field it refuses — `menu/account.ts`'s sentence, present exactly
   * while the field's text would be refused, and never blocking the keystroke itself.
   */
  const issue = el(doc, 'div', 'everyday-settings-issue');
  issue.style.cssText = `font-size:12px;color:${C.alarm};margin-top:6px`;
  nameBlock.append(nameLabel, nameInput, issue);

  const pictureBlock = el(doc, 'div');
  pictureBlock.style.cssText = 'flex:none';
  const pictureLabel = el(doc, 'div', undefined, view.you.pictureLabel);
  pictureLabel.style.cssText = `font:500 10px ${TYPE.mono};letter-spacing:.12em;color:${C.label};margin-bottom:6px`;
  const swatchRow = el(doc, 'div');
  swatchRow.style.cssText = 'display:flex;gap:7px';
  const swatchStyle = (color: string, selected: boolean): string =>
    [
      'width:28px',
      'height:28px',
      'border-radius:50%',
      'cursor:pointer',
      `background:${color}`,
      `border:2px solid ${selected ? C.ink : 'transparent'}`,
      'padding:0',
    ].join(';');
  const swatchButtons = view.you.swatches.map((swatch) => {
    const button = el(doc, 'button', 'everyday-settings-swatch');
    button.type = 'button';
    button.dataset['color'] = swatch.color;
    button.setAttribute('aria-label', swatch.id);
    button.style.cssText = swatchStyle(swatch.color, swatch.selected);
    button.addEventListener('click', () => {
      const committed = store.current() ?? DEFAULT_EVERYDAY_PROFILE;
      durable = store.set({ name: committed.name, avatarColor: swatch.color });
      redrawIdentity();
    });
    swatchRow.append(button);
    return button;
  });
  pictureBlock.append(pictureLabel, swatchRow);
  identityRow.append(disc, nameBlock, pictureBlock);

  const nameNote = el(doc, 'div', undefined, view.you.note);
  nameNote.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.5;margin-top:14px;max-width:70ch`;

  const homeBlock = el(doc, 'div');
  homeBlock.style.cssText = `margin-top:14px;padding-top:14px;border-top:1px solid ${C.ruleLight}`;
  const home = el(doc, 'div', 'everyday-settings-home', view.you.home);
  home.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.5;max-width:70ch`;
  const saveNotice = el(doc, 'div', 'everyday-settings-save-notice');
  saveNotice.style.cssText = `font-size:12px;color:${C.terracotta};margin-top:6px`;
  homeBlock.append(home, saveNotice);

  youCard.append(identityRow, nameNote, homeBlock);
  root.append(youHeading, youCard);

  /* ---- PLAYING ---- */
  const playingHeading = el(doc, 'div', undefined, view.playing.heading);
  playingHeading.style.cssText = `${EYEBROW};margin:26px 0 10px`;
  const playingRegion = el(doc, 'div', 'everyday-settings-playing');
  playingRegion.style.cssText = 'display:grid;gap:9px';
  root.append(playingHeading, playingRegion);

  /* ---- THIS DEVICE — statements of fact, never controls ---- */
  const deviceHeading = el(doc, 'div', undefined, view.device.heading);
  deviceHeading.style.cssText = `${EYEBROW};margin:26px 0 10px`;
  const deviceRegion = el(doc, 'div', 'everyday-settings-device');
  deviceRegion.style.cssText = 'display:grid;gap:9px';
  for (const fact of view.device.facts) {
    const row = el(doc, 'div', 'everyday-settings-fact');
    row.style.cssText = [
      'display:flex',
      'align-items:baseline',
      'gap:14px',
      'padding:13px 16px',
      `border:1px solid ${C.rule}`,
      `border-radius:${String(ROW_RADIUS_PX)}px`,
      `background:${C.cardSunk}`,
    ].join(';');
    const text = el(doc, 'div');
    text.style.cssText = 'min-width:0';
    const label = el(doc, 'div', undefined, fact.label);
    label.style.cssText = 'font-size:14px;font-weight:600';
    const note = el(doc, 'div', undefined, fact.note);
    note.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.45;margin-top:2px;max-width:64ch`;
    text.append(label, note);
    const value = el(doc, 'span', undefined, fact.value);
    value.style.cssText = `margin-left:auto;flex:none;font:500 12px ${TYPE.mono};color:${FACT_FIGURE_COLOR}`;
    row.append(text, value);
    deviceRegion.append(row);
  }
  root.append(deviceHeading, deviceRegion);

  /* ---- the build-information panel — all six registers, folded away ---- */
  root.append(buildNotesPanel(doc));

  /* ---------------------------------------------------------------- *
   * The updates — targeted, so a keystroke never rebuilds the input
   * that carries the caret.
   * ---------------------------------------------------------------- */

  function redrawIdentity(): void {
    view = viewNow();
    disc.textContent = view.you.initial;
    disc.style.cssText = discStyle(view.you.avatarColor);
    issue.textContent = view.you.nameIssue ?? '';
    issue.hidden = view.you.nameIssue === undefined;
    saveNotice.textContent = view.you.saveNotice ?? '';
    saveNotice.hidden = view.you.saveNotice === undefined;
    for (const [index, button] of swatchButtons.entries()) {
      const swatch = view.you.swatches[index];
      if (swatch !== undefined) button.style.cssText = swatchStyle(swatch.color, swatch.selected);
    }
  }

  /**
   * The Motion row, or its honest stand-in — rebuilt whole because its existence is the thing
   * that changes: the bridge arrives once (`onEngineerSettingsProvided`) and the pill flips.
   */
  function redrawPlaying(): void {
    view = viewNow();
    playingRegion.replaceChildren();
    if (view.playing.absentNote !== undefined) {
      const waiting = el(doc, 'div', 'everyday-settings-motion-absent', view.playing.absentNote);
      waiting.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.5;max-width:64ch`;
      playingRegion.append(waiting);
      return;
    }
    for (const rowView of view.playing.rows) {
      const row = el(doc, 'div', 'everyday-settings-toggle');
      row.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:12px',
        'padding:13px 16px',
        `border:1px solid ${C.rule}`,
        `border-radius:${String(ROW_RADIUS_PX)}px`,
        `background:${C.card}`,
      ].join(';');
      const text = el(doc, 'div');
      text.style.cssText = 'min-width:0';
      const label = el(doc, 'div', undefined, rowView.label);
      label.style.cssText = 'font-size:14px;font-weight:600';
      const note = el(doc, 'div', undefined, rowView.note);
      note.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.45;margin-top:1px`;
      text.append(label, note);
      const pill = el(doc, 'button', `everyday-settings-${rowView.id}`, rowView.value);
      pill.type = 'button';
      pill.style.cssText = [
        'margin-left:auto',
        'flex:none',
        'cursor:pointer',
        `border:1.5px solid ${rowView.on ? C.sun : C.rule}`,
        `background:${rowView.on ? C.sun : C.cardSunk}`,
        `color:${rowView.on ? C.ink : C.warmGrey}`,
        `border-radius:${String(R.pill)}px`,
        'padding:7px 15px',
        `font:500 12px ${TYPE.mono}`,
      ].join(';');
      /*
       * **One press handler, branching on the row rather than one handler per row.** The two rows
       * write to different places for a reason the view's docstring gives — Motion has no value of
       * its own and Units does — and the branch is here rather than in the view because a view that
       * carried a callback would stop being pure, which is what makes every sentence on this screen
       * drivable without a document.
       */
      pill.addEventListener('click', () => {
        if (rowView.id === 'units') {
          durable = store.setUnits(store.units() === 'imperial' ? 'metric' : 'imperial');
          redrawIdentity();
          redrawPlaying();
          return;
        }
        const bridge = engineerSettings();
        /* The row only exists while the bridge does; a vanished one leaves the honest stand-in. */
        if (bridge === undefined) {
          redrawPlaying();
          return;
        }
        bridge.setReduceMotion(!bridge.reduceMotion());
        redrawPlaying();
      });
      row.append(text, pill);
      playingRegion.append(row);
    }
  }

  nameInput.addEventListener('input', () => {
    draftName = nameInput.value;
    const committed = store.current() ?? DEFAULT_EVERYDAY_PROFILE;
    const next = draftName.trim();
    /*
     * A valid draft commits on the keystroke — § 20.15's check is that the rail card moves with
     * the name, not after a blur — and a refused one commits nothing: the store never holds a
     * name `menu/account.ts` would refuse, so every reader of the store may trust it.
     */
    if (settingsScreenViewOf({ profile: store.current(), draftName }).you.nameIssue === undefined) {
      durable = store.set({ name: next, avatarColor: committed.avatarColor });
    }
    redrawIdentity();
  });

  redrawIdentity();
  redrawPlaying();
  const stopWaiting = onEngineerSettingsProvided(redrawPlaying);

  host.append(root);

  return {
    unmount: () => {
      stopWaiting();
    },
  };
}

/**
 * The registry row — one import and one line in `screens.ts`, which is what opens the rail's
 * bordered gear row and retires the key's refusal sentence on the same commit.
 */
export const SETTINGS_SCREEN: EverydayScreenModule = {
  key: 'settings',
  mount,
};

/*
 * No `bar()` refinement: § 3.3's settings row is static — `⌂ Modes`, no back, no timeline, primary
 * `Back to the modes` — and `actionBar.ts` already resolves it whole. The shell wires that primary
 * to the same exit as the left button, which is what "back to the modes" is.
 */
