/**
 * **The riders who were left standing, beside the goal their standing there flatters** —
 * [§ D106](../../../../DECISIONS.md) at the renderer, GitHub issue **#456**.
 *
 * ## What this file exists to refuse
 *
 * `docs/14` § 5 criterion 4: *abandonment and stairs are reported beside AWT, never folded into it —
 * a configuration whose AWT improves while its served-leg count falls must be **shown** doing so.*
 * `core` keeps it (the fifth `awtIsValid` ground suppresses a mean outright above 2 % abandonment)
 * and until this wave the renderer did not: `shift/goals.ts` graded a share whose denominator is the
 * legs that **boarded**, so a day could clear the bar by leaving people on the landing and the
 * screen that graded it said nothing. `docs/14`'s own status table called that *the clause to
 * distrust first*.
 *
 * ## The pin is a pair of days, not a string
 *
 * A test that asserted *the sentence appears* would pass on a product that drew it on every row of
 * every day, which is not the claim. The claim is a **difference**: a day cleared *because* riders
 * were left standing must be distinguishable on screen from one cleared by moving people. So the
 * two fixtures are built to be as alike as a pair of days can be —
 *
 * | | {@link movedThePeople} | {@link leftThemStanding} |
 * |---|---|---|
 * | arrivals | 40 | 40 |
 * | boarded, all inside a minute | 40 | 20 |
 * | never boarded at all | 0 | 20 |
 * | `minutePct` | **100** | **100** |
 * | the `minute` goal | **met** | **met** |
 * | `abandoned` | 0 | **20** |
 *
 * — and the assertion is that the *reading* is identical on both and the *screen* is not. That is
 * the defect stated as an experiment: before this wave every surface below drew the same row for
 * both days.
 *
 * ## And the set of surfaces is derived rather than transcribed
 *
 * The second suite reads the tree. This repository has repeatedly shipped a figure fixed on one
 * surface and left stale on another (§ D362's declared pair exists for exactly that), so neither
 * *which modules grade a goal* nor *which modules draw a graded row* is a list written here: both
 * are recovered from disk and checked in both directions.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { goalRowsOf } from '../dev/leftRail.js';
import { goalRowViewOf } from '../dev/reportPanel.js';
import { campaignTestRows } from '../everyday/campaignModel.js';
import { stageGoalsOf } from '../everyday/stageScreenModel.js';
import { openingCareer } from '../campaign/career.js';
import { DIFFICULTIES } from '../campaign/economy.js';
import { observationsAt } from '../live/observations.js';
import {
  servedLeg,
  syntheticRecording,
  waitingLeg,
} from '../live/synthetic.test-helper.js';
import type { VizLeg, VizRecording } from '../contract/types.js';

import { gaveUpBesideOf, goalsForDay, OVERLAP_UNSETTLED, readGoals } from './goals.js';
import { shiftObservationsOf } from './observations.js';
import { GOAL_OBSERVATION_IDS, type GoalObservations, type Observations, type ShiftGoal } from './types.js';

/* -------------------------------------------------------------------------- *
 * The two days
 * -------------------------------------------------------------------------- */

const ARRIVALS = 40;
/** Well inside `fixtureSummary`'s own 60 s long-wait threshold, so every boarded leg is prompt. */
const WAITED_S = 30;
/** Past `fixtureSummary`'s 900 s horizon for a leg that arrived in the first four hundred seconds. */
const ENDED_AT = 2_000;

function arrivalAt(index: number): number {
  return index * 10;
}

/** Forty riders, forty carried, none of them waiting a minute. */
function movedThePeople(): VizRecording {
  const legs: VizLeg[] = [];
  for (let index = 0; index < ARRIVALS; index += 1) {
    const at = arrivalAt(index);
    legs.push(servedLeg(`rider-${String(index)}`, at, at + WAITED_S, at + WAITED_S + 25));
  }
  return syntheticRecording({ startedAt: 0, endedAt: ENDED_AT, legs });
}

/**
 * The same forty riders, and **half of them are still on the landing when the day ends**.
 *
 * The twenty who were carried were carried exactly as promptly as all forty were above, so the
 * share of served riders away inside a minute is the same 100 %. What differs is who is in the
 * denominator — which is the whole of what § D106 is about.
 */
function leftThemStanding(): VizRecording {
  const legs: VizLeg[] = [];
  for (let index = 0; index < ARRIVALS; index += 1) {
    const at = arrivalAt(index);
    legs.push(
      index % 2 === 0
        ? servedLeg(`rider-${String(index)}`, at, at + WAITED_S, at + WAITED_S + 25)
        : waitingLeg(`rider-${String(index)}`, at),
    );
  }
  return syntheticRecording({ startedAt: 0, endedAt: ENDED_AT, legs });
}

function foldOf(recording: VizRecording): Observations {
  return shiftObservationsOf(observationsAt(recording, recording.endedAt));
}

const MOVED = foldOf(movedThePeople());
const LEFT = foldOf(leftThemStanding());

/** The daily loop's own `minute` bar — the one goal both days clear, and clear differently. */
function minuteGoal(): ShiftGoal {
  const goal = goalsForDay(1).find((entry) => entry.id === 'minute');
  if (goal === undefined) throw new Error('goalsForDay(1) has no minute bar');
  return goal;
}

describe('the two days are alike everywhere the defect lives', () => {
  it('clears the same bar with the same figure, and one of them did it by leaving people standing', () => {
    expect(MOVED.arrived).toBe(ARRIVALS);
    expect(LEFT.arrived).toBe(ARRIVALS);
    // The share, identical — this is the statement the goal grades.
    expect(MOVED.minutePct).toBe(100);
    expect(LEFT.minutePct).toBe(100);
    // The denominator, halved. `servedLegs` is `minutePct`'s own `n`.
    expect(MOVED.servedLegs).toBe(ARRIVALS);
    expect(LEFT.servedLegs).toBe(ARRIVALS / 2);
    // Nobody's wait crossed the line on one day; half the building's did on the other.
    expect(MOVED.abandoned).toBe(0);
    expect(LEFT.abandoned).toBe(ARRIVALS / 2);
    // And none of those twenty was carried, so the overlap clause takes its `none of them` arm.
    expect(LEFT.abandonedCarried).toBe(0);
  });

  it('grades the minute bar met on both, with a byte-identical reading', () => {
    const goal = minuteGoal();
    const [moved] = readGoals([goal], MOVED);
    const [left] = readGoals([goal], LEFT);
    expect(moved?.state).toBe('met');
    expect(left?.state).toBe('met');
    /*
     * **The reading is the same object on both days**, which is what makes the screens' difference
     * load-bearing rather than incidental: nothing about the verdict, the figure, the glyph or the
     * bar can be what distinguishes them, so whatever does distinguish them is the figure this
     * wave added.
     */
    expect(left).toEqual(moved);
  });

  it('does not let the carry bar stand in for the missing figure', () => {
    /*
     * `carryPct` **does** fall — `shift/observations.ts` argues at length that its denominator is
     * arrivals and that leaving therefore moves it down. That is real and it is not the closure
     * § D106 asks for: a reader watching the *minute* row clear at 100 % is owed the count beside
     * **that** row, not a different row moving somewhere else on the same screen. The assertion is
     * here so that a later reader does not mistake one for the other.
     */
    expect(MOVED.carryPct).toBe(100);
    expect(LEFT.carryPct).toBe(50);
  });
});

/* -------------------------------------------------------------------------- *
 * Every surface that grades it, drawn on both days
 * -------------------------------------------------------------------------- */

/** `20 of 40 waited past the 15-minute give-up horizon, none of them carried; …` */
const EXPECTED_BESIDE =
  '20 of 40 waited past the 15-minute give-up horizon, none of them carried; ' +
  'this share is over the legs that boarded';

describe('the derivation itself', () => {
  it('says nothing on the day that moved its people, and names the twenty on the day that did not', () => {
    expect(gaveUpBesideOf(minuteGoal(), MOVED, 'whole-run')).toBe('');
    expect(gaveUpBesideOf(minuteGoal(), LEFT, 'whole-run')).toBe(EXPECTED_BESIDE);
  });

  it('says nothing beside a bar the count cannot flatter, on either day', () => {
    /*
     * The five unflattered quantities, driven rather than asserted from the table: `carryPct` and
     * `peakQueue` are moved the *wrong* way by a rider left standing, `worstWaitS`'s maximum goes
     * censored and grades `pending`, and `workPerServedLegKJ` has the served legs in its own
     * denominator (§ D468). A row that grew this sentence without its quantity being flattered
     * would be noise implying a figure was flattered when it was not.
     */
    for (const goal of goalsForDay(1)) {
      if (goal.reads === 'minutePct') continue;
      expect(gaveUpBesideOf(goal, LEFT, 'whole-run'), `${goal.id} should carry no count`).toBe('');
    }
  });

  it('holds the two tables in step — exactly the flattered quantities produce a sentence', () => {
    /*
     * One goal per member of `GOAL_OBSERVATION_IDS`, built here rather than taken from a shipped
     * set, because two of the seven quantities are read by no goal in `goalsForDay` at all — the
     * campaign's trip budget reads `loadedDepartures` and nothing reads `abandoned` any more. A
     * suite driven only from the daily loop's five bars would leave those two unchecked, which is
     * how the classification table would drift from the clause table without anything noticing.
     */
    const sentences = new Map<string, string>();
    for (const reads of GOAL_OBSERVATION_IDS) {
      const goal: ShiftGoal = {
        id: `probe-${reads}`,
        label: `probe ${reads}`,
        unit: '',
        bar: 0,
        compare: 'at-most',
        reads,
      };
      sentences.set(reads, gaveUpBesideOf(goal, LEFT, 'whole-run'));
    }
    // Exactly the two the module classifies as flattered, named here so a third arriving silently
    // fails rather than passing as *more coverage*.
    expect([...sentences].filter(([, said]) => said !== '').map(([reads]) => reads).sort()).toEqual([
      'loadedDepartures',
      'minutePct',
    ]);
    // And every sentence produced ends in a clause rather than in a dangling semicolon, which is
    // what a `true` with no entry in the clause table would leave behind.
    for (const [reads, said] of sentences) {
      if (said === '') continue;
      expect(said.endsWith(';'), `${reads} produced a sentence with no clause`).toBe(false);
      expect(said.split('; ')[1]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('carries the overlap and the run’s own horizon — § D417', () => {
    // Every one of the three overlap arms, because a surface that published the bare count would
    // invite a reader to subtract it from the people.
    const some = gaveUpBesideOf(minuteGoal(), { ...LEFT, abandonedCarried: 7 }, 'whole-run');
    expect(some).toContain('7 of them carried');
    const all = gaveUpBesideOf(minuteGoal(), { ...LEFT, abandonedCarried: LEFT.abandoned }, 'whole-run');
    expect(all).toContain('every one of them carried');
    expect(gaveUpBesideOf(minuteGoal(), LEFT, 'whole-run')).toContain('none of them carried');
    // The run's own line, never a hard-coded fifteen minutes.
    expect(gaveUpBesideOf(minuteGoal(), { ...LEFT, horizonS: 600 }, 'whole-run')).toContain('10-minute');
    expect(gaveUpBesideOf(minuteGoal(), { ...LEFT, horizonS: 750 }, 'whole-run')).toContain('750 s');
  });

  it('does not claim they left, because on a no-patience run nobody did — docs/19 defect 3', () => {
    const said = gaveUpBesideOf(minuteGoal(), LEFT, 'whole-run');
    expect(said).toContain('waited past');
    expect(said).not.toContain('gave up and');
    expect(said).not.toContain('took the stairs');
  });
});

/* -------------------------------------------------------------------------- *
 * The overlap is an outcome — § D557, GitHub issue #537
 * -------------------------------------------------------------------------- */

/**
 * A day on which every rider's wait crosses the horizon **and a car comes anyway**, late.
 *
 * The fixtures above cannot show what this block is about: on {@link leftThemStanding} nobody who
 * crossed the line is ever carried, so `abandonedCarried` is `0` at every playhead and the overlap
 * clause reads *none of them carried* honestly from 00:00 to the end. That is the arm the defect
 * hides behind.
 *
 * Here all forty board at `arrivedAt + 1 000` — a thousand seconds is past `fixtureSummary`'s own
 * 900 s horizon, so every one of them is counted `abandoned`, and every one of them alights. So the
 * overlap **moves inside one run**, which is the whole claim: it is not a fold of what has happened
 * by `t`, it is an outcome the end of the day decides.
 */
const LATE_BOARD_S = 1_000;

function carriedThemLate(): VizRecording {
  const legs: VizLeg[] = [];
  for (let index = 0; index < ARRIVALS; index += 1) {
    const at = arrivalAt(index);
    legs.push(servedLeg(`rider-${String(index)}`, at, at + LATE_BOARD_S, at + LATE_BOARD_S + 25));
  }
  return syntheticRecording({ startedAt: 0, endedAt: ENDED_AT, legs });
}

/** The same run, folded at a playhead short of its end. */
function foldAt(recording: VizRecording, at: number): Observations {
  return shiftObservationsOf(observationsAt(recording, at));
}

describe('the overlap moves inside one run, so it is an outcome rather than a reading', () => {
  const LATE = carriedThemLate();
  /* Every rider has arrived and the first ten have crossed the horizon; none has alighted yet. */
  const MIDWAY = foldAt(LATE, LATE_BOARD_S);
  const FINISHED = foldAt(LATE, ENDED_AT);

  it('reads “none carried” at the playhead and “every one” at the end, about one cohort', () => {
    /*
     * The measurement this whole block rests on. The mid-run fold is not wrong — it is a count of
     * what had happened by then — and that is exactly why the **sentence** may not state it as a
     * settled fate: at 1 000 s the truthful fold says nobody who crossed the line has been carried,
     * and by the end of the same day every single one of them has.
     */
    expect(MIDWAY.abandoned).toBeGreaterThan(0);
    expect(MIDWAY.abandonedCarried).toBe(0);
    expect(FINISHED.abandoned).toBe(ARRIVALS);
    expect(FINISHED.abandonedCarried).toBe(ARRIVALS);
  });

  it('withholds the overlap at a playhead short of the end, and says it is withholding it', () => {
    const live = gaveUpBesideOf(minuteGoal(), MIDWAY, 'now');
    /*
     * **The three clauses that are readings survive.** The count is a fold at `t`, non-decreasing
     * in it; `arrived` is its population, which R13 requires travelling with it; the denominator
     * clause is § D106's content. None of the three is an outcome, so none is withheld.
     */
    expect(live).toContain(`${String(MIDWAY.abandoned)} of ${String(MIDWAY.arrived)}`);
    expect(live).toContain('15-minute give-up horizon');
    expect(live).toContain('this share is over the legs that boarded');
    expect(live).toContain('so far');
    // And the withholding is *said*, which is § D223's remedy rather than a quieter figure.
    expect(live).toContain(OVERLAP_UNSETTLED);
    /*
     * **The verb is gone, and that is the assertion a revert fails.** `carried` is
     * `honesty/properties.ts#WHOLE_RUN_COUNTS`'s cue for `summary.delivered`, and the reason the
     * deep corpus reported this sentence at `stage(@1474s).goals.minute.beside` is that the cue sat
     * in one clause with a live count that happened to equal the finished day's delivered total.
     * The cue is not what is being avoided — the *claim* is: *none of them carried* is a statement
     * about the end of a day that has not ended.
     */
    for (const cue of ['carried', 'delivered', 'got where', 'arrived where', 'reached their']) {
      expect(live, `the mid-run sentence still says "${cue}"`).not.toContain(cue);
    }
  });

  it('states the overlap once the day has ended — § D417 is narrowed, not withdrawn', () => {
    const settled = gaveUpBesideOf(minuteGoal(), FINISHED, 'whole-run');
    expect(settled).toContain('every one of them carried');
    expect(settled).not.toContain(OVERLAP_UNSETTLED);
    expect(settled).not.toContain('so far');
  });

  it('draws the withheld arm on the stage strip at a playhead short of the end', () => {
    /*
     * The surface the deep corpus actually failed on. Driven through `stageGoalsOf` rather than
     * through `gaveUpBesideOf`, so a strip that stopped passing its own `judged` down fails here
     * even though the derivation is correct.
     */
    const strip = stageGoalsOf({
      readings: readGoals(goalsForDay(1), MIDWAY),
      observations: MIDWAY,
      simTimeS: LATE_BOARD_S,
      endedAt: ENDED_AT,
      history: [],
      day: 1,
    });
    expect(strip.judged).toBe(false);
    const row = strip.rows.find((entry) => entry.id === 'minute');
    expect(row?.beside).toContain(OVERLAP_UNSETTLED);
    expect(row?.beside).not.toContain('carried');

    // And the same strip at `endedAt` states it, so the fix is a gate rather than a deletion.
    const graded = stageGoalsOf({
      readings: readGoals(goalsForDay(1), FINISHED),
      observations: FINISHED,
      simTimeS: ENDED_AT,
      endedAt: ENDED_AT,
      history: [],
      day: 1,
    });
    expect(graded.judged).toBe(true);
    expect(graded.rows.find((entry) => entry.id === 'minute')?.beside).toContain('of them carried');
  });

  it('draws the withheld arm on the Engineer rail’s own rows at the same playhead', () => {
    const rows = goalRowsOf(readGoals(goalsForDay(1), MIDWAY), [], 1, MIDWAY, 'now');
    const row = rows.find((entry) => entry.label.includes('inside a minute'));
    expect(row?.beside).toContain(OVERLAP_UNSETTLED);
    expect(row?.beside).not.toContain('carried');
  });

  it('draws the withheld arm on the campaign desk, which folds at the playhead too', () => {
    /*
     * `campaignScreens.ts#observationsOfHost` is *"today's fold at the playhead"*, so this desk is
     * a mid-run surface as much as the stage is, and the basis reaches it through
     * `CampaignInput.observationsBasis`.
     */
    const tower = openingCareer('eta').towers[0];
    if (tower === undefined) throw new Error('no opening tower');
    const rows = campaignTestRows(DIFFICULTIES.standard, tower, MIDWAY, [], 'now');
    const away = rows.find((entry) => entry.id === 'away');
    expect(away?.beside).toContain(OVERLAP_UNSETTLED);
    expect(away?.beside).not.toContain('carried');
  });

  it('leaves the verdict, the figure and the bar exactly where they were', () => {
    /*
     * § D106 rule 1 again, on the new gate: what the basis moves is one clause of one sentence and
     * nothing else. A basis that reached a glyph or a percentage would be grading a day early,
     * which is the defect this closes rather than a second version of it.
     */
    const live = goalRowsOf(readGoals(goalsForDay(1), MIDWAY), [], 1, MIDWAY, 'now');
    const settled = goalRowsOf(readGoals(goalsForDay(1), MIDWAY), [], 1, MIDWAY, 'whole-run');
    expect(live.map((row) => ({ ...row, beside: '' }))).toEqual(
      settled.map((row) => ({ ...row, beside: '' })),
    );
    expect(live.map((row) => row.beside)).not.toEqual(settled.map((row) => row.beside));
  });
});

describe('the two screens differ, on every surface that grades the bar', () => {
  function railRow(observations: Observations): string {
    const rows = goalRowsOf(readGoals(goalsForDay(1), observations), [], 1, observations, 'whole-run');
    const row = rows.find((entry) => entry.label.includes('inside a minute'));
    if (row === undefined) throw new Error('no minute row on the rail');
    return `${row.glyph} ${row.label} ${row.value} ${row.beside}`;
  }

  function stageRow(recording: VizRecording, observations: Observations): string {
    const strip = stageGoalsOf({
      readings: readGoals(goalsForDay(1), observations),
      observations,
      simTimeS: recording.endedAt,
      endedAt: recording.endedAt,
      history: [],
      day: 1,
    });
    const row = strip.rows.find((entry) => entry.id === 'minute');
    if (row === undefined) throw new Error('no minute row on the stage strip');
    return `${row.glyph} ${row.label} ${row.value} ${row.beside}`;
  }

  function sheetRow(observations: Observations): string {
    const [reading] = readGoals([minuteGoal()], observations);
    if (reading === undefined) throw new Error('no minute reading');
    const view = goalRowViewOf({
      reading,
      was: '—',
      beside: gaveUpBesideOf(reading.goal, observations, 'whole-run'),
    });
    return `${view.glyph} ${view.label} ${view.display} ${view.beside}`;
  }

  function campaignRow(observations: GoalObservations): string {
    const tower = openingCareer('eta').towers[0];
    if (tower === undefined) throw new Error('no opening tower');
    const rows = campaignTestRows(DIFFICULTIES.standard, tower, observations, [], 'whole-run');
    const row = rows.find((entry) => entry.id === 'away');
    if (row === undefined) throw new Error('no away row on the campaign desk');
    return `${row.reading?.glyph ?? '·'} ${row.label} ${row.reading?.display ?? '—'} ${row.beside}`;
  }

  it('the Engineer rail', () => {
    expect(railRow(MOVED)).not.toContain('waited past');
    expect(railRow(LEFT)).toContain(EXPECTED_BESIDE);
    expect(railRow(LEFT)).not.toBe(railRow(MOVED));
  });

  it('the Everyday stage strip', () => {
    const moved = movedThePeople();
    const left = leftThemStanding();
    expect(stageRow(moved, MOVED)).not.toContain('waited past');
    expect(stageRow(left, LEFT)).toContain(EXPECTED_BESIDE);
    expect(stageRow(left, LEFT)).not.toBe(stageRow(moved, MOVED));
  });

  it('the Day report’s goal block', () => {
    expect(sheetRow(MOVED)).not.toContain('waited past');
    expect(sheetRow(LEFT)).toContain(EXPECTED_BESIDE);
    expect(sheetRow(LEFT)).not.toBe(sheetRow(MOVED));
  });

  it('the campaign desk’s away test, which reads the same share', () => {
    expect(campaignRow(MOVED)).not.toContain('waited past');
    expect(campaignRow(LEFT)).toContain('waited past the 15-minute give-up horizon');
    expect(campaignRow(LEFT)).not.toBe(campaignRow(MOVED));
  });

  it('and the count is beside the verdict rather than inside it — nothing about the grade moves', () => {
    /*
     * § D106 rule 1 and the energy rule's own shape: published **beside**, never folded in. A day
     * that clears the bar clears it, and the sheet says how it was cleared. So the two days' rows
     * differ in exactly one field.
     */
    const moved = goalRowsOf(readGoals(goalsForDay(1), MOVED), [], 1, MOVED, 'whole-run');
    const left = goalRowsOf(readGoals(goalsForDay(1), LEFT), [], 1, LEFT, 'whole-run');
    const minuteMoved = moved.find((row) => row.label.includes('inside a minute'));
    const minuteLeft = left.find((row) => row.label.includes('inside a minute'));
    expect({ ...minuteMoved, beside: '' }).toEqual({ ...minuteLeft, beside: '' });
    expect(minuteMoved?.beside).toBe('');
    expect(minuteLeft?.beside).toBe(EXPECTED_BESIDE);
  });
});

/* -------------------------------------------------------------------------- *
 * The set of surfaces, recovered from disk
 * -------------------------------------------------------------------------- */

const SRC = fileURLToPath(new URL('..', import.meta.url));

/**
 * Source with its comments removed — `boundaries.test.ts#stripComments`'s own expression, and the
 * same two regexes `honesty/derive.test-helper.ts#blankComments` uses one directory over.
 *
 * **Every scan below runs on this rather than on the raw file, and that is a correction rather than
 * a precaution.** The guard was written to match `gaveUpBesideOf\(|\.beside\b` on the reasoning that
 * requiring *a call or a property read* rather than the bare word `beside` was enough to keep a
 * docstring from satisfying it. It is not, and the positive control proved it: a module that grades
 * a goal, draws nothing at all, and merely says `{@link GoalRow.beside}` in its own prose **passed
 * this suite**, because a `{@link X.beside}` carries the dot the regex was relying on. That is
 * exactly the shape CLAUDE.md records three times — a guard passing its own positive control
 * because a boundary missed the name the defect actually had — arriving inside the guard written to
 * prevent it.
 *
 * The same argument binds the class scan below with more force: half of what a `…-beside` class name
 * is used for in this package is a docstring naming the class it draws.
 */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Every non-test, non-helper `.ts` under `packages/viz/src`, with its comment-stripped source. */
function shippedModules(): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const at = join(dir, entry.name);
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(at, rel);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test-helper.ts')) continue;
      found.set(rel, codeOf(readFileSync(at, 'utf8')));
    }
  };
  walk(SRC, '');
  return found;
}

/**
 * The modules that grade a goal and hand the readings on **without drawing one**.
 *
 * Named with a reason each, and checked in both directions below: an entry that stops grading is a
 * stale exemption, and a module that starts grading without being classified is the defect this
 * suite exists to catch arriving on a fifth surface.
 */
const FOLDS_WITHOUT_DRAWING: Readonly<Record<string, string>> = Object.freeze({
  'dev/main.ts':
    'files the readings into `outcomeOf` on close. It draws no row; `dev/leftRail.ts` and ' +
    '`dev/reportPanel.ts` are where this shell puts a goal on screen.',
  'everyday/host.ts':
    'the one fold behind `goalsAt`/`goalsToday`. It hands readings — and, since #456, the fold ' +
    'they were graded against — to the screens; it draws nothing itself.',
  'honesty/agreement.ts':
    'the corpus’s cross-surface pairs. It grades a constant day to build a week, and asserts ' +
    'agreement between surfaces rather than drawing one.',
});

describe('every surface that grades the bar is accounted for', () => {
  const modules = shippedModules();

  it('classifies every module in the tree that grades a goal, in both directions', () => {
    const grades = [...modules]
      .filter(([, source]) => /\breadGoals?\(/.test(source))
      .map(([path]) => path)
      .sort();
    /*
     * Derived, not transcribed: the split below is asserted to *partition* what the scan found, so
     * a sixth module calling `readGoal` fails here until somebody says which half it is in.
     */
    const draws = grades.filter((path) => !(path in FOLDS_WITHOUT_DRAWING));
    const folds = grades.filter((path) => path in FOLDS_WITHOUT_DRAWING);
    expect(folds.sort()).toEqual(Object.keys(FOLDS_WITHOUT_DRAWING).sort());
    expect(draws.length).toBeGreaterThan(0);
    for (const path of draws) {
      expect(
        modules.get(path) ?? '',
        `${path} grades a goal and never draws the riders who were left standing`,
        /*
         * A **call or a property read**, deliberately, and not the bare word — and over
         * {@link codeOf}'s comment-stripped source rather than the raw file, which is the half that
         * was measured rather than assumed. Requiring the dot is not on its own enough: a docstring
         * saying `{@link GoalRow.beside}` carries one, and a module that graded a goal and drew
         * nothing passed this assertion until the source stopped including its own prose. See
         * {@link codeOf}.
         */
      ).toMatch(/gaveUpBesideOf\(|\.beside\b/);
    }
  });

  it('gives every goal-row shape in the product a slot for the count', () => {
    /*
     * The `was` slot is the marker, and it is a real one rather than a convention this test
     * invented: every shape the product draws a graded goal through carries the casual handoff's
     * *"what it was last time"* figure (§ 8.6), and nothing else in the tree declares that field.
     * So *has a `was`* recovers the goal-row shapes from disk, and each of them must also carry the
     * figure § D106 puts beside the verdict.
     */
    const shapes = [...modules].filter(([, source]) => source.includes('readonly was: string;'));
    expect(shapes.length).toBeGreaterThanOrEqual(5);
    for (const [path, source] of shapes) {
      expect(source, `${path} declares a "was" slot and no "beside" slot`).toContain(
        'readonly beside: string;',
      );
    }
  });

  it('lets no module hand the sentence an arrival count nobody counted', () => {
    /*
     * The defect this closes shipped for as long as the figure did not exist. The campaign desk's
     * `campaignScreens.ts#observationsOfHost` rebuilds a `GoalObservations` out of the daily loop's
     * readings, and `arrived` is not a bar — it is the wake-up **gate** — so no reading carries it.
     * The field was filled with `Number.POSITIVE_INFINITY`, which graded correctly and printed
     * nothing, right up until a surface put the count's own denominator on screen: the desk would
     * have read `34 of Infinity waited past the horizon`. `arrived` comes from the fold now, and
     * this is the check that says so, derived from the tree rather than from that one file.
     */
    for (const [path, source] of modules) {
      expect(source, `${path} manufactures an arrival count`).not.toMatch(
        /arrived:\s*(Number\.POSITIVE_INFINITY|Infinity)/,
      );
    }
  });

  it('draws it wherever it draws the “was” slot', () => {
    /*
     * The renderers, recovered the same way — by what they write into the document. A goal row is
     * drawn with a `…-was` class on every one of them, so the set of files carrying such a class
     * *is* the set of mounts that put a graded goal on screen, and each must also write a
     * `…-beside`. This is the check that would have caught the figure being fixed on the rail and
     * left off the stage.
     */
    const wasClass = /'[a-z-]*-was'/;
    const besideClass = /'[a-z-]*-beside'/;
    const mounts = [...modules].filter(([, source]) => wasClass.test(source));
    expect(mounts.length).toBeGreaterThanOrEqual(4);
    for (const [path, source] of mounts) {
      expect(source, `${path} draws the "was" slot and not the riders who were left standing`).toMatch(
        besideClass,
      );
    }
  });
});
