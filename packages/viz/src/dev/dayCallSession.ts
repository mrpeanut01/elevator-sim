/**
 * **The ordinary day's calls, as one attempt meets them** — [§ D1138](../../../../DECISIONS.md),
 * the state machine behind `shift/dayCalls.ts`'s pure rule, with wave AK's three amendments:
 * [§ D1166](../../../../DECISIONS.md) (calls five minutes apart inside a peak, up to six),
 * [§ D1167](../../../../DECISIONS.md) (the driver question) and [§ D1168](../../../../DECISIONS.md)
 * (no call once the day is already lost).
 *
 * ## What it holds, and for how long
 *
 * One attempt at one scored day. It is opened on the run the stage opened on, asks the next
 * candidate call of the run standing, has the day run twice more from that instant (*park* and
 * *spread*, every earlier press kept), and raises the **placement** question when the three runs'
 * ten-minute counts differ by the admission threshold. Where they do not, and the day has a driver
 * pair and has not been handed over yet, it has the day run twice more (*hand it to* each of the
 * pair) and raises the **driver** question when those three counts differ by the same threshold. A
 * refused candidate costs its runs and nothing else; the next is asked. A raised call waits for the
 * player's answer, and the answer **is one of the three runs already made**: *leave them* (or *keep
 * who drives*) keeps the run on the stage, and a press hands the shell the run that pressed, so
 * answering costs no simulation at all (S3's *no extra runs*).
 *
 * Before a candidate is asked, the run standing is read at its instant with the day's own goals,
 * exactly as the rail reads it: where the queue or the worst-wait goal already reads missed the
 * session asks nothing more, and says so in {@link DayCallSession.quiet} (§ D1168).
 *
 * What the report reads at day close is {@link DayCallSession.records}: for each raised call, the
 * three counts and the three runs folded over their whole run. Nothing about the answers not taken
 * leaves this module before then (§ D1138 clause 3) — the stage is told only *where* the next call
 * is, whether it has been raised and, once raised, which question it asks, which is the same for a
 * call that turns the day and one that does not (clause 2).
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
 * - **No call before its runs are folded.** A candidate whose runs have not landed is
 *   `raised: false`, and the stage waits at its instant rather than guessing.
 * - **No call after *Skip to the end* with a card up.** That skip answers every call the day had left.
 * - **No row for a candidate that was refused.** Refused calls never reach the report.
 * - **No driver question once the day has been handed over**, by a call or by the player's own
 *   handover: *keep who drives* would then name a dispatcher the pair was not chosen against.
 */

import type { DispatcherProfile, RunInterventionConfig } from '@elevator-sim/core/browser';

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
  dayCallLostGoalOf,
  dayCallRecordOf,
  dayCallSearchFrom,
  dayCallWindowEndOf,
  nextDayCallOf,
  type DayCallAnswer,
  type DayCallDriverNames,
  type DayCallOnStage,
  type DayCallQuestion,
  type DayCallRecord,
  type DayCallsQuiet,
} from '../shift/dayCalls.js';
import { goalPlainNameOf, readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import type { PressCall } from '../shift/pressCall.js';
import type { Observations, RunHorizon, ShiftGoal } from '../shift/types.js';

import type { OffThreadRun } from './offThreadRuns.js';

/** What the session needs from the shell. Plain functions, so a test can be the shell. */
export interface DayCallSessionDeps {
  /**
   * The run the shell would make with `extra` appended to the log it holds now —
   * `dev/state.ts#shiftRunConfigOf` over the state with one more press. `undefined` when the state
   * cannot be planned, which ends the session's asking.
   */
  readonly planWith: (extra: RunInterventionConfig) => OffThreadRun | undefined;
  /** Make the runs, in order, off the painting thread. The latest ask supersedes. */
  readonly simulate: (
    runs: readonly [OffThreadRun, ...OffThreadRun[]],
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
  /**
   * The day's own goals — `shift/goals.ts#goalsForDay(day, horizon)`, the ones the rail reads — for
   * § D1168's check. Absent, no candidate is refused on that ground.
   */
  readonly goals?: readonly ShiftGoal[] | undefined;
  /**
   * The tower's driver pair for this day — `shift/dayCalls.ts#dayCallDriversOf` over the
   * dispatcher the day opened with — and that dispatcher's name. Absent, the driver question is
   * never asked (§ D1167).
   */
  readonly drivers?:
    | { readonly pair: readonly [DispatcherProfile, DispatcherProfile]; readonly drivingName: string }
    | undefined;
}

/** A pressing answer's run, and the log entry it was made with. */
interface PressedRun {
  readonly recording: VizRecording;
  readonly entry: RunInterventionConfig;
}

interface Pending {
  readonly call: PressCall;
  raised: boolean;
  question?: DayCallQuestion;
  runs?: Partial<Record<DayCallAnswer, PressedRun>>;
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
   * stood to be answered with that answer — an answer from the other question is refused.
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
   * the next is asked of the new run from {@link DAY_CALL_SPACING_S} after the press. `handedOver`
   * is whether the log now carries a handover, which ends the driver question for the day.
   */
  readonly grew: (recording: VizRecording, pressedAtS: number, handedOver?: boolean) => void;
  /** The raised and answered calls, in order — what the report reads at day close. */
  readonly records: () => readonly DayCallRecord[];
  /**
   * What the session did on a day that raised nothing — [§ D1152](../../../../DECISIONS.md). How
   * many candidates it asked and turned down, and whether it finished asking, so the report can
   * say in one sentence why the day had no call and say nothing it did not see.
   */
  readonly quiet: () => DayCallsQuiet;
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
  /* § D1167: the driver question stops for the day once anything has handed the day over. */
  let handedOver = false;
  /* § D1152's account of a quiet day: candidates turned down, and how asking ended. */
  let refused = 0;
  let ending: 'finished' | 'failed' | 'skipped' | 'lost' | undefined;
  /* § D1168: the instant and the goal that stopped the asking, when that is how it stopped. */
  let lost: { readonly atS: number; readonly goal: string } | undefined;
  let pending: Pending | undefined;
  const records: DayCallRecord[] = [];
  const pair = opening.drivers?.pair;
  const driverNames: DayCallDriverNames | undefined =
    opening.drivers === undefined
      ? undefined
      : Object.freeze({
          'driver-a': opening.drivers.pair[0].name,
          'driver-b': opening.drivers.pair[1].name,
          leave: opening.drivers.drivingName,
        });

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

  /** The goal whose miss is final that reads missed on `recording` at `atS`, as the rail reads it. */
  function lostGoalAt(recording: VizRecording, atS: number): string | undefined {
    if (opening.goals === undefined) return undefined;
    const reading = dayCallLostGoalOf(readGoals(opening.goals, shiftObservationsOf(observationsAt(recording, atS))));
    return reading === undefined ? undefined : goalPlainNameOf(reading.goal);
  }

  function refuse(call: PressCall): void {
    refused += 1;
    searchFromS = dayCallSearchFrom(call);
    askNext();
    deps.changed();
  }

  function fail(): void {
    ending = 'failed';
    stop();
    deps.changed();
  }

  function askNext(): void {
    pending = undefined;
    if (done) return;
    if (records.length >= DAY_CALL_MAX || asked >= DAY_CALL_MAX_TRIES) {
      ending ??= 'finished';
      stop();
      return;
    }
    const call = nextDayCallOf(inputOf(standing), searchFromS);
    if (call === undefined) {
      ending ??= 'finished';
      stop();
      return;
    }
    /* § D1168: the day already reads lost at this instant, so nothing asked from here can clear it. */
    const lostGoal = lostGoalAt(standing, call.atS);
    if (lostGoal !== undefined) {
      lost = { atS: call.atS, goal: lostGoal };
      ending = 'lost';
      stop();
      return;
    }
    asked += 1;
    const park: RunInterventionConfig = { atS: call.atS, change: dayCallChangeOf('park-cars-lobby')! };
    const spread: RunInterventionConfig = { atS: call.atS, change: dayCallChangeOf('spread-cars')! };
    const parkRun = deps.planWith(park);
    const spreadRun = deps.planWith(spread);
    if (parkRun === undefined || spreadRun === undefined) {
      ending = 'failed';
      stop();
      return;
    }
    const asking: Pending = { call, raised: false };
    pending = asking;
    const leave = standing;
    const windowEndS = dayCallWindowEndOf(call.atS, leave.endedAt);
    /* A later ask, a press or a skip has replaced this one: its runs describe nothing now. */
    const stale = (): boolean => pending !== asking || standing !== leave;
    deps.simulate(
      [parkRun, spreadRun],
      (recordings) => {
        if (stale()) return;
        const [parked, spreadOut] = recordings;
        if (parked === undefined || spreadOut === undefined) {
          fail();
          return;
        }
        const counted = dayCallRecordOf({
          atS: call.atS,
          windowEndS,
          answer: 'leave',
          legs: { 'park-cars-lobby': parked.legs, 'spread-cars': spreadOut.legs, leave: leave.legs },
          observations: {
            'park-cars-lobby': wholeRunOf(parked),
            'spread-cars': wholeRunOf(spreadOut),
            leave: wholeRunOf(leave),
          },
        });
        if (dayCallAdmits(counted.counts)) {
          raise(asking, 'placement', counted, {
            'park-cars-lobby': { recording: parked, entry: park },
            'spread-cars': { recording: spreadOut, entry: spread },
          });
          return;
        }
        askDriver(asking, leave, windowEndS, stale);
      },
      () => {
        /* A run that failed is a call nobody can stand behind, so the day asks no more. */
        if (pending !== asking) return;
        fail();
      },
    );
  }

  /**
   * § D1167 — the placement question was refused at this candidate; ask the driver question from the
   * same instant, when the day has a pair and has not been handed over.
   */
  function askDriver(asking: Pending, leave: VizRecording, windowEndS: number, stale: () => boolean): void {
    const call = asking.call;
    if (pair === undefined || driverNames === undefined || handedOver) {
      refuse(call);
      return;
    }
    const toA: RunInterventionConfig = { atS: call.atS, change: dayCallChangeOf('driver-a', pair)! };
    const toB: RunInterventionConfig = { atS: call.atS, change: dayCallChangeOf('driver-b', pair)! };
    const runA = deps.planWith(toA);
    const runB = deps.planWith(toB);
    if (runA === undefined || runB === undefined) {
      fail();
      return;
    }
    deps.simulate(
      [runA, runB],
      (recordings) => {
        if (stale()) return;
        const [handedA, handedB] = recordings;
        if (handedA === undefined || handedB === undefined) {
          fail();
          return;
        }
        const counted = dayCallRecordOf({
          atS: call.atS,
          windowEndS,
          answer: 'leave',
          question: 'driver',
          drivers: driverNames,
          legs: { 'driver-a': handedA.legs, 'driver-b': handedB.legs, leave: leave.legs },
          observations: {
            'driver-a': wholeRunOf(handedA),
            'driver-b': wholeRunOf(handedB),
            leave: wholeRunOf(leave),
          },
        });
        if (!dayCallAdmits(counted.counts)) {
          refuse(call);
          return;
        }
        raise(asking, 'driver', counted, {
          'driver-a': { recording: handedA, entry: toA },
          'driver-b': { recording: handedB, entry: toB },
        });
      },
      () => {
        if (pending !== asking) return;
        fail();
      },
    );
  }

  function raise(
    asking: Pending,
    question: DayCallQuestion,
    counted: DayCallRecord,
    runs: Partial<Record<DayCallAnswer, PressedRun>>,
  ): void {
    asking.raised = true;
    asking.question = question;
    asking.counted = counted;
    asking.runs = runs;
    deps.changed();
  }

  function recordOf(raised: Pending, answer: DayCallRecord['answer']): DayCallRecord | undefined {
    return raised.counted === undefined ? undefined : Object.freeze({ ...raised.counted, answer });
  }

  askNext();

  return {
    recording: () => standing,
    onStage: () => {
      if (pending === undefined) return undefined;
      if (!pending.raised) return { call: pending.call, raised: false };
      return pending.question === 'driver'
        ? { call: pending.call, raised: true, question: 'driver', drivers: driverNames }
        : { call: pending.call, raised: true, question: 'placement' };
    },
    answer: (answer, adopt) => {
      const raised = pending;
      if (raised === undefined || !raised.raised) return false;
      /* An answer must be one of the question asked; `leave` belongs to both. */
      if (answer !== 'leave' && raised.runs?.[answer] === undefined) return false;
      pending = undefined;
      const record = recordOf(raised, answer);
      if (record !== undefined) records.push(record);
      searchFromS = dayCallSearchFrom(raised.call);
      const pressed = answer === 'leave' ? undefined : raised.runs?.[answer];
      if (pressed !== undefined) {
        standing = pressed.recording;
        if (raised.question === 'driver') handedOver = true;
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
      ending ??= 'skipped';
      stop();
    },
    grew: (recording, pressedAtS, handed) => {
      if (handed === true) handedOver = true;
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
    quiet: () => {
      if (!done) return Object.freeze({ kind: 'asked' as const, refused, ending: 'asking' as const });
      if (ending === 'lost' && lost !== undefined) {
        return Object.freeze({
          kind: 'asked' as const,
          refused,
          ending: 'lost' as const,
          lostAtS: lost.atS,
          lostGoal: lost.goal,
        });
      }
      return Object.freeze({
        kind: 'asked' as const,
        refused,
        ending: ending === 'lost' || ending === undefined ? ('finished' as const) : ending,
      });
    },
    close: stop,
  };
}
