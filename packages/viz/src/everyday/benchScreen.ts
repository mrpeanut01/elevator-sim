/**
 * **The test bench screen** — GAMEPLAY § 12, the DOM half.
 *
 * Every word and every decision is `benchModel.ts`'s and, below it, `batch/suite.ts`'s; this file
 * arranges DOM, runs workers and draws what comes back. It authors **no** claim about a run: the
 * per-cell sentences are `batchReport`'s, the index is `suiteSummaryOf`'s, and the verdict gate is
 * `suiteCellViewOf`'s.
 *
 * ## The run path is the shipped one, per cell, in a worker
 *
 * `dev/suitePanel.ts`'s exact lifecycle, deliberately: `suitePlanOf` plans one `BatchRequest` per
 * ticked cell, each runs in its own `dev/batchWorker.ts` (*"one per batch; a second request needs
 * a second worker"* is that file's contract), and the cells run **sequentially** because one batch
 * already saturates a core at a real budget. A cancelled suite reports nothing — partial cells are
 * discarded rather than dressed up as a smaller suite nobody asked for.
 *
 * The worker URL is `../dev/batchWorker.ts` rather than a host method, and that is the smaller
 * seam: a `runSuite` on `everyday/host.ts` would put a worker lifecycle inside `dev/main.ts`'s
 * boot closure, where nothing else lives, for one caller. This file is already exempt from
 * `boundaries.test.ts`'s DOM confinement as a screen mount, and a `Worker` is the same kind of
 * thing as the `document` it is exempt for.
 *
 * ## What makes the controls provably live
 *
 * The standing requirement — *move the control and require the run to change* — is met on the
 * **request**: `benchScreen.browser.test.ts` reads the plan this screen builds and requires a
 * different tick to change the building/demand block, and `benchModel.test.ts` requires the
 * replication count to change the width of the interval the report draws. There is no bench-local
 * arithmetic that could stay still while a control moved, because there is no bench-local
 * arithmetic at all.
 */

import { intervalPlotFor } from '../batch/intervalPlot.js';
import { actionBarFor } from './actionBar.js';
import {
  suiteCellViewOf,
  suitePlanOf,
  SuiteError,
  type SuiteCellPlan,
  type SuiteCellView,
  type SuiteRequest,
} from '../batch/suite.js';
import type { BatchResult, BatchWorkerMessage, BatchWorkerRequest } from '../batch/types.js';

import {
  benchBudgetNoteOf,
  benchEntrantsOf,
  benchFieldOf,
  benchFieldRefusal,
  benchResultViewOf,
  benchTestsOf,
  benchTestsRefusal,
  benchVerdictNoteOf,
  benchWorkLineOf,
  BENCH_COPY as COPY,
  BENCH_DEFAULT_REPLICATIONS,
  BENCH_REPLICATION_CHOICES,
} from './benchModel.js';
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';

/**
 * The seed every suite runs at.
 *
 * Fixed rather than offered, and the fixing is the honest half of *the same crowds for everyone*:
 * a bench whose seed a player could change is a bench two runs of which are not comparable, and
 * § 12's whole claim is that the crowd cancels out. It is a plain decimal string because
 * `BatchRequest.seed` carries 64 bits through JSON that way.
 */
const BENCH_SEED = '20260812';

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;
const NOTE = `font-size:12.5px;color:${C.warmGrey};line-height:1.5;max-width:74ch`;
const CARD = `border:1px solid ${C.rule};border-radius:${String(R.card)}px;background:${C.card};padding:15px 17px`;

/** The screen's own state — the three controls, and whatever the last run produced. */
interface BenchState {
  pickedIds: readonly string[];
  tickedIds: readonly string[];
  replications: number;
  cells: readonly SuiteCellView[];
  status: string;
  error: string | undefined;
  running: boolean;
}

function mountBench(
  host: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let alive = true;
  let worker: Worker | undefined;
  /** Monotonic token: a cancelled suite's late message must not draw into the next one. */
  let runToken = 0;

  const api = context.host;
  const dispatchers = api.dispatchers().map((profile) => ({ id: profile.id, name: profile.name }));

  const state: BenchState = {
    pickedIds: dispatchers.slice(0, 2).map((entry) => entry.id),
    tickedIds: [],
    replications: BENCH_DEFAULT_REPLICATIONS,
    cells: [],
    status: '',
    error: undefined,
    running: false,
  };

  const root = el(doc, 'div', 'everyday-bench');
  root.style.cssText = 'max-width:1000px';
  host.append(root);

  function stopWorker(): void {
    worker?.terminate();
    worker = undefined;
  }

  /** The suite this screen's controls describe, or `undefined` when a refusal stands. */
  function requestOf(): SuiteRequest | undefined {
    const field = benchFieldOf(state.pickedIds);
    if (field === undefined) return undefined;
    if (benchTestsRefusal(state.tickedIds) !== undefined) return undefined;
    return {
      cellIds: state.tickedIds,
      seed: BENCH_SEED,
      replications: state.replications,
      field,
    };
  }

  function start(): void {
    const request = requestOf();
    if (request === undefined) return;
    let plans: readonly SuiteCellPlan[];
    try {
      plans = suitePlanOf(request);
    } catch (error: unknown) {
      // `SuiteError`'s own sentence, which names the cell and says what could not be carried. A
      // second wording here would be a second answer to why a suite did not run.
      state.error = error instanceof SuiteError ? error.message : String(error);
      render();
      return;
    }

    stopWorker();
    runToken += 1;
    const token = runToken;
    state.error = undefined;
    state.cells = [];
    state.running = true;
    const done: SuiteCellView[] = [];

    const runCell = (index: number): void => {
      const plan = plans[index];
      if (plan === undefined) {
        state.running = false;
        state.cells = done;
        state.status = '';
        stopWorker();
        render();
        return;
      }
      const next = new Worker(new URL('../dev/batchWorker.ts', import.meta.url), {
        type: 'module',
      });
      worker = next;
      next.addEventListener('message', (event: MessageEvent) => {
        if (token !== runToken || !alive) return;
        const message = event.data as BatchWorkerMessage;
        if (message.kind === 'progress') {
          state.status =
            `${plan.cell.label} — ${String(message.progress.completed)} of ` +
            `${String(request.replications * request.field.length)} days, and ` +
            `${String(plans.length - index - 1)} tests after this one.`;
          renderStatus();
          return;
        }
        if (message.kind === 'failed') {
          state.running = false;
          state.error =
            `“${plan.cell.label}” could not be run: ${message.message}. Nothing is reported — a ` +
            'suite with a missing test would be a different suite.';
          stopWorker();
          render();
          return;
        }
        done.push(suiteCellViewOf(plan.cell, message.result as BatchResult));
        stopWorker();
        runCell(index + 1);
      });
      next.addEventListener('error', (event: ErrorEvent) => {
        if (token !== runToken || !alive) return;
        state.running = false;
        state.error = `the bench could not start: ${event.message}`;
        stopWorker();
        render();
      });
      next.postMessage({ kind: 'run', request: plan.request } satisfies BatchWorkerRequest);
    };

    render();
    runCell(0);
  }

  /* ------------------------------------------------------------------ *
   * Drawing
   * ------------------------------------------------------------------ */

  const statusLine = el(doc, 'p', 'everyday-bench-status');
  statusLine.style.cssText = `${NOTE};color:${C.terracotta};margin:10px 0 0`;

  function renderStatus(): void {
    statusLine.textContent = state.status;
    statusLine.hidden = state.status === '';
  }

  function drawField(): HTMLElement {
    const wrap = el(doc, 'section');
    wrap.style.cssText = `margin-top:${String(GAP.wide)}px`;
    const head = el(doc, 'div', undefined, COPY.fieldHeading);
    head.style.cssText = `${EYEBROW};margin-bottom:6px`;
    const note = el(doc, 'p', 'everyday-bench-field-note', COPY.fieldNote);
    note.style.cssText = `${NOTE};margin:0 0 10px`;
    wrap.append(head, note);

    const grid = el(doc, 'div');
    grid.style.cssText = `display:flex;flex-wrap:wrap;gap:${String(GAP.row)}px`;
    for (const entrant of benchEntrantsOf(dispatchers, state.pickedIds)) {
      const pill = el(doc, 'button', 'everyday-bench-entrant', entrant.name);
      pill.type = 'button';
      pill.dataset['profileId'] = entrant.profileId;
      pill.setAttribute('aria-pressed', String(entrant.picked));
      pill.disabled = state.running || entrant.refusal !== undefined;
      if (entrant.refusal !== undefined) pill.title = entrant.refusal;
      pill.style.cssText = [
        'cursor:pointer',
        `border:1.5px solid ${entrant.picked ? C.sun : C.rule}`,
        `background:${entrant.picked ? C.sun : C.cardSunk}`,
        `color:${entrant.picked ? C.ink : C.warmGrey}`,
        `border-radius:${String(R.pill)}px`,
        'padding:7px 15px',
        `font:500 12px ${TYPE.mono}`,
        entrant.refusal === undefined ? '' : 'opacity:.45',
      ].join(';');
      pill.addEventListener('click', () => {
        state.pickedIds = entrant.picked
          ? state.pickedIds.filter((id) => id !== entrant.profileId)
          : [...state.pickedIds, entrant.profileId];
        render();
      });
      grid.append(pill);
    }
    wrap.append(grid);

    const refusal = benchFieldRefusal(state.pickedIds);
    if (refusal !== undefined) {
      const line = el(doc, 'p', 'everyday-bench-field-refusal', refusal);
      line.style.cssText = `${NOTE};color:${C.alarm};margin:9px 0 0`;
      wrap.append(line);
    }
    const verdictNote = el(
      doc,
      'p',
      'everyday-bench-verdict-note',
      benchVerdictNoteOf(state.pickedIds.length),
    );
    verdictNote.style.cssText = `${NOTE};margin:9px 0 0`;
    wrap.append(verdictNote);
    return wrap;
  }

  function drawTests(): HTMLElement {
    const wrap = el(doc, 'section');
    wrap.style.cssText = `margin-top:${String(GAP.wide)}px`;
    const head = el(doc, 'div', undefined, COPY.testsHeading);
    head.style.cssText = `${EYEBROW};margin-bottom:6px`;
    const hint = el(doc, 'p', undefined, COPY.testsHint);
    hint.style.cssText = `${NOTE};margin:0 0 10px`;
    wrap.append(head, hint);

    for (const test of benchTestsOf(state.tickedIds)) {
      const row = el(doc, 'label', 'everyday-bench-test');
      row.style.cssText = `display:flex;gap:10px;align-items:center;padding:8px 11px;border:1px solid ${C.ruleLight};border-radius:${String(R.row)}px;background:${test.ticked ? C.amberWash : C.cardSunk};margin-bottom:6px;cursor:pointer;font-size:13px`;
      const box = el(doc, 'input');
      box.type = 'checkbox';
      box.checked = test.ticked;
      box.disabled = state.running;
      box.value = test.cellId;
      box.addEventListener('change', () => {
        state.tickedIds = box.checked
          ? [...state.tickedIds, test.cellId]
          : state.tickedIds.filter((id) => id !== test.cellId);
        render();
      });
      row.append(box, doc.createTextNode(test.label));
      wrap.append(row);
    }

    const absent = el(doc, 'p', 'everyday-bench-tests-absent', COPY.testsAbsent);
    absent.style.cssText = `${NOTE};margin:9px 0 0`;
    wrap.append(absent);

    const refusal = benchTestsRefusal(state.tickedIds);
    if (refusal !== undefined) {
      const line = el(doc, 'p', 'everyday-bench-tests-refusal', refusal);
      line.style.cssText = `${NOTE};color:${C.alarm};margin:9px 0 0`;
      wrap.append(line);
    }
    return wrap;
  }

  function drawBudget(): HTMLElement {
    const wrap = el(doc, 'section');
    wrap.style.cssText = `margin-top:${String(GAP.wide)}px`;
    const head = el(doc, 'div', undefined, COPY.repsHeading);
    head.style.cssText = `${EYEBROW};margin-bottom:8px`;
    wrap.append(head);

    const grid = el(doc, 'div');
    grid.style.cssText = `display:flex;gap:${String(GAP.row)}px;flex-wrap:wrap`;
    for (const choice of BENCH_REPLICATION_CHOICES) {
      const on = state.replications === choice;
      const pill = el(doc, 'button', 'everyday-bench-reps', String(choice));
      pill.type = 'button';
      pill.dataset['reps'] = String(choice);
      pill.setAttribute('aria-pressed', String(on));
      pill.disabled = state.running;
      pill.style.cssText = [
        'cursor:pointer',
        `border:1.5px solid ${on ? C.sun : C.rule}`,
        `background:${on ? C.sun : C.cardSunk}`,
        `color:${on ? C.ink : C.warmGrey}`,
        `border-radius:${String(R.pill)}px`,
        'padding:7px 17px',
        `font:500 12.5px ${TYPE.mono}`,
      ].join(';');
      pill.addEventListener('click', () => {
        state.replications = choice;
        render();
      });
      grid.append(pill);
    }
    wrap.append(grid);

    const work = el(
      doc,
      'p',
      'everyday-bench-work',
      benchWorkLineOf(state.tickedIds.length, state.replications, state.pickedIds.length),
    );
    work.style.cssText = `font:500 12.5px ${TYPE.mono};color:${C.terracotta};margin:10px 0 0`;
    wrap.append(work);

    const budgetNote = benchBudgetNoteOf(state.replications);
    if (budgetNote !== undefined) {
      const line = el(doc, 'p', 'everyday-bench-budget-note', budgetNote);
      line.style.cssText = `${NOTE};margin:8px 0 0`;
      wrap.append(line);
    }
    return wrap;
  }

  function drawResult(): HTMLElement {
    const wrap = el(doc, 'section', 'everyday-bench-result');
    wrap.style.cssText = `margin-top:${String(GAP.wide)}px`;
    if (state.cells.length === 0) return wrap;
    const view = benchResultViewOf(state.cells);

    const caption = el(doc, 'p', 'everyday-bench-caption', view.caption);
    caption.style.cssText = `${EYEBROW};margin:0 0 8px`;
    wrap.append(caption);

    /* ---- the index — `suiteSummaryOf`'s columns, words and order, arranged only ---- */
    const table = el(doc, 'table', 'everyday-bench-index');
    table.style.cssText = 'border-collapse:collapse;width:100%;font-size:12.5px';
    const headRow = el(doc, 'tr');
    for (const label of ['test', ...view.summary.metricLabels]) {
      const cell = el(doc, 'th', undefined, label);
      cell.style.cssText = `${EYEBROW};text-align:left;padding:6px 9px;border-bottom:1px solid ${C.rule}`;
      headRow.append(cell);
    }
    table.append(headRow);
    for (const line of view.summary.lines) {
      const row = el(doc, 'tr');
      const name = el(doc, 'td', undefined, line.label);
      name.style.cssText = `padding:6px 9px;border-bottom:1px solid ${C.ruleLight};font-weight:600`;
      row.append(name);
      for (const mark of line.marks) {
        const cell = el(doc, 'td', 'everyday-bench-mark', mark?.text ?? '—');
        cell.style.cssText = `padding:6px 9px;border-bottom:1px solid ${C.ruleLight};color:${mark?.bestArmName === null || mark === null ? C.warmGrey : C.moss}`;
        row.append(cell);
      }
      table.append(row);
      if (line.note !== null) {
        const noteRow = el(doc, 'tr');
        const cell = el(doc, 'td', 'everyday-bench-index-note', line.note);
        cell.colSpan = view.summary.metricLabels.length + 1;
        cell.style.cssText = `${NOTE};padding:4px 9px 10px`;
        noteRow.append(cell);
        table.append(noteRow);
      }
    }
    wrap.append(table);

    /* ---- the prose, per cell, every sentence the report's own ---- */
    for (const cell of view.cells) {
      const card = el(doc, 'div', 'everyday-bench-cell');
      card.style.cssText = `${CARD};margin-top:${String(GAP.block)}px`;
      const title = el(doc, 'div', undefined, cell.label);
      title.style.cssText = 'font-size:14.5px;font-weight:600';
      card.append(title);

      for (const arm of cell.arms) {
        const line = el(doc, 'p', 'everyday-bench-arm', `${arm.profileName} — ${arm.sentence}`);
        line.style.cssText = `${NOTE};margin:8px 0 0`;
        card.append(line);
      }

      if (!cell.verdictShown) {
        const refusal = el(doc, 'p', 'everyday-bench-cell-refusal', cell.verdictRefusal ?? '');
        refusal.style.cssText = `${NOTE};color:${C.alarm};margin:10px 0 0`;
        card.append(refusal);
        wrap.append(card);
        continue;
      }

      if (view.tooCloseCellIds.includes(cell.cellId)) {
        const heading = el(doc, 'div', 'everyday-bench-too-close', COPY.tooCloseHeading);
        heading.style.cssText = `font:500 12px ${TYPE.mono};color:${C.warmGrey};margin-top:10px`;
        card.append(heading);
      }

      const comparison = cell.report.comparisons[0];
      for (const row of cell.rows) {
        const line = el(doc, 'div', 'everyday-bench-row');
        line.style.cssText = `padding:7px 0;border-top:1px solid ${C.ruleLight}`;
        const label = el(doc, 'span', undefined, `${row.label} · ${row.verdict}`);
        label.style.cssText = `font:500 12px ${TYPE.mono};color:${row.bestArmName === null ? C.warmGrey : C.moss}`;
        const sentence = el(doc, 'p', undefined, row.sentence);
        sentence.style.cssText = `${NOTE};margin:3px 0 0`;
        line.append(label, sentence);
        const source = comparison?.rows.find((entry) => entry.metric === row.metric);
        const plot = source === undefined ? null : intervalPlotFor(source);
        if (plot !== null) {
          const bar = el(
            doc,
            'p',
            'everyday-bench-interval',
            `between ${plot.lower.toFixed(plot.places)} and ${plot.upper.toFixed(plot.places)}${plot.unit} · ` +
              `${plot.excludesZero ? 'zero is outside' : 'zero is inside'}`,
          );
          bar.style.cssText = `font:500 12px ${TYPE.mono};color:${C.terracotta};margin:3px 0 0`;
          line.append(bar);
        }
        card.append(line);
      }
      const answer = el(doc, 'p', 'everyday-bench-answer', cell.answer ?? '');
      answer.style.cssText = `${NOTE};margin:10px 0 0;color:${C.inkSoft}`;
      card.append(answer);
      wrap.append(card);
    }
    return wrap;
  }

  function drawStandingNotes(): HTMLElement {
    const wrap = el(doc, 'section', 'everyday-bench-standing');
    wrap.style.cssText = `margin-top:${String(GAP.wide)}px;border-top:1px solid ${C.ruleLight};padding-top:${String(GAP.block)}px`;
    const list = el(doc, 'ul');
    list.style.cssText = `margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;${NOTE}`;
    for (const note of benchResultViewOf(state.cells).standingNotes) {
      list.append(el(doc, 'li', undefined, note));
    }
    wrap.append(list);
    const never = el(doc, 'p', 'everyday-bench-never', COPY.neverASubtraction);
    never.style.cssText = `${NOTE};margin:10px 0 0`;
    wrap.append(never);
    return wrap;
  }

  function render(): void {
    if (!alive) return;
    /*
     * The § 3.3 refinement reads this rather than the closure, because the shell calls `bar()`
     * from outside the mount. Written on every draw so the primary's inertness and its two
     * variants always describe the controls as they now stand.
     */
    mountedBench = {
      ran: state.cells.length > 0,
      ready:
        !state.running &&
        benchFieldRefusal(state.pickedIds) === undefined &&
        benchTestsRefusal(state.tickedIds) === undefined,
    };
    root.replaceChildren();
    const eyebrow = el(doc, 'div', undefined, COPY.eyebrow);
    eyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.16em;color:${C.label}`;
    const title = el(doc, 'h1', undefined, COPY.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:32px;font-weight:700;letter-spacing:-.02em;margin:10px 0 0`;
    const lede = el(doc, 'p', undefined, COPY.lede);
    lede.style.cssText = `font-size:16px;line-height:1.55;color:${C.inkSoft};margin:12px 0 0;max-width:64ch;text-wrap:pretty`;
    root.append(eyebrow, title, lede);
    root.append(drawField(), drawTests(), drawBudget());
    if (state.error !== undefined) {
      const failure = el(doc, 'p', 'everyday-bench-error', state.error);
      failure.style.cssText = `${NOTE};color:${C.alarm};margin-top:${String(GAP.block)}px`;
      root.append(failure);
    }
    renderStatus();
    root.append(statusLine);
    root.append(drawResult(), drawStandingNotes());
    context.refreshBar();
  }

  render();

  return {
    unmount: () => {
      alive = false;
      stopWorker();
    },
    /* § 3.3's primary: *Run the suite* / *Run the suite again*, resolved by `benchBar` below. */
    primary: start,
  };
}

/**
 * The mounted screen's state, for the § 3.3 refinement the shell asks for outside the closure —
 * `workshopScreen.ts`'s `mountedHost` shape, and `fixitScreen.ts`'s before it.
 */
let mountedBench: { ran: boolean; ready: boolean } | undefined;

/**
 * § 3.3's bench row, refined.
 *
 * Two refinements and nothing else. The primary picks between the guide's own two variants (*Run
 * the suite* / *Run the suite again*), and it is drawn **inert** while the field or the tests are
 * refused — a pressable button whose press does nothing is what `BarPrimary.inert` exists to
 * prevent, and the refusal itself is already on the screen beside the control it is about.
 */
function benchBar(state: Parameters<NonNullable<EverydayScreenModule['bar']>>[0]): ReturnType<
  NonNullable<EverydayScreenModule['bar']>
> {
  const base = actionBarFor(state);
  const here = mountedBench;
  const label = (here?.ran === true ? base.primary.variants[1] : base.primary.variants[0]) ?? base.primary.label;
  return {
    ...base,
    primary: { ...base.primary, label, inert: here === undefined ? true : !here.ready },
  };
}

/** The registry row — GAMEPLAY § 12's screen, mounted by `shell.ts` through `screens.ts`. */
export const BENCH_SCREEN: EverydayScreenModule = {
  key: 'bench',
  mount: (host, context) => {
    const mounted = mountBench(host, context as EverydayScreenShellContext);
    return {
      ...mounted,
      unmount: () => {
        mountedBench = undefined;
        mounted.unmount?.();
      },
    };
  },
  bar: benchBar,
};
