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
  type DispatcherProfiles,
  type ElevatorSpecs,
  type ResolvedBuilding,
  type TrafficProfiles,
} from '@elevator-sim/core/browser';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';

import { restrictedFloorIds } from '../access/zoning.js';
import { parseCampaign } from '../campaign/parse.js';
import type { Campaign } from '../campaign/types.js';
import { validatePublishedGoalRates, type PublishedGoalRates } from '../scenario/published.js';

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
  /**
   * The whole of `data/dispatcher-profiles.json`, **not** its `profiles` array.
   *
   * It was the array until T75, and the difference is the file-level `patternSwitching` block:
   * `SimulationConfig.dispatcherProfiles` is what `Simulation` turns into a weight-set library
   * through `weightSetSourceFrom`, and an array cannot satisfy it. So a profile could author
   * `"selection": {"policy": "fuzzy"}`, `parseDispatcherProfiles` would accept it here, and
   * pressing **Run** would refuse it **by name** — the safe failure, and still the thirteenth
   * instance of a behaviour that is configurable, validated and unreachable from the surface that
   * needs it (`DECISIONS.md` § D153's own known-limitations paragraph).
   *
   * Named for its file, as {@link BrowserResources.trafficProfiles} and
   * {@link BrowserResources.elevatorSpecs} already are; § D153 decision 1 argues the naming, and
   * the array was the odd one out. Readers that want the list say `.profiles`.
   */
  readonly dispatcherProfiles: DispatcherProfiles;
  readonly buildings: readonly ResolvedBuilding[];
  /** The same buildings, with the document each was parsed from. */
  readonly entries: readonly BuildingEntry[];
  /** Declared traffic-profile ids, so the editor cross-checks `trafficProfile` as the loader does. */
  readonly trafficProfileIds: ReadonlySet<string>;
  readonly warnings: readonly string[];
}

/**
 * Fetch and parse one JSON file, **naming the path in every failure mode** — `UX.md` `RV-17`.
 *
 * Only the `!response.ok` branch used to name it, and driving `RV-17` for the first time found
 * that on this dev server that branch is the one a missing file does *not* take. Vite's HTML
 * fallback answers any request whose `Accept` includes `* / *` — which is what `fetch()` sends —
 * with `index.html` and a **200**, so deleting `data/elevator-specs.json` produced
 *
 * ```text
 * could not load data/: Unexpected token '<', "<!doctype "... is not valid JSON
 * ```
 *
 * — a true sentence about a file it declined to name, for a 404 it declined to call a 404. A
 * network failure (`TypeError: Failed to fetch`) named no path either. All three paths now do,
 * and the HTML-for-JSON case says what it means, because a reader who has just seen this needs to
 * know a file is missing rather than malformed.
 */
async function fetchJson(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch (cause) {
    throw new Error(`could not fetch ${path}: ${describe(cause)}`, { cause });
  }
  if (!response.ok) {
    throw new Error(`could not fetch ${path}: ${String(response.status)} ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type') ?? 'no content-type';
  try {
    return await response.json();
  } catch (cause) {
    const html = contentType.includes('text/html');
    throw new Error(
      `${path} did not parse as JSON: ${describe(cause)} (the server answered ${String(response.status)} ${contentType}` +
        `${html ? ', which is what this dev server sends when the file is missing from data/' : ''})`,
      { cause },
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    dispatcherProfiles: dispatchers,
    buildings,
    entries,
    trafficProfileIds,
    warnings: [...warnings, ...buildings.flatMap((b) => b.warnings.map((w) => w.message))],
  };
}

/* -------------------------------------------------------------------------- *
 * The campaign — docs/10 § 5, W5
 * -------------------------------------------------------------------------- */

/**
 * `data/campaign.json` and `data/scenario-goals.json`, fetched, cross-checked and parsed.
 *
 * **Deliberately not part of {@link loadBrowserResources}.** That function is what
 * `dev/batchWorker.ts` calls on every worker start, and a batch worker has no use for a campaign;
 * folding two more fetches into it would make every batch pay for a surface it does not touch.
 * The Campaign panel is the only caller, and it calls this once.
 *
 * The published goal table is validated **before** the campaign is parsed against it, because a
 * campaign checked against a malformed table would be checked against nothing.
 */
export async function loadCampaign(resources: BrowserResources): Promise<LoadedCampaign> {
  const [campaignRaw, publishedRaw] = await Promise.all([
    fetchJson('/campaign.json'),
    fetchJson('/scenario-goals.json'),
  ]);

  const published = publishedRaw as PublishedGoalRates;
  const tableViolations = validatePublishedGoalRates(published);
  if (tableViolations.length > 0) {
    throw new Error(
      `data/scenario-goals.json is not a valid goal table, so no campaign can be checked ` +
        `against it:\n  ${tableViolations.join('\n  ')}`,
    );
  }

  const space = collectSearchSpace();
  const dimensionHelp = new Map<string, string>();
  for (const parameter of space.parameters) {
    if (parameter.description !== undefined) dimensionHelp.set(parameter.id, parameter.description);
  }

  const campaign = parseCampaign(campaignRaw, {
    published,
    // The one statement anywhere about what a dimension may be, and it is derived here.
    dimensionIds: space.ids,
    profileIds: new Set(resources.dispatcherProfiles.profiles.map((profile) => profile.id)),
    restrictedFloorIdsByBuilding: new Map(
      resources.buildings.map((building) => [
        building.id,
        restrictedFloorIds(
          building.floors.map((floor) => floor.id),
          building.accessZones,
        ),
      ]),
    ),
  });

  return { campaign, published, space, dimensionHelp };
}

export interface LoadedCampaign {
  readonly campaign: Campaign;
  readonly published: PublishedGoalRates;
  readonly space: SearchSpace;
  readonly dimensionHelp: ReadonlyMap<string, string>;
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
