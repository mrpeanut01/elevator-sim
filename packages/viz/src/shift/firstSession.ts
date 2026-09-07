/**
 * **The first session's tower, drawn from the legible set on a named stream** — GitHub issue #208's
 * code half, under § D475's ruling and § D512's table; § D514.
 *
 * § D475 ruled that *every eligible building can carry the first session, drawn at random*, and that
 * *eligible* is a measurement. § D512 made the measurement: a day is legible when a landing holds
 * somebody in the stage's third wait band for two contiguous minutes, and eight contracts × fifty
 * seeds says which buildings ever are. This module is the ruling's other two consequences:
 *
 * 1. **The set is derived from the table, not typed.** {@link ELIGIBLE_FIRST_CONTRACT_IDS} is every
 *    contract legible on more than a third of the sweep's fifty seeds — c2, c3, c4, c5 and c7 on the
 *    table `shift/legibility.ts` carries as data. Garden Apartments (0 of 50), Chancery House (2)
 *    and St Jude's (1) are not in it, which is #208's own finding arrived at by instrument.
 * 2. **The draw is a named stream.** {@link firstSessionContractFor} derives a `first-session` stream
 *    from the session's own seed, `campaign/incidents.ts`'s shape: a sibling of the run's `StreamSet`
 *    rather than one of its streams, because a draw taken from `policyNoise` before the run would
 *    shift every stochastic dispatcher's sequence on a day the player never touched. The seed is the
 *    one the door already prints, so the draw is reproducible from what the player can read.
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
 * player who moved to one of the five before playing a day, and {@link FIRST_SESSION_LINE} is worded
 * so that it is true in both cases.
 */
export function isFirstDayOnALegibleTower(week: WeekState): boolean {
  return (
    week.day === 1 &&
    week.history.length === 0 &&
    week.attempt === 0 &&
    ELIGIBLE_FIRST_CONTRACT_IDS.includes(week.contractId)
  );
}

/** The door's line under the seed on such a day. Player-facing; swept by the corpus. */
export const FIRST_SESSION_LINE =
  'A first day opens on one of the five towers whose day 1 puts somebody past a minute on a landing ' +
  'for two minutes together, measured over 400 days. The crowd number above is the draw, so the ' +
  'same number opens the same tower.';
