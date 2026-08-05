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

import { DATA_DIR, fixtureConfig, fixtureSummary } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import type { VizRecording, VizSummary } from '../contract/types.js';
import { contractById } from './contracts.js';
import { SHIFT_EVENTS } from './events.js';
import { goalsForDay } from './goals.js';
import { observationsAt } from '../live/observations.js';
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
  WITHHELD,
  averageWaitFigure,
  clockOf,
  dayReportOf,
  type ReportSubject,
  type ShapedDayReport,
  type SingleRunReport,
  type WeekDayReport,
} from './report.js';
import { closeDay, openEndless, openWeek, outcomeOf } from './week.js';
import {
  DAY_START_S,
  WAKE_UP_ARRIVALS,
  WEEKDAYS,
  type DayReport,
  type Observations,
  type ShiftGoal,
} from './types.js';
import { readGoals } from './goals.js';

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
function reportOf(recording: VizRecording, day = 4): WeekDayReport {
  const observations = observationsOfRun(recording);
  const goals = goalsForDay(day);
  const opened = { ...openWeek('c2'), day, dayIdx: (day - 1) % 7 };
  const week = closeDay(
    opened,
    outcomeOf({
      day,
      dayIdx: opened.dayIdx,
      eventId: 'ordinary',
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
      subject: { kind: 'week-day' },
    }),
  );
}

function figure(
  report: ShapedDayReport,
  id: string,
): { value: string; note: string; tone: string; axisOnly: boolean } {
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
    expect(wait.note).toContain(clean.summary.reportWindow.id);
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
      subject: { kind: 'week-day' },
    });
    expect(figure(report, 'deepest-queue').note).toBe('never more than a handful');
    expect(report.diagnosis[0]?.when).toBe('—');
  });
});

describe('WORST WAIT states its censoring', () => {
  it('reports the run’s own longest wait', () => {
    const longest = clean.summary.serviceLevel.longestWaitS;
    expect(longest).not.toBeNull();
    expect(figure(reportOf(clean), 'worst-wait').value).toContain(
      (longest ?? 0).toFixed(0),
    );
  });

  it('says "at least" when the longest wait belongs to a leg that never boarded', () => {
    const censored = fixtureSummary({
      serviceLevel: {
        verdict: 'starved',
        longestWaitS: 640,
        longestWaitIsCensored: true,
        overHorizonCount: 3,
        arrivalCount: 90,
        horizonS: 900,
      },
    });
    const report = dayReportOf({
      recording: { ...clean, summary: censored },
      observations: observationsOfRun(clean),
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      subject: { kind: 'week-day' },
    });
    const worst = figure(report, 'worst-wait');
    expect(worst.value).toBe('at least 640 s');
    expect(worst.note).toContain('lower bound');
  });

  it('reads "not recorded" — never 0 s — when the window held no arrivals', () => {
    const none = fixtureSummary({
      serviceLevel: {
        verdict: 'served',
        longestWaitS: null,
        longestWaitIsCensored: false,
        overHorizonCount: 0,
        arrivalCount: 0,
        horizonS: 900,
      },
    });
    expect(
      dayReportOf({
        recording: { ...clean, summary: none },
        observations: observationsOfRun(clean),
        goals: goalsForDay(4),
        week: openWeek('c2'),
        contract: contractById('c2'),
        event: SHIFT_EVENTS.ordinary,
        subject: { kind: 'week-day' },
      }).figures.find((cell) => cell.id === 'worst-wait')?.value,
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
      expect(report.smallPrint).toContain(recording.summary.reportWindow.id);
      expect(report.smallPrint).toContain(clockOf(recording.summary.reportWindow.startS));
      expect(report.smallPrint).toContain('during the busiest five minutes');
    }
  });

  it('files only rows that are events, on every run', () => {
    // Two, and both of them a moment: where the deepest queue stood, and the phase it stood in.
    for (const recording of [clean, saturated, missedWithoutSaturating]) {
      expect(reportOf(recording).diagnosis.map((row) => row.id)).toEqual([
        'peak-queue',
        'peak-phase',
      ]);
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
      subject: { kind: 'single-run', selection: SELECTION },
    }).metaLines.join('\n');
    expect(meta).not.toContain(SHIFT_EVENTS['move-in'].name);
  });

  it('clears the shift when every goal was met', () => {
    const report = reportOf(clean);
    expect(report.goals.every((reading) => reading.state === 'met')).toBe(true);
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
    expect(report.forecast.name).toBe(SHIFT_EVENTS['fire-drill'].name);
    expect(report.forecast.demand).toBe('+8.3% more tenants than today');
    expect(report.forecast.demand).not.toContain('+11');
    expect(report.nextDayName).toBe('Friday');
  });

  it('prints the small print, naming this run’s dispatcher', () => {
    const report = reportOf(clean);
    expect(report.smallPrint).toContain('one replication of one day on one seed');
    expect(report.smallPrint).toContain('50 or more paired runs');
    expect(report.smallPrint).toContain('confidence interval that excludes zero');
    expect(report.smallPrint).toContain(clean.dispatcherProfileId.toLowerCase());
  });

  it('says what is banked, and what is left to bank', () => {
    const report = reportOf(clean);
    expect(report.contractLine).toContain('Scenario 2 — The morning rush');
    expect(report.contractLine).toContain('clean shifts banked');
    expect(report.taught).toContain('Bank 1 more clean shift');
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
        subject: { kind: 'week-day' },
      }),
    );
    expect(report.contractLine).toContain('2 of 2 clean shifts banked');
    expect(report.contractLine).not.toContain('5 of');
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
    expect(report.goals.some((reading) => reading.state === 'missed')).toBe(true);
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
    const unmet = report.goals.filter((reading) => reading.state === 'missed');
    expect(unmet.length).toBeGreaterThan(0);
    for (const reading of unmet) expect(report.lede).toContain(reading.goal.label);
    for (const reading of report.goals.filter((r) => r.state === 'met')) {
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
    expect(report.goals.every((reading) => reading.state === 'pending')).toBe(true);
    expect(report.verdict).toBe('ungraded');
    expect(report.verdictLine).toBe('Too quiet to grade');
    expect(report.lede).toContain('Too quiet to grade');
    // The two counts that make the refusal actionable: what arrived, and what it needed.
    expect(report.lede).toContain(`${String(WAKE_UP_ARRIVALS)}`);
    expect(report.lede).toContain('4 people called');
    // And no goal named, on a day none was read.
    for (const reading of report.goals) {
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
    expect(outrun.levers.map((lever) => lever.id)).not.toEqual(
      quiet.levers.map((lever) => lever.id),
    );
    // The lever a day the building was outrun points at leads, and says why in the run's own counts.
    expect(outrun.levers[0]?.id).toBe('add-a-car');
    expect(leverBody(outrun, 'add-a-car')).toContain('Today points here');
    expect(leverBody(outrun, 'add-a-car')).toContain('backlog was still growing');
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
      ...report.goals.map((reading) => reading.goal.label),
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
    expect(report.contractLine).toContain('Scenario 2 — The morning rush');
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
    expect(meta).toContain('15 min selected');
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
     */
    const week = weekDay(sheetOf({ kind: 'week-day' }));
    const single = singleRun(sheetOf(SINGLE));
    expect(single.figures).toEqual(week.figures);
    expect(single.diagnosis).toEqual(week.diagnosis);
    expect(single.levers).toEqual(week.levers);
    expect(single.goals).toEqual(week.goals);
    expect(single.lede).toBe(week.lede);
    expect(single.verdict).toBe(week.verdict);
    expect(single.verdictLine).toBe(week.verdictLine);
    expect(single.smallPrint).toBe(week.smallPrint);
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
