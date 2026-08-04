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
import { DAY_START_S, WEEKDAYS, type Observations } from './types.js';
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
}, 120_000);

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

  it('names the reporting window the cohort figures were computed over', () => {
    const report = reportOf(clean);
    const windowRow = report.diagnosis.find((row) => row.id === 'report-window');
    expect(windowRow?.what).toContain(clean.summary.reportWindow.id);
    expect(windowRow?.what).toContain(clockOf(clean.summary.reportWindow.startS));
  });

  it('always files three rows, whatever the run did', () => {
    expect(reportOf(clean).diagnosis).toHaveLength(3);
    expect(reportOf(saturated).diagnosis).toHaveLength(3);
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

  it('carries the four levers, verbatim', () => {
    const report = reportOf(clean);
    expect(report.levers.map((lever) => lever.title)).toEqual([
      'Add a car',
      'Zone the tower',
      'Weight fairness up',
      'Ask where they’re going',
    ]);
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

  it('points at Compare as data, and says why — and a week-day sheet does not', () => {
    const step = singleRun(sheetOf(SINGLE)).nextStep;
    expect(step.surface).toBe('compare');
    expect(step.label.length).toBeGreaterThan(0);
    // The two halves of docs/12 § 2.3: the same passengers, and the answer when it cannot tell.
    expect(step.why).toContain('same passengers');
    expect(step.why).toContain('indistinguishable');
    expect(step.why).toContain('interval contains zero');
    expect('nextStep' in weekDay(sheetOf({ kind: 'week-day' }))).toBe(false);
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
