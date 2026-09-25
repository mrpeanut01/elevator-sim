/**
 * **The first session's day, drawn on a named stream from the first-day set** — GitHub issue #208's
 * code half, under § D475's ruling and § D512's table; § D514, narrowed by
 * [§ D1047](../../../../DECISIONS.md).
 *
 * § D475 ruled that *every eligible building can carry the first session, drawn at random*, and that
 * *eligible* is a measurement. § D512 made the first measurement: a day is legible when a landing
 * holds somebody in the stage's third wait band for two contiguous minutes, and every contract ×
 * fifty seeds says which buildings ever are. [§ D525](../../../../DECISIONS.md) then narrowed
 * § D514's draw — *the draw stands only where every candidate passes the doable-and-failable test* —
 * and nothing had ever measured that of any candidate: over two years of dates the draw dealt a
 * reference tower on 307 of 730, the day this was written among them.
 *
 * **§ D1047 carries § D525's narrowing out.** The draw is over {@link FIRST_DAY_CONTRACT_IDS} — the
 * legible towers whose pinned press day § D1029's call-window rule admits — and the day a fresh
 * device is dealt is that tower's **pinned day**: its pinned crowd, under its standing order, which
 * is the one run `shift/pressLadder.test.ts` proves misses as built, clears on one answer to the
 * stage's call and misses on the other, on every suite run.
 *
 * 1. **The set is derived, not typed.** {@link ELIGIBLE_FIRST_CONTRACT_IDS} is every contract
 *    legible on more than a third of the sweep's fifty seeds, read off `shift/legibility.ts`'s
 *    table, and {@link FIRST_DAY_CONTRACT_IDS} is that set intersected with
 *    `shift/ladder.ts#admittedPressDayIds`. **This paragraph said Chancery House and St Jude's were
 *    not in the legible set**, at 2 and 1 of 50. That was measured with every car in service and
 *    stopped being true on 2026-09-22, when both rungs booked cars out and both crossed the
 *    threshold (§ D963) — so a sentence beside a derived constant went stale while the constant did
 *    not, which is why the members are not listed here at all. Garden Apartments is the one tower
 *    the legibility table still leaves out.
 * 2. **The draw is a named stream.** {@link firstSessionContractFor} derives a `first-session`
 *    stream from a seed, `campaign/incidents.ts`'s shape: a sibling of the run's `StreamSet` rather
 *    than one of its streams, because a draw taken from `policyNoise` before the run would shift
 *    every stochastic dispatcher's sequence on a day the player never touched.
 *
 *    **Since [§ D729](../../../../DECISIONS.md) a fresh device opens on the UTC date's own digits**
 *    (`shift/dailySeed.ts`), so everyone arriving on one date is dealt the same tower. **Since
 *    § D1047 the day is not played on that seed**: the draw is taken from the date and the run is the
 *    pin's own crowd (`dev/state.ts#withFirstSession`). So the number the door prints is the pin's,
 *    not the one the draw was taken from, and the door's line has an arm that says so —
 *    {@link FIRST_SESSION_LINE_PINNED}, chosen by {@link firstSessionLineFor} asking the draw on
 *    the day's seed rather than on the printed one. A `?seed=` in the address still wins: the tower
 *    is drawn from that seed and played on it, which is an ordinary day on a press-day tower.
 *
 * **Nothing is stored** (§ D993's forward rule). A reload that restores no session re-derives the
 * same pin from the same date. The owner may widen {@link FIRST_DAY_CONTRACT_IDS} back to the
 * legible set, which restores the draw as it was before § D1047; the pinned route then applies only
 * to the members that pin a day, and nothing else has to be undone.
 *
 * ## What it does not decide
 *
 * The campaign's `c1` stays Garden Apartments — § D512 left that to #270 and #234, and the campaign
 * career is a different record from the daily loop's week. And #208's fourth criterion, ten
 * first-time testers, is not a property of code (§ D349); this module discharges the first three
 * and `firstSession.test.ts` says how.
 */

import { Pcg32, deriveStreamSeed } from '@elevator-sim/core/browser';

import { admittedPressDayIds, pressDayFor } from './ladder.js';
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

/**
 * **The first scored day's candidate set: legible and admitted** — wave AI,
 * [§ D1029](../../../../DECISIONS.md) for the set and [§ D1047](../../../../DECISIONS.md) for the
 * draw over it.
 *
 * {@link ELIGIBLE_FIRST_CONTRACT_IDS} (§ D512's legibility) intersected with
 * `shift/ladder.ts#admittedPressDayIds` (§ D1029's admission criterion), in contract order. Both
 * halves are derived from data, so this is never typed: a pin that stops being admitted, or a tower
 * that stops being legible, leaves the set on the same commit, and the draw with it.
 *
 * **Guarded non-empty with no fallback.** An empty set makes {@link firstSessionContractFor} throw
 * rather than quietly drawing from the legible set, and `firstSession.test.ts` fails first.
 */
export const FIRST_DAY_CONTRACT_IDS: readonly string[] = Object.freeze(
  ELIGIBLE_FIRST_CONTRACT_IDS.filter((id) => admittedPressDayIds().includes(id)),
);

/**
 * The contract a first session drawn from `seed` opens on — one of {@link FIRST_DAY_CONTRACT_IDS}.
 *
 * The draw is the same named stream it has been since § D514; only the set it indexes narrowed
 * (§ D1047). `dev/state.ts#withFirstSession` hands it the seed a fresh device opened on — the day's,
 * or the address's where `?seed=` was given.
 */
export function firstSessionContractFor(seed: number | bigint): string {
  const { initState, initSeq } = deriveStreamSeed(seed, FIRST_SESSION_STREAM);
  const rng = new Pcg32(initState, initSeq);
  const count = FIRST_DAY_CONTRACT_IDS.length;
  const index = Math.min(count - 1, Math.floor(rng.nextFloat() * count));
  const drawn = FIRST_DAY_CONTRACT_IDS[index];
  if (drawn === undefined) {
    throw new Error('the first-day set is empty, so no first session can be drawn — and none falls back');
  }
  return drawn;
}

/**
 * **The day a fresh device is dealt on `daySeed`** — the drawn contract and its pinned day's crowd
 * and standing order, [§ D1047](../../../../DECISIONS.md).
 *
 * The pair `everyday/host.ts#playPressDay` writes, read from the same row: `seedText` and
 * `standingOrder` of `shift/ladder.ts#pressDayFor`. Every member of {@link FIRST_DAY_CONTRACT_IDS}
 * pins a day by construction (admitted implies pinned), and the throw is for the day that stops
 * being true rather than a branch anybody expects to take.
 */
export function firstSessionDayFor(daySeed: number | bigint): {
  readonly contractId: string;
  readonly seed: bigint;
  readonly standingOrder: string;
} {
  const contractId = firstSessionContractFor(daySeed);
  const press = pressDayFor(contractId);
  if (press === undefined) throw new Error(`first-day contract ${contractId} pins no day`);
  return { contractId, seed: BigInt(press.seedText), standingOrder: press.standingOrder };
}

/**
 * Whether the week is a first day nobody has played on one of the legible towers — the derived
 * condition under which the door says why this tower (§ D476's shape: derived from the player's own
 * progress on every load, stored nowhere). It is true of a drawn first session and equally true of a
 * player who moved to one of them before playing a day. {@link FIRST_SESSION_LINE} said it was
 * worded to be true in both cases and was not once the picker shipped, so the line has arms — see
 * {@link FIRST_SESSION_LINE_CHOSEN}, {@link FIRST_SESSION_LINE_PINNED} and
 * {@link firstSessionLineFor} (GitHub issue #595, § D1047).
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

/** A count as its word — {@link NUMBER_WORDS}, with the documented fallback. */
function countWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

/**
 * **What the first-day set is, in the words every arm but the chosen one opens with** —
 * [§ D1047](../../../../DECISIONS.md).
 *
 * Both halves of the set's definition, each in its own clause and neither naming the answer: the
 * legibility clause is § D512's, unchanged, and the second is what § D1029 admits — a car booked
 * out part-way through day 1, and on **one** crowd, one answer to the stage's call measured to clear
 * the day and the other to miss it. *On one crowd* is S2's condition from the ruling, kept in the
 * sentence rather than only in a docstring: a pin is a selected crowd, and nothing here may read as
 * a claim about the tower's days in general. **No verb**: § D529 clause 4 permits a worked answer in
 * the tutorial and nowhere else, so which press clears is the stage's to find out.
 */
const FIRST_DAY_SET_CLAUSE =
  `A first day opens on one of the ${countWord(FIRST_DAY_CONTRACT_IDS.length)} towers whose day 1 puts somebody past a minute on a landing ` +
  `for two minutes together, measured over ${String(LEGIBILITY_SWEEP.length * LEGIBILITY_SWEEP_N)} days, and where a car is booked out part-way ` +
  'through day 1 and, on one crowd, one answer to the stage’s call was measured to clear the day and the ' +
  'other to miss it.';

/**
 * The door's line under the seed on a first day drawn from the crowd it is played on. Player-facing;
 * swept by the corpus.
 *
 * **Since § D1047 this is the arm for a crowd the address chose** — `?seed=` — and for a player who
 * came back to the date's own tower on the date's crowd: in both, the draw on the printed number
 * deals this tower, so *the same number opens the same tower* is true. It is **not** the arm a bare
 * first load meets, which is {@link FIRST_SESSION_LINE_PINNED}. Its last clause says the crowd is not
 * the measured one, because {@link FIRST_DAY_SET_CLAUSE} has just described a measurement on a
 * different crowd and a reader would otherwise take this day for that one.
 *
 * **Both figures are derived rather than authored beside the data**, which is `docs/37` § 6's one
 * rule for every content type: *a count published on any player-facing surface is derived from the
 * list, never authored beside it*. They were literals — *"one of the **five** towers … measured over
 * **400** days"* — and moved four times before the count was derived. **On § D1047 the count moved
 * again and counts a different set**: fifteen legible towers became the six in
 * {@link FIRST_DAY_CONTRACT_IDS}, and the sentence moved on the same commit because it is the set's
 * own length.
 */
export const FIRST_SESSION_LINE =
  `${FIRST_DAY_SET_CLAUSE} The crowd number above is the draw, so the same number opens the same tower; ` +
  'it is not the crowd that was measured.';

/**
 * **The line on the day a fresh device is dealt: the pin's crowd, drawn from the date** —
 * [§ D1047](../../../../DECISIONS.md).
 *
 * {@link FIRST_SESSION_LINE}'s last sentence is false here and so is its neighbour's: the number the
 * door prints is the pin's, and the draw was taken from the date's. So this arm says both halves —
 * the date chose the tower, and the crowd is the one the day was measured on rather than the day's —
 * which is what the ruling's honesty member asked of a pinned first day (*labelled as a pinned
 * crowd*). *Everyone opening a first day today* is exact rather than generous: a fresh device with
 * no `?seed=` and no `?building=` in its address is dealt this day on this date, and that is the
 * only path it names.
 */
export const FIRST_SESSION_LINE_PINNED =
  `${FIRST_DAY_SET_CLAUSE} The crowd number above is that crowd, not the day’s: today’s date chose the ` +
  'tower, so everyone opening a first day today meets this same day.';

/**
 * **The pin's crowd, reached through a number whose own draw deals the tower** —
 * [§ D1047](../../../../DECISIONS.md), the case the other three arms cannot name.
 *
 * The pins were searched on the same sequence of crowds the draw can be handed, so a pin's own
 * number can draw its own tower: `c8`'s `20276662` does, and so does `c10`'s `20355852`. A `?seed=`
 * link carrying one lands on that tower's pinned day as measured, and none of the other arms is true
 * of it — the date did not choose
 * the tower ({@link FIRST_SESSION_LINE_PINNED}), the crowd *is* the measured one
 * ({@link FIRST_SESSION_LINE}), and the week was drawn rather than moved
 * ({@link FIRST_SESSION_LINE_CHOSEN}). `firstSession.test.ts` names which pins reach it, so a re-pin
 * that stops reaching it is seen.
 */
export const FIRST_SESSION_LINE_PINNED_BY_NUMBER =
  `${FIRST_DAY_SET_CLAUSE} The crowd number above is that crowd, and it is also the draw, so the ` +
  'same number opens this same day.';

/**
 * **The same line on a first day the draw did not choose** — GitHub issue #595,
 * [§ D973](../../../../DECISIONS.md).
 *
 * {@link isFirstDayOnALegibleTower} is true of a player who moved their week to a legible tower
 * with the picker (`everyday/towerChoice.ts`, § D912) as well as of a drawn first session, and its
 * own docstring said {@link FIRST_SESSION_LINE} was worded to be true in both. **It was not, from
 * the day the picker shipped**: *the crowd number above is the draw, so the same number opens the
 * same tower* is false of a tower the player chose, because that number draws some other tower. So
 * `everyday/today.ts#todayOf` picks between the arms by asking the draw itself.
 *
 * **Its count stays the legible set's**, unlike the other two arms: a tower the picker reached is
 * any legible one, and § D1047 did not narrow what the picker offers.
 */
export const FIRST_SESSION_LINE_CHOSEN =
  `This first day is on one of the ${countWord(ELIGIBLE_FIRST_CONTRACT_IDS.length)} towers whose day 1 puts somebody past a minute on a ` +
  `landing for two minutes together, measured over ${String(LEGIBILITY_SWEEP.length * LEGIBILITY_SWEEP_N)} days. The week was moved here rather than ` +
  'drawn, so the crowd number above is not what chose it.';

/**
 * Which of the three lines is true of a first day on `contractId` whose crowd is `seed`, on the day
 * whose own crowd is `daySeed` — the draw asked directly, never inferred from how the player arrived.
 *
 * 1. **The pin's crowd, on the tower the date dealt** — {@link FIRST_SESSION_LINE_PINNED}. The draw
 *    is asked on `daySeed`, because the printed number is the pin's and the draw was never taken
 *    from it.
 * 2. **The pin's crowd, whose own number draws the tower** — {@link FIRST_SESSION_LINE_PINNED_BY_NUMBER}.
 * 3. **Any other crowd whose own draw deals this tower** — {@link FIRST_SESSION_LINE}, the address's
 *    case, whose last clause says the crowd is not the measured one.
 * 4. **Anything else** — {@link FIRST_SESSION_LINE_CHOSEN}.
 */
export function firstSessionLineFor(contractId: string, seed: bigint, daySeed: bigint): string {
  const drawnByNumber = firstSessionContractFor(seed) === contractId;
  if (pressDayFor(contractId)?.seedText === seed.toString()) {
    if (isDealtPinnedDay(contractId, seed, daySeed)) return FIRST_SESSION_LINE_PINNED;
    return drawnByNumber ? FIRST_SESSION_LINE_PINNED_BY_NUMBER : FIRST_SESSION_LINE_CHOSEN;
  }
  return drawnByNumber ? FIRST_SESSION_LINE : FIRST_SESSION_LINE_CHOSEN;
}

/**
 * **Whether `contractId` on `seed` is the pinned day the date `daySeed` deals** — the one predicate
 * {@link firstSessionLineFor}'s pinned arm and `dev/main.ts`'s press-day seed base both ask,
 * [§ D1047](../../../../DECISIONS.md).
 *
 * True exactly when the crowd is the contract's pin and the draw on the day's own seed names that
 * contract. It is a fact about the tower and the two numbers rather than about how the page reached
 * them, so a reload that re-derived the day, a reload that read the day back from the address this
 * page wrote, and a player who pressed the same row on the picker all answer the same — which is
 * what lets the boot hand the host the day's crowd to put back without storing anything.
 */
export function isDealtPinnedDay(contractId: string, seed: bigint, daySeed: bigint): boolean {
  return (
    pressDayFor(contractId)?.seedText === seed.toString() &&
    FIRST_DAY_CONTRACT_IDS.includes(contractId) &&
    firstSessionContractFor(daySeed) === contractId
  );
}
