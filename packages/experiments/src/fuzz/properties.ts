/**
 * The six properties, as predicates over a finished run.
 *
 * ## Everything here is re-derived, nothing is read back
 *
 * `SimulationResult.conservation` is the simulator's own audit and it is checked *against*
 * these, never *by* them: an audit that certifies itself passes whatever it is wrong about.
 * So the books are recounted from `result.trace` (what was generated) and
 * `result.record.passengers` (what the recorder saw), the occupancy of every car is rebuilt
 * from the boarding and alighting timestamps, and the load cell's own samples are used only as
 * a second opinion to compare that reconstruction with.
 *
 * ## What `sim/conservation.test.ts` already covers, and what this adds
 *
 * That suite is the prior art and this is deliberately additive. It already checks, on the
 * **five shipped buildings** and a handful of seeds:
 *
 * - `generated === delivered + undelivered`, recounted from the trace;
 * - `legsCreated === legsRecorded === record.passengers.length`;
 * - the last leg of a delivered journey alighted at the trace's declared final destination;
 * - every undelivered journey is named, with a reason consistent with its timestamps;
 * - a boarded leg's bank serves both its origin and its destination, and access zoning is
 *   satisfied at the destination.
 *
 * What it cannot do is vary the building, and four of the six properties below are invisible
 * without that. This module adds, on **generated** buildings:
 *
 * - **the leg chain** — leg *k*'s destination is leg *k*+1's origin, and the recorded legs are
 *   a prefix of the *planned* ones, so a passenger cannot be quietly re-routed (P2);
 * - **the boarding rule, mechanically** — every boarding is replayed against the load cell's
 *   own predicate, and the reconstructed peak load is compared with the recorded samples (P3);
 * - **time monotonicity across every leg and journey**, including the summary (P4);
 * - **deadlock**, as a distinct failure from saturation: cars idle while somebody they could
 *   serve waits (P5);
 * - **starvation**, bounded, with the "flagged saturated" escape the doc requires (P6).
 *
 * Nothing here reads a wall clock and nothing draws a random number.
 */

import {
  buildJourneys,
  resolveLoadSensor,
  type DispatcherProfile,
  type ElevatorSpecs,
  type JourneyRecord,
  type PassengerRecord,
  type ResolvedBuilding,
  type ResolvedCar,
  type SimulationResult,
} from '@elevator-sim/core';

import type { FuzzCase, PropertyBounds, Violation } from './types.js';

/** Metres, kilograms and seconds are doubles; this absorbs binary-float dust in a comparison. */
const EPSILON = 1e-9;

export interface PropertyContext {
  readonly case: FuzzCase;
  readonly building: ResolvedBuilding;
  readonly dispatcherProfile: DispatcherProfile;
  readonly elevatorSpecs: ElevatorSpecs;
  readonly result: SimulationResult;
  readonly bounds: PropertyBounds;
}

/* -------------------------------------------------------------------------- *
 * Shared derivations
 * -------------------------------------------------------------------------- */

/** Floor id to the credential groups permitted there. Absent means unrestricted. */
function permittedGroupsByFloor(building: ResolvedBuilding): ReadonlyMap<string, ReadonlySet<string>> {
  const permitted = new Map<string, Set<string>>();
  for (const zone of building.accessZones) {
    for (const floorId of zone.floors) {
      const groups = permitted.get(floorId) ?? new Set<string>();
      for (const group of zone.credentialGroups) groups.add(group);
      permitted.set(floorId, groups);
    }
  }
  return permitted;
}

/**
 * Whether the fleet could, in principle, carry this leg.
 *
 * Three separate questions, kept separate because collapsing them is exactly the modelling
 * error `CLAUDE.md` warns about:
 *
 * 1. **service zoning** — some bank's shaft reaches both floors;
 * 2. **access zoning at the origin** — the *call* must carry a credential the landing accepts,
 *    and `costRequestFor` forwards one only under `mobile-credential`. Under a bare up/down
 *    button a call from a restricted landing is unassignable and those passengers are locked
 *    out for the whole run. That is a real operating condition, not a defect;
 * 3. **access zoning at the destination** — the *passenger's* credential, which is what
 *    `Simulation.#carCanCarry` checks at boarding time.
 *
 * A leg that fails any of them is legitimately unservable and is exempt from the starvation
 * and deadlock bounds — but it must still be *named* in `undelivered`, which P1 checks.
 */
function isServable(
  building: ResolvedBuilding,
  permitted: ReadonlyMap<string, ReadonlySet<string>>,
  callCarriesCredential: boolean,
  originFloorId: string,
  destinationFloorId: string,
  credentialGroup: string | undefined,
): boolean {
  const connected = building.banks.some((bank) => {
    const floors = new Set(bank.servesFloors);
    return floors.has(originFloorId) && floors.has(destinationFloorId);
  });
  if (!connected) return false;

  const originGroups = permitted.get(originFloorId);
  if (originGroups !== undefined) {
    const callCredential = callCarriesCredential ? credentialGroup : undefined;
    if (callCredential === undefined || !originGroups.has(callCredential)) return false;
  }
  const destinationGroups = permitted.get(destinationFloorId);
  if (destinationGroups !== undefined) {
    if (credentialGroup === undefined || !destinationGroups.has(credentialGroup)) return false;
  }
  return true;
}

function legsByJourney(records: readonly PassengerRecord[]): Map<string, PassengerRecord[]> {
  const grouped = new Map<string, PassengerRecord[]>();
  for (const leg of records) {
    const bucket = grouped.get(leg.journeyId);
    if (bucket === undefined) grouped.set(leg.journeyId, [leg]);
    else bucket.push(leg);
  }
  for (const bucket of grouped.values()) bucket.sort((a, b) => a.legIndex - b.legIndex);
  return grouped;
}

/* -------------------------------------------------------------------------- *
 * P1 — conservation: nobody vanishes
 * -------------------------------------------------------------------------- */

/**
 * Every generated journey is delivered to its declared final destination, or named in
 * `undelivered`. There is no third state.
 *
 * Recounted from the trace and the record rather than from `result.conservation`, and the
 * audit's own numbers are then compared with the recount — so a bug in the audit fails here
 * instead of hiding here.
 */
export function checkConservation(context: PropertyContext): Violation[] {
  const { result } = context;
  const violations: Violation[] = [];
  const fail = (message: string, subject?: string): void => {
    violations.push({ property: 'conservation', message, ...(subject === undefined ? {} : { subject }) });
  };

  const planned = new Map(result.trace.passengers.map((record) => [record.journeyId, record]));
  const generated = result.trace.passengerCount;
  if (planned.size !== generated) {
    fail(`trace declares ${String(generated)} journeys but carries ${String(planned.size)} distinct journey ids`);
  }

  // Leg identity is what `undelivered.legId` and every metric join on. Two legs sharing an id
  // would make one of them unreachable from the audit while both stayed in the mean.
  const seenLegIds = new Set<string>();
  for (const leg of result.record.passengers) {
    if (seenLegIds.has(leg.passengerId)) fail(`leg id "${leg.passengerId}" appears twice`, leg.passengerId);
    seenLegIds.add(leg.passengerId);
  }

  const grouped = legsByJourney(result.record.passengers);
  for (const journeyId of grouped.keys()) {
    if (!planned.has(journeyId)) fail(`recorded journey "${journeyId}" is not in the trace`, journeyId);
  }
  for (const journeyId of planned.keys()) {
    if (!grouped.has(journeyId)) {
      fail(`generated journey "${journeyId}" has no recorded leg: it vanished`, journeyId);
    }
  }

  // Recount delivered independently of the audit.
  let delivered = 0;
  for (const [journeyId, plan] of planned) {
    const legs = grouped.get(journeyId);
    if (legs === undefined || legs.length === 0) continue;
    const last = legs[legs.length - 1];
    if (last === undefined) continue;
    if (legs.length > plan.legs.length) {
      fail(
        `journey "${journeyId}" recorded ${String(legs.length)} legs; the trace planned ${String(plan.legs.length)}`,
        journeyId,
      );
    }
    if (last.alightedAt !== undefined && last.isFinalLeg) delivered += 1;
  }

  const undelivered = result.undelivered.length;
  if (delivered + undelivered !== generated) {
    fail(
      `books do not balance: ${String(generated)} generated, ${String(delivered)} delivered, ${String(undelivered)} named undelivered`,
    );
  }

  // The audit must agree with the recount, in every field it shares with it.
  const audit = result.conservation;
  if (audit.generated !== generated) fail(`audit says ${String(audit.generated)} generated; the trace says ${String(generated)}`);
  if (audit.delivered !== delivered) fail(`audit says ${String(audit.delivered)} delivered; the recount says ${String(delivered)}`);
  if (audit.undelivered !== undelivered) fail(`audit says ${String(audit.undelivered)} undelivered; ${String(undelivered)} are named`);
  if (!audit.balanced) fail('audit reports the books do not balance');
  if (audit.legsRecorded !== audit.legsCreated) {
    fail(`${String(audit.legsCreated)} legs created, ${String(audit.legsRecorded)} recorded: a leg is invisible to every statistic`);
  }
  if (result.record.passengers.length !== audit.legsCreated) {
    fail(
      `record holds ${String(result.record.passengers.length)} legs; the audit created ${String(audit.legsCreated)}`,
    );
  }
  if (audit.legsCreated !== generated + audit.transfers) {
    fail(
      `legsCreated ${String(audit.legsCreated)} is not generated ${String(generated)} plus transfers ${String(audit.transfers)}`,
    );
  }

  // Every undelivered journey is a real journey, named once, on a real leg.
  const legIds = new Set(result.record.passengers.map((leg) => leg.passengerId));
  const namedJourneys = new Set<string>();
  for (const journey of result.undelivered) {
    if (!planned.has(journey.journeyId)) {
      fail(`undelivered journey "${journey.journeyId}" was never generated`, journey.journeyId);
    }
    if (!legIds.has(journey.legId)) {
      fail(`undelivered leg "${journey.legId}" is not in the record`, journey.journeyId);
    }
    if (namedJourneys.has(journey.journeyId)) {
      fail(`journey "${journey.journeyId}" is named undelivered twice`, journey.journeyId);
    }
    namedJourneys.add(journey.journeyId);
    if (journey.reason === 'waiting' && journey.boardedAt !== undefined) {
      fail(`journey "${journey.journeyId}" is "waiting" but has boarded`, journey.journeyId);
    }
    if (journey.reason === 'riding' && journey.boardedAt === undefined) {
      fail(`journey "${journey.journeyId}" is "riding" but never boarded`, journey.journeyId);
    }
  }

  if (result.status === 'completed' && undelivered > 0) {
    fail(`run reports "completed" with ${String(undelivered)} journeys still in the system`);
  }
  return violations;
}

/* -------------------------------------------------------------------------- *
 * P2 — destination: nobody is put down in the wrong place
 * -------------------------------------------------------------------------- */

/**
 * Every recorded leg matches the leg the trace planned, and every delivered journey ends where
 * it asked to.
 *
 * The strong form: the recorded legs must be a **prefix of the plan**, floor for floor. A
 * simulator that delivered somebody to a plausible-but-wrong floor — the sky lobby of the
 * other bank, the floor below on a skipped-number shaft — would still balance its books and
 * still report a believable waiting time.
 */
export function checkDestination(context: PropertyContext): Violation[] {
  const { building, result } = context;
  const violations: Violation[] = [];
  const fail = (message: string, subject?: string): void => {
    violations.push({ property: 'destination', message, ...(subject === undefined ? {} : { subject }) });
  };

  const planned = new Map(result.trace.passengers.map((record) => [record.journeyId, record]));
  const grouped = legsByJourney(result.record.passengers);
  const bankFloors = new Map(building.banks.map((bank) => [bank.id, new Set(bank.servesFloors)]));
  // `Simulation` names a car `${bankId}-${carConfigId}`, so this is the record's own vocabulary.
  const bankOfCar = new Map<string, string>();
  for (const bank of building.banks) {
    for (const car of bank.cars) bankOfCar.set(`${bank.id}-${car.id}`, bank.id);
  }

  // Service zoning, one level below the leg: a leg attributed to a car in another bank would
  // pass every per-bank check above while the run had used hardware from a different shaft.
  for (const leg of result.record.passengers) {
    if (leg.carId === undefined) continue;
    const owner = bankOfCar.get(leg.carId);
    if (owner === undefined) {
      fail(`leg "${leg.passengerId}" names car "${leg.carId}", which this building does not declare`, leg.passengerId);
    } else if (leg.bankId !== undefined && leg.bankId !== owner) {
      fail(
        `leg "${leg.passengerId}" is attributed to bank "${leg.bankId}" but rode car "${leg.carId}", which belongs to "${owner}"`,
        leg.passengerId,
      );
    }
  }
  for (const carId of result.record.carIds ?? []) {
    if (!bankOfCar.has(carId)) fail(`record declares car "${carId}", which this building does not`, carId);
  }

  for (const [journeyId, legs] of grouped) {
    const plan = planned.get(journeyId);
    if (plan === undefined) continue; // already reported by P1

    legs.forEach((leg, position) => {
      if (leg.legIndex !== position) {
        fail(`journey "${journeyId}" leg ${String(position)} carries legIndex ${String(leg.legIndex)}`, leg.passengerId);
      }
      const plannedLeg = plan.legs[leg.legIndex];
      if (plannedLeg === undefined) {
        fail(`journey "${journeyId}" recorded a leg ${String(leg.legIndex)} the trace never planned`, leg.passengerId);
        return;
      }
      if (leg.originFloorId !== plannedLeg.originFloorId) {
        fail(
          `leg "${leg.passengerId}" started at "${leg.originFloorId}"; the trace planned "${plannedLeg.originFloorId}"`,
          leg.passengerId,
        );
      }
      if (leg.destinationFloorId !== plannedLeg.destinationFloorId) {
        fail(
          `leg "${leg.passengerId}" is bound for "${leg.destinationFloorId}"; the trace planned "${plannedLeg.destinationFloorId}"`,
          leg.passengerId,
        );
      }
      if (leg.finalDestinationFloorId !== plan.finalDestinationFloorId) {
        fail(
          `leg "${leg.passengerId}" claims final destination "${leg.finalDestinationFloorId}"; the journey's is "${plan.finalDestinationFloorId}"`,
          leg.passengerId,
        );
      }
      const isLastPlanned = leg.legIndex === plan.legs.length - 1;
      if (leg.isFinalLeg !== isLastPlanned) {
        fail(
          `leg "${leg.passengerId}" reports isFinalLeg=${String(leg.isFinalLeg)} at leg ${String(leg.legIndex)} of ${String(plan.legs.length)}`,
          leg.passengerId,
        );
      }
      // The chain: you can only start the next leg where the last one put you down.
      const previous = legs[position - 1];
      if (previous !== undefined && previous.destinationFloorId !== leg.originFloorId) {
        fail(
          `journey "${journeyId}" alighted at "${previous.destinationFloorId}" and its next leg starts at "${leg.originFloorId}"`,
          leg.passengerId,
        );
      }
      // A leg that boarded must have boarded a bank whose shaft reaches both ends of it.
      if (leg.bankId !== undefined) {
        const floors = bankFloors.get(leg.bankId);
        if (floors === undefined) {
          fail(`leg "${leg.passengerId}" boarded unknown bank "${leg.bankId}"`, leg.passengerId);
        } else if (!floors.has(leg.originFloorId) || !floors.has(leg.destinationFloorId)) {
          fail(
            `bank "${leg.bankId}" carried leg "${leg.passengerId}" from "${leg.originFloorId}" to "${leg.destinationFloorId}", which it does not serve`,
            leg.passengerId,
          );
        }
      }
    });

    const last = legs[legs.length - 1];
    if (last !== undefined && last.alightedAt !== undefined && last.isFinalLeg) {
      if (last.destinationFloorId !== plan.finalDestinationFloorId) {
        fail(
          `journey "${journeyId}" was delivered to "${last.destinationFloorId}" instead of "${plan.finalDestinationFloorId}"`,
          journeyId,
        );
      }
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- *
 * P3 — capacity: no car carries a load its own rule could not produce
 * -------------------------------------------------------------------------- */

/**
 * Replay every boarding against the load cell's own admission rule.
 *
 * The rule the simulator implements, from `Simulation.#boardFrom`, is **not** a head count and
 * is not "never exceed rated load":
 *
 * > board while the car is below its **design** load — 80 % of rated, never 100 % — and stop
 * > the moment boarding crosses it. Crossing by one person is deliberate and is what a real
 * > car does: the sensor trips *after* somebody steps in.
 *
 * So the two invariants that actually hold, and are checked here per boarding, are
 * `massBefore < designLoadKg` and `massBefore + boarderMass < overloadKg` — the second strict,
 * which makes `loadFactor < overloadThreshold` a hard ceiling on every state a car can reach.
 *
 * A head-count check is deliberately **not** asserted: capacity is mass and the passenger mass
 * distribution is real, so `occupants > capacityPersons` is possible for a light cohort in a
 * small car and asserting otherwise would be asserting a bug in the property. What is asserted
 * instead is the reconstruction's agreement with the load cell's own recorded samples — the
 * peak mass and peak occupancy per car — which catches a recorder that has drifted from the
 * model without needing a threshold at all.
 *
 * Occupancy is rebuilt with a `Map` re-summed on every change, exactly as `LoadSensor` does,
 * rather than with a running total that would accumulate a different rounding history. The two
 * admission conditions are then stated in their **order-invariant** form — see the comment at
 * the check itself, and `the root DECISIONS.md` § D5 — because a stop boards several people at one
 * simulated instant and the record does not preserve the order they went in.
 */
export function checkCapacity(context: PropertyContext): Violation[] {
  const { building, dispatcherProfile, elevatorSpecs, result } = context;
  const violations: Violation[] = [];
  const fail = (message: string, subject?: string): void => {
    violations.push({ property: 'capacity', message, ...(subject === undefined ? {} : { subject }) });
  };

  // `Simulation` names a car `${bankId}-${carConfigId}`, so the record's car ids are not the
  // ids the building config declares. Keying by the config id looks right, finds nothing, and
  // turns every capacity check into a silent no-op.
  const carsById = new Map<string, ResolvedCar>();
  for (const bank of building.banks) {
    for (const car of bank.cars) carsById.set(`${bank.id}-${car.id}`, car);
  }
  const sensors = new Map<string, ReturnType<typeof resolveLoadSensor>>();
  const sensorFor = (carId: string, car: ResolvedCar): ReturnType<typeof resolveLoadSensor> => {
    const cached = sensors.get(carId);
    if (cached !== undefined) return cached;
    const resolved = resolveLoadSensor(car, elevatorSpecs.loadSensor, dispatcherProfile.answer);
    sensors.set(carId, resolved);
    return resolved;
  };

  interface LoadEvent {
    readonly at: number;
    /** 0 = alight, 1 = board. Alighting is settled before boarding at the same instant. */
    readonly kind: 0 | 1;
    readonly legId: string;
    readonly massKg: number;
  }
  const byCar = new Map<string, LoadEvent[]>();
  const push = (carId: string, event: LoadEvent): void => {
    const bucket = byCar.get(carId);
    if (bucket === undefined) byCar.set(carId, [event]);
    else bucket.push(event);
  };

  for (const leg of result.record.passengers) {
    if (leg.carId === undefined) continue;
    if (leg.boardedAt !== undefined) {
      push(leg.carId, { at: leg.boardedAt, kind: 1, legId: leg.passengerId, massKg: leg.massKg });
    }
    if (leg.alightedAt !== undefined) {
      push(leg.carId, { at: leg.alightedAt, kind: 0, legId: leg.passengerId, massKg: leg.massKg });
    }
  }

  const peakMassByCar = new Map<string, number>();
  const peakOccupantsByCar = new Map<string, number>();

  for (const [carId, events] of byCar) {
    const car = carsById.get(carId);
    if (car === undefined) {
      fail(`record names car "${carId}", which this building does not declare`, carId);
      continue;
    }
    const sensor = sensorFor(carId, car);
    const designLoadKg = sensor.ratedLoadKg * sensor.designLoadFactor;
    const overloadKg = sensor.ratedLoadKg * sensor.overloadThreshold;

    events.sort((a, b) => a.at - b.at || a.kind - b.kind || (a.legId < b.legId ? -1 : a.legId > b.legId ? 1 : 0));

    const aboard = new Map<string, number>();
    const massOf = (): number => {
      let total = 0;
      for (const mass of aboard.values()) total += mass;
      return total;
    };
    let peakMass = 0;
    let peakOccupants = 0;

    for (const event of events) {
      if (event.kind === 0) {
        if (!aboard.delete(event.legId)) {
          fail(`leg "${event.legId}" alighted from car "${carId}" without being aboard`, event.legId);
        }
        continue;
      }
      if (aboard.has(event.legId)) {
        fail(`leg "${event.legId}" boarded car "${carId}" twice`, event.legId);
      }
      aboard.set(event.legId, event.massKg);
      const after = massOf();

      // Both conditions are stated in their **order-invariant** form, and that is not a
      // weakening for convenience — it is what the record can support. A stop boards several
      // people at one simulated instant and the record does not preserve the order they went in,
      // so "the mass before *this* boarder was under the cap" is not a question the record can
      // answer: reorder the same cohort and a different person is the one who crossed. Asserting
      // it against an invented order reports a violation for a run that obeyed the rule
      // perfectly, which is what a first draft of this check did.
      //
      // What survives reordering, and is implied by `Simulation.#boardFrom` for every ordering:
      //
      // - `total < overloadKg` — the admission test is `massBefore + candidate < overloadKg` and
      //   the final boarder's instance of it *is* this, whoever the final boarder was.
      // - `total - heaviest < designLoadKg` — boarding stops the moment the cap is crossed, so
      //   removing whoever crossed it leaves the car under the cap, and the heaviest occupant is
      //   at least as heavy as that person.
      //
      // A car with one extra body in it fails both by a whole passenger, not by an epsilon.
      if (after >= overloadKg) {
        fail(
          `car "${carId}" reached ${after.toFixed(1)} kg after leg "${event.legId}" boarded at t=${String(event.at)}, at or above its overload threshold of ${overloadKg.toFixed(1)} kg`,
          carId,
        );
      }
      let heaviest = 0;
      for (const mass of aboard.values()) heaviest = Math.max(heaviest, mass);
      if (after - heaviest >= designLoadKg) {
        fail(
          `car "${carId}" holds ${String(aboard.size)} people weighing ${after.toFixed(1)} kg after leg "${event.legId}" boarded at t=${String(event.at)}; even without its heaviest occupant (${heaviest.toFixed(1)} kg) that is at or above its design load of ${designLoadKg.toFixed(1)} kg, so more than one boarder was admitted past the cap`,
          carId,
        );
      }

      peakMass = Math.max(peakMass, after);
      peakOccupants = Math.max(peakOccupants, aboard.size);
    }
    peakMassByCar.set(carId, peakMass);
    peakOccupantsByCar.set(carId, peakOccupants);
  }

  /* ---- the load cell's own samples, as a second opinion -------------------- */
  const sampledPeakMass = new Map<string, number>();
  const sampledPeakOccupants = new Map<string, number>();
  for (const sample of result.record.loadSamples) {
    const car = carsById.get(sample.carId);
    if (car === undefined) {
      fail(`load sample names car "${sample.carId}", which this building does not declare`, sample.carId);
      continue;
    }
    const sensor = sensorFor(sample.carId, car);
    if (sample.massKg < -EPSILON) fail(`car "${sample.carId}" read a negative load of ${String(sample.massKg)} kg`, sample.carId);
    if (sample.occupants < 0) fail(`car "${sample.carId}" reported ${String(sample.occupants)} occupants`, sample.carId);
    if ((sample.occupants === 0) !== (Math.abs(sample.massKg) <= EPSILON)) {
      fail(
        `car "${sample.carId}" reads ${String(sample.occupants)} occupants at ${String(sample.massKg)} kg: the cell and the head count disagree about whether it is empty`,
        sample.carId,
      );
    }
    if (Math.abs(sample.loadFactor - sample.massKg / sensor.ratedLoadKg) > 1e-9) {
      fail(`car "${sample.carId}" reports loadFactor ${String(sample.loadFactor)} for ${String(sample.massKg)} kg`, sample.carId);
    }
    // A hair of tolerance in the *safe* direction only: the admission rule compares masses
    // (`mass < ratedKg x threshold`) and this compares the quotient, and the two need not agree
    // in the last bit. Anything a real overfill produces is orders of magnitude past 1e-12.
    if (sample.loadFactor > sensor.overloadThreshold + 1e-12) {
      fail(
        `car "${sample.carId}" reached load factor ${sample.loadFactor.toFixed(3)} at t=${String(sample.at)}, at or above its overload threshold of ${String(sensor.overloadThreshold)}`,
        sample.carId,
      );
    }
    sampledPeakMass.set(sample.carId, Math.max(sampledPeakMass.get(sample.carId) ?? 0, sample.massKg));
    sampledPeakOccupants.set(
      sample.carId,
      Math.max(sampledPeakOccupants.get(sample.carId) ?? 0, sample.occupants),
    );
  }

  for (const [carId, peak] of peakMassByCar) {
    const sampled = sampledPeakMass.get(carId) ?? 0;
    if (Math.abs(peak - sampled) > 1e-6) {
      fail(
        `car "${carId}" carried a reconstructed peak of ${peak.toFixed(3)} kg; its load cell recorded a peak of ${sampled.toFixed(3)} kg`,
        carId,
      );
    }
    const occupants = peakOccupantsByCar.get(carId) ?? 0;
    const sampledOccupants = sampledPeakOccupants.get(carId) ?? 0;
    if (occupants !== sampledOccupants) {
      fail(
        `car "${carId}" held a reconstructed peak of ${String(occupants)} occupants; its load cell recorded ${String(sampledOccupants)}`,
        carId,
      );
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- *
 * P4 — monotonic time: nothing runs backwards
 * -------------------------------------------------------------------------- */

/**
 * No negative wait, ride or journey time, and nothing precedes its own arrival.
 *
 * `waitSeconds` is not a stored field — it is `boardedAt - arrivedAt` — so a negative wait is a
 * timestamp ordering failure, and it is checked on the timestamps rather than on the
 * derivations. Journey-level times come from `buildJourneys`, the same view `summarize` reports
 * from, so a TTD that is shorter than the legs it spans fails here rather than being published.
 */
export function checkMonotonicTime(context: PropertyContext): Violation[] {
  const { result } = context;
  const violations: Violation[] = [];
  const fail = (message: string, subject?: string): void => {
    violations.push({ property: 'monotonic-time', message, ...(subject === undefined ? {} : { subject }) });
  };
  const { startedAt, endedAt } = result.record;

  for (const leg of result.record.passengers) {
    const id = leg.passengerId;
    if (!Number.isFinite(leg.arrivedAt)) fail(`leg "${id}" arrived at a non-finite time`, id);
    if (leg.arrivedAt < startedAt - EPSILON) {
      fail(`leg "${id}" arrived at t=${String(leg.arrivedAt)}, before the run started at t=${String(startedAt)}`, id);
    }
    if (leg.arrivedAt > endedAt + EPSILON) {
      fail(`leg "${id}" arrived at t=${String(leg.arrivedAt)}, after the run ended at t=${String(endedAt)}`, id);
    }
    if (leg.journeyStartedAt > leg.arrivedAt + EPSILON) {
      fail(`leg "${id}" starts its journey at t=${String(leg.journeyStartedAt)}, after its own arrival at t=${String(leg.arrivedAt)}`, id);
    }
    if (leg.legIndex < 0) fail(`leg "${id}" has legIndex ${String(leg.legIndex)}`, id);
    if (!Number.isFinite(leg.massKg) || leg.massKg <= 0) {
      fail(`leg "${id}" carries a mass of ${String(leg.massKg)} kg`, id);
    }
    if (leg.boardedAt !== undefined) {
      if (leg.boardedAt < leg.arrivedAt - EPSILON) {
        fail(
          `leg "${id}" boarded at t=${String(leg.boardedAt)} having arrived at t=${String(leg.arrivedAt)}: a wait of ${String(leg.boardedAt - leg.arrivedAt)} s`,
          id,
        );
      }
      if (leg.boardedAt > endedAt + EPSILON) {
        fail(`leg "${id}" boarded at t=${String(leg.boardedAt)}, after the run ended`, id);
      }
    }
    if (leg.alightedAt !== undefined) {
      if (leg.boardedAt === undefined) {
        fail(`leg "${id}" alighted at t=${String(leg.alightedAt)} without ever boarding`, id);
      } else if (leg.alightedAt < leg.boardedAt - EPSILON) {
        fail(
          `leg "${id}" alighted at t=${String(leg.alightedAt)} having boarded at t=${String(leg.boardedAt)}: a ride of ${String(leg.alightedAt - leg.boardedAt)} s`,
          id,
        );
      }
      if (leg.alightedAt > endedAt + EPSILON) {
        fail(`leg "${id}" alighted at t=${String(leg.alightedAt)}, after the run ended`, id);
      }
    }
  }

  const journeys: readonly JourneyRecord[] = buildJourneys(result.record.passengers);
  for (const journey of journeys) {
    if (journey.totalWaitSeconds < -EPSILON) {
      fail(`journey "${journey.journeyId}" totals ${String(journey.totalWaitSeconds)} s of waiting`, journey.journeyId);
    }
    if (journey.totalRideSeconds < -EPSILON) {
      fail(`journey "${journey.journeyId}" totals ${String(journey.totalRideSeconds)} s of riding`, journey.journeyId);
    }
    const ttd = journey.timeToDestinationSeconds;
    if (ttd === undefined) continue;
    if (ttd < -EPSILON) fail(`journey "${journey.journeyId}" has a time to destination of ${String(ttd)} s`, journey.journeyId);
    if (ttd + EPSILON < journey.totalWaitSeconds + journey.totalRideSeconds) {
      fail(
        `journey "${journey.journeyId}" reports ${String(ttd)} s to destination, less than the ${String(journey.totalWaitSeconds + journey.totalRideSeconds)} s its own legs took`,
        journey.journeyId,
      );
    }
    if ((journey.transferSeconds ?? 0) < -EPSILON) {
      fail(`journey "${journey.journeyId}" spent ${String(journey.transferSeconds)} s transferring`, journey.journeyId);
    }
  }

  for (const journey of result.undelivered) {
    if (journey.arrivedAt < journey.journeyStartedAt - EPSILON) {
      fail(`undelivered journey "${journey.journeyId}" arrived before it started`, journey.journeyId);
    }
    if (journey.boardedAt !== undefined && journey.boardedAt < journey.arrivedAt - EPSILON) {
      fail(`undelivered journey "${journey.journeyId}" boarded before it arrived`, journey.journeyId);
    }
  }

  // The queue series is the direct input to saturation detection, and a sample out of order or
  // a negative count would corrupt the OLS fit that decides whether the AWT may be published.
  let previousSampleAt = Number.NEGATIVE_INFINITY;
  for (const sample of result.record.queueSamples) {
    if (sample.at < previousSampleAt - EPSILON) {
      fail(`queue sample at t=${String(sample.at)} follows one at t=${String(previousSampleAt)}`);
    }
    previousSampleAt = sample.at;
    if (sample.waiting < 0) fail(`queue sample at t=${String(sample.at)} reports ${String(sample.waiting)} waiting`);
  }
  let previousLoadAt = Number.NEGATIVE_INFINITY;
  for (const sample of result.record.loadSamples) {
    if (sample.at < previousLoadAt - EPSILON) {
      fail(`load sample at t=${String(sample.at)} follows one at t=${String(previousLoadAt)}`, sample.carId);
    }
    previousLoadAt = sample.at;
  }

  const negative = (label: string, value: number): void => {
    if (Number.isNaN(value)) return; // "nobody was served" is NaN by design, never 0
    if (value < -EPSILON) fail(`summary reports ${label} of ${String(value)}`);
  };
  negative('mean wait', result.summary.waiting.meanS);
  negative('WT95', result.summary.waiting.p95S);
  negative('mean ride time', result.summary.rideTime.meanS);
  negative('mean time to destination', result.summary.timeToDestination.meanS);
  return violations;
}

/* -------------------------------------------------------------------------- *
 * P5 — termination: the run finishes, and never sits idle with work to do
 * -------------------------------------------------------------------------- */

/**
 * The run terminates, and no stretch of it is a deadlock.
 *
 * Two claims, and the second is the one that needs a definition. `status: 'aborted'` is the
 * event budget being exhausted — a livelock — and is a failure outright. A *deadlock* is
 * subtler and is deliberately defined so that it cannot be confused with saturation: a
 * saturated system is not idle, its cars board and alight continuously and only the queue
 * grows. So the signature checked here is **the fleet did no passenger work — no boarding, no
 * alighting, anywhere — for `deadlockIdleBoundS` simulated seconds before its own hard
 * deadline, while at least one passenger it could serve was already waiting.**
 *
 * Measuring the idle stretch against the **deadline** rather than against `endedAt` is
 * deliberate, and a first draft that used `endedAt` measured nothing. `docs/07-handoff.md`
 * asks for "no state where calls exist, cars are idle, and nothing is scheduled", and *nothing
 * is scheduled* is exactly the case where the run stops early: the kernel runs out of events
 * and `endedAt` lands wherever the last one was, so `endedAt - lastActivity` is zero however
 * completely the group has stalled. Measured against the deadline, both shapes of stall — the
 * run that idles to its deadline and the run that quietly runs dry with people on the landings
 * — produce the same large number. A legitimately truncated run (one whose next event would
 * fall past the deadline, so it is not scheduled) loses at most one car event, two orders of
 * magnitude inside the bound.
 *
 * Passengers the fleet legitimately cannot serve — an access lockout, a floor no bank reaches —
 * are exempt, because a run that cannot collect them is reporting the truth. They are still
 * required to be *named*, which P1 checks.
 *
 * **A fleet that never moves at all is the case this check was blind to**, and the blindness is
 * worth stating because it survived a whole Phase 8 campaign: the idle stretch used to be
 * measured once for the run, against a `lastActivityAt` that falls back to `record.startedAt`
 * when nobody ever boards — so every passenger arrived "after" it, every one was skipped as not
 * yet waiting, and the deadest possible building reported nothing. Service mode made that
 * configuration authorable and it turned up immediately. The stretch is now measured per
 * passenger, from whenever their own wait overlaps the fleet's inactivity; see the comment at
 * the comparison itself.
 */
export function checkTermination(context: PropertyContext): Violation[] {
  const { building, result, bounds } = context;
  const violations: Violation[] = [];
  const fail = (message: string, subject?: string): void => {
    violations.push({ property: 'termination', message, ...(subject === undefined ? {} : { subject }) });
  };

  if (result.status === 'aborted') {
    fail(`run aborted after ${String(result.events)} events: a handler was still scheduling work when the budget ran out`);
  }
  if (result.endedAt > result.deadlineS + EPSILON) {
    fail(`run ended at t=${String(result.endedAt)}, past its hard deadline of t=${String(result.deadlineS)}`);
  }
  if (result.record.endedAt < result.record.startedAt) {
    fail(`run ended at t=${String(result.record.endedAt)}, before it started at t=${String(result.record.startedAt)}`);
  }

  if (result.undelivered.length === 0) return violations;

  let lastActivityAt = result.record.startedAt;
  for (const leg of result.record.passengers) {
    if (leg.boardedAt !== undefined) lastActivityAt = Math.max(lastActivityAt, leg.boardedAt);
    if (leg.alightedAt !== undefined) lastActivityAt = Math.max(lastActivityAt, leg.alightedAt);
  }
  const permitted = permittedGroupsByFloor(building);
  const callCarriesCredential = context.case.callType === 'mobile-credential';
  const credentialByJourney = new Map(
    result.trace.passengers.map((record) => [record.journeyId, record.credentialGroup]),
  );

  for (const journey of result.undelivered) {
    const waitingSince = Math.max(journey.arrivedAt, journey.boardedAt ?? Number.NEGATIVE_INFINITY);
    /*
     * The idle stretch **this passenger actually sat through**, rather than the run's longest
     * one: the fleet has been doing nothing since `lastActivityAt`, and this passenger has been
     * outstanding since `waitingSince`, so the overlap starts at whichever is later.
     *
     * The first draft compared the run-wide `deadlineS - lastActivityAt` against the bound and
     * then skipped any journey with `waitingSince > lastActivityAt`. That is the same number
     * whenever the passenger arrived before the stall — and it is blind to the one case it most
     * needs to catch. When the fleet does **no work at all**, `lastActivityAt` falls back to
     * `record.startedAt`; every passenger arrives after that, so every one of them is skipped and
     * a building in which literally nobody ever boarded reports no deadlock. That is not
     * hypothetical: an authored all-out-of-service fleet
     * (`validation/adversarial.test.ts`, "boards nobody at all …") produced exactly it, passing
     * all six properties while delivering none of 365 journeys.
     *
     * This form is **strictly stronger**, never weaker: when `waitingSince <= lastActivityAt` the
     * maximum is `lastActivityAt` and it reduces to the original expression exactly.
     */
    const stallBeganAt = Math.max(lastActivityAt, waitingSince);
    const idleSeconds = result.deadlineS - stallBeganAt;
    if (idleSeconds <= bounds.deadlockIdleBoundS) continue;
    const servable = isServable(
      building,
      permitted,
      callCarriesCredential,
      journey.originFloorId,
      journey.destinationFloorId,
      credentialByJourney.get(journey.journeyId),
    );
    if (!servable) continue;
    fail(
      `deadlock: the last passenger boarded or alighted anywhere at t=${lastActivityAt.toFixed(1)}, and nothing has happened for the ${idleSeconds.toFixed(1)} s before this run's hard deadline of t=${String(result.deadlineS)} (it stopped at t=${String(result.endedAt)}, status ${result.status}), while journey "${journey.journeyId}" (${journey.originFloorId} to ${journey.destinationFloorId}, ${journey.reason}) was servable and outstanding since t=${String(waitingSince)}`,
      journey.journeyId,
    );
    return violations; // one is enough; they all describe the same stall
  }
  return violations;
}

/* -------------------------------------------------------------------------- *
 * P6 — starvation: nobody is abandoned in silence
 * -------------------------------------------------------------------------- */

/**
 * No servable passenger waits beyond {@link PropertyBounds.starvationBoundS} unless the run is
 * flagged saturated.
 *
 * The escape clause is the point, and it is the doc's: `CLAUDE.md` § Statistical discipline
 * requires that a configuration whose queues grow without bound is *flagged and its AWT
 * interval suppressed*, not averaged. So a fifteen-minute wait is legitimate in a run that says
 * so — `awtIsValid === false`, or a saturation verdict other than `stable` — and is a
 * starvation defect in a run that publishes a mean anyway. That is the failure the whole
 * project is written against: the statistics improve as the bug gets worse.
 */
export function checkStarvation(context: PropertyContext): Violation[] {
  const { building, result, bounds } = context;
  const violations: Violation[] = [];
  const flagged = !result.summary.awtIsValid || result.summary.saturation.verdict !== 'stable';
  if (flagged) return violations;

  const permitted = permittedGroupsByFloor(building);
  const callCarriesCredential = context.case.callType === 'mobile-credential';

  for (const leg of result.record.passengers) {
    const waitS = (leg.boardedAt ?? result.record.endedAt) - leg.arrivedAt;
    if (waitS <= bounds.starvationBoundS) continue;
    if (
      !isServable(
        building,
        permitted,
        callCarriesCredential,
        leg.originFloorId,
        leg.destinationFloorId,
        leg.credentialGroup,
      )
    ) {
      continue;
    }
    violations.push({
      property: 'starvation',
      message: `leg "${leg.passengerId}" (${leg.originFloorId} to ${leg.destinationFloorId}) waited ${waitS.toFixed(1)} s, past the ${String(bounds.starvationBoundS)} s bound, in a run reporting saturation verdict "${result.summary.saturation.verdict}" with a valid AWT`,
      subject: leg.passengerId,
    });
    if (violations.length >= 5) break; // a starved landing produces hundreds; five locate it
  }
  return violations;
}

/* -------------------------------------------------------------------------- *
 * All six
 * -------------------------------------------------------------------------- */

/** Every property, in the order `docs/07-handoff.md` § 7 lists them. */
export const PROPERTY_CHECKS: readonly ((context: PropertyContext) => Violation[])[] = Object.freeze([
  checkConservation,
  checkDestination,
  checkCapacity,
  checkMonotonicTime,
  checkTermination,
  checkStarvation,
]);

/** Run all six. Returns every violation found, never short-circuiting on the first. */
export function checkAll(context: PropertyContext): Violation[] {
  return PROPERTY_CHECKS.flatMap((check) => check(context));
}
