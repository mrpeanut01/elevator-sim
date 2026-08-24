/**
 * The nine properties, as predicates over rendered strings and the run's own statistics.
 *
 * Each derives from a rule in [`docs/10`](../../../../docs/10-experience-layer-contract.md) § 1
 * and is quoted from it here rather than paraphrased, because a property that restates a rule
 * loosely is a property that passes for the wrong reason.
 *
 * **The ninth is the exception, and it is quoted the same way.** `internal-notation` derives from
 * `CHARTER_PROGRAMME.md` § M2's third exit criterion rather than from `docs/10`, because it is a
 * gate on a milestone rather than a rule of the experience layer — the first property here whose
 * source is the programme. It obeys every convention below regardless: it is a predicate over
 * rendered strings, it re-implements nothing, and it has a fault in `faults.ts`.
 *
 * ## The rule every check below obeys
 *
 * **The statistics decide; the string is what is judged.** Whether a mean may be shown is
 * `meansAreSuppressed(recording)`'s answer — the shipped gate `frame/overlay.ts` exports and
 * `render/runSummary.ts` already calls. Whether a comparison is resolved is
 * `BatchComparisonRow.verdict`'s answer. Whether a word is a probability word is
 * `campaign/words.ts#probabilityWordIn`'s answer. Nothing here re-implements a suppression rule,
 * and nothing here holds a second copy of the probability-word list — `words.ts` says in as many
 * words that two test-local copies already exist and that quietly adding a third is how a guard's
 * meaning erodes.
 *
 * ## Why three of the seven are checked structurally *and* textually
 *
 * R3, R13 and R6 are all rules about a **pairing**: a value and its licence, a value and its `n`, a
 * value and the window it is true of. The structural check catches the surface classifying wrongly
 * (`kind: 'estimate'` on a run whose summary refuses one; `basis: 'whole-run'` drawn at a part-way
 * playhead); the textual check catches a surface classifying correctly — or declaring nothing at all
 * — and printing the number anyway, somewhere else. Neither subsumes the other, and `faults.ts`
 * injects one of each.
 */

import { MIN_REPLICATION_BUDGET } from '../batch/report.js';
import { probabilityWordIn } from '../campaign/words.js';
import { observationsAt } from '../live/observations.js';
import type { LiveObservations } from '../live/types.js';
import { GOAL_JUDGEMENT, GOAL_KINDS } from '../scenario/goals.js';
import { MIN_SEEDS_PER_GOAL } from '../scenario/published.js';
import { PLAYER_FACING_SURFACES, type HonestyContext } from './surfaces.js';
import type {
  HonestyProperty,
  HonestyViolation,
  RenderedText,
  TextProvenance,
} from './types.js';

/** How much of an offending string a violation quotes. Enough to find it; never a paraphrase. */
const QUOTE_LIMIT = 220;

function violation(
  property: HonestyProperty,
  text: RenderedText,
  message: string,
): HonestyViolation {
  return {
    property,
    message,
    surfaceId: text.surfaceId,
    field: text.field,
    text: text.text.length > QUOTE_LIMIT ? `${text.text.slice(0, QUOTE_LIMIT)}…` : text.text,
  };
}

/* -------------------------------------------------------------------------- *
 * R3 — no mean displayed where `awtIsValid` is false
 * -------------------------------------------------------------------------- */

/**
 * Words that make a number a claim about a *cohort* rather than about a person or a moment —
 * **per quantity**, not as one list.
 *
 * Deliberately narrow. `docs/10` § 1's whole distinction is observation versus estimate, and
 * *"the longest wait was 88 s"* is an observation that is drawn on a saturated run **on purpose**
 * — R4: *"seeing the divergence is the point."* So the cues name the three estimate classes
 * `VizSummary.awtIsValid` actually speaks for and nothing else.
 *
 * ## Why they are keyed by quantity, and what one flat list cost — the **fifth** false positive
 * this search has corrected in the rule rather than in the product
 *
 * A flat list pairs *any* cue with *any* of the three refused values, and that is not what R3
 * says: R3 forbids a surface presenting **this quantity's** refused value. Measured on
 * `honesty-9010` (Vertical City, `nearest-car`, saturated, `wait95S = 300.4`), the flat list
 * reported `describeFrame` as printing `wait95S` — on this sentence:
 *
 * > `Rolling mean wait over the last 300 seconds is not reported.`
 *
 * The `300` is the **reporting window's length in seconds**, which happens to equal `wait95S`
 * rounded; the cue that paired with it is *"mean"*, which names a different quantity; and the
 * sentence is `describeFrame`'s **refusal**, produced by the very branch § D111 added. Keying the
 * cues to the quantity whose value is being looked for makes the check say what the rule says.
 *
 * **What it costs, stated rather than glossed:** a surface that published `wait95S` under a word
 * this map assigns to `meanWaitS` — *"typical wait: 171.6 s"* — would now be missed, where the
 * flat list would have caught it by accident. That is a real narrowing and it is the right trade:
 * a check that fires on a coincidence between two unrelated quantities is not evidence about
 * either, and the mislabelled-figure case is R13's and R9's territory — the figure's own `kind`
 * and `gated` flag, which the structural half reads and which no wording can talk it out of.
 */
const ESTIMATE_CUES: Readonly<Record<'meanWaitS' | 'wait95S' | 'meanTimeToDestinationS', RegExp>> =
  Object.freeze({
    meanWaitS: /\b(?:average|mean|awt|typical)\b/i,
    wait95S: /\b(?:95th|wt95|percentile|one in twenty|1 in 20)\b/i,
    meanTimeToDestinationS: /\b(?:time to destination|ttd)\b/i,
  });

/** Any of them — the cheap pre-filter, derived from the map rather than restated beside it. */
const ANY_ESTIMATE_CUE = new RegExp(
  Object.values(ESTIMATE_CUES)
    .map((cue) => cue.source)
    .join('|'),
  'i',
);

/** Every rendering of a number a reader could match against the printed figure. */
function renderings(value: number): readonly string[] {
  const forms = new Set<string>();
  for (const places of [0, 1, 2, 3]) forms.add(value.toFixed(places));
  return [...forms].filter((form) => Number(form) !== 0);
}

/**
 * A **whole** number as a reader sees one, so a form is compared against a token and never
 * against a substring.
 *
 * The sixth false positive this rule has corrected, and the cheapest to state: `String.indexOf`
 * has no idea what a number is. On `honesty-9100022` (deep tier) `wait95S` rounded to **9** and
 * `meanWaitS` to **3**, and the search duly reported the `9` inside *"**9**5th percentile"* — the
 * cue itself — and the `3` inside *"the last **3**00 seconds"*. It had been doing the same
 * quieter thing all along: `61` matched inside *"loaded at 0.**61** of rated load"* on every car
 * row of every frame.
 *
 * Matching a form against a complete token fixes all of it at once and gives up nothing a
 * renderer does: a surface that publishes a refused mean prints the number, and a printed number
 * is a token. **Known limit:** a form is generated without a thousands separator, so a surface
 * that printed `1,061.0 s` would not be matched. No shipped formatter groups a wait in seconds.
 */
const NUMBER_TOKEN = /\d[\d,]*(?:\.\d+)?/;

/**
 * How close a cue and a number must be to be one claim. Characters.
 *
 * **Found by running it, and it is the difference between a check and a coincidence.**
 * `describeFrame` returns one paragraph of eight sentences — *"…at 3:02 of 10:00. 29 legs
 * waiting… Mean waiting time is suppressed: …"* — so a rule that asked only whether the cue and
 * the number appeared *in the same string* reported the paragraph as printing `meanWaitS = 29`.
 * The 29 was a queue count, the cue was in a different sentence, and the surface was doing
 * exactly the right thing. 64 characters is about a clause.
 *
 * It is a **cap** on the clause, not the clause itself. See {@link clauseSpans}.
 */
const CLAIM_PROXIMITY = 64;

/**
 * Where one clause ends and the next begins — and the **fourth false positive this search has
 * corrected in the rule rather than in the product**.
 *
 * ## The finding
 *
 * A character count is not a clause, and the difference is not academic. Measured on
 * `honesty-9021` (Mixed-Use High-Rise, `eta`, saturated, `meanWaitS = 60.996`), the rule above
 * reported **eight** violations across `describeFrame` and `drawScene`, at five playback instants
 * on one run. Every one of them was this shape:
 *
 * > `…, with 61 passengers undelivered.` **`Mean waiting time is suppressed:`** ` Queue length
 * > rose by 97.3 persons…`
 *
 * The `61` is the **undelivered passenger count** — `summary.undelivered`, which happens to equal
 * `meanWaitS.toFixed(0)` on this run — in its own sentence. The estimate cue 64 characters later
 * is the first word of **the refusal**. The canvas cases are the same defect with a different
 * separator: `waiting 61   boarded 368 legs   mean wait suppressed` and `TIMED-OUT — 61
 * undelivered   ·   SATURATED — AWT suppressed`. Not one of the eight strings printed a mean;
 * three of them said *"suppressed"* in the very clause that triggered the report, and
 * `describeFrame` said *"Rolling mean wait … is **not reported**"* in the same paragraph. The
 * decisive evidence is `@0s`: at that instant the frame has `0 legs waiting, 0 boarded`, so a
 * running mean of 61 s could not exist — the number is a run-level count the playback carries
 * unchanged at every instant, which is what all five instants reporting the *same* value showed.
 *
 * `properties.ts` already knows this: *"the refusal is the one string entitled to quote the
 * numbers it is refusing"*, which is why `role === 'reason'` is skipped. What it could not
 * express is a refusal **embedded** in a longer string — a paragraph, a canvas status line —
 * whose role as a whole is `prose`.
 *
 * ## The correction, and what it deliberately is not
 *
 * The window is bounded by the clause the numeral is actually in. A claim is made *in* a clause;
 * the character count approximated one and crossed sentence boundaries, which is the same
 * correction § D171 records for this rule's third false positive, applied one level finer.
 *
 * The rejected alternative was to treat a cue governed by a refusal word (*"suppressed"*, *"not
 * reported"*) as not a cue. That is an **allow-word**, and an allow-word is a place for a leak to
 * hide: *"the mean wait, 61.0 s, is suppressed"* would pass it. Clause bounding needs no such
 * list, and it clears all eight.
 *
 * **It did not clear everything, and the run that proved it is worth reading.** With this bound in
 * place the corpus produced a *ninth* report — `wait95S` matched inside `describeFrame`'s own
 * refusal, in one clause with a cue naming a different quantity. That one is corrected by
 * {@link ESTIMATE_CUES} and not by widening this. Two independent narrowings, each of which makes
 * the check more specific rather than more forgiving.
 *
 * ## What counts as a break, and what deliberately does not
 *
 * - Sentence punctuation **followed by whitespace**, so `0.61`, `16:22` and `97.3` are untouched.
 * - `·`, the separator `describeLockedOut` and the canvas banner join fields with.
 * - A run of two or more spaces — the canvas's column gap. `drawScene`'s header joins three
 *   fields with three spaces and keeps each field's own label beside its own value, so § D111's
 *   defect (`mean wait so far 21.0 s`) still lands inside **one** clause. `faults.ts` injects
 *   exactly that string, so this bound is falsifiable rather than argued.
 * - **Not `:`.** A colon separates a label from its value — `average wait: 61.0 s` is one claim —
 *   and breaking on it would have made the R3 fault stop firing textually. Found by running it.
 */
const CLAUSE_BREAK = /[.;!?](?=\s|$)|\s·\s|\s{2,}|\n/;

/**
 * The half-open spans of `text` between clause breaks. One pass, reused for every numeral.
 *
 * Compiles its own global copy rather than adding `g` to {@link CLAUSE_BREAK}: a module-level
 * global regex carries `lastIndex` between calls, which makes the *second* caller of a shared
 * instance read a different string from the first. That is a bug this file is not going to have.
 */
function clauseSpans(text: string): readonly { readonly from: number; readonly to: number }[] {
  const spans: { from: number; to: number }[] = [];
  const breaks = new RegExp(CLAUSE_BREAK.source, 'g');
  let from = 0;
  for (let match = breaks.exec(text); match !== null; match = breaks.exec(text)) {
    spans.push({ from, to: match.index });
    from = match.index + match[0].length;
  }
  spans.push({ from, to: text.length });
  return spans;
}

/**
 * `text` with the run's **own refusal** cut out of it — the string-level exemption, made to
 * compose.
 *
 * ## Why this is not an allow-word
 *
 * `checkSuppressedMean` already skips `role === 'reason'`, because *"the refusal is the one string
 * entitled to quote the numbers it is refusing"*. `awtIsValid`'s **fourth ground** takes that
 * literally: when a run is refused for a leg past the 900 s abandonment horizon, `core` writes
 *
 * > `… but a mean of 49.6 s reported beside a wait of 1339.6 s describes a system nobody
 * > experienced, and its confidence interval must be suppressed.`
 *
 * — the mean, the cue naming it, and the refusal, all in one clause, by design. `describeFrame`
 * embeds that sentence in its paragraph (`Mean waiting time is suppressed: …`) and `drawScene`
 * puts it under the canvas, so both come back `prose` and the string-level exemption misses them.
 * Found on `honesty-9100022` in the deep tier.
 *
 * What is removed is **the run's own `awtInvalidReason`, by identity** — not a word, not a
 * pattern, not a list. A leak one character outside it is still seen, and a leak inside it is
 * `core`'s own sentence. The cut is replaced by a newline so the surrounding text still reads as
 * two clauses rather than being spliced into one.
 */
function withoutRefusal(text: string, reason: string | undefined): string {
  if (reason === undefined || reason === '') return text;
  return text.includes(reason) ? text.split(reason).join('\n') : text;
}

/** Every whole number in `text`, with where it starts. One pass, reused for every form. */
function numberTokens(text: string): readonly { readonly value: string; readonly at: number }[] {
  const tokens: { value: string; at: number }[] = [];
  const scan = new RegExp(NUMBER_TOKEN.source, 'g');
  for (let match = scan.exec(text); match !== null; match = scan.exec(text)) {
    tokens.push({ value: match[0], at: match.index });
  }
  return tokens;
}

/**
 * The clause in which `text` states `numeral` as the value `cue` names — `undefined` when it does
 * not, which is the case where the numeral and the cue are near each other by luck.
 *
 * Returns the clause rather than a boolean so that a caller which needs to ask a **second** question
 * of the same words can ask it of exactly the words the first question was answered on. R6 does: a
 * whole-run figure that names its own window is not R6's defect, and *"names its own window"* has to
 * be read in the numeral's own clause or it becomes a per-string allow-phrase.
 */
function claimClause(
  text: string,
  numeral: string,
  spans: readonly { readonly from: number; readonly to: number }[],
  tokens: readonly { readonly value: string; readonly at: number }[],
  cue: RegExp,
): string | undefined {
  for (const token of tokens) {
    // A **whole** number, never a substring of one. See NUMBER_TOKEN.
    if (token.value !== numeral) continue;
    const at = token.at;
    const end = at + numeral.length;
    const span = spans.find((candidate) => at >= candidate.from && end <= candidate.to);
    if (span === undefined) continue;
    // Named `clause`, not `window`: `boundaries.test.ts` bans a bare `window` identifier anywhere
    // outside `dev/`, precisely because a local of that name shadowing the global is how a DOM
    // reference hides. It caught this one.
    const clause = text.slice(
      Math.max(span.from, at - CLAIM_PROXIMITY),
      Math.min(span.to, end + CLAIM_PROXIMITY),
    );
    if (cue.test(clause)) return clause;
  }
  return undefined;
}

/** Whether `text` states `numeral` as the value `cue` names, rather than nearby by luck. */
function claimsNear(
  text: string,
  numeral: string,
  spans: readonly { readonly from: number; readonly to: number }[],
  tokens: readonly { readonly value: string; readonly at: number }[],
  cue: RegExp,
): boolean {
  return claimClause(text, numeral, spans, tokens, cue) !== undefined;
}

/**
 * R3 — *"Suppression replaces the number, it never hides it."*
 *
 * Two checks:
 *
 * 1. **Structural.** On a run where `meansAreSuppressed` is `true`, no string carrying one of the
 *    three quantities `awtIsValid` speaks for may come back classified `estimate`. The `gated`
 *    flag is set by the adapter from the shipped figure ids, and the classification is the
 *    surface's own; disagreeing with the summary is the defect. **Not** every estimate: the
 *    achieved interval is an estimate `awtIsValid` does not speak for and is legitimately drawn.
 * 2. **Textual.** On the same run, no string other than the refusal itself may carry the printed
 *    value of `meanWaitS`, `wait95S` or `meanTimeToDestinationS` **within a clause of a cue that
 *    names that quantity**. Every half is required, and each of the last four was found by
 *    running this over the shipped surfaces and corrected **here** rather than in the product:
 *    a bare number is not a claim; a cue with no number is a label; two in **different sentences**
 *    are neither ({@link CLAUSE_BREAK}); a number matching *one* quantity beside a cue for
 *    *another* is a coincidence ({@link ESTIMATE_CUES}); a run's **own refusal** may state the
 *    number it refuses ({@link withoutRefusal}); and a *substring* of a printed number is not a
 *    printed number ({@link NUMBER_TOKEN}).
 */
function checkSuppressedMean(
  context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  if (!context.suppressed) return [];
  const { summary } = context.recording;
  const found: HonestyViolation[] = [];

  const forbidden: {
    readonly name: string;
    readonly cue: RegExp;
    readonly forms: readonly string[];
  }[] = [];
  for (const [name, value] of [
    ['meanWaitS', summary.meanWaitS],
    ['wait95S', summary.wait95S],
    ['meanTimeToDestinationS', summary.meanTimeToDestinationS],
  ] as const) {
    // Keyed by the field name, so a quantity added to the triple without a cue is a type error.
    if (Number.isFinite(value)) forbidden.push({ name, cue: ESTIMATE_CUES[name], forms: renderings(value) });
  }

  for (const text of texts) {
    if (text.provenance !== 'single-run') continue;
    if (text.role === 'estimate' && text.gated === true) {
      found.push(
        violation(
          'suppressed-mean',
          text,
          `the run's own summary refuses its estimates (awtIsValid=${String(summary.awtIsValid)}, ` +
            `saturated=${String(summary.saturated)}) and this surface classified the string as an ` +
            'estimate anyway. R3: suppression replaces the number.',
        ),
      );
      continue;
    }
    // The refusal is the one string entitled to quote the numbers it is refusing.
    if (text.role === 'reason') continue;
    if (!ANY_ESTIMATE_CUE.test(text.text)) continue;
    const scanned = withoutRefusal(text.text, summary.awtInvalidReason);
    const spans = clauseSpans(scanned);
    const tokens = numberTokens(scanned);
    for (const { name, cue, forms } of forbidden) {
      const hit = forms.find((form) => claimsNear(scanned, form, spans, tokens, cue));
      if (hit === undefined) continue;
      found.push(
        violation(
          'suppressed-mean',
          text,
          `prints ${name} (${hit}) beside a cue that names it, on a run whose summary refuses it. ` +
            `Reason on the run: ${summary.awtInvalidReason ?? '(none recorded)'}`,
        ),
      );
      break;
    }
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * R2 — no comparative claim sourced from a single replication
 * -------------------------------------------------------------------------- */

/**
 * A claim that one configuration came out ahead of another.
 *
 * **Narrowed twice, and both narrowings were found by running it.** The first version fired on
 * every bare comparative, which made *"the longest wait"* a violation — a superlative about one
 * run, which R2 explicitly permits: *"a single-run surface may say 'in this run, X happened.'"*
 * The second fired on `\bthan\b`, which put 4 of `core`'s own parameter descriptions in the
 * report — *"a building whose demand turns over faster than that"* is documentation of a dial, not
 * a verdict on a dispatcher.
 *
 * What is left is the **verb-anchored** ordering — *"X was lower than Y"* — plus the three idioms
 * that can only be a verdict. A bare `faster than` is deliberately not here.
 */
const ORDERING_CLAIM =
  /\b(?:came out ahead|ahead of the|outperform\w*|beats?\b|(?:is|are|was|were|looks?|performs?|scored?|ranks?)\s+(?:\w+\s+){0,3}(?:better|worse|faster|slower|lower|higher)\s+than)\b/i;

/**
 * R2 — *"A score is a property of a run, never of a dispatcher."*
 *
 * Three checks, in increasing order of how arguable they are, and the message says which:
 *
 * 1. A `single-run` string that orders two settings. Not arguable: one replication cannot.
 * 2. A `batch` comparison that names a winner (`favours !== null`) on a verdict that is not
 *    `resolved` — a direction asserted without an interval that excludes zero.
 * 3. A `batch` comparison that names a winner over fewer pairs than `MIN_REPLICATION_BUDGET`.
 *    R2's own text is explicit that the requirement is *"a paired-t interval excluding zero over
 *    50–200 replications under common random numbers"*, and `MIN_REPLICATION_BUDGET` is the
 *    shipped constant for the lower bound — this check reads it rather than naming 50.
 *
 * **Clause 3 is the one this search found, and it is now defence in depth rather than live.**
 * `compareMetric` used to resolve at `n >= 2`; since § D171 it emits `under-budget` below the
 * budget, draws the interval and names no arm, so no shipped row can reach this clause. The
 * clause stays because the *product* is what changed: a future caller that constructs a row
 * itself, or a regression in `compareMetric`, is exactly what a property is for.
 *
 * ## The third narrowing: a refusal may name the ordering it refuses
 *
 * The **third** false positive this rule has corrected in itself, and it arrived with the design
 * refactor's Day report. `DayReport.smallPrint` exists to refuse a comparative reading of one day,
 * and it does it in R2's own words:
 *
 * > `This is one replication of one day on one seed. It cannot tell you that conventional`
 * > `collective is better than anything — that needs 50 or more paired runs against the same`
 * > `passengers, and a confidence interval that excludes zero.`
 *
 * Measured on the always-on corpus, that was reported twelve times across four cases and two
 * surfaces. `ORDERING_CLAIM` matched *"is better than"*, `named` matched because `collective`'s
 * display name is *Conventional collective*, and the sentence's verb is **cannot**. Not one of the
 * twelve strings ordered anything; every one of them was the product saying so.
 *
 * The correction is the line `checkSuppressedMean` has always had, for the reason it gives in as
 * many words — *"the refusal is the one string entitled to quote the numbers it is refusing"* —
 * applied to the claim rather than to the number. It is **not** an allow-word: nothing here looks
 * for *"cannot"* or *"not"*, and a rule that did would pass *"X is not worse than Y"*. What is
 * skipped is a string the **surface itself** classified `reason`, which is a structural fact set
 * by the adapter from the field it came out of, and the same classification R3 has trusted since
 * this directory was written.
 *
 * **What it costs, stated rather than glossed:** a surface that ordered two dispatchers in a
 * string it had classified as a refusal would now be missed. That is the same trade `role ===
 * 'reason'` already buys R3, it is falsifiable — `faults.ts#comparativeOnOneRun` injects the claim
 * into a string classified `observation`, so the clause still has something it must catch — and
 * the batch clauses below are untouched, because they read `RenderedText.comparison` rather than
 * the words.
 */
function checkSingleRunComparative(
  context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  /*
   * The subject is taken from the **case**, not from a word list: an ordering claim is one about
   * the two dispatchers this case is running. That is what makes the check specific enough to
   * survive `core`'s parameter prose, which talks about dispatchers in general and about neither
   * of these two.
   */
  const named = [context.case.baselineProfileId, context.case.candidateProfileId];
  for (const text of texts) {
    if (text.provenance === 'single-run') {
      // The refusal is the one string entitled to name the ordering it is refusing. See the third
      // narrowing in this function's docstring.
      if (text.role === 'reason') continue;
      if (ORDERING_CLAIM.test(text.text) && named.some((id) => text.text.includes(id))) {
        found.push(
          violation(
            'single-run-comparative',
            text,
            'orders two settings on a surface driven from one replication. R2: one replication ' +
              'cannot support "dispatcher A is better than dispatcher B".',
          ),
        );
      }
      continue;
    }
    const comparison = text.comparison;
    if (comparison === undefined || comparison.favours === null) continue;
    if (comparison.verdict !== 'resolved') {
      found.push(
        violation(
          'single-run-comparative',
          text,
          `names a winner (favours=${comparison.favours}) on a row whose verdict is ` +
            `"${comparison.verdict}" — a direction asserted without an interval that excludes zero.`,
        ),
      );
      continue;
    }
    if (comparison.pairs < MIN_REPLICATION_BUDGET) {
      found.push(
        violation(
          'single-run-comparative',
          text,
          `names a winner (favours=${comparison.favours}) over ${String(comparison.pairs)} paired ` +
            `replications. R2 requires a paired-t interval excluding zero over ` +
            `${String(MIN_REPLICATION_BUDGET)}–200; this row is below the project's own ` +
            'MIN_REPLICATION_BUDGET.',
        ),
      );
    }
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * R10 — no probability word anywhere
 * -------------------------------------------------------------------------- */

/**
 * R10 — *"Do not translate a confidence interval into a probability word."*
 *
 * The word list is `campaign/words.ts`'s, by import.
 *
 * ## Scoped to result-bearing text, and here is the disagreement that scoped it
 *
 * § D163 clause 1 says **anywhere**; R10's own text is about *translating an interval*; and
 * `campaign/words.ts` records a **deliberate** exemption — *"the Parameters tab is a schema
 * surface and may show it"*. The first run of this search reported the resulting collision as a
 * finding rather than resolving it in the lane, and § D171 resolved it: **the rule is narrowed,
 * not the product.**
 *
 * > R10 exists to stop a confidence interval being translated into a probability word. A
 * > parameter description saying a demand predictor forecasts floors where traffic is *likely* is
 * > technical prose about **what a dial does**, not a claim about a result — and rewriting
 * > `core`'s own description of its own parameter would cost precision to satisfy a rule aimed at
 * > something else.
 *
 * So the property applies to text with a **result behind it** — `single-run`, `batch` and
 * `authored` — and not to {@link TextProvenance} `schema`, which is text `core` wrote into a
 * `SearchParameter.description` and a viewer re-prints unaltered.
 *
 * **This is a scope, not an exclusion list.** The distinction is carried by where a string came
 * from, set by the adapter from the shipped surface's own structure — `Control.help` *is*
 * `parameter.description`, and `controls/render.ts` marks the node it draws it in — so a schema
 * description reaching a *result* surface is still reported, and so is a probability word a
 * viewer writes itself on the Parameters tab. `playerSafeDescription`, the shipped remedy, keeps
 * its result-bearing provenance and is therefore still searched on the same text: if the filter
 * ever returns a probability word, that is a hole in the remedy and it is red.
 */
function isResultBearing(provenance: TextProvenance): boolean {
  switch (provenance) {
    /* Driven from one recording, from a batch, or written into `data/` about one. */
    case 'single-run':
    case 'batch':
    case 'authored':
      return true;
    /*
     * `core`'s own description of one of its own dials, re-printed by the Parameters tab. There
     * is no run behind it and no interval for a word to translate. An exhaustive switch with no
     * `default`, so a fifth provenance is a compile error here rather than a silent exemption.
     */
    case 'schema':
      return false;
  }
}

function checkProbabilityWord(
  _context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  for (const text of texts) {
    if (!isResultBearing(text.provenance)) continue;
    const word = probabilityWordIn(text.text);
    if (word === null) continue;
    found.push(
      violation(
        'probability-word',
        text,
        `contains the probability word "${word}" on a ${text.provenance} surface. R10: never a ` +
          'word for how sure something is without the number beside it; the project default is ' +
          'the interval or a frequency over runs.',
      ),
    );
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * R13 — no estimate without its `n`
 * -------------------------------------------------------------------------- */

/** A natural-frequency restatement and the denominator it invents. */
const FREQUENCY_FORM = /\b(\d+)\s+in\s+(\d[\d,]*)\b/g;

/**
 * R13 — *"No estimate is displayed without the count it was computed from, and a frequency
 * restatement is forbidden when the denominator is smaller than the frequency it names."*
 *
 * Clause one is structural: an `estimate` string must carry a count, in the same visual unit —
 * `countShown`, which the adapter sets from whether the surface printed one, never from whether
 * one exists.
 *
 * Clause two is textual and uses the run's own `waitCount` as the sample: *"1 in 20 rides"* on a
 * window that served five rides names a ride the sample does not contain.
 */
function checkEstimateWithoutN(
  context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  const { summary } = context.recording;

  for (const text of texts) {
    if (text.role === 'estimate' && text.countShown !== true) {
      found.push(
        violation(
          'estimate-without-n',
          text,
          'an estimate with no count beside it. R13 clause one: `n = 5` is not a caveat on ' +
            '`11.3 s`; it is part of what `11.3 s` means.',
        ),
      );
    }
    if (text.role === 'label') continue;
    const sample =
      text.provenance === 'batch'
        ? (text.declaredCount ?? context.batch.arms[0]?.replications.length ?? 0)
        : summary.waitCount;
    for (const match of text.text.matchAll(FREQUENCY_FORM)) {
      const denominator = Number((match[2] ?? '').replace(/,/g, ''));
      if (!Number.isFinite(denominator) || denominator <= 1) continue;
      if (sample >= denominator) continue;
      found.push(
        violation(
          'estimate-without-n',
          text,
          `restates a figure as "${match[0]}" over a sample of ${String(sample)}. R13 clause two: ` +
            'a natural-frequency form may name only a denominator the sample is at least as large as.',
        ),
      );
    }
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * R11 — no figure combining energy with a wait metric
 * -------------------------------------------------------------------------- */

/**
 * An energy **quantity**, not the word `energy`.
 *
 * Found by running it: `energy-aware` is a shipped dispatcher id, `describeFrame` names the
 * dispatcher in its first clause, and a bare `\benergy\b` therefore made every frame description
 * on that arm an R11 violation. A rule that fires on a profile's *name* is not a rule about
 * combining axes.
 */
const ENERGY_QUANTITY =
  /\bk(?:J|Wh)\b|\bkilojoule\w*|\bjoules?\b|\bdrive work\b|\benergy (?:use|cost|score|grade|rating|index|proxy)\b/i;
const WAIT_QUANTITY = /\b(?:wait|awt|wt95|queue|time to destination|ttd)\b/i;
/** The words that turn two axes into one number. */
const SCORE_WORD =
  /\b(?:score|scored|scoring|grade|graded|rating|rated|points|overall|combined|index|efficiency|per second of wait|eco)\b/i;

/**
 * R11 — *"Energy is an axis, never a score."*
 *
 * Two checks:
 *
 * 1. **Structural.** A string the surface itself marks as the energy axis may not also carry a
 *    wait quantity in its *value*. `render/runSummary.ts` states this rule about itself — *"no
 *    figure's text combines an energy quantity with a wait quantity"* — and this is that sentence
 *    executed rather than believed. A row's explanatory **note** may name the waits, because R11's
 *    remedy is *"read this row beside the waits above"*, so notes are exempt and only notes.
 * 2. **Textual.** Any string, on any surface, that names an energy quantity and a wait quantity
 *    inside a scoring construction. Measured reason: `nearest-car` is on the Pareto front at six
 *    of eight matrix cells *because it carries fewer people*, so any blend ranks the weakest
 *    dispatcher first.
 *
 * ## The narrowing on the wait side, which is {@link ENERGY_QUANTITY}'s narrowing again
 *
 * `ENERGY_QUANTITY`'s docstring records the first half of this: a bare `\benergy\b` made every
 * sentence naming `energy-aware` an R11 violation, and *"a rule that fires on a profile's name is
 * not a rule about combining axes"*.
 *
 * The wait side had the same hole and nothing had walked into it, because the batch report named
 * its arms by **slug** — `eta`, `collective` — and no slug contains a wait word. Naming them the
 * way the rest of the product does put *Minimum estimated wait* into the value of every energy row,
 * and the search reported 21 violations across 11 cases on sentences that aggregate nothing:
 *
 * > `in 50 runs, Minimum estimated wait's drive work (proxy) differed from Conventional`
 * > `collective's by −651.8 kJ to −155.5 kJ.`
 *
 * So {@link withoutProfileNames} removes the shipped display names before either pattern is
 * applied. It is a **derivation from `data/dispatcher-profiles.json`**, not an allow-list: a
 * fourteenth profile is covered by the file it is authored in.
 *
 * **What it costs, stated rather than glossed.** A genuine blend that leaned on a profile name to
 * supply its wait token — *"kJ per second of Minimum estimated wait"* — would now be missed. That
 * is the same trade the energy side already took, it is falsifiable, and `faults.ts#energyScore`
 * still injects *"drive work in kJ per second of wait saved"* into an energy-axis value with no
 * profile name in it, so the clause keeps something it must catch.
 */
function checkEnergyWaitBlend(
  context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  /*
   * Longest first: *Conventional collective, en-route pickup* contains *Conventional collective*,
   * and removing the shorter one first leaves the remainder of the longer behind.
   */
  const profileNames = context.dispatcherProfiles.profiles
    .map((profile) => profile.name)
    .filter((name) => name !== '')
    .sort((left, right) => right.length - left.length);
  const withoutProfileNames = (text: string): string => {
    let out = text;
    for (const name of profileNames) out = out.split(name).join('·');
    return out;
  };
  for (const text of texts) {
    const isNote = text.field.endsWith('.note');
    /*
     * Stripped **only when both patterns already match**, which is a hot-path decision rather than
     * a stylistic one: this check runs over every rendered string of every case — 271 985 of them
     * on the always-on corpus — and thirteen `split`/`join` passes per string is measurable work.
     * Removing a profile name can only ever turn a match into a non-match, so a string that fails
     * either pattern unstripped fails it stripped too, and skipping the work changes no verdict.
     */
    const quantitiesOnly =
      ENERGY_QUANTITY.test(text.text) && WAIT_QUANTITY.test(text.text)
        ? withoutProfileNames(text.text)
        : text.text;
    if (text.energyAxis === true && !isNote) {
      if (ENERGY_QUANTITY.test(quantitiesOnly) && WAIT_QUANTITY.test(quantitiesOnly)) {
        found.push(
          violation(
            'energy-wait-blend',
            text,
            'an energy figure whose value also names a wait quantity. R11: energy is shown ' +
              'beside AWT and WT95 and never aggregated with them.',
          ),
        );
        continue;
      }
    }
    if (!SCORE_WORD.test(quantitiesOnly)) continue;
    if (!ENERGY_QUANTITY.test(quantitiesOnly) || !WAIT_QUANTITY.test(quantitiesOnly)) continue;
    found.push(
      violation(
        'energy-wait-blend',
        text,
        'combines an energy quantity and a wait quantity inside a scoring construction. R11: a ' +
          'dispatcher that drives less carries fewer people, so any such score ranks the weakest ' +
          'dispatcher first.',
      ),
    );
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * R12 / § D160 — no goal reported without its measured pass rate
 * -------------------------------------------------------------------------- */

/**
 * R12 — *"A goal judged on one run must have its across-seed variance measured and published, or
 * it is a batch goal"* — and [§ D160](../../../../DECISIONS.md), which applied it honestly and
 * found it **abolishes** the single-run category: a campaign is batch goals and briefing facts.
 *
 * So a string classified `goal` must carry a frequency over runs with its denominator. Two ways
 * it can fail:
 *
 * 1. No rate at all — a goal reported as met or not met with nothing behind it.
 * 2. A rate over fewer seeds than `MIN_SEEDS_PER_GOAL`, presented without saying so. The floor is
 *    the shipped constant, read rather than restated, and the surface is entitled to print a
 *    small rate as long as it also prints the note that says it is one — which is why the check
 *    is on the *set* of goal strings rather than on each one in isolation.
 */
/**
 * The goal kinds R12's pass-rate rule does **not** reach, taken from the shipped judgement table.
 *
 * Found by the deep tier, and the finding was about this check rather than about the product.
 * `beat-the-baseline` is `batch-only`: it compares two arms, so it has no per-run predicate to
 * take a frequency of, and § D160 says so in as many words — *"`beat-the-baseline` ships on every
 * stage besides these, unmeasured and undemoted, because it was never a one-run goal for R12 to
 * reach."* `everyone-can-get-there` is `blocked` and is withheld with its reason, which is `docs/10`
 * § 10.4's finding rather than a leak. Reading the table means an eighth kind is classified by the
 * decision somebody already made, not by a list here.
 */
const NOT_RATE_JUDGED: readonly string[] = Object.freeze(
  GOAL_KINDS.filter((kind) => GOAL_JUDGEMENT[kind] !== 'per-replication'),
);

function checkGoalWithoutRate(
  _context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const goals = texts.filter((text) => text.role === 'goal');
  if (goals.length === 0) return [];
  const found: HonestyViolation[] = [];

  /*
   * A surface that says "this batch ran 8 replications, treat what follows as a look rather than
   * a measurement" has satisfied the second clause for every goal it then prints. The note is
   * looked for among the surface's own strings, not assumed.
   */
  const floorNoted = new Set(
    texts
      .filter(
        (text) =>
          text.role === 'reason' &&
          /\bR12\b/.test(text.text) &&
          /\bseeds?\b|\breplications?\b/.test(text.text),
      )
      .map((text) => text.surfaceId),
  );

  for (const goal of goals) {
    // A goal R12 never reached is not a goal R12 can refuse. See NOT_RATE_JUDGED.
    if (NOT_RATE_JUDGED.some((kind) => goal.text.includes(kind))) continue;
    const rate = goal.goal;
    if (rate === undefined || !rate.rateShown) {
      found.push(
        violation(
          'goal-without-rate',
          goal,
          'a goal reported with no measured pass rate beside it. R12 / § D160: a goal with no ' +
            'across-seed rate is a statement about the configuration, not a goal.',
        ),
      );
      continue;
    }
    if (rate.seeds < MIN_SEEDS_PER_GOAL && !floorNoted.has(goal.surfaceId)) {
      found.push(
        violation(
          'goal-without-rate',
          goal,
          `a pass rate over ${String(rate.seeds)} seeds, below R12's floor of ` +
            `${String(MIN_SEEDS_PER_GOAL)}, and this surface printed no note saying so.`,
        ),
      );
    }
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * R6 / § D223 — no whole-run figure at a playhead short of `endedAt`
 * -------------------------------------------------------------------------- */

/**
 * The counts a run only knows once it has finished, each paired with **the shipped function that
 * knows the same quantity at a playhead**.
 *
 * ## Why every row needs the live counterpart, and what a row without one would cost
 *
 * The rule is *this figure can only be true of the whole run*, and the decidable form of that is
 * *the surface printed the finished-day value where the value at this playhead is a different
 * number*. Without the second half the check is a coincidence detector: `carried` reaches
 * `summary.delivered` the instant the last rider alights, which on a quiet building happens well
 * before `endedAt`, and a perfectly honest live row reading **CARRIED 34** would be reported for
 * agreeing with the end of the day. The live value is read from `live/observations.ts#observationsAt`
 * — the same function the rail's stat rows are drawn from — so the comparison is against the number
 * the product itself would have shown, not against one computed here.
 *
 * ## Why the cue is per quantity, and not one list
 *
 * {@link ESTIMATE_CUES} records what a flat list cost R3: a numeral matching *one* quantity beside a
 * cue naming *another* is a coincidence, not evidence about either. The same reasoning applies
 * harder here, because these are small integers — a building can easily generate 120 people and have
 * 120 seconds of something else on screen. The cue must name the quantity whose value is being
 * looked for, within the numeral's own clause ({@link claimsNear}).
 *
 * **Known limit, stated rather than discovered.** `summary.serviceLevel` and
 * `summary.handlingCapacity` are whole-run folds too — the mood card's *demand answered* driver
 * prints both rates — and they are **not** here, because `observationsAt` publishes no rate to
 * compare them against and a row with no live counterpart could only be a coincidence detector. They
 * are reached by the structural half instead, which is exactly where a declared figure belongs; a
 * surface that printed a handling-capacity rate early **without** declaring its basis would be
 * missed. That is a real narrowing and it is the same trade R3's cue map makes.
 */
/**
 * A clause that **names its own window** — and therefore is not the defect R6 describes.
 *
 * ## The first false positive this rule produced, and why it was corrected here rather than in the
 * product
 *
 * `render/canvas.ts`'s footer band draws, at every playhead:
 *
 * > `simulation completed · 1018 arrivals generated over the whole day · window peak-5min 240–540 s`
 *
 * That is `summary.generated` at 00:00 of a 16:29 run, and the first version of this check reported
 * it on **49 of 49** cases. It is also the honest form of exactly what § D293 asked for. The rail's
 * defect was *"All 34 people got where they were going"* — a whole-day count in the present tense
 * with **no window on it at all**, whose only retraction was `font-style: italic`, and § D293's
 * finding was that a signal no renderer is obliged to read is not a retraction: *the words carry
 * it too*. A string that says **over the whole day** in the same breath as the number has carried it
 * in words. Refusing that string would be refusing the remedy.
 *
 * Read in the numeral's **own clause**, never in the whole string, for {@link CLAIM_PROXIMITY}'s
 * reason: `describeFrame` returns eight sentences, and a phrase anywhere in the paragraph would
 * excuse a figure four sentences away from it. Compare `render/runSummary.ts#windowClause`, which is
 * the shipped surface's own name for this idea.
 *
 * **What it costs, stated rather than glossed.** A surface that wrote *"over the whole day"* while
 * showing a figure it had not folded over the whole day would pass here. That is a lie about a
 * window rather than a whole-run figure drawn early, and it is not this property's defect — it is
 * the class § D227 records, a stated description going stale, and a run is what pins one of those.
 */
const NAMES_ITS_OWN_WINDOW =
  /\b(?:over|across|for|during|in)\s+the\s+(?:whole|entire|full)\s+(?:day|run|shift|simulation)\b|\bwhole[- ](?:day|run|shift)\b|\bby the end of the (?:day|run|shift)\b|\bwhen the run ended\b|\bin total\b/i;

const WHOLE_RUN_COUNTS: readonly {
  readonly name: string;
  readonly summary: (summary: HonestyContext['recording']['summary']) => number;
  readonly live: (live: LiveObservations) => number;
  readonly cue: RegExp;
}[] = Object.freeze([
  {
    name: 'summary.delivered',
    summary: (s) => s.delivered,
    /* `LiveObservations.carried` is *legs that had alighted by `t`* — delivery, not boarding. */
    live: (live) => live.carried,
    cue: /\b(?:carried|delivered|got where|arrived where|reached their)\b/i,
  },
  {
    name: 'summary.generated',
    summary: (s) => s.generated,
    /* `arrived` is *legs whose call had been registered by `t`* — the same population, so far. */
    live: (live) => live.arrived,
    cue: /\b(?:turned up|showed up|of\s+\d[\d,]*\s+people|people arrived|generated)\b/i,
  },
  {
    name: 'summary.undelivered',
    summary: (s) => s.undelivered,
    /*
     * Nobody publishes *undelivered so far*, because before `endedAt` it is not a thing that has
     * happened — a rider still in transit is not undelivered. `arrived - carried` is the widest
     * honest reading of the same question at a playhead (everybody who turned up and has not got
     * there yet), and using the **widest** one is the conservative direction: it makes the live
     * value larger, so the check fires only where the finished figure is genuinely unreachable.
     */
    live: (live) => live.arrived - live.carried,
    cue: /\b(?:undelivered|never (?:boarded|arrived|got)|still in the building|stranded)\b/i,
  },
]);

/**
 * R6 — *"an outcome evaluated before the playhead reaches `endedAt` is a preview"* — and § D223's
 * rule for what a surface does about that: **it withholds the figure and says so.**
 *
 * Two checks, and neither subsumes the other. The split is R3's and R13's, for R3's and R13's
 * reason: the structural half catches a renderer that stops gating a figure whose producer declared
 * it whole-run, and the textual half catches a surface that declares nothing and prints the day's
 * count anyway. `faults.ts` injects one of each.
 *
 * 1. **Structural.** A string whose surface declared {@link TextPlayhead.basis} `'whole-run'` may not
 *    be rendered at a playhead short of `endedAt`. The declaration is `MoodDriver.basis`,
 *    `WaitBands.basis` or `HonestyCard.basis` — the shipped types' own, copied by the adapter —
 *    and the gate under test is `dev/leftRail.ts#moodDriverPanelOf`, which filters exactly this.
 * 2. **Textual.** At a playhead short of `endedAt`, no string may print a {@link WHOLE_RUN_COUNTS}
 *    value beside a cue naming that quantity **while the same quantity read at that playhead is a
 *    different number**. That last clause is what makes it a check rather than a coincidence
 *    detector, and it is why the live value comes from `observationsAt` rather than from arithmetic
 *    written here.
 *
 * ## The one role that is exempt, and why the exemption is now **half** what it was
 *
 * `role === 'reason'` is exempt from the **textual** half. A refusal published early withholds a
 * figure; the textual half is a rule about *printing a count*, and a retraction prints none. The
 * rail's own retraction row — *"the readings that fold the whole shift … are withheld until the
 * playhead reaches the end"* — is drawn **only** while the shift is unfinished, so a property that
 * refused it would forbid the fix § D293 landed. `role === 'label'` is exempt from the same half,
 * for R3's reason: a caption carries a threshold, not a result.
 *
 * ## Why a refusal is **not** exempt from the structural half — `docs/20` defect 3
 *
 * The exemption used to be total, on the argument *"a refusal is the absence of a claim"*, and that
 * sentence is true of a refusal and false of a **verdict**. `render/overlay.ts`'s RIGHT NOW panel
 * drew, at 14 % of playback, under a label reading *average wait so far*:
 *
 * > **`NO AVERAGE — A RESULT`** … *"This run's own statistics refuse an average here. That is a
 * > result, not a gap."*
 *
 * Nothing there is a figure, and every word of it is a claim about the **finished** day, published
 * over a building whose queues had not formed yet. The search could not see it: the textual half
 * looks for a number and there is none, and the structural half returned before it read the basis.
 * So a whole class of early whole-run claims — the ones with no numeral in them — was outside the
 * property that exists to catch early whole-run claims.
 *
 * The fix is to move the `continue`, not to widen a cue list. A refusal that **declares** it folds
 * the whole run is asserting something about the whole run, whatever its role; a refusal that
 * declares nothing, or declares `'now'`, is the retraction § D293 landed and is untouched. The
 * rail's retraction seeds no basis (`honesty/surfaces.ts`'s MOOD adapter passes `driver?.basis`,
 * `undefined` on that row) and so stays exempt in practice as well as in principle — which is the
 * property the narrowing is safe by, and `honesty.test.ts` drives it rather than assuming it.
 *
 * The declaration this now reaches is `mode/disclosure.ts#CasualRefusal.basis`, produced beside the
 * words themselves, in the module that owns the refusal's vocabulary — `MoodDriver.basis`'s pattern
 * applied to the one kind of string that has no figure to declare a window for.
 */
function checkWholeRunFigureEarly(
  context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  const { summary } = context.recording;
  /* One `observationsAt` scan per distinct early playhead, not one per string. */
  const liveAt = new Map<number, LiveObservations>();

  for (const text of texts) {
    const at = text.playhead;
    if (at === undefined) continue;
    // The rule is *short of `endedAt`*, and it is the run's own comparison — see TextPlayhead.
    if (at.atS >= at.endedAt) continue;

    /*
     * The structural half runs on **every** role, refusals included — `docs/20` defect 3. A
     * refusal that declares `'whole-run'` is a verdict about the finished day and is exactly what
     * this half is for; a refusal that declares nothing, as § D293's retraction does, never
     * reaches the branch below. See the docstring for what the total exemption cost.
     */
    if (at.basis === 'whole-run') {
      found.push(
        violation(
          'whole-run-figure-early',
          text,
          `the surface declares this figure folded over the whole shift and drew it at ` +
            `${at.atS.toFixed(0)} s of ${at.endedAt.toFixed(0)} s. R6 / § D223: a whole-day reading ` +
            'beside a clock this early is two answers to one question — withhold it and say so.',
        ),
      );
      continue;
    }

    // The textual half only. A refusal prints no count and a caption carries a threshold rather
    // than a result — see the docstring's two paragraphs on the exemptions.
    if (text.role === 'label' || text.role === 'reason') continue;
    let live = liveAt.get(at.atS);
    if (live === undefined) {
      live = observationsAt(context.recording, at.atS);
      liveAt.set(at.atS, live);
    }
    const spans = clauseSpans(text.text);
    const tokens = numberTokens(text.text);
    for (const quantity of WHOLE_RUN_COUNTS) {
      const whole = quantity.summary(summary);
      if (!Number.isFinite(whole)) continue;
      // The number is reachable at this playhead, so printing it claims nothing about the end.
      if (quantity.live(live) === whole) continue;
      let hit: string | undefined;
      for (const form of renderings(whole)) {
        const clause = claimClause(text.text, form, spans, tokens, quantity.cue);
        if (clause === undefined) continue;
        // A figure that says what window it is folded over has kept R6 in words. See above.
        if (NAMES_ITS_OWN_WINDOW.test(clause)) continue;
        hit = form;
        break;
      }
      if (hit === undefined) continue;
      found.push(
        violation(
          'whole-run-figure-early',
          text,
          `prints ${quantity.name} (${hit}) beside a cue that names it, at ${at.atS.toFixed(0)} s ` +
            `of ${at.endedAt.toFixed(0)} s, where the same quantity at this playhead is ` +
            `${String(quantity.live(live))}. R6 / § D223: that figure can only be true of the whole ` +
            'run, and the run has not finished.',
        ),
      );
      break;
    }
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * § 12.2 — the withheld matrix
 * -------------------------------------------------------------------------- */

/**
 * A cell whose whole content is a zero-valued figure.
 *
 * Anchored at both ends on purpose: the forbidden thing is the **figure** being zero, not a zero
 * inside a sentence. *"nothing banked yet — no shift has closed"* is the honest form of this cell and
 * would carry a `0` the day somebody wrote *"0 days banked"*; that sentence is a count of what has
 * happened, which is a real observation, and this rule is about an aggregate over an empty sample.
 * `0/0` is here because a fraction with no denominator is the same defect wearing a ratio —
 * `dev/leftRail.ts#runFiguresOf` already refuses to draw one and says why.
 */
const ZERO_FIGURE = /^[-+]?0(?:[.,]0+)?\s*(?:%|s|m|kJ|kj|pts?|points?)?$|^0\s*\/\s*0$/;

/**
 * A cell that is *working on it* — the second thing § 12.2 forbids, and the one nothing else here
 * would catch.
 *
 * A spinner is honest in a build that is fetching something and dishonest in one that is not: this
 * shell has no server, so a cell that says *loading* is promising an answer that is never coming
 * (§ 16 rule 15's *"never a spinner"*, issue #123). Matched as the whole cell or as a lone ellipsis,
 * because a sentence containing the word *loading* in some other sense is not a spinner.
 */
const SPINNER = /^[.…·\s]+$|^\s*(?:loading|fetching|updating|refreshing|please wait)\b/i;

/** The em dash `docs/10` and the design both spell an unavailable figure with — `shift/goals.ts#PENDING_DISPLAY`. */
const EM_DASH = '—';

/**
 * § 12.2 — **every combination of the withheld reasons renders `—` or a labelled unavailable state;
 * none renders a zero, a spinner or a stale figure.**
 *
 * ## What is judged, and what puts a string in front of it
 *
 * Two populations, and they arrive by different routes:
 *
 * 1. Every string an adapter marked {@link RenderedText.withheld} — a cell drawn under one of
 *    `generate.ts#withheldStates`' thirty-two combinations, in a state where the figure that
 *    belongs in it may not be published. The adapter declares it because the state is not
 *    recoverable from the words; see {@link WithheldFigure}.
 * 2. Every string whose **role** is `suppressed`, wherever it came from. That role's own docstring
 *    has always carried this rule — *"the word that replaces a refused estimate. R3: never a blank,
 *    never a zero"* — and until now **no property enforced it**: `checkSuppressedMean` asks whether
 *    a refused figure was published, and never what stands in its place. A rule stated on a type
 *    and checked by nothing is the shape this repository keeps finding, so the two populations are
 *    judged together.
 *
 * ## The four clauses, and why the fourth needs the adapter
 *
 * Blank, zero and spinner are decidable from the string. **Stale** is not: `66` in a cell is a
 * defect only if `66` is a figure that cell may not carry, and the only thing that knows is what
 * put the surface in the state — hence {@link WithheldFigure.ifPublished}, compared against whole
 * number tokens for {@link NUMBER_TOKEN}'s reason.
 *
 * The remainder clause is the weakest of the five and it is stated rather than dressed up: a cell
 * that is neither an em dash nor two letters of a label is refused, which catches a blank, a lone
 * `?`, a bare colon and the empty parenthesis. It cannot catch a cell that says *"unavailable"*
 * while carrying no reason a reader can act on — that is a copy judgement, and `docs/16` S1 is
 * where it is made.
 */
function checkWithheldFigure(
  _context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  for (const text of texts) {
    const { withheld } = text;
    if (withheld === undefined && text.role !== 'suppressed') continue;
    const where =
      withheld === undefined
        ? 'a figure the run’s own summary refuses'
        : `${withheld.because.join(' + ')} (state ${withheld.state})`;
    const value = text.text.trim();

    if (value === '') {
      found.push(
        violation(
          'withheld-figure-published',
          text,
          `withheld under ${where}, and drawn as a blank. § 12.2: a withheld figure reads “${EM_DASH}” ` +
            'or a labelled unavailable state — an empty cell is indistinguishable from a broken one.',
        ),
      );
      continue;
    }
    if (ZERO_FIGURE.test(value)) {
      found.push(
        violation(
          'withheld-figure-published',
          text,
          `withheld under ${where}, and drawn as a zero. § 12.2 / § 16 rule 1: a figure nobody has ` +
            'measured yet is not a figure that measured zero, and a reader cannot tell the two apart.',
        ),
      );
      continue;
    }
    if (SPINNER.test(value)) {
      found.push(
        violation(
          'withheld-figure-published',
          text,
          `withheld under ${where}, and drawn as a spinner. § 16 rule 15: nothing is on its way — ` +
            'this build has no server, so the wait it promises never ends.',
        ),
      );
      continue;
    }
    if (withheld !== undefined && withheld.ifPublished.length > 0) {
      const tokens = numberTokens(text.text);
      const leak = withheld.ifPublished.find((form) =>
        tokens.some((token) => token.value === form),
      );
      if (leak !== undefined) {
        found.push(
          violation(
            'withheld-figure-published',
            text,
            `withheld under ${where}, and carrying ${leak} — the figure this cell may not publish ` +
              'here. § 12.2: never a stale figure. A number a reader reads as theirs, taken from a ' +
              'run this cell is not about, is the worst of the three because it looks right.',
          ),
        );
        continue;
      }
    }
    if (!value.includes(EM_DASH) && (value.match(/\p{L}/gu) ?? []).length < 2) {
      found.push(
        violation(
          'withheld-figure-published',
          text,
          `withheld under ${where}, and drawn as “${value}” — neither an em dash nor a label. ` +
            '§ 12.2: a reader has to be able to tell an unavailable figure from a rendering fault.',
        ),
      );
    }
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * The charter's M2 gate — no internal notation where a player reads
 * -------------------------------------------------------------------------- */

/**
 * A reference to a numbered section of a design document — `§ 6.5`, `§ 12.2`, `§ 9`.
 *
 * The digit is required. A bare `§` is a typographic mark and could be prose about a clause of
 * something real; a `§` with a number after it is this repository's own cross-reference notation
 * and nothing else. Measured over the 27 049 distinct strings a seven-seed sample of the standard
 * corpus renders: **22** match, every one of them a register entry on a player surface, and **not
 * one string on any other surface matches** — Engineer panels included. So this clause would have
 * needed no scoping at all; the four below it would, which is why the scope is applied to the
 * property rather than clause by clause.
 *
 * Deliberately not matched: *"section 6.5"* spelled out in words. Nothing in the tree writes it
 * that way, and a rule for a form nobody uses is a rule nobody can watch fail.
 */
const SECTION_REFERENCE = /§\s*\d/u;

/**
 * A source filename, with or without its path — `dev/reportPanel.ts`, `data/scenario-goals.json`.
 *
 * Extensions are enumerated rather than generalised to *"a dot and some letters"*, because English
 * prose is full of a dot followed by letters and this rule must not fire on a sentence. The list is
 * every extension this tree's sources actually carry.
 *
 * **A bare directory is deliberately not matched.** `RUSH_ABSENCES[0]` says *"no demand template in
 * `data/` ramps without a ceiling"*, and `data/` on its own is not a filename — it is under-matched
 * on purpose, and it is named here so that the gate's zero is read for what it is: `data/` is
 * internal jargon that this property does not judge. Widening to a bare `word/` would match
 * *and/or*, which is the cry-wolf direction.
 */
const SOURCE_FILENAME = /\b[A-Za-z0-9_$-]+(?:\/[A-Za-z0-9_$-]+)*\.(?:ts|tsx|js|mjs|cjs|json|html|css|md)\b/u;

/**
 * A constant's identifier — `LEVER_SURFACES`, `RUSH_PRIMARY_REFUSAL`.
 *
 * At least one underscore is required, so this cannot fire on an ordinary capitalised word or on
 * the design's shouted eyebrows (`WHAT THIS BUILD DOES NOT DO YET` is spaced, not joined).
 */
const CONSTANT_IDENTIFIER = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/u;

/**
 * A member path — `bank.ts#deckAt`, `dev/reportPanel.ts#LEVER_SURFACES`.
 *
 * `#` between two identifier tokens is this tree's own spelling for *"this export of that module"*
 * and has no other meaning in prose. The digit case (`#4`) is excluded by requiring a letter or
 * `_`/`$` after the hash, so a numbered item is not a code reference.
 *
 * The left side swallows the path and the extension when they are there, so the violation **quotes
 * the whole reference** rather than the `ts#LEVER_SURFACES` tail a reader would have to reconstruct.
 * It is never the only clause that sees such a string — {@link SOURCE_FILENAME} catches it too —
 * which is exactly why this one is free to be strict: it exists for the form with no extension.
 */
const MEMBER_PATH = /\b[A-Za-z_$][A-Za-z0-9_$]*(?:[./][A-Za-z0-9_$-]+)*#[A-Za-z_$][A-Za-z0-9_$]*/u;

/** Spans the author marked as code. The delimiter is the claim; {@link isCodeToken} tests the content. */
const CODE_VOICE = /`([^`]{1,120})`/gu;

/**
 * Whether a backticked span is a bare code identifier rather than a quoted phrase.
 *
 * One token — no spaces — carrying an underscore or an interior capital. That is `SpecTransportMode`,
 * `clockAt`, `phaseAt`; it is not `` `Race against` `` and not `` `lobby` ``.
 */
function isCodeToken(span: string): boolean {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(span)) return false;
  return span.includes('_') || /[A-Z]/u.test(span.slice(1));
}

/**
 * Everything in the string that the criterion names, **not the first thing**.
 *
 * A violation is read by whoever is going to rewrite the sentence, and *"§ 6.5's third lever … which
 * is what `dev/reportPanel.ts#LEVER_SURFACES` names"* carries all three of the criterion's things at
 * once. Reporting only the section number would send a rewriter back for the other two, and a second
 * pass on the same sentence is how the seventeen become sixteen-and-a-half.
 *
 * One example per clause: the point is to say *what kind of thing is in here*, not to enumerate
 * every occurrence, which the quoted string already does.
 */
function notationIn(text: string): readonly { readonly kind: string; readonly quote: string }[] {
  const found: { kind: string; quote: string }[] = [];
  const section = SECTION_REFERENCE.exec(text);
  if (section !== null) found.push({ kind: 'a section reference', quote: section[0] });
  const filename = SOURCE_FILENAME.exec(text);
  if (filename !== null) found.push({ kind: 'a source filename', quote: filename[0] });
  const member = MEMBER_PATH.exec(text);
  if (member !== null) found.push({ kind: 'a member path', quote: member[0] });
  const constant = CONSTANT_IDENTIFIER.exec(text);
  if (constant !== null) found.push({ kind: "a constant's identifier", quote: constant[0] });
  for (const marked of text.matchAll(CODE_VOICE)) {
    const span = marked[1] ?? '';
    if (isCodeToken(span)) {
      found.push({ kind: 'an identifier in code voice', quote: `\`${span}\`` });
      break;
    }
  }
  return found;
}

/**
 * `CHARTER_PROGRAMME.md` § M2, third exit criterion — **nothing on a player surface refers to a
 * section number, a source filename or a code identifier.**
 *
 * The criterion says of itself that it *"is a mechanical check and it is part of the gate"*, and it
 * **fails today**. `ISSUE_VERIFICATION_FINDINGS.md` § N counted it by hand first — six source files,
 * 27 register entries, 17 of them carrying notation — and this check agrees on all seventeen and
 * **adds two the hand count had no reason to look at**, on a campaign stage the always-on tier never
 * draws. Nineteen.
 *
 * This is the instrument, not the fix (GitHub issue #207). Every finding is in `honesty.test.ts`'s
 * `OUTSTANDING` register, one entry per offending **sentence**, so that **deleting entries is how
 * the gate's progress is read**: the criterion is met when the register is empty, and at no earlier
 * moment.
 *
 * ## Which strings are judged — **every role, and that is the point**
 *
 * Every one of the seventeen register entries is `role: 'reason'` — the one role R3 **exempts**.
 * That exemption is R3's and it is about numbers: a refusal has to be allowed to name the figure it
 * is refusing, or it cannot refuse anything. There is no analogous licence here. A refusal may name
 * a number; naming a *section of a design document* is not a thing refusing requires, and a section
 * number in a reason is on the player's screen exactly as much as one in a heading. So no role is
 * exempt, and a property that adopted R3's exemption list out of symmetry would have been unable to
 * see the entire defect it was written for.
 *
 * `provenance` is not scoped either, for the same reason and one more: [§ D171](../../../../DECISIONS.md)
 * narrowed R10 away from `schema` because *"a description of what a dial does"* is not an interval
 * being translated — an argument about **what R10 is for**, which does not transfer. A
 * `SearchParameter.description` that named a filename on a player screen would be the defect, and
 * `core` writing it would not make it less so.
 *
 * **That was a prediction when it was written and is a measurement now.** `schema` prose mostly
 * reaches the Parameters tab, which is an Engineer surface — but the deep tier found
 * `auction.aggregation`'s description, *"…see docs/01-architecture.md"*, re-printed on the campaign
 * **brief**'s editable-control list, where a player reads it. Had this property inherited R10's
 * exemption out of symmetry, that string would have been exempt exactly where it is a defect and
 * still swept exactly where it is not. It is registered in `honesty.test.ts`'s `OUTSTANDING`.
 *
 * ## Which **surfaces** are judged, and the measurement that decided it
 *
 * `surfaces.ts#PLAYER_FACING_SURFACES` — the adapters that draw at least one declaration out of
 * `everyday/` or `campaign/`. The criterion says *a player surface*, and the Engineer surface is the
 * other audience by construction ([§ D338](../../../../DECISIONS.md)'s door between the two).
 *
 * This is the decision that had to be measured rather than argued, because getting it wrong in
 * either direction ruins the instrument. Run over **every** surface — measured on the 27 049
 * **distinct** strings a seven-seed sample of the standard corpus renders, so the figure is a count
 * of sentences rather than of renderings — the filename clause alone reports **656**; **572** of
 * them are
 * `dev/familyControls.ts#familyControlsViewOf` drawing *"Read by
 * `dispatch/policy.ts#resolveDispatchConfig`, from `dev/state.ts#shiftRunConfigOf`"* — an Engineer
 * panel doing precisely its job, and a further 40 are the building editor's help text. Scoped to
 * player surfaces the same clause reports **2**, both real. A guard that reported the other 654
 * would be the § D91 failure this repository already names: it trains people to ignore it.
 *
 * ## What it deliberately does **not** match, with the cost of each stated
 *
 * - **A bare camelCase or dotted config path.** `everyday/workshopModel.ts#WORKSHOP_COPY` says
 *   *"that wrote `idle.parkingStrategy: lobby`"* on **37** of those distinct strings, and it says so because
 *   § D227 requires a control to state what it writes — the stale-refusal defect is exactly a
 *   control that does not. Separating `SpecTransportMode` from `parkingStrategy` needs this tree's
 *   own export list, which `properties.ts` may not read (`boundaries.test.ts` confines the
 *   filesystem to the test helpers), and a spelling rule that guessed would take those 37 with it.
 *   So an identifier is caught when its author marked it as code, or when it is a filename, a
 *   member path or a shouted constant — never by inferring intent from capitals. The number was
 *   stated here so the ruling could be made against a measurement, and **it has been made**:
 *   [§ D346](../../../../DECISIONS.md) rules that a control's own write-disclosure is not internal
 *   notation, so the 37 stay out and the gate's number is 19 rather than 56. The clause is an
 *   under-match **by decision**, which is the difference between a gate that under-matches on
 *   purpose and one nobody finished. § D346 also names what would reopen it: this rule cannot tell
 *   `SpecTransportMode` from `parkingStrategy` without the tree's export list, and if that ever
 *   becomes readable from here, splitting the two is the option to revisit.
 * - **A bare directory**, per {@link SOURCE_FILENAME}.
 * - **`§` with no number**, per {@link SECTION_REFERENCE}.
 *
 * Each of those is an under-match, and under-matching is the deliberate side to err on: a missed
 * string is one line of copy the next run of this search will still not see, while a false positive
 * is a gate nobody believes.
 */
function checkInternalNotation(
  _context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  for (const text of texts) {
    if (!PLAYER_FACING_SURFACES.has(text.surfaceId)) continue;
    const notation = notationIn(text.text);
    if (notation.length === 0) continue;
    const caught = notation.map((one) => `${one.kind} “${one.quote}”`).join(', ');
    found.push(
      violation(
        'internal-notation',
        text,
        `carries internal notation where a player reads — ${caught}. ` +
          'CHARTER_PROGRAMME.md § M2: nothing on a player surface refers to a section number, a ' +
          'source filename or a code identifier. The screen is the whole of what a player has; a ' +
          'note to the team left on it is a sentence they cannot follow up.',
      ),
    );
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * The whole check
 * -------------------------------------------------------------------------- */

/** Every property, keyed so a caller can run one — `faults.test.ts` does. */
export const PROPERTY_CHECKS: Readonly<
  Record<HonestyProperty, (context: HonestyContext, texts: readonly RenderedText[]) => readonly HonestyViolation[]>
> = Object.freeze({
  'suppressed-mean': checkSuppressedMean,
  'single-run-comparative': checkSingleRunComparative,
  'probability-word': checkProbabilityWord,
  'estimate-without-n': checkEstimateWithoutN,
  'energy-wait-blend': checkEnergyWaitBlend,
  'goal-without-rate': checkGoalWithoutRate,
  'whole-run-figure-early': checkWholeRunFigureEarly,
  'withheld-figure-published': checkWithheldFigure,
  'internal-notation': checkInternalNotation,
});

/** Check all nine against one case's rendered strings. */
export function checkAll(
  context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  for (const check of Object.values(PROPERTY_CHECKS)) found.push(...check(context, texts));
  return found;
}
