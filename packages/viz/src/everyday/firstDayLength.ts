/**
 * **How long a pinned whole day takes to watch, and when its call comes** — wave AI's first-day
 * ruling, [§ D1047](../../../../DECISIONS.md), the condition its honesty member added at the
 * tiebreak.
 *
 * A brand-new player's first scored day is a pinned press day (`shift/firstSession.ts`), and four
 * of the six the draw can deal are **whole authored days**: forty-odd minutes of watching at the
 * shipped rung against a slice's seven and a half. The tiebreak admitted whole days to the first-day
 * set on one condition — that the brief says, before the day starts, **how long it takes** and
 * **when the stage will stop for its call**, both derived rather than typed. This module is the
 * derivation, and the brief draws its one sentence (`everyday/today.ts#TodayRecord.dayLength`).
 *
 * ## What is measured and what is composed
 *
 * {@link PINNED_DAY_LENGTHS} is **measured**: for every admitted whole-day pin, the pinned crowd under
 * its standing order through the shipped builder, the call asked of that run by
 * `shift/pressCall.ts#pressCallOf` — the one function the stage asks — and the stage's pacing read
 * off the legs: since [§ D1169](../../../../DECISIONS.md) a pinned day is paced as every scored day
 * is, every stretch with somebody past a minute on a landing at the watching rung and the rest at
 * the fast rung, so the acts are no longer slow of themselves (they were under § D991); and since
 * [§ D1212](../../../../DECISIONS.md) the quiet between its peaks is skipped, up to the call and
 * after it, by `stagePace.test-helper.ts#scoredDayPlayOf`, the stage's own rule read off the legs.
 * `firstDayLength.test.ts` re-runs every row on every suite run and refuses the table the day a run
 * disagrees, and asserts that the table's contracts **are** the whole-day members of the admitted
 * set, so a re-pin or a new pin cannot leave a stale row or a missing one.
 *
 * The **minutes** are composed from those seconds through `sittingShape.ts#pacedDayRealS` at the
 * stage's opening rung — § D753 rule 1, the rung read rather than transcribed — so a move of either
 * rung moves this sentence on the same commit.
 *
 * ## Four things it is careful not to say
 *
 * - **The day's length is the middle of the three runs the call can leave** — nothing pressed, the
 *   clearing press, the other one — rounded to the minute, and the sentence says *about*. It said
 *   *up to* the longest of the three until [§ D1204](../../../../DECISIONS.md) opened the day's
 *   ordinary calls after the pinned one: from then on every later answer moves the day's slow
 *   stretches again, the branches multiply, and no bound over three runs bounds them (the decide-an
 *   panel's honesty member measured the *keep* branch at 30.4 real minutes against a bound of
 *   29.2, both under § D1169 before the skip). *About* is what three runs support, and the spread
 *   the branches actually reach is published with § D1204 rather than here.
 * - **The stage stops *first* for its call, not *once***, where the day's ordinary calls are
 *   offered after it (`asksOn`, § D1138 clause 5's size gate read off the as-built run) — and the
 *   sentence promises no count of later stops, because the calls are raised by what the day does.
 * - **The pause at the call is not counted.** It is the player's own dwell, which `sittingShape.ts`
 *   refuses to invent a figure for; the sentence says *of watching*.
 * - **Where the call falls is derived from the day's own peaks, not named.** The tiebreak that asked
 *   for this sentence wrote *the call comes in the lunch act*. That was true of the pins it read —
 *   § D974's press at 0.43 of the day, 12:18 — and stopped being true when § D1029 moved the press
 *   to a call the stage names from what it draws: measured, every whole-day call falls between the
 *   day's first two peaks. So the position is counted off `shift/dayLength.ts#actsOf` in the test and
 *   carried here as `peaksBefore` and `inPeak`, and the sentence says *between the first and second of
 *   the day's three peaks* — which is what the measurement says, and what *in the lunch act* would
 *   have contradicted (§ D227).
 */

import { pacedDayRealS } from './sittingShape.js';
import { BETWEEN_PEAKS_SIM_PER_REAL_S } from './stagePace.js';
import { DEFAULT_STAGE_SPEED_INDEX, STAGE_SPEEDS, stageSpeedAt } from './stageScreenModel.js';

/** One admitted whole-day pin, as the stage would play it. Seconds are simulated. */
export interface PinnedDayLength {
  readonly contractId: string;
  /** `pressCallOf` over the as-built run — seconds from the start of the day. */
  readonly callAtS: number;
  /** Simulated seconds before the call that § D1169 plays at the watching rung. */
  readonly toCallSlowS: number;
  /** Simulated seconds before the call that § D1212 skips between the peaks. */
  readonly toCallSkippedS: number;
  /** How many of the day's peaks (`actsOf`) there are, and how many end at or before the call. */
  readonly peaks: number;
  readonly peaksBefore: number;
  /** Whether the call falls inside a peak. */
  readonly inPeak: boolean;
  /**
   * The middle of the three runs the call can leave, by paced length, as a recording's length, its
   * slow part and what § D1212 skips — [§ D1204](../../../../DECISIONS.md).
   */
  readonly middle: { readonly recordedS: number; readonly slowS: number; readonly skippedS: number };
  /**
   * Whether the day asks on after its call — `shift/dayCalls.ts#dayCallsOffered` over the as-built
   * run's legs, the gate `dev/state.ts#dayCallsOpenOn` reads ([§ D1204](../../../../DECISIONS.md)).
   */
  readonly asksOn: boolean;
}

/**
 * **Measured** — every admitted whole-day pin, by `firstDayLength.test.ts`, which re-derives each row
 * from a run on every suite run. Contract order.
 */
export const PINNED_DAY_LENGTHS: readonly PinnedDayLength[] = Object.freeze([
  {
    contractId: 'c2',
    callAtS: 9613.907,
    toCallSlowS: 644.207,
    toCallSkippedS: 5685.554,
    peaks: 3,
    peaksBefore: 1,
    inPeak: false,
    middle: { recordedS: 36000, slowS: 2572.237, skippedS: 26606.717 },
    asksOn: true,
  },
  {
    contractId: 'c3',
    callAtS: 9929.738,
    toCallSlowS: 439.626,
    toCallSkippedS: 6192.6,
    peaks: 3,
    peaksBefore: 1,
    inPeak: false,
    middle: { recordedS: 36000, slowS: 2505.895, skippedS: 26481.852 },
    asksOn: true,
  },
  {
    contractId: 'c6',
    callAtS: 9809.566,
    toCallSlowS: 107.664,
    toCallSkippedS: 6082.344,
    peaks: 3,
    peaksBefore: 1,
    inPeak: false,
    middle: { recordedS: 36000, slowS: 1475.277, skippedS: 27493.537 },
    asksOn: true,
  },
  {
    contractId: 'c10',
    callAtS: 12509.792,
    toCallSlowS: 575.532,
    toCallSkippedS: 8783.558,
    peaks: 3,
    peaksBefore: 1,
    inPeak: false,
    middle: { recordedS: 36062.614, slowS: 2164.072, skippedS: 27171.447 },
    asksOn: true,
  },
]);

const ORDINALS: readonly string[] = Object.freeze(['first', 'second', 'third', 'fourth', 'fifth', 'sixth']);
const COUNTS: readonly string[] = Object.freeze(['no', 'one', 'two', 'three', 'four', 'five', 'six']);

/** The between-peaks rung's own chip label — § D354's rule that a label is its multiplier. */
function betweenRungLabel(): string {
  const rung = STAGE_SPEEDS.find((speed) => speed.simPerRealS === BETWEEN_PEAKS_SIM_PER_REAL_S);
  if (rung === undefined) throw new Error('firstDayLength: the between-peaks rung is not on the ladder');
  return rung.label;
}

/** Where the call falls against the day's peaks, in words — derived from the row, never named. */
function positionOf(row: PinnedDayLength): string {
  const total = COUNTS[row.peaks] ?? String(row.peaks);
  const nth = (index: number): string => ORDINALS[index] ?? String(index + 1);
  if (row.inPeak) return `during the ${nth(row.peaksBefore)} of the day’s ${total} peaks`;
  if (row.peaksBefore === 0) return `before the first of the day’s ${total} peaks`;
  if (row.peaksBefore >= row.peaks) return `after the last of the day’s ${total} peaks`;
  return `between the ${nth(row.peaksBefore - 1)} and ${nth(row.peaksBefore)} of the day’s ${total} peaks`;
}

/**
 * **The brief's sentence for a pinned whole day**, or `undefined` for a contract with no measured
 * row — a slice, a refused pin, a tower that pins nothing. Player-facing; swept by the corpus.
 * Re-derived by [§ D1204](../../../../DECISIONS.md): *about* the middle arm rather than *up to* the
 * longest, and the stage stops *first* for its call where the day asks on after it; and by
 * [§ D1212](../../../../DECISIONS.md): the quiet between peaks is skipped, and said to be. Both hold
 * at once in the table — the later calls fall inside peaks, where nothing is skipped.
 */
export function pinnedDayLengthLineOf(contractId: string): string | undefined {
  const row = PINNED_DAY_LENGTHS.find((entry) => entry.contractId === contractId);
  if (row === undefined) return undefined;
  const rung = stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX);
  const dayMin = Math.round(pacedDayRealS({ periodS: row.middle.recordedS, ...row.middle }, rung.simPerRealS) / 60);
  const toCallMin = Math.round(
    pacedDayRealS(
      { periodS: row.callAtS, recordedS: row.callAtS, slowS: row.toCallSlowS, skippedS: row.toCallSkippedS },
      rung.simPerRealS,
    ) / 60,
  );
  const call = `for its call ${positionOf(row)}, about ${String(toCallMin)} min in`;
  return (
    `A whole day: about ${String(dayMin)} min of watching at ${rung.label}, ${betweenRungLabel()} ` +
    `wherever nobody on a landing has waited a minute, and the quiet between peaks skipped. ` +
    (row.asksOn ? `The stage stops first ${call}, and may stop again later in the day.` : `The stage stops once ${call}.`)
  );
}
