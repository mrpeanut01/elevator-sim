/**
 * **The stage calls the day** — every word the pinned day's call says, and when it says it.
 * Wave AI's press-moment ruling, [§ D1029](../../../../DECISIONS.md).
 *
 * ## What the call is
 *
 * On a pinned press day, played exactly as it was measured (`shift/ladder.ts#pressDayMeasuredAs`),
 * the stage stops once, at `shift/pressCall.ts#pressCallOf`'s instant, and offers three answers:
 * the two parking presses and *leave them*. Before the call both parking presses and the mid-day
 * handover are drawn disabled with {@link STAGE_CALL_COPY}'s `held` reason; the answer is stamped at
 * the call second, whatever frame the stage stopped on. `everyday/stageScreen.ts` mounts it and
 * `everyday/stagePace.ts`'s `'call'` reason stops the transport.
 *
 * ## What the card may say, and the four things it may not
 *
 * Only what is on the screen at that instant, in the ruling's own three facts: **the car is out**,
 * **a landing has waited a minute** (the first rule's trigger) and **the peak has opened** (the
 * second's). Each is a fact the stage already draws — the booked-out pill, the wait bands, the pace
 * note's act — so the card names nothing a player could not have read off the frame.
 *
 * Refused, by the reconciliation and pinned by `stageCall.test.ts` on every arm:
 *
 * 1. **No countdown** — no *seconds left*, no *until*, nothing that runs out.
 * 2. **No *now*** — the card is drawn at the instant; saying so adds urgency and no fact.
 * 3. **No word that the moment is decisive** — *decides*, *crucial*, *key*, *last chance*. The call
 *    is an instant the stage can name from what it draws, and the claim that a press made there
 *    clears the day is the report's to show, after the day, from the pinned data.
 * 4. **No hint which press** — the options are drawn in the stage's own fixed order
 *    (`STAGE_INTERVENTIONS`), and nothing on the card describes either one's effect.
 *
 * ## What the hold says before the call
 *
 * *Held until the stage stops for this day's call.* It names the event and not its time: under the
 * first rule the instant is when somebody **will** have waited a minute, which is the run's future
 * and R6's to refuse on a surface drawn before it (`docs/28` AD-S4). The honesty corpus seeds it on
 * the temporal axis for that reason.
 */

import type { InterventionChange } from '@elevator-sim/core/browser';

import { PARK_CARS_LOBBY_LABEL, SPREAD_CARS_LABEL } from '../live/interventions.js';
import { clockAt } from '../live/timeline.js';
import type { PressCall } from '../shift/pressCall.js';

/** Every sentence the call draws. */
export const STAGE_CALL_COPY = Object.freeze({
  heading: 'THE DAY’S CALL',
  question: 'What do the cars that are left do?',
  minute: 'Somebody on a landing has waited a minute.',
  leave: 'Leave them',
  held: 'held until the stage stops for this day’s call',
});

/** One of the card's three answers. `change` is `undefined` for *leave them*. */
export interface StageCallOption {
  readonly label: string;
  readonly change: InterventionChange | undefined;
}

export interface StageCallCard {
  readonly heading: string;
  /** What is on the stage at the call, one fact a line, in the ruling's order. */
  readonly facts: readonly string[];
  readonly question: string;
  /** Park, spread, leave — the stage's own fixed order, never keyed on the pin. */
  readonly options: readonly StageCallOption[];
}

/**
 * The card, for a call and the day's clock.
 *
 * `dayStartS` is the host's, so the clocks here are the stage's own. The car's line says when it is
 * back because the stage's booked-out pill already says so from the moment it leaves (§ D983): the
 * card repeats a fact on the screen rather than adding one.
 */
export function stageCallCardOf(call: PressCall, dayStartS?: number | undefined): StageCallCard {
  const facts: string[] = [
    call.backAtS === null
      ? `Car ${call.carId} is out of passenger service for the rest of the day.`
      : `Car ${call.carId} is out of passenger service until ${clockAt(call.backAtS, dayStartS)}.`,
  ];
  if (call.rule === 'first-minute-wait') facts.push(STAGE_CALL_COPY.minute);
  /*
   * The second rule's own fact, and only where there is a peak to name: on a slice the act is the
   * whole run, and its start is the car leaving, which the line above already says.
   */
  if (call.rule === 'act-start' && call.act !== undefined && call.act.startS > call.awayAtS) {
    facts.push(`The peak opened at ${clockAt(call.act.startS, dayStartS)}.`);
  }
  return Object.freeze({
    heading: STAGE_CALL_COPY.heading,
    facts: Object.freeze(facts),
    question: STAGE_CALL_COPY.question,
    options: Object.freeze([
      Object.freeze({ label: PARK_CARS_LOBBY_LABEL, change: Object.freeze({ kind: 'park-cars-lobby' as const }) }),
      Object.freeze({ label: SPREAD_CARS_LABEL, change: Object.freeze({ kind: 'spread-cars' as const }) }),
      Object.freeze({ label: STAGE_CALL_COPY.leave, change: undefined }),
    ]),
  });
}

/** Where a pinned day's call stands on this attempt. */
export type StageCallPhase = 'coming' | 'called' | 'answered';

/**
 * The phase at a playhead — `coming` before the call, `called` from it until answered.
 *
 * `answered` covers every way a call stops standing: a press at the call, *leave them*, and the
 * player's own *skip to the end*, which is their answer as surely as a button is.
 */
export function stageCallPhaseOf(call: PressCall, simTimeS: number, answered: boolean): StageCallPhase {
  if (answered) return 'answered';
  return simTimeS >= call.atS ? 'called' : 'coming';
}
