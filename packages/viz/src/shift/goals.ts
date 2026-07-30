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
 * {@link readGoal} takes a {@link GoalObservations}, which carries five numbers and **not one
 * suppressible field** — no `meanWaitS`, no `wait95S`, no `meanTimeToDestinationS`. A goal that
 * wanted to grade a mean could not be written against this type. CLAUDE.md: *"If a configuration
 * saturates, flag it and suppress the AWT interval"*; grading against the suppressed figure would
 * be the inverse of that rule, and the handoff's own footer — *"nothing on this screen is averaged
 * over a queue that never settled"* — is what this enforces.
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
  type GoalObservations,
  type GoalReading,
  type GoalState,
  type ShiftGoal,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The bars, and how they harden
 * -------------------------------------------------------------------------- */

/**
 * The design's own hardening arithmetic (`design.html` :1428–1439), unchanged.
 *
 * Three ceilings and a floor, and each of the three caps is what stops the week becoming
 * unwinnable: the away-inside-a-minute bar tops out at 84 %, the carried bar at 96 %, and the
 * queue depth bottoms out at 12. A bar that kept hardening would eventually ask for a building
 * that cannot exist, and the design's framing — *"No losing — just a line you are trying to bend
 * upward"* — would stop being true.
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
});

/**
 * Today's goals: two every day, plus one that alternates.
 *
 * The alternation is the design's (`day % 2`): even days ask you to hold a landing's depth, odd
 * days ask that nobody crosses the abandonment horizon. Both are inverted goals — a number you are
 * trying to keep **down** — and they are alternated rather than both shown because three inverted
 * bars on a bad day is a wall rather than a brief.
 *
 * Pure in `day`, so the same day of the same week always asks the same thing.
 */
export function goalsForDay(day: number): readonly ShiftGoal[] {
  const minuteBar = Math.min(
    GOAL_BARS.minuteMax,
    GOAL_BARS.minuteBase + day * GOAL_BARS.minutePerDay,
  );
  const carryBar = Math.min(GOAL_BARS.carryMax, GOAL_BARS.carryBase + day * GOAL_BARS.carryPerDay);
  const queueBar = Math.max(GOAL_BARS.queueMin, GOAL_BARS.queueBase - day * GOAL_BARS.queuePerDay);

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
  const third: ShiftGoal =
    day % 2 === 0
      ? {
          id: 'queue',
          label: `Never let a landing stack past ${String(queueBar)} people`,
          unit: '',
          bar: queueBar,
          compare: 'at-most',
          reads: 'peakQueue',
        }
      : {
          id: 'stairs',
          label: 'Nobody waits past the 15-minute horizon',
          unit: '',
          bar: 0,
          compare: 'at-most',
          reads: 'abandoned',
        };

  return Object.freeze([carry, minute, third]);
}

/* -------------------------------------------------------------------------- *
 * Reading one
 * -------------------------------------------------------------------------- */

/** The em dash the design prints for an ungraded goal (`design.html` :2383). */
export const PENDING_DISPLAY = '—';

/**
 * The glyphs, matching `design.html` :2383–2391.
 *
 * A glyph is never the **only** signal — {@link GoalReading} also carries {@link GoalState}, and
 * the definition of done's clause 8 (KB-15) forbids a colour-only signal. The rail draws the state
 * word beside the glyph; the glyph is the shorthand, not the message.
 */
export const GOAL_GLYPHS: Readonly<Record<GoalState, string>> = Object.freeze({
  met: '✓',
  missed: '○',
  pending: '·',
});

/**
 * Read one goal against one set of observations.
 *
 * Total: every goal gets an answer and nothing throws. The `pending` branch is checked **first**,
 * before the observation is even read, so a quiet morning cannot produce a `met` by arithmetic.
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
