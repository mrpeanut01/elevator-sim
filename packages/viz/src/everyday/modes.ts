/**
 * **The four modes, and what actually backs each one** — GAMEPLAY § 4 and § 5.
 *
 * The menu's whole job is to choose a mode, so this is the one place that decides which modes a
 * player may enter. It is data plus one predicate, kept out of the DOM so the decision can be
 * tested without a document.
 *
 * ## Availability is derived from the screen registry, not asserted
 *
 * Each tile's condition is *are the screens this mode enters through built?* — asked of
 * `screens.ts`'s {@link EVERYDAY_SCREENS_BUILT}, which is itself derived from the registry. So a
 * lane that registers a mode's screens opens its tile on the same commit, and a tile can never
 * refuse a mode whose screens exist (§ D227's stale-refusal defect) or open one whose screens do
 * not (the silently-does-nothing defect). The refusal *sentences* stay authored here, because
 * what a tile says is a claim about the mode, not about one screen — and `modes.test.ts` checks
 * the sentences against the registry and against disk in both directions.
 *
 * That is stated per tile rather than by omitting the tile, because a menu that lists three
 * modes when the design names four teaches a player the product is smaller than it is, and a
 * menu that lists four and opens an empty screen on the fourth is the thing the handoff's
 * definition of done forbids outright:
 *
 * > Every control on every screen either reaches the simulation or says it does not. No control
 * > silently does nothing.
 */

import { isScreenBuilt } from './screens.js';
import type { EverydayMode, EverydayScreen } from './types.js';

/** `undefined` when every named screen is built; otherwise the refusal for the tile to carry. */
function unlessBuilt(refusal: string, ...screens: readonly EverydayScreen[]): string | undefined {
  return screens.every(isScreenBuilt) ? undefined : refusal;
}

/**
 * What the shipped tree can serve, per mode.
 *
 * - **Today's tower** — the day the Engineer shell already runs: a seeded shift on one building
 *   with the four-goal day (Everyday slice 5) and the report. This is the mode Casual play is
 *   currently *about*, and the one the shell's stage hands off to.
 * - **Campaign** — `packages/viz/src/campaign/` (judging, fail states, brief, stage runs) and
 *   `commissioning/` (budget, choices, refusals) both exist and are exercised by the Engineer
 *   shell's campaign panel. § 8's three Everyday screens are what the tile waits on.
 * - **Fix a building** — `packages/viz/src/fixit/` exists with three authored cases validated by
 *   real paired runs (`docs/18`; the remaining fifteen are named there as content work). § 10's
 *   Everyday screen is what the tile waits on.
 * - **Endless rush** — nothing behind the screen either: no held-time clock and no rush module.
 *   § 9 describes it in full and none of it is built.
 */
export const EVERYDAY_MODES: readonly EverydayMode[] = Object.freeze([
  Object.freeze({
    /*
     * **Opens the stage, not § 6.1's front door.** The door and the brief are not built, so routing
     * through them would put two empty screens between the player and the only playable thing in
     * this build. The skipped screens are named in `shell.ts`'s `EVERYDAY_SHELL_ABSENCES` rather
     * than silently dropped.
     */
    screen: 'stage' as const,
    pick: 'today' as const,
    title: "Today's tower",
    blurb: 'One building, one day, one score. The same day for everybody.',
    shape: '~3 min · no losing — a day is a score, not a pass',
    unavailable: unlessBuilt('the stage is not built', 'stage'),
  }),
  Object.freeze({
    screen: 'towers' as const,
    pick: 'campaign' as const,
    title: 'Campaign',
    blurb: 'Clear days, spend units, keep the contracts you signed.',
    shape: '~2 min a building-day · three lost contracts ends the career',
    /*
     * The campaign *engine* exists and is exercised — `campaign/` judges days and `commissioning/`
     * prices works — but only through the Engineer shell's campaign panel. The tile opens when all
     * three of § 8's screens (`towers`, `building`, `contract`) are registered: a campaign whose
     * desk or contract screen dead-ends mid-flow is worse than a refused tile. Saying that is the
     * honest form; opening a blank `towers` would not be.
     */
    unavailable: unlessBuilt(
      'the campaign runs, but its Everyday screens are not built yet',
      'towers',
      'building',
      'contract',
    ),
  }),
  Object.freeze({
    screen: 'rush' as const,
    pick: 'rush' as const,
    title: 'Endless rush',
    blurb: 'One climbing day until the building stops draining.',
    shape: '~5 min · the run always ends; the question is when',
    /*
     * Named rather than hidden. § 9 specifies held time instead of a clock, a setup screen, and a
     * result that is a rush report rather than a day report — none of which exists. Saying "not
     * built yet" is the honest form; a tile that opened a blank screen would be the fourth
     * silently-does-nothing control this repository has had to hunt down.
     */
    unavailable: unlessBuilt(
      'not built yet — the rush needs held time and a setup screen, and neither exists',
      'rush',
    ),
  }),
  Object.freeze({
    screen: 'fixit' as const,
    pick: 'fixit' as const,
    title: 'Fix a building',
    blurb: 'A building with something wrong. Diagnose it, change it, re-run it.',
    shape: '~5 min a case · retry as often as you like',
    /*
     * Three authored cases exist and are validated by real paired runs (`fixit/`, `docs/18`), and
     * § 10's Everyday screen is not built. Same shape as the campaign row: the thing works, the
     * screen that would let a player reach it from here does not.
     */
    unavailable: unlessBuilt(
      'the three cases run, but their Everyday screen is not built yet',
      'fixit',
    ),
  }),
]);

/** Whether the menu may open this tile. */
export function isPlayable(mode: EverydayMode): boolean {
  return mode.unavailable === undefined;
}
