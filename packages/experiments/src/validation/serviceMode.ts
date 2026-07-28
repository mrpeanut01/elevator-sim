/**
 * Service mode, injected — and an exact statement of how much of it that reaches.
 *
 * Two of Phase 8's adversarial cases are **"all cars out of service"** and **"mid-run mode
 * changes"**. Neither is reachable from any configuration this repository can author, and the
 * honest thing is to say precisely where the wall is before saying what is done about it.
 *
 * ## What exists in `core`, and what does not
 *
 * The *model* is complete. `Car` has a private `#mode`, a `setMode()` that releases the work the
 * new mode cannot do, `CarInit.mode` for the initial value, `SERVICE_MODES` with four values, and
 * `infeasibilityOf()` returns `'serviceMode'` as its **first** check — before service zoning,
 * before access, before capacity. `INELIGIBILITY_REASONS` carries the reason and
 * `dispatch/lifecycle.ts` defaults to it.
 *
 * What is missing is every path from a configuration to that field:
 *
 * | Gap | Where |
 * |---|---|
 * | `carConfigSchema` is a `z.strictObject` with no `mode` key | `core/src/config/schema.ts` |
 * | so `ResolvedCar` carries no mode, and `Simulation` never passes `CarInit.mode` | `core/src/sim/simulation.ts` |
 * | `Simulation` holds `#carsById` **private**, with no accessor | same |
 * | nothing schedules a `setMode` at a simulated time | same |
 *
 * The last two are what close the door on the injection seams as well. `SimulationConfig`
 * exposes `createPolicy` and `createPredictor`; neither is handed a `Car`. A policy sees
 * `readonly CarSnapshot[]` — plain data — so the strongest thing an injected policy can do is
 * change **what the dispatcher believes**, and it cannot change what the car *is*.
 *
 * ## So this module does the reachable half, and labels it
 *
 * {@link seenAsMode} rewrites the `mode` on every snapshot the group controller is shown, from a
 * given simulated time onward. That is a real run: the real eligibility stage runs, reaches
 * `infeasibilityOf`, returns `'serviceMode'`, and the real dispatch loop does whatever it does
 * with a call no car will take. The reason code that the fuzzing task established was
 * unreachable is genuinely reached, through the shipped path, in a shipped run.
 *
 * What it does **not** reproduce, and what `adversarial.test.ts` therefore does not claim:
 *
 * - the car does not release its committed hall calls, because `Car.setMode` is never called.
 *   A car already carrying a call still serves it. Real recall drops that work on the floor;
 * - car calls from passengers already aboard are still honoured — correct for `independent`,
 *   wrong for `out-of-service`;
 * - a car cannot come *back* into service in a way the physical model registers, only in a way
 *   the dispatcher registers.
 *
 * The `core` change that would close the gap is small and is requested rather than made: a
 * `mode` field on `carConfigSchema` threaded to `CarInit.mode` for the initial state, plus either
 * an authored `serviceEvents: [{ atS, carId, mode }]` schedule on the building or a
 * `SimulationConfig.serviceSchedule` hook for the mid-run case. Until then
 * `adversarial.test.ts` carries a skipped, documented test naming exactly that, rather than a
 * green one that pretends.
 *
 * ## Why a `Proxy`
 *
 * The same reason `fuzz/faults.ts` and `benchmark/auctionAggregation.ts` give: the shipped
 * policies carry private fields, so every method has to be applied with the real policy as its
 * receiver or the private state is unreachable. Only the methods that are *shown* cars are
 * wrapped; everything else is the real method bound to the real object.
 */

import {
  createPolicyFor,
  type AuctionPolicyOptions,
  type CarSnapshot,
  type DispatchPolicy,
  type DispatcherProfile,
  type ServiceMode,
} from '@elevator-sim/core';

/**
 * Which argument of each policy method is the simulated time, and which carry car snapshots.
 *
 * A table rather than a scan over the arguments, because guessing which `number` is a clock is
 * exactly the kind of cleverness that makes an injected fault silently stop firing. If a method's
 * signature changes, this goes stale loudly — `adversarial.test.ts` asserts the injection actually
 * bit, so a table that stopped matching cannot pass as a green run.
 */
const SIGNATURES: Readonly<Record<string, { readonly at: number; readonly cars: readonly number[] }>> =
  Object.freeze({
    dispatch: { at: 2, cars: [1] },
    reconsider: { at: 2, cars: [1] },
    score: { at: 2, cars: [1] },
    eligible: { at: 2, cars: [1] },
    answer: { at: 2, cars: [0, 3] },
    reposition: { at: 1, cars: [0] },
  });

function isSnapshot(value: unknown): value is CarSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    'carId' in value &&
    'mode' in value &&
    'shaft' in value
  );
}

function rewrite(value: unknown, mode: ServiceMode): unknown {
  if (Array.isArray(value)) return value.map((entry) => rewrite(entry, mode));
  if (isSnapshot(value)) return { ...value, mode };
  return value;
}

/** What an injection run reports about itself, so a silent no-op cannot pass for a finding. */
export interface ModeInjection {
  readonly createPolicy: (profile: DispatcherProfile, options: AuctionPolicyOptions) => DispatchPolicy;
  /** How many snapshots were rewritten. Zero means the injection never fired. */
  rewrites: number;
  /** How many policy calls were made before `fromS`, so the "before" phase is evidenced. */
  untouched: number;
  /**
   * Hall-call allocations the group controller made *while the rewrite was in force*.
   *
   * The load-bearing measurement, and the reason it is counted here rather than inferred from
   * the record: a run in which people still board is not evidence that the injection failed.
   * `simulation.ts` `#loadWhileIdle` boards a landing queue from a car already standing at that
   * floor **without asking the dispatcher at all** — deliberately, and its docstring explains
   * why: under a lobby parking strategy, making every free car wait for its own allocation
   * serves one car at a time while three sit closed a metre away. So boarding can continue with
   * zero allocations, and only this counter distinguishes "the group stopped dispatching" from
   * "the proxy silently did nothing".
   */
  allocations: number;
}

/**
 * Show the group controller every car in `mode`, from `fromS` onward.
 *
 * `fromS = 0` is the "all cars out of service for the whole run" case; any positive value is a
 * mid-run change *as the dispatcher sees it*. See the module docstring for exactly what that does
 * and does not reproduce — the distinction is the whole point of this file existing.
 */
export function seenAsMode(mode: ServiceMode, fromS = 0): ModeInjection {
  const injection: ModeInjection = {
    rewrites: 0,
    untouched: 0,
    allocations: 0,
    createPolicy: (profile, options) => {
      const policy = createPolicyFor(profile, options);
      return new Proxy(policy, {
        get(target, property, _receiver) {
          const value = Reflect.get(target, property, target) as unknown;
          if (typeof value !== 'function') return value;
          const method = (value as (...args: readonly unknown[]) => unknown).bind(target);
          const signature = SIGNATURES[property as string];
          if (signature === undefined) return method;
          return (...args: readonly unknown[]): unknown => {
            const at = args[signature.at];
            if (typeof at !== 'number' || at < fromS) {
              injection.untouched += 1;
              return method(...args);
            }
            const patched = [...args];
            for (const index of signature.cars) {
              const before = patched[index];
              const after = rewrite(before, mode);
              if (after !== before) {
                injection.rewrites += Array.isArray(before) ? before.length : 1;
              }
              patched[index] = after;
            }
            const outcome = method(...patched);
            if (property === 'dispatch' || property === 'reconsider') {
              const carIds = (outcome as { carIds?: readonly string[] }).carIds;
              if (carIds !== undefined && carIds.length > 0) injection.allocations += 1;
            }
            return outcome;
          };
        },
      });
    },
  };
  return injection;
}
