/**
 * Deliberate faults, so every property can be shown to fail.
 *
 * **A property that has never failed is a property that cannot fail.** A green honesty search
 * that has never caught anything is indistinguishable from one that cannot catch anything, and
 * the only defence is to break, on purpose, the exact thing each property protects and watch it
 * fire. `faults.test.ts` does that for all seven, on **real cases over the shipped data**, and
 * prints what it saw.
 *
 * ## Why the fault is injected into the *rendered strings* and not into the code
 *
 * `fuzz/faults.ts` corrupts a `SimulationResult`, because its properties are predicates over a
 * record. These properties are predicates over **what a surface said**, so the fault is a surface
 * saying the wrong thing: a figure that keeps its estimate classification on a suppressed run, a
 * comparison row that names a winner it did not resolve, a goal printed without its rate. Each
 * fault below is the shape of the defect its property names, expressed as the smallest edit to
 * the output that produces it.
 *
 * Two of them are worth stating precisely, because a lazy version of each would prove nothing:
 *
 * - **`suppressedMean`** re-classifies a *genuinely suppressed* figure back to `estimate` **and**
 *   restores the numeral the summary refused. A fault that only flipped the label would be caught
 *   by the structural half alone and would say nothing about the textual half; this one is caught
 *   by both, and the test asserts both fire.
 * - **`comparativeOnOneRun`** puts the claim on a `single-run` surface rather than inventing a
 *   batch row, because that is the defect R2 actually describes — *"a single-run surface … may not
 *   say 'this dispatcher is better.'"*
 *
 * ## What a fault must not do
 *
 * Change the run. Nothing here touches a `SimulationConfig`, a seed, a recording or a batch
 * result: the statistics a property consults are the real ones, so a property that merely echoed
 * them would sail past every fault below. That is the point — these prove the checks are
 * independent of the surfaces they judge.
 */

import { observationsAt } from '../live/observations.js';

import { PLAYER_FACING_SURFACES, type HonestyContext } from './surfaces.js';
import type { HonestyProperty, RenderedText } from './types.js';

/** The signature `HonestyResources.corruptTexts` takes. */
export type TextFault = (
  texts: readonly RenderedText[],
  context: HonestyContext,
) => readonly RenderedText[];

function replaceFirst(
  texts: readonly RenderedText[],
  match: (text: RenderedText) => boolean,
  patch: (text: RenderedText) => RenderedText,
): readonly RenderedText[] {
  const index = texts.findIndex(match);
  if (index < 0) return texts;
  const copy = [...texts];
  const found = copy[index];
  /* c8 ignore next -- findIndex returned a real position. */
  if (found === undefined) return texts;
  copy[index] = patch(found);
  return copy;
}

/**
 * R3 — a run whose summary refuses its estimates, publishing one anyway.
 *
 * The exact defect `DECISIONS.md` § D111 closed in the viewer and § D163 asks whether anything
 * re-opened: three copies of `saturated || !awtIsValid` existed and the third was missing. Here
 * the suppressed figure keeps its slot, gets its classification back, and gets the number.
 */
export const suppressedMeanLeak: TextFault = (texts, context) => {
  if (!context.suppressed) return texts;
  const mean = context.recording.summary.meanWaitS;
  return replaceFirst(
    texts,
    (text) => text.provenance === 'single-run' && text.role === 'suppressed',
    (text) => ({
      ...text,
      role: 'estimate',
      text: `average wait: ${Number.isFinite(mean) ? mean.toFixed(1) : '11.3'} s`,
      countShown: true,
      declaredCount: context.recording.summary.waitCount,
    }),
  );
};

/**
 * R3 again, textually only, and inside a **composite** string — § D111's canvas header, verbatim.
 *
 * This fault exists because of what fixing a false positive risks. The textual half of R3 asks
 * whether a forbidden number sits beside an estimate cue, and it used to ask that over a window
 * of 64 characters, which crossed sentence boundaries and reported eight non-violations on
 * `describeFrame` and `drawScene` — a run-level count in one sentence, the word *"Mean"* opening
 * the **refusal** in the next. The window is now bounded by the numeral's own clause. A
 * correction to a check is a change to what the check can no longer see, so the thing it must
 * still see is injected here rather than argued:
 *
 * > `waiting 61   boarded 368 legs   mean wait so far 61.0 s`
 *
 * That is `render/canvas.ts`'s header band with `meanClause` no longer consulting
 * `meansAreSuppressed` — the exact defect [`DECISIONS.md` § D111](../../../../DECISIONS.md)
 * closed, in the exact layout the shipped renderer draws: three fields joined by three spaces,
 * each field carrying its own label beside its own value. The clause bound must fall between the
 * fields and not between *"mean wait so far"* and its number.
 *
 * It guards the **second** narrowing too, which landed in the same lane: the cue that must catch
 * this string is *"mean"*, and the number it must be paired with is `meanWaitS` — the same
 * quantity. A cue map that lost the pairing would stop seeing this.
 *
 * Distinct from {@link suppressedMeanLeak} in the half it exercises: this one leaves the string's
 * `role` at `prose`, so the structural check cannot see it and only the textual check can fire.
 */
export const suppressedMeanInProse: TextFault = (texts, context) => {
  if (!context.suppressed) return texts;
  const { summary } = context.recording;
  if (!Number.isFinite(summary.meanWaitS)) return texts;
  return replaceFirst(
    texts,
    (text) => text.provenance === 'single-run' && text.role === 'prose',
    (text) => ({
      ...text,
      text:
        `waiting ${String(summary.undelivered)}   boarded ${String(summary.waitCount)} legs   ` +
        `mean wait so far ${summary.meanWaitS.toFixed(1)} s`,
    }),
  );
};

/** R2 — a single-run surface ordering two dispatchers. */
export const comparativeOnOneRun: TextFault = (texts, context) =>
  replaceFirst(
    texts,
    (text) => text.provenance === 'single-run' && text.role === 'observation',
    (text) => ({
      ...text,
      text:
        `${context.case.candidateProfileId} is better than ${context.case.baselineProfileId} — ` +
        'this run came out ahead.',
    }),
  );

/**
 * R10 — an interval translated into a word.
 *
 * Written as the sentence `docs/10` § 1 R10 names verbatim, so the fault is the documented failure
 * rather than a keyword smuggled into an unrelated string.
 */
export const probabilityWordLeak: TextFault = (texts) =>
  replaceFirst(
    texts,
    (text) => text.role === 'comparison' || text.role === 'prose',
    (text) => ({ ...text, text: 'the new setting is probably a bit better than the old one.' }),
  );

/**
 * R13 — an estimate with its `n` taken away.
 *
 * Clause one, and it is the smaller of the two edits available: the value is untouched and only
 * the count disappears, which is exactly how this defect arrives in practice — a layout change
 * that moves `n` into a tooltip.
 */
export const estimateWithoutCount: TextFault = (texts) =>
  replaceFirst(
    texts,
    (text) => text.role === 'estimate',
    (text) => ({ ...text, countShown: false, declaredCount: undefined }),
  );

/**
 * R13 clause two — a natural-frequency restatement over a sample that has no such rider.
 *
 * `docs/10`'s own measurement: Garden Apartments, `collective`, seed 42 quotes a valid AWT over
 * **five** legs, and *"1 in 20 rides…"* about five rides invents the denominator in the section
 * whose justification is making denominators visible.
 */
export const inventedDenominator: TextFault = (texts, context) =>
  replaceFirst(
    texts,
    (text) => text.provenance === 'single-run' && text.role !== 'label',
    (text) => ({
      ...text,
      text: `1 in 1000 rides waited more than ${context.recording.summary.longWaitThresholdS.toFixed(0)} s.`,
    }),
  );

/** R11 — the eco score. The one figure R11 exists to forbid. */
export const energyScore: TextFault = (texts) =>
  replaceFirst(
    texts,
    (text) => text.energyAxis === true && !text.field.endsWith('.note'),
    (text) => ({
      ...text,
      text: 'efficiency score: 84 / 100 — drive work in kJ per second of wait saved.',
    }),
  );

/** R12 / § D160 — a goal reported as a verdict, with no across-seed rate behind it. */
export const goalWithoutRate: TextFault = (texts) =>
  replaceFirst(
    texts,
    (text) => text.role === 'goal',
    (text) => ({
      ...text,
      text: 'Goal met: nobody was abandoned.',
      goal: { rateShown: false, seeds: 0 },
    }),
  );

/**
 * R6 / § D223 — the mood card's four whole-run drivers, drawn at a part-way playhead.
 *
 * **Issue #109's defect, restored to the exact string it produced**, and the reason the temporal
 * axis exists: the rail's gates were all `recording === undefined`, boot runs a simulation with zero
 * clicks, so a card drawn at 00:00 reported the end of the day beside a clock reading the start.
 * `dev/leftRail.ts#moodDriverPanelOf` now filters on {@link MoodDriver.basis}; this puts the
 * declaration back on a string the surface said early, which is exactly what removing that filter
 * would do.
 *
 * Structural only. The `basis` is what fires it, so a check that read the words rather than the
 * declaration would not see it — and the second fault below is the mirror of that.
 */
export const wholeRunDriverDrawnEarly: TextFault = (texts) =>
  replaceFirst(
    texts,
    (text) => text.playhead !== undefined && text.playhead.atS < text.playhead.endedAt && text.role === 'observation',
    /* c8 ignore next -- the predicate above already established `window` is defined. */
    (text) =>
      text.playhead === undefined
        ? text
        : { ...text, playhead: { ...text.playhead, basis: 'whole-run' as const } },
  );

/**
 * R6 a third time — **a refusal that dates itself to a day that has not finished.**
 *
 * `docs/20` defect 3, and the fault the narrowing owes. R6's `role === 'reason'` exemption used to
 * be total, on the argument *"a refusal is the absence of a claim"*, and the RIGHT NOW panel spent
 * a wave publishing **`NO AVERAGE — A RESULT`** and *"That is a result, not a gap"* at 14 % of
 * playback under a label reading *average wait so far*. Nothing there is a figure, so the textual
 * half could never see it; the structural half returned before it read the basis; and the whole
 * class of numberless early verdicts sat outside the property built to catch early verdicts.
 *
 * The exemption is now half what it was — refusals are exempt from the **textual** check only — and
 * this is what that narrowing must catch. It stamps `'whole-run'` onto the first early refusal,
 * which is exactly what a regression in `mode/disclosure.ts#casualRefusalFor` would produce: the
 * words come back and the declaration comes back with them.
 *
 * Deliberately **not** a wording fault. It changes no string, so a check that read the refusal's
 * text — grepping for *A RESULT*, say — would not see it, which is the property that makes this
 * the structural half's fault rather than a second copy of the one above with a different role.
 */
export const wholeRunRefusalDrawnEarly: TextFault = (texts) =>
  replaceFirst(
    texts,
    (text) => text.playhead !== undefined && text.playhead.atS < text.playhead.endedAt && text.role === 'reason',
    /* c8 ignore next -- the predicate above already established `playhead` is defined. */
    (text) =>
      text.playhead === undefined
        ? text
        : { ...text, playhead: { ...text.playhead, basis: 'whole-run' as const } },
  );

/**
 * R6 again, textually only — **the sentence § D293 was written about, verbatim.**
 *
 * > `All 34 people got where they were going`
 *
 * The left rail published that on a cold load, before the shift had played a second, and it was in
 * the corpus and passing from the day the corpus existed, because not one of the six properties
 * before this one asks at what playhead a string was said. The number is rebuilt from the run's own
 * `summary.delivered`, so the fault carries the finished day's count rather than one chosen here.
 *
 * ## Where it lands, and why that is the sharp case rather than the convenient one
 *
 * On a string whose surface declared `basis: 'now'` — *this sentence is re-derived at the playhead
 * and is true of the instant on screen* — at a playhead short of `endedAt`, where the day's count is
 * genuinely unreachable. So the structural half **cannot** see it: the declaration says exactly what
 * R6 wants to hear, and the words say the opposite. That is the half-separation this fault exists
 * for, and it is the harder case of the two: `wholeRunDriverDrawnEarly` breaks a gate, this breaks a
 * sentence behind a gate that is still shut.
 *
 * The playhead guard is not decoration. `WHOLE_RUN_COUNTS` fires only where the same quantity read
 * at that playhead is a *different* number — otherwise the figure is reachable and the check is
 * right to stay quiet — so a fault that ignored it would sometimes inject a string the property
 * correctly passes, and the suite would read that as the property failing to fire.
 */
export const wholeRunCountInProse: TextFault = (texts, context) => {
  const { summary } = context.recording;
  if (!Number.isFinite(summary.delivered)) return texts;
  return replaceFirst(
    texts,
    (text) =>
      text.playhead !== undefined &&
      text.playhead.atS < text.playhead.endedAt &&
      text.playhead.basis === 'now' &&
      (text.role === 'observation' || text.role === 'prose') &&
      /* Only where the day's count is not also the count at this playhead — see WHOLE_RUN_COUNTS. */
      observationsAt(context.recording, text.playhead.atS).carried !== summary.delivered,
    (text) => ({
      ...text,
      text: `All ${String(summary.delivered)} people got where they were going.`,
    }),
  );
};

/**
 * § 12.2 — a withheld cell drawn as a zero.
 *
 * **The defect the withheld-matrix sweep found, restored to the exact string it produced.**
 * `dev/leftRail.ts#runFiguresOf` published `0%` under *best day so far* on every week whose history
 * was empty, which is every new player's whole first shift. `0%` rather than a number chosen here,
 * because the shape of this defect is precisely that the cell keeps rendering a figure's *format*
 * while nothing has been measured — a reader cannot tell it from a genuinely bad day.
 *
 * Structural in the sense that matters: the string is judged because the **adapter** declared the
 * cell withheld, not because of anything in the words. A search that decided *"this looks like a
 * placeholder"* from the text could not have caught the real one.
 */
export const withheldFigureAsZero: TextFault = (texts) =>
  replaceFirst(
    texts,
    (text) => text.withheld !== undefined,
    (text) => ({ ...text, text: '0%' }),
  );

/**
 * § 12.2 again, and the other half — a withheld cell carrying the figure it may not publish.
 *
 * **The second defect the sweep found, in its own words**: while watching somebody else's run, the
 * week strip's *today, so far* bar read the watched player's share in the spectator's own week —
 * *"Tuesday, so far: 66 % away inside a minute"*. The number is taken from the cell's own
 * `ifPublished`, so the fault carries whatever that state's forbidden figure actually is rather than
 * a literal that could drift away from it.
 *
 * It lands only on a cell that declares one, which is the guard `wholeRunCountInProse` needs for the
 * same reason: a fault injected where the property is right to stay quiet would read as the property
 * failing to fire. It is also the half no wording rule could catch — the sentence is well formed,
 * labelled, and about the wrong run.
 */
export const withheldFigureStale: TextFault = (texts) =>
  replaceFirst(
    texts,
    (text) => text.withheld !== undefined && text.withheld.ifPublished.length > 0,
    (text) => ({
      ...text,
      text: `${text.withheld?.ifPublished[0] ?? '66'}% away inside a minute, so far`,
    }),
  );

/**
 * The charter's M2 gate — a note to the team, left where the audience is.
 *
 * Written as a **new** sentence on a `label` string rather than by editing one of the register
 * entries the search already reports, for two reasons. It has to produce a *new* offending string
 * for `faults.test.ts`'s freshness assertion, which an edit to an already-failing entry would not.
 * And it has to prove the property is about **any** player-facing string and not about the shape of
 * an absence register — a fault confined to the one surface the finding lives on would be a fault
 * that only proves the finding.
 *
 * The sentence carries all three of the criterion's things, in the form the tree writes them, so
 * every clause's quoting path is exercised — **and that is not the same as a guard per clause**,
 * which one fault cannot be: any one clause firing produces the violation, so a clause quietly
 * deleted would still leave this fault passing. Said plainly rather than implied, because a fault
 * that is believed to cover more than it does is the thing this file exists to prevent. Per-clause
 * coverage is `honesty.test.ts`'s register, whose nineteen findings between them are caught by the
 * section, filename, member-path, constant and code-voice clauses on real shipped strings.
 */
export const notationOnPlayerSurface: TextFault = (texts) =>
  replaceFirst(
    texts,
    (text) => PLAYER_FACING_SURFACES.has(text.surfaceId) && text.role === 'label',
    (text) => ({
      ...text,
      text: 'Not drawn yet — § 6.5’s third lever, `dev/reportPanel.ts#LEVER_SURFACES`.',
    }),
  );

/**
 * One fault per property, so the suite can iterate rather than list.
 *
 * Three of them carry a second, and in every case because the property has two halves a fault for
 * one says nothing about: `estimate-without-n` is R13's two clauses, `suppressed-mean` is R3's
 * structural and textual checks — the second was added when the textual check's window was
 * narrowed, so that the narrowing has something it must still catch — and `whole-run-figure-early`
 * is R6's structural and textual checks, where one breaks the gate on a figure whose producer
 * declared it whole-run and the other leaves the gate shut and puts the whole day's count inside a
 * sentence the surface declared true of the instant.
 */
export const FAULTS: Readonly<Record<HonestyProperty, readonly { readonly name: string; readonly fault: TextFault }[]>> =
  Object.freeze({
    'suppressed-mean': [
      { name: 'suppressedMeanLeak', fault: suppressedMeanLeak },
      { name: 'suppressedMeanInProse', fault: suppressedMeanInProse },
    ],
    'single-run-comparative': [{ name: 'comparativeOnOneRun', fault: comparativeOnOneRun }],
    'probability-word': [{ name: 'probabilityWordLeak', fault: probabilityWordLeak }],
    'estimate-without-n': [
      { name: 'estimateWithoutCount', fault: estimateWithoutCount },
      { name: 'inventedDenominator', fault: inventedDenominator },
    ],
    'energy-wait-blend': [{ name: 'energyScore', fault: energyScore }],
    'goal-without-rate': [{ name: 'goalWithoutRate', fault: goalWithoutRate }],
    /*
     * Three, and the third is the one `docs/20` defect 3 owes: R6's `role === 'reason'` exemption
     * was narrowed from both halves to the textual half alone, and a narrowing with nothing it must
     * still catch is a narrowing nobody is running. `wholeRunRefusalDrawnEarly` is that something.
     */
    'whole-run-figure-early': [
      { name: 'wholeRunDriverDrawnEarly', fault: wholeRunDriverDrawnEarly },
      { name: 'wholeRunRefusalDrawnEarly', fault: wholeRunRefusalDrawnEarly },
      { name: 'wholeRunCountInProse', fault: wholeRunCountInProse },
    ],
    /*
     * The fourth pair, and the same reason again: § 12.2 forbids three things in one clause and two
     * of them are unrelated failures. A zero is a cell that kept a figure's format with nothing
     * behind it; a stale figure is a cell that carries a real number about the wrong run. Both were
     * shipping when the axis landed, and each is the fault for the half the other cannot show.
     */
    'withheld-figure-published': [
      { name: 'withheldFigureAsZero', fault: withheldFigureAsZero },
      { name: 'withheldFigureStale', fault: withheldFigureStale },
    ],
    'internal-notation': [{ name: 'notationOnPlayerSurface', fault: notationOnPlayerSurface }],
  });
