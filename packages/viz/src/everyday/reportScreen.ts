/**
 * **How it went** — GAMEPLAY § 6.5, the DOM half. Every decision is `reportView.ts`'s, which in
 * turn is `dev/reportPanel.ts#reportViewOf`'s: this file draws a {@link ReportView} and adds no
 * arithmetic, no rounding and no second opinion about any figure.
 *
 * ## The properties this drawing has to keep, and where each is kept
 *
 * - **a withheld cell is the literal word.** `FigureView.value` is already `withheld` and
 *   `FigureView.note` already carries the run's own reason; both are drawn as strings. There is no
 *   branch here that could soften one.
 * - **energy is not coloured.** `FigureView.colour` is `undefined` on an `axisOnly` cell, and
 *   {@link figureCell} paints the value in the ink when it is. § D106's decision arrives as a
 *   `undefined` rather than as a rule this file has to remember.
 * - **a paired mean carries its count.** {@link DeltaRowView} has `beforeCount`/`afterCount`, one
 *   per side, and both are drawn under the value they are the denominator of. A `null` draws
 *   nothing, which is what a refusal and an observation both are.
 * - **the delta refuses.** `ReportDeltaView.refused` non-null means there are no figure rows and
 *   the note says which axis differs; the identity rows stay, because they are the reason there is
 *   no comparison. Drawn in that order.
 *
 * ## The lever handoff, and where the panel name comes from
 *
 * § 6.5's levers are *"a live handoff into the workshop"*, and the handoff a card performs is onto
 * the surface that can carry its advice out. **Every card that has one is a change to the building
 * document**: `LEVER_SURFACES` names exactly two, *add a car* and *zone the tower*, and both are the
 * Engineer building editor's — a car is a `CarConfig`, zoning is a bank's `servesFloors`. So a card
 * with a surface performs § 3.2's swap — `context.enterEngineer()`, the same call the rail's footer
 * row makes — and then presses the Engineer surface's **own tab button** for that panel. The
 * button's label carries the **panel's own tab text, read from that same button**. Read rather than
 * tabulated: a `Record<TabName, string>` here would be a second copy of a label `index.html` owns,
 * going stale the day somebody renames a tab, and § 16 rule 11's neighbouring argument applies (a
 * lookup table in a screen mapping ids to prose is the screen being the wrong owner). With no such
 * button in the document the label falls back to naming the simulator without naming a panel
 * (`reportView.ts#leverButtonLabel`), which is a narrower claim rather than a wrong one — and it is
 * then exactly what the press does, because there is no tab button to press either.
 *
 * **It routed to the shell's `stage` key until issue #213, and that is the defect to read before
 * changing any of this.** The sentence this paragraph replaces was true when it was written: `stage`
 * *was* the hand-off, the route that uncovered the Engineer surface and inset it beside the rail. §
 * D335 made `stage` § 7's Everyday day stage and **this call site did not move**, so the button went
 * on saying *Open the simulator's Building panel* and opened a screen where neither a car nor a zone
 * can be edited — a label describing a feature that does not exist, which is a charter non-goal. It
 * survived because the composed label was authored in this mount, and `honesty/derive.test.ts`
 * excludes the four daily-loop mounts from the sweep as *geometry, class names and floor labels*. It
 * is `reportView.ts`' string now, for that reason.
 *
 * **The press is the Engineer tab's own, rather than a second way to select a panel.** `dev/main.ts`
 * wires every tab button to `context.openTab`, which reveals a contextual tab and selects it; a
 * bespoke seam into that state would be a second producer of one fact, and the two would eventually
 * disagree. Pressing the button a player would press is the same argument
 * `dev/browserTier.test-helper.ts#enterEngineerStage` makes about routes, applied to a control.
 *
 * **An Everyday dispatcher workshop exists now, and it changes nothing here** — which is worth
 * stating because the sentence this paragraph replaces gave *"the workshop screen is unbuilt"* as
 * the reason for the routing, and that stopped being true on the merge that registered
 * `everyday/workshopScreen.ts`. It was never the real reason. The workshop authors a **dispatcher**
 * and the two routed cards author a **building**, so it could not carry them; and the two cards
 * that *are* dispatcher-shaped — *weight fairness up*, *ask where they're going* — are precisely
 * the two `LEVER_SURFACES` deliberately gives no surface at all, because a sheet pointing at a
 * dispatch control off one replication is `docs/10` R2 and CLAUDE.md's paired-interval rule. A
 * workshop route would be that refusal undone by the back door.
 */

import type { TabName } from '../dev/elementMap.js';
import type { DeltaRowView, ReportView } from '../dev/reportPanel.js';
import {
  LEVER_SURFACES,
  NOTHING_FILED_YET,
  rotatedOn,
  type SheetContinuity,
} from '../dev/reportPanel.js';

import { everydayReportViewOf, type EverydayReportView, type HonestyPart } from './reportView.js';
import { openTowerOf } from '../campaign/career.js';
import { actionBarFor, type ActionBarModel } from './actionBar.js';
import type { EverydayScreenModule } from './screens.js';
import type { EverydayState } from './types.js';
import {
  BODY,
  CARD,
  el,
  EYEBROW,
  figureCell,
  LEDE,
  MONO,
  QUIET,
  section,
  WELL,
} from './screenDom.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';

/**
 * The two sheets this screen is holding — `dev/reportPanel.ts`'s own rotation, reused whole.
 *
 * Module state rather than a field of the mount, because a reader who reads a sheet, walks to the
 * week and comes back has still read it: the delta is against *the sheet the reader actually read*,
 * which is that module's stated rule and the reason it is not `ViewerState`'s to hold.
 */
let continuity: SheetContinuity = NOTHING_FILED_YET;

/**
 * The Engineer tab strip's own words for the panels a lever can route to.
 *
 * Keyed over `LEVER_SURFACES`' **values** rather than over every tab, so this walks exactly the
 * panels a card can name and acquires a fifth the day that table does. A tab with no button in
 * this document is simply absent, and {@link EverydayLeverCard.goLabel} then claims less.
 */
function panelNamesOf(doc: Document): Partial<Record<TabName, string>> {
  const names: Partial<Record<TabName, string>> = {};
  for (const tab of new Set(Object.values(LEVER_SURFACES))) {
    const text = doc.getElementById(`tab-${tab}`)?.textContent?.trim();
    if (text !== undefined && text !== '') names[tab] = text;
  }
  return names;
}

function mountReportScreen(
  host: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let alive = true;

  const root = el(doc, 'div', 'everyday-report');
  root.style.cssText = 'max-width:900px';
  host.append(root);

  function viewNow(): EverydayReportView {
    const data = context.host;
    const report = data.lastReport();
    // Rotate before building the view, never after — `rotatedOn`'s own rule: rotating afterwards
    // makes every sheet its own predecessor on the next draw and every delta reads *nothing moved*.
    continuity = rotatedOn(continuity, report, { kind: 'played-out' });
    const run = data.runState();
    return everydayReportViewOf({
      report,
      previous: continuity.previous,
      overnight: data.tomorrowBriefing(),
      newerRunOnStage: report !== undefined && run.hasRun && !run.dayClosed,
      panelNames: panelNamesOf(doc),
    });
  }

  function render(): void {
    if (!alive) return;
    // What § 3.3's campaign primary names — see {@link reportBuildingName}.
    const open = openTowerOf(context.host.campaign());
    reportBuildingName =
      open === undefined ? undefined : context.host.buildingById(open.buildingId)?.name;
    const view = viewNow();
    root.replaceChildren();
    if (!view.filed) {
      const empty = el(doc, 'div', 'everyday-report-empty');
      const title = el(doc, 'h1', undefined, 'Nothing to report yet');
      title.style.cssText = `font-family:${TYPE.heading};font-size:30px;font-weight:700;margin:0`;
      const lede = el(doc, 'p', 'everyday-report-empty-lede', view.emptyLede ?? '');
      lede.style.cssText = `${LEDE};margin:12px 0 0`;
      empty.append(title, lede);
      root.append(empty);
      return;
    }
    drawSheet(view);
  }

  function drawSheet(view: EverydayReportView): void {
    const sheet = view.sheet;

    /* ---- head and lede ---- */
    const head = el(doc, 'div');
    const meta = el(doc, 'div', 'everyday-report-meta');
    meta.style.cssText = `${EYEBROW};display:flex;flex-wrap:wrap;gap:10px`;
    for (const line of sheet.metaLines) meta.append(el(doc, 'span', undefined, line));
    const title = el(doc, 'h1', 'everyday-report-title', sheet.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:34px;font-weight:700;letter-spacing:-.02em;margin:10px 0 0`;
    const verdict = el(doc, 'div', 'everyday-report-verdict', sheet.verdictLine);
    /*
     * The verdict's colour is `reportViewOf`'s, as a CSS variable off `index.html`'s palette —
     * this shell shares that document, so the token resolves. It is carried rather than re-picked
     * because the third arm (`ungraded` → neutral) is a decision with an issue behind it: a day
     * nobody judged is not a day that went wrong, and amber is this palette's word for *went
     * wrong*.
     */
    verdict.style.cssText = `font:700 15px ${TYPE.heading};margin-top:9px;color:${sheet.verdictColour}`;
    const lede = el(doc, 'p', 'everyday-report-lede', sheet.lede);
    lede.style.cssText = `${LEDE};margin:12px 0 0`;
    head.append(meta, title, verdict, lede);
    root.append(head);

    if (view.staleNote !== undefined) {
      const stale = el(doc, 'p', 'everyday-report-stale', view.staleNote);
      stale.style.cssText = [
        QUIET,
        'margin:14px 0 0',
        'padding:11px 14px',
        `border-radius:${String(R.well)}px`,
        `background:${C.amberWash}`,
        `border:1px solid ${C.amberEdge}`,
      ].join(';');
      root.append(stale);
    }

    /* ---- the figures ---- */
    const figures = section(doc, view.headings.figures);
    figures.body.className = 'everyday-report-figures';
    figures.body.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:${String(GAP.row)}px`;
    for (const cell of sheet.figures) figures.body.append(figureCell(doc, cell));
    root.append(figures.root);

    /* ---- the goals: what the day asked, and how it read ---- */
    if (sheet.goals.length > 0) {
      const goals = section(doc, sheet.goalsHeading ?? 'WHAT TODAY ASKED');
      goals.body.className = 'everyday-report-goals';
      goals.body.style.cssText = 'display:grid;gap:6px';
      for (const goal of sheet.goals) {
        const row = el(doc, 'div', 'everyday-report-goal');
        row.style.cssText = [
          'display:flex',
          'align-items:baseline',
          'gap:11px',
          'padding:10px 13px',
          `border-radius:${String(R.row)}px`,
          `background:${goal.background === 'transparent' ? C.cardSunk : goal.background}`,
          `border:1px solid ${C.ruleLight}`,
        ].join(';');
        row.title = goal.help;
        const glyph = el(doc, 'span', undefined, goal.glyph);
        glyph.style.cssText = `${MONO(13, goal.colour)};flex:none`;
        const label = el(doc, 'span', undefined, goal.label);
        label.style.cssText = `${BODY};flex:1;min-width:0`;
        const display = el(doc, 'span', 'everyday-report-goal-value', goal.display);
        display.style.cssText = MONO(13, goal.colour);
        const was = el(doc, 'span', undefined, goal.was);
        was.style.cssText = MONO(11, C.faint);
        row.append(glyph, label, display, was);
        goals.body.append(row);
      }
      root.append(goals.root);
    }

    /* ---- three beats ---- */
    if (sheet.diagnosis.length > 0) {
      const beats = section(doc, view.headings.beats);
      beats.body.className = 'everyday-report-beats';
      beats.body.style.cssText = 'display:grid;gap:9px';
      for (const beat of sheet.diagnosis) {
        const row = el(doc, 'div', 'everyday-report-beat');
        row.style.cssText = [
          'display:flex',
          'gap:13px',
          'padding:12px 15px',
          `border-left:2px solid ${beat.accent}`,
          `border-radius:0 ${String(R.row)}px ${String(R.row)}px 0`,
          `background:${C.cardSunk}`,
        ].join(';');
        const when = el(doc, 'span', 'everyday-report-beat-when', beat.when);
        when.style.cssText = `${MONO(11.5, C.label)};flex:none;min-width:66px`;
        const text = el(doc, 'div');
        text.style.cssText = 'min-width:0';
        const what = el(doc, 'div', undefined, beat.what);
        what.style.cssText = 'font-size:13.5px;font-weight:600';
        const why = el(doc, 'p', undefined, beat.why);
        why.style.cssText = `${QUIET};margin:3px 0 0`;
        text.append(what, why);
        row.append(when, text);
        beats.body.append(row);
      }
      root.append(beats.root);
    }

    /* ---- the levers, each with its handoff ---- */
    if (view.levers.length > 0) {
      const levers = section(doc, view.headings.levers);
      levers.body.className = 'everyday-report-levers';
      levers.body.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:${String(GAP.row)}px`;
      for (const lever of view.levers) {
        const card = el(doc, 'div', 'everyday-report-lever');
        card.style.cssText = `${WELL};display:grid;gap:6px;align-content:start`;
        const title_ = el(doc, 'div', undefined, lever.title);
        title_.style.cssText = 'font-size:13.5px;font-weight:600';
        const body = el(doc, 'p', undefined, lever.body);
        body.style.cssText = `${QUIET};margin:0`;
        card.append(title_, body);
        const surface = lever.surface;
        const goLabel = lever.goLabel;
        /*
         * The two are `undefined` together — `reportView.ts` decides both from one branch and
         * `reportView.test.ts` asserts the pairing. Read as a conjunction here rather than
         * asserted, because a screen that threw on the impossible arm would be a screen that goes
         * blank on a defect a note could survive.
         */
        if (surface === undefined || goLabel === undefined) {
          const note = el(doc, 'p', 'everyday-report-lever-note', lever.noSurfaceNote ?? '');
          note.style.cssText = `${QUIET};margin:0;color:${C.terracotta}`;
          card.append(note);
        } else {
          const button = el(doc, 'button', 'everyday-report-lever-go', goLabel);
          button.type = 'button';
          button.style.cssText = [
            'cursor:pointer',
            'justify-self:start',
            `border:1px solid ${C.ink}`,
            `border-radius:${String(R.pill)}px`,
            `background:${C.card}`,
            `color:${C.ink}`,
            'padding:6px 13px',
            'font-size:12.5px',
          ].join(';');
          button.addEventListener('click', () => {
            /*
             * § 3.2's swap first, then the panel — in that order and in one turn. `enterEngineer`
             * uncovers the Engineer surface and clears the `inert` this shell holds over it, so the
             * tab press below lands on a live control rather than on a covered one. It is
             * idempotent, which matters because a queued second click must not toggle the world.
             */
            context.enterEngineer();
            doc.getElementById(`tab-${surface}`)?.click();
          });
          card.append(button);
        }
        levers.body.append(card);
      }
      root.append(levers.root);
    }

    /* ---- what moved since the run before this one ---- */
    if (sheet.delta !== null) root.append(deltaBlock(sheet.delta));

    /* ---- what changed overnight ---- */
    if (sheet.overnight !== null) {
      const overnight = section(doc, view.headings.overnight);
      overnight.body.className = 'everyday-report-overnight';
      overnight.body.style.cssText = `${CARD};display:grid;gap:12px`;
      const headline = el(doc, 'div', 'everyday-report-overnight-headline', sheet.overnight.headline);
      headline.style.cssText = `font:700 15px ${TYPE.heading}`;
      overnight.body.append(headline);
      for (const group of sheet.overnight.groups) {
        const block = el(doc, 'div');
        const caption = el(doc, 'div', undefined, group.caption);
        caption.style.cssText = EYEBROW;
        block.append(caption);
        const list = el(doc, 'div');
        list.style.cssText = 'display:grid;gap:4px;margin-top:6px';
        for (const entry of group.rows) {
          const row = el(doc, 'div', 'everyday-report-overnight-row');
          row.style.cssText = `display:flex;justify-content:space-between;gap:12px;${BODY}`;
          const label = el(doc, 'span', undefined, entry.label);
          const value = el(doc, 'span', undefined, entry.value);
          value.style.cssText = MONO(12.5, C.ink);
          row.append(label, value);
          list.append(row);
        }
        block.append(list);
        overnight.body.append(block);
      }
      for (const withheld of sheet.overnight.withheld) {
        const note = el(doc, 'p', 'everyday-report-overnight-withheld', withheld);
        note.style.cssText = `${QUIET};margin:0;color:${C.terracotta}`;
        overnight.body.append(note);
      }
      root.append(overnight.root);
    }

    /* ---- the closing honesty block ---- */
    const honesty = el(doc, 'div', 'everyday-report-honesty');
    honesty.style.cssText = `${CARD};margin-top:26px;background:${C.cardSunk}`;
    const honestyTitle = el(doc, 'div', undefined, view.honesty.title);
    honestyTitle.style.cssText = `font:700 16px ${TYPE.heading}`;
    honesty.append(honestyTitle);
    for (const part of view.honesty.parts) honesty.append(honestyPart(part));
    if (view.honesty.pointer !== undefined) {
      const pointer = el(doc, 'p', 'everyday-report-pointer', view.honesty.pointer.why);
      pointer.style.cssText = `${QUIET};margin:8px 0 0;max-width:74ch`;
      honesty.append(pointer);
    }
    root.append(honesty);

    /* ---- one button into tomorrow ---- */
    if (view.tomorrow !== undefined) {
      const onward = el(doc, 'div');
      onward.style.cssText = 'margin-top:20px;display:flex;align-items:center;gap:13px;flex-wrap:wrap';
      const button = el(doc, 'button', 'everyday-report-tomorrow', view.tomorrow.label);
      button.type = 'button';
      button.style.cssText = [
        'cursor:pointer',
        'border:0',
        `border-radius:${String(R.pill)}px`,
        `background:${C.sun}`,
        `color:${C.ink}`,
        'padding:11px 20px',
        'font-size:14px',
        'font-weight:600',
      ].join(';');
      button.addEventListener('click', () => {
        context.host.openTomorrow();
        context.go('brief');
      });
      const note = el(doc, 'span', undefined, view.tomorrow.note);
      note.style.cssText = QUIET;
      onward.append(button, note);
      root.append(onward);
    }
  }

  /** One paragraph of the closing block, styled the one way every paragraph in it is styled. */
  function smallPrintParagraph(text: string): HTMLElement {
    const node = el(doc, 'p', 'everyday-report-smallprint', text);
    node.style.cssText = `${BODY};margin:8px 0 0;max-width:74ch`;
    return node;
  }

  /**
   * One layer of § 6.5's closing block — issue #211.
   *
   * A `fold` is a native `<details>`, for two properties this screen would otherwise have to build
   * and get wrong: its content is **in the document whether or not it is open**, which is what
   * *every claim remains reachable* means for a reader searching the page or listening to it, and
   * it opens on <kbd>Enter</kbd> as well as on a click. The handle keeps the paragraph class as
   * well as its own, so a selector that reads the block's prose finds all of it.
   *
   * No `open` attribute is set: the fold is closed on arrival, which is the whole of the fix. The
   * part that must be read without a press is the `open` part, and `reportView.ts` decides which
   * one that is.
   */
  function honestyPart(part: HonestyPart): HTMLElement {
    if (part.kind === 'open') return smallPrintParagraph(part.text);
    const fold = el(doc, 'details', 'everyday-report-smallprint-more');
    fold.style.cssText = 'margin:8px 0 0';
    const handle = el(
      doc,
      'summary',
      'everyday-report-smallprint everyday-report-smallprint-handle',
      part.handle,
    );
    handle.style.cssText = `${BODY};margin:0;max-width:74ch;cursor:pointer`;
    fold.append(handle);
    for (const paragraph of part.paragraphs) fold.append(smallPrintParagraph(paragraph));
    return fold;
  }

  /** *What moved since the run before this one* — rows, refusal and note, in that order. */
  function deltaBlock(delta: NonNullable<ReportView['delta']>): HTMLElement {
    const block = section(doc, delta.caption);
    block.body.className = 'everyday-report-delta';
    block.body.style.cssText = `${CARD};display:grid;gap:9px`;
    for (const row of delta.selection) block.body.append(deltaRow(row, 'selection'));
    for (const row of delta.figures) block.body.append(deltaRow(row, 'figure'));
    const note = el(doc, 'p', 'everyday-report-delta-note', delta.note);
    note.style.cssText = `${QUIET};margin:0;max-width:74ch${delta.refused === null ? '' : `;color:${C.terracotta}`}`;
    block.body.append(note);
    return block.root;
  }

  /**
   * One `before → after` pair, with each side's own count under it.
   *
   * The counts are two, not one, and they are glued to the value each is the denominator of —
   * `DeltaRowView`'s own argument: the two values are means of different runs over different
   * cohorts, so one `n` under both would be a claim neither sheet made. A `null` count draws
   * nothing at all, which is what a refused mean and a plain observation both are.
   */
  function deltaRow(row: DeltaRowView, kind: 'selection' | 'figure'): HTMLElement {
    const node = el(doc, 'div', `everyday-report-delta-${kind}`);
    node.style.cssText = `display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:11px;align-items:start;padding-bottom:8px;border-bottom:1px solid ${C.ruleLight}`;
    const label = el(doc, 'span', undefined, row.label);
    label.style.cssText = EYEBROW;
    node.append(label, side(row.before, row.beforeCount, 'was'), side(row.after, row.afterCount, 'now'));
    return node;
  }

  function side(value: string, count: string | null, when: string): HTMLElement {
    const cell = el(doc, 'div');
    cell.style.cssText = 'min-width:0';
    const eyebrow = el(doc, 'div', undefined, when);
    eyebrow.style.cssText = MONO(10, C.faint);
    const figure = el(doc, 'div', 'everyday-report-delta-value', value);
    figure.style.cssText = MONO(14, value === 'withheld' ? C.terracotta : C.ink);
    cell.append(eyebrow, figure);
    if (count !== null) {
      const denominator = el(doc, 'div', 'everyday-report-delta-count', count);
      denominator.style.cssText = `${QUIET};font-size:11px;margin-top:2px`;
      cell.append(denominator);
    }
    return cell;
  }

  render();
  const stopListening = context.host.subscribe(render);

  return {
    unmount: () => {
      alive = false;
      reportBuildingName = undefined;
      stopListening();
    },
    /* § 3.3's daily report primary is `Your week` — the quiet button, since a report inverts. */
    primary: () => {
      context.go('week');
    },
  };
}

/** The registry row — GAMEPLAY § 6.5's screen, mounted by `shell.ts` through `screens.ts`. */
/**
 * The open campaign tower's name, for § 3.3's `Back to ⟨building⟩` primary.
 *
 * Module scope for the reason `briefScreen.ts` and `fixitScreen.ts` keep theirs there: `bar()` is
 * called by the shell outside the mount closure, with only the screen's state.
 */
let reportBuildingName: string | undefined;

/**
 * § 3.3's report row with the campaign primary's `⟨building⟩` substituted.
 *
 * The daily row carries no marker and comes back untouched. Found by `screens.test.ts`'s
 * registry-wide placeholder guard, which was written after the brief drew `Running the lifts:
 * ⟨style⟩` to a deployed page — this is the third cell the same run turned up, and the reason that
 * guard walks every screen in every run context rather than the one that was reported.
 */
function reportBar(state: EverydayState): ActionBarModel {
  const base = actionBarFor(state);
  if (!base.primary.label.includes('⟨')) return base;
  return {
    ...base,
    primary: {
      ...base.primary,
      label: base.primary.label.replace('⟨building⟩', reportBuildingName ?? 'the building'),
    },
  };
}

export const REPORT_SCREEN: EverydayScreenModule = {
  key: 'report',
  mount: mountReportScreen,
  bar: reportBar,
};
