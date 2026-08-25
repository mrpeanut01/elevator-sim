/**
 * What today asks — bars that harden with the day, read only from observations.
 *
 * ## Why this is a second goal vocabulary, and why that is not a duplicate
 *
 * `scenario/goals.ts` already holds a goal vocabulary, and the first thing to say is that this
 * module is **not** a replacement for it or a fork of it. They answer different questions on
 * different objects, and merging them would break the older one's central finding.
 *
 * | | `scenario/goals.ts` | this module |
 * |---|---|---|
 * | judged over | **a batch** — twenty or fifty replications of one configuration | **one day**, which is one replication |
 * | input | `BatchReplication` — a run's summary, including `unservedFraction` and `pctOverLongWait` | {@link GoalObservations} — four counts and ratios of counts |
 * | output | a **pass rate** with its `n`, classified by R12 into `batch` / `configuration-fact` / `not-shippable` | a per-day `met` / `missed` / `pending` |
 * | may it say a thing was achieved? | no — R12's trichotomy leaves no single-run category | yes, and that is the whole difference |
 *
 * `scenario/goals.ts`'s module docstring is explicit that R12 *"empties the single-run goal
 * category"* and that {@link GoalDisposition} therefore has no `single-run` member. A shift goal is
 * exactly the object R12 says may not exist — a verdict on one replication — and it is legitimate
 * here for one reason, stated so it can be attacked: **a shift goal is not a claim about a
 * dispatcher.** *"You carried 89 % of the people who turned up today"* is a statement about what
 * happened on one day, which is what the reader watched happen. It is never *"this dispatcher is
 * better"*, which needs 50–200 paired replications and an interval excluding zero, and which this
 * viewer may only say on the Compare surface (`docs/12` § 2.3, R2). The report's small print says
 * so in the reader's own words, on every single day.
 *
 * Reusing `scenario/goals.ts` here was tried on paper and refused for a concrete reason rather
 * than a taxonomic one: its five per-replication predicates read `unservedFraction`,
 * `personsPer5Min` and `pctOverLongWait` off a `BatchReplication`, none of which the live rail has
 * at playhead `t`, and three of the four bars the design draws (a carried share, a peak queue
 * depth, an abandonment count) have no kind in its table at all. Extending its `GOAL_KINDS` with
 * three per-day kinds would have put objects with no pass rate into the type `measureGoalRate`
 * consumes, and R12's classification is the thing that type exists to compute.
 *
 * ## The rule that is structural rather than stated
 *
 * {@link readGoal} takes a {@link GoalObservations}, which carries six numbers, one censoring
 * flag and **not one suppressible field** — no `meanWaitS`, no `wait95S`, no
 * `meanTimeToDestinationS`. A goal that wanted to grade a mean could not be written against this
 * type. CLAUDE.md: *"If a configuration saturates, flag it and suppress the AWT interval"*;
 * grading against the suppressed figure would be the inverse of that rule, and the handoff's own
 * footer — *"nothing on this screen is averaged over a queue that never settled"* — is what this
 * enforces. The worst wait clears that bar deliberately: it is a **maximum**, not an estimate —
 * the same classification `report.ts#worstWaitFigure` relies on to print it on a saturated run —
 * and where a maximum genuinely is unknowable (its leg unresolved) the censoring flag makes the
 * reading refuse rather than guess; see {@link readGoal}.
 *
 * {@link ShiftGoal.reads} is a **key** of that type rather than a closure for the same reason: a
 * predicate carrying its own reader can read anything it closes over.
 *
 * ## Nothing is graded before the building wakes up
 *
 * `design.html` :2382. Under {@link WAKE_UP_ARRIVALS} arrivals every reading is `pending` and
 * renders `—`. Modelled as its own state and not as `met: false`, because an empty morning is not
 * a failure — a `carryPct` of 100 % over three riders is arithmetic, not competence, and a
 * `peakQueue` of 0 before anybody arrived is not a queue held under control. A boolean cannot tell
 * the two apart; a three-valued state can, and `week.ts` treats pending as *not met* when it counts
 * a clean day, which is `campaign/judge.ts`'s rule (*unjudged is not passed*) at a smaller scale.
 */

import {
  WAKE_UP_ARRIVALS,
  type DayOutcome,
  type GoalObservations,
  type GoalReading,
  type GoalState,
  type RunHorizon,
  type ShiftGoal,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The bars, and how they harden
 * -------------------------------------------------------------------------- */

/**
 * What the worst-wait ceiling is multiplied by when the day being graded is a **whole authored
 * day** rather than a thirty-minute slice of one — `shift/dayLength.ts`, and the one bar the day's
 * length moves.
 *
 * ## Why exactly one of the four bars carries this, and it is not the one you would guess
 *
 * Two of the four read a **share** (`carryPct`, `minutePct`) and two read a **maximum**
 * (`peakQueue`, `worstWaitS`). The obvious expectation is that both maxima grow with the horizon —
 * a maximum over twenty times the wall clock is a maximum over twenty times the opportunities — and
 * **for the queue that expectation is measured and refuted.** Ten seeds per cell, day 1, the
 * shipped defaults, thirty-minute `rise-and-fall` against the whole ten-hour `office-day`, median
 * `peakQueue`:
 *
 * | building | slice | whole day |
 * |---|---|---|
 * | Midtown Office | 216 | 229 |
 * | Secure Tower | 32 | 31 |
 * | Chancery House | 25 | **16** |
 * | Garden Apartments | 4 | 7 |
 *
 * No direction, let alone a factor — a deep queue is made by a peak, and a day contains the same
 * peaks a slice does. **So the queue bar does not move**, and a lane that had scaled both because
 * both are maxima would have loosened a real test on no evidence.
 *
 * The worst wait does move, and consistently: 1 522 → 2 804, 150 → 310, 79 → 161, 29 → 60 on the
 * same four cells — ratios of **1.84, 2.07, 2.04 and 2.07**. The mechanism is not extra sampling
 * either: a slice **truncates its own tail** and a day does not. A thirty-minute run ends while the
 * morning backlog is still draining, so the longest wait it can record is bounded by the run; the
 * day's morning backlog drains into a continuing 0.25 inter-peak flow and records what it actually
 * cost. The same dispatcher on the same building looks worse purely because you watched longer,
 * which is `CLAUDE.md`'s own warned failure mode — *a mean can move because the window moved* —
 * arriving at a maximum instead of a mean.
 *
 * **`2` rather than a fitted figure**, and the spread is why: four buildings give 1.84–2.07 and a
 * third decimal would claim a precision four buildings do not support. The run is
 * `shiftRunConfigOf` at seeds `20 260 824 + 7 919 n`, `n = 0…9`, day 1, `collective`, folded
 * through `observationsAt(recording, recording.endedAt)`.
 *
 * **It is a step and not a curve, deliberately.** Two horizons were measured because the product
 * offers two kinds of run — a period, and a whole authored day — and a curve through two points is
 * a curve nobody measured. It is keyed on *is this a whole day* rather than on a number of seconds
 * for the same reason: a 7 200 s `constant-iso` is a longer *slice*, it truncates its tail exactly
 * as a shorter one does, and giving it a day's allowance would be interpolating a mechanism that is
 * not about length.
 *
 * **What it is for is invariance, not generosity.** § D345 forbids a difficulty setting from moving
 * the bar a run is judged against, and `docs/33` § 1.4's third reason says freezing a bar across a
 * change is *"a silent difficulty change in both directions"*. Leaving the ceiling at 230 s while
 * the horizon grew twentyfold is exactly that, in the harder direction, chosen by nobody: measured
 * with the ceiling fixed, Secure Tower's day 1 goes from **4 of 10 seeds missing something to 9 of
 * 10**, entirely on this bar — outside `docs/33` DC-4's one-third-to-two-thirds band, which 4 of 10
 * sits inside. At `2` the bar misses on the whole day exactly what it missed on the slice, on all
 * four cells, which is the property `goals.test.ts` pins.
 *
 * A decision number is owed.
 */
const WORST_WAIT_WHOLE_DAY_FACTOR = 2;

/**
 * The design's own hardening arithmetic (`design.html` :1428–1439), plus the worst-wait ceiling
 * the casual handoff's fourth test needs (`GAMEPLAY_AND_NAVIGATION.md` § 8.6, § 20.6).
 *
 * Four ceilings and a floor, and each cap is what stops the week becoming unwinnable: the
 * away-inside-a-minute bar tops out at 84 %, the carried bar at 96 %, the queue depth bottoms out
 * at 12, and the worst-wait ceiling bottoms out at 150 s. A bar that kept hardening would
 * eventually ask for a building that cannot exist, and the design's framing — *"No losing — just
 * a line you are trying to bend upward"* — would stop being true.
 *
 * The worst-wait numbers are bracketed by the handoff's own difficulty table rather than
 * invented: § 8.6 asks 240 s of Easy, 180 s of Standard, 150 s of Hard and 120 s of the tier it
 * names *Impossible*. So the week opens just under Easy (240 − 10 = 230 s on day 1), hardens by
 * 10 s a day in the pattern the other three bars established, and stops at Hard's 150 s —
 * deliberately short of the Impossible tier, because a floor is the promise that the line stays
 * bendable and a tier named Impossible is the wrong promise to converge on.
 */
export const GOAL_BARS = Object.freeze({
  minuteMax: 84,
  minuteBase: 58,
  minutePerDay: 3,
  carryMax: 96,
  carryBase: 86,
  carryPerDay: 1,
  queueMin: 12,
  queueBase: 34,
  queuePerDay: 2,
  worstMinS: 150,
  worstBaseS: 240,
  worstPerDayS: 10,
  worstWholeDayFactor: WORST_WAIT_WHOLE_DAY_FACTOR,
});

/**
 * Today's goals — the handoff's four tests, every day, in tension (§ 8.6).
 *
 * ## The `day % 2` alternation is retired, and here is the argument
 *
 * This function used to return three goals: carry, minute, and a third that alternated — even
 * days a queue-depth ceiling, odd days *nobody waits past the 15-minute horizon* (`abandoned`,
 * bar 0). The alternation's stated reason was that *"three inverted bars on a bad day is a wall
 * rather than a brief"*, and that reason still binds: this set has exactly two inverted bars, not
 * three, so retiring the alternation does not rebuild the wall.
 *
 * What retired it is the worst-wait ceiling subsuming the horizon goal outright. Every shipped
 * worst-wait bar is 150–230 s and the abandonment horizon is 900 s, so on any graded day the
 * ceiling is the stricter test of the same tail: a day that keeps its worst wait under 230 s
 * abandoned nobody by construction, and a day that abandoned anybody has a worst wait past 900 s
 * and misses the ceiling. Alternating the two would therefore alternate a strong test with a
 * test it implies — the week's difficulty would see-saw by parity while claiming to harden — and
 * § 20.6's own check (*a day that peaks the lobby at 26 against a cap of 25 is missed*) fails on
 * every day the queue goal sat out. Four tests, each load-bearing, every day, is what § 8.6
 * specifies; the odd-day goal survives where it belongs, as the report's *took the stairs*
 * figure and the add-a-car lever, both of which still read `Observations.abandoned`.
 *
 * (`GOAL_OBSERVATION_IDS` keeps `'abandoned'` so restored histories that carry the retired
 * goal's readings stay restorable — see its docstring.)
 *
 * A decision number is owed for the retirement; this docstring is the argument.
 *
 * ## The second argument, and why it is not a difficulty setting
 *
 * `over` says **what kind of run today is** — a period, or a whole authored day
 * (`shift/dayLength.ts`). It exists because § AB gave the Everyday daily loop the ten-hour
 * `office-day` in place of a thirty-minute `rise-and-fall`, and *a goal measured over thirty
 * minutes is not a goal over ten hours.* Exactly one bar moves and
 * {@link WORST_WAIT_WHOLE_DAY_FACTOR} carries the measurement, the mechanism and the refutation of
 * the other three.
 *
 * It is **not** the thing § D345 forbids. Every player on a whole day meets the same bar and every
 * player on a slice meets the same bar; what differs is the run, not the person. `docs/33` § 4.4's
 * W4 says the distinction outright — *"changing what day 5 asks of everybody is a design change to
 * the curve; changing what day 5 asks of an Easy player specifically is the thing § D345 forbids"*.
 * This is the first kind, and holding the ceiling still across a twentyfold change of horizon would
 * have been the second kind arriving by accident.
 *
 * **`'period'` is the default and that is a decision rather than a convenience.** Three of the
 * eight shipped buildings have no authored day and never will until one is written for their crowd,
 * so a slice is the majority case, and every published figure in this repository was graded as one.
 * The default also keeps two callers this lane may not edit — `dev/leftRail.ts` and `dev/main.ts` —
 * compiling and grading a slice exactly as before; **they are not yet horizon-aware, and that is a
 * named gap rather than a silent one.** See the lane report and this module's colocated test.
 *
 * Pure in its arguments, so the same day of the same week over the same kind of run always asks the
 * same thing.
 */
export function goalsForDay(
  day: number,
  over: RunHorizon = 'period',
): readonly ShiftGoal[] {
  const minuteBar = Math.min(
    GOAL_BARS.minuteMax,
    GOAL_BARS.minuteBase + day * GOAL_BARS.minutePerDay,
  );
  const carryBar = Math.min(GOAL_BARS.carryMax, GOAL_BARS.carryBase + day * GOAL_BARS.carryPerDay);
  const queueBar = Math.max(GOAL_BARS.queueMin, GOAL_BARS.queueBase - day * GOAL_BARS.queuePerDay);
  /*
   * The ladder first, the horizon second — so the day still hardens by 10 s and still floors, and
   * the allowance scales the bar the ladder arrived at rather than replacing it. The other order
   * would floor a whole day at 150 s and hand back the difficulty change this argument exists to
   * prevent.
   */
  const worstBar =
    Math.max(GOAL_BARS.worstMinS, GOAL_BARS.worstBaseS - day * GOAL_BARS.worstPerDayS) *
    (over === 'whole-day' ? GOAL_BARS.worstWholeDayFactor : 1);

  const carry: ShiftGoal = {
    id: 'carry',
    label: `Carry ${String(carryBar)}% of the people who turn up`,
    unit: '%',
    bar: carryBar,
    compare: 'at-least',
    reads: 'carryPct',
  };
  const minute: ShiftGoal = {
    id: 'minute',
    label: `Get ${String(minuteBar)}% of riders away inside a minute`,
    unit: '%',
    bar: minuteBar,
    compare: 'at-least',
    reads: 'minutePct',
  };
  /*
   * *A landing*, deliberately, where the handoff's test 3 says *the lobby* — and the sentence
   * says what the code does (§ D227), so the word "lobby" may not appear here while `peakQueue`
   * is a maximum over **every** landing. Any-landing is kept rather than narrowed, for three
   * reasons stated so they can be attacked. It is strictly the harder test: the lobby's peak is
   * one term of the maximum, so § 20.6's check — a lobby that peaks at 26 against a cap of 25 —
   * misses under this goal a fortiori. It matches what the reader is shown: the alarm chip and
   * the report's DEEPEST QUEUE name whichever floor stacked worst (`peakQueueFloorId` is carried
   * for exactly that), and a goal that graded only the ground floor while the chip pointed at
   * Level 12 would be two screens disagreeing about what the day was asked. And a lobby-only
   * goal would let every upper landing stack unbounded without a miss — on the shipped mixed-use
   * and residential buildings the pressure floor routinely is not the lobby, so the narrowing
   * would un-grade the very failure the test exists to catch.
   */
  const queue: ShiftGoal = {
    id: 'queue',
    label: `Never let a landing stack past ${String(queueBar)} people`,
    unit: '',
    bar: queueBar,
    compare: 'at-most',
    reads: 'peakQueue',
  };
  // *Inside*, not *under*: `at-most` meets the bar at the bar, and a label that said "under
  // 230 s" about a day whose worst wait was exactly 230 s would claim a strictness the
  // comparison does not have — § D227's rule at the scale of one preposition.
  //
  // *Across the whole shift* is on the label because the sheet carries a second worst wait —
  // the WORST WAIT cell, `summary.serviceLevel.longestWaitS`, which is the reporting window's
  // and legitimately larger or smaller on the same day. Two figures called "worst wait" four
  // inches apart, reconciled only in the small print, is `docs/19` defect 3's second half; each
  // now names its window where it stands (the cell's note carries the other label).
  const worst: ShiftGoal = {
    id: 'worst-wait',
    label: `Keep the worst wait inside ${String(worstBar)} s across the whole shift`,
    unit: ' s',
    bar: worstBar,
    compare: 'at-most',
    reads: 'worstWaitS',
  };

  return Object.freeze([carry, minute, queue, worst]);
}

/* -------------------------------------------------------------------------- *
 * Reading one
 * -------------------------------------------------------------------------- */

/** The em dash the design prints for an ungraded goal (`design.html` :2383). */
export const PENDING_DISPLAY = '—';

/**
 * The glyphs. `✓` and `·` match `design.html` :2383–2391; the missed mark is the casual
 * handoff's `×` (§ 8.3, § 8.6, § 20.6 — *"the calendar draws an ×"*) rather than the older
 * prototype's `○`, because the handoff wins every disagreement about what the screen looks like
 * and it draws missed as a cross everywhere it draws it at all. `○` also collided with three
 * other vocabularies on the same screens — the scenarios panel's *not started*, the building
 * editor's *unzoned* and the mood rows' calm — all of which mean something neutral, which is the
 * one thing a missed day is not.
 *
 * A glyph is never the **only** signal — {@link GoalReading} also carries {@link GoalState}, and
 * the definition of done's clause 8 (KB-15) forbids a colour-only signal. The rail draws the state
 * word beside the glyph; the glyph is the shorthand, not the message.
 */
export const GOAL_GLYPHS: Readonly<Record<GoalState, string>> = Object.freeze({
  met: '✓',
  missed: '×',
  pending: '·',
});

/**
 * Read one goal against one set of observations.
 *
 * Total: every goal gets an answer and nothing throws. The `pending` branch is checked **first**,
 * before the observation is even read, so a quiet morning cannot produce a `met` by arithmetic.
 *
 * ## The second gate: a censored worst wait is not graded, in either direction
 *
 * A goal reading `worstWaitS` while {@link GoalObservations.worstWaitIsCensored} is `pending`,
 * whatever the number says. Half of that is the ordinary censoring argument — the wait belongs to
 * somebody still standing, so it is a lower bound, and a lower bound under the bar cannot prove
 * `met`. The other half is why the *provable-looking* direction is refused too: a bound past the
 * bar looks like a certain `missed`, but the recording carries no `abandonedAt`, so an
 * "unresolved" leg may belong to a rider who walked out long ago and whose true wait was short
 * (`live/types.ts#LiveObservations.worstWaitIsCensored` owns that argument). A bound that might
 * overstate proves nothing, so both directions read `pending` — which `week.ts` already treats
 * correctly: unjudged is not passed, and not failed either.
 */
export function readGoal(goal: ShiftGoal, observations: GoalObservations): GoalReading {
  if (observations.arrived < WAKE_UP_ARRIVALS) {
    return {
      goal,
      state: 'pending',
      observed: null,
      display: PENDING_DISPLAY,
      progressPct: 0,
      glyph: GOAL_GLYPHS.pending,
    };
  }
  if (goal.reads === 'worstWaitS' && observations.worstWaitIsCensored) {
    return {
      goal,
      state: 'pending',
      observed: null,
      display: PENDING_DISPLAY,
      progressPct: 0,
      glyph: GOAL_GLYPHS.pending,
    };
  }

  const observed = observations[goal.reads];
  const met = goal.compare === 'at-most' ? observed <= goal.bar : observed >= goal.bar;
  const state: GoalState = met ? 'met' : 'missed';
  return {
    goal,
    state,
    observed,
    display: `${String(observed)}${goal.unit}`,
    progressPct: progressOf(goal, observed),
    glyph: GOAL_GLYPHS[state],
  };
}

/** Every goal, in order. A convenience, and the shape both the rail and the report want. */
export function readGoals(
  goals: readonly ShiftGoal[],
  observations: GoalObservations,
): readonly GoalReading[] {
  return goals.map((goal) => readGoal(goal, observations));
}

/**
 * How full the bar is, `0`–`100` — the design's own formula (`design.html` :2387–2389).
 *
 * An inverted goal with a bar of zero (*nobody waits past the horizon*) has no gradient to show:
 * one abandonment is the whole failure, so the bar is full or empty. Every other inverted goal
 * fills as the observed value falls away from the ceiling.
 *
 * The bar is decoration and the {@link GoalReading.state} is the verdict. They are computed
 * separately on purpose: rounding a percentage for a 4 px bar must never be able to move a
 * met/missed decision.
 */
function progressOf(goal: ShiftGoal, observed: number): number {
  if (goal.compare === 'at-most') {
    if (goal.bar === 0) return observed > 0 ? 0 : 100;
    return Math.round(Math.max(0, 100 - (observed / Math.max(1, goal.bar)) * 100));
  }
  if (goal.bar === 0) return 100;
  return Math.round(Math.min(100, (observed / goal.bar) * 100));
}

/**
 * The rail's footer line (`design.html` :2375).
 *
 * Verbatim in both branches, including the lower-case opening — it sits under a hairline in 10.5 px
 * monospace and reads as a caption rather than a sentence.
 */
export function bestLineFor(observations: GoalObservations, bestMinutePct: number): string {
  if (observations.arrived < WAKE_UP_ARRIVALS) {
    return 'not enough riders yet — nothing graded before the building wakes up';
  }
  return `best day ${String(bestMinutePct)}%`;
}

/* -------------------------------------------------------------------------- *
 * Last night's figure
 * -------------------------------------------------------------------------- */

/**
 * What this goal's quantity measured on the building's **previous day**, or the em dash.
 *
 * The handoff's "was" figures (§ 8.6): *"last night's actual result for this building, not a
 * constant. If there is no previous day, they read `—`."* This is the one derivation both
 * renderers call — the rail's goal rows and the report sheet's — so the two screens cannot show
 * two different yesterdays. See {@link GoalLine} for why the string is derived at draw time
 * rather than stored beside the reading.
 *
 * Three deliberate choices:
 *
 * - **The previous day is found by day number**, `entry.day === day - 1`, never as
 *   `history[history.length - 1]`. While a day is being played, yesterday *is* the last entry —
 *   but the moment today is closed and re-closed (the retry loop `WeekState.attempt` models),
 *   the last entry is today, and a "was" that read it would show this attempt's own figures as
 *   last night's.
 * - **Matched on {@link ShiftGoal.reads}**, not on the goal's id or bar: the bar hardens
 *   nightly, so yesterday's goal is a different object asking about the same quantity — and the
 *   quantity is what *"what it was last time"* means. A history written before a goal existed
 *   (a restored session from the three-goal build) simply has no reading for it, and answers
 *   the em dash rather than a stand-in.
 * - **The previous reading's own {@link GoalReading.display} is returned**, not a re-format of
 *   its `observed`: one formatting decision, made where the reading was made. A pending
 *   yesterday therefore reads `—` here too, which is honest — an ungraded morning measured
 *   nothing worth quoting tonight.
 */
export function wasDisplayOf(
  history: readonly DayOutcome[],
  day: number,
  goal: ShiftGoal,
): string {
  const previous = history.find((entry) => entry.day === day - 1);
  const reading = previous?.readings.find((entry) => entry.goal.reads === goal.reads);
  return reading?.display ?? PENDING_DISPLAY;
}
