/**
 * The suite model — cell → request mapping exact, CRN preserved per cell, the field-of-two
 * condition, and one cheap cell end to end (Everyday Mode slice 7, docs/18 § Slice 7).
 *
 * ## What is asserted where
 *
 * The **mapping** tests are exact and run over every shipped matrix cell, because the fixture
 * list is the point of the slice: the suite must run what the matrix measures, field for field,
 * and a drift here would be a suite reporting on populations nobody censused. The
 * **move-the-control** requirement is asserted the way the work-order words it — on the request
 * and on the trace, never on a window statistic: the two Midtown 900 s cells share a building and
 * a 1 % rate and differ only in `directionalSplit`, so if ticking the other one changes nothing,
 * the *only* place that can show up is the demand block and the trace key, and both are checked
 * (the second on a real run).
 *
 * The **smoke** test runs `garden-residential` — the cheap garden-apartments-based cell — at 2
 * replications, which is deliberately below every budget: it proves end-to-end result shape and
 * simultaneously proves the under-budget refusal survives the suite (no row may name a winner at
 * n = 2, however its interval fell).
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { MATRIX_CELLS } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { fakeResult } from './fixtures.test-helper.js';
import { batchReport } from './report.js';
import { BatchError, runBatch } from './runBatch.js';
import {
  SuiteError,
  suiteCellViewOf,
  suitePlanOf,
  suiteSummaryOf,
  type SuiteRequest,
} from './suite.js';
import type { BatchResources, BatchRequest } from './types.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';

const FIELD = [
  { armId: 'baseline', dispatcherProfileId: 'collective' },
  { armId: 'candidate', dispatcherProfileId: 'eta' },
] as const;

const ALL_CELLS: SuiteRequest = {
  cellIds: MATRIX_CELLS.map((cell) => cell.id),
  seed: '20260729',
  replications: 50,
  field: FIELD,
};

describe('cell → request mapping, exact over every shipped cell', () => {
  const plans = suitePlanOf(ALL_CELLS);

  it('produces one request per ticked cell, in tick order', () => {
    expect(plans.map((plan) => plan.cell.id)).toEqual(MATRIX_CELLS.map((cell) => cell.id));
  });

  it('maps every field the cell declares, and invents none', () => {
    for (const plan of plans) {
      const { cell, request } = plan;
      expect(request.buildingId).toBe(cell.building);
      expect(request.durationS).toBe(cell.traffic.durationS);
      expect(request.replications).toBe(50);
      expect(request.seed).toBe('20260729');
      // The whole demand block, by reference — the same object the matrix runs, not a copy that
      // could drift field by field.
      expect(request.demand).toBe(cell.traffic.demand);
      expect(request.reportWindow).toBe(cell.traffic.reportWindow);
      // The panel's two demand fields are absent because the block is the one source; `runBatch`
      // refuses the combination, so this is the shape that keeps the refusal unreachable.
      expect(request.arrivalRatePctPop5min).toBeNull();
      expect(request.demandLevel).toBeUndefined();
    }
  });

  it('keeps the dispatcher on the arm and everything else on the request', () => {
    for (const plan of plans) {
      expect(plan.request.arms).toBe(FIELD);
      // Nothing arm-specific exists on the request, and nothing population-shaped on an arm:
      // the two arms differ in exactly (armId, dispatcherProfileId).
      const [a, b] = plan.request.arms;
      expect(Object.keys(a as object).sort()).toEqual(['armId', 'dispatcherProfileId']);
      expect(Object.keys(b as object).sort()).toEqual(['armId', 'dispatcherProfileId']);
    }
  });

  it('gives different cells different populations — compared on the request, all pairs', () => {
    const populations = plans.map((plan) =>
      JSON.stringify({
        building: plan.request.buildingId,
        durationS: plan.request.durationS,
        demand: plan.request.demand ?? null,
      }),
    );
    expect(new Set(populations).size).toBe(plans.length);
  });

  it('separates the two Midtown 900 s cells by directional split alone', () => {
    // The pair the move-the-control test is sharpest on: same building, same 1 % rate, same
    // horizon — only the split differs, so only the demand block can carry the difference.
    const up = plans.find((plan) => plan.cell.id === 'midtown-up-peak')?.request;
    const down = plans.find((plan) => plan.cell.id === 'midtown-down-peak')?.request;
    expect(up?.buildingId).toBe(down?.buildingId);
    expect(up?.durationS).toBe(down?.durationS);
    expect(up?.demand?.arrivalRatePctPop5min).toBe(down?.demand?.arrivalRatePctPop5min);
    expect(up?.demand?.directionalSplit).toEqual({ incoming: 1, outgoing: 0, interfloor: 0 });
    expect(down?.demand?.directionalSplit).toEqual({ incoming: 0, outgoing: 1, interfloor: 0 });
  });

  it('finds no shipped cell that trips the shape refusals — which is why they need injection', () => {
    for (const cell of MATRIX_CELLS) {
      expect(cell.traffic.demandTemplate).toBeUndefined();
      expect(cell.traffic.durationS).toBeDefined();
    }
  });
});

describe('the plan refuses what it cannot run', () => {
  it('refuses an empty tick list', () => {
    expect(() => suitePlanOf({ ...ALL_CELLS, cellIds: [] })).toThrow(SuiteError);
    expect(() => suitePlanOf({ ...ALL_CELLS, cellIds: [] })).toThrow(/nothing to run/);
  });

  it('refuses a duplicate tick', () => {
    expect(() =>
      suitePlanOf({ ...ALL_CELLS, cellIds: ['midtown-up-peak', 'midtown-up-peak'] }),
    ).toThrow(/ticked twice/);
  });

  it('refuses a field that is not two arms at run time', () => {
    const threeArms = {
      ...ALL_CELLS,
      field: [...FIELD, { armId: 'third', dispatcherProfileId: 'nearest-car' }],
    } as unknown as SuiteRequest;
    expect(() => suitePlanOf(threeArms)).toThrow(/exactly two dispatchers/);
  });

  it('refuses an unknown cell id by name, with the known ids listed', () => {
    expect(() => suitePlanOf({ ...ALL_CELLS, cellIds: ['no-such-cell'] })).toThrow(
      /No matrix cell "no-such-cell"/,
    );
  });

  it('refuses, by name, a cell whose traffic spec a request cannot carry', () => {
    const template = { ...MATRIX_CELLS[0]!, traffic: { ...MATRIX_CELLS[0]!.traffic, demandTemplate: 'office-day' } };
    expect(() =>
      suitePlanOf({ ...ALL_CELLS, cellIds: [template.id] }, () => template),
    ).toThrow(/demand template "office-day"/);

    const { durationS: _dropped, ...restTraffic } = MATRIX_CELLS[0]!.traffic;
    const horizonless = { ...MATRIX_CELLS[0]!, traffic: restTraffic };
    expect(() =>
      suitePlanOf({ ...ALL_CELLS, cellIds: [horizonless.id] }, () => horizonless),
    ).toThrow(/no horizon of its own/);
  });
});

describe('the view model consumes the report and adds no gate of its own', () => {
  it('marks best-in-cell from `favours` alone, on resolved rows only', () => {
    // delta 3 with a small spread at n = 60: the wait rows resolve, the energy rows stay `shown`.
    const view = suiteCellViewOf(
      { id: 'fixture-cell', label: 'Fixture Cell' },
      fakeResult({ replications: 60, delta: 3, spread: 0.5 }),
    );
    expect(view.verdictShown).toBe(true);
    expect(view.verdictRefusal).toBeNull();
    expect(view.answer).not.toBeNull();
    expect(view.rows.length).toBeGreaterThan(0);
    for (const row of view.rows) {
      if (row.verdict === 'resolved') {
        // The fixtures' shipped display names, so a regression to slugs is visible.
        expect(['Conventional collective', 'Minimum estimated wait']).toContain(row.bestArmName);
      } else {
        expect(row.bestArmName, `${row.metric} (${row.verdict})`).toBeNull();
      }
      // The six-verdict vocabulary is consumed, never reworded.
      expect(['resolved', 'under-budget', 'unresolved', 'shown', 'suppressed', 'unmeasured']).toContain(
        row.verdict,
      );
    }
    // Energy is an axis: never a best arm, whatever the interval did.
    for (const metric of ['energyKJ', 'energyPerServedLegKJ']) {
      const row = view.rows.find((entry) => entry.metric === metric);
      expect(row?.verdict).toBe('shown');
      expect(row?.bestArmName).toBeNull();
    }
  });

  it('below the budget the winner stays unnamed, and the suite preserves that', () => {
    // n = 10 with a clear separation: the interval excludes zero and the row still refuses.
    const view = suiteCellViewOf(
      { id: 'fixture-cell', label: 'Fixture Cell' },
      fakeResult({ replications: 10, delta: 3, spread: 0.5 }),
    );
    const underBudget = view.rows.filter((row) => row.verdict === 'under-budget');
    expect(underBudget.length).toBeGreaterThan(0);
    for (const row of view.rows) expect(row.bestArmName, row.metric).toBeNull();
  });

  it('draws the pairwise verdict only when comparisons.length === 1', () => {
    const two = fakeResult({ replications: 10 });
    const three = { ...two, arms: [...two.arms, { ...two.arms[1]!, armId: 'ghost-arm' }] };
    const view = suiteCellViewOf({ id: 'fixture-cell', label: 'Fixture Cell' }, three);
    expect(view.verdictShown).toBe(false);
    expect(view.answer).toBeNull();
    expect(view.rows).toEqual([]);
    expect(view.verdictRefusal).toContain('a field of two');
    expect(view.verdictRefusal).toContain('2 comparisons rather than 1');
    // The arms still answer for themselves: refusing the verdict never hides the runs.
    expect(view.arms.length).toBe(3);
  });
});

describe('the index says nothing the prose does not — docs/20 defect 15', () => {
  /*
   * Two cells at n = 10 were 17 800 characters of prose with the per-cell verdicts findable only
   * by reading. The fix is an index *over* the prose, never a summary instead of it — § D299
   * binds this surface — so what these cases hold is exactly the index's contract: report.ts's
   * verdict words verbatim, an arm named only where `favours` named one, columns aligned across
   * cells, and a refused verdict carried as the refusal rather than as blanks that look like
   * data.
   */
  it('aligns every cell to one column set, in first-appearance order', () => {
    const resolved = suiteCellViewOf(
      { id: 'cell-a', label: 'Cell A' },
      fakeResult({ replications: 60, delta: 3, spread: 0.5 }),
    );
    const tied = suiteCellViewOf({ id: 'cell-b', label: 'Cell B' }, fakeResult({ delta: 0 }));
    const summary = suiteSummaryOf([resolved, tied]);
    expect(summary.metricLabels).toEqual(resolved.rows.map((row) => row.label));
    for (const line of summary.lines) {
      expect(line.marks.length).toBe(summary.metricLabels.length);
      expect(line.note).toBeNull();
    }
  });

  it('shows the report’s own verdict words and names an arm only where favours did', () => {
    const view = suiteCellViewOf(
      { id: 'cell-a', label: 'Cell A' },
      fakeResult({ replications: 60, delta: 3, spread: 0.5 }),
    );
    const summary = suiteSummaryOf([view]);
    const line = summary.lines[0]!;
    line.marks.forEach((mark, index) => {
      const row = view.rows[index]!;
      expect(mark).not.toBeNull();
      // Verbatim: the six-verdict vocabulary is consumed, never reworded into an index-ese.
      expect(mark?.verdict).toBe(row.verdict);
      expect(['resolved', 'under-budget', 'unresolved', 'shown', 'suppressed', 'unmeasured']).toContain(
        mark?.verdict,
      );
      // The one gate: the index's arm is the row's, which is `favours` — or nobody.
      expect(mark?.bestArmName).toBe(row.bestArmName);
      if (row.verdict !== 'resolved') expect(mark?.bestArmName).toBeNull();
    });
  });

  it('indexes an exact tie in the report’s words, with no tie vocabulary of its own', () => {
    // Identical arms — the state the audit called out: every delta exactly zero. The honest
    // wording ("an interval crossing zero is not the same as the two settings being identical")
    // lives in the prose rows and stays there; the index may only repeat the verdicts.
    const view = suiteCellViewOf({ id: 'cell-b', label: 'Cell B' }, fakeResult({ delta: 0 }));
    const summary = suiteSummaryOf([view]);
    for (const mark of summary.lines[0]!.marks) {
      expect(mark).not.toBeNull();
      expect(['resolved', 'under-budget', 'unresolved', 'shown', 'suppressed', 'unmeasured']).toContain(
        mark?.verdict,
      );
      expect(mark?.bestArmName).toBeNull();
    }
  });

  it('carries a refused verdict as the refusal, not as blanks', () => {
    const two = fakeResult({ replications: 10 });
    const three = { ...two, arms: [...two.arms, { ...two.arms[1]!, armId: 'ghost-arm' }] };
    const refused = suiteCellViewOf({ id: 'cell-c', label: 'Cell C' }, three);
    const resolved = suiteCellViewOf(
      { id: 'cell-a', label: 'Cell A' },
      fakeResult({ replications: 60, delta: 3, spread: 0.5 }),
    );
    const summary = suiteSummaryOf([resolved, refused]);
    const line = summary.lines[1]!;
    expect(line.note).toBe(refused.verdictRefusal);
    expect(line.note).toContain('a field of two');
    for (const mark of line.marks) expect(mark).toBeNull();
  });
});

describe('the demand clause cannot go stale under an authored block', () => {
  it('names the authored condition rather than the building profile', () => {
    const report = batchReport({ ...fakeResult(), demand: { arrivalRatePctPop5min: 2 } });
    expect(report.demandClause).toContain('authored demand condition');
    expect(report.demandClause).toContain('2 % of population');
    expect(report.demandClause).not.toBe("at the building's own traffic profile");
  });
});

/* -------------------------------------------------------------------------- *
 * Real runs — the trace-level half of move-the-control, and one cheap cell end to end.
 * -------------------------------------------------------------------------- */

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 120_000);

function resourcesFor(buildingId: string): BatchResources {
  return {
    building: requireBuilding(config, buildingId),
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
}

describe('ticking a different cell changes the simulated population — on the trace', () => {
  it('gives the two Midtown cells different trace keys and each cell one aligned key', () => {
    const plans = suitePlanOf({
      ...ALL_CELLS,
      cellIds: ['midtown-up-peak', 'midtown-down-peak'],
      replications: 1,
    });
    const results = plans.map((plan) =>
      runBatch(plan.request, resourcesFor(plan.request.buildingId)),
    );
    const [up, down] = results;
    // Same building, same seed, same rate — the split alone moved the population.
    expect(up?.buildingId).toBe(down?.buildingId);
    expect(up?.crn.traceKey).not.toBe(down?.crn.traceKey);
    // And within each cell the pairing is checked, not assumed: both arms saw the same people.
    for (const result of results) {
      expect(result.crn.aligned).toBe(true);
      expect(result.crn.checkedComparisons).toBe(1);
    }
  });

  it('refuses a request carrying both the panel fields and an authored block', () => {
    const plan = suitePlanOf({ ...ALL_CELLS, cellIds: ['midtown-up-peak'], replications: 1 })[0]!;
    const both: BatchRequest = { ...plan.request, arrivalRatePctPop5min: 2 };
    expect(() => runBatch(both, resourcesFor(both.buildingId))).toThrow(BatchError);
    expect(() => runBatch(both, resourcesFor(both.buildingId))).toThrow(/never both/);
  });
});

describe('one cheap cell, end to end (garden-residential at 2 replications)', () => {
  it('produces the full result shape and keeps the under-budget refusal', () => {
    const plan = suitePlanOf({
      ...ALL_CELLS,
      cellIds: ['garden-residential'],
      replications: 2,
    })[0]!;
    const result = runBatch(plan.request, resourcesFor(plan.request.buildingId));

    // Shape: two arms, two replications each, CRN checked and aligned, window carried.
    expect(result.arms.map((arm) => arm.replications.length)).toEqual([2, 2]);
    expect(result.crn.aligned).toBe(true);
    expect(result.crn.checkedComparisons).toBe(2);
    expect(result.reportWindow).toBe('full-run');
    expect(result.demand).toBe(plan.cell.traffic.demand);

    const view = suiteCellViewOf(plan.cell, result);
    expect(view.cellId).toBe('garden-residential');
    expect(view.label).toBe('Garden Apartments, residential 2 %, full run');
    expect(view.buildingName).toBe(result.buildingName);
    expect(view.verdictShown).toBe(true);
    expect(view.arms.length).toBe(2);
    expect(view.rows.length).toBeGreaterThan(0);
    // n = 2 is below every budget: whatever the intervals did, no row names a winner here.
    for (const row of view.rows) {
      expect(row.verdict).not.toBe('resolved');
      expect(row.bestArmName, row.metric).toBeNull();
    }
    // The provenance sentence names the authored condition, not the building's own profile.
    expect(view.report.demandClause).toContain('authored demand condition');
  });
});
