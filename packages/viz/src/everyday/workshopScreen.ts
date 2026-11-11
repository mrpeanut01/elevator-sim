/**
 * **The dispatcher workshop screen** — GAMEPLAY § 11, the DOM half.
 *
 * Every word and every decision is `workshopModel.ts`'s (which is where the disclosure ladder, the
 * copy's provenance and the two named deviations live); this file draws that model with
 * `tokens.ts`'s § 19 values and wires the controls to `host.ts`. It authors no sentence about a
 * dispatcher, a weight or a run.
 *
 * ## Every control writes, every write reaches a run, and the bar says so
 *
 * The workshop writes `dispatcherSpec`, `levers`, `selectorSpec` and `ruleRows`, and
 * `dev/state.ts#shiftRunConfigOf` builds the run from **all four** — since
 * [§ D886](../../../../DECISIONS.md), GitHub issue #575.
 *
 * **This paragraph said three, and before that four, and each was right about its own tree.**
 * Issue #296 found the footer claiming four when `drivingProfileOf` read three; the correction was
 * disclosure (§ D386), and it left the screen where a player is taught to tune with two live cost
 * terms behind sliders that moved nothing. Issue #575 is that arriving in a playability score: an
 * assessor set *How long anyone should wait* and *How much room to leave in a car* to 100, ran the
 * day, got a byte-identical result, and read an echo line naming the field the lever had written.
 * § D886 answers it by wiring rather than by wording — `drivingProfileOf` composes the run's
 * weights, behaviour flags and family moves out of the working copy, over the base `dispatcherId`
 * names, while `editingDispatcherId` points at it.
 *
 * So the standing requirement is met one level down and in **both** of its directions: a control
 * that writes something may not claim it writes nothing, and one that writes nothing may not claim
 * it writes something (§ D227). `workshopTravel.test.ts` is where that is asserted, by measuring
 * each control on the legs and requiring the § 3.3 note this screen selects to agree with the
 * measurement; `workshopScreen.browser.test.ts` drives the page for what a node test cannot reach.
 *
 * **What the bar still does not promise, because no cost function could.** A weight that reaches
 * the run is not a weight that must turn every decision: measured at `midtown-office`, 900 s, seed
 * 20260804, six of the shipped terms move the legs under `collective` and nine under `eta`, the
 * difference being `collective`'s `hardConstraints: ["noDirectionReversal"]`. The bar says the edit
 * travels, which is a claim about the seam and is true; it says nothing about the size of the
 * effect, which would be a claim about the run and is `shift/report.ts`'s to make afterwards.
 *
 * There is no workshop-local copy of anything: `host.workingSpec()` is the object the Engineer
 * editor edits, so a weight moved here is moved there, and § D219's five-select editor that bound
 * nothing is unexpressible. What #296 was is the other failure — a control correctly bound to a
 * field nothing downstream reads, under a footer that said it travelled.
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

import type { DispatcherProfile } from '@elevator-sim/core/browser';

import { DISPATCHER_FAMILIES } from '../authoring/dispatcherFamilies.js';
import { batchLibraryOf, savedProfilesOf } from '../batch/library.js';
import { batchReport, type BatchReport } from '../batch/report.js';
import type { BatchResult, BatchWorkerMessage, BatchWorkerRequest } from '../batch/types.js';
import { builtProfileOf } from '../authoring/dispatcherShelf.js';
import { applyControlEdit } from '../controls/controls.js';
import { renderControls } from '../controls/render.js';
import { familyValueFrom } from '../dev/dispatcherEditor.js';
import { familyControlsViewOf, familyValuesOf, prunedFamilyMoves } from '../dev/familyControls.js';
import { instantiateControlNode } from '../dev/parameterForm.js';
import {
  DEFAULT_LEVERS,
  familySpace,
  profileFromSpec,
  specFromProfile,
  specIsDirty as dispatcherSpecIsDirty,
} from '../authoring/dispatcherSpec.js';
import {
  defaultRuleRow,
  rowWithThen,
  rowWithAndAt,
  rowWithAnotherCondition,
  rowWithWhen,
  rowWithoutAndAt,
  substituted,
  type RuleRow,
} from '../authoring/ruleSpec.js';
import {
  specIsDirty as selectorSpecIsDirty,
  withWeightSet,
  type SelectorSpec,
} from '../authoring/selectorSpec.js';
import { plainLeverEchoOf, plainLeverHelp, plainLeverSub } from '../mode/plainLevers.js';

import { actionBarFor, type ActionBarModel } from './actionBar.js';
import { sideBySide } from './screenDom.js';
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import type { NameRefusal } from '../dev/dispatcherEditor.js';
import type { EverydayHost } from './host.js';
import type { EverydayState } from './types.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import { BENCH_DEFAULT_REPLICATIONS, BENCH_REPLICATION_CHOICES, benchBudgetNoteOf } from './benchModel.js';
import {
  TEST_BED_COPY as TEST_BED,
  TEST_BED_CROWDS,
  TEST_BED_DEFAULT_CROWD,
  testBedProfilesOf,
  testBedRequestOf,
  testBedViewOf,
  testBedWorkingProfileOf,
  type TestBedChoice,
  type TestBedRow,
} from './testBedModel.js';
import {
  JOURNEY_COPY as JOURNEY,
  STAGE_FAMILIES,
  WORKSHOP_DEPTHS,
  journeyOf,
  type JourneyStage,
  type WorkshopDepth,
} from './workshopJourney.js';
import {
  behaviourBlockOf,
  constraintCardsOf,
  discardQuestionOf,
  mathsDisclosureOf,
  nameplateOf,
  removeQuestionOf,
  rulesBlockOf,
  saveBlockOf,
  shelfOf,
  styleSelectionOf,
  switchingBlockOf,
  termDisclosureOf,
  workshopLeversOf,
  workshopReachOf,
  workshopWriteReachesRun,
  WORKSHOP_COPY as COPY,
  type PriorityBar,
  type WorkshopReach,
  type WorkshopWrite,
} from './workshopModel.js';

/** Which `<details>` a player has opened. Survives the redraw the DOM cannot. */
const openDisclosures = new Set<string>();

/** The last lever pressed, so `plainLeverEchoOf` has something to echo. Cleared by opening a design. */
let lastLeverId: string | undefined;

/**
 * Which of the workshop's two faces is drawn: the shelf, or the editor on the open dispatcher.
 *
 * Module-level for {@link openDisclosures}' reason — the screen redraws whole on every host
 * notification, and the choice has to outlive the node it was made on. It also outlives an
 * unmount, so a player who leaves to run a day comes back to the face they left.
 */
let view: 'shelf' | 'edit' = 'shelf';

/** A question the screen has asked and is waiting on: nothing is discarded, replaced or deleted unasked. */
type PendingQuestion =
  | { readonly kind: 'open'; readonly key: string }
  | { readonly kind: 'remove'; readonly id: string }
  | { readonly kind: 'replace' };
let pending: PendingQuestion | undefined;

/** How much of each stage card is open. Remembered across redraws and mounts, as {@link view} is. */
let depth: WorkshopDepth = 'simple';

/** A family control's refused edit, drawn under its block until the next accepted one. */
let familyRefusal: { readonly family: string; readonly reason: string } | undefined;

/** Why the last save was refused, drawn under the button until the name changes or a save lands. */
let refusal: NameRefusal | undefined;

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
/** A control inside a stage card: sunk, so the card is the object and the control is part of it. */
const CONTROL_ROW = `border:1px solid ${C.ruleLight};border-radius:${String(R.row)}px;background:${C.cardSunk};padding:11px 13px`;
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

/**
 * § 11's left rail, in pixels — the width the prototype gives the weight list beside the workshop.
 *
 * A constant rather than a literal for `fixitScreen.ts#CASE_RAIL_PX`'s reason: it is
 * `screenDom.ts#sideBySide`'s argument now, so the width at which the row stacks is derived from
 * it rather than from a second number (GitHub issue #240).
 */
const WORKSHOP_RAIL_PX = 300;

/**
 * The `id` § 11.4's inert sentence is written under, so the eleven controls it is about can point at
 * it — see {@link drawSwitching}'s block for the argument, GitHub issue #406.
 *
 * A constant rather than a literal in two places: the write and the two references are eighty lines
 * apart, and an `aria-describedby` whose target does not exist is a description a reader never
 * hears and nothing in the page complains about. axe's `aria-valid-attr-value` would catch a
 * dangling one, which is the other half of why this is safe to do at all.
 */
const INERT_NOTE_ID = 'everyday-workshop-switching-inert-note';

function mountWorkshop(
  host: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let alive = true;

  const root = el(doc, 'div', 'everyday-workshop');
  /*
   * The two columns' widths are `screenDom.ts#sideBySide`'s from here — GitHub issue #240. This read
   * `grid-template-columns:300px minmax(0,1fr)`, a fixed track with no breakpoint, and at 360 px it
   * put **42 boxes** past the right edge of the screen. `render` writes the row itself on every
   * draw, beside the two children it sizes; this is the shape before the first one.
   */
  root.style.cssText = 'display:flex;flex-direction:column;min-width:0';
  host.append(root);

  const api = context.host;

  /** The test bed's choices, run and result. In the mount's closure, so a redraw keeps them. */
  const bed: {
    choice: TestBedChoice | undefined;
    running: boolean;
    status: string;
    report: BatchReport | undefined;
    provedKey: string;
    error: string | undefined;
  } = { choice: undefined, running: false, status: '', report: undefined, provedKey: '', error: undefined };
  let bedWorker: Worker | undefined;
  let bedToken = 0;

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
   * Opening, saving and deleting — the shelf's verbs
   * ------------------------------------------------------------------ */

  /** The id the working copy was read from, or `''` when that design is gone. */
  function openId(): string {
    return api.editingSource()?.id ?? '';
  }

  /**
   * Load a design into the editor and show it.
   *
   * The group levers are set, not inherited: a design opens as itself, with the lobby lever down
   * unless a variation pulls it, so the last design's lever does not follow the player onto this
   * one. `zone` is the design's own flag unless a variation says otherwise.
   */
  function openNow(profileId: string, styleId: string | undefined): void {
    const file = api.dispatcherProfilesFile();
    const picked = styleId === undefined ? undefined : styleSelectionOf(file, styleId);
    const profile = api.dispatchers().find((entry) => entry.id === profileId);
    if (profile === undefined) return;
    view = 'edit';
    pending = undefined;
    refusal = undefined;
    lastLeverId = undefined;
    api.startFromDispatcher(profileId, {
      parking: picked?.parking ?? false,
      zone: picked?.zone ?? specFromProfile(profile, profile.name).flags.zone,
    });
    render();
  }

  /** Open a design, asking first when that would discard changes nobody has saved. */
  function open(profileId: string, styleId?: string): void {
    const key = `${profileId}/${styleId ?? ''}`;
    if (styleId === undefined && profileId === openId()) {
      view = 'edit';
      pending = undefined;
      render();
      return;
    }
    if (api.workingDispatcherStatus().unsaved && !(pending?.kind === 'open' && pending.key === key)) {
      pending = { kind: 'open', key };
      render();
      return;
    }
    openNow(profileId, styleId);
  }

  function save(mode: 'save' | 'copy'): void {
    pending = undefined;
    // A name refusal is drawn under the button; a held attempt's sentence is the bar's already.
    const answer = api.saveWorkingDispatcher(mode);
    refusal = answer === 'empty' || answer === 'taken' ? answer : undefined;
    render();
  }

  function button(
    className: string,
    label: string,
    weight: 'primary' | 'plain',
    onPress: () => void,
  ): HTMLButtonElement {
    const node = el(doc, 'button', className, label);
    node.type = 'button';
    node.style.cssText = [
      'cursor:pointer',
      `border:1.5px solid ${weight === 'primary' ? C.ink : C.rule}`,
      `background:${weight === 'primary' ? C.ink : C.card}`,
      `color:${weight === 'primary' ? C.paper : C.ink}`,
      `border-radius:${String(R.row)}px`,
      'padding:7px 12px',
      `font:600 12.5px ${TYPE.body}`,
    ].join(';');
    node.addEventListener('click', onPress);
    return node;
  }

  /** A card's way into the editor. The open design's is marked, because going back to it writes nothing. */
  function openButton(isOpen: boolean, label: string, id: string): HTMLButtonElement {
    const node = button('everyday-workshop-open', isOpen ? COPY.keepWorking : label, 'primary', () => {
      open(id);
    });
    if (isOpen) node.dataset['openNow'] = '';
    return node;
  }

  function buttonRow(...nodes: HTMLElement[]): HTMLElement {
    const row = el(doc, 'div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
    row.append(...nodes);
    return row;
  }

  /** A question and its two answers, drawn in place of the control that raised it. */
  function question(text: string, ...answers: HTMLElement[]): HTMLElement {
    const box = el(doc, 'div', 'everyday-workshop-question');
    box.setAttribute('role', 'alert');
    box.style.cssText = `border:1px solid ${C.amberEdge};background:${C.amberWash};border-radius:${String(R.row)}px;padding:10px 12px;display:flex;flex-direction:column;gap:8px`;
    const line = el(doc, 'div', undefined, text);
    line.style.cssText = `font-size:12.5px;line-height:1.45;color:${C.inkSoft}`;
    box.append(line, buttonRow(...answers));
    return box;
  }

  function cancelButton(label: string): HTMLButtonElement {
    return button('everyday-workshop-cancel', label, 'plain', () => {
      pending = undefined;
      render();
    });
  }

  /** What a design weighs most, as bars. Relative within one design — see `prioritiesOf`. */
  function priorityBars(bars: readonly PriorityBar[]): HTMLElement {
    const grid = el(doc, 'div', 'everyday-workshop-priorities');
    grid.style.cssText = 'display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 9px;align-items:center';
    for (const bar of bars) {
      const name = el(doc, 'span', undefined, bar.name);
      name.style.cssText = `font:500 10.5px ${TYPE.mono};color:${C.label}`;
      const track = el(doc, 'span');
      track.style.cssText = `display:block;height:6px;border-radius:3px;background:${C.terracotta};width:${String(Math.max(6, Math.round(bar.share * 100)))}%`;
      grid.append(name, track);
    }
    return grid;
  }

  function cardShell(className: string, mine: boolean, open_: boolean): HTMLElement {
    const card = el(doc, 'article', className);
    card.style.cssText = [
      `border:${mine ? '1.5px dashed' : '1px solid'} ${open_ ? C.sun : mine ? C.terracotta : C.rule}`,
      `border-radius:${String(R.card)}px`,
      `background:${open_ ? C.amberWash : C.card}`,
      'padding:14px 16px',
      'display:flex',
      'flex-direction:column',
      'gap:9px',
      'min-width:0',
    ].join(';');
    return card;
  }

  function cardHead(name: string, ...tags: (string | undefined)[]): HTMLElement {
    const head = el(doc, 'div');
    head.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline;justify-content:space-between';
    const title = el(doc, 'h3', undefined, name);
    title.style.cssText = `font:600 15.5px ${TYPE.heading};margin:0`;
    head.append(title);
    for (const text of tags) {
      if (text === undefined) continue;
      const tag = el(doc, 'span', 'everyday-workshop-tag', text);
      tag.style.cssText = `font:500 10px ${TYPE.mono};letter-spacing:.1em;color:${C.warmGrey};border:1px solid ${C.rule};border-radius:5px;padding:2px 6px;white-space:nowrap`;
      if (text === COPY.baselineTag) tag.title = COPY.baselineHint;
      head.append(tag);
    }
    return head;
  }

  function cardGrid(): HTMLElement {
    const grid = el(doc, 'div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:${String(GAP.block)}px`;
    return grid;
  }

  /* ------------------------------------------------------------------ *
   * The shelf — the workshop's front door
   * ------------------------------------------------------------------ */

  function drawShelf(): HTMLElement {
    const wrap = el(doc, 'div', 'everyday-workshop-shelf');
    wrap.style.cssText = 'min-width:0';
    const shelf = shelfOf(api.dispatcherProfilesFile(), DISPATCHER_FAMILIES, api.savedDispatchers(), openId());
    const openName = api.workingSpec().name;

    const eyebrow = el(doc, 'div', undefined, COPY.eyebrow);
    eyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.16em;color:${C.label}`;
    const title = el(doc, 'h1', undefined, COPY.shelfTitle);
    title.style.cssText = `font-family:${TYPE.heading};font-size:32px;font-weight:700;letter-spacing:-.02em;margin:10px 0 0`;
    const lede = el(doc, 'p', undefined, COPY.shelfLede);
    lede.style.cssText = `font-size:16px;line-height:1.55;color:${C.inkSoft};margin:12px 0 0;max-width:64ch;text-wrap:pretty`;
    wrap.append(eyebrow, title, lede);

    const discard = (key: string, profileId: string, styleId?: string): HTMLElement | undefined =>
      pending?.kind === 'open' && pending.key === key
        ? question(
            discardQuestionOf(openName),
            button('everyday-workshop-discard', COPY.discardOpen, 'primary', () => {
              openNow(profileId, styleId);
            }),
            cancelButton(COPY.discardCancel),
          )
        : undefined;

    /* ---- YOURS ---- */
    const yours = section(doc, COPY.yoursHeading, COPY.yoursHint);
    if (shelf.yoursEmpty !== undefined) {
      const line = el(doc, 'p', 'everyday-workshop-yours-empty', shelf.yoursEmpty);
      line.style.cssText = NOTE;
      yours.append(line);
    } else {
      const grid = cardGrid();
      for (const card of shelf.yours) {
        const node = cardShell('everyday-workshop-saved', true, card.open);
        node.dataset['dispatcherId'] = card.id;
        node.append(cardHead(card.name, card.open ? COPY.openTag : undefined));
        if (card.basedOn !== undefined) {
          const line = el(doc, 'div', undefined, `based on ${card.basedOn}`);
          line.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.label}`;
          node.append(line);
        }
        node.append(priorityBars(card.priorities));
        const asked = discard(`${card.id}/`, card.id);
        if (pending?.kind === 'remove' && pending.id === card.id) {
          node.append(
            question(
              removeQuestionOf(card.name),
              button('everyday-workshop-remove-confirm', COPY.removeConfirm, 'primary', () => {
                pending = undefined;
                api.deleteSavedDispatcher(card.id);
                render();
              }),
              cancelButton(COPY.removeCancel),
            ),
          );
        } else if (asked !== undefined) {
          node.append(asked);
        } else {
          node.append(
            buttonRow(
              openButton(card.open, COPY.openYours, card.id),
              button('everyday-workshop-duplicate', COPY.duplicate, 'plain', () => {
                view = 'edit';
                pending = undefined;
                api.duplicateSavedDispatcher(card.id);
                render();
              }),
              button('everyday-workshop-remove', COPY.remove, 'plain', () => {
                pending = { kind: 'remove', id: card.id };
                render();
              }),
            ),
          );
        }
        grid.append(node);
      }
      yours.append(grid);
    }
    wrap.append(yours);

    /* ---- INDUSTRY DESIGNS ---- */
    const industry = section(doc, COPY.industryHeading, shelf.industryHint);
    for (const family of shelf.families) {
      const head = el(doc, 'h2', 'everyday-workshop-family', family.name);
      head.style.cssText = `font:600 18px ${TYPE.heading};margin:${String(GAP.block)}px 0 2px`;
      const line = el(doc, 'p', undefined, family.line);
      line.style.cssText = `${NOTE};margin:0 0 10px`;
      const grid = cardGrid();
      for (const card of family.cards) {
        const node = cardShell('everyday-workshop-industry', false, card.open);
        node.dataset['profileId'] = card.profileId;
        node.append(cardHead(card.name, card.tag, card.open ? COPY.openTag : undefined));
        if (card.aliases.length > 0) {
          const alias = el(doc, 'div', undefined, `${COPY.aliasLead} “${card.aliases.join('”, “')}”`);
          alias.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.label}`;
          node.append(alias);
        }
        if (card.blurb !== undefined) {
          const blurb = el(doc, 'p', undefined, card.blurb);
          blurb.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.45;margin:0`;
          node.append(blurb);
        }
        node.append(priorityBars(card.priorities));
        node.append(
          discard(`${card.profileId}/`, card.profileId) ??
            buttonRow(
              openButton(card.open, COPY.openIndustry, card.profileId),
            ),
        );
        for (const variation of card.variations) {
          const box = el(doc, 'div', 'everyday-workshop-variation');
          box.style.cssText = `border-top:1px dashed ${C.ruleLight};padding-top:9px;display:flex;flex-direction:column;gap:6px`;
          const trade = el(doc, 'div', undefined, variation.trade);
          trade.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.45`;
          const start = button('everyday-workshop-style', variation.name, 'plain', () => {
            open(card.profileId, variation.styleId);
          });
          start.dataset['styleId'] = variation.styleId;
          box.append(
            discard(`${card.profileId}/${variation.styleId}`, card.profileId, variation.styleId) ??
              buttonRow(start),
            trade,
          );
          node.append(box);
        }
        grid.append(node);
      }
      industry.append(head, line, grid);
    }
    wrap.append(industry);
    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * The editor's left panel — § 11.1's nameplate, with the save
   * ------------------------------------------------------------------ */

  function drawLeft(): HTMLElement {
    const panel = el(doc, 'aside', 'everyday-workshop-panel');
    /*
     * Bounded to the scrollport and scrolled inside it. A sticky box taller than its scrollport
     * does not move, so whatever is below the fold stays there while focus lands on it — the one
     * SC 2.4.11 finding this screen ever recorded. With the test bed's result open this panel is
     * that tall, so it scrolls on its own rather than pinning.
     */
    panel.style.cssText = `position:sticky;top:0;align-self:flex-start;max-height:calc(100dvh - 120px);overflow-y:auto;display:flex;flex-direction:column;gap:${String(GAP.block)}px`;

    const levers = api.groupLevers();
    const spec = api.workingSpec();
    const status = api.workingDispatcherStatus();
    const block = saveBlockOf(status);

    panel.append(
      button('everyday-workshop-back', COPY.backToShelf, 'plain', () => {
        view = 'shelf';
        pending = undefined;
        render();
      }),
    );

    /* ---- the name, and where this dispatcher stands ---- */
    const plateCard = el(doc, 'div', 'everyday-workshop-nameplate');
    plateCard.style.cssText = `${CARD};border-style:dashed;display:flex;flex-direction:column;gap:8px`;
    const label = el(doc, 'label', undefined, COPY.nameLabel);
    label.style.cssText = EYEBROW;
    const name = el(doc, 'input', 'everyday-workshop-name');
    name.type = 'text';
    name.id = 'everyday-workshop-name';
    label.htmlFor = name.id;
    name.value = spec.name;
    name.maxLength = 60;
    name.style.cssText = `font:700 18px ${TYPE.heading};color:${C.ink};background:transparent;border:0;border-bottom:1.5px dashed ${C.rule};padding:2px 0;min-width:0;width:100%`;
    // `change`, not `input`: this screen redraws whole on every host notification, and a redraw
    // per keystroke would take the field's focus away mid-word.
    name.addEventListener('change', () => {
      refusal = undefined;
      api.setWorkingSpec({ ...api.workingSpec(), name: name.value });
    });
    const state = el(doc, 'div', 'everyday-workshop-state', block.state);
    state.style.cssText = `font:600 12.5px ${TYPE.body};color:${status.unsaved ? C.terracotta : C.inkSoft}`;
    plateCard.append(label, name, state);

    /*
     * The nameplate's derived rows compare the working copy against **the profile it was read from
     * with no group lever pulled**, which is what `DEFAULT_LEVERS` is. A variation that pulls the
     * lobby lever reads `levers moved 1 of 4` the moment it is opened, and that is the honest
     * reading: it *is* the design with that lever pulled.
     */
    const source = api.editingSource();
    const plate = nameplateOf({
      startedFrom: status.basedOn ?? source?.name ?? spec.name,
      spec,
      levers,
      baseSpec: source === undefined ? spec : specFromProfile(source, source.name),
      baseLevers: DEFAULT_LEVERS,
      ruleRows: api.ruleRows(),
    });
    for (const text of [plate.startedFrom, plate.leversMoved, plate.rules, plate.provedOnTheBench]) {
      const row = el(doc, 'div', undefined, text);
      row.style.cssText = `font:500 11.5px ${TYPE.mono};color:${C.warmGrey};padding:1px 0`;
      plateCard.append(row);
    }
    panel.append(plateCard);

    /* ---- the save ---- */
    const saveCard = el(doc, 'div', 'everyday-workshop-save');
    saveCard.style.cssText = `display:flex;flex-direction:column;gap:${String(GAP.row)}px`;
    if (pending?.kind === 'replace' && block.save.replaces !== undefined) {
      saveCard.append(
        question(
          block.save.replaces,
          button('everyday-workshop-replace', COPY.replaceConfirm, 'primary', () => {
            save('save');
          }),
          button('everyday-workshop-save-copy', COPY.saveCopy, 'plain', () => {
            save('copy');
          }),
          cancelButton(COPY.discardCancel),
        ),
      );
    } else {
      const primary = button('everyday-workshop-save-primary', block.save.label, 'primary', () => {
        if (block.save.replaces !== undefined) {
          pending = { kind: 'replace' };
          render();
          return;
        }
        save('save');
      });
      primary.disabled = !block.save.enabled;
      if (primary.disabled) primary.style.opacity = '0.45';
      const row = buttonRow(primary);
      if (block.copy !== undefined) {
        row.append(
          button('everyday-workshop-save-copy', block.copy, 'plain', () => {
            save('copy');
          }),
        );
      }
      if (block.revert.enabled) {
        row.append(
          button('everyday-workshop-revert', block.revert.label, 'plain', () => {
            if (source !== undefined) openNow(source.id, undefined);
          }),
        );
      }
      saveCard.append(row);
    }
    if (refusal !== undefined) {
      const line = el(
        doc,
        'p',
        'everyday-workshop-refusal',
        refusal === 'empty' ? COPY.refusalEmpty : COPY.refusalTaken,
      );
      line.setAttribute('role', 'alert');
      line.style.cssText = `${NOTE};margin:0;color:${C.alarm}`;
      saveCard.append(line);
    }
    for (const text of block.notes) {
      const line = el(doc, 'p', undefined, text);
      line.style.cssText = `${NOTE};margin:0`;
      saveCard.append(line);
    }
    panel.append(saveCard, drawTestBed());
    return panel;
  }

  /* ------------------------------------------------------------------ *
   * The test bed — `testBedModel.ts`, docked under the save
   * ------------------------------------------------------------------ */

  /** The working copy as the worker will run it, and the profile it was read from. */
  function workingProfile(): DispatcherProfile {
    return testBedWorkingProfileOf(
      { spec: api.workingSpec(), levers: api.groupLevers(), selector: api.selectorSpec(), rows: api.ruleRows() },
      api.editingSource(),
      api.selectorContext(),
    );
  }

  /** The dock's choices, defaulted the first time it is drawn and kept across redraws. */
  function bedChoice(): TestBedChoice {
    if (bed.choice !== undefined) return bed.choice;
    const shipped = api.shippedBuildingIds();
    const standing = api.selection().buildingId;
    const source = api.editingSource();
    // The natural rival is the design this one was made from: *did my changes help* is asked of it.
    const basedOn = api.savedDispatchers().find((entry) => entry.id === source?.id)?.basedOn;
    const rival = api.dispatcherById(basedOn ?? source?.id ?? '') ?? api.dispatchers()[0];
    bed.choice = {
      buildingId: shipped.includes(standing) ? standing : (shipped[0] ?? standing),
      crowdId: TEST_BED_DEFAULT_CROWD,
      rivalId: rival?.id ?? '',
      replications: BENCH_DEFAULT_REPLICATIONS,
    };
    return bed.choice;
  }

  function stopBed(): void {
    bedWorker?.terminate();
    bedWorker = undefined;
  }

  const bedStatus = el(doc, 'p', 'everyday-workshop-bed-status');
  bedStatus.setAttribute('role', 'status');
  bedStatus.style.cssText = `${NOTE};margin:0;color:${C.terracotta}`;

  /**
   * Run the working copy against the rival.
   *
   * One worker, `dev/batchWorker.ts`, as the bench runs one per test. The shelf is admitted by
   * `batchLibraryOf` before the worker starts, so a profile the engine would refuse is refused
   * here in that function's words rather than from inside a run.
   */
  function prove(): void {
    const choice = bedChoice();
    const working = workingProfile();
    const profiles = testBedProfilesOf(savedProfilesOf(api.savedDispatchers()), working);
    const library = batchLibraryOf(api.dispatcherProfilesFile(), profiles);
    stopBed();
    bedToken += 1;
    const token = bedToken;
    bed.report = undefined;
    bed.error = library.ok ? undefined : library.reason;
    bed.running = library.ok;
    bed.status = '';
    bed.provedKey = JSON.stringify(working);
    render();
    if (!library.ok) return;

    const worker = new Worker(new URL('../dev/batchWorker.ts', import.meta.url), { type: 'module' });
    bedWorker = worker;
    const total = choice.replications * 2;
    worker.addEventListener('message', (event: MessageEvent) => {
      if (token !== bedToken || !alive) return;
      const message = event.data as BatchWorkerMessage;
      if (message.kind === 'progress') {
        // Written to its own node: a whole redraw per run would take focus off the dock.
        bed.status = `${TEST_BED.running} — ${String(message.progress.completed)} of ${String(total)}`;
        bedStatus.textContent = bed.status;
        return;
      }
      bed.running = false;
      bed.status = '';
      if (message.kind === 'failed') bed.error = message.message;
      else bed.report = batchReport(message.result as BatchResult);
      stopBed();
      render();
    });
    worker.addEventListener('error', (event: ErrorEvent) => {
      if (token !== bedToken || !alive) return;
      bed.running = false;
      bed.error = event.message;
      stopBed();
      render();
    });
    worker.postMessage({
      kind: 'run',
      request: testBedRequestOf(choice, api.seed()),
      savedProfiles: profiles,
    } satisfies BatchWorkerRequest);
  }

  function bedSelect(
    id: string,
    labelText: string,
    options: readonly { readonly value: string; readonly label: string }[],
    value: string,
    onPick: (next: string) => void,
  ): HTMLElement {
    const row = el(doc, 'div');
    row.style.cssText = 'display:grid;grid-template-columns:86px minmax(0,1fr);gap:8px;align-items:center';
    const label = el(doc, 'label', undefined, labelText);
    label.style.cssText = EYEBROW;
    const select = el(doc, 'select', 'everyday-workshop-bed-select');
    select.id = `everyday-workshop-bed-${id}`;
    label.htmlFor = select.id;
    select.style.cssText = `font:500 12.5px ${TYPE.body};color:${C.ink};background:${C.card};border:1.5px solid ${C.rule};border-radius:${String(R.row)}px;padding:5px 6px;min-width:0;width:100%`;
    for (const option of options) {
      const node = el(doc, 'option', undefined, option.label);
      node.value = option.value;
      node.selected = option.value === value;
      select.append(node);
    }
    select.disabled = bed.running;
    select.addEventListener('change', () => {
      onPick(select.value);
      render();
    });
    row.append(label, select);
    return row;
  }

  function drawTestBed(): HTMLElement {
    const choice = bedChoice();
    const wrap = el(doc, 'section', 'everyday-workshop-bed');
    wrap.style.cssText = `${CARD};display:flex;flex-direction:column;gap:${String(GAP.row)}px;border-color:${C.ink}`;
    const head = el(doc, 'h2', undefined, TEST_BED.heading);
    head.style.cssText = `${EYEBROW};margin:0;color:${C.ink}`;
    const hint = el(doc, 'p', undefined, TEST_BED.hint);
    hint.style.cssText = `${NOTE};margin:0`;
    const pick = (patch: Partial<TestBedChoice>): void => {
      bed.choice = { ...choice, ...patch };
    };
    wrap.append(
      head,
      hint,
      bedSelect(
        'building',
        TEST_BED.buildingLabel,
        api.shippedBuildingIds().map((id) => ({ value: id, label: api.buildingById(id)?.name ?? id })),
        choice.buildingId,
        (next) => {
          pick({ buildingId: next });
        },
      ),
      bedSelect(
        'crowd',
        TEST_BED.crowdLabel,
        TEST_BED_CROWDS.map((crowd) => ({ value: crowd.id, label: crowd.label })),
        choice.crowdId,
        (next) => {
          pick({ crowdId: next });
        },
      ),
      bedSelect(
        'rival',
        TEST_BED.rivalLabel,
        api.dispatchers().map((profile) => ({ value: profile.id, label: profile.name })),
        choice.rivalId,
        (next) => {
          pick({ rivalId: next });
        },
      ),
      bedSelect(
        'runs',
        TEST_BED.runsLabel,
        BENCH_REPLICATION_CHOICES.map((count) => ({ value: String(count), label: String(count) })),
        String(choice.replications),
        (next) => {
          pick({ replications: Number(next) });
        },
      ),
    );
    const line = el(doc, 'p', undefined, TEST_BED.runLine);
    line.style.cssText = `${NOTE};margin:0`;
    wrap.append(line);
    const budget = benchBudgetNoteOf(choice.replications);
    if (budget !== undefined) {
      const note = el(doc, 'p', 'everyday-workshop-bed-budget', budget);
      note.style.cssText = `${NOTE};margin:0;color:${C.terracotta}`;
      wrap.append(note);
    }
    wrap.append(
      buttonRow(
        bed.running
          ? button('everyday-workshop-bed-stop', TEST_BED.stop, 'plain', () => {
              bedToken += 1;
              bed.running = false;
              bed.status = '';
              stopBed();
              render();
            })
          : button('everyday-workshop-bed-run', TEST_BED.run, 'primary', prove),
      ),
    );
    bedStatus.textContent = bed.status;
    bedStatus.hidden = !bed.running;
    wrap.append(bedStatus);

    if (bed.error !== undefined) {
      const failed = el(doc, 'p', 'everyday-workshop-bed-error', `${TEST_BED.failed} ${bed.error}`);
      failed.setAttribute('role', 'alert');
      failed.style.cssText = `${NOTE};margin:0;color:${C.alarm}`;
      wrap.append(failed);
    }
    const view = bed.report === undefined ? undefined : testBedViewOf(bed.report);
    if (view !== undefined) {
      const result = el(doc, 'div', 'everyday-workshop-bed-result');
      result.style.cssText = `display:flex;flex-direction:column;gap:6px;border-top:1px solid ${C.ruleLight};padding-top:10px`;
      if (JSON.stringify(workingProfile()) !== bed.provedKey) {
        const stale = el(doc, 'p', 'everyday-workshop-bed-stale', TEST_BED.stale);
        stale.style.cssText = `${NOTE};margin:0;color:${C.terracotta}`;
        result.append(stale);
        result.style.opacity = '0.75';
      }
      const small = `font:500 11.5px ${TYPE.mono};color:${C.warmGrey};margin:0;overflow-wrap:anywhere`;
      const ran = el(doc, 'p', undefined, view.ran);
      ran.style.cssText = small;
      result.append(ran);
      const rowNode = (row: TestBedRow, full: boolean): HTMLElement => {
        const node = el(doc, 'div', 'everyday-workshop-bed-row');
        node.dataset['metric'] = row.metric;
        node.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0';
        const top = el(doc, 'div');
        top.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline;justify-content:space-between';
        const label = el(doc, 'span', undefined, row.label);
        label.style.cssText = 'font-size:12.5px;font-weight:600';
        const pill = el(doc, 'span', 'everyday-workshop-bed-word', row.word);
        const tone = row.tone === 'good' ? C.moss : row.tone === 'bad' ? C.alarm : undefined;
        pill.style.cssText =
          `font:500 10px ${TYPE.mono};letter-spacing:.06em;border-radius:${String(R.pill)}px;padding:2px 8px;white-space:nowrap;` +
          (tone === undefined ? `border:1px solid ${C.rule};color:${C.warmGrey}` : `background:${tone};color:${C.card}`);
        top.append(label, pill);
        node.append(top);
        if (full) {
          const sentence = el(doc, 'p', undefined, row.sentence);
          sentence.style.cssText = `${NOTE};margin:0`;
          const note = el(doc, 'p', undefined, row.note);
          note.style.cssText = `${NOTE};margin:0;color:${C.label}`;
          node.append(sentence, note);
        }
        return node;
      };
      for (const row of view.headline) result.append(rowNode(row, false));
      const summary = el(doc, 'p', 'everyday-workshop-bed-summary', view.summary);
      summary.style.cssText = `${NOTE};margin:4px 0 0`;
      result.append(summary);
      if (view.noFigure !== undefined) {
        const hint = el(doc, 'p', 'everyday-workshop-bed-no-figure', view.noFigure);
        hint.style.cssText = `${NOTE};margin:0;color:${C.terracotta}`;
        result.append(hint);
      }
      const detail = disclosure(doc, 'bed-detail', TEST_BED.detailSummary);
      detail.style.marginTop = '0';
      for (const text of [view.crn, ...(view.budgetNote === undefined ? [] : [view.budgetNote]), ...view.arms]) {
        const line = el(doc, 'p', undefined, text);
        line.style.cssText = `${NOTE};margin:0 0 6px`;
        detail.append(line);
      }
      for (const row of [...view.headline, ...view.rest]) {
        const node = rowNode(row, true);
        node.style.marginBottom = '8px';
        detail.append(node);
      }
      result.append(detail);
      wrap.append(result);
    }
    const watch = el(doc, 'p', undefined, TEST_BED.watchNote);
    watch.style.cssText = `${NOTE};margin:0`;
    wrap.append(watch);
    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * The column — layers 2 to 6
   * ------------------------------------------------------------------ */

  /** One plain lever, and under it the echo of what the last press wrote. */
  function leverNodes(id: string): HTMLElement[] {
    const view = workshopLeversOf(api.workingSpec(), api.groupLevers()).find((lever) => lever.id === id);
    if (view === undefined) return [];
    const row = el(doc, 'div', 'everyday-workshop-lever');
    row.style.cssText = `${CONTROL_ROW};display:flex;align-items:center;gap:14px`;
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
    if (lastLeverId !== view.id) return [row];
    const echo = el(doc, 'p', 'everyday-workshop-echo', plainLeverEchoOf(view));
    echo.style.cssText = `${NOTE};margin:0;color:${C.terracotta}`;
    return [row, echo];
  }

  /** A labelled on/off row — a behaviour flag or a group lever. */
  function switchRow(
    className: string,
    words: { readonly label: string; readonly hint: string; readonly help: string; readonly on: boolean },
    onPress: () => void,
  ): HTMLElement {
    const row = el(doc, 'div', className);
    row.style.cssText = `${CONTROL_ROW};display:flex;align-items:center;gap:14px`;
    row.title = words.help;
    const text = el(doc, 'div');
    text.style.cssText = 'min-width:0;flex:1';
    const label = el(doc, 'div', undefined, words.label);
    label.style.cssText = 'font-size:14px;font-weight:600';
    const hint = el(doc, 'div', undefined, words.hint);
    hint.style.cssText = `font-size:12.5px;color:${C.warmGrey};line-height:1.45;margin-top:2px`;
    text.append(label, hint);
    row.append(text, toggle(doc, words.on, words.on ? 'on' : 'off', onPress));
    return row;
  }

  function flagNodes(key: 'pool' | 'zone' | 'bypass'): HTMLElement[] {
    const flag = behaviourBlockOf(api.workingSpec(), api.groupLevers()).flags.find((row) => row.key === key);
    if (flag === undefined) return [];
    return [
      switchRow('everyday-workshop-flag', flag, () => {
        setFlag(flag.key, !flag.on);
      }),
    ];
  }

  function groupLeverNodes(key: string): HTMLElement[] {
    const levers = api.groupLevers();
    const lever = behaviourBlockOf(api.workingSpec(), levers).groupLevers.find((row) => row.key === key);
    if (lever === undefined) return [];
    return [
      switchRow('everyday-workshop-group-lever', lever, () => {
        api.setGroupLevers({ ...levers, [lever.key]: !lever.on });
      }),
    ];
  }

  /** The filters no weight can buy past, named — drawn in the card about which cars may answer. */
  function constraintNodes(): HTMLElement[] {
    const constraints = constraintCardsOf(api.editingSource());
    if (constraints.length === 0) return [];
    const head = el(doc, 'div', undefined, COPY.constraintsHeading);
    head.style.cssText = EYEBROW;
    const hint = el(doc, 'p', undefined, COPY.constraintsHint);
    hint.style.cssText = `${NOTE};margin:0`;
    return [
      head,
      hint,
      ...constraints.map((card) => {
        const row = el(doc, 'div', 'everyday-workshop-constraint');
        row.style.cssText = CONTROL_ROW;
        const name = el(doc, 'div', undefined, card.name);
        name.style.cssText = 'font-size:13.5px;font-weight:600';
        const effect = el(doc, 'div', undefined, card.effect);
        effect.style.cssText = `${NOTE};margin-top:2px`;
        row.append(name, effect);
        return row;
      }),
    ];
  }

  /**
   * The schema's own controls for the families a card owns — drawn at *Detailed* and *Engineer*.
   *
   * These are `dev/familyControls.ts`'s blocks, generated from the dimensions `core` declares, so a
   * control here has the range, the default and the gate an optimizer would search — and is the
   * same control the Engineer editor draws, over the same working copy. *Engineer* adds what that
   * editor says beside each block: the function that reads it on a real run.
   *
   * An edit is validated by `controls/controls.ts#applyControlEdit` before it is written, and a
   * refused one is said under the block with the schema's own reason. Moves are pruned on the way
   * in (`prunedFamilyMoves`), so a control put back to what the design held leaves no trace.
   */
  function familyNodes(stage: JourneyStage): HTMLElement[] {
    if (depth === 'simple') return [];
    const spec = api.workingSpec();
    const levers = api.groupLevers();
    const source = api.editingSource();
    const space = familySpace();
    const draft = profileFromSpec(spec, { id: source?.id ?? 'draft', levers, ...(source === undefined ? {} : { base: source }) });
    const view = familyControlsViewOf({ space, spec, levers, draft, base: source });
    const nodes: HTMLElement[] = [];
    for (const block of view.blocks) {
      if (!STAGE_FAMILIES[stage].includes(block.family)) continue;
      const box = el(doc, 'div', 'everyday-workshop-family-block');
      box.dataset['family'] = block.family;
      box.style.cssText = `border-top:1px dashed ${C.ruleLight};padding-top:10px;display:flex;flex-direction:column;gap:6px;min-width:0`;
      const title = el(doc, 'div', undefined, block.title);
      title.style.cssText = EYEBROW;
      box.append(title);
      if (depth === 'engineer') {
        const caller = el(doc, 'div', 'everyday-workshop-family-caller', block.caller);
        caller.style.cssText = `font:500 11px ${TYPE.mono};color:${C.label};overflow-wrap:anywhere`;
        box.append(caller);
      }
      const controls = instantiateControlNode(doc, renderControls(block.rows.map((row) => row.control)));
      controls.style.minWidth = '0';
      /*
       * The schema renderer's markup is the Engineer shell's; these are § 19's values over it, so
       * the block reads as part of this card. The group's legend is the schema's section key —
       * an engine word — so it is drawn only at the depth that names things the engine's way.
       */
      for (const group of controls.querySelectorAll<HTMLElement>('fieldset')) {
        group.style.cssText = `border:1px solid ${C.ruleLight};border-radius:${String(R.row)}px;background:${C.cardSunk};padding:8px 12px;margin:0;min-width:0`;
      }
      for (const legend of controls.querySelectorAll<HTMLElement>('legend')) {
        legend.style.cssText = `font:500 10.5px ${TYPE.mono};color:${C.label};padding:0 4px`;
        legend.hidden = depth !== 'engineer';
      }
      box.append(controls);
      for (const row of block.rows) {
        if (row.overriddenBy === undefined) continue;
        const note = el(doc, 'p', undefined, `${row.control.label} — ${row.overriddenBy}`);
        note.style.cssText = `${NOTE};margin:0;color:${C.terracotta}`;
        box.append(note);
      }
      if (familyRefusal?.family === block.family) {
        const line = el(doc, 'p', 'everyday-workshop-family-refusal', familyRefusal.reason);
        line.setAttribute('role', 'alert');
        line.style.cssText = `${NOTE};margin:0;color:${C.alarm}`;
        box.append(line);
      }
      box.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
        const id = target.dataset['parameter'];
        const row = block.rows.find((candidate) => candidate.control.id === id);
        if (id === undefined || row === undefined) return;
        const values = familyValuesOf(space, draft, spec.families);
        const edit = applyControlEdit(space, values, id, familyValueFrom(row.control, target));
        if (!edit.accepted) {
          familyRefusal = { family: block.family, reason: edit.reason };
          render();
          return;
        }
        const value = edit.values.get(id);
        if (value === undefined) return;
        familyRefusal = undefined;
        if (api.setWorkingSpec({ ...spec, families: prunedFamilyMoves(space, source, { ...spec.families, [id]: value }) }) !== undefined) {
          render();
        }
      });
      nodes.push(box);
    }
    return nodes;
  }

  function drawTerms(): HTMLElement {
    const spec = api.workingSpec();
    const file = api.dispatcherProfilesFile();
    const view = termDisclosureOf(file.terms, spec, api.resolvedBuilding());
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

  /** The depth switch: three ways of reading one dispatcher. */
  function drawDepth(): HTMLElement {
    const wrap = el(doc, 'div', 'everyday-workshop-depth');
    wrap.style.cssText = `margin-top:${String(GAP.wide)}px;display:flex;flex-direction:column;gap:6px`;
    const label = el(doc, 'div', undefined, JOURNEY.depthLabel);
    label.style.cssText = EYEBROW;
    const row = el(doc, 'div');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', JOURNEY.depthLabel);
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
    for (const option of WORKSHOP_DEPTHS) {
      const pill = toggle(doc, depth === option, JOURNEY.depths[option], () => {
        depth = option;
        familyRefusal = undefined;
        render();
      });
      pill.dataset['depth'] = option;
      row.append(pill);
    }
    const note = el(doc, 'p', 'everyday-workshop-depth-note', JOURNEY.depthNotes[depth]);
    note.style.cssText = `${NOTE};margin:0`;
    wrap.append(label, row, note);
    return wrap;
  }

  /**
   * The editor: one card per stage of a call, each headed by what this dispatcher does there.
   *
   * Every control the page had is still here, in the card for the moment it acts on. The sentence
   * is `workshopJourney.ts#journeyOf` over the profile a save would write, so it moves with every
   * control on the page.
   */
  function drawJourney(): HTMLElement {
    const wrap = section(doc, JOURNEY.heading, JOURNEY.hint);
    const source = api.editingSource();
    const built = builtProfileOf(
      { spec: api.workingSpec(), levers: api.groupLevers(), selector: api.selectorSpec(), rows: api.ruleRows() },
      source?.id ?? 'draft',
      source,
      api.selectorContext(),
    );
    const boundary = el(doc, 'p', 'everyday-workshop-boundary', COPY.zoningBoundary);
    boundary.style.cssText = `${NOTE};margin:0`;
    const body: Readonly<Record<JourneyStage, () => HTMLElement[]>> = {
      calling: () => flagNodes('pool'),
      eligible: () => constraintNodes(),
      priorities: () => [...leverNodes('patience'), ...leverNodes('room'), drawTerms(), drawMaths()],
      deciding: () => [...leverNodes('spread'), ...groupLeverNodes('express'), boundary],
      rethinking: () => [],
      landing: () => flagNodes('bypass'),
      idle: () => leverNodes('lobby'),
      day: () => [drawSwitching(), drawRules()],
    };
    for (const card of journeyOf(built)) {
      const node = el(doc, 'section', 'everyday-workshop-stage');
      node.dataset['stage'] = card.stage;
      node.style.cssText = `${CARD};display:grid;grid-template-columns:28px minmax(0,1fr);gap:4px 12px;margin-bottom:${String(GAP.block)}px`;
      const mark = el(doc, 'div', undefined, card.mark);
      mark.setAttribute('aria-hidden', 'true');
      mark.style.cssText = `grid-row:1 / span 2;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:${C.ink};color:${C.paper};font:500 12px ${TYPE.mono}`;
      const title = el(doc, 'h2', undefined, card.title);
      title.style.cssText = `font:600 16.5px ${TYPE.heading};margin:0;align-self:center`;
      const readback = el(doc, 'p', 'everyday-workshop-readback-stage', card.readback);
      readback.style.cssText = `font-size:13.5px;line-height:1.5;color:${C.inkSoft};margin:0;max-width:68ch`;
      const controls = el(doc, 'div');
      controls.style.cssText = `grid-column:2;display:flex;flex-direction:column;gap:${String(GAP.row)}px;min-width:0`;
      controls.append(...body[card.stage](), ...familyNodes(card.stage));
      node.append(mark, title, readback);
      if (controls.childElementCount > 0) {
        controls.style.marginTop = '8px';
        node.append(controls);
      }
      wrap.append(node);
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

    /**
     * **The reason the block below is dead, wired to the controls it is about** — `docs/36`
     * `AX-1`/`AX-16`, GitHub issue #406, [§ D593](../../../../DECISIONS.md).
     *
     * The sentence was already drawn and already right; what it was not was **attached**. A
     * keyboard reader tabbing into this block met *"Dispatcher for up-peak traffic, combo box,
     * dimmed"* eleven times over and was told nothing about why — the explanation sat a paragraph
     * above as loose prose, which a sighted player reads in passing and a non-visual one only finds
     * by leaving the control and going looking. The accessibility-tree walkthrough counted eleven
     * such controls here, the largest group in the product.
     *
     * `aria-describedby` rather than a second copy of the words: the description a screen reader
     * announces after the control's name is **this same node**, so the two cannot drift and no
     * player-facing string is added. {@link INERT_NOTE_ID} is a constant because the write and the
     * reference are eighty lines apart and an `id` that agrees by hand is an `id` that stops
     * agreeing.
     */
    let describedBy: string | undefined;
    if (view.inertNote !== undefined) {
      const inert = el(doc, 'p', 'everyday-workshop-switching-inert', view.inertNote);
      inert.id = INERT_NOTE_ID;
      inert.style.cssText = `${NOTE};color:${C.alarm};margin:0 0 10px`;
      wrap.append(inert);
      describedBy = INERT_NOTE_ID;
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
      if (describedBy !== undefined) input.setAttribute('aria-describedby', describedBy);
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
      /*
       * The name the control carries into the accessibility tree — WCAG SC 4.1.2, axe's
       * `select-name` rule, found by `accessibilitySweep.browser.test.ts`. The pattern's own line
       * sits above it as a sibling `<div>`, which names nothing: five selects on this screen reached
       * a non-visual reader announced only as *combo box*. The pattern id is the one stable word the
       * card has — `card.line` is a sentence and `card.signature` is optional — so the name is built
       * from it rather than from prose that may not be there.
       */
      select.setAttribute('aria-label', `Dispatcher for ${card.patternId} traffic`);
      /* And why it is dead, when it is — see {@link INERT_NOTE_ID}'s block above. */
      if (describedBy !== undefined) select.setAttribute('aria-describedby', describedBy);
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

      /*
       * The row's further conditions — every one must hold as well as the first. Each is the same
       * two selects the first condition is, filled from the same table, with a control to drop it;
       * *and…* adds one while `ruleSpec.ts#canAddCondition` allows. A row with two reads as one
       * branch of a decision list, and the readback below says it as one sentence.
       */
      const PILL = `cursor:pointer;border:1px solid ${C.rule};border-radius:${String(R.pill)}px;background:transparent;padding:4px 11px;font:500 11.5px ${TYPE.mono};color:${C.warmGrey}`;
      rowView.and.forEach((extra, extraAt) => {
        const ordinal = `condition ${String(extraAt + 2)} of rule ${String(index + 1)}`;
        const andSelect = el(doc, 'select', 'everyday-workshop-and');
        andSelect.setAttribute('aria-label', `Further ${ordinal}`);
        for (const option of view.whenOptions) {
          andSelect.append(
            new (doc.defaultView?.Option ?? Option)(substituted(RULE_CONDITION_WORDS[option.id as keyof typeof RULE_CONDITION_WORDS], undefined), option.id),
          );
        }
        andSelect.value = extra.when;
        andSelect.addEventListener('change', () => {
          setRows(
            rows.map((entry, at) =>
              at === index ? rowWithAndAt(entry, extraAt, andSelect.value as RuleRow['when'], extra.whenValue) : entry,
            ),
          );
        });
        controls.append(el(doc, 'span', undefined, 'and'), andSelect);
        const andValues = view.whenOptions.find((option) => option.id === extra.when)?.values;
        if (andValues !== undefined) {
          const valueSelect = el(doc, 'select', 'everyday-workshop-and-value');
          valueSelect.setAttribute('aria-label', `Value for further ${ordinal}`);
          for (const value of andValues) {
            valueSelect.append(new (doc.defaultView?.Option ?? Option)(value.label, String(value.value)));
          }
          valueSelect.value = String(extra.whenValue);
          valueSelect.addEventListener('change', () => {
            const picked = andValues.find((value) => String(value.value) === valueSelect.value);
            if (picked === undefined) return;
            setRows(
              rows.map((entry, at) => (at === index ? rowWithAndAt(entry, extraAt, extra.when, picked.value) : entry)),
            );
          });
          controls.append(valueSelect);
        }
        const drop = el(doc, 'button', 'everyday-workshop-and-drop', 'drop');
        drop.type = 'button';
        drop.setAttribute('aria-label', `Drop ${ordinal}`);
        drop.style.cssText = PILL;
        drop.addEventListener('click', () => {
          setRows(rows.map((entry, at) => (at === index ? rowWithoutAndAt(entry, extraAt) : entry)));
        });
        controls.append(drop);
      });
      if (rowView.canAddCondition) {
        const more = el(doc, 'button', 'everyday-workshop-and-add', 'and…');
        more.type = 'button';
        more.setAttribute('aria-label', `Add a further condition to rule ${String(index + 1)}`);
        more.style.cssText = PILL;
        more.addEventListener('click', () => {
          setRows(rows.map((entry, at) => (at === index ? rowWithAnotherCondition(entry) : entry)));
        });
        controls.append(more);
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
    // `sideBySide` writes the row onto the root on every editor draw, so the shelf resets it.
    root.style.cssText = 'display:flex;flex-direction:column;min-width:0';
    if (view === 'shelf') {
      root.append(drawShelf());
      /*
       * § D1360 on the shelf: opening another design, duplicating and deleting each change who
       * drives, and each is refused while the attempt stands — so they are drawn disabled. Going
       * back to the design already open writes nothing and stays live.
       */
      if (api.attemptHold() !== undefined) {
        for (const control of root.querySelectorAll<HTMLButtonElement>('button')) {
          control.disabled = !control.matches('.everyday-workshop-open[data-open-now]');
        }
      }
      context.refreshBar();
      return;
    }
    const left = drawLeft();
    root.append(left);

    const column = el(doc, 'div');
    column.style.cssText = 'min-width:0';
    const eyebrow = el(doc, 'div', undefined, COPY.eyebrow);
    eyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.16em;color:${C.label}`;
    const title = el(doc, 'h1', undefined, COPY.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:32px;font-weight:700;letter-spacing:-.02em;margin:10px 0 0`;
    const lede = el(doc, 'p', undefined, COPY.lede);
    lede.style.cssText = `font-size:16px;line-height:1.55;color:${C.inkSoft};margin:12px 0 0;max-width:64ch;text-wrap:pretty`;
    column.append(eyebrow, title, lede);
    /*
     * **While a scored attempt stands, this screen only shows** — wave AO, lane AO-1,
     * [§ D1360](../../../../DECISIONS.md). The press below would run the attempt's day and every
     * control here writes the configuration it runs on, so each refuses with this sentence, and it
     * is drawn here, above the controls, as well as in the bar beside the inert primary.
     */
    const held = api.attemptHold();
    if (held !== undefined) {
      const line = el(doc, 'p', 'everyday-workshop-held', held);
      line.style.cssText = `${NOTE};margin:12px 0 0;max-width:64ch;color:${C.ink}`;
      column.append(line);
    }
    column.append(drawDepth(), drawJourney());
    root.append(column);
    sideBySide(root, { fixed: left, fluid: column, fixedPx: WORKSHOP_RAIL_PX, gapPx: GAP.wide });
    /*
     * § D1360: every control here writes the configuration the attempt runs on, and each write is
     * refused while the attempt stands, so the controls are drawn disabled rather than moving under
     * the pointer and springing back. The disclosures still open: reading the dispatcher is not a write.
     */
    if (held !== undefined) {
      for (const control of root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input, button, select, textarea',
      )) {
        // The way back to the shelf is not a write.
        // Neither is running the test bed: it changes nothing the attempt runs on.
        control.disabled =
          !control.matches('.everyday-workshop-back') && control.closest('.everyday-workshop-bed') === null;
      }
    }
    context.refreshBar();
  }

  // Somebody with work in hand is taken back to it; everybody else meets the shelf.
  const arriving = api.workingDispatcherStatus();
  if (arriving.kind === 'yours' || arriving.unsaved) view = 'edit';
  pending = undefined;
  refusal = undefined;
  render();
  const stop = api.subscribe(render);

  return {
    unmount: () => {
      alive = false;
      bedToken += 1;
      stopBed();
      stop();
    },
    /*
     * § 3.3's primary for this screen, shipped as *Test simulation* —
     * [§ D1627](../../../../DECISIONS.md). **It is a sandbox day, always**: the week's day with this
     * dispatcher driving, standing over the week and never on it (`EverydayHost.runSandbox`,
     * § D1368), so nothing this press starts can be closed into the week.
     *
     * It was `startRun`, the Engineer shell's **Run this shift**, which is a sandbox day only while
     * the day's attempt has not begun on a crowd that counts (§ D1362) and the day's own run
     * otherwise, so a press from this bench could be closed as the week's day. A label that says
     * *test* over a run that may file is [§ D227](../../../../DECISIONS.md)'s defect, and the owner's
     * rule is that a bench tries things and a day is played from a mode's floor.
     *
     * **All four fields this screen writes still travel with it** (GitHub issues #296 and #575,
     * § D386 and § D886): they are written to the standing configuration by this screen's own
     * controls, a sandbox day runs on that configuration, and the sandbox puts back only what its
     * own press wrote, which here is nothing. The § 3.3 note above the button is derived from
     * `scope/surface.ts` rather than written here; see {@link workshopBar}, and
     * `workshopTravel.test.ts` for the measurement that keeps the note and the legs agreeing.
     */
    primary: () => {
      /* § D1360: a refused press stays on this screen, whose bar already says why. */
      if (api.attemptHold() !== undefined) {
        context.refreshBar();
        return;
      }
      api.runSandbox({ building: undefined, pattern: undefined, dwell: undefined });
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

/**
 * Which of {@link WORKSHOP_WRITES} stand edited against what this screen opened on.
 *
 * One function over all four, rather than the single *is the working copy dirty* boolean this
 * replaced, and GitHub issue #296 is what the difference is worth. That boolean was
 * `ruleRows.length > 0 || specIsDirty(workingSpec, source)` — it consulted two of the four fields,
 * and the two it consulted are one that reaches a run and one that does not. Measured on the legs
 * at `midtown-office`, 900 s, seed 20260827, `collective`, it was wrong about **every one** of the
 * screen's four plain levers: *patience*, *room* and *spread* write the draft and were reported as
 * travelling, and *lobby* writes `levers.parking`, is the one lever whose move really does change
 * the run, and was reported as *Nothing changed yet* because it leaves the spec pristine. A bar
 * that denies the only edit that landed is § D227's stale refusal aimed at the working control,
 * which that decision rates above a missing sentence rather than below it.
 *
 * Each field is compared against the position a page nobody has touched holds, because that is what
 * the note is about — *unsaved changes*, against the profile the screen was opened on:
 *
 * - the **draft**, against the profile it was read from, or read from one the reader has since
 *   deleted, which `dispatcherEditor.ts#runThisDispatcherStateOf` also treats as dirty;
 * - the **group levers**, against `DEFAULT_LEVERS` — `state.ts` seeds them there and
 *   `workshopModel.ts#nameplateOf` counts *levers moved n of 4* against the same baseline, so the
 *   footer and the nameplate cannot disagree about whether a lever has moved;
 * - the **selector**, against the seed its own source profile gives it, which is
 *   `selectorSpec.ts#specIsDirty`'s question and not a second opinion about it;
 * - the **rules**, by count. Every profile `data/dispatcher-profiles.json` ships authors none, so a
 *   row at all is a row the player added — `state.ts#ruleRows`' own seeding argument.
 *
 * With the selector's source gone there is nothing to compare it against, so it is left out; the
 * draft is already standing in that case, so no arm of {@link workshopBar} can read as *nothing
 * changed*.
 */
function standingWrites(): readonly WorkshopWrite[] {
  const api = mountedHost;
  if (api === undefined) return [];
  const source = api.editingSource();
  const moved: WorkshopWrite[] = [];
  if (source === undefined || dispatcherSpecIsDirty(api.workingSpec(), source)) {
    moved.push('viewer.dispatcherSpec');
  }
  const levers = api.groupLevers();
  if (
    levers.parking !== DEFAULT_LEVERS.parking ||
    levers.express !== DEFAULT_LEVERS.express ||
    levers.dwell !== DEFAULT_LEVERS.dwell
  ) {
    moved.push('viewer.levers');
  }
  if (
    source !== undefined &&
    selectorSpecIsDirty(api.selectorSpec(), source, api.selectorContext())
  ) {
    moved.push('viewer.selectorSpec');
  }
  if (api.ruleRows().length > 0) moved.push('viewer.ruleRows');
  return moved;
}

/**
 * The two sentences this build needs and § 3.3's table does not carry — GitHub issue #296.
 *
 * Module-private, beside the control they are about, on `dispatcherEditor.ts#DRAFT_NOTE`'s own
 * precedent and for its stated reason: the decision is exported prose-free from
 * `workshopModel.ts#workshopReachOf`, and the wording sits where the rest of this screen's wording
 * would sit if it authored any. It is a real and stated limitation that copy held here reaches the
 * static half of the honesty sweep and not the driven one.
 *
 * They exist because the guide's table has two cells and this build has four states — see
 * {@link WorkshopReach}. Both of the guide's own sentences survive untouched in `actionBar.ts` and
 * are still drawn, each in the state it is true of; these two cover the two states the prototype's
 * workshop could not produce, because every control on it reached its toy simulator.
 *
 * The `draft-only` sentence names *the weights and the flags* rather than *the draft*, because
 * `viewer.dispatcherSpec` is not a word a player has met — the controls are. It names the way
 * across in the same breath, since a refusal that leaves a reader with no next move is the half of
 * § D227 that reads as a broken screen: GitHub issues #228 and #167 are that gap, and until one of
 * them lands the Engineer editor's *Save it and run it* is the only verb in the product that hands
 * a draft over.
 *
 * Both are empty when `scope/surface.ts` stops declaring what they claim, which is
 * `scope/commitment.ts`'s stated failure direction — an absent sentence is not a false one.
 *
 * ## **Both are empty today** — § D886, GitHub issue #575
 *
 * `viewer.dispatcherSpec` is a control since that decision, so `workshopWriteReachesRun` answers
 * `true`, both constants resolve to `''`, and {@link noteForReach} falls through to the guide's own
 * *Unsaved changes travel with the run.* on every reach a player can now produce. **Nothing was
 * edited to achieve that**, which is the whole of what the derivation bought: the sentence that had
 * to stop being drawn stopped being drawn on the commit that made it false, without anybody
 * remembering it was here.
 *
 * The paragraph above is kept as the dated record it is. One clause of it has stopped being true —
 * *"GitHub issues #228 and #167 are that gap, and until one of them lands the Engineer editor's
 * Save it and run it is the only verb in the product that hands a draft over"* — and it was neither
 * of them that closed it: the working copy reaches the run as a working copy, so there is no
 * hand-over left to be the only verb for. #228 is closed and what a save is still for is giving the
 * vector an **id**, which Compare, the gauntlet and the leaderboard resolve against.
 *
 * They are kept rather than deleted, for {@link WORKSHOP_REACHES}' own stated reason: the day a
 * fifth write lands latent, or the day the working copy goes back to being a draft, the bar has the
 * sentence for it already and does not fall back to a two-cell table that cannot describe the
 * state. `workshopTravel.test.ts` drives all sixteen subsets of the four writes, so the branches
 * that select them are exercised on every run of the suite.
 */
const DRAFT_STAYS_NOTE = !workshopWriteReachesRun('viewer.dispatcherSpec')
  ? 'The weights and the flags stay here — they are a draft, and the run uses the dispatcher you ' +
    'started from. The levers, the switching and the rules do travel.'
  : '';

const SPLIT_NOTE = !workshopWriteReachesRun('viewer.dispatcherSpec')
  ? 'Only some of it travels: the levers, the switching and the rules go with the run, and the ' +
    'weights and the flags stay here as a draft.'
  : '';

/**
 * § 3.3's note cell for the workshop row, which the guide leaves in two states:
 * *Unsaved changes travel with the run.* / *Nothing changed yet.*
 *
 * Both sentences are `actionBar.ts`'s transcription of § 3.3, in the guide's order, and both are
 * still drawn — **this picks between four states rather than two and authors neither of the
 * guide's**. It is a refinement of the resolved row rather than a row built here, which is § 3.1's
 * rule (*no screen may declare its own footer*).
 *
 * The table itself is deliberately not edited. `actionBar.ts` **is** § 3.3, `actionBar.test.ts`
 * holds a second transcription and compares them cell by cell, and the guide's two sentences are
 * not wrong — they were selected wrongly. What this build adds for the two states the guide has no
 * cell for is {@link DRAFT_STAYS_NOTE} and {@link SPLIT_NOTE}, which is `WORKSHOP_COPY`'s own
 * precedent for a panel that outgrew the prototype (`libraryHeading`, § D299 § 2).
 *
 * A `reach` the resolved row cannot answer falls through to the row's own `note`, the same
 * fall-through the two-state version had.
 *
 * `DECISIONS.md` § D386 is the decision, and GitHub issue #296 is the defect.
 */
function workshopBar(state: EverydayState): ActionBarModel {
  const base = actionBarFor(state);
  /* § D1360: while a scored attempt stands, a test simulation would play its day's crowd. Inert, with the reason. */
  const held = mountedHost?.attemptHold();
  if (held !== undefined) return { ...base, primary: { ...base.primary, inert: held } };
  const variants = base.noteVariants ?? [];
  const note = noteForReach(workshopReachOf(standingWrites()), variants) ?? base.note;
  return { ...base, ...(note === undefined ? {} : { note }) };
}

/** The sentence for one {@link WorkshopReach} — the guide's two, then this build's two. */
function noteForReach(reach: WorkshopReach, variants: readonly string[]): string | undefined {
  switch (reach) {
    case 'travels':
      return variants[0];
    case 'nothing':
      return variants[1];
    case 'draft-only':
      return DRAFT_STAYS_NOTE === '' ? variants[0] : DRAFT_STAYS_NOTE;
    case 'split':
      return SPLIT_NOTE === '' ? variants[0] : SPLIT_NOTE;
  }
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
