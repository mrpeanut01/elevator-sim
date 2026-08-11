/**
 * The Day report as **Casual** reads it — GitHub issues
 * [#110](https://github.com/mrpeanut01/elevator-sim/issues/110) and
 * [#100](https://github.com/mrpeanut01/elevator-sim/issues/100), under
 * [`DECISIONS.md` § D299](../../../../DECISIONS.md) and [§ D301](../../../../DECISIONS.md).
 *
 * **A decision number is owed for this module.** It is not allocated here: two lanes have already
 * collided over one, so the argument lives in this docstring and the number is assigned at
 * integration.
 *
 * ## What was measured, before anything was built
 *
 * #110 reports Casual as *"Engineer with four sentences swapped"* and measures the Day report at
 * 4 473 characters against Engineer's 4 694. Driven on this branch — a `vertical-city` run at
 * 16 %pop/5 min, saturating, and a `garden-apartments` run that does not — the sheet is **worse
 * than that and in a more useful way**:
 *
 * - `DayReportInput` has no mode field and `dev/reportPanel.ts#reportViewOf` had no mode parameter,
 *   so the **sheet itself was byte-identical in the two modes** — structurally, because no input to
 *   it could carry a mode. What #110's 221 characters *are* is not measured here: the two
 *   mode-aware things sharing that tab are `dev/leftRail.ts`'s *hide the maths* block, which Casual
 *   hides, and `render/mood.ts`'s casual leads, and attributing the delta to either needs a DOM
 *   this repository has no jsdom for.
 * - The sheet's **prose is already people-shaped**, which #110 does not say and which matters,
 *   because it means the fix is not a glossary. The saturated lede reads *"It did not cope. 2 843
 *   people asked for a lift and 2 830 got one, with 1 still standing when the window closed."*
 *   That is already the Casual sentence.
 * - What is **not** people-shaped is the **order of the figure grid** and the **refusal**. The one
 *   cell a run may refuse sits third, ahead of every count of people; and when it is refused a
 *   Casual reader gets `core`'s statistics prose verbatim — *"Queue length rose by 268.0 persons
 *   (53.59/min, 12.0× the queue's own scatter) over the 300 s reporting window, against thresholds
 *   8 persons and 0.5/min; the system is saturated, AWT is not approximately normal and its
 *   confidence interval must be suppressed."* That is #100's example, reproduced exactly.
 *
 * ## The reframing, which is the deliverable
 *
 * Engineer's question of a run is *what is the average wait, over what `n`, in what window, and may
 * I quote it?* Casual asks a different question of the same run: **did the building have a good
 * day, and what would make tomorrow better?** The vocabulary follows from that; it is not the point
 * of it. Three consequences, and each is a thing this module does:
 *
 * 1. **The grid leads with people.** {@link CASUAL_FIGURE_ORDER} puts the counts first — carried,
 *    gave up, the worst wait one person had, the deepest a landing stood — and the two figures that
 *    are *estimates over a window* after them. Leading with the refusable estimate is Engineer's
 *    ordering because the estimate is what an engineer came for. Nothing is dropped: see
 *    {@link casualFigureOrderOf}, which is asserted to be a permutation in both directions.
 * 2. **A refusal is worded for the reader who met it.** {@link casualNoteFor} leads a withheld cell
 *    with `mode/disclosure.ts#suppressionLeadFor` — the **same** per-ground sentence the run-summary
 *    disclosure already uses, imported rather than re-written, because two copies of *how a refusal
 *    is worded to a Casual reader* is the duplication issue #22's lane exists to remove.
 * 3. **The levers become the question they answer.** {@link CASUAL_LEVERS_HEADING} reframes
 *    *Levers you actually have* — control vocabulary — as *What would make tomorrow better*, which
 *    is the manager's question and the second half of Casual's own.
 *
 * ## What this module is forbidden to do, and the three rules it keeps
 *
 * The rules are `mode/disclosure.ts#CASUAL_LEAD_BY_FIGURE`'s, unchanged, because the failure they
 * were written against is the failure available here:
 *
 * 1. **It never restates a figure.** {@link ReportFigure.value} is carried through untouched and
 *    nothing below formats, rounds or re-derives a number. `dev/reportPanel.ts` has no arithmetic
 *    by construction and this module is on the same side of that line: a plain retelling of
 *    `16.0 s` would be a second copy of a figure, which is a second figure.
 * 2. **It never simplifies a claim into a false one.** The plain word for a suppressed mean is not
 *    *"a busy day"*. A refused average stays visibly refused — the cell still reads `withheld`, the
 *    tone is still `withheld`, and `core`'s own sentence still follows the lead **verbatim**.
 * 3. **It leads, it does not replace.** Every note this module returns ends with the engineer's own
 *    note, byte for byte. A Casual sentence must be as true as the Engineer one it replaces, and
 *    the cheapest way to guarantee that is not to replace it.
 *
 * ## And it may not become a ceiling — § D299 § 2
 *
 * *Named play styles are an entry point, never a ceiling.* So nothing here withholds a figure: the
 * Casual grid carries **every** cell the Engineer grid does, in a different order and with a lead
 * on some of the notes. {@link CASUAL_REACH_NOTE} says so on the sheet, because a reader who cannot
 * see that the two views differ in wording rather than in reach has been given a smaller product
 * and told it is a simpler one.
 *
 * That is also why {@link CASUAL_HIDES} does not exist. `mode/disclosure.ts` has a `BASIC_HIDES`,
 * and it is right to: § 4 of the experience-layer contract names two figures Basic may leave out of
 * the *run summary*. The Day report is the surface a player forms their judgement of a run on, and
 * a figure missing from it is a figure a Casual player never learns exists.
 */

import { suppressionLeadFor } from './disclosure.js';
import type { ReportFigure } from '../shift/types.js';

/* -------------------------------------------------------------------------- *
 * The order — people first
 * -------------------------------------------------------------------------- */

/**
 * The Casual grid's order, by `ReportFigure.id`.
 *
 * The shipped Engineer order is `shift/report.ts#figuresFor`'s: carried, away inside a minute,
 * average wait, worst wait, deepest queue, took the stairs, then the energy pair. It is a good
 * order **for an engineer** — the two cohort statistics are third and fourth, where somebody
 * looking for them will find them — and it is the reason a Casual reader meets a cell that may
 * read `withheld` before they meet a single count of people.
 *
 * This order is the four questions a player can answer without a statistics vocabulary, then the
 * two that need one, then the axis that is never a score:
 *
 * | rank | id | what a reader gets from it |
 * |---|---|---|
 * | 1 | `carried` | how many people the building got where they were going |
 * | 2 | `stairs` | how many stopped waiting and walked |
 * | 3 | `worst-wait` | the longest one person stood |
 * | 4 | `deepest-queue` | the most people on one landing at once |
 * | 5 | `minute` | the share away inside a minute — a ratio of counts, never suppressed |
 * | 6 | `average-wait` | the one cell this run may refuse |
 * | 7–8 | the energy pair | § D106's axis, last because it is never a score |
 *
 * **An id this list does not name keeps its Engineer position, at the end.** That is not a
 * fallback nobody reaches: a ninth figure is one edit to `figuresFor` away, and a reorder that
 * silently dropped it would be a figure a Casual player never sees. See
 * {@link casualFigureOrderOf}.
 */
export const CASUAL_FIGURE_ORDER: readonly string[] = Object.freeze([
  'carried',
  'stairs',
  'worst-wait',
  'deepest-queue',
  'minute',
  'average-wait',
  'energy-work',
  'energy-per-leg',
]);

/**
 * Reorder a sheet's figure grid people-first — a **permutation**, and asserted as one.
 *
 * Total and order-preserving on the tail: cells this build has no opinion about keep their relative
 * order and follow the ones it does. So the result has the same length and the same members as the
 * input on every possible input, which is the property `mode/casualDay.test.ts` checks in both
 * directions rather than by reading this function.
 *
 * Generic over the cell type so `dev/reportPanel.ts` can call it on either `ReportFigure` or its
 * own `FigureView`, and so a test can call it on a synthetic id set that no shipped sheet produces
 * — § D134's fictional-schema technique, pointed at an ordering instead of at a schema.
 */
export function casualFigureOrderOf<T extends { readonly id: string }>(
  figures: readonly T[],
): readonly T[] {
  const rank = (cell: T): number => {
    const found = CASUAL_FIGURE_ORDER.indexOf(cell.id);
    return found === -1 ? CASUAL_FIGURE_ORDER.length : found;
  };
  return figures
    .map((cell, index) => ({ cell, index }))
    /*
     * `index` as the tie-break, and it is load-bearing rather than defensive. Two cells this list
     * does not name both rank `length`, and a comparator that returned 0 for them would leave their
     * order to the engine's sort stability — which is specified in modern JavaScript and is still
     * an implicit dependency where an explicit one costs one term.
     */
    .sort((a, b) => rank(a.cell) - rank(b.cell) || a.index - b.index)
    .map((entry) => entry.cell);
}

/* -------------------------------------------------------------------------- *
 * The notes — a lead in front of the engineer's own words
 * -------------------------------------------------------------------------- */

/**
 * The sentence Casual puts in front of a cell's own note, by figure id.
 *
 * Not exported, for `mode/disclosure.ts#CASUAL_LEAD_BY_FIGURE`'s stated reason: a new exported
 * prose declaration is an unclassified surface to `honesty/derive.test.ts`, and these reach the
 * honesty search through {@link casualNoteFor}, which `honesty/surfaces.ts` drives on both modes.
 *
 * Four entries and not eight, and the four that are absent are the argument for the four that are
 * here. `worst-wait`'s own note is *"one rider, and they remember it"*, which is the best sentence
 * on the sheet and needs no help; `carried`'s is *"of 2 843 who turned up"*, which is a
 * denominator in plain words already. A lead in front of either would be this module adding length
 * to prove it ran, which is the failure mode of a plain-language layer.
 *
 * What the four have in common is that each one contains a word about the **apparatus** rather than
 * about the building: *suppressed*, *peak-5min window*, *horizon*, *out-of-balance mechanical
 * work*. Every lead below says what the cell means to a person in the lobby, and then the
 * engineer's sentence follows unedited.
 */
const CASUAL_LEAD_BY_CELL: Readonly<Record<string, string>> = Object.freeze({
  minute:
    'A head count of people, not an estimate — which is why this figure is still here on a day ' +
    'the average below it is refused.',
  'average-wait':
    'Averaged over the busiest five minutes of the day rather than over all of it: this is what ' +
    'a wait came to when the building was under the most pressure, which is the stretch worth ' +
    'judging it on.',
  /*
   * Rewritten for `docs/19` defect 3, and the old sentence is quoted because it was false twice
   * over: *"People who stopped waiting and walked. They are counted here and nowhere else."* The
   * cell counts **waits that crossed the give-up horizon**, whether or not a car eventually came
   * — on a saturated no-patience run every one of those riders was still carried, so they were
   * counted *here and in CARRIED*, and the claim of a disjoint cohort is what made the sheet's
   * people impossible to total. The lead now says what the count is and defers the overlap to
   * the cell's own note (`shift/report.ts#stairsNote`), which carries the run's actual split —
   * a static lead may not restate a figure, so it may not guess the overlap either.
   */
  stairs:
    'People this building made stand past its give-up line. The note beside the count says how ' +
    'many of them a car still came for — those are inside CARRIED as well, so the two cells can ' +
    'overlap rather than add. The count is published beside the average and never folded into ' +
    'it: dropping the longest waits is what would flatter the day.',
  'energy-work':
    'How hard the motors worked. It is read beside the waits and never added to them: a day ' +
    'that spends less by carrying fewer people has not saved anything.',
});

/**
 * A cell's note as Casual draws it — the lead, then the sheet's own note, byte for byte.
 *
 * Three cases, in the order they are decided:
 *
 * 1. **A refused cell** takes `mode/disclosure.ts#suppressionLeadFor`, keyed on the ground the
 *    sheet carries (`ReportFigure.suppressionGround`, read off `VizSummary` by
 *    `shift/report.ts#averageWaitFigure` and never re-derived here). A ground this build has no
 *    wording for, and a refusal that carries none at all, both fall back to the ground-free
 *    sentence — which is what every consumer had before codes existed, and is why the fallback is a
 *    behaviour rather than a branch nobody reaches.
 * 2. **A cell with a lead** gets it in front of its own note.
 * 3. **Everything else** is returned unchanged. That is the honest default: a missing translation
 *    shows the engineer's words rather than nothing.
 *
 * The refusal case is checked on `tone` and not on the value string, for
 * `dev/reportPanel.ts#figureViewOf`'s stated reason: reading the word `withheld` out of a value
 * would make the wording depend on a formatting decision made three modules away.
 */
export function casualNoteFor(cell: ReportFigure): string {
  if (cell.tone === 'withheld') {
    return `${suppressionLeadFor(cell.suppressionGround)} ${cell.note}`;
  }
  const lead = CASUAL_LEAD_BY_CELL[cell.id];
  return lead === undefined ? cell.note : `${lead} ${cell.note}`;
}

/* -------------------------------------------------------------------------- *
 * The two headings, and the small print
 * -------------------------------------------------------------------------- */

/**
 * What the lever cards are called in Casual — *the question*, rather than the mechanism.
 *
 * `index.html` authors `<h3>Levers you actually have</h3>`, which is a sentence about controls: it
 * tells a reader that the four cards are things they are permitted to move. Casual's second
 * question is *what would make tomorrow better*, and these four cards are the sheet's only answer
 * to it — so in Casual the heading is the question and the cards are the answer.
 *
 * Engineer's heading is **not** written from here, and the asymmetry is deliberate:
 * `ReportView.leversHeading` is `undefined` in Engineer, which means *leave what the markup
 * authored*. Writing `'Levers you actually have'` from TypeScript would put a second copy of a
 * string `index.html` owns into this package, and the two would drift the first time either moved
 * — which is the duplication this repository keeps finding rather than a hypothetical.
 */
export const CASUAL_LEVERS_HEADING = 'What would make tomorrow better';

/**
 * The sentence Casual puts in front of the small print — a **translation**, and the one place this
 * module answers issue #100 in its own words.
 *
 * #100 names three terms: `SATURATED`, `AWT`, and *cost formulas*, and adds *peak-5min window* and
 * *confidence interval* for the Day report. Two of those five are in the small print and nowhere
 * else on this sheet, and neither may be deleted from it: *the peak-5min window* is the basis of
 * every mean on the grid, and *a confidence interval that excludes zero* is the bar this whole
 * repository exists to hold. § D299's test — *a change may make Engineer easier to use; it may not
 * make it say less* — binds in the other direction too, because the small print is the same
 * paragraph in both modes.
 *
 * So it is translated rather than replaced, and the translation leads. A reader who wants the
 * engineer's exact words has them, immediately after, unedited.
 *
 * **It is a translation and not a summary.** It says what each phrase means; it does not say
 * whether this run was good, does not name a dispatcher, and does not shorten the claim about what
 * one day can support — that claim is the small print's whole point and softening it here would be
 * this module doing the thing it was built to refuse.
 */
export const CASUAL_SMALL_PRINT_LEAD =
  'Two phrases below are worth having before you read them. “The peak-5min window” is the busiest ' +
  'five minutes of the day: the averages here are taken over that stretch and not over the whole ' +
  'shift, so a wait quoted on this sheet is a wait during the worst of it. “A confidence interval ' +
  'that excludes zero” is the bar for saying one setting beat another — one day cannot clear it, ' +
  'and fifty or more paired runs can, which is what Compare is for.';

/**
 * What Casual says about **reach** — § D299 § 2, on the sheet rather than in a decision record.
 *
 * The measured failure this replaces is a mode that differed by 44 words out of 919 with three
 * surfaces byte-identical. The failure it is trying not to become is the other one: a mode that
 * quietly caps what a player can reach and looks tidier for it. A reader cannot tell those apart
 * from inside one of them, so the sheet says which it is.
 *
 * Every clause is checkable against this module: *every figure* is
 * {@link casualFigureOrderOf} being a permutation; *the wording that leads* is
 * {@link casualNoteFor} appending rather than replacing; *what is reachable* is the absence of a
 * `CASUAL_HIDES` set.
 *
 * It names the control by its label and **not by where it is**. The label is `view`; its position
 * is not a fact this module may assert, because GitHub issue #72 established the selector is
 * `display: none` below about 1 180 px, so *"top right"* is false on a narrow window and
 * *"in the header"* is false with the menu open (#110 § 3). A sentence that is true on one viewport
 * is the stale-refusal defect § D227 records, filed before it happens.
 */
export const CASUAL_REACH_NOTE =
  'This is the plain-language view. It carries every figure the engineer’s view carries — what ' +
  'differs is the wording and which figures lead, never what you can reach or change. The “view” ' +
  'control switches between them.';
