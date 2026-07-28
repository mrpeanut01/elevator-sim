/**
 * Service mode, in two arms — **what the dispatcher believes** and **what the car is** — and the
 * measured difference between them.
 *
 * Two of Phase 8's adversarial cases are **"all cars out of service"** and **"mid-run mode
 * changes"**. When this module was written neither was reachable from any authorable
 * configuration, so it did the reachable half through a `Proxy` and named the wall. The wall is
 * gone: `carConfigSchema.mode` and `BuildingConfig.serviceEvents` both exist, both flow through
 * `resolveBuilding` → `CarInit.mode` / `Car.setMode`, and the physical half is now an ordinary
 * building config. The `Proxy` stays anyway, because the *difference between the two arms is a
 * real property of the simulator* and is worth pinning rather than losing.
 *
 * ## The two arms
 *
 * | | arm A — {@link seenAsMode} | arm B — an authored `mode` / `serviceEvents` |
 * |---|---|---|
 * | what changes | the `mode` on every `CarSnapshot` the group controller is shown | the car's own `#mode` |
 * | how | `SimulationConfig.createPolicy` | `data`-shaped building config, through `parseBuilding` |
 * | `infeasibilityOf` answers `'serviceMode'` | yes | yes |
 * | hall calls **allocated** | none | none |
 * | committed hall calls released and re-offered | **no** — `Car.setMode` is never called | **yes** |
 * | car calls from people already aboard | honoured | refused (`registerCarCall` throws) |
 * | a car may come back | as the dispatcher sees it | physically |
 * | **passengers still board** | **yes** | **no** |
 *
 * ## The last row is the one worth pinning, and it is not a defect
 *
 * `sim/simulation.ts` `#loadWhileIdle` opens the doors of a car already standing at a landing
 * with a queue **without consulting the dispatcher**, deliberately: its docstring explains that
 * under a lobby parking strategy, making every free car wait for its own allocation "serves one
 * car at a time while three sit closed a metre away". So in arm A the fleet is *dispatcher-
 * blinded* — the group allocates nothing, and a car parked where the queue is keeps collecting
 * people anyway, who then press car calls that move it. In arm B the fleet is *physically
 * recalled* — `#carCanCarry` checks `acceptsHallCalls` and refuses, so nobody boards at all.
 *
 * That makes `legsBoarded === 0` the **wrong** assertion in arm A and the **right** one in arm B,
 * from the same reason code and the same zero allocation count. `adversarial.test.ts` asserts
 * both, in one test, on one building at one seed — because the pair is the evidence that neither
 * number is an accident, and because a future change that made `#loadWhileIdle` consult the
 * dispatcher would collapse the two arms into one and ought to fail loudly when it does.
 *
 * ## Why a `Proxy` (arm A)
 *
 * The same reason `fuzz/faults.ts` and `benchmark/auctionAggregation.ts` give: the shipped
 * policies carry private fields, so every method has to be applied with the real policy as its
 * receiver or the private state is unreachable. Only the methods that are *shown* cars are
 * wrapped; everything else is the real method bound to the real object.
 *
 * ## Why arm B still needs instrumentation ({@link watchDispatch})
 *
 * Because "the group allocated nothing" is not readable off a `SimulationResult`: the record
 * carries which car *carried* a leg, not which decisions the controller was asked for or which
 * cars it refused and why. `createPolicy` is the documented seam for exactly that, and it is the
 * one `core/src/sim/serviceMode.test.ts` uses for the same measurements. Nothing here reads a
 * private field and nothing new is exported from `core` for a test to look at.
 */

import {
  createPolicyFor,
  type AuctionPolicyOptions,
  type CarSnapshot,
  type DispatchContext,
  type DispatchDecision,
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
 * **Arm A.** Show the group controller every car in `mode`, from `fromS` onward.
 *
 * `fromS = 0` blinds the dispatcher for the whole run; any positive value is a mid-run change
 * *as the dispatcher sees it*. The cars themselves are untouched and remain in service, which is
 * exactly what makes this the control arm rather than a weaker version of arm B: see the module
 * docstring's table for the row-by-row difference, and `adversarial.test.ts` for the test that
 * measures it.
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

/* -------------------------------------------------------------------------- *
 * Arm B — watching the real controller decide about physically-moded cars
 * -------------------------------------------------------------------------- */

/** One decision the group controller was asked for, and what it answered. */
export interface WatchedDecision {
  readonly at: number;
  readonly callId: string;
  /** Empty when the group declined to allocate anybody at this instant. */
  readonly carIds: readonly string[];
}

/** A call handed back to the group, identified by carrying its **original** registration time. */
export interface WatchedReoffer {
  readonly callId: string;
  readonly registeredAt: number;
}

/**
 * What a run's group controller was asked and what it answered — the only way to see, from
 * outside, that a fleet stopped being *dispatched to* as opposed to stopped *carrying people*.
 */
export interface DispatchWatch {
  readonly createPolicy: (profile: DispatcherProfile, options: AuctionPolicyOptions) => DispatchPolicy;
  /** Every decision, allocating or not, in the order the controller was asked. */
  readonly decisions: WatchedDecision[];
  /** The subset that named at least one car. Zero of these is "the group stopped dispatching". */
  readonly allocations: WatchedDecision[];
  /** Count per `IneligibilityReason`, so `serviceMode` can be shown to have actually been reached. */
  readonly refusals: Map<string, number>;
  /**
   * Registrations whose `registeredAt` is **older** than the newest instant the group has already
   * been asked about, which cannot be a first registration and is therefore a re-offer.
   *
   * `#reofferCall` re-registers a released call with its original `registeredAt` on purpose, so a
   * starvation term still sees a ninety-second-old call rather than a fresh one — and that is
   * precisely what makes a re-offer distinguishable from a new press without reading anything
   * private. Counting registrations per call id would not work: a call id is
   * `bank#floor:direction` and is registered afresh every time that landing fills again.
   */
  readonly reoffers: WatchedReoffer[];
}

/**
 * Wrap the shipped policy and record what it is asked and what it answers.
 *
 * A `Proxy` for the reason given at the top of this file and in `core`'s `seam.test.ts`: the
 * shipped policies carry private fields, so a plain object wrapper loses them. Only `register`,
 * `dispatch` and `reconsider` are overridden; every other member is the real method bound to the
 * real policy, and none of the three changes a decision.
 */
export function watchDispatch(): DispatchWatch {
  const decisions: WatchedDecision[] = [];
  const allocations: WatchedDecision[] = [];
  const refusals = new Map<string, number>();
  const reoffers: WatchedReoffer[] = [];
  /** The newest instant the group has been asked about — a proxy for the kernel clock. */
  let asked = Number.NEGATIVE_INFINITY;

  const record = (at: number, callId: string, decision: DispatchDecision): DispatchDecision => {
    asked = Math.max(asked, at);
    for (const verdict of decision.rejected) {
      const reason = verdict.reason;
      if (reason !== undefined) refusals.set(reason, (refusals.get(reason) ?? 0) + 1);
    }
    const entry: WatchedDecision = { at, callId, carIds: decision.carIds };
    decisions.push(entry);
    if (decision.carIds.length > 0) allocations.push(entry);
    return decision;
  };

  const createPolicy = (profile: DispatcherProfile, options: AuctionPolicyOptions): DispatchPolicy => {
    const inner = createPolicyFor(profile, options);
    const overrides: Partial<DispatchPolicy> = {
      register(call, at, context?: DispatchContext | undefined) {
        if (at < asked) reoffers.push({ callId: call.id, registeredAt: at });
        return inner.register(call, at, context);
      },
      dispatch(callId, cars, at, context?: DispatchContext | undefined) {
        return record(at, callId, inner.dispatch(callId, cars, at, context));
      },
      reconsider(callId, cars, at, context?: DispatchContext | undefined) {
        return record(at, callId, inner.reconsider(callId, cars, at, context));
      },
    };
    return new Proxy(inner, {
      get(target, property): unknown {
        const own = (overrides as Record<string | symbol, unknown>)[property];
        if (own !== undefined) return own;
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function'
          ? (value as (...args: readonly unknown[]) => unknown).bind(target)
          : value;
      },
    }) as DispatchPolicy;
  };

  return { createPolicy, decisions, allocations, refusals, reoffers };
}
