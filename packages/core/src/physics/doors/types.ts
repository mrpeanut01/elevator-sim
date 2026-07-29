/**
 * Door vocabulary: states, timings, stop reasons, transition events, and the schema for
 * every door tunable.
 *
 * Split from `doorMachine.ts` for the same reason `config/types.ts` is split from
 * `config/schema.ts`: the names a consumer needs in order to *talk about* doors should be
 * importable without pulling in the transition logic.
 *
 * Conventions (see CLAUDE.md):
 * - All durations are **simulated seconds**. Nothing here reads a wall clock (invariant 3).
 * - Every value is `readonly`. The machine is a pure transition function over immutable
 *   state; a door "transition" produces a new {@link DoorMachineState} rather than mutating
 *   the old one.
 * - Every tunable appears in {@link DOOR_PARAMETERS} with its type, range and default
 *   (invariant 8), and its runtime default comes from {@link DOOR_DEFAULTS} — never from a
 *   literal buried in the machine (invariant 7).
 */

import { DWELL_POLICIES, type DwellPolicy } from '../../config/types.js';
import type { SimTime } from '../../kernel/types.js';

// ---------------------------------------------------------------------------
// States and causes
// ---------------------------------------------------------------------------

/**
 * The four door positions.
 *
 * The nominal cycle is `closed → opening → open → closing → closed`. The one extra edge is
 * the reopen path `closing → opening`, taken when the photo-eye is interrupted or a late
 * passenger arrives; the door reverses from wherever it had got to, so a reopen at 40%
 * closed costs less than a reopen at 90% closed.
 */
export const DOOR_STATES = ['closed', 'opening', 'open', 'closing'] as const;

export type DoorState = (typeof DOOR_STATES)[number];

/**
 * Why a reopen was requested.
 *
 * The distinction is not cosmetic: `obstruction` is the photo-eye, a **safety** function
 * that no dispatcher setting may disable, while `lateArrival` models the door-hold button
 * and the "someone is walking towards the car" courtesy hold, which
 * {@link DoorConfig.reopenOnLateArrival} may switch off. Both are bounded by
 * {@link DoorConfig.maxReopensPerStop}.
 */
export const DOOR_REOPEN_CAUSES = ['obstruction', 'lateArrival'] as const;

export type DoorReopenCause = (typeof DOOR_REOPEN_CAUSES)[number];

/**
 * Why a reopen request was not honoured.
 *
 * - `doorClosed` — no stop is in progress. Reopening a shut door is not a thing; issue an
 *   `open` command instead.
 * - `policyDisabled` — the cause was `lateArrival` and `reopenOnLateArrival` is `false`.
 * - `reopenLimit` — {@link DoorConfig.maxReopensPerStop} is exhausted. This models
 *   **nudging**: after repeated interruptions a real controller ignores the photo-eye and
 *   closes anyway. It is what makes unbounded door-holding impossible.
 */
export const DOOR_REOPEN_REFUSALS = ['doorClosed', 'policyDisabled', 'reopenLimit'] as const;

export type DoorReopenRefusal = (typeof DOOR_REOPEN_REFUSALS)[number];

/**
 * Why an `open` command could not widen the stop it was aimed at.
 *
 * - `doorClosing` — the door had already started closing. The dwell for this stop was
 *   computed when the door reached fully open and has been served in full, so a reason
 *   declared now can no longer lengthen it. Recording it anyway would corrupt attribution:
 *   `accounting.totalS - nominalStopSeconds(config, reason)` would go **negative**, because
 *   the stop would be measured against a dwell it was never granted.
 *
 * The caller's remedy is a `reopen` (cause `lateArrival`), which is what a real controller
 * does when a hall call registers before the door is shut: it reverses the door, spends a
 * slot of the bounded reopen budget, and earns a real dwell for the new reason.
 */
export const DOOR_OPEN_DECLINES = ['doorClosing'] as const;

export type DoorOpenDecline = (typeof DOOR_OPEN_DECLINES)[number];

/**
 * Labels for the transitions the machine reports.
 *
 * These are the natural `SimEvent.type` strings when a car controller drives the machine
 * from the kernel, and the natural keys for the metrics layer. They never participate in
 * ordering — the kernel's `(time, sequence)` does that.
 */
export const DOOR_EVENT_TYPES = [
  'door.openStarted',
  'door.opened',
  'door.dwellExtended',
  'door.closeStarted',
  'door.reopenStarted',
  'door.closed',
  'door.reopenRefused',
  'door.openDeclined',
] as const;

export type DoorEventType = (typeof DOOR_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Stop reason
// ---------------------------------------------------------------------------

/**
 * Why the car stopped at this floor, which is what sets the dwell.
 *
 * A car call (someone already aboard pressed this floor) needs only the time to step out;
 * a hall call needs longer because the waiting passenger has to notice the car, walk to it
 * and board. A stop that answers both takes the longer of the two — the passengers do not
 * take turns.
 *
 * Those base values size the *reaction*: noticing the car, walking to it, stepping out. They
 * do not size the *flow* of a queue of people through the doorway, which is what
 * {@link DoorStopReason.transferSeconds} is for.
 */
export interface DoorStopReason {
  /** A passenger aboard the car requested this floor. */
  readonly carCall: boolean;
  /** A hall call at this floor is being answered. */
  readonly hallCall: boolean;
  /**
   * Passengers waiting in the hall for this car, at the moment the door opened. Drives
   * adaptive dwell. Omitted or `0` means nobody is waiting; the adaptive extension is then
   * zero and adaptive dwell degenerates to fixed dwell.
   */
  readonly hallQueueLength?: number | undefined;
  /**
   * Seconds of passenger transfer this stop has to accommodate, `0` if nobody is moving.
   *
   * This is the `2·P·tp` term of the Barney/CIBSE round-trip-time calculation
   * (docs/03-traffic-and-statistics.md § Part 2) localised to one stop:
   * `(boarding + alighting) × passengerTransferS`. The dwell is the **longer** of the policy
   * dwell and this, clamped at {@link DoorConfig.maxTransferSeconds} — twelve people do not
   * finish boarding because a 5 s timer expired, and a simulator that pretends otherwise
   * produces stops ~10 s short at heavy floors and fails the RTT oracle.
   *
   * The caller multiplies the counts, not the door: per-passenger transfer time is a
   * property of the *building* (`data/elevator-specs.json → timing.passengerTransferS`:
   * 1.0–1.2 s office, 1.5–2.0 s residential, ISO 4190-6 uses 1.75 s), and it is the
   * passenger/load model that knows how many people are moving in each direction. Passing
   * seconds rather than counts also keeps this module free of any opinion about who boards.
   */
  readonly transferSeconds?: number | undefined;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Every number the door machine needs, already resolved.
 *
 * Built by `resolveDoorConfig`, never assembled by hand in simulation code: the physical
 * timings come from the car (which resolved them from `data/elevator-specs.json`) and the
 * control settings from the dispatcher profile's `answer` stage. Nothing here has a literal
 * default in the machine — see {@link DOOR_DEFAULTS}.
 */
export interface DoorConfig {
  /** Seconds from fully closed to fully open. Reference range 1.5–2.5 s. */
  readonly openS: number;
  /** Seconds from fully open to fully closed. Reference range 2.5–4.0 s. */
  readonly closeS: number;
  /** Dwell when the stop answers a car call, seconds. Reference range 2–4 s. */
  readonly dwellCarCallS: number;
  /** Dwell when the stop answers a hall call, seconds. Reference range 4–7 s. */
  readonly dwellHallCallS: number;
  /** `fixed` uses the base dwell as-is; `adaptive` extends it with the hall queue. */
  readonly dwellPolicy: DwellPolicy;
  /** Extra dwell per waiting passenger, seconds. Inert when `dwellPolicy` is `fixed`. */
  readonly dwellAdaptationGain: number;
  /** Ceiling on adaptive dwell, seconds. Inert when `dwellPolicy` is `fixed`. */
  readonly maxDwellS: number;
  /**
   * Ceiling on the transfer-driven part of the dwell, seconds. Applies under both dwell
   * policies, because {@link DoorStopReason.transferSeconds} is passenger flow rather than a
   * control decision.
   *
   * It is not a physical limit — a real door stays open while people are still walking
   * through it. It exists so {@link DoorConfig} still bounds the worst-case stop in closed
   * form once the dwell can be driven by a caller-supplied number. The default is a full
   * design load of the largest reference car (26 persons × 0.8 ≈ 20) at the slowest
   * reference transfer time (2.0 s/passenger, residential), so no realistic stop reaches it.
   */
  readonly maxTransferSeconds: number;
  /** Whether a `lateArrival` reopen is honoured. `obstruction` is never gated by this. */
  readonly reopenOnLateArrival: boolean;
  /**
   * Reopens honoured per stop, after which the door ignores further requests and closes.
   *
   * This is the bound that makes the stop duration finite; see `maxStopSeconds`. `0`
   * disables reopening entirely.
   */
  readonly maxReopensPerStop: number;
}

/**
 * The four physical door timings, as they appear on a `ResolvedCar`.
 *
 * Declared structurally rather than importing `ResolvedCar` so `physics/` states exactly
 * what it consumes; a `ResolvedCar` satisfies it without a cast.
 */
export interface DoorTimingSource {
  readonly doorOpenS: number;
  readonly doorCloseS: number;
  readonly dwellCarCallS: number;
  readonly dwellHallCallS: number;
}

/**
 * The dispatcher-profile answer-stage settings the door machine consumes.
 *
 * Declared structurally for the same reason as {@link DoorTimingSource}: `physics/` states
 * exactly what it reads, and an `AnswerStageConfig` satisfies it without a cast.
 *
 * It is also what lets `resolveDoorConfig` read `maxReopensPerStop` and `maxTransferSeconds`
 * from a profile *the moment the config layer accepts them*. Both are declared in
 * {@link DOOR_PARAMETERS} under `answer.*`, but `answerStageSchema` is a `z.strictObject`
 * that does not list either key yet, so a profile on disk carrying one is rejected at load
 * time. Reading them here rather than only from {@link DoorConfigOverrides} means the door
 * module does not have to change again when the schema grows the fields — see the note on
 * {@link DOOR_PARAMETERS}.
 */
export interface DoorAnswerSource {
  readonly dwellPolicy?: DwellPolicy | undefined;
  readonly dwellAdaptationGain?: number | undefined;
  readonly maxDwellS?: number | undefined;
  readonly reopenOnLateArrival?: boolean | undefined;
  readonly maxReopensPerStop?: number | undefined;
  readonly maxTransferSeconds?: number | undefined;
}

/**
 * Explicit overrides applied last when resolving a {@link DoorConfig}.
 *
 * An optimizer sampling {@link DOOR_PARAMETERS} needs a way to inject a candidate without
 * editing a profile on disk, and a test needs one without a fixture file. Precedence is
 * `overrides` > `answer` > `car` > {@link DOOR_DEFAULTS}.
 */
export interface DoorConfigOverrides {
  readonly openS?: number | undefined;
  readonly closeS?: number | undefined;
  readonly dwellCarCallS?: number | undefined;
  readonly dwellHallCallS?: number | undefined;
  readonly dwellPolicy?: DwellPolicy | undefined;
  readonly dwellAdaptationGain?: number | undefined;
  readonly maxDwellS?: number | undefined;
  readonly reopenOnLateArrival?: boolean | undefined;
  readonly maxReopensPerStop?: number | undefined;
  readonly maxTransferSeconds?: number | undefined;
}

// ---------------------------------------------------------------------------
// Machine state
// ---------------------------------------------------------------------------

/**
 * Cumulative time spent at the current (or just-completed) stop, by phase.
 *
 * The metrics layer attributes stop cost from this. Every second the door is not shut lands
 * in exactly one bucket, so `totalS` equals `openingS + dwellS + closingS` (to floating-
 * point rounding — the two are summed in different orders) — including across reopens,
 * where the aborted close is still counted as closing time and is additionally recorded in
 * `abortedClosingS`.
 *
 * `totalS - nominalStopSeconds(config, reason)` is the overhead a stop's reopens cost. It is
 * never negative for a stop left to run its course, because `reason` only ever records what
 * the stop actually honoured: a reason declared once the door is already closing is
 * *declined* (`door.openDeclined`) rather than merged, precisely so this subtraction stays
 * meaningful. A `close` command is the one thing that can put a stop under nominal, since it
 * ends the dwell early on purpose; those stops carry a `forced` flag on `door.closeStarted`.
 */
export interface DoorTimeAccounting {
  /** Seconds in `opening`, summed over the initial open and every reopen. */
  readonly openingS: number;
  /** Seconds in `open`, summed over the initial dwell and every restarted dwell. */
  readonly dwellS: number;
  /** Seconds in `closing`, including closes that were aborted by a reopen. */
  readonly closingS: number;
  /** Of `closingS`, the part spent closing towards a close that never completed. */
  readonly abortedClosingS: number;
  /** `openingS + dwellS + closingS`. */
  readonly totalS: number;
  /** Reopen requests honoured. */
  readonly reopens: number;
  /** Of those, the ones caused by the photo-eye. */
  readonly obstructions: number;
  /** Of those, the ones caused by a late passenger or the hold button. */
  readonly lateArrivals: number;
  /** Reopen requests refused — by policy or by the per-stop limit. */
  readonly refusedReopens: number;
}

/**
 * The complete state of one door. Immutable.
 *
 * Every field is derived time-independently: given this value, a {@link DoorConfig} and a
 * time, the door's position and its next transition are both computable in closed form.
 * That is what lets the renderer interpolate between kernel events, exactly as
 * `Car.positionAt(t)` does for motion.
 */
export interface DoorMachineState {
  /** Which of the four positions the door is in. */
  readonly state: DoorState;
  /** When this state was entered. `open` uses it as the start of the current dwell. */
  readonly since: SimTime;
  /** Open fraction (0 shut, 1 fully open) at {@link since}. Non-trivial after a reopen. */
  readonly openFractionAtSince: number;
  /** When the current or just-completed stop began. `undefined` before the first stop. */
  readonly stopStartedAt: SimTime | undefined;
  /** Why the car stopped. Accumulates as more reasons are declared during the stop. */
  readonly reason: DoorStopReason;
  /**
   * What sizes the dwell of the **current open period**, as opposed to the whole stop.
   *
   * Equal to {@link reason} for every stop that is never reopened with a revised reason, which
   * is why the two were one field for as long as no caller revised one. They have to be
   * separate because {@link reason} is cumulative and `mergeStopReasons` takes the **larger**
   * transfer — correct for a stop that is still growing, and wrong for a door that has already
   * served the cohort and is reversing for one late passenger. Sizing that reopen off `reason`
   * re-grants the whole-cohort transfer (up to {@link DoorConfig.maxTransferSeconds}) once per
   * honoured reopen, which is a delay the arriving passenger cannot account for.
   *
   * So: an `open` command **widens** this (a stop that grows needs at least the dwell it
   * already had), and a `reopen` carrying a revised reason **replaces** it (a new open period
   * with its own cohort). A `reopen` with no revised reason leaves it at {@link reason}, which
   * is what keeps the photo-eye path — a safety reopen nobody sizes — exactly as it was.
   *
   * {@link reason} stays cumulative regardless, so `totalS - nominalStopSeconds(config, reason)`
   * still measures the whole stop's reopen overhead against everything the stop answered.
   */
  readonly dwellReason: DoorStopReason;
  /** Dwell granted for the current open period, seconds. Meaningful when `state` is `open`. */
  readonly grantedDwellS: number;
  /** Reopens honoured so far this stop; compared against `maxReopensPerStop`. */
  readonly reopenCount: number;
  /** Time and counts for the current or just-completed stop. */
  readonly accounting: DoorTimeAccounting;
}

// ---------------------------------------------------------------------------
// Events and commands
// ---------------------------------------------------------------------------

/** One transition, reported so the kernel, the trace and the metrics layer can see it. */
export interface DoorEvent {
  readonly type: DoorEventType;
  /** Simulated time of the transition. */
  readonly at: SimTime;
  /** State before. Equal to {@link to} for events that do not move the door. */
  readonly from: DoorState;
  /** State after. */
  readonly to: DoorState;
  /** Open fraction at {@link at}, 0..1. */
  readonly openFraction: number;
  /** Set on `door.reopenStarted` and on a `door.dwellExtended` caused by a reopen. */
  readonly cause?: DoorReopenCause | undefined;
  /** Set on `door.reopenRefused`. */
  readonly refusal?: DoorReopenRefusal | undefined;
  /** Set on `door.openDeclined`. */
  readonly declined?: DoorOpenDecline | undefined;
  /** Dwell granted, seconds. Set on `door.opened` and `door.dwellExtended`. */
  readonly dwellS?: number | undefined;
  /** Set on `door.closeStarted` when a `close` command cut the dwell short. */
  readonly forced?: boolean | undefined;
  /** Set on `door.closed`: the completed stop's accounting, ready for the metrics layer. */
  readonly accounting?: DoorTimeAccounting | undefined;
}

/**
 * An external input to the machine. Time itself is not a command — `advanceDoor` handles it.
 *
 * | command  | `closed`      | `opening`     | `open`               | `closing`         |
 * |----------|---------------|---------------|----------------------|-------------------|
 * | `open`   | starts a stop | merges reason | merges reason, may extend dwell | **declined** |
 * | `reopen` | refused       | refusal rules apply, else free no-op | restarts the dwell | reverses to `opening` |
 * | `close`  | ignored       | ignored       | ends the dwell now   | ignored           |
 *
 * `open` declares *why* the car is stopping; `reopen` asks the door to hold or reverse.
 * Keeping them separate is what stops a stream of `open` commands from holding the door
 * open indefinitely: merging a reason recomputes the dwell relative to the moment the door
 * became open, so it can never push the deadline past the dwell ceiling, whereas a `reopen`
 * restarts the dwell from now and therefore spends the bounded reopen budget.
 *
 * The `closing` column is why the two commands cannot be collapsed. By then the dwell has
 * been granted and consumed, so a widened reason could not be honoured; merging it anyway
 * would leave the stop measured against a dwell it never had. The declaration is therefore
 * declined — reported on {@link DoorStep.declined} and as a `door.openDeclined` event — and
 * the caller that still wants the door back issues a `reopen`, which pays for it.
 */
export type DoorCommand =
  /** The car has stopped here; open up. Repeats merge the reason into the current stop. */
  | { readonly kind: 'open'; readonly reason: DoorStopReason }
  /**
   * Photo-eye or late passenger.
   *
   * The optional `reason` **revises** rather than widens: it states what *this open period*
   * has to cover, and becomes {@link DoorMachineState.dwellReason} outright. Supply it
   * whenever the reopen is for a known, smaller cohort than the stop already served — a
   * courtesy hold for one approaching passenger is the case it exists for. Omit it for a
   * safety reopen, where nobody knows who is in the doorway and the stop's own reason is the
   * only honest estimate; the dwell is then sized off {@link DoorMachineState.reason} exactly
   * as it always was.
   *
   * It is merged into {@link DoorMachineState.reason} either way, so attribution still sees
   * everything the stop answered.
   */
  | {
      readonly kind: 'reopen';
      readonly cause: DoorReopenCause;
      readonly reason?: DoorStopReason | undefined;
    }
  /** End the dwell now — the door-close button, or a dispatcher cutting a stop short. */
  | { readonly kind: 'close' };

/** The result of advancing time or applying a command. */
export interface DoorStep {
  /** The door afterwards. A new value; the input is never mutated. */
  readonly state: DoorMachineState;
  /** Transitions that happened, in chronological order. Empty if nothing changed. */
  readonly events: readonly DoorEvent[];
  /** Set only when a `reopen` command was refused. */
  readonly refusal?: DoorReopenRefusal | undefined;
  /**
   * Set only when an `open` command arrived too late to widen the stop it named — the
   * dispatcher's declaration was not silently swallowed, and a caller that cares can follow
   * it with a `reopen`.
   */
  readonly declined?: DoorOpenDecline | undefined;
}

// ---------------------------------------------------------------------------
// Tunables (CLAUDE.md invariants 7 and 8)
// ---------------------------------------------------------------------------

/** Parameter kinds a generic optimizer understands. See docs/06-parameterization-and-tuning.md. */
export type DoorParameterType = 'continuous' | 'integer' | 'categorical' | 'boolean';

/**
 * A self-describing tunable.
 *
 * The point of the shape is that an optimizer can sample a valid door configuration knowing
 * nothing about elevators: `type` plus `range`/`values` bound the search, `default` gives a
 * starting point, and `activeWhen` stops it wasting evaluations on a knob that is inert
 * under the current configuration.
 */
export interface DoorParameterSpec {
  /** Dotted path of the value in config, e.g. `answer.dwellAdaptationGain`. */
  readonly id: string;
  readonly type: DoorParameterType;
  /** Inclusive `[min, max]`. Present for `continuous` and `integer`. */
  readonly range?: readonly [number, number] | undefined;
  readonly scale?: 'linear' | 'log' | undefined;
  /** Admissible values. Present for `categorical`. */
  readonly values?: readonly string[] | undefined;
  readonly default: number | string | boolean;
  /** SI unit, or omitted for a dimensionless quantity. */
  readonly unit?: string | undefined;
  readonly description: string;
  /** Parameter id to the values that make this parameter live. */
  readonly activeWhen?: Readonly<Record<string, readonly string[]>> | undefined;
}

/**
 * Runtime defaults for the control tunables, used when a dispatcher profile declares no
 * `answer` stage. The physical timings have no default here on purpose — they come from the
 * car, which resolved them from `data/elevator-specs.json`.
 *
 * This object is the single source of truth: {@link DOOR_PARAMETERS} quotes it rather than
 * repeating the numbers, so the declared schema and the resolver can never disagree.
 */
export const DOOR_DEFAULTS = Object.freeze({
  /** Conservative: adaptive dwell is a control decision a profile must opt into. */
  dwellPolicy: 'fixed',
  dwellAdaptationGain: 0.4,
  maxDwellS: 20,
  /**
   * **Off by default, and the default changed when the behaviour landed.**
   *
   * It read `true` — *"the courtesy hold is standard behaviour; a profile switches it off to
   * measure the cost"* — for as long as the run loop emitted no `lateArrival` reopen at all, so
   * the default described a behaviour that did not exist and no configuration could switch off.
   * `Simulation.#reopenForLateArrival` now emits one, which makes the knob live and this default
   * load-bearing for the first time.
   *
   * ## Why it stays off, and what the cost actually is
   *
   * This docstring used to say enabling it *"shifts AWT by up to 30 % on `secure-tower`"*. A
   * later review corrected the maximum to +59.1 %. **Both were unquotable**, for the same
   * unnoticed reason: they are single-replication point estimates of a mean waiting time on a
   * configuration that saturates — `secure-tower` reports
   * `saturation: { saturated: true, verdict: 'diverging-queue' }` at that seed under the shipped
   * profiles — and CLAUDE.md § Statistical discipline says in so many words that a system whose
   * queues grow without bound has no mean to report, and that no comparison may be declared
   * without a paired-t interval that excludes zero.
   *
   * Re-measured under those rules — paired arms on common random numbers, **50 replications**
   * per cell, a paired-t 95 % interval, AWT suppressed wherever either arm's queue diverges —
   * across the five shipped buildings x ten shipped profiles:
   *
   * - **34 of the 50 cells have a quotable interval. Not one of them is significantly worse.**
   * - Two are significantly *better*: `secure-tower|auction-multi-round` at −13.2 % (−7.66 s,
   *   95 % CI [−12.72, −2.60]) and `vertical-city|predictive-balanced` at −14.4 % (−6.80 s,
   *   95 % CI [−11.36, −2.23]).
   * - The other 32 show no significant difference. The remaining 16 cells saturate in almost
   *   every replication and are suppressed rather than quoted.
   *
   * **Ten of those fifty cells were measured on a `vertical-city` that had no escalator, and that
   * building has since declared four** — one at each of its two-level lobbies, in two separate
   * changes. Every run of the other four buildings is bit-identical to
   * the tree these figures were taken on — `traffic/transportIdentity.test.ts` pins that at full
   * precision — so 40 of the 50 cells cannot have moved, including the `secure-tower` row above.
   * The ten `vertical-city` cells can have, and the `predictive-balanced` row is one of them. It
   * was **not** re-derived, and the reason is worth stating rather than hiding: this 50-cell study
   * has **no shipped entry point**. It lives in the commit that measured it, so there is nothing
   * to re-run — the same gap `experiments/benchmark/published.ts` catalogues inside `benchmark/`,
   * one directory outside it. Treat the `vertical-city` row as *measured on the pre-escalator
   * configuration* until somebody ships the study as a function and re-derives it.
   *
   * So the honest statement is that there is **no measured AWT cost**, which is not the same as
   * "it is free": it is a real modelling change and it moves **41 of the 50** passenger-record
   * trajectories at seed 20260726, on every building whose landings ever hold somebody the car
   * could take (all but `garden-apartments`).
   *
   * It is `false` because *that* is what a default has to protect. Phase 5's verdicts were
   * measured with the hold off, and revaluing 41 of 50 trajectories underneath them would leave
   * those verdicts comparing runs taken under different physical models — whether or not the
   * headline mean moves. Turning it on is a deliberate re-measurement, not a side effect of
   * implementing it.
   */
  reopenOnLateArrival: false,
  maxReopensPerStop: 5,
  /** 20 persons (design load of the largest reference car) x 2.0 s, the slowest reference tp. */
  maxTransferSeconds: 40,
} as const satisfies {
  readonly dwellPolicy: DwellPolicy;
  readonly dwellAdaptationGain: number;
  readonly maxDwellS: number;
  readonly reopenOnLateArrival: boolean;
  readonly maxReopensPerStop: number;
  readonly maxTransferSeconds: number;
});

/**
 * The schema for every door tunable (CLAUDE.md invariant 8).
 *
 * Ranges for the physical timings are the reference envelopes from
 * docs/02-elevator-reference.md § Door parameters. `car.*` ids resolve against a car in a
 * building config; `answer.*` ids against a dispatcher profile's answer stage.
 *
 * ## The config surface, now landed
 *
 * `answer.maxReopensPerStop` and `answer.maxTransferSeconds` are read from the answer stage by
 * `resolveDoorConfig` (see {@link DoorAnswerSource}), which `Simulation` supplies as
 * `profile.answer` verbatim — so both were live knobs. `answerStageSchema` in `config/schema.ts`
 * is a `z.strictObject` and listed neither, so a profile carrying one was rejected at load time
 * and only {@link DoorConfigOverrides} could set them: searchable, unpersistable, which is
 * invariant 8 met on one half.
 *
 * Both keys are in `answerStageSchema` and in `AnswerStageConfig` now, and
 * `dispatch/parameters.test.ts` asserts that **every** `answer.*` id declared by this schema or by
 * `LOAD_SENSOR_PARAMETERS` parses as a profile — so the gap cannot reopen without a red test
 * rather than a doc comment nobody reads.
 */
export const DOOR_PARAMETERS: readonly DoorParameterSpec[] = [
  {
    id: 'car.doorOpenS',
    type: 'continuous',
    range: [1.5, 2.5],
    scale: 'linear',
    default: 1.8,
    unit: 's',
    description:
      'Fully closed to fully open. Centre-opening is faster than side-opening (1.8 vs 2.5).',
  },
  {
    id: 'car.doorCloseS',
    type: 'continuous',
    range: [2.5, 4.0],
    scale: 'linear',
    default: 3.0,
    unit: 's',
    description: 'Fully open to fully closed. Centre-opening 3.0, side-opening 4.0.',
  },
  {
    id: 'car.dwellCarCallS',
    type: 'continuous',
    range: [2, 4],
    scale: 'linear',
    default: 3,
    unit: 's',
    description: 'Dwell when answering a car call: the passenger is already aboard.',
  },
  {
    id: 'car.dwellHallCallS',
    type: 'continuous',
    range: [4, 7],
    scale: 'linear',
    default: 5,
    unit: 's',
    description: 'Dwell when answering a hall call: the passenger must walk to the car.',
  },
  {
    id: 'answer.dwellPolicy',
    type: 'categorical',
    values: [...DWELL_POLICIES],
    default: DOOR_DEFAULTS.dwellPolicy,
    description:
      'Fixed dwell, or dwell extended by the hall queue. Dwell is the one physical parameter that is also a control decision.',
  },
  {
    id: 'answer.dwellAdaptationGain',
    type: 'continuous',
    range: [0, 2],
    scale: 'linear',
    default: DOOR_DEFAULTS.dwellAdaptationGain,
    unit: 's/passenger',
    description: 'Extra dwell granted per passenger waiting in the hall.',
    activeWhen: { 'answer.dwellPolicy': ['adaptive'] },
  },
  {
    id: 'answer.maxDwellS',
    type: 'continuous',
    range: [4, 30],
    scale: 'linear',
    default: DOOR_DEFAULTS.maxDwellS,
    unit: 's',
    description:
      'Ceiling on adaptive dwell. Must be at least the larger base dwell, or adaptive dwell would be shorter than fixed dwell.',
    activeWhen: { 'answer.dwellPolicy': ['adaptive'] },
  },
  {
    id: 'answer.reopenOnLateArrival',
    type: 'boolean',
    default: DOOR_DEFAULTS.reopenOnLateArrival,
    description:
      'Honour the door-hold button and the courtesy hold for an approaching passenger: when the doors start closing on a landing that still holds somebody this car could carry, reverse them and board. Photo-eye obstruction reopens regardless — it is a safety function. Off by default because every number this project has published was measured without it, and enabling it moves 41 of the 50 shipped building x profile trajectories — a deliberate re-measurement, not a free improvement. It has no measured AWT cost: over 50 paired replications on common random numbers, none of the 34 cells with a quotable interval is significantly worse, two are significantly better (secure-tower|auction-multi-round -13.2%, CI [-12.72, -2.60]s; vertical-city|predictive-balanced -14.4%, CI [-11.36, -2.23]s) and the rest show no significant difference; the other 16 cells saturate and their means are suppressed. This row previously advertised "up to 30% of AWT on secure-tower", which was a single-replication point estimate taken from a diverging queue. What the hold buys back is a whole extra round trip for the passenger who would have been left behind.',
  },
  {
    id: 'answer.maxReopensPerStop',
    type: 'integer',
    range: [0, 20],
    scale: 'linear',
    default: DOOR_DEFAULTS.maxReopensPerStop,
    description:
      'Reopens honoured before the door ignores further requests and closes anyway (nudging). This bound is what makes the worst-case stop duration finite.',
  },
  {
    id: 'answer.maxTransferSeconds',
    type: 'continuous',
    range: [0, 120],
    scale: 'linear',
    default: DOOR_DEFAULTS.maxTransferSeconds,
    unit: 's',
    description:
      'Ceiling on the transfer-driven dwell — the per-stop form of the RTT term 2*P*tp, which the caller supplies as DoorStopReason.transferSeconds. Bounds the worst-case stop; 0 makes the dwell purely a policy decision again.',
  },
];
