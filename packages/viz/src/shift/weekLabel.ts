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
import { ENDLESS_CONTRACT_ID, FREE_PLAY_CONTRACT_ID, SANDBOX_CONTRACT_ID } from './week.js';
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

  /*
   * **Free play, which used to reach the first branch and print *Scenario*** — GitHub issue #125.
   *
   * `enterFreePlay` opened its week on the *building's* contract id, so `contractById` resolved and
   * a run that banks nothing was labelled **Scenario · day 1 · 0 clean shifts banked**. That week now
   * carries {@link FREE_PLAY_CONTRACT_ID}, which resolves to nothing — the same shape as the two
   * sentinels above, for the same reason, and it needs its own branch here for the reason the
   * comment below states: reaching the sandbox line would restore the words that comment removed.
   *
   * The progress line is deliberately the sandbox's, word for word. The two states differ in what
   * the player *did*, which is what the label says; they do not differ in what there is to report
   * about the run, and a second phrasing of one fact is how two lines come to disagree.
   */
  if (week.contractId === FREE_PLAY_CONTRACT_ID) {
    return {
      label: 'Free play',
      progress: `${String(Math.round(shiftLengthS / 60))} min of demand · nothing to bank`,
    };
  }

  return {
    label: 'Sandbox',
    /*
     * *free play* is deleted from this line, and the reason is not style: **Free Play is a mode**,
     * with a screen, a selection and a week reset that makes its runs postable. A sandbox run has a
     * week, and its growth and its events — so calling it free play named the one thing it is not.
     *
     * The branch above is that sentence enforced rather than restated: free play has a label of its
     * own, so this one cannot quietly become its label again.
     */
    progress: `${String(Math.round(shiftLengthS / 60))} min of demand · nothing to bank`,
  };
}

/* -------------------------------------------------------------------------- *
 * What happened to the week you just left — GitHub issue #107
 * -------------------------------------------------------------------------- */

/** What to call a week in a sentence about two of them. */
function weekName(week: WeekState): string {
  const contract = contractById(week.contractId);
  if (contract !== undefined) return contract.label;
  if (week.contractId === ENDLESS_CONTRACT_ID) return 'Your endless week';
  // Issue #125. Reachable as the *arrival* on every Free Play start — `dev/main.ts`'s `start` arm
  // prints this line for the same reason the building select does, and this is the fourth name it
  // can produce. As the *departure* it is unreachable and that is a property rather than a gap: a
  // free-play week is day 1 with nothing in it, so `weekKeptLine` returns `undefined` for it.
  if (week.contractId === FREE_PLAY_CONTRACT_ID) return 'Your free-play run';
  return 'Your own building’s week';
}

/**
 * One line about the week that was just put down and the one that was picked up — issue #107.
 *
 * ## Why this exists after the loss has already been fixed
 *
 * The issue asks for a confirmation — *"Garden Apartments is on day 4 with a 4-day streak. Switch to
 * Midtown Office? Your Garden week is kept."* — and that request was written against a product that
 * **destroyed** the week. A dialog guarding an action with no consequence is a worse answer than
 * none: it teaches a player to dismiss a prompt, which is exactly how the next prompt that does
 * matter gets dismissed too.
 *
 * What is genuinely owed is the *second half* of the issue's own sentence. Switching to Midtown
 * Office still puts **day 1** on the ribbon, and from the outside that is indistinguishable from the
 * defect: the player has no way to know their four days are waiting rather than gone until they
 * switch back and find out. So the fix is told rather than confirmed, and it is told **once**, in
 * the hint slot the coach ribbon already uses for news about a save.
 *
 * ## It is a claim about state and therefore has to be true
 *
 * Every figure in it is read off the week being parked at the moment it is parked, and the claim it
 * makes — *going back to it carries on from here* — is the property `state.test.ts` drives on the
 * legs rather than on the ribbon. A line saying a week is kept, over a build that dropped it, would
 * be this repository's own named failure with the polarity that matters most: a **false
 * reassurance** about progress.
 *
 * `undefined` when there is nothing to say, which is the ordinary case: a week on day 1 with no
 * streak and no closed days has nothing that could have been lost, and a notice about it would be
 * noise on every building change a player makes while they are still choosing one.
 */
export function weekKeptLine(left: WeekState, arrived: WeekState): string | undefined {
  if (left.contractId === arrived.contractId) return undefined;
  const hasProgress = left.day > 1 || left.streak > 0 || left.cleanRun > 0 || left.history.length > 0;
  if (!hasProgress) return undefined;

  /*
   * The counts are the two the issue names, and each appears only when it is non-zero — a *"with a
   * 0-day streak"* is a number printed to fill a slot, which is `docs/10` R3's blank-where-a-figure-
   * should-be with the blank filled in.
   */
  const also = [
    ...(left.streak > 0 ? [`a ${String(left.streak)}-day streak`] : []),
    ...(left.cleanRun > 0
      ? [`${String(left.cleanRun)} clean shift${left.cleanRun === 1 ? '' : 's'} banked`]
      : []),
  ];
  const carried =
    `day ${String(left.day)}` + (also.length === 0 ? '' : ` with ${also.join(' and ')}`);

  /*
   * The arrival's own clause, and free play gets a third rather than borrowing one — issue #125.
   *
   * *"starts a new week"* is the wrong claim about a Free Play run: the mode's whole premise is one
   * run from one selection, `advancesTheWeek` refuses to close a day into it, and a line promising a
   * week would be a caption describing something the run cannot become. Which leaves the true and
   * more useful thing to say — that nothing here is banked, so the week named in the first clause is
   * the only progress in play.
   */
  const arrival =
    arrived.contractId === FREE_PLAY_CONTRACT_ID
      ? 'is one run and banks nothing.'
      : arrived.day > 1
        ? `picks up on day ${String(arrived.day)}.`
        : 'starts a new week.';

  return (
    `${weekName(left)} is kept on ${carried} — pick that building again and it carries on from ` +
    `there. ${weekName(arrived)} ${arrival}`
  );
}
