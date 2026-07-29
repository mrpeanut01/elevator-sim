/**
 * The transport-mode edge, at the layer that decides whether a journey is charged a lift leg.
 *
 * `route.test.ts` covers routing over banks; this covers the edge that is not a bank, and the
 * one measurement the whole change exists to move: how many `G → 2` hops `vertical-city` charges
 * to its lifts.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config/loader.js';
import { parseBuilding, resolveBuilding } from '../config/parse.js';
import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { StreamSet } from '../random/index.js';
import { DATA_DIR } from '../sim/fixtures.test-helper.js';

import { generateTrace } from './generator.js';
import { RoutePlanner } from './route.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

const building = (id: string): ResolvedBuilding => {
  const found = config.buildingsById.get(id);
  if (found === undefined) throw new Error(`no building "${id}"`);
  return found;
};

/**
 * A four-floor tower whose two lobby levels are joined by both a lift and an escalator, so the
 * preference rule has something to prefer. Hand-built rather than reusing a shipped building:
 * `vertical-city` answers the question about *this* building's escalator, and this answers the
 * question about the rule.
 */
function twoLevelLobby(options: { readonly escalator: boolean }): ResolvedBuilding {
  return resolveBuilding(
    parseBuilding(
      {
        id: 'two-level-lobby',
        name: 'Two-level lobby',
        type: 'office',
        trafficProfile: 'office-standard',
        floors: [
          { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true, isTransferFloor: true },
          { id: 'M', index: 1, heightM: 4.5, population: 0, isTransferFloor: true },
          { id: '3', index: 3, heightM: 12, population: 50 },
          { id: '4', index: 4, heightM: 16, population: 50 },
        ],
        banks: [
          {
            id: 'lobby-lift',
            servesFloors: ['G', 'M'],
            cars: [{ id: 'L1', spec: 'gearless-traction', passengerTransferS: 1.2 }],
          },
          {
            id: 'upper',
            servesFloors: ['M', '3', '4'],
            cars: [{ id: 'U1', spec: 'gearless-traction', passengerTransferS: 1.2 }],
          },
        ],
        ...(options.escalator
          ? {
              transportModes: [
                { id: 'esc', connects: ['G', 'M'] as [string, string], traversalTimeS: 21.2 },
              ],
            }
          : {}),
      },
      'two-level-lobby.test.json',
    ),
    config.elevatorSpecs,
  );
}

describe('a transport edge is preferred over a lift between the same two floors', () => {
  it('routes G -> 3 on two lifts when there is no escalator', () => {
    const planner = RoutePlanner.forBuilding(twoLevelLobby({ escalator: false }));
    const plan = planner.plan('G', '3');
    expect(plan?.floors).toEqual(['G', 'M', '3']);
    expect(plan?.elevatorLegCount).toBe(2);
    expect(plan?.transportHopCount).toBe(0);
  });

  it('routes G -> 3 on the escalator and one lift when there is one', () => {
    const planner = RoutePlanner.forBuilding(twoLevelLobby({ escalator: true }));
    const plan = planner.plan('G', '3');
    expect(plan?.floors).toEqual(['G', 'M', '3']);
    expect(plan?.elevatorLegCount).toBe(1);
    expect(plan?.transportHopCount).toBe(1);
    expect(plan?.segments[0]).toEqual({
      kind: 'transport',
      fromFloorId: 'G',
      toFloorId: 'M',
      modeId: 'esc',
      traversalTimeS: 21.2,
    });
  });

  it('prefers it in the other direction too — the edge is not one-way', () => {
    const planner = RoutePlanner.forBuilding(twoLevelLobby({ escalator: true }));
    const plan = planner.plan('3', 'G');
    expect(plan?.segments.map((segment) => segment.kind)).toEqual(['elevator', 'transport']);
  });

  it('legCount counts lift legs and not hops', () => {
    expect(RoutePlanner.forBuilding(twoLevelLobby({ escalator: false })).legCount('G', '4')).toBe(2);
    expect(RoutePlanner.forBuilding(twoLevelLobby({ escalator: true })).legCount('G', '4')).toBe(1);
  });
});

describe('vertical-city no longer charges its lobby hop to the lifts', () => {
  it('the escalator is declared, and it is the G <-> 2 pair', () => {
    const modes = building('vertical-city').transportModes;
    expect(modes).toHaveLength(1);
    expect(modes[0]?.id).toBe('lobby-escalator');
    expect(modes[0]?.connects).toEqual(['G', '2']);
    expect(modes[0]?.traversalTimeS).toBeCloseTo(21.2, 9);
  });

  it('G -> 40 crosses the lobby on the escalator, not on a low-zone local', () => {
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    const plan = planner.plan('G', '40');
    expect(plan?.floors).toEqual(['G', '2', '27', '40']);
    expect(plan?.segments[0]).toMatchObject({ kind: 'transport', modeId: 'lobby-escalator' });
    expect(plan?.elevatorLegCount).toBe(2);
  });

  it('40 -> G ends on the escalator, so the hop is charged at both ends of the day', () => {
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    const plan = planner.plan('40', 'G');
    expect(plan?.floors).toEqual(['40', '27', '2', 'G']);
    expect(plan?.segments[2]).toMatchObject({ kind: 'transport', modeId: 'lobby-escalator' });
    expect(plan?.elevatorLegCount).toBe(2);
  });

  it('a cross-lobby interfloor trip takes the escalator in the middle', () => {
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    const plan = planner.plan('30', '45');
    expect(plan?.elevatorLegCount).toBe(4);
    expect(plan?.transportHopCount).toBe(1);
    const hop = plan?.segments.findIndex((segment) => segment.kind === 'transport');
    expect(hop).toBe(2);
  });

  /**
   * The headline. `292` and `3549` were measured on baseline `d7e8571`; the trace is a pure
   * function of `(seed, config)`, so both sides of this are reproducible rather than remembered.
   */
  it('the trace charges 292 fewer lift legs, and 292 hops instead — 0 of them a G <-> 2 leg', () => {
    const trace = generateTrace({
      building: building('vertical-city'),
      profiles: config.trafficProfiles,
      streams: new StreamSet(20260726n),
    });

    let legs = 0;
    let hops = 0;
    let lobbyLegs = 0;
    for (const passenger of trace.passengers) {
      legs += passenger.legs.length;
      hops += (passenger.transportHops ?? []).length;
      for (const leg of passenger.legs) {
        const pair = new Set([leg.originFloorId, leg.destinationFloorId]);
        if (pair.has('G') && pair.has('2')) lobbyLegs += 1;
      }
    }

    // The population is untouched: the same journeys, decomposed differently.
    expect(trace.passengerCount).toBe(1956);
    expect(legs).toBe(3549 - 292);
    expect(hops).toBe(292);
    expect(lobbyLegs).toBe(0);
  });
});

describe('a route with no lift leg at all is refused rather than generated', () => {
  /**
   * Two floors joined only by an escalator, with population on both. A journey between them is a
   * real journey the building really serves, and it is not lift demand: it would enter no queue,
   * board no car and produce no observation. `planDemand` drops the pair; the trace still
   * generates, because every other pair is fine.
   */
  it('drops the pair and still produces a trace', () => {
    const resolved = resolveBuilding(
      parseBuilding(
        {
          id: 'escalator-only-pair',
          name: 'Escalator-only pair',
          type: 'office',
          trafficProfile: 'office-standard',
          floors: [
            {
              id: 'G',
              index: 0,
              heightM: 0,
              population: 0,
              isEntrance: true,
              isTransferFloor: true,
            },
            { id: 'M', index: 1, heightM: 4.5, population: 40, isTransferFloor: true },
            { id: '3', index: 3, heightM: 12, population: 60 },
          ],
          banks: [
            {
              id: 'upper',
              servesFloors: ['G', '3'],
              cars: [{ id: 'U1', spec: 'gearless-traction', passengerTransferS: 1.2 }],
            },
          ],
          transportModes: [
            { id: 'esc', connects: ['G', 'M'] as [string, string], traversalTimeS: 21.2 },
          ],
        },
        'escalator-only-pair.test.json',
      ),
      config.elevatorSpecs,
    );

    const planner = RoutePlanner.forBuilding(resolved);
    expect(planner.plan('G', 'M')?.elevatorLegCount).toBe(0);

    const trace = generateTrace({
      building: resolved,
      profiles: config.trafficProfiles,
      streams: new StreamSet(20260726n),
    });
    for (const passenger of trace.passengers) {
      expect(passenger.legs.length).toBeGreaterThan(0);
      const pair = new Set([passenger.originFloorId, passenger.finalDestinationFloorId]);
      expect(pair.has('G') && pair.has('M')).toBe(false);
    }
    expect(trace.warnings.some((warning) => warning.includes('not lift demand'))).toBe(true);
  });

  /**
   * `vertical-city` *has* such a pair — `G → 2` is the escalator and nothing else — and it is
   * never generated, because floor 2 carries no population and is not an entrance, so it is
   * neither an origin nor a destination of any demand source. Both halves are asserted: the pair
   * exists (so the refusal is not vacuous) and no shipped building's trace drops anything for it.
   */
  it('vertical-city has such a pair, and it is G -> 2', () => {
    const plan = RoutePlanner.forBuilding(building('vertical-city')).plan('G', '2');
    expect(plan?.elevatorLegCount).toBe(0);
    expect(plan?.transportHopCount).toBe(1);
  });

  it('no shipped building drops a generated pair for it', () => {
    for (const id of [
      'garden-apartments',
      'midtown-office',
      'mixed-use-high-rise',
      'secure-tower',
      'vertical-city',
    ]) {
      const trace = generateTrace({
        building: building(id),
        profiles: config.trafficProfiles,
        streams: new StreamSet(20260726n),
      });
      expect(
        trace.warnings.filter((warning) => warning.includes('not lift demand')),
        id,
      ).toEqual([]);
    }
  });
});
