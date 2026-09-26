/**
 * **The ordinary day's calls, as one attempt meets them** — [§ D1138](../../../../DECISIONS.md),
 * the state machine behind `shift/dayCalls.ts`'s pure rule, with wave AK's three amendments:
 * [§ D1166](../../../../DECISIONS.md) (calls five minutes apart inside a peak, up to six),
 * [§ D1167](../../../../DECISIONS.md) (the driver question) and [§ D1168](../../../../DECISIONS.md)
 * (no call once the day is already lost). Wave AL's lane AL-C added two more:
 * [§ D1204](../../../../DECISIONS.md) (a pinned day's session opens after its pinned call) and
 * [§ D1205](../../../../DECISIONS.md) (two calls a peak, no question repeated within ten minutes, no
 * driver question after *keep* in that peak, and the driver question asked again after a handover
 * with the pair re-derived from whoever now drives).
 *
 * ## What it holds, and for how long
 *
 * One attempt at one scored day. It is opened on the run the stage opened on, asks the next
 * candidate call of the run standing, has the day run twice more from that instant (*park* and
 * *spread*, every earlier press kept), and raises the **placement** question when the three runs'
 * ten-minute counts differ by the admission threshold. Where they do not, and the day has a driver
 * pair, it has the day run twice more (*hand it to* each of the pair) and raises the **driver**
 * question when those three counts differ by the same threshold. A
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
 * - **No driver question with a pair chosen against somebody else.** After a handover by a call,
 *   or by the player's own handover where the shell says to whom, the pair is re-derived from the
 *   dispatcher now driving ([§ D1205](../../../../DECISIONS.md)); after a handover the shell cannot
 *   name, the driver question stops for the day, because *keep who drives* would name nobody.
 * - **No third call in a peak, no question twice inside {@link DAY_CALL_REPEAT_S}, and no driver
 *   question after *keep* in the same peak** ([§ D1205](../../../../DECISIONS.md)). A candidate where
 *   both questions are held costs no run and is not counted as asked.
 */

import type { DispatcherProfile, RunInterventionConfig } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import { observationsAt } from '../live/observations.js';
import type { BookedOutCar } from '../shift/bookedOut.js';
import { actsOf } from '../shift/dayLength.js';
import {
  DAY_CALL_MAX,
  DAY_CALL_MAX_TRIES,
  DAY_CALL_PER_PEAK,
  DAY_CALL_REPEAT_S,
  DAY_CALL_SPACING_S,
  dayCallAdmits,
  dayCallChangeOf,
  dayCallDriversOf,
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
import type { DayCallResume } from '../shift/attempt.js';
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
   * The dispatchers the driver question may choose from, and the one the day opened with. The pair
   * is `shift/dayCalls.ts#dayCallDriversOf` over those two, taken here and taken again from the new
   * driver after every handover ([§ D1205](../../../../DECISIONS.md)). Absent, the driver question
   * is never asked (§ D1167).
   */
  readonly drivers?:
    | { readonly profiles: readonly DispatcherProfile[]; readonly driving: DispatcherProfile }
    | undefined;
  /**
   * **A pinned day's call, already answered on this attempt** — [§ D1204](../../../../DECISIONS.md).
   * The session is opened on the run that answer left, and searches from
   * {@link DAY_CALL_SPACING_S} after it, as after any raised call; the pinned call counts as a
   * placement call for the ten-minute rule and, where it falls inside a peak, as one of that peak's
   * two. Absent on an ordinary day, which is searched from its start.
   */
  readonly pinnedCall?: PressCall | undefined;
  /**
   * **Where a resumed attempt's session stood** — wave AL, lane AL-E,
   * [§ D1218](../../../../DECISIONS.md). A reload re-simulates the attempt from its log, which is the
   * same run by determinism, and the session opens on it from {@link DayCallSession.snapshot}'s last
   * reading: the calls already answered stay answered and their rows stay the report's, and asking
   * goes on from the spacing after the last of them. Absent, the session opens at the day's start.
   */
  readonly resume?: DayCallResume | undefined;
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
  /**
   * When its question had last been raised before this call raised it, so a snapshot taken while
   * the card is up can leave this call out of § D1205's memory: the resumed session raises it again.
   */
  lastRaisedBefore?: number | undefined;
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
   * is whether the press handed the day over, and `drivingNow` the dispatcher it handed it to: the
   * driver question's pair is re-derived from that one, or ends for the day where it is absent
   * ([§ D1205](../../../../DECISIONS.md)).
   */
  readonly grew: (
    recording: VizRecording,
    pressedAtS: number,
    handedOver?: boolean,
    drivingNow?: DispatcherProfile,
  ) => void;
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
  /**
   * Where the session stands, as a plain value a resumed attempt reopens from — § D1218. It carries
   * § D1205's memory (the peaks' counts, when each question was last raised, the peak *keep* held and
   * who drives now), so the reopened session raises exactly what this one would. The call in hand,
   * being asked or raised and waiting for an answer, is not in it anywhere: its instant is at or
   * after {@link DayCallResume.searchFromS}, so the reopened session asks it again on the same run
   * and counts it then (`dayCallSession.test.ts`, *a resumed session raises what an unbroken one
   * would*).
   */
  readonly snapshot: () => DayCallResume;
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
  const resume = opening.resume;
  let standing = opening.recording;
  const pinned = opening.pinnedCall;
  /*
   * A resumed attempt's session opens where the snapshot stood (§ D1218), which already carries the
   * pinned call's place in the ten-minute rule and its peak (§ D1204); a fresh one starts at the
   * day's start, or {@link DAY_CALL_SPACING_S} after the pinned call.
   */
  let searchFromS =
    resume?.searchFromS ?? (pinned === undefined ? standing.startedAt : dayCallSearchFrom(pinned));
  let asked = resume?.asked ?? 0;
  let done = resume?.done ?? false;
  /* § D1205: the peaks (by their start) each raised call fell in, and when each question was last raised. */
  const raisedInPeak: number[] = [...(resume?.raisedInPeak ?? [])];
  const lastRaisedAtS: Partial<Record<DayCallQuestion, number>> = {};
  /* § D1205: the peak (by its start) in which *keep who drives* was answered, if any. */
  let keptInPeakS: number | undefined = resume?.keptInPeakS ?? undefined;
  if (resume !== undefined) {
    if (resume.lastRaisedAtS.placement !== null) lastRaisedAtS.placement = resume.lastRaisedAtS.placement;
    if (resume.lastRaisedAtS.driver !== null) lastRaisedAtS.driver = resume.lastRaisedAtS.driver;
  } else if (pinned !== undefined) {
    lastRaisedAtS.placement = pinned.atS;
    const peak = actsOf(standing.demandPhases).find((act) => act.startS <= pinned.atS && pinned.atS < act.endS);
    if (peak !== undefined) raisedInPeak.push(peak.startS);
  }
  /* § D1152's account of a quiet day: candidates turned down, and how asking ended. */
  let refused = resume?.refused ?? 0;
  let ending: 'finished' | 'failed' | 'skipped' | 'lost' | undefined = resume?.ending ?? undefined;
  /* § D1168: the instant and the goal that stopped the asking, when that is how it stopped. */
  let lost: { readonly atS: number; readonly goal: string } | undefined = resume?.lost ?? undefined;
  let pending: Pending | undefined;
  const records: DayCallRecord[] = [...(resume?.records ?? [])];
  /* § D1167's pair and names, re-derived from the new driver after every handover (§ D1205). */
  let pair: readonly [DispatcherProfile, DispatcherProfile] | undefined;
  let driverNames: DayCallDriverNames | undefined;
  /* Who drives now, for the snapshot: the pair is re-derived from this one on a resume (§ D1218). */
  let drivingNow: DispatcherProfile | undefined;
  function driveBy(driving: DispatcherProfile | undefined): void {
    drivingNow = driving;
    pair =
      driving === undefined || opening.drivers === undefined
        ? undefined
        : dayCallDriversOf(opening.drivers.profiles, driving);
    driverNames =
      pair === undefined || driving === undefined
        ? undefined
        : Object.freeze({ 'driver-a': pair[0].name, 'driver-b': pair[1].name, leave: driving.name });
  }
  /*
   * A resume re-derives the pair from whoever drove when the snapshot was taken, which is the
   * attempt's opening driver unless a handover moved it, and nobody where the question had stopped.
   */
  driveBy(resume === undefined ? opening.drivers?.driving : (resume.driving ?? undefined));

  /** Whether `question` was raised less than {@link DAY_CALL_REPEAT_S} before `atS`. */
  function heldByRepeat(question: DayCallQuestion, atS: number): boolean {
    const last = lastRaisedAtS[question];
    return last !== undefined && atS - last < DAY_CALL_REPEAT_S;
  }

  /** Whether the driver question may be asked of `call` — a pair, and neither § D1205 hold. */
  function driverAskable(call: PressCall): boolean {
    if (pair === undefined || driverNames === undefined) return false;
    if (heldByRepeat('driver', call.atS)) return false;
    return call.act === undefined || keptInPeakS !== call.act.startS;
  }

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
    let call = nextDayCallOf(inputOf(standing), searchFromS);
    /* § D1205: a peak that has raised its two asks nothing more; the search moves to the next. */
    while (call?.act !== undefined) {
      const peakS = call.act.startS;
      if (raisedInPeak.filter((startS) => startS === peakS).length < DAY_CALL_PER_PEAK) break;
      searchFromS = call.act.endS;
      call = nextDayCallOf(inputOf(standing), searchFromS);
    }
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
    /* § D1205: both questions held at this instant — nothing to run, so nothing is asked here. */
    const placementHeld = heldByRepeat('placement', call.atS);
    if (placementHeld && !driverAskable(call)) {
      searchFromS = dayCallSearchFrom(call);
      askNext();
      return;
    }
    asked += 1;
    if (placementHeld) {
      const asking: Pending = { call, raised: false };
      pending = asking;
      const leave = standing;
      askDriver(asking, leave, dayCallWindowEndOf(call.atS, leave.endedAt), () => pending !== asking || standing !== leave);
      return;
    }
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
   * § D1167 — the placement question was refused at this candidate, or held by § D1205's ten-minute
   * rule; ask the driver question from the same instant, when the day has a pair and neither of
   * § D1205's holds applies.
   */
  function askDriver(asking: Pending, leave: VizRecording, windowEndS: number, stale: () => boolean): void {
    const call = asking.call;
    if (!driverAskable(call) || pair === undefined || driverNames === undefined) {
      refuse(call);
      return;
    }
    const names = driverNames;
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
          drivers: names,
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
    if (asking.call.act !== undefined) raisedInPeak.push(asking.call.act.startS);
    asking.lastRaisedBefore = lastRaisedAtS[question];
    lastRaisedAtS[question] = asking.call.atS;
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
    snapshot: () => {
      /*
       * The call in hand — being asked, or raised and waiting for its answer — is left out, because
       * the resumed session asks it again from {@link DayCallResume.searchFromS} on the same run and
       * counts it then: its try, and, once raised, its place in its peak and in § D1205's
       * ten-minute memory. Counted here as well, the resumed session would count it twice, find its
       * own question held by itself, and raise a different call from an unbroken one.
       */
      const inHand = pending;
      const peaks = [...raisedInPeak];
      const last = { ...lastRaisedAtS };
      if (inHand?.raised === true && inHand.question !== undefined) {
        if (inHand.call.act !== undefined) peaks.pop();
        if (inHand.lastRaisedBefore === undefined) delete last[inHand.question];
        else last[inHand.question] = inHand.lastRaisedBefore;
      }
      return Object.freeze({
        records: [...records],
        searchFromS,
        asked: inHand === undefined ? asked : asked - 1,
        refused,
        done,
        ending: ending ?? null,
        lost: lost ?? null,
        raisedInPeak: peaks,
        lastRaisedAtS: { placement: last.placement ?? null, driver: last.driver ?? null },
        keptInPeakS: keptInPeakS ?? null,
        driving: pair === undefined ? null : (drivingNow ?? null),
      });
    },
    recording: () => standing,
    onStage: () => {
      if (pending === undefined) return undefined;
      if (!pending.raised) return { call: pending.call, raised: false };
      return pending.question === 'driver'
        ? { call: pending.call, raised: true, question: 'driver', drivers: pending.counted?.drivers }
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
      /* § D1205: *keep who drives* holds the driver question for the rest of that peak. */
      if (raised.question === 'driver' && answer === 'leave' && raised.call.act !== undefined) {
        keptInPeakS = raised.call.act.startS;
      }
      if (pressed !== undefined) {
        standing = pressed.recording;
        /* § D1205: a handover re-derives the pair from the dispatcher it handed the day to. */
        if (raised.question === 'driver' && pressed.entry.change.kind === 'adopt-dispatcher') {
          driveBy(pressed.entry.change.profile);
        }
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
    grew: (recording, pressedAtS, handed, drivingNow) => {
      /* § D1205: re-derived from the new driver where the shell names one; ended where it cannot. */
      if (handed === true) driveBy(drivingNow);
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
