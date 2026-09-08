/**
 * Types for `closing-keywords.mjs`, so that `validation/closingKeywords.test.ts` can import the
 * pure functions under `tsc -b` without `allowJs`.
 *
 * `blocked-by.d.mts`'s argument, unchanged: the script is plain JavaScript because the workflow
 * runs it with `node` and no install, so it may not depend on a build — and this file lives beside
 * the script rather than beside the test, because a declaration next to the test would describe
 * what the test wishes the script exported, and the test would then pass against a script that had
 * drifted.
 */

/** One closing-keyword sighting, with enough context for a human to act on it. */
export interface Sighting {
  /** Which text it was found in — `body`, or `commit <sha>`. */
  readonly where: string;
  /** The issue number the keyword points at. */
  readonly issue: number;
  /** The keyword itself, as written. */
  readonly keyword: string;
  /** Whether a negation precedes it inside `NEGATION_WINDOW` characters. */
  readonly negated: boolean;
  /** The fragment around it, whitespace-collapsed, for the report. */
  readonly quote: string;
}

/** One commit of a pull request, reduced to the two fields the check reads. */
export interface CommitLike {
  readonly sha?: string | undefined;
  readonly message?: string | undefined;
}

/** What the check decided about a whole pull request. */
export interface Verdict {
  /** `false` only for a negated keyword. An intentional one is reported and never refused. */
  readonly ok: boolean;
  readonly negated: readonly Sighting[];
  readonly intentional: readonly Sighting[];
  /** Issue numbers this merge will close, deduplicated and ascending. */
  readonly willClose: readonly number[];
}

export const CLOSING_KEYWORDS: readonly string[];
export const KEYWORD_REFERENCE: RegExp;
export const NEGATION_WINDOW: number;
export const NEGATION: RegExp;

export function sightingsIn(text: string, where: string): readonly Sighting[];
export function verdictOf(input: {
  readonly body?: string | undefined;
  readonly commits?: readonly CommitLike[] | undefined;
}): Verdict;
export function summaryOf(verdict: Verdict): string;
