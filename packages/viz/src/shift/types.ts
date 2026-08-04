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
 * `readGoal` accepts, and it carries five numbers, four of which are the design's own
 * (`design.html` :1428–1439): a carried share, an away-inside-a-minute share, a peak queue depth
 * and an abandonment count. There is no `meanWaitS` on it, no `wait95S`, no
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

import type { DirectionalSplit, SimTime } from '@elevator-sim/core/browser';

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
 * Every prose field is **verbatim from the handoff** (`design.html` :1381–1417) and is asserted so
 * in `contracts.test.ts`. The one thing the handoff hard-codes and this type does not carry is the
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
  /** What this building teaches that the other four cannot. */
  readonly teaches: string;
  readonly brief: string;
  /** Clean shifts that bank toward clearing it. 1–3. */
  readonly needClean: number;
  readonly reward: string;
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

/** The four quantities the design's goals read, by name. See the module docstring. */
export const GOAL_OBSERVATION_IDS = ['carryPct', 'minutePct', 'peakQueue', 'abandoned'] as const;

export type GoalObservationId = (typeof GOAL_OBSERVATION_IDS)[number];

/**
 * Everything a goal may read — **and structurally nothing that `awtIsValid` could suppress**.
 *
 * Five fields, four of them gradeable and one of them the gate. Every one is a *count* or a ratio
 * of counts: how many turned up, what share got carried, what share was away inside a minute, how
 * deep the worst landing got, how many gave up. None of them is an estimate over a cohort, so none
 * of them is refused on a saturated run, so a goal can be graded on a day the building was outrun —
 * which is the day a reader most needs a verdict.
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
 * layer is that a goal cannot reach a suppressible figure. A key can only name one of four
 * numbers, and the compiler is the thing that says so.
 */
export interface ShiftGoal {
  readonly id: string;
  /** The sentence the rail and the report both print. Built by `goalsForDay`. */
  readonly label: string;
  /** `%` or the empty string. Appended to the observed value for display. */
  readonly unit: '%' | '';
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
  /** `✓`, `○` or `·`, matching `design.html` :2383–2391. Never the only signal — KB-15. */
  readonly glyph: string;
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
  /** Every goal `met`. **False when anything is `pending`** — unjudged is not passed. */
  readonly allMet: boolean;
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
  readonly tone: FigureTone;
  /**
   * Whether this figure is an **axis** that may not be ranked against anything or folded into
   * anything. `true` on the two energy cells, `false` everywhere else. See {@link FigureTone}.
   */
  readonly axisOnly: boolean;
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
export interface DayReport {
  /** `Tuesday — day 2`. */
  readonly title: string;
  /** The right-aligned meta block, one string per line. */
  readonly metaLines: readonly string[];
  readonly lede: string;
  readonly figures: readonly ReportFigure[];
  /** `cleared` when every goal was met, `missed` otherwise — including when any goal is pending. */
  readonly verdict: 'cleared' | 'missed';
  readonly verdictLine: string;
  readonly streakLine: string;
  /** `Scenario 2 — The morning rush · 1 of 2 clean shifts banked`. */
  readonly contractLine: string;
  readonly cleared: ClearedAward | null;
  readonly goals: readonly GoalReading[];
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
