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

import { avatarInitialOf, DEFAULT_EVERYDAY_PROFILE } from './profile.js';
import { isScreenBuilt, UNBUILT_REASONS } from './screens.js';
import { ENGINEER_SWAP_REFUSAL } from './types.js';
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
    /** The streak line under the name — or, with no profile, an honest absence. */
    readonly streak: string;
  };
  readonly settings: RailItem & { readonly hint: string };
  /** A product-level route, stubbed — present so the way out of Everyday Mode is never hidden. */
  readonly engineerSwap: { readonly label: string; readonly unavailable?: string | undefined };
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
   * settings screen has written one. `streak` stays optional because the profile store holds no
   * career: with none given the card keeps its honest absence line rather than inventing a run of
   * days (§ 20.11).
   */
  readonly profile?:
    | {
        readonly name: string;
        readonly streak?: string | undefined;
        readonly avatarColor?: string | undefined;
      }
    | undefined;
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
 * § 3.2's footer.
 *
 * The identity is `everyday/profileStore.ts`'s, handed in through {@link RailOptions.profile};
 * with nothing stored the card does not invent one — the name falls back to
 * `DEFAULT_EVERYDAY_PROFILE`'s `you` on sun, and the streak line says plainly that nothing is
 * saved. An authored fixture presented as a player is exactly what the handoff's § 20.11 forbids,
 * which is also why the streak never comes from the profile: the store holds no days to count.
 */
export function railFooter(state: EverydayState, options: RailOptions = {}): RailFooter {
  const name = options.profile?.name ?? DEFAULT_EVERYDAY_PROFILE.name;
  const streak = options.profile?.streak ?? 'no days saved yet — this build keeps no career';
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
      unavailable: ENGINEER_SWAP_REFUSAL,
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
