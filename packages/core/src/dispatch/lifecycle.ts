/**
 * The seven-stage call lifecycle, as pure functions.
 *
 * ```
 * register → filter eligible → score → assign → (reassign?) → answer → reposition
 * ```
 *
 * docs/06-parameterization-and-tuning.md § Layer 2 decomposes dispatch into these seven
 * independently tunable stages rather than one monolithic algorithm, and this file is that
 * decomposition. Every function here is pure and takes its time as an argument; `policy.ts`
 * owns the state that sequences them.
 *
 * Stage 3 is not here — it is `scoringEngine.ts`, because scoring is the one stage with no
 * lifecycle state at all.
 *
 * ## Hard filters are not large costs
 *
 * Stage 2 is the reason this distinction is drawn in the type system. A car that cannot reach
 * floor 30 is not an expensive choice, it is not a choice: no weight vector, traffic pattern
 * or tuning round can make it reachable. Collapsing feasibility into a large cost is the
 * classic way an optimizer discovers a "better" dispatcher that assigns calls to cars which
 * cannot serve them, and it is why {@link filterEligible} returns verdicts rather than
 * penalties.
 *
 * ## Branching on a parameter is not branching on a strategy
 *
 * `assignmentTiming`, `reassignmentPolicy`, `commitmentPoint`, `parkingStrategy` and
 * `callType` are **declared categorical tunables** with declared value sets
 * (`DISPATCH_PARAMETERS`), and implementing a categorical parameter means switching on its
 * value somewhere. That is not the failure CLAUDE.md invariant 7 names; the failure is
 * `if (profile.id === 'nearest-car')`, which puts behaviour in code that the config claims to
 * own. Nothing in `dispatch/` reads a profile id.
 */

import { estimateCost } from '../model/car/estimateCost.js';
import type { CarSnapshot, CostEstimate, CostRequest, ServedFloor } from '../model/car/types.js';
import { phaseByName, travelTime } from '../physics/motion/index.js';

import { assessDirectionReversal } from './terms/directionReversal.js';
import type {
  AnswerDecision,
  CallLifecycle,
  DispatchCall,
  DispatchObservation,
  EligibilityVerdict,
  IneligibilityReason,
  RepositionContext,
  RepositionDecision,
  RepositionReason,
  ResolvedDispatchConfig,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Stage 1 — registration
 * -------------------------------------------------------------------------- */

/**
 * The identity of the button: one live call per floor per direction.
 *
 * Calls sharing a batch key inside `batchWindowS` are the *same* button pressed by more
 * people, not two calls, so they are merged into one lifecycle whose `waitingPassengers`
 * accumulates. Scoring them separately would allocate two cars to one button — which is what
 * `assignmentMode: split-demand` is for, and it should be a decision rather than an accident
 * of arrival timing.
 */
export function batchKeyOf(call: Pick<DispatchCall, 'floorId' | 'direction'>): string {
  return `${call.floorId}:${call.direction}`;
}

/**
 * The earliest time a call may be scored.
 *
 * `batchWindowS` holds the call so near-simultaneous arrivals at one landing are scored
 * together with a true count of who is waiting. `deferWindowS` holds it further so several
 * *different* calls can be allocated against one another instead of first-come-first-served —
 * the deferred assignment of stage 4.
 *
 * Note the tension docs/06 records and this simulator is meant to measure: **destination
 * dispatch cannot defer**, because the passenger must be told which car to walk to
 * immediately. `resolveDispatchConfig` refuses that combination outright rather than letting
 * a run quietly measure a system nobody can build.
 */
export function scoreableAt(registeredAt: number, config: ResolvedDispatchConfig): number {
  const defer = config.dispatch.assignmentTiming === 'deferred' ? config.dispatch.deferWindowS : 0;
  return registeredAt + config.dispatch.batchWindowS + defer;
}

/**
 * The call as the car is allowed to see it.
 *
 * `callType` decides what information exists at call time, and that is the whole mechanism
 * behind destination dispatch rather than a UI detail:
 *
 * | `callType` | destination | credential |
 * |---|---|---|
 * | `up-down-buttons` | unknown until the passenger presses a button inside the car | unknown |
 * | `destination-entry` | **known** | unknown |
 * | `mobile-credential` | **known** | **known** |
 *
 * A known destination lets `estimateCost` check the *destination's* service and access zoning
 * before assigning, which is precisely why destination dispatch does better under access
 * control: authorization and optimization happen in the same step. Under `up-down-buttons`
 * the fields are dropped even when a caller supplies them, so a conventional run cannot
 * accidentally benefit from information the passenger never gave it.
 */
export function costRequestFor(
  call: DispatchCall,
  config: ResolvedDispatchConfig,
  observation: DispatchObservation,
): CostRequest {
  const callType = config.dispatch.callType;
  const knowsDestination = callType === 'destination-entry' || callType === 'mobile-credential';
  const knowsCredential = callType === 'mobile-credential';

  return Object.freeze({
    id: call.id,
    floorId: call.floorId,
    direction: call.direction,
    registeredAt: call.registeredAt,
    kind: 'hall' as const,
    ...(knowsDestination && call.destinationFloorId !== undefined
      ? { destinationFloorId: call.destinationFloorId }
      : {}),
    ...(knowsCredential && call.credentialGroup !== undefined
      ? { credentialGroup: call.credentialGroup }
      : {}),
    // Omitted rather than zeroed when nobody counted: the car then charges its own
    // `assumedBoardingPassengers`, which is the honest price of a bare up/down button.
    ...(observation.waitingPassengers > 0
      ? { boardingPassengers: observation.waitingPassengers }
      : {}),
    ...(observation.waitingMassKg !== undefined ? { boardingMassKg: observation.waitingMassKg } : {}),
  });
}

/** What the policy knows about who is waiting, with the call's own declaration as the fallback. */
export function observationFor(
  call: DispatchCall,
  waitingPassengers?: number | undefined,
  waitingMassKg?: number | undefined,
): DispatchObservation {
  const waiting = waitingPassengers ?? call.waitingPassengers ?? 0;
  return Object.freeze({
    waitingPassengers: Math.max(0, waiting),
    waitingMassKg: waitingMassKg ?? call.waitingMassKg,
  });
}

/* -------------------------------------------------------------------------- *
 * Stage 2 — eligibility
 * -------------------------------------------------------------------------- */

/**
 * The same snapshot with the hall-call load bypass switched off.
 *
 * A **new frozen value**, not a mutation: `CarSnapshot` is a plain frozen record and this
 * builds another one, so CLAUDE.md invariant 1 is untouched. It exists because
 * `CostEstimate` documents exactly this hand-off — *"`hallCallBypass` is reported as
 * infeasible because that is what a loaded car does, but the dispatcher holds the starvation
 * guard and may override it, because only the dispatcher knows whether another car could
 * serve the floor."*
 *
 * Without it an overridden car would carry `etaSeconds: Infinity` into the scorer and be
 * ranked last by the very filter that just admitted it.
 */
export function withBypassOverridden(car: CarSnapshot): CarSnapshot {
  return Object.freeze({
    ...car,
    load: Object.freeze({ ...car.load, isBypassingHallCalls: false }),
  });
}

/**
 * The call as this particular car is asked to price it, with the boarding count capped at
 * what the car has room for.
 *
 * A landing of thirty people is not thirty boarders for a car that holds sixteen: only as many
 * as fit will board, and the rest stay on the landing with the button still lit. Charging the
 * car for thirty transfers would inflate its dwell by fourteen passenger-transfer times and
 * project a load factor above rated — which would then trip `maxLoadFactorForAssignment` and
 * make every car ineligible exactly when a heavy floor most needs one. It would also make
 * `assignmentMode: split-demand` unreachable, since splitting is triggered by the same large
 * queue that would have disqualified everybody.
 *
 * The cap is **design load**, not rated load: cars fill to 80% of rated capacity because
 * people do not pack in (CLAUDE.md § modeling rules), and using 1.0 makes every result
 * systematically optimistic. A car that is eligible at all can take at least one person, so
 * the cap never falls below 1 — the "no room whatsoever" case is the load cell's bypass, which
 * has already been asked and answered.
 *
 * Declared boarding mass is scaled by the same ratio, so a caller that weighed its queue keeps
 * a consistent mass per person.
 */
export function requestForCar(car: CarSnapshot, request: CostRequest): CostRequest {
  const declared = request.boardingPassengers;
  if (declared === undefined || declared <= 0) return request;

  const roomKg = car.load.ratedLoadKg * car.load.designLoadFactor - car.load.massKg;
  const room = Math.max(1, Math.floor(roomKg / car.nominalPassengerMassKg));
  if (declared <= room) return request;

  const declaredMassKg = request.boardingMassKg;
  return Object.freeze({
    ...request,
    boardingPassengers: room,
    ...(declaredMassKg === undefined
      ? {}
      : { boardingMassKg: (declaredMassKg * room) / declared }),
  });
}

/**
 * The dispatcher's own hard filters, applied to a car the *car* already accepted.
 *
 * Order is most-structural-first, matching `infeasibilityOf`: a hard constraint declared in
 * the profile outranks a threshold, because retuning a threshold will never satisfy it.
 */
function dispatcherRejection(
  car: CarSnapshot,
  call: DispatchCall,
  estimate: CostEstimate,
  config: ResolvedDispatchConfig,
): { reason: IneligibilityReason; constraintId: 'noDirectionReversal' | undefined } | undefined {
  const reversal = assessDirectionReversal(car, call);

  if (config.constraints.noDirectionReversal && reversal.reversals > 0) {
    return { reason: 'hardConstraint', constraintId: 'noDirectionReversal' };
  }
  if (!config.eligibility.allowOppositeDirectionPickup && reversal.opposesCallDirection) {
    return { reason: 'oppositeDirection', constraintId: undefined };
  }
  if (estimate.resultingLoadFactor > config.eligibility.maxLoadFactorForAssignment) {
    return { reason: 'loadFactorCeiling', constraintId: undefined };
  }
  return undefined;
}

function verdict(
  carId: string,
  eligible: boolean,
  estimate: CostEstimate,
  request: CostRequest,
  reason: IneligibilityReason | undefined,
  constraintId: 'noDirectionReversal' | undefined,
  bypassOverridden: boolean,
): EligibilityVerdict {
  return Object.freeze({
    carId,
    eligible,
    reason,
    constraintId,
    estimate,
    request,
    bypassOverridden,
  });
}

/**
 * **Stage 2.** Which cars may take this call at all, and why the others may not.
 *
 * Two passes:
 *
 * 1. Every car is asked `Car.estimateCost()` — the pure query — which answers service mode,
 *    service zoning, access zoning and the load cell. A `false` there is the car's own answer
 *    and the dispatcher does not second-guess it. Then the dispatcher's filters run:
 *    declared hard constraints, `allowOppositeDirectionPickup`, `maxLoadFactorForAssignment`.
 * 2. The **starvation guard**. If nothing survived and `answer.allowBypassIfSoleEligibleCar`
 *    is set and exactly one car was rejected *solely* because it is bypassing on load, that
 *    car is re-estimated with the bypass overridden and admitted. "Exactly one" is the literal
 *    reading of "sole eligible car": with two full cars, a floor waiting for one of them to
 *    unload is correct behaviour, not starvation, and sending an already-full car would leave
 *    the passengers on the landing anyway.
 *
 * The verdicts come back in the order the cars were supplied, so a caller can zip them against
 * its own list. Ordering by cost is stage 3's job.
 *
 * Pure. Returns one estimate per car, which stage 3 reuses rather than recomputing.
 */
export function filterEligible(
  cars: readonly CarSnapshot[],
  call: DispatchCall,
  request: CostRequest,
  config: ResolvedDispatchConfig,
): readonly EligibilityVerdict[] {
  const verdicts: EligibilityVerdict[] = [];
  let eligibleCount = 0;
  const bypassBlocked: number[] = [];

  for (const car of cars) {
    const asked = requestForCar(car, request);
    const estimate = estimateCost(car, asked);

    if (!estimate.feasible) {
      const reason = estimate.infeasibleReason;
      /* c8 ignore next -- `estimateCost` always reports a reason with an infeasible verdict. */
      const resolved: IneligibilityReason = reason ?? 'serviceMode';
      if (resolved === 'hallCallBypass') bypassBlocked.push(verdicts.length);
      verdicts.push(verdict(car.carId, false, estimate, asked, resolved, undefined, false));
      continue;
    }

    const rejection = dispatcherRejection(car, call, estimate, config);
    if (rejection !== undefined) {
      verdicts.push(
        verdict(car.carId, false, estimate, asked, rejection.reason, rejection.constraintId, false),
      );
      continue;
    }

    eligibleCount += 1;
    verdicts.push(verdict(car.carId, true, estimate, asked, undefined, undefined, false));
  }

  if (eligibleCount > 0 || !config.answer.allowBypassIfSoleEligibleCar) {
    return Object.freeze(verdicts);
  }
  if (bypassBlocked.length !== 1) return Object.freeze(verdicts);

  const index = bypassBlocked[0];
  /* c8 ignore next -- unreachable: the index came from this same array. */
  if (index === undefined) return Object.freeze(verdicts);
  const car = cars[index];
  /* c8 ignore next -- unreachable: verdicts and cars are built in lockstep. */
  if (car === undefined) return Object.freeze(verdicts);

  const overridden = withBypassOverridden(car);
  const asked = requestForCar(overridden, request);
  const estimate = estimateCost(overridden, asked);
  if (!estimate.feasible) return Object.freeze(verdicts);

  const rejection = dispatcherRejection(overridden, call, estimate, config);
  verdicts[index] =
    rejection === undefined
      ? verdict(car.carId, true, estimate, asked, undefined, undefined, true)
      : verdict(car.carId, false, estimate, asked, rejection.reason, rejection.constraintId, false);

  return Object.freeze(verdicts);
}

/* -------------------------------------------------------------------------- *
 * Stage 4 — assignment
 * -------------------------------------------------------------------------- */

/**
 * How many cars this call should be allocated to.
 *
 * `single-car` is always one. `split-demand` allocates `ceil(waiting / splitThreshold)` cars
 * once the landing queue is *above* the threshold, capped by how many are eligible: a lobby
 * with 30 people waiting and a threshold of 12 gets three cars in parallel rather than one car
 * making three trips. Below the threshold it is still one car, because two cars racing to a
 * landing with four people on it wastes a car and a set of doors.
 */
export function assignmentWidth(
  config: ResolvedDispatchConfig,
  eligibleCount: number,
  waitingPassengers: number,
): number {
  if (eligibleCount <= 0) return 0;
  if (config.dispatch.assignmentMode !== 'split-demand') return 1;

  const threshold = config.dispatch.splitThresholdPassengers;
  if (waitingPassengers <= threshold) return 1;
  return Math.min(eligibleCount, Math.ceil(waitingPassengers / threshold));
}

/**
 * How many of the landing each of `width` cars is asked to take.
 *
 * `undefined` when nobody counted the queue or nothing was allocated — the request then omits
 * `boardingPassengers` entirely and each car charges its own `assumedBoardingPassengers`,
 * which is the honest price of a bare up/down button.
 *
 * Ceiling rather than floor so the shares cover the landing: three cars for twenty people is
 * seven each, not six. A car that finds fewer waiting on arrival simply loads fewer; a car
 * priced for fewer than will board would have promised a dwell it cannot keep.
 */
export function landingShare(waitingPassengers: number, width: number): number | undefined {
  if (waitingPassengers <= 0 || width <= 0) return undefined;
  return Math.ceil(waitingPassengers / width);
}

/**
 * The call as one car of a **split** assignment is asked to price it: its share of the
 * landing, not the whole queue.
 *
 * `assignmentMode: split-demand` names several cars for one button, and each of them serves a
 * fraction of it. Pricing every one of them for the entire queue is the same error
 * {@link requestForCar} exists to prevent — *"a landing of thirty is not thirty boarders"* —
 * one level up: it inflates each car's dwell by the transfers of passengers another car will
 * carry, projects a load factor none of them will reach, and then lets
 * `maxLoadFactorForAssignment` disqualify cars for a load they were never going to take,
 * exactly when a heavy floor most needs them.
 *
 * Declared boarding mass is scaled by the same ratio, so a caller that weighed its queue keeps
 * a consistent mass per person. A request with no count is returned unchanged: there is
 * nothing to divide. The share is rounded up to whole people — two thirds of a passenger
 * neither boards nor takes two thirds of a transfer time.
 */
export function requestForShare(request: CostRequest, share: number): CostRequest {
  const declared = request.boardingPassengers;
  if (declared === undefined || share <= 0 || share >= declared) return request;

  const whole = Math.ceil(share);
  const declaredMassKg = request.boardingMassKg;
  return Object.freeze({
    ...request,
    boardingPassengers: whole,
    ...(declaredMassKg === undefined
      ? {}
      : { boardingMassKg: (declaredMassKg * whole) / declared }),
  });
}

/* -------------------------------------------------------------------------- *
 * Stage 5 — reassignment
 * -------------------------------------------------------------------------- */

/**
 * Whether this car's commitment to this call has become irrevocable.
 *
 * The three commitment points are nested, deliberately: `on-assignment` ⊇ `on-deceleration` ⊇
 * `on-door-open`, so moving the knob later always makes reassignment *more* available and
 * never swaps one behaviour for an unrelated one.
 *
 * - **`on-assignment`** — the assignment is final the moment it is made. Reassignment is off
 *   in all but name; useful as a control, since the whole value of stage 5 is measured against
 *   it.
 * - **`on-deceleration`** — what real systems do, and the mechanism that makes capacity-driven
 *   bypass work: while a car is still cruising, its uncommitted calls can migrate to a car
 *   that has since become better placed. True once the car is inside the `jerkToDecel` phase of
 *   the move that ends at the call floor — read from the real S-curve, not guessed from a
 *   fraction of the trip — **and** once it has arrived, because a car standing at the floor is
 *   past deceleration and a predicate that went false again on arrival would un-commit it.
 * - **`on-door-open`** — the last possible moment: committed only once the doors are moving at
 *   the floor. Maximum reassignment freedom, and the upper bound on what stage 5 can buy.
 */
export function isCommitted(
  car: CarSnapshot,
  call: Pick<DispatchCall, 'floorId'>,
  config: ResolvedDispatchConfig,
  at: number,
): boolean {
  const point = config.dispatch.commitmentPoint;
  if (point === 'on-assignment') return true;

  const standingAtFloor = car.motion === undefined && car.floorId === call.floorId;
  if (point === 'on-door-open') return standingAtFloor && car.door.state !== 'closed';

  if (standingAtFloor) return true;
  const motion = car.motion;
  if (motion === undefined || motion.toFloorId !== call.floorId) return false;
  return at - motion.startedAt >= phaseByName(motion.profile, 'jerkToDecel').startTime;
}

/**
 * Whether an improvement is worth the churn.
 *
 * Two conditions, in two units, on purpose:
 *
 * - the challenger's **weighted cost** must be strictly lower — the cost function decides
 *   *which* car is better, and nothing else is entitled to that judgement;
 * - the new passenger's **estimated wait** must fall by at least `reassignmentHysteresisS`
 *   seconds — seconds decide whether the difference is worth moving a call, because seconds
 *   are the only unit in which "4.0" means something to an engineer or to an optimizer
 *   sampling `[0, 30]`. A dimensionless cost threshold would change meaning with every weight
 *   vector and could not be compared between profiles at all.
 *
 * Without the second condition two near-equal cars trade a call back and forth on
 * floating-point noise, each swap costing the incumbent's already-planned route: the classic
 * thrash. `policy.test.ts` drives it.
 */
export function clearsHysteresis(
  incumbentCost: number,
  incumbentEtaSeconds: number,
  challengerCost: number,
  challengerEtaSeconds: number,
  hysteresisS: number,
): boolean {
  if (!(challengerCost < incumbentCost)) return false;
  return incumbentEtaSeconds - challengerEtaSeconds >= hysteresisS;
}

/* -------------------------------------------------------------------------- *
 * Stage 6 — answering
 * -------------------------------------------------------------------------- */

/**
 * **Stage 6.** Whether this car should stop here for this call.
 *
 * Distinct from stage 2 because the questions are asked at different times about different
 * things: eligibility asks "could you take this call?" before the trip, answering asks "should
 * you open your doors *now*?" on arrival, by which point the car may have filled up.
 *
 * The load threshold itself is not read here. `car.load.isBypassingHallCalls` is the load
 * sensor's own answer, derived from `answer.bypassLoadThreshold`, which
 * `LOAD_SENSOR_PARAMETERS` already declares — the dispatcher reads the effect, not the knob,
 * so there is one source of truth for the threshold. What the dispatcher *does* own is
 * `allowBypassIfSoleEligibleCar`, because whether another car could serve the floor is a fact
 * about the group and no car can know it.
 *
 * Dwell is likewise absent: `dwellPolicy`, `dwellAdaptationGain` and `maxDwellS` are authored
 * under `answer` in a profile and consumed by `physics/doors`, which declares them in
 * `DOOR_PARAMETERS` and implements them. A second implementation here would be a second
 * source of truth for how long a door stays open.
 *
 * `cars` is the **group**, and `undefined` means the caller did not say what the group is —
 * not that the group is this one car. The difference decides whether the starvation override
 * may fire: "no other car could serve this floor" is a claim about the bank, and a claim
 * nobody made is not a claim that happens to be true. With the group unknown the car bypasses
 * on load like any other, which is the conservative half of the trade — a passenger waits for
 * the next car rather than every full car in the bank overriding its own bypass on an
 * assumption.
 */
export function answerDecisionFor(
  car: CarSnapshot,
  call: DispatchCall,
  config: ResolvedDispatchConfig,
  assignedCarIds: readonly string[],
  cars: readonly CarSnapshot[] | undefined,
): AnswerDecision {
  const decision = (answer: boolean, reason: AnswerDecision['reason']): AnswerDecision =>
    Object.freeze({ carId: car.carId, callId: call.id, answer, reason });

  if (car.floorId !== call.floorId || car.motion !== undefined) {
    return decision(false, 'not-at-floor');
  }
  if (!assignedCarIds.includes(car.carId)) {
    return decision(false, 'not-assigned');
  }
  if (
    !config.eligibility.allowOppositeDirectionPickup &&
    assessDirectionReversal(car, call).opposesCallDirection
  ) {
    return decision(false, 'direction-mismatch');
  }
  if (car.load.isBypassingHallCalls) {
    if (
      config.answer.allowBypassIfSoleEligibleCar &&
      cars !== undefined &&
      isSoleCarForFloor(car, call, cars)
    ) {
      return decision(true, 'sole-eligible-override');
    }
    return decision(false, 'bypassing-load');
  }
  return decision(true, 'assigned');
}

/**
 * Whether this is the only car in the group whose shaft reaches the call floor and whose mode
 * takes hall calls.
 *
 * Load is deliberately not part of the test: the question is whether anybody *else* could ever
 * serve this floor, not whether they happen to be free.
 */
function isSoleCarForFloor(
  car: CarSnapshot,
  call: Pick<DispatchCall, 'floorId'>,
  cars: readonly CarSnapshot[],
): boolean {
  let count = 0;
  for (const candidate of cars) {
    if (candidate.mode !== 'in-service') continue;
    if (!candidate.shaft.floorsById.has(call.floorId)) continue;
    count += 1;
    if (count > 1) return false;
  }
  return count === 1 && car.shaft.floorsById.has(call.floorId);
}

/* -------------------------------------------------------------------------- *
 * Stage 7 — idle repositioning
 * -------------------------------------------------------------------------- */

/**
 * How many calls a park is expected to answer before the car is drawn away — the number that
 * makes the two sides of the repositioning test the same quantity.
 *
 * The expected saving is **per call**: a car parked at the median answers each future call
 * about `anticipatedSavingS` seconds sooner. The trip to get there is a **one-off**. Comparing
 * them directly, as `saving − w × travel`, asks a car to recoup a whole repositioning trip out
 * of a single call, which no park in a real building can do — on the reference building
 * (`midtown-office`) the best `zone-center` saving anywhere in the shaft is 7.5 s against a
 * 20 s trip, so the strategy could never clear any deadband from any floor and did nothing at
 * all. The trip is therefore charged at `w × travel / PARK_CALL_HORIZON`, seconds *per call*,
 * the same unit as the saving and as `repositionThresholdS`.
 *
 * **A constant, not a tunable**, for the reason `normalize.ts` gives for a bounded term's
 * `fullScale`: it enters the arithmetic only as a divisor of `repositionEnergyWeight`, so
 * declaring it would hand a Phase 7 optimizer two knobs that only ever move the ratio `w / H`
 * — a perfectly degenerate direction it would spend real replications discovering.
 *
 * Two is chosen so the declared `[0, 2]` range of `repositionEnergyWeight` spans the whole
 * meaningful interval. Under the point-mass demand model that `lobby` and `predicted-demand`
 * imply, the per-call saving *equals* the travel time, so `w = 2` puts the net gain at exactly
 * zero and any lower value lets the move through: the knob covers "energy is free" to "energy
 * vetoes every park", and no part of its range is inert. Phase 5's arrival model can estimate
 * the horizon per building; until then a conservative two says a park must pay for itself out
 * of the next call or two.
 */
export const PARK_CALL_HORIZON = 2;

/** Seconds for this car to move between two heights: motor start, real S-curve, levelling. */
export function moveSeconds(car: CarSnapshot, fromHeightM: number, toHeightM: number): number {
  const displacementM = toHeightM - fromHeightM;
  if (displacementM === 0) return 0;
  return (
    car.motorStartDelayS + travelTime(displacementM, car.constraints) + car.levelingSettleS
  );
}

/**
 * Expected response time from a parking floor: the mean time to reach a call, over the floors
 * the shaft serves.
 *
 * Weighted by the demand forecast when one is supplied, uniform otherwise. Built from the real
 * jerk-limited `travelTime`, never `distance / ratedSpeed` — a park two floors away is
 * dominated by jerk and acceleration, and the whole point of parking policy is short hops.
 */
export function expectedResponseSeconds(
  car: CarSnapshot,
  fromHeightM: number,
  forecast?: ReadonlyMap<string, number> | undefined,
): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const floor of car.shaft.floors) {
    const weight = forecast === undefined ? 1 : Math.max(0, forecast.get(floor.id) ?? 0);
    if (weight === 0) continue;
    weighted += weight * moveSeconds(car, fromHeightM, floor.heightM);
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return weighted / totalWeight;
}

/** The floors a strategy may park on, or `undefined` when it has no opinion. */
function parkingCandidates(
  car: CarSnapshot,
  config: ResolvedDispatchConfig,
  context: RepositionContext,
): { readonly floors: readonly ServedFloor[]; readonly reason: RepositionReason | undefined } {
  const served = car.shaft.floors;
  const strategy = config.idle.parkingStrategy;

  if (strategy === 'lobby') {
    const entrances = new Set(context.entranceFloorIds ?? []);
    // Nearest served entrance. A building may have several, and "the lobby" is whichever one
    // this shaft can actually reach.
    const nearest = nearestTo(
      car.heightM,
      served.filter((floor) => entrances.has(floor.id)),
    );
    return nearest === undefined
      ? { floors: [], reason: 'no-target' }
      : { floors: [nearest], reason: undefined };
  }

  if (strategy === 'zone-center') {
    const zone = context.zoneFloorIds === undefined ? undefined : new Set(context.zoneFloorIds);
    const floors = zone === undefined ? served : served.filter((floor) => zone.has(floor.id));
    // The median by shaft index, not by height: the dispatcher's "middle of the zone" is a
    // position in the stop sequence, and a building with a double-height lobby would put the
    // height-midpoint on the wrong floor.
    const middle = floors[Math.floor((floors.length - 1) / 2)];
    return middle === undefined
      ? { floors: [], reason: 'no-target' }
      : { floors: [middle], reason: undefined };
  }

  if (strategy === 'predicted-demand') {
    const forecast = context.demandForecast;
    // Phase 5 lands the learned per-floor arrival model. Until then a caller may supply a
    // forecast and the strategy works exactly as designed; with none it says so rather than
    // silently degrading into `lobby` and reporting a parking result nobody configured.
    if (forecast === undefined) return { floors: [], reason: 'no-forecast' };
    let best: ServedFloor | undefined;
    let bestWeight = 0;
    for (const floor of served) {
      const weight = forecast.get(floor.id) ?? 0;
      if (weight > bestWeight) {
        best = floor;
        bestWeight = weight;
      }
    }
    return best === undefined
      ? { floors: [], reason: 'no-target' }
      : { floors: [best], reason: undefined };
  }

  return { floors: [], reason: 'parked' };
}

/**
 * The demand model a parking strategy implies, when the caller supplies no forecast.
 *
 * This is what makes the arithmetic in {@link repositionDecisionFor} coherent rather than
 * self-defeating. Choosing `lobby` is not a bare instruction to drive to the ground floor: it
 * is an **assertion that the demand worth anticipating originates at the entrances** — the
 * up-peak belief that motivates lobby parking in the first place. Scoring that choice against
 * a uniform demand model would score it against a belief the operator did not hold, and would
 * conclude that lobby parking never pays: with demand spread evenly over a 21-floor shaft the
 * best park is the middle, so the deadband would veto every trip to the lobby and the strategy
 * would silently do nothing.
 *
 * | strategy | implied model |
 * |---|---|
 * | `lobby` | all demand at the served entrance floors |
 * | `zone-center` | demand uniform over the operational zone, or over the shaft when none is given |
 * | `predicted-demand` | the supplied forecast — the strategy has no opinion of its own |
 *
 * An explicit `demandForecast` always wins: a caller that has measured demand outranks any
 * belief implied by a strategy name.
 */
function responseWeights(
  config: ResolvedDispatchConfig,
  context: RepositionContext,
): ReadonlyMap<string, number> | undefined {
  if (context.demandForecast !== undefined) return context.demandForecast;

  const strategy = config.idle.parkingStrategy;
  if (strategy === 'lobby') {
    return new Map((context.entranceFloorIds ?? []).map((id) => [id, 1]));
  }
  if (strategy === 'zone-center' && context.zoneFloorIds !== undefined) {
    return new Map(context.zoneFloorIds.map((id) => [id, 1]));
  }
  // Uniform over everything the shaft serves.
  return undefined;
}

/** Nearest by height, ties broken towards the lower shaft index so the choice is total. */
function nearestTo(heightM: number, floors: readonly ServedFloor[]): ServedFloor | undefined {
  let best: ServedFloor | undefined;
  for (const floor of floors) {
    if (best === undefined) {
      best = floor;
      continue;
    }
    const distance = Math.abs(floor.heightM - heightM);
    const bestDistance = Math.abs(best.heightM - heightM);
    if (distance < bestDistance || (distance === bestDistance && floor.index < best.index)) {
      best = floor;
    }
  }
  return best;
}

/**
 * **Stage 7.** Where an idle car should wait.
 *
 * On sparse-traffic buildings this stage dominates everything else — a car parked at the wrong
 * end of a residential tower adds its whole travel time to every call — which is why it is a
 * lifecycle stage rather than a footnote on assignment.
 *
 * The move is taken only when it pays for itself, **per call**:
 *
 * ```
 * saving = expectedResponse(here) − expectedResponse(target)          seconds per call
 * energy = repositionEnergyWeight × travelSeconds / PARK_CALL_HORIZON seconds per call
 * net    = saving − energy                                            seconds per call
 * move   ⟺ net ≥ repositionThresholdS  and  net > 0
 * ```
 *
 * where the expectation is taken against the demand model the strategy implies — see
 * {@link responseWeights}, which is what stops `lobby` parking being scored against a belief
 * nobody holds — and the one-off trip is amortised over the calls the park will answer, see
 * {@link PARK_CALL_HORIZON}. Both sides are seconds *per call*, which is what makes the
 * subtraction and the deadband mean the same thing; charging a whole trip against a single
 * call left `zone-center` unable to clear any deadband on any floor of the reference building.
 *
 * `repositionEnergyWeight` is the operator's exchange rate between anticipated waiting time
 * and energy spent moving an empty car. `repositionThresholdS` is the deadband: the expected
 * response, in seconds, that every future call must gain before a car is worth moving.
 *
 * Note what the two knobs do and do not separate. Under a demand model with all its weight on
 * the target floor — which is what `lobby` implies in a building with one entrance, and what a
 * point forecast implies for `predicted-demand` — the saving is *identically* the travel time,
 * so the test collapses to `travelSeconds ≥ repositionThresholdS / (1 − w/H)` and the two are
 * one effective knob. That is a property of a one-point demand model, not of the
 * parameterisation: give the model a second floor with any weight — a building with two
 * entrances such as `midtown-office`, any `zone-center` zone, any real forecast — and the
 * saving stops tracking the trip length, and the deadband and the exchange rate price
 * different things again.
 *
 * A car with committed stops or a move in progress is not idle and is left alone.
 */
export function repositionDecisionFor(
  car: CarSnapshot,
  config: ResolvedDispatchConfig,
  context: RepositionContext = {},
): RepositionDecision {
  const decide = (
    move: boolean,
    targetFloorId: string | undefined,
    reason: RepositionReason,
    anticipatedSavingS = 0,
    travelSeconds = 0,
    netGainS = 0,
  ): RepositionDecision =>
    Object.freeze({
      carId: car.carId,
      move,
      targetFloorId,
      reason,
      anticipatedSavingS,
      travelSeconds,
      netGainS,
    });

  if (car.motion !== undefined || car.stops.length > 0 || car.mode !== 'in-service') {
    return decide(false, undefined, 'busy');
  }

  const { floors, reason } = parkingCandidates(car, config, context);
  const target = floors[0];
  if (target === undefined) return decide(false, undefined, reason ?? 'no-target');
  if (target.id === car.floorId) return decide(false, target.id, 'already-there');

  const forecast = responseWeights(config, context);
  const savingS =
    expectedResponseSeconds(car, car.heightM, forecast) -
    expectedResponseSeconds(car, target.heightM, forecast);
  const travelSeconds = moveSeconds(car, car.heightM, target.heightM);
  const energySecondsPerCall =
    (config.idle.repositionEnergyWeight * travelSeconds) / PARK_CALL_HORIZON;
  const netGainS = savingS - energySecondsPerCall;

  if (netGainS <= 0 || netGainS < config.idle.repositionThresholdS) {
    return decide(false, target.id, 'below-threshold', savingS, travelSeconds, netGainS);
  }
  return decide(true, target.id, 'reposition', savingS, travelSeconds, netGainS);
}

/* -------------------------------------------------------------------------- *
 * Lifecycle records
 * -------------------------------------------------------------------------- */

/** A fresh lifecycle for a newly registered call. Frozen; every later stage replaces it. */
export function newLifecycle(
  call: DispatchCall,
  at: number,
  config: ResolvedDispatchConfig,
  observation: DispatchObservation,
): CallLifecycle {
  return Object.freeze({
    callId: call.id,
    call,
    stage: 'registration' as const,
    registeredAt: at,
    scoreableAt: scoreableAt(at, config),
    batchKey: batchKeyOf(call),
    waitingPassengers: observation.waitingPassengers,
    waitingMassKg: observation.waitingMassKg,
    carIds: Object.freeze([]),
    boardingPassengersPerCar: undefined,
    cost: undefined,
    etaSeconds: undefined,
    assignedAt: undefined,
    committedAt: undefined,
    reassignments: 0,
    lastDecisionAt: at,
    answeredAt: undefined,
  });
}

/** A lifecycle with some fields replaced. Frozen. */
export function withLifecycle(
  lifecycle: CallLifecycle,
  patch: Partial<CallLifecycle>,
): CallLifecycle {
  return Object.freeze({ ...lifecycle, ...patch });
}
