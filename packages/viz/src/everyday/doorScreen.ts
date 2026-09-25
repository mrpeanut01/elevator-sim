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
import {
  BODY,
  CARD,
  el,
  EYEBROW,
  LEDE,
  MONO,
  pill,
  QUIET,
  section,
  sideBySide,
  unavailableBand,
} from './screenDom.js';
import { isFirstDayOnALegibleTower } from '../shift/firstSession.js';
import { dailySeedAt, isDailySeed } from '../shift/dailySeed.js';
import { deviceNowMs } from '../shift/deviceDate.js';
import { todayOf } from './today.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayState } from './types.js';
import type { PressDayChoiceView, TowerChoiceView } from './towerChoice.js';
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
/** The right column's width beside the left one — the prototype's 300 px, unchanged. */
const DOOR_RIGHT_COLUMN_PX = 300;
/** The last view drawn, so the § 3.3 bar reads the same primary the screen does — see {@link doorBar}. */
let lastView: DoorScreenView | undefined;

/** The view for the current host state. Rebuilt on every draw; nothing is cached across one. */
function viewOf(context: EverydayScreenShellContext): DoorScreenView {
  const { host } = context;
  const selection = host.selection();
  const dayAhead = host.dayAhead();
  return doorScreenViewOf({
    week: host.week(),
    today: todayOf({
      week: host.week(),
      calendar: host.calendarPeriod(),
      /* The run the next press produces, and its clock — § D1039, `briefScreen.ts#factsNow`'s. */
      building: dayAhead.building,
      dayStartS: dayAhead.startOfDayS,
      templateVariesMix: dayAhead.templateVariesMix,
      wholeDayRun: dayAhead.wholeDayRun,
      dayCars: dayAhead.dayCars,
      buildingId: selection.buildingId,
      dispatcherName: host.dispatcherById(selection.dispatcherId)?.name,
      /* Any profile's name, for the moot-dispatcher sentence — § D914. */
      dispatcherNameOf: (id) => host.dispatcherById(id)?.name,
      goals: host.goalsToday(),
      seed: host.seed(),
      /* The horizon the next press runs — the moot sentence's fourth gate, GitHub issue #595. */
      horizon: host.scenarioHorizon(),
      /*
       * Whether the run in front of the reader is on the day’s crowd — § D729, § D730.
       *
       * **Read here, per draw, rather than latched at boot**, for the same reason `units` is two
       * lines below: a session left open across UTC midnight was seeded on yesterday’s date and is
       * still running, and a `?seed=` deep link never was the day’s at all. A flag written once
       * would have gone quietly stale at midnight with the door still saying *everyone identical*,
       * which is § D227’s stale claim arriving through a cache instead of through a sentence.
       */
      crowdIsToday: isDailySeed(host.seed(), deviceNowMs()),
      /* The day's own crowd, for the first-session line's pinned arm — § D1047. */
      daySeed: dailySeedAt(deviceNowMs()),
      firstSession: isFirstDayOnALegibleTower(host.week()),
      /* § 15.1's `Units` row — read per draw, `settingsScreen.ts`'s own pattern with this store. */
      units: everydayProfileStore().units(),
    }),
    dayOffset,
    dayClosed: host.runState().dayClosed,
    nameOf: (buildingId) => host.buildingById(buildingId)?.name,
    alsoOnScreen: pressDayTextsOf(host.towerChoice().pressDays),
  });
}

/** The press-day card's words, when it is drawn — `rightColumn`'s own condition. */
function pressDayTextsOf(days: PressDayChoiceView): readonly string[] {
  return days.rows.length > 0 ? [days.heading, days.lede, days.note] : [];
}

function mountDoor(
  host: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let alive = true;

  /*
   * **Two columns that stack on a phone** — `screenDom.ts#sideBySide`, the post-AI playability
   * panel's phone seat. This was `grid-template-columns: minmax(0,1fr) 300px`, the fixed track
   * with no breakpoint that helper's docstring was written about, and at 390 px it left the left
   * column **36 px** wide: the stepper, the day's title and the rule set one word a line under a
   * right column that kept its 300. Above the wrap the geometry is the grid's.
   */
  const root = el(doc, 'div', 'everyday-door');
  host.append(root);

  function render(): void {
    if (!alive) return;
    const view = viewOf(context);
    lastView = view;
    root.replaceChildren();
    const left = leftColumn(doc, view);
    const right = rightColumn(doc, view);
    root.append(left, right);
    sideBySide(root, { fixed: right, fluid: left, fixedPx: DOOR_RIGHT_COLUMN_PX, gapPx: GAP.wide });
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
    /* The day's own words, defined under the rule that first prints one — `doorView.ts#words`. */
    if (view.words.length > 0) {
      const words = el(document_, 'div', 'everyday-door-words');
      words.style.cssText = `margin:8px 0 0;max-width:70ch;padding-left:10px;border-left:2px solid ${C.ruleLight};display:grid;gap:4px`;
      for (const word of view.words) {
        const line = el(document_, 'p', 'everyday-door-word', word);
        line.style.cssText = `${QUIET};margin:0`;
        words.append(line);
      }
      column.append(words);
    }

    /* ---- the seven-chip week strip ---- */
    const strip = section(document_, view.weekHeading);
    strip.body.className = 'everyday-door-strip';
    /*
     * **`auto-fit` rather than a literal seven** — GitHub issue #240, `docs/31-support-matrix.md`
     * § 2. Seven equal columns of a 332 px screen region are **30 px each**, which is not a week
     * strip; it is seven ellipses. `auto-fit` collapses the tracks it has no chip for, so at a
     * desktop width the seven still share the row exactly as `repeat(7,…)` drew them, and at a
     * phone width the strip becomes three columns of a hundred-odd pixels over three rows.
     * 84 px is the width at which the shortest weekday, the score and a truncated tower name all
     * still read.
     */
    strip.body.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:${String(GAP.row)}px`;
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
    /* GitHub issue #208, § D514: why this tower, said once, on the day it is true and no other. */
    if (view.firstSessionLine !== undefined) {
      const drawn = el(document_, 'p', 'everyday-door-first-session', view.firstSessionLine);
      drawn.style.cssText = `${BODY};margin:10px 0 0;max-width:70ch`;
      foot.append(drawn);
    }
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
    const choice = context.host.towerChoice();
    column.append(towerChoiceCard(document_, choice));
    if (choice.pressDays.rows.length > 0) column.append(pressDayCard(document_, choice.pressDays));

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
    /*
     * **Today again, beside a primary that now opens tomorrow** — § D1004. The retry is the
     * product's most-used verb (`WeekState.attempt`'s docstring), and taking it off the primary to
     * give the door a way into tomorrow may not take it off the door: it goes to the brief, where
     * *Start the day* runs today again from no presses on the same crowd.
     */
    if (view.primary.again !== undefined) {
      const again = el(document_, 'div', 'everyday-door-again');
      again.style.cssText = `display:flex;align-items:center;gap:11px;flex-wrap:wrap`;
      const button = el(document_, 'button', 'everyday-door-again-press', view.primary.again.label);
      button.type = 'button';
      button.style.cssText = [
        'cursor:pointer',
        'background:transparent',
        `border:1px solid ${C.rule}`,
        `border-radius:${String(R.control)}px`,
        'padding:6px 12px',
        `color:${C.ink}`,
        'font-size:12.5px',
        'font-weight:600',
      ].join(';');
      button.addEventListener('click', () => {
        context.go('brief');
      });
      const note = el(document_, 'span', 'everyday-door-again-note', view.primary.again.note);
      note.style.cssText = QUIET;
      again.append(button, note);
      column.append(again);
    }
    return column;
  }

  /**
   * **This week's tower, as a control** — GitHub issue #587, § D912, `everyday/towerChoice.ts`.
   *
   * On the front door rather than on the week screen or behind the campaign, because this is the
   * screen that says *today's tower* and the assessor's finding was that the tower could not be
   * chosen at all: `c7` entered a week only through a once-per-device draw, so the one day whose
   * verdict turns on a press was unreachable on purpose.
   *
   * Every word is `towerChoice.ts`'s and this decides only which element it goes in — the split
   * every screen in this directory keeps. The row the week is standing on is drawn **selected and
   * inert** rather than hidden, § 16 rule 6's shape: a control that cannot act says what it is,
   * and a picker missing its own answer is a picker a player cannot read their state off.
   */
  function towerChoiceCard(document_: Document, choice: TowerChoiceView): HTMLElement {
    const card = el(document_, 'div', 'everyday-door-towers');
    card.style.cssText = CARD;
    const heading = el(document_, 'div', undefined, choice.heading);
    heading.style.cssText = EYEBROW;
    const lede = el(document_, 'p', undefined, choice.lede);
    lede.style.cssText = `${BODY};margin:7px 0 0`;
    const note = el(document_, 'p', 'everyday-door-towers-note', choice.note);
    note.style.cssText = `${QUIET};margin:5px 0 0`;
    card.append(heading, lede, note);
    const list = el(document_, 'div');
    list.style.cssText = 'display:grid;gap:6px;margin-top:11px';
    for (const row of choice.rows) {
      const button = el(document_, 'button', 'everyday-door-tower');
      button.type = 'button';
      button.dataset['contract'] = row.contractId;
      button.dataset['selected'] = row.selected ? 'true' : 'false';
      button.disabled = row.selected;
      button.setAttribute('aria-pressed', row.selected ? 'true' : 'false');
      button.style.cssText = [
        'display:block',
        'width:100%',
        'text-align:left',
        'padding:8px 10px',
        `border:1px solid ${row.selected ? C.terracotta : C.ruleLight}`,
        `border-radius:${String(R.row)}px`,
        `background:${row.selected ? C.amberWash : C.card}`,
        `color:${C.ink}`,
        `cursor:${row.selected ? 'default' : 'pointer'}`,
      ].join(';');
      const name = el(document_, 'span', 'everyday-door-tower-name', `${row.label} · ${row.tower}`);
      name.style.cssText = 'display:block;font-size:12.5px;font-weight:600';
      const why = el(
        document_,
        'span',
        'everyday-door-tower-note',
        row.booksACarOut ? `${row.teaches} · ${choice.incidentTag}` : row.teaches,
      );
      why.style.cssText = `display:block;${QUIET};margin-top:2px`;
      const arrival = el(document_, 'span', 'everyday-door-tower-arrival', row.arrivalNote);
      arrival.style.cssText = `display:block;${QUIET};margin-top:2px`;
      /*
       * **The selected row is disabled, so it owes a reason where a reason can be found** — GitHub
       * issue #262's rule, which `deadControls.browser.test.ts` sweeps: a disabled button carries an
       * accessible name *and* a `title` or an `aria-describedby` that resolves. The sentence is
       * drawn inside the button either way, because a reason a player cannot see is not a reason
       * (`stageScreenModel.ts#STAGE_SWITCH_PICKER_NOTE`'s own ground); the id and the `title` are
       * what make the same sentence reachable to a reader who is not looking at it.
       */
      arrival.id = `everyday-door-tower-${row.contractId}-arrival`;
      button.setAttribute('aria-describedby', arrival.id);
      if (row.selected) button.title = row.arrivalNote;
      button.append(name, why, arrival);
      if (!row.selected) {
        button.addEventListener('click', () => {
          context.host.chooseTower(row.contractId);
          /* The strip is a stepper, not a memory of one — a new week opens on its own today. */
          dayOffset = 0;
          render();
          context.refreshBar();
        });
      }
      list.append(button);
    }
    card.append(list);
    return card;
  }

  /**
   * **The days a press decides, as something a player can choose** — GitHub issue #595, § D973,
   * `everyday/towerChoice.ts#pressDayChoiceOf`.
   *
   * Beside the tower list rather than inside it, because a row here does something a tower row does
   * not: it sets the crowd as well as the week, and a player choosing a tower should not be able to
   * do that by accident. Every word is `towerChoice.ts`'s. A row that cannot act is drawn disabled
   * with its reason inside it and on `aria-describedby`, the tower list's own rule for its selected
   * row (GitHub issue #262), so a refused day says why where the player is looking.
   */
  function pressDayCard(document_: Document, days: PressDayChoiceView): HTMLElement {
    const card = el(document_, 'div', 'everyday-door-pressdays');
    card.style.cssText = CARD;
    const heading = el(document_, 'div', undefined, days.heading);
    heading.style.cssText = EYEBROW;
    const lede = el(document_, 'p', 'everyday-door-pressdays-lede', days.lede);
    lede.style.cssText = `${BODY};margin:7px 0 0`;
    const note = el(document_, 'p', 'everyday-door-pressdays-note', days.note);
    note.style.cssText = `${QUIET};margin:5px 0 0`;
    card.append(heading, lede, note);
    const list = el(document_, 'div');
    list.style.cssText = 'display:grid;gap:6px;margin-top:11px';
    for (const row of days.rows) {
      const button = el(document_, 'button', 'everyday-door-pressday');
      button.type = 'button';
      button.dataset['contract'] = row.contractId;
      button.dataset['standing'] = row.standing ? 'true' : 'false';
      button.disabled = !row.available;
      button.setAttribute('aria-pressed', row.standing ? 'true' : 'false');
      button.style.cssText = [
        'display:block',
        'width:100%',
        'text-align:left',
        'padding:8px 10px',
        `border:1px solid ${row.standing ? C.terracotta : C.ruleLight}`,
        `border-radius:${String(R.row)}px`,
        `background:${row.standing ? C.amberWash : C.card}`,
        `color:${C.ink}`,
        `cursor:${row.available ? 'pointer' : 'default'}`,
      ].join(';');
      const name = el(document_, 'span', 'everyday-door-pressday-name', `${row.label} · ${row.tower}`);
      name.style.cssText = 'display:block;font-size:12.5px;font-weight:600';
      const why = el(document_, 'span', 'everyday-door-pressday-note', row.note);
      why.style.cssText = `display:block;${QUIET};margin-top:2px`;
      why.id = `everyday-door-pressday-${row.contractId}-note`;
      button.setAttribute('aria-describedby', why.id);
      if (!row.available) button.title = row.note;
      button.append(name, why);
      if (row.available) {
        button.addEventListener('click', () => {
          context.host.playPressDay(row.contractId);
          dayOffset = 0;
          render();
          context.refreshBar();
        });
      }
      list.append(button);
    }
    card.append(list);
    return card;
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
      /*
       * A closed today opens tomorrow — § D1004. The same pair of calls as the report's own
       * *Open the doors on …* (`reportScreen.ts`), so a day opened here and one opened there cannot
       * differ. Read off the view the bar was drawn from, so the label and the press are one decision.
       */
      if (dayOffset === 0 && lastView?.primary.goes === 'tomorrow') {
        context.host.openTomorrow();
        context.go('brief');
        return;
      }
      if (dayOffset === 0) {
        context.go('brief');
        return;
      }
      /*
       * § 6.1's replay — GitHub issue #177 item 1, § D517. The host stands the replay week up first
       * and says why it cannot; the context follows only on its yes, `rushScreen.ts`'s own order.
       */
      const day = context.host.week().day + dayOffset;
      if (context.host.startReplay(day) === undefined) {
        /* The door reopens on today when the replay ends: the strip is a stepper, not a memory of one. */
        dayOffset = 0;
        context.enterReplay();
      }
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
  /* The view's own resolution of the day — `doorView.ts#primaryOf` — so the bar and the screen agree. */
  const view = lastView;
  /*
   * The third variant carries the weekday, so it is the view's label rather than the table's
   * placeholder — `Open the doors on ⟨day⟩` is the cell, `Open the doors on Tuesday` is the press.
   */
  const label =
    view?.primary.goes === 'tomorrow' && !replay
      ? view.primary.label
      : (base.primary.variants[replay ? 1 : 0] ?? base.primary.label);
  const inert = replay && view !== undefined && view.primary.inert ? view.primary.note : undefined;
  return {
    ...base,
    primary: { ...base.primary, label, ...(inert === undefined ? {} : { inert }) },
    note: view !== undefined && (replay || view.primary.goes === 'tomorrow') ? view.primary.note : base.note,
  };
}

/** The registry row — GAMEPLAY § 6.1's screen, mounted by `shell.ts` through `screens.ts`. */
export const DOOR_SCREEN: EverydayScreenModule = {
  key: 'door',
  mount: mountDoor,
  bar: doorBar,
};
