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
  type DispatcherProfile,
  type ElevatorSpecs,
  type ResolvedBuilding,
  type TrafficProfiles,
} from '@elevator-sim/core';

export interface BrowserResources {
  readonly elevatorSpecs: ElevatorSpecs;
  readonly trafficProfiles: TrafficProfiles;
  readonly dispatcherProfiles: readonly DispatcherProfile[];
  readonly buildings: readonly ResolvedBuilding[];
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

  const manifest = manifestRaw as { readonly files: readonly { name: string; data: unknown }[] };
  const buildings = manifest.files.map((entry) =>
    resolveBuilding(parseBuilding(entry.data, entry.name), elevatorSpecs, { file: entry.name }),
  );

  return {
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: dispatchers.profiles,
    buildings,
    warnings: [...warnings, ...buildings.flatMap((b) => b.warnings.map((w) => w.message))],
  };
}
