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
 * in § 19's tokens and forwards presses. Its own literal is the load-failure line, which is mount
 * status text on the same footing as every excluded mount's.
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
 * ## The runs happen on the main thread, and that is a stated cost
 *
 * `dev/fixitPanel.ts`'s trade, unchanged: `recordRun` costs ~0.5–1.5 s per run on the shipped
 * buildings, the § 3.3 primary is relabelled `Running the day…` and drawn inert while the
 * synchronous pair computes, and the relabel is deferred one frame so it paints first. A case's
 * four figures need one as-built run, taken synchronously on the case's first open and cached.
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
import { figureValuesOf, fixitRunPlanOf, measuredOf, runFixitPair } from '../fixit/run.js';
import type { FixitCase, FixitCases, FixitState } from '../fixit/types.js';
import { recordRun, type RecordedRun } from '../record/recordRun.js';
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
  /** The as-built run the four figures are measurements of — cached per case. */
  asBuilt: RecordedRun | undefined;
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
    if (session.asBuilt === undefined) {
      /*
       * The four figures are measurements of the as-built run (§ 10.6), so the case opens by
       * taking one — synchronously, `runFixitPair`'s own `recordDecisions: false` (two runs'
       * worth of decisions would be carried to no reader), one run rather than the panel's
       * discarded pair.
       */
      const plan = fixitRunPlanOf(entry, emptyFixitState(), loadedFixit.resources);
      session.asBuilt = recordRun(plan.asBuilt, { recordDecisions: false });
    }
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
    for (const figure of figureValuesOf(entry, session.asBuilt.recording)) {
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
    /* Bound here rather than read inside the defer below: the run's resources are the ones the
     * press was made against, and a narrowed local is also what makes the deferred body total. */
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

    running = true;
    context.refreshBar();
    /*
     * Deferred **past a paint** so the § 3.3 relabel is on screen before the synchronous pair of
     * runs blocks the thread — `dev/fixitPanel.ts`'s stated-cost approach, with its mechanism
     * corrected.
     *
     * ## `setTimeout(…, 0)` is not "one frame", and driving it is what showed that
     *
     * That panel defers with a bare `setTimeout(…, 0)` and its comment says *"deferred one frame
     * so the relabel paints before the synchronous pair of runs"*. A zero timeout is a **task**,
     * not a frame: the browser is free to run it before the next paint, and when the task then
     * blocks the main thread for a second or more, the relabel never reaches the screen at all.
     * Measured here — `fixitScreen.browser.test.ts` waited fifteen seconds for a button reading
     * `Running the day…` and never saw one, on a run that takes seconds. The relabel was written
     * to the DOM and painted after the runs had already finished and rewritten it.
     *
     * So this is a real frame: `requestAnimationFrame` runs its callback **before** the paint that
     * follows it, and the `setTimeout` inside that callback runs after — which is the first moment
     * the relabel is guaranteed to be visible. Nesting the two is the whole fix, and it is the
     * difference between a disabled button a player sees and one that exists only in the DOM.
     *
     * A view is always present on the shipped page; the fallback runs inline rather than dropping
     * the press, because a primary that silently does nothing is worse than one that janks.
     */
    const view = doc.defaultView;
    const afterPaint = (body: () => void): void => {
      if (view === null) {
        body();
        return;
      }
      view.requestAnimationFrame(() => {
        view.setTimeout(body, 0);
      });
    };
    afterPaint(() => {
      const plan = fixitRunPlanOf(entry, session.state, resources);
      const pair = runFixitPair(plan);
      session.asBuilt = pair.before;
      const measurement = measuredOf(entry, pair.before.recording, pair.after.recording);
      session.outcome = classifyOutcome(entry, measurement, spendOf(entry, session.state));
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
      running = false;
      if (!alive) return;
      render();
      context.refreshBar();
      root.querySelector('.everyday-fixit-outcome')?.scrollIntoView({ block: 'nearest' });
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
