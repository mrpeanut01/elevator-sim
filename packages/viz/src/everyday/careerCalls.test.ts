/**
 * **The career asks on its event days, the calls pay nothing, and the report says what decided the
 * day** — wave AO, lane DS-2, [§ D1408](../../../../DECISIONS.md) and
 * [§ D1409](../../../../DECISIONS.md), swarm DS's ruling Q2.
 *
 * The rule is pure (`careerCalls.ts`) and held first. Then it is driven through the host on real
 * runs of Garden Apartments' contract, at the base the browser tier loads (`seed=424242`): day 16 is
 * an ordinary day and day 17 the calendar's booked move-in. The shipped call session, graded on the
 * contract's tests, would raise a call on both; the host hands the shell the career's goals on day
 * 17 alone, so the ordinary day's silence is the gate's and not the day's. The answer moves no unit,
 * the day's mark pays what the reducer pays for that mark, and the report's account is the call line
 * and § D1351's arms, from runs this host makes at the close.
 */

import { describe, expect, it } from 'vitest';

import { applyCampaignAction, towerById, type CampaignCareer } from '../campaign/career.js';
import { DIFFICULTIES, purseOf } from '../campaign/economy.js';
import type { VizRecording } from '../contract/types.js';
import { openDayCallSession, type DayCallSession } from '../dev/dayCallSession.js';
import { dayCallFactsOf, drivingProfileOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { observationsAt } from '../live/observations.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { dayCallDriversOf } from '../shift/dayCalls.js';
import { NO_CALL_DECIDED_LINE } from '../shift/dayClose.js';
import { shiftObservationsOf } from '../shift/observations.js';
import type { ShiftGoal } from '../shift/types.js';

import { campaignDayVerdict, campaignTestGoals, campaignTestRows } from './campaignModel.js';
import {
  CAREER_MARK_WORDS,
  careerCloseLineOf,
  careerCloseRunStatesOf,
  careerDayAsks,
  careerDayCallsOf,
  careerDeciderOf,
  careerRunNeedOf,
  type CareerCloseInput,
  type CareerDayCalls,
} from './careerCalls.js';
import { createEverydayHost, type EverydayHostBindings } from './host.js';

/** The base the browser tier's cold load captures (`?seed=424242`). */
const BASE = 424_242n;

describe('which career days ask — § D1408', () => {
  it('asks on a day with an event that changes something, and on no other', () => {
    expect(careerDayAsks('ordinary')).toBe(false);
    expect(careerDayAsks(undefined)).toBe(false);
    expect(careerDayAsks('no-such-event')).toBe(false);
    /* A calendar booking, a breakdown, and a building's own drawn day. */
    expect(careerDayAsks('move-in')).toBe(true);
    expect(careerDayAsks('breakdown')).toBe(true);
    expect(careerDayAsks('caterers')).toBe(true);
  });

  it('hands the session the contract’s own tests at the tower’s difficulty, never the Scenario day’s goals', () => {
    const asks = careerDayCallsOf({ difficultyId: 'standard' }, 'move-in');
    expect(asks?.goals).toEqual(campaignTestGoals(DIFFICULTIES.standard));
    expect(careerDayCallsOf({ difficultyId: 'standard' }, 'ordinary')).toBeUndefined();
    expect(careerDayCallsOf(undefined, 'move-in')).toBeUndefined();
  });
});

/** A host over real runs, whose shell opens the shipped session where the host hands it a career's calls. */
function careerHarness() {
  let state: ViewerState = { ...baseState(), seed: BASE };
  let filed: string | undefined;
  let session: DayCallSession | undefined;
  const handed: (CareerDayCalls | undefined)[] = [];
  const run = (day: ViewerState): VizRecording => {
    const plan = shiftRunConfigOf(RESOURCES, day);
    return recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording;
  };
  const bindings: EverydayHostBindings = {
    resources: RESOURCES,
    state: () => state,
    playheadS: () => 0,
    dayClosed: () => state.recording !== undefined && filed === state.recording.runId,
    runIsOwn: () => true,
    playerHasChosen: () => true,
    dayStartS: () => undefined,
    startRun: () => {
      session = undefined;
      state = { ...state, recording: run(state) };
    },
    intervene: () => {},
    closeDay: () => {
      if (state.recording !== undefined) filed = state.recording.runId;
    },
    openRunTab: () => {},
    ghostRace: () => ({ pick: 'none' as const, rival: undefined, refusal: undefined, pending: false }),
    raceAgainst: () => {},
    applyPatch: (patch) => {
      state = { ...state, ...patch };
    },
    loadReferenceRuns: () => Promise.resolve([]),
    /* Synchronous, so the close's account lands before the case reads it. */
    simulateRecord: (config, done, _failed, outOfServiceCarIds) => {
      done(recordRun(config, { recordDecisions: false, outOfServiceCarIds }).recording);
    },
    enterWatch: () => {},
    stopWatching: () => {},
    playThisCrowd: () => {},
    watching: () => undefined,
    dailyBoard: undefined,
    onChange: () => () => {},
    /* `dev/main.ts#dayCallOnStage`'s part, reduced to what a career day needs: the session, on the handed goals. */
    dayCallOnStage: (recording, _pinned, career) => {
      handed.push(career);
      if (career === undefined) return undefined;
      session ??= sessionOn(state, recording, career.goals);
      return session.onStage();
    },
    answerDayCall: (answer) => {
      session?.answer(answer, (adoption) => {
        state = { ...state, interventions: [...state.interventions, adoption.entry], recording: adoption.recording };
      });
    },
    dayCallRecordsOn: () => session?.records() ?? [],
  };
  return { bindings, handed, state: () => state };
}

/** The shipped session on a day, every run made synchronously by the shipped `recordRun`. */
function sessionOn(state: ViewerState, recording: VizRecording, goals: readonly ShiftGoal[]): DayCallSession {
  const facts = dayCallFactsOf(RESOURCES, state)!;
  const driving = drivingProfileOf(RESOURCES, state);
  const pair = dayCallDriversOf(RESOURCES.dispatcherProfiles.profiles, driving);
  return openDayCallSession(
    {
      planWith: (extra) => {
        const plan = shiftRunConfigOf(RESOURCES, { ...state, interventions: [...state.interventions, extra] });
        return { config: plan.config, outOfServiceCarIds: plan.outOfServiceCarIds, recordDecisions: false };
      },
      simulate: (runs, done) => {
        done(runs.map((ask) => recordRun(ask.config, { recordDecisions: false, outOfServiceCarIds: ask.outOfServiceCarIds }).recording));
      },
      cancel: () => {},
      changed: () => {},
    },
    {
      recording,
      bookedOut: facts.bookedOut,
      horizon: facts.horizon,
      goals,
      drivers: pair === undefined ? undefined : { profiles: RESOURCES.dispatcherProfiles.profiles, driving },
      wrinkle: facts.wrinkle,
    },
  );
}

describe('a career day through the host, on real runs — § D1408 and § D1409', () => {
  it('asks nothing on an ordinary day though its calls would be admitted, and asks on the booked move-in', () => {
    const h = careerHarness();
    const host = createEverydayHost(h.bindings);
    for (let day = 1; day < 16; day += 1) host.campaignAct({ kind: 'file-day', towerId: 'c1', verdict: 'cleared', trips: 0 });
    const tower = (): NonNullable<ReturnType<typeof towerById>> => towerById(host.campaign(), 'c1')!;
    expect(tower().day).toBe(16);

    /* Day 16: an ordinary day. The host hands the shell nothing, so the shell asks nothing. */
    host.runCampaignDay('c1');
    expect(h.state().campaignEventId).toBe('ordinary');
    const ordinary = h.state().recording!;
    expect(host.dayCallOnStage(ordinary)).toBeUndefined();
    expect(h.handed).toEqual([undefined]);
    /* The control: the same session on the same day, graded on the contract's tests, would raise a call. */
    const would = sessionOn(h.state(), ordinary, campaignTestGoals(DIFFICULTIES[tower().difficultyId]));
    expect(would.onStage()?.raised, 'the ordinary day’s silence is the gate’s, not the day’s').toBe(true);
    host.closeDay();
    expect(tower().day).toBe(17);

    /* Day 17: the calendar's move-in. The host hands the contract's tests, and the call is raised. */
    host.runCampaignDay('c1');
    expect(h.state().campaignEventId).toBe('move-in');
    const call = host.dayCallOnStage(h.state().recording!);
    expect(h.handed.at(-1)?.goals).toEqual(campaignTestGoals(DIFFICULTIES[tower().difficultyId]));
    /* Red before § D1408: the shell refused every career day, so nothing stood here. */
    expect(call?.raised).toBe(true);
    expect(call?.question).toBe('driver');

    /* The answer is free: it adopts the run already made, and no unit leaves the purse. */
    const purseBefore = purseOf(tower());
    const careerBefore: CampaignCareer = host.campaign();
    host.answerDayCall('driver-a');
    expect(h.state().interventions.map((entry) => entry.change.kind)).toEqual(['adopt-dispatcher']);
    expect(purseOf(tower())).toBe(purseBefore);

    /* The day's mark pays exactly what the reducer pays for that mark, call or no call. */
    host.closeDay();
    const recording = h.state().recording!;
    const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
    const tower17 = towerById(careerBefore, 'c1')!;
    const verdict = campaignDayVerdict(
      campaignTestRows(DIFFICULTIES[tower17.difficultyId], tower17, observations, [], 'whole-run'),
    );
    expect(verdict === 'cleared' || verdict === 'missed').toBe(true);
    if (verdict === 'ungraded') return;
    const paid = applyCampaignAction(
      careerBefore,
      { kind: 'file-day', towerId: 'c1', verdict, trips: observations.loadedDepartures },
      shippedPriceSchedule(),
    );
    expect(purseOf(tower())).toBe(purseOf(towerById(paid, 'c1')!));

    /* The report's account (§ D1409): the call line graded on the contract's tests, then what decided it. */
    const line = host.careerCloseLine?.();
    expect(line).toBeDefined();
    expect(line).toMatch(/^(The call that decided today came at|No call decided today)/u);
    expect(line).toContain('contract’s tests');
    expect(line).not.toMatch(/because|so that|thanks to|which is why|due to/iu);
    /* Not about another run: a later day's run stands, and the account is withdrawn. */
    host.runCampaignDay('c1');
    expect(host.careerCloseLine?.()).toBeUndefined();
  });
});

describe('what decided a career day — § D1409', () => {
  const noCall = { line: NO_CALL_DECIDED_LINE, decided: false };
  const base: CareerCloseInput = {
    verdict: 'cleared',
    lead: noCall,
    need: 'run',
    driverRun: undefined,
    house: undefined,
    houseName: 'Conventional collective',
  };

  it('reads which run the account needs off the day, as § D1351 reads it off a record', () => {
    const house = 'collective';
    expect(careerRunNeedOf({ dispatcherId: house, ruleRows: 0, presses: 0, house })).toBe('own');
    expect(careerRunNeedOf({ dispatcherId: house, ruleRows: 0, presses: 2, house })).toBe('same');
    expect(careerRunNeedOf({ dispatcherId: 'fairness-first', ruleRows: 0, presses: 0, house })).toBe('house');
    expect(careerRunNeedOf({ dispatcherId: 'fairness-first', ruleRows: 0, presses: 1, house })).toBe('run');
    expect(careerRunNeedOf({ dispatcherId: house, ruleRows: 1, presses: 0, house })).toBe('house');
  });

  it('plans both runs from the day itself: the house’s driver, presses kept or none, the crowd unchanged', () => {
    const day = { dispatcherId: 'fairness-first', interventions: [1, 2], ruleRows: [3], seed: 7n, campaignEventId: 'move-in' };
    const runs = careerCloseRunStatesOf(day, 'collective');
    expect(runs.driverRun).toEqual({ ...day, dispatcherId: 'collective', ruleRows: [] });
    expect(runs.house).toEqual({ ...day, dispatcherId: 'collective', interventions: [], ruleRows: [] });
  });

  it('says nothing more where a call decided the day, where nothing was graded, and where the house drove untouched', () => {
    expect(careerDeciderOf({ ...base, lead: { line: 'x', decided: true } })).toEqual({ kind: 'call' });
    expect(careerDeciderOf({ ...base, lead: undefined })).toEqual({ kind: 'unsaid' });
    expect(careerDeciderOf({ ...base, need: 'own' })).toEqual({ kind: 'unsaid' });
    expect(careerCloseLineOf({ ...base, need: 'own' })).toBe(NO_CALL_DECIDED_LINE);
    expect(careerCloseLineOf({ ...base, lead: undefined })).toBeUndefined();
  });

  it('names the standing order, the presses, or nothing, from the runs it read', () => {
    /* The driver run read the other mark: the standing order decided it. */
    expect(careerDeciderOf({ ...base, driverRun: 'missed' })).toEqual({ kind: 'driver', pressed: true, reads: 'missed' });
    expect(careerCloseLineOf({ ...base, driverRun: 'missed' })).toBe(
      `${NO_CALL_DECIDED_LINE} Your standing order did: on this crowd, the same day run by Conventional collective in place of your standing order and every press kept read ${CAREER_MARK_WORDS.missed}.`,
    );
    /* The driver run read the day's mark and the house the other: the presses did. */
    expect(careerDeciderOf({ ...base, driverRun: 'cleared', house: 'missed' })).toEqual({
      kind: 'presses',
      houseDrove: false,
      kept: 'cleared',
      alone: 'missed',
    });
    /* Both read the day's mark: nothing chosen decided it. */
    expect(careerDeciderOf({ ...base, driverRun: 'cleared', house: 'cleared' })).toEqual({
      kind: 'nothing',
      pressed: true,
      houseDrove: false,
      reads: 'cleared',
    });
    /* The house drove with presses: only the house is run. */
    expect(careerDeciderOf({ ...base, need: 'same', house: 'missed' })).toMatchObject({ kind: 'presses', houseDrove: true });
    /* Another driver, nothing pressed: the house's own run is the driver run. */
    expect(careerDeciderOf({ ...base, need: 'house', house: 'cleared' })).toEqual({
      kind: 'nothing',
      pressed: false,
      houseDrove: false,
      reads: 'cleared',
    });
  });

  it('says a run is still being run, or could not be made, and guesses nothing meanwhile', () => {
    expect(careerDeciderOf(base)).toEqual({ kind: 'pending', waiting: 'driver-run' });
    expect(careerDeciderOf({ ...base, driverRun: 'cleared' })).toEqual({ kind: 'pending', waiting: 'house', known: 'cleared' });
    expect(careerDeciderOf({ ...base, driverRun: 'unrecorded' })).toEqual({ kind: 'unrun', run: 'driver-run' });
    expect(careerCloseLineOf(base)).toContain('What decided it is still being run');
    expect(careerCloseLineOf({ ...base, driverRun: 'unrecorded' })).toContain('could not be run on this crowd');
  });
});
