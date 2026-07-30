/**
 * What the observation sheet is allowed to put on the screen.
 *
 * There is no jsdom in this repository, so the thing under test is the *view* — the pure descriptor
 * `mountReport` instantiates. That is not a weaker test than driving a DOM would be: every decision
 * this surface makes is in the descriptor, and a DOM assertion would be asserting `textContent`
 * against the same strings one indirection later.
 *
 * The four rules, and why each is here:
 *
 * 1. **A withheld mean is drawn as a word, not as a number.** On a really saturating configuration,
 *    not a hand-built summary — the interesting failure is a run that *has* a `meanWaitS` and must
 *    not print it.
 * 2. **A publishable mean is the summary's own, formatted once.** `shift/report.ts` formats it; this
 *    module must not reformat it, and "equals the right number" is asserted alongside "is not the
 *    number a second rounding would produce".
 * 3. **Energy is an axis, never a score** (§ D106). Both cells or neither, no ranking colour on
 *    either, no warning class, and no other cell carrying an energy unit.
 * 4. **No clock time the run did not have.** Every `HH:MM` anywhere in the drawn sheet is inside the
 *    recording's own span, and the mockup's `08:30` / `17:20` appear nowhere.
 */

import { loadConfig, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import type { VizRecording } from '../contract/types.js';
import { observationsAt } from '../live/observations.js';
import { contractById } from '../shift/contracts.js';
import { SHIFT_EVENTS } from '../shift/events.js';
import { GOAL_GLYPHS, goalsForDay, readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import { WITHHELD, clockOf, dayReportOf } from '../shift/report.js';
import type { DayReport, GoalReading, ReportFigure } from '../shift/types.js';
import { closeDay, openWeek, outcomeOf } from '../shift/week.js';

import {
  diagnosisRowsOf,
  emptyReportView,
  figureViewOf,
  goalRowViewOf,
  leverRowsOf,
  reportViewOf,
  toneColourOf,
  type FigureView,
  type ReportView,
} from './reportPanel.js';

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

/** The same fixture path `shift/report.test.ts` takes: one real run, folded at its own end. */
function reportOf(recording: VizRecording, day = 4): DayReport {
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
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

function viewOf(recording: VizRecording, day = 4): ReportView {
  return reportViewOf(reportOf(recording, day));
}

function cell(view: ReportView, label: string): FigureView {
  const found = view.figures.find((candidate) => candidate.label === label);
  if (found === undefined) throw new Error(`no "${label}" cell on the drawn sheet`);
  return found;
}

/**
 * Every string the sheet will put on the page **that is a reading off this recording**.
 *
 * Two families of string are excluded, and neither exclusion is hidden here — the suite below pins
 * both by name, so a clock time appearing anywhere else on the sheet is a failure:
 *
 * - **The four lever bodies.** *Zone the tower* reads *"Superb at 08:30, wasteful by mid-morning"* —
 *   generic lift-engineering advice about morning peaks, identical on every run and every building.
 * - **The forecast's event name and note.** `shift/events.ts` ships the handoff's event copy
 *   verbatim, and two of the five carry an office-day hour (*Fire drill, 14:00*, *half a car until
 *   11:30*). They are tomorrow's flavour text, not a reading of today's recording.
 *
 * Both are shipped by `shift/`, which this lane does not own. Everything derived from the run is in
 * the list below and is held to the rule without exception.
 */
function everyString(view: ReportView): readonly string[] {
  const out: string[] = [
    view.title,
    ...view.metaLines,
    view.lede,
    view.verdictLine,
    view.streakLine,
    view.contractLine,
    view.cleared?.note ?? '',
    view.forecast.demand,
    view.taught,
    view.smallPrint,
    view.nextDayLabel,
  ];
  for (const figure of view.figures) out.push(figure.label, figure.value, figure.note);
  for (const goal of view.goals) out.push(goal.label, goal.display, goal.help);
  for (const row of view.diagnosis) out.push(row.when, row.what, row.why);
  for (const lever of view.levers) out.push(lever.title);
  return out;
}

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  clean = runOf('garden-apartments', 12, 900);
  // `shift/report.test.ts`'s own saturating fixture: Midtown Office at 25 %pop/5 min.
  saturated = runOf('midtown-office', 25, 900);
}, 120_000);

describe('the premises this suite rests on', () => {
  it('has one run whose mean is publishable and one whose is not', () => {
    expect(clean.summary.awtIsValid && !clean.summary.saturated).toBe(true);
    expect(saturated.summary.saturated).toBe(true);
    expect(saturated.summary.awtIsValid).toBe(false);
    // Suppression is a refusal to print a number that exists, not the absence of one.
    expect(Number.isFinite(saturated.summary.meanWaitS)).toBe(true);
  });
});

describe('the average wait is whatever the shift layer produced, and nothing else', () => {
  it('draws the literal word on a saturated run, with no digit anywhere in the value', () => {
    const wait = cell(viewOf(saturated), 'AVERAGE WAIT');
    expect(wait.value).toBe(WITHHELD);
    expect(wait.value).not.toMatch(/\d/);
  });

  it('draws the run’s own reason as the note, verbatim', () => {
    expect(cell(viewOf(saturated), 'AVERAGE WAIT').note).toBe(saturated.summary.awtInvalidReason);
  });

  it('marks the refusal as a refusal, in the class a suppressed statistic already uses', () => {
    const wait = cell(viewOf(saturated), 'AVERAGE WAIT');
    expect(wait.classes).toContain('figure-suppressed');
    // KB-15: the colour is the second signal. The reason in the note is the first.
    expect(wait.colour).toBe('var(--warn)');
    expect(wait.note.length).toBeGreaterThan(20);
  });

  it('is the summary’s own mean, formatted once, on a clean run', () => {
    const wait = cell(viewOf(clean), 'AVERAGE WAIT');
    expect(wait.value).toBe(`${clean.summary.meanWaitS.toFixed(1)} s`);
    // Formatted once: a second rounding on the way to the screen would show here.
    expect(wait.value).not.toBe(`${clean.summary.meanWaitS.toFixed(0)} s`);
    expect(wait.classes).not.toContain('figure-suppressed');
  });

  it('is never the mockup’s arithmetic', () => {
    // `28 + (100 − pct) × 0.9` — a number computed from a different quantity to look plausible.
    const observations = shiftObservationsOf(observationsAt(clean, clean.endedAt));
    const mockup = Math.round(28 + (100 - observations.minutePct) * 0.9);
    expect(cell(viewOf(clean), 'AVERAGE WAIT').value).not.toBe(`${String(mockup)} s`);
  });
});

describe('energy is an axis, never a score — § D106', () => {
  const ENERGY_LABELS = ['WORK DONE', 'WORK PER DELIVERED LEG'] as const;

  it('draws both energy cells or neither, on both runs', () => {
    for (const recording of [clean, saturated]) {
      const view = viewOf(recording);
      const present = ENERGY_LABELS.map(
        (label) => view.figures.find((candidate) => candidate.label === label) !== undefined,
      );
      expect(new Set(present).size, 'both or neither').toBe(1);
      expect(present[0]).toBe(true);
    }
  });

  it('gives neither of them a ranking colour or a ranking class', () => {
    const view = viewOf(clean);
    for (const label of ENERGY_LABELS) {
      expect(cell(view, label).colour, label).toBeUndefined();
      expect(cell(view, label).classes, label).not.toContain('figure-warning');
      expect(cell(view, label).classes, label).not.toContain('figure-suppressed');
    }
  });

  it('refuses to rank an axis figure even if its tone said otherwise', () => {
    // The guard is on `axisOnly`, not on the tone agreeing with it. Asserted directly, because the
    // failure it prevents — a green `workKJ` congratulating the dispatcher that carries fewest
    // people — cannot be produced from the shipped shift layer and could be produced by an edit.
    const mislabelled: ReportFigure = {
      id: 'energy-work',
      label: 'WORK DONE',
      value: '1 200 kJ',
      note: 'an axis beside the waits, never a score',
      tone: 'good',
      axisOnly: true,
    };
    const drawn = figureViewOf(mislabelled);
    expect(drawn.colour).toBeUndefined();
    expect(drawn.classes).not.toContain('figure-warning');
  });

  it('puts an energy unit on no other cell, and marks no other cell as an axis', () => {
    const view = viewOf(clean);
    for (const drawn of view.figures) {
      if ((ENERGY_LABELS as readonly string[]).includes(drawn.label)) continue;
      expect(drawn.value, drawn.label).not.toContain('kJ');
      expect(drawn.classes, drawn.label).not.toContain('figure-axis');
    }
    expect(view.figures.filter((drawn) => drawn.classes.includes('figure-axis'))).toHaveLength(2);
  });

  it('puts the per-leg figure beside the total, in that order and adjacent', () => {
    // "`workPerServedLegKJ` always appears beside `workKJ`" — adjacency is the claim, so adjacency
    // is what is asserted rather than mere presence.
    const labels = viewOf(clean).figures.map((drawn) => drawn.label);
    expect(labels.indexOf('WORK PER DELIVERED LEG')).toBe(labels.indexOf('WORK DONE') + 1);
  });
});

describe('no clock time the run did not have', () => {
  it('prints only times inside the recording’s own span', () => {
    for (const recording of [clean, saturated]) {
      const inside = new Set<string>();
      for (let t = recording.startedAt; t <= recording.endedAt; t += 30) inside.add(clockOf(t));
      inside.add(clockOf(recording.endedAt));
      for (const text of everyString(viewOf(recording))) {
        for (const found of text.match(/\d{2}:\d{2}/g) ?? []) {
          expect(inside.has(found), `${found} in "${text}" is outside the run`).toBe(true);
        }
      }
    }
  });

  it('never prints the mockup’s two hard-coded times as a reading of this run', () => {
    for (const recording of [clean, saturated]) {
      for (const text of everyString(viewOf(recording))) {
        expect(text).not.toContain('08:30');
        expect(text).not.toContain('17:20');
      }
    }
  });

  it('prints no clock time anywhere that the run did not have — including in the advice', () => {
    /*
     * This assertion was **weaker** when it was written, and the exception it carried is gone.
     * It pinned two authored strings that named an hour no run contains: the *Zone the tower*
     * lever's "Superb at 08:30", and two of the five event names ("Fire drill, 14:00", "until
     * 11:30"). All three were the handoff's verbatim prose and none was a reading of a recording —
     * but a 30-minute shift starting at 06:00 has no 08:30 in it, so they were captions that did
     * not describe the picture under them (§ D175). They were re-sourced in `shift/`, and the
     * exception is replaced by the rule: **no clock time at all** outside the run's own span.
     */
    for (const recording of [clean, saturated]) {
      const view = reportViewOf(reportOf(recording));
      const levers = view.levers.filter((lever) => /\d{2}:\d{2}/.test(lever.body));
      expect(levers.map((lever) => lever.title)).toEqual([]);
      expect(/\d{2}:\d{2}/.test(view.forecast.name)).toBe(false);
      expect(/\d{2}:\d{2}/.test(view.forecast.note)).toBe(false);
      for (const text of [
        ...view.levers.map((lever) => lever.body),
        view.forecast.name,
        view.forecast.note,
      ]) {
        expect(text).not.toContain('17:20');
      }
    }
  });
});

describe('the empty state, which is drawn rather than hidden', () => {
  it('reads "Nothing filed yet" with the design’s placeholder lede', () => {
    const empty = reportViewOf(undefined);
    expect(empty).toEqual(emptyReportView());
    expect(empty.filed).toBe(false);
    expect(empty.title).toBe('Nothing filed yet');
    expect(empty.lede).toContain('the sheet fills itself in');
  });

  it('names a control that exists', () => {
    // The design's sentence says "Close the day". There is no such button; the day is filed by
    // running a shift, and `index.html`'s button says so.
    expect(emptyReportView().lede).toContain('Run this shift');
    expect(emptyReportView().lede).not.toContain('Close the day');
  });

  it('offers no figures, no goals, no diagnosis and nothing to advance to', () => {
    const empty = emptyReportView();
    expect(empty.figures).toEqual([]);
    expect(empty.goals).toEqual([]);
    expect(empty.diagnosis).toEqual([]);
    expect(empty.levers).toEqual([]);
    expect(empty.cleared).toBeNull();
    expect(empty.canAdvance).toBe(false);
  });

  it('names no weekday it has not earned', () => {
    expect(emptyReportView().nextDayLabel).toBe('Open the doors on tomorrow');
  });
});

describe('the rest of the sheet', () => {
  it('carries the shift layer’s title, meta lines, verdict and small print unchanged', () => {
    const report = reportOf(clean, 2);
    const view = reportViewOf(report);
    expect(view.title).toBe(report.title);
    expect(view.metaLines).toEqual(report.metaLines);
    expect(view.verdictLine).toBe(report.verdictLine);
    expect(view.smallPrint).toBe(report.smallPrint);
    expect(view.nextDayLabel).toBe(`Open the doors on ${report.nextDayName}`);
    expect(view.canAdvance).toBe(true);
  });

  it('colours a cleared verdict green and a missed one amber, never red', () => {
    // "Nothing here is a game over" — a missed shift is amber, which is the design's own choice
    // and is the difference between a warning and a failure.
    expect(reportViewOf(reportOf(clean)).verdictColour).toBe('var(--ok)');
    expect(reportViewOf(reportOf(saturated)).verdictColour).toBe('var(--warn)');
  });

  it('shows the cleared banner only when a day banked the last clean shift', () => {
    // Garden Apartments at a gentle rate clears `c2`'s single day; the saturated run does not.
    expect(reportViewOf(reportOf(saturated)).cleared).toBeNull();
    const report = reportOf(clean);
    if (report.cleared !== null) {
      const banner = reportViewOf(report).cleared;
      expect(banner?.note).toContain(report.cleared.reward);
      expect(banner?.note).toContain(report.cleared.nextTitle);
      expect(banner?.nextContractId).toBe(report.cleared.nextContractId);
    }
  });

  it('draws the four levers verbatim', () => {
    const report = reportOf(clean);
    expect(leverRowsOf(report.levers).map((row) => row.title)).toEqual([
      'Add a car',
      'Zone the tower',
      'Weight fairness up',
      'Ask where they’re going',
    ]);
  });

  it('accents a diagnosis row from its tone, and a plain row from nothing', () => {
    const rows = diagnosisRowsOf([
      { id: 'a', when: '—', what: 'w', why: 'y', tone: 'plain' },
      { id: 'b', when: '06:10', what: 'w', why: 'y', tone: 'bad' },
    ]);
    expect(rows[0]?.accent).toBe('var(--edge-strong)');
    expect(rows[1]?.accent).toBe('var(--bad)');
  });
});

describe('the goal rows carry a second, non-colour signal — KB-15', () => {
  const goal = goalsForDay(4)[0];

  function reading(state: GoalReading['state']): GoalReading {
    if (goal === undefined) throw new Error('goalsForDay(4) produced no goals');
    return {
      goal,
      state,
      observed: state === 'pending' ? null : 90,
      display: state === 'pending' ? '—' : '90%',
      progressPct: 0,
      glyph: GOAL_GLYPHS[state],
    };
  }

  it('gives every state a glyph and a word, not only a colour', () => {
    const seen = new Set<string>();
    for (const state of ['met', 'missed', 'pending'] as const) {
      const row = goalRowViewOf(reading(state));
      expect(row.glyph).toBe(GOAL_GLYPHS[state]);
      expect(row.help.length).toBeGreaterThan(0);
      seen.add(row.colour);
      seen.add(row.glyph);
    }
    // Three distinct glyphs and three distinct colours: neither signal collapses.
    expect(seen.size).toBe(6);
  });

  it('draws a pending goal as neither met nor missed', () => {
    const row = goalRowViewOf(reading('pending'));
    expect(row.background).toBe('transparent');
    expect(row.help).toContain('not graded');
    expect(row.display).toBe('—');
  });
});

describe('the tone map', () => {
  it('gives an unranked tone no colour at all', () => {
    expect(toneColourOf('unranked')).toBeUndefined();
    expect(toneColourOf('plain')).toBeUndefined();
  });

  it('gives every other tone a token from the shared palette, never a hex triple', () => {
    for (const tone of ['good', 'caution', 'hot', 'bad', 'withheld'] as const) {
      expect(toneColourOf(tone), tone).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });
});
