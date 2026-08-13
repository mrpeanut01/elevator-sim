/**
 * The suite — **one comparison over multiple fixed cells**, as a pure model over the existing
 * bench machinery. Everyday Mode slice 7 (docs/18 § Slice 7, correcting BUILD_PLAN §20.8).
 *
 * ## What this module is, and the two things it refuses to be
 *
 * §20.8 as vendored is inverted for this tree: there is exactly one bench (`dev/batchPanel.ts`),
 * it *is* the pairwise one, and the thing that does not exist is the multi-cell sweep. So this
 * module is only the sweep's shape — a field of **two** dispatcher arms, a set of ticked cells,
 * one `BatchRequest` per cell — and everything it says about a result is `batchReport`'s, read,
 * never recomputed. Two refusals define it:
 *
 * - **It does not reimplement the bench.** Requests run through `runBatch` (the shipped worker
 *   path), reports come from `batchReport`, and the six-verdict vocabulary (`report.ts` —
 *   `resolved`, `under-budget`, `unresolved`, `shown`, `suppressed`, `unmeasured`) is consumed as
 *   the strings it ships. *"Too close to call"* would collapse distinctions those six encode —
 *   an interval containing zero is not the same claim as a suppressed mean — so no wording here
 *   renames a verdict.
 * - **It does not retype the fixture list.** The cells are `MATRIX_CELLS`, imported through
 *   `@elevator-sim/experiments/browser` (the module split that made that import legal is
 *   `benchmark/matrixCells.ts`, whose docstring carries the decision; a decision number is owed).
 *   docs/18's warning is specific: the matrix's eight are building × traffic-pattern cells over
 *   five buildings, `data/buildings/` separately holds eight buildings, and a hand-written list
 *   would disagree with the one the project measures.
 *
 * ## The mapping, and why the request had to grow
 *
 * A cell is more than a building and a rate: `midtown-up-peak` and `midtown-down-peak` share one
 * building and one 1 % rate and differ **only** in `directionalSplit`. `BatchRequest.demand` and
 * `.reportWindow` exist for exactly this mapping (see their docstrings in `types.ts`), so ticking
 * a different cell changes the passenger population — checked on the trace by `runBatch`'s own
 * CRN audit, not on a window statistic. Within a cell, CRN is `runBatch`'s: one seed per
 * replication index, shared by both arms. Across cells the same master seed deliberately recurs —
 * a trace is a function of (building, demand, horizon, seed), the first three differ per cell, so
 * the populations differ by construction and `suite.test.ts` asserts it on the requests.
 *
 * ## What the view model may say
 *
 * Per cell, per arm: the arm's own account (`BatchArmSummary.sentence` — the quotable counts and
 * refusals `batchReport` already computes). Per cell, per metric: the comparison row verbatim,
 * with **best-in-cell marked only by consuming `BatchComparisonRow.favours`** — the one field the
 * project permits to name an arm ahead, emitted only on `resolved` at or above the replication
 * budget. Nothing here re-derives a winner from an interval, and below 50 replications the rows
 * come back `under-budget` with the winner deliberately unnamed, which this module preserves by
 * having no opinion of its own. The pairwise verdict block is rendered **only when
 * `comparisons.length === 1`** — a result with any other arm count gets a refusal sentence in its
 * place, because "the" pairwise verdict of three arms is not a thing.
 */

import { matrixCell, type MatrixCell } from '@elevator-sim/experiments/browser';

import { batchReport, type BatchReport, type BatchVerdict } from './report.js';
import type { BatchArmRequest, BatchMetric, BatchRequest, BatchResult } from './types.js';

/** Raised when a suite cannot be planned at all. Never raised for a result a reader should see. */
export class SuiteError extends Error {
  override readonly name = 'SuiteError';
}

/**
 * Exactly two arms, as a tuple rather than an array — the field-of-two condition held by the
 * type. The dispatcher stays on the arm and everything else on the request, which is
 * `batch/types.ts`'s misalignment-unexpressible split, inherited rather than restated.
 */
export type SuiteField = readonly [BatchArmRequest, BatchArmRequest];

/** What to sweep: which cells, at what budget, with which two dispatchers. */
export interface SuiteRequest {
  /** Ids of ticked {@link MATRIX_CELLS} entries. Resolved by `matrixCell`, which throws by name. */
  readonly cellIds: readonly string[];
  /** Master seed as a decimal string — one per suite; see the module docstring on reuse. */
  readonly seed: string;
  /**
   * Replications per cell. One number for the whole suite rather than each cell's own derived
   * budget, because this is the player's control and `batchReport` already says what leaving the
   * 50–200 band costs: below `MIN_REPLICATION_BUDGET` every separating row reads `under-budget`
   * and names no winner. The suite keeps that by consuming the report, not by re-gating.
   */
  readonly replications: number;
  readonly field: SuiteField;
}

/** One ticked cell, resolved, with the request that runs it. */
export interface SuiteCellPlan {
  readonly cell: MatrixCell;
  readonly request: BatchRequest;
}

/**
 * One `BatchRequest` per ticked cell, in `MATRIX_CELLS` order of the ids given.
 *
 * `lookup` defaults to the shipped `matrixCell` and exists for one reason: the two cell-shape
 * refusals below guard against a *future* matrix cell this request type cannot carry, so no
 * shipped cell can reach them — every one of the eight is clean, which `suite.test.ts` asserts —
 * and without an injectable lookup those refusals would be sentences no test had ever seen fire.
 *
 * @throws SuiteError on a plan that cannot run: no cells ticked, a duplicate tick, a field that
 *   is not two arms at run time (the type already forbids it at compile time; a deserialised
 *   state can still get here), or a cell whose traffic spec carries something `BatchRequest`
 *   cannot — refused by name rather than silently dropped, because a suite that ran a cell
 *   *minus* its demand template would report on a population the matrix never measured.
 */
export function suitePlanOf(
  request: SuiteRequest,
  lookup: (id: string) => MatrixCell = matrixCell,
): readonly SuiteCellPlan[] {
  if (request.cellIds.length === 0) {
    throw new SuiteError(
      'no cells are ticked: a suite is one comparison over at least one matrix cell, so there is nothing to run.',
    );
  }
  if (new Set(request.cellIds).size !== request.cellIds.length) {
    throw new SuiteError('a cell is ticked twice; a suite runs each ticked cell once.');
  }
  if (request.field.length !== 2) {
    throw new SuiteError(
      `a suite compares a field of exactly two dispatchers; this one carries ${String(request.field.length)}.`,
    );
  }
  return request.cellIds.map((cellId) => {
    const cell = lookup(cellId);
    return { cell, request: cellRequestOf(cell, request) };
  });
}

/**
 * The mapping itself, private so there is one route into a plan and the guards above always run.
 *
 * Field for field: the cell's building, the cell's own horizon, the cell's whole demand block and
 * summary window; the suite's seed, replications and arms. `arrivalRatePctPop5min` is `null` and
 * `demandLevel` absent **because** the demand block is the one source — `runBatch` refuses the
 * combination, and this function is written so it cannot produce one.
 */
function cellRequestOf(cell: MatrixCell, suite: SuiteRequest): BatchRequest {
  if (cell.traffic.demandTemplate !== undefined) {
    throw new SuiteError(
      `cell "${cell.id}" names demand template "${cell.traffic.demandTemplate}", which a batch request cannot carry yet; running the cell without it would measure a population the matrix does not.`,
    );
  }
  if (cell.traffic.durationS === undefined) {
    throw new SuiteError(
      `cell "${cell.id}" declares no horizon of its own, and a batch request needs one; inventing a duration here would be a number nobody measured.`,
    );
  }
  return {
    buildingId: cell.building,
    seed: suite.seed,
    durationS: cell.traffic.durationS,
    replications: suite.replications,
    arms: suite.field,
    arrivalRatePctPop5min: null,
    ...(cell.traffic.demand === undefined ? {} : { demand: cell.traffic.demand }),
    ...(cell.traffic.reportWindow === undefined ? {} : { reportWindow: cell.traffic.reportWindow }),
  };
}

/** One arm's own account of one cell — the figures `batchReport` already computes, re-shown. */
export interface SuiteArmFigure {
  readonly armId: string;
  readonly profileName: string;
  /** `BatchArmSummary.sentence`, verbatim: quotable counts, saturations, refusals with reasons. */
  readonly sentence: string;
}

/** One metric of the cell's single comparison, with the best arm marked — never re-derived. */
export interface SuiteRowMark {
  readonly metric: BatchMetric;
  readonly label: string;
  /** `report.ts`'s own verdict string. The six encode distinctions no rewording may collapse. */
  readonly verdict: BatchVerdict;
  /** The row's sentence, verbatim — it already carries its `n` and names any arm it may. */
  readonly sentence: string;
  readonly note: string;
  /**
   * The display name of the arm this row came out ahead on, read off
   * `BatchComparisonRow.favours` — `null` wherever that field is, which is every verdict but
   * `resolved` and every energy axis however its interval fell. This is consumption of the one
   * gate, not a second one.
   */
  readonly bestArmName: string | null;
}

/** One cell of the suite's matrix view. */
export interface SuiteCellView {
  readonly cellId: string;
  /** The cell's own label — `Midtown Office, up-peak 1 %` — which names the pattern the id does. */
  readonly label: string;
  readonly buildingName: string;
  readonly replications: number;
  /** The whole per-cell report, for a mount that wants the provenance rows and the glossary. */
  readonly report: BatchReport;
  /** `comparisons.length === 1` — the only condition under which {@link rows} is non-empty. */
  readonly verdictShown: boolean;
  /** The single comparison's `summary.answer`, or `null` when no verdict block is drawn. */
  readonly answer: string | null;
  /** Why no verdict block is drawn, when it is not; `null` when {@link verdictShown}. */
  readonly verdictRefusal: string | null;
  readonly arms: readonly SuiteArmFigure[];
  readonly rows: readonly SuiteRowMark[];
}

/**
 * Fold one cell's finished batch into the suite's view of it.
 *
 * Pure, and strictly weaker than the report it reads: every sentence is the report's own, the
 * best-in-cell mark is `favours` looked up in the comparison's display names, and the one thing
 * authored here is the refusal for a result whose arm count admits no single pairwise verdict.
 */
export function suiteCellViewOf(
  cell: { readonly id: string; readonly label: string },
  result: BatchResult,
): SuiteCellView {
  const report = batchReport(result);
  const single = report.comparisons.length === 1 ? report.comparisons[0] : undefined;
  const arms: SuiteArmFigure[] = report.arms.map((arm) => ({
    armId: arm.armId,
    profileName: arm.dispatcherProfileName,
    sentence: arm.sentence,
  }));
  if (single === undefined) {
    return {
      cellId: cell.id,
      label: cell.label,
      buildingName: report.buildingName,
      replications: report.replications,
      report,
      verdictShown: false,
      answer: null,
      verdictRefusal:
        `this suite draws a pairwise verdict only for a field of two: this cell's batch produced ` +
        `${String(report.comparisons.length)} comparisons rather than 1, so no verdict is drawn ` +
        'here and each arm answers only for itself above.',
      arms,
      rows: [],
    };
  }
  const rows: SuiteRowMark[] = single.rows.map((row) => ({
    metric: row.metric,
    label: row.label,
    verdict: row.verdict,
    sentence: row.sentence,
    note: row.note,
    bestArmName:
      row.favours === null
        ? null
        : row.favours === 'candidate'
          ? single.candidateProfileName
          : single.baselineProfileName,
  }));
  return {
    cellId: cell.id,
    label: cell.label,
    buildingName: report.buildingName,
    replications: report.replications,
    report,
    verdictShown: true,
    answer: single.summary.answer,
    verdictRefusal: null,
    arms,
    rows,
  };
}

/* -------------------------------------------------------------------------- *
 * The index — docs/20 defect 15
 * -------------------------------------------------------------------------- */

/** One verdict of the index: the report's own word, and the arm only where its gate named one. */
export interface SuiteSummaryMark {
  /** `report.ts`'s verdict string, verbatim — the six encode distinctions no index may collapse. */
  readonly verdict: BatchVerdict;
  /** {@link SuiteRowMark.bestArmName}, unchanged: `favours` consumed, never re-derived. */
  readonly bestArmName: string | null;
  /**
   * The index cell's whole text, authored here so no renderer composes a claim: the verdict word
   * alone, or `verdict — arm` where the gate named one. In the honesty corpus under
   * `batch/suite.ts#suiteCellViewOf`, seeded with the source row's own comparison shape.
   */
  readonly text: string;
}

/** One cell's line of the index. */
export interface SuiteSummaryLine {
  readonly cellId: string;
  readonly label: string;
  /**
   * One entry per {@link SuiteSummary.metricLabels} column, in that order; `null` where this
   * cell's verdict block has no row for the column — including every column of a cell whose
   * verdict is refused, whose {@link note} then says why in the refusal's own words.
   */
  readonly marks: readonly (SuiteSummaryMark | null)[];
  /** The cell's `verdictRefusal`, verbatim, or `null` when the marks speak. */
  readonly note: string | null;
}

/** The whole index: the column set and one line per cell, both decided here, not in a renderer. */
export interface SuiteSummary {
  /** Column headers after the cell column — metric labels in first-appearance order. */
  readonly metricLabels: readonly string[];
  readonly lines: readonly SuiteSummaryLine[];
}

/**
 * The suite's index — where each cell landed, one glance wide, drawn **before** the prose.
 *
 * ## The defect this closes — `docs/20` defect 15
 *
 * Two cells at n = 10 produced 17 800 characters of prose with the per-cell verdicts findable
 * only by reading: nine measures × two cells, each a four-line paragraph. The prose is the
 * product's claim and none of it may go — § D299's test binds this surface: easier to use, never
 * saying less — so the fix is an *index over* it rather than a summary *instead of* it. Every
 * word this table shows appears again below, in full.
 *
 * ## What the index is allowed to say, which is the whole design
 *
 * A verdict cell is `report.ts`'s own verdict string plus, only where `BatchComparisonRow.favours`
 * named one, the arm's display name — both read off {@link SuiteCellView.rows}, which already
 * consumed the one gate. Nothing here re-derives a winner, rewords a verdict (*"too close to
 * call"* would collapse `unresolved` into `under-budget`), or invents a tie vocabulary: a suite
 * of two identical arms indexes as the report's own `unresolved`/`under-budget` words, and the
 * sentence explaining *why an exact zero is not proof of identity* stays where it was, in the
 * prose. A cell whose verdict block is refused (arm count ≠ 2) gets no marks and carries the
 * refusal verbatim as its {@link SuiteSummaryLine.note}.
 *
 * The column set is the union of the cells' metric labels in first-appearance order, computed
 * here so two cells whose verdict blocks differ still line up — and so the renderer decides
 * nothing (`dev/suitePanel.ts` only arranges what this returns).
 */
export function suiteSummaryOf(views: readonly SuiteCellView[]): SuiteSummary {
  const metricLabels: string[] = [];
  for (const view of views) {
    for (const row of view.rows) {
      if (!metricLabels.includes(row.label)) metricLabels.push(row.label);
    }
  }
  const lines: SuiteSummaryLine[] = views.map((view) => ({
    cellId: view.cellId,
    label: view.label,
    marks: metricLabels.map((label) => {
      const row = view.rows.find((entry) => entry.label === label);
      if (row === undefined) return null;
      return {
        verdict: row.verdict,
        bestArmName: row.bestArmName,
        text: row.bestArmName === null ? row.verdict : `${row.verdict} — ${row.bestArmName}`,
      };
    }),
    note: view.verdictRefusal,
  }));
  return { metricLabels, lines };
}

