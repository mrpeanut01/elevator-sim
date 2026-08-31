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
 *   missing is behind it rather than in front, and the refusal moved with it. There is no climbing
 *   arrival stream, no held-time clock and no § 9.3 result, so the screen's § 3.3 primary is drawn
 *   inert with `rushScreenModel.ts#RUSH_PRIMARY_REFUSAL` on it. That is the rule this module states
 *   below, applied in the other direction for once: where the *screen* exists and the thing behind
 *   it does not, the refusal belongs on the control that cannot act.
 */
export const EVERYDAY_MODES: readonly EverydayMode[] = Object.freeze([
  Object.freeze({
    /*
     * **Opens § 6.1's front door**, which is what the guide asks for and what this tile could not
     * do for two waves: the door and the brief were unbuilt, so the tile skipped to the stage and
     * said so here. Both are registered now, so the skip is gone with them — a tile that still
     * jumped the queue would be routing around two screens that exist, and the comment claiming
     * they do not would be § D227's stale refusal in a code path.
     *
     * The tile is gated on all four screens of the loop rather than on the door alone. § 6's whole
     * claim is that Today's tower is a **loop** — set up, watch, read, and see the week — and a
     * mode whose report or week dead-ends mid-flow is the shape `campaign`'s own gate refuses one
     * row down.
     */
    screen: 'door' as const,
    pick: 'today' as const,
    title: "Today's tower",
    blurb: 'One building, one day, one score. The same day for everybody.',
    shape: '~3 min · no losing — a day is a score, not a pass',
    unavailable: unlessBuilt(
      'the day runs, but its Everyday screens are not built yet',
      'door',
      'brief',
      'stage',
      'report',
      'week',
    ),
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
     * § 9.1's setup screen is registered, so this resolves to `undefined` and the tile opens. The
     * sentence is kept current rather than left as it was: it is what a reader would be told if the
     * screen were ever unregistered, and a refusal that describes a build two waves old is § D227's
     * defect with a longer fuse.
     *
     * **The sentence that stood here was that defect, in the comment arguing against it** — GitHub
     * issue #293. It read *"what the rush still lacks is named **on the screen itself**
     * (`rushScreenModel.ts#RUSH_ABSENCES`)"*, and `RUSH_ABSENCES` left that screen on the merge
     * that closed issue #207. It is written out rather than quietly corrected because a comment
     * that names the failure mode and then commits it is the most persuasive kind of wrong: a
     * reader checking this claim has just been told by the same paragraph that such claims go
     * stale.
     *
     * Where the three things actually are, each named with the module that draws it:
     *
     * - the **register** of what the rush lacks — `buildNotes.ts`, the Settings build-information
     *   panel, since #207 put every register in one place a reader goes looking;
     * - the **primary's** refusal — `rushScreenModel.ts#RUSH_PRIMARY_REFUSAL`, drawn into the
     *   § 3.3 bar beside the button it is about, which is where a refusal about a missing engine
     *   belongs once the screen in front of it is real;
     * - the **standings'** fixture marker — `rushScreenModel.ts#RUSH_BESTS_FIXTURE_NOTE`, drawn by
     *   `rushScreen.ts` beside the five rows, because § 20.11 requires a fixture's marker to
     *   travel with the fixture rather than sit two clicks away.
     *
     * `modes.test.ts` checks all three against the import graph rather than against a reader's
     * diligence, so the next register to move fails here instead of leaving a sentence behind.
     */
    unavailable: unlessBuilt(
      'not built yet — the rush setup screen draws, but nothing behind it generates the climb',
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
     * `everyday/fixitScreen.ts` is registered, so `unlessBuilt` resolves to `undefined` here and
     * **the sentence below is a dead branch** — nothing draws it, on any build where the screen is
     * in the registry. What was stale was this comment, which went on reading *"three authored
     * cases exist … and § 10's Everyday screen is not built"* after both of its halves had stopped
     * being true. The *three* is a fossil of `docs/18`'s *"Three cases ship in
     * `data/fixit-cases.json`"*, which the table's own docstring above already flags as stale; the
     * count is **eighteen**, and it is stated once up there and derived from `data/` by
     * `modes.test.ts` rather than typed a third time here.
     *
     * **Say precisely what the defect was, because the issue that reported it did not.** #217's
     * AC3 says the refusal *"still reads"* the stale sentence, which implies a player meets it.
     * A player never did. This is § D227's class in a code path — a stale sentence beside dead
     * code — and it is the milder half of that class rather than the dangerous one: a refusal a
     * player can read tells them not to touch a thing that works, while this one only misled a
     * reader of the file about whether the screen existed. Milder is not harmless, and the
     * Today's-tower row at the top of this table named this exact shape before it happened here.
     *
     * **The call stays; only the sentence is corrected.** Hard-coding `unavailable: undefined`
     * would buy nothing and would take the derivation with it — the one thing that fails on the
     * commit `fixit` leaves the registry. That is the Endless rush row's reasoning one tile up,
     * and `screens.ts#UNBUILT_REASONS`' reasoning for keeping an empty table.
     *
     * **And the sentence now carries no count**, like its three siblings. A number inside a
     * refusal is a second copy of a figure that has already gone stale once in this row, and it
     * would sit in the one place no test reads — the branch that does not evaluate. The subject
     * is the screen rather than the cases behind it, which is this table's own wording rule.
     * **Recorded here rather than in `DECISIONS.md`, under § D405** — both halves are about this
     * table's own wording rule: the countless refusal, and the count being bound to
     * `data/fixit-cases.json` instead of to a reader's diligence.
     */
    unavailable: unlessBuilt('the cases run, but their Everyday screen is not built yet', 'fixit'),
  }),
]);

/** Whether the menu may open this tile. */
export function isPlayable(mode: EverydayMode): boolean {
  return mode.unavailable === undefined;
}
