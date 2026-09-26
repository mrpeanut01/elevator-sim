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

import { scheduledEventFor, type CalendarPeriod } from '../shift/calendar.js';
import { CONTRACTS } from '../shift/contracts.js';
import {
  admittedPressDayIds,
  CONTRACT_LADDER,
  ladderRowFor,
  pressDayFor,
  pressDayStanding,
  type ContractLadder,
} from '../shift/ladder.js';
import type { RunHorizon, WeekState } from '../shift/types.js';
import { switchWeek } from '../shift/week.js';
import { weekOfferOf } from '../shift/weekStake.js';

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
  /**
   * **Whether this tower's scenario clear is offered or held** — swarm DM's ruling (a),
   * [§ D1179](../../../../DECISIONS.md), read off `shift/weekStake.ts#weekOfferOf` rather than
   * typed. `undefined` where the week census does not speak for the tower. A held row is still a
   * press: only the scenario's clear is held, and the week it opens runs and closes like any other.
   */
  readonly scenario: 'offered' | 'held' | undefined;
  /**
   * The line drawn beside the row where there is something to say: why the scenario is held, or
   * which one day of the week counts. Words only, with its counts spelled, so the surface keeps its
   * no-digit rule.
   */
  readonly scenarioLine: string | undefined;
}

/**
 * **One pinned day a player can set up from here** — GitHub issue #595,
 * [§ D973](../../../../DECISIONS.md).
 *
 * A row per contract whose rung pins a `ContractPressDay`, and only where the pin was
 * measured on the horizon the Scenario press runs that tower on — which `contractLadderIssues`
 * already requires of the data, and which is asked again here so a surface never offers a day the
 * product would not run as it was measured.
 */
export interface PressDayChoiceRow {
  readonly contractId: string;
  /** `Scenario 6` — the contract's own label. */
  readonly label: string;
  readonly tower: string;
  /** Whether a press sets the pinned day up. */
  readonly available: boolean;
  /** Whether the run standing now **is** the pinned day — then the row is inert. */
  readonly standing: boolean;
  /** What the press will do, or why it will not — drawn beside the row. */
  readonly note: string;
}

export interface PressDayChoiceView {
  readonly heading: string;
  readonly lede: string;
  readonly note: string;
  readonly rows: readonly PressDayChoiceRow[];
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
  /** The days a press decides, as a second list under the towers — {@link PressDayChoiceView}. */
  readonly pressDays: PressDayChoiceView;
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

/**
 * Every sentence the pinned-day list says — GitHub issue #595, [§ D973](../../../../DECISIONS.md).
 *
 * ## What the lede may claim, and it is exactly what `shift/pressLadder.test.ts` proves
 *
 * On each admitted pinned day, under the tower's standing order: the day misses as built, the stage
 * stops to call for a press, and from that call one parking press clears the day and the other
 * does not at every moment tried over the window the pin was admitted on. The lede says those
 * things and **not which press** — naming it would turn the day into a switch. It says *measured*
 * because it is one day on one crowd, and § D914's fifty-seed measurement found a press flips a
 * day's verdict in a minority of pairs with no tower's effect distinguishable from zero, so nothing
 * here may read as a rule about a tower.
 *
 * ## The clause it used to carry, and why it went — wave AI, [§ D1029](../../../../DECISIONS.md)
 *
 * It read *"with the press made while the car is away"*, and the docstring here called that *the
 * pinned moment in words*. It was not: the pin was one instant, and measured over the car's
 * absence the clearing press held throughout on two of the seven rows and failed for most of it on
 * four (the ruling's honesty lens, § 2 of its record, measured on `e1d10ac`). The phrase is gone, and what
 * replaced it is **derived** — {@link pressDayLedeOf} reads the shortest admitted window off the
 * pinned data and says it in words, so the lede can claim no more time than the least of the rows
 * under it was measured over. No digit, the surface's own rule: the minutes are spelled.
 *
 * ## A pin on the other horizon is listed and refused, by name
 *
 * A pin measured on the slice of a tower the Scenario press runs as a whole day is a measurement of
 * a day no player can take (GitHub issue #595), so its row is drawn disabled with
 * {@link PRESS_DAY_CHOICE_COPY}'s `otherHorizon` rather than hidden: a list that silently shrank
 * would be a picker a player cannot read their options off, and the tower list's own selected row
 * already sets that precedent.
 *
 * ## What choosing one costs, said before the press
 *
 * It moves the week exactly as the list above does (`resume`, never `restart`), sets the crowd to
 * the pinned seed rather than the day's, and hands the day back to the tower's standing order,
 * because the claim is only measured under that one. Choosing a tower from the list above puts the
 * crowd back to the one the session had, so the pinned seed does not follow the player onto a
 * tower it was never measured on.
 */
export const PRESS_DAY_CHOICE_COPY = Object.freeze({
  heading: 'DAYS A PRESS DECIDES',
  /** The lede's two halves either side of the derived window — see {@link pressDayLedeOf}. */
  ledeBefore:
    'On each of these a lift goes out part-way through the first day, and the stage stops to ' +
    'call for a press. Measured on one crowd under the tower’s standing order, that day misses as ' +
    'built; from the call, one of the two parking presses cleared it and the other did not at every ' +
    'moment tried over the ',
  ledeAfter: ' after it. Which one is for you to find.',
  /** Drawn in place of the lede when no row is admitted — a list with nothing to offer says so. */
  ledeNone:
    'No tower has a first day that holds for long enough after the stage’s call to be offered here.',
  notAdmitted:
    'measured on one crowd, the press did not hold for long enough after the stage’s call to be a ' +
    'day you can play for, so it is not offered',
  note:
    'Choosing one moves your week there the way the list above does, sets its first day up on the ' +
    'crowd it was measured on rather than today’s, and hands the day back to the tower’s standing ' +
    'order. Choosing a tower from the list above puts your crowd back.',
  available: 'sets this tower’s first day up on the crowd it was measured on',
  standing: 'the day you are set up to play',
  pastFirstDay:
    'your week here is past its first day, and this is a first day, so it cannot be set up on it',
  notAsMeasured:
    'the first day here would not run the way it was measured, so it is not offered',
  otherHorizon:
    'measured on a different length of day from the one this tower plays, so it is not offered ' +
    'until it is measured on the day you would play',
});

/** Minutes in words, for a surface that may carry no digit. */
const MINUTE_WORDS: readonly string[] = Object.freeze([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
]);

/**
 * **The lede, derived from the admitted windows** — [§ D1029](../../../../DECISIONS.md).
 *
 * The shortest window among the admitted pins, in whole minutes and in words, is the only span the
 * lede may name: every row under it was measured over at least that long after its call, and no
 * row over more than its own. `shift/ladder.ts#admittedPressDayIds` is the admitted set, so a pin
 * that stops being admitted takes its window out of this sentence on the same commit.
 */
export function pressDayLedeOf(ladder: ContractLadder = CONTRACT_LADDER): string {
  const admitted = admittedPressDayIds(ladder);
  const windows = ladder.rows
    .filter((row) => admitted.includes(row.contractId))
    .map((row) => row.pressDay?.call?.windowS ?? 0);
  if (windows.length === 0) return PRESS_DAY_CHOICE_COPY.ledeNone;
  const minutes = Math.floor(Math.min(...windows) / 60);
  const words = MINUTE_WORDS[minutes] ?? 'ten';
  const span = minutes === 1 ? 'minute' : `${words} minutes`;
  return `${PRESS_DAY_CHOICE_COPY.ledeBefore}${span}${PRESS_DAY_CHOICE_COPY.ledeAfter}`;
}

/** What {@link pressDayChoiceOf} needs — the week, the parked weeks and the run's other three facts. */
export interface PressDayChoiceInput {
  readonly week: WeekState;
  readonly parked: readonly WeekState[];
  /** `ViewerState.seed` — the crowd the next press runs. */
  readonly seed: bigint;
  /** `ViewerState.calendar` — the measurement ran with none. */
  readonly calendar: CalendarPeriod | null;
  /** The horizon the Scenario press runs a building on — `shift/dayLength.ts#scenarioHorizonFor`. */
  readonly horizonFor: (buildingId: string) => RunHorizon | undefined;
}

/**
 * Whether pressing `contractId`'s pinned-day row sets the pinned day up, and the sentence that says
 * so — the one answer the picker draws and `everyday/host.ts#playPressDay` obeys.
 *
 * The destination week is `switchWeek`'s own answer rather than a guess at it, so a row is offered
 * exactly when the week the press would land on stands on a first day that draws the ordinary
 * wrinkle, with no calendar, on the horizon the pin was measured on. `undefined` for a contract
 * that pins no day.
 */
export function pressDayChoiceOf(
  input: PressDayChoiceInput,
  contractId: string,
): { readonly available: boolean; readonly standing: boolean; readonly note: string } | undefined {
  const press = pressDayFor(contractId);
  const contract = CONTRACTS.find((candidate) => candidate.id === contractId);
  if (press === undefined || contract === undefined) return undefined;
  const horizon = input.horizonFor(contract.buildingId);
  const eventOf = (week: WeekState): string =>
    scheduledEventFor(input.calendar, week.day, week.dayIdx).id;
  const standing =
    input.week.contractId === contractId &&
    pressDayStanding({
      contractId,
      day: input.week.day,
      eventId: eventOf(input.week),
      hasCalendar: input.calendar !== null,
      seed: input.seed,
      horizon,
    }) !== undefined;
  if (standing) return { available: false, standing, note: PRESS_DAY_CHOICE_COPY.standing };
  /*
   * § D1029: a row the admission criterion refuses is drawn refused with its reason — the data's
   * own sentence where it carries one, § D973's refused-row precedent — and never offered.
   */
  if (press.refused !== undefined) return { available: false, standing, note: press.refused };
  if (!admittedPressDayIds().includes(contractId)) {
    return { available: false, standing, note: PRESS_DAY_CHOICE_COPY.notAdmitted };
  }
  if (horizon !== undefined && horizon !== press.horizon) {
    return { available: false, standing, note: PRESS_DAY_CHOICE_COPY.otherHorizon };
  }
  const landing =
    input.week.contractId === contractId
      ? input.week
      : switchWeek(input.week, input.parked, contractId, 'resume').week;
  if (landing.day !== 1) {
    return { available: false, standing, note: PRESS_DAY_CHOICE_COPY.pastFirstDay };
  }
  /*
   * The same predicate the moot sentence draws on, asked of the run the press would leave standing:
   * the landing week, the pinned seed. If it would not be the pinned day, the row says so rather
   * than setting up something else under the pinned day's name.
   */
  const asMeasured =
    pressDayStanding({
      contractId,
      day: landing.day,
      eventId: eventOf(landing),
      hasCalendar: input.calendar !== null,
      seed: BigInt(press.seedText),
      horizon,
    }) !== undefined;
  return asMeasured
    ? { available: true, standing, note: PRESS_DAY_CHOICE_COPY.available }
    : { available: false, standing, note: PRESS_DAY_CHOICE_COPY.notAsMeasured };
}

/** Whether a week holds anything a player did — a closed day, or a day past the first. */
function weekHasBeenPlayed(week: WeekState): boolean {
  return week.history.length > 0 || week.day > 1 || week.closedDay !== null;
}

/** What {@link towerChoiceViewOf} needs. Threaded rather than imported, `today.ts`'s own idiom. */
export interface TowerChoiceInput extends PressDayChoiceInput {
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
  /*
   * **Only a parked week somebody has played is *a week going here*** — the post-AH panel's B.md:
   * a fresh profile read *"you have a week going here — this picks it back up"* on Garden
   * Apartments before anything had been played, because the first-session draw parks the opening
   * week it moves off. Picking that week back up lands on day 1 with no history, which is a fresh
   * week in everything the player can see, so the row says `open`. The press is unchanged —
   * `switchWeek` still resumes whatever is parked — and the sentence now describes it on both
   * kinds of parked week. Recorded here under [§ D405](../../../../DECISIONS.md).
   */
  const parkedIds = new Set(input.parked.filter(weekHasBeenPlayed).map((entry) => entry.contractId));
  const rows = CONTRACTS.map((contract): TowerChoiceRow => {
    const selected = contract.id === input.week.contractId;
    const offer = weekOfferOf(contract.id);
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
      scenario: offer?.offer,
      scenarioLine: offer?.line,
    };
  });
  const pressRows = CONTRACTS.flatMap((contract): PressDayChoiceRow[] => {
    const choice = pressDayChoiceOf(input, contract.id);
    if (choice === undefined) return [];
    return [
      {
        contractId: contract.id,
        label: contract.label,
        tower: input.nameOf(contract.buildingId) ?? contract.buildingId,
        available: choice.available,
        standing: choice.standing,
        note: choice.note,
      },
    ];
  });
  return {
    heading: TOWER_CHOICE_COPY.heading,
    lede: TOWER_CHOICE_COPY.lede,
    note: TOWER_CHOICE_COPY.note,
    rows: Object.freeze(rows),
    incidentTag: TOWER_CHOICE_COPY.incidentTag,
    pressDays: {
      heading: PRESS_DAY_CHOICE_COPY.heading,
      lede: pressDayLedeOf(),
      note: PRESS_DAY_CHOICE_COPY.note,
      rows: Object.freeze(pressRows),
    },
  };
}
