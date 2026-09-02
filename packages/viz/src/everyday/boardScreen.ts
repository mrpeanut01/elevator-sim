/**
 * **Today's board / Dispatcher ladder** — GAMEPLAY § 14, the DOM half, and the gauntlet's landing
 * place (§ 20.10: *"The gauntlet has **no screen of its own**: pressing it runs the forty cases
 * with progress in place and lands on the ladder."*).
 *
 * ## Two tabs, and only one of them can be honest in this build
 *
 * § 14: *"Both live on one screen behind two tabs."* They answer different questions (§ 11.7) — the
 * **daily board** asks who had the best Friday and resets tomorrow; the **ladder** asks whose
 * dispatcher holds up everywhere. The daily board is a ranking of *other people's* runs, each
 * replayed and verified by a server before it appears, and this build has no server: its tab
 * therefore draws § 12.2's labelled unavailable state and *"the screen is otherwise complete"*
 * (issue #123). The ladder needs no server at all — a rating is a mean over forty fixed cases, and
 * this device can run them — so it is live.
 *
 * That split is why the screen is registered rather than left refusing. `screens.ts`' old sentence
 * for this key read *"needs a server to post and rank runs, and this build has none"*, which was
 * true of one half and false of the other, and § D227's rule binds both ways: a refusal that tells
 * a player not to touch a thing that works is worse than a dead seam.
 *
 * ## What this file decides: nothing
 *
 * Every word is `gauntlet/ladder.ts`'s or `gauntlet/rating.ts`'s, every number is
 * `batch/runBatch.ts`'s folded by `gauntlet/rating.ts`, and the forty are
 * `data/proof-cases.json`'s. The screen's own literals are {@link BOARD_SCREEN_COPY} — the tab
 * names and the section eyebrows — plus the mount-status line every self-loading screen carries.
 * The disclosure's building names come from `data/buildings/` through a resolver, which is why no
 * tower name appears in this file (`gauntlet/proofCases.test.ts` asserts that across the tree).
 *
 * ## The forty run on a worker, and the rating outlives the tab
 *
 * `runGauntlet` is handed `new Worker(new URL('../dev/batchWorker.ts', …))` — the same worker the
 * bench uses, for the same measured reason (`dev/batchWorker.ts`: one replication is a synchronous
 * `Simulation.run()`, 196 ms of dropped frames on Vertical City, and forty of those would be a
 * minute or more of a page that does not answer a click).
 *
 * This section used to name an absence — *ratings live in module scope … a rating ends with the
 * tab* — and GitHub issue #224 closed it. {@link RATINGS} is still the map the screen draws from,
 * because a ladder is a *standing* rating and one row per dispatcher is the rule; what changed is
 * that the map is seeded from `everyday/profile.ts`'s slot on first mount and written back on every
 * finished gauntlet ([§ D433](../../../../DECISIONS.md)).
 *
 * **What is kept is the forty cases, not the mean** ([§ D434](../../../../DECISIONS.md)): the row's
 * figures are rebuilt by `gauntlet/ladder.ts#ladderEntryOf` through the same `ratingOf` a live
 * gauntlet folds with, so a restored row and one computed a second ago cannot disagree about an
 * arithmetic. `fingerprintOf` is what makes a restored rating usable rather than merely present —
 * § 11.7's *edited since* is a comparison against the dispatcher **as it stands now**, and that
 * comparison is the same one whether the digest arrived from storage or from this sitting.
 */

import type { DispatcherProfile, ResolvedBuilding } from '@elevator-sim/core/browser';

import { savedProfilesOf } from '../batch/library.js';
import { loadBrowserResources, loadProofCases, type BrowserResources } from '../dev/data.js';
import {
  caseNamesOf,
  ladderEntryOf,
  ladderRowsOf,
  savedRatingOf,
  sendGateOf,
  whatAreTheFortyOf,
  LADDER_CAVEAT,
  LADDER_EMPTY,
  LADDER_WORLD_ABSENCE,
  type LadderEntry,
  type LadderRowView,
  type TowerFacts,
} from '../gauntlet/ladder.js';
import type { ProofCaseSet } from '../gauntlet/proofCases.js';
import { RATING_BASIS } from '../gauntlet/rating.js';
import { runGauntlet, type GauntletHandle, type GauntletWorker } from '../gauntlet/run.js';

import { DAILY_BOARD_METRIC, type EverydayDailyBoard } from './host.js';
import { everydayProgressWith } from './profile.js';
import { everydayProfileStore } from './profileStore.js';
import type { EverydayScreenContext, EverydayScreenHandle, EverydayScreenModule } from './screens.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as G,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';

/**
 * The screen's own chrome, frozen so a sweep renders every sentence.
 *
 * § 14.2's rule is followed literally: each tab *"states its nature in an eyebrow rather than a
 * sentence"*, and the two eyebrows below are the guide's own — `ONE CROWD · RESETS TOMORROW`
 * against `STANDING · 8 BUILDINGS × 5 CROWDS`. The ladder's is composed from the parsed set's own
 * lengths rather than written out, for the reason the disclosure's arithmetic is: a set that grew a
 * tower must not leave an eyebrow claiming eight.
 */
export const BOARD_SCREEN_COPY = Object.freeze({
  eyebrow: 'WHO HELD UP',
  title: "Today's board · Dispatcher ladder",
  dailyTab: "Today's board",
  dailyEyebrow: 'ONE CROWD · RESETS TOMORROW',
  ladderTab: 'Dispatcher ladder',
  columnDispatcher: 'DISPATCHER',
  columnRating: 'RATING',
  columnProof: 'PROOF CASES',
  columnWeakest: 'WEAKEST AT',
  sendEyebrow: 'PROVE A DISPATCHER',
  cancel: 'Stop the gauntlet',
  loading: 'Loading the proof cases…',
  /*
   * The daily tab's four non-row states. Short on purpose: § D456 gave `charter P2` a second
   * refusal test — *can the player still play?* — and a board that cannot be shown is the moment a
   * screen is most tempted to explain itself at length. Each of these says what happened and what
   * it means for the tab beside it, and stops.
   */
  dailyAsking: 'Asking the server for today’s board…',
  dailyUnreachable:
    'Today’s board could not be reached just now. Nothing is wrong with your run, and the ladder ' +
    'beside it is unaffected — its ratings are measured on this device.',
  dailyUndeclared:
    'The server answered but did not say which day is running. That is a server too old to name ' +
    'one rather than a day with no board, so there is nothing to show rather than an empty table.',
  dailyEmpty: 'Nobody has posted to today’s board yet. It resets tomorrow.',
  /*
   * A row whose server sent no `n`. Short, and in the figure's own place rather than a footnote,
   * because the thing a reader wants to know is why *this* row has no number while its neighbours
   * do — and the ranking is still the server's, which is why the row stays on the board at all.
   */
  dailyRowWithheld: 'no count',
  crowdsHeading: 'THE FIVE CROWD SHAPES',
  towersHeading: 'THE EIGHT BUILDINGS',
} as const);

/** The ladder's eyebrow, from the set's own two lengths. § 14.2's `STANDING · …` card. */
function ladderEyebrowOf(set: ProofCaseSet): string {
  return (
    `STANDING · ${String(set.towers.length)} BUILDINGS × ` +
    `${String(set.crowds.length)} CROWDS`
  );
}

/**
 * A digest of the weight vector a rating was taken over — § 11.7's *edited since*.
 *
 * The weights and nothing else, sorted, so the digest is stable under key order and moves when and
 * only when the thing the rating is a claim about moves. A rename does not invalidate a rating and
 * this is why.
 */
function fingerprintOf(profile: DispatcherProfile): string {
  return Object.entries(profile.weights)
    .map(([term, weight]) => `${term}=${String(weight)}`)
    .sort()
    .join(',');
}

/** `19 floors · 6 lifts`, from the building document. Never authored beside the proof case. */
function towerFactsOf(building: ResolvedBuilding): TowerFacts {
  const lifts = building.banks.reduce((count, bank) => count + bank.cars.length, 0);
  return {
    name: building.name,
    spec: `${String(building.floors.length)} floors · ${String(lifts)} lifts`,
  };
}

/**
 * Ratings measured on this device — this sitting's, and every earlier one's.
 *
 * Keyed by dispatcher id, so a second gauntlet on the same dispatcher replaces its row rather than
 * adding one — a ladder is a *standing* rating and two rows for one dispatcher would be two claims
 * about one thing. The same rule holds in the bytes, through
 * `everyday/profile.ts#everydayProgressWith`; this map used to be the only place it held, and the
 * two would drift the day a lane changed one of them.
 */
const RATINGS = new Map<string, LadderEntry>();

/** Whether {@link ensureRestored} has already run. Once per tab, like the proof-case load. */
let restored = false;

/**
 * Seed {@link RATINGS} from what the last sitting earned — GitHub issue #224.
 *
 * Into the same map the live gauntlet writes, so `ladderRowsOf` receives one kind of entry and
 * every rule about staleness, sorting and the incomplete note applies to a restored row unchanged.
 * A second list beside it would have needed the sort and the *edited since* comparison applied
 * twice, and § 14's table would have been two tables drawn on top of each other.
 */
function ensureRestored(): void {
  if (restored) return;
  restored = true;
  for (const saved of everydayProfileStore().progress().ratings) {
    RATINGS.set(saved.dispatcherId, ladderEntryOf(saved));
  }
}

/** Loaded once per tab, as `everyday/fixitScreen.ts` caches its own. */
let loaded: Promise<{ resources: BrowserResources; set: ProofCaseSet }> | undefined;

function load(): Promise<{ resources: BrowserResources; set: ProofCaseSet }> {
  loaded ??= (async () => {
    const resources = await loadBrowserResources();
    return { resources, set: await loadProofCases(resources) };
  })();
  return loaded;
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;
const NOTE = `font-size:13px;line-height:1.55;color:${C.warmGrey};margin:${String(G.row)}px 0 0;max-width:70ch;text-wrap:pretty`;

function mount(host: HTMLElement, context: EverydayScreenContext): EverydayScreenHandle {
  const doc = host.ownerDocument;
  // Before the first draw reads RATINGS — a restored ladder must be there on the first paint.
  ensureRestored();
  const root = el(doc, 'div');
  root.className = 'everyday-board';
  root.style.cssText = 'max-width:860px';

  let tab: 'daily' | 'ladder' = 'ladder';
  let data: { resources: BrowserResources; set: ProofCaseSet } | undefined;
  let running: GauntletHandle | undefined;
  let progressLine: string | undefined;
  let stoppedLine: string | undefined;
  let disposed = false;
  /** `undefined` while the read is in flight — the fifth thing this tab can be drawing. */
  let board: EverydayDailyBoard | undefined;

  const status = el(doc, 'div', BOARD_SCREEN_COPY.loading);
  status.style.cssText = NOTE;

  const body = el(doc, 'div');

  /* ---------------------------------------------------------------- header */

  const eyebrow = el(doc, 'div', BOARD_SCREEN_COPY.eyebrow);
  eyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.16em;color:${C.label}`;
  const title = el(doc, 'h1', BOARD_SCREEN_COPY.title);
  title.style.cssText = `font-family:${TYPE.heading};font-size:34px;font-weight:700;letter-spacing:-.02em;margin:10px 0 0`;
  const tabs = el(doc, 'div');
  tabs.style.cssText = `display:flex;gap:${String(G.block)}px;margin:${String(G.section)}px 0 0;flex-wrap:wrap`;
  root.append(eyebrow, title, tabs, status, body);

  /**
   * § 14.2's tab cards: *"two cards, not two pills"*, each stating its nature in an eyebrow, the
   * daily board dotted terracotta (a day, a moment) and the ladder squared moss (a standing
   * rating), selected filled ink and unselected outline.
   */
  function tabCard(
    key: 'daily' | 'ladder',
    label: string,
    cardEyebrow: string,
    mark: string,
    markColor: string,
  ): HTMLButtonElement {
    const node = doc.createElement('button');
    node.type = 'button';
    node.className = `everyday-board-tab everyday-board-tab-${key}`;
    node.setAttribute('aria-pressed', String(tab === key));
    const selected = tab === key;
    node.style.cssText = [
      'text-align:left',
      'cursor:pointer',
      `border:1.5px solid ${selected ? C.ink : C.rule}`,
      `border-radius:${String(R.card)}px`,
      `background:${selected ? C.ink : C.card}`,
      `color:${selected ? C.paper : C.ink}`,
      'padding:12px 16px',
      'flex:1 1 240px',
    ].join(';');
    const top = el(doc, 'div');
    top.style.cssText = `display:flex;align-items:center;gap:${String(G.tight)}px`;
    const dot = el(doc, 'span', mark);
    dot.style.cssText = `color:${markColor};font-size:12px`;
    const eyebrowNode = el(doc, 'span', cardEyebrow);
    eyebrowNode.style.cssText = `font:500 10px ${TYPE.mono};letter-spacing:.12em;color:${selected ? C.fainter : C.label}`;
    top.append(dot, eyebrowNode);
    const name = el(doc, 'div', label);
    name.style.cssText = `font-family:${TYPE.heading};font-size:19px;font-weight:600;margin-top:4px`;
    node.append(top, name);
    node.addEventListener('click', () => {
      tab = key;
      redraw();
    });
    return node;
  }

  /* ------------------------------------------------------------ the ladder */

  function ladderTable(rows: readonly LadderRowView[]): HTMLElement {
    const table = doc.createElement('table');
    table.className = 'everyday-ladder';
    table.style.cssText = `width:100%;border-collapse:collapse;margin-top:${String(G.block)}px`;
    const head = doc.createElement('tr');
    /* § 14.2: the ladder's header band is ink — a plate, not a notice. */
    for (const label of [
      BOARD_SCREEN_COPY.columnDispatcher,
      BOARD_SCREEN_COPY.columnRating,
      BOARD_SCREEN_COPY.columnProof,
      BOARD_SCREEN_COPY.columnWeakest,
    ]) {
      const cell = el(doc, 'th', label);
      cell.style.cssText = `${EYEBROW};background:${C.ink};color:${C.fainter};text-align:left;padding:8px 10px`;
      head.append(cell);
    }
    table.append(head);
    for (const row of rows) {
      const line = doc.createElement('tr');
      line.className = 'everyday-ladder-row';
      const nameCell = doc.createElement('td');
      nameCell.style.cssText = `padding:10px;border-bottom:1px solid ${C.ruleLight};font-size:14.5px`;
      nameCell.append(el(doc, 'span', row.name));
      /* § 20.11 / § 14: a reference run is labelled and is never presented as a player. */
      if (row.referenceLabel !== null) {
        const tag = el(doc, 'span', row.referenceLabel);
        tag.className = 'everyday-ladder-reference';
        tag.style.cssText = `margin-left:8px;font:500 10px ${TYPE.mono};letter-spacing:.1em;color:${C.warmGrey};border:1px solid ${C.rule};border-radius:${String(R.pill)}px;padding:2px 8px`;
        nameCell.append(tag);
      }
      if (row.staleness !== null) {
        const tag = el(doc, 'span', row.staleness);
        tag.className = 'everyday-ladder-staleness';
        tag.style.cssText = `margin-left:8px;font:500 10px ${TYPE.mono};letter-spacing:.1em;color:${C.terracotta}`;
        nameCell.append(tag);
      }
      if (row.incompleteNote !== null) {
        const note = el(doc, 'div', row.incompleteNote);
        note.style.cssText = `font-size:12px;color:${C.warmGrey};margin-top:4px`;
        nameCell.append(note);
      }
      line.append(nameCell);
      /* § 14.2: the rating column is keyed moss. */
      for (const [value, color] of [
        [row.rating, C.moss],
        [row.proofCases, C.ink],
        [row.weakestAt, C.ink],
      ] as const) {
        const cell = el(doc, 'td', value);
        cell.style.cssText = `padding:10px;border-bottom:1px solid ${C.ruleLight};font:500 14px ${TYPE.mono};color:${color}`;
        line.append(cell);
      }
      table.append(line);
    }
    return table;
  }

  function disclosure(set: ProofCaseSet, resources: BrowserResources): HTMLElement {
    const view = whatAreTheFortyOf(set, (towerId) => {
      const building = resources.buildings.find((candidate) => candidate.id === towerId);
      /*
       * `parseProofCases` refused any tower this build does not ship, so the lookup is total. The
       * throw is the statement of that, not a branch a reader can reach.
       */
      if (building === undefined) throw new Error(`proof tower "${towerId}" has no building`);
      return towerFactsOf(building);
    });
    const node = doc.createElement('details');
    node.className = 'everyday-forty';
    node.style.cssText = `margin-top:${String(G.section)}px;border:1px solid ${C.rule};border-radius:${String(R.card)}px;background:${C.card};padding:14px 18px`;
    const summary = doc.createElement('summary');
    summary.textContent = view.heading;
    summary.style.cssText = `cursor:pointer;font-family:${TYPE.heading};font-size:17px;font-weight:600`;
    node.append(summary);

    const towersHeading = el(doc, 'div', BOARD_SCREEN_COPY.towersHeading);
    towersHeading.style.cssText = `${EYEBROW};margin:${String(G.block)}px 0 6px`;
    node.append(towersHeading);
    for (const tower of view.towers) {
      const line = el(doc, 'div');
      line.className = 'everyday-forty-tower';
      line.style.cssText = `margin-bottom:7px;font-size:13.5px;line-height:1.5;color:${C.inkSoft}`;
      const name = el(doc, 'strong', tower.name);
      const spec = el(doc, 'span', ` — ${tower.spec} — `);
      spec.style.cssText = `font:500 12.5px ${TYPE.mono};color:${C.warmGrey}`;
      line.append(name, spec, el(doc, 'span', tower.why));
      node.append(line);
    }

    const crowdsHeading = el(doc, 'div', BOARD_SCREEN_COPY.crowdsHeading);
    crowdsHeading.style.cssText = `${EYEBROW};margin:${String(G.block)}px 0 6px`;
    node.append(crowdsHeading);
    for (const crowd of view.crowds) {
      const line = el(doc, 'div');
      line.className = 'everyday-forty-crowd';
      line.style.cssText = `margin-bottom:7px;font-size:13.5px;line-height:1.5;color:${C.inkSoft}`;
      line.append(el(doc, 'strong', crowd.label), el(doc, 'span', ` — ${crowd.tests}`));
      node.append(line);
    }

    for (const sentence of [view.arithmetic, view.basis, view.caveat]) {
      const line = el(doc, 'p', sentence);
      line.style.cssText = NOTE;
      node.append(line);
    }
    return node;
  }

  /* ------------------------------------------------------------- the press */

  function startGauntlet(set: ProofCaseSet, resources: BrowserResources): void {
    const candidate = context.host.editedDispatcher();
    const profile = context.host.dispatcherById(candidate.id);
    if (profile === undefined) return;
    stoppedLine = undefined;
    progressLine = '';
    running = runGauntlet({
      set,
      dispatcherProfileId: candidate.id,
      // The shelf the id is resolved against — issues #167 and #228, § D443. Without it a send
      // of a *saved* dispatcher (which is what the gate above exists to admit) failed at case one.
      savedProfiles: savedProfilesOf(context.host.savedDispatchers()),
      replications: 1,
      towerNameOf: (towerId) =>
        resources.buildings.find((building) => building.id === towerId)?.name ?? towerId,
      createWorker: () =>
        new Worker(new URL('../dev/batchWorker.ts', import.meta.url), {
          type: 'module',
        }) as unknown as GauntletWorker,
      onProgress: (progress) => {
        if (disposed) return;
        progressLine = progress.line;
        redraw();
      },
      onFinished: (summary) => {
        if (disposed) return;
        const entry: LadderEntry = {
          dispatcherId: candidate.id,
          dispatcherName: profile.name,
          isReference: resources.dispatcherProfiles.profiles.some(
            (shipped) => shipped.id === candidate.id,
          ),
          fingerprint: fingerprintOf(profile),
          summary,
        };
        RATINGS.set(candidate.id, entry);
        /*
         * Kept here rather than in `runGauntlet`, which is pure of storage on purpose: the run
         * reports a rating and this screen decides what a rating is for. `everydayProgressWith`
         * holds the one-row-per-dispatcher rule in the bytes, matching the map above.
         */
        const store = everydayProfileStore();
        store.setProgress(everydayProgressWith(store.progress(), savedRatingOf(entry)));
        running = undefined;
        progressLine = undefined;
        tab = 'ladder';
        redraw();
      },
      onStopped: (reason) => {
        if (disposed) return;
        running = undefined;
        progressLine = undefined;
        stoppedLine = reason;
        redraw();
      },
    });
    redraw();
  }

  function sendBlock(set: ProofCaseSet, resources: BrowserResources): HTMLElement {
    const block = el(doc, 'div');
    block.style.cssText = `margin-top:${String(G.section)}px;border:1px solid ${C.rule};border-radius:${String(R.card)}px;background:${C.card};padding:16px 18px`;
    const heading = el(doc, 'div', BOARD_SCREEN_COPY.sendEyebrow);
    heading.style.cssText = EYEBROW;
    block.append(heading);

    const candidate = context.host.editedDispatcher();
    const gate = sendGateOf({
      dispatcherId: candidate.id,
      dispatcherName: candidate.name,
      dirty: candidate.dirty || context.host.dispatcherById(candidate.id) === undefined,
    });

    if (running !== undefined) {
      const line = el(doc, 'div', progressLine ?? '');
      line.className = 'everyday-gauntlet-progress';
      line.setAttribute('role', 'status');
      line.style.cssText = `margin-top:10px;font:500 13px ${TYPE.mono};color:${C.terracotta}`;
      const stop = doc.createElement('button');
      stop.type = 'button';
      stop.className = 'everyday-gauntlet-cancel';
      stop.textContent = BOARD_SCREEN_COPY.cancel;
      stop.style.cssText = `margin-top:10px;cursor:pointer;border:1.5px solid ${C.rule};border-radius:${String(R.pill)}px;background:${C.paper};color:${C.ink};padding:8px 16px;font-family:${TYPE.body};font-size:14px`;
      stop.addEventListener('click', () => {
        running?.cancel();
      });
      block.append(line, stop);
      return block;
    }

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'everyday-gauntlet-send';
    button.textContent = gate.label;
    button.disabled = !gate.sendable;
    button.style.cssText = [
      'margin-top:10px',
      gate.sendable ? 'cursor:pointer' : 'cursor:not-allowed',
      'border:none',
      `border-radius:${String(R.pill)}px`,
      `background:${gate.sendable ? C.ink : C.ruleLight}`,
      `color:${gate.sendable ? C.paper : C.warmGrey}`,
      'padding:10px 20px',
      `font-family:${TYPE.body}`,
      'font-size:15px',
      'font-weight:600',
    ].join(';');
    button.addEventListener('click', () => {
      if (!gate.sendable) return;
      startGauntlet(set, resources);
    });
    block.append(button);

    /* § 20.10's check: a dirty dispatcher cannot be sent **and the button says why**. */
    if (gate.refusal !== null) {
      const refusal = el(doc, 'p', gate.refusal);
      refusal.className = 'everyday-gauntlet-refusal';
      refusal.style.cssText = NOTE;
      block.append(refusal);
    }
    if (stoppedLine !== undefined) {
      const stopped = el(doc, 'p', stoppedLine);
      stopped.className = 'everyday-gauntlet-stopped';
      stopped.style.cssText = `${NOTE};color:${C.terracotta}`;
      block.append(stopped);
    }
    const basis = el(doc, 'p', RATING_BASIS);
    basis.style.cssText = NOTE;
    block.append(basis);
    return block;
  }

  /* --------------------------------------------------------------- drawing */

  /**
   * {@link dailyBoardViewOf}'s answer, drawn. The decision about *what* the tab says lives in that
   * pure function so all five states are drivable without a document; this renders it and nothing
   * more, which is the same split `dev/reportPanel.ts` uses for the same reason.
   */
  function dailyBlock(): HTMLElement {
    const view = dailyBoardViewOf(board);
    const wrap = el(doc, 'div');
    wrap.style.cssText = `margin-top:${String(G.section)}px`;
    for (const line of view.lines) {
      const p = el(doc, 'p', line.text);
      p.className = line.className;
      p.style.cssText = line.role === 'reason' ? NOTE : `${NOTE};color:${C.label}`;
      wrap.append(p);
    }
    if (view.rows.length === 0) return wrap;

    const rows = el(doc, 'div');
    rows.className = 'everyday-board-rows';
    rows.style.cssText = `display:grid;gap:${String(G.row)}px;margin-top:${String(G.block)}px`;
    for (const entry of view.rows) {
      const row = el(doc, 'div');
      row.className = 'everyday-board-row';
      row.style.cssText = `display:flex;gap:${String(G.block)}px;align-items:baseline;font-size:13.5px`;
      const place = el(doc, 'span', entry.place);
      place.style.cssText = `font:600 12px ${TYPE.mono};color:${C.label};min-width:2ch`;
      const who = el(doc, 'span', entry.displayName);
      who.style.cssText = 'flex:1';
      const wait = el(doc, 'span', entry.figure);
      wait.style.cssText = `font:600 13px ${TYPE.mono}`;
      row.append(place, who, wait);
      if (entry.count !== undefined) {
        /* In the row, beside the mean — R13's clause one is about the visual unit, not the page. */
        const count = el(doc, 'span', entry.count);
        count.className = 'everyday-board-row-count';
        count.style.cssText = `font:500 11px ${TYPE.mono};color:${C.label}`;
        row.append(count);
      }
      rows.append(row);
    }
    wrap.append(rows);
    return wrap;
  }

  function redraw(): void {
    if (disposed) return;
    tabs.replaceChildren();
    body.replaceChildren();
    if (data === undefined) return;
    const { set, resources } = data;
    status.textContent = '';
    tabs.append(
      tabCard(
        'daily',
        BOARD_SCREEN_COPY.dailyTab,
        BOARD_SCREEN_COPY.dailyEyebrow,
        '●',
        C.terracotta,
      ),
      tabCard('ladder', BOARD_SCREEN_COPY.ladderTab, ladderEyebrowOf(set), '■', C.moss),
    );

    if (tab === 'daily') {
      body.append(dailyBlock());
      return;
    }

    const names = caseNamesOf(set, (towerId) => {
      const building = resources.buildings.find((candidate) => candidate.id === towerId);
      return building?.name ?? towerId;
    });
    const rows = ladderRowsOf([...RATINGS.values()], {
      fingerprintOf: (dispatcherId) => {
        const profile = context.host.dispatcherById(dispatcherId);
        return profile === undefined ? undefined : fingerprintOf(profile);
      },
      caseNameOf: (caseId) => names.get(caseId) ?? caseId,
    });

    /*
     * What the player is owed about their kept ratings — GitHub issue #224, and the reason it is
     * drawn **above** the table rather than in the footnotes: `LADDER_EMPTY` says *nothing has been
     * through the gauntlet on this device yet*, which is a claim about the player and is false when
     * a store that holds ratings could not be read. The notice is the sentence that keeps that
     * claim honest, and it is `everyday/profile.ts`'s so the fix screen says the same thing.
     */
    const kept = everydayProfileStore().progressNotice();
    if (kept !== null) {
      const line = el(doc, 'p', kept);
      line.className = 'everyday-ladder-progress-notice';
      line.style.cssText = `${NOTE};margin-top:${String(G.section)}px`;
      body.append(line);
    }

    if (rows.length === 0) {
      const empty = el(doc, 'p', LADDER_EMPTY);
      empty.className = 'everyday-ladder-empty';
      empty.style.cssText = `${NOTE};margin-top:${String(G.section)}px`;
      body.append(empty);
    } else {
      body.append(ladderTable(rows));
      const caveat = el(doc, 'p', LADDER_CAVEAT);
      caveat.className = 'everyday-ladder-caveat';
      caveat.style.cssText = NOTE;
      body.append(caveat);
    }

    const world = el(doc, 'p', LADDER_WORLD_ABSENCE);
    world.className = 'everyday-ladder-world-absent';
    world.style.cssText = NOTE;
    body.append(world, sendBlock(set, resources), disclosure(set, resources));
  }

  /*
   * Asked once per mount, beside the proof-case load rather than after it: the two are independent
   * and a board that waited on forty local case definitions would be slower for no reason. A
   * rejection is impossible by the port's contract — every failure is one of its four states — so a
   * `catch` here would be dead code, and `dailyBoard` is the one place that could make it not be.
   */
  void context.host.dailyBoard().then((answer) => {
    if (disposed) return;
    board = answer;
    redraw();
  });

  load()
    .then((result) => {
      if (disposed) return;
      data = result;
      redraw();
    })
    .catch((error: unknown) => {
      if (disposed) return;
      status.textContent = `The proof cases could not be loaded: ${
        error instanceof Error ? error.message : String(error)
      }`;
    });

  host.append(root);

  return {
    unmount: () => {
      disposed = true;
      running?.cancel();
      running = undefined;
    },
  };
}

/**
 * § 12.2's labelled unavailable state for the daily board — the half that genuinely needs a server.
 *
 * It says which half is absent and why, rather than the old whole-screen refusal that also covered
 * a ladder needing nothing. Exported so `screens.test.ts` and the sweep can read the one sentence.
 *
 * **It is now one arm of four rather than the tab's standing sentence, and that is issue #221's
 * whole point.** It used to be drawn unconditionally, so it said *this build has none* about every
 * build including one started against a server, which is § D227's stale refusal with the polarity
 * that matters: a sentence telling a player not to expect a thing that works. It is drawn now only
 * when {@link EverydayDailyBoard} comes back `no-server` — the host holds no client, so the claim
 * is measured rather than asserted. The other three absences are {@link BOARD_SCREEN_COPY}'s, and
 * a board that arrives draws rows.
 */
export const DAILY_BOARD_ABSENCE =
  "Today's board ranks other people's runs, and every one of them is replayed and verified before " +
  'it appears. That needs a server to post and rank runs, and this build has none — so there are ' +
  'no rows here rather than invented ones. The ladder beside it needs no server: its ratings are ' +
  'measured on this device, over the same forty cases for everybody.';

/** One line of the daily tab's prose. `note` is the quieter grey the loading line uses. */
export interface DailyBoardLine {
  readonly text: string;
  readonly className: string;
  readonly role: 'reason' | 'note';
}

/** One posted run, ranked. Both strings are pre-formatted so the renderer decides nothing. */
export interface DailyBoardRowView {
  readonly place: string;
  readonly displayName: string;
  /** The mean wait, or the withholding sentence when this row carries no count. */
  readonly figure: string;
  /**
   * The `n` behind {@link figure}, in the row's own box — R13 clause one.
   *
   * `undefined` only when {@link figure} is the withholding, so the two are never both absent: a
   * row either says a number and what it is over, or says why it is saying neither.
   */
  readonly count: string | undefined;
}

/** What the daily tab says and shows, for any one of its five states. */
export interface DailyBoardView {
  readonly lines: readonly DailyBoardLine[];
  readonly rows: readonly DailyBoardRowView[];
}

/**
 * § 12.2's rule, now that there is a server to ask: every state is labelled and the screen is
 * otherwise complete. Five of them, and **the two that must never share a sentence are *nobody has
 * posted today* and *we could not ask***. The ladder beside this board already makes that
 * distinction, for the same reason — an empty line is a claim about the world, and a claim is false
 * when the answer was never obtained.
 *
 * `undefined` is the fifth, and it is not an absence: the read is still in flight. Drawing an
 * absence there would publish *nobody has posted* for as long as the network takes, which is the
 * same defect one state early.
 *
 * There are still no authored rows anywhere in this file. What changed with issue #221 is that an
 * absent board is four different absences rather than one, and only one of them is *this build has
 * no server* — see {@link DAILY_BOARD_ABSENCE} for why that one used to be all four.
 *
 * Pure and exported so `boardScreen.test.ts` can drive every state without a document, and so the
 * shape of the decision is readable without reading a renderer.
 */
export function dailyBoardViewOf(board: EverydayDailyBoard | undefined): DailyBoardView {
  const only = (text: string, className: string, role: 'reason' | 'note' = 'reason'): DailyBoardView => ({
    lines: [{ text, className, role }],
    rows: [],
  });

  if (board === undefined) {
    return only(BOARD_SCREEN_COPY.dailyAsking, 'everyday-board-asking', 'note');
  }
  switch (board.kind) {
    case 'no-server':
      return only(DAILY_BOARD_ABSENCE, 'everyday-board-absent');
    case 'unreachable':
      /* Ours saying what happened, then the server's own sentence carried rather than paraphrased. */
      return {
        lines: [
          {
            text: BOARD_SCREEN_COPY.dailyUnreachable,
            className: 'everyday-board-unreachable',
            role: 'reason',
          },
          {
            text: board.detail,
            className: 'everyday-board-unreachable-detail',
            role: 'note',
          },
        ],
        rows: [],
      };
    case 'undeclared':
      return only(BOARD_SCREEN_COPY.dailyUndeclared, 'everyday-board-undeclared');
    case 'board': {
      const note: DailyBoardLine = {
        text: board.note,
        className: 'everyday-board-note',
        role: 'reason',
      };
      if (board.rows.length === 0) {
        return {
          lines: [
            note,
            { text: BOARD_SCREEN_COPY.dailyEmpty, className: 'everyday-board-empty', role: 'note' },
          ],
          rows: [],
        };
      }
      return {
        lines: [note],
        /*
         * One figure per row, and it is the one the board is ranked on. A row carrying more would
         * invite a comparison the ranking does not make, and `dataHash` — which says whether
         * another row is even the same question — is deliberately not drawn as though it were a
         * score.
         *
         * **The count beside it is not decoration.** A mean wait with no `n` is R13 clause one, and
         * the honesty corpus found this row drawing one the day it was written. `legs` is the
         * server's own count off its own replay, so a row from a server too old to send one has no
         * denominator this client could honestly supply — and it withholds rather than inventing.
         */
        rows: board.rows.map((entry, index) => ({
          place: String(index + 1),
          displayName: entry.displayName,
          figure:
            entry.legs === undefined
              ? BOARD_SCREEN_COPY.dailyRowWithheld
              : `${entry.measured[DAILY_BOARD_METRIC].toFixed(1)} s`,
          count:
            entry.legs === undefined
              ? undefined
              : `over ${entry.legs.toLocaleString('en-US')} rides`,
        })),
      };
    }
  }
}

/** The registry row — one import and one line in `screens.ts`, plus its refusal sentence deleted. */
export const BOARD_SCREEN: EverydayScreenModule = {
  key: 'board',
  mount,
};
