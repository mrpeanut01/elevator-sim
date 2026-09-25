/**
 * **§ 6.1's replay — a past day handed back to be played as the day it was.** GitHub issue #177
 * item 1, § D517.
 *
 * The guide's rule is in one sentence: *"Every past day stays playable. A missed day fills the gap
 * in your week without scoring; a replay leaves your original result on the board … Never silently
 * rescore history."* The door's week strip has drawn the past seven days since it landed and
 * refused every one of them with *"a week moves forward one day at a time and this build has no way
 * to stand it back up"*. This module is the way.
 *
 * ## The mechanism is the rush's, and that is the argument for it
 *
 * `everyday/rush.ts` runs a rush by **parking the player's week** and opening a sentinel one in its
 * place, so the run goes through `shiftRunConfigOf` and `closeShift` untouched and comes back
 * through the ordinary stage and report. A replay is the same move with a different week: one that
 * stands on the day being replayed, at that day's growth and on that day's weekday, with the days
 * before it as its history and `REPLAY_CONTRACT_ID` as its contract. The seed is the player's own
 * — a day's crowd is the seed drawn against the building *as grown to that day*, which is exactly
 * what `buildNotes.ts` used to say made a later replay impossible — so the replay meets the crowd
 * the day met.
 *
 * What makes it not count is the sentinel: `closeDay` banks nothing and clears nothing on a week
 * whose id resolves to no contract (the sandbox precedent `state.test.ts` asserts), the replay
 * week's streak and best day are its own and go when the player leaves, and nothing here posts.
 * The original result stays on the board and in the parked week's history, untouched — that is
 * the *never silently rescore* clause met by construction rather than by a guard.
 *
 * ## What may be replayed
 *
 * Any day the strip can name: `1 ≤ day < week.day`. A closed day and a missed day are the same
 * case here — § 6.1 says the missed one *fills the gap without scoring*, and a replay week's
 * outcome reaches the parked week's history never, so there is no gap-filling to do and the
 * sentence would be a promise about a record this build does not write. The door says *does not
 * count* and means it for both.
 */

import type { DayOutcome, WeekState } from '../shift/types.js';
import { openReplay, REPLAY_CONTRACT_ID, switchWeek } from '../shift/week.js';
import type { ViewerState } from '../dev/state.js';
import type { WatchRecord } from '../watch/types.js';

/** What the replay leaves behind to be put back — {@link replayPatchOf}'s inverse. */
export interface ReplayBefore {
  readonly contractId: string;
  readonly playMode: ViewerState['playMode'];
  readonly recording: ViewerState['recording'];
  /**
   * The presses the parked recording was simulated under — [§ D1002](../../../../DECISIONS.md).
   * Put back with {@link recording}, because a log is a fact about one run and the run that comes
   * back is this one; leaving the replay's presses standing beside it would caption the player's
   * own day with presses made on another.
   */
  readonly interventions: ViewerState['interventions'];
  /**
   * The crowd and the shape of the day that stood before the replay — wave AJ, § D1094. Put back
   * on the way out, because {@link replayPatchOf} now writes the replayed day's own over them.
   */
  readonly day: ReplayedDay;
}

/** The fields that say which crowd a day met and over what stretch of the day — a record's half. */
type ReplayedDay = Pick<ViewerState, 'seed' | 'pattern' | 'freePlay' | 'shiftLengthS' | 'windowStartS'>;

function replayedDayOf(state: ViewerState): ReplayedDay {
  return {
    seed: state.seed,
    pattern: state.pattern,
    freePlay: state.freePlay,
    shiftLengthS: state.shiftLengthS,
    windowStartS: state.windowStartS,
  };
}

export function replayBeforeOf(state: ViewerState): ReplayBefore {
  return {
    contractId: state.week.contractId,
    playMode: state.playMode,
    recording: state.recording,
    interventions: state.interventions,
    day: replayedDayOf(state),
  };
}

/**
 * The record `day` was filed with, or `undefined` — the one read both {@link replayedDayOfRecord}
 * and the door's promise ask, so the door cannot promise a crowd the replay would not run.
 */
export function recordOfDay(week: WeekState, day: number): WatchRecord | undefined {
  return week.history.find((entry) => entry.day === day)?.record ?? undefined;
}

/**
 * **The crowd `day` met, read off its own record** — wave AJ, [§ D1094](../../../../DECISIONS.md),
 * or `undefined` when the week holds no record for it.
 *
 * The door says *"Day 1 again, on the crowd it had"*, and the replay ran the crowd standing now:
 * after a pinned Monday (crowd `20276662`, the pin's) the session's seed goes back to the date's for
 * Tuesday, and pressing the Monday chip ran `20260925` — a different day under that day's name, with
 * no call, ending at 304 s where the banked Monday read 181 s (the post-AI panel's seat D, D2). The
 * week already carries the answer: `DayOutcome.record` is the question the day was, written by
 * `dev/main.ts#closeShift` for exactly this — *store the question, because the answer is a pure
 * function of it*. So the replay reads the seed, the demand selection and the window off it rather
 * than off the state.
 *
 * Only the crowd and the stretch of the day. The building is the week's own at that day's growth,
 * which the replay week already stands on, and the driver is the player's to choose on the brief —
 * a replay is a second go at the day, and the door promises its crowd rather than its choices.
 */
export function replayedDayOfRecord(week: WeekState, day: number): ReplayedDay | undefined {
  const record = recordOfDay(week, day);
  if (record === undefined) return undefined;
  return {
    seed: BigInt(record.seed),
    pattern: record.pattern,
    freePlay:
      record.demandTemplateId === null
        ? undefined
        : { demandTemplateId: record.demandTemplateId, arrivalRatePctPop5min: record.arrivalRatePctPop5min },
    shiftLengthS: record.shiftLengthS,
    windowStartS: record.windowStartS,
  };
}

/** Whether `day` is one the standing week can hand back: a day before today, inside this week. */
export function replayableDay(week: WeekState, day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day < week.day;
}

/** The weekday `day` fell on, counted back from the week's standing day. */
export function replayDayIdxOf(week: WeekState, day: number): number {
  return (((week.dayIdx - (week.day - day)) % 7) + 7) % 7;
}

/**
 * The state a replay runs in: the player's week parked, a replay week standing on `day`.
 *
 * `playMode` is set to the week loop's so the sheet is the day-shaped one whatever the player was
 * last doing; the parked week keeps its own. **The crowd and the stretch of the day are the day's
 * own record's** ({@link replayedDayOfRecord}, § D1094); this paragraph used to say the seed and
 * the length were *left exactly where they are, because they are what the day was*, which stopped
 * being true the first time a week's seed moved between days. A day filed without a record keeps
 * the standing crowd, and the door says so rather than promising the one it had
 * ({@link REPLAY_COPY.doorNoteNoRecord}). Building, dispatcher and levers are left where they are.
 */
export function replayPatchOf(state: ViewerState, day: number): Partial<ViewerState> {
  const moved = switchWeek(state.week, state.parkedWeeks, REPLAY_CONTRACT_ID, 'restart');
  const history: readonly DayOutcome[] = state.week.history;
  return {
    ...(replayedDayOfRecord(state.week, day) ?? {}),
    playMode: 'shift-week',
    week: openReplay(day, replayDayIdxOf(state.week, day), history),
    parkedWeeks: moved.parked,
    /* A replay is a clean experiment on the day's crowd — § D1002: it starts with no presses. */
    interventions: [],
  };
}

/** The player's week back, exactly as parked — see {@link ReplayBefore}. */
export function replayRestorePatchOf(state: ViewerState, before: ReplayBefore): Partial<ViewerState> {
  const moved = switchWeek(state.week, state.parkedWeeks, before.contractId, 'resume');
  return {
    week: moved.week,
    parkedWeeks: moved.parked,
    playMode: before.playMode,
    recording: before.recording,
    interventions: before.interventions,
    ...before.day,
  };
}

/** The words the door and the bar say about a replay. Every sentence a player reads about one. */
export const REPLAY_COPY = Object.freeze({
  /** Under *Set up the replay*, on a day the strip can hand back. */
  doorNote: (day: number): string =>
    `Day ${String(day)} again, on the crowd it had. A replay never counts: the board keeps what you posted, and your week stays where it is.`,
  /**
   * Under the same button, on a day filed without the record of what it ran — § D1094. The replay
   * then meets the crowd standing now, and the door says so rather than {@link doorNote}'s promise.
   */
  doorNoteNoRecord: (day: number): string =>
    `Day ${String(day)} again, on the crowd standing now: this day was filed without a record of the one it had. ` +
    'A replay never counts: the board keeps what you posted, and your week stays where it is.',
  /** Under the same button, on a chip from before this week began. */
  beforeTheWeek: 'That day is from before this week began, so there is no day here to hand back.',
  /** The rail's subline on the stage and the report. */
  subline: 'REPLAYING',
  /** The § 3.4 strip, which has nothing of the player's to lose. */
  leaveQuestion: 'Leave the replay?',
  leaveConsequence: 'A replay is never scored, so nothing is lost. Your week is where you left it.',
});
