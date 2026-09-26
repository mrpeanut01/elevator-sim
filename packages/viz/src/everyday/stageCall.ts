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

import { PARK_CARS_LOBBY_LABEL, SPREAD_CARS_LABEL, switchDispatcherLabelOf } from '../live/interventions.js';
import { clockAt } from '../live/timeline.js';
import { carsPhraseOf, type BookedOutCar } from '../shift/bookedOut.js';
import {
  DAY_CALL_DRIVER_COPY,
  DAY_CALL_LEAVE_LABEL,
  dayCallLostGoalOf,
  type DayCallAnswer,
  type DayCallDriverNames,
} from '../shift/dayCalls.js';
import { goalPlainNameOf } from '../shift/goals.js';
import type { PressCall } from '../shift/pressCall.js';
import type { GoalReading } from '../shift/types.js';

/** Every sentence the call draws. */
export const STAGE_CALL_COPY = Object.freeze({
  heading: 'THE DAY’S CALL',
  question: 'What do the cars that are left do?',
  /*
   * § D1150, the post-AJ panel's seats A (D4) and D (H6): the question above was asked at 08:36 on
   * Midtown's Monday with car D out only from 10:30, and on St Jude's Tuesday after every car was
   * back. *The cars that are left* is a fact about a car being away, so it is asked only where the
   * card names one; with none out the question is about the cars, all of them.
   */
  questionAllCars: 'What do the cars do?',
  minute: 'Somebody on a landing has waited a minute.',
  /* One label for both kinds of call and the ordinary call's report row — `shift/dayCalls.ts`. */
  leave: DAY_CALL_LEAVE_LABEL,
  held: 'held until the stage stops for this day’s call',
  /*
   * § D1138: the pace note while the stage waits at an ordinary candidate whose two runs have not
   * landed. It names what the stage is doing and nothing about the call, which may not be raised:
   * the same words whether the answers will turn out to matter or not.
   */
  waiting: 'stopped while the day is run ahead from here',
});

/**
 * One of the card's three answers. `change` is `undefined` for *leave them* and for every driver
 * answer, whose handover the session already made; `answer` is what an ordinary call's session is
 * told ([§ D1167](../../../../DECISIONS.md)).
 */
export interface StageCallOption {
  readonly label: string;
  readonly change: InterventionChange | undefined;
  readonly answer: DayCallAnswer;
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
 * The card, for a call, the day's clock and the run's booked-out cars.
 *
 * `dayStartS` is the host's, so the clocks here are the stage's own. The car's line says when it is
 * back because the stage's booked-out pill already says so from the moment it leaves (§ D983): the
 * card repeats a fact on the screen rather than adding one.
 *
 * **Every car that is out at the call is named**, not only the call's own — the post-AI panel's seat
 * B, defect 5: on St Jude's pinned day cars D and E are both booked out 08:37–08:46, the pill above
 * the stage says so, and the card said only *Car D is out*. `bookedOut` is
 * `shift/bookedOut.ts#bookedOutCarsOf` over the run's own building, the same reading the pill draws;
 * cars that come back at the same clock share one line.
 */
export function stageCallCardOf(
  call: PressCall,
  dayStartS: number | undefined,
  bookedOut: readonly BookedOutCar[],
  /**
   * The driver question's names, when the call asks who drives — [§ D1167](../../../../DECISIONS.md).
   * The heading and the facts are the placement card's, so the card says the same whether the call
   * turns out to matter or not; only the question and its three answers differ, in a fixed order.
   */
  drivers?: DayCallDriverNames | undefined,
): StageCallCard {
  /*
   * The car lines only where a car is out at the call. A pinned call is always inside its car's
   * absence; an ordinary day's call ([§ D1138](../../../../DECISIONS.md)) is not gated on one, and
   * says so only where one is — the same fact, never an invented one. Where one is, every car out
   * at that instant is named ([§ D1107](../../../../DECISIONS.md)), not only the call's own.
   */
  const away = call.carAway === false ? [] : awayLinesOf(call, bookedOut, dayStartS);
  const facts: string[] = [...away];
  if (call.rule === 'first-minute-wait') facts.push(STAGE_CALL_COPY.minute);
  /*
   * The second rule's own fact, and only where there is a peak to name: on a slice the act is the
   * whole run, and its start is the car leaving, which the line above already says. On an ordinary
   * day with no car out, the peak's start is the call, and the line is the call's only fact.
   */
  if (
    call.rule === 'act-start' &&
    call.act !== undefined &&
    (call.carAway === false || call.act.startS > call.awayAtS)
  ) {
    facts.push(`The peak opened at ${clockAt(call.act.startS, dayStartS)}.`);
  }
  if (drivers !== undefined) {
    return Object.freeze({
      heading: STAGE_CALL_COPY.heading,
      facts: Object.freeze(facts),
      question: DAY_CALL_DRIVER_COPY.question,
      options: Object.freeze([
        Object.freeze({ label: switchDispatcherLabelOf(drivers['driver-a']), change: undefined, answer: 'driver-a' as const }),
        Object.freeze({ label: switchDispatcherLabelOf(drivers['driver-b']), change: undefined, answer: 'driver-b' as const }),
        Object.freeze({ label: DAY_CALL_DRIVER_COPY.keep(drivers.leave), change: undefined, answer: 'leave' as const }),
      ]),
    });
  }
  return Object.freeze({
    heading: STAGE_CALL_COPY.heading,
    facts: Object.freeze(facts),
    question: away.length > 0 ? STAGE_CALL_COPY.question : STAGE_CALL_COPY.questionAllCars,
    options: Object.freeze([
      Object.freeze({
        label: PARK_CARS_LOBBY_LABEL,
        change: Object.freeze({ kind: 'park-cars-lobby' as const }),
        answer: 'park-cars-lobby' as const,
      }),
      Object.freeze({
        label: SPREAD_CARS_LABEL,
        change: Object.freeze({ kind: 'spread-cars' as const }),
        answer: 'spread-cars' as const,
      }),
      Object.freeze({ label: STAGE_CALL_COPY.leave, change: undefined, answer: 'leave' as const }),
    ]),
  });
}

/** One line per return time, naming every booked-out car that is away at the call. */
function awayLinesOf(
  call: PressCall,
  bookedOut: readonly BookedOutCar[],
  dayStartS: number | undefined,
): readonly string[] {
  const away = bookedOut.filter(
    (car) => car.awayAtS <= call.atS && (car.backAtS === null || car.backAtS > call.atS),
  );
  const cars: readonly BookedOutCar[] = away.some((car) => car.carId === call.carId)
    ? away
    : [{ carId: call.carId, awayAtS: call.awayAtS, backAtS: call.backAtS }, ...away];
  const byReturn = new Map<number | null, BookedOutCar[]>();
  for (const car of [...cars].sort((a, b) => a.carId.localeCompare(b.carId))) {
    const group = byReturn.get(car.backAtS) ?? [];
    group.push(car);
    byReturn.set(car.backAtS, group);
  }
  return [...byReturn.entries()].map(([backAtS, group]) => {
    const phrase = carsPhraseOf(group);
    const subject = `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} ${group.length === 1 ? 'is' : 'are'}`;
    return backAtS === null
      ? `${subject} out of passenger service for the rest of the day.`
      : `${subject} out of passenger service until ${clockAt(backAtS, dayStartS)}.`;
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

/**
 * **End the day** — [§ D1168](../../../../DECISIONS.md), the decide-al ruling's Q1 clause 4.
 *
 * Offered on a scored day once the queue goal or the worst-wait goal already reads missed at the
 * playhead ({@link stageEndDayOf}). Both grade a maximum, so the day cannot clear from there, and the
 * stage raises no more calls; the button lets the player stop watching. Pressed, it files the day on
 * the run already recorded, as *Skip to the end* would at the end, and the report carries a row that
 * says when. The note names the goal and no figure: the strip beside it already draws the figure
 * against its bar.
 */
export const STAGE_END_DAY_COPY = Object.freeze({
  label: 'End the day',
  note: (goal: string): string =>
    `${goal.charAt(0).toUpperCase()}${goal.slice(1)} is already past its bar, and it cannot come back ` +
    'under it today. Ending now files the whole day as it runs from here, with nothing more pressed.',
});

/** The *End the day* control's words, or `undefined` while the day can still clear. */
export function stageEndDayOf(
  readings: readonly GoalReading[],
): { readonly label: string; readonly note: string } | undefined {
  const lost = dayCallLostGoalOf(readings);
  return lost === undefined
    ? undefined
    : Object.freeze({ label: STAGE_END_DAY_COPY.label, note: STAGE_END_DAY_COPY.note(goalPlainNameOf(lost.goal)) });
}
