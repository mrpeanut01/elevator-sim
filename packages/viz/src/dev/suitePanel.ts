/**
 * The Suite surface — Everyday Mode slice 7's mount, beside the pairwise bench it consumes.
 *
 * One comparison, many fixed cells: the reader picks a field of two dispatchers and ticks
 * operating points from the experiment matrix, and each ticked cell runs as its own batch through
 * **the same machinery the Compare bench above uses** — `dev/batchWorker.ts` per cell (a worker
 * per batch is that file's own contract: *"One per batch; a second request needs a second
 * worker"*), `batch/runBatch.ts` inside it, `batch/report.ts` for every sentence. This file
 * arranges DOM and workers; every claim on screen is authored in `batch/suite.ts` or in the
 * report it consumes.
 *
 * ## The controls all reach the run, and the cheap proof is the request
 *
 * The standing rule — *move the control and require the run to change, compared on the legs* — is
 * held one level down: `suite.test.ts` asserts that ticking a different cell changes the
 * `BatchRequest`'s building/demand block (and, run for real, the passenger trace), and this mount
 * builds its `SuiteRequest` from nothing but the live controls, so there is no field a control
 * writes that the run does not read. The tick list itself is rendered **from `MATRIX_CELLS`**,
 * imported — never retyped — so a cell added to the matrix appears here with no edit to this file
 * or to `index.html`.
 *
 * ## This panel is deliberately not one of § 12.3's readers
 *
 * `ENGINE_CONTRACT.md` § 12.3 says the forty proof cases have *one list, three readers* — the
 * gauntlet, the ladder's disclosure and **the bench's suite**. § 12 is the *Everyday* bench, and
 * `everyday/benchScreen.ts` became that third reader in [§ D445](../../../../DECISIONS.md). This is
 * the Engineer surface, and it keeps the matrix: it asks *"is this better where this project can
 * resolve a difference?"*, at the eight operating points every published interval was measured at,
 * which is a question the forty are explicitly not chosen to answer — no proof case is dropped for
 * being hard to resolve, and `gauntlet/proofCases.ts` says why. Making this a fourth reader would
 * point the Engineer's instrument away from the numbers it exists to check.
 *
 * ## Cancellation and budgets
 *
 * Cancel terminates the in-flight worker and reports nothing, `batchPanel`'s own rule: a stopped
 * batch has no result, and a suite of stopped batches has none either — partial cells are
 * discarded rather than dressed up as a smaller suite the reader did not ask for. Replications
 * default to `MIN_REPLICATION_BUDGET` and are not clamped here: below 50 the report's own rows
 * come back `under-budget` with the winner deliberately unnamed, and this surface consumes that
 * refusal rather than re-deriving or relaxing it.
 */

import { MATRIX_CELLS } from '@elevator-sim/experiments/browser';

import { intervalPlotFor } from '../batch/intervalPlot.js';
import { populationLineOf, type BatchComparisonRow } from '../batch/report.js';
import {
  suiteCellViewOf,
  suitePlanOf,
  suiteSummaryOf,
  type SuiteCellPlan,
  type SuiteCellView,
  type SuiteRequest,
  type SuiteRowMark,
} from '../batch/suite.js';
import type { BatchResult, BatchWorkerMessage, BatchWorkerRequest } from '../batch/types.js';
import type { GlossaryTerm } from '../mode/glossary.js';
import type { BrowserResources } from './data.js';
import {
  PREFERRED_BATCH_BASELINE,
  PREFERRED_BATCH_CANDIDATE,
  preferredId,
} from './defaults.js';

export interface SuitePanelElements {
  readonly baseline: HTMLSelectElement;
  readonly candidate: HTMLSelectElement;
  readonly replications: HTMLInputElement;
  readonly seed: HTMLInputElement;
  /** Where the per-cell ticks render. Filled from `MATRIX_CELLS` at mount time. */
  readonly cells: HTMLElement;
  readonly run: HTMLButtonElement;
  readonly cancel: HTMLButtonElement;
  readonly progress: HTMLProgressElement;
  readonly status: HTMLElement;
  readonly error: HTMLElement;
  readonly output: HTMLElement;
}

export interface SuitePanelOptions {
  readonly resources: BrowserResources;
  readonly elements: SuitePanelElements;
}

export function mountSuitePanel(options: SuitePanelOptions): void {
  const { resources, elements: ui } = options;
  const doc = ui.output.ownerDocument;
  let worker: Worker | undefined;
  /** Monotonic run token: a cancelled suite's late messages must not draw into the next one. */
  let runToken = 0;
  let showingEmptyState = false;

  /*
   * `Name (slug)`, the form the bench above already uses, from the same source —
   * `data/dispatcher-profiles.json`'s own `name` field.
   */
  for (const select of [ui.baseline, ui.candidate]) {
    for (const profile of resources.dispatcherProfiles.profiles) {
      select.append(new Option(`${profile.name} (${profile.id})`, profile.id));
    }
  }
  applyPreference(ui.baseline, PREFERRED_BATCH_BASELINE);
  applyPreference(ui.candidate, PREFERRED_BATCH_CANDIDATE);

  function applyPreference(select: HTMLSelectElement, preferred: readonly string[]): void {
    const found = preferredId(preferred, resources.dispatcherProfiles.profiles);
    if (found !== undefined) select.value = found;
  }

  /*
   * One tick per matrix cell, rendered from the imported list. The label is the cell's own —
   * `Midtown Office, up-peak 1 %` — because the id alone does not name the pattern, and the
   * pattern is the thing two ticks on one building differ by.
   */
  const ticks = new Map<string, HTMLInputElement>();
  for (const cell of MATRIX_CELLS) {
    const label = doc.createElement('label');
    label.className = 'suite-cell';
    const box = doc.createElement('input');
    box.type = 'checkbox';
    box.value = cell.id;
    label.append(box, doc.createTextNode(` ${cell.label}`));
    ui.cells.append(label);
    ticks.set(cell.id, box);
  }

  function tickedCellIds(): readonly string[] {
    return MATRIX_CELLS.filter((cell) => ticks.get(cell.id)?.checked === true).map(
      (cell) => cell.id,
    );
  }

  function fail(text: string): void {
    ui.error.textContent = text;
    ui.error.focus();
  }

  function setRunning(running: boolean): void {
    ui.run.disabled = running;
    ui.cancel.disabled = !running;
    for (const control of [ui.baseline, ui.candidate, ui.replications, ui.seed]) {
      control.disabled = running;
    }
    for (const box of ticks.values()) box.disabled = running;
  }

  function stopWorker(): void {
    worker?.terminate();
    worker = undefined;
  }

  function requestFromForm(): SuiteRequest | undefined {
    const seedText = ui.seed.value.trim();
    if (seedText === '' || !/^\d+$/.test(seedText)) {
      fail('a suite needs a whole-number seed, so that every replication in it replays exactly.');
      return undefined;
    }
    const replications = Number(ui.replications.value);
    if (!Number.isSafeInteger(replications) || replications < 1) {
      fail('replications must be a whole number of at least 1.');
      return undefined;
    }
    if (ui.baseline.value === ui.candidate.value) {
      // Not refused — the bench's own liveness control: a profile against itself reports
      // "not resolved" rather than a winner, on every ticked cell.
      ui.status.textContent =
        'both arms are the same profile — the difference is exactly zero by construction on every cell.';
    }
    return {
      cellIds: tickedCellIds(),
      seed: seedText,
      replications,
      field: [
        { armId: 'baseline', dispatcherProfileId: ui.baseline.value },
        { armId: 'candidate', dispatcherProfileId: ui.candidate.value },
      ],
    };
  }

  /**
   * Cells run **sequentially**, one worker per cell-batch, restarted per cell. Sequential rather
   * than fanned out because each batch already saturates one core for minutes at real budgets and
   * the progress account below is honest about the whole job either way.
   */
  function start(): void {
    const request = requestFromForm();
    if (request === undefined) return;
    let plans: readonly SuiteCellPlan[];
    try {
      plans = suitePlanOf(request);
    } catch (error: unknown) {
      fail(error instanceof Error ? error.message : String(error));
      return;
    }

    ui.error.textContent = '';
    stopWorker();
    runToken += 1;
    const token = runToken;
    showingEmptyState = false;
    ui.output.replaceChildren();

    const perCell = 2 * request.replications;
    const total = plans.length * perCell;
    ui.progress.max = total;
    ui.progress.value = 0;
    ui.progress.hidden = false;
    ui.status.textContent = `starting ${String(plans.length)} cells — ${String(total)} replications…`;
    setRunning(true);

    const views: SuiteCellView[] = [];

    const finish = (): void => {
      setRunning(false);
      ui.progress.hidden = true;
      ui.status.textContent = `${String(plans.length)} cells finished.`;
      draw(views);
      stopWorker();
    };

    const runCell = (index: number): void => {
      const plan = plans[index];
      if (plan === undefined) {
        finish();
        return;
      }
      const next = new Worker(new URL('./batchWorker.ts', import.meta.url), { type: 'module' });
      worker = next;
      next.addEventListener('message', (event: MessageEvent) => {
        if (token !== runToken) return;
        const message = event.data as BatchWorkerMessage;
        if (message.kind === 'progress') {
          ui.progress.value = index * perCell + message.progress.completed;
          ui.status.textContent =
            `cell ${String(index + 1)} of ${String(plans.length)} (${plan.cell.label}) — ` +
            `${String(message.progress.completed)} of ${String(perCell)} replications; the page is still yours.`;
          return;
        }
        if (message.kind === 'failed') {
          setRunning(false);
          ui.progress.hidden = true;
          fail(`cell "${plan.cell.id}" failed: ${message.message}. Nothing is reported — a suite with a missing cell would be a different suite.`);
          stopWorker();
          return;
        }
        views.push(suiteCellViewOf(plan.cell, message.result as BatchResult));
        stopWorker();
        runCell(index + 1);
      });
      next.addEventListener('error', (event: ErrorEvent) => {
        if (token !== runToken) return;
        setRunning(false);
        ui.progress.hidden = true;
        fail(`the suite worker failed to start: ${event.message}`);
        stopWorker();
      });
      next.postMessage({ kind: 'run', request: plan.request } satisfies BatchWorkerRequest);
    };
    runCell(0);
  }

  /* ------------------------------------------------------------------ *
   * Drawing — the same `.figure` vocabulary the bench above uses.
   * ------------------------------------------------------------------ */

  function row(label: string, value: string, note: string | undefined, cls: string): HTMLElement {
    const node = doc.createElement('div');
    node.className = `figure ${cls}`;
    const labelNode = doc.createElement('span');
    labelNode.className = 'figure-label';
    labelNode.textContent = `${label} `;
    const valueNode = doc.createElement('span');
    valueNode.className = 'figure-value';
    valueNode.textContent = value;
    node.append(labelNode, valueNode);
    if (note !== undefined) {
      const noteNode = doc.createElement('p');
      noteNode.className = 'figure-note';
      noteNode.textContent = note;
      node.append(noteNode);
    }
    return node;
  }

  /** A metric row: the report's own sentence, its interval bar, and the mark where one is owed. */
  function markRow(item: SuiteRowMark, comparisonRow: BatchComparisonRow): HTMLElement {
    const cls = item.verdict === 'resolved' ? 'figure-estimate' : item.verdict === 'suppressed' ? 'figure-suppressed figure-warning' : item.verdict === 'unmeasured' ? 'figure-absent' : 'figure-observation';
    const node = row(item.label, item.sentence, undefined, cls);
    /*
     * Best-in-cell, marked — and marked only where `favours` named it, which `suite.ts` reads off
     * the one gate the project permits. The class is the mark's second signal; the words are the
     * row's own sentence, which already names the arm ahead.
     */
    if (item.bestArmName !== null) node.classList.add('suite-best');
    const plot = intervalPlotFor(comparisonRow);
    if (plot !== null) {
      // The bench's drawn interval is its highest-value element; the suite reuses the geometry
      // module and renders the compact text form, scaled bars being the bench's own job.
      const bar = doc.createElement('p');
      bar.className = 'figure-note';
      bar.textContent = `interval [${plot.lower.toFixed(plot.places)}, ${plot.upper.toFixed(plot.places)}]${plot.unit}, ${plot.excludesZero ? 'clear of zero' : 'crossing zero'}.`;
      node.append(bar);
    }
    return node;
  }

  /**
   * The index table — `docs/20` defect 15, drawn **before** the prose it indexes.
   *
   * Every decision in it is `batch/suite.ts#suiteSummaryOf`'s: the column set, the verdict words
   * (report.ts's own six, never reworded), and which cells name an arm (only where `favours`
   * did). This function only arranges rows — § D299's test binds this surface, so the table adds
   * nothing and the prose below keeps every figure, qualifier and refusal it had.
   */
  function drawSummary(views: readonly SuiteCellView[]): void {
    const summary = suiteSummaryOf(views);
    if (summary.lines.length === 0) return;
    const table = doc.createElement('table');
    table.className = 'suite-summary';
    const caption = doc.createElement('caption');
    caption.textContent =
      'Where each cell landed — an index of the full report below. Every word here appears ' +
      'again underneath, in full; a row names an arm only where the report’s own gate did.';
    table.append(caption);
    const head = doc.createElement('tr');
    for (const label of ['cell', ...summary.metricLabels]) {
      const th = doc.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      head.append(th);
    }
    table.append(head);
    for (const line of summary.lines) {
      const tr = doc.createElement('tr');
      const cellName = doc.createElement('th');
      cellName.scope = 'row';
      cellName.textContent = line.label;
      tr.append(cellName);
      if (line.note !== null) {
        // A cell with no verdict block carries its refusal, verbatim, across the whole line.
        const td = doc.createElement('td');
        td.colSpan = Math.max(1, summary.metricLabels.length);
        td.textContent = line.note;
        tr.append(td);
      } else {
        for (const mark of line.marks) {
          const td = doc.createElement('td');
          if (mark === null) {
            td.textContent = '—';
          } else {
            // The whole cell text is `suiteSummaryOf`'s — this file composes no claim.
            td.textContent = mark.text;
            if (mark.bestArmName !== null) td.classList.add('suite-best');
          }
          tr.append(td);
        }
      }
      table.append(tr);
    }
    ui.output.append(table);
  }

  function draw(views: readonly SuiteCellView[]): void {
    ui.output.replaceChildren();
    drawSummary(views);
    for (const view of views) {
      /*
       * The population **in words**, with the exact trace key on the row's `title` — `docs/20`
       * defect 9. The key is provenance (seed plus this reproduces the run elsewhere), so it is
       * kept rather than dropped; what it stops being is the sentence a first-timer reads.
       * `batch/report.ts#populationLineOf` renders every field of it, so nothing is summarised
       * away — see its docstring for why that is the load-bearing half.
       */
      const cellRow = row(
        view.label,
        `${view.buildingName} · ${String(view.replications)} replications per arm · seed ${view.report.seed}`,
        `Every arm ran this population: ${populationLineOf(view.report.traceKey, { buildingName: view.buildingName })}.`,
        'figure-observation',
      );
      cellRow.title = view.report.traceKey;
      ui.output.append(cellRow);
      if (view.verdictShown && view.answer !== null) {
        ui.output.append(row('the answer', view.answer, undefined, 'figure-estimate'));
      }
      if (view.verdictRefusal !== null) {
        ui.output.append(row('no verdict', view.verdictRefusal, undefined, 'figure-warning'));
      }
      for (const arm of view.arms) {
        ui.output.append(row(`arm ${arm.armId}`, arm.sentence, undefined, 'figure-observation'));
      }
      const comparison = view.report.comparisons[0];
      if (view.verdictShown && comparison !== undefined) {
        for (const [index, mark] of view.rows.entries()) {
          const source = comparison.rows[index];
          if (source !== undefined) ui.output.append(markRow(mark, source));
        }
      }
      if (view.report.budgetNote !== null) {
        ui.output.append(row('replication budget', view.report.budgetNote, undefined, 'figure-warning'));
      }
    }
    drawGlossary(views.flatMap((view) => view.report.glossary));
  }

  /** The terms the cells above used, defined once each across the whole suite. */
  function drawGlossary(terms: readonly GlossaryTerm[]): void {
    const seen = new Set<string>();
    const shown = terms.filter((entry) => !seen.has(entry.id) && seen.add(entry.id));
    if (shown.length === 0) return;
    ui.output.append(
      row(
        'the words above',
        'What each term on this screen means. Definitions only — nothing here is a result.',
        undefined,
        'figure-observation',
      ),
    );
    for (const entry of shown) {
      ui.output.append(row(entry.term, entry.plain, undefined, 'figure-observation'));
    }
  }

  /* ------------------------------------------------------------------ *
   * Before anything has run
   * ------------------------------------------------------------------ */

  function drawEmptyState(): void {
    ui.output.replaceChildren();
    const ticked = tickedCellIds().length;
    const replications = Number(ui.replications.value);
    const simulations =
      Number.isSafeInteger(replications) && replications > 0 ? ticked * 2 * replications : 0;
    ui.output.append(
      row(
        'what the suite is for',
        'The bench above compares two dispatchers at one operating point. The suite runs the same ' +
          'two-arm comparison over the experiment matrix’s fixed cells — building × traffic ' +
          'pattern, each with its measured rationale — one batch per ticked cell.',
        /*
         * `docs/20` defect 9: the identifier is gone and the **fact** it was carrying is not.
         * A reader needed to know two things from that clause — that these eight are the
         * project's own measured operating points rather than a list assembled here, and that
         * eight cells is not eight buildings — and a module-qualified constant name delivered
         * neither to a player. Both are said in words instead. The claim stays true by import:
         * this panel's tick list is rendered from `MATRIX_CELLS` (line 104), never retyped, which
         * is the seam `benchmark/matrixCells.ts` exists to keep open.
         */
        'The cells are the eight operating points this project measures — building × traffic ' +
          'pattern, over five buildings — not the eight buildings. Each cell reports with the ' +
          'same rules as a single batch: an ' +
          'interval that includes zero is “not resolved”, a suppressed mean shows its reason, and ' +
          'below 50 replications no winner is named.',
        'figure-observation',
      ),
      row(
        'what Run suite will do',
        `${String(ticked)} cells ticked × 2 dispatchers × ${String(Number.isFinite(replications) ? replications : 0)} replications = ${String(simulations)} simulations`,
        'Cells run one after another; the progress bar counts every replication of the whole ' +
          'suite. Cancel stops it, which reports nothing, because a stopped suite has no result.',
        'figure-observation',
      ),
      row('to begin', 'Tick at least one cell and press Run suite.', undefined, 'figure-observation'),
    );
  }

  function refreshEmptyState(): void {
    if (!showingEmptyState) return;
    drawEmptyState();
  }

  for (const control of [ui.baseline, ui.candidate]) {
    control.addEventListener('change', refreshEmptyState);
  }
  for (const control of [ui.replications, ui.seed]) {
    control.addEventListener('input', refreshEmptyState);
    control.addEventListener('change', refreshEmptyState);
  }
  ui.cells.addEventListener('change', refreshEmptyState);

  ui.run.addEventListener('click', start);
  ui.cancel.addEventListener('click', () => {
    runToken += 1;
    stopWorker();
    setRunning(false);
    ui.progress.hidden = true;
    ui.status.textContent = 'cancelled — a stopped suite has no result, so nothing is reported.';
    showingEmptyState = true;
    drawEmptyState();
  });

  setRunning(false);
  ui.progress.hidden = true;
  showingEmptyState = true;
  drawEmptyState();
}
