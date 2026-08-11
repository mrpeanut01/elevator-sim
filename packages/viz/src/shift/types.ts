/**
 * The shift layer's shapes: what today asks of you, what today throws at you, and what clearing a
 * day hands back.
 *
 * ## What a "shift" is, and why it is a layer rather than a screen
 *
 * The viewer's primary object has been *a run* — you configure one and press Run. The design
 * handoff's primary object is *a shift*: you are running a building through a day, the building
 * grows overnight, something happens today that did not happen yesterday, and the day is graded
 * against bars that harden as the week goes on. None of that is a rendering concern, so none of it
 * is in `render/` or `dev/`. This directory is the pure state layer underneath it —
 * `docs/12-design-handoff.md` § 3 stage 4 — and it has no DOM, no clock and no `node:` import.
 *
 * ## The one rule the whole directory is built around
 *
 * **A goal reads an observation. Never a mean, and never anything `awtIsValid` could suppress.**
 *
 * {@link GoalObservations} is the structural form of that rule. It is the *only* type
 * `readGoal` accepts, and it carries six numbers and a censoring flag. Four of the numbers are
 * the design's own (`design.html` :1428–1439): a carried share, an away-inside-a-minute share, a
 * peak queue depth and an abandonment count; the fifth gradeable one is the worst wait the
 * casual handoff's fourth test grades (§ 8.6). There is no `meanWaitS` on it, no `wait95S`, no
 * `meanTimeToDestinationS` — so a goal that wanted to grade a suppressible estimate could not be
 * written against this type without changing the type, which is a visible diff and a decision
 * somebody has to make out loud. CLAUDE.md: *"If a configuration saturates, flag it and suppress
 * the AWT interval."* A grading rule that read the suppressed figure would be that rule's exact
 * inverse, and the handoff's own footer says so: *"nothing on this screen is averaged over a queue
 * that never settled"*.
 *
 * {@link Observations} widens it with the facts the **report** needs — the floor and instant of
 * the deepest queue, the served-leg denominator — and widens it with nothing suppressible either,
 * because the report's one suppressible figure comes off {@link VizSummary} directly and is gated
 * there rather than laundered through here.
 *
 * ## Where {@link Observations} comes from
 *
 * From `packages/viz/src/live/`, the live-read layer (§ 3 stage 2), which is a different lane and
 * does not exist as this file lands. **This interface is therefore a declaration of what the shift
 * layer needs, not a second implementation of it**: nothing in this directory computes an
 * observation from a recording, and nothing here may start to. When the two directories are
 * reconciled, this interface either becomes an import from `live/` or `live/` produces exactly
 * this shape — the one thing that must not happen is two functions that both fold a recording into
 * a queue depth, which is the "one source of truth" rule this repository has had to restate at
 * every layer.
 *
 * ## `pending` is a state, not a false
 *
 * `design.html` :2382 refuses to grade anything before the building wakes up: under
 * {@link WAKE_UP_ARRIVALS} arrivals every goal reads `—`. That is modelled as
 * {@link GoalState} `'pending'` rather than as `met: false`, because an empty morning is not a
 * failure and a boolean cannot tell the difference. `allMet` on a {@link DayOutcome} is false when
 * anything is pending — unjudged is not passed, exactly as `campaign/judge.ts` has it — but the
 * *reason* survives to the screen.
 */

import type { AwtInvalidGround, DirectionalSplit, SimTime } from '@elevator-sim/core/browser';

// Types only, and from the one module in `watch/` that imports nothing but `core` — so a day
// carrying a record costs `shift/` no dependency on the viewer's state, its resources or its
// scope table. `watch/types.ts` holds the shape; `watch/record.ts` holds the derivation, and
// `DayOutcome.record` says why the two are apart.
import type { WatchRecord } from '../watch/types.js';

/* -------------------------------------------------------------------------- *
 * The week's calendar
 * -------------------------------------------------------------------------- */

/**
 * The design's own weekday names (`design.html` :968), and the **only** calendar in this layer.
 *
 * `dayIdx` everywhere below is an index into this array. There is no `Date` anywhere in this
 * directory and there must not be: CLAUDE.md invariant 3 keeps the wall clock out of `core`, and
 * `boundaries.test.ts` keeps it out of everything in this package except `playback/clock.ts`. A
 * week that read the machine's date would also make every test depend on the day it ran.
 */
export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** `dayIdx` wrapped into {@link WEEKDAYS}, so a caller cannot index past the end. */
export function weekdayOf(dayIdx: number): Weekday {
  const wrapped = ((Math.trunc(dayIdx) % WEEKDAYS.length) + WEEKDAYS.length) % WEEKDAYS.length;
  // Non-null: `wrapped` is in `[0, WEEKDAYS.length)` by construction.
  return WEEKDAYS[wrapped] as Weekday;
}

/* -------------------------------------------------------------------------- *
 * Scenarios
 * -------------------------------------------------------------------------- */

/**
 * One of the design's five scenarios, bound to one of the five shipped buildings.
 *
 * Every prose field is the handoff's (`design.html` :1381–1417), corrected where it quotes a figure
 * `data/buildings/` contradicts — see `contracts.ts` for the four and the file's own numbers
 * (issue #37). The one thing the handoff hard-codes and this type does not carry is the
 * building's stat line — *"21 floors · 4 cars · 2.5 m/s · 1,710 people"* — because
 * `docs/12-design-handoff.md` § 4.4 requires it be generated from the building JSON rather than
 * authored. See `statLineOf`.
 */
export interface ScenarioContract {
  /** `c1`…`c5`, the handoff's own ids. Stable across a rename of the building. */
  readonly id: string;
  /** A building id in `data/buildings/`. Asserted to resolve in `contracts.test.ts`. */
  readonly buildingId: string;
  /** `Scenario 1`. The eyebrow. */
  readonly label: string;
  readonly title: string;
  /** What this building teaches that none of the others can. */
  readonly teaches: string;
  readonly brief: string;
  /** Clean shifts that bank toward clearing it. 1–3. */
  readonly needClean: number;
  readonly reward: string;
  /**
   * The shift this scenario is **graded over**, in simulated seconds — or absent for the shipped
   * default. § D234, issue #27.
   *
   * ## Why a contract may name one at all
   *
   * Nothing is graded below {@link WAKE_UP_ARRIVALS} arrivals, and Garden Apartments does not reach
   * twenty in thirty minutes. **Measured, not argued**: over twelve seeds at the shipped defaults —
   * day 1, `collective`, the building's own demand, 1 800 s — the arrival counts are
   * `8, 13, 14, 17, 17, 18, 18, 19, 20, 20, 26, 35`. The median is 18 and **seven of twelve fall
   * below the threshold**, which is why the play-tester's two perfect days both read *"Shift
   * missed. Streak reset."* over 18/18 and 15/15 carried at 100 % away inside a minute. At 3 600 s
   * the same twelve seeds give `20, 24, 28, 32, 36, 38, 40, 42, 45, 48, 49, 51` — every one of them
   * graded.
   *
   * So the designated tutorial was, on its own shipped defaults, unwinnable more often than not,
   * and the remedy was a dropdown two controls to the left presented as a convenience about how
   * long you want to watch.
   *
   * ## Why the threshold was not lowered instead, which was the obvious other fix
   *
   * Because it would be the wrong repair, and wrong in this project's own terms. The bars a shift
   * is graded on are a carried **share** and a served-inside-a-minute **share**; grading those over
   * eight legs is exactly the thin sample `awtIsValid` exists to refuse, one layer up. Twenty is
   * already generous. What was wrong was the amount of demand the tutorial was asked to produce,
   * not the amount it had to produce before anyone would look.
   *
   * ## Why it seeds rather than pins
   *
   * A contract naming a length **seeds** `ViewerState.shiftLengthS` when the assignment is taken.
   * The select stays live and the player may still shorten the day — which is a real choice, and
   * `docs/12` § 4.1's whole argument for the control existing. What they may no longer do is meet
   * an ungraded morning by accident on the one scenario whose own copy says *"nothing here is
   * hard"*.
   */
  readonly shiftLengthS?: number;
}

/**
 * What a scenario card says about itself — and note what is **not** in the union.
 *
 * There is no `locked`. `design.html` :1616 returns `true` unconditionally from `algoUnlocked`
 * with the comment *"Every dispatcher is available from the start — scenarios teach, they do not
 * gate"*, and § 1.5 B4 restates it: *"Five scenarios on the five shipped buildings, **all open from
 * the start**"*. Modelling a state the design does not have is how a gate arrives by accident.
 */
export type ContractStatus = 'current' | 'cleared' | 'open';

/* -------------------------------------------------------------------------- *
 * Today's twist
 * -------------------------------------------------------------------------- */

export const SHIFT_EVENT_IDS = [
  'move-in',
  'fire-drill',
  'conference',
  'ordinary',
  'weekend',
] as const;

export type ShiftEventId = (typeof SHIFT_EVENT_IDS)[number];

/**
 * What an event **does to the simulation** — expressed in fields the engine actually reads.
 *
 * ## Why this type exists at all
 *
 * `docs/05-roadmap.md` § *Standing requirement — the integration seam has an owner* is the rule
 * this repository has broken eleven times in code and once in `data/`: a behaviour that is
 * configurable, unit-tested in isolation and never called from a shipped path passes every other
 * check and is a dead seam. An event that changed a caption and nothing else would be the twelfth,
 * and it would be the *worst* one, because the caption is a claim about the run underneath it —
 * *"Twenty minutes where the whole building wants to be in the lobby at once"* printed over a run
 * whose directional split never moved is the same failure the honesty card exists to prevent, one
 * layer up.
 *
 * So every field here names something in `SimulationDemandOptions` or `RecordRunOptions`:
 *
 * | field | what consumes it |
 * |---|---|
 * | {@link arrivalRateMultiplier} | `SimulationDemandOptions.arrivalRatePctPop5min` |
 * | {@link directionalSplit} | `SimulationDemandOptions.directionalSplit` |
 * | {@link carsOutOfService} | `RecordRunOptions.outOfServiceCarIds`, via `Car.setMode` |
 *
 * and `shiftRunPatch` in `events.ts` turns the three into the two values a run is actually built
 * from. `events.test.ts` runs each event against a no-event control and asserts the run differs in
 * the way the event claims — which is the assertion a caption cannot pass.
 *
 * ## Why `changesNothing` is a field and not an absence
 *
 * `ordinary` really does change nothing, and it must say so rather than leave a reader to infer it
 * from three `null`s and a zero. An absence is indistinguishable from an oversight; § D106's
 * argument about `measured: false` versus `0` is the same argument about a different quantity.
 */
export interface EventEffect {
  /**
   * `true` on exactly one event, and it is a claim rather than a shrug: this event is *designed*
   * to leave the run alone. `events.test.ts` asserts the run is bit-identical to the control.
   */
  readonly changesNothing: boolean;
  /**
   * Multiplies the rate the run would otherwise have used, or `null` for *leave it alone*.
   *
   * A multiplier rather than an absolute rate, because the absolute rate belongs to the building's
   * traffic profile and hard-coding one here would make `fire-drill` mean a different thing on
   * Garden Apartments than on Vertical City. `baseDemandOf` reads the profile; this scales it.
   */
  readonly arrivalRateMultiplier: number | null;
  /** Replaces the split entirely, or `null` for *leave it alone*. Shares sum to 1. */
  readonly directionalSplit: DirectionalSplit | null;
  /** How many cars stand out of service for the whole shift. `0` on four of the five. */
  readonly carsOutOfService: number;
  /**
   * A car away for **part** of the run, and back before it ends — or `null`.
   *
   * The distinction from {@link carsOutOfService} is the whole of what an incident is. A car held for
   * the whole shift is *not in the building today*; a car that leaves and returns is a loss the group
   * has to absorb and then re-balance around, which is a different problem to dispatch and the one a
   * player can actually plan for.
   *
   * Expressed as fractions of the run rather than as a clock time, because a shift is 15 to 120
   * minutes from a 06:00 start and the design's own *"until 11:30"* names an hour no shipped shift
   * length contains — the same correction § D175 made to the fire drill's *"14:00"*.
   *
   * Reaches the engine as `BuildingConfig.serviceEvents` through `shift/incidents.ts`, which is that
   * field's first non-test caller anywhere in this repository.
   */
  readonly derate: {
    readonly cars: number;
    readonly fromFraction: number;
    readonly toFraction: number;
  } | null;
  /**
   * The engine fields this effect writes, by name, for the tooltip the coach ribbon shows and for
   * `events.test.ts`'s cross-check that the struct and the patch agree. Empty for `ordinary`.
   */
  readonly writes: readonly string[];
}

/** One day's twist: the design's name and note, plus what it does to the run. */
export interface ShiftEvent {
  readonly id: ShiftEventId;
  /** Verbatim from `design.html` :1419–1426. */
  readonly name: string;
  /** Verbatim from `design.html` :1419–1426. */
  readonly note: string;
  readonly effect: EventEffect;
}

/* -------------------------------------------------------------------------- *
 * Observations — the only thing a goal is allowed to read
 * -------------------------------------------------------------------------- */

/**
 * The quantities a goal may read, by name. See the module docstring.
 *
 * `worstWaitS` joined for the handoff's four-tests-a-day (§ 8.6, § 20.6): worst wait was a report
 * figure only, and the fourth test needs it gradeable. `abandoned` **stays although no shipped
 * goal reads it any more** — `goals.ts#goalsForDay` retired the odd-day horizon goal when the
 * worst-wait ceiling subsumed it — because `persist/validate.ts` checks every restored reading's
 * `reads` against this list, and a player's saved history legitimately carries readings the
 * retired goal wrote. Removing the id would refuse every session that ever closed an odd day.
 * The *field* it names is also still read on every sheet: `report.ts`'s *took the stairs* figure
 * and its add-a-car lever both consume `Observations.abandoned`.
 */
export const GOAL_OBSERVATION_IDS = [
  'carryPct',
  'minutePct',
  'peakQueue',
  'abandoned',
  'worstWaitS',
] as const;

export type GoalObservationId = (typeof GOAL_OBSERVATION_IDS)[number];

/**
 * Everything a goal may read — **and structurally nothing that `awtIsValid` could suppress**.
 *
 * Seven fields: five gradeable, and two gates. Every gradeable one is a *count*, a ratio of
 * counts, or a maximum of measured durations: how many turned up, what share got carried, what
 * share was away inside a minute, how deep the worst landing got, how many gave up, how long the
 * worst-served rider stood. None of them is an estimate over a cohort, so none of them is refused
 * on a saturated run, so a goal can be graded on a day the building was outrun — which is the day
 * a reader most needs a verdict.
 *
 * `worstWaitS` is the one whose honesty needs a second gate. A maximum is only exact once the leg
 * it belongs to has resolved; while the worst wait on the board belongs to somebody still
 * standing, the number is a lower bound the recording cannot even promise is one (see
 * `live/types.ts#LiveObservations.worstWaitIsCensored`), so {@link worstWaitIsCensored} rides
 * beside it and `goals.ts#readGoal` refuses to grade the pair. It is a **gate, not a goal**: it
 * is deliberately not in {@link GOAL_OBSERVATION_IDS}, exactly as {@link arrived} is not.
 *
 * See the module docstring for why this type's *shape* is the enforcement and not a comment.
 */
export interface GoalObservations {
  /**
   * Legs that arrived so far. The **gate**, not a goal: under {@link WAKE_UP_ARRIVALS} every
   * reading is `pending`.
   */
  readonly arrived: number;
  /** Delivered legs as a percentage of arrivals, `0`–`100`. `100` when nobody has arrived. */
  readonly carryPct: number;
  /** Served legs whose wait was under 60 s, as a percentage of served legs, `0`–`100`. */
  readonly minutePct: number;
  /** The deepest a single landing has stacked, in people. */
  readonly peakQueue: number;
  /** Legs that crossed the 900 s abandonment horizon. The handoff calls them *took the stairs*. */
  readonly abandoned: number;
  /**
   * The longest wait known so far, whole seconds. `0` when nobody has arrived — never displayed
   * or compared there, because {@link arrived} is then under {@link WAKE_UP_ARRIVALS}.
   *
   * Projected from `live/`'s playhead fold, **never** from `summary.serviceLevel.longestWaitS`:
   * the rail draws goal readings at any playhead, and the summary's figure is true only of the
   * run's reporting window — publishing it mid-run is the violation class the honesty sweep's
   * temporal axis exists to find (§ D307). The two are two stated cohorts even at day close,
   * and not as an edge case: **every** shipped template narrows its reporting window
   * (`live/observations.test.ts` measured 0 of 8 spanning), so this goal grades the whole
   * shift while the WORST WAIT cell reports the window, and the sheet's small print says which
   * figure is which.
   */
  readonly worstWaitS: number;
  /**
   * Whether {@link worstWaitS} belongs to a leg not yet resolved — the second gate. A censored
   * maximum grades neither `met` nor `missed`; see the interface docstring and `readGoal`.
   */
  readonly worstWaitIsCensored: boolean;
}

/**
 * {@link GoalObservations} plus the facts the **report** needs and a goal does not.
 *
 * Supplied by `packages/viz/src/live/` — see the module docstring. Nothing suppressible is here
 * either: the report's one suppressible figure is read straight off `VizSummary` and gated there.
 */
export interface Observations extends GoalObservations {
  /** Delivered legs — `count(legs where alightedAt is set)`. {@link carryPct}'s numerator. */
  readonly carried: number;
  /** Legs that boarded. {@link minutePct}'s denominator, and R13's `n` for it. */
  readonly servedLegs: number;
  /**
   * Of {@link GoalObservations.abandoned}, the legs that were nonetheless carried — the overlap
   * between the sheet's TOOK THE STAIRS and CARRIED cells (`docs/19` defect 3).
   *
   * Carried so the sheet can make the people-accounting total: `abandoned` is an **attribute** (a
   * wait that crossed the horizon), not a disjoint outcome, and on a no-patience saturated run
   * every abandoned leg can still board and land inside `carried`. A caption that treats the two
   * cells as adding — `768 of 768 who turned up` beside `TOOK THE STAIRS 348` — cannot be
   * totalled by a reader; the note that names this overlap can.
   */
  readonly abandonedCarried: number;
  /**
   * The abandonment horizon the {@link GoalObservations.abandoned} count is drawn at, seconds —
   * `summary.serviceLevel.horizonS`, copied and never assumed, so the TOOK THE STAIRS caption
   * names this run's own line rather than a hard-coded fifteen minutes.
   */
  readonly horizonS: number;
  /** Where the deepest queue stood. `null` when no landing ever held anybody. */
  readonly peakQueueFloorId: string | null;
  /**
   * When the deepest queue stood, in **simulated seconds**.
   *
   * `null` when there was none — and the report prints `—` rather than a clock time, because
   * `docs/12` § 4.2 forbids printing a clock time the run did not have. The mockup hard-codes
   * `08:30` and `17:20`; this is what replaces them.
   */
  readonly peakQueueAtS: SimTime | null;
}

/* -------------------------------------------------------------------------- *
 * Goals
 * -------------------------------------------------------------------------- */

/** `at-least` for a share you are trying to raise, `at-most` for a depth you are trying to hold. */
export type GoalComparison = 'at-least' | 'at-most';

/**
 * One bar the day asks you to clear.
 *
 * {@link reads} is a **key of {@link GoalObservations}** rather than a closure, deliberately: a
 * predicate carrying its own reader can read anything it closes over, and the whole point of this
 * layer is that a goal cannot reach a suppressible figure. A key can only name one of
 * {@link GOAL_OBSERVATION_IDS}' five numbers, and the compiler is the thing that says so.
 */
export interface ShiftGoal {
  readonly id: string;
  /** The sentence the rail and the report both print. Built by `goalsForDay`. */
  readonly label: string;
  /**
   * `%`, ` s`, or the empty string. Appended to the observed value for display. The seconds
   * variant carries its own leading space (`187 s`, SI style with a space before the unit) so
   * `readGoal`'s one concatenation stays one concatenation.
   */
  readonly unit: '%' | ' s' | '';
  /** The bar itself, in {@link unit}. */
  readonly bar: number;
  readonly compare: GoalComparison;
  readonly reads: GoalObservationId;
}

/**
 * `pending` is its own state and is not a `false`. See the module docstring.
 *
 * `missed` rather than `failed`: the design is explicit that *"nothing here is a game over"*, and
 * the streak line it prints on a missed day says the building keeps growing either way.
 */
export type GoalState = 'met' | 'missed' | 'pending';

/** One goal, read against one set of observations. */
export interface GoalReading {
  readonly goal: ShiftGoal;
  readonly state: GoalState;
  /** The observed value, or `null` while {@link GoalState} is `pending`. Never a stand-in zero. */
  readonly observed: number | null;
  /** `87%`, `4`, or the em dash. What the rail prints in the value slot. */
  readonly display: string;
  /** `0`–`100`, for the progress bar. `0` while pending — the bar is empty, not full. */
  readonly progressPct: number;
  /** `✓`, `×` or `·` — `GOAL_GLYPHS`, whose docstring owns the `×`. Never the only signal — KB-15. */
  readonly glyph: string;
}

/**
 * One goal on the report sheet: today's reading, and last night's figure beside it.
 *
 * ## Why `was` is a sibling here and not a field of {@link GoalReading}
 *
 * The handoff (§ 8.6) puts *"what it was last time"* beside each test, read from *"the building's
 * previous day, not constants"*. That figure is derivable, always, from
 * {@link WeekState.history} — `goals.ts#wasDisplayOf` is the one derivation — and readings are
 * **persisted** inside {@link DayOutcome.readings}. Storing the derivable string beside the
 * reading would be a second answer a restored session could carry disagreeing with the history
 * under it, which is the exact shape `wasGraded`'s docstring refuses for the same struct; it
 * would also widen the persisted reading, which moves `SESSION_SCHEMA_VERSION` for a value the
 * absence already determines. So the pair exists only where a sheet is being drawn, built fresh
 * from the history each time.
 */
export interface GoalLine {
  readonly reading: GoalReading;
  /**
   * The previous day's display for the same observation — `78%`, `187 s` — or the em dash when
   * there is no previous day, or the previous day never measured this quantity, or its reading
   * was itself ungraded. Never a number invented to fill the slot.
   */
  readonly was: string;
}

/* -------------------------------------------------------------------------- *
 * The week
 * -------------------------------------------------------------------------- */

/** One finished day, as the history sparkline and the streak arithmetic need it. */
export interface DayOutcome {
  readonly day: number;
  readonly dayIdx: number;
  readonly weekday: Weekday;
  readonly eventId: ShiftEventId;
  readonly arrived: number;
  readonly carried: number;
  /** The sparkline's bar height, and the *best day so far* figure. An observation. */
  readonly minutePct: number;
  readonly readings: readonly GoalReading[];
  /**
   * Every goal `met`. **False when anything is `pending`** — unjudged is not passed.
   *
   * It is **not** the whole verdict, and § D234 is why: it collapses two different days into one
   * `false`. *You were asked for 87 % and carried 61 %* and *the building never woke up, so nobody
   * looked* are not the same event, and the product said the same thing about both — *"Shift
   * missed. Streak reset."* over 18 of 18 carried with 100 % away inside a minute. `week.ts`'s
   * `wasGraded` is the other half, derived from {@link readings} rather than stored beside this
   * one so a restored session cannot carry the two disagreeing.
   */
  readonly allMet: boolean;
  /**
   * The run this day was, as a question the simulator can be re-asked — Everyday Mode slice 8,
   * GAMEPLAY § 14.1 and ENGINE_CONTRACT § 1.5. `null` when the day cannot be re-asked.
   *
   * ## Why a day had to grow this field at all
   *
   * Everything else on this interface is an **outcome**: what arrived, what was carried, what the
   * goals read. Not one of them says what was *run* — not the seed, not the building, not the
   * dispatcher — so a filed day could be drawn, sparklined and totalled, and could not be watched.
   * `shift/banking.ts` makes the identical count one artefact over, against a `VizRecording`: *one
   * of eight*. This is the other half of that finding, and the answer is the same one § 1.4 gives —
   * store the **question**, because the answer is a pure function of it and is megabytes.
   *
   * ## Why `null` is a value and not a gap
   *
   * Two days carry `null` and they are different days, which is why the picker's refusal names its
   * ground rather than saying *no record*:
   *
   * - a day filed by a build that had no record to write — the **measured** state of a session
   *   written before this field existed, on `persist/types.ts`' own precedent for `windowStartS`
   *   and `parkedWeeks`;
   * - a day whose run `watch/record.ts#watchRecordIssues` refused, because something it carried —
   *   a moved lever, a commissioned fabric, a patience curve, a saved dispatcher — is not
   *   expressible as a selection. That is not a defect in the day; it is the same honesty
   *   `scope/runIdentity.ts` applies to the leaderboard, applied to a spectator.
   *
   * A record is written by `dev/main.ts#closeShift`, through `watchRecordOf`, and by nothing else.
   * The **derivation stays out of `shift/`** deliberately: deciding whether a run is re-askable
   * needs `BrowserResources` and the scope table, and a `shift/` module that reached for either
   * would be a second answer to `dev/state.ts`'s question about what a run is.
   */
  readonly record: WatchRecord | null;
}

/** The green banner's payload, produced by the day that banked the last clean shift. */
export interface ClearedAward {
  readonly contractId: string;
  /** The contract's own `reward` string, verbatim. */
  readonly reward: string;
  /** The next contract in declared order, or `null` at the end of the list. */
  readonly nextContractId: string | null;
  /** `Scenario 2 — The morning rush`, or the design's own end-of-list sentence. */
  readonly nextTitle: string;
}

/**
 * The whole of the player's progress, as one immutable value.
 *
 * Every transition in `week.ts` returns a new one and mutates nothing — asserted in
 * `week.test.ts` by deep-freezing the input and comparing a structural snapshot before and after.
 */
export interface WeekState {
  readonly contractId: string;
  /** 1-based. Growth is `1 + 0.11 × (day − 1)`, so day 1 is the building as shipped. */
  readonly day: number;
  /** Index into {@link WEEKDAYS}. */
  readonly dayIdx: number;
  /** Consecutive clean days. Reset to 0 by a missed day, never negative. */
  readonly streak: number;
  /** The best `minutePct` any day of this week reached. `0` before the first day closes. */
  readonly bestMinutePct: number;
  /** Clean shifts banked toward the current contract's `needClean`. */
  readonly cleanRun: number;
  /**
   * How many times the current day has been closed. `0` before it has been closed at all.
   *
   * ## Why a week has to count attempts
   *
   * The simulator runs a whole day in milliseconds and plays the recording back, so **there is no
   * mid-day change** — moving any control discards today and simulates a different one
   * ([`docs/16`](../../../../docs/16-change-scope-contract.md) § 1). The retry is therefore the
   * product's most-used verb, and until this field nothing modelled it.
   *
   * What that cost was not cosmetic. `closeDay` had no same-day guard and `closeShift`'s only guard
   * was the recording's id, which a re-run defeats by construction — so a player could move a
   * slider, re-run, re-close, and bank a **second** clean shift against the same Monday. A contract
   * needing three cleared without the doors ever opening on Tuesday.
   *
   * Published beside the day's figures and never folded into them, on exactly the footing
   * abandonment sits beside AWT and `workPerServedLegKJ` beside raw energy (§ D106): a day cleared
   * on the fourth attempt **is cleared**, and the sheet says which attempt it was.
   */
  readonly attempt: number;
  /** The day {@link attempt} counts, or `null` before any day has been closed. */
  readonly closedDay: number | null;
  /**
   * What {@link streak}, {@link cleanRun} and {@link completed} were **before** the current day was
   * first closed, or `null` when no day is open for re-closing.
   *
   * Carried so a retry is *replayed* rather than *added*: re-closing recomputes the day's
   * contribution from this snapshot instead of compounding on top of the previous attempt's. That is
   * what lets a missed day be recovered by a better run — which the design's *"nothing here is a
   * game over"* asks for — without letting a clean day be banked twice, which is the exploit.
   */
  readonly banked: {
    readonly streak: number;
    readonly cleanRun: number;
    readonly completed: readonly string[];
  } | null;
  /** Contract ids cleared, in the order they were cleared. */
  readonly completed: readonly string[];
  /** The last seven closed days, oldest first. The sparkline reads it directly. */
  readonly history: readonly DayOutcome[];
  /**
   * The award the **day just closed** produced, or `null`.
   *
   * On the state rather than returned beside it, because the report is built from the state and a
   * banner that had to be threaded separately is a banner that gets dropped. Cleared by
   * `nextDay`: it belongs to one report, not to the week.
   */
  readonly cleared: ClearedAward | null;
}

/* -------------------------------------------------------------------------- *
 * The report
 * -------------------------------------------------------------------------- */

/**
 * How a figure is coloured — and the one value that means *do not colour this*.
 *
 * `unranked` exists for the energy pair and for nothing else. [§ D106](../../../../DECISIONS.md):
 * energy is **an axis, never a score**, because measured across the full experiment matrix
 * `nearest-car` — the weakest shipped dispatcher — is on the Pareto front at six of eight cells
 * precisely by being best on energy and worst on wait. A green `workKJ` would rank the worst
 * dispatcher first. So the tone is not "neutral because we could not decide"; it is *this quantity
 * may not be ranked*, and `report.test.ts` asserts it.
 */
export type FigureTone = 'plain' | 'good' | 'caution' | 'hot' | 'bad' | 'withheld' | 'unranked';

/** One cell of the report's figure grid (`design.html` :250–258). */
export interface ReportFigure {
  readonly id: string;
  /** The eyebrow. Upper case, as the design draws it. */
  readonly label: string;
  /** The figure, already formatted with its unit. Never a bare `NaN` and never a stand-in `0`. */
  readonly value: string;
  /** The line under it: the denominator, the window, the caveat. */
  readonly note: string;
  /**
   * How many observations this cell's value is a **mean over** — `undefined` on every cell that is
   * not one, and on a cell that refused to publish a mean at all.
   *
   * ## Why the count is a field when the note already prints it
   *
   * `shift/report.ts#averageWaitFigure` writes *"over 1 204 legs in the peak-5min window"* into
   * {@link note}, so on the figure grid the count is already on screen under the value, and
   * `honesty/surfaces.ts` reads it back out of that sentence with a regex. That works exactly as
   * far as the cell travels **with its note**, and the run-to-run delta block is where it stops:
   * `dev/reportPanel.ts#reportDeltaOf` pairs two sheets by figure id, keeps their **values**, and
   * drew `AVERAGE WAIT was 17.8 s → 23.4 s` with no count anywhere in its box — on the Day report
   * and on the dispatcher editor's result strip, which draws the same view (GitHub issue #137,
   * found by the honesty sweep's R13 on its first run over the block).
   *
   * A consumer that wanted the count back had two bad options and one good one. It could re-derive
   * it from the recording — a second source of truth for a number this cell already has, and wrong
   * the moment a sheet is paired against a sheet of a *different* run, which is the delta's whole
   * job. It could parse the digits out of {@link note} — asking *is there a number?* in place of
   * *is there a count?*. Or the cell can carry the denominator it was computed over, from the same
   * summary and the same function as the value, three lines apart. This is the third.
   *
   * ## Why it is absent rather than zero on a refusal
   *
   * `undefined` is *"this value is not a mean over a sample"*, which is true of a count
   * (`CARRIED`), of a maximum (`WORST WAIT`) and of the **refusal** itself: a withheld cell has no
   * mean, so it has no sample the mean was taken over, and a count printed beside the word
   * `withheld` would make a refusal look like a figure with a caveat. R3's rule that suppression
   * replaces the number rather than softening it applies to the denominator too.
   *
   * The share cells (`AWAY INSIDE A MINUTE`, the per-leg energy figure) deliberately do **not**
   * declare one. They are observations, never suppressed, and R13 is a rule about estimates; their
   * denominators stay where they already are, in their own notes, on the grid that draws them.
   */
  readonly count?: number | undefined;
  readonly tone: FigureTone;
  /**
   * Whether this figure is an **axis** that may not be ranked against anything or folded into
   * anything. `true` on the two energy cells, `false` everywhere else. See {@link FigureTone}.
   */
  readonly axisOnly: boolean;
  /**
   * Which `awtIsValid` ground refused this cell, when one did — `undefined` on every cell that
   * carries a figure, and on a refusal whose recording predates the ground code.
   *
   * ## Why the ground rides on the cell rather than being re-derived from the note
   *
   * `core` emits the refusal as prose **and** as a code (`metrics/awtValidity.ts`), and
   * `mode/disclosure.ts`'s docstring gives the argument for reading the code rather than the prose
   * at length: deciding *which* ground fired by re-reading `saturated`, `waitCount`,
   * `unservedCount` and the service verdict is a second source of truth about a question `core`
   * has already answered, and it is wrong in exactly the case the fourth and fifth grounds exist
   * for — a run that looks unsaturated and uncensored and is refused anyway.
   *
   * The Day report already carried the prose (`awtInvalidReason`, quoted whole) and dropped the
   * code, so `mode/casualDay.ts` had no way to word *this* refusal without re-deriving it. It is
   * carried here, on the one cell that can be refused, rather than on the report: a second cell
   * that could be refused would need its own ground, and a report-level field would quietly make
   * the first refusal's ground the second's.
   *
   * It decides **wording and never the refusal**. Whether the cell is withheld at all is still
   * `summary.awtIsValid && !summary.saturated`, read in one place — see
   * `shift/report.ts#averageWaitFigure`.
   */
  readonly suppressionGround?: AwtInvalidGround | undefined;
}

/** One row of *Where it went wrong* (`design.html` :309–318). */
export interface ReportDiagnosis {
  readonly id: string;
  /** A clock time, a clock range, or the em dash. **Never a time the run did not have.** */
  readonly when: string;
  readonly what: string;
  readonly why: string;
  readonly tone: FigureTone;
}

/** One card of *Levers you actually have* (`design.html` :332–340). */
export interface ReportLever {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

/** Tomorrow's forecast card (`design.html` :344–350). */
export interface ReportForecast {
  readonly name: string;
  readonly note: string;
  /** `+11% more tenants than today` — the growth this layer actually applies. */
  readonly demand: string;
}

/** The whole observation sheet, as one value. `design.html` :237–381. */
/**
 * Where a reader goes when this sheet cannot answer their question — as a value, not as prose.
 *
 * `surface` is a named member so a shell can navigate on it; `label` and `why` are the words. The
 * pointer exists because the question a run provokes — *is this better?* — is the one question this
 * sheet is forbidden to answer, and `docs/17` § 5 clause 7 found the only surface that may answer it
 * reachable from nowhere the player is standing when they ask.
 *
 * It lives on {@link DayReport} rather than on the single-run shape alone, which is a correction: a
 * player finishes a *campaign day*, reads the levers card saying **try a different dispatcher — a
 * smarter one is free**, and is standing in exactly the spot the finding describes. Restricting the
 * pointer to Free Play answered the finding for the mode that provokes the question least.
 */
export interface ReportNextStep {
  readonly surface: 'compare';
  readonly label: string;
  readonly why: string;
}

export interface DayReport {
  /** `Tuesday — day 2`. */
  readonly title: string;
  /** Where the question this sheet may not answer is answered. See {@link ReportNextStep}. */
  readonly nextStep: ReportNextStep;
  /** The right-aligned meta block, one string per line. */
  readonly metaLines: readonly string[];
  readonly lede: string;
  readonly figures: readonly ReportFigure[];
  /**
   * `cleared` when every goal was met, `missed` when one was read and not met, and `ungraded` when
   * none was read at all.
   *
   * **Three, and the third is § D234's.** This said *"`missed` otherwise — including when any goal
   * is pending"*, and that sentence was the defect rather than a description of it: a day under
   * {@link WAKE_UP_ARRIVALS} arrivals has every goal `pending`, so a play-tester who carried 18 of
   * 18 people with 100 % away inside a minute was told *"Shift missed. Streak reset."* — a claim
   * about how the day went, on a day nobody looked at.
   *
   * `ungraded` is not a softer `missed`. It is the other half of *unjudged is not passed*: such a
   * day is still not clean, still banks nothing and still clears nothing — it simply no longer
   * **costs** anything either. `report.ts`'s `VERDICT_VOICE` is keyed on this union, so the third
   * member is what makes the third set of sentences reachable, and § D237's property — every
   * sentence about a day comes through the verdict — extends to it rather than around it.
   */
  readonly verdict: 'cleared' | 'missed' | 'ungraded';
  readonly verdictLine: string;
  readonly streakLine: string;
  /** `Scenario 2 — The morning rush · 1 of 2 clean shifts banked`. */
  readonly contractLine: string;
  readonly cleared: ClearedAward | null;
  /** Today's readings, each with last night's figure beside it. See {@link GoalLine}. */
  readonly goals: readonly GoalLine[];
  readonly diagnosis: readonly ReportDiagnosis[];
  readonly levers: readonly ReportLever[];
  readonly forecast: ReportForecast;
  /** *What this taught* — the reward banked, or how many clean shifts are left. */
  readonly taught: string;
  /** Verbatim from `design.html` :3484, with this run's dispatcher named. */
  readonly smallPrint: string;
  /** `Open the doors on Wednesday`. */
  readonly nextDayName: Weekday;
}

/* -------------------------------------------------------------------------- *
 * Constants shared across the directory
 * -------------------------------------------------------------------------- */

/**
 * Arrivals below which nothing is graded (`design.html` :2382).
 *
 * Twenty legs, not twenty people, because {@link Observations} counts legs everywhere else and a
 * sky-lobby journey boards twice — the same unit discipline `VizProgress.boardedLegs` had to learn.
 */
export const WAKE_UP_ARRIVALS = 20;

/**
 * Tenant growth per day, compounding **linearly** rather than geometrically: the design's own
 * `1 + 0.11 * (day - 1)` (`design.html` :1568), not `1.11 ** (day - 1)`.
 *
 * The difference is not pedantry. At day 20 the linear form is ×3.09 and the geometric one is
 * ×7.26, and Vertical City at 4 887 occupants would be carrying 35 000 people — a building that
 * cannot be simulated in a browser tab and was never what the design drew.
 */
export const GROWTH_PER_DAY = 0.11;

/**
 * The simulated second the shift clock calls 06:00 — `docs/12` § 4.1.
 *
 * The clock is `DAY_START_S + frame.simTimeS`, and `simTimeS` is the kernel's, so CLAUDE.md
 * invariant 3 is untouched: nothing here reads a wall clock, it renames one the kernel already
 * produced. The handoff's fixed 06:00–22:00 ruler is **not** implemented; § 4.1 records why, and
 * the consequence for this directory is that a report never prints a clock time outside the run's
 * own span.
 */
export const DAY_START_S = 6 * 3600;
