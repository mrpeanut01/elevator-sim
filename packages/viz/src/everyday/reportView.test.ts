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

import { RENEWAL_AHEAD_ON_SHEET_DAYS, renewalAheadSentenceOf } from '../campaign/career.js';
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
  FIGURE_NOTE_HANDLE,
  REPORT_PRACTICE_AGAIN,
  WEEK_SHEET_STEP,
  figureNotePartsOf,
  REPORT_PROSE_BUDGET,
  reportProsePartsOf,
  REPORT_LEVERS_OPTIONAL_HEADING,
  comparablePreviousOf,
} from './reportView.js';
import { PRESS_CALL_ROW_ID } from '../shift/callRow.js';

const BASIS: ReportBasis = Object.freeze({
  buildingId: 'chancery-house',
  subject: 'week-day',
  demand: 'day 2 · an ordinary day',
  extent: '30 minutes from 06:00',
  patternId: 'building',
  equipment: '',
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
    /*
     * The cell the sheet leads with — § D666, and `carried` is what `shift/report.ts` names on
     * every run whose mean is published. `dev/reportPanel.ts` hoists it, so the grid this fixture
     * is drawn into leads with CARRIED rather than with the order declared below; nothing in this
     * file asserts a multi-cell order, and the one case that reads `figures[0]` passes a
     * single-cell grid.
     */
    headlineFigureId: 'carried',
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
        id: 'weight-fairness',
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

  it('gives a dispatcher lever a button into the workshop, and keeps R2’s honesty on the card', () => {
    const view = viewOf();
    const fabric = view.levers.find((lever) => lever.title === 'Add a car');
    const dispatcher = view.levers.find((lever) => lever.title === 'Weight fairness up');
    expect(fabric?.route).toEqual({ kind: 'everyday', screen: 'tuner' });
    expect(fabric?.noSurfaceNote).toBeUndefined();
    expect(fabric?.caveat).toBeUndefined();
    // R2: a sheet may say what today showed and may not claim one profile beats another. The card
    // opens the control the advice is about and says, beside the button, that one day is not
    // evidence — the owner's ruling on #213 kept the honesty and removed the refusal.
    expect(dispatcher?.route).toEqual({ kind: 'everyday', screen: 'workshop' });
    expect(dispatcher?.noSurfaceNote).toBeUndefined();
    expect(dispatcher?.caveat).toMatch(/One day is not evidence/u);
  });

  it('offers one button into tomorrow on a filed week-day sheet, and none on an empty one', () => {
    expect(viewOf().tomorrow?.label).toBe('Open the doors on Wednesday');
    expect(viewOf().tomorrow?.goes).toBe('daily-tomorrow');
    expect(viewOf({ report: undefined }).tomorrow).toBeUndefined();
  });

  /*
   * Wave AL, lane AL-A, the post-AK panel's seat D (H2), under § D1141. A run on a link's crowd is
   * practice and closes nothing into the week, and its sheet still offered *Open the doors on
   * Thursday*: pressed, it skipped the counted Wednesday the sentence above it said stays open.
   */
  it('offers no button into tomorrow on a sheet whose crowd kept the day open, and keeps it on a retake’s', () => {
    const open = viewOf({ report: sheetOf({ practiceNote: 'Practice.', dayStaysOpen: true }) });
    expect(open.tomorrow).toBeUndefined();
    expect(open.sheet.framing.kind === 'week-day' && open.sheet.framing.canAdvance).toBe(false);
    /* A retake's practice close follows a close that banked, so its week has a real next day. */
    const retake = viewOf({ report: sheetOf({ practiceNote: 'Practice.' }) });
    expect(retake.tomorrow?.label).toBe('Open the doors on Wednesday');
  });

  /*
   * Swarm DN's Q2.2 and Q2.3, lane AL-F (§ D1226, § D1227). The close that meets the week's target
   * carries its line under the verdict, and the close that closes the week leads to its sheet rather
   * than to a tomorrow that would roll the week under the player unseen.
   */
  it('carries the target’s mark on the close that met it, and nothing on any other', () => {
    const mark = 'This week’s target is met, on Thursday: 4 clean counted days, and it asks for 4 of 5.';
    expect(viewOf({ report: sheetOf({ weekMark: mark }) }).weekMark).toBe(mark);
    expect(viewOf().weekMark).toBeUndefined();
  });

  it('opens the week’s sheet from the close that closed the week', () => {
    const closing = viewOf({ report: sheetOf({ weekClosed: true }) });
    expect(closing.tomorrow).toEqual(WEEK_SHEET_STEP);
    expect(closing.tomorrow?.goes).toBe('week-sheet');
    // A career sheet keeps its own onward step whatever the week standing behind it says.
    const career = viewOf({
      report: sheetOf({ weekClosed: true }),
      career: { buildingName: 'Garden Apartments', day: 4, canRunAnother: true, renewalDue: false },
    });
    expect(career.tomorrow?.goes).toBe('career-day');
  });

  /*
   * Wave AM, lane AM-C, swarm DO's § 1 ruling (§ D1246 to § D1250). The daily close leads with the
   * week against the house and tomorrow; the note under the onward press says what it does.
   */
  it('says the onward press opens the brief, and never that it starts the day — § D1250', () => {
    const note = viewOf().tomorrow?.note ?? '';
    expect(note).toContain('brief');
    expect(note).not.toContain('starts it');
  });

  it('leads a daily close with the week against the house and tomorrow, and draws no lead elsewhere', () => {
    let week = openWeek('c2');
    week = closeDay(
      week,
      outcomeOf({
        day: 1,
        dayIdx: 0,
        eventId: 'ordinary',
        arrived: 400,
        carried: 380,
        minutePct: 90,
        readings: [],
        record: null,
        recordRefusal: null,
      }),
    );
    const onward = {
      day: 2,
      dayIdx: 1,
      weekday: 'Tuesday',
      eventId: 'move-in:past-halfway',
      name: 'Move-in day',
      note: 'A tenant is hauling boxes up.',
      demand: '+2.0% more tenants than today',
      newWeek: false,
      week: 1,
    };
    const report = sheetOf({ onward, decidingCall: 'No call decided today: the stage raised none.' });
    const view = viewOf({ report, week, house: () => 'missed' });
    /* The week's number since wave AN, lane AN-7 (§ D1252's ordinal, on the screen). */
    expect(view.close?.tomorrow.heading).toBe('TOMORROW · WEEK 1 · TUESDAY, DAY 2');
    expect(view.close?.tomorrow.wrinkle).toBe('Move-in day: A tenant is hauling boxes up.');
    expect(view.close?.call).toBe('No call decided today: the stage raised none.');
    expect(view.close?.arithmetic).toBeDefined();
    expect(view.secondary).toEqual({ week: 'Your week', menu: 'Main menu' });
    // No week handed in (every caller but the daily report), a career sheet, or a practice close: no lead.
    expect(viewOf({ report }).close).toBeUndefined();
    expect(
      viewOf({ report, week, career: { buildingName: 'Garden Apartments', day: 4, canRunAnother: true, renewalDue: false } }).close,
    ).toBeUndefined();
    expect(viewOf({ report: sheetOf({ onward, practiceNote: 'Practice.' }), week }).close).toBeUndefined();
  });

  /*
   * Wave AN, lane DQ-3, § D1351: the close says what decided a day no call decided from the shell's
   * driver run, which reaches the view as `driver` beside `house`. Without it the run is still being
   * run, and the line says so rather than guessing.
   */
  it('reads the shell’s driver run into the close’s call line — § D1351', () => {
    const MET = {
      arrived: 400,
      carryPct: 100,
      minutePct: 100,
      peakQueue: 0,
      abandoned: 0,
      abandonedCarried: 0,
      horizonS: 900,
      worstWaitS: 40,
      worstWaitIsCensored: false,
      workPerServedLegKJ: 41.2,
    };
    const week = closeDay(
      openWeek('c2'),
      outcomeOf({
        day: 1,
        dayIdx: 0,
        eventId: 'ordinary',
        arrived: 400,
        carried: 400,
        minutePct: 100,
        readings: readGoals(goalsForDay(1), MET),
        record: {
          version: 3,
          seed: '1',
          buildingId: 'midtown-office',
          dispatcherId: 'fairness-first',
          pattern: 'building',
          demandTemplateId: null,
          arrivalRatePctPop5min: null,
          shiftLengthS: 36_000,
          windowStartS: null,
          day: 1,
          dayIdx: 0,
          outOfServiceCarIds: [],
          interventions: [{ atS: 2_400, change: { kind: 'park-cars-lobby' } }],
          ruleRows: [],
          rungContractId: null,
        },
        recordRefusal: null,
      }),
    );
    const onward = {
      day: 2,
      dayIdx: 1,
      weekday: 'Tuesday',
      eventId: 'move-in:past-halfway',
      name: 'Move-in day',
      note: 'A tenant is hauling boxes up.',
      demand: '+2.0% more tenants than today',
      newWeek: false,
      week: 1,
    };
    const raised = 'No call decided today: the stage raised none.';
    const report = sheetOf({ onward, decidingCall: raised, callDecided: false });
    expect(viewOf({ report, week, house: () => 'cleared', driver: () => 'missed' }).close?.call).toBe(
      `${raised} Your driver did: on this crowd, the same day with the tower’s standing order picked in place of ` +
        'yours and every press kept read Shift missed.',
    );
    expect(viewOf({ report, week, house: () => 'cleared' }).close?.call).toBe(
      `${raised} What decided it is still being run: the same day with the tower’s standing order picked in place ` +
        'of yours and every press kept.',
    );
  });

  /*
   * GitHub issue #577. The unit half of the fix — `campaignJourney.browser.test.ts` holds the half
   * that matters, because the defect was a composition of three correct modules and only the crumbs
   * after the press can show it. What is worth pinning here is that the **daily arm is reached by
   * every caller that does not say otherwise**, which is what keeps the honesty corpus, the replay
   * and the daily loop on the label they have always had.
   */
  const CAREER = Object.freeze({ buildingName: 'Garden Apartments', day: 4, canRunAnother: true, renewalDue: false });

  it('opens the career’s own next day from a career sheet, naming the day and the building — #577', () => {
    const view = viewOf({ career: CAREER });
    expect(view.tomorrow?.label).toBe('Open the doors on day 4 at Garden Apartments');
    expect(view.tomorrow?.goes).toBe('career-day');
    // The words say where the press leaves you, because the whole of #577 is a player who could
    // not tell a career day from a daily one.
    expect(view.tomorrow?.note).toContain('You stay in the career');
    // And the daily loop's own label is not reachable from a career sheet at all.
    expect(view.tomorrow?.label).not.toContain('Wednesday');
  });

  it('offers no button once the contract has filed its last day — #577', () => {
    // `campaign/career.ts#fileDay` refuses a twenty-first day, so a button promising one would be a
    // control that cannot do what it says. An absent control is the honest state; the bar's own
    // `Back to ⟨building⟩` carries the player to the desk that has the renewal. Since § D1274 a
    // standing renewal takes this sheet to the desk first (the case below), so this arm is the
    // refusal for a month run out with no renewal standing, which the record cannot produce today.
    expect(viewOf({ career: { ...CAREER, canRunAnother: false } }).tomorrow).toBeUndefined();
  });

  /*
   * GitHub issue #582 item 3, [§ D1274](../../../../DECISIONS.md). Day 18's sheet offered *Open the
   * doors on day 19* and the press ran day 19, while the building's desk refuses to run that day
   * until the renewal is answered: measured on the built bundle with a career seeded on day 18, the
   * press landed on the stage with the dock reading *day 19 of 20* and no answer given. So where the
   * renewal stands the onward step is the renewal, and it says so before the press.
   */
  it('sends the career to the renewal, not past it, once day 20 has closed — #582, § D1357', () => {
    // Since § D1357 the renewal stands once day 20 is filed, so this is day 20's sheet.
    const due = viewOf({ career: { ...CAREER, day: 21, canRunAnother: false, renewalDue: true } }).tomorrow;
    expect(due?.goes).toBe('career-desk');
    expect(due?.label).toBe('Answer the renewal at Garden Apartments');
    expect(due?.label).not.toContain('Open the doors');
    // It names the day that waits on the answer.
    expect(due?.note).toContain('Day 20 has closed and the contract is up for renewal');
    expect(due?.note).toContain('The next month’s first day does not run until it is answered');
    expect(due?.note).toContain('You stay in the career');
    // The other polarity: a day with no renewal standing still opens the next day.
    expect(viewOf({ career: { ...CAREER, day: 18 } }).tomorrow?.goes).toBe('career-day');
  });

  /*
   * [§ D1357](../../../../DECISIONS.md): days 19 and 20 play, and the sheets of day 18 and day 19 say
   * when the renewal falls due, on the step that opens the next day. Red before: day 18's sheet went
   * to the desk, and no sheet named the date.
   */
  it('opens days 19 and 20 from the sheets before them, saying when the renewal falls due — § D1357', () => {
    for (const [day, left] of [[19, '2 working days'], [20, '1 working day']] as const) {
      const tower = { day };
      const step = viewOf({
        career: { ...CAREER, day, renewalAhead: renewalAheadSentenceOf(tower, RENEWAL_AHEAD_ON_SHEET_DAYS) },
      }).tomorrow;
      expect(step?.goes).toBe('career-day');
      expect(step?.label).toBe(`Open the doors on day ${String(day)} at Garden Apartments`);
      expect(step?.note).toBe(
        `Runs the next day of this contract. A renewal falls due when day 20 closes, in ${left}. You stay in the career.`,
      );
    }
    // Earlier sheets carry the step's own note and nothing about the renewal.
    expect(renewalAheadSentenceOf({ day: 18 }, RENEWAL_AHEAD_ON_SHEET_DAYS)).toBeUndefined();
    expect(viewOf({ career: CAREER }).tomorrow?.note).toBe('Runs the next day of this contract. You stay in the career.');
  });

  /*
   * The post-AN panel's seat C, D2, wave AO lane AO-5, § D1392: the sheet of the day that spends the
   * allowance goes to the desk, where the month is started again, and never to a renewal a lost
   * contract is not offered. The sentence is `campaign/career.ts#contractLostSentenceOf`'s.
   */
  it('sends a lost contract to the desk, ahead of a renewal and of the next day — § D1392', () => {
    const lost = '4 days missed, and standard allows 3, so this contract is lost.';
    for (const career of [
      { ...CAREER, day: 21, canRunAnother: false, renewalDue: false, contractLost: lost },
      { ...CAREER, day: 9, canRunAnother: false, renewalDue: false, contractLost: lost },
    ]) {
      const step = viewOf({ career }).tomorrow;
      expect(step?.goes).toBe('career-desk');
      expect(step?.label).toBe('Open the desk at Garden Apartments');
      expect(step?.note).toContain(lost);
      expect(step?.note).toContain('No more of its days run');
      expect(step?.label).not.toContain('renewal');
    }
  });

  it('leaves every non-career caller on the daily arm — #577’s other polarity', () => {
    // Passing nothing is *this is not a career day*, which is what the corpus, the replay and the
    // daily loop all do. A repair that had made the career arm the default would fail here.
    expect(viewOf({ career: undefined }).tomorrow?.label).toBe('Open the doors on Wednesday');
    expect(viewOf({ career: undefined }).tomorrow?.goes).toBe('daily-tomorrow');
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
/**
 * A run whose mean the summary refuses — the branch § D666 is about.
 *
 * A real shipped configuration rather than a hand-built summary, for the reason the clean one is:
 * the interesting sheet is one the simulator actually produces, and what is under test here is
 * which cell the Everyday screen ends up leading with once both orderings have composed.
 */
let saturated: VizRecording;

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
  const outrun: SimulationConfig = fixtureConfig(config, {
    buildingId: 'midtown-office',
    durationS: 900,
    onTimeout: 'report',
  });
  saturated = recordRun(
    { ...outrun, demand: { arrivalRatePctPop5min: 25 } },
    { recordDecisions: false },
  ).recording;
}, 300_000);

const words = (text: string): number => text.split(/\s+/u).filter(Boolean).length;

/** Every string the parts hold, in the order they are drawn. */
const laidOut = (parts: readonly HonestyPart[]): string[] =>
  parts.flatMap((part) => (part.kind === 'open' ? [part.text] : [part.handle, ...part.paragraphs]));

/** What a reader sees before pressing anything: the open text plus each fold's own handle. */
const drawnOpen = (parts: readonly HonestyPart[]): string[] =>
  parts.map((part) => (part.kind === 'open' ? part.text : part.handle));

const realView = (recording: VizRecording = clean): EverydayReportView =>
  everydayReportViewOf({
    report: realReport(recording),
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
      report: sheetOf({
        levers: [{ id: 'zone-the-tower', title: 'Zone the tower', body: 'Split the bank during the peak.' }],
      }),
      previous: undefined,
      overnight: undefined,
      newerRunOnStage: false,
      ...(panelNames === undefined ? {} : { panelNames }),
    }).levers.find((lever) => lever.title === 'Zone the tower')?.goLabel;

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

describe('every lever routes, and a dispatcher lever keeps its honesty on the card — the owner’s ruling on #213', () => {
  it('routes all four: the tuner, the Building panel, and the workshop twice, with the caveat on the workshop pair', () => {
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
    const routes = Object.fromEntries(view.levers.map((lever) => [lever.title, lever.route]));
    expect(routes).toEqual({
      'Add a car': { kind: 'everyday', screen: 'tuner' },
      'Zone the tower': { kind: 'engineer', tab: 'building' },
      'Weight fairness up': { kind: 'everyday', screen: 'workshop' },
      'Ask where they’re going': { kind: 'everyday', screen: 'workshop' },
    });
    const labels = Object.fromEntries(view.levers.map((lever) => [lever.title, lever.goLabel]));
    expect(labels).toEqual({
      'Add a car': 'Open the sandbox',
      'Zone the tower': 'Open the simulator',
      'Weight fairness up': 'Open the dispatcher workshop',
      'Ask where they’re going': 'Open the dispatcher workshop',
    });
    /*
     * The honesty the old refusal carried is on the card beside the button, and only on the
     * dispatcher pair: `docs/10` R2 forbids the comparative claim, not the door.
     */
    for (const lever of view.levers) {
      expect(lever.route === undefined, lever.title).toBe(lever.noSurfaceNote !== undefined);
      expect(lever.route === undefined, lever.title).toBe(lever.goLabel === undefined);
      expect(lever.caveat !== undefined, lever.title).toBe(lever.route?.kind === 'everyday' && lever.route.screen === 'workshop');
      expect(lever.caveat ?? '').not.toMatch(/\bbetter than\b/u);
    }
    expect(view.levers.filter((lever) => lever.noSurfaceNote !== undefined)).toHaveLength(0);
  });

  it('draws the no-surface note only for a lever this build cannot route', () => {
    const view = viewOf({
      report: sheetOf({ levers: [{ id: 'fifth-lever', title: 'Something new', body: 'Not routed.' }] }),
    });
    expect(view.levers[0]?.route).toBeUndefined();
    expect(view.levers[0]?.goLabel).toBeUndefined();
    expect(view.levers[0]?.noSurfaceNote).toContain('does not know');
  });
});

/**
 * GitHub issue #211's other slot — the figure cards. The split is the renderer's and the producer
 * is unchanged, so the corpus keeps reading the whole note; what these cases hold is that nothing
 * is deleted or re-ordered by the fold, and that the budget is a ceiling measured on real copy.
 */
/**
 * § D666 — what the Everyday player meets where the mean used to be.
 *
 * Driven on **real** sheets rather than the hand-built fixture above, for the reason the issue
 * #211 suite gives: what is under test is which cell survives two orderings composing, and a
 * hand-written grid would have proved that a hand-written grid re-orders. This screen re-uses
 * `dev/reportPanel.ts#reportViewOf` in the Casual register, which is the register that would have
 * ranked the sheet's own lead back into the middle of the grid.
 */
describe('the sheet leads with a figure the run produced when its mean is refused — § D666', () => {
  it('leads the Casual grid with the tightest moment, and keeps the refusal on it', () => {
    const view = realView(saturated);
    expect(view.sheet.figures[0]?.label).toBe('DEEPEST QUEUE');
    const lead = view.sheet.figures[0];
    // A count of people, not a number of seconds, and not the word `withheld`.
    expect(lead?.value).toMatch(/^\d+$/u);
    expect(Number(lead?.value)).toBeGreaterThan(0);
    const wait = view.sheet.figures.find((cell) => cell.label === 'AVERAGE WAIT');
    expect(wait?.value).toBe('withheld');
    // The refusal is still the run's own words, Casual's lead in front of them and nothing else —
    // the property the R3 suite at the top of this file holds, re-asserted on the promoted sheet.
    expect(wait?.note).toContain('There is no number here');
  });

  it('carries the promoted cell’s denominator in its own note — R13 through the Casual register', () => {
    const view = realView(saturated);
    const observations = shiftObservationsOf(observationsAt(saturated, saturated.endedAt));
    const lead = view.sheet.figures[0];
    expect(lead?.note).toContain(String(observations.arrived));
    expect(lead?.note).toContain(`floor ${String(observations.peakQueueFloorId)}`);
  });

  it('moves nothing on a day the mean is published', () => {
    const view = realView();
    expect(view.sheet.figures[0]?.label).toBe('CARRIED');
    expect(view.sheet.figures.find((cell) => cell.label === 'AVERAGE WAIT')?.value).not.toBe(
      'withheld',
    );
  });

  it('draws every cell on both branches — the promotion is a reorder, never a filter', () => {
    const labels = (view: EverydayReportView) =>
      [...view.sheet.figures.map((cell) => cell.label)].sort();
    expect(labels(realView(saturated))).toEqual(labels(realView()));
  });
});

describe('a figure card’s note leads with its first sentence and folds the rest — issue #211', () => {
  it('joins back to the note byte for byte, and folds only what is over the budget', () => {
    const short = 'One sentence, under the budget.';
    expect(figureNotePartsOf(short)).toEqual({ lead: short, rest: undefined });
    const two = 'A first sentence that says the thing. A second sentence that says why, at some length, with more words than the first.';
    const parts = figureNotePartsOf(two);
    expect(parts.rest).toBeUndefined();
    const long = `${two} A third sentence, because the note keeps going. A fourth sentence, and by now the reader has stopped reading anyway.`;
    const folded = figureNotePartsOf(long);
    expect(folded.rest).toBeDefined();
    expect(`${folded.lead} ${folded.rest ?? ''}`).toBe(long);
    expect(folded.lead).toBe('A first sentence that says the thing.');
  });

  it('holds every card of a real sheet: lead within the budget, nothing lost', () => {
    /* The Everyday sheet, whose cards carry the Casual lead in front of the engineer's caption. */
    const shaped = realView().sheet;
    for (const cell of shaped.figures) {
      const parts = figureNotePartsOf(cell.note);
      const words = (text: string): number => text.split(/\s+/u).filter(Boolean).length;
      if (parts.rest === undefined) {
        expect(parts.lead).toBe(cell.note);
      } else {
        expect(`${parts.lead} ${parts.rest}`).toBe(cell.note);
        expect(words(parts.lead)).toBeLessThan(words(cell.note));
      }
    }
    /* Non-vacuity: at least one card on a real sheet is over the budget, or the fold is decoration. */
    expect(shaped.figures.some((cell) => figureNotePartsOf(cell.note).rest !== undefined)).toBe(true);
    expect(FIGURE_NOTE_HANDLE.length).toBeGreaterThan(3);
  });
});

/*
 * GitHub issue #631, wave AQ lane AQ-4: the playtest met a pressed day's *You switched to …* row whose
 * why ran to about 200 words of single-replication caveats. The row below is that row's why, copied
 * from a filed Garden Apartments day with Predictive balanced pressed at 08:50.
 */
describe('a long report paragraph leads with its first sentence and folds the rest — issue #631', () => {
  const PRESSED_WHY =
    '0 people were standing when the day ended, and 28 people were delivered between those two clock times. ' +
    "By the end of the day 0 people had been picked up after a wait past the run's own long-wait mark. " +
    'The same day, from the same seed and the same crowd, had also been run without that press and with nothing ' +
    'else changed: read at those same two clock times, that run had 0 people standing at the landings, had ' +
    'delivered 28 people between them, and had picked up 0 people after a wait past that same mark. Graded ' +
    'against the same goals, this run reads Shift cleared; the run without that press, over its own whole day, ' +
    'reads Shift cleared. Those are two runs of one day, and that is all they are. A with-and-without pair on ' +
    'one seed is a single replication, and a single replication settles nothing in general: nothing here says ' +
    'what that press does on another day, on another crowd, or on another tower. The bench is where a question ' +
    'like that is answered, over many runs of the same crowd. The two verdicts are the same kind of fact as the ' +
    'counts: how this crowd’s day was graded with that press and without it, and nothing about how a day is ' +
    'graded for any other crowd, even in this tower.';
  const words = (text: string): number => text.split(/\s+/u).filter(Boolean).length;

  it('folds the pressed day’s caveats behind one press, and loses nothing', () => {
    expect(words(PRESSED_WHY)).toBeGreaterThan(150);
    const parts = reportProsePartsOf(PRESSED_WHY);
    expect(parts.rest).toBeDefined();
    expect(words(parts.lead)).toBeLessThanOrEqual(REPORT_PROSE_BUDGET.whole);
    expect(`${parts.lead} ${parts.rest ?? ''}`).toBe(PRESSED_WHY);
  });

  it('draws a paragraph inside the budget whole, and a one-sentence paragraph whole at any length', () => {
    const short = 'Floor 3 stacked 4 deep. The landing-queue goal allowed 32, so this stayed inside it.';
    expect(reportProsePartsOf(short)).toEqual({ lead: short, rest: undefined });
    const oneSentence = Array.from({ length: 90 }, () => 'word').join(' ');
    expect(reportProsePartsOf(oneSentence)).toEqual({ lead: oneSentence, rest: undefined });
  });
});

/*
 * Wave AO, lane AO-4, § D1388, the post-AN panel's seat D: *Take this call again* is drawn only on the
 * pinned Monday, so practising a day an ordinary call decided was three screens deep. The close
 * offers today again as practice wherever it names the call that decided the day, and nowhere else.
 */
describe('today again, as practice, beside the call that decided it — wave AO, lane AO-4', () => {
  const week = closeDay(
    openWeek('c2'),
    outcomeOf({
      day: 1,
      dayIdx: 0,
      eventId: 'ordinary',
      arrived: 400,
      carried: 380,
      minutePct: 90,
      readings: [],
      record: null,
      recordRefusal: null,
    }),
  );
  const decided = 'The 10:40 call decided today: you chose leave them, and park them would have cleared it.';

  it('is offered on the close of a counted day an ordinary call decided', () => {
    const view = viewOf({ report: sheetOf({ decidingCall: decided, callDecided: true }), week });
    expect(view.close?.call).toBe(decided);
    expect(view.practiceAgain).toEqual(REPORT_PRACTICE_AGAIN);
    /* It says it is the whole day and that it banks nothing, and never that it is the call alone. */
    expect(REPORT_PRACTICE_AGAIN.label).not.toMatch(/call/iu);
    expect(REPORT_PRACTICE_AGAIN.note).toMatch(/banks nothing/u);
  });

  it('is not offered where no call decided the day, on a practice close, a career sheet or with no week', () => {
    expect(viewOf({ report: sheetOf({ decidingCall: 'No call decided today.', callDecided: false }), week }).practiceAgain).toBeUndefined();
    expect(viewOf({ report: sheetOf({ decidingCall: decided, callDecided: true, practiceNote: 'Practice.' }), week }).practiceAgain).toBeUndefined();
    expect(
      viewOf({
        report: sheetOf({ decidingCall: decided, callDecided: true }),
        week,
        career: { buildingName: 'Garden Apartments', day: 4, canRunAnother: true, renewalDue: false },
      }).practiceAgain,
    ).toBeUndefined();
    expect(viewOf({ report: sheetOf({ decidingCall: decided, callDecided: true }) }).practiceAgain).toBeUndefined();
  });

  it('leaves a pinned day to its own *Take this call again*', () => {
    const pinned = sheetOf({ decidingCall: decided, callDecided: true });
    const withRow = {
      ...pinned,
      diagnosis: [...pinned.diagnosis, { id: PRESS_CALL_ROW_ID, when: '10:40', what: 'The stage called the day', why: 'At 10:40.', tone: 'plain' as const }],
    };
    expect(viewOf({ report: withRow, week }).practiceAgain).toBeUndefined();
  });
});

/*
 * ---- Wave AR, lane AR-4: no advice is pressed on a day every goal held — GitHub issue #633 ----
 *
 * The playtest read *Add a car* and *Zone the tower* under *What would make tomorrow better* after a
 * perfect day at Garden Apartments.
 */
describe('§ D1543 — the levers after a cleared day are optional', () => {
  it('heads them as optional when the day cleared, and as advice when it did not', () => {
    expect(viewOf().headings.levers).toBe(REPORT_LEVERS_OPTIONAL_HEADING);
    expect(viewOf().headings.levers).toMatch(/Nothing needed today/u);
    expect(viewOf({ report: sheetOf({ verdict: 'missed' }) }).headings.levers).not.toBe(REPORT_LEVERS_OPTIONAL_HEADING);
  });

  /* GitHub issue #637 item 4: the four cards followed that heading open. They fold under it on a cleared day. */
  it('folds the cards under that heading on a cleared day, and leaves them open as advice otherwise', () => {
    expect(viewOf().leversFolded).toBe(true);
    expect(viewOf().levers.length).toBeGreaterThan(0);
    expect(viewOf({ report: sheetOf({ verdict: 'missed' }) }).leversFolded).toBe(false);
  });
});

/*
 * ---- Wave AS, lane AS-3: the run before this one is the same mode's, on the same tower — GitHub issue #637 item 10 ----
 *
 * The career close drew *The run before this one* against the Midtown scenario day filed before it.
 */
describe('the delta compares only within one mode and one tower — issue #637', () => {
  const garden = sheetOf();
  const midtown = sheetOf({ basis: { ...garden.basis, buildingId: 'midtown-office' } });

  it('keeps the earlier sheet only when both its mode and its tower match', () => {
    expect(comparablePreviousOf({ report: garden, mode: 'career', previous: garden, previousMode: 'career' })).toBe(garden);
    expect(comparablePreviousOf({ report: garden, mode: 'career', previous: midtown, previousMode: 'career' })).toBeUndefined();
    expect(comparablePreviousOf({ report: garden, mode: 'career', previous: garden, previousMode: 'daily' })).toBeUndefined();
    /* No earlier run, or one whose mode was never recorded: nothing is said. */
    expect(comparablePreviousOf({ report: garden, mode: 'career', previous: undefined, previousMode: undefined })).toBeUndefined();
    expect(comparablePreviousOf({ report: garden, mode: 'career', previous: garden, previousMode: undefined })).toBeUndefined();
  });

  it('draws no *run before this one* block where the earlier sheet is another mode’s or another tower’s', () => {
    const across = comparablePreviousOf({ report: garden, mode: 'career', previous: midtown, previousMode: 'daily' });
    expect(viewOf({ report: garden, previous: across }).sheet.delta).toBeNull();
    expect(viewOf({ report: garden, previous: midtown }).sheet.delta?.caption).toBe('The run before this one');
  });
});
