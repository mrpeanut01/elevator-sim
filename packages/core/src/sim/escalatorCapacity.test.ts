/**
 * An escalator's carrying capacity, proved rather than asserted — `DECISIONS.md` § D1632.
 *
 * Five claims, each of which a plausible-looking implementation could fail while every statistic
 * still looked reasonable:
 *
 * 1. **Absent means the model before the field existed**, on the legs and on the whole result.
 * 2. **The closed form.** The queue's server is deterministic, so what it must do is arithmetic:
 *    offered more than it can carry, it boards one rider per headway without a gap and the queue
 *    grows at `arrival rate − capacity`; offered less, it passes everybody and nobody waits long.
 *    This is the escalator's oracle in the sense `analytical/validation.test.ts` is the lifts'.
 * 3. **Move the control and require the run to change, compared on the legs.** A capacity that
 *    binds moves when riders reach the far landing and therefore what the lifts do; a capacity far
 *    above demand moves nothing.
 * 4. **Conservation.** Everybody who joined a queue left it or is named.
 * 5. **The limits are what the docstrings say they are** — two independent directions, no
 *    diversion to a lift that serves both landings.
 *
 * ## The building
 *
 * Built for the purpose and small, so the suite needs no timeout annotation. A street level `S`
 * joined to the lobby `G` by an escalator and by nothing else; a low bank `G`–`5`; a high bank
 * `6`–`9`; and a second escalator `5 ↔ 6` that is the only way between the banks. So a journey
 * `S → 3` **opens** on an escalator, `3 → S` **closes** on one, and `S → 8` has one in the
 * **middle** as well — the three positions `sim/transportHop.test.ts` names, each a different
 * code path, all three live here.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { parseBuilding, resolveBuilding } from '../config/parse.js';
import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { buildJourneys, summarizeRun } from '../metrics/summarize.js';
import { parseRunRecord } from '../metrics/serialization.js';
import type { TransportQueueRecord } from '../metrics/transportQueue.js';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationResult } from './types.js';

const SEED = 20_261_111;
const STREET_TRAVERSAL_S = 21.2;
const LINK_TRAVERSAL_S = 15;

interface Capacities {
  /** `street` escalator, `S ↔ G`, persons per hour. Absent declares none. */
  readonly street?: number;
  /** `link` escalator, `5 ↔ 6`. */
  readonly link?: number;
}

function authored(capacities: Capacities, withLinkLift = false): Record<string, unknown> {
  const upper = [2, 3, 4, 5, 6, 7, 8, 9];
  return {
    id: 'escalator-fixture',
    name: 'Escalator fixture',
    type: 'office',
    trafficProfile: 'office-standard',
    floors: [
      { id: 'S', index: 0, heightM: 0, population: 0, isEntrance: true },
      { id: 'G', index: 1, heightM: 4.5, population: 0, isTransferFloor: true },
      ...upper.map((floor) => ({
        id: String(floor),
        index: floor,
        heightM: 4.5 + (floor - 1) * 3.6,
        population: 100,
        ...(floor === 5 || floor === 6 ? { isTransferFloor: true } : {}),
      })),
    ],
    totalPopulation: 800,
    banks: [
      {
        id: 'low',
        servesFloors: ['G', '2', '3', '4', '5'],
        cars: ['A', 'B', 'C', 'D'].map((id) => ({
          id,
          spec: 'geared-traction',
          ratedSpeedMps: 2.5,
          ratedLoadLb: 3500,
          doorType: 'centerOpening',
        })),
      },
      {
        id: 'high',
        servesFloors: ['6', '7', '8', '9'],
        cars: ['E', 'F'].map((id) => ({
          id,
          spec: 'geared-traction',
          ratedSpeedMps: 2.5,
          ratedLoadLb: 3500,
          doorType: 'centerOpening',
        })),
      },
      // A lift that serves both landings of `link` and nothing else: the alternative a real crowd
      // would spill onto, present only where a test asks whether this model's crowd does.
      ...(withLinkLift
        ? [
            {
              id: 'express',
              servesFloors: ['5', '6'],
              cars: [{ id: 'X', spec: 'geared-traction', ratedSpeedMps: 2.5, ratedLoadLb: 3500, doorType: 'centerOpening' }],
            },
          ]
        : []),
    ],
    transportModes: [
      {
        id: 'street',
        connects: ['S', 'G'],
        traversalTimeS: STREET_TRAVERSAL_S,
        ...(capacities.street === undefined ? {} : { capacityPersonsPerHour: capacities.street }),
      },
      {
        id: 'link',
        connects: ['5', '6'],
        traversalTimeS: LINK_TRAVERSAL_S,
        ...(capacities.link === undefined ? {} : { capacityPersonsPerHour: capacities.link }),
      },
    ],
    accessZones: [],
  };
}

let config: LoadedConfig;

function building(capacities: Capacities, withLinkLift = false): ResolvedBuilding {
  return resolveBuilding(parseBuilding(authored(capacities, withLinkLift)), config.elevatorSpecs);
}

interface Demand {
  readonly ratePct: number;
  readonly incoming: number;
  readonly outgoing: number;
  readonly interfloor: number;
}

/** Everybody walks in off the street: one direction of one escalator, loaded steadily. */
const INBOUND: Demand = { ratePct: 6, incoming: 1, outgoing: 0, interfloor: 0 };
/** A mixed day, so opening, middle and closing hops all occur and both directions are used. */
const MIXED: Demand = { ratePct: 6, incoming: 0.4, outgoing: 0.4, interfloor: 0.2 };

function run(
  of: ResolvedBuilding,
  demand: Demand,
  durationS = 1200,
  drainGraceS?: number,
): SimulationResult {
  const dispatcherProfile = config.dispatcherProfilesById.get('collective');
  if (dispatcherProfile === undefined) throw new Error('fixtures');
  return runSimulation({
    building: of,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    demand: {
      arrivalRatePctPop5min: demand.ratePct,
      directionalSplit: {
        incoming: demand.incoming,
        outgoing: demand.outgoing,
        interfloor: demand.interfloor,
      },
    },
    durationS,
    ...(drainGraceS === undefined ? {} : { drainGraceS }),
    reportWindow: 'full-run',
    onTimeout: 'report',
  });
}

/** Every leg, with every instant — the thing a control either moves or does not. */
const legsOf = (result: SimulationResult): string => JSON.stringify(result.record.passengers);

function queueOf(result: SimulationResult, modeId: string, direction: 'up' | 'down'): TransportQueueRecord {
  const queue = (result.record.transportQueues ?? []).find(
    (entry) => entry.modeId === modeId && entry.direction === direction,
  );
  if (queue === undefined) throw new Error(`no ${modeId}/${direction} queue in the record`);
  return queue;
}

function statsOf(result: SimulationResult, modeId: string, direction: 'up' | 'down') {
  const stats = (result.summary.transportQueues ?? []).find(
    (entry) => entry.modeId === modeId && entry.direction === direction,
  );
  if (stats === undefined) throw new Error(`no ${modeId}/${direction} queue in the summary`);
  return stats;
}

beforeAll(async () => {
  config = await load();
});

describe('absent means the model before the field existed', () => {
  it('a building declaring no capacity writes no queue table, no audit row and no new key on any leg', () => {
    const result = run(building({}), MIXED);
    expect(result.record.transportQueues).toBeUndefined();
    expect(result.summary.transportQueues).toBeUndefined();
    expect(result.conservation.transportQueue).toBeUndefined();
    expect(result.conservation.transportHops).toBeGreaterThan(0);
    for (const leg of result.record.passengers) {
      expect(leg).not.toHaveProperty('egressQueueSeconds');
      expect(leg).not.toHaveProperty('egressCut');
    }
    // All three positions really occur, so the three branches left alone were all exercised.
    const hops = result.trace.passengers.flatMap((record) =>
      (record.transportHops ?? []).map((hop) =>
        hop.beforeLegIndex === 0 ? 'opening' : hop.beforeLegIndex === record.legs.length ? 'closing' : 'middle',
      ),
    );
    expect(new Set(hops)).toEqual(new Set(['opening', 'middle', 'closing']));
  });

  it('a capacity far above demand moves no leg, no journey and no lift statistic', () => {
    const without = run(building({}), MIXED);
    const ample = run(building({ street: 3_600_000, link: 3_600_000 }), MIXED);
    // A headway of a millisecond: nobody is ever ahead of anybody by enough to be seen... except
    // inside one batch, where riders arrive at the same instant. So the comparison is on the
    // legs to the millisecond, and exact wherever no batch shared an escalator.
    const a = without.record.passengers;
    const b = ample.record.passengers;
    expect(b).toHaveLength(a.length);
    for (const [index, leg] of a.entries()) {
      const other = b[index];
      expect(other?.passengerId).toBe(leg.passengerId);
      expect(other?.carId).toBe(leg.carId);
      expect(other?.arrivedAt ?? Number.NaN).toBeCloseTo(leg.arrivedAt, 1);
      expect(other?.boardedAt ?? -1).toBeCloseTo(leg.boardedAt ?? -1, 1);
      expect(other?.alightedAt ?? -1).toBeCloseTo(leg.alightedAt ?? -1, 1);
    }
    expect(ample.summary.awtIsValid).toBe(without.summary.awtIsValid);
    expect(ample.summary.waiting.meanS).toBeCloseTo(without.summary.waiting.meanS, 1);
    for (const queue of ample.summary.transportQueues ?? []) expect(queue.saturated).toBe(false);
  });

  it('the trace is the same trace whatever the capacity: the control is the run’s, not the crowd’s', () => {
    const without = run(building({}), MIXED);
    const tight = run(building({ street: 300 }), MIXED);
    expect(JSON.stringify(tight.trace.passengers)).toBe(JSON.stringify(without.trace.passengers));
  });
});

describe('the closed form: a deterministic server does arithmetic', () => {
  /** 800 people at 6 % per five minutes, all inbound: 576 an hour onto `street/up`. */
  const OFFERED_PER_HOUR = 800 * 0.06 * 12;

  it('above capacity it boards one rider per headway without a gap, and the queue grows at arrival − capacity', () => {
    const capacity = 240;
    const headwayS = 3600 / capacity;
    const durationS = 1200;
    const result = run(building({ street: capacity }), INBOUND, durationS);
    const queue = queueOf(result, 'street', 'up');
    const boardings = queue.boardings;
    expect(boardings.length).toBeGreaterThan(100);

    // The offered rate really is above capacity, as measured on this trace and not as assumed.
    const measuredPerHour = (boardings.length * 3600) / durationS;
    expect(measuredPerHour).toBeGreaterThan(capacity * 1.5);
    expect(measuredPerHour).toBeGreaterThan(OFFERED_PER_HOUR * 0.6);

    // Once the queue forms it never empties: every later turn is exactly one headway after the
    // one before. Find where it forms, then require the gap to be the headway to the end.
    const firstWaiter = boardings.findIndex((entry) => entry.boardedAt > entry.enteredAt);
    expect(firstWaiter).toBeGreaterThan(-1);
    let lastIdle = 0;
    for (const [index, entry] of boardings.entries()) {
      if (entry.boardedAt === entry.enteredAt) lastIdle = index;
    }
    // It is busy for almost the whole run: the last rider to walk straight on is an early one.
    expect(lastIdle).toBeLessThan(boardings.length * 0.1);
    for (let index = lastIdle + 1; index < boardings.length; index += 1) {
      const gap = (boardings[index]?.boardedAt ?? 0) - (boardings[index - 1]?.boardedAt ?? 0);
      expect(gap).toBeCloseTo(headwayS, 6);
    }

    // The closed form itself. From the instant the belt goes busy at `t0`, boarded(t) is
    // `floor((t − t0) / headway) + 1`, so the number still standing at the end of demand is
    // whoever entered minus that — and that is `(arrival rate − capacity) × time`.
    const busyFrom = boardings[lastIdle];
    if (busyFrom === undefined) throw new Error('unreachable');
    const enteredSince = boardings.length - lastIdle;
    const boardedSince = Math.floor((durationS - busyFrom.boardedAt) / headwayS) + 1;
    const standingAtEnd = boardings.filter((entry) => entry.boardedAt > durationS).length;
    expect(standingAtEnd).toBe(enteredSince - boardedSince);
    const busyS = durationS - busyFrom.boardedAt;
    const arrivalPerS = enteredSince / busyS;
    const predicted = (arrivalPerS - capacity / 3600) * busyS;
    expect(standingAtEnd).toBeGreaterThan(30);
    expect(Math.abs(standingAtEnd - predicted)).toBeLessThanOrEqual(1);

    // And the run says so, in every place it reports.
    // Over the stretch demand ran, the count test is exact: more arrived than could board.
    const demandWindow = { id: 'demand', startS: 0, endS: durationS };
    const overDemand = summarizeRun(result.record, { window: demandWindow });
    const stats = (overDemand.transportQueues ?? []).find((entry) => entry.modeId === 'street' && entry.direction === 'up');
    expect(stats?.saturated).toBe(true);
    expect(stats?.saturationGround).toBe('over-capacity');
    expect(stats?.meanWaitS).toBeUndefined();
    expect(stats?.enteredCount ?? 0).toBeGreaterThan(stats?.maxBoardableCount ?? Number.POSITIVE_INFINITY);
    expect(stats?.utilisation ?? 0).toBeGreaterThan(1.5);
    expect(overDemand.awtInvalidGround).toBe('transport-saturated');
    // Over the full run the window includes the drain tail, which is long enough to board
    // everybody — so the count test goes quiet, and the wait horizon is what still refuses.
    const full = statsOf(result, 'street', 'up');
    expect(full.enteredCount).toBeLessThanOrEqual(full.maxBoardableCount);
    expect(full.saturated).toBe(true);
    expect(full.saturationGround).toBe('starved');
    expect(full.maxWaitS).toBeGreaterThan(900);
    expect(full.meanWaitS).toBeUndefined();
    expect(result.summary.awtIsValid).toBe(false);
    expect(result.summary.awtInvalidGround).toBe('transport-saturated');
    expect(result.warnings.some((warning) => warning.startsWith('Escalator "street" (up, boarding at S)'))).toBe(true);
  });

  it('below capacity throughput equals arrivals and nobody waits longer than their own batch', () => {
    const capacity = 6000;
    const headwayS = 3600 / capacity;
    const result = run(building({ street: capacity }), INBOUND);
    const queue = queueOf(result, 'street', 'up');
    const stats = statsOf(result, 'street', 'up');
    expect(queue.boardings.length).toBeGreaterThan(100);
    // Everybody who arrived got through.
    expect(stats.clearedCount).toBe(stats.enteredCount);
    expect(stats.enteredCount).toBe(queue.boardings.length);
    expect(stats.notClearedCount).toBe(0);
    expect(stats.saturated).toBe(false);
    expect(stats.utilisation).toBeLessThan(0.2);
    // A wait here can only come from arriving in the same batch as somebody: at most one headway
    // per companion, and batches are a handful of people.
    expect(stats.meanWaitS ?? Number.NaN).toBeLessThan(2 * headwayS);
    expect(stats.maxWaitS).toBeLessThan(12 * headwayS);
    expect(result.summary.awtInvalidGround).not.toBe('transport-saturated');
  });

  it('riders who arrive together board in trace order, one headway apart', () => {
    const capacity = 600;
    const headwayS = 3600 / capacity;
    const result = run(building({ street: capacity }), INBOUND, 600);
    const queue = queueOf(result, 'street', 'up');
    const order = new Map(result.trace.passengers.map((record, index) => [record.journeyId, index]));
    let together = 0;
    for (let index = 1; index < queue.boardings.length; index += 1) {
      const previous = queue.boardings[index - 1];
      const current = queue.boardings[index];
      if (previous === undefined || current === undefined) continue;
      // First come, first served, always.
      expect(current.enteredAt).toBeGreaterThanOrEqual(previous.enteredAt);
      expect(current.boardedAt - previous.boardedAt).toBeGreaterThanOrEqual(headwayS - 1e-9);
      if (current.enteredAt !== previous.enteredAt) continue;
      together += 1;
      expect(order.get(current.journeyId) ?? -1).toBeGreaterThan(order.get(previous.journeyId) ?? -1);
    }
    expect(together).toBeGreaterThan(0);
  });
});

describe('move the control and the run changes, compared on the legs', () => {
  it('a capacity that binds moves when riders reach the lift landing and what the lifts then do', () => {
    const without = run(building({}), INBOUND);
    const tight = run(building({ street: 240 }), INBOUND);
    expect(legsOf(tight)).not.toBe(legsOf(without));

    // Where it moved, and in which direction: the first lift leg starts waiting later by exactly
    // the time spent at the foot of the escalator, and the journey still started when it started.
    const waits = new Map(
      queueOf(tight, 'street', 'up').boardings.map((entry) => [entry.journeyId, entry.boardedAt - entry.enteredAt]),
    );
    const before = new Map(without.record.passengers.filter((leg) => leg.legIndex === 0).map((leg) => [leg.journeyId, leg]));
    let delayed = 0;
    for (const leg of tight.record.passengers) {
      if (leg.legIndex !== 0) continue;
      const base = before.get(leg.journeyId);
      const waitS = waits.get(leg.journeyId);
      if (base === undefined || waitS === undefined) continue;
      expect(leg.journeyStartedAt).toBe(base.journeyStartedAt);
      expect(leg.arrivedAt).toBeCloseTo(base.arrivedAt + waitS, 9);
      expect(leg.arrivedAt - leg.journeyStartedAt).toBeCloseTo(waitS + STREET_TRAVERSAL_S, 9);
      if (waitS > 0) delayed += 1;
    }
    expect(delayed).toBeGreaterThan(50);

    // Downstream: the lifts are boarded at different instants, by fewer people in the window.
    const boardings = (result: SimulationResult): string =>
      JSON.stringify(result.record.passengers.map((leg) => [leg.passengerId, leg.carId, leg.boardedAt]));
    expect(boardings(tight)).not.toBe(boardings(without));
    // Same people, and nobody lost: the control moved instants, not the population.
    expect(tight.record.passengers.length).toBe(without.record.passengers.length);
  });

  it('the queue wait is on time-to-destination and is not lift waiting time', () => {
    const tight = run(building({ street: 240 }), INBOUND);
    const waits = new Map(
      queueOf(tight, 'street', 'up').boardings.map((entry) => [entry.journeyId, entry.boardedAt - entry.enteredAt]),
    );
    // Journeys whose only hop is the street escalator: one to floor 6 or above also rides `link`.
    const streetOnly = new Set(
      tight.trace.passengers
        .filter((record) => (record.transportHops ?? []).length === 1)
        .map((record) => record.journeyId),
    );
    let checked = 0;
    for (const journey of buildJourneys(tight.record.passengers)) {
      const waitS = waits.get(journey.journeyId);
      if (waitS === undefined || waitS < 60 || !journey.isComplete) continue;
      if (!streetOnly.has(journey.journeyId)) continue;
      checked += 1;
      const lift = journey.totalWaitSeconds + journey.totalRideSeconds;
      // The whole journey is the escalator queue, the escalator, and the lift — nothing else.
      expect(journey.timeToDestinationSeconds ?? Number.NaN).toBeCloseTo(waitS + STREET_TRAVERSAL_S + lift, 6);
      // And the minute at the escalator is not inside the lift wait.
      expect(journey.transferSeconds ?? Number.NaN).toBeCloseTo(waitS + STREET_TRAVERSAL_S, 6);
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('a closing hop carries its queue wait on the leg, and the journey ends when the rider steps off', () => {
    const outbound: Demand = { ratePct: 6, incoming: 0, outgoing: 1, interfloor: 0 };
    const tight = run(building({ street: 240 }), outbound);
    const queue = queueOf(tight, 'street', 'down');
    expect(queue.boardingFloorId).toBe('G');
    const turns = new Map(queue.boardings.map((entry) => [entry.journeyId, entry]));
    const journeys = new Map(buildJourneys(tight.record.passengers).map((journey) => [journey.journeyId, journey]));
    let waited = 0;
    for (const leg of tight.record.passengers) {
      if (!leg.isFinalLeg || leg.alightedAt === undefined) continue;
      const turn = turns.get(leg.journeyId);
      if (turn === undefined) continue;
      // They joined the queue the instant they stepped off the lift.
      expect(turn.enteredAt).toBe(leg.alightedAt);
      const waitS = turn.boardedAt - turn.enteredAt;
      expect(leg.egressQueueSeconds ?? 0).toBeCloseTo(waitS, 9);
      expect(leg.egressTransitSeconds).toBeCloseTo(STREET_TRAVERSAL_S, 9);
      const journey = journeys.get(leg.journeyId);
      if (leg.egressCut === true) {
        expect(journey?.isComplete).toBe(false);
        expect(journey?.timeToDestinationSeconds).toBeUndefined();
        continue;
      }
      expect(journey?.completedAt ?? Number.NaN).toBeCloseTo(leg.alightedAt + waitS + STREET_TRAVERSAL_S, 9);
      if (waitS > 0) waited += 1;
    }
    expect(waited).toBeGreaterThan(10);
    // The run lasted at least as long as the last rider it calls delivered took to step off.
    const lastOff = Math.max(
      ...queue.boardings.filter((entry) => entry.cut !== true).map((entry) => entry.boardedAt + STREET_TRAVERSAL_S),
    );
    expect(tight.endedAt).toBeGreaterThanOrEqual(lastOff - 1e-9);
  });

  it('a middle hop queues too, and the next lift leg begins when the rider reaches the far landing', () => {
    const tight = run(building({ link: 120 }), MIXED);
    const up = queueOf(tight, 'link', 'up');
    const down = queueOf(tight, 'link', 'down');
    expect(up.boardings.length + down.boardings.length).toBeGreaterThan(20);
    const turns = new Map([...up.boardings, ...down.boardings].map((entry) => [entry.journeyId, entry]));
    let checked = 0;
    for (const leg of tight.record.passengers) {
      if (leg.legIndex === 0) continue;
      const turn = turns.get(leg.journeyId);
      if (turn === undefined || turn.cut === true) continue;
      if (leg.originFloorId !== '5' && leg.originFloorId !== '6') continue;
      checked += 1;
      expect(leg.arrivedAt).toBeCloseTo(turn.boardedAt + LINK_TRAVERSAL_S, 9);
    }
    expect(checked).toBeGreaterThan(10);
    expect(legsOf(tight)).not.toBe(legsOf(run(building({}), MIXED)));
  });
});

describe('conservation: everybody who joined a queue left it, or is named', () => {
  it('a queue that clears balances with nobody cut', () => {
    const result = run(building({ street: 6000, link: 6000 }), MIXED);
    const audit = result.conservation.transportQueue;
    expect(audit).toBeDefined();
    expect(audit?.entered).toBeGreaterThan(100);
    expect(audit?.cleared).toBe(audit?.entered);
    expect(audit?.cut).toBe(0);
    expect(result.conservation.balanced).toBe(true);
    const recorded = (result.record.transportQueues ?? []).reduce((total, queue) => total + queue.boardings.length, 0);
    expect(recorded).toBe(audit?.entered);
    // Four rows — two escalators, two directions — in declared order, up first.
    expect((result.record.transportQueues ?? []).map((queue) => `${queue.modeId}/${queue.direction}@${queue.boardingFloorId}`)).toEqual([
      'street/up@S',
      'street/down@G',
      'link/up@5',
      'link/down@6',
    ]);
  });

  it('a queue the deadline cuts names every rider it held, at all three positions', () => {
    // Capacities low enough that the drain tail cannot clear them, on a mixed day.
    const result = run(building({ street: 60, link: 30 }), MIXED, 1200, 300);
    const audit = result.conservation.transportQueue;
    expect(audit?.cut).toBeGreaterThan(20);
    expect(audit?.entered).toBe((audit?.cleared ?? 0) + (audit?.cut ?? 0));
    expect(result.conservation.balanced).toBe(true);
    expect(result.status).toBe('timed-out');

    const held = result.undelivered.filter((journey) => journey.reason === 'on-transport');
    expect(held).toHaveLength(audit?.cut ?? -1);
    const cutInRecord = (result.record.transportQueues ?? []).flatMap((queue) =>
      queue.boardings.filter((entry) => entry.cut === true).map((entry) => entry.journeyId),
    );
    expect(new Set(cutInRecord)).toEqual(new Set(held.map((journey) => journey.journeyId)));

    // Opening: no leg was ever created. Closing: the lift leg finished and the journey did not.
    const legsByJourney = new Map<string, number>();
    for (const leg of result.record.passengers) legsByJourney.set(leg.journeyId, (legsByJourney.get(leg.journeyId) ?? 0) + 1);
    const opening = held.filter((journey) => !legsByJourney.has(journey.journeyId));
    const closing = result.record.passengers.filter((leg) => leg.egressCut === true);
    expect(opening.length).toBeGreaterThan(0);
    expect(closing.length).toBeGreaterThan(0);
    for (const leg of closing) {
      expect(held.some((journey) => journey.journeyId === leg.journeyId)).toBe(true);
    }
    // Delivered journeys and complete journeys are the same journeys.
    const complete = buildJourneys(result.record.passengers).filter((journey) => journey.isComplete).length;
    expect(complete).toBe(result.conservation.delivered);

    const street = statsOf(result, 'street', 'up');
    expect(street.saturated).toBe(true);
    expect(street.notClearedCount).toBeGreaterThan(0);
  });

  it('a record with queues in it survives being stored and read back, and summarizes the same', () => {
    const result = run(building({ street: 240 }), MIXED);
    const reread = parseRunRecord(JSON.stringify(result.record));
    expect(reread.transportQueues).toEqual(result.record.transportQueues);
    const again = summarizeRun(reread, { window: result.summary.window });
    expect(again.transportQueues).toEqual(result.summary.transportQueues);
    expect(again.awtInvalidGround).toBe(result.summary.awtInvalidGround);
  });
});

describe('the modelling limits are the ones stated', () => {
  it('the two directions are independent queues: a full up belt delays nobody going down', () => {
    const outboundToo: Demand = { ratePct: 6, incoming: 0.5, outgoing: 0.5, interfloor: 0 };
    const result = run(building({ street: 100 }), outboundToo);
    const up = statsOf(result, 'street', 'up');
    const down = statsOf(result, 'street', 'down');
    expect(up.saturated).toBe(true);
    expect(down.enteredCount).toBeGreaterThan(20);
    // Down riders arrive metered by the lifts and never in numbers the belt cannot take.
    const downTurns = queueOf(result, 'street', 'down').boardings;
    const upTurns = queueOf(result, 'street', 'up').boardings;
    // No down rider's turn was pushed back by an up rider: each waits only on the down riders
    // ahead, so replaying the down column alone reproduces every turn exactly.
    let nextFreeAt = 0;
    for (const entry of downTurns) {
      const expected = Math.max(entry.enteredAt, nextFreeAt);
      expect(entry.boardedAt).toBe(expected);
      nextFreeAt = expected + 3600 / 100;
    }
    expect(upTurns.some((entry) => entry.boardedAt - entry.enteredAt > 120)).toBe(true);
  });

  it('a saturated escalator diverts nobody to a lift that serves both landings', () => {
    // An express car now runs between `5` and `6` and nowhere else — the lift a real crowd would
    // spill onto. The route is planned before the run, over the escalator because it is the
    // first edge found among routes of equal length, and it is not a cost comparison.
    const result = run(building({ link: 12 }, true), MIXED);
    const up = statsOf(result, 'link', 'up');
    const down = statsOf(result, 'link', 'down');
    expect(up.saturated || down.saturated).toBe(true);
    expect(Math.max(up.maxWaitS, down.maxWaitS)).toBeGreaterThan(900);
    // Everybody who crossed between the banks is still planned over the escalator…
    const crossing = result.trace.passengers.filter((record) =>
      (record.transportHops ?? []).some((hop) => hop.modeId === 'link'),
    );
    expect(crossing.length).toBeGreaterThan(20);
    expect(up.enteredCount + down.enteredCount).toBeGreaterThan(20);
    // …and the express car carried nobody at all, however long the queue beside it got.
    expect(result.record.passengers.filter((leg) => leg.bankId === 'express')).toHaveLength(0);
    expect(
      result.record.passengers.filter(
        (leg) => new Set([leg.originFloorId, leg.destinationFloorId]).size === 2 &&
          ['5', '6'].includes(leg.originFloorId) && ['5', '6'].includes(leg.destinationFloorId),
      ),
    ).toHaveLength(0);
  });
});
