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
 * § 3.2's footer.
 *
 * The identity is `everyday/profileStore.ts`'s, handed in through {@link RailOptions.profile};
 * with nothing stored the card does not invent one — the name falls back to
 * `DEFAULT_EVERYDAY_PROFILE`'s `you` on sun. **The career line is the week's**, through
 * {@link RailOptions.week}, and never the profile's: the two stores are separate for the reason
 * `profile.ts` gives at length, and the defect that made this file worth reading twice was the card
 * asking the store that holds no days how many days there were. An authored fixture presented as a
 * player is what the handoff's § 20.11 forbids, so a week with no closed day in it draws
 * {@link NO_CAREER_YET} — still reachable, no longer the only thing reachable — and a week that has
 * not arrived yet draws {@link CAREER_PENDING}, which is a third state rather than a softer second
 * one.
 */
export function railFooter(state: EverydayState, options: RailOptions = {}): RailFooter {
  const name = options.profile?.name ?? DEFAULT_EVERYDAY_PROFILE.name;
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
