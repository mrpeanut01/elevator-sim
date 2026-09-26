/**
 * The Day report, and the four things it may not do.
 *
 * 1. **It may not publish a mean the run says is suppressed.** Asserted on a real saturating
 *    configuration — Midtown Office at 25 %pop/5 min — rather than on a hand-built summary, because
 *    the interesting failure is a run that *has* a `meanWaitS` (it has one: 1 334 s) and must not
 *    print it. The synthetic case is here too, for the branches a real run does not reach.
 * 2. **It may not invent the mean.** The mockup computes `28 + (100 − pct) × 0.9`. The suite
 *    asserts the figure is `summary.meanWaitS` formatted and asserts the mockup's arithmetic is
 *    absent from it, because "equals the right number" and "does not equal the wrong one" fail
 *    differently.
 * 3. **It may not rank or aggregate energy.** § D106. Both figures are `unranked` and `axisOnly`,
 *    both are always present or both absent, and no other figure carries an energy unit.
 * 4. **It may not print a clock time the run did not have.** Every `when` on the diagnosis rows is
 *    inside the run's own span or is the em dash.
 * 5. **It may not be shaped like a week when it is a report of one run.** `docs/17` § 5 clause 1.
 *    Asserted in **both** directions on the same recording and the same week — the week-shaped
 *    lines are present under `week-day` and *absent as keys* under `single-run` — because either
 *    half alone proves nothing: a suite that only checked the absences would pass against a sheet
 *    that had lost those lines everywhere.
 * 6. **It may not say two things about one day.** Issue #53: the headline branched on
 *    `summary.saturated` and the banner on the goal readings, so a run that missed a bar without
 *    saturating got *"A day it could handle"* over *"Shift missed"*. The suite that pins this is
 *    *one judgement, four sentences*, and its central test holds the run fixed and moves only the
 *    goals — which is the assertion the old code fails and copy that merely lines up would pass.
 */

import { loadConfig, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { fallbackLineOf, readbackOf, type RuleRow } from '../authoring/ruleSpec.js';
import { DATA_DIR, fixtureConfig, fixtureSummary } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { shiftRunConfigOf } from '../dev/state.js';
import { contractBuildings, contractDayState } from './contractDay.test-helper.js';
import type { VizRecording, VizSummary } from '../contract/types.js';
import {
  CALENDAR_PERIODS,
  scheduledEventFor,
  type CalendarPeriod,
} from './calendar.js';
import { contractById } from './contracts.js';
import { SHIFT_EVENTS, eventFor } from './events.js';
import { goalsForDay } from './goals.js';
import { observationsAt } from '../live/observations.js';
// `docs/20` defect 4 — the rail's fourth band label, derived rather than retyped. See the test
// that asserts the two *stairs* cohorts share no phrase.
import { WAIT_BANDS } from '../live/bands.js';
import { shiftObservationsOf } from './observations.js';

/**
 * The whole run's observations — the shift layer's own reading of `live/`.
 *
 * A report is the day's account, so the fold is taken at `endedAt`. This replaced
 * `observations.test-helper.ts`, which stood in for `live/` while the two lanes were built in
 * parallel; there is now exactly one function in the repository that folds a recording into a
 * queue depth, which is what the helper's own docstring said had to happen.
 */
const observationsOfRun = (recording: Parameters<typeof observationsAt>[0]) =>
  shiftObservationsOf(observationsAt(recording, recording.endedAt));
import {
  NOT_RECORDED,
  PRACTICE_CROWD_NOTE,
  PRACTICE_NOTE,
  WITHHELD,
  averageWaitFigure,
  clockOf,
  dayReportOf,
  leadingWith,
  meanIsPublishable,
  type DayReportInput,
  type ReportSubject,
  type ShapedDayReport,
  type ShiftPlan,
  type SingleRunReport,
  type WeekDayReport,
} from './report.js';
import { reportWindowNameOf } from './reportWindow.js';
import { closeDay, nextDay, openEndless, openWeek, outcomeOf } from './week.js';
import { WEEK_CLOSED_LINE } from './weekStake.js';
import {
  DAY_START_S,
  WAKE_UP_ARRIVALS,
  WEEKDAYS,
  type DayReport,
  type Observations,
  type ShiftGoal,
} from './types.js';
import { readGoals } from './goals.js';
import { DAY_CALL_ROW_NOTE, type DayCallRecord } from './dayCalls.js';

/**
 * The week-day sheet, narrowed — and the narrowing is an assertion, not a cast.
 *
 * Every suite below except the shape suite is about figures, and a figure is the same value on
 * either sheet. Reaching those figures through a checked narrowing means a change that quietly
 * turned every sheet into a single run would fail here loudly rather than by a missing property.
 */
function weekDay(report: ShapedDayReport): WeekDayReport {
  if (report.of !== 'week-day') throw new Error(`expected a week-day sheet, got "${report.of}"`);
  return report;
}

function singleRun(report: ShapedDayReport): SingleRunReport {
  if (report.of !== 'single-run') throw new Error(`expected a single-run sheet, got "${report.of}"`);
  return report;
}

/**
 * What the day was set to run — issue #126's required field, held once so the suites below vary the
 * thing each of them is about.
 *
 * Every sheet in this file is a sheet of the same plan, which is what makes the comparability suite
 * in `dev/reportPanel.test.ts` able to vary one axis at a time: a plan differing case by case here
 * would make two sheets incomparable for a reason no test had chosen.
 */
const PLAN: ShiftPlan = { shiftLengthS: 900, windowStartS: null, patternId: 'building' };

/** The one selection the shape suite runs from. Free Play's own six axes, minus what the recording carries. */
const SELECTION = {
  demandTemplateId: 'rise-and-fall',
  arrivalRatePctPop5min: 12,
  durationS: 900,
} as const;

let config: LoadedConfig;
let clean: VizRecording;
let saturated: VizRecording;
/**
 * The run issue #53 was reported on, in the shape that produces it.
 *
 * Chancery House at 22 %pop/5min for thirty minutes files `saturated: false` and
 * `awtIsValid: true` — no refusal anywhere on the sheet — and still stacks a landing 43 deep
 * against day 4's bar of 26. It is the state the old code could not describe: not saturated, so the
 * headline took its healthy branch; a goal missed, so the banner said the shift was not cleared.
 *
 * A **real shipped configuration** rather than a hand-built summary, for the reason the saturation
 * fixture is one: the interesting failure is a run the simulator actually produces.
 */
let missedWithoutSaturating: VizRecording;

function runOf(buildingId: string, arrivalRatePctPop5min: number, durationS: number): VizRecording {
  const base: SimulationConfig = fixtureConfig(config, {
    buildingId,
    durationS,
    onTimeout: 'report',
  });
  return recordRun({ ...base, demand: { arrivalRatePctPop5min } }, { recordDecisions: false })
    .recording;
}

/** A report over a real recording, with the week already closed on it. */
function reportOf(
  recording: VizRecording,
  day = 4,
  calendar: CalendarPeriod | null = null,
): WeekDayReport {
  const observations = observationsOfRun(recording);
  const goals = goalsForDay(day);
  const opened = { ...openWeek('c2'), day, dayIdx: (day - 1) % 7 };
  const week = closeDay(
    opened,
    outcomeOf({
      record: null,
      recordRefusal: null,
      day,
      dayIdx: opened.dayIdx,
      /*
       * The wrinkle the day is dealt, so the fixture is a day of the week as it is dealt — since
       * § D1176 only such a day counts toward a census week's target (`weekStake.ts`).
       */
      eventId: eventFor(day, opened.dayIdx, 'whole-day').id,
      arrived: observations.arrived,
      carried: observations.carried,
      minutePct: observations.minutePct,
      readings: readGoals(goals, observations),
    }),
  );
  return weekDay(
    dayReportOf({
      recording,
      observations,
      goals,
      week,
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar,
      subject: { kind: 'week-day' },
    }),
  );
}

function figure(
  report: ShapedDayReport,
  id: string,
): { label: string; value: string; note: string; tone: string; axisOnly: boolean } {
  const found = report.figures.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no figure "${id}" on the sheet`);
  return found;
}

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  clean = runOf('garden-apartments', 12, 900);
  saturated = runOf('midtown-office', 25, 900);
  missedWithoutSaturating = runOf('chancery-house', 22, 1800);
}, 180_000);

describe('the premises this suite rests on', () => {
  it('has one run whose mean is publishable and one whose is not', () => {
    // Stated as a test rather than assumed, so a change in `core`'s saturation detector shows up
    // here as a premise failure rather than as a mysteriously passing honesty assertion.
    expect(clean.summary.awtIsValid && !clean.summary.saturated).toBe(true);
    expect(clean.legs.length).toBeGreaterThanOrEqual(20);
    expect(saturated.summary.saturated).toBe(true);
    expect(saturated.summary.awtIsValid).toBe(false);
    // The saturated run *has* a mean. That is the whole point: suppression is a refusal to print
    // a number that exists, not the absence of one.
    expect(Number.isFinite(saturated.summary.meanWaitS)).toBe(true);
    expect(saturated.summary.meanWaitS).toBeGreaterThan(100);
  });
});

describe('AVERAGE WAIT', () => {
  it('is summary.meanWaitS exactly, on a clean run', () => {
    const wait = figure(reportOf(clean), 'average-wait');
    expect(wait.value).toBe(`${clean.summary.meanWaitS.toFixed(1)} s`);
    expect(wait.tone).toBe('plain');
    // R13: the mean never travels without its `n` or its window.
    expect(wait.note).toContain(String(clean.summary.waitCount));
    expect(wait.note).toContain(`${reportWindowNameOf(clean.summary.reportWindow.id)} window`);
  });

  it('is never the mockup’s arithmetic', () => {
    // `28 + (100 − pct) × 0.9` — a number computed from a different quantity to look plausible.
    const report = reportOf(clean);
    const observations = observationsOfRun(clean);
    const mockup = Math.round(28 + (100 - observations.minutePct) * 0.9);
    expect(figure(report, 'average-wait').value).not.toBe(`${String(mockup)} s`);
  });

  it('is withheld on a saturated run, and carries the run’s own reason', () => {
    const wait = figure(reportOf(saturated), 'average-wait');
    expect(wait.value).toBe(WITHHELD);
    expect(wait.tone).toBe('withheld');
    expect(wait.note).toBe(saturated.summary.awtInvalidReason);
  });

  it('prints no number at all when it is withheld', () => {
    // Not "a smaller number" and not "a dash beside a number": the cell carries a word.
    expect(figure(reportOf(saturated), 'average-wait').value).not.toMatch(/\d/);
  });

  it('withholds on either ground, not only on saturation', () => {
    // `awtIsValid` has four grounds and `saturated` is carried separately. § 4.2 requires both to
    // hold before a mean is published, which is the conservative direction.
    const grounds: readonly Partial<VizSummary>[] = [
      { saturated: true, awtIsValid: true },
      { saturated: false, awtIsValid: false, awtInvalidReason: 'a leg waited 922.7 s' },
      { saturated: true, awtIsValid: false, awtInvalidReason: 'both' },
    ];
    for (const overrides of grounds) {
      expect(averageWaitFigure(fixtureSummary(overrides)).value).toBe(WITHHELD);
    }
    expect(averageWaitFigure(fixtureSummary()).value).toBe('12.0 s');
  });

  it('says something rather than nothing when the run gave no reason', () => {
    const noReason = averageWaitFigure(fixtureSummary({ saturated: true, awtIsValid: true }));
    expect(noReason.note.length).toBeGreaterThan(20);
  });

  it('numbers a one-leg denominator in the singular — docs/19 defect 8’s “over 1 legs”', () => {
    // A window can legitimately carry one served leg, and R13 makes the count part of what the
    // mean means — so its grammar is asserted, not left to luck.
    expect(averageWaitFigure(fixtureSummary({ waitCount: 1 })).note).toContain('over 1 ride in');
    expect(averageWaitFigure(fixtureSummary({ waitCount: 2 })).note).toContain('over 2 rides in');
  });
});

describe('the observations, which are never suppressed', () => {
  it('prints carried, the minute share, the deepest queue and the stairs on a saturated day', () => {
    // The day a reader most needs a figure is the day the building was outrun. Every one of these
    // is a count or a ratio of counts, so none of them is routed through `awtIsValid` (R9).
    const report = reportOf(saturated);
    const observations = observationsOfRun(saturated);
    expect(figure(report, 'carried').value).toBe(String(observations.carried));
    expect(figure(report, 'minute').value).toBe(`${String(observations.minutePct)}%`);
    expect(figure(report, 'deepest-queue').value).toBe(String(observations.peakQueue));
    expect(figure(report, 'stairs').value).toBe(String(observations.abandoned));
    for (const id of ['carried', 'minute', 'deepest-queue', 'stairs']) {
      expect(figure(report, id).value, id).not.toBe(WITHHELD);
    }
  });

  it('carries the served-leg denominator beside the minute share', () => {
    const report = reportOf(clean);
    expect(figure(report, 'minute').note).toContain(String(observationsOfRun(clean).servedLegs));
  });

  it('names the floor and the clock time the deepest queue stood at', () => {
    const observations = observationsOfRun(saturated);
    expect(observations.peakQueueFloorId).not.toBeNull();
    expect(observations.peakQueueAtS).not.toBeNull();
    const note = figure(reportOf(saturated), 'deepest-queue').note;
    expect(note).toContain(`floor ${String(observations.peakQueueFloorId)}`);
    expect(note).toContain(clockOf(observations.peakQueueAtS ?? 0));
  });

  it('says "never more than a handful" rather than inventing a floor when there was no queue', () => {
    const empty: Observations = {
      ...observationsOfRun(clean),
      peakQueue: 0,
      peakQueueFloorId: null,
      peakQueueAtS: null,
    };
    const report = dayReportOf({
      recording: clean,
      observations: empty,
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar: null,
      subject: { kind: 'week-day' },
    });
    expect(figure(report, 'deepest-queue').note).toBe('never more than a handful');
    expect(report.diagnosis[0]?.when).toBe('—');
  });

  it('says how many arrivals the deepest queue was the deepest of — R13 on the promoted cell', () => {
    const observations = observationsOfRun(saturated);
    // A figure travels with the count it was taken over, and every person on that landing is a leg
    // that arrived. The *at once* is the cohort caption: an instant, not a share of the day.
    const note = figure(reportOf(saturated), 'deepest-queue').note;
    expect(note).toContain(String(observations.arrived));
    expect(note).toContain('at once');
  });
});

/* -------------------------------------------------------------------------- *
 * The cell the sheet leads with — § D666
 * -------------------------------------------------------------------------- */

describe('the sheet names the cell it leads with, and a refusal does not take the lead — § D666', () => {
  /** The grid in declaration order, which is what a renderer that does not re-sort draws. */
  const gridIds = (report: ShapedDayReport): readonly string[] =>
    report.figures.map((cell) => cell.id);

  it('leads with a count of people on a day whose mean is published, and moves nothing', () => {
    const report = reportOf(clean);
    expect(meanIsPublishable(clean.summary)).toBe(true);
    expect(report.headlineFigureId).toBe('carried');
    // The Engineer order, untouched: naming the cell this list already began with is what makes
    // the promotion cost nothing on every day nothing was refused.
    expect(gridIds(report).slice(0, 6)).toEqual([
      'carried',
      'minute',
      'average-wait',
      'worst-wait',
      'deepest-queue',
      'stairs',
    ]);
  });

  it('leads with the tightest moment on a day whose mean is refused', () => {
    const report = reportOf(saturated);
    expect(meanIsPublishable(saturated.summary)).toBe(false);
    expect(report.headlineFigureId).toBe('deepest-queue');
    expect(gridIds(report)[0]).toBe('deepest-queue');
  });

  it('promotes a figure the run produced, with its count, and never an absence', () => {
    const observations = observationsOfRun(saturated);
    const lead = figure(reportOf(saturated), 'deepest-queue');
    expect(lead.value).toBe(String(observations.peakQueue));
    expect(Number(lead.value)).toBeGreaterThan(0);
    expect(lead.value).not.toBe(WITHHELD);
    expect(lead.value).not.toBe(NOT_RECORDED);
    // Its denominator, in its own note — the visual unit `honesty/surfaces.ts` reads `countShown`
    // off. Never `ReportFigure.count`, which is the sample a **mean** was taken over.
    expect(lead.note).toContain(String(observations.arrived));
    // Read off the grid rather than through `figure()`, which narrows away the field under test.
    const cell = reportOf(saturated).figures.find((entry) => entry.id === 'deepest-queue');
    expect(cell?.count).toBeUndefined();
  });

  it('is a count of people rather than anything a reader could take for the refused mean', () => {
    const lead = figure(reportOf(saturated), 'deepest-queue');
    // Not in seconds, and carrying none of the words `honesty/properties.ts#ESTIMATE_CUES` keys
    // the three suppressible quantities on. This is R3's collision, checked where it is made.
    expect(lead.value).not.toMatch(/\s*s$/u);
    for (const cue of [/\baverage\b/iu, /\bmean\b/iu, /\bawt\b/iu, /\btypical\b/iu, /\bpercentile\b/iu]) {
      expect(`${lead.label} ${lead.value} ${lead.note}`, String(cue)).not.toMatch(cue);
    }
    // And it is not a score, a grade or a rating: the cell's tone is the sheet's own queue-depth
    // bar, which is `hot` or `plain` and ranks this run against nothing.
    expect(['hot', 'plain']).toContain(lead.tone);
  });

  it('leaves the refusal exactly where a reader meets it, in full', () => {
    const report = reportOf(saturated);
    const wait = figure(report, 'average-wait');
    // Still on the grid, still refused, still `core`'s own words, still carrying its ground.
    expect(gridIds(report)).toContain('average-wait');
    expect(wait.value).toBe(WITHHELD);
    expect(wait.tone).toBe('withheld');
    expect(wait.note).toBe(
      saturated.summary.awtInvalidReason ??
        'the queues never settled, so there is no cohort to take a mean over — see the small print',
    );
    // Nothing on the sheet says the mean is available elsewhere, provisionally or otherwise.
    expect(wait.value).not.toContain(saturated.summary.meanWaitS.toFixed(1));
  });

  it('gives the lead back when the run produced no moment to promote', () => {
    /*
     * The fallback is not decoration. A refused run whose landings never held anybody draws
     * `DEEPEST QUEUE 0` under *never more than a handful* — a second absence — so promoting it
     * would be the defect this change closes, arriving through the remedy.
     */
    const noMoment: Observations = {
      ...observationsOfRun(saturated),
      peakQueue: 0,
      peakQueueFloorId: null,
      peakQueueAtS: null,
    };
    const report = dayReportOf({
      recording: saturated,
      observations: noMoment,
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar: null,
      subject: { kind: 'week-day' },
    });
    expect(meanIsPublishable(saturated.summary)).toBe(false);
    expect(report.headlineFigureId).toBe('carried');
    expect(gridIds(report)[0]).toBe('carried');
  });

  it('names a lead on a single run too, on the same gate', () => {
    // A Free Play run's mean is refused on exactly the five grounds a campaign day's is, so the
    // field is on both shapes rather than on the week's.
    const subject: ReportSubject = { kind: 'single-run', selection: SELECTION };
    const report = dayReportOf({
      recording: saturated,
      observations: observationsOfRun(saturated),
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: undefined,
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar: null,
      subject,
    });
    expect(singleRun(report).headlineFigureId).toBe('deepest-queue');
  });

  it('agrees with the cell that does the refusing, in both directions', () => {
    /*
     * One gate, read in one place — § D237's property stated as a test, so a second copy of the
     * conjunction cannot promote a stand-in on a day the mean was published, or leave the lead
     * alone on a day it was not.
     */
    for (const recording of [clean, saturated]) {
      const report = reportOf(recording);
      const refused = figure(report, 'average-wait').value === WITHHELD;
      expect(refused, recording.buildingId).toBe(!meanIsPublishable(recording.summary));
      // Both fixtures produce a moment, so the fallback arm is not in play here — the case above
      // drives that one. The lead is therefore the refusal's own answer and nothing else.
      expect(report.figures.find((cell) => cell.id === 'deepest-queue')?.value).not.toBe('0');
      expect(report.headlineFigureId, recording.buildingId).toBe(
        refused ? 'deepest-queue' : 'carried',
      );
    }
  });
});

describe('leadingWith is a permutation — the property, not the shipped ids', () => {
  /* § D134's fictional-schema technique: an id set no shipped sheet produces. */
  const cells = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as const;

  it('puts the named cell first and keeps every other one, in order', () => {
    expect(leadingWith(cells, 'c').map((cell) => cell.id)).toEqual(['c', 'a', 'b']);
  });

  it('returns the same members whatever it is asked for, including an id nothing carries', () => {
    for (const id of ['a', 'b', 'c', 'z', '']) {
      const out = leadingWith(cells, id);
      expect(out, id).toHaveLength(cells.length);
      expect([...out].sort((x, y) => x.id.localeCompare(y.id)), id).toEqual([...cells]);
    }
  });

  it('is the identity when the named cell is already first', () => {
    expect(leadingWith(cells, 'a')).toEqual([...cells]);
  });

  it('drops nothing from a real sheet, on either branch', () => {
    for (const recording of [clean, saturated]) {
      const report = reportOf(recording);
      const ids = [...report.figures.map((cell) => cell.id)].sort();
      // Every cell `figuresFor` builds is still on the grid; only the order moved.
      expect(new Set(ids).size, recording.buildingId).toBe(ids.length);
      for (const id of ['carried', 'minute', 'average-wait', 'worst-wait', 'deepest-queue', 'stairs']) {
        expect(ids, `${recording.buildingId}/${id}`).toContain(id);
      }
    }
  });
});

describe('TOOK THE STAIRS names its true cohort, and the people can be totalled — docs/19 defect 3', () => {
  /*
   * The audit's Midtown day 1: `CARRIED 768 of 768 who turned up` beside `TOOK THE STAIRS 348`
   * with a caption claiming a disjoint cohort — 1 116 people out of 768. The count is an
   * *attribute* (a wait that crossed the horizon), the overlap with CARRIED is real, and the note
   * now states it from `Observations.abandonedCarried`, the run's own split.
   */
  const withStairs = (overrides: Partial<Observations>): string => {
    const report = dayReportOf({
      recording: saturated,
      observations: { ...observationsOfRun(saturated), ...overrides },
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar: null,
      subject: { kind: 'week-day' },
    });
    return figure(report, 'stairs').note;
  };

  it('says the overlap outright when every horizon-crosser was still carried — the audit’s shape', () => {
    const note = withStairs({ abandoned: 348, abandonedCarried: 348 });
    expect(note).toContain('every one of them is inside CARRIED too');
    expect(note).toContain('overlap rather than add');
  });

  it('says the disjoint case as the gap in CARRIED’s own denominator', () => {
    const note = withStairs({ abandoned: 51, abandonedCarried: 0 });
    expect(note).toContain('never carried');
    expect(note).toContain('CARRIED’s');
  });

  it('splits a mixed day with the run’s own count on the carried side', () => {
    const note = withStairs({ abandoned: 10, abandonedCarried: 4 });
    expect(note).toContain('4 of them were still carried');
  });

  it('names the run’s own horizon, never a hard-coded fifteen minutes', () => {
    expect(withStairs({ abandoned: 3, abandonedCarried: 3, horizonS: 900 })).toContain('15-minute');
    expect(withStairs({ abandoned: 3, abandonedCarried: 3, horizonS: 600 })).toContain('10-minute');
    expect(withStairs({ abandoned: 0, abandonedCarried: 0 })).toContain('give-up horizon');
  });

  it('says which cohort it is over, in the idiom WORST WAIT already uses — issue #288', () => {
    /*
     * The two figures are folded over different populations and both are right: this cell counts
     * every leg, WORST WAIT counts the reporting window's arrivals, and no shipped template's
     * window spans its run. The sheet printed them four inches apart with only one saying so.
     *
     * The window id is read off the run rather than typed, so a day whose window is the whole of it
     * says that instead — which is a state `office-day` produces and this fixture does not.
     */
    const report = reportOf(saturated);
    const windowName = reportWindowNameOf(saturated.summary.reportWindow.id);
    expect(figure(report, 'stairs').note).toContain(
      `counted over the whole shift, not the ${windowName} window`,
    );
    /* WORST WAIT reads the whole shift too since § D1104; it says so in its own words. */
    expect(figure(report, 'worst-wait').note).toContain('whole shift');
  });

  it('names the riders the door turned away, and stays silent when there are none', () => {
    /*
     * The other half of issue #288, and the half that stops the fix from being a suppression.
     * `abandoned` no longer counts a rider refused at a credential check — on Secure Tower's own
     * authored day that took the cell from 72 to 0 — so the sheet has to say where those people
     * went, or a day that improved its wait figures by turning people away reads as a clean day.
     * `CLAUDE.md` refuses exactly that trade; § D266 publishes the outcome beside the wait figures.
     */
    const note = withStairs({ abandoned: 0, abandonedCarried: 0, turnedAway: 72 });
    expect(note).toContain('a further 72 never waited at all');
    expect(note).toContain('turned them away at a credential check');
    expect(note).toContain('not a slow one');
    // Silent where there is nothing to say, so every unzoned building's sheet is unchanged.
    expect(withStairs({ abandoned: 0, abandonedCarried: 0, turnedAway: 0 })).not.toContain(
      'credential',
    );
  });

  it('no surface on the sheet claims these riders left — the old wording is gone', () => {
    const report = reportOf(saturated);
    const everything = JSON.stringify(report);
    expect(everything).not.toContain('gave up and took the stairs');
    expect(everything).not.toContain('counted here and nowhere else');
  });

  /**
   * The two *stairs* cohorts may not share a phrase — `docs/20` defect 4, `docs/12` § 4.11.
   *
   * The left rail's fourth mood band and this cell were both called *taking the stairs*, on one
   * screen, with two different numbers under them (534 against 288) and the cell's own note saying
   * all 288 of the second cohort **were carried**. Both labels are derived here rather than
   * retyped — the cell's off a real report, the band's off `WAIT_BANDS` — so this fails if either
   * surface drifts back onto the other's words, which no assertion inside a single module could
   * catch.
   *
   * Compared on the distinctive phrase rather than on equality: *TOOK THE STAIRS* and *taking the
   * stairs* are not equal strings and were exactly the collision.
   */
  it('does not share its words with the rail’s fourth mood band', () => {
    const cellLabel = figure(reportOf(saturated), 'stairs').label.toLowerCase();
    const bandLabel = WAIT_BANDS[WAIT_BANDS.length - 1]?.label.toLowerCase() ?? '';

    expect(bandLabel).toContain('stairs');
    /*
     * And the cell no longer claims its cohort walked — the post-AH panel's H11. It counts waits
     * past the give-up line, every one of which may still have been carried, so *took the stairs*
     * was false on exactly the runs its own note said so; the word is the band's alone now.
     */
    expect(cellLabel).not.toContain('stairs');
    expect(cellLabel).toContain('give-up');
  });

  it('grounds the carry goal in arrivals including the horizon-crossers, so abandonment cannot flatter it', () => {
    /*
     * § D106's footing, asked of the carry bar: a rider who walks keeps their arrival (`VizLeg`
     * carries no `abandonedAt`) and can never enter `carried`, so the percentage moves down or
     * not at all when riders give up — unlike AWT, which abandonment improves by construction.
     * Driven on the real run rather than argued: the identity below is the accounting the sheet
     * now states in words.
     */
    const live = observationsAt(saturated, saturated.endedAt);
    const observations = shiftObservationsOf(live);
    expect(observations.carryPct).toBe(Math.round((live.carried / live.arrived) * 100));
    // The walkers-or-still-standing share of the stairs count fits inside CARRIED's shortfall…
    expect(observations.abandoned - observations.abandonedCarried).toBeLessThanOrEqual(
      observations.arrived - observations.carried,
    );
    // …and the overlap fits inside both cells it belongs to.
    expect(observations.abandonedCarried).toBeLessThanOrEqual(observations.abandoned);
    expect(observations.abandonedCarried).toBeLessThanOrEqual(observations.carried);
  });
});

describe('WORST WAIT states its censoring', () => {
  function reportWith(observations: Observations): ShapedDayReport {
    return dayReportOf({
      recording: clean,
      observations,
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar: null,
      subject: { kind: 'week-day' },
    });
  }

  it('reports the whole shift’s longest wait — the one the goal row grades', () => {
    const observations = observationsOfRun(clean);
    expect(figure(reportOf(clean), 'worst-wait').value).toBe(`${String(observations.worstWaitS)} s`);
  });

  it('says "at least" when the longest wait belongs to a rider who had not boarded', () => {
    const worst = figure(
      reportWith({ ...observationsOfRun(clean), worstWaitS: 640, worstWaitIsCensored: true }),
      'worst-wait',
    );
    expect(worst.value).toBe('at least 640 s');
    expect(worst.note).toContain('lower bound');
    expect(worst.note).toContain('whole shift');
  });

  /**
   * The post-AI panel's seat B, defect 6: the card read 178 s and the goal row 181 s on one sheet,
   * because the card was the reporting window's maximum and the goal the whole shift's. `docs/19`
   * defect 3 had labelled each where it stood; a newcomer still read two worst waits. § D1104: the
   * card is the goal's figure, and it is asserted equal to the goal row's own display on a run whose
   * window's worst differs from its shift's — or this would be watching nothing.
   */
  it('prints the goal row’s own figure, on a run whose window and shift disagree', () => {
    const observations = observationsOfRun(saturated);
    const windowWorst = saturated.summary.serviceLevel.longestWaitS;
    expect(windowWorst).not.toBeNull();
    expect(Math.round(windowWorst ?? 0)).not.toBe(observations.worstWaitS);
    const report = reportOf(saturated);
    const goal = readGoals(goalsForDay(4), observations).find((reading) => reading.goal.id === 'worst-wait');
    const cell = figure(report, 'worst-wait');
    expect(cell.value).toContain(String(observations.worstWaitS));
    if (goal !== undefined && goal.state !== 'pending') expect(cell.value).toBe(goal.display);
    expect(cell.note).not.toContain('window');
    /* The engine's id stays off the player's sheet — the post-AH panel's L3. */
    expect(cell.note).not.toContain(saturated.summary.reportWindow.id);
  });

  /**
   * **Every worst wait on the sheet is that one figure** — § D1148, the post-AJ panel's seats B
   * (H1, H2) and D (H4). § D1104 moved the card and left the *Weight fairness up* card reading the
   * reporting window's maximum (*one still waited 178 s* under a 181 s card) and the fold-out saying
   * the WORST WAIT figure was over the window. Asserted on a run whose window's worst is not its
   * shift's, so the lever quoting either would be told apart.
   */
  it('quotes the card’s figure on the lever card and puts it in the whole shift in the fold-out', () => {
    const base = observationsOfRun(clean);
    const shiftWorst = 181;
    expect(Math.round(clean.summary.serviceLevel.longestWaitS ?? 0)).not.toBe(shiftWorst);
    const report = reportWith({ ...base, worstWaitS: shiftWorst, worstWaitIsCensored: false, minutePct: 100 });
    expect(figure(report, 'worst-wait').value).toBe(`${String(shiftWorst)} s`);
    const lever = report.levers.find((entry) => entry.id === 'weight-fairness');
    expect(lever?.body).toContain(`one still waited ${String(shiftWorst)} s`);
    for (const match of JSON.stringify(report).matchAll(/waited (?:at least )?(\d+) s/gu)) {
      expect(match[1], match[0]).toBe(String(shiftWorst));
    }
    const clause = report.smallPrint.split(/;|\. /u).find((part) => part.includes('WORST WAIT')) ?? '';
    expect(clause).toContain('whole shift');
    expect(clause).not.toContain('window');
  });

  /*
   * § D1152, the post-AJ panel's seat B (U1): a day that raised no call said nothing about it.
   * The row is drawn from the session's account and only when no call row is.
   */
  it('says a day raised no call, in one row, only when the day had none', () => {
    const quiet = dayReportOf({
      recording: clean,
      observations: observationsOfRun(clean),
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar: null,
      subject: { kind: 'week-day' },
      dayCalls: [],
      dayCallsQuiet: { kind: 'asked', refused: 3, ending: 'finished' },
    });
    const rows = quiet.diagnosis.filter((row) => row.id === 'day-calls-none');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.why).toMatch(/^The stage raised no call today\. It ran the day ahead under each answer it could offer from 3 moments/u);
    /* No account from the shell, no row: a run nobody asked the stage about says nothing. */
    expect(reportWith(observationsOfRun(clean)).diagnosis.some((row) => row.id === 'day-calls-none')).toBe(false);
  });

  it('reads "not recorded" — never 0 s — when nobody called a lift', () => {
    expect(
      figure(reportWith({ ...observationsOfRun(clean), arrived: 0, carried: 0, worstWaitS: 0 }), 'worst-wait').value,
    ).toBe(NOT_RECORDED);
  });
});

describe('energy is an axis, never a score — § D106', () => {
  it('shows the total and the per-leg figure side by side, always both', () => {
    for (const recording of [clean, saturated]) {
      const report = reportOf(recording);
      const work = report.figures.find((cell) => cell.id === 'energy-work');
      const perLeg = report.figures.find((cell) => cell.id === 'energy-per-leg');
      expect(work).toBeDefined();
      expect(perLeg).toBeDefined();
      // "workPerServedLegKJ is present whenever workKJ is", as a biconditional.
      expect(work === undefined).toBe(perLeg === undefined);
    }
  });

  it('never ranks either of them', () => {
    const report = reportOf(clean);
    for (const id of ['energy-work', 'energy-per-leg']) {
      expect(figure(report, id).tone, id).toBe('unranked');
      expect(figure(report, id).axisOnly, id).toBe(true);
    }
  });

  it('marks nothing else as an axis, and puts an energy unit on nothing else', () => {
    // The aggregation guard: no figure outside the pair carries kilojoules, so nothing on the
    // sheet can be a wait and an energy folded together.
    const report = reportOf(clean);
    for (const cell of report.figures) {
      if (cell.id.startsWith('energy-')) continue;
      expect(cell.axisOnly, cell.id).toBe(false);
      expect(cell.value, cell.id).not.toContain('kJ');
    }
    expect(report.figures.filter((cell) => cell.axisOnly)).toHaveLength(2);
  });

  it('reads "not recorded" — never 0 kJ — when the run measured no travel', () => {
    const unmeasured = fixtureSummary({
      energy: {
        measured: false,
        workKJ: null,
        workPerServedLegKJ: null,
        deliveredLegCount: 0,
        distanceM: null,
        starts: null,
      },
    });
    const report = dayReportOf({
      recording: { ...clean, summary: unmeasured },
      observations: observationsOfRun(clean),
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar: null,
      subject: { kind: 'week-day' },
    });
    expect(figure(report, 'energy-work').value).toBe(NOT_RECORDED);
    expect(figure(report, 'energy-per-leg').value).toBe(NOT_RECORDED);
  });

  it('carries the per-leg figure’s denominator, which is R13', () => {
    expect(figure(reportOf(clean), 'energy-per-leg').note).toContain(
      String(clean.summary.energy.deliveredLegCount),
    );
  });

  /* ---------------------------------------------------------------------- *
   * The axis a player may put away — GitHub issue #70
   * ---------------------------------------------------------------------- */

  /** The sheet, with the energy preference answered either way. */
  const sheetWith = (showEnergyAxis: boolean | undefined): ShapedDayReport =>
    dayReportOf({
      recording: clean,
      observations: observationsOfRun(clean),
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar: null,
      subject: { kind: 'week-day' },
      ...(showEnergyAxis === undefined ? {} : { showEnergyAxis }),
    });

  it('takes the pair off the sheet when the reader has put the axis away', () => {
    /*
     * **Move the control and require the rendering to change** — § D230's form of the standing
     * requirement, for a control that configures a *disclosure* rather than a run. § D250 measured
     * the old state: with a run on screen the whole shell's text was **byte-identical** with this
     * switch on and off, because its only consumer chain ended at `parityRefusal`, a string that is
     * empty whenever parity holds. This is the first surface it moves.
     */
    const shown = sheetWith(true).figures.map((cell) => cell.id);
    const hidden = sheetWith(false).figures.map((cell) => cell.id);
    expect(shown, 'the sheet no longer publishes the energy pair at all').toContain('energy-work');
    expect(hidden, 'the switch was moved and the sheet did not change').not.toEqual(shown);
  });

  it('takes both or neither, never one of the two — § D106', () => {
    /*
     * The pair is the axis. `workPerServedLegKJ` without `workKJ` is a per-leg efficiency with
     * nothing to read it against, which is exactly the score this project refuses — a configuration
     * that spends less by serving fewer people has not saved anything.
     */
    const hidden = sheetWith(false).figures;
    expect(hidden.filter((cell) => cell.id.startsWith('energy-'))).toEqual([]);
    expect(hidden.filter((cell) => cell.axisOnly)).toEqual([]);
  });

  it('takes nothing else off the sheet with it', () => {
    // The other direction. A preference about one axis that quietly dropped a wait figure would be
    // the suppression `docs/10` R3 forbids, wearing a settings row.
    const shown = sheetWith(true).figures.map((cell) => cell.id);
    const hidden = sheetWith(false).figures.map((cell) => cell.id);
    expect(hidden).toEqual(shown.filter((id) => !id.startsWith('energy-')));
  });

  it('shows the axis to a caller that has no player to ask', () => {
    /*
     * `DEFAULT_SETTINGS.showEnergyAxis` is `false` and this default is **show**, which is
     * `DEFAULT_RUN_SUMMARY_OPTIONS`' rule and its argument verbatim: the honesty sweep and the
     * acceptance suites are describing a run rather than serving a preference, and a run description
     * that dropped an axis because a menu somewhere defaults it off would be the honesty search
     * measuring a surface the product does not show.
     */
    expect(sheetWith(undefined).figures.map((cell) => cell.id)).toEqual(
      sheetWith(true).figures.map((cell) => cell.id),
    );
  });
});

describe('where it went wrong is derived from the run', () => {
  it('prints no clock time the run did not have', () => {
    // The mockup hard-codes 08:30 and 17:20. Every `when` here is either the em dash or a time
    // inside the run's own span.
    for (const recording of [clean, saturated]) {
      const report = reportOf(recording);
      const inside = new Set<string>();
      for (let t = recording.startedAt; t <= recording.endedAt; t += 30) inside.add(clockOf(t));
      inside.add(clockOf(recording.endedAt));
      for (const row of report.diagnosis) {
        if (row.when === '—') continue;
        for (const part of row.when.split('–')) {
          expect(inside.has(part), `${row.id}: ${part} is outside the run`).toBe(true);
        }
      }
      expect(report.diagnosis.map((row) => row.when)).not.toContain('08:30');
      expect(report.diagnosis.map((row) => row.when)).not.toContain('17:20');
    }
  });

  it('names the demand phase the worst moment fell in', () => {
    const report = reportOf(saturated);
    const phaseRow = report.diagnosis.find((row) => row.id === 'peak-phase');
    expect(phaseRow).toBeDefined();
    const labels = saturated.demandPhases.map((phase) => phase.label);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((label) => phaseRow?.what.includes(label) === true)).toBe(true);
  });

  it('invents no phase for a recording that carries no schedule', () => {
    // § 4.1: empty `demandPhases` is a legal value (a recording written before version 7), and the
    // sheet says so rather than drawing an office day this simulator never ran.
    const report = dayReportOf({
      recording: { ...clean, demandPhases: [] },
      observations: observationsOfRun(clean),
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar: null,
      subject: { kind: 'week-day' },
    });
    const phaseRow = report.diagnosis.find((row) => row.id === 'peak-phase');
    expect(phaseRow?.when).toBe('—');
    expect(phaseRow?.what).toContain('no demand schedule');
  });

  it('names the reporting window in the small print, and not as an incident — issue #56', () => {
    /*
     * The row was word-for-word identical on a flawless day and a collapsed one, only the timestamps
     * moved, and nothing happened at the clock time it carried. Both halves are asserted: it is gone
     * from the timeline, and it is *still said*, because the scope of every cohort figure is not
     * optional information. Moving a caveat out of sight would be the R3 failure this sheet is about.
     */
    for (const recording of [clean, saturated, missedWithoutSaturating]) {
      const report = reportOf(recording);
      expect(report.diagnosis.map((row) => row.id)).not.toContain('report-window');
      expect(report.smallPrint).toContain(reportWindowNameOf(recording.summary.reportWindow.id));
      expect(report.smallPrint).not.toContain(`${recording.summary.reportWindow.id} window`);
      expect(report.smallPrint).toContain(clockOf(recording.summary.reportWindow.startS));
      /*
       * `docs/20` defect 5. This used to pin *during the busiest five minutes*, and the phrase was
       * a claim the sheet could not support: `summary.reportWindow` is labelled `peak-5min`
       * whenever it is 300 s long, and the shift path only ever produced the **demand template's
       * declared band**, not the busiest five minutes by arrivals. On Garden Apartments the band
       * held **zero** of the day's arrivals on 14 of 500 seeds, and the sheet went on calling it
       * the busiest.
       *
       * What replaces it refers to the span the sentence has already printed rather than
       * characterising it — and the *absence* is pinned as hard as the presence, because a
       * superlative reappearing here is the whole defect.
       */
      expect(report.smallPrint).toContain('during that window');
      expect(report.smallPrint).not.toContain('busiest');
    }
  });

  /**
   * The whole-shift rows say they are whole-shift rows — `docs/20` defect 6.
   *
   * The sheet publishes two windows and named neither on the rows: *the tightest moment* and *the
   * worst of it* are the whole shift's deepest queue and the phase it fell in, while the figure
   * grid four inches up quotes means over `summary.reportWindow`. On the audit's Chancery day those
   * were 08:50 and 08:42–08:47.
   *
   * Both arms are asserted from the run's own numbers rather than from a snapshot of the words,
   * because the clause states *which case this run is in* — see `windowRelationClause`. The
   * predicate here is the same comparison the product makes, written out, so a run that stops being
   * one case fails rather than quietly reading the other's sentence.
   */
  it('says on both diagnosis rows whether the worst moment is inside the window the means used', () => {
    for (const recording of [clean, saturated, missedWithoutSaturating]) {
      const report = reportOf(recording);
      const observations = observationsOfRun(recording);
      const at = observations.peakQueueAtS;
      if (at === null) continue;
      const window = recording.summary.reportWindow;
      const inside = at >= window.startS && at < window.endS;

      for (const id of ['peak-queue', 'peak-phase']) {
        const row = report.diagnosis.find((entry) => entry.id === id);
        expect(row?.why).toContain(`${reportWindowNameOf(window.id)} window the means above are read over`);
        expect(row?.why?.includes('That instant is inside')).toBe(inside);
        expect(row?.why?.includes('two different parts of it')).toBe(!inside);
      }
    }
  });

  it('reconciles the two windows in the small print as well as on the rows', () => {
    // A reconciliation that lives only on the thing being reconciled is not one: this is the
    // paragraph a reader goes to when the heading and the figure grid disagree.
    const smallPrint = reportOf(saturated).smallPrint;
    expect(smallPrint).toContain('read the whole shift too');
    expect(smallPrint).toContain('need not be inside the window the means came from');
  });

  it('files only rows that are events, on every run', () => {
    /*
     * Where the deepest queue stood and the phase it stood in, on every run — and on a missed day,
     * one row per missed goal first, in the goal table's order, with the queue row standing in for
     * the landing-queue goal (§ D983). The expected list is derived from the sheet's own goal lines,
     * so a run that misses a different goal fails here rather than reading another run's shape.
     */
    for (const recording of [clean, saturated, missedWithoutSaturating]) {
      const report = reportOf(recording);
      const missed =
        report.verdict === 'missed'
          ? report.goals
              .filter((line) => line.reading.state === 'missed')
              .map((line) => (line.reading.goal.reads === 'peakQueue' ? 'peak-queue' : `missed-${line.reading.goal.id}`))
          : [];
      const expected = [...missed, ...(missed.includes('peak-queue') ? [] : ['peak-queue']), 'peak-phase'];
      expect(report.diagnosis.map((row) => row.id)).toEqual(expected);
    }
  });

  it('opens a missed day on the goal it missed, never on a queue that passed its bar — #596', () => {
    /*
     * The assessor's Crown Hotel day: missed on a 311 s worst wait, headed *Where it went wrong* over
     * *Floor G stacked 14 deep* — a landing inside its bar of 32, drawn red. § D983. The first row of
     * a missed sheet names a goal that was missed, and the queue row is red only when the
     * landing-queue goal is.
     */
    let sawMissedDay = false;
    for (const recording of [clean, saturated, missedWithoutSaturating]) {
      const report = reportOf(recording);
      const queueLine = report.goals.find((line) => line.reading.goal.reads === 'peakQueue');
      const queueRow = report.diagnosis.find((row) => row.id === 'peak-queue');
      expect(queueRow?.tone === 'bad', recording.buildingId).toBe(
        report.verdict === 'missed' && queueLine?.reading.state === 'missed',
      );
      // The fixed cause is gone, on every run: the row says what this run's calls did instead.
      expect(queueRow?.why).not.toContain('committed elsewhere');
      if (report.verdict !== 'missed') continue;
      sawMissedDay = true;
      const first = report.diagnosis[0];
      const missedIds = report.goals
        .filter((line) => line.reading.state === 'missed')
        .map((line) => (line.reading.goal.reads === 'peakQueue' ? 'peak-queue' : `missed-${line.reading.goal.id}`));
      expect(missedIds).toContain(first?.id);
      expect(first?.tone).toBe('bad');
    }
    expect(sawMissedDay, 'some fixture run misses, or the case checks nothing').toBe(true);
  });

  it('gives every missed goal’s row its cohort, and names the goal and its bar', () => {
    for (const recording of [saturated, missedWithoutSaturating]) {
      const report = reportOf(recording);
      for (const row of report.diagnosis.filter((entry) => entry.id.startsWith('missed-'))) {
        const goal = report.goals.find((line) => `missed-${line.reading.goal.id}` === row.id)?.reading.goal;
        expect(goal, row.id).toBeDefined();
        expect(row.why).toContain(`asked for`);
        expect(row.why).toContain(String(goal?.bar));
        // A share names what it is a share of — R13 on a row the corpus now reads.
        if (row.what.includes('%')) expect(row.what).toMatch(/\d+ (people|of)/u);
      }
    }
  });

  it('flags nothing on a day the sheet says nothing went wrong — issue #56', () => {
    /*
     * `diagnosisRowsOf` in the panel draws a row's left rule from its tone, so an unconditional
     * `bad` painted a nine-deep landing on a cleared day in the same red as an 892-deep one on a
     * collapsed day. The tone follows the verdict, which is the value the banner and the heading
     * come from — so the section cannot flag a fault on a sheet that says there was none.
     */
    const cleared = reportOf(clean);
    expect(cleared.verdict).toBe('cleared');
    expect(cleared.diagnosisHeading).toBe('The tightest moment');
    expect(cleared.diagnosisHeading.toLowerCase()).not.toContain('wrong');
    for (const row of cleared.diagnosis) expect(row.tone, row.id).toBe('plain');

    const missed = reportOf(missedWithoutSaturating);
    expect(missed.verdict).toBe('missed');
    expect(missed.diagnosisHeading).toBe('Where it went wrong');
    expect(missed.diagnosis.some((row) => row.tone === 'bad')).toBe(true);
  });
});

describe('the rest of the sheet', () => {
  it('titles the day and meta-lines the run’s own seed and span', () => {
    const report = reportOf(clean, 2);
    expect(report.title).toBe('Tuesday — day 2');
    expect(report.metaLines[0]).toContain(clean.buildingName);
    expect(report.metaLines[1]).toContain(`seed ${clean.seed}`);
    expect(report.metaLines[1]).toContain('one replication');
    // Not the handoff's fixed 06:00–22:00 ruler. § 4.1.
    expect(report.metaLines[1]).toContain(clockOf(clean.endedAt));
    expect(report.metaLines[1]).not.toContain('22:00');
  });

  it('names what was booked against today, and does not confuse it with tomorrow', () => {
    /*
     * `DayReportInput.event` had no reader at all. The forecast card names *tomorrow's* event,
     * derived independently through `eventFor(day + 1, …)`, and today's appeared nowhere — so a
     * sheet for a move-in day described the figures and never mentioned the derated car that shaped
     * them. Every line was true and the account was missing its subject.
     */
    const report = weekDay(
      dayReportOf({
        recording: clean,
        observations: observationsOfRun(clean),
        goals: goalsForDay(4),
        week: { ...openWeek('c2'), day: 4, dayIdx: 3 },
        contract: contractById('c2'),
        event: SHIFT_EVENTS['move-in'],
        plan: PLAN,
        calendar: null,
        subject: { kind: 'week-day' },
      }),
    );
    const meta = report.metaLines.join('\n');
    expect(meta).toContain(SHIFT_EVENTS['move-in'].name);
    expect(meta).toContain(SHIFT_EVENTS['move-in'].note);
    // The negative control that makes the assertion mean something: the field is *read*, not a
    // second derivation of the same schedule. Day 4's own `eventFor` is not move-in, so a sheet
    // that recomputed instead of reading would show a different event here.
    expect(SHIFT_EVENTS['move-in'].name).not.toBe(report.forecast.name);
  });

  it('books nothing against a single run, because there is no week to book it against', () => {
    // A single-run sheet naming an event would be claiming the run had one — and `enterFreePlay`
    // resets the week precisely so it does not.
    const meta = dayReportOf({
      recording: clean,
      observations: observationsOfRun(clean),
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS['move-in'],
      plan: PLAN,
      calendar: null,
      subject: { kind: 'single-run', selection: SELECTION },
    }).metaLines.join('\n');
    expect(meta).not.toContain(SHIFT_EVENTS['move-in'].name);
  });

  it('carries the intervention log, one line per press in time order — docs/19 defect 10', () => {
    /*
     * The audit's finding: the stamp lived only on the stage, so the filed sheet of an intervened
     * day was indistinguishable from an untouched one. The lines are `interventionLogOf`'s — the
     * stage stamp's own verbs and clock — so this asserts the exact sentence the stage showed,
     * with the log handed over out of order to prove the sheet holds *in time order* itself.
     */
    const sheet = (interventions: DayReportInput['interventions']): readonly string[] =>
      dayReportOf({
        recording: clean,
        observations: observationsOfRun(clean),
        goals: goalsForDay(4),
        week: openWeek('c2'),
        contract: contractById('c2'),
        event: SHIFT_EVENTS.ordinary,
        plan: PLAN,
        calendar: null,
        subject: { kind: 'week-day' },
        interventions,
      }).metaLines;
    const meta = sheet([
      { atS: 2 * 3600, change: { kind: 'park-cars-lobby' } },
      { atS: 30 * 60, change: { kind: 'park-cars-lobby' } },
    ]);
    // 06:00 + 0:30 and 06:00 + 2:00, restored to time order.
    const stamps = meta.filter((line) => line.includes('parked the cars in the lobby'));
    expect(stamps).toEqual([
      '06:30 · parked the cars in the lobby',
      '08:00 · parked the cars in the lobby',
    ]);
    // An untouched day prints nothing — no placeholder line, and an absent key is the empty log
    // (core's own contract, `sim/interventions.test.ts`).
    expect(sheet(undefined).some((line) => line.includes('parked'))).toBe(false);
    expect(sheet(undefined)).toEqual(sheet([]));
  });

  it('names the rules the run was driven by, in the editor’s own readback — docs/20 defect 2', () => {
    /*
     * The audit's finding: a rule governed the run, the stage header named it live for forty
     * minutes, and the filed sheet said *"Midtown Office · Conventional collective"* with the word
     * **rule** on it zero times. `docs/19` defect 10 exactly, on the mechanism that landed after it
     * was fixed.
     *
     * Asserted through `readbackOf` rather than against a typed literal, because the claim is that
     * the sheet, the editor's readback and the stage pill are three renderings of **one** producer.
     * A literal here would pass on the day somebody rewrote the readback and left the sheet behind,
     * which is the disagreement the shared producer exists to prevent.
     */
    const sheet = (ruleRows: DayReportInput['ruleRows']): readonly string[] =>
      dayReportOf({
        recording: clean,
        observations: observationsOfRun(clean),
        goals: goalsForDay(4),
        week: openWeek('c2'),
        contract: contractById('c2'),
        event: SHIFT_EVENTS.ordinary,
        plan: PLAN,
        calendar: null,
        subject: { kind: 'week-day' },
        dispatcherName: 'Conventional collective',
        ruleRows,
      }).metaLines;

    const rows: readonly RuleRow[] = [
      { when: 'lobby-queue-passes', whenValue: 30, then: 'hold-at-lobby' },
      { when: 'call-waited', whenValue: 30, then: 'jump-queue' },
    ];
    const meta = sheet(rows);
    expect(meta).toContain(`rule 1 · ${readbackOf(rows[0] as RuleRow)}`);
    expect(meta).toContain(`rule 2 · ${readbackOf(rows[1] as RuleRow)}`);
    // The ordinals are the first-match order the engine reads them in, not a set.
    expect(meta.findIndex((line) => line.startsWith('rule 1'))).toBeLessThan(
      meta.findIndex((line) => line.startsWith('rule 2')),
    );
    // And the relationship to the dispatcher on the identity line above, stated once, under the
    // list — the question a sheet naming both otherwise leaves a reader holding.
    expect(meta).toContain(fallbackLineOf('Conventional collective'));

    // A day with no rules prints nothing: no ordinal, no fallback line, no caption over nothing.
    expect(sheet(undefined).some((line) => line.startsWith('rule '))).toBe(false);
    expect(sheet(undefined).some((line) => line.includes('If no rule fits'))).toBe(false);
    expect(sheet(undefined)).toEqual(sheet([]));
  });

  it('carries the log on a single run too — a free-play day can be intervened in', () => {
    const meta = dayReportOf({
      recording: clean,
      observations: observationsOfRun(clean),
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar: null,
      subject: { kind: 'single-run', selection: SELECTION },
      interventions: [{ atS: 30 * 60, change: { kind: 'park-cars-lobby' } }],
    }).metaLines;
    expect(meta).toContain('06:30 · parked the cars in the lobby');
  });

  it('clears the shift when every goal was met', () => {
    const report = reportOf(clean);
    expect(report.goals.every((line) => line.reading.state === 'met')).toBe(true);
    expect(report.verdict).toBe('cleared');
    expect(report.verdictLine).toBe('Shift cleared');
  });

  it('misses the shift on the day the building was outrun', () => {
    const report = reportOf(saturated);
    expect(report.verdict).toBe('missed');
    expect(report.streakLine).toContain('nothing here is a game over');
  });

  it('carries the four levers verbatim on a day that points at none of them', () => {
    // The handoff's own four, in the handoff's own order, with the handoff's own sentences. That is
    // what a run with nothing to point at gets, and it is the control the run-derived cases below
    // are measured against.
    const report = reportOf(clean);
    expect(report.verdict).toBe('cleared');
    expect(report.levers.map((lever) => lever.title)).toEqual([
      'Add a car',
      'Zone the tower',
      'Weight fairness up',
      'Ask where they’re going',
    ]);
    for (const lever of report.levers) {
      expect(lever.body, lever.id).not.toContain('Today points here');
    }
  });

  it('forecasts tomorrow’s event and the growth it really applies', () => {
    // The design prints a flat "+11%". Growth is linear (`1 + 0.11 × (day − 1)`), so at day 4
    // tomorrow is 1.44/1.33 − 1 = 8.3 % busier than today, not 11 % — and a number on a forecast
    // card is a claim.
    const report = reportOf(clean, 4);
    // The event is read off the draw rather than named — GitHub issue #159. It was `fire-drill`
    // under the `day % 5` rota; § 17's rotation draw picks from `data/wrinkles.json` and this case
    // is about the growth figure, not about which wrinkle tomorrow is.
    expect(report.forecast.name).toBe(eventFor(5, 4).name);
    expect(report.forecast.demand).toBe('+8.3% more tenants than today');
    expect(report.forecast.demand).not.toContain('+11');
    expect(report.nextDayName).toBe('Friday');
  });

  /*
   * GitHub issue #135 — the card named the event the ordinary schedule would give, and the run
   * would be built from the calendar's override.
   *
   * `moving-week` is the period the issue names and it is the right one to drive: it books
   * `move-in` on six of its seven days, so the patched and unpatched answers differ wherever the
   * schedule was not already going to say `move-in`. An ordinary week passes against the bug, which
   * is why every case here carries a period.
   */
  describe('the Tomorrow card names the event the next run will be under — issue #135', () => {
    const movingWeek = CALENDAR_PERIODS['moving-week'];

    it('names the period’s event, not the schedule’s, where the two disagree', () => {
      /*
       * Today is Thursday, day 4; tomorrow is Friday, day 5. The period books a `move-in` and the
       * run tomorrow gets is built from the period rather than from the week.
       *
       * What day 5's *own* draw is stopped being this case's business at GitHub issue #159 — it was
       * `fire-drill` because `5 % 5 === 0` was the drill slot, and § 17's draw does not work that
       * way. What the case needs is that the two genuinely disagree, so that is what it asserts.
       */
      expect(eventFor(5, 4).id, 'the week already draws the move-in the period books').not.toBe(
        'move-in',
      );
      const report = reportOf(clean, 4, movingWeek);
      expect(report.forecast.name).toBe(SHIFT_EVENTS['move-in'].name);
      expect(report.forecast.note).toBe(SHIFT_EVENTS['move-in'].note);
      // The negative control that makes the assertion mean something: the card is not simply
      // printing whatever it was handed for *today*, which is `ordinary` on this fixture.
      expect(report.forecast.name).not.toBe(SHIFT_EVENTS.ordinary.name);
    });

    it('agrees with the run tomorrow will actually be built from, on every day of the period', () => {
      /*
       * The card against `shift/calendar.ts#scheduledEventFor` — the same expression
       * `dev/state.ts#shiftRunConfigOf` builds the run from — on all seven days rather than on the
       * one this suite happens to like. A card that agreed on day 4 and nowhere else would pass the
       * case above.
       */
      for (const day of [1, 2, 3, 4, 5, 6, 7]) {
        /*
         * Tomorrow as `dev/state.ts` plans it: `nextDay` of today's week, which on a census tower's
         * last day is day 1 of a new week (§ D1177) rather than day 8.
         */
        const tomorrow = nextDay({ ...openWeek('c2'), day, dayIdx: (day - 1) % 7 });
        const willRun = scheduledEventFor(movingWeek, tomorrow.day, tomorrow.dayIdx);
        expect(reportOf(clean, day, movingWeek).forecast.name, `day ${String(day)}`).toBe(
          willRun.name,
        );
      }
    });

    it('hands the week back on a day the period names no event — the Sunday override', () => {
      /*
       * `moving-week`'s Sunday override sets `eventId: null` because the movers do not work Sunday,
       * and the week's own schedule is meant to stand. So today Saturday day 6 forecasts a Sunday
       * that is `weekend` on **both** derivations — a case where patched and unpatched agree, and
       * the one that would break if `null` were read as *no event* rather than as *not this
       * period's to say*.
       */
      const report = reportOf(clean, 6, movingWeek);
      // The week's own Sunday draw, whichever weekend wrinkle that is — issue #159. Naming
      // `weekend` pinned one of five weekend templates and the point is the fallback, not the row.
      expect(report.forecast.name).toBe(eventFor(7, 6).name);
      expect(report.nextDayName).toBe('Sunday');
    });

    it('leaves an ordinary week exactly where it was', () => {
      // The regression guard. `null` is *no calendar*, and the card's answer must be byte-identical
      // to the one it gave before the period could reach it.
      expect(reportOf(clean, 4, null).forecast).toEqual(reportOf(clean, 4).forecast);
      expect(reportOf(clean, 4, null).forecast.name).toBe(eventFor(5, 4).name);
    });
  });

  it('prints the small print, naming this run’s dispatcher', () => {
    const report = reportOf(clean);
    expect(report.smallPrint).toContain('one replication of one day on one seed');
    expect(report.smallPrint).toContain('50 or more paired runs');
    expect(report.smallPrint).toContain('confidence interval that excludes zero');
    expect(report.smallPrint).toContain(clean.dispatcherProfileId.toLowerCase());
  });

  it('closes a census week on its last day, points at its sheet and forecasts a new week — § D1177', () => {
    const sunday = reportOf(clean, 7);
    expect(sunday.taught).toBe(WEEK_CLOSED_LINE);
    expect(sunday.forecast.demand).toMatch(/^A new week: the tower as handed, \d+\.\d% fewer tenants than today$/u);
    expect(sunday.nextDayName).toBe('Monday');
    // Saturday closes a day and not the week.
    expect(reportOf(clean, 6).taught).not.toBe(WEEK_CLOSED_LINE);
    expect(reportOf(clean, 6).forecast.demand).toMatch(/^\+\d+\.\d% more tenants than today$/u);
  });

  it('says what is banked, and what is left to bank', () => {
    const report = reportOf(clean);
    /*
     * **The position is derived, not pinned.** This read `Scenario 4` — true after issue #382
     * re-ordered the ladder by measured day-1 difficulty, and false again when GitHub issue #500
     * inserted `c9` above `c2`. A `label` is a *position*, so a literal here is a fact about the
     * length of the array in front of this contract, and the line under test is the one the sheet
     * draws from the contract itself. Asserting the derivation keeps the claim — *the sheet names
     * the scenario you are on* — and drops the part of it that was never the point.
     */
    expect(report.contractLine).toContain(`${contractById('c2')?.label ?? ''} — The morning rush`);
    expect(report.contractLine).toContain('clean shifts banked');
    // Midtown's census target is four since § D1180 counted its Tuesday and Friday.
    expect(report.taught).toContain('Bank 3 more clean shifts');
  });

  it('never claims more banked than the contract asks — SC-05/DR-09', () => {
    // Driven 2026-07-30 (§ D198): cleanRun keeps counting on a contract already cleared, so the
    // sheet could read "2 of 1 clean shifts banked". Display clamp only; the week keeps its count.
    const report = weekDay(
      dayReportOf({
        recording: clean,
        observations: observationsOfRun(clean),
        goals: goalsForDay(4),
        week: { ...openWeek('c2'), cleanRun: 5 },
        contract: contractById('c2'),
        event: SHIFT_EVENTS.ordinary,
        plan: PLAN,
        calendar: null,
        subject: { kind: 'week-day' },
      }),
    );
    expect(report.contractLine).toContain('4 of 4 clean shifts banked');
    expect(report.contractLine).not.toContain('5 of');
  });

  it('stops asking for zero more clean shifts once the scenario stands cleared — docs/19 defect 9', () => {
    /*
     * The audit's repro: `week.cleared` is the banner of the day that earned it and `nextDay`
     * clears it on purpose, so every later day on a cleared scenario fell through to *"Bank 0 more
     * clean shifts on this building and the next assignment opens"*. The branch's condition is
     * `contractStatus` — `week.completed`, the same expression the scenario card reads and the one
     * `closeDay`'s clearing guard negates — so this case drives the exact state the audit saw: the
     * contract in `completed`, the banner gone.
     */
    const report = weekDay(
      dayReportOf({
        recording: clean,
        observations: observationsOfRun(clean),
        goals: goalsForDay(4),
        week: { ...openWeek('c2'), cleanRun: 2, completed: ['c2'], cleared: null },
        contract: contractById('c2'),
        event: SHIFT_EVENTS.ordinary,
        plan: PLAN,
        calendar: null,
        subject: { kind: 'week-day' },
      }),
    );
    expect(report.taught).not.toContain('Bank 0 more');
    expect(report.taught).toContain('already cleared');
    // The reward is restated as standing open rather than promised again as next.
    expect(report.taught).toContain(contractById('c2')?.reward ?? '');
    // And the day that earns the clear still gets the banner's own sentence, not this one.
    const clearedDay = weekDay(
      dayReportOf({
        recording: clean,
        observations: observationsOfRun(clean),
        goals: goalsForDay(4),
        week: {
          ...openWeek('c2'),
          cleanRun: 2,
          completed: ['c2'],
          cleared: { contractId: 'c2', reward: contractById('c2')?.reward ?? '', nextContractId: 'c3', nextTitle: 'x' },
        },
        contract: contractById('c2'),
        event: SHIFT_EVENTS.ordinary,
        plan: PLAN,
        calendar: null,
        subject: { kind: 'week-day' },
      }),
    );
    expect(clearedDay.taught).toContain('Cleared:');
  });

  it('grades a reader’s own building without pretending it banks anything', () => {
    const report = weekDay(
      dayReportOf({
        recording: clean,
        observations: observationsOfRun(clean),
        goals: goalsForDay(4),
        week: openWeek('c2'),
        contract: undefined,
        event: SHIFT_EVENTS.ordinary,
        plan: PLAN,
        calendar: null,
        subject: { kind: 'week-day' },
      }),
    );
    expect(report.contractLine).toContain('nothing is being banked');
    expect(report.taught).toContain('Nothing banks here');
  });

  it('does not call an endless week the reader’s own building', () => {
    /*
     * Two ways to have no contract, one code path, two sentences.
     *
     * `openEndless` reuses the unknown-contract path deliberately — a sentinel id rather than a type
     * change, so no consumer needed a new branch. Reusing the *wording* would have been the cost of
     * that: a player who pressed **Keep going** on Midtown Office told they are on their own
     * building, which is false in the one way a reader acts on — they go looking for the scenario
     * they think they lost.
     */
    const report = weekDay(
      dayReportOf({
        recording: clean,
        observations: observationsOfRun(clean),
        goals: goalsForDay(4),
        week: openEndless(),
        contract: undefined,
        event: SHIFT_EVENTS.ordinary,
        plan: PLAN,
        calendar: null,
        subject: { kind: 'week-day' },
      }),
    );
    expect(report.contractLine).toContain('Endless');
    expect(report.contractLine).toContain('nothing is banked');
    expect(report.contractLine).not.toContain('Your own building');
  });
});

describe('one judgement, four sentences — issue #53', () => {
  /*
   * ## What was reported
   *
   * > **A day it could handle.** 3108 journeys of 3217 offered, and 88% of riders away inside a
   * > minute.
   * >
   * > THE SHIFT ASKED FOR — **Shift missed** — "Streak reset."
   *
   * ## What was actually happening
   *
   * Two independent tests of one question. `verdict` was *every goal met*; the lede branched on
   * `summary.saturated` and on nothing else. Those agree only by luck, and they disagree on any run
   * that misses a bar without the queues diverging — which the reporter's Vertical City run was,
   * and which `missedWithoutSaturating` is here.
   *
   * ## Why the tests below are shaped the way they are
   *
   * The fix that would pass a weak suite is copy that happens to line up today. So the central test
   * holds the recording, the observations, the week and the contract **completely fixed** and moves
   * only the goals: the headline must move with the verdict, because the headline is looked up
   * *under* the verdict. Under the old code that test fails — same run, same lede, opposite banner.
   */
  /** A bar nothing can miss and a bar nothing can meet, on the same reading. */
  function barrier(bar: number, compare: 'at-least' | 'at-most'): readonly ShiftGoal[] {
    return [
      {
        id: 'carry',
        label: `Carry ${String(bar)}% of the people who turn up`,
        unit: '%',
        bar,
        compare,
        reads: 'carryPct',
      },
    ];
  }

  const ALWAYS_MET = barrier(0, 'at-least');
  const NEVER_MET = barrier(101, 'at-least');

  function sheetWith(
    recording: VizRecording,
    goals: readonly ShiftGoal[],
    observations: Observations = observationsOfRun(recording),
  ): WeekDayReport {
    return weekDay(
      dayReportOf({
        recording,
        observations,
        goals,
        week: { ...openWeek('c2'), day: 4, dayIdx: 3, streak: 2 },
        contract: contractById('c2'),
        event: SHIFT_EVENTS.ordinary,
        plan: PLAN,
        calendar: null,
        subject: { kind: 'week-day' },
      }),
    );
  }

  /**
   * The same run with too few arrivals to read — § D234's third verdict.
   *
   * The **observations** are moved and the recording is not, for the reason the sweep below exists:
   * the third verdict has to be reachable while everything else about the day is held fixed, or the
   * disjointness it is swept into is a claim about three different runs rather than about three
   * answers to one question.
   */
  function tooQuiet(recording: VizRecording): Observations {
    return { ...observationsOfRun(recording), arrived: 4, carried: 4 };
  }

  /** Up to the first sentence break — the words a reader takes in before anything else. */
  const headlineOf = (report: WeekDayReport): string => report.lede.split('. ')[0] ?? report.lede;

  it('the premise: a run can miss a bar without saturating, and the shipped set has one', () => {
    // Stated rather than assumed. If `core`'s saturation detector moves, this fails as a premise
    // rather than leaving the suite below quietly asserting against the saturated branch.
    const summary = missedWithoutSaturating.summary;
    expect(summary.saturated).toBe(false);
    expect(summary.awtIsValid).toBe(true);
    const report = reportOf(missedWithoutSaturating);
    expect(report.verdict).toBe('missed');
    expect(report.goals.some((line) => line.reading.state === 'missed')).toBe(true);
  });

  it('cannot congratulate a day the banner says was missed — the reported defect', () => {
    const report = reportOf(missedWithoutSaturating);
    expect(report.verdictLine).toBe('Shift missed');
    // The exact sentence that shipped over "Shift missed". It is the cleared branch's, and the
    // cleared branch is now unreachable from a missed verdict.
    expect(report.lede).not.toContain('A day it could handle');
    // The headline the run gets is the missed arm's, whichever bar it was that went unmet.
    expect(headlineOf(report)).toBe(
      headlineOf(sheetWith(missedWithoutSaturating, NEVER_MET)),
    );
    expect(report.diagnosisHeading).toBe('Where it went wrong');
  });

  it('moves the headline when the verdict moves, on one unchanged run', () => {
    /*
     * The assertion the old code fails. Everything about the day is identical — the same recording,
     * the same folded observations, the same week — and only what was *asked* of it differs. A
     * headline computed from the run alone cannot notice; a headline looked up under the verdict
     * cannot fail to.
     */
    for (const recording of [clean, saturated, missedWithoutSaturating]) {
      const met = sheetWith(recording, ALWAYS_MET);
      const missed = sheetWith(recording, NEVER_MET);
      expect(met.verdict, recording.buildingName).toBe('cleared');
      expect(missed.verdict, recording.buildingName).toBe('missed');
      expect(met.figures, 'the run itself did not change').toEqual(missed.figures);
      expect(missed.lede, recording.buildingName).not.toBe(met.lede);
      expect(missed.lede).not.toContain(headlineOf(met));
      expect(met.lede).not.toContain(headlineOf(missed));
    }
  });

  it('keeps every sentence about the day on the same side of the verdict', () => {
    /*
     * The general form, swept over every verdict × both saturation states × three real runs. The
     * property is **disjointness**: no sentence the sheet uses to say a day cleared may ever appear
     * on a sheet that says it did not, and vice versa. A single shared string is the defect.
     *
     * **Widened to three verdicts by § D234**, not relaxed for one. `ungraded` is the day nobody
     * read, and it is the arm most likely to reintroduce § D237's defect, because it used to live
     * *inside* the missed branch: the sheet said *too quiet to grade* under a banner reading
     * **Shift missed**, and the streak reset underneath. So it is swept like the other two, and the
     * check below is pairwise over all three rather than one comparison between two.
     */
    const said: Record<DayReport['verdict'], Set<string>> = {
      cleared: new Set(),
      missed: new Set(),
      ungraded: new Set(),
    };
    const lineOf: Record<DayReport['verdict'], string> = {
      cleared: 'Shift cleared',
      missed: 'Shift missed',
      ungraded: 'Too quiet to grade',
    };
    for (const recording of [clean, saturated, missedWithoutSaturating]) {
      for (const goals of [ALWAYS_MET, NEVER_MET, goalsForDay(4), goalsForDay(12)]) {
        // The same goals read against a full morning and against one too quiet to grade, so the
        // third verdict is reached without changing anything else about the day.
        for (const observations of [observationsOfRun(recording), tooQuiet(recording)]) {
          const report = sheetWith(recording, goals, observations);
          expect(report.verdictLine).toBe(lineOf[report.verdict]);
          for (const sentence of [
            headlineOf(report),
            report.verdictLine,
            report.diagnosisHeading,
            report.streakLine,
          ]) {
            said[report.verdict].add(sentence);
          }
        }
      }
    }
    // Every arm was reached, so the disjointness below is not vacuous on any of the three.
    expect(said.cleared.size).toBeGreaterThan(0);
    expect(said.missed.size).toBeGreaterThan(0);
    expect(said.ungraded.size).toBeGreaterThan(0);
    const verdicts = ['cleared', 'missed', 'ungraded'] as const;
    for (const one of verdicts) {
      for (const other of verdicts) {
        if (one === other) continue;
        for (const sentence of said[one]) {
          expect(
            said[other].has(sentence),
            `"${sentence}" is said on both ${one} and ${other}`,
          ).toBe(false);
        }
      }
    }
  });

  it('says the day did not cope, and that the goals were met, when both are true', () => {
    // Saturation did not stop mattering; it moved inside the arm. A saturated day that met every
    // bar **is** cleared, and the headline says both rather than picking one.
    const report = sheetWith(saturated, ALWAYS_MET);
    expect(report.verdict).toBe('cleared');
    expect(report.lede).toContain('Every goal met');
    expect(report.lede).toContain('never settled');
    // It points at the cell that refused rather than restating a figure the run withholds.
    expect(report.lede).toContain('withheld');
    expect(report.lede).not.toContain(saturated.summary.meanWaitS.toFixed(1));
  });

  it('names the bars that went unmet rather than only that some did', () => {
    const report = reportOf(missedWithoutSaturating);
    const unmet = report.goals.filter((line) => line.reading.state === 'missed');
    expect(unmet.length).toBeGreaterThan(0);
    for (const { reading } of unmet) expect(report.lede).toContain(reading.goal.label);
    for (const { reading } of report.goals.filter((line) => line.reading.state === 'met')) {
      expect(report.lede, reading.goal.label).not.toContain(`“${reading.goal.label}”`);
    }
  });

  it('does not claim a goal was missed on a day nothing was graded at all', () => {
    /*
     * Under `WAKE_UP_ARRIVALS` legs every reading is `pending`, so nothing was judged.
     *
     * **This used to assert `verdict === 'missed'`, and § D234 is why it does not any more.** That
     * was the state the sheet was in when a play-tester carried 18 of 18 people with 100 % away
     * inside a minute and read *"Shift missed. Streak reset."* — the words were already careful
     * (*too quiet to grade*) and the banner over them said the opposite, which is § D237's defect
     * living inside the arm that had noticed it. `ungraded` is now a verdict, so the banner, the
     * headline, the diagnosis heading and the streak line all come through one key.
     *
     * The half that has not moved is the one this test was written for: saying which bars went
     * unmet would be false, and saying nothing would be `docs/10` R3's blank. It still says why.
     */
    const report = sheetWith(clean, goalsForDay(4), tooQuiet(clean));
    expect(report.goals.every((line) => line.reading.state === 'pending')).toBe(true);
    expect(report.verdict).toBe('ungraded');
    expect(report.verdictLine).toBe('Too quiet to grade');
    expect(report.lede).toContain('Too quiet to grade');
    // The two counts that make the refusal actionable: what arrived, and what it needed.
    expect(report.lede).toContain(`${String(WAKE_UP_ARRIVALS)}`);
    expect(report.lede).toContain('4 people called');
    // And no goal named, on a day none was read.
    for (const { reading } of report.goals) {
      expect(report.lede, reading.goal.label).not.toContain(`“${reading.goal.label}”`);
    }
    expect(report.lede).not.toContain('A day it could handle');
  });

  it('does not spend the streak on a day nobody judged — § D234', () => {
    /*
     * The sheet and `closeDay` turn on the same `wasGraded`, so this sentence is a statement about
     * the week rather than a kindness. *"Streak reset"* names something taken away, and an ungraded
     * day takes nothing.
     */
    const report = sheetWith(clean, goalsForDay(4), tooQuiet(clean));
    expect(report.streakLine).not.toContain('Streak reset');
    expect(report.streakLine).toContain('Nothing was graded');
    // The week under it carries `streak: 2`, and the line says so rather than saying nothing.
    expect(report.streakLine).toContain('2');
  });

  it('resets the streak from the same verdict the banner prints', () => {
    expect(sheetWith(clean, NEVER_MET).streakLine).toContain('Streak reset');
    expect(sheetWith(clean, ALWAYS_MET).streakLine).not.toContain('Streak reset');
  });
});

describe('the levers point at what this run showed — issue #55', () => {
  /*
   * The section is captioned as advice for *this* day and shipped as a frozen constant: four cards,
   * same order, same words, on a flawless day and on one where 74 people took the stairs. It sits
   * directly under a diagnosis that interpolates real values, so it reads as a diagnosis, and a
   * player who acts on it once and then notices it never moves stops trusting the section.
   *
   * The line these tests hold: a card may name **what today showed**, never what the lever is worth.
   * One replication cannot support the second, which is CLAUDE.md's first statistical rule and the
   * small print's own sentence.
   */
  function leverBody(report: ShapedDayReport, id: string): string {
    const found = report.levers.find((lever) => lever.id === id);
    if (found === undefined) throw new Error(`no lever "${id}" on the sheet`);
    return found.body;
  }

  it('reorders and annotates on a day that was outrun, and leaves the glossary alone otherwise', () => {
    const outrun = reportOf(saturated);
    const quiet = reportOf(clean);
    /*
     * Compared on the bodies rather than the order since first-day S2 item 5: the order moved on
     * this fixture only because its lobby queue promoted *Ask where they're going*, which no
     * observation does any more, and the two cards it does point at lead the glossary already.
     */
    expect(outrun.levers.map((lever) => lever.body)).not.toEqual(
      quiet.levers.map((lever) => lever.body),
    );
    // The lever a day the building was outrun points at leads, and says why in the run's own counts.
    expect(outrun.levers[0]?.id).toBe('add-a-car');
    expect(leverBody(outrun, 'add-a-car')).toContain('Today points here');
    expect(leverBody(outrun, 'add-a-car')).toContain('backlog was still growing');
  });

  it('pluralises both of its own clauses, and the singular is the case that was wrong', () => {
    /*
     * Issue #134. Both clauses read `1 legs never boarded at all` and `1 riders gave up and took
     * the stairs`, driven on `vertical-city` at 16 %pop/5 min, seed 20260727.
     *
     * **Exactly one of each, because that is the value the defect got wrong.** A case at zero
     * omits the clause entirely and a case above one was always right, so either would pass against
     * the bug — the same shape as § D318's field round-trip. Both counts are asserted on screen so
     * a future change cannot fix the grammar by dropping the number.
     *
     * These two clauses are two of the four outcomes § D266 refuses to fold together, which is why
     * a sentence that reads as an unfilled template costs more here than elsewhere: it teaches the
     * reader that this line is boilerplate exactly when it is carrying a real and unusual fact.
     */
    const one = dayReportOf({
      recording: saturated,
      observations: { ...observationsOfRun(saturated), abandoned: 1, standing: 1 },
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      calendar: null,
      plan: PLAN,
      subject: { kind: 'week-day' },
    });
    const body = leverBody(weekDay(one), 'add-a-car');
    expect(body).toContain('1 ride had not boarded when the day ended');
    // *Waited past the give-up horizon*, not *gave up and took the stairs* — `docs/19` defect 3:
    // the count is an attribute of a wait, and these riders may all be inside CARRIED.
    expect(body).toContain('1 rider waited past the give-up horizon');
    expect(body).not.toContain('gave up and took the stairs');
    expect(body).not.toContain('1 rides');
    expect(body).not.toContain('1 riders');
  });

  it('keeps the plural where the count is plural, so the fix did not trade one error for another', () => {
    const many = dayReportOf({
      recording: saturated,
      observations: { ...observationsOfRun(saturated), abandoned: 7, standing: 4 },
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      calendar: null,
      plan: PLAN,
      subject: { kind: 'week-day' },
    });
    const body = leverBody(weekDay(many), 'add-a-car');
    expect(body).toContain('4 rides had not boarded when the day ended');
    expect(body).toContain('7 riders waited past the give-up horizon');
  });

  /**
   * The post-AI panel's seat D, D5: on St Jude's day 1 *Add a car* read *"Today points here: 3 legs
   * never boarded at all"*, and all three were riders the building turned away at a credential
   * check, whom no car could have carried. `summary.unservedCount` counts a refused leg as never
   * boarded. The lever now points only at legs still on a landing, and the refused are named in
   * the lede instead.
   */
  it('does not point Add a car at riders the building turned away for their credential', () => {
    const quiet = observationsOfRun(missedWithoutSaturating);
    const refusedOnly = dayReportOf({
      recording: {
        ...missedWithoutSaturating,
        summary: fixtureSummary({ ...missedWithoutSaturating.summary, saturated: false, unservedCount: 3 }),
      },
      observations: {
        ...quiet,
        carried: quiet.arrived - 3,
        turnedAway: 3,
        standing: 0,
        aboard: 0,
        abandoned: 0,
        abandonedCarried: 0,
      },
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      calendar: null,
      plan: PLAN,
      subject: { kind: 'week-day' },
    });
    const report = weekDay(refusedOnly);
    expect(leverBody(report, 'add-a-car')).not.toContain('never boarded');
    expect(leverBody(report, 'add-a-car')).not.toContain('3 legs');
    expect(report.lede).toContain('Of the 3 not carried, 3 were turned away at a credential check when the day ended.');
  });


  it('quotes counts, and never a figure the run refuses', () => {
    /*
     * Every pointer is a count or a ratio of counts. None of the three quantities `awtIsValid`
     * speaks for may reach a card — a lever that appeared on a suppressed mean, or quoted one,
     * would be that mean published through the back door (`docs/10` R9).
     */
    const { summary } = saturated;
    expect(summary.awtIsValid).toBe(false);
    const refused = [summary.meanWaitS, summary.wait95S, summary.meanTimeToDestinationS];
    for (const lever of reportOf(saturated).levers) {
      for (const value of refused) {
        for (const places of [0, 1, 2]) {
          expect(lever.body, lever.id).not.toContain(value.toFixed(places));
        }
      }
    }
  });

  it('names the landing the queue stood on, on a day one landing carried it', () => {
    const report = reportOf(missedWithoutSaturating);
    const observations = observationsOfRun(missedWithoutSaturating);
    expect(observations.peakQueueFloorId).not.toBeNull();
    const body = leverBody(report, 'zone-the-tower');
    expect(body).toContain(`floor ${String(observations.peakQueueFloorId)}`);
    expect(body).toContain(String(observations.peakQueue));
    // The handoff's own sentence survives underneath the clause this run added.
    expect(body).toContain('Split the floors between cars during the peak only');
  });

  it('never promotes destination dispatch, even on the queue that used to fire it — first-day S2 item 5', () => {
    /*
     * The pointer fired on a deep queue at an entrance floor, an observation its own comment said
     * does not measure what the card claims to cut; § D595 measured destination arms worse on waits
     * at a supertall; and the one run of it on the day an assessor met it made the queue worse. So
     * the observation that used to fire is built here on purpose — the deepest queue at an entrance
     * floor, far past the bar — and the card must not lead, must not say *Today points here*, and
     * must state no mechanism. The door stays (§ D503): the card is still on the sheet.
     */
    const lobby = saturated.floors.find((floor) => floor.isEntrance);
    if (lobby === undefined) throw new Error('the saturated fixture has no entrance floor');
    const observations = { ...observationsOfRun(saturated), peakQueueFloorId: lobby.id, peakQueue: 519 };
    const report = weekDay(
      dayReportOf({
        recording: saturated,
        observations,
        goals: goalsForDay(4),
        week: openWeek('c2'),
        contract: contractById('c2'),
        event: SHIFT_EVENTS.ordinary,
        calendar: null,
        plan: PLAN,
        subject: { kind: 'week-day' },
      }),
    );
    const card = report.levers.find((lever) => lever.id === 'ask-destination');
    expect(card, 'the card left the sheet; § D503 keeps its door').toBeDefined();
    expect(card?.body).not.toContain('Today points here');
    expect(report.levers[0]?.id).not.toBe('ask-destination');
    /* No mechanism: the struck clause, and any *because/cuts/so that* standing in for it. */
    expect(card?.body).not.toMatch(/stops per trip|actually costs|\bcuts?\b|\bbecause\b|\bpools?\b/iu);
    for (const recording of [clean, saturated, missedWithoutSaturating]) {
      const body = reportOf(recording).levers.find((lever) => lever.id === 'ask-destination')?.body ?? '';
      expect(body).not.toContain('Today points here');
    }
  });

  it('drops the lever the run has already pulled', () => {
    // `passengerModel` is `core`'s answer, computed from the resolved dispatch stage. A run already
    // on destination dispatch is not offered destination dispatch.
    const already: VizRecording = { ...clean, passengerModel: 'destination-dispatch' };
    const report = reportOf(already);
    expect(report.levers.map((lever) => lever.id)).not.toContain('ask-destination');
    expect(reportOf(clean).levers.map((lever) => lever.id)).toContain('ask-destination');
  });

  it('claims nothing about what a lever buys, on any run', () => {
    for (const recording of [clean, saturated, missedWithoutSaturating]) {
      const report = reportOf(recording);
      for (const lever of report.levers) {
        // R2's own words. A card may say what happened; it may not order two settings.
        expect(lever.body, lever.id).not.toMatch(/\bbetter than\b|\bbeats?\b|\boutperform/i);
      }
      // And the refusal is published under the cards rather than left to the reader.
      expect(report.smallPrint).toContain('ordered by what today showed');
      expect(report.smallPrint).toContain('needs the paired runs');
    }
  });
});

describe('what the sheet is a report of — docs/17 § 5 clause 1', () => {
  /**
   * The week that made the finding: day 4 of `c2`, a streak running and one shift banked.
   *
   * Both shapes are built from **this same week**, this same recording and this same contract, so
   * the only thing that differs between the two sheets below is the subject. A single-run sheet
   * built from a fresh `openWeek()` would prove nothing — it would have had nothing to say about a
   * week even if it wanted to, which is precisely the inference this change refuses to make.
   */
  const SHAPE_WEEK = { ...openWeek('c2'), day: 4, dayIdx: 3, streak: 2, cleanRun: 1 };

  function sheetOf(subject: ReportSubject, week = SHAPE_WEEK): ShapedDayReport {
    return dayReportOf({
      recording: clean,
      observations: observationsOfRun(clean),
      goals: goalsForDay(4),
      week,
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar: null,
      subject,
    });
  }

  const SINGLE: ReportSubject = { kind: 'single-run', selection: SELECTION };

  /** Every string a single-run sheet will show. The framing is the only place a week could hide. */
  function everyString(report: SingleRunReport): readonly string[] {
    return [
      report.title,
      ...report.metaLines,
      report.lede,
      report.verdictLine,
      report.smallPrint,
      report.nextStep.label,
      report.nextStep.why,
      ...report.figures.flatMap((cell) => [cell.label, cell.value, cell.note]),
      ...report.goals.map((line) => line.reading.goal.label),
      ...report.diagnosis.flatMap((row) => [row.when, row.what, row.why]),
      ...report.levers.flatMap((lever) => [lever.title, lever.body]),
    ];
  }

  it('says the week’s five things when the run is a day of a week', () => {
    // The positive control. Without it the absences below would pass against a sheet that had
    // simply lost these lines for everybody.
    const report = weekDay(sheetOf({ kind: 'week-day' }));
    expect(report.of).toBe('week-day');
    expect(report.title).toBe('Thursday — day 4');
    /*
     * **The position is derived, not pinned.** This read `Scenario 4` — true after issue #382
     * re-ordered the ladder by measured day-1 difficulty, and false again when GitHub issue #500
     * inserted `c9` above `c2`. A `label` is a *position*, so a literal here is a fact about the
     * length of the array in front of this contract, and the line under test is the one the sheet
     * draws from the contract itself. Asserting the derivation keeps the claim — *the sheet names
     * the scenario you are on* — and drops the part of it that was never the point.
     */
    expect(report.contractLine).toContain(`${contractById('c2')?.label ?? ''} — The morning rush`);
    expect(report.contractLine).toContain('clean shifts banked');
    expect(report.streakLine).toContain('clean days in a row');
    expect(report.forecast.demand).toContain('more tenants than today');
    expect(report.taught).toContain('Bank');
    expect(WEEKDAYS).toContain(report.nextDayName);
  });

  it('does not carry them at all on one run — absent keys, not empty strings', () => {
    /*
     * `in`, not `=== ''`. A slot the layout still reserves and fills with nothing is `docs/10` R3's
     * blank-where-a-number-should-be at the sheet's scale, and it is indistinguishable from a
     * surface that failed to load. The panel can only omit what it is not given.
     */
    const report = singleRun(sheetOf(SINGLE));
    expect(report.of).toBe('single-run');
    for (const field of [
      'streakLine',
      'contractLine',
      'cleared',
      'forecast',
      'taught',
      'nextDayName',
    ]) {
      expect(field in report, `${field} is still on a single run's sheet`).toBe(false);
      expect(Object.keys(report), field).not.toContain(field);
    }
  });

  it('names no scenario and counts nothing banked, on the very week that would have', () => {
    // The finding, verbatim: *"Scenario 2 — The morning rush · 1 of 2 clean shifts banked"* on a
    // run that banks nothing. Swept over every string the sheet will show, not only the two lines.
    const report = singleRun(sheetOf(SINGLE));
    for (const text of everyString(report)) {
      expect(text, text).not.toContain('Scenario');
      expect(text, text).not.toContain('clean shift');
      expect(text, text).not.toContain('clean days in a row');
      expect(text.toLowerCase(), text).not.toContain('streak');
      expect(text.toLowerCase(), text).not.toContain('tomorrow');
    }
    expect(weekDay(sheetOf({ kind: 'week-day' })).contractLine).toContain('Scenario');
  });

  it('names no weekday, and titles the run by what it is a run of', () => {
    const report = singleRun(sheetOf(SINGLE));
    expect(report.title).toContain(clean.buildingName);
    for (const text of everyString(report)) {
      for (const day of WEEKDAYS) expect(text, `${day} in "${text}"`).not.toContain(day);
    }
  });

  it('carries the seed and the selection, because reproducing it is the whole value', () => {
    const meta = singleRun(sheetOf(SINGLE)).metaLines.join('\n');
    expect(meta).toContain(`seed ${clean.seed}`);
    expect(meta).toContain(clean.buildingName);
    expect(meta).toContain(SELECTION.demandTemplateId);
    expect(meta).toContain('12.0 %pop/5min');
    // *"of demand"*, not *"selected"* — issue #80. The clock range on the line above is the run,
    // drain included; this number is the demand schedule, and nothing used to say which was which.
    expect(meta).toContain('15 min of demand');
    expect(meta).toContain('not part of a week');
  });

  it('says whose rate it was rather than printing a number nobody chose', () => {
    // R3 again: `null` means *the building's own traffic profile*, which is a different selection
    // from any particular figure and may not be resolved into one on the way to a reader.
    const meta = singleRun(
      sheetOf({ kind: 'single-run', selection: { ...SELECTION, arrivalRatePctPop5min: null } }),
    ).metaLines.join('\n');
    expect(meta).toContain('the building’s own rate');
    expect(meta).not.toContain('%pop/5min');
    expect(meta).not.toContain('0.0');
  });

  it('points at Compare as data, and says why — on both shapes', () => {
    const step = singleRun(sheetOf(SINGLE)).nextStep;
    expect(step.surface).toBe('compare');
    expect(step.label.length).toBeGreaterThan(0);
    // The two halves of docs/12 § 2.3: the same passengers, and the answer when it cannot tell.
    expect(step.why).toContain('same passengers');
    expect(step.why).toContain('indistinguishable');
    expect(step.why).toContain('interval contains zero');
    /*
     * **Both**, and this assertion was the inverse until `docs/17` § 5 clause 7 was read properly.
     * The clause is *the report never points at Compare*; answering it on the Free Play sheet alone
     * answered it for the mode that provokes the question least. A player finishing a campaign day
     * has just read a levers card saying *try a different dispatcher — a smarter one is free*, which
     * is the question in as many words, and the sheet's own small print refuses to answer it.
     *
     * Identity, not equality: the same value on both sheets, so a second pointer composed for the
     * week would fail rather than merely read alike.
     */
    expect(weekDay(sheetOf({ kind: 'week-day' })).nextStep).toBe(step);
  });

  it('counts attempts on both shapes, each in its own words', () => {
    // The attempt is an observation about a retry, and a retry happens in either mode — docs/16
    // § 6. What changes is what was retried: a day, or a selection.
    const retried = { ...SHAPE_WEEK, attempt: 3 };
    expect(sheetOf({ kind: 'week-day' }, retried).metaLines).toContain('attempt 3 at this day');
    expect(sheetOf(SINGLE, retried).metaLines).toContain('attempt 3 at this selection');
    expect(sheetOf(SINGLE).metaLines.some((line) => line.startsWith('attempt'))).toBe(false);
  });

  it('changes nothing about the figures, the diagnosis, the levers or the small print', () => {
    /*
     * The other half of the fix, and the half a reviewer should distrust first: § D106's two
     * `unranked` energy cells, the `WITHHELD` gate and `docs/10` R3/R11 govern the figure grid and
     * they are correct. The sheet's *shape* changed; nothing it publishes did.
     *
     * `verdictLine` left this list with `docs/19` defect 13 — it is no longer an observation the
     * two shapes share but the one claim a single run may not make; the case below owns it. The
     * `verdict` itself still matches, because the lede and the diagnosis heading were chosen
     * through it (§ D237's one-key rule) and both remain observations about the day.
     */
    const week = weekDay(sheetOf({ kind: 'week-day' }));
    const single = singleRun(sheetOf(SINGLE));
    expect(single.figures).toEqual(week.figures);
    expect(single.diagnosis).toEqual(week.diagnosis);
    expect(single.levers).toEqual(week.levers);
    expect(single.goals).toEqual(week.goals);
    expect(single.lede).toBe(week.lede);
    expect(single.verdict).toBe(week.verdict);
    expect(single.smallPrint).toBe(week.smallPrint);
  });

  it('announces no verdict on a run no contract graded — docs/19 defect 13', () => {
    /*
     * The audit's own question was *"Cleared what?"* — the free-play sheet said **Shift cleared**
     * over goals no contract issued. The banner slot now carries a refusal to grade, worded in the
     * report layer because two renderers draw it (`dev/reportPanel.ts` and `render/reportCard.ts`),
     * and a fix in one would be the two-renderers defect issue #137 closed, reopened with words.
     */
    const single = singleRun(sheetOf(SINGLE));
    expect(single.verdictLine).toBe('read, not graded — no scenario asked for this run');
    expect(single.verdictLine).not.toContain('cleared');
    // The week's sheet keeps its verdict — the refusal is about the shape, not the day.
    expect(weekDay(sheetOf({ kind: 'week-day' })).verdictLine).toBe('Shift cleared');
  });
});

describe('the shift clock', () => {
  it('is 06:00 plus the kernel’s own simulated seconds', () => {
    expect(clockOf(0)).toBe('06:00');
    expect(clockOf(90 * 60)).toBe('07:30');
    expect(clockOf(0, DAY_START_S)).toBe('06:00');
  });

  it('wraps rather than printing a twenty-sixth hour', () => {
    expect(clockOf(19 * 3600)).toBe('01:00');
  });
});

/**
 * **Every rider accounted for, in the lede** — the post-AI panel's seat D, D4 and top change 3.
 *
 * The saturated lede read *"873 people asked for a lift and 871 got one, with 0 still standing when
 * the window closed"* on a sheet whose lever card said the backlog was still growing when the window
 * closed: the count was `summary.unservedCount`, legs that had not boarded when the **run** ended.
 * The lede now says the growing backlog in the lever's own words, and says where the uncarried went
 * in parts that sum to the shortfall.
 */
describe('the lede accounts for everybody it did not carry', () => {
  it('says the backlog was growing, never a count at the window’s close it does not have', () => {
    const report = reportOf(saturated);
    expect(saturated.summary.saturated).toBe(true);
    expect(report.lede).toContain('the backlog was still growing when the window closed');
    expect(report.lede).not.toContain('still standing when the window closed');
  });

  it('names turned away, still in a car and not boarded, and the parts sum to the shortfall', () => {
    let reached = 0;
    /* St Jude's pinned day 1, whose tower turns riders away at a credential check. */
    const resources = contractBuildings();
    const plan = shiftRunConfigOf(resources, contractDayState('c8', { seed: 20_276_662n }));
    const stJude = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording;
    expect(observationsOfRun(stJude).turnedAway).toBeGreaterThan(0);
    for (const recording of [clean, saturated, missedWithoutSaturating, stJude]) {
      const observations = observationsOfRun(recording);
      const shortfall = observations.arrived - observations.carried;
      expect(observations.turnedAway + observations.aboard + observations.standing, recording.buildingId).toBe(shortfall);
      const clause = / Of the \d+ not carried, [^.]*\./u.exec(reportOf(recording).lede)?.[0] ?? '';
      if (shortfall === 0) {
        expect(clause).toBe('');
        continue;
      }
      reached += 1;
      expect(clause).toContain(`Of the ${String(shortfall)} not carried`);
      const named = [...clause.matchAll(/(\d+) (?:was|were|had)/gu)].map((match) => Number(match[1]));
      expect(named.reduce((sum, n) => sum + n, 0), recording.buildingId).toBe(shortfall);
    }
    /* Non-vacuity: at least one of the three runs left somebody uncarried. */
    expect(reached).toBeGreaterThan(0);
  });
});

/**
 * **The energy figure moves several-fold between crowds, and the sheet says so** — the post-AI
 * panel's seat B: *"Tuesday's energy of 3.5 kJ/ride against Monday's 18.7 goes unexplained."*
 *
 * Measured rather than argued: the figure is work over the five-minute window divided by the legs
 * delivered in it, about a hundred on St Jude, and eight day-1 crowds on that tower — nothing else
 * changed — spread it past three to one. That spread is the licence for the note's *several-fold*,
 * and this case is what pins it.
 */
describe('the energy-per-leg note says how far one crowd moves it', () => {
  it('spreads past three to one over eight crowds of one day, and the note says several-fold', () => {
    const resources = contractBuildings();
    const perLeg: number[] = [];
    for (let n = 0; n < 8; n += 1) {
      const plan = shiftRunConfigOf(resources, contractDayState('c8', { seed: 20_260_824n + 7_919n * BigInt(n) }));
      const { recording } = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds });
      const value = recording.summary.energy.workPerServedLegKJ;
      if (value !== null) perLeg.push(value);
      if (n === 0) expect(figure(reportOf(recording), 'energy-per-leg').note).toContain('several-fold');
    }
    expect(perLeg).toHaveLength(8);
    expect(Math.max(...perLeg) / Math.min(...perLeg)).toBeGreaterThanOrEqual(3);
  });
});

describe('the ordinary day’s calls and a practice close — § D1138', () => {
  const WEEK = { ...openWeek('c2'), day: 4, dayIdx: 3, streak: 2, cleanRun: 1 };
  function sheet(over: Partial<DayReportInput>, subject: ReportSubject = { kind: 'week-day' }): ShapedDayReport {
    return dayReportOf({
      recording: clean,
      observations: observationsOfRun(clean),
      goals: goalsForDay(4),
      week: WEEK,
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: PLAN,
      calendar: null,
      subject,
      ...over,
    });
  }
  const passing = (): Observations => observationsOfRun(clean);
  const failing = (): Observations => ({ ...passing(), worstWaitS: 10_000, minutePct: 0 });
  const call = (atS: number, answer: DayCallRecord['answer'], spread: Observations): DayCallRecord => ({
    atS,
    windowEndS: atS + 600,
    answer,
    counts: { 'park-cars-lobby': 4, 'spread-cars': 9, leave: 6 },
    observations: { 'park-cars-lobby': passing(), 'spread-cars': spread, leave: passing() },
  });

  it('prints one row per call, in order, after every other row, graded by the sheet’s own grader', () => {
    const report = sheet({ dayCalls: [call(clean.startedAt + 60, 'spread-cars', failing()), call(clean.startedAt + 400, 'leave', passing())] });
    const ids = report.diagnosis.map((row) => row.id);
    expect(ids.slice(-2)).toEqual(['day-call-1', 'day-call-2']);
    const [first, second] = report.diagnosis.slice(-2);
    expect(first?.why).toContain('4 with park the cars in the lobby, 9 with spread the cars across the tower and 6 with leave them');
    expect(first?.why).toMatch(/The day read Shift (cleared|missed) with park the cars in the lobby and leave them and Shift (cleared|missed) with spread the cars across the tower\./u);
    expect(second?.why).not.toContain('The day read');
    expect(second?.why.endsWith(DAY_CALL_ROW_NOTE)).toBe(true);
  });

  it('prints no call row on a single run, which grades nothing', () => {
    const report = sheet({ dayCalls: [call(clean.startedAt + 60, 'spread-cars', failing())] }, { kind: 'single-run', selection: SELECTION });
    expect(report.diagnosis.some((row) => row.id.startsWith('day-call-'))).toBe(false);
  });

  it('says a practice close is practice, where the streak line stood and in the meta block', () => {
    const practised = weekDay(sheet({ practice: true, week: { ...WEEK, attempt: 2, closedDay: 4 } }));
    expect(practised.practiceNote).toBe(PRACTICE_NOTE);
    expect(practised.streakLine).toBe(PRACTICE_NOTE);
    expect(practised.metaLines).toContain('attempt 2 at this day · practice');
    const banked = weekDay(sheet({ week: { ...WEEK, attempt: 1, closedDay: 4 } }));
    expect(banked.practiceNote).toBeUndefined();
    expect(banked.streakLine).not.toBe(PRACTICE_NOTE);
  });

  it('says a run on a crowd other than the day’s shared one is practice for that reason — § D1141', () => {
    /* The week has not closed the day at all, so *your week keeps your first attempt* would be false. */
    const byCrowd = weekDay(sheet({ practice: true, practiceCrowd: 777n, week: { ...WEEK, attempt: 1, closedDay: null } }));
    expect(byCrowd.practiceNote).toBe(PRACTICE_CROWD_NOTE);
    expect(byCrowd.streakLine).toBe(PRACTICE_CROWD_NOTE);
    expect(byCrowd.practiceNote).not.toMatch(/first attempt/u);
    expect(byCrowd.practiceNote).not.toMatch(/\d/u);
  });
});
