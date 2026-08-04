/**
 * What Free Play can offer, **derived from the loaded configuration** rather than written down.
 *
 * § D213 is the reason this is a derivation and not a list. Three buildings landed in one change and
 * five separate hard-coded lists had to be widened by hand to notice — two of them guards that could
 * no longer see what they were guarding, including one whose entire job was naming what a table
 * missed and which computed that list over the table's own contents. A menu built from a literal
 * would be the sixth, and it would fail in the worst way available: silently offering fewer
 * buildings than ship, with nothing red.
 *
 * The test beside this file asserts the derivation against `data/` in **both** directions, so a
 * building that lands and a building that leaves are each a failure rather than a quiet omission.
 */

import type { CatalogueEntry, MenuCatalogue } from './types.js';

/* -------------------------------------------------------------------------- *
 * The narrow inputs
 * -------------------------------------------------------------------------- */

/**
 * The parts of a loaded configuration this module reads.
 *
 * Structural rather than `LoadedConfig`, for two reasons. It keeps the menu testable with a
 * three-line fixture instead of a whole `data/` load; and it stops a panel reaching through the
 * catalogue into the simulation model to render derived facts no test covers — the catalogue's job
 * is an id and a label, and the type says so.
 */
export interface CatalogueSource {
  /**
   * An array rather than the `buildingsById` map, so the one derivation serves both callers:
   * `LoadedConfig` (the server and the tests) and `BrowserResources` (the shell). Two adapters for
   * one list is how the menu and the runner would come to disagree about what ships.
   */
  readonly buildings: readonly CatalogueBuilding[];
  readonly dispatcherProfiles: { readonly profiles: readonly CatalogueProfile[] };
  readonly trafficProfiles: { readonly demandTemplates: readonly CatalogueTemplate[] };
}

export interface CatalogueBuilding {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly totalPopulation: number;
  readonly floors: readonly unknown[];
  readonly banks: readonly { readonly cars: readonly unknown[] }[];
}

export interface CatalogueProfile {
  readonly id: string;
  readonly name: string;
  readonly role?: string | undefined;
}

export interface CatalogueTemplate {
  readonly id: string;
  readonly name: string;
  readonly recommended?: boolean | undefined;
}

/* -------------------------------------------------------------------------- *
 * The derivation
 * -------------------------------------------------------------------------- */

/** `21 floors · 1,710 people · 4 cars` — the line a player picks a building by. */
export function buildingDetail(building: CatalogueBuilding): string {
  const cars = building.banks.reduce((total, bank) => total + bank.cars.length, 0);
  const plural = (count: number, one: string, many: string): string =>
    `${count.toLocaleString('en-GB')} ${count === 1 ? one : many}`;
  return [
    plural(building.floors.length, 'floor', 'floors'),
    plural(building.totalPopulation, 'person', 'people'),
    plural(cars, 'car', 'cars'),
  ].join(' · ');
}

/**
 * Every building, dispatcher and demand template the loaded configuration ships.
 *
 * **Nothing is filtered.** A dispatcher that performs badly is a choice a player is allowed to make
 * — that is what Free Play is — and hiding one would be this repository's own
 * *"a profile that fails to beat the baseline is a result about that profile"* rule broken at the
 * one surface where the player is the experimenter.
 *
 * Order is the configuration's own, so the menu reads in the same order as the files it came from.
 */
export function catalogueOf(source: CatalogueSource): MenuCatalogue {
  const buildings: CatalogueEntry[] = source.buildings.map((building) => ({
    id: building.id,
    name: building.name,
    detail: buildingDetail(building),
  }));

  const dispatchers: CatalogueEntry[] = source.dispatcherProfiles.profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    ...(profile.role === undefined ? {} : { detail: profile.role }),
  }));

  const demandTemplates: CatalogueEntry[] = source.trafficProfiles.demandTemplates.map((template) => ({
    id: template.id,
    name: template.name,
    // `recommended` is the template record's own field and it means something specific: whether the
    // shape supports a confidence interval across replications. Surfaced rather than dropped,
    // because a player choosing `constant-iso` for a scored run should be told it is a
    // cross-checking shape before the board tells them afterwards.
    ...(template.recommended === true ? { detail: 'recommended' } : { detail: 'cross-checking' }),
  }));

  return Object.freeze({
    buildings: Object.freeze(buildings),
    dispatchers: Object.freeze(dispatchers),
    demandTemplates: Object.freeze(demandTemplates),
  });
}
