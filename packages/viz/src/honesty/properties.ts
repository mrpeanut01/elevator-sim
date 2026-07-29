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
import type { HonestyProperty, HonestyViolation, RenderedText } from './types.js';

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
 * Words that make a number a claim about a *cohort* rather than about a person or a moment.
 *
 * Deliberately narrow. `docs/10` § 1's whole distinction is observation versus estimate, and
 * *"the longest wait was 88 s"* is an observation that is drawn on a saturated run **on purpose**
 * — R4: *"seeing the divergence is the point."* So the cue list names the three estimate classes
 * `VizSummary.awtIsValid` actually speaks for and nothing else.
 */
const ESTIMATE_CUE =
  /\b(?:average|mean|awt|typical|95th|wt95|percentile|time to destination|ttd|one in twenty|1 in 20)\b/i;

/** Every rendering of a number a reader could match against the printed figure. */
function renderings(value: number): readonly string[] {
  const forms = new Set<string>();
  for (const places of [0, 1, 2, 3]) forms.add(value.toFixed(places));
  return [...forms].filter((form) => Number(form) !== 0);
}

/**
 * How close a cue and a number must be to be one claim. Characters.
 *
 * **Found by running it, and it is the difference between a check and a coincidence.**
 * `describeFrame` returns one paragraph of eight sentences — *"…at 3:02 of 10:00. 29 legs
 * waiting… Mean waiting time is suppressed: …"* — so a rule that asked only whether the cue and
 * the number appeared *in the same string* reported the paragraph as printing `meanWaitS = 29`.
 * The 29 was a queue count, the cue was in a different sentence, and the surface was doing
 * exactly the right thing. 64 characters is about a clause.
 */
const CLAIM_PROXIMITY = 64;

/** Whether `text` states `number` as the thing an estimate cue names, rather than nearby by luck. */
function claimsNear(text: string, numeral: string): boolean {
  let from = 0;
  for (;;) {
    const at = text.indexOf(numeral, from);
    if (at < 0) return false;
    // Named `clause`, not `window`: `boundaries.test.ts` bans a bare `window` identifier anywhere
    // outside `dev/`, precisely because a local of that name shadowing the global is how a DOM
    // reference hides. It caught this one.
    const clause = text.slice(Math.max(0, at - CLAIM_PROXIMITY), at + numeral.length + CLAIM_PROXIMITY);
    if (ESTIMATE_CUE.test(clause)) return true;
    from = at + 1;
  }
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
 *    value of `meanWaitS`, `wait95S` or `meanTimeToDestinationS` **within a clause of** an
 *    estimate cue. Both halves are required, and so is the distance: a bare number is not a
 *    claim, a cue with no number is a label, and the two at opposite ends of a paragraph are
 *    neither.
 */
function checkSuppressedMean(
  context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  if (!context.suppressed) return [];
  const { summary } = context.recording;
  const found: HonestyViolation[] = [];

  const forbidden: { readonly name: string; readonly forms: readonly string[] }[] = [];
  for (const [name, value] of [
    ['meanWaitS', summary.meanWaitS],
    ['wait95S', summary.wait95S],
    ['meanTimeToDestinationS', summary.meanTimeToDestinationS],
  ] as const) {
    if (Number.isFinite(value)) forbidden.push({ name, forms: renderings(value) });
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
    if (!ESTIMATE_CUE.test(text.text)) continue;
    for (const { name, forms } of forbidden) {
      const hit = forms.find((form) => claimsNear(text.text, form));
      if (hit === undefined) continue;
      found.push(
        violation(
          'suppressed-mean',
          text,
          `prints ${name} (${hit}) beside an estimate cue on a run whose summary refuses it. ` +
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
 * The word list is `campaign/words.ts`'s, by import. § D163's clause says **anywhere**, which is
 * broader than R10's own text (which is about *translating an interval*), and the search reports
 * what it finds rather than deciding the disagreement: a hit on a string that is not an interval
 * restatement is still reported, with its provenance in the message, so a reader can see which
 * kind it is.
 */
function checkProbabilityWord(
  _context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  for (const text of texts) {
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
 */
function checkEnergyWaitBlend(
  _context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  for (const text of texts) {
    const isNote = text.field.endsWith('.note');
    if (text.energyAxis === true && !isNote) {
      if (ENERGY_QUANTITY.test(text.text) && WAIT_QUANTITY.test(text.text)) {
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
    if (!SCORE_WORD.test(text.text)) continue;
    if (!ENERGY_QUANTITY.test(text.text) || !WAIT_QUANTITY.test(text.text)) continue;
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
