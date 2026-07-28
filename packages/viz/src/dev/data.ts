/**
 * Loading `data/` in a browser.
 *
 * `core`'s `loadConfig` reads a directory with `node:fs`, which a browser cannot do — and that
 * is by design: `config/loader.ts` is the only file in the config module that imports `node:`
 * anything, precisely so a browser build can use the pure `parseBuilding`/`resolveBuilding`
 * path instead. This file is that path, and it is the reason invariant 6's "the core must build
 * with `viz` absent" has a matching property in the other direction: `viz` uses `core` through
 * its published, fs-free surface.
 *
 * The three top-level JSON files are fetched by name. The buildings cannot be, because listing
 * a directory over HTTP is not a thing, so the Vite dev server serves a manifest at
 * `/__buildings.json` — see `vite.config.ts`. That plugin is dev-only tooling and never ships.
 */

import {
  crossCheckDispatcherProfiles,
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type BuildingConfig,
  type DispatcherProfile,
  type ElevatorSpecs,
  type ResolvedBuilding,
  type TrafficProfiles,
} from '@elevator-sim/core';

/**
 * A building as both the runner and the editor need it.
 *
 * The runner needs the {@link ResolvedBuilding}; the editor needs the **authored** document,
 * because `ResolvedBuilding` is a one-way projection — floor ranges are already expanded, cars
 * already carry their class's defaults, and re-serialising one would produce a file that is a
 * legal building but not the file anybody wrote. `ED-T9` asks for a round trip through the same
 * JSON `loadConfig` reads, and that is what {@link BuildingEntry.config} is.
 */
export interface BuildingEntry {
  readonly file: string;
  readonly config: BuildingConfig;
  readonly resolved: ResolvedBuilding;
}

export interface BrowserResources {
  readonly elevatorSpecs: ElevatorSpecs;
  readonly trafficProfiles: TrafficProfiles;
  readonly dispatcherProfiles: readonly DispatcherProfile[];
  readonly buildings: readonly ResolvedBuilding[];
  /** The same buildings, with the document each was parsed from. */
  readonly entries: readonly BuildingEntry[];
  /** Declared traffic-profile ids, so the editor cross-checks `trafficProfile` as the loader does. */
  readonly trafficProfileIds: ReadonlySet<string>;
  readonly warnings: readonly string[];
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`could not fetch ${path}: ${String(response.status)} ${response.statusText}`);
  }
  return response.json();
}

/** Everything a run needs, fetched and validated. Throws `ConfigError` on invalid data. */
export async function loadBrowserResources(): Promise<BrowserResources> {
  const [specsRaw, trafficRaw, dispatchersRaw, manifestRaw] = await Promise.all([
    fetchJson('/elevator-specs.json'),
    fetchJson('/traffic-profiles.json'),
    fetchJson('/dispatcher-profiles.json'),
    fetchJson('/__buildings.json'),
  ]);

  const elevatorSpecs = parseElevatorSpecs(specsRaw);
  const trafficProfiles = parseTrafficProfiles(trafficRaw);
  const dispatchers = parseDispatcherProfiles(dispatchersRaw);
  const warnings = crossCheckDispatcherProfiles(dispatchers, 'dispatcher-profiles.json').map(
    (warning) => warning.message,
  );

  const trafficProfileIds = new Set(trafficProfiles.profiles.map((profile) => profile.id));

  const manifest = manifestRaw as { readonly files: readonly { name: string; data: unknown }[] };
  const entries: BuildingEntry[] = manifest.files.map((entry) => {
    const config = parseBuilding(entry.data, entry.name);
    return {
      file: entry.name,
      config,
      resolved: resolveBuilding(config, elevatorSpecs, { file: entry.name, trafficProfileIds }),
    };
  });
  const buildings = entries.map((entry) => entry.resolved);

  return {
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: dispatchers.profiles,
    buildings,
    entries,
    trafficProfileIds,
    warnings: [...warnings, ...buildings.flatMap((b) => b.warnings.map((w) => w.message))],
  };
}

/**
 * Resolve a building the editor produced, against the same specs and profile ids the loader used.
 *
 * A thin wrapper on purpose. `resolveBuilding` is the only thing in the project allowed to decide
 * what a building means, and an edited building must go through exactly the same door as a
 * shipped one — otherwise "Run this building" would be running something the loader would have
 * rejected, which is the one outcome `ED-T8` exists to rule out.
 */
export function resolveEdited(
  resources: BrowserResources,
  building: BuildingConfig,
): ResolvedBuilding {
  return resolveBuilding(building, resources.elevatorSpecs, {
    file: `${building.id}.json`,
    trafficProfileIds: resources.trafficProfileIds,
  });
}
