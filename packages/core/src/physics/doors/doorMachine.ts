/**
 * The door state machine.
 *
 * ## Design: a pure transition function, not a kernel-driven object
 *
 * This module contains **no scheduling, no timers, no mutation and no RNG**. A door is a
 * plain immutable value; every function here is a pure function of
 * `(state, time, config)` (plus, for {@link applyDoorCommand}, an input command) and returns
 * a new value. The alternative — a stateful object that schedules its own kernel events —
 * was rejected for three reasons:
 *
 * 1. **It is testable in isolation.** Asserting a full open/dwell/close cycle needs no
 *    kernel, no car and no dispatcher; a test is a sequence of `(command, time)` pairs.
 * 2. **It is trivially deterministic.** With no hidden state and no scheduling, the same
 *    inputs give bit-identical outputs every time, on every machine. Nothing can perturb a
 *    door but the times and commands the caller supplies.
 * 3. **The renderer needs the closed form anyway.** {@link doorOpenFractionAt} is to doors
 *    what `Car.positionAt(t)` is to motion: the kernel schedules only meaningful instants
 *    and the viewer interpolates between them.
 *
 * ### How a car controller drives it from the kernel
 *
 * The machine tells the kernel when to wake it; the kernel never tells the machine what to
 * do. The recipe, in full:
 *
 * ```ts
 * // 1. Something happens (the car arrives, the photo-eye trips, time passes).
 * const step = applyDoorCommand(door, { kind: 'open', reason }, kernel.now(), doorConfig);
 * door = step.state;
 * emit(step.events);
 *
 * // 2. Ask when the door next moves on its own, and schedule exactly that instant.
 * const at = nextDoorTransitionAt(door, doorConfig);
 * if (at !== undefined) {
 *   pending = kernel.schedule(at, createEvent('door.tick', (_, ctx) => {
 *     const advanced = advanceDoor(door, ctx.time, doorConfig);
 *     door = advanced.state;
 *     emit(advanced.events);
 *     // ...and reschedule from the new state.
 *   }));
 * }
 *
 * // 3. When an event supersedes the pending transition, cancel it (kernel.cancel(pending))
 * //    rather than letting it fire and deciding it was irrelevant.
 * ```
 *
 * Because `advanceDoor` replays every automatic transition up to the supplied time, a
 * missed or coalesced wake-up cannot corrupt the door: calling it once at `t = 60` gives
 * exactly the state and event list that a hundred intermediate wake-ups would have.
 *
 * ## What bounds a stop
 *
 * Reopening is bounded by {@link DoorConfig.maxReopensPerStop}. Once that budget is spent
 * the door refuses further requests and closes — real controllers call this **nudging**:
 * after repeated interruptions the photo-eye is ignored and the door closes anyway. The
 * dwell of each open period is bounded too: by the policy ceiling, and by
 * {@link DoorConfig.maxTransferSeconds} for the part the caller drives with declared
 * passenger transfer time. {@link maxStopSeconds} multiplies the two bounds into the
 * worst-case stop duration in closed form, and `doorMachine.test.ts` fuzzes command
 * sequences against it.
 */

import type { SimTime } from '../../kernel/types.js';
import { DOOR_DEFAULTS } from './types.js';
import type {
  DoorAnswerSource,
  DoorCommand,
  DoorConfig,
  DoorConfigOverrides,
  DoorEvent,
  DoorMachineState,
  DoorReopenCause,
  DoorReopenRefusal,
  DoorState,
  DoorStep,
  DoorStopReason,
  DoorTimeAccounting,
  DoorTimingSource,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** A stop that has not started: no time in any phase, no reopens. */
const ZERO_ACCOUNTING: DoorTimeAccounting = Object.freeze({
  openingS: 0,
  dwellS: 0,
  closingS: 0,
  abortedClosingS: 0,
  totalS: 0,
  reopens: 0,
  obstructions: 0,
  lateArrivals: 0,
  refusedReopens: 0,
});

/** No declared reason. Dwell falls back to the car-call value; see {@link dwellSecondsFor}. */
const NO_REASON: DoorStopReason = Object.freeze({
  carCall: false,
  hallCall: false,
  hallQueueLength: 0,
  transferSeconds: 0,
});

const NO_EVENTS: readonly DoorEvent[] = Object.freeze([]);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Door config: ${label} must be a finite number; received ${value}`);
  }
  return value;
}

function requirePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Door config: ${label} must be a finite number > 0; received ${value}`);
  }
  return value;
}

function requireNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Door config: ${label} must be a finite number >= 0; received ${value}`);
  }
  return value;
}

/**
 * Assemble a {@link DoorConfig} from the data that owns each value.
 *
 * Precedence is `overrides` > `answer` (the dispatcher profile's answer stage) > `car` (the
 * resolved elevator class) > {@link DOOR_DEFAULTS}. Nothing is invented: the physical
 * timings originate in `data/elevator-specs.json` and the control settings in
 * `data/dispatcher-profiles.json`, which is CLAUDE.md invariant 7 applied to doors.
 *
 * `answer` is typed as {@link DoorAnswerSource} rather than `AnswerStageConfig` so that
 * every tunable this module declares under `answer.*` is actually read from the answer
 * stage; an `AnswerStageConfig` satisfies it. Two of those keys — `maxReopensPerStop` and
 * `maxTransferSeconds` — are not yet accepted by `answerStageSchema`, so today they can only
 * arrive through `overrides`; see the note on {@link DOOR_PARAMETERS}.
 *
 * Pure. Validates eagerly, because a door whose close time is zero produces plausible-
 * looking nonsense rather than an error.
 *
 * @throws RangeError if a timing is non-finite, negative, or — for `openS`/`closeS` — zero,
 *   if `maxReopensPerStop` is not a non-negative integer, or if `dwellPolicy` is `adaptive`
 *   with a `maxDwellS` below the larger base dwell (which would make adaptive dwell shorter
 *   than fixed dwell: certainly a config mistake, never an intent).
 */
export function resolveDoorConfig(
  car: DoorTimingSource,
  answer?: DoorAnswerSource | undefined,
  overrides?: DoorConfigOverrides | undefined,
): DoorConfig {
  const openS = requirePositive(overrides?.openS ?? car.doorOpenS, 'openS');
  const closeS = requirePositive(overrides?.closeS ?? car.doorCloseS, 'closeS');
  const dwellCarCallS = requireNonNegative(
    overrides?.dwellCarCallS ?? car.dwellCarCallS,
    'dwellCarCallS',
  );
  const dwellHallCallS = requireNonNegative(
    overrides?.dwellHallCallS ?? car.dwellHallCallS,
    'dwellHallCallS',
  );

  const dwellPolicy = overrides?.dwellPolicy ?? answer?.dwellPolicy ?? DOOR_DEFAULTS.dwellPolicy;
  const dwellAdaptationGain = requireNonNegative(
    overrides?.dwellAdaptationGain ?? answer?.dwellAdaptationGain ?? DOOR_DEFAULTS.dwellAdaptationGain,
    'dwellAdaptationGain',
  );
  const maxDwellS = requireNonNegative(
    overrides?.maxDwellS ?? answer?.maxDwellS ?? DOOR_DEFAULTS.maxDwellS,
    'maxDwellS',
  );
  const reopenOnLateArrival =
    overrides?.reopenOnLateArrival ?? answer?.reopenOnLateArrival ?? DOOR_DEFAULTS.reopenOnLateArrival;
  const maxReopensPerStop =
    overrides?.maxReopensPerStop ?? answer?.maxReopensPerStop ?? DOOR_DEFAULTS.maxReopensPerStop;
  if (!Number.isInteger(maxReopensPerStop) || maxReopensPerStop < 0) {
    throw new RangeError(
      `Door config: maxReopensPerStop must be a non-negative integer; received ${maxReopensPerStop}`,
    );
  }
  const maxTransferSeconds = requireNonNegative(
    overrides?.maxTransferSeconds ?? answer?.maxTransferSeconds ?? DOOR_DEFAULTS.maxTransferSeconds,
    'maxTransferSeconds',
  );

  const baseCeiling = Math.max(dwellCarCallS, dwellHallCallS);
  if (dwellPolicy === 'adaptive' && maxDwellS < baseCeiling) {
    throw new RangeError(
      `Door config: dwellPolicy "adaptive" requires maxDwellS >= the larger base dwell (${baseCeiling}s); received ${maxDwellS}s. A lower ceiling would make adaptive dwell shorter than fixed dwell.`,
    );
  }

  return Object.freeze({
    openS,
    closeS,
    dwellCarCallS,
    dwellHallCallS,
    dwellPolicy,
    dwellAdaptationGain,
    maxDwellS,
    reopenOnLateArrival,
    maxReopensPerStop,
    maxTransferSeconds,
  });
}

// ---------------------------------------------------------------------------
// Stop reasons and dwell
// ---------------------------------------------------------------------------

/** Waiting passengers declared by a reason, defaulting to none. */
function queueOf(reason: DoorStopReason): number {
  const queue = reason.hallQueueLength;
  return queue === undefined || !Number.isFinite(queue) || queue < 0 ? 0 : queue;
}

/** Passenger transfer seconds declared by a reason, defaulting to none. */
function transferOf(reason: DoorStopReason): number {
  const seconds = reason.transferSeconds;
  return seconds === undefined || !Number.isFinite(seconds) || seconds < 0 ? 0 : seconds;
}

/**
 * Combine two reasons for the same stop: the union of the calls, and the larger of each
 * quantity.
 *
 * A stop that started as a car call and then also answered a hall call is a stop for both,
 * which is why the machine merges rather than overwrites. Taking the larger transfer time
 * (rather than the sum) matches how the caller is expected to declare it: each declaration
 * states the transfer the *whole stop* needs, revised as the load model learns more.
 */
export function mergeStopReasons(a: DoorStopReason, b: DoorStopReason): DoorStopReason {
  return Object.freeze({
    carCall: a.carCall || b.carCall,
    hallCall: a.hallCall || b.hallCall,
    hallQueueLength: Math.max(queueOf(a), queueOf(b)),
    transferSeconds: Math.max(transferOf(a), transferOf(b)),
  });
}

/** Whether two reasons say the same thing, after normalization. */
function sameStopReason(a: DoorStopReason, b: DoorStopReason): boolean {
  return (
    a.carCall === b.carCall &&
    a.hallCall === b.hallCall &&
    queueOf(a) === queueOf(b) &&
    transferOf(a) === transferOf(b)
  );
}

/** Dwell before any adaptive extension: the longer of the applicable base values. */
function baseDwellSeconds(config: DoorConfig, reason: DoorStopReason): number {
  if (reason.carCall && reason.hallCall) {
    // Both: passengers alighting and passengers boarding do not take turns, so the stop
    // takes the longer of the two, not their sum.
    return Math.max(config.dwellCarCallS, config.dwellHallCallS);
  }
  if (reason.hallCall) {
    return config.dwellHallCallS;
  }
  // Car call, or a stop with no declared reason (a repositioning door cycle, say): the
  // shorter value, since nobody has to walk to the car.
  return config.dwellCarCallS;
}

/** The dwell the *policy* grants, before passenger transfer is taken into account. */
function policyDwellSeconds(config: DoorConfig, reason: DoorStopReason): number {
  const base = baseDwellSeconds(config, reason);
  if (config.dwellPolicy === 'fixed') {
    return base;
  }
  return Math.min(base + config.dwellAdaptationGain * queueOf(reason), config.maxDwellS);
}

/**
 * How long the door dwells open, given why the car stopped.
 *
 * Two things set it, and the dwell is the **longer** of them:
 *
 * 1. *Policy.* Under `fixed` this is the base dwell for the calls answered. Under `adaptive`
 *    it extends with the hall queue — `base + gain * queue` — clamped at
 *    {@link DoorConfig.maxDwellS}. Adaptive dwell is the deliberate exception to "physical
 *    parameters are not control decisions": how long to hold the door is both, which is
 *    exactly why the gain and the ceiling are tunables rather than constants (see
 *    docs/06-parameterization-and-tuning.md § Layer 1).
 * 2. *Passenger flow.* {@link DoorStopReason.transferSeconds}, clamped at
 *    {@link DoorConfig.maxTransferSeconds}. The base dwells size the reaction — noticing the
 *    car, walking to it — not the queue moving through the doorway. Twelve people boarding
 *    at a lobby take `12 * tp >= 14.4 s` whatever the dwell policy says, and this is the
 *    `2*P*tp` term the Barney/CIBSE RTT oracle checks the simulation against
 *    (docs/03-traffic-and-statistics.md § Part 2).
 *
 * Taking the maximum rather than the sum is the same rule the base dwells already follow:
 * the reaction time and the transfer overlap, they do not queue up behind one another.
 *
 * Pure. Monotonically non-decreasing in both the queue length and the declared transfer, and
 * never above `max(policy ceiling, maxTransferSeconds)` — which is what keeps
 * {@link maxStopSeconds} finite.
 */
export function dwellSecondsFor(config: DoorConfig, reason: DoorStopReason): number {
  const transfer = Math.min(transferOf(reason), config.maxTransferSeconds);
  return Math.max(policyDwellSeconds(config, reason), transfer);
}

/**
 * Stop duration with no reopens: open, dwell, close.
 *
 * The reference point for attribution — `accounting.totalS - nominalStopSeconds(...)` is
 * the time a stop's reopens cost.
 */
export function nominalStopSeconds(config: DoorConfig, reason: DoorStopReason): number {
  return config.openS + dwellSecondsFor(config, reason) + config.closeS;
}

/**
 * Upper bound on the total door time of one stop, over every possible command sequence.
 *
 * ```
 * openS                                   the initial open
 * + (maxReopens + 1) * dwellCeiling       one dwell per open period
 * + maxReopens * (closeS + openS)         each aborted close, then reversing back open
 * + closeS                                the close that completes
 * ```
 *
 * where `dwellCeiling` is the largest dwell {@link dwellSecondsFor} can return:
 * `max(policy ceiling, maxTransferSeconds)`, the policy ceiling being `maxDwellS` under the
 * adaptive policy and the larger base dwell under the fixed one. The transfer term has to
 * appear here because the caller supplies `transferSeconds`, so without a declared ceiling
 * the stop would have no bound at all. Not tight — a reopen at fraction `f` really costs
 * `f*closeS + (1-f)*openS <= max(closeS, openS)`, and a stop rarely declares the maximum
 * transfer — but it is a bound in closed form, and it is finite, which is the property that
 * matters: no sequence of obstructions can hold a door open forever.
 */
export function maxStopSeconds(config: DoorConfig): number {
  const policyCeiling =
    config.dwellPolicy === 'adaptive'
      ? config.maxDwellS
      : Math.max(config.dwellCarCallS, config.dwellHallCallS);
  const dwellCeiling = Math.max(policyCeiling, config.maxTransferSeconds);
  return (
    config.openS +
    (config.maxReopensPerStop + 1) * dwellCeiling +
    config.maxReopensPerStop * (config.closeS + config.openS) +
    config.closeS
  );
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** A shut door at rest. The starting point for every car. */
export function createDoorState(at: SimTime = 0): DoorMachineState {
  requireFinite(at, 'initial time');
  return Object.freeze({
    state: 'closed' as DoorState,
    since: at,
    openFractionAtSince: 0,
    stopStartedAt: undefined,
    reason: NO_REASON,
    grantedDwellS: 0,
    reopenCount: 0,
    accounting: ZERO_ACCOUNTING,
  });
}

/** `true` while a stop is in progress — the door is not shut. */
export function isDoorMoving(door: DoorMachineState): boolean {
  return door.state !== 'closed';
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * How far open the door is at `at`, from 0 (shut) to 1 (fully open).
 *
 * Closed form, so a renderer can sample it at display framerate between kernel events. The
 * door travels at a constant `1/openS` while opening and `1/closeS` while closing, so a
 * reopen from 40% open takes `0.6 * openS` to finish opening — the reversal costs only the
 * distance actually lost.
 *
 * `at` before the current state was entered clamps to that state's starting fraction rather
 * than extrapolating backwards.
 */
export function doorOpenFractionAt(
  door: DoorMachineState,
  at: SimTime,
  config: DoorConfig,
): number {
  const elapsed = Math.max(0, at - door.since);
  switch (door.state) {
    case 'closed':
      return 0;
    case 'open':
      return 1;
    case 'opening':
      return clamp01(door.openFractionAtSince + elapsed / config.openS);
    case 'closing':
      return clamp01(door.openFractionAtSince - elapsed / config.closeS);
  }
}

/**
 * When the door next moves without being told to, or `undefined` if it is at rest.
 *
 * This is the value to hand to `kernel.schedule()`. A shut door has no pending transition;
 * every other state has exactly one.
 */
export function nextDoorTransitionAt(
  door: DoorMachineState,
  config: DoorConfig,
): SimTime | undefined {
  switch (door.state) {
    case 'closed':
      return undefined;
    case 'opening':
      return door.since + (1 - door.openFractionAtSince) * config.openS;
    case 'open':
      return door.since + door.grantedDwellS;
    case 'closing':
      return door.since + door.openFractionAtSince * config.closeS;
  }
}

// ---------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------

type PhaseBucket = 'openingS' | 'dwellS' | 'closingS';

/** Which accounting bucket a state's time lands in. `closed` accrues nothing. */
function bucketFor(state: DoorState): PhaseBucket | undefined {
  switch (state) {
    case 'opening':
      return 'openingS';
    case 'open':
      return 'dwellS';
    case 'closing':
      return 'closingS';
    case 'closed':
      return undefined;
  }
}

/** Add `seconds` to one phase, keeping `totalS` consistent by construction. */
function addPhaseTime(
  accounting: DoorTimeAccounting,
  bucket: PhaseBucket,
  seconds: number,
  abortedClose = false,
): DoorTimeAccounting {
  const amount = Math.max(0, seconds);
  return Object.freeze({
    ...accounting,
    [bucket]: accounting[bucket] + amount,
    totalS: accounting.totalS + amount,
    abortedClosingS: accounting.abortedClosingS + (abortedClose ? amount : 0),
  });
}

/** Close out the phase the door is in at `at`, without changing state. */
function settleCurrentPhase(
  door: DoorMachineState,
  at: SimTime,
  abortedClose = false,
): DoorTimeAccounting {
  const bucket = bucketFor(door.state);
  if (bucket === undefined) {
    return door.accounting;
  }
  return addPhaseTime(door.accounting, bucket, at - door.since, abortedClose);
}

/**
 * The stop's accounting as of `at`, including the phase currently in progress.
 *
 * `door.accounting` only counts *completed* phases; this is what the metrics layer should
 * read mid-stop. Automatic transitions due before `at` are applied first, so the answer is
 * correct even if the caller has not advanced the door recently. After the door has shut
 * the two agree.
 */
export function doorAccountingAt(
  door: DoorMachineState,
  at: SimTime,
  config: DoorConfig,
): DoorTimeAccounting {
  return settleCurrentPhase(advanceDoor(door, at, config).state, at);
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function event(
  type: DoorEvent['type'],
  at: SimTime,
  from: DoorState,
  to: DoorState,
  openFraction: number,
  extra: Omit<DoorEvent, 'type' | 'at' | 'from' | 'to' | 'openFraction'> = {},
): DoorEvent {
  return Object.freeze({ type, at, from, to, openFraction, ...extra });
}

function assertNotInThePast(door: DoorMachineState, at: SimTime): void {
  requireFinite(at, 'time');
  if (at < door.since) {
    throw new RangeError(
      `Door time must not run backwards: the door entered "${door.state}" at ${door.since}s and was asked about ${at}s.`,
    );
  }
}

/** Fire the one automatic transition due at `at`. Caller has checked it is due. */
function fireAutomatic(
  door: DoorMachineState,
  at: SimTime,
  config: DoorConfig,
): { readonly state: DoorMachineState; readonly event: DoorEvent } {
  switch (door.state) {
    case 'opening': {
      const accounting = settleCurrentPhase(door, at);
      const grantedDwellS = dwellSecondsFor(config, door.reason);
      return {
        state: Object.freeze({
          ...door,
          state: 'open' as DoorState,
          since: at,
          openFractionAtSince: 1,
          grantedDwellS,
          accounting,
        }),
        event: event('door.opened', at, 'opening', 'open', 1, { dwellS: grantedDwellS }),
      };
    }
    case 'open': {
      const accounting = settleCurrentPhase(door, at);
      return {
        state: Object.freeze({
          ...door,
          state: 'closing' as DoorState,
          since: at,
          openFractionAtSince: 1,
          accounting,
        }),
        event: event('door.closeStarted', at, 'open', 'closing', 1),
      };
    }
    case 'closing': {
      const accounting = settleCurrentPhase(door, at);
      return {
        state: Object.freeze({
          ...door,
          state: 'closed' as DoorState,
          since: at,
          openFractionAtSince: 0,
          grantedDwellS: 0,
          accounting,
        }),
        // The completed stop's accounting rides on the event so the metrics layer never has
        // to poll: by the time the door is shut, the record is final.
        event: event('door.closed', at, 'closing', 'closed', 0, { accounting }),
      };
    }
    case 'closed':
      throw new RangeError('A shut door has no automatic transition');
  }
}

/**
 * Run the door forward to `at`, firing every automatic transition on the way.
 *
 * Idempotent in the sense that matters: `advanceDoor(door, t)` yields the same state as any
 * chain of intermediate calls ending at `t`, and the events come back in chronological
 * order. At most three transitions can fire from any state — `opening → open → closing →
 * closed` — and `closed` is a fixed point, so the loop always terminates.
 *
 * Pure: `door` is not mutated.
 *
 * @throws RangeError if `at` precedes the time the current state was entered.
 */
export function advanceDoor(door: DoorMachineState, at: SimTime, config: DoorConfig): DoorStep {
  assertNotInThePast(door, at);

  let current = door;
  let events: DoorEvent[] | undefined;

  for (;;) {
    const next = nextDoorTransitionAt(current, config);
    if (next === undefined || next > at) {
      break;
    }
    const fired = fireAutomatic(current, next, config);
    current = fired.state;
    (events ??= []).push(fired.event);
  }

  return Object.freeze({
    state: current,
    events: events === undefined ? NO_EVENTS : Object.freeze(events),
  });
}

/** Increment the counter matching a reopen cause. */
function countedReopen(
  accounting: DoorTimeAccounting,
  cause: DoorReopenCause,
): DoorTimeAccounting {
  return Object.freeze({
    ...accounting,
    reopens: accounting.reopens + 1,
    obstructions: accounting.obstructions + (cause === 'obstruction' ? 1 : 0),
    lateArrivals: accounting.lateArrivals + (cause === 'lateArrival' ? 1 : 0),
  });
}

/** Why a reopen cannot be honoured right now, or `undefined` if it can. */
function refusalFor(
  door: DoorMachineState,
  cause: DoorReopenCause,
  config: DoorConfig,
): DoorReopenRefusal | undefined {
  if (door.state === 'closed') {
    return 'doorClosed';
  }
  // Obstruction is a safety function: no dispatcher setting may switch the photo-eye off.
  // The courtesy hold for a late passenger is policy, and a profile may decline it.
  if (cause === 'lateArrival' && !config.reopenOnLateArrival) {
    return 'policyDisabled';
  }
  if (door.reopenCount >= config.maxReopensPerStop) {
    return 'reopenLimit';
  }
  return undefined;
}

function applyOpen(
  door: DoorMachineState,
  reason: DoorStopReason,
  at: SimTime,
  config: DoorConfig,
): DoorStep {
  if (door.state === 'closed') {
    // A fresh stop. Everything from the previous stop is discarded here, not when the door
    // shut, so the metrics layer can still read the completed record afterwards.
    const merged = mergeStopReasons(NO_REASON, reason);
    return Object.freeze({
      state: Object.freeze({
        state: 'opening' as DoorState,
        since: at,
        openFractionAtSince: 0,
        stopStartedAt: at,
        reason: merged,
        grantedDwellS: 0,
        reopenCount: 0,
        accounting: ZERO_ACCOUNTING,
      }),
      events: Object.freeze([event('door.openStarted', at, 'closed', 'opening', 0)]),
    });
  }

  const merged = mergeStopReasons(door.reason, reason);

  if (door.state === 'opening') {
    // Record the widened reason; it will set the dwell when the door reaches fully open, so
    // the stop really does honour it. No reversal — that is what `reopen` is for.
    return Object.freeze({
      state: Object.freeze({ ...door, reason: merged }),
      events: NO_EVENTS,
    });
  }

  if (door.state === 'closing') {
    // Too late. The dwell was granted when the door opened and has already been served, so
    // this reason cannot change what the stop did. Recording it anyway would leave the stop
    // measured against a dwell it never received: `totalS - nominalStopSeconds(reason)`, the
    // documented reopen overhead, would go negative. Leave `door.reason` alone and tell the
    // caller, which can follow up with a `reopen` if it wants the door back — that path
    // reverses the door, spends the bounded reopen budget, and earns a real dwell.
    if (sameStopReason(merged, door.reason)) {
      // The declaration added nothing, so nothing was lost and there is nothing to report.
      return Object.freeze({ state: door, events: NO_EVENTS });
    }
    return Object.freeze({
      state: door,
      events: Object.freeze([
        event('door.openDeclined', at, 'closing', 'closing', doorOpenFractionAt(door, at, config), {
          declined: 'doorClosing',
        }),
      ]),
      declined: 'doorClosing',
    });
  }

  // Already dwelling. Recompute against the widened reason, but keep the deadline anchored
  // to when the door opened (`since`), so merging reasons can extend the dwell only up to
  // the dwell ceiling and never indefinitely.
  const grantedDwellS = dwellSecondsFor(config, merged);
  if (grantedDwellS <= door.grantedDwellS) {
    return Object.freeze({
      state: Object.freeze({ ...door, reason: merged }),
      events: NO_EVENTS,
    });
  }
  return Object.freeze({
    state: Object.freeze({ ...door, reason: merged, grantedDwellS }),
    events: Object.freeze([
      event('door.dwellExtended', at, 'open', 'open', 1, { dwellS: grantedDwellS }),
    ]),
  });
}

function applyReopen(
  door: DoorMachineState,
  cause: DoorReopenCause,
  reason: DoorStopReason | undefined,
  at: SimTime,
  config: DoorConfig,
): DoorStep {
  // The refusal rules come first, in every state. They are policy — `reopenOnLateArrival`
  // and the per-stop reopen budget — and policy that only applies in three of the four
  // states is not policy: a request arriving during the 1.5–2.5 s opening phase (roughly a
  // fifth of a stop) would otherwise escape both rules, be counted nowhere, and still merge
  // a reason that grants a dwell the profile had switched off.
  const refusal = refusalFor(door, cause, config);
  if (refusal !== undefined) {
    // A refusal on a shut door leaves the just-completed stop's record alone: it has already
    // been published on `door.closed` and must not gain a count afterwards.
    const state =
      door.state === 'closed'
        ? door
        : Object.freeze({
            ...door,
            accounting: Object.freeze({
              ...door.accounting,
              refusedReopens: door.accounting.refusedReopens + 1,
            }),
          });
    return Object.freeze({
      state,
      events: Object.freeze([
        event('door.reopenRefused', at, door.state, door.state, doorOpenFractionAt(door, at, config), {
          cause,
          refusal,
        }),
      ]),
      refusal,
    });
  }

  // Honoured, so — and only so — the revised reason counts. A refused request must not be
  // able to lengthen the stop it was refused for.
  const merged = reason === undefined ? door.reason : mergeStopReasons(door.reason, reason);

  if (door.state === 'opening') {
    // Already opening: there is nothing to reverse and no time is lost, so this costs no slot
    // of the reopen budget and produces no transition. It still had to pass the rules above,
    // which is the difference between "free" and "invisible".
    return Object.freeze({
      state: Object.freeze({ ...door, reason: merged }),
      events: NO_EVENTS,
    });
  }

  if (door.state === 'open') {
    // Dwelling: the photo-eye or the hold button restarts the dwell timer from now.
    const accounting = countedReopen(settleCurrentPhase(door, at), cause);
    const grantedDwellS = dwellSecondsFor(config, merged);
    return Object.freeze({
      state: Object.freeze({
        ...door,
        since: at,
        openFractionAtSince: 1,
        reason: merged,
        grantedDwellS,
        reopenCount: door.reopenCount + 1,
        accounting,
      }),
      events: Object.freeze([
        event('door.dwellExtended', at, 'open', 'open', 1, { cause, dwellS: grantedDwellS }),
      ]),
    });
  }

  // Closing: reverse from wherever the door had got to. The partial close is still real
  // time and stays in `closingS`; it is additionally recorded in `abortedClosingS` so the
  // metrics layer can separate the close that worked from the ones that did not.
  const openFraction = doorOpenFractionAt(door, at, config);
  const accounting = countedReopen(settleCurrentPhase(door, at, true), cause);
  return Object.freeze({
    state: Object.freeze({
      ...door,
      state: 'opening' as DoorState,
      since: at,
      openFractionAtSince: openFraction,
      reason: merged,
      reopenCount: door.reopenCount + 1,
      accounting,
    }),
    events: Object.freeze([
      event('door.reopenStarted', at, 'closing', 'opening', openFraction, { cause }),
    ]),
  });
}

function applyClose(door: DoorMachineState, at: SimTime): DoorStep {
  // Only a dwelling door can be told to close early. While opening, a real door finishes
  // opening first; while closing or shut there is nothing to do.
  if (door.state !== 'open') {
    return Object.freeze({ state: door, events: NO_EVENTS });
  }
  return Object.freeze({
    state: Object.freeze({
      ...door,
      state: 'closing' as DoorState,
      since: at,
      openFractionAtSince: 1,
      accounting: settleCurrentPhase(door, at),
    }),
    events: Object.freeze([
      event('door.closeStarted', at, 'open', 'closing', 1, { forced: true }),
    ]),
  });
}

/**
 * Advance the door to `at`, then apply `command`.
 *
 * Advancing first is not an optimization — it is the semantics. A reopen at `t` can only
 * reverse a door that is still closing at `t`; if the close completed at `t - 0.1` the door
 * is shut and the request is refused, which is exactly what a real controller does.
 *
 * The returned events list is chronological: automatic transitions first, then whatever the
 * command caused. See {@link DoorCommand} for the full state/command matrix.
 *
 * Pure: `door` is not mutated, and no random draw is taken. Whether a passenger obstructs
 * the doors is the caller's decision, drawn from the injected `StreamSet`'s
 * `doorObstruction` stream — putting the draw here would couple every door to a generator
 * and break common random numbers the moment one configuration reopened more often than
 * another (CLAUDE.md invariant 2).
 *
 * @throws RangeError if `at` precedes the time the current state was entered.
 */
export function applyDoorCommand(
  door: DoorMachineState,
  command: DoorCommand,
  at: SimTime,
  config: DoorConfig,
): DoorStep {
  const advanced = advanceDoor(door, at, config);

  let step: DoorStep;
  switch (command.kind) {
    case 'open':
      step = applyOpen(advanced.state, command.reason, at, config);
      break;
    case 'reopen':
      step = applyReopen(advanced.state, command.cause, command.reason, at, config);
      break;
    case 'close':
      step = applyClose(advanced.state, at);
      break;
  }

  if (advanced.events.length === 0) {
    return step;
  }
  return Object.freeze({
    state: step.state,
    events: Object.freeze([...advanced.events, ...step.events]),
    ...(step.refusal === undefined ? {} : { refusal: step.refusal }),
    ...(step.declined === undefined ? {} : { declined: step.declined }),
  });
}
