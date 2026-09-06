/**
 * **The menu's affordance model** — `docs/16` S7 as a chokepoint, GitHub issue #178 item 1, § D516.
 *
 * S7 says *a control a mode forbids is not offered. Not offered-and-refused.* Until this module the
 * product could say what a mode forbids (`scope/permits.ts`) and nothing asked it: every screen's
 * rows went straight from their builder to the panel, so a row scoped `between-days` on the Free
 * Play screen would have been drawn, pressed, and reset on the next Start — the defect `docs/16`
 * § 5 clause 3 records. `scope/permits.ts` and `scope/commitment.ts` both named this model as
 * their missing consumer, and the two exports `permits.ts` deleted for want of a caller now have
 * one here.
 *
 * ## Three things it decides
 *
 * 1. **Which play mode a screen serves** — {@link MODE_OF_SCREEN}. A `Record` over `MenuScreen`,
 *    so an ninth screen is a compile error until somebody says which mode it belongs to, or says
 *    `null` and why. `null` is not *unscoped*: it means the screen is a door between modes rather
 *    than a room inside one, and a door offers the controls of whichever mode is on the other side
 *    of it. The campaign screen is the clearest case — its scenario pick and calendar select are
 *    `between-games` rows on the way *into* `stage-campaign`, a mode that forbids `between-games`
 *    once entered. Mapping that screen to the mode it opens would withhold the one row that opens it.
 * 2. **Which rows a mode offers** — {@link offeredIn}. Rows whose scope the mode forbids are
 *    withheld, and the view records their ids so that a test can see them. On every shipped screen
 *    today the withheld set is empty, which `affordances.test.ts` asserts over every state the
 *    honesty corpus drives: S7 is met by construction *and* checked, and the two are different
 *    claims. A builder that grows a forbidden row fails the build; it does not ship, and it does not
 *    silently vanish either.
 * 3. **The one sentence a screen shows in place of the controls it never offers** —
 *    `permits.ts#permittedLineFor`, composed from the matrix. It is a notice on the screen, not a
 *    disabled row with a reason: S7's second sentence is that a disabled control is right where the
 *    *combination* is wrong, and wrong where the mode can never permit it.
 *
 * ## What it is not
 *
 * Not `scope/commitment.ts`, which answers *what happens to the shift on screen when a permitted
 * control moves*. Not `scope/runIdentity.ts`, which answers *which permitted fields the wire can
 * carry*. This answers *may this control be offered here at all*, and it is the only one of the
 * three that removes something from a screen.
 */

import { permits } from '../scope/permits.js';
import type { ChangeScope, PlayMode } from '../scope/types.js';

import type { MenuScreen } from './types.js';

/**
 * The play mode each menu screen serves, or `null` for a door between modes.
 *
 * - `free-play` is the Free Play room: every row is the run's own setup, which that mode permits.
 * - `challenge` and `leaderboard` are `ranked`'s rooms: what a posted run may carry is a selection
 *   and nothing else, which is `scope/runIdentity.ts`'s subject and the reason the matrix's
 *   `ranked` row exists.
 * - `commissioning` is its own mode: the fabric is chosen and lived with.
 * - `main`, `campaign`, `settings` and `account` are doors. Settings is presentation-only by its own
 *   type's docstring and belongs to no mode; the account screen posts and signs out; the main and
 *   campaign screens open modes rather than sitting inside one.
 */
export const MODE_OF_SCREEN: Readonly<Record<MenuScreen, PlayMode | null>> = Object.freeze({
  main: null,
  campaign: null,
  'free-play': 'free-play',
  settings: null,
  leaderboard: 'ranked',
  challenge: 'ranked',
  commissioning: 'commissioning',
  account: null,
});

export interface OfferedRows<T> {
  readonly offered: readonly T[];
  /** The rows the mode forbids, in their builder's order. Never drawn; asserted empty on shipped screens. */
  readonly withheld: readonly T[];
}

/** Split a screen's rows into the ones `mode` offers and the ones S7 says it may not. */
export function offeredIn<T extends { readonly scope: ChangeScope }>(
  mode: PlayMode,
  rows: readonly T[],
): OfferedRows<T> {
  const offered: T[] = [];
  const withheld: T[] = [];
  for (const row of rows) (permits(mode, row.scope) ? offered : withheld).push(row);
  return Object.freeze({ offered: Object.freeze(offered), withheld: Object.freeze(withheld) });
}
