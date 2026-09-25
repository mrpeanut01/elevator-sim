/**
 * **The first session's tower, drawn from the legible set on a named stream** — GitHub issue #208's
 * code half, under § D475's ruling and § D512's table; § D514.
 *
 * § D475 ruled that *every eligible building can carry the first session, drawn at random*, and that
 * *eligible* is a measurement. § D512 made the measurement: a day is legible when a landing holds
 * somebody in the stage's third wait band for two contiguous minutes, and every contract × fifty
 * seeds says which buildings ever are. This module is the ruling's other two consequences:
 *
 * 1. **The set is derived from the table, not typed.** {@link ELIGIBLE_FIRST_CONTRACT_IDS} is every
 *    contract legible on more than a third of the sweep's fifty seeds, read off the table
 *    `shift/legibility.ts` carries as data. Garden Apartments (0 of 50), Chancery House (2) and
 *    St Jude's (1) are not in it, which is #208's own finding arrived at by instrument; the members
 *    are deliberately not listed here, because a list in prose beside a derived constant is the
 *    second copy that goes stale (`legibility.ts` carries the table and the reading).
 * 2. **The draw is a named stream.** {@link firstSessionContractFor} derives a `first-session` stream
 *    from the session's own seed, `campaign/incidents.ts`'s shape: a sibling of the run's `StreamSet`
 *    rather than one of its streams, because a draw taken from `policyNoise` before the run would
 *    shift every stochastic dispatcher's sequence on a day the player never touched. The seed is the
 *    one the door already prints, so the draw is reproducible from what the player can read.
 *
 *    **Since [§ D729](../../../../DECISIONS.md) that seed is the UTC date's own digits**
 *    (`shift/dailySeed.ts`), where it used to be `crypto.getRandomValues` at boot. Nothing in this
 *    module changed and nothing needed to: the property above is what carries the fix, because a
 *    draw that is reproducible from the number the player reads becomes a draw that is
 *    reproducible from *the date* the moment the number is the date. That is why a rotation table
 *    was not written instead — see `dailySeed.ts`'s closing section, which measures what this draw
 *    does over two years and says why the rotation rules `docs/37` § 4.3 states are not adopted
 *    while `dev/state.ts#withFirstSession` runs once per device.
 *
 * ## What it does not decide
 *
 * The campaign's `c1` stays Garden Apartments — § D512 left that to #270 and #234, and the campaign
 * career is a different record from the daily loop's week. And #208's fourth criterion, ten
 * first-time testers, is not a property of code (§ D349); this module discharges the first three
 * and `firstSession.test.ts` says how.
 */

import { Pcg32, deriveStreamSeed } from '@elevator-sim/core/browser';

import { LEGIBILITY_SWEEP } from './legibility.js';
import type { WeekState } from './types.js';

/** The stream name the draw derives from the session's seed. */
export const FIRST_SESSION_STREAM = 'first-session';

/** The sweep's `n`, so the threshold below reads as the fraction it is. */
export const LEGIBILITY_SWEEP_N = 50;

/**
 * Contracts legible on more than a third of the sweep's seeds, in contract order — § D512's reading
 * of its own table, derived here rather than restated.
 */
export const ELIGIBLE_FIRST_CONTRACT_IDS: readonly string[] = Object.freeze(
  LEGIBILITY_SWEEP.filter((row) => row.legibleOf50 * 3 > LEGIBILITY_SWEEP_N).map((row) => row.contractId),
);

/** The contract a first session on `seed` opens on — one of {@link ELIGIBLE_FIRST_CONTRACT_IDS}. */
export function firstSessionContractFor(seed: number | bigint): string {
  const { initState, initSeq } = deriveStreamSeed(seed, FIRST_SESSION_STREAM);
  const rng = new Pcg32(initState, initSeq);
  const count = ELIGIBLE_FIRST_CONTRACT_IDS.length;
  const index = Math.min(count - 1, Math.floor(rng.nextFloat() * count));
  const drawn = ELIGIBLE_FIRST_CONTRACT_IDS[index];
  if (drawn === undefined) throw new Error('the eligible set is empty, so no first session can be drawn');
  return drawn;
}

/**
 * Whether the week is a first day nobody has played on one of the legible towers — the derived
 * condition under which the door says why this tower (§ D476's shape: derived from the player's own
 * progress on every load, stored nowhere). It is true of a drawn first session and equally true of a
 * player who moved to one of them before playing a day. {@link FIRST_SESSION_LINE} said it was
 * worded to be true in both cases and was not once the picker shipped, so the line now has two arms
 * — see {@link FIRST_SESSION_LINE_CHOSEN} and {@link firstSessionLineFor} (GitHub issue #595).
 */
export function isFirstDayOnALegibleTower(week: WeekState): boolean {
  return (
    week.day === 1 &&
    week.history.length === 0 &&
    week.attempt === 0 &&
    ELIGIBLE_FIRST_CONTRACT_IDS.includes(week.contractId)
  );
}

/**
 * English number words for the one count this line publishes.
 *
 * **Extended past `ten` on 2026-09-15** (GitHub issues #428, #427 and #426). The eligible set is the
 * length of a derived list, and the fallback below is `String(n)` — so a set of eleven or more would
 * have put a **digit** into a player-facing sentence, which is the one thing this line must not do:
 * the honesty search asks whether a figure is *licensed*, and a bare numeral in prose is a figure
 * with no source. The list covers the campaign's own size rather than an arbitrary ceiling, and the
 * fallback is kept because a list that silently ran out is worse than one that reads oddly once.
 */
const NUMBER_WORDS: readonly string[] = Object.freeze([
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
]);

/**
 * The door's line under the seed on such a day. Player-facing; swept by the corpus.
 *
 * **Both figures are derived from the table rather than authored beside it**, which is
 * `docs/37-content-plan.md` § 6's one rule for every content type: *a count published on any
 * player-facing surface is derived from the list, never authored beside it*. They were literals —
 * *"one of the **five** towers … measured over **400** days"* — and they were correct for an
 * eight-contract sweep of five eligible towers. The sweep is **sixteen** contracts now (GitHub issues
 * #500 and #501, then #425, #424 and #430, then #428, #427 and #426), so both numbers have moved
 * three times, and a literal would have had to be remembered on each. The count is the
 * eligible set's own length and the days are `rows × n`, so a contract entering or leaving the
 * legible set moves the sentence on the same commit that moves the table.
 *
 * **And on 2026-09-22 it moved for the first time with no contract added at all** —
 * [§ D963](../../../../DECISIONS.md). Six ladder rungs moved under the sweep
 * ([§ D914](../../../../DECISIONS.md)), `c6`, `c8` and `c9` crossed § D512's threshold from below,
 * and the set went **eleven → fourteen** with sixteen rows in the table either side. That is the
 * case this derivation was written for and the one a literal would certainly have missed: the
 * table's own size did not move, so nobody editing a contract list would have looked here.
 */
export const FIRST_SESSION_LINE =
  `A first day opens on one of the ${NUMBER_WORDS[ELIGIBLE_FIRST_CONTRACT_IDS.length] ?? String(ELIGIBLE_FIRST_CONTRACT_IDS.length)} towers whose day 1 puts somebody past a minute on a landing ` +
  `for two minutes together, measured over ${String(LEGIBILITY_SWEEP.length * LEGIBILITY_SWEEP_N)} days. The crowd number above is the draw, so the ` +
  'same number opens the same tower.';

/**
 * **The same line on a first day the draw did not choose** — GitHub issue #595,
 * [§ D973](../../../../DECISIONS.md).
 *
 * {@link isFirstDayOnALegibleTower} is true of a player who moved their week to a legible tower
 * with the picker (`everyday/towerChoice.ts`, § D912) as well as of a drawn first session, and its
 * own docstring said {@link FIRST_SESSION_LINE} was worded to be true in both. **It was not, from
 * the day the picker shipped**: *the crowd number above is the draw, so the same number opens the
 * same tower* is false of a tower the player chose, because that number draws some other tower —
 * and false again of a pinned day, whose crowd number was never the day's at all. So the line has
 * two arms, and `everyday/today.ts#todayOf` picks between them by asking the draw itself
 * ({@link firstSessionContractFor} over the seed the door prints) whether it would have opened this
 * tower, which is exactly the condition under which the first arm's last sentence is true.
 *
 * The first sentence is shared, derived on the same terms, and stays true either way: the tower is
 * one of the legible set whoever put the week there.
 */
export const FIRST_SESSION_LINE_CHOSEN =
  `This first day is on one of the ${NUMBER_WORDS[ELIGIBLE_FIRST_CONTRACT_IDS.length] ?? String(ELIGIBLE_FIRST_CONTRACT_IDS.length)} towers whose day 1 puts somebody past a minute on a ` +
  `landing for two minutes together, measured over ${String(LEGIBILITY_SWEEP.length * LEGIBILITY_SWEEP_N)} days. The week was moved here rather than ` +
  'drawn, so the crowd number above is not what chose it.';

/**
 * Which of the two lines is true of a first day on `contractId` at `seed` — the draw asked
 * directly, never inferred from how the player arrived.
 */
export function firstSessionLineFor(contractId: string, seed: bigint): string {
  return firstSessionContractFor(seed) === contractId ? FIRST_SESSION_LINE : FIRST_SESSION_LINE_CHOSEN;
}
