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
import { RoutePlanner, routeTopologyOf, type RouteTopology } from './route.js';

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
 * `vertical-city` with only its ground-lobby escalator — the building exactly as it shipped
 * between `d7e8571` and the sky-lobby escalators, and therefore the configuration every
 * `vertical-city` figure published in that window was measured under.
 *
 * A real prior configuration rather than an invented fixture, for the reason
 * `config/doubleDeck.test.ts` gives about `#deckAllows`: a control arm that nothing ever shipped
 * proves only that the control arm is well formed.
 */
function groundEscalatorOnly(resolved: ResolvedBuilding): RouteTopology {
  return routeTopologyOf({
    ...resolved,
    transportModes: resolved.transportModes.filter((mode) => mode.id === 'lobby-escalator'),
  });
}

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

/**
 * The four escalators `vertical-city` declares, and the two of them that carry nobody.
 *
 * Every pair a double-deck shuttle serves is a two-level lobby, so all four have an escalator:
 * `G ↔ 2`, and the three sky lobbies `26 ↔ 27`, `51 ↔ 52`, `76 ↔ 77`. **Two of the three sky-lobby
 * edges are never on a shortest route and this test says so with a number**, because a declared
 * field that changes no decision is the shape `DECISIONS.md` § D112 found in
 * `data/dispatcher-profiles.json` and there is no reason `data/buildings/` should be exempt.
 *
 * The mechanism is the building's own zoning: `zone-5-local` serves **both** 51 and 52 and
 * `zone-6-local` serves **both** 76 and 77, so breadth-first search reaches both levels of those
 * two lobbies at the same depth from anywhere in the zone and from either shuttle deck. There is
 * never a segment to save. Sky lobby A is the exception and the reason the whole set is worth
 * declaring: `zone-3-local` is anchored to 26 and `zone-4-local` to 27, so its two levels are *not*
 * interchangeable and the escalator is the only short way across.
 */
const HOPS_BY_MODE: Readonly<Record<string, number>> = {
  'lobby-escalator': 266,
  'sky-lobby-a-escalator': 26,
  'sky-lobby-b-escalator': 0,
  'sky-lobby-c-escalator': 0,
};

describe('vertical-city no longer charges its lobby hop to the lifts', () => {
  it('declares one escalator per two-level lobby, all four at 21.2 s', () => {
    const modes = building('vertical-city').transportModes;
    expect(modes.map((mode) => mode.id)).toEqual(Object.keys(HOPS_BY_MODE));
    expect(modes.map((mode) => mode.connects)).toEqual([
      ['G', '2'],
      ['26', '27'],
      ['51', '52'],
      ['76', '77'],
    ]);
    for (const mode of modes) expect(mode.traversalTimeS).toBeCloseTo(21.2, 9);
  });

  /**
   * The traversal times are equal because the **rises** are, and the rises are not free: a
   * `servesFloorPairs` entry must sit exactly `deckSeparationM` apart or `resolveBuilding` refuses
   * the building. Every two-level lobby in this tower is therefore 4.5 m, and the EN 115-1
   * derivation in `docs/02-elevator-reference.md` lands on 21.2 s four times over. Asserted rather
   * than left as a coincidence in a `$comment`: if a floor height moves, one of these two
   * expectations fails and the other says why it should have.
   */
  it('every declared lobby pair rises exactly the deck separation, which is why the four times agree', () => {
    const resolved = building('vertical-city');
    const heightOf = (id: string): number => resolved.floorsById.get(id)?.heightM ?? Number.NaN;
    for (const mode of resolved.transportModes) {
      const [lower, upper] = mode.connects;
      expect(heightOf(upper) - heightOf(lower), `${mode.id} rise`).toBeCloseTo(4.5, 9);
    }
    const shuttle = resolved.banks.find((bank) => bank.id === 'shuttle');
    expect(shuttle?.servesFloorPairs).toEqual(
      resolved.transportModes.map((mode) => [...mode.connects]),
    );
  });

  it('G -> 40 crosses the ground lobby on the escalator, not on a low-zone local', () => {
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    const plan = planner.plan('G', '40');
    expect(plan?.floors).toEqual(['G', '2', '27', '40']);
    expect(plan?.segments[0]).toMatchObject({ kind: 'transport', modeId: 'lobby-escalator' });
    expect(plan?.elevatorLegCount).toBe(2);
  });

  /**
   * **A route that moved when sky lobby A gained its escalator, at no change in leg count.**
   *
   * `40 → G` used to run `40 → 27` (zone-4 local), `27 → 2` (shuttle *upper* deck), `2 → G`
   * (escalator) — two legs and a **closing** hop. It now runs `40 → 27`, `27 → 26` (escalator),
   * `26 → G` (shuttle *lower* deck) — two legs and a **middle** hop. Both are two legs and one
   * hop, so nothing was saved; the tie is broken by expansion order, and `route.ts`'s header says
   * transport edges expand first, which puts 26 into the frontier ahead of 2.
   *
   * It is asserted here because the consequence is not cosmetic: 20 journeys at the pinned seed
   * changed which deck they ride and which machine they cross on, and the shipped demand stopped
   * producing a **closing** hop at all — see `sim/transportHop.test.ts`, which asserts that zero
   * and keeps the closing path live against the configuration that still produces one.
   */
  it('40 -> G now crosses at sky lobby A, so the hop is in the middle rather than at the end', () => {
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    const plan = planner.plan('40', 'G');
    expect(plan?.floors).toEqual(['40', '27', '26', 'G']);
    expect(plan?.segments[1]).toMatchObject({
      kind: 'transport',
      modeId: 'sky-lobby-a-escalator',
    });
    expect(plan?.elevatorLegCount).toBe(2);
    expect(plan?.transportHopCount).toBe(1);
  });

  /**
   * **The point of declaring the sky-lobby escalators.** Zone 3 hangs off 26 and zone 4 off 27, so
   * before this a passenger crossing between them rode the shuttle 105 m down to the ground lobby,
   * crossed there, and rode 105 m back up: four lift legs. It is now two and a hop.
   */
  it('a zone-3 to zone-4 interfloor trip crosses at its own sky lobby, not at the ground one', () => {
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    const plan = planner.plan('30', '45');
    expect(plan?.floors).toEqual(['30', '26', '27', '45']);
    expect(plan?.elevatorLegCount).toBe(2);
    expect(plan?.transportHopCount).toBe(1);
    expect(plan?.segments[1]).toMatchObject({
      kind: 'transport',
      modeId: 'sky-lobby-a-escalator',
    });
    // The old route, still reachable on the configuration that had only the ground escalator —
    // so the improvement above is measured against a live arm rather than against a memory.
    const before = new RoutePlanner(groundEscalatorOnly(building('vertical-city')));
    const old = before.plan('30', '45');
    expect(old?.floors).toEqual(['30', '26', 'G', '2', '27', '45']);
    expect(old?.elevatorLegCount).toBe(4);
  });

  /**
   * The headline, re-measured. `292` and `3549` were measured on baseline `d7e8571`; `3257` is
   * that tree with the ground escalator declared. The trace is a pure function of `(seed, config)`,
   * so every figure here is reproducible rather than remembered.
   */
  it('the trace charges 304 fewer lift legs than the all-lift tree, and 292 hops instead', () => {
    const trace = generateTrace({
      building: building('vertical-city'),
      profiles: config.trafficProfiles,
      streams: new StreamSet(20260726n),
    });

    let legs = 0;
    let hops = 0;
    let lobbyLegs = 0;
    const byMode = new Map<string, number>(Object.keys(HOPS_BY_MODE).map((id) => [id, 0]));
    for (const passenger of trace.passengers) {
      legs += passenger.legs.length;
      for (const hop of passenger.transportHops ?? []) {
        hops += 1;
        byMode.set(hop.modeId, (byMode.get(hop.modeId) ?? 0) + 1);
      }
      for (const leg of passenger.legs) {
        const pair = new Set([leg.originFloorId, leg.destinationFloorId]);
        if (pair.has('G') && pair.has('2')) lobbyLegs += 1;
      }
    }

    // The population is untouched: the same journeys, decomposed differently.
    expect(trace.passengerCount).toBe(1956);
    expect(legs).toBe(3549 - 304);
    expect(hops).toBe(292);
    expect(lobbyLegs).toBe(0);

    /*
     * **Two of the four escalators carry nobody, and that is asserted rather than discovered.**
     * Pinned in both directions: a zero that becomes non-zero is a routing change worth knowing
     * about, and a non-zero that becomes zero is a machine that has stopped being used. Neither
     * may pass silently.
     */
    expect(Object.fromEntries(byMode)).toEqual(HOPS_BY_MODE);
  });

  /**
   * **Exactly *why* the two sky-lobby edges carry nobody, stated over the whole floor set rather
   * than over the one seed.**
   *
   * Removing them changes **58 of the building's 9 900 ordered floor pairs** — so they are not
   * inert in the graph — and **every one of those 58 starts at 51, 52, 76 or 77**. Those four
   * floors carry zero population and are not entrances, so no demand source and no destination can
   * ever be one: `planDemand` draws origins from populated floors and entrances only. The edges are
   * therefore live in the *planner* and unreachable from the *traffic*, which is a sharper and more
   * falsifiable claim than "they change no route".
   *
   * Eight of the 58 also save a **lift leg** — `51 → 52` becomes a hop where it was a zone-5 leg —
   * which is the strongest form of the point: these edges would be doing real work if any
   * passenger could ever stand on the floor they start from, and none can.
   */
  it('the two unused edges are reachable only from floors no journey can start or end on', () => {
    const resolved = building('vertical-city');
    const withoutInert = new RoutePlanner(
      routeTopologyOf({
        ...resolved,
        transportModes: resolved.transportModes.filter((mode) => (HOPS_BY_MODE[mode.id] ?? 0) > 0),
      }),
    );
    const full = RoutePlanner.forBuilding(resolved);
    const canCarryDemand = (floorId: string): boolean => {
      const floor = resolved.floorsById.get(floorId);
      return floor !== undefined && (floor.population > 0 || floor.isEntrance === true);
    };

    let compared = 0;
    let demandCapable = 0;
    let savesALeg = 0;
    const changed: string[] = [];
    for (const from of resolved.floors) {
      for (const to of resolved.floors) {
        if (from.id === to.id) continue;
        compared += 1;
        const a = full.plan(from.id, to.id);
        const b = withoutInert.plan(from.id, to.id);
        const reachable = canCarryDemand(from.id) && canCarryDemand(to.id);
        if (reachable) {
          demandCapable += 1;
          // The clause that carries the claim: on every pair traffic can produce, the two
          // configurations plan the same floors and the same lift bill.
          expect(b?.floors, `${from.id} -> ${to.id}`).toEqual(a?.floors);
          expect(b?.elevatorLegCount, `${from.id} -> ${to.id} legs`).toBe(a?.elevatorLegCount);
        }
        if ((a?.elevatorLegCount ?? 0) < (b?.elevatorLegCount ?? 0)) savesALeg += 1;
        if ((a?.floors ?? []).join('>') !== (b?.floors ?? []).join('>')) {
          changed.push(`${from.id} -> ${to.id}`);
        }
      }
    }

    // Non-vacuous in both directions: every ordered pair was compared, the demand-capable clause
    // above ran on most of them, and the set that moves is neither empty — the edges would then be
    // inert in the *graph*, a different and more suspicious claim — nor reachable by traffic.
    expect(compared).toBe(resolved.floors.length * (resolved.floors.length - 1));
    // 93 floors can carry demand (101 minus the eight lobby levels, plus G, which is an
    // entrance): 93 × 92 = 8 556 ordered pairs, which is where the clause above ran.
    expect(demandCapable).toBe(8556);
    expect(changed).toHaveLength(58);
    expect(savesALeg).toBe(8);
    expect(new Set(changed.map((pair) => pair.split(' -> ')[0]))).toEqual(
      new Set(['51', '52', '76', '77']),
    );
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
