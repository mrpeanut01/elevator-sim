/**
 * **Watching somebody else's run — the mounted surface.** GAMEPLAY § 14.1 over `watch/`'s model.
 *
 * Recorded here rather than in `DECISIONS.md`, under § D405; `watch/`'s one ruling is § D407.
 *
 * ## Two things, and why they are one file
 *
 * The **picker** is an overlay on `menuRoot`'s and `dev/fixitPanel.ts`' precedent — built in
 * TypeScript, appended to `document.body`, so `index.html` and `elementMap.ts` are untouched. The
 * **spectator chrome** is not an overlay at all: § 14.1's whole point is that the differentiation
 * is *structural, not a caption*, so it inverts the shell's own header, puts a pill on the stage,
 * rewrites the rail subline and replaces the action bar. They are one module because they are one
 * state — a picker that could open while the chrome was up, or chrome that outlived the row it was
 * drawn from, is two answers to *whose day is on screen*.
 *
 * ## What this file decides: nothing
 *
 * Every word comes from `watch/view.ts`, every refusal from `watch/library.ts` or
 * `watch/reproduce.ts`, and the record→run derivation from `watch/record.ts`. This file draws them
 * and forwards presses. It is DOM-bound and therefore outside the honesty search's driven corpus;
 * the strings it prints are produced by modules that are in it.
 *
 * ## The gate runs on the press, not on the open — and the run is on a worker
 *
 * Checking every row would run one simulation per filed day to draw a list: seven on a full week.
 * So a row is offered provisionally and checked when it is pressed, and a row that fails the check
 * is redrawn **with its reason and without its affordance** rather than watched. That is § 1.5's
 * outcome reached one interaction later, and the trade is stated rather than glossed: the cost of
 * the earlier check is a list that takes seconds to appear, and the cost of this one is a press
 * that sometimes answers with a refusal.
 *
 * The two rows blocked *without* a simulation — a day with no record, a record this build cannot
 * read — are still marked on open, because neither needs one. That split is now
 * `watch/library.ts#watchGateBefore`'s, with `#watchGateAfter` reading the recording;
 * `#checkedRun` is the two composed and remains the whole gate for the caller that runs
 * synchronously.
 *
 * **This panel's run goes to `dev/shiftWorker.ts` through `dev/offThreadRuns.ts`** — GitHub issue
 * #165. The sentence that used to stand here put the run's cost at *"~0.2–1.5 s"* and it is
 * deleted rather than reworded, because a stated cost that has been paid is § D227's stale
 * refusal — and because it was measured on the cheap half of its own population. The two shipped
 * reference rows cost 6 ms and 150 ms, *under* the range claimed; but a picker row is a **filed
 * day**, which is whatever the player ran up to `menu/types.ts#LONGEST_OFFERED_RUN_S` on any tower
 * they have played, and `dev/measure.surfaceRuns.test.ts` measures a filed `vertical-city` day at
 * 7 200 s blocking this thread for **4 351 ms** — three times the stated ceiling, with 386 ms of
 * that being the recording's own clone. And that is a **floor** rather than a worst case: the same
 * tower at the same horizon under `constant-iso` is `dev/shiftRunner.ts`'s own 21–31 s, and a day
 * run that way is a day that can be filed.
 *
 * The busy state stays, because it is still honest: the pressed row's button reads
 * `Checking this day…` and goes inert while its run is out. It is new — the blocking version had
 * none and could have had none, since nothing could repaint while it ran.
 */

import type { VizRecording } from '../contract/types.js';
import { filedDayRuns, watchGateAfter, watchGateBefore } from '../watch/library.js';
import type { WatchableRun } from '../watch/types.js';
import { watchingViewOf, type WatchingView } from '../watch/view.js';

import type { BrowserResources } from './data.js';
import { el, fill } from './dom.js';
import { createOffThreadRunner } from './offThreadRuns.js';
import type { ShiftWorkerLike } from './shiftRunner.js';
import type { ViewerState } from './state.js';

export interface WatchPanelHost {
  readonly document: Document;
  readonly resources: BrowserResources;
  /** The live state — read at press time, never captured, so a stale snapshot cannot be replayed. */
  readonly stateNow: () => ViewerState;
  /** `data/reference-runs.json`, fetched and parsed once on first open — `dev/data.ts`. */
  readonly loadReferenceRuns: () => Promise<readonly WatchableRun[]>;
  /**
   * Start the worker the gate's run crosses to — `dev/offThreadRuns.ts`, GitHub issue #165.
   *
   * It replaced a `simulate: (config) => VizRecording` on this host, and the injection is kept for
   * that field's reason: `new Worker(new URL(…))` is a bundler seam and a DOM global, so a panel
   * that built one could not be driven without a document *or* a bundler. `watch/library.ts` stays
   * drivable under plain Node either way — its gate takes no simulator at all now, only the two
   * halves and the recording between them.
   */
  readonly spawnRunWorker: () => ShiftWorkerLike;
  readonly buildingNameOf: (buildingId: string) => string;
  readonly dispatcherNameOf: (dispatcherId: string) => string;
  /** The shell enters the spectator state. It owns the snapshot that `⤺ Stop watching` restores. */
  readonly onWatch: (run: WatchableRun, view: WatchingView, recording: VizRecording) => void;
  /** § 14.1's primary — drop the spectator state and open the same crowd to be played. */
  readonly onPlayThisCrowd: (run: WatchableRun) => void;
  readonly onStopWatching: () => void;
}

export interface WatchPanel {
  open(): void;
  close(): void;
  /**
   * Draw or clear the spectator chrome. `undefined` puts the shell back to its own colours.
   *
   * The view and the run it was drawn from arrive **together** rather than through two setters: a
   * chrome whose run could be set without its view is a chrome that can disagree with itself, and
   * `Play this crowd yourself` would then open a crowd other than the one on screen — the defect
   * § 14.1's own *"the primary is the conversion"* sentence is about.
   */
  showChrome(view: WatchingView | undefined, run?: WatchableRun): void;
  readonly root: HTMLElement;
  /** The strip the chrome lives in — held so the shell can assert it exists exactly while watching. */
  readonly chrome: HTMLElement;
}

/* -------------------------------------------------------------------------- *
 * Tokens
 *
 * Every colour this file writes is a CSS custom property **by name rather than by value** —
 * `dev/leftRail.ts`'s rule, and § D251's. These six were hex literals, and this panel writes them
 * into inline styles, which no `:root[data-theme]` block reaches: six dark-overlay colours that no
 * theme could repaint, inside a product whose page is now paper (`docs/21` § 2.2 (3) names them).
 *
 * {@link CHROME_BG} and {@link CHROME_INK} are the **inverted** pair — § 14.1's *"the single
 * strongest signal"*, a spectator strip drawn the other way up from the page. They are named for
 * that role rather than for a colour, which is why they are not `INK`/`PAPER` any more: on paper
 * the strip is light-on-dark and in the dark mode it is dark-on-light, and a constant called
 * `PAPER` holding `var(--bg)` would be a name that is false in one of the two modes. Inverting
 * through the two *ground* tokens keeps the contrast the page's own — `--text` on `--bg` is the
 * body pairing, read upside down.
 * -------------------------------------------------------------------------- */

const PANEL_BG = 'var(--bg)';
const CARD_BG = 'var(--card)';
/** The spectator strip's ground — the page's ink, so the strip reads as inverted in both modes. */
const CHROME_BG = 'var(--text)';
/** Everything written on that ground: the page's own ground colour, inverted with the strip. */
const CHROME_INK = 'var(--bg)';
const MUTED = 'var(--dim)';
/**
 * The spectator accent — the reference-run marks and the primary action.
 *
 * `--accent` rather than `--bad`: this is *the thing you are looking at*, which is what the shell
 * spends its accent on everywhere else (the primary Run control, the selected chip). The literal
 * it replaces was a terracotta, and guide § 19 does spend terracotta on *"your line, live
 * figures"* — but on this shell terracotta resolves to `--band-3`, and a spectator button in the
 * abandoned band's red would be a colour-coded alarm about a run that is fine.
 */
const ACCENT = 'var(--accent)';

/** The class the inverted header carries — `main.test.ts` asserts it appears exactly while watching. */
export const WATCHING_HEADER_CLASS = 'watching-header';

/**
 * A button with its handler attached.
 *
 * `dom.ts#el` deliberately has no `on` member — it makes elements and does not wire them — so the
 * listener is attached here. One helper rather than four repetitions, because a press that silently
 * lost its handler would look exactly like a control that does nothing, which is § D177's subject.
 */
function button(
  doc: Document,
  text: string,
  style: Readonly<Record<string, string>>,
  onClick: () => void,
  attrs?: Readonly<Record<string, string>>,
): HTMLButtonElement {
  const node = el(doc, 'button', { text, style, ...(attrs === undefined ? {} : { attrs }) });
  node.addEventListener('click', onClick);
  return node;
}

export function mountWatchPanel(host: WatchPanelHost): WatchPanel {
  const doc = host.document;

  /* --- the picker --------------------------------------------------------- */

  const root = el(doc, 'div', {
    className: 'watch-overlay',
    style: {
      position: 'fixed',
      inset: '0',
      display: 'none',
      'z-index': '40',
      background: PANEL_BG,
      color: 'var(--text)',
      overflow: 'auto',
      font: '14px/1.45 system-ui, sans-serif',
    },
  });
  doc.body.append(root);

  let references: readonly WatchableRun[] | undefined;
  let loadFailure: string | undefined;
  /** A row the gate has since refused, by id — so the redraw shows the reason rather than the button. */
  const refused = new Map<string, WatchableRun>();

  const runner = createOffThreadRunner({ spawn: host.spawnRunWorker });

  /**
   * The row whose gate run is out, by id — or `undefined`.
   *
   * The busy state a moved run makes possible **and** the guard a moved run makes necessary. A
   * synchronous gate could not be re-entered: the press blocked the thread and no second click
   * could be delivered. An asynchronous one can, so a second press on the same row is dropped, and
   * a press on a *different* row supersedes — `dev/offThreadRuns.ts` answers one ask and the loser
   * is silent, so the row this field names is the only one that can be watched.
   */
  let checking: string | undefined;

  const close = (): void => {
    root.style.display = 'none';
    /*
     * **A check the player walked away from is abandoned**, and this is a bug an asynchronous gate
     * creates rather than a tidiness. `settle()` on the passing path calls `host.onWatch`, which
     * puts the shell into the spectator state — so a run still in flight when the picker is
     * dismissed would, seconds later, drop the player into somebody else's day they had just
     * declined to watch. `dev/offThreadRuns.ts#cancel` is silent by construction, which is exactly
     * what is wanted here.
     *
     * It is a no-op on the passing path even though `settle` calls this: the runner clears its
     * current ask **before** handing the recordings on, so by the time `close` runs there is
     * nothing in flight to cancel. The busy row is redrawn by `open`, which draws on every show.
     */
    runner.cancel();
    checking = undefined;
  };

  doc.addEventListener('keydown', (event) => {
    // Escape closes, § D188's rule for every dismissable surface.
    if (event.key === 'Escape' && root.style.display !== 'none') close();
  });

  const open = (): void => {
    root.style.display = 'block';
    draw();
    if (references === undefined && loadFailure === undefined) {
      host
        .loadReferenceRuns()
        .then((runs) => {
          references = runs;
          draw();
        })
        .catch((error: unknown) => {
          loadFailure = error instanceof Error ? error.message : String(error);
          draw();
        });
    }
  };

  /**
   * The rows on offer — the player's filed days, then the shipped references.
   *
   * Filed days first because they are the ones the player has a reason to look at; the references
   * are what makes the surface reachable on a first visit, and a first visit has no filed days for
   * them to sit under.
   */
  function rows(): readonly WatchableRun[] {
    const state = host.stateNow();
    const filed = filedDayRuns([state.week, ...state.parkedWeeks], host.buildingNameOf);
    return [...filed, ...(references ?? [])].map((run) => refused.get(run.id) ?? run);
  }

  function draw(): void {
    const list = rows();
    fill(
      root,
      el(doc, 'div', {
        style: { padding: '28px 32px', 'max-width': '840px', margin: '0 auto' },
        children: [
          el(doc, 'div', {
            style: { display: 'flex', 'align-items': 'baseline', gap: '16px' },
            children: [
              el(doc, 'h2', { text: 'Watch a run', style: { margin: '0', 'font-size': '22px' } }),
              button(doc, 'Close', { 'margin-left': 'auto', padding: '6px 14px', cursor: 'pointer' }, close),
            ],
          }),
          el(doc, 'p', {
            style: { color: MUTED, 'max-width': '62ch' },
            /*
             * The basis line, § 16 rule 2. It states the substitution `watch/types.ts` argues —
             * this build re-simulates the record here rather than trusting a server — because the
             * pill downstream says the same thing and a reader meeting it for the first time on a
             * canvas has nowhere to ask.
             */
            text:
              'Every run here is a record — a seed, a configuration and the changes made during ' +
              'the day. Pressing Watch it re-simulates that record on this machine and replays ' +
              'the result. A record that no longer reproduces the figures it was filed with is ' +
              'not replayed at all.',
          }),
          ...(loadFailure === undefined
            ? []
            : [
                el(doc, 'p', {
                  style: { color: ACCENT },
                  text: `The shipped reference runs could not be read: ${loadFailure}`,
                }),
              ]),
          ...(list.length === 0
            ? [
                el(doc, 'p', {
                  style: { color: MUTED },
                  text: 'No day has been closed on this device yet, and the reference runs have not loaded.',
                }),
              ]
            : list.map(rowCard)),
        ],
      }),
    );
  }

  function rowCard(run: WatchableRun): HTMLElement {
    const blocked = run.blocked;
    return el(doc, 'div', {
      style: {
        background: CARD_BG,
        'border-radius': '10px',
        padding: '14px 16px',
        margin: '12px 0',
        display: 'flex',
        gap: '16px',
        'align-items': 'flex-start',
      },
      children: [
        el(doc, 'div', {
          style: { flex: '1 1 auto', 'min-width': '0' },
          children: [
            el(doc, 'div', { text: run.label, style: { 'font-size': '17px' } }),
            el(doc, 'div', {
              style: { color: MUTED, 'font-size': '13px' },
              text: `${run.buildingName} · ${run.subtitle}`,
            }),
            /*
             * § 20.11's line, on the row as well as on the header. A reader deciding what to press
             * is exactly the reader who must not mistake a fixture for a person.
             */
            ...(run.source === 'reference'
              ? [
                  el(doc, 'div', {
                    style: { color: ACCENT, 'font-size': '12px', 'margin-top': '2px' },
                    text: 'reference run · not a player',
                  }),
                ]
              : []),
            ...(blocked === null
              ? []
              : [
                  el(doc, 'div', {
                    style: { color: ACCENT, 'font-size': '13px', 'margin-top': '6px' },
                    text: blocked.reason,
                  }),
                ]),
          ],
        }),
        /*
         * The affordance, or nothing. § 1.5: *"a row that cannot be replayed loses its `Watch it`
         * button rather than replaying something approximate."* A disabled button would still be a
         * button, and the sentence says it loses it.
         */
        ...(blocked === null
          ? [
              (() => {
                /*
                 * Busy while this row's gate run is out on the worker. It is drawn from
                 * {@link checking} rather than written onto the node, because `draw()` is a `fill`
                 * — every row is rebuilt — so a flag set on the button would be lost by the next
                 * redraw. That was invisible while the run blocked the thread, because nothing
                 * could redraw; it is the first thing an asynchronous run breaks.
                 */
                const busy = checking === run.id;
                const control = button(
                  doc,
                  busy ? 'Checking this day…' : 'Watch it',
                  { padding: '8px 16px', cursor: 'pointer', 'align-self': 'center' },
                  () => {
                    press(run);
                  },
                );
                control.className = 'watch-row-press';
                control.disabled = busy;
                return control;
              })(),
            ]
          : []),
      ],
    });
  }

  /** Apply the gate's verdict: watch the row, or redraw it with its reason and without its button. */
  function settle(checked: ReturnType<typeof watchGateAfter>): void {
    if (checked.run.blocked !== null || checked.recording === undefined) {
      refused.set(checked.run.id, checked.run);
      draw();
      return;
    }
    close();
    host.onWatch(
      checked.run,
      watchingViewOf(
        checked.run,
        host.dispatcherNameOf(checked.run.record?.dispatcherId ?? ''),
      ),
      checked.recording,
    );
  }

  function press(run: WatchableRun): void {
    if (checking === run.id) return;
    const gate = watchGateBefore(run, host.resources, host.stateNow());
    if (gate.kind === 'settled') {
      // No run needed, so none is taken and no busy state is drawn — the two grounds
      // `watch/library.ts` refuses without a simulation reach their answer here, unchanged.
      settle(gate.checked);
      return;
    }
    checking = run.id;
    draw();
    runner.start({
      /*
       * `recordDecisions: true` — `recordRun`'s own default, which is what this gate used before
       * the run moved. It matters rather than being tidy: a recording's decision log is *in* the
       * recording, so sending `false` would hand the stage a different replay than the one the
       * synchronous gate produced, and the reproduction check downstream compares recordings.
       * `dev/offThreadRuns.ts` requires the field for exactly this reason.
       */
      runs: [{ config: gate.config, recordDecisions: true, outOfServiceCarIds: [] }],
      onDone: ([recording]) => {
        checking = undefined;
        if (recording === undefined) return;
        settle(watchGateAfter(run, recording));
      },
      onFailed: (message) => {
        checking = undefined;
        /*
         * A run that threw is a row that cannot be replayed, which is § 1.5's own outcome — so it
         * takes § 1.5's own shape: the reason on the row, and the affordance gone. It is filed
         * under `does-not-reproduce` rather than a new ground because that is what a reader needs
         * to know; the message names what actually happened.
         */
        refused.set(run.id, {
          ...run,
          blocked: {
            ground: 'does-not-reproduce',
            reason: `this day could not be re-simulated on this device — ${message}`,
          },
        });
        draw();
      },
    });
  }

  /* --- the spectator chrome ------------------------------------------------ */

  /**
   * The row the chrome is currently drawn from — see {@link WatchPanel.showChrome}.
   *
   * `undefined` exactly while the chrome is down, so the primary cannot fire against a run that is
   * no longer on screen.
   */
  let currentRun: WatchableRun | undefined;

  /**
   * What the chrome was last drawn for — GitHub issue #106's rule, applied before it could bite.
   *
   * The shell calls `showChrome` from `renderLive`, which runs at 60 Hz, and the strip contains two
   * **buttons**. `fill` is `replaceChildren`, which removes and re-inserts every child — and a
   * browser decides whether to fire `click` by remembering the element the pointer went *down* on,
   * a memory it throws away when that element leaves the document. So a rebuilt-every-frame action
   * bar is a bar whose buttons can never be pressed.
   *
   * It is not a hypothetical here: the browser tier caught it, reporting sixty attempts at
   * `⤺ Stop watching` and *"element was detached from the DOM, retrying"* on every one. `dom.ts`
   * offers `fillKeeping` for exactly this, and keying is better still — the strip's contents are a
   * pure function of the view, so a frame on which the view did not change has no work to do at
   * all. `drawRaceStrip`'s `lastRaceKey` is the same arrangement for the same reason.
   */
  let lastChromeKey = '';

  /**
   * The strip that carries § 14.1's identity block, posted figures and action bar.
   *
   * Inserted **before** the header by the shell, through `parentElement?.insertBefore` — this
   * package's one insertion idiom. Hidden rather than removed when not watching, so the node
   * identity survives and nothing has to re-find it.
   */
  const chrome = el(doc, 'div', {
    className: 'watch-chrome',
    style: {
      display: 'none',
      background: CHROME_BG,
      color: CHROME_INK,
      padding: '10px 16px',
      font: '13px/1.4 system-ui, sans-serif',
    },
  });

  function showChrome(view: WatchingView | undefined): void {
    if (view === undefined) {
      if (lastChromeKey === '') return;
      lastChromeKey = '';
      chrome.style.display = 'none';
      fill(chrome);
      return;
    }
    // The whole view, because every field of it is drawn — a key over a subset is a key that stops
    // noticing the field somebody adds next.
    const key = JSON.stringify(view);
    if (key === lastChromeKey) return;
    lastChromeKey = key;
    chrome.style.display = 'block';
    fill(
      chrome,
      el(doc, 'div', {
        style: { display: 'flex', gap: '14px', 'align-items': 'center', 'flex-wrap': 'wrap' },
        children: [
          // The avatar disc — an initial on a colour, never an uploaded image (§ 15.1).
          el(doc, 'div', {
            style: {
              width: '34px',
              height: '34px',
              'border-radius': '50%',
              background: ACCENT,
              color: CHROME_INK,
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'font-size': '16px',
              flex: '0 0 auto',
            },
            text: view.initial,
          }),
          el(doc, 'div', {
            style: { 'min-width': '0' },
            children: [
              el(doc, 'div', { text: view.name, style: { 'font-size': '19px' } }),
              el(doc, 'div', {
                text: `${view.sourceLine} · ${view.subtitle}`,
                style: { opacity: '0.78', 'font-size': '12px' },
              }),
            ],
          }),
          el(doc, 'div', {
            style: { 'margin-left': '18px' },
            children: [
              el(doc, 'div', {
                text: view.dispatcherEyebrow,
                style: { opacity: '0.7', 'font-size': '11px', 'letter-spacing': '0.08em' },
              }),
              el(doc, 'div', { text: view.dispatcherName }),
            ],
          }),
          el(doc, 'div', {
            style: { display: 'flex', gap: '18px', 'margin-left': 'auto' },
            children: view.figures.map((figure) =>
              el(doc, 'div', {
                children: [
                  el(doc, 'div', { text: figure.value, style: { 'font-size': '18px' } }),
                  el(doc, 'div', {
                    text: figure.label,
                    style: { opacity: '0.72', 'font-size': '11px' },
                  }),
                ],
              }),
            ),
          }),
        ],
      }),
      el(doc, 'div', {
        text: view.figuresNote,
        style: { opacity: '0.7', 'font-size': '11px', 'margin-top': '6px' },
      }),
      /*
       * The action bar — two entries, and § 14.1's *"no timeline, no back"* is kept by the shell
       * hiding the transport's timeline rather than by this strip omitting one it never had.
       */
      el(doc, 'div', {
        style: { display: 'flex', gap: '10px', 'margin-top': '8px' },
        children: view.actions.map((action) =>
          button(
            doc,
            action.label,
            {
              padding: '6px 14px',
              cursor: 'pointer',
              background: action.primary ? ACCENT : 'transparent',
              color: CHROME_INK,
              border: `1px solid ${action.primary ? ACCENT : CHROME_INK}`,
              'border-radius': '6px',
            },
            () => {
              if (action.id === 'stop-watching') host.onStopWatching();
              else if (currentRun !== undefined) host.onPlayThisCrowd(currentRun);
            },
            { 'data-watch-action': action.id },
          ),
        ),
      }),
    );
  }

  return {
    open,
    close,
    root,
    chrome,
    showChrome(view: WatchingView | undefined, run?: WatchableRun): void {
      currentRun = view === undefined ? undefined : run;
      showChrome(view);
    },
  };
}
