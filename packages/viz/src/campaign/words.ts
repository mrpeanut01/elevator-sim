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
 */
export function playerSafeDescription(text: string | undefined): string | null {
  if (text === undefined) return null;
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
