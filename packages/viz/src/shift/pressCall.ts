/**
 * **The instant a pinned day calls for its press** — wave AI's press-moment ruling,
 * [§ D1029](../../../../DECISIONS.md).
 *
 * ## What was wrong
 *
 * § D914 and § D974 pinned a press day's verdict flip **at one instant** — `pressAtFraction`, 0.43
 * of a whole day and 0.28 of a slice — and nothing asked what happened a minute either side. The
 * swarm that re-examined it swept the hour around every pin and found the clearing press falling
 * into three shapes: a *setting* that clears for hours (Midtown, Ashgate), a *needle* the pinned
 * second sits on alone (Secure Tower cleared at 2 of 131 sampled seconds), and a *moment* that
 * opens at an event already on the stage (St Jude, Harbour Point). A player cannot learn a needle
 * and does not need to time a setting. So the day now **calls** its press: the stage stops once, at
 * an instant it can name from what it draws, and offers the two parking presses and *leave them*.
 *
 * ## The two rules, and which one a day gets
 *
 * 1. **The first minute-long wait while the car is away** — the first instant, inside the
 *    booked-out car's absence, at which anybody standing on a landing has waited
 *    {@link PRESS_CALL_WAIT_S}. That is `stagePace.ts#PACE_HOLD_WAIT_S` and § D992's tutorial gate,
 *    read from the same band rather than restated, so the call and the stage's own *held* beat are
 *    the one threshold.
 * 2. **Act start**, used **only where rule 1 has no instant** — the later of the car leaving and the
 *    start of the act it is away during. On a slice the whole run is the act, so this is the car
 *    leaving.
 *
 * **Which rule applies is a fact about the day, never a field somebody authors.** The ruling's
 * player lens proposed letting each pin name its rule; the reconciliation bound rule 2 to the days
 * where rule 1 has nothing to say, so a pin cannot choose the rule that happens to hold on its crowd.
 * That is a stricter criterion than the proposal, and `CLAUDE.md` asks for criteria to be raised
 * rather than chosen after the measurement.
 *
 * ## Why it reads the legs, and which legs
 *
 * Rule 1 is `frame/overlay.ts#isWaitingAt`'s question asked analytically rather than by sampling:
 * a rider's wait reaches the threshold at `arrivedAt + threshold`, and they are standing at that
 * instant exactly when `isWaitingAt` says so. The earliest such instant inside the window is the
 * call. It is exact, so the stage (which asks it of the recording it plays), the sweep (which asks
 * it of the as-built run) and the tests agree to the second rather than to a frame.
 *
 * **Asked of a run with nothing pressed before the call**, which is the only run it is ever asked
 * of: a press stamped at the call second cannot move a leg before it (`sim/types.ts`'s prefix
 * rule, asserted by `pressLadder.test.ts`), so the call is the same second on the as-built run and
 * on either pressed one. That is what lets the stage latch it from the recording it opens on.
 *
 * ## What it is not
 *
 * Not a claim that the moment decides anything. It names a second from the timetable and the
 * present frame (`docs/28` AD-S4), and the claim that a press made there clears the day is
 * `ContractPressDay.call`'s, measured over a window by `pressLadder.sweep.test.ts`'s call mode and
 * held always-on by `pressLadder.test.ts`.
 */

import { isWaitingAt } from '../frame/overlay.js';
import type { VizLeg } from '../contract/types.js';
import { WAIT_BANDS } from '../live/bands.js';

import type { BookedOutCar } from './bookedOut.js';
import type { DayAct } from './dayLength.js';
import type { RunHorizon } from './types.js';

/**
 * **The wait that calls the day** — the third wait band's floor, 60 s.
 *
 * Read from `WAIT_BANDS` rather than restated, as `everyday/stagePace.ts#PACE_HOLD_WAIT_S` is. The
 * two are asserted equal by `pressCall.test.ts`, which is what keeps the call and the stage's
 * *held* beat on one threshold.
 */
const PRESS_CALL_WAIT_S: number = (() => {
  const band = WAIT_BANDS[2];
  if (band === undefined) throw new Error('pressCall: WAIT_BANDS has no third band to call on');
  return band.fromS;
})();

/**
 * **The shortest window a pin may be admitted on** — 120 simulated seconds from its call.
 *
 * [§ D1029](../../../../DECISIONS.md)'s admission criterion: from the call instant, the clearing
 * press clears and the other misses at every tried moment of a window at least this long. The
 * figure is the player lens's, and it contains the engineering lens's ±20 s (two door cycles either
 * side, § D344) with room to spare; the honesty lens asked for 120 **real** seconds at the stage's
 * default pacing, and that dissent is recorded in the entry rather than adopted. Simulated rather
 * than real because the call stops the transport: the press is stamped at the call second whatever
 * the rung, so the window protects the claim against the frame the stage stopped on and against
 * the moment's neighbours, not against how long a player has to read it.
 */
export const PRESS_CALL_MIN_WINDOW_S = 120;

/** Which of the two rules produced the instant. */
export type PressCallRule = 'first-minute-wait' | 'act-start';

export const PRESS_CALL_RULES: readonly PressCallRule[] = Object.freeze([
  'first-minute-wait',
  'act-start',
]);

/** The instant a pinned day calls for its press, and the facts the card may say about it. */
export interface PressCall {
  readonly atS: number;
  readonly rule: PressCallRule;
  /** The booked-out car the call is about — the first to leave. */
  readonly carId: string;
  readonly awayAtS: number;
  /** When the same schedule brings it back, or `null`. */
  readonly backAtS: number | null;
  /** The act the car is away during, when the day has acts and one overlaps the absence. */
  readonly act: DayAct | undefined;
}

/** Everything {@link pressCallOf} reads. Plain data from the run's own record. */
export interface PressCallInput {
  /** The run's legs — any run with nothing pressed before the call gives the same answer. */
  readonly legs: readonly VizLeg[];
  /** `shift/bookedOut.ts#bookedOutCarsOf` over the run's resolved building. */
  readonly bookedOut: readonly BookedOutCar[];
  readonly horizon: RunHorizon;
  /** `shift/dayLength.ts#actsOf(recording.demandPhases)`; read only on a whole day. */
  readonly acts: readonly DayAct[];
  readonly startedAt: number;
  readonly endedAt: number;
}

/**
 * The act a whole day's car is away during, or the whole run on a slice.
 *
 * On a slice there is no timetable of peaks to read, and the run is one stretch the stage plays at
 * the player's speed throughout (`stagePace.ts`'s `unmanaged`), so the whole run is the act.
 */
function actDuring(input: PressCallInput, awayAtS: number, backAtS: number): DayAct | undefined {
  if (input.horizon === 'period') return { startS: input.startedAt, endS: input.endedAt };
  return input.acts.find((act) => act.endS > awayAtS && act.startS < backAtS);
}

/**
 * The first instant in `[fromS, toS)` at which somebody standing on a landing has waited
 * {@link PRESS_CALL_WAIT_S}, or `undefined`. See the module docstring for why it is exact.
 */
function firstMinuteWaitIn(
  legs: readonly VizLeg[],
  fromS: number,
  toS: number,
): number | undefined {
  let best: number | undefined;
  for (const leg of legs) {
    if (leg.arrivedAt >= toS) break; // sorted by `(arrivedAt, passengerId)` — see `VizLeg`
    const atS = Math.max(leg.arrivedAt + PRESS_CALL_WAIT_S, fromS);
    if (atS >= toS) continue;
    if (best !== undefined && atS >= best) continue;
    if (isWaitingAt(leg, atS)) best = atS;
  }
  return best;
}

/**
 * **The call instant** — rule 1 where it has one, else rule 2, else `undefined`.
 *
 * `undefined` when the tower books no car out, or when neither rule finds an instant inside the
 * run: a day with nothing to call is not called, and `shift/ladder.ts#contractLadderIssues`
 * refuses a pin whose day is like that.
 */
export function pressCallOf(input: PressCallInput): PressCall | undefined {
  const car = [...input.bookedOut].sort((a, b) => a.awayAtS - b.awayAtS)[0];
  if (car === undefined) return undefined;
  const awayAtS = car.awayAtS;
  const backAtS = Math.min(car.backAtS ?? input.endedAt, input.endedAt);
  if (!(awayAtS < backAtS)) return undefined;
  const act = actDuring(input, awayAtS, backAtS);
  const base = { carId: car.carId, awayAtS, backAtS: car.backAtS, act };

  /*
   * **Rule 1 is asked across the whole absence, not only inside the act** — the ruling's words as
   * the reconciliation bound them (*the first moment, while the booked-out car is away, that anyone
   * on a landing has waited 60 s*). The player lens's own draft added *and, on a whole day, inside
   * the act it is away during*; the reconciliation's text does not carry that clause, and both were
   * measured on the shipped pins rather than argued (§ D1029's table). Across the absence the call
   * lands on the very frame the stage's pace turns `held` — the same threshold, read the same way —
   * so the stage slows for trouble and the call is that trouble, not a second rule beside it.
   */
  const waited = firstMinuteWaitIn(input.legs, awayAtS, backAtS);
  if (waited !== undefined) return Object.freeze({ ...base, atS: waited, rule: 'first-minute-wait' });

  if (act === undefined) return undefined;
  const atS = Math.max(awayAtS, act.startS);
  if (atS >= backAtS || atS >= input.endedAt) return undefined;
  return Object.freeze({ ...base, atS, rule: 'act-start' });
}
