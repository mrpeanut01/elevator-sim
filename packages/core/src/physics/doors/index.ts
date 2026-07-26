/**
 * `core/physics/doors` — the door state machine.
 *
 * A door is an immutable value and every function here is pure. There is no class, no
 * scheduling and no hidden state: `advanceDoor` runs the door forward to a time,
 * `applyDoorCommand` applies an input at a time, and both return a new state plus the
 * transitions that happened. See the module docstring in `doorMachine.ts` for the rationale
 * and for the recipe that drives this from `SimKernel`.
 *
 * ```ts
 * const config = resolveDoorConfig(car, profile.answer);
 * let door = createDoorState(0);
 *
 * // The car has arrived to answer a hall call with four people waiting.
 * ({ state: door } = applyDoorCommand(
 *   door,
 *   { kind: 'open', reason: { carCall: false, hallCall: true, hallQueueLength: 4 } },
 *   0,
 *   config,
 * ));
 *
 * // Nothing interrupts: run to the end of the stop.
 * const { state: shut, events } = advanceDoor(door, 1_000, config);
 * shut.accounting.totalS; // openS + dwell + closeS
 * ```
 *
 * Nothing in here reads a wall clock, and nothing draws a random number: whether a
 * passenger obstructs the doors is decided by the caller from the injected `StreamSet`'s
 * `doorObstruction` stream and delivered as a `{ kind: 'reopen', cause: 'obstruction' }`
 * command (CLAUDE.md invariants 2 and 3).
 */

export {
  advanceDoor,
  applyDoorCommand,
  createDoorState,
  doorAccountingAt,
  doorOpenFractionAt,
  dwellSecondsFor,
  isDoorMoving,
  maxStopSeconds,
  mergeStopReasons,
  nextDoorTransitionAt,
  nominalStopSeconds,
  resolveDoorConfig,
} from './doorMachine.js';

export {
  DOOR_DEFAULTS,
  DOOR_EVENT_TYPES,
  DOOR_OPEN_DECLINES,
  DOOR_PARAMETERS,
  DOOR_REOPEN_CAUSES,
  DOOR_REOPEN_REFUSALS,
  DOOR_STATES,
} from './types.js';

export type {
  DoorAnswerSource,
  DoorCommand,
  DoorConfig,
  DoorConfigOverrides,
  DoorEvent,
  DoorEventType,
  DoorMachineState,
  DoorOpenDecline,
  DoorParameterSpec,
  DoorParameterType,
  DoorReopenCause,
  DoorReopenRefusal,
  DoorState,
  DoorStep,
  DoorStopReason,
  DoorTimeAccounting,
  DoorTimingSource,
} from './types.js';
