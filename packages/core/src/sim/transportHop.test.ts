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
/**
 * The same run on `vertical-city` **with only its ground-lobby escalator** — the building exactly
 * as it shipped between `d7e8571` and the sky-lobby escalators. It is here for one reason: it is
 * the only configuration in `data/` that still produces a **closing** hop, and a code path with no
 * live case anywhere is this repository's signature defect.
 */
let beforeSkyLobbies: SimulationResult;

beforeAll(async () => {
  config = await load();
  const building = config.buildingsById.get('vertical-city');
  const dispatcherProfile = config.dispatcherProfilesById.get('collective');
  if (building === undefined || dispatcherProfile === undefined) throw new Error('missing fixture');
  const common = {
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: 20260726,
    onTimeout: 'report' as const,
  };
  result = runSimulation({ ...common, building });
  beforeSkyLobbies = runSimulation({
    ...common,
    building: {
      ...building,
      transportModes: building.transportModes.filter((mode) => mode.id === 'lobby-escalator'),
    },
  });
}, 240_000);

const legsOf = (of: SimulationResult, journeyId: string): PassengerRecord[] =>
  of.record.passengers
    .filter((record) => record.journeyId === journeyId)
    .sort((a, b) => a.legIndex - b.legIndex);

/** Trace records whose hop sits at `position`, in trace order. */
function withHopAt(
  position: 'opening' | 'middle' | 'closing',
  of: SimulationResult = result,
): readonly GeneratedPassenger[] {
  return of.trace.passengers.filter((record) => {
    const hops = record.transportHops ?? [];
    if (hops.length !== 1) return false;
    const [hop] = hops;
    if (hop === undefined) return false;
    if (position === 'opening') return hop.beforeLegIndex === 0;
    if (position === 'closing') return hop.beforeLegIndex === record.legs.length;
    return hop.beforeLegIndex > 0 && hop.beforeLegIndex < record.legs.length;
  });
}

describe('two of the three hop positions occur on shipped data, and the third is kept live', () => {
  /**
   * **The closing hop lost its only shipped case when the sky lobbies got escalators**, and this
   * is where that is said rather than discovered.
   *
   * A journey out of zone 4 used to end on the ground escalator — `40 → 27` (zone-4 local),
   * `27 → 2` (shuttle upper deck), `2 → G` (escalator) — which is a **closing** hop. Sky lobby A's
   * escalator gives the same journey a route of the same length that crosses one floor pair
   * earlier: `40 → 27`, `27 ⇢ 26` (escalator), `26 → G` (shuttle lower deck). Same two legs, same
   * one hop, **middle** instead of closing. 20 journeys at this seed changed that way, and no
   * shipped journey ends on a hop any more, because floors `2`, `27`, `52` and `77` carry no
   * population and are not entrances — so no journey can *finish* on the far side of an escalator.
   *
   * That is the shape this repository has shipped eleven times: a behaviour whose cause was fixed
   * and which then goes untested from `data/` with nothing saying so. It is asserted at zero here,
   * and exercised **live** in the suite below against `vertical-city` with only its ground-lobby
   * escalator — the building exactly as it shipped between `d7e8571` and this change, and the
   * configuration every `vertical-city` figure published in that window was measured under.
   */
  it('opening and middle occur; closing does not, and both facts are asserted', () => {
    expect(withHopAt('opening').length).toBeGreaterThan(0);
    expect(withHopAt('middle').length).toBeGreaterThan(0);
    expect(withHopAt('closing').length).toBe(0);
  });

  it('every hop is a declared escalator of this building at its declared cost', () => {
    const declared = new Map(
      (config.buildingsById.get('vertical-city')?.transportModes ?? []).map((mode) => [
        mode.id,
        mode,
      ]),
    );
    const used = new Set<string>();
    for (const record of result.trace.passengers) {
      for (const hop of record.transportHops ?? []) {
        const mode = declared.get(hop.modeId);
        expect(mode, `hop on undeclared mode "${hop.modeId}"`).toBeDefined();
        expect(hop.traversalTimeS).toBeCloseTo(TRAVERSAL_S, 9);
        expect(new Set([hop.originFloorId, hop.destinationFloorId])).toEqual(
          new Set(mode?.connects ?? []),
        );
        used.add(hop.modeId);
      }
    }
    // The two the traffic can reach, and only those — `traffic/transportRoute.test.ts` carries
    // the per-mode census and the reason the other two carry nobody.
    expect([...used].sort()).toEqual(['lobby-escalator', 'sky-lobby-a-escalator']);
  });
});

describe('an opening hop delays the wait without shortening the journey', () => {
  it('leg 0 starts waiting 21.2 s after the batch, and the journey started at the batch', () => {
    let checked = 0;
    for (const record of withHopAt('opening').slice(0, 40)) {
      const legs = legsOf(result, record.journeyId);
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
      const legs = legsOf(result, record.journeyId);
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
  /**
   * Run against `beforeSkyLobbies`, not against the shipped configuration — see the note on that
   * binding. The arm is one field's difference from what `data/` ships, and it is the exact
   * configuration this building had when the closing-hop path was written and measured.
   */
  it('the last leg carries the seconds, and the journey record includes them', () => {
    const journeys = new Map(
      buildJourneys(beforeSkyLobbies.record.passengers).map((journey) => [
        journey.journeyId,
        journey,
      ]),
    );
    let checked = 0;
    for (const record of withHopAt('closing', beforeSkyLobbies).slice(0, 40)) {
      const legs = legsOf(beforeSkyLobbies, record.journeyId);
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

  it('no leg of any journey is a lobby-pair hop, at any of the four two-level lobbies', () => {
    const declared = (config.buildingsById.get('vertical-city')?.transportModes ?? []).map(
      (mode) => new Set(mode.connects),
    );
    // Non-vacuous: there are four pairs to violate, not one.
    expect(declared).toHaveLength(4);
    for (const record of result.record.passengers) {
      for (const pair of declared) {
        expect(
          pair.has(record.originFloorId) && pair.has(record.destinationFloorId),
          `${record.originFloorId} -> ${record.destinationFloorId} was charged to the lifts`,
        ).toBe(false);
      }
    }
  });

  /**
   * The control the closing-hop suite needs to mean anything: the arm it runs against really does
   * produce closing hops, and the shipped configuration really does not. Without this, both halves
   * of that claim could be true because `withHopAt` had stopped matching anything.
   */
  it('the ground-escalator-only arm is the one that still ends journeys on a hop', () => {
    expect(withHopAt('closing', beforeSkyLobbies).length).toBeGreaterThan(0);
    expect(withHopAt('closing', result).length).toBe(0);
    // Same journeys either way — this is a decomposition difference, not a demand difference.
    expect(result.trace.passengers.length).toBe(beforeSkyLobbies.trace.passengers.length);
  });
});
