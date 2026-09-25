/**
 * **How many ways through each fix case clear the letter's morning** — the census
 * [§ D1120](../../../../DECISIONS.md) clause 1 reads, measured by the player's decision member (S1)
 * and re-measured on this tree by `routeCensus.sweep.test.ts`.
 *
 * ## What it is for
 *
 * The diagnosis is withheld until a player asks for it, which turns fifteen read-and-apply cases
 * into searches. That is only fair where there is something to find by searching. S1 pressed every
 * role-blind route through each offered case's editor (`routes.test-helper.ts#routesFor`, the same
 * enumeration the survivor suite uses) and counted the routes whose pair clears the gate on the
 * letter's morning. The median case had about five blind presses to a clear. **One case had a
 * single clearing route, and it was the diagnosed repair itself** — a needle, not a search — so the
 * ruling opens a case whose census shows fewer than {@link DIAGNOSIS_OPEN_BELOW} clearing routes with
 * its diagnosis shown, and says why. That rule is {@link opensWithDiagnosis}, and it reads this table
 * rather than a list of case ids, so a re-authored case moves in or out of it by being measured.
 *
 * ## What the counts are, and are not
 *
 * - **A route** is one move of one editor family, or one of a few two-control pairs, or the
 *   diagnosed repair tried last — whatever the case's budget can afford and the loader admits. It is
 *   a **sample** of what a player can do, and the table says so on screen as *"single changes
 *   tried"*, never as *"every way"*.
 * - **Clearing** is the gate: the pair on the letter's morning clears both of § 9's bars. It is not
 *   the fifty-morning verdict, which is what decides a case; a gate clear is what a player meets
 *   first, and it is the count the ruling measured. A route whose pair the product refuses (its crowd
 *   moved without the order claiming to) is counted as a route and not as a clear.
 * - **Held cases have no row**: they are not offered, so nobody searches them.
 *
 * Pinned by `routeCensus.test.ts` always-on (every offered case has a row; the row that opens a case
 * is re-derived, all of its routes) and by `routeCensus.sweep.test.ts` in the deep tier (every row).
 */

/** One case's census: the routes the sample tried, and how many cleared the letter's morning. */
export interface RouteCensusRow {
  readonly routes: number;
  readonly clearing: number;
}

/** A case whose census shows fewer clearing routes than this opens with its diagnosis shown. */
export const DIAGNOSIS_OPEN_BELOW = 2;

/**
 * The measurement, per offered case — `routeCensus.sweep.test.ts`'s output, pasted rather than
 * edited: `ELEVATOR_SIM_FIXIT_ROUTES=deep FIXIT_ROUTES_OUT=<path> npx vitest run --project viz
 * src/fixit/routeCensus.sweep.test.ts`, run by lane AJ-J on 2026-09-25 on wave AJ's integration tree
 * (`42494f9` plus this lane's commits), 190 s in one vitest process at a load average near 5.
 *
 * **S1's census on `e00c0f6` differs on four rows**, and the difference is recorded rather than
 * explained: `sleeping-sky-lobby` 46 → 51, `every-letter-says-nine` 4 → 5,
 * `every-deck-calls-itself-full` 55 → 59 and `let-faster-than-the-lifts` 3 → 2 clearing routes, with
 * every route count the same. Wave AI's integration landed between the two trees; which change moved
 * which row is not established here. The rule's answer is the same on both: one case, `express`,
 * opens with its diagnosis shown, and `let-faster` is the case nearest the line.
 */
export const ROUTE_CENSUS: Readonly<Record<string, RouteCensusRow>> = Object.freeze({
  'sleeping-sky-lobby': { routes: 233, clearing: 51 },
  'zoning-starves-the-top': { routes: 31, clearing: 4 },
  'three-cars-one-cars-work': { routes: 23, clearing: 6 },
  'doors-that-never-close': { routes: 23, clearing: 2 },
  'car-park-nobody-serves': { routes: 29, clearing: 7 },
  'express-that-stops-everywhere': { routes: 34, clearing: 1 },
  'deliveries-on-the-passenger-group': { routes: 22, clearing: 3 },
  'one-start-time': { routes: 25, clearing: 4 },
  'every-letter-says-nine': { routes: 25, clearing: 5 },
  'bed-cars-locked-out': { routes: 31, clearing: 5 },
  'two-cars-out-wrong-month': { routes: 33, clearing: 6 },
  'every-deck-calls-itself-full': { routes: 234, clearing: 59 },
  'restaurant-above-the-ballroom': { routes: 23, clearing: 5 },
  'controller-sends-every-car': { routes: 55, clearing: 17 },
  'let-faster-than-the-lifts': { routes: 36, clearing: 2 },
});

/** The case's census row, or `undefined` for a case the census does not cover. */
export function routeCensusOf(caseId: string): RouteCensusRow | undefined {
  return ROUTE_CENSUS[caseId];
}

/**
 * **Whether a case opens with its diagnosis shown** — [§ D1120](../../../../DECISIONS.md) clause 1:
 * its census shows fewer than {@link DIAGNOSIS_OPEN_BELOW} routes that clear the letter's morning.
 * A case with no census row is withheld like any other; `routeCensus.test.ts` holds that every
 * offered case has one.
 */
export function opensWithDiagnosis(caseId: string): boolean {
  const row = routeCensusOf(caseId);
  return row !== undefined && row.clearing < DIAGNOSIS_OPEN_BELOW;
}
