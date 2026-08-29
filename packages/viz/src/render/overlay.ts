/**
 * The live metrics panel, as a **view** rather than as a drawing — `docs/21` § 3.4.
 *
 * Its data comes from `src/frame/overlay.ts`, which is pure and tested on its own; this file turns
 * it into the rows a renderer draws. The split is the same one `layout.ts`/`canvas.ts` already
 * make, and it exists for the same reason: `overlayAt` being right is not the same claim as the
 * panel *showing what `overlayAt` returned*, and this package has already shipped a frame seven of
 * whose eight fields could be replaced by constants with the suite still green. So every value
 * below appears in exactly one field of {@link OverlayView}, and `overlayRender.test.ts` asserts
 * each one against a recomputation rather than against a literal.
 *
 * ## Why this stopped being a `fillText` loop — issue #115 § 6, and the half § D316 left open
 *
 * The panel was drawn into the stage's bitmap. § D316 closed the *clipping* — `render/layout.ts`
 * refused to hand over a panel narrower than its own longest mandatory line — but it could not
 * close the thing that let the clipping ship for a wave: **no DOM check could see the panel at
 * all**. Four strings overhung the border on the viewer's own canvas and every automated tier was
 * green, because a string inside a bitmap has no `scrollWidth`.
 *
 * `docs/21` § 2.3 states the rule this file now answers to: *the picture of the building stays
 * canvas; words about the run prefer DOM.* So the panel is a **view model** here and a card in
 * `dev/main.ts#drawLiveMetrics` there, and the overflow question is asked of a real browser over
 * all eight shipped buildings in both registers (`dev/liveMetrics.browser.test.ts`) rather than
 * computed from an assumed character advance. That is a stronger check than the arithmetic it
 * replaces, which is the only ground on which § D316's `MIN_OVERLAY_WIDTH_PX` was allowed to go.
 *
 * ## What the move deliberately does *not* change
 *
 * Both registers survive, word for word ({@link ENGINEER_WORDS}, {@link CASUAL_WORDS}), and so
 * does every refusal. § D299's test binds: a change to Engineer may make it easier to use, it may
 * not make it say less. What it does drop is the three pieces of arithmetic that only a fixed-size
 * bitmap needed — the row allocator, the greedy wrap and the *showing 3 of 12 banks* line — and
 * each of those is a **truncation** disappearing, never a fact.
 *
 * ## The rule the panel enforces
 *
 * A suppressed statistic is **replaced by its reason**, never by a dash and never by a number.
 * `CLAUDE.md` says not to report a mean for a system whose queues grow without bound;
 * `UX.md` `RV-T5`/`RV-06` add that the running figure must never be labelled "AWT". Both are now
 * structural in the **type**: {@link OverlayEstimate}'s refused arm carries no `value` field, so a
 * renderer cannot draw a number beside a refusal even by mistake — the drawn version enforced that
 * by which branch it took, which is a promise rather than a shape.
 */

import type { OverlayMetrics } from '../frame/overlay.js';
import type { Frame } from '../contract/types.js';
import { casualRefusalFor, SUPPRESSION_REASON_PENDING } from '../mode/disclosure.js';
import type { ViewMode } from '../mode/types.js';
import type { WaitBandBasis } from '../live/types.js';
import type { Theme } from './canvas.js';

/** Load factor at which a car is "full" — CLAUDE.md's 80 % fill rule, not a limit. */
export const LOAD_FULL = 0.8;
/** Load factor at which the overload alarm sounds. `UX.md` RV-14. Above 1, deliberately. */
export const LOAD_ALARM = 1.1;

/**
 * The widest load factor the bar's track represents.
 *
 * The track is scaled so `LOAD_ALARM` is inside it, and grows further if a car is heavier still.
 * A track that stopped at 1.0 would clip an overloaded car to "completely full", which is
 * exactly what `RV-14` forbids: *the bar does not silently clip at 1*.
 */
export function loadTrackMax(cars: readonly { readonly loadFactor: number }[]): number {
  return cars.reduce((max, car) => Math.max(max, car.loadFactor), LOAD_ALARM);
}

/**
 * The panel's labels in the two registers — issue #100.
 *
 * ## Why this is a table and not four ternaries at the draw sites
 *
 * A reader of this file should be able to see the whole panel's vocabulary in one place, and a
 * reviewer checking `docs/21` § 1.2's ledger row — *`LIVE METRICS` in two registers* — should be
 * able to check it against one object rather than against nine call sites. `overlayRender.test.ts`
 * asserts **every** string of both registers reaches the view, rather than the ones somebody
 * remembered to check.
 *
 * ## The labels used to be padded, and the padding is gone with the bitmap
 *
 * Each of the first three carried trailing spaces (`'waiting now     '`), because the panel drew
 * `label + value` into a **fixed-width column** and this file had no `measureText`. That made a
 * wording change a *layout* change, which is issue #115 § 6 in one sentence. The card is a grid
 * now, so the column is the browser's job and the words are only words. Nothing else about them
 * moved: this is the same nine strings in each register, trimmed.
 *
 * ## The one label that is the same in both, and the one that could have been made false
 *
 * `longest wait` is byte-identical in the two registers, and it is in this table anyway: leaving
 * it out would have made the table read as *the words that differ*, which is a different and
 * smaller claim than *the words the panel draws*.
 *
 * `boarded (window)` is the one that could have been made plainer by making it wrong. It is a count
 * over the rolling window, so Casual keeps the basis — *(5min)* — rather than dropping it: a count
 * over five minutes drawn as a count over the day would be a false figure, not a friendlier one.
 * The same restraint decides the window caption below.
 *
 * ## The one that *was* made false by dropping the basis — GitHub issue #297
 *
 * {@link noneInWindow} used to read `nothing served yet` / `nobody carried yet`, and **the word
 * *yet* is a claim about the run to date** while the state that draws it is emptiness of the
 * *window*. `overlayAt` fills its `banks` map only from legs whose `boardedAt` falls inside
 * `[max(startedAt, t − windowS), t]`, so a run that carried people and then had a quiet five
 * minutes drew a sentence saying nobody had ever been carried — beside `dev/leftRail.ts`'s
 * `carried today N`, on the same screen, counting the very people it denied.
 *
 * Measured on `garden-apartments`, 3 600 s, seed 20 260 827, sampling every playhead at 10 s:
 * **44 of 361 playheads — 12.2 % of the run** — drew it while the run had carried somebody. At
 * 1 030 s the panel said `nothing served yet` with seven people already delivered; at 1 760 s,
 * eight, with three more standing at a landing.
 *
 * The fix is the one the neighbouring cells already made: **put the basis on the figure**. It is
 * the same restraint as `boarded (window)` one line up, applied to the sentence rather than to the
 * label, and it is deliberately *not* the other repair the issue allowed — recomputing the
 * sentence over the run. See {@link overlayViewOf} for why that one was rejected.
 *
 * Casual names the span the way `got a car (5min)` names it, and inherits that label's one
 * exposure: both spell `DEFAULT_WINDOW_S` as words. `OverlayOptions.windowS` can override it, and
 * **no shipped caller does** — `dev/main.ts#drawStage`, `honesty/surfaces.ts#buildFrameBundle` and
 * `live/observations.ts#observationsAt` are the three that call `overlayAt` outside a test, and all
 * three take the default. (`drawStage` and not `renderLive`: the latter reaches `overlayAt` only
 * through the former, and a docstring that named it would be the `{@link}` that looks like a caller
 * and is not one.) A caller that ever passes another span has to move both strings, which is why
 * they sit two lines apart.
 */
export const CASUAL_WORDS = Object.freeze({
  title: 'RIGHT NOW',
  waiting: 'people waiting',
  longest: 'longest wait',
  boarded: 'got a car (5min)',
  rollingMean: 'average wait so far',
  byBank: 'BY LIFT GROUP',
  carLoad: 'HOW FULL EACH CAR IS',
  bankSuppressed: 'no average',
  noneInWindow: 'nobody carried in the last 5 min',
});

/** The same nine, as the engineer's panel has always said them. */
export const ENGINEER_WORDS = Object.freeze({
  title: 'LIVE METRICS',
  waiting: 'waiting now',
  longest: 'longest wait',
  boarded: 'boarded (window)',
  rollingMean: 'rolling mean wait',
  byBank: 'BY BANK',
  carLoad: 'CAR LOAD',
  bankSuppressed: 'suppressed',
  noneInWindow: 'nothing served in this window',
});

/** One label-and-value row of the observations block. Both halves are strings by the time they
 * leave this file, so the renderer chooses no format and no rounding. */
export interface OverlayRow {
  readonly label: string;
  /** `'—'` where there is nothing to count yet — never `''`, which `docs/10` R3 rejects. */
  readonly value: string;
}

/**
 * The estimate block, as three arms that cannot be confused for one another.
 *
 * This is `docs/10` § 1 R3 made structural rather than promised. The drawn panel took a branch and
 * *then* was careful not to print a number in the refusing one; here the refusing arm **has no
 * `value` field**, so a renderer that wanted to draw a figure beside `SUPPRESSED` would not compile.
 * `docs/21` L-5's three kinds of absence are the three arms: a figure, a figure with no sample
 * (`—`), and a figure the run refuses.
 */
export type OverlayEstimate =
  | { readonly kind: 'figure'; readonly label: string; readonly value: string }
  | { readonly kind: 'no-sample'; readonly label: string; readonly value: string }
  | {
      readonly kind: 'refused';
      readonly label: string;
      /** `SUPPRESSED`, or Casual's *no average* head — never softer. */
      readonly head: string;
      /** The run's own reason, or the pending sentence before the day has finished. */
      readonly reason: string;
      /**
       * Which window the two strings above fold — `docs/20` defect 3, copied from the producer.
       *
       * Carried onto the view rather than re-derived, for `OverlayMetrics.suppressionBasis`'s own
       * stated reason: the renderer gates on the declaration and the honesty search reads it.
       */
      readonly basis: WaitBandBasis;
    };

/** One bank's row. `mean` is the register's refusal word when the run refuses one. */
export interface OverlayBankRow {
  readonly bankId: string;
  readonly boarded: string;
  readonly mean: string;
  /** Whether {@link mean} is a refusal rather than a figure — KB-15's second signal. */
  readonly refused: boolean;
}

/** One car's row: its label, its load as a figure, and the two fractions the bar is drawn from. */
export interface OverlayCarRow {
  readonly carId: string;
  readonly label: string;
  /** `0.82`, and `0.82 !` above the alarm — KB-15b's glyph, in the string itself. */
  readonly load: string;
  readonly loadFactor: number;
  readonly tone: LoadTone;
  readonly overloaded: boolean;
  /** Share of the track the fill occupies, `0…1`. */
  readonly fillFraction: number;
  /** Where 100 % of rated load sits on a track that extends past it — `RV-14`. */
  readonly fullMarkFraction: number;
}

/** Everything the live metrics card draws, in one register. */
export interface OverlayView {
  readonly title: string;
  /** The window, in each register's own way of saying the same span. */
  readonly window: string;
  readonly observations: readonly OverlayRow[];
  readonly estimate: OverlayEstimate;
  readonly bankHeading: string;
  readonly banks: readonly OverlayBankRow[];
  /**
   * Drawn in place of the bank rows when **no bank answered anything inside the window**.
   *
   * Not *when nobody has been carried yet*, which is what this field's sentence used to say and
   * what issue #297 was: the state is window-scoped and the sentence now says so. See
   * {@link CASUAL_WORDS} for the measurement.
   */
  readonly banksEmpty: string | undefined;
  readonly carHeading: string;
  readonly cars: readonly OverlayCarRow[];
}

/**
 * The panel, as rows.
 *
 * `mode` defaults to `advanced`, so every caller that is describing a run rather than serving a
 * reader — the honesty sweep, `overlayRender.test.ts`, an export — gets the engineer's words. That
 * is `DayReportInput.showEnergyAxis`'s rule and the argument transfers: a default that quietly
 * simplified would have the search measuring a panel the product does not draw.
 *
 * **The mode moves words and it does not move a refusal.** See {@link CASUAL_WORDS} and
 * `mode/disclosure.ts#casualRefusalFor`: a suppressed statistic is still replaced by a refusal,
 * still with no number beside it, in either mode and at either playhead.
 *
 * Pure, and no `Theme`: the card is DOM and takes its colours from the custom properties § 2.2 (2)
 * re-pointed, so a restyle moves the panel with the shell and no code here changes. {@link tone}
 * is the one visual decision that is a *judgement* — the four load bands — and it is carried as a
 * name rather than as a colour for exactly that reason.
 */
export function overlayViewOf(
  metrics: OverlayMetrics,
  frame: Frame,
  mode: ViewMode = 'advanced',
): OverlayView {
  /* Issue #100. One lookup, at the top, so no row below chooses a register of its own. */
  const casual = mode === 'basic';
  const words = casual ? CASUAL_WORDS : ENGINEER_WORDS;
  const trackMax = loadTrackMax(frame.cars);

  return {
    title: words.title,
    /*
     * The window, in each register's own way of saying the same span.
     *
     * Engineer gets the bounds — `window 358–658 s` — because a bound is what a reader checks a
     * figure against. Casual gets the **length**, which is the same fact said the way a person asks
     * it, and it is subtracted rather than assumed: the window is `[max(startedAt, t − windowS), t]`,
     * so early in a run it is genuinely shorter than `windowS` and printing *the last 300 s* there
     * would be a caption describing a window the panel is not showing.
     */
    window: casual
      ? `the last ${(metrics.simTimeS - metrics.windowStartS).toFixed(0)} s`
      : `window ${formatSpan(metrics.windowStartS, metrics.simTimeS)}`,
    /* Observations. Facts about the recording, shown on every run including a saturated one —
       they are how a reader *sees* a queue diverging. */
    observations: [
      { label: words.waiting, value: String(metrics.waitingNow) },
      {
        label: words.longest,
        value:
          metrics.longestCurrentWaitS === undefined
            ? '—'
            : `${metrics.longestCurrentWaitS.toFixed(0)} s`,
      },
      { label: words.boarded, value: `${String(metrics.boardedInWindow)} legs` },
    ],
    estimate: estimateOf(metrics, words.rollingMean, casual),
    bankHeading: words.byBank,
    banks: metrics.banks.map((bank) => ({
      bankId: bank.bankId,
      boarded: `${String(bank.boardedInWindow)} legs`,
      mean: bank.meanWaitS === undefined ? words.bankSuppressed : `${bank.meanWaitS.toFixed(1)} s`,
      refused: bank.meanWaitS === undefined,
    })),
    /*
     * **The empty list says which window is empty** — GitHub issue #297.
     *
     * `metrics.banks` holds one row per bank that answered something inside the window, so an
     * empty list is a fact about the window and never about the run. The sentence is scoped to
     * match, exactly as `boarded (window)` beside it is: at `garden-apartments`, 3 600 s, seed
     * 20 260 827 the old wording drew *nothing served yet* at 44 of 361 sampled playheads on which
     * the run had already carried somebody, under a rail counting them as `carried today`.
     *
     * **The other repair the issue allowed was rejected**, and it is worth saying which. The
     * sentence could have been *computed over the run* — carry a run-scoped served count on
     * `OverlayMetrics` and keep `nothing served yet` for the state where it is true, falling back
     * to a window sentence otherwise. That is a second string per register and a second question
     * for the panel to answer, on a block whose other nineteen cells all answer *what is happening
     * now*; it buys a sharper sentence in the opening minutes of a run and pays for it with a cell
     * whose basis moves under the reader. Naming the basis is this repository's standing fix for
     * two answers to one question, and it is what the neighbouring cells already did.
     */
    banksEmpty: metrics.banks.length === 0 ? words.noneInWindow : undefined,
    carHeading: words.carLoad,
    /* Per-car load. The one place `RV-14`'s "does not silently clip at 1" is testable: the track
       is scaled past the alarm, so an overloaded car draws past the full mark rather than at it. */
    cars: frame.cars.map((car) => ({
      carId: car.carId,
      label: car.label,
      load: `${car.loadFactor.toFixed(2)}${car.loadFactor >= LOAD_ALARM ? ' !' : ''}`,
      loadFactor: car.loadFactor,
      tone: loadTone(car.loadFactor),
      overloaded: car.loadFactor >= LOAD_ALARM,
      fillFraction: Math.min(1, car.loadFactor / trackMax),
      fullMarkFraction: 1 / trackMax,
    })),
  };
}

/**
 * The estimate row's three arms — and the one that may never carry a figure.
 *
 * **What Casual says where the engineer's panel says `SUPPRESSED`** — and the three things it may
 * not be.
 *
 * It may not be **softer**. `SATURATED` is not jargon to be smoothed away; it is the run telling a
 * reader the building could not cope, and *a busy day* is a different and weaker claim. Every
 * candidate `casualRefusalFor` offers says there is **no average**, in those words, before it says
 * anything else.
 *
 * It may not be **narrower than the ground**. `awtIsValid` has five grounds and only one of them is
 * saturation — an empty window and an abandonment rate above 2 % refuse a mean on a run that coped
 * perfectly well — so a line reading *the building could not cope* would be false on three of the
 * five. Both arms are ground-free by construction, and the ground-specific sentence is the one the
 * status line under the canvas carries (`dev/main.ts#transportStatusOf`, which is already
 * mode-aware and already reads `mode/disclosure.ts`'s per-ground wording).
 *
 * And — `docs/20` defect 3 — it may not be **dated wrong**. `NO AVERAGE — A RESULT` is a verdict
 * about the finished day, and it was drawn at every playhead: at 14 % of a Midtown run it sat under
 * a label reading *average wait so far*, over a building whose queues had not formed yet. The
 * register comes from `metrics.suppressionBasis` — the producer's own reading of its clock, never a
 * comparison made here — and the panel withholds exactly as hard in both.
 *
 * The words are **imported, not spelled**, which is GitHub issue #100's argument. `NO_AVERAGE_LEAD`
 * is `render/canvas.ts`'s banner head as well; with two registers to keep in step a local copy is
 * two copies of two sentences.
 *
 * The head is `heads[0]` now rather than *the longest that fits a 210 px panel*. That choice was a
 * bitmap's — three candidate wordings, picked by character arithmetic — and the card has no such
 * budget: it wraps. The remaining candidates are still the vocabulary `casualRefusalFor` owns, and
 * the first is the fullest, so what a Casual reader gets is the **longest** of the three at every
 * width instead of the longest that happened to fit.
 */
function estimateOf(
  metrics: OverlayMetrics,
  label: string,
  casual: boolean,
): OverlayEstimate {
  if (metrics.suppressed) {
    const refusal = casualRefusalFor(metrics.suppressionBasis === 'whole-run');
    return {
      kind: 'refused',
      label,
      head: casual ? (refusal.heads[0] ?? '') : 'SUPPRESSED',
      /*
       * The engineer's arm of the same gate. `core`'s `awtInvalidReason` is a whole-run verdict in
       * past tense, and it was printed at every playhead exactly as Casual's was — see
       * `mode/disclosure.ts#SUPPRESSION_REASON_PENDING` for why fixing one register and not the
       * other would leave the search green on half a screen.
       */
      reason: casual
        ? refusal.reason
        : refusal.basis === 'whole-run'
          ? (metrics.suppressionReason ?? 'no reason given')
          : SUPPRESSION_REASON_PENDING,
      basis: refusal.basis,
    };
  }
  if (metrics.rollingMeanWaitS === undefined) return { kind: 'no-sample', label, value: '—' };
  return { kind: 'figure', label, value: `${metrics.rollingMeanWaitS.toFixed(1)} s` };
}

/**
 * Colour for a load factor. Never the *only* signal — see `KB-15b` and the `!` glyph above.
 *
 * ## The four boundaries, and the one the design handoff did not get
 *
 * `docs/12` § 1.3 M3 asks for the artefact's four steps: `≥ 0.95` red, `≥ 0.8` amber, `> 0.25`
 * blue, else green. Three of the four are taken. **Red stays at {@link LOAD_ALARM} and not at
 * 0.95**, and that refusal is the same rule the rest of this file keeps.
 *
 * `UX.md` RV-14 and `D18` make the overload alarm a *distinct fact* from the 80 % fill rule, and
 * `KB-15b` requires the alarm colour to be accompanied by the `!` glyph at every pitch on every
 * building — `render/canvas.ts` draws it at `loadFactor >= LOAD_ALARM`. Moving the red band down
 * to 0.95 without moving the glyph would put a red car on screen with nothing beside it, which is
 * a colour-only signal for the most serious state a car can be in. Moving the *glyph* down to
 * 0.95 instead would be worse: it would raise a safety alarm on a car that is not overloaded, and
 * `LOAD_ALARM` is 1.1 because a car is not in trouble at rated load.
 *
 * The design's 0.95 is a *prototype's* way of saying "full", and this model already has one: the
 * 80 % fill rule (`CLAUDE.md` § Modeling rules), which is where the amber starts. The step that
 * genuinely was missing — the design's `> 0.25` rather than this function's old `>= 0.5` — is
 * taken, and it is the one that changes what a reader sees most often: a car with three people in
 * it now reads as *working* rather than as *empty*.
 */
export function loadColour(loadFactor: number, theme: Theme): string {
  switch (loadTone(loadFactor)) {
    case 'overloaded':
      return theme.carOverload;
    case 'at-design-load':
      return theme.carHeavy;
    case 'carrying':
      return theme.car;
    case 'room':
      return theme.carLight;
  }
}

/**
 * The four bands, as **names** — the half of {@link loadColour} the DOM card needs.
 *
 * Two renderers now draw a car's load: the stage, which wants a `Theme` colour, and the live
 * metrics card, which wants a custom property so that § 2.2 (2)'s indirection restyles it with no
 * code change. Duplicating the four comparisons would have been a second answer to *when is a car
 * full*, on a boundary this repository has already argued about once (`LOAD_ALARM` against the
 * handoff's 0.95). So the **judgement** is here, once, and each renderer maps the name it gets.
 *
 * The names are the words `index.html`'s stage key already draws beside the four swatches — *car
 * with room*, *carrying a load*, *at design load*, *overloaded* — so the card, the stage and the
 * key cannot disagree about which band a car is in.
 */
export type LoadTone = 'room' | 'carrying' | 'at-design-load' | 'overloaded';

/** Which band a load factor falls in. See {@link loadColour} for why the boundaries are these. */
export function loadTone(loadFactor: number): LoadTone {
  if (loadFactor >= LOAD_ALARM) return 'overloaded';
  if (loadFactor >= LOAD_FULL) return 'at-design-load';
  if (loadFactor > LOAD_OCCUPIED) return 'carrying';
  return 'room';
}

/**
 * The load at which a car stops reading as empty — `docs/12` § 1.3 M3, the artefact's `> 0.25`.
 *
 * Exported so `stageRender.test.ts` reads the shipped boundary rather than a transcription of it.
 */
export const LOAD_OCCUPIED = 0.25;

function formatSpan(fromS: number, toS: number): string {
  return `${fromS.toFixed(0)}–${toS.toFixed(0)} s`;
}
