/**
 * The shift path's reporting window — `docs/20` defect 5.
 *
 * Every assertion here is derived from `MATRIX_CELLS` on both sides. A test that hard-coded
 * *"garden-apartments is full-run"* would pass on an implementation that hard-coded the same
 * string, which is the one implementation this module exists not to be: the rule reads a
 * measurement this project already published, and the point of the rule is that adding a matrix
 * cell moves it.
 */

import { MATRIX_CELLS } from '@elevator-sim/experiments/browser';
import { describe, expect, it } from 'vitest';

import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';
import { shiftReportWindowFor } from './reportWindow.js';

const MATRIX_BUILDINGS = [...new Set(MATRIX_CELLS.map((cell) => cell.building))];

/**
 * The buildings the rule moves, derived here rather than exported from the module.
 *
 * It lived on `reportWindow.ts` for one draft and `deadCode.test.ts` was right to refuse it: its
 * only caller was this file, which is the *"name the non-test caller"* rule the roadmap's standing
 * requirement states. The derivation is not lost by moving — both sides still read `MATRIX_CELLS`
 * and `shiftReportWindowFor`, so a cell added to the matrix moves the rule and this list together,
 * and neither is a hand-written membership list.
 */
const movedBuildings = (): readonly string[] =>
  MATRIX_BUILDINGS.filter((id) => shiftReportWindowFor(id) === 'full-run');

describe('which window a shift reports over', () => {
  it('is the matrix’s own answer, unanimously or not at all', () => {
    for (const building of MATRIX_BUILDINGS) {
      const cells = MATRIX_CELLS.filter((cell) => cell.building === building);
      const unanimous = cells.every((cell) => cell.traffic.reportWindow === 'full-run');
      expect(shiftReportWindowFor(building)).toBe(unanimous ? 'full-run' : undefined);
    }
  });

  it('leaves a building the matrix does not measure on the template’s own band', () => {
    /*
     * `undefined`, not `'peak-5min'`. Those are different windows on the same run — one is the
     * demand template's declared band and the other makes `core` search the arrivals — and a
     * building nobody censused gets the one it has always had. `chancery-house` and the reader's
     * own drawings are this branch.
     */
    expect(shiftReportWindowFor('chancery-house')).toBeUndefined();
    expect(shiftReportWindowFor('a-building-nobody-has-drawn')).toBeUndefined();
  });

  it('moves something, and does not move everything', () => {
    /*
     * The shape of the answer, which is what stops the rule from being either inert or a
     * re-measurement of the product. A rule that moved no building would be a fix nobody is
     * running; a rule that moved every building would silently re-window every sheet in the
     * viewer to repair one, which is a change nobody asked for wearing a bug fix's clothes.
     */
    const moved = movedBuildings();
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.length).toBeLessThan(MATRIX_BUILDINGS.length);
  });

  it('is decided per building and not per cell — the case Midtown Office settles', () => {
    /*
     * Midtown has three cells and one of them (`midtown-interfloor`) declares `full-run`. Under an
     * *any* rule that would move the busiest shipped building's every sheet, on the strength of a
     * 1 800 s interfloor study that says nothing about whether Midtown's peak band is ever empty —
     * at 1 % of 1 710 people it never is. Asserted as a premise as well as an outcome, so a matrix
     * edit that makes Midtown unanimous fails here rather than moving it quietly.
     */
    const midtown = MATRIX_CELLS.filter((cell) => cell.building === 'midtown-office');
    expect(midtown.some((cell) => cell.traffic.reportWindow === 'full-run')).toBe(true);
    expect(midtown.every((cell) => cell.traffic.reportWindow === 'full-run')).toBe(false);
    expect(shiftReportWindowFor('midtown-office')).toBeUndefined();
  });
});

describe('the run the shift path actually asks for', () => {
  const summaryOf = (state: ViewerState) => {
    const plan = shiftRunConfigOf(RESOURCES, state);
    return recordRun(plan.config, {
      recordDecisions: false,
      outOfServiceCarIds: plan.outOfServiceCarIds,
    }).recording.summary;
  };

  /**
   * The seam, driven end to end — a window chosen here and never handed to `core` is this
   * repository's signature defect, and a `reportWindow` on a `SimulationConfig` is exactly the kind
   * of field that can be authored, carried and consulted by nothing.
   */
  it('reaches the recording’s own summary, on the building the rule moves', () => {
    const moved = movedBuildings()[0];
    expect(moved).toBeDefined();
    const summary = summaryOf({ ...baseState(), buildingId: moved ?? '', shiftLengthS: 3600 });
    expect(summary.reportWindow.id).toBe('full-run');
    // Full-run means the whole run, so the window cannot be shorter than the day it measured.
    expect(summary.reportWindow.endS - summary.reportWindow.startS).toBeGreaterThan(3000);
  });

  it('leaves a building the rule does not move exactly where it was', () => {
    const summary = summaryOf({ ...baseState(), buildingId: 'midtown-office' });
    expect(summary.reportWindow.id).not.toBe('full-run');
  });

  /**
   * The seeds on which Garden's template band holds **nobody** — the defect's own population.
   *
   * Found by sweeping 500 consecutive seeds from 20260804 through `shiftRunConfigOf` at the
   * building's contract length; `reportWindow.ts` pins that sweep (14 of 500 under the band, 0 of
   * 500 under full-run). They are listed rather than re-swept because re-running 500 simulations to
   * rediscover fourteen of them costs a minute per suite run and finds exactly this list.
   *
   * The premise is asserted below rather than assumed: each of these must still be an empty band,
   * or the case has moved and the assertion under it is testing nothing.
   */
  const EMPTY_BAND_SEEDS = [20260868n, 20260941n, 20261059n, 20261210n, 20261281n] as const;

  /**
   * The defect, reproduced and closed — `docs/20` defect 5.
   *
   * Garden Apartments day 1 is the first sheet a new player ever sees and it withheld **both** of
   * its headline figures under *"the reporting window held no arrivals"*, on a day of forty riders
   * who all turned up outside the band. Driven on the seeds that produce it, so the closure is a
   * run rather than a quotation of one — and driven on *both* windows in the same test, because
   * *the figure is published now* is only interesting beside *it was withheld before*.
   */
  it('publishes both headlines on the seeds whose template band held nobody', () => {
    for (const seed of EMPTY_BAND_SEEDS) {
      const state: ViewerState = {
        ...baseState(),
        buildingId: 'garden-apartments',
        shiftLengthS: 3600,
        seed,
      };
      const plan = shiftRunConfigOf(RESOURCES, state);

      // The band the sheet used to read, asked for explicitly so the comparison is a measurement
      // rather than a memory of one.
      const before = recordRun(
        { ...plan.config, reportWindow: undefined },
        { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds },
      ).recording;
      expect(before.summary.waitCount).toBe(0);
      expect(before.summary.serviceLevel.longestWaitS).toBeNull();
      // And it is an *empty window*, not an empty day: the riders turned up, outside it.
      expect(before.legs.length).toBeGreaterThan(20);

      const after = recordRun(plan.config, {
        recordDecisions: false,
        outOfServiceCarIds: plan.outOfServiceCarIds,
      }).recording.summary;
      expect(after.reportWindow.id).toBe('full-run');
      expect(after.awtIsValid).toBe(true);
      expect(after.saturated).toBe(false);
      expect(after.serviceLevel.longestWaitS).not.toBeNull();
      expect(after.waitCount).toBeGreaterThan(20);
    }
  }, 120_000);
});
