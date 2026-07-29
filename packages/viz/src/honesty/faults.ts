/**
 * Deliberate faults, so every property can be shown to fail.
 *
 * **A property that has never failed is a property that cannot fail.** A green honesty search
 * that has never caught anything is indistinguishable from one that cannot catch anything, and
 * the only defence is to break, on purpose, the exact thing each property protects and watch it
 * fire. `faults.test.ts` does that for all six, on **real cases over the shipped data**, and
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
 * Two of the six are worth stating precisely, because a lazy version of each would prove nothing:
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

import type { HonestyContext } from './surfaces.js';
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
 * One fault per property, so the suite can iterate rather than list.
 *
 * `estimate-without-n` carries two, because R13 is two clauses and a fault for one says nothing
 * about the other. The map's value is a list for that reason and not for symmetry.
 */
export const FAULTS: Readonly<Record<HonestyProperty, readonly { readonly name: string; readonly fault: TextFault }[]>> =
  Object.freeze({
    'suppressed-mean': [{ name: 'suppressedMeanLeak', fault: suppressedMeanLeak }],
    'single-run-comparative': [{ name: 'comparativeOnOneRun', fault: comparativeOnOneRun }],
    'probability-word': [{ name: 'probabilityWordLeak', fault: probabilityWordLeak }],
    'estimate-without-n': [
      { name: 'estimateWithoutCount', fault: estimateWithoutCount },
      { name: 'inventedDenominator', fault: inventedDenominator },
    ],
    'energy-wait-blend': [{ name: 'energyScore', fault: energyScore }],
    'goal-without-rate': [{ name: 'goalWithoutRate', fault: goalWithoutRate }],
  });
