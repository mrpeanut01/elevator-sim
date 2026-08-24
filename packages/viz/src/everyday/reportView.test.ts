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
 * Those sheets are built by hand rather than by `dayReportOf`, deliberately: a real sheet needs a
 * real recording, and what is under test there is the *view over a sheet* rather than the sheet.
 * `report.test.ts` and the honesty sweep both drive real ones.
 *
 * **The issue #211 suite at the foot of this file is the exception, and it says so in its own
 * docstring.** What that one is about is the 335-word paragraph a player actually meets, so the
 * sheet is the input rather than the fixture: one real recording, folded by `dayReportOf`, composed
 * into the Casual register by `reportViewOf`. A hand-written `smallPrint` would have proved that a
 * hand-written paragraph splits.
 */

import { loadConfig, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import type { TabName } from '../dev/elementMap.js';
import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { contractById } from '../shift/contracts.js';
import { SHIFT_EVENTS } from '../shift/events.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import {
  dayReportOf,
  type ReportBasis,
  type ShapedDayReport,
  type ShiftPlan,
  type WeekDayReport,
} from '../shift/report.js';
import type { ReportFigure } from '../shift/types.js';
import { closeDay, openWeek, outcomeOf } from '../shift/week.js';

import {
  everydayReportViewOf,
  SMALL_PRINT_BUDGET,
  type EverydayReportView,
  type HonestyPart,
} from './reportView.js';

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

/* -------------------------------------------------------------------------- *
 * The closing block, layered — GitHub issue #211
 * -------------------------------------------------------------------------- */

/**
 * **This suite drives a real day, and that is the point of it.**
 *
 * Every other case in this file builds its sheet by hand, for the reason the module docstring
 * gives: what is under test there is *the view over a sheet* rather than the sheet. Here the sheet
 * is the input — the thing being layered is the 335-word paragraph a player actually meets, and a
 * hand-written `smallPrint` would prove that a hand-written paragraph splits. So one real
 * recording is folded into one real `ShapedDayReport` by the same path `shift/report.test.ts` and
 * `dev/reportPanel.test.ts` take, and `everydayReportViewOf` composes the Casual register over it.
 *
 * What that reaches: `shift/report.ts#smallPrintFor`'s nine sentences, `mode/casualDay.ts`'s
 * `CASUAL_SMALL_PRINT_LEAD` in front of them and `CASUAL_REACH_NOTE` behind, joined by
 * `dev/reportPanel.ts#reportViewOf`. Nothing in the chain is a fixture except the building and the
 * arrival rate.
 */
let config: LoadedConfig;
let clean: VizRecording;

const PLAN: ShiftPlan = { shiftLengthS: 900, windowStartS: null, patternId: 'building' };

/** The same fixture path `dev/reportPanel.test.ts#reportOf` takes: one real run, folded at its end. */
function realReport(recording: VizRecording, day = 4): ShapedDayReport {
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const goals = goalsForDay(day);
  const opened = { ...openWeek('c2'), day, dayIdx: (day - 1) % 7 };
  const week = closeDay(
    opened,
    outcomeOf({
      record: null,
      recordRefusal: null,
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
    calendar: null,
    subject: { kind: 'week-day' },
    plan: PLAN,
  });
}

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const base: SimulationConfig = fixtureConfig(config, {
    buildingId: 'garden-apartments',
    durationS: 900,
    onTimeout: 'report',
  });
  clean = recordRun({ ...base, demand: { arrivalRatePctPop5min: 12 } }, { recordDecisions: false })
    .recording;
}, 300_000);

const words = (text: string): number => text.split(/\s+/u).filter(Boolean).length;

/** Every string the parts hold, in the order they are drawn. */
const laidOut = (parts: readonly HonestyPart[]): string[] =>
  parts.flatMap((part) => (part.kind === 'open' ? [part.text] : [part.handle, ...part.paragraphs]));

/** What a reader sees before pressing anything: the open text plus each fold's own handle. */
const drawnOpen = (parts: readonly HonestyPart[]): string[] =>
  parts.map((part) => (part.kind === 'open' ? part.text : part.handle));

const realView = (): EverydayReportView =>
  everydayReportViewOf({
    report: realReport(clean),
    previous: undefined,
    overnight: undefined,
    newerRunOnStage: false,
  });

describe('§ 6.5’s closing block is layered rather than one wall — issue #211', () => {
  it('loses not one word: the parts, joined, are the block byte for byte', () => {
    const view = realView();
    // The whole of issue #211's scope in one line — *nothing is removed; it is layered.* A part
    // list that dropped a clause, re-ordered two, or normalised a space would fail here.
    expect(laidOut(view.honesty.parts).join(' ')).toBe(view.honesty.body);
  });

  it('is the same string the honesty corpus reads, still one value', () => {
    // `honesty/surfaces.ts` seeds `view.honesty.body` as a single `role: 'reason'` string, and it
    // may not be edited by this lane. If the layering had replaced that field the sweep would have
    // lost the longest refusal in the product without failing anything.
    const view = realView();
    expect(typeof view.honesty.body).toBe('string');
    expect(view.honesty.body).toContain('This is one replication of one day on one seed.');
    expect(view.honesty.body).toContain('The “view” control switches between them.');
  });

  it('opens on the sheet’s own refusal, not on the mode’s front matter', () => {
    const view = realView();
    const open = view.honesty.parts.find((part) => part.kind === 'open');
    /*
     * The one claim that may not be behind a click. `honesty.body` is classified `reason` — a
     * refusal — and the refusal is *this is one replication of one day on one seed, it cannot tell
     * you that anything is better than anything*. A layering that folded that and left the
     * translations open would be § D299's *may not make it say less*, dressed as tidying.
     */
    expect(open?.kind === 'open' ? open.text : '').toContain(
      'This is one replication of one day on one seed.',
    );
    expect(open?.kind === 'open' ? open.text : '').toContain('50 or more paired runs');
  });

  it('keeps the block’s own order, so “Two phrases below” is still about what is below', () => {
    const view = realView();
    const drawn = laidOut(view.honesty.parts);
    const at = (needle: string): number => drawn.findIndex((text) => text.includes(needle));
    // Casual's lead announces two phrases *below* it and asks to be read *before* them. Hoisting
    // the sheet's refusal above it would read better and make that sentence false about its own
    // page — § D227's stale-position defect, manufactured.
    expect(at('Two phrases below are worth having')).toBe(0);
    expect(at('This is one replication')).toBeGreaterThan(at('Two phrases below are worth having'));
    expect(at('The “view” control switches between them.')).toBe(drawn.length - 1);
  });

  it('holds the stated budget: a short open block and no paragraph over the ceiling', () => {
    const view = realView();
    const open = drawnOpen(view.honesty.parts).reduce((sum, text) => sum + words(text), 0);
    expect(words(view.honesty.body)).toBeGreaterThan(300);
    expect(open).toBeLessThanOrEqual(SMALL_PRINT_BUDGET.open);
    // And the reduction is the fix rather than a rounding of it: a third of the block, not 90 % of
    // it. The issue's complaint is the wall, and a wall one word shorter is still the wall.
    expect(open).toBeLessThan(words(view.honesty.body) / 3);
    for (const text of laidOut(view.honesty.parts)) {
      expect(words(text), text).toBeLessThanOrEqual(SMALL_PRINT_BUDGET.paragraph);
    }
  });

  it('folds every word it does not draw open, so the rest is one press away', () => {
    const view = realView();
    const folded = view.honesty.parts.filter((part) => part.kind === 'fold');
    // Three layers fold on this sheet: what Casual says in front, the sheet's own remaining
    // sentences, and what Casual says behind. Each carries at least one paragraph, because a fold
    // with nothing behind it is a control that does nothing.
    expect(folded.length).toBeGreaterThanOrEqual(2);
    for (const fold of folded) {
      expect(fold.kind === 'fold' ? fold.paragraphs.length : 0).toBeGreaterThan(0);
    }
  });

  it('draws a single-sentence block open rather than folding it behind itself', () => {
    // The hand-built fixture's `smallPrint` is one sentence. A fold whose handle is the whole of
    // its own content would be a disclosure that discloses nothing.
    const parts = viewOf().honesty.parts;
    expect(parts.every((part) => part.kind === 'open' || part.paragraphs.length > 0)).toBe(true);
    expect(laidOut(parts).join(' ')).toBe(viewOf().honesty.body);
  });
});

/* -------------------------------------------------------------------------- *
 * The lever hand-off — GitHub issue #213
 * -------------------------------------------------------------------------- */

describe('the lever button says what it does — issue #213', () => {
  const labelFor = (panelNames?: Partial<Record<TabName, string>>): string | undefined =>
    everydayReportViewOf({
      report: sheetOf(),
      previous: undefined,
      overnight: undefined,
      newerRunOnStage: false,
      ...(panelNames === undefined ? {} : { panelNames }),
    }).levers.find((lever) => lever.title === 'Add a car')?.goLabel;

  it('names the panel when the document has one, and claims less when it does not', () => {
    /*
     * `reportScreen.ts` reads the Engineer tab button's own words rather than tabulating them, so
     * the two arms are *a panel was named* and *no such button in this document*. The narrower
     * sentence is the honest one, and it is what the press then does: with no tab button to press,
     * the swap hands over the simulator and selects nothing.
     */
    expect(labelFor({ building: 'Building' })).toBe('Open the simulator’s Building panel');
    expect(labelFor()).toBe('Open the simulator');
    expect(labelFor({ building: '' })).toBe('Open the simulator');
  });

  it('is authored in this module rather than in the mount, so a sweep can reach it', async () => {
    /*
     * The composed string used to live in `reportScreen.ts#mountReportScreen`, which
     * `honesty/derive.test.ts` excludes on the DOM mounts' shared ground — *what the four mounts
     * author of their own is geometry, class names and floor labels*. A player-facing claim was
     * therefore authored in the one half of this screen no sweep reads, which is why a button
     * promising a panel it did not open survived. It is a field of the view now, produced by
     * `everydayReportViewOf` — the declaration `EVERYDAY_DAILY_LOOP` already covers — so seeding it
     * is one line in a loop `honesty/surfaces.ts` already walks over `view.levers`.
     */
    expect(labelFor({ building: 'Building' })).toContain('Building');
    // And it is not a second producer of its own: `derive.test.ts` fails on an unclassified text
    // producer, and this lane may not add it to an adapter.
    expect(Object.keys(await import('./reportView.js'))).not.toContain('leverButtonLabel');
  });
});

describe('only a fabric lever may ever route — `docs/10` R2', () => {
  it('routes the two building cards and refuses the two dispatcher cards, in both directions', () => {
    const view = viewOf({
      report: sheetOf({
        levers: [
          { id: 'add-a-car', title: 'Add a car', body: 'A fourth shaft would absorb the peak.' },
          { id: 'zone-the-tower', title: 'Zone the tower', body: 'Split the bank.' },
          { id: 'weight-fairness', title: 'Weight fairness up', body: 'One landing waits.' },
          { id: 'ask-destination', title: 'Ask where they’re going', body: 'Fewer stops.' },
        ],
      }),
    });
    const surfaces = Object.fromEntries(view.levers.map((lever) => [lever.title, lever.surface]));
    expect(surfaces).toEqual({
      'Add a car': 'building',
      'Zone the tower': 'building',
      'Weight fairness up': undefined,
      'Ask where they’re going': undefined,
    });
    /*
     * And the refusal is on the card rather than only in a docstring. #213's stated criterion —
     * *every lever named on the report opens the surface that changes it* — would have routed all
     * four; the sheet says out loud why two of them do not, which is the difference between *we
     * did not wire it* and *a sheet may not send you there*.
     */
    for (const lever of view.levers) {
      expect(lever.surface === undefined, lever.title).toBe(lever.noSurfaceNote !== undefined);
    }
    expect(view.levers.filter((lever) => lever.noSurfaceNote !== undefined)).toHaveLength(2);
  });
});
