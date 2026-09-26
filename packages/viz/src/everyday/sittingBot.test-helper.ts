/**
 * **A bot that plays a scored day, and whole sittings, with one fixed policy** — wave AM, lane
 * AM-F, [§ D1264](../../../../DECISIONS.md) and [§ D1267](../../../../DECISIONS.md) (swarm DO § 4).
 *
 * ## What it is for
 *
 * Swarm DO's player member found one fixed policy, *Fairness first at the brief, keep it when asked
 * who drives, park the cars when asked where they go*, cleared **13 of 13** Midtown days over two
 * weeks, the week-2 days skipped without looking. A fixed policy that never loses is a game with
 * nothing to lose, so the ruling asked for two instruments: a **flip census** (how often the other
 * answer at a call flips the day's verdict on its crowd) and a **sitting bot** (what fixed policies
 * achieve over whole sittings). This is the one engine both stand on, so the two cannot play a day
 * two different ways.
 *
 * ## How it plays a day
 *
 * Exactly as `stageSkip.sweep.test.ts` (§ D1212) does, which is how the stage plays it: the day is
 * Today's scenario (`contractDay.test-helper.ts#todaysScenarioDayState`, the whole authored day)
 * at the week's day and weekday with the wrinkle the week deals (`campaignEventId` left to the
 * calendar), built by `dev/state.ts#shiftRunConfigOf` and recorded by the shipped `recordRun`. The
 * brief's one choice, who drives, is the policy's; the day's ordinary calls are asked by the shipped
 * `dev/dayCallSession.ts#openDayCallSession`, opened as `dev/main.ts` opens it, and answered by the
 * policy. A pinned press day's one call is answered with the policy's placement answer and the
 * session opened after it (§ D1204). The day is graded as the rail grades it:
 * `dev/leftRail.ts#shiftGoalsOf` read over the ended run's whole-run observations, where any goal
 * not `met` is a miss (`shift/week.ts#outcomeOf`'s *unjudged is not passed*).
 *
 * ## What a call's flip is
 *
 * Every raised call's record carries its three runs' whole-run observations, each with every press
 * before the call and **nothing pressed after it** (`shift/dayCalls.ts#DayCallRecord`). Each is
 * graded with the day's own goals. The call **flips the day** when the three verdicts are not all
 * the same; it could have **lost** the day when the answer given cleared and another missed, and
 * **saved** it when the answer given missed and another cleared. Those are facts of those three runs
 * on this crowd, the same footing as the report's row (§ D1138 clause 3), and they are not the day's
 * final verdict, which later calls may move.
 *
 * A test helper rather than a production module: nothing the player runs needs it.
 */

import type { RunInterventionConfig } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import type { BrowserResources } from '../dev/data.js';
import { openDayCallSession } from '../dev/dayCallSession.js';
import { shiftGoalsOf } from '../dev/leftRail.js';
import {
  dayCallFactsOf,
  drivingProfileOf,
  pressDayCallOf,
  shiftRunConfigOf,
  type ViewerState,
} from '../dev/state.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { scheduledEventFor } from '../shift/calendar.js';
import { todaysScenarioDayState } from '../shift/contractDay.test-helper.js';
import { actsOf } from '../shift/dayLength.js';
import { pressDayFor } from '../shift/ladder.js';
import {
  dayCallAnswersOf,
  dayCallDriversOf,
  dayCallsOffered,
  type DayCallAnswer,
  type DayCallQuestion,
} from '../shift/dayCalls.js';
import { readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import type { Observations, ShiftGoal, WeekState } from '../shift/types.js';

import { scoredDayPlayOf } from './stagePace.test-helper.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S } from './stageScreenModel.js';

/**
 * **A fixed policy** — the brief's driver, and one answer to each question for the whole day.
 * `rotate` answers in `dayCalls.sweep.test.ts`'s rotation (spread, park, leave; driver a, driver b,
 * keep), which is how § D1205 and § D1212 measured a day.
 */
export interface SittingPolicy {
  readonly id: string;
  /** The dispatcher chosen at the brief, before the day starts. */
  readonly briefDriver: string;
  readonly placement: 'park-cars-lobby' | 'spread-cars' | 'leave' | 'rotate';
  readonly driver: 'driver-a' | 'driver-b' | 'leave' | 'rotate';
}

/**
 * **The fixed policies the instruments measure.** `house` is the tower's standing order left alone,
 * `collective` answering *leave* to everything, which is the house run § D1227 starts at each counted
 * close. `s1` is swarm DO's player member's policy, the baseline the ruling named. The other two
 * are the other fixed placement answer under the same driver, and the rotation the published
 * rhythm figures were measured under.
 */
export const SITTING_POLICIES: readonly SittingPolicy[] = Object.freeze([
  Object.freeze({ id: 'house', briefDriver: 'collective', placement: 'leave', driver: 'leave' }),
  Object.freeze({ id: 's1-fairness-keep-park', briefDriver: 'fairness-first', placement: 'park-cars-lobby', driver: 'leave' }),
  Object.freeze({ id: 'fairness-keep-spread', briefDriver: 'fairness-first', placement: 'spread-cars', driver: 'leave' }),
  Object.freeze({ id: 'collective-rotate', briefDriver: 'collective', placement: 'rotate', driver: 'rotate' }),
] as const satisfies readonly SittingPolicy[]);

const PLACEMENT_ROTATION: readonly DayCallAnswer[] = ['spread-cars', 'park-cars-lobby', 'leave'];
const DRIVER_ROTATION: readonly DayCallAnswer[] = ['driver-a', 'driver-b', 'leave'];

/** One raised call as the bot met it. */
export interface PlayedCall {
  readonly atS: number;
  readonly question: DayCallQuestion | 'pinned';
  readonly answer: DayCallAnswer;
  /** Riders arriving in the ten minutes from the call who waited a minute, by answer. */
  readonly counts: Readonly<Partial<Record<DayCallAnswer, number>>>;
  /** Each answer's run, graded with the day's goals: `true` cleared. Empty on a pinned call. */
  readonly clears: Readonly<Partial<Record<DayCallAnswer, boolean>>>;
}

/** Whether a call's three runs split the day's verdict. */
export function callFlips(call: PlayedCall): boolean {
  const values = Object.values(call.clears);
  return values.length > 1 && values.some((value) => value !== values[0]);
}

/** The answer given cleared and another answer's run missed. */
export function callCouldLose(call: PlayedCall): boolean {
  const given = call.clears[call.answer];
  return given === true && Object.values(call.clears).some((value) => value === false);
}

/** The answer given missed and another answer's run cleared. */
export function callCouldSave(call: PlayedCall): boolean {
  const given = call.clears[call.answer];
  return given === false && Object.values(call.clears).some((value) => value === true);
}

/** One day the bot played. */
export interface PlayedDay {
  readonly contractId: string;
  readonly day: number;
  readonly dayIdx: number;
  readonly wrinkle: string;
  readonly seed: bigint;
  readonly policy: string;
  /** `called`, `pinned`, `gated` (a whole day too busy to call on) or `no-facts`. */
  readonly status: 'called' | 'pinned' | 'gated' | 'no-facts';
  readonly cleared: boolean;
  /** Goal ids not `met`, in the goals' order. */
  readonly failing: readonly string[];
  readonly calls: readonly PlayedCall[];
  /** Every instant the stage stopped at: each raised call and each candidate it waited at. */
  readonly stopsAtS: readonly number[];
  /** Real seconds the stage takes over the ended run at the default rung, with § D1266's skip. */
  readonly realS: number;
  /** The ended run, for a caller that measures it further. */
  readonly recording: VizRecording;
}

/** A run folded over its own whole run, as `dev/main.ts#closeShift` folds the filed run. */
function wholeRunOf(recording: VizRecording): Observations {
  return shiftObservationsOf(observationsAt(recording, recording.endedAt));
}

/** Goal ids not `met` on `observations`, graded with `goals`. */
export function failingGoalsOf(goals: readonly ShiftGoal[], observations: Observations): readonly string[] {
  return readGoals(goals, observations)
    .filter((reading) => reading.state !== 'met')
    .map((reading) => reading.goal.id);
}

/** What a day is played from. */
export interface ScoredDayInput {
  readonly resources: BrowserResources;
  readonly contractId: string;
  /** The week the day stands in; its `day` and `dayIdx` are the day played. */
  readonly week: WeekState;
  readonly seed: bigint;
  readonly policy: SittingPolicy;
  /** Fields written over the day after the week, for an instrument's variant. */
  readonly over?: Partial<ViewerState>;
}

function run(plan: ReturnType<typeof shiftRunConfigOf>): VizRecording {
  return recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording;
}

/** **Play one scored day with one fixed policy** — see the module docstring. */
export function playScoredDay(input: ScoredDayInput): PlayedDay {
  const { resources, contractId, policy } = input;
  const openWith = (dispatcherId: string) =>
    todaysScenarioDayState(resources, contractId, {
      seed: input.seed,
      dispatcherId,
      over: { week: input.week, campaignEventId: undefined, ...(input.over ?? {}) },
    });
  let opened = openWith(policy.briefDriver);
  /*
   * A pinned press day's standing order is part of the pin, so its brief asks no driver (§ D1204's
   * measured table says so): the day is played under the pin's own order whatever the policy's
   * brief answer is, as a player meets it.
   */
  const pinnedOrder = pressDayFor(contractId)?.standingOrder;
  if (pinnedOrder !== undefined && pinnedOrder !== policy.briefDriver && dayCallFactsOf(resources, opened.state)?.pinned === true) {
    opened = openWith(pinnedOrder);
  }
  const state: ViewerState = opened.state;
  const wrinkle = scheduledEventFor(state.calendar, state.week.day, state.week.dayIdx, opened.horizon).id;
  const goals = shiftGoalsOf(state, resources);
  const gradeClears = (observations: Observations | undefined): boolean | undefined =>
    observations === undefined ? undefined : failingGoalsOf(goals, observations).length === 0;
  const built = run(shiftRunConfigOf(resources, state));
  const facts = dayCallFactsOf(resources, state);
  let status: PlayedDay['status'] = 'called';
  if (facts === undefined) status = 'no-facts';
  else if (facts.pinned) status = 'pinned';
  else if (!dayCallsOffered(opened.horizon, built.legs.length)) status = 'gated';

  let log: RunInterventionConfig[] = [];
  let ended = built;
  const calls: PlayedCall[] = [];
  const stops = new Set<number>();
  let placements = 0;
  let drivers = 0;
  const placementAnswer = (): DayCallAnswer =>
    policy.placement === 'rotate'
      ? PLACEMENT_ROTATION[placements++ % PLACEMENT_ROTATION.length]!
      : policy.placement;
  const driverAnswer = (): DayCallAnswer =>
    policy.driver === 'rotate' ? DRIVER_ROTATION[drivers++ % DRIVER_ROTATION.length]! : policy.driver;

  let pinnedCall: ReturnType<typeof pressDayCallOf> = undefined;
  if (status === 'pinned') {
    pinnedCall = pressDayCallOf(resources, state, built);
    if (pinnedCall !== undefined) {
      const answer = policy.placement === 'rotate' ? 'leave' : policy.placement;
      stops.add(pinnedCall.call.atS);
      if (answer !== 'leave') {
        log = [{ atS: pinnedCall.call.atS, change: { kind: answer } }];
        ended = run(shiftRunConfigOf(resources, { ...state, interventions: log }));
      }
      calls.push({ atS: pinnedCall.call.atS, question: 'pinned', answer, counts: {}, clears: {} });
    }
  }
  if ((status === 'called' || (status === 'pinned' && pinnedCall !== undefined)) && facts !== undefined) {
    const driving = drivingProfileOf(resources, state);
    const pair = dayCallDriversOf(resources.dispatcherProfiles.profiles, driving);
    const session = openDayCallSession(
      {
        planWith: (extra) => {
          stops.add(extra.atS);
          const p = shiftRunConfigOf(resources, { ...state, interventions: [...log, extra] });
          return { config: p.config, outOfServiceCarIds: p.outOfServiceCarIds, recordDecisions: false };
        },
        simulate: (runs, done) => {
          done(runs.map((r) => recordRun(r.config, { recordDecisions: false, outOfServiceCarIds: r.outOfServiceCarIds }).recording));
        },
        cancel: () => {},
        changed: () => {},
      },
      {
        recording: ended,
        bookedOut: facts.bookedOut,
        horizon: facts.horizon,
        goals,
        drivers: pair === undefined ? undefined : { profiles: resources.dispatcherProfiles.profiles, driving },
        ...(pinnedCall === undefined ? {} : { pinnedCall: pinnedCall.call }),
        wrinkle: facts.wrinkle,
      },
    );
    for (let raised = session.onStage(); raised?.raised === true; raised = session.onStage()) {
      const question = raised.question ?? 'placement';
      const answer = question === 'driver' ? driverAnswer() : placementAnswer();
      session.answer(answer, (adoption) => {
        log = [...log, adoption.entry];
        ended = adoption.recording;
      });
    }
    const records = session.records();
    for (const record of records) {
      const question = record.question ?? 'placement';
      const clears: Partial<Record<DayCallAnswer, boolean>> = {};
      for (const answer of dayCallAnswersOf(question)) {
        const cleared = gradeClears(record.observations[answer]);
        if (cleared !== undefined) clears[answer] = cleared;
      }
      calls.push({
        atS: record.atS,
        question,
        answer: record.answer === 'skipped' ? 'leave' : record.answer,
        counts: record.counts,
        clears,
      });
    }
    session.close();
  }
  calls.sort((a, b) => a.atS - b.atS);
  const failing = failingGoalsOf(goals, wholeRunOf(ended));
  const realS = scoredDayPlayOf({
    legs: ended.legs,
    acts: actsOf(ended.demandPhases),
    startedAt: ended.startedAt,
    endedAt: ended.endedAt,
    stopsAtS: [...stops],
    watchingSimPerRealS: DEFAULT_STAGE_SIM_PER_REAL_S,
    skip: opened.horizon === 'whole-day',
  }).realS;
  return Object.freeze({
    contractId,
    day: state.week.day,
    dayIdx: state.week.dayIdx,
    wrinkle,
    seed: input.seed,
    policy: policy.id,
    status,
    cleared: failing.length === 0,
    failing,
    calls: Object.freeze(calls),
    stopsAtS: Object.freeze([...stops].sort((a, b) => a - b)),
    realS,
    recording: ended,
  });
}
