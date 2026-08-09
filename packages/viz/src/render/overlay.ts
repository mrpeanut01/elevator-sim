/**
 * The live metrics overlay, drawn.
 *
 * Its data comes from `src/frame/overlay.ts`, which is pure and tested on its own; this file
 * turns it into calls on a {@link Canvas2DLike}. The split is the same one `layout.ts`/`canvas.ts`
 * already make, and it exists for the same reason: `overlayAt` being right is not the same claim
 * as the panel *drawing what `overlayAt` returned*, and this package has already shipped a frame
 * seven of whose eight fields could be replaced by constants with the suite still green. So every
 * value below appears in exactly one `fillText`, and `overlay.render.test.ts` asserts each one
 * against a recomputation rather than against a literal.
 *
 * ## The rule the panel enforces
 *
 * A suppressed statistic is **replaced by its reason**, never by a dash and never by a number.
 * `CLAUDE.md` says not to report a mean for a system whose queues grow without bound;
 * `UX.md` `RV-T5`/`RV-06` add that the running figure must never be labelled "AWT". Both are
 * structural here: the estimate rows read from {@link OverlayMetrics.rollingMeanWaitS}, which is
 * already `undefined` when `recording.summary` says so, and the label is "rolling mean wait
 * (last N s)" — a different phrase from the summary's "AWT" on purpose.
 */

import type { OverlayMetrics } from '../frame/overlay.js';
import type { Frame, VizRecording } from '../contract/types.js';
import type { ViewMode } from '../mode/types.js';
import type { Canvas2DLike, Theme } from './canvas.js';
import type { Layout } from './layout.js';

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

const FONT = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
const FONT_SMALL = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
const LINE = 16;

/**
 * Measured advance of one character at the two faces above — GitHub issue #115 § 6.
 *
 * `Canvas2DLike` has no `measureText`, for `render/canvas.ts#CHAR_ADVANCE_PX`'s stated reason, so
 * every horizontal budget in this file is arithmetic against these two numbers. The 12 px figure
 * is the same one `canvas.ts` uses and is stated there; 6.6 px is the same face at 11 px.
 *
 * {@link wrap} used **6.0** for the small face, which is not a rounding: it is 9 % narrow, so a
 * reason wrapped to the panel's width overhung it by three characters on every line. The one
 * number in this file that was measured rather than assumed is the one that was wrong.
 */
const ADVANCE_PX = 7.2;
const ADVANCE_SMALL_PX = 6.6;

/** Inset from each edge of the panel — the `+ 10` the rows are drawn at, on both sides. */
const PANEL_INSET_PX = 10;

/**
 * The longest of `candidates` that fits `widthPx`, or the last one clipped to it.
 *
 * The same shape `render/canvas.ts#drawNotices` uses for `RS-05`'s notice, and for the same
 * reason: a sentence that has to lose words should lose the ones the reader can do least with,
 * chosen here, rather than whichever ones happen to fall past the panel's edge. The fallback
 * clips, because a clipped string is still better than one drawn over the panel border — but
 * every caller below supplies a last candidate that fits {@link MIN_OVERLAY_WIDTH_PX}, so the
 * fallback is a guard rather than a plan.
 */
function longestThatFits(
  candidates: readonly string[],
  widthPx: number,
  advancePx: number,
): string {
  const found = candidates.find((candidate) => candidate.length * advancePx <= widthPx);
  if (found !== undefined) return found;
  const last = candidates[candidates.length - 1] ?? '';
  const budget = Math.max(1, Math.floor(widthPx / advancePx));
  return last.length <= budget ? last : `${last.slice(0, Math.max(1, budget - 1))}…`;
}
/** Lines of suppression reason the panel will spend before deferring to the status line. */
const REASON_LINES = 4;
/**
 * Below this, the panel is not drawn at all.
 *
 * Its mandatory content — the title, the window, the three observations and the estimate block —
 * is about 190 px. Squeezing that into 120 px does not degrade gracefully; it draws over the
 * bottom edge. The same answer as `RS-03` gives a narrow viewport: no panel, and the header
 * counters, which are always on screen, carry the headline numbers.
 */
const MIN_PANEL_HEIGHT_PX = 200;

export interface OverlayInput {
  readonly recording: VizRecording;
  readonly frame: Frame;
  readonly metrics: OverlayMetrics;
  readonly layout: Layout;
  readonly theme: Theme;
  /**
   * The reader's disclosure level — GitHub issue
   * [#100](https://github.com/mrpeanut01/elevator-sim/issues/100), whose first checklist item is
   * this panel.
   *
   * Defaulting to `advanced`, so every caller that is describing a run rather than serving a reader
   * — the honesty sweep, `overlayRender.test.ts`, an export — gets the engineer's words. That is
   * `DayReportInput.showEnergyAxis`'s rule and the argument transfers: a default that quietly
   * simplified would have the search measuring a panel the product does not draw.
   *
   * **It moves words and it does not move a refusal.** See {@link CASUAL_WORDS} and
   * {@link CASUAL_REFUSAL}: a suppressed statistic is still replaced by a refusal, still in
   * `theme.warning`, still with no number beside it.
   */
  readonly mode?: ViewMode | undefined;
}

/**
 * The panel's labels in the two registers — issue #100.
 *
 * ## Why this is a table and not four ternaries at the draw sites
 *
 * Every string here is drawn into a **fixed-width column**: the observation rows are
 * `label` padded out to a column the value starts in, and this file has no `measureText` (see
 * {@link ADVANCE_PX}). A wording change is therefore a *layout* change, and issue #115 § 6 is what
 * happens when this panel's widths are decided one draw site at a time — four strings overhanging
 * the border on the viewer's own canvas, invisible to every DOM check because the panel is drawn
 * into the bitmap.
 *
 * So the two registers sit side by side where the padding can be read off them, and
 * `overlayRender.test.ts` asserts **every** Casual string fits {@link MIN_OVERLAY_WIDTH_PX}'s
 * content width rather than the ones somebody remembered to check.
 *
 * ## The one label that is the same in both, and the one that could have been made false
 *
 * `longest wait` is byte-identical in the two registers, and it is in this table anyway: a reader
 * of this file should be able to see the whole panel's vocabulary in one place, including the part
 * that needed no translating. Leaving it out would have made the table read as *the words that
 * differ*, which is a different and smaller claim than *the words the panel draws*.
 *
 * `boarded (window)` is the one that could have been made plainer by making it wrong. It is a count
 * over the rolling window, so Casual keeps the basis — *(5min)* — rather than dropping it: a count
 * over five minutes drawn as a count over the day would be a false figure, not a friendlier one.
 * The same restraint decides the window caption below.
 */
const CASUAL_WORDS = Object.freeze({
  title: 'RIGHT NOW',
  waiting: 'people waiting  ',
  longest: 'longest wait    ',
  boarded: 'got a car (5min)',
  rollingMean: 'average wait so far',
  byBank: 'BY LIFT GROUP',
  carLoad: 'HOW FULL EACH CAR IS',
  bankSuppressed: 'no average',
  nothingYet: 'nobody carried yet',
});

/** The same nine, as the engineer's panel has always drawn them. */
const ENGINEER_WORDS = Object.freeze({
  title: 'LIVE METRICS',
  waiting: 'waiting now     ',
  longest: 'longest wait    ',
  boarded: 'boarded (window)',
  rollingMean: 'rolling mean wait',
  byBank: 'BY BANK',
  carLoad: 'CAR LOAD',
  bankSuppressed: 'suppressed',
  nothingYet: 'nothing served yet',
});

/**
 * What Casual says where the engineer's panel says `SUPPRESSED` — and the two things it may not be.
 *
 * It may not be **softer**. `SATURATED` is not jargon to be smoothed away; it is the run telling a
 * reader the building could not cope, and *a busy day* is a different and weaker claim. Every
 * candidate here says there is **no average**, in those words, before it says anything else.
 *
 * It may not be **narrower than the ground**. `awtIsValid` has five grounds and only one of them is
 * saturation — an empty window and an abandonment rate above 2 % refuse a mean on a run that coped
 * perfectly well — so a line reading *the building could not cope* would be false on three of the
 * five. This one is ground-free by construction, and the ground-specific sentence is the one the
 * status line under the canvas carries (`dev/main.ts#transportStatusOf`, which is already
 * mode-aware and already reads `mode/disclosure.ts`'s per-ground wording).
 *
 * Ordered longest-first for {@link longestThatFits}, which is this file's own idiom: a sentence
 * that has to lose words loses the ones chosen here rather than the ones that fall past the edge.
 */
const CASUAL_REFUSAL: readonly string[] = Object.freeze([
  'NO AVERAGE — A RESULT',
  'NO AVERAGE',
]);

/**
 * The reason Casual prints in the panel, in place of `core`'s statistics prose.
 *
 * `docs/10` R3 lets a mode **shorten** a reason and forbids it to remove one, and this is the
 * shortening: the full sentence — *"Queue length rose by 268.0 persons (53.59/min, 12.0× the
 * queue's own scatter) … AWT is not approximately normal and its confidence interval must be
 * suppressed"* — is on the status line under the canvas, verbatim, in both modes, and this
 * sentence says so rather than leaving a reader to find it.
 *
 * It is **ground-free**, for {@link CASUAL_REFUSAL}'s reason. It states no number, so R3's textual
 * half cannot be tripped by it. And it says *refuse* rather than *cannot*: the mean exists as an
 * arithmetic mean of something — `1 334 s` on the run `shift/report.test.ts` pins — and what the
 * run declines is to stand behind it, which is a result rather than a gap.
 */
const CASUAL_REASON =
  'This run’s own statistics refuse an average here. That is a result, not a gap — the reason ' +
  'in full is on the line below the canvas.';

/**
 * Draw the panel into {@link Layout.overlay}. A no-op when no room was reserved.
 *
 * Returning early rather than shrinking is deliberate: `RS-03` says the controls stack and the
 * canvas keeps its height on a narrow viewport, and a 240 px panel squeezed into 80 px is a
 * worse answer than no panel plus the header counters, which stay.
 */
export function drawOverlay(ctx: Canvas2DLike, input: OverlayInput): void {
  const { layout, theme, metrics, frame } = input;
  const panel = layout.overlay;
  if (panel === undefined || panel.height < MIN_PANEL_HEIGHT_PX) return;

  ctx.fillStyle = theme.panel;
  ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
  ctx.strokeStyle = theme.shaftEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);

  const left = panel.x + PANEL_INSET_PX;
  /**
   * The room a row actually has — the panel less both insets.
   *
   * Nothing in this file had one before, which is issue #115 § 6 in one sentence: the panel
   * checked its own **height** and drew whatever width it liked. `render/layout.ts` now refuses
   * to hand over a panel narrower than `MIN_OVERLAY_WIDTH_PX`; this is the other half of the same
   * agreement, and it is what makes an *authored* bank id — the one string here whose length
   * nobody chose — unable to overhang the border.
   */
  const contentWidth = Math.max(1, panel.width - 2 * PANEL_INSET_PX);
  let y = panel.y + 12;
  const line = (text: string, style: string, font = FONT): void => {
    ctx.font = font;
    ctx.fillStyle = style;
    ctx.fillText(text, left, y);
    y += LINE;
  };

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  /* Issue #100. One lookup, at the top, so no draw site below chooses a register of its own. */
  const casual = (input.mode ?? 'advanced') === 'basic';
  const words = casual ? CASUAL_WORDS : ENGINEER_WORDS;

  line(words.title, theme.text);
  /*
   * The window, in each register's own way of saying the same span.
   *
   * Engineer gets the bounds — `window 358–658 s` — because a bound is what a reader checks a
   * figure against. Casual gets the **length**, which is the same fact said the way a person asks
   * it, and it is subtracted rather than assumed: the window is `[max(startedAt, t − windowS), t]`,
   * so early in a run it is genuinely shorter than `windowS` and printing *the last 300 s* there
   * would be a caption describing a window the panel is not showing.
   */
  line(
    casual
      ? `the last ${(metrics.simTimeS - metrics.windowStartS).toFixed(0)} s`
      : `window ${formatSpan(metrics.windowStartS, metrics.simTimeS)}`,
    theme.textDim,
    FONT_SMALL,
  );
  y += 4;

  /* Observations. Facts about the recording, shown on every run including a saturated one —
     they are how a reader *sees* a queue diverging. */
  line(`${words.waiting} ${String(metrics.waitingNow)}`, theme.text);
  line(
    `${words.longest} ${metrics.longestCurrentWaitS === undefined ? '—' : `${metrics.longestCurrentWaitS.toFixed(0)} s`}`,
    theme.text,
  );
  line(`${words.boarded} ${String(metrics.boardedInWindow)} legs`, theme.text);
  y += 4;

  /*
   * What is left of the panel is allocated **before** anything else is drawn, in the order a
   * reader loses least by losing: the prose reason first (it is repeated verbatim on the status
   * line under the canvas), then bank rows, then car rows. The `SUPPRESSED` line itself is never
   * spent.
   *
   * Three measurements in the browser produced this, each one fixing the previous rule:
   *
   * | Panel | Rule at the time | Symptom |
   * |---|---|---|
   * | 400 px, midtown-office | a fixed reservation for the car section | "showing 0 of 1 banks", "showing 0 of 4 cars" |
   * | 340 px, vertical-city | 50/50 split of what remained | the reason ate the room before the split happened |
   * | 340 px, mixed-use-high-rise | reserve cars, banks take the rest | "showing 0 of 16 cars" — the overload alarm drawn as nothing |
   *
   * The lesson of the third is why this is arithmetic rather than a limit checked inside each
   * loop: a limit is off by whatever the headings and gaps cost, and correcting it by eye is how
   * the first two rules were produced.
   */
  const bottom = panel.y + panel.height;
  const CAR_ROW = 14;
  const GAP = 6;
  /** Car rows the panel keeps back before the banks are given anything. */
  const CAR_ROWS_RESERVED = 4;

  const cars = frame.cars.length;
  const banks = metrics.banks.length;

  /** Rows of each list, decided once. `truncated` drives the "showing N of M" lines. */
  function allocate(spare: number): { readonly carRows: number; readonly bankRows: number } {
    // Two headings, the two inter-section gaps, and one line of slack. The slack is not a
    // fudge for arithmetic nobody checked: `overlayRender.test.ts` asserts that **no** call
    // lands below the panel, and a text baseline sits at the *top* of its line box, so the
    // last row of a full panel would otherwise extend one line past the edge it was measured
    // against. Costing one row is the right trade for a hard bound.
    let budget = Math.max(0, spare - 2 * LINE - 2 * GAP);
    let carRows = Math.min(cars, CAR_ROWS_RESERVED, Math.floor(budget / CAR_ROW));
    budget -= carRows * CAR_ROW;
    if (cars > carRows) budget = Math.max(0, budget - LINE);
    let bankRows = Math.min(banks, Math.floor(budget / LINE));
    if (banks > bankRows && bankRows > 0) bankRows -= 1;
    budget -= bankRows * LINE;
    if (banks > bankRows) budget = Math.max(0, budget - LINE);
    carRows = Math.min(cars, carRows + Math.floor(budget / CAR_ROW));
    return { carRows, bankRows };
  }

  if (metrics.suppressed) {
    line(words.rollingMean, theme.textDim);
    /*
     * The refusal, in each register — and it is a refusal in both. Casual's line is chosen by
     * width from {@link CASUAL_REFUSAL} rather than fixed, because this panel can be 210 px wide
     * and a clipped refusal is the one string on the screen that may not be clipped.
     */
    line(
      casual ? longestThatFits(CASUAL_REFUSAL, contentWidth, ADVANCE_PX) : 'SUPPRESSED',
      theme.warning,
    );
    const reason = wrap(
      casual ? CASUAL_REASON : (metrics.suppressionReason ?? 'no reason given'),
      contentWidth,
      ADVANCE_SMALL_PX,
    );
    // Whatever is left once both lists have had their reserved rows. May be zero on a very short
    // panel; the pointer line below still says where the full text is.
    const forLists = 2 * LINE + 2 * GAP + Math.min(cars, CAR_ROWS_RESERVED) * CAR_ROW + Math.min(banks, 2) * LINE;
    const budget = Math.max(
      0,
      Math.min(REASON_LINES, Math.floor((bottom - y - forLists - LINE) / LINE)),
    );
    for (const chunk of reason.slice(0, budget)) {
      line(chunk, theme.textDim, FONT_SMALL);
    }
    if (reason.length > budget) {
      // The pointer must survive: it is the only thing telling a reader the reason continues.
      line(
        longestThatFits(
          ['… (full reason below the canvas)', '… (full reason below)', '… (more below)'],
          contentWidth,
          ADVANCE_SMALL_PX,
        ),
        theme.textDim,
        FONT_SMALL,
      );
    }
  } else {
    line(
      `${words.rollingMean}${metrics.rollingMeanWaitS === undefined ? '  —' : ''}`,
      theme.textDim,
    );
    if (metrics.rollingMeanWaitS !== undefined) {
      line(`${metrics.rollingMeanWaitS.toFixed(1)} s`, theme.text);
    }
  }
  y += GAP;

  const { carRows, bankRows } = allocate(bottom - y);

  /*
   * A section that cannot show even one row is collapsed to a single line naming what it holds.
   *
   * A heading followed by "showing 0 of 12 banks" is two lines that say nothing and look like a
   * bug; one line that says there are twelve banks and no room for them says the same thing
   * honestly and leaves the room for the other section. Measured on a 340 px panel with twelve
   * banks and thirty-five cars, where both sections wanted more than the panel had.
   */
  if (banks > 0 && bankRows === 0) {
    /*
     * *lift group* rather than *bank* in Casual, and the count keeps the same noun as the heading
     * — a collapsed section that named a different thing from the one it is collapsing would be
     * two vocabularies on one line, which is worse than either.
     */
    const noun = casual ? 'lift group' : 'bank';
    const count = `${String(banks)} ${noun}${banks === 1 ? '' : 's'}`;
    line(
      longestThatFits(
        [
          `${words.byBank}  ${count} — no room here`,
          `${words.byBank}  ${count} — no room`,
          `${words.byBank}  ${count}`,
        ],
        contentWidth,
        ADVANCE_SMALL_PX,
      ),
      theme.warning,
      FONT_SMALL,
    );
  } else {
    line(words.byBank, theme.textDim, FONT_SMALL);
    if (banks === 0) {
      line(words.nothingYet, theme.textDim, FONT_SMALL);
    }
    for (const bank of metrics.banks.slice(0, bankRows)) {
      const mean =
        bank.meanWaitS === undefined ? words.bankSuppressed : `${bank.meanWaitS.toFixed(1)} s`;
      /*
       * The **id** yields, never the figures beside it.
       *
       * `bankId` is authored in `data/buildings/`, so its length is the one thing on this panel
       * nobody here chose — `zone-1-local` is twelve characters and Mixed-Use's `office-low-rise`
       * is fifteen. Clipping the row as a whole would have taken the leg count or the word
       * `suppressed` off the end, which is a suppression notice disappearing because a building
       * has long names. The id is the part a reader can identify from its neighbours; the figures
       * are not.
       */
      const tail = `  ${String(bank.boardedInWindow)} legs  ${mean}`;
      const idBudget = Math.max(1, contentWidth - tail.length * ADVANCE_SMALL_PX);
      const id = longestThatFits([bank.bankId], idBudget, ADVANCE_SMALL_PX);
      line(`${id}${tail}`, theme.text, FONT_SMALL);
    }
    if (bankRows < banks) {
      line(
        `showing ${String(bankRows)} of ${String(banks)} ${casual ? 'groups' : 'banks'}`,
        theme.warning,
        FONT_SMALL,
      );
    }
  }
  y += GAP;

  /* Per-car load. The one place `RV-14`'s "does not silently clip at 1" is testable: the track
     is scaled past the alarm, so an overloaded car draws past the full mark rather than at it. */
  /*
   * There is no "no room for any car" branch, and its absence is deliberate.
   *
   * One was written, by symmetry with the bank list. The mutation harness then showed it could be
   * replaced by a bare heading with the suite still green — and the reason turned out to be that
   * **no panel can reach it**: with {@link MIN_PANEL_HEIGHT_PX} at 200 there is always room for at
   * least one car row, and below 200 the panel is not drawn at all. It was unreachable code with a
   * plausible-looking test, which is this repository's signature defect, so it was deleted rather
   * than given a test that constructed a panel the layout never produces.
   *
   * The bank list keeps its collapsed line because that one **is** reachable, and was seen on
   * screen on Mixed-Use High-Rise and Midtown Office.
   */
  line(words.carLoad, theme.textDim, FONT_SMALL);
  const trackMax = loadTrackMax(frame.cars);
  const trackWidth = Math.max(20, panel.width - 90);
  const shown = carRows;
  for (const car of frame.cars.slice(0, shown)) {
    ctx.font = FONT_SMALL;
    ctx.fillStyle = theme.textDim;
    ctx.fillText(car.label, left, y);

    const barX = left + 34;
    ctx.fillStyle = theme.shaft;
    ctx.fillRect(barX, y + 2, trackWidth, 8);
    ctx.fillStyle = loadColour(car.loadFactor, theme);
    ctx.fillRect(barX, y + 2, (trackWidth * car.loadFactor) / trackMax, 8);
    // The full mark: where 100 % of rated load sits on a track that extends past it.
    ctx.fillStyle = theme.textDim;
    ctx.fillRect(barX + trackWidth / trackMax, y + 1, 1, 10);

    ctx.fillStyle = car.loadFactor >= LOAD_ALARM ? theme.carOverload : theme.textDim;
    ctx.fillText(
      `${car.loadFactor.toFixed(2)}${car.loadFactor >= LOAD_ALARM ? ' !' : ''}`,
      barX + trackWidth + 6,
      y,
    );
    y += CAR_ROW;
  }
  if (shown < frame.cars.length) {
    ctx.font = FONT_SMALL;
    ctx.fillStyle = theme.warning;
    ctx.fillText(
      `showing ${String(shown)} of ${String(frame.cars.length)} cars`,
      left,
      y,
    );
  }
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
  if (loadFactor >= LOAD_ALARM) return theme.carOverload;
  if (loadFactor >= LOAD_FULL) return theme.carHeavy;
  if (loadFactor > LOAD_OCCUPIED) return theme.car;
  return theme.carLight;
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

/**
 * Greedy word wrap at an approximate monospace advance.
 *
 * `Canvas2DLike` has no `measureText` on purpose — it is the subset the renderer uses, and adding
 * a measurement method would mean every test stub had to implement font metrics. At 11 px
 * monospace an advance is about 6.2 px, which is close enough for a reason string.
 */
function wrap(text: string, widthPx: number, advancePx: number): readonly string[] {
  const perLine = Math.max(8, Math.floor(widthPx / advancePx));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current === '') current = word;
    else if (current.length + 1 + word.length <= perLine) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}
