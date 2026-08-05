/**
 * The six properties, as predicates over rendered strings and the run's own statistics.
 *
 * Each derives from a rule in [`docs/10`](../../../../docs/10-experience-layer-contract.md) § 1
 * and is quoted from it here rather than paraphrased, because a property that restates a rule
 * loosely is a property that passes for the wrong reason.
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
 * ## Why two of the six are checked structurally *and* textually
 *
 * R3 and R13 are both rules about a **pairing**: a value and its licence, a value and its `n`.
 * The structural check catches the surface classifying wrongly (`kind: 'estimate'` on a run whose
 * summary refuses one); the textual check catches a surface classifying correctly and printing
 * the number anyway, somewhere else. Neither subsumes the other, and `faults.ts` injects one of
 * each.
 */

import { MIN_REPLICATION_BUDGET } from '../batch/report.js';
import { probabilityWordIn } from '../campaign/words.js';
import { GOAL_JUDGEMENT, GOAL_KINDS } from '../scenario/goals.js';
import { MIN_SEEDS_PER_GOAL } from '../scenario/published.js';
import type { HonestyContext } from './surfaces.js';
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

/** Whether `text` states `numeral` as the value `cue` names, rather than nearby by luck. */
function claimsNear(
  text: string,
  numeral: string,
  spans: readonly { readonly from: number; readonly to: number }[],
  tokens: readonly { readonly value: string; readonly at: number }[],
  cue: RegExp,
): boolean {
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
    if (cue.test(clause)) return true;
  }
  return false;
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
    const quantitiesOnly = withoutProfileNames(text.text);
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
});

/** Check all six against one case's rendered strings. */
export function checkAll(
  context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  for (const check of Object.values(PROPERTY_CHECKS)) found.push(...check(context, texts));
  return found;
}
