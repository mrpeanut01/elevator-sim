/**
 * **Which tower your week runs on, as a control** — GitHub issue **#587**,
 * [§ D912](../../../../DECISIONS.md).
 *
 * ## The defect this answers, in the assessor's own measurement
 *
 * [§ D871](../../../../DECISIONS.md) built the first day in the product whose verdict turns on a
 * press: Crown Hotel, `c7`, day 1. An assessor reproduced it on its own harness and then found the
 * thing that stopped it counting — **no player action reaches that day**. `c7` enters a week in
 * exactly two ways: `shift/firstSession.ts`'s draw, which the assessor measured at **37 of 365
 * dates** and which `dev/state.ts#withFirstSession` takes **once per device**; or the campaign,
 * where it is Scenario 6, behind roughly fifteen clean days and a standing gate. So the one day
 * where what the player does while watching decides the outcome could not be reached on purpose,
 * and the panel's reachability score fell from 7 to 6 on that alone.
 *
 * It is not that the mechanism was missing. `shift/week.ts#switchWeek` has parked and resumed a
 * week per assignment since GitHub issue #107, and `everyday/host.ts` already drives it from the
 * campaign's *take an offer*. What was missing was **a control in the daily loop** — this
 * repository's signature defect one layer up: everything wired, nothing a player can press.
 *
 * ## Why `resume` and not `restart`, which is the one real decision here
 *
 * `shift/week.ts#WeekArrival` has two arms and they are not interchangeable. *Taking an assignment*
 * restarts the destination — the scenarios card promises exactly that, and the campaign's offer
 * card presses it. **This control promises nothing of the sort.** A player choosing which tower to
 * play today has not accepted a contract; they are picking up a week, and a week they left on day 4
 * with a streak of three is theirs. So the arrival is `resume`, the departing week is parked under
 * its own id, and {@link TowerChoiceRow.arrival} says on each row's own face which of the two the
 * press will do — because a control that silently restarted a week would be worse than no control:
 * it would destroy something the player can never get back (`shift/week.ts`'s own account of what
 * a bare `takeContract` cost three callers).
 *
 * ## No gate, and that is a decision rather than an omission
 *
 * Every shipped contract is listed and every one is pressable. The campaign's ladder gates
 * `campaign/career.ts#offerRefusalOf` — a slot, a standing, a fee — and those are facts about the
 * **career**, which is a different record from the daily loop's week (`everyday/host.ts` keeps them
 * apart deliberately). Re-using that gate here would make the daily loop a second career, and
 * gating the one control that exists to make a day reachable would be the defect this module was
 * written to close, re-introduced as a rule.
 *
 * ## What it publishes and what it refuses to
 *
 * Rows carry the scenario's own label, the tower's name and what it teaches — all authored strings
 * from `shift/contracts.ts`. **No figure appears anywhere on this surface**, and
 * `towerChoice.test.ts` fails on a digit in any drawn string other than the scenario label the
 * contract itself authors. The honesty search asks whether a figure is *licensed*, and a miss rate
 * or a day count drawn beside a tower name would be a figure whose source a player cannot reach.
 *
 * Pure: no DOM, no host, no `data/` read beyond the contracts module every screen already imports —
 * `doorScreen.ts` mounts what this returns, and the honesty corpus drives it without a document.
 */

import { CONTRACTS } from '../shift/contracts.js';
import { ladderRowFor } from '../shift/ladder.js';
import type { WeekState } from '../shift/types.js';

/** What pressing a row will do to the week — `shift/week.ts#WeekArrival`, said before the press. */
export type TowerChoiceArrival = 'resume' | 'open' | 'standing';

/** One tower a player can move their week to. */
export interface TowerChoiceRow {
  /** The contract id — the corpus and the tests address rows by this, never by position. */
  readonly contractId: string;
  /** `Scenario 6` — the contract's own label. */
  readonly label: string;
  /** The tower's name, or its building id when this build cannot resolve the document. */
  readonly tower: string;
  /** What this one teaches that none of the others can — the contract's own sentence. */
  readonly teaches: string;
  /** Whether this is the week standing now. Exactly one row is. */
  readonly selected: boolean;
  /** What the press does: pick a parked week back up, open a fresh one, or nothing. */
  readonly arrival: TowerChoiceArrival;
  /** That, in the player's words — drawn beside the row, never only as a `title`. */
  readonly arrivalNote: string;
  /**
   * Whether this tower's contract books one of its own cars out part-way through the day —
   * § D871's `ContractFabric.incidents`, read off the rung rather than authored here.
   *
   * Drawn as a tag, so the days whose verdict turns on a press are **findable from the picker**,
   * which is the whole of what #587 is about. It says no clock and no fraction, for
   * `everyday/today.ts#outOfServiceOf`'s recorded reason: the strip is drawn before the run, and an
   * instant printed here would be a figure whose only source is a schedule the reader cannot see.
   */
  readonly booksACarOut: boolean;
}

export interface TowerChoiceView {
  readonly heading: string;
  /** What this control is for, above the rows. */
  readonly lede: string;
  /** What a press costs — said once, before any of them. */
  readonly note: string;
  readonly rows: readonly TowerChoiceRow[];
  /** The tag a row with a mid-shift absence carries. */
  readonly incidentTag: string;
}

export const TOWER_CHOICE_COPY = Object.freeze({
  heading: 'THIS WEEK’S TOWER',
  lede: 'Your week runs on one building. Pick the one you want to play.',
  note:
    'Moving parks the week you are on rather than ending it, so you can come back to it. The day ' +
    'you have not closed yet stays unclosed on the week you leave.',
  incidentTag: 'a lift goes out mid-shift',
  standing: 'the week you are playing',
  resume: 'you have a week going here — this picks it back up',
  open: 'you have not played here — this opens a fresh week',
});

/** What {@link towerChoiceViewOf} needs. Threaded rather than imported, `today.ts`'s own idiom. */
export interface TowerChoiceInput {
  readonly week: WeekState;
  /** The weeks parked beside the live one — `ViewerState.parkedWeeks`. */
  readonly parked: readonly WeekState[];
  /** A building's own name, or `undefined` when this build cannot resolve the document. */
  readonly nameOf: (buildingId: string) => string | undefined;
}

/**
 * The picker, for a week and the weeks parked beside it.
 *
 * Total over the shipped contracts and over a week standing on **none** of them — a sentinel week
 * (the rush, a replay, free play, the sandbox) selects no row, and every row then reads `resume` or
 * `open` on its own merits. That is correct rather than a fallback: the player is somewhere the
 * picker does not list, and every listed tower is somewhere they can go.
 */
export function towerChoiceViewOf(input: TowerChoiceInput): TowerChoiceView {
  const parkedIds = new Set(input.parked.map((entry) => entry.contractId));
  const rows = CONTRACTS.map((contract): TowerChoiceRow => {
    const selected = contract.id === input.week.contractId;
    const arrival: TowerChoiceArrival = selected
      ? 'standing'
      : parkedIds.has(contract.id)
        ? 'resume'
        : 'open';
    return {
      contractId: contract.id,
      label: contract.label,
      tower: input.nameOf(contract.buildingId) ?? contract.buildingId,
      teaches: contract.teaches,
      selected,
      arrival,
      arrivalNote: TOWER_CHOICE_COPY[arrival],
      booksACarOut: (ladderRowFor(contract.id)?.fabric.incidents.length ?? 0) > 0,
    };
  });
  return {
    heading: TOWER_CHOICE_COPY.heading,
    lede: TOWER_CHOICE_COPY.lede,
    note: TOWER_CHOICE_COPY.note,
    rows: Object.freeze(rows),
    incidentTag: TOWER_CHOICE_COPY.incidentTag,
  };
}
