/**
 * **The ordinary day's calls, as one attempt meets them** — [§ D1138](../../../../DECISIONS.md),
 * the state machine behind `shift/dayCalls.ts`'s pure rule.
 *
 * ## What it holds, and for how long
 *
 * One attempt at one scored day. It is opened on the run the stage opened on, asks the next
 * candidate call of the run standing, has the day run twice more from that instant (*park* and
 * *spread*, every earlier press kept), and raises the call only when the three runs' ten-minute
 * counts differ by the admission threshold. A refused candidate costs those two runs and nothing
 * else; the next is asked. A raised call waits for the player's answer, and the answer **is one of
 * the three runs already made**: *leave them* keeps the run on the stage, and a press hands the
 * shell the run that pressed, so answering costs no simulation at all (S3's *no extra runs*).
 *
 * What the report reads at day close is {@link DayCallSession.records}: for each raised call, the
 * three counts and the three runs folded over their whole run. Nothing about the answers not taken
 * leaves this module before then (§ D1138 clause 3) — the stage is told only *where* the next call
 * is and whether it has been raised, which is the same for a call that turns the day and one that
 * does not (clause 2).
 *
 * ## Why here and not in `dev/main.ts`
 *
 * The shell owns the runs and the state; this owns the sequence, so the sequence can be driven in
 * Node with a simulator the test controls (`dayCallSession.test.ts`) rather than through a document
 * and a worker. The shell is its one non-test caller: it opens a session, feeds it the recordings
 * it adopts, and adopts what an answer hands back.
 *
 * ## What it refuses
 *
 * - **No call before the first run is folded.** A candidate whose runs have not landed is
 *   `raised: false`, and the stage waits at its instant rather than guessing.
 * - **No call after *Skip to the end*.** A skip answers every call the day had left.
 * - **No row for a candidate that was refused.** Refused calls never reach the report.
 */

import type { RunInterventionConfig } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import { observationsAt } from '../live/observations.js';
import type { BookedOutCar } from '../shift/bookedOut.js';
import { actsOf } from '../shift/dayLength.js';
import {
  DAY_CALL_MAX,
  DAY_CALL_MAX_TRIES,
  DAY_CALL_SPACING_S,
  dayCallAdmits,
  dayCallChangeOf,
  dayCallRecordOf,
  dayCallSearchFrom,
  dayCallWindowEndOf,
  nextDayCallOf,
  type DayCallAnswer,
  type DayCallOnStage,
  type DayCallRecord,
} from '../shift/dayCalls.js';
import { shiftObservationsOf } from '../shift/observations.js';
import type { PressCall } from '../shift/pressCall.js';
import type { Observations, RunHorizon } from '../shift/types.js';

import type { OffThreadRun } from './offThreadRuns.js';

/** What the session needs from the shell. Plain functions, so a test can be the shell. */
export interface DayCallSessionDeps {
  /**
   * The run the shell would make with `extra` appended to the log it holds now —
   * `dev/state.ts#shiftRunConfigOf` over the state with one more press. `undefined` when the state
   * cannot be planned, which ends the session's asking.
   */
  readonly planWith: (extra: RunInterventionConfig) => OffThreadRun | undefined;
  /** Make the two runs, in order, off the painting thread. The latest ask supersedes. */
  readonly simulate: (
    runs: readonly [OffThreadRun, OffThreadRun],
    done: (recordings: readonly VizRecording[]) => void,
    failed: (message: string) => void,
  ) => void;
  /** Drop whatever ask is in flight. */
  readonly cancel: () => void;
  /** Something the stage reads has moved. */
  readonly changed: () => void;
}

/** What the session is opened on. */
export interface DayCallSessionOpening {
  /** The run the stage opened on — the attempt's own run, nothing pressed. */
  readonly recording: VizRecording;
  /** `shift/bookedOut.ts#bookedOutCarsOf` over the run's building, for the card's car line. */
  readonly bookedOut: readonly BookedOutCar[];
  readonly horizon: RunHorizon;
}

/** A pressing answer's run, and the log entry it was made with. */
interface PressedRun {
  readonly recording: VizRecording;
  readonly entry: RunInterventionConfig;
}

interface Pending {
  readonly call: PressCall;
  raised: boolean;
  runs?: Readonly<Record<'park-cars-lobby' | 'spread-cars', PressedRun>>;
  /** The call's record as its three runs counted it; the answer is written when one is given. */
  counted?: DayCallRecord;
}

/** What an answer hands the shell to adopt, or `undefined` for *leave them*. */
export interface DayCallAdoption {
  readonly recording: VizRecording;
  readonly entry: RunInterventionConfig;
}

export interface DayCallSession {
  /** The run the session is standing on. */
  readonly recording: () => VizRecording;
  /** The next call for the stage, or `undefined` when the day has none left. */
  readonly onStage: () => DayCallOnStage | undefined;
  /**
   * Answer the raised call. For a press, `adopt` is handed the run that pressed and the log entry
   * it was made with, **before** the next call is asked, so the shell's log and run are the ones
   * the next candidate's runs are planned from. *Leave them* adopts nothing. Returns whether a call
   * stood to be answered.
   */
  readonly answer: (answer: DayCallAnswer, adopt: (adoption: DayCallAdoption) => void) => boolean;
  /**
   * *Skip to the end* — every call the day had left is answered. `called` is whether the card was
   * up, in which case that call is recorded as skipped with its three runs.
   */
  readonly skip: (called: boolean) => void;
  /**
   * The shell adopted a run this session did not hand it — a press outside a call, a handover.
   * Earlier calls stand (each was measured with nothing after it); the pending one is dropped and
   * the next is asked of the new run from {@link DAY_CALL_SPACING_S} after the press.
   */
  readonly grew: (recording: VizRecording, pressedAtS: number) => void;
  /** The raised and answered calls, in order — what the report reads at day close. */
  readonly records: () => readonly DayCallRecord[];
  /** Stop asking and drop whatever is in flight. */
  readonly close: () => void;
}

/** A run folded over its own whole run, as `dev/main.ts#closeShift` folds the filed run. */
function wholeRunOf(recording: VizRecording): Observations {
  return shiftObservationsOf(observationsAt(recording, recording.endedAt));
}

/** Open a session on the attempt's own run, and ask its first candidate. */
export function openDayCallSession(
  deps: DayCallSessionDeps,
  opening: DayCallSessionOpening,
): DayCallSession {
  let standing = opening.recording;
  let searchFromS = standing.startedAt;
  let asked = 0;
  let done = false;
  let pending: Pending | undefined;
  const records: DayCallRecord[] = [];

  function inputOf(recording: VizRecording) {
    return {
      legs: recording.legs,
      bookedOut: opening.bookedOut,
      horizon: opening.horizon,
      acts: actsOf(recording.demandPhases),
      startedAt: recording.startedAt,
      endedAt: recording.endedAt,
    };
  }

  function stop(): void {
    done = true;
    pending = undefined;
    deps.cancel();
  }

  function askNext(): void {
    pending = undefined;
    if (done) return;
    if (records.length >= DAY_CALL_MAX || asked >= DAY_CALL_MAX_TRIES) {
      stop();
      return;
    }
    const call = nextDayCallOf(inputOf(standing), searchFromS);
    if (call === undefined) {
      stop();
      return;
    }
    asked += 1;
    const park: RunInterventionConfig = { atS: call.atS, change: dayCallChangeOf('park-cars-lobby')! };
    const spread: RunInterventionConfig = { atS: call.atS, change: dayCallChangeOf('spread-cars')! };
    const parkRun = deps.planWith(park);
    const spreadRun = deps.planWith(spread);
    if (parkRun === undefined || spreadRun === undefined) {
      stop();
      return;
    }
    const asking: Pending = { call, raised: false };
    pending = asking;
    const leave = standing;
    deps.simulate(
      [parkRun, spreadRun],
      (recordings) => {
        /* A later ask, a press or a skip has replaced this one: its runs describe nothing now. */
        if (pending !== asking || standing !== leave) return;
        const [parked, spreadOut] = recordings;
        if (parked === undefined || spreadOut === undefined) {
          stop();
          deps.changed();
          return;
        }
        const counted = dayCallRecordOf({
          atS: call.atS,
          windowEndS: dayCallWindowEndOf(call.atS, leave.endedAt),
          answer: 'leave',
          legs: { 'park-cars-lobby': parked.legs, 'spread-cars': spreadOut.legs, leave: leave.legs },
          observations: {
            'park-cars-lobby': wholeRunOf(parked),
            'spread-cars': wholeRunOf(spreadOut),
            leave: wholeRunOf(leave),
          },
        });
        if (!dayCallAdmits(counted.counts)) {
          searchFromS = dayCallSearchFrom(call, false);
          askNext();
          deps.changed();
          return;
        }
        asking.raised = true;
        asking.counted = counted;
        asking.runs = {
          'park-cars-lobby': { recording: parked, entry: park },
          'spread-cars': { recording: spreadOut, entry: spread },
        };
        deps.changed();
      },
      () => {
        /* A run that failed is a call nobody can stand behind, so the day asks no more. */
        if (pending !== asking) return;
        stop();
        deps.changed();
      },
    );
  }

  function recordOf(raised: Pending, answer: DayCallRecord['answer']): DayCallRecord | undefined {
    return raised.counted === undefined ? undefined : Object.freeze({ ...raised.counted, answer });
  }

  askNext();

  return {
    recording: () => standing,
    onStage: () => (pending === undefined ? undefined : { call: pending.call, raised: pending.raised }),
    answer: (answer, adopt) => {
      const raised = pending;
      if (raised === undefined || !raised.raised) return false;
      pending = undefined;
      const record = recordOf(raised, answer);
      if (record !== undefined) records.push(record);
      searchFromS = dayCallSearchFrom(raised.call, true);
      const pressed = answer === 'leave' ? undefined : raised.runs?.[answer];
      if (pressed !== undefined) {
        standing = pressed.recording;
        adopt({ recording: pressed.recording, entry: pressed.entry });
      }
      askNext();
      return true;
    },
    skip: (called) => {
      const raised = pending;
      if (called && raised !== undefined && raised.raised) {
        const record = recordOf(raised, 'skipped');
        if (record !== undefined) records.push(record);
      }
      stop();
    },
    grew: (recording, pressedAtS) => {
      if (recording === standing) return;
      standing = recording;
      deps.cancel();
      /*
       * The spacing after the player's own press, as after a call: somebody has usually waited a
       * minute at the instant a player presses, and a call raised on the frame after a press would
       * be the stage answering the player rather than asking them.
       */
      searchFromS = Math.max(searchFromS, pressedAtS + DAY_CALL_SPACING_S);
      askNext();
    },
    records: () => records,
    close: stop,
  };
}
