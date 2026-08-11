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

import type { WatchRecord } from '../watch/types.js';

import { CONTRACTS, contractById, FIRST_CONTRACT_ID, nextContract } from './contracts.js';
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
 * The contract id a **Free Play** week carries — GitHub issue #125.
 *
 * ## Why free play needs an id of its own, which is a fact about {@link switchWeek} rather than a
 * preference
 *
 * `menu/enterFreePlay.ts` opened its week as `openWeek(contractForBuilding(buildingId)?.id)` — the
 * *campaign's* contract id, borrowed for the label. On a building the campaign is not being played
 * on that is harmless. On the campaign's own building it is the whole of issue #125: the week on
 * screen and the week being replaced were the same contract, so {@link switchWeek}'s first line —
 * `if (contractId === week.contractId) return { week, parked }` — made the departure a no-op, and
 * the campaign's day 4 was then overwritten in memory by a day-1 week wearing its id.
 *
 * **Parking it under the borrowed id does not fix that, and that was driven rather than reasoned
 * about.** A parked `c2` beside a live `c2` violates the one invariant {@link switchWeek} maintains
 * — see `dev/state.ts#ViewerState.parkedWeeks` — and the violation is not cosmetic: the next switch
 * away filters the list by `entry.contractId !== week.contractId`, so the parked campaign week is
 * dropped and the free-play scaffold is parked in its place. The player would have a week back that
 * looked right for exactly as long as they did not touch the building select.
 *
 * So a free-play week is a week on **no assignment**, and it says so in the one field every consumer
 * already reads. `contractById` answers `undefined`, the rail's *banked this scenario* reads `—`
 * rather than `0/3` under a run that banks nothing, and {@link switchWeek} can tell the two weeks
 * apart — which is what lets the departing campaign week be parked and picked up again.
 *
 * ## Why a third sentinel rather than reusing {@link SANDBOX_CONTRACT_ID}
 *
 * {@link SANDBOX_CONTRACT_ID}'s own docstring made this argument once and it holds again: the same
 * *mechanics*, a different *event*. The sandbox is arrived at — a player drew a building and nobody
 * wrote an assignment for it — and free play is chosen, from a screen, as a selection. `weekLabel.ts`
 * says the difference out loud already: the words *free play* were deleted from its sandbox line
 * precisely because *"Free Play is a mode … a sandbox run has a week, and its growth and its
 * events"*. Routing free play back through that branch would restore the sentence that comment
 * removed.
 *
 * Reuse also fails to close the case it was reused for. A player entering free play **from** a
 * sandbox week would meet {@link switchWeek}'s same-id line again, and their drawn building's day 6
 * would be overwritten by exactly the mechanism above.
 *
 * It shares its spelling with the `PlayMode` of the same name, and that is deliberate rather than a
 * collision: two fields in different namespaces naming one state, where a third spelling would be a
 * value a reader has to translate.
 */
export const FREE_PLAY_CONTRACT_ID = 'free-play';

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
  /**
   * The run this day was, or `null` — {@link DayOutcome.record}, taken as an input rather than
   * derived.
   *
   * Deciding whether a run is re-askable needs `BrowserResources` and the scope table, and neither
   * belongs in `shift/`. So the caller decides — `dev/main.ts#closeShift`, through
   * `watch/record.ts#watchRecordOf` — and this function stores what it is handed. The parameter is
   * **required** rather than optional so a caller that has forgotten it is a compile error: an
   * optional record would default to `null` and file every day unwatchable, silently, which is
   * exactly the shape of failure this repository keeps paying for.
   */
  readonly record: WatchRecord | null;
  /**
   * Why there is no record, or `null` — {@link DayOutcome.recordRefusal}, on `record`'s exact
   * footing and required for `record`'s exact reason.
   *
   * The caller passes both because only the caller can produce either: the sentence comes from
   * `watch/record.ts#recordRefusalFor`, which needs `BrowserResources` and the scope table.
   * Required rather than optional so a caller that forgets it cannot silently file a day whose
   * refusal has no cause — which is the state `docs/20` defect 1 is about.
   */
  readonly recordRefusal: string | null;
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
    record: input.record,
    // `null` for a day that has a record, and the sentence that refused it otherwise — the two are
    // written together by one caller so a day can never carry both or neither.
    recordRefusal: input.recordRefusal,
    allMet:
      input.readings.length > 0 && input.readings.every((reading) => reading.state === 'met'),
  };
}

/**
 * Whether a day was **judged at all** — § D234, issue #27.
 *
 * `DayOutcome.allMet` answers *did it pass*, and returns `false` for two different days: one that
 * was asked for 87 % and carried 61 %, and one whose building never woke up. The product said the
 * same thing about both — *"Shift missed. Streak reset."* — over a day that carried 18 of 18 people
 * with 100 % away inside a minute and a 36 s worst wait.
 *
 * **Derived from {@link DayOutcome.readings} rather than stored beside `allMet`**, and that is the
 * decision rather than the implementation: `readings` is already persisted, so a session written by
 * an older build answers this correctly with no schema change and no migration, and there is no way
 * for a restored day to carry a `graded` flag that disagrees with the readings under it. A second
 * stored field would have been a second answer to a question one of them already contains.
 *
 * A day with no goals is not graded, for `allMet`'s own reason: `every` over an empty array is
 * `true`, and a shift with nothing to prove must not be indistinguishable from one that proved
 * everything.
 */
export function wasGraded(readings: readonly GoalReading[]): boolean {
  return readings.length > 0 && readings.every((reading) => reading.state !== 'pending');
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
   * same recording. What re-arms the guard is `adopt`, not a fresh id — issue #16, § D223.)
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

  /*
   * ## A day nobody judged costs nothing — § D234, issue #27
   *
   * The rule copied from the design is *the streak resets on a **missed** day*, and until now this
   * line read `outcome.allMet ? base.streak + 1 : 0`, which resets it on an **ungraded** one too.
   * Those are different events and the product said the same thing about both: a play-tester
   * carried 18 of 18 with 100 % away inside a minute and was told *"Streak reset"* — a sentence
   * that names something taken away from somebody who had nothing.
   *
   * So an ungraded day leaves the streak where it was. It is still not a clean day: `allMet` is
   * `false` when anything is `pending`, so `cleanRun` does not move and nothing clears — *unjudged
   * is not passed* is untouched, and this is its other half. **Unjudged is not failed either.**
   *
   * The banked count survives a missed day regardless. See the module docstring, rule 1.
   */
  const streak = outcome.allMet
    ? base.streak + 1
    : wasGraded(outcome.readings)
      ? 0
      : base.streak;
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
 * Deliberately narrow: it moves one field and nothing else, so it cannot become a second way of
 * taking a contract.
 *
 * ## Its non-test caller
 *
 * {@link switchWeek}, and **only** that — it was `dev/state.ts#withBuilding` until issue #107 put
 * `switchWeek` between them. Named rather than left implicit, because an export whose every outside
 * reference is a test is the shape this repository counts, and the answer here is that the
 * behaviour is reached on every switch to a building no scenario runs. The export survives because
 * `week.test.ts` pins the sandbox carry as a rule of its own, which is what `switchWeek`'s sandbox
 * arm is asserted against.
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
 *
 * ## Its non-test caller
 *
 * {@link switchWeek}, on every first visit to an assignment and on every `restart` arrival. It had
 * three direct callers before issue #107 — `withBuilding`, the scenario card and *Take the next
 * assignment* — and **all three were destroying the week they were called on**, because restarting
 * the destination was the only thing a single slot could express. They now go through
 * `switchWeek`, which parks the departure and calls this for the arrival.
 */
export function takeContract(week: WeekState, contractId: string): WeekState {
  return { ...openWeek(contractId), completed: week.completed };
}

/* -------------------------------------------------------------------------- *
 * A week per assignment — GitHub issue #107
 * -------------------------------------------------------------------------- */

/**
 * How many weeks are kept beside the one being played, and why it is this number.
 *
 * One per contract, plus the three sentinel weeks a player can also be on —
 * {@link SANDBOX_CONTRACT_ID}, {@link ENDLESS_CONTRACT_ID} and {@link FREE_PLAY_CONTRACT_ID}. So the
 * set is *closed*: every id {@link switchWeek} can ever be asked for has a place, and the ceiling is
 * a bound on a slot rather than a policy about how much history a player may keep.
 *
 * It was `+ 2` until issue #125 gave free play a week of its own to leave behind. The `+ 3` is
 * derived from the same closed set rather than nudged: a sentinel that can be parked and has no slot
 * evicts the oldest week in the list, which is the loss this ceiling exists to bound rather than to
 * cause.
 *
 * It is derived from `CONTRACTS` rather than written as `10`, for § D213's reason: three buildings
 * landed after the campaign was designed and five hand-written lists had to be widened by hand, two
 * of them guards that could no longer see what they were guarding. A ninth scenario must not silently
 * start evicting somebody's week.
 *
 * The ceiling can still bite, and what it evicts is stated rather than left to a `slice`: a week
 * restored from an older build may name a contract this build no longer ships, and those are the
 * entries that go — oldest parked first. `persist/validate.ts#unknownContractsIn` refuses such a
 * session outright, so in practice the list never fills.
 */
export const PARKED_WEEKS_MAX = CONTRACTS.length + 3;

/** The live week and the ones parked beside it, which are only ever produced together. */
export interface WeekSwitch {
  readonly week: WeekState;
  /** Weeks not currently being played, at most one per `contractId`, least recently parked first. */
  readonly parked: readonly WeekState[];
}

/**
 * The parked week for an assignment, or `undefined` when it has never been played.
 *
 * **Not exported**, and that is the standing requirement applied to a one-line reader rather than
 * to a subsystem: {@link switchWeek} is its only caller, and an exported version would have had
 * `week.test.ts` and nothing else outside this file. A helper whose every external reference is a
 * test is the shape this repository has shipped eleven times, and it is no less that shape for
 * being three lines long.
 */
function parkedWeekFor(
  parked: readonly WeekState[],
  contractId: string,
): WeekState | undefined {
  return parked.find((entry) => entry.contractId === contractId);
}

/**
 * What arriving somewhere means, which is **not** the same question as what leaving means.
 *
 * The week being left is parked either way — that is the whole of issue #107 and no caller opts out
 * of it. What the two callers genuinely disagree about is the destination, and the disagreement is
 * decided by what the player was told they were pressing:
 *
 * | caller | rule | what the player was told |
 * |---|---|---|
 * | the building select (`withBuilding`) | `resume` | nothing — it is a `<select>` labelled *building*, and a control that reads like a setting may not restart a week |
 * | a scenario card, *Take the next assignment* | `restart` | *"taking this assignment restarts the week on Garden Apartments"*, in the card's own `title` |
 * | **Free play's Start** (`withFreePlayWeek`) | `restart` | the menu describes a single run from a selection, and `docs/16` S6 resets every scope the mode does not permit — a free-play week that resumed anything would be running a day the screen did not name |
 *
 * The third arrival is issue #125's, and its destination is {@link FREE_PLAY_CONTRACT_ID} rather
 * than the building's contract — which is what makes it a *transition* at all rather than the
 * same-id no-op on the first line of {@link switchWeek}.
 *
 * So `restart` **discards** a parked week for the destination, and that is not this issue arriving
 * through a third door: it is the card's promise kept. A card that said *restarts* and resumed would
 * be the stale-refusal defect with the polarity flipped — copy describing a behaviour the code no
 * longer has. If that copy ever changes, this argument is what has to change with it.
 *
 * Required rather than defaulted: a default would let the next caller inherit a decision without
 * making it, and which of these two a surface is doing is exactly what its own copy has to match.
 */
export type WeekArrival = 'resume' | 'restart';

/**
 * Move to another assignment **without destroying the one being left** — GitHub issue #107.
 *
 * ## The defect, which was data loss through the most ordinary control on the tab
 *
 * `withBuilding` called {@link takeContract} on every change of contract, and `takeContract` is a
 * *fresh* week by construction. So a player on Garden Apartments day 4 with a four-day streak who
 * touched the building select — a plain `<select>` sitting above **Run this shift**, which reads
 * like a setting — was moved to Midtown Office day 1, and moving straight back gave them Garden
 * Apartments **day 1**. Four cleared days, the streak and 40 tenants of growth, gone with no
 * confirmation and no undo, and `saveSessionNow` then wrote the loss to `localStorage`. Reproduced
 * from the code in `state.test.ts` before this existed: `c1 day 4 → c2 day 1 → c1 day 1`.
 *
 * `takeContract` is not the bug and is unchanged. *Taking* an assignment **should** restart the week
 * — `design.html` :1643 and the scenarios card say so in words. What was missing is that changing
 * building is not always taking an assignment: the second visit to a scenario is a **resume**, and
 * there was nowhere for the first visit to have been kept.
 *
 * ## The four arms
 *
 * | the destination | what happens | why |
 * |---|---|---|
 * | already the live week's | nothing at all, by identity | the coach select fires `change` on a re-pick of the building already running, and a re-pick that shuffled the week would be the control moving on its own |
 * | a week that is parked, under `resume` | **resumed**, with `completed` merged | it is the week the player left, and it is theirs |
 * | a week that is parked, under `restart` | {@link takeContract}, and the parked copy goes | the card said *restarts the week on that building*; see {@link WeekArrival} |
 * | never played | {@link takeContract}, or {@link withContract} for the sandbox | unchanged from before this function existed |
 *
 * The sandbox arm keeps {@link withContract}'s documented behaviour rather than opening a fresh
 * week: *"Moving to a building no scenario runs is not a new week — the player is on day 4 with a
 * streak of two and they still are"*. That decision was made when there was one slot, and the
 * obvious reading now is that it should be reversed — park the scenario week and open the sandbox at
 * day 1. It is deliberately **not** reversed, because the loss it was written to prevent is real and
 * parking removes the *other* loss without touching it: the departing week is parked under its own
 * id on every arm, so the player gets their scenario back **and** keeps the day loop they carried
 * into their own building. The two weeks then run on independently, which cannot double-bank
 * anything — a sandbox week resolves to no contract, so `closeDay` clears nothing there, which
 * `state.test.ts` asserts rather than this paragraph.
 *
 * ## Why `completed` is merged rather than taken from either side
 *
 * `completed` is the one field of a week that is **not** about that week: it is every scenario the
 * player has ever cleared, which is why {@link takeContract} carries it across. A parked week's copy
 * is a snapshot from the moment it was parked, so resuming one verbatim would forget a scenario
 * cleared while it was away — and `closeDay`'s `!base.completed.includes(contract.id)` guard is what
 * stops a contract clearing twice, so forgetting one is not cosmetic: it lets the same assignment be
 * cleared, and awarded, a second time. The union is taken live-first, so the order a player cleared
 * things in survives.
 */
export function switchWeek(
  week: WeekState,
  parked: readonly WeekState[],
  contractId: string,
  arrival: WeekArrival,
): WeekSwitch {
  if (contractId === week.contractId) return { week, parked };

  const resumed = arrival === 'resume' ? parkedWeekFor(parked, contractId) : undefined;
  const next =
    resumed !== undefined
      ? { ...resumed, completed: mergedCompleted(week.completed, resumed.completed) }
      : contractId === SANDBOX_CONTRACT_ID && arrival === 'resume'
        ? withContract(week, SANDBOX_CONTRACT_ID)
        : takeContract(week, contractId);

  /*
   * The departing week goes to the end, and any previous entry under its id goes: there is one week
   * per assignment and the live one is always the newer. The destination's entry leaves the list
   * because it is no longer parked — it is the week on screen, and a copy left behind would be a
   * second answer to *what day is it on Garden Apartments*.
   */
  const kept = parked.filter(
    (entry) => entry.contractId !== contractId && entry.contractId !== week.contractId,
  );
  return { week: next, parked: Object.freeze([...kept, week].slice(-PARKED_WEEKS_MAX)) };
}

/** Every id in `live` then every id in `parked` that is not already there. Neither side loses one. */
function mergedCompleted(
  live: readonly string[],
  parked: readonly string[],
): readonly string[] {
  return [...live, ...parked.filter((id) => !live.includes(id))];
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
