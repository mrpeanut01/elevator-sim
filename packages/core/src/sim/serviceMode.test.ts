/**
 * **Service mode, reached from an authorable configuration and exercised in a real run.**
 *
 * `Car` has had a complete service-mode model since Phase 1 — a private `#mode`, a `setMode()`
 * that releases the work the new mode cannot do, four `SERVICE_MODES`, and an `estimateCost()`
 * whose *first* check answers `'serviceMode'`. None of it had a caller a user could reach:
 * `carConfigSchema` had no `mode` key, so `INELIGIBILITY_REASONS.serviceMode` was unreachable from
 * `data/`, and nothing anywhere called `setMode` at a simulated time. Two Phase 8 adversarial
 * cases — "all cars out of service" and "mid-run mode changes" — were therefore unauthorable, and
 * the campaign could only approximate them by proxying the dispatcher's *view* of the cars, which
 * tests the dispatcher's reaction rather than the car.
 *
 * This file is the proof that the gap is closed, and every assertion is behavioural.
 *
 * ## How the measurements are taken
 *
 * Through `SimulationConfig.createPolicy`, the documented instrumentation seam — the same one
 * `seam.test.ts` uses to prove every cost term prices something. The wrapper records what the
 * group controller was asked and what it answered; nothing is inferred from a private field and
 * nothing new is exported from `sim/` for a test to read.
 *
 * **Allocations, not boardings.** `#loadWhileIdle` boards a landing queue from a car already
 * standing there without consulting the dispatcher at all, deliberately, so "nobody boarded" is
 * the wrong assertion for a fleet the *group* has stopped serving. It is the right one here only
 * because these cars are physically out of service and `#carCanCarry` refuses them — which is a
 * different fact, asserted separately.
 */

import { describe, expect, it } from 'vitest';

import type { DispatchContext, DispatchDecision, DispatchPolicy } from '../dispatch/types.js';
import { createPolicyFor } from '../dispatch/index.js';
import { parseBuilding, resolveBuilding } from '../config/parse.js';
import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';
import type { ServiceMode } from '../model/types.js';

import { fingerprint, load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

const SEED = 20_260_728;

/* -------------------------------------------------------------------------- *
 * The fixture: two cars, one bank, enough demand to keep both busy
 * -------------------------------------------------------------------------- */

interface TowerOptions {
  /** Initial mode per car id. Omitted cars author no `mode` key at all. */
  readonly modes?: Readonly<Record<string, ServiceMode>> | undefined;
  readonly serviceEvents?: readonly Record<string, unknown>[] | undefined;
  /** Author `serviceEvents: []` explicitly rather than omitting the key. */
  readonly emptySchedule?: boolean | undefined;
}

/**
 * A deliberately small residential walk-up: three floors, one bank, **two** cars.
 *
 * Two rather than one because the load-bearing claim is that a recalled car's committed hall
 * calls are *re-offered to the group*, and a group of one has nowhere to offer them.
 */
function tower(options: TowerOptions = {}): Record<string, unknown> {
  const car = (id: string): Record<string, unknown> => ({
    id,
    spec: 'hydraulic',
    ratedSpeedMps: 0.63,
    doorType: 'sideOpening',
    ratedLoadLb: 2100,
    ...(options.modes?.[id] === undefined ? {} : { mode: options.modes[id] }),
  });
  return {
    id: 'service-walkup',
    name: 'Service walk-up',
    type: 'residential',
    trafficProfile: 'residential',
    floors: [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
      { id: '2', index: 2, heightM: 3, population: 90 },
      { id: '3', index: 3, heightM: 6, population: 90 },
    ],
    totalPopulation: 180,
    banks: [{ id: 'main', servesFloors: ['G', '2', '3'], cars: [car('A'), car('B')] }],
    accessZones: [],
    ...(options.serviceEvents === undefined ? {} : { serviceEvents: options.serviceEvents }),
    ...(options.emptySchedule === true ? { serviceEvents: [] } : {}),
  };
}

/** Through `parseBuilding` — the strict schema `loadConfig` itself calls — and nothing else. */
function resolve(config: LoadedConfig, options: TowerOptions = {}): ResolvedBuilding {
  return resolveBuilding(parseBuilding(tower(options), 'service-walkup.json'), config.elevatorSpecs, {
    file: 'service-walkup.json',
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

/* -------------------------------------------------------------------------- *
 * Instrumentation, through the documented createPolicy seam
 * -------------------------------------------------------------------------- */

interface Allocation {
  readonly at: number;
  readonly callId: string;
  readonly carIds: readonly string[];
}

interface Watch {
  /** Every decision the group was asked for, allocating or not, in order. */
  readonly decisions: Allocation[];
  /** The subset that named at least one car. */
  readonly allocations: Allocation[];
  /** Every ineligibility reason any car was refused for, with the count. */
  readonly refusals: Map<string, number>;
  /**
   * Registrations of a call whose `registeredAt` is *older* than the latest instant the group has
   * already been asked about — which is a **re-offer** and cannot be a first registration.
   *
   * A first registration always carries the instant it happened, so its `registeredAt` is at least
   * the newest `at` any dispatch has seen. `#reofferCall` deliberately re-registers with the
   * call's **original** `registeredAt`, so that a starvation term still sees a ninety-second-old
   * call — which is exactly what makes the two distinguishable from outside.
   *
   * The count of *registrations per call id* would not do: a call id is
   * `bank#floor:direction`, stable for the run, so the same id is registered afresh every time
   * that landing fills again.
   */
  readonly reoffers: { readonly callId: string; readonly registeredAt: number }[];
  readonly createPolicy: (
    ...args: Parameters<typeof createPolicyFor>
  ) => DispatchPolicy;
}

function watch(): Watch {
  const decisions: Allocation[] = [];
  const allocations: Allocation[] = [];
  const refusals = new Map<string, number>();
  const reoffers: { callId: string; registeredAt: number }[] = [];
  /** The newest instant the group has been asked about. A proxy for the kernel clock. */
  let asked = Number.NEGATIVE_INFINITY;

  const record = (at: number, callId: string, decision: DispatchDecision): void => {
    asked = Math.max(asked, at);
    for (const verdict of decision.rejected) {
      const reason = verdict.reason;
      if (reason !== undefined) refusals.set(reason, (refusals.get(reason) ?? 0) + 1);
    }
    decisions.push({ at, callId, carIds: decision.carIds });
    if (decision.carIds.length > 0) allocations.push({ at, callId, carIds: decision.carIds });
  };

  const createPolicy: Watch['createPolicy'] = (profile, options) => {
    const inner = createPolicyFor(profile, options);
    // A Proxy with only the three methods overridden, and every other member bound to the real
    // policy: the shipped policies carry private fields, so a plain object wrapper would lose
    // them (`seam.test.ts` and `experiments/.../serviceMode.ts` give the same reason).
    const wrapper: Partial<DispatchPolicy> = {
      register(call, at, context?: DispatchContext | undefined) {
        if (at < asked) reoffers.push({ callId: call.id, registeredAt: at });
        return inner.register(call, at, context);
      },
      dispatch(callId, cars, at, context?: DispatchContext | undefined) {
        const decision = inner.dispatch(callId, cars, at, context);
        record(at, callId, decision);
        return decision;
      },
      reconsider(callId, cars, at, context?: DispatchContext | undefined) {
        const decision = inner.reconsider(callId, cars, at, context);
        record(at, callId, decision);
        return decision;
      },
    };
    return new Proxy(inner, {
      get(target, property): unknown {
        const own = (wrapper as Record<string | symbol, unknown>)[property];
        if (own !== undefined) return own;
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function'
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value;
      },
    }) as DispatchPolicy;
  };

  return { decisions, allocations, refusals, reoffers, createPolicy };
}

function run(
  config: LoadedConfig,
  building: ResolvedBuilding,
  extra: Partial<SimulationConfig> = {},
): SimulationResult {
  return runSimulation({
    building,
    dispatcherProfile: config.dispatcherProfilesById.get('collective') as never,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    durationS: 900,
    drainGraceS: 300,
    demand: { arrivalRatePctPop5min: 30 },
    onTimeout: 'report',
    ...extra,
  });
}

/* -------------------------------------------------------------------------- *
 * 1. All cars out of service — reachable from `data/`, and it means what it says
 * -------------------------------------------------------------------------- */

describe('a car whose config says out-of-service is out of service', () => {
  it('reaches INELIGIBILITY_REASONS.serviceMode from an authorable building, and allocates nothing', async () => {
    const config = await load();
    const seen = watch();
    const result = run(
      config,
      resolve(config, { modes: { A: 'out-of-service', B: 'out-of-service' } }),
      { createPolicy: seen.createPolicy },
    );

    /* The reason code the fuzzing campaign recorded as unreachable, reached through the shipped
       eligibility stage, in a run driven by nothing but a building config. */
    expect(seen.refusals.get('serviceMode') ?? 0).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(
      `[T19] all-out-of-service: serviceMode refusals=${String(seen.refusals.get('serviceMode') ?? 0)}, ` +
        `allocations=${String(seen.allocations.length)}, ` +
        `boarded=${String(result.conservation.legsBoarded)}/${String(result.conservation.legsCreated)}, ` +
        `undelivered=${String(result.undelivered.length)}, status=${result.status}`,
    );

    /* The group controller allocated nothing at all, for the whole run. */
    expect(seen.allocations).toHaveLength(0);
    expect(result.trace.passengerCount).toBeGreaterThan(0);

    /* And — unlike the dispatcher-view injection, whose cars really were in service — **nobody
       boards**, because `#carCanCarry` refuses a car that may not take a landing queue. That
       clause is not cosmetic: `Car.board` registers a car call and `registerCarCall` throws for a
       mode that does not honour one, so without it this configuration crashes the run. */
    expect(result.conservation.legsBoarded).toBe(0);

    /* Nobody is lost even so. Every one of them is a named undelivered journey. */
    expect(result.conservation.balanced).toBe(true);
    expect(result.undelivered).toHaveLength(result.conservation.generated);
    expect(result.status).toBe('timed-out');
  }, 120_000);

  it('is inert at in-service: authoring the default changes nothing about the run', async () => {
    // The control, and the guard on every published number: `mode` and an empty `serviceEvents`
    // must be *exactly* free when they say what was already true. A structural fingerprint, not a
    // summary statistic — a mean is the statistic that hides a small structural difference.
    const config = await load();
    const plain = run(config, resolve(config));
    const explicit = run(
      config,
      resolve(config, {
        modes: { A: 'in-service', B: 'in-service' },
        emptySchedule: true,
      }),
    );
    expect(fingerprint(explicit)).toBe(fingerprint(plain));
    expect(plain.conservation.legsBoarded).toBeGreaterThan(0);
    expect(plain.undelivered).toHaveLength(0);
  }, 120_000);

  it('leaves one car working when only the other is out of service', async () => {
    const config = await load();
    const seen = watch();
    const result = run(config, resolve(config, { modes: { A: 'out-of-service' } }), {
      createPolicy: seen.createPolicy,
    });

    expect(seen.refusals.get('serviceMode') ?? 0).toBeGreaterThan(0);
    expect(seen.allocations.length).toBeGreaterThan(0);
    /* Every allocation names B. Not "mostly B" — an out-of-service car cannot be assigned at all,
       and `Car.assignHallCall` throws rather than accepting one, so a single A here is a crash. */
    for (const allocation of seen.allocations) {
      expect(allocation.carIds).toEqual(['main-B']);
    }
    expect(result.conservation.legsBoarded).toBeGreaterThan(0);
    expect(result.conservation.balanced).toBe(true);
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * 2. Mid-run changes — the schedule fires, and the work moves
 * -------------------------------------------------------------------------- */

describe('a scheduled service change fires at a simulated time', () => {
  const RECALL_AT = 300;

  it('releases the recalled car’s committed hall calls, and the group re-offers them', async () => {
    const config = await load();
    const seen = watch();
    const result = run(
      config,
      resolve(config, {
        serviceEvents: [{ atS: RECALL_AT, carId: 'A', mode: 'out-of-service' }],
      }),
      { createPolicy: seen.createPolicy },
    );

    const before = seen.allocations.filter((allocation) => allocation.at < RECALL_AT);
    const after = seen.allocations.filter((allocation) => allocation.at >= RECALL_AT);

    /* Which calls car A was still holding when the recall fired. Rebuilt from the allocation
       stream rather than read off a private field: a call leaves A the moment a later decision
       names somebody else, and `#completeCall` is invisible from here, so this is an upper bound
       on what A held — which is the safe direction for the assertion below. */
    const heldByA = new Set<string>();
    for (const allocation of before) {
      if (allocation.carIds.includes('main-A')) heldByA.add(allocation.callId);
      else heldByA.delete(allocation.callId);
    }
    expect(before.length).toBeGreaterThan(0);
    expect(heldByA.size).toBeGreaterThan(0);

    /* **The moment itself.** `#onServiceChange` re-offers each released call and then dispatches
       the bank, all at the event's own simulated instant — so the group is asked about exactly
       those call ids at exactly `RECALL_AT`. Asserting on the instant is what makes it the recall
       and not a coincidence: a call id is `bank#floor:direction` and recurs whenever that landing
       fills again, so "the same id later went to B" on its own would prove nothing. */
    const askedAtTheRecall = seen.decisions.filter(
      (decision) => decision.at === RECALL_AT && heldByA.has(decision.callId),
    );

    /* And each of them ends up on the other car. `first` is the first decision at or after the
       recall that names anybody for that call — allocation may be a defer window later than the
       recall, which is stage 1 doing its job and not the recall failing. */
    const rehomed = [...heldByA].filter((callId) => {
      const first = after.find((allocation) => allocation.callId === callId);
      return first !== undefined && first.carIds.includes('main-B');
    });

    // eslint-disable-next-line no-console
    console.log(
      `[T19] recall at ${String(RECALL_AT)}s: allocations before=${String(before.length)} after=${String(after.length)}, ` +
        `calls held by A at recall=${String(heldByA.size)}, re-decided at the recall instant=${String(askedAtTheRecall.length)}, ` +
        `re-allocated to the other car=${String(rehomed.length)}, ` +
        `re-offers (register with an older registeredAt)=${String(seen.reoffers.length)}, ` +
        `serviceMode refusals=${String(seen.refusals.get('serviceMode') ?? 0)}`,
    );
    expect(askedAtTheRecall.length).toBeGreaterThan(0);
    expect(rehomed.length).toBeGreaterThan(0);

    /* And the re-offer is visible from the policy side too: a `register` carrying a
       `registeredAt` older than the instant the group was last asked about cannot be a first
       registration. The button has been lit since the original press and nobody re-pressed it,
       which is why `#reofferCall` keeps the original time. */
    expect(seen.reoffers.length).toBeGreaterThan(0);
    expect(seen.reoffers.some((reoffer) => heldByA.has(reoffer.callId))).toBe(true);

    /* And from the recall onwards the group never names A again. */
    for (const allocation of after) {
      expect(allocation.carIds).not.toContain('main-A');
    }
    expect(seen.refusals.get('serviceMode') ?? 0).toBeGreaterThan(0);
    expect(result.conservation.balanced).toBe(true);
  }, 120_000);

  it('lets a car come back: nothing is allocated while both are out, and B works again after', async () => {
    const config = await load();
    const seen = watch();
    const outAt = 240;
    const backAt = 480;
    const result = run(
      config,
      resolve(config, {
        serviceEvents: [
          { atS: outAt, carId: 'A', mode: 'out-of-service' },
          { atS: outAt, carId: 'B', mode: 'out-of-service' },
          { atS: backAt, carId: 'B', mode: 'in-service' },
        ],
      }),
      { createPolicy: seen.createPolicy },
    );

    /* **Strictly after `outAt`**, and the strictness is the point rather than a fudge. Both
       recalls are authored at the same instant and are two kernel events, ordered `(time,
       sequence)` by authored order (CLAUDE.md invariant 4): A's fires first, re-offers what A was
       holding, and dispatches the bank — at which moment B is still in service and can legally be
       given it. Then B's event fires and takes it straight back. Asserting the blackout from the
       *second* event onwards is what the schedule actually says; asserting it from the first
       would be asserting that two events at one instant are one event. */
    const atTheInstant = seen.allocations.filter((allocation) => allocation.at === outAt);
    const during = seen.allocations.filter(
      (allocation) => allocation.at > outAt && allocation.at < backAt,
    );
    for (const allocation of atTheInstant) expect(allocation.carIds).toEqual(['main-B']);
    const after = seen.allocations.filter((allocation) => allocation.at >= backAt);
    const boardedAfter = result.record.passengers.filter(
      (leg) => leg.boardedAt !== undefined && leg.boardedAt >= backAt,
    );

    // eslint-disable-next-line no-console
    console.log(
      `[T19] both out at ${String(outAt)}s, B back at ${String(backAt)}s: allocations at the instant=${String(atTheInstant.length)}, ` +
        `during the blackout=${String(during.length)}, after=${String(after.length)}, ` +
        `legs boarded after return=${String(boardedAfter.length)}`,
    );

    /* The blackout is total — no allocation, and no boarding either, because a car that is not
       in service cannot collect a landing queue. `#loadWhileIdle` is the path that would
       otherwise keep boarding people from a car parked where the queue is, without ever asking
       the dispatcher; `#carCanCarry` refuses it, and `Car.registerCarCall` would have thrown if
       it did not. */
    expect(during).toHaveLength(0);
    expect(
      result.record.passengers.filter(
        (leg) => leg.boardedAt !== undefined && leg.boardedAt > outAt && leg.boardedAt < backAt,
      ),
    ).toHaveLength(0);

    /* The returning car picks work up again with no prompting: `serviceMode` is deliberately not
       a *structural* ineligibility, so the calls nobody could take stayed on the retry timer and
       the pending dispatch tick finds B the moment it is back. */
    expect(after.length).toBeGreaterThan(0);
    for (const allocation of after) expect(allocation.carIds).toEqual(['main-B']);
    expect(boardedAfter.length).toBeGreaterThan(0);
    expect(result.conservation.balanced).toBe(true);
  }, 120_000);

  it('refuses an event past the drain deadline rather than extending the run for it', async () => {
    const config = await load();
    const result = run(
      config,
      resolve(config, {
        serviceEvents: [{ atS: 100_000, carId: 'A', mode: 'out-of-service' }],
      }),
    );
    expect(result.warnings.some((warning) => warning.includes('serviceEvents[0]'))).toBe(true);
    expect(
      result.warnings.some((warning) => warning.includes("past this run's drain deadline")),
    ).toBe(true);
    /* Refused, so the run is the run it would have been without the entry at all. */
    expect(result.conservation.balanced).toBe(true);
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * 3. Replay — the whole reason the schedule is data and not a hook
 * -------------------------------------------------------------------------- */

describe('a scheduled service change is replayable', () => {
  const SCHEDULE = [
    { atS: 240, carId: 'A', mode: 'fire-recall' },
    { atS: 420, carId: 'B', mode: 'independent' },
    { atS: 600, carId: 'A', mode: 'in-service' },
  ];

  it('produces an identical run from the same seed', async () => {
    const config = await load();
    const first = run(config, resolve(config, { serviceEvents: SCHEDULE }));
    const second = run(config, resolve(config, { serviceEvents: SCHEDULE }));
    expect(fingerprint(second)).toBe(fingerprint(first));
    expect(first.conservation.balanced).toBe(true);
  }, 120_000);

  it('survives a JSON round trip of the building, which is what a stored run replays through', async () => {
    /* The persisted run envelope (`experiments/reports/persistence.ts`) records `buildingId`, not
       the building; a replay re-reads `data/buildings/<id>.json` and resolves it again. So the
       question "does a stored run replay a mid-run mode change identically" is exactly the
       question "does the schedule survive JSON and resolution", and it is answered here rather
       than asserted. A `SimulationConfig.serviceSchedule` callback could not have answered it:
       a function does not serialize, `createStoredRun` would drop it, and every replay would
       quietly be a different experiment. */
    const config = await load();
    const authored = tower({ serviceEvents: SCHEDULE });
    const direct = resolveBuilding(
      parseBuilding(authored, 'service-walkup.json'),
      config.elevatorSpecs,
    );
    const stored = resolveBuilding(
      parseBuilding(JSON.parse(JSON.stringify(authored)) as unknown, 'service-walkup.json'),
      config.elevatorSpecs,
    );
    expect(stored.serviceEvents).toEqual(direct.serviceEvents);
    expect(fingerprint(run(config, stored))).toBe(fingerprint(run(config, direct)));
  }, 120_000);

  it('is a different run from the same building without the schedule, so it is not inert', async () => {
    const config = await load();
    const withSchedule = run(config, resolve(config, { serviceEvents: SCHEDULE }));
    const without = run(config, resolve(config));
    expect(fingerprint(withSchedule)).not.toBe(fingerprint(without));
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * 4. Under a landing panel — the P5 deadlock, and the promise that caused it
 * -------------------------------------------------------------------------- */

/**
 * **The Phase 8 P5 counterexample, at the smallest configuration that produces it.**
 *
 * Everything above drives `collective`, which is conventional dispatch: nobody is promised
 * anything, so withdrawing a car is finished the moment `#reofferCall` hands its calls back. That
 * left the interaction of `serviceEvents` with `dispatch.passengerAssignment: 'panel'` untested —
 * `validation/DECISIONS-T20.md` names it as the clearest next step on this axis — and the fuzz
 * campaign found what was in the gap.
 *
 * `fuzz-1000384`, shrunk to a single bank of two cars: at t = 460 a passenger bound for the top
 * floor is promised the fast car; at t = 472 the schedule puts that car on `independent`. Its hall
 * calls are released and re-offered exactly as § 2 above asserts — and then `#candidateCars`
 * restricts the re-offered call to the promised car, because D29's promise is write-once and is
 * enforced at the candidate set (`DECISIONS.md` § T16-D3). So the only candidate is a car that
 * refuses `serviceMode`, the call is retried every `dispatchRetryS`, and it is refused again every
 * five seconds until the drain deadline — 1 694 s of it in the original case — while the other car
 * of the same bank serves every *other* landing and stands idle in between.
 *
 * The fix is `#revokePromisesTo`: a promise whose car has left group control is voided, because
 * D29's argument is about a car that is **full** and will come back. See
 * `packages/core/DECISIONS-T22.md` § T22-D1.
 *
 * The fixture below is the walk-up with the same shape: one bank, two cars, and a recall timed so
 * that somebody is holding a promise to the recalled car when it fires.
 */
describe('a promise to a car that leaves group control is revoked, not held for the whole run', () => {
  const RECALL_AT = 200;

  /**
   * The walk-up under the shipped destination-panel profile, at **half** the demand `run` uses.
   *
   * 30 %pop/5 min is past what one hydraulic car at 0.63 m/s can clear, so with A withdrawn from
   * t = 200 onwards the run legitimately ends `timed-out` with people still queued — honest
   * saturation, and the wrong backdrop for a *liveness* assertion, because "somebody is still
   * waiting" would then be true whether the defect were fixed or not. At 15 %pop/5 min the
   * remaining car keeps up, so "everybody was delivered" is a claim the recall can break and does
   * break without `#revokePromisesTo`. Measured, this fixture, seed 20260728, 78 legs either way:
   *
   * | | status | undelivered | promises made | revoked |
   * |---|---|---|---|---|
   * | with `#revokePromisesTo` | `completed` | 0 | 79 | 1 |
   * | without it | `timed-out` | **25** | 54 | — |
   *
   * The 24 legs that are never even *promised* are the tell: once the call is pinned to a car
   * that refuses `serviceMode`, it is never assigned again, so `#tellThePanel` never runs for
   * anybody who joins that landing afterwards either.
   */
  function runPanel(
    config: LoadedConfig,
    building: ResolvedBuilding,
    extra: Partial<SimulationConfig> = {},
  ): SimulationResult {
    return run(config, building, {
      dispatcherProfile: config.dispatcherProfilesById.get('destination-panel') as never,
      demand: { arrivalRatePctPop5min: 15 },
      ...extra,
    });
  }

  it('re-promises the stranded passengers to another car, and the run stops deadlocking', async () => {
    const config = await load();
    const seen = watch();
    const result = runPanel(
      config,
      resolve(config, { serviceEvents: [{ atS: RECALL_AT, carId: 'A', mode: 'independent' }] }),
      { createPolicy: seen.createPolicy },
    );

    /* The promise really was taken back, and only at the recall. `promisesRevoked` is `0` on every
       run without a mid-run service change in it, which is what the control below asserts, so a
       non-zero count here is this mechanism and nothing else. */
    expect(result.conservation.promisesRevoked).toBeGreaterThan(0);

    /* And every revoked promise was re-made: `legsAssigned` counts promise *events*, so
       `assigned - revoked` is the number in force, and on a run that delivered everybody that is
       exactly one per leg. This is the audit's own invariant, restated here because it is the
       thing that would break if a revocation ever left somebody unpromised. */
    expect(result.conservation.legsAssigned - result.conservation.promisesRevoked).toBe(
      result.conservation.legsCreated,
    );
    expect(result.conservation.wrongCarBoardings).toBe(0);
    expect(result.conservation.balanced).toBe(true);

    /* **The liveness claim, in the terms P5 states it in.** Nobody is left standing, and the
       fleet is not idle with work outstanding: every leg boarded, and the last of them boarded
       after the recall rather than the whole landing being frozen at it. */
    expect(result.undelivered).toHaveLength(0);
    expect(result.status).toBe('completed');
    const boardedAfter = result.record.passengers.filter(
      (leg) => leg.boardedAt !== undefined && leg.boardedAt > RECALL_AT,
    );
    expect(boardedAfter.length).toBeGreaterThan(0);

    /* The withdrawn car is never allocated again, so the re-promise went to the other car rather
       than back to the one that caused the problem. */
    for (const allocation of seen.allocations.filter((a) => a.at >= RECALL_AT)) {
      expect(allocation.carIds).not.toContain('main-A');
    }

    // eslint-disable-next-line no-console
    console.log(
      `[T22] panel + recall at ${String(RECALL_AT)}s: promises made=${String(result.conservation.legsAssigned)}, ` +
        `revoked=${String(result.conservation.promisesRevoked)}, broken=${String(result.conservation.brokenPromises)}, ` +
        `legs=${String(result.conservation.legsCreated)}, boarded after the recall=${String(boardedAfter.length)}, ` +
        `undelivered=${String(result.undelivered.length)}, status=${result.status}`,
    );
  }, 120_000);

  it('revokes nothing at all without a service change, so the write-once promise still binds', async () => {
    /* The control, and the guard on D29: `#revokePromisesTo` is reachable only from
       `#onServiceChange`, so a panel run of the same building with no schedule must revoke
       nothing — however many promises a full car breaks. If this ever goes non-zero, the panel has
       started changing its mind for some other reason, which is the deferral advantage D29 exists
       to stop this arm recovering. */
    const config = await load();
    const result = runPanel(config, resolve(config));
    expect(result.conservation.legsAssigned).toBeGreaterThan(0);
    expect(result.conservation.promisesRevoked).toBe(0);
    expect(result.conservation.brokenPromises).toBeGreaterThan(0);
    expect(result.conservation.wrongCarBoardings).toBe(0);
    expect(result.conservation.balanced).toBe(true);
  }, 120_000);

  it('leaves the conventional model untouched: no promise exists, so none can be revoked', async () => {
    const config = await load();
    const result = run(
      config,
      resolve(config, { serviceEvents: [{ atS: RECALL_AT, carId: 'A', mode: 'independent' }] }),
    );
    expect(result.conservation.legsAssigned).toBe(0);
    expect(result.conservation.promisesRevoked).toBe(0);
    expect(result.conservation.balanced).toBe(true);
  }, 120_000);
});
