/**
 * **The dispatcher workshop screen** — GAMEPLAY § 11, the DOM half.
 *
 * Every word and every decision is `workshopModel.ts`'s (which is where the disclosure ladder, the
 * copy's provenance and the two named deviations live); this file draws that model with
 * `tokens.ts`'s § 19 values and wires the controls to `host.ts`. It authors no sentence about a
 * dispatcher, a weight or a run.
 *
 * ## Every control writes, and the writes go through one document
 *
 * The standing requirement — *move the control and require the run to change, compared on the
 * legs* — is met one level down rather than here: the workshop writes `dispatcherSpec`,
 * `levers`, `ruleRows` and `selectorSpec`, which are the four fields
 * `dev/state.ts#shiftRunConfigOf` builds the run from, and `workshopScreen.browser.test.ts` drives
 * the screen and requires the printed cost line to move with a lever. There is no workshop-local
 * copy of anything: `host.workingSpec()` is the object the Engineer editor edits, so a weight
 * moved here is moved there, and § D219's five-select editor that bound nothing is unexpressible.
 *
 * ## Why the disclosures are `<details>` and are remembered
 *
 * § 16 rule 13: *a disclosure announces its contents and persists*. `<details>`/`<summary>` gives
 * the announcement and the keyboard behaviour for free; what it does not give is survival across a
 * redraw, and this screen redraws whole on every host notification. {@link openDisclosures} is
 * that survival — a module-level set rather than a DOM read, because the node the state belonged
 * to has been replaced by the time anybody could read it.
 */

import { RULE_ACTION_WORDS, RULE_CONDITION_WORDS } from '@elevator-sim/core/browser';

import {
  DEFAULT_LEVERS,
  specFromProfile,
  specIsDirty as dispatcherSpecIsDirty,
} from '../authoring/dispatcherSpec.js';
import {
  defaultRuleRow,
  rowWithThen,
  rowWithWhen,
  substituted,
  type RuleRow,
} from '../authoring/ruleSpec.js';
import { withWeightSet, type SelectorSpec } from '../authoring/selectorSpec.js';
import { plainLeverEchoOf, plainLeverHelp, plainLeverSub } from '../mode/plainLevers.js';

import { actionBarFor, type ActionBarModel } from './actionBar.js';
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import type { EverydayHost } from './host.js';
import type { EverydayState } from './types.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import {
  behaviourBlockOf,
  carriedBlocksOf,
  constraintCardsOf,
  libraryCardsOf,
  mathsDisclosureOf,
  nameplateOf,
  playStyleAbsenceOf,
  playStyleCardsOf,
  rulesBlockOf,
  styleSelectionOf,
  switchingBlockOf,
  termDisclosureOf,
  workshopLeversOf,
  WORKSHOP_COPY as COPY,
} from './workshopModel.js';

/** Which `<details>` a player has opened. Survives the redraw the DOM cannot. */
const openDisclosures = new Set<string>();

/** The last lever pressed, so `plainLeverEchoOf` has something to echo. Cleared by a style card. */
let lastLeverId: string | undefined;

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

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;
const NOTE = `font-size:12.5px;color:${C.warmGrey};line-height:1.5;max-width:72ch`;
const CARD = `border:1px solid ${C.rule};border-radius:${String(R.card)}px;background:${C.card};padding:16px 18px`;

/** A `<details>` whose open state is remembered across redraws by {@link openDisclosures}. */
function disclosure(doc: Document, key: string, summaryText: string): HTMLDetailsElement {
  const box = el(doc, 'details', `everyday-workshop-${key}`);
  box.open = openDisclosures.has(key);
  const head = el(doc, 'summary', undefined, summaryText);
  head.style.cssText = `cursor:pointer;${EYEBROW};padding:10px 0`;
  box.append(head);
  box.addEventListener('toggle', () => {
    if (box.open) openDisclosures.add(key);
    else openDisclosures.delete(key);
  });
  box.style.cssText = `border-top:1px solid ${C.ruleLight};margin-top:${String(GAP.block)}px`;
  return box;
}

function section(doc: Document, heading: string, hint?: string): HTMLElement {
  const wrap = el(doc, 'section');
  wrap.style.cssText = `margin-top:${String(GAP.wide)}px`;
  const head = el(doc, 'div', undefined, heading);
  head.style.cssText = `${EYEBROW};margin-bottom:8px`;
  wrap.append(head);
  if (hint !== undefined) {
    const note = el(doc, 'p', undefined, hint);
    note.style.cssText = `${NOTE};margin:0 0 10px`;
    wrap.append(note);
  }
  return wrap;
}

function slider(
  doc: Document,
  value: number,
  onInput: (next: number) => void,
): HTMLInputElement {
  const input = el(doc, 'input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.step = '1';
  input.value = String(value);
  input.style.cssText = 'width:180px;flex:none';
  input.addEventListener('input', () => {
    onInput(Number(input.value));
  });
  return input;
}

function toggle(doc: Document, on: boolean, label: string, onPress: () => void): HTMLButtonElement {
  const pill = el(doc, 'button', 'everyday-workshop-toggle', label);
  pill.type = 'button';
  pill.setAttribute('aria-pressed', String(on));
  pill.style.cssText = [
    'cursor:pointer',
    'flex:none',
    `border:1.5px solid ${on ? C.sun : C.rule}`,
    `background:${on ? C.sun : C.cardSunk}`,
    `color:${on ? C.ink : C.warmGrey}`,
    `border-radius:${String(R.pill)}px`,
    'padding:6px 14px',
    `font:500 12px ${TYPE.mono}`,
  ].join(';');
  pill.addEventListener('click', onPress);
  return pill;
}

function mountWorkshop(
  host: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let alive = true;

  const root = el(doc, 'div', 'everyday-workshop');
  root.style.cssText = [
    'display:grid',
    'grid-template-columns:300px minmax(0,1fr)',
    `gap:${String(GAP.wide)}px`,
    'align-items:start',
  ].join(';');
  host.append(root);

  const api = context.host;

  /** Write one weight, keeping every other field of the working copy. */
  function setWeight(termId: string, position: number): void {
    const spec = api.workingSpec();
    api.setWorkingSpec({ ...spec, weights: { ...spec.weights, [termId]: position } });
  }

  function setFlag(key: 'pool' | 'zone' | 'bypass', on: boolean): void {
    const spec = api.workingSpec();
    api.setWorkingSpec({ ...spec, flags: { ...spec.flags, [key]: on } });
  }

  function setSelector(patch: Partial<SelectorSpec>): void {
    api.setSelectorSpec({ ...api.selectorSpec(), ...patch });
  }

  function setRows(rows: readonly RuleRow[]): void {
    api.setRuleRows(rows);
  }

  /* ------------------------------------------------------------------ *
   * The left panel — § 11.1
   * ------------------------------------------------------------------ */

  function drawLeft(): HTMLElement {
    const panel = el(doc, 'aside', 'everyday-workshop-panel');
    panel.style.cssText = `position:sticky;top:0;display:flex;flex-direction:column;gap:${String(GAP.block)}px`;

    const file = api.dispatcherProfilesFile();
    const selection = api.selection();
    const levers = api.groupLevers();
    const spec = api.workingSpec();

    /* ---- the nameplate ---- */
    /*
     * The nameplate compares the working copy against **the profile it was read from with no
     * group lever pulled**, which is what `DEFAULT_LEVERS` is. That makes *lobby anchor* read
     * `levers moved 1 of 4` the moment it is pressed, and that is the honest reading rather than a
     * rounding error: lobby anchor *is* the baseline vector with the lobby lever pulled, and a
     * nameplate that reported zero would be describing a dispatcher the player is not running.
     */
    const source = api.editingSource();
    const plate = nameplateOf({
      startedFrom: source?.name ?? spec.name,
      spec,
      levers,
      baseSpec: source === undefined ? spec : specFromProfile(source, source.name),
      baseLevers: DEFAULT_LEVERS,
      ruleRows: api.ruleRows(),
    });
    const plateCard = el(doc, 'div', 'everyday-workshop-nameplate');
    plateCard.style.cssText = `${CARD};border-style:dashed`;
    if (plate.unchanged !== undefined) {
      const line = el(doc, 'p', undefined, plate.unchanged);
      line.style.cssText = `${NOTE};margin:0 0 10px`;
      plateCard.append(line);
    }
    for (const text of [plate.startedFrom, plate.leversMoved, plate.rules, plate.provedOnTheBench]) {
      const row = el(doc, 'div', undefined, text);
      row.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.warmGrey};padding:3px 0`;
      plateCard.append(row);
    }
    panel.append(plateCard);

    /* ---- START FROM A STYLE ---- */
    const styles = section(doc, COPY.styleHeading, COPY.styleHint);
    const absence = playStyleAbsenceOf(file);
    if (absence !== undefined) {
      const line = el(doc, 'p', 'everyday-workshop-style-absent', absence);
      line.style.cssText = NOTE;
      styles.append(line);
    }
    for (const card of playStyleCardsOf(file, selection.dispatcherId, levers, spec)) {
      const button = el(doc, 'button', 'everyday-workshop-style');
      button.type = 'button';
      button.dataset['styleId'] = card.id;
      button.style.cssText = [
        'display:block',
        'width:100%',
        'text-align:left',
        'cursor:pointer',
        `border:1.5px solid ${card.selected ? C.sun : C.rule}`,
        `border-radius:${String(R.tile)}px`,
        `background:${card.selected ? C.amberWash : C.card}`,
        'padding:11px 13px',
        `margin-bottom:${String(GAP.row)}px`,
        `font-family:${TYPE.body}`,
        `color:${C.ink}`,
      ].join(';');
      const name = el(doc, 'div', undefined, card.name);
      name.style.cssText = 'font-size:14px;font-weight:600';
      const trade = el(doc, 'div', undefined, card.trade);
      trade.style.cssText = `font-size:12px;color:${C.warmGrey};line-height:1.45;margin-top:3px`;
      button.append(name, trade);
      button.addEventListener('click', () => {
        const picked = styleSelectionOf(file, card.id);
        if (picked === undefined) return;
        lastLeverId = undefined;
        api.startFromDispatcher(picked.profile.id, {
          parking: picked.parking,
          zone: picked.zone,
        });
      });
      styles.append(button);
    }
    panel.append(styles);

    /* ---- the rest of the shelf — § D299 § 2 ---- */
    const library = section(doc, COPY.libraryHeading, COPY.libraryHint);
    for (const card of libraryCardsOf(file, selection.dispatcherId)) {
      const button = el(doc, 'button', 'everyday-workshop-library', card.name);
      button.type = 'button';
      button.dataset['profileId'] = card.profileId;
      button.style.cssText = [
        'display:block',
        'width:100%',
        'text-align:left',
        'cursor:pointer',
        `border:1px solid ${card.selected ? C.sun : C.ruleLight}`,
        `border-radius:${String(R.row)}px`,
        `background:${card.selected ? C.amberWash : C.cardSunk}`,
        'padding:8px 11px',
        'margin-bottom:6px',
        `font:500 12.5px ${TYPE.body}`,
        `color:${C.ink}`,
      ].join(';');
      button.addEventListener('click', () => {
        lastLeverId = undefined;
        api.startFromDispatcher(card.profileId);
      });
      library.append(button);
    }
    panel.append(library);

    /* ---- YOURS ---- */
    const yours = section(doc, COPY.yoursHeading);
    const saved = api.savedDispatchers();
    if (saved.length === 0) {
      const line = el(doc, 'p', 'everyday-workshop-yours-empty', COPY.yoursEmpty);
      line.style.cssText = NOTE;
      yours.append(line);
    }
    for (const entry of saved) {
      const button = el(doc, 'button', 'everyday-workshop-saved', entry.profile.name);
      button.type = 'button';
      button.style.cssText = [
        'display:block',
        'width:100%',
        'text-align:left',
        'cursor:pointer',
        `border:1px dashed ${C.rule}`,
        `border-radius:${String(R.row)}px`,
        'background:transparent',
        'padding:8px 11px',
        'margin-bottom:6px',
        `font:500 12.5px ${TYPE.body}`,
        `color:${C.ink}`,
      ].join(';');
      button.addEventListener('click', () => {
        api.startFromDispatcher(entry.id);
      });
      yours.append(button);
    }
    panel.append(yours);
    return panel;
  }

  /* ------------------------------------------------------------------ *
   * The column — layers 2 to 6
   * ------------------------------------------------------------------ */

  function drawLevers(): HTMLElement {
    const wrap = section(doc, COPY.leversHeading, COPY.leversHint);
    const spec = api.workingSpec();
    const levers = api.groupLevers();
    for (const view of workshopLeversOf(spec, levers)) {
      const row = el(doc, 'div', 'everyday-workshop-lever');
      row.style.cssText = `${CARD};display:flex;align-items:center;gap:14px;margin-bottom:${String(GAP.row)}px`;
      row.title = plainLeverHelp(view);
      const text = el(doc, 'div');
      text.style.cssText = 'min-width:0;flex:1';
      const label = el(doc, 'div', undefined, view.label);
      label.style.cssText = 'font-size:14px;font-weight:600';
      const sub = el(doc, 'div', undefined, plainLeverSub(view));
      sub.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.45;margin-top:2px`;
      text.append(label, sub);
      if (view.serves !== undefined) {
        const serves = el(doc, 'div', undefined, view.serves);
        serves.style.cssText = `font:500 11px ${TYPE.mono};color:${C.label};margin-top:3px`;
        text.append(serves);
      }
      row.append(text);
      if (view.kind === 'slider') {
        const control = slider(doc, typeof view.value === 'number' ? view.value : 0, (next) => {
          lastLeverId = view.id;
          api.setPlainLever(view.id, next);
        });
        control.setAttribute('aria-label', view.label);
        const figure = el(doc, 'span', undefined, String(view.value));
        figure.style.cssText = `font:500 13px ${TYPE.mono};color:${C.terracotta};width:3ch;text-align:right`;
        row.append(control, figure);
      } else {
        row.append(
          toggle(doc, view.value === true, view.value === true ? view.atFull : view.atZero, () => {
            lastLeverId = view.id;
            api.setPlainLever(view.id, view.value !== true);
          }),
        );
      }
      wrap.append(row);
      if (lastLeverId === view.id) {
        const echo = el(doc, 'p', 'everyday-workshop-echo', plainLeverEchoOf(view));
        echo.style.cssText = `${NOTE};margin:-4px 0 ${String(GAP.row)}px;color:${C.terracotta}`;
        wrap.append(echo);
      }
    }
    return wrap;
  }

  function drawTerms(): HTMLElement {
    const spec = api.workingSpec();
    const file = api.dispatcherProfilesFile();
    const view = termDisclosureOf(file.terms, spec);
    const box = disclosure(doc, 'terms', view.summary);
    const hint = el(doc, 'p', undefined, view.hint);
    hint.style.cssText = `${NOTE};margin:0 0 10px`;
    box.append(hint);
    for (const row of view.rows) {
      const line = el(doc, 'div', 'everyday-workshop-term');
      line.style.cssText = `display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid ${C.ruleLight}`;
      line.title = row.help;
      const text = el(doc, 'div');
      text.style.cssText = 'min-width:0;flex:1';
      const label = el(doc, 'div', undefined, row.label);
      label.style.cssText = `font-size:13.5px;font-weight:${row.weighted ? '600' : '400'};color:${row.weighted ? C.ink : C.faint}`;
      const serves = el(doc, 'div', undefined, row.serves);
      serves.style.cssText = `font-size:12px;color:${C.warmGrey};line-height:1.4;margin-top:1px`;
      text.append(label, serves);
      if (row.inertWhy !== undefined) {
        const refusal = el(doc, 'div', 'everyday-workshop-inert', row.inertWhy);
        refusal.style.cssText = `font-size:12px;color:${C.alarm};line-height:1.4;margin-top:3px;max-width:64ch`;
        text.append(refusal);
      }
      const control = slider(doc, row.value, (next) => {
        setWeight(row.termId, next);
      });
      control.setAttribute('aria-label', row.label);
      control.dataset['termId'] = row.termId;
      const figure = el(doc, 'span', undefined, String(row.value));
      figure.style.cssText = `font:500 12.5px ${TYPE.mono};color:${row.weighted ? C.terracotta : C.faint};width:3ch;text-align:right`;
      line.append(text, control, figure);
      box.append(line);
    }
    return box;
  }

  function drawMaths(): HTMLElement {
    const file = api.dispatcherProfilesFile();
    const view = mathsDisclosureOf(api.workingSpec(), file.terms);
    const box = disclosure(doc, 'maths', view.summary);
    /* § 16 rule 12's order: the plain sentence, then every symbol, then the line. */
    const plain = el(doc, 'p', 'everyday-workshop-maths-plain', view.plainSentence);
    plain.style.cssText = `${NOTE};margin:0 0 10px`;
    box.append(plain);
    for (const symbol of view.symbols) {
      const row = el(doc, 'div', 'everyday-workshop-symbol');
      row.style.cssText = 'display:flex;gap:10px;align-items:baseline;padding:3px 0';
      const key = el(doc, 'span', undefined, symbol.symbol);
      key.style.cssText = `font:500 12.5px ${TYPE.mono};color:${C.terracotta};min-width:11ch`;
      const words = el(doc, 'span', undefined, `${symbol.name} — ${symbol.serves}`);
      words.style.cssText = `font-size:12.5px;color:${C.inkSoft}`;
      const weight = el(doc, 'span', undefined, symbol.weight);
      weight.style.cssText = `font:500 12px ${TYPE.mono};color:${C.label};margin-left:auto`;
      row.append(key, words, weight);
      box.append(row);
    }
    const line = el(doc, 'p', 'everyday-workshop-cost-line', view.line);
    line.style.cssText = `font:500 13px ${TYPE.mono};color:${C.ink};background:${C.cardSunk};border-radius:${String(R.control)}px;padding:10px 12px;margin:10px 0;overflow-x:auto`;
    box.append(line);
    const signs = el(doc, 'p', 'everyday-workshop-signs', view.signs);
    signs.style.cssText = `${NOTE};margin:0`;
    box.append(signs);
    return box;
  }

  function drawBehaviour(): HTMLElement {
    const spec = api.workingSpec();
    const levers = api.groupLevers();
    const view = behaviourBlockOf(spec, levers);
    const wrap = section(doc, view.heading, view.boundary);
    for (const flag of view.flags) {
      const row = el(doc, 'div', 'everyday-workshop-flag');
      row.style.cssText = `${CARD};display:flex;align-items:center;gap:14px;margin-bottom:${String(GAP.row)}px`;
      row.title = flag.help;
      const text = el(doc, 'div');
      text.style.cssText = 'min-width:0;flex:1';
      const label = el(doc, 'div', undefined, flag.label);
      label.style.cssText = 'font-size:14px;font-weight:600';
      const hint = el(doc, 'div', undefined, flag.hint);
      hint.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.45;margin-top:2px`;
      text.append(label, hint);
      row.append(
        text,
        toggle(doc, flag.on, flag.on ? 'on' : 'off', () => {
          setFlag(flag.key, !flag.on);
        }),
      );
      wrap.append(row);
    }
    const groupHead = el(doc, 'div', undefined, view.groupHeading);
    groupHead.style.cssText = `${EYEBROW};margin:${String(GAP.section)}px 0 8px`;
    wrap.append(groupHead);
    for (const lever of view.groupLevers) {
      const row = el(doc, 'div', 'everyday-workshop-group-lever');
      row.style.cssText = `${CARD};display:flex;align-items:center;gap:14px;margin-bottom:${String(GAP.row)}px`;
      row.title = lever.help;
      const text = el(doc, 'div');
      text.style.cssText = 'min-width:0;flex:1';
      const label = el(doc, 'div', undefined, lever.label);
      label.style.cssText = 'font-size:14px;font-weight:600';
      const hint = el(doc, 'div', undefined, lever.hint);
      hint.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.45;margin-top:2px`;
      text.append(label, hint);
      row.append(
        text,
        toggle(doc, lever.on, lever.on ? 'on' : 'off', () => {
          api.setGroupLevers({ ...levers, [lever.key]: !lever.on });
        }),
      );
      wrap.append(row);
    }
    /* The filters the weights cannot argue with, and what this document carries and cannot draw. */
    const source = api.editingSource();
    const constraints = constraintCardsOf(source);
    if (constraints.length > 0) {
      const head = el(doc, 'div', undefined, COPY.constraintsHeading);
      head.style.cssText = `${EYEBROW};margin:${String(GAP.section)}px 0 6px`;
      const hint = el(doc, 'p', undefined, COPY.constraintsHint);
      hint.style.cssText = `${NOTE};margin:0 0 8px`;
      wrap.append(head, hint);
      for (const card of constraints) {
        const row = el(doc, 'div', 'everyday-workshop-constraint');
        row.style.cssText = `${CARD};margin-bottom:${String(GAP.row)}px`;
        const name = el(doc, 'div', undefined, card.name);
        name.style.cssText = 'font-size:13.5px;font-weight:600';
        const effect = el(doc, 'div', undefined, card.effect);
        effect.style.cssText = `${NOTE};margin-top:2px`;
        row.append(name, effect);
        wrap.append(row);
      }
    }
    const carried = carriedBlocksOf(source);
    if (carried.length > 0) {
      const head = el(doc, 'div', undefined, COPY.carriedHeading);
      head.style.cssText = `${EYEBROW};margin:${String(GAP.section)}px 0 6px`;
      const hint = el(doc, 'p', undefined, COPY.carriedHint);
      hint.style.cssText = `${NOTE};margin:0 0 8px`;
      wrap.append(head, hint);
      const list = el(doc, 'ul', 'everyday-workshop-carried');
      list.style.cssText = `margin:0;padding-left:18px;${NOTE}`;
      for (const entry of carried) list.append(el(doc, 'li', undefined, entry.words));
      wrap.append(list);
    }
    return wrap;
  }

  function drawSwitching(): HTMLElement {
    const spec = api.selectorSpec();
    const ctx = api.selectorContext();
    const view = switchingBlockOf(spec, ctx);
    const wrap = section(doc, view.heading, view.hint);

    const modes = el(doc, 'div');
    modes.style.cssText = `display:flex;gap:${String(GAP.row)}px;flex-wrap:wrap;margin-bottom:10px`;
    for (const mode of view.modes) {
      modes.append(
        toggle(doc, mode.selected, mode.label, () => {
          setSelector({ policy: mode.policy as SelectorSpec['policy'] });
        }),
      );
    }
    wrap.append(modes);

    const policy = el(doc, 'p', 'everyday-workshop-policy-line', view.policyLine);
    policy.style.cssText = `${NOTE};margin:0 0 10px`;
    wrap.append(policy);

    if (view.inertNote !== undefined) {
      const inert = el(doc, 'p', 'everyday-workshop-switching-inert', view.inertNote);
      inert.style.cssText = `${NOTE};color:${C.alarm};margin:0 0 10px`;
      wrap.append(inert);
    }

    const block = el(doc, 'div', 'everyday-workshop-detector');
    block.style.cssText = view.inertNote === undefined ? '' : 'opacity:.5';
    for (const control of view.controls) {
      const row = el(doc, 'div');
      row.style.cssText = `display:flex;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid ${C.ruleLight}`;
      row.title = control.help;
      const text = el(doc, 'div');
      text.style.cssText = 'min-width:0;flex:1';
      const label = el(doc, 'div', undefined, control.label);
      label.style.cssText = 'font-size:13.5px;font-weight:600';
      text.append(label);
      const input = el(doc, 'input');
      input.type = 'number';
      input.disabled = control.inert;
      input.value = String(control.value);
      if (control.range !== undefined) {
        input.min = String(control.range[0]);
        input.max = String(control.range[1]);
      }
      input.step = 'any';
      input.dataset['field'] = control.field;
      input.setAttribute('aria-label', control.label);
      input.style.cssText = `width:100px;flex:none;border:1.5px solid ${C.rule};border-radius:${String(R.control)}px;background:${C.paper};padding:6px 8px;font:500 12.5px ${TYPE.mono}`;
      input.addEventListener('change', () => {
        setSelector({ [control.field]: Number(input.value) } as Partial<SelectorSpec>);
      });
      row.append(text, input);
      block.append(row);
    }

    for (const card of view.patterns) {
      const row = el(doc, 'div', 'everyday-workshop-pattern');
      row.style.cssText = `${CARD};margin-top:${String(GAP.row)}px`;
      const line = el(doc, 'div', undefined, card.line ?? card.patternId);
      line.style.cssText = 'font-size:13px;line-height:1.5';
      row.append(line);
      if (card.signature !== undefined) {
        const signature = el(doc, 'div', undefined, card.signature);
        signature.style.cssText = `font-size:12px;color:${C.warmGrey};margin-top:3px`;
        row.append(signature);
      }
      const select = el(doc, 'select');
      select.disabled = view.inertNote !== undefined;
      select.dataset['patternId'] = card.patternId;
      select.style.cssText = `margin-top:8px;border:1.5px solid ${C.rule};border-radius:${String(R.control)}px;background:${C.paper};padding:6px 8px;font-size:12.5px`;
      for (const profile of ctx.profiles) {
        const option = new (doc.defaultView?.Option ?? Option)(profile.name, profile.id);
        select.append(option);
      }
      select.value = card.weightSetId;
      select.addEventListener('change', () => {
        api.setSelectorSpec(withWeightSet(api.selectorSpec(), card.patternId, select.value));
      });
      row.append(select);
      block.append(row);
    }
    wrap.append(block);
    return wrap;
  }

  function drawRules(): HTMLElement {
    const rows = api.ruleRows();
    const source = api.editingSource();
    const view = rulesBlockOf(rows, source?.name ?? api.workingSpec().name, {
      hasClock: api.crowdHasClock(),
    });
    const wrap = section(doc, view.heading, view.hint);

    if (view.empty !== undefined) {
      const empty = el(doc, 'p', 'everyday-workshop-rules-empty', view.empty);
      empty.style.cssText = NOTE;
      wrap.append(empty);
    }

    view.rows.forEach((rowView, index) => {
      const row = el(doc, 'div', 'everyday-workshop-rule');
      row.style.cssText = `${CARD};margin-bottom:${String(GAP.row)}px`;
      const controls = el(doc, 'div');
      controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';

      const whenSelect = el(doc, 'select', 'everyday-workshop-when');
      for (const option of view.whenOptions) {
        whenSelect.append(
          new (doc.defaultView?.Option ?? Option)(substituted(RULE_CONDITION_WORDS[option.id as keyof typeof RULE_CONDITION_WORDS], undefined), option.id),
        );
      }
      whenSelect.value = rowView.when;
      whenSelect.addEventListener('change', () => {
        setRows(
          rows.map((entry, at) =>
            at === index ? rowWithWhen(entry, whenSelect.value as RuleRow['when']) : entry,
          ),
        );
      });
      controls.append(el(doc, 'span', undefined, 'when'), whenSelect);

      const whenValues = view.whenOptions.find((option) => option.id === rowView.when)?.values;
      if (whenValues !== undefined) {
        const valueSelect = el(doc, 'select', 'everyday-workshop-when-value');
        for (const value of whenValues) {
          valueSelect.append(
            new (doc.defaultView?.Option ?? Option)(value.label, String(value.value)),
          );
        }
        valueSelect.value = String(rowView.whenValue);
        valueSelect.addEventListener('change', () => {
          const picked = whenValues.find((value) => String(value.value) === valueSelect.value);
          if (picked === undefined) return;
          setRows(
            rows.map((entry, at) => (at === index ? { ...entry, whenValue: picked.value } : entry)),
          );
        });
        controls.append(valueSelect);
      }

      const thenSelect = el(doc, 'select', 'everyday-workshop-then');
      for (const option of view.thenOptions) {
        thenSelect.append(
          new (doc.defaultView?.Option ?? Option)(substituted(RULE_ACTION_WORDS[option.id as keyof typeof RULE_ACTION_WORDS], undefined), option.id),
        );
      }
      thenSelect.value = rowView.then;
      thenSelect.addEventListener('change', () => {
        setRows(
          rows.map((entry, at) =>
            at === index ? rowWithThen(entry, thenSelect.value as RuleRow['then']) : entry,
          ),
        );
      });
      controls.append(el(doc, 'span', undefined, 'then'), thenSelect);

      const thenValues = view.thenOptions.find((option) => option.id === rowView.then)?.values;
      if (thenValues !== undefined) {
        const valueSelect = el(doc, 'select', 'everyday-workshop-then-value');
        for (const value of thenValues) {
          valueSelect.append(
            new (doc.defaultView?.Option ?? Option)(value.label, String(value.value)),
          );
        }
        valueSelect.value = String(rowView.thenValue);
        valueSelect.addEventListener('change', () => {
          const picked = thenValues.find((value) => String(value.value) === valueSelect.value);
          if (picked === undefined) return;
          setRows(
            rows.map((entry, at) => (at === index ? { ...entry, thenValue: picked.value } : entry)),
          );
        });
        controls.append(valueSelect);
      }

      const remove = el(doc, 'button', 'everyday-workshop-rule-delete', 'delete');
      remove.type = 'button';
      remove.style.cssText = `margin-left:auto;cursor:pointer;border:1px solid ${C.rule};border-radius:${String(R.pill)}px;background:transparent;padding:4px 11px;font:500 11.5px ${TYPE.mono};color:${C.warmGrey}`;
      remove.addEventListener('click', () => {
        setRows(rows.filter((_, at) => at !== index));
      });
      controls.append(remove);
      row.append(controls);

      const readback = el(doc, 'div', 'everyday-workshop-readback', `Reads as: ${rowView.readback}`);
      readback.style.cssText = `font-size:12.5px;color:${C.inkSoft};margin-top:7px;line-height:1.45`;
      const lever = el(doc, 'div', 'everyday-workshop-rule-lever', rowView.lever);
      lever.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.label};margin-top:3px`;
      row.append(readback, lever);
      for (const issue of rowView.issues) {
        const refusal = el(doc, 'div', 'everyday-workshop-rule-issue', issue.message);
        refusal.style.cssText = `font-size:12px;color:${C.alarm};line-height:1.45;margin-top:5px;max-width:70ch`;
        row.append(refusal);
      }
      wrap.append(row);
    });

    const add = el(doc, 'button', 'everyday-workshop-rule-add', 'add a rule');
    add.type = 'button';
    add.style.cssText = `cursor:pointer;border:1.5px solid ${C.rule};border-radius:${String(R.pill)}px;background:${C.cardSunk};padding:7px 15px;font:500 12px ${TYPE.mono};color:${C.ink}`;
    add.addEventListener('click', () => {
      setRows([...rows, defaultRuleRow()]);
    });
    wrap.append(add);

    for (const [cls, text] of [
      ['everyday-workshop-rules-vocabulary', view.vocabularyNote],
      ['everyday-workshop-rules-fallback', view.fallback],
      ['everyday-workshop-rules-exclusivity', view.exclusivity],
    ] as const) {
      const line = el(doc, 'p', cls, text);
      line.style.cssText = `${NOTE};margin:10px 0 0`;
      wrap.append(line);
    }
    return wrap;
  }

  function render(): void {
    if (!alive) return;
    root.replaceChildren();
    root.append(drawLeft());

    const column = el(doc, 'div');
    column.style.cssText = 'min-width:0';
    const eyebrow = el(doc, 'div', undefined, COPY.eyebrow);
    eyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.16em;color:${C.label}`;
    const title = el(doc, 'h1', undefined, COPY.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:32px;font-weight:700;letter-spacing:-.02em;margin:10px 0 0`;
    const lede = el(doc, 'p', undefined, COPY.lede);
    lede.style.cssText = `font-size:16px;line-height:1.55;color:${C.inkSoft};margin:12px 0 0;max-width:64ch;text-wrap:pretty`;
    column.append(eyebrow, title, lede);
    column.append(drawLevers());
    const optimising = section(doc, COPY.optimisingHeading);
    optimising.append(drawTerms(), drawMaths());
    column.append(optimising);
    column.append(drawBehaviour(), drawSwitching(), drawRules());
    root.append(column);
    context.refreshBar();
  }

  render();
  const stop = api.subscribe(render);

  return {
    unmount: () => {
      alive = false;
      stop();
    },
    /*
     * § 3.3's primary for this screen is *Run a day with this*. It is the same latching press the
     * Engineer shell's **Run this shift** makes, through the host — so the run it produces may
     * file, and the working copy travels with it because `shiftRunConfigOf` builds the run from
     * the four fields this screen writes rather than from a saved profile.
     */
    primary: () => {
      api.startRun();
      context.go('stage');
    },
  };
}

/**
 * The mounted screen's host, or `undefined` while nothing is mounted.
 *
 * Module-level because the registry row's `bar()` is called by the shell **outside** the mount's
 * closure — `fixitScreen.ts`'s own `currentEntry()` shape, and for the same reason. With nothing
 * mounted the § 3.3 note falls to *Nothing changed yet*, which is the honest answer about a screen
 * nobody is on.
 */
let mountedHost: EverydayHost | undefined;

/** Whether the working copy differs from the profile it was read from, or carries any rule. */
function workingCopyIsDirty(): boolean {
  const api = mountedHost;
  if (api === undefined) return false;
  if (api.ruleRows().length > 0) return true;
  const source = api.editingSource();
  return source === undefined || dispatcherSpecIsDirty(api.workingSpec(), source);
}

/**
 * § 3.3's note cell for the workshop row, which the guide leaves in two states:
 * *Unsaved changes travel with the run.* / *Nothing changed yet.*
 *
 * Both sentences are `actionBar.ts`'s transcription of § 3.3, in the guide's order; this picks
 * between them and authors neither. It is a refinement of the resolved row rather than a row built
 * here, which is § 3.1's rule (*no screen may declare its own footer*).
 */
function workshopBar(state: EverydayState): ActionBarModel {
  const base = actionBarFor(state);
  const variants = base.noteVariants ?? [];
  const note = (workingCopyIsDirty() ? variants[0] : variants[1]) ?? base.note;
  return { ...base, ...(note === undefined ? {} : { note }) };
}

/** The registry row — GAMEPLAY § 11's screen, mounted by `shell.ts` through `screens.ts`. */
export const WORKSHOP_SCREEN: EverydayScreenModule = {
  key: 'workshop',
  mount: (host, context) => {
    mountedHost = context.host;
    const mounted = mountWorkshop(host, context as EverydayScreenShellContext);
    return {
      ...mounted,
      unmount: () => {
        mountedHost = undefined;
        mounted.unmount?.();
      },
    };
  },
  bar: workshopBar,
};
