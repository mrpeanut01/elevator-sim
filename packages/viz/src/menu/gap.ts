/**
 * **The one sentence every board says about a gap** — GitHub issue #93 § 3.
 *
 * Extracted from `dev/menuPanel.ts` when the Everyday daily board grew the same feature: the
 * Engineer's challenge board and leaderboard have highlighted the reader's row and printed its
 * distance from the top since issues #112 and #93, and the daily board — the screen a new player
 * meets first — did neither. Three copies of this arithmetic would be three places deciding what
 * *behind* means, and the tie case is exactly where they would drift.
 *
 * Pure and DOM-free so `everyday/` can read it under `boundaries.test.ts`'s rule.
 */

/**
 * ` · 4.2 s behind the top row on this board’s metric`, or `''` for the top row and for a tie.
 *
 * Every ranked metric on every board is a cost, so a non-positive gap means this row *is* the top
 * row — or ties it, which is not a thing to congratulate somebody on in a sentence about a
 * difference.
 */
export function gapSentence(gap: number, unit: string): string {
  if (!(gap > 0)) return '';
  return ` · ${gap.toFixed(1)} ${unit} behind the top row on this board’s metric`;
}
