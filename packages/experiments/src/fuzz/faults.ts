/**
 * Deliberate faults, so every property can be shown to fail.
 *
 * **A property that has never failed is a property that cannot fail.** A green fuzz suite that
 * has never caught anything is the failure mode of this whole track, and the only defence is to
 * break, on purpose, the exact thing each property protects and watch it fire. `faults.test.ts`
 * does that for all six and prints what it saw.
 *
 * Two kinds of fault, because the six properties are about two different things.
 *
 * ## Record faults — for the four properties that are claims about the *record*
 *
 * Conservation, destination, capacity and time monotonicity are predicates over a finished
 * `SimulationResult`. The fault is therefore a corrupted result: a leg deleted, a destination
 * rewritten, an extra body squeezed into a full car, a boarding timestamped before its own
 * arrival. Each corruption is exactly the shape of the bug the property names, and each is
 * built so the *simulator's own audit still says everything is fine* — `withLostPassenger`
 * decrements `conservation` to match, so a property that merely echoed
 * `result.conservation.balanced` would sail past it. That is the point: these prove the checks
 * are independent re-derivations, not restatements.
 *
 * ## Policy faults — for the two properties that are claims about the *run*
 *
 * Deadlock and starvation cannot be forged in a record; they are behaviours. So they are
 * injected into a **real run** through `SimulationConfig.createPolicy`, the hook `sim/types.ts`
 * documents for instrumentation, and the injected policy is the shipped one with a single stage
 * subverted: it refuses to assign calls matching a predicate. Everything else — the physics, the
 * doors, the trace, the recorder — is untouched, so the run really does deadlock and really does
 * starve one landing rather than being told to report that it did.
 */

import {
  createPolicyFor,
  type AnswerDecision,
  type AuctionPolicyOptions,
  type DispatchDecision,
  type DispatchPolicy,
  type DispatcherProfile,
  type LoadSample,
  type PassengerRecord,
  type SimulationResult,
} from '@elevator-sim/core';

/* -------------------------------------------------------------------------- *
 * Policy faults
 * -------------------------------------------------------------------------- */

/** Which calls the faulty controller refuses to allocate, by call floor and current time. */
export type RefusalPredicate = (floorId: string, at: number) => boolean;

/**
 * The shipped policy with stages 2–5 subverted for the calls a predicate names.
 *
 * A `Proxy` rather than a hand-written delegate, for the reason
 * `benchmark/auctionAggregation.ts` gives: the policies carry private fields, so every method
 * must be applied with the real policy as its receiver or the private state is unreachable. Only
 * `dispatch` and `reconsider` are altered; every other stage is the real one, bound to the real
 * object.
 *
 * The refused decision is synthesised rather than derived from a real one on purpose — calling
 * through would let the policy's own lifecycle record an assignment the runner then never
 * applies, and the fault under test is "the group never allocates this call", not "the group and
 * the runner disagree".
 */
export function refusingToDispatch(
  shouldRefuse: RefusalPredicate,
): (profile: DispatcherProfile, options: AuctionPolicyOptions) => DispatchPolicy {
  return (profile, options) => {
    const policy = createPolicyFor(profile, options);
    const subverted: ReadonlySet<string> = new Set(['dispatch', 'reconsider']);
    return new Proxy(policy, {
      get(target, property, _receiver) {
        const value = Reflect.get(target, property, target) as unknown;
        if (typeof value !== 'function') return value;
        const method = (value as (...args: readonly unknown[]) => unknown).bind(target);
        if (!subverted.has(property as string)) return method;
        return (...args: readonly unknown[]): unknown => {
          const callId = args[0] as string;
          const at = args[2] as number;
          const lifecycle = target.lifecycle(callId);
          if (lifecycle !== undefined && shouldRefuse(lifecycle.call.floorId, at)) {
            const refused: DispatchDecision = {
              callId,
              outcome: 'unassigned',
              carIds: [],
              primaryCarId: undefined,
              boardingPassengersPerCar: undefined,
              cost: undefined,
              at,
              dueAt: undefined,
              scores: [],
              rejected: [],
              reason: undefined,
              stage: 'assignment',
            };
            return refused;
          }
          return method(...args);
        };
      },
    });
  };
}

/** Never allocate anything from `stallAtS` onward: the whole group stops serving. */
export function stallingAfter(stallAtS: number): ReturnType<typeof refusingToDispatch> {
  return refusingToDispatch((_floorId, at) => at >= stallAtS);
}

/**
 * Never allocate one landing's calls until `releaseAtS`, then behave normally.
 *
 * Starves one floor without censoring the run: everybody is eventually collected, so the
 * summary's unserved fraction stays inside its budget and `awtIsValid` stays `true` — which is
 * precisely the condition the starvation property is about. A fault that simply abandoned them
 * would make the run *report* that it was untrustworthy, and the property would be right not to
 * fire.
 */
export function starvingFloorUntil(
  floorId: string,
  releaseAtS: number,
): ReturnType<typeof refusingToDispatch> {
  return refusingToDispatch((callFloorId, at) => callFloorId === floorId && at < releaseAtS);
}

/** A stage-6 refusal, for a fault that leaves allocation intact. Unused by the suite; kept honest. */
export function refusedAnswer(carId: string, callId: string): AnswerDecision {
  return Object.freeze({ carId, callId, answer: false, reason: 'not-assigned' });
}

/* -------------------------------------------------------------------------- *
 * Record faults
 * -------------------------------------------------------------------------- */

function replaceLeg(
  result: SimulationResult,
  index: number,
  patch: Partial<PassengerRecord>,
): SimulationResult {
  const passengers = result.record.passengers.map((leg, position) =>
    position === index ? { ...leg, ...patch } : leg,
  );
  return { ...result, record: { ...result.record, passengers } };
}

/**
 * A passenger the simulator lost — **and whose own audit says nothing is wrong.**
 *
 * The leg is deleted from the record and `conservation` is decremented to match, so
 * `generated === delivered + undelivered` is restated as true by the audit while one journey has
 * silently ceased to exist. Only a recount from the trace can see it. This is the exact bug
 * `docs/07-handoff.md` names first, and it is the one that *lowers* the reported average waiting
 * time as it gets worse.
 */
export function withLostPassenger(result: SimulationResult, index = 0): SimulationResult {
  const victim = result.record.passengers[index];
  if (victim === undefined) throw new Error('cannot lose a passenger from a run with no legs');
  const passengers = result.record.passengers.filter((_, position) => position !== index);
  const wasDelivered = victim.isFinalLeg && victim.alightedAt !== undefined;
  return {
    ...result,
    record: { ...result.record, passengers },
    conservation: {
      ...result.conservation,
      generated: result.conservation.generated - 1,
      delivered: result.conservation.delivered - (wasDelivered ? 1 : 0),
      legsCreated: result.conservation.legsCreated - 1,
      legsRecorded: result.conservation.legsRecorded - 1,
      balanced: true,
    },
  };
}

/** A passenger put down at a floor they never asked for. Books still balance; the person is lost. */
export function withMisdelivery(result: SimulationResult, wrongFloorId: string): SimulationResult {
  const index = result.record.passengers.findIndex(
    (leg) => leg.isFinalLeg && leg.alightedAt !== undefined && leg.destinationFloorId !== wrongFloorId,
  );
  if (index < 0) throw new Error('cannot misdeliver in a run that delivered nobody');
  return replaceLeg(result, index, { destinationFloorId: wrongFloorId });
}

/**
 * One more body in a car that was already at its design load.
 *
 * Injected as a real boarding on the busiest car at the instant of its heaviest recorded load,
 * so the reconstruction sees a boarding admitted above the cap **and** the reconstruction stops
 * agreeing with the load cell's own samples. Two independent detections of one fault, which is
 * what makes the second opinion worth carrying.
 */
export function withOverfilledCar(result: SimulationResult): SimulationResult {
  let heaviest: LoadSample | undefined;
  for (const sample of result.record.loadSamples) {
    if (heaviest === undefined || sample.massKg > heaviest.massKg) heaviest = sample;
  }
  if (heaviest === undefined) throw new Error('cannot overfill a car in a run with no load samples');
  const template = result.record.passengers.find((leg) => leg.carId === heaviest.carId);
  if (template === undefined) throw new Error('no leg to model the extra boarding on');

  const stowaway: PassengerRecord = {
    ...template,
    passengerId: `${template.passengerId}-stowaway`,
    journeyId: template.journeyId,
    massKg: 150,
    arrivedAt: heaviest.at,
    journeyStartedAt: heaviest.at,
    boardedAt: heaviest.at,
    alightedAt: result.record.endedAt,
  };
  return {
    ...result,
    record: { ...result.record, passengers: [...result.record.passengers, stowaway] },
  };
}

/** A boarding timestamped before its own arrival: a negative wait, straight into the mean. */
export function withNegativeWait(result: SimulationResult, secondsBefore = 30): SimulationResult {
  const index = result.record.passengers.findIndex((leg) => leg.boardedAt !== undefined);
  if (index < 0) throw new Error('cannot negate a wait in a run where nobody boarded');
  const leg = result.record.passengers[index];
  /* c8 ignore next -- findIndex returned a real position. */
  if (leg === undefined) throw new Error('unreachable');
  return replaceLeg(result, index, { boardedAt: leg.arrivedAt - secondsBefore });
}
