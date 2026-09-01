/**
 * **The Fix-a-building screen** — GAMEPLAY § 10, mounted in the Everyday shell's scroll region.
 * The fourth mode tile's real destination: a screen, not `dev/fixitPanel.ts`'s dark overlay, so
 * there is no `Escape`-to-close and no way out except the § 3.3 bar's `⤺ Leave this building`.
 *
 * ## What this file decides: nothing
 *
 * `dev/fixitPanel.ts`'s rule, kept whole: every decision — spend, affordability, the four
 * outcomes, the measured rows, the four figures — is `fixit/engine.ts`'s and `fixit/run.ts`'s,
 * and every worded substitution — the § 3.3 cells, the rail's `{fixed}/{total}`, the price lines
 * — is `fixitScreenModel.ts`'s, where the honesty sweep drives it. This file draws their answers
 * in § 19's tokens and forwards presses. Its own literals are the load-failure line, the
 * run-failed line and the measuring line the figures grid stands in with while a run is in flight
 * — all three mount status text on the same footing as every excluded mount's, and all three
 * about a state of the *mount* rather than about a `FixitCase` or a `FixitState`, which is the
 * whole of what the driven model is over.
 *
 * ## Two surfaces over one machinery, and where they are allowed to differ
 *
 * `dev/fixitPanel.ts` draws the same engine inside the Engineer shell. The two agree on
 * everything the machinery decides — the same `classifyOutcome`, the same `repairRowOf`, the same
 * `fixedBadgeAfter` rule (the badge follows the latest run; see the press handler) — and on the
 * accessibility contract `docs/20` defect 16 set: a toggle says its state in `aria-pressed`
 * **and** in a visible mark, because a background colour alone was neither.
 *
 * They differ on palette, and that is correct rather than a drift: the Engineer panel reads the
 * Engineer theme's CSS variables (`var(--card)`, `var(--ok)` — so it follows a theme the player
 * flipped), and this screen reads GAMEPLAY § 19's paper-and-ink tokens, because it is drawn
 * inside the Everyday shell and the handoff is canonical for what that screen looks like. Each
 * reads its own product's tokens; neither hardcodes a palette of its own.
 *
 * ## The § 10.3 subset drawn, and why it is a subset
 *
 * § 10.1 item 6 asks for the full building editor — elevation grid, zones, shafts, parking,
 * who-drives. The fixit machinery prices **none of those**: `FixitState` carries repairs, extras
 * and the two § 9-priced machinery steps, and a control that writes no field of the state it
 * claims to edit is this repository's signature defect (§ D219 — *move the control and require
 * the run to change*). So the editor drawn here is exactly the subset the engine prices: the two
 * machinery steppers with the running total and `fixit/engine.ts#budgetNoteOf`'s note. The rest
 * of § 10.3 is content for the lane that gives the engine those seams, not for a screen to mime.
 *
 * ## The runs are on a worker — GitHub issue #165
 *
 * A press's pair and the as-built run a case opens by taking both go through
 * `dev/offThreadRuns.ts` to `dev/shiftWorker.ts`. This screen used to state a cost here instead —
 * `dev/fixitPanel.ts`'s, carried over verbatim — and the sentence is deleted rather than reworded,
 * because a stated cost that has been paid is § D227's stale refusal.
 *
 * It was also the **most exposed** of the three surfaces the issue named: this is the default
 * shell's screen, and its open run had no busy state at all. Measured before the move
 * (`dev/measure.surfaceRuns.test.ts`), opening a case blocked the painting thread for 11–474 ms
 * across the eighteen shipped cases and a press for 24–846 ms — the open half with nothing on
 * screen to say why.
 *
 * The § 3.3 primary still relabels to `Running the day…` and goes inert, which is
 * `fixitScreenModel.ts#fixitBarModel`'s decision and unchanged. The figures grid says it is
 * measuring while the as-built run is in flight. What went with the block is `afterPaint` — a
 * `requestAnimationFrame` wrapping a `setTimeout`, whose entire subject was getting the relabel
 * painted **before** a task that would seize the thread for a second. There is no such task now.
 *
 * ## FIXED survives the tab now, and the rest of the session does not
 *
 * This section used to name an absence: *no solved-cases seam exists in `persist/`… the solved set
 * ends with the tab*. GitHub issue #224 closed it, and the slot that grew the key is the one that
 * sentence pointed at — **not** `persist/`'s envelope but the Everyday one,
 * `everyday/profile.ts` ([§ D433](../../../../DECISIONS.md)), which is where an Everyday screen's
 * earnings belong.
 *
 * So the split inside this module is now three ways rather than two:
 *
 * - **The solved set is durable.** {@link solvedIds} is still read off `sessions`, and `sessions`
 *   is seeded once per tab from the store by {@link ensureRestored}. Every press that changes a
 *   case's badge writes the whole set back.
 * - **The per-case selections and the cached as-built runs are still session-local**, and
 *   deliberately: a `FixitState` is a working draft a player is in the middle of, and a
 *   `RecordedRun` is megabytes of legs. Neither is progress; both end with the tab, as before.
 * - **The badge still follows the latest run in both directions** (`fixit/engine.ts#fixedBadgeAfter`,
 *   `docs/20` defect 16). A restored case arrives badged and is re-badged by the next run it has,
 *   including out of FIXED — restoring the badge does not make it a high-water mark.
 *
 * ## Data, loaded through the same doors
 *
 * The Everyday shell hands a screen no resources, so this screen fetches its own on first open —
 * `dev/data.ts#loadBrowserResources` and `#loadFixitCases`, the exact loaders the Engineer shell
 * uses, cached in module scope so the fetch happens once per tab. The cost is one duplicate
 * fetch-and-parse of `data/` beside the Engineer boot's own (~210 kB revalidated, not re-sent),
 * and the alternative — reaching into `dev/main.ts`'s closure for its copy — couples the two
 * shells the way `boot.ts` deliberately refuses to.
 */

import { loadBrowserResources, loadFixitCases, type BrowserResources } from '../dev/data.js';
import {
  affordabilityOf,
  classifyOutcome,
  EDITOR_PRICING,
  emptyFixitState,
  fixedBadgeAfter,
  repairRowOf,
  budgetNoteOf,
  spendOf,
  STANDING_EXTRAS,
  stepCapacity,
  stepSpeed,
  toggleExtra,
  toggleRepair,
  type FixitOutcome,
} from '../fixit/engine.js';
import {
  FIXIT_RUN_SWITCHES,
  figureValuesOf,
  fixitRunPlanOf,
  measuredOf,
} from '../fixit/run.js';
import type { FixitCase, FixitCases, FixitState } from '../fixit/types.js';
import type { VizRecording } from '../contract/types.js';
import { createOffThreadRunner } from '../dev/offThreadRuns.js';
import { actionBarFor } from './actionBar.js';
import type { ActionBarModel } from './actionBar.js';
import {
  buildingLineOf,
  FIXIT_SCREEN_COPY as COPY,
  fixitBarModel,
  fixitCaseRailModel,
  fixitMachineryRows,
  fixitRepairStateLine,
  fixitSpendSummary,
  type FixitSpendSummary,
} from './fixitScreenModel.js';
import { solvedCaseSetOf } from './profile.js';
import { everydayProfileStore } from './profileStore.js';
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayState } from './types.js';

/**
 * Two values the prototype's fixit markup uses that § 19's block does not name — carried as
 * prototype-sourced literals on `tokens.ts`'s own precedent for `EVERYDAY_RAIL_SURFACES`:
 * the mid reading's warm brown (the `OPEN` tag, the mid figures) and the diagnosis card's edge.
 */
const PROTO = Object.freeze({
  mid: '#8D6A2F',
  diagnosisEdge: '#C9BBA4',
  /** The passed outcome card's tints — the prototype's own rgba forms of § 19's moss. */
  passedEdge: 'rgba(79,138,91,.5)',
  passedWash: 'rgba(79,138,91,.09)',
} as const);

interface CaseSession {
  state: FixitState;
  fixed: boolean;
  outcome: FixitOutcome | undefined;
  /** The as-built run the four figures are measurements of — cached per case, once it lands. */
  asBuilt: VizRecording | undefined;
}

interface LoadedFixit {
  readonly resources: BrowserResources;
  readonly cases: FixitCases;
}

/* ------------------------------------------------------------------------- *
 * The module-scope store — seeded from the slot, see the docstring's
 * FIXED-survives-the-tab note for which of these outlive it and which do not.
 * ------------------------------------------------------------------------- */

let loaded: LoadedFixit | undefined;
let loadFailure: string | undefined;
let loadPromise: Promise<void> | undefined;
const sessions = new Map<string, CaseSession>();
let selectedId: string | undefined;
let running = false;

/**
 * The runner every fixit run crosses on — module-scope, so its worker stays warm across mounts.
 *
 * `dev/shiftRunner.ts` measured what respawning costs: every spawn re-imports `recordRun` and the
 * whole of `core`. This screen is left and re-entered by the § 3.3 bar, so a runner that died with
 * the mount would pay that toll on every visit. `createOffThreadRunner` spawns lazily, so holding
 * one at module scope starts no worker at import time.
 *
 * `new Worker(new URL(…))` is written out here rather than injected through the shell, on
 * `everyday/boardScreen.ts`' and `everyday/benchScreen.ts`' established ground: the shell hands a
 * screen no worker, the expression is a bundler seam Vite rewrites in place, and this file is
 * DOM-bound and outside the honesty search's driven corpus either way.
 */
const runner = createOffThreadRunner({
  spawn: () => new Worker(new URL('../dev/shiftWorker.ts', import.meta.url), { type: 'module' }),
});

/**
 * What the runner is currently doing, as `caseId:open` or `caseId:press` — or `undefined`.
 *
 * One field rather than a per-session busy flag, because `dev/offThreadRuns.ts` answers exactly
 * one ask and a second `start` abandons the first **silently**: a flag left on the abandoned case
 * would leave it measuring forever. Keyed on the ask, the next draw of that case sees an ask that
 * is not its own and starts a fresh one.
 */
let ask: string | undefined;
/** A run that threw, said where the reader is. Cleared by the next ask. */
let runFailure: string | undefined;

/** Whether {@link ensureRestored} has already run. Once per tab, like the case file's own load. */
let restored = false;

/**
 * Seed the solved set from what the last sitting earned — GitHub issue #224.
 *
 * Materialised into `sessions` rather than held as a second set beside it, and that is the whole of
 * why the badge rule survives: `solvedIds`, `selectFirstUnsolved` and `fixitBar` all read
 * `sessions` and are untouched, and the next run of a restored case overwrites its `fixed` exactly
 * as it overwrites a case solved a minute ago. A separate *restored* set would have had to be
 * consulted beside the session's answer at three sites, and the day one of them forgot, a case
 * would stay badged FIXED beside an outcome card saying it is not — `docs/20` defect 16, rebuilt.
 *
 * The restored session carries **no outcome and no cached run**: `outcome: undefined` is true — this
 * sitting has not run this case — and it is what makes the § 3.3 primary read `Run the day` rather
 * than `Run it again` on a case whose verdict this tab has never seen.
 */
function ensureRestored(): void {
  if (restored) return;
  restored = true;
  for (const id of solvedCaseSetOf(everydayProfileStore().progress())) {
    sessions.set(id, {
      state: emptyFixitState(),
      fixed: true,
      outcome: undefined,
      asBuilt: undefined,
    });
  }
}

/**
 * Write the solved set back.
 *
 * The whole set on every change rather than one id, because the slot holds one value and `write`
 * replaces it whole — and because the set shrinks as well as grows: a case that stops being FIXED
 * has to stop being stored, which an append-only write could not express.
 *
 * Spread over the store's current progress rather than built fresh, so the ratings beside it are
 * carried through: two payloads in one value, and a writer that supplied only its own half would
 * delete the other's on every press.
 *
 * Returns nothing, and does not check the answer. Whether the write survived the tab is
 * `progressNotice()`'s to say and the rail draws it on the very next render, which this caller
 * always performs — so a second reading here would be the same fact told twice.
 */
function keepSolved(): void {
  const store = everydayProfileStore();
  store.setProgress({ ...store.progress(), solvedCaseIds: [...solvedIds()] });
}

function sessionOf(entry: FixitCase): CaseSession {
  let session = sessions.get(entry.id);
  if (session === undefined) {
    session = { state: emptyFixitState(), fixed: false, outcome: undefined, asBuilt: undefined };
    sessions.set(entry.id, session);
  }
  return session;
}

function currentEntry(): FixitCase | undefined {
  if (loaded === undefined) return undefined;
  return loaded.cases.cases.find((entry) => entry.id === selectedId) ?? loaded.cases.cases[0];
}

function solvedIds(): ReadonlySet<string> {
  return new Set([...sessions.entries()].filter(([, s]) => s.fixed).map(([id]) => id));
}

/** The prototype's menu-entry rule: entering fix-it starts at the first unsolved case. */
function selectFirstUnsolved(): void {
  if (loaded === undefined) return;
  const solved = solvedIds();
  const first = loaded.cases.cases.find((entry) => !solved.has(entry.id));
  selectedId = (first ?? loaded.cases.cases[0])?.id;
}

/**
 * Ask for the as-built run the four figures are measurements of (§ 10.6).
 *
 * Started from the draw that notices the absence, and guarded twice. An ask already running for
 * this case is left alone; an ask running for a **press** is never superseded, because the press
 * produces the as-built run anyway and stealing the runner from it would abandon the pair
 * mid-flight — the § 3.3 primary would stay inert with nothing coming.
 *
 * An open ask *may* supersede another open ask, which is what makes switching cases mid-measure
 * work: the abandoned case is silent, and the next draw of it starts a fresh ask rather than
 * finding a flag that says it is already measuring.
 *
 * `redraw` is the mount's own `render`, passed in because this lives outside the mount closure
 * with the rest of the module store — an ask can outlive the mount that started it, and
 * `render` refuses on `alive === false`.
 */
function measureAsBuilt(
  loadedFixit: LoadedFixit,
  entry: FixitCase,
  redraw: () => void,
): void {
  const key = `${entry.id}:open`;
  if (ask === key || ask?.endsWith(':press') === true) return;
  ask = key;
  runFailure = undefined;
  const plan = fixitRunPlanOf(entry, emptyFixitState(), loadedFixit.resources);
  runner.start({
    runs: [{ config: plan.asBuilt, ...FIXIT_RUN_SWITCHES }],
    onDone: ([asBuilt]) => {
      ask = undefined;
      if (asBuilt !== undefined) sessionOf(entry).asBuilt = asBuilt;
      redraw();
    },
    onFailed: (message) => {
      ask = undefined;
      runFailure = message;
      redraw();
    },
  });
}

function ensureLoaded(): Promise<void> {
  loadPromise ??= (async () => {
    try {
      const resources = await loadBrowserResources();
      const cases = await loadFixitCases(resources);
      loaded = { resources, cases };
    } catch (error) {
      loadFailure = error instanceof Error ? error.message : String(error);
    }
  })();
  return loadPromise;
}

/* ------------------------------------------------------------------------- *
 * DOM helpers — the shell's own idiom, inline styles from § 19's tokens.
 * ------------------------------------------------------------------------- */

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

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label}`;
const MONO = (size: number, color: string): string =>
  `font:500 ${String(size)}px ${TYPE.mono};color:${color}`;

/* ------------------------------------------------------------------------- *
 * The mount
 * ------------------------------------------------------------------------- */

function mountFixit(
  host: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let alive = true;
  // Before anything reads `sessions` — the rail, `selectFirstUnsolved` and the § 3.3 bar all do.
  ensureRestored();

  const root = el(doc, 'div', 'everyday-fixit');
  root.style.cssText = [
    'display:grid',
    `grid-template-columns:288px minmax(0,1fr)`,
    `gap:${String(GAP.wide)}px`,
    'align-items:start',
  ].join(';');
  host.append(root);

  function render(): void {
    if (!alive) return;
    root.replaceChildren();
    if (loadFailure !== undefined) {
      // Mount status text, the one sentence this file authors — see the module docstring.
      const failed = el(doc, 'p', 'everyday-fixit-failure');
      failed.textContent = `The case file could not be loaded: ${loadFailure}`;
      failed.style.cssText = `grid-column:1/-1;color:${C.alarm};font-size:13px;max-width:70ch`;
      root.append(failed);
      return;
    }
    if (loaded === undefined) {
      const loading = el(doc, 'p', 'everyday-fixit-loading', COPY.loading);
      loading.style.cssText = `grid-column:1/-1;color:${C.warmGrey};font-size:13px`;
      root.append(loading);
      return;
    }
    const entry = currentEntry();
    if (entry === undefined) {
      const empty = el(doc, 'p', 'everyday-fixit-empty', COPY.emptyFile);
      empty.style.cssText = `grid-column:1/-1;color:${C.warmGrey};font-size:13px`;
      root.append(empty);
      return;
    }
    root.append(caseRail(loaded, entry), mainColumn(loaded, entry));
  }

  function towerLineOf(loadedFixit: LoadedFixit) {
    return (entry: FixitCase): string => {
      const building = loadedFixit.resources.buildings.find((b) => b.id === entry.buildingId);
      return building === undefined
        ? entry.buildingId
        : buildingLineOf(building.name, building.floors.length);
    };
  }

  /* ---- § 10.1's left rail: the case list, `{fixed}/{total} fixed` above it ---- */

  function caseRail(loadedFixit: LoadedFixit, current: FixitCase): HTMLElement {
    const model = fixitCaseRailModel(
      loadedFixit.cases.cases,
      solvedIds(),
      current.id,
      towerLineOf(loadedFixit),
    );
    const rail = el(doc, 'div', 'everyday-fixit-rail');
    rail.style.cssText = [
      `background:${C.card}`,
      `border:1px solid ${C.ruleMid}`,
      `border-radius:${String(R.card)}px`,
      'padding:18px 16px',
    ].join(';');

    const head = el(doc, 'div');
    head.style.cssText = 'display:flex;align-items:baseline;gap:8px';
    const heading = el(doc, 'span', undefined, model.heading);
    heading.style.cssText = EYEBROW;
    const count = el(doc, 'span', 'everyday-fixit-count', model.count);
    count.style.cssText = `margin-left:auto;${MONO(10.5, C.terracotta)};flex:none`;
    head.append(heading, count);
    rail.append(head);

    /*
     * What the player is owed about their kept progress — GitHub issue #224.
     *
     * Drawn under the `{fixed}/{total}` count on purpose: the count is exactly the figure a refused
     * restore makes wrong, and a `0/3 fixed` on a player who solved two yesterday is the silent
     * empty state the notice exists to stop. The sentence is `everyday/profile.ts`'s, so the ladder
     * says the same thing about the same store rather than wording it a second time.
     */
    const notice = everydayProfileStore().progressNotice();
    if (notice !== null) {
      const line = el(doc, 'p', 'everyday-fixit-progress-notice', notice);
      line.style.cssText = `margin:8px 0 0;font-size:12px;line-height:1.5;color:${C.terracotta}`;
      rail.append(line);
    }

    const list = el(doc, 'div');
    list.style.cssText = `display:grid;gap:${String(GAP.row)}px;margin-top:12px`;
    for (const row of model.rows) {
      const button = el(doc, 'button', 'everyday-fixit-case');
      button.type = 'button';
      if (row.active) button.setAttribute('aria-current', 'true');
      button.style.cssText = [
        'text-align:left',
        'cursor:pointer',
        `border:1.5px solid ${row.active ? C.ink : C.ruleLight}`,
        `background:${row.active ? C.cardSunkDeep : C.paper}`,
        `border-radius:${String(R.tile)}px`,
        'padding:12px 13px',
        `color:${C.ink}`,
        'display:flex',
        'flex-direction:column',
        'gap:4px',
        'width:100%',
        'box-sizing:border-box',
      ].join(';');
      const top = el(doc, 'span');
      top.style.cssText = 'display:flex;align-items:baseline;gap:8px';
      const name = el(doc, 'span', undefined, row.name);
      name.style.cssText = 'font-size:14px;font-weight:600;min-width:0';
      const tag = el(doc, 'span', 'everyday-fixit-tag', row.tag);
      tag.style.cssText = `margin-left:auto;${MONO(10, row.solved ? C.moss : PROTO.mid)};flex:none`;
      top.append(name, tag);
      const tower = el(doc, 'span', undefined, row.towerLine);
      tower.style.cssText = `font-size:12px;line-height:1.4;color:${C.warmGrey}`;
      button.append(top, tower);
      button.addEventListener('click', () => {
        if (running) return;
        selectedId = row.id;
        render();
        context.refreshBar();
      });
      list.append(button);
    }
    rail.append(list);

    const hint = el(doc, 'p', undefined, model.hint);
    hint.style.cssText = `font-size:12px;line-height:1.5;color:${C.warmGrey};margin:14px 0 0`;
    rail.append(hint);
    return rail;
  }

  /* ---- the main column, § 10.1's order ---- */

  function mainColumn(loadedFixit: LoadedFixit, entry: FixitCase): HTMLElement {
    const session = sessionOf(entry);
    if (session.asBuilt === undefined) measureAsBuilt(loadedFixit, entry, render);
    const spend = spendOf(entry, session.state);
    const summary = fixitSpendSummary(entry, spend);

    const main = el(doc, 'div', 'everyday-fixit-main');
    main.style.cssText = 'min-width:0';

    /* -- the heading: case name, tower line beside it -- */
    const headRow = el(doc, 'div');
    headRow.style.cssText = 'display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap';
    const h1 = el(doc, 'h1', undefined, entry.name);
    h1.style.cssText = `font:700 30px ${TYPE.heading};line-height:1.15;letter-spacing:-.02em;margin:0`;
    const tower = el(doc, 'span', undefined, towerLineOf(loadedFixit)(entry));
    tower.style.cssText = MONO(11.5, C.label);
    headRow.append(h1, tower);
    main.append(headRow);

    /* -- 1. the complaint, in the tenant's words -- */
    const complaint = el(doc, 'div', 'everyday-fixit-complaint');
    complaint.style.cssText = [
      'margin-top:16px',
      `border-left:3px solid ${C.alarm}`,
      `background:${C.card}`,
      `border-radius:0 ${String(R.tile)}px ${String(R.tile)}px 0`,
      'padding:14px 17px',
      'max-width:74ch',
    ].join(';');
    const cEyebrow = el(doc, 'div', undefined, COPY.complaintEyebrow);
    cEyebrow.style.cssText = EYEBROW;
    const cText = el(doc, 'p', undefined, `“${entry.complaint.text}”`);
    cText.style.cssText = `font-size:15.5px;line-height:1.55;color:${C.ink};margin:6px 0 0;font-style:italic`;
    const cWho = el(doc, 'div', undefined, `— ${entry.complaint.complainer}`);
    cWho.style.cssText = `font-size:12.5px;color:${C.warmGrey};margin-top:7px`;
    complaint.append(cEyebrow, cText, cWho);
    main.append(complaint);

    /* -- 2. the building as it stands, the symptom flagged in terracotta -- */
    const asBuilt = el(doc, 'div', 'everyday-fixit-asbuilt');
    asBuilt.style.cssText = [
      'margin-top:14px',
      `border:1px solid ${C.rule}`,
      `border-radius:${String(R.card)}px`,
      `background:${C.card}`,
      'padding:14px 17px',
      'max-width:80ch',
    ].join(';');
    const aEyebrow = el(doc, 'div', undefined, COPY.asBuiltEyebrow);
    aEyebrow.style.cssText = EYEBROW;
    const aNote = el(doc, 'p', undefined, entry.asBuilt.note);
    aNote.style.cssText = `font-size:13.5px;line-height:1.55;color:${C.inkSoft};margin:6px 0 0`;
    const aSymptom = el(doc, 'div', 'everyday-fixit-symptom', entry.symptom);
    aSymptom.style.cssText = `${MONO(11.5, C.terracotta)};margin-top:7px`;
    asBuilt.append(aEyebrow, aNote, aSymptom);
    main.append(asBuilt);

    /* -- 3. the four figures, measured on the as-built run -- */
    const figures = el(doc, 'div', 'everyday-fixit-figures');
    figures.style.cssText = [
      'display:grid',
      'grid-template-columns:repeat(auto-fit,minmax(150px,1fr))',
      'gap:11px',
      'margin-top:16px',
      'max-width:80ch',
    ].join(';');
    if (session.asBuilt === undefined) {
      /*
       * The four figures are measurements of a run that is happening on a worker, so the grid says
       * so rather than drawing four blanks or four zeros — a figure the screen does not have is
       * named as absent and never estimated.
       *
       * Written here rather than added to `fixitScreenModel.ts#FIXIT_SCREEN_COPY`, which is the
       * corpus-driven half. *Is a run in flight* is not a fact about a `FixitCase` or a
       * `FixitState`, which is all that model is over; and this file's own literal is exactly this
       * class — mount status text, on the footing the load-failure line above sits on and every
       * excluded mount's does.
       */
      const measuring = el(
        doc,
        'p',
        'everyday-fixit-measuring',
        'Measuring the building as it stands…',
      );
      measuring.style.cssText = `grid-column:1/-1;font-size:13px;color:${C.warmGrey};margin:0`;
      figures.append(measuring);
    }
    for (const figure of
      session.asBuilt === undefined ? [] : figureValuesOf(entry, session.asBuilt)) {
      const card = el(doc, 'div', 'everyday-fixit-figure');
      card.style.cssText = [
        `border:1px solid ${C.rule}`,
        `border-radius:${String(R.tile)}px`,
        `background:${C.card}`,
        'padding:12px 14px',
      ].join(';');
      const tint =
        figure.reading === 'bad' ? C.alarm : figure.reading === 'healthy' ? C.moss : PROTO.mid;
      const value = el(doc, 'div', undefined, figure.text);
      value.style.cssText = `${MONO(15, tint)};letter-spacing:-.02em`;
      const label = el(doc, 'div', undefined, figure.label);
      label.style.cssText = 'font-size:12.5px;font-weight:600;margin-top:4px';
      card.append(value, label);
      figures.append(card);
    }
    main.append(figures);
    if (runFailure !== undefined) {
      const failed = el(doc, 'p', 'everyday-fixit-run-failed');
      failed.textContent = `The day could not be run: ${runFailure}`;
      failed.style.cssText = `color:${C.alarm};font-size:13px;max-width:70ch;margin:10px 0 0`;
      main.append(failed);
    }

    /* -- 4. the diagnosis, stated plainly, reasoning underneath -- */
    const diagnosis = el(doc, 'div', 'everyday-fixit-diagnosis');
    diagnosis.style.cssText = [
      'margin-top:16px',
      `border:1px solid ${PROTO.diagnosisEdge}`,
      'border-radius:13px',
      `background:${C.cardSunkDeep}`,
      'padding:15px 18px',
      'max-width:80ch',
    ].join(';');
    const dEyebrow = el(doc, 'div', undefined, COPY.diagnosisEyebrow);
    dEyebrow.style.cssText = EYEBROW;
    const dText = el(doc, 'div', undefined, entry.diagnosis.text);
    dText.style.cssText = `font:600 19px ${TYPE.heading};line-height:1.3;margin-top:4px`;
    const dWhy = el(doc, 'p', undefined, entry.diagnosis.reasoning);
    dWhy.style.cssText = `font-size:13.5px;line-height:1.55;color:${C.inkSoft};margin:6px 0 0`;
    diagnosis.append(dEyebrow, dText, dWhy);
    main.append(diagnosis);

    /* -- 5. the repairs and the standing extras, one grid of toggles (§ 10.2) -- */
    const repairsHead = el(doc, 'div');
    repairsHead.style.cssText =
      'display:flex;align-items:baseline;gap:12px;margin:20px 0 10px;flex-wrap:wrap';
    const rEyebrow = el(doc, 'span', undefined, COPY.repairsEyebrow);
    rEyebrow.style.cssText = EYEBROW;
    const rHint = el(doc, 'span', undefined, COPY.repairsHint);
    rHint.style.cssText = `font-size:12.5px;color:${C.warmGrey};min-width:0`;
    const rBudget = el(doc, 'span', 'everyday-fixit-spent', summary.spentLine);
    rBudget.style.cssText = `margin-left:auto;${MONO(12, C.terracotta)};flex:none`;
    repairsHead.append(rEyebrow, rHint, rBudget);
    main.append(repairsHead);

    const grid = el(doc, 'div', 'everyday-fixit-repairs');
    grid.style.cssText =
      'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;max-width:80ch';
    for (const repair of entry.repairs) {
      const row = repairRowOf(entry, session.state, repair);
      grid.append(
        toggleRow(session, {
          className: 'everyday-fixit-repair',
          name: repair.name,
          priceLine: row.priceLine,
          effect: repair.effect,
          selected: row.selected,
          selectable: row.selectable,
          stateLine: fixitRepairStateLine(row),
          toggle: () => toggleRepair(entry, session.state, repair.id),
        }),
      );
    }
    for (const extra of STANDING_EXTRAS) {
      const selected = session.state.selectedExtraIds.includes(extra.id);
      const affordability = affordabilityOf(entry, session.state, extra.costUnits);
      const selectable = selected || affordability.selectable;
      grid.append(
        toggleRow(session, {
          className: 'everyday-fixit-extra',
          name: extra.name,
          priceLine: `${String(extra.costUnits)} u`,
          effect: extra.line,
          selected,
          selectable,
          stateLine: fixitRepairStateLine({
            selected,
            refusal: selectable
              ? undefined
              : `short by ${String(affordability.shortByUnits)} u`,
          }),
          toggle: () => toggleExtra(entry, session.state, extra.id),
        }),
      );
    }
    main.append(grid);

    /* -- 6. the § 10.3 subset the engine prices: the two machinery steppers -- */
    main.append(machinesCard(entry, session, summary));

    /* -- 7. the result, once run (§ 10.4) -- */
    if (session.outcome !== undefined) main.append(outcomeCard(session.outcome));

    return main;
  }

  interface ToggleSpec {
    readonly className: string;
    readonly name: string;
    readonly priceLine: string;
    readonly effect: string;
    readonly selected: boolean;
    readonly selectable: boolean;
    readonly stateLine: string;
    readonly toggle: () => FixitState;
  }

  /** One § 10.2 toggle — a repair or a standing extra, drawn identically (the prototype's grid). */
  function toggleRow(session: CaseSession, spec: ToggleSpec): HTMLElement {
    const button = el(doc, 'button', spec.className);
    button.type = 'button';
    button.setAttribute('aria-pressed', spec.selected ? 'true' : 'false');
    button.disabled = !spec.selectable;
    const refused = !spec.selectable;
    /*
     * The reason on the control, and it is the row's **own** state line rather than a second
     * sentence: a refused row already says `short by 4 u` under its name, so a new string here
     * would be a second place for the same fact to go stale (§ D227). What this adds is that the
     * fact is reachable from the button as a button — GitHub issue #262's rule applied to the one
     * remaining dead control in this shell that had no `title`.
     */
    if (refused) button.title = spec.stateLine;
    button.style.cssText = [
      'text-align:left',
      `cursor:${refused ? 'not-allowed' : 'pointer'}`,
      `border:1.5px solid ${spec.selected ? C.ink : C.rule}`,
      `background:${spec.selected ? C.cardSunkDeep : C.card}`,
      `border-radius:${String(R.tile)}px`,
      'padding:12px 14px',
      `color:${C.ink}`,
      'display:flex',
      'flex-direction:column',
      'gap:4px',
      `opacity:${refused ? '.55' : '1'}`,
    ].join(';');
    const top = el(doc, 'span');
    top.style.cssText = 'display:flex;align-items:baseline;gap:9px;flex-wrap:wrap';
    const name = el(doc, 'span', undefined, spec.name);
    name.style.cssText = 'font-size:13.5px;font-weight:600;flex:1 1 auto';
    const price = el(doc, 'span', 'everyday-fixit-price', spec.priceLine);
    price.style.cssText = `${MONO(11.5, refused ? C.faint : C.terracotta)};flex:none`;
    top.append(name, price);
    const effect = el(doc, 'span', undefined, spec.effect);
    effect.style.cssText = `font-size:12px;line-height:1.45;color:${C.inkSoft}`;
    const state = el(doc, 'span', 'everyday-fixit-state', spec.stateLine);
    state.style.cssText = MONO(10.5, spec.selected ? C.moss : refused ? C.alarm : C.label);
    button.append(top, effect, state);
    if (!refused) {
      button.addEventListener('click', () => {
        if (running) return;
        session.state = spec.toggle();
        render();
      });
    }
    return button;
  }

  function machinesCard(
    entry: FixitCase,
    session: CaseSession,
    summary: FixitSpendSummary,
  ): HTMLElement {
    const card = el(doc, 'div', 'everyday-fixit-machines');
    card.style.cssText = [
      'margin-top:14px',
      `border:1px solid ${C.rule}`,
      `border-radius:${String(R.card)}px`,
      `background:${C.card}`,
      'overflow:hidden',
      'max-width:80ch',
    ].join(';');

    const head = el(doc, 'div');
    head.style.cssText = [
      'display:flex',
      'align-items:baseline',
      'gap:10px',
      'padding:11px 16px',
      `border-bottom:1px solid ${C.ruleLight}`,
      `background:${C.cardSunk}`,
      'flex-wrap:wrap',
    ].join(';');
    const eyebrow = el(doc, 'span', undefined, COPY.machinesEyebrow);
    eyebrow.style.cssText = EYEBROW;
    const capital = el(doc, 'span', 'everyday-fixit-capital', summary.capitalLine);
    capital.style.cssText = `margin-left:auto;${MONO(11, summary.overBudget ? C.alarm : summary.capitalLine === COPY.noCapital ? C.moss : PROTO.mid)};flex:none`;
    const committed = el(doc, 'span', 'everyday-fixit-committed', summary.committedLine);
    committed.style.cssText = `${MONO(11, summary.overBudget ? C.alarm : C.warmGrey)};flex:none`;
    head.append(eyebrow, capital, committed);
    card.append(head);

    const body = el(doc, 'div');
    body.style.cssText = `display:grid;gap:${String(GAP.block)}px;padding:14px 16px`;
    const rows = fixitMachineryRows(
      session.state,
      affordabilityOf(entry, session.state, EDITOR_PRICING.speedUnitsPerHalfMps).selectable,
      affordabilityOf(entry, session.state, EDITOR_PRICING.capacityUnitsPerTwoPlaces).selectable,
    );
    for (const row of rows) {
      const line = el(doc, 'div', `everyday-fixit-stepper everyday-fixit-stepper-${row.key}`);
      line.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
      const minus = el(doc, 'button', 'everyday-fixit-step-down', '−');
      const plus = el(doc, 'button', 'everyday-fixit-step-up', '+');
      /*
       * The fourth cell is **why the step refuses**, and it is separate from the third on purpose:
       * `aria-label` names what the control would do (*Rated speed — return one step*) and a
       * player looking at a grey button is asking why it will not. Before GitHub issue #262's
       * sweep both `−` buttons shipped dead with the first sentence and not the second — measured
       * on the shipped build, three of this screen's forty-one buttons were disabled and none of
       * them said why. The budget cap has a sentence on the row already (§ 10.3's `at the budget`);
       * this puts it on the control too, which is where it is pressed.
       */
      for (const [button, enabled, label, why] of [
        [minus, row.canStepDown, COPY.stepDown, COPY.nothingToReturn],
        [plus, !row.atBudget, COPY.stepUp, COPY.noBudgetLeft],
      ] as const) {
        button.type = 'button';
        button.setAttribute('aria-label', `${row.label} — ${label}`);
        button.disabled = !enabled;
        if (!enabled) button.title = why;
        button.style.cssText = [
          'width:26px',
          'height:24px',
          'padding:0',
          `border:1px solid ${C.rule}`,
          `border-radius:${String(R.control)}px`,
          `background:${C.paper}`,
          `color:${enabled ? C.ink : C.faint}`,
          `cursor:${enabled ? 'pointer' : 'not-allowed'}`,
          'font-size:14px',
          'line-height:1',
        ].join(';');
      }
      minus.addEventListener('click', () => {
        if (running) return;
        session.state =
          row.key === 'speed'
            ? stepSpeed(entry, session.state, -1)
            : stepCapacity(entry, session.state, -1);
        render();
      });
      plus.addEventListener('click', () => {
        if (running) return;
        session.state =
          row.key === 'speed'
            ? stepSpeed(entry, session.state, 1)
            : stepCapacity(entry, session.state, 1);
        render();
      });
      const label = el(doc, 'span', undefined, row.label);
      label.style.cssText = 'font-size:13px;font-weight:600';
      const readout = el(doc, 'span', 'everyday-fixit-readout', row.readout);
      readout.style.cssText = MONO(12, C.terracotta);
      const priced = el(doc, 'span', undefined, row.priced);
      priced.style.cssText = `margin-left:auto;${MONO(10, C.label)}`;
      line.append(minus, plus, label, readout, priced);
      body.append(line);
    }
    card.append(body);

    const note = el(doc, 'div', 'everyday-fixit-budget-note', budgetNoteOf(entry, spendOf(entry, session.state)));
    note.style.cssText = [
      'padding:10px 16px',
      `border-top:1px solid ${C.ruleLight}`,
      `background:${C.cardSunk}`,
      'font-size:12.5px',
      `color:${C.inkSoft}`,
      'line-height:1.5',
    ].join(';');
    card.append(note);
    return card;
  }

  /** § 10.4's result card — head, body, the three measured rows, the basis line. All engine. */
  function outcomeCard(outcome: FixitOutcome): HTMLElement {
    const passed = outcome.kind === 'fixed';
    const card = el(doc, 'div', 'everyday-fixit-outcome');
    card.style.cssText = [
      'margin-top:18px',
      `border:1px solid ${passed ? PROTO.passedEdge : C.amberEdge}`,
      'border-radius:13px',
      `background:${passed ? PROTO.passedWash : C.amberWash}`,
      'padding:16px 18px',
      'max-width:80ch',
    ].join(';');
    const head = el(doc, 'div', 'everyday-fixit-outcome-head', outcome.head);
    head.style.cssText = `font:600 19px ${TYPE.heading}`;
    const body = el(doc, 'p', undefined, outcome.body);
    body.style.cssText = `font-size:14px;line-height:1.55;color:${C.inkSoft};margin:6px 0 0`;
    card.append(head, body);

    const rows = el(doc, 'div');
    rows.style.cssText = 'display:grid;gap:10px;margin-top:14px';
    for (const row of outcome.rows) {
      const block = el(doc, 'div', 'everyday-fixit-outcome-row');
      const top = el(doc, 'div');
      top.style.cssText = 'display:flex;align-items:baseline;gap:9px;flex-wrap:wrap';
      const label = el(doc, 'span', undefined, row.label);
      label.style.cssText = 'font-size:13px;font-weight:600;min-width:0';
      const verdict = el(doc, 'span', undefined, row.passed ? 'holds' : 'does not hold');
      verdict.style.cssText = `${MONO(11.5, row.passed ? C.moss : C.alarm)};flex:none`;
      top.append(label, verdict);
      const detail = el(doc, 'div', undefined, `${row.before} → ${row.after} · ${row.verdict}`);
      detail.style.cssText = `font-size:12px;line-height:1.5;color:${C.warmGrey};margin-top:3px`;
      block.append(top, detail);
      rows.append(block);
    }
    card.append(rows);

    const basis = el(doc, 'p', undefined, outcome.basis);
    basis.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.warmGrey};margin:12px 0 0`;
    card.append(basis);
    return card;
  }

  /* ---- the § 3.3 primary, forwarded by the shell through the handle ---- */

  function primary(): void {
    if (running || loaded === undefined) return;
    /* Bound here rather than read inside the callback: the run's resources are the ones the press
     * was made against, and a narrowed local is also what makes the callback body total. */
    const resources = loaded.resources;
    const entry = currentEntry();
    if (entry === undefined) return;
    const session = sessionOf(entry);

    if (session.fixed) {
      /* `Next building` — the prototype's advance: the next case, wrapping. */
      const cases = loaded.cases.cases;
      const index = cases.findIndex((candidate) => candidate.id === entry.id);
      selectedId = cases[(index + 1) % cases.length]?.id;
      render();
      context.refreshBar();
      return;
    }

    /*
     * The pair, on a worker — GitHub issue #165. `running` is what the § 3.3 bar reads, and it is
     * set before the ask so the relabel is drawn by the very next `refreshBar` rather than after a
     * deferred task. There is nothing left to defer past: the click handler returns immediately
     * and the thread is free while the worker runs. The `afterPaint` wrapper that used to stand
     * here — a `requestAnimationFrame` around a `setTimeout`, whose whole subject was getting the
     * relabel painted before a blocking task — went with the block it was working around.
     *
     * The spend is bound here for the same reason the resources are: the outcome is classified
     * against the state the press was made in, never one the player edited while it ran.
     */
    const plan = fixitRunPlanOf(entry, session.state, resources);
    const spend = spendOf(entry, session.state);
    ask = `${entry.id}:press`;
    runFailure = undefined;
    running = true;
    context.refreshBar();
    render();
    runner.start({
      runs: [
        { config: plan.asBuilt, ...FIXIT_RUN_SWITCHES },
        { config: plan.asRepaired, ...FIXIT_RUN_SWITCHES },
      ],
      onDone: ([before, after]) => {
        ask = undefined;
        running = false;
        if (before === undefined || after === undefined) return;
        session.asBuilt = before;
        session.outcome = classifyOutcome(entry, measuredOf(entry, before, after), spend);
        /*
         * The FIXED badge follows the **latest** run, in both directions — never a high-water mark.
         * `docs/20` defect 16 is the argument: the Engineer panel latched on the first fixed outcome
         * and nothing cleared it, so a case stayed badged FIXED beside an outcome card reading
         * *"9 waits → 9 waits · 0 % of it went away"* — two verdicts about one case on one screen.
         * The badge, the § 3.3 primary and the outcome card all read this one run.
         *
         * The rule itself lives in `fixit/engine.ts#fixedBadgeAfter`, which both this screen and the
         * Engineer panel consume, so the two surfaces cannot come to disagree about what FIXED means.
         */
        session.fixed = fixedBadgeAfter(session.outcome);
        // In both directions — see `keepSolved`. A case that has just stopped being FIXED stops
        // being kept, or a reload would restore a badge this run has already taken away.
        keepSolved();
        if (!alive) return;
        render();
        context.refreshBar();
        root.querySelector('.everyday-fixit-outcome')?.scrollIntoView({ block: 'nearest' });
      },
      onFailed: (message) => {
        ask = undefined;
        running = false;
        runFailure = message;
        if (!alive) return;
        render();
        context.refreshBar();
      },
    });
  }

  if (loaded === undefined && loadFailure === undefined) {
    render(); // the loading line
    void ensureLoaded().then(() => {
      if (!alive) return;
      selectFirstUnsolved();
      render();
      context.refreshBar();
    });
  } else {
    selectFirstUnsolved();
    render();
    context.refreshBar();
  }

  return {
    unmount: () => {
      alive = false;
    },
    primary,
  };
}

/**
 * The § 3.3 refinement — pure over the module store, worded by
 * `fixitScreenModel.ts#fixitBarModel`. The shell calls it on every bar draw, and the screen asks
 * for a redraw (`refreshBar`) whenever a press changes one of the four flags.
 */
function fixitBar(state: EverydayState): ActionBarModel {
  // The shell draws the bar independently of the mount, so this reader seeds the set too — a
  // restored FIXED case must reach § 3.3's `Next building` on the first draw, not the second.
  ensureRestored();
  const base = actionBarFor(state);
  const entry = currentEntry();
  const session = entry === undefined ? undefined : sessions.get(entry.id);
  return fixitBarModel(base, {
    ready: entry !== undefined,
    running,
    ran: session?.outcome !== undefined,
    solved: session?.fixed === true,
  });
}

/** The registry row — GAMEPLAY § 10's screen, mounted by `shell.ts` through `screens.ts`. */
export const FIXIT_SCREEN: EverydayScreenModule = {
  key: 'fixit',
  mount: mountFixit,
  bar: fixitBar,
};
