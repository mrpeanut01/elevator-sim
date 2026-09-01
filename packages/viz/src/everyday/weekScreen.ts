/**
 * **Your week** — GAMEPLAY § 14, the DOM half. Every word and every withheld state is
 * `weekView.ts`'s; this file draws them.
 *
 * The screen is § 14's *Your week* tab. Its sibling tab — Today's board and the dispatcher ladder
 * — is a separate registered key (`board`) which `screens.ts` refuses, so this screen states the
 * board's **relationship** to the week rather than drawing an empty one: what a board would be
 * keyed on, why rows have to be comparable, and the refusal in that table's own words. That is the
 * same shape `settingsView.ts` uses for its own absent rows and `everyday/shell.ts` for the shell's
 * — a register a reader with a mouse can actually read.
 *
 * Two absences are drawn in two places on purpose, and `weekView.ts`'s docstring is the argument:
 * *today is not closed* is a fact about your own run and sits on today's card and the percentile
 * line; *the world is unreachable* is a fact about other players and sits in its own band. A
 * screen that merged them would tell each reader the other one's story.
 *
 * ## § 14.1's rows, and why they are on this screen
 *
 * GitHub issue **#182**, [§ D436](../../../../DECISIONS.md). § 14.1 opens *"A board row is a run,
 * and a run can be watched"*, and the board's rows are the one thing this build genuinely cannot
 * have — a ranking of other people's runs needs a server to post and verify them, which is the
 * refusal the block above this one already draws. What it **does** have is two other sources of
 * runs, and they were reachable from the Engineer shell alone: days this device filed, and the
 * reference runs `data/reference-runs.json` ships.
 *
 * So the picker sits directly under that refusal, which is where a reader's next question is. It is
 * a section of this screen rather than a screen of its own because § 4's inventory has seventeen
 * keys and none of them is a spectator picker: adding an eighteenth would be adding a screen the
 * guide does not contain, and the alternative — an overlay, which is what the Engineer shell uses —
 * is the thing § 3.1 gives this shell one screen region instead of.
 *
 * Every word in it is `everyday/watchStage.ts`' or `watch/`'s; this file draws them and forwards the
 * press. The press is two calls in a fixed order — `host.watchRun(row)` first, and
 * `context.enterWatch()` only if the row comes back unblocked — because § 1.5 refuses to replay
 * something approximate and a shell that entered the spectator context on a refused row would be
 * drawing a stranger's chrome over the player's own day.
 */

import type { ActionBarModel } from './actionBar.js';
import { actionBarFor } from './actionBar.js';
import { weekScreenViewOf, type WeekDayCard, type WeekScreenView } from './weekView.js';
import type { EverydayScreenModule } from './screens.js';
import {
  BODY,
  CARD,
  el,
  EYEBROW,
  LEDE,
  MONO,
  QUIET,
  section,
  unavailableBand,
  WELL,
} from './screenDom.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import type { EverydayState } from './types.js';
import {
  NOTHING_TO_WATCH,
  WATCH_IT_LABEL,
  WATCH_ROWS_HEADING,
  WATCH_ROWS_LEDE,
  WATCH_ROWS_LOADING,
} from './watchStage.js';
import type { WatchableRun } from '../watch/types.js';
import { REFERENCE_RUN_LINE } from '../watch/view.js';

/**
 * Whether the day standing on the stage has been filed, as the last render read it.
 *
 * Module state for `doorScreen.ts`'s reason: § 3.3's week row gives the primary two variants
 * (`Play today's tower` / `Replay today's tower`) and `bar(state)` is handed the shell's state
 * rather than the data host, so the fact that picks between them has to be somewhere the
 * refinement can see. Written on every render, so it is never older than the screen.
 */
let todayIsClosed = false;

/** A card's ink, by verdict. § 19's moss for cleared, alarm for missed, faint for unjudged. */
function inkFor(card: WeekDayCard): string {
  if (card.verdict === 'cleared') return C.moss;
  if (card.verdict === 'missed') return C.alarm;
  return C.faint;
}

function mountWeek(
  host: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let alive = true;

  /**
   * § 14.1's rows, once the fetch behind half of them has answered.
   *
   * `undefined` is *not asked yet*, which is a third state rather than an empty list and is why the
   * block draws {@link WATCH_ROWS_LOADING} rather than {@link NOTHING_TO_WATCH} while it holds:
   * *"there is nothing to watch"* and *"nobody has looked yet"* are a whole claim apart, and
   * `rail.ts#CAREER_PENDING` exists one file over for exactly this distinction.
   */
  let watchRows: readonly WatchableRun[] | undefined;

  /** A row the gate has since refused, by id — so the redraw shows the reason rather than the button. */
  const refused = new Map<string, WatchableRun>();

  const root = el(doc, 'div', 'everyday-week');
  root.style.cssText = 'max-width:900px';
  host.append(root);

  function viewNow(): WeekScreenView {
    const data = context.host;
    const dayClosed = data.runState().dayClosed;
    todayIsClosed = dayClosed;
    return weekScreenViewOf({
      week: data.week(),
      towerToday: data.resolvedBuilding()?.name ?? data.selection().buildingId,
      dayClosed,
      sheetStanding: data.lastReport() !== undefined,
    });
  }

  function render(): void {
    if (!alive) return;
    const view = viewNow();
    root.replaceChildren();

    /* ---- head ---- */
    const eyebrow = el(doc, 'div', undefined, view.eyebrow);
    eyebrow.style.cssText = EYEBROW;
    const title = el(doc, 'h1', 'everyday-week-title', view.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:34px;font-weight:700;letter-spacing:-.02em;margin:10px 0 0`;
    const streak = el(doc, 'div', 'everyday-week-streak', view.streakLine);
    streak.style.cssText = `${MONO(12.5, C.label)};margin-top:8px`;
    root.append(eyebrow, title, streak);

    /* ---- the seven cards ---- */
    const strip = el(doc, 'div', 'everyday-week-strip');
    strip.style.cssText = `display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:${String(GAP.row)}px;margin-top:22px`;
    for (const card of view.cards) {
      /*
       * A button exactly where the card opens something — see `WeekDayCard.readable`. A card that
       * is not readable stays a `div`, so there is no disabled-looking control to press and no
       * cursor promising one.
       */
      const node = el(doc, 'div', 'everyday-week-card');
      node.style.cssText = [
        'display:grid',
        'gap:4px',
        'padding:12px 11px',
        `border:1.5px solid ${card.isToday ? C.ink : C.ruleLight}`,
        `border-radius:${String(R.row)}px`,
        `background:${card.isToday ? C.amberWash : C.card}`,
        'min-width:0',
      ].join(';');
      const weekday = el(doc, 'div', 'everyday-week-card-day', card.weekday);
      weekday.style.cssText = MONO(10.5, C.label);
      const tower = el(doc, 'div', 'everyday-week-card-tower', card.tower);
      tower.style.cssText = `font-size:11px;color:${C.warmGrey};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
      const score = el(doc, 'div', 'everyday-week-card-score', card.score);
      score.style.cssText = MONO(19, inkFor(card));
      const note = el(doc, 'div', 'everyday-week-card-note', card.note);
      note.style.cssText = `font-size:10.5px;color:${C.faint}`;
      node.title = `${card.weekday} · ${card.tower} · ${card.note}`;
      node.append(weekday, tower, score, note);
      if (card.readable) {
        const open = el(doc, 'button', 'everyday-week-card-open', 'How it went ›');
        open.type = 'button';
        open.style.cssText = [
          'justify-self:start',
          'margin-top:4px',
          'cursor:pointer',
          'border:0',
          'background:transparent',
          'padding:0',
          `color:${C.terracotta}`,
          'font-size:11px',
          'text-decoration:underline',
        ].join(';');
        open.addEventListener('click', () => {
          context.go('report');
        });
        node.append(open);
      }
      strip.append(node);
    }
    root.append(strip);

    const tally = el(doc, 'p', 'everyday-week-tally', view.tally.line);
    tally.style.cssText = `${QUIET};margin:11px 0 0`;
    const readNote = el(doc, 'p', 'everyday-week-read-note', view.readNote);
    readNote.style.cssText = `${QUIET};margin:4px 0 0`;
    root.append(tally, readNote);

    /* ---- where you landed today: your own withheld state, not the world's ---- */
    const percentile = el(doc, 'div', 'everyday-week-percentile');
    percentile.style.cssText = `${WELL};margin-top:22px`;
    const percentileHeading = el(doc, 'div', undefined, view.percentile.heading);
    percentileHeading.style.cssText = EYEBROW;
    const percentileLine_ = el(doc, 'p', 'everyday-week-percentile-line', view.percentile.line);
    percentileLine_.style.cssText = `${BODY};margin:7px 0 0;max-width:74ch`;
    percentile.append(percentileHeading, percentileLine_);
    root.append(percentile);

    /* ---- the world's figures: the other withheld state, kept separate ---- */
    const world = section(doc, 'WHAT EVERYONE ELSE BROUGHT');
    world.body.append(unavailableBand(doc, view.world));
    const caption = el(doc, 'p', 'everyday-week-split-caption', view.splitCaption);
    caption.style.cssText = `${QUIET};margin:9px 0 0`;
    world.body.append(caption);
    root.append(world.root);

    /* ---- the board, and why it is not here ---- */
    const board = section(doc, view.board.heading);
    board.body.className = 'everyday-week-board';
    board.body.style.cssText = `${CARD};display:grid;gap:13px`;
    const refusal = el(doc, 'p', 'everyday-week-board-refusal', view.board.refusal);
    refusal.style.cssText = `${BODY};margin:0;color:${C.terracotta}`;
    board.body.append(refusal);
    for (const rule of view.board.rules) {
      const block = el(doc, 'div');
      const ruleTitle = el(doc, 'div', undefined, rule.title);
      ruleTitle.style.cssText = 'font-size:13.5px;font-weight:600';
      const ruleBody = el(doc, 'p', undefined, rule.body);
      ruleBody.style.cssText = `${QUIET};margin:4px 0 0;max-width:74ch`;
      block.append(ruleTitle, ruleBody);
      board.body.append(block);
    }
    root.append(board.root);

    /* ---- § 14.1's rows: what there is to watch, under why the board has none ---- */
    root.append(watchSection());
  }

  /**
   * The picker — § 14.1's rows, drawn from the host and pressed through it.
   *
   * Rebuilt on every render rather than kept, because `render` empties the root: the buttons are
   * re-created with it, which is safe here for the reason `dev/watchPanel.ts`' keying is *not* —
   * this screen redraws on host notifications, which are state changes, not at 60 Hz.
   */
  function watchSection(): HTMLElement {
    const block = section(doc, WATCH_ROWS_HEADING);
    block.body.className = 'everyday-week-watch';
    block.body.style.cssText = `${CARD};display:grid;gap:13px`;
    const lede = el(doc, 'p', 'everyday-week-watch-lede', WATCH_ROWS_LEDE);
    lede.style.cssText = `${QUIET};margin:0;max-width:74ch`;
    block.body.append(lede);
    if (watchRows === undefined) {
      const loading = el(doc, 'p', 'everyday-week-watch-status', WATCH_ROWS_LOADING);
      loading.style.cssText = `${QUIET};margin:0`;
      block.body.append(loading);
      return block.root;
    }
    const rows = watchRows.map((run) => refused.get(run.id) ?? run);
    if (rows.length === 0) {
      const empty = el(doc, 'p', 'everyday-week-watch-status', NOTHING_TO_WATCH);
      empty.style.cssText = `${QUIET};margin:0`;
      block.body.append(empty);
      return block.root;
    }
    for (const run of rows) block.body.append(watchRow(run));
    return block.root;
  }

  function watchRow(run: WatchableRun): HTMLElement {
    const row = el(doc, 'div', 'everyday-week-watch-row');
    row.style.cssText = [
      `border-top:1px solid ${C.ruleLight}`,
      'padding-top:11px',
      'display:flex',
      'align-items:flex-start',
      `gap:${String(GAP.row + 4)}px`,
    ].join(';');
    const text = el(doc, 'div');
    text.style.cssText = 'flex:1 1 auto;min-width:0';
    const label = el(doc, 'div', 'everyday-week-watch-label', run.label);
    label.style.cssText = 'font-size:14px;font-weight:600';
    const where = el(doc, 'div', undefined, `${run.buildingName} · ${run.subtitle}`);
    where.style.cssText = `${QUIET};margin-top:2px`;
    text.append(label, where);
    /*
     * § 20.11's line, on the row as well as on the header — `dev/watchPanel.ts` draws it in the same
     * two places for the same reason: a reader deciding what to press is exactly the reader who must
     * not mistake a fixture for a person. It is `watch/view.ts`'s constant, derived from
     * `run.source`, never typed here.
     */
    if (run.source === 'reference') {
      const fixture = el(doc, 'div', 'everyday-week-watch-source', REFERENCE_RUN_LINE);
      fixture.style.cssText = `${QUIET};color:${C.terracotta};margin-top:2px`;
      text.append(fixture);
    }
    if (run.blocked !== null) {
      const why = el(doc, 'p', 'everyday-week-watch-refusal', run.blocked.reason);
      why.style.cssText = `${QUIET};color:${C.terracotta};margin:6px 0 0;max-width:70ch`;
      text.append(why);
    }
    row.append(text);
    /*
     * § 1.5: *"a row that cannot be replayed loses its `Watch it` button rather than replaying
     * something approximate."* A disabled button would still be a button, and the sentence says it
     * loses it.
     */
    if (run.blocked === null) {
      const watch = el(doc, 'button', 'everyday-week-watch-open', WATCH_IT_LABEL);
      watch.type = 'button';
      watch.style.cssText = [
        'flex:none',
        'align-self:center',
        `background:${C.sun}`,
        `border:1px solid ${C.sun}`,
        `border-radius:${String(R.row)}px`,
        'padding:8px 15px',
        `color:${C.ink}`,
        'font-size:13px',
        'font-weight:600',
        'cursor:pointer',
      ].join(';');
      watch.addEventListener('click', () => {
        press(run);
      });
      row.append(watch);
    }
    return row;
  }

  /**
   * The press, in the one order that is safe.
   *
   * The gate runs first and its answer is read: `watchRun` re-simulates the record and enters the
   * spectator state **only** on an exact reproduction, so a row it hands back carrying `blocked` is
   * a row the shell must not navigate to. Recording the refusal by id is `dev/watchPanel.ts`'s own
   * arrangement — the row is redrawn with its reason and without its affordance, which is § 1.5's
   * outcome reached one interaction later than the ideal and stated rather than glossed.
   */
  function press(run: WatchableRun): void {
    const checked = context.host.watchRun(run);
    if (checked.blocked !== null) {
      refused.set(run.id, checked);
      render();
      return;
    }
    context.enterWatch();
  }

  render();
  const stopListening = context.host.subscribe(render);
  /*
   * The rows arrive after the first paint, because one of the two sources is a fetch. A failure
   * costs the reference rows and nothing else — `EverydayHost.watchableRuns` swallows it and answers
   * with the filed days — so there is no rejection arm here and none is missing.
   */
  void context.host.watchableRuns().then((rows) => {
    if (!alive) return;
    watchRows = rows;
    render();
  });

  return {
    unmount: () => {
      alive = false;
      stopListening();
    },
    /*
     * § 3.3's week primary — `Play today's tower` / `Replay today's tower`. Both are the front
     * door: the door is where a day is set up, and it is the screen that knows which of the two
     * sentences is true for the day standing selected. Sending the player anywhere else would make
     * the label a promise the destination does not keep (§ 16 rule 4).
     */
    primary: () => {
      context.go('door');
    },
  };
}

/**
 * The § 3.3 refinement — which of the week row's two primary variants is true right now.
 *
 * § 3.3 authors both (`['Play today's tower', 'Replay today's tower']`) and the frame's default is
 * the first. A day already closed is a *replay*, and a button saying *Play* over a day that has
 * been played is § 16 rule 4 in miniature — the destination does not contain the decision the
 * label describes.
 */
function weekBar(state: EverydayState): ActionBarModel {
  const base = actionBarFor(state);
  const label = base.primary.variants[todayIsClosed ? 1 : 0] ?? base.primary.label;
  return { ...base, primary: { ...base.primary, label } };
}

/** The registry row — GAMEPLAY § 14's *Your week*, mounted by `shell.ts` through `screens.ts`. */
export const WEEK_SCREEN: EverydayScreenModule = {
  key: 'week',
  mount: mountWeek,
  bar: weekBar,
};
