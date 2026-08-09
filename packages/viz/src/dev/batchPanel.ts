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
 * | traffic band | which point of the building's *own* declared arrival-rate range a batch runs at, and the thing that makes the shipped default report anything at all — see {@link mountBatchPanel}'s `demandLevelRow` for the criterion, which was written before any interval was looked at |
 * | Cancel | the only honest form of cancellation, because a replication cannot be interrupted: it terminates the worker, and a terminated batch reports nothing |
 *
 * ## The interval is drawn, and the prose is all still here — issue #119
 *
 * *"This is a product whose central claim is a confidence interval that excludes zero, and it never
 * draws one."* It does now: one bar per measure on a zero line, filled when the interval clears it
 * and hollow with the zero line crossing it when it does not, captioned in words because the colour
 * is the second signal. The geometry is `batch/intervalPlot.ts`, which authors no sentence; the
 * sentences are here, where this panel's wording already lives.
 *
 * **Not one word of the report was cut.** The ~700 words of justification per verdict moved into a
 * `<details>` beside the row they justify, and the report's own order was inverted so the answer,
 * the pairs the complete-case rule dropped, and what a saturated batch can still say arrive before
 * the provenance rather than four paragraphs after it. A surface that said *less* would have failed
 * the thing it was fixing — the complaint was never that the prose was wrong.
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

import type { DemandLevel } from '@elevator-sim/core/browser';

import type { BatchRequest, BatchWorkerMessage, BatchWorkerRequest } from '../batch/types.js';
import { intervalPlotFor, type IntervalPlot } from '../batch/intervalPlot.js';
import { batchReport, type BatchComparisonRow, type BatchReport } from '../batch/report.js';
import type { GlossaryTerm } from '../mode/glossary.js';
import { goalReport, type GoalReport, type GoalReportRow } from '../scenario/goalReport.js';
import type { BrowserResources } from './data.js';
import {
  PREFERRED_BATCH_BASELINE,
  PREFERRED_BATCH_CANDIDATE,
  preferredId,
} from './defaults.js';

export interface BatchPanelElements {
  readonly building: HTMLSelectElement;
  readonly baseline: HTMLSelectElement;
  readonly candidate: HTMLSelectElement;
  readonly duration: HTMLInputElement;
  readonly seed: HTMLInputElement;
  readonly replications: HTMLInputElement;
  readonly demand: HTMLInputElement;
  /**
   * Which point of the building's own declared arrival-rate band to run at — issue #119.
   *
   * A `<select>` over `min | typical | max` rather than a fourth number, because the three points
   * are authored per building in `data/traffic-profiles.json` and a number typed here would be one
   * building's answer applied to whichever building the panel is showing.
   */
  readonly demandLevel: HTMLSelectElement;
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
    const found = preferredId(preferred, resources.dispatcherProfiles.profiles);
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
      ui.demandLevel,
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
      demandLevel: demandLevelFromForm(),
    };
  }

  /**
   * The band point the select names, or `undefined` for a value this build does not know.
   *
   * `undefined` rather than a fallback to `typical`: core's own `TRAFFIC_DEFAULTS.demandLevel` is
   * `typical`, so an omitted field and a typed `'typical'` run the same simulation, and passing
   * `undefined` keeps a request from asserting a level the reader did not choose. The guard is
   * against a hand-edited `index.html`, which is the only way a fourth option reaches this select.
   */
  function demandLevelFromForm(): DemandLevel | undefined {
    const value = ui.demandLevel.value;
    return value === 'min' || value === 'typical' || value === 'max' ? value : undefined;
  }

  /**
   * The arrival rate the current form actually runs at, in %pop/5 min — or `null` when unknown.
   *
   * Needed by the remedy button, which has to *lower* something and cannot lower a blank. A typed
   * rate is the answer when there is one; otherwise it is the selected building's own profile at
   * the selected band point, which is exactly what core will read
   * (`config.arrivalRatePctPop5min ?? profile.arrivalRatePctPop5min[level]`) — the same precedence,
   * not a second guess at it.
   *
   * `null` when the building names a profile this build's `data/` does not carry, which the config
   * layer already warns about; a remedy that invented a number there would be worse than a button
   * that is not offered.
   */
  function effectiveRatePctPop5min(): number | null {
    const typed = ui.demand.value.trim();
    if (typed !== '') {
      const value = Number(typed);
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    const building = resources.buildings.find((entry) => entry.id === ui.building.value);
    if (building === undefined) return null;
    const profile = resources.trafficProfiles.profiles.find(
      (entry) => entry.id === building.trafficProfile,
    );
    if (profile === undefined) return null;
    const level = demandLevelFromForm() ?? 'typical';
    const rate = profile.arrivalRatePctPop5min[level];
    return Number.isFinite(rate) ? rate : null;
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

  function row(
    label: string,
    value: string,
    note: string | undefined,
    cls: string,
    extra?: HTMLElement,
  ): HTMLElement {
    const node = doc.createElement('div');
    node.className = `figure ${cls}`;
    const labelNode = doc.createElement('span');
    labelNode.className = 'figure-label';
    labelNode.textContent = `${label} `;
    const valueNode = doc.createElement('span');
    valueNode.className = 'figure-value';
    valueNode.textContent = value;
    node.append(labelNode, valueNode);
    if (extra !== undefined) node.append(extra);
    if (note !== undefined) {
      const noteNode = doc.createElement('p');
      noteNode.className = 'figure-note';
      noteNode.textContent = note;
      node.append(noteNode);
    }
    return node;
  }

  /**
   * A row whose reason is behind a disclosure, and whose interval is drawn above it — issue #119.
   *
   * **Every word is kept.** The note is the same string `batch/report.ts` produced, in a `<details>`
   * rather than in a `<p>`: *"The statistics are exemplary … Keep every word"*, and the complaint
   * was never that the prose was wrong but that around seven hundred words of it arrived before the
   * one spatial fact a reader wanted. So the fact is drawn, the sentence stays open, and the
   * arithmetic behind both is one click away and still on the page for anybody who reads with the
   * disclosures expanded — `<details>` keeps its content in the accessible tree and in a text
   * selection either way, which a tooltip would not.
   *
   * The `<summary>` is not the word *why* on its own. A control whose label does not say what it
   * opens is the shape this panel has already been caught shipping once — see `drawEmptyState`'s
   * *"and no verb"* — so it names the row it belongs to.
   */
  function comparisonRow(item: BatchComparisonRow, note: string): HTMLElement {
    const node = doc.createElement('div');
    node.className = `figure ${verdictClass(item)}`;
    const labelNode = doc.createElement('span');
    labelNode.className = 'figure-label';
    labelNode.textContent = `${item.label} `;
    const valueNode = doc.createElement('span');
    valueNode.className = 'figure-value';
    valueNode.textContent = item.sentence;
    node.append(labelNode, valueNode);

    const plot = intervalPlotFor(item);
    if (plot !== null) node.append(plotNode(item, plot));

    if (note !== '') {
      const details = doc.createElement('details');
      details.className = 'figure-why';
      const summary = doc.createElement('summary');
      summary.textContent = `why — the arithmetic behind ${item.label}`;
      const noteNode = doc.createElement('p');
      noteNode.className = 'figure-note';
      noteNode.textContent = note;
      details.append(summary, noteNode);
      node.append(details);
    }
    return node;
  }

  /**
   * The remedy, as a button — issue #119 item 5.
   *
   * *"The text already identifies the lever … it just isn't clickable."* `remedyFor` names lowering
   * `demand %pop/5 min` as the answer to a suppressed row, and a reader then had to work out what
   * the current demand **was** — which, on a blank field, is a number written in
   * `data/traffic-profiles.json` under a profile id the panel does not show.
   * {@link effectiveRatePctPop5min} resolves it by core's own precedence and the button writes the
   * result back, so the field stops being blank and the reader can see what they are now running.
   *
   * **10 %, and it is a step rather than a target.** Nothing here searches for a demand that makes
   * the batch cooperate: it is one step down, it re-runs once, and if the batch is still suppressed
   * the reader presses it again. A control that swept until the rows filled in would be choosing
   * the outcome, which is the one thing `remedyFor` refuses to teach.
   *
   * Not offered when the rate cannot be resolved — see {@link effectiveRatePctPop5min} — because a
   * button that lowers an unknown number by a tenth has nothing to write.
   */
  function remedyControl(): HTMLElement | undefined {
    const rate = effectiveRatePctPop5min();
    if (rate === null) return undefined;
    const next = Math.round(rate * 0.9 * 10) / 10;
    if (next <= 0) return undefined;
    const wrap = doc.createElement('p');
    wrap.className = 'figure-remedy';
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'remedy-button';
    button.textContent = `Drop the load 10 % to ${next.toFixed(1)} %pop/5 min and re-run`;
    button.addEventListener('click', () => {
      ui.demand.value = next.toFixed(1);
      /*
       * `input`, dispatched rather than assumed. The demand field's own listeners redraw the
       * pre-flight cost line, and a value written by code fires nothing on its own — the standing
       * *move the control and watch it change* rule applies to a control this file moves.
       */
      ui.demand.dispatchEvent(new Event('input', { bubbles: true }));
      start();
    });
    wrap.append(button);
    return wrap;
  }

  /**
   * The interval, drawn — issue #119's highest-value item, and the thing this product never had.
   *
   * Percentage-positioned `<div>`s rather than an `<svg>`, deliberately. The plot has to be the
   * width of a panel nobody has measured, and the honest ways to do that in SVG are a non-uniform
   * `preserveAspectRatio` — which stretches a mean marker into a smear and a zero tick into a band
   * — or a viewBox in pixels this file does not know. CSS percentages are exactly the arithmetic
   * {@link intervalPlotFor} already returns, so the geometry crosses no second coordinate system.
   *
   * **Three signals, and the words are the first.** `index.html`'s own rule for these classes:
   * *"the colour is a second signal."* So the bar's disposition is carried by its caption text, by
   * its class, and by the shape it draws — a filled bar clear of the zero line when the interval
   * excludes zero, an outlined bar with the zero line **crossing it** when it does not. A reader
   * who sees no colour at all still sees a line through a box or beside it, and a reader using a
   * screen reader gets the whole row in one `aria-label`.
   *
   * The end labels are the plot's own domain, in the row's own unit, because each row is scaled to
   * its own interval and a bar drawn to a private scale invites exactly one misreading: comparing
   * its length with the bar above it.
   */
  function plotNode(item: BatchComparisonRow, plot: IntervalPlot): HTMLElement {
    const caption = captionFor(item, plot.excludesZero);
    const text =
      `${signedFixed(plot.mean, plot.places)}${plot.unit} ` +
      `[${signedFixed(plot.lower, plot.places)}, ${signedFixed(plot.upper, plot.places)}]`;
    const node = doc.createElement('div');
    node.className = 'iv';
    node.setAttribute('role', 'img');
    node.setAttribute(
      'aria-label',
      `${plot.label}, candidate minus baseline: ${text}. ${caption}.`,
    );

    const track = doc.createElement('div');
    track.className = 'iv-track';
    const zero = doc.createElement('div');
    zero.className = 'iv-zero';
    zero.style.left = percent(plot.zeroAt);
    const bar = doc.createElement('div');
    bar.className = `iv-bar ${barClass(plot)}`;
    bar.style.left = percent(plot.lowerAt);
    /*
     * A floor of a fraction of a percent, not zero. A degenerate interval — `unservedFraction`
     * comes back exactly `[0, 0]` on four shipped buildings — has a true width of zero, and a box
     * of zero width is a box that is not there. The measurement happened and the reader is entitled
     * to see that it landed on the line rather than that the row went missing.
     */
    bar.style.width = `${Math.max(0.6, (plot.upperAt - plot.lowerAt) * 100).toFixed(2)}%`;
    const mean = doc.createElement('div');
    mean.className = 'iv-mean';
    mean.style.left = percent(plot.meanAt);
    track.append(bar, zero, mean);

    const scale = doc.createElement('div');
    scale.className = 'iv-scale';
    const low = doc.createElement('span');
    low.textContent = `${signedFixed(plot.domainLow, plot.places)}${plot.unit}`;
    const captionNode = doc.createElement('span');
    captionNode.className = `iv-caption ${plot.excludesZero ? 'iv-caption-clear' : 'iv-caption-straddle'}`;
    captionNode.textContent = caption;
    const high = doc.createElement('span');
    high.textContent = `${signedFixed(plot.domainHigh, plot.places)}${plot.unit}`;
    scale.append(low, captionNode, high);

    node.append(track, scale);
    return node;
  }

  /**
   * The words under the bar — the row's disposition in a phrase, and never a winner.
   *
   * Keyed on the **verdict** rather than on the geometry in every case but the plain one, which is
   * how an axis whose interval clears zero and an under-budget interval that clears zero both come
   * out saying that no arm is named. R11 and § D171 are both *refusals over a bar that looks like a
   * win*, and a caption inferred from `upper < 0` would state the win the row withheld.
   *
   * The full reason stays on `BatchComparisonRow.note` behind the *why* disclosure; this is the
   * line that has to be true at a glance, and it is the reason the picture is not colour-only.
   */
  function captionFor(item: BatchComparisonRow, excludesZero: boolean): string {
    switch (item.verdict) {
      case 'shown':
        return excludesZero
          ? 'excludes zero — an axis, so no arm is named ahead'
          : 'contains zero — an axis, so no arm is named ahead';
      case 'under-budget':
        return 'excludes zero — below the replication budget, so no arm is named ahead';
      case 'resolved':
        return 'excludes zero — this row names the arm ahead';
      case 'unresolved':
        return excludesZero
          ? 'no interval could be formed'
          : 'contains zero — not ordered by this batch';
      case 'suppressed':
      case 'unmeasured':
        return 'no interval';
    }
  }

  /**
   * The bar's class from the row's **disposition**, never from its geometry alone.
   *
   * `iv-bar-axis` before `iv-bar-clear`, because an energy row whose interval excludes zero is
   * still a row that names no arm — R11 — and giving it the same fill as a resolved wait row would
   * put the strongest visual claim on the axis this project refuses to rank.
   */
  function barClass(plot: IntervalPlot): string {
    if (!plot.excludesZero) return 'iv-bar-straddle';
    return plot.ranks ? 'iv-bar-clear' : 'iv-bar-axis';
  }

  function percent(fraction: number): string {
    return `${(fraction * 100).toFixed(2)}%`;
  }

  function signedFixed(value: number, places: number): string {
    return `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(places)}`;
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

  /**
   * The report, **answer first** — issue #119 items 2 and 3.
   *
   * The order below is the whole of those two items, and it used to be the other way round. A
   * reader who had waited out a hundred simulations met the batch's provenance, then its CRN audit,
   * then two arm summaries, then a heading, and *then* the roll-up — so *"1 of 50 pairs dropped"*
   * arrived four paragraphs after the screen it explains, and *"indistinguishable at n = 50"*
   * arrived after three screens of preamble that read as an error report.
   *
   * So: what the batch answered, what it cost, what it can still say, the rows, and only then the
   * provenance that lets somebody else reproduce it. Nothing is removed — the seed row, the trace
   * key, the CRN sentence and both arm summaries are byte-identical and still on the page — and
   * that is the point of moving rather than cutting: this is a legibility change, not a
   * simplification, and a surface that says less would have failed the thing it was fixing.
   */
  function draw(report: BatchReport, goals: GoalReport): void {
    ui.output.replaceChildren();
    for (const comparison of report.comparisons) {
      ui.output.append(
        row(
          'the answer',
          comparison.summary.answer,
          `${comparison.candidateProfileName} (${comparison.candidateProfileId}) against ` +
            `${comparison.baselineProfileName} (${comparison.baselineProfileId}). Every ` +
            'difference below is candidate minus baseline, in that order, so a bar left of the ' +
            'zero line means the candidate’s number is the smaller one.',
          comparison.summary.resolved.length > 0 ? 'figure-estimate' : 'figure-observation',
        ),
      );
      /*
       * **The cost of the batch, before the rows it emptied** — item 3, and it is one line where
       * the same fact used to be a 90-word note under the third row that lost it.
       */
      if (comparison.summary.droppedSentence !== null) {
        ui.output.append(
          row('pairs dropped', comparison.summary.droppedSentence, undefined, 'figure-warning'),
        );
      }
      /*
       * **What a batch with no mean can still say** — item 2, and the sentence `packages/cli` has
       * printed since it was written. It is an observation over runs, so the complete-case rule
       * that empties the three wait rows leaves it standing.
       */
      if (comparison.summary.capacityFinding !== null) {
        ui.output.append(
          row('what can still be said', comparison.summary.capacityFinding, undefined, 'figure-observation'),
        );
      }
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
          comparison.summary.remedy === null ? undefined : remedyControl(),
        ),
      );
      drawComparisonRows(comparison.rows);
    }
    /*
     * **Provenance, after the result rather than before it.** Seed, trace key, CRN audit and both
     * arm summaries, unchanged and unabridged — what moved is where a reader meets them.
     */
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
        ui.output.append(comparisonRow(item, item.note));
        continue;
      }
      ui.output.append(
        comparisonRow(item, `The same reason as “${first}” above, in the same words.`),
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
        'Leave it blank and the batch runs the building’s own traffic profile at the band point ' +
          'beside it. A number here overrides both: the percentage of the building’s population ' +
          'arriving every 5 minutes.',
        'It is the lever to reach for when a batch comes back saying it has no average wait to ' +
          'compare — that means a run’s queues never stopped growing, and lowering the load is ' +
          'what fixes it. When that happens the batch offers the drop as a button rather than ' +
          'as a paragraph.',
        'figure-observation',
      ),
      demandLevelRow(),
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

  /**
   * What the band-point control does, and **the grounds for the value it opens on** — issue #119.
   *
   * ## The default is `min`, and the reason is not its verdict
   *
   * Issue #119's first finding is that the shipped default answered nothing: at Chancery House's
   * own traffic, **1 of 50** replications saturates, the complete-case rule correctly nullifies all
   * three wait metrics, and a player's first batch reports zero usable results out of eight
   * measures. The issue's own remedy — *"a run at a slightly lower demand would do it"* — is the
   * trap, because *choosing* a load because it returns a winner is choosing the answer, and this
   * repository has refused its own learned-control feature three times on exactly that ground.
   *
   * So the criterion was **written down and applied mechanically, before any interval was looked
   * at**: the default is the largest arrival rate on a 1 %-step grid at which all 50 paired
   * replications stand behind a mean on both shipped reference arms, at Chancery House, seed
   * 20260729, 900 s, n = 50, `collective` against `eta`. That is a criterion about what the
   * apparatus can *report*, not about what it reports. Swept 16 → 3: 16 loses one replication, and
   * every rate from 15 down loses none. The criterion therefore selects **15**.
   *
   * **15 is `office-prestige`'s own declared `min`**, which is why the control is a band point
   * rather than the number 15 typed into the demand box: `{ min: 15, typical: 16, max: 17 }` is
   * authored in `data/traffic-profiles.json`, every profile declares one, and a *level* survives
   * the panel inheriting a different building where a number would not. Nothing is invented and
   * nothing is tuned — the batch runs the lightest traffic the reference data says this building
   * sees.
   *
   * ## What it returns, stated rather than implied
   *
   * At that default the batch answers **all eight measures**: door-to-door time separates the two
   * (`+3.933 s [+1.626, +6.241]`, and the arm it names ahead is the **baseline**), five come back
   * with an interval containing zero — which is an answer — and two are energy axes, shown and
   * never ranked. Zero rows are suppressed and zero are unmeasured.
   *
   * The one separating row was **not** allowed to stand on its interval alone. § D151's resolution
   * probe was re-run at this cell on TTD at a disjoint seed (987654321), n = 50, 80 % power against
   * a two-sided 95 % paired-t: the near-neighbour limit is **2.499 s** and the structural limit
   * **2.417 s**, so the 3.933 s effect clears both. What does *not* clear them is the interval's own
   * lower bound of 1.626 s, and that is said here rather than smoothed over: the effect is
   * resolvable at this cell and the bottom of its interval is not.
   *
   * ## What it is not
   *
   * `min` does not make every building reportable, and the panel never claims it does. Measured at
   * `min` across all eight shipped buildings on the same seed, Chancery House is the only one whose
   * fifty pairs all stand behind a mean; Midtown Office saturates in 50 of 50 either way. That is
   * the honest state of the apparatus and it is what the suppressed rows are for.
   */
  function demandLevelRow(): HTMLElement {
    const rate = effectiveRatePctPop5min();
    const level = demandLevelFromForm() ?? 'typical';
    const typed = ui.demand.value.trim() !== '';
    return row(
      'traffic band',
      typed
        ? `the demand field overrides the band: this batch runs at ${ui.demand.value.trim()} %pop/5 min.`
        : `the ${level} of this building’s own profile` +
          `${rate === null ? '' : ` — ${rate.toFixed(1)} %pop/5 min`}`,
      'Every traffic profile declares a min, a typical and a max arrival rate. This picks which ' +
        'one to run, and it opens on min because that is the lightest traffic the reference data ' +
        'says the building sees — the point at which the fewest runs saturate, and so the point ' +
        'at which a batch has the most means it can stand behind. It is not a guarantee: a ' +
        'building can saturate at its own minimum, and when it does the rows below say so rather ' +
        'than quoting a number.',
      'figure-observation',
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

  for (const control of [ui.building, ui.baseline, ui.candidate, ui.demandLevel]) {
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

  function prefill(): void {
    if (prefilled) return;
    prefilled = true;
    const from = options.inherit();
    if ([...ui.building.options].some((option) => option.value === from.buildingId)) {
      ui.building.value = from.buildingId;
    }
    if (from.seed.trim() !== '') ui.seed.value = from.seed.trim();
    if (from.durationS.trim() !== '') ui.duration.value = from.durationS.trim();
    // The pre-flight lines quote the building, the cost and the band point, and all three have
    // just moved. Without this the panel says *Chancery House* over a form set to something else.
    refreshEmptyState();
  }

  /*
   * **The panel prefills itself when it is shown, because nothing else was doing it** — issue #119
   * item 7, and the finding is worse than the issue reported.
   *
   * *"Playing Garden Apartments, opening Compare offers Chancery House."* The cause is not a
   * missing feature: `mountBatchPanel` has returned a {@link BatchPanelHandle} with a `prefill`
   * since it was written, `options.inherit` reads the viewer's live building, seed and horizon, and
   * **no code anywhere in the tree calls either of them**. `dev/main.ts` calls `mountBatchPanel`
   * and discards the handle; a sweep of `packages/viz/src` for `prefill` returns this file and
   * nothing else. A configurable behaviour, unit-clean, wired at one end and called from nowhere —
   * the shape `docs/05`'s standing requirement is written about, and the reason the rule is *"name
   * the non-test caller"* rather than *"is it reachable"*.
   *
   * The caller it now has is the panel's own visibility. The Compare tab is a `[role="tabpanel"]`
   * whose `hidden` attribute the shell toggles, so an observer on that attribute is the one signal
   * available from inside this module — the alternative is a call in `dev/main.ts`, which another
   * lane owns. It fires once, by the `prefilled` latch, which is the contract `prefill` already
   * documented: *"Prefills from the viewer, once per visit"*, so a reader who then picks a
   * different building keeps their choice.
   *
   * `prefill` stays on the handle. A shell that wants to drive this explicitly should, and the
   * observer is a floor rather than a ceiling.
   */
  const panel = ui.output.closest('[role="tabpanel"]');
  if (panel !== null && typeof MutationObserver === 'function') {
    if (!panel.hasAttribute('hidden')) prefill();
    const observer = new MutationObserver(() => {
      if (!panel.hasAttribute('hidden')) prefill();
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  }

  return { prefill };
}
