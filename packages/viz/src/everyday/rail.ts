/**
 * **The rail, as a model** — GAMEPLAY § 3.2.
 *
 * Pure: groups, items and the live subline, decided from the state and nothing else. The DOM half
 * is `shell.ts`, which renders whatever this returns; keeping them apart is what lets the rail's
 * two load-bearing rules be tested without a document.
 *
 * ## The two rules that are easy to get wrong, and are asserted in `rail.test.ts`
 *
 * 1. **The `CAMPAIGN` group is rendered only while `ctx === 'campaign'`.** The guide says so
 *    outright. A rail that always showed *All buildings · Contract & works* would offer two
 *    entries into a campaign the player has not started.
 * 2. **The two boards are one rail item.** They are one tabbed screen, so they get one entry —
 *    *Boards & ladder* — highlighted for either tab. The guide records that two entries "made the
 *    rail lie about how many places there are".
 *
 * And one rule about what is *absent*: **Tune the tower is not a rail item.** It is reached from
 * the brief and from the report's third lever. The guide notes an earlier draft listed it here and
 * calls that wrong, so its absence is deliberate and is asserted.
 */

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

/** Everything the rail draws, in order. */
export interface RailModel {
  readonly brand: string;
  readonly mode: string;
  /** § 3.2's live subline under *Main menu* — where you are, in the rail's own voice. */
  readonly subline: string;
  readonly groups: readonly RailGroup[];
}

/**
 * Where the player is, in the rail's voice — § 3.2's subline list.
 *
 * The guide's list carries live detail for two of them (`MID-DAY · 08:41`,
 * `IN THE RUSH · HELD 12:04`). The clock half is not composed here: this module has no run, and
 * inventing a time would be a number with no source. The stage's subline is the bare
 * `MID-DAY`, and the shell appends the clock when it has one — one expression, one owner.
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
      return state.ctx === 'rush' ? 'IN THE RUSH' : 'MID-DAY';
    case 'report':
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

/**
 * The groups, for this state.
 *
 * `DESIGN` and `WORLD` are always available; `CAMPAIGN` appears only inside a campaign. Rows whose
 * screen has no implementation carry their reason rather than being dropped, for the same argument
 * `modes.ts` makes about the fourth mode tile.
 */
export function railGroups(ctx: RunContext, inCampaign: boolean): readonly RailGroup[] {
  const groups: RailGroup[] = [];

  if (ctx === 'campaign' && inCampaign) {
    groups.push({
      title: 'CAMPAIGN',
      items: Object.freeze([
        { screen: 'towers' as const, label: 'All buildings' },
        { screen: 'contract' as const, label: 'Contract & works' },
      ]),
    });
  }

  groups.push({
    title: 'DESIGN',
    items: Object.freeze([
      {
        screen: 'workshop' as const,
        label: 'Dispatcher workshop',
        unavailable: 'the workshop screen is not built — the levers live on the stage for now',
      },
      {
        screen: 'bench' as const,
        label: 'Test bench',
        unavailable: 'the bench screen is not built — its suite runs from the Engineer shell',
      },
      {
        screen: 'designer' as const,
        label: 'Design a building',
        unavailable: 'the designer screen is not built',
      },
    ]),
  });

  groups.push({
    title: 'WORLD',
    items: Object.freeze([
      { screen: 'week' as const, label: 'Your week', unavailable: 'the week screen is not built' },
      /*
       * One entry, not two — the guide's own correction. `board` covers today's board and the
       * dispatcher ladder as one tabbed screen; both halves need a server this build does not
       * have, which `docs/18` already records as an honest absence.
       */
      {
        screen: 'board' as const,
        label: 'Boards & ladder',
        unavailable: 'needs a server to post and rank runs, and this build has none',
      },
    ]),
  });

  return Object.freeze(groups);
}

/** The whole rail. */
export function railModel(state: EverydayState, inCampaign = false): RailModel {
  return {
    brand: 'Elevator Sim',
    mode: 'EVERYDAY MODE',
    subline: sublineFor(state),
    groups: railGroups(state.ctx, inCampaign),
  };
}
