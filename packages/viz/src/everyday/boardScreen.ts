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

import { gapSentence } from '../menu/gap.js';
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

import { DAILY_BOARD_METRIC, type EverydayChallengeToday, type EverydayDailyBoard } from './host.js';
import { everydayAccount } from './accountPort.js';
import { everydayProgressWith } from './profile.js';
import { everydayProfileStore } from './profileStore.js';
import { WATCH_IT_LABEL } from './watchStage.js';
import type { EverydayScreenHandle, EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext } from './shell.js';
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
   * § 14.1: *"Your own row cannot be watched. Its button reads `your run` and does nothing."* The
   * one first-person string on this screen, and it is the handoff's own: the row is the player's,
   * so the pronoun is true. Applied on the signed-in display name, which is the only identity a
   * board row carries — GitHub issue #337.
   */
  dailyRowYours: 'your run',
  /*
   * A row whose server sent no `n`. Short, and in the figure's own place rather than a footnote,
   * because the thing a reader wants to know is why *this* row has no number while its neighbours
   * do — and the ranking is still the server's, which is why the row stays on the board at all.
   */
  dailyRowWithheld: 'no count',
  /*
   * The house's rows — GitHub issue #222, § D521. A tag on the row and one note under the board's
   * own. The note says the three things a reader could otherwise get wrong: nobody played these,
   * they are here so the board is never empty, and they do not rank the dispatchers — one crowd,
   * one seed, one run each is exactly the shape this project refuses to draw a conclusion from.
   */
  /*
   * The third tab — GitHub issue #221's third acceptance criterion, *"the daily challenge is
   * reachable without entering the Engineer surface"*.
   *
   * A tab rather than a screen key, and that was costed rather than preferred: a new key is edits
   * in eight files and a new row in every registry that must stay total, while a tab is one arm
   * here. § 14 already puts two boards on one screen behind tabs *because they answer different
   * questions*; a third question about who held up belongs in the same place.
   *
   * The eyebrow says the two things that separate a challenge from the board beside it: it is a
   * **set** of seeds rather than one crowd, and it opens and shuts on the server's clock rather
   * than resetting at midnight.
   */
  challengeTab: 'This week’s challenge',
  challengeEyebrow: 'A SEED SET · OPENS AND SHUTS',
  challengeAsking: 'Asking the server for this week’s challenge…',
  /*
   * The `no-server` arm. It says what a challenge *is* — the same courtesy the daily tab's absence
   * pays — because a player who has never seen one otherwise reads an empty tab as a broken one.
   * Deliberately shorter than the Engineer menu's version of this: that surface has a whole screen
   * to fill and this has a tab beside two that work.
   */
  challengeAbsence:
    'A challenge is a fixed set of numbered seeds that everybody runs, scored over the whole set ' +
    'rather than a lucky single run, and it opens and shuts on the server’s clock. Reading one ' +
    'needs a server, and this build has none — so there is nothing here rather than an invented ' +
    'ladder. The two tabs beside this one are unaffected.',
  challengeUnreachable:
    'This week’s challenge could not be reached just now. Nothing is wrong with your runs, and the ' +
    'ladder beside it is unaffected — its ratings are measured on this device.',
  /*
   * The index came back and the board did not. The challenge is still drawn above this line, which
   * is why the sentence says *the ranking* rather than *the challenge*: an upcoming challenge has
   * no board yet, and that is the commonest reason a reader will meet this.
   */
  challengeNoBoard: 'The ranking for it could not be read:',
  challengeEmpty: 'Nobody has posted to this challenge yet.',
  /** The heading over the rows. The board's own `note` is carried under them, unparaphrased. */
  challengeRowsHeading: 'WHO HAS POSTED',
  /*
   * Posting a set is not on this surface, and the absence is stated on the tab rather than left for
   * a player to discover by looking for a button. A challenge submission is a run **per seed** —
   * up to eight — and no Everyday screen runs a set; saying so is `docs/16` S9's rule about a
   * control that writes nothing, applied to a control that does not exist.
   */
  challengeCannotPost:
    'Posting to a challenge means running every seed in the set and sending them together, and no ' +
    'screen here does that yet. This tab reads the challenge and its ranking.',
  dailyHouseTag: 'house',
  dailyHouseNote:
    'Rows marked house are the game’s own runs, one per shipped dispatcher on today’s crowd, posted ' +
    'so the board is never empty. Nobody played them, and they do not rank the dispatchers: one ' +
    'crowd, one run each. Beat one and you have beaten a machine on the same arrivals.',
  /*
   * § D509 — the reset policy, said before a rating is earned (GitHub issue #252). Two clocks and
   * two sentences: the daily board is one date and resets by construction; the ladder is a standing
   * rating over forty fixed cases and never resets, decays or deletes a verified run.
   */
  ladderPolicy:
    'Ratings here do not reset and are not decayed. A rating is a mean over forty fixed cases, kept ' +
    'as the cases with their seeds and recomputed from them, so two ratings a month apart are still ' +
    'the same measurement. If the proof cases ever change, every rating is re-run from what it kept, ' +
    'and no verified run is ever deleted.',
  /*
   * The middle of today's board — GitHub issue #327, § D484's ladder drawn as words. Each axis is
   * its own line with its own count; no line combines two axes, none orders energy against wait
   * (the wire says why energy is absent, and that sentence is carried), and no interval is drawn.
   */
  worldHeading: "THE MIDDLE OF TODAY'S BOARD",
  worldUnasked: 'This build did not ask the server for the middle of the board.',
  worldUnreachable: 'The middle of the board could not be read:',
  worldAxisAwtS: 'Mean wait',
  worldAxisWt95S: '95th-percentile wait',
  worldAxisTtdMeanS: 'Time to destination',
  worldAxisPctOverLongWait: 'Share waiting past the long-wait line',
  /*
   * The heading over the cases a rating could not score — GitHub issue #295's F26. It sits under
   * the incomplete note rather than replacing it: the note says the mean is not comparable, and
   * this says which cases are missing from it and what each of them said. `rating.ts` computes
   * that sentence for every unscored case and, until #295, nothing rendered it.
   */
  droppedHeading: 'Not in this mean',
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

function mount(host: HTMLElement, context: EverydayScreenShellContext): EverydayScreenHandle {
  const doc = host.ownerDocument;
  // Before the first draw reads RATINGS — a restored ladder must be there on the first paint.
  ensureRestored();
  const root = el(doc, 'div');
  root.className = 'everyday-board';
  root.style.cssText = 'max-width:860px';

  let tab: 'daily' | 'ladder' | 'challenge' = 'ladder';
  let data: { resources: BrowserResources; set: ProofCaseSet } | undefined;
  let running: GauntletHandle | undefined;
  let progressLine: string | undefined;
  let stoppedLine: string | undefined;
  let disposed = false;
  /** `undefined` while the read is in flight — the fifth thing this tab can be drawing. */
  let board: EverydayDailyBoard | undefined;
  /** The same, for the challenge tab — GitHub issue #221's third criterion. */
  let challenge: EverydayChallengeToday | undefined;
  /** Rows whose press the gate refused, by the server's row id, with the reason — GitHub issue #337. */
  const watchRefused = new Map<string, string>();

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
    key: 'daily' | 'ladder' | 'challenge',
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
      /*
       * Which cases are missing from the mean, and what each one said — § 14 and GitHub issue
       * #295's F26. Under the note rather than beside the `39 of 40` cell, because the cell is a
       * count and these are sentences; a column of them would be unreadable at four cases and
       * nonsense at forty.
       */
      if (row.dropped.length > 0) {
        const heading = el(doc, 'div', BOARD_SCREEN_COPY.droppedHeading);
        heading.className = 'everyday-ladder-dropped-heading';
        heading.style.cssText = `font-size:12px;font-weight:600;color:${C.warmGrey};margin-top:6px`;
        nameCell.append(heading);
        for (const dropped of row.dropped) {
          const line = el(doc, 'div', `${dropped.caseName}: ${dropped.reason}`);
          line.className = 'everyday-ladder-dropped';
          line.style.cssText = `font-size:12px;color:${C.warmGrey};line-height:1.4;margin-top:2px`;
          nameCell.append(line);
        }
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
    const account = everydayAccount();
    const view = dailyBoardViewOf(
      board,
      account?.token !== undefined ? account.user?.displayName : undefined,
      (id) => context.host.dispatcherById(id)?.name,
    );
    const wrap = el(doc, 'div');
    wrap.style.cssText = `margin-top:${String(G.section)}px`;
    for (const line of view.lines) {
      const p = el(doc, 'p', line.text);
      p.className = line.className;
      p.style.cssText = line.role === 'reason' ? NOTE : `${NOTE};color:${C.label}`;
      wrap.append(p);
    }
    if (view.rows.length === 0) {
      for (const line of view.world) {
        const p = el(doc, 'p', line.text);
        p.className = line.className;
        p.style.cssText = line.role === 'reason' ? NOTE : `${NOTE};color:${C.label}`;
        wrap.append(p);
      }
      return wrap;
    }

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
      if (entry.house !== undefined) {
        /* § D521's marker: a run nobody played, said on the row and not only in the note. */
        const house = el(doc, 'span', entry.house);
        house.className = 'everyday-board-row-house';
        house.style.cssText = `font:600 10px ${TYPE.mono};letter-spacing:.12em;text-transform:uppercase;color:${C.label};border:1px solid ${C.rule};border-radius:${String(R.control)}px;padding:1px 6px`;
        row.append(place, house);
        row.append(who);
      } else {
        row.append(place, who);
      }
      /* GitHub issue #93: who drove it, beside the name, and the player's own gap after the figure. */
      const driver = el(doc, 'span', entry.driver);
      driver.className = 'everyday-board-row-driver';
      driver.style.cssText = `font-size:11.5px;color:${C.label}`;
      const wait = el(doc, 'span', entry.figure);
      wait.style.cssText = `font:600 13px ${TYPE.mono}`;
      row.append(driver, wait);
      if (entry.gap !== '') {
        const gap = el(doc, 'span', entry.gap);
        gap.className = 'everyday-board-row-gap';
        gap.style.cssText = `font:500 11px ${TYPE.mono};color:${C.label}`;
        row.append(gap);
      }
      if (entry.count !== undefined) {
        /* In the row, beside the mean — R13's clause one is about the visual unit, not the page. */
        const count = el(doc, 'span', entry.count);
        count.className = 'everyday-board-row-count';
        count.style.cssText = `font:500 11px ${TYPE.mono};color:${C.label}`;
        row.append(count);
      }
      /*
       * § 14.1's `Watch it` — GitHub issue #337. The press is `weekScreen.ts`'s, in the one order
       * that is safe: the gate first, and the spectator state only on its `blocked: null`. A row it
       * refused is redrawn with the reason where the button stood, so a run this build's data
       * cannot reproduce is a labelled refusal rather than a blank.
       */
      const refusal = watchRefused.get(entry.id);
      if (refusal !== undefined) {
        const why = el(doc, 'span', refusal);
        why.className = 'everyday-board-row-refused';
        why.style.cssText = `font-size:11.5px;color:${C.label};flex-basis:100%`;
        row.style.flexWrap = 'wrap';
        row.append(why);
      } else {
        const button = el(doc, 'button', entry.watch === 'yours' ? BOARD_SCREEN_COPY.dailyRowYours : WATCH_IT_LABEL);
        button.type = 'button';
        button.className = entry.watch === 'yours' ? 'everyday-board-row-yours' : 'everyday-board-row-watch';
        button.disabled = entry.watch === 'yours';
        button.style.cssText = `border:1px solid ${C.rule};border-radius:${String(R.control)}px;background:transparent;padding:3px 9px;font-size:11.5px;color:${C.ink};cursor:${entry.watch === 'yours' ? 'default' : 'pointer'}`;
        if (entry.watch === 'watch') {
          const place = Number(entry.place);
          const source = board !== undefined && board.kind === 'board' ? board.rows.find((candidate) => candidate.id === entry.id) : undefined;
          button.addEventListener('click', () => {
            if (source === undefined) return;
            const checked = context.host.watchRun(context.host.postedRun(source, place));
            if (checked.blocked !== null) {
              watchRefused.set(entry.id, checked.blocked.reason);
              redraw();
              return;
            }
            context.enterWatch();
          });
        }
        row.append(button);
      }
      rows.append(row);
    }
    wrap.append(rows);
    /* The middle of the board, under the rows — GitHub issue #327; the view decided every word. */
    for (const line of view.world) {
      const p = el(doc, 'p', line.text);
      p.className = line.className;
      p.style.cssText = line.role === 'reason' ? NOTE : `${NOTE};color:${C.label}`;
      wrap.append(p);
    }
    return wrap;
  }

  /**
   * {@link challengeTabViewOf}'s answer, drawn — GitHub issue #221's third criterion.
   *
   * `dailyBlock`'s split, kept: the decision about *what* the tab says is in the pure function so
   * all five states are drivable without a document, and this renders it and nothing more. In
   * particular there is no arithmetic here — no ordering, no interval, no fold over `perSeed` —
   * because every figure a challenge row carries was computed by the server over runs it made.
   */
  function challengeBlock(): HTMLElement {
    const view = challengeTabViewOf(challenge, (id) => context.host.dispatcherById(id)?.name);
    const wrap = el(doc, 'div');
    wrap.style.cssText = `margin-top:${String(G.section)}px`;
    if (view.heading !== '') {
      const heading = el(doc, 'h2', view.heading);
      heading.className = 'everyday-challenge-heading';
      heading.style.cssText = `font-family:${TYPE.heading};font-size:21px;font-weight:600;margin:0 0 6px`;
      wrap.append(heading);
    }
    const prose = (line: DailyBoardLine): HTMLElement => {
      const p = el(doc, 'p', line.text);
      p.className = line.className;
      p.style.cssText = line.role === 'reason' ? NOTE : `${NOTE};color:${C.label}`;
      return p;
    };
    for (const line of view.lines) wrap.append(prose(line));
    if (view.rows.length > 0) {
      const heading = el(doc, 'div', BOARD_SCREEN_COPY.challengeRowsHeading);
      heading.className = 'everyday-challenge-rows-heading';
      heading.style.cssText = `${EYEBROW};margin-top:${String(G.section)}px`;
      const rows = el(doc, 'div');
      rows.className = 'everyday-challenge-rows';
      rows.style.cssText = `display:grid;gap:${String(G.row)}px;margin-top:${String(G.block)}px`;
      for (const entry of view.rows) {
        const row = el(doc, 'div');
        row.className = 'everyday-challenge-row';
        row.style.cssText = `display:flex;gap:${String(G.block)}px;align-items:baseline;font-size:13.5px;flex-wrap:wrap`;
        const place = el(doc, 'span', entry.place);
        place.style.cssText = `font:600 12px ${TYPE.mono};color:${C.label};min-width:2ch`;
        const who = el(doc, 'span', entry.displayName);
        who.style.cssText = 'flex:1';
        const driver = el(doc, 'span', entry.driver);
        driver.className = 'everyday-challenge-row-driver';
        driver.style.cssText = `font-size:11.5px;color:${C.label}`;
        const figure = el(doc, 'span', entry.figure);
        figure.style.cssText = `font:600 13px ${TYPE.mono}`;
        /* In the row, beside the mean — R13's clause one is about the visual unit, not the page. */
        const count = el(doc, 'span', entry.count);
        count.className = 'everyday-challenge-row-count';
        count.style.cssText = `font:500 11px ${TYPE.mono};color:${C.label}`;
        row.append(place, who, driver, figure, count);
        rows.append(row);
      }
      wrap.append(heading, rows);
    }
    for (const line of view.footnotes) wrap.append(prose(line));
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
      /*
       * The third card — GitHub issue #221. A triangle in the terracotta the daily board uses,
       * because a challenge is the same *kind* of thing as today's board (a window that opens and
       * shuts) rather than the same kind as the standing ladder, and § 14.2 asks a card's mark to
       * say which question it answers.
       */
      tabCard('challenge', BOARD_SCREEN_COPY.challengeTab, BOARD_SCREEN_COPY.challengeEyebrow, '▲', C.terracotta),
    );

    if (tab === 'daily') {
      body.append(dailyBlock());
      return;
    }
    if (tab === 'challenge') {
      body.append(challengeBlock());
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
    /* § D509: the policy is on the tab a rating is earned from, before the button that earns one. */
    const policy = el(doc, 'p', BOARD_SCREEN_COPY.ladderPolicy);
    policy.className = 'everyday-ladder-policy';
    policy.style.cssText = NOTE;
    body.append(world, policy, sendBlock(set, resources), disclosure(set, resources));
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

  /*
   * The challenge, asked beside the board rather than after it and rather than on the tab press —
   * GitHub issue #221. Two independent reads, and a tab that only fetched when opened would put the
   * § D243 cold start in front of the press rather than in front of the mount, which is the one
   * place this shell has already decided to pay it.
   *
   * A rejection is impossible by the port's contract — every failure is one of its four states — so
   * a `catch` here would be dead code, which is `dailyBoard`'s own argument above.
   */
  void context.host.challengeToday().then((answer) => {
    if (disposed) return;
    challenge = answer;
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
  /** The server's row id — what a press hands back to `EverydayHost.postedRun`. */
  readonly id: string;
  /**
   * Which button the row carries — GitHub issue #337. `'watch'` is § 14.1's `Watch it`;
   * `'yours'` is the inert `your run` a player's own row draws instead, decided on the signed-in
   * display name because that is the only identity a board row carries.
   */
  readonly watch: 'watch' | 'yours';
  readonly place: string;
  readonly displayName: string;
  /**
   * Who drove the run — the dispatcher's name, or its id when this build does not ship it. GitHub
   * issue #93's reveal, and it is not opt-in because the id has always travelled on every posted
   * run: a board that ranks runs on one crowd has nothing to hide about which dispatcher ran them.
   */
  readonly driver: string;
  /**
   * The player's own distance from the top row, `menu/gap.ts`'s sentence — GitHub issue #93 § 3.
   * `''` on every row that is not the player's, on the top row, and where either figure is withheld.
   */
  readonly gap: string;
  /** The mean wait, or the withholding sentence when this row carries no count. */
  readonly figure: string;
  /** `BOARD_SCREEN_COPY.dailyHouseTag` on a row the house posted, `undefined` on a player's — § D521. */
  readonly house: string | undefined;
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
  /**
   * The middle of the board, under the rows — GitHub issue #327. Empty on every state but a read
   * board; on one, a heading and then one line per axis (or the server's own withholding sentence),
   * the wire's note, and the axes it names as absent. Drawn after the rows so a ladder never reads
   * as a ranking.
   */
  readonly world: readonly DailyBoardLine[];
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
/** The axis's name in the player's words, or its id for an axis this build does not know. */
function worldAxisLabelOf(axis: string): string {
  switch (axis) {
    case 'awtS':
      return BOARD_SCREEN_COPY.worldAxisAwtS;
    case 'wt95S':
      return BOARD_SCREEN_COPY.worldAxisWt95S;
    case 'ttdMeanS':
      return BOARD_SCREEN_COPY.worldAxisTtdMeanS;
    case 'pctOverLongWait':
      return BOARD_SCREEN_COPY.worldAxisPctOverLongWait;
    default:
      return axis;
  }
}

/** `18.2 s` for a seconds axis, `3.4%` for the share. Unit from the axis, never guessed. */
function worldFigureOf(axis: string, value: number): string {
  return axis === 'pctOverLongWait' ? `${value.toFixed(1)}%` : `${value.toFixed(1)} s`;
}

/**
 * The middle of the board as lines — GitHub issue #327. Every figure carries its count in its own
 * line (R13 clause one), the withholding is the server's sentence rather than a paraphrase, and an
 * axis the wire names as absent is drawn as absent with the wire's reason.
 */
function worldLinesOf(board: Extract<EverydayDailyBoard, { kind: 'board' }>): readonly DailyBoardLine[] {
  const heading: DailyBoardLine = { text: BOARD_SCREEN_COPY.worldHeading, className: 'everyday-board-world-heading', role: 'note' };
  const spread = board.distribution;
  if (spread === undefined) {
    return [
      heading,
      board.distributionDetail === undefined
        ? { text: BOARD_SCREEN_COPY.worldUnasked, className: 'everyday-board-world-unasked', role: 'reason' }
        : {
            text: `${BOARD_SCREEN_COPY.worldUnreachable} ${board.distributionDetail}`,
            className: 'everyday-board-world-unreachable',
            role: 'reason',
          },
    ];
  }
  if (spread.withheld !== undefined) {
    return [heading, { text: spread.withheld, className: 'everyday-board-world-withheld', role: 'reason' }];
  }
  const axes: DailyBoardLine[] = spread.ladders.map((ladder) => ({
    text:
      ladder.rungs === undefined
        ? `${worldAxisLabelOf(ladder.axis)} — withheld over ${String(ladder.n)} players`
        : `${worldAxisLabelOf(ladder.axis)} — the middle is ${worldFigureOf(ladder.axis, ladder.rungs.p50)}; ` +
          `a quarter of players are under ${worldFigureOf(ladder.axis, ladder.rungs.p25)} and a quarter over ` +
          `${worldFigureOf(ladder.axis, ladder.rungs.p75)}, the outer tenths at ${worldFigureOf(ladder.axis, ladder.rungs.p10)} ` +
          `and ${worldFigureOf(ladder.axis, ladder.rungs.p90)} — over ${String(ladder.n)} players, one best run each`,
    className: 'everyday-board-world-axis',
    role: 'note',
  }));
  const absent: DailyBoardLine[] = spread.absent.map((entry) => ({
    text: `${entry.axis}: ${entry.reason}`,
    className: 'everyday-board-world-absent',
    role: 'reason',
  }));
  return [heading, ...axes, { text: spread.note, className: 'everyday-board-world-note', role: 'reason' }, ...absent];
}

export function dailyBoardViewOf(
  board: EverydayDailyBoard | undefined,
  ownDisplayName: string | undefined = undefined,
  /** The dispatcher's player-facing name for an id, or `undefined` for one this build does not ship. */
  dispatcherNameOf: (id: string) => string | undefined = () => undefined,
): DailyBoardView {
  const only = (text: string, className: string, role: 'reason' | 'note' = 'reason'): DailyBoardView => ({
    lines: [{ text, className, role }],
    rows: [],
    world: [],
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
        world: [],
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
          world: worldLinesOf(board),
        };
      }
      return {
        lines: board.rows.some((entry) => entry.baselineProfileId !== undefined)
          ? [note, { text: BOARD_SCREEN_COPY.dailyHouseNote, className: 'everyday-board-house-note', role: 'note' }]
          : [note],
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
          id: entry.id,
          /* A house row is never the player's own, whatever they are called (§ D521). */
          watch:
            entry.baselineProfileId === undefined && ownDisplayName !== undefined && entry.displayName === ownDisplayName
              ? 'yours'
              : 'watch',
          place: String(index + 1),
          displayName: entry.displayName,
          house: entry.baselineProfileId === undefined ? undefined : BOARD_SCREEN_COPY.dailyHouseTag,
          driver: dispatcherNameOf(entry.run.dispatcherProfileId) ?? entry.run.dispatcherProfileId,
          /*
           * The gap is the player's own and nobody else's, and only between two published figures:
           * a withheld mean has no distance from anything (R3), and the top row's own gap is `''`.
           */
          gap:
            entry.baselineProfileId === undefined &&
            ownDisplayName !== undefined &&
            entry.displayName === ownDisplayName &&
            entry.legs !== undefined &&
            board.rows[0]?.legs !== undefined
              ? gapSentence(entry.measured[DAILY_BOARD_METRIC] - (board.rows[0]?.measured[DAILY_BOARD_METRIC] ?? 0), 's')
              : '',
          figure:
            entry.legs === undefined
              ? BOARD_SCREEN_COPY.dailyRowWithheld
              : `${entry.measured[DAILY_BOARD_METRIC].toFixed(1)} s`,
          count:
            entry.legs === undefined
              ? undefined
              : `over ${entry.legs.toLocaleString('en-US')} rides`,
        })),
        world: worldLinesOf(board),
      };
    }
  }
}

/* -------------------------------------------------------------------------- *
 * The third tab — this week's challenge, read-only (GitHub issue #221)
 * -------------------------------------------------------------------------- */

/** One posted challenge score, pre-formatted so the renderer decides nothing. */
export interface ChallengeTabRowView {
  readonly place: string;
  readonly displayName: string;
  /** Who drove it — the dispatcher's name, or its id where this build does not ship one. */
  readonly driver: string;
  /** The mean the board is ordered on, with its unit. */
  readonly figure: string;
  /**
   * The two counts behind {@link figure}, in the row's own box — R13's clause one.
   *
   * **Never `undefined`.** A challenge row's mean is a mean over its `runs`, and the server sends
   * both counts with every row; a shell that could not say what a mean was taken over would be the
   * `estimate-without-n` defect issue #137 closed for the Day report, re-opened on a new surface.
   */
  readonly count: string;
}

/** What the challenge tab says and shows, for any one of its five states. */
export interface ChallengeTabView {
  /** The challenge's name and brief, or `''` when no challenge came back. */
  readonly heading: string;
  readonly lines: readonly DailyBoardLine[];
  readonly rows: readonly ChallengeTabRowView[];
  /** Drawn under the rows: the server's own note, then Compare's pointer. Both carried whole. */
  readonly footnotes: readonly DailyBoardLine[];
}

/**
 * § 14's third question, drawn honestly in every state — GitHub issue #221's third criterion.
 *
 * The daily tab's rule, applied to a different read: **five states, and the two that must never
 * share a sentence are *nobody has posted* and *we could not ask***. `undefined` is the fifth and
 * is not an absence — the read is in flight, and drawing an absence there publishes *nobody has
 * posted* for as long as the network takes.
 *
 * ## Every honesty obligation arrives in the body, and every one of them is drawn
 *
 * `menu/challenge.ts#ChallengeBoardPage` says so in terms: `note` (§ D106 and § D218 § 5 clause 2),
 * `compare` (clause 5) and each row's `runs`/`legs` (R13) travel **on the wire** rather than being
 * something a client is trusted to remember, because *"a renderer that drops `note` or `compare` is
 * free to draw a composite with nothing on screen saying it should not"*. Both are carried below,
 * unparaphrased, and no row is drawn without its counts.
 *
 * ## Nothing here orders two dispatchers
 *
 * The rows are the server's, in the server's order, and the note that says an ordering is a fact
 * about what was posted rather than a claim that one dispatcher beats another is the server's too.
 * This function adds no comparison, no interval, and nothing derived from `perSeed` — five runs
 * cannot support an inference, and a `[min, max]` beside a mean is read as one by everybody who has
 * seen an interval.
 *
 * Pure and exported so `boardScreen.test.ts` and the sweep can drive all five states without a
 * document, on `dailyBoardViewOf`'s rule and for its reason.
 */
export function challengeTabViewOf(
  today: EverydayChallengeToday | undefined,
  /** The dispatcher's player-facing name for an id, or `undefined` for one this build does not ship. */
  dispatcherNameOf: (id: string) => string | undefined = () => undefined,
): ChallengeTabView {
  const only = (text: string, className: string, role: 'reason' | 'note' = 'reason'): ChallengeTabView => ({
    heading: '',
    lines: [{ text, className, role }],
    rows: [],
    footnotes: [],
  });

  if (today === undefined) {
    return only(BOARD_SCREEN_COPY.challengeAsking, 'everyday-challenge-asking', 'note');
  }
  switch (today.kind) {
    case 'no-server':
      return only(BOARD_SCREEN_COPY.challengeAbsence, 'everyday-challenge-absent');
    case 'unreachable':
      /* Ours saying what happened, then the client's own sentence carried rather than paraphrased. */
      return {
        heading: '',
        lines: [
          { text: BOARD_SCREEN_COPY.challengeUnreachable, className: 'everyday-challenge-unreachable', role: 'reason' },
          { text: today.detail, className: 'everyday-challenge-unreachable-detail', role: 'note' },
        ],
        rows: [],
        footnotes: [],
      };
    case 'index-only':
      /*
       * The challenge is drawn and the ranking is not. Both halves are true and only one of them is
       * a failure, which is why they are two lines rather than one — an upcoming challenge has no
       * board yet, and a player told *the challenge could not be read* about one they can see the
       * name of has been told something false.
       */
      return {
        heading: today.challenge.challenge.name,
        lines: [
          { text: today.challenge.challenge.brief, className: 'everyday-challenge-brief', role: 'note' },
          { text: today.challenge.clockNote, className: 'everyday-challenge-clock', role: 'note' },
          { text: `${BOARD_SCREEN_COPY.challengeNoBoard} ${today.detail}`, className: 'everyday-challenge-no-board', role: 'reason' },
          { text: BOARD_SCREEN_COPY.challengeCannotPost, className: 'everyday-challenge-cannot-post', role: 'reason' },
        ],
        rows: [],
        footnotes: [],
      };
    case 'board': {
      const page = today.board;
      const lines: DailyBoardLine[] = [
        { text: today.challenge.challenge.brief, className: 'everyday-challenge-brief', role: 'note' },
        /*
         * The server's clock note, carried. § D218 § 3: nothing on this side reads a clock, so the
         * window's state is the server's word for it and is printed as such.
         */
        { text: today.challenge.clockNote, className: 'everyday-challenge-clock', role: 'note' },
        { text: BOARD_SCREEN_COPY.challengeCannotPost, className: 'everyday-challenge-cannot-post', role: 'reason' },
      ];
      if (page.entries.length === 0) {
        lines.push({ text: BOARD_SCREEN_COPY.challengeEmpty, className: 'everyday-challenge-empty', role: 'reason' });
      }
      const footnotes: DailyBoardLine[] = [
        /* § D106 and § D218 § 5 clause 2 — the server's own sentence about what the order means. */
        { text: page.note, className: 'everyday-challenge-note', role: 'reason' },
        /* Clause 5 — where the question this board may not answer *is* answered. */
        { text: page.compare.note, className: 'everyday-challenge-compare', role: 'reason' },
      ];
      /*
       * Entries set before a mid-challenge `data/` change describe runs this server can no longer
       * reproduce, so they are on their own board. The count is drawn with the server's own
       * sentence, and it is drawn rather than merged or dropped — which is the wire's own rule.
       */
      if (page.otherDataNote !== undefined && page.entriesOnOtherData > 0) {
        footnotes.push({ text: page.otherDataNote, className: 'everyday-challenge-other-data', role: 'reason' });
      }
      return {
        heading: today.challenge.challenge.name,
        lines,
        rows: page.entries.map((entry, index) => ({
          place: String(index + 1),
          displayName: entry.displayName,
          driver: dispatcherNameOf(entry.dispatcherProfileId) ?? entry.dispatcherProfileId,
          figure: `${entry.score.meanAwtS.toFixed(1)} s`,
          /*
           * Both counts, because the mean is over `runs` and the runs are over `legs`, and a reader
           * asked to judge a mean of five runs needs to know it is five. `toLocaleString` for the
           * legs on the daily row's own precedent.
           */
          count:
            `over ${String(entry.score.runs)} ${entry.score.runs === 1 ? 'run' : 'runs'}, ` +
            `${entry.score.legs.toLocaleString('en-US')} rides`,
        })),
        footnotes,
      };
    }
  }
}

/** The registry row — one import and one line in `screens.ts`, plus its refusal sentence deleted. */
export const BOARD_SCREEN: EverydayScreenModule = {
  key: 'board',
  /* `benchScreen.ts`'s cast, for its reason: every context the shell constructs is the shell's. */
  mount: (host, context) => mount(host, context as EverydayScreenShellContext),
};
