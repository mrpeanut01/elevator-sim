/**
 * **What the handover row says after a handover, measured on the pair it is about** — GitHub issue
 * #571, [§ D1310](../../../../DECISIONS.md), the swarm's AP-4 fold.
 *
 * #571: on the career's opening tower the dispatcher choice changes who rides which car and has
 * never been seen to change the day's verdict, and the day said nothing. The stage holds both days
 * of a press, the one before it and the one re-simulated with it, so the handover row can say what
 * the press turned out to change, claiming no mechanism:
 *
 * | the pair | the row says |
 * |---|---|
 * | the legs are identical | § D1278's line, from the press on |
 * | the legs differ, every goal lands on the same side of its bar | the goals-agree line, from the day's end on |
 * | a goal's verdict moved, or a reading was not graded | nothing |
 *
 * Every case runs the shipped path: `dev/state.ts#shiftRunConfigOf` builds both days, the handover
 * is a real `adopt-dispatcher` entry, the verdict is `stageScreenModel.ts#stageHandoverVerdictOf`'s,
 * and the row is asked of `stageInterventionsOf` exactly as `everyday/stageScreen.ts` asks it.
 */

import { describe, expect, it } from 'vitest';

import type { RunInterventionConfig } from '@elevator-sim/core/browser';

import { careerDaySeedFor } from '../campaign/incidents.js';
import type { VizRecording } from '../contract/types.js';
import {
  buildingConfigOf,
  drivingProfileOf,
  profileById,
  shiftLengthForContract,
  shiftRunConfigOf,
  type ViewerState,
} from '../dev/state.js';
import { observationsAt } from '../live/observations.js';
import { sameLegs } from '../record/crowd.js';
import { recordRun } from '../record/recordRun.js';
import { baseState, RESOURCES } from '../scope/probes.test-helper.js';
import { runHorizonOf } from '../shift/dayLength.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import type { ShiftGoal } from '../shift/types.js';
import {
  STAGE_HANDOVER_GOALS_AGREE,
  STAGE_PRESS_CHANGED_NOBODY,
  stageHandoverVerdictOf,
  stageInterventionsOf,
  type StageHandoverOutcome,
} from './stageScreenModel.js';

/* -------------------------------------------------------------------------- *
 * The shipped path
 * -------------------------------------------------------------------------- */

function recordingOf(state: ViewerState): VizRecording {
  const plan = shiftRunConfigOf(RESOURCES, state);
  return recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds })
    .recording;
}

/** The strip's own goals for this day: `EverydayHost.goalsAt`'s expression, over the same state. */
function goalsOf(state: ViewerState): readonly ShiftGoal[] {
  const building = buildingConfigOf(RESOURCES, state.savedBuildings, state.buildingId);
  return goalsForDay(state.week.day, runHorizonOf(RESOURCES.trafficProfiles, building, state));
}

function verdictsOf(recording: VizRecording, goals: readonly ShiftGoal[]): readonly string[] {
  return readGoals(goals, shiftObservationsOf(observationsAt(recording, recording.endedAt))).map(
    (reading) => `${reading.goal.id}:${reading.state}`,
  );
}

interface Handed {
  readonly state: ViewerState;
  readonly press: RunInterventionConfig;
  readonly before: VizRecording;
  readonly after: VizRecording;
  readonly goals: readonly ShiftGoal[];
  readonly outcome: StageHandoverOutcome | undefined;
}

function handOver(state: ViewerState, toId: string, atS: number): Handed {
  const press: RunInterventionConfig = {
    atS,
    change: { kind: 'adopt-dispatcher', profile: profileById(RESOURCES, [], toId) },
  };
  const before = recordingOf(state);
  const after = recordingOf({ ...state, interventions: [press] });
  const goals = goalsOf(state);
  return { state, press, before, after, goals, outcome: stageHandoverVerdictOf({ before, after, press, goals }) };
}

/** The handover row's note, as the stage would draw it at `simTimeS` after the day landed. */
function handoverNoteAt(handed: Handed, simTimeS: number, log = [handed.press]): string | undefined {
  const landed = { ...handed.state, interventions: log };
  const view = stageInterventionsOf({
    interventions: log,
    simTimeS,
    hasRun: true,
    dayClosed: false,
    recomputing: false,
    switchTo: {
      target: profileById(RESOURCES, [], handed.press.change.kind === 'adopt-dispatcher' ? handed.press.change.profile.id : ''),
      driving: () => drivingProfileOf(RESOURCES, landed),
    },
    ...(handed.outcome === undefined
      ? {}
      : { handoverVerdict: { press: handed.press, outcome: handed.outcome, dayEndS: handed.after.endedAt } }),
  });
  return view.rows.find((row) => row.change.kind === 'adopt-dispatcher')?.note;
}

/* -------------------------------------------------------------------------- *
 * The three arms
 * -------------------------------------------------------------------------- */

describe('the handover row says what the handover turned out to change — #571, § D1310', () => {
  /**
   * **The career's opener**: `c1`, Garden Apartments, day 1, on the crowd the career deals that day
   * (`campaign/incidents.ts#careerDaySeedFor`) and over the length the contract names. `collective`
   * is the opener's standing order and `nearest-car` the handover the issue names.
   */
  const c1: ViewerState = {
    ...baseState(),
    buildingId: 'garden-apartments',
    dispatcherId: 'collective',
    seed: careerDaySeedFor(baseState().seed, 'c1', 1),
    shiftLengthS: shiftLengthForContract('c1'),
    windowStartS: null,
    week: { ...baseState().week, day: 1 },
  };

  it('a c1 handover from collective to nearest-car moves riders and no goal, and says so at the day’s end', () => {
    const handed = handOver(c1, 'nearest-car', Math.round(c1.shiftLengthS * 0.28));
    /* Not vacuous: the legs moved, and every goal was graded on both days. */
    expect(sameLegs(handed.before, handed.after)).toBe(false);
    expect(verdictsOf(handed.before, handed.goals).some((entry) => entry.endsWith(':pending'))).toBe(false);
    expect(verdictsOf(handed.after, handed.goals)).toEqual(verdictsOf(handed.before, handed.goals));
    expect(handed.outcome).toBe('agrees');
    expect(handoverNoteAt(handed, handed.after.endedAt)).toContain(STAGE_HANDOVER_GOALS_AGREE);
    /* A verdict, so not before the day has run out (§ D371). */
    expect(handoverNoteAt(handed, handed.press.atS) ?? '').not.toContain(STAGE_HANDOVER_GOALS_AGREE);
  });

  /**
   * **A Midtown cell where the handover flips the verdict.** Day 7's bars, `collective` handing to
   * `nearest-car` at 45 s: the day carried everybody it was asked to before the press and does not
   * after it, so the row says nothing.
   */
  it('a Midtown handover that flips a goal’s verdict draws nothing', () => {
    const midtown: ViewerState = {
      ...baseState(),
      buildingId: 'midtown-office',
      dispatcherId: 'collective',
      shiftLengthS: 900,
      week: { ...baseState().week, day: 7 },
    };
    const handed = handOver(midtown, 'nearest-car', 45);
    expect(verdictsOf(handed.before, handed.goals)).toContain('carry:met');
    expect(verdictsOf(handed.after, handed.goals)).toContain('carry:missed');
    expect(handed.outcome).toBeUndefined();
    const note = handoverNoteAt(handed, handed.after.endedAt) ?? '';
    expect(note).not.toContain(STAGE_HANDOVER_GOALS_AGREE);
    expect(note).not.toContain(STAGE_PRESS_CHANGED_NOBODY);
    /*
     * The flip alone withholds it, on this same pair: asked about the carry goal only, the answer
     * is still nothing, and asked about the energy goal, which agrees on both days, it is `agrees`.
     */
    const carry = handed.goals.filter((goal) => goal.id === 'carry');
    const energy = handed.goals.filter((goal) => goal.id === 'energy');
    expect(carry).toHaveLength(1);
    expect(energy).toHaveLength(1);
    expect(stageHandoverVerdictOf({ ...handed, goals: carry })).toBeUndefined();
    expect(stageHandoverVerdictOf({ ...handed, goals: energy })).toBe('agrees');
  });

  /**
   * **A handover that changes nobody's trip** — Garden Apartments at 900 s, `collective` to `eta`:
   * the two-car fixture the swarm's S3 named. The row carries § D1278's own sentence, from the press
   * on, and not the goals line.
   */
  it('a handover that changes nobody’s trip carries § D1278’s line from the press on', () => {
    const garden: ViewerState = { ...baseState(), dispatcherId: 'collective' };
    const handed = handOver(garden, 'eta', Math.round(garden.shiftLengthS * 0.28));
    expect(sameLegs(handed.before, handed.after)).toBe(true);
    expect(handed.outcome).toBe('unchanged');
    expect(handoverNoteAt(handed, handed.press.atS)).toContain(STAGE_PRESS_CHANGED_NOBODY);
    expect(handoverNoteAt(handed, handed.press.atS)).not.toContain(STAGE_HANDOVER_GOALS_AGREE);
    /* A later press is a different question with no answer yet, and withdraws it. */
    const later: RunInterventionConfig = { atS: handed.press.atS + 60, change: { kind: 'spread-cars' } };
    expect(handoverNoteAt(handed, later.atS, [handed.press, later]) ?? '').not.toContain(
      STAGE_PRESS_CHANGED_NOBODY,
    );
  });
});
