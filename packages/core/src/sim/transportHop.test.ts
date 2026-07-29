/**
 * What a transport hop costs, at the three places one can sit in a journey.
 *
 * The digest guard in `traffic/transportIdentity.test.ts` proves the run did not change where it
 * must not; this proves it changed *correctly* where it must. The three positions are genuinely
 * different code paths — an opening hop needs its own kernel event, a middle hop replaces the
 * sky-lobby walk and moves the boarding floor, and a closing hop is a constant added to the
 * completion instant — and all three occur on `vertical-city` under its shipped demand.
 *
 * **The seconds are charged, not forgiven.** That is the assertion that matters: removing a
 * spurious lift leg is only honest if the escalator ride it replaces still lands on
 * time-to-destination. A version of this change that dropped the hop's seconds would look like a
 * large improvement and would be a measurement error.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '../config/types.js';
import { buildJourneys } from '../metrics/summarize.js';
import type { PassengerRecord } from '../metrics/types.js';
import type { GeneratedPassenger } from '../traffic/types.js';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationResult } from './types.js';

/** The declared landing-to-landing time of `vertical-city`'s lobby escalator. */
const TRAVERSAL_S = 21.2;

let config: LoadedConfig;
let result: SimulationResult;

beforeAll(async () => {
  config = await load();
  const building = config.buildingsById.get('vertical-city');
  const dispatcherProfile = config.dispatcherProfilesById.get('collective');
  if (building === undefined || dispatcherProfile === undefined) throw new Error('missing fixture');
  result = runSimulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: 20260726,
    onTimeout: 'report',
  });
}, 120_000);

const legsOf = (journeyId: string): PassengerRecord[] =>
  result.record.passengers
    .filter((record) => record.journeyId === journeyId)
    .sort((a, b) => a.legIndex - b.legIndex);

/** Trace records whose hop sits at `position`, in trace order. */
function withHopAt(position: 'opening' | 'middle' | 'closing'): readonly GeneratedPassenger[] {
  return result.trace.passengers.filter((record) => {
    const hops = record.transportHops ?? [];
    if (hops.length !== 1) return false;
    const [hop] = hops;
    if (hop === undefined) return false;
    if (position === 'opening') return hop.beforeLegIndex === 0;
    if (position === 'closing') return hop.beforeLegIndex === record.legs.length;
    return hop.beforeLegIndex > 0 && hop.beforeLegIndex < record.legs.length;
  });
}

describe('all three hop positions occur, so all three paths are exercised', () => {
  it('the shipped demand produces every one of them', () => {
    expect(withHopAt('opening').length).toBeGreaterThan(0);
    expect(withHopAt('middle').length).toBeGreaterThan(0);
    expect(withHopAt('closing').length).toBeGreaterThan(0);
  });

  it('every hop is the declared escalator at its declared cost', () => {
    for (const record of result.trace.passengers) {
      for (const hop of record.transportHops ?? []) {
        expect(hop.modeId).toBe('lobby-escalator');
        expect(hop.traversalTimeS).toBeCloseTo(TRAVERSAL_S, 9);
        expect(new Set([hop.originFloorId, hop.destinationFloorId])).toEqual(new Set(['G', '2']));
      }
    }
  });
});

describe('an opening hop delays the wait without shortening the journey', () => {
  it('leg 0 starts waiting 21.2 s after the batch, and the journey started at the batch', () => {
    let checked = 0;
    for (const record of withHopAt('opening').slice(0, 40)) {
      const legs = legsOf(record.journeyId);
      const first = legs[0];
      if (first === undefined) continue;
      checked += 1;
      expect(first.originFloorId).toBe('2');
      expect(first.arrivedAt).toBeCloseTo(record.arrivalTimeS + TRAVERSAL_S, 9);
      expect(first.journeyStartedAt).toBeCloseTo(record.arrivalTimeS, 9);
      // The escalator is not a wait: the leg's waiting time starts at the top of it.
      expect(first.arrivedAt - first.journeyStartedAt).toBeCloseTo(TRAVERSAL_S, 9);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('a middle hop replaces the sky-lobby walk and moves the boarding floor', () => {
  it('costs 21.2 s rather than the 10 s transferWalkS, and boards at the far end', () => {
    let checked = 0;
    for (const record of withHopAt('middle').slice(0, 40)) {
      const hop = (record.transportHops ?? [])[0];
      if (hop === undefined) continue;
      const legs = legsOf(record.journeyId);
      const before = legs[hop.beforeLegIndex - 1];
      const after = legs[hop.beforeLegIndex];
      if (before?.alightedAt === undefined || after === undefined) continue;
      checked += 1;
      expect(before.destinationFloorId).toBe(hop.originFloorId);
      expect(after.originFloorId).toBe(hop.destinationFloorId);
      expect(after.arrivedAt - before.alightedAt).toBeCloseTo(TRAVERSAL_S, 9);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('a closing hop is charged to time-to-destination and to nothing else', () => {
  it('the last leg carries the seconds, and the journey record includes them', () => {
    const journeys = new Map(
      buildJourneys(result.record.passengers).map((journey) => [journey.journeyId, journey]),
    );
    let checked = 0;
    for (const record of withHopAt('closing').slice(0, 40)) {
      const legs = legsOf(record.journeyId);
      const last = legs[legs.length - 1];
      const journey = journeys.get(record.journeyId);
      if (last?.alightedAt === undefined || journey === undefined || !journey.isComplete) continue;
      checked += 1;
      // The lifts' job ended at floor 2; the passenger was going to G.
      expect(last.destinationFloorId).toBe('2');
      expect(record.finalDestinationFloorId).toBe('G');
      expect(last.egressTransitSeconds).toBeCloseTo(TRAVERSAL_S, 9);
      expect(journey.completedAt).toBeCloseTo(last.alightedAt + TRAVERSAL_S, 9);
      expect(journey.timeToDestinationSeconds).toBeCloseTo(
        last.alightedAt + TRAVERSAL_S - journey.startedAt,
        9,
      );
      // And it is not a wait and not a ride — `transferSeconds` is the residual that holds it.
      expect(journey.transferSeconds ?? 0).toBeGreaterThanOrEqual(TRAVERSAL_S);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('the run accounts for every hop it took', () => {
  it('counts them, delivers everybody it can, and stays balanced', () => {
    expect(result.conservation.transportHops).toBeGreaterThan(0);
    expect(result.conservation.legsCreated).toBe(result.conservation.legsRecorded);
    expect(result.conservation.balanced).toBe(true);
  });

  it('the count matches the hops the trace planned for journeys that finished them', () => {
    // Every leg of every journey ran, so every planned hop was taken. Compared against the trace
    // rather than against another counter in the same object — a counter checked against itself
    // is the "value with two readers" shape.
    const planned = result.trace.passengers.reduce(
      (total, record) => total + (record.transportHops ?? []).length,
      0,
    );
    expect(result.conservation.transportHops).toBe(planned);
  });

  it('no leg of any journey is the G <-> 2 lobby hop', () => {
    for (const record of result.record.passengers) {
      const pair = new Set([record.originFloorId, record.destinationFloorId]);
      expect(pair.has('G') && pair.has('2')).toBe(false);
    }
  });
});
