/**
 * **The rail, as a model** — GAMEPLAY § 3.2, the whole table: brand, menu row with the live
 * subline, the three groups, and the footer (`PLAYING AS` card · Settings row · Engineer swap).
 *
 * Pure: everything the rail draws, decided from the state and nothing else. The DOM half is
 * `shell.ts`, which renders whatever this returns; keeping them apart is what lets the rail's
 * load-bearing rules be tested without a document, and what lets the honesty sweep drive every
 * word here.
 *
 * ## The rules that are easy to get wrong, asserted in `rail.test.ts`
 *
 * 1. **The `CAMPAIGN` group is rendered only while `ctx === 'campaign'`.** The guide says so
 *    outright. A rail that always showed *All buildings · Contract & works* would offer two
 *    entries into a campaign the player has not started.
 * 2. **The two boards are one rail item.** They are one tabbed screen, so they get one entry —
 *    *Boards & ladder* — highlighted for either tab. The guide records that two entries "made the
 *    rail lie about how many places there are".
 * 3. **Availability is derived, never asserted.** Every row's `unavailable` comes from
 *    `screens.ts` — built keys open, unbuilt keys carry that key's one refusal sentence — so a
 *    lane that registers a screen opens its rail row on the same commit, and a row can never
 *    refuse a screen that works (§ D227's defect) or open one that does not exist.
 * 4. **The `PLAYING AS` card's career line comes from the week, and the absence stays reachable.**
 *    Issue #214: it came from a `profile` field no producer ever wrote, so *"no days saved yet"*
 *    was not stale — it was the **only** string that line could render, beside a week screen
 *    reading *1 day running*. The gate is {@link WeekState.history} rather than `streak`, because a
 *    player who missed every day has still saved days; today's figure waits on `dayClosed` for
 *    `weekView.ts`'s reason; and with an empty week the honest absence is still what is drawn —
 *    a fix that made the refusal unreachable would be the same defect facing the other way.
 * 5. **The absence and the *not yet read* are two lines, not one.** Issue #214's last surviving
 *    path: on a cold load the shell has a host slot and no host, and the card said *no days saved
 *    yet* over a week sitting in storage — for as long as the player stayed on the front door,
 *    because a `'menu'` route redraws no rail. {@link RailOptions.weekPending} is that state and it
 *    draws a sentence that claims nothing about the career. `everyday/weekView.ts` has no such
 *    line and needs none: § 14's screen is a registered screen, and the shell draws
 *    `host.ts#HOST_PENDING_REASON` in its place until the host lands.
 *
 * And one rule about what is *absent*: **Tune the tower is not a rail item.** It is reached from
 * the brief and from the report's third lever. The guide notes an earlier draft listed it here and
 * calls that wrong, so its absence is deliberate and is asserted.
 */

import type { AccountState } from '../menu/account.js';
import type { WeekState } from '../shift/types.js';
import { HISTORY_DAYS } from '../shift/week.js';

import { CHIME_PRICES } from './chimesPanel.js';
import { EM_DASH, percentFigure } from './figures.js';
import { avatarInitialOf, DEFAULT_EVERYDAY_PROFILE, effectiveNameOf } from './profile.js';
import { isScreenBuilt, UNBUILT_REASONS } from './screens.js';
import { REPLAY_COPY } from './replay.js';
import {
  ENGINEER_SWAP_NOTE,
  ENGINEER_SWAP_REPLAY_NOTE,
  ENGINEER_SWAP_RUSH_NOTE,
  ENGINEER_SWAP_WATCH_NOTE,
} from './types.js';
import type { EverydayScreen, EverydayState, RunContext } from './types.js';

/* -------------------------------------------------------------------------- *
 * The banked line — § 3.2's card, GitHub issue #499, § D673
 * -------------------------------------------------------------------------- */

/**
 * What a finished turn is called on the card, and **what it is deliberately not**.
 *
 * Each of these is a turn that either happened or did not, which is the whole of why this line is
 * allowed to exist: `docs/32` § 3.4 licenses *a tally of completed turns* as distinct from *a
 * statistic over a run*, and `docs/38` § 2.4 makes a chime exactly the first — a flat award for
 * finishing something, never scaled by a wait figure or any quantity a run can suppress.
 *
 * **No figure the turn carries is drawn.** `rush-wave-survived` knows how many waves were
 * outlasted and this says *rush waves banked*: a wave count is a run's own measurement and would
 * put one on the rail, which is the line `docs/32` GD13 clause 3 draws. The completion is the
 * player's vocabulary and never a **source** — § D526 clause 5, asserted for this whole package by
 * `boundaries.test.ts`.
 */
const BANKED_TURN: Readonly<Record<BankedTurn, string>> = Object.freeze({
  'scenario-cleared': 'scenario cleared',
  'career-day-paid': 'contract day filed',
  'rush-wave-survived': 'rush waves banked',
});

/** One member of `core`'s `CHIME_COMPLETIONS`, spelled here so this module imports no ledger type. */
export type BankedTurn = 'scenario-cleared' | 'career-day-paid' | 'rush-wave-survived';

/**
 * What the ledger said when it was told — {@link RailOptions.banked}.
 *
 * Four arms because four things are true of four different players, and a card that collapsed them
 * would tell at least one of them something false. `signed-out` is the one worth reading twice: a
 * visitor earns **nothing** on this build — there is no device ledger, `everyday/chimesPanel.ts`
 * says so at length — so the honest acknowledgement of their clear names the clear and says the
 * chime went nowhere. Saying nothing at all would be § D227's rule in the half `CLAUDE.md` calls
 * the more dangerous one.
 */
export type BankedAnswer =
  /** The ledger answered. `chimes` is the account's balance — the one read, never an award or a delta. */
  | { readonly kind: 'balance'; readonly chimes: number }
  /** Nobody is signed in, so nothing was banked and nothing could be. */
  | { readonly kind: 'signed-out' }
  /** This build was served with no API origin: there is no ledger here to bank into. */
  | { readonly kind: 'no-ledger' }
  /** There is a server and it did not answer. The turn still happened. */
  | { readonly kind: 'unreachable' };

/** The banked half of the card's state, as the shell hands it over. */
export interface BankedTurnState {
  readonly turn: BankedTurn;
  readonly answer: BankedAnswer;
}

/**
 * The one screen this line is withheld on, and the argument for the list being one rather than
 * seventeen or zero.
 *
 * `docs/32` GD13 clause 2: a currency *"may **never** appear on a results page"*, and `report` is
 * the results page the clause names — the day's sheet, its goals, its deltas and the mean it
 * sometimes withholds. The rail is chrome rather than part of that sheet, so this is the
 * conservative reading taken deliberately: it costs nothing, because a player leaves the report,
 * and it buys the reading a reviewer would take.
 *
 * **`fixit` is deliberately not on this list, and the reason is a navigation rather than a
 * judgement.** § 3.3's primary after a clear is *Next building*, which picks the next case **on the
 * same screen** — so a guard on `fixit` would withhold the acknowledgement for a whole Scenario
 * session, from exactly the player this line exists for. What it is beside there is an outcome
 * **card**, which is not a results page, and the rail's identity card is the length of a rail away
 * from it rather than in its figure block (GD13 clause 3's *beside*).
 */
const OUTCOME_SCREENS: readonly EverydayScreen[] = Object.freeze(['report']);

/**
 * **The two words the rail's small-screen drawer is worked by** — GitHub issue **#240**,
 * `docs/31-support-matrix.md` § 2.
 *
 * Below `tokens.ts#EVERYDAY_RAIL_DRAWER_MAX_PX` the rail is not a column beside the screen; it is an
 * overlay a toggle opens. That toggle and its close are the only two controls the small-screen
 * layout **adds** to the product, so they are the only two strings it adds, and they are declared
 * here rather than in the mount for this module's standing reason: the words are pure and the
 * document is not, which is what lets the honesty sweep read them (`honesty/surfaces.ts`'s
 * `EVERYDAY_MENU`).
 *
 * `open` is deliberately not the words *Main menu*. That is a rail **row**, and it navigates to the
 * front door; this opens the rail itself and navigates nowhere. Two controls a thumb-width apart
 * sharing a word would be the shell saying the same thing about two different things.
 */
export const RAIL_DRAWER_COPY = Object.freeze({
  /** The narrow header's toggle. */
  open: '☰ Where to',
  /** The drawer's own dismiss, at the top of the rail while it is open. */
  close: '✕ Close',
});

/** One rail row. */
export interface RailItem {
  readonly screen: EverydayScreen;
  readonly label: string;
  /** `undefined` when the row opens; otherwise why it does not, shown as a quiet caption. */
  readonly unavailable?: string | undefined;
}

/** A titled block of rows. The brand, the menu row and the footer are not groups. */
export interface RailGroup {
  readonly title: string;
  readonly items: readonly RailItem[];
}

/**
 * § 3.2's footer: the identity card, the Settings row, the Engineer swap.
 *
 * The Settings row is *"the one rail item drawn as a bordered row with a gear icon and a `›`"* —
 * a destination, not a caption on the identity card — which is why it is modelled beside the card
 * rather than inside it. Its `hint` is `›` everywhere except on the settings screen itself, where
 * the prototype reads `HERE`.
 */
export interface RailFooter {
  readonly identity: {
    /** The card's eyebrow, always `PLAYING AS`. */
    readonly heading: string;
    readonly name: string;
    /** The avatar circle's letter — `profile.ts`'s one derivation, never a second one here. */
    readonly initial: string;
    /** The disc behind the letter — § 15.1's curated colour, sun until the player picks. */
    readonly avatarColor: string;
    /**
     * The career line under the name — the **week's** two figures (`3 days running · best 84%`),
     * an honest absence when no day has been closed, or — before the host has handed a week over
     * at all — a line that says so instead of either. Never the profile's: see
     * {@link RailOptions.week} and {@link RailOptions.weekPending}, and issue #214 for what it
     * said before it had one.
     */
    readonly streak: string;
  };
  readonly settings: RailItem & { readonly hint: string };
  /**
   * § 3.2's last row: the product-level route into the Engineer surface.
   *
   * **Not a screen, and it carries no `screen` field for that reason.** `EverydayScreen` has no key
   * for it and must not gain one — the swap hands the *page* to the other shell and leaves this one
   * mounted behind it, which is a mode switch rather than a navigation, and a route arm nothing can
   * return is the dead seam `screens.ts` deleted `'handoff'` to avoid.
   *
   * **And it carries no `unavailable`, which is the shape of the change rather than an omission.**
   * It held one for every wave in which the door was not built. The door is built, so a refusal here
   * would be § D227's stale-refusal defect — the half that tells a reader not to press a control
   * that works. What is in its place is a {@link RailFooter.engineerSwap.note}: not a reason it does
   * not open, but the two facts a player cannot see from the label.
   */
  readonly engineerSwap: { readonly label: string; readonly note: string };
}

/** Everything the rail draws, in order. */
export interface RailModel {
  readonly brand: string;
  readonly mode: string;
  /** § 3.2's live subline under *Main menu* — where you are, in the rail's own voice. */
  readonly subline: string;
  /**
   * **The last turn the player finished, acknowledged** — GitHub issue #499,
   * [§ D673](../../../../DECISIONS.md), `docs/32` § 3.4. `undefined` until something is finished,
   * and on the results page ({@link OUTCOME_SCREENS}).
   *
   * ## Why it is here and **not** on the `PLAYING AS` card
   *
   * The card is where it was drafted, on the argument that it belongs beside the turn tally the
   * card already draws. That argument is half right and the half it gets wrong is the one that
   * matters: {@link careerLineOf} composes `3 days running · **best 84%**`, and `bestMinutePct` is
   * a **run figure** — the share of a day's people away inside a minute. A chime count three pixels
   * under it is a currency beside a wait figure, which is `docs/32` GD13 clause 3 and, underneath
   * it, [§ D106](../../../../DECISIONS.md): *a currency beside a wait figure becomes a score.*
   * Clearing the letter of a prohibition while landing exactly where its reason bites is not
   * clearing it.
   *
   * ## What *beside* means here, calibrated against something that already shipped
   *
   * It cannot mean *anywhere on a page that also draws a figure*, or no surface in this product
   * could ever draw a chime — the rail is on every screen, and `everyday/settingsView.ts` has drawn
   * the balance beside it since GitHub issue #368. It means **the same block**: the identity card
   * is one, and the top of the rail, where nothing numeric is drawn at all, is not. So the
   * acknowledgement sits under the *Main menu* row and the figure stays where it is.
   */
  readonly banked: string | undefined;
  readonly groups: readonly RailGroup[];
  readonly footer: RailFooter;
}

/** What the shell knows beyond the state — all optional. */
export interface RailOptions {
  /** Whether a campaign is under way — gates the `CAMPAIGN` group together with `ctx`. */
  readonly inCampaign?: boolean;
  /** The open building's name, for the campaign group's middle row (§ 3.2: the row *is* the name). */
  readonly openBuilding?: string | undefined;
  /**
   * The player's identity — `everyday/profileStore.ts`'s stored name and avatar colour, once the
   * settings screen has written one.
   *
   * **It carries no `streak`, and that absence is issue #214's fix.** It held one, optional,
   * described as *"the profile store holds no career"* — and no producer in the tree ever supplied
   * it, so the `??` under it was the only string the card's third line could ever render. The
   * career is {@link RailOptions.week}'s, which is a different store on purpose
   * (`profile.ts`'s docstring argues why the profile is not a fourth key in `persist/`'s envelope);
   * what was wrong was the rail reading the career off the store that does not hold one.
   */
  readonly profile?:
    | {
        readonly name: string;
        readonly avatarColor?: string | undefined;
      }
    | undefined;
  /**
   * The account, when there is one — `everyday/accountPort.ts#everydayAccount()`.
   *
   * **It outranks {@link RailOptions.profile}'s name and nothing else**, which is
   * [§ D490](../../../../DECISIONS.md)'s whole of it: there is one display name, the account holds
   * it while a session exists, and the device-local one answers again on sign-out. The colour is
   * untouched — no account carries one.
   *
   * The card asks `profile.ts#effectiveNameOf` rather than reading `account.user.displayName`
   * here, because `everyday/settingsView.ts` asks the same expression one click away and two
   * readers of one question is how one of them goes stale. What keeps them together is
   * `honesty/agreement.ts`'s `display-name` pair: the failure it catches is not this line being
   * wrong, it is a later reader dropping the ask and being internally honest about the wrong name.
   */
  readonly account?: AccountState | undefined;
  /**
   * The week the host holds — `EverydayHost.week()`, read at draw time like
   * {@link RailOptions.inCampaign} rather than latched, because a career that had to be threaded
   * separately is a career that goes stale by a frame.
   *
   * With none — a build with no host — the card keeps its honest absence, which is the state that
   * used to be the only one. **A cold load is no longer in that list**: a host on its way answers
   * {@link RailOptions.weekPending} instead, because *not read yet* and *nothing to read* are two
   * different things to say to a player who has a week saved.
   */
  readonly week?: WeekState | undefined;
  /**
   * Whether a week is **on its way** — a host slot the shell holds that `dev/main.ts` has not
   * published into yet.
   *
   * Read with {@link RailOptions.week}, never instead of it: `week` present wins, so a caller
   * cannot leave the card claiming to be reading something it has already been handed. It matters
   * only in the seconds of a cold load, and it matters because that is when the card was wrong —
   * `shell.ts#weekRailOptions` answered `{}` there and the card said *no days saved yet* over a
   * restored week, on a screen (§ 3.2's front door) whose rail nothing redraws.
   *
   * **Defaults to `false`, which is the state that claims least about the future**: a caller with
   * no host and no week is a build that keeps no career, and telling that player their days are
   * loading would be a promise nothing is going to keep.
   */
  readonly weekPending?: boolean | undefined;
  /**
   * Whether **today's** run has been filed — `EverydayHost.runState().dayClosed`.
   *
   * Load-bearing rather than decorative, for `weekView.ts`'s reason: a week restored from storage
   * can carry today's outcome while the stage holds no filed run, and *Close the day* alone sets
   * this. Publishing `bestMinutePct` on the week alone would put a figure for a day this sitting
   * has not finished onto the rail — the cell § 14's card withholds two hundred pixels away.
   *
   * **Defaults to `false`, which is the withholding arm**: a caller that hands over a week and
   * forgets the flag under-reports rather than publishing something no run produced.
   */
  readonly dayClosed?: boolean | undefined;
  /**
   * The last turn banked and what the ledger said — `EverydayHost.chimeTally()`, read at draw time
   * like {@link week} and for the same reason.
   *
   * Absent with no host, which is the state every standalone mount is in, and absent before
   * anything has been finished. There is no *pending* arm and there must not be one: the card is
   * drawn from an answer this session already has, and a line saying *banking…* would be a promise
   * the rail cannot keep when the request fails.
   */
  readonly banked?: BankedTurnState | undefined;
}

/**
 * Where the player is, in the rail's voice — § 3.2's subline list.
 *
 * The guide's list carries live detail for some entries (`MID-DAY · 08:41`,
 * `IN THE RUSH · HELD 12:04`, the prototype's `WATCHING · <who>`). The live half is not composed
 * here: this module has no run, and inventing a time or a name would be a figure with no source.
 * This returns the bare word — `MID-DAY`, `WATCHING` — and the shell appends the clock or the
 * name when it has one. One expression, one owner.
 */
export function sublineFor(state: EverydayState): string {
  switch (state.screen) {
    case 'menu':
      return 'YOU ARE HERE';
    /*
     * GitHub issue #244's landing page. Bare words for the same reason the two arms below carry
     * them: the run this page plays is its own block's, not the shell's transport, so there is no
     * live detail to append.
     */
    case 'landing':
      return 'WHAT THIS IS';
    /*
     * § D529's two-screen tutorial (GitHub issue #380). Bare words, like every other arm; there is
     * no live detail to append, because the tutorial's own runs are not the shell's transport.
     */
    case 'tutorial':
    case 'collapse':
      return 'FIRST SESSION';
    /*
     * § D525's hub. The bare word, like every other arm — the shell appends nothing here, because
     * a list of scenarios has no live detail to append.
     */
    case 'scenario':
      return 'PICKING A SCENARIO';
    case 'door':
      return "TODAY'S TOWER";
    case 'brief':
      return 'AT THE BRIEF';
    case 'stage':
      if (state.ctx === 'watch') return 'WATCHING';
      if (state.ctx === 'replay') return REPLAY_COPY.subline;
      return state.ctx === 'rush' ? 'IN THE RUSH' : 'MID-DAY';
    case 'report':
      if (state.ctx === 'watch') return 'WATCHING';
      if (state.ctx === 'replay') return REPLAY_COPY.subline;
      return state.ctx === 'rush' ? 'READING THE RUSH' : 'READING THE REPORT';
    case 'towers':
      return 'CAREER';
    case 'building':
    case 'contract':
      return 'CAREER';
    case 'rush':
      return 'IN THE RUSH';
    case 'fixit':
      return 'FIX A BUILDING';
    case 'workshop':
      return 'WORKSHOP';
    case 'bench':
      return 'TEST BENCH';
    case 'designer':
      return 'BUILDING DESIGNER';
    case 'tuner':
      return 'TUNING';
    case 'week':
      return 'YOUR WEEK';
    case 'board':
      return "TODAY'S BOARD";
    case 'settings':
      return 'SETTINGS';
  }
}

/** A row whose availability is `screens.ts`'s decision, never this module's. */
function item(screen: EverydayScreen, label: string): RailItem {
  return isScreenBuilt(screen)
    ? { screen, label }
    : { screen, label, unavailable: UNBUILT_REASONS[screen] };
}

/**
 * The groups, for this state.
 *
 * `DESIGN` and `WORLD` are always available; `CAMPAIGN` appears only inside a campaign, and its
 * middle row is the open building's name — no name, no row, because a desk row with an invented
 * label would be a claim about a building nobody opened. Rows whose screen has no implementation
 * carry that screen's one refusal sentence rather than being dropped, for the same argument
 * `modes.ts` makes about the fourth mode tile.
 */
export function railGroups(
  ctx: RunContext,
  inCampaign: boolean,
  openBuilding?: string,
): readonly RailGroup[] {
  const groups: RailGroup[] = [];

  if (ctx === 'campaign' && inCampaign) {
    groups.push({
      title: 'CAREER',
      items: Object.freeze([
        item('towers', 'All buildings'),
        ...(openBuilding === undefined ? [] : [item('building', openBuilding)]),
        item('contract', 'Contract & works'),
      ]),
    });
  }

  groups.push({
    title: 'DESIGN',
    items: Object.freeze([
      item('workshop', 'Dispatcher workshop'),
      item('bench', 'Test bench'),
      item('designer', 'Design a building'),
    ]),
  });

  groups.push({
    title: 'WORLD',
    items: Object.freeze([
      /*
       * GitHub issue #244's landing page, on the rail because a screen reachable only through the
       * first-arrival offer is a screen nobody can get back to. It is also what makes the page's
       * *returning player* arm reachable at all — its call to action opens the walkthrough on a
       * first visit and Scenario afterwards, and the second of those is only ever drawn for
       * somebody who came back here on purpose.
       */
      item('landing', 'What this is'),
      item('week', 'Your week'),
      /*
       * One entry, not two — the guide's own correction. `board` covers today's board and the
       * dispatcher ladder as one tabbed screen; its refusal sentence (a server this build does
       * not have) is `screens.ts`'s, where `docs/18` already records the absence.
       */
      item('board', 'Boards & ladder'),
    ]),
  });

  return Object.freeze(groups);
}

/**
 * The card's third line when no day has been closed — issue #214's other half.
 *
 * It read *"no days saved yet — this build keeps no career"*, and the second clause is a statement
 * about the **build** rather than about the week. The build keeps a career now (the week screen has
 * been drawing one from `persist/`'s session all along), so that clause became false in every state
 * the moment the card could read it — § D227's stale refusal, arriving through the sentence a fix
 * left behind rather than through a control. What replaces it says only what is true with an empty
 * history, and says it with no digit in it: § 20.11's forbidden thing is a fixture presented as a
 * player, and a zero here would be one.
 *
 * Module-private on purpose. Exporting it would put a second text producer under
 * `everyday/rail.ts` for `honesty/derive.ts` to classify, for a string the sweep already reaches
 * through {@link railFooter}.
 */
const NO_CAREER_YET = 'no days saved yet — close a day and it lands here';

/**
 * The card's third line **before the host has answered** — issue #214's last surviving path.
 *
 * ## Why the absence had to split in two
 *
 * {@link NO_CAREER_YET} is a claim: *there is no career*. That is true of a week whose history is
 * empty and false of a player whose week is sitting in `localStorage` waiting for `dev/main.ts` to
 * finish its async boot — and the shell drew it in **both** states, because the shell's
 * `weekRailOptions` answered `{}` while there was no host and `{}` reached here as *no week*. On
 * the front door the rail is never redrawn on a `'menu'` route, so the false half did not flicker
 * past: it stood until the player navigated. That is acceptance criterion 1 of #214 — *the rail
 * reflects the actual saved state* — failing on a narrower path than the one the issue opened on.
 *
 * The fix is not a second reading of the store. It is that *I have not been told* stops being said
 * with the words for *there is nothing to tell*: a slot that will fill answers this, an absent
 * host answers {@link NO_CAREER_YET}, and `shell.ts#connectDataHost` redraws the rail the moment
 * the week arrives. The two states are one line apart on the card and a whole claim apart to a
 * player, which is the distinction `campaignRailOptions` already makes by drawing no group at all.
 *
 * No digit in it, for {@link NO_CAREER_YET}'s reason: a figure drawn while nothing has been read
 * would be § 20.11's fixture presented as a player, and *"0 days running"* is the exact shape of
 * that. Module-private for {@link NO_CAREER_YET}'s reason as well.
 */
const CAREER_PENDING = 'reading your saved days…';

/**
 * The `PLAYING AS` card's third line — the week's own two figures, or the absence.
 *
 * ## Why the gate is *a day was closed* and not *the streak is non-zero*
 *
 * A player who missed every day has still saved days, and `streak` is `0` for them. Gating on the
 * streak would tell them nothing was saved — the same false statement #214 reports, with its sign
 * flipped — so the gate is {@link WeekState.history}, which is what `closeDay` appends to.
 *
 * ## Why this composes the line rather than calling `weekView.ts`'s
 *
 * `weekView.ts#streakLineOf` is module-private to the pure half of § 14's screen, and this is the
 * pure half of § 3.2's rail. What keeps the two from drifting is not an import: `rail.test.ts`
 * asserts the two strings are **identical** for every week that holds a closed day, which is the
 * claim a reader of both surfaces on one frame is entitled to. The two figures come from one place
 * either way — {@link WeekState} — and the formatting from a second, `figures.ts#percentFigure`.
 *
 * The `—` arm is that file's rule reached through this one: `bestMinutePct` is `0` before the first
 * day closes *and* on a day where nobody got away inside a minute, so the zero cannot carry the
 * absence and the em dash does. The window is `HISTORY_DAYS`, the week's own bound, because
 * § 14 draws exactly that many cards and a card outside it is a figure with nothing to check it
 * against.
 */
function careerLineOf(
  week: WeekState | undefined,
  dayClosed: boolean,
  weekPending: boolean,
): string {
  if (week === undefined) return weekPending ? CAREER_PENDING : NO_CAREER_YET;
  if (week.history.length === 0) return NO_CAREER_YET;
  const oldest = week.day - (HISTORY_DAYS - 1);
  const publishable = week.history.some(
    (day) => day.day >= oldest && (day.day < week.day || dayClosed),
  );
  const days = week.streak === 1 ? '1 day running' : `${String(week.streak)} days running`;
  return `${days} · best ${publishable ? percentFigure(week.bestMinutePct) : EM_DASH}`;
}

/**
 * **The card's fourth line — the turn just finished, and the tally it went into.**
 *
 * GitHub issue #499, [§ D673](../../../../DECISIONS.md), `docs/32` § 3.4, `docs/38` § 2.4.
 *
 * ## Why there is a line here at all
 *
 * `everyday/fixitScreen.ts` banked a clear under a comment reading *"Nothing is drawn and nothing
 * is awaited"*, and it was right about the build: the only surface that drew a balance was
 * Settings. A player could clear all eighteen fix cases, earn the entire lifetime ceiling
 * `data/chime-ledger.json` allows, and never find out the currency exists.
 *
 * ## Why it is here and not where the player wins
 *
 * `docs/32` GD13 clause 2 keeps a currency off a results page; clause 3 keeps it away from a wait
 * figure. Neither is relaxed. `docs/32` § 3.4 licenses the honest form in terms — standing survives
 * *"because it is a tally of completed turns, not a statistic over a run"* — and a chime is that by
 * construction, so it goes beside the tally this card already draws.
 *
 * ## Where it is drawn, which is not where it was drafted
 *
 * {@link RailModel.banked} carries the argument in full: the `PLAYING AS` card's third line is
 * `3 days running · best 84%` and the second of those is a run figure, so the acknowledgement sits
 * at the top of the rail instead, where nothing numeric is drawn.
 *
 * ## The two figures this line will not carry, and each absence is a rule
 *
 * **Not the award.** `data/chime-ledger.json` prices a completion and `boundaries.test.ts` forbids
 * any module here naming a **source**, so an award drawn on this card would be a second authority
 * for a price this package may not read. {@link CHIME_PRICES} is the spend half precisely because
 * the sources were projected out of it.
 *
 * **Not the delta.** *First time only* ([§ D533](../../../../DECISIONS.md)) means a scenario
 * re-cleared pays nothing, so a `+6` drawn on a second clear would be false; and a first clear
 * happens before anything has read the balance, so there is no *before* to subtract. A quotient of
 * two reads taken at different moments is a figure nothing produced.
 *
 * What is left is the turn and **the one read** § D526 clause 5 licenses, which is exactly enough
 * for a player to learn that finishing things pays something and that they have some.
 *
 * Module-private, for {@link careerLineOf}'s reason: exporting it would put a second text producer
 * under `everyday/rail.ts` for `honesty/derive.ts` to classify, and the sweep already drives every
 * arm of it through {@link railModel}, which `honesty/surfaces.ts`'s `EVERYDAY_MENU` covers.
 */
function bankedLineOf(
  banked: BankedTurnState | undefined,
  screen: EverydayScreen,
): string | undefined {
  if (banked === undefined || OUTCOME_SCREENS.includes(screen)) return undefined;
  const turn = BANKED_TURN[banked.turn];
  switch (banked.answer.kind) {
    case 'balance': {
      /*
       * The currency's own words, from the shipped table rather than spelled here —
       * [§ D530](../../../../DECISIONS.md) authors `one` and `many` in `data/` so that no screen
       * decides what the currency is called, and the singular is a different string rather than the
       * same one with a different number in it.
       */
      const chimes = Math.max(0, Math.trunc(banked.answer.chimes));
      const unit = chimes === 1 ? CHIME_PRICES.currency.one : CHIME_PRICES.currency.many;
      return `${turn} · ${String(chimes)} ${unit}`;
    }
    /*
     * The turn still happened, and the chime did not. A visitor earns nothing on this build —
     * there is no device ledger — so this names both halves rather than the comfortable one.
     */
    case 'signed-out':
      return `${turn} · sign in to bank it`;
    /* No API origin: this build has no ledger to bank into, so the turn is all there is to say. */
    case 'no-ledger':
      return turn;
    case 'unreachable':
      return `${turn} · the tally did not answer`;
  }
}

/**
 * **What the swap row says it does, in the flow it is drawn in** — GitHub issue #533 item 1,
 * [§ D563](../../../../DECISIONS.md).
 *
 * One note per context rather than one note, because the row does a different thing in three of the
 * five and the sentence is read *before* the press. `daily` and `campaign` share the plain note:
 * the panel picks up the same day and nothing about it stops. The other three are each corrected
 * for a different reason, and each is § D227's rule rather than a preference — a control that does
 * something may not claim it does nothing:
 *
 * - `rush` — the swap ends the rush first (GitHub issue #523, § D548 clause 7), so *nothing stops*
 *   would be false on exactly the row that stops something;
 * - `replay` — the swap ends the replay first, for the same reason one field over (issue #531
 *   item 3), which is what {@link ENGINEER_SWAP_REPLAY_NOTE} argues;
 * - `watch` — nothing stops, and *the same day* is the half that is false: the run on the panel is
 *   somebody else's.
 *
 * The table is exhaustive over {@link RunContext} by construction — the fallthrough is the plain
 * note — and `rail.test.ts` drives every value of `RUN_CONTEXTS` against it, so a sixth context
 * arrives here as a decision rather than as a silent default.
 */
function swapNoteFor(ctx: RunContext): string {
  if (ctx === 'rush') return ENGINEER_SWAP_RUSH_NOTE;
  if (ctx === 'replay') return ENGINEER_SWAP_REPLAY_NOTE;
  if (ctx === 'watch') return ENGINEER_SWAP_WATCH_NOTE;
  return ENGINEER_SWAP_NOTE;
}

/**
 * § 3.2's footer.
 *
 * The identity is `everyday/profileStore.ts`'s, handed in through {@link RailOptions.profile} —
 * **unless a session is open, in which case the account's name wins**
 * ([§ D490](../../../../DECISIONS.md), {@link RailOptions.account}). With neither, the card does
 * not invent one: the name falls back to `DEFAULT_EVERYDAY_PROFILE`'s `you` on sun. **The career line is the week's**, through
 * {@link RailOptions.week}, and never the profile's: the two stores are separate for the reason
 * `profile.ts` gives at length, and the defect that made this file worth reading twice was the card
 * asking the store that holds no days how many days there were. An authored fixture presented as a
 * player is what the handoff's § 20.11 forbids, so a week with no closed day in it draws
 * {@link NO_CAREER_YET} — still reachable, no longer the only thing reachable — and a week that has
 * not arrived yet draws {@link CAREER_PENDING}, which is a third state rather than a softer second
 * one.
 */
export function railFooter(state: EverydayState, options: RailOptions = {}): RailFooter {
  const name = effectiveNameOf(options.profile, options.account);
  const streak = careerLineOf(
    options.week,
    options.dayClosed ?? false,
    options.weekPending ?? false,
  );
  return {
    identity: {
      heading: 'PLAYING AS',
      name,
      initial: avatarInitialOf(name),
      avatarColor: options.profile?.avatarColor ?? DEFAULT_EVERYDAY_PROFILE.avatarColor,
      streak,
    },
    settings: {
      ...item('settings', 'Settings'),
      hint: state.screen === 'settings' ? 'HERE' : '›',
    },
    engineerSwap: {
      label: 'Switch to Engineer',
      note: swapNoteFor(state.ctx),
    },
  };
}

/** The whole rail. */
export function railModel(state: EverydayState, options: RailOptions = {}): RailModel {
  return {
    brand: 'Elevator Sim',
    mode: 'EVERYDAY MODE',
    subline: sublineFor(state),
    banked: bankedLineOf(options.banked, state.screen),
    groups: railGroups(state.ctx, options.inCampaign ?? false, options.openBuilding),
    footer: railFooter(state, options),
  };
}
