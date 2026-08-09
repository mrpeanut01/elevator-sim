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

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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
import {
  WITHHELD,
  clockOf,
  dayReportOf,
  type ReportSubject,
  type ShapedDayReport,
  type WeekDayReport,
} from '../shift/report.js';
import type { GoalReading, ReportFigure } from '../shift/types.js';
import { closeDay, openWeek, outcomeOf } from '../shift/week.js';
import type { TomorrowBriefing } from '../shift/tomorrow.js';

import {
  diagnosisRowsOf,
  emptyReportView,
  figureViewOf,
  goalRowViewOf,
  LEVER_SURFACES,
  leverRowsOf,
  NOTHING_FILED_YET,
  reportViewOf,
  rotatedOn,
  runProgressOf,
  toneColourOf,
  topWritten,
  type FigureView,
  type ReportDeltaView,
  type ReportView,
  type RunProgress,
  type SheetContinuity,
  type WeekFramingView,
} from './reportPanel.js';

let config: LoadedConfig;
let clean: VizRecording;
let saturated: VizRecording;
/** `clean`'s selection, run a second time — the same run, not a second one. See the #16 suite. */
let again: VizRecording;
/**
 * `clean`'s question, answered by a different dispatcher — the retry loop, and the **only** change
 * the delta block exists to draw.
 *
 * Same building, same rate, same length, same seed; `nearest-car` instead of the fixture's `eta`.
 * That is what a player does when they click a dispatcher card, and after issues #117 and #102 it is
 * the pairing the suite has to be built on: every other pair the suite used to reach for differs on
 * an axis the block now refuses.
 */
let swapped: VizRecording;
/**
 * A third answer to `clean`'s question — so the #117 headline can be driven over **three** runs.
 *
 * The reporter ran three dispatchers back to back and reported that all three sheets printed one
 * baseline. Two runs cannot tell that claim from the confirmed one-delta defect; three can.
 */
let thirdDispatcher: VizRecording;
/**
 * `clean`'s selection at a longer run length — the pin on {@link ReportBasis}' named gap.
 *
 * A campaign day's shift length is not on `DayReportInput`, so two days of one day number at
 * different lengths compare as the same question. That is stated in `shift/report.ts` and it is
 * pinned by a case here, because a limitation described only in prose is a limitation that goes
 * stale (§ D227).
 */
let longer: VizRecording;

function runOf(
  buildingId: string,
  arrivalRatePctPop5min: number,
  durationS: number,
  dispatcherId?: string,
): VizRecording {
  const base: SimulationConfig = fixtureConfig(config, {
    buildingId,
    durationS,
    onTimeout: 'report',
    ...(dispatcherId === undefined ? {} : { dispatcherId }),
  });
  return recordRun({ ...base, demand: { arrivalRatePctPop5min } }, { recordDecisions: false })
    .recording;
}

/** The same fixture path `shift/report.test.ts` takes: one real run, folded at its own end. */
function reportOf(
  recording: VizRecording,
  day = 4,
  subject: ReportSubject = { kind: 'week-day' },
): ShapedDayReport {
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
    subject,
  });
}

/**
 * The week-shaped half of a drawn sheet, narrowed — and the narrowing is an assertion.
 *
 * Every suite outside the shape suite draws a day of a week, so a change that quietly framed
 * everything as a single run would fail here by name rather than as a missing property.
 */
function weekFraming(view: ReportView): WeekFramingView {
  if (view.framing.kind !== 'week-day') {
    throw new Error(`expected a week-day framing, got "${view.framing.kind}"`);
  }
  return view.framing;
}

/** The week-day sheet, narrowed. Same rule as {@link weekFraming}, one layer up. */
function weekDayReport(report: ShapedDayReport): WeekDayReport {
  if (report.of !== 'week-day') throw new Error(`expected a week-day sheet, got "${report.of}"`);
  return report;
}

/** The Free Play selection the shape suite runs from. */
const SINGLE: ReportSubject = {
  kind: 'single-run',
  selection: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: 12, durationS: 900 },
};

function viewOf(recording: VizRecording, day = 4): ReportView {
  return reportViewOf(reportOf(recording, day));
}

function cell(view: ReportView, label: string): FigureView {
  const found = view.figures.find((candidate) => candidate.label === label);
  if (found === undefined) throw new Error(`no "${label}" cell on the drawn sheet`);
  return found;
}

/**
 * The sheets `main.ts`'s `closeShift` files when one day is run, filed, and run again — in order.
 *
 * The week is carried from each close into the next, which is the whole of what makes the second
 * sheet say *attempt 2 at this day* — `week.ts`'s `retry` branch keys on `closedDay`. A list of
 * independently opened weeks would all say *attempt 1* and the suites below would be asserting
 * against a sequence the shell cannot produce.
 */
function closesOf(recordings: readonly VizRecording[], day = 4): readonly ShapedDayReport[] {
  const goals = goalsForDay(day);
  let week = { ...openWeek('c2'), day, dayIdx: (day - 1) % 7 };
  const filed: ShapedDayReport[] = [];
  for (const recording of recordings) {
    const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
    week = closeDay(
      week,
      outcomeOf({
        day,
        dayIdx: week.dayIdx,
        eventId: 'ordinary',
        arrived: observations.arrived,
        carried: observations.carried,
        minutePct: observations.minutePct,
        readings: readGoals(goals, observations),
      }),
    );
    filed.push(
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
  return filed;
}

/** {@link closesOf} for the two-run case, narrowed so the caller can destructure it. */
function attemptsOf(
  first: VizRecording,
  second: VizRecording,
  day = 4,
): readonly [ShapedDayReport, ShapedDayReport] {
  const [one, two] = closesOf([first, second], day);
  if (one === undefined || two === undefined) throw new Error('two closes produced fewer sheets');
  return [one, two];
}

/** The sheet as `mountReport` would draw it with the playhead at `simTimeS`. */
function drawnAt(report: ShapedDayReport, recording: VizRecording, simTimeS: number): ReportView {
  return reportViewOf(report, runProgressOf({ recording, simTimeS }));
}

/**
 * Every string the sheet will put on the page **that is a reading off this recording**.
 *
 * One family of string is excluded, and the exclusion is not hidden here — the suite below pins it
 * by name, so a clock time appearing anywhere else on the sheet is a failure:
 *
 * - **The forecast's event name and note.** `shift/events.ts` ships the handoff's event copy
 *   verbatim, and two of the five carry an office-day hour (*Fire drill, 14:00*, *half a car until
 *   11:30*). They are tomorrow's flavour text, not a reading of today's recording.
 *
 * **The lever bodies used to be excluded too, and no longer are.** The exclusion said they were
 * *"generic lift-engineering advice … identical on every run and every building"*, which was the
 * defect issue #55 reported: they are now ordered and annotated from what the run showed, so they
 * are a reading of this recording and are held to the rule with everything else.
 *
 * `delta` is deliberately **not** here: half of its strings are the *previous* sheet's, and that
 * sheet had a span of its own. The delta suite sweeps it against both runs' spans, which is a
 * stronger claim than this walk could make.
 */
function everyString(view: ReportView): readonly string[] {
  const framing = view.framing;
  const out: string[] = [
    view.title,
    ...view.metaLines,
    view.lede,
    view.verdictLine,
    view.diagnosisHeading,
    view.smallPrint,
    // The framing, whichever it is. A shape whose strings this walk did not reach would be a hole
    // in every rule below — so both arms are listed and neither may be dropped.
    ...(framing.kind === 'week-day'
      ? [
          framing.streakLine,
          framing.contractLine,
          framing.cleared?.note ?? '',
          framing.forecast.demand,
          framing.taught,
          framing.nextDayLabel,
        ]
      : []),
    view.nextStep?.label ?? '',
    view.nextStep?.why ?? '',
  ];
  for (const figure of view.figures) out.push(figure.label, figure.value, figure.note);
  for (const goal of view.goals) out.push(goal.label, goal.display, goal.help);
  for (const row of view.diagnosis) out.push(row.when, row.what, row.why);
  for (const lever of view.levers) out.push(lever.title, lever.body);
  return out;
}

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  clean = runOf('garden-apartments', 12, 900);
  // `shift/report.test.ts`'s own saturating fixture: Midtown Office at 25 %pop/5 min.
  saturated = runOf('midtown-office', 25, 900);
  // The same three arguments, a second time. Nothing about the call differs, which is the point.
  again = runOf('garden-apartments', 12, 900);
  // One axis moved, and it is the axis a player can move: the dispatcher.
  swapped = runOf('garden-apartments', 12, 900, 'nearest-car');
  thirdDispatcher = runOf('garden-apartments', 12, 900, 'energy-aware');
  // Same question in every respect the sheet can see, and a longer day. See {@link longer}.
  longer = runOf('garden-apartments', 12, 1500);
}, 180_000);

describe('the premises this suite rests on', () => {
  it('has one run whose mean is publishable and one whose is not', () => {
    expect(clean.summary.awtIsValid && !clean.summary.saturated).toBe(true);
    expect(saturated.summary.saturated).toBe(true);
    expect(saturated.summary.awtIsValid).toBe(false);
    // Suppression is a refusal to print a number that exists, not the absence of one.
    expect(Number.isFinite(saturated.summary.meanWaitS)).toBe(true);
  });

  it('has a pair that differs by the dispatcher alone, and really is a different day', () => {
    /*
     * The delta suite's foundation after issues #117 and #102, so it is asserted rather than
     * assumed. Two things have to hold at once and they pull in opposite directions: the two runs
     * must be *comparable* — same building, same shape of sheet, same demand — and they must
     * actually **differ**, or every pairing case below would pass over an empty list.
     */
    expect(swapped.buildingId).toBe(clean.buildingId);
    expect(swapped.dispatcherProfileId).not.toBe(clean.dispatcherProfileId);
    expect(reportOf(swapped).basis).toEqual(reportOf(clean).basis);
    const moved = reportViewOf(reportOf(swapped), { kind: 'played-out' }, reportOf(clean)).delta;
    expect(moved?.figures.length ?? 0).toBeGreaterThan(0);
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
      const forecast = weekFraming(view).forecast;
      expect(/\d{2}:\d{2}/.test(forecast.name)).toBe(false);
      expect(/\d{2}:\d{2}/.test(forecast.note)).toBe(false);
      for (const text of [...view.levers.map((lever) => lever.body), forecast.name, forecast.note]) {
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
    expect(weekFraming(empty).cleared).toBeNull();
    expect(weekFraming(empty).canAdvance).toBe(false);
  });

  it('names no weekday it has not earned', () => {
    expect(weekFraming(emptyReportView()).nextDayLabel).toBe('Open the doors on tomorrow');
  });

  it('is still the empty sheet while a run nothing has been filed for is playing', () => {
    // The path issue #16 did *not* break, pinned so the fix above cannot quietly take it over: with
    // no report there is no account to be premature about, and the design's own empty case stands.
    expect(reportViewOf(undefined, runProgressOf({ recording: again, simTimeS: again.startedAt })))
      .toEqual(emptyReportView());
  });
});

describe('a filed sheet may not describe a day the screen has not reached — issue #16, § D223', () => {
  /*
   * Driven on the deployed viewer 2026-08-05. A Free Play day was run and filed; *Run this shift*
   * was pressed again with nothing changed; the Day Report tab was opened at once. The chrome read
   * `06:00 FILLING` and `running · 0 arrived, 0 carried` and the rail read `carried today 0`, while
   * the sheet read `CARRIED 360` and `AVERAGE WAIT 146.7 s`. One screen, two answers.
   *
   * The issue filed it as stale figures held over from the previous run. It is not: `runId` is
   * `building-profile-seed`, `main.ts`'s `runShift` writes `report: undefined`, and `openTab`
   * re-files from the new recording — which is bit-identical, because the selection did not change.
   * The sheet was a true account of the recording and the wrong thing to draw, because every other
   * surface was describing the playhead. The first test below is that premise, asserted rather than
   * assumed, so a future reader does not go looking for a cache that was never there.
   */
  it('the premise: re-running one selection is the same run again, not a stale one', () => {
    expect(again.runId).toBe(clean.runId);
    expect(again.summary.meanWaitS).toBe(clean.summary.meanWaitS);
    expect(observationsAt(again, again.endedAt).carried).toBe(
      observationsAt(clean, clean.endedAt).carried,
    );
  });

  it('puts no count on the sheet that the chrome’s own clock contradicts', () => {
    const [, second] = attemptsOf(clean, again);
    // The two numbers that were on the screen together. The footer folds at the playhead; the sheet
    // folds at `endedAt`, and at the start of a re-run those are 0 and the whole day.
    const atStart = observationsAt(again, again.startedAt);
    const wholeDay = observationsAt(again, again.endedAt);
    expect(atStart.carried).toBe(0);
    expect(wholeDay.carried).toBeGreaterThan(0);

    const watching = drawnAt(second, again, again.startedAt);
    // No cell can carry it, because there is no cell: every figure on this grid is a whole-run
    // quantity and none of them can be honestly re-derived at a playhead.
    expect(watching.figures).toEqual([]);
    expect(everyString(watching).join('\n')).not.toMatch(
      new RegExp(`\\b${String(wholeDay.carried)}\\b`),
    );
    // The refusal is the mean's too — the figure the issue named beside `CARRIED`.
    expect(everyString(watching).join('\n')).not.toContain(again.summary.meanWaitS.toFixed(1));
  });

  it('says the day is still running, and does not repeat advice the reader has already taken', () => {
    const [, second] = attemptsOf(clean, again);
    const watching = drawnAt(second, again, again.startedAt);
    expect(watching.filed).toBe(false);
    expect(watching.title).toBe('The day is still running');
    expect(watching.title).not.toBe(second.title);
    // The empty sheet's lede tells a reader to press *Run this shift*. This reader just did.
    expect(watching.lede).not.toContain('Run this shift');
    expect(watching.lede).not.toBe(emptyReportView().lede);
    // It names where the playhead is and where the day ends, and both are clock times this run has.
    expect(watching.lede).toContain(clockOf(again.startedAt));
    expect(watching.lede).toContain(clockOf(again.endedAt));
  });

  it('offers nothing to advance to, and no award to take, while the day is unfinished', () => {
    const [, second] = attemptsOf(clean, again);
    const framing = weekFraming(drawnAt(second, again, again.startedAt));
    expect(framing.canAdvance).toBe(false);
    expect(framing.cleared).toBeNull();
    expect(drawnAt(second, again, again.startedAt).goals).toEqual([]);
    expect(drawnAt(second, again, again.startedAt).verdictLine).toBe('');
  });

  it('draws the filed sheet whole, and unchanged, once the playhead reaches the end', () => {
    const [, second] = attemptsOf(clean, again);
    const done = drawnAt(second, again, again.endedAt);
    expect(done).toEqual(reportViewOf(second));
    expect(cell(done, 'CARRIED').value).toBe(
      String(observationsAt(again, again.endedAt).carried),
    );
  });

  it('keeps the attempt line coherent — the filed sheet numbers it, the running one claims nothing', () => {
    const [first, second] = attemptsOf(clean, again);
    // `shift/report.ts` prints no attempt line on the first, by design; the second is the one the
    // player saw. Neither number moves because of anything this panel does.
    expect(first.metaLines.some((line) => line.includes('attempt'))).toBe(false);
    expect(second.metaLines.some((line) => line.includes('attempt 2'))).toBe(true);
    expect(drawnAt(second, again, again.startedAt).metaLines).toEqual([]);
    expect(drawnAt(second, again, again.endedAt).metaLines).toEqual(second.metaLines);
  });

  it('prints no clock time the run did not have, at any playhead', () => {
    const [, second] = attemptsOf(clean, again);
    const inside = new Set<string>();
    for (let t = again.startedAt; t <= again.endedAt; t += 30) inside.add(clockOf(t));
    inside.add(clockOf(again.endedAt));
    const playheads = [
      again.startedAt,
      (again.startedAt + again.endedAt) / 2,
      again.endedAt - 1,
    ];
    for (const at of playheads) {
      for (const text of everyString(drawnAt(second, again, at))) {
        for (const found of text.match(/\d{2}:\d{2}/g) ?? []) {
          expect(inside.has(found), `${found} in "${text}" is outside the run`).toBe(true);
        }
      }
    }
  });

  it('reads the playhead against the run, and calls the last instant played out', () => {
    expect(runProgressOf({ recording: again, simTimeS: again.endedAt })).toEqual({
      kind: 'played-out',
    });
    expect(runProgressOf({ recording: again, simTimeS: again.endedAt - 1 })).toEqual({
      kind: 'watching',
      atClock: clockOf(again.endedAt - 1),
      endsAtClock: clockOf(again.endedAt),
    });
    // No run on screen is no clock to disagree with. `reportViewOf` has already answered that case.
    expect(runProgressOf({ recording: undefined, simTimeS: 0 })).toEqual({ kind: 'played-out' });
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
    expect(weekFraming(view).nextDayLabel).toBe(
      `Open the doors on ${weekDayReport(report).nextDayName}`,
    );
    expect(weekFraming(view).canAdvance).toBe(true);
  });

  it('colours a cleared verdict green and a missed one amber, never red', () => {
    // "Nothing here is a game over" — a missed shift is amber, which is the design's own choice
    // and is the difference between a warning and a failure.
    expect(reportViewOf(reportOf(clean)).verdictColour).toBe('var(--ok)');
    expect(reportViewOf(reportOf(saturated)).verdictColour).toBe('var(--warn)');
  });

  it('shows the cleared banner only when a day banked the last clean shift', () => {
    // Garden Apartments at a gentle rate clears `c2`'s single day; the saturated run does not.
    expect(weekFraming(reportViewOf(reportOf(saturated))).cleared).toBeNull();
    const report = weekDayReport(reportOf(clean));
    if (report.cleared !== null) {
      const banner = weekFraming(reportViewOf(report)).cleared;
      expect(banner?.note).toContain(report.cleared.reward);
      expect(banner?.note).toContain(report.cleared.nextTitle);
      expect(banner?.nextContractId).toBe(report.cleared.nextContractId);
    }
  });

  it('draws the levers the shift layer handed it, in that order and unedited', () => {
    /*
     * This assertion changed shape with issue #55 and is stronger, not weaker. It used to pin four
     * hard-coded titles, which passed precisely *because* the section was a frozen constant. What it
     * pins now is the property that matters at this layer: the panel is a pane of glass. Whatever
     * order and whatever bodies `shift/report.ts` decided on, that is what gets drawn — asserted on
     * two runs whose lever lists are known to differ, so a renderer that re-sorted or re-worded
     * anything fails on at least one of them.
     */
    for (const recording of [clean, saturated]) {
      const report = reportOf(recording);
      expect(leverRowsOf(report.levers).map((row) => ({ title: row.title, body: row.body }))).toEqual(
        report.levers.map((lever) => ({ title: lever.title, body: lever.body })),
      );
    }
    expect(reportOf(clean).levers.map((lever) => lever.id)).not.toEqual(
      reportOf(saturated).levers.map((lever) => lever.id),
    );
  });

  it('sends the two fabric cards to the tab they name — issue #38', () => {
    /*
     * *"The blunt instrument. Costs a shaft, works immediately, and the **Building tab** will let
     * you feel how much it buys."* The card is the one place on this sheet that tells a reader to
     * do something, and it was the one place with nothing to press: it named a tab in prose and did
     * not go there. Every other pointer on the surface — the Compare block under the small print —
     * has been a navigation since it landed.
     */
    const rows = leverRowsOf(reportOf(clean).levers);
    const addACar = rows.find((row) => row.title === 'Add a car');
    expect(addACar, 'this run no longer offers the card the issue names').toBeDefined();
    expect(addACar?.surface, 'the card names the Building tab and goes nowhere').toBe('building');
  });

  it('leaves the two dispatcher cards unclickable, and that is the restraint — R2', () => {
    /*
     * *Weight fairness up* and *Ask where they're going* are both **a different dispatcher**, and a
     * card that navigated to the dispatcher editor with a lever named would be this sheet
     * recommending a dispatch strategy off one replication — `docs/10` R2, and CLAUDE.md's *never
     * declare one dispatcher better than another without a paired-t interval that excludes zero*.
     *
     * Asserted in both directions on the same run, so the case cannot pass by there being no
     * navigable card at all.
     */
    const rows = leverRowsOf(reportOf(clean).levers);
    const navigable = rows.filter((row) => row.surface !== undefined).map((row) => row.title);
    const inert = rows.filter((row) => row.surface === undefined).map((row) => row.title);
    expect(navigable.length, 'no card navigates anywhere, so the pair below proves nothing').toBeGreaterThan(0);
    expect(inert, 'a dispatcher card acquired a destination').toContain('Weight fairness up');
  });

  it('names only cards the shift layer can actually emit', () => {
    /*
     * The table is keyed on `ReportLever.id`, and a hand-written key set is the shape this
     * repository keeps finding stale. So it is checked against the ids `shift/report.ts` produces,
     * over both fixture runs, rather than against a list transcribed beside it.
     */
    const emitted = new Set(
      [clean, saturated].flatMap((recording) => reportOf(recording).levers.map((lever) => lever.id)),
    );
    for (const id of Object.keys(LEVER_SURFACES)) {
      expect(emitted.has(id), `LEVER_SURFACES names "${id}", which no run emits`).toBe(true);
    }
  });

  it('heads the diagnosis with the shift layer’s own words, and never with a fixed one — issue #56', () => {
    // `index.html` authors `<h3>Where it went wrong</h3>`, which fired on a shift where nothing did.
    // The view carries the heading so the mount can write it, and it agrees with the banner by
    // construction — both come out of the same verdict.
    const cleared = reportViewOf(reportOf(clean));
    expect(cleared.verdictLine).toBe('Shift cleared');
    expect(cleared.diagnosisHeading).toBe(reportOf(clean).diagnosisHeading);
    expect(cleared.diagnosisHeading.toLowerCase()).not.toContain('wrong');

    const missed = reportViewOf(reportOf(saturated));
    expect(missed.verdictLine).toBe('Shift missed');
    expect(missed.diagnosisHeading).toBe('Where it went wrong');
    // No row on a cleared sheet is drawn in a colour that implies a fault.
    for (const row of cleared.diagnosis) expect(row.accent).toBe('var(--edge-strong)');
    expect(missed.diagnosis.some((row) => row.accent === 'var(--bad)')).toBe(true);
  });

  it('writes and hides the section headings, and does so from the list they head', async () => {
    /*
     * No jsdom, so the drawing half is pinned at the source in the idiom the DR-13 suite uses. The
     * failure it guards is the one this change could introduce: a heading written but never hidden
     * would leave *The tightest moment* standing over nothing on the empty sheet.
     */
    const panel = await readFile(fileURLToPath(new URL('./reportPanel.ts', import.meta.url)), 'utf8');
    expect(panel).toContain('setText(diagnosisHeading, drawn.diagnosisHeading)');
    expect(panel).toContain('setHidden(diagnosisHeading, drawn.diagnosis.length === 0)');
    expect(panel).toContain('setHidden(leversHeading, drawn.levers.length === 0)');
    expect(emptyReportView().diagnosisHeading).toBe('');
    expect(emptyReportView().diagnosis).toEqual([]);
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

describe('a week’s slots are absent, not blank, on a run that has no week', () => {
  /*
   * Both directions, on the same recording and the same closed week — see `shift/report.test.ts`'s
   * own note. The view is where the finding would survive a fixed shift layer: a panel that read
   * `framing.streakLine ?? ''` and drew it anyway would put an empty span back into the layout,
   * which is `docs/10` R3's blank-where-a-number-should-be one level up from a figure.
   */
  it('draws the week’s lines when the sheet is a day of a week', () => {
    const framing = weekFraming(reportViewOf(reportOf(clean)));
    expect(framing.kind).toBe('week-day');
    expect(framing.contractLine.length).toBeGreaterThan(0);
    expect(framing.streakLine.length).toBeGreaterThan(0);
    expect(framing.taught.length).toBeGreaterThan(0);
    expect(framing.forecast.demand.length).toBeGreaterThan(0);
    expect(framing.nextDayLabel).toContain('Open the doors on');
    expect(framing.canAdvance).toBe(true);
  });

  it('carries no key for any of them on a single run', () => {
    const framing = reportViewOf(reportOf(clean, 4, SINGLE)).framing;
    expect(framing.kind).toBe('single-run');
    for (const field of [
      'streakLine',
      'contractLine',
      'cleared',
      'forecast',
      'taught',
      'nextDayLabel',
      'canAdvance',
    ]) {
      expect(field in framing, `${field} is still on a single run's framing`).toBe(false);
    }
  });

  it('passes the next step through untouched, and composes none of it here', () => {
    // The panel may not decide what Compare is for. Identity, not equality: the value is the shift
    // layer's own, so a string edited on the way to the screen fails.
    const report = reportOf(clean, 4, SINGLE);
    if (report.of !== 'single-run') throw new Error('expected a single-run sheet');
    expect(reportViewOf(report).nextStep).toBe(report.nextStep);
  });

  it('draws the same figures, goals, diagnosis and levers on either shape', () => {
    const week = reportViewOf(reportOf(clean));
    const single = reportViewOf(reportOf(clean, 4, SINGLE));
    expect(single.figures).toEqual(week.figures);
    expect(single.goals).toEqual(week.goals);
    expect(single.diagnosis).toEqual(week.diagnosis);
    expect(single.levers).toEqual(week.levers);
    expect(single.smallPrint).toBe(week.smallPrint);
    expect(single.verdictColour).toBe(week.verdictColour);
  });

  it('holds every rule of this suite on a single run’s sheet too', () => {
    // The clock rule and the no-digit rule are properties of the *sheet*, not of the week-shaped
    // half of it. Re-run over the shape this change introduced, so a new string cannot arrive
    // exempt from the rules every other string here obeys.
    for (const recording of [clean, saturated]) {
      const view = reportViewOf(reportOf(recording, 4, SINGLE));
      const inside = new Set<string>();
      for (let t = recording.startedAt; t <= recording.endedAt; t += 30) inside.add(clockOf(t));
      inside.add(clockOf(recording.endedAt));
      for (const text of everyString(view)) {
        for (const found of text.match(/\d{2}:\d{2}/g) ?? []) {
          expect(inside.has(found), `${found} in "${text}" is outside the run`).toBe(true);
        }
      }
    }
    expect(cell(reportViewOf(reportOf(saturated, 4, SINGLE)), 'AVERAGE WAIT').value).not.toMatch(
      /\d/,
    );
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

describe('the sheet’s buttons have one owner — DR-13', () => {
  /*
   * Driven red 2026-07-30 (§ D198): one press of “Open the doors on tomorrow” advanced TWO days —
   * Day 1 → Day 3, and the even days were unreachable by the button — because `reportPanel.ts`
   * and `main.ts` both wired `#report-next-day` and each applied `nextDay`. There is no jsdom
   * here, so the wiring itself is pinned at the source: the mount idiom (`mountTypes.ts`) is that
   * a panel wires the elements it owns, and the shell may not add a second listener to any of
   * them. One binding site, and it is the panel’s.
   */
  const sourceOf = async (name: string): Promise<string> =>
    readFile(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

  it('exactly one site binds the next-day button, and it is the panel’s', async () => {
    const panel = await sourceOf('./reportPanel.ts');
    const shell = await sourceOf('./main.ts');
    const bindings = (source: string): number =>
      (source.match(/nextDay\.addEventListener/g) ?? []).length;
    expect(bindings(panel), 'reportPanel.ts owns #report-next-day').toBe(1);
    expect(bindings(shell), 'main.ts must not wire #report-next-day a second time').toBe(0);
  });

  it('exactly one site binds the Back button, by the same rule', async () => {
    // The same double wiring, latent: both handlers sent the reader to the run surface, so two
    // listeners happened to be idempotent — until one of them changes.
    const panel = await sourceOf('./reportPanel.ts');
    const shell = await sourceOf('./main.ts');
    const bindings = (source: string): number =>
      (source.match(/[.\s]back\.addEventListener/g) ?? []).length;
    expect(bindings(panel), 'reportPanel.ts owns #report-back').toBe(1);
    expect(bindings(shell), 'main.ts must not wire #report-back a second time').toBe(0);
  });

  it('the panel applies nextDay exactly once per press', async () => {
    // The defect’s mechanism was two `nextDay(...)` applications for one click. The panel’s own
    // handler must hold exactly one, and `main.ts` none at all.
    const panel = await sourceOf('./reportPanel.ts');
    const shell = await sourceOf('./main.ts');
    const applications = (source: string): number =>
      (source.match(/week:\s*nextDay\(/g) ?? []).length;
    expect(applications(panel)).toBe(1);
    expect(applications(shell)).toBe(0);
  });
});

describe('the mount hides a slot it has nothing to put in', () => {
  /*
   * There is no jsdom here, so the *drawing* half of "absent, not blanked" cannot be observed the
   * way the view half can — and it is the half a reader actually sees. Pinned at the source, in the
   * idiom the DR-13 suite above already uses for the same reason: the decision is in the view and
   * asserted properly; this only checks that the render acts on it for every week-shaped slot
   * rather than writing `''` into six elements the layout keeps reserving.
   */
  const slots = [
    'setHidden(ui.streak',
    'setHidden(ui.contract',
    'setHidden(ui.cleared',
    'setHidden(cardOf(ui.forecastName)',
    'setHidden(cardOf(ui.taught)',
    'setHidden(ui.nextDay',
  ] as const;

  it('hides every one of the week’s slots, the two cards by their card', async () => {
    const panel = await readFile(fileURLToPath(new URL('./reportPanel.ts', import.meta.url)), 'utf8');
    for (const call of slots) {
      expect(panel.includes(call), `${call} — the slot is emptied but never hidden`).toBe(true);
    }
    // `#report-forecast-name` and `#report-taught` are fields inside captioned cards, and the
    // caption is their sibling. Hiding the field alone leaves *Tomorrow* over an empty box.
    expect(panel).not.toContain('setHidden(ui.forecastName');
    expect(panel).not.toContain('setHidden(ui.taught');
  });

  it('still does no arithmetic anywhere in the file', async () => {
    // The property the module docstring rests on, re-asserted because this change added a branch
    // to the render: a renderer that cannot compute a mean cannot compute one wrongly.
    const panel = await readFile(fileURLToPath(new URL('./reportPanel.ts', import.meta.url)), 'utf8');
    const body = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const forbidden of ['toFixed(', 'Math.round(', 'Math.min(', 'Math.max(']) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });
});

describe('what moved since the run before this one — issue #38', () => {
  /*
   * ## What was reported
   *
   * Clicking a dispatcher in the right rail re-simulates the whole shift on the same seed instantly.
   * The second Day report is a fresh sheet with no reference to the first: the reporter swapped
   * `collective` for `capacity-aware`, had 288 fewer riders take the stairs *and* made the unluckiest
   * rider 642 s worse, and had to screenshot both sheets to find that out. Meanwhile the rail's
   * *best day so far* moved 18 % → 20 %, so the one lesson the app volunteered was the one it least
   * wants taught.
   *
   * ## The line this suite holds
   *
   * A delta may say **what the two sheets printed**. It may not order them, colour them, or sum
   * them, because two runs are n = 1 against n = 1 and CLAUDE.md's first rule is about exactly that.
   * So: every value in the block is a string one of the two sheets already published (no arithmetic,
   * so a withheld cell survives the pairing as the word), the note carries the refusal, and the
   * identity rows are there so a reader cannot attribute a change to the wrong cause.
   *
   * ## Every pairing case below is now a **dispatcher swap**, and that is issues #117 and #102
   *
   * This suite used to pair Garden Apartments against Midtown Office, because two recordings that
   * differ in every figure make the loudest assertions. That pairing is exactly the one the product
   * now refuses — see the suite below — so the cases moved onto {@link swapped}: one building, one
   * demand, one seed, a different dispatcher. That is not a weaker fixture. It is the only pairing
   * the block was ever *for*, and running the suite on it means the assertions are about the case a
   * player can actually produce.
   */
  const deltaOf = (previous: ShapedDayReport, current: ShapedDayReport) => {
    const delta = reportViewOf(current, { kind: 'played-out' }, previous).delta;
    if (delta === null) throw new Error('expected a delta');
    return delta;
  };

  it('is absent on the first sheet of a session, and on both sheets that are not a filed run', () => {
    // § D223: a sheet reporting a whole day waits for the whole day, and a delta is made of that
    // sheet's figures. Neither unfiled state may carry one.
    expect(reportViewOf(reportOf(clean)).delta).toBeNull();
    expect(emptyReportView().delta).toBeNull();
    const [, second] = attemptsOf(clean, again);
    expect(drawnAt(second, again, again.startedAt).delta).toBeNull();
  });

  it('pairs the figures that moved, and only those', () => {
    const before = reportOf(clean);
    const after = reportOf(swapped);
    const delta = deltaOf(before, after);
    expect(delta.refused).toBeNull();
    const moved = new Map(delta.figures.map((row) => [row.label, row]));
    expect(moved.size).toBeGreaterThan(0);
    for (const cell of after.figures) {
      const wasCell = before.figures.find((candidate) => candidate.id === cell.id);
      const row = moved.get(cell.label);
      if (wasCell?.value === cell.value) {
        expect(row, `${cell.label} did not move and is listed anyway`).toBeUndefined();
        continue;
      }
      expect(row?.before).toBe(wasCell?.value);
      expect(row?.after).toBe(cell.value);
    }
  });

  it('copies both values verbatim, so a refused figure stays refused in the was column', () => {
    /*
     * The property that makes R3 hold here for free: there is no arithmetic, so there is no
     * difference to fail to take. A run whose mean is refused pairs as the literal word, and no
     * digit of the mean it refuses appears anywhere in the block.
     *
     * ## Why the refusal is flipped on a real recording rather than taken from a saturating run
     *
     * The pair has to be **comparable** — the block refuses two sheets of different questions before
     * it pairs anything (issues #117, #102) — and no shipped configuration saturates for one
     * dispatcher and not another on one building at one rate. So `swapped` is re-published with
     * `awtIsValid` false and everything else untouched.
     *
     * That keeps the interesting half of the original fixture intact and loses nothing this case is
     * about: the run **has** a finite `meanWaitS` and must not print it, which is the failure mode,
     * and `shift/report.ts` reaches the same branch whichever of the five grounds set the flag. The
     * suite that proves a *real* saturating run refuses its mean is above, on `saturated`, and it is
     * untouched.
     */
    const refusedTwin: VizRecording = {
      ...swapped,
      summary: {
        ...swapped.summary,
        awtIsValid: false,
        awtInvalidReason: 'the queue was still growing when the window closed',
      },
    };
    const delta = deltaOf(reportOf(clean), reportOf(refusedTwin));
    expect(delta.refused).toBeNull();
    const wait = delta.figures.find((row) => row.label === 'AVERAGE WAIT');
    expect(wait?.after).toBe(WITHHELD);
    expect(wait?.after).not.toMatch(/\d/);
    const text = [...delta.selection, ...delta.figures]
      .flatMap((row) => [row.label, row.before, row.after])
      .join('\n');
    for (const places of [0, 1, 2]) {
      expect(text).not.toContain(refusedTwin.summary.meanWaitS.toFixed(places));
    }
    // And the other direction: the earlier sheet's publishable mean is quoted exactly as it printed.
    expect(wait?.before).toBe(`${clean.summary.meanWaitS.toFixed(1)} s`);
  });

  it('names what was run, so a change cannot be pinned on the wrong cause', () => {
    // Six numbers moving with no word about the seed invites a reader to credit the one thing they
    // touched. The identity rows are the guard, and they are the run's own meta lines.
    const before = reportOf(clean);
    const after = reportOf(swapped);
    const delta = deltaOf(before, after);
    const labels = delta.selection.map((row) => row.label);
    expect(labels).toContain('BUILDING & DISPATCHER');
    const building = delta.selection.find((row) => row.label === 'BUILDING & DISPATCHER');
    expect(building?.before).toBe(before.metaLines[0]);
    expect(building?.after).toBe(after.metaLines[0]);
  });

  it('says so, rather than nothing, when the same selection produced the same day', () => {
    /*
     * § D223's own finding, turned into a sentence a player can read: `runId` is
     * `building-profile-seed`, so re-running one selection is the same run again. The block that
     * would otherwise be empty is where *"the report did not update"* gets answered.
     */
    const [first, second] = attemptsOf(clean, again);
    const delta = deltaOf(first, second);
    expect(delta.figures).toEqual([]);
    expect(delta.selection).toEqual([]);
    expect(delta.note).toContain('Nothing moved');
    expect(delta.note).toContain('reproduces exactly');
    // The two sheets are not identical — the second says `attempt 2` — so this is a real pairing.
    expect(second.metaLines.some((line) => line.includes('attempt 2'))).toBe(true);
  });

  it('states no verdict, orders nothing, and carries the refusal in its own words', () => {
    const delta = deltaOf(reportOf(clean), reportOf(swapped));
    const prose = [delta.caption, delta.note].join('\n');
    // R2's own construction. A block that ordered two runs would say it here or nowhere.
    expect(prose).not.toMatch(/\b(?:improved|worse than|better than|beats?\b|outperform)/i);
    expect(delta.note).toContain('Two runs are two runs');
    expect(delta.note).toContain('50 or more paired runs');
    expect(delta.note).toContain('interval that excludes zero');
    expect(delta.note).toContain('Compare');
  });

  it('gives no row a colour, because there is no direction to signal — KB-15 and R2', () => {
    // Asserted structurally: `DeltaRowView` has three fields and none of them is a colour, a tone or
    // a direction. A green *took the stairs* would be the verdict this block exists not to state.
    const delta = deltaOf(reportOf(clean), reportOf(swapped));
    for (const row of [...delta.selection, ...delta.figures]) {
      expect(Object.keys(row).sort()).toEqual(['after', 'before', 'label']);
    }
  });

  it('prints no clock time either run did not have', () => {
    // The rule `everyString` applies to one sheet, applied to a block made of two: the `after`
    // column must sit inside this run's span, and the `before` column inside the earlier one's.
    const inside = (recording: VizRecording): ReadonlySet<string> => {
      const times = new Set<string>();
      for (let t = recording.startedAt; t <= recording.endedAt; t += 30) times.add(clockOf(t));
      times.add(clockOf(recording.endedAt));
      return times;
    };
    const delta = deltaOf(reportOf(clean), reportOf(swapped));
    for (const row of [...delta.selection, ...delta.figures]) {
      for (const [text, span] of [
        [row.before, inside(clean)],
        [row.after, inside(swapped)],
      ] as const) {
        for (const found of text.match(/\d{2}:\d{2}/g) ?? []) {
          expect(span.has(found), `${found} in "${text}" is outside its own run`).toBe(true);
        }
      }
    }
  });

  it('rotates before the view it feeds is built', async () => {
    /*
     * The **order** is a source property and stays a source guard; everything else about the
     * rotation is now driven directly, below. Rotating after the view is built makes every sheet its
     * own predecessor on the next frame — sixty frames a second — and no unit test of a pure reducer
     * can see that, because it is a fact about where the call sits.
     */
    const panel = await readFile(fileURLToPath(new URL('./reportPanel.ts', import.meta.url)), 'utf8');
    const rotate = panel.indexOf('continuity = rotatedOn(');
    const build = panel.indexOf('const drawn = reportViewOf(');
    expect(rotate).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(-1);
    expect(rotate, 'the rotation must precede the view it feeds').toBeLessThan(build);
  });
});

describe('two runs that were not asked the same question — issues #117 and #102', () => {
  /*
   * ## What was reported
   *
   * #102: *"after finishing a Free play run on Midtown Office, the next run was a Scenario day on
   * Garden Apartments. The comparison table still rendered, showing carried was 726, now 48, as if
   * that were a meaningful swing."* #117, from the other end: a building switch mid-session drew
   * `BUILDING & DISPATCHER was Garden Apartments … → Vertical City …` and then `CARRIED was 48 →
   * 5961` underneath it — *"at least labelled, so the reader can see the two runs aren't
   * comparable"*, and still six rows of arithmetic between two towers.
   *
   * ## The line this suite holds
   *
   * The block **refuses the arithmetic** and says which axis differs, in words. That is #117's own
   * recommendation 2 and the whole of #102's ask. It is the same shape as every other refusal in
   * this product: a figure the run cannot support is replaced by a statement of what is not being
   * said, never by a plausible number and never by a silent hole.
   *
   * The identity rows survive a refusal. They are not the comparison — they are the reason there
   * is not one — and hiding them would leave a reader told *"these are different"* with no way to
   * see how.
   */
  const deltaOf = (previous: ShapedDayReport, current: ShapedDayReport): ReportDeltaView => {
    const delta = reportViewOf(current, { kind: 'played-out' }, previous).delta;
    if (delta === null) throw new Error('expected a delta');
    return delta;
  };

  /** #102's own pairing: one building's Free Play run, then another building's scenario day. */
  const freePlayThenScenario = (): ReportDeltaView =>
    deltaOf(reportOf(saturated, 4, SINGLE), reportOf(clean));

  it('draws no figure row at all when the two runs are of different buildings', () => {
    /*
     * The reported symptom, asserted as an absence. `CARRIED was 726 → 48` is a true statement
     * about two counts and is not a statement about anything the player did — the count follows
     * the building.
     */
    const delta = deltaOf(reportOf(saturated), reportOf(clean));
    expect(delta.refused).not.toBeNull();
    expect(delta.figures).toEqual([]);
    expect(delta.refused?.differsOn).toEqual(['in a different building']);
  });

  it('draws no figure row when one run is Free Play and the other a day of a week', () => {
    // #102's pairing exactly. Two axes differ here — the mode and the demand — because a campaign
    // day's demand is its day number and event, and a Free Play run's is its own selection line.
    const delta = freePlayThenScenario();
    expect(delta.refused).not.toBeNull();
    expect(delta.figures).toEqual([]);
    expect(delta.refused?.differsOn).toContain('in a different mode');
  });

  it('draws no figure row when the traffic differs and nothing else does', () => {
    /*
     * The axis that is easiest to overlook, and the one a player changes most often without
     * thinking of it as a change of question: same building, same mode, a different day of the week
     * — which is 11 % more tenants per day (`shift/growth.ts`) and possibly a different event
     * booked over the demand.
     */
    const delta = deltaOf(reportOf(clean, 4), reportOf(clean, 5));
    expect(delta.refused?.differsOn).toEqual(['against different traffic']);
    expect(delta.figures).toEqual([]);
  });

  it('names every axis that differs, not just the first', () => {
    const delta = freePlayThenScenario();
    expect(delta.refused?.differsOn.length).toBeGreaterThan(1);
    for (const axis of delta.refused?.differsOn ?? []) expect(delta.note).toContain(axis);
  });

  it('keeps the identity rows, because they are the reason there is no comparison', () => {
    const delta = deltaOf(reportOf(saturated), reportOf(clean));
    const labels = delta.selection.map((row) => row.label);
    expect(labels).toContain('BUILDING & DISPATCHER');
    expect(delta.selection.length).toBeGreaterThan(0);
  });

  it('stops calling itself “what moved”, because nothing here moved for a reason', () => {
    // The heading is the part a reader keeps. A caption promising a comparison over a paragraph
    // declining one is the same defect as the figures were, in fewer words.
    const delta = deltaOf(reportOf(saturated), reportOf(clean));
    expect(delta.caption).not.toContain('What moved');
    expect(delta.caption).toBe('The run before this one');
  });

  it('says it is not a comparison, and still says where one can be had', () => {
    const delta = freePlayThenScenario();
    expect(delta.note).toContain('Nothing here is a comparison');
    expect(delta.note).toContain('not asked the same question');
    // A reader told *this is not a comparison* is exactly the reader who wants to know where one
    // is. Dropping the pointer would answer their question with a door closing.
    expect(delta.note).toContain('Compare');
    expect(delta.note).toContain('interval that excludes zero');
    // R2 does not relax because the block is refusing: no word orders the two runs.
    expect(delta.note).not.toMatch(/\b(?:improved|worse than|better than|beats?\b|outperform)/i);
  });

  it('pairs figures exactly when it does not refuse — the two are one condition', () => {
    /*
     * The invariant that keeps the two branches from drifting: an empty `figures` means either
     * *nothing moved* or *nothing may be compared*, and `refused` is the only thing that tells them
     * apart. A refusal that still emitted rows would be the defect with a caveat on top.
     */
    const pairs: readonly (readonly [ShapedDayReport, ShapedDayReport])[] = [
      [reportOf(clean), reportOf(swapped)],
      [reportOf(saturated), reportOf(clean)],
      [reportOf(clean, 4, SINGLE), reportOf(clean)],
      [reportOf(clean, 4), reportOf(clean, 5)],
      ...[attemptsOf(clean, again)],
    ];
    for (const [previous, current] of pairs) {
      const delta = deltaOf(previous, current);
      if (delta.refused !== null) {
        expect(delta.figures, delta.caption).toEqual([]);
        expect(delta.refused.differsOn.length).toBeGreaterThan(0);
      }
    }
  });

  it('does not refuse the one change the block exists for — a different dispatcher', () => {
    /*
     * The standing requirement, pointed the other way. A comparability gate that refused a
     * dispatcher swap would silence the block on the only control a player can move and re-run
     * against the same passengers, which is worse than the defect it fixes: the panel would look
     * careful and say nothing.
     */
    const delta = deltaOf(reportOf(clean), reportOf(swapped));
    expect(delta.refused).toBeNull();
    expect(delta.figures.length).toBeGreaterThan(0);
    expect(delta.caption).toBe('What moved since the run before this one');
  });

  it('cannot see a campaign day’s run length, and that gap is pinned here rather than claimed shut', () => {
    /*
     * § D227: a refusal is pinned by a run, never by another sentence. `DayReportInput` carries no
     * shift length, and the recording's own span is unusable as a basis because `endedAt` is
     * `max(lastEventAt, demandEndedAt)` and therefore moves with the **dispatcher** — keying on it
     * would refuse the one comparison the block is for.
     *
     * So two campaign days of one day number, run at different lengths, still pair. This case
     * exists so that gap is a measured fact with a name, and so a reader of `ReportBasis`' docstring
     * can check the paragraph against a run. Closing it means a required field on `DayReportInput`,
     * which is wider than either issue asks for.
     */
    expect(reportOf(longer).basis).toEqual(reportOf(clean).basis);
    expect(longer.endedAt - longer.startedAt).toBeGreaterThan(clean.endedAt - clean.startedAt);
    expect(deltaOf(reportOf(clean), reportOf(longer)).refused).toBeNull();
  });
});

describe('the baseline is the run before this one — issue #117’s headline, driven', () => {
  /*
   * ## The claim under investigation
   *
   * #117: *"Chancery House, seed 424242. Ran three dispatchers back to back, opening the Day report
   * after each. All three sheets printed the **identical** baseline."* The triage recorded that as
   * **not reproducible from code** and could not do better than an argument, because the rotation
   * lived in three `let`s inside a mount that needs a `document` — see {@link SheetContinuity}.
   *
   * It is a reducer now, so the sequence can be **run**. What follows is not a re-reading of the
   * code: it is the shell's own frame order — a run cleared, a run watched to its end, a sheet
   * filed, and the frames a reader sits on afterwards — fed through the panel three times, with the
   * `was` column read off each sheet.
   *
   * ## What driving it found
   *
   * The headline does **not** reproduce. Three consecutive filed runs difference against their own
   * immediate predecessor, and the three baselines are three different runs. What does reproduce is
   * the confirmed defect's blast radius: **one** unrequested run poisons **one** delta, and the run
   * after it recovers on its own. Both are asserted below rather than asserted in prose.
   *
   * The building is Garden Apartments rather than the reporter's Chancery House, and the claim is
   * unaffected: the rotation reads a sheet's title and meta block and never a tower.
   */
  interface Frame {
    readonly report: ShapedDayReport | undefined;
    readonly progress: RunProgress;
  }

  /**
   * Every frame `renderAll` draws for one run, in the order `main.ts` produces them.
   *
   * Three stages, and the middle one is the one an argument would skip. `runShift` writes
   * `report: undefined` and adopts the recording at its start; the transport advances the playhead
   * with no report on the state; then `tick` reaches the end and `closeShift` writes the sheet. The
   * frames after that are the reader looking at it, at sixty a second.
   */
  function framesOf(recording: VizRecording, sheet: ShapedDayReport): readonly Frame[] {
    const span = recording.endedAt - recording.startedAt;
    const watching = [0, 0.25, 0.5, 0.75, 0.99].map(
      (fraction): Frame => ({
        report: undefined,
        progress: runProgressOf({ recording, simTimeS: recording.startedAt + span * fraction }),
      }),
    );
    const filed: Frame = {
      report: sheet,
      progress: runProgressOf({ recording, simTimeS: recording.endedAt }),
    };
    // The filed frame, then the reader sitting on it. Repeated deliberately: rotating on every
    // frame rather than on every new sheet is the mistake this ordering exists to make visible.
    return [...watching, filed, filed, filed, filed];
  }

  /** What the panel left on screen after each run — the block a player would have read. */
  function drive(
    runs: readonly (readonly [VizRecording, ShapedDayReport])[],
  ): readonly (ReportDeltaView | null)[] {
    let memory: SheetContinuity = NOTHING_FILED_YET;
    const seen: (ReportDeltaView | null)[] = [];
    for (const [recording, sheet] of runs) {
      let last: ReportDeltaView | null = null;
      for (const frame of framesOf(recording, sheet)) {
        memory = rotatedOn(memory, frame.report, frame.progress);
        last = reportViewOf(frame.report, frame.progress, memory.previous).delta;
      }
      seen.push(last);
    }
    return seen;
  }

  it('does not reproduce: three runs back to back give three different baselines', () => {
    const [first, second, third] = closesOf([clean, swapped, thirdDispatcher]);
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('three closes produced fewer sheets');
    }
    const seen = drive([
      [clean, first],
      [swapped, second],
      [thirdDispatcher, third],
    ]);

    // Run 1 has nothing before it, so there is no block at all — not a block with a phantom in it.
    expect(seen[0]).toBeNull();
    // Runs 2 and 3 each difference the run immediately before them.
    expect(seen[1]?.refused).toBeNull();
    expect(seen[2]?.refused).toBeNull();
    const wasOn = (delta: ReportDeltaView | null): string | undefined =>
      delta?.selection.find((row) => row.label === 'BUILDING & DISPATCHER')?.before;
    expect(wasOn(seen[1] ?? null)).toBe(first.metaLines[0]);
    expect(wasOn(seen[2] ?? null)).toBe(second.metaLines[0]);
    // The headline in one assertion: the two baselines a player reads are not the same run.
    expect(wasOn(seen[1] ?? null)).not.toBe(wasOn(seen[2] ?? null));
  });

  it('sixty frames a second of one sheet neither rotate nor re-owe anything', () => {
    /*
     * The mechanism behind the case above, isolated. If a frame of an unchanged sheet rotated,
     * every sheet would be its own predecessor within 17 ms of appearing and every delta would read
     * *nothing moved* — which is a different bug from #117's and would have been read as this one.
     */
    const [sheet] = closesOf([clean]);
    if (sheet === undefined) throw new Error('one close produced no sheet');
    const filed = { kind: 'played-out' } as const;
    const once = rotatedOn(NOTHING_FILED_YET, sheet, filed);
    let memory = once;
    for (let frame = 0; frame < 120; frame += 1) memory = rotatedOn(memory, sheet, filed);
    // By reference: an unchanged frame returns the memory it was given, not a copy of it.
    expect(memory).toBe(once);
  });

  it('an unfiled sheet between two filed ones does not become the baseline', () => {
    /*
     * `runShift` writes `report: undefined`, so an unfiled frame stands between every pair of filed
     * ones. Rotating on that would hand the next delta an `undefined` predecessor and lose the run
     * the reader just read — the block would vanish on every second run rather than lie on one.
     */
    const [first, second] = attemptsOf(clean, again);
    const filed = { kind: 'played-out' } as const;
    let memory = rotatedOn(NOTHING_FILED_YET, first, filed);
    memory = rotatedOn(memory, undefined, filed);
    memory = rotatedOn(memory, undefined, runProgressOf({ recording: again, simTimeS: again.startedAt }));
    memory = rotatedOn(memory, second, filed);
    expect(memory.previous).toBe(first);
  });

  it('a run the player never asked for poisons exactly one delta, and it is now a refusal', () => {
    /*
     * The confirmed half of #117, measured. Boot's own `runShift()` puts a recording on screen
     * before anything is pressed; while `closeMenu` latched the filing gate on **Resume** as well as
     * on a mode, that recording could be filed and rotate into the `was` column (`main.ts`, and
     * `main.progression.test.ts` holds the gate).
     *
     * Two facts come out of driving it, and the second is why the panel change matters on its own:
     *
     * 1. The blast radius is **one** delta. Run 2 differences run 1 and the sheet recovers with no
     *    intervention — which is what the triage's *"the confirmed defect can poison one delta, not
     *    three"* asserted from reading, now run.
     * 2. That one delta is no longer six rows of arithmetic. The phantom is a run of a different
     *    building, so the comparability gate refuses it in words. **Both halves of this fix would
     *    have to fail** for the reported screen to come back.
     */
    const boot = reportOf(saturated);
    const [first, second] = closesOf([clean, swapped]);
    if (first === undefined || second === undefined) throw new Error('two closes produced fewer sheets');
    const seen = drive([
      [saturated, boot],
      [clean, first],
      [swapped, second],
    ]);

    expect(seen[0]).toBeNull();
    expect(seen[1]?.refused?.differsOn).toEqual(['in a different building']);
    expect(seen[1]?.figures).toEqual([]);
    // And the recovery: the very next run is differenced against a run the player did start.
    expect(seen[2]?.refused).toBeNull();
    expect(
      seen[2]?.selection.find((row) => row.label === 'BUILDING & DISPATCHER')?.before,
    ).toBe(first.metaLines[0]);
  });
});

describe('a new sheet opens at its own top — issue #62', () => {
  /*
   * The report auto-opens when a run plays out, and it opened at the offset the reader left the
   * previous sheet at: two thirds down, on the lever cards, with the verdict, the eight stat tiles
   * and the goal list above the fold and nothing indicating they were there. Because a re-run of one
   * selection is bit-identical (§ D223), the visible region is genuinely the same between runs, so
   * it reads as a sheet that failed to update.
   *
   * There is no jsdom, so the identity that drives the reset is asserted through the view — a new
   * account must be distinguishable from the one before it — and the write itself at the source.
   */
  it('a re-run of one selection is a different sheet, even though it is the same run', () => {
    // The case the fix must not miss. `runId` is `building-profile-seed`, so keying the reset on the
    // recording would refuse to scroll on exactly the retry the reader is trying to compare.
    const [first, second] = attemptsOf(clean, again);
    expect(again.runId).toBe(clean.runId);
    expect([first.title, ...first.metaLines]).not.toEqual([second.title, ...second.metaLines]);
  });

  it('writes the top only while the panel is on screen, and clears the debt on the write', async () => {
    /*
     * `index.html` hides a tabpanel with `display: none`, where `scrollTop` is not writable, and
     * `main.ts`'s `closeShift` files the sheet and moves the tab in one patch — so a write at the
     * instant the identity changed lands on an element with no layout and is dropped. The debt is
     * cleared on the write rather than on the change, so a reader who scrolls *this* sheet keeps
     * their place.
     */
    const panel = await readFile(fileURLToPath(new URL('./reportPanel.ts', import.meta.url)), 'utf8');
    expect(panel).toContain("view.state.tab === 'report'");
    expect(panel).toContain('scroller.scrollTop = 0;');
    expect(panel).toContain('continuity = topWritten(continuity);');
    // The scroll container is `.sheet`, which is the element `index.html` gives `overflow: auto`.
    expect(panel).toContain("ui.title.closest('.sheet')");
  });

  it('owes the top on a new filed sheet and on nothing else, and the debt clears once', () => {
    /*
     * The half the source guard above cannot see, now that the rotation is a value: **when** the
     * debt is incurred. Driven rather than read.
     */
    const [first, second] = attemptsOf(clean, again);
    const filed = { kind: 'played-out' } as const;
    expect(NOTHING_FILED_YET.owesTop).toBe(false);
    const afterFirst = rotatedOn(NOTHING_FILED_YET, first, filed);
    expect(afterFirst.owesTop).toBe(true);
    // Sixty frames a second of the same sheet do not re-incur it, and do not re-rotate.
    expect(rotatedOn(topWritten(afterFirst), first, filed).owesTop).toBe(false);
    expect(rotatedOn(afterFirst, second, filed).owesTop).toBe(true);
    // An unfiled frame between two filed ones owes nothing — pressing *Run this shift* is not a
    // sheet arriving.
    expect(rotatedOn(topWritten(afterFirst), undefined, filed).owesTop).toBe(false);
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

/* -------------------------------------------------------------------------- *
 * Overnight — the between-day beat, GitHub issue #91
 * -------------------------------------------------------------------------- */

describe('the between-day beat is drawn, and only where it is true', () => {
  /**
   * A briefing shaped like the one `closeShift` builds. The strings are `shift/tomorrow.ts`'s and
   * are asserted there; what this suite is about is *which sheets carry it*.
   */
  const beat: TomorrowBriefing = {
    headline: 'Thursday is banked. Friday opens.',
    groups: [
      {
        id: 'changed',
        caption: 'What changed overnight',
        rows: [
          {
            id: 'tenants',
            label: 'TENANTS',
            value: '1,710 → 1,898',
            note: '188 people move in overnight.',
          },
        ],
      },
    ],
    withheld: [],
  };

  it('appears on a week-day sheet', () => {
    const view = reportViewOf(reportOf(clean), { kind: 'played-out' }, undefined, beat);
    expect(view.overnight).toBe(beat);
  });

  it('is dropped on a single run, which belongs to no week', () => {
    /*
     * A Free Play run is one replication of one day. It has no tomorrow to have grown into, and
     * *what changed overnight* is a sixth week-shaped statement on a sheet that drops the other
     * five — `WeekFramingView`'s own rule, applied to the beat.
     *
     * The arm is read off the **sheet's** shape rather than off whether a briefing was passed, so
     * this case passes a briefing in and requires it to be dropped rather than merely not supplied.
     */
    const view = reportViewOf(reportOf(clean, 4, SINGLE), { kind: 'played-out' }, undefined, beat);
    expect(view.framing.kind).toBe('single-run');
    expect(view.overnight).toBeNull();
  });

  it('is absent from the empty sheet', () => {
    // No day has closed, so there is no overnight. `null`, not an empty briefing: the box carries
    // the word *Overnight* as an authored child and would otherwise stand over three holes.
    expect(emptyReportView().overnight).toBeNull();
  });

  it('is absent while the run it would follow is still being watched — § D223', () => {
    /*
     * The temporal rule, and the reason this case exists rather than being assumed: the sheet
     * declines to be at 18:00 while the screen is at 09:14, and a beat announcing *tomorrow* over
     * a day the player is four minutes into would be the same two-answers screen with a different
     * caption. `watchingReportView` builds on `emptyReportView`, so the `null` is inherited — this
     * pins that it stays inherited when somebody adds a field.
     */
    const watching = runProgressOf({ recording: clean, simTimeS: clean.startedAt + 60 });
    expect(watching.kind).toBe('watching');
    expect(reportViewOf(reportOf(clean), watching, undefined, beat).overnight).toBeNull();
  });

  it('publishes no figure the run’s own summary could refuse', () => {
    /*
     * Structural rather than stylistic. Every value the beat carries is a count folded at
     * `endedAt` or a population read off a building document, so there is no figure `awtIsValid`
     * speaks for and no path by which this box can print a mean the sheet three sections above is
     * withholding. Asserted here as well as in `shift/tomorrow.test.ts`, because this is the file
     * that would go red if the panel ever started composing its own strings for the box.
     */
    const view = reportViewOf(reportOf(clean), { kind: 'played-out' }, undefined, beat);
    const text = (view.overnight?.groups ?? [])
      .flatMap((group) => [group.caption, ...group.rows.flatMap((row) => [row.label, row.value, row.note])])
      .join(' ')
      .toLowerCase();
    expect(text).not.toContain(WITHHELD.toLowerCase());
    expect(text).not.toContain('average wait');
  });
});

describe('the beat’s box is hidden whole, and every class it emits has a rule', () => {
  const panelSource = async (): Promise<string> =>
    readFile(fileURLToPath(new URL('./reportPanel.ts', import.meta.url)), 'utf8');

  it('hides the container rather than emptying it', async () => {
    /*
     * The same rule the six week-shaped slots above are pinned by, and for the same reason:
     * `#report-overnight` carries the eyebrow *Overnight* as an authored child, so blanking the
     * lists would leave the word standing over nothing — `docs/10` R3 at the layout's scale.
     */
    const panel = await panelSource();
    expect(panel).toContain('setHidden(ui.overnight, beat === null)');
  });

  it('still does no arithmetic — the beat did not bring a formatter in with it', async () => {
    // Re-asserted for this change specifically: the box is the first thing on this sheet that
    // draws a count *and* a percentage, and both are formatted in `shift/tomorrow.ts`.
    const panel = await panelSource();
    const body = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const forbidden of ['toFixed(', 'toLocaleString(', 'Math.round(']) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });

  it('has a stylesheet rule for every class the box emits', async () => {
    /*
     * Derived from the panel source rather than listed, in `dev/surfaces.test.ts`'s idiom and for
     * its reason: twenty-nine class names once shipped with zero rules anywhere, and nothing about
     * unstyled markup looks broken in a screenshot of the rest of the game.
     */
    const panel = await panelSource();
    const emitted = new Set<string>();
    for (const match of panel.matchAll(/className:\s*'(overnight-[a-z-]+)'/gu)) {
      const name = match[1];
      if (name !== undefined) emitted.add(name);
    }
    expect(emitted.size, 'the derivation stopped matching').toBeGreaterThanOrEqual(5);
    const html = await readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
    const missing = [...emitted].filter((name) => !html.includes(`.${name}`));
    expect(missing, 'classes the panel emits and the stylesheet never mentions').toEqual([]);
  });
});
