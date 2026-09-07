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
 *   currently *about*, and its tile opens § 6.1's front door — `screen: 'door'` below.
 *
 *   **Nothing hands off to it any more, and the retired sentence is named rather than deleted**
 *   (GitHub issue #261). This row read *"the one the shell's stage hands off to"*, and it was true
 *   of § D335: `stage` was then a **route** that shrank the shell to the rail, uncovered `div.shell`
 *   and inset the whole Engineer application, so the day a player arrived in was this mode running
 *   on the Engineer surface. § D338 retired that hand-off entirely. `everyday/stageScreen.ts` is
 *   § 7's own stage,
 *   a registered screen inside this loop like the other four; `screens.ts`'s `EverydayRoute` lost
 *   its `'handoff'` arm outright, so no key can return one. What crosses to the Engineer surface is
 *   § 3.2's footer row — `shell.ts#enterEngineer` — which is neither this tile nor this mode's
 *   stage. `modes.test.ts` pins each of those three separately, because the sentence they replace
 *   went stale in a docstring where two neighbouring rows had already gone stale the same way.
 * - **Campaign** — `packages/viz/src/campaign/` (judging, fail states, brief, stage runs) and
 *   `commissioning/` (budget, choices, refusals) both exist and are exercised by the Engineer
 *   shell's campaign panel. All three of § 8's Everyday screens are registered, so the tile opens;
 *   it waited on them for two waves and no longer waits on anything.
 * - **Fix a building** — `packages/viz/src/fixit/` ships all **eighteen** § 10.5 cases, each one
 *   validated against a real paired run and its quoted figures pinned by `fixit/cases.test.ts`
 *   (`docs/18` still names three as shipped and fifteen as outstanding content work, and that
 *   sentence is stale). § 10's Everyday screen is registered too, so this tile opens as well.
 *
 *   **Eighteen is the only count in this file, and it is not on its honour.** `modes.test.ts`
 *   reads `data/fixit-cases.json` and fails if the number authored there stops matching the number
 *   written here, in the word this line spells it in. That check exists because the count *did* go
 *   stale, silently, in the row below: it went on saying *three* — `docs/18`'s figure — for every
 *   wave after the fifteen others were authored, while this line went on saying *eighteen* at the
 *   other end of the file, and nothing in the repository read either sentence. A number in prose
 *   that no test derives is a number waiting to be wrong.
 * - **Endless rush** — § 9.1's setup screen is built and the tile opens onto it; what is still
 *   missing is behind it rather than in front, and the refusal moved with it — until GitHub issue
 *   #220 built the engine (`everyday/rush.ts`, § D515) and the refusal was deleted with the gap it
 *   named. While it stood, the rule this module states below applied in the other direction for
 *   once: where the *screen* exists and the thing behind it does not, the refusal belongs on the
 *   control that cannot act.
 */
export const EVERYDAY_MODES: readonly EverydayMode[] = Object.freeze([
  Object.freeze({
    /*
     * § D525 clause 1, and the tile the ruling puts first: *"Scenario, then Career, then Rush"*,
     * and § 2.1 makes it *"the only mode a first-time player should meet"*.
     *
     * It opens `everyday/scenarioScreen.ts`'s hub rather than a scenario, because the retiring
     * tiles' screens have to be reachable from somewhere and a hub is that somewhere. What the hub
     * is **not** is the schema — `docs/38` § 2.1's four sources under one record with a budget is
     * GitHub issue #365, and this tile is deliberately not waiting for it.
     */
    screen: 'scenario' as const,
    pick: 'scenario' as const,
    title: 'Scenario',
    blurb: 'A building with something wrong with it. Watch it, read the letter, and fix it.',
    shape: '~3-5 min a case · retry as often as you like',
    unavailable: unlessBuilt(
      'the scenarios run, but the screen that lists them is not built yet',
      'scenario',
      'door',
      'fixit',
    ),
  }),
  Object.freeze({
    /*
     * *Campaign* reads **Career** — `docs/39` § 3's rename map — and § D525 makes it the mode that
     * persists. The `pick` stays `campaign`: see `types.ts#MODE_PICKS` for why the id did not move
     * with the word.
     *
     * The gate is unchanged and still all three of § 8's screens: a campaign whose desk or contract
     * screen dead-ends mid-flow is worse than a refused tile.
     */
    screen: 'towers' as const,
    pick: 'campaign' as const,
    title: 'Career',
    blurb: 'Clear days, spend units, keep the contracts you signed.',
    shape: '~2 min a building-day · three lost contracts ends the career',
    unavailable: unlessBuilt(
      'the campaign runs, but its Everyday screens are not built yet',
      'towers',
      'building',
      'contract',
    ),
  }),
  Object.freeze({
    /*
     * *Endless rush* reads **Rush**, § D525's third tile and `docs/39` § 3's other rename. The
     * engine landed with GitHub issue #220, so `unlessBuilt` resolves to `undefined` here and the
     * sentence below is the one a reader would meet if `rush` ever left the registry.
     *
     * Where the rush's own registers live, each named with the module that draws it, because the
     * sentence that used to stand here named one that had moved (issue #293):
     *
     * - what the rush lacks — `buildNotes.ts`, the Settings build-information panel;
     * - the standings' fixture marker — `RUSH_BESTS_FIXTURE_NOTE`, declared in
     *   `rushScreenModel.ts` and drawn by `rushScreen.ts` beside the five rows, because § 20.11
     *   requires a fixture's marker to travel with the fixture rather than sit two clicks away.
     *
     * `modes.test.ts` checks both against the import graph rather than against a reader's
     * diligence, so the next register to move fails here instead of on a player's screen.
     */
    screen: 'rush' as const,
    pick: 'rush' as const,
    title: 'Rush',
    blurb: 'One climbing day until the building stops draining.',
    shape: '~5 min · the run always ends; the question is when',
    unavailable: unlessBuilt(
      'not built yet — the rush setup screen draws, but nothing behind it generates the climb',
      'rush',
    ),
  }),
]);

export function isPlayable(mode: EverydayMode): boolean {
  return mode.unavailable === undefined;
}
