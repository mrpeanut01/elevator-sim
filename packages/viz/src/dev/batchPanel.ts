/**
 * The Compare surface — `docs/10-experience-layer-contract.md` § 11 **W3**'s named non-test
 * caller, and the thing that lets the viewer say a sentence one run cannot support.
 *
 * The single-run viewer may say *"in this run, X happened"* and may not say *"this dispatcher is
 * better"* (**R2**). This panel is where the second sentence becomes available, and every part of
 * it exists to keep the sentence true:
 *
 * | Control | Why it is here |
 * |---|---|
 * | two dispatcher pickers | the comparison is between arms, and the dispatcher is the only thing allowed to differ between them |
 * | replications, defaulting to 50 | CLAUDE.md's 50–200 budget; `batch/report.ts` prints a note when the reader leaves it |
 * | seed | R7 / invariant 5. The batch's seeds are `replicationSeed(seed, i)`, so the whole batch replays from this one field |
 * | demand | at Midtown Office's shipped demand, **0 of 50** replications return a quotable AWT under either arm (§ D158). Without this control the estimate half of W3's own acceptance clause is unreachable from the viewer |
 * | Cancel | the only honest form of cancellation, because a replication cannot be interrupted: it terminates the worker, and a terminated batch reports nothing |
 *
 * ## The main thread does not block, and this file is where that is arranged
 *
 * `runBatch` is synchronous and is never called from here. A `Worker` is started per batch, the
 * progress messages update a `<progress>` element and a status line, and the page stays live —
 * the playhead in the Run viewer tab keeps animating while a batch of Vertical City runs, which
 * is the observable form of the promise.
 */

import type { BatchRequest, BatchWorkerMessage, BatchWorkerRequest } from '../batch/types.js';
import { batchReport, type BatchComparisonRow, type BatchReport } from '../batch/report.js';
import { goalReport, type GoalReport, type GoalReportRow } from '../scenario/goalReport.js';
import type { BrowserResources } from './data.js';
import {
  PREFERRED_BATCH_BASELINE,
  PREFERRED_BATCH_CANDIDATE,
  preferredDispatcherId,
} from './defaults.js';

export interface BatchPanelElements {
  readonly building: HTMLSelectElement;
  readonly baseline: HTMLSelectElement;
  readonly candidate: HTMLSelectElement;
  readonly duration: HTMLInputElement;
  readonly seed: HTMLInputElement;
  readonly replications: HTMLInputElement;
  readonly demand: HTMLInputElement;
  readonly run: HTMLButtonElement;
  readonly cancel: HTMLButtonElement;
  readonly progress: HTMLProgressElement;
  readonly status: HTMLElement;
  readonly error: HTMLElement;
  readonly output: HTMLElement;
}

export interface BatchPanelOptions {
  readonly resources: BrowserResources;
  readonly elements: BatchPanelElements;
  /**
   * The viewer's current building, seed and horizon, read when the panel is first shown.
   *
   * A function rather than a value because the reader may run several single runs before opening
   * this tab, and the batch that follows should be about the building they were just looking at.
   */
  readonly inherit: () => { readonly buildingId: string; readonly seed: string; readonly durationS: string };
}

export interface BatchPanelHandle {
  /** Called when the Compare tab is selected. Prefills from the viewer, once per visit. */
  prefill(): void;
}

export function mountBatchPanel(options: BatchPanelOptions): BatchPanelHandle {
  const { resources, elements: ui } = options;
  const doc = ui.output.ownerDocument;
  let worker: Worker | undefined;

  for (const building of resources.buildings) {
    ui.building.append(new Option(`${building.name} (${building.id})`, building.id));
  }
  for (const select of [ui.baseline, ui.candidate]) {
    for (const profile of resources.dispatcherProfiles.profiles) {
      select.append(new Option(profile.id, profile.id));
    }
  }
  // `collective` is `docs/07` § 4's recommended reference arm and `eta` the other measured one;
  // the lists and the reason live in `dev/defaults.ts`, which `dev/defaults.test.ts` pins. This
  // function is their named non-test caller alongside `dev/main.ts`.
  applyPreference(ui.baseline, PREFERRED_BATCH_BASELINE);
  applyPreference(ui.candidate, PREFERRED_BATCH_CANDIDATE);

  function applyPreference(select: HTMLSelectElement, preferred: readonly string[]): void {
    const found = preferredDispatcherId(preferred, resources.dispatcherProfiles.profiles);
    if (found !== undefined) select.value = found;
  }

  function fail(text: string): void {
    ui.error.textContent = text;
    ui.error.focus();
  }

  function setRunning(running: boolean): void {
    ui.run.disabled = running;
    ui.cancel.disabled = !running;
    for (const control of [
      ui.building,
      ui.baseline,
      ui.candidate,
      ui.duration,
      ui.seed,
      ui.replications,
      ui.demand,
    ]) {
      control.disabled = running;
    }
  }

  function stopWorker(): void {
    worker?.terminate();
    worker = undefined;
  }

  function requestFromForm(): BatchRequest | undefined {
    const seedText = ui.seed.value.trim();
    if (seedText === '' || !/^\d+$/.test(seedText)) {
      fail('a batch needs a whole-number seed, so that every replication in it replays exactly.');
      return undefined;
    }
    const replications = Number(ui.replications.value);
    if (!Number.isSafeInteger(replications) || replications < 1) {
      fail('replications must be a whole number of at least 1.');
      return undefined;
    }
    const durationS = Number(ui.duration.value);
    if (!Number.isFinite(durationS) || durationS <= 0) {
      fail('duration must be a positive number of simulated seconds.');
      return undefined;
    }
    if (ui.baseline.value === ui.candidate.value) {
      // Not refused. W3's own liveness evidence is a profile against itself reporting "not
      // resolved" rather than a winner, and a reader is entitled to run it.
      ui.status.textContent =
        'both arms are the same profile — the difference is exactly zero by construction, which is the control this panel is meant to survive.';
    }
    const demandText = ui.demand.value.trim();
    let arrivalRatePctPop5min: number | null = null;
    if (demandText !== '') {
      const value = Number(demandText);
      if (!Number.isFinite(value) || value <= 0) {
        fail('demand must be a positive percentage, or blank for the building’s own profile.');
        return undefined;
      }
      arrivalRatePctPop5min = value;
    }
    return {
      buildingId: ui.building.value,
      seed: seedText,
      durationS,
      replications,
      arms: [
        { armId: 'baseline', dispatcherProfileId: ui.baseline.value },
        { armId: 'candidate', dispatcherProfileId: ui.candidate.value },
      ],
      arrivalRatePctPop5min,
    };
  }

  function start(): void {
    const request = requestFromForm();
    if (request === undefined) return;
    ui.error.textContent = '';
    stopWorker();
    ui.output.replaceChildren();

    const total = request.arms.length * request.replications;
    ui.progress.max = total;
    ui.progress.value = 0;
    ui.progress.hidden = false;
    ui.status.textContent = `starting ${String(total)} replications…`;
    setRunning(true);

    const next = new Worker(new URL('./batchWorker.ts', import.meta.url), { type: 'module' });
    worker = next;
    next.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as BatchWorkerMessage;
      if (message.kind === 'progress') {
        ui.progress.value = message.progress.completed;
        ui.status.textContent = `${String(message.progress.completed)} of ${String(message.progress.total)} replications — the page is still yours while this runs.`;
        return;
      }
      setRunning(false);
      ui.progress.hidden = true;
      if (message.kind === 'failed') {
        fail(`the batch failed: ${message.message}`);
        stopWorker();
        return;
      }
      const report = batchReport(message.result);
      ui.status.textContent = `${String(report.replications)} replications per arm in ${(message.result.elapsedMs / 1000).toFixed(1)} s.`;
      draw(report, goalReport(message.result));
      stopWorker();
    });
    next.addEventListener('error', (event: ErrorEvent) => {
      setRunning(false);
      ui.progress.hidden = true;
      fail(`the batch worker failed to start: ${event.message}`);
      stopWorker();
    });
    next.postMessage({ kind: 'run', request } satisfies BatchWorkerRequest);
  }

  /* ------------------------------------------------------------------ *
   * Drawing
   *
   * The same `.figure` vocabulary the run summary uses, and for the same reason: nothing here
   * keys on a metric id, so a ninth metric in `BATCH_METRICS` appears with no edit to this file
   * and none to `index.html`.
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

  /** The first refusal in full, and how many others there were. See the call site. */
  function firstReason(reasons: readonly string[]): string | undefined {
    const first = reasons[0];
    if (first === undefined) return undefined;
    const rest = reasons.length - 1;
    return rest === 0
      ? `One run refused, and said: ${first}`
      : `${String(reasons.length)} runs refused. The first said: ${first} The other ${String(rest)} each name their own queue growth in the same words.`;
  }

  /** A row's CSS class from its verdict — never from its metric. */
  function verdictClass(item: BatchComparisonRow): string {
    switch (item.verdict) {
      case 'resolved':
        return 'figure-estimate';
      /*
       * The same class as `unresolved` and `shown`, and for the same reason: the row draws its
       * interval and orders nothing. `figure-estimate` is the class of a row a reader may act on,
       * and a direction measured over fewer paired runs than the project budgets for is not one
       * — § D171. The refusal is in the sentence, not only in the styling.
       */
      case 'under-budget':
        return 'figure-observation';
      case 'unresolved':
        return 'figure-observation';
      case 'shown':
        return 'figure-observation';
      case 'suppressed':
        return 'figure-suppressed figure-warning';
      case 'unmeasured':
        return 'figure-absent';
    }
  }

  /**
   * A goal row's CSS class from R12's disposition — never from the goal kind.
   *
   * A constant is drawn as a *refusal*, in the same class a suppressed statistic uses, because
   * that is what it is: this configuration cannot judge the player on it, and the surface says so
   * rather than showing a rate of 50 of 50 that reads like a win.
   */
  function dispositionClass(item: GoalReportRow): string {
    switch (item.disposition) {
      case 'batch':
        return 'figure-observation';
      case 'configuration-fact':
        return 'figure-suppressed figure-warning';
      case 'not-shippable':
        return 'figure-absent';
    }
  }

  function draw(report: BatchReport, goals: GoalReport): void {
    ui.output.replaceChildren();
    ui.output.append(
      row(
        'batch',
        `${report.buildingName} · ${String(report.replications)} replications per arm · ${String(report.durationS)} s · ${report.demandClause}`,
        // R7: the seed is text, so it can be selected and pasted. Every replication's own seed is
        // `replicationSeed(this, i)`, so this one field replays the whole batch.
        `seed ${report.seed} — every replication in this batch replays from it.`,
        'figure-observation',
      ),
    );
    ui.output.append(
      row(
        'common random numbers',
        report.crnSentence,
        // The equivalence class, verbatim. Seed plus this is what reproduces the batch elsewhere,
        // and it is the half the seed field does not carry.
        `Every arm ran this population: ${report.traceKey}`,
        'figure-observation',
      ),
    );
    if (report.budgetNote !== null) {
      ui.output.append(row('replication budget', report.budgetNote, undefined, 'figure-warning'));
    }
    for (const arm of report.arms) {
      ui.output.append(
        row(
          `arm ${arm.armId}`,
          arm.sentence,
          /*
           * **One reason verbatim, and a count.** Found by driving: `BatchArmSummary.reasons` is
           * de-duplicated by string, and every shipped saturation reason embeds that run's own
           * queue growth — so 50 refusals are 50 *distinct* strings and this note rendered as
           * fifteen thousand characters of near-identical prose. R3 requires the reason to be
           * shown; it does not require it fifty times, and a wall nobody reads is a worse way of
           * hiding a fact than a blank would be. The full list stays on the report for a caller
           * that wants it.
           */
          firstReason(arm.reasons),
          arm.quotable === arm.n ? 'figure-observation' : 'figure-warning',
        ),
      );
    }
    for (const comparison of report.comparisons) {
      ui.output.append(
        row(
          'comparison',
          `${comparison.candidateProfileId} against ${comparison.baselineProfileId}`,
          undefined,
          'figure-observation',
        ),
      );
      for (const item of comparison.rows) {
        ui.output.append(row(item.label, item.sentence, item.note, verdictClass(item)));
      }
    }
    drawGoals(goals);
  }

  /**
   * R12 on screen: what each candidate goal **is** on this configuration.
   *
   * Deliberately after the comparison rows and deliberately without a verdict. Nothing here says
   * a goal was met — it says how often it passed, out of how many runs, and what that makes it:
   * a batch goal, a fact about the configuration, or something this batch cannot judge.
   */
  function drawGoals(goals: GoalReport): void {
    ui.output.append(
      row(
        'goals',
        'What each candidate goal is on this configuration — a frequency over the runs above, ' +
          'never a verdict on one of them.',
        goals.floorNote ?? undefined,
        goals.floorNote === null ? 'figure-observation' : 'figure-warning',
      ),
    );
    for (const item of goals.rows) {
      ui.output.append(row(item.label, item.sentence, undefined, dispositionClass(item)));
    }
    for (const item of goals.withheld) {
      ui.output.append(row(item.label, 'no pass rate from this batch', item.reason, 'figure-absent'));
    }
  }

  ui.run.addEventListener('click', start);
  ui.cancel.addEventListener('click', () => {
    stopWorker();
    setRunning(false);
    ui.progress.hidden = true;
    ui.status.textContent = 'cancelled — a stopped batch has no result, so nothing is reported.';
  });

  setRunning(false);
  ui.progress.hidden = true;

  let prefilled = false;
  return {
    prefill(): void {
      if (prefilled) return;
      prefilled = true;
      const from = options.inherit();
      if ([...ui.building.options].some((option) => option.value === from.buildingId)) {
        ui.building.value = from.buildingId;
      }
      if (from.seed.trim() !== '') ui.seed.value = from.seed.trim();
      if (from.durationS.trim() !== '') ui.duration.value = from.durationS.trim();
    },
  };
}
