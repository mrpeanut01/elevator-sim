/**
 * **The calls of an ordinary scored day** — wave AJ's call-as-the-core-loop ruling,
 * [§ D1138](../../../../DECISIONS.md), which amends [§ D1029](../../../../DECISIONS.md).
 *
 * ## What was wrong
 *
 * § D1029 made the pinned press day's press a **call**: the stage stops once, at an instant it can
 * name, and asks what the cars that are left do. The post-AI panel called it the one real moment in
 * the game, and it happened on one day per tower. Seat A counted about 0.4 decisions a real minute
 * over a session, and a gap of six and a half minutes after the call on the day a newcomer meets
 * first; seat B's Tuesday was one dropdown and four minutes of watching. Every seat asked for the
 * call on every scored day.
 *
 * § D1029's admission could not be carried there. It needs a pinned crowd and a dense window
 * search from the call, and the swarm measured why that is not available on an ordinary crowd: the
 * day's verdict differs between the three answers at **5 of 125** candidate calls (S1, 4 %) and **14
 * of 131** (S3, 11 %), and on under one call in a hundred the difference holds for a minute. A call
 * that had to flip the day would almost never be raised.
 *
 * ## What an ordinary call is instead
 *
 * **A call is raised when its answers change what happens next, on this crowd** — *move the control
 * and require the run to change*, applied to the call itself. From the candidate instant the day is
 * run three ways, holding every press before it: *park the cars in the lobby*, *spread the cars
 * across the tower*, and *leave them*, which is the run already on the stage. The call stands when
 * the count of riders who arrived in the next {@link DAY_CALL_WINDOW_S} and waited a minute or more
 * differs between the three by at least {@link dayCallAdmits}'s threshold. That needs **no run
 * beyond the two the report prints anyway** (S3), because the three runs that admit a call are the
 * three its row reports.
 *
 * ## Where the candidates come from
 *
 * § D1029's rule 1 and rule 2, repeated across the day (S2): **the first instant somebody standing
 * on a landing has waited a minute** — `pressCall.ts#firstMinuteWaitIn`, the same exact reading of
 * the same threshold — and, on a whole day, **the start of a peak** where that peak has no such
 * instant. One stretch per peak on a whole day (S1's *one per peak act*); on a slice, stretches
 * {@link DAY_CALL_SPACING_S} apart. A candidate whose answers change nothing is skipped, and the next
 * one in the same stretch is asked, up to {@link DAY_CALL_MAX_TRIES} in a day.
 *
 * **§ D1029's *while the booked-out car is away* is not carried here**, and that is measured rather
 * than chosen: nine of sixteen contracts book no car out (S3, M4), so the clause would leave most
 * towers with no call at all, and both members that swept ordinary calls (S1, S3) dropped it. Where
 * a car is out at the instant, the card says so, which is the clause's fact kept as a fact rather
 * than as a gate.
 *
 * ## What it is not
 *
 * Not a claim that the call decides the day. Most admitted calls leave the day's verdict where it
 * was; the card is identical either way (§ D1138 clause 2), and the report says the verdict only
 * where the three runs split. Not a quota either: a quiet day has no call, and saying *two or three
 * decisive calls a day* is refused on the measurement above.
 */

import type { RunInterventionConfig, SimTime } from '@elevator-sim/core/browser';

import type { VizLeg } from '../contract/types.js';
import { isWaitingAt } from '../frame/overlay.js';
import { PARK_CARS_LOBBY_LABEL, SPREAD_CARS_LABEL, stampVerbOf } from '../live/interventions.js';
import { WAIT_BANDS } from '../live/bands.js';

import type { BookedOutCar } from './bookedOut.js';
import type { DayAct } from './dayLength.js';
import { firstMinuteWaitIn, type PressCall, type PressCallRule } from './pressCall.js';
import type { Observations, ReportDiagnosis, RunHorizon } from './types.js';

/**
 * **At most three calls a day** — the cap all three members named (§ D1138 clause 1), and a cap
 * rather than a quota: a day raises what its events produce, from none to three.
 *
 * S1's sweep, 48 days × up to three candidates under this module's admission: 9 days raised none,
 * 11 one, 18 two, 10 three. Owner-reversible: it is this one constant.
 */
export const DAY_CALL_MAX = 3;

/**
 * **The stretch a call's answers are counted over — ten simulated minutes from the call.**
 *
 * S1's window, and the one the reconciliation named (*riders waiting ≥ 60 s over the next ten
 * minutes*). Long enough that a parking press has time to be felt at the landings; short enough that
 * the count is about what followed the call rather than about the rest of the day. Clipped at the
 * run's end. Owner-reversible.
 */
export const DAY_CALL_WINDOW_S = 600;

/**
 * **The wait the count is of** — the third band's floor, 60 s, read from `WAIT_BANDS` as
 * `pressCall.ts` and `stagePace.ts` read it, so the card's *waited a minute*, the stage's *held*
 * beat and the row's count are one threshold.
 */
export const DAY_CALL_LONG_WAIT_S: number = (() => {
  const band = WAIT_BANDS[2];
  if (band === undefined) throw new Error('dayCalls: WAIT_BANDS has no third band to count on');
  return band.fromS;
})();

/**
 * **The spacing between two calls on a slice**, and between a refused candidate and the next one
 * tried in the same stretch — five simulated minutes, S1's.
 *
 * On a whole day the stretches are the peaks and an admitted call moves the search to the next peak
 * (S1's *one per peak act*); this spacing then only separates a refused candidate from the next.
 * S3 measured 240 s and found the same call rate; 300 s is taken because it keeps a slice's three
 * calls inside a thirty-minute day with five minutes after the last. Owner-reversible.
 */
export const DAY_CALL_SPACING_S = 300;

/**
 * **The smallest difference in the ten-minute count that raises a call** — at least three riders,
 * and at least a tenth of the largest of the three counts.
 *
 * Derived from the two members' data rather than chosen:
 *
 * | rule over the three counts' spread | S1: candidate calls admitted | S1: days with a call |
 * |---|---|---|
 * | ≥ 1 rider | 103 / 125 | 42 / 48 |
 * | ≥ 3 riders (S3's rule) | 91 / 125 | 42 / 48 |
 * | **≥ max(3, 10 % of the largest)** (S1's rule) | **77 / 125 (62 %)** | **39 / 48 (81 %)** |
 * | ≥ 5 riders | 76 / 125 | 37 / 48 |
 * | ≥ max(3, 20 % of the largest) | 47 / 125 | 28 / 48 |
 *
 * Re-derived from S1's two sweep tables (the swarm's scratch data, not in this repository). S3's
 * own slice sweep found a spread of three or more riders at 103 of 131 calls on 42 of 50 days.
 * `everyday/dayCalls.sweep.test.ts` re-measures the rule's yield on this product's own candidates
 * ([§ D1138](../../../../DECISIONS.md)'s table). The floor of three is both members'; the
 * tenth is S1's and is what keeps a whole day's busiest peak, where every count is in the sixties,
 * from calling on a difference of three people out of sixty-seven. Past that the rule is flat — five
 * riders admits 76 — so the choice is not sitting on a cliff. Owner-reversible.
 */
export const DAY_CALL_MIN_SPREAD = 3;
/** The share of the largest count the spread must also reach. See {@link DAY_CALL_MIN_SPREAD}. */
export const DAY_CALL_SPREAD_SHARE = 0.1;

/**
 * **How many candidates a day may ask before it stops** — each asked candidate costs two runs, and
 * a refused one is two runs nobody sees. Twice the cap, so a day that refuses one candidate in each
 * stretch can still raise three calls.
 */
export const DAY_CALL_MAX_TRIES = 2 * DAY_CALL_MAX;

/**
 * **A whole day costs too much to call on above this many legs** — § D1138 clause 5, S3's *about
 * 3 s*, derived from a measured cost rather than a list of towers.
 *
 * S3 measured one whole day's simulation, CPU time on one thread (its scratch day-cost table, day 1
 * under `collective`):
 *
 * | tower | legs | CPU | ms per leg |
 * |---|---|---|---|
 * | Ashgate | 4 155 | 1.14 s | 0.27 |
 * | Secure Tower | 4 111 | 1.39 s | 0.34 |
 * | Harbour Point | 4 059 | 1.60 s | 0.39 |
 * | Chancery House | 3 641 | 2.18 s | 0.60 |
 * | Midtown Office | 2 563 | 1.02 s | 0.40 |
 * | Mixed-Use High-Rise | 9 933 | 4.70 s | 0.47 |
 * | Vertical City | 32 972 | 15.24 s | 0.46 |
 * | the seven reference towers | 28 971 – 68 347 | 20.0 – 93.3 s | 0.69 – 1.41 |
 *
 * The slowest legible tower runs at 0.60 ms a leg, so **5 000 legs is 3 s** at that rate, and the gate
 * reads the leg count of the day's own as-built run, which is deterministic where a wall clock is
 * not: the same day gets the same calls on every machine. Every legible whole day measured sits
 * under it (the largest is 4 155); Mixed-Use, Vertical City and the reference towers sit over it, so
 * those towers get calls on their slices only — which is the set the ruling named, arrived at from
 * the cost. `dayCalls.sweep.test.ts` re-measures the rate: on this tree the legible whole days read
 * 2 449 – 4 343 legs at 0.8 – 2.2 s (0.66 ms a leg at most, on a process's first and coldest run),
 * Mixed-Use 9 749 – 9 905 legs at 4.4 – 5.8 s and Vertical City 32 724 – 33 275 at 13.4 – 13.9 s,
 * so the line still falls between the two groups ([§ D1138](../../../../DECISIONS.md)).
 * Owner-reversible.
 */
export const DAY_CALL_WHOLE_DAY_MAX_LEGS = 5000;

/** The three answers, in the stage's fixed order. `leave` presses nothing. */
export const DAY_CALL_ANSWERS = Object.freeze(['park-cars-lobby', 'spread-cars', 'leave'] as const);
export type DayCallAnswer = (typeof DAY_CALL_ANSWERS)[number];

/** A counted value for each of the three answers. */
export type DayCallTriple<T> = Readonly<Record<DayCallAnswer, T>>;

/**
 * What the stage is told about the next call — `dev/dayCallSession.ts#openDayCallSession`'s answer
 * through `everyday/host.ts#dayCallOnStage`. **The same shape whatever the call turns out to do**:
 * where it is, and whether it has been raised, never its counts (§ D1138 clause 2).
 */
export interface DayCallOnStage {
  readonly call: PressCall;
  /** `false` while its two runs are still being made — the stage waits at the instant. */
  readonly raised: boolean;
}

/** Everything a candidate is derived from. Plain data from the run's own record. */
export interface DayCallInput {
  /** The run on the stage — every press before the candidate is in it, and none after. */
  readonly legs: readonly VizLeg[];
  /** `shift/bookedOut.ts#bookedOutCarsOf` over the run's resolved building — a fact on the card. */
  readonly bookedOut: readonly BookedOutCar[];
  readonly horizon: RunHorizon;
  /** `shift/dayLength.ts#actsOf(recording.demandPhases)`; read only on a whole day. */
  readonly acts: readonly DayAct[];
  readonly startedAt: SimTime;
  readonly endedAt: SimTime;
}

/**
 * Whether a day of this horizon and this size may raise ordinary calls at all — § D1138 clause 5.
 * `legs` is the as-built run's, the one the stage opened on.
 */
export function dayCallsOffered(horizon: RunHorizon, legs: number): boolean {
  return horizon !== 'whole-day' || legs <= DAY_CALL_WHOLE_DAY_MAX_LEGS;
}

/** The booked-out car away at `atS`, if any — the first to have left. */
function carAwayAt(bookedOut: readonly BookedOutCar[], atS: SimTime): BookedOutCar | undefined {
  return [...bookedOut]
    .sort((a, b) => a.awayAtS - b.awayAtS)
    .find((car) => car.awayAtS <= atS && (car.backAtS === null || atS < car.backAtS));
}

/**
 * **The next candidate call at or after `fromS`**, or `undefined` when the day has none left.
 *
 * The answer is a {@link PressCall} so the stage's card (`everyday/stageCall.ts`) draws it with the
 * pinned call's own grammar: the car line only when a car is out at that instant, the minute line
 * under rule 1, the peak line under rule 2.
 *
 * - **A whole day**: the first peak that ends after `fromS`. Inside it, rule 1 from
 *   `max(fromS, peak start)`; failing that, the peak's start, when that is not already past. A peak
 *   with neither yields to the next.
 * - **A slice**: rule 1 from `fromS`, and only while at least {@link DAY_CALL_SPACING_S} of the run
 *   is left to answer into. No rule 2: a slice's one act is the whole run, and its start is the
 *   stage opening, which is not a moment to call.
 */
export function nextDayCallOf(input: DayCallInput, fromS: SimTime): PressCall | undefined {
  const lastS = input.endedAt - DAY_CALL_SPACING_S;
  const callAt = (atS: SimTime, rule: PressCallRule, act: DayAct | undefined): PressCall => {
    const car = carAwayAt(input.bookedOut, atS);
    return Object.freeze({
      atS,
      rule,
      carId: car?.carId ?? '',
      awayAtS: car?.awayAtS ?? atS,
      backAtS: car === undefined ? null : car.backAtS,
      act,
      carAway: car !== undefined,
    });
  };
  if (input.horizon === 'whole-day') {
    const acts = [...input.acts].sort((a, b) => a.startS - b.startS);
    for (const act of acts) {
      if (act.endS <= fromS) continue;
      const from = Math.max(fromS, act.startS);
      const until = Math.min(act.endS, lastS);
      if (!(from < until)) continue;
      const waited = firstMinuteWaitIn(input.legs, from, until);
      if (waited !== undefined) return callAt(waited, 'first-minute-wait', act);
      if (act.startS >= fromS && act.startS < until) return callAt(act.startS, 'act-start', act);
    }
    return undefined;
  }
  const from = Math.max(fromS, input.startedAt);
  if (!(from < lastS)) return undefined;
  const waited = firstMinuteWaitIn(input.legs, from, lastS);
  return waited === undefined ? undefined : callAt(waited, 'first-minute-wait', undefined);
}

/**
 * Where the search goes after a candidate — the next peak once a whole day's call is raised, and
 * {@link DAY_CALL_SPACING_S} on otherwise.
 */
export function dayCallSearchFrom(call: PressCall, raised: boolean): SimTime {
  if (raised && call.act !== undefined) return Math.max(call.act.endS, call.atS + DAY_CALL_SPACING_S);
  return call.atS + DAY_CALL_SPACING_S;
}

/**
 * **Riders who arrived in `[fromS, toS)` and waited a minute or more** — the count a call's three
 * answers are compared on, and the one its report row prints.
 *
 * A rider is counted once however many of their legs qualify, so the figure is people rather than
 * rides. A leg qualifies when its rider is still standing {@link DAY_CALL_LONG_WAIT_S} after it
 * began — `frame/overlay.ts#isWaitingAt`, so a rider the building turned away (§ D266) is not
 * counted as waiting.
 */
export function longWaitRidersIn(legs: readonly VizLeg[], fromS: SimTime, toS: SimTime): number {
  const riders = new Set<string>();
  for (const leg of legs) {
    if (leg.arrivedAt < fromS || leg.arrivedAt >= toS) continue;
    if (isWaitingAt(leg, leg.arrivedAt + DAY_CALL_LONG_WAIT_S)) riders.add(leg.passengerId);
  }
  return riders.size;
}

/** The end of a call's counting window on a run that ends at `endedAt`. */
export function dayCallWindowEndOf(atS: SimTime, endedAt: SimTime): SimTime {
  return Math.min(atS + DAY_CALL_WINDOW_S, endedAt);
}

/**
 * **Whether a candidate's three counts raise the call** — the spread reaches
 * {@link DAY_CALL_MIN_SPREAD} and {@link DAY_CALL_SPREAD_SHARE} of the largest.
 */
export function dayCallAdmits(counts: DayCallTriple<number>): boolean {
  const values = DAY_CALL_ANSWERS.map((answer) => counts[answer]);
  const high = Math.max(...values);
  const spread = high - Math.min(...values);
  return spread >= Math.max(DAY_CALL_MIN_SPREAD, DAY_CALL_SPREAD_SHARE * high);
}

/** The intervention a pressing answer files, or `undefined` for *leave them*. */
export function dayCallChangeOf(answer: DayCallAnswer): RunInterventionConfig['change'] | undefined {
  return answer === 'leave' ? undefined : ({ kind: answer } as RunInterventionConfig['change']);
}

/**
 * **One raised call, as the day closes on it** — what the report's row reads, and nothing it did not
 * run.
 *
 * `counts` and `observations` are the three runs that admitted the call — identical before it, each
 * with the player's earlier presses and nothing pressed after the call — so the row is exact for
 * those runs and says so. `observations` is each run folded over its own whole run
 * (`shift/observations.ts#shiftObservationsOf`, as `dev/main.ts#closeShift` folds the filed run), so
 * the report grades all three with its own grader against its own goals (§ D982's rule).
 */
export interface DayCallRecord {
  readonly atS: SimTime;
  readonly windowEndS: SimTime;
  /** What the player did at the call. `skipped` is *Skip to the end* with the card up. */
  readonly answer: DayCallAnswer | 'skipped';
  readonly counts: DayCallTriple<number>;
  readonly observations: DayCallTriple<Observations>;
}

/**
 * **A raised call's record, counted from its three runs** — the one place a call's counts are
 * taken, so the admission the session tests and the row the report prints read the same figures.
 *
 * `legs` are the three runs' legs (each identical before the call); the counts are
 * {@link longWaitRidersIn} over `[atS, windowEndS)`. `observations` are the same three runs folded
 * over their own whole run, carried for the report's grader.
 */
export function dayCallRecordOf(input: {
  readonly atS: SimTime;
  readonly windowEndS: SimTime;
  readonly answer: DayCallRecord['answer'];
  readonly legs: DayCallTriple<readonly VizLeg[]>;
  readonly observations: DayCallTriple<Observations>;
}): DayCallRecord {
  const count = (answer: DayCallAnswer): number =>
    longWaitRidersIn(input.legs[answer], input.atS, input.windowEndS);
  return Object.freeze({
    atS: input.atS,
    windowEndS: input.windowEndS,
    answer: input.answer,
    counts: Object.freeze({
      'park-cars-lobby': count('park-cars-lobby'),
      'spread-cars': count('spread-cars'),
      leave: count('leave'),
    }),
    observations: input.observations,
  });
}

/** The row id for the `index`-th call of a day (from 1), so renderers and tests name it by id. */
export function dayCallRowIdOf(index: number): string {
  return `day-call-${String(index)}`;
}

/** An answer's own button words, lower-cased for the middle of a sentence. */
function answerWordsOf(answer: DayCallAnswer): string {
  const label =
    answer === 'park-cars-lobby'
      ? PARK_CARS_LOBBY_LABEL
      : answer === 'spread-cars'
        ? SPREAD_CARS_LABEL
        : DAY_CALL_LEAVE_LABEL;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** *Leave them* — the stage's third answer, the same words on the card and in the row. */
export const DAY_CALL_LEAVE_LABEL = 'Leave them';

/** `a`, `a and b`, `a, b and c`. */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${String(parts[parts.length - 1])}`;
}

/**
 * The closing clause on every call row — what its facts are about and what they are not. The same
 * sentence as § D1029's pinned row, because it is the same kind of claim.
 */
export const DAY_CALL_ROW_NOTE =
  'Those are runs of this crowd’s day and nothing else: they say nothing about how a day reads for ' +
  'any other crowd, even in this tower.';

/**
 * **The report's row for one call** — § D1138 clause 3.
 *
 * It claims exactly what its three runs measured, on **this crowd**: the ten-minute count under each
 * answer, and the day's verdict under each **only where the three split**. No mechanism, no
 * *better*, no word across crowds, no sum across a day's calls (each row holds the others' presses
 * where they were, so two rows do not add). `gradeOf` is the report's own grader —
 * `VERDICT_VOICE[verdict].line` over the report's goals — passed in so this module owns no second
 * verdict vocabulary.
 */
export function dayCallRowOf(
  record: DayCallRecord,
  index: number,
  gradeOf: (observations: Observations) => string,
  clockOf: (simTimeS: SimTime) => string,
): ReportDiagnosis {
  const at = clockOf(record.atS);
  const to = clockOf(record.windowEndS);
  const what =
    record.answer === 'skipped'
      ? 'The stage called the day, and the day was skipped to its end'
      : record.answer === 'leave'
        ? 'The stage called the day, and you left the cars as they were'
        : `The stage called the day, and you ${stampVerbOf({ kind: record.answer } as Parameters<typeof stampVerbOf>[0])}`;
  const counts = DAY_CALL_ANSWERS.map(
    (answer) => `${String(record.counts[answer])} with ${answerWordsOf(answer)}`,
  );
  const grades = new Map<string, DayCallAnswer[]>();
  for (const answer of DAY_CALL_ANSWERS) {
    const line = gradeOf(record.observations[answer]);
    grades.set(line, [...(grades.get(line) ?? []), answer]);
  }
  const verdict =
    grades.size <= 1
      ? ''
      : ` The day read ${listOf(
          [...grades.entries()].map(([line, answers]) => `${line} with ${listOf(answers.map(answerWordsOf))}`),
        )}.`;
  return {
    id: dayCallRowIdOf(index),
    when: at,
    what,
    why:
      'On this crowd the day was run three ways from the call, with every press before it kept and ' +
      `nothing pressed after it. Riders who arrived from ${at} to ${to} and waited a minute or more: ` +
      `${listOf(counts)}.${verdict} ${DAY_CALL_ROW_NOTE}`,
    tone: 'plain',
  };
}
