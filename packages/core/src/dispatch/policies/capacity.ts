/**
 * Capacity-driven reassignment — the load sensor wired into stage 5.
 *
 * ```ts
 * const monitor = new CapacityReassignmentMonitor();
 * // ...on every dispatch pass, after the cars have loaded:
 * const result = monitor.run(policy, snapshots, kernel.now());
 * for (const migration of result.migrated) applyDecision(migration);
 * ```
 *
 * docs/06-parameterization-and-tuning.md § Stage 5 states the mechanism exactly:
 *
 * > *Real systems commit when the car begins decelerating for the floor. Before that,
 * > reassignment is free. This is exactly the mechanism that makes **capacity-driven bypass**
 * > work: when a car crosses its load threshold, its uncommitted calls migrate.*
 *
 * And docs/01-architecture.md § *Why not pure agent-per-elevator* names it as the second of the
 * three reasons a pure agent model fails: *"When the load sensor reports full, that car's
 * committed hall calls must migrate elsewhere."*
 *
 * ## Nothing calls this yet, and the snippet above is the fix rather than a description
 *
 * `sim/simulation.ts` contains **no `reconsider` call site at all**, so capacity-driven migration
 * does not fire in a run: no monitor is constructed, no sweep is taken, and stage 5 is reached only
 * from a test. Everything below is therefore proved at the decision level and nowhere else, and the
 * mechanism's value against `reassignmentPolicy: never` — the control arm the module's own docs name
 * — has not been measured on any building. One monitor per bank, `run` after the cars have loaded,
 * `reset` per replication, is the whole of what `sim/` owes; `index.ts` § *Nothing in this directory
 * is reachable from `runSimulation` yet* lists it beside the other four gaps.
 *
 * ## This is a trigger, not a second stage 5
 *
 * The whole of the reassignment *decision* already exists in `policy.ts` and `lifecycle.ts`: the
 * `reassignmentPolicy` gate, the `commitmentPoint` latch, `reassignmentHysteresisS`, and
 * `maxReassignmentsPerCall`. What was missing was the **edge**: nothing told the group controller
 * to look when a car filled up. That is all this file adds, and the shape it takes is the whole
 * argument for it being here rather than folded into the policy:
 *
 * - **Nothing here reads a threshold.** `car.load.isBypassingHallCalls` is the load cell's own
 *   answer, derived from `answer.bypassLoadThreshold`, which `LOAD_SENSOR_PARAMETERS` declares.
 *   The trigger reads the *effect*, so there is one source of truth for the number and a profile
 *   that moves the threshold moves the trigger with it — including a car whose spec gives it a
 *   different threshold from its neighbours.
 * - **Nothing here decides whether a call may move.** Every call held by a crossed car is handed
 *   to `policy.reconsider`, and the four gates answer. Re-checking commitment here would be a
 *   second implementation of a latch, and a latch implemented twice is a latch that eventually
 *   disagrees with itself.
 * - **It declares no tunable.** See `parameters.ts` § *What is deliberately not here*. A
 *   behaviour that needed a new knob to work was not wired up; it was reimplemented.
 *
 * ## Why a rising edge and not a state
 *
 * A car that has been full for ten seconds has already had its calls reconsidered. Re-running
 * stage 5 for it on every dispatch pass would spend the `maxReassignmentsPerCall` budget on
 * decisions that cannot change — and worse, it would spend it *unevenly*: the calls of a car that
 * stays full through a long lobby dwell would exhaust their budget and then be unable to move when
 * a genuinely better car appeared. So the monitor keeps one boolean per car and fires on the
 * transition, which is what a real load-weighing controller does with its comparator.
 *
 * The falling edge is remembered too, so a car that unloads and fills again fires again. That is
 * a real second crossing, not a repeat of the first.
 *
 * ## Determinism
 *
 * Crossings are reported in the order the cars were supplied; calls are reconsidered in
 * registration order, which is `DispatchPolicy.calls`'s documented order. No clock, no RNG. The
 * same monitor fed the same snapshots at the same time produces the same result, which
 * `capacity.test.ts` asserts by running it a hundred times.
 */

import type { SimTime } from '../../kernel/types.js';
import type { CarSnapshot } from '../../model/car/types.js';
import type { DispatchDecision, DispatchPolicy } from '../types.js';

import type {
  CallContextSource,
  CallMigration,
  CapacityReassignmentResult,
  LoadCrossing,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The trigger
 * -------------------------------------------------------------------------- */

/** The three capabilities capacity migration needs from a policy. Nothing wider. */
export type ReassignableGroup = Pick<DispatchPolicy, 'calls' | 'reconsider' | 'lifecycle'>;

/**
 * Cars whose hall-call bypass has just gone from off to on.
 *
 * Pure: `previous` is read, never written, and the caller owns the state. Exposed separately from
 * {@link CapacityReassignmentMonitor} so the edge detection is testable without a policy, and so a
 * runner that already tracks car load can use it directly.
 */
export function loadCrossings(
  previous: ReadonlyMap<string, boolean>,
  cars: readonly CarSnapshot[],
  at: SimTime,
): readonly LoadCrossing[] {
  const crossings: LoadCrossing[] = [];
  for (const car of cars) {
    if (!car.load.isBypassingHallCalls) continue;
    if (previous.get(car.carId) === true) continue;
    crossings.push(
      Object.freeze({
        carId: car.carId,
        loadFactor: car.load.loadFactor,
        bypassLoadThreshold: car.load.bypassLoadThreshold,
        at,
      }),
    );
  }
  return Object.freeze(crossings);
}

const EMPTY_RESULT_LISTS = {
  crossings: Object.freeze([]),
  migrated: Object.freeze([]),
  held: Object.freeze([]),
  decisions: Object.freeze([]),
} as const;

/**
 * The load-sensor comparator for one bank, and the stage-5 sweep it triggers.
 *
 * Stateful, because an edge is by definition a fact about two instants. The state is one boolean
 * per car id, and {@link reset} clears it — a replication that inherits the previous one's
 * comparator state would fire a spurious crossing, or miss a real one, on its first pass
 * (docs/03-traffic-and-statistics.md: replications must be independent).
 */
export class CapacityReassignmentMonitor {
  /** Car id to "was bypassing hall calls when last observed". */
  readonly #bypassing = new Map<string, boolean>();

  /** Whether this car was bypassing hall calls at the last observation. */
  isBypassing(carId: string): boolean {
    return this.#bypassing.get(carId) === true;
  }

  /**
   * Observe the bank and report rising edges, updating the comparator.
   *
   * Idempotent within one instant only in the sense that matters: calling it twice on the same
   * snapshots reports the crossing once, because the first call latches it. That is the whole
   * point of an edge detector, and it is why the sweep is a separate method — a caller that wants
   * to know *whether* anything crossed without triggering stage 5 would otherwise consume the
   * edge.
   */
  observe(cars: readonly CarSnapshot[], at: SimTime): readonly LoadCrossing[] {
    const crossings = loadCrossings(this.#bypassing, cars, at);
    for (const car of cars) this.#bypassing.set(car.carId, car.load.isBypassingHallCalls);
    return crossings;
  }

  /**
   * Observe the bank and, for every car that has just filled up, re-run stage 5 on the calls it
   * holds.
   *
   * Every gate is the policy's. What comes back is a classification of what the policy decided:
   *
   * | Field | Means |
   * |---|---|
   * | {@link CapacityReassignmentResult.migrated} | the call is no longer on the crossed car |
   * | {@link CapacityReassignmentResult.held} | it is, and {@link CallMigration.reason} says which gate kept it |
   *
   * The gates a `held` entry reports, and why each is correct rather than a failure:
   *
   * - **`committed`** — the car is already decelerating for that floor. It will stop, and the
   *   passengers it cannot fit are re-offered at the landing; taking the call away now would send
   *   a second car to a floor the first is about to open at.
   * - **`max-reassignments`** — the starvation guard. A call handed on indefinitely is never
   *   served, and a bank in which several cars fill in sequence is exactly where that happens.
   * - **`below-hysteresis`** — reachable only when the crossed car is *still eligible*, which
   *   means the `allowBypassIfSoleEligibleCar` guard admitted it because no other car serves the
   *   floor at all. Moving it would strand the landing.
   * - **`no-eligible-car`** — every other car refused too. The call stays where it is rather than
   *   becoming unassigned, because an unassigned call at a floor no car will take is a floor that
   *   starves silently.
   * - **`reassignment-disabled`** — the profile set `reassignmentPolicy: never`, which says an
   *   allocation is final. Capacity migration is stage 5; a configuration that switches stage 5
   *   off does not get it, and that is the control arm the mechanism's value is measured against.
   *
   * @param contextFor what the caller knows about each landing — the live queue count. Omit it and
   *   each call is re-priced against the count its lifecycle accumulated, which is what the
   *   original assignment used.
   */
  run(
    policy: ReassignableGroup,
    cars: readonly CarSnapshot[],
    at: SimTime,
    contextFor?: CallContextSource | undefined,
  ): CapacityReassignmentResult {
    const crossings = this.observe(cars, at);
    if (crossings.length === 0) return Object.freeze({ at, ...EMPTY_RESULT_LISTS });

    const crossed = new Set(crossings.map((crossing) => crossing.carId));
    const migrated: CallMigration[] = [];
    const held: CallMigration[] = [];
    const decisions: DispatchDecision[] = [];

    // Registration order, and a frozen copy taken before the first decision, so a lifecycle
    // replaced mid-sweep cannot reorder the sweep.
    for (const lifecycle of policy.calls) {
      const holder = lifecycle.carIds.find((carId) => crossed.has(carId));
      if (holder === undefined) continue;

      const decision = policy.reconsider(lifecycle.callId, cars, at, contextFor?.(lifecycle));
      decisions.push(decision);

      const migration: CallMigration = Object.freeze({
        callId: lifecycle.callId,
        fromCarId: holder,
        toCarIds: decision.carIds,
        outcome: decision.outcome,
        reason: decision.reason,
        reassignments: policy.lifecycle(lifecycle.callId)?.reassignments ?? lifecycle.reassignments,
      });

      if (decision.carIds.includes(holder)) held.push(migration);
      else migrated.push(migration);
    }

    return Object.freeze({
      at,
      crossings,
      migrated: Object.freeze(migrated),
      held: Object.freeze(held),
      decisions: Object.freeze(decisions),
    });
  }

  /** Forget every car's load state. For reusing a monitor across replications. */
  reset(): void {
    this.#bypassing.clear();
  }
}

/* -------------------------------------------------------------------------- *
 * Reading the result
 * -------------------------------------------------------------------------- */

/**
 * Calls a crossed car still holds that the group *could* have moved but did not, with the gate
 * that stopped it.
 *
 * Diagnostic, and the useful diagnostic: a bank whose capacity migrations are all
 * `max-reassignments` is a bank whose starvation guard is set too tight for its traffic, and a
 * bank whose migrations are all `committed` has its `commitmentPoint` set earlier than the
 * mechanism can work with. Both look identical in an AWT mean.
 */
export function heldBy(
  result: CapacityReassignmentResult,
  reason: CallMigration['reason'],
): readonly CallMigration[] {
  return Object.freeze(result.held.filter((migration) => migration.reason === reason));
}

/** Whether any call left a car on this sweep. */
export function hasMigrations(result: CapacityReassignmentResult): boolean {
  return result.migrated.length > 0;
}

/**
 * The largest reassignment count any call reached on this sweep.
 *
 * `maxReassignmentsPerCall` bounds it, and `capacity.test.ts` drives a bank until every car has
 * filled and asserts the bound holds — the guard is only a guard if it is checked against the
 * mechanism that stresses it.
 */
export function peakReassignments(result: CapacityReassignmentResult): number {
  let peak = 0;
  for (const migration of [...result.migrated, ...result.held]) {
    if (migration.reassignments > peak) peak = migration.reassignments;
  }
  return peak;
}

/** Calls the sweep looked at, migrated or held, in registration order. */
export function consideredCalls(result: CapacityReassignmentResult): readonly string[] {
  return Object.freeze(result.decisions.map((decision) => decision.callId));
}
