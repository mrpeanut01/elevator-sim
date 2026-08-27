/**
 * The shift path's reporting window — `docs/20` defect 5.
 *
 * Every assertion here is derived from `MATRIX_CELLS` on both sides. A test that hard-coded
 * *"garden-apartments is full-run"* would pass on an implementation that hard-coded the same
 * string, which is the one implementation this module exists not to be: the rule reads a
 * measurement this project already published, and the point of the rule is that adding a matrix
 * cell moves it.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MATRIX_CELLS } from '@elevator-sim/experiments/browser';
import { describe, expect, it } from 'vitest';

import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';
import { shiftReportWindowFor } from './reportWindow.js';

const MATRIX_BUILDINGS = [...new Set(MATRIX_CELLS.map((cell) => cell.building))];

/* -------------------------------------------------------------------------- *
 * Who can move this window — derived from disk, GitHub issue #289
 * -------------------------------------------------------------------------- */

const VIZ_SRC = fileURLToPath(new URL('..', import.meta.url));

/** Every runtime `.ts` under `packages/viz/src`, as paths relative to it. Tests excluded. */
async function runtimeFiles(dir: string = VIZ_SRC): Promise<readonly string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await runtimeFiles(path)));
    else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test-helper.ts')
    )
      found.push(relative(VIZ_SRC, path).split('\\').join('/'));
  }
  return found.sort((a, b) => a.localeCompare(b));
}

/**
 * Comments removed, so a *mention* is never read as a call.
 *
 * Load-bearing rather than tidy: `everyday/tunerModel.ts`'s docstring quotes the very press this
 * scan looks for, and a scanner that counted prose would register the file that explains the defect
 * as a file that commits it. It is also the reason the registries below can carry long reasons
 * without seeding themselves.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

async function filesCalling(pattern: RegExp): Promise<readonly string[]> {
  const hits: string[] = [];
  for (const file of await runtimeFiles()) {
    const code = stripComments(await readFile(join(VIZ_SRC, file), 'utf8'));
    if (pattern.test(code)) hits.push(file);
  }
  return hits;
}

/**
 * Every non-test caller of {@link shiftReportWindowFor}, and **which id each asks it about**.
 *
 * The id is the interesting half. The function is total over strings and answers `undefined` for
 * anything the matrix has not measured, so a caller cannot fail loudly — it can only quietly ask
 * about the wrong building, which is what `dev/state.ts`'s own comment guards against by asking
 * about `authored.id` rather than about the resolved day's.
 */
const WINDOW_CALLERS: Readonly<Record<string, string>> = Object.freeze({
  'campaign/stageRun.ts':
    'the stage’s own `stage.building`, at both the plan and the judged-run call — a stage names a ' +
    'shipped building by construction, so the id is never a copy.',
  'dev/state.ts':
    '`shiftRunConfigOf`, asked of `authored.id` — the id before growth, commissioning and ' +
    'incidents, which edit a building without renaming it.',
  'scenario/measure.ts': '`scenario.buildingId`, the id the scenario declares.',
  'shift/reportWindow.ts':
    'declares it — in the registry rather than filtered out of the scan, because a declaration ' +
    'that vanished would take its three callers with it and the set would still match.',
});

/**
 * Every non-test file that can move `ViewerState.buildingId`, and what it does about the window.
 *
 * ## Why this second registry exists, and why the issue's criterion was raised to reach it
 *
 * Issue #289 asked that *`shiftReportWindowFor`'s caller set be derived rather than hand-listed, so
 * a fifth producer cannot arrive unregistered*. Derived, that set is the three files above — and
 * **it would not have caught the defect the issue reports**, because `everyday/tunerScreen.ts` was
 * never a caller. It was a *bypasser*: it replaced the id the window is keyed on, with a copy of the
 * same building under a fresh name, and every caller above then did its job perfectly on the wrong
 * question.
 *
 * So the derived set that matters is this one — everything that can move that id. `withBuilding` is
 * the one function that writes it on the shift path (`stateRunningSaved` and the host's
 * `applyBuildingSpec` are its two wrappers), which is what makes the question askable at all.
 * A sixth screen that presses any of the three lands here and fails until it says which it is.
 *
 * The entries answer one question: **does this move the id to a building the matrix has not
 * measured, and did the player ask for that?** *Yes, and yes* is correct — a drawn tower has no
 * cell and `reportWindow.ts` refuses to invent one for it. *Yes, and no* is issue #289.
 */
const ID_MOVERS: Readonly<Record<string, string>> = Object.freeze({
  'dev/state.ts': 'declares `withBuilding` — the write itself.',
  'dev/buildingEditor.ts':
    '`stateRunningSaved`, and the Engineer editor’s *Save and run* that calls it. The reader ' +
    'asked for a new building by drawing one, so the matrix not knowing it is the honest state.',
  'dev/main.ts':
    'the boot re-selection, the campaign day’s contract building and the coach’s building ' +
    '`<select>` — all three move to a building the player named, never to a copy of one.',
  'dev/rightRail.ts': 'the rail’s building picker: the same named-selection case.',
  'menu/enterFreePlay.ts': 'free play’s own selection — again a building the player named.',
  'everyday/host.ts':
    'declares and implements `applyBuildingSpec`, the Everyday port onto `stateRunningSaved`.',
  'everyday/designerScreen.ts':
    '*Save as a new building* — the drawing board’s whole purpose, so the fresh id is what the ' +
    'player asked for.',
  'everyday/tunerScreen.ts':
    'issue #289. Guarded on `tunerModel.ts#tunePresses`: an untouched tuner presses nothing, so ' +
    'the id stays the authored one and the window stays the building’s own answer. A tuned one ' +
    'presses, and the fall-through is then correct.',
});

describe('who can move this window — the producer set, derived from disk', () => {
  it('has exactly the registered callers, and no further one arrives unregistered', async () => {
    const found = await filesCalling(/\bshiftReportWindowFor\s*\(/);
    expect(found).toEqual(Object.keys(WINDOW_CALLERS).sort((a, b) => a.localeCompare(b)));
  });

  it('has exactly the registered id movers, and no further one arrives unregistered', async () => {
    /*
     * The three wrappers together rather than `withBuilding` alone: a screen reaches the write
     * through whichever of them its layer offers, and a set derived from the innermost one would
     * report `everyday/host.ts` and stay silent about the screens pressing it — which is exactly
     * the blindness that let the tuner ship.
     */
    const found = await filesCalling(/\b(withBuilding|stateRunningSaved|applyBuildingSpec)\s*\(/);
    expect(found).toEqual(Object.keys(ID_MOVERS).sort((a, b) => a.localeCompare(b)));
  });

  it('gives every registered file a reason rather than a tick', () => {
    /*
     * A registry whose entries may be empty strings is a hand-written list wearing a derivation's
     * clothes: the next arrival would be waved through with `''` and the set would still match.
     */
    for (const [file, why] of [...Object.entries(WINDOW_CALLERS), ...Object.entries(ID_MOVERS)])
      expect(why.length, file).toBeGreaterThan(30);
  });

  it('finds the scan works at all — a mention in prose is not a call', async () => {
    /*
     * The instrument, checked against a file that is known to say the words and known not to make
     * the call. `everyday/tunerModel.ts` quotes `applyBuildingSpec(buildingWithTune(…))` in the
     * docstring that explains issue #289; it must be absent from the movers, and `tunerScreen.ts`
     * — which makes the call — must be present. A scan that could not tell them apart would report
     * a green over a set it had not actually derived.
     */
    const movers = await filesCalling(/\b(withBuilding|stateRunningSaved|applyBuildingSpec)\s*\(/);
    const prose = await readFile(join(VIZ_SRC, 'everyday/tunerModel.ts'), 'utf8');
    expect(prose).toContain('applyBuildingSpec(');
    expect(movers).not.toContain('everyday/tunerModel.ts');
    expect(movers).toContain('everyday/tunerScreen.ts');
  });
});

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
