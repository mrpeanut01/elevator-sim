/**
 * The week, as a pure state machine: streak, best day, banked shifts, and the seven-day history.
 *
 * ## Pure, and what that buys
 *
 * Every function here takes a {@link WeekState} and returns a new one. Nothing is mutated, nothing
 * is stored at module scope, no clock is read and no date exists — `dayIdx` is an index into
 * {@link WEEKDAYS} and nothing else. `week.test.ts` deep-freezes the input before every transition
 * and compares a structural snapshot afterwards, so *"pure"* is a property the suite checks rather
 * than a claim the docstring makes.
 *
 * The reason it matters beyond tidiness: the whole week is one serialisable value, so restoring a
 * session is assigning it, undoing a day is keeping the previous one, and a report is a function of
 * the state rather than a side effect of producing it. That is the same argument
 * `contract/types.ts` makes for a recording being a value rather than a live `Simulation`.
 *
 * ## Two rules copied deliberately from the design, including one that looks like a bug
 *
 * 1. **The streak resets on a missed day; the banked count does not.** `design.html` :1955 and
 *    :1957: `streak = allMet ? streak + 1 : 0`, but `cleanRun = allMet ? cleanRun + 1 : cleanRun`.
 *    A missed day costs the streak and keeps the progress. That is not an oversight in the
 *    prototype — it is what makes the design's own framing true (*"No losing — just a line you are
 *    trying to bend upward"*, *"nothing here is a game over"*): the streak is the thing you can
 *    lose, and the assignment is the thing you cannot. Ported verbatim, and named here so nobody
 *    "fixes" it.
 * 2. **Taking an assignment restarts the week and keeps what was cleared.** `design.html` :1643
 *    resets the streak and the banked count, restarts the week at day 1, and leaves `completed`
 *    alone. The scenarios card says the same thing in words: *"Taking an assignment restarts the
 *    week on that building."*
 *
 * ## Unjudged is not passed
 *
 * {@link DayOutcome.allMet} is computed by {@link outcomeOf} as *every reading is `met`*, so a day
 * with a `pending` goal is not a clean day. `campaign/judge.ts` takes the same line at batch scale
 * — *"`false` whenever any goal is `null`, because unjudged is not passed"* — and the reason is the
 * same: a morning that never woke up has not demonstrated anything, and banking it would let a
 * reader clear a scenario by closing five empty days.
 */

import { contractById, FIRST_CONTRACT_ID, nextContract } from './contracts.js';
import {
  weekdayOf,
  type ClearedAward,
  type DayOutcome,
  type GoalReading,
  type ShiftEventId,
  type WeekState,
} from './types.js';

/** How many days the sparkline holds (`design.html` :1973). Oldest falls off the left. */
export const HISTORY_DAYS = 7;

/**
 * The contract id an endless week carries — one no contract has, deliberately.
 *
 * ## Why a sentinel rather than an optional field
 *
 * `WeekState.contractId` is a `string` and every consumer already handles an id that resolves to
 * nothing: `contractById` returns `undefined` *"rather than a throw: a stale id in restored state is
 * a recoverable condition"*, `closeDay` banks the day and clears nothing, and the report says *your
 * own building — nothing is being banked*. That path exists because a reader can draw a building no
 * scenario runs, and it has been exercised since the shift layer landed.
 *
 * So an endless week needs no new branch anywhere — it needs an id that resolves to nothing, which
 * is a value rather than a type change. Making `contractId` optional would have added a `| undefined`
 * to every consumer to express a state four of them already express.
 *
 * Named rather than `''`, because an empty string is what a *broken* restore looks like and the two
 * must not be the same value.
 */
export const ENDLESS_CONTRACT_ID = 'endless';

/**
 * The contract id a week carries on a building **no scenario runs** — the sandbox.
 *
 * ## The defect this closes, which is not a naming one
 *
 * `Sandbox` was a label in the coach ribbon and `GAPS.md` filed it as *a string with no feature
 * behind it*. Driving it showed something worse: the state it names was **never entered**, and what
 * happened instead was a run banking somebody else's assignment.
 *
 * `withBuilding` moved the week to a building's own scenario and, for a building with none, *kept
 * the week it had* — so drawing a tower while on Scenario 2 left `contractId: 'c2'`, which
 * `contractById` resolves perfectly. The ribbon read **Scenario · day 4 · 1 clean shift banked** on
 * a building Scenario 2 has nothing to do with, and `closeDay` banked against it: **two clean days
 * on an invented tower cleared Scenario 2**, measured. That is the shape of forgery the leaderboard's
 * whole replay apparatus exists to refuse, arriving through the campaign's front door — and
 * `withBuilding`'s own docstring says it exists to prevent exactly this, then waved the case through
 * on the grounds that *"the sheet says the shift is not being banked"*, which is true only when the
 * contract is `undefined` and it was not.
 *
 * ## Why a third sentinel rather than reusing `ENDLESS_CONTRACT_ID`
 *
 * They are the same *mechanics* — no contract, nothing banked, nothing cleared — and different
 * *events*. Endless is chosen: a player pressed **Keep going** and asked for a week that never ends.
 * The sandbox is arrived at: a player drew a building, and there is no assignment for it because
 * nobody wrote one. Collapsing them would tell a reader who opened the editor that they had started
 * an endless run, which is a claim about an intention they did not have.
 *
 * That distinction costs one string and buys back the label: `Sandbox` is now printable, and true.
 */
export const SANDBOX_CONTRACT_ID = 'sandbox';

/**
 * A week with no assignment — the *endless mode* `c5` and `c8` name in their rewards.
 *
 * ## What it is, and what it deliberately is not
 *
 * It is the day loop with nothing to bank: the same days, the same 11 %/day growth, the same event
 * schedule and the same goals that harden. What it drops is the contract, so no clean shift is
 * banked, nothing clears, and the sheet says so through the path it already had.
 *
 * It is **not gated**. `contractStatus` has three answers and none of them is `locked`, because
 * `design.html`'s own `algoUnlocked` returns `true` unconditionally — *"scenarios teach, they do not
 * gate"* — and `contracts.ts` records that the completion-based unlock ladder beneath that early
 * return was deliberately not ported, *"because porting a branch the design disabled is how a gate
 * arrives by accident"*. Two rewards naming endless mode is the design describing what clearing a
 * scenario gets you conceptually; reading it as a lock would build the ladder by the back door.
 *
 * ## Where it stops
 *
 * Nowhere, and that is measured rather than asserted. `growth.test.ts` runs a deep day and finds the
 * building saturates — at which point `awtIsValid` refuses the mean and prints the reason, which is
 * machinery that predates this mode by a phase. A day cap would be a number somebody chose; the
 * suppression is a fact about the run. The first real wall is **compute**: Midtown Office at ×7.5
 * population does not simulate a 900-second run in a few seconds, and that is recorded in the same
 * test rather than guessed at here.
 */
export function openEndless(): WeekState {
  return openWeek(ENDLESS_CONTRACT_ID);
}

/** A fresh week on a scenario, at day 1. Nothing banked, nothing cleared, no history. */
export function openWeek(contractId: string = FIRST_CONTRACT_ID): WeekState {
  return {
    contractId,
    day: 1,
    dayIdx: 0,
    streak: 0,
    bestMinutePct: 0,
    cleanRun: 0,
    completed: [],
    history: [],
    cleared: null,
    attempt: 0,
    closedDay: null,
    banked: null,
  };
}

/** What {@link outcomeOf} needs beyond the readings themselves. */
export interface DayOutcomeInput {
  readonly day: number;
  readonly dayIdx: number;
  readonly eventId: ShiftEventId;
  readonly arrived: number;
  readonly carried: number;
  /** The observation the sparkline and the *best day so far* figure both read. */
  readonly minutePct: number;
  readonly readings: readonly GoalReading[];
}

/**
 * Assemble the day that just ended.
 *
 * Split out from {@link closeDay} so the *"was this a clean day"* rule lives in one place and can
 * be asserted on its own. A day with no goals is **not** clean: `every` over an empty array is
 * `true`, which would make a shift with nothing to prove indistinguishable from one that proved
 * everything.
 */
export function outcomeOf(input: DayOutcomeInput): DayOutcome {
  return {
    day: input.day,
    dayIdx: input.dayIdx,
    weekday: weekdayOf(input.dayIdx),
    eventId: input.eventId,
    arrived: input.arrived,
    carried: input.carried,
    minutePct: input.minutePct,
    readings: input.readings,
    allMet:
      input.readings.length > 0 && input.readings.every((reading) => reading.state === 'met'),
  };
}

/**
 * Close the day and hand back the week it produced.
 *
 * Total, and does not throw: a `contractId` that names no contract (restored state from an older
 * build, a scenario since renamed) banks the day and clears nothing, rather than losing the day to
 * an exception. The banner is simply absent, which is the honest rendering of *"we do not know what
 * this was an assignment for"*.
 */
export function closeDay(week: WeekState, outcome: DayOutcome): WeekState {
  /*
   * ## A day banks once, and a retry replays it rather than adding to it
   *
   * `docs/16` § 5 clause 1. Before this, closing the same day twice ran the arithmetic twice: a
   * clean Monday closed three times banked three clean shifts and cleared a contract that needs
   * three, without the doors ever opening on Tuesday. Nothing guarded it — `closeShift`'s only
   * guard is `filedRunId`, which `adopt` clears on every run it takes on, so **every** press of
   * *Run this shift* re-arms it, which is exactly what every control in the shell does when it is
   * moved. (This sentence used to say a re-run's *recording id* is new by construction. It is not:
   * `runId` is `building-profile-seed`, so re-running one selection produces the same id and the
   * same recording. What re-arms the guard is `adopt`, not a fresh id — issue #16, § D222.)
   *
   * The fix is not to refuse the second close. A player who misses a day and re-runs it **should**
   * be able to recover — the design is explicit that *"nothing here is a game over"* — and refusing
   * would also make the sheet disagree with the run on screen. So the day's contribution is
   * recomputed from {@link WeekState.banked}, the snapshot taken before the day was first closed.
   * Re-closing therefore *replaces* the day's effect:
   *
   * | first attempt | this attempt | banked count |
   * |---|---|---|
   * | missed | clean | goes up by one — the recovery the design asks for |
   * | clean | clean | unchanged — the exploit |
   * | clean | missed | comes back down, because the day it was banked for is not clean any more |
   *
   * The third row is the one that needs `banked` to exist at all: without a snapshot there is no
   * way to un-bank, and a rule that could only ever add would let a player bank a clean run and
   * then keep the credit while re-running until the *picture* was prettier.
   */
  const retry = week.closedDay === outcome.day;
  const base =
    retry && week.banked !== null
      ? week.banked
      : { streak: week.streak, cleanRun: week.cleanRun, completed: week.completed };

  const streak = outcome.allMet ? base.streak + 1 : 0;
  // The banked count survives a missed day. See the module docstring, rule 1.
  const cleanRun = outcome.allMet ? base.cleanRun + 1 : base.cleanRun;
  const contract = contractById(week.contractId);

  const clears =
    contract !== undefined &&
    cleanRun >= contract.needClean &&
    !base.completed.includes(contract.id);

  const cleared: ClearedAward | null =
    clears && contract !== undefined ? awardFor(contract.id, contract.reward) : null;

  return {
    contractId: week.contractId,
    day: week.day,
    dayIdx: week.dayIdx,
    streak,
    /*
     * `bestMinutePct` is a **high-water mark and stays one**, measured against the week rather than
     * the attempt. It is an observation about what this building has been seen to do, not a reward
     * for the current attempt, and rolling it back would mean a player's best day disappeared
     * because they re-ran a later one.
     */
    bestMinutePct: Math.max(week.bestMinutePct, outcome.minutePct),
    cleanRun,
    completed: clears && contract !== undefined ? [...base.completed, contract.id] : base.completed,
    // A retry replaces the day it re-ran rather than appending a second entry for it — otherwise the
    // seven-day sparkline would show Monday twice and the week would look a day longer than it is.
    history: retry
      ? [...week.history.slice(0, -1), outcome]
      : [...week.history, outcome].slice(-HISTORY_DAYS),
    cleared,
    attempt: retry ? week.attempt + 1 : 1,
    closedDay: outcome.day,
    banked: base,
  };
}

/**
 * Open the doors on tomorrow.
 *
 * Clears {@link WeekState.cleared}: the banner belongs to the report of the day that earned it, not
 * to the week. A banner that persisted would congratulate a reader on Wednesday for something they
 * did on Monday.
 */
export function nextDay(week: WeekState): WeekState {
  return {
    ...week,
    day: week.day + 1,
    dayIdx: (week.dayIdx + 1) % 7,
    cleared: null,
    // Tomorrow has not been attempted, and yesterday's snapshot is spent: once the doors open on
    // the next day, the previous one is banked for good and there is nothing left to replay.
    attempt: 0,
    closedDay: null,
    banked: null,
  };
}

/**
 * Change what the week is *of*, keeping everything about how it has gone.
 *
 * The difference from {@link takeContract} is the whole of the distinction between *taking an
 * assignment* and *changing building*: taking one restarts the week, because a scenario is a fresh
 * seven days on a new tower. Moving to a building **no scenario runs** is not a new week — the
 * player is on day 4 with a streak of two and they still are; what has changed is that there is now
 * nothing to bank toward. Restarting there would confiscate a week for opening the editor.
 *
 * Used with {@link SANDBOX_CONTRACT_ID} by `withBuilding`, and it is deliberately narrow: it moves
 * one field and nothing else, so it cannot become a second way of taking a contract.
 */
export function withContract(week: WeekState, contractId: string): WeekState {
  return { ...week, contractId };
}

/**
 * Take an assignment: restart the week on that scenario, keeping what has been cleared.
 *
 * `design.html` :1643, and the scenarios card's own sentence. The history goes with the week — a
 * sparkline that mixed Garden Apartments' quiet mornings with Vertical City's would be seven bars
 * of two different buildings.
 */
export function takeContract(week: WeekState, contractId: string): WeekState {
  return { ...openWeek(contractId), completed: week.completed };
}

/** The award payload the report's green banner reads. */
function awardFor(contractId: string, reward: string): ClearedAward {
  const next = nextContract(contractId);
  return {
    contractId,
    reward,
    nextContractId: next?.id ?? null,
    nextTitle:
      next === undefined
        ? 'any scenario you like — they are all open'
        : `${next.label} — ${next.title}`,
  };
}
