/**
 * **How Everyday Mode writes a figure** — ENGINE_CONTRACT § 13, transcribed once and owned here.
 *
 * The four daily-loop screens (door, brief, report, week) all print waits, shares and counts, and
 * § 13's rules are the kind that go wrong by being restated:
 *
 * ```
 * Figures are DM Mono 500, always with units: `81%`, `134 s`, `2 m 51 s`, `4 u`, `2.5 m/s`
 * Waits under 100 s in seconds; above, `m s` form (`3 m 21 s`)
 * Thousands separated with a comma
 * Percentages are integers except handling capacity, which carries one decimal
 * `—` (em dash) is the only placeholder for a figure that does not exist yet.
 *   Never `0`, never `N/A`, never a spinner where a dash will do.
 * Time of day is 24-hour, zero-padded (`08:41`)
 * ```
 *
 * ## Why every function here takes `undefined` and answers {@link EM_DASH}
 *
 * Because that is the *only* branch in which the rule can be got wrong. § 16 rule 1 — *an
 * unfinished thing shows `—`* — and § 12.2's withheld matrix are not about how a number looks;
 * they are about a screen that has no number and prints one anyway. Making absence a value these
 * functions accept means a caller with nothing to say cannot accidentally format a stand-in zero:
 * there is no arithmetic left for it to do, and `0` and `undefined` are two different arguments
 * that produce two different strings.
 *
 * `shift/goals.ts#PENDING_DISPLAY` is the same em dash for the same reason one layer down, and is
 * re-exported here rather than re-typed, so a reader who greps for the placeholder finds one
 * character with one owner.
 *
 * ## The units are not locale-formatted, and that is deliberate
 *
 * `toLocaleString` would make the comma depend on the machine the browser runs on and on the
 * machine a test runs on — the same class of non-determinism CLAUDE.md invariant 2 forbids one
 * layer down, and the reason `shift/contracts.ts#statLineOf` groups thousands by hand. This module
 * follows it rather than inventing a second answer.
 *
 * ## Two of § 13's rules are not implemented here, and the absence is the finding
 *
 * § 13 also gives the **wait** rule (*under 100 s in seconds; above, `m s` form*) and the **clock**
 * rule (*24-hour, zero-padded*). Both were written here first and both were **deleted before this
 * file shipped**, because nothing on the four daily screens calls them: every wait they draw comes
 * pre-formatted out of `shift/report.ts`'s figure grid or `shift/goals.ts`'s goal readings, and
 * every clock time comes out of `shift/report.ts#clockOf` on a diagnosis row. A formatter with no
 * caller is the dead-seam shape CLAUDE.md names as this repository's signature defect, and
 * `deadCode.test.ts` said so on the first run — which is exactly what it is for.
 *
 * The two rules therefore have an owner and it is not this module. A screen that one day needs to
 * format a raw wait should add the function **beside its caller**, and should check first whether
 * `shift/` has already formatted the quantity it is about to reformat.
 */

import { PENDING_DISPLAY } from '../shift/goals.js';

export { PENDING_DISPLAY as EM_DASH } from '../shift/goals.js';

/** `1710` → `1,710`. Hand-grouped, for the module docstring's reason. */
export function groupThousands(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A share, as § 13's integer percentage — or the em dash. Never a stand-in `0%`. */
export function percentFigure(pct: number | undefined): string {
  if (pct === undefined || !Number.isFinite(pct)) return PENDING_DISPLAY;
  return `${String(Math.round(pct))}%`;
}

/** A count of people, journeys or players — comma-grouped, or the em dash. */
export function countFigure(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return PENDING_DISPLAY;
  return groupThousands(value);
}
