/**
 * **Opening one stage of the ordered path** — the verb half of the Scenario hub's press,
 * [§ D787](../../../../DECISIONS.md), GitHub issue #364's other missing half.
 *
 * ## What was wrong
 *
 * `everyday/scenarioScreen.ts` drew the ten stages and gave the three offered ones a button, and
 * every one of those buttons called `context.enterEngineer()` — which takes no argument. Pressing
 * *stage 1*, *stage 3* and *stage 5* performed the identical world swap, and the player arrived on
 * the Engineer surface with whatever stage the campaign picker happened to be holding. Three
 * controls, one destination, no identity carried: the mode `docs/38` § 2.1 rules first on the menu
 * and *"the only mode a first-time player should meet"* had no press that reached its own content.
 *
 * ## Why a provided port rather than an argument on `enterEngineer`
 *
 * Threading a stage id through `shell.ts#enterEngineer` was the other design and it is the wrong
 * shape. That function's whole job is the cover, the `inert` ordering and the `resize` — it knows
 * nothing about the Engineer surface's panels and must not learn, because `everyday/` and
 * `dev/main.ts` cannot import each other (`everyday/boot.ts` already imports `dev/main.js`, and
 * closing that cycle is what produced this directory's last module-init `undefined`). A shell that
 * carried a campaign stage id would be the swap owning a second thing it cannot check.
 *
 * So the dependency points the way it already points for {@link ../everyday/swap.js},
 * {@link ../everyday/engineerBridge.js} and {@link ../everyday/scenarioLadderPort.js}:
 * `dev/main.ts` **provides** the opener once it has a campaign panel to open, and the hub consumes
 * whatever has been provided. The two halves of one press stay in the module that owns each — the
 * swap is the shell's, the panel is `dev/main.ts`'s.
 *
 * ## The one guarantee this seam makes, and where it is enforced
 *
 * **A drawn stage row always has a live opener.** `dev/main.ts` provides this port and the ladder
 * inside the same synchronous body of `loadCampaign(...).then`, and it provides the **ladder last**
 * — deliberately, and stated in both files — so a path can never reach the hub before the thing
 * that opens it exists. The hub draws no row at all until the ladder arrives
 * (`scenarioLadderPort.ts` answers `undefined` and the screen draws the absence), so there is no
 * window in which a player can press a row this port cannot answer.
 *
 * That is why {@link ScenarioOpenPort.openStage} is not permitted to be a no-op that pretends: it
 * answers `false` when it did not open the stage, and `everyday/scenarioScreen.ts` is the caller
 * that has to decide what a `false` means on screen. See that file for what it does with one.
 *
 * The ordering is asserted rather than promised: `everyday/scenarioScreen.test.ts` reads
 * `dev/main.ts` off disk and requires the `provideScenarioOpen` statement to precede the
 * `provideScenarioLadderFrom` one, which is the only form in which this guarantee survives somebody
 * tidying that boot.
 *
 * ## No words live here
 *
 * The sentence a player reads about where a row opens is `scenario/ladder.ts`'s
 * `SCENARIO_LADDER_COPY.openNote`, for that module's own stated reason. This file is the mechanism
 * only, so the honesty sweep does not drive it and there is nothing in it to go stale against a
 * screen.
 */

/** What the Scenario hub may do to the Engineer surface. Narrow on purpose — one verb. */
export interface ScenarioOpenPort {
  /**
   * Show the named stage on the Engineer surface: select it in the campaign picker, draw its
   * brief, and bring that surface's campaign tab to the front.
   *
   * **It does not hand the page over.** The cover is `shell.ts#enterEngineer`'s and the caller
   * presses that first, in the order `everyday/reportScreen.ts`'s lever button already established:
   * the swap clears the `inert` this shell holds, so what this does lands on a live surface rather
   * than a covered one.
   *
   * Answers whether the stage is now the one on screen. `false` means the id names nothing the
   * campaign panel can play — the honest answer for a caller holding an id from a document the
   * panel did not load, and never an exception, because a press on a stage row must not take the
   * page down.
   */
  openStage(stageId: string): boolean;
}

let provided: ScenarioOpenPort | undefined;

/**
 * `dev/main.ts` is the one intended caller: once, when `loadCampaign` resolves and the campaign
 * panel has mounted, and **before** it hands over the ladder.
 *
 * Calling it again replaces the opener — a re-mounted panel is a new one.
 */
export function provideScenarioOpen(port: ScenarioOpenPort): void {
  provided = port;
}

/** The opener, or `undefined` while nothing has provided one. */
export function scenarioOpen(): ScenarioOpenPort | undefined {
  return provided;
}

/*
 * **There is deliberately no `onScenarioOpenProvided` and no way to withdraw the port**, though
 * every other seam in this directory carries both.
 *
 * A listener would have no shipped subscriber: the hub re-reads {@link scenarioOpen} at press time
 * rather than at mount, so nothing here needs telling. A withdrawal would have no shipped caller
 * either — `dev/main.ts` mounts the campaign panel once and never tears it down. Writing the two
 * for symmetry would put two exported functions in this module that nothing outside a test calls,
 * which is `CLAUDE.md`'s standing requirement broken inside a fix for a screen that reached
 * nothing. `model/bank.ts` deleted two of five deck functions on the same ground and says so where
 * they were; this is that, before they were written.
 */
