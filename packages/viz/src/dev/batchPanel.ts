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
 *
 * ## The body is never empty ([§ D225](../../../../DECISIONS.md))
 *
 * It was, until a play-through found that the tab the Day report *sends a reader to* was one
 * toolbar row over a blank panel with no title, no sentence and no verb — so it read as broken or
 * still loading. {@link mountBatchPanel}'s `drawEmptyState` is what is there before a run and after
 * a cancel: what a batch is, which arm is which way round in the subtraction, what the derived
 * cost of the current form is, what a blank demand field means, and the instruction to press the
 * button. It is inline prose rather than a pure export, which is the same accounting
 * `honesty/derive.test.ts` already makes for this module — DOM-bound, statically swept, and driven
 * instead by `dev/compareLab.browser.test.ts`, which is stronger than the sweep and weaker than
 * the honesty search.
 */

import type { BatchRequest, BatchWorkerMessage, BatchWorkerRequest } from '../batch/types.js';
import { batchReport, type BatchComparisonRow, type BatchReport } from '../batch/report.js';
import type { GlossaryTerm } from '../mode/glossary.js';
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
  /**
   * Whether the panel body is currently the pre-run explanation rather than a report.
   *
   * Declared **here**, above every function that reads it, rather than beside the functions that
   * use it. `dev/main.ts`'s `boot()` shipped a `let` below its own first use and the page threw
   * `Cannot access … before initialization` on boot's second statement with 2 100 tests green —
   * fourth occurrence in this package. The habit is cheap.
   */
  let showingEmptyState = false;

  for (const building of resources.buildings) {
    ui.building.append(new Option(`${building.name} (${building.id})`, building.id));
  }
  /*
   * **`Name (slug)`, the same form the building picker above already uses.**
   *
   * These two lists used to be the profile ids and nothing else — `eta`, `collective`,
   * `zoned-uppeak` — and a play-tester could not find the dispatcher they were running: the rail
   * beside this tab calls the same twelve *Nearest car*, *Minimum estimated wait*, *Conventional
   * collective*. `eta` in particular is not guessable at all. The name is `profile.name`, which is
   * `data/dispatcher-profiles.json`'s own field and the same one `menu/catalogue.ts` derives the
   * Free Play list from — one source, not a second table in a renderer. The slug stays because it
   * is what a URL, a saved session and a `DECISIONS.md` entry call the thing.
   */
  for (const select of [ui.baseline, ui.candidate]) {
    for (const profile of resources.dispatcherProfiles.profiles) {
      select.append(new Option(`${profile.name} (${profile.id})`, profile.id));
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
    showingEmptyState = false;
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
          `${comparison.candidateProfileName} (${comparison.candidateProfileId}) against ` +
            `${comparison.baselineProfileName} (${comparison.baselineProfileId})`,
          'Every difference below is candidate minus baseline, in that order.',
          'figure-observation',
        ),
      );
      /*
       * **The roll-up, above the rows it rolls up.** Eight metric rows and twelve goal rows with
       * nothing that stitched them together left a reader to reconcile twenty rows to answer their
       * own question after a batch they had waited minutes for. What this row may say, and what it
       * deliberately may not, is `BatchOutcomeSummary`'s docstring: it counts and routes, and the
       * arm ahead stays on the row that earned the right to name one.
       */
      ui.output.append(
        row(
          'what this batch could say',
          comparison.summary.sentence,
          comparison.summary.remedy ?? undefined,
          comparison.summary.remedy === null ? 'figure-observation' : 'figure-warning',
        ),
      );
      drawComparisonRows(comparison.rows);
    }
    drawGoals(goals);
    /*
     * **Last, and after everything it explains** — GitHub issue #22.
     *
     * A vocabulary belongs under the sentences that used it rather than above them: a reader who
     * already knows what a paired difference is should not have to scroll past the definition to
     * reach the result, and a reader who does not knows exactly where to look the moment they meet
     * the word. Both reports' terms go in one block because they are one screen.
     */
    drawGlossary([...report.glossary, ...goals.glossary]);
  }

  /**
   * The words this screen used, defined once each — issue #22.
   *
   * ## Three properties, and each one is a rule this repository already had
   *
   * **The plain language leads; it never replaces.** Not one row above is touched: every figure,
   * every sentence and every refusal is byte-identical to what it was before this block existed,
   * which `batchPanel.test.ts` asserts by rendering with and without it and comparing the rest of
   * the tree. § D240's rule 3, one surface over.
   *
   * **The terms are derived, never listed.** `BatchReport.glossary` and `GoalReport.glossary` are
   * `glossaryFor(…)` over the reports' **own emitted text**, so a sentence that stops using a word
   * loses its definition on the same commit — this panel adds no list of its own for that to drift
   * from.
   *
   * **It may not become a ranking.** `mode/glossary.ts` sweeps every `plain` for comparative and
   * ordering language and reworded one entry when it did; nothing here composes new copy, so the
   * only way a ranking could reach this block is through that sweep.
   *
   * Deduplicated by `id` rather than by object identity: both reports return entries **from**
   * `GLOSSARY_TERMS` by reference, so identity would work today and would stop working silently the
   * day a producer maps over them. `figure-observation` because a definition is not a result.
   */
  function drawGlossary(terms: readonly GlossaryTerm[]): void {
    const seen = new Set<string>();
    const shown = terms.filter((entry) => !seen.has(entry.id) && seen.add(entry.id));
    if (shown.length === 0) return;
    ui.output.append(
      row(
        'the words above',
        'What each term on this screen means. Definitions only — nothing here is a result, and ' +
          'nothing here compares two settings.',
        undefined,
        'figure-observation',
      ),
    );
    for (const entry of shown) {
      ui.output.append(row(entry.term, entry.plain, undefined, 'figure-observation'));
    }
  }

  /**
   * The rows, with an identical explanation printed **once**.
   *
   * Found by driving the shipped default: one replication in fifty saturates at Chancery House, so
   * all three estimate rows suppress, and each carried the *same* 624-character paragraph — the
   * same wall of text three times, with the run's own saturation quote a fourth time on the arm
   * row above. A play-tester reported it as looking like a rendering bug, and they were reading it
   * correctly: repetition on that scale is a worse way of hiding a fact than a blank would be.
   *
   * This is `firstReason`'s rule one level up, and it is the same rule: **R3 requires the reason to
   * be shown; it does not require it three times.** The note is drawn on the first row that has it
   * and every later row with a byte-identical note is pointed at that one by name, so nothing is
   * lost and the reason is still one glance away. Two rows whose notes merely resemble each other
   * — the two energy rows, whose arithmetic differs — are untouched, because the dedupe is on
   * exact equality rather than on a similarity somebody tuned.
   */
  function drawComparisonRows(rows: readonly BatchComparisonRow[]): void {
    const seen = new Map<string, string>();
    for (const item of rows) {
      const first = seen.get(item.note);
      if (first === undefined) {
        if (item.note !== '') seen.set(item.note, item.label);
        ui.output.append(row(item.label, item.sentence, item.note, verdictClass(item)));
        continue;
      }
      ui.output.append(
        row(
          item.label,
          item.sentence,
          `The same reason as “${first}” above, in the same words.`,
          verdictClass(item),
        ),
      );
    }
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

  /* ------------------------------------------------------------------ *
   * Before anything has run
   * ------------------------------------------------------------------ */

  /**
   * What this tab is, before there is a result to show — and it is the tab that had nothing.
   *
   * The Day report ends by sending a reader here in as many words: *"Take it to Compare … it is the
   * only surface here allowed to say one beat the other."* A play-tester followed that instruction
   * and arrived at one toolbar row over an empty black panel. The complete text of the tab before
   * you press anything was the dropdown options and four control labels: no title, no sentence, no
   * placeholder, **and no verb** — nothing said a batch has to be *started*, so the panel read as
   * broken or still loading.
   *
   * The Lab tab beside it opens on a `teaches` paragraph. This is the same treatment.
   *
   * Two things here are deliberate rather than obvious:
   *
   * - **The cost line is derived and live.** `2 arms × 50 replications = 100 simulations` is
   *   arithmetic on the form, redrawn on every change, so it cannot go stale the way a written
   *   *"this takes about two minutes"* would when somebody types 200. What it does **not** claim is
   *   a wall-clock estimate: this package has no measurement of the reader's machine, and a
   *   fabricated number is exactly the thing the rest of this file exists to refuse.
   * - **The demand field is explained here**, because its placeholder is the word `profile` in a
   *   numeric-looking box and nothing on screen said that blank means *the building's own traffic*.
   */
  function drawEmptyState(): void {
    ui.output.replaceChildren();
    ui.output.append(
      row(
        'what Compare is for',
        'A batch runs the same shift over and over, feeds both dispatchers the identical ' +
          'passengers, and reports the difference between them with a confidence interval.',
        'One run cannot tell you a dispatcher is better — the same building on a different seed ' +
          'swings further than most dispatchers do. This is the one screen in the product allowed ' +
          'to say one beat the other, and it answers “no difference this batch can resolve” ' +
          'whenever the interval includes zero.',
        'figure-observation',
      ),
      row(
        'baseline and candidate',
        'baseline is what you are comparing against — usually the dispatcher you have been ' +
          'running. candidate is the change you want to test.',
        'Every difference below is stated candidate minus baseline, in that order, so a negative ' +
          'figure means the candidate’s number is the smaller one.',
        'figure-observation',
      ),
      costRow(),
      row(
        'demand %pop/5 min',
        'Leave it blank and the batch runs the building’s own traffic profile. A number here ' +
          'overrides that: the percentage of the building’s population arriving every 5 minutes.',
        'It is the lever to reach for when a batch comes back saying it has no average wait to ' +
          'compare — that means a run’s queues never stopped growing, and lowering the load is ' +
          'what fixes it.',
        'figure-observation',
      ),
      row(
        'to begin',
        'Press Run batch.',
        'Nothing is computed until you do. The page stays yours while it runs — the stage in the ' +
          'Simulation tab keeps moving — and Cancel stops it, which reports nothing, because a ' +
          'stopped batch has no result.',
        'figure-observation',
      ),
    );
  }

  /** The size of the job the form currently describes. Arithmetic, redrawn on every change. */
  function costRow(): HTMLElement {
    const replications = Number(ui.replications.value);
    const durationS = Number(ui.duration.value);
    const arms = 2;
    const simulations = Number.isSafeInteger(replications) ? arms * replications : 0;
    const buildingLabel =
      ui.building.options[ui.building.selectedIndex]?.text ?? ui.building.value;
    const minutes = Number.isFinite(durationS) ? Math.round(durationS / 60) : 0;
    return row(
      'what Run batch will do',
      `${buildingLabel} · ${String(arms)} dispatchers × ${String(replications)} replications = ` +
        `${String(simulations)} simulations · ${String(durationS)} simulated seconds each ` +
        `(${String(minutes)} min of building time)`,
      'duration and the shift window are in simulated seconds, not real ones. This is minutes of ' +
        'work rather than seconds; the progress bar counts the simulations above. The project ' +
        'budgets 50–200 replications, and the report says so when you leave that range.',
      'figure-observation',
    );
  }

  /**
   * Redraw the cost line as the reader moves a control — the standing *move it and watch it
   * change* requirement, pointed at a display rather than at a run.
   *
   * Only while the panel is showing the empty state: once a report is on screen, a control the
   * reader has moved describes a batch they have not run yet, and overwriting the result they are
   * reading with a preview of a different one is worse than saying nothing.
   */
  function refreshEmptyState(): void {
    if (!showingEmptyState) return;
    drawEmptyState();
  }

  for (const control of [ui.building, ui.baseline, ui.candidate]) {
    control.addEventListener('change', refreshEmptyState);
  }
  for (const control of [ui.duration, ui.replications, ui.demand, ui.seed]) {
    control.addEventListener('input', refreshEmptyState);
    control.addEventListener('change', refreshEmptyState);
  }

  ui.run.addEventListener('click', start);
  ui.cancel.addEventListener('click', () => {
    stopWorker();
    setRunning(false);
    ui.progress.hidden = true;
    ui.status.textContent = 'cancelled — a stopped batch has no result, so nothing is reported.';
    showingEmptyState = true;
    drawEmptyState();
  });

  setRunning(false);
  ui.progress.hidden = true;
  showingEmptyState = true;
  drawEmptyState();

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
