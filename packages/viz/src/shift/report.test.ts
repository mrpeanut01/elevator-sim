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
import { NOT_RECORDED, WITHHELD, averageWaitFigure, clockOf, dayReportOf } from './report.js';
import { closeDay, openWeek, outcomeOf } from './week.js';
import { DAY_START_S, type DayReport, type Observations } from './types.js';
import { readGoals } from './goals.js';

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
function reportOf(recording: VizRecording, day = 4): DayReport {
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
  return dayReportOf({
    recording,
    observations,
    goals,
    week,
    contract: contractById('c2'),
    event: SHIFT_EVENTS.ordinary,
  });
}

function figure(report: DayReport, id: string): { value: string; note: string; tone: string; axisOnly: boolean } {
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

  it('grades a reader’s own building without pretending it banks anything', () => {
    const report = dayReportOf({
      recording: clean,
      observations: observationsOfRun(clean),
      goals: goalsForDay(4),
      week: openWeek('c2'),
      contract: undefined,
      event: SHIFT_EVENTS.ordinary,
    });
    expect(report.contractLine).toContain('nothing is being banked');
    expect(report.taught).toContain('Nothing banks here');
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
