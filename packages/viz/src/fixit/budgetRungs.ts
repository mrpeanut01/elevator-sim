/**
 * **A fix case standing on a budget rung it bought** — `docs/38` § 2.1's *"A wider
 * budget can be bought … in steps the scenario authors"*, [§ D911](../../../../DECISIONS.md),
 * GitHub issue **#579**.
 *
 * ## The whole of what a bought rung does, and why it is one line
 *
 * {@link caseAtRung} returns **the same case with a bigger `budgetUnits`**, and every consumer that
 * already reads that field — `engine.ts#affordabilityOf`, `#budgetNoteOf`, `#spendOf`,
 * `#classifyOutcome`, `everyday/fixitScreenModel.ts#fixitSpendSummary` — is the seam without being
 * touched. That is deliberate and it is the argument: a wider budget is not a new kind of state a
 * screen has to learn about, it is *the same puzzle with more money*, which is exactly the sentence
 * `docs/38` § 2.1 uses (*"buying up is choosing an easier version of the same puzzle"*). A
 * `FixitState` field would have been the other design, and it would have needed every one of those
 * call sites to consult it or quietly keep charging against the base.
 *
 * **What it does not touch is as load-bearing.** `run.ts#fixitRunPlanOf` reads the patch and the
 * seed and never the budget, so a bought rung changes **which configurations the player can
 * assemble** and nothing about how a given configuration is simulated or judged. Two players who
 * build the same tower read the same verdict whatever they paid — `charter` non-goal 6, which
 * `scenario/budgetReachesTheRun.test.ts` asserts for the campaign's ladder and which holds here by
 * construction rather than by assertion, because there is nothing in a run plan for a budget to
 * enter.
 *
 * ## The band, and why a widened budget is outside it on purpose
 *
 * `parse.ts` refuses an **authored** budget outside § 10.2's 10–16 u. A rung takes the case above
 * that, and the band is not re-checked, because the band is a rule about what a case may *ship*
 * with — the level everybody meets it at — and not a ceiling on what a player may earn their way
 * to. The check stays where it is, on the file.
 *
 * Pure. No DOM, no store, no `data/` read: the caller supplies the case and the ladder, on
 * `scenario/ladder.ts`' own rule.
 */

import type { BoughtBudgetStep } from '../scenario/budget.js';
import type { FixitCase } from './types.js';

/*
 * **There is no exported *"the ladder as rungs"* helper here, and the absence is deliberate.**
 *
 * One was written — `caseBudgetRungsOf`, `scenario/budget.ts#rungsOf` over a fix case — and deleted
 * before this file landed, because nothing outside a test called it: `fixitBudgetRungRow` takes the
 * units the widened case already carries and the price the next step already declares, so a second
 * derivation of the same two figures would have been a second opinion about them. `CLAUDE.md`'s
 * standing requirement in its plainest form — *name the non-test caller* — and
 * `everyday/chimesPanel.ts` records the same deletion for the same reason one directory over.
 *
 * What a cumulative ladder would buy, if a screen ever needs one, is a **chimes-spent-so-far**
 * column; nothing draws one today, and `docs/32` GD13 clause 2 is why nothing is likely to.
 */

/**
 * The next rung a player could buy, or `undefined` where they are at the top.
 *
 * Takes the rung they are **on** rather than a count of purchases, so a record naming a step this
 * build no longer authors answers the first rung rather than throwing: a ladder that is rebalanced
 * under a saved purchase is a real state, and the honest answer is to offer what exists now.
 */
export function nextBudgetStepOf(
  steps: readonly BoughtBudgetStep[],
  boughtStepId: string | undefined,
): BoughtBudgetStep | undefined {
  if (boughtStepId === undefined) return steps[0];
  const index = steps.findIndex((step) => step.id === boughtStepId);
  return index < 0 ? steps[0] : steps[index + 1];
}

/**
 * The case as a player standing on `boughtStepId` meets it: the same case, with the units the
 * rungs up to and including that step add.
 *
 * Returns the case **unchanged by identity** on the base rung and on a step the ladder does not
 * hold, so a caller can tell *nothing was bought* from *nothing changed* without comparing figures.
 */
export function caseAtRung(
  entry: FixitCase,
  steps: readonly BoughtBudgetStep[],
  boughtStepId: string | undefined,
): FixitCase {
  if (boughtStepId === undefined) return entry;
  const index = steps.findIndex((step) => step.id === boughtStepId);
  if (index < 0) return entry;
  const added = steps.slice(0, index + 1).reduce((sum, step) => sum + step.addsUnits, 0);
  if (added === 0) return entry;
  return { ...entry, budgetUnits: entry.budgetUnits + added };
}
