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
 * instant. On a whole day the candidates lie inside the peaks; on either horizon two of them are at
 * least {@link DAY_CALL_SPACING_S} apart, a raised call included ([§ D1166](../../../../DECISIONS.md)
 * dropped § D1138's one stretch per peak). A candidate whose answers change nothing is skipped, and
 * the next is asked, up to {@link DAY_CALL_MAX_TRIES} in a day.
 *
 * ## Two questions, one card grammar — [§ D1167](../../../../DECISIONS.md)
 *
 * A candidate asks the **placement** question first: *park*, *spread*, *leave them*. Where its three
 * counts do not reach the threshold, it asks the **driver** question from the same instant: hand the
 * rest of the day to one of the pair ({@link dayCallDriversOf}), or keep the dispatcher driving now.
 * Since [§ D1205](../../../../DECISIONS.md) the pair is re-derived from whoever drives after a
 * handover, so the question may be asked again; after *keep* it is not asked again in that peak,
 * and neither question is raised twice within {@link DAY_CALL_REPEAT_S}. Both are admitted by one rule
 * ({@link dayCallAdmits}, unchanged), drawn on one card and reported in one row grammar. The
 * swarm's members measured why the second question exists: at a crowded landing no car is idle, so
 * the three parking answers leave the next ten minutes alike, while a handover reaches the busy
 * cars.
 *
 * ## No call once the day is already lost — [§ D1168](../../../../DECISIONS.md)
 *
 * A candidate where the queue goal or the worst-wait goal already reads missed on the run standing
 * ({@link dayCallLostGoalOf}) is not asked, and the day asks nothing after it. Both goals grade a
 * maximum, so once missed they stay missed whatever is pressed, and the day cannot clear. That is
 * read off the present frame, the one the rail draws, so skipping those calls says nothing about
 * which of the others were decisive.
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

import type { DispatcherProfile, RunInterventionConfig, SimTime } from '@elevator-sim/core/browser';

import type { VizLeg } from '../contract/types.js';
import { isWaitingAt } from '../frame/overlay.js';
import {
  PARK_CARS_LOBBY_LABEL,
  SPREAD_CARS_LABEL,
  stampVerbOf,
  switchChangesNothing,
  switchRefusalOf,
} from '../live/interventions.js';
import { WAIT_BANDS } from '../live/bands.js';

import type { BookedOutCar } from './bookedOut.js';
import { CALL_BANDS, driverOfferOf } from './callBands.js';
import type { DayCallMaxima } from './dayCallMaxima.js';
import { goalPlainNameOf } from './goals.js';
import { PRESS_CALL_SKIPPED_WHAT } from './callRow.js';
import type { DayAct } from './dayLength.js';
import { firstMinuteWaitIn, type PressCall, type PressCallRule } from './pressCall.js';
import type { GoalReading, Observations, ReportDiagnosis, RunHorizon } from './types.js';

/**
 * **At most six calls a day** — [§ D1166](../../../../DECISIONS.md), the decide-al ruling's Q1
 * clause 3, which raised § D1138's three. A cap rather than a quota: a day raises what its events
 * produce, from none to six.
 *
 * Three was one call a peak on a whole day, and it left the stretch of a peak after its call empty
 * however crowded it stayed. With the jump to the peak's end gone ({@link dayCallSearchFrom}) the
 * engineering member measured 8 of 32 uncapped whole days reaching six calls, so six is where the
 * cap starts to bind rather than a figure below what days produce. The player member dissented for
 * no cap at all. Owner-reversible: it is this one constant.
 */
export const DAY_CALL_MAX = 6;

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
 * **The spacing between two calls**, and between a refused candidate and the next one tried —
 * five simulated minutes, S1's, on both horizons since [§ D1166](../../../../DECISIONS.md).
 *
 * § D1138 moved a whole day's search to the next peak once a call was raised (S1's *one per peak
 * act*), so a peak that stayed crowded after its call asked nothing more. That jump is gone: a
 * raised call and a refused one both move the search on by this spacing, inside the peak as on a
 * slice. S3 measured 240 s and found the same call rate; 300 s is kept. Owner-reversible.
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
 * **At most two raised calls in one peak of a whole day** — wave AL, lane AL-C,
 * [§ D1205](../../../../DECISIONS.md), the decide-an ruling's Q1(b).
 *
 * With only the day's cap of six ({@link DAY_CALL_MAX}), a crowded morning or lunch could spend the
 * cap and leave the evening silent: the swarm's engineering member measured 16 + 18 + 8 calls over
 * the three peaks of ten Midtown branches, with an evening call on six of them. Two a peak, with
 * the driver question asked again after a handover, put a call in all three peaks on ten of ten.
 * Read only on a whole day, where a candidate carries the peak it falls in; a slice's calls carry
 * no peak and are held by the day's cap alone. Owner-reversible: it is this one constant.
 */
export const DAY_CALL_PER_PEAK = 2;

/**
 * **No question is raised again within ten simulated minutes of the last time it was raised** —
 * [§ D1205](../../../../DECISIONS.md). Seat A's rule, and S2 measured half of a day's follow-on
 * calls repeating the question just asked. A candidate whose placement question is held by this
 * rule is asked the driver question instead, where that one is not held too; a candidate where both
 * are held costs no run and is not counted as asked. The same length as {@link DAY_CALL_WINDOW_S}
 * and a different rule: that one is what a call's answers are counted over. Owner-reversible.
 */
export const DAY_CALL_REPEAT_S = 600;

/**
 * **How many candidates a day may ask before it stops** — each asked candidate costs two runs, or
 * four where the driver question is asked too, and a refused one is runs nobody sees. Twice the
 * cap, so a day that refuses one candidate for each it raises can still reach the cap.
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

/** The placement question's three answers, in the stage's fixed order. `leave` presses nothing. */
export const DAY_CALL_ANSWERS = Object.freeze(['park-cars-lobby', 'spread-cars', 'leave'] as const);

/**
 * **The driver question's three answers, in the stage's fixed order** — [§ D1167](../../../../DECISIONS.md).
 * `driver-a` and `driver-b` hand the rest of the day to the first and second of the tower's pair
 * ({@link dayCallDriversOf}) through `adopt-dispatcher`; `leave` keeps the dispatcher driving now
 * and presses nothing, which is what *leave them* is on the placement question.
 */
export const DAY_CALL_DRIVER_ANSWERS = Object.freeze(['driver-a', 'driver-b', 'leave'] as const);

/** Which of the two questions a call asks. */
export type DayCallQuestion = 'placement' | 'driver';

export type DayCallAnswer =
  | (typeof DAY_CALL_ANSWERS)[number]
  | (typeof DAY_CALL_DRIVER_ANSWERS)[number];

/** A question's three answers, in order. */
export function dayCallAnswersOf(question: DayCallQuestion): readonly DayCallAnswer[] {
  return question === 'driver' ? DAY_CALL_DRIVER_ANSWERS : DAY_CALL_ANSWERS;
}

/**
 * A counted value for each of a question's three answers — keyed by answer, so a placement call
 * carries `park-cars-lobby`, `spread-cars` and `leave`, and a driver call `driver-a`, `driver-b` and
 * `leave`.
 */
export type DayCallTriple<T> = Readonly<Partial<Record<DayCallAnswer, T>>>;

/**
 * **The dispatchers the driver question may offer, in the order the pair is taken** —
 * [§ D1167](../../../../DECISIONS.md), the decide-al ruling's *a fixed pair per tower*, with the
 * house taken out by wave AN, lane DQ-1, [§ D1337](../../../../DECISIONS.md), and **derived from the
 * census since wave AO, lane DR-2**, [§ D1442](../../../../DECISIONS.md).
 *
 * § D1337 wrote the list here: Fairness first, Predictive balanced, Energy aware and Minimum
 * estimated wait, gated by a check on the row's ten-minute counts. Swarm DR measured what that list
 * did on the day's verdict: offered to a player on Predictive balanced, Energy aware cleared 2 of the
 * 18 who-drives rows whose answers split the day (S1), and it was the day-safe side on 1 of 21
 * danger instants (S2), so the card offered a trap. So the list is no longer written in code: it is
 * `callBands.ts#driverOfferOf` over `data/call-bands.json`, the candidates in the census's order
 * less every one that clears the day on under one split row in five where it was measured. A
 * candidate the census has not placed keeps its place. The house is not a candidate, so a switch
 * target is still always a contender, and a player on the house still meets it as *keep*.
 *
 * A tower's pair is the first two of these that differ from the one driving and that a handover can
 * reach ({@link dayCallDriversOf}), so it is fixed from who is driving and never chosen by which
 * answer clears on the day being played. `everyday/callBands.sweep.test.ts` re-measures the census
 * nightly and requires the rows this is derived from. Owner-reversible: the census's candidates and
 * their order, and the floor.
 */
export const DAY_CALL_DRIVER_OFFER: readonly string[] = driverOfferOf(CALL_BANDS);

/**
 * **A tower's driver pair for one day** — the first two of {@link DAY_CALL_DRIVER_OFFER} that a
 * handover from `driving` reaches (`live/interventions.ts#switchRefusalOf` passes) and that would
 * change something (`#switchChangesNothing` refuses the rest), or `undefined` when fewer than two
 * do. Read when the day's session opens, from the dispatcher the day opened with, and again after
 * every handover, from the dispatcher it handed to ([§ D1205](../../../../DECISIONS.md)), so *keep*
 * always names who is driving and the pair never offers the dispatcher already driving.
 */
export function dayCallDriversOf(
  profiles: readonly DispatcherProfile[],
  driving: DispatcherProfile,
): readonly [DispatcherProfile, DispatcherProfile] | undefined {
  const pair: DispatcherProfile[] = [];
  for (const id of DAY_CALL_DRIVER_OFFER) {
    const target = profiles.find((profile) => profile.id === id);
    if (target === undefined || switchRefusalOf(target, driving) !== undefined) continue;
    if (switchChangesNothing({ interventions: [], target, driving: () => driving })) continue;
    pair.push(target);
    if (pair.length === 2) break;
  }
  const [a, b] = pair;
  return a === undefined || b === undefined ? undefined : Object.freeze([a, b] as const);
}

/**
 * **The goals whose miss is final** — the queue and the worst wait, both graded on a maximum, so a
 * day on which either reads missed at the playhead cannot clear whatever is pressed after it
 * ([§ D1168](../../../../DECISIONS.md)).
 */
export const DAY_CALL_FINAL_GOAL_IDS: readonly string[] = Object.freeze(['queue', 'worst-wait']);

/**
 * The first of {@link DAY_CALL_FINAL_GOAL_IDS} that reads missed in `readings`, or `undefined`.
 * `readings` are the rail's own, `shift/goals.ts#readGoals` over the run standing at the playhead,
 * so this reads the present frame and nothing after it.
 */
export function dayCallLostGoalOf(readings: readonly GoalReading[]): GoalReading | undefined {
  return readings.find(
    (reading) => DAY_CALL_FINAL_GOAL_IDS.includes(reading.goal.id) && reading.state === 'missed',
  );
}

/**
 * What the stage is told about the next call — `dev/dayCallSession.ts#openDayCallSession`'s answer
 * through `everyday/host.ts#dayCallOnStage`. **The same shape whatever the call turns out to do**:
 * where it is, and whether it has been raised, never its counts (§ D1138 clause 2).
 */
export interface DayCallOnStage {
  readonly call: PressCall;
  /** `false` while its runs are still being made — the stage waits at the instant. */
  readonly raised: boolean;
  /**
   * Which question the raised call asks, for the card ([§ D1167](../../../../DECISIONS.md)).
   * Absent while `raised` is `false`: which question it will be is known only from its runs.
   */
  readonly question?: DayCallQuestion | undefined;
  /** The driver question's names, present only when it is the question asked. */
  readonly drivers?: DayCallDriverNames | undefined;
}

/**
 * **The day's wrinkle, as a stretch the stage may call in** — wave AM, lane AM-F,
 * [§ D1265](../../../../DECISIONS.md), swarm DO § 4's *a wrinkle's own call, inside its window*.
 *
 * Where the day's wrinkle is: the car it takes, from when to when (a move-in, a shaft out), or its
 * episode on the day's clock (a conference). `dev/state.ts#dayCallFactsOf` reads it off the run's
 * own plan, so it is the schedule the run was built from and nothing measured after the playhead.
 * `name` is the wrinkle's own name, `shift/types.ts#ShiftEvent.name`, for the card.
 */
export interface DayCallWrinkle {
  readonly startS: SimTime;
  readonly endS: SimTime;
  readonly name: string;
}

/**
 * **At most one raised call in the day's wrinkle** — [§ D1265](../../../../DECISIONS.md). The
 * wrinkle's own call; a crowded wrinkle does not become a peak of its own. It is **not** counted
 * against {@link DAY_CALL_MAX}, so a wrinkle between the peaks cannot spend the evening's calls.
 * Owner-reversible: it is this one constant.
 */
export const DAY_CALL_PER_WRINKLE = 1;

/**
 * **Whether a whole day's wrinkle is a stretch of its own to call in**: it lies clear of every peak.
 * A wrinkle that overlaps a peak (the fire drill, whose episode is at the day's peak level and so is
 * an act of its own, `shift/dayLength.ts#actsOf`) is already called in as that peak, and a window of
 * no length is no stretch.
 */
export function dayCallWrinkleWindowOf(
  wrinkle: DayCallWrinkle | undefined,
  acts: readonly DayAct[],
): DayCallWrinkle | undefined {
  if (wrinkle === undefined || !(wrinkle.endS > wrinkle.startS)) return undefined;
  return acts.some((act) => act.startS < wrinkle.endS && wrinkle.startS < act.endS) ? undefined : wrinkle;
}

/**
 * **A wrinkle that overlaps a peak, as the one candidate at its start** — wave AN, lane DQ-1,
 * [§ D1336](../../../../DECISIONS.md), which replaces [§ D1265](../../../../DECISIONS.md) clause 2
 * (*a wrinkle overlapping a peak is not a second stretch*) for the start alone.
 *
 * Swarm DQ's engineering member ran every answer at 19 wrinkle starts over Midtown's two weeks: a
 * handover split the day's verdict at 13 of them, the fire drill and the late finish among them,
 * and those two overlap a peak, so § D1265 never asked at their start. Such a wrinkle still adds no
 * stretch to search (its peak is searched as a peak); it adds the one instant it begins. `undefined`
 * where the wrinkle has no window, or lies clear of every peak, which {@link dayCallWrinkleWindowOf}
 * searches whole.
 */
export function dayCallWrinkleStartOf(
  wrinkle: DayCallWrinkle | undefined,
  acts: readonly DayAct[],
): DayCallWrinkle | undefined {
  if (wrinkle === undefined || !(wrinkle.endS > wrinkle.startS)) return undefined;
  return dayCallWrinkleWindowOf(wrinkle, acts) === undefined ? wrinkle : undefined;
}

/** Whether `call` was drawn inside the day's wrinkle rather than a peak. */
export function dayCallIsWrinkle(call: Pick<PressCall, 'wrinkle'>): boolean {
  return call.wrinkle !== undefined;
}

/**
 * Whether `call` is the instant the day's wrinkle begins — the one candidate where § D1336's second
 * admission ground applies (`dev/dayCallSession.ts`). A wrinkle's first-minute wait is not one.
 */
export function dayCallIsWrinkleStart(call: Pick<PressCall, 'wrinkle' | 'rule'>): boolean {
  return call.wrinkle !== undefined && call.rule === 'wrinkle-start';
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
  /**
   * The day's wrinkle, where it has a window ({@link DayCallWrinkle}); read only on a whole day, and
   * only where it lies clear of every peak ({@link dayCallWrinkleWindowOf}).
   */
  readonly wrinkle?: DayCallWrinkle | undefined;
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
 *   with neither yields to the next. **The day's wrinkle is searched as one more stretch** where it
 *   lies clear of every peak ([§ D1265](../../../../DECISIONS.md)), in time order with the peaks.
 *   Since [§ D1336](../../../../DECISIONS.md) **its start comes first** (`wrinkle-start`), and rule 1
 *   inside it is the fallback once the start is past; and **a wrinkle that overlaps a peak adds its
 *   start**, and only its start ({@link dayCallWrinkleStartOf}). Its calls carry the wrinkle as their
 *   `act` and their `wrinkle`, so the session holds them to {@link DAY_CALL_PER_WRINKLE}. Where two
 *   stretches offer a candidate the earlier wins, and the wrinkle's start is asked in place of any
 *   candidate less than {@link DAY_CALL_SPACING_S} before it, so the spacing never passes it.
 * - **A slice**: rule 1 from `fromS`, and only while at least {@link DAY_CALL_SPACING_S} of the run
 *   is left to answer into. No rule 2: a slice's one act is the whole run, and its start is the
 *   stage opening, which is not a moment to call.
 */
export function nextDayCallOf(input: DayCallInput, fromS: SimTime): PressCall | undefined {
  const lastS = input.endedAt - DAY_CALL_SPACING_S;
  const callAt = (
    atS: SimTime,
    rule: PressCallRule,
    act: DayAct | undefined,
    wrinkle?: DayCallWrinkle | undefined,
  ): PressCall => {
    const car = carAwayAt(input.bookedOut, atS);
    return Object.freeze({
      atS,
      rule,
      carId: car?.carId ?? '',
      awayAtS: car?.awayAtS ?? atS,
      backAtS: car === undefined ? null : car.backAtS,
      act,
      carAway: car !== undefined,
      ...(wrinkle === undefined ? {} : { wrinkle: Object.freeze({ name: wrinkle.name, startS: wrinkle.startS }) }),
    });
  };
  if (input.horizon === 'whole-day') {
    /*
     * § D1336: the instant the day's wrinkle begins, whether its window is a stretch of its own or
     * overlaps a peak, while it is not yet past.
     */
    const clear = dayCallWrinkleWindowOf(input.wrinkle, input.acts);
    const begins = clear ?? dayCallWrinkleStartOf(input.wrinkle, input.acts);
    const start =
      begins !== undefined && begins.startS >= fromS && begins.startS < Math.min(begins.endS, lastS)
        ? callAt(begins.startS, 'wrinkle-start', { startS: begins.startS, endS: begins.endS }, begins)
        : undefined;
    let best: PressCall | undefined;
    const consider = (candidate: PressCall): void => {
      if (best === undefined || candidate.atS < best.atS) best = candidate;
    };
    /* § D1265's stretch clear of every peak: rule 1 inside it, once its start is past. */
    if (clear !== undefined && start === undefined && clear.endS > fromS) {
      const from = Math.max(fromS, clear.startS);
      const until = Math.min(clear.endS, lastS);
      const waited = from < until ? firstMinuteWaitIn(input.legs, from, until) : undefined;
      if (waited !== undefined) consider(callAt(waited, 'first-minute-wait', { startS: clear.startS, endS: clear.endS }, clear));
    }
    for (const act of input.acts) {
      if (act.endS <= fromS) continue;
      /* A peak that starts after the best candidate so far cannot beat it. */
      if (best !== undefined && Math.max(fromS, act.startS) >= best.atS) continue;
      const from = Math.max(fromS, act.startS);
      const until = Math.min(act.endS, lastS);
      if (!(from < until)) continue;
      const waited = firstMinuteWaitIn(input.legs, from, until);
      if (waited !== undefined) consider(callAt(waited, 'first-minute-wait', act));
      else if (act.startS >= fromS && act.startS < until) consider(callAt(act.startS, 'act-start', act));
    }
    /*
     * The wrinkle's start is never spaced out of the day. Where another candidate falls less than
     * {@link DAY_CALL_SPACING_S} before it, the start is asked in that candidate's place, so the
     * spacing still holds between any two candidates and a peak's moment a minute before the drill
     * (Midtown's fire drill and evacuation are acts that open a minute before their wrinkle) cannot
     * push the drill's own start past the search.
     */
    const other = best as PressCall | undefined;
    if (start !== undefined && (other === undefined || start.atS < other.atS + DAY_CALL_SPACING_S)) return start;
    return other;
  }
  const from = Math.max(fromS, input.startedAt);
  if (!(from < lastS)) return undefined;
  const waited = firstMinuteWaitIn(input.legs, from, lastS);
  return waited === undefined ? undefined : callAt(waited, 'first-minute-wait', undefined);
}

/**
 * Where the search goes after a candidate — {@link DAY_CALL_SPACING_S} on, raised or refused, on
 * both horizons. [§ D1166](../../../../DECISIONS.md) dropped § D1138's jump to the end of the peak
 * after a raised call; `dayCalls.test.ts` holds a second call inside the peak of the first.
 */
export function dayCallSearchFrom(call: PressCall): SimTime {
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
  const values = Object.values(counts).filter((value): value is number => value !== undefined);
  if (values.length < 2) return false;
  const high = Math.max(...values);
  const spread = high - Math.min(...values);
  return spread >= Math.max(DAY_CALL_MIN_SPREAD, DAY_CALL_SPREAD_SHARE * high);
}

/**
 * The intervention a pressing answer files, or `undefined` for *leave them*. A driver answer names
 * its dispatcher from `drivers`, the day's pair; without one it files nothing.
 */
export function dayCallChangeOf(
  answer: DayCallAnswer,
  drivers?: readonly [DispatcherProfile, DispatcherProfile],
): RunInterventionConfig['change'] | undefined {
  if (answer === 'leave') return undefined;
  if (answer === 'driver-a' || answer === 'driver-b') {
    const profile = drivers?.[answer === 'driver-a' ? 0 : 1];
    return profile === undefined ? undefined : { kind: 'adopt-dispatcher', profile };
  }
  return { kind: answer };
}

/** The names a driver call's row and card use: the pair's, and the dispatcher kept on `leave`. */
export type DayCallDriverNames = Readonly<Record<(typeof DAY_CALL_DRIVER_ANSWERS)[number], string>>;

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
  /**
   * Which question the call asked — [§ D1167](../../../../DECISIONS.md). Absent on a record written
   * before the driver question existed, which is the placement question.
   */
  readonly question?: DayCallQuestion | undefined;
  /** A driver call's names; absent on a placement call. */
  readonly drivers?: DayCallDriverNames | undefined;
  /** What the player did at the call. `skipped` is *Skip to the end* with the card up. */
  readonly answer: DayCallAnswer | 'skipped';
  readonly counts: DayCallTriple<number>;
  readonly observations: DayCallTriple<Observations>;
  /**
   * **The call was the day's wrinkle's own** — [§ D1265](../../../../DECISIONS.md)'s one call, not
   * counted against the day's six. Written since [§ D1336](../../../../DECISIONS.md), whose start
   * call can fall inside a peak, so the wrinkle's call can no longer be told from a peak's by its
   * instant alone. Absent on a peak's call, and on a record written before it.
   */
  readonly wrinkle?: true | undefined;
  /**
   * **Each answer's two final goals, read through the day from the call** — wave AO, lane DR-1,
   * [§ D1433](../../../../DECISIONS.md), `shift/dayCallMaxima.ts`. Taken at the raise from the three
   * runs, so the stage's row reads them at its playhead on a resumed attempt as on an unbroken one.
   * Absent on a record written before it, which keeps its counts-only row.
   */
  readonly maxima?: DayCallTriple<DayCallMaxima> | undefined;
}

/**
 * **A wrinkle the stage ran its answers in and raised no call** — wave AN, lane DQ-1,
 * [§ D1336](../../../../DECISIONS.md), swarm DQ's honesty member's line: a wrinkle that raised nothing
 * says so once, in the past tense, after its window. `refused` are the candidates asked inside it, in
 * order, each counted from the runs already made (its first question's three runs; `observations`
 * left empty, because the line prints counts and nothing graded). This amends § D1138 clause 3's
 * *refused calls never reach the report*, for a wrinkle's candidates only.
 */
export interface DayCallWrinkleQuiet {
  readonly wrinkle: DayCallWrinkle;
  readonly refused: readonly DayCallRecord[];
}

/** The report's row id for a wrinkle that raised no call. */
export const DAY_CALL_WRINKLE_QUIET_ROW_ID = 'day-call-wrinkle-quiet';

/**
 * **The past-tense line for a wrinkle that raised no call** — the one sentence the stage's row and the
 * report's row both print ([§ D1336](../../../../DECISIONS.md)). What the stage did and the first
 * moment's counts in the call row's own words ({@link dayCallCountsLineOf}); no verdict, which the
 * stage may not print before the close, and no *because*, since a start's call is admitted on the
 * day's verdict too. The session hands it at least one refused moment; with none it says only the
 * first sentence.
 */
export function dayCallWrinkleQuietSentenceOf(
  quiet: DayCallWrinkleQuiet,
  clockOf: (simTimeS: SimTime) => string,
): string {
  const [first, ...rest] = quiet.refused;
  const opening = `${quiet.wrinkle.name} began at ${clockOf(quiet.wrinkle.startS)}, and the stage raised no call in it.`;
  if (first === undefined) return opening;
  const more =
    rest.length === 0
      ? ''
      : ` It ran the day ahead from ${listOf(rest.map((record) => clockOf(record.atS)))} too, and did not stop there either.`;
  return (
    `${opening} It ran the day ahead under each answer it could offer from ${clockOf(first.atS)}, and did not ` +
    `stop. ${dayCallCountsLineOf(first, clockOf)}${more}`
  );
}

/** The report's row for a wrinkle that raised no call — {@link dayCallWrinkleQuietSentenceOf}. */
export function dayCallWrinkleQuietRowOf(
  quiet: DayCallWrinkleQuiet,
  clockOf: (simTimeS: SimTime) => string,
): ReportDiagnosis {
  return {
    id: DAY_CALL_WRINKLE_QUIET_ROW_ID,
    when: `${clockOf(quiet.wrinkle.startS)}–${clockOf(quiet.wrinkle.endS)}`,
    what: `${quiet.wrinkle.name} raised no call`,
    why: dayCallWrinkleQuietSentenceOf(quiet, clockOf),
    tone: 'plain',
  };
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
  readonly question?: DayCallQuestion | undefined;
  readonly drivers?: DayCallDriverNames | undefined;
  readonly legs: DayCallTriple<readonly VizLeg[]>;
  readonly observations: DayCallTriple<Observations>;
}): DayCallRecord {
  const question = input.question ?? 'placement';
  const counts: Partial<Record<DayCallAnswer, number>> = {};
  for (const answer of dayCallAnswersOf(question)) {
    counts[answer] = longWaitRidersIn(input.legs[answer] ?? [], input.atS, input.windowEndS);
  }
  return Object.freeze({
    atS: input.atS,
    windowEndS: input.windowEndS,
    ...(question === 'driver' ? { question } : {}),
    ...(question === 'driver' && input.drivers !== undefined ? { drivers: input.drivers } : {}),
    answer: input.answer,
    counts: Object.freeze(counts),
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

/**
 * **The driver question's words** — [§ D1167](../../../../DECISIONS.md). The question is the
 * card's; each label is the button's; the row names each answer by who drove.
 */
export const DAY_CALL_DRIVER_COPY = Object.freeze({
  question: 'Who drives the rest of the day?',
  keep: (name: string): string => `Keep ${name} driving`,
});

/** A driver answer as the row names it: who drove from the call under that answer. */
function driverWordsOf(answer: DayCallAnswer, names: DayCallDriverNames): string {
  if (answer === 'leave') return `${names.leave} still driving`;
  return `${answer === 'driver-a' ? names['driver-a'] : names['driver-b']} driving`;
}

/** `a`, `a and b`, `a, b and c`. */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${String(parts[parts.length - 1])}`;
}

/**
 * **What a day with no call did instead** — [§ D1152](../../../../DECISIONS.md), the post-AJ panel's
 * seat B (U1). Two of that seat's three scored days raised no call and nothing said so, even at the
 * close; the seat thought it had missed one. § D1138 refuses a line on the brief forecasting a
 * quiet day, and this is not one: it is said after the day, of the run that was played.
 *
 * - `not-offered` — the day is a whole day too busy for the stage to ask on (§ D1138 clause 5).
 * - `asked` — the ordinary calls' session ran on this attempt; `refused` is how many candidate
 *   moments it ran ahead and turned down, and `ending` how its asking stopped: `finished` (no
 *   moment left, or the day's cap), `failed` (a run it needed could not be made), `skipped` (the day
 *   was skipped past the calls), `asking` (the day was closed while candidates were still ahead), or
 *   `lost` ([§ D1168](../../../../DECISIONS.md): at `lostAtS` a goal whose miss is final already
 *   read missed, named by `lostGoal`, so it asked nothing more).
 */
export type DayCallsQuiet =
  | { readonly kind: 'not-offered' }
  | {
      readonly kind: 'asked';
      readonly refused: number;
      /**
       * How many candidate moments lost their question because a run they needed could not be made
       * ([§ D1335](../../../../DECISIONS.md)). Absent where none did. Such a moment is not in
       * `refused`, because its answers were never compared.
       */
      readonly failed?: number | undefined;
      /**
       * `failed` is kept for a session snapshot written before § D1335, when a refused run ended
       * the day's asking. A session opened since never ends that way: it loses that one question
       * and asks the next.
       */
      readonly ending: 'finished' | 'failed' | 'skipped' | 'asking';
    }
  | {
      readonly kind: 'asked';
      readonly refused: number;
      readonly failed?: number | undefined;
      readonly ending: 'lost';
      readonly lostAtS: SimTime;
      /** `shift/goals.ts#goalPlainNameOf` of the goal that read missed. */
      readonly lostGoal: string;
    };

/**
 * **A candidate whose question was lost because a run could not be made** — wave AN, lane DQ-1,
 * [§ D1335](../../../../DECISIONS.md), swarm DQ's ruling Q1 item 2.
 *
 * The post-AM panel played a bundle whose worker refused every handover run, and the session ended
 * the whole day's asking at the first refusal, so a day kept only the calls raised before its first
 * who-drives candidate and nothing said so after the first card. Since § D1335 a run that cannot be
 * made costs the one candidate it was made for: that moment asks nothing, the session goes on to
 * the next, and the stage and the report each say where it happened, on every day it happens.
 * `question` is the question whose runs were refused.
 */
export interface DayCallFailure {
  readonly atS: SimTime;
  readonly question: DayCallQuestion;
}

/** The report's row id for a day on which a run the stage needed could not be made. */
export const DAY_CALL_FAILED_ROW_ID = 'day-calls-failed';

/**
 * **What a lost question was, in words** — the one sentence the report's row and the stage's row
 * both print ([§ D1335](../../../../DECISIONS.md)), so the two cannot describe the fault
 * differently. Past tense, of instants the run has reached, and no figure: nothing was compared.
 */
export function dayCallFailedSentenceOf(clocks: readonly string[]): string {
  return (
    `At ${listOf(clocks)} the stage tried to run the day ahead under the answers it would offer, and a run ` +
    'it needed could not be made, so it asked nothing there and went on to the next moment. That is a ' +
    'fault in the game, not something about this crowd or what you pressed.'
  );
}

/**
 * **The report's row for a day that lost a question to a run that could not be made** —
 * [§ D1335](../../../../DECISIONS.md). Drawn whatever else the day raised, which is the half the
 * post-AM panel's sheet lacked: § D1152's sentence spoke only on a day with no call at all.
 * `undefined` where nothing failed.
 */
export function dayCallFailedRowOf(
  failures: readonly DayCallFailure[],
  clockOf: (simTimeS: SimTime) => string,
): ReportDiagnosis | undefined {
  const instants = [...new Set(failures.map((failure) => failure.atS))].sort((a, b) => a - b);
  const [first] = instants;
  if (first === undefined) return undefined;
  const clocks = instants.map(clockOf);
  return {
    id: DAY_CALL_FAILED_ROW_ID,
    when: clockOf(first),
    what:
      instants.length === 1
        ? `The stage could not ask at ${clockOf(first)}`
        : `The stage could not ask at ${String(instants.length)} moments`,
    why: dayCallFailedSentenceOf(clocks),
    tone: 'plain',
  };
}

/**
 * **The one sentence a day with no call gets at its close** — § D1152. Only what the session saw:
 * the count of moments it turned down and the admission rule it turned them down on, never a
 * forecast about another day and never a claim that a call would have mattered. `clockOf` is the
 * report's own clock, for the `lost` arm's instant.
 */
export function dayCallsQuietSentenceOf(
  quiet: DayCallsQuiet,
  clockOf: (simTimeS: SimTime) => string = (simTimeS) => String(Math.round(simTimeS)),
): string {
  const head = 'The stage raised no call today.';
  if (quiet.kind === 'not-offered') {
    return `${head} It does not stop to ask on a whole day with as many trips as this one.`;
  }
  switch (quiet.ending) {
    case 'asking':
      return 'The stage raised no call before the day was closed.';
    case 'skipped':
      return `${head} The day was skipped to its end before one was raised.`;
    case 'failed':
      return `${head} A run it needed in order to ask could not be made.`;
    case 'lost':
      return (
        `${head} By ${clockOf(quiet.lostAtS)} ${quiet.lostGoal} already read missed, and that goal ` +
        'cannot be met again once missed, so from there no answer could change whether the day cleared ' +
        'and the stage asked nothing more.'
      );
    case 'finished':
      break;
  }
  if (quiet.refused === 0 && (quiet.failed ?? 0) > 0) {
    /* § D1335: every moment it tried lost its question to a run, so it compared no answers at all. */
    return `${head} At every moment it tried, a run it needed in order to ask could not be made.`;
  }
  if (quiet.refused === 0) {
    return `${head} It found no moment to ask on this run: nobody on a landing had waited a minute with time left in the day to answer.`;
  }
  const moments = quiet.refused === 1 ? 'one moment' : `${String(quiet.refused)} moments`;
  return (
    `${head} It ran the day ahead under each answer it could offer from ${moments}, and each time the ` +
    'answers left close to the same number of riders waiting a minute or more over the next ten ' +
    `minutes. A call needs those counts at least ${String(DAY_CALL_MIN_SPREAD)} riders apart, and a tenth of the largest of them.`
  );
}

/**
 * The closing clause on every call row — what its facts are about and what they are not. The same
 * sentence as § D1029's pinned row, because it is the same kind of claim.
 */
export const DAY_CALL_ROW_NOTE =
  'Those are runs of this crowd’s day and nothing else: they say nothing about how a day reads for ' +
  'any other crowd, even in this tower.';

/**
 * **The report's row for one call** — § D1138 clause 3, and [§ D1167](../../../../DECISIONS.md)'s
 * driver call in the same grammar.
 *
 * It claims exactly what its three runs measured, on **this crowd**: the ten-minute count under each
 * answer, and the day's verdict under each **only where the three split**. No mechanism, no
 * *better*, no word across crowds, no sum across a day's calls (each row holds the others' presses
 * where they were, so two rows do not add). A driver row names each answer by who drove from the
 * call, which is what the runs differ in; two dispatchers on one crowd is a count on that crowd and
 * never a ranking of the two, which is why the row carries the same ban lists as the placement row
 * (`dayCalls.test.ts`). `gradeOf` is the report's own grader — `VERDICT_VOICE[verdict].line` over
 * the report's goals — passed in so this module owns no second verdict vocabulary.
 */
export function dayCallRowOf(
  record: DayCallRecord,
  index: number,
  gradeOf: (observations: Observations) => string,
  clockOf: (simTimeS: SimTime) => string,
  /**
   * The report's own judgement of one run — its verdict and its readings against the sheet's goals —
   * for {@link dayCallGapSentenceOf} (wave AO, lane DR-1, [§ D1433](../../../../DECISIONS.md)).
   * Absent, the row says nothing about the count's favourite.
   */
  judgeOf?: (observations: Observations) => DayCallRunJudgement,
): ReportDiagnosis {
  const at = clockOf(record.atS);
  const question = record.question ?? 'placement';
  const names = record.drivers;
  const answers = dayCallAnswersOf(question);
  const wordsOf = (answer: DayCallAnswer): string =>
    question === 'driver' && names !== undefined ? driverWordsOf(answer, names) : answerWordsOf(answer);
  const what = ((): string => {
    if (record.answer === 'skipped') return PRESS_CALL_SKIPPED_WHAT;
    if (question === 'driver' && names !== undefined) {
      return record.answer === 'leave'
        ? `The stage asked who drives, and you kept ${names.leave} driving`
        : `The stage asked who drives, and you switched to ${record.answer === 'driver-a' ? names['driver-a'] : names['driver-b']}`;
    }
    return record.answer === 'leave'
      ? 'The stage called the day, and you left the cars as they were'
      : `The stage called the day, and you ${stampVerbOf({ kind: record.answer } as Parameters<typeof stampVerbOf>[0])}`;
  })();
  const grades = new Map<string, DayCallAnswer[]>();
  for (const answer of answers) {
    const observations = record.observations[answer];
    if (observations === undefined) continue;
    const line = gradeOf(observations);
    grades.set(line, [...(grades.get(line) ?? []), answer]);
  }
  const verdict =
    grades.size <= 1
      ? ''
      : ` The day read ${listOf(
          [...grades.entries()].map(([line, answered]) => `${line} with ${listOf(answered.map(wordsOf))}`),
        )}.`;
  const gap = judgeOf === undefined ? undefined : dayCallGapSentenceOf(record, judgeOf);
  return {
    id: dayCallRowIdOf(index),
    when: at,
    what,
    why:
      'On this crowd the day was run three ways from the call, with every press before it kept and ' +
      `nothing pressed after it. ${dayCallCountsLineOf(record, clockOf)}${verdict}${gap === undefined ? '' : ` ${gap}`} ` +
      DAY_CALL_ROW_NOTE,
    tone: 'plain',
  };
}

/** One run as the report judges it: the day's verdict and its readings against the sheet's goals. */
export interface DayCallRunJudgement {
  readonly verdict: 'cleared' | 'missed' | 'ungraded';
  readonly readings: readonly GoalReading[];
}

/**
 * **Where the count's favourite missed the day** — wave AO, lane DR-1,
 * [§ D1433](../../../../DECISIONS.md), swarm DR's ruling § Q1 item 3 (three of three).
 *
 * A call's row counts riders who waited a minute over ten minutes; the day is graded on its goals.
 * The panel's members measured the answer with the fewest such riders missing the day on 10 of 21
 * deciding rows (S2), 14 of 22 split rows (S3) and 20 of 55 (S1), and a player reading the row took
 * the count for the verdict. So where the answers split the day, and every answer with the fewest
 * one-minute waits missed it, the close says so and names the goal it missed with its figure:
 * *The fewest riders waited a minute with Energy aware driving, and the day missed with it: the
 * landing-queue goal read 31 against a bar of 24.* Each answer the count favoured gets its own
 * clause. No *because*: why the count and the day disagree is unmeasured. `undefined` where the
 * three agree on the day (no split to set the count against) or a fewest-count answer cleared.
 */
export function dayCallGapSentenceOf(
  record: DayCallRecord,
  judgeOf: (observations: Observations) => DayCallRunJudgement,
): string | undefined {
  const answers = dayCallAnswersOf(record.question ?? 'placement');
  const judged = answers.flatMap((answer) => {
    const observations = record.observations[answer];
    return observations === undefined ? [] : [{ answer, count: record.counts[answer] ?? 0, judgement: judgeOf(observations) }];
  });
  if (!judged.some((entry) => entry.judgement.verdict === 'cleared')) return undefined;
  const fewest = Math.min(...judged.map((entry) => entry.count));
  const favoured = judged.filter((entry) => entry.count === fewest);
  if (favoured.length === 0 || favoured.some((entry) => entry.judgement.verdict !== 'missed')) return undefined;
  const clauses = favoured.map(({ answer, judgement }) => {
    const missed = judgement.readings.find((reading) => reading.state === 'missed');
    const figure =
      missed === undefined || missed.observed === null
        ? undefined
        : `${goalPlainNameOf(missed.goal)} read ${String(missed.observed)}${missed.goal.unit} against a bar of ` +
          `${String(missed.goal.bar)}${missed.goal.unit}`;
    return { words: dayCallAnswerWordsOf(record, answer), figure };
  });
  const names = listOf(clauses.map((clause) => clause.words));
  if (clauses.length === 1) {
    const [only] = clauses;
    return `The fewest riders waited a minute with ${names}, and the day missed with it${only?.figure === undefined ? '' : `: ${only.figure}`}.`;
  }
  const figures = clauses.filter((clause) => clause.figure !== undefined).map((clause) => `with ${clause.words} ${String(clause.figure)}`);
  return `The fewest riders waited a minute with ${names}, and the day missed with each${figures.length === 0 ? '' : `: ${figures.join('; ')}`}.`;
}

/**
 * **An answer as a call's row names it** — the placement answer's own button words, or, on a driver
 * call, who drove from the call under it. Exported for the close's *call that decided it*
 * (`shift/dayClose.ts#decidingCallOf`, wave AM, lane AM-C), so that sentence and the row name
 * an answer the same way.
 */
export function dayCallAnswerWordsOf(record: DayCallRecord, answer: DayCallAnswer): string {
  const names = record.drivers;
  return (record.question ?? 'placement') === 'driver' && names !== undefined
    ? driverWordsOf(answer, names)
    : answerWordsOf(answer);
}

/**
 * **A call's three counts, in the row's own words** — the one sentence the report's row
 * ({@link dayCallRowOf}) and the stage's mid-day row (`everyday/stageCallRow.ts`, wave AL, lane
 * AL-E, [§ D1219](../../../../DECISIONS.md)) both print, so the two cannot count or order the
 * answers differently. The window and the counts only: no verdict, which is the close's.
 */
export function dayCallCountsLineOf(record: DayCallRecord, clockOf: (simTimeS: SimTime) => string): string {
  const question = record.question ?? 'placement';
  const names = record.drivers;
  const wordsOf = (answer: DayCallAnswer): string =>
    question === 'driver' && names !== undefined ? driverWordsOf(answer, names) : answerWordsOf(answer);
  const counts = dayCallAnswersOf(question).map(
    (answer) => `${String(record.counts[answer] ?? 0)} with ${wordsOf(answer)}`,
  );
  return (
    `Riders who arrived from ${clockOf(record.atS)} to ${clockOf(record.windowEndS)} and waited a minute ` +
    `or more: ${listOf(counts)}.`
  );
}

/**
 * **The row a day ended early carries** — [§ D1168](../../../../DECISIONS.md). *End the day* is
 * offered only once a goal whose miss is final reads missed on the stage, and it files the day on the
 * run already recorded: the rest of the day ran as it stood, with nothing more pressed, so every
 * figure on the sheet is the whole day's. The row says when the player stopped watching and that,
 * and nothing about what watching would have shown.
 */
export function dayEndedEarlyRowOf(atS: SimTime, clockOf: (simTimeS: SimTime) => string): ReportDiagnosis {
  const at = clockOf(atS);
  return {
    id: DAY_ENDED_EARLY_ROW_ID,
    when: at,
    what: `You ended the day early, at ${at}`,
    why:
      'A goal that cannot be met again once missed had already read missed. The rest of the day ran ' +
      'as it stood, with nothing more pressed, and the figures on this sheet are the whole day’s.',
    tone: 'plain',
  };
}

/** The ended-early row's id. */
export const DAY_ENDED_EARLY_ROW_ID = 'day-ended-early';
