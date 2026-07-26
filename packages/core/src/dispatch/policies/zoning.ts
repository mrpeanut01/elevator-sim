/**
 * Operational zoning — the third kind, and the only one that is a dispatcher strategy.
 *
 * docs/01-architecture.md § *Security zones are three different things* insists these stay
 * separate concepts, and this file is the one place the third lives:
 *
 * | Concept | Meaning | Lives on | Behaves as |
 * |---|---|---|---|
 * | **Service zoning** | which floors the shaft physically opens onto | `CarShaft` | hard feasibility filter |
 * | **Access zoning** | which floors a credential may reach | `ServedFloor.permittedCredentialGroups` | request validation |
 * | **Operational zoning** | dynamic floor partitioning among cars | **here** | tunable strategy |
 *
 * Collapsing them is the classic modeling mistake, and the shape of this file is what keeps them
 * apart: an operational zone is **computed per decision from the cars in service** and is never
 * stored on a car. A car that owned its zone could not be re-zoned by the group controller that
 * is supposed to own the decision, and a bank that lost a car to maintenance would leave a band
 * with nobody in it.
 *
 * ## What a zone is for
 *
 * Two consumers, both already declared and both previously inert for want of a partition:
 *
 * - **`RepositionContext.zoneFloorIds`**, so `parkingStrategy: zone-center` sends each car to the
 *   middle of *its own* band. Without a partition every car in the bank computes the same shaft
 *   median and the strategy parks the whole group on one floor, which is worse than not parking.
 *   That is not hypothetical: `Simulation.#park` supplies no partition today, and on
 *   `midtown-office` it moves all four cars to floor `10`. Which is why no shipped profile declares
 *   `zone-center` yet — see `prepositioning.ts` § *`Simulation.#park` still does not call this*.
 * - **the `zoneAffinity` cost term**, which prices a car's deviation from its band. That term
 *   lives in `terms/` and reads the zone from its context; this file is where the zone comes from.
 *
 * ## Why bands by car id, and not by proximity
 *
 * Assigning each car the band nearest its current position would cut the repositioning trip. It
 * would also make the partition a function of where the cars happen to be, so two cars passing
 * each other would swap zones, each would turn round, and `repositionThresholdS` would be
 * absorbing a thrash it was not designed for. A partition keyed on car id is **stable for the
 * whole run**, which is what "static zoning" means in the lift-engineering literature and the
 * behaviour `zoned-uppeak` is meant to measure. Dynamic re-zoning is a strategy of its own and
 * belongs in a profile, not in a tie-break.
 */

import type { CarSnapshot } from '../../model/car/types.js';

import type { OperationalZone, ZoneAssignment } from './types.js';

/* -------------------------------------------------------------------------- *
 * Partitioning
 * -------------------------------------------------------------------------- */

/**
 * Divide `total` positions into `parts` contiguous, near-equal bands.
 *
 * `[floor(k·total/parts), floor((k+1)·total/parts))` — the standard balanced split. Every position
 * lands in exactly one band, bands differ in size by at most one, and when `parts > total` the
 * surplus bands come back empty rather than overlapping. Empty is the honest answer: two cars
 * cannot each have half of one floor.
 */
export function bandRange(
  total: number,
  parts: number,
  index: number,
): { readonly from: number; readonly to: number } {
  if (parts <= 0 || total <= 0 || index < 0 || index >= parts) return { from: 0, to: 0 };
  const from = Math.floor((index * total) / parts);
  const to = Math.floor(((index + 1) * total) / parts);
  return { from, to };
}

/**
 * Partition each bank's served floors into one contiguous band per in-service car.
 *
 * Out-of-service cars are given an **empty** band rather than being skipped silently: a car in
 * fire recall or independent service is not covering a zone, and the floors it would have covered
 * belong to the cars that are still working. It appears in the map with no floors, so
 * `zone-center` reports `no-target` for it rather than inheriting the whole shaft — though in
 * practice stage 7 has already answered `busy` for a car that is not in service.
 *
 * Cars are banded in **car-id order within each bank**, lowest ids to the lowest floors. Banks are
 * partitioned independently, because a bank is the unit a group controller allocates over and two
 * banks serving overlapping floors are two separate allocation problems.
 *
 * Pure. Returns a frozen list, one entry per car supplied, in the order supplied.
 */
export function contiguousZones(cars: readonly CarSnapshot[]): readonly OperationalZone[] {
  /** Bank id to its in-service car ids, sorted. The banding order. */
  const activeByBank = new Map<string, string[]>();
  for (const car of cars) {
    if (car.mode !== 'in-service') continue;
    const bucket = activeByBank.get(car.bankId);
    if (bucket === undefined) activeByBank.set(car.bankId, [car.carId]);
    else bucket.push(car.carId);
  }
  for (const bucket of activeByBank.values()) bucket.sort();

  return Object.freeze(
    cars.map((car) => {
      const order = activeByBank.get(car.bankId) ?? [];
      const index = order.indexOf(car.carId);
      if (index < 0) return Object.freeze({ carId: car.carId, floorIds: Object.freeze([]) });

      // The car's own shaft, not the bank's first car's: two cars in one bank serve the same
      // floors today, and reading each car's own shaft means that stays an observation about the
      // config rather than an assumption baked in here.
      const floors = car.shaft.floors;
      const { from, to } = bandRange(floors.length, order.length, index);
      return Object.freeze({
        carId: car.carId,
        floorIds: Object.freeze(floors.slice(from, to).map((floor) => floor.id)),
      });
    }),
  );
}

/** {@link contiguousZones} as the map `RepositionContext.zoneFloorIds` is read from. */
export function zoneAssignment(cars: readonly CarSnapshot[]): ZoneAssignment {
  return new Map(contiguousZones(cars).map((zone) => [zone.carId, zone.floorIds]));
}

/**
 * The floors one car's band covers, or `undefined` when no partition names it.
 *
 * `undefined` rather than the whole shaft, deliberately: `parkingCandidates` already treats an
 * absent zone as "the strategy has no opinion, use the shaft", and returning the shaft here would
 * make an unzoned car indistinguishable from a car whose zone happens to be everything.
 */
export function zoneFloorIdsFor(
  zones: ZoneAssignment | undefined,
  carId: string,
): readonly string[] | undefined {
  return zones?.get(carId);
}
