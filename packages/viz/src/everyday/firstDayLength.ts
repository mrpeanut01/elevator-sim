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
 * `shift/pressCall.ts#pressCallOf` — the one function the stage asks — and § D991's pacing read off
 * the legs exactly as `everyday/stagePace.sweep.test.ts` reads it (the acts, and every stretch with
 * somebody past a minute on a landing, at the watching rung; the rest at the between-peaks rung).
 * `firstDayLength.test.ts` re-runs every row on every suite run and refuses the table the day a run
 * disagrees, and asserts that the table's contracts **are** the whole-day members of the admitted
 * set, so a re-pin or a new pin cannot leave a stale row or a missing one.
 *
 * The **minutes** are composed from those seconds through `sittingShape.ts#pacedDayRealS` at the
 * stage's opening rung — § D753 rule 1, the rung read rather than transcribed — so a move of either
 * rung moves this sentence on the same commit.
 *
 * ## Three things it is careful not to say
 *
 * - **The day's length is the longest of the three runs the call can leave** — nothing pressed, the
 *   clearing press, the other one — rounded **up** (`sittingShape.ts`'s rule 2), and the sentence says
 *   *up to*. A press moves the day's end by the minutes its riders take to drain, and a figure off the
 *   unpressed run alone would be short for a player who answers.
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
  /** Simulated seconds before the call that § D991 plays at the watching rung. */
  readonly toCallSlowS: number;
  /** How many of the day's peaks (`actsOf`) there are, and how many end at or before the call. */
  readonly peaks: number;
  readonly peaksBefore: number;
  /** Whether the call falls inside a peak. */
  readonly inPeak: boolean;
  /** The longest of the three runs the call can leave, as a recording's length and its slow part. */
  readonly longest: { readonly recordedS: number; readonly slowS: number };
}

/**
 * **Measured** — every admitted whole-day pin, by `firstDayLength.test.ts`, which re-derives each row
 * from a run on every suite run. Contract order.
 */
export const PINNED_DAY_LENGTHS: readonly PinnedDayLength[] = Object.freeze([
  {
    contractId: 'c2',
    callAtS: 9613.907,
    toCallSlowS: 1873.146,
    peaks: 3,
    peaksBefore: 1,
    inPeak: false,
    longest: { recordedS: 36000, slowS: 5845.052 },
  },
  {
    contractId: 'c3',
    callAtS: 9929.738,
    toCallSlowS: 1817.138,
    peaks: 3,
    peaksBefore: 1,
    inPeak: false,
    longest: { recordedS: 36000, slowS: 5698.984 },
  },
  {
    contractId: 'c6',
    callAtS: 9809.566,
    toCallSlowS: 1807.222,
    peaks: 3,
    peaksBefore: 1,
    inPeak: false,
    longest: { recordedS: 36000, slowS: 5446.463 },
  },
  {
    contractId: 'c10',
    callAtS: 12509.792,
    toCallSlowS: 1806.234,
    peaks: 3,
    peaksBefore: 1,
    inPeak: false,
    longest: { recordedS: 36046.787, slowS: 5570.571 },
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
 */
export function pinnedDayLengthLineOf(contractId: string): string | undefined {
  const row = PINNED_DAY_LENGTHS.find((entry) => entry.contractId === contractId);
  if (row === undefined) return undefined;
  const rung = stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX);
  const dayMin = Math.ceil(
    pacedDayRealS(
      { periodS: row.longest.recordedS, recordedS: row.longest.recordedS, slowS: row.longest.slowS },
      rung.simPerRealS,
    ) / 60,
  );
  const toCallMin = Math.round(
    pacedDayRealS({ periodS: row.callAtS, recordedS: row.callAtS, slowS: row.toCallSlowS }, rung.simPerRealS) / 60,
  );
  return (
    `A whole day: up to ${String(dayMin)} min of watching at ${rung.label}, the hours between peaks at ` +
    `${betweenRungLabel()}. The stage stops once for its call ${positionOf(row)}, about ` +
    `${String(toCallMin)} min in.`
  );
}
