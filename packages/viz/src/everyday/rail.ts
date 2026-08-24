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
 *
 * And one rule about what is *absent*: **Tune the tower is not a rail item.** It is reached from
 * the brief and from the report's third lever. The guide notes an earlier draft listed it here and
 * calls that wrong, so its absence is deliberate and is asserted.
 */

import type { WeekState } from '../shift/types.js';
import { HISTORY_DAYS } from '../shift/week.js';

import { EM_DASH, percentFigure } from './figures.js';
import { avatarInitialOf, DEFAULT_EVERYDAY_PROFILE } from './profile.js';
import { isScreenBuilt, UNBUILT_REASONS } from './screens.js';
import { ENGINEER_SWAP_NOTE } from './types.js';
import type { EverydayScreen, EverydayState, RunContext } from './types.js';

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
     * or an honest absence when no day has been closed. Never the profile's: see
     * {@link RailOptions.week}, and issue #214 for what it said before it had one.
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
   * The week the host holds — `EverydayHost.week()`, read at draw time like
   * {@link RailOptions.inCampaign} rather than latched, because a career that had to be threaded
   * separately is a career that goes stale by a frame.
   *
   * With none — a cold load, or a build with no host — the card keeps its honest absence, which is
   * the state that used to be the only one.
   */
  readonly week?: WeekState | undefined;
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
    case 'door':
      return "TODAY'S TOWER";
    case 'brief':
      return 'AT THE BRIEF';
    case 'stage':
      if (state.ctx === 'watch') return 'WATCHING';
      return state.ctx === 'rush' ? 'IN THE RUSH' : 'MID-DAY';
    case 'report':
      if (state.ctx === 'watch') return 'WATCHING';
      return state.ctx === 'rush' ? 'READING THE RUSH' : 'READING THE REPORT';
    case 'towers':
      return 'CAMPAIGN';
    case 'building':
    case 'contract':
      return 'CAMPAIGN';
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
      title: 'CAMPAIGN',
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
function careerLineOf(week: WeekState | undefined, dayClosed: boolean): string {
  if (week === undefined || week.history.length === 0) return NO_CAREER_YET;
  const oldest = week.day - (HISTORY_DAYS - 1);
  const publishable = week.history.some(
    (day) => day.day >= oldest && (day.day < week.day || dayClosed),
  );
  const days = week.streak === 1 ? '1 day running' : `${String(week.streak)} days running`;
  return `${days} · best ${publishable ? percentFigure(week.bestMinutePct) : EM_DASH}`;
}

/**
 * § 3.2's footer.
 *
 * The identity is `everyday/profileStore.ts`'s, handed in through {@link RailOptions.profile};
 * with nothing stored the card does not invent one — the name falls back to
 * `DEFAULT_EVERYDAY_PROFILE`'s `you` on sun. **The career line is the week's**, through
 * {@link RailOptions.week}, and never the profile's: the two stores are separate for the reason
 * `profile.ts` gives at length, and the defect that made this file worth reading twice was the card
 * asking the store that holds no days how many days there were. An authored fixture presented as a
 * player is what the handoff's § 20.11 forbids, so with no week the line is
 * {@link NO_CAREER_YET} — still reachable, no longer the only thing reachable.
 */
export function railFooter(state: EverydayState, options: RailOptions = {}): RailFooter {
  const name = options.profile?.name ?? DEFAULT_EVERYDAY_PROFILE.name;
  const streak = careerLineOf(options.week, options.dayClosed ?? false);
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
      note: ENGINEER_SWAP_NOTE,
    },
  };
}

/** The whole rail. */
export function railModel(state: EverydayState, options: RailOptions = {}): RailModel {
  return {
    brand: 'Elevator Sim',
    mode: 'EVERYDAY MODE',
    subline: sublineFor(state),
    groups: railGroups(state.ctx, options.inCampaign ?? false, options.openBuilding),
    footer: railFooter(state, options),
  };
}
