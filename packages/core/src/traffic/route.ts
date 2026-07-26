/**
 * Floor-level route planning: which elevator legs a journey needs.
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

/**
 * The fabric a route is planned over: banks as edges, transfer floors as the only places a
 * journey may change one.
 */
export interface RouteTopology {
  readonly banks: readonly RouteBank[];
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

/** Breadth-first search results from one origin: how each reachable floor was arrived at. */
interface ReachabilityFromOrigin {
  /** Floor id to the floor the passenger boarded at to reach it. */
  readonly cameFrom: ReadonlyMap<string, string>;
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
   * The floors a journey visits, in order: `[origin, ...transfer floors, destination]`.
   *
   * Returns `undefined` when no chain of banks connects the two. Fewest legs wins; among
   * equal-length routes the winner is the one breadth-first search reaches first scanning
   * banks in declared order and each bank's `servesFloors` in declared order, which makes
   * the choice a stable property of the config rather than of iteration order.
   */
  route(originFloorId: string, destinationFloorId: string): readonly string[] | undefined {
    if (originFloorId === destinationFloorId) return [originFloorId];
    const { cameFrom } = this.#reachability(originFloorId);
    if (!cameFrom.has(destinationFloorId)) return undefined;

    const reversed: string[] = [destinationFloorId];
    let at = destinationFloorId;
    while (at !== originFloorId) {
      const previous = cameFrom.get(at);
      if (previous === undefined) return undefined;
      reversed.push(previous);
      at = previous;
    }
    return reversed.reverse();
  }

  /** Number of elevator legs between two floors, or `undefined` when unreachable. */
  legCount(originFloorId: string, destinationFloorId: string): number | undefined {
    const route = this.route(originFloorId, destinationFloorId);
    return route === undefined ? undefined : route.length - 1;
  }

  /** {@link route}, but throws with an actionable message instead of returning `undefined`. */
  requireRoute(
    originFloorId: string,
    destinationFloorId: string,
    maxLegs: number,
  ): readonly string[] {
    const route = this.route(originFloorId, destinationFloorId);
    if (route === undefined) {
      throw new TrafficError(
        `No chain of banks connects floor "${originFloorId}" to floor "${destinationFloorId}". Either a bank must serve both, or an intermediate floor served by both must be flagged isTransferFloor.`,
      );
    }
    const legs = route.length - 1;
    if (legs > maxLegs) {
      throw new TrafficError(
        `Routing "${originFloorId}" to "${destinationFloorId}" needs ${legs} elevator legs (${route.join(' -> ')}), above the limit of ${maxLegs}. That is a building layout problem, not a long trip.`,
      );
    }
    return route;
  }

  #reachability(originFloorId: string): ReachabilityFromOrigin {
    const cached = this.#cache.get(originFloorId);
    if (cached !== undefined) return cached;

    const cameFrom = new Map<string, string>();
    const seen = new Set<string>([originFloorId]);
    // Only the origin (where the passenger already stands) and declared transfer floors are
    // boardable. Anywhere else, a leg ending there ends the journey.
    let frontier: string[] = [originFloorId];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const at of frontier) {
        for (const bank of this.#topology.banks) {
          if (!bank.servesFloors.has(at)) continue;
          for (const destination of legDestinations(bank, at)) {
            if (seen.has(destination)) continue;
            seen.add(destination);
            cameFrom.set(destination, at);
            if (this.#topology.transferFloors.has(destination)) next.push(destination);
          }
        }
      }
      frontier = next;
    }

    const result: ReachabilityFromOrigin = { cameFrom };
    this.#cache.set(originFloorId, result);
    return result;
  }
}
