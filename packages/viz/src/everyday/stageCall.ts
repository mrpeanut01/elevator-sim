/**
 * **The stage calls the day** — every word the pinned day's call says, and when it says it.
 * Wave AI's press-moment ruling, [§ D1029](../../../../DECISIONS.md).
 *
 * ## What the call is
 *
 * On a pinned press day, played exactly as it was measured (`shift/ladder.ts#pressDayMeasuredAs`),
 * the stage stops first at `shift/pressCall.ts#pressCallOf`'s instant, and offers three answers:
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
 * Since [§ D1206](../../../../DECISIONS.md) a fourth, on every call of either kind: **who is
 * standing** — how many, on how many floors, where the most are, and the longest wait among them,
 * read off the stage's own landing fold at the call second ({@link stageCallPresentOf}). It is the
 * frame counted rather than a figure about what follows, and the decide-an ruling refused every
 * forward figure because any honest one is one of the call's three counts, which are the answer.
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

import { COST_TERMS_BY_ID, type DispatcherProfile, type InterventionChange } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import { queueAt } from '../frame/overlay.js';
import { PARK_CARS_LOBBY_LABEL, SPREAD_CARS_LABEL, switchDispatcherLabelOf } from '../live/interventions.js';
import { clockAt } from '../live/timeline.js';
import { carsPhraseOf, type BookedOutCar } from '../shift/bookedOut.js';
import {
  DAY_CALL_DRIVER_COPY,
  DAY_CALL_FINAL_GOAL_IDS,
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
   * Wave AM, lane AM-B, § D1239, the post-AL panel's seats B and D: *held until the stage stops for
   * this day's call* stood beside the strip with the stage already stopped at a call and the card
   * up. While a card is up the presses are its answers.
   */
  heldAtCall: 'held while the call is up: its answers are on the card',
  /*
   * § D1138: the pace note while the stage waits at an ordinary candidate whose two runs have not
   * landed. It names what the stage is doing and nothing about the call, which may not be raised:
   * the same words whether the answers will turn out to matter or not.
   */
  waiting: 'stopped while the day is run ahead from here',
  /*
   * Wave AL, lane AL-A, the post-AK panel's seat B (D1): *Close the day* pressed with the card up
   * filed the scored day on the spot, unanswered, with nothing asked (on a phone it is the big
   * button). The close now asks once, in these words, and a second press or the first button files.
   */
  closeAsk: 'Close the day without answering this call?',
  closeConsequence:
    'The rest of the day plays out with nothing answered, and the report is written from that.',
  closeFile: 'Close the day as it stands',
  closeBack: 'Back to the call',
  /*
   * Wave AN, lane AN-6, [§ D1324](../../../../DECISIONS.md), the post-AM panel's seat D (D4): *Skip
   * to the end* pressed with the card up answered the call as skipped and ran the day out on the
   * first press, where *Close the day* asks. The skip now asks once, in these words; a second press
   * of it, or the first button, skips.
   */
  skipAsk: 'Skip to the end without answering this call?',
  skipConsequence:
    'The call is recorded as skipped, no more calls are asked, and the rest of the day plays out with ' +
    'nothing more pressed.',
  skipGo: 'Skip to the end',
});

/**
 * **Who is standing at the landings at the call's instant** — wave AL, lane AL-C,
 * [§ D1206](../../../../DECISIONS.md), the decide-an ruling's Q1(d) first half.
 *
 * Read off the run on the stage at the call second and nothing after it: `frame/overlay.ts#queueAt`,
 * the fold the stage's own landing glyphs draw, whose total is the header's *standing right now*. The
 * three runs a call compares are identical up to that second, so this reads the same off any of
 * them, and it carries nothing a lookahead measured.
 */
export interface StageCallPresent {
  /** Everybody standing at a landing. */
  readonly standing: number;
  /** The floors with somebody standing, in the building's order: label and head count. */
  readonly floors: readonly { readonly label: string; readonly standing: number }[];
  /** The longest anybody standing has waited, seconds; `undefined` when nobody stands. */
  readonly longestS: number | undefined;
}

/** {@link StageCallPresent} for `recording` at `atS` — the stage's own fold, at the call second. */
export function stageCallPresentOf(recording: VizRecording, atS: number): StageCallPresent {
  const queues = queueAt(recording, atS).filter((queue) => queue.total > 0);
  /* The floor's own label where it has one (*Lobby*); a bare number is said as *floor 4*. */
  const labelOf = (id: string): string => {
    const label = recording.floors.find((floor) => floor.id === id)?.label ?? id;
    return /^\d+$/u.test(label) ? `floor ${label}` : label;
  };
  return Object.freeze({
    standing: queues.reduce((sum, queue) => sum + queue.total, 0),
    floors: Object.freeze(queues.map((queue) => Object.freeze({ label: labelOf(queue.floorId), standing: queue.total }))),
    longestS: queues.length === 0 ? undefined : Math.max(...queues.map((queue) => queue.oldestWaitS)),
  });
}

/**
 * The card's present-tense line — how many stand, where the most stand, and the longest wait —
 * [§ D1206](../../../../DECISIONS.md). A count of the frame and no figure about what follows: no
 * answer's effect, no count ahead, nothing the three runs differ in (§ D1138 clause 2).
 */
function presentLineOf(present: StageCallPresent): string {
  const { standing, floors } = present;
  const waited = `${String(Math.round(present.longestS ?? 0))} s`;
  if (standing === 0 || floors.length === 0) return 'Nobody is standing at the landings.';
  if (standing === 1) return `One person is standing, at ${floors[0]!.label}, and has waited ${waited}.`;
  const longest = `The longest of them has waited ${waited}.`;
  if (floors.length === 1) return `${String(standing)} people are standing, all at ${floors[0]!.label}. ${longest}`;
  const most = Math.max(...floors.map((floor) => floor.standing));
  const fullest = floors.filter((floor) => floor.standing === most).map((floor) => floor.label);
  const where =
    fullest.length === 1
      ? `the most at ${fullest[0]!} (${String(most)})`
      : `${String(most)} each at ${listOfLabels(fullest)}`;
  return `${String(standing)} people are standing on ${String(floors.length)} floors, ${where}. ${longest}`;
}

/** `a`, `a and b`, `a, b and c`. */
function listOfLabels(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${String(parts[parts.length - 1])}`;
}

/**
 * One of the card's three answers. `change` is `undefined` for *leave them* and for every driver
 * answer, whose handover the session already made; `answer` is what an ordinary call's session is
 * told ([§ D1167](../../../../DECISIONS.md)).
 */
export interface StageCallOption {
  readonly label: string;
  readonly change: InterventionChange | undefined;
  readonly answer: DayCallAnswer;
  /**
   * **What the answer is, in one line** — wave AO, lane DR-1, [§ D1432](../../../../DECISIONS.md):
   * for a driver, what its profile weighs ({@link stageCallDriverLineOf}); for a car order, what the
   * order sets ({@link STAGE_CALL_ANSWER_LINES}). Never what it does to this crowd. Absent where the
   * card was drawn without the driver's profile.
   */
  readonly line?: string | undefined;
}

/**
 * **What each car order is, in the order's own words** — wave AO, lane DR-1,
 * [§ D1432](../../../../DECISIONS.md). The two presses write one setting, where an idle car waits
 * (`core`'s `idle.parkingStrategy`: the lobby for *park*, spread across the tower for *spread*,
 * `sim/simulation.ts`'s mapping), and *leave them* writes nothing. Each line says that and no more:
 * no effect on the crowd, no *will*, nothing the three runs differ in.
 */
export const STAGE_CALL_ANSWER_LINES: Readonly<Record<'park-cars-lobby' | 'spread-cars' | 'leave', string>> = Object.freeze({
  'park-cars-lobby': `${PARK_CARS_LOBBY_LABEL}: from the call, each car that falls idle heads for the lobby and waits there.`,
  'spread-cars':
    `${SPREAD_CARS_LABEL}: from the call, idle cars wait spread across the tower, and which car takes ` +
    'which call stays the driver’s own choice.',
  leave: `${DAY_CALL_LEAVE_LABEL}: nothing is pressed, and the cars go on as the driver runs them.`,
});

/** How many of a profile's terms a driver's line names by name before it counts the rest. */
const DRIVER_LINE_TERMS = 3;

/**
 * **What a driver weighs, from its own profile** — wave AO, lane DR-1,
 * [§ D1432](../../../../DECISIONS.md), swarm DR's ruling § Q1 item 1 (S3's *what it weighs*). The
 * terms its weights carry, heaviest first, each by `core`'s player name for it (`PlayerTermWords`),
 * so the line is derived from the data and cannot drift from the vector the handover hands the day
 * to: *Fairness first weighs wait time and starvation.* A profile of more than three terms names
 * its three heaviest and counts the rest. It describes the control and claims nothing about any
 * crowd; the profile's authored blurb is not used, because some blurbs state an effect.
 */
export function stageCallDriverLineOf(profile: Pick<DispatcherProfile, 'name' | 'weights'>): string {
  const terms = Object.entries(profile.weights)
    .filter(([, weight]) => weight > 0)
    .map(([id, weight], index) => ({ name: COST_TERMS_BY_ID.get(id)?.player.name ?? id, weight, index }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((term) => term.name);
  if (terms.length === 0) return `${profile.name} weighs nothing it can name.`;
  if (terms.length === 1) return `${profile.name} weighs only ${terms[0]!}.`;
  if (terms.length <= DRIVER_LINE_TERMS) return `${profile.name} weighs ${listOfLabels(terms)}.`;
  return `${profile.name} weighs ${String(terms.length)} things, most of all ${listOfLabels(terms.slice(0, DRIVER_LINE_TERMS))}.`;
}

/**
 * **The goal graded on a maximum that stands nearest its bar, at the call second** — wave AO, lane
 * DR-1, [§ D1432](../../../../DECISIONS.md), swarm DR's ruling § Q1 item 1. Of the deepest landing
 * and the longest wait, the one whose reading is the larger share of its bar, with the reading and
 * the bar: *Nearest its bar: the longest wait so far is 252 s, against a bar of 380 s.* `readings`
 * are the rail's at the call second (`host.goalsAt`), identical off all three runs, and a maximum so
 * far is a floor under the day's figure, so the line is true of the instant and claims nothing after
 * it. The share goals move both ways and are not named.
 *
 * **A goal already past its bar ranks first** — wave AP, lane DT-2, swarm DT's Q3 item 7, seat A's
 * W1 Thursday at 12:36: the card said *the longest of them has waited 473 s* and named the landing,
 * at 19 of 26, as nearest its bar against a worst-wait bar of 400 s. The pick read only goals the
 * rail reads met, so it skipped both a reading the rail reads past its bar and a longest wait the
 * rail reads as pending because it is a rider still standing. Both are now named first, as *Past its
 * bar*: a reading past it in its own words, and a standing rider (`longestStandingS`, the card's own
 * present-tense fold) whose wait so far already exceeds the bar as *a rider still standing at 473 s*.
 * That is the present: the rider has waited that long. It says nothing about when the rider boards,
 * or whether the day can still clear, which is the lost card's to say from the rail's own reading
 * (§ D1435). A pending wait under its bar, or one pending because too few have arrived, is still not
 * named; with nothing readable, nothing is said.
 */
export function stageCallNearestBarLineOf(
  readings: readonly GoalReading[],
  longestStandingS?: number,
): string | undefined {
  const awake = readings.some((reading) => DAY_CALL_FINAL_GOAL_IDS.includes(reading.goal.id) && reading.state !== 'pending');
  const candidates = readings.flatMap((reading) => {
    if (!DAY_CALL_FINAL_GOAL_IDS.includes(reading.goal.id) || reading.goal.bar <= 0) return [];
    const unit = reading.goal.unit;
    const bar = `against a bar of ${String(reading.goal.bar)}${unit}`;
    const what = reading.goal.id === 'queue' ? 'the deepest landing so far is' : 'the longest wait so far is';
    if ((reading.state === 'met' || reading.state === 'missed') && reading.observed !== null) {
      const past = reading.state === 'missed';
      return [{
        past,
        share: reading.observed / reading.goal.bar,
        line: `${past ? 'Past' : 'Nearest'} its bar: ${what} ${String(reading.observed)}${unit}, ${bar}.`,
      }];
    }
    /* A longest wait the rail reads as pending because a rider still standing holds it. */
    const standing = longestStandingS === undefined ? undefined : Math.round(longestStandingS);
    if (reading.goal.id === 'worst-wait' && reading.state === 'pending' && awake && standing !== undefined && standing > reading.goal.bar) {
      return [{
        past: true,
        share: standing / reading.goal.bar,
        line: `Past its bar: ${what} a rider still standing at ${String(standing)}${unit}, ${bar}.`,
      }];
    }
    return [];
  });
  let nearest: (typeof candidates)[number] | undefined;
  for (const candidate of candidates) {
    if (
      nearest === undefined ||
      (candidate.past && !nearest.past) ||
      (candidate.past === nearest.past && candidate.share > nearest.share)
    ) {
      nearest = candidate;
    }
  }
  return nearest?.line;
}

/**
 * What the card needs to teach as well as ask — § D1432. `readings` are the rail's at the call
 * second; `driverOf` finds a driver's profile by the name the card offers it under.
 */
export interface StageCallTeaching {
  readonly readings?: readonly GoalReading[] | undefined;
  readonly driverOf?: ((name: string) => Pick<DispatcherProfile, 'name' | 'weights'> | undefined) | undefined;
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
  /**
   * Who stands at the landings at the call second ({@link stageCallPresentOf}) — the card's last
   * fact, on either question ([§ D1206](../../../../DECISIONS.md)). Absent, the card draws the
   * ruling's three facts only.
   */
  present?: StageCallPresent | undefined,
  /**
   * The goal nearest its bar and each answer's line ([§ D1432](../../../../DECISIONS.md)). Absent,
   * the card draws neither, which is how every caller before it drew the card.
   */
  teaching?: StageCallTeaching | undefined,
  /**
   * The car order already in force at the call, from an earlier answer ({@link stageCallStandingOrderOf}).
   * A placement call that asks again says so and names it — [§ D1528](../../../../DECISIONS.md).
   */
  standingOrder?: StageCallStandingOrder | undefined,
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
  /*
   * § D1265: a call drawn inside the day's wrinkle says so, from the schedule the run was built on:
   * the wrinkle's name and when it began. At its start that is the call's only fact besides the car
   * line; inside it, beside the minute line.
   */
  if (call.wrinkle !== undefined) facts.push(stageCallWrinkleLineOf(call.wrinkle, dayStartS));
  if (present !== undefined) facts.push(presentLineOf(present));
  /* § D1432: the goal nearest its bar, read at the call second, last; one already past it first (DT-2). */
  const nearest =
    teaching?.readings === undefined ? undefined : stageCallNearestBarLineOf(teaching.readings, present?.longestS);
  if (nearest !== undefined) facts.push(nearest);
  const teach = teaching !== undefined;
  if (drivers !== undefined) {
    const lineOf = (name: string): { readonly line?: string } => {
      const profile = teaching?.driverOf?.(name);
      return profile === undefined ? {} : { line: stageCallDriverLineOf(profile) };
    };
    return Object.freeze({
      heading: STAGE_CALL_COPY.heading,
      facts: Object.freeze(facts),
      question: DAY_CALL_DRIVER_COPY.question,
      options: Object.freeze([
        Object.freeze({ label: switchDispatcherLabelOf(drivers['driver-a']), change: undefined, answer: 'driver-a' as const, ...lineOf(drivers['driver-a']) }),
        Object.freeze({ label: switchDispatcherLabelOf(drivers['driver-b']), change: undefined, answer: 'driver-b' as const, ...lineOf(drivers['driver-b']) }),
        Object.freeze({ label: DAY_CALL_DRIVER_COPY.keep(drivers.leave), change: undefined, answer: 'leave' as const, ...lineOf(drivers.leave) }),
      ]),
    });
  }
  return Object.freeze({
    heading: STAGE_CALL_COPY.heading,
    facts: Object.freeze(facts),
    question:
      standingOrder !== undefined
        ? stageCallAskedAgainOf(standingOrder, dayStartS)
        : away.length > 0
          ? STAGE_CALL_COPY.question
          : STAGE_CALL_COPY.questionAllCars,
    options: Object.freeze([
      Object.freeze({
        label: PARK_CARS_LOBBY_LABEL,
        change: Object.freeze({ kind: 'park-cars-lobby' as const }),
        answer: 'park-cars-lobby' as const,
        ...(teach ? { line: STAGE_CALL_ANSWER_LINES['park-cars-lobby'] } : {}),
      }),
      Object.freeze({
        label: SPREAD_CARS_LABEL,
        change: Object.freeze({ kind: 'spread-cars' as const }),
        answer: 'spread-cars' as const,
        ...(teach ? { line: STAGE_CALL_ANSWER_LINES['spread-cars'] } : {}),
      }),
      Object.freeze({
        label: STAGE_CALL_COPY.leave,
        change: undefined,
        answer: 'leave' as const,
        ...(teach ? { line: STAGE_CALL_ANSWER_LINES.leave } : {}),
      }),
    ]),
  });
}

/** A car order an earlier answer pressed, still in force at a later call. */
export interface StageCallStandingOrder {
  readonly kind: 'park-cars-lobby' | 'spread-cars';
  /**
   * The second the order began: the first press of it since the other order was last pressed —
   * [§ D1556](../../../../DECISIONS.md), wave AS, lane AS-2, GitHub issue #637 item 2. The 17:20 card read
   * *Since 12:20* when the 12:20 answer had only kept an order standing since 10:40.
   */
  readonly atS: number;
}

/**
 * **The car order in force at a call**, or `undefined` where nothing was pressed before it —
 * wave AR, lane AR-2, [§ D1528](../../../../DECISIONS.md). The last park or spread press filed before
 * the call second, dated from when that order began ([§ D1556](../../../../DECISIONS.md)). Each writes one setting that stands until the other is pressed (`core`'s
 * `idle.parkingStrategy`), and *leave them* presses nothing, so the latest press is the order the
 * cars are under at the call.
 */
export function stageCallStandingOrderOf(
  interventions: readonly { readonly atS: number; readonly change: { readonly kind: string } }[],
  callAtS: number,
): StageCallStandingOrder | undefined {
  const presses = interventions
    .filter((entry) => (entry.change.kind === 'park-cars-lobby' || entry.change.kind === 'spread-cars') && entry.atS < callAtS)
    .map((entry) => ({ kind: entry.change.kind as StageCallStandingOrder['kind'], atS: entry.atS }))
    .sort((a, b) => a.atS - b.atS);
  let found: StageCallStandingOrder | undefined;
  /* § D1556: a press of the order already in force keeps it, so the order began at the first of the run. */
  for (const press of presses) {
    if (found === undefined || press.kind !== found.kind) found = press;
  }
  return found === undefined ? undefined : Object.freeze(found);
}

/**
 * **The placement question, asked again** — [§ D1528](../../../../DECISIONS.md). The 12:20 and 17:20
 * calls asked *What do the cars do?* after the player had parked them at 10:40, as if nothing had been
 * answered. The card now names the order in force, from the clock it was pressed at, and asks whether
 * to keep it. It states the order rather than crediting the press (*You parked the cars*), which
 * `honesty/properties.ts#SECOND_PERSON_ACT` refuses without a declared attribution.
 */
export function stageCallAskedAgainOf(order: StageCallStandingOrder, dayStartS: number | undefined): string {
  const since = clockAt(order.atS, dayStartS);
  return order.kind === 'park-cars-lobby'
    ? `Since ${since}, idle cars wait at the lobby. Keep that, or change it?`
    : `Since ${since}, idle cars wait spread across the tower. Keep that, or change it?`;
}

/**
 * **The card's line for a call drawn inside the day's wrinkle** — wave AM, lane AM-F,
 * [§ D1265](../../../../DECISIONS.md). The wrinkle's own name and the clock it began at, both from
 * the schedule the run was built on: *Move-in day: under way since 13:30.* Nothing about what the
 * wrinkle will do next.
 */
export function stageCallWrinkleLineOf(
  wrinkle: { readonly name: string; readonly startS: number },
  dayStartS: number | undefined,
): string {
  return `${wrinkle.name}: under way since ${clockAt(wrinkle.startS, dayStartS)}.`;
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

/**
 * **The lost day's card** — wave AO, lane DR-1, [§ D1435](../../../../DECISIONS.md), swarm DR's
 * ruling § Q4 (three of three). Once a goal graded on a maximum reads past its bar at the playhead
 * (§ D1168's reading, {@link stageEndDayOf}'s), the day can no longer clear. The stage stops there
 * once, on this card in the call card's place: *End the day* is its primary and takes focus, and
 * *Watch the rest* plays on at the fast rung under `stagePace.ts`'s `lost` line. The stage never
 * ends the day itself (§ D525 clause 4).
 */
export const STAGE_LOST_COPY = Object.freeze({
  heading: 'THE DAY CAN NO LONGER CLEAR',
  end: 'End the day',
  watch: 'Watch the rest',
  choices:
    'End the day files it as it runs from here, with nothing more pressed, and every figure on the sheet ' +
    'is the whole day’s. Watch the rest plays it on at 30×.',
});

/** The card's words for the readings at the playhead, or `undefined` while the day can still clear. */
export function stageLostCardOf(
  readings: readonly GoalReading[],
  clock: string,
): { readonly heading: string; readonly fact: string; readonly choices: string } | undefined {
  const lost = dayCallLostGoalOf(readings);
  if (lost === undefined || lost.observed === null) return undefined;
  const unit = lost.goal.unit;
  const what = lost.goal.id === 'queue' ? 'The deepest landing' : 'The longest wait';
  return Object.freeze({
    heading: STAGE_LOST_COPY.heading,
    fact:
      `${what} reached ${String(lost.observed)}${unit} by ${clock}, past its bar of ${String(lost.goal.bar)}${unit}. ` +
      'A maximum past its bar stays past it, and the stage asks nothing more today.',
    choices: STAGE_LOST_COPY.choices,
  });
}
