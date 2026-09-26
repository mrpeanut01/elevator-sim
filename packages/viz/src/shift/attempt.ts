/**
 * **One attempt per scored day** — wave AL, lane AL-E, [§ D1218](../../../../DECISIONS.md), the
 * decide-an swarm's ruling § Q2 clause 1 and the post-AK panel's seat D (H6).
 *
 * ## The hole
 *
 * [§ D1138](../../../../DECISIONS.md) clause 4 banks the **first closed** attempt at a day, and a
 * retake after the close is practice. Nothing recorded that a day had been **started**, so a day
 * could be played to its end, left unclosed, taken again from the brief with the answer known,
 * and banked. Seat D did exactly that: *Nearest car*, *Start the day*, *Skip to the end*, *‹ Brief*,
 * another driver, *Start the day*, the calls answered from what the first run showed, *Close the
 * day*, and the report read *Tuesday is banked*.
 *
 * ## The rule
 *
 * **The attempt starts at *Start the day*, and it is the only run of that day the week can bank.**
 * Leaving the stage, to the brief, the door, a menu or by a reload, keeps it: the brief's primary
 * becomes *Resume ⟨day⟩*, the driver is held, and the stage comes back at the furthest instant the
 * attempt had shown ({@link DayAttempt.shownToS}), with its presses and its calls as they stood. The
 * day is filed when that attempt is closed, by *Close the day*, *End the day* or the day's end, and
 * a close of any other run of that day while the attempt stands is practice
 * (`shift/scoredCrowd.ts#practiceGroundOf`'s `'attempt'` ground). § D1138 clause 4 is unchanged in
 * its rule and moves only its trigger: the first **started** attempt is the one that banks.
 *
 * ## What an attempt is
 *
 * The run is deterministic, so an attempt is the question that produced it and not the recording:
 * the week's day, the crowd, the driver and the press log, plus how far it has been watched and the
 * state of its calls. Everything here is a plain value that survives `JSON`, because a reload must
 * find it (`persist/attempt.ts` writes it to this device) and a resumed attempt re-simulates it.
 *
 * Pure and DOM-free: `dev/main.ts` holds the attempt standing and `everyday/host.ts` reads it for
 * the brief, the stage and the leave strip.
 */

import type { DispatcherProfile, RunInterventionConfig } from '@elevator-sim/core/browser';

import type { WatchRecord } from '../watch/types.js';

import type { DayCallRecord } from './dayCalls.js';
import type { WeekState } from './types.js';

/**
 * Where an ordinary day's call session stood, so a resumed attempt asks on from there rather than
 * from the day's start — `dev/dayCallSession.ts#DayCallSession.snapshot`. The call in hand (being
 * asked, or raised and waiting for an answer) is deliberately not here, in any field: its instant is
 * at or after the last answer's spacing, so a resumed session finds it again from {@link
 * searchFromS} on the same run and counts it then.
 *
 * **It carries every piece of state [§ D1205](../../../../DECISIONS.md)'s rules read** (wave AL's
 * integration, over lanes AL-C and AL-E), so a resumed session raises exactly the calls an unbroken
 * one would: the peaks already holding their two, when each question was last raised for the
 * ten-minute rule, the peak in which *keep who drives* was answered, and who drives now, from whom
 * the driver pair is re-derived. A pinned day's call (§ D1204) is already folded into the first two.
 */
export interface DayCallResume {
  readonly records: readonly DayCallRecord[];
  readonly searchFromS: number;
  readonly asked: number;
  readonly refused: number;
  readonly done: boolean;
  readonly ending: 'finished' | 'failed' | 'skipped' | 'lost' | null;
  readonly lost: { readonly atS: number; readonly goal: string } | null;
  /** § D1205: the start of the peak each raised call fell in, one entry a call, the pinned call's included. */
  readonly raisedInPeak: readonly number[];
  /** § D1205: when each question was last raised, or `null` where it has not been. */
  readonly lastRaisedAtS: { readonly placement: number | null; readonly driver: number | null };
  /** § D1205: the start of the peak in which *keep who drives* was answered, or `null`. */
  readonly keptInPeakS: number | null;
  /**
   * § D1205: the dispatcher driving now, from whom the driver pair is re-derived; `null` where the
   * day has no pair or the question has stopped after a handover that named nobody.
   */
  readonly driving: DispatcherProfile | null;
}

/** The attempt standing on one scored week day. */
export interface DayAttempt {
  readonly contractId: string;
  readonly day: number;
  readonly dayIdx: number;
  /** The run's crowd, in decimal. */
  readonly seed: string;
  /** The day's shared crowd latched when the attempt began, in decimal — the date it was pressed on. */
  readonly daySeed: string;
  readonly dispatcherId: string;
  /** The press log the attempt's latest run was simulated under. */
  readonly interventions: readonly RunInterventionConfig[];
  /**
   * The run the attempt began as, described the way *Watch it* re-asks a day
   * (`watch/record.ts#watchRecordOf`), or `null` where that function refused. A resume is checked
   * against it, so a week that has moved under the attempt cannot resume a different run.
   */
  readonly record: WatchRecord | null;
  /** The furthest instant the stage has shown of this attempt, in simulated seconds. */
  readonly shownToS: number;
  /** A pinned day's § D1029 call has been answered or skipped on this attempt. */
  readonly pinnedCallDone: boolean;
  /** The pinned call was skipped rather than answered — the report says which. */
  readonly pressCallSkipped: boolean;
  /** The ordinary day's calls as they stood, or `null` where the session was never opened. */
  readonly calls: DayCallResume | null;
}

/**
 * **Whether `attempt` is the attempt standing on `week`'s day**: the same scenario, the same day
 * and weekday, and a day the week has not closed. A day the week has closed has been filed from
 * its first attempt, so nothing stands on it and a later run of it is § D1138 clause 4's retake.
 */
export function attemptStandsOn(
  attempt: DayAttempt | undefined,
  week: Pick<WeekState, 'contractId' | 'day' | 'dayIdx' | 'closedDay' | 'history'>,
): attempt is DayAttempt {
  if (attempt === undefined) return false;
  if (attempt.contractId !== week.contractId || attempt.day !== week.day || attempt.dayIdx !== week.dayIdx) {
    return false;
  }
  if (week.closedDay === attempt.day) return false;
  return !week.history.some((entry) => entry.day === attempt.day);
}

/** `attempt` with {@link DayAttempt.shownToS} moved on to `atS` where that is further; never back. */
export function attemptShownTo(attempt: DayAttempt, atS: number): DayAttempt {
  return Number.isFinite(atS) && atS > attempt.shownToS ? { ...attempt, shownToS: atS } : attempt;
}

/**
 * Where a resumed attempt's stage opens: the furthest instant it had shown, when that is past the
 * run's start and inside it; `undefined` where it never left the start, so the stage opens as a
 * fresh day does, paused at its start with § 7.3's *Start* up.
 */
export function attemptResumeAtS(attempt: DayAttempt, startedAt: number, endedAt: number): number | undefined {
  if (!(attempt.shownToS > startedAt)) return undefined;
  return Math.min(attempt.shownToS, endedAt);
}

/** The brief's primary while an attempt stands — § 3.3's brief row, this build's second variant. */
export function resumeLabelOf(weekday: string): string {
  return `Resume ${weekday}`;
}

/** The brief's primary cell as the action-bar table writes it, placeholder and all. */
export const RESUME_PRIMARY_CELL = 'Resume ⟨day⟩';

/**
 * The brief's words while an attempt stands. No figure: what the attempt did so far is on the
 * stage, and a count here would be a second reading of it.
 */
export const DAY_ATTEMPT_COPY = Object.freeze({
  /** Under the driver cards, which are held. */
  driverHeld:
    'Your attempt at this day is under way, so it keeps the driver it started with. To hand the day ' +
    'to another dispatcher, do it on the stage.',
  /** The bar's note beside *Resume*. */
  resumeNote: 'Your attempt is kept where you left it. It is the one your week banks.',
  /** § 3.4's strip, asked when a day with an attempt standing is left by its leave button. */
  leaveQuestion: 'Leave the day for now?',
  leaveConsequence:
    'Your attempt is kept where you left it. The brief resumes it, and it is the one your week banks.',
});
