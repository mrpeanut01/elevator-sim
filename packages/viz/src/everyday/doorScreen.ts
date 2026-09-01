/**
 * **The front door** — GAMEPLAY § 6.1, the DOM half. Every word and every decision is
 * `doorView.ts`'s; this file draws that view with `tokens.ts`'s § 19 values and wires three
 * controls: the two stepper arrows and the seven chips.
 *
 * The layout follows the prototype's `isDoor` region (`docs/design/elevator-sim-casual.dc.html`):
 * a wide left column carrying the stepper, the week strip, the lede, the world band and the seed
 * line, and a narrow right column carrying *what the job is* and the driver card.
 *
 * Nothing here reaches into the shell, and nothing here draws a footer (§ 3.1). The § 3.3 primary
 * is answered through the mount handle — `Set up today` goes on to the brief, and on a past day the
 * bar draws it inert, so there is no press to answer.
 */

import type { ActionBarModel } from './actionBar.js';
import { actionBarFor } from './actionBar.js';
import { doorScreenViewOf, type DoorScreenView } from './doorView.js';
import { everydayProfileStore } from './profileStore.js';
import type { EverydayScreenModule } from './screens.js';
import { BODY, CARD, el, EYEBROW, LEDE, MONO, pill, QUIET, section, unavailableBand } from './screenDom.js';
import { todayOf } from './today.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayState } from './types.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';

/**
 * The stepper's position, module state for the same reason `fixitScreen.ts` keeps its case index
 * there: it is a property of *this screen*, not of the shell (§ 18 puts `dayOffset` under `daily`,
 * but nothing outside this screen reads it in this build), and a player who steps back, looks at
 * the brief and returns expects the strip where they left it.
 *
 * Reset by nothing, which is correct: the week advancing moves what each offset *means*, and the
 * view clamps, so a stale offset can only ever select a day the strip is drawing.
 */
let dayOffset = 0;

/** The view for the current host state. Rebuilt on every draw; nothing is cached across one. */
function viewOf(context: EverydayScreenShellContext): DoorScreenView {
  const { host } = context;
  const selection = host.selection();
  return doorScreenViewOf({
    week: host.week(),
    today: todayOf({
      week: host.week(),
      calendar: host.calendarPeriod(),
      building: host.resolvedBuilding(),
      buildingId: selection.buildingId,
      dispatcherName: host.dispatcherById(selection.dispatcherId)?.name,
      goals: host.goalsToday(),
      seed: host.seed(),
      /* § 15.1's `Units` row — read per draw, `settingsScreen.ts`'s own pattern with this store. */
      units: everydayProfileStore().units(),
    }),
    dayOffset,
    dayClosed: host.runState().dayClosed,
  });
}

function mountDoor(
  host: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let alive = true;

  const root = el(doc, 'div', 'everyday-door');
  root.style.cssText = [
    'display:grid',
    'grid-template-columns:minmax(0,1fr) 300px',
    `gap:${String(GAP.wide)}px`,
    'align-items:start',
  ].join(';');
  host.append(root);

  function render(): void {
    if (!alive) return;
    const view = viewOf(context);
    root.replaceChildren();
    root.append(leftColumn(doc, view), rightColumn(doc, view));
  }

  /** The left column: stepper, strip, lede, world band, seed line. */
  function leftColumn(document_: Document, view: DoorScreenView): HTMLElement {
    const column = el(document_, 'div');
    column.style.cssText = 'min-width:0';

    /* ---- the date stepper (§ 6.1 item 1) and the kind pill (item 2) ---- */
    const stepper = el(document_, 'div', 'everyday-door-stepper');
    stepper.style.cssText = `display:flex;align-items:center;gap:${String(GAP.block)}px`;
    stepper.append(
      arrow(
        document_,
        '‹',
        'everyday-door-back',
        'The day before this one',
        'The week only goes back seven days.',
        view.stepper.backEnabled,
        () => {
          dayOffset -= 1;
          render();
          context.refreshBar();
        },
      ),
    );
    const middle = el(document_, 'div');
    middle.style.cssText = 'text-align:center;min-width:0;flex:1';
    const label = el(document_, 'div', 'everyday-door-day', view.stepper.label);
    label.style.cssText = `font:700 20px ${TYPE.heading};letter-spacing:-.01em`;
    const kind = pill(
      document_,
      view.kindPill,
      view.isReplay ? C.paper : C.warmGrey,
      view.isReplay ? C.terracotta : 'transparent',
    );
    kind.className = 'everyday-door-kind';
    const kindRow = el(document_, 'div');
    kindRow.style.cssText = 'margin-top:5px';
    kindRow.append(kind);
    middle.append(label, kindRow);
    stepper.append(middle);
    stepper.append(
      arrow(
        document_,
        '›',
        'everyday-door-forward',
        'The day after this one',
        'Today is the last day there is — tomorrow has not happened.',
        view.stepper.forwardEnabled,
        () => {
          dayOffset += 1;
          render();
          context.refreshBar();
        },
      ),
    );
    column.append(stepper);

    const rule = el(document_, 'p', 'everyday-door-rule', view.rule);
    rule.style.cssText = `${QUIET};margin:12px 0 0;max-width:70ch`;
    column.append(rule);

    /* ---- the seven-chip week strip ---- */
    const strip = section(document_, view.weekHeading);
    strip.body.className = 'everyday-door-strip';
    strip.body.style.cssText = `display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:${String(GAP.row)}px`;
    for (const chip of view.chips) {
      const button = el(document_, 'button', 'everyday-door-chip');
      button.type = 'button';
      button.style.cssText = [
        'text-align:left',
        'cursor:pointer',
        'padding:9px 10px',
        `border:1.5px solid ${chip.selected ? C.ink : C.ruleLight}`,
        `border-radius:${String(R.row)}px`,
        `background:${chip.selected ? C.cardSunkDeep : C.card}`,
        'display:grid',
        'gap:3px',
        'min-width:0',
      ].join(';');
      button.title = `${chip.weekday} · ${chip.tower} · ${chip.note}`;
      const day = el(document_, 'span', 'everyday-door-chip-day', chip.weekday);
      day.style.cssText = MONO(10.5, C.label);
      const tower = el(document_, 'span', 'everyday-door-chip-tower', chip.tower);
      tower.style.cssText = `font-size:11px;color:${C.warmGrey};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
      const score = el(document_, 'span', 'everyday-door-chip-score', chip.score);
      score.style.cssText = MONO(15, chip.score === '—' ? C.faint : C.ink);
      const note = el(document_, 'span', 'everyday-door-chip-note', chip.note);
      note.style.cssText = `font-size:10.5px;color:${C.faint}`;
      button.append(day, tower, score, note);
      const offset = chip.offset;
      button.addEventListener('click', () => {
        dayOffset = offset;
        render();
        context.refreshBar();
      });
      strip.body.append(button);
    }
    column.append(strip.root);

    /* ---- the lede (item 5) ---- */
    const title = el(document_, 'h1', 'everyday-door-title', view.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:34px;font-weight:700;letter-spacing:-.02em;margin:28px 0 0`;
    const eyebrow = el(document_, 'div', 'everyday-door-eyebrow', view.eyebrow);
    eyebrow.style.cssText = `${EYEBROW};margin-top:26px`;
    const lede = el(document_, 'p', 'everyday-door-lede', view.lede);
    lede.style.cssText = `${LEDE};margin:12px 0 0`;
    column.append(eyebrow, title, lede);

    /* ---- items 3, 4 and 7: every world figure, in one labelled absence ---- */
    const world = section(document_, 'HOW YESTERDAY’S PLAYERS DID');
    world.body.append(unavailableBand(document_, view.world));
    column.append(world.root);

    /* ---- item 8: the seed line, and § 6's sentence ---- */
    const foot = el(document_, 'div', 'everyday-door-foot');
    foot.style.cssText = `margin-top:26px;padding-top:16px;border-top:1px solid ${C.ruleLight}`;
    const same = el(document_, 'p', undefined, view.sameForEveryone);
    same.style.cssText = `${BODY};margin:0;max-width:70ch`;
    const seed = el(document_, 'div', 'everyday-door-seed', view.seedLine);
    seed.style.cssText = `${MONO(11.5, C.label)};margin-top:8px`;
    foot.append(same, seed);
    column.append(foot);
    return column;
  }

  /** The right column: § 6.1's three numbered steps, and who is driving. */
  function rightColumn(document_: Document, view: DoorScreenView): HTMLElement {
    const column = el(document_, 'div');
    column.style.cssText = 'min-width:0;display:grid;gap:16px';

    const steps = el(document_, 'div', 'everyday-door-steps');
    steps.style.cssText = CARD;
    const stepsHeading = el(document_, 'div', undefined, view.stepsHeading);
    stepsHeading.style.cssText = EYEBROW;
    steps.append(stepsHeading);
    for (const step of view.steps) {
      const row = el(document_, 'div', 'everyday-door-step');
      row.style.cssText = `display:flex;gap:11px;margin-top:14px`;
      const n = el(document_, 'span', undefined, step.n);
      n.style.cssText = [
        'flex:none',
        'width:22px',
        'height:22px',
        'border-radius:50%',
        `background:${C.sun}`,
        `color:${C.ink}`,
        'display:flex',
        'align-items:center',
        'justify-content:center',
        `font:500 11px ${TYPE.mono}`,
      ].join(';');
      const text = el(document_, 'div');
      text.style.cssText = 'min-width:0';
      const head = el(document_, 'div', undefined, step.head);
      head.style.cssText = 'font-size:13.5px;font-weight:600';
      const body = el(document_, 'p', undefined, step.body);
      body.style.cssText = `${QUIET};margin:3px 0 0`;
      text.append(head, body);
      row.append(n, text);
      steps.append(row);
    }
    column.append(steps);

    const driver = el(document_, 'div', 'everyday-door-driver');
    driver.style.cssText = CARD;
    const driverHeading = el(document_, 'div', undefined, view.driver.heading);
    driverHeading.style.cssText = EYEBROW;
    const name = el(document_, 'div', 'everyday-door-driver-name', view.driver.name);
    name.style.cssText = `font:700 17px ${TYPE.heading};margin-top:7px`;
    const note = el(document_, 'div', undefined, view.driver.note);
    note.style.cssText = `${QUIET};margin-top:5px`;
    driver.append(driverHeading, name, note);
    column.append(driver);

    /*
     * § 3.3's note, drawn in the region as well as on the bar — on a past day it is the sentence
     * that says why the primary cannot act, and the bar's note column is 44ch wide and right
     * aligned. § 16 rule 6: it always says what it is short by, and it says it where the reader is.
     */
    const primaryNote = el(document_, 'p', 'everyday-door-primary-note', view.primary.note);
    primaryNote.style.cssText = [
      QUIET,
      'margin:0',
      'padding:13px 15px',
      `border-radius:${String(R.well)}px`,
      `background:${view.primary.inert ? C.amberWash : C.cardSunk}`,
      `border:1px solid ${view.primary.inert ? C.amberEdge : C.ruleLight}`,
    ].join(';');
    column.append(primaryNote);
    return column;
  }

  /**
   * One end of § 6.1's date stepper.
   *
   * **`name` and `why` are separate arguments and both are required**, because a glyph is not a
   * name and *what this would do* is not *why it will not*. Before GitHub issue #262's sweep this
   * drew a bare `›` with no `aria-label` and no `title`: a screen reader met a disabled button
   * called "›", and a sighted player met a grey arrow that said nothing about the edge of the week
   * it had reached. The name is on the control in both states; the reason only while it refuses,
   * because a live control has none to give.
   */
  function arrow(
    document_: Document,
    glyph: string,
    className: string,
    name: string,
    why: string,
    enabled: boolean,
    press: () => void,
  ): HTMLElement {
    const button = el(document_, 'button', className, glyph);
    button.type = 'button';
    button.disabled = !enabled;
    button.setAttribute('aria-label', name);
    if (!enabled) button.title = why;
    button.style.cssText = [
      'flex:none',
      'width:34px',
      'height:34px',
      `border:1px solid ${enabled ? C.rule : C.ruleLight}`,
      `border-radius:${String(R.control)}px`,
      `background:${C.card}`,
      `color:${enabled ? C.inkSoft : C.fainter}`,
      `font:500 16px ${TYPE.mono}`,
      `cursor:${enabled ? 'pointer' : 'default'}`,
    ].join(';');
    if (enabled) button.addEventListener('click', press);
    return button;
  }

  render();
  const stopListening = context.host.subscribe(render);

  return {
    unmount: () => {
      alive = false;
      stopListening();
    },
    /*
     * § 3.3's door primary — `Set up today`, which goes on to the brief. The inert arm never
     * reaches here (the shell draws a resolved-inert primary disabled), and the guard is kept
     * anyway because a handler that navigated on a press the bar refuses would be two answers to
     * one question.
     */
    primary: () => {
      if (dayOffset !== 0) return;
      context.go('brief');
    },
  };
}

/**
 * The § 3.3 refinement — § 6.1's two primary variants, and the inertness a past day earns.
 *
 * `actionBar.ts` already carries both labels (`['Set up today', 'Set up the replay']`); this picks
 * between them and sets `inert`, which the table itself may never author — § 3.3 has no inert
 * primary cell, and it is a fact about this screen's state rather than about the guide's row.
 */
function doorBar(state: EverydayState): ActionBarModel {
  const base = actionBarFor(state);
  const replay = dayOffset !== 0;
  const label = base.primary.variants[replay ? 1 : 0] ?? base.primary.label;
  const pastDay = 'A past day can be read here, not re-opened.';
  return {
    ...base,
    primary: { ...base.primary, label, ...(replay ? { inert: pastDay } : {}) },
    note: replay ? pastDay : base.note,
  };
}

/** The registry row — GAMEPLAY § 6.1's screen, mounted by `shell.ts` through `screens.ts`. */
export const DOOR_SCREEN: EverydayScreenModule = {
  key: 'door',
  mount: mountDoor,
  bar: doorBar,
};
