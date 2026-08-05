/**
 * What the coach ribbon says about the week it is sitting above.
 *
 * ## The defect this module exists to end
 *
 * The ribbon's two lines were built inside `dev/main.ts` from this predicate:
 *
 * ```ts
 * const contract = state.week.contractId;
 * setText(ui.coach.label, contract === undefined ? 'Sandbox' : `Scenario · day ${…}`);
 * ```
 *
 * `WeekState.contractId` is a `string`. It is **never** `undefined` — `openWeek` defaults it to
 * `FIRST_CONTRACT_ID` and no writer anywhere produces the absent case — so both branches that tested
 * for it were unreachable, and the ribbon read *Scenario · day 4* over a building no scenario runs.
 * `coachProgress` had the same predicate and the same fate: its *"free play"* line could not be
 * printed, so a free-play run was told how many clean shifts it had banked toward nothing.
 *
 * TypeScript does not object to `string === undefined`, which is why this survived a strict build,
 * and `GAPS.md` recorded *Sandbox is a string with no feature behind it* without anyone noticing the
 * sharper fact: the string was not merely unbacked, it was **unreachable**. A label nothing can
 * print is a claim nobody can check.
 *
 * ## Why it is a module rather than a fixed line
 *
 * `dev/main.ts` writes the DOM and decides nothing — the convention every editor in `dev/` states in
 * its own docstring, for this repository's stated reason: *a decision made inside a click handler
 * needs a document, a canvas and a click to reach, so it cannot be tested and it drifts.* This one
 * drifted for exactly that reason. Moving it here makes the three cases assertable directly.
 *
 * ## The three cases, and why the third is not the second
 *
 * 1. **A scenario.** `contractById` answers, so there is something to bank toward and the label says
 *    which day of it this is.
 * 2. **Endless.** `contractById` does not answer, and that is deliberate — `week.ts`'s
 *    {@link ENDLESS_CONTRACT_ID} is a sentinel precisely so no consumer needs a new branch. The
 *    *label* still needs one, because a player who pressed **Keep going** is in a week, counting
 *    days, with nothing to bank; telling them *Sandbox* would be as wrong as telling them
 *    *Scenario*.
 * 3. **A building the reader drew**, carrying {@link SANDBOX_CONTRACT_ID}. `contractById` does not
 *    answer either, and here there is no assignment worth naming — though there is still a week, and
 *    the day count is still true, which is why this branch names the run rather than the week.
 *
 * A fourth value reaches case 3 and is not the same thing: an id `data/` no longer ships, from a
 * restored session. It is deliberately **not** given a branch of its own — `persist/notice.ts`
 * already tells that player what happened, in a sentence naming the missing scenario, and a second
 * message on the ribbon would be the same news twice in two voices.
 *
 * Cases 2 and 3 are the same value of `contractById` and different situations, which is the whole
 * reason this is a function over the week rather than a ternary over one field.
 */

import { contractById } from './contracts.js';
import { ENDLESS_CONTRACT_ID, SANDBOX_CONTRACT_ID } from './week.js';
import type { WeekState } from './types.js';

/** The ribbon's two lines, decided together because they answer the same question. */
export interface CoachWeekLines {
  /** The eyebrow: *Scenario · day 4*, *Endless · day 12*, *Sandbox*. */
  readonly label: string;
  /** The line under it: what has been banked, or what there is instead of banking. */
  readonly progress: string;
}

/**
 * Name the week.
 *
 * `shiftLengthS` is taken because the sandbox line is about the run rather than the week — there is
 * no week to describe, so the honest thing to put there is how much demand is being simulated.
 */
export function coachWeekLines(week: WeekState, shiftLengthS: number): CoachWeekLines {
  const contract = contractById(week.contractId);
  if (contract !== undefined) {
    return {
      label: `Scenario · day ${String(week.day)}`,
      progress: `${String(week.cleanRun)} clean shift${week.cleanRun === 1 ? '' : 's'} banked`,
    };
  }

  if (week.contractId === ENDLESS_CONTRACT_ID) {
    return {
      label: `Endless · day ${String(week.day)}`,
      /*
       * *Clean days*, never *banked*. `closeDay`'s arithmetic is contract-independent, so
       * `cleanRun` keeps counting in an endless week — and printing it as *banked* would name a
       * currency that buys nothing here. The count is a real observation and it is published as
       * one, with the thing it is not said in the same line.
       */
      progress:
        `${String(week.cleanRun)} clean day${week.cleanRun === 1 ? '' : 's'} · ` +
        'nothing is banked here',
    };
  }

  return {
    label: 'Sandbox',
    /*
     * *free play* is deleted from this line, and the reason is not style: **Free Play is a mode**,
     * with a screen, a selection and a week reset that makes its runs postable. A sandbox run has a
     * week, and its growth and its events — so calling it free play named the one thing it is not.
     */
    progress: `${String(Math.round(shiftLengthS / 60))} min of demand · nothing to bank`,
  };
}
