/**
 * *How it went* — GAMEPLAY § 6.5, and the four decisions this screen **reuses** rather than
 * re-makes.
 *
 * Every case below is really a case about `dev/reportPanel.ts#reportViewOf`, asked through the
 * Everyday screen: the point is not that that function is correct — `reportPanel.test.ts` owns
 * that — but that this screen's view is that function's output rather than a second rendering of
 * the same sheet. Each of the four was a defect once, and a second implementation of any of them
 * would be that defect back with a Casual accent:
 *
 * | property | the defect it closed |
 * |---|---|
 * | a withheld cell is the literal word | `docs/10` R3 — suppression replaces the number |
 * | energy carries no ranking colour | § D106 — `nearest-car` is on the Pareto front by being worst |
 * | a paired mean carries its count, per side | issue #137 — R13 clause one |
 * | the delta refuses on a different question | issues #117 and #102, § D311 |
 *
 * The sheets here are built by hand rather than by `dayReportOf`, deliberately: a real sheet needs
 * a real recording, and what is under test is the *view over a sheet* rather than the sheet.
 * `report.test.ts` and the honesty sweep both drive real ones.
 */

import { describe, expect, it } from 'vitest';

import type { ReportBasis, WeekDayReport } from '../shift/report.js';
import type { ReportFigure } from '../shift/types.js';

import { everydayReportViewOf } from './reportView.js';

const BASIS: ReportBasis = Object.freeze({
  buildingId: 'chancery-house',
  subject: 'week-day',
  demand: 'day 2 · an ordinary day',
  extent: '30 minutes from 06:00',
  patternId: 'building',
});

const figure = (over: Partial<ReportFigure> & Pick<ReportFigure, 'id' | 'label' | 'value'>): ReportFigure => ({
  note: 'over 1,204 legs in the peak-5min window',
  tone: 'plain',
  axisOnly: false,
  ...over,
});

const FIGURES: readonly ReportFigure[] = Object.freeze([
  figure({ id: 'average-wait', label: 'AVERAGE WAIT', value: '17.8 s', count: 1204 }),
  figure({
    id: 'worst-wait',
    label: 'WORST WAIT',
    value: '96 s',
    note: 'the longest single wait in the window',
  }),
  figure({ id: 'carried', label: 'CARRIED', value: '726', note: '726 of 726 who turned up' }),
  figure({
    id: 'energy',
    label: 'ENERGY',
    value: '41.2 kJ',
    note: 'an axis, never a score',
    tone: 'good',
    axisOnly: true,
  }),
]);

function sheetOf(over: Partial<WeekDayReport> = {}): WeekDayReport {
  return {
    of: 'week-day',
    basis: BASIS,
    title: 'Tuesday — day 2',
    nextStep: { surface: 'compare', label: 'Take it to Compare', why: 'Compare settles it.' },
    metaLines: ['Chancery House · Steady hand', 'seed 424242 · 30 minutes'],
    lede: 'A day it could handle.',
    figures: FIGURES,
    verdict: 'cleared',
    verdictLine: 'Shift cleared.',
    streakLine: '2 days running',
    contractLine: 'Scenario 1 · 1 of 2 clean shifts banked',
    cleared: null,
    goals: [],
    diagnosis: [],
    diagnosisHeading: 'How the day went',
    levers: [
      { id: 'add-a-car', title: 'Add a car', body: 'A fourth shaft would absorb the peak.' },
      {
        id: 'weight-fairness-up',
        title: 'Weight fairness up',
        body: 'The longest waits are all on one landing.',
      },
    ],
    forecast: { name: 'Wednesday', note: 'A conference.', demand: '+11% more tenants than today' },
    taught: 'Bank 1 more clean shift.',
    smallPrint: 'This is one replication of one day on one seed.',
    nextDayName: 'Wednesday',
    ...over,
  };
}

const viewOf = (over: Partial<Parameters<typeof everydayReportViewOf>[0]> = {}) =>
  everydayReportViewOf({
    report: sheetOf(),
    previous: undefined,
    overnight: undefined,
    newerRunOnStage: false,
    ...over,
  });

describe('the withheld cell is the literal word — `docs/10` R3', () => {
  it('draws `withheld` rather than a softened figure, and keeps the run’s own reason under it', () => {
    const refused = figure({
      id: 'average-wait',
      label: 'AVERAGE WAIT',
      value: 'withheld',
      note: 'the queue was still growing at the horizon',
      tone: 'withheld',
    });
    const view = viewOf({ report: sheetOf({ figures: [refused, ...FIGURES.slice(1)] }) });
    const cell = view.sheet.figures.find((entry) => entry.label === 'AVERAGE WAIT');
    expect(cell?.value).toBe('withheld');
    expect(cell?.note).toContain('the queue was still growing at the horizon');
  });

  it('leaves a refused cell with no count, because a refusal has no sample', () => {
    // The `count` field is `undefined` on a refusal by `ReportFigure`'s own rule; nothing in this
    // screen may put a denominator beside the word `withheld`.
    const refused = figure({
      id: 'average-wait',
      label: 'AVERAGE WAIT',
      value: 'withheld',
      note: 'the queue was still growing',
      tone: 'withheld',
    });
    expect(refused.count).toBeUndefined();
    const previous = sheetOf();
    const view = viewOf({ report: sheetOf({ figures: [refused, ...FIGURES.slice(1)] }), previous });
    // § D334: a figure this sheet withholds is not paired at all — it is named in the note.
    const paired = view.sheet.delta?.figures.map((row) => row.label) ?? [];
    expect(paired).not.toContain('AVERAGE WAIT');
    expect(view.sheet.delta?.note).toContain('AVERAGE WAIT');
  });
});

describe('energy is an axis and never a score — § D106', () => {
  it('draws the energy cell with no ranking colour, whatever tone it arrived carrying', () => {
    const cell = viewOf().sheet.figures.find((entry) => entry.label === 'ENERGY');
    // The fixture deliberately sets `tone: 'good'` on an `axisOnly` cell. `figureViewOf` checks
    // `axisOnly` **before** the tone, so the guard does not depend on two fields agreeing.
    expect(cell?.colour).toBeUndefined();
    expect(cell?.classes).toContain('figure-axis');
    expect(cell?.classes).not.toContain('figure-warning');
  });

  it('does colour a ranked cell, so the case above is not vacuous', () => {
    const hot = figure({ id: 'worst-wait', label: 'WORST WAIT', value: '412 s', tone: 'bad' });
    const view = viewOf({ report: sheetOf({ figures: [hot] }) });
    expect(view.sheet.figures[0]?.colour).toBeDefined();
  });
});

describe('a paired mean carries its count, one per side — issue #137', () => {
  it('attaches each denominator to the value it is the denominator of', () => {
    const previous = sheetOf({
      figures: [
        figure({
          id: 'average-wait',
          label: 'AVERAGE WAIT',
          value: '23.4 s',
          note: 'over 1,198 legs in the peak-5min window',
          count: 1198,
        }),
        ...FIGURES.slice(1),
      ],
    });
    const row = viewOf({ previous }).sheet.delta?.figures.find(
      (entry) => entry.label === 'AVERAGE WAIT',
    );
    expect(row?.before).toBe('23.4 s');
    expect(row?.after).toBe('17.8 s');
    // Two runs, two cohorts — one `n` under both would be a claim neither sheet made.
    expect(row?.beforeCount).toContain('1,198');
    expect(row?.afterCount).toContain('1,204');
  });

  it('gives an observation no count at all, because it is not a mean over a sample', () => {
    const previous = sheetOf({
      figures: [
        FIGURES[0] as ReportFigure,
        FIGURES[1] as ReportFigure,
        figure({ id: 'carried', label: 'CARRIED', value: '701', note: '701 of 726 who turned up' }),
        FIGURES[3] as ReportFigure,
      ],
    });
    const row = viewOf({ previous }).sheet.delta?.figures.find((entry) => entry.label === 'CARRIED');
    expect(row?.before).toBe('701');
    expect(row?.beforeCount).toBeNull();
    expect(row?.afterCount).toBeNull();
  });
});

describe('the delta refuses when the two sheets answer different questions — § D311', () => {
  it('draws no figure rows, names the axis, and keeps the identity rows under the refusal', () => {
    const previous = sheetOf({
      title: 'Monday — day 1',
      metaLines: ['Midtown Office · Steady hand', 'seed 424242 · 30 minutes'],
      basis: { ...BASIS, buildingId: 'midtown-office' },
    });
    const delta = viewOf({ previous }).sheet.delta;
    expect(delta?.refused?.differsOn).toEqual(['in a different building']);
    expect(delta?.figures).toEqual([]);
    // The identity rows stay: they are the reason there is no comparison, not the comparison.
    expect(delta?.selection.map((row) => row.label)).toContain('BUILDING & DISPATCHER');
    expect(delta?.note).toContain('Nothing here is a comparison');
  });

  it('pairs the figures when the two sheets are of the same question', () => {
    const previous = sheetOf({
      metaLines: ['Chancery House · Collective', 'seed 424242 · 30 minutes'],
      figures: [
        figure({ id: 'average-wait', label: 'AVERAGE WAIT', value: '23.4 s', count: 1198 }),
        ...FIGURES.slice(1),
      ],
    });
    const delta = viewOf({ previous }).sheet.delta;
    expect(delta?.refused).toBeNull();
    expect(delta?.figures.length).toBeGreaterThan(0);
  });
});

describe('what this screen adds on top of the sheet', () => {
  it('draws its own empty state, naming no Engineer control', () => {
    const view = viewOf({ report: undefined });
    expect(view.filed).toBe(false);
    expect(view.emptyLede).toContain('Close the day');
    // `reportPanel.ts`'s own empty lede says *press "Run this shift"*, which is the other shell's
    // button. § 16 rule 11's neighbouring rule: no other surface's vocabulary on a Casual screen.
    expect(view.emptyLede).not.toContain('Run this shift');
  });

  it('keeps `LEVER_SURFACES`’ restraint — a dispatcher lever gets no button, and says why', () => {
    const view = viewOf();
    const fabric = view.levers.find((lever) => lever.title === 'Add a car');
    const dispatcher = view.levers.find((lever) => lever.title === 'Weight fairness up');
    expect(fabric?.surface).toBe('building');
    expect(fabric?.noSurfaceNote).toBeUndefined();
    // R2: a sheet may say what today showed and may not point at the control that would make one
    // profile beat another. The card keeps its words and loses its button, and says so.
    expect(dispatcher?.surface).toBeUndefined();
    expect(dispatcher?.noSurfaceNote).toMatch(/one day is not evidence/);
  });

  it('offers one button into tomorrow on a filed week-day sheet, and none on an empty one', () => {
    expect(viewOf().tomorrow?.label).toBe('Open the doors on Wednesday');
    expect(viewOf({ report: undefined }).tomorrow).toBeUndefined();
  });

  it('warns when a newer unfiled run is on the stage, so the sheet is not read as that run', () => {
    expect(viewOf().staleNote).toBeUndefined();
    expect(viewOf({ newerRunOnStage: true }).staleNote).toMatch(/last day you closed/);
  });

  it('quotes the sheet’s own small print as the closing block, unedited in the middle', () => {
    // Casual leads and follows it; § D299's rule is that a mode may make it easier to read and may
    // not make it say less, so the sheet's own sentence must still be in there byte for byte.
    expect(viewOf().honesty.body).toContain('This is one replication of one day on one seed.');
    expect(viewOf().honesty.title).toBe('This was one day');
  });
});
