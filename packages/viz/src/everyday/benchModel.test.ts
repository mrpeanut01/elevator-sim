/**
 * The bench's model, held to the four things § 12 says it must never stop being.
 *
 * 1. **The field's bounds are enforced, and enforced in the right place.** Two at least is
 *    arithmetic and the floor is on the type; four at most is a screen's limit and lives here.
 * 2. **The budget control is live.** *"Below thirty the bench can rarely tell anything apart"* is
 *    an honest note only if the number it is about actually changes the answer — so the case below
 *    puts ten replications and two hundred through the report and requires the interval to be
 *    visibly narrower at two hundred. That is the standing requirement (*move the control and
 *    require the run to change*) pointed at the one control whose whole purpose is resolution.
 * 3. **A field of three draws no pairwise verdict.** Not by a rule this module authors: by
 *    `batchReport` producing two comparisons and `suiteCellViewOf` refusing on the count.
 * 4. **No verdict is reworded.** `report.ts`'s six survive into the index; *"Too close to call"*
 *    appears **beside** `unresolved`, never in place of it or of `under-budget`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { intervalPlotFor } from '../batch/intervalPlot.js';
import { batchReport, MIN_REPLICATION_BUDGET } from '../batch/report.js';
import { fakeArm, fakeReplication, fakeResult } from '../batch/fixtures.test-helper.js';
import { suiteCellViewOf, suiteSummaryOf, SuiteError } from '../batch/suite.js';
import type { BatchArmRequest, BatchReplication, BatchResult } from '../batch/types.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import {
  benchSeedOf,
  parseProofCases,
  proofCasesOf,
  type ProofCaseSet,
} from '../gauntlet/proofCases.js';

import {
  benchBudgetNoteOf,
  benchEntrantsOf,
  benchFieldOf,
  benchFieldRefusal,
  benchPlanOf,
  benchResultViewOf,
  benchTestsOf,
  benchTestsRefusal,
  benchTooCloseHeadingOf,
  benchVerdictNoteOf,
  benchWorkLineOf,
  BENCH_COPY,
  BENCH_FIELD_MAX,
  BENCH_REPLICATION_CHOICES,
  BENCH_STANDING_NOTES,
} from './benchModel.js';

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

const BUILDINGS = readdirSync(join(DATA_DIR, 'buildings'))
  .filter((name) => name.endsWith('.json'))
  .map((name) => read(join(DATA_DIR, 'buildings', name)) as { id: string; name: string });

/** The shipped forty, so this suite fails on the real list rather than on a fixture of it. */
const SET: ProofCaseSet = parseProofCases(read(join(DATA_DIR, 'proof-cases.json')), {
  buildingIds: new Set(BUILDINGS.map((building) => building.id)),
});

const nameOf = (towerId: string): string =>
  BUILDINGS.find((building) => building.id === towerId)?.name ?? towerId;

const FIELD: readonly [BatchArmRequest, BatchArmRequest] = [
  { armId: 'arm-0', dispatcherProfileId: 'collective' },
  { armId: 'arm-1', dispatcherProfileId: 'eta' },
];

const SHELF = [
  { id: 'collective', name: 'Conventional collective' },
  { id: 'eta', name: 'Minimum estimated wait' },
  { id: 'nearest-car', name: 'Nearest car' },
  { id: 'fairness-first', name: 'Fairness first' },
  { id: 'energy-aware', name: 'Energy aware' },
];

const CELL = { id: 'midtown-up-peak', label: 'Midtown Office, up-peak 1 %' };

describe('§12.1 — the field is two at least and four at most', () => {
  it('refuses under two and over four, in two different sentences', () => {
    expect(benchFieldRefusal([])).toMatch(/at least 2/);
    expect(benchFieldRefusal(['collective'])).toMatch(/nothing to be compared with/);
    expect(benchFieldRefusal(['a', 'b'])).toBeUndefined();
    expect(benchFieldRefusal(['a', 'b', 'c', 'd'])).toBeUndefined();
    expect(benchFieldRefusal(['a', 'b', 'c', 'd', 'e'])).toMatch(/At most 4/);
  });

  it('stops offering unpicked toggles at the ceiling, and never the picked ones', () => {
    const picked = SHELF.slice(0, BENCH_FIELD_MAX).map((entry) => entry.id);
    const entrants = benchEntrantsOf(SHELF, picked);
    for (const entrant of entrants) {
      // A picked entrant must stay pressable or a full field has no way back out.
      if (entrant.picked) expect(entrant.refusal).toBeUndefined();
      else expect(entrant.refusal).toMatch(/The field is full at 4/);
    }
    // Under the ceiling nothing is refused.
    expect(benchEntrantsOf(SHELF, ['collective']).every((e) => e.refusal === undefined)).toBe(true);
  });

  it('builds arms that carry the profile id and never show an arm id', () => {
    const field = benchFieldOf(['collective', 'eta', 'nearest-car']);
    expect(field?.map((arm) => arm.dispatcherProfileId)).toEqual([
      'collective',
      'eta',
      'nearest-car',
    ]);
    expect(field).toHaveLength(3);
    expect(benchFieldOf(['collective'])).toBeUndefined();
    expect(benchFieldOf([])).toBeUndefined();
  });
});

describe('§12.3 — the tests are the forty, and this reader derives every one of them', () => {
  const first = proofCasesOf(SET)[0];
  if (first === undefined) throw new Error('no proof cases');

  it('offers a test per proof case and ticks exactly what was asked for', () => {
    const tests = benchTestsOf(SET, [first.id], nameOf);
    expect(tests).toHaveLength(proofCasesOf(SET).length);
    expect(tests.filter((test) => test.ticked).map((test) => test.caseId)).toEqual([first.id]);
  });

  it('is the same list the ladder rates on, in the same order — one list, two readers', () => {
    expect(benchTestsOf(SET, [], nameOf).map((test) => test.caseId)).toEqual(
      proofCasesOf(SET).map((proofCase) => proofCase.id),
    );
  });

  it('names a test the way the ladder does — the tower’s name, then the crowd’s label', () => {
    /*
     * The point of the shared list is that a reader can carry a finding from one screen to the
     * other, and they cannot if the two spell a case differently. `caseNameOf` is the one source,
     * so this asserts the composition rather than the string.
     */
    const test = benchTestsOf(SET, [], nameOf)[0];
    expect(test?.towerName).toBe(nameOf(first.tower.id));
    expect(test?.label).toBe(`${nameOf(first.tower.id)} · ${first.crowd.label}`);
  });

  it('groups tower-major, so eight groups of five arrive rather than forty flat rows', () => {
    const towers = benchTestsOf(SET, [], nameOf).map((test) => test.towerName);
    const runs = towers.filter((name, index) => name !== towers[index - 1]);
    expect(runs).toHaveLength(SET.towers.length);
    expect(new Set(runs).size).toBe(SET.towers.length);
  });

  it('refuses an empty tick list in §12.1’s own words', () => {
    expect(benchTestsRefusal([], 40)).toBe('No tests ticked. Pick at least one.');
    expect(benchTestsRefusal([first.id], 40)).toBeUndefined();
  });

  it('says the forty are still arriving rather than blaming the reader for an empty list', () => {
    /*
     * The list is fetched, so there is a beat where it is empty. Telling a reader to *"pick at
     * least one"* from nothing is a small lie about what is on the screen — § 12.2's rule that
     * every unavailable state is labelled, applied to the one this screen has.
     */
    expect(benchTestsRefusal([], 0)).toBe(BENCH_COPY.testsLoading);
    expect(benchTestsRefusal([], 0)).not.toBe(BENCH_COPY.noTests);
  });
});

describe('§1 — the bench runs the ladder’s cases and not the ladder’s crowds', () => {
  const cases = proofCasesOf(SET);
  const first = cases[0];
  if (first === undefined) throw new Error('no proof cases');

  it('plans one request per ticked case, carrying the case’s building, horizon and shape', () => {
    const plans = benchPlanOf(SET, { caseIds: [first.id], replications: 50, field: FIELD }, nameOf);
    expect(plans).toHaveLength(1);
    const plan = plans[0];
    expect(plan?.test.id).toBe(first.id);
    expect(plan?.request.buildingId).toBe(first.tower.id);
    expect(plan?.request.durationS).toBe(first.crowd.durationS);
    expect(plan?.request.demand?.directionalSplit).toEqual(first.crowd.demand.directionalSplit);
    expect(plan?.request.replications).toBe(50);
    expect(plan?.request.arms).toEqual(FIELD);
  });

  it('seeds every case by §1’s BENCH rule, never by the gauntlet’s', () => {
    /*
     * CLAUDE.md § Tuning discipline. A bench sharing the gauntlet's seeds would let a player tune
     * against the exact runs they are about to be rated on. Asserted over the whole forty, and as
     * set disjointness rather than pairwise inequality — a bench seed matching *some other* case's
     * gauntlet seed is the same defect one row over.
     */
    const plans = benchPlanOf(
      SET,
      { caseIds: cases.map((entry) => entry.id), replications: 50, field: FIELD },
      nameOf,
    );
    const benchSeeds = plans.map((plan) => plan.request.seed);
    expect(benchSeeds).toEqual(cases.map((entry) => benchSeedOf(entry)));
    const gauntletSeeds = new Set(cases.map((entry) => entry.seed));
    expect(benchSeeds.filter((seed) => gauntletSeeds.has(seed))).toEqual([]);
    expect(new Set(benchSeeds).size).toBe(cases.length);
  });

  it('ticking a different case changes the population the run is over', () => {
    /*
     * The standing requirement — move the control and require the run to change — on the tick.
     * Two cases on the same tower differ only in their crowd, which is the pair a tick that wrote
     * nothing but a label would pass.
     */
    const sameTower = cases.filter((entry) => entry.tower.id === first.tower.id);
    const second = sameTower[1];
    if (second === undefined) throw new Error('a tower with one crowd');
    const [a] = benchPlanOf(SET, { caseIds: [first.id], replications: 50, field: FIELD }, nameOf);
    const [b] = benchPlanOf(SET, { caseIds: [second.id], replications: 50, field: FIELD }, nameOf);
    expect(a?.request.buildingId).toBe(b?.request.buildingId);
    expect(a?.request.demand).not.toEqual(b?.request.demand);
    expect(a?.request.seed).not.toBe(b?.request.seed);
  });

  it('never sets the level twice — `runBatch` refuses the combination by name', () => {
    const [plan] = benchPlanOf(SET, { caseIds: [first.id], replications: 50, field: FIELD }, nameOf);
    expect(plan?.request.arrivalRatePctPop5min).toBeNull();
    expect(plan?.request.demandLevel).toBeUndefined();
    expect(plan?.request.demand?.arrivalRatePctPop5min).toBe(first.tower.arrivalRatePctPop5min);
  });

  it('refuses a plan that cannot be a suite, rather than running a smaller one', () => {
    const at = (caseIds: readonly string[], field = FIELD): (() => unknown) => () =>
      benchPlanOf(SET, { caseIds, replications: 50, field }, nameOf);
    expect(at([])).toThrow(SuiteError);
    expect(at([first.id, first.id])).toThrow(/ticked twice/);
    expect(at([first.id], [FIELD[0]] as unknown as typeof FIELD)).toThrow(/at least two/);
    expect(at(['no-such-tower/no-such-crowd'])).toThrow(/no proof case/);
  });
});

describe('§12.1 — the work line counts the field as well as the tests', () => {
  it('reproduces the guide’s own example', () => {
    expect(benchWorkLineOf(3, 50, 3)).toBe('3 tests · 450 days of simulation');
  });

  it('moves with every one of its three inputs, and says “test” in the singular', () => {
    expect(benchWorkLineOf(1, 10, 2)).toBe('1 test · 20 days of simulation');
    expect(benchWorkLineOf(1, 10, 4)).toBe('1 test · 40 days of simulation');
    expect(benchWorkLineOf(2, 200, 2)).toBe('2 tests · 800 days of simulation');
  });
});

describe('§12.1 — the budget note, in two sentences that are not the same claim', () => {
  it('offers the four choices, with the published floor and ceiling read from report.ts', () => {
    expect(BENCH_REPLICATION_CHOICES).toEqual([10, 30, 50, 200]);
    expect(BENCH_REPLICATION_CHOICES).toContain(MIN_REPLICATION_BUDGET);
  });

  it('says the instrument is blind below thirty and that no winner is named below fifty', () => {
    expect(benchBudgetNoteOf(10)).toBe(BENCH_COPY.repsBelowThirty);
    expect(benchBudgetNoteOf(10)).toMatch(/rarely tell anything apart/);
    expect(benchBudgetNoteOf(30)).toBe(BENCH_COPY.repsBelowBudget);
    expect(benchBudgetNoteOf(30)).toMatch(/no row here will name a winner/);
    expect(benchBudgetNoteOf(50)).toBeUndefined();
    expect(benchBudgetNoteOf(200)).toBeUndefined();
  });

  /**
   * The control is live, measured on what it is *for*.
   *
   * A note about resolution that sat over a number changing nothing would be § D219's defect with
   * a friendlier face, so this runs the same paired difference through `batchReport` at ten
   * replications and at two hundred and requires the drawn interval to be materially narrower —
   * not merely different. The fixture's `spread` is what gives the paired differences a variance
   * to shrink; at `spread: 0` every difference is exactly `delta` and no width could move.
   */
  it('narrows the drawn interval when the replication count rises — 10 against 200', () => {
    const widthAt = (replications: number): number => {
      const report = batchReport(fakeResult({ replications, delta: 1.4, spread: 0.9 }));
      const row = report.comparisons[0]?.rows.find((entry) => entry.metric === 'awtS');
      const plot = row === undefined ? null : intervalPlotFor(row);
      if (plot === null) throw new Error('the fixture drew no interval to measure');
      return plot.upper - plot.lower;
    };

    const ten = widthAt(10);
    const twoHundred = widthAt(200);
    expect(twoHundred).toBeLessThan(ten);
    // Visibly, not marginally: a reader has to be able to see that more days bought resolution.
    expect(twoHundred).toBeLessThan(ten / 2);
  });
});

describe('§12.2 — the pairwise verdict draws only for a field of two', () => {
  it('draws it at two, and says so at the top of the screen', () => {
    const view = suiteCellViewOf(CELL, fakeResult({ replications: 50, delta: 1.2, spread: 0.4 }));
    expect(view.verdictShown).toBe(true);
    expect(view.verdictRefusal).toBeNull();
    expect(view.rows.length).toBeGreaterThan(0);
    expect(benchVerdictNoteOf(2)).toMatch(/pairwise answer/);
  });

  it('draws none at three, refuses in the cell’s own words, and says so at the top', () => {
    const three = threeArmResult();
    expect(batchReport(three).comparisons).toHaveLength(2);

    const view = suiteCellViewOf(CELL, three);
    expect(view.verdictShown).toBe(false);
    expect(view.rows).toHaveLength(0);
    expect(view.answer).toBeNull();
    expect(view.verdictRefusal).toMatch(/only for a field of two/);
    expect(view.arms).toHaveLength(3);

    const note = benchVerdictNoteOf(3);
    expect(note).toMatch(/no single pairwise answer/);
    expect(note).not.toMatch(/pairwise answer below each test/);
  });

  it('carries the three-arm refusal into the index as the line’s note, with no marks', () => {
    const view = suiteCellViewOf(CELL, threeArmResult());
    const summary = suiteSummaryOf([view]);
    expect(summary.metricLabels).toHaveLength(0);
    expect(summary.lines[0]?.marks).toHaveLength(0);
    expect(summary.lines[0]?.note).toBe(view.verdictRefusal);
  });
});

describe('the result view is strictly weaker than the report it reads', () => {
  it('keeps report.ts’s own verdict words in the index', () => {
    const view = benchResultViewOf([
      suiteCellViewOf(CELL, fakeResult({ replications: 10, delta: 1.2, spread: 0.4 })),
    ]);
    const marks = view.summary.lines[0]?.marks.filter((mark) => mark !== null) ?? [];
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(['resolved', 'under-budget', 'unresolved', 'shown', 'suppressed', 'unmeasured']).toContain(
        mark?.verdict,
      );
      // A friendly phrase may sit beside a verdict; it may never replace one.
      expect(mark?.text).not.toBe(BENCH_COPY.tooCloseHeading);
    }
  });

  it('lists a cell as too-close only where a drawn row is `unresolved`', () => {
    /* Two identical arms: every paired difference is exactly zero, so no row is ordered. */
    const tie = benchResultViewOf([suiteCellViewOf(CELL, fakeResult({ replications: 50 }))]);
    expect(tie.tooClose.map((mark) => mark.cellId)).toEqual([CELL.id]);

    /* A three-arm cell draws no verdict block at all, so it can never be listed. */
    const many = benchResultViewOf([suiteCellViewOf(CELL, threeArmResult())]);
    expect(many.tooClose).toEqual([]);
  });

  /**
   * **The two rollups on one cell name the subsets they count** — GitHub issue #301, § D389.
   *
   * The card draws `Too close to call` above the rows and `batch/report.ts#answerFor` below them,
   * and their predicates are `≥ 1 unresolved` and `≥ 1 resolved` — which are not exclusive. The
   * fixture below is the state that makes both fire: one measure separates cleanly and the rest are
   * a dead tie, so the card opens by calling the comparison too close and closes by saying it
   * separated.
   *
   * The case is written against the **basis** rather than against the two verdicts, because the
   * fix that is wanted is not *suppress one of them* — each is true of its own rows — but *say
   * which rows*. So it fails when either headline renders with no denominator, and it pins the
   * denominator to the number of rows the card actually draws between them, which is the figure a
   * reader can check by counting.
   */
  it('names the basis of both rollups when a cell has resolved and unresolved rows', () => {
    const cell = suiteCellViewOf(CELL, mixedResult());
    const verdicts = cell.rows.map((row) => row.verdict);

    // Non-vacuity: without both kinds of row present the two rollups cannot collide, and a green
    // result here would mean the fixture had stopped producing the state the issue is about.
    expect(verdicts, 'the fixture drew no separated row').toContain('resolved');
    expect(verdicts, 'the fixture drew no unresolved row').toContain('unresolved');

    const unresolved = verdicts.filter((verdict) => verdict === 'unresolved').length;
    const view = benchResultViewOf([cell]);
    const heading = view.tooClose.find((mark) => mark.cellId === CELL.id)?.heading;

    expect(heading, 'the cell has an unresolved row and drew no too-close heading').toBeDefined();
    expect(
      heading,
      'the heading is `Too close to call` with nothing after it, over rows a second rollup is ' +
        'simultaneously calling separated. That is issue #301: two answers to one question, ' +
        'neither naming the subset it counts.',
    ).not.toBe(BENCH_COPY.tooCloseHeading);
    expect(heading).toBe(benchTooCloseHeadingOf(unresolved, cell.rows.length));
    expect(heading).toContain(`${String(unresolved)} of the ${String(cell.rows.length)}`);
    // The guide's own phrase survives verbatim at the front of it — #211 owns this screen's copy.
    expect(heading?.startsWith(BENCH_COPY.tooCloseHeading)).toBe(true);

    /*
     * The other half of the pair, asserted here rather than assumed: `answerFor`'s separated branch
     * names its own count *and* lists the measures it means, so it is left alone. If that ever
     * stops being true the two rollups are back to being one unqualified claim each, and this line
     * is where it shows.
     */
    expect(cell.answer, 'the cell drew no answer to pair the heading with').not.toBeNull();
    expect(cell.answer).toMatch(/Separated on 1 of the measures compared — average wait/u);
  });

  it('always carries §12’s three standing notes and the never-a-subtraction rule', () => {
    const view = benchResultViewOf([]);
    expect(view.standingNotes).toEqual(BENCH_STANDING_NOTES);
    expect(view.standingNotes).toHaveLength(3);
    expect(view.neverASubtraction).toMatch(/is not a comparison/);
    expect(view.cells).toHaveLength(0);
  });
});

/**
 * A two-arm batch where **one** measure separates and the rest are a dead tie — issue #301.
 *
 * `fakeResult`'s `delta` moves every metric at once, so it can produce a cell that is all
 * `resolved` or all `unresolved` and never one that is both. This offsets `awtS` alone: the
 * candidate is 1.4 s ahead on average wait on every replication, and identical to the baseline on
 * everything else, so the paired interval excludes zero on exactly one row and contains it on the
 * rest. Measured on this fixture: **1 resolved, 5 unresolved, 2 shown**, which is the card the
 * issue is about.
 *
 * The per-replication wobble is the same fixed, seedless one `fakeResult` uses, applied to both
 * arms identically so the paired differences stay exactly `-1.4` and `0` — a difference with no
 * variance is what makes the `resolved` row arithmetic rather than luck.
 */
function mixedResult(n = 50): BatchResult {
  const build = (awtOffset: number): BatchReplication[] =>
    Array.from({ length: n }, (_, index) => {
      const wobble = ((index * 37) % 11) / 100;
      return fakeReplication(index, 10 + wobble, {
        metrics: { awtS: 10 + awtOffset + wobble },
      });
    });
  return {
    buildingId: 'fixture-building',
    buildingName: 'Fixture Building',
    seed: '20260729',
    durationS: 900,
    arrivalRatePctPop5min: null,
    arms: [
      fakeArm('baseline', 'collective', build(0), 'Conventional collective'),
      fakeArm('candidate', 'eta', build(-1.4), 'Minimum estimated wait'),
    ],
    crn: { traceKey: 'k', checkedComparisons: n, mismatches: [], aligned: true },
    elapsedMs: 1234,
  };
}

/** A three-arm batch, built from the same fixtures the two-arm one uses. */
function threeArmResult(): BatchResult {
  const two = fakeResult({ replications: 50, delta: 1.2, spread: 0.4 });
  const third = Array.from({ length: 50 }, (_, index) =>
    fakeReplication(index, 12 + ((index * 13) % 9) / 10),
  );
  return { ...two, arms: [...two.arms, fakeArm('third', 'nearest-car', third)] };
}
