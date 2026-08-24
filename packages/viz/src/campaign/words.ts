/**
 * **R10** as a shipped function rather than as a rule in a test — `docs/10` § 1 R10.
 *
 * > *"Do not translate a confidence interval into a probability word … lay readers misinterpret
 * > calibrated likelihood terms **regressively**, pulling 'very likely' down and 'unlikely' up
 * > toward 50 %, with the misreading correlated to the reader's prior beliefs."* (Budescu et al.,
 * > *Psychological Science* 2009; *Nature Climate Change* 2014.)
 *
 * ## Why this is a module and not only an assertion
 *
 * `batch/report.test.ts` and `scenario/goals.test.ts` each hold a copy of this pattern and check
 * their own module's output with it. That works for a module whose sentences are all written in
 * TypeScript. A campaign's sentences are **partly authored in `data/campaign.json`**, and a rule
 * that only exists in a test cannot refuse a brief at load time — it can only fail after somebody
 * has already shipped one. So the pattern lives here, `campaign/parse.ts` refuses an authored
 * string that trips it, and `campaign/campaign.test.ts` runs it over every generated sentence as
 * well.
 *
 * **Known duplication, stated rather than hidden:** the two test-local copies are not refactored
 * onto this module. They belong to lanes that have already landed, their word lists are identical
 * to this one today, and quietly rewriting another lane's guard to import a new module is how a
 * guard's meaning erodes without its assertions changing — the exact failure
 * [§ D159](../../../../DECISIONS.md) records. `campaign.test.ts` asserts this list is a superset of
 * the words those suites name, so a divergence is visible here rather than silent.
 */

/**
 * Words that turn an interval into a feeling.
 *
 * `certain` and `certainly` are here for the same reason as `likely`: they are the top of the same
 * calibrated scale, and a sentence that says *"almost certainly faster"* has done exactly what R10
 * forbids from the other end. `chance`/`chances`/`odds` catch the *"95 % chance"* form R10 names
 * verbatim.
 */
export const PROBABILITY_WORDS =
  /\b(?:likely|unlikely|probabl\w*|probability|chances?|odds|certainly|certain|maybe|perhaps|presumably|plausibl\w*|good bet|fifty-fifty)\b/i;

/**
 * The offending word, or `null`.
 *
 * Returns the word rather than a boolean so a refusal can quote it: *"the brief for stage 3 says
 * 'likely'"* is actionable and *"the brief contains a probability word"* is a puzzle.
 */
export function probabilityWordIn(text: string): string | null {
  const found = PROBABILITY_WORDS.exec(text);
  return found?.[0] ?? null;
}

/**
 * Notation that belongs to the team and not to a player, in a sentence `core` wrote about a dial.
 *
 * The three shapes `CHARTER_PROGRAMME.md` § M2's third exit criterion names — a source filename, a
 * member path, a section number — matched exactly as `honesty/properties.ts` matches them on a
 * rendered string. Two copies of a rule is how a rule drifts, so this one is deliberately the
 * narrower half: it is the *filter*, and the property is the *gate*. If this were ever wider than
 * the gate it would be hiding strings from a search rather than fixing them.
 *
 * A **bare identifier is not matched**, for the reason the gate does not match one either: without
 * this tree's own export list there is no way to tell `parkingStrategy` from an ordinary word an
 * author capitalised, and a spelling rule that guessed would refuse descriptions that are perfectly
 * readable. `estimateCost()` in the description this was written for is caught by the member-path
 * clause's sibling — the filename beside it — rather than on its own.
 */
const INTERNAL_NOTATION =
  /(?:§\s*\d|\b[A-Za-z0-9_$-]+(?:\/[A-Za-z0-9_$-]+)*\.(?:ts|tsx|js|mjs|cjs|json|html|css|md)\b|\b[A-Za-z_$][A-Za-z0-9_$]*(?:[./][A-Za-z0-9_$-]+)*#[A-Za-z_$][A-Za-z0-9_$]*)/u;

/**
 * A schema's own `description`, made safe to print on a player-facing surface — or the refusal.
 *
 * **This exists because of a real finding, and the finding is `core`'s prose rather than this
 * lane's.** `IDLE_PARAMETERS` declares `idle.predictorHorizonS` with a description containing
 * *"…the horizon sets what 'likely to appear soon' means…"*. That sentence is correct, it is
 * addressed to somebody reading a parameter schema, and it is **not** a translated confidence
 * interval — but it is a probability word, it reaches the campaign briefing through
 * `SearchParameter.description`, and a rule enforced against authored text and not against derived
 * text is a rule with a hole in it exactly where nobody is looking.
 *
 * Rewriting `core`'s description is not this lane's call and would be the wrong fix anyway: the
 * Parameters tab is a schema surface and may show it. So the text is **replaced, with the reason
 * and the word named** — R3's shape applied to R10 — and the dial is still named, so nothing is
 * hidden.
 *
 * ## The exemption's stated reason — [§ D171](../../../../DECISIONS.md), and it was adjudicated
 *
 * *"The Parameters tab is a schema surface and may show it"* was a decision this module made
 * without one, and the honesty search (`honesty/`) reported the collision as a finding rather
 * than resolving it: § D163 clause 1 says *"no probability word **anywhere**"*, and two shipped
 * sentences disagreeing is not a harness author's call. § D171 adjudicated it, and **narrowed the
 * rule rather than the product**:
 *
 * > R10 exists to stop a confidence interval being translated into a probability word. A
 * > parameter description saying a demand predictor forecasts floors where traffic is *likely* is
 * > technical prose about **what a dial does**, not a claim about a result — and rewriting
 * > `core`'s own description of its own parameter would cost precision to satisfy a rule aimed at
 * > something else.
 *
 * So the exemption **stands, with a reason** rather than as an unexplained special case, and it
 * is now enforced where it belongs: `honesty/properties.ts` scopes R10 to result-bearing
 * provenance, and the Parameters tab is the one surface whose text has no result behind it. This
 * function is unchanged, still applies everywhere a *result* is being briefed, and is itself
 * searched — if it ever returns a string carrying a probability word, that is a hole in the
 * remedy and the search is red.
 */
export function playerSafeDescription(text: string | undefined): string | null {
  if (text === undefined) return null;
  /*
   * **The second refusal, and it is the same shape as the first for the same reason** (GitHub
   * issue #207, and the finding the deep honesty tier recorded against this exact description).
   *
   * `auction.aggregation`'s description ends *"…which is exactly the comparison
   * docs/01-architecture.md asks to be benchmarked rather than assumed"* and names two source files
   * besides. It is correct, it is well written, and it is written for somebody who can open those
   * files — and the campaign brief re-prints it on a list of controls a **player** may edit. That
   * is § M2's criterion exactly: a note to the team, left on a player's screen, is a sentence they
   * cannot follow up.
   *
   * The remedy is this function's rather than `core`'s, and the register that found it says why:
   * this filter already exists to make `core`'s words player-safe, and it already runs on this
   * description. A remedy that touches the sentence and leaves the defect in it is the cheapest
   * thing to overlook. The Parameters tab is a schema surface, prints the text whole, and is
   * unaffected — which is the same split the probability-word arm below already draws.
   */
  if (INTERNAL_NOTATION.test(text)) {
    return (
      "this dial's own description is not reproduced here, because it is written for somebody " +
      'reading the source: it points at files and sections this screen cannot open. The ' +
      'Parameters tab shows the schema text in full.'
    );
  }
  if (probabilityWordIn(text) === null) return text;
  /*
   * The refusal does **not** quote the offending word, and that was found by the test rather than
   * decided in advance: a refusal that named it tripped the very rule it exists to keep, on a
   * blanket assertion over every player-facing string. Exempting the refusal was the other option
   * and is the weaker one — a rule with one carve-out is a rule with a place to hide. The word is
   * still recoverable: the dial is named, and the Parameters tab prints the schema text whole.
   */
  return (
    "this dial's own description is not reproduced here, because it uses one of the words this " +
    'surface does not print — a word for how sure something is. The Parameters tab shows the ' +
    'schema text in full.'
  );
}
