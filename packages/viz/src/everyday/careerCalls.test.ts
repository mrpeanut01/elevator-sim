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
import { shiftGoalsOf } from '../dev/leftRail.js';
import { dayCallDriversOf, dayCallsQuietSentenceOf } from '../shift/dayCalls.js';
import { NO_CALL_DECIDED_LINE } from '../shift/dayClose.js';
import { SHIFT_EVENTS } from '../shift/events.js';
import { TODAY_ASKS_DECIDES } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import { dayReportOf, type ShapedDayReport } from '../shift/report.js';
import type { ShiftGoal } from '../shift/types.js';

import { CONTRACT_ASKS_DECIDES, campaignDayVerdict, campaignTestGoals, campaignTestRows } from './campaignModel.js';
import {
  CAREER_GOALS_HEADING,
  CAREER_MARK_WORDS,
  CAREER_VERDICT_LINES,
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
import { everydayReportViewOf } from './reportView.js';

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
  /* What each close handed the shell to grade the sheet on (§ D1452): `undefined` is the day's own five. */
  const graded: ({ readonly goals: readonly ShiftGoal[] } | undefined)[] = [];
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
    closeDay: (grading) => {
      graded.push(grading);
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
  return { bindings, handed, graded, state: () => state };
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

/*
 * Wave AP lane AP-D2, [§ D1452](../../../../DECISIONS.md), the post-AO panel's seat D (D10): Garden
 * Apartments on Impossible, day 3, headed *Shift cleared · No call decided today* on the week's five
 * goals while the contract's four tests filed the day missed and the desk said the contract was lost.
 * At this base the calendar's day-4 move-in is such a day: the week's five clear it and the
 * contract's four miss it.
 */
describe('one verdict for a career day — § D1452', () => {
  /** The sheet `dev/main.ts#closeShift` files from these goals, through the shipped report. */
  function sheetOn(state: ViewerState, goals: readonly ShiftGoal[]): ShapedDayReport {
    const recording = state.recording!;
    return dayReportOf({
      recording,
      observations: shiftObservationsOf(observationsAt(recording, recording.endedAt)),
      goals,
      week: state.week,
      contract: undefined,
      event: SHIFT_EVENTS['move-in'],
      calendar: null,
      subject: { kind: 'week-day' },
      plan: { shiftLengthS: state.shiftLengthS, windowStartS: state.windowStartS, patternId: 'building' },
    });
  }

  it('grades the sheet on the contract’s four tests, so its headline is the mark the career files', () => {
    const h = careerHarness();
    const host = createEverydayHost(h.bindings);
    for (let day = 1; day < 4; day += 1) host.campaignAct({ kind: 'file-day', towerId: 'c1', verdict: 'cleared', trips: 0 });
    const before = towerById(host.campaign(), 'c1')!;
    expect(before.day).toBe(4);
    host.runCampaignDay('c1');
    const day = h.state();
    expect(day.campaignEventId).toBe('move-in');
    /* The control: the week's five clear this run, so a sheet graded on them heads it cleared. */
    expect(sheetOn(day, shiftGoalsOf(day, RESOURCES)).verdict).toBe('cleared');

    host.closeDay();
    /* Red before: the career's close handed the shell nothing, so the sheet was graded on the five. */
    const grading = h.graded.at(-1);
    expect(grading?.goals).toEqual(campaignTestGoals(DIFFICULTIES[before.difficultyId]));
    /* The career filed the day missed on the same four. */
    expect(towerById(host.campaign(), 'c1')!.missed).toBe(before.missed + 1);
    const sheet = sheetOn(day, grading?.goals ?? []);
    expect(sheet.verdict).toBe('missed');
    const view = everydayReportViewOf({
      report: sheet,
      previous: undefined,
      overnight: undefined,
      newerRunOnStage: false,
      career: { buildingName: 'Garden Apartments', day: 5, canRunAnother: true, renewalDue: false },
    });
    expect(view.sheet.verdictLine).toBe(CAREER_VERDICT_LINES.missed);
    expect(view.sheet.verdictLine).not.toMatch(/Shift cleared/u);
    expect(view.sheet.goalsHeading).toBe(CAREER_GOALS_HEADING);
    /* Every row the sheet grades is one of the contract's four, and none is the week's. */
    expect(sheet.goals.map((line) => line.reading.goal.id)).toEqual(['away', 'worst', 'queue', 'trips']);
  });

  it('leaves a close with no career day graded on the day’s own five — the negative control', () => {
    const h = careerHarness();
    const host = createEverydayHost(h.bindings);
    host.closeDay();
    expect(h.graded).toEqual([undefined]);
  });

  it('labels the week’s five, where the career stage shows them, as goals the contract does not count', () => {
    expect(TODAY_ASKS_DECIDES).toContain('the contract counts none of them');
    expect(CONTRACT_ASKS_DECIDES).toContain('the day’s report is graded on them');
    expect(`${TODAY_ASKS_DECIDES} ${CONTRACT_ASKS_DECIDES}`).not.toMatch(/decide the report and your streak|those decide your streak/u);
  });
});

/*
 * Wave AP lane AP-D2, the post-AO panel's seat B (claim 7): day 9's drawn move-in asked a call and
 * day 4's calendared one did not. At seat D's base (§ D729's date seed for 2026-10-13) day 4 is the
 * calendared move-in and asked nothing either, and this is why: the move-in's car is out from the
 * career day's first instant, a career day is a slice whose opening is not a moment to call
 * (`shift/dayCalls.ts#nextDayCallOf`; § D1336's start candidate is a whole day's), and the one moment
 * the stage reached was turned down on § D1138's counts. No admissible call, and the sheet says so.
 */
describe('a career move-in that asks nothing had nothing admissible to ask — § D1336, § D1408', () => {
  it('turns down the one moment it reaches, and the sheet’s quiet line says what it ran', () => {
    const h = careerHarness();
    h.bindings.applyPatch({ seed: 20_261_013n });
    const host = createEverydayHost(h.bindings);
    for (let day = 1; day < 4; day += 1) host.campaignAct({ kind: 'file-day', towerId: 'c1', verdict: 'cleared', trips: 0 });
    host.runCampaignDay('c1');
    const day = h.state();
    expect(day.campaignEventId).toBe('move-in');
    const recording = day.recording!;
    const facts = dayCallFactsOf(RESOURCES, day)!;
    /* The move-in's window opens with the day, and a slice reads no wrinkle start. */
    expect(facts.horizon).not.toBe('whole-day');
    expect(facts.wrinkle?.startS).toBe(0);
    const session = sessionOn(day, recording, campaignTestGoals(DIFFICULTIES[towerById(host.campaign(), 'c1')!.difficultyId]));
    expect(session.onStage()?.raised ?? false).toBe(false);
    const quiet = session.quiet();
    expect(quiet).toEqual({ kind: 'asked', refused: 1, ending: 'finished' });
    expect(dayCallsQuietSentenceOf(quiet!)).toContain('from one moment, and each time the answers left close to the same number');
  });
});
