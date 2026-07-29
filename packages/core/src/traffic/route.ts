/**
 * Floor-level route planning: which elevator legs a journey needs, and which hops it makes on
 * something that is not an elevator.
 *
 * A journey is one leg per bank it rides. In a single-bank building every journey is one
 * leg and this module is a formality. In a sky-lobby tower it is not: `data/buildings/README.md`
 * defines a transfer floor as one where "a passenger alighting here is re-injected as a new
 * arrival on the next leg while keeping its original journey identity, so time-to-destination
 * spans both trips". A resident of Mixed-Use High-Rise floor 45 heading to office floor 20
 * rides three: `45 → 31` on the residential local, `31 → G` on the shuttle, `G → 20` on the
 * office local.
 *
 * ## What this is, and what it deliberately is not
 *
 * It is **graph reachability over service zoning**, exactly the model
 * `config/buildingConnectivity.test.ts` holds the shipped building data to: banks are edges,
 * a journey may change banks only on a floor flagged `isTransferFloor`, and a double-deck
 * bank's decks travel together so a leg boarded on a lower-deck floor alights on a
 * lower-deck floor.
 *
 * It is **not** dispatch. Nothing here picks a car, or even a bank — only the sequence of
 * floors at which the passenger changes elevators. Which bank and which car serve a leg are
 * decisions for the group controller, made against live state that does not exist yet when
 * the trace is generated. Recording a bank here would freeze a dispatch decision into the
 * passenger trace and quietly remove it from the thing being measured.
 *
 * Access zoning is not consulted either: it constrains *who* may travel, not *whether the
 * shafts connect*. The generator applies it separately when assigning credentials.
 *
 * ## Banks are no longer the only edge
 *
 * A {@link ResolvedBuilding.transportModes} entry — an escalator, a stair — is an edge of this
 * same graph, joining its two floors in both directions at a declared, deterministic cost. Before
 * it existed, a two-level lobby's ground hop had nowhere to go but a lift, and `vertical-city`
 * charged **110 of 593 journeys** an entire extra elevator leg the real building never pays
 * (`DECISIONS.md` § D147 § 6). A building declaring no transport mode has an empty edge set and
 * routes exactly as it always did, which `traffic/transportIdentity.test.ts` holds to a
 * bit-identical run.
 *
 * **Transport edges are expanded before bank edges**, and that is the whole of the preference
 * rule. Breadth-first search minimizes segments, so where a floor is reachable in the same number
 * of segments by both an escalator and a lift, expanding the escalator first is what makes the
 * passenger take it. The rule is deliberately not a cost comparison: a 21 s escalator can be
 * slower than a 6 s lift hop and the passenger still takes it, because the designer put it there
 * and because the point of the fix is to stop the *lifts* being charged, not to minimize the
 * passenger's clock. Among transport edges, and among banks, declared order breaks the tie — so
 * the route is a stable property of the config rather than of iteration order.
 *
 * **What that rule costs, measured rather than assumed.** When a building declares an escalator at
 * *every* level of a stack — `vertical-city` has one at each of its four two-level lobbies — some
 * journeys have two routes of equal length, and expansion order silently picks one. `40 → G` there
 * is two lift legs and one hop either way: it used to be shuttle-then-escalator (a **closing** hop
 * at the ground lobby) and is now escalator-then-shuttle (a **middle** hop at sky lobby A), because
 * floor 26 enters the frontier ahead of floor 2. Twenty journeys at the pinned seed moved that way
 * and saved nothing, and the shipped demand stopped producing a closing hop at all — which took the
 * only live case away from a `sim/` code path. Preferring the transport edge is still right; the
 * point is that it decides *ties* as well as *wins*, and a tie it decides can retire a behaviour.
 * `sim/transportHop.test.ts` holds that path live against the configuration that still reaches it.
 */

import type { ResolvedBuilding } from '../config/types.js';

import { TrafficError } from './types.js';

interface RouteBank {
  readonly id: string;
  readonly servesFloors: ReadonlySet<string>;
  /** Declared order preserved, so expansion order — and therefore ties — are deterministic. */
  readonly servesFloorsOrdered: readonly string[];
  readonly pairs: readonly (readonly [string, string])[];
}

/** A non-elevator edge: two floors, one traversal time, traversable either way. */
interface RouteTransport {
  readonly id: string;
  readonly connects: readonly [string, string];
  readonly traversalTimeS: number;
}

/**
 * The fabric a route is planned over: banks and transport modes as edges, transfer floors as
 * the only places a journey may change one.
 */
export interface RouteTopology {
  readonly banks: readonly RouteBank[];
  /** Declared order preserved, for the same reason `servesFloorsOrdered` is. */
  readonly transports: readonly RouteTransport[];
  readonly transferFloors: ReadonlySet<string>;
}

/** Build the routing view of a resolved building. Cheap; do it once per trace. */
export function routeTopologyOf(building: ResolvedBuilding): RouteTopology {
  return {
    banks: building.banks.map((bank) => ({
      id: bank.id,
      servesFloors: new Set(bank.servesFloors),
      servesFloorsOrdered: bank.servesFloors,
      pairs: bank.servesFloorPairs ?? [],
    })),
    // `?? []` rather than a required read: `ResolvedBuilding.transportModes` is required, but
    // this module is also handed hand-built topologies by tests and by the fuzz generator.
    transports: (building.transportModes ?? []).map((mode) => ({
      id: mode.id,
      connects: mode.connects,
      traversalTimeS: mode.traversalTimeS,
    })),
    transferFloors: new Set(building.transferFloors.map((floor) => floor.id)),
  };
}

/**
 * Where one leg on `bank`, boarded at `from`, can put a passenger down.
 *
 * For a single-deck bank that is every floor it serves. For a double-deck bank the decks are
 * bolted together: a passenger who boards the lower deck of the pair `["G", "2"]` alights on
 * a lower-deck floor — `26`, never `27`. A floor outside every declared pair is served by the
 * car as a whole, so either deck will do.
 */
export function legDestinations(bank: RouteBank, from: string): readonly string[] {
  if (bank.pairs.length === 0) return bank.servesFloorsOrdered;

  const lower = bank.pairs.some((pair) => pair[0] === from);
  const upper = bank.pairs.some((pair) => pair[1] === from);
  if (!lower && !upper) return bank.servesFloorsOrdered;

  const paired = new Set(bank.pairs.flatMap((pair) => [pair[0], pair[1]]));
  const reachable: string[] = bank.servesFloorsOrdered.filter((floor) => !paired.has(floor));
  for (const pair of bank.pairs) {
    if (lower) reachable.push(pair[0]);
    if (upper) reachable.push(pair[1]);
  }
  return reachable;
}

/** The far end of `transport` from `at`, or `undefined` when it does not touch `at`. */
function transportFrom(transport: RouteTransport, at: string): string | undefined {
  const [a, b] = transport.connects;
  if (a === at) return b;
  if (b === at) return a;
  return undefined;
}

/** One hop of a planned journey: a lift ride, or a ride on something that is not a lift. */
export type RouteSegment =
  | {
      readonly kind: 'elevator';
      readonly fromFloorId: string;
      readonly toFloorId: string;
    }
  | {
      readonly kind: 'transport';
      readonly fromFloorId: string;
      readonly toFloorId: string;
      /** `TransportModeConfig.id` of the edge ridden. */
      readonly modeId: string;
      /** Landing-to-landing seconds, from the declaration. */
      readonly traversalTimeS: number;
    };

/**
 * A planned journey: the floors it visits and how it gets between each pair.
 *
 * `floors.length - 1 === segments.length` always, and
 * `elevatorLegCount + transportHopCount === segments.length`.
 */
export interface RoutePlan {
  /** `[origin, ...intermediate floors, destination]`. */
  readonly floors: readonly string[];
  readonly segments: readonly RouteSegment[];
  /** Segments that are lift rides. **This** is what `maxLegs` bounds. */
  readonly elevatorLegCount: number;
  readonly transportHopCount: number;
}

/** Breadth-first search results from one origin: how each reachable floor was arrived at. */
interface ReachabilityFromOrigin {
  /** Floor id to the floor the passenger boarded at, and the edge that carried them. */
  readonly cameFrom: ReadonlyMap<string, Arrival>;
}

interface Arrival {
  readonly from: string;
  /** The transport edge ridden, or `undefined` when the hop was a lift leg. */
  readonly transport: RouteTransport | undefined;
}

/**
 * Plans routes over one building, caching a breadth-first search per origin floor.
 *
 * One search answers every destination from that origin, and a trace asks about the same
 * handful of origins thousands of times, so the cache turns route planning from a visible
 * cost into a negligible one.
 */
export class RoutePlanner {
  readonly #topology: RouteTopology;
  readonly #cache = new Map<string, ReachabilityFromOrigin>();

  constructor(topology: RouteTopology) {
    this.#topology = topology;
  }

  static forBuilding(building: ResolvedBuilding): RoutePlanner {
    return new RoutePlanner(routeTopologyOf(building));
  }

  /**
   * The full plan for a journey, or `undefined` when no chain of edges connects the two.
   *
   * Fewest segments wins; among equal-length routes the winner is the one breadth-first search
   * reaches first, scanning transport edges before banks, each in declared order, and each bank's
   * `servesFloors` in declared order — which makes the choice a stable property of the config
   * rather than of iteration order.
   */
  plan(originFloorId: string, destinationFloorId: string): RoutePlan | undefined {
    if (originFloorId === destinationFloorId) {
      return { floors: [originFloorId], segments: [], elevatorLegCount: 0, transportHopCount: 0 };
    }
    const { cameFrom } = this.#reachability(originFloorId);
    if (!cameFrom.has(destinationFloorId)) return undefined;

    const reversedFloors: string[] = [destinationFloorId];
    const reversedSegments: RouteSegment[] = [];
    let at = destinationFloorId;
    while (at !== originFloorId) {
      const arrival = cameFrom.get(at);
      /* c8 ignore next -- every entry chains back to the origin; a hole would be a BFS bug. */
      if (arrival === undefined) return undefined;
      reversedSegments.push(
        arrival.transport === undefined
          ? { kind: 'elevator', fromFloorId: arrival.from, toFloorId: at }
          : {
              kind: 'transport',
              fromFloorId: arrival.from,
              toFloorId: at,
              modeId: arrival.transport.id,
              traversalTimeS: arrival.transport.traversalTimeS,
            },
      );
      reversedFloors.push(arrival.from);
      at = arrival.from;
    }
    const segments = reversedSegments.reverse();
    let elevatorLegCount = 0;
    for (const segment of segments) if (segment.kind === 'elevator') elevatorLegCount += 1;
    return {
      floors: reversedFloors.reverse(),
      segments,
      elevatorLegCount,
      transportHopCount: segments.length - elevatorLegCount,
    };
  }

  /**
   * The floors a journey visits, in order: `[origin, ...transfer floors, destination]`.
   *
   * Returns `undefined` when no chain of edges connects the two. Note that consecutive floors
   * here are **not** necessarily joined by a lift: use {@link plan} when the difference matters.
   */
  route(originFloorId: string, destinationFloorId: string): readonly string[] | undefined {
    return this.plan(originFloorId, destinationFloorId)?.floors;
  }

  /**
   * Number of **elevator** legs between two floors, or `undefined` when unreachable.
   *
   * A transport hop is not a leg. Before transport modes existed this was `floors.length - 1`,
   * and on every building that declares none it still is.
   */
  legCount(originFloorId: string, destinationFloorId: string): number | undefined {
    return this.plan(originFloorId, destinationFloorId)?.elevatorLegCount;
  }

  /** {@link plan}, but throws with an actionable message instead of returning `undefined`. */
  requirePlan(
    originFloorId: string,
    destinationFloorId: string,
    maxLegs: number,
  ): RoutePlan {
    const plan = this.plan(originFloorId, destinationFloorId);
    if (plan === undefined) {
      throw new TrafficError(
        `No chain of banks connects floor "${originFloorId}" to floor "${destinationFloorId}". Either a bank must serve both, or an intermediate floor served by both must be flagged isTransferFloor.`,
      );
    }
    if (plan.elevatorLegCount > maxLegs) {
      throw new TrafficError(
        `Routing "${originFloorId}" to "${destinationFloorId}" needs ${plan.elevatorLegCount} elevator legs (${plan.floors.join(' -> ')}), above the limit of ${maxLegs}. That is a building layout problem, not a long trip.`,
      );
    }
    return plan;
  }

  /** {@link requirePlan}, floors only. Kept because the message is the valuable part. */
  requireRoute(
    originFloorId: string,
    destinationFloorId: string,
    maxLegs: number,
  ): readonly string[] {
    return this.requirePlan(originFloorId, destinationFloorId, maxLegs).floors;
  }

  #reachability(originFloorId: string): ReachabilityFromOrigin {
    const cached = this.#cache.get(originFloorId);
    if (cached !== undefined) return cached;

    const cameFrom = new Map<string, Arrival>();
    const seen = new Set<string>([originFloorId]);
    // Only the origin (where the passenger already stands) and declared transfer floors are
    // boardable. Anywhere else, a leg ending there ends the journey.
    let frontier: string[] = [originFloorId];
    while (frontier.length > 0) {
      const next: string[] = [];
      const reach = (destination: string, from: string, transport: RouteTransport | undefined): void => {
        if (seen.has(destination)) return;
        seen.add(destination);
        cameFrom.set(destination, { from, transport });
        if (this.#topology.transferFloors.has(destination)) next.push(destination);
      };
      for (const at of frontier) {
        // Transport edges first — see this module's header for why that *is* the preference rule.
        for (const transport of this.#topology.transports) {
          const destination = transportFrom(transport, at);
          if (destination !== undefined) reach(destination, at, transport);
        }
        for (const bank of this.#topology.banks) {
          if (!bank.servesFloors.has(at)) continue;
          for (const destination of legDestinations(bank, at)) reach(destination, at, undefined);
        }
      }
      frontier = next;
    }

    const result: ReachabilityFromOrigin = { cameFrom };
    this.#cache.set(originFloorId, result);
    return result;
  }
}
