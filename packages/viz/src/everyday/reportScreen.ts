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

import { PRESS_CALL_AGAIN, PRESS_CALL_ROW_ID } from '../shift/callRow.js';
import type { TabName } from '../dev/elementMap.js';
import type { DeltaRowView, ReportView } from '../dev/reportPanel.js';
import {
  LEVER_SURFACES,
  NOTHING_FILED_YET,
  rotatedOn,
  type SheetContinuity,
} from '../dev/reportPanel.js';

import {
  FIGURE_NOTE_HANDLE,
  everydayReportViewOf,
  figureNotePartsOf,
  type EverydayReportCareer,
  type EverydayReportView,
  type HonestyPart,
} from './reportView.js';
import { openTowerOf } from '../campaign/career.js';
/* GitHub issue #577: `fileDay`'s twenty-day month, read rather than restated. */
import { CONTRACT_DAYS } from '../campaign/economy.js';
import { everydayAccount, onEverydayAccount } from './accountPort.js';
import { postRunViewOf } from './postRun.js';
import { RUSH_POST_COPY, rushPostViewOf } from './rushPost.js';
import type { EverydayPostOutcome, EverydayRushPostOutcome } from './host.js';
import { actionBarFor, type ActionBarModel } from './actionBar.js';
import type { EverydayScreenModule } from './screens.js';
/* GitHub issue #340: beat 5's event and the refusal counter. A no-op without consent. */
import { everydayTelemetry } from './telemetryPort.js';
import type { ShapedDayReport } from '../shift/report.js';
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
import { RUSH_RESULT_EMPTY_LEDE, rushOutcomeOf, rushResultViewOf } from './rush.js';
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
 * The last report whose verdict was filed as drawn — GitHub issue #340, `docs/26` § 7.2 E6.
 *
 * Module scope beside {@link continuity}, for that constant's own reason and one of its own: this
 * screen is mounted and unmounted every time a player walks away and back, and the verdict they are
 * looking at on the second visit is the one they were looking at on the first. A new run replaces
 * the object, which is the signal — the same `!==` the shell watches a recording by.
 */
let verdictFiled: ShapedDayReport | undefined;

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
  /**
   * The last press's answer, and whether one is in flight — GitHub issue #221.
   *
   * Mount state rather than `ViewerState`, on the same rule `continuity` above is held under: the
   * answer is about *this reading of this sheet*, not about the run. Navigating away and back asks
   * again, which is right — a *posted* line surviving a walk to the week would be a claim about a
   * request that happened in a session the player has left behind.
   */
  let postOutcome: EverydayPostOutcome | undefined;
  let posting = false;
  /**
   * The block on the page, so a press and an account change can repaint it alone.
   *
   * `undefined` until {@link drawSheet} has drawn one, and left standing when the sheet is redrawn
   * because {@link drawSheet} always assigns it — a stale reference would repaint into a node the
   * document no longer holds, which is a silent no-op and the worst shape of failure here.
   */
  let postBlock: HTMLElement | undefined;
  /**
   * The rush sitting's own three, kept apart from the day's — GitHub issue #372.
   *
   * Separate state rather than a shared flag, because the two blocks are never on the page at once
   * and are about different things: `postOutcome` is *this reading of this sheet*, and this is
   * *this sitting*. Sharing them would have a refusal from a day's post drawn over a sitting.
   */
  let rushPostOutcome:
    | {
        /**
         * How many rounds the sitting held when this answer was given.
         *
         * **The answer goes stale the moment a round joins**, and the count is what says so. A
         * player who posts a one-round sitting and then plays another would otherwise read *"the
         * server replayed every round of this sitting and they reproduced"* over a sitting one
         * round longer than the one that was replayed, with the new round carrying no purse beside
         * two that do — a sentence about a thing that is no longer on screen, which is the
         * stale-surface class this shell keeps a register for.
         */
        readonly forRounds: number;
        readonly answer: EverydayRushPostOutcome;
      }
    | undefined;
  let rushPosting = false;
  let rushPostBlock: HTMLElement | undefined;

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
      career: careerOnwardOf(),
    });
  }

  /**
   * The career behind this sheet, or `undefined` — GitHub issue **#577**,
   * [§ D899](../../../../DECISIONS.md), and the run context is the whole of the gate.
   *
   * `context.ctx` rather than *is a career open?*, because a career is open while a player plays
   * the daily loop and this sheet would otherwise offer a contract's day at the end of somebody
   * else's morning. It is the same discriminator {@link mountReportScreen}'s `primary` already
   * uses to pick between `building` and `week`, for the reason recorded there: § 3.3's own row is
   * where the pairing lives, so a sixth run context answers by being in that table.
   */
  function careerOnwardOf(): EverydayReportCareer | undefined {
    if (context.ctx !== 'campaign') return undefined;
    const tower = openTowerOf(context.host.campaign());
    if (tower === undefined) return undefined;
    const name = context.host.buildingById(tower.buildingId)?.name;
    if (name === undefined) return undefined;
    return {
      buildingName: name,
      day: tower.day,
      /*
       * `fileDay`'s own refusal, read the way that function states it: `tower.day` runs 1…
       * `CONTRACT_DAYS` while the contract does and reaches `CONTRACT_DAYS + 1` when the last day
       * is filed. Past that the next press is § 8.9's renewal, which lives on the desk.
       */
      canRunAnother: tower.day <= CONTRACT_DAYS,
    };
  }

  function render(): void {
    if (!alive) return;
    // What § 3.3's campaign primary names — see {@link reportBuildingName}.
    const open = openTowerOf(context.host.campaign());
    reportBuildingName =
      open === undefined ? undefined : context.host.buildingById(open.buildingId)?.name;
    /*
     * The post block goes with the children on every path — cleared here rather than beside each
     * `replaceChildren`, so a future early return cannot leave the reference pointing at a node the
     * document has dropped. `drawSheet` assigns a fresh one; every other path leaves it `undefined`
     * and `repaintPostBlock` is then a no-op rather than a write nobody sees.
     */
    postBlock = undefined;
    /*
     * And the rush's, for exactly the same reason one screen over — GitHub issue #372.
     * `drawRushResult` assigns a fresh one on the path that draws it; every other path leaves it
     * `undefined`, so a repaint on a screen that is not the rush's result is a no-op rather than a
     * `replaceWith` on a node the document has dropped, which is the silent failure this pair is
     * cleared here to avoid.
     */
    rushPostBlock = undefined;
    /* § 9.3: the rush's result is its own screen and never falls through to the day's sheet. */
    if (context.ctx === 'rush') {
      root.replaceChildren();
      drawRushResult();
      return;
    }
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

  /** § 9.3's result — `everyday/rush.ts#rushResultViewOf`, drawn and not decided here. */
  function drawRushResult(): void {
    const recording = context.host.recording();
    const session = context.host.rush();
    if (recording === undefined || session === undefined) {
      const empty = el(doc, 'div', 'everyday-report-empty');
      const title = el(doc, 'h1', undefined, 'Nothing to report yet');
      title.style.cssText = `font-family:${TYPE.heading};font-size:30px;font-weight:700;margin:0`;
      const lede = el(doc, 'p', 'everyday-report-empty-lede', RUSH_RESULT_EMPTY_LEDE);
      lede.style.cssText = `${LEDE};margin:12px 0 0`;
      empty.append(title, lede);
      root.append(empty);
      return;
    }
    const view = rushResultViewOf(rushOutcomeOf(recording, session.endedAtS), session.disclosure);
    const block = el(doc, 'div', 'everyday-rush-result');
    block.dataset['outcome'] = view.outcome;
    const eyebrow = el(doc, 'div', 'everyday-report-meta', view.eyebrow);
    eyebrow.style.cssText = EYEBROW;
    const head = el(doc, 'h1', 'everyday-rush-result-head', view.head);
    head.style.cssText = `font-family:${TYPE.heading};font-size:34px;font-weight:700;letter-spacing:-.02em;margin:10px 0 0`;
    const lede = el(doc, 'p', 'everyday-rush-result-lede', view.lede);
    lede.style.cssText = `${LEDE};margin:12px 0 0`;
    block.append(eyebrow, head, lede);
    const account = el(doc, 'ol', 'everyday-rush-result-account');
    account.style.cssText = 'margin:18px 0 0;padding-left:22px;max-width:70ch';
    for (const beat of view.account) {
      const item = el(doc, 'li', 'everyday-rush-result-beat', beat);
      item.style.cssText = `${BODY};margin:6px 0`;
      account.append(item);
    }
    block.append(account);
    const grid = el(doc, 'div', 'everyday-rush-result-figures');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:22px';
    for (const figure of view.figures) {
      const cell = el(doc, 'div', 'everyday-rush-result-figure');
      cell.style.cssText = `border:1px solid ${C.ruleLight};border-radius:${String(R.card)}px;padding:12px`;
      const value = el(doc, 'div', 'everyday-rush-result-value', figure.value);
      value.style.cssText = `font:700 24px ${TYPE.heading}`;
      const label = el(doc, 'div', 'everyday-rush-result-label', figure.label);
      label.style.cssText = `${EYEBROW};margin-top:6px`;
      cell.append(value, label);
      if (figure.note !== undefined) {
        const note = el(doc, 'div', 'everyday-rush-result-note', figure.note);
        note.style.cssText = `font-size:12px;color:${C.warmGrey};margin-top:6px;line-height:1.4`;
        cell.append(note);
      }
      grid.append(cell);
    }
    block.append(grid);
    if (view.disclosure !== undefined) {
      const disclosure = el(doc, 'p', 'everyday-rush-result-disclosure', view.disclosure);
      disclosure.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.terracotta};margin:18px 0 0;max-width:70ch`;
      block.append(disclosure);
    }
    const footer = el(doc, 'p', 'everyday-rush-result-footer', view.footer);
    footer.style.cssText = `font-size:12px;color:${C.label};margin:18px 0 0`;
    block.append(footer);
    root.append(block);
    /*
     * § 2.3's postable result — GitHub issue #372. Under the sheet rather than inside it, on the
     * day report's own arrangement: the result is what the run was, and the sitting is what a
     * player may do about it.
     */
    rushPostBlock = drawRushPostBlock();
    root.append(rushPostBlock);
  }

  /**
   * The sitting's round list and its post block — GitHub issue #372's fourth criterion.
   *
   * **This is `EverydayHost.postRushSitting`'s non-test caller**, and `drawPostBlock`'s twin in
   * every respect that matters: every sentence and every enabled/disabled decision is
   * `everyday/rushPost.ts`'s, this function owns the press, the in-flight flag and the redraw, and
   * the account is read through `everyday/accountPort.ts` rather than through the host for the
   * reason that port exists — the host's `onChange` is drained by `renderAll()` and no account path
   * calls it, so a block that learned about signing in through the host would draw *sign in to
   * post* at a player who just did.
   */
  function drawRushPostBlock(): HTMLElement {
    const session = context.host.rush();
    const account = everydayAccount();
    const rounds = session?.rounds ?? [];
    const view = rushPostViewOf({
      rounds,
      // The sitting's own gate, taken from the host so the block and the press cannot disagree.
      check: session?.check ?? { ok: false, reasons: [RUSH_POST_COPY.noRounds] },
      hasServer: context.host.accountActions() !== undefined,
      signedIn: account?.token !== undefined,
      posting: rushPosting,
      // The last answer, and only while it is still about the sitting on screen — see `forRounds`.
      outcome: rushPostOutcome?.forRounds === rounds.length ? rushPostOutcome.answer : undefined,
    });
    const block = el(doc, 'section', 'everyday-rush-post');
    block.style.cssText = `${WELL};margin-top:20px;padding:16px 18px;border-radius:${String(R.card)}px`;
    const eyebrow = el(doc, 'p', 'everyday-post-eyebrow', view.eyebrow);
    eyebrow.style.cssText = `${EYEBROW};margin:0`;
    const roundsHeading = el(doc, 'p', 'everyday-rush-post-rounds-heading', view.roundsHeading);
    roundsHeading.style.cssText = `${EYEBROW};margin:14px 0 0`;
    block.append(eyebrow, roundsHeading);
    if (view.roundsEmpty !== undefined) {
      const empty = el(doc, 'p', 'everyday-rush-post-rounds-empty', view.roundsEmpty);
      empty.style.cssText = `${QUIET};margin:8px 0 0`;
      block.append(empty);
    }
    const list = el(doc, 'ol', 'everyday-rush-post-rounds');
    list.style.cssText = 'margin:8px 0 0;padding-left:22px;max-width:74ch';
    for (const round of view.rounds) {
      const item = el(doc, 'li', 'everyday-rush-post-round');
      item.style.cssText = `${BODY};margin:6px 0`;
      const label = el(doc, 'span', 'everyday-rush-post-round-label', round.label);
      label.style.cssText = 'font-weight:600';
      /*
       * One line per round, and the separators are drawn rather than spliced into a string: a
       * screen that joined these would hand the honesty sweep one seed where there are four claims,
       * and a violation could not say which of them was the one at fault.
       */
      item.append(label, el(doc, 'span', 'everyday-rush-post-round-driver', ` · ${round.driver}`));
      item.append(el(doc, 'span', 'everyday-rush-post-round-held', ` · ${round.held}`));
      item.append(el(doc, 'span', 'everyday-rush-post-round-presses', ` · ${round.presses}`));
      if (round.earned !== undefined) {
        const earned = el(doc, 'span', 'everyday-rush-post-round-earned', ` · ${round.earned}`);
        earned.style.cssText = `color:${C.label}`;
        item.append(earned);
      }
      if (round.refusal !== undefined) {
        const refusal = el(doc, 'p', 'everyday-rush-post-round-refusal', round.refusal);
        refusal.style.cssText = `${QUIET};margin:4px 0 0;color:${C.terracotta}`;
        item.append(refusal);
      }
      /*
       * **What was changed, when, and what the round did after it** — GitHub issue #565's third
       * defect, § D859. A nested list rather than more separators on the round's own line: these
       * are claims about *moments inside* the round, and hanging them off the same `·` chain as the
       * round's own three would read as four more facts about the whole of it.
       *
       * The note under them is drawn whenever there is a list and never otherwise, which is the
       * view's own `changesNote` arm — a caption over nothing is `docs/10` R3.
       */
      if (round.changes.length > 0) {
        const changes = el(doc, 'ul', 'everyday-rush-post-round-changes');
        changes.style.cssText = 'margin:4px 0 0;padding-left:18px;list-style:none';
        for (const change of round.changes) {
          const line = el(doc, 'li', 'everyday-rush-post-round-change', change);
          line.style.cssText = `${QUIET};margin:2px 0`;
          changes.append(line);
        }
        item.append(changes);
      }
      if (round.changesNote !== undefined) {
        const note = el(doc, 'p', 'everyday-rush-post-round-changes-note', round.changesNote);
        note.style.cssText = `${QUIET};margin:4px 0 0;max-width:74ch`;
        item.append(note);
      }
      list.append(item);
    }
    block.append(list);
    if (view.purseNote !== undefined) {
      const purse = el(doc, 'p', 'everyday-rush-post-purse-note', view.purseNote);
      purse.style.cssText = `${QUIET};margin:10px 0 0;max-width:74ch`;
      block.append(purse);
    }
    const button = el(doc, 'button', 'everyday-rush-post-go', view.label);
    button.type = 'button';
    button.disabled = !view.pressable;
    button.style.cssText = [
      view.pressable ? 'cursor:pointer' : 'cursor:default',
      'border:0',
      `border-radius:${String(R.pill)}px`,
      `background:${view.pressable ? C.sun : C.rule}`,
      `color:${C.ink}`,
      'padding:11px 20px',
      'font-size:14px',
      'font-weight:600',
      'margin:14px 0 0',
      view.pressable ? 'opacity:1' : 'opacity:0.55',
    ].join(';');
    button.addEventListener('click', () => {
      // Guarded as well as disabled, on `drawPostBlock`'s ground: a keyboard route into a handler
      // is what issue #21 found behind the Engineer surface's own posting row.
      if (!view.pressable || rushPosting) return;
      rushPosting = true;
      repaintRushPostBlock();
      const forRounds = rounds.length;
      void context.host
        .postRushSitting()
        .then((answer) => {
          rushPostOutcome = { forRounds, answer };
        })
        .catch((error: unknown) => {
          // A rejection is not a state the host promises — `drawPostBlock`'s own arm, and its
          // reason: carrying the message says the request did not complete instead of inventing a
          // reassuring sentence that would be a guess.
          rushPostOutcome = {
            forRounds,
            answer: { kind: 'failed', detail: error instanceof Error ? error.message : String(error) },
          };
        })
        .finally(() => {
          rushPosting = false;
          repaintRushPostBlock();
        });
    });
    block.append(button);
    /* `docs/36` AX-1/AX-16, § D593 — the day's post block's own treatment, for its own reason. */
    let reasonId: string | undefined;
    for (const [index, prose] of view.lines.entries()) {
      const node = el(doc, 'p', prose.className, prose.text);
      node.style.cssText = `${prose.role === 'reason' ? BODY : QUIET};margin:10px 0 0;max-width:74ch`;
      if (prose.role === 'reason' && reasonId === undefined) {
        reasonId = `everyday-rush-post-reason-${String(index)}`;
        node.id = reasonId;
      }
      block.append(node);
    }
    if (!view.pressable && reasonId !== undefined) button.setAttribute('aria-describedby', reasonId);
    return block;
  }

  /** {@link repaintPostBlock} for the rush's block. A no-op on every screen that has not drawn one. */
  function repaintRushPostBlock(): void {
    if (!alive || rushPostBlock === undefined) return;
    const next = drawRushPostBlock();
    rushPostBlock.replaceWith(next);
    rushPostBlock = next;
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
    /*
     * § 7.2 E6 and § 7.3 E9 — `verdict_shown` and `refusal_shown`, GitHub issue #340.
     *
     * **Emitted where the words are appended, and classified from the report rather than from the
     * view.** P-5: *"Every classification an event carries is read from the shipped surface's own
     * classification, not recomputed."* The view that reaches this function has already flattened
     * both classifications away — `ReportView` carries `verdictLine` and `verdictColour` but not
     * the `cleared | missed | ungraded` token, and `FigureView` carries a class list but not
     * `ReportFigure.tone` — so a line here that read the DOM's own classes would be recomputing a
     * classification from its presentation, which is the shape P-5 forbids. The report is asked
     * instead, and it is the same object this view was built from one function up.
     *
     * `verdict_shown`, not `verdict_read`: § 7.2 is explicit that whether a player read anything is
     * not observable and a field claiming it *"would be the first false thing in the schema"*. What
     * this says is that a verdict was drawn to a visible document.
     *
     * **Every figure's tone, including the ones that are not refusals.** § 7.3's question is *which
     * refusals do players actually meet*, and the honest denominator for that is every figure drawn
     * — a `withheld` count with no `plain` count beside it is a rate with no denominator. § D106's
     * `unranked` travels for the same reason and is emphatically not a refusal.
     */
    const drawn = context.host.lastReport();
    /*
     * **Once per report, by object identity** — and this guard is not optional bookkeeping.
     * `render()` is subscribed to every host notification, so an unguarded line here would emit a
     * verdict and every figure again on each one, filling a session's whole budget from one screen
     * and doing it while the player sat still. Identity is the right key rather than a boolean: a
     * new run produces a new report object, and § 7.5's own worked session shows **two**
     * `verdict_shown` events — the chain completes on the second, after the change — so a latch
     * that fired once per session would make `docs/26 K2` unmeasurable.
     *
     * Module scope, like the stage's own once-a-session latch and for the same reason: a player who
     * walks off the report and back is looking at the same drawn verdict.
     */
    if (drawn !== undefined && drawn !== verdictFiled) {
      verdictFiled = drawn;
      const telemetry = everydayTelemetry();
      telemetry.record({
        name: 'verdict_shown',
        verdictKind: drawn.verdict,
        refusalGround:
          drawn.figures.find((figure) => figure.suppressionGround !== undefined)?.suppressionGround ??
          null,
        screenKey: 'report',
      });
      for (const figure of drawn.figures) {
        telemetry.record({ name: 'refusal_shown', refusalKind: figure.tone, screenKey: 'report' });
      }
    }
    const lede = el(doc, 'p', 'everyday-report-lede', sheet.lede);
    lede.style.cssText = `${LEDE};margin:12px 0 0`;
    head.append(meta, title, verdict, lede);
    /*
     * § D1138 clause 4 — a practice close says so under the verdict, where the player reads whether
     * the day cleared, because *Shift cleared* on a practice run banks nothing.
     */
    if (view.practiceNote !== undefined) {
      const practice = el(doc, 'p', 'everyday-report-practice', view.practiceNote);
      practice.style.cssText = `${QUIET};margin:10px 0 0;max-width:74ch`;
      head.append(practice);
    }
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
    /* GitHub issue #211: a card's note leads with its first sentence and folds the rest. */
    for (const cell of sheet.figures) {
      const parts = figureNotePartsOf(cell.note);
      figures.body.append(
        figureCell(
          doc,
          cell,
          parts.rest === undefined ? undefined : { lead: parts.lead, rest: parts.rest, handle: FIGURE_NOTE_HANDLE },
        ),
      );
    }
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

    /*
     * ---- the beats ----
     *
     * § 6.5 calls this section *three beats* and the sheet has shipped **two** since issue #56 took
     * the methodology footnote out of it. A day the player pressed something on draws a third —
     * `shift/afterPress.ts`, GitHub issue #581 — so the count is the run's rather than the guide's,
     * and this loop has always drawn what the sheet holds. Nothing here decides how many there are.
     */
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
      /*
       * **Take this call again** — wave AI, [§ D1029](../../../../DECISIONS.md). Drawn exactly when
       * the sheet carries the call row, which `shift/callRow.ts` draws only for an admitted pinned
       * day played as measured; it re-opens that day from an explicitly empty record and hands the
       * player to the stage, where the call comes again.
       */
      if (drawn?.diagnosis.some((entry) => entry.id === PRESS_CALL_ROW_ID) === true) {
        const again = el(doc, 'div', 'everyday-report-call-again');
        again.style.cssText = `display:flex;align-items:center;gap:11px;flex-wrap:wrap`;
        const button = el(doc, 'button', 'everyday-report-call-again-press', PRESS_CALL_AGAIN.label);
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
        const note = el(doc, 'span', 'everyday-report-call-again-note', PRESS_CALL_AGAIN.note);
        note.style.cssText = QUIET;
        button.addEventListener('click', () => {
          const refused = context.host.takeCallAgain();
          if (refused === undefined) {
            context.go('stage');
            return;
          }
          note.textContent = refused;
        });
        again.append(button, note);
        beats.body.append(again);
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
        const route = lever.route;
        const goLabel = lever.goLabel;
        /*
         * The two are `undefined` together — `reportView.ts` decides both from one branch and
         * `reportView.test.ts` asserts the pairing. Read as a conjunction here rather than
         * asserted, because a screen that threw on the impossible arm would be a screen that goes
         * blank on a defect a note could survive.
         */
        if (route === undefined || goLabel === undefined) {
          const note = el(doc, 'p', 'everyday-report-lever-note', lever.noSurfaceNote ?? '');
          note.style.cssText = `${QUIET};margin:0;color:${C.terracotta}`;
          card.append(note);
        } else if (route.kind === 'everyday') {
          /*
           * GitHub issue #213, the owner's ruling: the lever opens the Everyday screen that carries
           * it out, inside this shell, so the loop stands behind it. The caveat beside a dispatcher
           * lever's button is the statistical honesty the old refusal carried, kept on the card.
           */
          if (lever.caveat !== undefined) {
            const caveat = el(doc, 'p', 'everyday-report-lever-caveat', lever.caveat);
            caveat.style.cssText = `${QUIET};margin:0;color:${C.terracotta}`;
            card.append(caveat);
          }
          const button = el(doc, 'button', 'everyday-report-lever-go', goLabel);
          button.type = 'button';
          button.dataset['screen'] = route.screen;
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
            context.go(route.screen);
          });
          card.append(button);
        } else {
          const surface = route.tab;
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

    /* ---- put it on the board — GitHub issue #221 ---- */
    postBlock = drawPostBlock();
    root.append(postBlock);

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
      /*
       * **Two destinations, keyed on the step's own discriminator** — GitHub issue #577.
       *
       * This handler was `openTomorrow()` and `go('brief')` unconditionally, on a sheet whose
       * label already said *Open the doors on Tuesday* at the end of a **career** day. Both halves
       * of that press are § 6's: `openTomorrow` advances `ViewerState.week` and clears the
       * campaign latch by name (`host.ts`' own comment — *§ 6's tomorrow, for the same reason
       * `startRun` clears it*), and `brief` has no campaign row in § 3.3's table, so the bar fell
       * back to the daily one. The career kept its `ctx` and lost every affordance that said so.
       *
       * The career arm is the **same** pair of calls the contract sheet's own primary makes
       * (`campaignScreens.ts`), rather than a second way to start a career day: one run press per
       * flow, so a day started here and a day started at the desk cannot differ.
       */
      const step = view.tomorrow;
      button.addEventListener('click', () => {
        if (step.goes === 'career-day') {
          const tower = openTowerOf(context.host.campaign());
          if (tower === undefined) return;
          context.host.runCampaignDay(tower.id);
          context.go('stage');
          return;
        }
        context.host.openTomorrow();
        context.go('brief');
      });
      const note = el(doc, 'span', undefined, view.tomorrow.note);
      note.style.cssText = QUIET;
      onward.append(button, note);
      root.append(onward);
    }
  }

  /**
   * § 14's board, reached from the day that earned a row — GitHub issue #221's first criterion,
   * *"a completed run can be posted from the player-facing shell"*.
   *
   * **This is `EverydayHost.postRun`'s non-test caller**, and it is the whole of the reason that
   * seam exists. Every sentence and every enabled/disabled decision is `postRun.ts`'s; this function
   * draws them and owns the press, the in-flight flag and the redraw.
   *
   * The account is read through `everyday/accountPort.ts` rather than through the host, for the
   * reason that port was built: the host's `onChange` is drained by `renderAll()` and no account
   * path calls it, so a block that learned about signing in through the host would draw *sign in to
   * post* at a player who just did. It subscribes on mount and repaints **this block only** — the
   * report screen has no focused field of its own here, and a whole-screen redraw on a
   * notification is the press-swallowing defect issue #106 documents.
   */
  function drawPostBlock(): HTMLElement {
    const account = everydayAccount();
    const view = postRunViewOf({
      hasRun: context.host.recording() !== undefined,
      // The binding, not a guess: `accountActions()` is `undefined` on exactly the builds served
      // with no API origin, which is the same condition the post binding is absent under.
      hasServer: context.host.accountActions() !== undefined,
      signedIn: account?.token !== undefined,
      posting,
      outcome: postOutcome,
    });
    const block = el(doc, 'section', 'everyday-post');
    block.style.cssText = `${WELL};margin-top:20px;padding:16px 18px;border-radius:${String(R.card)}px`;
    const eyebrow = el(doc, 'p', 'everyday-post-eyebrow', view.eyebrow);
    eyebrow.style.cssText = `${EYEBROW};margin:0`;
    const button = el(doc, 'button', 'everyday-post-go', view.label);
    button.type = 'button';
    button.disabled = !view.pressable;
    button.style.cssText = [
      view.pressable ? 'cursor:pointer' : 'cursor:default',
      'border:0',
      `border-radius:${String(R.pill)}px`,
      `background:${view.pressable ? C.sun : C.rule}`,
      `color:${C.ink}`,
      'padding:11px 20px',
      'font-size:14px',
      'font-weight:600',
      'margin:12px 0 0',
      view.pressable ? 'opacity:1' : 'opacity:0.55',
    ].join(';');
    button.addEventListener('click', () => {
      // Guarded as well as disabled: `postRun.ts` says why both exist, and a keyboard route into a
      // handler is exactly what issue #21 found behind the Engineer surface's own posting row.
      if (!view.pressable || posting) return;
      posting = true;
      repaintPostBlock();
      void context.host
        .postRun()
        .then((outcome) => {
          postOutcome = outcome;
        })
        .catch((error: unknown) => {
          /*
           * A rejection is not a state the host promises, and the honest thing to draw for one is
           * *the request did not complete* rather than nothing. `menu/client.ts` turns every
           * transport failure into a `Failure`, so reaching here means a defect rather than a
           * network — which is why the message is carried instead of being replaced with a
           * reassuring sentence that would be a guess.
           */
          postOutcome = {
            kind: 'failed',
            detail: error instanceof Error ? error.message : String(error),
          };
        })
        .finally(() => {
          posting = false;
          repaintPostBlock();
        });
    });
    block.append(eyebrow, button);
    /**
     * **A refused press says why to a reader who cannot see the paragraph under it** — `docs/36`
     * `AX-1`/`AX-16`, GitHub issue #406, [§ D593](../../../../DECISIONS.md).
     *
     * `postRun.ts` already guarantees the sentence exists — *"`false` is always accompanied by a
     * `reason` line"* — and the accessibility-tree walkthrough found the other half missing: the
     * button announced as *"Post this run, button, dimmed"* with no description at all, because the
     * reason is a sibling paragraph and a sibling names nothing. This is the same defect the
     * Workshop's eleven inert controls carry, on the loudest disabled control in the product.
     *
     * `aria-describedby` at the node already drawn, never a second copy of the words: no
     * player-facing string is added, and the description a reader hears is by construction the
     * sentence a sighted player reads. Attached only where there **is** a refusal — a pressable
     * button describing itself with a note would be noise, and `postRun.ts`'s `role` field is
     * already the distinction between *this is why you cannot* and *this is what will happen*.
     */
    let reasonId: string | undefined;
    for (const [index, prose] of view.lines.entries()) {
      const node = el(doc, 'p', prose.className, prose.text);
      node.style.cssText = `${prose.role === 'reason' ? BODY : QUIET};margin:10px 0 0;max-width:74ch`;
      if (prose.role === 'reason' && reasonId === undefined) {
        reasonId = `everyday-post-reason-${String(index)}`;
        node.id = reasonId;
      }
      block.append(node);
    }
    if (!view.pressable && reasonId !== undefined) button.setAttribute('aria-describedby', reasonId);
    return block;
  }

  /**
   * Redraw **the post block and nothing else** — `everyday/accountPort.ts`'s own instruction to a
   * listener, and the same rule applied to this block's own press.
   *
   * A full `render()` would rebuild the sheet, which costs two things this screen would rather keep:
   * `viewNow()` rotates the sheet continuity, and every `<details>` fold a reader has opened closes.
   * Neither is a consequence of somebody signing in, or of a run being posted, so neither should
   * follow from one — which is issue #106's *"a press swallowed mid-`mousedown`, and focus taken off
   * whatever the reader was on"* said about a fold instead of a field.
   *
   * A no-op when there is no block, which is every state that returns before {@link drawSheet} —
   * an empty report, and the rush's own result screen.
   */
  function repaintPostBlock(): void {
    if (!alive || postBlock === undefined) return;
    const next = drawPostBlock();
    postBlock.replaceWith(next);
    postBlock = next;
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

  /**
   * **Focus lands on the sheet when it has nowhere else to be** — wave AL, lane AL-A, the post-AK
   * panel's seat B (D8). *Close the day* is the bar's primary, the shell redraws the bar on the way
   * here, and the pressed button goes with it; so a keyboard player's focus fell to the page body
   * and the next Tab started from the top of the document. Only a lost focus is moved: a press that
   * left focus somewhere on the page keeps it there, which is `docs/36` `AX-12`'s *never because
   * of the render loop*.
   */
  function keepFocus(): void {
    const active = doc.activeElement;
    if (active !== null && active !== doc.body) return;
    const heading = root.querySelector<HTMLElement>('h1');
    if (heading === null) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  render();
  keepFocus();
  const stopListening = context.host.subscribe(() => {
    render();
    keepFocus();
  });
  /*
   * The account, heard on its own channel — `everyday/accountPort.ts`. The host's `onChange` is
   * drained by `renderAll()` and no account path calls it, so signing in on the settings screen and
   * walking back here would otherwise leave the post block still saying *sign in to post*.
   */
  const stopAccount = onEverydayAccount(() => {
    /*
     * Both blocks, and each is a no-op when its own node is not on the page — the day's sheet and
     * the rush's result are never drawn at once. Naming both here rather than picking one is what
     * keeps the rush's *sign in to post* from surviving a sign-in, which is the whole reason this
     * subscription exists.
     */
    repaintPostBlock();
    repaintRushPostBlock();
  });

  return {
    unmount: () => {
      alive = false;
      reportBuildingName = undefined;
      stopListening();
      stopAccount();
    },
    /**
     * § 3.3's report primary — `Your week` in the daily flow, and the campaign's is its **own**.
     *
     * This was `context.go('week')` unconditionally, under a label that already read
     * `Back to ⟨building⟩` in a campaign run ({@link reportBar} substitutes the name into it). So
     * the one button that carries § 8's progression named the tower and opened somebody else's
     * record: a player who had just had a day marked on their contract was sent to the daily
     * loop's seven-day strip, which knows nothing about it. Found while wiring issue #223, which is
     * the issue that gave the press something to go back *to*.
     *
     * `ctx` rather than the label, because the label is a rendering of this decision and reading it
     * back would make the destination depend on a string. § 3.3's own row is where the pairing
     * lives (`actionBar.ts` gives the campaign report row `wayOut: '⤺ All buildings'` and this
     * primary), so a fifth run context answers by being in that table.
     */
    primary: () => {
      /* § 9.3's *Run the rush again* — the same waves, asked for again, and back onto the stage. */
      if (context.ctx === 'rush') {
        if (context.host.startRush() === undefined) context.go('stage');
        return;
      }
      /* § 6.1's replay ends at the door it started from; `go` puts the parked week back on the way. */
      if (context.ctx === 'replay') {
        context.go('door');
        return;
      }
      context.go(context.ctx === 'campaign' ? 'building' : 'week');
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
